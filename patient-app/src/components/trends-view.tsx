"use client";

import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { DailySession } from "@/src/lib/storage";
import { FauMetric } from "@/src/lib/facs";

export function TrendsView({ sessions }: { sessions: DailySession[] }) {
  const points = sessions.slice(0, 14).reverse();
  const fauTrends = buildFauTrends(points);

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Trends</p>
          <h1>Progress over time</h1>
        </div>
      </div>

      <section className="section-block">
        <div className="section-label">Symmetry score</div>
        {points.length ? (
          <TrendChart
            ariaLabel="Daily symmetry score trend"
            points={points.map((session) => ({
              id: session.id,
              score: session.overallSymmetryScore
            }))}
          />
        ) : (
          <div className="empty-state polished">
            <ChartNoAxesColumnIncreasing size={24} />
            <strong>No trend yet</strong>
            <span>Record a check-in and Symmetra will chart your scores over time.</span>
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-label">FAU score trends</div>
        {fauTrends.length ? (
          <div className="fau-trend-list">
            {fauTrends.map((trend) => (
              <article className="fau-trend-card" key={trend.id}>
                <div className="fau-trend-heading">
                  <div>
                    <span>{trend.au}</span>
                    <strong>{trend.label}</strong>
                  </div>
                  <TrendDelta value={trend.delta} />
                </div>
                <TrendChart ariaLabel={`${trend.label} FAU score trend`} compact points={trend.points} />
                <div className="fau-trend-footer">
                  <span>Latest</span>
                  <strong>{trend.latestScore}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state polished">
            <ChartNoAxesColumnIncreasing size={24} />
            <strong>No FAU trends yet</strong>
            <span>Per-FAU charts appear after your first saved check-in.</span>
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-label">Recent averages</div>
        <div className="insight-grid">
          <Summary label="7 day avg" value={averageScore(sessions.slice(0, 7))} />
          <Summary label="Best" value={bestScore(sessions)} />
        </div>
      </section>
    </section>
  );
}

type TrendPoint = {
  id: string;
  score: number;
};

type FauTrend = {
  id: string;
  au: string;
  label: string;
  latestScore: number;
  delta: number;
  points: TrendPoint[];
};

function TrendChart({ ariaLabel, compact = false, points }: { ariaLabel: string; compact?: boolean; points: TrendPoint[] }) {
  const width = 360;
  const height = compact ? 92 : 180;
  const padding = compact ? 10 : 18;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const xFor = (index: number) => padding + (chartWidth * index) / Math.max(points.length - 1, 1);
  const yFor = (score: number) => padding + chartHeight - (chartHeight * score) / 100;
  const line = points.map((point, index) => `${xFor(index)},${yFor(point.score)}`).join(" ");

  return (
    <div className={`trend-chart ${compact ? "compact" : ""}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {!compact && <line className="chart-grid" x1={padding} x2={width - padding} y1={yFor(75)} y2={yFor(75)} />}
        {!compact && <line className="chart-grid" x1={padding} x2={width - padding} y1={yFor(50)} y2={yFor(50)} />}
        <polyline className="chart-line" fill="none" points={line} />
        {points.map((point, index) => (
          <circle className="chart-point" cx={xFor(index)} cy={yFor(point.score)} key={point.id} r={compact ? "3" : "4"} />
        ))}
      </svg>
    </div>
  );
}

function TrendDelta({ value }: { value: number }) {
  const isFlat = value === 0;
  const label = isFlat ? "0" : `${value > 0 ? "+" : ""}${value}`;
  return <span className={`trend-delta ${value > 0 ? "up" : value < 0 ? "down" : ""}`}>{label}</span>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
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

function buildFauTrends(sessions: DailySession[]): FauTrend[] {
  const trendMap = new Map<string, { metric: FauMetric; points: TrendPoint[] }>();

  sessions.forEach((session) => {
    session.metrics.forEach((metric) => {
      const existing = trendMap.get(metric.id) ?? { metric, points: [] };
      existing.points.push({
        id: `${session.id}-${metric.id}`,
        score: metric.symmetryScore
      });
      trendMap.set(metric.id, existing);
    });
  });

  return Array.from(trendMap.entries()).map(([id, trend]) => {
    const first = trend.points[0]?.score ?? 0;
    const latest = trend.points[trend.points.length - 1]?.score ?? first;

    return {
      id,
      au: trend.metric.au,
      label: trend.metric.label,
      latestScore: latest,
      delta: latest - first,
      points: trend.points
    };
  });
}
