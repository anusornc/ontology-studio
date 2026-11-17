import { describe, expect, it } from "vitest";

import {
  createAttribute,
  createClass,
  createOntology,
  createRelation,
  validateOntology
} from "../src/index";
import type {
  Ontology,
  OntologyClass,
  OntologyRelation,
  ValidationReport
} from "../src/index";

const CREATED_AT = "2024-01-01T00:00:00.000Z";

function ontologyWith(
  classes: OntologyClass[],
  relations: OntologyRelation[] = []
): Ontology {
  return {
    ...createOntology({
      name: "University",
      id: "onto-1",
      now: CREATED_AT,
      baseIri: "https://example.org/ontology/university"
    }),
    classes,
    relations
  };
}

function relation(
  id: string,
  sourceClassId: string,
  targetClassId: string,
  overrides: Partial<OntologyRelation> = {}
): OntologyRelation {
  return {
    ...createRelation({
      label: "relates to",
      name: "relatesTo",
      sourceClassId,
      targetClassId,
      id
    }),
    ...overrides
  };
}

function codes(report: ValidationReport): string[] {
  return report.issues.map((item) => item.code);
}

function onlyClass(name: string, id = "class-1"): OntologyClass {
  return createClass({ label: name, name, id });
}

describe("validateOntology: clean ontology", () => {
  it("reports no issues for a well-formed ontology", () => {
    const report = validateOntology(ontologyWith([onlyClass("Person")]));

    expect(report).toEqual({ ok: true, issues: [], errors: 0, warnings: 0 });
  });
});

describe("validateOntology: ontology-level issues", () => {
  it("warns about an empty ontology without failing it", () => {
    const report = validateOntology(ontologyWith([]));

    expect(codes(report)).toEqual(["empty-ontology"]);
    expect(report.ok).toBe(true);
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(1);
    expect(report.issues[0]).toMatchObject({
      severity: "warning",
      entity: "ontology",
      entityId: "onto-1"
    });
    expect(report.issues[0]?.ownerId).toBeUndefined();
  });

  it("rejects base IRIs that are not absolute http(s) URLs", () => {
    for (const baseIri of ["not-a-url", "ftp://example.org/onto", "", "/relative/path"]) {
      const report = validateOntology({ ...ontologyWith([onlyClass("Person")]), baseIri });
      expect(codes(report)).toEqual(["invalid-base-iri"]);
      expect(report.errors).toBe(1);
      expect(report.ok).toBe(false);
      expect(report.issues[0]?.message).toContain(baseIri === "" ? '""' : baseIri);
    }
  });

  it("rejects base IRIs with whitespace or a trailing hash", () => {
    for (const baseIri of ["https://example.org/onto with space", "https://example.org/onto#"]) {
      const report = validateOntology({ ...ontologyWith([onlyClass("Person")]), baseIri });
      expect(codes(report)).toEqual(["invalid-base-iri"]);
    }
  });

  it("emits ontology-level issues before class issues", () => {
    const report = validateOntology({
      ...ontologyWith([createClass({ label: "Person", name: "1Person", id: "class-1" })]),
      baseIri: "nope"
    });

    expect(codes(report)).toEqual(["invalid-base-iri", "invalid-class-name"]);
  });
});

describe("validateOntology: class name and label issues", () => {
  it("flags every duplicate class name after the first", () => {
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Person", name: "Person", id: "class-a" }),
        createClass({ label: "Person Two", name: "Person", id: "class-b" }),
        createClass({ label: "Person Three", name: "Person", id: "class-c" })
      ])
    );

    const duplicates = report.issues.filter((item) => item.code === "duplicate-class-name");
    expect(duplicates.map((item) => item.entityId)).toEqual(["class-b", "class-c"]);
    expect(duplicates.every((item) => item.severity === "error" && item.entity === "class")).toBe(
      true
    );
    expect(duplicates[0]?.ownerId).toBeUndefined();
    expect(duplicates[0]?.message).toContain("Person");
    expect(report.errors).toBe(2);
  });

  it("compares class names case-sensitively", () => {
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Person", name: "Person", id: "class-a" }),
        createClass({ label: "Lowercase person", name: "person", id: "class-b" })
      ])
    );

    expect(codes(report)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("warns about duplicate normalised labels", () => {
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Person", name: "Person", id: "class-a" }),
        createClass({ label: "  person  ", name: "Human", id: "class-b" })
      ])
    );

    const duplicates = report.issues.filter((item) => item.code === "duplicate-class-label");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      severity: "warning",
      entity: "class",
      entityId: "class-b"
    });
    expect(report.ok).toBe(true);
  });

  it("rejects class names that are not identifiers", () => {
    const emptyName = { ...createClass({ label: "Bad Three", id: "class-c" }), name: "" };
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Bad One", name: "1Person", id: "class-a" }),
        createClass({ label: "Bad Two", name: "Has-Dash", id: "class-b" }),
        emptyName
      ])
    );

    const invalid = report.issues.filter((item) => item.code === "invalid-class-name");
    expect(invalid.map((item) => item.entityId)).toEqual(["class-a", "class-b", "class-c"]);
    expect(invalid.every((item) => item.severity === "error")).toBe(true);
    expect(invalid[1]?.message).toContain("Has-Dash");
    expect(report.errors).toBe(3);
  });

  it("warns about empty class labels", () => {
    const report = validateOntology(
      ontologyWith([createClass({ label: "   ", name: "Person", id: "class-a" })])
    );

    expect(codes(report)).toEqual(["empty-class-label"]);
    expect(report.issues[0]).toMatchObject({
      severity: "warning",
      entity: "class",
      entityId: "class-a"
    });
    expect(report.issues[0]?.message).toContain("Person");
    expect(report.ok).toBe(true);
    expect(report.warnings).toBe(1);
  });
});

