import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp, type BuildAppOptions } from "../src/app.js";
import { InMemoryOntologyRepository } from "../src/repository.js";
import { makeOntology } from "./helpers.js";

const apps: FastifyInstance[] = [];

async function createApp(
  options: Partial<BuildAppOptions> = {}
): Promise<FastifyInstance> {
  const app = await buildApp({
    repository: new InMemoryOntologyRepository(),
    ...options
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /api/health", () => {
  it("reports ok, the server version and the ontology count", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology({ id: "ont-a" }));
    await repository.create(makeOntology({ id: "ont-b" }));
    const app = await createApp({ repository });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.json()).toEqual({
      status: "ok",
      version: "0.1.0",
      ontologyCount: 2
    });
  });
});

describe("POST /api/ontologies", () => {
  it("creates, trims and persists an ontology from the request body", async () => {
    const repository = new InMemoryOntologyRepository();
    const app = await createApp({ repository });

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies",
      payload: { name: "  Research Project  ", description: "Funding graph" }
    });

    expect(response.statusCode).toBe(201);
    const ontology = response.json();
    expect(ontology).toMatchObject({
      name: "Research Project",
      description: "Funding graph",
      version: "0.1.0",
      classes: [],
      relations: []
    });
    expect(ontology.id).toEqual(expect.any(String));
    expect(ontology.id.length).toBeGreaterThan(0);
    expect(ontology.baseIri).toContain("research-project");
    expect(ontology.createdAt).toBe(ontology.updatedAt);
    expect(Number.isNaN(Date.parse(ontology.createdAt))).toBe(false);

    await expect(repository.get(ontology.id)).resolves.toEqual(ontology);
  });

  it.each([
    ["missing name", {}],
    ["blank name", { name: "   " }],
    ["empty name", { name: "" }],
    ["name too long", { name: "x".repeat(121) }],
    ["non-string name", { name: 42 }],
    ["wrong description type", { name: "Valid", description: 7 }]
  ])("rejects %s with invalid_request", async (_label, payload) => {
    const repository = new InMemoryOntologyRepository();
    const app = await createApp({ repository });

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies",
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({ code: "invalid_request" });
    expect(typeof response.json().error.message).toBe("string");
    await expect(repository.count()).resolves.toBe(0);
  });

  it("accepts a 120 character name at the limit", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies",
      payload: { name: "y".repeat(120) }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().name).toHaveLength(120);
  });
});

describe("GET /api/ontologies", () => {
  it("returns an empty list when nothing is stored", async () => {
    const app = await createApp();

    const response = await app.inject({ method: "GET", url: "/api/ontologies" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ontologies: [] });
  });

  it("returns summaries sorted by updatedAt descending", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(
      makeOntology({ id: "ont-old", name: "Old", updatedAt: "2026-01-01T00:00:00.000Z" })
    );
    await repository.create(
      makeOntology({ id: "ont-new", name: "New", updatedAt: "2026-03-01T00:00:00.000Z" })
    );
    await repository.create(
      makeOntology({ id: "ont-mid", name: "Mid", updatedAt: "2026-02-01T00:00:00.000Z" })
    );
    const app = await createApp({ repository });

    const response = await app.inject({ method: "GET", url: "/api/ontologies" });

    expect(response.statusCode).toBe(200);
    expect(response.json().ontologies.map((summary: { id: string }) => summary.id)).toEqual([
      "ont-new",
      "ont-mid",
      "ont-old"
    ]);
    expect(response.json().ontologies[0]).toEqual({
      id: "ont-new",
      name: "New",
      description: "A small university ontology.",
      version: "0.1.0",
      classCount: 2,
      relationCount: 1,
      updatedAt: "2026-03-01T00:00:00.000Z"
    });
  });
});

describe("GET /api/ontologies/:id", () => {
  it("returns the stored ontology document", async () => {
    const repository = new InMemoryOntologyRepository();
    const ontology = makeOntology();
    await repository.create(ontology);
    const app = await createApp({ repository });

    const response = await app.inject({
      method: "GET",
      url: "/api/ontologies/ont-university"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(ontology);
  });

  it("returns a not_found error for an unknown id", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/ontologies/missing"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "not_found", message: expect.stringContaining("missing") }
    });
  });
});

describe("DELETE /api/ontologies/:id", () => {
  it("removes the ontology and replies 204 with an empty body", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp({ repository });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/ontologies/ont-university"
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    await expect(repository.get("ont-university")).resolves.toBeUndefined();
  });

  it("replies not_found when the ontology does not exist", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/ontologies/missing"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });
});

describe("POST /api/ontologies/:id/validate", () => {
  it("returns a clean validation report for a valid ontology", async () => {
    const repository = new InMemoryOntologyRepository();
    await repository.create(makeOntology());
    const app = await createApp({ repository });

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies/ont-university/validate"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, issues: [], errors: 0, warnings: 0 });
  });

  it("reports validation issues without failing the request", async () => {
    const repository = new InMemoryOntologyRepository();
    const broken = makeOntology();
    const duplicate = broken.classes[0]!;
    await repository.create({
      ...broken,
      classes: [duplicate, { ...duplicate, id: "class-person-2" }]
    });
    const app = await createApp({ repository });

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies/ont-university/validate"
    });

    expect(response.statusCode).toBe(200);
    const report = response.json();
    expect(report.ok).toBe(false);
    expect(report.errors).toBeGreaterThanOrEqual(1);
    expect(report.issues.map((issue: { code: string }) => issue.code)).toContain(
      "duplicate-class-name"
    );
  });

  it("returns not_found for an unknown ontology", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/ontologies/missing/validate"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });
});

describe("CORS", () => {
  it("answers preflight requests from the Vite dev origins", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/ontologies",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(String(response.headers["access-control-allow-methods"])).toContain("POST");
  });

  it("also allows the 127.0.0.1 dev origin", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "http://127.0.0.1:5173" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
  });

  it("does not grant CORS to an unlisted origin", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "http://evil.example" }
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("honours a custom corsOrigins option", async () => {
    const app = await createApp({ corsOrigins: ["http://custom.example"] });

    const allowed = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "http://custom.example" }
    });
    const devOrigin = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "http://localhost:5173" }
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://custom.example");
    expect(devOrigin.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("error handling", () => {
  it("uses the uniform error shape for unknown routes", async () => {
    const app = await createApp();

    const response = await app.inject({ method: "GET", url: "/api/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "not_found",
        message: expect.stringContaining("/api/nope")
      }
    });
  });
});
