"use client";

import {
  Activity,
  Camera,
  CameraOff,
  CirclePause,
  Download,
  Gauge,
  Play,
  RotateCcw,
  Save,
  ScanFace,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXERCISES,
  FauMetric,
  Landmark,
  SessionSnapshot,
  buildSessionSnapshot,
  computeFauMetrics,
  getActiveMetrics,
  getOverallMovementMagnitude,
  getOverallSymmetryScore,
  getRelevantLandmarkIndexes
} from "@/src/lib/facs";
import { HeadPose, PoseQuality, getPoseQuality, rotationMatrixToEuler } from "@/src/lib/pose";

type CameraState = "idle" | "loading" | "live" | "paused" | "error";

type FaceLandmarkerResult = {
  faceLandmarks?: Landmark[][];
  facialTransformationMatrixes?: unknown[];
};

type FaceLandmarkerInstance = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => FaceLandmarkerResult;
  close?: () => void;
};

const MODEL_PATH = "/models/face_landmarker.task";
const SESSION_STORAGE_KEY = "symmetra:sessions:v1";
const emptyQuality: PoseQuality = { isFrontal: false, score: 0, label: "Adjust" };

export function FacialAnalysisApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const baselineRef = useRef<Landmark[] | null>(null);
  const latestLandmarksRef = useRef<Landmark[] | null>(null);
  const metricsRef = useRef<FauMetric[] | null>(null);
  const isAnalyzingRef = useRef(false);
  const lastUiUpdateRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [statusMessage, setStatusMessage] = useState("Camera off");
  const [selectedExercise, setSelectedExercise] = useState(EXERCISES[0].id);
  const [metrics, setMetrics] = useState<FauMetric[] | null>(null);
  const [pose, setPose] = useState<HeadPose | null>(null);
  const [quality, setQuality] = useState<PoseQuality>(emptyQuality);
  const [baselineLandmarks, setBaselineLandmarks] = useState<Landmark[] | null>(null);
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);

  const activeMetrics = useMemo(() => (metrics ? getActiveMetrics(metrics, selectedExercise) : []), [metrics, selectedExercise]);
  const activeMetricIds = useMemo(
    () => EXERCISES.find((item) => item.id === selectedExercise)?.metricIds ?? [],
    [selectedExercise]
  );
  const overallSymmetry = activeMetrics.length ? getOverallSymmetryScore(activeMetrics) : 0;
  const movementMagnitude = activeMetrics.length ? getOverallMovementMagnitude(activeMetrics) : null;
  const baselineReady = Boolean(baselineLandmarks);
  const isCameraLive = cameraState === "live" || cameraState === "paused";
  const isAnalyzing = cameraState === "live";

  const stopCameraResources = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    isAnalyzingRef.current = cameraState === "live";
  }, [cameraState]);

  useEffect(() => {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      setSessions(JSON.parse(stored) as SessionSnapshot[]);
    } catch {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    return () => {
      stopCameraResources();
      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
    };
  }, [stopCameraResources]);

  const startCamera = useCallback(async () => {
    setCameraState("loading");
    setStatusMessage("Loading model");

    try {
      if (!landmarkerRef.current) {
        landmarkerRef.current = await createFaceLandmarker();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      mediaStreamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element is unavailable.");
      }

      video.srcObject = stream;
      await video.play();
      setCameraState("live");
      setStatusMessage("Live");
      runAnalysisLoop();
    } catch (error) {
      setCameraState("error");
      setStatusMessage(error instanceof Error ? error.message : "Camera unavailable");
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopCameraResources();
    latestLandmarksRef.current = null;
    metricsRef.current = null;
    setCameraState("idle");
    setStatusMessage("Camera off");
    setMetrics(null);
    setPose(null);
    setQuality(emptyQuality);
    clearCanvas(canvasRef.current);
  }, [stopCameraResources]);

  const togglePause = useCallback(() => {
    setCameraState((current) => {
      if (current === "live") {
        setStatusMessage("Paused");
        return "paused";
      }
      if (current === "paused") {
        setStatusMessage("Live");
        return "live";
      }
      return current;
    });
  }, []);

  const setBaselineFromFrame = useCallback(() => {
    const landmarks = latestLandmarksRef.current;
    if (!landmarks) {
      return;
    }

    const cloned = cloneLandmarks(landmarks);
    baselineRef.current = cloned;
    setBaselineLandmarks(cloned);

    const updated = computeFauMetrics(landmarks, cloned);
    metricsRef.current = updated;
    setMetrics(updated);
  }, []);

  const resetBaseline = useCallback(() => {
    baselineRef.current = null;
    setBaselineLandmarks(null);

    const landmarks = latestLandmarksRef.current;
    if (landmarks) {
      const updated = computeFauMetrics(landmarks, null);
      metricsRef.current = updated;
      setMetrics(updated);
    }
  }, []);

  const saveSession = useCallback(() => {
    const currentMetrics = activeMetrics.length ? activeMetrics : metricsRef.current;
    if (!currentMetrics?.length) {
      return;
    }

    const exerciseLabel = EXERCISES.find((item) => item.id === selectedExercise)?.label ?? selectedExercise;
    const snapshot = buildSessionSnapshot(exerciseLabel, quality.score, currentMetrics);
    setSessions((current) => [snapshot, ...current].slice(0, 24));
  }, [activeMetrics, quality.score, selectedExercise]);

  const exportSessions = useCallback(() => {
    const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `symmetra-sessions-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [sessions]);

  const runAnalysisLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (!video || !canvas) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const context = canvas.getContext("2d");
      if (!context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      syncCanvasSize(canvas, video);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (landmarker && isAnalyzingRef.current && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;

        try {
          const result = landmarker.detectForVideo(video, performance.now());
          const faceLandmarks = result.faceLandmarks?.[0];
          const headPose = rotationMatrixToEuler(result.facialTransformationMatrixes?.[0]);
          const poseQuality = getPoseQuality(headPose);

          if (faceLandmarks?.length) {
            const clonedLandmarks = cloneLandmarks(faceLandmarks);
            const nextMetrics = computeFauMetrics(clonedLandmarks, baselineRef.current);
            latestLandmarksRef.current = clonedLandmarks;
            metricsRef.current = nextMetrics;
            drawLandmarkOverlay(context, clonedLandmarks, nextMetrics, activeMetricIds);

            const now = performance.now();
            if (now - lastUiUpdateRef.current > 160) {
              lastUiUpdateRef.current = now;
              setMetrics(nextMetrics);
              setPose(headPose);
              setQuality(poseQuality);
              setStatusMessage(poseQuality.isFrontal ? "Live" : "Adjust position");
            }
          } else {
            latestLandmarksRef.current = null;
            const now = performance.now();
            if (now - lastUiUpdateRef.current > 300) {
              lastUiUpdateRef.current = now;
              setMetrics(null);
              setPose(null);
              setQuality(emptyQuality);
              setStatusMessage("No face");
            }
          }
        } catch {
          setStatusMessage("Analysis paused");
        }
      } else if (metricsRef.current && latestLandmarksRef.current) {
        drawLandmarkOverlay(context, latestLandmarksRef.current, metricsRef.current, activeMetricIds);
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);
  }, [activeMetricIds]);

  useEffect(() => {
    if (isCameraLive) {
      runAnalysisLoop();
    }
  }, [isCameraLive, runAnalysisLoop, selectedExercise]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <ScanFace size={20} />
          </div>
          <div>
            <p className="eyebrow">Symmetra</p>
            <h1>This is an early-stage Proof of Concept under Active Development</h1>
            <h3>We are currently in stealth and appreciate any feedback</h3>
          </div>
        </div>

        <div className="topbar-actions">
          <StatusPill state={cameraState} message={statusMessage} />
          {!isCameraLive ? (
            <button className="button primary" type="button" onClick={startCamera}>
              <Camera size={17} />
              Start camera
            </button>
          ) : (
            <>
              <button className="icon-button" type="button" title={isAnalyzing ? "Pause analysis" : "Resume analysis"} onClick={togglePause}>
                {isAnalyzing ? <CirclePause size={18} /> : <Play size={18} />}
              </button>
              <button className="icon-button danger" type="button" title="Stop camera" onClick={stopCamera}>
                <CameraOff size={18} />
              </button>
            </>
          )}
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="left-rail">
          <Panel title="Capture">
            <div className="exercise-list" role="listbox" aria-label="Exercise">
              {EXERCISES.map((exercise) => (
                <button
                  className={`exercise-option ${selectedExercise === exercise.id ? "selected" : ""}`}
                  key={exercise.id}
                  type="button"
                  onClick={() => setSelectedExercise(exercise.id)}
                >
                  <span>{exercise.label}</span>
                  <span className="exercise-count">{exercise.metricIds.length}</span>
                </button>
              ))}
            </div>

            <div className="stacked-actions">
              <button className="button secondary" type="button" disabled={!latestLandmarksRef.current} onClick={setBaselineFromFrame}>
                <Gauge size={16} />
                Set baseline
              </button>
              <button className="button ghost" type="button" disabled={!baselineReady} onClick={resetBaseline}>
                <RotateCcw size={16} />
                Reset baseline
              </button>
            </div>
          </Panel>

          <Panel title="Position">
            <div className="quality-ring" style={{ "--score": quality.score } as React.CSSProperties}>
              <div>
                <strong>{quality.score}</strong>
                <span>{quality.label}</span>
              </div>
            </div>
            <dl className="pose-list">
              <PoseItem label="Yaw" value={pose?.yaw} />
              <PoseItem label="Pitch" value={pose?.pitch} />
              <PoseItem label="Roll" value={pose?.roll} />
            </dl>
          </Panel>
        </aside>

        <section className="camera-stage">
          <div className="video-frame">
            <video ref={videoRef} muted playsInline />
            <canvas ref={canvasRef} />
            {!isCameraLive && (
              <div className="empty-camera">
                <ScanFace size={34} />
                <span>Camera off</span>
              </div>
            )}
          </div>
        </section>

        <aside className="right-rail">
          <Panel title="Session">
            <div className="summary-grid">
              <SummaryTile icon={<Activity size={18} />} label="Symmetry" value={metrics ? `${overallSymmetry}` : "--"} unit="/100" />
              <SummaryTile
                icon={<Gauge size={18} />}
                label="Movement"
                value={movementMagnitude === null ? "--" : movementMagnitude.toFixed(1)}
                unit="%"
              />
            </div>
            <div className="baseline-state">
              <span className={baselineReady ? "dot ready" : "dot"} />
              <span>{baselineReady ? "Baseline active" : "Baseline needed"}</span>
            </div>
            <button className="button primary full" type="button" disabled={!activeMetrics.length} onClick={saveSession}>
              <Save size={16} />
              Save session
            </button>
          </Panel>

          <Panel title="Metrics">
            <div className="metric-list">
              {activeMetrics.length ? (
                activeMetrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)
              ) : (
                <div className="empty-panel">No active measurement</div>
              )}
            </div>
          </Panel>
        </aside>
      </section>

      <section className="history-band">
        <Panel title="Progress">
          <ProgressChart sessions={sessions} />
          <div className="history-actions">
            <button className="icon-button" type="button" title="Export sessions" disabled={!sessions.length} onClick={exportSessions}>
              <Download size={17} />
            </button>
            <button className="icon-button danger" type="button" title="Clear sessions" disabled={!sessions.length} onClick={() => setSessions([])}>
              <Trash2 size={17} />
            </button>
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">{title}</div>
      {children}
    </section>
  );
}

function StatusPill({ state, message }: { state: CameraState; message: string }) {
  return (
    <div className={`status-pill ${state}`}>
      <span />
      {message}
    </div>
  );
}

function PoseItem({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{typeof value === "number" ? `${value.toFixed(1)} deg` : "--"}</dd>
    </div>
  );
}

function SummaryTile({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="summary-tile">
      <div className="summary-icon">{icon}</div>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}

function MetricCard({ metric }: { metric: FauMetric }) {
  const correctedBalance = metric.baselineCorrectedBalance ?? metric.balance;
  return (
    <article className="metric-card">
      <div className="metric-heading">
        <div>
          <span>{metric.au}</span>
          <strong>{metric.label}</strong>
        </div>
        <SideBadge side={metric.affectedSide} />
      </div>
      <div className="metric-scale" aria-hidden="true">
        <span style={{ width: `${metric.symmetryScore}%` }} />
      </div>
      <dl className="metric-values">
        <div>
          <dt>Balance</dt>
          <dd>{formatSigned(correctedBalance)}</dd>
        </div>
        <div>
          <dt>Movement</dt>
          <dd>{metric.movementMagnitudePct === null ? "--" : `${metric.movementMagnitudePct.toFixed(1)}%`}</dd>
        </div>
      </dl>
    </article>
  );
}

function SideBadge({ side }: { side: FauMetric["affectedSide"] }) {
  const label = side === "balanced" ? "Balanced" : `${capitalize(side)} dominant`;
  return <span className={`side-badge ${side}`}>{label}</span>;
}

function ProgressChart({ sessions }: { sessions: SessionSnapshot[] }) {
  const points = sessions.slice(0, 10).reverse();
  if (!points.length) {
    return <div className="empty-panel">No saved sessions</div>;
  }

  const width = 680;
  const height = 150;
  const padding = 18;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const xFor = (index: number) => padding + (chartWidth * index) / Math.max(points.length - 1, 1);
  const yFor = (score: number) => padding + chartHeight - (chartHeight * score) / 100;
  const line = points.map((point, index) => `${xFor(index)},${yFor(point.symmetryScore)}`).join(" ");

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Saved session symmetry trend">
        <line className="chart-grid" x1={padding} x2={width - padding} y1={yFor(75)} y2={yFor(75)} />
        <line className="chart-grid" x1={padding} x2={width - padding} y1={yFor(50)} y2={yFor(50)} />
        <polyline className="chart-line" fill="none" points={line} />
        {points.map((point, index) => (
          <circle className="chart-point" cx={xFor(index)} cy={yFor(point.symmetryScore)} key={point.id} r="4" />
        ))}
      </svg>
      <div className="session-strip">
        {points.slice(-4).map((session) => (
          <div key={session.id}>
            <strong>{session.symmetryScore}</strong>
            <span>{session.exercise}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

async function createFaceLandmarker(): Promise<FaceLandmarkerInstance> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");

  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true
  }) as Promise<FaceLandmarkerInstance>;
}

function drawLandmarkOverlay(
  context: CanvasRenderingContext2D,
  landmarks: Landmark[],
  metrics: FauMetric[],
  activeMetricIds: string[]
) {
  const activeIds = activeMetricIds.length ? activeMetricIds : metrics.map((metric) => metric.id);
  const metricMap = new Map(metrics.map((metric) => [metric.id, metric]));
  const points = getRelevantLandmarkIndexes(activeIds);

  context.save();
  context.lineWidth = 1.5;

  for (const point of points) {
    const landmark = landmarks[point.index];
    const metric = metricMap.get(point.metricId);
    const isDominant = metric?.affectedSide === point.side;
    const isBalanced = metric?.affectedSide === "balanced";
    const color = isBalanced ? "#e7b84a" : isDominant ? "#e66f51" : "#1b9a77";
    context.beginPath();
    context.fillStyle = color;
    context.strokeStyle = "rgba(255, 255, 255, 0.78)";
    context.arc(landmark.x * context.canvas.width, landmark.y * context.canvas.height, 3, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  context.restore();
}

function syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext("2d");
  if (canvas && context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function cloneLandmarks(landmarks: Landmark[]) {
  return landmarks.map((landmark) => ({ x: landmark.x, y: landmark.y, z: landmark.z }));
}

function formatSigned(value: number) {
  if (Math.abs(value) < 0.005) {
    return "0.00";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
