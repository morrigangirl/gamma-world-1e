import { useEffect, useState } from "react";
import type { FoundryDoc, PackType } from "../../../shared/types";
import ItemEditor from "./editors/ItemEditor.js";
import ActorEditor from "./editors/ActorEditor.js";
import JournalEditor from "./editors/JournalEditor.js";
import RollTableEditor from "./editors/RollTableEditor.js";

interface Props {
  doc: FoundryDoc | null;
  packType: PackType | undefined;
  onSave: (doc: FoundryDoc) => void;
  onRevert: () => void;
}

export default function DocEditor({ doc, packType, onSave, onRevert }: Props) {
  const [draft, setDraft] = useState<FoundryDoc | null>(doc);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(doc);
    setDirty(false);
  }, [doc]);

  if (!draft) {
    return <main className="editor"><div className="empty">Select a document to edit.</div></main>;
  }

  function update(next: FoundryDoc) {
    setDraft(next);
    setDirty(true);
  }

  const commonHeader = (
    <>
      <h2>{draft.name || "(unnamed)"}</h2>
      <div className="row">
        <label>Name</label>
        <input
          type="text"
          value={draft.name ?? ""}
          onChange={(e) => update({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="row">
        <label>ID</label>
        <code style={{ color: "var(--text-dim)" }}>{draft._id}</code>
      </div>
    </>
  );

  let body: JSX.Element | null = null;
  if (packType === "Item") body = <ItemEditor doc={draft} onChange={update} />;
  else if (packType === "Actor") body = <ActorEditor doc={draft} onChange={update} />;
  else if (packType === "JournalEntry") body = <JournalEditor doc={draft} onChange={update} />;
  else if (packType === "RollTable") body = <RollTableEditor doc={draft} onChange={update} />;

  return (
    <main className="editor">
      {commonHeader}
      {body}
      <div className="actions">
        <button className="primary" disabled={!dirty} onClick={() => draft && onSave(draft)}>
          Save
        </button>
        <button disabled={!dirty} onClick={onRevert}>Revert</button>
      </div>
    </main>
  );
}
