/**
 * Production entrypoint: wire the JSON-file repository, build the Fastify app
 * and listen. All routing behavior lives in `app.ts`; this file only resolves
 * environment configuration and owns the process lifecycle.
 */
import { isAbsolute, join, resolve } from "node:path";

import { buildApp } from "./app.js";
import { createJsonFileRepository } from "./repository.js";

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
  // JSON repository receive absolute paths regardless of where the server runs.
  const dataDir = resolve(process.env.ONTO_DATA_DIR?.trim() || DEFAULT_DATA_DIR);
  const webDistDirRaw = process.env.ONTO_WEB_DIST?.trim() || null;
  const webDistDir =
    webDistDirRaw === null ? null : isAbsolute(webDistDirRaw) ? webDistDirRaw : resolve(webDistDirRaw);

  const app = await buildApp({
    repository: createJsonFileRepository(dataDir),
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
        `(data: ${join(dataDir, "ontologies")}` +
        `${webDistDir === null ? "" : `, web: ${webDistDir}`})`
    );
  } catch (error) {
    console.error("[onto-server] failed to start", error);
    process.exitCode = 1;
    await app.close().catch(() => undefined);
  }
}

await main();
