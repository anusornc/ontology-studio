# Ontology Domain Contract

This document is the authoritative behavior spec for `@onto/core`. The TypeScript
types in `packages/ontology-core/src/types.ts` are frozen for the other packages.
`@onto/core` must be a **pure** TypeScript library: no DOM, no Node APIs, no I/O,
no framework dependencies. IDs and timestamps are the only non-deterministic
inputs, and both are injectable or tolerated by tests.

## Vocabulary

- **Ontology** – one aggregate document: metadata + classes + relations.
- **Class** (entity type / `owl:Class`) – may have at most one parent (`subClassOf`).
- **Attribute** (datatype property) – typed literal owned by exactly one class.
- **Relation** (object property) – directed edge between two classes.
- **IRI** – `iriFor(ontology, localName)` = `baseIri + "#" + localName`.

## Creation defaults

| Factory | Defaults |
| --- | --- |
| `createOntology` | `id` random UUID, `version` `"0.1.0"`, `baseIri` `https://example.org/ontology/<slug(name)>` (when `slugify(name)` is empty the fallback segment is `ontology`), `createdAt = updatedAt = now` (ISO string, injectable), empty arrays, description `""` |
| `createClass` | `id` random UUID, `name = suggestClassName(label)`, `label` trimmed, description `""`, `parentId: null`, `color` first PALETTE colour when omitted, `attributes: []`, `position` `{x:0,y:0}` |
| `createAttribute` | `id` random UUID, `label` defaults to title-cased `name`, `datatype` `"string"`, `required: false`, `cardinality: "one"`, description `""`, `enumValues: []` |
| `createRelation` | `id` random UUID, `name = suggestRelationName(label)`, `cardinality` `"many-to-many"`, description `""` |

`createClass`, `createAttribute` and `createRelation` accept an explicit `id`
for deterministic tests. `createOntology` accepts `id`, `now`, `version`,
`baseIri`.

Naming helpers convert human labels to machine names:

- `suggestClassName("Research Project")` -> `"ResearchProject"` (PascalCase, ASCII).
- `suggestAttributeName("Start date")` -> `"startDate"` (camelCase, ASCII).
- `suggestRelationName("enrolled in")` -> `"enrolledIn"`.
- `slugify("Research Project")` -> `"research-project"`.
- Non-ASCII input falls back to a stable `"Entity"` / `"entity"` / `"entity"` result
  rather than throwing. Empty input behaves the same way.

Unique-name helpers used by the UI: `suggestUniqueClassName(ontology, label)`,
`suggestUniqueAttributeName(ontology, classId, label)`,
`suggestUniqueRelationName(ontology, label)` append `2`, `3`, ... until unique.

## Mutations

All mutations are immutable (return a new `Ontology`) and bump `updatedAt` to
`new Date().toISOString()`:

- `addClass`, `updateClass(ontology, classId, patch)`, `removeClass`,
  `setClassPosition(ontology, classId, position)`.
- `addAttribute(ontology, classId, attribute)`, `updateAttribute`,
  `removeAttribute`.
- `addRelation`, `updateRelation`, `removeRelation`.
- `updateOntologyMeta(ontology, patch)` for name/description/version/baseIri.

Unknown ids are a no-op that returns an unchanged ontology (same reference is
allowed). `removeClass` also removes every relation that references the class
and reparents direct children to the removed class's parent (or `null`).
`updateClass` cannot change `id` or `attributes` (ignored if present in patch).
Attribute/relation patches must preserve their `id`.

## Queries and layout

- `findClass`, `findAttribute`, `findRelation` return `undefined` when absent.
- `classChildren(ontology, classId)` returns direct children in input order.
- `classAncestors(ontology, classId)` returns ancestors nearest-first, cycle-safe.
- `classDescendants(ontology, classId)` returns all descendants depth-first,
  cycle-safe.
- `buildClassTree(ontology)` returns `ClassTreeNode[]`; roots are classes whose
  `parentId` is `null` **or points at a missing class** (orphans must remain
  visible in the UI), sorted by `label` then `name`. Children are sorted the same
  way. Cycles must not recurse forever: a class already in the current branch is
  not expanded again.
- `autoLayout(ontology)` produces a deterministic left-to-right inheritance
  layout: `x = 40 + depth * 320`, `y = 40 + indexWithinDepth * 180`, where
  `depth` is the class's ancestor count and classes at the same depth are ordered
  by `name`. Missing parents count as depth 0. Timestamps and all other fields
  are preserved.
- `summarizeOntology(ontology)` returns the `OntologySummary` projection used by
  `GET /api/ontologies`.

## Validation

`validateOntology(ontology)` returns a `ValidationReport` with deterministic
ordering: ontology-level issues first, then classes in array order (each class's
own issue then its attributes in order), then relations in array order.
`errors`/`warnings` are counts; `ok === (errors === 0)`.

