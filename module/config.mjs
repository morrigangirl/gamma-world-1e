/**
 * System-wide configuration constants.
 * Attached to globalThis.CONFIG.GAMMA_WORLD at init.
 */

export const SYSTEM_ID = "gamma-world-1e";

export const CHARACTER_TYPES = {
  "psh":             "GAMMA_WORLD.CharacterType.PSH",
  "humanoid":        "GAMMA_WORLD.CharacterType.Humanoid",
  "mutated-animal":  "GAMMA_WORLD.CharacterType.MutatedAnimal",
  "mutated-plant":   "GAMMA_WORLD.CharacterType.MutatedPlant",
  "robot":           "GAMMA_WORLD.CharacterType.Robot"
};

export const CHARACTER_TYPE_KEYS = Object.keys(CHARACTER_TYPES);

/**
 * Canonical damage type vocabulary for the Phase 5 DR/DI/DV trait model.
 * Weapons, hazards, and effects that deal damage tag themselves with one
 * of these strings; actor traits (damageResistance / damageImmunity /
 * damageVulnerability) match against them. The `resolveDamageType()`
 * helper in `effect-state.mjs` canonicalizes raw inputs (e.g. a weaponTag
 * of "laser" or a damage.type of "ENERGY") into one of these keys.
 *
 * Adding a new type is a one-line change here; the schemas use
 * `() => DAMAGE_TYPES` so they pick up additions automatically.
 */
export const DAMAGE_TYPES = Object.freeze([
  "physical",   // melee, kinetic, slugs, thrown
  "energy",     // generic energy (fallback for non-specific energy weapons)
  "laser",      // laser weapons; pairs with armor-class-2 deflect counters
  "fusion",     // fusion weapons
  "radiation",  // radiation damage (rarely direct; most rad goes through saves)
  "poison",     // poison damage (rarely direct; most poison goes through saves)
  "mental",     // psionic / mental damage channel
  "fire",       // heat / flame
  "cold",       // ice / cold
  "sonic",      // sonic / vibration
  "electrical", // lightning / electricity
  "black-ray"   // the instant-death beam; own type so force-field math is clean
]);

export const DAMAGE_TYPE_LABELS = Object.freeze({
  physical:   "GAMMA_WORLD.DamageType.Physical",
  energy:     "GAMMA_WORLD.DamageType.Energy",
  laser:      "GAMMA_WORLD.DamageType.Laser",
  fusion:     "GAMMA_WORLD.DamageType.Fusion",
  radiation:  "GAMMA_WORLD.DamageType.Radiation",
  poison:     "GAMMA_WORLD.DamageType.Poison",
  mental:     "GAMMA_WORLD.DamageType.Mental",
  fire:       "GAMMA_WORLD.DamageType.Fire",
  cold:       "GAMMA_WORLD.DamageType.Cold",
  sonic:      "GAMMA_WORLD.DamageType.Sonic",
  electrical: "GAMMA_WORLD.DamageType.Electrical",
  "black-ray": "GAMMA_WORLD.DamageType.BlackRay"
});

/**
 * 0.10.0 — canonical action-type tag vocabulary for the sheet's
 * Attack / Defense / Utility / Movement / Heal / Buff sections. Every
 * item type (weapon / armor / gear / mutation) carries a
 * `system.actionTypes` SetField whose values are drawn from this list.
 * An item with no tags is considered passive from the sheet POV — it
 * appears in its type-specific list (Mutations tab, Inventory, etc.)
 * but doesn't surface in any cross-type action section.
 *
 * `save` and `damage` are adjunct tags — they usually pair with
 * `attack` (e.g., a grenade is `["attack", "save", "damage"]`) but can
 * stand alone (a direct-damage effect with no attack roll is
 * `["damage"]`). The sheet reads them as badges on each Attack row.
 */
