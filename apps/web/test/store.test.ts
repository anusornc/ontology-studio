import type { Ontology, OntologySummary, ValidationIssue, ValidationReport } from "@onto/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OntologyApi } from "../src/api/client";
import { createOntologyStore } from "../src/state/store";

// The store builds templates from @onto/core's createOntologyFromTemplate. Keep
// the real helpers but stub that one so tests never depend on the template
// registry being present in core. The dynamic import() in the store returns
// this same mocked module.
vi.mock("@onto/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@onto/core")>();
  return {
    ...actual,
    createOntologyFromTemplate: vi.fn(),
    createOntologyTemplates: vi.fn(() => [])
  };
});

function makeOntology(overrides: Partial<Ontology> = {}): Ontology {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return {
    id: "onto-1",
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
    relations: [
      {
        id: "rel-1",
        name: "enrolledIn",
        label: "enrolled in",
        description: "",
        sourceClassId: "person",
        targetClassId: "course",
        cardinality: "many-to-many"
      }
    ],
    ...overrides
  };
}

function summaryOf(ontology: Ontology): OntologySummary {
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

const report: ValidationReport = { ok: true, issues: [], errors: 0, warnings: 0 };

const duplicateIssue: ValidationIssue = {
  severity: "error",
  code: "duplicate-class-name",
  message: 'Duplicate class name "Person"',
  entity: "class",
  entityId: "course"
};

function createFakeApi(overrides: Partial<OntologyApi> = {}): OntologyApi {
  return {
    listOntologies: vi.fn(async () => []),
    getOntology: vi.fn(async (id: string) => makeOntology({ id })),
    createOntology: vi.fn(async (input: { name: string }) => makeOntology({ id: "created-id", name: input.name })),
    saveOntology: vi.fn(async (value: Ontology) => value),
    deleteOntology: vi.fn(async () => undefined),
    validateOntology: vi.fn(async () => report),
    exportOntology: vi.fn(async () => ({ filename: "ontology.ttl", content: "" })),
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createOntologyStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bootstraps into the empty state when no ontologies exist", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);

    expect(store.getState().booting).toBe(true);
    await store.getState().bootstrap();

    expect(store.getState()).toMatchObject({
      booting: false,
      summaries: [],
      ontology: null,
      selected: null,
      saveState: "idle",
      error: null
    });
    expect(api.getOntology).not.toHaveBeenCalled();
  });

  it("automatically opens the most recently updated ontology", async () => {
    const recent = makeOntology({ id: "onto-recent", name: "Recent" });
    const older = makeOntology({ id: "onto-older", name: "Older" });
    const api = createFakeApi({
      listOntologies: vi.fn(async () => [summaryOf(recent), summaryOf(older)]),
      getOntology: vi.fn(async (id: string) => (id === "onto-recent" ? recent : older))
    });
    const store = createOntologyStore(api);

    await store.getState().bootstrap();

    expect(api.getOntology).toHaveBeenCalledWith("onto-recent");
    expect(store.getState().ontology).toMatchObject({ id: "onto-recent", name: "Recent" });
    expect(store.getState().summaries).toHaveLength(2);
    expect(store.getState().booting).toBe(false);
  });

  it("reports a bootstrap failure without crashing", async () => {
    const api = createFakeApi({
      listOntologies: vi.fn(async () => {
        throw new Error("server offline");
      })
    });
    const store = createOntologyStore(api);

    await store.getState().bootstrap();

    expect(store.getState().booting).toBe(false);
    expect(store.getState().error).toContain("server offline");
    expect(store.getState().ontology).toBeNull();
  });

  it("creates a new ontology, opens it and prepends its summary", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);

    await expect(store.getState().createNewOntology("  Research Lab  ")).resolves.toBe(true);

    expect(api.createOntology).toHaveBeenCalledWith({ name: "Research Lab" });
    expect(store.getState().ontology).toMatchObject({ id: "created-id", name: "Research Lab" });
    expect(store.getState().summaries[0]).toMatchObject({ id: "created-id", classCount: 2 });
    expect(store.getState().saveState).toBe("idle");
    expect(store.getState().selected).toBeNull();
  });

  it("rejects a blank ontology name without calling the API", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);

    await expect(store.getState().createNewOntology("   ")).resolves.toBe(false);

    expect(api.createOntology).not.toHaveBeenCalled();
    expect(store.getState().error).toBeTruthy();
  });

  it("loads the sample ontology by creating then saving it", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);

    await store.getState().loadSample();

    expect(api.createOntology).toHaveBeenCalledTimes(1);
    expect(api.saveOntology).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(api.saveOntology).mock.calls[0]![0];
    expect(saved.classes.length).toBeGreaterThan(0);
    expect(saved.name.toLowerCase()).toContain("university");
    expect(store.getState().ontology?.classes.length).toBeGreaterThan(0);
    expect(store.getState().ontology?.id).toBe("created-id");
    expect(store.getState().saveState).toBe("idle");
  });

  it("opens an ontology by id and resets transient UI state", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);
    store.setState({ sidebarTab: "issues" });
    store.getState().select({ kind: "class", id: "person" });

    await store.getState().openOntology("onto-1");

    expect(store.getState().ontology?.id).toBe("onto-1");
    expect(store.getState().selected).toBeNull();
    expect(store.getState().sidebarTab).toBe("classes");
    expect(store.getState().issues).toBeNull();
    expect(store.getState().saveState).toBe("idle");
  });

  it("applies a pure mutation immediately and marks the document dirty", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api, { autoSaveMs: 600 });
    await store.getState().openOntology("onto-1");

    store.getState().mutate((ontology) => ({ ...ontology, name: "Renamed" }));

    expect(store.getState().ontology?.name).toBe("Renamed");
    expect(store.getState().saveState).toBe("dirty");
    expect(api.saveOntology).not.toHaveBeenCalled();
  });

  it("autosaves the latest document after the debounce window", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api, { autoSaveMs: 600 });
    await store.getState().openOntology("onto-1");

    store.getState().mutate((ontology) => ({ ...ontology, name: "Renamed" }));
    await vi.advanceTimersByTimeAsync(599);
    expect(api.saveOntology).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(api.saveOntology).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.saveOntology).mock.calls[0]![0].name).toBe("Renamed");
    expect(store.getState().saveState).toBe("idle");
  });

  it("debounces rapid edits into a single save", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api, { autoSaveMs: 600 });
    await store.getState().openOntology("onto-1");

    store.getState().mutate((ontology) => ({ ...ontology, name: "One" }));
    await vi.advanceTimersByTimeAsync(300);
    store.getState().mutate((ontology) => ({ ...ontology, name: "Two" }));
    await vi.advanceTimersByTimeAsync(300);
    expect(api.saveOntology).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);

    expect(api.saveOntology).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.saveOntology).mock.calls[0]![0].name).toBe("Two");
  });

  it("retains the dirty document after a save failure and lets a retry succeed", async () => {
    const api = createFakeApi({
      saveOntology: vi
        .fn<OntologyApi["saveOntology"]>()
        .mockRejectedValueOnce(new Error("disk full"))
        .mockImplementation(async (value: Ontology) => value)
    });
    const store = createOntologyStore(api, { autoSaveMs: 600 });
    await store.getState().openOntology("onto-1");

    store.getState().mutate((ontology) => ({ ...ontology, name: "Precious edit" }));
    await vi.advanceTimersByTimeAsync(600);

    expect(store.getState().saveState).toBe("error");
    expect(store.getState().ontology?.name).toBe("Precious edit");
    expect(store.getState().error).toContain("disk full");

    await expect(store.getState().save()).resolves.toBe(true);

    expect(api.saveOntology).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.saveOntology).mock.calls[1]![0].name).toBe("Precious edit");
    expect(store.getState().saveState).toBe("idle");
    expect(store.getState().ontology?.name).toBe("Precious edit");
  });

  it("exposes the saving status while a save request is in flight", async () => {
    const pending = deferred<Ontology>();
    const api = createFakeApi({ saveOntology: vi.fn(() => pending.promise) });
    const store = createOntologyStore(api, { autoSaveMs: 0 });
    await store.getState().openOntology("onto-1");
    store.getState().mutate((ontology) => ({ ...ontology, name: "In flight" }));

    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().saveState).toBe("saving");

    pending.resolve(makeOntology({ name: "In flight" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState().saveState).toBe("idle");
  });

  it("flushes the pending autosave before validating and opens the Issues tab", async () => {
    const order: string[] = [];
    const api = createFakeApi({
      saveOntology: vi.fn(async (value: Ontology) => {
        order.push("save");
        return value;
      }),
      validateOntology: vi.fn(async () => {
        order.push("validate");
        return { ok: false, issues: [duplicateIssue], errors: 1, warnings: 0 };
      })
    });
    const store = createOntologyStore(api, { autoSaveMs: 600 });
    await store.getState().openOntology("onto-1");
    store.getState().mutate((ontology) => ({ ...ontology, name: "Edited" }));

    await store.getState().validate();

    expect(order).toEqual(["save", "validate"]);
    expect(store.getState().issues).toEqual([duplicateIssue]);
    expect(store.getState().sidebarTab).toBe("issues");
  });

  it("shows a clean validation result as an empty issue list", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);
    await store.getState().openOntology("onto-1");

    await store.getState().validate();

    expect(store.getState().issues).toEqual([]);
    expect(store.getState().sidebarTab).toBe("issues");
  });

  it("deletes the open ontology and opens the next most recent one", async () => {
    const first = makeOntology({ id: "onto-first", name: "First" });
    const second = makeOntology({ id: "onto-second", name: "Second" });
    const api = createFakeApi({
      listOntologies: vi.fn(async () => [summaryOf(first), summaryOf(second)]),
      getOntology: vi.fn(async (id: string) => (id === "onto-second" ? second : first))
    });
    const store = createOntologyStore(api);
    await store.getState().bootstrap();
    expect(store.getState().ontology?.id).toBe("onto-first");

    await expect(store.getState().removeOntology("onto-first")).resolves.toBe(true);

    expect(api.deleteOntology).toHaveBeenCalledWith("onto-first");
    expect(store.getState().ontology?.id).toBe("onto-second");
    expect(store.getState().summaries.map((item) => item.id)).toEqual(["onto-second"]);
  });

  it("returns to the empty state when the last ontology is deleted", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);
    await store.getState().openOntology("onto-1");
    store.getState().select({ kind: "class", id: "person" });

    await store.getState().removeOntology("onto-1");

    expect(store.getState().ontology).toBeNull();
    expect(store.getState().selected).toBeNull();
    expect(store.getState().summaries).toEqual([]);
    expect(store.getState().saveState).toBe("idle");
  });

  it("selects entities and switches sidebar tabs", async () => {
    const store = createOntologyStore(createFakeApi());

    store.getState().select({ kind: "class", id: "person" });
    expect(store.getState().selected).toEqual({ kind: "class", id: "person" });

    store.getState().select({ kind: "relation", id: "rel-1" });
    expect(store.getState().selected).toEqual({ kind: "relation", id: "rel-1" });

    store.getState().setSidebarTab("relations");
    expect(store.getState().sidebarTab).toBe("relations");

    store.getState().select(null);
    expect(store.getState().selected).toBeNull();
  });

  it("ignores mutations when no ontology is open", () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);

    store.getState().mutate((ontology) => ({ ...ontology, name: "Nope" }));

    expect(store.getState().ontology).toBeNull();
    expect(store.getState().saveState).toBe("idle");
    expect(api.saveOntology).not.toHaveBeenCalled();
  });

  it("does not hit the API when saving a clean document", async () => {
    const api = createFakeApi();
    const store = createOntologyStore(api);
    await store.getState().openOntology("onto-1");

    await expect(store.getState().save()).resolves.toBe(true);

    expect(api.saveOntology).not.toHaveBeenCalled();
  });

  it("exposes the template registry on the store state", async () => {
    const templates = [
      { id: "pizza", name: "Pizza", description: "Protege classic", category: "Learning", tags: ["food"] },
      { id: "supply-chain", name: "Supply chain", description: "Traceability", category: "Industry", tags: ["logistics"] }
    ];
    const core = await import("@onto/core");
    vi.mocked(core.createOntologyTemplates).mockReturnValue(templates as never);

    const store = createOntologyStore(createFakeApi());

    expect(store.getState().templates).toEqual(templates);
  });

  it("creates and opens an ontology from a template, saving it and updating summaries", async () => {
    const templateDoc = makeOntology({
      id: "template-id",
      name: "Pizza",
      description: "Built from template",
      version: "0.1.0",
      baseIri: "https://example.org/ontology/pizza",
      classes: [makeOntology().classes[0]!]
    });
    const core = await import("@onto/core");
    vi.mocked(core.createOntologyFromTemplate).mockReturnValue(templateDoc);
    const api = createFakeApi();
    const store = createOntologyStore(api);

    await expect(store.getState().createFromTemplate("pizza")).resolves.toBe(true);

    expect(core.createOntologyFromTemplate).toHaveBeenCalledWith("pizza");
    expect(api.createOntology).toHaveBeenCalledWith({
      name: "Pizza",
      description: "Built from template",
      baseIri: "https://example.org/ontology/pizza",
      version: "0.1.0"
    });
    expect(api.saveOntology).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(api.saveOntology).mock.calls[0]![0];
    expect(saved.id).toBe("created-id");
    expect(saved.createdAt).toBe(templateDoc.createdAt);
    expect(saved.updatedAt).toBe(templateDoc.updatedAt);
    expect(store.getState().ontology?.id).toBe("created-id");
    expect(store.getState().ontology?.name).toBe("Pizza");
    expect(store.getState().ontology?.classes).toHaveLength(1);
    expect(store.getState().summaries[0]).toMatchObject({
      id: "created-id",
      name: "Pizza",
      classCount: 1
    });
    expect(store.getState().saveState).toBe("idle");
  });

  it("sets an error and returns false when creating from a template fails", async () => {
    const core = await import("@onto/core");
    vi.mocked(core.createOntologyFromTemplate).mockImplementation(() => {
      throw new Error("no such template");
    });
    const api = createFakeApi();
    const store = createOntologyStore(api);

    await expect(store.getState().createFromTemplate("nope")).resolves.toBe(false);

    expect(api.createOntology).not.toHaveBeenCalled();
    expect(store.getState().ontology).toBeNull();
    expect(store.getState().error).toContain("no such template");
  });
});
