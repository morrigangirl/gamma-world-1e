/**
 * Diagnostic: survey every monster in the committed `monsters` pack and
 * flag any whose portrait or token image path doesn't exist on disk.
 * Used by the art-generation pipeline to queue only missing entries.
 *
 * Read-only. Exits 0 either way.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packDir = path.join(repoRoot, "packs", "monsters");

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readMonsters() {
  const db = new ClassicLevel(packDir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  const monsters = [];
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith("!actors!")) continue;
    if (value?.type !== "monster") continue;
    monsters.push(value);
  }
  await db.close();
  return monsters;
}

function checkPath(relPath) {
  if (!relPath) return { ok: false, reason: "empty" };
  const clean = relPath.startsWith("systems/gamma-world-1e/")
    ? relPath.slice("systems/gamma-world-1e/".length)
    : relPath;
  const absolute = path.join(repoRoot, clean);
  if (!fs.existsSync(absolute)) return { ok: false, reason: "missing", resolved: absolute };
  return { ok: true, resolved: absolute };
}

const monsters = await readMonsters();
const rows = monsters
  .map((m) => {
    const portraitSrc = m.img ?? "";
    const tokenSrc = m.prototypeToken?.texture?.src ?? "";
    const portrait = checkPath(portraitSrc);
    const token = checkPath(tokenSrc);
    return {
      name: m.name ?? "(unnamed)",
      slug: slugify(m.name ?? ""),
      portraitSrc,
      tokenSrc,
      portraitOK: portrait.ok,
      tokenOK: token.ok
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const broken = rows.filter((r) => !r.portraitOK || !r.tokenOK);
const fallback = rows.filter((r) => /icons\/svg\/|icons\/svg\b/i.test(r.portraitSrc) || /icons\/svg\//i.test(r.tokenSrc));

console.log(`Monsters in pack:                ${rows.length}`);
console.log(`Fully arted (both paths exist):  ${rows.length - broken.length}`);
console.log(`Missing at least one asset:      ${broken.length}`);
console.log(`Using a default core icon path:  ${fallback.length}`);
console.log("");

if (broken.length) {
  console.log("--- Broken-link monsters ---");
  console.log("name".padEnd(30), "slug".padEnd(28), "portrait", "token");
  for (const r of broken) {
    console.log(
      r.name.padEnd(30).slice(0, 30),
      r.slug.padEnd(28).slice(0, 28),
      r.portraitOK ? "  ok " : " MISS",
      r.tokenOK ? "  ok" : " MISS"
    );
  }
}

if (fallback.length) {
  console.log("");
  console.log("--- Monsters pointing at core Foundry icons ---");
  for (const r of fallback) {
    console.log(`${r.name.padEnd(30).slice(0, 30)}  portrait=${r.portraitSrc}  token=${r.tokenSrc}`);
  }
}
