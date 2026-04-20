import { useState } from "react";
import type { FoundryDoc } from "../../../../shared/types";
import HtmlField from "../HtmlField.js";
import JsonField from "../JsonField.js";
import EmbeddedList from "../EmbeddedList.js";
import MediaPicker from "../MediaPicker.js";

interface Props {
  doc: FoundryDoc;
  onChange: (doc: FoundryDoc) => void;
}

const ITEM_TYPES = ["weapon", "armor", "gear", "mutation"];

export default function ItemEditor({ doc, onChange }: Props) {
  const [pickingImg, setPickingImg] = useState(false);
  const system = (doc.system ?? {}) as Record<string, unknown>;
  const description = (system.description as { value?: string })?.value ?? "";

  function setSystem(next: Record<string, unknown>) {
    onChange({ ...doc, system: next });
  }

  function setDescription(html: string) {
    setSystem({ ...system, description: { ...(system.description as object ?? {}), value: html } });
  }

  return (
    <>
      <div className="row">
        <label>Type</label>
        <select value={doc.type ?? ""} onChange={(e) => onChange({ ...doc, type: e.target.value })}>
          {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="row">
        <label>Image</label>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            value={doc.img ?? ""}
            onChange={(e) => onChange({ ...doc, img: e.target.value })}
          />
          <button onClick={() => setPickingImg(true)}>Browse…</button>
        </div>
      </div>
      {doc.img && <img src={toAssetsUrl(doc.img)} alt="" style={{ maxWidth: 96, maxHeight: 96 }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
      <div className="row">
        <label>Description</label>
        <HtmlField value={description} onChange={setDescription} />
      </div>
      <div className="section">
        <h3>system.*</h3>
        <JsonField value={system} onChange={(next) => setSystem(next as Record<string, unknown>)} />
      </div>
      <EmbeddedList
        label="Active Effects"
        field="effects"
        docs={(doc.effects as FoundryDoc[]) ?? []}
        onChange={(next) => onChange({ ...doc, effects: next })}
      />
      {pickingImg && (
        <MediaPicker
          onSelect={(foundryPath) => { onChange({ ...doc, img: foundryPath }); setPickingImg(false); }}
          onClose={() => setPickingImg(false)}
        />
      )}
    </>
  );
}

function toAssetsUrl(foundryPath: string): string {
  const prefix = "systems/gamma-world-1e/assets/";
  if (!foundryPath.startsWith(prefix)) return foundryPath;
  return `/api-assets/${foundryPath.slice(prefix.length)}`;
}
