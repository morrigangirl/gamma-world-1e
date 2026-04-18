import test from "node:test";
import assert from "node:assert/strict";

import {
  addDiceToFormula,
  addFlatBonusToFormula,
  addPerDieBonusToFormula,
  doubleDiceInFormula,
  parseSimpleDiceFormula,
  scaleFormula
} from "../module/formulas.mjs";
import {
  mentalAttackTarget,
  naturalAttackTarget,
  weaponAttackTarget
} from "../module/tables/combat-matrix.mjs";
import {
  describePoisonOutcome,
  describeRadiationOutcome,
  resolvePoison,
  resolveRadiation
} from "../module/tables/resistance-tables.mjs";
import {
  evaluateSaveForActor,
  saveContextForActor,
  preferredSaveUserId,
  shouldRouteHpReduction
} from "../module/save-flow.mjs";
import {
  findMutationByPercentile,
  mutationEntriesFor,
  pickMutation,
  specialMutationRoll
} from "../module/tables/mutation-tables.mjs";
import {
  armorRuleForName,
  equipmentMigrationUpdate,
  gearRuleForName,
  gearHasAction,
  weaponRuleForName
} from "../module/equipment-rules.mjs";
import { artifactPowerStatus, compatibleCellTypes } from "../module/artifact-power.mjs";
import { resolvePilotAnimationKey } from "../module/animations.mjs";
import {
  artifactDisplayName,
  artifactElapsedMinutes,
  artifactIdentityKnown,
  artifactIntelligenceModifier,
  artifactOperationKnown,
  artifactUseProfileForChart,
  clampArtifactUseRoll
} from "../module/artifact-rules.mjs";
import { getMutationRule } from "../module/mutation-rules.mjs";
import { onHitEffectDescriptor } from "../module/on-hit-effects.mjs";
import { determineRangeBand } from "../module/range.mjs";
import { artifactDifficulty, artifactFunctionChance } from "../module/tables/artifact-tables.mjs";
import {
  artifactChartFinishNode,
  artifactChartHarmNode,
  artifactChartStartNode,
  resolveArtifactChartStep
} from "../module/tables/artifact-flowcharts.mjs";
import {
  charismaReactionAdjustment,
  moraleThreshold,
  reactionResult,
  resolveEncounterIntelligence,
  routeEncounterResult,
  terrainEncounterEntry
} from "../module/tables/encounter-tables.mjs";
import { fiveEInitiativeFormula, initiativeAbilityModifier, initiativeBonusFromDexterity } from "../module/initiative.mjs";
import {
  TOKEN_DISPLAY_MODES,
  prototypeTokenMigrationUpdate
} from "../module/token-defaults.mjs";
import { equipmentPackSources, actorPackSources, journalPackSources, monsterPackSources } from "../scripts/compendium-content.mjs";

test("simple dice helpers rewrite formulas predictably", () => {
  assert.deepEqual(parseSimpleDiceFormula("2d6+3"), { count: 2, faces: 6, modifier: 3 });
  assert.equal(addDiceToFormula("1d8", 2), "3d8");
  assert.equal(addFlatBonusToFormula("1d8", 3), "1d8+3");
  assert.equal(addPerDieBonusToFormula("2d6", 3), "2d6+6");
  assert.equal(scaleFormula("2d4+1", 3), "6d4+3");
});

test("doubleDiceInFormula doubles dice counts but leaves flat bonuses alone", () => {
  assert.equal(doubleDiceInFormula("1d6"), "2d6");
  assert.equal(doubleDiceInFormula("2d10"), "4d10");
  assert.equal(doubleDiceInFormula("1d6+2"), "2d6+2");
  assert.equal(doubleDiceInFormula("2d6+3"), "4d6+3");
  assert.equal(doubleDiceInFormula("3d4+1d6"), "6d4+2d6");
  assert.equal(doubleDiceInFormula("1d8+1d6+3"), "2d8+2d6+3");
  assert.equal(doubleDiceInFormula("1d6+1d4-1"), "2d6+2d4-1");
  assert.equal(doubleDiceInFormula("d6"), "2d6");
  assert.equal(doubleDiceInFormula(""), "");
  assert.equal(doubleDiceInFormula("5"), "5");
});

test("determineRangeBand handles melee, unlimited, boundary distances, and out-of-range", () => {
  // Melee weapons ignore distance entirely.
  assert.deepEqual(
    determineRangeBand({ system: { attackType: "melee", range: { short: 0, medium: 0, long: 0 } } }, 0),
    { label: "melee", penalty: 0 }
  );
  assert.deepEqual(
    determineRangeBand({ system: { attackType: "melee", range: { short: 0, medium: 0, long: 0 } } }, 500),
    { label: "melee", penalty: 0 }
  );

  // Weapon without any configured range -> unlimited.
  assert.deepEqual(
    determineRangeBand({ system: { attackType: "ranged", range: { short: 0, medium: 0, long: 0 } } }, 100),
    { label: "unlimited", penalty: 0 }
  );

  // Laser pistol-ish profile: short 15, medium 30, long 60.
  const laser = { system: { attackType: "energy", range: { short: 15, medium: 30, long: 60 } } };
  assert.deepEqual(determineRangeBand(laser, 0), { label: "short", penalty: 0 });
  assert.deepEqual(determineRangeBand(laser, 15), { label: "short", penalty: 0 });
  assert.deepEqual(determineRangeBand(laser, 16), { label: "medium", penalty: -2 });
  assert.deepEqual(determineRangeBand(laser, 30), { label: "medium", penalty: -2 });
  assert.deepEqual(determineRangeBand(laser, 31), { label: "long", penalty: -5 });
  assert.deepEqual(determineRangeBand(laser, 60), { label: "long", penalty: -5 });
  assert.deepEqual(determineRangeBand(laser, 61), { label: "out", penalty: -999 });

  // Weapon with only a short range falls back to 2×short for the long band.
  const thrown = { system: { attackType: "thrown", range: { short: 10, medium: 0, long: 0 } } };
  assert.deepEqual(determineRangeBand(thrown, 5), { label: "short", penalty: 0 });
  assert.deepEqual(determineRangeBand(thrown, 10), { label: "short", penalty: 0 });
  assert.deepEqual(determineRangeBand(thrown, 15), { label: "long", penalty: -5 });
  assert.deepEqual(determineRangeBand(thrown, 20), { label: "long", penalty: -5 });
  assert.deepEqual(determineRangeBand(thrown, 21), { label: "out", penalty: -999 });
});