describe("validateOntology: inheritance issues", () => {
  it("flags unknown parent ids", () => {
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Person", name: "Person", id: "class-person" }),
        createClass({
          label: "Student",
          name: "Student",
          id: "class-student",
          parentId: "class-missing"
        })
      ])
    );

    expect(codes(report)).toEqual(["unknown-parent"]);
    expect(report.issues[0]).toMatchObject({
      severity: "error",
      entity: "class",
      entityId: "class-student"
    });
    expect(report.issues[0]?.message).toContain("Student");
    expect(report.issues[0]?.message).toContain("class-missing");
  });

  it("flags self-inheritance once, without a separate cycle error", () => {
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Person", name: "Person", id: "class-person", parentId: "class-person" })
      ])
    );

    expect(codes(report)).toEqual(["self-inheritance"]);
    expect(report.issues[0]).toMatchObject({
      severity: "error",
      entity: "class",
      entityId: "class-person"
    });
  });

  it("reports one inheritance-cycle issue per cycle with names in cycle order", () => {
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Alpha", name: "Alpha", id: "class-a", parentId: "class-b" }),
        createClass({ label: "Beta", name: "Beta", id: "class-b", parentId: "class-c" }),
        createClass({ label: "Gamma", name: "Gamma", id: "class-c", parentId: "class-a" })
      ])
    );

    expect(codes(report)).toEqual(["inheritance-cycle"]);
    expect(report.issues[0]).toMatchObject({
      severity: "error",
      entity: "class",
      entityId: "class-a"
    });
    expect(report.issues[0]?.message).toContain("Alpha -> Beta -> Gamma -> Alpha");
    expect(report.errors).toBe(1);
  });

  it("reports separate cycles independently and does not hang", () => {
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Alpha", name: "Alpha", id: "class-a", parentId: "class-b" }),
        createClass({ label: "Beta", name: "Beta", id: "class-b", parentId: "class-a" }),
        createClass({ label: "Delta", name: "Delta", id: "class-d", parentId: "class-e" }),
        createClass({ label: "Epsilon", name: "Epsilon", id: "class-e", parentId: "class-d" })
      ])
    );

    const cycles = report.issues.filter((item) => item.code === "inheritance-cycle");
    expect(cycles.map((item) => item.entityId).sort()).toEqual(["class-a", "class-d"]);
    expect(report.errors).toBe(2);
  });

  it("does not flag a valid inheritance chain", () => {
    const report = validateOntology(
      ontologyWith([
        createClass({ label: "Person", name: "Person", id: "class-person" }),
        createClass({
          label: "Student",
          name: "Student",
          id: "class-student",
          parentId: "class-person"
        })
      ])
    );

    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe("validateOntology: attribute issues", () => {
  it("flags duplicate attribute names within one class only", () => {
    const person = createClass({
      label: "Person",
      name: "Person",
      id: "class-person",
      attributes: [
        createAttribute({ name: "email", id: "attr-a" }),
        createAttribute({ name: "email", id: "attr-b" })
      ]
    });
    const course = createClass({
      label: "Course",
      name: "Course",
      id: "class-course",
      attributes: [createAttribute({ name: "email", id: "attr-c" })]
    });
    const report = validateOntology(ontologyWith([person, course]));

    expect(codes(report)).toEqual(["duplicate-attribute-name"]);
    expect(report.issues[0]).toMatchObject({
      severity: "error",
      entity: "attribute",
      entityId: "attr-b",
      ownerId: "class-person"
    });
    expect(report.issues[0]?.message).toContain("email");
    expect(report.issues[0]?.message).toContain("Person");
  });

  it("rejects attribute names that are not identifiers", () => {
    const person = createClass({
      label: "Person",
      name: "Person",
      id: "class-person",
      attributes: [createAttribute({ name: "has space", id: "attr-a" })]
    });
    const report = validateOntology(ontologyWith([person]));

    expect(codes(report)).toEqual(["invalid-attribute-name"]);
    expect(report.issues[0]).toMatchObject({
      severity: "error",
      entity: "attribute",
      entityId: "attr-a",
      ownerId: "class-person"
    });
    expect(report.issues[0]?.message).toContain("has space");
  });

  it("warns about empty attribute labels and keeps the report ok", () => {
    const person = createClass({
      label: "Person",
      name: "Person",
      id: "class-person",
      attributes: [createAttribute({ name: "email", label: "  ", id: "attr-a" })]
    });
    const report = validateOntology(ontologyWith([person]));

    expect(codes(report)).toEqual(["empty-attribute-label"]);
    expect(report.issues[0]).toMatchObject({
      severity: "warning",
      entity: "attribute",
      entityId: "attr-a",
      ownerId: "class-person"
    });
    expect(report.issues[0]?.message).toContain("email");
    expect(report.ok).toBe(true);
    expect(report.warnings).toBe(1);
  });
});

describe("validateOntology: relation issues", () => {
  const person = createClass({ label: "Person", name: "Person", id: "class-person" });
  const course = createClass({ label: "Course", name: "Course", id: "class-course" });

  it("flags every duplicate relation name after the first", () => {
    const report = validateOntology(
      ontologyWith(
        [person, course],
        [
          relation("rel-a", "class-person", "class-course", { name: "enrolledIn" }),
          relation("rel-b", "class-person", "class-course", { name: "enrolledIn" })
        ]
      )
    );

    expect(codes(report)).toEqual(["duplicate-relation-name"]);
    expect(report.issues[0]).toMatchObject({
      severity: "error",
      entity: "relation",
      entityId: "rel-b",
      ownerId: "class-person"
    });
    expect(report.issues[0]?.message).toContain("enrolledIn");
  });

  it("warns about empty relation labels", () => {
    const report = validateOntology(
      ontologyWith([person, course], [relation("rel-a", "class-person", "class-course", { label: "" })])
    );

    expect(codes(report)).toEqual(["empty-relation-label"]);
    expect(report.issues[0]).toMatchObject({
      severity: "warning",
      entity: "relation",
      entityId: "rel-a",
      ownerId: "class-person"
    });
    expect(report.ok).toBe(true);
  });

  it("flags unknown relation sources without inventing an ownerId", () => {
    const report = validateOntology(
      ontologyWith(
        [person, course],
        [relation("rel-a", "class-missing", "class-course", { name: "enrolledIn" })]
      )
    );

    expect(codes(report)).toEqual(["unknown-relation-source"]);
    expect(report.issues[0]).toMatchObject({
      severity: "error",
      entity: "relation",
      entityId: "rel-a"
    });
    expect(report.issues[0]?.ownerId).toBeUndefined();
    expect(report.issues[0]?.message).toContain("class-missing");
  });

  it("flags unknown relation targets and sets ownerId to the existing source", () => {
    const report = validateOntology(
      ontologyWith(
        [person, course],
        [relation("rel-a", "class-person", "class-missing", { name: "enrolledIn" })]
      )
    );

    expect(codes(report)).toEqual(["unknown-relation-target"]);
    expect(report.issues[0]).toMatchObject({
      severity: "error",
      entity: "relation",
      entityId: "rel-a",
      ownerId: "class-person"
    });
  });

  it("warns about self relations", () => {
    const report = validateOntology(
      ontologyWith(
        [person],
        [relation("rel-a", "class-person", "class-person", { name: "knows" })]
      )
    );

    expect(codes(report)).toEqual(["self-relation"]);
    expect(report.issues[0]).toMatchObject({
      severity: "warning",
      entity: "relation",
      entityId: "rel-a",
      ownerId: "class-person"
    });
    expect(report.ok).toBe(true);
  });
});

describe("validateOntology: ordering and counts", () => {
  it("orders ontology, class, attribute and relation issues deterministically", () => {
    const withAttributes = createClass({
      label: "Person",
      name: "Person",
      id: "class-a",
      attributes: [
        createAttribute({ name: "email", id: "attr-a" }),
        createAttribute({ name: "email", id: "attr-b" })
      ]
    });
    const duplicateName = createClass({ label: "   ", name: "Person", id: "class-b" });
    const report = validateOntology({
      ...ontologyWith(
        [withAttributes, duplicateName],
        [
          relation("rel-a", "class-a", "class-b", { name: "enrolledIn", label: "enrolled in" }),
          relation("rel-b", "class-a", "class-b", { name: "enrolledIn", label: "" })
        ]
      ),
      baseIri: "nope"
    });

    expect(codes(report)).toEqual([
      "invalid-base-iri",
      "duplicate-attribute-name",
      "duplicate-class-name",
      "empty-class-label",
      "duplicate-relation-name",
      "empty-relation-label"
    ]);
    expect(report.errors).toBe(4);
    expect(report.warnings).toBe(2);
    expect(report.ok).toBe(false);
  });
});
