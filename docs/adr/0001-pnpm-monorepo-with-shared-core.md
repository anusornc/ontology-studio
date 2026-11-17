# 0001 — pnpm monorepo with a shared core package

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The product needs the same ontology behaviour in three places: the domain rules themselves, the
HTTP API that persists and validates documents, and the browser UI that edits and renders them.
The domain is the part that must not drift: if the UI and the API disagree about what a class,
attribute, relation or validation issue is, the product is wrong even when every individual test
passes.

At the same time the three parts are implemented in parallel against written contracts. We need a
workspace where packages can be built and tested independently, where the shared domain is a single
source of truth rather than a copied file, and where cross-package types are checked by the compiler
instead of by convention.

The project is small, TypeScript-only, and has no build-time need for a polyglot toolchain or a
remote package registry.

## Decision

Use a pnpm workspace monorepo with two application packages and one library package:

- `packages/ontology-core` — published in-workspace as `@onto/core`, the pure domain.
- `apps/server` — `@onto/server`, the Fastify API and persistence.
- `apps/web` — `@onto/web`, the React studio.

`pnpm-workspace.yaml` includes `packages/*` and `apps/*`. Both applications depend on
`@onto/core` through `workspace:*`, and the package's `exports` map points at `src/index.ts`, so
development and tests always compile against current source — no separate core build step.

The root `package.json` owns the shared developer commands (`dev`, `build`, `test`, `typecheck`,
`e2e`, `check`) via recursive `pnpm -r` and filtered `pnpm --filter` invocations. Shared strict
TypeScript settings live in `tsconfig.base.json` and are extended by every package.

## Consequences

**Positive**

- One lockfile and one dependency graph; the core cannot silently diverge from either consumer.
- Compile-time checking of the frozen domain interfaces across all three packages.
- Each package keeps its own `tsconfig.json`, Vitest configuration and scripts, so agents and
  contributors can own one package without touching the others.
- No private registry, publishing or version-bump step is needed for local development.

**Negative**

- pnpm-specific commands and workspace protocol (`workspace:*`) are required; a contributor with a
  different package manager cannot simply run the same install.
- The core package's `exports` point at source, so anything that consumes the core inherits its
  TypeScript configuration assumptions; a future published artifact would need a build-and-publish
  story.
- Recursive commands fail the whole run when one package fails, which is usually desirable but
  makes selective local runs necessary during TDD.

## Alternatives considered

- **Single application package.** Simplest to install and run, but it would couple the browser
  bundle, the server and the domain tests, and make the dependency rule unenforceable.
- **Three separately published npm packages.** Real versioning and independent releases, but
  overkill for a local project and it turns every domain change into a coordinated publish.
- **Nx or Turborepo on top of pnpm workspaces.** Better task caching and graph visualisation, but
  additional configuration and tooling for three packages with fast test suites.
- **Copy the types into each app.** Fast to start, but guarantees drift — exactly the failure this
  project is trying to design out.

## References

- [Architecture](../ARCHITECTURE.md)
- [Domain contract](../DOMAIN-CONTRACT.md)
- [ADR 0002 — pure immutable domain core](0002-pure-immutable-domain-core.md)
- [ADR 0003 — contract-first package seams](0003-contract-first-package-seams.md)
