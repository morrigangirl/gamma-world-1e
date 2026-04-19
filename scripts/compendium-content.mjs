import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SYSTEM_ID } from "../module/config.mjs";
import { buildMutationItemSource } from "../module/mutation-rules.mjs";
import { MUTATION_DEFINITIONS, findMutationByName } from "../module/tables/mutation-data.mjs";
import { ALLIANCE_DATA } from "../module/alliances.mjs";
import { ATTRIBUTE_BONUS_MATRIX, LEVEL_THRESHOLDS } from "../module/experience.mjs";
import {
  ENCOUNTER_TERRAIN_KEYS,
  ENCOUNTER_TABLE_ICONS,
  ENCOUNTER_TABLE_LABELS,
  ENCOUNTER_TABLE_SEED_VERSION,
  terrainEncounterResults
} from "../module/tables/encounter-tables.mjs";
import {
  MENTAL_ATTACK_MATRIX,
  PHYSICAL_ATTACK_MATRIX_I,
  PHYSICAL_ATTACK_MATRIX_II,
  WEAPON_CLASS_TABLE,
  WEAPON_DAMAGE_TABLE
} from "../module/tables/combat-matrix.mjs";
import { POISON_MATRIX, RADIATION_MATRIX } from "../module/tables/resistance-tables.mjs";
import { enrichEquipmentSystemData } from "../module/equipment-rules.mjs";
import {
  createPrototypeTokenSource,
  defaultPrototypeTokenOptions,
  monsterPortraitPath,
  monsterTokenPath
} from "../module/token-defaults.mjs";
import { monsterPackSources } from "./monster-content.mjs";