test("onHitEffectDescriptor maps canonical effect modes, allows item overrides, and skips damage/note", () => {
  // Pass-through modes (no automated follow-up) return null so the attack
  // flow keeps its manual button / damage-card path.
  assert.equal(onHitEffectDescriptor({ effectMode: "" }), null);
  assert.equal(onHitEffectDescriptor({ effectMode: "damage" }), null);
  assert.equal(onHitEffectDescriptor({ effectMode: "note" }), null);
  assert.equal(onHitEffectDescriptor(null), null);
  assert.equal(onHitEffectDescriptor({ effectMode: "nonsense" }), null);

  // Save-only modes: poison / radiation / mental delegate to the hazard chain,
  // so needsSave stays false and the descriptor mostly labels the card.
  assert.deepEqual(onHitEffectDescriptor({ effectMode: "poison" }), {
    mode: "poison",
    saveType: "poison",
    statusId: "poisoned",
    durationFormula: "",
    needsSave: false
  });
  assert.deepEqual(onHitEffectDescriptor({ effectMode: "radiation" }), {
    mode: "radiation",
    saveType: "radiation",
    statusId: "irradiated",
    durationFormula: "",
    needsSave: false
  });
  assert.deepEqual(onHitEffectDescriptor({ effectMode: "mental" }), {
    mode: "mental",
    saveType: "mental",
    statusId: "stunned",
    durationFormula: "1d4",
    needsSave: false
  });

  // Stun / paralysis interpose a physique (poison-track) save. Status IDs
  // mirror what rollDamageFromFlags applies when no item override is present.
  assert.deepEqual(onHitEffectDescriptor({ effectMode: "stun" }), {
    mode: "stun",
    saveType: "poison",
    statusId: "unconscious",
    durationFormula: "1d6",
    needsSave: true
  });
  assert.deepEqual(onHitEffectDescriptor({ effectMode: "paralysis" }), {
    mode: "paralysis",
    saveType: "poison",
    statusId: "paralysis",
    durationFormula: "1d10",
    needsSave: true
  });

  // Death bypasses the condition flow — rollDamageFromFlags handles the KO.
  assert.deepEqual(onHitEffectDescriptor({ effectMode: "death" }), {
    mode: "death",
    saveType: null,
    statusId: null,
    durationFormula: "",
    needsSave: false
  });

  // Item-side overrides on effectFormula / effectStatus win over defaults.
  assert.deepEqual(
    onHitEffectDescriptor({
      effectMode: "paralysis",
      effectFormula: "2d6",
      effectStatus: "custom-paralysis"
    }),
    {
      mode: "paralysis",
      saveType: "poison",
      statusId: "custom-paralysis",
      durationFormula: "2d6",
      needsSave: true
    }
  );

  // Accepts the item-like shape (system.effect.*) as well as the flag shape.
  assert.deepEqual(
    onHitEffectDescriptor({ system: { effect: { mode: "stun", formula: "3d6" } } }),
    {
      mode: "stun",
      saveType: "poison",
      statusId: "unconscious",
      durationFormula: "3d6",
      needsSave: true
    }
  );
});

test("combat matrices return known table values", () => {
  assert.equal(weaponAttackTarget(3, 9), 10);
  assert.equal(weaponAttackTarget(13, 1), 12);
  assert.equal(naturalAttackTarget(1, 10), 10);
  assert.equal(naturalAttackTarget(12, 6), 9);
  assert.equal(mentalAttackTarget(18, 3), "A");
  assert.equal(mentalAttackTarget(3, 18), "NE");
  assert.equal(mentalAttackTarget(10, 10), 10);
});

test("hazard matrices resolve real Gamma World outcomes", () => {
  const poison = resolvePoison(12, 10);
  assert.equal(poison.outcome, 2);
  assert.equal(describePoisonOutcome(poison), "2d6 poison damage.");

  const radiation = resolveRadiation(18, 16);
  assert.equal(radiation.outcome, "M");
  assert.equal(describeRadiationOutcome(radiation), "Gain one new mutation.");
});

test("save helpers prefer active owners, use derived mental resistance, and guard HP loss", () => {
  const actor = {
    ownership: {
      alpha: 3,
      zeta: 3,
      default: 0
    }
  };
  const users = [
    { id: "gm-b", active: true, isGM: true },
    { id: "zeta", active: true, isGM: false },
    { id: "alpha", active: true, isGM: false }
  ];
  assert.equal(preferredSaveUserId(actor, users), "alpha");
  assert.equal(preferredSaveUserId(actor, [
    { id: "gm-b", active: true, isGM: true },
    { id: "alpha", active: false, isGM: false }
  ]), "gm-b");

  const defender = {
    gw: { mentalResistance: 14 },
    system: {
      resources: { mentalResistance: 8 },
      attributes: { ms: { value: 6 } }
    }
  };
  const resisted = evaluateSaveForActor(defender, "mental", 10, { rollTotal: 9 });
  assert.equal(resisted.targetNumber, mentalAttackTarget(10, 14));
  assert.equal(resisted.success, true);

  const failed = evaluateSaveForActor(defender, "mental", 10, { rollTotal: resisted.targetNumber });
  assert.equal(failed.success, false);

  assert.equal(shouldRouteHpReduction({ currentHp: 10, nextHp: 7, isGM: false }), true);
  assert.equal(shouldRouteHpReduction({ currentHp: 10, nextHp: 12, isGM: false }), false);
  assert.equal(shouldRouteHpReduction({ currentHp: 10, nextHp: 7, isGM: true }), false);
});

