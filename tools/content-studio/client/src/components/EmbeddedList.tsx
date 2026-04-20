import { useState } from "react";
import JsonField from "./JsonField.js";
import HtmlField from "./HtmlField.js";
import type { FoundryDoc } from "../../../shared/types";

interface Props {
  label: string;
  field: "items" | "effects" | "pages" | "results";
  docs: FoundryDoc[];
  onChange: (next: FoundryDoc[]) => void;
  htmlField?: string;
}

function randomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let out = "";
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function skeletonFor(field: Props["field"]): FoundryDoc {
  switch (field) {
    case "items":
      return { _id: randomId(), _key: "", name: "New Item", type: "gear", system: {} } as FoundryDoc;
    case "effects":
      return { _id: randomId(), _key: "", name: "New Effect", changes: [], disabled: false, transfer: true } as FoundryDoc;
    case "pages":
      return {
        _id: randomId(),
        _key: "",
        name: "New Page",
        type: "text",
        text: { format: 1, content: "<p></p>" }
      } as FoundryDoc;
    case "results":
      return {
        _id: randomId(),
        _key: "",
        name: "New Result",
        type: "text",
        range: [1, 1],
        weight: 1,
        description: ""
      } as FoundryDoc;
  }
}

function getHtmlValue(doc: FoundryDoc, htmlField: string | undefined): string {
  if (!htmlField) return "";
  const parts = htmlField.split(".");
  let cur: any = doc;
  for (const p of parts) cur = cur?.[p];
  return typeof cur === "string" ? cur : "";
}

function setHtmlValue(doc: FoundryDoc, htmlField: string | undefined, html: string): FoundryDoc {
  if (!htmlField) return doc;
  const parts = htmlField.split(".");
  const out = structuredClone(doc);
  let cur: any = out;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = html;
  return out;
}

export default function EmbeddedList({ label, field, docs, onChange, htmlField }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  function update(id: string, next: FoundryDoc) {
    onChange(docs.map((d) => (d._id === id ? next : d)));
  }

  function remove(id: string) {
    onChange(docs.filter((d) => d._id !== id));
  }

  function add() {
    onChange([...docs, skeletonFor(field)]);
  }

  return (
    <div className="section">
      <h3>{label} ({docs.length})</h3>
      {docs.map((d) => {
        const isOpen = openId === d._id;
        return (
          <div key={d._id} className="embedded">
            <header>
              <span className="name">{d.name}</span>
              <div className="tools">
                <button onClick={() => setOpenId(isOpen ? null : d._id)}>
                  {isOpen ? "Collapse" : "Edit"}
                </button>
                <button className="danger" onClick={() => remove(d._id)}>Remove</button>
              </div>
            </header>
            {isOpen && (
              <>
                <div className="row">
                  <label>Name</label>
                  <input
                    type="text"
                    value={d.name ?? ""}
                    onChange={(e) => update(d._id, { ...d, name: e.target.value })}
                  />
                </div>
                {htmlField && (
                  <div className="row">
                    <label>{htmlField.split(".").pop()}</label>
                    <HtmlField
                      value={getHtmlValue(d, htmlField)}
                      onChange={(html) => update(d._id, setHtmlValue(d, htmlField, html))}
                    />
                  </div>
                )}
                <div className="row">
                  <label>JSON</label>
                  <JsonField
                    value={d}
                    onChange={(next) => update(d._id, next as FoundryDoc)}
                    minHeight="14rem"
                  />
                </div>
              </>
            )}
          </div>
        );
      })}
      <button onClick={add}>+ Add {label.replace(/s$/, "")}</button>
    </div>
  );
}
