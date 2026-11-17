/**
 * Fastify application factory for the Ontology Designer API.
 *
 * `buildApp` is the test seam: tests pass an in-memory repository and drive the
 * app through `app.inject(...)`, so no TCP port is required. `server.ts` is the
 * thin production entrypoint that wires the JSON-file repository and listens.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply
} from "fastify";
import {
  OntologyParseError,
  createOntology,
  exportJsonLd,
  exportTurtle,
  parseOntology,
  serializeOntology,
  slugify,
  summarizeOntology,
  validateOntology,
  type Ontology
} from "@onto/core";
import { z } from "zod";

import type { OntologyRepository } from "./repository.js";

/** Server version reported by `GET /api/health`. */
export const SERVER_VERSION = "0.1.0";

/** Vite dev-server origins allowed by default. */
export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173"
] as const;

export interface BuildAppOptions {
  repository: OntologyRepository;
  corsOrigins?: string[];
  webDistDir?: string | null;
}

/** Uniform API error: `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const ontologyIdParamsSchema = z.object({
  id: z.string().min(1)
});

const exportQuerySchema = z.object({
  format: z.enum(["turtle", "jsonld", "json"])
});

const importBodySchema = z.object({
  content: z.string().min(1, "content must be a non-empty native JSON document")
});

const createOntologyBodySchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(120, "name is too long"),
  description: z.string().optional(),
  baseIri: z.string().optional(),
  version: z.string().optional()
});

/** Refreshes `updatedAt` and preserves the stored identity fields. */
function touch(existing: Ontology, next: Ontology): Ontology {
  return {
    ...next,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };
}

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ error: { code: "not_found", message } });
}

/**
 * Parse an untrusted document with `@onto/core`, translating structural
 * problems into the `invalid_document` API error.
 */
function parseDocument(input: unknown): Ontology {
  try {
    return parseOntology(input);
  } catch (error) {
    if (error instanceof OntologyParseError) {
      throw new ApiError(
        400,
        "invalid_document",
        "Ontology document is invalid.",
        { problems: error.problems }
      );
    }
    throw error;
  }
}

/**
 * Pick an id that is not stored yet. Random UUIDs make a miss vanishingly
 * unlikely; after a few checks we still return a fresh UUID (the caller's
 * insert will then surface any real storage failure).
 */
async function assignFreshId(repository: OntologyRepository): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomUUID();
    if ((await repository.get(candidate)) === undefined) {
      return candidate;
    }
  }
  return randomUUID();
}

function downloadFilename(ontology: Ontology, extension: "ttl" | "jsonld" | "json"): string {
  const slug = slugify(ontology.name) || "ontology";
  return `attachment; filename="${slug}.${extension}"`;
}

