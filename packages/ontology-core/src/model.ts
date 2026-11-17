/**
 * Domain model: factories, immutable mutations, queries and layout helpers.
 *
 * Everything in this module is pure: no I/O, no clocks beyond what the caller
 * injects, no global mutable state. Mutations return new aggregates and only
 * allocate copies of the pieces they touch.
 */

import type {
  AttributeCardinality,
  Datatype,
  Ontology,
  OntologyAttribute,
  OntologyClass,
  OntologyRelation,
  OntologySummary,
  Position,
  RelationCardinality
} from "./types";
import {
  PALETTE,
  newId,
  slugify,
  suggestAttributeName,
  suggestClassName,
  suggestRelationName,
  titleCase
} from "./naming";

/** Input accepted by {@link createOntology}. */
export interface CreateOntologyInput {
  name: string;
  description?: string;
  version?: string;
  baseIri?: string;
  /** Injected id for deterministic tests; random UUID otherwise. */
  id?: string;
  /** Injected creation time for deterministic tests; ISO string or Date. */
  now?: string | Date;
}

/** Input accepted by {@link createClass}. */
export interface CreateClassInput {
  label?: string;
  name?: string;
  description?: string;
  parentId?: string | null;
  color?: string;
  attributes?: OntologyAttribute[];
  position?: Position;
  /** Injected id for deterministic tests; random UUID otherwise. */
  id?: string;
}

/** Input accepted by {@link createAttribute}. */
export interface CreateAttributeInput {
  name?: string;
  label?: string;
  datatype?: Datatype;
  required?: boolean;
  cardinality?: AttributeCardinality;
  description?: string;
  enumValues?: string[];
  /** Injected id for deterministic tests; random UUID otherwise. */
  id?: string;
}

/** Input accepted by {@link createRelation}. */
export interface CreateRelationInput {
  label?: string;
  name?: string;
  sourceClassId: string;
  targetClassId: string;
  cardinality?: RelationCardinality;
  description?: string;
  /** Injected id for deterministic tests; random UUID otherwise. */
  id?: string;
}

const DEFAULT_BASE_IRI_ORIGIN = "https://example.org/ontology";
const DEFAULT_VERSION = "0.1.0";

