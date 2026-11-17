import { describe, expect, it } from "vitest";

import * as core from "../src/index";
import { createSampleOntology, parseOntology, serializeOntology, validateOntology } from "../src/index";

describe("public API", () => {
  it("exports every function required by the domain contract", () => {
    const functions = [
      // naming
      "slugify",
      "pascalCase",
      "camelCase",
      "suggestClassName",
      "suggestAttributeName",
      "suggestRelationName",
      "newId",
      "suggestUniqueClassName",
      "suggestUniqueAttributeName",
      "suggestUniqueRelationName",
      // factories
      "createOntology",
      "createClass",
      "createAttribute",
      "createRelation",
      // mutations
      "addClass",
      "updateClass",
      "removeClass",
      "setClassPosition",
      "addAttribute",
      "updateAttribute",
      "removeAttribute",
      "addRelation",
      "updateRelation",
      "removeRelation",
      "updateOntologyMeta",
      // queries / layout
      "findClass",
      "findAttribute",
      "findRelation",
      "classChildren",
      "classAncestors",
      "classDescendants",
      "buildClassTree",
      "autoLayout",
      "summarizeOntology",
      "iriFor",
      // validation / serialization / export
      "validateOntology",
      "serializeOntology",
      "parseOntology",
      "exportTurtle",
      "exportJsonLd",
      "xsdTypeFor",
      "createSampleOntology"
    ] as const;

    for (const name of functions) {
      expect(typeof (core as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("exports the documented constants and error class", () => {
    expect(Array.isArray(core.PALETTE)).toBe(true);
    expect(core.DATATYPES).toContain("dateTime");
    expect(typeof core.OntologyParseError).toBe("function");
  });

  it("sample -> serialize -> parse -> validate is an end-to-end identity on issues", () => {
    const sample = createSampleOntology();
    const restored = parseOntology(serializeOntology(sample));

    expect(restored).toEqual(sample);
    expect(validateOntology(restored)).toEqual(validateOntology(sample));
    expect(validateOntology(restored).ok).toBe(true);
  });
});
