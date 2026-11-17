# Development Guide

## Project Structure

```
ontology-studio/
├── packages/
│   └── ontology-core/          # Pure domain library (no deps)
│       ├── src/
│       │   ├── types.ts        # Frozen public types
│       │   ├── naming.ts       # Identifier helpers
│       │   ├── model.ts        # Factories, mutations, queries, layout
│       │   ├── validation.ts   # 17-code validator
│       │   ├── serialization.ts # Native JSON parse/serialize
│       │   ├── exporters.ts    # Turtle + JSON-LD export
│       │   ├── templates.ts    # Ready-made ontology templates
│       │   └── sample.ts       # University demo ontology
│       └── test/               # 159 tests
├── apps/
│   ├── server/                 # Fastify REST API
│   │   ├── src/
│   │   │   ├── app.ts          # buildApp() factory (test seam)
│   │   │   ├── repository.ts   # InMemory + JsonFile + SQLite adapters
│   │   │   └── server.ts       # Thin entrypoint
│   │   └── test/               # 78 tests
│   └── web/                    # React canvas UI
│       ├── src/
│       │   ├── components/     # TopBar, Sidebar, Canvas, Inspector...
│       │   ├── state/          # Zustand store + context
│       │   ├── graph/          # Pure ontology → React Flow mapping
│       │   ├── api/            # Typed API client
│       │   └── styles.css      # Dark graph-studio theme
│       └── test/               # 59 tests
├── e2e/                        # Playwright E2E (12 tests)
├── docs/                       # Contracts, ADRs, glossary
└── site/                       # VitePress documentation (this site)
```

## TDD Workflow

Every feature follows **red → green → refactor** in vertical slices:

1. **Write a failing test** at the innermost seam (usually a pure `@onto/core` function).
2. **Implement the minimum** to make it pass.
3. **Refactor** while the suite stays green.
4. **Move one seam outward** — API integration test with `buildApp` + `app.inject`, then web store/component test with injected fake API, then Playwright E2E for user-visible paths.

A behaviour is not done until it has tests at every seam it touches.

### Test Seams

| Seam | How to test | What it catches |
|------|-------------|-----------------|
| Pure core functions | Direct calls, no I/O | Domain logic, validation rules, serialization |
| Repository | `InMemoryOntologyRepository` or temp dirs | Persistence contract, corrupt data handling |
| HTTP API | `buildApp({repository}).inject(...)` | Routes, status codes, error envelope, headers |
| Web store | `createOntologyStore(fakeApi)` | State transitions, autosave, error recovery |
| Components | Testing Library + injected store | Rendering, interactions, accessibility |
| E2E flows | Playwright against real servers | Full user journeys, cross-package integration |

### Worked Example: Adding a New Validation Rule

```ts
// 1. RED: write the failing test first
it("reports self-relation as a warning", () => {
  const ontology = createOntology({ name: "Test", now: "2026-01-01T00:00:00Z" });
  const withRelation = addRelation(ontology, createRelation({
    id: "r1", name: "selfRef", label: "self ref",
    sourceClassId: "c1", targetClassId: "c1", cardinality: "one-to-one"
  }));
  const report = validateOntology(withRelation);
  expect(report.issues).toContainEqual(expect.objectContaining({
    code: "self-relation", severity: "warning"
  }));
});

// 2. GREEN: implement just enough
// In validation.ts, add the check in the relations loop

// 3. REFACTOR: clean up while tests stay green
// 4. Move outward: add API test, then E2E if user-visible
```

## Running Tests

```bash
# All packages
pnpm check              # typecheck + test across all 3 packages

# Individual packages
pnpm --filter @onto/core test
pnpm --filter @onto/server test
pnpm --filter @onto/web test

# Watch mode
pnpm --filter @onto/core test:watch

# E2E (starts real servers automatically)
pnpm e2e

# Single test file
cd apps/server && pnpm exec vitest run test/sqlite-repository.test.ts
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5174` | API HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `ONTO_DATA_DIR` | `./data` | Persistence directory |
| `ONTO_DB_TYPE` | `json` | Backend: `json` or `sqlite` |
| `ONTO_WEB_DIST` | unset | Serve built SPA from this path |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 5174 in use | Set `PORT=5175` or kill the existing process |
| Playwright browser missing | `pnpm e2e:install` (uses Microsoft Edge channel) |
| jsdom ResizeObserver errors | Already stubbed in `vitest.setup.ts` |
| `node:sqlite` not found | Requires Node ≥ 22.5; check `node --version` |
| Build chunk size warning | Expected — React Flow is ~500KB; not an error |
