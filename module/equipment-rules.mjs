import { SYSTEM_ID } from "./config.mjs";
import { artifactFunctionChance } from "./tables/artifact-tables.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableGrantedItemId(ownerId = "", name = "", type = "item") {
  const seed = `${ownerId}:${type}:${name}`;
  let a = 2166136261;
  let b = 16777619;
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 16777619) >>> 0;
    b ^= (code << (index % 8));
    b = Math.imul(b, 2654435761) >>> 0;
  }
  return `${a.toString(36)}${b.toString(36)}`.replace(/[^a-z0-9]/gi, "").slice(0, 16).padEnd(16, "0");
}

function mergeDefaults(target, defaults) {
  for (const [key, value] of Object.entries(defaults)) {
    if (Array.isArray(value)) {
      // Set-like arrays (damage-trait grants, etc.): copy the default
      // when the target is missing or still at its own empty-initial
      // state, so named-item rules can override the generic initial.
      // For non-empty target arrays we trust the caller's authoring.
      const current = target[key];
      if (!Array.isArray(current) || current.length === 0) {
        target[key] = [...value];
      }
      continue;
    }

    if (value && (typeof value === "object")) {
      target[key] ??= {};
      mergeDefaults(target[key], value);
      continue;
    }

    if (typeof value === "boolean") {
      if (target[key] == null) target[key] = value;
      continue;
    }

    if ((typeof value === "number") && (value !== 0)) {
      if ((target[key] == null) || (target[key] === 0)) target[key] = value;
      continue;
    }

    if ((typeof value === "string") && value) {
      if ((target[key] == null) || (target[key] === "")) target[key] = value;
      continue;
    }
  }
  return target;
}

function collectMissingUpdates(current, defaults, prefix = "system", update = {}) {
  for (const [key, value] of Object.entries(defaults)) {
    const path = `${prefix}.${key}`;
    const currentValue = current?.[key];
    if (value && (typeof value === "object") && !Array.isArray(value)) {
      collectMissingUpdates(currentValue ?? {}, value, path, update);
      continue;
    }

    if (typeof value === "boolean") {
      if (currentValue == null) update[path] = value;
      continue;
    }

    if ((typeof value === "number") && (value !== 0)) {
      if ((currentValue == null) || (currentValue === 0)) update[path] = value;
      continue;
    }

    if ((typeof value === "string") && value) {
      if ((currentValue == null) || (currentValue === "")) update[path] = value;
    }
  }

  return update;
}

function normalizedWeaponStatus(item) {
  const system = item?._source?.system ?? item?.system ?? {};
  const mode = system.effect?.mode ?? "";
  const status = system.effect?.status ?? "";
  if ((mode === "stun") && (!status || (status === "daze"))) return "unconscious";
  if ((mode === "paralysis") && !status) return "paralysis";
  return "";
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
  traits = {},
  description = "",
  ammo = { current: 0, max: 0, consumes: false },
  rof = 1,
  weight = 0,
  quantity = 1,
  equipped = true
}) {
  return {
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
      traits: {
        tag: traits.tag ?? "",
        deflectAc2Hits: traits.deflectAc2Hits ?? 0,
        deflectAc1Hits: traits.deflectAc1Hits ?? 0,
        bypassesForceField: !!traits.bypassesForceField,
        requiresNoForceField: !!traits.requiresNoForceField,
        nonlethal: !!traits.nonlethal
      },
      quantity,
      weight,
      equipped,
      description: { value: description }
    }
  };
}

function gearSource({
  name,
  quantity = 1,
  weight = 0,
  tech = "none",
  description = "",
  action = {}
}) {
  return {
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
        notes: action.notes ?? ""
      },
      description: { value: description }
    }
  };
}

