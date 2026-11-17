import { useEffect, useMemo, useRef, useState } from "react";
import { createOntologyApi, type ExportFormat, type OntologyApi } from "./api/client";
import { Canvas } from "./components/Canvas";
import { EmptyState } from "./components/EmptyState";
import { Inspector } from "./components/Inspector";
import { NewOntologyDialog } from "./components/NewOntologyDialog";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TopBar } from "./components/TopBar";
import { downloadExport } from "./lib/download";
import { OntologyStoreProvider, useOntologyStore } from "./state/context";
import { createOntologyStore, type OntologyStoreApi } from "./state/store";

export interface AppProps {
  /** Injectable API client (tests pass an in-memory fake). */
  api?: OntologyApi;
  /** Injectable pre-built store; otherwise one is created from `api`. */
  store?: OntologyStoreApi;
  /** Override the autosave debounce for tests. */
  autoSaveMs?: number;
}

interface StudioProps {
  onExport: (format: ExportFormat) => Promise<void>;
}

function Studio({ onExport }: StudioProps) {
  const ontology = useOntologyStore((state) => state.ontology);
  const booting = useOntologyStore((state) => state.booting);
  const error = useOntologyStore((state) => state.error);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className={`app${sidebarOpen ? " app--sidebar-open" : ""}`}>
      <TopBar
        onNewOntology={() => setDialogOpen(true)}
        onExport={onExport}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />
      {error !== null && (
        <div className="app-error" role="alert" data-testid="app-error">
          <span className="app-error__icon" aria-hidden="true">
            !
          </span>
          <span>{error}</span>
        </div>
      )}
      <main className="workspace">
        {ontology === null ? (
          booting ? (
            <div className="boot" data-testid="boot-screen">
              <span className="boot__spinner" aria-hidden="true" />
              <p>Loading studio…</p>
            </div>
          ) : (
            <EmptyState />
          )
        ) : (
          <>
            <Sidebar open={sidebarOpen} />
            <Canvas />
            <Inspector />
          </>
        )}
      </main>
      {ontology !== null && <StatusBar />}
      {dialogOpen && <NewOntologyDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
}

/**
 * Studio shell. The vanilla Zustand store is created once from the injected API
 * client and shared through context so tests can drive the whole app with fakes.
 */
export function App({ api, store, autoSaveMs }: AppProps = {}) {
  const apiInstance = useMemo(() => api ?? createOntologyApi(), [api]);
  const [storeInstance] = useState<OntologyStoreApi>(
    () => store ?? createOntologyStore(apiInstance, autoSaveMs === undefined ? undefined : { autoSaveMs })
  );
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void storeInstance.getState().bootstrap();
  }, [storeInstance]);

  async function handleExport(format: ExportFormat) {
    const current = storeInstance.getState().ontology;
    if (!current) return;
    const result = await apiInstance.exportOntology(current.id, format);
    downloadExport(result);
  }

  return (
    <OntologyStoreProvider store={storeInstance}>
      <Studio onExport={handleExport} />
    </OntologyStoreProvider>
  );
}

export default App;