function isoNow(now?: string | Date): string {
  if (now instanceof Date) {
    return now.toISOString();
  }
  if (typeof now === "string" && now.length > 0) {
    const parsed = new Date(now);
    return Number.isNaN(parsed.getTime()) ? now : parsed.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Create an empty ontology aggregate.
 *
 * Defaults: random UUID id, version `0.1.0`, base IRI
 * `https://example.org/ontology/<slug(name)>`, `createdAt = updatedAt = now`,
 * empty description, classes and relations.
 */
export function createOntology(input: CreateOntologyInput): Ontology {
  const timestamp = isoNow(input.now);
  const slug = slugify(input.name) || "ontology";
  return {
    id: input.id ?? newId(),
    name: input.name,
    description: input.description ?? "",
    version: input.version ?? DEFAULT_VERSION,
    baseIri: input.baseIri ?? `${DEFAULT_BASE_IRI_ORIGIN}/${slug}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    classes: [],
    relations: []
  };
}

/**
 * Create a class entity.
 *
 * Defaults: random UUID id, name suggested from the label, trimmed label,
 * empty description, no parent, first PALETTE colour, no attributes and
 * `{ x: 0, y: 0 }` position.
 */
export function createClass(input: CreateClassInput): OntologyClass {
  const label = (input.label ?? input.name ?? "").trim();
  return {
    id: input.id ?? newId(),
    name: input.name?.trim() || suggestClassName(label),
    label,
    description: input.description ?? "",
    parentId: input.parentId ?? null,
    color: input.color ?? PALETTE[0],
    attributes: [...(input.attributes ?? [])],
    position: input.position
      ? { x: input.position.x, y: input.position.y }
      : { x: 0, y: 0 }
  };
}

/**
 * Create a datatype attribute.
 *
 * Defaults: random UUID id, camelCase name, title-cased label, `string`
 * datatype, not required, cardinality `one`, empty description and enum.
 */
export function createAttribute(input: CreateAttributeInput): OntologyAttribute {
  const name = input.name?.trim() || suggestAttributeName(input.label ?? "");
  return {
    id: input.id ?? newId(),
    name,
    label: input.label !== undefined ? input.label.trim() : titleCase(name),
    datatype: input.datatype ?? "string",
    required: input.required ?? false,
    cardinality: input.cardinality ?? "one",
    description: input.description ?? "",
    enumValues: [...(input.enumValues ?? [])]
  };
}

/**
 * Create an object property between two classes.
 *
 * Defaults: random UUID id, camelCase name, trimmed label, empty description
 * and `many-to-many` cardinality.
 */
export function createRelation(input: CreateRelationInput): OntologyRelation {
  const label = (input.label ?? input.name ?? "").trim();
  return {
    id: input.id ?? newId(),
    name: input.name?.trim() || suggestRelationName(label),
    label,
    description: input.description ?? "",
    sourceClassId: input.sourceClassId,
    targetClassId: input.targetClassId,
    cardinality: input.cardinality ?? "many-to-many"
  };
}

function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) {
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}${suffix}`)) {
    suffix += 1;
  }
  return `${base}${suffix}`;
}

/** Suggest a class name that does not collide with any existing class name. */
export function suggestUniqueClassName(ontology: Ontology, label: string): string {
  return uniqueName(
    suggestClassName(label),
    ontology.classes.map((item) => item.name)
  );
}

/** Suggest an attribute name unique within one class (base name for a missing class). */
export function suggestUniqueAttributeName(
  ontology: Ontology,
  classId: string,
  label: string
): string {
  const owner = ontology.classes.find((item) => item.id === classId);
  return uniqueName(
    suggestAttributeName(label),
    (owner?.attributes ?? []).map((item) => item.name)
  );
}

/** Suggest a relation name that does not collide with any existing relation name. */
export function suggestUniqueRelationName(ontology: Ontology, label: string): string {
  return uniqueName(
    suggestRelationName(label),
    ontology.relations.map((item) => item.name)
  );
}

/** Clone `base` and copy every defined field listed in `keys` from `patch`. */
function copyDefined<T extends object>(
  base: T,
  patch: Partial<T>,
  keys: readonly (keyof T)[]
): T {
  const next: T = { ...base };
  for (const key of keys) {
    const value = patch[key];
    if (value !== undefined) {
      assignField(next, key, value);
    }
  }
  return next;
}

function assignField<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  target[key] = value;
}

function touch(ontology: Ontology, changes: Partial<Ontology>): Ontology {
  return { ...ontology, ...changes, updatedAt: new Date().toISOString() };
}

const CLASS_PATCH_KEYS: readonly (keyof OntologyClass)[] = [
  "name",
  "label",
  "description",
  "parentId",
  "color",
  "position"
];

/** Append a class; bumps `updatedAt`. */
export function addClass(ontology: Ontology, ontologyClass: OntologyClass): Ontology {
  return touch(ontology, { classes: [...ontology.classes, ontologyClass] });
}

/**
 * Patch a class. `id` and `attributes` cannot be changed through a patch.
 * Unknown ids are a no-op that returns the input aggregate unchanged.
 */
export function updateClass(
  ontology: Ontology,
  classId: string,
  patch: Partial<OntologyClass>
): Ontology {
  const index = ontology.classes.findIndex((item) => item.id === classId);
  const existing = index >= 0 ? ontology.classes[index] : undefined;
  if (!existing) {
    return ontology;
  }
  const updated = copyDefined(existing, patch, CLASS_PATCH_KEYS);
  const classes = [...ontology.classes];
  classes[index] = updated;
  return touch(ontology, { classes });
}

/**
 * Remove a class, cascade-delete relations that reference it and reparent its
 * direct children to the removed class's parent. Unknown ids are a no-op.
 */
export function removeClass(ontology: Ontology, classId: string): Ontology {
  const target = ontology.classes.find((item) => item.id === classId);
  if (!target) {
    return ontology;
  }
  const classes = ontology.classes
    .filter((item) => item.id !== classId)
    .map((item) =>
      item.parentId === classId ? { ...item, parentId: target.parentId } : item
    );
  const relations = ontology.relations.filter(
    (item) => item.sourceClassId !== classId && item.targetClassId !== classId
  );
  return touch(ontology, { classes, relations });
}

