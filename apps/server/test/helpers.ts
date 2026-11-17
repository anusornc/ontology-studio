/**
 * Shared test fixtures.
 *
 * Ontologies are built as plain literals (not via `@onto/core` factories) so the
 * fixtures stay independent of factory defaults and read like the stored
 * document shape from `packages/ontology-core/src/types.ts`.
 */
import type { Ontology, OntologyClass, OntologyRelation } from "@onto/core";

export function makeClass(overrides: Partial<OntologyClass> = {}): OntologyClass {
  return {
    id: "class-person",
    name: "Person",
    label: "Person",
    description: "",
    parentId: null,
    color: "#22d3ee",
    attributes: [],
    position: { x: 0, y: 0 },
    ...overrides
  };
}

export function makeRelation(overrides: Partial<OntologyRelation> = {}): OntologyRelation {
  return {
    id: "relation-enrolled-in",
    name: "enrolledIn",
    label: "enrolled in",
    description: "",
    sourceClassId: "class-student",
    targetClassId: "class-person",
    cardinality: "many-to-many",
    ...overrides
  };
}

/**
 * A small but complete ontology: Person <- Student inheritance, one typed
 * attribute and one relation. Pass overrides to vary identity/timestamps.
 */
export function makeOntology(overrides: Partial<Ontology> = {}): Ontology {
  const person = makeClass({ id: "class-person", name: "Person", label: "Person" });
  const student = makeClass({
    id: "class-student",
    name: "Student",
    label: "Student",
    parentId: "class-person",
    attributes: [
      {
        id: "attr-full-name",
        name: "fullName",
        label: "Full name",
        datatype: "string",
        required: true,
        cardinality: "one",
        description: "",
        enumValues: []
      }
    ]
  });

  return {
    id: "ont-university",
    name: "University",
    description: "A small university ontology.",
    version: "0.1.0",
    baseIri: "https://example.org/ontology/university",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    classes: [person, student],
    relations: [makeRelation()],
    ...overrides
  };
}
