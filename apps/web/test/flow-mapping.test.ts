import type { Ontology, OntologyClass, OntologyRelation } from "@onto/core";
import { describe, expect, it } from "vitest";
import { toFlow } from "../src/graph/toFlow";

function makeClass(overrides: Partial<OntologyClass> & Pick<OntologyClass, "id" | "name" | "label">): OntologyClass {
  return {
    description: "",
    parentId: null,
    color: "#22d3ee",
    attributes: [],
    position: { x: 0, y: 0 },
    ...overrides
  };
}

function makeRelation(overrides: Partial<OntologyRelation> & Pick<OntologyRelation, "id" | "name" | "label">): OntologyRelation {
  return {
    description: "",
    sourceClassId: "person",
    targetClassId: "course",
    cardinality: "many-to-many",
    ...overrides
  };
}

const ontology: Ontology = {
  id: "onto-1",
  name: "University",
  description: "",
  version: "0.1.0",
  baseIri: "https://example.org/ontology/university",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  classes: [
    makeClass({
      id: "person",
      name: "Person",
      label: "Person",
      position: { x: 80, y: 80 },
      attributes: [
        {
          id: "attr-name",
          name: "fullName",
          label: "Full name",
          datatype: "string",
          required: true,
          cardinality: "one",
          description: "",
          enumValues: []
        },
        {
          id: "attr-age",
          name: "age",
          label: "Age",
          datatype: "integer",
          required: false,
          cardinality: "one",
          description: "",
          enumValues: []
        }
      ]
    }),
    makeClass({ id: "student", name: "Student", label: "Student", parentId: "person", color: "#a78bfa", position: { x: 400, y: 80 } }),
    makeClass({ id: "course", name: "Course", label: "Course", position: { x: 400, y: 300 } })
  ],
  relations: [makeRelation({ id: "rel-1", name: "enrolledIn", label: "enrolled in", sourceClassId: "student", targetClassId: "course" })]
};

describe("toFlow", () => {
  it("maps every class to a positioned classNode", () => {
    const { nodes } = toFlow(ontology, null);

    expect(nodes).toHaveLength(3);
    expect(nodes.map((node) => node.id)).toEqual(["person", "student", "course"]);
    expect(nodes[0]).toMatchObject({
      id: "person",
      type: "classNode",
      position: { x: 80, y: 80 },
      data: { label: "Person", name: "Person", color: "#22d3ee" }
    });
  });

  it("exposes attribute count and a truncated preview in node data", () => {
    const { nodes } = toFlow(ontology, null);
    const person = nodes.find((node) => node.id === "person");

    expect(person?.data.attributeCount).toBe(2);
    expect(person?.data.attributePreview).toEqual([
      { id: "attr-name", label: "Full name", datatype: "string", required: true },
      { id: "attr-age", label: "Age", datatype: "integer", required: false }
    ]);
  });

  it("truncates the attribute preview to three entries", () => {
    const many = {
      ...ontology,
      classes: [
        makeClass({
          id: "person",
          name: "Person",
          label: "Person",
          attributes: ["a", "b", "c", "d"].map((suffix) => ({
            id: `attr-${suffix}`,
            name: `attr${suffix}`,
            label: `Attr ${suffix}`,
            datatype: "string" as const,
            required: false,
            cardinality: "one" as const,
            description: "",
            enumValues: []
          }))
        })
      ]
    };
    const { nodes } = toFlow(many, null);

    expect(nodes[0]?.data.attributeCount).toBe(4);
    expect(nodes[0]?.data.attributePreview).toHaveLength(3);
  });

  it("resolves the parent label for inheritance hints", () => {
    const { nodes } = toFlow(ontology, null);

    expect(nodes.find((node) => node.id === "student")?.data.parentLabel).toBe("Person");
    expect(nodes.find((node) => node.id === "person")?.data.parentLabel).toBeNull();
  });

  it("marks the selected class node", () => {
    const { nodes, edges } = toFlow(ontology, { kind: "class", id: "student" });

    expect(nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(["student"]);
    expect(edges.every((edge) => !edge.selected)).toBe(true);
  });

  it("maps relations to labeled edges with cardinality data", () => {
    const { edges } = toFlow(ontology, null);

    expect(edges).toEqual([
      expect.objectContaining({
        id: "rel-1",
        type: "relationEdge",
        source: "student",
        target: "course",
        label: "enrolled in",
        data: { cardinality: "many-to-many", relationId: "rel-1" }
      })
    ]);
  });

  it("marks and animates the selected relation edge", () => {
    const { edges } = toFlow(ontology, { kind: "relation", id: "rel-1" });

    expect(edges[0]).toMatchObject({ selected: true, animated: true });
  });

  it("omits relations whose endpoints no longer exist", () => {
    const dangling = {
      ...ontology,
      relations: [
        makeRelation({ id: "rel-ok", name: "ok", label: "ok", sourceClassId: "person", targetClassId: "course" }),
        makeRelation({ id: "rel-bad", name: "bad", label: "bad", sourceClassId: "ghost", targetClassId: "course" })
      ]
    };
    const { edges } = toFlow(dangling, null);

    expect(edges.map((edge) => edge.id)).toEqual(["rel-ok"]);
  });

  it("returns empty collections for an empty ontology", () => {
    expect(toFlow({ ...ontology, classes: [], relations: [] }, null)).toEqual({ nodes: [], edges: [] });
  });
});
