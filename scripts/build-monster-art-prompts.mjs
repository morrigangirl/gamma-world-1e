import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { monsterPackSources } from "./monster-content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "tmp", "imagegen", "monster-prompts.jsonl");

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

function summarizeMonster(monster) {
  const details = monster.system?.details ?? {};
  const biography = stripHtml(monster.system?.biography?.value ?? "");
  const items = Array.isArray(monster.items) ? monster.items : [];
  const mutations = unique(items.filter((item) => item.type === "mutation").map((item) => item.name)).slice(0, 4);
  const weapons = unique(items.filter((item) => item.type === "weapon").map((item) => item.name)).slice(0, 3);
  const abilities = unique(items.filter((item) => item.type === "gear").map((item) => item.name)).slice(0, 3);
  const roleParts = unique([
    details.creatureClass,
    details.role,
    details.animalForm && details.animalForm !== "Humanoid" ? details.animalForm : "",
    details.type === "robot" ? "robotic unit" : ""
  ]);

  const flavorBits = [
    biography,
    mutations.length ? `Mutations: ${mutations.join(", ")}.` : "",
    weapons.length ? `Signature attacks: ${weapons.join(", ")}.` : "",
    abilities.length ? `Notable abilities: ${abilities.join(", ")}.` : ""
  ].filter(Boolean);

  return {
    roleText: roleParts.join(", "),
    flavorText: flavorBits.join(" ")
  };
}

const PROMPT_OVERRIDES = {
  Orlen: {
    primaryRequest: "full-body original science-fantasy bestiary illustration of Orlen, a two-headed four-armed female mutant humanoid.",
    subject: "A strong, striking two-headed four-armed female mutant with an agile dancer-warrior build rather than a hulking brute. She should read as attractive, poised, and dangerous, with expressive faces, vivid mutant features, and telepathic intensity. Orlens are telepathic, telekinetic, and both brains can project will force. Mutations: Telepathy, Telekinesis, Will Force, Dual Brain. Signature attacks: Four-Arm Assault.",
    palette: "cool blue skin, green or sea-green hair accents, weathered leather and scavenged metal details, restrained retro science-fantasy colors.",
    constraints: "single subject only; transparent background; portray the subject as female, pretty, and strong; preserve the two-headed four-armed anatomy; keep the build athletic and graceful rather than ogre-like or bulky; respect the described anatomy and powers; no text; no frame; no watermark.",
    avoid: "male presentation, ogre-like proportions, bald heads, comedy posing, scenery clutter, captions, logo marks, severed anatomy, extreme gore, oversized fantasy weapons, decorative armor flourishes that are not described."
  }
};

function buildPrompt(monster) {
  const { roleText, flavorText } = summarizeMonster(monster);
  const override = PROMPT_OVERRIDES[monster.name] ?? null;
  const defaultPrimaryRequest = `full-body original science-fantasy bestiary illustration of ${monster.name}${roleText ? `, a ${roleText}` : ""}.`;
  const defaultSubject = flavorText || `${monster.name} presented as a distinctive Gamma World mutant creature with a readable silhouette.`;
  const lines = [
    "Use case: stylized-concept",
    "Asset type: tabletop RPG monster portrait",
    `Primary request: ${override?.primaryRequest ?? defaultPrimaryRequest}`,
    "Scene/backdrop: isolated subject on a transparent background for Foundry VTT use.",
    `Subject: ${override?.subject ?? defaultSubject}`,
    "Style/medium: original retro science-fantasy bestiary painting, crisp silhouette, detailed but readable at token size, no copyrighted characters or logos.",
    "Composition/framing: centered square composition, full body visible, all major anatomy in frame, slight ground shadow, no cropping.",
    "Lighting/mood: dramatic but neutral presentation lighting, subtle rim light, clean readable shapes.",
    `Color palette: ${override?.palette ?? "earthy post-apocalyptic tones with bold mutant accent colors."}`,
    `Constraints: ${override?.constraints ?? "single subject only; transparent background; respect the described anatomy, gear, and signature weapons only; do not invent extra clothing, capes, mounts, companions, scenery, or props unless clearly implied; no text; no frame; no watermark."}`,
    `Avoid: ${override?.avoid ?? "multiple creatures, scenery clutter, captions, logo marks, severed anatomy, extreme gore, decorative armor flourishes that are not described."}`
  ];
  return lines.join("\n");
}

const jobs = monsterPackSources().map((monster) => ({
  prompt: buildPrompt(monster),
  out: `${slugify(monster.name)}.png`
}));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${jobs.map((job) => JSON.stringify(job)).join("\n")}\n`, "utf8");

console.log(`Wrote ${jobs.length} prompt(s) to ${outPath}`);
