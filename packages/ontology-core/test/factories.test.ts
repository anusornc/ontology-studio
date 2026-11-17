import { describe, expect, it } from "vitest";

import {
  PALETTE,
  createAttribute,
  createClass,
  createOntology,
  createRelation
} from "../src/index";

describe("createOntology", () => {
  it("applies the documented defaults with injected id and timestamp", () => {
    const ontology = createOntology({
      name: "Research Project",
      id: "onto-1",
      now: "2024-01-02T03:04:05.000Z"
    });

    expect(ontology).toEqual({
      id: "onto-1",
      name: "Research Project",
      description: "",
      version: "0.1.0",
      baseIri: "https://example.org/ontology/research-project",
      createdAt: "2024-01-02T03:04:05.000Z",
      updatedAt: "2024-01-02T03:04:05.000Z",
      classes: [],
      relations: []
    });
  });

  it("accepts explicit version, baseIri and description", () => {
    const ontology = createOntology({
      name: "Library",
      description: "A small library domain",
      version: "2.3.1",
      baseIri: "https://library.example/onto",
      id: "onto-2",
      now: "2024-05-06T07:08:09.000Z"
    });

    expect(ontology.version).toBe("2.3.1");
    expect(ontology.baseIri).toBe("https://library.example/onto");
    expect(ontology.description).toBe("A small library domain");
  });

  it("accepts a Date for `now` and normalises it to an ISO string", () => {
    const ontology = createOntology({
      name: "University",
      id: "onto-3",
      now: new Date("2030-12-31T23:59:59.000Z")
    });

    expect(ontology.createdAt).toBe("2030-12-31T23:59:59.000Z");
    expect(ontology.updatedAt).toBe("2030-12-31T23:59:59.000Z");
  });

  it("generates a UUID and ISO timestamps when not injected", () => {
    const before = Date.now();
    const ontology = createOntology({ name: "Generated" });

    expect(ontology.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Number.isNaN(Date.parse(ontology.createdAt))).toBe(false);
    expect(Date.parse(ontology.createdAt)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("does not share mutable arrays between ontologies", () => {
    const first = createOntology({ name: "One", id: "a", now: "2024-01-01T00:00:00.000Z" });
    const second = createOntology({ name: "Two", id: "b", now: "2024-01-01T00:00:00.000Z" });

    expect(first.classes).not.toBe(second.classes);
    expect(first.relations).not.toBe(second.relations);
  });
});

describe("createClass", () => {
  it("applies the documented defaults", () => {
    const created = createClass({ label: "Research Project", id: "class-1" });

    expect(created).toEqual({
      id: "class-1",
      name: "ResearchProject",
      label: "Research Project",
      description: "",
      parentId: null,
      color: PALETTE[0],
      attributes: [],
      position: { x: 0, y: 0 }
    });
  });

  it("trims the label and supports explicit machine name and parent", () => {
    const created = createClass({
      label: "  Student  ",
      name: "Student",
      parentId: "class-person",
      id: "class-student"
    });

    expect(created.label).toBe("Student");
    expect(created.name).toBe("Student");
    expect(created.parentId).toBe("class-person");
  });

  it("derives a label from the machine name when no label is given", () => {
    expect(createClass({ name: "Course", id: "class-course" }).label).toBe("Course");
  });

  it("honours explicit colour, description, position and attributes", () => {
    const position = { x: 320, y: 180 };
    const created = createClass({
      label: "Course",
      id: "class-course",
      color: "#123456",
      description: "A taught course",
      position,
      attributes: [createAttribute({ name: "title", id: "attr-title" })]
    });

    expect(created.color).toBe("#123456");
    expect(created.description).toBe("A taught course");
    expect(created.position).toEqual(position);
    expect(created.position).not.toBe(position);
    expect(created.attributes).toHaveLength(1);
  });

  it("generates unique ids when none is injected", () => {
    expect(createClass({ label: "A" }).id).not.toBe(createClass({ label: "B" }).id);
  });
});

describe("createAttribute", () => {
  it("applies the documented defaults", () => {
    const created = createAttribute({ name: "startDate", id: "attr-1" });

    expect(created).toEqual({
      id: "attr-1",
      name: "startDate",
      label: "Start Date",
      datatype: "string",
      required: false,
      cardinality: "one",
      description: "",
      enumValues: []
    });
  });

  it("honours explicit datatype, cardinality, required, description and label", () => {
    const created = createAttribute({
      name: "credits",
      label: "Credits awarded",
      datatype: "integer",
      cardinality: "many",
      required: true,
      description: "ECTS credits",
      enumValues: ["3", "5", "10"],
      id: "attr-credits"
    });

    expect(created.label).toBe("Credits awarded");
    expect(created.datatype).toBe("integer");
    expect(created.cardinality).toBe("many");
    expect(created.required).toBe(true);
    expect(created.description).toBe("ECTS credits");
    expect(created.enumValues).toEqual(["3", "5", "10"]);
  });

  it("copies enumValues instead of aliasing caller state", () => {
    const values = ["draft", "published"];
    const created = createAttribute({ name: "status", enumValues: values, id: "attr-status" });

    values.push("archived");
    expect(created.enumValues).toEqual(["draft", "published"]);
  });
});

describe("createRelation", () => {
  it("applies the documented defaults", () => {
    const created = createRelation({
      label: "enrolled in",
      sourceClassId: "class-student",
      targetClassId: "class-course",
      id: "rel-1"
    });

    expect(created).toEqual({
      id: "rel-1",
      name: "enrolledIn",
      label: "enrolled in",
      description: "",
      sourceClassId: "class-student",
      targetClassId: "class-course",
      cardinality: "many-to-many"
    });
  });

  it("honours explicit name, cardinality and description", () => {
    const created = createRelation({
      label: "teaches",
      name: "teachesCourse",
      description: "Professor teaches a course",
      cardinality: "one-to-many",
      sourceClassId: "class-professor",
      targetClassId: "class-course",
      id: "rel-teaches"
    });

    expect(created.name).toBe("teachesCourse");
    expect(created.cardinality).toBe("one-to-many");
    expect(created.description).toBe("Professor teaches a course");
  });
});
