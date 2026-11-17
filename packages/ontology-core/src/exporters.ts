/**
 * Interoperability exporters: deterministic OWL/Turtle and JSON-LD documents.
 *
 * Exports never throw on referentially broken ontologies; unknown parents or
 * relation endpoints are simply omitted so users can still inspect the model in
 * other tools.
 */

import type { Datatype, JsonLdDocument, JsonLdNode, Ontology, OntologyClass } from "./types";
import { iriFor } from "./model";

const OWL_NS = "http://www.w3.org/2002/07/owl#";
const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#";
const XSD_NS = "http://www.w3.org/2001/XMLSchema#";

const XSD_TYPES: Record<Datatype, string> = {
  string: "string",
  integer: "integer",
  decimal: "decimal",
  boolean: "boolean",
  date: "date",
  dateTime: "dateTime",
  uri: "anyURI"
};

/** XSD local term for an ontology datatype, e.g. `uri` -> `"anyURI"`. */
export function xsdTypeFor(datatype: Datatype): string {
  return XSD_TYPES[datatype];
}

function classById(ontology: Ontology): Map<string, OntologyClass> {
  return new Map(ontology.classes.map((item) => [item.id, item]));
}

function escapeTurtleLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

interface TurtlePredicate {
  predicate: string;
  object: string;
}

function turtleBlock(subject: string, type: string, predicates: readonly TurtlePredicate[]): string {
  const lines = [`${subject} a ${type}`];
  for (const item of predicates) {
    lines.push(`  ${item.predicate} ${item.object}`);
  }
  return `${lines.join(" ;\n")} .`;
}

function labelLiteral(value: string): string {
  return `"${escapeTurtleLiteral(value)}"`;
}

/**
 * Deterministic OWL/Turtle export: prefix block, then class blocks, then
 * datatype property blocks, then object property blocks, blank-line separated.
 */
export function exportTurtle(ontology: Ontology): string {
  const prefixes = [
    `@prefix : <${ontology.baseIri}#> .`,
    `@prefix owl: <${OWL_NS}> .`,
    `@prefix rdf: <${RDF_NS}> .`,
    `@prefix rdfs: <${RDFS_NS}> .`,
    `@prefix xsd: <${XSD_NS}> .`
  ].join("\n");

  const byId = classById(ontology);
  const blocks: string[] = [];

  for (const ontologyClass of ontology.classes) {
    const predicates: TurtlePredicate[] = [
      { predicate: "rdfs:label", object: labelLiteral(ontologyClass.label) }
    ];
    if (ontologyClass.description.length > 0) {
      predicates.push({
        predicate: "rdfs:comment",
        object: labelLiteral(ontologyClass.description)
      });
    }
    const parent = ontologyClass.parentId === null ? undefined : byId.get(ontologyClass.parentId);
    if (parent) {
      predicates.push({ predicate: "rdfs:subClassOf", object: `:${parent.name}` });
    }
    blocks.push(turtleBlock(`:${ontologyClass.name}`, "owl:Class", predicates));
  }

  for (const ontologyClass of ontology.classes) {
    for (const attribute of ontologyClass.attributes) {
      blocks.push(
        turtleBlock(`:${attribute.name}`, "owl:DatatypeProperty", [
          { predicate: "rdfs:label", object: labelLiteral(attribute.label) },
          { predicate: "rdfs:domain", object: `:${ontologyClass.name}` },
          { predicate: "rdfs:range", object: `xsd:${xsdTypeFor(attribute.datatype)}` }
        ])
      );
    }
  }

  for (const relation of ontology.relations) {
    const predicates: TurtlePredicate[] = [
      { predicate: "rdfs:label", object: labelLiteral(relation.label) }
    ];
    const source = byId.get(relation.sourceClassId);
    const target = byId.get(relation.targetClassId);
    if (source) {
      predicates.push({ predicate: "rdfs:domain", object: `:${source.name}` });
    }
    if (target) {
      predicates.push({ predicate: "rdfs:range", object: `:${target.name}` });
    }
    blocks.push(turtleBlock(`:${relation.name}`, "owl:ObjectProperty", predicates));
  }

  if (blocks.length === 0) {
    return `${prefixes}\n`;
  }
  return `${prefixes}\n\n${blocks.join("\n\n")}\n`;
}

/**
 * Deterministic JSON-LD export. `@graph` is ordered classes, then attributes,
 * then relations. Referential gaps are omitted rather than exported as dangling
 * IRIs.
 */
export function exportJsonLd(ontology: Ontology): JsonLdDocument {
  const byId = classById(ontology);
  const graph: JsonLdNode[] = [];

  for (const ontologyClass of ontology.classes) {
    const node: JsonLdNode = {
      "@id": iriFor(ontology, ontologyClass.name),
      "@type": "owl:Class",
      "rdfs:label": ontologyClass.label
    };
    if (ontologyClass.description.length > 0) {
      node["rdfs:comment"] = ontologyClass.description;
    }
    const parent = ontologyClass.parentId === null ? undefined : byId.get(ontologyClass.parentId);
    if (parent) {
      node["rdfs:subClassOf"] = { "@id": iriFor(ontology, parent.name) };
    }
    graph.push(node);
  }

  for (const ontologyClass of ontology.classes) {
    for (const attribute of ontologyClass.attributes) {
      graph.push({
        "@id": iriFor(ontology, attribute.name),
        "@type": "owl:DatatypeProperty",
        "rdfs:label": attribute.label,
        "rdfs:domain": { "@id": iriFor(ontology, ontologyClass.name) },
        "rdfs:range": `xsd:${xsdTypeFor(attribute.datatype)}`
      });
    }
  }

  for (const relation of ontology.relations) {
    const node: JsonLdNode = {
      "@id": iriFor(ontology, relation.name),
      "@type": "owl:ObjectProperty",
      "rdfs:label": relation.label
    };
    const source = byId.get(relation.sourceClassId);
    const target = byId.get(relation.targetClassId);
    if (source) {
      node["rdfs:domain"] = { "@id": iriFor(ontology, source.name) };
    }
    if (target) {
      node["rdfs:range"] = { "@id": iriFor(ontology, target.name) };
    }
    graph.push(node);
  }

  return {
    "@context": {
      "@vocab": `${ontology.baseIri}#`,
      owl: OWL_NS,
      rdfs: RDFS_NS,
      xsd: XSD_NS
    },
    "@graph": graph
  };
}
