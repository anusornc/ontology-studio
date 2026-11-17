# Web UI Contract

`apps/web` is a React 19 + TypeScript + Vite single-page studio, styled with a
single hand-written CSS file (no UI framework, no CSS-in-JS dependency). It talks
to the API through `apps/web/src/api/client.ts` (relative `/api` base URL) and
keeps state in a Zustand vanilla store that is created by a factory so tests can
inject a fake API client.

The app must look like a polished professional graph studio, not a prototype.

## Design language

Dark "graph studio" theme, all colours as CSS custom properties on `:root`:

- Background `#0a0f1e`, panels `#111827` / `#0d1526`, raised `#172033`,
  borders `#22304d`, text `#e5ecf6`, muted `#94a3b8`.
- Accent cyan `#22d3ee`, violet `#a78bfa`, green `#34d399`, amber `#fbbf24`,
  red `#f87171`.
- Font: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  mono: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`.
- 12px radius cards, 1px borders, subtle shadows/glows, 8px spacing grid.
- Buttons: primary (cyan gradient/dark text), secondary (panel + border),
  ghost, danger. Focus-visible rings for accessibility.
- Transitions <= 150ms. Respect `prefers-reduced-motion`.

## Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TopBar: brand · ontology picker · saved status · Validate · Export · New   │
├──────────────┬────────────────────────────────────────────┬─────────────────┤
│ Sidebar 280  │ Canvas (React Flow, flexible)              │ Inspector 340   │
│ search       │  - Background dots                         │  Properties /   │
│ tabs:        │  - MiniMap, Controls                       │  Attributes /   │
│ Classes      │  - toolbar overlay (auto layout, fit)      │  Metadata       │
│ Relations    │                                            │                 │
│ Issues       │                                            │                 │
├──────────────┴────────────────────────────────────────────┴─────────────────┤
│ StatusBar: classes · relations · issues · base IRI                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

Responsive: below 1100px the inspector overlays as a right drawer; below 820px
the sidebar collapses to a toggle. Usable at 1440x900 (primary target) and
1024x768.

## Flows

1. **Cold start, no ontologies** – full-canvas empty state card: title
   "Design your first ontology", name input, "Create ontology" primary button,
   divider "or", "Load sample ontology" secondary button. Creating calls the API
   and opens the new ontology. Loading sample creates a `University` ontology via
   `createSampleOntology()` then saves it.
2. **Ontology selected** – sidebar depicts the class tree (orphans included),
   canvas depicts nodes at their stored positions and edges for relations.
3. **Add class** – sidebar "New class" button or double-click canvas. A class is
   created with a unique machine name and saved; it is selected and the inspector
   label field is focused. Never produce duplicate class names. New classes are
   placed on a deterministic grid slot, `x = 80 + (index % 3) * 280`,
   `y = 80 + floor(index / 3) * 200` (index = existing class count), so nodes
   never stack exactly on top of each other.
4. **Connect** – dragging from a node's right handle to another node's left
   handle creates a relation (`label "relates to"`, unique camelCase name, default
   cardinality `many-to-many`), selects it, saves.
5. **Select** – clicking node/edge selects it and inspects it; clicking pane
   clears selection and shows ontology metadata in the inspector.
6. **Edit** – inspector edits apply on change (debounced save ~600ms). Label/name/
   description/parent/colour/datatype/required/cardinality/enum are editable.
   Deleting a class asks for confirmation via `window.confirm` and cascades per
   the core contract. Deleting a relation has no confirm.
7. **Validate** – top bar "Validate" runs the server validation endpoint and
   switches the sidebar to Issues, showing grouped errors/warnings with counts.
   Clicking an issue selects its entity. Zero issues shows a success state.
8. **Export** – top bar "Export" menu offers Turtle (.ttl), JSON-LD (.jsonld),
   Native JSON (.json). Selecting one downloads the file produced by the API.
9. **Reopen** – ontology picker lists summaries by updatedAt; selecting loads it
   from the API. On bootstrap with at least one ontology the most recently
   updated one opens automatically. Data survives page reload.
10. **New ontology dialog** – top bar "New" opens a modal
   (`new-ontology-dialog`) with the same name input/create button as the empty
   state plus a cancel button (`btn-cancel-new-ontology`). Creating closes the
   dialog and opens the new ontology; cancel leaves the current one untouched.
11. **Save indicator** – `Saved`, `Saving…`, `Unsaved changes`, or `Save failed`
    with retry; autosave must never lose the current document on transient errors
    (keep dirty flag, allow manual retry).

## Exact status text

- `save-status`: exactly `Saved` (settled, after autosave), `Saving…` while a
  request is in flight, `Unsaved changes` when edits are pending, `Save failed`
  after an error. No other wording; the E2E suite matches these strings.
- `status-classes`: `"<n> classes"` (always plural), e.g. `0 classes`,
  `1 classes` is forbidden — use `"1 class"` and `"<n> classes"` for n !== 1.
- `status-relations`: same singular/plural rule (`1 relation`, `2 relations`).
- `status-errors`: `"<n> errors"` with the same singular/plural rule.
- `status-warnings`: `"<n> warnings"` with the same singular/plural rule.
- `validate-badge`: the total number of issues; hidden or zero when none.
- Validate action MUST flush any pending autosave (save immediately) before
  calling `POST /api/ontologies/:id/validate`, so validation sees the latest edit.
- When no ontology is open the app renders the empty state only (no `canvas`
  element); after creating/opening one the `canvas` element exists.

## Component boundaries (test seams)

- `api/client.ts` – typed `OntologyApi` interface + `createOntologyApi()`.
  All errors become `ApiError` with `status`, `code`, `message`.
- `state/store.ts` – `createOntologyStore(api, options?)` using
  `zustand/vanilla`; exposes state + actions. State: `summaries`, `ontology`,
  `selected`, `issues`, `sidebarTab`, `saveState`, `error`, `booting`. Actions:
  `bootstrap`, `openOntology`, `createNewOntology`, `loadSample`, `mutate`,
  `save`, `validate`, `removeOntology`, `select`, `setSidebarTab`. The App uses
  a React context provider wrapping a store instance.
- `graph/toFlow.ts` – pure mapping `ontology -> {nodes, edges}` for React Flow
  (unit-testable without rendering).
- Components: `TopBar`, `Sidebar`, `ClassTree`, `RelationsList`, `IssuesPanel`,
  `Canvas` (React Flow), `ClassNode`, `Inspector`, `OntologyForm`,
  `ClassForm`, `RelationForm`, `EmptyState`, `StatusBar`, `ExportMenu`.

## Required `data-testid` attributes (E2E depends on these exactly)

Top bar: `topbar`, `topbar-brand`, `ontology-select`, `btn-new-ontology`,
`btn-validate`, `validate-badge`, `btn-export`, `export-menu`, `export-turtle`,
`export-jsonld`, `export-json`, `save-status`.
Empty state / new dialog: `empty-state`, `new-ontology-dialog`,
`input-ontology-name`, `btn-create-ontology`, `btn-load-sample`,
`btn-cancel-new-ontology`.
Sidebar: `sidebar`, `sidebar-tab-classes`, `sidebar-tab-relations`,
`sidebar-tab-issues`, `btn-add-class`, `class-search`, `class-tree`,
`tree-node-${classId}`, `relation-item-${relationId}`, `issues-panel`,
`issue-${issueIndex}` (0-based render order), `issue-count`, `btn-auto-layout`.
Canvas: `canvas`, `node-${classId}`, `empty-canvas-hint`.
Inspector: `inspector`, `field-class-label`, `field-class-name`,
`field-class-description`, `select-parent`, `field-class-color`,
`btn-add-attribute`, `attr-row-${attributeId}`, `attr-name-${attributeId}`,
`attr-datatype-${attributeId}`, `attr-required-${attributeId}`,
`attr-delete-${attributeId}`, `btn-delete-class`, `field-relation-label`,
`field-relation-name`, `select-relation-cardinality`, `select-relation-source`,
`select-relation-target`, `btn-delete-relation`, `field-ontology-name`,
`field-ontology-description`, `field-ontology-version`, `field-ontology-base-iri`.
Status bar: `status-bar`, `status-classes`, `status-relations`, `status-errors`,
`status-warnings`.

Nodes must also render the class label as visible text and expose
`data-testid` on the node root. Edges must render the relation label as visible
text (React Flow edge label).

## Test plan (Vitest + Testing Library, jsdom)

- `test/api-client.test.ts` – mocked `fetch`: list/get/create/save/delete/
  validate/export, error mapping, JSON headers.
- `test/flow-mapping.test.ts` – nodes/edges/positions/labels/selected flags.
- `test/store.test.ts` – bootstrap, create, sample, open, mutate+autosave,
  save failure retains dirty state + retry, validate, delete, selection, tab.
- `test/app.test.tsx` – empty state create flow; loaded ontology renders tree and
  status; add class; edit label in inspector; validation issues panel; export
  menu. Mock the injected API (never real network). React Flow may be mocked in
  App-level tests to keep them deterministic; `ClassNode` gets a direct render
  test.
- Keep `pnpm --filter @onto/web test` and `typecheck` and `build` green.

The Playwright E2E suite (owned separately) drives the real app and assumes the
test ids above exist and the server is available through the Vite proxy.
