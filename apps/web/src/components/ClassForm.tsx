import {
  ATTRIBUTE_CARDINALITIES,
  DATATYPES,
  PALETTE,
  addAttribute,
  classDescendants,
  createAttribute,
  findClass,
  removeAttribute,
  removeClass,
  suggestUniqueAttributeName,
  updateAttribute,
  updateClass,
  type OntologyAttribute,
  type OntologyClass
} from "@onto/core";
import { useEffect, useRef } from "react";
import { useOntologyStore } from "../state/context";

interface AttributeRowProps {
  ontologyClass: OntologyClass;
  attribute: OntologyAttribute;
}

function AttributeRow({ ontologyClass, attribute }: AttributeRowProps) {
  const mutate = useOntologyStore((state) => state.mutate);
  const inputId = `attr-${attribute.id}`;

  function patch(changes: Partial<OntologyAttribute>) {
    mutate((ontology) => updateAttribute(ontology, ontologyClass.id, attribute.id, changes));
  }

  return (
    <div className="attr-card" data-testid={`attr-row-${attribute.id}`}>
      <div className="attr-card__head">
        <label className="field field--grow">
          <span className="field__label">Name</span>
          <input
            id={`${inputId}-name`}
            className="input input--mono"
            data-testid={`attr-name-${attribute.id}`}
            aria-label={`Attribute name for ${attribute.label || attribute.name}`}
            value={attribute.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>
        <label className="field field--tiny">
          <span className="field__label">Type</span>
          <select
            id={`${inputId}-datatype`}
            className="input"
            data-testid={`attr-datatype-${attribute.id}`}
            aria-label="Attribute datatype"
            value={attribute.datatype}
            onChange={(event) => patch({ datatype: event.target.value as OntologyAttribute["datatype"] })}
          >
            {DATATYPES.map((datatype) => (
              <option key={datatype} value={datatype}>
                {datatype}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          data-testid={`attr-delete-${attribute.id}`}
          aria-label={`Delete attribute ${attribute.label || attribute.name}`}
          title="Delete attribute"
          onClick={() => mutate((ontology) => removeAttribute(ontology, ontologyClass.id, attribute.id))}
        >
          ×
        </button>
      </div>
      <div className="attr-card__grid">
        <label className="field">
          <span className="field__label">Label</span>
          <input
            className="input"
            aria-label="Attribute label"
            value={attribute.label}
            onChange={(event) => patch({ label: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Cardinality</span>
          <select
            className="input"
            aria-label="Attribute cardinality"
            value={attribute.cardinality}
            onChange={(event) => patch({ cardinality: event.target.value as OntologyAttribute["cardinality"] })}
          >
            {ATTRIBUTE_CARDINALITIES.map((cardinality) => (
              <option key={cardinality} value={cardinality}>
                {cardinality}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Allowed values</span>
          <input
            key={attribute.id}
            className="input"
            aria-label="Allowed values (comma separated)"
            placeholder="comma separated, optional"
            defaultValue={attribute.enumValues.join(", ")}
            onBlur={(event) => {
              const enumValues = event.target.value
                .split(",")
                .map((value) => value.trim())
                .filter((value) => value.length > 0);
              patch({ enumValues });
            }}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            data-testid={`attr-required-${attribute.id}`}
            aria-label="Attribute required"
            checked={attribute.required}
            onChange={(event) => patch({ required: event.target.checked })}
          />
          <span>Required</span>
        </label>
      </div>
    </div>
  );
}

/** Inspector form for the selected class: identity, inheritance and attributes. */
export function ClassForm() {
  const ontology = useOntologyStore((state) => state.ontology);
  const selected = useOntologyStore((state) => state.selected);
  const mutate = useOntologyStore((state) => state.mutate);
  const select = useOntologyStore((state) => state.select);
  const focusToken = useOntologyStore((state) => state.classLabelFocusToken);
  const labelRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusToken > 0) labelRef.current?.focus();
  }, [focusToken]);

  if (!ontology || selected?.kind !== "class") return null;
  const ontologyClass = findClass(ontology, selected.id);
  if (!ontologyClass) return null;

  const classId = ontologyClass.id;
  const classLabel = ontologyClass.label || ontologyClass.name;
  const blockedParents = new Set<string>([
    classId,
    ...classDescendants(ontology, classId).map((item) => item.id)
  ]);
  const parentOptions = ontology.classes.filter((item) => !blockedParents.has(item.id));
  const parent = ontologyClass.parentId ? findClass(ontology, ontologyClass.parentId) : null;

  function patch(changes: Parameters<typeof updateClass>[2]) {
    mutate((current) => updateClass(current, classId, changes));
  }

  function addNewAttribute() {
    mutate((current) =>
      addAttribute(
        current,
        classId,
        createAttribute({
          name: suggestUniqueAttributeName(current, classId, "attribute"),
          label: "New attribute"
        })
      )
    );
  }

  function deleteClass() {
    const confirmed = window.confirm(
      `Delete class "${classLabel}"? Its attributes and every relation touching it will be removed.`
    );
    if (!confirmed) return;
    mutate((current) => removeClass(current, classId));
    select(null);
  }

  return (
    <div className="form">
      <div className="form__section">
        <div className="form__section-head">
          <h3 className="form__section-title">Class</h3>
          <span className="pill pill--cyan">owl:Class</span>
        </div>
        <label className="field">
          <span className="field__label">Label</span>
          <input
            ref={labelRef}
            className="input"
            data-testid="field-class-label"
            aria-label="Class label"
            value={ontologyClass.label}
            onChange={(event) => patch({ label: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Machine name</span>
          <input
            className="input input--mono"
            data-testid="field-class-name"
            aria-label="Class machine name"
            value={ontologyClass.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">Description</span>
          <textarea
            className="input input--area"
            data-testid="field-class-description"
            aria-label="Class description"
            rows={3}
            value={ontologyClass.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
        <div className="field-row">
          <label className="field field--half">
            <span className="field__label">Parent class</span>
            <select
              className="input"
              data-testid="select-parent"
              aria-label="Parent class"
              value={ontologyClass.parentId ?? ""}
              onChange={(event) => patch({ parentId: event.target.value || null })}
            >
              <option value="">No parent (root)</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label.trim() || option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--half">
            <span className="field__label">Colour</span>
            <span className="color-field">
              <input
                type="color"
                className="input input--color"
                data-testid="field-class-color"
                aria-label="Class colour"
                value={ontologyClass.color}
                onChange={(event) => patch({ color: event.target.value })}
              />
              <span className="color-field__value">{ontologyClass.color}</span>
            </span>
          </label>
        </div>
        <div className="palette" role="group" aria-label="Class colour palette">
          {PALETTE.map((colour) => (
            <button
              key={colour}
              type="button"
              className={`palette__swatch${ontologyClass.color === colour ? " palette__swatch--active" : ""}`}
              style={{ background: colour }}
              aria-label={`Use colour ${colour}`}
              onClick={() => patch({ color: colour })}
            />
          ))}
        </div>
        <p className="form__hint">
          {parent
            ? `Inherits from ${parent.label.trim() || parent.name}.`
            : "Root class — it does not inherit from another class."}
        </p>
      </div>

      <div className="form__section">
        <div className="form__section-head">
          <h3 className="form__section-title">Attributes</h3>
          <span className="pill pill--muted">{ontologyClass.attributes.length}</span>
        </div>
        <div className="attrs">
          {ontologyClass.attributes.map((attribute) => (
            <AttributeRow key={attribute.id} ontologyClass={ontologyClass} attribute={attribute} />
          ))}
          {ontologyClass.attributes.length === 0 && (
            <p className="sidebar-empty">No attributes yet. Add datatype properties below.</p>
          )}
        </div>
        <button type="button" className="btn btn--secondary btn--block" data-testid="btn-add-attribute" onClick={addNewAttribute}>
          <span aria-hidden="true">＋</span> Add attribute
        </button>
      </div>

      <div className="form__section form__section--danger">
        <h3 className="form__section-title">Danger zone</h3>
        <p className="form__hint">Deleting a class cascades to its attributes and relations.</p>
        <button type="button" className="btn btn--danger btn--block" data-testid="btn-delete-class" onClick={deleteClass}>
          Delete class
        </button>
      </div>
    </div>
  );
}
