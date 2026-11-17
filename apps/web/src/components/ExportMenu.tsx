import { useEffect, useRef, useState } from "react";
import type { ExportFormat } from "../api/client";

export interface ExportMenuProps {
  onExport: (format: ExportFormat) => Promise<void>;
}

const ITEMS: Array<{ format: ExportFormat; label: string; hint: string; testId: string }> = [
  { format: "turtle", label: "Turtle", hint: ".ttl", testId: "export-turtle" },
  { format: "jsonld", label: "JSON-LD", hint: ".jsonld", testId: "export-jsonld" },
  { format: "json", label: "Native JSON", hint: ".json", testId: "export-json" }
];

/** Top bar export dropdown. Downloads the file produced by the API. */
export function ExportMenu({ onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function choose(format: ExportFormat) {
    setBusy(format);
    try {
      await onExport(format);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn--secondary"
        data-testid="btn-export"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Export
        <span className="btn__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="export-menu__list" data-testid="export-menu" role="menu" aria-label="Export ontology">
          {ITEMS.map((item) => (
            <button
              key={item.format}
              type="button"
              role="menuitem"
              className="export-menu__item"
              data-testid={item.testId}
              disabled={busy !== null}
              onClick={() => void choose(item.format)}
            >
              <span className="export-menu__label">{item.label}</span>
              <span className="export-menu__hint">{item.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
