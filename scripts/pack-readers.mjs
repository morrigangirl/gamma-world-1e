/**
 * Shared classic-level pack readers for build-time scripts (art
 * prompts, audits, diagnostics). Mirror of the test-side helper in
 * `tests/helpers/pack-sources.mjs`; kept separate so the two
 * namespaces don't cross-import.
 *
 * Since 0.11.x, `tools/content-studio/content/*.json` is the authoring
 * source of truth and the committed `packs/*` LevelDB is the
 * compiled artifact. This reader opens those packs read-only and
 * returns the top-level doc sources callers used to get from the
 * retired `scripts/compendium-content.mjs` factories.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packsRoot = path.join(repoRoot, "packs");

const cache = new Map();

/**
 * Read every top-level document from a committed pack. Skips compendium
 * folders and embedded child docs (actor-owned items, journal pages,
 * rolltable results, item-effects) — those live under `.`-suffixed
 * collection keys that we filter out here.
 *
 * On actor and item packs, the returned top-level docs carry their
 * embedded children as arrays of id strings (that's how Foundry
 * serializes them in the LevelDB). Pass `hydrateEmbedded: true` to
 * replace those id arrays with fully-resolved child docs — matches the
 * shape a pre-0.11 source factory used to produce, and is what the
 * art-prompt builders want so they can enumerate a monster's embedded
 * mutations / weapons / gear.
 */
export async function readPackTopLevel(packName, { hydrateEmbedded = false } = {}) {
  const cacheKey = hydrateEmbedded ? `${packName}::hydrated` : packName;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const packDir = path.join(packsRoot, packName);
  const db = new ClassicLevel(packDir, {
    keyEncoding: "utf8",
    valueEncoding: "json"
  });
  await db.open();
  const topLevel = [];
  const byId = new Map();              // id → top-level doc
  const embeddedItems = new Map();     // parentId → array of hydrated items
  const embeddedEffects = new Map();   // parentId OR `${parentId}.${childId}` → effects
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!")) continue;
      const endBang = key.indexOf("!", 1);
      if (endBang < 0) continue;
      const collection = key.slice(1, endBang);
      if (collection === "folders") continue;

      const idPath = key.slice(endBang + 1);
      if (!collection.includes(".")) {
        // Top-level doc: key is `!<collection>!<id>`.
        topLevel.push(value);
        byId.set(idPath, value);
        continue;
      }

      if (!hydrateEmbedded) continue;

      // Embedded doc: idPath is `<parent>[.<child>…]` and collection is
      // the dotted path of nested collections. We only hydrate one
      // level deep (items + item-effects) since that's what the
      // existing consumers need.
      const segs = idPath.split(".");
      if (collection === "actors.items" && segs.length === 2) {
        const [parentId] = segs;
        const arr = embeddedItems.get(parentId) ?? [];
        arr.push(value);
        embeddedItems.set(parentId, arr);
      } else if (collection === "items.effects" && segs.length === 2) {
        const [parentId] = segs;
        const arr = embeddedEffects.get(parentId) ?? [];
        arr.push(value);
        embeddedEffects.set(parentId, arr);
      }
    }
  } finally {
    await db.close();
  }

  if (hydrateEmbedded) {
    for (const doc of topLevel) {
      if (doc?.type === "character" || doc?.type === "monster" || doc?.type === "npc") {
        const items = embeddedItems.get(doc._id) ?? [];
        doc.items = items;
      }
      // Attach AEs on top-level items (used by some diagnostic / art
      // paths that want to inspect effect changes).
      if (doc?._id && embeddedEffects.has(doc._id)) {
        doc.effects = embeddedEffects.get(doc._id);
      }
    }
  }

  cache.set(cacheKey, topLevel);
  return topLevel;
}

const ABILITY_KEYS = ["ms", "in", "dx", "ch", "cn", "ps"];

/**
 * The committed monsters pack unions the original bestiary (including
 * some robot-typed androids with custom stats) with the 18-entry robot
 * chassis catalog (all-10 abilities, biography quotes the catalog's
 * "Power Source" prose). Use this predicate to split them apart.
 */
export function isRobotChassisCatalogEntry(doc) {
  if (doc?.system?.details?.type !== "robot") return false;
  const allTens = ABILITY_KEYS.every((k) => doc.system?.attributes?.[k]?.value === 10);
  if (!allTens) return false;
  return doc.system?.biography?.value?.includes("Power Source") ?? false;
}

export async function equipmentPackSources() {
  return readPackTopLevel("equipment");
}

export async function mutationPackSources() {
  return readPackTopLevel("mutations");
}

/**
 * Art-prompt builders enumerate a monster's embedded mutations /
 * weapons / gear, so pack docs come back with `items` hydrated to the
 * full child doc shape (not the id-string array Foundry stores).
 */
export async function monsterPackSources() {
  const all = await readPackTopLevel("monsters", { hydrateEmbedded: true });
  return all.filter((doc) => !isRobotChassisCatalogEntry(doc));
}

export async function robotMonsterSources() {
  const all = await readPackTopLevel("monsters", { hydrateEmbedded: true });
  return all.filter(isRobotChassisCatalogEntry);
}
