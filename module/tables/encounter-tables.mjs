const REACTION_RESULTS = [
  { min: 2, max: 2, label: "Extremely hostile", key: "2" },
  { min: 3, max: 5, label: "Hostile / distrustful", key: "3-5" },
  { min: 6, max: 8, label: "Uncertain", key: "6-8" },
  { min: 9, max: 11, label: "Friendly / helpful", key: "9-11" },
  { min: 12, max: 12, label: "Enthusiastic / loyal", key: "12" }
];

const TYPE_RELATION_MODIFIERS = {
  "psh:humanoid": -1,
  "humanoid:psh": -1,
  "psh:mutated-animal": -2,
  "mutated-animal:psh": -2,
  "humanoid:mutated-animal": -1,
  "mutated-animal:humanoid": -1,
  "robot:psh": -2,
  "robot:humanoid": -2,
  "robot:mutated-animal": -3,
  "psh:robot": -2,
  "humanoid:robot": -2,
  "mutated-animal:robot": -3
};

const ENCOUNTER_TERRAINS = {
  clear: [
    "Yexil", "Horl Choo", "Centisteed", "Perth", "Zeethh",
    "Hoop", "Sleeth", "Brutorz", "Zarn", "Hopper",
    "Robotic Unit", "Badder", "Arn", "Herp", "Blaash",
    "Rakox", "Android", "Tribesmen", "Podog", "Cryptic Alliance"
  ],
  mountains: [
    "Podog", "Kep", "Zeethh", "Ert", "Hoop",
    "Arn", "Yexil", "Blight", "Crep Plant", "Android",
    "Cal Then", "Parn", "Robotic Unit", "Orlen", "Tribesmen",
    "Hisser", "Herp", "Zarn", "Sep", "Cryptic Alliance"
  ],
  forest: [
    "Win Seen", "Kai Lin", "Horl Choo", "Grens", "Herp",
    "Obb", "Hisser", "Ert Telden", "Robotic Unit", "Arn",
    "Soul Besh", "Centisteed", "Blaash", "Pineto", "Ark",
    "Perth", "Sep", "Serf", "Badder", "Cryptic Alliance"
  ],
  desert: [
    "Obb", "Sep", "Hisser", "Soul Besh", "Sleeth",
    "Parn", "Podog", "Yexil", "Blaash", "Kep",
    "Kai Lin", "Perth", "Serf", "Tribesmen", "Android",
    "Robotic Unit", "Cal Then", "Blight", "Zarn", "Cryptic Alliance"
  ],
  water: [
    "Crep Plant", "Seroon Lou", "Ber Lep", "Win Seen", "Narl Ep",
    "Terl", "Menarl", "Fleshin", "Cren Tosh", "Barl Nep",
    "Ert Telden", "Fen", "Keeshin", "Herkel", "Ert",
    "Android", "Badder", "Robotic Unit", "Tribesmen", "Cryptic Alliance"
  ],
  ruins: [
    "Badder", "Arn", "Serf", "Yexil", "Orlen",
    "Ark", "Android", "Robotic Unit", "Hoop", "Tribesmen",
    "Sleeth", "Cryptic Alliance", "No Encounter", "No Encounter", "No Encounter",
    "No Encounter", "No Encounter", "No Encounter", "No Encounter", "No Encounter"
  ],
  zones: [
    "Serf", "Blight", "Hisser", "Android", "Blaash",
    "Zarn", "Robotic Unit", "Tribesmen", "Parn", "Cryptic Alliance",
    "No Encounter", "No Encounter", "No Encounter", "No Encounter", "No Encounter",
    "No Encounter", "No Encounter", "No Encounter", "No Encounter", "No Encounter"
  ]
};

