import type {
  Ontology,
  OntologySummary,
  OntologyTemplate,
  ValidationIssue
} from "@onto/core";
import { createOntologyTemplates, summarizeOntology } from "@onto/core";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { OntologyApi } from "../api/client";
import type { SaveState, Selection, SidebarTab } from "./types";

export interface OntologyStoreState {
  /** True while the initial summary list / document load is in flight. */
  booting: boolean;
  /** Picker projection of every stored ontology, most recent first. */
  summaries: OntologySummary[];
  /** The open aggregate document, or null for the cold-start empty state. */
  ontology: Ontology | null;
  selected: Selection;
  /** Latest server validation result; null until validation has run. */
  issues: ValidationIssue[] | null;
  sidebarTab: SidebarTab;
  saveState: SaveState;
  error: string | null;
  /** Bumped after creating a class so the inspector can focus its label field. */
  classLabelFocusToken: number;
  /** Ready-made starting ontologies offered by the template picker. */
  templates: OntologyTemplate[];
}

export interface OntologyStoreActions {
  /** Load summaries and auto-open the most recently updated ontology. */
  bootstrap(): Promise<void>;
  openOntology(id: string): Promise<void>;
  createNewOntology(name: string): Promise<boolean>;
  loadSample(): Promise<boolean>;
  /**
   * Build and open a brand-new ontology from a named template. Mirrors
   * `loadSample`: creates the document in core, persists it via the API, then
   * opens it. Returns false and records a store error on failure.
   */
  createFromTemplate(templateId: string): Promise<boolean>;
  /**
   * Apply a pure `@onto/core` mutation to the current document. The new
   * aggregate becomes the local source of truth immediately and schedules a
   * debounced autosave.
   */
  mutate(updater: (ontology: Ontology) => Ontology): void;
  /** Flush the debounced save immediately (also used as manual retry). */
  save(): Promise<boolean>;
  /** Flush pending edits, then run server validation and open the Issues tab. */
  validate(): Promise<void>;
  removeOntology(id: string): Promise<boolean>;
  select(selection: Selection): void;
  setSidebarTab(tab: SidebarTab): void;
  /** Ask the class inspector to focus its label input on the next render. */
  requestClassLabelFocus(): void;
}

export type OntologyStore = OntologyStoreState & OntologyStoreActions;

export type OntologyStoreApi = StoreApi<OntologyStore>;

export interface CreateOntologyStoreOptions {
  /** Debounce window for autosave. Defaults to 600ms per the UI contract. */
  autoSaveMs?: number;
}

const DEFAULT_AUTO_SAVE_MS = 600;

function errorMessage(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  return String(caught);
}

/**
 * Zustand vanilla store factory. The API client is injected so tests can drive
 * the entire state machine with an in-memory fake and no network.
 */
