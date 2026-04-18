/**
 * Diagnostic only — not a build step.
 *
 * For every pack we plan to (re)build, opens the existing LevelDB and
 * compares every document's `_id` against what the proposed extended
 * `build-compendia.mjs` would produce from the pack's source generator.
 *
 * Covers top-level docs AND embedded docs (item effects, actor-embedded
 * items, rolltable results, journal pages). A mismatch anywhere means a
 * world-level reference to that doc would orphan on a rebuild.
 *
 * Exits 0 unconditionally; this is a read-only probe.
 */

import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TYPE_TO_COLLECTION = {
  Item: "items",
  Actor: "actors",
  JournalEntry: "journal",
  RollTable: "tables"
};

const EMBEDDED_HIERARCHY = {
  actors:  { items: "items",  effects: "effects" },
  items:   { effects: "effects" },
  journal: { pages: "pages" },
  tables:  { results: "results" }
};

const packSpecs = [
  { name: "mutations",         type: "Item",         documents: mutationPackSources() },
  { name: "equipment",         type: "Item",         documents: equipmentPackSources() },
  { name: "sample-actors",     type: "Actor",        documents: actorPackSources() },
  { name: "monsters",          type: "Actor",        documents: monsterPackSources() },
  { name: "encounter-tables",  type: "RollTable",    documents: encounterTableSources() },
  { name: "roll-tables",       type: "RollTable",    documents: rollTablePackSources() },
  { name: "cryptic-alliances", type: "JournalEntry", documents: crypticAlliancePackSources() },
  { name: "robot-chassis",     type: "JournalEntry", documents: robotChassisPackSources() },
  { name: "rulebook",          type: "JournalEntry", documents: rulebookPackSources() },
  { name: "system-docs",       type: "JournalEntry", documents: journalPackSources() }
];

function stableId(seed) {
  const hash = crypto.createHash("sha256").update(seed).digest("base64");
  return hash.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
}

/**
 * Mirror of build-compendia.mjs `prepareDocument` but without mutating
 * the source doc — just returns a map of `_key` -> expected `_id`.
 */
function walkProposed(doc, collection, packSeed, parentIdPath, seedIndex, out) {
  const subtype = doc.system?.subtype ?? doc.system?.reference?.table ?? "";
  const indexPart = seedIndex == null ? "" : `:${seedIndex}`;
  const id = doc._id ?? stableId(`${packSeed}:${collection}:${doc.name ?? ""}:${subtype}${indexPart}`);
  const idPath = [...parentIdPath, id];
  const key = `!${collection}!${idPath.join(".")}`;
  out.push({ key, id, name: doc.name ?? "", collection, parent: parentIdPath.join(".") });

  const embedded = EMBEDDED_HIERARCHY[collection] ?? {};
  for (const [field, leaf] of Object.entries(embedded)) {
    const value = doc[field];
    if (!Array.isArray(value)) continue;
    const childCollection = `${collection}.${leaf}`;
    value.forEach((child, index) => {
      const childSeed = `${packSeed}:${childCollection}:${id}:${index}:${child.name ?? ""}`;
      const childDoc = { ...child, _id: child._id ?? stableId(childSeed) };
      walkProposed(childDoc, childCollection, packSeed, idPath, null, out);
    });
  }
}

async function readPackKeys(packDir) {
  const db = new ClassicLevel(packDir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  const entries = new Map();
  for await (const [key, value] of db.iterator()) {
    entries.set(key, { name: value?.name ?? "", value });
  }
  await db.close();
  return entries;
}

async function probePack(spec) {
  const collection = TYPE_TO_COLLECTION[spec.type];
  if (!collection) throw new Error(`Unknown pack type ${spec.type}`);
  const packDir = path.join(repoRoot, "packs", spec.name);

  let existing;
  try {
    existing = await readPackKeys(packDir);
  } catch (error) {
    return { name: spec.name, error: error.message };
  }

  const proposed = [];
  spec.documents.forEach((doc, index) => {
    walkProposed(doc, collection, spec.name, [], index, proposed);
  });

  let topMatched = 0;
  let topMismatched = 0;
  let embMatched = 0;
  let embMismatched = 0;
  const misses = [];
  for (const entry of proposed) {
    const isTop = !entry.parent;
    if (existing.has(entry.key)) {
      if (isTop) topMatched += 1; else embMatched += 1;
    } else {
      if (isTop) topMismatched += 1; else embMismatched += 1;
      misses.push(entry);
    }
  }

  // Any existing keys not in proposed set?
  const proposedKeys = new Set(proposed.map((e) => e.key));
  const stale = [];
  for (const [key] of existing) {
    if (!proposedKeys.has(key)) stale.push(key);
  }

  return {
    name: spec.name,
    topLevelCount: spec.documents.length,
    totalProposed: proposed.length,
    totalExisting: existing.size,
    topMatched,
    topMismatched,
    embMatched,
    embMismatched,
    misses: misses.slice(0, 5),
    stale: stale.slice(0, 5),
    staleCount: stale.length
  };
}

async function main() {
  console.log("Pack-by-pack ID stability probe (proposed build vs. committed LevelDB):\n");
  console.log("  pack                 top  top  emb   emb   stale  note");
  console.log("                       ✓    ✗    ✓     ✗     keys");
  console.log("  -------------------  ---  ---  ----  ----  -----  ----");

  const reports = [];
  for (const spec of packSpecs) {
    const report = await probePack(spec);
    reports.push(report);
    if (report.error) {
      console.log(`  ${report.name.padEnd(19)}  ERROR: ${report.error}`);
      continue;
    }
    console.log(
      `  ${report.name.padEnd(19)}  ${String(report.topMatched).padStart(3)}  ${String(report.topMismatched).padStart(3)}  ${String(report.embMatched).padStart(4)}  ${String(report.embMismatched).padStart(4)}  ${String(report.staleCount).padStart(5)}`
    );
  }

  console.log("");
  const anyMismatch = reports.some(
    (r) => r.topMismatched > 0 || r.embMismatched > 0 || r.staleCount > 0
  );
  if (!anyMismatch) {
    console.log("All packs stable: every proposed _id matches committed LevelDB, no stale keys.");
    return;
  }

  console.log("Sample misses (first 5 per affected pack):\n");
  for (const r of reports) {
    if (!r.misses?.length && !r.stale?.length) continue;
    console.log(`  ${r.name}:`);
    for (const miss of r.misses ?? []) {
      console.log(`    MISS   ${miss.key}  (${miss.name})`);
    }
    for (const key of r.stale ?? []) {
      console.log(`    STALE  ${key}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
