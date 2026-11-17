import { describe, expect, it } from "vitest";

import {
  createAttribute,
  createClass,
  createOntology,
  createRelation,
  exportJsonLd,
  exportTurtle,
  xsdTypeFor
} from "../src/index";
import type { JsonLdNode, Ontology } from "../src/index";

const BASE_IRI = "https://example.org/ontology/university";
const CONTEXT = {
  "@vocab": `${BASE_IRI}#`,
  owl: "http://www.w3.org/2002/07/owl#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#"
};

function fixture(): Ontology {
  return {
    ...createOntology({
      name: "University",
      id: "onto-1",
      now: "2024-01-01T00:00:00.000Z",
      baseIri: BASE_IRI
    }),
    classes: [
      createClass({
        label: "Person",
        name: "Person",
        id: "class-person",
        description: "A human being",
        position: { x: 40, y: 40 },
        attributes: [
          createAttribute({
            name: "fullName",
            label: "Full Name",
            datatype: "string",
            required: true,
            id: "attr-name"
          }),
          createAttribute({ name: "age", label: "Age", datatype: "integer", id: "attr-age" })
        ]
      }),
      createClass({
        label: "Student",
        name: "Student",
        id: "class-student",
        parentId: "class-person",
        description: "",
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

function graphById(document: ReturnType<typeof exportJsonLd>): Map<string, JsonLdNode> {
  return new Map(document["@graph"].map((node) => [node["@id"], node]));
}

describe("xsdTypeFor", () => {
  it("maps every ontology datatype to its XSD term", () => {
    expect(xsdTypeFor("string")).toBe("string");
    expect(xsdTypeFor("integer")).toBe("integer");
    expect(xsdTypeFor("decimal")).toBe("decimal");
    expect(xsdTypeFor("boolean")).toBe("boolean");
    expect(xsdTypeFor("date")).toBe("date");
    expect(xsdTypeFor("dateTime")).toBe("dateTime");
    expect(xsdTypeFor("uri")).toBe("anyURI");
  });
});

describe("exportTurtle", () => {
  it("starts with the documented prefix block", () => {
    const turtle = exportTurtle(fixture());
    expect(turtle).toContain(`@prefix : <${BASE_IRI}#> .`);
    expect(turtle).toContain("@prefix owl: <http://www.w3.org/2002/07/owl#> .");
    expect(turtle).toContain("@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .");
    expect(turtle).toContain("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .");
    expect(turtle).toContain("@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .");
  });

  it("emits one class block per class with labels, comments and parents", () => {
    const turtle = exportTurtle(fixture());

    expect(turtle).toContain(':Person a owl:Class ;');
    expect(turtle).toContain('  rdfs:label "Person" ;');
    expect(turtle).toContain('rdfs:comment "A human being"');
    expect(turtle).toContain(":Student a owl:Class ;");
    expect(turtle).toContain("  rdfs:subClassOf :Person .");
    expect(turtle).not.toContain('  rdfs:comment ""');
  });

  it("emits datatype property blocks with domain and XSD range", () => {
    const turtle = exportTurtle(fixture());

    expect(turtle).toContain(":fullName a owl:DatatypeProperty ;");
    expect(turtle).toContain('  rdfs:label "Full Name" ;');
    expect(turtle).toContain("  rdfs:domain :Person ;");
    expect(turtle).toContain("  rdfs:range xsd:string .");
    expect(turtle).toContain(":age a owl:DatatypeProperty ;");
    expect(turtle).toContain("  rdfs:range xsd:integer .");
  });

  it("emits object property blocks with source and target domains", () => {
    const turtle = exportTurtle(fixture());

    expect(turtle).toContain(":enrolledIn a owl:ObjectProperty ;");
    expect(turtle).toContain('  rdfs:label "enrolled in" ;');
    expect(turtle).toContain("  rdfs:domain :Student ;");
    expect(turtle).toContain("  rdfs:range :Person .");
  });

  it("orders classes, then attributes, then relations, separated by blank lines", () => {
    const turtle = exportTurtle(fixture());

    expect(turtle.indexOf("a owl:Class")).toBeLessThan(turtle.indexOf("a owl:DatatypeProperty"));
    expect(turtle.indexOf("a owl:DatatypeProperty")).toBeLessThan(
      turtle.indexOf("a owl:ObjectProperty")
    );
    expect(turtle).toContain("\n\n");
  });

  it("terminates every statement exactly once and is deterministic", () => {
    const turtle = exportTurtle(fixture());
    const terminatedBlocks = turtle
      .split("\n")
      .filter((line) => line.endsWith(" .") && !line.startsWith("@prefix"));

    // 2 classes + 2 attributes + 1 relation
    expect(terminatedBlocks).toHaveLength(5);
    expect(turtle).not.toContain("..");
    expect(turtle).toBe(exportTurtle(fixture()));
  });

  it("escapes quotes and newlines in labels and comments", () => {
    const ontology: Ontology = {
      ...fixture(),
      classes: [
        createClass({
          label: 'He said "hi"\nthen left',
          name: "Person",
          id: "class-person",
          description: "Line one\nLine two"
        })
      ],
      relations: []
    };
    const turtle = exportTurtle(ontology);

    expect(turtle).toContain('rdfs:label "He said \\"hi\\"\\nthen left"');
    expect(turtle).toContain('rdfs:comment "Line one\\nLine two"');
    expect(turtle).not.toContain('He said "hi"\n');
  });
});

describe("exportJsonLd", () => {
  it("uses the documented context", () => {
    const document = exportJsonLd(fixture());
    expect(document["@context"]).toEqual(CONTEXT);
  });

  it("orders the graph as classes, then attributes, then relations", () => {
    const document = exportJsonLd(fixture());
    const ids = document["@graph"].map((node) => node["@id"]);

    expect(ids).toEqual([
      `${BASE_IRI}#Person`,
      `${BASE_IRI}#Student`,
      `${BASE_IRI}#fullName`,
      `${BASE_IRI}#age`,
      `${BASE_IRI}#enrolledIn`
    ]);
  });

  it("emits class nodes with type, label, comment and subClassOf", () => {
    const nodes = graphById(exportJsonLd(fixture()));
    const person = nodes.get(`${BASE_IRI}#Person`);
    const student = nodes.get(`${BASE_IRI}#Student`);

    expect(person).toMatchObject({
      "@id": `${BASE_IRI}#Person`,
      "@type": "owl:Class",
      "rdfs:label": "Person",
      "rdfs:comment": "A human being"
    });
    expect(person).not.toHaveProperty("rdfs:subClassOf");
    expect(student).toMatchObject({
      "@id": `${BASE_IRI}#Student`,
      "@type": "owl:Class",
      "rdfs:label": "Student",
      "rdfs:subClassOf": { "@id": `${BASE_IRI}#Person` }
    });
    expect(student).not.toHaveProperty("rdfs:comment");
  });

  it("emits attribute nodes with domain and XSD range", () => {
    const nodes = graphById(exportJsonLd(fixture()));

    expect(nodes.get(`${BASE_IRI}#fullName`)).toEqual({
      "@id": `${BASE_IRI}#fullName`,
      "@type": "owl:DatatypeProperty",
      "rdfs:label": "Full Name",
      "rdfs:domain": { "@id": `${BASE_IRI}#Person` },
      "rdfs:range": "xsd:string"
    });
    expect(nodes.get(`${BASE_IRI}#age`)).toMatchObject({
      "rdfs:range": "xsd:integer"
    });
  });

  it("emits relation nodes with source and target IRIs", () => {
    const nodes = graphById(exportJsonLd(fixture()));

    expect(nodes.get(`${BASE_IRI}#enrolledIn`)).toEqual({
      "@id": `${BASE_IRI}#enrolledIn`,
      "@type": "owl:ObjectProperty",
      "rdfs:label": "enrolled in",
      "rdfs:domain": { "@id": `${BASE_IRI}#Student` },
      "rdfs:range": { "@id": `${BASE_IRI}#Person` }
    });
  });

  it("omits endpoints and parents that do not resolve", () => {
    const broken: Ontology = {
      ...fixture(),
      classes: [
        createClass({ label: "Orphan", name: "Orphan", id: "class-orphan", parentId: "missing" })
      ],
      relations: [
        createRelation({
          label: "dangling",
          name: "dangling",
          sourceClassId: "missing-source",
          targetClassId: "missing-target",
          id: "rel-broken"
        })
      ]
    };
    const nodes = graphById(exportJsonLd(broken));
    const orphan = nodes.get(`${BASE_IRI}#Orphan`);
    const dangling = nodes.get(`${BASE_IRI}#dangling`);

    expect(orphan).not.toHaveProperty("rdfs:subClassOf");
    expect(dangling).not.toHaveProperty("rdfs:domain");
    expect(dangling).not.toHaveProperty("rdfs:range");
  });

  it("is deterministic", () => {
    const ontology = fixture();
    expect(exportJsonLd(ontology)).toEqual(exportJsonLd(ontology));
    expect(JSON.stringify(exportJsonLd(ontology))).toBe(JSON.stringify(exportJsonLd(ontology)));
  });
});