export const ACTION_TYPES = Object.freeze([
  "attack",    // rolls an attack OR forces a hostile save
  "save",      // target rolls a save (usually paired with attack/damage)
  "damage",    // inflicts HP damage (with or without an attack roll)
  "defense",   // grants protection / resistance while active
  "heal",      // restores HP or removes conditions
  "utility",   // non-combat action (tools, containers, narrative)
  "movement",  // grants movement options (flight, jump, teleport, speed)
  "buff"       // self-applied toggle or reactive self-enhancement
]);

export const ACTION_TYPE_LABELS = Object.freeze({
  attack:   "GAMMA_WORLD.ActionType.Attack",
  save:     "GAMMA_WORLD.ActionType.Save",
  damage:   "GAMMA_WORLD.ActionType.Damage",
  defense:  "GAMMA_WORLD.ActionType.Defense",
  heal:     "GAMMA_WORLD.ActionType.Heal",
  utility:  "GAMMA_WORLD.ActionType.Utility",
  movement: "GAMMA_WORLD.ActionType.Movement",
  buff:     "GAMMA_WORLD.ActionType.Buff"
});

/**
 * Nine canonical 1e cryptic alliances. The keys are stable enum values; the
 * values are i18n labels. A tenth "other" slot preserves free-text homebrew.
 */
export const CRYPTIC_ALLIANCES = {
  "":                  "GAMMA_WORLD.Alliance.None",
  "brotherhood":       "GAMMA_WORLD.Alliance.Brotherhood",
  "seekers":           "GAMMA_WORLD.Alliance.Seekers",
  "zoopremisists":     "GAMMA_WORLD.Alliance.Zoopremisists",
  "healers":           "GAMMA_WORLD.Alliance.Healers",
  "restorationists":   "GAMMA_WORLD.Alliance.Restorationists",
  "followers":         "GAMMA_WORLD.Alliance.Followers",
  "ranks-of-the-fit":  "GAMMA_WORLD.Alliance.RanksOfTheFit",
  "archivists":        "GAMMA_WORLD.Alliance.Archivists",
  "radiationists":     "GAMMA_WORLD.Alliance.Radiationists",
  "created":           "GAMMA_WORLD.Alliance.Created",
  "other":             "GAMMA_WORLD.Alliance.Other"
};

/**
 * Attributes in the canonical 1e book order: MS, IN, DX, CH, CN, PS.
 * Object key order is preserved by JS, so iterating
 * `Object.keys(ATTRIBUTES)` yields them in book order.
 */
export const ATTRIBUTES = {
  ms: { label: "GAMMA_WORLD.Attribute.MS.label", abbr: "GAMMA_WORLD.Attribute.MS.abbr", full: "GAMMA_WORLD.Attribute.MS.full" },
  in: { label: "GAMMA_WORLD.Attribute.IN.label", abbr: "GAMMA_WORLD.Attribute.IN.abbr", full: "GAMMA_WORLD.Attribute.IN.full" },
  dx: { label: "GAMMA_WORLD.Attribute.DX.label", abbr: "GAMMA_WORLD.Attribute.DX.abbr", full: "GAMMA_WORLD.Attribute.DX.full" },
  ch: { label: "GAMMA_WORLD.Attribute.CH.label", abbr: "GAMMA_WORLD.Attribute.CH.abbr", full: "GAMMA_WORLD.Attribute.CH.full" },
  cn: { label: "GAMMA_WORLD.Attribute.CN.label", abbr: "GAMMA_WORLD.Attribute.CN.abbr", full: "GAMMA_WORLD.Attribute.CN.full" },
  ps: { label: "GAMMA_WORLD.Attribute.PS.label", abbr: "GAMMA_WORLD.Attribute.PS.abbr", full: "GAMMA_WORLD.Attribute.PS.full" }
};

export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTES);

/**
 * Canonical skill list for the 0.8.0 lightweight skill layer. Each skill
 * has a fixed ability mapping and a visual group; the on-sheet layout
 * preserves the group ordering below. A character can override the
 * ability for any individual skill (stored per-actor in
 * `system.skills.<key>.ability`), but the canonical pick is the starting
 * value and the one the migration backfills with.
 *
 * Hard RAW: maximum of 3 proficient skills per character; proficiency is
 * a flat +2 on the d20 roll. No scaling, no levels, no expertise. Adding
 * a skill here = one new localization entry and the migration picks it
 * up automatically on the next world load.
 */
