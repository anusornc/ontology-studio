# Development Guide

How to install, run, test and extend the Ontology Designer. The authoritative
behaviour is in the [domain](DOMAIN-CONTRACT.md), [API](API-CONTRACT.md) and
[UI](UI-CONTRACT.md) contracts; this guide covers the mechanics of working on them.

## Prerequisites

- **Node.js 22 or newer** — the root `package.json` declares `"engines": { "node": ">=22" }`
  and the toolchain (Vite 7, Vitest 4) assumes a current Node release.
- **pnpm 9** — the repository pins `"packageManager": "pnpm@9.1.0"`. If your Node
  distribution still bundles Corepack, `corepack enable` installs that version on first use;
  otherwise install it directly with `npm install -g pnpm@9`.
- **Chromium** — only for end-to-end tests. Installed with `pnpm e2e:install`.

Check the versions before reporting a build problem:

```bash
node --version   # v22.x or newer
pnpm --version   # 9.x
```

## Install

```bash
pnpm install
```

The workspace installs all three packages (`@onto/core`, `@onto/server`, `@onto/web`)
with their shared lockfile. `@onto/core` is a workspace link, so the applications always
compile against the local source — no separate core build is needed for development or
tests.

## Run

| Goal | Command | URL |
| --- | --- | --- |
| Both apps, watch mode | `pnpm dev` | web <http://127.0.0.1:5173>, API <http://127.0.0.1:5174> |
| API only | `pnpm dev:api` | <http://127.0.0.1:5174/api/health> |
| Web only | `pnpm dev:web` | <http://127.0.0.1:5173> (needs the API on 5174) |
| Production build | `pnpm build` | `apps/*/dist` |
| Serve built app | `ONTO_WEB_DIST=apps/web/dist pnpm start` | <http://127.0.0.1:5174> |

The Vite dev server proxies `/api` to `http://127.0.0.1:5174`, so the browser only ever
talks to port 5173. If the API is not running, the studio boots into an error state —
start `pnpm dev:api` (or full `pnpm dev`) and reload.

### Environment variables

The API reads these at startup (see [API-CONTRACT.md](API-CONTRACT.md)):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5174` | HTTP port the API listens on. |
| `HOST` | `127.0.0.1` | Bind address. |
| `ONTO_DATA_DIR` | `./data` | Persistence directory. Resolved from the process working directory. |
| `ONTO_DB_TYPE` | `json` | On-disk backend: `json` (per-file documents) or `sqlite` (embedded on-disk DB). |
| `ONTO_WEB_DIST` | unset | When set and the directory exists, serve the built web app from it with SPA fallback. |

Run with the embedded SQLite backend: `ONTO_DB_TYPE=sqlite ONTO_DATA_DIR=./data pnpm dev:api`
(the API writes a single `ontologies.db` file in the data directory). Stay with
`json` (the default) for human-readable per-ontology files.

`data/` and `.e2e-data/` are gitignored. Tests that exercise the on-disk adapters use
their own temporary directory and never write into `data/`; the Playwright run uses
`.e2e-data` through `playwright.config.ts`.

## Test commands

| Scope | Command |
| --- | --- |
| Everything (Vitest, all packages) | `pnpm test` |
| Watch mode across packages | `pnpm test:watch` |
| Domain only | `pnpm --filter @onto/core test` |
| API only | `pnpm --filter @onto/server test` |
| Web only | `pnpm --filter @onto/web test` |
| Type-check everything | `pnpm typecheck` (or per package with `--filter`) |
| Build everything | `pnpm build` |
| End-to-end | `pnpm e2e` |
| Standard pre-handoff gate | `pnpm check` (typecheck + all Vitest suites) |

Filter to one test while working TDD:

```bash
pnpm --filter @onto/core test -- -t "exportTurtle"
pnpm --filter @onto/web test -- -t "autosave"
```

`pnpm e2e` starts both dev servers automatically and waits for
`http://127.0.0.1:5174/api/health` and `http://127.0.0.1:5173`. Outside CI it reuses
servers that are already running, so `pnpm e2e` works while `pnpm dev` is up. In CI it
always starts fresh servers against `.e2e-data`.

## TDD-first workflow

Every behaviour is built as a thin vertical slice: a test at the innermost seam, the
minimum implementation, a refactor, then the next seam outward. A slice is only finished
when it is covered at every seam it touches.

