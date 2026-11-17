/**
 * Frozen domain contract shared by the core package, API server and web client.
 *
 * These types are the public seam of the ontology domain. Implementations live
 * in sibling modules (model, validation, serialization); this file only
 * describes data. Extending with optional fields is allowed, breaking changes
 * require coordinating all three packages.
 */

export const DATATYPES = [
  "string",
  "integer",
  "decimal",
  "boolean",
  "date",
  "dateTime",
  "uri"
] as const;

/** XSD-backed datatype for an attribute (literal property). */
export type Datatype = (typeof DATATYPES)[number];

export const ATTRIBUTE_CARDINALITIES = ["one", "many"] as const;

/** How many literal values a single attribute may hold on one instance. */
export type AttributeCardinality = (typeof ATTRIBUTE_CARDINALITIES)[number];

export const RELATION_CARDINALITIES = [
  "one-to-one",
  "one-to-many",
  "many-to-one",
  "many-to-many"
] as const;

/** Cardinality of an object property from source class to target class. */
export type RelationCardinality = (typeof RELATION_CARDINALITIES)[number];

/** Canvas coordinates in graph space. */
export interface Position {
  x: number;
  y: number;
}

/** A typed literal property declared on a class. */
export interface OntologyAttribute {
  /** Stable local identifier (UUID); never shown to end users. */
  id: string;
  /** Machine name, e.g. "fullName". */
  name: string;
  /** Human readable label; defaults to a title-cased name. */
  label: string;
  datatype: Datatype;
  /** True when every instance must have a value. */
  required: boolean;
  cardinality: AttributeCardinality;
  description: string;
  /** Allowed values for enum-like attributes; empty means unconstrained. */
  enumValues: string[];
}

/** A class (entity type) in the ontology. */
export interface OntologyClass {
  /** Stable local identifier (UUID); never shown to end users. */
  id: string;
  /** Machine name / local IRI fragment, e.g. "Person". */
  name: string;
  /** Human readable label. */
  label: string;
  description: string;
  /** Single inheritance parent, or null for a root class. */
  parentId: string | null;
  /** Hex colour used on the canvas. */
  color: string;
  attributes: OntologyAttribute[];
  position: Position;
}

/** A directed object property between two classes. */
export interface OntologyRelation {
  /** Stable local identifier (UUID). */
  id: string;
  /** Machine name / local IRI fragment, e.g. "enrolledIn". */
  name: string;
  label: string;
  description: string;
  /** Source class id (owl:domain). */
  sourceClassId: string;
  /** Target class id (owl:range). */
  targetClassId: string;
  cardinality: RelationCardinality;
}

/** The aggregate root: one complete ontology document. */
export interface Ontology {
  /** Stable identifier (UUID). */
  id: string;
  name: string;
  description: string;
  /** Semantic version of this ontology document, e.g. "0.1.0". */
  version: string;
  /** Base IRI used to mint class / property IRIs, without trailing "#". */
  baseIri: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-modified timestamp. */
  updatedAt: string;
  classes: OntologyClass[];
  relations: OntologyRelation[];
}

/** Lightweight list projection used by the ontology picker. */
export interface OntologySummary {
  id: string;
  name: string;
  description: string;
  version: string;
  classCount: number;
  relationCount: number;
  updatedAt: string;
}

export const ISSUE_SEVERITIES = ["error", "warning"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_CODES = [
  "empty-ontology",
  "invalid-base-iri",
  "duplicate-class-name",
  "duplicate-class-label",
  "invalid-class-name",
  "empty-class-label",
  "unknown-parent",
  "self-inheritance",
  "inheritance-cycle",
  "duplicate-attribute-name",
  "invalid-attribute-name",
  "empty-attribute-label",
  "duplicate-relation-name",
  "empty-relation-label",
  "unknown-relation-source",
  "unknown-relation-target",
  "self-relation"
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export type EntityKind = "ontology" | "class" | "attribute" | "relation";

/** One actionable validation finding. */
export interface ValidationIssue {
  severity: IssueSeverity;
  code: IssueCode;
  /** Human readable explanation including the offending name. */
  message: string;
  entity: EntityKind;
  /** Id of the offending entity (ontology id, class id, attribute id, relation id). */
  entityId: string;
  /** Id of the owning class for attribute issues; class id for relation issues. */
  ownerId?: string;
}

/** A validation run result. `ok` is false when at least one error exists. */
export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
}

/** JSON-LD document produced by the exporter. */
export interface JsonLdDocument {
  "@context": Record<string, string>;
  "@graph": JsonLdNode[];
}

export interface JsonLdNode {
  "@id": string;
  "@type": string | string[];
  [term: string]: unknown;
}

/** Error raised when untrusted JSON cannot be read as an Ontology. */
export class OntologyParseError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid ontology document: ${problems.join("; ")}`);
    this.name = "OntologyParseError";
    this.problems = problems;
  }
}