export function createOntologyStore(
  api: OntologyApi,
  options: CreateOntologyStoreOptions = {}
): OntologyStoreApi {
  const autoSaveMs = options.autoSaveMs ?? DEFAULT_AUTO_SAVE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  return createStore<OntologyStore>()((set, get) => {
    function clearTimer(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function upsertSummary(ontology: Ontology): void {
      const summary = summarizeOntology(ontology);
      const existing = get().summaries;
      const index = existing.findIndex((item) => item.id === summary.id);
      if (index >= 0) {
        const summaries = [...existing];
        summaries[index] = summary;
        set({ summaries });
        return;
      }
      set({ summaries: [summary, ...existing] });
    }

    function scheduleSave(): void {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void flushSave();
      }, autoSaveMs);
    }

    async function flushSave(): Promise<boolean> {
      clearTimer();
      if (!get().ontology) return true;
      if (get().saveState === "idle" && inFlight === null) return true;
      if (inFlight !== null) {
        await inFlight;
        if (get().saveState === "idle") return true;
      }
      const snapshot = get().ontology;
      if (!snapshot) return true;

      set({ saveState: "saving" });
      inFlight = (async () => {
        try {
          const saved = await api.saveOntology(snapshot);
          if (get().ontology === snapshot) {
            set({ ontology: saved, saveState: "idle", error: null });
          } else {
            // The user kept editing while the request was in flight.
            set({ saveState: "dirty" });
          }
          upsertSummary(saved);
        } catch (caught) {
          // Never discard the local document: keep it dirty behind the error
          // state so a retry can persist the exact same edits.
          set({ saveState: "error", error: `Save failed: ${errorMessage(caught)}` });
        }
      })();

      try {
        await inFlight;
      } finally {
        inFlight = null;
      }

      const state = get();
      if (state.saveState === "dirty" && state.ontology) {
        // Edits arrived during the request; persist the newest revision too.
        scheduleSave();
      }
      return get().saveState === "idle";
    }

    async function flushBeforeDocumentChange(): Promise<void> {
      if (get().saveState !== "idle" && get().ontology) {
        await flushSave();
      }
    }

    function resetForDocument(ontology: Ontology): void {
      clearTimer();
      set({
        ontology,
        selected: null,
        issues: null,
        sidebarTab: "classes",
        saveState: "idle",
        error: null
      });
    }

    return {
      booting: true,
      summaries: [],
      ontology: null,
      selected: null,
      issues: null,
      sidebarTab: "classes",
      saveState: "idle",
      error: null,
      classLabelFocusToken: 0,
      templates: createOntologyTemplates(),

      async bootstrap() {
        set({ booting: true, error: null });
        try {
          const summaries = await api.listOntologies();
          set({ summaries });
          const mostRecent = summaries[0];
          if (mostRecent) {
            await get().openOntology(mostRecent.id);
          }
          set({ booting: false });
        } catch (caught) {
          set({ booting: false, error: `Could not load ontologies: ${errorMessage(caught)}` });
        }
      },

      async openOntology(id) {
        await flushBeforeDocumentChange();
        try {
          const ontology = await api.getOntology(id);
          clearTimer();
          set({
            ontology,
            selected: null,
            issues: null,
            sidebarTab: "classes",
            saveState: "idle",
            error: null
          });
        } catch (caught) {
          set({ error: `Could not open ontology: ${errorMessage(caught)}` });
        }
      },

      async createNewOntology(name) {
        const trimmed = name.trim();
        if (trimmed.length === 0) {
          set({ error: "Ontology name is required" });
          return false;
        }
        await flushBeforeDocumentChange();
        try {
          const ontology = await api.createOntology({ name: trimmed });
          resetForDocument(ontology);
          upsertSummary(ontology);
          return true;
        } catch (caught) {
          set({ error: `Could not create ontology: ${errorMessage(caught)}` });
          return false;
        }
      },

      async loadSample() {
        await flushBeforeDocumentChange();
        try {
          const core = await import("@onto/core");
          const sample = core.createSampleOntology();
          const created = await api.createOntology({
            name: sample.name,
            description: sample.description,
            baseIri: sample.baseIri,
            version: sample.version
          });
          const saved = await api.saveOntology({
            ...sample,
            id: created.id,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt
          });
          resetForDocument(saved);
          upsertSummary(saved);
          return true;
        } catch (caught) {
          set({ error: `Could not load the sample ontology: ${errorMessage(caught)}` });
          return false;
        }
      },

      async createFromTemplate(templateId) {
        await flushBeforeDocumentChange();
        try {
          const core = await import("@onto/core");
          const template = core.createOntologyFromTemplate(templateId);
          const created = await api.createOntology({
            name: template.name,
            description: template.description,
            baseIri: template.baseIri,
            version: template.version
          });
          const saved = await api.saveOntology({
            ...template,
            id: created.id,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt
          });
          resetForDocument(saved);
          upsertSummary(saved);
          return true;
        } catch (caught) {
          set({ error: `Could not create from template: ${errorMessage(caught)}` });
          return false;
        }
      },

      mutate(updater) {
        const current = get().ontology;
        if (!current) return;
        const next = updater(current);
        if (next === current) return;
        set({ ontology: next, saveState: "dirty", error: null });
        scheduleSave();
      },

      async save() {
        return flushSave();
      },

      async validate() {
        clearTimer();
        await flushSave();
        const current = get().ontology;
        if (!current) return;
        try {
          const report = await api.validateOntology(current.id);
          set({ issues: report.issues, sidebarTab: "issues", error: null });
        } catch (caught) {
          set({
            error: `Validation failed: ${errorMessage(caught)}`,
            sidebarTab: "issues"
          });
        }
      },

      async removeOntology(id) {
        try {
          await api.deleteOntology(id);
        } catch (caught) {
          set({ error: `Could not delete ontology: ${errorMessage(caught)}` });
          return false;
        }
        const remaining = get().summaries.filter((item) => item.id !== id);
        set({ summaries: remaining });
        if (get().ontology?.id !== id) return true;
        clearTimer();
        const next = remaining[0];
        if (next) {
          await get().openOntology(next.id);
        } else {
          set({
            summaries: [],
            ontology: null,
            selected: null,
            issues: null,
            sidebarTab: "classes",
            saveState: "idle"
          });
        }
        return true;
      },

      select(selection) {
        set({ selected: selection });
      },

      setSidebarTab(tab) {
        set({ sidebarTab: tab });
      },

      requestClassLabelFocus() {
        set((state) => ({ classLabelFocusToken: state.classLabelFocusToken + 1 }));
      }
    };
  });
}
