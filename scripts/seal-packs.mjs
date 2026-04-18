/**
 * Seal committed LevelDB packs under `packs/` so Foundry v13 can read them.
 *
 * Problem: `@foundryvtt/foundryvtt-cli`'s `compilePack` writes most of a pack's
 * content into the write-ahead log (`NNNNNN.log`). Foundry v13's bundled
 * LevelDB reads that WAL with a slightly different record-parsing tolerance
 * than the LevelDB that produced it, and in practice replays the log as
 * "0 bytes OK" — silently discarding every entry. The recovery path then
 * moves leftover fragments into `packs/<name>/lost/`, leaving the pack empty
 * in the Foundry compendium browser.
 *
 * SSTable (`.ldb`) format is far more stable across LevelDB generations than
 * the WAL format. This script opens each committed pack with `classic-level`,
 * forces a compaction, and closes — which drains the WAL into a sealed
 * SSTable and leaves the pack in a sealed-everywhere state that Foundry
 * reliably reads.
 *
 * Usage:  node scripts/seal-packs.mjs [pack1 pack2 ...]
 *   (no args = seal every pack listed in system.json that exists on disk)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const systemJsonPath = path.join(repoRoot, "system.json");
const packsRoot = path.join(repoRoot, "packs");

function listDeclaredPacks() {
  const system = JSON.parse(fs.readFileSync(systemJsonPath, "utf8"));
  return (system.packs ?? [])
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(packsRoot, name)));
}

async function sealPack(name) {
  const packDir = path.join(packsRoot, name);
  const db = new ClassicLevel(packDir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  let count = 0;
  for await (const _entry of db.iterator()) count += 1;
  await db.compactRange(
    Buffer.from([0x00]),
    Buffer.from([0xff, 0xff, 0xff, 0xff])
  );
  await db.close();
  return count;
}

async function main() {
  const requested = process.argv.slice(2);
  const packs = requested.length > 0 ? requested : listDeclaredPacks();
  if (packs.length === 0) {
    console.log("No packs to seal.");
    return;
  }
  for (const name of packs) {
    const count = await sealPack(name);
    console.log(`  sealed ${name.padEnd(20)} ${String(count).padStart(4)} entries`);
  }
  console.log(`\nDone. ${packs.length} pack(s) sealed. Review \`git status packs/\` and commit.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
