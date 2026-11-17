# Architecture

Ontology Designer is a pnpm monorepo with three workspace packages and one shared
dependency rule: `@onto/core` is a pure TypeScript domain library, and both applications
depend on it. The core knows nothing about the browser, the server, HTTP or files.

This document describes the architecture fixed by the
[domain contract](DOMAIN-CONTRACT.md), [API contract](API-CONTRACT.md) and
[UI contract](UI-CONTRACT.md). The core library and the API are implemented and tested;
the last web UI components and their tests are still landing, so where a module is not
yet complete, treat the contract as the source of truth.

## Dependency rule

| Package | Layer | May depend on | Must not depend on |
| --- | --- | --- | --- |
| `@onto/core` | Pure domain | Nothing (only injected ids and timestamps) | DOM, Node APIs, Fastify, React, Zustand, `@onto/*` |
| `@onto/server` | API and persistence | `@onto/core`, Fastify, Node | `@onto/web` |
| `@onto/web` | Presentation | `@onto/core`, React, React Flow, Zustand | `@onto/server` |

The applications talk to each other only through the HTTP contract, never by importing
each other's code. The core is the only package that both sides share, and it is pure:
every mutation returns a new value, and the only non-deterministic inputs — ids and
timestamps — are injectable or tolerated by tests.

## 1. System context and components

The browser studio talks JSON over HTTP to the Fastify API. The API persists each
ontology as a JSON file through a repository interface. Both applications import the
shared domain core for the behaviour they must agree on.

```mermaid
flowchart LR
    accTitle: System Component Overview
    accDescr: The browser studio calls the Fastify API over JSON HTTP, the API persists one JSON file per ontology through the repository interface, and both apps depend on the pure shared domain core.

    subgraph web["Browser: @onto/web"]
        direction TB
        ui["React components<br/>TopBar, Sidebar, Canvas, Inspector"]
        store["Zustand store<br/>createOntologyStore(api)"]
        client["API client<br/>OntologyApi over relative /api"]
        toflow["Pure graph mapping<br/>toFlow: ontology to nodes and edges"]
        ui --> store
        ui --> toflow
        store --> client
    end

    subgraph api["API process: @onto/server"]
        direction TB
        app["buildApp<br/>Fastify routes"]
        repo["OntologyRepository<br/>interface"]
        memory["InMemoryOntologyRepository<br/>tests"]
        jsonfile["JsonFileOntologyRepository<br/>runtime"]
        app --> repo
        repo -.-> memory
        repo -.-> jsonfile
    end

    core["@onto/core<br/>pure domain: model, queries, layout, validation, serialization"]
    disk[("JSON files<br/>data/ontologies/{id}.json")]

    client -->|"HTTP JSON under /api"| app
    store -->|"types and sample data"| core
    toflow -->|"types"| core
    app -->|"create, parse, mutate, validate, export"| core
    jsonfile -->|"atomic write: temp file then rename"| disk
```

- In development the web dev server proxies `/api` to `127.0.0.1:5174`, so the browser
  uses one origin. In production the API can serve the built web app from
  `ONTO_WEB_DIST` with an SPA fallback, which removes the cross-origin hop entirely.
- The API owns persistence. The web app never writes files and never assumes where data
  lives; it only sends complete ontology documents through the REST contract.
- The repository is a seam as well as an abstraction: tests build the API with an
  in-memory adapter, while `server.ts` wires the JSON-file adapter rooted at
  `ONTO_DATA_DIR`.
- `@onto/core` appears on both sides because the contracts require both to agree on
  documents. The browser uses core types and helpers; the API uses core factories,
  parsing, validation and export; no behaviour is duplicated.

## 2. Domain model

One `Ontology` aggregate owns a list of classes and a list of relations. Classes own
attributes and may point at a single parent class. Validation is a pure projection that
returns a report; the list projection used by the ontology picker is another.

