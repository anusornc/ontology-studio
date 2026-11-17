import type { Ontology } from "@onto/core";
import { updateOntologyMeta } from "@onto/core";
import { useOntologyStore } from "../state/context";

/** Metadata inspector shown when nothing is selected on the canvas. */
export function OntologyForm() {
  const ontology = useOntologyStore((state) => state.ontology);
  const mutate = useOntologyStore((state) => state.mutate);
  const removeOntology = useOntologyStore((state) => state.removeOntology);
  const summaries = useOntologyStore((state) => state.summaries);

  if (!ontology) return null;

  function patch(changes: Partial<Ontology>) {
    mutate((current) => updateOntologyMeta(current, changes));
  }

  function deleteOntology() {
    if (!ontology) return;
    const confirmed = window.confirm(
      `Delete the ontology "${ontology.name}"? This permanently removes its classes and relations.`
    );
    if (confirmed) void removeOntology(ontology.id);
  }

  return (
    <div className="form">
      <div className="form__section">
        <div className="form__section-head">
          <h3 className="form__section-title">Ontology</h3>
          <span className="pill pill--cyan">metadata</span>
        </div>
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="input"
            data-testid="field-ontology-name"
            value={ontology.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Description</span>
          <textarea
            className="input input--area"
            data-testid="field-ontology-description"
            rows={3}
            value={ontology.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
        <div className="field-row">
          <label className="field field--half">
            <span className="field__label">Version</span>
            <input
              className="input"
              data-testid="field-ontology-version"
              value={ontology.version}
              onChange={(event) => patch({ version: event.target.value })}
            />
          </label>
          <label className="field field--half">
            <span className="field__label">Base IRI</span>
            <input
              className="input input--mono"
              data-testid="field-ontology-base-iri"
              value={ontology.baseIri}
              onChange={(event) => patch({ baseIri: event.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="form__section">
        <h3 className="form__section-title">Overview</h3>
        <dl className="stats">
          <div className="stat">
            <dt>Classes</dt>
            <dd>{ontology.classes.length}</dd>
          </div>
          <div className="stat">
            <dt>Relations</dt>
            <dd>{ontology.relations.length}</dd>
          </div>
          <div className="stat">
            <dt>Attributes</dt>
            <dd>{ontology.classes.reduce((total, item) => total + item.attributes.length, 0)}</dd>
          </div>
          <div className="stat">
            <dt>In picker</dt>
            <dd>{summaries.length}</dd>
          </div>
        </dl>
        <p className="form__hint">
          Select a class or relation on the canvas or in the explorer to inspect it. Click empty
          canvas space to return here.
        </p>
      </div>

      <div className="form__section form__section--danger">
        <h3 className="form__section-title">Danger zone</h3>
        <p className="form__hint">Deleting an ontology cannot be undone.</p>
        <button type="button" className="btn btn--danger btn--block" data-testid="btn-delete-ontology" onClick={deleteOntology}>
          Delete ontology
        </button>
      </div>
    </div>
  );
}
