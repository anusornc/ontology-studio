import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { ClassFlowNode } from "../graph/toFlow";

/**
 * Custom React Flow node: coloured class card with label, attribute preview and
 * an inheritance hint. Handles are rendered source/right and target/left so the
 * E2E suite can drag between them.
 */
export function ClassNode({ id, data, selected }: NodeProps<ClassFlowNode>) {
  const hiddenAttributes = data.attributeCount - data.attributePreview.length;
  const style = { "--class-color": data.color } as CSSProperties;

  return (
    <div
      className={`class-node${selected ? " class-node--selected" : ""}`}
      data-testid={`node-${id}`}
      data-selected={selected ? "true" : "false"}
      style={style}
    >
      <Handle type="target" position={Position.Left} className="class-node__handle" />
      <div className="class-node__header">
        <span className="class-node__swatch" aria-hidden="true" />
        <span className="class-node__label" title={data.name}>
          {data.label.trim() || data.name}
        </span>
        <span className="class-node__count" title={`${data.attributeCount} attributes`}>
          {data.attributeCount}
        </span>
      </div>
      {data.parentLabel !== null && (
        <div className="class-node__extends">
          <span aria-hidden="true">↳</span> extends {data.parentLabel}
        </div>
      )}
      {data.attributePreview.length > 0 ? (
        <ul className="class-node__attributes">
          {data.attributePreview.map((attribute) => (
            <li key={attribute.id} className="class-node__attribute">
              <span className="class-node__attribute-name">
                {attribute.label.trim() || attribute.id}
                {attribute.required && <span className="class-node__required">*</span>}
              </span>
              <span className="class-node__datatype">{attribute.datatype}</span>
            </li>
          ))}
          {hiddenAttributes > 0 && (
            <li className="class-node__attribute class-node__attribute--more">
              +{hiddenAttributes} more
            </li>
          )}
        </ul>
      ) : (
        <div className="class-node__empty">No attributes</div>
      )}
      <Handle type="source" position={Position.Right} className="class-node__handle" />
    </div>
  );
}