/** Move a class on the canvas. Unknown ids are a no-op. */
export function setClassPosition(
  ontology: Ontology,
  classId: string,
  position: Position
): Ontology {
  const index = ontology.classes.findIndex((item) => item.id === classId);
  if (index < 0) {
    return ontology;
  }
  const classes = [...ontology.classes];
  const existing = classes[index];
  if (!existing) {
    return ontology;
  }
  classes[index] = { ...existing, position: { x: position.x, y: position.y } };
  return touch(ontology, { classes });
}

const ATTRIBUTE_PATCH_KEYS: readonly (keyof OntologyAttribute)[] = [
  "name",
  "label",
  "datatype",
  "required",
  "cardinality",
  "description",
  "enumValues"
];

const RELATION_PATCH_KEYS: readonly (keyof OntologyRelation)[] = [
  "name",
  "label",
  "description",
  "sourceClassId",
  "targetClassId",
  "cardinality"
];

const ONTOLOGY_PATCH_KEYS: readonly (keyof Ontology)[] = [
  "name",
  "description",
  "version",
  "baseIri"
];

/** Append an attribute to a class. Unknown class ids are a no-op. */
export function addAttribute(
  ontology: Ontology,
  classId: string,
  attribute: OntologyAttribute
): Ontology {
  const classIndex = ontology.classes.findIndex((item) => item.id === classId);
  const existing = classIndex >= 0 ? ontology.classes[classIndex] : undefined;
  if (!existing) {
    return ontology;
  }
  const classes = [...ontology.classes];
  classes[classIndex] = { ...existing, attributes: [...existing.attributes, attribute] };
  return touch(ontology, { classes });
}

/**
 * Patch an attribute; `id` cannot be changed. Unknown class or attribute ids
 * are a no-op that returns the input aggregate unchanged.
 */
export function updateAttribute(
  ontology: Ontology,
  classId: string,
  attributeId: string,
  patch: Partial<OntologyAttribute>
): Ontology {
  const classIndex = ontology.classes.findIndex((item) => item.id === classId);
  const existingClass = classIndex >= 0 ? ontology.classes[classIndex] : undefined;
  if (!existingClass) {
    return ontology;
  }
  const attributeIndex = existingClass.attributes.findIndex((item) => item.id === attributeId);
  const existingAttribute =
    attributeIndex >= 0 ? existingClass.attributes[attributeIndex] : undefined;
  if (!existingAttribute) {
    return ontology;
  }
  const updated = copyDefined(existingAttribute, patch, ATTRIBUTE_PATCH_KEYS);
  if (patch.enumValues !== undefined) {
    updated.enumValues = [...patch.enumValues];
  }
  const attributes = [...existingClass.attributes];
  attributes[attributeIndex] = updated;
  const classes = [...ontology.classes];
  classes[classIndex] = { ...existingClass, attributes };
  return touch(ontology, { classes });
}

/** Remove an attribute. Unknown ids are a no-op. */
export function removeAttribute(
  ontology: Ontology,
  classId: string,
  attributeId: string
): Ontology {
  const classIndex = ontology.classes.findIndex((item) => item.id === classId);
  const existing = classIndex >= 0 ? ontology.classes[classIndex] : undefined;
  if (!existing) {
    return ontology;
  }
  const attributes = existing.attributes.filter((item) => item.id !== attributeId);
  if (attributes.length === existing.attributes.length) {
    return ontology;
  }
  const classes = [...ontology.classes];
  classes[classIndex] = { ...existing, attributes };
  return touch(ontology, { classes });
}

/** Append a relation; bumps `updatedAt`. */
export function addRelation(ontology: Ontology, relation: OntologyRelation): Ontology {
  return touch(ontology, { relations: [...ontology.relations, relation] });
}

/**
 * Patch a relation; `id` cannot be changed. Unknown ids are a no-op.
 */
