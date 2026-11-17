import { useEffect, useRef, useState } from "react";
import { useOntologyStore } from "../state/context";
import { TemplatePicker } from "./TemplatePicker";

export interface NewOntologyDialogProps {
  onClose: () => void;
}

type Tab = "blank" | "templates";

/** Modal used by the top bar "New" button. Cancel leaves the current document untouched. */
export function NewOntologyDialog({ onClose }: NewOntologyDialogProps) {
  const createNewOntology = useOntologyStore((state) => state.createNewOntology);
  const [tab, setTab] = useState<Tab>("blank");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function create() {
    setBusy(true);
    try {
      const created = await createNewOntology(name);
      if (created) onClose();
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; testId: string }> = [
    { id: "blank", label: "Blank", testId: "template-tab-blank" },
    { id: "templates", label: "Templates", testId: "template-tab-templates" }
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div
        className="modal modal--wide"
        data-testid="new-ontology-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-ontology-title"
      >
        <h2 className="modal__title" id="new-ontology-title">
          New ontology
        </h2>
        <p className="modal__copy">Start from a blank canvas or a ready-made template.</p>
        <div className="tabs" role="tablist" aria-label="New ontology source">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`tabs__tab${tab === item.id ? " tabs__tab--active" : ""}`}
              data-testid={item.testId}
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "blank" ? (
          <form
            className="modal__form"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label className="field">
              <span className="field__label">Ontology name</span>
              <input
                ref={inputRef}
                className="input"
                data-testid="input-ontology-name"
                name="ontology-name"
                placeholder="e.g. Research Lab"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                data-testid="btn-cancel-new-ontology"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                data-testid="btn-create-ontology"
                disabled={name.trim().length === 0 || busy}
              >
                {busy ? "Creating…" : "Create ontology"}
              </button>
            </div>
          </form>
        ) : (
          <div className="new-dialog__templates">
            <TemplatePicker onUsed={onClose} />
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                data-testid="btn-cancel-new-ontology"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}