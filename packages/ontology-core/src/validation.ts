/**
 * Structural and semantic validation for one ontology aggregate.
 *
 * The report is deterministic: ontology-level issues first, then classes in
 * array order (class issues followed by its attribute issues), then relations
 * in array order.
 */

import type {
  EntityKind,
  IssueCode,
  IssueSeverity,
  Ontology,
  OntologyClass,
  ValidationIssue,
  ValidationReport
} from "./types";

const CLASS_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

function makeIssue(
  severity: IssueSeverity,
  code: IssueCode,
  message: string,
  entity: EntityKind,
  entityId: string,
  ownerId?: string
): ValidationIssue {
  const issue: ValidationIssue = { severity, code, message, entity, entityId };
  if (ownerId !== undefined) {
    issue.ownerId = ownerId;
  }
  return issue;
}

function hasValidBaseIri(baseIri: string): boolean {
  if (!/^https?:\/\//i.test(baseIri)) {
    return false;
  }
  if (/\s/.test(baseIri)) {
    return false;
  }
  return !baseIri.endsWith("#");
}

function finish(issues: ValidationIssue[]): ValidationReport {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === "error") {
      errors += 1;
    } else {
      warnings += 1;
    }
  }
  return { ok: errors === 0, issues, errors, warnings };
}

function classById(classes: readonly OntologyClass[]): Map<string, OntologyClass> {
  const byId = new Map<string, OntologyClass>();
  for (const ontologyClass of classes) {
    if (!byId.has(ontologyClass.id)) {
      byId.set(ontologyClass.id, ontologyClass);
    }
  }
  return byId;
}

/**
 * Find inheritance cycles in the single-parent graph. Returns a map from every
 * class id that participates in a cycle (length >= 2) to its cycle members.
 * Self-inheritance is validated separately.
 */
function findInheritanceCycles(
  classes: readonly OntologyClass[],
  byId: ReadonlyMap<string, OntologyClass>
): Map<string, OntologyClass[]> {
  const state = new Map<string, 1 | 2>();
  const cycles = new Map<string, OntologyClass[]>();
  for (const start of classes) {
    if (state.has(start.id)) {
      continue;
    }
    const path: string[] = [];
    const indexInPath = new Map<string, number>();
    let currentId: string | null = start.id;
    while (currentId !== null && !state.has(currentId) && byId.has(currentId)) {
      state.set(currentId, 1);
      indexInPath.set(currentId, path.length);
      path.push(currentId);
      currentId = byId.get(currentId)?.parentId ?? null;
    }
    if (currentId !== null && state.get(currentId) === 1) {
      const cycleStart = indexInPath.get(currentId);
      if (cycleStart !== undefined) {
        const cycleIds = path.slice(cycleStart);
        if (cycleIds.length >= 2) {
          const members = cycleIds
            .map((id) => byId.get(id))
            .filter((item): item is OntologyClass => item !== undefined);
          for (const id of cycleIds) {
            cycles.set(id, members);
          }
        }
      }
    }
    for (const id of path) {
      state.set(id, 2);
    }
  }
  return cycles;
}

/** Human-readable cycle order, starting at the smallest id and following parents. */
function cycleNameOrder(
  members: readonly OntologyClass[],
  byId: ReadonlyMap<string, OntologyClass>
): string[] {
  const memberIds = new Set(members.map((item) => item.id));
  const startId = [...memberIds].sort()[0];
  if (startId === undefined) {
    return [];
  }
  const names: string[] = [];
  let currentId: string | null = startId;
  while (currentId !== null && memberIds.has(currentId)) {
    const current = byId.get(currentId);
    if (!current) {
      break;
    }
    names.push(current.name);
    currentId = current.parentId;
    if (currentId === startId) {
      break;
    }
  }
  return names;
}

