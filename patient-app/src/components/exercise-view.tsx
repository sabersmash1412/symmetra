"use client";

import { Check, ChevronLeft, ChevronRight, Dumbbell, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Exercise = {
  id: string;
  title: string;
  durationSec: number;
  reps: number;
  cue: string;
  assist: string;
  steps: string[];
};

const EXERCISES: Exercise[] = [
  {
    id: "forehead_lift",
    title: "Forehead Lift",
    durationSec: 5,
    reps: 5,
    cue: "Raise your eyebrows as high as possible.",
    assist: "Use your fingers to gently help the weaker side if needed.",
    steps: ["Lift both eyebrows", "Hold for 3 to 5 seconds", "Relax fully before the next rep"]
  },
  {
    id: "eye_squeeze",
    title: "Eye Squeeze",
    durationSec: 5,
    reps: 5,
    cue: "Close both eyes gently but firmly.",
    assist: "Make sure the affected eyelid closes completely without straining.",
    steps: ["Close both eyes", "Hold as if blocking bright light", "Release slowly and rest"]
  },
  {
    id: "nose_scrunch",
    title: "Nose Scrunch",
    durationSec: 5,
    reps: 5,
    cue: "Flare your nostrils and scrunch your nose.",
    assist: "You can block the stronger nostril to encourage the affected side.",
    steps: ["Flare nostrils", "Scrunch nose upward", "Relax the bridge of the nose"]
  },
  {
    id: "smile_pucker",
    title: "Smile & Pucker",
    durationSec: 6,
    reps: 5,
    cue: "Smile widely, then slowly pucker forward.",
    assist: "Move slowly and keep both corners of the mouth engaged.",
    steps: ["Smile with teeth showing", "Hold briefly", "Pucker like blowing a kiss"]
  },
  {
    id: "cheek_puff",
    title: "Cheek Puff",
    durationSec: 5,
    reps: 5,
    cue: "Puff your cheeks with air and hold.",
    assist: "Try moving air gently left to right without letting it leak.",
    steps: ["Fill cheeks with air", "Hold for 5 seconds", "Move air side to side gently"]
  }
];

export function ExerciseView() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [remainingSec, setRemainingSec] = useState(EXERCISES[0].durationSec);
  const [isRunning, setIsRunning] = useState(false);

  const activeExercise = EXERCISES[activeIndex];
  const progress = completed.size / EXERCISES.length;
  const isComplete = completed.has(activeExercise.id);

  useEffect(() => {
    setRemainingSec(activeExercise.durationSec);
    setIsRunning(false);
  }, [activeExercise]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSec((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setIsRunning(false);
          setCompleted((previous) => new Set(previous).add(activeExercise.id));
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeExercise.id, isRunning]);

  const nextLabel = useMemo(() => {
    if (activeIndex === EXERCISES.length - 1) {
      return "Finish";
    }
    return "Next";
  }, [activeIndex]);

  function goTo(index: number) {
    const safeIndex = Math.min(Math.max(index, 0), EXERCISES.length - 1);
    setActiveIndex(safeIndex);
  }

  function resetExercise() {
    setIsRunning(false);
    setRemainingSec(activeExercise.durationSec);
    setCompleted((previous) => {
      const next = new Set(previous);
      next.delete(activeExercise.id);
      return next;
    });
  }

  return (
    <section className="exercise-screen view-stack">
      <div className="exercise-hero">
        <div className="hero-topline">
          <span className="sync-chip ready">
            <Dumbbell size={15} />
            Rehab routine
          </span>
          <span className="exercise-count">
            {completed.size}/{EXERCISES.length}
          </span>
        </div>
        <h1>Facial symmetry exercises</h1>
        <p>Move slowly, avoid pain, and use gentle finger support when a side needs help.</p>
        <div className="routine-progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <section className="exercise-card">
        <div className="exercise-card-header">
          <div>
            <p className="eyebrow">
              Exercise {activeIndex + 1} of {EXERCISES.length}
            </p>
            <h2>{activeExercise.title}</h2>
          </div>
          <div className={`completion-mark ${isComplete ? "done" : ""}`}>
            {isComplete ? <Check size={18} /> : <Sparkles size={18} />}
          </div>
        </div>

        <div className="exercise-timer">
          <div className="timer-ring" style={{ "--timer": remainingSec / activeExercise.durationSec } as React.CSSProperties}>
            <div className="ring-value-stack">
              <strong>{remainingSec}</strong>
              <span>sec hold</span>
            </div>
          </div>
          <div className="reps-tile">
            <span>Reps</span>
            <strong>{activeExercise.reps}</strong>
            <small>suggested</small>
          </div>
        </div>

        <div className="exercise-cue">
          <strong>{activeExercise.cue}</strong>
          <span>{activeExercise.assist}</span>
        </div>

        <ol className="exercise-steps">
          {activeExercise.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className="exercise-actions">
          <button className="button ghost" type="button" onClick={resetExercise}>
            <RotateCcw size={16} />
            Reset
          </button>
          <button className="button primary" type="button" onClick={() => setIsRunning((current) => !current)}>
            {isRunning ? <Pause size={16} /> : <Play size={16} />}
            {isRunning ? "Pause" : remainingSec === 0 ? "Repeat hold" : "Start hold"}
          </button>
        </div>
      </section>

      <div className="exercise-stepper">
        {EXERCISES.map((exercise, index) => (
          <button
            className={`${index === activeIndex ? "active" : ""} ${completed.has(exercise.id) ? "complete" : ""}`}
            key={exercise.id}
            type="button"
            onClick={() => goTo(index)}
          >
            <span>{index + 1}</span>
          </button>
        ))}
      </div>

      <div className="action-row">
        <button className="button ghost" disabled={activeIndex === 0} type="button" onClick={() => goTo(activeIndex - 1)}>
          <ChevronLeft size={16} />
          Back
        </button>
        <button className="button primary" type="button" onClick={() => goTo(activeIndex + 1)}>
          {nextLabel}
          <ChevronRight size={16} />
        </button>
      </div>

      <section className="section-block exercise-note">
        <div className="section-label">Before you start</div>
        <p>Stop if you feel pain or dizziness. These exercises support daily practice and do not replace advice from your clinician.</p>
      </section>
    </section>
  );
}
