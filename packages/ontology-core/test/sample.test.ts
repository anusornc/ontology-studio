import { describe, expect, it } from "vitest";

import {
  DATATYPES,
  buildClassTree,
  classDescendants,
  createSampleOntology,
  exportJsonLd,
  exportTurtle,
  parseOntology,
  serializeOntology,
  validateOntology
} from "../src/index";
import type { Datatype } from "../src/index";

function sampleDatatypes(): Set<Datatype> {
  const datatypes = new Set<Datatype>();
  for (const ontologyClass of createSampleOntology().classes) {
    for (const attribute of ontologyClass.attributes) {
      datatypes.add(attribute.datatype);
    }
  }
  return datatypes;
}

describe("createSampleOntology", () => {
  it("is a University ontology with metadata and positioned classes", () => {
    const ontology = createSampleOntology();

    expect(ontology.name).toBe("University");
    expect(ontology.description.length).toBeGreaterThan(0);
    expect(ontology.version).toBe("0.1.0");
    expect(ontology.baseIri).toBe("https://example.org/ontology/university");
    expect(ontology.classes.length).toBeGreaterThanOrEqual(6);
    expect(ontology.relations.length).toBeGreaterThanOrEqual(3);

    const positions = new Set(
      ontology.classes.map((item) => `${item.position.x},${item.position.y}`)
    );
    expect(positions.size).toBe(ontology.classes.length);
    expect(positions.has("0,0")).toBe(false);
  });

  it("validates with zero errors and zero warnings", () => {
    const report = validateOntology(createSampleOntology());

    expect(report.issues).toEqual([]);
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("contains a real inheritance tree", () => {
    const ontology = createSampleOntology();
    const university = ontology.classes.find((item) => item.name === "University");
    expect(university?.parentId).toBeNull();

    const descendants = classDescendants(ontology, university?.id ?? "");
    expect(descendants.length).toBe(ontology.classes.length - 1);
    expect(descendants.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Person", "Student", "Professor", "Course", "Department"])
    );

    const tree = buildClassTree(ontology);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.class.name).toBe("University");
    expect(tree[0]?.children.length).toBeGreaterThanOrEqual(4);
  });

  it("covers every datatype with attributes", () => {
    const datatypes = sampleDatatypes();

    expect([...datatypes].sort()).toEqual([...DATATYPES].sort());
    for (const ontologyClass of createSampleOntology().classes) {
      expect(ontologyClass.attributes.length).toBeGreaterThan(0);
    }
  });

  it("has relations with resolvable endpoints", () => {
    const ontology = createSampleOntology();
    const classIds = new Set(ontology.classes.map((item) => item.id));
    const names = new Set<string>();

    for (const relation of ontology.relations) {
      expect(classIds.has(relation.sourceClassId)).toBe(true);
      expect(classIds.has(relation.targetClassId)).toBe(true);
      expect(relation.sourceClassId).not.toBe(relation.targetClassId);
      expect(names.has(relation.name)).toBe(false);
      names.add(relation.name);
      expect(relation.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("is deterministic and round-trips through native JSON", () => {
    const first = createSampleOntology();
    const second = createSampleOntology();

    expect(first).toEqual(second);
    expect(parseOntology(serializeOntology(first))).toEqual(first);
  });

  it("exports non-empty Turtle and JSON-LD", () => {
    const ontology = createSampleOntology();
    const turtle = exportTurtle(ontology);
    const jsonLd = exportJsonLd(ontology);

    expect(turtle).toContain("@prefix : <https://example.org/ontology/university#> .");
    expect(turtle).toContain("a owl:Class");
    expect(jsonLd["@graph"].length).toBe(
      ontology.classes.length +
        ontology.classes.reduce((count, item) => count + item.attributes.length, 0) +
        ontology.relations.length
    );
  });
});
