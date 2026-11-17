import type { ValidationIssue } from "@onto/core";
import { useOntologyStore } from "../state/context";
import { pluralize } from "../state/types";

function severityLabel(severity: ValidationIssue["severity"]): string {
  return severity === "error" ? "Error" : "Warning";
}

/** Grouped validation findings. Clicking one inspects the offending entity. */
export function IssuesPanel() {
  const issues = useOntologyStore((state) => state.issues);
  const select = useOntologyStore((state) => state.select);
  const validate = useOntologyStore((state) => state.validate);

  function inspect(issue: ValidationIssue) {
    if (issue.entity === "class") {
      select({ kind: "class", id: issue.entityId });
      return;
    }
    if (issue.entity === "relation") {
      select({ kind: "relation", id: issue.entityId });
      return;
    }
    if (issue.entity === "attribute" && issue.ownerId) {
      select({ kind: "class", id: issue.ownerId });
      return;
    }
    select(null);
  }

  if (issues === null) {
    return (
      <div className="issues-panel" data-testid="issues-panel">
        <div className="issues-panel__intro">
          <p>Run validation to check names, inheritance and relation endpoints.</p>
          <button type="button" className="btn btn--secondary btn--block" onClick={() => void validate()}>
            Validate now
          </button>
        </div>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="issues-panel" data-testid="issues-panel">
        <div className="issues-success">
          <span className="issues-success__icon" aria-hidden="true">
            ✓
          </span>
          <p className="issues-success__title">All clear</p>
          <p className="issues-success__copy">No errors or warnings found. This ontology is healthy.</p>
        </div>
      </div>
    );
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const ordered = [...errors, ...warnings];

  return (
    <div className="issues-panel" data-testid="issues-panel">
      <div className="issues-panel__summary">
        <span className="issues-panel__count" data-testid="issue-count">
          {pluralize(issues.length, "issue")}
        </span>
        <span className="pill pill--red">{pluralize(errors.length, "error")}</span>
        <span className="pill pill--amber">{pluralize(warnings.length, "warning")}</span>
      </div>
      <ul className="issues-list">
        {ordered.map((issue, index) => (
          <li key={`${issue.code}-${issue.entityId}-${index}`}>
            <button
              type="button"
              className={`issue issue--${issue.severity}`}
              data-testid={`issue-${index}`}
              onClick={() => inspect(issue)}
            >
              <span className="issue__marker" aria-hidden="true" />
              <span className="issue__body">
                <span className="issue__meta">
                  <span className="issue__severity">{severityLabel(issue.severity)}</span>
                  <code className="issue__code">{issue.code}</code>
                </span>
                <span className="issue__message">{issue.message}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
