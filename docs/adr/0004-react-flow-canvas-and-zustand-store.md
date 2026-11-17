# 0004 — React Flow canvas and Zustand store

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

The central interaction is a graph: classes are nodes that can be moved, selected and connected by
drag handles; relations are labelled edges. The product also needs a minimap, zoom controls, fit to
view and a deterministic automatic layout. Building pan, zoom, selection, edge routing, connection
handles and a minimap from scratch is a large amount of fiddly interaction code that has nothing to
do with the ontology domain.

State is shared by several distant components: the top bar (`Validate`, `Export`, save indicator,
ontology picker), the sidebar (class tree, relations, issues), the canvas and the inspector. Edits
must be saved with a debounce and the save status must be visible while typing.

The UI must be testable in jsdom, and the network must be injectable — tests must never hit a real
server.

## Decision

Use **`@xyflow/react` (React Flow 13)** for the canvas and **Zustand** for state.

- **Canvas.** React Flow renders class nodes at their stored `position`, with a custom `ClassNode`
  component, labelled edges for relations, background dots, `MiniMap` and `Controls`, and a toolbar
  overlay for auto layout and fit. Connection handles on a node's right and left edges create
  relations.
- **Pure mapping.** `graph/toFlow.ts` maps an `Ontology` to `{ nodes, edges }` as a pure function,
  unit-tested without rendering.
- **Store.** A vanilla Zustand store created by `createOntologyStore(api, options?)`, injected
  through a React context provider. It owns summaries, the open ontology, selection, issues, the
  sidebar tab, save state, errors and boot state, plus the actions that drive them. Autosave and
  its ~600 ms debounce live in the store, not in components.
- **Presentation.** One hand-written CSS file with CSS custom properties for the dark graph-studio
  theme; no UI framework and no CSS-in-JS dependency.
- **Stable test ids.** Components expose the exact `data-testid` attributes listed in the
  [UI contract](../UI-CONTRACT.md); nodes and edges render visible labels.

## Consequences

**Positive**

- Mature graph interactions (pan, zoom, minimap, controls, connect, selection) with little custom
  code, so effort goes into the ontology UX.
- The store factory is a clean seam: tests pass a fake `OntologyApi`, control time with fake timers
  and assert state transitions without rendering.
- Selector-based subscriptions keep re-renders local to the components that read a slice of state.
- The pure `toFlow` mapping is a cheap, fast test target for node/edge correctness.

**Negative**

- React Flow measures its container and nodes, so jsdom needs stubs for `ResizeObserver`,
  `offsetWidth`, `offsetHeight` and `getBoundingClientRect`; App-level tests should mock React Flow.
- The canvas layer is coupled to the React Flow data model; swapping it out would be a real project.
- Two mapping directions exist (document to nodes/edges, and node drag back to
  `setClassPosition`), so the mapping must be kept consistent with the domain contract.
- A store-plus-context pattern needs discipline about which actions own saves; putting debounce in
  components would fragment that ownership.

## Alternatives considered

- **Hand-written SVG/Canvas graph.** Full control over rendering and no library constraint, but
  pan/zoom/edge routing/minimap is substantial work and a likely source of UI bugs.
- **Cytoscape.js or vis-network.** Strong graph engines, but their data model and styling are a
  larger impedance mismatch for React components than React Flow's node renderer.
- **Redux Toolkit instead of Zustand.** More structure and devtools, but more ceremony for one
  document-scoped store; Zustand's vanilla factory maps directly to the injectable seam tests need.
- **React context plus `useReducer` only.** No dependency, but every consumer re-renders and the
  store could not be instantiated and tested outside React.
- **Server-rendered graph or a canvas rendered from the API.** Would remove client graph state but
  make every drag a network round-trip and lose immediate interaction feedback.

## References

- [UI contract](../UI-CONTRACT.md)
- [Architecture](../ARCHITECTURE.md)
- [Development guide — jsdom and React Flow](../DEVELOPMENT.md)
- [ADR 0002 — pure immutable domain core](0002-pure-immutable-domain-core.md)
- [ADR 0006 — TDD vertical slices](0006-tdd-vertical-slices.md)
