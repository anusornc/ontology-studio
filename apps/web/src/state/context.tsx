import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand/react";
import type { OntologyStore, OntologyStoreApi } from "./store";

const OntologyStoreContext = createContext<OntologyStoreApi | null>(null);

export interface OntologyStoreProviderProps {
  store: OntologyStoreApi;
  children: ReactNode;
}

/** Provides the factory-created vanilla store to the whole studio tree. */
export function OntologyStoreProvider({ store, children }: OntologyStoreProviderProps) {
  return <OntologyStoreContext.Provider value={store}>{children}</OntologyStoreContext.Provider>;
}

/**
 * Selector hook bound to the provided store. Components subscribe to the
 * smallest slice they need so canvas edits do not re-render the whole studio.
 */
export function useOntologyStore<T>(selector: (state: OntologyStore) => T): T {
  const store = useContext(OntologyStoreContext);
  if (!store) {
    throw new Error("useOntologyStore must be used inside <OntologyStoreProvider>");
  }
  return useStore(store, selector);
}

export function useOntologyStoreApi(): OntologyStoreApi {
  const store = useContext(OntologyStoreContext);
  if (!store) {
    throw new Error("useOntologyStoreApi must be used inside <OntologyStoreProvider>");
  }
  return store;
}
