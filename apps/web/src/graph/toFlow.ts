import type {
  Datatype,
  Ontology,
  RelationCardinality
} from "@onto/core";
import type { Edge, Node } from "@xyflow/react";
import type { Selection } from "../state/types";

/** One attribute rendered inside a class node's preview list. */
export interface AttributePreview {
  id: string;
  label: string;
  datatype: Datatype;
  required: boolean;
}

export type ClassNodeData = {
  label: string;
  name: string;
  description: string;
  color: string;
  attributeCount: number;
  attributePreview: AttributePreview[];
  parentLabel: string | null;
};

export type ClassFlowNode = Node<ClassNodeData, "classNode">;

export type RelationEdgeData = {
  cardinality: RelationCardinality;
  relationId: string;
};

export type RelationFlowEdge = Edge<RelationEdgeData, "relationEdge">;

export interface FlowModel {
  nodes: ClassFlowNode[];
  edges: RelationFlowEdge[];
}

const MAX_ATTRIBUTE_PREVIEW = 3;

/**
 * Pure projection of the ontology aggregate onto React Flow's node/edge model.
 * Selection is passed in rather than stored here so this stays a pure function.
 */
export function toFlow(ontology: Ontology, selected: Selection): FlowModel {
  const labelById = new Map(ontology.classes.map((ontologyClass) => [ontologyClass.id, ontologyClass.label]));
  const classIds = new Set(labelById.keys());

  const nodes: ClassFlowNode[] = ontology.classes.map((ontologyClass) => ({
    id: ontologyClass.id,
    type: "classNode",
    position: { ...ontologyClass.position },
    selected: selected?.kind === "class" && selected.id === ontologyClass.id,
    data: {
      label: ontologyClass.label,
      name: ontologyClass.name,
      description: ontologyClass.description,
      color: ontologyClass.color,
      attributeCount: ontologyClass.attributes.length,
      attributePreview: ontologyClass.attributes.slice(0, MAX_ATTRIBUTE_PREVIEW).map((attribute) => ({
        id: attribute.id,
        label: attribute.label,
        datatype: attribute.datatype,
        required: attribute.required
      })),
      parentLabel: ontologyClass.parentId ? (labelById.get(ontologyClass.parentId) ?? null) : null
    }
  }));

  const edges: RelationFlowEdge[] = ontology.relations
    .filter((relation) => classIds.has(relation.sourceClassId) && classIds.has(relation.targetClassId))
    .map((relation) => {
      const isSelected = selected?.kind === "relation" && selected.id === relation.id;
      return {
        id: relation.id,
        type: "relationEdge",
        source: relation.sourceClassId,
        target: relation.targetClassId,
        label: relation.label,
        selected: isSelected,
        animated: isSelected,
        data: { cardinality: relation.cardinality, relationId: relation.id }
      };
    });

  return { nodes, edges };
}
