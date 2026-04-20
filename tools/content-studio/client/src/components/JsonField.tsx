import CodeMirror from "@uiw/react-codemirror";
import { json as jsonLang } from "@codemirror/lang-json";

interface Props {
  value: unknown;
  onChange: (value: unknown) => void;
  minHeight?: string;
}

export default function JsonField({ value, onChange, minHeight = "12rem" }: Props) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return (
    <CodeMirror
      value={text}
      extensions={[jsonLang()]}
      theme="dark"
      minHeight={minHeight}
      onChange={(next) => {
        try {
          onChange(JSON.parse(next));
        } catch {
          // leave value unchanged on parse error
        }
      }}
    />
  );
}