Severity and exact codes:

| Code | Severity | Rule |
| --- | --- | --- |
| `empty-ontology` | warning | `classes.length === 0` |
| `invalid-base-iri` | error | not absolute `http(s)://`, contains whitespace, or ends with `#` |
| `duplicate-class-name` | error | one issue on every class after the first with the same `name` (case-sensitive) |
| `duplicate-class-label` | warning | same rule for normalised (trimmed, case-insensitive) `label` |
| `invalid-class-name` | error | `name` must match `/^[A-Za-z][A-Za-z0-9_]*$/` |
| `empty-class-label` | warning | trimmed label is empty |
| `unknown-parent` | error | `parentId` is not null and no such class exists |
| `self-inheritance` | error | `parentId === id` |
| `inheritance-cycle` | error | one issue per cycle; `entityId` is the lexicographically smallest class id in the cycle, message lists the class names in cycle order |
| `duplicate-attribute-name` | error | duplicate within one class; issue on every attribute after the first |
| `invalid-attribute-name` | error | same identifier regex as classes |
| `empty-attribute-label` | warning | trimmed label empty |
| `duplicate-relation-name` | error | duplicate among relations; issue on every relation after the first |
| `empty-relation-label` | warning | trimmed label empty |
| `unknown-relation-source` | error | `sourceClassId` missing |
| `unknown-relation-target` | error | `targetClassId` missing |
| `self-relation` | warning | source and target are the same class |

Attribute issues set `ownerId` to the owning class id; relation issues set
`ownerId` to `sourceClassId` when it exists; class and ontology issues leave
`ownerId` undefined. Messages must include the offending name/label so the UI can
show something useful.

## Native serialization

- `serializeOntology(ontology)` -> pretty JSON (`JSON.stringify(value, null, 2)`)
  containing exactly the `Ontology` shape.
- `parseOntology(input: string | unknown)` -> `Ontology`. Accepts a JSON string or
  already-parsed value. Throws `OntologyParseError` whose `problems` lists every
  structural problem found (all collected, not just the first). Validates:
  required primitive fields, arrays, datatype/cardinality enum membership,
  position numbers, enumValues string array, relation endpoint strings. Unknown
  extra keys are ignored; valid documents are returned as a defensive deep copy
  in canonical field order. Referential integrity (unknown parent / endpoint) is
  **not** a parse error — such documents stay loadable so users can repair them.

## Interop export

`exportTurtle(ontology)` – deterministic OWL/Turtle:

- Prefix block: `@prefix : <baseIri#> .` plus `owl`, `rdf`, `rdfs`, `xsd`.
- One block per class: `:<Name> a owl:Class`, `rdfs:label`, optionally
  `rdfs:comment`, optionally `rdfs:subClassOf :<Parent>`.
- One block per attribute with `a owl:DatatypeProperty`, label, domain `:<Class>`,
  range `xsd:<mapped>` (`string->string`, `integer->integer`,
  `decimal->decimal`, `boolean->boolean`, `date->date`, `dateTime->dateTime`,
  `uri->anyURI`).
- One block per relation with `a owl:ObjectProperty`, label, domain, range.
- Empty descriptions are omitted. Labels are escaped for `"` and newlines.
- Blocks separated by blank lines, statements terminated with ` .` exactly once.

`exportJsonLd(ontology)` – deterministic JSON-LD object:

- `@context`: `{ "@vocab": "<baseIri>#", "owl": "...", "rdfs": "...", "xsd": "..." }`.
- `@graph` ordered classes then their attributes then relations.
- Class nodes: `@id` absolute IRI, `@type: "owl:Class"`, `rdfs:label`,
  `rdfs:comment` (when non-empty), `rdfs:subClassOf: { "@id": "<parent iri>" }`
  (when known).
- Attribute nodes: `@type: "owl:DatatypeProperty"`, `rdfs:label`, `rdfs:domain`,
  `rdfs:range` (`xsd:<mapped>`).
- Relation nodes: `@type: "owl:ObjectProperty"`, `rdfs:label`, domain, range.
- `exportJsonLdString` is not required; callers use `JSON.stringify(doc, null, 2)`.

## Sample ontology

`createSampleOntology()` returns a ready-to-explore "University" ontology with
positioned classes, a small inheritance tree, attributes with varied datatypes and
a handful of relations, and it must pass validation with **zero errors**. It is
the payload behind the UI's "Load sample" action.

## Ontology templates

A **template** is a ready-made starting ontology a user can pick instead of a
blank canvas. All template-building lives in `@onto/core` (pure), so any client
can use it and it is fully unit-testable.

### `OntologyTemplate`

