import { useMemo, useState } from "react";
import { useOntologyStore } from "../state/context";

export interface TemplatePickerProps {
  /** Called after a template is successfully created and opened. */
  onUsed?: () => void;
}

/**
 * Grid of ready-made ontology templates surfaced by the New-dialog and the
 * empty state. Clicking a card's "Use this template" button creates and opens
 * that ontology through the store's `createFromTemplate` action.
 */
export function TemplatePicker({ onUsed }: TemplatePickerProps) {
  const templates = useOntologyStore((state) => state.templates);
  const createFromTemplate = useOntologyStore((state) => state.createFromTemplate);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return templates;
    return templates.filter((template) => {
      const haystack = [template.name, template.description, ...template.tags]
        .map((value) => value.toLowerCase())
        .join(" ");
      return haystack.includes(normalized);
    });
  }, [templates, normalized]);

  async function useTemplate(id: string) {
    setBusyId(id);
    try {
      const created = await createFromTemplate(id);
      if (created) onUsed?.();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="template-picker">
      <label className="template-picker__search search">
        <span className="search__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          className="input input--search"
          data-testid="template-search"
          type="search"
          placeholder="Search templates…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {filtered.length === 0 ? (
        <div className="template-picker__empty" role="status">
          <p>No templates match</p>
          <p className="template-picker__empty-hint">Try a different keyword.</p>
        </div>
      ) : (
        <div className="template-grid" data-testid="template-grid">
          {filtered.map((template) => (
            <article
              key={template.id}
              className="template-card"
              data-testid={`template-card-${template.id}`}
            >
              <div className="template-card__body">
                <span className="template-card__category">{template.category}</span>
                <h4 className="template-card__name">{template.name}</h4>
                <p className="template-card__desc">{template.description}</p>
              </div>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                data-testid={`btn-use-template-${template.id}`}
                disabled={busyId !== null}
                onClick={() => void useTemplate(template.id)}
              >
                {busyId === template.id ? "Loading…" : "Use this template"}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}