import { SYSTEM_ID } from "../module/config.mjs";
import { buildMutationItemSource } from "../module/mutation-rules.mjs";
import { MUTATION_DEFINITIONS, findMutationByName } from "../module/tables/mutation-data.mjs";
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
import { createPrototypeTokenSource, defaultPrototypeTokenOptions } from "../module/token-defaults.mjs";
import { monsterPackSources } from "./monster-content.mjs";

function htmlParagraphs(...parts) {
  return parts.filter(Boolean).map((text) => `<p>${text}</p>`).join("");
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
  ammo = { current: 0, max: 0, consumes: false },
  rof = 1,
  weight = 0
}) {
  const source = {
    name,
    type: "weapon",
    img: "icons/svg/sword.svg",
    system: {
      weaponClass,
      damage: { formula: damage, type: attackType === "energy" ? "energy" : "physical" },
      range: { short, medium, long },
      attackType,
      rof,
      ammo,
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
  action = {}
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
  return [...MUTATION_DEFINITIONS]
    .sort((a, b) => (a.subtype.localeCompare(b.subtype) || a.code - b.code || a.name.localeCompare(b.name)))
    .map((entry) => buildMutationItemSource(entry));
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
      name: "Bow and Arrows",
      weaponClass: 9,
      damage: "1d6",
      attackType: "ranged",
      short: 100,
      long: 200,
      ammo: { current: 15, max: 15, consumes: true },
      description: htmlParagraphs("Primitive missile weapon.", "Effective range 100 meters, maximum range 200 meters.")
    }),
    weaponSource({
      name: "Crossbow",
      weaponClass: 9,
      damage: "1d4",
      attackType: "ranged",
      short: 120,
      long: 240,
      ammo: { current: 15, max: 15, consumes: true },
      description: htmlParagraphs("Heavy mechanical bow with slower but reliable shots.")
    }),
    weaponSource({
      name: "Sling Stones",
      weaponClass: 9,
      damage: "1d4",
      attackType: "ranged",
      short: 80,
      long: 160,
      description: htmlParagraphs("Stone sling ammunition.")
    }),
    weaponSource({
      name: "Sling Bullets",
      weaponClass: 9,
      damage: "1d4 + 1",
      attackType: "ranged",
      short: 100,
      long: 200,
      description: htmlParagraphs("Shaped lead sling bullets.")
    }),
    weaponSource({
      name: "Slug Thrower (.38)",
      weaponClass: 10,
      damage: "2d6",
      attackType: "ranged",
      short: 20,
      long: 40,
      ammo: { current: 15, max: 15, consumes: true },
      description: htmlParagraphs("Police riot-control sidearm firing stunning slugs.", "Track unconsciousness when stun damage reaches half the target's original hit points.", "Powered by a hydrogen energy cell good for about five clips.")
    }),
    weaponSource({
      name: "Needler (Poison)",
      weaponClass: 11,
      damage: "0",
      attackType: "ranged",
      short: 50,
      long: 100,
      ammo: { current: 10, max: 10, consumes: true },
      effect: { mode: "poison", formula: "17", notes: "Resolve as poison intensity 17." },
      description: htmlParagraphs("Soundless dart weapon loaded with poison capsules.")
    }),
    weaponSource({
      name: "Needler (Paralysis)",
      weaponClass: 11,
      damage: "0",
      attackType: "ranged",
      short: 50,
      long: 100,
      ammo: { current: 10, max: 10, consumes: true },
      effect: { mode: "paralysis", formula: "20", status: "paralysis", notes: "Victim is paralyzed for up to 20 minutes, less one minute per point of Constitution." },
      description: htmlParagraphs("Needler loaded with paralysis darts.")
    }),
    weaponSource({
      name: "Stun Ray Pistol",
      weaponClass: 12,
      damage: "0",
      attackType: "energy",
      short: 25,
      long: 50,
      ammo: { current: 10, max: 10, consumes: true },
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
      ammo: { current: 5, max: 5, consumes: true },
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
      ammo: { current: 10, max: 10, consumes: true },
      description: htmlParagraphs("Hydrogen-cell laser sidearm.", "Class 2 armor deflects the first hit; class 1 armor deflects the first two hits.")
    }),
    weaponSource({
      name: "Laser Rifle",
      weaponClass: 13,
      damage: "6d6",
      attackType: "energy",
      short: 300,
      long: 600,
      ammo: { current: 5, max: 5, consumes: true },
      description: htmlParagraphs("Military laser rifle.", "Class 2 armor deflects the first hit; class 1 armor deflects the first two hits.")
    }),
    weaponSource({
      name: "Mark V Blaster",
      weaponClass: 14,
      damage: "7d6",
      attackType: "energy",
      short: 75,
      long: 150,
      ammo: { current: 5, max: 5, consumes: true },
      description: htmlParagraphs("Disrupting-ray pistol that bores holes through inanimate matter and slain targets.")
    }),
    weaponSource({
      name: "Mark VII Blaster Rifle",
      weaponClass: 14,
      damage: "8d6",
      attackType: "energy",
      short: 225,
      long: 450,
      ammo: { current: 5, max: 5, consumes: true },
      description: htmlParagraphs("Heavy disruptor rifle.")
    }),
    weaponSource({
      name: "Black Ray Gun",
      weaponClass: 15,
      damage: "0",
      attackType: "energy",
      short: 25,
      long: 50,
      ammo: { current: 4, max: 4, consumes: true },
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
      ammo: { current: 10, max: 10, consumes: true },
      effect: { mode: "radiation", formula: "18", notes: "Resolve as radiation intensity 18." },
      description: htmlParagraphs("Projects twin beams of intensity-18 radiation.", "Requires an atomic energy cell carried in a converter backpack linked by cable.")
    }),
    weaponSource({
      name: "Vibro Dagger",
      weaponClass: 4,
      damage: "10",
      attackType: "energy",
      description: htmlParagraphs("Force-field dagger. Cuts anything except another force field.")
    }),
    weaponSource({
      name: "Vibro Blade",
      weaponClass: 5,
      damage: "25",
      attackType: "energy",
      description: htmlParagraphs("Force-field sword. Cuts anything except another force field.")
    }),
    weaponSource({
      name: "Energy Mace",
      weaponClass: 5,
      damage: "30",
      attackType: "energy",
      description: htmlParagraphs("Energized club. Cannot damage targets protected by energy shields.")
    }),
    weaponSource({
      name: "Stun Whip",
      weaponClass: 6,
      damage: "0",
      attackType: "energy",
      effect: { mode: "stun", formula: "20", status: "unconscious", notes: "Victim is stunned for up to 20 minutes, less one minute per point of Constitution." },
      description: htmlParagraphs("Three-meter energized whip that inflicts stun.")
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
    gearSource({
      name: "Tear Gas Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter radius cloud for 1d6 minutes. Each melee turn in the gas lowers armor class by 1 and adds 2 to attack rolls against the victim.")
    }),
    gearSource({
      name: "Stun Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter radius cloud for 1d4 minutes. Each victim saves vs poison against a random intensity or is stunned for 20 minutes less Constitution.")
    }),
    gearSource({
      name: "Poison Gas Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter radius cloud for 1d6 minutes. Victims save vs poison each melee turn spent in the cloud.")
    }),
    gearSource({
      name: "Fragmentation Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter blast radius. Deals 5d6 damage to every target in the area.")
    }),
    gearSource({
      name: "Chemical Explosive Grenade",
      tech: "iii",
      description: htmlParagraphs("10 meter blast radius. Deals 10d6 damage to every target in the area.")
    }),
    gearSource({
      name: "Micro Missile",
      tech: "iv",
      description: htmlParagraphs("500 meter effective range, 10 meter blast radius, 7d6 damage to each target in the area.")
    }),
    gearSource({
      name: "Mini Missile",
      tech: "iv",
      description: htmlParagraphs("1 kilometer effective range, 20 meter blast radius, 50 damage to each target in the area.")
    }),
    gearSource({
      name: "Mutation Bomb",
      tech: "v",
      description: htmlParagraphs("30 meter radius. Living creatures without force-field protection either gain a random mutational defect (60%) or suffer intensity-12 radiation (40%).")
    }),
    gearSource({
      name: "Energy Grenade",
      tech: "iv",
      description: htmlParagraphs("10 meter blast radius. Deals 12d6 damage, but only half damage against armor classes 8 and 9.")
    }),
    gearSource({
      name: "Photon Grenade",
      tech: "v",
      description: htmlParagraphs("10 meter blast radius. Instantly kills creatures not protected by force fields or energy shields.")
    }),
    gearSource({
      name: "Torc Grenade",
      tech: "v",
      description: htmlParagraphs("15 meter blast radius. Disintegrates all matter not protected by force fields or energy shields.")
    }),
    gearSource({
      name: "Small Damage Pack",
      tech: "iv",
      description: htmlParagraphs("Plastic explosive pack with a 10 meter blast radius, dealing 6d6 damage.")
    }),
    gearSource({
      name: "Concentrated Damage Pack",
      tech: "iv",
      description: htmlParagraphs("Large shaped explosive charge. Small pattern: 30 meter blast radius for 10d6 damage.")
    }),
    gearSource({
      name: "Fission Bomb",
      tech: "vi",
      description: htmlParagraphs("Tactical nuclear weapon. Clean-bomb statistics are automated; dirty-bomb fallout remains referee-directed.")
    }),
    gearSource({
      name: "Fusion Bomb",
      tech: "vi",
      description: htmlParagraphs("50 meter blast radius. Deals 75 damage to every target in the area.")
    }),
    gearSource({
      name: "Concussion Bomb",
      tech: "vi",
      description: htmlParagraphs("Mounted tactical gas bomb. Fills a 50 meter radius with stunning gas for 2d6 minutes.", "Victims save vs poison intensity 15 each melee turn spent in the cloud or become stunned.")
    }),
    gearSource({
      name: "Matter Bomb",
      tech: "vi",
      description: htmlParagraphs("10 meter blast radius. Deals 75 damage to every target in the area.")
    }),
    gearSource({
      name: "Negation Bomb",
      tech: "vi",
      description: htmlParagraphs("30 meter blast radius. Drains power sources and collapses energy protection.")
    }),
    gearSource({
      name: "Neutron Bomb",
      tech: "vi",
      description: htmlParagraphs("500 meter blast radius. Inflicts 100 damage to force fields and kills most unshielded living targets.")
    }),
    gearSource({
      name: "Trek Bomb",
      tech: "vi",
      description: htmlParagraphs("30 meter blast radius. Disintegrates unshielded matter and inflicts 30 damage to force fields.")
    }),
    gearSource({
      name: "Surface Missile",
      tech: "vi",
      description: htmlParagraphs("Computer-guided tactical missile. 100 meter blast radius, 150 damage to each target.")
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
    gearSource({
      name: "Broadcast Power Station",
      tech: "vi",
      description: htmlParagraphs("Ancient installation that transmits power through the air rather than wires.", "A surviving station can energize robots and compatible equipment for hundreds of kilometers, entirely at the DM's discretion.")
    }),
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
    })
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
    }
  ];
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
          name: "Poison Matrix",
          type: "text",
          text: {
            format: 1,
            content: hazardMatrixPage(POISON_MATRIX, {
              intro: "Cross poison strength with the victim’s Constitution to determine the result.",
              rowLabel: "Constitution",
              columnLabel: "Poison Strength",
              codeNotes: [
                "\"*\" means no effect.",
                "A number means that many d6 of poison damage.",
                "\"D\" means death unless the correct antidote is administered within two melee rounds."
              ]
            })
          }
        },
        {
          name: "Radiation Matrix",
          type: "text",
          text: {
            format: 1,
            content: hazardMatrixPage(RADIATION_MATRIX, {
              intro: "Cross radiation intensity with the victim’s Constitution to determine the result.",
              rowLabel: "Constitution",
              columnLabel: "Radiation Intensity",
              codeNotes: [
                "A number means that many d6 of radiation damage.",
                "\"M\" means a new mutation manifests in one week.",
                "\"D\" means a 20% chance of mutational defect and an 80% chance of death. There is no antidote for radiation."
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
    }
  ];
}
