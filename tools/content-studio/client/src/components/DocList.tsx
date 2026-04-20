import { useMemo, useState } from "react";
import type { DocSummary } from "../../../shared/types";

interface Props {
  docs: DocSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export default function DocList({ docs, activeId, onSelect, onNew, onDelete }: Props) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    if (!filter.trim()) return docs;
    const needle = filter.toLowerCase();
    return docs.filter((d) =>
      d.name.toLowerCase().includes(needle) ||
      (d.type ?? "").toLowerCase().includes(needle) ||
      (d.subtype ?? "").toLowerCase().includes(needle)
    );
  }, [docs, filter]);

  return (
    <aside className="doclist">
      <div className="search">
        <input
          type="text"
          value={filter}
          placeholder="Search…"
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="items">
        {filtered.map((d) => (
          <div
            key={d.id}
            className={`item ${activeId === d.id ? "active" : ""}`}
            onClick={() => onSelect(d.id)}
          >
            <span className="name">{d.name}</span>
            <span className="meta">
              {d.type}{d.subtype ? ` · ${d.subtype}` : ""} · {d.id}
            </span>
          </div>
        ))}
        {!filtered.length && <div className="empty">No documents.</div>}
      </div>
      <div className="tools">
        <button className="primary" onClick={onNew}>+ New</button>
        {activeId && (
          <button className="danger" onClick={() => onDelete(activeId)}>
            Delete selected
          </button>
        )}
      </div>
    </aside>
  );
}
