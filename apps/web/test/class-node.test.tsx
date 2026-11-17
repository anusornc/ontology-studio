import type { ClassFlowNode } from "../src/graph/toFlow";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassNode } from "../src/components/ClassNode";

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    Handle: ({ type, position }: { type: string; position: string }) => (
      <span data-handle-type={type} data-handle-position={position} />
    ),
    Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" }
  };
});

function makeProps(overrides: {
  id?: string;
  label?: string;
  name?: string;
  color?: string;
  parentLabel?: string | null;
  attributes?: Array<{ id: string; label: string; datatype: string; required: boolean }>;
  attributeCount?: number;
  selected?: boolean;
}) {
  const attributes = overrides.attributes ?? [];
  const data = {
    label: overrides.label ?? "Person",
    name: overrides.name ?? "Person",
    description: "",
    color: overrides.color ?? "#22d3ee",
    attributeCount: overrides.attributeCount ?? attributes.length,
    attributePreview: attributes,
    parentLabel: overrides.parentLabel ?? null
  };
  return {
    id: overrides.id ?? "person",
    type: "classNode" as const,
    data,
    selected: overrides.selected ?? false,
    draggable: true,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0
  } as unknown as Parameters<typeof ClassNode>[0];
}

describe("ClassNode", () => {
  it("renders the class label and the node test id", () => {
    render(<ClassNode {...makeProps({ id: "person", label: "Person" })} />);

    const node = screen.getByTestId("node-person");
    expect(node).toBeInTheDocument();
    expect(node).toHaveTextContent("Person");
  });

  it("falls back to the machine name when the label is blank", () => {
    render(<ClassNode {...makeProps({ label: "   ", name: "Person" })} />);
    expect(screen.getByTestId("node-person")).toHaveTextContent("Person");
  });

  it("previews attributes with their datatype and required marker", () => {
    render(
      <ClassNode
        {...makeProps({
          attributes: [
            { id: "a1", label: "Full name", datatype: "string", required: true },
            { id: "a2", label: "Age", datatype: "integer", required: false }
          ]
        })}
      />
    );

    const node = screen.getByTestId("node-person");
    expect(node).toHaveTextContent("Full name");
    expect(node).toHaveTextContent("string");
    expect(node).toHaveTextContent("Age");
    expect(node).toHaveTextContent("integer");
    expect(node).toHaveTextContent("*");
  });

  it("shows a +N more hint when attributes exceed the preview limit", () => {
    // Mirror toFlow: attributePreview is the truncated slice, attributeCount is the full count.
    const allAttributes = Array.from({ length: 6 }, (_, index) => ({
      id: `a${index}`,
      label: `Attribute ${index}`,
      datatype: "string",
      required: false
    }));
    const preview = allAttributes.slice(0, 3);
    render(
      <ClassNode {...makeProps({ attributes: preview, attributeCount: allAttributes.length })} />
    );

    expect(screen.getByTestId("node-person")).toHaveTextContent("+3 more");
    expect(screen.getByTestId("node-person")).not.toHaveTextContent("Attribute 4");
  });

  it("shows the inheritance hint only when the class has a parent", () => {
    const { rerender } = render(<ClassNode {...makeProps({ parentLabel: "Person" })} />);
    expect(screen.getByTestId("node-person")).toHaveTextContent("extends Person");

    rerender(<ClassNode {...makeProps({ parentLabel: null })} />);
    expect(screen.getByTestId("node-person")).not.toHaveTextContent("extends");
  });

  it("marks the selected class for ring styling", () => {
    render(<ClassNode {...makeProps({ selected: true })} />);
    const node = screen.getByTestId("node-person");
    expect(node).toHaveAttribute("data-selected", "true");
    expect(node.className).toContain("class-node--selected");
  });

  it("shows an empty state when the class has no attributes", () => {
    render(<ClassNode {...makeProps({})} />);
    expect(screen.getByTestId("node-person")).toHaveTextContent("No attributes");
  });

  it("renders a source and a target handle for connecting relations", () => {
    render(<ClassNode {...makeProps({})} />);
    const node = screen.getByTestId("node-person");
    expect(node.querySelector('[data-handle-type="target"]')).not.toBeNull();
    expect(node.querySelector('[data-handle-type="source"]')).not.toBeNull();
  });
});
