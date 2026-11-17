import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addAttribute,
  addClass,
  addRelation,
  createAttribute,
  createClass,
  createOntology,
  createRelation,
  removeAttribute,
  removeClass,
  removeRelation,
  setClassPosition,
  updateAttribute,
  updateClass,
  updateOntologyMeta,
  updateRelation
} from "../src/index";
import type { Ontology, OntologyClass, OntologyRelation } from "../src/index";

const CREATED_AT = "2024-01-01T00:00:00.000Z";
const MUTATION_TIME = "2024-02-02T02:02:02.000Z";

function fixture(classes: OntologyClass[], relations: OntologyRelation[] = []): Ontology {
  return {
    ...createOntology({ name: "University", id: "onto-1", now: CREATED_AT }),
    classes,
    relations
  };
}

function person(): OntologyClass {
  return createClass({ label: "Person", id: "class-person" });
}

function student(parentId: string | null = "class-person"): OntologyClass {
  return createClass({ label: "Student", id: "class-student", parentId });
}

function course(): OntologyClass {
  return createClass({ label: "Course", id: "class-course", parentId: "class-person" });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(MUTATION_TIME));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("addClass", () => {
  it("appends the class and bumps updatedAt on a new aggregate", () => {
    const original = fixture([person()]);
    const next = addClass(original, course());

    expect(next.classes.map((item) => item.id)).toEqual(["class-person", "class-course"]);
    expect(next.updatedAt).toBe(MUTATION_TIME);
    expect(next.createdAt).toBe(CREATED_AT);
    expect(next).not.toBe(original);
    expect(original.classes).toHaveLength(1);
    expect(original.updatedAt).toBe(CREATED_AT);
  });
});

describe("updateClass", () => {
  it("applies a patch and bumps updatedAt without mutating the original", () => {
    const original = fixture([person()]);
    const next = updateClass(original, "class-person", {
      label: "Human Being",
      name: "HumanBeing",
      description: "A person",
      color: "#abcdef",
      position: { x: 320, y: 180 }
    });

    expect(next.classes[0]).toMatchObject({
      id: "class-person",
      label: "Human Being",
      name: "HumanBeing",
      description: "A person",
      color: "#abcdef",
      position: { x: 320, y: 180 }
    });
    expect(next.updatedAt).toBe(MUTATION_TIME);
    expect(original.classes[0]?.label).toBe("Person");
  });

  it("cannot change id or attributes through a patch", () => {
    const original = fixture([
      createClass({
        label: "Person",
        id: "class-person",
        attributes: [createAttribute({ name: "fullName", id: "attr-name" })]
      })
    ]);
    const next = updateClass(original, "class-person", {
      id: "hijacked",
      attributes: [],
      label: "Human"
    } as Partial<OntologyClass>);

    expect(next.classes[0]?.id).toBe("class-person");
    expect(next.classes[0]?.attributes).toHaveLength(1);
    expect(next.classes[0]?.label).toBe("Human");
  });

  it("is a no-op that returns the same aggregate for unknown class ids", () => {
    const original = fixture([person()]);
    expect(updateClass(original, "missing", { label: "Nope" })).toBe(original);
  });
});

