import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import type { MediaEntry } from "../../../shared/types";

interface Props {
  onSelect: (foundryPath: string) => void;
  onClose: () => void;
}

export default function MediaPicker({ onSelect, onClose }: Props) {
  const [cwd, setCwd] = useState<string>("");
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [err, setErr] = useState<string>("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listMedia(cwd).then(setEntries).catch((e) => setErr(e.message));
  }, [cwd]);

  async function handleUpload(file: File) {
    try {
      const entry = await api.uploadMedia(file);
      onSelect(entry.foundryPath);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const up = () => setCwd(cwd.includes("/") ? cwd.slice(0, cwd.lastIndexOf("/")) : "");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Select image</h3>
          <button onClick={onClose}>Close</button>
        </header>
        <div style={{ marginBottom: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button disabled={!cwd} onClick={up}>↑ Up</button>
          <span style={{ color: "var(--text-dim)" }}>assets/{cwd}</span>
          <div style={{ flex: 1 }} />
          <button className="primary" onClick={() => fileInput.current?.click()}>
            Upload to assets/studio/
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif,.svg,.avif"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </div>
        {err && <div style={{ color: "var(--danger)", marginBottom: "0.5rem" }}>{err}</div>}
        <div className="media-picker">
          {entries.map((e) => (
            <div
              key={e.path}
              className={`entry ${e.kind === "dir" ? "dir" : ""}`}
              onClick={() => (e.kind === "dir" ? setCwd(e.path) : onSelect(e.foundryPath))}
            >
              {e.kind === "dir" ? (
                <>📁<span>{e.path.split("/").pop()}</span></>
              ) : (
                <>
                  <img src={`/api-assets/${e.path}`} alt="" onError={(ev) => ((ev.target as HTMLImageElement).style.opacity = "0.2")} />
                  <span>{e.path.split("/").pop()}</span>
                </>
              )}
            </div>
          ))}
          {!entries.length && <div className="empty">Empty directory.</div>}
        </div>
      </div>
    </div>
  );
}
