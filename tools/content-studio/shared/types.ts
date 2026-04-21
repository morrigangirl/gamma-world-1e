export type PackType = "Item" | "Actor" | "JournalEntry" | "RollTable";

export interface PackDescriptor {
  name: string;
  label: string;
  type: PackType;
  path: string;
  count: number;
}

export interface PackCreateRequest {
  name: string;
  label: string;
  type: PackType;
}

export interface DocSummary {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  file: string;
  packName: string;
  folderPath?: string;
}

export interface FoundryDoc {
  _id: string;
  _key: string;
  name: string;
  type?: string;
  system?: Record<string, unknown>;
  items?: FoundryDoc[];
  effects?: FoundryDoc[];
  pages?: FoundryDoc[];
  results?: FoundryDoc[];
  folder?: string | null;
  img?: string;
  [key: string]: unknown;
}

export interface MediaEntry {
  path: string;
  foundryPath: string;
  size: number;
  kind: "file" | "dir";
  mtime: number;
}

export interface BuildEvent {
  kind: "stdout" | "stderr" | "exit" | "error";
  line?: string;
  code?: number | null;
  message?: string;
}
