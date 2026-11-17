import { defineConfig } from "tsup";

/**
 * `@onto/core` is a private, source-only workspace package (its exports point at
 * `src/index.ts`), so it must be bundled into the server artifact — otherwise
 * `node dist/server.js` cannot resolve it. Third-party runtime dependencies stay
 * external and come from `node_modules`.
 *
 * `node:sqlite` is intentionally NOT imported statically here: the SQLite
 * adapter loads it at runtime via `createRequire`, so esbuild's ESM output never
 * rewrites `node:sqlite` into the non-resolvable bare `sqlite` specifier.
 */
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  clean: true,
  noExternal: ["@onto/core"],
  esbuildOptions(options) {
    options.platform = "node";
    return options;
  }
});
