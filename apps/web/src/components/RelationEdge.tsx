import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps
} from "@xyflow/react";
import type { RelationFlowEdge } from "../graph/toFlow";

const CARDINALITY_LABEL: Record<string, string> = {
  "one-to-one": "1 : 1",
  "one-to-many": "1 : N",
  "many-to-one": "N : 1",
  "many-to-many": "N : N"
};

/** Custom relation edge: label chip plus a cardinality badge at the midpoint. */
export function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  selected,
  markerEnd
}: EdgeProps<RelationFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });
  const cardinality = data?.cardinality ?? "many-to-many";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`relation-edge${selected ? " relation-edge--selected" : ""}`}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-label nodrag nopan${selected ? " edge-label--selected" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          data-testid={`edge-${id}`}
        >
          <span className="edge-label__text">{label}</span>
          <span className="edge-label__cardinality">{CARDINALITY_LABEL[cardinality] ?? cardinality}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
