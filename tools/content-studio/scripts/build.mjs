/**
 * Build: content/ → staging → compilePack → sealPack → output dir.
 *
 * **Default target: `tmp/studio-build/output/` — a scratch/test directory.**
 * The live `packs/` dir is production data; it is NEVER written to without
 * both `--publish` AND `--confirm-overwrite` flags being passed.
 *
 * Usage:
 *   node scripts/build.mjs                                   # test build to scratch
 *   node scripts/build.mjs mutations                         # one pack to scratch
 *   node scripts/build.mjs --publish --confirm-overwrite     # OVERWRITES packs/
 *
 * Walks tools/content-studio/content/<pack>/**\/*.json recursively, copies
 * each file into a per-pack staging directory with _stats volatile fields
 * restamped from system.json, then hands the staging dir to compilePack.
 * Finally forces a full-range WAL compaction so Foundry v13 reads the pack
 * (see seal.mjs for the why).
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  packsDir,
  contentDir,
  scratchStageDir,
  scratchOutputDir,
  repoRoot,
  listPacks,
  readSystemJson,
  ensureDir,
  rmDir,
  studioRoot,
  CONFIRM_TOKEN
} from "./paths.mjs";
import { sealPack } from "./seal.mjs";

const requireFromRepo = createRequire(path.join(packsDir, "_x"));
const { compilePack } = requireFromRepo("@foundryvtt/foundryvtt-cli");
const { ClassicLevel } = requireFromRepo("classic-level");

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

function restampStats(obj, version, coreVersion, modifiedTime) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const v of obj) restampStats(v, version, coreVersion, modifiedTime);
    return;
  }
  if (obj._stats && typeof obj._stats === "object") {
    obj._stats.systemVersion = version;
    obj._stats.coreVersion = coreVersion;
    obj._stats.modifiedTime = modifiedTime;
    if (!("lastModifiedBy" in obj._stats)) obj._stats.lastModifiedBy = null;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") restampStats(v, version, coreVersion, modifiedTime);
  }
}

async function canOpenPack(dir) {
  if (!fs.existsSync(dir)) return true;
  try {
    const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
    await db.open();
    await db.close();
    return true;
  } catch {
    return false;
  }
}

async function buildOne(pack, outputDir, version, coreVersion, modifiedTime) {
  const srcDir = path.join(contentDir, pack.name);
  if (!fs.existsSync(srcDir)) {
    console.log(`  skip  ${pack.name.padEnd(22)} (no content dir)`);
    return 0;
  }
  const stageDir = path.join(scratchStageDir, pack.name);
  rmDir(stageDir);
  ensureDir(stageDir);
  const files = walk(srcDir);
  if (!files.length) {
    console.log(`  skip  ${pack.name.padEnd(22)} (empty content dir)`);
    return 0;
  }
  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    restampStats(doc, version, coreVersion, modifiedTime);
    const id = doc._id ?? path.basename(file, ".json");
    const outName = `${id}.json`;
    fs.writeFileSync(path.join(stageDir, outName), JSON.stringify(doc, null, 2) + "\n");
  }
  const destDir = path.join(outputDir, pack.name);
  if (!(await canOpenPack(destDir))) {
    throw new Error(`Pack dir ${destDir} is locked. Close anything using it and retry.`);
  }
  await compilePack(stageDir, destDir, { log: false, recursive: false });
  const { count } = await sealPack(pack.name, outputDir);
  return count;
}

async function runValidate() {
  const validateScript = path.join(studioRoot, "scripts", "validate.mjs");
  const res = spawnSync(process.execPath, [validateScript], { stdio: "inherit" });
  if (res.status !== 0) throw new Error("Validation failed. Fix errors above and retry.");
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const flags = new Set();
  const names = [];
  for (const a of argv) {
    if (a.startsWith("--")) flags.add(a);
    else names.push(a);
  }
  return { flags, names };
}

async function main() {
  const { flags, names } = parseArgs();
  const skipValidate = flags.has("--skip-validate");
  const publishing = flags.has("--publish");
  const confirmed = flags.has("--confirm-overwrite");

  let outputDir = scratchOutputDir;
  if (publishing) {
    if (!confirmed) {
      console.error(
        "Refusing to publish to packs/ without --confirm-overwrite.\n" +
        "This will overwrite live production LevelDB data.\n" +
        `Token: pass --confirm-overwrite AND --publish together. (confirm-token="${CONFIRM_TOKEN}")`
      );
      process.exitCode = 1;
      return;
    }
    outputDir = packsDir;
  }

  const declared = listPacks();
  const targets = names.length ? declared.filter((p) => names.includes(p.name)) : declared;
  if (!targets.length) {
    console.error("No matching packs in system.json.");
    process.exitCode = 1;
    return;
  }
  if (!skipValidate) await runValidate();

  const system = readSystemJson();
  const version = system.version;
  const coreVersion = String(system.compatibility?.verified ?? system.compatibility?.minimum ?? "13");
  const modifiedTime = Date.UTC(2026, 0, 1, 0, 0, 0);

  ensureDir(scratchStageDir);
  ensureDir(outputDir);

  const mode = publishing ? "PUBLISH → packs/" : "TEST BUILD → scratch";
  console.log(`${mode}`);
  console.log(`  target: ${outputDir}`);
  console.log(`  packs : ${targets.map((p) => p.name).join(", ")}`);
  console.log("");

  for (const pack of targets) {
    const count = await buildOne(pack, outputDir, version, coreVersion, modifiedTime);
    console.log(`  built  ${pack.name.padEnd(22)} ${String(count).padStart(4)} entries`);
  }
  rmDir(scratchStageDir);
  fs.writeFileSync(path.join(studioRoot, ".studio-build-ok"), new Date().toISOString() + "\n");
  console.log("");
  if (publishing) {
    console.log(`Done. Live packs/ overwritten. Review \`git status packs/\` and commit when ready.`);
  } else {
    console.log(`Done. Test packs written to ${path.relative(repoRoot, outputDir)}/. packs/ untouched.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