export function updateRelation(
  ontology: Ontology,
  relationId: string,
  patch: Partial<OntologyRelation>
): Ontology {
  const index = ontology.relations.findIndex((item) => item.id === relationId);
  const existing = index >= 0 ? ontology.relations[index] : undefined;
  if (!existing) {
    return ontology;
  }
  const updated = copyDefined(existing, patch, RELATION_PATCH_KEYS);
  const relations = [...ontology.relations];
  relations[index] = updated;
  return touch(ontology, { relations });
}

/** Remove a relation. Unknown ids are a no-op. */
export function removeRelation(ontology: Ontology, relationId: string): Ontology {
  const relations = ontology.relations.filter((item) => item.id !== relationId);
  if (relations.length === ontology.relations.length) {
    return ontology;
  }
  return touch(ontology, { relations });
}

/** Patch name/description/version/baseIri; identity and timestamps are immutable. */
export function updateOntologyMeta(
  ontology: Ontology,
  patch: Partial<Ontology>
): Ontology {
  return touch(ontology, copyDefined(ontology, patch, ONTOLOGY_PATCH_KEYS));
}

/** A class together with its nested children, for the sidebar tree. */
export interface ClassTreeNode {
  class: OntologyClass;
  children: ClassTreeNode[];
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareClasses(left: OntologyClass, right: OntologyClass): number {
  return (
    compareStrings(left.label, right.label) ||
    compareStrings(left.name, right.name) ||
    compareStrings(left.id, right.id)
  );
}

/** Find a class by id. */
export function findClass(ontology: Ontology, classId: string): OntologyClass | undefined {
  return ontology.classes.find((item) => item.id === classId);
}

/** Find an attribute by id across every class. */
export function findAttribute(
  ontology: Ontology,
  attributeId: string
): OntologyAttribute | undefined {
  for (const ontologyClass of ontology.classes) {
    const attribute = ontologyClass.attributes.find((item) => item.id === attributeId);
    if (attribute) {
      return attribute;
    }
  }
  return undefined;
}

/** Find a relation by id. */
export function findRelation(
  ontology: Ontology,
  relationId: string
): OntologyRelation | undefined {
  return ontology.relations.find((item) => item.id === relationId);
}

/** Direct children of a class, in class array order. */
export function classChildren(ontology: Ontology, classId: string): OntologyClass[] {
  return ontology.classes.filter((item) => item.parentId === classId);
}

/** Ancestors nearest-first, stopping before missing parents or cycles. */
export function classAncestors(ontology: Ontology, classId: string): OntologyClass[] {
  const byId = new Map(ontology.classes.map((item) => [item.id, item]));
  const ancestors: OntologyClass[] = [];
  const seen = new Set<string>([classId]);
  let current = byId.get(classId);
  if (!current) {
    return ancestors;
  }
  let parentId = current.parentId;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) {
      break;
    }
    ancestors.push(parent);
    seen.add(parentId);
    parentId = parent.parentId;
  }
  return ancestors;
}

function childrenByParentId(ontology: Ontology): Map<string, OntologyClass[]> {
  const groups = new Map<string, OntologyClass[]>();
  for (const ontologyClass of ontology.classes) {
    const parentId = ontologyClass.parentId;
    if (parentId === null) {
      continue;
    }
    const siblings = groups.get(parentId);
    if (siblings) {
      siblings.push(ontologyClass);
    } else {
      groups.set(parentId, [ontologyClass]);
    }
  }
  return groups;
}

/** All descendants depth-first, excluding the class itself and cycle-safe. */
export function classDescendants(ontology: Ontology, classId: string): OntologyClass[] {
  if (!findClass(ontology, classId)) {
    return [];
  }
  const groups = childrenByParentId(ontology);
  const descendants: OntologyClass[] = [];
  const visited = new Set<string>([classId]);
  const stack = [...(groups.get(classId) ?? [])].reverse();
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || visited.has(next.id)) {
      continue;
    }
    visited.add(next.id);
    descendants.push(next);
    const children = groups.get(next.id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index] as OntologyClass);
    }
  }
  return descendants;
}

/**
 * Build the sidebar forest. Roots are classes with no parent or a parent that
 * no longer exists; siblings are sorted by label, then name. A class already in
 * the current branch is never expanded again, so corrupt cycles cannot hang.
 */
