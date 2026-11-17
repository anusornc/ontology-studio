import { useState } from "react";
import { useOntologyStore } from "../state/context";
import { useCreateClass } from "../state/useClassCreation";
import { ClassTree } from "./ClassTree";
import { IssuesPanel } from "./IssuesPanel";
import { RelationsList } from "./RelationsList";

export interface SidebarProps {
  open: boolean;
}

/** Left explorer: class tree, relation list and validation findings. */
export function Sidebar({ open }: SidebarProps) {
  const ontology = useOntologyStore((state) => state.ontology);
  const sidebarTab = useOntologyStore((state) => state.sidebarTab);
  const setSidebarTab = useOntologyStore((state) => state.setSidebarTab);
  const issues = useOntologyStore((state) => state.issues);
  const createClass = useCreateClass();
  const [search, setSearch] = useState("");

  const classCount = ontology?.classes.length ?? 0;
  const relationCount = ontology?.relations.length ?? 0;
  const issueCount = issues?.length ?? 0;

  return (
    <aside className={`sidebar${open ? " sidebar--open" : ""}`} data-testid="sidebar" aria-label="Explorer">
      <div className="sidebar__header">
        <h2 className="sidebar__title">Explorer</h2>
        <span className="sidebar__meta">{classCount} types</span>
      </div>

      <div className="sidebar__tabs" role="tablist" aria-label="Explorer sections">
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === "classes"}
          className={`sidebar__tab${sidebarTab === "classes" ? " sidebar__tab--active" : ""}`}
          data-testid="sidebar-tab-classes"
          onClick={() => setSidebarTab("classes")}
        >
          Classes
          <span className="sidebar__tab-count">{classCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === "relations"}
          className={`sidebar__tab${sidebarTab === "relations" ? " sidebar__tab--active" : ""}`}
          data-testid="sidebar-tab-relations"
          onClick={() => setSidebarTab("relations")}
        >
          Relations
          <span className="sidebar__tab-count">{relationCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === "issues"}
          className={`sidebar__tab${sidebarTab === "issues" ? " sidebar__tab--active" : ""}${
            issueCount > 0 ? " sidebar__tab--alert" : ""
          }`}
          data-testid="sidebar-tab-issues"
          onClick={() => setSidebarTab("issues")}
        >
          Issues
          {issueCount > 0 && <span className="sidebar__tab-count sidebar__tab-count--alert">{issueCount}</span>}
        </button>
      </div>

      <div className="sidebar__body" role="tabpanel">
        {sidebarTab === "classes" && (
          <div className="sidebar__panel">
            <div className="sidebar__toolbar">
              <div className="search">
                <span className="search__icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  className="input input--search"
                  data-testid="class-search"
                  type="search"
                  placeholder="Search classes…"
                  aria-label="Search classes"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn--primary btn--block"
                data-testid="btn-add-class"
                onClick={createClass}
              >
                <span aria-hidden="true">＋</span> New class
              </button>
            </div>
            <ClassTree search={search} />
          </div>
        )}

        {sidebarTab === "relations" && (
          <div className="sidebar__panel">
            <RelationsList />
          </div>
        )}

        {sidebarTab === "issues" && (
          <div className="sidebar__panel">
            <IssuesPanel />
          </div>
        )}
      </div>
    </aside>
  );
}