```ts
interface OntologyTemplate {
  /** Stable machine id, e.g. "pizza" or "supply-chain". */
  id: string;
  /** Human label, e.g. "Pizza". */
  name: string;
  /** One-line description shown on the picker card. */
  description: string;
  /** Short category tag: "Domain" | "Learning" | "Industry". */
  category: "Domain" | "Learning" | "Industry";
  /** Keyword blurb used by a search box. */
  tags: string[];
  /** Build a brand-new ontology instance (fresh unique ids) with a laid-out graph. */
  build: (options?: TemplateBuildOptions) => Ontology;
}
```

`TemplateBuildOptions`:
- `now?: string` — injectable ISO timestamp for determinism in tests.
- `nameOverride?: string` — optional override for the ontology `name`; defaults
  to the template's own name.
- `baseIriOverride?: string`.

### Registry + helpers

- `createOntologyTemplates(): OntologyTemplate[]` — all templates, in a fixed
  stable order.
- `findOntologyTemplate(id: string): OntologyTemplate | undefined`.
- `createOntologyFromTemplate(id: string, options?): Ontology` — shorthand for
  `findOntologyTemplate(id)?.build(options)`; throws `RangeError` with a helpful
  message when the id is unknown.

### Required templates

1. **`pizza`** — category `Learning`. The durable Protege tutorial classic:
   - Root `Pizza`, subclasses `VegetarianPizza`, `MeatPizza`, `CheesePizza`
     (all `subClassOf` Pizza, distinct coloured palettes).
   - `PizzaBase` with attribute `thickness` (enum `thin|thick|deep-dish`).
   - `PizzaTopping` (datatype `vegetarian: boolean`), `Topping` subclass of
     `PizzaTopping` (e.g. Pepperoni, Mushroom), and a `CheeseType` enum-attribute.
   - Relations: `Pizza —hasBase—> PizzaBase` (exactly one), `Pizza —hasTopping—>
     PizzaTopping` (many), `VegetarianPizza —excludesTopping—> Topping` (many,
     meaning the meat toppings this vegetarian pizza forbids).
   - At least 6 classes, varied datatypes and cardinalities, `hasBase` and
     `hasTopping` for the root. Names match the canonical tutorial (Pizza,
     PizzaTopping, PizzaBase, Topping, VegetarianPizza, MeatPizza).
   - Must validate with zero errors. Must auto-layout cleanly.

2. **`supply-chain`** — category `Industry`. Traceability:
   - Classes `Product`, `Batch` (`subClassOf` Product), `Party`, `Location`,
     `HandlingEvent`, `SensorReading`.
   - Attributes: Batch `batchId` (string, required), `producedAt` (dateTime),
     Location `longitude`/`latitude` (decimal), HandlingEvent `occurredAt`
     (dateTime, required) + `eventType` (enum `produce|store|transport|receive|retail`),
     SensorReading `temperatureC` (decimal) + `recordedAt` (dateTime).
   - Relations: `Batch —undergoes—> HandlingEvent` (one-to-many),
     `HandlingEvent —performedBy—> Party` (many-to-one),
     `HandlingEvent —atLocation—> Location` (many-to-one),
     `Batch —trackedBy—> SensorReading` (one-to-many).
   - Zero validation errors; clean layout.

3. **`education`** — category `Domain`. A compact school domain distinct from
   the University sample: `Student`, `Teacher`, `Course`, `Classroom`,
   `Enrollment` with `Student`/`Teacher` subClassOf a shared `Person` root,
   attributes (email, gradeLevel enum, credits, roomNumber) and relations
   (`teaches`, `takes`, `heldIn`). Zero validation errors.

4. **`library`** — category `Domain`. Catalogue + loans: `LibraryItem`,
   `Book`, `Magazine` (both subClassOf LibraryItem), `Author`, `Member`,
   `Loan`. Attributes `isbn` (string, required), `publishedYear` (integer),
   `dueDate` (date). Relations `writtenBy`, `borrows`, `lends`. Zero errors.

Each template must build a **fresh** ontology each call (unique class/attribute/
relation ids, no shared mutable state between calls) and validate with zero
errors. Determinism is defined by the **`now` seed**: `build({ now })` with a
fixed `now` reproduces byte-identical output (used to make assertions and
screenshots reproducible), while distinct `now` seeds produce entirely
non-overlapping ids. Two consecutive `build()` calls with the **same** `now`
return the same ids; with different `now` values they never share an id. When
`now` is omitted the build uses the real wall clock and is therefore unique per
call. Tests must assert: registry order, find/unknown-throw, and for EVERY
template — class count, key class/relation presence, zero validation errors,
deterministic re-build with a fixed `now`, and that two builds with different
`now` values never share ids.

The University sample keeps `createSampleOntology()` unchanged (that is the
"Load sample" action); templates are an additional surface surfaced by the New-
ontology dialog.
