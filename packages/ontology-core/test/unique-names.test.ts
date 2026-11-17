import { describe, expect, it } from "vitest";

import {
  createAttribute,
  createClass,
  createOntology,
  createRelation,
  suggestUniqueAttributeName,
  suggestUniqueClassName,
  suggestUniqueRelationName
} from "../src/index";
import type { Ontology, OntologyClass } from "../src/index";

function ontologyWithClasses(classes: OntologyClass[]): Ontology {
  return {
    ...createOntology({ name: "Fixture", id: "onto-1", now: "2024-01-01T00:00:00.000Z" }),
    classes
  };
}

describe("suggestUniqueClassName", () => {
  it("returns the base name when it is free", () => {
    const ontology = ontologyWithClasses([]);
    expect(suggestUniqueClassName(ontology, "Research Project")).toBe("ResearchProject");
  });

  it("appends 2, then 3, ... until the name is unique", () => {
    const ontology = ontologyWithClasses([
      createClass({ label: "Research Project", id: "c1" }),
      createClass({ label: "Research Project 2", name: "ResearchProject2", id: "c2" })
    ]);

    expect(suggestUniqueClassName(ontology, "Research Project")).toBe("ResearchProject3");
  });

  it("uses the stable fallback name for unnameable labels", () => {
    const ontology = ontologyWithClasses([createClass({ name: "Entity", id: "c1" })]);
    expect(suggestUniqueClassName(ontology, "日本語")).toBe("Entity2");
  });
});

describe("suggestUniqueAttributeName", () => {
  it("scopes uniqueness to the owning class", () => {
    const target = createClass({
      label: "Course",
      id: "class-course",
      attributes: [createAttribute({ name: "startDate", id: "a1" })]
    });
    const other = createClass({
      label: "Event",
      id: "class-event",
      attributes: [createAttribute({ name: "title", id: "a2" })]
    });
    const ontology = ontologyWithClasses([target, other]);

    expect(suggestUniqueAttributeName(ontology, "class-course", "Start date")).toBe("startDate2");
    expect(suggestUniqueAttributeName(ontology, "class-event", "Start date")).toBe("startDate");
    expect(suggestUniqueAttributeName(ontology, "class-event", "Title")).toBe("title2");
  });

  it("falls back to the base name for a missing class", () => {
    const ontology = ontologyWithClasses([]);
    expect(suggestUniqueAttributeName(ontology, "nope", "Start date")).toBe("startDate");
  });
});

describe("suggestUniqueRelationName", () => {
  it("appends a numeric suffix when the name is taken", () => {
    const ontology: Ontology = {
      ...ontologyWithClasses([]),
      relations: [
        createRelation({
          label: "enrolled in",
          sourceClassId: "a",
          targetClassId: "b",
          id: "r1"
        })
      ]
    };

    expect(suggestUniqueRelationName(ontology, "enrolled in")).toBe("enrolledIn2");
    expect(suggestUniqueRelationName(ontology, "teaches")).toBe("teaches");
  });
});
