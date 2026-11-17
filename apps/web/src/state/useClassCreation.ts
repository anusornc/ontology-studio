import { addClass, createClass, suggestUniqueClassName } from "@onto/core";
import { useCallback } from "react";
import { nextClassPosition } from "../graph/classPlacement";
import { useOntologyStore } from "./context";

/**
 * Create a class with a unique machine name on the next deterministic grid slot,
 * select it and request focus on the inspector label field. Shared by the
 * sidebar "New class" button and the canvas double-click affordance.
 */
export function useCreateClass(): () => void {
  const mutate = useOntologyStore((state) => state.mutate);
  const select = useOntologyStore((state) => state.select);
  const requestClassLabelFocus = useOntologyStore((state) => state.requestClassLabelFocus);

  return useCallback(() => {
    let createdId: string | null = null;
    mutate((ontology) => {
      const created = createClass({
        label: "New class",
        name: suggestUniqueClassName(ontology, "New class"),
        position: nextClassPosition(ontology)
      });
      createdId = created.id;
      return addClass(ontology, created);
    });
    if (createdId !== null) {
      select({ kind: "class", id: createdId });
      requestClassLabelFocus();
    }
  }, [mutate, select, requestClassLabelFocus]);
}