export const SKILLS = Object.freeze({
  // Field
  survival:          { ability: "cn", label: "GAMMA_WORLD.Skill.Survival",          group: "field"   },
  tracking:          { ability: "in", label: "GAMMA_WORLD.Skill.Tracking",          group: "field"   },
  navigation:        { ability: "in", label: "GAMMA_WORLD.Skill.Navigation",        group: "field"   },
  stealth:           { ability: "dx", label: "GAMMA_WORLD.Skill.Stealth",           group: "field"   },
  climbingTraversal: { ability: "ps", label: "GAMMA_WORLD.Skill.ClimbingTraversal", group: "field"   },
  // Tech
  ancientTech:       { ability: "in", label: "GAMMA_WORLD.Skill.AncientTech",       group: "tech"    },
  computers:         { ability: "in", label: "GAMMA_WORLD.Skill.Computers",         group: "tech"    },
  juryRigging:       { ability: "in", label: "GAMMA_WORLD.Skill.JuryRigging",       group: "tech"    },
  salvage:           { ability: "in", label: "GAMMA_WORLD.Skill.Salvage",           group: "tech"    },
  robotics:          { ability: "in", label: "GAMMA_WORLD.Skill.Robotics",          group: "tech"    },
  // Combat
  ballistics:        { ability: "dx", label: "GAMMA_WORLD.Skill.Ballistics",        group: "combat"  },
  meleeTechnique:    { ability: "ps", label: "GAMMA_WORLD.Skill.MeleeTechnique",    group: "combat"  },
  tactics:           { ability: "in", label: "GAMMA_WORLD.Skill.Tactics",           group: "combat"  },
  threatAssessment:  { ability: "ms", label: "GAMMA_WORLD.Skill.ThreatAssessment",  group: "combat"  },
  // Lore
  abnormalBiology:   { ability: "in", label: "GAMMA_WORLD.Skill.AbnormalBiology",   group: "lore"    },
  radiationLore:     { ability: "in", label: "GAMMA_WORLD.Skill.RadiationLore",     group: "lore"    },
  toxicology:        { ability: "in", label: "GAMMA_WORLD.Skill.Toxicology",        group: "lore"    },
  preFallLore:       { ability: "in", label: "GAMMA_WORLD.Skill.PreFallLore",       group: "lore"    },
  factionLore:       { ability: "in", label: "GAMMA_WORLD.Skill.FactionLore",       group: "lore"    },
  // Social
  barter:            { ability: "ch", label: "GAMMA_WORLD.Skill.Barter",            group: "social"  },
  intimidation:      { ability: "ch", label: "GAMMA_WORLD.Skill.Intimidation",      group: "social"  },
  diplomacy:         { ability: "ch", label: "GAMMA_WORLD.Skill.Diplomacy",         group: "social"  },
  deception:         { ability: "ch", label: "GAMMA_WORLD.Skill.Deception",         group: "social"  },
  // Medical
  fieldMedicine:     { ability: "in", label: "GAMMA_WORLD.Skill.FieldMedicine",     group: "medical" },
  biotechHandling:   { ability: "in", label: "GAMMA_WORLD.Skill.BiotechHandling",   group: "medical" }
});

export const SKILL_KEYS   = Object.freeze(Object.keys(SKILLS));
export const SKILL_GROUPS = Object.freeze(["field", "tech", "combat", "lore", "social", "medical"]);
export const MAX_PROFICIENT_SKILLS = 3;

export const SKILL_GROUP_LABELS = Object.freeze({
  field:   "GAMMA_WORLD.SkillSheet.Group.Field",
  tech:    "GAMMA_WORLD.SkillSheet.Group.Tech",
  combat:  "GAMMA_WORLD.SkillSheet.Group.Combat",
  lore:    "GAMMA_WORLD.SkillSheet.Group.Lore",
  social:  "GAMMA_WORLD.SkillSheet.Group.Social",
  medical: "GAMMA_WORLD.SkillSheet.Group.Medical"
});

