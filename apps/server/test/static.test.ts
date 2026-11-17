import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { InMemoryOntologyRepository } from "../src/repository.js";

let webDistDir: string;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  webDistDir = await mkdtemp(join(tmpdir(), "onto-web-dist-"));
  await mkdir(join(webDistDir, "assets"), { recursive: true });
  await writeFile(
    join(webDistDir, "index.html"),
    '<!doctype html><html><body><div id="root">SPA-INDEX-MARKER</div></body></html>',
    "utf8"
  );
  await writeFile(
    join(webDistDir, "assets", "app.js"),
    "console.log('SPA-ASSET-MARKER');",
    "utf8"
  );
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await rm(webDistDir, { recursive: true, force: true });
});

async function createApp(webDist: string | null): Promise<FastifyInstance> {
  const app = await buildApp({
    repository: new InMemoryOntologyRepository(),
    webDistDir: webDist
  });
  apps.push(app);
  return app;
}

describe("static web app serving", () => {
  it("serves the built index.html at the root", async () => {
    const app = await createApp(webDistDir);

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html/);
    expect(response.body).toContain("SPA-INDEX-MARKER");
  });

  it("serves built asset files with a javascript content type", async () => {
    const app = await createApp(webDistDir);

    const response = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/javascript/);
    expect(response.body).toContain("SPA-ASSET-MARKER");
  });

  it("falls back to index.html for client-side routes", async () => {
    const app = await createApp(webDistDir);

    const response = await app.inject({
      method: "GET",
      url: "/ontologies/ont-university"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html/);
    expect(response.body).toContain("SPA-INDEX-MARKER");
  });

  it("does not answer non-GET client routes with the SPA shell", async () => {
    const app = await createApp(webDistDir);

    const response = await app.inject({
      method: "POST",
      url: "/some/client/action"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("keeps API routes working and returns JSON 404 for unknown API paths", async () => {
    const app = await createApp(webDistDir);

    const health = await app.inject({ method: "GET", url: "/api/health" });
    const unknown = await app.inject({ method: "GET", url: "/api/nope" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe("not_found");
  });

  it("does not serve static files when webDistDir is unset", async () => {
    const app = await createApp(null);

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("ignores a webDistDir that does not exist", async () => {
    const app = await createApp(join(webDistDir, "missing"));

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");
  });

  it("reports internal errors when the dist directory exists but has no index.html", async () => {
    const distWithoutIndex = await mkdtemp(join(tmpdir(), "onto-empty-dist-"));
    try {
      const app = await createApp(distWithoutIndex);
      const response = await app.inject({ method: "GET", url: "/some/spa/route" });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("not_found");
    } finally {
      await rm(distWithoutIndex, { recursive: true, force: true });
    }
  });
});