function powerProfile({
  requirement = "",
  cells = [],
  slots = 0,
  installedType = "",
  installed = null,
  ambientSource = "none",
  ambientAvailable = false
} = {}) {
  const compatibleCells = Array.isArray(cells)
    ? cells.filter(Boolean)
    : String(cells ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  const cellSlots = Math.max(0, Number(slots ?? compatibleCells.length ?? 0));
  const resolvedRequirement = requirement
    || (ambientSource !== "none"
      ? (cellSlots > 0 ? "cells-or-ambient" : "ambient")
      : (cellSlots > 0 ? "cells" : "none"));
  return {
    requirement: resolvedRequirement,
    compatibleCells: compatibleCells.join(","),
    cellSlots,
    cellsInstalled: installed == null
      ? (resolvedRequirement === "ambient" ? 0 : cellSlots)
      : Math.max(0, Number(installed ?? 0)),
    installedType: installedType || compatibleCells[0] || "none",
    ambientSource,
    ambientAvailable: !!ambientAvailable
  };
}

const WEAPON_RULES = {
  "Slug Thrower (.38)": {
    traits: { tag: "slug", nonlethal: true }
  },
  "Needler (Poison)": {
    traits: { tag: "needler" }
  },
  "Needler (Paralysis)": {
    traits: { tag: "needler" }
  },
  "Stun Ray Pistol": {
    traits: { tag: "stun" }
  },
  "Stun Rifle": {
    traits: { tag: "stun" }
  },
  "Laser Pistol": {
    traits: { tag: "laser", deflectAc2Hits: 1, deflectAc1Hits: 2 }
  },
  "Laser Rifle": {
    traits: { tag: "laser", deflectAc2Hits: 1, deflectAc1Hits: 2 }
  },
  "Mark V Blaster": {
    traits: { tag: "disruptor" }
  },
  "Mark VII Blaster Rifle": {
    traits: { tag: "disruptor" }
  },
  "Black Ray Gun": {
    traits: { tag: "black-ray", requiresNoForceField: true }
  },
  "Fusion Rifle": {
    traits: { tag: "fusion", deflectAc2Hits: 1, deflectAc1Hits: 2 }
  },
  "Vibro Dagger": {
    traits: { tag: "force" }
  },
  "Vibro Blade": {
    traits: { tag: "force" }
  },
  "Energy Mace": {
    traits: { tag: "energy-mace", requiresNoForceField: true }
  },
  "Stun Whip": {
    traits: { tag: "stun" }
  }
};

const grantedItemSyncs = new Map();

const ARMOR_RULES = {
  "Energized Armor": {
    mobility: { jump: 200 },
    field: { mode: "none", capacity: 0 }
  },
  "Inertia Armor": {
    field: { mode: "partial", capacity: 25 },
    // Phase 5 trait model. The equivalent legacy protection.* booleans
    // are kept in sync by the armor migration in migrations.mjs so
    // worlds built before 0.7.0 get the same coverage.
    traits: {
      grantsImmunity: ["black-ray", "radiation", "poison"]
    }
  },
  "Powered Scout Armor": {
    field: { mode: "full", capacity: 20 }
  },
  "Powered Battle Armor": {
    field: { mode: "full", capacity: 30 },
    mobility: { flight: 100, lift: 1.5 },
    offense: { punchDamage: "8d6" },
    grantedItems: [
      weaponSource({
        name: "Powered Battle Fist",
        weaponClass: 1,
        damage: "8d6",
        attackType: "melee",
        traits: { tag: "powered-fist" },
        description: "<p>Hydraulic punch delivered by powered battle armor.</p>"
      })
    ]
  },
  "Powered Attack Armor": {
    field: { mode: "full", capacity: 40 },
    mobility: { flight: 150, lift: 2 },
    offense: { punchDamage: "9d6" },
    grantedItems: [
      weaponSource({
        name: "Powered Attack Fist",
        weaponClass: 1,
        damage: "9d6",
        attackType: "melee",
        traits: { tag: "powered-fist" },
        description: "<p>Hydraulic punch delivered by powered attack armor.</p>"
      }),
      weaponSource({
        name: "Built-in Laser Pistol (Left)",
        weaponClass: 13,
        damage: "5d6",
        attackType: "energy",
        short: 100,
        long: 200,
        ammo: { current: 10, max: 10, consumes: false },
        traits: { tag: "laser", deflectAc2Hits: 1, deflectAc1Hits: 2 },
        description: "<p>Forefinger-mounted laser pistol built into powered attack armor.</p>"
      }),
      weaponSource({
        name: "Built-in Laser Pistol (Right)",
        weaponClass: 13,
        damage: "5d6",
        attackType: "energy",
        short: 100,
        long: 200,
        ammo: { current: 10, max: 10, consumes: false },
        traits: { tag: "laser", deflectAc2Hits: 1, deflectAc1Hits: 2 },
        description: "<p>Forefinger-mounted laser pistol built into powered attack armor.</p>"
      }),
      gearSource({
        name: "Built-in Micro Missile Rack",
        quantity: 20,
        tech: "iv",
        description: "<p>Helmet-mounted micro-missile rack built into powered attack armor.</p>",
        action: {
          mode: "area-damage",
          damageFormula: "7d6",
          radius: 10,
          consumeQuantity: 1,
          notes: "Resolve against all currently targeted creatures in the blast area."
        }
      })
    ]
  },
  "Powered Assault Armor": {
    field: { mode: "full", capacity: 50 },
    mobility: { flight: 250, lift: 2 },
    offense: { punchDamage: "9d6" },
    grantedItems: [
      weaponSource({
        name: "Powered Assault Fist",
        weaponClass: 1,
        damage: "9d6",
        attackType: "melee",
        traits: { tag: "powered-fist" },
        description: "<p>Hydraulic punch delivered by powered assault armor.</p>"
      }),
      weaponSource({
        name: "Built-in Laser Pistol (Left)",
        weaponClass: 13,
        damage: "5d6",
        attackType: "energy",
        short: 100,
        long: 200,
        ammo: { current: 10, max: 10, consumes: false },
        traits: { tag: "laser", deflectAc2Hits: 1, deflectAc1Hits: 2 },
        description: "<p>Forefinger-mounted laser pistol built into powered assault armor.</p>"
      }),
      weaponSource({
        name: "Built-in Laser Pistol (Right)",
        weaponClass: 13,
        damage: "5d6",
        attackType: "energy",
        short: 100,
        long: 200,
        ammo: { current: 10, max: 10, consumes: false },
        traits: { tag: "laser", deflectAc2Hits: 1, deflectAc1Hits: 2 },
        description: "<p>Forefinger-mounted laser pistol built into powered assault armor.</p>"
      }),
      gearSource({
        name: "Built-in Micro Missile Rack",
        quantity: 20,
        tech: "iv",
        description: "<p>Helmet-mounted micro-missile rack built into powered assault armor.</p>",
        action: {
          mode: "area-damage",
          damageFormula: "7d6",
          radius: 10,
          consumeQuantity: 1,
          notes: "Resolve against all currently targeted creatures in the blast area."
        }
      })
    ]
  }
};

const GEAR_RULES = {
  "Tear Gas Grenade": {
    action: {
      mode: "tear-gas-cloud",
      radius: 10,
      durationFormula: "1d6*10",
      consumeQuantity: 1,
      notes: "Target every creature caught in the cloud when it is deployed."
    }
  },
  "Stun Grenade": {
    action: {
      mode: "stun-cloud",
      radius: 10,
      durationFormula: "1d4*10",
      intensityFormula: "3d6",
      consumeQuantity: 1,
      notes: "Target every creature caught in the cloud when it is deployed."
    }
  },
  "Poison Gas Grenade": {
    action: {
      mode: "poison-cloud",
      radius: 10,
      durationFormula: "1d6*10",
      intensityFormula: "3d6",
      consumeQuantity: 1,
      notes: "Target every creature caught in the cloud when it is deployed."
    }
  },
  "Fragmentation Grenade": {
    action: {
      mode: "area-damage",
      damageFormula: "5d6",
      radius: 10,
      consumeQuantity: 1,
      notes: "Resolve against all currently targeted creatures in the blast area."
    }
  },
  "Chemical Explosive Grenade": {
    action: {
      mode: "area-damage",
      damageFormula: "10d6",
      radius: 10,
      consumeQuantity: 1,
      notes: "Resolve against all currently targeted creatures in the blast area."
    }
  },
  "Micro Missile": {
    action: {
      mode: "area-damage",
      damageFormula: "7d6",
      radius: 10,
      consumeQuantity: 1,
      notes: "Resolve against all currently targeted creatures in the blast area."
    }
  },
  "Mini Missile": {
    action: {
      mode: "area-damage",
      damageFormula: "50",
      radius: 20,
      consumeQuantity: 1,
      notes: "Resolve against all currently targeted creatures in the blast area."
    }
  },
  "Mutation Bomb": {
    action: {
      mode: "mutation-bomb",
      radius: 30,
      intensityFormula: "12",
      consumeQuantity: 1,
      notes: "Creatures protected by force fields are unaffected."
    }
  },
  "Energy Grenade": {
    action: {
      mode: "area-damage",
      damageFormula: "12d6",
      radius: 10,
      consumeQuantity: 1,
      notes: "Does only half damage against armor classes 8 and 9."
    }
  },
  "Photon Grenade": {
    action: {
      mode: "photon",
      radius: 10,
      consumeQuantity: 1,
      notes: "Instant death to targets not protected by force fields or energy shields."
    }
  },
  "Torc Grenade": {
    action: {
      mode: "torc",
      radius: 15,
      consumeQuantity: 1,
      notes: "Disintegrates unshielded matter and creatures in the blast area."
    }
  },
  "Small Damage Pack": {
    action: {
      mode: "area-damage",
      damageFormula: "6d6",
      radius: 10,
      consumeQuantity: 1,
      notes: "Small satchel of plastic explosive."
    }
  },
  "Concentrated Damage Pack": {
    action: {
      mode: "area-damage",
      damageFormula: "10d6",
      radius: 30,
      consumeQuantity: 1,
      notes: "Large shaped pack of explosive; see the book for oversize charges."
    }
  },
  "Fusion Bomb": {
    action: {
      mode: "area-damage",
      damageFormula: "75",
      radius: 50,
      consumeQuantity: 1,
      notes: "Tactical fusion blast."
    }
  },
  "Concussion Bomb": {
    action: {
      mode: "stun-cloud",
      radius: 50,
      durationFormula: "2d6*10",
      intensityFormula: "15",
      consumeQuantity: 1,
      notes: "Large gas cloud that can leave creatures stunned for 20 minutes less Constitution."
    }
  },
  "Matter Bomb": {
    action: {
      mode: "area-damage",
      damageFormula: "75",
      radius: 10,
      consumeQuantity: 1,
      notes: "Disc-shaped matter bomb."
    }
  },
  "Negation Bomb": {
    action: {
      mode: "negation",
      radius: 30,
      consumeQuantity: 1,
      notes: "Drains power sources and collapses force fields."
    }
  },
  "Neutron Bomb": {
    action: {
      mode: "photon",
      radius: 500,
      consumeQuantity: 1,
      notes: "100 damage to fields; unshielded living targets die instantly."
    }
  },
  "Trek Bomb": {
    action: {
      mode: "trek",
      radius: 30,
      consumeQuantity: 1,
      notes: "Disintegrates unshielded targets; force fields sustain 30 damage."
    }
  },
  "Surface Missile": {
    action: {
      mode: "area-damage",
      damageFormula: "150",
      radius: 100,
      consumeQuantity: 1,
      notes: "Computer-guided tactical missile."
    }
  },
  "Neutron Missile": {
    action: {
      mode: "photon",
      radius: 100,
      consumeQuantity: 1,
      notes: "Surface missile fitted with a neutron warhead."
    }
  },
  "Negation Missile": {
    action: {
      mode: "negation",
      radius: 100,
      consumeQuantity: 1,
      notes: "Surface missile fitted with a negation warhead."
    }
  },
  "Fission Bomb": {
    action: {
      mode: "area-damage",
      damageFormula: "200",
      radius: 1000,
      consumeQuantity: 1,
      notes: "Clean bomb statistics; dirty-bomb radiation fallout is referee-directed."
    }
  },
  "Fission Missile": {
    action: {
      mode: "area-damage",
      damageFormula: "200",
      radius: 1000,
      consumeQuantity: 1,
      notes: "Clean missile statistics; dirty fallout is referee-directed."
    }
  },
  "Portent": {
    action: {
      mode: "portent",
      consumeQuantity: 0,
      notes: "Backpack shield for up to four beings; absorbs 5 points before burning out."
    }
  },
  "Energy Cloak": {
    action: {
      mode: "guided",
      status: "laser-immune",
      ongoing: true,
      notes: "When powered, the cloak renders the wearer immune to laser fire."
    }
  },
  "Control Baton": {
    action: {
      mode: "guided",
      ongoing: true,
      notes: "Command baton for powered armor and robotic units."
    }
  },
  "Communications Sender": {
    action: {
      mode: "guided",
      notes: "Short-range communications device."
    }
  },
  "Medi-kit": {
    action: {
      mode: "guided",
      notes: "Portable diagnostic and first-aid computer with limited treatments."
    }
  },
  "Anti-grav Sled": {
    action: {
      mode: "guided",
      status: "anti-grav",
      ongoing: true,
      notes: "Cargo sled that floats just above the ground."
    }
  },
  "Ultra-violet and Infra-red Goggles": {
    action: {
      mode: "guided",
      status: "goggles",
      ongoing: true,
      notes: "Reveals heat and hidden light sources."
    }
  },
  "Chemical Energy Cell": {
    action: {
      mode: "guided",
      notes: "Rechargeable chemical power cell."
    }
  },
  "Solar Energy Cell": {
    action: {
      mode: "guided",
      notes: "Solar-assisted rechargeable power cell."
    }
  },
  "Hydrogen Energy Cell": {
    action: {
      mode: "guided",
      notes: "High-capacity rechargeable hydrogen cell."
    }
  },
  "Atomic Energy Cell": {
    action: {
      mode: "guided",
      notes: "Long-lived atomic power cell."
    }
  },
  "Energy Cell Charger": {
    action: {
      mode: "charger",
      notes: "Recharges compatible chemical or hydrogen cells."
    }
  },
  "Pain Reducer": {
    action: {
      mode: "guided",
      status: "pain-reducer",
      ongoing: true,
      notes: "Suppresses pain and grants temporary hit-point capacity."
    }
  },
  "Mind Booster": {
    action: {
      mode: "guided",
      status: "mind-boost",
      ongoing: true,
      notes: "+3 mental strength for a limited period, followed by total rest."
    }
  },
  "Sustenance Dose": {
    action: {
      mode: "guided",
      notes: "Provides one full day of nourishment."
    }
  },
  "Interra Shot": {
    action: {
      mode: "guided",
      notes: "Truth serum that opens the subconscious to interrogation."
    }
  },
  "Stim Dose": {
    action: {
      mode: "guided",
      status: "stim",
      ongoing: true,
      notes: "+3 physical strength and +1 dexterity for a short span."
    }
  },
  "Cur-in Dose": {
    action: {
      mode: "guided",
      notes: "Neutralizes poison or drug effects."
    }
  },
  "Suggestion Change": {
    action: {
      mode: "guided",
      notes: "Hypnotic drug that induces obedience."
    }
  },
  "Accelera Dose": {
    action: {
      mode: "healing",
      damageFormula: "1d10",
      notes: "Restores 1d10 lost hit points."
    }
  },
  "Anti-Radiation Serum": {
    action: {
      mode: "guided",
      notes: "Restores hit points lost to recent radiation exposure."
    }
  },
  "Rejuv Chamber": {
    action: {
      mode: "rejuv",
      notes: "Restores a patient according to current hit-point state."
    }
  },
  "Stasis Chamber": {
    action: {
      mode: "guided",
      status: "stasis",
      ongoing: true,
      notes: "Places the subject in suspended animation until released."
    }
  },
  "Life Ray": {
    action: {
      mode: "life-ray",
      notes: "50% chance to revive a dead target within 24 hours."
    }
  },
  "Civilian Internal Combustion Vehicle": {
    action: {
      mode: "guided",
      ongoing: true,
      notes: "Ground vehicle using recovered alcohol or fossil fuel."
    }
  },
  "Military Alcohol Combustion Vehicle": {
    action: {
      mode: "guided",
      ongoing: true,
      notes: "Military ground vehicle with limited anti-grav support."
    }
  },
  "Turbine Car": {
    action: {
      mode: "guided",
      ongoing: true,
      notes: "23rd-century turbine vehicle."
    }
  },
  "Hover Car": {
    action: {
      mode: "guided",
      status: "anti-grav",
      ongoing: true,
      notes: "Air-cushion passenger car."
    }
  },
  "Flit Car": {
    action: {
      mode: "guided",
      status: "anti-grav",
      ongoing: true,
      notes: "Air and ground vehicle with anti-grav circuits."
    }
  },
  "Environmental Car": {
    action: {
      mode: "guided",
      status: "anti-grav",
      ongoing: true,
      notes: "Government vehicle for land, sea, air, and space."
    }
  },
  "Bubble Car": {
    action: {
      mode: "guided",
      status: "anti-grav",
      ongoing: true,
      notes: "Elite solar-powered vessel for deep sea and deep space travel."
    }
  }
};

const ARTIFACT_DEFAULTS = {
  artifact: {
    isArtifact: false,
    category: "none",
    chart: "none",
    condition: "fair",
    functionChance: 0,
    canShortOut: true,
    canExplode: false,
    harmResolutionType: "generic",
    harmCallback: "",
    identified: false,
    operationKnown: false,
    attempts: 0,
    malfunction: "",
    powerSource: "none",
    power: powerProfile(),
    charges: {
      current: 0,
      max: 0
    }
  }
};

function inferredArtifactHazards(item, artifact = {}) {
  const name = String(item?.name ?? "").toLowerCase();
  const category = String(artifact.category ?? "none");

  const hazards = {
    canShortOut: true,
    canExplode: false,
    harmResolutionType: "generic",
    harmCallback: ""
  };

  if (["grenade", "bomb"].includes(category) || name.includes("missile")) {
    hazards.canShortOut = false;
    hazards.canExplode = true;
    hazards.harmResolutionType = "explosion";
    return hazards;
  }

  if ((item?.type === "weapon") || ["pistol", "rifle", "energyWeapon"].includes(category)) {
    hazards.harmResolutionType = "weapon-feedback";
  } else if (category === "armor") {
    hazards.harmResolutionType = "armor-feedback";
  } else if (category === "vehicle") {
    hazards.harmResolutionType = "vehicle-incident";
  } else if (category === "medical") {
    hazards.harmResolutionType = name.includes("life ray") ? "life-ray" : "medical-incident";
  } else if (category === "roboticUnit" || name.includes("robotoid") || name.includes("warbot") || name.includes("death machine") || name.includes("think tank")) {
    hazards.harmResolutionType = "robot-incident";
  } else if (category === "energyDevice") {
    hazards.harmResolutionType = name.includes("portent") ? "portent" : "energy-discharge";
  }

  return hazards;
}

const ARMOR_DEFAULTS = {
  field: {
    mode: "none",
    capacity: 0
  },
  mobility: {
    flight: 0,
    jump: 0,
    lift: 0
  },
  offense: {
    punchDamage: ""
  },
  protection: {
    blackRayImmune: false,
    radiationImmune: false,
    poisonImmune: false,
    laserImmune: false,
    mentalImmune: false
  },
  // Phase 5 — declarative damage-trait sets replace the protection
  // booleans. Initial empty arrays so new armor docs always have the
  // keys present.
  traits: {
    grantsResistance: [],
    grantsImmunity: [],
    grantsVulnerability: []
  },
  artifact: clone(ARTIFACT_DEFAULTS.artifact)
};

const GEAR_DEFAULTS = {
  action: {
    mode: "none",
    damageFormula: "",
    saveType: "",
    intensityFormula: "",
    radius: 0,
    durationFormula: "",
    acDelta: 0,
    toHitDelta: 0,
    status: "",
    consumeQuantity: 0,
    notes: ""
  },
  artifact: clone(ARTIFACT_DEFAULTS.artifact)
};

const WEAPON_DEFAULTS = {
  traits: {
    tag: "",
    deflectAc2Hits: 0,
    deflectAc1Hits: 0,
    bypassesForceField: false,
    requiresNoForceField: false,
    nonlethal: false
  },
  artifact: clone(ARTIFACT_DEFAULTS.artifact)
};

const WEAPON_ARTIFACTS = {
  "Slug Thrower (.38)": {
    category: "pistol",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 1 })
  },
  "Needler (Poison)": {
    category: "pistol",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 })
  },
  "Needler (Paralysis)": {
    category: "pistol",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 })
  },
  "Stun Ray Pistol": {
    category: "pistol",
    chart: "a",
    powerSource: "solar",
    power: powerProfile({ cells: ["solar"], slots: 1 }),
    charges: { current: 10, max: 10 }
  },
  "Laser Pistol": {
    category: "pistol",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 1 }),
    charges: { current: 10, max: 10 }
  },
  "Mark V Blaster": {
    category: "pistol",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 1 }),
    charges: { current: 5, max: 5 }
  },
  "Black Ray Gun": {
    category: "pistol",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 }),
    charges: { current: 4, max: 4 }
  },
  "Stun Rifle": {
    category: "rifle",
    chart: "a",
    powerSource: "solar",
    power: powerProfile({ cells: ["solar"], slots: 1 }),
    charges: { current: 5, max: 5 }
  },
  "Laser Rifle": {
    category: "rifle",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 1 }),
    charges: { current: 5, max: 5 }
  },
  "Mark VII Blaster Rifle": {
    category: "rifle",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 2 }),
    charges: { current: 5, max: 5 }
  },
  "Fusion Rifle": {
    category: "rifle",
    chart: "a",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 1 }),
    charges: { current: 10, max: 10 }
  },
  "Vibro Dagger": {
    category: "energyWeapon",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 1 }),
    charges: { current: 30, max: 30 }
  },
  "Vibro Blade": {
    category: "energyWeapon",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 1 }),
    charges: { current: 20, max: 20 }
  },
  "Energy Mace": {
    category: "energyWeapon",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 }),
    charges: { current: 15, max: 15 }
  },
  "Stun Whip": {
    category: "energyWeapon",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 }),
    charges: { current: 30, max: 30 }
  },
  "Powered Battle Fist": { category: "energyWeapon", chart: "a" },
  "Powered Attack Fist": { category: "energyWeapon", chart: "a" },
  "Powered Assault Fist": { category: "energyWeapon", chart: "a" },
  "Built-in Laser Pistol (Left)": {
    category: "pistol",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 1 }),
    charges: { current: 10, max: 10 }
  },
  "Built-in Laser Pistol (Right)": {
    category: "pistol",
    chart: "a",
    powerSource: "hydrogen",
    power: powerProfile({ cells: ["hydrogen"], slots: 1 }),
    charges: { current: 10, max: 10 }
  }
};

