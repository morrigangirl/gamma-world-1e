import { useRef, useState } from "react";
import { streamPost, type StreamMessage } from "../api.js";

interface Props {
  open: boolean;
  onClose: () => void;
  onBuildDone: () => void;
}

type Line = { kind: "out" | "err" | "sys"; text: string };
const CONFIRM_TOKEN = "overwrite-packs";

export default function BuildPanel({ open, onBuildDone }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  function push(next: Line) {
    setLines((prev) => {
      const out = [...prev, next].slice(-500);
      queueMicrotask(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight }));
      return out;
    });
  }

  async function run(url: string, label: string, body: unknown = {}) {
    if (busy) return;
    setBusy(true);
    push({ kind: "sys", text: `→ ${label}` });
    await streamPost(url, body, (m: StreamMessage) => {
      if (m.kind === "stdout") push({ kind: "out", text: m.line });
      else if (m.kind === "stderr") push({ kind: "err", text: m.line });
      else if (m.kind === "exit") push({ kind: "sys", text: `← exit code ${m.code}` });
      else if (m.kind === "error") push({ kind: "err", text: `spawn error: ${m.message}` });
    });
    setBusy(false);
    if (url === "/api/build") onBuildDone();
  }

  return (
    <>
      <div ref={logRef} className={`buildlog ${open ? "" : "collapsed"}`}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", position: "sticky", top: 0, background: "#0e0f14", paddingBottom: 4, flexWrap: "wrap" }}>
          <button className="primary" disabled={busy} onClick={() => run("/api/build", "test build → scratch")}>
            Test build (scratch)
          </button>
          <button className="danger" disabled={busy} onClick={() => setPublishOpen(true)}>
            Publish to packs/…
          </button>
          <button disabled={busy} onClick={() => run("/api/build/validate", "validate only")}>
            Validate only
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (confirm("Re-extract will overwrite every JSON file under content/ with what's in the committed LevelDB packs. Continue?")) {
                run("/api/extract", "extract packs → content/");
              }
            }}
          >
            Re-extract from packs
          </button>
          <div style={{ flex: 1 }} />
          <button disabled={busy || !lines.length} onClick={() => setLines([])}>Clear</button>
        </div>
        {lines.map((l, i) => (
          <div key={i} className={l.kind === "err" ? "err" : l.kind === "sys" ? "sys" : ""}>{l.text}</div>
        ))}
        {!lines.length && <div style={{ color: "var(--text-dim)" }}>Build log will appear here. Default build target is scratch; publishing to live packs/ requires explicit confirmation.</div>}
      </div>
      {publishOpen && (
        <PublishModal
          onConfirm={() => {
            setPublishOpen(false);
            run("/api/build", "PUBLISH → packs/", { publish: true, confirm: CONFIRM_TOKEN });
          }}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </>
  );
}

function PublishModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header>
          <h3 style={{ color: "var(--danger)" }}>Publish to packs/</h3>
          <button onClick={onClose}>Cancel</button>
        </header>
        <p style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>
          This overwrites the live LevelDB files under <code>packs/</code>. Those are production data read by your
          Foundry world. Rebuilding is safe (all source is in <code>content/</code>), but it is not undo-able without
          a <code>git checkout</code>.
        </p>
        <p style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>
          To proceed, type <code>{CONFIRM_TOKEN}</code> below.
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_TOKEN}
          autoFocus
        />
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button onClick={onClose}>Cancel</button>
          <button className="danger" disabled={typed !== CONFIRM_TOKEN} onClick={onConfirm}>
            Publish to packs/
          </button>
        </div>
      </div>
    </div>
  );
}