export const SAVE_TYPES = {
  radiation: "GAMMA_WORLD.Save.Radiation",
  poison:    "GAMMA_WORLD.Save.Poison",
  mental:    "GAMMA_WORLD.Save.Mental"
};

export const MUTATION_SUBTYPES = {
  physical: "GAMMA_WORLD.Mutation.Subtype.Physical",
  mental:   "GAMMA_WORLD.Mutation.Subtype.Mental",
  plant:    "GAMMA_WORLD.Mutation.Subtype.Plant",
  defect:   "GAMMA_WORLD.Mutation.Subtype.Defect"
};

export const MUTATION_CATEGORIES = {
  beneficial: "GAMMA_WORLD.Mutation.Category.Beneficial",
  defect:     "GAMMA_WORLD.Mutation.Category.Defect"
};

export const USAGE_PERIODS = {
  "day":       "GAMMA_WORLD.Mutation.Usage.Day",
  "week":      "GAMMA_WORLD.Mutation.Usage.Week",
  "encounter": "GAMMA_WORLD.Mutation.Usage.Encounter",
  "scene":     "GAMMA_WORLD.Mutation.Usage.Scene",
  "at-will":   "GAMMA_WORLD.Mutation.Usage.AtWill"
};

export const ATTACK_TYPES = {
  melee:  "GAMMA_WORLD.Weapon.Type.Melee",
  ranged: "GAMMA_WORLD.Weapon.Type.Ranged",
  thrown: "GAMMA_WORLD.Weapon.Type.Thrown",
  energy: "GAMMA_WORLD.Weapon.Type.Energy"
};

/** Weapon classes 1..16 used for the 1e combat matrix column lookup. */
export const WEAPON_CLASSES = Object.fromEntries(
  Array.from({ length: 16 }, (_, i) => [i + 1, `GAMMA_WORLD.Weapon.Class.${i + 1}`])
);

export const ARMOR_TYPES = {
  none:   "GAMMA_WORLD.Armor.Type.None",
  light:  "GAMMA_WORLD.Armor.Type.Light",
  medium: "GAMMA_WORLD.Armor.Type.Medium",
  heavy:  "GAMMA_WORLD.Armor.Type.Heavy",
  shield: "GAMMA_WORLD.Armor.Type.Shield"
};

export const WEAPON_CATEGORIES = {
  primitive: "GAMMA_WORLD.Weapon.Category.Primitive",
  modern:    "GAMMA_WORLD.Weapon.Category.Modern",
  artifact:  "GAMMA_WORLD.Weapon.Category.Artifact",
  natural:   "GAMMA_WORLD.Weapon.Category.Natural"
};

export const WEAPON_CATEGORY_KEYS = Object.keys(WEAPON_CATEGORIES);

export const GEAR_SUBTYPES = {
  ammunition:    "GAMMA_WORLD.Gear.Subtype.Ammunition",
  "power-cell":  "GAMMA_WORLD.Gear.Subtype.PowerCell",
  container:     "GAMMA_WORLD.Gear.Subtype.Container",
  medical:       "GAMMA_WORLD.Gear.Subtype.Medical",
  vehicle:       "GAMMA_WORLD.Gear.Subtype.Vehicle",
  tool:          "GAMMA_WORLD.Gear.Subtype.Tool",
  ration:        "GAMMA_WORLD.Gear.Subtype.Ration",
  "trade-good":  "GAMMA_WORLD.Gear.Subtype.TradeGood",
  communication: "GAMMA_WORLD.Gear.Subtype.Communication",
  explosive:     "GAMMA_WORLD.Gear.Subtype.Explosive",
  misc:          "GAMMA_WORLD.Gear.Subtype.Misc"
};

export const GEAR_SUBTYPE_KEYS = Object.keys(GEAR_SUBTYPES);

