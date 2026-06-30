"use client";

import { Camera, CircleStop, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FauMetric,
  Landmark,
  computeFauMetrics,
  getOverallSymmetryScore,
  getRelevantLandmarkIndexes,
  summarizeMetricSamples
} from "@/src/lib/facs";
import { createRecorder } from "@/src/lib/recording";
import { HeadPose, PoseQuality, emptyQuality, getPoseQuality, rotationMatrixToEuler } from "@/src/lib/pose";

type FaceLandmarkerResult = {
  faceLandmarks?: Landmark[][];
  facialTransformationMatrixes?: unknown[];
};

type FaceLandmarkerInstance = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => FaceLandmarkerResult;
  close?: () => void;
};

export type CaptureResult = {
  durationMs: number;
  qualityScore: number;
  overallSymmetryScore: number;
  metrics: FauMetric[];
  videoBlob: Blob | null;
};

type CaptureState = "idle" | "loading" | "live" | "recording" | "processing" | "error";
type AlignmentQuality = {
  isAligned: boolean;
  label: string;
};
type PoseGate = {
  isStable: boolean;
  label: string;
};

const MODEL_PATH = "/models/face_landmarker.task";
const RECORDING_MS = 12000;
const MAX_OFF_ALIGNMENT_MS = 450;
const STRICT_POSE_THRESHOLDS = {
  yaw: 2.5,
  pitch: 7,
  roll: 2.5
};
const emptyAlignment: AlignmentQuality = { isAligned: false, label: "Center face" };
const emptyPoseGate: PoseGate = { isStable: false, label: "Straighten face" };

