import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { parseOntology, serializeOntology } from "@onto/core";

import { buildApp, type BuildAppOptions } from "../src/app.js";
import { InMemoryOntologyRepository } from "../src/repository.js";
import { makeOntology } from "./helpers.js";

const apps: FastifyInstance[] = [];

async function createApp(
  repository = new InMemoryOntologyRepository(),
  options: Partial<BuildAppOptions> = {}
): Promise<FastifyInstance> {
  const app = await buildApp({ repository, ...options });
  apps.push(app);
  return app;
}

/** Close every app created by a test once it finishes. */
async function closeApps(): Promise<void> {
  await Promise.all(apps.splice(0).map((app) => app.close()));
}

afterEach(closeApps);

describe("PUT /api/ontologies/:id", () => {
  it("stores the edited document, refreshing updatedAt and preserving createdAt", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const edited = makeOntology({
      name: "University (edited)",
      description: "Edited description",
      updatedAt: "2001-01-01T00:00:00.000Z"
    });
    const response = await app.inject({
      method: "PUT",
      url: "/api/ontologies/ont-university",
      payload: edited
    });

    expect(response.statusCode).toBe(200);
    const stored = response.json();
    expect(stored).toMatchObject({
      id: "ont-university",
      name: "University (edited)",
      description: "Edited description",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(stored.updatedAt).not.toBe("2001-01-01T00:00:00.000Z");
    expect(Date.parse(stored.updatedAt)).toBeGreaterThan(Date.parse("2026-01-02T00:00:00.000Z"));
    await expect(repository.get("ont-university")).resolves.toEqual(stored);
  });

  it("lets the URL id win over the body id", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const response = await app.inject({
      method: "PUT",
      url: "/api/ontologies/ont-university",
      payload: makeOntology({ id: "ont-body-id" })
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe("ont-university");
    await expect(repository.get("ont-body-id")).resolves.toBeUndefined();
    await expect(repository.get("ont-university")).resolves.toMatchObject({
      id: "ont-university"
    });
  });

  it("rejects an unparseable document with invalid_document and problems", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const response = await app.inject({
      method: "PUT",
      url: "/api/ontologies/ont-university",
      payload: { id: "ont-university", name: 42 }
    });

    expect(response.statusCode).toBe(400);
    const error = response.json().error;
    expect(error.code).toBe("invalid_document");
    expect(Array.isArray(error.details.problems)).toBe(true);
    expect(error.details.problems.length).toBeGreaterThan(0);
    expect(error.details.problems.every((p: unknown) => typeof p === "string")).toBe(true);
    await expect(repository.get("ont-university")).resolves.toEqual(makeOntology());
  });

  it("returns not_found and never creates via PUT", async () => {
    const repository = new InMemoryOntologyRepository();
    const app = await createApp(repository);

    const response = await app.inject({
      method: "PUT",
      url: "/api/ontologies/missing",
      payload: makeOntology({ id: "missing" })
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
    await expect(repository.get("missing")).resolves.toBeUndefined();
    await expect(repository.count()).resolves.toBe(0);
  });

  it("rejects malformed JSON bodies with invalid_request", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const response = await app.inject({
      method: "PUT",
      url: "/api/ontologies/ont-university",
      headers: { "content-type": "application/json" },
      payload: "{ definitely not json"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_request");
  });
});

describe("GET /api/ontologies/:id/export", () => {
  it("exports deterministic Turtle with download headers", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const first = await app.inject({
      method: "GET",
      url: "/api/ontologies/ont-university/export?format=turtle"
    });
    const second = await app.inject({
      method: "GET",
      url: "/api/ontologies/ont-university/export?format=turtle"
    });

    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("text/turtle; charset=utf-8");
    expect(first.headers["content-disposition"]).toBe(
      'attachment; filename="university.ttl"'
    );
    expect(first.body).toContain("@prefix");
    expect(first.body).toContain("owl:Class");
    expect(first.body).toContain("Person");
    expect(first.body).toContain("owl:ObjectProperty");
    expect(first.body).toContain("enrolledIn");
    expect(first.body).toBe(second.body);
  });

  it("exports JSON-LD with download headers", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const response = await app.inject({
      method: "GET",
      url: "/api/ontologies/ont-university/export?format=jsonld"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/ld+json; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="university.jsonld"'
    );
    const document = response.json();
    expect(document["@context"]).toMatchObject({ "@vocab": expect.any(String) });
    expect(Array.isArray(document["@graph"])).toBe(true);
    const types = document["@graph"].flatMap((node: { "@type": string | string[] }) =>
      Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]
    );
    expect(types).toContain("owl:Class");
    expect(types).toContain("owl:ObjectProperty");
  });

  it("exports the round-trippable native document as json", async () => {
    const repository = new InMemoryOntologyRepository();
    const ontology = makeOntology();
    await repository.create(ontology);
    const app = await createApp(repository);

    const response = await app.inject({
      method: "GET",
      url: "/api/ontologies/ont-university/export?format=json"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="university.json"'
    );
    expect(response.body).toBe(serializeOntology(ontology));
    expect(parseOntology(response.body)).toEqual(ontology);
  });

  it("rejects an unsupported format with invalid_request", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const response = await app.inject({
      method: "GET",
      url: "/api/ontologies/ont-university/export?format=ntriples"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_request");
  });

  it("rejects a missing format with invalid_request", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const response = await app.inject({
      method: "GET",
      url: "/api/ontologies/ont-university/export"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_request");
  });

  it("returns not_found for an unknown ontology", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/ontologies/missing/export?format=turtle"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("falls back to a safe download filename when the name has no ASCII slug", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology({ name: "日本語" }));
    const app = await createApp(repository);

    const response = await app.inject({
      method: "GET",
      url: "/api/ontologies/ont-university/export?format=turtle"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="ontology.ttl"'
    );
  });
});

describe("POST /api/ontologies/import", () => {
  it("round-trips a serialized native document", async () => {
    const repository = new InMemoryOntologyRepository();
    const app = await createApp(repository);
    const source = makeOntology();

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies/import",
      payload: { content: serializeOntology(source) }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(parseOntology(serializeOntology(source)));
    await expect(repository.get("ont-university")).resolves.toEqual(response.json());
  });

  it("assigns a fresh id and renames the import when the id already exists", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies/import",
      payload: { content: serializeOntology(makeOntology()) }
    });

    expect(response.statusCode).toBe(201);
    const imported = response.json();
    expect(imported.id).not.toBe("ont-university");
    expect(imported.name).toBe("University (imported)");
    expect(imported.classes).toHaveLength(2);
    expect(imported.relations).toHaveLength(1);
    await expect(repository.count()).resolves.toBe(2);
    await expect(repository.get("ont-university")).resolves.toEqual(makeOntology());
    await expect(repository.get(imported.id)).resolves.toEqual(imported);
  });

  it("rejects malformed content with invalid_document and problems", async () => {
    const repository = new InMemoryOntologyRepository();
    const app = await createApp(repository);

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies/import",
      payload: { content: "{ definitely not json" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_document");
    expect(response.json().error.details.problems.length).toBeGreaterThan(0);
    await expect(repository.count()).resolves.toBe(0);
  });

  it("rejects structurally invalid content with invalid_document", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies/import",
      payload: { content: JSON.stringify({ id: "ont-x", name: "Broken" }) }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_document");
  });

  it("rejects a missing or non-string content field with invalid_request", async () => {
    const app = await createApp();

    const missing = await app.inject({
      method: "POST",
      url: "/api/ontologies/import",
      payload: {}
    });
    const wrongType = await app.inject({
      method: "POST",
      url: "/api/ontologies/import",
      payload: { content: 42 }
    });

    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe("invalid_request");
    expect(wrongType.statusCode).toBe(400);
    expect(wrongType.json().error.code).toBe("invalid_request");
  });
});

describe("repository failures", () => {
  it("maps unexpected repository errors to a 500 internal error", async () => {
    class ExplodingRepository extends InMemoryOntologyRepository {
      override async count(): Promise<number> {
        throw new Error("disk on fire");
      }
    }
    const app = await createApp(new ExplodingRepository());

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: "internal", message: "Internal server error." }
    });
  });
});
