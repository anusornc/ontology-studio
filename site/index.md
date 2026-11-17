---
layout: home

hero:
  name: "Ontology Studio"
  text: "Visual Ontology Designer"
  tagline: Model classes, properties and relationships visually — validate, persist and export OWL/JSON-LD/Turtle. Built entirely with TDD.
  image:
    src: /screenshots/studio.png
    alt: Ontology Studio showing the University sample ontology
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /architecture/
    - theme: alt
      text: View on GitHub
      link: https://github.com/anusornc/ontology-studio

features:
  - title: 🎨 Visual Canvas
    details: React Flow graph editor with custom class nodes, labelled edges, pan/zoom, minimap and deterministic auto-layout.
  - title: 📦 Ready-Made Templates
    details: Start from Pizza (Protégé classic), Supply Chain, Education or Library templates — one click to a working ontology.
  - title: ✅ Validation
    details: 17 issue codes covering naming, duplicates, inheritance cycles and endpoint integrity. Deterministic reports.
  - title: 💾 Dual Persistence
    details: JSON file store (default) or embedded SQLite (ONTO_DB_TYPE=sqlite). ACID, indexed, zero external dependencies.
  - title: 📤 Multi-Format Export
    details: Turtle (.ttl), JSON-LD (.jsonld) and native JSON (.json) downloads. Import round-trips through the API.
  - title: 🧪 308 Tests
    details: Core 159 · Server 78 · Web 59 · E2E 12. Every behaviour tested at every seam it touches, TDD red-green-refactor.
---

## Screenshots

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1rem; margin-top: 2rem;">

<div>
<img src="/screenshots/pizza-template.png" alt="Pizza template" style="border-radius: 8px; border: 1px solid var(--vp-c-divider);" />
<p style="text-align: center; color: var(--vp-c-text-2); font-size: 0.9rem;">Pizza template — the Protégé classic</p>
</div>

<div>
<img src="/screenshots/template-picker.png" alt="Template picker" style="border-radius: 8px; border: 1px solid var(--vp-c-divider);" />
<p style="text-align: center; color: var(--vp-c-text-2); font-size: 0.9rem;">Template picker in the empty state</p>
</div>

<div>
<img src="/screenshots/validation.png" alt="Validation panel" style="border-radius: 8px; border: 1px solid var(--vp-c-divider);" />
<p style="text-align: center; color: var(--vp-c-text-2); font-size: 0.9rem;">Validation panel with grouped issues</p>
</div>

<div>
<img src="/screenshots/empty-state.png" alt="Empty state" style="border-radius: 8px; border: 1px solid var(--vp-c-divider);" />
<p style="text-align: center; color: var(--vp-c-text-2); font-size: 0.9rem;">Cold-start empty state</p>
</div>

</div>
