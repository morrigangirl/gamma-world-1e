import type { PackDescriptor } from "../../../shared/types";

interface Props {
  packs: PackDescriptor[];
  active: string | null;
  onSelect: (name: string) => void;
}

export default function PackSidebar({ packs, active, onSelect }: Props) {
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
    </nav>
  );
}
