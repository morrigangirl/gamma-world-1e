/**
 * Validate content/ for id/_key correctness before building.
 *
 * Checks:
 *   - Every JSON file has a 16-char base64url _id and a _key starting with
 *     !<collection>!<id-chain>.
 *   - _key's id-chain matches _id (and embedded _key chains match their
 *     parents).
 *   - No duplicate _id within a pack (counts primary docs only).
 *   - Embedded children (items, effects, pages, results) have keys of the
 *     form !<parent-collection>.<child-collection>!<parent-id>.<child-id>.
 *
 * Exit code: 0 = clean, 1 = problems found.
 *
 * Usage:
 *   node scripts/validate.mjs              # all packs
 *   node scripts/validate.mjs mutations    # one pack
 */

import fs from "node:fs";
import path from "node:path";
import { contentDir, listPacks } from "./paths.mjs";

const ID_RE = /^[A-Za-z0-9_-]{16}$/;

const HIERARCHY = {
  actors: { items: "items", effects: "effects" },
  items: { effects: "effects" },
  journal: { pages: "pages" },
  tables: { results: "results" }
};

const PACK_COLLECTION = {
  Item: "items",
  Actor: "actors",
  JournalEntry: "journal",
  RollTable: "tables"
};

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile() && entry.name.endsWith(".json")) out.push(abs);
    }
  }
  return out;
}

function check(errors, cond, msg) {
  if (!cond) errors.push(msg);
}

function validateEmbedded(doc, collection, idChain, keyChain, errors, file) {
  const children = HIERARCHY[collection] ?? {};
  for (const [field, childCollection] of Object.entries(children)) {
    const list = doc[field];
    if (list == null) continue;
    if (!Array.isArray(list)) {
      errors.push(`${file}: embedded '${field}' must be an array`);
      continue;
    }
    const seen = new Set();
    for (const child of list) {
      check(errors, ID_RE.test(child._id ?? ""), `${file}: embedded ${field} missing/bad _id`);
      check(errors, !seen.has(child._id), `${file}: duplicate embedded _id '${child._id}' in ${field}`);
      seen.add(child._id);
      const sublevel = `${keyChain}.${childCollection}`;
      const ids = `${idChain}.${child._id}`;
      const expectedKey = `!${sublevel}!${ids}`;
      if (child._key !== expectedKey) {
        errors.push(`${file}: embedded _key mismatch: got '${child._key}', expected '${expectedKey}'`);
      }
      validateEmbedded(child, childCollection, ids, sublevel, errors, file);
    }
  }
}

function validateFile(file, pack, errors, idRegistry) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${file}: invalid JSON (${e.message})`);
    return;
  }
  const topCollection = doc._key?.split("!")?.[1];
  if (topCollection === "folders") {
    check(errors, ID_RE.test(doc._id ?? ""), `${file}: folder _id invalid`);
    check(errors, doc._key === `!folders!${doc._id}`, `${file}: folder _key should be !folders!${doc._id}`);
    return;
  }
  const expectedCollection = PACK_COLLECTION[pack.type];
  check(errors, ID_RE.test(doc._id ?? ""), `${file}: _id must be 16 chars of [A-Za-z0-9_-]`);
  check(errors, doc._key === `!${expectedCollection}!${doc._id}`, `${file}: _key must be !${expectedCollection}!${doc._id}`);

  if (idRegistry.has(doc._id)) {
    errors.push(`${file}: duplicate _id '${doc._id}' (also in ${idRegistry.get(doc._id)})`);
  } else {
    idRegistry.set(doc._id, file);
  }

  validateEmbedded(doc, expectedCollection, doc._id, expectedCollection, errors, file);
}

async function main() {
  const requested = process.argv.slice(2);
  const declared = listPacks();
  const targets = requested.length
    ? declared.filter((p) => requested.includes(p.name))
    : declared;
  const errors = [];
  let fileCount = 0;
  for (const pack of targets) {
    const dir = path.join(contentDir, pack.name);
    const files = walk(dir);
    fileCount += files.length;
    const idRegistry = new Map();
    for (const f of files) validateFile(f, pack, errors, idRegistry);
  }
  if (errors.length) {
    console.error(`Validation failed (${errors.length} problem(s) in ${fileCount} file(s)):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Validation OK: ${fileCount} file(s) across ${targets.length} pack(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
