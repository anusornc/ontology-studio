# 0008 — SQLite as the optional embedded storage backend

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

Early persistence stored each ontology as one JSON document in a folder,
written atomically through a temp-file + rename. That design is correct for a
single-user, local tool with whole-document CRUD, but presents two limits we
wanted to address:

1. **Query/scan cost** — listing sorts by `updated_at` and any future query
   (by name, updated-time range, full-text search over class labels) would
   require reading and decoding every file rather than consulting an index.
2. **No embedded transactional store** — the file adapter is ACID-ish (atomic
   rename) but has no index, no transactions beyond a single-file replace, and
   no way to evolve queries as the model grows.

We did not want to "upgrade" to a heavyweight server database: the project
explicitly scopes itself as a local, single-user tool with no graph database,
and spinning up Postgres/MySQL/Mongo plus migrations and a daemon is
over-engineering for whole-document CRUD over a handful of ontologies.

## Decision

Keep the JSON-file adapter as the **default**, and add **SQLite as an optional
embedded storage backend**, both behind the existing `OntologyRepository` seam.
The backend is chosen at startup by `ONTO_DB_TYPE`:

- `ONTO_DB_TYPE=json` (default) — one JSON document per ontology in
  `<ONTO_DATA_DIR>/ontologies/<id>.json`, atomic temp-file + rename.
- `ONTO_DB_TYPE=sqlite` — a single `<ONTO_DATA_DIR>/ontologies.db` file via
  Node's **built-in `node:sqlite`** (`DatabaseSync`), with an index on
  `updated_at` for ordered listing and future queries.

Key properties of the SQLite adapter:

- **Zero new dependencies.** `node:sqlite` ships with Node ≥ 22.5 and is
  available in the project's Node 26 runtime without a flag and with no native
  binding to compile.
- **Same repository contract.** `get/create/update/delete/list/count/clear`
  behave identically to the file adapter; the HTTP layer and tests are
  unaffected.
- **Documents stored as serialized JSON** in a `body` column and re-decoded
  through `@onto/core`.`parseOntology` on read, so a corrupt or externally
  modified row surfaces as a `RepositoryError` rather than leaking an invalid
  `Ontology` (mirroring the file adapter's guarantees).
- **ACID + durability.** SQLite transactions and `ONTOLOGY` index make writes
  transactional; the connection is closed on graceful shutdown. A process
  restart observes every previously persisted document.
- Selection is a one-line env change: `createRepositoryByType(dbType, dataDir)`.

## Consequences

**Positive**

- Adds a real on-disk transactional store and an indexed `updated_at` for
  cheap ordered listing, with the door open to FTS5 full-text search later —
  while keeping zero-ops, embedded, single-file persistence.
- No daemon, no migrations framework, no ORM, and no new package to install or
  compile; it stays in line with the project's local/single-user scope.
- The `OntologyRepository` seam keeps file and SQLite interchangeable and both
  fully testable, and the HTTP layer never needs to know which is active.
- Existing JSON-file users and every current test keep working unchanged.

**Negative**

- SQLite documents are not individually human-readable `.json` files the way
  the folder store is; debugging a single stored ontology means querying the
  DB file rather than opening a file.
- Two implementations to maintain behind one seam (duplicate CRUD + decode
  logic), though they share the parsing guarantees from `@onto/core`.
- `node:sqlite` is recent; on older Node (< 22.5) it is unavailable, so the
  adapter requires the documented Node ≥ 22 (the project already requires
  `engines.node >= 22`).

## Alternatives considered

- **Introduce Postgres/MySQL/Mongo and an ORM.** Rejected: adds a server
  daemon, connection handling, migrations and operational burden far beyond a
  local single-user tool's needs, and contradicts the stated scope of "no graph
  database".
- **Adopt `better-sqlite3` or `libsql`.** Rejected: both require a native
  binding (compilation/permissions) or an extra dependency. Node's built-in
  `node:sqlite` avoids both.
- **LowDB / NeDB / JSON object stores.** Rejected: no real index/transactions
  and adds dependencies without material benefit over the existing file store.
- **FTS from day one.** Deferred: done later on top of the SQLite backend; the
  current scope is the storage choice and ordered listing, not full-text search.

## References

- [API contract — Persistence and environment](../API-CONTRACT.md)
- [ADR 0003 — contract-first package seams](0003-contract-first-package-seams.md)
- [ADR 0006 — TDD vertical slices](0006-tdd-vertical-slices.md)