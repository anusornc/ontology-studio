import { useState } from "react";
import { useOntologyStore } from "../state/context";

/**
 * Cold-start state: the only thing on screen when no ontology exists yet.
 * Creating calls the API and opens the new document; the sample is created via
 * `createSampleOntology()` and then saved.
 */
export function EmptyState() {
  const createNewOntology = useOntologyStore((state) => state.createNewOntology);
  const loadSample = useOntologyStore((state) => state.loadSample);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"create" | "sample" | null>(null);

  async function create() {
    setBusy("create");
    try {
      await createNewOntology(name);
    } finally {
      setBusy(null);
    }
  }

  async function sample() {
    setBusy("sample");
    try {
      await loadSample();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="empty-state" data-testid="empty-state">
      <div className="empty-card">
        <div className="empty-card__art" aria-hidden="true">
          <svg viewBox="0 0 220 120" width="220" height="120" role="img">
            <defs>
              <linearGradient id="empty-line" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <path d="M58 36 L112 60 M162 36 L112 60 M112 60 L112 96" stroke="url(#empty-line)" strokeWidth="1.5" fill="none" />
            <rect x="34" y="20" width="52" height="26" rx="8" fill="#172033" stroke="#22d3ee" />
            <rect x="134" y="20" width="52" height="26" rx="8" fill="#172033" stroke="#a78bfa" />
            <rect x="86" y="84" width="52" height="26" rx="8" fill="#172033" stroke="#34d399" />
            <circle cx="46" cy="33" r="3" fill="#22d3ee" />
            <circle cx="146" cy="33" r="3" fill="#a78bfa" />
            <circle cx="98" cy="97" r="3" fill="#34d399" />
          </svg>
        </div>
        <p className="empty-card__eyebrow">Graph studio</p>
        <h1 className="empty-card__title">Design your first ontology</h1>
        <p className="empty-card__copy">
          Model classes, attributes and relationships on an infinite canvas, then validate and export
          it as OWL, JSON-LD or Turtle.
        </p>
        <form
          className="empty-card__form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className="field">
            <span className="field__label">Ontology name</span>
            <input
              className="input"
              data-testid="input-ontology-name"
              name="ontology-name"
              placeholder="e.g. University"
              value={name}
              maxLength={120}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn--primary btn--block"
            data-testid="btn-create-ontology"
            disabled={name.trim().length === 0 || busy !== null}
          >
            {busy === "create" ? "Creating…" : "Create ontology"}
          </button>
        </form>
        <div className="empty-card__divider" aria-hidden="true">
          <span>or</span>
        </div>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          data-testid="btn-load-sample"
          disabled={busy !== null}
          onClick={() => void sample()}
        >
          {busy === "sample" ? "Loading sample…" : "Load sample ontology"}
        </button>
        <p className="empty-card__hint">
          The sample is a ready-to-explore <strong>University</strong> ontology with classes,
          attributes and relations.
        </p>
      </div>
    </div>
  );
}
