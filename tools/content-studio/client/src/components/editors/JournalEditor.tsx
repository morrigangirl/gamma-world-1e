import type { FoundryDoc } from "../../../../shared/types";
import EmbeddedList from "../EmbeddedList.js";

interface Props {
  doc: FoundryDoc;
  onChange: (doc: FoundryDoc) => void;
}

export default function JournalEditor({ doc, onChange }: Props) {
  return (
    <EmbeddedList
      label="Pages"
      field="pages"
      docs={(doc.pages as FoundryDoc[]) ?? []}
      onChange={(next) => onChange({ ...doc, pages: next })}
      htmlField="text.content"
    />
  );
}
