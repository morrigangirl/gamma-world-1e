/**
 * Build all declared system packs into `packs/<name>/` LevelDB using
 * `@foundryvtt/foundryvtt-cli`. No running Foundry required.
 *
 * Covers every pack listed in `system.json`:
 *   mutations, equipment, sample-actors, monsters, encounter-tables,
 *   roll-tables, cryptic-alliances, robot-chassis, rulebook, system-docs.
 *
 * Each pack's document source lives in `scripts/<...>-content.mjs`:
 *   - `compendium-content.mjs` — the bulk: mutations, equipment, actors,
 *     encounter tables, roll tables, cryptic alliances, robot chassis,
 *     system docs.
 *   - `monster-content.mjs` — the monsters pack.
 *   - `rulebook-content.mjs` — the rulebook pack (reads prose from
 *     `rulebook-prose.generated.mjs`, refreshed via `npm run prose:refresh`).
 *
 * For each doc (and every embedded doc — journal pages, rolltable results,
 * actor-embedded items, item-effects) we assign:
 *   - a stable 16-char `_id` (sha256 of `pack:collection:name:subtype:index`
 *     for top-level docs; `pack:collection:parentId:index:name` for
 *     embedded), truncated and A-Za-z0-9 filtered to 16 chars,
 *   - a `_key` in the `!<collection>!<path>` format the CLI needs,
 *   - Foundry's core document fields (`_stats`, `ownership`, `flags`,
 *     `folder`, `sort`) so v13's DataModel validator accepts them and the
 *     compendium index populates in the UI.
 *
 * The stableId seed is deterministic: renaming a doc or reordering
 * same-named siblings changes an `_id`, but editing any non-name field
 * does not. A diagnostic probe (`scripts/id-stability-probe.mjs`)
 * verifies every committed `_id` is reproduced by this builder before
 * any rebuild — run it if you suspect drift.
 *
 * Safe to run any time Foundry is not actively holding a lock on any
 * `packs/<name>/LOCK`. Foundry can stay closed during the build; on
 * next launch Foundry will pick up the rebuilt LevelDBs.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

import {
  mutationPackSources,
  equipmentPackSources,
  actorPackSources,
  encounterTableSources,
  rollTablePackSources,
  crypticAlliancePackSources,
  robotChassisPackSources,
  journalPackSources
} from "./compendium-content.mjs";
import { monsterPackSources } from "./monster-content.mjs";
import { rulebookPackSources } from "./rulebook-content.mjs";

const systemJson = JSON.parse(
  fs.readFileSync(new URL("../system.json", import.meta.url), "utf8")
);
const SYSTEM_ID = systemJson.id;
const SYSTEM_VERSION = systemJson.version;
const CORE_VERSION = String(systemJson.compatibility?.verified ?? "13");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const repoPacksDir = path.join(repoRoot, "packs");
const tempRoot = path.join(repoRoot, "tmp", "compendia-build");

const FIXED_CREATED_TIME = Date.UTC(2024, 0, 1);
const FIXED_MODIFIED_TIME = Date.UTC(2026, 0, 1);

const TYPE_TO_COLLECTION = {
  Item: "items",
  Actor: "actors",
  JournalEntry: "journal",
  RollTable: "tables"
};

/**
 * For each collection, the doc fields that hold embedded children and the
 * leaf collection name used in keys. Mirrors Foundry's document hierarchy.
 */
const EMBEDDED_HIERARCHY = {
  actors:  { items: "items",  effects: "effects" },
  items:   { effects: "effects" },
  journal: { pages: "pages" },
  tables:  { results: "results" }
};

function stableId(seed) {
  const hash = crypto.createHash("sha256").update(seed).digest("base64");
  return hash.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
}

function baseStats() {
  return {
    coreVersion: CORE_VERSION,
    systemId: SYSTEM_ID,
    systemVersion: SYSTEM_VERSION,
    createdTime: FIXED_CREATED_TIME,
    modifiedTime: FIXED_MODIFIED_TIME,
    lastModifiedBy: null,
    compendiumSource: null,
    duplicateSource: null
  };
}

/**
 * Inject Foundry's core document fields. Without these, v13 silently drops
 * the doc from the pack index and the compendium appears empty.
 */
function ensureCoreDocFields(doc, { isPage = false, isResult = false } = {}) {
  if (!doc.flags) doc.flags = {};
  if (!("folder" in doc)) doc.folder = null;
  if (!("sort" in doc)) doc.sort = 0;
  if (!doc.ownership) {
    // Pages/results inherit from their parent; OBSERVER baseline (-1) means
    // "defer to parent". Top-level docs default to 0 (NONE — only the owner
    // and GM see them unless promoted).
    doc.ownership = (isPage || isResult) ? { default: -1 } : { default: 0 };
  }
  if (!doc._stats) doc._stats = baseStats();
  return doc;
}