1. **Pick one observable behaviour** from a contract. One behaviour, not one layer —
   "the Turtle export downloads a `.ttl` file", not "write the exporter".
2. **Write the failing test at the innermost seam** — normally a pure `@onto/core`
   function, because it is fast and deterministic. Run it and confirm it fails for the
   intended reason.
3. **Implement the minimum** to make it pass. Do not add behaviour the next test has not
   demanded yet.
4. **Refactor** with the test green: rename, extract, simplify, remove duplication. Run
   the package suite and typecheck after every step.
5. **Move one seam outward** — API integration test with `buildApp` and `app.inject`,
   then the web client/store/component test, then a Playwright scenario for the
   user-visible path.
6. **Run the full gate** — `pnpm check` and `pnpm e2e` before handing off. No layer is
   complete while any other layer's test for the same behaviour is red.

### Worked tracer bullet: the Turtle export

The goal is one small behaviour that reaches all three layers: a user can download the
open ontology as Turtle. The tests below are sketches for illustration; match the import
style and helpers of the existing suites.

**Red 1 — core unit test.** The exporter is a pure function; its output must contain the
contract's prefix block, class and property blocks.

```ts
// packages/ontology-core/test/serialization.test.ts (sketch)
it("exportTurtle emits prefixes and OWL blocks", () => {
  const turtle = exportTurtle(createSampleOntology());
  expect(turtle).toContain("@prefix : <");
  expect(turtle).toContain("a owl:Class");
  expect(turtle).toContain("a owl:DatatypeProperty");
  expect(turtle).toContain("a owl:ObjectProperty");
  expect(turtle).toContain("xsd:string");
});
```

Run `pnpm --filter @onto/core test -- -t exportTurtle`; it fails because the function
does not exist. **Green 1:** add the exporter with the prefix block and one block per
class, attribute and relation, mapping datatypes to XSD. **Refactor:** extract the two
escaping helpers and the datatype map; keep tests green.

**Red 2 — API integration test.** The route is testable without a listening port by
injecting the in-memory repository.

```ts
// apps/server/test/export.test.ts (sketch)
const app = await buildApp({ repository: new InMemoryOntologyRepository() });
const created = await app.inject({
  method: "POST",
  url: "/api/ontologies",
  payload: { name: "Test" }
});
const id = created.json().id;
const res = await app.inject({
  method: "GET",
  url: `/api/ontologies/${id}/export?format=turtle`
});
expect(res.statusCode).toBe(200);
expect(res.headers["content-type"]).toContain("text/turtle");
expect(res.headers["content-disposition"]).toContain('.ttl"');
```

**Green 2:** add the route, load the document through the repository, call
`exportTurtle`, and set the two headers. Add the `400 invalid_request` and `404`
neighbour tests while you are there — the contract defines them in the same behaviour,
and cover `format=json`: it returns `application/json` with a `<slug>.json` attachment
whose body parses back with `parseOntology`, the round-trip guarantee.

**Red 3 — web seam test.** The API client is tested with mocked `fetch`; the export
download is driven from the top bar. Assert the request URL and the filename the client
returns, then test the menu component through its `data-testid` attributes
(`btn-export`, `export-menu`, `export-turtle`) with a fake API.

**Green 3:** wire the export menu to the client and trigger the download.
**Refactor:** keep the label, filename and format in one small table rather than three
branches.

**Red 4 — end-to-end scenario.** In Playwright, create an ontology, click
`btn-export`, click `export-turtle`, and assert a download whose filename ends in
`.ttl`. **Green 4:** the scenario passes against the real servers.

The slice is now done: it has a unit test, an integration test, a client/component test
and an E2E scenario, all green with `pnpm check && pnpm e2e`.

### When the feature is not in the contracts

The contracts are authoritative (see
[ADR 0003](adr/0003-contract-first-package-seams.md)). If a feature changes observable
domain, API or UI behaviour, update the relevant contract first, then implement the
slice, then update the docs that describe it. Changes that touch the frozen types in
`packages/ontology-core/src/types.ts` must be agreed across `@onto/core`, `@onto/server`
and `@onto/web` before the first test is written.

## Test seam map

Tests only target these seams. Anything not listed here is an implementation detail and
may change during refactoring.

