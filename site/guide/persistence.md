# Persistence

Ontology Studio supports two on-disk persistence backends, both behind the same `OntologyRepository` interface. Switch between them with a single environment variable.

## JSON File Store (Default)

```bash
ONTO_DB_TYPE=json ONTO_DATA_DIR=./data pnpm dev:api
```

- One JSON document per ontology: `<dataDir>/ontologies/<id>.json`
- Atomic writes via temp-file + rename (crash-safe)
- Human-readable files you can inspect, edit and version-control
- No dependencies beyond Node's `fs` module
- Best for: development, debugging, small datasets, human auditability

## SQLite (Embedded)

```bash
ONTO_DB_TYPE=sqlite ONTO_DATA_DIR=./data pnpm dev:api
```

- Single file: `<dataDir>/ontologies.db`
- Uses Node's **built-in `node:sqlite`** (`DatabaseSync`) — zero external dependencies, no native bindings to compile, no server daemon
- ACID transactions, indexed by `updated_at` for ordered listing
- Documents stored as serialized JSON in a `body` column, re-decoded through `parseOntology` on read (corrupt rows surface as `RepositoryError`)
- Connection closed gracefully on SIGINT/SIGTERM
- Best for: production use, larger datasets, future query capabilities (name search, FTS5 full-text)

### Why SQLite?

| Consideration | Decision |
|---------------|----------|
| Server DB (Postgres/MySQL/Mongo) | ❌ Over-engineering for a local single-user tool; adds daemon, migrations, ops burden |
| better-sqlite3 / libsql | ❌ Native binding requires compilation; Node's built-in avoids this |
| LowDB / NeDB | ❌ No real index/transactions; no advantage over existing file store |
| **Node built-in sqlite** | ✅ Zero deps, embedded, ACID, indexed, ships with Node ≥ 22.5 |

See [ADR 0008](/adr/0008-sqlite-embedded-storage) for the full decision record.

## Repository Interface

Both adapters implement the same contract:

```ts
interface OntologyRepository {
  list(): Promise<Ontology[]>;           // ordered by updatedAt DESC
  get(id: string): Promise<Ontology | undefined>;
  create(ontology: Ontology): Promise<Ontology>;
  update(id: string, ontology: Ontology): Promise<Ontology | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
  count(): Promise<number>;
}
```

The HTTP layer depends only on this interface — switching backends is a one-line config change in `server.ts`.

## Data Safety

- **JSON backend:** atomic temp-file + rename prevents partial writes; corrupt files surface as errors, not crashes.
- **SQLite backend:** ACID transactions; connection closed on shutdown; corrupt rows detected on read.
- **Both:** every stored document is re-decoded through `@onto/core.parseOntology` before being returned to the HTTP layer.
- **Tests:** 17 JSON-file tests + 12 SQLite tests cover CRUD, persistence across instances, corrupt data handling, and edge cases.
