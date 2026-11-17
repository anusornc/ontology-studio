import { useMemo } from "react";
import { useOntologyStore } from "../state/context";

const CARDINALITY_LABEL: Record<string, string> = {
  "one-to-one": "1 : 1",
  "one-to-many": "1 : N",
  "many-to-one": "N : 1",
  "many-to-many": "N : N"
};

/** Flat list of object properties with their endpoints and cardinality. */
export function RelationsList() {
  const ontology = useOntologyStore((state) => state.ontology);
  const selected = useOntologyStore((state) => state.selected);
  const select = useOntologyStore((state) => state.select);

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const ontologyClass of ontology?.classes ?? []) {
      map.set(ontologyClass.id, ontologyClass.label.trim() || ontologyClass.name);
    }
    return map;
  }, [ontology]);

  const relations = ontology?.relations ?? [];

  if (relations.length === 0) {
    return (
      <div className="sidebar-empty">
        No relations yet. Drag from a class handle to another class on the canvas to create one.
      </div>
    );
  }

  return (
    <ul className="relations-list" aria-label="Relations">
      {relations.map((relation) => {
        const isSelected = selected?.kind === "relation" && selected.id === relation.id;
        return (
          <li key={relation.id}>
            <button
              type="button"
              className={`relation-item${isSelected ? " relation-item--selected" : ""}`}
              data-testid={`relation-item-${relation.id}`}
              onClick={() => select({ kind: "relation", id: relation.id })}
            >
              <span className="relation-item__top">
                <span className="relation-item__label">{relation.label.trim() || relation.name}</span>
                <span className="pill pill--violet">{CARDINALITY_LABEL[relation.cardinality] ?? relation.cardinality}</span>
              </span>
              <span className="relation-item__endpoints">
                {labels.get(relation.sourceClassId) ?? "?"}
                <span className="relation-item__arrow" aria-hidden="true">
                  →
                </span>
                {labels.get(relation.targetClassId) ?? "?"}
              </span>
              <span className="relation-item__name">{relation.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
