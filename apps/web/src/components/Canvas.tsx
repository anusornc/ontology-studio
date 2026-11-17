import {
  addRelation,
  autoLayout,
  createRelation,
  setClassPosition,
  suggestUniqueRelationName
} from "@onto/core";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
  type OnNodesChange
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ClassFlowNode, RelationFlowEdge } from "../graph/toFlow";
import { toFlow } from "../graph/toFlow";
import { useOntologyStore } from "../state/context";
import { useCreateClass } from "../state/useClassCreation";
import { ClassNode } from "./ClassNode";
import { RelationEdge } from "./RelationEdge";

const nodeTypes = { classNode: ClassNode } as unknown as NodeTypes;
const edgeTypes = { relationEdge: RelationEdge } as unknown as EdgeTypes;

function CanvasInner() {
  const ontology = useOntologyStore((state) => state.ontology);
  const selected = useOntologyStore((state) => state.selected);
  const mutate = useOntologyStore((state) => state.mutate);
  const select = useOntologyStore((state) => state.select);
  const createClass = useCreateClass();
  const { fitView } = useReactFlow<ClassFlowNode, RelationFlowEdge>();

  const flow = useMemo(
    () => (ontology ? toFlow(ontology, selected) : { nodes: [], edges: [] }),
    [ontology, selected]
  );
  const [nodes, setNodes] = useState<ClassFlowNode[]>(flow.nodes);

  useEffect(() => {
    setNodes(flow.nodes);
  }, [flow]);

  useEffect(() => {
    if (!ontology || ontology.classes.length === 0) return;
    // jsdom (tests) may not implement requestAnimationFrame; fall back to a timer.
    // The DOM `setTimeout` overlaps with @types/node; normalise the handle to a number.
    const schedule: (callback: () => void) => number =
      typeof requestAnimationFrame === "function"
        ? (callback) => requestAnimationFrame(callback)
        : (callback) => setTimeout(callback, 0) as unknown as number;
    const cancel: (handle: number) => void =
      typeof cancelAnimationFrame === "function"
        ? (handle) => cancelAnimationFrame(handle)
        : (handle) => clearTimeout(handle);
    const handle = schedule(() => {
      void fitView({ padding: 0.25, maxZoom: 1 });
    });
    return () => cancel(handle);
  }, [ontology?.id, ontology?.classes.length, fitView]);

  const onNodesChange: OnNodesChange<ClassFlowNode> = useCallback(
    (changes) => {
      setNodes((current) =>
        changes.applyTo(current).map((node) => ({
          ...node,
          selected: selected?.kind === "class" && selected.id === node.id
        }))
      );
    },
    [selected]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceClassId = connection.source;
      const targetClassId = connection.target;
      let createdId: string | null = null;
      mutate((current) => {
        const relation = createRelation({
          label: "relates to",
          name: suggestUniqueRelationName(current, "relates to"),
          sourceClassId,
          targetClassId,
          cardinality: "many-to-many"
        });
        createdId = relation.id;
        return addRelation(current, relation);
      });
      if (createdId !== null) {
        select({ kind: "relation", id: createdId });
      }
    },
    [mutate, select]
  );

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest(".react-flow__node") || target.closest(".react-flow__edge")) return;
      if (!target.classList.contains("react-flow__pane")) return;
      createClass();
    },
    [createClass]
  );

  if (!ontology) return null;

  return (
    <section className="canvas" data-testid="canvas" aria-label="Ontology canvas" onDoubleClick={handleDoubleClick}>
      <ReactFlow<ClassFlowNode, RelationFlowEdge>
        nodes={nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={2}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_, node) => select({ kind: "class", id: node.id })}
        onEdgeClick={(_, edge) => select({ kind: "relation", id: edge.id })}
        onPaneClick={() => select(null)}
        onNodeDragStop={(_, node) =>
          mutate((current) => setClassPosition(current, node.id, node.position))
        }
        onConnect={handleConnect}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--canvas-dot)" />
        <MiniMap
          className="canvas__minimap"
          nodeColor={(node) => {
            const color = (node.data as { color?: string }).color;
            return typeof color === "string" ? color : "#22d3ee";
          }}
          maskColor="rgba(7, 12, 24, 0.72)"
          pannable
          zoomable
        />
        <Controls className="canvas__controls" showInteractive={false} />
        <Panel position="top-left" className="canvas__toolbar">
          <button
            type="button"
            className="btn btn--secondary btn--small"
            data-testid="btn-auto-layout"
            onClick={() => mutate((current) => autoLayout(current))}
          >
            Auto layout
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            data-testid="btn-fit-view"
            onClick={() => void fitView({ padding: 0.25, maxZoom: 1 })}
          >
            Fit view
          </button>
        </Panel>
      </ReactFlow>
      {ontology.classes.length === 0 && (
        <div className="canvas__empty" data-testid="empty-canvas-hint">
          <span className="canvas__empty-icon" aria-hidden="true">
            +
          </span>
          <p className="canvas__empty-title">This ontology is a blank canvas</p>
          <p className="canvas__empty-copy">
            Double-click anywhere, or use <strong>New class</strong> in the explorer, to add your
            first class.
          </p>
          <button type="button" className="btn btn--primary" data-testid="btn-add-first-class" onClick={createClass}>
            Add first class
          </button>
        </div>
      )}
    </section>
  );
}

/** React Flow canvas wrapped in its own provider so toolbar tools can call fitView. */
export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
