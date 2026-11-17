# 0007 — Ready-made ontology templates in the core library

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

New users opened the studio to a blank canvas every time. Designers frequently want
to start from a well-known model — the **Pizza** ontology is the canonical teaching
example in Protégé, and supply-chain traceability (batch/location/party/handling
events) is the recurring production use case we kept discussing. Requiring users to
hand-assemble every class, attribute and relation from scratch raises the barrier to
a first useful model and makes it hard to express domain conventions.

We wanted a way to offer a set of **ready-made starter ontologies** that:

- are authored once, in the pure core library, and reused by any client;
- can be inspected, extended and exported with the rest of the studio;
- stay consistent with the existing test-first workflow (the same vertical-slice
  discipline as ADR 0006);
- don't duplicate the "University sample" that powers the separate "Load sample"
  action — templates are a distinct, broader surface.

## Decision

Add an **ontology template registry** to `@onto/core` (pure, no deps):

- `OntologyTemplate` — `{ id, name, description, category, tags, build(options?) }`.
- `createOntologyTemplates()`, `findOntologyTemplate(id)`,
  `createOntologyFromTemplate(id, options?)` (throws `RangeError` on an unknown id).
- Templates live in `templates.ts`, exported from `index.ts`, and each `build()`
  returns a ready auto-laid-out `Ontology` that validates with zero errors.

Ship four templates (see `docs/DOMAIN-CONTRACT.md` → "Ontology templates"):

| id | category | model |
| --- | --- | --- |
| `pizza` | Learning | Protégé classic: Pizza, VegetarianPizza, MeatPizza, CheesePizza, PizzaBase, PizzaTopping, Topping; `hasBase`, `hasTopping`, `excludesTopping` |
| `supply-chain` | Industry | Product, Batch⊂Product, Party, Location, HandlingEvent, SensorReading; `undergoes`, `performedBy`, `atLocation`, `trackedBy` |
| `education` | Domain | Person root, Student/Teacher⊂, Course, Classroom, Enrollment |
| `library` | Domain | LibraryItem root, Book/Magazine⊂, Author, Member, Loan |

In the UI the core templates drive the New-ontology dialog's **Templates** tab and a
compact grid in the empty state (`TemplatePicker`); the store exposes a
`createFromTemplate(templateId)` action mirroring `loadSample` (build → create via
API → save → open).

### Determinism vs. freshness (resolved)

The contract asked for both "fresh unique ids each call" and "deterministic given a
fixed `now`", which conflict when the same timestamp repeats. Resolution: the id
generator is **seeded from `now`** (a small deterministic PRNG keyed on the
timestamp). The same `now` reproduces byte-identical output; distinct timestamps
yield non-overlapping ids; omitting `now` uses the wall clock and is unique per call.

## Consequences

**Positive**

- A first useful model is one click away, including the Pizza teaching ontology and
  the supply-chain traceability sketch already under discussion.
- Templates are authored once in the pure core and reused by every client, fully
  covered by unit tests (registry order, presence, zero validation errors,
  deterministic rebuild, no shared ids across different seeds).
- They slot into the existing seams: `validateOntology` guarantees zero errors, the
  web store reuses the create-and-save path, and Playwright covers the user journey.
- The template surface stays distinct from the University sample, so the "Load
  sample" action's expectations are untouched.

**Negative**

- Another API surface to keep in sync between the three packages; a wrongly-shaped
  template would surface as validation errors the user must repair.
- The seeded-id scheme is slightly more subtle than "always random"; a consumer
  calling `build()` twice with the same `now` gets identical models, which must be
  documented (it already is in the domain contract).
- More starter models require curation to stay canonical and correctly named.

## Alternatives considered

- **Templates as HTTP endpoints served by `@onto/server`.** Rejected: the web client
  imports `@onto/core` directly and the data is pure and deterministic, so a separate
  API round-trip adds latency and duplicated authoritative copies for no benefit.
- **A `templateId` param on `POST /api/ontologies`.** Rejected: creation still needs
  the resolved document to be saved, and templates are a domain/(client) concept, not
  a transport detail.
- **Templates as static JSON documents in a folder.** Rejected: they would duplicate
  the `build()` logic, lose the deterministic position/validation guarantees, and
  drift from the existing factory/validator.
- **Only the Pizza model (no supply-chain/library/education).** Rejected: the intent
  is a reusable starter catalog covering domains users actually care about.

## References

- [Domain contract — Ontology templates](../DOMAIN-CONTRACT.md)
- [UI contract — Template picker](../UI-CONTRACT.md)
- [ADR 0002 — pure immutable domain core](0002-pure-immutable-domain-core.md)
- [ADR 0003 — contract-first package seams](0003-contract-first-package-seams.md)
- [ADR 0006 — TDD vertical slices](0006-tdd-vertical-slices.md)