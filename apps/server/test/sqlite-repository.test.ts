import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RepositoryError,
  createJsonFileRepository,
  createSqliteRepository
} from "../src/repository.js";
import { makeOntology } from "./helpers.js";

describe("SQLiteOntologyRepository", () => {
  let dbDir: string;

  beforeEach(async () => {
    dbDir = await mkdtemp(join(tmpdir(), "onto-sqlite-test-"));
  });

  afterEach(async () => {
    await rm(dbDir, { recursive: true, force: true });
  });

  it("persists a created ontology so a fresh instance reads it back on disk", async () => {
    const repository = createSqliteRepository(dbDir);
    const ontology = makeOntology();

    await repository.create(ontology);

    const reloaded = createSqliteRepository(dbDir);
    await expect(reloaded.get("ont-university")).resolves.toEqual(ontology);
  });

  it("writes a single SQLite database file on disk", async () => {
    const repository = createSqliteRepository(dbDir);
    await repository.create(makeOntology());
    // trigger an explicit write / ensure the db file is materialised
    await repository.count();

    const { readdirSync } = await import("node:fs");
    const files = readdirSync(dbDir);
    expect(files.some((name) => name.endsWith(".db"))).toBe(true);
    // the old per-file JSON directory should not be created
    expect(files.some((name) => name === "ontologies")).toBe(false);
  });

  it("reflects writes made by another instance without caching", async () => {
    const first = createSqliteRepository(dbDir);
    const second = createSqliteRepository(dbDir);

    await second.create(makeOntology({ id: "ont-later", name: "Later" }));

    await expect(first.get("ont-later")).resolves.toMatchObject({ name: "Later" });
    await expect(first.count()).resolves.toBe(1);
  });

  it("lists and counts every stored ontology", async () => {
    const repository = createSqliteRepository(dbDir);
    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);

    await repository.create(makeOntology({ id: "ont-a", name: "Alpha" }));
    await repository.create(makeOntology({ id: "ont-b", name: "Beta" }));

    expect(await repository.list()).toHaveLength(2);
    await expect(repository.count()).resolves.toBe(2);
  });

  it("returns undefined for an unknown id", async () => {
    const repository = createSqliteRepository(dbDir);

    await expect(repository.get("missing")).resolves.toBeUndefined();
  });

  it("updates an existing document and refuses to create one via update", async () => {
    const repository = createSqliteRepository(dbDir);
    const ontology = makeOntology();
    await repository.create(ontology);

    const renamed = makeOntology({
      name: "Renamed",
      updatedAt: "2026-03-03T00:00:00.000Z"
    });
    await expect(repository.update("ont-university", renamed)).resolves.toEqual(renamed);
    await expect(createSqliteRepository(dbDir).get("ont-university")).resolves.toEqual(
      renamed
    );

    await expect(
      repository.update("ont-missing", makeOntology({ id: "ont-missing" }))
    ).resolves.toBeUndefined();
    await expect(repository.get("ont-missing")).resolves.toBeUndefined();
  });

  it("deletes a stored ontology and reports false when it is already gone", async () => {
    const repository = createSqliteRepository(dbDir);
    await repository.create(makeOntology());

    await expect(repository.delete("ont-university")).resolves.toBe(true);
    await expect(repository.get("ont-university")).resolves.toBeUndefined();
    await expect(repository.delete("ont-university")).resolves.toBe(false);
  });

  it("clears every stored ontology", async () => {
    const repository = createSqliteRepository(dbDir);
    await repository.create(makeOntology({ id: "ont-a" }));
    await repository.create(makeOntology({ id: "ont-b" }));

    await repository.clear();

    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
  });

  it("returns the documents in updatedAt-descending order on list", async () => {
    const repository = createSqliteRepository(dbDir);
    await repository.create(makeOntology({ id: "ont-1", updatedAt: "2026-01-01T00:00:00.000Z" }));
    await repository.create(makeOntology({ id: "ont-2", updatedAt: "2026-02-01T00:00:00.000Z" }));
    await repository.create(makeOntology({ id: "ont-3", updatedAt: "2026-03-01T00:00:00.000Z" }));

    const listed = await repository.list();
    expect(listed.map((o) => o.id)).toEqual(["ont-3", "ont-2", "ont-1"]);
  });

  it("surfaces a corrupt stored document as a repository error instead of crashing", async () => {
    const repository = createSqliteRepository(dbDir);
    // Insert a document whose JSON body is invalid via a raw statement.
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dbDir, "ontologies.db"));
    db.prepare(
      "INSERT INTO ontologies (id, name, updated_at, body) VALUES (?, ?, ?, ?)"
    ).run("ont-broken", "Broken", "2026-01-01T00:00:00.000Z", "{ this is not json");
    db.close();

    const failure = repository.get("ont-broken");
    await expect(failure).rejects.toBeInstanceOf(RepositoryError);
    await expect(repository.list()).rejects.toBeInstanceOf(RepositoryError);
  });

  it("surfaces a structurally invalid stored document as a repository error", async () => {
    const repository = createSqliteRepository(dbDir);
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dbDir, "ontologies.db"));
    db.prepare(
      "INSERT INTO ontologies (id, name, updated_at, body) VALUES (?, ?, ?, ?)"
    ).run("ont-shape", "Shape", "2026-01-01T00:00:00.000Z", JSON.stringify({ id: "ont-shape", name: 42 }));
    db.close();

    await expect(repository.get("ont-shape")).rejects.toBeInstanceOf(RepositoryError);
    await expect(repository.list()).rejects.toBeInstanceOf(RepositoryError);
  });

  it("handles an empty / missing database directory gracefully", async () => {
    const repository = createSqliteRepository(join(dbDir, "fresh"));
    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
  });
});