/** Run every validation rule and collect a deterministic report. */
export function validateOntology(ontology: Ontology): ValidationReport {
  const issues: ValidationIssue[] = [];

  // --- Ontology-level ------------------------------------------------------
  if (ontology.classes.length === 0) {
    issues.push(
      makeIssue(
        "warning",
        "empty-ontology",
        "Ontology has no classes yet; add a class to start modelling.",
        "ontology",
        ontology.id
      )
    );
  }
  if (!hasValidBaseIri(ontology.baseIri)) {
    issues.push(
      makeIssue(
        "error",
        "invalid-base-iri",
        `Base IRI "${ontology.baseIri}" must be an absolute http(s) URL without whitespace or a trailing "#".`,
        "ontology",
        ontology.id
      )
    );
  }

  // --- Classes -------------------------------------------------------------
  const byId = classById(ontology.classes);
  const cycles = findInheritanceCycles(ontology.classes, byId);
  const seenNames = new Set<string>();
  const seenLabels = new Set<string>();
  for (const ontologyClass of ontology.classes) {
    if (seenNames.has(ontologyClass.name)) {
      issues.push(
        makeIssue(
          "error",
          "duplicate-class-name",
          `Duplicate class name "${ontologyClass.name}".`,
          "class",
          ontologyClass.id
        )
      );
    } else {
      seenNames.add(ontologyClass.name);
    }

    const normalizedLabel = ontologyClass.label.trim().toLowerCase();
    if (seenLabels.has(normalizedLabel)) {
      issues.push(
        makeIssue(
          "warning",
          "duplicate-class-label",
          `Duplicate class label "${ontologyClass.label.trim()}".`,
          "class",
          ontologyClass.id
        )
      );
    } else {
      seenLabels.add(normalizedLabel);
    }

    if (!CLASS_NAME_PATTERN.test(ontologyClass.name)) {
      issues.push(
        makeIssue(
          "error",
          "invalid-class-name",
          `Class name "${ontologyClass.name}" must start with a letter and contain only letters, digits and underscores.`,
          "class",
          ontologyClass.id
        )
      );
    }

    if (ontologyClass.label.trim().length === 0) {
      issues.push(
        makeIssue(
          "warning",
          "empty-class-label",
          `Class "${ontologyClass.name}" has an empty label.`,
          "class",
          ontologyClass.id
        )
      );
    }

    const parentId = ontologyClass.parentId;
    if (parentId !== null) {
      if (parentId === ontologyClass.id) {
        issues.push(
          makeIssue(
            "error",
            "self-inheritance",
            `Class "${ontologyClass.name}" cannot be its own parent.`,
            "class",
            ontologyClass.id
          )
        );
      } else if (!byId.has(parentId)) {
        issues.push(
          makeIssue(
            "error",
            "unknown-parent",
            `Class "${ontologyClass.name}" references unknown parent "${parentId}".`,
            "class",
            ontologyClass.id
          )
        );
      }
    }

    const cycle = cycles.get(ontologyClass.id);
    if (cycle) {
      const cycleIds = cycle.map((item) => item.id).sort();
      if (cycleIds[0] === ontologyClass.id) {
        const names = cycleNameOrder(cycle, byId);
        issues.push(
          makeIssue(
            "error",
            "inheritance-cycle",
            `Inheritance cycle detected: ${names.join(" -> ")} -> ${names[0] ?? ""}.`,
            "class",
            ontologyClass.id
          )
        );
      }
    }

    // --- Attributes (in declaration order, after the class's own issues) ---
    const seenAttributeNames = new Set<string>();
    for (const attribute of ontologyClass.attributes) {
      if (seenAttributeNames.has(attribute.name)) {
        issues.push(
          makeIssue(
            "error",
            "duplicate-attribute-name",
            `Duplicate attribute name "${attribute.name}" in class "${ontologyClass.name}".`,
            "attribute",
            attribute.id,
            ontologyClass.id
          )
        );
      } else {
        seenAttributeNames.add(attribute.name);
      }

      if (!CLASS_NAME_PATTERN.test(attribute.name)) {
        issues.push(
          makeIssue(
            "error",
            "invalid-attribute-name",
            `Attribute name "${attribute.name}" in class "${ontologyClass.name}" must start with a letter and contain only letters, digits and underscores.`,
            "attribute",
            attribute.id,
            ontologyClass.id
          )
        );
      }

      if (attribute.label.trim().length === 0) {
        issues.push(
          makeIssue(
            "warning",
            "empty-attribute-label",
            `Attribute "${attribute.name}" in class "${ontologyClass.name}" has an empty label.`,
            "attribute",
            attribute.id,
            ontologyClass.id
          )
        );
      }
    }
  }

  // --- Relations -----------------------------------------------------------
  const seenRelationNames = new Set<string>();
  for (const ontologyRelation of ontology.relations) {
    const sourceExists = byId.has(ontologyRelation.sourceClassId);
    const targetExists = byId.has(ontologyRelation.targetClassId);
    const relationOwnerId = sourceExists ? ontologyRelation.sourceClassId : undefined;

    if (seenRelationNames.has(ontologyRelation.name)) {
      issues.push(
        makeIssue(
          "error",
          "duplicate-relation-name",
          `Duplicate relation name "${ontologyRelation.name}".`,
          "relation",
          ontologyRelation.id,
          relationOwnerId
        )
      );
    } else {
      seenRelationNames.add(ontologyRelation.name);
    }

    if (ontologyRelation.label.trim().length === 0) {
      issues.push(
        makeIssue(
          "warning",
          "empty-relation-label",
          `Relation "${ontologyRelation.name}" has an empty label.`,
          "relation",
          ontologyRelation.id,
          relationOwnerId
        )
      );
    }

    if (!sourceExists) {
      issues.push(
        makeIssue(
          "error",
          "unknown-relation-source",
          `Relation "${ontologyRelation.name}" references unknown source class "${ontologyRelation.sourceClassId}".`,
          "relation",
          ontologyRelation.id
        )
      );
    }

    if (!targetExists) {
      issues.push(
        makeIssue(
          "error",
          "unknown-relation-target",
          `Relation "${ontologyRelation.name}" references unknown target class "${ontologyRelation.targetClassId}".`,
          "relation",
          ontologyRelation.id,
          relationOwnerId
        )
      );
    }

    if (
      sourceExists &&
      targetExists &&
      ontologyRelation.sourceClassId === ontologyRelation.targetClassId
    ) {
      const sourceClass = byId.get(ontologyRelation.sourceClassId);
      issues.push(
        makeIssue(
          "warning",
          "self-relation",
          `Relation "${ontologyRelation.name}" links class "${sourceClass?.name ?? ontologyRelation.sourceClassId}" to itself.`,
          "relation",
          ontologyRelation.id,
          ontologyRelation.sourceClassId
        )
      );
    }
  }

  return finish(issues);
}