test("save helpers apply extra mental saves and derived radiation modifiers", () => {
  const actor = {
    system: {
      attributes: {
        ms: { value: 10 },
        cn: { value: 12 }
      }
    },
    items: [
      { type: "mutation", name: "Dual Brain", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Heightened Brain Talent", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Mental Defense Shield", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Heightened Constitution", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Will Force", system: { activation: { enabled: true }, reference: { variant: "cn" } } }
    ]
  };

  const mentalContext = saveContextForActor(actor, "mental");
  assert.equal(mentalContext.resistance, 14);
  assert.equal(mentalContext.attemptCount, 4);

  const radiationContext = saveContextForActor(actor, "radiation");
  assert.equal(radiationContext.resistance, 18);

  const targetNumber = mentalAttackTarget(10, mentalContext.resistance);
  const evaluation = evaluateSaveForActor(actor, "mental", 10, {
    rollTotals: [targetNumber, targetNumber - 1]
  });
  assert.equal(evaluation.success, true);
  assert.deepEqual(evaluation.rollTotals, [targetNumber, targetNumber - 1]);
});

test("mutation tables expose complete, typed entries", () => {
  assert.equal(mutationEntriesFor("physical", "humanoid").length, 49);
  assert.equal(mutationEntriesFor("mental", "mutated-animal").length, 49);
  assert.equal(findMutationByPercentile("mental", "humanoid", 56)?.name, "Mental Blast");
  assert.equal(findMutationByPercentile("physical", "humanoid", 1)?.name, "Attraction Odor");
});

test("special mutation rolls reroll defects or pick a beneficial result", () => {
  assert.equal(specialMutationRoll("physical", "humanoid", 92), "good");
  assert.equal(specialMutationRoll("mental", "humanoid", 100), "pick");

  const picked = pickMutation("mental", {
    characterType: "humanoid",
    percentile: 100,
    rng: () => 0
  });
  assert.equal(picked.entry.category, "beneficial");

  const rerolled = pickMutation("physical", {
    characterType: "humanoid",
    percentile: 91,
    rng: () => 0
  });
  assert.equal(rerolled.entry.category, "beneficial");
});

test("equipment rules expose automation defaults for known gear", () => {
  assert.equal(weaponRuleForName("Laser Pistol").traits.tag, "laser");
  assert.equal(armorRuleForName("Inertia Armor").field.mode, "partial");
  assert.equal(gearRuleForName("Tear Gas Grenade").action.mode, "tear-gas-cloud");
  assert.equal(gearHasAction({ type: "gear", system: { action: { mode: "area-damage" } } }), true);
});

test("pilot animation registry resolves expanded weapons, ordnance, and support profiles", () => {
  assert.equal(resolvePilotAnimationKey("Laser Pistol", { kind: "weapon" }), "Laser Pistol");
  assert.equal(resolvePilotAnimationKey("Built-in Laser Pistol (Left)", { kind: "weapon" }), "Laser Pistol");
  assert.equal(resolvePilotAnimationKey("Club", { kind: "weapon" }), "Club");
  assert.equal(resolvePilotAnimationKey("Spear", { kind: "weapon" }), "Spear");
  assert.equal(resolvePilotAnimationKey("Battle Axe", { kind: "weapon" }), "Battle Axe");
  assert.equal(resolvePilotAnimationKey("Hand Axe", { kind: "weapon" }), "Hand Axe");
  assert.equal(resolvePilotAnimationKey("Dagger", { kind: "weapon" }), "Dagger");
  assert.equal(resolvePilotAnimationKey("Long Sword", { kind: "weapon" }), "Long Sword");
  assert.equal(resolvePilotAnimationKey("Short Sword", { kind: "weapon" }), "Short Sword");
  assert.equal(resolvePilotAnimationKey("Pole Arm", { kind: "weapon" }), "Pole Arm");
  assert.equal(resolvePilotAnimationKey("Javelin", { kind: "weapon" }), "Javelin");
  assert.equal(resolvePilotAnimationKey("Bow and Arrows", { kind: "weapon" }), "Bow and Arrows");
  assert.equal(resolvePilotAnimationKey("Crossbow", { kind: "weapon" }), "Crossbow");
  assert.equal(resolvePilotAnimationKey("Sling Stones", { kind: "weapon" }), "Sling Stones");
  assert.equal(resolvePilotAnimationKey("Sling Bullets", { kind: "weapon" }), "Sling Bullets");
  assert.equal(resolvePilotAnimationKey("Laser Rifle", { kind: "weapon" }), "Laser Rifle");
  assert.equal(resolvePilotAnimationKey("Fusion Rifle", { kind: "weapon" }), "Fusion Rifle");
  assert.equal(resolvePilotAnimationKey("Powered Assault Fist", { kind: "weapon" }), "Powered Assault Fist");
  assert.equal(resolvePilotAnimationKey("Black Ray Gun", { kind: "weapon" }), "Black Ray Gun");
  assert.equal(resolvePilotAnimationKey("Built-in Micro Missile Rack", { kind: "gear" }), "Built-in Micro Missile Rack");
  assert.equal(resolvePilotAnimationKey("Tear Gas Grenade", { kind: "gear" }), "Tear Gas Grenade");
  assert.equal(resolvePilotAnimationKey("Life Ray", { kind: "gear" }), "Life Ray");
  assert.equal(resolvePilotAnimationKey("Energy Cloak", { kind: "gear" }), "Energy Cloak");
  assert.equal(resolvePilotAnimationKey("Force Field Generation", { kind: "mutation" }), "Force Field Generation");
  assert.equal(resolvePilotAnimationKey("Stone Spear", { kind: "weapon" }), "");
});

test("animation registry covers every bundled weapon entry", () => {
  const uncovered = equipmentPackSources()
    .filter((item) => item.type === "weapon")
    .map((item) => item.name)
    .filter((name) => !resolvePilotAnimationKey(name, { kind: "weapon" }));

  assert.deepEqual(uncovered, []);
});

test("mutation rules mark special actions as interactive", () => {
  assert.equal(getMutationRule("Density Control (Others)").action, "density-control-others");
  assert.equal(getMutationRule("Mental Control").action, "mental-control");
  assert.equal(getMutationRule("Chameleon Powers").mode, "toggle");
});

