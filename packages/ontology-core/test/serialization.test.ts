import { describe, expect, it } from "vitest";

import {
  OntologyParseError,
  createAttribute,
  createClass,
  createOntology,
  createRelation,
  parseOntology,
  serializeOntology,
  validateOntology
} from "../src/index";
import type { Ontology } from "../src/index";

const CREATED_AT = "2024-01-01T00:00:00.000Z";

function fullOntology(): Ontology {
  return {
    ...createOntology({
      name: "University",
      description: "A university domain",
      id: "onto-1",
      now: CREATED_AT,
      baseIri: "https://example.org/ontology/university"
    }),
    classes: [
      createClass({
        label: "Person",
        name: "Person",
        id: "class-person",
        color: "#6366f1",
        position: { x: 40, y: 40 },
        attributes: [
          createAttribute({
            name: "fullName",
            label: "Full Name",
            datatype: "string",
            required: true,
            id: "attr-name"
          })
        ]
      }),
      createClass({
        label: "Student",
        name: "Student",
        id: "class-student",
        parentId: "class-person",
        position: { x: 360, y: 40 }
      })
    ],
    relations: [
      createRelation({
        label: "enrolled in",
        name: "enrolledIn",
        sourceClassId: "class-student",
        targetClassId: "class-person",
        id: "rel-1"
      })
    ]
  };
}

function problemsOf(input: string | unknown): string[] {
  try {
    parseOntology(input);
  } catch (error) {
    if (error instanceof OntologyParseError) {
      return error.problems;
    }
    throw error;
  }
  throw new Error("expected parseOntology to throw");
}

describe("serializeOntology", () => {
  it("produces pretty JSON of exactly the ontology shape", () => {
    const ontology = fullOntology();
    const text = serializeOntology(ontology);

    expect(text).toBe(JSON.stringify(ontology, null, 2));
    expect(JSON.parse(text)).toEqual(ontology);
  });

  it("emits canonical field order", () => {
    const parsed = JSON.parse(serializeOntology(fullOntology())) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual([
      "id",
      "name",
      "description",
      "version",
      "baseIri",
      "createdAt",
      "updatedAt",
      "classes",
      "relations"
    ]);
    expect(Object.keys(parsed.classes as Record<string, unknown>[])).toEqual(["0", "1"]);
    const firstClass = (parsed.classes as Array<Record<string, unknown>>)[0] ?? {};
    expect(Object.keys(firstClass)).toEqual([
      "id",
      "name",
      "label",
      "description",
      "parentId",
      "color",
      "attributes",
      "position"
    ]);
    const firstAttribute = (firstClass.attributes as Array<Record<string, unknown>>)[0] ?? {};
    expect(Object.keys(firstAttribute)).toEqual([
      "id",
      "name",
      "label",
      "datatype",
      "required",
      "cardinality",
      "description",
      "enumValues"
    ]);
  });

  it("is deterministic and drops extra keys", () => {
    const ontology = fullOntology();
    const withExtra = { ...ontology, extra: true } as Ontology;

    expect(serializeOntology(ontology)).toBe(serializeOntology(ontology));
    expect(JSON.parse(serializeOntology(withExtra))).not.toHaveProperty("extra");
  });
});

