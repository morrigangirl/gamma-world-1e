#!/usr/bin/env node
/**
 * 0.14.x — repoint studio JSON `img` fields away from Foundry default
 * SVG placeholders to the proper PNG assets we generated under
 * `assets/<category>/`.
 *
 * Walks every top-level studio JSON in
 *   tools/content-studio/content/{equipment,monsters,mutations,sample-actors}
 * and for each item (top-level + embedded actor inventory items), if
 * its current `img` is one of the known Foundry default SVGs AND the
 * matching generated PNG exists on disk, swaps the path.
 *
 * Safe to re-run: only touches SVG-pointing fields, never overwrites a
 * pointer that's already a real asset path.
 *
 * Categories handled (top-level + embedded):
 *   weapon    -> assets/weapons/<slug>.png
 *   armor     -> assets/armor/<slug>.png
 *   gear      -> assets/gear/<slug>.png
 *   mutation  -> assets/mutations/<slug>.png
 *
 * Plus actor portrait + token (top-level only):
 *   monster (in monsters/)        -> assets/monsters/portraits|tokens/<slug>.png
 *   character (in sample-actors/) -> assets/actors/portraits|tokens/<slug>.png
 *
 * Usage:
 *   node scripts/repoint-art-imgs.mjs            # apply changes
 *   node scripts/repoint-art-imgs.mjs --dry-run  # just print what would change
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const studioRoot = path.join(repoRoot, "tools", "content-studio", "content");
const assetsRoot = path.join(repoRoot, "assets");
const SYSTEM_ASSET_PREFIX = "systems/gamma-world-1e/assets";

/** Foundry default placeholders we replace. Other paths are left alone. */
const PLACEHOLDER_SVGS = new Set([
  "icons/svg/mystery-man.svg",
  "icons/svg/item-bag.svg",
  "icons/svg/sword.svg",
  "icons/svg/holy-shield.svg",
  "icons/svg/aura.svg",
  "icons/svg/explosion.svg",
  "icons/svg/d20-grey.svg"
]);

/** Webp placeholders Foundry ships with. Not strictly "crappy SVG" but
 * still generic Foundry defaults the user wanted off. Empty by default
 * so re-runs don't surprise — uncomment a specific path to opt in. */
const PLACEHOLDER_WEBPS = new Set([
  // "icons/weapons/ammunition/arrow-simple.webp"
]);

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPlaceholder(img) {
  if (typeof img !== "string") return false;
  return PLACEHOLDER_SVGS.has(img) || PLACEHOLDER_WEBPS.has(img);
}

/**
 * For a given item type, return the asset directory (relative to assets/)
 * where its rendered PNG should live. Returns null for unsupported types.
 */
function assetDirForItemType(type) {
  switch (type) {
    case "weapon":   return "weapons";
    case "armor":    return "armor";
    case "gear":     return "gear";
    case "mutation": return "mutations";
    default: return null;
  }
}

/**
 * For an actor (top-level), return its portrait + token directories. The
 * source folder under tools/content-studio/content/ disambiguates monster
 * pregens from sample PCs.
 */
function actorAssetDirs(sourceFolder) {
  if (sourceFolder === "monsters") {
    return { portrait: "monsters/portraits", token: "monsters/tokens" };
  }
  if (sourceFolder === "sample-actors") {
    return { portrait: "actors/portraits", token: "actors/tokens" };
  }
  return null;
}

function assetExists(relPath) {
  return fs.existsSync(path.join(assetsRoot, relPath));
}

function newSystemPath(relPath) {
  return `${SYSTEM_ASSET_PREFIX}/${relPath}`;
}

/**
 * Mutate an item-shaped object in place: if its `img` is a placeholder
 * AND we have a generated asset for it, swap the path. Returns true if
 * the object was changed.
 */
function repointItemImg(item, scope) {
  if (!isPlaceholder(item?.img)) return false;
  const assetDir = assetDirForItemType(item?.type);
  if (!assetDir) return false;
  const slug = slugify(item.name);
  if (!slug) return false;
  const relPath = `${assetDir}/${slug}.png`;
  if (!assetExists(relPath)) {
    scope.missing.push(`${item.type}/${slug} (${item.name})`);
    return false;
  }
  item.img = newSystemPath(relPath);
  scope.repointed.push(`${item.type}/${slug}`);
  return true;
}

