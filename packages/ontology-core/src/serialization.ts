/**
 * Native JSON serialization.
 *
 * `serializeOntology` writes exactly the `Ontology` shape in canonical field
 * order. `parseOntology` is the defensive reader for untrusted documents: it
 * collects every structural problem before throwing and never treats broken
 * references (missing parents / relation endpoints) as parse errors.
 */

import {
  ATTRIBUTE_CARDINALITIES,
  DATATYPES,
  RELATION_CARDINALITIES,
  OntologyParseError
} from "./types";
import type {
  AttributeCardinality,
  Datatype,
  Ontology,
  OntologyAttribute,
  OntologyClass,
  OntologyRelation,
  Position,
  RelationCardinality
} from "./types";

function canonicalAttribute(attribute: OntologyAttribute): OntologyAttribute {
  return {
    id: attribute.id,
    name: attribute.name,
    label: attribute.label,
    datatype: attribute.datatype,
    required: attribute.required,
    cardinality: attribute.cardinality,
    description: attribute.description,
    enumValues: [...attribute.enumValues]
  };
}

function canonicalClass(ontologyClass: OntologyClass): OntologyClass {
  return {
    id: ontologyClass.id,
    name: ontologyClass.name,
    label: ontologyClass.label,
    description: ontologyClass.description,
    parentId: ontologyClass.parentId,
    color: ontologyClass.color,
    attributes: ontologyClass.attributes.map(canonicalAttribute),
    position: { x: ontologyClass.position.x, y: ontologyClass.position.y }
  };
}

function canonicalRelation(relation: OntologyRelation): OntologyRelation {
  return {
    id: relation.id,
    name: relation.name,
    label: relation.label,
    description: relation.description,
    sourceClassId: relation.sourceClassId,
    targetClassId: relation.targetClassId,
    cardinality: relation.cardinality
  };
}

function canonicalOntology(ontology: Ontology): Ontology {
  return {
    id: ontology.id,
    name: ontology.name,
    description: ontology.description,
    version: ontology.version,
    baseIri: ontology.baseIri,
    createdAt: ontology.createdAt,
    updatedAt: ontology.updatedAt,
    classes: ontology.classes.map(canonicalClass),
    relations: ontology.relations.map(canonicalRelation)
  };
}

/** Pretty JSON (2-space indent) containing exactly the `Ontology` shape. */
export function serializeOntology(ontology: Ontology): string {
  return JSON.stringify(canonicalOntology(ontology), null, 2);
}

// --- Parsing ---------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childPath(path: string, key: string): string {
  return path.length > 0 ? `${path}.${key}` : key;
}

function readString(record: JsonRecord, key: string, path: string, problems: string[]): string {
  const value = record[key];
  if (typeof value !== "string") {
    problems.push(`${childPath(path, key)} must be a string`);
    return "";
  }
  return value;
}

function readBoolean(record: JsonRecord, key: string, path: string, problems: string[]): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    problems.push(`${childPath(path, key)} must be a boolean`);
    return false;
  }
  return value;
}

function readFiniteNumber(
  record: JsonRecord,
  key: string,
  path: string,
  problems: string[]
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    problems.push(`${childPath(path, key)} must be a finite number`);
    return 0;
  }
  return value;
}

function readNullableString(
  record: JsonRecord,
  key: string,
  path: string,
  problems: string[]
): string | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    problems.push(`${childPath(path, key)} must be a string or null`);
    return null;
  }
  return value;
}

function readArray(record: JsonRecord, key: string, path: string, problems: string[]): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    problems.push(`${childPath(path, key)} must be an array`);
    return [];
  }
  return value;
}

function readStringArray(
  record: JsonRecord,
  key: string,
  path: string,
  problems: string[]
): string[] {
  const value = readArray(record, key, path, problems);
  const strings: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      problems.push(`${childPath(path, key)}[${index}] must be a string`);
    } else {
      strings.push(item);
    }
  });
  return strings;
}

function readEnum<T extends string>(
  record: JsonRecord,
  key: string,
  path: string,
  allowed: readonly T[],
  problems: string[]
): T {
  const value = record[key];
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    problems.push(`${childPath(path, key)} must be one of: ${allowed.join(", ")}`);
    return allowed[0] as T;
  }
  return value as T;
}