describe("parseOntology: valid documents", () => {
  it("round-trips a serialized ontology", () => {
    const ontology = fullOntology();
    expect(parseOntology(serializeOntology(ontology))).toEqual(ontology);
  });

  it("accepts an already-parsed value and returns a canonical deep copy", () => {
    const input = JSON.parse(serializeOntology(fullOntology())) as Ontology;
    const parsed = parseOntology(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed.classes[0]).not.toBe(input.classes[0]);
    expect(parsed.classes[0]?.attributes[0]).not.toBe(input.classes[0]?.attributes[0]);
    expect(parsed.classes[0]?.attributes[0]?.enumValues).not.toBe(
      input.classes[0]?.attributes[0]?.enumValues
    );
  });

  it("does not observe later mutations of the input", () => {
    const input = JSON.parse(serializeOntology(fullOntology())) as Ontology;
    const parsed = parseOntology(input);

    input.classes[0]!.name = "Mutated";
    input.relations.length = 0;

    expect(parsed.classes[0]?.name).toBe("Person");
    expect(parsed.relations).toHaveLength(1);
  });

  it("ignores unknown extra keys at every level", () => {
    const input = JSON.parse(serializeOntology(fullOntology())) as Record<string, unknown>;
    input.extra = "ignored";
    const rawClasses = input.classes as Array<Record<string, unknown>>;
    rawClasses[0]!.extra = "ignored";
    const rawAttributes = rawClasses[0]!.attributes as Array<Record<string, unknown>>;
    rawAttributes[0]!.extra = "ignored";
    const rawRelations = input.relations as Array<Record<string, unknown>>;
    rawRelations[0]!.extra = "ignored";

    const parsed = parseOntology(input);

    expect(parsed).not.toHaveProperty("extra");
    expect(parsed.classes[0]).not.toHaveProperty("extra");
    expect(parsed.classes[0]?.attributes[0]).not.toHaveProperty("extra");
    expect(parsed.relations[0]).not.toHaveProperty("extra");
  });

  it("keeps referentially broken documents loadable", () => {
    const broken = {
      ...JSON.parse(serializeOntology(fullOntology())),
      classes: [
        {
          ...JSON.parse(serializeOntology(fullOntology())).classes[0],
          parentId: "class-missing"
        }
      ],
      relations: [
        {
          ...JSON.parse(serializeOntology(fullOntology())).relations[0],
          sourceClassId: "class-missing",
          targetClassId: "class-also-missing"
        }
      ]
    };

    const parsed = parseOntology(broken);

    expect(parsed.classes[0]?.parentId).toBe("class-missing");
    const report = validateOntology(parsed);
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["unknown-parent", "unknown-relation-source", "unknown-relation-target"])
    );
  });
});

describe("parseOntology: invalid documents", () => {
  it("throws OntologyParseError for invalid JSON", () => {
    expect(() => parseOntology("{ nope")).toThrow(OntologyParseError);
    expect(problemsOf("{ nope")[0]).toContain("JSON");
  });

  it("throws for non-object roots", () => {
    expect(problemsOf("[]")).toHaveLength(1);
    expect(problemsOf("null")).toHaveLength(1);
    expect(problemsOf("42")).toHaveLength(1);
  });

  it("collects every structural problem instead of stopping at the first", () => {
    const invalid = {
      id: 42,
      name: "Broken",
      description: "",
      version: "1.0.0",
      baseIri: 7,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      classes: [
        {
          id: "class-a",
          name: 123,
          label: "Bad",
          description: "",
          parentId: null,
          color: "#fff",
          attributes: [
            {
              id: "attr-a",
              name: "ok",
              label: "Ok",
              datatype: "text",
              required: "yes",
              cardinality: "many",
              description: "",
              enumValues: ["ok", 2]
            }
          ],
          position: { x: "left", y: 0 }
        }
      ],
      relations: [
        {
          id: "rel-a",
          name: "rel",
          label: "Rel",
          description: "",
          sourceClassId: 4,
          targetClassId: "class-a",
          cardinality: "many"
        }
      ]
    };

    const problems = problemsOf(invalid);
    const joined = problems.join("\n");

    expect(problems.length).toBeGreaterThanOrEqual(8);
    expect(joined).toContain("id");
    expect(joined).toContain("baseIri");
    expect(joined).toContain("classes[0].name");
    expect(joined).toContain("classes[0].attributes[0].datatype");
    expect(joined).toContain("classes[0].attributes[0].required");
    expect(joined).toContain("classes[0].attributes[0].enumValues[1]");
    expect(joined).toContain("classes[0].position.x");
    expect(joined).toContain("relations[0].sourceClassId");
    expect(joined).toContain("relations[0].cardinality");
  });

  it("rejects missing required fields and wrong container types", () => {
    const problems = problemsOf({ classes: "nope", relations: {} });

    expect(problems.join("\n")).toContain("name");
    expect(problems.join("\n")).toContain("classes must be an array");
    expect(problems.join("\n")).toContain("relations must be an array");
  });

  it("rejects invalid parentId and position shapes", () => {
    const base = JSON.parse(serializeOntology(fullOntology()));
    const broken = {
      ...base,
      classes: [
        { ...base.classes[0], parentId: 5, position: { x: 1 } },
        "not-an-object"
      ]
    };

    const joined = problemsOf(broken).join("\n");
    expect(joined).toContain("classes[0].parentId");
    expect(joined).toContain("classes[0].position.y");
    expect(joined).toContain("classes[1]");
  });
});
