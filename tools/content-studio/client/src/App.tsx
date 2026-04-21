import { useEffect, useState } from "react";
import PackSidebar from "./components/PackSidebar.js";
import DocList from "./components/DocList.js";
import DocEditor from "./components/DocEditor.js";
import BuildPanel from "./components/BuildPanel.js";
import NewCompendiumModal from "./components/NewCompendiumModal.js";
import { api } from "./api.js";
import type { DocSummary, FoundryDoc, PackDescriptor } from "../../shared/types";

export default function App() {
  const [packs, setPacks] = useState<PackDescriptor[]>([]);
  const [activePack, setActivePack] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [activeDoc, setActiveDoc] = useState<FoundryDoc | null>(null);
  const [status, setStatus] = useState<string>("");
  const [buildOpen, setBuildOpen] = useState(false);
  const [newPackOpen, setNewPackOpen] = useState(false);

  useEffect(() => {
    api.listPacks().then((p) => {
      setPacks(p);
      if (!activePack && p.length) setActivePack(p[0].name);
    }).catch((e) => setStatus(`error: ${e.message}`));
  }, []);

  useEffect(() => {
    if (!activePack) return;
    setActiveDoc(null);
    api.listDocs(activePack).then(setDocs).catch((e) => setStatus(`error: ${e.message}`));
  }, [activePack]);

  async function refreshPackCounts() {
    const p = await api.listPacks();
    setPacks(p);
  }

  async function selectDoc(id: string) {
    if (!activePack) return;
    const doc = await api.readDoc(activePack, id);
    setActiveDoc(doc);
  }

  async function saveDoc(doc: FoundryDoc) {
    if (!activePack) return;
    const saved = await api.writeDoc(activePack, doc._id, doc);
    setActiveDoc(saved);
    setStatus(`saved ${saved.name}`);
    const list = await api.listDocs(activePack);
    setDocs(list);
  }

  async function newDoc() {
    if (!activePack) return;
    const created = await api.createDoc(activePack, { name: "Untitled" });
    await refreshPackCounts();
    const list = await api.listDocs(activePack);
    setDocs(list);
    setActiveDoc(created);
    setStatus(`created ${created.name}`);
  }

  async function deleteDoc(id: string) {
    if (!activePack) return;
    if (!confirm("Delete this document from source? (Rebuild to remove from pack.)")) return;
    await api.deleteDoc(activePack, id);
    await refreshPackCounts();
    const list = await api.listDocs(activePack);
    setDocs(list);
    if (activeDoc?._id === id) setActiveDoc(null);
    setStatus(`deleted ${id}`);
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>Gamma World 1e Content Studio</h1>
        <span className="status">{status}</span>
        <div className="spacer" />
        <button onClick={() => setBuildOpen((v) => !v)}>
          {buildOpen ? "Hide build log" : "Show build log"}
        </button>
      </div>
      <PackSidebar
        packs={packs}
        active={activePack}
        onSelect={setActivePack}
        onNewPack={() => setNewPackOpen(true)}
      />
      <DocList
        docs={docs}
        activeId={activeDoc?._id ?? null}
        onSelect={selectDoc}
        onNew={newDoc}
        onDelete={deleteDoc}
      />
      <DocEditor
        doc={activeDoc}
        packType={packs.find((p) => p.name === activePack)?.type}
        onSave={saveDoc}
        onRevert={() => activeDoc && selectDoc(activeDoc._id)}
      />
      <BuildPanel
        open={buildOpen}
        onClose={() => setBuildOpen(false)}
        onBuildDone={() => {
          refreshPackCounts();
          setStatus("build complete");
        }}
      />
      {newPackOpen && (
        <NewCompendiumModal
          existing={packs}
          onClose={() => setNewPackOpen(false)}
          onCreated={async (pack) => {
            setNewPackOpen(false);
            const fresh = await api.listPacks();
            setPacks(fresh);
            setActivePack(pack.name);
            setStatus(`created compendium ${pack.label}`);
          }}
        />
      )}
    </div>
  );
}
