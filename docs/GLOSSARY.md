# Ontology Designer Glossary

The working vocabulary for the Ontology Designer. These terms are used with these
meanings in the contracts, code, tests and documentation; prefer them over the
alternatives listed under each entry.

## Domain model

**Ontology**:
One complete aggregate document: metadata, classes and relations, saved and exported as
a unit.
_Avoid_: model, schema, project, workspace

**Class**:
An entity type in the ontology, equivalent to an `owl:Class`. A class has one machine
name, a human label, an optional single parent and its own attributes.
_Avoid_: entity, concept, node, type

**Attribute**:
A typed literal property owned by exactly one class, equivalent to a datatype property.
It declares datatype, cardinality, requiredness and optional enum values.
_Avoid_: field, column, property (ambiguous with relation)

**Relation**:
A directed object property from a source class to a target class, equivalent to an
`owl:ObjectProperty`. Relations are the edges drawn on the canvas.
_Avoid_: edge, association, link

**IRI**:
Internationalized Resource Identifier — the absolute identifier minted for a class,
attribute or relation as `baseIri + "#" + name`, where `name` is the entity's machine name.
_Avoid_: URL, URI (only use when technically referring to the URI syntax)

**Base IRI**:
The shared prefix every entity IRI is minted from, stored without a trailing `#`.
Changing it changes the exported identifiers, not the document's internal ids.
_Avoid_: namespace, prefix, domain

**Inheritance (`subClassOf`)**:
The relation from a class to its single parent class. A class may have at most one
parent; descendants are ordered nearest-first for ancestors and depth-first for
descendants.
_Avoid_: extends, subclassing, hierarchy

**Cardinality**:
How many values a property may have. Attributes are `one` or `many`; relations are
`one-to-one`, `one-to-many`, `many-to-one` or `many-to-many`.
_Avoid_: multiplicity, arity

**Validation issue**:
One actionable finding from validation: a severity (`error` or `warning`), a stable
issue code, a message that names the offending entity, and the entity it belongs to.
_Avoid_: error, diagnostic, problem (when severity is not implied)

## Representation and interchange

**Native JSON**:
The canonical document format: exactly the `Ontology` shape, pretty-printed. It is the
format the data directory stores, the body of the `.json` export, and the only format
accepted for import.
_Avoid_: model JSON, raw JSON, backup format

**JSON-LD**:
The RDF JSON serialization produced for interop: an `@context` plus an `@graph` of
class, datatype-property and object-property nodes.
_Avoid_: linked JSON, semantic JSON

**Turtle**:
The compact RDF text syntax (`.ttl`) produced for interop, with OWL, RDF, RDFS and XSD
prefixes and one block per class, attribute and relation.
_Avoid_: TTL (except as a file extension), RDF

**Summary**:
The lightweight projection of an ontology used by the picker: id, name, description,
version, class and relation counts, and last-updated timestamp.
_Avoid_: list item, overview

## Architecture and delivery

**Repository**:
The persistence seam that stores and retrieves ontology documents. The domain layer
never sees it; the API depends on the interface, with an in-memory adapter for tests
and a JSON-file adapter at runtime.
_Avoid_: store, DAO, database layer

**Seam**:
A deliberate boundary where behaviour can be substituted or observed without touching
the code under test — for example a pure function, an injected data directory, a store
factory taking a fake API, or `data-testid` attributes.
_Avoid_: mock point, hook, interface (too broad)

**Tracer bullet**:
The smallest end-to-end implementation of one behaviour that travels through every
layer it will eventually need, proving the path works before the feature is completed.
_Avoid_: spike, prototype

**Vertical slice**:
One thin, complete unit of behaviour delivered across domain, API and UI together,
rather than a horizontal layer completed in isolation.
_Avoid_: feature, story, increment (when the cross-layer meaning is intended)

**Contract**:
An authoritative written specification that the parallel packages agree on: the domain,
API and UI contract documents.
_Avoid_: spec, requirements (be specific about which contract)