/** Canonical ammunition type keys referenced by weapons (`system.ammoType`). */
export const AMMO_TYPES = {
  "":                   "GAMMA_WORLD.Ammo.None",
  "arrow":              "GAMMA_WORLD.Ammo.Arrow",
  "crossbow-bolt":      "GAMMA_WORLD.Ammo.CrossbowBolt",
  "sling-stone":        "GAMMA_WORLD.Ammo.SlingStone",
  "sling-bullet":       "GAMMA_WORLD.Ammo.SlingBullet",
  "slug":               "GAMMA_WORLD.Ammo.Slug",
  "needler-paralysis":  "GAMMA_WORLD.Ammo.NeedlerParalysis",
  "needler-poison":     "GAMMA_WORLD.Ammo.NeedlerPoison",
  "stun-cell":          "GAMMA_WORLD.Ammo.StunCell",
  "javelin":            "GAMMA_WORLD.Ammo.Javelin",
  "gyrojet":            "GAMMA_WORLD.Ammo.Gyrojet",
  // 0.8.1: energy-weapon cells.
  "energy-clip":        "GAMMA_WORLD.Ammo.EnergyClip",
  "blaster-pack":       "GAMMA_WORLD.Ammo.BlasterPack",
  "black-ray-cell":     "GAMMA_WORLD.Ammo.BlackRayCell",
  "fusion-cell":        "GAMMA_WORLD.Ammo.FusionCell"
};

export const AMMO_TYPE_KEYS = Object.keys(AMMO_TYPES).filter((key) => key !== "");

export const STAT_METHODS = {
  "raw":            "GAMMA_WORLD.Chargen.Method.Raw",
  "4d6dl":         "GAMMA_WORLD.Chargen.Method.4d6dl",
  "standardArray": "GAMMA_WORLD.Chargen.Method.StandardArray",
  "pointBuy":      "GAMMA_WORLD.Chargen.Method.PointBuy"
};

export const MUTATION_SELECTION_METHODS = {
  random: "GAMMA_WORLD.Chargen.MutationMethod.Random",
  choose: "GAMMA_WORLD.Chargen.MutationMethod.Choose"
};

/** D&D 5e standard array — six values assigned by the player to the six attributes. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** D&D 5e point-buy costs. Start all stats at 8. Budget: 27 points. */
export const POINT_BUY = {
  startValue: 8,
  minValue: 8,
  maxValue: 15,
  budget: 27,
  /** Cumulative cost to reach each value. 8 is free; 9 costs 1; 14 costs 7; 15 costs 9. */
  costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
};

export const TECH_LEVELS = {
  none: "GAMMA_WORLD.Tech.None",
  i:    "GAMMA_WORLD.Tech.I",
  ii:   "GAMMA_WORLD.Tech.II",
  iii:  "GAMMA_WORLD.Tech.III",
  iv:   "GAMMA_WORLD.Tech.IV",
  v:    "GAMMA_WORLD.Tech.V",
  vi:   "GAMMA_WORLD.Tech.VI"
};

export const ROBOT_MODES = {
  inactive: "GAMMA_WORLD.Robot.Mode.Inactive",
  programmed: "GAMMA_WORLD.Robot.Mode.Programmed",
  wild: "GAMMA_WORLD.Robot.Mode.Wild",
  controlled: "GAMMA_WORLD.Robot.Mode.Controlled"
};

export const ROBOT_POWER_SOURCES = {
  none: "GAMMA_WORLD.Robot.Power.None",
  broadcast: "GAMMA_WORLD.Robot.Power.Broadcast",
  nuclear: "GAMMA_WORLD.Robot.Power.Nuclear",
  hydrogen: "GAMMA_WORLD.Robot.Power.Hydrogen",
  solar: "GAMMA_WORLD.Robot.Power.Solar",
  chemical: "GAMMA_WORLD.Robot.Power.Chemical"
};

export const ENCOUNTER_TERRAINS = {
  clear: "GAMMA_WORLD.Encounter.Terrain.Clear",
  mountains: "GAMMA_WORLD.Encounter.Terrain.Mountains",
  forest: "GAMMA_WORLD.Encounter.Terrain.Forest",
  desert: "GAMMA_WORLD.Encounter.Terrain.Desert",
  water: "GAMMA_WORLD.Encounter.Terrain.Water",
  ruins: "GAMMA_WORLD.Encounter.Terrain.Ruins",
  zones: "GAMMA_WORLD.Encounter.Terrain.Zones"
};