/**
 * For a top-level actor doc, repoint both `img` (portrait) and
 * `prototypeToken.texture.src` (token) when we have rendered finals.
 */
function repointActorArt(actor, sourceFolder, scope) {
  const dirs = actorAssetDirs(sourceFolder);
  if (!dirs) return false;
  const slug = slugify(actor.name);
  if (!slug) return false;
  let changed = false;

  // Portrait
  if (isPlaceholder(actor.img)) {
    const portraitRel = `${dirs.portrait}/${slug}.png`;
    if (assetExists(portraitRel)) {
      actor.img = newSystemPath(portraitRel);
      scope.repointed.push(`actor-portrait/${slug}`);
      changed = true;
    } else {
      scope.missing.push(`actor-portrait/${slug} (${actor.name})`);
    }
  }

  // Token
  const tokenSrc = actor?.prototypeToken?.texture?.src;
  if (isPlaceholder(tokenSrc)) {
    const tokenRel = `${dirs.token}/${slug}.png`;
    if (assetExists(tokenRel)) {
      actor.prototypeToken ??= {};
      actor.prototypeToken.texture ??= {};
      actor.prototypeToken.texture.src = newSystemPath(tokenRel);
      scope.repointed.push(`actor-token/${slug}`);
      changed = true;
    } else {
      scope.missing.push(`actor-token/${slug} (${actor.name})`);
    }
  }

  return changed;
}

function processFile(filePath, sourceFolder, scope, dryRun) {
  const raw = fs.readFileSync(filePath, "utf8");
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    scope.errors.push(`${filePath}: invalid JSON`);
    return;
  }

  let changed = false;

  // Top-level actor portrait + token (monsters/sample-actors only).
  if (doc?.type === "monster" || doc?.type === "character" || doc?.type === "npc") {
    if (repointActorArt(doc, sourceFolder, scope)) changed = true;
    // Embedded items inside the actor.
    if (Array.isArray(doc.items)) {
      for (const child of doc.items) {
        if (repointItemImg(child, scope)) changed = true;
      }
    }
  } else {
    // Top-level item (weapon/armor/gear/mutation).
    if (repointItemImg(doc, scope)) changed = true;
  }

  if (changed && !dryRun) {
    // Preserve the original file's trailing newline (most studio JSONs end
    // with one — JSON.stringify drops it).
    const endsWithNewline = raw.endsWith("\n");
    fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + (endsWithNewline ? "\n" : ""), "utf8");
    scope.filesUpdated.push(path.relative(repoRoot, filePath));
  } else if (changed) {
    scope.filesUpdated.push(`(dry) ${path.relative(repoRoot, filePath)}`);
  }
}

function walkCategory(folder, scope, dryRun) {
  const dir = path.join(studioRoot, folder);
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // mutations/ is nested by Foundry folder name; recurse.
      const inner = fs.readdirSync(full, { withFileTypes: true });
      for (const inn of inner) {
        if (inn.isFile() && inn.name.endsWith(".json")) {
          processFile(path.join(full, inn.name), folder, scope, dryRun);
        }
      }
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      processFile(full, folder, scope, dryRun);
    }
  }
}

function main() {
  const dryRun = process.argv.includes("--dry-run");

  const scope = {
    repointed: [],
    missing: [],
    filesUpdated: [],
    errors: []
  };

  for (const folder of ["equipment", "monsters", "mutations", "sample-actors"]) {
    walkCategory(folder, scope, dryRun);
  }

  console.log(`${dryRun ? "[dry-run] " : ""}Repointed ${scope.repointed.length} img field(s) across ${scope.filesUpdated.length} file(s).`);
  if (scope.missing.length) {
    console.log(`Missing assets (still on placeholder, no generated PNG yet): ${scope.missing.length}`);
    if (process.env.VERBOSE) {
      for (const m of scope.missing) console.log(`  - ${m}`);
    }
  }
  if (scope.errors.length) {
    console.error(`Errors: ${scope.errors.length}`);
    for (const e of scope.errors) console.error(`  ! ${e}`);
    process.exitCode = 1;
  }
}

main();
