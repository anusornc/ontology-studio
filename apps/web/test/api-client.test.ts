import type { Ontology, OntologySummary, ValidationReport } from "@onto/core";
import { describe, expect, it, vi } from "vitest";
import { ApiError, createOntologyApi } from "../src/api/client";

type FetchMock = ReturnType<typeof vi.fn>;

interface CapturedCall {
  url: string;
  init: RequestInit | undefined;
}

function makeFetch(responder: (url: string, init: RequestInit | undefined) => Promise<Response> | Response) {
  const calls: CapturedCall[] = [];
  const fetchMock: FetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return responder(url, init);
  });
  return { fetchMock: fetchMock as unknown as typeof fetch, calls };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

const ontology: Ontology = {
  id: "onto-1",
  name: "University",
  description: "A sample",
  version: "0.1.0",
  baseIri: "https://example.org/ontology/university",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  classes: [],
  relations: []
};

const summary: OntologySummary = {
  id: "onto-1",
  name: "University",
  description: "A sample",
  version: "0.1.0",
  classCount: 0,
  relationCount: 0,
  updatedAt: "2026-01-02T00:00:00.000Z"
};

const report: ValidationReport = { ok: true, issues: [], errors: 0, warnings: 0 };

describe("createOntologyApi", () => {
  it("lists ontologies from GET /api/ontologies", async () => {
    const { fetchMock, calls } = makeFetch(() => jsonResponse({ ontologies: [summary] }));
    const api = createOntologyApi({ fetch: fetchMock });

    await expect(api.listOntologies()).resolves.toEqual([summary]);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/ontologies");
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
  });

  it("fetches a single ontology and URL-encodes the id", async () => {
    const { fetchMock, calls } = makeFetch(() => jsonResponse(ontology));
    const api = createOntologyApi({ fetch: fetchMock });

    await expect(api.getOntology("onto/1")).resolves.toEqual(ontology);
    expect(calls[0]!.url).toBe("/api/ontologies/onto%2F1");
  });

  it("creates an ontology with a JSON POST body", async () => {
    const { fetchMock, calls } = makeFetch(() => jsonResponse(ontology, 201));
    const api = createOntologyApi({ fetch: fetchMock });

    const created = await api.createOntology({ name: "University", description: "A sample" });

    expect(created).toEqual(ontology);
    expect(calls[0]!.url).toBe("/api/ontologies");
    expect(calls[0]!.init?.method).toBe("POST");
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ name: "University", description: "A sample" });
  });

  it("saves a complete ontology with PUT", async () => {
    const { fetchMock, calls } = makeFetch(() => jsonResponse(ontology));
    const api = createOntologyApi({ fetch: fetchMock });

    await expect(api.saveOntology(ontology)).resolves.toEqual(ontology);

    expect(calls[0]!.url).toBe("/api/ontologies/onto-1");
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual(ontology);
  });

  it("deletes an ontology and accepts an empty 204 response", async () => {
    const { fetchMock, calls } = makeFetch(() => new Response(null, { status: 204 }));
    const api = createOntologyApi({ fetch: fetchMock });

    await expect(api.deleteOntology("onto-1")).resolves.toBeUndefined();
    expect(calls[0]!.url).toBe("/api/ontologies/onto-1");
    expect(calls[0]!.init?.method).toBe("DELETE");
  });

  it("validates through POST /api/ontologies/:id/validate", async () => {
    const { fetchMock, calls } = makeFetch(() => jsonResponse(report));
    const api = createOntologyApi({ fetch: fetchMock });

    await expect(api.validateOntology("onto-1")).resolves.toEqual(report);
    expect(calls[0]!.url).toBe("/api/ontologies/onto-1/validate");
    expect(calls[0]!.init?.method).toBe("POST");
  });

  it("exports Turtle and reads the download filename from content-disposition", async () => {
    const { fetchMock, calls } = makeFetch(
      () =>
        new Response("@prefix : <https://example.org/> .", {
          status: 200,
          headers: {
            "content-type": "text/turtle; charset=utf-8",
            "content-disposition": 'attachment; filename="university.ttl"'
          }
        })
    );
    const api = createOntologyApi({ fetch: fetchMock });

    await expect(api.exportOntology("onto-1", "turtle")).resolves.toEqual({
      filename: "university.ttl",
      content: "@prefix : <https://example.org/> ."
    });
    expect(calls[0]!.url).toBe("/api/ontologies/onto-1/export?format=turtle");
  });

  it("exports JSON-LD and falls back to a default filename", async () => {
    const { fetchMock } = makeFetch(
      () => new Response('{"@graph":[]}', { status: 200, headers: { "content-type": "application/ld+json" } })
    );
    const api = createOntologyApi({ fetch: fetchMock });

    await expect(api.exportOntology("onto-1", "jsonld")).resolves.toEqual({
      filename: "ontology.jsonld",
      content: '{"@graph":[]}'
    });
  });

  it("exports native JSON and parses the .json download filename", async () => {
    const { fetchMock, calls } = makeFetch(
      () =>
        new Response('{"id":"onto-1"}', {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": 'attachment; filename="university.json"'
          }
        })
    );
    const api = createOntologyApi({ fetch: fetchMock });

    await expect(api.exportOntology("onto-1", "json")).resolves.toEqual({
      filename: "university.json",
      content: '{"id":"onto-1"}'
    });
    expect(calls[0]!.url).toBe("/api/ontologies/onto-1/export?format=json");
  });

  it("maps an API error payload to ApiError with status, code and message", async () => {
    const { fetchMock } = makeFetch(() =>
      jsonResponse({ error: { code: "not_found", message: "Ontology not found" } }, 404)
    );
    const api = createOntologyApi({ fetch: fetchMock });

    const error = await api.getOntology("missing").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "not_found", message: "Ontology not found" });
  });

  it("maps a non-JSON error response to a generic ApiError", async () => {
    const { fetchMock } = makeFetch(() => new Response("boom", { status: 500 }));
    const api = createOntologyApi({ fetch: fetchMock });

    const error = await api.listOntologies().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, code: "http_error" });
    expect((error as ApiError).message).toContain("500");
  });

  it("maps a network rejection to ApiError with status 0", async () => {
    const { fetchMock } = makeFetch(() => Promise.reject(new Error("connection refused")));
    const api = createOntologyApi({ fetch: fetchMock });

    const error = await api.listOntologies().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "network_error" });
    expect((error as ApiError).message).toContain("connection refused");
  });

  it("honours a custom base URL and keeps JSON requests discoverable", async () => {
    const { fetchMock, calls } = makeFetch(() => jsonResponse({ ontologies: [] }));
    const api = createOntologyApi({ fetch: fetchMock, baseUrl: "https://api.example.test" });

    await api.listOntologies();

    expect(calls[0]!.url).toBe("https://api.example.test/api/ontologies");
  });
});