const ARMOR_ARTIFACTS = {
  "Sheath Armor": { category: "armor", chart: "b" },
  "Powered Plate": {
    category: "armor",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 1 })
  },
  "Powered Alloyed Plate": {
    category: "armor",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 1 })
  },
  "Plastic Armor": { category: "armor", chart: "b" },
  "Energized Armor": {
    category: "armor",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 1 })
  },
  "Inertia Armor": {
    category: "armor",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 2 })
  },
  "Powered Scout Armor": {
    category: "armor",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 2 })
  },
  "Powered Battle Armor": {
    category: "armor",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 2 })
  },
  "Powered Attack Armor": {
    category: "armor",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 2 })
  },
  "Powered Assault Armor": {
    category: "armor",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 3 })
  }
};

const GEAR_ARTIFACTS = {
  "Tear Gas Grenade": { category: "grenade", chart: "a" },
  "Stun Grenade": { category: "grenade", chart: "a" },
  "Poison Gas Grenade": { category: "grenade", chart: "a" },
  "Fragmentation Grenade": { category: "grenade", chart: "a" },
  "Chemical Explosive Grenade": { category: "grenade", chart: "a" },
  "Micro Missile": { category: "bomb", chart: "a" },
  "Mini Missile": { category: "bomb", chart: "a" },
  "Mutation Bomb": { category: "bomb", chart: "a" },
  "Built-in Micro Missile Rack": { category: "bomb", chart: "a" },
  "Energy Grenade": { category: "grenade", chart: "a" },
  "Photon Grenade": { category: "grenade", chart: "a" },
  "Torc Grenade": { category: "grenade", chart: "a" },
  "Small Damage Pack": { category: "bomb", chart: "a" },
  "Concentrated Damage Pack": { category: "bomb", chart: "a" },
  "Fusion Bomb": { category: "bomb", chart: "a" },
  "Concussion Bomb": { category: "bomb", chart: "a" },
  "Matter Bomb": { category: "bomb", chart: "a" },
  "Negation Bomb": { category: "bomb", chart: "a" },
  "Neutron Bomb": { category: "bomb", chart: "a" },
  "Trek Bomb": { category: "bomb", chart: "a" },
  "Surface Missile": { category: "bomb", chart: "a" },
  "Neutron Missile": { category: "bomb", chart: "a" },
  "Negation Missile": { category: "bomb", chart: "a" },
  "Fission Bomb": { category: "bomb", chart: "a" },
  "Fission Missile": { category: "bomb", chart: "a" },
  "Portent": {
    category: "energyDevice",
    chart: "a",
    powerSource: "solar",
    power: powerProfile({ cells: ["solar"], slots: 2 }),
    charges: { current: 24, max: 24 }
  },
  "Energy Cloak": {
    category: "energyDevice",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 }),
    charges: { current: 12, max: 12 }
  },
  "Control Baton": {
    category: "energyDevice",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 }),
    charges: { current: 24, max: 24 }
  },
  "Communications Sender": {
    category: "energyDevice",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical", "solar"], slots: 1, installedType: "chemical" }),
    charges: { current: 12, max: 12 }
  },
  "Medi-kit": {
    category: "medical",
    chart: "b",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 }),
    charges: { current: 4, max: 4 }
  },
  "Anti-grav Sled": {
    category: "energyDevice",
    chart: "a",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 1 }),
    charges: { current: 100, max: 100 }
  },
  "Ultra-violet and Infra-red Goggles": {
    category: "energyDevice",
    chart: "a",
    powerSource: "chemical",
    power: powerProfile({ cells: ["chemical"], slots: 1 }),
    charges: { current: 12, max: 12 }
  },
  "Chemical Energy Cell": { category: "energyDevice", chart: "a", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Solar Energy Cell": { category: "energyDevice", chart: "a", powerSource: "solar", charges: { current: 1, max: 1 } },
  "Hydrogen Energy Cell": { category: "energyDevice", chart: "a", powerSource: "hydrogen", charges: { current: 1, max: 1 } },
  "Atomic Energy Cell": { category: "energyDevice", chart: "a", powerSource: "nuclear", charges: { current: 1, max: 1 } },
  "Energy Cell Charger": {
    category: "energyDevice",
    chart: "b",
    powerSource: "none",
    power: powerProfile({ requirement: "ambient", ambientSource: "line-or-broadcast" })
  },
  "Pain Reducer": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Mind Booster": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Sustenance Dose": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Interra Shot": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Stim Dose": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Cur-in Dose": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Suggestion Change": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Accelera Dose": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Anti-Radiation Serum": { category: "medical", chart: "b", powerSource: "chemical", charges: { current: 1, max: 1 } },
  "Rejuv Chamber": { category: "medical", chart: "b", powerSource: "nuclear" },
  "Stasis Chamber": { category: "medical", chart: "b", powerSource: "nuclear" },
  "Life Ray": { category: "medical", chart: "c", powerSource: "nuclear" },
  "Civilian Internal Combustion Vehicle": { category: "vehicle", chart: "b" },
  "Military Alcohol Combustion Vehicle": { category: "vehicle", chart: "b" },
  "Turbine Car": { category: "vehicle", chart: "b" },
  "Hover Car": {
    category: "vehicle",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 1 })
  },
  "Flit Car": {
    category: "vehicle",
    chart: "b",
    powerSource: "nuclear",
    power: powerProfile({ cells: ["nuclear"], slots: 1 })
  },
  "Environmental Car": { category: "vehicle", chart: "c", powerSource: "nuclear" },
  "Bubble Car": {
    category: "vehicle",
    chart: "c",
    powerSource: "solar",
    power: powerProfile({ cells: ["solar"], slots: 1 }),
    charges: { current: 24, max: 24 }
  }
};