function invalidRequest(error: z.ZodError, reply: FastifyReply): FastifyReply {
  return reply.code(400).send({
    error: {
      code: "invalid_request",
      message: "Request validation failed.",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    }
  });
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { repository } = options;
  const corsOrigins = options.corsOrigins ?? [...DEFAULT_CORS_ORIGINS];
  const webDistDir =
    options.webDistDir !== null && options.webDistDir !== undefined
      ? options.webDistDir
      : null;
  const serveWebApp = webDistDir !== null && existsSync(webDistDir);
  const spaIndex = serveWebApp && existsSync(join(webDistDir, "index.html"));
  const app = Fastify();

  if (corsOrigins.length > 0) {
    await app.register(cors, {
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["content-type"],
      maxAge: 86_400
    });
  }

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details })
        }
      });
    }
    if (typeof error.statusCode === "number" && error.statusCode < 500) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: error.message }
      });
    }
    request.log.error(error);
    return reply.code(500).send({
      error: { code: "internal", message: "Internal server error." }
    });
  });

  if (serveWebApp) {
    await app.register(fastifyStatic, { root: webDistDir });
  }

  app.setNotFoundHandler(async (request, reply) => {
    const isApiPath = request.url === "/api" || request.url.startsWith("/api/");
    const isNavigation = request.method === "GET" || request.method === "HEAD";
    if (!isApiPath && spaIndex && isNavigation) {
      return reply.type("text/html; charset=utf-8").sendFile("index.html");
    }
    return reply.code(404).send({
      error: { code: "not_found", message: `Route ${request.method} ${request.url} not found.` }
    });
  });

  app.get("/api/health", async () => {
    return {
      status: "ok",
      version: SERVER_VERSION,
      ontologyCount: await repository.count()
    };
  });

  app.get("/api/ontologies", async () => {
    const ontologies = await repository.list();
    const summaries = ontologies
      .map((ontology) => summarizeOntology(ontology))
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id)
      );
    return { ontologies: summaries };
  });

  app.get<{ Params: { id: string } }>("/api/ontologies/:id", async (request, reply) => {
    const ontology = await repository.get(request.params.id);
    if (ontology === undefined) {
      return notFound(reply, `Ontology "${request.params.id}" not found.`);
    }
    return ontology;
  });

  app.post<{ Params: { id: string } }>(
    "/api/ontologies/:id/validate",
    async (request, reply) => {
      const ontology = await repository.get(request.params.id);
      if (ontology === undefined) {
        return notFound(reply, `Ontology "${request.params.id}" not found.`);
      }
      return validateOntology(ontology);
    }
  );

  app.put<{ Params: { id: string } }>("/api/ontologies/:id", async (request, reply) => {
    const params = ontologyIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return invalidRequest(params.error, reply);
    }
    const existing = await repository.get(params.data.id);
    if (existing === undefined) {
      return notFound(reply, `Ontology "${params.data.id}" not found.`);
    }
    const document = parseDocument(request.body);
    const updated = await repository.update(
      params.data.id,
      touch(existing, document)
    );
    if (updated === undefined) {
      return notFound(reply, `Ontology "${params.data.id}" not found.`);
    }
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/ontologies/:id", async (request, reply) => {
    const removed = await repository.delete(request.params.id);
    if (!removed) {
      return notFound(reply, `Ontology "${request.params.id}" not found.`);
    }
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/api/ontologies/:id/export",
    async (request, reply) => {
      const query = exportQuerySchema.safeParse(request.query);
      if (!query.success) {
        return invalidRequest(query.error, reply);
      }
      const ontology = await repository.get(request.params.id);
      if (ontology === undefined) {
        return notFound(reply, `Ontology "${request.params.id}" not found.`);
      }
      if (query.data.format === "turtle") {
        return reply
          .header("content-disposition", downloadFilename(ontology, "ttl"))
          .type("text/turtle; charset=utf-8")
          .send(exportTurtle(ontology));
      }
      if (query.data.format === "jsonld") {
        return reply
          .header("content-disposition", downloadFilename(ontology, "jsonld"))
          .type("application/ld+json; charset=utf-8")
          .send(JSON.stringify(exportJsonLd(ontology), null, 2));
      }
      return reply
        .header("content-disposition", downloadFilename(ontology, "json"))
        .type("application/json; charset=utf-8")
        .send(serializeOntology(ontology));
    }
  );

  app.post("/api/ontologies/import", async (request, reply) => {
    const body = importBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return invalidRequest(body.error, reply);
    }
    const document = parseDocument(body.data.content);
    let imported = document;
    if ((await repository.get(document.id)) !== undefined) {
      imported = {
        ...document,
        id: await assignFreshId(repository),
        name: `${document.name} (imported)`
      };
    }
    await repository.create(imported);
    return reply.code(201).send(imported);
  });

  app.post("/api/ontologies", async (request, reply) => {
    const parsed = createOntologyBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return invalidRequest(parsed.error, reply);
    }
    const ontology = createOntology(parsed.data);
    await repository.create(ontology);
    return reply.code(201).send(ontology);
  });

  return app;
}
