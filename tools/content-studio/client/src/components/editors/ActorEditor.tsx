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

const ACTOR_TYPES = ["character", "monster"];

export default function ActorEditor({ doc, onChange }: Props) {
  const [pickingImg, setPickingImg] = useState(false);
  const [pickingToken, setPickingToken] = useState(false);
  const system = (doc.system ?? {}) as Record<string, unknown>;
  const biography = (system.biography as { value?: string })?.value ?? "";
  const proto = (doc as any).prototypeToken ?? {};
  const tokenSrc: string = proto.texture?.src ?? "";

  function setSystem(next: Record<string, unknown>) {
    onChange({ ...doc, system: next });
  }

  function setBiography(html: string) {
    setSystem({ ...system, biography: { ...(system.biography as object ?? {}), value: html } });
  }

  function setToken(src: string) {
    const token = { ...proto, texture: { ...(proto.texture ?? {}), src } };
    onChange({ ...doc, prototypeToken: token } as FoundryDoc);
  }

  return (
    <>
      <div className="row">
        <label>Type</label>
        <select value={doc.type ?? ""} onChange={(e) => onChange({ ...doc, type: e.target.value })}>
          {ACTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="row">
        <label>Portrait</label>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            value={doc.img ?? ""}
            onChange={(e) => onChange({ ...doc, img: e.target.value })}
          />
          <button onClick={() => setPickingImg(true)}>Browse…</button>
        </div>
      </div>
      <div className="row">
        <label>Token texture</label>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input type="text" value={tokenSrc} onChange={(e) => setToken(e.target.value)} />
          <button onClick={() => setPickingToken(true)}>Browse…</button>
        </div>
      </div>
      <div className="row">
        <label>Biography</label>
        <HtmlField value={biography} onChange={setBiography} />
      </div>
      <div className="section">
        <h3>system.*</h3>
        <JsonField value={system} onChange={(next) => setSystem(next as Record<string, unknown>)} />
      </div>
      <EmbeddedList
        label="Embedded Items"
        field="items"
        docs={(doc.items as FoundryDoc[]) ?? []}
        onChange={(next) => onChange({ ...doc, items: next })}
      />
      <EmbeddedList
        label="Active Effects"
        field="effects"
        docs={(doc.effects as FoundryDoc[]) ?? []}
        onChange={(next) => onChange({ ...doc, effects: next })}
      />
      {pickingImg && (
        <MediaPicker
          onSelect={(p) => { onChange({ ...doc, img: p }); setPickingImg(false); }}
          onClose={() => setPickingImg(false)}
        />
      )}
      {pickingToken && (
        <MediaPicker
          onSelect={(p) => { setToken(p); setPickingToken(false); }}
          onClose={() => setPickingToken(false)}
        />
      )}
    </>
  );
}
