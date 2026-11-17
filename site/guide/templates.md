# Templates

Ontology Studio ships with ready-made starter ontologies so you can begin from a real model instead of a blank canvas. Templates are available in the **New ontology** dialog (Templates tab) and directly on the empty-state screen.

## Available Templates

### 🍕 Pizza (Learning)

The classic Protégé tutorial ontology — the most widely used ontology teaching example in academia.

- **Classes:** `Pizza` (root), `VegetarianPizza`, `MeatPizza`, `CheesePizza`, `PizzaBase`, `PizzaTopping`, `Topping`
- **Relations:** `hasBase` (1:1), `hasTopping` (1:N), `excludesTopping` (N:M)
- **Attributes:** `thickness` (enum: thin/thick/deep-dish), `vegetarian` (boolean), `cheeseType` (enum: mozzarella/parmesan/cheddar/vegan)
- **7 classes**, validates with zero errors

### 🏭 Supply Chain (Industry)

Traceability across batches, locations, parties and handling events — the foundation for supply-chain interoperability.

- **Classes:** `Product`, `Batch` (⊂ Product), `Party`, `Location`, `HandlingEvent`, `SensorReading`
- **Relations:** `undergoes` (1:N), `performedBy` (N:1), `atLocation` (N:1), `trackedBy` (1:N)
- **Attributes:** `batchId` (required), `producedAt`, `longitude`/`latitude`, `occurredAt` (required), `eventType` (enum), `temperatureC`, `recordedAt`
- **6 classes**, validates with zero errors

### 🎓 Education (Domain)

A compact school domain distinct from the University sample.

- **Classes:** `Person` (root), `Student` (⊂ Person), `Teacher` (⊂ Person), `Course`, `Classroom`, `Enrollment`
- **Relations:** `teaches` (1:N), `takes` (N:M), `heldIn` (N:1)
- **6 classes**, validates with zero errors

### 📚 Library (Domain)

Catalogue and loan management.

- **Classes:** `LibraryItem` (root), `Book` (⊂ LibraryItem), `Magazine` (⊂ LibraryItem), `Author`, `Member`, `Loan`
- **Relations:** `writtenBy` (N:M), `borrows` (1:N), `lends` (N:1)
- **Attributes:** `isbn` (required), `publishedYear`, `dueDate` (required)
- **6 classes**, validates with zero errors

## How Templates Work

Each template is a pure function in `@onto/core`:

```ts
import { createOntologyFromTemplate } from "@onto/core";

const pizza = createOntologyFromTemplate("pizza");
// Returns a fully laid-out Ontology that validates with zero errors
```

- **Deterministic:** given a fixed `now` timestamp, the same template produces byte-identical output (for reproducible tests and screenshots).
- **Fresh IDs:** each call generates unique class/attribute/relation IDs (seeded from `now`).
- **Auto-layout:** positions are computed by inheritance depth so nodes never overlap.
- **Zero validation errors:** every template passes `validateOntology()` cleanly.

## Adding Custom Templates

Templates live in `packages/ontology-core/src/templates.ts`. To add your own:

1. Define a builder function following the existing pattern (see `sample.ts` for helpers).
2. Add an entry to `createOntologyTemplates()`.
3. Write tests asserting class count, key classes/relations, zero validation errors, deterministic rebuild, and fresh IDs.
4. The UI picks up new templates automatically — no web changes needed.
