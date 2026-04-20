/**
 * Pack source readers for unit tests.
 *
 * Since 0.11.x, committed LevelDB packs under `packs/` are the system's
 * source of truth for compendium content. The content-studio pipeline
 * at `tools/content-studio/` owns authoring; this helper is the
 * read-only counterpart used by rule-invariant tests that historically
 * imported the now-retired `scripts/compendium-content.mjs` factories.
 *
 * Each helper returns an async array of top-level doc sources —
 * embedded documents (actor-owned items, journal pages, rolltable
 * results, item-effects) are left to their parent. Test invariants
 * that care about embeddables either read through `doc.items` (array
 * of item IDs) or re-open the pack with their own iterator.
 *
 * Packs are opened lazily and cached. Each DB is closed immediately
 * after reading; Node's test runner doesn't need a persistent handle.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const packsRoot = path.join(repoRoot, "packs");

/** In-memory cache: pack name → array of top-level doc sources. */
const cache = new Map();

/**
 * Iterate every key in a pack and return the top-level docs only.
 *
 * LevelDB key format (set by the content-studio build):
 *   !items!<id>                 — top-level Item
 *   !actors!<id>                — top-level Actor
 *   !journal!<id>               — top-level JournalEntry
 *   !tables!<id>                — top-level RollTable
 *   !folders!<id>               — compendium folder (skipped)
 *   !actors.items!<parent>.<id> — embedded item on an actor (skipped)
 *   !items.effects!<parent>.<id>— embedded AE on an item (skipped)
 *   !actors.items.effects!…     — embedded AE on an actor-owned item
 *                                 (skipped)
 *
 * Anything with a "." in the collection portion is embedded. Folders
 * are also skipped — they're not compendium content.
 */
async function readTopLevelDocs(packName) {
  if (cache.has(packName)) return cache.get(packName);

  const packDir = path.join(packsRoot, packName);
  const db = new ClassicLevel(packDir, {
    keyEncoding: "utf8",
    valueEncoding: "json"
  });
  await db.open();
  const docs = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!")) continue;
      const endBang = key.indexOf("!", 1);
      if (endBang < 0) continue;
      const collection = key.slice(1, endBang);
      if (collection === "folders") continue;
      if (collection.includes(".")) continue; // embedded doc
      docs.push(value);
    }
  } finally {
    await db.close();
  }
  cache.set(packName, docs);
  return docs;
}

export async function equipmentPackSources() {
  return readTopLevelDocs("equipment");
}

export async function actorPackSources() {
  return readTopLevelDocs("sample-actors");
}

/**
 * The committed monsters pack is the UNION of two legacy factories:
 *   - `monsterPackSources()` — the bestiary (varied ability scores;
 *     some entries carry `details.type === "robot"`, e.g. Android
 *     Warrior, but are not part of the 18-chassis catalog).
 *   - `robotMonsterSources()` — the 18-entry robot chassis catalog
 *     (ability scores all default to 10 per owner preference; each
 *     biography quotes the catalog's "Power Source" prose).
 *
 * Since the pack itself doesn't carry a discriminator flag, split the
 * two back out by the catalog's two load-bearing invariants. Anything
 * matching BOTH (all-10 abilities AND "Power Source" in biography) is
 * a catalog chassis; everything else is bestiary.
 */
const ABILITY_KEYS = ["ms", "in", "dx", "ch", "cn", "ps"];

function isRobotChassisCatalogEntry(doc) {
  if (doc?.system?.details?.type !== "robot") return false;
  const allTens = ABILITY_KEYS.every((k) => doc.system?.attributes?.[k]?.value === 10);
  if (!allTens) return false;
  return doc.system?.biography?.value?.includes("Power Source") ?? false;
}

export async function monsterPackSources() {
  const all = await readTopLevelDocs("monsters");
  return all.filter((doc) => !isRobotChassisCatalogEntry(doc));
}

export async function robotMonsterSources() {
  const all = await readTopLevelDocs("monsters");
  return all.filter(isRobotChassisCatalogEntry);
}

export async function journalPackSources() {
  return readTopLevelDocs("system-docs");
}