export function armorRuleForName(name) {
  return clone(ARMOR_RULES[name] ?? {});
}

export function gearRuleForName(name) {
  return clone(GEAR_RULES[name] ?? {});
}

export function weaponRuleForName(name) {
  return clone(WEAPON_RULES[name] ?? {});
}

export function gearHasAction(item) {
  return item?.type === "gear" && (item.system?.action?.mode ?? "none") !== "none";
}

export function getArmorRule(item) {
  return armorRuleForName(item?.name ?? "");
}

export function getGearRule(item) {
  return gearRuleForName(item?.name ?? "");
}

export function getWeaponRule(item) {
  return weaponRuleForName(item?.name ?? "");
}

function artifactDefaultsFor(item) {
  const defaults = clone(ARTIFACT_DEFAULTS);
  const table = item?.type === "weapon"
    ? WEAPON_ARTIFACTS
    : item?.type === "armor"
      ? ARMOR_ARTIFACTS
      : item?.type === "gear"
        ? GEAR_ARTIFACTS
        : {};
  const matched = clone(table[item?.name ?? ""] ?? {});
  if (!Object.keys(matched).length) return defaults;
  defaults.artifact.isArtifact = true;
  Object.assign(defaults.artifact, matched);
  const inferredHazards = inferredArtifactHazards(item, defaults.artifact);
  Object.assign(defaults.artifact, inferredHazards, {
    canShortOut: matched.canShortOut ?? inferredHazards.canShortOut,
    canExplode: matched.canExplode ?? inferredHazards.canExplode,
    harmResolutionType: matched.harmResolutionType ?? inferredHazards.harmResolutionType,
    harmCallback: matched.harmCallback ?? inferredHazards.harmCallback
  });
  defaults.artifact.functionChance = artifactFunctionChance(defaults.artifact.condition);
  return defaults;
}