/**
 * Recursively assign `_id`, `_key`, and core fields to a doc and every
 * embedded doc. The seed threads through the whole tree so same-named
 * siblings get distinct IDs via their index position.
 *
 * `seedIndex` distinguishes same-named top-level docs (e.g. a physical
 * "Attraction Odor" mutation and a plant "Attraction Odor" mutation).
 */
function prepareDocument(doc, collection, packSeed, parentIdPath = [], seedIndex = null) {
  if (!doc._id) {
    // Include a secondary discriminator (subtype + index) to survive
    // same-named siblings. Falls back to just the name if neither exists.
    const subtype = doc.system?.subtype ?? doc.system?.reference?.table ?? "";
    const indexPart = seedIndex == null ? "" : `:${seedIndex}`;
    doc._id = stableId(`${packSeed}:${collection}:${doc.name ?? ""}:${subtype}${indexPart}`);
  }
  const idPath = [...parentIdPath, doc._id];
  doc._key = `!${collection}!${idPath.join(".")}`;
  const isTopLevel = parentIdPath.length === 0;
  ensureCoreDocFields(doc, {
    isPage: collection.endsWith(".pages"),
    isResult: collection.endsWith(".results")
  });
  if (!isTopLevel) {
    // Embedded docs don't carry folder/sort-under-pack semantics, but
    // removing them would break Foundry's hydrate step for some types.
    // Leaving the defaults from ensureCoreDocFields is correct.
  }

  const embedded = EMBEDDED_HIERARCHY[collection] ?? {};
  for (const [field, leaf] of Object.entries(embedded)) {
    const value = doc[field];
    if (!Array.isArray(value)) continue;
    const childCollection = `${collection}.${leaf}`;
    value.forEach((child, index) => {
      if (!child._id) {
        child._id = stableId(
          `${packSeed}:${childCollection}:${doc._id}:${index}:${child.name ?? ""}`
        );
      }
      prepareDocument(child, childCollection, packSeed, idPath);
    });
  }
  return doc;
}

/**
 * Full pack lineup. Order here is also the order in which packs are
 * built; each is independent. Filter on CLI args to build a subset:
 *   `node scripts/build-compendia.mjs equipment monsters`
 */
const ALL_PACK_SPECS = [
  { name: "mutations",         type: "Item",         load: () => mutationPackSources() },
  { name: "equipment",         type: "Item",         load: () => equipmentPackSources() },
  { name: "sample-actors",     type: "Actor",        load: () => actorPackSources() },
  { name: "monsters",          type: "Actor",        load: () => monsterPackSources() },
  { name: "encounter-tables",  type: "RollTable",    load: () => encounterTableSources() },
  { name: "roll-tables",       type: "RollTable",    load: () => rollTablePackSources() },
  { name: "cryptic-alliances", type: "JournalEntry", load: () => crypticAlliancePackSources() },
  { name: "robot-chassis",     type: "JournalEntry", load: () => robotChassisPackSources() },
  { name: "rulebook",          type: "JournalEntry", load: () => rulebookPackSources() },
  { name: "system-docs",       type: "JournalEntry", load: () => journalPackSources() }
];

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function buildPack(spec) {
  const collection = TYPE_TO_COLLECTION[spec.type];
  if (!collection) throw new Error(`Unknown pack type "${spec.type}" for "${spec.name}"`);

  const documents = spec.load();

  const workDir = path.join(tempRoot, spec.name);
  const destDir = path.join(repoPacksDir, spec.name);
  cleanDir(workDir);

  documents.forEach((doc, index) => {
    prepareDocument(doc, collection, spec.name, [], index);
    fs.writeFileSync(
      path.join(workDir, `${doc._id}.json`),
      JSON.stringify(doc, null, 2),
      "utf8"
    );
  });

  cleanDir(destDir);
  await compilePack(workDir, destDir, { log: false });
  return documents.length;
}

async function main() {
  const requested = process.argv.slice(2);
  const specs = requested.length > 0
    ? ALL_PACK_SPECS.filter((s) => requested.includes(s.name))
    : ALL_PACK_SPECS;

  if (requested.length > 0 && specs.length !== requested.length) {
    const known = new Set(ALL_PACK_SPECS.map((s) => s.name));
    const missing = requested.filter((r) => !known.has(r));
    throw new Error(`Unknown pack name(s): ${missing.join(", ")}. Known: ${[...known].join(", ")}.`);
  }

  fs.mkdirSync(repoPacksDir, { recursive: true });
  cleanDir(tempRoot);

  for (const spec of specs) {
    const count = await buildPack(spec);
    console.log(`  built ${spec.name.padEnd(20)} ${String(count).padStart(4)} top-level doc(s)`);
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });

  console.log("");
  console.log(
    `Compiled ${specs.length} pack${specs.length === 1 ? "" : "s"} into packs/. ` +
    `Reload the world (or the compendium) to see changes. ` +
    `Run \`npm run seal:packs\` to seal the LevelDB WAL.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
