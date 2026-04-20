/**
 * Bootstrap extract: dump committed LevelDB packs to editable JSON.
 *
 * Reads packs/<name>/ straight off disk and writes one JSON file per primary
 * Document to content/<name>/. The legacy scripts/compendium-content.mjs et al.
 * are NEVER invoked. ref/ is never read.
 *
 * Volatile _stats fields (modifiedTime, lastModifiedBy, coreVersion,
 * systemVersion) are stripped from each extracted doc so the JSON stays
 * stable across builds by different engines / at different times.
 *
 * Mutations get folder-structured output so the four mutation subtype folders
 * (mental/physical/plant/defect) survive round-trips. Every other pack is
 * flat.
 *
 * Usage:
 *   node scripts/extract.mjs                 # all packs
 *   node scripts/extract.mjs mutations       # one pack
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { packsDir, contentDir, listPacks, ensureDir } from "./paths.mjs";

const requireFromRepo = createRequire(path.join(packsDir, "_x"));
const { extractPack } = requireFromRepo("@foundryvtt/foundryvtt-cli");

const FOLDER_PACKS = new Set(["mutations"]);

function stripVolatile(obj) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const v of obj) stripVolatile(v);
    return;
  }
  if (obj._stats && typeof obj._stats === "object") {
    delete obj._stats.modifiedTime;
    delete obj._stats.lastModifiedBy;
    delete obj._stats.coreVersion;
    delete obj._stats.systemVersion;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") stripVolatile(v);
  }
}

function walkJsonFiles(dir) {
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

async function extractOne(pack) {
  const src = path.join(packsDir, pack.name);
  const dest = path.join(contentDir, pack.name);
  if (!fs.existsSync(src)) {
    console.log(`  skip  ${pack.name.padEnd(22)} (packs/${pack.name} does not exist)`);
    return 0;
  }
  ensureDir(dest);
  await extractPack(src, dest, {
    clean: true,
    folders: FOLDER_PACKS.has(pack.name),
    jsonOptions: { space: 2 },
    log: false
  });
  const files = walkJsonFiles(dest);
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(f, "utf8"));
    stripVolatile(doc);
    fs.writeFileSync(f, JSON.stringify(doc, null, 2) + "\n");
  }
  return files.length;
}

async function main() {
  const requested = process.argv.slice(2);
  const declared = listPacks();
  const targets = requested.length
    ? declared.filter((p) => requested.includes(p.name))
    : declared;
  if (!targets.length) {
    console.error("No matching packs in system.json.");
    process.exitCode = 1;
    return;
  }
  ensureDir(contentDir);
  let total = 0;
  console.log(`Extracting ${targets.length} pack(s) to ${path.relative(process.cwd(), contentDir)}/ ...`);
  for (const pack of targets) {
    const count = await extractOne(pack);
    console.log(`  wrote ${pack.name.padEnd(22)} ${String(count).padStart(4)} files`);
    total += count;
  }
  console.log(`\nDone. ${total} file(s) extracted.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
