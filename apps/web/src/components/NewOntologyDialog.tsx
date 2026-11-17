import { useEffect, useRef, useState } from "react";
import { useOntologyStore } from "../state/context";

export interface NewOntologyDialogProps {
  onClose: () => void;
}

/** Modal used by the top bar "New" button. Cancel leaves the current document untouched. */
export function NewOntologyDialog({ onClose }: NewOntologyDialogProps) {
  const createNewOntology = useOntologyStore((state) => state.createNewOntology);
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

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div
        className="modal"
        data-testid="new-ontology-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-ontology-title"
      >
        <h2 className="modal__title" id="new-ontology-title">
          New ontology
        </h2>
        <p className="modal__copy">Start from a blank canvas. Your current ontology stays saved.</p>
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
      </div>
    </div>
  );
}