| Seam | How tests substitute or observe it | Used for |
| --- | --- | --- |
| Core pure functions | Direct import of `@onto/core`; explicit `id` / `now` for determinism; timestamps tolerated with a shape assertion otherwise | Domain factories, mutations, queries, layout, validation, serialization |
| Core JSON parse | Pass a JSON string or parsed value to `parseOntology`; assert `OntologyParseError.problems` | Untrusted/imported documents |
| API app | `await buildApp({ repository })` plus `app.inject(...)` — no port, no network | Route behaviour, status codes, error envelope, headers |
| API persistence | Construct the app with `JsonFileOntologyRepository` rooted at a temporary directory; rebuild the app to prove a restart | Atomic writes and restart survival |
| Web API client | Mock global `fetch`; assert URL, method, headers and mapped `ApiError` | Protocol mapping |
| Web store | `createOntologyStore(fakeApi, options?)`; fake timers for the autosave debounce; assert state transitions | `bootstrap`, create/open/sample, `createFromTemplate`, `mutate`, `save`, `validate`, selection, tabs |
| Web graph mapping | Pure `toFlow(ontology, selected)` result; no rendering | Nodes, edges, positions, labels, selection flags |
| Web components | Testing Library queries by the contract's `data-testid` attributes; React Flow is mocked in App-level tests | Empty state, sidebar, inspector, issues panel, export menu |
| End-to-end | Real web app and real API through `playwright.config.ts`; `baseURL` 127.0.0.1:5173, data in `.e2e-data` | The full user journey |

Enum values are edited in the inspector as a single comma-separated field. The intended
test id is `field-attribute-enum`, but it is not in the UI contract's required test-id
list yet, so treat it as an optional seam rather than an E2E dependency.

Never mock the core inside server or web tests: the contracts require both apps to use
the same behaviour, and a mocked core would hide drift.

## Definition of done

- [ ] Behaviour added to the relevant contract if it changed observable behaviour.
- [ ] Unit/integration tests written first and now green.
- [ ] Web tests use the injected fake API and the contract's `data-testid` attributes.
- [ ] User-visible behaviour has a Playwright scenario.
- [ ] `pnpm check` passes (typecheck + all Vitest suites).
- [ ] `pnpm build` passes.
- [ ] `pnpm e2e` passes.
- [ ] Documentation that describes the behaviour is updated.

## Troubleshooting

**Port 5173 or 5174 is already in use.** Vite runs with `strictPort: true`, so it fails
instead of silently moving to another port. Find and stop the process:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
```

Then rerun `pnpm dev`. If you must change the API port with `PORT`, keep the Vite proxy
target and the Playwright URLs in sync — they assume 5174.

**Playwright fails with a missing browser.** Install Chromium once:

```bash
pnpm e2e:install
```

In CI also expect fresh servers (`reuseExistingServer` is disabled when `CI` is set) and
allow the 120 s web-server startup timeout in `playwright.config.ts`.

**React Flow breaks in jsdom (`ResizeObserver is not defined`, zero-size canvas).**
jsdom has no layout engine. `apps/web/vitest.setup.ts` already stubs `ResizeObserver`,
`matchMedia`, `offsetWidth`, `offsetHeight` and `getBoundingClientRect`. Keep using that
setup file; do not assert on measured pixel sizes. For App-level tests, mock React Flow
and test the pure `toFlow` mapping directly; test `ClassNode` with a direct render test.

**An autosave test passes or fails unpredictably.** The save is debounced (about 600 ms).
Use `vi.useFakeTimers()`, advance the debounce inside `act`, then resolve the fake API
promise and flush microtasks. Never assert on the saved state immediately after a
mutation.

**`window.confirm` is not implemented in jsdom.** Deleting a class asks for confirmation.
Stub it in the test, for example `vi.spyOn(window, "confirm").mockReturnValue(true)`,
and restore it afterwards.

**The studio loads but every request fails in the browser.** The Vite proxy targets
`http://127.0.0.1:5174`; confirm the API is up with
`curl http://127.0.0.1:5174/api/health`. If you changed `PORT`, update the proxy target in
`apps/web/vite.config.ts` as well.

**E2E expectations break after earlier runs.** Playwright stores its data in
`.e2e-data/`. Remove that directory (it is gitignored) to return to the empty-state
start, or delete only the ontologies a test needs to reset.

**TypeScript complains about type-only imports.** `tsconfig.base.json` enables
`verbatimModuleSyntax`, so import types with `import type { ... } from "...";` and
export them the same way.