export const ENCOUNTER_INTELLIGENCE = {
  auto: "GAMMA_WORLD.Encounter.Intelligence.Auto",
  "non-intelligent": "GAMMA_WORLD.Encounter.Intelligence.NonIntelligent",
  "semi-intelligent": "GAMMA_WORLD.Encounter.Intelligence.SemiIntelligent",
  intelligent: "GAMMA_WORLD.Encounter.Intelligence.Intelligent"
};

export const ROUTE_PERIODS = {
  day: "GAMMA_WORLD.Encounter.Route.Day",
  night: "GAMMA_WORLD.Encounter.Route.Night"
};

export const POWER_CELL_TYPES = {
  none: "GAMMA_WORLD.PowerCell.None",
  chemical: "GAMMA_WORLD.Robot.Power.Chemical",
  solar: "GAMMA_WORLD.Robot.Power.Solar",
  hydrogen: "GAMMA_WORLD.Robot.Power.Hydrogen",
  nuclear: "GAMMA_WORLD.Robot.Power.Nuclear"
};

export const ARTIFACT_POWER_REQUIREMENTS = {
  none: "GAMMA_WORLD.Artifact.Power.Requirement.None",
  cells: "GAMMA_WORLD.Artifact.Power.Requirement.Cells",
  ambient: "GAMMA_WORLD.Artifact.Power.Requirement.Ambient",
  "cells-or-ambient": "GAMMA_WORLD.Artifact.Power.Requirement.CellsOrAmbient"
};

export const ARTIFACT_AMBIENT_SOURCES = {
  none: "GAMMA_WORLD.Artifact.Power.Ambient.None",
  line: "GAMMA_WORLD.Artifact.Power.Ambient.Line",
  broadcast: "GAMMA_WORLD.Artifact.Power.Ambient.Broadcast",
  "line-or-broadcast": "GAMMA_WORLD.Artifact.Power.Ambient.LineOrBroadcast"
};

export const ARTIFACT_CATEGORIES = {
  none: "GAMMA_WORLD.Artifact.Category.None",
  pistol: "GAMMA_WORLD.Artifact.Category.Pistol",
  rifle: "GAMMA_WORLD.Artifact.Category.Rifle",
  energyWeapon: "GAMMA_WORLD.Artifact.Category.EnergyWeapon",
  grenade: "GAMMA_WORLD.Artifact.Category.Grenade",
  bomb: "GAMMA_WORLD.Artifact.Category.Bomb",
  armor: "GAMMA_WORLD.Artifact.Category.Armor",
  vehicle: "GAMMA_WORLD.Artifact.Category.Vehicle",
  energyDevice: "GAMMA_WORLD.Artifact.Category.EnergyDevice",
  roboticUnit: "GAMMA_WORLD.Artifact.Category.RoboticUnit",
  medical: "GAMMA_WORLD.Artifact.Category.Medical"
};

export const ARTIFACT_CONDITIONS = {
  broken: "GAMMA_WORLD.Artifact.Condition.Broken",
  poor: "GAMMA_WORLD.Artifact.Condition.Poor",
  fair: "GAMMA_WORLD.Artifact.Condition.Fair",
  good: "GAMMA_WORLD.Artifact.Condition.Good",
  excellent: "GAMMA_WORLD.Artifact.Condition.Excellent",
  perfect: "GAMMA_WORLD.Artifact.Condition.Perfect"
};

export const ARTIFACT_CHARTS = {
  none: "GAMMA_WORLD.Artifact.Chart.None",
  a: "GAMMA_WORLD.Artifact.Chart.A",
  b: "GAMMA_WORLD.Artifact.Chart.B",
  c: "GAMMA_WORLD.Artifact.Chart.C"
};

