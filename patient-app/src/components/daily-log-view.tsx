"use client";

import { Film, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getSignedVideoUrl } from "@/src/lib/sessions";
import { DailySession, getLocalVideo } from "@/src/lib/storage";

export function DailyLogView({ sessions, onRefresh }: { sessions: DailySession[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<DailySession | null>(sessions[0] ?? null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    setSelected((current) => current ?? sessions[0] ?? null);
  }, [sessions]);

  useEffect(() => {
    let revokedUrl: string | null = null;

    async function loadVideo() {
      setVideoUrl(null);
      if (!selected) {
        return;
      }

      if (selected.videoBlobId) {
        const storedVideo = await getLocalVideo(selected.videoBlobId);
        if (storedVideo) {
          revokedUrl = URL.createObjectURL(storedVideo.blob);
          setVideoUrl(revokedUrl);
          return;
        }
      }

      if (selected.videoPath) {
        setVideoUrl(await getSignedVideoUrl(selected.videoPath));
      }
    }

    loadVideo();
    return () => {
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [selected]);

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Daily Log</p>
          <h1>Saved check-ins</h1>
        </div>
        <button className="icon-button" title="Refresh" type="button" onClick={onRefresh}>
          <RefreshCw size={17} />
        </button>
      </div>

      <div className="session-list">
        {sessions.map((session) => (
          <button
            className={`session-row buttonless ${selected?.id === session.id ? "selected" : ""}`}
            key={session.id}
            type="button"
            onClick={() => setSelected(session)}
          >
            <div>
              <strong>{formatDate(session.createdAt)}</strong>
              <span>{session.syncStatus === "synced" ? "Synced to cloud" : "Saved on this phone"}</span>
            </div>
            <b>{session.overallSymmetryScore}</b>
          </button>
        ))}
        {!sessions.length && <div className="empty-state">No daily check-ins yet.</div>}
      </div>

      {selected && (
        <section className="panel">
          <div className="panel-title">Session detail</div>
          {videoUrl ? (
            <video className="playback" controls playsInline src={videoUrl} />
          ) : (
            <div className="empty-state inline">
              <Film size={18} />
              No video available for this check-in.
            </div>
          )}

          <div className="metric-list detail">
            {selected.metrics.map((metric) => (
              <article className="metric-card" key={metric.id}>
                <div>
                  <span>{metric.au}</span>
                  <strong>{metric.label}</strong>
                </div>
                <div>
                  <b>{metric.symmetryScore}</b>
                  <small>{formatSigned(metric.balance)}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}
