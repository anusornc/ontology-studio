import { describe, expect, it } from "vitest";

import {
  PALETTE,
  camelCase,
  newId,
  pascalCase,
  slugify,
  suggestAttributeName,
  suggestClassName,
  suggestRelationName
} from "../src/index";

describe("pascalCase", () => {
  it("builds a PascalCase identifier from a human label", () => {
    expect(pascalCase("Research Project")).toBe("ResearchProject");
  });

  it("handles separators, casing and existing camelCase words", () => {
    expect(pascalCase("research_project")).toBe("ResearchProject");
    expect(pascalCase("researchProject")).toBe("ResearchProject");
    expect(pascalCase("  Research-Project  ")).toBe("ResearchProject");
    expect(pascalCase("RESEARCH PROJECT")).toBe("ResearchProject");
  });
});

describe("camelCase", () => {
  it("builds a camelCase identifier from a human label", () => {
    expect(camelCase("Start date")).toBe("startDate");
    expect(camelCase("Enrolled in")).toBe("enrolledIn");
  });

  it("handles separators and multi-word labels", () => {
    expect(camelCase("start_date")).toBe("startDate");
    expect(camelCase("Course Title")).toBe("courseTitle");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates a human label", () => {
    expect(slugify("Research Project")).toBe("research-project");
  });

  it("collapses repeated separators and trims edges", () => {
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
    expect(slugify("A/B: C?")).toBe("a-b-c");
  });

  it("strips diacritics to ASCII", () => {
    expect(slugify("Café Résumé")).toBe("cafe-resume");
  });

  it("returns an empty string for input with no ASCII word characters", () => {
    expect(slugify("日本語")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

describe("suggest*Name", () => {
  it("derives the documented machine names from human labels", () => {
    expect(suggestClassName("Research Project")).toBe("ResearchProject");
    expect(suggestAttributeName("Start date")).toBe("startDate");
    expect(suggestRelationName("enrolled in")).toBe("enrolledIn");
  });

  it("falls back to stable defaults for non-ASCII and empty input", () => {
    expect(suggestClassName("日本語")).toBe("Entity");
    expect(suggestClassName("")).toBe("Entity");
    expect(suggestAttributeName("日本語")).toBe("entity");
    expect(suggestAttributeName("")).toBe("entity");
    expect(suggestRelationName("日本語")).toBe("entity");
    expect(suggestRelationName("")).toBe("entity");
  });
});

describe("newId", () => {
  it("returns a random UUID", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(newId()).not.toBe(newId());
  });
});

describe("PALETTE", () => {
  it("exposes a set of distinct hex colours", () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(6);
    expect(new Set(PALETTE).size).toBe(PALETTE.length);
    for (const color of PALETTE) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