/**
 * Status effects introduced by Gamma World automation. These are appended to
 * Foundry's default `CONFIG.statusEffects` list at init so that
 * `actor.toggleStatusEffect(<id>, { active })` works for any id referenced by
 * the system's on-hit / hazard / condition flows.
 *
 * IDs that already exist in core Foundry (v13) — `poison`, `paralysis`,
 * `stun`, `sleep`, `unconscious`, `blind`, `deaf` — are intentionally not
 * duplicated here; the dedupe in `registerGammaWorldStatusEffects()` keeps
 * core behavior untouched.
 */
export const GAMMA_WORLD_STATUS_EFFECTS = [
  {
    id: "irradiated",
    name: "GAMMA_WORLD.Status.Irradiated",
    img: "icons/svg/radiation.svg"
  },
  {
    id: "poisoned",
    name: "GAMMA_WORLD.Status.Poisoned",
    img: "icons/svg/poison.svg"
  },
  {
    id: "stunned",
    name: "GAMMA_WORLD.Status.Stunned",
    img: "icons/svg/daze.svg"
  },
  {
    id: "paralyzed",
    name: "GAMMA_WORLD.Status.Paralyzed",
    img: "icons/svg/paralysis.svg"
  },
  {
    id: "confused",
    name: "GAMMA_WORLD.Status.Confused",
    img: "icons/svg/daze.svg"
  },
  {
    id: "blinded",
    name: "GAMMA_WORLD.Status.Blinded",
    img: "icons/svg/blind.svg"
  },
  {
    id: "deafened",
    name: "GAMMA_WORLD.Status.Deafened",
    img: "icons/svg/deaf.svg"
  },
  {
    id: "sleeping",
    name: "GAMMA_WORLD.Status.Sleeping",
    img: "icons/svg/sleep.svg"
  },
  {
    // 0.8.4: added for Tangle Vines and other restrain-style effects.
    // If Foundry core already defines "restrained", registerGammaWorld-
    // StatusEffects keeps core's entry (dedupe by id).
    id: "restrained",
    name: "GAMMA_WORLD.Status.Restrained",
    img: "icons/svg/net.svg"
  }
];

/**
 * Merge the GW status-effect list into `CONFIG.statusEffects`, skipping any
 * id that already exists (so core Foundry entries win). Safe to call
 * multiple times; the dedupe by id makes it idempotent.
 */
export function registerGammaWorldStatusEffects() {
  const list = CONFIG.statusEffects ?? [];
  const existing = new Set(list.map((effect) => effect.id));
  for (const effect of GAMMA_WORLD_STATUS_EFFECTS) {
    if (!existing.has(effect.id)) {
      list.push(effect);
      existing.add(effect.id);
    }
  }
  CONFIG.statusEffects = list;
}

/** Single namespace assembled from all the named exports. */
export const GAMMA_WORLD = {
  SYSTEM_ID,
  CHARACTER_TYPES,
  CHARACTER_TYPE_KEYS,
  CRYPTIC_ALLIANCES,
  ATTRIBUTES,
  ATTRIBUTE_KEYS,
  SAVE_TYPES,
  MUTATION_SUBTYPES,
  MUTATION_CATEGORIES,
  USAGE_PERIODS,
  ATTACK_TYPES,
  WEAPON_CLASSES,
  ARMOR_TYPES,
  WEAPON_CATEGORIES,
  WEAPON_CATEGORY_KEYS,
  GEAR_SUBTYPES,
  GEAR_SUBTYPE_KEYS,
  AMMO_TYPES,
  AMMO_TYPE_KEYS,
  STAT_METHODS,
  MUTATION_SELECTION_METHODS,
  STANDARD_ARRAY,
  POINT_BUY,
  TECH_LEVELS,
  ROBOT_MODES,
  ROBOT_POWER_SOURCES,
  ENCOUNTER_TERRAINS,
  ENCOUNTER_INTELLIGENCE,
  ROUTE_PERIODS,
  POWER_CELL_TYPES,
  ARTIFACT_POWER_REQUIREMENTS,
  ARTIFACT_AMBIENT_SOURCES,
  ARTIFACT_CATEGORIES,
  ARTIFACT_CONDITIONS,
  ARTIFACT_CHARTS
};
