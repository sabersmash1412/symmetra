"use client";

import { DailySession } from "@/src/lib/storage";

export function TrendsView({ sessions }: { sessions: DailySession[] }) {
  const points = sessions.slice(0, 14).reverse();

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Trends</p>
          <h1>Progress over time</h1>
        </div>
      </div>

      <section className="panel">
        <div className="panel-title">Symmetry score</div>
        {points.length ? <TrendChart sessions={points} /> : <div className="empty-state">Record a check-in to start a trend.</div>}
      </section>

      <section className="panel">
        <div className="panel-title">Recent averages</div>
        <div className="summary-row">
          <Summary label="7 day avg" value={averageScore(sessions.slice(0, 7))} />
          <Summary label="Best" value={bestScore(sessions)} />
        </div>
      </section>
    </section>
  );
}

function TrendChart({ sessions }: { sessions: DailySession[] }) {
  const width = 360;
  const height = 180;
  const padding = 18;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const xFor = (index: number) => padding + (chartWidth * index) / Math.max(sessions.length - 1, 1);
  const yFor = (score: number) => padding + chartHeight - (chartHeight * score) / 100;
  const line = sessions.map((session, index) => `${xFor(index)},${yFor(session.overallSymmetryScore)}`).join(" ");

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily symmetry score trend">
        <line className="chart-grid" x1={padding} x2={width - padding} y1={yFor(75)} y2={yFor(75)} />
        <line className="chart-grid" x1={padding} x2={width - padding} y1={yFor(50)} y2={yFor(50)} />
        <polyline className="chart-line" fill="none" points={line} />
        {sessions.map((session, index) => (
          <circle className="chart-point" cx={xFor(index)} cy={yFor(session.overallSymmetryScore)} key={session.id} r="4" />
        ))}
      </svg>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function averageScore(sessions: DailySession[]) {
  if (!sessions.length) {
    return "--";
  }

  return `${Math.round(sessions.reduce((sum, session) => sum + session.overallSymmetryScore, 0) / sessions.length)}`;
}

function bestScore(sessions: DailySession[]) {
  if (!sessions.length) {
    return "--";
  }

  return `${Math.max(...sessions.map((session) => session.overallSymmetryScore))}`;
}
