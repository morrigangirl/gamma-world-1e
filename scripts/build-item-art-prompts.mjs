import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  equipmentPackSources,
  mutationPackSources,
  robotMonsterSources,
  samplePackSources,
  crypticAlliancePackSources
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
/* Category: armor — protective gear icons                            */
/* ------------------------------------------------------------------ */

function buildArmorPrompt(armor) {
  const description = stripHtml(armor.system?.description?.value ?? "");
  const armorType = armor.system?.armorType ?? "";
  const acValue = armor.system?.acValue ?? "";
  const isPowered = !!armor.system?.field?.mode && armor.system.field.mode !== "none";
  const isShield = armorType === "shield";

  const traitNotes = [
    armorType ? `armor type: ${armorType}` : "",
    acValue ? `descending AC ${acValue}` : "",
    isPowered ? "powered force-field armor" : ""
  ].filter(Boolean).join(", ");

  const subjectIntro = isShield
    ? `${armor.name} — a Gamma World shield, displayed flat-on with the strap face turned away.`
    : `${armor.name} — a Gamma World ${isPowered ? "powered armor suit" : "set of body armor"}, displayed empty (no wearer).`;

  const lines = [
    "Use case: stylized item icon",
    "Asset type: tabletop RPG armor icon, three-quarter or front view",
    `Primary request: single-piece silhouette of ${armor.name}, rendered as a clean item icon suitable for a 512x512 inventory slot.`,
    "Scene/backdrop: isolated subject on a transparent background for Foundry VTT use.",
    `Subject: ${description || subjectIntro}${traitNotes ? ` Flavor hints: ${traitNotes}.` : ""}`,
    "Style/medium: retro science-fantasy / post-apocalyptic illustration style, solid readable silhouette, crisp contours, painterly but detailed, no copyrighted characters or logos.",
    "Composition/framing: centered square composition, subject occupies ~78% of the frame; armor displayed empty (no wearer / no figure inside).",
    "Lighting/mood: neutral presentation lighting, soft rim highlight on metal edges or force-field surface, clean readable shapes.",
    "Color palette: " + (isPowered
      ? "burnished alloys, deep accent paint, faint energy-shield blue/green where the field generator runs."
      : "weathered leather, riveted plate, scavenged ceramic, restrained rust accents."),
    "Constraints: single piece only; transparent background; NO text, NO letters, NO numbers, NO labels, NO captions, NO writing of any kind anywhere in the image; no mannequin, no wearer, no hands, no head; no frame; no watermark.",
    "Avoid: multiple armor pieces, scenery clutter, captions, logo marks, text overlays, decorative flourishes unrelated to function, action poses."
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Category: gear — subtype-flavored item icons                       */
/* ------------------------------------------------------------------ */

const GEAR_FLAVOR = {
  ammunition: {
    asset: "ammunition icon",
    direction: "depict the projectile or stack — readable as ammo, displayed as if laid on a clean surface.",
    palette: "weathered metal, dull brass, oiled leather binding, restrained earth tones."
  },
  "power-cell": {
    asset: "power cell / battery icon",
    direction: "depict the cell as a self-contained pre-Fall energy unit — chrome or matte canister with status window or vent ports.",
    palette: "brushed chrome, dark casing, faint inner glow matching power source (chemical = orange, hydrogen = pale blue, solar = warm yellow, atomic = sickly green, nuclear = cold blue-white, antimatter = deep violet)."
  },
  container: {
    asset: "container / pack icon",
    direction: "depict the container empty and closed, ready to be carried — visible straps, buckles, or lid.",
    palette: "tanned leather, woven cloth, salvaged canvas, worn metal fittings."
  },
  medical: {
    asset: "medical / first-aid icon",
    direction: "depict the medical item ready to use — vial, syringe, dose stick, kit, or compress, with hint of a clinical pre-Fall origin.",
    palette: "off-white plastic, faded label colors (no text!), red cross or biological motif, slightly stained from age."
  },
  vehicle: {
    asset: "vehicle silhouette icon",
    direction: "depict the vehicle in 3/4 profile, parked, with all major hardpoints visible — read as a complete machine, not a fragment.",
    palette: "industrial paint with peeling layers, exposed mechanism, weathered metal, restrained rust and oxidation."
  },
  tool: {
    asset: "tool icon",
    direction: "depict the tool ready for use — head, handle, and any moving parts visible.",
    palette: "iron, oiled wood, leather wraps, traces of pre-Fall manufacture."
  },
  ration: {
    asset: "food / ration icon",
    direction: "depict the ration as a sealed package, wrapped bundle, or canteen — clearly preserved trail food.",
    palette: "waxed paper, hessian wraps, dull green or brown labels (no text), faded surface."
  },
  "trade-good": {
    asset: "trade-good / curio icon",
    direction: "depict the item as a recognizable salvaged-Old-World curiosity — book, bottle, coin, trinket — with patina suggesting decades or centuries of disuse.",
    palette: "aged paper, tarnished metal, sun-bleached pigments, organic browns and grays."
  },
  communication: {
    asset: "communications device icon",
    direction: "depict the comm device as a self-contained pre-Fall unit — antenna or speaker visible, switches and lights subdued.",
    palette: "matte plastic case, dull metal accents, faded factory paint, faint lit indicator."
  },
  explosive: {
    asset: "explosive ordnance icon",
    direction: "depict the explosive as a self-contained device — cylinder, sphere, or canister with visible fuse, pin, or trigger mechanism.",
    palette: "matte olive, painted steel, warning-yellow accents, scorched metal where appropriate."
  },
  misc: {
    asset: "miscellaneous gear icon",
    direction: "depict the item as a recognizable Gamma World object, rendered to match its description — choose the most distinctive silhouette.",
    palette: "muted post-apocalyptic earth tones with a single bold accent color appropriate to the item's function."
  }
};

function buildGearPrompt(gear) {
  const description = stripHtml(gear.system?.description?.value ?? "");
  const subtype = gear.system?.subtype ?? "misc";
  const flavor = GEAR_FLAVOR[subtype] ?? GEAR_FLAVOR.misc;
  const isArtifact = !!gear.system?.artifact?.isArtifact;

  const lines = [
    "Use case: stylized item icon",
    `Asset type: tabletop RPG ${flavor.asset}`,
    `Primary request: single-object silhouette of ${gear.name}, rendered as a clean item icon suitable for a 512x512 inventory slot.`,
    "Scene/backdrop: isolated subject on a transparent background for Foundry VTT use.",
    `Subject: ${description || `${gear.name} — a Gamma World gear item.`} ${flavor.direction}${isArtifact ? " The item should read as a pre-Fall artifact: precision-manufactured, slightly anachronistic compared to the post-apocalyptic setting." : ""}`,
    "Style/medium: retro science-fantasy / post-apocalyptic illustration style, solid readable silhouette, crisp contours, painterly but detailed, no copyrighted characters or logos.",
    "Composition/framing: centered square composition, item occupies ~78% of the frame, slight ground shadow only if it helps the silhouette read.",
    "Lighting/mood: neutral presentation lighting, soft rim highlight on functional surfaces, clean readable shapes.",
    `Color palette: ${flavor.palette}`,
    "Constraints: single object only; transparent background; NO text, NO letters, NO numbers, NO labels, NO captions, NO brand names, NO writing of any kind anywhere in the image; no hands, no wearers, no operators; no frame; no watermark.",
    "Avoid: multiple copies of the item, hands holding it, scenery clutter, captions, logo marks, text overlays, decorative flourishes unrelated to function."
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Category: sample-actors — bestiary-style portraits for pregens     */
/* ------------------------------------------------------------------ */

function buildSampleActorPrompt(actor) {
  const biography = stripHtml(actor.system?.biography?.value ?? "");
  const details = actor.system?.details ?? {};
  const role = details.role ?? "";
  const creatureClass = details.creatureClass ?? "";
  const animalForm = details.animalForm && details.animalForm !== "Humanoid" ? details.animalForm : "";
  const alliance = details.alliance ?? "";

  const items = Array.isArray(actor.items) ? actor.items : [];
  const mutations = unique(items.filter((i) => i.type === "mutation").map((i) => i.name)).slice(0, 4);
  const weapons = unique(items.filter((i) => i.type === "weapon").map((i) => i.name)).slice(0, 3);
  const armorPieces = unique(items.filter((i) => i.type === "armor").map((i) => i.name)).slice(0, 2);

  const flavorBits = [
    biography.slice(0, 400),
    role ? `role: ${role}` : "",
    creatureClass ? `class: ${creatureClass}` : "",
    animalForm ? `mutated form: ${animalForm}` : "",
    alliance ? `alliance: ${alliance}` : "",
    mutations.length ? `Mutations: ${mutations.join(", ")}.` : "",
    weapons.length ? `Carries: ${weapons.join(", ")}.` : "",
    armorPieces.length ? `Wears: ${armorPieces.join(", ")}.` : ""
  ].filter(Boolean);
  const flavorText = unique(flavorBits).join(" ") || `${actor.name} — a Gamma World survivor.`;

  const lines = [
    "Use case: stylized-concept",
    "Asset type: tabletop RPG character portrait",
    `Primary request: full-body original science-fantasy portrait of ${actor.name}, a Gamma World survivor.`,
    "Scene/backdrop: isolated subject on a transparent background for Foundry VTT use.",
    `Subject: ${flavorText}`,
    "Style/medium: original retro science-fantasy bestiary painting, crisp silhouette, detailed but readable at token size, no copyrighted characters or logos.",
    "Composition/framing: centered square composition, full body visible, head to feet in frame, slight ground shadow, no cropping.",
    "Lighting/mood: dramatic but neutral presentation lighting, subtle rim light, clean readable shapes.",
    "Color palette: weathered post-apocalyptic earth tones with one or two bold accent colors appropriate to the character's role / mutations.",
    "Constraints: single subject only; transparent background; respect the described mutations, gear, and signature weapons; no text; no frame; no watermark.",
    "Avoid: multiple figures, scenery clutter, captions, logo marks, severed anatomy, extreme gore, decorative flourishes that contradict the description, modern military gear that contradicts the post-apocalyptic Gamma World setting."
  ];
  return lines.join("\n");
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
  const description = stripHtml(mutation.system?.description?.value ?? "");
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

/**
 * 0.14.19 — robot form-factor classifier. Earlier prompts described
 * every robot as "full-body" with no shape guidance, so the model
 * defaulted to bipedal humanoids for everything. Most GW1e robot
 * monsters are NOT humanoid — only the explicitly-android robotoids
 * walk on legs. This map gives the prompt builder a per-class
 * silhouette direction.
 *
 * Returns a `{ form, framing, palette }` triple:
 *   - form: short shape descriptor injected into the subject line
 *   - framing: composition guidance (full body / wide platform / etc.)
 *   - palette: optional palette hint (warbots get military, household
 *     bots get civilian)
 */
export function robotFormFactor(name) {
  const n = String(name || "").toLowerCase();
  // Battle / heavy combat platforms — tracked or hover, turret-mounted weapons,
  // distinctly NOT humanoid; warbot specifically is the user's flagship example.
  if (/warbot|death machine|attack borg|defense borg/.test(n)) {
    return {
      form: "tracked or low-hover combat chassis with a centerline turret carrying the listed armament; squat, wide stance; thick angled armor plates; weapon barrels and sensor masts mounted dorsally; absolutely NOT a humanoid bipedal robot",
      framing: "centered square composition, full chassis visible from a slight three-quarters above angle so treads / hover-skirt and weapon mounts both read; ground shadow under the chassis",
      palette: "olive drab and gunmetal with warning-yellow stencil-style hazard accents"
    };
  }
  // Cargo / utility transports — wheeled or treaded vehicles, no humanoid form.
  if (/cargo lifter|cargo transport/.test(n)) {
    return {
      form: "wheeled or tracked cargo vehicle; flatbed or boxy cargo hold; manipulator arm or fork-tine on the front for moving crates; absolutely NOT a humanoid bipedal robot",
      framing: "centered square composition, three-quarter side view so the wheels / treads / manipulator are all visible",
      palette: "industrial orange and aged aluminum, with reflective hazard stripes"
    };
  }
  // Engineering bots — Heavy Duty is explicitly mistaken for warbots, so it's
  // a tracked construction chassis with multi-arm. Standard / Light Duty are
  // utility — keep them small wheeled or low-tripod, NOT humanoid.
  if (/engineering bot.*heavy/.test(n)) {
    return {
      form: "tracked construction chassis with multiple articulated work arms (cutting laser, grapples, cutting torches); low and wide; absolutely NOT a humanoid bipedal robot — this is intentionally mistaken for a warbot at distance",
      framing: "centered square composition, three-quarter view showing treads + arm complement",
      palette: "industrial yellow and pre-Fall steel"
    };
  }
  if (/engineering bot/.test(n)) {
    return {
      form: "wheeled or tripod-base utility robot, multiple small work arms folded against the body, tool compartments visible; modest size; absolutely NOT a humanoid bipedal robot",
      framing: "centered square composition, three-quarter view",
      palette: "civilian gray and brushed steel with safety-orange accents"
    };
  }
  // Ecology bots — quadrupedal field unit (think a four-legged probe walker).
  if (/ecology bot/.test(n)) {
    return {
      form: "quadrupedal field-survey robot with a low body, articulated multi-jointed legs, sensor mast on top, and a single soil/probe arm on a forward gimbal; absolutely NOT a humanoid bipedal robot",
      framing: "centered square composition, three-quarter view from the side",
      palette: "weathered field-green and tan with sensor-cluster glow"
    };
  }
  // Security robotoids — patrol units, often quadrupedal or low-wheeled.
  if (/security robotoid/.test(n)) {
    return {
      form: "low quadrupedal patrol robot or wheeled sentry unit; armored body with retractable sidearm; sensor cluster head on a short neck; absolutely NOT a humanoid bipedal robot",
      framing: "centered square composition, three-quarter side view",
      palette: "matte black and dark gray with warning-red optic-cluster glow"
    };
  }
  // Supervisor borg — hover command platform.
  if (/supervisor borg/.test(n)) {
    return {
      form: "hovering command platform; flat disc or squat cylinder body floating on quiet repulsor lift; multiple eye-stalk sensors; arm armature with a holstered sidearm; absolutely NOT a humanoid bipedal robot",
      framing: "centered square composition, three-quarter view; faint hover glow under the chassis to indicate levitation",
      palette: "polished aluminum and command-blue accents"
    };
  }
  // Think Tank — explicitly immobile cabinet/console.
  if (/think tank/.test(n)) {
    return {
      form: "immobile cognitive engine — a tall cabinet or pillar housing a glowing data-core, with sensor antennae and exposed circuit boards behind glass; no legs, no wheels, no manipulators; absolutely NOT a humanoid robot",
      framing: "centered square composition, head-on with subtle perspective; cabinet stands on a base plate",
      palette: "deep green and copper with internal cyan glow"
    };
  }
  // The classic anthropomorphic units — Robotoids and Light/Standard
  // domestic Engineering bots remain humanoid (these are the andro-form
  // chassis players expect). Listed last so the more specific patterns
  // above still win.
  if (/robotoid/.test(n)) {
    return {
      form: "humanoid service-android chassis — bipedal, two arms, smooth featureless faceplate with a single sensor band; clean civilian styling appropriate for indoor environments",
      framing: "centered square composition, full body visible, slight three-quarter pose",
      palette: "polished white and pastel accent (medical green, household cream, etc.) appropriate to the role"
    };
  }
  // Default fallback: explicit nudge away from default humanoid for
  // anything we didn't recognize.
  return {
    form: "non-humanoid robotic unit; choose a tracked, wheeled, hover, quadrupedal, or static cabinet form that fits the description; avoid bipedal humanoid silhouettes unless the description is explicit about an android form",
    framing: "centered square composition, three-quarter view that exposes the chassis's mode of locomotion",
    palette: "pre-Fall military or industrial palette — olive drab, aged aluminum, brushed steel, warning yellow accents where appropriate"
  };
}

function buildRobotPrompt(robot) {
  const biography = stripHtml(robot.system?.biography?.value ?? "");
  const chassis = robot.system?.robotics?.chassis ?? robot.name;
  const powerSource = robot.system?.robotics?.powerSource ?? "";
  const armament = /Armament:\s*([^<.]+)/i.exec(biography)?.[1]?.trim() ?? "";

  const factor = robotFormFactor(robot.name ?? chassis);

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
    `Primary request: full-body original science-fiction bestiary illustration of ${robot.name}, a pre-Fall robotic unit. SHAPE: ${factor.form}.`,
    "Scene/backdrop: isolated subject on a transparent background for Foundry VTT use.",
    `Subject: ${flavorText}`,
    "Style/medium: original retro-future industrial illustration, worn metal surfaces, exposed cabling, crisp silhouette, detailed but readable at token size, no copyrighted characters or logos.",
    `Composition/framing: ${factor.framing}.`,
    "Lighting/mood: dramatic but neutral presentation lighting, subtle rim light, clean readable shapes.",
    `Color palette: ${factor.palette}.`,
    "Constraints: single subject only; transparent background; NO text, NO letters, NO numbers, NO labels, NO captions, NO serial numbers, NO writing of any kind anywhere in the image; respect the described chassis, sensors, and armament; no frame; no watermark.",
    "Avoid: bipedal humanoid silhouette UNLESS the SHAPE line above explicitly says humanoid; multiple robots; scenery clutter; captions; logo marks; text overlays; decorative armor flourishes that are not described; pilot operators riding the machine."
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* 0.14.19 — Cryptic Alliance banner art                              */
/* ------------------------------------------------------------------ */

/**
 * Per-alliance scene briefs. Pre-written rather than auto-derived
 * from the alliance description because the visual vocabulary of each
 * faction is deliberately distinct (purist soldiers, robe-and-tome
 * scholars, hidden android conspiracy, etc.) and matters more than
 * the few-line text card on the page.
 */
const ALLIANCE_SCENES = Object.freeze({
  "Brotherhood of Thought":
    "A circle of robed scholars — a pure-strain human, a mutated humanoid with a third eye, and a dignified mutated-animal in scribe's robes — gathered at a long oak table in a vast pre-Fall library; a glowing holographic codex hovers above the table; tall stained-glass windows behind; warm amber reading-lamp light. Mood: scholarly, peaceful, illuminated.",
  "Followers of the Voice":
    "Silhouetted figures kneeling in a wasteland half-circle around a tall broadcast pylon whose dish glows with eerie green-blue static; the figures wear ragged robes and crude antennae headpieces wired to handheld receivers; a lone full moon behind the pylon. Mood: cult-of-the-signal, mystery, dread.",
  "Radiationists":
    "Hooded mutant cultists kneeling before a glowing radioactive altar in a half-buried reactor chamber; the altar's heart is a piece of fissioning material that bathes the scene in green-yellow light; a banner above bears a stylized radiation trefoil and stars; the worshippers' silhouettes show clear mutations. Mood: zealous, ritualistic, irradiated.",
  "Ranks of the Fit":
    "A formation of armored human and humanoid soldiers under a stark crimson-and-black banner; the banner shows a clenched mailed fist; brutalist concrete fortifications behind; pre-Fall power armor with bolt-on plate; rifles braced; stern, helmeted faces. Mood: militant purity, severity, intimidation.",
  "Restorationists":
    "A team of human engineers in coveralls and hardhats reactivating an enormous pre-Fall machine — a generator hall with cables, gauges, and rising work-light glow; in the background a partially-restored skyscraper rises against a salvaged skyline; blueprints unrolled on a crate. Mood: hopeful reconstruction, warm copper light, civic pride.",
  "The Archivists":
    "A solitary archivist at a reading-lectern in a cathedral-scale data vault; floor-to-ceiling shelves rise into shadow stacked with codices, data-tapes, and ancient drives; the archivist holds an open book that emits a soft amber halo onto the page. Mood: hushed reverence, vast preservation, candlelight + readout glow.",
  "The Created":
    "A conclave of silhouetted androids inside a dark, half-lit factory floor — three or four humanoid robotic figures standing in a tight circle, their optic sensors glowing cold cyan; one figure holds a humanoid skull-mask casually at its side; a banner in the background bears a stylized gear-and-eye sigil. Mood: secretive, conspiratorial, cold blue palette.",
  "The Healers":
    "A medic in a white-and-green coat tending a wounded mutated humanoid lying on a triage cot; a pure-strain human and a mutated-animal patient wait nearby; a battered white banner with a stylized caduceus / staff-and-leaf hangs behind; the field shelter is canvas with surgical-light glow. Mood: compassionate, warm, neutral aid.",
  "The Seekers":
    "A pair of explorers — one in scavenged duster, one a mutated humanoid in a goggled hood — standing in a vast collapsed dome; one holds aloft a glowing pre-Fall artifact whose light spills across crumbled marble walls inscribed with faded ancient script; treasure-cart and dim torchlight in the foreground. Mood: wonder, danger, lost-civilization grandeur.",
  "Zoopremisists":
    "A coalition of mutated animals in faction regalia — a wolf-headed sergeant in armor at center holding a banner aloft, flanked by a mutated bear, a mutated raven on a perch, and a smaller fox-form runner; banner shows a stylized paw-print with crown; sun-baked plains landscape behind. Mood: dignified animal-led order, defiance, golden sunset light."
});

function buildAlliancePrompt(alliance) {
  const html = alliance.pages?.[0]?.text?.content ?? "";
  const description = stripHtml(html);
  const scene = ALLIANCE_SCENES[alliance.name]
    ?? `A faction tableau evoking: ${description.slice(0, 240)}.`;

  const lines = [
    "Use case: faction banner / journal-page header art",
    "Asset type: cryptic-alliance heraldic illustration",
    `Primary request: original square illustration representing the GW1e cryptic alliance "${alliance.name}", suitable for the header of a journal page describing the faction.`,
    "Scene/backdrop: a single composed scene as described below (NOT a transparent background — this is a banner, fill the frame).",
    `Subject scene: ${scene}`,
    `Faction tagline (for tone, do not render as text): ${description.slice(0, 320)}`,
    "Style/medium: painted fantasy / post-apocalyptic illustration; dramatic but readable shapes; era-evoking detail (pre-Fall ruins, retro-future tech, stylized banners); no copyrighted characters or logos.",
    "Composition/framing: square composition, mid-distance view of the scene, subject(s) centered, environmental context filling the rest of the frame.",
    "Lighting/mood: as described in the subject scene; lean into the faction's emotional register.",
    "Color palette: as described in the subject scene; use it to make each alliance instantly distinguishable from the others.",
    "Constraints: NO text, NO letters, NO numbers, NO labels, NO captions, NO writing of any kind anywhere in the image; faction banners may show abstract sigils / shapes but never readable letterforms; no watermark; no frame.",
    "Avoid: copyrighted symbols (real-world flags, brand logos, religious symbols of present-day faiths), generic stock-fantasy clichés that ignore the post-apocalyptic setting."
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
  armor: {
    default_out: path.join(repoRoot, "tmp", "imagegen", "armor-prompts.jsonl"),
    sources: async () => (await equipmentPackSources()).filter((item) => item.type === "armor"),
    promptFor: buildArmorPrompt
  },
  gear: {
    default_out: path.join(repoRoot, "tmp", "imagegen", "gear-prompts.jsonl"),
    sources: async () => (await equipmentPackSources()).filter((item) => item.type === "gear"),
    promptFor: buildGearPrompt
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
  },
  "sample-actors": {
    default_out: path.join(repoRoot, "tmp", "imagegen", "sample-actor-prompts.jsonl"),
    sources: async () => samplePackSources(),
    promptFor: buildSampleActorPrompt
  },
  "cryptic-alliances": {
    default_out: path.join(repoRoot, "tmp", "imagegen", "cryptic-alliance-prompts.jsonl"),
    sources: async () => crypticAlliancePackSources(),
    promptFor: buildAlliancePrompt
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
