import fs from "node:fs";
import { systemJsonPath } from "./paths.js";
import type { PackDescriptor, PackType } from "../../shared/types.js";

interface SystemJsonPack {
  name: string;
  label: string;
  path: string;
  type: PackType;
  system?: string;
}

let cache: SystemJsonPack[] | null = null;

function load(): SystemJsonPack[] {
  if (cache) return cache;
  const json = JSON.parse(fs.readFileSync(systemJsonPath, "utf8"));
  cache = json.packs ?? [];
  return cache!;
}

export function listPackDescriptors(): Omit<PackDescriptor, "count">[] {
  return load().map((p) => ({ name: p.name, label: p.label, type: p.type, path: p.path }));
}

export function getPack(name: string): SystemJsonPack | undefined {
  return load().find((p) => p.name === name);
}

export function packCollection(type: PackType): string {
  switch (type) {
    case "Item": return "items";
    case "Actor": return "actors";
    case "JournalEntry": return "journal";
    case "RollTable": return "tables";
  }
}