function applyNamedArtifactDefaults(target, defaults) {
  if (!defaults?.isArtifact) return target;
  target.isArtifact = true;
  if (!target.category || (target.category === "none")) target.category = defaults.category;
  if (!target.chart || (target.chart === "none")) target.chart = defaults.chart;
  if (!target.condition) target.condition = defaults.condition ?? "fair";
  if (target.canShortOut == null) target.canShortOut = defaults.canShortOut ?? true;
  if (target.canExplode == null) target.canExplode = !!defaults.canExplode;
  if (!target.harmResolutionType) target.harmResolutionType = defaults.harmResolutionType ?? "generic";
  if (!target.harmCallback) target.harmCallback = defaults.harmCallback ?? "";
  if (!target.powerSource || (target.powerSource === "none")) target.powerSource = defaults.powerSource ?? "none";
  target.power ??= clone(ARTIFACT_DEFAULTS.artifact.power);
  if (((target.power.requirement ?? "none") === "none") && defaults.power?.requirement) {
    target.power.requirement = defaults.power.requirement;
  }
  if (!target.power.compatibleCells && defaults.power?.compatibleCells) {
    target.power.compatibleCells = defaults.power.compatibleCells;
  }
  if (!(Number(target.power.cellSlots ?? 0) > 0) && (Number(defaults.power?.cellSlots ?? 0) > 0)) {
    target.power.cellSlots = defaults.power.cellSlots;
  }
  if (!(Number(target.power.cellsInstalled ?? 0) > 0) && (Number(defaults.power?.cellsInstalled ?? 0) > 0)) {
    target.power.cellsInstalled = defaults.power.cellsInstalled;
  }
  if (((target.power.installedType ?? "none") === "none") && defaults.power?.installedType) {
    target.power.installedType = defaults.power.installedType;
  }
  if (((target.power.ambientSource ?? "none") === "none") && defaults.power?.ambientSource) {
    target.power.ambientSource = defaults.power.ambientSource;
  }
  if (target.power.ambientAvailable == null) {
    target.power.ambientAvailable = defaults.power?.ambientAvailable ?? false;
  }
  target.charges ??= { current: 0, max: 0 };
  if (!(Number(target.charges.max ?? 0) > 0) && (Number(defaults.charges?.max ?? 0) > 0)) {
    target.charges.max = defaults.charges.max;
    if (!(Number(target.charges.current ?? 0) > 0)) {
      target.charges.current = defaults.charges.current ?? defaults.charges.max;
    }
  }
  if (!(Number(target.functionChance) > 0)) {
    target.functionChance = Number(defaults.functionChance ?? 0) > 0
      ? defaults.functionChance
      : artifactFunctionChance(target.condition ?? defaults.condition ?? "fair");
  }
  return target;
}

