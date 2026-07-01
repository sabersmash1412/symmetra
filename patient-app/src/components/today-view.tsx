"use client";

import { Activity, ArrowRight, CalendarCheck, Camera, Cloud, CloudOff, ScanFace, ShieldCheck, Sparkles } from "lucide-react";
import { DailySession } from "@/src/lib/storage";

export function TodayView({
  sessions,
  isOnline,
  onStart,
  onOpenExercises,
  onOpenMirror,
  onOpenInstall
}: {
  sessions: DailySession[];
  isOnline: boolean;
  onStart: () => void;
  onOpenExercises: () => void;
  onOpenMirror: () => void;
  onOpenInstall: () => void;
}) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySession = sessions.find((session) => session.dateKey === todayKey);
  const latest = sessions[0];
  const latestScore = latest?.overallSymmetryScore ?? null;

  return (
    <section className="view-stack">
      <div className="today-hero">
        <div className="hero-topline">
          <span className={`sync-chip ${isOnline ? "ready" : ""}`}>
            {isOnline ? <Cloud size={15} /> : <CloudOff size={15} />}
            {isOnline ? "Cloud ready" : "Offline mode"}
          </span>
          <button className="text-button" type="button" onClick={onOpenInstall}>
            Install
          </button>
        </div>

        <div className="hero-score-row">
          <div className="score-orbit" style={{ "--score": latestScore ?? 0 } as React.CSSProperties}>
            <div>
              <strong>{latestScore ?? "--"}</strong>
              <span>{latestScore === null ? "No score" : "Latest"}</span>
            </div>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">{todaySession ? "Complete today" : "Today"}</p>
            <h1>{todaySession ? "Your check-in is saved." : "Ready for a steady check-in?"}</h1>
            <p>
              {todaySession
                ? "Record again only if the first capture felt off. The daily log keeps your values organized."
                : "A guided 12-second capture measures symmetry values while your head stays aligned."}
            </p>
          </div>
        </div>

        <button className="primary-cta" type="button" onClick={onStart}>
          <span>
            <Camera size={19} />
            Start check-in
          </span>
          <ArrowRight size={19} />
        </button>

        <button className="secondary-cta" type="button" onClick={onOpenExercises}>
          <span>
            <Activity size={18} />
            Facial rehab exercises
          </span>
          <ArrowRight size={18} />
        </button>

        <button className="secondary-cta mirror" type="button" onClick={onOpenMirror}>
          <span>
            <Sparkles size={18} />
            Mirror therapy practice
          </span>
          <ArrowRight size={18} />
        </button>
      </div>

      <div className="insight-grid">
        <SummaryCard label="Log entries" value={`${sessions.length}`} unit="" />
        <SummaryCard label="Capture mode" value="12s" unit="" />
      </div>

      <section className="section-block">
        <div className="section-label">
          <span>
            <CalendarCheck size={16} />
            Recent daily log
          </span>
          <ShieldCheck size={16} />
        </div>
        <div className="session-list compact">
          {sessions.slice(0, 3).map((session) => (
            <article className="session-row" key={session.id}>
              <div>
                <strong>{formatDate(session.createdAt)}</strong>
                <span>{session.syncStatus === "synced" ? "Synced" : "Saved on this phone"}</span>
              </div>
              <b>{session.overallSymmetryScore}</b>
            </article>
          ))}
          {!sessions.length && (
            <div className="empty-state polished">
              <ScanFace size={22} />
              <strong>No check-ins yet</strong>
              <span>Your first capture will appear here with its score and sync status.</span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function SummaryCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}
