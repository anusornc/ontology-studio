import type { Ontology } from "@onto/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OntologyApi } from "../src/api/client";
import { NewOntologyDialog } from "../src/components/NewOntologyDialog";
import { OntologyStoreProvider } from "../src/state/context";
import { createOntologyStore, type OntologyStoreApi } from "../src/state/store";

// Stub the template registry and builder so the picker is deterministic without
// depending on @onto/core (implemented in parallel by templates-dev). The store
// reads these through its dynamic import of @onto/core.
vi.mock("@onto/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@onto/core")>();
  return {
    ...actual,
    createOntologyTemplates: vi.fn(() => [
      {
        id: "pizza",
        name: "Pizza",
        description: "The classic Protege tutorial ontology.",
        category: "Learning",
        tags: ["food", "pizza", "protege"]
      },
      {
        id: "supply-chain",
        name: "Supply chain",
        description: "Traceability across batches and handling events.",
        category: "Industry",
        tags: ["logistics", "supply"]
      },
      {
        id: "education",
        name: "Education",
        description: "A compact school domain.",
        category: "Domain",
        tags: ["school", "teaching"]
      }
    ]),
    createOntologyFromTemplate: vi.fn((templateId: string) => {
      const base = makeOntology({ name: "Template" });
      if (templateId === "pizza") {
        return {
          ...base,
          name: "Pizza",
          description: "Built from the pizza template",
          baseIri: "https://example.org/ontology/pizza",
          classes: [
            { ...base.classes[0]!, id: "c-pizza", name: "Pizza", label: "Pizza" },
            { ...base.classes[1]!, id: "c-topping", name: "PizzaTopping", label: "Pizza Topping" }
          ]
        };
      }
      return base;
    })
  };
});

const timestamp = "2026-01-01T00:00:00.000Z";

function makeOntology(overrides: Partial<Ontology> = {}): Ontology {
  return {
    id: "template-build",
    name: "University",
    description: "A sample ontology",
    version: "0.1.0",
    baseIri: "https://example.org/ontology/university",
    createdAt: timestamp,
    updatedAt: timestamp,
    classes: [
      {
        id: "person",
        name: "Person",
        label: "Person",
        description: "",
        parentId: null,
        color: "#22d3ee",
        attributes: [],
        position: { x: 80, y: 80 }
      },
      {
        id: "course",
        name: "Course",
        label: "Course",
        description: "",
        parentId: null,
        color: "#a78bfa",
        attributes: [],
        position: { x: 400, y: 80 }
      }
    ],
    relations: [],
    ...overrides
  };
}

function createFakeApi(): OntologyApi {
  return {
    listOntologies: vi.fn(async () => []),
    getOntology: vi.fn(async (id: string) => makeOntology({ id })),
    createOntology: vi.fn(async (input: { name: string }) => makeOntology({ id: "created-id", name: input.name })),
    saveOntology: vi.fn(async (value: Ontology) => value),
    deleteOntology: vi.fn(async () => undefined),
    validateOntology: vi.fn(async () => ({ ok: true, issues: [], errors: 0, warnings: 0 })),
    exportOntology: vi.fn(async () => ({ filename: "ontology.ttl", content: "" }))
  };
}

function renderDialog(onClose: () => void = vi.fn()) {
  const api = createFakeApi();
  const store: OntologyStoreApi = createOntologyStore(api);
  const view = render(
    <OntologyStoreProvider store={store}>
      <NewOntologyDialog onClose={onClose} />
    </OntologyStoreProvider>
  );
  return { api, store, onClose, ...view };
}

describe("NewOntologyDialog template picker", () => {
  it("defaults to the blank tab showing the name-input create flow", () => {
    renderDialog();

    expect(screen.getByTestId("template-tab-blank")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("input-ontology-name")).toBeInTheDocument();
    expect(screen.getByTestId("btn-create-ontology")).toBeInTheDocument();
    expect(screen.queryByTestId("template-grid")).not.toBeInTheDocument();
  });

  it("creates a blank ontology from the name input and closes the dialog", async () => {
    const user = userEvent.setup();
    const { api, onClose } = renderDialog();

    await user.type(screen.getByTestId("input-ontology-name"), "Research Lab");
    await user.click(screen.getByTestId("btn-create-ontology"));

    expect(api.createOntology).toHaveBeenCalledWith({ name: "Research Lab" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("switches to the templates tab and renders a card per template", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("template-tab-templates"));

    const grid = screen.getByTestId("template-grid");
    expect(grid).toBeInTheDocument();
    expect(screen.getByTestId("template-search")).toBeInTheDocument();
    expect(screen.getByTestId("template-card-pizza")).toHaveTextContent("Pizza");
    expect(screen.getByTestId("template-card-pizza")).toHaveTextContent(
      "The classic Protege tutorial ontology."
    );
    expect(screen.getByTestId("template-card-supply-chain")).toHaveTextContent("Supply chain");
    expect(screen.getByTestId("template-card-education")).toHaveTextContent("Education");
    expect(screen.getAllByRole("button", { name: /Use this template/ })).toHaveLength(3);
    expect(screen.queryByTestId("input-ontology-name")).not.toBeInTheDocument();
  });

  it("filters template cards by a search keyword", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("template-tab-templates"));
    await user.type(screen.getByTestId("template-search"), "supply");

    expect(screen.getByTestId("template-card-supply-chain")).toBeInTheDocument();
    expect(screen.queryByTestId("template-card-pizza")).not.toBeInTheDocument();
    expect(screen.queryByTestId("template-card-education")).not.toBeInTheDocument();
  });

  it("searches by tags and shows a friendly empty state when nothing matches", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("template-tab-templates"));
    await user.type(screen.getByTestId("template-search"), "protege");

    expect(screen.getByTestId("template-card-pizza")).toBeInTheDocument();

    await user.clear(screen.getByTestId("template-search"));
    await user.type(screen.getByTestId("template-search"), "zzznope");

    expect(screen.queryAllByTestId(/template-card-/)).toHaveLength(0);
    expect(screen.getByText(/No templates match/i)).toBeInTheDocument();
  });

  it("creates and opens a template ontology when its use-template button is clicked", async () => {
    const user = userEvent.setup();
    const { api, store, onClose } = renderDialog();

    await user.click(screen.getByTestId("template-tab-templates"));
    await user.click(screen.getByTestId("btn-use-template-pizza"));

    expect(api.saveOntology).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(api.saveOntology).mock.calls[0]![0];
    expect(saved.name).toBe("Pizza");
    expect(saved.classes.map((c) => c.name)).toEqual(["Pizza", "PizzaTopping"]);

    const opened = store.getState().ontology;
    expect(opened?.name).toBe("Pizza");
    expect(opened?.classes).toHaveLength(2);
    expect(store.getState().selected).toBeNull();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps the blank tab create flow intact and cancel invokes onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog(onClose);

    await user.click(screen.getByTestId("template-tab-templates"));
    await user.click(screen.getByTestId("template-tab-blank"));
    expect(screen.getByTestId("input-ontology-name")).toBeInTheDocument();

    await user.click(screen.getByTestId("btn-cancel-new-ontology"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});