function readPosition(value: unknown, path: string, problems: string[]): Position {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object with numeric x and y`);
    return { x: 0, y: 0 };
  }
  return {
    x: readFiniteNumber(value, "x", path, problems),
    y: readFiniteNumber(value, "y", path, problems)
  };
}

function emptyAttribute(): OntologyAttribute {
  return {
    id: "",
    name: "",
    label: "",
    datatype: "string",
    required: false,
    cardinality: "one",
    description: "",
    enumValues: []
  };
}

function parseAttribute(value: unknown, path: string, problems: string[]): OntologyAttribute {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return emptyAttribute();
  }
  return {
    id: readString(value, "id", path, problems),
    name: readString(value, "name", path, problems),
    label: readString(value, "label", path, problems),
    datatype: readEnum<Datatype>(value, "datatype", path, DATATYPES, problems),
    required: readBoolean(value, "required", path, problems),
    cardinality: readEnum<AttributeCardinality>(
      value,
      "cardinality",
      path,
      ATTRIBUTE_CARDINALITIES,
      problems
    ),
    description: readString(value, "description", path, problems),
    enumValues: readStringArray(value, "enumValues", path, problems)
  };
}

function emptyClass(): OntologyClass {
  return {
    id: "",
    name: "",
    label: "",
    description: "",
    parentId: null,
    color: "",
    attributes: [],
    position: { x: 0, y: 0 }
  };
}

function parseClass(value: unknown, path: string, problems: string[]): OntologyClass {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return emptyClass();
  }
  const rawAttributes = readArray(value, "attributes", path, problems);
  return {
    id: readString(value, "id", path, problems),
    name: readString(value, "name", path, problems),
    label: readString(value, "label", path, problems),
    description: readString(value, "description", path, problems),
    parentId: readNullableString(value, "parentId", path, problems),
    color: readString(value, "color", path, problems),
    attributes: rawAttributes.map((item, index) =>
      parseAttribute(item, `${path}.attributes[${index}]`, problems)
    ),
    position: readPosition(value.position, `${path}.position`, problems)
  };
}

function emptyRelation(): OntologyRelation {
  return {
    id: "",
    name: "",
    label: "",
    description: "",
    sourceClassId: "",
    targetClassId: "",
    cardinality: "many-to-many"
  };
}

function parseRelation(value: unknown, path: string, problems: string[]): OntologyRelation {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return emptyRelation();
  }
  return {
    id: readString(value, "id", path, problems),
    name: readString(value, "name", path, problems),
    label: readString(value, "label", path, problems),
    description: readString(value, "description", path, problems),
    sourceClassId: readString(value, "sourceClassId", path, problems),
    targetClassId: readString(value, "targetClassId", path, problems),
    cardinality: readEnum<RelationCardinality>(
      value,
      "cardinality",
      path,
      RELATION_CARDINALITIES,
      problems
    )
  };
}

/**
 * Read an `Ontology` from a JSON string or an already-parsed value.
 *
 * Throws `OntologyParseError` with every structural problem collected. Unknown
 * extra keys are dropped; valid documents come back as defensive deep copies in
 * canonical field order. Referential integrity is intentionally not enforced
 * here so broken documents remain loadable and repairable.
 */
export function parseOntology(input: string | unknown): Ontology {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OntologyParseError([`Invalid JSON: ${message}`]);
    }
  }
  if (!isRecord(value)) {
    throw new OntologyParseError(["Document must be a JSON object"]);
  }

  const problems: string[] = [];
  const rawClasses = readArray(value, "classes", "", problems);
  const rawRelations = readArray(value, "relations", "", problems);
  const parsed: Ontology = {
    id: readString(value, "id", "", problems),
    name: readString(value, "name", "", problems),
    description: readString(value, "description", "", problems),
    version: readString(value, "version", "", problems),
    baseIri: readString(value, "baseIri", "", problems),
    createdAt: readString(value, "createdAt", "", problems),
    updatedAt: readString(value, "updatedAt", "", problems),
    classes: rawClasses.map((item, index) => parseClass(item, `classes[${index}]`, problems)),
    relations: rawRelations.map((item, index) =>
      parseRelation(item, `relations[${index}]`, problems)
    )
  };

  if (problems.length > 0) {
    throw new OntologyParseError(problems);
  }
  return parsed;
}