```mermaid
classDiagram
    accTitle: Domain Class Model
    accDescr: One ontology owns classes and relations, each class owns attributes, a class may reference one parent class, and validation returns a report of validation issues.

    class Ontology {
        +string id
        +string name
        +string description
        +string version
        +string baseIri
        +string createdAt
        +string updatedAt
        +OntologyClass classes
        +OntologyRelation relations
    }

    class OntologyClass {
        +string id
        +string name
        +string label
        +string description
        +string parentId
        +string color
        +OntologyAttribute attributes
        +Position position
    }

    class OntologyAttribute {
        +string id
        +string name
        +string label
        +Datatype datatype
        +boolean required
        +AttributeCardinality cardinality
        +string description
        +string enumValues
    }

    class OntologyRelation {
        +string id
        +string name
        +string label
        +string description
        +string sourceClassId
        +string targetClassId
        +RelationCardinality cardinality
    }

    class ValidationReport {
        +boolean ok
        +ValidationIssue issues
        +number errors
        +number warnings
    }

    class ValidationIssue {
        +IssueSeverity severity
        +IssueCode code
        +string message
        +EntityKind entity
        +string entityId
        +string ownerId
    }

    class OntologySummary {
        +string id
        +string name
        +string description
        +string version
        +number classCount
        +number relationCount
        +string updatedAt
    }

    Ontology "1" *-- "0..*" OntologyClass : classes
    Ontology "1" *-- "0..*" OntologyRelation : relations
    OntologyClass "1" *-- "0..*" OntologyAttribute : attributes
    OntologyClass "0..1" --> "0..1" OntologyClass : subClassOf
    OntologyRelation "1" --> "1" OntologyClass : sourceClassId
    OntologyRelation "1" --> "1" OntologyClass : targetClassId
    Ontology ..> ValidationReport : validateOntology
    ValidationReport "1" *-- "0..*" ValidationIssue : issues
    Ontology ..> OntologySummary : summarizeOntology
```

- The frozen TypeScript interfaces live in `packages/ontology-core/src/types.ts`; the
  diagram above is a summary, not a second source of truth.
- Referential integrity is deliberately not a load-time requirement: a document may
  reference a missing parent or endpoint and still parse, so users can repair it. Such
  documents produce `unknown-parent`, `unknown-relation-source` or
  `unknown-relation-target` validation errors instead.
- `OntologySummary` is a read projection for the picker; it is never persisted.
- Ids are stable local UUIDs and are never shown to end users; labels and machine names
  are the user-facing identity. IRIs are minted from the current base IRI and the entity's
  machine name at export time — `:<Class>`, `:<attributeName>` and `:<relationName>` in
  Turtle, and `baseIri#name` in JSON-LD — so changing the base IRI does not rewrite stored
  ids.
- A new ontology's default base IRI is `https://example.org/ontology/<slug(name)>`. The
  slug falls back to `ontology` when the name contains no ASCII letters or digits, so a
  non-ASCII name still produces a valid absolute base IRI.

## 3. Runtime sequences

### Autosave

Inspector edits are applied to the in-memory document immediately, then persisted after
a short debounce. The save indicator reports the result of the most recent attempt, and
a failed attempt keeps the document dirty so it can be retried.

```mermaid
sequenceDiagram
    accTitle: Autosave Sequence
    accDescr: An inspector edit updates the store immutably, marks the document dirty, then after a debounce sends the complete ontology to the API, which saves it through the repository.

    participant UI
    participant Store
    participant API as API server
    participant Repo as Repository

    UI->>Store: edit a field (label, datatype, cardinality, ...)
    Store->>Store: apply immutable @onto/core mutation
    Store-->>UI: rerender, saveState "Unsaved changes"
    Note over Store: debounce roughly 600 ms
    Store->>API: PUT /api/ontologies/:id (complete ontology)
    API->>Repo: save(document)
    Note over Repo: write temp file, then rename
    Repo-->>API: stored document
    API-->>Store: 200 ontology (server refreshes updatedAt)
    Store-->>UI: saveState "Saved"
    alt request fails
        API-->>Store: error response
        Store-->>UI: saveState "Save failed", dirty flag kept, retry offered
    end
```

The store never discards the current document on a transient failure. It keeps the
dirty flag and exposes a manual save, so a network hiccup cannot lose work.

### Validation

Validation is requested explicitly from the top bar. Running it on the server keeps one
validator authoritative and lets the UI show the exact persisted document's issues.

```mermaid
sequenceDiagram
    accTitle: Validation Sequence
    accDescr: The Validate action asks the API to validate a stored ontology, the API loads it through the repository and runs the pure core validator, and the UI shows grouped issues with counts.

    participant UI
    participant Store
    participant API as API server
    participant Core as @onto/core
    participant Repo as Repository

    UI->>Store: validate action
    Store->>API: POST /api/ontologies/:id/validate
    API->>Repo: findById(id)
    alt ontology exists
        Repo-->>API: ontology document
        API->>Core: validateOntology(ontology)
        Core-->>API: ValidationReport
        API-->>Store: 200 report
        Store-->>UI: issues with error and warning counts, issues tab shown
    else ontology missing
        Repo-->>API: no document
        API-->>Store: 404 not_found
        Store-->>UI: error state
    end
```

