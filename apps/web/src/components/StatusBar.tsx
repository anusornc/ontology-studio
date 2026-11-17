import { useOntologyStore } from "../state/context";
import { pluralize } from "../state/types";

/** Bottom status strip: counts, validation totals and the base IRI. */
export function StatusBar() {
  const ontology = useOntologyStore((state) => state.ontology);
  const issues = useOntologyStore((state) => state.issues);
  const setSidebarTab = useOntologyStore((state) => state.setSidebarTab);

  const classCount = ontology?.classes.length ?? 0;
  const relationCount = ontology?.relations.length ?? 0;
  const errors = issues?.filter((issue) => issue.severity === "error").length ?? 0;
  const warnings = issues?.filter((issue) => issue.severity === "warning").length ?? 0;

  return (
    <footer className="statusbar" data-testid="status-bar">
      <div className="statusbar__left">
        <span className="statusbar__item" data-testid="status-classes">
          <span className="statusbar__dot statusbar__dot--cyan" aria-hidden="true" />
          {pluralize(classCount, "class")}
        </span>
        <span className="statusbar__item" data-testid="status-relations">
          <span className="statusbar__dot statusbar__dot--violet" aria-hidden="true" />
          {pluralize(relationCount, "relation")}
        </span>
        <button
          type="button"
          className="statusbar__item statusbar__item--button"
          data-testid="status-errors"
          onClick={() => setSidebarTab("issues")}
        >
          <span className="statusbar__dot statusbar__dot--red" aria-hidden="true" />
          {pluralize(errors, "error")}
        </button>
        <button
          type="button"
          className="statusbar__item statusbar__item--button"
          data-testid="status-warnings"
          onClick={() => setSidebarTab("issues")}
        >
          <span className="statusbar__dot statusbar__dot--amber" aria-hidden="true" />
          {pluralize(warnings, "warning")}
        </button>
      </div>
      <div className="statusbar__right">
        <span className="statusbar__label">Base IRI</span>
        <code className="statusbar__iri" title={ontology?.baseIri}>
          {ontology?.baseIri ?? "—"}
        </code>
      </div>
    </footer>
  );
}
