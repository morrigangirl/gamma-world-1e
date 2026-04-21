import type { PackDescriptor } from "../../../shared/types";

interface Props {
  packs: PackDescriptor[];
  active: string | null;
  onSelect: (name: string) => void;
  onNewPack: () => void;
}

export default function PackSidebar({ packs, active, onSelect, onNewPack }: Props) {
  return (
    <nav className="sidebar">
      <h2>Compendia</h2>
      {packs.map((pack) => (
        <div
          key={pack.name}
          className={`pack ${active === pack.name ? "active" : ""}`}
          onClick={() => onSelect(pack.name)}
        >
          <div className="label">
            <span>{pack.label}</span>
            <small>{pack.type}</small>
          </div>
          <span className="count">{pack.count}</span>
        </div>
      ))}
      <div style={{ padding: "0.75rem" }}>
        <button style={{ width: "100%" }} onClick={onNewPack}>+ New Compendium</button>
      </div>
    </nav>
  );
}