test("artifact and encounter helpers expose book-facing table values", () => {
  assert.equal(artifactFunctionChance("poor"), 20);
  assert.equal(artifactFunctionChance("perfect"), 100);
  assert.equal(artifactDifficulty("a"), 10);
  assert.equal(artifactDifficulty("c"), 16);
  assert.equal(charismaReactionAdjustment(4), -2);
  assert.equal(charismaReactionAdjustment(18), 3);
  assert.equal(reactionResult(2).key, "2");
  assert.equal(reactionResult(12).key, "12");
  assert.equal(moraleThreshold("non-intelligent"), 5);
  assert.equal(moraleThreshold("semi-intelligent"), 4);
  assert.equal(moraleThreshold("intelligent"), 3);

  const clearEncounter = terrainEncounterEntry("clear", 1);
  assert.equal(clearEncounter.name, "Yexil");
  assert.equal(clearEncounter.countText, "1-4");

  const ruinsEncounter = terrainEncounterEntry("ruins", 13);
  assert.equal(ruinsEncounter.name, "No Encounter");

  const routeEncounter = routeEncounterResult("zones", { checkRoll: 6, encounterRoll: 10, period: "night" });
  assert.equal(routeEncounter.encountered, true);
  assert.equal(routeEncounter.encounter.name, "Cryptic Alliance");
  assert.equal(routeEncounter.period, "night");
});

test("artifact flowcharts resolve exact public node transitions", () => {
  assert.equal(artifactChartStartNode("A"), "1");
  assert.equal(artifactChartFinishNode("A"), "5");
  assert.equal(artifactChartHarmNode("A"), "9");
  assert.deepEqual(resolveArtifactChartStep("A", "1", 7), {
    chartId: "A",
    from: "1",
    to: "2",
    transition: { min: 1, max: 7, to: "2", label: "1-7", returnAlias: "", note: "", from: "1" },
    note: "advance",
    isSuccess: false,
    isHarm: false
  });
  assert.equal(resolveArtifactChartStep("A", "8", 6).note, "return");
  assert.equal(resolveArtifactChartStep("B", "12", 10).isHarm, true);
  assert.equal(resolveArtifactChartStep("C", "20", 7).to, "9");
  assert.equal(resolveArtifactChartStep("C", "18", 2).isSuccess, true);
});

