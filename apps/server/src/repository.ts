/**
 * Persistence seam for the API server.
 *
 * `OntologyRepository` is the storage abstraction the HTTP layer depends on.
 * Three adapters ship:
 * - `InMemoryOntologyRepository` — used by tests, no I/O.
 * - `JsonFileOntologyRepository` — one JSON document per ontology on disk,
 *   written atomically, rooted at `<dataDir>/ontologies/<id>.json`.
 * - `SqliteOntologyRepository` — an embedded SQLite database on disk
 *   (`<dataDir>/ontologies.db`) via Node's built-in `node:sqlite`, with an
 *   indexed `updated_at` so list ordering and any future query benefit from a
 *   real index without requiring a server database daemon.
 */
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";

import {
  OntologyParseError,
  parseOntology,
  serializeOntology,
  type Ontology
} from "@onto/core";

/**
 * `node:sqlite` is an ESM-only built-in. We load it through `createRequire` at
 * runtime rather than a static top-level import: esbuild strips the `node:`
 * prefix from external built-ins in ESM output, turning `node:sqlite` into a
 * bare `sqlite` specifier that Node does NOT resolve (unlike `path`/`fs`).
 * `createRequire` resolves the built-in regardless of how the bundle renames
 * the specifier, and Node 22+ supports requiring `node:sqlite` this way.
 */
type SqliteStatement = {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number };
};
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};
type DatabaseSyncConstructor = new (path: string) => SqliteDatabase;
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: DatabaseSyncConstructor;
};

/** Raised when a stored document cannot be read, written or decoded. */
export class RepositoryError extends Error {
  /** Absolute path of the offending file. */
  readonly file: string;

  constructor(message: string, file: string, cause?: unknown) {
    super(message, { cause });
    this.name = "RepositoryError";
    this.file = file;
  }
}

/** Ids double as file names, so reject anything that could escape the folder. */
const SAFE_ID = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id) || id === "..") {
    throw new RepositoryError(`Unsafe ontology id "${id}"`, id);
  }
}

/** Storage boundary used by the HTTP layer. */
export interface OntologyRepository {
  list(): Promise<Ontology[]>;
  get(id: string): Promise<Ontology | undefined>;
  create(ontology: Ontology): Promise<Ontology>;
  update(id: string, ontology: Ontology): Promise<Ontology | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
  count(): Promise<number>;
}

/** In-memory adapter: documents live for the lifetime of the process. */
export class InMemoryOntologyRepository implements OntologyRepository {
  private readonly documents = new Map<string, Ontology>();

  async list(): Promise<Ontology[]> {
    return [...this.documents.values()];
  }

  async get(id: string): Promise<Ontology | undefined> {
    return this.documents.get(id);
  }

  async create(ontology: Ontology): Promise<Ontology> {
    this.documents.set(ontology.id, ontology);
    return ontology;
  }

  async update(id: string, ontology: Ontology): Promise<Ontology | undefined> {
    if (!this.documents.has(id)) {
      return undefined;
    }
    this.documents.set(id, ontology);
    return ontology;
  }

  async delete(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }

  async count(): Promise<number> {
    return this.documents.size;
  }
}

/**
 * JSON-file adapter. One file per ontology: `<dataDir>/ontologies/<id>.json`.
 *
 * Reads go to disk on every call (nothing is cached or scanned eagerly), so
 * multiple instances pointed at the same directory always observe each other's
 * writes. Writes go through a temp file + rename so a crash cannot leave a
 * partially written document behind.
 */
export class JsonFileOntologyRepository implements OntologyRepository {
  private readonly directory: string;

  constructor(dataDir: string) {
    this.directory = join(dataDir, "ontologies");
  }

  async list(): Promise<Ontology[]> {
    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw new RepositoryError(
        `Failed to list ontologies in ${this.directory}`,
        this.directory,
        error
      );
    }

    const ontologies: Ontology[] = [];
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      const id = entry.slice(0, -".json".length);
      const ontology = await this.get(id);
      if (ontology !== undefined) {
        ontologies.push(ontology);
      }
    }
    return ontologies;
  }

  async get(id: string): Promise<Ontology | undefined> {
    if (!SAFE_ID.test(id) || id === "..") {
      return undefined;
    }
    const file = this.fileFor(id);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw new RepositoryError(`Failed to read ontology "${id}"`, file, error);
    }
    return this.decode(id, file, raw);
  }

  async create(ontology: Ontology): Promise<Ontology> {
    assertSafeId(ontology.id);
    const file = this.fileFor(ontology.id);
    if ((await this.get(ontology.id)) !== undefined) {
      throw new RepositoryError(`Ontology "${ontology.id}" already exists`, file);
    }
    await this.writeAtomic(file, ontology);
    return ontology;
  }

  async update(id: string, ontology: Ontology): Promise<Ontology | undefined> {
    assertSafeId(id);
    if ((await this.get(id)) === undefined) {
      return undefined;
    }
    await this.writeAtomic(this.fileFor(id), ontology);
    return ontology;
  }

  async delete(id: string): Promise<boolean> {
    assertSafeId(id);
    try {
      await unlink(this.fileFor(id));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      const file = this.fileFor(id);
      throw new RepositoryError(`Failed to delete ontology "${id}"`, file, error);
    }
  }

  async clear(): Promise<void> {
    try {
      await rm(this.directory, { recursive: true, force: true });
    } catch (error) {
      throw new RepositoryError(
        `Failed to clear ontologies in ${this.directory}`,
        this.directory,
        error
      );
    }
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  private fileFor(id: string): string {
    return join(this.directory, `${id}.json`);
  }

  /**
   * Decode a stored document through the domain parser. Hand-edited or
   * half-written files surface as a `RepositoryError` instead of leaking an
   * invalid `Ontology` into the HTTP layer or crashing the process.
   */
  private decode(id: string, file: string, raw: string): Ontology {
    try {
      return parseOntology(raw);
    } catch (error) {
      const reason =
        error instanceof OntologyParseError
          ? error.problems.join("; ")
          : error instanceof Error
            ? error.message
            : String(error);
      throw new RepositoryError(
        `Corrupt ontology file for "${id}": ${reason}`,
        file,
        error
      );
    }
  }

  private async writeAtomic(file: string, ontology: Ontology): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
      const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, serializeOntology(ontology), "utf8");
        await rename(temp, file);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      throw new RepositoryError(
        `Failed to write ontology "${ontology.id}"`,
        file,
        error
      );
    }
  }
}

