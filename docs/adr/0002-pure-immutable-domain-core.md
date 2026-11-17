# 0002 — Pure, immutable domain core

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The ontology rules are the part of the product most likely to harbour subtle bugs: inheritance
cycles, orphaned parents, duplicate names, self-relations, datatype mapping, deterministic export.
Those rules must be cheap and reliable to test, and they must behave identically in the browser and
on the server.

A traditional layered approach would put the domain inside the API, behind HTTP, with a database
and framework dependencies nearby. Tests would then need a server, a port and fixtures just to
check that removing a class reparents its children. The UI would re-implement some of the same
rules or call the API for every keystroke.

## Decision

Make `@onto/core` a pure TypeScript library:

- No DOM, no Node APIs, no filesystem, no network, no framework imports (`fastify`, `react`,
  `zustand`).
- Every mutation (`addClass`, `updateClass`, `removeClass`, `addRelation`, …) returns a new
  `Ontology` value and never mutates its input; unknown ids are a no-op that returns an unchanged
  document.
- The only non-deterministic inputs are ids and timestamps. Factories accept explicit `id` and
  `now` so tests can pin them; timestamps on later mutations use the current time and are tolerated
  by tests that do not assert exact values.
- Validation, queries, layout, native JSON parse/serialize and the Turtle and JSON-LD exporters are
  all pure functions over the document.
- `parseOntology` returns a defensive deep copy and collects all structural problems in a typed
  `OntologyParseError` instead of failing on the first one.

## Consequences

**Positive**

- Domain tests are fast, deterministic and need no server, database, browser or fixtures.
- The same implementation runs in Node and in the browser, so the UI can apply a mutation locally
  and the API can apply the same mutation when parsing or importing.
- Immutability makes the store's state updates predictable and lets React components rely on
  reference changes for re-rendering.
- Export output is deterministic, so golden-file tests are meaningful.

**Negative**

- Copies are made on every mutation; for this document size that is a deliberate trade for
  simplicity, not a performance-tuned design.
- Timestamps inside mutations are not injectable, so tests must tolerate `new Date()` values rather
  than pinning them (the factories can still pin creation time).
- Referential integrity is not enforced at parse time; callers must run validation to surface
  unknown parents and endpoints. This is intentional — broken documents must remain loadable so
  users can repair them — but it means "parses" does not imply "valid".
- The core cannot use convenient platform features (file slugs, URL parsing, DOM APIs), so helpers
  such as `slugify` are hand-written and must stay ASCII-safe and non-throwing.

## Alternatives considered

- **Mutable classes with methods** (`ontology.addClass(...)`). Familiar object-oriented shape, but
  change tracking, undo/redo and store updates become stateful and harder to test.
- **Server-only domain with the UI as a thin client.** One implementation, but every edit becomes a
  network round-trip and the UI loses the ability to render changes optimistically.
- **Shared schema toolkit (zod schemas in core) as the source of truth.** Good for runtime
  validation, but it would put a serialization-library dependency and a different style of type
  declaration at the centre of the domain; the frozen TypeScript interfaces serve that role here.
- **An ORM/GraphQL data model.** Would bring a graph database or schema engine into a project whose
  persistence contract is one JSON file per ontology.

## References

- [Domain contract](../DOMAIN-CONTRACT.md)
- [Architecture](../ARCHITECTURE.md)
- [ADR 0004 — React Flow canvas and Zustand store](0004-react-flow-canvas-and-zustand-store.md)
- [ADR 0006 — TDD vertical slices](0006-tdd-vertical-slices.md)
