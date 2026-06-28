"use client";

import { RotateCcw, Save } from "lucide-react";
import { CaptureResult } from "@/src/components/capture-view";

export function ReviewView({
  result,
  videoStorageEnabled,
  isSaving,
  onRetake,
  onSave
}: {
  result: CaptureResult;
  videoStorageEnabled: boolean;
  isSaving: boolean;
  onRetake: () => void;
  onSave: () => void;
}) {
  return (
    <section className="view-stack">
      <div className="review-hero">
        <span>Review check-in</span>
        <strong>{result.overallSymmetryScore}</strong>
        <small>/100 symmetry score</small>
      </div>

      <section className="panel">
        <div className="panel-title">Capture quality</div>
        <div className="quality-summary">
          <strong>{result.qualityScore}</strong>
          <span>{videoStorageEnabled ? "Video will sync when saved." : "Video storage is off. Values will be saved."}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">Symmetry values</div>
        <div className="metric-list">
          {result.metrics.map((metric) => (
            <article className="metric-card" key={metric.id}>
              <div>
                <span>{metric.au}</span>
                <strong>{metric.label}</strong>
              </div>
              <div>
                <b>{formatSigned(metric.balance)}</b>
                <small>{metric.affectedSide === "balanced" ? "Balanced" : `${metric.affectedSide} dominant`}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="action-row sticky">
        <button className="button ghost" type="button" onClick={onRetake}>
          <RotateCcw size={16} />
          Retake
        </button>
        <button className="button primary" disabled={isSaving} type="button" onClick={onSave}>
          <Save size={16} />
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </section>
  );
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}
