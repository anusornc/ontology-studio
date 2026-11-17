import type { ExportFormat } from "../api/client";
import { useOntologyStore } from "../state/context";
import { SAVE_STATUS_LABEL } from "../state/types";
import { ExportMenu } from "./ExportMenu";

export interface TopBarProps {
  onNewOntology: () => void;
  onExport: (format: ExportFormat) => Promise<void>;
  onToggleSidebar?: () => void;
}

export function TopBar({ onNewOntology, onExport, onToggleSidebar }: TopBarProps) {
  const summaries = useOntologyStore((state) => state.summaries);
  const ontology = useOntologyStore((state) => state.ontology);
  const saveState = useOntologyStore((state) => state.saveState);
  const issues = useOntologyStore((state) => state.issues);
  const openOntology = useOntologyStore((state) => state.openOntology);
  const validate = useOntologyStore((state) => state.validate);
  const save = useOntologyStore((state) => state.save);

  const issueCount = issues?.length ?? 0;
  const saveLabel = SAVE_STATUS_LABEL[saveState];

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar__left">
        {onToggleSidebar && (
          <button
            type="button"
            className="btn btn--ghost topbar__sidebar-toggle"
            data-testid="btn-toggle-sidebar"
            aria-label="Toggle sidebar"
            onClick={onToggleSidebar}
          >
            <span aria-hidden="true">☰</span>
          </button>
        )}
        <div className="brand" data-testid="topbar-brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28" role="img">
              <rect width="32" height="32" rx="9" fill="#101a2f" stroke="#22304d" />
              <circle cx="10" cy="10" r="3.5" fill="#22d3ee" />
              <circle cx="22" cy="10" r="3.5" fill="#a78bfa" />
              <circle cx="16" cy="22" r="3.5" fill="#34d399" />
              <path d="M10 10l6 12M22 10l-6 12M10 10h12" stroke="#94a3b8" strokeWidth="1.2" opacity="0.8" />
            </svg>
          </span>
          <span className="brand__text">
            <span className="brand__name">Ontology Studio</span>
            <span className="brand__tag">Visual OWL designer</span>
          </span>
        </div>
        <span className="topbar__divider" aria-hidden="true" />
        <label className="picker">
          <span className="sr-only">Ontology</span>
          <select
            className="picker__select"
            data-testid="ontology-select"
            value={ontology?.id ?? ""}
            disabled={summaries.length === 0}
            onChange={(event) => {
              const id = event.target.value;
              if (id) void openOntology(id);
            }}
          >
            {ontology === null && <option value="">No ontology open</option>}
            {summaries.map((summary) => (
              <option key={summary.id} value={summary.id}>
                {summary.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="topbar__right">
        <div className="save-indicator">
          <span
            className={`save-status save-status--${saveState}`}
            data-testid="save-status"
            aria-live="polite"
            title={saveState === "error" ? "The last save failed. Your changes are kept locally." : undefined}
          >
            {saveLabel}
          </span>
          {saveState === "error" && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              data-testid="btn-retry-save"
              onClick={() => void save()}
            >
              Retry
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          data-testid="btn-validate"
          disabled={ontology === null}
          onClick={() => void validate()}
        >
          <span aria-hidden="true">✓</span> Validate
          {issueCount > 0 && (
            <span className="badge" data-testid="validate-badge">
              {issueCount}
            </span>
          )}
        </button>
        {ontology !== null && <ExportMenu onExport={onExport} />}
        <button
          type="button"
          className="btn btn--primary"
          data-testid="btn-new-ontology"
          onClick={onNewOntology}
        >
          <span aria-hidden="true">＋</span> New
        </button>
      </div>
    </header>
  );
}
