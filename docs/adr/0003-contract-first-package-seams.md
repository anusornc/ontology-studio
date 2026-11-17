# 0003 — Contract-first package seams

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The domain library, the API and the web studio were implemented in parallel, each by a separate
owner, before any of the three had a running end-to-end path. The risk in that arrangement is not
merge conflicts — the packages live in separate directories — but behavioural drift: the UI assumes
a route or a test id that the API never implemented, or the server serializes a document the core
cannot parse.

The domain types are the shared surface every package compiles against. If they change casually,
all three packages break at once. The repository and HTTP boundaries are equally load-bearing: they
are the only places where the packages meet.

## Decision

Treat three written contracts as authoritative before writing implementation code:

- [`docs/DOMAIN-CONTRACT.md`](../DOMAIN-CONTRACT.md) — behaviour and signatures of `@onto/core`,
  with the types in `packages/ontology-core/src/types.ts` frozen for the other packages.
- [`docs/API-CONTRACT.md`](../API-CONTRACT.md) — endpoints, request/response shapes, error envelope,
  environment variables, persistence layout and the testability requirement (`buildApp` export).
- [`docs/UI-CONTRACT.md`](../UI-CONTRACT.md) — layout, interaction flows, component boundaries,
  store shape, and the exact `data-testid` attributes the E2E suite depends on.

Enforce the seams structurally:

- Applications never import each other; they communicate only through the HTTP contract.
- The API exposes `buildApp({ repository })` so tests inject an in-memory repository and use
  `app.inject` without a port.
- The web store is a factory, `createOntologyStore(api, options?)`, so tests inject a fake API
  client.
- Every non-2xx response uses one error envelope, and the web client maps it to a typed `ApiError`.
- A contract change is made in the contract document first, then in the frozen types, then in the
  affected packages and tests. Adding optional fields is allowed; breaking changes require
  coordinating all three packages.

## Consequences

**Positive**

- Parallel implementation without a shared build or code merge: each owner works against the same
  written behaviour.
- The seams double as test seams, so integration tests are fast and need no ports; E2E is reserved
  for the real user journeys.
- Contract documents capture ambiguity early, in review, instead of in a half-built integration.
- The frozen types give the compiler the first line of defence against drift.

**Negative**

- Writing and maintaining contracts is real work, and a contract can be wrong or ambiguous — some
  gaps only appear when packages meet (for example a UI flow that needs a test id the contract does
  not list yet). Those are recorded as open issues rather than silently resolved by one package.
- Contract edits are cross-cutting and more expensive than local edits; small tweaks require a
  coordinated pass over types, tests and docs.
- Documents and code can drift if tests do not cover a contract clause; the mitigation is that the
  contract is the review baseline and every clause aims to have a test.
- The frozen type file becomes a bottleneck for additive domain changes: it is cheap to extend with
  optional fields, expensive to reshape.

## Alternatives considered

- **Implementation-first, reconcile later.** Faster for one owner, but parallel owners would
  discover mismatches only at integration time, when fixing them is most expensive.
- **Generate the API from an OpenAPI schema and the client from the same schema.** Strong
  machine-checked contract, but it adds code generation to a three-route API and still does not
  capture UI flows or test ids.
- **One owner building everything sequentially.** Removes coordination cost, but forfeits the
  parallelism this project deliberately used and concentrates all context in one place.
- **Rely on the type system alone.** Types catch shape mismatches but not status codes, headers,
  validation codes, debounce behaviour or DOM test ids.

## References

- [Domain contract](../DOMAIN-CONTRACT.md)
- [API contract](../API-CONTRACT.md)
- [UI contract](../UI-CONTRACT.md)
- [Architecture](../ARCHITECTURE.md)
- [ADR 0001 — pnpm monorepo with a shared core package](0001-pnpm-monorepo-with-shared-core.md)
- [ADR 0006 — TDD vertical slices](0006-tdd-vertical-slices.md)
