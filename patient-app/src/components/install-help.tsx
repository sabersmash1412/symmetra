"use client";

import { Smartphone } from "lucide-react";

export function InstallHelp({ onDone }: { onDone: () => void }) {
  return (
    <section className="view-stack">
      <div className="panel install-panel">
        <div className="app-mark small">
          <Smartphone size={22} />
        </div>
        <h1>Download Symmetra to your phone</h1>
        <p className="soft-copy">Deploy this app to an HTTPS URL, then install it from your phone browser.</p>

        <div className="install-steps">
          <article>
            <strong>iPhone</strong>
            <span>Open in Safari, tap Share, then tap Add to Home Screen.</span>
          </article>
          <article>
            <strong>Android</strong>
            <span>Open in Chrome, tap the install prompt or menu, then tap Install app or Add to Home screen.</span>
          </article>
        </div>

        <button className="button primary full" type="button" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  );
}