function htmlParagraphs(...parts) {
  return parts.filter(Boolean).map((text) => `<p>${text}</p>`).join("");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function slugifyName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 0.8.1: if a generated icon exists at `assets/<subdir>/<slug>.png`,
 * return the Foundry systems-relative path so the compendium item
 * picks it up. Otherwise return `fallback`. Checked at build time; the
 * compiled pack inlines whichever path wins.
 */
function generatedIconPath(subdir, name, fallback) {
  const slug = slugifyName(name);
  if (!slug) return fallback;
  const diskPath = path.join(repoRoot, "assets", subdir, `${slug}.png`);
  if (fs.existsSync(diskPath)) {
    return `systems/${SYSTEM_ID}/assets/${subdir}/${slug}.png`;
  }
  return fallback;
}

function weaponIconPath(name) {
  return generatedIconPath("weapons", name, "icons/svg/sword.svg");
}

function mutationIconPath(name) {
  return generatedIconPath("mutations", name, "icons/svg/aura.svg");
}

function weaponSource({
  name,
  weaponClass,
  damage,
  attackType,
  short = 0,
  medium = 0,
  long = 0,
  effect = {},
  description = "",
  ammoType = [],
  category,
  rof = 1,
  weight = 0
}) {
  // 0.8.1: ammoType is a SetField of strings on the weapon schema. Accept
  // both array and string inputs so legacy callers still work.
  const ammoTypeList = Array.isArray(ammoType)
    ? ammoType.filter(Boolean)
    : (ammoType ? [String(ammoType)] : []);

  const source = {
    name,
    type: "weapon",
    img: weaponIconPath(name),
    system: {
      weaponClass,
      category: category ?? "",
      ammoType: ammoTypeList,
      damage: { formula: damage, type: attackType === "energy" ? "energy" : "physical" },
      range: { short, medium, long },
      attackType,
      rof,
      // 0.8.1: no inline ammo counter on pack weapons; consumption reads
      // from a matching `gear` item with `system.ammo.type` at fire-time.
      ammo: { current: 0, max: 0, consumes: false },
      effect: {
        mode: effect.mode ?? "damage",
        formula: effect.formula ?? "",
        status: effect.status ?? "",
        notes: effect.notes ?? ""
      },
      quantity: 1,
      weight,
      equipped: false,
      description: { value: description }
    }
  };
  enrichEquipmentSystemData(source);
  return source;
}

function ammoSource({ name, ammoType, rounds = 20, weight = 0.1, description = "" }) {
  const source = {
    name,
    type: "gear",
    img: "icons/weapons/ammunition/arrow-simple.webp",
    system: {
      quantity: 1,
      weight,
      subtype: "ammunition",
      equipped: false,
      ammo: { type: ammoType, rounds },
      description: { value: description }
    }
  };
  enrichEquipmentSystemData(source);
  return source;
}

function containerSource({ name, capacity, weight = 1, description = "" }) {
  const source = {
    name,
    type: "gear",
    img: "icons/containers/bags/pack-leather-brown.webp",
    system: {
      quantity: 1,
      weight,
      subtype: "container",
      equipped: false,
      container: { capacity, stored: [] },
      description: { value: description }
    }
  };
  enrichEquipmentSystemData(source);
  return source;
}

function armorSource({
  name,
  acValue,
  armorType = "medium",
  dxPenalty = 0,
  weight = 0,
  description = ""
}) {
  const source = {
    name,
    type: "armor",
    img: "icons/svg/holy-shield.svg",
    system: {
      acValue,
      armorType,
      dxPenalty,
      quantity: 1,
      weight,
      equipped: false,
      description: { value: description }
    }
  };
  enrichEquipmentSystemData(source);
  return source;
}

function gearSource({
  name,
  quantity = 1,
  weight = 0,
  tech = "none",
  description = "",
  action = {},
  // Gap #2: area-of-effect descriptor for grenades / missiles / bombs.
  // Populating this lights up the Phase H `useAoeOrdnance` flow when the
  // item is used. `radius` in meters, `persistentRounds` > 0 keeps the
  // template visible for N rounds (gas clouds). Leave all zero / empty
  // for a non-AOE gear item (the default).
  area = {}
}) {
  const source = {
    name,
    type: "gear",
    img: "icons/svg/item-bag.svg",
    system: {
      quantity,
      weight,
      tech,
      action: {
        mode: action.mode ?? "none",
        damageFormula: action.damageFormula ?? "",
        saveType: action.saveType ?? "",
        intensityFormula: action.intensityFormula ?? "",
        radius: action.radius ?? 0,
        durationFormula: action.durationFormula ?? "",
        acDelta: action.acDelta ?? 0,
        toHitDelta: action.toHitDelta ?? 0,
        status: action.status ?? "",
        consumeQuantity: action.consumeQuantity ?? 0,
        ongoing: !!action.ongoing,
        notes: action.notes ?? ""
      },
      area: {
        shape: area.shape ?? "circle",
        radius: Number(area.radius ?? 0) || 0,
        persistentRounds: Number(area.persistentRounds ?? 0) || 0,
        animationKey: area.animationKey ?? "",
        saveType: area.saveType ?? "",
        onFailStatus: area.onFailStatus ?? "",
        halfDamageOnSave: !!area.halfDamageOnSave
      },
      description: { value: description }
    }
  };
  enrichEquipmentSystemData(source);
  return source;
}

function actorSystem({
  type = "humanoid",
  animalForm = "",
  level = 1,
  movement = 120,
  alliance = "",
  baseAc = 10,
  naturalAttackName = "Natural Attack",
  naturalAttackDamage = "1d3",
  stats,
  hp
}) {
  return {
    details: { type, animalForm, level, xp: 0, movement, alliance, role: type === "robot" ? "robotic unit" : "adventurer", speech: "common", creatureClass: "" },
    attributes: Object.fromEntries(
      Object.entries(stats).map(([key, value]) => [key, { value, mod: 0, save: 0 }])
    ),
    combat: {
      baseAc,
      naturalAttack: {
        name: naturalAttackName,
        damage: naturalAttackDamage
      }
    },
    resources: {
      hp: { base: hp, value: hp, max: hp, formula: "@attributes.cn.value d6" },
      ac: baseAc,
      mentalResistance: stats.ms,
      radResistance: stats.cn,
      poisonResistance: stats.cn
    },
    biography: {
      value: "",
      appearance: "",
      notes: ""
    },
    social: {
      languages: type === "robot" ? "Common, programmed machine language" : "Common",
      literacy: type === "psh" ? "Ancient signage" : "",
      relatives: "",
      homeRegion: "",
      reputation: 0
    },
    encounter: {
      reactionModifier: 0,
      surpriseModifier: 0,
      morale: 0,
      intelligence: "auto",
      cannotBeSurprised: false
    },
    robotics: {
      isRobot: type === "robot",
      mode: type === "robot" ? "programmed" : "inactive",
      chassis: "",
      identifier: "",
      controller: "",
      powerSource: type === "robot" ? "broadcast" : "none",
      powerCurrent: type === "robot" ? Math.max(10, hp / 2) : 0,
      powerMax: type === "robot" ? Math.max(10, hp / 2) : 0,
      broadcastCapable: type === "robot",
      backupHours: 0,
      repairDifficulty: type === "robot" ? 12 : 0,
      malfunction: ""
    },
    chargen: {
      rolled: true,
      statMethod: "manual",
      mutationMethod: "random",
      mutationsRolled: false
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleCase(value = "") {
  return String(value ?? "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortedKeys(map, { numeric = false, descending = false } = {}) {
  const values = Object.keys(map ?? {});
  if (!numeric) return values.sort((a, b) => descending ? b.localeCompare(a) : a.localeCompare(b));
  return values
    .map((value) => Number(value))
    .sort((a, b) => descending ? b - a : a - b);
}

function referenceTable(headers, rows, {
  rowHeaders = true,
  caption = "",
  compact = false
} = {}) {
  const headHtml = headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const bodyHtml = rows.map((row) => {
    const cells = row.map((cell, index) => {
      const tag = rowHeaders && (index === 0) ? "th scope=\"row\"" : "td";
      return `<${tag}>${escapeHtml(cell)}</${tag.split(" ")[0]}>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  return `
    <div style="overflow-x:auto; margin:0.75rem 0;">
      <table style="border-collapse:collapse; width:max-content; min-width:100%; font-size:${compact ? "0.86rem" : "0.92rem"};">
        ${caption ? `<caption style="caption-side:top; text-align:left; font-weight:bold; margin-bottom:0.35rem;">${escapeHtml(caption)}</caption>` : ""}
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function attackMatrixOnePage() {
  const armorClasses = Array.from({ length: 10 }, (_entry, index) => index + 1);
  const weaponClasses = Array.from({ length: 16 }, (_entry, index) => index + 1);
  const matrixRows = armorClasses.map((armorClass) => [
    String(armorClass),
    ...weaponClasses.map((weaponClass) => String(PHYSICAL_ATTACK_MATRIX_I[armorClass][weaponClass]))
  ]);
  const classRows = weaponClasses.map((weaponClass) => [
    String(weaponClass),
    WEAPON_CLASS_TABLE[weaponClass]
  ]);

  return htmlParagraphs(
    "Descending armor class is used: cross the defender’s armor class with the attacker’s weapon class to get the d20 target number needed to hit.",
    "Physical weapon attacks use Matrix I."
  ) + referenceTable(["AC", ...weaponClasses.map(String)], matrixRows, { compact: true })
    + referenceTable(["Weapon Class", "Weapons"], classRows, { compact: true });
}

function attackMatrixTwoPage() {
  const armorClasses = Array.from({ length: 10 }, (_entry, index) => index + 1);
  const hitDiceBuckets = ["1", "2-3", "4-5", "6-8", "9-10", "11-14", "15+"];
  const rows = armorClasses.map((armorClass) => [
    String(armorClass),
    ...hitDiceBuckets.map((bucket) => String(PHYSICAL_ATTACK_MATRIX_II[armorClass][bucket]))
  ]);

  return htmlParagraphs(
    "Use Matrix II for creatures and natural attacks without a listed weapon class.",
    "Cross the defender’s descending armor class with the attacker’s hit-dice bracket."
  ) + referenceTable(["AC", ...hitDiceBuckets], rows, { compact: true });
}

function mentalAttackMatrixPage() {
  const mentalStrengths = Array.from({ length: 16 }, (_entry, index) => index + 3);
  const rows = mentalStrengths.map((defenderStrength) => [
    String(defenderStrength),
    ...mentalStrengths.map((attackerStrength) => String(MENTAL_ATTACK_MATRIX[defenderStrength][attackerStrength]))
  ]);

  return htmlParagraphs(
    "Cross the defender’s mental strength with the attacker’s mental strength to find the required d20 result.",
    "\"A\" means automatic success; \"NE\" means no effect or impossible."
  ) + referenceTable(["Def\\Att", ...mentalStrengths.map(String)], rows, { compact: true });
}

function weaponDamageChartPage() {
  const weaponRows = sortedKeys(WEAPON_DAMAGE_TABLE).map((key) => {
    const entry = WEAPON_DAMAGE_TABLE[key];
    return [
      titleCase(key),
      entry.small,
      entry.large,
      entry.effectiveRange > 0 ? String(entry.effectiveRange) : "Melee"
    ];
  });

  return htmlParagraphs(
    "This chart covers the primitive and low-tech weapons listed in the Gamma World core rules.",
    "Damage is split by target size: small/man-sized versus large opponents."
  ) + referenceTable(["Weapon", "Small / Man-Sized", "Large", "Effective Range"], weaponRows);
}

function fatigueRulesPage() {
  return htmlParagraphs(
    "During extended combat, fatigue begins to matter somewhere between the 11th and 18th melee turn depending on weapon, armor, and strength.",
    "A combatant’s fatigue factor is subtracted from the attacker’s weapon class when using the physical attack matrix.",
    "Each melee turn spent resting reduces the fatigue factor by 1, and each point of Physical Strength over 15 also reduces it by 1.",
    "If fatigue drops the effective weapon class to 0, the combatant cannot make an effective damaging attack until enough rest brings it back to at least 1.",
    "Powered energy weapons, powered blade weapons, and powered offensive armor do not accumulate fatigue under the core rules. Powered defensive armor still carries fatigue costs."
  );
}

function hazardMatrixPage(matrix, {
  intro = "",
  rowLabel = "",
  columnLabel = "",
  codeNotes = []
} = {}) {
  const rowKeys = sortedKeys(matrix, { numeric: true, descending: true });
  const columnKeys = sortedKeys(matrix[rowKeys[0]], { numeric: true });
  const rows = rowKeys.map((rowKey) => [
    String(rowKey),
    ...columnKeys.map((columnKey) => String(matrix[rowKey][columnKey]))
  ]);

  return htmlParagraphs(
    intro,
    `${rowLabel} runs down the left side; ${columnLabel} runs across the top.`,
    ...codeNotes
  ) + referenceTable([rowLabel, ...columnKeys.map(String)], rows, { compact: true });
}

function encounterResultDescription(entry) {
  return htmlParagraphs(
    entry.countText ? `Numbers: ${entry.countText}.` : "",
    entry.notes || "",
    entry.candidates?.length ? `Typical references: ${entry.candidates.join(", ")}.` : ""
  );
}

export function mutationPackSources() {
  // rollVariant: false — keep variant slots empty in the compendium so
  // that dragging a random-variant mutation (Absorption, Fear Impulse,
  // Skin Structure Change, etc.) onto an actor triggers a fresh roll
  // via the preCreateItem hook rather than always applying the value
  // that happened to roll at pack-build time.
  //
  // 0.8.1: post-process each source so generated icons under
  // `assets/mutations/<slug>.png` replace the SVG default when present.
  return [...MUTATION_DEFINITIONS]
    .sort((a, b) => (a.subtype.localeCompare(b.subtype) || a.code - b.code || a.name.localeCompare(b.name)))
    .map((entry) => {
      const source = buildMutationItemSource(entry, { rollVariant: false });
      source.img = mutationIconPath(source.name);
      return source;
    });
}

export function equipmentPackSources() {
  return [
    weaponSource({
      name: "Club",
      weaponClass: 1,
      damage: "1d6",
      attackType: "melee",
      description: htmlParagraphs("A common cudgel or improvised striking weapon.", "Damage against larger opponents: 1d3.")
    }),
    weaponSource({
      name: "Spear",
      weaponClass: 1,
      damage: "1d6",
      attackType: "thrown",
      short: 20,
      long: 40,
      description: htmlParagraphs("Standard spear for melee or thrown use.", "Damage against larger opponents: 1d8.")
    }),
    weaponSource({
      name: "Battle Axe",
      weaponClass: 2,
      damage: "1d8",
      attackType: "melee",
      description: htmlParagraphs("Heavy axe for close combat.")
    }),
    weaponSource({
      name: "Hand Axe",
      weaponClass: 2,
      damage: "1d6",
      attackType: "thrown",
      short: 20,
      long: 40,
      description: htmlParagraphs("May be thrown; damage against larger opponents is 1d4.")
    }),
    weaponSource({
      name: "Dagger",
      weaponClass: 2,
      damage: "1d4",
      attackType: "thrown",
      short: 20,
      long: 40,
      description: htmlParagraphs("Short blade or knife.", "Damage against larger opponents: 1d3.")
    }),
    weaponSource({
      name: "Long Sword",
      weaponClass: 3,
      damage: "1d8",
      attackType: "melee",
      description: htmlParagraphs("The standard military sword.", "Damage against larger opponents: 1d12.")
    }),
    weaponSource({
      name: "Short Sword",
      weaponClass: 3,
      damage: "1d6",
      attackType: "melee",
      description: htmlParagraphs("A lighter sidearm.", "Damage against larger opponents: 1d8.")
    }),
    weaponSource({
      name: "Pole Arm",
      weaponClass: 3,
      damage: "1d8",
      attackType: "melee",
      description: htmlParagraphs("Long hafted weapon for keeping enemies at reach.", "Damage against larger opponents: 1d12.")
    }),
    weaponSource({
      name: "Javelin",
      weaponClass: 8,
      damage: "1d6",
      attackType: "thrown",
      short: 40,
      long: 80,
      description: htmlParagraphs("Thrown spear balanced for range.")
    }),
    weaponSource({
      name: "Bow",
      weaponClass: 9,
      damage: "1d6",
      attackType: "ranged",
      short: 100,
      long: 200,
      ammoType: ["arrow"],
      description: htmlParagraphs("Primitive missile weapon.", "Effective range 100 meters, maximum range 200 meters.")
    }),
    weaponSource({
      name: "Crossbow",
      weaponClass: 9,
      damage: "1d4",
      attackType: "ranged",
      short: 120,
      long: 240,
      ammoType: ["crossbow-bolt"],
      description: htmlParagraphs("Heavy mechanical bow with slower but reliable shots.")
    }),
    weaponSource({
      name: "Sling",
      weaponClass: 9,
      damage: "1d4",
      attackType: "ranged",
      short: 80,
      long: 160,
      // Accepts either river-smoothed stones or shaped lead bullets.
      ammoType: ["sling-stone", "sling-bullet"],
      description: htmlParagraphs("A leather-and-cord sling for hurling stones or cast-lead bullets.", "Load with Sling Stones for standard damage; shaped Sling Bullets add +1.")
    }),
    weaponSource({
      name: "Slug Thrower",
      weaponClass: 10,
      damage: "2d6",
      attackType: "ranged",
      short: 20,
      long: 40,
      ammoType: ["slug"],
      description: htmlParagraphs("Police riot-control sidearm firing stunning slugs.", "Track unconsciousness when stun damage reaches half the target's original hit points.", "Powered by a hydrogen energy cell good for about five clips.")
    }),
    weaponSource({
      // 0.8.1: collapsed the two legacy entries (Needler Poison + Needler
      // Paralysis) into a single weapon that accepts either ammo stack.
      // At fire-time the player picks which to consume when both are loaded.
      name: "Needler",
      weaponClass: 11,
      damage: "0",
      attackType: "ranged",
      short: 50,
      long: 100,
      ammoType: ["needler-poison", "needler-paralysis"],
      effect: { mode: "poison", formula: "17", notes: "Poison darts: poison save vs. difficulty 17 (3d6 damage, halved on success). Paralysis darts: poison save vs. difficulty 17; on failure the victim is paralyzed for up to 20 minutes, less one minute per point of Constitution." },
      description: htmlParagraphs("Soundless dart weapon. Fires poison or paralysis capsules — load whichever ammo stack the situation calls for.")
    }),
    weaponSource({
      name: "Stun Ray Pistol",
      weaponClass: 12,
      damage: "0",
      attackType: "energy",
      short: 25,
      long: 50,
      ammoType: ["stun-cell"],
      effect: { mode: "stun", formula: "20", status: "unconscious", notes: "Victim is stunned for up to 20 minutes, less one minute per point of Constitution." },
      description: htmlParagraphs("Short-ranged solar-cell stun weapon.", "One solar cell powers about ten shots.")
    }),
    weaponSource({
      name: "Stun Rifle",
      weaponClass: 12,
      damage: "0",
      attackType: "energy",
      short: 100,
      long: 200,
      ammoType: ["stun-cell"],
      effect: { mode: "stun", formula: "20", status: "unconscious", notes: "Victim is stunned for up to 20 minutes, less one minute per point of Constitution." },
      description: htmlParagraphs("Long-ranged stunning rifle.")
    }),
    weaponSource({
      name: "Laser Pistol",
      weaponClass: 13,
      damage: "5d6",
      attackType: "energy",
      short: 100,
      long: 200,
      ammoType: ["energy-clip"],
      description: htmlParagraphs("Hydrogen-cell laser sidearm.", "Class 2 armor deflects the first hit; class 1 armor deflects the first two hits.")
    }),
    weaponSource({
      name: "Laser Rifle",
      weaponClass: 13,
      damage: "6d6",
      attackType: "energy",
      short: 300,
      long: 600,
      ammoType: ["energy-clip"],
      description: htmlParagraphs("Military laser rifle.", "Class 2 armor deflects the first hit; class 1 armor deflects the first two hits.")
    }),
    weaponSource({
      name: "Mark V Blaster",
      weaponClass: 14,
      damage: "7d6",
      attackType: "energy",
      short: 75,
      long: 150,
      ammoType: ["blaster-pack"],
      description: htmlParagraphs("Disrupting-ray pistol that bores holes through inanimate matter and slain targets.")
    }),
    weaponSource({
      name: "Mark VII Blaster Rifle",
      weaponClass: 14,
      damage: "8d6",
      attackType: "energy",
      short: 225,
      long: 450,
      ammoType: ["blaster-pack"],
      description: htmlParagraphs("Heavy disruptor rifle.")
    }),
    weaponSource({
      name: "Black Ray Gun",
      weaponClass: 15,
      damage: "0",
      attackType: "energy",
      short: 25,
      long: 50,
      ammoType: ["black-ray-cell"],
      effect: { mode: "death", notes: "Instant death to living targets not protected by force fields." },
      description: htmlParagraphs("The ultimate hand-held weapon; living targets without force-field protection die instantly.", "Powered by a chemical energy cell for four shots.")
    }),
    weaponSource({
      name: "Fusion Rifle",
      weaponClass: 16,
      damage: "0",
      attackType: "energy",
      short: 350,
      long: 700,
      ammoType: ["fusion-cell"],
      effect: { mode: "radiation", formula: "18", notes: "Radiation save (1d20 + CN mod) vs. intensity 18. Miss by 1–3 → Radiation Sickness (mild); 4–6 → Sickness (severe) + new mutation; 7+ → Catastrophic Exposure (onset next day, −10% max HP/hour until ancient treatment or death)." },
      description: htmlParagraphs("Projects twin beams of intensity-18 radiation. A direct hit without Heightened Constitution or Bacterial Symbiosis is virtually certain to produce Catastrophic Exposure.", "Requires an atomic energy cell carried in a converter backpack linked by cable.")
    }),
    weaponSource({
      // Gap #1: Vibro-style blades and energy melee weapons are physical-reach
      // weapons; their "energy" flavor is that the cutting edge is a force-
      // field projection, not a beam. Set attackType to "melee" so
      // determineRangeBand() returns melee (no range bands, no "unlimited"
      // default) and the PS melee to-hit / damage bonuses apply.
      name: "Vibro Dagger",
      weaponClass: 4,
      damage: "10",
      attackType: "melee",
      description: htmlParagraphs("Force-field dagger. Cuts anything except another force field.")
    }),
    weaponSource({
      name: "Vibro Blade",
      weaponClass: 5,
      damage: "25",
      attackType: "melee",
      description: htmlParagraphs("Force-field sword. Cuts anything except another force field.")
    }),
    weaponSource({
      name: "Energy Mace",
      weaponClass: 5,
      damage: "30",
      attackType: "melee",
      description: htmlParagraphs("Energized club. Cannot damage targets protected by energy shields.")
    }),
    weaponSource({
      name: "Stun Whip",
      weaponClass: 6,
      damage: "0",
      attackType: "melee",
      effect: { mode: "stun", formula: "20", status: "unconscious", notes: "Victim is stunned for up to 20 minutes, less one minute per point of Constitution." },
      description: htmlParagraphs("Three-meter energized whip that inflicts stun.")
    }),
    weaponSource({
      name: "Paralysis Rod",
      weaponClass: 7,
      damage: "0",
      attackType: "melee",
      effect: { mode: "paralysis", formula: "20", status: "paralysed", notes: "Touch attack. Victim saves vs poison intensity 16 or is paralysed for 1d6 melee turns." },
      description: htmlParagraphs("A short Ancient rod tipped with a discharge node. Drains two charges per use; 20 charges per nuclear cell.")
    }),
    weaponSource({
      name: "Force Field Generator",
      weaponClass: 1,
      damage: "0",
      attackType: "melee",
      effect: { mode: "note", notes: "Activates a personal force field providing AC 2, immunity to slugs, arrows, and melee. Drains 1 charge per hour; 24 charges per hydrogen cell, 96 per nuclear cell." },
      description: htmlParagraphs("Belt-mounted Ancient shield projector. Generates a full-body force field for the wearer only. Force fields block incoming fire but not outgoing attacks.")
    }),
    armorSource({
      name: "Shield",
      acValue: 10,
      armorType: "shield",
      description: htmlParagraphs("Primitive shield. Each equipped shield improves armor class by 1.")
    }),
    armorSource({
      name: "Sheath Armor",
      acValue: 4,
      armorType: "light",
      description: htmlParagraphs("Padded riot-control armor with helmet and guards.")
    }),
    armorSource({
      name: "Powered Plate",
      acValue: 3,
      armorType: "heavy",
      description: htmlParagraphs("Early powered armor. Moves 20 meters per melee turn on one atomic energy cell for roughly 50 hours.")
    }),
    armorSource({
      name: "Powered Alloyed Plate",
      acValue: 2,
      armorType: "heavy",
      description: htmlParagraphs("Improved powered armor. Moves 30 meters per melee turn on one atomic energy cell for roughly 45 hours.")
    }),
    armorSource({
      name: "Plastic Armor",
      acValue: 3,
      armorType: "medium",
      description: htmlParagraphs("Flexible armor that does not encumber the wearer.")
    }),
    armorSource({
      name: "Energized Armor",
      acValue: 2,
      armorType: "heavy",
      description: htmlParagraphs("Jet-assisted armor with long battery life.")
    }),
    armorSource({
      name: "Inertia Armor",
      acValue: 2,
      armorType: "heavy",
      description: htmlParagraphs("Partial force field protects against radiation, poison gas, and black rays, and absorbs half damage up to 25 points per melee turn.")
    }),
    armorSource({
      name: "Powered Scout Armor",
      acValue: 2,
      armorType: "heavy",
      description: htmlParagraphs("Force field absorbs the first 20 hit points sustained each melee turn and allows anti-grav flight.")
    }),
    armorSource({
      name: "Powered Battle Armor",
      acValue: 2,
      armorType: "heavy",
      description: htmlParagraphs("Force field absorbs the first 30 hit points sustained each melee turn and grants anti-grav flight plus hydraulic strength.")
    }),
    armorSource({
      name: "Powered Attack Armor",
      acValue: 1,
      armorType: "heavy",
      description: htmlParagraphs("Force field absorbs the first 40 hit points sustained each melee turn; built-in lasers, missiles, and grenade launcher.")
    }),
    armorSource({
      name: "Powered Assault Armor",
      acValue: 1,
      armorType: "heavy",
      description: htmlParagraphs("Force field absorbs the first 50 hit points sustained each melee turn and includes attack-armor systems.")
    }),
    gearSource({
      name: "Backpack and Woven Goods",
      weight: 1,
      description: htmlParagraphs("General carrying kit and common personal gear.")
    }),
    gearSource({
      name: "Traveling Supplies",
      weight: 1,
      description: htmlParagraphs("Rope, lantern, and expedition staples.")
    }),
    gearSource({
      name: "Special Food Stores",
      weight: 1,
      description: htmlParagraphs("Wine skin, dried foods, and week-long trail provisions.")
    }),
    gearSource({
      name: "Mirror and Oil Flask",
      weight: 1,
      description: htmlParagraphs("Unusual but often practical scavenger tools.")
    }),
    // ---- AOE ordnance --------------------------------------------------
    // Gap #2: every explosive / gas / missile gets a system.area descriptor so
    // Phase H's useAoeOrdnance flow activates on use. `persistentRounds: 0` =
    // instantaneous blast (template cleans up after resolution); > 0 = cloud
    // that lingers that many combat rounds. `saveType` routes save cards
    // through the system's save pipeline; `onFailStatus` applies a timed
    // condition on a failed save; `halfDamageOnSave` is the classic save-for-
    // half rule on explosives.
    gearSource({
      name: "Tear Gas Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter radius cloud for 1d6 minutes. Each melee turn in the gas lowers armor class by 1 and adds 2 to attack rolls against the victim."),
      area: { shape: "circle", radius: 10, persistentRounds: 10, saveType: "poison", onFailStatus: "blinded" }
    }),
    gearSource({
      name: "Stun Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter radius cloud for 1d4 minutes. Each victim saves vs poison against a random intensity or is stunned for 20 minutes less Constitution."),
      area: { shape: "circle", radius: 10, persistentRounds: 6, saveType: "poison", onFailStatus: "unconscious" }
    }),
    gearSource({
      name: "Poison Gas Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter radius cloud for 1d6 minutes. Victims save vs poison each melee turn spent in the cloud."),
      area: { shape: "circle", radius: 10, persistentRounds: 10, saveType: "poison" }
    }),
    gearSource({
      name: "Fragmentation Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter blast radius. Deals 5d6 damage to every target in the area."),
      area: { shape: "circle", radius: 10, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Chemical Explosive Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter blast radius. Deals 10d6 damage to every target in the area."),
      area: { shape: "circle", radius: 10, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Micro Missile",
      tech: "iv",
      description: htmlParagraphs("500 meter effective range, 10 meter blast radius, 7d6 damage to each target in the area."),
      area: { shape: "circle", radius: 10, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Mini Missile",
      tech: "iv",
      description: htmlParagraphs("1 kilometer effective range, 20 meter blast radius, 50 damage to each target in the area."),
      area: { shape: "circle", radius: 20, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Mutation Bomb",
      tech: "v",
      description: htmlParagraphs("30 meter radius. Each living creature without force-field protection either gains a random mutational defect (60%) or makes a radiation save vs. intensity 12 (40%); failures land in the usual radiation sickness bands."),
      area: { shape: "circle", radius: 30, saveType: "radiation" }
    }),
    gearSource({
      name: "Energy Grenade",
      tech: "iv",
      description: htmlParagraphs("10 meter blast radius. Deals 12d6 damage, but only half damage against armor classes 8 and 9."),
      area: { shape: "circle", radius: 10, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Photon Grenade",
      tech: "v",
      description: htmlParagraphs("10 meter blast radius. Instantly kills creatures not protected by force fields or energy shields."),
      area: { shape: "circle", radius: 10 }
    }),
    gearSource({
      name: "Torc Grenade",
      tech: "v",
      description: htmlParagraphs("15 meter blast radius. Disintegrates all matter not protected by force fields or energy shields."),
      area: { shape: "circle", radius: 15 }
    }),
    gearSource({
      name: "Small Damage Pack",
      tech: "iv",
      description: htmlParagraphs("Plastic explosive pack with a 10 meter blast radius, dealing 6d6 damage."),
      area: { shape: "circle", radius: 10, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Concentrated Damage Pack",
      tech: "iv",
      description: htmlParagraphs("Large shaped explosive charge. Small pattern: 30 meter blast radius for 10d6 damage."),
      area: { shape: "circle", radius: 30, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Fission Bomb",
      tech: "vi",
      description: htmlParagraphs("Tactical nuclear weapon. Clean-bomb statistics are automated; dirty-bomb fallout remains referee-directed."),
      area: { shape: "circle", radius: 100, halfDamageOnSave: true, saveType: "radiation" }
    }),
    gearSource({
      name: "Fusion Bomb",
      tech: "vi",
      description: htmlParagraphs("50 meter blast radius. Deals 75 damage to every target in the area."),
      area: { shape: "circle", radius: 50, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Concussion Bomb",
      tech: "vi",
      description: htmlParagraphs("Mounted tactical gas bomb. Fills a 50 meter radius with stunning gas for 2d6 minutes.", "Victims save vs poison intensity 15 each melee turn spent in the cloud or become stunned."),
      area: { shape: "circle", radius: 50, persistentRounds: 12, saveType: "poison", onFailStatus: "unconscious" }
    }),
    gearSource({
      name: "Matter Bomb",
      tech: "vi",
      description: htmlParagraphs("10 meter blast radius. Deals 75 damage to every target in the area."),
      area: { shape: "circle", radius: 10, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Negation Bomb",
      tech: "vi",
      description: htmlParagraphs("30 meter blast radius. Drains power sources and collapses energy protection."),
      area: { shape: "circle", radius: 30 }
    }),
    gearSource({
      name: "Neutron Bomb",
      tech: "vi",
      description: htmlParagraphs("500 meter blast radius. Inflicts 100 damage to force fields and kills most unshielded living targets."),
      area: { shape: "circle", radius: 500, halfDamageOnSave: true, saveType: "radiation" }
    }),
    gearSource({
      name: "Trek Bomb",
      tech: "vi",
      description: htmlParagraphs("30 meter blast radius. Disintegrates unshielded matter and inflicts 30 damage to force fields."),
      area: { shape: "circle", radius: 30 }
    }),
    gearSource({
      name: "Surface Missile",
      tech: "vi",
      description: htmlParagraphs("Computer-guided tactical missile. 100 meter blast radius, 150 damage to each target."),
      area: { shape: "circle", radius: 100, halfDamageOnSave: true }
    }),
    gearSource({
      name: "Neutron Missile",
      tech: "vi",
      description: htmlParagraphs("Surface missile with a neutron bomb warhead.")
    }),
    gearSource({
      name: "Negation Missile",
      tech: "vi",
      description: htmlParagraphs("Surface missile with a negation-bomb warhead.")
    }),
    gearSource({
      name: "Fission Missile",
      tech: "vi",
      description: htmlParagraphs("Surface missile with a fission warhead.")
    }),
    gearSource({
      name: "Portent",
      tech: "v",
      description: htmlParagraphs("Backpack-sized four-person energy shield powered by two solar cells.", "The shield keeps out the elements and absorbs 5 damage before burning out; the cells hold about 24 hours of constant use and recharge in daylight.")
    }),
    gearSource({
      name: "Energy Cloak",
      tech: "v",
      description: htmlParagraphs("Powered cloak and cowl. When active, it is completely resistant to laser beams.", "One chemical energy cell powers it for about 12 hours.")
    }),
    gearSource({
      name: "Control Baton",
      tech: "v",
      description: htmlParagraphs("Military command baton used to identify command personnel and direct powered armor or robotic units.", "At a touch it can activate or deactivate powered armor and can home in on powered suits within one kilometer.")
    }),
    gearSource({
      name: "Communications Sender",
      tech: "iv",
      description: htmlParagraphs("Short-range two-way radio or TV unit with ranges up to 100 kilometers.", "Designed to run from chemical or solar energy cells.")
    }),
    gearSource({
      name: "Medi-kit",
      tech: "v",
      description: htmlParagraphs("Portable medical computer that analyzes injuries, administers medication, and gives first-aid instructions.", "A chemical energy cell powers roughly four treatments for a given problem.")
    }),
    gearSource({
      name: "Anti-grav Sled",
      tech: "v",
      description: htmlParagraphs("Floating cargo platform able to support enormous loads just above the ground.", "A single atomic energy cell powers about 100 hours of continuous operation.")
    }),
    gearSource({
      name: "Ultra-violet and Infra-red Goggles",
      tech: "iv",
      description: htmlParagraphs("Lets the wearer detect heat and light sources invisible to the naked eye.")
    }),
    gearSource({
      name: "Chemical Energy Cell",
      tech: "iv",
      description: htmlParagraphs("Rechargeable chemical battery used by many Ancient devices.")
    }),
    gearSource({
      name: "Solar Energy Cell",
      tech: "iv",
      description: htmlParagraphs("Rechargeable cell fitted with a solar panel.")
    }),
    gearSource({
      name: "Hydrogen Energy Cell",
      tech: "v",
      description: htmlParagraphs("High-capacity rechargeable cell more expensive than chemical batteries.")
    }),
    gearSource({
      name: "Atomic Energy Cell",
      tech: "v",
      description: htmlParagraphs("Long-lived shielded nuclear battery.")
    }),
    gearSource({
      name: "Energy Cell Charger",
      tech: "v",
      description: htmlParagraphs("Recharges chemical or hydrogen energy cells when attached to suitable external power.", "The book specifically calls out line or broadcast power, and hydrogen cells take twice as long to recharge as chemical cells.")
    }),
    gearSource({
      name: "Pain Reducer",
      tech: "v",
      description: htmlParagraphs("Suppresses pain for 4 hours and lets the patient sustain temporary extra injury.")
    }),
    gearSource({
      name: "Mind Booster",
      tech: "v",
      description: htmlParagraphs("Raises mental strength by 3 for one hour, followed by forced rest.")
    }),
    gearSource({
      name: "Sustenance Dose",
      tech: "v",
      description: htmlParagraphs("Provides a full day of nourishment and suppresses hunger.")
    }),
    gearSource({
      name: "Interra Shot",
      tech: "v",
      description: htmlParagraphs("Truth serum that opens the subconscious to direct interrogation.")
    }),
    gearSource({
      name: "Stim Dose",
      tech: "v",
      description: htmlParagraphs("Temporarily grants +3 physical strength and +1 dexterity.")
    }),
    gearSource({
      name: "Cur-in Dose",
      tech: "v",
      description: htmlParagraphs("Miracle antidote that negates poison or drug effects.")
    }),
    gearSource({
      name: "Suggestion Change",
      tech: "v",
      description: htmlParagraphs("Hypnotic drug that induces obedience to the first person seen on waking.")
    }),
    gearSource({
      name: "Accelera Dose",
      tech: "v",
      description: htmlParagraphs("Restores 1d10 lost hit points.")
    }),
    gearSource({
      name: "Anti-Radiation Serum",
      tech: "v",
      description: htmlParagraphs("Restores hit points lost to recent radiation exposure.")
    }),
    gearSource({
      name: "Rejuv Chamber",
      tech: "vi",
      description: htmlParagraphs("Hospital appliance that restores severely injured patients, but only safely once per month.")
    }),
    gearSource({
      name: "Stasis Chamber",
      tech: "vi",
      description: htmlParagraphs("Places the patient into suspended animation until released.")
    }),
    gearSource({
      name: "Life Ray",
      tech: "vi",
      description: htmlParagraphs("Rare device with a 50% chance to revive the dead if used within 24 hours.")
    }),
    gearSource({
      name: "I.D. Device",
      tech: "vi",
      description: htmlParagraphs("Generic Ancient identification credential.", "Stages ranged from ordinary citizen access through military command authority, often distinguished by color coding and secondary markings.")
    }),
    gearSource({
      name: "Hall Monitor",
      tech: "vi",
      description: htmlParagraphs("Multi-lens security camera with audio pickup and infra-red sensors.", "Normally reports to nearby security installations within roughly one mile.")
    }),
    gearSource({
      name: "Com Unit",
      tech: "vi",
      description: htmlParagraphs("Hand-sized communication device for talking to matching units and programmed computers.", "Many are restricted to a particular service, while command models can speak to multiple networks.")
    }),
    gearSource({
      name: "Computer Terminal",
      tech: "vi",
      description: htmlParagraphs("Standard Ancient keyboard-and-screen terminal for interacting with a larger computer system.", "Unreprogrammed terminals are normally usable only by Pure Strain Humans or unmutated users.")
    }),
    gearSource({
      name: "Main Building Computer",
      tech: "vi",
      description: htmlParagraphs("Building control computer that supervises security and maintenance systems.", "Can dispatch security robots and operate terminals wired into the installation.")
    }),
    gearSource({
      name: "Radioactive Material",
      tech: "vi",
      description: htmlParagraphs("Ancient isotopes stored in solid, liquid, or gaseous form for industrial, medical, or military use.", "Half-lives range from moments to centuries; handling is very much a referee problem.")
    }),
    gearSource({
      name: "Duralloy Panel",
      tech: "vi",
      description: htmlParagraphs("Triangular one-meter sheet of impossibly strong Ancient engineering metal.", "Lightweight, clamp-drilled, and effectively immune to ordinary tools.")
    }),
    // Broadcast Power Station removed — ambient infrastructure, not an item.
    // See the "Broadcast Power" journal in the rulebook pack for the rules.
    gearSource({
      name: "Civilian Internal Combustion Vehicle",
      tech: "iv",
      description: htmlParagraphs("24th-century car or truck running on alcohol or fossil fuel.")
    }),
    gearSource({
      name: "Military Alcohol Combustion Vehicle",
      tech: "iv",
      description: htmlParagraphs("Military cargo or troop carrier using alcohol combustion and limited anti-grav support.")
    }),
    gearSource({
      name: "Turbine Car",
      tech: "iv",
      description: htmlParagraphs("Efficient wheeled vehicle powered by a turbine engine.")
    }),
    gearSource({
      name: "Hover Car",
      tech: "v",
      description: htmlParagraphs("Common passenger vehicle riding on a cushion of air.", "Uses a steam turbine and one atomic energy cell; the cell lasts about 20,000 kilometers.")
    }),
    gearSource({
      name: "Flit Car",
      tech: "v",
      description: htmlParagraphs("Combination air and ground vehicle powered by anti-grav circuits.", "Its atomic energy cell lasts about 200 ground hours or 100 hours of flight.")
    }),
    gearSource({
      name: "Environmental Car",
      tech: "vi",
      description: htmlParagraphs("Government vehicle capable of travel on land, sea, air, and in space.", "Runs from its own nuclear reactor and anti-grav circuits.")
    }),
    gearSource({
      name: "Bubble Car",
      tech: "vi",
      description: htmlParagraphs("Ultimate solar-powered luxury vehicle for deep sea and deep space travel.", "Rechargeable solar cells handle the main drive, while an atomic backup cell powers the shield and emergency systems for about 24 hours.")
    }),
    // -- Ammunition items ----------------------------------------------------
    ammoSource({ name: "Arrows (bundle of 20)",      ammoType: "arrow",             rounds: 20, description: "Flight arrows for a bow. Stackable bundle." }),
    ammoSource({ name: "Crossbow Bolts (bundle of 20)", ammoType: "crossbow-bolt",  rounds: 20, description: "Iron-headed crossbow bolts." }),
    ammoSource({ name: "Sling Stones (pouch of 30)", ammoType: "sling-stone",       rounds: 30, weight: 3, description: "A pouch of river-smoothed stones for sling use." }),
    ammoSource({ name: "Sling Bullets (pouch of 30)",ammoType: "sling-bullet",      rounds: 30, weight: 4, description: "Cast-lead shaped bullets for superior sling damage." }),
    ammoSource({ name: "Slug-Thrower Rounds (clip of 15)", ammoType: "slug",        rounds: 15, description: "Pre-war .38 caliber rounds." }),
    ammoSource({ name: "Needler Darts, Paralysis (10)", ammoType: "needler-paralysis", rounds: 10, description: "Capsule darts loaded with intensity 17 paralytic." }),
    ammoSource({ name: "Needler Darts, Poison (10)", ammoType: "needler-poison",    rounds: 10, description: "Capsule darts loaded with intensity 17 poison." }),
    ammoSource({ name: "Stun Rifle Cell (10 shots)", ammoType: "stun-cell",         rounds: 10, description: "Replacement energy cell for stun ray pistols and stun rifles." }),
    ammoSource({ name: "Javelin (single)",           ammoType: "javelin",           rounds: 1,  weight: 2, description: "A thrown javelin. Retrievable after use unless broken." }),
    ammoSource({ name: "Gyrojet Slugs (clip of 10)", ammoType: "gyrojet",           rounds: 10, description: "Micro-rocket slugs for the pre-war gyrojet pistol." }),
    // 0.8.1 energy-weapon ammunition gear. One shot per round consumed.
    ammoSource({ name: "Energy Clip (10 shots)",     ammoType: "energy-clip",       rounds: 10, description: "Hydrogen energy cell for laser pistols and laser rifles." }),
    ammoSource({ name: "Blaster Pack (5 shots)",     ammoType: "blaster-pack",      rounds: 5,  description: "Compact energy pack for Mark V and Mark VII disruptor blasters." }),
    ammoSource({ name: "Black Ray Cell (4 shots)",   ammoType: "black-ray-cell",    rounds: 4,  description: "Chemical energy cell for the Black Ray Gun. Four shots per cell." }),
    ammoSource({ name: "Fusion Cell (10 shots)",     ammoType: "fusion-cell",       rounds: 10, weight: 2, description: "Atomic energy cell carried in a converter backpack. Powers the fusion rifle for ten shots." }),
    // -- Containers ----------------------------------------------------------
    containerSource({ name: "Belt Pouch",     capacity: 10,  weight: 0.5, description: "A small leather pouch that hangs from a belt." }),
    containerSource({ name: "Satchel",        capacity: 25,  weight: 1,   description: "A shoulder bag for light loads." }),
    containerSource({ name: "Small Backpack", capacity: 50,  weight: 2,   description: "A traveller's pack with shoulder straps." }),
    containerSource({ name: "Ruck Sack",      capacity: 60,  weight: 2.5, description: "A sturdy expedition pack with reinforced straps." }),
    containerSource({ name: "Saddlebag",      capacity: 75,  weight: 3,   description: "A paired container for a riding animal or mechanical mount." }),
    containerSource({ name: "Large Backpack", capacity: 100, weight: 3.5, description: "An oversized expedition pack with an internal frame." }),
    containerSource({ name: "Cargo Hamper",   capacity: 150, weight: 6,   description: "A vehicle-mounted cargo basket. Not meant to be carried by foot." }),
    // -- Tools, rations, trade goods, communication, survival ---------------
    gearSource({ name: "Flint & Steel",      weight: 0.1, description: htmlParagraphs("A small tinder kit. Reliably starts a campfire in fair weather.") }),
    gearSource({ name: "Rope (10m coil)",    weight: 2,   description: htmlParagraphs("Ten meters of braided hemp rope.") }),
    gearSource({ name: "Grappling Hook",     weight: 2,   description: htmlParagraphs("Iron three-prong grapple, pairs with rope for climbing.") }),
    gearSource({ name: "Shovel",             weight: 3,   description: htmlParagraphs("A short-handled digging spade suitable for trench work.") }),
    gearSource({ name: "Crowbar",            weight: 2,   description: htmlParagraphs("Iron leverage bar for prying and light demolition.") }),
    gearSource({ name: "Wrench",             weight: 1,   description: htmlParagraphs("Adjustable spanner for turning nuts and bolts on pre-war machinery.") }),
    gearSource({ name: "Pickaxe",            weight: 4,   description: htmlParagraphs("Miner's pick, useful against earth, stone, or light concrete.") }),
    gearSource({ name: "Lockpicks",          weight: 0.3, description: htmlParagraphs("Slim picks and tension wrenches for mechanical locks.") }),
    gearSource({ name: "Magnifying Glass",   weight: 0.2, description: htmlParagraphs("Brass-framed glass lens. Useful for fine inspection and fire-starting in sun.") }),
    gearSource({ name: "Torch",              weight: 0.5, description: htmlParagraphs("Resin-soaked hardwood torch. Burns for one hour with good flame.") }),
    gearSource({ name: "Lantern",            weight: 2,   description: htmlParagraphs("Shielded oil lantern. Six-hour burn per fill.") }),
    gearSource({ name: "Lamp Oil (flask)",   weight: 0.5, description: htmlParagraphs("Small flask of lamp oil. Refills a lantern twice.") }),
    gearSource({ name: "Signal Mirror",      weight: 0.2, description: htmlParagraphs("Polished steel signalling mirror. Line-of-sight flash visible 10+ km.") }),
    gearSource({ name: "Bedroll",            weight: 4,   description: htmlParagraphs("Rolled blankets and tarp for camping.") }),
    gearSource({ name: "Blanket",            weight: 2,   description: htmlParagraphs("Heavy wool blanket.") }),
    gearSource({ name: "Tent (2-person)",    weight: 8,   description: htmlParagraphs("Canvas two-person tent with poles and pegs.") }),
    gearSource({ name: "Trail Rations (3 days)", weight: 3, description: htmlParagraphs("Dried meat, grain biscuit, and dried fruit. Three-day supply.") }),
    gearSource({ name: "Iron Rations (1 week)",  weight: 7, description: htmlParagraphs("Pre-war processed food bars preserved in foil. One-week supply.") }),
    gearSource({ name: "Canteen (full)",     weight: 1,   description: htmlParagraphs("One-liter steel canteen. Holds a day's water for one person.") }),
    gearSource({ name: "Hand Radio (Ancient)", weight: 1, description: htmlParagraphs("Palm-sized Ancient transceiver. Line-of-sight range; 40 hours on one hydrogen cell.") }),
    gearSource({ name: "Signal Flare",       weight: 0.3, description: htmlParagraphs("Hand-launched chemical flare visible 20 km at night.") }),
    gearSource({ name: "Whistle",            weight: 0.1, description: htmlParagraphs("Loud shrill brass whistle.") }),
    gearSource({ name: "Semaphore Flags",    weight: 0.5, description: htmlParagraphs("Pair of signalling flags in red and white.") }),
    gearSource({ name: "Pre-war Bottle",     weight: 0.5, description: htmlParagraphs("Glass bottle with intact cap. Valuable to traders.") }),
    gearSource({ name: "Clockwork Toy",      weight: 0.5, description: htmlParagraphs("Wind-up tin toy from before the Shadow Years. Valuable curio.") }),
    gearSource({ name: "Pre-war Book",       weight: 1,   description: htmlParagraphs("Hardbound pre-war book. Archivists will pay well.") }),
    gearSource({ name: "Spent Power Cell",   weight: 0.2, description: htmlParagraphs("An empty power cell. Worthless as a power source, but valuable as trade goods to Ancients scholars.") }),
    gearSource({ name: "Domar Coin",         weight: 0.01, description: htmlParagraphs("A silver coin minted in a pre-war state. Standard currency in many trading posts.") }),
    gearSource({ name: "Bandages",           weight: 0.2, description: htmlParagraphs("A roll of clean linen bandages. Stops bleeding and speeds natural healing.") }),
    gearSource({ name: "Splint",             weight: 0.3, description: htmlParagraphs("Flat wooden splint with cloth ties. Stabilises broken limbs until a medi-kit or medic is available.") }),
    gearSource({ name: "Herbal Poultice",    weight: 0.2, description: htmlParagraphs("Mashed local herbs in a cloth bundle. Modest healing over several hours.") })
  ];
}

export function actorPackSources() {
  const plasticArmor = equipmentPackSources().find((item) => item.name === "Plastic Armor");
  const longSword = equipmentPackSources().find((item) => item.name === "Long Sword");
  const laserPistol = equipmentPackSources().find((item) => item.name === "Laser Pistol");
  const spear = equipmentPackSources().find((item) => item.name === "Spear");
  const backpack = equipmentPackSources().find((item) => item.name === "Backpack and Woven Goods");
  const mentalBlast = buildMutationItemSource(findMutationByName("Mental Blast"));
  const intuition = buildMutationItemSource(findMutationByName("Intuition"));
  const controlBaton = equipmentPackSources().find((item) => item.name === "Control Baton");
  const laserRifle = equipmentPackSources().find((item) => item.name === "Laser Rifle");

  return [
    {
      name: "Pure Strain Human Scavenger",
      type: "character",
      img: "icons/svg/mystery-man.svg",
      prototypeToken: createPrototypeTokenSource(defaultPrototypeTokenOptions({
        name: "Pure Strain Human Scavenger",
        type: "character",
        img: "icons/svg/mystery-man.svg"
      })),
      system: actorSystem({
        type: "psh",
        level: 2,
        movement: 120,
        alliance: "Independent",
        baseAc: 10,
        naturalAttackName: "Knife or Fist",
        naturalAttackDamage: "1d3",
        stats: { ms: 12, in: 11, dx: 13, ch: 15, cn: 11, ps: 12 },
        hp: 28
      }),
      items: [
        { ...clone(plasticArmor), system: { ...clone(plasticArmor.system), equipped: true } },
        clone(longSword),
        clone(backpack)
      ]
    },
    {
      name: "Humanoid Raider",
      type: "character",
      img: "icons/svg/mystery-man.svg",
      prototypeToken: createPrototypeTokenSource(defaultPrototypeTokenOptions({
        name: "Humanoid Raider",
        type: "character",
        img: "icons/svg/mystery-man.svg"
      })),
      system: actorSystem({
        type: "humanoid",
        level: 3,
        movement: 120,
        alliance: "Friends of Entropy",
        baseAc: 9,
        naturalAttackName: "Claws",
        naturalAttackDamage: "1d4",
        stats: { ms: 14, in: 10, dx: 12, ch: 8, cn: 10, ps: 13 },
        hp: 31
      }),
      items: [
        clone(spear),
        clone(laserPistol),
        clone(mentalBlast),
        clone(intuition)
      ]
    },
    {
      name: "Mutated Beast Template",
      type: "character",
      img: "icons/svg/mystery-man.svg",
      prototypeToken: createPrototypeTokenSource(defaultPrototypeTokenOptions({
        name: "Mutated Beast Template",
        type: "character",
        img: "icons/svg/mystery-man.svg"
      })),
      system: actorSystem({
        type: "mutated-animal",
        animalForm: "Bear",
        level: 6,
        movement: 150,
        baseAc: 6,
        naturalAttackName: "Claws and Bite",
        naturalAttackDamage: "2d6",
        stats: { ms: 9, in: 5, dx: 13, ch: 5, cn: 16, ps: 18 },
        hp: 42
      }),
      items: []
    },
    {
      name: "Security Robotoid",
      type: "character",
      img: "icons/svg/mystery-man.svg",
      prototypeToken: createPrototypeTokenSource(defaultPrototypeTokenOptions({
        name: "Security Robotoid",
        type: "character",
        img: "icons/svg/mystery-man.svg"
      })),
      system: {
        ...actorSystem({
          type: "robot",
          level: 6,
          movement: 96,
          alliance: "Ancient Installation",
          baseAc: 2,
          naturalAttackName: "Paralysis Rod",
          naturalAttackDamage: "1d6",
          stats: { ms: 9, in: 12, dx: 16, ch: 3, cn: 16, ps: 18 },
          hp: 72
        }),
        details: {
          type: "robot",
          animalForm: "",
          level: 6,
          xp: 0,
          movement: 96,
          alliance: "Ancient Installation",
          role: "security robotoid",
          speech: "security command speech",
          creatureClass: "Robotic Unit"
        },
        robotics: {
          isRobot: true,
          mode: "programmed",
          chassis: "Security Robotoid",
          identifier: "SR-6",
          controller: "Local security net",
          powerSource: "broadcast",
          powerCurrent: 36,
          powerMax: 36,
          broadcastCapable: true,
          backupHours: 24,
          repairDifficulty: 14,
          malfunction: ""
        }
      },
      items: [
        clone(laserRifle),
        clone(controlBaton)
      ]
    },
    // ---------------------------------------------------------------------
    // v0.5.0 pregens — Mutated Plant + five Cryptic Alliance members
    // ---------------------------------------------------------------------
    alliancePregen({
      name: "Ambulatory Oak",
      type: "mutated-plant",
      alliance: "",
      level: 4,
      movement: 60,
      baseAc: 5,
      naturalAttackName: "Branch Slam",
      naturalAttackDamage: "2d6",
      stats: { ms: 13, in: 9, dx: 6, ch: 10, cn: 16, ps: 17 },
      hp: 38,
      animalForm: "Oak",
      role: "sentient sapling",
      biography: "An awakened oak sapling rooted in a ruined orchard. Moves slowly but communicates through subtle rustling and root-vibration.",
      mutations: ["New Plant Parts", "Manipulation Vines", "Increased Senses"],
      items: ["Satchel"]
    }),
    alliancePregen({
      name: "Restorationist Tech",
      type: "psh",
      alliance: "restorationists",
      level: 3,
      movement: 120,
      baseAc: 7,
      naturalAttackName: "Wrench",
      naturalAttackDamage: "1d4",
      stats: { ms: 13, in: 16, dx: 14, ch: 12, cn: 11, ps: 10 },
      hp: 26,
      role: "ancient tech restorer",
      biography: "A pre-war engineering specialist sworn to rebuild humanity's civilization. Carries a kit of tools and a working slug-thrower.",
      items: ["Slug Thrower", "Slug-Thrower Rounds (clip of 15)", "Wrench", "Small Backpack", "Chemical Energy Cell"]
    }),
    alliancePregen({
      name: "Healer Medic",
      type: "humanoid",
      alliance: "healers",
      level: 3,
      movement: 120,
      baseAc: 8,
      naturalAttackName: "Staff",
      naturalAttackDamage: "1d6",
      stats: { ms: 15, in: 14, dx: 12, ch: 15, cn: 12, ps: 10 },
      hp: 30,
      role: "wandering medic",
      biography: "A healer who goes wherever the wounded lie. Affiliated with the Healers but answers to no-one.",
      mutations: ["Total Healing"],
      items: ["Small Backpack", "Bandages", "Splint", "Herbal Poultice", "Trail Rations (3 days)", "Canteen (full)"]
    }),
    alliancePregen({
      name: "Ranks-of-the-Fit Militant",
      type: "psh",
      alliance: "ranks-of-the-fit",
      level: 4,
      movement: 120,
      baseAc: 5,
      naturalAttackName: "Rifle Butt",
      naturalAttackDamage: "1d4",
      stats: { ms: 11, in: 10, dx: 14, ch: 10, cn: 14, ps: 15 },
      hp: 38,
      role: "purity militant",
      biography: "A militant of the Ranks who hunts mutants. Armed with a stun rifle and inertia armor.",
      items: ["Stun Rifle", "Stun Rifle Cell (10 shots)", "Large Backpack", "Iron Rations (1 week)"]
    }),
    alliancePregen({
      name: "Seeker Scavenger",
      type: "humanoid",
      alliance: "seekers",
      level: 3,
      movement: 120,
      baseAc: 8,
      naturalAttackName: "Knife",
      naturalAttackDamage: "1d4",
      stats: { ms: 12, in: 14, dx: 15, ch: 11, cn: 12, ps: 11 },
      hp: 28,
      role: "artifact scavenger",
      biography: "Seekers send their scavengers deep into ruined cities to recover pre-war relics.",
      mutations: ["Heightened Sense Vision"],
      items: ["Dagger", "Small Backpack", "Torch", "Rope (10m coil)", "Grappling Hook", "Magnifying Glass"]
    }),
    alliancePregen({
      name: "Brotherhood Scholar",
      type: "humanoid",
      alliance: "brotherhood",
      level: 2,
      movement: 120,
      baseAc: 9,
      naturalAttackName: "Staff",
      naturalAttackDamage: "1d4",
      stats: { ms: 16, in: 17, dx: 11, ch: 13, cn: 10, ps: 9 },
      hp: 18,
      role: "brotherhood of thought scholar",
      biography: "A scholar devoted to preserving pre-war knowledge and extending its benefits to all sentient life.",
      mutations: ["Mental Defense Shield", "Intuition"],
      items: ["Pre-war Book", "Satchel", "Canteen (full)", "Trail Rations (3 days)"]
    })
  ];
}

function alliancePregen({ name, type, alliance, level, movement, baseAc, naturalAttackName, naturalAttackDamage, stats, hp, animalForm = "", role, biography = "", mutations = [], items = [] }) {
  const systemCore = actorSystem({
    type, animalForm, level, movement, alliance, baseAc,
    naturalAttackName, naturalAttackDamage, stats, hp
  });
  const equipment = equipmentPackSources();
  const resolvedItems = [];
  for (const itemName of items) {
    const source = equipment.find((entry) => entry.name === itemName);
    if (source) resolvedItems.push(clone(source));
  }
  for (const mutName of mutations) {
    const def = findMutationByName(mutName);
    if (def) resolvedItems.push(buildMutationItemSource(def));
  }
  return {
    name,
    type: "character",
    img: "icons/svg/mystery-man.svg",
    prototypeToken: createPrototypeTokenSource(defaultPrototypeTokenOptions({
      name, type: "character", img: "icons/svg/mystery-man.svg"
    })),
    system: {
      ...systemCore,
      details: {
        ...systemCore.details,
        role: role ?? systemCore.details.role
      },
      biography: {
        ...systemCore.biography,
        value: biography ? `<p>${biography}</p>` : ""
      }
    },
    items: resolvedItems
  };
}

export { monsterPackSources };

export function encounterTableSources() {
  return ENCOUNTER_TERRAIN_KEYS.map((terrain) => ({
    name: ENCOUNTER_TABLE_LABELS[terrain] ?? terrain,
    img: ENCOUNTER_TABLE_ICONS[terrain] ?? "icons/svg/d20-grey.svg",
    flags: {
      [SYSTEM_ID]: {
        encounterSeed: true,
        encounterSeedVersion: ENCOUNTER_TABLE_SEED_VERSION
      }
    },
    description: htmlParagraphs(
      `Random encounter table for ${terrain.replace(/-/g, " ")} terrain in Gamma World 1e.`,
      "Roll 1d20 or use the table's built-in draw command."
    ),
    formula: "1d20",
    replacement: true,
    displayRoll: true,
    results: terrainEncounterResults(terrain).map((entry) => ({
      type: "text",
      name: entry.name,
      img: ENCOUNTER_TABLE_ICONS[terrain] ?? "icons/svg/d20-grey.svg",
      description: encounterResultDescription(entry),
      weight: 1,
      range: [entry.roll, entry.roll],
      drawn: false
    }))
  }));
}

export function journalPackSources() {
  return [
    {
      name: "Combat Reference Sheets",
      pages: [
        {
          name: "Physical Attack Matrix I",
          type: "text",
          text: { format: 1, content: attackMatrixOnePage() }
        },
        {
          name: "Physical Attack Matrix II",
          type: "text",
          text: { format: 1, content: attackMatrixTwoPage() }
        },
        {
          name: "Mental Attack Matrix",
          type: "text",
          text: { format: 1, content: mentalAttackMatrixPage() }
        },
        {
          name: "Weapon Damage Chart",
          type: "text",
          text: { format: 1, content: weaponDamageChartPage() }
        }
      ]
    },
    {
      name: "Hazards and Fatigue Reference",
      pages: [
        {
          name: "Fatigue Rules",
          type: "text",
          text: { format: 1, content: fatigueRulesPage() }
        },
        {
          name: "Poison Matrix (RAW reference)",
          type: "text",
          text: {
            format: 1,
            content: hazardMatrixPage(POISON_MATRIX, {
              intro: "<strong>Reference only — not used by the live save pipeline.</strong> This system replaces the poison matrix with a d20 + CN save; see Chapter 11 \"Poison Homebrew\" in the Rulebook Reference pack for the active rules. The RAW matrix below is preserved for lookup and for any GM who wants to run the original save-or-die resolution.",
              rowLabel: "Constitution",
              columnLabel: "Poison Strength",
              codeNotes: [
                "\"*\" means no effect.",
                "A number means that many d6 of poison damage.",
                "\"D\" means death unless the correct antidote is administered within two melee rounds.",
                "<em>Under the live homebrew: roll 1d20 + CN modifier vs. poison difficulty. Success = half damage, failure = full damage, never death on one cell.</em>"
              ]
            })
          }
        },
        {
          name: "Radiation Matrix (RAW reference)",
          type: "text",
          text: {
            format: 1,
            content: hazardMatrixPage(RADIATION_MATRIX, {
              intro: "<strong>Reference only — not used by the live save pipeline.</strong> This system replaces the radiation matrix with a d20 + CN save banded by margin of failure; see Chapter 11 \"Radiation Homebrew\" in the Rulebook Reference pack for the live rules (thresholds, Radiation Sickness conditions, and the Catastrophic Exposure spiral). The RAW matrix below is preserved for reference.",
              rowLabel: "Constitution",
              columnLabel: "Radiation Intensity",
              codeNotes: [
                "A number means that many d6 of radiation damage.",
                "\"M\" means a new mutation manifests in one week.",
                "\"D\" means a 20% chance of mutational defect and an 80% chance of death. There is no antidote for radiation.",
                "<em>Under the live homebrew: intensity &lt; 10 has no effect; otherwise roll 1d20 + CN modifier vs. intensity. Miss by 1–3 = Radiation Sickness (mild), 4–6 = Sickness (severe) + mutation, 7+ = Catastrophic Exposure (−10% max HP/hour starting tomorrow).</em>"
              ]
            })
          }
        }
      ]
    },
    {
      name: "Gamma World 1e Quick Start",
      pages: [
        {
          name: "Quick Start",
          type: "text",
          text: {
            format: 1,
            content: htmlParagraphs(
              "Create or import a character actor, then use the Main tab to roll saving throws, make natural attacks, and review derived defenses.",
              "Use the Inventory tab for equipped armor and weapons. Weapon attacks post matrix-driven chat cards. On a hit, follow the chat card into damage or the weapon's special effect.",
              "Use the Mutations tab to activate toggles, spend limited powers, and reset per-day or per-week uses between adventures."
            )
          }
        }
      ]
    },
    {
      name: "Automation Workflows",
      pages: [
        {
          name: "Automation Workflows",
          type: "text",
          text: {
            format: 1,
            content: htmlParagraphs(
              "Chargen handles attribute assignment, hit points, mutation rolls, and mutation item creation for PSH, humanoids, and mutated animals.",
              "Physical attacks use the original weapon matrix. Natural attacks use Matrix II. Mental attacks use the mental matrix and can feed directly into mutation or weapon follow-up effects.",
              "Poison and radiation saves resolve against the original cross-reference tables and produce chat cards with buttons for damage, lethal results, and mutation fallout where appropriate."
            )
          }
        }
      ]
    },
    {
      name: "Compendium Contents",
      pages: [
        {
          name: "Compendium Contents",
          type: "text",
          text: {
            format: 1,
            content: htmlParagraphs(
              "Mutation Index contains the full humanoid and mutated-animal mutation lists with summaries, references, and ready-to-use activation data.",
              "Armory and Gear contains primitive weapons, Ancient firearms and energy weapons, armor, and expedition staples.",
              "Sample Actors contains a few ready-to-import examples for human, humanoid, and mutated-animal play.",
              "Monsters and Beasts contains the creatures from the Gamma World core book as Monster actors with natural attacks, innate defenses, mutations, and guided special abilities."
            )
          }
        }
      ]
    },
    {
      name: "Artifacts and Robots",
      pages: [
        {
          name: "Artifacts and Robots",
          type: "text",
          text: {
            format: 1,
            content: htmlParagraphs(
              "Ancient items now track artifact condition, function chance, analysis progress, known operation, power source, and charges directly on the item.",
              "Artifact identification now runs through a shared Chart A / B / C flowchart panel. The whole table can watch the graph, only the operator can roll it forward, and the GM keeps the hidden functionality and mishap checks.",
              "Once an artifact is understood, normal use still checks power, can short out or explode on failed function checks, and charged devices spend a power step whenever they work.",
              "Broadcast power is handled as ambient availability on the item, not as an installable power cell, so the referee can decide when Ancient infrastructure is online.",
              "Robots use the shared character sheet with a Robotics panel for power, control mode, identifier, malfunction notes, and repair actions."
            )
          }
        }
      ]
    },
    {
      name: "Encounter Procedures",
      pages: [
        {
          name: "Encounter Procedures",
          type: "text",
          text: {
            format: 1,
            content: htmlParagraphs(
              "Reaction rolls use the original 2d6 table plus charisma and type adjustments. Surprise rolls use the original 1d6 procedure and award first strike from surprise or the higher initiative roll.",
              "Monster and NPC sheets include morale, reaction, and route encounter controls for referee-facing encounter work.",
              "Random encounters are provided as bundled roll tables, one per terrain type, in the Encounter Tables compendium pack.",
              "Ongoing morale checks persist as actor state and can keep rolling each combat round until the referee clears them or the creature breaks.",
              "Use the monster sheet or the encounter roll tables for quick encounter procedures, then proceed into attacks, saves, or guided mutation and artifact workflows as needed.",
              "Drag gear, armor, weapons, and mutations directly from the bundled packs onto a character. Named Ancient items will auto-fill their automation profile."
            )
          }
        }
      ]
    },
    {
      name: "House Rules",
      pages: [
        {
          name: "PSH Technology Reliability (Homebrew)",
          type: "text",
          text: {
            format: 1,
            content: htmlParagraphs(
              "Homebrew rule (enabled by default): once a Pure Strain Human has figured out an Ancient artifact (operation known), further uses by that PSH actor bypass the condition and malfunction rolls. The artifact simply works.",
              "Non-PSH actors, and PSH actors using an unanalysed artifact, still follow the RAW function-chance and malfunction workflow.",
              "Toggle this via the world setting <em>PSH technology always works once figured out</em>. A chat line is posted whenever the rule fires so the referee can see it trigger."
            )
          }
        },
        {
          name: "Initiative (departure from RAW)",
          type: "text",
          text: {
            format: 1,
            content: htmlParagraphs(
              "This system uses 5e-style individual initiative (1d20 + DX mod) per combatant, not the 1e side-based procedure. The choice is intentional for Foundry's Combat Tracker to work cleanly. Referees who want RAW 1e initiative can simply roll it manually and set each combatant's initiative with the tracker's input field."
            )
          }
        }
      ]
    }
  ];
}

/* ------------------------------------------------------------------ */
/* Cryptic Alliances                                                  */
/* ------------------------------------------------------------------ */

const ALLIANCE_ORDER = [
  "brotherhood", "seekers", "zoopremisists", "healers",
  "restorationists", "followers", "ranks-of-the-fit",
  "archivists", "radiationists", "created"
];

function allianceJournalEntry(key) {
  const record = ALLIANCE_DATA[key];
  if (!record) return null;
  const allies = record.allies?.length
    ? record.allies.map((a) => ALLIANCE_DATA[a]?.label ?? a).join(", ")
    : "—";
  const enemies = record.enemies?.length
    ? record.enemies.map((a) => ALLIANCE_DATA[a]?.label ?? a).join(", ")
    : "—";
  const welcomes = record.accepts?.length
    ? record.accepts.join(", ")
    : "—";
  return {
    name: record.label,
    pages: [
      {
        name: "Overview",
        type: "text",
        text: {
          format: 1,
          content: htmlParagraphs(
            `<strong>Purpose:</strong> ${record.purpose}`,
            `<strong>Welcomes:</strong> ${welcomes}.`,
            `<strong>Allies:</strong> ${allies}.`,
            `<strong>Enemies:</strong> ${enemies}.`,
            `<strong>Default reaction bonus to recognised kin:</strong> ${record.reactionBonus >= 0 ? "+" : ""}${record.reactionBonus}.`
          )
        }
      }
    ]
  };
}

export function crypticAlliancePackSources() {
  return ALLIANCE_ORDER
    .map(allianceJournalEntry)
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Robot chassis                                                      */
/* ------------------------------------------------------------------ */

const ROBOT_CHASSIS_CATALOG = [
  { name: "Light Cargo Lifter", power: "chemical", ac: 8, hp: 25, armament: "None", sensors: "Vision, touch", controls: "Voice + remote",
    notes: "Warehouse utility robotoid; moves crates up to 500kg. Often intact in ruined factories." },
  { name: "Heavy Cargo Lifter", power: "nuclear", ac: 6, hp: 60, armament: "None", sensors: "Vision, sonar",  controls: "Voice + remote",
    notes: "Moves up to 5 tonnes; treads for rough terrain. Slow (6m/turn) but heavily armored." },
  { name: "Small Cargo Transport", power: "chemical", ac: 7, hp: 40, armament: "None", sensors: "Vision, radar", controls: "Driver seat + autopilot",
    notes: "Wheeled autonomous vehicle. Typical payload ~1 tonne." },
  { name: "Large Cargo Transport", power: "nuclear", ac: 5, hp: 90, armament: "Defensive minigun (2d6, 40m)", sensors: "Radar, vision, sonar", controls: "Autopilot + remote",
    notes: "Convoy-class autonomous truck. Armed against wasteland raiders." },
  { name: "Ecology Bot — Agricultural", power: "solar", ac: 9, hp: 30, armament: "Soil probe (1d3)", sensors: "Vision, chem, soil", controls: "Voice",
    notes: "Tends fields and orchards. Friendly to cultivators; will fight pests to the death." },
  { name: "Ecology Bot — Wilderness", power: "solar", ac: 8, hp: 35, armament: "Tranquilizer darts (stun, 20m)", sensors: "Vision, sonar, chem", controls: "Voice + remote",
    notes: "Patrols wilderness preserves. Often hostile to mutated animals it cannot catalogue." },
  { name: "Engineering Bot — Standard", power: "chemical", ac: 7, hp: 35, armament: "Welder (1d6 fire)", sensors: "Vision, IR, ultrasonic", controls: "Voice + remote",
    notes: "Repairs and constructs. Tools concealed in chassis compartments." },
  { name: "Engineering Bot — Light Duty", power: "solar", ac: 8, hp: 25, armament: "None", sensors: "Vision, IR", controls: "Voice",
    notes: "Domestic repair / plumbing / electronics." },
  { name: "Engineering Bot — Heavy Duty", power: "nuclear", ac: 5, hp: 65, armament: "Cutting laser (2d6, 10m)", sensors: "Vision, IR, sonar", controls: "Voice + remote + autopilot",
    notes: "Demolition and heavy construction; often mistaken for a warbot." },
  { name: "Medical Robotoid", power: "nuclear", ac: 7, hp: 40, armament: "Stun field (mental save or paralysed 1d4 rounds)", sensors: "Vision, IR, chem, bio", controls: "Voice + medical link",
    notes: "Surgery, triage, pharmacology. Carries a medi-kit, two stim doses, and cur-in dose." },
  { name: "Security Robotoid", power: "nuclear", ac: 4, hp: 55, armament: "Laser pistol (3d6, 30/60/120m)", sensors: "Vision, IR, sonar, radar", controls: "Command circuit + autopilot",
    notes: "Guards facility entrances; challenges intruders with voice prompts before engaging." },
  { name: "General Household Robotoid", power: "solar", ac: 9, hp: 22, armament: "None", sensors: "Vision, chem", controls: "Voice",
    notes: "Cleaning, cooking, nursing, basic child-minding. Often the friendliest robot a party meets." },
  { name: "Supervisor Borg", power: "nuclear", ac: 3, hp: 80, armament: "Laser rifle (4d6, 60/120/240m)", sensors: "Full suite incl. psionic", controls: "Independent + command net",
    notes: "Commands other robots of a facility. Retains pre-war authority protocols." },
  { name: "Defense Borg", power: "nuclear", ac: 2, hp: 95, armament: "Mk V blaster (5d6), missile launcher (3 micro-missiles)", sensors: "Full suite", controls: "Independent",
    notes: "Fixed-position defence platform. Will pursue briefly but does not leave its patrol zone." },
  { name: "Attack Borg", power: "nuclear", ac: 2, hp: 110, armament: "Mk VII blaster (6d6), stun grenade dispenser", sensors: "Full suite", controls: "Independent",
    notes: "Active mobile combatant; hunts targets across a region." },
  { name: "Warbot", power: "nuclear", ac: 1, hp: 150, armament: "Fusion rifle (8d6), fragmentation grenades (4d6 radius 10m)", sensors: "Full suite + radar + tactical AI", controls: "Independent",
    notes: "Pre-war battlefield unit. Treat as a dungeon-level encounter on its own." },
  { name: "Death Machine", power: "nuclear", ac: 1, hp: 180, armament: "Black ray gun (save vs death), twin fusion cannons (10d6)", sensors: "Full military suite", controls: "Independent + override codes",
    notes: "The worst thing in the wasteland. Virtually unkillable without a fusion bomb or coordinated high-tech assault." },
  { name: "Think Tank", power: "nuclear", ac: 8, hp: 40, armament: "None (psionic defence only)", sensors: "Psionic, full data net", controls: "Independent",
    notes: "Immobile cognitive engine. Answers questions, solves puzzles, occasionally asks for something in trade." }
];

function robotChassisProse(entry) {
  return htmlParagraphs(
    `<strong>Power Source:</strong> ${entry.power}.`,
    `<strong>Armor Class:</strong> ${entry.ac}. <strong>Hit Points:</strong> ${entry.hp}.`,
    `<strong>Armament:</strong> ${entry.armament}.`,
    `<strong>Sensors:</strong> ${entry.sensors}.`,
    `<strong>Controls:</strong> ${entry.controls}.`,
    entry.notes
  );
}

function robotChassisJournalEntry(entry) {
  return {
    name: entry.name,
    pages: [
      {
        name: "Profile",
        type: "text",
        text: {
          format: 1,
          content: robotChassisProse(entry)
        }
      }
    ]
  };
}

export function robotChassisPackSources() {
  return ROBOT_CHASSIS_CATALOG.map(robotChassisJournalEntry);
}

/**
 * Best-effort parse of a ROBOT_CHASSIS_CATALOG `armament` string into a
 * weapon item. The 1e prose (e.g. "Laser pistol (3d6, 30/60/120m)") is
 * regular enough to pull out a damage formula and attack-type flag with
 * simple regexes; everything else becomes the weapon's description so
 * the GM can fine-tune. Returns `null` for the literal "None".
 */
function parseRobotArmamentToWeapon(armament) {
  if (!armament || armament.trim().toLowerCase() === "none") return null;

  const damageMatch = armament.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/);
  const damage = damageMatch ? damageMatch[1].replace(/\s+/g, "") : "1d6";

  const rangeMatch = armament.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*m/);
  const shortRange = rangeMatch ? Number(rangeMatch[1]) : 0;
  const mediumRange = rangeMatch ? Number(rangeMatch[2]) : 0;
  const longRange = rangeMatch ? Number(rangeMatch[3]) : 0;

  // Take everything up to the first "(" as the weapon name; strip trailing
  // commas/spaces. Fallback to the whole armament if there's no "(".
  const rawName = armament.split("(")[0].trim().replace(/,\s*$/, "");
  const name = rawName || armament.slice(0, 32);

  // Energy weapons broadcast their "beam" nature in the name. Anything with
  // "laser"/"blaster"/"ray"/"fusion"/"stun field" uses the energy bucket so
  // armor class / resistance trait lookups fire on hit.
  const isEnergy = /laser|blaster|ray\b|fusion|stun field|ray gun/i.test(armament);

  return {
    name,
    type: "weapon",
    img: "icons/svg/sword.svg",
    flags: { [SYSTEM_ID]: { naturalWeapon: true } },
    system: {
      weaponClass: 10,
      category: "artifact",
      ammoType: [],
      damage: { formula: damage, type: isEnergy ? "energy" : "physical" },
      range: { short: shortRange, medium: mediumRange, long: longRange },
      attackType: isEnergy ? "energy" : (shortRange > 0 ? "ranged" : "melee"),
      rof: 1,
      ammo: { current: 0, max: 0, consumes: false },
      effect: { mode: "damage", formula: "", status: "", notes: "" },
      traits: {
        tag: "",
        deflectAc2Hits: 0,
        deflectAc1Hits: 0,
        bypassesForceField: false,
        requiresNoForceField: false,
        nonlethal: false
      },
      quantity: 1,
      weight: 0,
      equipped: true,
      description: { value: `<p>${armament}</p>` }
    }
  };
}

/**
 * 0.8.1: produce a monster-Actor source record for each robotic unit. The
 * JournalEntry pack still holds the prose reference, but GMs can now drag
 * any of the 18 chassis directly onto the canvas as a token.
 *
 * Ability scores default to 10 across the board per owner preference
 * ("GM tunes per-encounter"); HP / AC come from the catalog; the bio
 * tab reproduces the journal prose; a best-effort parse of the armament
 * string emits an embedded weapon the GM can fire straight out of the
 * sheet.
 */
function robotMonsterSource(entry) {
  const hp = Math.max(1, Number(entry.hp) || 1);
  const level = Math.max(1, Math.ceil(hp / 6));
  const flatStats = { ms: 10, in: 10, dx: 10, ch: 10, cn: 10, ps: 10 };
  const biographyHtml = robotChassisProse(entry);
  const speaksCommon = /voice/i.test(entry.controls);
  const independent = /independent/i.test(entry.controls);

  const weapon = parseRobotArmamentToWeapon(entry.armament);
  const items = weapon ? [weapon] : [];

  const source = {
    name: entry.name,
    type: "monster",
    img: monsterPortraitPath(entry.name),
    prototypeToken: createPrototypeTokenSource(defaultPrototypeTokenOptions(
      { name: entry.name, type: "monster", img: monsterPortraitPath(entry.name) },
      { textureSrc: monsterTokenPath(entry.name) }
    )),
    system: {
      details: {
        type: "robot",
        animalForm: "",
        level,
        xp: 0,
        movement: 60,
        alliance: "created",
        role: "robotic unit",
        speech: speaksCommon ? "common, machine codes" : "machine codes",
        creatureClass: entry.name
      },
      attributes: Object.fromEntries(
        Object.entries(flatStats).map(([k, v]) => [k, { value: v, mod: 0, save: 0 }])
      ),
      combat: {
        baseAc: entry.ac,
        naturalAttack: {
          name: "Servo Strike",
          damage: "1d6"
        }
      },
      resources: {
        hp: { base: hp, value: hp, max: hp, formula: "" },
        ac: entry.ac,
        mentalResistance: 10,
        radResistance: 10,
        poisonResistance: 10
      },
      biography: {
        value: biographyHtml,
        appearance: "",
        notes: ""
      },
      social: {
        languages: speaksCommon ? "Common, machine codes" : "Machine codes",
        literacy: "",
        relatives: "",
        homeRegion: "",
        reputation: 0
      },
      encounter: {
        reactionModifier: 0,
        surpriseModifier: 0,
        morale: 0,
        intelligence: independent ? "high" : "auto",
        cannotBeSurprised: false
      },
      robotics: {
        isRobot: true,
        mode: "programmed",
        chassis: entry.name,
        identifier: "",
        controller: "",
        powerSource: entry.power,
        powerCurrent: 0,
        powerMax: 0,
        broadcastCapable: /broadcast/i.test(entry.controls),
        backupHours: 0,
        repairDifficulty: 0,
        malfunction: ""
      },
      chargen: {
        rolled: true,
        statMethod: "manual",
        mutationMethod: "random",
        mutationsRolled: false
      }
    },
    items
  };

  return source;
}

export function robotMonsterSources() {
  return ROBOT_CHASSIS_CATALOG.map(robotMonsterSource);
}

// Exported so the rules test suite can exercise the parse + shape.
export { robotMonsterSource, parseRobotArmamentToWeapon };

/* ------------------------------------------------------------------ */
/* Roll tables                                                        */
/* ------------------------------------------------------------------ */

function rollTableSource({ name, description, formula, results }) {
  return {
    name,
    img: "icons/svg/d20-grey.svg",
    description,
    formula,
    replacement: true,
    displayRoll: true,
    results: results.map((result) => ({
      type: "text",
      name: result.label,
      img: result.img ?? "icons/svg/d20-grey.svg",
      description: result.description ?? "",
      weight: 1,
      range: Array.isArray(result.range) ? result.range : [result.range, result.range],
      drawn: false
    }))
  };
}

function reactionTableResults() {
  return [
    { range: [2, 2],   label: "Immediate Attack", description: "The encountered group attacks immediately with surprise if possible." },
    { range: [3, 5],   label: "Hostile",          description: "The group is actively hostile and will fight if threatened or given opportunity." },
    { range: [6, 8],   label: "Uncertain",        description: "The group is wary and will talk, flee, or fight depending on approach." },
    { range: [9, 11],  label: "Indifferent",      description: "The group ignores the party unless provoked or offered something of value." },
    { range: [12, 12], label: "Friendly",         description: "The group is openly friendly and may assist, trade, or share information." }
  ];
}

function moraleTableResults() {
  return [
    { range: [1, 3],   label: "Break",            description: "The creature flees combat outright." },
    { range: [4, 6],   label: "Waver",            description: "The creature hesitates; cannot take an offensive action this round." },
    { range: [7, 10],  label: "Hold",             description: "The creature steadies itself and continues fighting." }
  ];
}

function surpriseTableResults() {
  return [
    { range: [1, 2],   label: "Surprised",        description: "The side rolling 1–2 is surprised and loses the first melee turn." },
    { range: [3, 6],   label: "Not Surprised",    description: "The side rolling 3–6 is ready to act normally." }
  ];
}

function artifactConditionTableResults() {
  return [
    { range: [2, 5],   label: "Broken",           description: "Cannot function until repaired." },
    { range: [6, 7],   label: "Poor",             description: "Function chance ≈ 30%. Malfunctions common." },
    { range: [8, 9],   label: "Fair",             description: "Function chance ≈ 50%. Occasional malfunctions." },
    { range: [10, 10], label: "Good",             description: "Function chance ≈ 70%." },
    { range: [11, 11], label: "Excellent",        description: "Function chance ≈ 85%." },
    { range: [12, 12], label: "Perfect",          description: "Function chance ≈ 95%. Factory-new." }
  ];
}

function artifactCategoryTableResults() {
  return [
    { range: [1, 10],   label: "Pistol",         description: "Slug thrower, needler, stun ray, laser, Mark V, black ray." },
    { range: [11, 20],  label: "Rifle",          description: "Stun rifle, laser rifle, Mark VII, fusion rifle." },
    { range: [21, 30],  label: "Energy Weapon",  description: "Vibro blade, energy mace, stun whip, force pike." },
    { range: [31, 40],  label: "Grenade",        description: "Gas, chemical explosive, fragmentation, energy, photon, torc." },
    { range: [41, 50],  label: "Bomb / Missile", description: "Micro missile, fission bomb, concussion, negation, neutron, trek, mutation." },
    { range: [51, 55],  label: "Armor",          description: "Powered plate, inertia, energised, powered scout/battle/attack/assault." },
    { range: [56, 65],  label: "Vehicle",        description: "Turbine car, hover car, flit car, bubble car, cargo hauler, helicopter." },
    { range: [66, 80],  label: "Energy Device",  description: "Force field generator, portent, energy cloak, accelera-dose, medi-kit, life ray." },
    { range: [81, 90],  label: "Robotic Unit",   description: "Household, medical, security, borg, warbot — see the Robotic Units pack." },
    { range: [91, 100], label: "Medical",        description: "Stim dose, cur-in dose, anti-radiation serum, pain reducer, rejuv chamber, life ray." }
  ];
}

function mutationDrawTableResults(subtype, characterType) {
  return MUTATION_DEFINITIONS
    .filter((entry) => entry.subtype === subtype)
    .map((entry) => {
      const range = entry.ranges?.[characterType];
      if (!range) return null;
      return {
        range,
        label: entry.name,
        description: entry.summary ?? ""
      };
    })
    .filter(Boolean);
}

function experienceBonusTableResults() {
  return Object.entries(ATTRIBUTE_BONUS_MATRIX).map(([roll, attr]) => ({
    range: [Number(roll), Number(roll)],
    label: `+1 ${attr.toUpperCase()}`,
    description: `Gain +1 to ${attr.toUpperCase()}.`
  }));
}

function tradeValueTableResults() {
  return [
    { range: [1, 10],   label: "Potable water (1 liter)", description: "Trade value: 1 domar or 1 day's rations." },
    { range: [11, 20],  label: "Preserved rations",       description: "Trade value: 1 domar per day's rations." },
    { range: [21, 30],  label: "Flint and steel",         description: "Trade value: 5 domars or a simple blade." },
    { range: [31, 40],  label: "Pre-war glass bottle",    description: "Trade value: 2 domars; 10 if intact with cap." },
    { range: [41, 50],  label: "Functional flashlight",   description: "Trade value: 25 domars or an Ancient power cell." },
    { range: [51, 60],  label: "Working clockwork",       description: "Trade value: 40 domars." },
    { range: [61, 70],  label: "Pre-war ammunition",      description: "Trade value: 1 domar per slug." },
    { range: [71, 80],  label: "Power cell (spent)",      description: "Trade value: 5 domars (hydrogen), 15 (solar), 50 (nuclear)." },
    { range: [81, 90],  label: "Power cell (fresh)",      description: "Trade value: 50 (chemical) to 500 (nuclear) domars." },
    { range: [91, 98],  label: "Pre-war book",            description: "Trade value: 10 domars; 100+ to an Archivist." },
    { range: [99, 100], label: "Unknown Ancient artifact",description: "Trade value: 100+ domars, subject to Archivist/Seeker appraisal." }
  ];
}

export function rollTablePackSources() {
  return [
    rollTableSource({
      name: "Reaction (2d6)",
      description: htmlParagraphs("Modified reaction roll for NPC and creature initial attitude."),
      formula: "2d6",
      results: reactionTableResults()
    }),
    rollTableSource({
      name: "Morale (1d10)",
      description: htmlParagraphs("Roll when casualties mount or an obvious routing condition triggers."),
      formula: "1d10",
      results: moraleTableResults()
    }),
    rollTableSource({
      name: "Surprise (1d6)",
      description: htmlParagraphs("Each side rolls. 1-2 means that side is surprised."),
      formula: "1d6",
      results: surpriseTableResults()
    }),
    rollTableSource({
      name: "Artifact Condition (2d6)",
      description: htmlParagraphs("Determine how well a newly-recovered Ancient artifact functions."),
      formula: "2d6",
      results: artifactConditionTableResults()
    }),
    rollTableSource({
      name: "Artifact Category (d100)",
      description: htmlParagraphs("When a random Ancient artifact is recovered, roll to determine its category."),
      formula: "1d100",
      results: artifactCategoryTableResults()
    }),
    rollTableSource({
      name: "Physical Mutation Draw (Humanoid, d100)",
      description: htmlParagraphs("Roll on the humanoid physical mutation chart."),
      formula: "1d100",
      results: mutationDrawTableResults("physical", "humanoid")
    }),
    rollTableSource({
      name: "Mental Mutation Draw (Humanoid, d100)",
      description: htmlParagraphs("Roll on the humanoid mental mutation chart."),
      formula: "1d100",
      results: mutationDrawTableResults("mental", "humanoid")
    }),
    rollTableSource({
      name: "Physical Mutation Draw (Mutated Animal, d100)",
      description: htmlParagraphs("Roll on the mutated animal physical mutation chart."),
      formula: "1d100",
      results: mutationDrawTableResults("physical", "mutated-animal")
    }),
    rollTableSource({
      name: "Mental Mutation Draw (Mutated Animal, d100)",
      description: htmlParagraphs("Roll on the mutated animal mental mutation chart."),
      formula: "1d100",
      results: mutationDrawTableResults("mental", "mutated-animal")
    }),
    rollTableSource({
      name: "Plant Mutation Draw (d100)",
      description: htmlParagraphs("Roll on the mutated plant chart."),
      formula: "1d100",
      results: mutationDrawTableResults("plant", "mutated-plant")
    }),
    rollTableSource({
      name: "Experience Attribute Bonus (d10)",
      description: htmlParagraphs(
        "Rolled on level-up for PSH and humanoid characters. The resulting attribute receives +1 up to the natural cap of 21.",
        `Level thresholds: ${LEVEL_THRESHOLDS.join(", ")} XP.`
      ),
      formula: "1d10",
      results: experienceBonusTableResults()
    }),
    rollTableSource({
      name: "Trade Value / Barter (d100)",
      description: htmlParagraphs("Common scavenger goods and their trade value in domars (pre-war coinage)."),
      formula: "1d100",
      results: tradeValueTableResults()
    })
  ];
}
