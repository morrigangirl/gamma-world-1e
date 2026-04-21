import { useMemo, useState } from "react";
import type { PackDescriptor, PackType } from "../../../shared/types";
import { api } from "../api.js";

interface Props {
  existing: PackDescriptor[];
  onCreated: (pack: PackDescriptor) => void;
  onClose: () => void;
}

const PACK_NAME_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const TYPES: PackType[] = ["Item", "Actor", "JournalEntry", "RollTable"];

export default function NewCompendiumModal({ existing, onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<PackType>("Item");
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<string>("");

  const takenNames = useMemo(() => new Set(existing.map((p) => p.name)), [existing]);

  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    if (!PACK_NAME_RE.test(trimmed)) return "Lowercase kebab-case, 3–40 chars (a–z, 0–9, hyphens).";
    if (takenNames.has(trimmed)) return "A compendium with that name already exists.";
    return "";
  }, [name, takenNames]);

  const labelError = useMemo(() => {
    const trimmed = label.trim();
    if (!trimmed) return "";
    if (trimmed.length > 100) return "Max 100 characters.";
    return "";
  }, [label]);

  const canSubmit =
    !busy &&
    PACK_NAME_RE.test(name.trim()) &&
    !takenNames.has(name.trim()) &&
    label.trim().length > 0 &&
    label.trim().length <= 100;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setServerErr("");
    try {
      const pack = await api.createPack({
        name: name.trim(),
        label: label.trim(),
        type
      });
      onCreated(pack);
    } catch (e) {
      setServerErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header>
          <h3>New compendium</h3>
          <button onClick={onClose} disabled={busy}>Cancel</button>
        </header>
        <p style={{ color: "var(--text-dim)", lineHeight: 1.5, marginTop: 0 }}>
          Adds an entry to <code>system.json</code> and creates an empty <code>content/&lt;name&gt;/</code> directory.
          No LevelDB is written; the pack appears in Foundry as empty until you publish a build.
        </p>
        <div className="row">
          <label>Name</label>
          <div>
            <input
              type="text"
              value={name}
              placeholder="homebrew-monsters"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            {nameError && <small style={{ color: "var(--danger)" }}>{nameError}</small>}
          </div>
        </div>
        <div className="row">
          <label>Label</label>
          <div>
            <input
              type="text"
              value={label}
              placeholder="Homebrew Monsters"
              onChange={(e) => setLabel(e.target.value)}
            />
            {labelError && <small style={{ color: "var(--danger)" }}>{labelError}</small>}
          </div>
        </div>
        <div className="row">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as PackType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {serverErr && (
          <div style={{ color: "var(--danger)", marginTop: "0.5rem" }}>
            Server: {serverErr}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" disabled={!canSubmit} onClick={submit}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