export const ENCOUNTER_TERRAIN_KEYS = Object.freeze(Object.keys(ENCOUNTER_TERRAINS));
export const ENCOUNTER_TABLE_SEED_VERSION = 2;
export const ENCOUNTER_TABLE_LABELS = Object.freeze({
  clear: "Clear Terrain Encounters",
  mountains: "Mountain Encounters",
  forest: "Forest Encounters",
  desert: "Desert Encounters",
  water: "Water Area Encounters",
  ruins: "Ruin Encounters",
  zones: "Radioactive Zone Encounters"
});

export const ENCOUNTER_TABLE_ICONS = Object.freeze({
  clear: "systems/gamma-world-1e/assets/ui/encounters/clear.svg",
  mountains: "systems/gamma-world-1e/assets/ui/encounters/mountains.svg",
  forest: "systems/gamma-world-1e/assets/ui/encounters/forest.svg",
  desert: "systems/gamma-world-1e/assets/ui/encounters/desert.svg",
  water: "systems/gamma-world-1e/assets/ui/encounters/water.svg",
  ruins: "systems/gamma-world-1e/assets/ui/encounters/ruins.svg",
  zones: "systems/gamma-world-1e/assets/ui/encounters/zones.svg"
});

const ENTRY_DETAILS = {
  "Android": {
    countText: "1-6 per subtype",
    notes: "Random subtype: thinker, worker, or warrior.",
    candidates: ["Android Thinker", "Android Worker", "Android Warrior"],
    collection: "monsters"
  },
  "Ark": { countText: "1-4", candidates: ["Ark"], collection: "monsters" },
  "Arn": { countText: "1-6", candidates: ["Arn"], collection: "monsters" },
  "Badder": { countText: "3-18", candidates: ["Badder"], collection: "monsters" },
  "Barl Nep": { countText: "1", candidates: ["Barl Nep"], collection: "monsters" },
  "Ber Lep": { countText: "1-8", candidates: ["Ber Lep"], collection: "monsters" },
  "Blaash": { countText: "1-10", candidates: ["Blaash"], collection: "monsters" },
  "Blight": { countText: "1-4", candidates: ["Blight"], collection: "monsters" },
  "Brutorz": { countText: "1 (2-12 in wild herds)", candidates: ["Brutorz"], collection: "monsters" },
  "Cal Then": { countText: "1", candidates: ["Cal Then"], collection: "monsters" },
  "Centisteed": { countText: "1", candidates: ["Centisteed"], collection: "monsters" },
  "Crep Plant": { countText: "1-10", candidates: ["Crep Plant"], collection: "monsters" },
  "Cren Tosh": { countText: "1", candidates: ["Cren Tosh"], collection: "monsters" },
  "Cryptic Alliance": {
    countText: "Per referee's map",
    notes: "Use the cryptic alliance already established for the region.",
    candidates: [],
    collection: ""
  },
  "Ert": { countText: "1", candidates: ["Ert"], collection: "monsters" },
  "Ert Telden": { countText: "1-6", candidates: ["Ert Telden"], collection: "monsters" },
  "Fen": { countText: "1-10", candidates: ["Fen"], collection: "monsters" },
  "Fleshin": { countText: "1", candidates: ["Fleshin"], collection: "monsters" },
  "Grens": { countText: "1-6", candidates: ["Grens"], collection: "monsters" },
  "Herkel": { countText: "1-10", candidates: ["Herkel"], collection: "monsters" },
  "Herp": { countText: "1", candidates: ["Herp"], collection: "monsters" },
  "Hisser": { countText: "1-10", candidates: ["Hisser"], collection: "monsters" },
  "Hoop": { countText: "1-20", candidates: ["Hoop"], collection: "monsters" },
  "Hopper": { countText: "1 (1-20 in the wild)", candidates: ["Hopper"], collection: "monsters" },
  "Horl Choo": { countText: "1", candidates: ["Horl Choo"], collection: "monsters" },
  "Kai Lin": { countText: "1-4", candidates: ["Kai Lin"], collection: "monsters" },
  "Keeshin": { countText: "1", candidates: ["Keeshin"], collection: "monsters" },
  "Kep": { countText: "1", candidates: ["Kep"], collection: "monsters" },
  "Menarl": { countText: "1-4", candidates: ["Menarl"], collection: "monsters" },
  "Narl Ep": { countText: "1", candidates: ["Narl Ep"], collection: "monsters" },
  "No Encounter": {
    countText: "",
    notes: "No encounter is indicated by the table result.",
    candidates: [],
    collection: ""
  },
  "Obb": { countText: "1", candidates: ["Obb"], collection: "monsters" },
  "Orlen": { countText: "1", candidates: ["Orlen"], collection: "monsters" },
  "Parn": { countText: "1-4", candidates: ["Parn"], collection: "monsters" },
  "Perth": { countText: "1-10", candidates: ["Perth"], collection: "monsters" },
  "Pineto": { countText: "1 (1-8 in the wild)", candidates: ["Pineto"], collection: "monsters" },
  "Podog": { countText: "1 (2-12 in wild packs)", candidates: ["Podog"], collection: "monsters" },
  "Rakox": { countText: "1 (5-30 in wild herds)", candidates: ["Rakox"], collection: "monsters" },
  "Robotic Unit": {
    countText: "Per referee / installation",
    notes: "Choose the appropriate robot model for the site or patrol.",
    candidates: ["Security Robotoid"],
    collection: "sample-actors"
  },
  "Sep": { countText: "1-6", candidates: ["Sep"], collection: "monsters" },
  "Serf": { countText: "1-4", candidates: ["Serf"], collection: "monsters" },
  "Seroon Lou": { countText: "3-18", candidates: ["Seroon Lou"], collection: "monsters" },
  "Sleeth": { countText: "1-10", candidates: ["Sleeth"], collection: "monsters" },
  "Soul Besh": { countText: "1", candidates: ["Soul Besh"], collection: "monsters" },
  "Terl": { countText: "1-4", candidates: ["Terl"], collection: "monsters" },
  "Tribesmen": {
    countText: "1-100 (2d10) PSH or humanoids",
    notes: "Use Pure Strain Human or humanoid wanderers from the current region.",
    candidates: ["Pure Strain Human Scavenger", "Humanoid Raider"],
    collection: "sample-actors"
  },
  "Win Seen": { countText: "2-7", candidates: ["Win Seen"], collection: "monsters" },
  "Yexil": { countText: "1-4", candidates: ["Yexil"], collection: "monsters" },
  "Zarn": { countText: "1", candidates: ["Zarn"], collection: "monsters" },
  "Zeethh": { countText: "1-100", candidates: ["Zeethh"], collection: "monsters" }
};

