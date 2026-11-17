import { describe, expect, it } from "vitest";

import {
  autoLayout,
  buildClassTree,
  classAncestors,
  classChildren,
  classDescendants,
  createAttribute,
  createClass,
  createOntology,
  createRelation,
  findAttribute,
  findClass,
  findRelation,
  iriFor,
  summarizeOntology
} from "../src/index";
import type { Ontology, OntologyClass, OntologyRelation } from "../src/index";

const CREATED_AT = "2024-01-01T00:00:00.000Z";

function fixture(classes: OntologyClass[], relations: OntologyRelation[] = []): Ontology {
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

function person(): OntologyClass {
  return createClass({ label: "Person", id: "class-person" });
}

function student(): OntologyClass {
  return createClass({ label: "Student", id: "class-student", parentId: "class-person" });
}

function professor(): OntologyClass {
  return createClass({ label: "Professor", id: "class-professor", parentId: "class-person" });
}

function graduate(): OntologyClass {
  return createClass({
    label: "Graduate Student",
    id: "class-graduate",
    parentId: "class-student"
  });
}

describe("find*", () => {
  const ontology = fixture(
    [
      createClass({
        label: "Person",
        id: "class-person",
        attributes: [createAttribute({ name: "fullName", id: "attr-name" })]
      })
    ],
    [
      createRelation({
        label: "mentors",
        sourceClassId: "class-person",
        targetClassId: "class-person",
        id: "rel-1"
      })
    ]
  );

  it("finds entities by id", () => {
    expect(findClass(ontology, "class-person")?.label).toBe("Person");
    expect(findAttribute(ontology, "attr-name")?.name).toBe("fullName");
    expect(findRelation(ontology, "rel-1")?.name).toBe("mentors");
  });

  it("returns undefined for unknown ids", () => {
    expect(findClass(ontology, "missing")).toBeUndefined();
    expect(findAttribute(ontology, "missing")).toBeUndefined();
    expect(findRelation(ontology, "missing")).toBeUndefined();
  });
});

describe("classChildren", () => {
  it("returns direct children in input order", () => {
    const childCourse = createClass({ label: "Course", id: "class-course", parentId: "class-person" });
    const ontology = fixture([person(), student(), childCourse]);

    expect(classChildren(ontology, "class-person").map((item) => item.id)).toEqual([
      "class-student",
      "class-course"
    ]);
  });

  it("returns an empty array for leaves and unknown ids", () => {
    const ontology = fixture([person(), student()]);
    expect(classChildren(ontology, "class-student")).toEqual([]);
    expect(classChildren(ontology, "missing")).toEqual([]);
  });
});

describe("classAncestors", () => {
  it("returns ancestors nearest-first", () => {
    const ontology = fixture([person(), student(), graduate()]);
    expect(classAncestors(ontology, "class-graduate").map((item) => item.id)).toEqual([
      "class-student",
      "class-person"
    ]);
  });

  it("returns an empty array for roots, unknown ids and orphaned classes", () => {
    const orphan = createClass({ label: "Orphan", id: "class-orphan", parentId: "missing" });
    const ontology = fixture([person(), orphan]);

    expect(classAncestors(ontology, "class-person")).toEqual([]);
    expect(classAncestors(ontology, "missing")).toEqual([]);
    expect(classAncestors(ontology, "class-orphan")).toEqual([]);
  });

  it("is cycle-safe", () => {
    const a = createClass({ label: "A", id: "class-a", parentId: "class-b" });
    const b = createClass({ label: "B", id: "class-b", parentId: "class-a" });
    const ontology = fixture([a, b]);

    expect(classAncestors(ontology, "class-a").map((item) => item.id)).toEqual(["class-b"]);
  });
});

describe("classDescendants", () => {
  it("returns all descendants depth-first, excluding the class itself", () => {
    const ontology = fixture([person(), student(), professor(), graduate()]);

    expect(classDescendants(ontology, "class-person").map((item) => item.id)).toEqual([
      "class-student",
      "class-graduate",
      "class-professor"
    ]);
  });

  it("returns an empty array for leaves and unknown ids", () => {
    const ontology = fixture([person(), student()]);
    expect(classDescendants(ontology, "class-student")).toEqual([]);
    expect(classDescendants(ontology, "missing")).toEqual([]);
  });

  it("is cycle-safe", () => {
    const a = createClass({ label: "A", id: "class-a", parentId: "class-b" });
    const b = createClass({ label: "B", id: "class-b", parentId: "class-a" });
    const ontology = fixture([a, b]);

    expect(classDescendants(ontology, "class-a").map((item) => item.id)).toEqual(["class-b"]);
  });
});

describe("buildClassTree", () => {
  it("nests children, sorts siblings by label and keeps orphans as roots", () => {
    const rootZ = createClass({ label: "Zeta", name: "ZetaClass", id: "root-z" });
    const rootA = createClass({ label: "Alpha", name: "AlphaClass", id: "root-a" });
    const childZ = createClass({ label: "Zulu", id: "child-z", parentId: "root-a" });
    const childA = createClass({ label: "Bravo", id: "child-a", parentId: "root-a" });
    const orphan = createClass({ label: "Omega", id: "orphan", parentId: "missing" });
    const ontology = fixture([rootZ, rootA, childZ, childA, orphan]);

    const tree = buildClassTree(ontology);

    expect(tree.map((node) => node.class.id)).toEqual(["root-a", "orphan", "root-z"]);
    expect(tree[0]?.children.map((node) => node.class.id)).toEqual(["child-a", "child-z"]);
    expect(tree[1]?.children).toEqual([]);
  });

  it("uses the machine name as a tie-breaker when labels match", () => {
    const beta = createClass({ label: "Same", name: "Beta", id: "class-beta" });
    const alpha = createClass({ label: "Same", name: "Alpha", id: "class-alpha" });
    const tree = buildClassTree(fixture([beta, alpha]));

    expect(tree.map((node) => node.class.id)).toEqual(["class-alpha", "class-beta"]);
  });

  it("does not recurse forever on inheritance cycles", () => {
    const a = createClass({ label: "A", id: "class-a", parentId: "class-b" });
    const b = createClass({ label: "B", id: "class-b", parentId: "class-a" });
    const tree = buildClassTree(fixture([a, b]));

    expect(tree).toEqual([]);
  });
});

describe("autoLayout", () => {
  it("places classes by depth and by name within a depth", () => {
    const beta = createClass({ label: "Beta", id: "class-beta" });
    const alpha = createClass({ label: "Alpha", id: "class-alpha" });
    const alphaChild = createClass({
      label: "AlphaChild",
      id: "class-alpha-child",
      parentId: "class-alpha"
    });
    const orphan = createClass({ label: "Omega", id: "class-orphan", parentId: "missing" });
    const ontology = fixture([beta, alpha, alphaChild, orphan]);

    const laidOut = autoLayout(ontology);
    const byId = new Map(laidOut.classes.map((item) => [item.id, item]));

    expect(byId.get("class-alpha")?.position).toEqual({ x: 40, y: 40 });
    expect(byId.get("class-beta")?.position).toEqual({ x: 40, y: 220 });
    expect(byId.get("class-orphan")?.position).toEqual({ x: 40, y: 400 });
    expect(byId.get("class-alpha-child")?.position).toEqual({ x: 360, y: 40 });
  });

  it("is deterministic and preserves timestamps and other fields", () => {
    const ontology = fixture([person(), student()]);
    const first = autoLayout(ontology);
    const second = autoLayout(ontology);

    expect(first).toEqual(second);
    expect(first.createdAt).toBe(CREATED_AT);
    expect(first.updatedAt).toBe(CREATED_AT);
    expect(first.classes[0]?.label).toBe("Person");
    expect(first.classes[0]?.attributes).toEqual(ontology.classes[0]?.attributes);
    expect(ontology.classes[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it("is cycle-safe", () => {
    const a = createClass({ label: "A", id: "class-a", parentId: "class-b" });
    const b = createClass({ label: "B", id: "class-b", parentId: "class-a" });
    const laidOut = autoLayout(fixture([a, b]));

    // Each node has exactly one existing ancestor before the walk stops at the
    // repeated id, so both land at depth 1; ordering by name is deterministic.
    expect(laidOut.classes.map((item) => item.position)).toEqual([
      { x: 360, y: 40 },
      { x: 360, y: 220 }
    ]);
  });
});

describe("summarizeOntology", () => {
  it("projects the list summary fields and counts", () => {
    const ontology = fixture(
      [person(), student()],
      [
        createRelation({
          label: "mentors",
          sourceClassId: "class-person",
          targetClassId: "class-student",
          id: "rel-1"
        })
      ]
    );

    expect(summarizeOntology(ontology)).toEqual({
      id: "onto-1",
      name: "University",
      description: "",
      version: "0.1.0",
      classCount: 2,
      relationCount: 1,
      updatedAt: CREATED_AT
    });
  });
});

describe("iriFor", () => {
  it("joins the base IRI and local name with a hash", () => {
    const ontology = fixture([]);
    expect(iriFor(ontology, "Person")).toBe("https://example.org/ontology/university#Person");
  });
});