function collectNamedArtifactUpdates(current, defaults, update) {
  if (!defaults?.isArtifact) return update;
  if (current?.isArtifact !== true) update["system.artifact.isArtifact"] = true;
  if (((current?.category ?? "none") === "none") && defaults.category) {
    update["system.artifact.category"] = defaults.category;
  }
  if (((current?.chart ?? "none") === "none") && defaults.chart) {
    update["system.artifact.chart"] = defaults.chart;
  }
  if (!current?.condition && defaults.condition) {
    update["system.artifact.condition"] = defaults.condition;
  }
  if (current?.canShortOut == null) {
    update["system.artifact.canShortOut"] = defaults.canShortOut ?? true;
  }
  if (current?.canExplode == null) {
    update["system.artifact.canExplode"] = !!defaults.canExplode;
  }
  if (!current?.harmResolutionType && defaults.harmResolutionType) {
    update["system.artifact.harmResolutionType"] = defaults.harmResolutionType;
  }
  if (!current?.harmCallback && defaults.harmCallback) {
    update["system.artifact.harmCallback"] = defaults.harmCallback;
  }
  if (((current?.powerSource ?? "none") === "none") && defaults.powerSource) {
    update["system.artifact.powerSource"] = defaults.powerSource;
  }
  if (((current?.power?.requirement ?? "none") === "none") && defaults.power?.requirement) {
    update["system.artifact.power.requirement"] = defaults.power.requirement;
  }
  if (!current?.power?.compatibleCells && defaults.power?.compatibleCells) {
    update["system.artifact.power.compatibleCells"] = defaults.power.compatibleCells;
  }
  if (!(Number(current?.power?.cellSlots ?? 0) > 0) && (Number(defaults.power?.cellSlots ?? 0) > 0)) {
    update["system.artifact.power.cellSlots"] = defaults.power.cellSlots;
  }
  if (!(Number(current?.power?.cellsInstalled ?? 0) > 0) && (Number(defaults.power?.cellsInstalled ?? 0) > 0)) {
    update["system.artifact.power.cellsInstalled"] = defaults.power.cellsInstalled;
  }
  if (((current?.power?.installedType ?? "none") === "none") && defaults.power?.installedType) {
    update["system.artifact.power.installedType"] = defaults.power.installedType;
  }
  if (((current?.power?.ambientSource ?? "none") === "none") && defaults.power?.ambientSource) {
    update["system.artifact.power.ambientSource"] = defaults.power.ambientSource;
  }
  if (current?.power?.ambientAvailable == null) {
    update["system.artifact.power.ambientAvailable"] = defaults.power?.ambientAvailable ?? false;
  }

  const currentMax = Number(current?.charges?.max ?? 0);
  if (!(currentMax > 0) && (Number(defaults.charges?.max ?? 0) > 0)) {
    update["system.artifact.charges.max"] = defaults.charges.max;
    if (!(Number(current?.charges?.current ?? 0) > 0)) {
      update["system.artifact.charges.current"] = defaults.charges.current ?? defaults.charges.max;
    }
  }

  if (!(Number(current?.functionChance ?? 0) > 0)) {
    update["system.artifact.functionChance"] = Number(defaults.functionChance ?? 0) > 0
      ? defaults.functionChance
      : artifactFunctionChance(current?.condition ?? defaults.condition ?? "fair");
  }
  return update;
}