describe("removeClass", () => {
  it("removes the class, cascades relations and reparents children", () => {
    const relation = createRelation({
      label: "teaches",
      sourceClassId: "class-person",
      targetClassId: "class-course",
      id: "rel-teaches"
    });
    const original = fixture([person(), student(), course()], [relation]);
    const next = removeClass(original, "class-person");

    expect(next.classes.map((item) => item.id)).toEqual(["class-student", "class-course"]);
    expect(next.classes[0]?.parentId).toBeNull();
    expect(next.classes[1]?.parentId).toBeNull();
    expect(next.relations).toEqual([]);
    expect(next.updatedAt).toBe(MUTATION_TIME);
    expect(original.classes).toHaveLength(3);
    expect(original.relations).toHaveLength(1);
  });

  it("reparents children to the removed class's parent", () => {
    const graduate = createClass({
      label: "GraduateStudent",
      id: "class-graduate",
      parentId: "class-student"
    });
    const original = fixture([person(), student(), graduate]);
    const next = removeClass(original, "class-student");

    expect(next.classes.map((item) => item.id)).toEqual(["class-person", "class-graduate"]);
    expect(next.classes[1]?.parentId).toBe("class-person");
    expect(original.classes).toHaveLength(3);
  });

  it("is a no-op that returns the same aggregate for unknown class ids", () => {
    const original = fixture([person()]);
    expect(removeClass(original, "missing")).toBe(original);
  });

  it("removes relations where the class is either source or target", () => {
    const relations = [
      createRelation({
        label: "enrolled in",
        sourceClassId: "class-student",
        targetClassId: "class-course",
        id: "rel-a"
      }),
      createRelation({
        label: "teaches",
        sourceClassId: "class-person",
        targetClassId: "class-course",
        id: "rel-b"
      }),
      createRelation({
        label: "mentors",
        sourceClassId: "class-person",
        targetClassId: "class-student",
        id: "rel-c"
      })
    ];
    const original = fixture([person(), student(), course()], relations);
    const next = removeClass(original, "class-course");

    expect(next.relations.map((item) => item.id)).toEqual(["rel-c"]);
  });
});

describe("setClassPosition", () => {
  it("updates the position of the target class and bumps updatedAt", () => {
    const original = fixture([person(), student()]);
    const next = setClassPosition(original, "class-student", { x: 640, y: 360 });

    expect(next.classes[1]?.position).toEqual({ x: 640, y: 360 });
    expect(next.classes[0]?.position).toEqual({ x: 0, y: 0 });
    expect(next.updatedAt).toBe(MUTATION_TIME);
    expect(original.classes[1]?.position).toEqual({ x: 0, y: 0 });
  });

  it("is a no-op that returns the same aggregate for unknown class ids", () => {
    const original = fixture([person()]);
    expect(setClassPosition(original, "missing", { x: 1, y: 2 })).toBe(original);
  });
});

describe("attribute mutations", () => {
  it("addAttribute appends to the owning class and bumps updatedAt", () => {
    const withAttributes = createClass({
      label: "Person",
      id: "class-person",
      attributes: [createAttribute({ name: "fullName", id: "attr-name" })]
    });
    const original = fixture([withAttributes]);
    const next = addAttribute(
      original,
      "class-person",
      createAttribute({ name: "email", id: "attr-email" })
    );

    expect(next.classes[0]?.attributes.map((item) => item.id)).toEqual([
      "attr-name",
      "attr-email"
    ]);
    expect(next.updatedAt).toBe(MUTATION_TIME);
    expect(original.classes[0]?.attributes).toHaveLength(1);
  });

  it("addAttribute is a no-op for an unknown class", () => {
    const original = fixture([person()]);
    expect(addAttribute(original, "missing", createAttribute({ name: "email" }))).toBe(original);
  });

  it("updateAttribute patches fields but cannot change the id", () => {
    const withAttributes = createClass({
      label: "Person",
      id: "class-person",
      attributes: [createAttribute({ name: "email", id: "attr-email" })]
    });
    const original = fixture([withAttributes]);
    const next = updateAttribute(original, "class-person", "attr-email", {
      label: "E-mail address",
      datatype: "uri",
      required: true,
      cardinality: "many",
      description: "Contact address",
      enumValues: ["a@example.org"],
      id: "hijacked"
    } as never);

    expect(next.classes[0]?.attributes[0]).toMatchObject({
      id: "attr-email",
      label: "E-mail address",
      datatype: "uri",
      required: true,
      cardinality: "many",
      description: "Contact address",
      enumValues: ["a@example.org"]
    });
    expect(next.updatedAt).toBe(MUTATION_TIME);
  });

  it("updateAttribute is a no-op for unknown class or attribute ids", () => {
    const withAttributes = createClass({
      label: "Person",
      id: "class-person",
      attributes: [createAttribute({ name: "email", id: "attr-email" })]
    });
    const original = fixture([withAttributes]);

    expect(updateAttribute(original, "missing", "attr-email", { label: "X" })).toBe(original);
    expect(updateAttribute(original, "class-person", "missing", { label: "X" })).toBe(original);
  });

  it("removeAttribute deletes the attribute and bumps updatedAt", () => {
    const withAttributes = createClass({
      label: "Person",
      id: "class-person",
      attributes: [
        createAttribute({ name: "fullName", id: "attr-name" }),
        createAttribute({ name: "email", id: "attr-email" })
      ]
    });
    const original = fixture([withAttributes]);
    const next = removeAttribute(original, "class-person", "attr-name");

    expect(next.classes[0]?.attributes.map((item) => item.id)).toEqual(["attr-email"]);
    expect(next.updatedAt).toBe(MUTATION_TIME);
    expect(original.classes[0]?.attributes).toHaveLength(2);
  });

  it("removeAttribute is a no-op for unknown ids", () => {
    const original = fixture([person()]);
    expect(removeAttribute(original, "class-person", "missing")).toBe(original);
  });
});

