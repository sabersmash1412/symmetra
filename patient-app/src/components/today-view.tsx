"use client";

import { CalendarCheck, Camera, Cloud, CloudOff } from "lucide-react";
import { DailySession } from "@/src/lib/storage";

export function TodayView({
  sessions,
  isOnline,
  onStart,
  onOpenInstall
}: {
  sessions: DailySession[];
  isOnline: boolean;
  onStart: () => void;
  onOpenInstall: () => void;
}) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySession = sessions.find((session) => session.dateKey === todayKey);
  const latest = sessions[0];

  return (
    <section className="view-stack">
      <div className="hero-panel">
        <div className="hero-topline">
          <span className={`sync-chip ${isOnline ? "ready" : ""}`}>
            {isOnline ? <Cloud size={15} /> : <CloudOff size={15} />}
            {isOnline ? "Cloud ready" : "Offline mode"}
          </span>
          <button className="text-button" type="button" onClick={onOpenInstall}>
            Install
          </button>
        </div>
        <h1>{todaySession ? "Today is logged" : "Ready for today?"}</h1>
        <p>
          {todaySession
            ? "Your check-in is saved. You can record again if you want a cleaner daily sample."
            : "Record one short face check-in and save your symmetry values to the daily log."}
        </p>
        <button className="button primary large" type="button" onClick={onStart}>
          <Camera size={18} />
          Start check-in
        </button>
      </div>

      <div className="summary-row">
        <SummaryCard label="Latest score" value={latest ? `${latest.overallSymmetryScore}` : "--"} unit="/100" />
        <SummaryCard label="Log entries" value={`${sessions.length}`} unit="" />
      </div>

      <section className="panel">
        <div className="panel-title">
          <CalendarCheck size={16} />
          Recent daily log
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
          {!sessions.length && <div className="empty-state">No saved check-ins yet.</div>}
        </div>
      </section>
    </section>
  );
}

function SummaryCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="summary-card">
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
