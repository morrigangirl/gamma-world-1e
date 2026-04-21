import fs from "node:fs";
import path from "node:path";
import { contentDir, systemJsonPath } from "./paths.js";
import type { PackDescriptor, PackType } from "../../shared/types.js";

interface SystemJsonPack {
  name: string;
  label: string;
  path: string;
  type: PackType;
  system?: string;
}

const PACK_NAME_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const KNOWN_TYPES: PackType[] = ["Item", "Actor", "JournalEntry", "RollTable"];
const SYSTEM_ID = "gamma-world-1e";

let cache: SystemJsonPack[] | null = null;

function load(): SystemJsonPack[] {
  if (cache) return cache;
  const json = JSON.parse(fs.readFileSync(systemJsonPath, "utf8"));
  cache = json.packs ?? [];
  return cache!;
}

export function invalidatePackCache(): void {
  cache = null;
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

export function isValidPackName(name: unknown): name is string {
  return typeof name === "string" && PACK_NAME_RE.test(name);
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

function dirIsNonEmpty(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((n) => !n.startsWith("."));
  } catch {
    return false;
  }
}

export interface PackCreateInput {
  name: unknown;
  label: unknown;
  type: unknown;
}

export function addPack(input: PackCreateInput): PackDescriptor {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const type = input.type as PackType;

  if (!isValidPackName(name)) {
    throw httpError(
      400,
      `invalid name: must match ${PACK_NAME_RE} (lowercase kebab-case, 3–40 chars, no leading/trailing hyphen)`
    );
  }
  if (!label || label.length > 100) {
    throw httpError(400, "invalid label: must be 1–100 non-blank characters");
  }
  if (!KNOWN_TYPES.includes(type)) {
    throw httpError(400, `invalid type: must be one of ${KNOWN_TYPES.join(", ")}`);
  }

  // Re-read from disk; don't trust the in-memory cache for uniqueness.
  const raw = fs.readFileSync(systemJsonPath, "utf8");
  const system = JSON.parse(raw);
  const existing: SystemJsonPack[] = Array.isArray(system.packs) ? system.packs : [];

  if (existing.some((p) => p.name === name)) {
    throw httpError(409, `pack "${name}" already exists in system.json`);
  }
  const contentTarget = path.join(contentDir, name);
  if (dirIsNonEmpty(contentTarget)) {
    throw httpError(409, `content/${name}/ already exists and is not empty`);
  }

  const newPack: SystemJsonPack = {
    name,
    label,
    path: `packs/${name}`,
    type,
    system: SYSTEM_ID
  };
  system.packs = [...existing, newPack];

  const serialized = JSON.stringify(system, null, 2) + "\n";
  const tmp = systemJsonPath + ".tmp";
  fs.writeFileSync(tmp, serialized);
  fs.renameSync(tmp, systemJsonPath);

  fs.mkdirSync(contentTarget, { recursive: true });

  invalidatePackCache();

  return {
    name: newPack.name,
    label: newPack.label,
    type: newPack.type,
    path: newPack.path,
    count: 0
  };
}
