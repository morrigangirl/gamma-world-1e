import type { FoundryDoc } from "../../../../shared/types";
import EmbeddedList from "../EmbeddedList.js";

interface Props {
  doc: FoundryDoc;
  onChange: (doc: FoundryDoc) => void;
}

export default function RollTableEditor({ doc, onChange }: Props) {
  return (
    <>
      <div className="row">
        <label>Formula</label>
        <input
          type="text"
          value={(doc.formula as string) ?? ""}
          onChange={(e) => onChange({ ...doc, formula: e.target.value })}
        />
      </div>
      <EmbeddedList
        label="Results"
        field="results"
        docs={(doc.results as FoundryDoc[]) ?? []}
        onChange={(next) => onChange({ ...doc, results: next })}
        htmlField="description"
      />
    </>
  );
}
