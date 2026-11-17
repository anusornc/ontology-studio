import { describe, expect, it } from "vitest";

import {
  createOntologyFromTemplate,
  createOntologyTemplates,
  findOntologyTemplate,
  serializeOntology,
  validateOntology
} from "../src/index";

const FIXED_NOW = "2025-03-01T00:00:00.000Z";

interface TemplateExpectation {
  id: string;
  category: string;
  minClasses: number;
  requiredClasses: string[];
  requiredRelations: string[];
}

// Per-template expectations derived from docs/DOMAIN-CONTRACT.md.
const EXPECTATIONS: TemplateExpectation[] = [
  {
    id: "pizza",
    category: "Learning",
    minClasses: 7,
    requiredClasses: [
      "Pizza",
      "VegetarianPizza",
      "MeatPizza",
      "CheesePizza",
      "PizzaBase",
      "PizzaTopping",
      "Topping"
    ],
    requiredRelations: ["hasBase", "hasTopping", "excludesTopping"]
  },
  {
    id: "supply-chain",
    category: "Industry",
    minClasses: 6,
    requiredClasses: [
      "Product",
      "Batch",
      "Party",
      "Location",
      "HandlingEvent",
      "SensorReading"
    ],
    requiredRelations: ["undergoes", "performedBy", "atLocation", "trackedBy"]
  },
  {
    id: "education",
    category: "Domain",
    minClasses: 6,
    requiredClasses: ["Person", "Student", "Teacher", "Course", "Classroom", "Enrollment"],
    requiredRelations: ["teaches", "takes", "heldIn"]
  },
  {
    id: "library",
    category: "Domain",
    minClasses: 6,
    requiredClasses: [
      "LibraryItem",
      "Book",
      "Magazine",
      "Author",
      "Member",
      "Loan"
    ],
    requiredRelations: ["writtenBy", "borrows", "lends"]
  }
];

describe("ontology template registry", () => {
  it("returns templates in the fixed stable order", () => {
    const templates = createOntologyTemplates();

    expect(templates.map((item) => item.id)).toEqual([
      "pizza",
      "supply-chain",
      "education",
      "library"
    ]);
  });

  it("each template exposes stable metadata", () => {
    const expectations = new Map(EXPECTATIONS.map((item) => [item.id, item]));

    for (const template of createOntologyTemplates()) {
      expect(expectations.has(template.id)).toBe(true);
      const expected = expectations.get(template.id);
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(template.category).toBe(expected?.category);
      expect(template.tags.length).toBeGreaterThan(0);
      expect(typeof template.build).toBe("function");
    }
  });

  it("findOntologyTemplate returns the matching template", () => {
    expect(findOntologyTemplate("pizza")?.build().name).toBe("Pizza");
    expect(findOntologyTemplate("supply-chain")?.name).toBeDefined();
  });

  it("findOntologyTemplate returns undefined for unknown ids", () => {
    expect(findOntologyTemplate("does-not-exist")).toBeUndefined();
  });

  it("createOntologyFromTemplate throws RangeError for unknown ids", () => {
    expect(() => createOntologyFromTemplate("nope")).toThrow(RangeError);
    expect(() => createOntologyFromTemplate("nope")).toThrow(/nope/i);
  });

  it("createOntologyFromTemplate builds a matching ontology for known ids", () => {
    const ontology = createOntologyFromTemplate("library", { now: FIXED_NOW });
    expect(ontology.name).toBe("Library");
    expect(ontology.relations.length).toBeGreaterThanOrEqual(3);
  });
});

describe.each(EXPECTATIONS)("template $id", (expectation) => {
  it("builds a fresh ontology with enough classes, key classes and relations", () => {
    const ontology = createOntologyFromTemplate(expectation.id, { now: FIXED_NOW });
    const template = findOntologyTemplate(expectation.id);

    expect(ontology.classes.length).toBeGreaterThanOrEqual(expectation.minClasses);
    expect(ontology.relations.length).toBeGreaterThan(0);

    const classNames = new Set(ontology.classes.map((item) => item.name));
    for (const required of expectation.requiredClasses) {
      expect(classNames.has(required)).toBe(true);
    }

    const relationNames = new Set(ontology.relations.map((item) => item.name));
    for (const required of expectation.requiredRelations) {
      expect(relationNames.has(required)).toBe(true);
    }

    // build defaults the name to the template name.
    expect(ontology.name).toBe(template?.name);
  });

  it("is auto-laid-out and validates with zero errors", () => {
    const ontology = createOntologyFromTemplate(expectation.id, { now: FIXED_NOW });

    for (const ontologyClass of ontology.classes) {
      expect(ontologyClass.position).not.toEqual({ x: 0, y: 0 });
    }

    const report = validateOntology(ontology);
    expect(report.issues).toEqual([]);
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("is deterministic when rebuilt with the same fixed now", () => {
    const first = createOntologyFromTemplate(expectation.id, { now: FIXED_NOW });
    const second = createOntologyFromTemplate(expectation.id, { now: FIXED_NOW });

    expect(serializeOntology(second)).toBe(serializeOntology(first));
    expect(second).toEqual(first);
  });

  it("never reuses ids across two sequential builds", () => {
    // Different `now` seeds => the two builds are fresh and share no ids, which
    // is what "fresh ontology each call" means for distinct invocations.
    const first = createOntologyFromTemplate(expectation.id, { now: FIXED_NOW });
    const second = createOntologyFromTemplate(expectation.id, {
      now: "2025-03-02T00:00:00.000Z"
    });

    const firstIds = new Set<string>();
    for (const ontologyClass of first.classes) {
      firstIds.add(ontologyClass.id);
      for (const attribute of ontologyClass.attributes) {
        firstIds.add(attribute.id);
      }
    }
    for (const relation of first.relations) {
      firstIds.add(relation.id);
    }

    for (const ontologyClass of second.classes) {
      expect(firstIds.has(ontologyClass.id)).toBe(false);
      for (const attribute of ontologyClass.attributes) {
        expect(firstIds.has(attribute.id)).toBe(false);
      }
    }
    for (const relation of second.relations) {
      expect(firstIds.has(relation.id)).toBe(false);
    }

    // Distinct ids within a single build too.
    expect(new Set(first.classes.map((item) => item.id)).size).toBe(
      first.classes.length
    );
  });
});

describe("template build options", () => {
  it("supports nameOverride and baseIriOverride", () => {
    const ontology = createOntologyFromTemplate("pizza", {
      now: FIXED_NOW,
      nameOverride: "My Pizza Model",
      baseIriOverride: "https://example.com/custom/pizza"
    });

    expect(ontology.name).toBe("My Pizza Model");
    expect(ontology.baseIri).toBe("https://example.com/custom/pizza");
  });

  it("defaults the base IRI to the template's slugged id when not overridden", () => {
    for (const template of createOntologyTemplates()) {
      const ontology = template.build({ now: FIXED_NOW });
      expect(ontology.baseIri).toBe(
        `https://example.org/ontology/${template.id}`
      );
    }
  });
});