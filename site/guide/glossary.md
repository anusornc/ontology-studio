# Glossary

Domain vocabulary used throughout Ontology Studio.

## Core Concepts

| Term | Definition |
|------|-----------|
| **Ontology** | A complete document: metadata + classes + relations. The aggregate root of the domain model. |
| **Class** | An entity type (`owl:Class`). May have at most one parent via `subClassOf`. Displayed as a node on the canvas. |
| **Attribute** | A datatype property owned by exactly one class. Has a name, label, XSD datatype, cardinality and optional enum values. |
| **Relation** | An object property — a directed edge between two classes with a cardinality constraint. |
| **IRI** | Internationalized Resource Identifier. Constructed as `baseIri + "#" + localName`. Uniquely identifies classes and properties in exports. |
| **Base IRI** | The namespace prefix for an ontology (e.g. `https://example.org/ontology/pizza`). All class/property IRIs are minted under it. |
| **subClassOf** | Single inheritance relationship. A class may have at most one parent; cycles are detected and reported. |
| **Cardinality** | Constraint on how many values a property may hold: `one`/`many` for attributes; `one-to-one`, `one-to-many`, `many-to-one`, `many-to-many` for relations. |

## Validation

| Term | Definition |
|------|-----------|
| **Validation Issue** | One actionable finding with severity (`error`/`warning`), code, message, entity kind and entity ID. |
| **Validation Report** | Result of `validateOntology()`: `{ ok, issues, errors, warnings }`. `ok === (errors === 0)`. |
| **Issue Code** | One of 17 codes: `empty-ontology`, `invalid-base-iri`, `duplicate-class-name`, `inheritance-cycle`, `unknown-relation-source`, etc. |

## Serialization & Export

| Term | Definition |
|------|-----------|
| **Native JSON** | The internal `Ontology` shape serialized as pretty JSON. Round-trippable via `parseOntology`. |
| **Turtle** | OWL/Turtle text format (`.ttl`). Deterministic output with `owl:`, `rdf:`, `rdfs:`, `xsd:` prefixes. |
| **JSON-LD** | Linked Data JSON format (`.jsonld`). Uses `@context` with `@vocab` pointing to the base IRI. |
| **OntologyParseError** | Thrown when untrusted JSON cannot be decoded as a valid `Ontology`. Collects ALL structural problems. |

## Architecture

| Term | Definition |
|------|-----------|
| **Repository** | Storage abstraction (`OntologyRepository` interface). Three adapters: InMemory (tests), JsonFile (default), SQLite (optional). |
| **Seam** | A public boundary where tests observe behaviour without reaching inside internals. Tests live at seams only. |
| **Tracer Bullet** | A single vertical slice: one failing test → minimal implementation → next seam outward. The TDD unit of work. |
| **Vertical Slice** | Building one behaviour end-to-end across all seams before moving to the next behaviour. Opposed to horizontal slicing. |
| **Template** | A ready-made starter ontology (Pizza, Supply Chain, Education, Library) built by a pure function in `@onto/core`. |
| **Summary** | Lightweight list projection (`OntologySummary`) used by the ontology picker. Never persisted separately. |