export function CaptureView({ onCancel, onComplete }: { onCancel: () => void; onComplete: (result: CaptureResult) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const metricsSamplesRef = useRef<FauMetric[][]>([]);
  const qualitySamplesRef = useRef<number[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const validRecordingMsRef = useRef<number>(0);
  const lastFrameAtRef = useRef<number>(0);
  const offAlignmentMsRef = useRef<number>(0);
  const recorderRef = useRef<ReturnType<typeof createRecorder>>(null);
  const lastVideoTimeRef = useRef(-1);

  const [state, setState] = useState<CaptureState>("idle");
  const [status, setStatus] = useState("Camera is off");
  const [metrics, setMetrics] = useState<FauMetric[]>([]);
  const [pose, setPose] = useState<HeadPose | null>(null);
  const [quality, setQuality] = useState<PoseQuality>(emptyQuality);
  const [alignment, setAlignment] = useState<AlignmentQuality>(emptyAlignment);
  const [poseGate, setPoseGate] = useState<PoseGate>(emptyPoseGate);
  const [elapsedMs, setElapsedMs] = useState(0);

  const isRecording = state === "recording";
  const isCaptureReady = poseGate.isStable && alignment.isAligned && metrics.length > 0;
  const progress = isRecording ? Math.min(1, elapsedMs / RECORDING_MS) : 0;
  const overallScore = useMemo(() => getOverallSymmetryScore(metrics), [metrics]);

  const stopResources = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopResources();
      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
    };
  }, [stopResources]);

  const startCamera = useCallback(async () => {
    setState("loading");
    setStatus("Loading face model");

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

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error("Video is unavailable.");
      }

      video.srcObject = stream;
      await video.play();
      setState("live");
      setStatus("Center your face");
      runAnalysisLoop();
    } catch (error) {
      setState("error");
      setStatus(error instanceof Error ? error.message : "Camera is unavailable");
    }
  }, []);

  const finishRecording = useCallback(async () => {
    if (recordingStartedAtRef.current === 0) {
      return;
    }

    const startedAt = recordingStartedAtRef.current;
    recordingStartedAtRef.current = 0;
    const validDurationMs = validRecordingMsRef.current;
    validRecordingMsRef.current = 0;
    setState("processing");
    setStatus("Preparing review");
    recorderRef.current?.stop();
    const videoBlob = (await recorderRef.current?.done) ?? null;
    const summary = summarizeMetricSamples(metricsSamplesRef.current);

    if (!summary) {
      setState("live");
      setStatus("No face values captured. Try again.");
      return;
    }

    stopResources();
    onComplete({
      durationMs: Math.round(validDurationMs || performance.now() - startedAt),
      qualityScore: Math.round(average(qualitySamplesRef.current)),
      overallSymmetryScore: summary.overallSymmetryScore,
      metrics: summary.metrics,
      videoBlob
    });
  }, [onComplete, stopResources]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    metricsSamplesRef.current = [];
    qualitySamplesRef.current = [];
    offAlignmentMsRef.current = 0;
    validRecordingMsRef.current = 0;
    lastFrameAtRef.current = performance.now();
    recordingStartedAtRef.current = performance.now();
    recorderRef.current = createRecorder(stream);
    recorderRef.current?.recorder.start();
    setElapsedMs(0);
    setState("recording");
    setStatus("Hold still");
  }, []);

  const failRecording = useCallback((message: string) => {
    recordingStartedAtRef.current = 0;
    recorderRef.current?.stop();
    metricsSamplesRef.current = [];
    qualitySamplesRef.current = [];
    offAlignmentMsRef.current = 0;
    validRecordingMsRef.current = 0;
    setElapsedMs(0);
    setState("live");
    setStatus(message);
  }, []);

  const runAnalysisLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      const context = canvas?.getContext("2d");

      if (!video || !canvas || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      syncCanvasSize(canvas, video);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (landmarker && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        let result: FaceLandmarkerResult;
        try {
          result = withMutedMediapipeLogs(() => landmarker.detectForVideo(video, performance.now()));
        } catch {
          setStatus("Analysis paused. Hold still.");
          animationFrameRef.current = requestAnimationFrame(draw);
          return;
        }

        const faceLandmarks = result.faceLandmarks?.[0];
        const nextPose = rotationMatrixToEuler(result.facialTransformationMatrixes?.[0]);
        const nextQuality = getPoseQuality(nextPose);
        const nextPoseGate = getStrictPoseGate(nextPose);

        if (faceLandmarks?.length) {
          const nextMetrics = computeFauMetrics(faceLandmarks, nextPose);
          const nextAlignment = getAlignmentQuality(faceLandmarks);
          const ready = nextPoseGate.isStable && nextAlignment.isAligned;
          drawLandmarkOverlay(context, faceLandmarks, nextMetrics);
          setMetrics(nextMetrics);
          setPose(nextPose);
          setQuality(nextQuality);
          setAlignment(nextAlignment);
          setPoseGate(nextPoseGate);
          setStatus(getCaptureStatus(nextPoseGate, nextAlignment, recordingStartedAtRef.current > 0));

          if (recordingStartedAtRef.current > 0 && validRecordingMsRef.current <= RECORDING_MS) {
            const now = performance.now();
            const frameDelta = Math.min(now - lastFrameAtRef.current, 250);
            lastFrameAtRef.current = now;

            if (ready) {
              metricsSamplesRef.current.push(nextMetrics);
              qualitySamplesRef.current.push(nextQuality.score);
              validRecordingMsRef.current = Math.min(RECORDING_MS, validRecordingMsRef.current + frameDelta);
              setElapsedMs(validRecordingMsRef.current);
              offAlignmentMsRef.current = Math.max(0, offAlignmentMsRef.current - frameDelta);
            } else {
              offAlignmentMsRef.current += frameDelta;
              if (offAlignmentMsRef.current > MAX_OFF_ALIGNMENT_MS) {
                failRecording("Head moved. Retake while yaw, pitch, and roll stay green.");
                animationFrameRef.current = requestAnimationFrame(draw);
                return;
              }
            }
          }
        } else {
          setQuality(emptyQuality);
          setAlignment(emptyAlignment);
          setPoseGate(emptyPoseGate);
          setPose(null);
          setStatus("No face detected");
        }
      }

      if (recordingStartedAtRef.current > 0) {
        if (validRecordingMsRef.current >= RECORDING_MS) {
          finishRecording();
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);
  }, [failRecording, finishRecording]);

  return (
    <section className="capture-screen">
      <div className="capture-topbar">
        <button className="icon-button translucent" title="Cancel" type="button" onClick={onCancel}>
          <X size={20} />
        </button>
        <div className={`quality-pill ${isCaptureReady ? "ready" : ""}`}>
          <span>{quality.score}</span>
          {status}
        </div>
      </div>

      <div className="camera-view">
        <video ref={videoRef} muted playsInline />
        <canvas ref={canvasRef} />
        <FaceAlignmentGuide isReady={isCaptureReady} isRecording={isRecording} />
        {state === "idle" && <EmptyCamera onStart={startCamera} />}
        {state === "loading" && <div className="capture-message">Loading...</div>}
        {state === "error" && (
          <div className="capture-message">
            <strong>Camera unavailable</strong>
            <span>{status}</span>
            <button className="button secondary" type="button" onClick={startCamera}>
              <RotateCcw size={16} />
              Try again
            </button>
          </div>
        )}
      </div>

      <div className="capture-bottom">
        <div className="score-strip">
          <div>
            <span>Live score</span>
            <strong>{isCaptureReady ? overallScore : "--"}</strong>
          </div>
          <div>
            <span>Yaw</span>
            <strong className={poseGate.isStable ? "ok" : "warn"}>{pose ? pose.yaw.toFixed(1) : "--"}</strong>
          </div>
          <div className="wide">
            <span>Pitch / Roll</span>
            <strong className={poseGate.isStable ? "ok" : "warn"}>{pose ? `${pose.pitch.toFixed(1)} / ${pose.roll.toFixed(1)}` : "--"}</strong>
          </div>
        </div>
        <div className={`alignment-banner ${isCaptureReady ? "ready" : ""}`}>
          {state === "idle"
            ? "Start camera to begin alignment."
            : isCaptureReady
              ? "Aligned. Timer only advances while this stays green."
              : poseGate.isStable
                ? alignment.label
                : poseGate.label}
        </div>

        <div className="recording-progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>

        {state === "recording" ? (
          <button className="button danger large full" type="button" onClick={finishRecording}>
            <CircleStop size={18} />
            Stop recording
          </button>
        ) : (
          <button className="button primary large full" disabled={state !== "live" || !isCaptureReady} type="button" onClick={startRecording}>
            <Camera size={18} />
            {state === "idle" ? "Start camera first" : isCaptureReady ? "Record 12 second check-in" : "Align face to start"}
          </button>
        )}
      </div>
    </section>
  );
}

