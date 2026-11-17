# HTTP API Contract

Base URL: `http://127.0.0.1:5174`. All routes are under `/api`. Requests and
responses are JSON (`application/json; charset=utf-8`) unless noted. The server
must be usable by the web client through the Vite dev proxy at `/api`.

## Data directory

Persistence is pluggable behind the `OntologyRepository` seam and chosen at
startup by `ONTO_DB_TYPE`: **`json`** (default, one JSON document per ontology in
`<ONTO_DATA_DIR>/ontologies/<id>.json`, written atomically) or **`sqlite`**
(embedded, on-disk, ACID — a single `<ONTO_DATA_DIR>/ontologies.db` file via
Node's built-in `node:sqlite`, with an indexed `updated_at` for ordered listing
and future queries). Both adapters re-decode every stored document through
`parseOntology` from `@onto/core` on read, so a corrupt row/file surfaces as a
`RepositoryError` instead of leaking an invalid `Ontology`. Choose the backend by
setting `ONTO_DB_TYPE`; a process restart must observe all previously persisted
documents for either backend.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `5174` | HTTP port |
| `HOST` | `127.0.0.1` | bind address |
| `ONTO_DATA_DIR` | `./data` | persistence directory (JSON files: `ontologies/`; SQLite: `ontologies.db`) |
| `ONTO_DB_TYPE` | `json` | persistence backend: `json` (per-file documents) or `sqlite` (embedded on-disk DB) |
| `ONTO_WEB_DIST` | unset | when set and the directory exists, serve the built web app as static files with SPA fallback |

## Error shape

Non-2xx responses are `{ "error": { "code": string, "message": string, "details"?: unknown } }`.

| Status | code |
| --- | --- |
| 400 | `invalid_request` (body/query schema failure) |
| 400 | `invalid_document` (ontology shape is unparseable; `details.problems` is `string[]`) |
| 404 | `not_found` |
| 500 | `internal` |

## Endpoints

### `GET /api/health`
`200` -> `{ "status": "ok", "version": "0.1.0", "ontologyCount": number }`

### `GET /api/ontologies`
`200` -> `{ "ontologies": OntologySummary[] }` sorted by `updatedAt` descending.

### `POST /api/ontologies`
Body: `{ "name": string (1..120, trimmed non-empty), "description"?: string, "baseIri"?: string, "version"?: string }`.
Creates via `@onto/core` `createOntology`.
`201` -> `Ontology`.

### `GET /api/ontologies/:id`
`200` -> `Ontology`, or `404`.

### `PUT /api/ontologies/:id`
Body: a complete `Ontology`. Parsed with `parseOntology`; `invalid_document` on
failure. The URL id wins over the body id, and `updatedAt` is refreshed by the
server (`createdAt` preserved). `200` -> stored `Ontology`, or `404` if the
ontology does not exist. Creates are not allowed via PUT.

### `DELETE /api/ontologies/:id`
`204` with empty body, or `404`.

### `POST /api/ontologies/:id/validate`
`200` -> `ValidationReport` from `validateOntology`. `404` if missing.

### `GET /api/ontologies/:id/export?format=turtle|jsonld|json`
- `turtle`: `200`, `Content-Type: text/turtle; charset=utf-8`,
  `Content-Disposition: attachment; filename="<slug>.ttl"`.
- `jsonld`: `200`, `Content-Type: application/ld+json; charset=utf-8`,
  `Content-Disposition: attachment; filename="<slug>.jsonld"`.
- `json`: `200`, `Content-Type: application/json; charset=utf-8`,
  `Content-Disposition: attachment; filename="<slug>.json"`, body is exactly
  `serializeOntology(ontology)` (the round-trippable native document).
- Any other format -> `400 invalid_request`. Missing ontology -> `404`.

### `POST /api/ontologies/import`
Body: `{ "content": string }` where content is the native JSON document
(`serializeOntology` output). Parses with `parseOntology`. If the parsed id
already exists, the server assigns a fresh id and appends `" (imported)"` to the
name; it never overwrites. `201` -> `Ontology`.

## CORS

Development serves the web app from `http://localhost:5173` and
`http://127.0.0.1:5173`; those origins must be allowed. Other origins are not
needed for production because the built web app is served same-origin.

## Testability

`buildApp({ repository })` must be exported so tests construct the Fastify
instance with an in-memory repository and use `app.inject(...)` — no listening
port is required in unit/integration tests. `server.ts` is a thin entrypoint that
builds the real repository and calls `listen`.
