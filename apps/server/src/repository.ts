/**
 * Persistence seam for the API server.
 *
 * `OntologyRepository` is the storage abstraction the HTTP layer depends on.
 * Two adapters ship:
 * - `InMemoryOntologyRepository` — used by tests, no I/O.
 * - `JsonFileOntologyRepository` — one JSON document per ontology on disk,
 *   written atomically, rooted at `<dataDir>/ontologies/<id>.json`.
 */
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  OntologyParseError,
  parseOntology,
  serializeOntology,
  type Ontology
} from "@onto/core";

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

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
