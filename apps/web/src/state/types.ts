/** Shared UI state vocabulary (kept independent from the store so graph code can use it). */

export type SidebarTab = "classes" | "relations" | "issues";

/**
 * Internal save lifecycle. The exact user-facing labels are mapped from these in
 * one place (`saveStatusLabel`) because the E2E suite matches them literally.
 */
export type SaveState = "idle" | "dirty" | "saving" | "error";

/** What the inspector is currently inspecting. */
export type Selection =
  | { kind: "class"; id: string }
  | { kind: "relation"; id: string }
  | null;

export const SAVE_STATUS_LABEL: Record<SaveState, string> = {
  idle: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed"
};

/** Pluralisation used by the status bar and issue counters ("1 class", "2 classes"). */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
