import { buildClassTree, type ClassTreeNode } from "@onto/core";
import { useMemo } from "react";
import { useOntologyStore } from "../state/context";

export interface ClassTreeProps {
  search: string;
}

function matches(search: string, label: string, name: string): boolean {
  return label.toLowerCase().includes(search) || name.toLowerCase().includes(search);
}

/** Keep a node when it matches or any descendant does; drop empty branches. */
function filterTree(nodes: ClassTreeNode[], search: string): ClassTreeNode[] {
  if (search.length === 0) return nodes;
  const result: ClassTreeNode[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children, search);
    if (matches(search, node.class.label, node.class.name)) {
      result.push({ ...node, children: node.children });
    } else if (children.length > 0) {
      result.push({ ...node, children });
    }
  }
  return result;
}

interface TreeNodeRowProps {
  node: ClassTreeNode;
  depth: number;
  selectedClassId: string | null;
}

function TreeNodeRow({ node, depth, selectedClassId }: TreeNodeRowProps) {
  const select = useOntologyStore((state) => state.select);
  const ontologyClass = node.class;
  const isSelected = selectedClassId === ontologyClass.id;
  const style = { paddingLeft: `${8 + depth * 14}px` };

  return (
    <li role="treeitem" aria-selected={isSelected} aria-expanded={node.children.length > 0 || undefined}>
      <button
        type="button"
        className={`tree-node${isSelected ? " tree-node--selected" : ""}`}
        data-testid={`tree-node-${ontologyClass.id}`}
        style={style}
        onClick={() => select({ kind: "class", id: ontologyClass.id })}
      >
        <span className="tree-node__swatch" style={{ background: ontologyClass.color }} aria-hidden="true" />
        <span className="tree-node__label">{ontologyClass.label.trim() || ontologyClass.name}</span>
        {ontologyClass.attributes.length > 0 && (
          <span className="tree-node__count" title={`${ontologyClass.attributes.length} attributes`}>
            {ontologyClass.attributes.length}
          </span>
        )}
      </button>
      {node.children.length > 0 && (
        <ul role="group" className="class-tree__group">
          {node.children.map((child) => (
            <TreeNodeRow key={child.class.id} node={child} depth={depth + 1} selectedClassId={selectedClassId} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Inheritance forest for the sidebar, including orphaned classes. */
export function ClassTree({ search }: ClassTreeProps) {
  const ontology = useOntologyStore((state) => state.ontology);
  const selected = useOntologyStore((state) => state.selected);
  const normalizedSearch = search.trim().toLowerCase();

  const nodes = useMemo(() => {
    if (!ontology) return [];
    return filterTree(buildClassTree(ontology), normalizedSearch);
  }, [ontology, normalizedSearch]);

  const selectedClassId = selected?.kind === "class" ? selected.id : null;
  const total = ontology?.classes.length ?? 0;

  return (
    <div className="class-tree" data-testid="class-tree" role="tree" aria-label="Class hierarchy">
      {nodes.length > 0 ? (
        <ul className="class-tree__root" role="group">
          {nodes.map((node) => (
            <TreeNodeRow key={node.class.id} node={node} depth={0} selectedClassId={selectedClassId} />
          ))}
        </ul>
      ) : (
        <div className="sidebar-empty">
          {total === 0
            ? "No classes yet. Add one to start modelling."
            : "No classes match your search."}
        </div>
      )}
    </div>
  );
}
