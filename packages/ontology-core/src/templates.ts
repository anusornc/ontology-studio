/**
 * Ready-made starting ontologies ("templates") a user can pick instead of a
 * blank canvas.
 *
 * Everything here is pure: no I/O, no clocks beyond the injected `now`, no
 * shared mutable state. Each `build()` returns a brand-new ontology with a
 * freshly generated set of ids and `autoLayout` applied, and passing the same
 * fixed `now` makes the whole build deterministic (a pure function of the
 * options), mirroring how `createSampleOntology` is reproducible.
 */

import {
  autoLayout,
  createAttribute,
  createClass,
  createOntology,
  createRelation
} from "./model";
import { PALETTE } from "./naming";
import type {
  AttributeCardinality,
  Datatype,
  Ontology,
  OntologyAttribute,
  OntologyClass,
  OntologyRelation,
  RelationCardinality
} from "./types";

/** Options passed to {@link OntologyTemplate.build}. */
export interface TemplateBuildOptions {
  /** Injectable ISO timestamp for deterministic builds/tests. */
  now?: string;
  /** Optional override for the ontology `name`; defaults to the template name. */
  nameOverride?: string;
  /** Optional override for the ontology `baseIri`. */
  baseIriOverride?: string;
}

/** One pickable starting ontology. */
export interface OntologyTemplate {
  /** Stable machine id, e.g. "pizza" or "supply-chain". */
  id: string;
  /** Human label shown on the picker card. */
  name: string;
  /** One-line description shown on the picker card. */
  description: string;
  /** Short category tag. */
  category: "Domain" | "Learning" | "Industry";
  /** Keyword blurb used by a search box. */
  tags: string[];
  /** Build a brand-new ontology instance (fresh unique ids) with a laid-out graph. */
  build: (options?: TemplateBuildOptions) => Ontology;
}

const DEFAULT_BASE_IRI = "https://example.org/ontology";

// --- Deterministic id generator --------------------------------------------
// Ids are the only otherwise-random inputs in a build. To make `build()` a pure
// function of its options we derive a seeded generator from the `now` stamp: a
// fixed `now` reproduces the exact same ids, while distinct timestamps produce
// entirely fresh ids (so two calls never share any id).

