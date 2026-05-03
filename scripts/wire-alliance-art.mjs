#!/usr/bin/env node
/**
 * 0.14.19 — wire rendered cryptic-alliance art into the studio JSONs.
 *
 * Reads each alliance JSON under
 *   tools/content-studio/content/cryptic-alliances/
 * and, when a matching rendered asset exists at
 *   assets/cryptic-alliances/<slug>.png
 * injects a banner `<img>` tag at the top of the page's HTML content
 * so the image renders as the page header in the JournalEntry sheet.
 *
 * Idempotent: existing banner injections (identified by a sentinel
 * data attribute) are replaced rather than stacked.
 *
 * Run order:
 *   1. npm run build:alliance-prompts   (writes JSONL)
 *   2. npm run build:alliance-art       (calls OpenAI; costs credits)
 *   3. npm run build:alliance-assets    (rasterizes to 768² PNGs)
 *   4. npm run wire:alliance-art        (this script — injects <img>)
 *   5. npm run seal:packs               (compiles studio → LevelDB)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const studioDir = path.join(repoRoot, "tools", "content-studio", "content", "cryptic-alliances");
const assetDir = path.join(repoRoot, "assets", "cryptic-alliances");
const SENTINEL = "data-gw-alliance-banner";

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function bannerHtml(slug, name) {
  const src = `systems/gamma-world-1e/assets/cryptic-alliances/${slug}.png`;
  const alt = `${name} banner`.replace(/"/g, "&quot;");
  // The wrapping <figure> is what we look for on rerun so the banner
  // gets replaced cleanly instead of stacking up.
  return `<figure ${SENTINEL}="${slug}" style="margin:0 0 0.75rem 0;text-align:center;"><img src="${src}" alt="${alt}" style="max-width:100%;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.25);" /></figure>`;
}

function stripExistingBanner(html, slug) {
  // Remove any prior <figure data-gw-alliance-banner="..."> ... </figure>
  // block at the start of the content. Greedy match across the figure
  // open/close — alliance banners shouldn't contain nested figures so
  // this is safe.
  const pattern = new RegExp(
    `^\\s*<figure[^>]*${SENTINEL}="[^"]*"[\\s\\S]*?</figure>\\s*`,
    "i"
  );
  return html.replace(pattern, "");
}

async function main() {
  const files = (await fs.readdir(studioDir)).filter((f) => f.endsWith(".json") && f !== "_Folder.json");
  let injected = 0;
  let skippedNoAsset = 0;
  let unchanged = 0;

  for (const file of files) {
    const full = path.join(studioDir, file);
    const json = JSON.parse(await fs.readFile(full, "utf8"));
    const name = json?.name;
    if (!name) continue;
    const slug = slugify(name);
    const assetPath = path.join(assetDir, `${slug}.png`);

    let assetExists = true;
    try { await fs.access(assetPath); } catch { assetExists = false; }
    if (!assetExists) {
      console.log(`  [skip] ${name} — no asset at assets/cryptic-alliances/${slug}.png`);
      skippedNoAsset += 1;
      continue;
    }

    const page = json.pages?.[0];
    if (!page || page.type !== "text" || !page.text) {
      console.log(`  [skip] ${name} — first page is not a text page`);
      continue;
    }

    const before = page.text.content ?? "";
    const stripped = stripExistingBanner(before, slug);
    const next = `${bannerHtml(slug, name)}${stripped}`;

    if (next === before) {
      unchanged += 1;
      continue;
    }
    page.text.content = next;
    await fs.writeFile(full, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    console.log(`  [wire] ${name} ← ${slug}.png`);
    injected += 1;
  }

  console.log(`\nDone. Injected: ${injected}, unchanged: ${unchanged}, skipped (no asset): ${skippedNoAsset}.`);
  if (injected > 0) {
    console.log("\nNext: run `npm run seal:packs` to compile the studio JSONs back into the cryptic-alliances LevelDB pack.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