function cleanText(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function charismaReactionAdjustment(score) {
  const value = Math.round(Number(score) || 0);
  if (value <= 4) return -2;
  if (value <= 7) return -1;
  if (value <= 12) return 0;
  if (value <= 15) return 1;
  if (value <= 17) return 2;
  return 3;
}

export function typeReactionAdjustment(actorType, targetType) {
  if (!actorType || !targetType || actorType === targetType) return 0;
  return TYPE_RELATION_MODIFIERS[`${actorType}:${targetType}`] ?? 0;
}

export function reactionResult(total) {
  const value = Math.max(2, Math.min(12, Math.round(Number(total) || 2)));
  return REACTION_RESULTS.find((entry) => value >= entry.min && value <= entry.max) ?? REACTION_RESULTS[0];
}

export function surpriseEntry({ roll, surprised, firstStrike = false, side = "" } = {}) {
  return {
    side,
    roll,
    surprised,
    firstStrike
  };
}

export function normalizeEncounterTerrain(terrain) {
  const value = cleanText(terrain)
    .replace(/areas?/g, "")
    .replace(/radioactive/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (["clear"].includes(value)) return "clear";
  if (["mountain", "mountains"].includes(value)) return "mountains";
  if (["forest", "forests"].includes(value)) return "forest";
  if (["desert", "deserts"].includes(value)) return "desert";
  if (["water", "water area", "water areas"].includes(value)) return "water";
  if (["ruin", "ruins"].includes(value)) return "ruins";
  if (["zone", "zones", "radioactive zone", "radioactive zones"].includes(value)) return "zones";
  return "";
}

export function encounterEntryDetails(name) {
  const entry = ENTRY_DETAILS[name] ?? {
    countText: "",
    notes: "",
    candidates: name ? [name] : [],
    collection: "monsters"
  };

  return {
    name,
    countText: entry.countText ?? "",
    notes: entry.notes ?? "",
    candidates: [...(entry.candidates ?? [])],
    collection: entry.collection ?? "",
    noEncounter: name === "No Encounter"
  };
}

export function terrainEncounterEntry(terrain, roll) {
  const key = normalizeEncounterTerrain(terrain);
  if (!key || !ENCOUNTER_TERRAINS[key]) return null;
  const value = Math.max(1, Math.min(20, Math.round(Number(roll) || 1)));
  const name = ENCOUNTER_TERRAINS[key][value - 1] ?? "No Encounter";
  return {
    terrain: key,
    roll: value,
    ...encounterEntryDetails(name)
  };
}

export function terrainEncounterResults(terrain) {
  const key = normalizeEncounterTerrain(terrain);
  if (!key || !ENCOUNTER_TERRAINS[key]) return [];
  return ENCOUNTER_TERRAINS[key].map((name, index) => ({
    terrain: key,
    roll: index + 1,
    ...encounterEntryDetails(name)
  }));
}

export function routeEncounterResult(terrain, { checkRoll, encounterRoll = null, period = "day" } = {}) {
  const key = normalizeEncounterTerrain(terrain);
  const routeRoll = Math.max(1, Math.min(6, Math.round(Number(checkRoll) || 1)));
  const encountered = routeRoll === 6;
  return {
    terrain: key,
    period: cleanText(period) === "night" ? "night" : "day",
    checkRoll: routeRoll,
    encountered,
    encounter: encountered && (encounterRoll != null)
      ? terrainEncounterEntry(key, encounterRoll)
      : null
  };
}

export function resolveEncounterIntelligence(actor) {
  const explicit = actor?.system?.encounter?.intelligence;
  if (["non-intelligent", "semi-intelligent", "intelligent"].includes(explicit)) return explicit;

  const detailsType = cleanText(actor?.system?.details?.type);
  const creatureClass = cleanText(actor?.system?.details?.creatureClass);
  const speech = cleanText(actor?.system?.details?.speech);
  const languages = cleanText(actor?.system?.social?.languages);
  const alliance = cleanText(actor?.system?.details?.alliance);
  const isRobot = !!(actor?.system?.robotics?.isRobot || (detailsType === "robot"));

  if (isRobot) return "intelligent";
  if (["psh", "humanoid"].includes(detailsType)) return "intelligent";
  if (speech || languages || alliance) return "intelligent";
  if (/(android|cryptic|tribes)/.test(creatureClass)) return "intelligent";
  return "non-intelligent";
}

export function moraleThreshold(intelligence) {
  if (intelligence === "intelligent") return 3;
  if (intelligence === "semi-intelligent") return 4;
  return 5;
}

export function moraleLairBonus(intelligence, { defendingLair = false, lairYoung = false } = {}) {
  if (!defendingLair) return 0;

  const base = intelligence === "intelligent"
    ? 1
    : intelligence === "semi-intelligent"
      ? 2
      : 3;

  return lairYoung ? (base * 2) : base;
}

export function moraleResult(total, threshold) {
  return {
    total: Math.round(Number(total) || 0),
    threshold: Math.round(Number(threshold) || 0),
    continues: total >= threshold,
    key: total >= threshold ? "continue" : "flee"
  };
}