function hashSeed(input: string): number {
  let h = 2166136261; // FNV-1a 32-bit
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32) seeded from an integer. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Produce a v4-shaped UUID from the next seeded draw. */
function uuidFromRandom(rand: () => number): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Math.floor(rand() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface BuildContext {
  /** Next deterministic id in the build's sequence. */
  nextId: () => string;
  /** Fixed creation timestamp used across every built entity. */
  now: string;
}

// --- Builder helpers (mirroring sample.ts style) ----------------------------

interface AttributeOptions {
  required?: boolean;
  cardinality?: AttributeCardinality;
  description?: string;
  enumValues?: string[];
}

function attribute(
  ctx: BuildContext,
  name: string,
  label: string,
  datatype: Datatype,
  options: AttributeOptions = {}
): OntologyAttribute {
  return createAttribute({
    id: ctx.nextId(),
    name,
    label,
    datatype,
    required: options.required ?? false,
    cardinality: options.cardinality ?? "one",
    description: options.description ?? "",
    enumValues: options.enumValues ?? []
  });
}

function ontologyClass(
  ctx: BuildContext,
  name: string,
  label: string,
  description: string,
  parentId: string | null,
  colorIndex: number,
  attributes: OntologyAttribute[]
): OntologyClass {
  return createClass({
    id: ctx.nextId(),
    name,
    label,
    description,
    parentId,
    color: PALETTE[colorIndex % PALETTE.length],
    attributes
  });
}

function relation(
  ctx: BuildContext,
  name: string,
  label: string,
  description: string,
  sourceClassId: string,
  targetClassId: string,
  cardinality: RelationCardinality
): OntologyRelation {
  return createRelation({
    id: ctx.nextId(),
    name,
    label,
    description,
    sourceClassId,
    targetClassId,
    cardinality
  });
}

interface BuildArgs {
  now?: string;
  nameOverride?: string;
  baseIriOverride?: string;
}

function startContext(now?: string): BuildContext {
  const timestamp = now ?? new Date().toISOString();
  const rand = mulberry32(hashSeed(timestamp));
  return {
    nextId: () => uuidFromRandom(rand),
    now: timestamp
  };
}

interface Catalog {
  classes: OntologyClass[];
  relations: OntologyRelation[];
}

interface BuildConfig {
  id: string;
  name: string;
  catalog: (ctx: BuildContext) => Catalog;
}

function assemble(
  config: BuildConfig,
  description: string,
  options: TemplateBuildOptions = {}
): Ontology {
  const ctx = startContext(options.now);
  const name = options.nameOverride ?? config.name;
  const base = createOntology({
    name,
    description,
    version: "0.1.0",
    baseIri: options.baseIriOverride ?? `${DEFAULT_BASE_IRI}/${config.id}`,
    id: ctx.nextId(),
    now: ctx.now
  });

  const { classes, relations } = config.catalog(ctx);
  return autoLayout({ ...base, classes, relations });
}

// --- Pizza (Learning) -------------------------------------------------------

function buildPizza(ctx: BuildContext): Catalog {
  const pizza = ontologyClass(
    ctx,
    "Pizza",
    "Pizza",
    "A baked dish of dough, sauce and toppings.",
    null,
    0,
    [
      attribute(ctx, "name", "Name", "string", {
        required: true,
        description: "Display name of the pizza."
      }),
      attribute(ctx, "sizeInches", "Size (inches)", "integer", {
        description: "Diameter in inches."
      })
    ]
  );

  const vegetarianPizza = ontologyClass(
    ctx,
    "VegetarianPizza",
    "Vegetarian Pizza",
    "A pizza containing only vegetarian ingredients.",
    pizza.id,
    1,
    []
  );

  const meatPizza = ontologyClass(
    ctx,
    "MeatPizza",
    "Meat Pizza",
    "A pizza that includes at least one meat topping.",
    pizza.id,
    2,
    []
  );

  const cheesePizza = ontologyClass(
    ctx,
    "CheesePizza",
    "Cheese Pizza",
    "A pizza with a cheese-based topping selection.",
    pizza.id,
    3,
    []
  );

  const pizzaBase = ontologyClass(
    ctx,
    "PizzaBase",
    "Pizza Base",
    "The dough layer a pizza is built on.",
    null,
    4,
    [
      attribute(ctx, "thickness", "Thickness", "string", {
        enumValues: ["thin", "thick", "deep-dish"],
        required: true,
        description: "Style of the base."
      })
    ]
  );

  const pizzaTopping = ontologyClass(
    ctx,
    "PizzaTopping",
    "Pizza Topping",
    "An ingredient applied on top of a pizza base.",
    null,
    5,
    [
      attribute(ctx, "vegetarian", "Vegetarian", "boolean", {
        description: "Whether the topping is vegetarian."
      })
    ]
  );

  const topping = ontologyClass(
    ctx,
    "Topping",
    "Topping",
    "A concrete topping ingredient such as pepperoni or mushroom.",
    pizzaTopping.id,
    6,
    [
      attribute(ctx, "cheeseType", "Cheese type", "string", {
        enumValues: ["mozzarella", "parmesan", "cheddar", "vegan"],
        description: "Kind of cheese, where relevant."
      })
    ]
  );

  const relations: OntologyRelation[] = [
    relation(
      ctx,
      "hasBase",
      "has base",
      "Links a pizza to the base it is built on.",
      pizza.id,
      pizzaBase.id,
      "one-to-one"
    ),
    relation(
      ctx,
      "hasTopping",
      "has topping",
      "Links a pizza to the toppings it includes.",
      pizza.id,
      pizzaTopping.id,
      "one-to-many"
    ),
    relation(
      ctx,
      "excludesTopping",
      "excludes topping",
      "A vegetarian pizza forbids a given topping.",
      vegetarianPizza.id,
      topping.id,
      "many-to-many"
    )
  ];

  return {
    classes: [
      pizza,
      vegetarianPizza,
      meatPizza,
      cheesePizza,
      pizzaBase,
      pizzaTopping,
      topping
    ],
    relations
  };
}

// --- Supply chain (Industry) ------------------------------------------------

function buildSupplyChain(ctx: BuildContext): Catalog {
  const product = ontologyClass(
    ctx,
    "Product",
    "Product",
    "A manufactured good or item of traceability.",
    null,
    0,
    [
      attribute(ctx, "name", "Name", "string", {
        required: true,
        description: "Trade name of the product."
      })
    ]
  );

  const batch = ontologyClass(
    ctx,
    "Batch",
    "Batch",
    "A specific production lot of a product.",
    product.id,
    1,
    [
      attribute(ctx, "batchId", "Batch id", "string", {
        required: true,
        description: "Unique identifier for the lot."
      }),
      attribute(ctx, "producedAt", "Produced at", "dateTime", {
        description: "When the batch was produced."
      })
    ]
  );

  const party = ontologyClass(
    ctx,
    "Party",
    "Party",
    "A participant (person or organization) in the chain.",
    null,
    2,
    [
      attribute(ctx, "name", "Name", "string", {
        required: true,
        description: "Legal or display name."
      })
    ]
  );

  const location = ontologyClass(
    ctx,
    "Location",
    "Location",
    "A physical place a handling event occurs at.",
    null,
    3,
    [
      attribute(ctx, "latitude", "Latitude", "decimal", {
        description: "North-south coordinate."
      }),
      attribute(ctx, "longitude", "Longitude", "decimal", {
        description: "East-west coordinate."
      })
    ]
  );

  const handlingEvent = ontologyClass(
    ctx,
    "HandlingEvent",
    "Handling Event",
    "An action performed on a batch as it moves through the chain.",
    null,
    4,
    [
      attribute(ctx, "occurredAt", "Occurred at", "dateTime", {
        required: true,
        description: "When the event happened."
      }),
      attribute(ctx, "eventType", "Event type", "string", {
        enumValues: ["produce", "store", "transport", "receive", "retail"],
        required: true,
        description: "Kind of handling action."
      })
    ]
  );

  const sensorReading = ontologyClass(
    ctx,
    "SensorReading",
    "Sensor Reading",
    "A recorded measurement captured from a sensor.",
    null,
    5,
    [
      attribute(ctx, "temperatureC", "Temperature (C)", "decimal", {
        description: "Measured temperature in Celsius."
      }),
      attribute(ctx, "recordedAt", "Recorded at", "dateTime", {
        description: "When the reading was taken."
      })
    ]
  );

  const relations: OntologyRelation[] = [
    relation(
      ctx,
      "undergoes",
      "undergoes",
      "A batch passes through a handling event.",
      batch.id,
      handlingEvent.id,
      "one-to-many"
    ),
    relation(
      ctx,
      "performedBy",
      "performed by",
      "A handling event is carried out by a party.",
      handlingEvent.id,
      party.id,
      "many-to-one"
    ),
    relation(
      ctx,
      "atLocation",
      "at location",
      "A handling event occurs at a location.",
      handlingEvent.id,
      location.id,
      "many-to-one"
    ),
    relation(
      ctx,
      "trackedBy",
      "tracked by",
      "A batch is monitored by sensor readings.",
      batch.id,
      sensorReading.id,
      "one-to-many"
    )
  ];

  return {
    classes: [
      product,
      batch,
      party,
      location,
      handlingEvent,
      sensorReading
    ],
    relations
  };
}

// --- Education (Domain) -----------------------------------------------------

function buildEducation(ctx: BuildContext): Catalog {
  const person = ontologyClass(
    ctx,
    "Person",
    "Person",
    "A person in the school community.",
    null,
    0,
    [
      attribute(ctx, "email", "Email", "string", {
        required: true,
        description: "Contact email address."
      })
    ]
  );

  const student = ontologyClass(
    ctx,
    "Student",
    "Student",
    "A person enrolled in courses.",
    person.id,
    1,
    [
      attribute(ctx, "gradeLevel", "Grade level", "string", {
        enumValues: ["elementary", "middle", "high"],
        description: "Current school grade band."
      })
    ]
  );

  const teacher = ontologyClass(
    ctx,
    "Teacher",
    "Teacher",
    "A person who teaches courses.",
    person.id,
    2,
    [
      attribute(ctx, "roomNumber", "Room number", "string", {
        description: "Primary staff room."
      })
    ]
  );

  const course = ontologyClass(
    ctx,
    "Course",
    "Course",
    "A taught unit with a number of credits.",
    null,
    3,
    [
      attribute(ctx, "title", "Title", "string", {
        required: true,
        description: "Course name."
      }),
      attribute(ctx, "credits", "Credits", "integer", {
        required: true,
        description: "Credit points awarded."
      })
    ]
  );

  const classroom = ontologyClass(
    ctx,
    "Classroom",
    "Classroom",
    "A room where courses are held.",
    null,
    4,
    [
      attribute(ctx, "capacity", "Capacity", "integer", {
        description: "Number of seats."
      })
    ]
  );

  const enrollment = ontologyClass(
    ctx,
    "Enrollment",
    "Enrollment",
    "A record that a student is taking a course.",
    null,
    5,
    [
      attribute(ctx, "enrolledAt", "Enrolled at", "date", {
        description: "When the enrolment was recorded."
      })
    ]
  );

  const relations: OntologyRelation[] = [
    relation(
      ctx,
      "teaches",
      "teaches",
      "A teacher teaches a course.",
      teacher.id,
      course.id,
      "one-to-many"
    ),
    relation(
      ctx,
      "takes",
      "takes",
      "A student takes a course.",
      student.id,
      course.id,
      "many-to-many"
    ),
    relation(
      ctx,
      "heldIn",
      "held in",
      "A course is held in a classroom.",
      course.id,
      classroom.id,
      "many-to-one"
    )
  ];

  return {
    classes: [person, student, teacher, course, classroom, enrollment],
    relations
  };
}

// --- Library (Domain) -------------------------------------------------------

function buildLibrary(ctx: BuildContext): Catalog {
  const libraryItem = ontologyClass(
    ctx,
    "LibraryItem",
    "Library Item",
    "An item a library holds and lends.",
    null,
    0,
    [
      attribute(ctx, "title", "Title", "string", {
        required: true,
        description: "Title of the item."
      })
    ]
  );

  const book = ontologyClass(
    ctx,
    "Book",
    "Book",
    "A printed or electronic publication.",
    libraryItem.id,
    1,
    [
      attribute(ctx, "isbn", "ISBN", "string", {
        required: true,
        description: "International Standard Book Number."
      }),
      attribute(ctx, "publishedYear", "Published year", "integer", {
        description: "Year of publication."
      })
    ]
  );

  const magazine = ontologyClass(
    ctx,
    "Magazine",
    "Magazine",
    "A periodically published issue.",
    libraryItem.id,
    2,
    [
      attribute(ctx, "isbn", "ISBN", "string", {
        required: true,
        description: "Identifier of the issue."
      }),
      attribute(ctx, "publishedYear", "Published year", "integer", {
        description: "Year of publication."
      })
    ]
  );

  const author = ontologyClass(
    ctx,
    "Author",
    "Author",
    "A person who writes library items.",
    null,
    3,
    [
      attribute(ctx, "name", "Name", "string", {
        required: true,
        description: "Author's full name."
      })
    ]
  );

  const member = ontologyClass(
    ctx,
    "Member",
    "Member",
    "A library patron who can borrow items.",
    null,
    4,
    [
      attribute(ctx, "memberNumber", "Member number", "string", {
        required: true,
        description: "Library card identifier."
      })
    ]
  );

  const loan = ontologyClass(
    ctx,
    "Loan",
    "Loan",
    "A record of an item borrowed by a member.",
    null,
    5,
    [
      attribute(ctx, "dueDate", "Due date", "date", {
        required: true,
        description: "Date the item must be returned."
      })
    ]
  );

  const relations: OntologyRelation[] = [
    relation(
      ctx,
      "writtenBy",
      "written by",
      "A book is written by an author.",
      book.id,
      author.id,
      "many-to-many"
    ),
    relation(
      ctx,
      "borrows",
      "borrows",
      "A member borrows a loan record.",
      member.id,
      loan.id,
      "one-to-many"
    ),
    relation(
      ctx,
      "lends",
      "lends from",
      "A loan refers to a library item.",
      loan.id,
      libraryItem.id,
      "many-to-one"
    )
  ];

  return {
    classes: [libraryItem, book, magazine, author, member, loan],
    relations
  };
}

// --- Registry ---------------------------------------------------------------

const TEMPLATES: OntologyTemplate[] = [
  {
    id: "pizza",
    name: "Pizza",
    description:
      "The classic Protege tutorial: pizzas, bases and toppings with enums.",
    category: "Learning",
    tags: ["pizza", "toppings", "base", "protégé", "tutorial"],
    build: (options) =>
      assemble(
        {
          id: "pizza",
          name: "Pizza",
          catalog: buildPizza
        },
        "A classic Protege-style pizza model with bases, toppings and restrictions.",
        options
      )
  },
  {
    id: "supply-chain",
    name: "Supply Chain",
    description:
      "Traceability model with batches, parties, locations, events and sensors.",
    category: "Industry",
    tags: ["supply", "traceability", "logistics", "sensors", "industry"],
    build: (options) =>
      assemble(
        {
          id: "supply-chain",
          name: "Supply Chain",
          catalog: buildSupplyChain
        },
        "An industrial traceability model tracking batches through handling events.",
        options
      )
  },
  {
    id: "education",
    name: "Education",
    description:
      "A compact school domain: students, teachers, courses and classrooms.",
    category: "Domain",
    tags: ["school", "students", "teachers", "courses", "classroom"],
    build: (options) =>
      assemble(
        {
          id: "education",
          name: "Education",
          catalog: buildEducation
        },
        "A school domain with a shared Person root and enrolment relationships.",
        options
      )
  },
  {
    id: "library",
    name: "Library",
    description:
      "Catalogue and loans: items, books, magazines, authors, members and loans.",
    category: "Domain",
    tags: ["library", "books", "loans", "catalogue", "authors"],
    build: (options) =>
      assemble(
        {
          id: "library",
          name: "Library",
          catalog: buildLibrary
        },
        "A library catalogue and loan model with borrow and lend relationships.",
        options
      )
  }
];

/** All templates in a fixed, stable order (pizza, supply-chain, education, library). */
export function createOntologyTemplates(): OntologyTemplate[] {
  return [...TEMPLATES];
}

/** Find a template by id, or `undefined` when absent. */
export function findOntologyTemplate(id: string): OntologyTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

/**
 * Build a fresh ontology from a named template. Shorthand for
 * `findOntologyTemplate(id)?.build(options)`.
 *
 * @throws RangeError when the id is unknown.
 */
export function createOntologyFromTemplate(
  id: string,
  options?: TemplateBuildOptions
): Ontology {
  const template = findOntologyTemplate(id);
  if (!template) {
    throw new RangeError(`Unknown ontology template "${id}".`);
  }
  return template.build(options);
}