/**
 * Infer a weapon category from the item's fields. Artifact items always
 * classify as "artifact"; items flagged as natural weapons map to "natural";
 * otherwise fall back to weapon class buckets.
 */
export function inferWeaponCategory(item) {
  if (item?.system?.artifact?.isArtifact) return "artifact";
  if (item?.flags?.["gamma-world-1e"]?.naturalWeapon) return "natural";
  const wc = Math.round(Number(item?.system?.weaponClass) || 0);
  if (wc >= 15) return "artifact";
  if (wc >= 10) return "modern";
  return "primitive";
}

const GEAR_SUBTYPE_PATTERNS = [
  [/\barrow|crossbow bolt|sling stone|sling bullet|slug-?thrower round|needler dart|gyrojet|javelin \(bundle\)|stun rifle cell/i, "ammunition"],
  [/\b(power|energy)\s+cell\b|\bpower pack\b|\bbattery\b|\benergy cell charger\b/i, "power-cell"],
  [/\bbackpack|satchel|pouch|ruck ?sack|saddlebag|hamper|bandolier/i, "container"],
  [/\bmedi-?kit|stim dose|pain reducer|mind booster|intera shot|sustenance dose|accelera dose|cur-?in dose|anti-?radiation serum|rejuv chamber|stasis chamber|life ray|bandage|splint|poultice|suggestion change/i, "medical"],
  [/\bgrenade|bomb\b|damage pack|explosive|mine|detonator/i, "explosive"],
  [/\brations|canteen|trail ration|iron ration|preserved food|water flask/i, "ration"],
  [/\bradio|flare|signal flag|whistle|semaphore|communicator/i, "communication"],
  [/\bcar\b|truck|bike|gyro|hover|chopper|copter|motorcycle|boat|skiff|flier|vehicle/i, "vehicle"],
  [/\brope|flint|shovel|crowbar|wrench|pickaxe|grappling|lockpick|magnifying|torch|lantern|bedroll|blanket|tent|mirror|lamp oil/i, "tool"],
  [/\bpre-?war|clockwork|book|bottle|domar|coin|trinket/i, "trade-good"]
];

export function inferGearSubtype(item) {
  const existing = item?.system?.subtype;
  if (existing && existing !== "misc") return existing;
  const name = String(item?.name ?? "");
  for (const [pattern, key] of GEAR_SUBTYPE_PATTERNS) {
    if (pattern.test(name)) return key;
  }
  return existing || "misc";
}

export function enrichEquipmentSystemData(item) {
  if (!item?.system) return item?.system ?? null;

  if (item.type === "armor") {
    const rule = getArmorRule(item);
    const artifactDefaults = artifactDefaultsFor(item);
    mergeDefaults(item.system, ARMOR_DEFAULTS);
    mergeDefaults(item.system, rule);
    mergeDefaults(item.system, artifactDefaults);
    applyNamedArtifactDefaults(item.system.artifact, artifactDefaults.artifact);
    if (rule.field?.mode && ((item.system.field?.mode ?? "none") === "none")) {
      item.system.field.mode = rule.field.mode;
    }
    if (item.system.artifact?.isArtifact && !(Number(item.system.artifact?.functionChance) > 0)) {
      item.system.artifact.functionChance = artifactFunctionChance(item.system.artifact.condition);
    }
  }

  if (item.type === "gear") {
    const rule = getGearRule(item);
    const artifactDefaults = artifactDefaultsFor(item);
    mergeDefaults(item.system, GEAR_DEFAULTS);
    mergeDefaults(item.system, rule);
    mergeDefaults(item.system, artifactDefaults);
    applyNamedArtifactDefaults(item.system.artifact, artifactDefaults.artifact);
    if (rule.action?.mode && ((item.system.action?.mode ?? "none") === "none")) {
      item.system.action.mode = rule.action.mode;
    }
    if (item.system.artifact?.isArtifact && !(Number(item.system.artifact?.functionChance) > 0)) {
      item.system.artifact.functionChance = artifactFunctionChance(item.system.artifact.condition);
    }
    // Infer subtype if not already set by the generator or rule.
    if (!item.system.subtype || item.system.subtype === "misc") {
      item.system.subtype = inferGearSubtype(item);
    }
  }

  if (item.type === "weapon") {
    const artifactDefaults = artifactDefaultsFor(item);
    mergeDefaults(item.system, WEAPON_DEFAULTS);
    mergeDefaults(item.system, getWeaponRule(item));
    mergeDefaults(item.system, artifactDefaults);
    applyNamedArtifactDefaults(item.system.artifact, artifactDefaults.artifact);
    const status = normalizedWeaponStatus(item);
    if (status) item.system.effect.status = status;
    if (item.system.artifact?.isArtifact && !(Number(item.system.artifact?.functionChance) > 0)) {
      item.system.artifact.functionChance = artifactFunctionChance(item.system.artifact.condition);
    }
    // Infer category if absent (the schema default of "primitive" is overwritten
    // only when the inference disagrees with the stored value and the stored
    // value was never explicitly chosen — here we simply always reconcile).
    if (!item.system.category || item.system.category === "primitive") {
      item.system.category = inferWeaponCategory(item);
    }
  }

  return item.system;
}