test("artifact use profile applies RAW modifiers, instant charts, and timing", () => {
  const actor = {
    system: {
      attributes: { in: { value: 18 } }
    },
    items: [
      { type: "mutation", name: "Dual Brain", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Genius Capability", system: { activation: { enabled: true }, reference: { variant: "scientific" } } },
      { type: "mutation", name: "Heightened Intelligence", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Heightened Brain Talent", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Molecular Understanding", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Heightened Touch", system: { activation: { enabled: true }, reference: {} } }
    ]
  };

  assert.equal(artifactIntelligenceModifier(18), -3);
  assert.equal(clampArtifactUseRoll(-2), 1);
  assert.equal(clampArtifactUseRoll(17), 10);

  const profileA = artifactUseProfileForChart(actor, "A");
  assert.equal(profileA.modifier, -7);
  assert.equal(profileA.speedMultiplier, 3);
  assert.equal(profileA.instantCharts.has("A"), true);
  assert.equal(profileA.notes.includes("Heightened Touch"), true);

  const profileB = artifactUseProfileForChart(actor, "B");
  assert.equal(profileB.modifier, -9);
  assert.equal(artifactElapsedMinutes({ rollsThisAttempt: 10, helperCount: 0, speedMultiplier: profileB.speedMultiplier }), 40);
  assert.equal(artifactElapsedMinutes({ rollsThisAttempt: 12, helperCount: 1, speedMultiplier: 1 }), 120);
});

test("artifact display helpers keep unidentified items unknown until operation is learned", () => {
  const unknownArtifact = {
    name: "Portent",
    system: {
      artifact: {
        isArtifact: true,
        identified: false,
        operationKnown: false
      }
    }
  };
  const staleIdentityArtifact = {
    name: "Portent",
    system: {
      artifact: {
        isArtifact: true,
        identified: true,
        operationKnown: false
      }
    }
  };
  const knownArtifact = {
    name: "Portent",
    system: {
      artifact: {
        isArtifact: true,
        identified: true,
        operationKnown: true
      }
    }
  };

  assert.equal(artifactIdentityKnown(unknownArtifact), false);
  assert.equal(artifactOperationKnown(unknownArtifact), false);
  assert.equal(artifactDisplayName(unknownArtifact, { unknownLabel: "Unknown Artifact" }), "Unknown Artifact");
  assert.equal(artifactIdentityKnown(staleIdentityArtifact), false);
  assert.equal(artifactDisplayName(staleIdentityArtifact, { unknownLabel: "Unknown Artifact" }), "Unknown Artifact");
  assert.equal(artifactIdentityKnown(knownArtifact), true);
  assert.equal(artifactOperationKnown(knownArtifact), true);
  assert.equal(artifactDisplayName(knownArtifact, { unknownLabel: "Unknown Artifact" }), "Portent");
});

test("encounter intelligence resolves from explicit overrides and actor context", () => {
  const robot = {
    system: {
      details: { type: "robot", creatureClass: "", speech: "" },
      social: { languages: "" },
      encounter: { intelligence: "auto" },
      robotics: { isRobot: true }
    }
  };
  const beast = {
    system: {
      details: { type: "mutated-animal", creatureClass: "", speech: "" },
      social: { languages: "" },
      encounter: { intelligence: "auto" },
      robotics: { isRobot: false }
    }
  };
  const smartBeast = {
    system: {
      details: { type: "mutated-animal", creatureClass: "", speech: "telepathy" },
      social: { languages: "" },
      encounter: { intelligence: "auto" },
      robotics: { isRobot: false }
    }
  };
  const override = {
    system: {
      details: { type: "mutated-animal", creatureClass: "", speech: "" },
      social: { languages: "" },
      encounter: { intelligence: "semi-intelligent" },
      robotics: { isRobot: false }
    }
  };

  assert.equal(resolveEncounterIntelligence(robot), "intelligent");
  assert.equal(resolveEncounterIntelligence(beast), "non-intelligent");
  assert.equal(resolveEncounterIntelligence(smartBeast), "intelligent");
  assert.equal(resolveEncounterIntelligence(override), "semi-intelligent");
});

test("artifact defaults promote named ancient items and backfill stale records", () => {
  const equipment = equipmentPackSources();
  const portent = equipment.find((entry) => entry.name === "Portent");
  const laserRifle = equipment.find((entry) => entry.name === "Laser Rifle");
  const charger = equipment.find((entry) => entry.name === "Energy Cell Charger");
  const attackArmor = equipment.find((entry) => entry.name === "Powered Attack Armor");

  assert.equal(portent.system.artifact.isArtifact, true);
  assert.equal(portent.system.artifact.category, "energyDevice");
  assert.equal(portent.system.artifact.chart, "a");
  assert.equal(portent.system.artifact.powerSource, "solar");
  assert.equal(laserRifle.system.artifact.isArtifact, true);
  assert.equal(laserRifle.system.artifact.category, "rifle");
  assert.deepEqual(compatibleCellTypes(portent), ["solar"]);
  assert.equal(portent.system.artifact.power.cellSlots, 2);
  assert.equal(attackArmor.system.artifact.power.cellSlots, 2);
  assert.equal(charger.system.artifact.power.requirement, "ambient");
  assert.equal(charger.system.artifact.power.ambientSource, "line-or-broadcast");

  const stalePortent = {
    type: "gear",
    name: "Portent",
    system: {
      action: { mode: "portent" },
      artifact: {
        isArtifact: false,
        category: "none",
        chart: "none",
        condition: "fair",
        functionChance: 40,
        identified: false,
        operationKnown: false,
        attempts: 0,
        malfunction: "",
        powerSource: "none",
        power: {
          requirement: "none",
          compatibleCells: "",
          cellSlots: 0,
          cellsInstalled: 0,
          installedType: "none",
          ambientSource: "none",
          ambientAvailable: false
        },
        charges: { current: 24, max: 24 }
      }
    }
  };

  const migration = equipmentMigrationUpdate(stalePortent);
  assert.equal(migration["system.artifact.isArtifact"], true);
  assert.equal(migration["system.artifact.category"], "energyDevice");
  assert.equal(migration["system.artifact.chart"], "a");
  assert.equal(migration["system.artifact.powerSource"], "solar");
  assert.equal(migration["system.artifact.power.requirement"], "cells");
  assert.equal(migration["system.artifact.power.cellSlots"], 2);
  assert.equal(migration["system.artifact.power.cellsInstalled"], 2);
  assert.equal(migration["system.artifact.canShortOut"], true);
  assert.equal(migration["system.artifact.harmResolutionType"], "portent");
});

test("artifact power states distinguish cells, ambient power, and depletion", () => {
  const charger = {
    name: "Energy Cell Charger",
    system: {
      artifact: {
        powerSource: "broadcast",
        power: {
          requirement: "ambient",
          compatibleCells: "",
          cellSlots: 0,
          cellsInstalled: 0,
          installedType: "none",
          ambientSource: "line-or-broadcast",
          ambientAvailable: false
        },
        charges: { current: 0, max: 0 }
      }
    }
  };
  const laserPistol = {
    name: "Laser Pistol",
    system: {
      artifact: {
        powerSource: "hydrogen",
        power: {
          requirement: "cells",
          compatibleCells: "hydrogen",
          cellSlots: 1,
          cellsInstalled: 1,
          installedType: "hydrogen",
          ambientSource: "none",
          ambientAvailable: false
        },
        charges: { current: 0, max: 10 }
      }
    }
  };

  assert.equal(artifactPowerStatus(charger).powered, false);
  assert.equal(artifactPowerStatus(charger).reason, "ambient");
  assert.equal(artifactPowerStatus(laserPistol).powered, false);
  assert.equal(artifactPowerStatus(laserPistol).reason, "depleted");
});

test("initiative helpers expose 5e-style initiative and Gamma World surprise bonus", () => {
  assert.equal(fiveEInitiativeFormula(), "1d20 + @attributes.dx.mod");
  assert.equal(initiativeAbilityModifier(8), -1);
  assert.equal(initiativeAbilityModifier(10), 0);
  assert.equal(initiativeAbilityModifier(17), 3);
  assert.equal(initiativeBonusFromDexterity(16), 0);
  assert.equal(initiativeBonusFromDexterity(17), 1);
  assert.equal(initiativeBonusFromDexterity(18), 1);
});

test("expanded compendium sources include artifacts, robots, and docs", () => {
  const equipment = equipmentPackSources();
  assert.ok(equipment.some((entry) => entry.name === "Portent"));
  assert.ok(equipment.some((entry) => entry.name === "Life Ray"));
  assert.ok(equipment.some((entry) => entry.name === "Bubble Car"));
  assert.ok(equipment.length >= 90);

  const actors = actorPackSources();
  assert.ok(actors.some((entry) => entry.name === "Security Robotoid"));
  assert.ok(actors.some((entry) => entry.name === "Ambulatory Oak"));
  assert.ok(actors.some((entry) => entry.name === "Brotherhood Scholar"));
  assert.ok(actors.length >= 10, `expected at least 10 sample actors, got ${actors.length}`);
  assert.equal(actors.every((entry) => entry.prototypeToken?.actorLink === true), true);
  assert.equal(actors.every((entry) => entry.prototypeToken?.displayBars === TOKEN_DISPLAY_MODES.OWNER_HOVER), true);

  const monsters = monsterPackSources();
  assert.ok(monsters.some((entry) => entry.name === "Hisser"));
  assert.ok(monsters.some((entry) => entry.name === "Android Warrior"));
  assert.ok(monsters.length >= 40);
  assert.equal(monsters.every((entry) => entry.prototypeToken?.actorLink === false), true);
  assert.equal(monsters.every((entry) => entry.prototypeToken?.displayName === TOKEN_DISPLAY_MODES.OWNER_HOVER), true);
  assert.equal(monsters.every((entry) => entry.prototypeToken?.texture?.src?.includes("/assets/monsters/tokens/")), true);

  const journals = journalPackSources();
  assert.ok(journals.some((entry) => entry.name === "Artifacts and Robots"));
  assert.ok(journals.some((entry) => entry.name === "Encounter Procedures"));
  assert.ok(journals.length >= 5);
});

test("prototype token migration only polishes untouched actors", () => {
  const untouchedCharacter = {
    name: "Untouched Hero",
    type: "character",
    img: "icons/svg/mystery-man.svg",
    prototypeToken: {
      name: "Untouched Hero",
      actorLink: false,
      displayName: 0,
      displayBars: 0,
      disposition: 0,
      width: 1,
      height: 1,
      texture: { src: "icons/svg/mystery-man.svg" },
      sight: { enabled: false, range: 0 },
      bar1: { attribute: "resources.hp" }
    }
  };
  const touchedCharacter = {
    name: "Touched Hero",
    type: "character",
    img: "icons/svg/mystery-man.svg",
    prototypeToken: {
      name: "Touched Hero",
      actorLink: false,
      displayName: TOKEN_DISPLAY_MODES.ALWAYS,
      displayBars: TOKEN_DISPLAY_MODES.OWNER,
      disposition: 1,
      width: 1,
      height: 1,
      texture: { src: "icons/svg/mystery-man.svg" },
      sight: { enabled: true, range: 30, visionMode: "basic" },
      bar1: { attribute: "resources.hp" }
    }
  };

  const untouchedUpdate = prototypeTokenMigrationUpdate(untouchedCharacter);
  const touchedUpdate = prototypeTokenMigrationUpdate(touchedCharacter);

  assert.equal(untouchedUpdate["prototypeToken.actorLink"], true);
  assert.equal(untouchedUpdate["prototypeToken.displayName"], TOKEN_DISPLAY_MODES.OWNER_HOVER);
  assert.equal(untouchedUpdate["prototypeToken.displayBars"], TOKEN_DISPLAY_MODES.OWNER_HOVER);
  assert.equal(untouchedUpdate["prototypeToken.sight.range"], 60);
  assert.equal(untouchedUpdate["prototypeToken.sight.enabled"], true);
  assert.equal(touchedUpdate["prototypeToken.displayName"], undefined);
  assert.equal(touchedUpdate["prototypeToken.displayBars"], undefined);
  assert.equal(touchedUpdate["prototypeToken.sight.range"], undefined);
});

// ---------------------------------------------------------------------------
// v0.5.0 additions: fatigue matrix, XP thresholds, plant mutations,
// alliances, PSH reliability helper.
// ---------------------------------------------------------------------------

import {
  combinedFatigueFactor,
  resolveWeaponFatigueFamily,
  weaponFatigueModifier
} from "../module/tables/fatigue-matrix.mjs";
import {
  ATTRIBUTE_BONUS_MATRIX,
  LEVEL_THRESHOLDS,
  levelForXp,
  levelsByType,
  xpForNextLevel
} from "../module/experience.mjs";
import {
  allianceAccepts,
  allianceReactionModifier,
  allianceRecord
} from "../module/alliances.mjs";
import { MUTATIONS_BY_SUBTYPE } from "../module/tables/mutation-data.mjs";
import { CHARACTER_TYPES, CRYPTIC_ALLIANCES } from "../module/config.mjs";
import {
  ATTACK_CONTEXT_VERSION,
  attackContextFromFlags,
  buildAttackContext,
  serializeAttackContext
} from "../module/attack-context.mjs";
import {
  HOOK,
  HOOK_SURFACE_VERSION,
  fireAnnounceHook,
  fireVetoHook
} from "../module/hook-surface.mjs";

test("fatigue matrix resolves weapon families and layered penalties", () => {
  assert.equal(resolveWeaponFatigueFamily({ name: "Long Sword", weaponClass: 3 }), "sword-one");
  assert.equal(resolveWeaponFatigueFamily({ name: "Two-Handed Sword", weaponClass: 3 }), "sword-two");
  // Energy weapons: weapon class 10-16 returns null (no fatigue).
  assert.equal(resolveWeaponFatigueFamily({ name: "Laser Pistol", weaponClass: 13 }), null);
  assert.equal(resolveWeaponFatigueFamily({ name: "Pole Arm", weaponClass: 3 }), "pole-arm");

  // Rounds 1-10 never fatigue.
  assert.equal(weaponFatigueModifier("sword-one", 1), 0);
  assert.equal(weaponFatigueModifier("sword-one", 10), 0);
  // Sword one-handed begins at turn 14.
  assert.equal(weaponFatigueModifier("sword-one", 13), 0);
  assert.equal(weaponFatigueModifier("sword-one", 14), -1);
  assert.equal(weaponFatigueModifier("sword-one", 19), -6);
  // Pole arm / flail / two-hand start at turn 11.
  assert.equal(weaponFatigueModifier("pole-arm", 11), -1);
  assert.equal(weaponFatigueModifier("sword-two", 19), -9);
});

test("combined fatigue factor stacks weapon and armor penalties", () => {
  // Sword at turn 14 (-1) + AC 3 powered plate at turn 14 (never) should be -1.
  assert.equal(
    combinedFatigueFactor({ family: "sword-one", armorClass: 3, meleeTurn: 14 }),
    -1
  );
  // Sword at turn 17 (-4) + AC 3 at turn 17 (-3) = -7.
  assert.equal(
    combinedFatigueFactor({ family: "sword-one", armorClass: 3, meleeTurn: 17 }),
    -7
  );
  // No weapon family (e.g. laser) + AC 10 = 0.
  assert.equal(
    combinedFatigueFactor({ family: null, armorClass: 10, meleeTurn: 19 }),
    0
  );
});

test("experience thresholds and bonus matrix match RAW 1e", () => {
  assert.deepEqual(LEVEL_THRESHOLDS, [0, 3000, 6000, 12000, 24000, 48000, 96000, 200000, 400000, 1000000]);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(2999), 1);
  assert.equal(levelForXp(3000), 2);
  assert.equal(levelForXp(5999), 2);
  assert.equal(levelForXp(6000), 3);
  assert.equal(levelForXp(11999), 3);
  assert.equal(levelForXp(12000), 4);
  assert.equal(levelForXp(1_500_000), 10);

  assert.equal(xpForNextLevel(2), 3000);
  assert.equal(xpForNextLevel(10), 1_000_000);
  assert.equal(xpForNextLevel(11), null); // no 11th level on the chart

  assert.equal(levelsByType("psh"), true);
  assert.equal(levelsByType("humanoid"), true);
  assert.equal(levelsByType("mutated-animal"), false);
  assert.equal(levelsByType("mutated-plant"), false);
  assert.equal(levelsByType("robot"), false);

  const attrs = new Set(Object.values(ATTRIBUTE_BONUS_MATRIX));
  for (const attr of ["ms", "in", "dx", "ch", "cn", "ps"]) {
    assert.ok(attrs.has(attr), `Attribute ${attr} must appear on the d10 bonus matrix`);
  }
});

test("plant mutations and mutated-plant character type resolve", () => {
  assert.ok(CHARACTER_TYPES["mutated-plant"], "mutated-plant must be a valid character type");
  const plants = MUTATIONS_BY_SUBTYPE.plant;
  assert.ok(plants.length >= 40, `expected at least 40 plant mutations, got ${plants.length}`);
  const adaptation = plants.find((entry) => entry.name === "Adaptation");
  assert.ok(adaptation, "Adaptation must be in the plant table");
  assert.deepEqual(adaptation.ranges["mutated-plant"], [1, 3]);
});

test("weapon category and gear subtype inference cover canonical items", async () => {
  const { inferWeaponCategory, inferGearSubtype } = await import("../module/equipment-rules.mjs");

  assert.equal(inferWeaponCategory({ system: { weaponClass: 3 } }), "primitive");
  assert.equal(inferWeaponCategory({ system: { weaponClass: 10 } }), "modern");
  assert.equal(inferWeaponCategory({ system: { weaponClass: 16 } }), "artifact");
  assert.equal(inferWeaponCategory({ system: { weaponClass: 1, artifact: { isArtifact: true } } }), "artifact");
  assert.equal(inferWeaponCategory({ system: { weaponClass: 1 }, flags: { "gamma-world-1e": { naturalWeapon: true } } }), "natural");

  assert.equal(inferGearSubtype({ name: "Arrows (bundle of 20)", system: {} }), "ammunition");
  assert.equal(inferGearSubtype({ name: "Small Backpack", system: {} }), "container");
  assert.equal(inferGearSubtype({ name: "Hydrogen Energy Cell", system: {} }), "power-cell");
  assert.equal(inferGearSubtype({ name: "Trail Rations (3 days)", system: {} }), "ration");
  assert.equal(inferGearSubtype({ name: "Hand Radio (Ancient)", system: {} }), "communication");
  assert.equal(inferGearSubtype({ name: "Pre-war Book", system: {} }), "trade-good");
  assert.equal(inferGearSubtype({ name: "Rope (10m coil)", system: {} }), "tool");
  assert.equal(inferGearSubtype({ name: "Fragmentation Grenade", system: {} }), "explosive");
  assert.equal(inferGearSubtype({ name: "Medi-kit", system: {} }), "medical");
  assert.equal(inferGearSubtype({ name: "Bubble Car", system: {} }), "vehicle");
  // Unknown objects fall back to misc.
  assert.equal(inferGearSubtype({ name: "Mystery Lump", system: {} }), "misc");
});

test("compendium generators include ammo items and every pregen type", async () => {
  const { equipmentPackSources, actorPackSources } = await import("../scripts/compendium-content.mjs");

  const equipment = equipmentPackSources();
  const ammo = equipment.filter((i) => i.type === "gear" && i.system?.subtype === "ammunition");
  const containers = equipment.filter((i) => i.type === "gear" && i.system?.subtype === "container");
  assert.ok(ammo.length >= 10, `expected at least 10 ammo items, got ${ammo.length}`);
  assert.ok(containers.length >= 7, `expected at least 7 container items, got ${containers.length}`);
  // Every ammo item must have a type key and non-zero rounds.
  for (const a of ammo) {
    assert.ok(a.system.ammo?.type, `ammo item ${a.name} missing ammo.type`);
    assert.ok((a.system.ammo?.rounds ?? 0) > 0, `ammo item ${a.name} has zero rounds`);
  }
  // Broadcast Power Station must be gone.
  assert.ok(!equipment.some((i) => i.name === "Broadcast Power Station"),
    "Broadcast Power Station should be removed from the equipment pack");

  const pregens = actorPackSources();
  const types = new Set(pregens.map((p) => p.system?.details?.type));
  for (const t of ["psh", "humanoid", "mutated-animal", "mutated-plant", "robot"]) {
    assert.ok(types.has(t), `missing pregen for character type ${t}`);
  }
});

test("cryptic alliance reaction modifier reflects ally / enemy / self", () => {
  assert.ok(CRYPTIC_ALLIANCES.brotherhood);
  const sameAlliance = allianceReactionModifier(
    { system: { details: { alliance: "brotherhood" } } },
    { system: { details: { alliance: "brotherhood" } } }
  );
  assert.ok(sameAlliance > 0, "same-alliance NPCs should be friendly");

  const enemy = allianceReactionModifier(
    { system: { details: { alliance: "ranks-of-the-fit" } } },
    { system: { details: { alliance: "zoopremisists" } } }
  );
  assert.ok(enemy < 0, "declared enemies should be hostile");

  const unknownBoth = allianceReactionModifier(
    { system: { details: { alliance: "" } } },
    { system: { details: { alliance: "" } } }
  );
  assert.equal(unknownBoth, 0, "empty alliances produce no modifier");

  assert.ok(allianceAccepts("brotherhood", "humanoid"));
  assert.equal(allianceAccepts("created", "humanoid"), false, "The Created only accepts robots");
  assert.ok(allianceRecord("brotherhood"));
});

test("AttackContext round-trips through serialize + rehydrate", () => {
  // Fixture that mimics what rollAttack builds on a real attack.
  const mockActor = { uuid: "Actor.abc", name: "Raider" };
  const mockToken = { uuid: "Scene.s1.Token.t1" };
  const mockWeapon = { uuid: "Actor.abc.Item.w1", name: "Laser Pistol" };
  const mockRoll = { total: 17, formula: "1d20 + 2" };
  const target = {
    actor: { uuid: "Actor.xyz", name: "Dabber" },
    targetToken: { uuid: "Scene.s1.Token.t2" },
    targetUuid: "Actor.xyz",
    targetTokenUuid: "Scene.s1.Token.t2",
    targetName: "Dabber",
    armorClass: 6,
    distance: 25
  };

  const context = buildAttackContext({
    actor: mockActor, token: mockToken, weapon: mockWeapon,
    target, roll: mockRoll,
    range: { label: "short", penalty: 0 },
    attackBonus: 2, hitTarget: 12,
    hit: true, isCritical: false, isFumble: false,
    damageFormula: "5d6", damageType: "energy",
    effectMode: "damage", sourceKind: "weapon", sourceName: "Laser Pistol"
  });

  assert.equal(context.version, ATTACK_CONTEXT_VERSION);
  assert.equal(context.actor, mockActor, "runtime context keeps live doc refs");
  assert.equal(context.weapon, mockWeapon);
  assert.equal(context.damageFormula, "5d6");
  assert.equal(context.hit, true);
  assert.equal(context.range.label, "short");
  assert.equal(context.effect.mode, "damage");

  const serialized = serializeAttackContext(context);
  // Serialized form: no live doc refs, only primitive + UUIDs.
  assert.equal(serialized.actorUuid, "Actor.abc");
  assert.equal(serialized.weaponUuid, "Actor.abc.Item.w1");
  assert.equal(serialized.tokenUuid, "Scene.s1.Token.t1");
  assert.equal(serialized.target.actorUuid, "Actor.xyz");
  assert.equal(serialized.target.tokenUuid, "Scene.s1.Token.t2");
  assert.equal(serialized.target.armorClass, 6);
  assert.equal(serialized.target.distance, 25);
  assert.equal(serialized.rollTotal, 17);
  assert.equal(serialized.rollFormula, "1d20 + 2");
  assert.equal(serialized.hit, true);
  assert.equal(serialized.damageFormula, "5d6");

  // Confirm no Foundry documents snuck into the serialized JSON.
  assert.equal("actor" in serialized, false);
  assert.equal("weapon" in serialized, false);
  assert.equal("roll" in serialized, false);

  // Rehydrate from a chat-message-like flags shape. Should produce
  // a plain object with UUIDs preserved and primitives intact.
  const rehydrated = attackContextFromFlags({ context: serialized });
  assert.equal(rehydrated.version, ATTACK_CONTEXT_VERSION);
  assert.equal(rehydrated.actorUuid, "Actor.abc");
  assert.equal(rehydrated.target.actorUuid, "Actor.xyz");
  assert.equal(rehydrated.damageFormula, "5d6");
  assert.equal(rehydrated.hit, true);
  assert.equal(rehydrated.range.label, "short");
  assert.equal(rehydrated.effect.mode, "damage");

  // Legacy pre-Phase-2a flags (no `context` key) → null.
  assert.equal(attackContextFromFlags({ attack: { something: true } }), null);
  assert.equal(attackContextFromFlags(null), null);
  assert.equal(attackContextFromFlags(undefined), null);
});

test("Hook surface exports the expected constants and is test-safe", () => {
  assert.equal(HOOK_SURFACE_VERSION, 1);
  assert.equal(Object.isFrozen(HOOK), true, "HOOK table must be frozen so macro authors can trust the names");

  // The nine pipeline hooks + the Phase 4 resourceConsumed reservation.
  const expected = {
    preAttackRoll:      "gammaWorld.v1.preAttackRoll",
    attackRollComplete: "gammaWorld.v1.attackRollComplete",
    preRollDamage:      "gammaWorld.v1.preRollDamage",
    damageRollComplete: "gammaWorld.v1.damageRollComplete",
    preApplyDamage:     "gammaWorld.v1.preApplyDamage",
    damageApplied:      "gammaWorld.v1.damageApplied",
    preSaveRoll:        "gammaWorld.v1.preSaveRoll",
    saveResolved:       "gammaWorld.v1.saveResolved",
    conditionApplied:   "gammaWorld.v1.conditionApplied",
    resourceConsumed:   "gammaWorld.v1.resourceConsumed"
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(HOOK[key], value, `HOOK.${key} should equal "${value}"`);
  }

  // Every name must start with "gammaWorld.v1." so the namespace is honored.
  for (const name of Object.values(HOOK)) {
    assert.ok(name.startsWith("gammaWorld.v1."), `hook "${name}" must live under gammaWorld.v1.*`);
  }

  // Graceful no-op when Hooks is undefined (the node test env). Veto
  // helper returns true (proceed) so behavior is never blocked by missing
  // infra; announce helper returns silently.
  assert.equal(fireVetoHook(HOOK.preAttackRoll, { actor: null }), true);
  assert.equal(fireAnnounceHook(HOOK.damageApplied, { applied: 5 }), undefined);
});

test("AttackContext handles the no-weapon generic natural attack path", () => {
  const context = buildAttackContext({
    actor: { uuid: "Actor.mon", name: "Feral Hound" },
    token: { uuid: "Scene.s.Token.mon" },
    weapon: null,
    target: {
      targetUuid: "Actor.pc",
      targetTokenUuid: "Scene.s.Token.pc",
      targetName: "Armek",
      armorClass: 7,
      distance: 5
    },
    roll: { total: 14, formula: "1d20 + 0" },
    range: { label: "melee", penalty: 0 },
    attackBonus: 0, hitTarget: 14,
    hit: true, isCritical: false, isFumble: false,
    damageFormula: "1d3", damageType: "physical",
    sourceKind: "natural", sourceName: "Bite"
  });

  const serialized = serializeAttackContext(context);
  assert.equal(serialized.weaponUuid, null, "natural attack has no weapon");
  assert.equal(serialized.sourceKind, "natural");
  assert.equal(serialized.sourceName, "Bite");
  assert.equal(serialized.effect.mode, "damage");
  assert.equal(serialized.range.label, "melee");
});

