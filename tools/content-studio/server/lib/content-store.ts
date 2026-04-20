import fs from "node:fs";
import path from "node:path";
import { contentDir } from "./paths.js";
import { getPack, packCollection } from "./pack-meta.js";
import { embeddedKey, isValidId, keyFor, newId } from "./id.js";
import type { DocSummary, FoundryDoc, PackType } from "../../shared/types.js";

const EMBEDDED_MAP: Record<string, Record<string, string>> = {
  actors: { items: "items", effects: "effects" },
  items: { effects: "effects" },
  journal: { pages: "pages" },
  tables: { results: "results" }
};

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile() && entry.name.endsWith(".json")) out.push(abs);
    }
  }
  return out;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9А-я]/g, "_");
}

function packDir(packName: string): string {
  return path.join(contentDir, packName);
}

function rewriteEmbeddedKeys(doc: FoundryDoc, collection: string, parentIdChain: string, parentKeyChain: string): void {
  const children = EMBEDDED_MAP[collection] ?? {};
  for (const [field, childCollection] of Object.entries(children)) {
    const list = (doc as any)[field];
    if (!Array.isArray(list)) continue;
    for (const child of list) {
      if (!isValidId(child._id)) child._id = newId();
      const ids = `${parentIdChain}.${child._id}`;
      const sublevel = `${parentKeyChain}.${childCollection}`;
      child._key = `!${sublevel}!${ids}`;
      rewriteEmbeddedKeys(child, childCollection, ids, sublevel);
    }
  }
}

export function listDocs(packName: string): DocSummary[] {
  const pack = getPack(packName);
  if (!pack) throw new Error(`unknown pack: ${packName}`);
  const dir = packDir(packName);
  const files = walk(dir);
  const out: DocSummary[] = [];
  for (const file of files) {
    try {
      const doc = JSON.parse(fs.readFileSync(file, "utf8")) as FoundryDoc;
      const collection = doc._key?.split("!")?.[1];
      if (collection === "folders") continue;
      const rel = path.relative(dir, file);
      out.push({
        id: doc._id,
        name: doc.name ?? "(unnamed)",
        type: doc.type ?? pack.type,
        subtype: (doc.system as any)?.subtype ?? (doc.system as any)?.category,
        file: rel,
        packName,
        folderPath: path.dirname(rel) === "." ? undefined : path.dirname(rel)
      });
    } catch {
      // skip unreadable files
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function countDocs(packName: string): number {
  return listDocs(packName).length;
}

export function readDoc(packName: string, id: string): { doc: FoundryDoc; file: string } {
  const dir = packDir(packName);
  const files = walk(dir);
  for (const file of files) {
    try {
      const doc = JSON.parse(fs.readFileSync(file, "utf8")) as FoundryDoc;
      if (doc._id === id) return { doc, file };
    } catch {
      // skip
    }
  }
  throw Object.assign(new Error(`doc ${id} not found in pack ${packName}`), { status: 404 });
}

export function writeDoc(packName: string, id: string, body: FoundryDoc): FoundryDoc {
  const pack = getPack(packName);
  if (!pack) throw new Error(`unknown pack: ${packName}`);
  if (body._id !== id) throw Object.assign(new Error("_id in body does not match URL"), { status: 400 });
  if (!isValidId(id)) throw Object.assign(new Error("invalid _id"), { status: 400 });
  const collection = packCollection(pack.type as PackType);
  body._key = keyFor(collection, id);
  rewriteEmbeddedKeys(body, collection, id, collection);

  const { file } = readDoc(packName, id);
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
  return body;
}

export function deleteDoc(packName: string, id: string): void {
  const { file } = readDoc(packName, id);
  fs.unlinkSync(file);
}

function skeletonFor(type: PackType, name: string): FoundryDoc {
  const id = newId();
  const collection = packCollection(type);
  const base: FoundryDoc = {
    _id: id,
    _key: keyFor(collection, id),
    name,
    flags: {},
    sort: 0,
    ownership: { default: 0 } as any,
    _stats: {
      systemId: "gamma-world-1e",
      createdTime: Date.now(),
      compendiumSource: null,
      duplicateSource: null
    } as any
  };
  switch (type) {
    case "Item":
      base.type = "gear";
      base.system = { description: { value: "" }, quantity: 1, weight: 0 };
      base.effects = [];
      break;
    case "Actor":
      base.type = "monster";
      base.system = {
        details: { type: "monster", level: 1 },
        attributes: {},
        resources: { hp: { value: 10, max: 10 } },
        biography: { value: "" }
      };
      base.items = [];
      base.effects = [];
      break;
    case "JournalEntry":
      base.pages = [];
      break;
    case "RollTable":
      base.formula = "1d20";
      base.results = [];
      break;
  }
  return base;
}

export function createDoc(packName: string, draft: Partial<FoundryDoc>): FoundryDoc {
  const pack = getPack(packName);
  if (!pack) throw new Error(`unknown pack: ${packName}`);
  const name = (draft.name as string) || "Untitled";
  const doc = skeletonFor(pack.type as PackType, name);
  if (draft.type) doc.type = draft.type;
  if (draft.system) doc.system = draft.system as Record<string, unknown>;
  const dir = packDir(packName);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${safeFilename(name)}_${doc._id}.json`);
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  return doc;
}

export function packCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pack of fs.readdirSync(contentDir, { withFileTypes: true })) {
    if (!pack.isDirectory()) continue;
    out[pack.name] = listDocs(pack.name).length;
  }
  return out;
}
