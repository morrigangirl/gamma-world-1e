/**
 * Seal LevelDB compendium packs so Foundry v13 reads them correctly.
 *
 * `sealPack(name, baseDir)` works on any pack dir — scratch or live.
 * By default, the CLI seals live `packs/` (manual operator tool).
 *
 * Why this exists: `compilePack` writes most of a pack's records into the
 * LevelDB write-ahead log. Foundry v13's bundled LevelDB replays the WAL
 * differently than the one that wrote it and treats every entry as "0 bytes
 * OK" — silently dropping them. Forcing a full-range compaction flushes the
 * WAL into a sealed SSTable that Foundry reads reliably.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { packsDir, listPacks } from "./paths.mjs";

const requireFromRepo = createRequire(path.join(packsDir, "_x"));
const { ClassicLevel } = requireFromRepo("classic-level");

export async function sealPack(name, baseDir = packsDir) {
  const dir = path.join(baseDir, name);
  if (!fs.existsSync(dir)) return { count: 0, skipped: true };
  const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  let count = 0;
  for await (const _entry of db.iterator()) count += 1;
  await db.compactRange(
    Buffer.from([0x00]),
    Buffer.from([0xff, 0xff, 0xff, 0xff])
  );
  await db.close();
  return { count, skipped: false };
}

async function main() {
  const requested = process.argv.slice(2);
  const declared = listPacks()
    .map((p) => p.name)
    .filter((n) => fs.existsSync(path.join(packsDir, n)));
  const targets = requested.length ? requested : declared;
  if (!targets.length) {
    console.log("No packs to seal.");
    return;
  }
  console.log(`Sealing live packs at ${packsDir}:`);
  for (const name of targets) {
    const { count, skipped } = await sealPack(name, packsDir);
    if (skipped) console.log(`  skipped ${name.padEnd(20)} (not on disk)`);
    else console.log(`  sealed ${name.padEnd(20)} ${String(count).padStart(4)} entries`);
  }
  console.log(`\nDone. ${targets.length} pack(s) processed.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