export function buildClassTree(ontology: Ontology): ClassTreeNode[] {
  const byId = new Map(ontology.classes.map((item) => [item.id, item]));
  const groups = childrenByParentId(ontology);
  const roots: OntologyClass[] = [];
  for (const ontologyClass of ontology.classes) {
    const parentId = ontologyClass.parentId;
    if (parentId === null || !byId.has(parentId)) {
      roots.push(ontologyClass);
    }
  }
  roots.sort(compareClasses);
  for (const siblings of groups.values()) {
    siblings.sort(compareClasses);
  }
  const buildNode = (ontologyClass: OntologyClass, branch: ReadonlySet<string>): ClassTreeNode => {
    const node: ClassTreeNode = { class: ontologyClass, children: [] };
    const nextBranch = new Set(branch);
    nextBranch.add(ontologyClass.id);
    for (const child of groups.get(ontologyClass.id) ?? []) {
      if (nextBranch.has(child.id)) {
        continue;
      }
      node.children.push(buildNode(child, nextBranch));
    }
    return node;
  };
  return roots.map((root) => buildNode(root, new Set<string>()));
}

const LAYOUT_ORIGIN_X = 40;
const LAYOUT_ORIGIN_Y = 40;
const LAYOUT_COLUMN_WIDTH = 320;
const LAYOUT_ROW_HEIGHT = 180;

/**
 * Deterministic left-to-right inheritance layout:
 * `x = 40 + depth * 320`, `y = 40 + indexWithinDepth * 180`, where depth is the
 * number of existing ancestors and classes at the same depth are ordered by name.
 */
export function autoLayout(ontology: Ontology): Ontology {
  const byId = new Map(ontology.classes.map((item) => [item.id, item]));
  const depthCache = new Map<string, number>();
  const depthOf = (classId: string): number => {
    const cached = depthCache.get(classId);
    if (cached !== undefined) {
      return cached;
    }
    const seen = new Set<string>([classId]);
    let depth = 0;
    let current = byId.get(classId);
    while (current && current.parentId !== null && !seen.has(current.parentId)) {
      const parent = byId.get(current.parentId);
      if (!parent) {
        break;
      }
      seen.add(current.parentId);
      depth += 1;
      current = parent;
    }
    depthCache.set(classId, depth);
    return depth;
  };

  const groups = new Map<number, OntologyClass[]>();
  for (const ontologyClass of ontology.classes) {
    const depth = depthOf(ontologyClass.id);
    const group = groups.get(depth);
    if (group) {
      group.push(ontologyClass);
    } else {
      groups.set(depth, [ontologyClass]);
    }
  }

  const positions = new Map<string, Position>();
  const depths = [...groups.keys()].sort((left, right) => left - right);
  for (const depth of depths) {
    const group = groups.get(depth) ?? [];
    group.sort(
      (left, right) => compareStrings(left.name, right.name) || compareStrings(left.id, right.id)
    );
    group.forEach((ontologyClass, indexWithinDepth) => {
      positions.set(ontologyClass.id, {
        x: LAYOUT_ORIGIN_X + depth * LAYOUT_COLUMN_WIDTH,
        y: LAYOUT_ORIGIN_Y + indexWithinDepth * LAYOUT_ROW_HEIGHT
      });
    });
  }

  return {
    ...ontology,
    classes: ontology.classes.map((ontologyClass) => {
      const position = positions.get(ontologyClass.id);
      return position ? { ...ontologyClass, position: { ...position } } : ontologyClass;
    })
  };
}

/** Lightweight projection used by the ontology picker. */
export function summarizeOntology(ontology: Ontology): OntologySummary {
  return {
    id: ontology.id,
    name: ontology.name,
    description: ontology.description,
    version: ontology.version,
    classCount: ontology.classes.length,
    relationCount: ontology.relations.length,
    updatedAt: ontology.updatedAt
  };
}

/** Absolute IRI for a local name under the ontology base IRI. */
export function iriFor(ontology: Ontology, localName: string): string {
  return `${ontology.baseIri}#${localName}`;
}
