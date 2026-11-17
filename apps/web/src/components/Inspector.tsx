import { useOntologyStore } from "../state/context";
import { ClassForm } from "./ClassForm";
import { OntologyForm } from "./OntologyForm";
import { RelationForm } from "./RelationForm";

/** Right-hand inspector. Falls back to ontology metadata when nothing is selected. */
export function Inspector() {
  const selected = useOntologyStore((state) => state.selected);
  const select = useOntologyStore((state) => state.select);

  const mode = selected === null ? "ontology" : selected.kind;
  const title = mode === "class" ? "Class" : mode === "relation" ? "Relation" : "Ontology";

  return (
    <aside
      className={`inspector${selected !== null ? " inspector--open" : ""}`}
      data-testid="inspector"
      aria-label="Inspector"
    >
      <div className="inspector__header">
        <div className="inspector__heading">
          <span className="inspector__eyebrow">Inspector</span>
          <h2 className="inspector__title">{title}</h2>
        </div>
        <span className={`pill ${mode === "class" ? "pill--cyan" : mode === "relation" ? "pill--violet" : "pill--muted"}`}>
          {title.toLowerCase()}
        </span>
        {selected !== null && (
          <button
            type="button"
            className="icon-btn inspector__close"
            data-testid="btn-close-inspector"
            aria-label="Close inspector"
            title="Back to ontology metadata"
            onClick={() => select(null)}
          >
            ×
          </button>
        )}
      </div>
      <div className="inspector__body">
        {mode === "class" ? <ClassForm /> : mode === "relation" ? <RelationForm /> : <OntologyForm />}
      </div>
    </aside>
  );
}