function FaceAlignmentGuide({ isReady, isRecording }: { isReady: boolean; isRecording: boolean }) {
  return (
    <div className={`face-guide ${isReady ? "ready" : ""} ${isRecording ? "recording" : ""}`} aria-hidden="true">
      <div className="face-guide-oval" />
      <div className="face-guide-cross horizontal" />
      <div className="face-guide-cross vertical" />
    </div>
  );
}

function EmptyCamera({ onStart }: { onStart: () => void }) {
  return (
    <div className="capture-message">
      <strong>Daily check-in</strong>
      <span>Use the front camera and keep your face centered.</span>
      <button className="button primary" type="button" onClick={onStart}>
        <Camera size={16} />
        Start camera
      </button>
    </div>
  );
}

async function createFaceLandmarker(): Promise<FaceLandmarkerInstance> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await withMutedMediapipeLogs(() =>
    FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm")
  );

  return withMutedMediapipeLogs(
    () =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true
      }) as Promise<FaceLandmarkerInstance>
  );
}

function drawLandmarkOverlay(context: CanvasRenderingContext2D, landmarks: Landmark[], metrics: FauMetric[]) {
  const metricMap = new Map(metrics.map((metric) => [metric.id, metric]));
  const points = getRelevantLandmarkIndexes();

  context.save();
  context.lineWidth = 1.5;

  for (const point of points) {
    const landmark = landmarks[point.index];
    const metric = metricMap.get(point.metricId);
    const isDominant = metric?.affectedSide === point.side;
    const isBalanced = metric?.affectedSide === "balanced";
    context.beginPath();
    context.fillStyle = isBalanced ? "#e7b84a" : isDominant ? "#d96f55" : "#1b8a72";
    context.strokeStyle = "rgba(255, 255, 255, 0.8)";
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

function getAlignmentQuality(landmarks: Landmark[]): AlignmentQuality {
  const bounds = getFaceBounds(landmarks);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const centerOffsetX = Math.abs(centerX - 0.5);
  const centerOffsetY = Math.abs(centerY - 0.48);

  if (centerOffsetX > 0.1) {
    return { isAligned: false, label: centerX < 0.5 ? "Move right into the outline" : "Move left into the outline" };
  }

  if (centerOffsetY > 0.13) {
    return { isAligned: false, label: centerY < 0.48 ? "Move lower in the frame" : "Move higher in the frame" };
  }

  if (height < 0.34 || width < 0.22) {
    return { isAligned: false, label: "Move closer to the camera" };
  }

  if (height > 0.72 || width > 0.58) {
    return { isAligned: false, label: "Move back slightly" };
  }

  return { isAligned: true, label: "Aligned" };
}

function getFaceBounds(landmarks: Landmark[]) {
  return landmarks.reduce(
    (bounds, landmark) => ({
      minX: Math.min(bounds.minX, landmark.x),
      maxX: Math.max(bounds.maxX, landmark.x),
      minY: Math.min(bounds.minY, landmark.y),
      maxY: Math.max(bounds.maxY, landmark.y)
    }),
    { minX: 1, maxX: 0, minY: 1, maxY: 0 }
  );
}

function getStrictPoseGate(pose: HeadPose | null): PoseGate {
  if (!pose) {
    return emptyPoseGate;
  }

  if (Math.abs(pose.yaw) > STRICT_POSE_THRESHOLDS.yaw) {
    return { isStable: false, label: pose.yaw < 0 ? "Turn slightly right" : "Turn slightly left" };
  }

  if (Math.abs(pose.roll) > STRICT_POSE_THRESHOLDS.roll) {
    return { isStable: false, label: pose.roll < 0 ? "Tilt head clockwise" : "Tilt head counterclockwise" };
  }

  if (Math.abs(pose.pitch) > STRICT_POSE_THRESHOLDS.pitch) {
    return { isStable: false, label: pose.pitch < 0 ? "Lift chin slightly" : "Lower chin slightly" };
  }

  return { isStable: true, label: "Pose stable" };
}

function getCaptureStatus(poseGate: PoseGate, alignment: AlignmentQuality, isRecording: boolean) {
  if (!poseGate.isStable) {
    return isRecording ? "Hold straight" : "Straighten face";
  }

  if (!alignment.isAligned) {
    return alignment.label;
  }

  return isRecording ? "Hold still" : "Ready";
}

function withMutedMediapipeLogs<T>(callback: () => T): T {
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const shouldMute = (args: unknown[]) =>
    args.some((arg) => typeof arg === "string" && /XNNPACK|FaceBlendshapesGraph|OpenGL error checking/i.test(arg));

  console.info = (...args: unknown[]) => {
    if (!shouldMute(args)) {
      originalInfo(...args);
    }
  };
  console.warn = (...args: unknown[]) => {
    if (!shouldMute(args)) {
      originalWarn(...args);
    }
  };
  console.error = (...args: unknown[]) => {
    if (!shouldMute(args)) {
      originalError(...args);
    }
  };

  try {
    const result = callback();
    if (result instanceof Promise) {
      return result.finally(() => {
        console.info = originalInfo;
        console.warn = originalWarn;
        console.error = originalError;
      }) as T;
    }

    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    return result;
  } catch (error) {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    throw error;
  }
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
