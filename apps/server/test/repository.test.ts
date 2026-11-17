import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  JsonFileOntologyRepository,
  createJsonFileRepository,
  InMemoryOntologyRepository,
  RepositoryError
} from "../src/repository.js";
import { makeOntology } from "./helpers.js";

describe("InMemoryOntologyRepository", () => {
  it("stores a created ontology so it can be read back by id", async () => {
    const repository = new InMemoryOntologyRepository();
    const ontology = makeOntology();

    await repository.create(ontology);

    await expect(repository.get("ont-university")).resolves.toEqual(ontology);
  });

  it("returns undefined for an unknown id", async () => {
    const repository = new InMemoryOntologyRepository();

    await expect(repository.get("missing")).resolves.toBeUndefined();
  });

  it("lists and counts every stored ontology", async () => {
    const repository = new InMemoryOntologyRepository();
    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);

    const first = makeOntology({ id: "ont-a", name: "Alpha" });
    const second = makeOntology({ id: "ont-b", name: "Beta" });
    await repository.create(first);
    await repository.create(second);

    expect(await repository.list()).toHaveLength(2);
    expect((await repository.list()).map((o) => o.id).sort()).toEqual([
      "ont-a",
      "ont-b"
    ]);
    await expect(repository.count()).resolves.toBe(2);
  });

  it("updates an existing ontology and reports undefined for a missing one", async () => {
    const repository = new InMemoryOntologyRepository();
    const ontology = makeOntology();
    await repository.create(ontology);

    const renamed = makeOntology({
      name: "Renamed",
      updatedAt: "2026-02-02T00:00:00.000Z"
    });
    await expect(repository.update("ont-university", renamed)).resolves.toEqual(renamed);
    await expect(repository.get("ont-university")).resolves.toEqual(renamed);

    await expect(repository.update("missing", makeOntology())).resolves.toBeUndefined();
    await expect(repository.get("missing")).resolves.toBeUndefined();
  });

  it("deletes an existing ontology and reports false for a missing one", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());

    await expect(repository.delete("ont-university")).resolves.toBe(true);
    await expect(repository.get("ont-university")).resolves.toBeUndefined();
    await expect(repository.delete("ont-university")).resolves.toBe(false);
  });

  it("clears all stored ontologies", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology({ id: "ont-a" }));
    await repository.create(makeOntology({ id: "ont-b" }));

    await repository.clear();

    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
  });
});

describe("JsonFileOntologyRepository", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "onto-server-test-"));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("persists a created ontology so a fresh instance reads it back", async () => {
    const repository = createJsonFileRepository(dataDir);
    const ontology = makeOntology();

    await repository.create(ontology);

    const reloaded = createJsonFileRepository(dataDir);
    await expect(reloaded.get("ont-university")).resolves.toEqual(ontology);
  });

  it("writes exactly one JSON document per ontology through a temp file + rename", async () => {
    const repository = createJsonFileRepository(dataDir);
    const ontology = makeOntology();

    await repository.create(ontology);

    const files = await readdir(join(dataDir, "ontologies"));
    expect(files).toEqual(["ont-university.json"]);

    const written = JSON.parse(
      await readFile(join(dataDir, "ontologies", "ont-university.json"), "utf8")
    );
    expect(written).toEqual(ontology);
  });

  it("reflects writes made by another instance without caching", async () => {
    const first = createJsonFileRepository(dataDir);
    const second = createJsonFileRepository(dataDir);

    await second.create(makeOntology({ id: "ont-later", name: "Later" }));

    await expect(first.get("ont-later")).resolves.toMatchObject({ name: "Later" });
    await expect(first.count()).resolves.toBe(1);
  });

  it("lists stored ontologies from a directory that does not exist yet", async () => {
    const repository = createJsonFileRepository(join(dataDir, "fresh"));

    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
  });

  it("updates an existing document and refuses to create one via update", async () => {
    const repository = createJsonFileRepository(dataDir);
    const ontology = makeOntology();
    await repository.create(ontology);

    const renamed = makeOntology({
      name: "Renamed",
      updatedAt: "2026-03-03T00:00:00.000Z"
    });
    await expect(repository.update("ont-university", renamed)).resolves.toEqual(renamed);
    await expect(createJsonFileRepository(dataDir).get("ont-university")).resolves.toEqual(
      renamed
    );

    await expect(
      repository.update("ont-missing", makeOntology({ id: "ont-missing" }))
    ).resolves.toBeUndefined();
    await expect(
      stat(join(dataDir, "ontologies", "ont-missing.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("deletes a document from disk and reports false when it is already gone", async () => {
    const repository = createJsonFileRepository(dataDir);
    await repository.create(makeOntology());

    await expect(repository.delete("ont-university")).resolves.toBe(true);
    await expect(repository.get("ont-university")).resolves.toBeUndefined();
    await expect(repository.delete("ont-university")).resolves.toBe(false);
    expect(await readdir(join(dataDir, "ontologies"))).toEqual([]);
  });

  it("clears every stored document", async () => {
    const repository = createJsonFileRepository(dataDir);
    await repository.create(makeOntology({ id: "ont-a" }));
    await repository.create(makeOntology({ id: "ont-b" }));

    await repository.clear();

    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
  });

  it("surfaces a corrupt JSON file as a repository error instead of crashing", async () => {
    const directory = join(dataDir, "ontologies");
    await mkdir(directory, { recursive: true });
    const file = join(directory, "ont-broken.json");
    await writeFile(file, "{ this is not json", "utf8");

    const repository = createJsonFileRepository(dataDir);

    const failure = repository.get("ont-broken");
    await expect(failure).rejects.toBeInstanceOf(RepositoryError);
    await expect(failure).rejects.toMatchObject({ file });
    await expect(repository.list()).rejects.toBeInstanceOf(RepositoryError);
  });

  it("surfaces a structurally invalid stored document as a repository error", async () => {
    const directory = join(dataDir, "ontologies");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "ont-shape.json"),
      JSON.stringify({ id: "ont-shape", name: 42 }),
      "utf8"
    );

    const repository = createJsonFileRepository(dataDir);

    await expect(repository.get("ont-shape")).rejects.toBeInstanceOf(RepositoryError);
    await expect(repository.list()).rejects.toBeInstanceOf(RepositoryError);
  });

  it("rejects ids that could escape the data directory", async () => {
    const repository = createJsonFileRepository(dataDir);

    await expect(repository.get("../escape")).resolves.toBeUndefined();
    await expect(
      repository.create(makeOntology({ id: "../escape" }))
    ).rejects.toBeInstanceOf(RepositoryError);
    await expect(
      writeFile(join(dataDir, "escape.json"), "{}", "utf8")
    ).resolves.toBeUndefined();
    await expect(repository.get("..")).resolves.toBeUndefined();
  });

  it("exports a factory that points at the given data directory", async () => {
    const repository = createJsonFileRepository(dataDir);

    expect(repository).toBeInstanceOf(JsonFileOntologyRepository);
    await repository.create(makeOntology());
    await expect(repository.get("ont-university")).resolves.toMatchObject({
      id: "ont-university"
    });
  });
});