/** Create the runtime repository rooted at `dataDir` (defaults handled by server.ts). */
export function createJsonFileRepository(dataDir: string): JsonFileOntologyRepository {
  return new JsonFileOntologyRepository(dataDir);
}

/**
 * SQLite adapter: embedded, on-disk, ACID. Uses Node's built-in `node:sqlite`
 * (`DatabaseSync`) so there is no native dependency to compile or a server
 * daemon to run. Documents are stored as serialized JSON in a `body` column
 * and re-decoded through the domain parser on read, so hand- or externally
 * modified rows that are corrupt surface as a `RepositoryError` rather than
 * leaking an invalid `Ontology` into the HTTP layer.
 *
 * A non-lookup index on `updated_at` lets list ordering and future queries
 * (name range, full-text search) use a real index instead of scanning files.
 */
export class SqliteOntologyRepository implements OntologyRepository {
  private readonly db: SqliteDatabase;

  constructor(dataDir: string) {
    const directory = dataDir;
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    this.db = new DatabaseSync(join(directory, "ontologies.db"));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ontologies (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        body       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ontologies_updated_at ON ontologies (updated_at DESC);
    `);
  }

  private decode(id: string, name: string, body: string): Ontology {
    try {
      return parseOntology(body);
    } catch (error) {
      const reason =
        error instanceof OntologyParseError
          ? error.problems.join("; ")
          : error instanceof Error
            ? error.message
            : String(error);
      throw new RepositoryError(
        `Corrupt ontology row for "${id}" (stored name "${name}"): ${reason}`,
        `ontologies.db//${id}`,
        error
      );
    }
  }

  private rowToOntology(row: { id: string; name: string; updated_at: string; body: string }): Ontology {
    return this.decode(row.id, row.name, row.body);
  }

  async list(): Promise<Ontology[]> {
    const rows = this.db
      .prepare(
        `SELECT id, name, updated_at, body FROM ontologies ORDER BY updated_at DESC`
      )
      .all() as Array<{ id: string; name: string; updated_at: string; body: string }>;
    return rows.map((row) => this.rowToOntology(row));
  }

  async get(id: string): Promise<Ontology | undefined> {
    const row = this.db
      .prepare(`SELECT id, name, updated_at, body FROM ontologies WHERE id = ?`)
      .get(id) as
      | { id: string; name: string; updated_at: string; body: string }
      | undefined;
    if (row === undefined) return undefined;
    return this.rowToOntology(row);
  }

  async create(ontology: Ontology): Promise<Ontology> {
    const existing = this.db.prepare(`SELECT 1 AS present FROM ontologies WHERE id = ?`).get(ontology.id);
    if (existing !== undefined) {
      throw new RepositoryError(
        `Ontology "${ontology.id}" already exists`,
        `ontologies.db//${ontology.id}`
      );
    }
    this.db
      .prepare(`INSERT INTO ontologies (id, name, updated_at, body) VALUES (?, ?, ?, ?)`)
      .run(ontology.id, ontology.name, ontology.updatedAt, serializeOntology(ontology));
    return ontology;
  }

  async update(id: string, ontology: Ontology): Promise<Ontology | undefined> {
    const existing = this.db.prepare(`SELECT 1 AS present FROM ontologies WHERE id = ?`).get(id);
    if (existing === undefined) return undefined;
    this.db
      .prepare(`UPDATE ontologies SET name = ?, updated_at = ?, body = ? WHERE id = ?`)
      .run(ontology.name, ontology.updatedAt, serializeOntology(ontology), id);
    return ontology;
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM ontologies WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  async clear(): Promise<void> {
    this.db.exec(`DELETE FROM ontologies`);
  }

  async count(): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ontologies`).get() as {
      count: number;
    };
    return row.count;
  }

  /** Close the underlying database connection. Call after the server shuts down. */
  close(): void {
    this.db.close();
  }
}

/** Create the SQLite-backed repository rooted at `dataDir`. */
export function createSqliteRepository(dataDir: string): SqliteOntologyRepository {
  return new SqliteOntologyRepository(dataDir);
}

/**
 * Choose the repository by string id used by the `ONTO_DB_TYPE` env var:
 * `"sqlite"` -> SQLite, `"json"`/else -> JSON files.
 */
export function createRepositoryByType(
  type: string,
  dataDir: string
): OntologyRepository & { close?: () => void } {
  return type === "sqlite"
    ? createSqliteRepository(dataDir)
    : createJsonFileRepository(dataDir);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
