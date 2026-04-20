import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  equipmentPackSources,
  mutationPackSources,
  robotMonsterSources
} from "./pack-readers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Parse CLI args in the form:
 *   node scripts/build-item-art-prompts.mjs --category weapons [--out path/to/prompts.jsonl]
 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--category") out.category = argv[++i];
    else if (arg === "--out") out.out = argv[++i];
    else if (arg.startsWith("--category=")) out.category = arg.slice("--category=".length);
    else if (arg.startsWith("--out=")) out.out = arg.slice("--out=".length);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Category: weapons — retro-tech item icons                          */
/* ------------------------------------------------------------------ */

function buildWeaponPrompt(weapon) {
  const description = stripHtml(weapon.system?.description?.value ?? "");
  const attackType = weapon.system?.attackType ?? "";
  const weaponClass = weapon.system?.weaponClass ?? "";
  const damage = weapon.system?.damage?.formula ?? "";

  const traitNotes = [
    attackType ? `attack type: ${attackType}` : "",
    weaponClass ? `weapon class ${weaponClass}` : "",
    damage ? `damage ${damage}` : ""
  ].filter(Boolean).join(", ");

  const lines = [
    "Use case: stylized item icon",
    "Asset type: tabletop RPG weapon icon, top-down or 3/4 view",
    `Primary request: single-object silhouette of ${weapon.name}, rendered as a clean item icon suitable for a 512x512 inventory slot.`,
    "Scene/backdrop: isolated subject on a transparent background for Foundry VTT use.",
    `Subject: ${description || `${weapon.name} — a Gamma World weapon.`}${traitNotes ? ` Flavor hints: ${traitNotes}.` : ""}`,
    "Style/medium: retro science-fantasy / post-apocalyptic illustration style, solid readable silhouette, crisp contours, painterly but detailed, no copyrighted characters or logos.",
    "Composition/framing: centered square composition, weapon occupies ~80% of the frame, slight ground shadow only if it helps the silhouette read.",
    "Lighting/mood: neutral presentation lighting, soft rim highlight on the cutting / firing edge, clean readable shapes.",
    "Color palette: weathered metals, battered chrome, worn leather wraps, restrained accent colors (no neon glow effects unless implied by the weapon's energy type).",
    "Constraints: single object only; transparent background; NO text, NO letters, NO numbers, NO labels, NO captions, NO serial numbers, NO writing of any kind anywhere in the image; no hands or wielders; no frame; no watermark.",
    "Avoid: multiple copies of the weapon, hands holding it, scenery clutter, captions, logo marks, text overlays, decorative flourishes unrelated to function."
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Category: mutations — abstract effect icons                        */
/* ------------------------------------------------------------------ */

function buildMutationPrompt(mutation) {
  const description = stripHtml(mutation.system?.summary ?? "")
    || stripHtml(mutation.system?.description?.value ?? "");
  const subtype = mutation.system?.subtype ?? "";
  const category = mutation.system?.category ?? "";

  const flavorBits = [
    subtype ? `${subtype} mutation` : "",
    category === "defect" ? "mutation defect (negative trait)" : "",
    description
  ].filter(Boolean);
  const flavorText = flavorBits.join(". ") || `${mutation.name} — a Gamma World mutation.`;

  const lines = [
    "Use case: stylized mutation effect icon",
    "Asset type: tabletop RPG ability icon, abstract symbolic representation",
    `Primary request: symbolic / emblematic icon for the mutation ${mutation.name}, rendered as a clean square icon suitable for a 512x512 power slot.`,
    "Scene/backdrop: isolated motif on a transparent background for Foundry VTT use.",
    `Subject: ${flavorText}. Depict the mutation as a distinct visual motif (e.g. a stylized creature part, energy effect, organ, or arcane glyph) that instantly communicates the ability at a glance.`,
    "Style/medium: retro science-fantasy bestiary illustration style, painterly icon, readable silhouette, detailed but clean, no copyrighted characters or logos.",
    "Composition/framing: centered square composition, motif fills ~75% of the frame, slight glow if the mutation is inherently energetic, otherwise solid shapes.",
    "Lighting/mood: saturated mood lighting matching the mutation's nature (biological = warm, psychic = cool, toxic = green, radiation = sickly yellow-green).",
    "Color palette: earthy post-apocalyptic tones with bold mutant accent colors appropriate to the mutation type.",
    "Constraints: single motif only; transparent background; NO text, NO letters, NO numbers, NO labels, NO captions, NO book-page excerpts, NO writing of any kind anywhere in the image; no characters using the mutation; no frame; no watermark.",
    "Avoid: multiple variants, scenery clutter, captions, logo marks, text overlays, human subjects (unless the mutation specifically requires a humanoid focus), decorative flourishes."
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Category: robots — bestiary-style portraits                        */
/* ------------------------------------------------------------------ */

function buildRobotPrompt(robot) {
  const biography = stripHtml(robot.system?.biography?.value ?? "");
  const chassis = robot.system?.robotics?.chassis ?? robot.name;
  const powerSource = robot.system?.robotics?.powerSource ?? "";
  const armament = /Armament:\s*([^<.]+)/i.exec(biography)?.[1]?.trim() ?? "";

  const flavorBits = [
    `${chassis} — a pre-Fall robotic unit`,
    powerSource ? `power source: ${powerSource}` : "",
    armament ? `armament: ${armament}` : "",
    biography.replace(/<[^>]+>/g, " ").slice(0, 400)
  ].filter(Boolean);
  const flavorText = unique(flavorBits).join(". ");

  const lines = [
    "Use case: stylized-concept",
    "Asset type: tabletop RPG robot portrait",
    `Primary request: full-body original science-fiction bestiary illustration of ${robot.name}, a pre-Fall robotic unit.`,
    "Scene/backdrop: isolated subject on a transparent background for Foundry VTT use.",
    `Subject: ${flavorText}`,
    "Style/medium: original retro-future industrial illustration, worn metal surfaces, exposed cabling, crisp silhouette, detailed but readable at token size, no copyrighted characters or logos.",
    "Composition/framing: centered square composition, full body visible, all major anatomy / manipulators in frame, slight ground shadow, no cropping.",
    "Lighting/mood: dramatic but neutral presentation lighting, subtle rim light, clean readable shapes.",
    "Color palette: pre-Fall military or industrial palette — olive drab, aged aluminum, brushed steel, warning yellow accents where appropriate.",
    "Constraints: single subject only; transparent background; NO text, NO letters, NO numbers, NO labels, NO captions, NO serial numbers, NO writing of any kind anywhere in the image; respect the described chassis, sensors, and armament; no frame; no watermark.",
    "Avoid: multiple robots, scenery clutter, captions, logo marks, text overlays, decorative armor flourishes that are not described, pilot operators riding the machine."
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                      */
/* ------------------------------------------------------------------ */

const CATEGORIES = {
  weapons: {
    default_out: path.join(repoRoot, "tmp", "imagegen", "weapon-prompts.jsonl"),
    sources: async () => (await equipmentPackSources()).filter((item) => item.type === "weapon"),
    promptFor: buildWeaponPrompt
  },
  mutations: {
    default_out: path.join(repoRoot, "tmp", "imagegen", "mutation-prompts.jsonl"),
    sources: async () => mutationPackSources(),
    promptFor: buildMutationPrompt
  },
  robots: {
    default_out: path.join(repoRoot, "tmp", "imagegen", "robot-prompts.jsonl"),
    sources: async () => robotMonsterSources(),
    promptFor: buildRobotPrompt
  }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const category = args.category;
  if (!category || !CATEGORIES[category]) {
    console.error(`Usage: node scripts/build-item-art-prompts.mjs --category {${Object.keys(CATEGORIES).join(", ")}} [--out path]`);
    process.exitCode = 1;
    return;
  }

  const config = CATEGORIES[category];
  const outPath = args.out ? path.resolve(args.out) : config.default_out;

  const sources = await config.sources();
  const seen = new Set();
  const jobs = [];
  for (const item of sources) {
    const slug = slugify(item.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    jobs.push({
      prompt: config.promptFor(item),
      out: `${slug}.png`
    });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${jobs.map((job) => JSON.stringify(job)).join("\n")}\n`, "utf8");

  console.log(`Wrote ${jobs.length} ${category} prompt(s) to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
