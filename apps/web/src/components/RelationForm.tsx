import {
  RELATION_CARDINALITIES,
  findRelation,
  removeRelation,
  updateRelation,
  type OntologyRelation
} from "@onto/core";
import { useOntologyStore } from "../state/context";

/** Inspector form for the selected relation (object property). */
export function RelationForm() {
  const ontology = useOntologyStore((state) => state.ontology);
  const selected = useOntologyStore((state) => state.selected);
  const mutate = useOntologyStore((state) => state.mutate);
  const select = useOntologyStore((state) => state.select);

  if (!ontology || selected?.kind !== "relation") return null;
  const relation = findRelation(ontology, selected.id);
  if (!relation) return null;

  const classes = ontology.classes;
  const knownClassIds = new Set(classes.map((item) => item.id));
  const relationId = relation.id;

  function patch(changes: Partial<OntologyRelation>) {
    mutate((current) => updateRelation(current, relationId, changes));
  }

  function deleteRelation() {
    mutate((current) => removeRelation(current, relationId));
    select(null);
  }

  return (
    <div className="form">
      <div className="form__section">
        <div className="form__section-head">
          <h3 className="form__section-title">Relation</h3>
          <span className="pill pill--violet">owl:ObjectProperty</span>
        </div>
        <label className="field">
          <span className="field__label">Label</span>
          <input
            className="input"
            data-testid="field-relation-label"
            aria-label="Relation label"
            value={relation.label}
            onChange={(event) => patch({ label: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Machine name</span>
          <input
            className="input input--mono"
            data-testid="field-relation-name"
            aria-label="Relation machine name"
            value={relation.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Cardinality</span>
          <select
            className="input"
            data-testid="select-relation-cardinality"
            aria-label="Relation cardinality"
            value={relation.cardinality}
            onChange={(event) => patch({ cardinality: event.target.value as OntologyRelation["cardinality"] })}
          >
            {RELATION_CARDINALITIES.map((cardinality) => (
              <option key={cardinality} value={cardinality}>
                {cardinality}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label className="field field--half">
            <span className="field__label">Source class</span>
            <select
              className="input"
              data-testid="select-relation-source"
              aria-label="Relation source class"
              value={relation.sourceClassId}
              onChange={(event) => patch({ sourceClassId: event.target.value })}
            >
              {!knownClassIds.has(relation.sourceClassId) && (
                <option value={relation.sourceClassId}>Unknown class</option>
              )}
              {classes.map((ontologyClass) => (
                <option key={ontologyClass.id} value={ontologyClass.id}>
                  {ontologyClass.label.trim() || ontologyClass.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--half">
            <span className="field__label">Target class</span>
            <select
              className="input"
              data-testid="select-relation-target"
              aria-label="Relation target class"
              value={relation.targetClassId}
              onChange={(event) => patch({ targetClassId: event.target.value })}
            >
              {!knownClassIds.has(relation.targetClassId) && (
                <option value={relation.targetClassId}>Unknown class</option>
              )}
              {classes.map((ontologyClass) => (
                <option key={ontologyClass.id} value={ontologyClass.id}>
                  {ontologyClass.label.trim() || ontologyClass.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field__label">Description</span>
          <textarea
            className="input input--area"
            aria-label="Relation description"
            rows={3}
            value={relation.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
        <p className="form__hint">
          Domain: {classes.find((item) => item.id === relation.sourceClassId)?.label ?? "unknown"} ·
          Range: {classes.find((item) => item.id === relation.targetClassId)?.label ?? "unknown"}
        </p>
      </div>

      <div className="form__section form__section--danger">
        <h3 className="form__section-title">Danger zone</h3>
        <p className="form__hint">Deleting a relation keeps both classes intact.</p>
        <button
          type="button"
          className="btn btn--danger btn--block"
          data-testid="btn-delete-relation"
          onClick={deleteRelation}
        >
          Delete relation
        </button>
      </div>
    </div>
  );
}