export function equipmentMigrationUpdate(item) {
  const system = item?._source?.system ?? item?.system;
  if (!system) return {};
  if (item.type === "armor") {
    const artifactDefaults = artifactDefaultsFor(item);
    const update = collectMissingUpdates(system, {
      ...ARMOR_DEFAULTS,
      ...getArmorRule(item),
      ...artifactDefaults
    });
    collectNamedArtifactUpdates(system.artifact ?? {}, artifactDefaults.artifact, update);
    const rule = getArmorRule(item);
    if (rule.field?.mode && ((system.field?.mode ?? "none") === "none") && (system.field?.mode !== rule.field.mode)) {
      update["system.field.mode"] = rule.field.mode;
    }
    return update;
  }

  if (item.type === "gear") {
    const artifactDefaults = artifactDefaultsFor(item);
    const update = collectMissingUpdates(system, {
      ...GEAR_DEFAULTS,
      ...getGearRule(item),
      ...artifactDefaults
    });
    collectNamedArtifactUpdates(system.artifact ?? {}, artifactDefaults.artifact, update);
    const rule = getGearRule(item);
    if (rule.action?.mode && ((system.action?.mode ?? "none") === "none") && (system.action?.mode !== rule.action.mode)) {
      update["system.action.mode"] = rule.action.mode;
    }
    return update;
  }

  if (item.type === "weapon") {
    const artifactDefaults = artifactDefaultsFor(item);
    const update = collectMissingUpdates(system, {
      ...WEAPON_DEFAULTS,
      ...getWeaponRule(item),
      ...artifactDefaults
    });
    collectNamedArtifactUpdates(system.artifact ?? {}, artifactDefaults.artifact, update);
    const status = normalizedWeaponStatus(item);
    if (status && (system.effect?.status !== status)) update["system.effect.status"] = status;
    return update;
  }

  return {};
}

export function grantedItemSourcesForArmor(item) {
  const rule = getArmorRule(item);
  const grantedItems = rule.grantedItems ?? [];
  return grantedItems.map((source) => {
    const copy = clone(source);
    copy._id ??= stableGrantedItemId(item.id, source.name, source.type);
    copy.flags ??= {};
    copy.flags[SYSTEM_ID] ??= {};
    copy.flags[SYSTEM_ID].grantedBy = item.id;
    copy.flags[SYSTEM_ID].grantedByName = item.name;
    if (copy.system?.equipped != null) copy.system.equipped = true;
    return copy;
  });
}

async function performGrantedItemSync(actor) {
  if (!(actor instanceof Actor) || !["character", "monster"].includes(actor.type)) return;

  const desired = new Map();
  for (const item of actor.items.filter((entry) => entry.type === "armor" && entry.system.equipped)) {
    for (const source of grantedItemSourcesForArmor(item)) {
      desired.set(`${item.id}:${source.name}:${source.type}`, { owner: item, source });
    }
  }

  const existingGranted = actor.items.filter((item) => item.flags?.[SYSTEM_ID]?.grantedBy);
  const seenGranted = new Set();
  const deletions = [];
  for (const item of existingGranted) {
    const key = `${item.flags[SYSTEM_ID].grantedBy}:${item.name}:${item.type}`;
    if (!desired.has(key) || seenGranted.has(key)) {
      deletions.push(item.id);
      continue;
    }
    seenGranted.add(key);
  }

  if (deletions.length) {
    await actor.deleteEmbeddedDocuments("Item", deletions, { gammaWorldSync: true });
  }

  const creations = [];
  for (const [key, { source }] of desired.entries()) {
    const exists = actor.items.find((item) => (
      item.flags?.[SYSTEM_ID]?.grantedBy === source.flags[SYSTEM_ID].grantedBy
      && item.name === source.name
      && item.type === source.type
    ));
    if (!exists) creations.push(source);
  }

  if (creations.length) {
    await actor.createEmbeddedDocuments("Item", creations, { gammaWorldSync: true });
  }
}

export async function syncGrantedItems(actor) {
  if (!(actor instanceof Actor) || !["character", "monster"].includes(actor.type)) return;

  const key = actor.uuid ?? actor.id;
  const prior = grantedItemSyncs.get(key) ?? Promise.resolve();
  const next = prior
    .catch(() => {})
    .then(() => performGrantedItemSync(actor));

  grantedItemSyncs.set(key, next);
  try {
    await next;
  } finally {
    if (grantedItemSyncs.get(key) === next) grantedItemSyncs.delete(key);
  }
}

export function applyEquipmentModifiers(actor, derived) {
  const equippedArmor = actor.items.filter((item) => item.type === "armor" && item.system.equipped);

  derived.hazardProtection ??= {
    radiation: false,
    poison: false,
    blackRay: false
  };

  for (const armor of equippedArmor) {
    if (Number(armor.system.mobility?.flight ?? 0) > 0) {
      derived.flightSpeed = Math.max(derived.flightSpeed, Number(armor.system.mobility.flight ?? 0));
      derived.movementBase = Math.max(derived.movementBase, Number(armor.system.mobility.flight ?? 0));
    }
    if (Number(armor.system.mobility?.jump ?? 0) > 0) {
      derived.jumpSpeed = Math.max(Number(derived.jumpSpeed ?? 0), Number(armor.system.mobility.jump ?? 0));
    }
    if (Number(armor.system.mobility?.lift ?? 0) > 0) {
      derived.liftCapacity = Math.max(Number(derived.liftCapacity ?? 0), Number(armor.system.mobility.lift ?? 0));
    }
    if (armor.system.protection?.radiationImmune) derived.hazardProtection.radiation = true;
    if (armor.system.protection?.poisonImmune) derived.hazardProtection.poison = true;
    if (armor.system.protection?.blackRayImmune) derived.hazardProtection.blackRay = true;
    if (armor.system.protection?.laserImmune) derived.laserImmune = true;
    if (armor.system.protection?.mentalImmune) derived.mentalImmune = true;
  }
}
