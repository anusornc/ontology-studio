/**
 * Production entrypoint: wire the persisted repository, build the Fastify app
 * and listen. All routing behavior lives in `app.ts`; this file only resolves
 * environment configuration and owns the process lifecycle.
 */
import { isAbsolute, resolve } from "node:path";

import { buildApp } from "./app.js";
import { createRepositoryByType } from "./repository.js";
import type { OntologyRepository } from "./repository.js";

const DEFAULT_PORT = 5174;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_DATA_DIR = "./data";

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`PORT must be an integer between 0 and 65535, received "${raw}".`);
  }
  return port;
}

async function main(): Promise<void> {
  const port = readPort(process.env.PORT);
  const host = process.env.HOST?.trim() || DEFAULT_HOST;
  // Resolve relative paths against the process cwd so `@fastify/static` and the
  // repository receive absolute paths regardless of where the server runs.
  const dataDir = resolve(process.env.ONTO_DATA_DIR?.trim() || DEFAULT_DATA_DIR);
  const webDistDirRaw = process.env.ONTO_WEB_DIST?.trim() || null;
  const webDistDir =
    webDistDirRaw === null ? null : isAbsolute(webDistDirRaw) ? webDistDirRaw : resolve(webDistDirRaw);
  // Persistence backend: "sqlite" (embedded, on-disk) or "json" (per-file docs).
  const dbType = process.env.ONTO_DB_TYPE?.trim().toLowerCase() || "json";

  const repository: OntologyRepository & { close?: () => void } =
    createRepositoryByType(dbType, dataDir);

  const app = await buildApp({
    repository,
    webDistDir
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[onto-server] ${signal} received, shutting down.`);
    try {
      await app.close();
      repository.close?.();
      process.exitCode = 0;
    } catch (error) {
      console.error("[onto-server] shutdown failed", error);
      process.exitCode = 1;
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    const address = await app.listen({ port, host });
    console.log(
      `[onto-server] Ontology API listening on ${address} ` +
        `(db: ${dbType}, data: ${dataDir}` +
        `${webDistDir === null ? "" : `, web: ${webDistDir}`})`
    );
  } catch (error) {
    console.error("[onto-server] failed to start", error);
    await app.close().catch(() => undefined);
    repository.close?.();
    process.exitCode = 1;
  }
}

await main();