describe("relation mutations", () => {
  function relation(id = "rel-enrolled"): OntologyRelation {
    return createRelation({
      label: "enrolled in",
      sourceClassId: "class-student",
      targetClassId: "class-course",
      id
    });
  }

  it("addRelation appends and bumps updatedAt", () => {
    const original = fixture([person(), student(), course()]);
    const next = addRelation(original, relation());

    expect(next.relations.map((item) => item.id)).toEqual(["rel-enrolled"]);
    expect(next.updatedAt).toBe(MUTATION_TIME);
    expect(original.relations).toEqual([]);
  });

  it("updateRelation patches fields but keeps the id", () => {
    const original = fixture([person(), student(), course()], [relation()]);
    const next = updateRelation(original, "rel-enrolled", {
      label: "is enrolled in",
      name: "isEnrolledIn",
      description: "Student attends course",
      cardinality: "many-to-one",
      targetClassId: "class-person",
      id: "hijacked"
    } as never);

    expect(next.relations[0]).toMatchObject({
      id: "rel-enrolled",
      name: "isEnrolledIn",
      label: "is enrolled in",
      description: "Student attends course",
      cardinality: "many-to-one",
      sourceClassId: "class-student",
      targetClassId: "class-person"
    });
    expect(next.updatedAt).toBe(MUTATION_TIME);
  });

  it("updateRelation and removeRelation are no-ops for unknown ids", () => {
    const original = fixture([person(), student(), course()], [relation()]);

    expect(updateRelation(original, "missing", { label: "X" })).toBe(original);
    expect(removeRelation(original, "missing")).toBe(original);
  });

  it("removeRelation deletes the relation and bumps updatedAt", () => {
    const second = relation("rel-teaches");
    const original = fixture([person(), student(), course()], [relation(), second]);
    const next = removeRelation(original, "rel-enrolled");

    expect(next.relations.map((item) => item.id)).toEqual(["rel-teaches"]);
    expect(next.updatedAt).toBe(MUTATION_TIME);
    expect(original.relations).toHaveLength(2);
  });
});

describe("updateOntologyMeta", () => {
  it("patches metadata fields and bumps updatedAt", () => {
    const original = fixture([person()]);
    const next = updateOntologyMeta(original, {
      name: "University 2",
      description: "Updated description",
      version: "1.2.3",
      baseIri: "https://example.org/university"
    });

    expect(next).toMatchObject({
      name: "University 2",
      description: "Updated description",
      version: "1.2.3",
      baseIri: "https://example.org/university",
      createdAt: CREATED_AT,
      updatedAt: MUTATION_TIME
    });
    expect(original.name).toBe("University");
  });

  it("ignores identity and timestamp patches", () => {
    const original = fixture([person()]);
    const next = updateOntologyMeta(original, {
      id: "hijacked",
      createdAt: "1999-01-01T00:00:00.000Z",
      updatedAt: "1999-01-01T00:00:00.000Z"
    } as never);

    expect(next.id).toBe("onto-1");
    expect(next.createdAt).toBe(CREATED_AT);
    expect(next.updatedAt).toBe(MUTATION_TIME);
  });
});
