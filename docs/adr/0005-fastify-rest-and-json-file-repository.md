# 0005 — Fastify REST API and JSON file repository

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The studio needs an API that can create, read, update, delete, validate, import and export ontology
documents, and persist them so data survives a page reload and a server restart. The product is a
local, single-user tool: there is no authentication, no multi-tenant requirement and no concurrent
editing. Data volumes are small — one JSON document per ontology, edited by one process.

The API also has to be pleasant to test. Integration tests should be able to exercise routes,
status codes, headers and the error envelope without binding a port or leaving files behind, while
at least one test must prove the real JSON-file adapter survives a restart.

The built web app must be servable from the same origin in production, without a second web server,
and development needs the browser to reach the API without CORS friction.

## Decision

Use **Fastify 5** with a REST API under `/api`, and a repository interface with two adapters.

- **Routes and schemas.** Routes are defined behind a single `buildApp({ repository })` factory;
  request bodies and queries are validated with zod. Non-2xx responses use the envelope
  `{ "error": { "code", "message", "details"? } }` with the status/code mapping in the
  [API contract](../API-CONTRACT.md).
- **Repository seam.** `OntologyRepository` is an interface. `InMemoryOntologyRepository` is used
  by tests; `JsonFileOntologyRepository` is used at runtime and stores one file per ontology at
  `<ONTO_DATA_DIR>/ontologies/<id>.json`, written atomically (write a temp file, then rename).
- **Document flow.** Full-document `PUT` updates are parsed with `parseOntology`; the URL id wins
  over the body id and the server refreshes `updatedAt` while preserving `createdAt`. Imports parse
  the native document and assign a fresh id with an `" (imported)"` name suffix instead of
  overwriting.
- **Entrypoint.** `src/server.ts` is a thin entrypoint that builds the real repository, optionally
  serves the built web app from `ONTO_WEB_DIST` with SPA fallback, and calls `listen` on `PORT`
  (default 5174) and `HOST` (default 127.0.0.1). CORS allows the two Vite dev origins; development
  additionally proxies `/api` from Vite to 5174 so the browser sees one origin.

## Consequences

**Positive**

- No database to install, migrate or operate; the data directory is human-readable and easy to
  inspect, back up or commit into a demo environment.
- Integration tests run in-process with `app.inject` and an in-memory repository — fast and
  hermetic — while a separate test proves the file adapter's round-trip and restart survival.
- Atomic temp-file-plus-rename writes make a crash mid-write very unlikely to leave a corrupt
  ontology.
- Fastify provides schema-aware serialization, sensible logging and a small surface; zod keeps the
  request validation explicit and shared with the error envelope.
- Same-origin production serving from `ONTO_WEB_DIST` removes CORS and a deployment component.

**Negative**

- The JSON-file repository assumes a single process and no concurrent writers; two servers pointing
  at the same data directory can overwrite each other's documents. That is acceptable for the
  documented single-user scope and would have to change before any shared deployment.
- Every API request works on a whole document: no partial updates, no transactions across
  documents, no indexes or queries beyond listing summaries. Listing requires reading the stored
  summaries, and file count growth would eventually need a database.
- Requests carry the full ontology, so payload size grows with the model; fine at this scale, not
  designed for very large ontologies.
- The repository interface adds a layer of indirection compared with writing files directly from
  route handlers; it is justified by the in-memory test adapter.

## Alternatives considered

- **SQLite via a driver.** Real transactions and querying with a single-file footprint, but it adds
  native bindings and a schema/migration concern for a project whose data is one document per
  ontology.
- **Postgres or another server database.** Stronger concurrency and querying, but heavy operational
  cost for a local single-user tool and outside the product's stated scope.
- **Express.** Familiar and minimal, but Fastify's schema-based serialization, encapsulated
  plugins, `inject` test helper and built-in static/CORS plugins fit the requirements with fewer
  moving parts.
- **Client-side persistence only (localStorage/IndexedDB).** No server at all, but loses the shared
  HTTP contract, cross-browser/project persistence and the server-side validation and export
  behaviour the product specifies.
- **tRPC or GraphQL instead of REST.** Better type flow to the client, but the API contract is
  small, file- and header-oriented (exports/downloads), and deliberately language-neutral.

## References

- [API contract](../API-CONTRACT.md)
- [Architecture](../ARCHITECTURE.md)
- [Development guide — environment variables and commands](../DEVELOPMENT.md)
- [ADR 0001 — pnpm monorepo with a shared core package](0001-pnpm-monorepo-with-shared-core.md)
- [ADR 0002 — pure immutable domain core](0002-pure-immutable-domain-core.md)
