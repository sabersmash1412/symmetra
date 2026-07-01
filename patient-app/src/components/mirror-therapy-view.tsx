"use client";

import { Camera, CameraOff, ChevronRight, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type StrongSide = "left" | "right";
type CameraState = "idle" | "loading" | "live" | "error";

const PRACTICE_PROMPTS = [
  "Soft smile",
  "Wide smile",
  "Gentle laugh",
  "Frown",
  "Eyebrow lift",
  "Lip pucker"
];

const PROMPT_SECONDS = 25;

export function MirrorTherapyView() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [status, setStatus] = useState("Camera off");
  const [strongSide, setStrongSide] = useState<StrongSide>("left");
  const [promptIndex, setPromptIndex] = useState(0);
  const [remainingSec, setRemainingSec] = useState(PROMPT_SECONDS);
  const [isPracticing, setIsPracticing] = useState(false);

  const prompt = PRACTICE_PROMPTS[promptIndex];
  const progress = 1 - remainingSec / PROMPT_SECONDS;
  const weakSide = strongSide === "left" ? "right" : "left";

  const stopCamera = useCallback(() => {
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

    setCameraState("idle");
    setStatus("Camera off");
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (!isPracticing) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSec((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setIsPracticing(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPracticing, promptIndex]);

  useEffect(() => {
    setRemainingSec(PROMPT_SECONDS);
    setIsPracticing(false);
  }, [promptIndex]);

  const startCamera = useCallback(async () => {
    setCameraState("loading");
    setStatus("Starting camera");

    try {
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
      setCameraState("live");
      setStatus("Mirror active");
      drawMirrorLoop();
    } catch (error) {
      setCameraState("error");
      setStatus(error instanceof Error ? error.message : "Camera unavailable");
    }
  }, []);

  const drawMirrorLoop = useCallback(() => {
    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");

      if (!video || !canvas || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      syncCanvasSize(canvas, video);
      drawMirroredFace(context, video, strongSide);
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(draw);
  }, [strongSide]);

  useEffect(() => {
    if (cameraState === "live") {
      drawMirrorLoop();
    }
  }, [cameraState, drawMirrorLoop, strongSide]);

  function nextPrompt() {
    setPromptIndex((current) => (current + 1) % PRACTICE_PROMPTS.length);
  }

  function resetPrompt() {
    setRemainingSec(PROMPT_SECONDS);
    setIsPracticing(false);
  }

  return (
    <section className="mirror-screen view-stack">
      <div className="mirror-hero">
        <div className="hero-topline">
          <span className={`sync-chip ${cameraState === "live" ? "ready" : ""}`}>
            <Sparkles size={15} />
            Mirror therapy
          </span>
          <span className="exercise-count">{status}</span>
        </div>
        <h1>Practice with a balanced reflection</h1>
        <p>The stronger side is mirrored onto the weaker side as a visual practice aid.</p>
      </div>

      <section className="mirror-stage">
        <video ref={videoRef} muted playsInline />
        <canvas ref={canvasRef} />
        <div className="mirror-live-overlay">
          <div className="mirror-prompt-pill">
            <div>
              <span>
                {promptIndex + 1}/{PRACTICE_PROMPTS.length}
              </span>
              <strong>{prompt}</strong>
            </div>
            <b>{remainingSec}s</b>
          </div>
          <div className="mirror-live-progress" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="mirror-live-actions">
            <button className="glass-button" type="button" onClick={resetPrompt}>
              <RotateCcw size={15} />
            </button>
            <button className="glass-button primary" type="button" onClick={() => setIsPracticing((current) => !current)}>
              {isPracticing ? <Pause size={16} /> : <Play size={16} />}
              {isPracticing ? "Pause" : "Start"}
            </button>
            <button className="glass-button" type="button" onClick={nextPrompt}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        {cameraState !== "live" && (
          <div className="mirror-empty">
            <Sparkles size={28} />
            <strong>Choose your stronger side</strong>
            <span>Then start the camera to see a mirrored practice view.</span>
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-label">Stronger side</div>
        <div className="segmented-control">
          <button className={strongSide === "left" ? "selected" : ""} type="button" onClick={() => setStrongSide("left")}>
            Left
          </button>
          <button className={strongSide === "right" ? "selected" : ""} type="button" onClick={() => setStrongSide("right")}>
            Right
          </button>
        </div>
        <p className="helper-copy">Your {strongSide} side stays unchanged. The {weakSide} side receives the mirrored guide.</p>
      </section>

      <div className="action-row">
        {cameraState === "live" ? (
          <button className="button ghost full" type="button" onClick={stopCamera}>
            <CameraOff size={16} />
            Stop mirror
          </button>
        ) : (
          <button className="button primary full" type="button" onClick={startCamera}>
            <Camera size={16} />
            Start mirror camera
          </button>
        )}
      </div>

      <section className="section-block exercise-note">
        <div className="section-label">Practice note</div>
        <p>This is a visual practice aid. Move gently and stop if anything feels painful, dizzy, or uncomfortable.</p>
      </section>
    </section>
  );
}

function syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawMirroredFace(context: CanvasRenderingContext2D, video: HTMLVideoElement, strongSide: StrongSide) {
  const canvas = context.canvas;
  const width = canvas.width;
  const height = canvas.height;
  const halfWidth = width / 2;

  context.save();
  context.clearRect(0, 0, width, height);

  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, width, height);
  context.restore();

  const sourceX = strongSide === "left" ? 0 : halfWidth;
  const targetX = strongSide === "left" ? halfWidth : 0;

  context.save();
  if (strongSide === "left") {
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(canvas, sourceX, 0, halfWidth, height, 0, 0, halfWidth, height);
  } else {
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(canvas, sourceX, 0, halfWidth, height, halfWidth, 0, halfWidth, height);
  }
  context.restore();

  context.save();
  const gradient = context.createLinearGradient(halfWidth - 24, 0, halfWidth + 24, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(halfWidth - 24, 0, 48, height);
  context.strokeStyle = "rgba(255,255,255,0.42)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(halfWidth, 0);
  context.lineTo(halfWidth, height);
  context.stroke();
  context.restore();

  // Keep targetX referenced so the side math stays explicit and readable.
  void targetX;
}