Issue ordering is deterministic: ontology-level issues first, then classes in document
order (the class issue followed by its attribute issues), then relations in document
order. The sidebar renders issues in exactly that order, so an issue's index is a stable
test id and a stable selection target.

### Export

Exports are produced by the server from the stored document, so a downloaded file always
matches what the API holds.

```mermaid
sequenceDiagram
    accTitle: Export Sequence
    accDescr: The export menu asks the API for a representation of the stored ontology, the API serializes it with the pure core exporters, and the browser downloads the returned file.

    participant UI
    participant Store
    participant API as API server
    participant Core as @onto/core
    participant Repo as Repository

    UI->>Store: choose export format
    Store->>API: GET /api/ontologies/:id/export?format=...
    API->>Repo: findById(id)
    Repo-->>API: ontology document
    alt format turtle
        API->>Core: exportTurtle(ontology)
        Core-->>API: Turtle text
        API-->>Store: 200 text/turtle, filename slug.ttl
    else format jsonld
        API->>Core: exportJsonLd(ontology)
        Core-->>API: JSON-LD document
        API-->>Store: 200 application/ld+json, filename slug.jsonld
    else format json
        API->>Core: serializeOntology(ontology)
        Core-->>API: native JSON text
        API-->>Store: 200 application/json, filename slug.json
    else unsupported format
        API-->>Store: 400 invalid_request
    end
    Store-->>UI: trigger download
```

The export endpoint defines three formats: `turtle`, `jsonld` and `json`. The `json`
format returns exactly `serializeOntology(ontology)` — the canonical, round-trippable
native document — as an `application/json` attachment with a `<slug>.json` filename, so a
downloaded file can be imported again without loss. Any other format is a
`400 invalid_request`. See [DEVELOPMENT.md](DEVELOPMENT.md) for the contract-first
workflow.

## 4. The TDD loop used to build it

The project was built in small red-green-refactor cycles, one vertical slice at a time.
Each cycle starts with a failing test at a chosen seam, then the minimum implementation,
then a deliberate cleanup while the suite stays green.

```mermaid
stateDiagram-v2
    accTitle: Red Green Refactor Loop
    accDescr: Each tracer bullet begins with a failing test, is made to pass with the minimum implementation, is refactored with the suite green, then the next vertical slice starts.

    [*] --> Red
    Red: Write one failing test
    Green: Implement the minimum to pass
    Refactor: Refactor with tests green
    Red --> Green: fails for the right reason
    Green --> Refactor: all tests pass
    Refactor --> Red: next tracer bullet
    Refactor --> [*]: slice accepted
```

- A slice is done only when it has tests at every seam it touches: core unit test, API
  integration test, store or component test, and — for user-visible behaviour — a
  Playwright scenario.
- Tests target the published seams (pure functions, `buildApp` with an injected
  repository, the store factory with a fake API, `data-testid` attributes), so
  implementation details can change during refactoring without rewriting tests.
- The detailed workflow, test seam map and a worked tracer-bullet example are in
  [DEVELOPMENT.md](DEVELOPMENT.md).

## State and error handling

- The web app has one store per mounted application. State: ontology summaries, the
  open ontology, the current selection, the latest validation report, the sidebar tab,
  the save state, any error and the boot flag.
- Every API failure is normalised by the API client into a typed `ApiError` carrying the
  HTTP status, the error code and the message, so the store can decide between a
  recoverable save failure, a not-found reload and a fatal boot failure.
- The API returns a single error envelope for non-2xx responses:
  `{ "error": { "code", "message", "details"? } }`.
- Persistence writes are atomic per document (temp file then rename), so a crash cannot
  leave a half-written ontology behind.

## Related documents

- [DOMAIN-CONTRACT.md](DOMAIN-CONTRACT.md) — authoritative core behaviour.
- [API-CONTRACT.md](API-CONTRACT.md) — routes, errors, environment and data directory.
- [UI-CONTRACT.md](UI-CONTRACT.md) — layout, flows and component test seams.
- [GLOSSARY.md](GLOSSARY.md) — vocabulary used above.
- [DEVELOPMENT.md](DEVELOPMENT.md) — how to run, test and extend the project.
- [ADRs](adr/0001-pnpm-monorepo-with-shared-core.md) — why these boundaries exist.
