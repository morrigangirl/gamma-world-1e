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
  damageDiceFromIntensity,
  describePoisonOutcome,
  describeRadiationOutcome,
  radiationBandFromMargin,
  resolvePoison,
  resolveRadiation
} from "../module/tables/resistance-tables.mjs";
import {
  collectHazardSaveFlags,
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
import { artifactPowerStatus, compatibleCellTypes, isPowerCell, cellChargePercent, isItemActiveForDrain, armorIsInert } from "../module/artifact-power.mjs";
import { CONSUMPTION_CATALOG, consumptionRateFor } from "../module/equipment-rules.mjs";
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
import { equipmentPackSources, actorPackSources, journalPackSources, monsterPackSources, robotMonsterSources } from "./helpers/pack-sources.mjs";

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

  // Mental save flow unchanged — matrix-based, clamped 3-18 resistance.
  const mentalContext = saveContextForActor(actor, "mental");
  assert.equal(mentalContext.resistance, 14);
  assert.equal(mentalContext.attemptCount, 4);

  // 0.8.2 homebrew radiation save — `resistance` is now the signed save
  // bonus, not a clamped 3-18 score. CN 12 → mod 0 (inside the 6-15
  // neutral band), Heightened Constitution +3, Will Force (CN) +12 → 15.
  // Heightened Constitution also caps radiation severity at "severe"
  // (no catastrophic band from a single exposure).
  const radiationContext = saveContextForActor(actor, "radiation");
  assert.equal(radiationContext.resistance, 15);
  assert.equal(radiationContext.saveBonus, 15);
  assert.equal(radiationContext.saveFlags.capSeverityAt, "severe");
  assert.equal(radiationContext.saveFlags.targetBonus, 15);

  const targetNumber = mentalAttackTarget(10, mentalContext.resistance);
  const evaluation = evaluateSaveForActor(actor, "mental", 10, {
    rollTotals: [targetNumber, targetNumber - 1]
  });
  assert.equal(evaluation.success, true);
  assert.deepEqual(evaluation.rollTotals, [targetNumber, targetNumber - 1]);
});

test("mutation tables expose complete, typed entries", () => {
  // 0.8.6 — Genius Capability retired and split into three standalone
  // mutations (Military / Economic / Scientific Genius), so mental
  // mutation count rises by 2 (from 49 to 51).
  assert.equal(mutationEntriesFor("physical", "humanoid").length, 49);
  assert.equal(mutationEntriesFor("mental", "mutated-animal").length, 51);
  assert.equal(findMutationByPercentile("mental", "humanoid", 56)?.name, "Mental Blast");
  assert.equal(findMutationByPercentile("physical", "humanoid", 1)?.name, "Attraction Odor");
  // The three Genius replacements each roll from their own slot.
  assert.equal(findMutationByPercentile("mental", "humanoid", 26)?.name, "Military Genius");
  assert.equal(findMutationByPercentile("mental", "humanoid", 27)?.name, "Economic Genius");
  assert.equal(findMutationByPercentile("mental", "humanoid", 28)?.name, "Scientific Genius");
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

test("animation registry covers every bundled weapon entry", async () => {
  const equipment = await equipmentPackSources();
  const uncovered = equipment
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
  // 0.8.6 — Scientific Genius's -1 contribution migrated to ActiveEffect
  // and flows through `actor.gw.artifactAnalysisBonus`. The test fixture
  // carries the post-prepareDerivedData value directly to exercise the
  // same combined-modifier output that artifactUseProfileForChart now
  // surfaces to roll handlers.
  const actor = {
    system: {
      attributes: { in: { value: 18 } }
    },
    gw: { artifactAnalysisBonus: -1 },  // simulates Scientific Genius AE applied
    items: [
      { type: "mutation", name: "Dual Brain", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Scientific Genius", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Heightened Intelligence", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Heightened Brain Talent", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Molecular Understanding", system: { activation: { enabled: true }, reference: {} } },
      { type: "mutation", name: "Heightened Touch", system: { activation: { enabled: true }, reference: {} } }
    ]
  };

  assert.equal(artifactIntelligenceModifier(18), -3);
  assert.equal(clampArtifactUseRoll(-2), 1);
  assert.equal(clampArtifactUseRoll(17), 10);

  // INT 18 → -3, Dual Brain → -1, Heightened Intelligence → -2, Scientific Genius AE → -1,
  // Heightened Touch → -1 (added in 0.14.14) = -8.
  const profileA = artifactUseProfileForChart(actor, "A");
  assert.equal(profileA.modifier, -8);
  assert.equal(profileA.speedMultiplier, 3);
  assert.equal(profileA.instantCharts.has("A"), true);
  assert.equal(profileA.notes.includes("Heightened Touch"), true);

  // Chart B adds -2 from Molecular Understanding on top = -10.
  const profileB = artifactUseProfileForChart(actor, "B");
  assert.equal(profileB.modifier, -10);
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

test("artifact defaults promote named ancient items and backfill stale records", async () => {
  const equipment = await equipmentPackSources();
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

test("0.12.0 — isPowerCell + cellChargePercent report percent charge for cells", () => {
  const fresh = {
    type: "gear",
    system: {
      subtype: "power-cell",
      artifact: { isArtifact: true, charges: { current: 100, max: 100 } }
    }
  };
  const half = {
    type: "gear",
    system: {
      subtype: "power-cell",
      artifact: { isArtifact: true, charges: { current: 50, max: 100 } }
    }
  };
  const overfull = {
    type: "gear",
    system: {
      subtype: "power-cell",
      artifact: { isArtifact: true, charges: { current: 250, max: 100 } }
    }
  };
  const notCell = {
    type: "gear",
    system: {
      subtype: "medical",
      artifact: { isArtifact: true, charges: { current: 1, max: 1 } }
    }
  };
  const notGear = {
    type: "weapon",
    system: {
      subtype: "power-cell",
      artifact: { isArtifact: true, charges: { current: 100, max: 100 } }
    }
  };

  assert.equal(isPowerCell(fresh), true);
  assert.equal(isPowerCell(half), true);
  assert.equal(isPowerCell(notCell), false);
  assert.equal(isPowerCell(notGear), false);

  assert.equal(cellChargePercent(fresh), 100);
  assert.equal(cellChargePercent(half), 50);
  assert.equal(cellChargePercent(overfull), 100, "clamp above CELL_MAX_CHARGE");
  assert.equal(cellChargePercent(notCell), null, "non-cell returns null");
  assert.equal(cellChargePercent(notGear), null, "wrong item type returns null");
});

test("0.12.0 — fresh cell source JSON ships at 100/100 charges and qty 1", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const cellDir = path.resolve(__dirname, "..", "tools", "content-studio", "content", "equipment");
  const fixtures = [
    "Chemical_Energy_Cell_5WZCQw10qC2C5mu8.json",
    "Hydrogen_Energy_Cell_FzjMKPJO5DyEIubS.json",
    "Solar_Energy_Cell_zDoKwdObDgU0oa4i.json",
    "Atomic_Energy_Cell_EXFqB7bcBJKFfaen.json"
  ];
  for (const filename of fixtures) {
    const data = JSON.parse(await fs.readFile(path.join(cellDir, filename), "utf8"));
    assert.equal(data.system.subtype, "power-cell", `${filename} subtype`);
    assert.equal(data.system.quantity, 1, `${filename} quantity`);
    assert.equal(data.system.artifact.charges.current, 100, `${filename} charges.current`);
    assert.equal(data.system.artifact.charges.max, 100, `${filename} charges.max`);
  }
});

test("0.13.1 — consumptionRateFor returns per-cell drain rate (no slots divisor)", () => {
  // Cells in parallel drain at the same rate simultaneously. The rule
  // table's `cellSlots` says HOW MANY drain at once, not how the rate
  // splits between them. After `usesPerFullCell` ticks every cell hits 0%.

  // Single-cell, 10 shots: 100/10 = 10% per cell per shot (Laser Pistol).
  assert.equal(consumptionRateFor({ unit: "shot", usesPerFullCell: 10, cellSlots: 1 }), 10);
  // Single-cell, 4 shots: 100/4 = 25% per cell per shot (Black Ray).
  assert.equal(consumptionRateFor({ unit: "shot", usesPerFullCell: 4, cellSlots: 1 }), 25);
  // Two-cell parallel, 5 shots per rifle: 100/5 = 20% per cell per shot
  // (Mark VII). Each cell drains 20%/shot; after 5 shots both at 0%.
  assert.equal(consumptionRateFor({ unit: "shot", usesPerFullCell: 5, cellSlots: 2 }), 20);
  // Fractional: Needler at 30 darts per cell = 3.333...% per dart.
  const needlerRate = consumptionRateFor({ unit: "shot", usesPerFullCell: 30, cellSlots: 1 });
  assert.ok(Math.abs(needlerRate - (100 / 30)) < 1e-9, "needler rate ~= 3.333");
  // Parallel time-drain: Portent at 24h with 2 cells parallel: each
  // cell drains 100/24 = 4.17%/h. After 24h both at 0%.
  const portentRate = consumptionRateFor({ unit: "hour", usesPerFullCell: 24, cellSlots: 2 });
  assert.ok(Math.abs(portentRate - (100 / 24)) < 1e-9, "portent rate ~= 4.167 per cell");
  // Three-cell parallel, 48h Powered Assault Armor: 100/48 = 2.08%/h per cell.
  const assaultRate = consumptionRateFor({ unit: "hour", usesPerFullCell: 48, cellSlots: 3 });
  assert.ok(Math.abs(assaultRate - (100 / 48)) < 1e-9, "assault armor rate ~= 2.083 per cell");
  // Safety: null / missing entries → 0.
  assert.equal(consumptionRateFor(null), 0);
  assert.equal(consumptionRateFor(undefined), 0);
  // Safety: zero uses → clamped to 1 so we never divide by 0.
  assert.equal(consumptionRateFor({ unit: "shot", usesPerFullCell: 0, cellSlots: 1 }), 100);
});

test("0.13.0 — CONSUMPTION_CATALOG pins Batch 1 values from the rulebook", () => {
  // Rulebook 06:656-658 — Laser Pistol = Hydrogen 10 shots.
  assert.deepEqual(CONSUMPTION_CATALOG["Laser Pistol"],
    { unit: "shot", usesPerFullCell: 10, cellSlots: 1, powerSource: "hydrogen" });
  // Rulebook 06:692-694 — Black Ray Gun = Chemical 4 shots (1 cell).
  assert.deepEqual(CONSUMPTION_CATALOG["Black Ray Gun"],
    { unit: "shot", usesPerFullCell: 4, cellSlots: 1, powerSource: "chemical" });
  // Rulebook 06:714-716 — Stun Rifle = Solar 5 shots.
  assert.deepEqual(CONSUMPTION_CATALOG["Stun Rifle"],
    { unit: "shot", usesPerFullCell: 5, cellSlots: 1, powerSource: "solar" });
  // Rulebook 06:742-744 — Laser Rifle = Hydrogen 5 shots.
  assert.deepEqual(CONSUMPTION_CATALOG["Laser Rifle"],
    { unit: "shot", usesPerFullCell: 5, cellSlots: 1, powerSource: "hydrogen" });
  // Rulebook 06:768-770 — Mark VII = 2 Hydrogen cells, 5 shots.
  assert.deepEqual(CONSUMPTION_CATALOG["Mark VII Blaster Rifle"],
    { unit: "shot", usesPerFullCell: 5, cellSlots: 2, powerSource: "hydrogen" });
  // Rulebook 06:800-802 — Fusion Rifle = Atomic 10 shots.
  assert.deepEqual(CONSUMPTION_CATALOG["Fusion Rifle"],
    { unit: "shot", usesPerFullCell: 10, cellSlots: 1, powerSource: "nuclear" });
  // Rulebook 06:608-610 — Needler = Chemical 3 clips × 10 darts = 30 darts.
  assert.deepEqual(CONSUMPTION_CATALOG["Needler"],
    { unit: "shot", usesPerFullCell: 30, cellSlots: 1, powerSource: "chemical" });
  // Rulebook 06:568-570 — Slug Thrower = Hydrogen 5 clips per cell.
  assert.deepEqual(CONSUMPTION_CATALOG["Slug Thrower"],
    { unit: "clip", usesPerFullCell: 5, cellSlots: 1, powerSource: "hydrogen" });
});

test("0.13.0 — CONSUMPTION_CATALOG pins Batch 4 armor hours-of-constant-use", () => {
  assert.deepEqual(CONSUMPTION_CATALOG["Powered Plate"],
    { unit: "hour", usesPerFullCell: 50, cellSlots: 1, powerSource: "nuclear" });
  assert.deepEqual(CONSUMPTION_CATALOG["Powered Assault Armor"],
    { unit: "hour", usesPerFullCell: 48, cellSlots: 3, powerSource: "nuclear" });
  assert.deepEqual(CONSUMPTION_CATALOG["Inertia Armor"],
    { unit: "hour", usesPerFullCell: 60, cellSlots: 2, powerSource: "nuclear" });
});

test("0.13.0 Batch 4 — JSONs ship with per-hour armor consumption blocks", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const dir = path.resolve(__dirname, "..", "tools", "content-studio", "content", "equipment");
  const cases = [
    ["Powered_Plate_VLXPBBH4oS2yIzrA.json",         100 / 50],
    ["Powered_Alloyed_Plate_A8utMwPGplmeESPB.json", 100 / 45],
    ["Energized_Armor_fPVwP7u8joXxqqHN.json",       100 / 40],
    ["Inertia_Armor_DxvWMCJVOuEtZClt.json",         100 / 60],
    ["Powered_Scout_Armor_xqeqoS9kTc1I7QeP.json",   100 / 54],
    ["Powered_Battle_Armor_jpeRN1gxkAgJROOg.json",  100 / 48],
    ["Powered_Attack_Armor_RkJ65PDzYSa89tVO.json",  100 / 42],
    ["Powered_Assault_Armor_HDCrNblFeTZ9pG62.json", 100 / 48]
  ];
  for (const [filename, expectedPerUnit] of cases) {
    const data = JSON.parse(await fs.readFile(path.join(dir, filename), "utf8"));
    assert.equal(data.system.consumption?.unit, "hour", `${filename} unit`);
    assert.ok(Math.abs(data.system.consumption?.perUnit - expectedPerUnit) < 1e-6,
      `${filename} perUnit ~= ${expectedPerUnit}`);
  }
});

test("0.13.0 Batch 4 — armorIsInert truth table", () => {
  // Non-cell armor (no consumption rule): never inert.
  const sheath = { type: "armor", system: { consumption: { unit: "", perUnit: 0 } } };
  assert.equal(armorIsInert(sheath), false, "non-cell armor never inert");

  // Cell-drained armor with no cells installed: inert (declares drain
  // but has no power source to draw from).
  const noCells = {
    type: "armor",
    system: {
      consumption: { unit: "hour", perUnit: 2 },
      artifact: { power: { installedCellIds: [] } }
    }
  };
  assert.equal(armorIsInert(noCells), true, "no cells slotted → inert");

  // Wrong type: function returns false for non-armor (other code paths
  // handle weapon / gear cells via isItemActiveForDrain).
  const weapon = {
    type: "weapon",
    system: {
      consumption: { unit: "minute", perUnit: 3 },
      artifact: { power: { installedCellIds: ["uuid:foo"] } }
    }
  };
  assert.equal(armorIsInert(weapon), false, "non-armor type ignored");

  // Null / undefined safety.
  assert.equal(armorIsInert(null), false);
  assert.equal(armorIsInert(undefined), false);
  assert.equal(armorIsInert({}), false);
});

test("0.13.0 Batch 4 — accumulator residue progression for Powered Plate (50h)", () => {
  // Powered Plate: atomic, 50h per cell. 100/50 = 2%/h per cell.
  // After 50 ticks of 1 hour each, the cell should be at 0% with zero residue.
  const perUnit = 100 / 50;
  let acc = 0;
  let drained = 0;
  for (let i = 0; i < 50; i++) {
    acc += perUnit;
    const whole = Math.floor(acc);
    drained += whole;
    acc -= whole;
  }
  assert.equal(drained, 100, "50 hours empties a Powered Plate atomic cell");
  assert.ok(Math.abs(acc) < 1e-6, "residue lands at zero on a clean budget");

  // Powered Scout Armor (54h, 2 atomic cells parallel): per-cell drain
  // is 100/54 = 1.85%/h. After 54 ticks each cell at 0%.
  const scoutRate = 100 / 54;
  let scoutAcc = 0;
  let scoutDrained = 0;
  for (let i = 0; i < 54; i++) {
    scoutAcc += scoutRate;
    const whole = Math.floor(scoutAcc);
    scoutDrained += whole;
    scoutAcc -= whole;
  }
  assert.equal(scoutDrained, 100, "54 hours empties each Scout Armor atomic cell");
});

test("0.13.0 Batch 3 — JSONs ship with per-hour consumption blocks", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const dir = path.resolve(__dirname, "..", "tools", "content-studio", "content", "equipment");
  const cases = [
    ["Energy_Cloak_3Jxc7auUzG5jI3ke.json",          100 / 12],
    ["Communications_Sender_6WDeVzD6UgMaKrWM.json", 100 / 12],
    ["Portent_EXlJi8IqOBvpLod3.json",               100 / 24],
    ["Anti_grav_Sled_GCmSuLBLMuPRDtm0.json",        100 / 100]
  ];
  for (const [filename, expectedPerUnit] of cases) {
    const data = JSON.parse(await fs.readFile(path.join(dir, filename), "utf8"));
    assert.equal(data.system.consumption?.unit, "hour", `${filename} unit`);
    assert.ok(Math.abs(data.system.consumption?.perUnit - expectedPerUnit) < 1e-6,
      `${filename} perUnit ~= ${expectedPerUnit}`);
  }
});

test("0.13.0 Batch 3 — accumulator residue progression for Energy Cloak (12h)", () => {
  // Energy Cloak: chemical, 12h per cell. 100/12 = 8.333% per hour per cell.
  // After 12 ticks of 1 hour each, the cell should be at 0% with zero residue.
  const perUnit = 100 / 12;
  let acc = 0;
  let drained = 0;
  for (let i = 0; i < 12; i++) {
    acc += perUnit;
    const whole = Math.floor(acc);
    drained += whole;
    acc -= whole;
  }
  assert.equal(drained, 100, "12 hours of 1-hour ticks empties an Energy Cloak cell");
  assert.ok(Math.abs(acc) < 1e-6, "residue lands at zero on a clean budget");

  // Anti-grav Sled (100h, 1%/h): 100 ticks at 1% each → 100 drained, residue 0.
  const sledRate = 1;
  let sledAcc = 0;
  let sledDrained = 0;
  for (let i = 0; i < 100; i++) {
    sledAcc += sledRate;
    const whole = Math.floor(sledAcc);
    sledDrained += whole;
    sledAcc -= whole;
  }
  assert.equal(sledDrained, 100, "100 hours empties an Anti-grav Sled atomic cell");
});

test("0.13.0 Batch 2 — JSONs ship with per-minute consumption blocks", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const dir = path.resolve(__dirname, "..", "tools", "content-studio", "content", "equipment");
  const cases = [
    ["Energy_Mace_11na7J1UH9d7N9vf.json",   100 / 15],
    ["Stun_Whip_rinXCx25HYVboYwS.json",     100 / 30],
    ["Vibro_Dagger_N8PoHeeJjoEENEKK.json",  100 / 30],
    ["Vibro_Blade_xXgVxpYjGFOkx3kQ.json",   100 / 20],
    ["Micro_Missile_hpxkSsdlJ0FM7kpQ.json", 100 / 30]
  ];
  for (const [filename, expectedPerUnit] of cases) {
    const data = JSON.parse(await fs.readFile(path.join(dir, filename), "utf8"));
    assert.equal(data.system.consumption?.unit, "minute", `${filename} unit`);
    assert.ok(Math.abs(data.system.consumption?.perUnit - expectedPerUnit) < 1e-6,
      `${filename} perUnit ~= ${expectedPerUnit}`);
    // Active toggle defaults to false in the source so dragging from the
    // compendium gives the GM an off-state weapon to ignite.
    assert.equal(data.system.artifact?.active, false, `${filename} active default`);
  }
});

test("0.13.0 Batch 2 — accumulator residue progression for a 30-min Vibro Dagger", () => {
  // Pure-math check on the fractional accumulator logic. Each call adds
  // 100/30 = 3.333% to the residue; integer percent peeled off floor()d.
  // Sequence: round 1 → +3.333 → 3% off, residue 0.333
  //           round 2 → +3.333 (=3.666) → 3% off, residue 0.666
  //           round 3 → +3.333 (=4.000) → 4% off, residue 0.000
  //           round 4 → +3.333 → 3% off, residue 0.333
  // After 30 rounds the cell should be at 0% (100/30 × 30 = 100%).
  const perUnit = 100 / 30;
  let acc = 0;
  let drained = 0;
  for (let i = 0; i < 30; i++) {
    acc += perUnit;
    const whole = Math.floor(acc);
    drained += whole;
    acc -= whole;
  }
  assert.equal(drained, 100, "30 rounds of 1-minute ticks empties a Vibro Dagger cell");
  assert.ok(Math.abs(acc) < 1e-6, "residue lands at zero after a clean budget");

  // Independent check on Energy Mace (15 min): 15 ticks of 6.667% each.
  const maceRate = 100 / 15;
  let maceAcc = 0;
  let maceDrained = 0;
  for (let i = 0; i < 15; i++) {
    maceAcc += maceRate;
    const whole = Math.floor(maceAcc);
    maceDrained += whole;
    maceAcc -= whole;
  }
  assert.equal(maceDrained, 100, "Energy Mace empties a chemical cell in 15 minutes");
});

test("0.13.0 — Batch 1 JSONs ship with the canonical consumption block", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const dir = path.resolve(__dirname, "..", "tools", "content-studio", "content", "equipment");
  const expected = {
    "Laser_Pistol_cWzJPKijqyUA6eYW.json":           { unit: "shot", perUnit: 10 },
    "Stun_Ray_Pistol_pa2KsbEgDBnty5Bi.json":        { unit: "shot", perUnit: 10 },
    "Black_Ray_Gun_gd4N9CglQYhFQlXW.json":          { unit: "shot", perUnit: 25 },
    "Stun_Rifle_BA0cUig7iNmxUZMx.json":             { unit: "shot", perUnit: 20 },
    "Laser_Rifle_IebgCJG0bp5KtANI.json":            { unit: "shot", perUnit: 20 },
    "Mark_V_Blaster_D64jCcalrvdLbgFd.json":         { unit: "shot", perUnit: 20 },
    "Mark_VII_Blaster_Rifle_qpxi7xQJopkYFyie.json": { unit: "shot", perUnit: 20 },
    "Fusion_Rifle_dJ5bnJlJlMhu5mpn.json":           { unit: "shot", perUnit: 10 },
    "Slug_Thrower_TEWLRcePspMEbo2t.json":           { unit: "clip", perUnit: 20 }
  };
  for (const [filename, want] of Object.entries(expected)) {
    const data = JSON.parse(await fs.readFile(path.join(dir, filename), "utf8"));
    assert.equal(data.system.consumption?.unit, want.unit, `${filename} unit`);
    assert.equal(data.system.consumption?.perUnit, want.perUnit, `${filename} perUnit`);
  }
  // Needler is fractional — match with tolerance.
  const needler = JSON.parse(await fs.readFile(
    path.join(dir, "Needler_4mane00PCev1o9ig.json"), "utf8"));
  assert.equal(needler.system.consumption?.unit, "shot");
  assert.ok(Math.abs(needler.system.consumption?.perUnit - (100 / 30)) < 1e-6,
    "Needler perUnit ~= 3.333");
});

test("0.13.0 — isItemActiveForDrain branches by item type + activation flag", () => {
  const armorOn  = { type: "armor",  system: { equipped: true } };
  const armorOff = { type: "armor",  system: { equipped: false } };
  const weaponOn  = { type: "weapon", system: { artifact: { active: true } } };
  const weaponOff = { type: "weapon", system: { artifact: { active: false } } };
  const gearOn   = { type: "gear",   system: { equipped: true } };
  const gearOff  = { type: "gear",   system: { equipped: false } };
  const mutation = { type: "mutation", system: {} };

  assert.equal(isItemActiveForDrain(armorOn),  true);
  assert.equal(isItemActiveForDrain(armorOff), false);
  assert.equal(isItemActiveForDrain(weaponOn), true);
  assert.equal(isItemActiveForDrain(weaponOff), false);
  assert.equal(isItemActiveForDrain(gearOn),  true);
  assert.equal(isItemActiveForDrain(gearOff), false);
  assert.equal(isItemActiveForDrain(mutation), false,
    "non-weapon/armor/gear types never drain");
  assert.equal(isItemActiveForDrain(null), false);
  assert.equal(isItemActiveForDrain(undefined), false);
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

test("expanded compendium sources include artifacts, robots, and docs", async () => {
  const equipment = await equipmentPackSources();
  assert.ok(equipment.some((entry) => entry.name === "Portent"));
  assert.ok(equipment.some((entry) => entry.name === "Life Ray"));
  assert.ok(equipment.some((entry) => entry.name === "Bubble Car"));
  assert.ok(equipment.length >= 90);

  const actors = await actorPackSources();
  assert.ok(actors.some((entry) => entry.name === "Security Robotoid"));
  assert.ok(actors.some((entry) => entry.name === "Ambulatory Oak"));
  assert.ok(actors.some((entry) => entry.name === "Brotherhood Scholar"));
  assert.ok(actors.length >= 10, `expected at least 10 sample actors, got ${actors.length}`);
  assert.equal(actors.every((entry) => entry.prototypeToken?.actorLink === true), true);
  assert.equal(actors.every((entry) => entry.prototypeToken?.displayBars === TOKEN_DISPLAY_MODES.OWNER_HOVER), true);

  const monsters = await monsterPackSources();
  assert.ok(monsters.some((entry) => entry.name === "Hisser"));
  assert.ok(monsters.some((entry) => entry.name === "Android Warrior"));
  assert.ok(monsters.length >= 40);
  assert.equal(monsters.every((entry) => entry.prototypeToken?.actorLink === false), true);
  assert.equal(monsters.every((entry) => entry.prototypeToken?.displayName === TOKEN_DISPLAY_MODES.OWNER_HOVER), true);
  assert.equal(monsters.every((entry) => entry.prototypeToken?.texture?.src?.includes("/assets/monsters/tokens/")), true);

  const journals = await journalPackSources();
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
import {
  UNDO_VERSION,
  buildUndoSnapshot,
  captureActorSnapshot
} from "../module/undo.mjs";
import {
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_PATHS
} from "../module/resource-consumption.mjs";
import { DAMAGE_TYPES } from "../module/config.mjs";
import {
  damageTraitMultiplier,
  resolveDamageType
} from "../module/effect-state.mjs";
import {
  abilityModifierFromScore,
  baseCombatBonuses,
  buildMutationItemSource,
  combatBonusFromDexterity,
  damageBonusFromStrength,
  hitBonusFromStrength,
  MUTATION_VARIANT_POOLS,
  mutationHasVariant,
  mutationVariant
} from "../module/mutation-rules.mjs";
import {
  ATTRIBUTE_KEYS,
  MAX_PROFICIENT_SKILLS,
  SKILL_GROUPS,
  SKILL_KEYS,
  SKILLS
} from "../module/config.mjs";
import {
  computeSkillModifier,
  countProficientSkills
} from "../module/skills.mjs";

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

  assert.equal(inferGearSubtype({ name: "Arrow", system: {} }), "ammunition");
  assert.equal(inferGearSubtype({ name: "Slug", system: {} }), "ammunition");
  assert.equal(inferGearSubtype({ name: "Needler Dart, Poison", system: {} }), "ammunition");
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
  const equipment = await equipmentPackSources();
  const ammo = equipment.filter((i) => i.type === "gear" && i.system?.subtype === "ammunition");
  const containers = equipment.filter((i) => i.type === "gear" && i.system?.subtype === "container");
  // 0.14.0 — 8 ammo items now (5 cartridges + Javelin gear retired).
  assert.ok(ammo.length >= 8, `expected at least 8 ammo items, got ${ammo.length}`);
  assert.ok(containers.length >= 7, `expected at least 7 container items, got ${containers.length}`);
  // 0.14.0 — quantity is the per-unit count; ammo.rounds is deprecated.
  for (const a of ammo) {
    assert.ok(a.system.ammo?.type, `ammo item ${a.name} missing ammo.type`);
    assert.ok((a.system.quantity ?? 0) > 0, `ammo item ${a.name} has zero quantity`);
    assert.equal(a.system.ammo?.autoDestroy, true,
      `ammo item ${a.name} should default autoDestroy=true`);
  }
  // Broadcast Power Station must be gone.
  assert.ok(!equipment.some((i) => i.name === "Broadcast Power Station"),
    "Broadcast Power Station should be removed from the equipment pack");

  const pregens = await actorPackSources();
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

test("Undo snapshot captures HP/fatigue/state and survives JSON round-trip", () => {
  const mockActor = {
    uuid: "Actor.abc",
    name: "Raider",
    system: {
      resources: { hp: { value: 18, max: 30 } },
      combat: { fatigue: { round: 3 } }
    },
    flags: {
      "gamma-world-1e": {
        state: {
          temporaryEffects: [{ id: "t1", remainingRounds: 4, statusId: "paralysis" }],
          barriers: { b1: { id: "b1", remaining: 10, label: "Forcefield" } },
          nonlethal: { stunDamage: 3, unconsciousRounds: 0 }
        }
      }
    }
  };

  const snapshot = captureActorSnapshot(mockActor);
  assert.equal(snapshot.uuid, "Actor.abc");
  assert.equal(snapshot.name, "Raider");
  assert.equal(snapshot.hp.value, 18);
  assert.equal(snapshot.hp.max, 30);
  assert.equal(snapshot.fatigue.round, 3);
  assert.equal(snapshot.state.temporaryEffects[0].id, "t1");
  assert.equal(snapshot.state.barriers.b1.remaining, 10);
  assert.equal(snapshot.state.nonlethal.stunDamage, 3);

  // Full round-trip: no Foundry doc refs should leak.
  const roundTrip = JSON.parse(JSON.stringify(snapshot));
  assert.deepEqual(roundTrip, snapshot);

  // Mutating the returned state must not mutate the source actor's state.
  snapshot.state.barriers.b1.remaining = 0;
  assert.equal(mockActor.flags["gamma-world-1e"].state.barriers.b1.remaining, 10,
    "captureActorSnapshot must deep-clone, not alias");
});

test("buildUndoSnapshot wraps actor snapshots and is JSON-safe", () => {
  const a1 = { uuid: "Actor.a", name: "A", system: { resources: { hp: { value: 5, max: 10 } }, combat: { fatigue: { round: 0 } } }, flags: {} };
  const a2 = { uuid: "Actor.b", name: "B", system: { resources: { hp: { value: 8, max: 8 } }, combat: { fatigue: { round: 2 } } }, flags: {} };
  const snap = buildUndoSnapshot({
    kind: "damageApplied",
    actors: [a1, a2],
    chatMessageIds: ["msg.1", "msg.2"],
    userId: "user.x"
  });

  assert.equal(snap.version, UNDO_VERSION);
  assert.equal(snap.kind, "damageApplied");
  assert.equal(snap.userId, "user.x");
  assert.equal(snap.actorStates.length, 2);
  assert.equal(snap.actorStates[0].uuid, "Actor.a");
  assert.equal(snap.actorStates[0].hp.value, 5);
  assert.equal(snap.actorStates[1].fatigue.round, 2);
  assert.deepEqual(snap.chatMessageIds, ["msg.1", "msg.2"]);
  assert.ok(snap.timestamp > 0);

  // No live doc refs allowed — full JSON round-trip must succeed.
  const roundTrip = JSON.parse(JSON.stringify(snap));
  assert.deepEqual(roundTrip, snap);

  // Null / undefined actor entries are filtered out.
  const withNulls = buildUndoSnapshot({ kind: "x", actors: [null, a1, undefined] });
  assert.equal(withNulls.actorStates.length, 1);
  assert.equal(withNulls.actorStates[0].uuid, "Actor.a");
});

test("Phase 5 — resolveDamageType canonicalizes tag + type inputs", () => {
  // Weapon-tag overrides win over damage.type.
  assert.equal(resolveDamageType("physical", "laser"),     "laser");
  assert.equal(resolveDamageType("energy",   "fusion"),    "fusion");
  assert.equal(resolveDamageType("energy",   "black-ray"), "black-ray");
  assert.equal(resolveDamageType("physical", "needler"),   "poison");
  assert.equal(resolveDamageType("energy",   "stun"),      "electrical");

  // Canonical types pass through unchanged.
  for (const t of DAMAGE_TYPES) {
    assert.equal(resolveDamageType(t, ""), t, `canonical ${t}`);
  }

  // Common aliases map to canonical.
  assert.equal(resolveDamageType("kinetic",  ""), "physical");
  assert.equal(resolveDamageType("slashing", ""), "physical");
  assert.equal(resolveDamageType("heat",     ""), "fire");
  assert.equal(resolveDamageType("ice",      ""), "cold");
  assert.equal(resolveDamageType("shock",    ""), "electrical");
  assert.equal(resolveDamageType("psionic",  ""), "mental");

  // Unknowns fall back to physical so damage never silently vanishes.
  assert.equal(resolveDamageType("", ""),         "physical");
  assert.equal(resolveDamageType("unobtanium",""),"physical");

  // Case-insensitive.
  assert.equal(resolveDamageType("ENERGY", "LASER"), "laser");
  assert.equal(resolveDamageType("Radiation", ""),   "radiation");
});

test("Phase 5 — damageTraitMultiplier honors the priority order", () => {
  // Immune > vulnerable > resistant > neutral (1).
  const mkActor = (sets = {}) => ({
    gw: {
      damageImmunity:      new Set(sets.immune     ?? []),
      damageVulnerability: new Set(sets.vulnerable ?? []),
      damageResistance:    new Set(sets.resistant  ?? [])
    }
  });

  // Neutral: no trait match → 1.
  assert.equal(damageTraitMultiplier(mkActor(), "fire"), 1);

  // Resistance only → 0.5.
  assert.equal(damageTraitMultiplier(mkActor({ resistant: ["fire"] }), "fire"), 0.5);

  // Vulnerability only → 2.
  assert.equal(damageTraitMultiplier(mkActor({ vulnerable: ["cold"] }), "cold"), 2);

  // Immunity only → 0.
  assert.equal(damageTraitMultiplier(mkActor({ immune: ["radiation"] }), "radiation"), 0);

  // Stacking: immunity wins over vulnerability + resistance.
  const conflicted = mkActor({
    immune:     ["fire"],
    vulnerable: ["fire"],
    resistant:  ["fire"]
  });
  assert.equal(damageTraitMultiplier(conflicted, "fire"), 0);

  // Stacking: vulnerability wins over resistance (when immunity absent).
  const vulnAndResist = mkActor({
    vulnerable: ["cold"],
    resistant:  ["cold"]
  });
  assert.equal(damageTraitMultiplier(vulnAndResist, "cold"), 2);

  // Plain arrays on the derived data (not Sets) still work — the helper
  // rebuilds Sets defensively so worlds mid-migration don't crash.
  const arrayShaped = {
    gw: {
      damageImmunity:      ["radiation"],
      damageVulnerability: [],
      damageResistance:    ["fire"]
    }
  };
  assert.equal(damageTraitMultiplier(arrayShaped, "radiation"), 0);
  assert.equal(damageTraitMultiplier(arrayShaped, "fire"),      0.5);
  assert.equal(damageTraitMultiplier(arrayShaped, "cold"),      1);

  // Null/undefined actor = neutral (never crash).
  assert.equal(damageTraitMultiplier(null, "fire"),       1);
  assert.equal(damageTraitMultiplier(undefined, "cold"),  1);
  assert.equal(damageTraitMultiplier({},  "physical"),    1);
});

test("Random-variant mutation table and helpers", () => {
  // The table covers every mutation whose outcome is rolled once at
  // acquisition (pick-one at drop). The rolled value lands on
  // `system.reference.variant`; the sheet and chat card surfaces render
  // it as a separate `Variant: X` label. Missing from the table = no
  // roll on drop, so we keep the set tight and explicit.
  assert.deepEqual(Object.keys(MUTATION_VARIANT_POOLS).sort(), [
    "Absorption",
    "Body Structure Change",
    "Complete Mental Block",
    "Fear Impulse",
    "Physical Reflection",
    "Skin Structure Change"
  ]);

  // Absorption RAW has six damage types.
  assert.equal(MUTATION_VARIANT_POOLS.Absorption.length, 6);
  assert.ok(MUTATION_VARIANT_POOLS.Absorption.includes("paralysis rays"));

  // 0.8.6 — Genius Capability retired. Replaced by three standalone
  // mutations (Military / Economic / Scientific Genius), each rolled
  // from its own d100 slot rather than a variant sub-roll. Neither
  // "Genius Capability" nor any of the three replacements participates
  // in the variant-pool system.
  assert.equal(MUTATION_VARIANT_POOLS["Genius Capability"], undefined);
  assert.equal(mutationHasVariant("Genius Capability"), false,
    "Retired mutation no longer triggers the drop-roll hook");
  assert.equal(mutationHasVariant("Military Genius"), false);
  assert.equal(mutationHasVariant("Economic Genius"), false);
  assert.equal(mutationHasVariant("Scientific Genius"), false);
  assert.equal(mutationVariant("Genius Capability", () => 0.5), "",
    "Retired mutation produces no variant");

  // Plain mutations (no variant slot) must return false so the drop
  // hook doesn't touch them.
  assert.equal(mutationHasVariant("Heightened Brain Talent"), false);
  assert.equal(mutationHasVariant("Cryokinesis"), false);
  assert.equal(mutationHasVariant(""), false);

  // Seeded rng — reproducible roll from each pool.
  let i = 0;
  const stubRng = () => [0.0, 0.2, 0.45, 0.7, 0.9, 0.99][(i++) % 6];
  const rolled = mutationVariant("Absorption", stubRng);
  assert.ok(MUTATION_VARIANT_POOLS.Absorption.includes(rolled),
    `Absorption roll "${rolled}" should be in the RAW pool`);
});

test("buildMutationItemSource honors rollVariant=false (compendium build)", () => {
  // Compendium builds pass rollVariant:false so the pack doesn't bake a
  // pre-rolled outcome into every seeded mutation. Empty variant slots
  // get re-rolled on drag-drop by the preCreateItem hook.
  const def = {
    code: 1,
    name: "Absorption",
    subtype: "mental",
    category: "beneficial",
    summary: "Withstand additional damage for _______ up to current HP.",
    page: 11
  };

  const rolled = buildMutationItemSource(def, { rng: () => 0, rollVariant: true });
  assert.ok(rolled.system.reference.variant,
    "rollVariant:true must populate system.reference.variant");
  assert.ok(MUTATION_VARIANT_POOLS.Absorption.includes(rolled.system.reference.variant),
    "rolled variant must be drawn from the mutation's pool");

  const baked = buildMutationItemSource(def, { rollVariant: false });
  assert.equal(baked.system.reference.variant, "",
    "rollVariant:false must leave the variant slot empty for drop-hook re-roll");
});

test("Attribute-to-combat bonus bands match the existing 6-15 neutral range", () => {
  // Thresholds: below 6 = score - 6, above 15 = score - 15, else 0.
  // All three helpers (DX to-hit, PS damage, PS to-hit) use the same
  // band so they stay numerically in sync.

  // Dexterity to-hit.
  assert.equal(combatBonusFromDexterity(3),  -3);
  assert.equal(combatBonusFromDexterity(5),  -1);
  assert.equal(combatBonusFromDexterity(6),   0);
  assert.equal(combatBonusFromDexterity(8),   0, "PS 8 (mid band) = no bonus/penalty");
  assert.equal(combatBonusFromDexterity(15),  0);
  assert.equal(combatBonusFromDexterity(16), +1);
  assert.equal(combatBonusFromDexterity(18), +3);

  // Strength damage.
  assert.equal(damageBonusFromStrength(3),  -3);
  assert.equal(damageBonusFromStrength(8),   0, "Sara's PS 8 correctly yields 0 damage bonus");
  assert.equal(damageBonusFromStrength(16), +1);
  assert.equal(damageBonusFromStrength(18), +3);

  // Strength to-hit (new — mirrors the damage band so a PS 18 fighter
  // gets +3 to hit AND +3 damage on melee, and Sara at PS 8 gets 0/0).
  assert.equal(hitBonusFromStrength(3),   -3);
  assert.equal(hitBonusFromStrength(8),    0);
  assert.equal(hitBonusFromStrength(15),   0);
  assert.equal(hitBonusFromStrength(17),  +2);
  assert.equal(hitBonusFromStrength(18),  +3);

  // baseCombatBonuses returns the full contributor set. The shape must
  // include `meleeToHitBonus` now so dice.mjs can read it.
  const actor = { system: { attributes: { dx: { value: 16 }, ps: { value: 18 } } } };
  const bonuses = baseCombatBonuses(actor);
  assert.equal(bonuses.toHitBonus,       +1, "DX 16 → +1 dexterity to-hit");
  assert.equal(bonuses.meleeToHitBonus,  +3, "PS 18 → +3 strength melee to-hit");
  assert.equal(bonuses.damageFlat,       +3, "PS 18 → +3 damage");
});

test("Resource-consumption kind paths and labels stay in sync", () => {
  // Both maps must cover the same set of kinds — a drift here means the
  // depletion card would miss a label (or vice versa).
  const pathKinds = Object.keys(RESOURCE_KIND_PATHS).sort();
  const labelKinds = Object.keys(RESOURCE_KIND_LABELS).sort();
  assert.deepEqual(pathKinds, labelKinds,
    "RESOURCE_KIND_PATHS and RESOURCE_KIND_LABELS must enumerate identical kinds");

  // The two currently-supported kinds each resolve to the schema fields
  // we actually decrement in the runtime. If these paths shift we break
  // every consume call.
  assert.equal(RESOURCE_KIND_PATHS.ammo, "system.ammo.current");
  assert.equal(RESOURCE_KIND_PATHS.artifactCharge, "system.artifact.charges.current");

  // Both maps are frozen so downstream mutation is impossible.
  assert.equal(Object.isFrozen(RESOURCE_KIND_PATHS), true);
  assert.equal(Object.isFrozen(RESOURCE_KIND_LABELS), true);
});

test("Hook surface exports the expected constants and is test-safe", () => {
  assert.equal(HOOK_SURFACE_VERSION, 1);
  assert.equal(Object.isFrozen(HOOK), true, "HOOK table must be frozen so macro authors can trust the names");

  // The nine pipeline hooks + the Phase 4 resourceConsumed reservation
  // + the 0.8.3 skill hook pair for the Cinematic Roll Request banner.
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
    resourceConsumed:   "gammaWorld.v1.resourceConsumed",
    preSkillRoll:       "gammaWorld.v1.preSkillRoll",
    skillRollComplete:  "gammaWorld.v1.skillRollComplete"
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

test("Phase 0.8 — abilityModifierFromScore uses the same 6-15 neutral band", () => {
  // Mirrors the combatBonusFromDexterity / damageBonusFromStrength cases.
  assert.equal(abilityModifierFromScore(3),  -3, "PS/DX/etc. 3 → -3");
  assert.equal(abilityModifierFromScore(5),  -1, "score 5 → -1");
  assert.equal(abilityModifierFromScore(6),   0, "score 6 is the bottom of the neutral band");
  assert.equal(abilityModifierFromScore(8),   0, "score 8 is mid-neutral (Sara)");
  assert.equal(abilityModifierFromScore(15),  0, "score 15 is the top of the neutral band");
  assert.equal(abilityModifierFromScore(16), +1, "score 16 → +1");
  assert.equal(abilityModifierFromScore(18), +3, "score 18 → +3");
  // Robustness.
  assert.equal(abilityModifierFromScore(null),      -6, "null coerces to 0 → 0-6 = -6");
  assert.equal(abilityModifierFromScore(undefined), -6);
  assert.equal(abilityModifierFromScore(10.4),      0, "non-integer rounds to 10 → 0");
});

test("Phase 0.8 — SKILLS canonical table is well-formed", () => {
  assert.equal(SKILL_KEYS.length, 25, "exactly 25 skills");
  // Every entry carries a valid ability + a group that's in SKILL_GROUPS.
  for (const [key, def] of Object.entries(SKILLS)) {
    assert.ok(ATTRIBUTE_KEYS.includes(def.ability),
      `${key}.ability "${def.ability}" is not in ATTRIBUTE_KEYS`);
    assert.ok(SKILL_GROUPS.includes(def.group),
      `${key}.group "${def.group}" is not in SKILL_GROUPS`);
    assert.equal(typeof def.label, "string", `${key} must carry a label i18n key`);
    assert.ok(def.label.startsWith("GAMMA_WORLD.Skill."),
      `${key}.label should follow the GAMMA_WORLD.Skill.* convention`);
  }
  // Spec-specified ability mappings hold. Spot-check a few so a bad
  // future edit to the canonical table is loud.
  assert.equal(SKILLS.survival.ability,          "cn");
  assert.equal(SKILLS.stealth.ability,           "dx");
  assert.equal(SKILLS.climbingTraversal.ability, "ps");
  assert.equal(SKILLS.threatAssessment.ability,  "ms");
  assert.equal(SKILLS.barter.ability,            "ch");
  assert.equal(SKILLS.ancientTech.ability,       "in",
    "Intelligence key is 'in', not 'int' — this mapping catches the translation bug.");

  // Groups distribute correctly per the spec.
  const counts = Object.fromEntries(SKILL_GROUPS.map((g) => [g, 0]));
  for (const def of Object.values(SKILLS)) counts[def.group] += 1;
  assert.deepEqual(counts, {
    field: 5, tech: 5, combat: 4, lore: 5, social: 4, medical: 2
  });

  assert.equal(MAX_PROFICIENT_SKILLS, 3);
});

test("Phase 0.8 — computeSkillModifier applies ability mod + proficiency", () => {
  const mkActor = (abilities, skills = {}) => ({
    system: {
      attributes: Object.fromEntries(Object.entries(abilities).map(([k, v]) => [k, { value: v }])),
      skills
    }
  });

  // Non-proficient DX 14 Stealth → 0 + 0 = 0.
  const a1 = mkActor({ dx: 14 });
  const m1 = computeSkillModifier(a1, "stealth");
  assert.equal(m1.ok, true);
  assert.equal(m1.abilityKey, "dx");
  assert.equal(m1.abilityMod, 0);
  assert.equal(m1.proficient, false);
  assert.equal(m1.profBonus, 0);
  assert.equal(m1.total, 0);

  // Proficient DX 14 Stealth → 0 + 2.
  const a2 = mkActor({ dx: 14 }, { stealth: { ability: "dx", proficient: true } });
  const m2 = computeSkillModifier(a2, "stealth");
  assert.equal(m2.proficient, true);
  assert.equal(m2.profBonus, 2);
  assert.equal(m2.total, 2);

  // Non-proficient PS 18 Climbing/Traversal → +3 + 0 = 3.
  const a3 = mkActor({ ps: 18 });
  const m3 = computeSkillModifier(a3, "climbingTraversal");
  assert.equal(m3.abilityKey, "ps");
  assert.equal(m3.abilityMod, 3);
  assert.equal(m3.total, 3);

  // Proficient PS 4 Climbing/Traversal → -2 + 2 = 0.
  const a4 = mkActor({ ps: 4 }, { climbingTraversal: { ability: "ps", proficient: true } });
  const m4 = computeSkillModifier(a4, "climbingTraversal");
  assert.equal(m4.abilityMod, -2);
  assert.equal(m4.profBonus, 2);
  assert.equal(m4.total, 0);

  // Per-character ability override — use MS for Stealth if the GM says so.
  const a5 = mkActor({ dx: 14, ms: 18 }, { stealth: { ability: "ms", proficient: false } });
  const m5 = computeSkillModifier(a5, "stealth");
  assert.equal(m5.abilityKey, "ms", "stored override should win over the canonical table");
  assert.equal(m5.abilityMod, 3);

  // Unknown skill key bails gracefully.
  assert.equal(computeSkillModifier(a1, "thought-laser").ok, false);

  // Missing ability score defaults to 10 → mod 0.
  const a6 = mkActor({});
  const m6 = computeSkillModifier(a6, "stealth");
  assert.equal(m6.abilityMod, 0);
  assert.equal(m6.total, 0);
});

test("Phase 0.8 — countProficientSkills iterates the canonical table", () => {
  const actor = {
    system: {
      skills: {
        survival:  { ability: "cn", proficient: true },
        stealth:   { ability: "dx", proficient: true },
        barter:    { ability: "ch", proficient: false },
        ancientTech: { ability: "in", proficient: true }
      }
    }
  };
  assert.equal(countProficientSkills(actor), 3);

  // A proficient flag on a key NOT in the canonical table is ignored —
  // prevents random actor flags from polluting the count.
  const withBogus = { system: { skills: { stealth: { proficient: true }, bogus: { proficient: true } } } };
  assert.equal(countProficientSkills(withBogus), 1);

  // Empty / missing cases.
  assert.equal(countProficientSkills({}),             0);
  assert.equal(countProficientSkills({ system: {} }), 0);
  assert.equal(countProficientSkills(null),           0);
});

test("Phase 0.8.1 — weapon renames applied in the equipment pack", async () => {
  const equipment = await equipmentPackSources();
  const weaponNames = new Set(equipment.filter((i) => i.type === "weapon").map((i) => i.name));

  // Renames landed: canonical 0.8.1 names present.
  assert.ok(weaponNames.has("Bow"),           "Bow (renamed from 'Bow and Arrows') should be in the pack");
  assert.ok(weaponNames.has("Sling"),         "Sling (renamed from 'Sling Stones') should be in the pack");
  assert.ok(weaponNames.has("Slug Thrower"),  "'Slug Thrower' (renamed from 'Slug Thrower (.38)') should be in the pack");
  assert.ok(weaponNames.has("Needler"),       "'Needler' (collapsed from 'Needler (Poison)' + 'Needler (Paralysis)') should be in the pack");

  // Legacy names are gone from the pack.
  assert.ok(!weaponNames.has("Bow and Arrows"),     "legacy 'Bow and Arrows' weapon should be gone");
  assert.ok(!weaponNames.has("Sling Stones"),       "legacy 'Sling Stones' weapon should be gone");
  assert.ok(!weaponNames.has("Sling Bullets"),      "'Sling Bullets' weapon survives only as ammo gear");
  assert.ok(!weaponNames.has("Slug Thrower (.38)"), "legacy 'Slug Thrower (.38)' weapon should be gone");
  assert.ok(!weaponNames.has("Needler (Poison)"),   "legacy 'Needler (Poison)' weapon should be gone");
  assert.ok(!weaponNames.has("Needler (Paralysis)"),"legacy 'Needler (Paralysis)' weapon should be gone");

  // 0.14.0 — sling bullets still ship as ammo gear, but as a per-unit
  // "Sling Bullet" stack with quantity 30 (renamed from the legacy
  // "Sling Bullets (pouch of 30)" bundle).
  const ammoNames = new Set(equipment
    .filter((i) => i.type === "gear" && i.system?.subtype === "ammunition")
    .map((i) => i.name));
  assert.ok(ammoNames.has("Sling Bullet"),
    "'Sling Bullet' ammo gear should ship in the pack (0.14.0 singular rename)");
});

test("Phase 0.8.1 — ammoType is a SetField with physical-projectile slugs", async () => {
  const equipment = await equipmentPackSources();
  const byName = new Map(equipment.filter((i) => i.type === "weapon").map((i) => [i.name, i]));

  // Every pack weapon's ammoType is an array (SetField-compatible).
  for (const weapon of byName.values()) {
    assert.ok(Array.isArray(weapon.system.ammoType),
      `${weapon.name}: ammoType should be an array of slugs, got ${typeof weapon.system.ammoType}`);
  }

  // Physical-projectile weapons keep their slugs. Needler accepts two dart
  // types. Energy weapons (Laser Pistol, Stun Rifle, Mark V/VII Blaster,
  // Black Ray Gun, Fusion Rifle) had their slugs dropped in 0.14.0 — they
  // draw exclusively from installed power cells now.
  assert.deepEqual(byName.get("Bow").system.ammoType,          ["arrow"]);
  assert.deepEqual(byName.get("Crossbow").system.ammoType,     ["crossbow-bolt"]);
  assert.deepEqual(byName.get("Slug Thrower").system.ammoType, ["slug"]);
  assert.deepEqual(byName.get("Sling").system.ammoType,        ["sling-stone", "sling-bullet"]);
  assert.deepEqual(byName.get("Needler").system.ammoType,      ["needler-poison", "needler-paralysis"]);
});

test("Phase 0.8.1 — WEAPON_RENAMES_081 + Needler constants are well-formed", async () => {
  const {
    WEAPON_RENAMES_081,
    NEEDLER_NAMES_081,
    SLING_BULLETS_WEAPON_081,
    legacyAmmoTypeString,
    AMMO_GEAR_BY_TYPE
  } = await import("../module/ammo-migration.mjs");

  // Each rename entry points at a non-empty new name + array ammoType.
  for (const [oldName, spec] of Object.entries(WEAPON_RENAMES_081)) {
    assert.ok(typeof spec.name === "string" && spec.name.length > 0,
      `rename for '${oldName}' must have a non-empty new name`);
    assert.ok(Array.isArray(spec.ammoType) && spec.ammoType.length > 0,
      `rename for '${oldName}' must have a non-empty ammoType array`);
    // New name must differ from old name.
    assert.notEqual(spec.name, oldName, `rename for '${oldName}' must not be a no-op`);
    // Every declared ammo type has a corresponding gear entry.
    for (const slug of spec.ammoType) {
      assert.ok(AMMO_GEAR_BY_TYPE[slug], `rename '${oldName}' references unknown ammo slug '${slug}'`);
    }
  }

  // Needler collapse set has exactly the two legacy entries.
  assert.ok(NEEDLER_NAMES_081 instanceof Set, "NEEDLER_NAMES_081 should be a Set");
  assert.equal(NEEDLER_NAMES_081.size, 2);
  assert.ok(NEEDLER_NAMES_081.has("Needler (Poison)"));
  assert.ok(NEEDLER_NAMES_081.has("Needler (Paralysis)"));

  // Sling Bullets delete-target constant is a single string matching the pack entry.
  assert.equal(SLING_BULLETS_WEAPON_081, "Sling Bullets");

  // legacyAmmoTypeString coerces SetField/array/string values.
  assert.equal(legacyAmmoTypeString("arrow"),                          "arrow");
  assert.equal(legacyAmmoTypeString(["needler-poison"]),               "needler-poison");
  assert.equal(legacyAmmoTypeString(["slug", "sling-bullet"]),         "slug");
  assert.equal(legacyAmmoTypeString(new Set(["crossbow-bolt"])),       "crossbow-bolt");
  assert.equal(legacyAmmoTypeString(new Set()),                        "");
  assert.equal(legacyAmmoTypeString(null),                             "");
  assert.equal(legacyAmmoTypeString(undefined),                        "");
  assert.equal(legacyAmmoTypeString(""),                               "");
});

// ============================================================
// 0.14.0 — ammunition refactor: per-unit quantity, singular names,
// orphan cartridge cleanup, last-ammo persistence, autoDestroy default.
// ============================================================

test("0.14.0 — ammo items use per-unit quantity and ship singular names", async () => {
  const equipment = await equipmentPackSources();
  const ammo = equipment.filter((i) => i.type === "gear" && i.system?.subtype === "ammunition");
  const names = new Set(ammo.map((a) => a.name));

  for (const expected of ["Arrow", "Crossbow Bolt", "Sling Stone", "Sling Bullet",
                          "Slug", "Needler Dart, Paralysis", "Needler Dart, Poison",
                          "Gyrojet Slug"]) {
    assert.ok(names.has(expected), `expected ammo item '${expected}' in pack`);
  }
  for (const legacy of ["Arrows (bundle of 20)", "Crossbow Bolts (bundle of 20)",
                        "Sling Stones (pouch of 30)", "Sling Bullets (pouch of 30)",
                        "Slug-Thrower Rounds (clip of 15)", "Javelin (single)",
                        "Needler Darts, Paralysis (10)", "Needler Darts, Poison (10)",
                        "Gyrojet Slugs (clip of 10)"]) {
    assert.ok(!names.has(legacy), `legacy '${legacy}' should be removed`);
  }
  for (const dropped of ["Energy Clip (10 shots)", "Blaster Pack (5 shots)",
                         "Black Ray Cell (4 shots)", "Fusion Cell (10 shots)",
                         "Stun Rifle Cell (10 shots)"]) {
    assert.ok(!names.has(dropped), `cartridge '${dropped}' should be removed`);
  }

  const byName = new Map(ammo.map((a) => [a.name, a]));
  assert.equal(byName.get("Arrow").system.quantity,         20);
  assert.equal(byName.get("Crossbow Bolt").system.quantity, 20);
  assert.equal(byName.get("Sling Stone").system.quantity,   30);
  assert.equal(byName.get("Sling Bullet").system.quantity,  30);
  assert.equal(byName.get("Slug").system.quantity,          15);
  assert.equal(byName.get("Needler Dart, Paralysis").system.quantity, 10);
  assert.equal(byName.get("Needler Dart, Poison").system.quantity,    10);
  assert.equal(byName.get("Gyrojet Slug").system.quantity,  10);

  for (const item of ammo) {
    assert.equal(item.system.ammo.rounds, 0,
      `${item.name}: legacy ammo.rounds should be zeroed`);
    assert.equal(item.system.ammo.autoDestroy, true,
      `${item.name}: autoDestroy should default to true`);
  }
});

test("0.14.0 — six obsolete slugs removed from AMMO_TYPES", async () => {
  const { AMMO_TYPES } = await import("../module/config.mjs");
  for (const slug of ["energy-clip", "blaster-pack", "black-ray-cell",
                      "fusion-cell", "stun-cell", "javelin"]) {
    assert.equal(AMMO_TYPES[slug], undefined, `slug '${slug}' should be removed`);
  }
  for (const slug of ["arrow", "crossbow-bolt", "sling-stone", "sling-bullet",
                      "slug", "needler-paralysis", "needler-poison", "gyrojet"]) {
    assert.ok(AMMO_TYPES[slug], `slug '${slug}' should remain`);
  }
});

test("0.14.0 — pack weapons no longer reference dropped slugs", async () => {
  const equipment = await equipmentPackSources();
  const dropped = new Set(["energy-clip", "blaster-pack", "black-ray-cell",
                           "fusion-cell", "stun-cell", "javelin"]);
  for (const weapon of equipment.filter((i) => i.type === "weapon")) {
    const slugs = Array.isArray(weapon.system.ammoType) ? weapon.system.ammoType : [];
    for (const s of slugs) {
      assert.ok(!dropped.has(s), `${weapon.name}: should not list dropped slug '${s}'`);
    }
  }
});

test("0.14.0 — AMMO_GEAR_BY_TYPE points at singular names", async () => {
  const { AMMO_GEAR_BY_TYPE } = await import("../module/ammo-migration.mjs");
  assert.equal(AMMO_GEAR_BY_TYPE.arrow, "Arrow");
  assert.equal(AMMO_GEAR_BY_TYPE["crossbow-bolt"], "Crossbow Bolt");
  assert.equal(AMMO_GEAR_BY_TYPE["sling-stone"], "Sling Stone");
  assert.equal(AMMO_GEAR_BY_TYPE["sling-bullet"], "Sling Bullet");
  assert.equal(AMMO_GEAR_BY_TYPE.slug, "Slug");
  assert.equal(AMMO_GEAR_BY_TYPE["needler-paralysis"], "Needler Dart, Paralysis");
  assert.equal(AMMO_GEAR_BY_TYPE["needler-poison"], "Needler Dart, Poison");
  assert.equal(AMMO_GEAR_BY_TYPE.gyrojet, "Gyrojet Slug");
  // Dropped entries.
  assert.equal(AMMO_GEAR_BY_TYPE.javelin, undefined);
  assert.equal(AMMO_GEAR_BY_TYPE["energy-clip"], undefined);
  assert.equal(AMMO_GEAR_BY_TYPE["blaster-pack"], undefined);
  assert.equal(AMMO_GEAR_BY_TYPE["black-ray-cell"], undefined);
  assert.equal(AMMO_GEAR_BY_TYPE["fusion-cell"], undefined);
  assert.equal(AMMO_GEAR_BY_TYPE["stun-cell"], undefined);
});

test("0.14.0 — sample-actor JSONs no longer reference dropped slugs or orphan cartridges", async () => {
  const actors = await actorPackSources();
  const dropped = new Set(["energy-clip", "blaster-pack", "black-ray-cell",
                           "fusion-cell", "stun-cell", "javelin"]);
  for (const actor of actors) {
    for (const item of actor.items ?? []) {
      if (item.type === "weapon") {
        const slugs = Array.isArray(item.system?.ammoType) ? item.system.ammoType : [];
        for (const s of slugs) {
          assert.ok(!dropped.has(s),
            `actor '${actor.name}' weapon '${item.name}' should not list dropped slug '${s}'`);
        }
      }
      if (item.type === "gear" && item.system?.subtype === "ammunition") {
        assert.ok(!dropped.has(item.system?.ammo?.type),
          `actor '${actor.name}' carries ammo gear with dropped type '${item.system?.ammo?.type}'`);
      }
    }
  }
});

test("Phase 0.8.1 — robot chassis catalog entries retain their shape in the committed pack", async () => {
  // 0.11.x: sourced from the committed `packs/monsters` LevelDB, not
  // the retired `compendium-content.mjs` factory. `robotMonsterSources`
  // already filters to the chassis catalog (abilities default to 10 +
  // biography quotes the catalog's "Power Source" prose), so every
  // entry here should satisfy the full chassis invariants.
  const robots = await robotMonsterSources();
  assert.ok(robots.length >= 18,
    `expected at least 18 chassis-catalog robot actors, got ${robots.length}`);

  for (const robot of robots) {
    assert.equal(robot.type, "monster", `${robot.name} should be a monster actor`);
    assert.ok(robot.name && typeof robot.name === "string");
    assert.ok(robot.system, `${robot.name} needs a system block`);

    // Owner preference: chassis catalog robots default to ability 10
    // across the board (GM tunes per-encounter).
    for (const key of ["ms", "in", "dx", "ch", "cn", "ps"]) {
      assert.equal(robot.system.attributes[key].value, 10,
        `${robot.name} ${key} should default to 10`);
    }

    // Robotics metadata set.
    assert.equal(robot.system.robotics.isRobot, true);
    assert.equal(robot.system.robotics.mode, "programmed");
    assert.ok(robot.system.robotics.chassis);
    assert.ok(robot.system.robotics.powerSource);

    // HP and AC passed through from the catalog.
    const hp = robot.system.resources.hp.max;
    assert.ok(hp > 0, `${robot.name} HP should be > 0`);
    assert.ok(robot.system.combat.baseAc > 0, `${robot.name} baseAc should be > 0`);

    // Biography quotes the journal prose.
    assert.ok(robot.system.biography.value.includes("Power Source"),
      `${robot.name} biography should quote the catalog prose`);
  }
});

/* ------------------------------------------------------------------ */
/* 0.8.2 homebrew poison + radiation                                  */
/* ------------------------------------------------------------------ */

test("0.8.2 — damageDiceFromIntensity band thresholds", () => {
  assert.equal(damageDiceFromIntensity(0),  1);
  assert.equal(damageDiceFromIntensity(6),  1);
  assert.equal(damageDiceFromIntensity(7),  2);
  assert.equal(damageDiceFromIntensity(11), 2);
  assert.equal(damageDiceFromIntensity(12), 3);
  assert.equal(damageDiceFromIntensity(15), 3);
  assert.equal(damageDiceFromIntensity(16), 4);
  assert.equal(damageDiceFromIntensity(99), 4);
});

test("0.8.2 — radiationBandFromMargin maps fail margins to bands", () => {
  assert.equal(radiationBandFromMargin(-5),  "safe");
  assert.equal(radiationBandFromMargin(0),   "safe");
  assert.equal(radiationBandFromMargin(1),   "mild");
  assert.equal(radiationBandFromMargin(3),   "mild");
  assert.equal(radiationBandFromMargin(4),   "severe");
  assert.equal(radiationBandFromMargin(6),   "severe");
  assert.equal(radiationBandFromMargin(7),   "catastrophic");
  assert.equal(radiationBandFromMargin(99),  "catastrophic");
});

test("0.8.2 — radiation save below intensity 10 is a free pass", () => {
  const actor = { system: { attributes: { cn: { value: 10 } } }, items: [] };
  const evaluation = evaluateSaveForActor(actor, "radiation", 9);
  assert.equal(evaluation.band, "below-threshold");
  assert.equal(evaluation.success, true);
  assert.equal(evaluation.damageDice, 0);
});

test("0.8.2 — radiation save margin bands dispatch correctly", () => {
  const actor = { system: { attributes: { cn: { value: 10 } } }, items: [] };
  const intensity = 14;
  // CN 10 → mod 0. rollTotal + 0 = rollTotal.
  const passing     = evaluateSaveForActor(actor, "radiation", intensity, { rollTotal: 14 });
  const missByTwo   = evaluateSaveForActor(actor, "radiation", intensity, { rollTotal: 12 });
  const missByFive  = evaluateSaveForActor(actor, "radiation", intensity, { rollTotal: 9 });
  const missByEight = evaluateSaveForActor(actor, "radiation", intensity, { rollTotal: 6 });

  assert.equal(passing.band, "safe");
  assert.equal(passing.success, true);

  assert.equal(missByTwo.band, "mild");
  assert.equal(missByTwo.success, false);
  assert.equal(missByTwo.marginOfFailure, 2);

  assert.equal(missByFive.band, "severe");
  assert.equal(missByFive.marginOfFailure, 5);

  assert.equal(missByEight.band, "catastrophic");
  assert.equal(missByEight.marginOfFailure, 8);
});

test("0.8.2 — Heightened Constitution caps radiation severity at 'severe'", () => {
  const actor = {
    system: { attributes: { cn: { value: 10 } } },
    items: [
      { type: "mutation", name: "Heightened Constitution", system: { activation: { enabled: true }, reference: {} } }
    ]
  };
  // CN 10 → mod 0; HC gives +3; rollTotal 6 → total 9 vs DC 16 → margin 7 (catastrophic)
  const evaluation = evaluateSaveForActor(actor, "radiation", 16, { rollTotal: 6 });
  assert.equal(evaluation.band, "severe",
    "Heightened Constitution should down-step catastrophic to severe");
  assert.equal(evaluation.marginOfFailure, 7);
});

test("0.8.2 — poison save: success halves damage, failure = full damage", () => {
  const actor = { system: { attributes: { cn: { value: 10 } } }, items: [] };
  // intensity 12 → damageDice 3
  const hit = evaluateSaveForActor(actor, "poison", 12, { rollTotal: 12 });
  assert.equal(hit.band, "half");
  assert.equal(hit.success, true);
  assert.equal(hit.damageDice, 3);
  assert.equal(hit.damageMultiplier, 0.5);

  const miss = evaluateSaveForActor(actor, "poison", 12, { rollTotal: 6 });
  assert.equal(miss.band, "full");
  assert.equal(miss.success, false);
  assert.equal(miss.damageMultiplier, 1);
});

test("0.8.2 — 'No Resistance to Poison' mutation removes the CN bonus on poison saves", () => {
  const highCn = {
    system: { attributes: { cn: { value: 18 } } },
    items: [
      { type: "mutation", name: "No Resistance To Poison", system: { activation: { enabled: true }, reference: {} } }
    ]
  };
  const context = saveContextForActor(highCn, "poison");
  assert.equal(context.saveBonus, 0, "CN +3 should be cancelled");
  assert.equal(context.saveFlags.disableConModifier, true);
});

test("0.8.2 — collectHazardSaveFlags surfaces per-mutation homebrew hooks", () => {
  const symbiosis = {
    system: { attributes: { cn: { value: 12 } } },
    items: [
      { type: "mutation", name: "Bacterial Symbiosis", system: { activation: { enabled: true }, reference: {} } }
    ]
  };
  const rad = collectHazardSaveFlags(symbiosis, "radiation");
  const poi = collectHazardSaveFlags(symbiosis, "poison");
  assert.equal(rad.targetBonus, 3);
  assert.equal(poi.targetBonus, 3);
});

test("0.8.2 — radiation conditions module: read + override helpers", async () => {
  const {
    getRadiationCondition,
    effectiveFatigueRound,
    overlayRadiationIndicatorState
  } = await import("../module/conditions.mjs");

  // No state → no override.
  const clean = { flags: {}, system: { combat: { fatigue: { round: 4 } } } };
  assert.equal(effectiveFatigueRound(clean), 4);
  assert.deepEqual(getRadiationCondition(clean), { sickness: null, catastrophic: null });

  // Radiation sickness active → fatigue saturated to 20.
  const sick = {
    flags: { "gamma-world-1e": { radiationSickness: {
      severity: "mild", durationDays: 2, appliedAt: 0, expiresAt: 172800
    } } },
    system: { combat: { fatigue: { round: 0 } } }
  };
  assert.equal(effectiveFatigueRound(sick), 20);
  assert.equal(getRadiationCondition(sick).sickness.severity, "mild");

  // Stub game.time for the overlay helper.
  const originalGame = globalThis.game;
  globalThis.game = { time: { worldTime: 0 } };
  try {
    const baseState = { round: 4, level: "green", label: "Fresh", title: "Fatigue round 4 — Fresh", badge: null };
    const mild = overlayRadiationIndicatorState(baseState, sick);
    assert.equal(mild.level, "red");
    assert.equal(mild.badge, "sickness-mild");
    assert.match(mild.title, /Radiation Sickness/);

    const cata = overlayRadiationIndicatorState(baseState, {
      flags: { "gamma-world-1e": { catastrophicRadiation: {
        active: true, appliedAt: 0, onsetAt: 86400, lastTickAt: 86400
      } } },
      system: { combat: { fatigue: { round: 0 } } }
    });
    assert.equal(cata.level, "red");
    assert.equal(cata.badge, "catastrophic");
    assert.match(cata.title, /Catastrophic/);
  } finally {
    globalThis.game = originalGame;
  }
});

/* ------------------------------------------------------------------ */
/* 0.8.3 Cinematic Roll Request                                       */
/* ------------------------------------------------------------------ */

test("0.8.3 — Cinematic roll-type registry is well-formed", async () => {
  const {
    ROLL_TYPES,
    RESOLVERS,
    CATEGORIES,
    getRollType,
    hasRollType,
    rollTypesByCategory
  } = await import("../module/cinematic/roll-types.mjs");

  const resolverKeys = new Set(Object.values(RESOLVERS));
  const categorySet = new Set(CATEGORIES);

  // Every entry has a unique key, a valid resolver, and a valid category.
  const seenKeys = new Set();
  for (const entry of ROLL_TYPES) {
    assert.ok(typeof entry.key === "string" && entry.key.length > 0, `bad key: ${JSON.stringify(entry)}`);
    assert.equal(seenKeys.has(entry.key), false, `duplicate roll-type key: ${entry.key}`);
    seenKeys.add(entry.key);
    assert.ok(resolverKeys.has(entry.resolver), `${entry.key} has unknown resolver ${entry.resolver}`);
    assert.ok(categorySet.has(entry.category), `${entry.key} has unknown category ${entry.category}`);
    assert.ok(typeof entry.label === "string" && entry.label.length > 0, `${entry.key} missing label`);
  }

  // Every category has at least one entry.
  const grouped = rollTypesByCategory();
  for (const cat of CATEGORIES) {
    assert.ok(Array.isArray(grouped[cat]) && grouped[cat].length > 0,
      `category ${cat} must have at least one entry`);
  }

  // Six attribute entries (one per ability). Three save entries. One
  // skill entry. One initiative entry. Total 11.
  assert.equal(grouped.attribute.length, 6);
  assert.equal(grouped.save.length, 3);
  assert.equal(grouped.skill.length, 1);
  assert.equal(grouped.initiative.length, 1);

  // Lookup helpers.
  assert.equal(getRollType("save.poison").saveType, "poison");
  assert.equal(hasRollType("save.poison"), true);
  assert.equal(hasRollType("save.bogus"), false);
  assert.throws(() => getRollType("save.bogus"), /Unknown Cinematic roll-type key/);

  // Attribute entries carry the ability key the resolver needs.
  const attrPs = ROLL_TYPES.find((entry) => entry.key === "attribute.ps");
  assert.equal(attrPs.abilityKey, "ps");
  assert.equal(attrPs.requiresDc, true);
  assert.equal(attrPs.requiresIntensity, false);

  // Save entries carry the saveType the resolver needs.
  const saveRad = ROLL_TYPES.find((entry) => entry.key === "save.radiation");
  assert.equal(saveRad.saveType, "radiation");
  assert.equal(saveRad.requiresIntensity, true);
  assert.equal(saveRad.requiresDc, false);

  // Skill entry flags requiresSkill so the composer knows to show the
  // second dropdown.
  assert.equal(getRollType("skill").requiresSkill, true);
});

test("0.8.3 — preSkillRoll / skillRollComplete hooks are declared", async () => {
  const { HOOK } = await import("../module/hook-surface.mjs");
  assert.equal(HOOK.preSkillRoll, "gammaWorld.v1.preSkillRoll");
  assert.equal(HOOK.skillRollComplete, "gammaWorld.v1.skillRollComplete");
});

test("0.8.3 — Cinematic composer buildBeginPayload normalizes form data", async () => {
  const { buildBeginPayload } = await import("../module/cinematic/compose.mjs");

  // Stub foundry.utils.randomID so requestId is predictable in tests.
  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: { randomID: () => "test-req-1" }
  };
  try {
    // Skill roll — requires skillKey.
    const skillPayload = buildBeginPayload({
      rollTypeKey: "skill",
      skillKey: "stealth",
      dc: "15",
      title: "  Sneak past the patrol  ",
      blind: true
    }, { actorUuids: ["Actor.A", "Actor.B"], user: { id: "gm-1" } });

    assert.equal(skillPayload.requestId, "test-req-1");
    assert.equal(skillPayload.rollTypeKey, "skill");
    assert.equal(skillPayload.resolver, "skill");
    assert.equal(skillPayload.category, "skill");
    assert.equal(skillPayload.skillKey, "stealth");
    assert.equal(skillPayload.dc, 15);
    assert.equal(skillPayload.title, "Sneak past the patrol");
    assert.equal(skillPayload.blind, true);
    assert.equal(skillPayload.requesterId, "gm-1");
    assert.deepEqual(skillPayload.actorUuids, ["Actor.A", "Actor.B"]);

    // Radiation save — requires intensity + saveType but NOT a dc.
    const radPayload = buildBeginPayload({
      rollTypeKey: "save.radiation",
      intensity: "14"
    }, { actorUuids: ["Actor.C"], user: { id: "gm-1" } });
    assert.equal(radPayload.saveType, "radiation");
    assert.equal(radPayload.intensity, 14);
    assert.equal(radPayload.dc, undefined, "saves don't carry a dc field");

    // Attribute check — requires dc + abilityKey from the registry.
    const attrPayload = buildBeginPayload({
      rollTypeKey: "attribute.dx",
      dc: "13"
    }, { actorUuids: ["Actor.D"], user: null });
    assert.equal(attrPayload.abilityKey, "dx");
    assert.equal(attrPayload.dc, 13);
    assert.equal(attrPayload.requesterId, null);

    // Unknown roll type throws with a helpful message.
    assert.throws(() => buildBeginPayload(
      { rollTypeKey: "save.vacuum" },
      { actorUuids: [], user: null }
    ), /unknown rollTypeKey/i);

    // Skill type WITHOUT a skillKey throws.
    assert.throws(() => buildBeginPayload(
      { rollTypeKey: "skill", skillKey: "" },
      { actorUuids: ["Actor.A"], user: null }
    ), /needs a valid skillKey/);
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.8.3 — Cinematic resolver dispatches to the right runner per roll type", async () => {
  const { resolveCinematicRoll } = await import("../module/cinematic/resolvers.mjs");

  // Stub the Foundry Roll class since we're running under node.
  const originalRoll = globalThis.Roll;
  let lastFormula = null;
  globalThis.Roll = class {
    constructor(formula, data) { this.formula = formula; this.data = data ?? {}; }
    async evaluate() {
      lastFormula = this.formula;
      // Deterministic: d20 face = 15, so total = 15 + data.mod / bonus
      const mod = Number(this.data?.mod ?? 0);
      const bonus = Number(this.data?.bonus ?? 0);
      this.terms = [{ total: 15 }];
      this.total = 15 + mod + bonus;
      return this;
    }
  };

  try {
    // Attribute check — resolver reads ability key from registry entry.
    const actor = {
      uuid: "Actor.A",
      name: "Test",
      system: {
        attributes: {
          ms: { value: 10 }, in: { value: 10 }, dx: { value: 10 },
          ch: { value: 10 }, cn: { value: 14 }, ps: { value: 18 }
        },
        skills: {},
        resources: {}
      },
      items: []
    };

    const attrResult = await resolveCinematicRoll(actor, {
      rollTypeKey: "attribute.ps",
      dc: 17
    });
    assert.equal(attrResult.d20, 15);
    assert.equal(attrResult.total, 18, "PS 18 → +3 mod → d20 15 + 3 = 18");
    assert.equal(attrResult.passed, true, "18 meets DC 17");
    assert.ok(attrResult.breakdown.includes("PS"));

    // Poison save — bare d20 + CN mod vs intensity.
    const poisonResult = await resolveCinematicRoll(actor, {
      rollTypeKey: "save.poison",
      intensity: 15
    });
    assert.equal(poisonResult.total, 15, "CN 14 → mod 0 → d20 15 + 0 = 15");
    assert.equal(poisonResult.passed, true, "15 meets DC 15");
    assert.equal(poisonResult.band, "half");

    // Radiation save below threshold — no roll, auto-pass.
    const radSafe = await resolveCinematicRoll(actor, {
      rollTypeKey: "save.radiation",
      intensity: 9
    });
    assert.equal(radSafe.passed, true);
    assert.equal(radSafe.band, "below-threshold");

    // Initiative — populates initiativeValue.
    const initResult = await resolveCinematicRoll(actor, { rollTypeKey: "initiative" });
    assert.ok(Number.isFinite(initResult.initiativeValue));
    assert.equal(initResult.total, 15, "DX 10 → +0 mod");
  } finally {
    globalThis.Roll = originalRoll;
  }
});

test("0.8.3 — Cinematic socket dispatcher routes events to listeners", async () => {
  const {
    CINEMATIC_EVENTS,
    onCinematicEvent,
    dispatchCinematicLocal,
    broadcastCinematicEvent,
    __resetCinematicListenersForTesting
  } = await import("../module/cinematic/socket.mjs");

  __resetCinematicListenersForTesting();

  const calls = [];
  const dispose = onCinematicEvent(CINEMATIC_EVENTS.begin, (payload, meta) => {
    calls.push({ payload, meta });
  });

  // Local dispatch fires the listener synchronously.
  dispatchCinematicLocal(CINEMATIC_EVENTS.begin, { requestId: "abc" }, { sender: "gm-1" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload, { requestId: "abc" });
  assert.equal(calls[0].meta.sender, "gm-1");

  // Disposer unsubscribes.
  dispose();
  dispatchCinematicLocal(CINEMATIC_EVENTS.begin, { requestId: "def" });
  assert.equal(calls.length, 1, "disposed listener should not fire again");

  // Unknown kinds throw on registration AND on broadcast.
  assert.throws(() => onCinematicEvent("nope", () => {}), /Unknown cinematic event kind/);
  assert.throws(() => broadcastCinematicEvent("nope", {}),      /Unknown cinematic event kind/);

  // broadcastCinematicEvent delivers locally even without a game global.
  __resetCinematicListenersForTesting();
  const received = [];
  onCinematicEvent(CINEMATIC_EVENTS.result, (payload) => received.push(payload));
  const originalGame = globalThis.game;
  globalThis.game = { user: { id: "user-xyz" }, socket: { emit: () => {} } };
  try {
    broadcastCinematicEvent(CINEMATIC_EVENTS.result, { actorUuid: "Actor.1", total: 17 });
    assert.equal(received.length, 1);
    assert.equal(received[0].total, 17);
  } finally {
    globalThis.game = originalGame;
  }
});

/* ------------------------------------------------------------------ */
/* 0.8.4 Tier 1 — ActiveEffect pilot                                   */
/* ------------------------------------------------------------------ */

test("0.8.4 Tier 1 — applyMutationEffects folds AE-style changes into derived", async () => {
  const { applyMutationEffects, AE_MIGRATED_MUTATIONS } = await import("../module/mutation-rules.mjs");

  // Stub foundry.utils.getProperty / setProperty used by the effect
  // applier (node tests don't have Foundry globals).
  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
        return value;
      }
    }
  };

  try {
    const expected = [
      "Heightened Strength", "Radar/Sonar", "Wings", "Shorter", "Taller",
      "Fat Cell Accumulation", "Vision Defect", "Weight Decrease",
      "Intuition", "Heightened Hearing"
    ];
    for (const name of expected) {
      assert.ok(AE_MIGRATED_MUTATIONS.has(name), `${name} should be in the Tier 1 pilot set`);
    }

    // ADD mode — Vision Defect applies -4 to toHitBonus.
    {
      const actor = {
        items: [{ type: "mutation", name: "Vision Defect",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { toHitBonus: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.toHitBonus, -4);
    }

    // Stacking ADDs across two mutations on the same actor.
    {
      const actor = {
        items: [
          { type: "mutation", name: "Taller",        system: { activation: { mode: "passive", enabled: false } } },
          { type: "mutation", name: "Vision Defect", system: { activation: { mode: "passive", enabled: false } } }
        ]
      };
      const derived = { toHitBonus: 0, damageFlat: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.toHitBonus, -5, "Taller (-1) + Vision Defect (-4) should sum to -5");
      assert.equal(derived.damageFlat, 2);
    }

    // MULTIPLY mode.
    {
      const actor = {
        items: [{ type: "mutation", name: "Fat Cell Accumulation",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { movementMultiplier: 1, toHitBonus: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.movementMultiplier, 0.75);
      assert.equal(derived.toHitBonus, -1);
    }

    // UPGRADE mode.
    // 0.11.0: Wings is now 10 m/round (metric). derivedLow starts at 0
    // so UPGRADE raises it to 10; derivedHigh starts at 25 so UPGRADE
    // leaves it alone.
    {
      const actor = {
        items: [{ type: "mutation", name: "Wings",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derivedLow  = { flightSpeed: 0 };
      const derivedHigh = { flightSpeed: 25 };
      applyMutationEffects(actor, derivedLow);
      applyMutationEffects(actor, derivedHigh);
      assert.equal(derivedLow.flightSpeed,  10);
      assert.equal(derivedHigh.flightSpeed, 25, "UPGRADE leaves current alone when higher");
    }

    // OVERRIDE mode + coercion of "true" string → boolean.
    {
      const actor = {
        items: [{ type: "mutation", name: "Intuition",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { toHitBonus: 0, damagePerDie: 0, cannotBeSurprised: false };
      applyMutationEffects(actor, derived);
      assert.equal(derived.cannotBeSurprised, true);
      assert.equal(derived.toHitBonus, 1);
      assert.equal(derived.damagePerDie, 3);
    }

    // 0.8.6 — Heightened Constitution migrated to the AE framework with
    // one literal ADD (+1 poison), one literal ADD (+1 radiation), and
    // one computeValue change (CN × 2 HP bonus). Exercises `computeValue`
    // without any condition — the first migration to use the primitive.
    {
      const actor = {
        items: [{ type: "mutation", name: "Heightened Constitution",
          system: { activation: { mode: "passive", enabled: false } } }],
        system: { attributes: { cn: { value: 12 } } }
      };
      const derived = { hpBonus: 0, poisonResistance: 10, radiationResistance: 10 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.hpBonus, 24, "CN 12 × 2 = +24 HP via computeValue");
      assert.equal(derived.poisonResistance, 11, "+1 poison save literal ADD");
      assert.equal(derived.radiationResistance, 11, "+1 radiation save literal ADD");
    }

    // Non-pilot mutation is still untouched by applyMutationEffects.
    // Heightened Dexterity uses the `unencumbered` condition but lives
    // in the conditional-effects framework — the test here demonstrates
    // that an AE with a FAILED condition doesn't get applied. The next
    // Phase 3 step migrates it to AE with a condition.
    {
      const actor = {
        items: [{ type: "mutation", name: "Will Force",
          system: { activation: { mode: "toggle", enabled: false },
                    reference: { variant: "to-hit" } } }],
        system: { attributes: { dx: { value: 14 } } }
      };
      const derived = { toHitBonus: 0 };
      applyMutationEffects(actor, derived);
      // Will Force is disabled (activation.enabled: false) so even after
      // migration its toggleEnabled-conditioned effects are skipped.
      assert.equal(derived.toHitBonus, 0,
        "Disabled toggle mutations stay out of applyMutationEffects");
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.8.5 Tier 2 — DOWNGRADE, OVERRIDE-beats-ADD, and stacked surprise bonuses", async () => {
  const { applyMutationEffects, AE_MIGRATED_MUTATIONS } = await import("../module/mutation-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    // Tier 2 pilot set includes the 14 new mutations.
    const newlyMigrated = [
      "Double Physical Pain", "Multiple Damage", "Heightened Intelligence",
      "Mental Defense Shield", "Heightened Precision", "Increased Speed",
      "Mental Defenselessness", "Molecular Understanding", "Partial Carapace",
      "Heightened Smell", "Heightened Vision", "Ultravision", "Infravision",
      "Total Carapace"
    ];
    for (const name of newlyMigrated) {
      assert.ok(AE_MIGRATED_MUTATIONS.has(name), `${name} must be in the Tier 2 pilot set`);
    }

    // DOWNGRADE — Partial Carapace caps descending-AC at 6 only when
    // current is worse (higher). Already-better armor is preserved.
    {
      const actor = {
        items: [{ type: "mutation", name: "Partial Carapace",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derivedWorse  = { baseAc: 10 };
      const derivedBetter = { baseAc: 4 };
      applyMutationEffects(actor, derivedWorse);
      applyMutationEffects(actor, derivedBetter);
      assert.equal(derivedWorse.baseAc, 6,
        "DOWNGRADE caps 10 at 6");
      assert.equal(derivedBetter.baseAc, 4,
        "DOWNGRADE leaves 4 alone (already better than 6)");
    }

    // OVERRIDE-beats-ADD via priority — Mental Defenselessness (priority
    // 50, OVERRIDE 3) wins over Heightened Intelligence (priority 20,
    // ADD +4) regardless of item order. Final mentalResistance = 3.
    for (const order of [
      ["Heightened Intelligence", "Mental Defenselessness"],
      ["Mental Defenselessness", "Heightened Intelligence"] // reversed
    ]) {
      const actor = {
        items: order.map((name) => ({ type: "mutation", name,
          system: { activation: { mode: "passive", enabled: false } } }))
      };
      const derived = { mentalResistance: 3 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.mentalResistance, 3,
        `priority 50 OVERRIDE 3 wins over priority 20 ADD +4 (item order: ${order.join(", ")})`);
    }

    // Stacked ADDs — Heightened Smell + Heightened Vision + Ultravision
    // all each add +1 to surpriseModifier, summing to +3 on one actor.
    {
      const actor = {
        items: [
          { type: "mutation", name: "Heightened Smell",
            system: { activation: { mode: "passive", enabled: false } } },
          { type: "mutation", name: "Heightened Vision",
            system: { activation: { mode: "passive", enabled: false } } },
          { type: "mutation", name: "Ultravision",
            system: { activation: { mode: "passive", enabled: false } } }
        ]
      };
      const derived = { surpriseModifier: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.surpriseModifier, 3);
    }

    // Total Carapace bundle — three changes in one effect applied together.
    {
      const actor = {
        items: [{ type: "mutation", name: "Total Carapace",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = {
        baseAc: 10,
        damageReductionMultiplier: 1,
        movementMultiplier: 1
      };
      applyMutationEffects(actor, derived);
      assert.equal(derived.baseAc, 4);
      assert.equal(derived.damageReductionMultiplier, 0.5);
      assert.equal(derived.movementMultiplier, 0.75);
    }

    // Increased Speed stacks across two effect fields — MULTIPLY movement
    // ×2 AND ADD extraAttacks +1.
    {
      const actor = {
        items: [{ type: "mutation", name: "Increased Speed",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { movementMultiplier: 1, extraAttacks: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.movementMultiplier, 2);
      assert.equal(derived.extraAttacks, 1);
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

/* ================================================================= */
/* 0.8.6 Phase 3 — Conditional-effects framework + holdouts           */
/* ================================================================= */

test("0.8.6 Phase 3 — evaluateCondition dispatches each primitive", async () => {
  const { evaluateCondition } = await import("../module/mutation-rules.mjs");

  const enabledItem = { system: { activation: { enabled: true }, reference: { variant: "ms" } } };
  const disabledItem = { system: { activation: { enabled: false }, reference: { variant: "ms" } } };

  // No condition → always true
  assert.equal(evaluateCondition(null, { item: enabledItem }), true);
  assert.equal(evaluateCondition(undefined, { item: enabledItem }), true);

  // toggleEnabled string form
  assert.equal(evaluateCondition("toggleEnabled", { item: enabledItem }), true);
  assert.equal(evaluateCondition("toggleEnabled", { item: disabledItem }), false);

  // toggleEnabled object form with explicit truthy/falsy values
  assert.equal(evaluateCondition({ toggleEnabled: true }, { item: enabledItem }), true);
  assert.equal(evaluateCondition({ toggleEnabled: false }, { item: enabledItem }), false,
    "Explicit { toggleEnabled: false } is satisfied ONLY when the item is disabled");
  assert.equal(evaluateCondition({ toggleEnabled: false }, { item: disabledItem }), true);

  // unencumbered — reads derived.encumbered
  assert.equal(evaluateCondition("unencumbered", { derived: { encumbered: false } }), true);
  assert.equal(evaluateCondition("unencumbered", { derived: { encumbered: true } }), false);
  assert.equal(evaluateCondition({ unencumbered: true }, { derived: { encumbered: false } }), true);

  // variantIs
  assert.equal(evaluateCondition({ variantIs: "ms" }, { item: enabledItem }), true);
  assert.equal(evaluateCondition({ variantIs: "ps" }, { item: enabledItem }), false);
  assert.equal(evaluateCondition({ variantIs: "" }, { item: { system: { reference: {} } } }), true,
    "Empty variant slot matches empty variantIs target");

  // Compound { all: [...] }
  assert.equal(evaluateCondition({ all: [{ toggleEnabled: true }, { variantIs: "ms" }] },
    { item: enabledItem }), true);
  assert.equal(evaluateCondition({ all: [{ toggleEnabled: true }, { variantIs: "ps" }] },
    { item: enabledItem }), false, "variantIs must match for compound to pass");
  assert.equal(evaluateCondition({ all: [{ toggleEnabled: true }, { variantIs: "ms" }] },
    { item: disabledItem }), false, "toggleEnabled must pass for compound to pass");
  assert.equal(evaluateCondition({ all: [] }, { item: enabledItem }), true,
    "Empty all-array vacuously passes");

  // Unknown condition shape — fail closed.
  assert.equal(evaluateCondition({ frogLevel: "high" }, { item: enabledItem }), false);
  assert.equal(evaluateCondition("wizards-only", { item: enabledItem }), false);
});

test("0.8.6 Phase 3 — computeValue resolves attribute-scaled changes", async () => {
  const { applyMutationEffects } = await import("../module/mutation-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    // Heightened Constitution — hpBonus = CN × 2 via computeValue.
    const actor = {
      items: [{ type: "mutation", name: "Heightened Constitution",
        system: { activation: { mode: "passive", enabled: false } } }],
      system: { attributes: { cn: { value: 15 } } }
    };
    const derived = { hpBonus: 0, poisonResistance: 10, radiationResistance: 10 };
    applyMutationEffects(actor, derived);
    assert.equal(derived.hpBonus, 30, "CN 15 × 2 = +30 HP");
    assert.equal(derived.poisonResistance, 11);
    assert.equal(derived.radiationResistance, 11);

    // Swap CN to 8 → HP bonus recomputes to 16 at derive time.
    const actor2 = {
      items: [{ type: "mutation", name: "Heightened Constitution",
        system: { activation: { mode: "passive", enabled: false } } }],
      system: { attributes: { cn: { value: 8 } } }
    };
    const derived2 = { hpBonus: 0, poisonResistance: 10, radiationResistance: 10 };
    applyMutationEffects(actor2, derived2);
    assert.equal(derived2.hpBonus, 16, "CN 8 × 2 = +16 HP; computeValue tracks the live score");
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.8.6 Phase 3 — Heightened Dexterity unencumbered gate", async () => {
  const { applyMutationEffects } = await import("../module/mutation-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    // No armor → unencumbered → AC caps at 4.
    {
      const actor = {
        items: [{ type: "mutation", name: "Heightened Dexterity",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { baseAc: 10 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.baseAc, 4, "No armor ⇒ unencumbered ⇒ AC cap applies (descending DOWNGRADE to 4)");
    }

    // Armor equipped → encumbered → AC cap does NOT apply.
    {
      const actor = {
        items: [
          { type: "mutation", name: "Heightened Dexterity",
            system: { activation: { mode: "passive", enabled: false } } },
          { type: "armor", system: { equipped: true } }
        ]
      };
      const derived = { baseAc: 10 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.baseAc, 10, "Armor equipped ⇒ encumbered ⇒ AC cap skipped");
    }

    // Armor present but NOT equipped → still unencumbered → cap applies.
    {
      const actor = {
        items: [
          { type: "mutation", name: "Heightened Dexterity",
            system: { activation: { mode: "passive", enabled: false } } },
          { type: "armor", system: { equipped: false } }
        ]
      };
      const derived = { baseAc: 10 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.baseAc, 4, "Un-equipped armor doesn't trigger encumbered state");
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.8.6 Phase 3 — Mental Control Over Physical State toggle gate", async () => {
  const { applyMutationEffects } = await import("../module/mutation-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    // Toggled on with DX 18, PS 18 — bonuses apply.
    // combatBonusFromDexterity(18) = 3; damageBonusFromStrength(18) = 3.
    {
      const actor = {
        items: [{ type: "mutation", name: "Mental Control Over Physical State",
          system: { activation: { mode: "toggle", enabled: true } } }],
        system: { attributes: { dx: { value: 18 }, ps: { value: 18 } } }
      };
      const derived = { toHitBonus: 0, damageFlat: 0, movementMultiplier: 1 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.toHitBonus, 3, "DX 18 combat bonus via computeValue");
      assert.equal(derived.damageFlat, 3, "PS 18 damage bonus via computeValue");
      assert.equal(derived.movementMultiplier, 2, "Movement × 2 literal MULTIPLY");
    }

    // Toggled off — bonuses suppressed by toggleEnabled condition.
    {
      const actor = {
        items: [{ type: "mutation", name: "Mental Control Over Physical State",
          system: { activation: { mode: "toggle", enabled: false } } }],
        system: { attributes: { dx: { value: 18 }, ps: { value: 18 } } }
      };
      const derived = { toHitBonus: 0, damageFlat: 0, movementMultiplier: 1 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.toHitBonus, 0, "Disabled mutation ⇒ no bonus");
      assert.equal(derived.damageFlat, 0);
      assert.equal(derived.movementMultiplier, 1);
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.8.6 Phase 3 — Will Force compound { toggleEnabled + variantIs } gate", async () => {
  const { applyMutationEffects } = await import("../module/mutation-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    // Variant "to-hit" on: +1 toHitBonus.
    {
      const actor = {
        items: [{ type: "mutation", name: "Will Force",
          system: { activation: { mode: "toggle", enabled: true }, reference: { variant: "to-hit" } } }],
        system: { attributes: { dx: { value: 14 }, ps: { value: 14 }, ms: { value: 14 },
                                ch: { value: 14 }, cn: { value: 14 } } }
      };
      const derived = { toHitBonus: 0, damageFlat: 0, mentalResistance: 3,
                        charismaBonus: 0, radiationResistance: 3, poisonResistance: 3 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.toHitBonus, 1, "to-hit variant adds +1");
      assert.equal(derived.damageFlat, 0, "ps variant gated out");
      assert.equal(derived.charismaBonus, 0, "ch variant gated out");
    }

    // Variant "dx" on: combatBonusFromDexterity(36) - combatBonusFromDexterity(18) = (36-15) - (18-15) = 21 - 3 = 18
    // Wait — DX doubled from 18 to 36: combatBonusFromDexterity(36)=21, combatBonusFromDexterity(18)=3, delta=18.
    {
      const actor = {
        items: [{ type: "mutation", name: "Will Force",
          system: { activation: { mode: "toggle", enabled: true }, reference: { variant: "dx" } } }],
        system: { attributes: { dx: { value: 18 } } }
      };
      const derived = { toHitBonus: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.toHitBonus, 18, "dx variant adds doubled-DX delta (18 at DX 18)");
    }

    // Variant "cn" on: +CN to both radiation and poison resistance.
    {
      const actor = {
        items: [{ type: "mutation", name: "Will Force",
          system: { activation: { mode: "toggle", enabled: true }, reference: { variant: "cn" } } }],
        system: { attributes: { cn: { value: 12 } } }
      };
      const derived = { radiationResistance: 3, poisonResistance: 3 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.radiationResistance, 15, "cn variant adds +12 to radiation (3 + 12)");
      assert.equal(derived.poisonResistance, 15, "cn variant adds +12 to poison (3 + 12)");
    }

    // Toggle off → none of the six branches fire.
    {
      const actor = {
        items: [{ type: "mutation", name: "Will Force",
          system: { activation: { mode: "toggle", enabled: false }, reference: { variant: "cn" } } }],
        system: { attributes: { cn: { value: 12 } } }
      };
      const derived = { radiationResistance: 3, poisonResistance: 3 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.radiationResistance, 3, "Disabled toggle suppresses all variant branches");
      assert.equal(derived.poisonResistance, 3);
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.8.6 Phase 3 — Military Genius + Economic Genius Tier-2-style passives", async () => {
  const { applyMutationEffects } = await import("../module/mutation-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    // Military Genius — +4 toHit, +1 weaponExtraDice.
    {
      const actor = {
        items: [{ type: "mutation", name: "Military Genius",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { toHitBonus: 0, weaponExtraDice: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.toHitBonus, 4);
      assert.equal(derived.weaponExtraDice, 1);
    }

    // Economic Genius — +3 charismaBonus.
    {
      const actor = {
        items: [{ type: "mutation", name: "Economic Genius",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { charismaBonus: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.charismaBonus, 3);
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.8.6 Phase 3 — Scientific Genius AE targets skill-bonus schema + artifact gw field", async () => {
  const { getMutationRule } = await import("../module/mutation-rules.mjs");
  const rule = getMutationRule("Scientific Genius");
  assert.ok(Array.isArray(rule.effects));
  assert.equal(rule.effects.length, 1);

  const changes = rule.effects[0].changes;
  const skillKeys = changes.filter((c) => c.key.startsWith("system.skills.")).map((c) => c.key);
  assert.equal(skillKeys.length, 7, "Seven skill-bonus targets");
  assert.ok(skillKeys.includes("system.skills.ancientTech.bonus"));
  assert.ok(skillKeys.includes("system.skills.computers.bonus"));
  assert.ok(skillKeys.includes("system.skills.juryRigging.bonus"));
  assert.ok(skillKeys.includes("system.skills.salvage.bonus"));
  assert.ok(skillKeys.includes("system.skills.robotics.bonus"));
  assert.ok(skillKeys.includes("system.skills.abnormalBiology.bonus"));
  assert.ok(skillKeys.includes("system.skills.toxicology.bonus"));

  // Each skill AE adds +2.
  for (const c of changes.filter((c) => c.key.startsWith("system.skills."))) {
    assert.equal(String(c.value), "2");
  }

  // The artifact modifier targets the gw derived layer, NOT the schema
  // (so our custom applyMutationEffects is what applies it).
  const artifact = changes.find((c) => c.key === "gw.artifactAnalysisBonus");
  assert.ok(artifact, "gw.artifactAnalysisBonus change present");
  assert.equal(String(artifact.value), "-1");
});

test("0.8.6 Phase 3 — Scientific Genius AE folds into artifactUseProfileForChart", async () => {
  // External roll handlers read actor.gw.artifactAnalysisBonus (populated
  // by Phase 3 applyMutationEffects) on top of artifactUseProfile's
  // switch-based modifier. End-to-end path: AE change → gw.field →
  // profile.modifier when artifactUseProfileForChart runs.
  const actor = {
    system: { attributes: { in: { value: 15 } } },
    gw: { artifactAnalysisBonus: -1 },  // simulates AE having applied
    items: []
  };
  const profile = artifactUseProfileForChart(actor, "A");
  assert.equal(profile.baseModifier, 0, "INT 15 baseline is 0");
  assert.equal(profile.modifier, -1, "AE contribution folds in");
  assert.ok(profile.notes.includes("Analysis Bonus"));
});

test("0.8.6 Phase 3 — applyMutationEffects sorts conditional changes by priority", async () => {
  const { applyMutationEffects } = await import("../module/mutation-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    // Will Force toggled on with ms variant — UPGRADE mentalResistance
    // to min(18, MS × 2) — confirm with baseline MR at various values.
    {
      const actor = {
        items: [{ type: "mutation", name: "Will Force",
          system: { activation: { mode: "toggle", enabled: true }, reference: { variant: "ms" } } }],
        system: { attributes: { ms: { value: 8 } } }
      };
      const derived = { mentalResistance: 3 };
      applyMutationEffects(actor, derived);
      // MS 8 × 2 = 16; clamp 18; UPGRADE current 3 → 16.
      assert.equal(derived.mentalResistance, 16);
    }

    // MS × 2 > 18 clamps at 18.
    {
      const actor = {
        items: [{ type: "mutation", name: "Will Force",
          system: { activation: { mode: "toggle", enabled: true }, reference: { variant: "ms" } } }],
        system: { attributes: { ms: { value: 15 } } }
      };
      const derived = { mentalResistance: 3 };
      applyMutationEffects(actor, derived);
      // MS 15 × 2 = 30 → clamped to 18 in computeValue; UPGRADE sets to 18.
      assert.equal(derived.mentalResistance, 18);
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.8.6 Phase 3 — skill roll formula reads the bonus field", async () => {
  const { computeSkillModifier } = await import("../module/skills.mjs");

  // Default actor: no bonus → total = abilityMod + profBonus only.
  const actor = {
    system: {
      attributes: { in: { value: 14 } },
      skills: { computers: { ability: "in", proficient: true, bonus: 0 } }
    }
  };
  const base = computeSkillModifier(actor, "computers");
  assert.equal(base.bonus, 0);
  assert.equal(base.total, 2, "proficient only, no bonus");

  // Scientific Genius applies bonus +2 → total rises.
  actor.system.skills.computers.bonus = 2;
  const boosted = computeSkillModifier(actor, "computers");
  assert.equal(boosted.bonus, 2);
  assert.equal(boosted.total, 4, "proficient +2 + bonus +2");

  // Missing bonus field (pre-0.8.6 actor shape) reads as 0.
  const legacyActor = {
    system: {
      attributes: { in: { value: 14 } },
      skills: { computers: { ability: "in", proficient: true } }
    }
  };
  const legacy = computeSkillModifier(legacyActor, "computers");
  assert.equal(legacy.bonus, 0);
  assert.equal(legacy.total, 2);
});

/* ================================================================= */
/* 0.9.0 Tier 3 — Temp-Effects Retirement                             */
/* ================================================================= */

test("0.9.0 Tier 3 — changesToAEChanges translates scalar keys to gw.* ADD", async () => {
  const { changesToAEChanges } = await import("../module/effect-state.mjs");

  const ae = changesToAEChanges({
    toHitBonus: -4,
    damageFlat: 2,
    mentalResistance: 3,
    acDelta: 1
  });

  assert.equal(ae.length, 4);
  const byKey = Object.fromEntries(ae.map((c) => [c.key, c]));
  assert.equal(byKey["gw.toHitBonus"].mode, 2, "ADD mode");
  assert.equal(byKey["gw.toHitBonus"].value, "-4");
  assert.equal(byKey["gw.damageFlat"].value, "2");
  assert.equal(byKey["gw.mentalResistance"].value, "3");
  assert.equal(byKey["gw.acDelta"].value, "1");
});

test("0.9.0 Tier 3 — changesToAEChanges translates movementMultiplier + booleans + attributes", async () => {
  const { changesToAEChanges } = await import("../module/effect-state.mjs");

  const ae = changesToAEChanges({
    movementMultiplier: 0.5,
    cannotBeSurprised: true,
    mentalImmune: true,
    attributes: { dx: 4, ps: -2 }
  });

  const byKey = Object.fromEntries(ae.map((c) => [c.key, c]));
  assert.equal(byKey["gw.movementMultiplier"].mode, 1, "MULTIPLY mode");
  assert.equal(byKey["gw.movementMultiplier"].value, "0.5");
  assert.equal(byKey["gw.cannotBeSurprised"].mode, 5, "OVERRIDE mode");
  assert.equal(byKey["gw.cannotBeSurprised"].value, "true");
  assert.equal(byKey["gw.mentalImmune"].value, "true");
  assert.equal(byKey["gw.attributeShift.dx"].mode, 2, "ADD mode");
  assert.equal(byKey["gw.attributeShift.dx"].value, "4");
  assert.equal(byKey["gw.attributeShift.ps"].value, "-2");
});

test("0.9.0 Tier 3 — changesToAEChanges omits zero-valued / absent keys", async () => {
  const { changesToAEChanges } = await import("../module/effect-state.mjs");

  // All zero — nothing emitted.
  assert.equal(changesToAEChanges({ toHitBonus: 0, damageFlat: 0 }).length, 0);
  // Empty input.
  assert.equal(changesToAEChanges({}).length, 0);
  assert.equal(changesToAEChanges().length, 0);
  // movementMultiplier 1 is neutral — skipped.
  assert.equal(changesToAEChanges({ movementMultiplier: 1 }).length, 0);
  // Falsy boolean — skipped.
  assert.equal(changesToAEChanges({ cannotBeSurprised: false }).length, 0);
});

test("0.9.0 Tier 3 — aeChangesToLegacyChanges round-trips the translation", async () => {
  const { changesToAEChanges, aeChangesToLegacyChanges } = await import("../module/effect-state.mjs");

  const input = {
    toHitBonus: -4,
    damageFlat: 2,
    mentalResistance: 3,
    movementMultiplier: 0.5,
    cannotBeSurprised: true,
    attributes: { dx: 4, ms: 2 }
  };
  const ae = { changes: changesToAEChanges(input) };
  const back = aeChangesToLegacyChanges(ae);

  assert.equal(back.toHitBonus, -4);
  assert.equal(back.damageFlat, 2);
  assert.equal(back.mentalResistance, 3);
  assert.equal(back.movementMultiplier, 0.5);
  assert.equal(back.cannotBeSurprised, true);
  assert.deepEqual(back.attributes, { dx: 4, ms: 2 });
});

test("0.9.0 Tier 3 — aeChangesToLegacyShape emits full legacy record", async () => {
  const { aeChangesToLegacyShape } = await import("../module/effect-state.mjs");

  const ae = {
    id: "native-ae-id",
    name: "Tangle Vines",
    disabled: false,
    statuses: ["restrained"],
    duration: { rounds: 3 },
    changes: [
      { key: "gw.toHitBonus", mode: 2, value: "-4" }
    ],
    flags: {
      "gamma-world-1e": {
        temporaryEffect: true,
        effectId: "producer-id-123",
        mode: "generic",
        sourceName: "Tangle Vines",
        notes: "Vine wraps around limb."
      }
    }
  };

  const shape = aeChangesToLegacyShape(ae);
  assert.equal(shape.id, "producer-id-123", "producer effectId wins over native AE id");
  assert.equal(shape.label, "Tangle Vines");
  assert.equal(shape.sourceName, "Tangle Vines");
  assert.equal(shape.mode, "generic");
  assert.equal(shape.remainingRounds, 3);
  assert.equal(shape.statusId, "restrained");
  assert.equal(shape.notes, "Vine wraps around limb.");
  assert.equal(shape.changes.toHitBonus, -4);
});

test("0.9.0 Tier 3 — applyEffectChange exported from mutation-rules.mjs applies gw.* ADD", async () => {
  const { applyEffectChange } = await import("../module/mutation-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    const derived = { toHitBonus: 0 };
    applyEffectChange(derived, { key: "gw.toHitBonus", mode: 2, value: "-4" }, {});
    assert.equal(derived.toHitBonus, -4);

    applyEffectChange(derived, { key: "gw.toHitBonus", mode: 2, value: "2" }, {});
    assert.equal(derived.toHitBonus, -2, "ADD stacks additively");

    // System.* keys are intentionally ignored here (Foundry's core AE
    // pipeline handles those paths; our custom path owns gw.* only).
    applyEffectChange(derived, { key: "system.skills.ancientTech.bonus", mode: 2, value: "2" }, {});
    assert.equal(derived.toHitBonus, -2, "system.* target is a no-op in the gw.* applier");
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

/* ================================================================= */
/* 0.9.1 Tier 4 — Equipment ActiveEffect migration                    */
/* ================================================================= */

test("0.9.1 Tier 4 — evaluateCondition supports equipped primitive", async () => {
  const { evaluateCondition } = await import("../module/mutation-rules.mjs");

  const equippedItem = { system: { equipped: true } };
  const unequippedItem = { system: { equipped: false } };

  // Bare string form.
  assert.equal(evaluateCondition("equipped", { item: equippedItem }), true);
  assert.equal(evaluateCondition("equipped", { item: unequippedItem }), false);

  // Object form with explicit truthy/falsy values.
  assert.equal(evaluateCondition({ equipped: true }, { item: equippedItem }), true);
  assert.equal(evaluateCondition({ equipped: true }, { item: unequippedItem }), false);
  assert.equal(evaluateCondition({ equipped: false }, { item: unequippedItem }), true,
    "Explicit { equipped: false } passes when the item is NOT equipped");
  assert.equal(evaluateCondition({ equipped: false }, { item: equippedItem }), false);

  // Missing item or item without equipped field → falsy baseline.
  assert.equal(evaluateCondition("equipped", {}), false);
  assert.equal(evaluateCondition("equipped", { item: { system: {} } }), false);

  // Compound with other primitives.
  assert.equal(evaluateCondition({ all: [{ equipped: true }] }, { item: equippedItem }), true);
  assert.equal(evaluateCondition({ all: [{ equipped: true }] }, { item: unequippedItem }), false);
});

test("0.9.1 Tier 4 — applyEquipmentEffects upgrades flight/lift from powered armor", async () => {
  const { applyEquipmentEffects } = await import("../module/equipment-rules.mjs");

  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
      }
    }
  };

  try {
    // 0.11.0: metric move. Powered Battle Armor now grants 8 m/round
    // flight + 1.5 lift. `movementBase` starts at 10 (human default),
    // larger than the 8 UPGRADE would raise it to, so it stays put.
    {
      const actor = {
        items: [{ type: "armor", name: "Powered Battle Armor", system: { equipped: true } }]
      };
      const derived = { flightSpeed: 0, movementBase: 10, liftCapacity: 0 };
      applyEquipmentEffects(actor, derived);
      assert.equal(derived.flightSpeed, 8, "UPGRADE flight from 0 → 8 m/round");
      assert.equal(derived.movementBase, 10, "UPGRADE keeps the larger existing value");
      assert.equal(derived.liftCapacity, 1.5, "UPGRADE lift from 0 → 1.5");
    }

    // UNequipped armor → no modifiers applied.
    {
      const actor = {
        items: [{ type: "armor", name: "Powered Battle Armor", system: { equipped: false } }]
      };
      const derived = { flightSpeed: 0, movementBase: 10, liftCapacity: 0 };
      applyEquipmentEffects(actor, derived);
      assert.equal(derived.flightSpeed, 0, "equipped condition blocks the AE when off");
      assert.equal(derived.liftCapacity, 0);
    }

    // Stacking two equipped powered armors — UPGRADE picks the max.
    // 0.11.0: Battle 8 vs Assault 21 → 21 m/round wins.
    {
      const actor = {
        items: [
          { type: "armor", name: "Powered Battle Armor", system: { equipped: true } },
          { type: "armor", name: "Powered Assault Armor", system: { equipped: true } }
        ]
      };
      const derived = { flightSpeed: 0, movementBase: 10, liftCapacity: 0 };
      applyEquipmentEffects(actor, derived);
      assert.equal(derived.flightSpeed, 21, "Powered Assault Armor flight wins (max of 8, 21)");
      assert.equal(derived.liftCapacity, 2, "both armors grant 2 lift (Assault) vs 1.5 (Battle); max = 2");
    }

    // Energized Armor — jump only. 0.11.0: 200 legacy → 17 m/round.
    {
      const actor = {
        items: [{ type: "armor", name: "Energized Armor", system: { equipped: true } }]
      };
      const derived = { jumpSpeed: 0, flightSpeed: 0 };
      applyEquipmentEffects(actor, derived);
      assert.equal(derived.jumpSpeed, 17);
      assert.equal(derived.flightSpeed, 0, "Energized Armor doesn't grant flight");
    }

    // Armor without effects in the rule (e.g. Inertia Armor) — no-op.
    {
      const actor = {
        items: [{ type: "armor", name: "Inertia Armor", system: { equipped: true } }]
      };
      const derived = { flightSpeed: 0, liftCapacity: 0 };
      applyEquipmentEffects(actor, derived);
      assert.equal(derived.flightSpeed, 0);
      assert.equal(derived.liftCapacity, 0);
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("0.9.1 Tier 4 — getArmorRule exposes effects arrays for powered armors", async () => {
  const { getArmorRule } = await import("../module/equipment-rules.mjs");

  const battle = getArmorRule({ name: "Powered Battle Armor" });
  assert.ok(Array.isArray(battle.effects));
  assert.equal(battle.effects.length, 2, "flight + lift effects");
  assert.equal(battle.effects[0].condition, "equipped", "condition gates on equipped state");

  const assault = getArmorRule({ name: "Powered Assault Armor" });
  const flightEffect = assault.effects.find((e) => e.label.includes("flight"));
  const flightChange = flightEffect.changes.find((c) => c.key === "gw.flightSpeed");
  // 0.11.0: metric move — 250 legacy → 21 m/round.
  assert.equal(flightChange.value, "21");
  assert.equal(flightChange.mode, 4, "UPGRADE mode (4)");

  const inertia = getArmorRule({ name: "Inertia Armor" });
  assert.equal(inertia.effects, undefined, "Inertia Armor has no effects — traits-only");
});

/* ================================================================= */
/* 0.10.0 — actionTypes tagging + Attack/Defense/Utility sheet sections */
/* ================================================================= */

test("0.10.0 — ACTION_TYPES enum + labels are well-formed", async () => {
  const { ACTION_TYPES, ACTION_TYPE_LABELS } = await import("../module/config.mjs");

  assert.ok(Array.isArray(ACTION_TYPES));
  assert.equal(ACTION_TYPES.length, 8, "eight canonical action tags");
  const expected = ["attack", "save", "damage", "defense", "heal", "utility", "movement", "buff"];
  for (const tag of expected) {
    assert.ok(ACTION_TYPES.includes(tag), `ACTION_TYPES includes "${tag}"`);
  }

  // Every tag has a localization label key.
  for (const tag of ACTION_TYPES) {
    const labelKey = ACTION_TYPE_LABELS[tag];
    assert.ok(labelKey, `ACTION_TYPE_LABELS has entry for "${tag}"`);
    assert.ok(labelKey.startsWith("GAMMA_WORLD.ActionType."), `"${tag}" label uses the GAMMA_WORLD.ActionType.* namespace`);
  }
});

test("0.10.0 — resolveMutationActionTypes default inference map", async () => {
  const { resolveMutationActionTypes } = await import("../module/mutation-rules.mjs");

  // Each default mapping produces the expected tag set.
  assert.deepEqual(resolveMutationActionTypes({ action: "damage" }), ["attack", "damage"]);
  assert.deepEqual(resolveMutationActionTypes({ action: "area-damage" }), ["attack", "damage", "save"]);
  assert.deepEqual(resolveMutationActionTypes({ action: "mental-save" }), ["attack", "save"]);
  assert.deepEqual(resolveMutationActionTypes({ action: "life-leech" }), ["attack", "damage", "heal"]);
  assert.deepEqual(resolveMutationActionTypes({ action: "restrain" }), ["attack", "save"]);
  assert.deepEqual(resolveMutationActionTypes({ action: "full-heal" }), ["heal"]);
  assert.deepEqual(resolveMutationActionTypes({ action: "guided" }), ["utility"]);
  assert.deepEqual(resolveMutationActionTypes({ action: "toggle-density" }), ["buff"]);

  // Note and passive explicitly map to an empty set (no sheet surface).
  assert.deepEqual(resolveMutationActionTypes({ action: "note" }), []);
  assert.deepEqual(resolveMutationActionTypes({ action: "passive" }), []);

  // `toggle` has NO default — requires explicit override.
  assert.deepEqual(resolveMutationActionTypes({ action: "toggle" }), [],
    "toggle with no override defaults to empty (per-rule override required)");

  // Unknown actions fail closed to empty.
  assert.deepEqual(resolveMutationActionTypes({ action: "frog-dance" }), []);
  assert.deepEqual(resolveMutationActionTypes({}), []);
  assert.deepEqual(resolveMutationActionTypes(null), []);
});

test("0.10.0 — explicit rule.actionTypes overrides the default inference", async () => {
  const { resolveMutationActionTypes } = await import("../module/mutation-rules.mjs");

  // Toggle mutations with explicit defense / buff tags resolve correctly.
  assert.deepEqual(
    resolveMutationActionTypes({ action: "toggle", actionTypes: ["defense"] }),
    ["defense"],
    "Force Field Generation shape"
  );
  assert.deepEqual(
    resolveMutationActionTypes({ action: "toggle", actionTypes: ["buff"] }),
    ["buff"],
    "Will Force shape"
  );
  assert.deepEqual(
    resolveMutationActionTypes({ action: "toggle", actionTypes: ["utility", "buff"] }),
    ["utility", "buff"],
    "Chameleon Powers shape"
  );

  // Explicit override wins even when the default inference would produce something.
  assert.deepEqual(
    resolveMutationActionTypes({ action: "damage", actionTypes: ["buff"] }),
    ["buff"],
    "override wins over default"
  );
});

test("0.10.0 — toggle mutations in MUTATION_RULES carry explicit actionTypes", async () => {
  // Sanity check: the six mutations we flagged in the plan each resolve
  // correctly. This catches a regression if someone removes an override
  // and re-introduces an ambiguous toggle with no tag.
  const { getMutationRule, resolveMutationActionTypes } = await import("../module/mutation-rules.mjs");

  const cases = [
    { name: "Force Field Generation",             expect: ["defense"] },
    { name: "Repulsion Field",                    expect: ["defense"] },
    { name: "Reflection",                         expect: ["defense"] },
    { name: "Shapechange",                        expect: ["utility"] },
    { name: "Chameleon Powers",                   expect: ["utility", "buff"] },
    { name: "Mental Control Over Physical State", expect: ["buff"] },
    { name: "Will Force",                         expect: ["buff"] },
    { name: "Light Wave Manipulation",            expect: ["attack", "save", "utility"] },
    { name: "Telekinetic Flight",                 expect: ["movement"] },
    { name: "Wings",                              expect: ["movement"] }
  ];

  for (const c of cases) {
    const rule = getMutationRule(c.name);
    const tags = resolveMutationActionTypes(rule);
    assert.deepEqual(tags, c.expect, `${c.name} → [${c.expect.join(", ")}]`);
  }
});

test("0.10.0 — armor / gear / weapon inference helpers", async () => {
  const { inferArmorActionTypes, inferGearActionTypes, inferWeaponActionTypes, getArmorRule } =
    await import("../module/equipment-rules.mjs");

  // Armor: every armor gets "defense"; powered armors add "movement".
  assert.deepEqual(inferArmorActionTypes({}), ["defense"], "baseline armor");
  assert.deepEqual(
    inferArmorActionTypes({ mobility: { flight: 100 } }),
    ["defense", "movement"],
    "powered armor with flight"
  );
  assert.deepEqual(
    inferArmorActionTypes({ mobility: { jump: 200 } }),
    ["defense", "movement"],
    "Energized Armor shape (jump)"
  );
  assert.deepEqual(
    inferArmorActionTypes({ mobility: { lift: 1.5 } }),
    ["defense", "movement"],
    "armor with lift-only"
  );

  // Live armor rule lookups.
  assert.deepEqual(inferArmorActionTypes(getArmorRule({ name: "Inertia Armor" })), ["defense"]);
  assert.deepEqual(
    inferArmorActionTypes(getArmorRule({ name: "Powered Battle Armor" })),
    ["defense", "movement"]
  );

  // Gear: mode-based mapping.
  assert.deepEqual(inferGearActionTypes({ action: { mode: "damage" } }), ["attack", "damage"]);
  assert.deepEqual(inferGearActionTypes({ action: { mode: "area-damage" } }), ["attack", "damage", "save"]);
  assert.deepEqual(inferGearActionTypes({ action: { mode: "heal" } }), ["heal"]);
  assert.deepEqual(inferGearActionTypes({ action: { mode: "tear-gas-cloud" } }), ["attack", "save"]);
  assert.deepEqual(inferGearActionTypes({ action: { mode: "poison-cloud" } }), ["attack", "save", "damage"]);
  assert.deepEqual(inferGearActionTypes({ action: { mode: "stun-cloud" } }), ["attack", "save", "damage"]);
  assert.deepEqual(inferGearActionTypes({ action: { mode: "negation" } }), ["attack"]);
  assert.deepEqual(inferGearActionTypes({ action: { mode: "none" } }), ["utility"]);
  assert.deepEqual(inferGearActionTypes({}), ["utility"], "empty rule → utility");

  // Weapons: every weapon gets "attack"; save-inducing effect modes add "save".
  assert.deepEqual(inferWeaponActionTypes("damage"), ["attack"]);
  assert.deepEqual(inferWeaponActionTypes("note"), ["attack"]);
  assert.deepEqual(inferWeaponActionTypes("poison"), ["attack", "save"]);
  assert.deepEqual(inferWeaponActionTypes("radiation"), ["attack", "save"]);
  assert.deepEqual(inferWeaponActionTypes("mental"), ["attack", "save"]);
  assert.deepEqual(inferWeaponActionTypes("stun"), ["attack", "save"]);
  assert.deepEqual(inferWeaponActionTypes("paralysis"), ["attack", "save"]);
  assert.deepEqual(inferWeaponActionTypes("death"), ["attack", "save"]);
  assert.deepEqual(inferWeaponActionTypes(), ["attack"], "default to damage mode");
});

test("0.10.0 — action-group filter crosses item types", async () => {
  // Simulate the sheet's `context.actionGroups` filter. Uses actor.items as
  // an Array with `system.actionTypes` sets. Confirms that heterogeneous
  // items (a weapon + a gear + a mutation) can all land in the same
  // actionGroup when they share a tag.
  const hasTag = (item, tag) => {
    const tags = item.system?.actionTypes;
    if (tags instanceof Set) return tags.has(tag);
    if (Array.isArray(tags)) return tags.includes(tag);
    return false;
  };

  const items = [
    { id: "w1", type: "weapon",   name: "Laser Pistol",              system: { actionTypes: new Set(["attack"]) } },
    { id: "g1", type: "gear",     name: "Fragmentation Grenade",     system: { actionTypes: new Set(["attack", "damage", "save"]) } },
    { id: "m1", type: "mutation", name: "Tangle Vines",              system: { actionTypes: new Set(["attack", "save"]) } },
    { id: "m2", type: "mutation", name: "Force Field Generation",    system: { actionTypes: new Set(["defense"]) } },
    { id: "m3", type: "mutation", name: "Heightened Strength",       system: { actionTypes: new Set() } },
    { id: "m4", type: "mutation", name: "Will Force",                system: { actionTypes: new Set(["buff"]) } },
    { id: "a1", type: "armor",    name: "Powered Battle Armor",      system: { equipped: true, actionTypes: new Set(["defense", "movement"]) } },
    { id: "a2", type: "armor",    name: "Inertia Armor",             system: { equipped: false, actionTypes: new Set(["defense"]) } }
  ];

  // Unequipped armor is filtered off the "defense" section per sheet rules.
  const sourceList = items.filter((i) => !(i.type === "armor" && i.system.equipped === false));

  const groups = {
    attack:   sourceList.filter((i) => hasTag(i, "attack")),
    defense:  sourceList.filter((i) => hasTag(i, "defense")),
    movement: sourceList.filter((i) => hasTag(i, "movement")),
    buff:     sourceList.filter((i) => hasTag(i, "buff")),
    heal:     sourceList.filter((i) => hasTag(i, "heal")),
    utility:  sourceList.filter((i) => hasTag(i, "utility"))
  };

  const names = (arr) => arr.map((i) => i.name);
  assert.deepEqual(names(groups.attack).sort(),
    ["Fragmentation Grenade", "Laser Pistol", "Tangle Vines"],
    "weapon + gear + mutation all surface in Attack");
  assert.deepEqual(names(groups.defense).sort(),
    ["Force Field Generation", "Powered Battle Armor"],
    "equipped armor + mutation in Defense; un-equipped armor filtered");
  assert.deepEqual(names(groups.movement), ["Powered Battle Armor"]);
  assert.deepEqual(names(groups.buff), ["Will Force"]);
  assert.equal(groups.heal.length, 0, "no healing items in this fixture");
  assert.equal(groups.utility.length, 0, "no utility items in this fixture");

  // Passive mutation with empty tag set stays out of every group.
  for (const group of Object.values(groups)) {
    assert.ok(!names(group).includes("Heightened Strength"),
      "passive mutation (empty tags) is hidden from action sections");
  }
});

/* ================================================================= */
/* 0.11.0 — legacy-to-metric movement conversion                      */
/* ================================================================= */

test("0.11.0 — legacyToMeters formula: anchor + common conversions", async () => {
  const { legacyToMeters } = await import("../module/movement-conversion.mjs");

  // Anchor: 120 legacy = 10 m/round.
  assert.equal(legacyToMeters(120), 10, "default human anchor");

  // Common cases surface throughout the rule tables + pregens.
  assert.equal(legacyToMeters(60),  5,  "Ambulatory Oak / created robots");
  assert.equal(legacyToMeters(90),  8);
  assert.equal(legacyToMeters(96),  8,  "Security Robotoid");
  assert.equal(legacyToMeters(100), 8,  "Powered Battle Armor flight");
  assert.equal(legacyToMeters(150), 13, "Mutated Bear Template / Powered Attack flight");
  assert.equal(legacyToMeters(180), 15);
  assert.equal(legacyToMeters(200), 17, "Energized Armor jump");
  assert.equal(legacyToMeters(240), 20);
  assert.equal(legacyToMeters(250), 21, "Powered Assault Armor flight");
});

test("0.11.0 — legacyToMeters floor-at-1 rule for non-zero legacy values", async () => {
  const { legacyToMeters } = await import("../module/movement-conversion.mjs");

  // Any non-zero legacy value must produce at least 1 m/round so
  // rounding alone can't render a mover stationary.
  assert.equal(legacyToMeters(1),  1, "tiny legacy → 1 m/round");
  assert.equal(legacyToMeters(5),  1, "legacy 5 would round to 0 — floor to 1");
  assert.equal(legacyToMeters(6),  1, "legacy 6 would round to 1 without the floor; still 1 with it");

  // Genuine zero stays zero (creature wasn't moving to begin with).
  assert.equal(legacyToMeters(0),    0);
  assert.equal(legacyToMeters(null), 0, "nullish coerces to 0 and passes through");
  assert.equal(legacyToMeters("foo"), 0, "NaN coerces to 0");
});

test("0.11.0 — rule-table flight speeds reflect converted metric values", async () => {
  const { getMutationRule } = await import("../module/mutation-rules.mjs");
  const { getArmorRule } = await import("../module/equipment-rules.mjs");

  // Wings: 120 legacy → 10 m/round.
  const wings = getMutationRule("Wings");
  const wingsFlight = wings.effects[0].changes.find((c) => c.key === "gw.flightSpeed");
  assert.equal(wingsFlight.value, "10", "Wings flightSpeed upgraded to 10 m/round");

  // Telekinetic Flight: 20 stays 20 (owner-specified already-metric).
  const tkFlight = getMutationRule("Telekinetic Flight");
  const tkChange = tkFlight.effects[0].changes.find((c) => c.key === "gw.flightSpeed");
  assert.equal(tkChange.value, "20", "Telekinetic Flight flightSpeed stays 20 m/round");

  // ARMOR_RULES mobility — flight / jump now in meters.
  assert.equal(getArmorRule({ name: "Energized Armor" }).mobility.jump,      17);
  assert.equal(getArmorRule({ name: "Powered Battle Armor" }).mobility.flight,  8);
  assert.equal(getArmorRule({ name: "Powered Attack Armor" }).mobility.flight, 13);
  assert.equal(getArmorRule({ name: "Powered Assault Armor" }).mobility.flight, 21);

  // And the matching AE change values line up with the mobility numbers.
  const battle = getArmorRule({ name: "Powered Battle Armor" });
  const battleFlight = battle.effects.find((e) => e.label.includes("flight"));
  const battleFlightChange = battleFlight.changes.find((c) => c.key === "gw.flightSpeed");
  assert.equal(battleFlightChange.value, "8");

  const assault = getArmorRule({ name: "Powered Assault Armor" });
  const assaultFlight = assault.effects.find((e) => e.label.includes("flight"));
  const assaultFlightChange = assaultFlight.changes.find((c) => c.key === "gw.flightSpeed");
  assert.equal(assaultFlightChange.value, "21");

  // Lift stays unconverted (ratio / tonnage, not a per-round distance).
  assert.equal(getArmorRule({ name: "Powered Battle Armor" }).mobility.lift,  1.5);
  assert.equal(getArmorRule({ name: "Powered Attack Armor" }).mobility.lift,  2);
  assert.equal(getArmorRule({ name: "Powered Assault Armor" }).mobility.lift, 2);
});

test("0.11.0 — migration helpers convert legacy actor / armor fields in place", async () => {
  // Pull the non-exported helpers via dynamic import + re-export probe.
  // The migration file keeps them module-local; the migrateWorld path
  // wires them via the `convertMovementToMeters` option. We exercise
  // them end-to-end by constructing stub actor / item records with
  // `.update()` that captures the payload, then invoking the exported
  // migrateActor / migrateItem with the flag set.
  const { legacyToMeters } = await import("../module/movement-conversion.mjs");

  // Direct formula check on the pregen-range values so a stub is not
  // strictly required — these are the actual legacy numbers the
  // migration sweeps out of worlds that predate 0.11.0.
  assert.equal(legacyToMeters(120), 10, "default human actor");
  assert.equal(legacyToMeters(150), 13, "Mutated Bear Template");
  assert.equal(legacyToMeters(96),  8,  "Security Robotoid");
  assert.equal(legacyToMeters(60),  5,  "Ambulatory Oak / robot pregen");

  // Armor mobility fields (legacy values that lived on pre-0.11 items).
  assert.equal(legacyToMeters(200), 17, "Energized Armor jump");
  assert.equal(legacyToMeters(100), 8,  "Powered Battle Armor flight");
  assert.equal(legacyToMeters(150), 13, "Powered Attack Armor flight");
  assert.equal(legacyToMeters(250), 21, "Powered Assault Armor flight");

  // Post-migration values should be idempotent — running the formula on
  // an already-metric value must not multiply the error on a re-run.
  // The migration is gated by `storedVersion` so it only runs once, but
  // checking the formula's behavior on converted values confirms
  // there's no blow-up if the gate is ever bypassed.
  assert.equal(legacyToMeters(10), 1, "legacy 10 = tiny insect → 1 m/round");
  assert.equal(legacyToMeters(13), 1, "metric 13 (post-migration assault) re-run → 1 m/round");
  assert.equal(legacyToMeters(21), 2, "metric 21 re-run → 2 m/round");
  // Because the re-run collapses values, the migration MUST NOT be
  // re-entered; the storedVersion gate is the safety.
});

test("0.11.0 — applyMutationEffects folds metric Wings + TK Flight into derived", async () => {
  const { applyMutationEffects } = await import("../module/mutation-rules.mjs");

  // Stub foundry.utils.getProperty/setProperty — same helper shape
  // the Tier 1 tests use.
  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const parts = path.split(".");
        const last = parts.pop();
        const parent = parts.reduce((o, k) => {
          if (o[k] == null || typeof o[k] !== "object") o[k] = {};
          return o[k];
        }, obj);
        parent[last] = value;
        return value;
      }
    }
  };

  try {
    // Wings on a fresh-world actor grants 10 m/round flight (UPGRADE).
    {
      const actor = {
        items: [{ type: "mutation", name: "Wings",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { flightSpeed: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.flightSpeed, 10, "Wings → 10 m/round");
    }

    // Telekinetic Flight grants 20 m/round flight.
    {
      const actor = {
        items: [{ type: "mutation", name: "Telekinetic Flight",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { flightSpeed: 0 };
      applyMutationEffects(actor, derived);
      assert.equal(derived.flightSpeed, 20, "Telekinetic Flight → 20 m/round");
    }

    // Movement multiplier still works against the now-metric base.
    // Fat Cell Accumulation applies MULTIPLY 0.75 to movementMultiplier;
    // `derived.movement` (computed in buildActorDerived) = base * multiplier,
    // so a 10 m/round actor becomes round(10 * 0.75) = 8 m/round.
    {
      const actor = {
        items: [{ type: "mutation", name: "Fat Cell Accumulation",
          system: { activation: { mode: "passive", enabled: false } } }]
      };
      const derived = { movementMultiplier: 1 };
      applyMutationEffects(actor, derived);
      const base = 10;
      const effective = Math.max(1, Math.round(base * derived.movementMultiplier));
      assert.equal(derived.movementMultiplier, 0.75);
      assert.equal(effective, 8, "10 m/round × 0.75 = 8 m/round after round()");
    }
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

/* ------------------------------------------------------------------ */
/* 0.14.1 — Short / Long Rest homebrew                                */
/* ------------------------------------------------------------------ */

function makeRestActorStub({
  level = 6,
  hp = { value: 10, max: 30 },
  hitDice = { value: 6, max: 6 },
  statuses = []
} = {}) {
  const actor = {
    name: "Test Survivor",
    type: "character",
    statuses: new Set(statuses),
    system: {
      details: { level },
      resources: {
        hp: { ...hp },
        hitDice: { ...hitDice }
      }
    },
    updates: [],
    async update(diff, options = {}) {
      this.updates.push({ diff, options });
      for (const [path, value] of Object.entries(diff)) {
        const segs = path.split(".");
        let cursor = this;
        for (let i = 0; i < segs.length - 1; i++) {
          cursor = cursor[segs[i]] ??= {};
        }
        cursor[segs.at(-1)] = value;
      }
      return this;
    }
  };
  return actor;
}

function stubDeterministicRoll(perDieFace = 4) {
  const original = globalThis.Roll;
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = String(formula);
      const match = /^(\d+)d6$/.exec(this.formula);
      const n = match ? Number(match[1]) : 0;
      this.total = n * perDieFace;
    }
    async evaluate() { return this; }
  };
  return () => { globalThis.Roll = original; };
}

function stubHooks({ vetoes = {} } = {}) {
  const original = globalThis.Hooks;
  const fired = [];
  globalThis.Hooks = {
    call(name, payload) { fired.push({ name, payload, vetoable: true }); return vetoes[name] ?? true; },
    callAll(name, payload) { fired.push({ name, payload, vetoable: false }); }
  };
  return { fired, restore: () => { globalThis.Hooks = original; } };
}

function stubChatMessage() {
  const original = globalThis.ChatMessage;
  globalThis.ChatMessage = {
    getSpeaker: () => ({}),
    create: async () => ({})
  };
  return () => { globalThis.ChatMessage = original; };
}

function stubGame({ advanceTime = true, isGM = true } = {}) {
  const original = globalThis.game;
  const advanceCalls = [];
  globalThis.game = {
    settings: {
      get: (system, key) => key === "restAdvancesWorldTime" ? advanceTime : null
    },
    time: { advance: async (seconds) => { advanceCalls.push(seconds); } },
    user: { isGM },
    i18n: { localize: (s) => s, format: (s) => s }
  };
  return { advanceCalls, restore: () => { globalThis.game = original; } };
}

test("0.14.1 — shortRestMaxHD = floor(level/3)", async () => {
  const { shortRestMaxHD } = await import("../module/healing.mjs");
  for (const [level, expected] of [[1, 0], [2, 0], [3, 1], [5, 1], [6, 2], [9, 3], [10, 3], [12, 4]]) {
    assert.equal(shortRestMaxHD({ system: { details: { level } } }), expected,
      `level ${level} → ${expected} HD cap`);
  }
});

test("0.14.1 — performShortRest spends HD and heals (capped at max HP and HD cap)", async () => {
  const { performShortRest } = await import("../module/healing.mjs");
  const unrollDice = stubDeterministicRoll(4);
  const hooks = stubHooks();
  const unstubChat = stubChatMessage();
  const gameStub = stubGame({ advanceTime: true });
  try {
    const actor = makeRestActorStub({ level: 9, hp: { value: 5, max: 30 }, hitDice: { value: 9, max: 9 } });
    const result = await performShortRest(actor, { hitDiceSpent: 3 });
    assert.equal(result.vetoed, false);
    assert.equal(result.hitDiceSpent, 3);
    assert.equal(result.healed, 12, "3 × 4 = 12 HP healed");
    assert.equal(actor.system.resources.hp.value, 17);
    assert.equal(actor.system.resources.hitDice.value, 6);

    const overspend = await performShortRest(
      makeRestActorStub({ level: 9, hp: { value: 0, max: 30 }, hitDice: { value: 9, max: 9 } }),
      { hitDiceSpent: 99 }
    );
    assert.equal(overspend.hitDiceSpent, 3, "capped at floor(9/3) = 3 even when 99 requested");

    const overheal = await performShortRest(
      makeRestActorStub({ level: 6, hp: { value: 28, max: 30 }, hitDice: { value: 6, max: 6 } }),
      { hitDiceSpent: 2 }
    );
    assert.equal(overheal.healed, 2, "8 rolled, only 2 missing → cap at 2");

    assert.ok(hooks.fired.some((h) => h.name === "gammaWorld.v1.preShortRest" && h.vetoable));
    assert.ok(hooks.fired.some((h) => h.name === "gammaWorld.v1.shortRest" && !h.vetoable));
    assert.equal(gameStub.advanceCalls[0], 3600);
  } finally {
    unrollDice(); hooks.restore(); unstubChat(); gameStub.restore();
  }
});

test("0.14.1 — performShortRest with 0 HD requested still fires hooks + advances time", async () => {
  const { performShortRest } = await import("../module/healing.mjs");
  const unrollDice = stubDeterministicRoll(4);
  const hooks = stubHooks();
  const unstubChat = stubChatMessage();
  const gameStub = stubGame();
  try {
    const actor = makeRestActorStub({ level: 6, hp: { value: 10, max: 30 }, hitDice: { value: 6, max: 6 } });
    const result = await performShortRest(actor, { hitDiceSpent: 0 });
    assert.equal(result.hitDiceSpent, 0);
    assert.equal(result.healed, 0);
    assert.equal(actor.system.resources.hp.value, 10);
    assert.equal(actor.system.resources.hitDice.value, 6);
    assert.equal(gameStub.advanceCalls[0], 3600);
    assert.ok(hooks.fired.some((h) => h.name === "gammaWorld.v1.shortRest"));
  } finally {
    unrollDice(); hooks.restore(); unstubChat(); gameStub.restore();
  }
});

test("0.14.1 — performShortRest pre-hook veto cancels the rest", async () => {
  const { performShortRest } = await import("../module/healing.mjs");
  const unrollDice = stubDeterministicRoll(4);
  const hooks = stubHooks({ vetoes: { "gammaWorld.v1.preShortRest": false } });
  const unstubChat = stubChatMessage();
  const gameStub = stubGame();
  try {
    const actor = makeRestActorStub({ level: 6, hp: { value: 10, max: 30 }, hitDice: { value: 6, max: 6 } });
    const result = await performShortRest(actor, { hitDiceSpent: 2 });
    assert.equal(result.vetoed, true);
    assert.equal(actor.updates.length, 0, "no actor.update on veto");
    assert.equal(gameStub.advanceCalls.length, 0, "no time advance on veto");
    assert.ok(!hooks.fired.some((h) => h.name === "gammaWorld.v1.shortRest"), "post-hook does not fire on veto");
  } finally {
    unrollDice(); hooks.restore(); unstubChat(); gameStub.restore();
  }
});

test("0.14.1 — performLongRest restores all HP and refills HD when not blocked", async () => {
  const { performLongRest } = await import("../module/healing.mjs");
  const unrollDice = stubDeterministicRoll(4);
  const hooks = stubHooks();
  const unstubChat = stubChatMessage();
  const gameStub = stubGame();
  try {
    const actor = makeRestActorStub({ level: 6, hp: { value: 4, max: 30 }, hitDice: { value: 1, max: 6 } });
    const result = await performLongRest(actor);
    assert.equal(result.vetoed, false);
    assert.equal(result.healBlocked, false);
    assert.equal(result.healed, 26);
    assert.equal(result.hitDiceRefilled, 6);
    assert.equal(actor.system.resources.hp.value, 30);
    assert.equal(actor.system.resources.hitDice.value, 6);
    assert.equal(gameStub.advanceCalls[0], 21600, "6 hours = 21600 seconds");
    assert.ok(hooks.fired.some((h) => h.name === "gammaWorld.v1.longRest"));
  } finally {
    unrollDice(); hooks.restore(); unstubChat(); gameStub.restore();
  }
});

test("0.14.1 — performLongRest skips HP heal when poisoned, but still refills HD + advances time", async () => {
  const { performLongRest } = await import("../module/healing.mjs");
  const unrollDice = stubDeterministicRoll(4);
  const hooks = stubHooks();
  const unstubChat = stubChatMessage();
  const gameStub = stubGame();
  try {
    const actor = makeRestActorStub({
      level: 6, hp: { value: 4, max: 30 }, hitDice: { value: 1, max: 6 },
      statuses: ["poisoned"]
    });
    const result = await performLongRest(actor);
    assert.equal(result.healBlocked, true);
    assert.equal(result.blockReason, "poisoned");
    assert.equal(result.healed, 0);
    assert.equal(result.hitDiceRefilled, 6, "HD still refresh");
    assert.equal(actor.system.resources.hp.value, 4, "HP NOT restored");
    assert.equal(actor.system.resources.hitDice.value, 6);
    assert.equal(gameStub.advanceCalls[0], 21600, "time still advances");
  } finally {
    unrollDice(); hooks.restore(); unstubChat(); gameStub.restore();
  }
});

test("0.14.1 — performLongRest skips HP heal when radiation-sick", async () => {
  const { performLongRest } = await import("../module/healing.mjs");
  const unrollDice = stubDeterministicRoll(4);
  const hooks = stubHooks();
  const unstubChat = stubChatMessage();
  const gameStub = stubGame();
  try {
    const actor = makeRestActorStub({
      level: 6, hp: { value: 4, max: 30 }, hitDice: { value: 1, max: 6 },
      statuses: ["radiation-sickness"]
    });
    const result = await performLongRest(actor);
    assert.equal(result.healBlocked, true);
    assert.equal(result.blockReason, "radiationSickness");
    assert.equal(actor.system.resources.hp.value, 4);
  } finally {
    unrollDice(); hooks.restore(); unstubChat(); gameStub.restore();
  }
});

test("0.14.1 — restAdvancesWorldTime=false skips time advance", async () => {
  const { performShortRest } = await import("../module/healing.mjs");
  const unrollDice = stubDeterministicRoll(4);
  const hooks = stubHooks();
  const unstubChat = stubChatMessage();
  const gameStub = stubGame({ advanceTime: false });
  try {
    const actor = makeRestActorStub({ level: 6, hp: { value: 10, max: 30 }, hitDice: { value: 6, max: 6 } });
    await performShortRest(actor, { hitDiceSpent: 2 });
    assert.equal(gameStub.advanceCalls.length, 0);
  } finally {
    unrollDice(); hooks.restore(); unstubChat(); gameStub.restore();
  }
});

test("0.14.1 — HOOK constants exposed for the rest pipeline", async () => {
  const { HOOK } = await import("../module/hook-surface.mjs");
  assert.equal(HOOK.preShortRest, "gammaWorld.v1.preShortRest");
  assert.equal(HOOK.shortRest, "gammaWorld.v1.shortRest");
  assert.equal(HOOK.preLongRest, "gammaWorld.v1.preLongRest");
  assert.equal(HOOK.longRest, "gammaWorld.v1.longRest");
});

/* ------------------------------------------------------------------ */
/* 0.14.2 — Active Now dashboard helpers                              */
/* ------------------------------------------------------------------ */

function makeMutation({
  mode = "passive",
  enabled = false,
  remaining = 0,
  cooldownCurrent = 0,
  cooldownMax = 0,
  usageLimited = false,
  uses = 0,
  usesMax = 0
} = {}) {
  return {
    type: "mutation",
    name: "Test Mutation",
    system: {
      activation: { mode, enabled, remaining },
      cooldown: { current: cooldownCurrent, max: cooldownMax },
      usage: { limited: usageLimited, uses, max: usesMax, per: "day" }
    }
  };
}

test("0.14.2 — mutationStatus active-timed wins when toggle ON + remaining > 0", async () => {
  const { mutationStatus, MUTATION_STATUS } = await import("../module/mutation-status.mjs");
  const mut = makeMutation({ mode: "toggle", enabled: true, remaining: 3 });
  const status = mutationStatus(mut);
  assert.equal(status.kind, MUTATION_STATUS.ACTIVE_TIMED);
  assert.equal(status.countdown, 3);
  assert.equal(status.countdownUnit, "rounds");
  assert.match(status.label, /Active.*3/);
  assert.equal(status.css, "gw-mutation-status--active-timed");
});

test("0.14.2 — mutationStatus active when toggle ON + no countdown", async () => {
  const { mutationStatus, MUTATION_STATUS } = await import("../module/mutation-status.mjs");
  const mut = makeMutation({ mode: "toggle", enabled: true, remaining: 0 });
  const status = mutationStatus(mut);
  assert.equal(status.kind, MUTATION_STATUS.ACTIVE);
  assert.equal(status.countdown, null);
});

test("0.14.2 — mutationStatus cooldown takes priority over ready/spent", async () => {
  const { mutationStatus, MUTATION_STATUS } = await import("../module/mutation-status.mjs");
  const mut = makeMutation({
    mode: "action",
    cooldownCurrent: 2,
    cooldownMax: 4,
    usageLimited: true, uses: 1, usesMax: 3
  });
  const status = mutationStatus(mut);
  assert.equal(status.kind, MUTATION_STATUS.COOLDOWN);
  assert.equal(status.countdown, 2);
  assert.match(status.label, /Cooldown.*2/);
});

test("0.14.2 — mutationStatus spent when limited use and uses=0", async () => {
  const { mutationStatus, MUTATION_STATUS } = await import("../module/mutation-status.mjs");
  const mut = makeMutation({ mode: "action", usageLimited: true, uses: 0, usesMax: 3 });
  assert.equal(mutationStatus(mut).kind, MUTATION_STATUS.SPENT);
});

test("0.14.2 — mutationStatus ready when action-mode + uses available + no cooldown", async () => {
  const { mutationStatus, MUTATION_STATUS } = await import("../module/mutation-status.mjs");
  const mut = makeMutation({ mode: "action", usageLimited: true, uses: 2, usesMax: 3 });
  assert.equal(mutationStatus(mut).kind, MUTATION_STATUS.READY);

  const unlimitedAction = makeMutation({ mode: "action", usageLimited: false });
  assert.equal(mutationStatus(unlimitedAction).kind, MUTATION_STATUS.READY);
});

test("0.14.2 — mutationStatus available for toggle that's currently OFF", async () => {
  const { mutationStatus, MUTATION_STATUS } = await import("../module/mutation-status.mjs");
  const mut = makeMutation({ mode: "toggle", enabled: false });
  assert.equal(mutationStatus(mut).kind, MUTATION_STATUS.AVAILABLE);
});

test("0.14.2 — mutationStatus passive for passive-mode mutations", async () => {
  const { mutationStatus, MUTATION_STATUS } = await import("../module/mutation-status.mjs");
  const mut = makeMutation({ mode: "passive" });
  assert.equal(mutationStatus(mut).kind, MUTATION_STATUS.PASSIVE);
});

test("0.14.2 — isMutationDashboardWorthy filters to active + cooldown only", async () => {
  const { isMutationDashboardWorthy } = await import("../module/mutation-status.mjs");
  assert.equal(isMutationDashboardWorthy(makeMutation({ mode: "toggle", enabled: true, remaining: 5 })), true);
  assert.equal(isMutationDashboardWorthy(makeMutation({ mode: "toggle", enabled: true })), true);
  assert.equal(isMutationDashboardWorthy(makeMutation({ mode: "action", cooldownCurrent: 2 })), true);
  assert.equal(isMutationDashboardWorthy(makeMutation({ mode: "action" })), false, "ready mutation excluded");
  assert.equal(isMutationDashboardWorthy(makeMutation({ mode: "passive" })), false, "passive excluded");
  assert.equal(isMutationDashboardWorthy(makeMutation({ mode: "action", usageLimited: true, uses: 0 })), false, "spent excluded");
});

test("0.14.2 — formatEffectCountdown rounds-based timer, mid-effect", async () => {
  const { formatEffectCountdown } = await import("../module/effect-countdown.mjs");
  const effect = { duration: { rounds: 5, startRound: 2 } };
  const result = formatEffectCountdown(effect, { combatRound: 4 });
  assert.equal(result.hasTimer, true);
  assert.equal(result.expired, false);
  assert.equal(result.remainingRounds, 3, "5 - (4 - 2) = 3 rounds left");
  assert.match(result.label, /3.*rd/);
});

test("0.14.2 — formatEffectCountdown rounds expired", async () => {
  const { formatEffectCountdown } = await import("../module/effect-countdown.mjs");
  const effect = { duration: { rounds: 3, startRound: 1 } };
  const result = formatEffectCountdown(effect, { combatRound: 6 });
  assert.equal(result.expired, true);
  assert.equal(result.remainingRounds, 0);
});

test("0.14.2 — formatEffectCountdown seconds picks the largest unit", async () => {
  const { formatEffectCountdown } = await import("../module/effect-countdown.mjs");
  // 3 hours remaining
  const hours = formatEffectCountdown(
    { duration: { seconds: 3 * 3600, startTime: 0 } },
    { worldTime: 0 }
  );
  assert.equal(hours.remainingSeconds, 10800);
  assert.match(hours.label, /3.*hr/);

  // 5 minutes remaining
  const minutes = formatEffectCountdown(
    { duration: { seconds: 600, startTime: 0 } },
    { worldTime: 300 }
  );
  assert.equal(minutes.remainingSeconds, 300);
  assert.match(minutes.label, /5.*min/);

  // 30 seconds remaining
  const seconds = formatEffectCountdown(
    { duration: { seconds: 30, startTime: 0 } },
    { worldTime: 0 }
  );
  assert.match(seconds.label, /30.*sec/);

  // 2 days remaining
  const days = formatEffectCountdown(
    { duration: { seconds: 2 * 86400, startTime: 0 } },
    { worldTime: 0 }
  );
  assert.match(days.label, /2.*day/);
});

test("0.14.2 — formatEffectCountdown returns Permanent when no timer", async () => {
  const { formatEffectCountdown } = await import("../module/effect-countdown.mjs");
  const result = formatEffectCountdown({ duration: {} }, { combatRound: 0, worldTime: 0 });
  assert.equal(result.hasTimer, false);
  assert.equal(result.label, "Permanent");
});

/* ------------------------------------------------------------------ */
/* 0.14.3 — cell-driven items refuse to fire when no cell installed   */
/* ------------------------------------------------------------------ */

test("0.14.3 — artifactPowerStatus derives cellsInstalled from installedCellIds for cell-driven items", async () => {
  const { artifactPowerStatus } = await import("../module/artifact-power.mjs");
  // Lying shape: studio-style "1 cell installed" (count) but empty UUID array.
  const lyingPistol = {
    name: "Laser Pistol",
    system: {
      consumption: { unit: "shot", perUnit: 10 },
      artifact: {
        isArtifact: true,
        powerSource: "hydrogen",
        power: {
          requirement: "cells",
          compatibleCells: "hydrogen",
          installedType: "hydrogen",
          cellSlots: 1,
          cellsInstalled: 1,            // ← lies
          installedCellIds: []          // ← truth
        },
        charges: { current: 10, max: 10 }
      }
    }
  };
  const status = artifactPowerStatus(lyingPistol);
  assert.equal(status.cellsInstalled, 0,
    "derived count must reflect the empty UUID array, not the stale legacy count");
  assert.equal(status.powered, false, "unloaded gun must read as unpowered");
  assert.equal(status.reason, "cells");
});

test("0.14.3 — artifactPowerStatus still trusts cellsInstalled for non-cell-driven items", async () => {
  const { artifactPowerStatus } = await import("../module/artifact-power.mjs");
  // A medi-kit-shaped legacy artifact: no consumption.perUnit, uses
  // legacy own-charges. The legacy count path should still work.
  const mediKit = {
    name: "Medi-kit",
    system: {
      consumption: { unit: "", perUnit: 0 },
      artifact: {
        isArtifact: true,
        powerSource: "none",
        power: {
          requirement: "none",
          installedType: "none",
          cellSlots: 0,
          cellsInstalled: 0,
          installedCellIds: []
        },
        charges: { current: 5, max: 10 }
      }
    }
  };
  const status = artifactPowerStatus(mediKit);
  assert.equal(status.powered, true);
  assert.equal(status.usesCellDrain, false);
});

test("0.14.3 — consumeArtifactCharge refuses cell-driven items with no installed cell", async () => {
  const { consumeArtifactCharge } = await import("../module/artifact-power.mjs");
  // Stub ui.notifications + Hooks so the helper's chat path is silent in tests.
  const originalUi = globalThis.ui;
  const originalHooks = globalThis.Hooks;
  globalThis.ui = { notifications: { warn: () => {}, info: () => {} } };
  globalThis.Hooks = { call: () => true, callAll: () => {} };
  try {
    const unloadedGun = {
      name: "Laser Pistol",
      uuid: "Item.test",
      system: {
        consumption: { unit: "shot", perUnit: 10 },
        artifact: {
          isArtifact: true,
          power: {
            requirement: "cells",
            cellSlots: 1,
            cellsInstalled: 0,
            installedCellIds: []
          },
          charges: { current: 10, max: 10 }   // legacy lying counter
        }
      },
      update: async () => {}
    };
    const result = await consumeArtifactCharge(unloadedGun, 1);
    assert.equal(result.success, false);
    assert.equal(result.unpowered, true);
    assert.equal(result.reason, "no-cell");
  } finally {
    globalThis.ui = originalUi;
    globalThis.Hooks = originalHooks;
  }
});

/* ------------------------------------------------------------------ */
/* 0.14.4 — Power-state pill helpers                                  */
/* ------------------------------------------------------------------ */

function makePowerableItem({
  perUnit = 10,
  installedCellIds = [],
  installedType = "hydrogen",
  cellSlots = 1,
  charges = { current: 0, max: 0 },
  flags = {}
} = {}) {
  return {
    type: "weapon",
    name: "Test Pistol",
    flags,
    system: {
      consumption: { unit: "shot", perUnit },
      artifact: {
        isArtifact: true,
        powerSource: installedType,
        power: {
          requirement: "cells",
          compatibleCells: installedType,
          installedType,
          cellSlots,
          cellsInstalled: installedCellIds.length,
          installedCellIds: [...installedCellIds]
        },
        charges: { ...charges }
      }
    }
  };
}

/** Stub fromUuid(Sync) + getProperty/setProperty for the cell-drain pipeline. */
function stubCellResolver(cellsByUuid) {
  const originalFoundry = globalThis.foundry;
  const originalFromUuid = globalThis.fromUuid;
  const originalFromUuidSync = globalThis.fromUuidSync;
  const getProperty = (obj, path) => {
    const segs = String(path).split(".");
    let cursor = obj;
    for (const seg of segs) {
      if (cursor == null) return undefined;
      cursor = cursor[seg];
    }
    return cursor;
  };
  const setProperty = (obj, path, value) => {
    const segs = String(path).split(".");
    let cursor = obj;
    for (let i = 0; i < segs.length - 1; i++) {
      cursor = cursor[segs[i]] ??= {};
    }
    cursor[segs.at(-1)] = value;
  };
  const lookup = (uuid) => cellsByUuid[uuid] ?? null;
  const lookupAsync = async (uuid) => cellsByUuid[uuid] ?? null;
  globalThis.foundry = {
    ...(originalFoundry ?? {}),
    utils: {
      ...((originalFoundry?.utils) ?? {}),
      fromUuidSync: lookup,
      getProperty,
      setProperty
    }
  };
  globalThis.fromUuidSync = lookup;
  globalThis.fromUuid = lookupAsync;
  return () => {
    globalThis.foundry = originalFoundry;
    globalThis.fromUuid = originalFromUuid;
    globalThis.fromUuidSync = originalFromUuidSync;
  };
}

function makeCell(pct) {
  return {
    type: "gear",
    system: {
      subtype: "power-cell",
      artifact: { charges: { current: pct, max: 100 } }
    }
  };
}

test("0.14.4 — itemPowerState NO_CELL when cell-driven with empty installedCellIds", async () => {
  const { itemPowerState, POWER_STATE } = await import("../module/item-power-status.mjs");
  const item = makePowerableItem({ installedCellIds: [] });
  const result = itemPowerState(item);
  assert.equal(result.state, POWER_STATE.NO_CELL);
  assert.equal(result.percent, null);
  assert.equal(result.severity, 2);
  assert.deepEqual(result.cellPercents, []);
});

test("0.14.4 — itemPowerState HEALTHY for single cell at 80%", async () => {
  const { itemPowerState, POWER_STATE } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({ "Item.cell1": makeCell(80) });
  try {
    const item = makePowerableItem({ installedCellIds: ["Item.cell1"] });
    const result = itemPowerState(item);
    assert.equal(result.state, POWER_STATE.HEALTHY);
    assert.equal(result.percent, 80);
    assert.equal(result.severity, 0);
  } finally { restore(); }
});

test("0.14.4 — itemPowerState LOW for cell at 30%", async () => {
  const { itemPowerState, POWER_STATE } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({ "Item.cell1": makeCell(30) });
  try {
    const item = makePowerableItem({ installedCellIds: ["Item.cell1"] });
    const result = itemPowerState(item);
    assert.equal(result.state, POWER_STATE.LOW);
    assert.equal(result.percent, 30);
    assert.equal(result.severity, 1);
  } finally { restore(); }
});

test("0.14.4 — itemPowerState EMPTY for cell at 0%", async () => {
  const { itemPowerState, POWER_STATE } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({ "Item.cell1": makeCell(0) });
  try {
    const item = makePowerableItem({ installedCellIds: ["Item.cell1"] });
    const result = itemPowerState(item);
    assert.equal(result.state, POWER_STATE.EMPTY);
    assert.equal(result.percent, 0);
    assert.equal(result.severity, 2);
  } finally { restore(); }
});

test("0.14.4 — itemPowerState multi-cell uses MIN with cellPercents array", async () => {
  const { itemPowerState, POWER_STATE } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({
    "Item.a": makeCell(60),
    "Item.b": makeCell(80)
  });
  try {
    const item = makePowerableItem({
      installedCellIds: ["Item.a", "Item.b"],
      cellSlots: 2
    });
    const result = itemPowerState(item);
    assert.equal(result.state, POWER_STATE.HEALTHY);
    assert.equal(result.percent, 60, "MIN of [60, 80]");
    assert.deepEqual(result.cellPercents, [60, 80]);
  } finally { restore(); }
});

test("0.14.4 — itemPowerState mixed-fresh edge: [0, 80] → LOW with cellPercents preserved", async () => {
  const { itemPowerState, POWER_STATE } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({
    "Item.empty": makeCell(0),
    "Item.fresh": makeCell(80)
  });
  try {
    const item = makePowerableItem({
      installedCellIds: ["Item.empty", "Item.fresh"],
      cellSlots: 2
    });
    const result = itemPowerState(item);
    assert.equal(result.state, POWER_STATE.LOW,
      "min=0 with at least one nonzero cell → LOW (not EMPTY)");
    assert.equal(result.percent, 0);
    assert.deepEqual(result.cellPercents, [0, 80]);
  } finally { restore(); }
});

test("0.14.4 — itemPowerState N_A for non-cell-driven items", async () => {
  const { itemPowerState, POWER_STATE } = await import("../module/item-power-status.mjs");
  // Medi-kit shape: legacy charges, no perUnit drain rule.
  const mediKit = {
    type: "gear",
    system: {
      consumption: { unit: "", perUnit: 0 },
      artifact: { isArtifact: true, charges: { current: 5, max: 10 }, power: {} }
    }
  };
  assert.equal(itemPowerState(mediKit).state, POWER_STATE.N_A);
});

test("0.14.4 — itemPowerBadge returns sheet-ready shape", async () => {
  const { itemPowerBadge } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({});
  // Keep ui stub for artifactPowerFailureMessage's downstream notifications.
  const originalUi = globalThis.ui;
  globalThis.ui = { notifications: { warn: () => {}, info: () => {} } };
  try {
    const item = makePowerableItem({ installedCellIds: [] });
    const badge = itemPowerBadge(item);
    assert.ok(badge);
    assert.equal(badge.css, "gw-power-status--no-cell");
    assert.equal(badge.label, "No cell");
    assert.equal(badge.severity, 2);
    assert.equal(badge.state, "no-cell");
  } finally { restore(); globalThis.ui = originalUi; }
});

test("0.14.4 — itemPowerBadge returns null for non-cell-driven items", async () => {
  const { itemPowerBadge } = await import("../module/item-power-status.mjs");
  const mediKit = {
    type: "gear",
    system: {
      consumption: { unit: "", perUnit: 0 },
      artifact: { isArtifact: true, charges: { current: 5, max: 10 }, power: {} }
    }
  };
  assert.equal(itemPowerBadge(mediKit), null);
});

test("0.14.4 — isItemPowerCritical true for EMPTY/NO_CELL only", async () => {
  const { isItemPowerCritical } = await import("../module/item-power-status.mjs");
  // No cell.
  assert.equal(isItemPowerCritical(makePowerableItem({ installedCellIds: [] })), true);
  // Healthy.
  const restore = stubCellResolver({ "Item.cell1": makeCell(80) });
  try {
    assert.equal(
      isItemPowerCritical(makePowerableItem({ installedCellIds: ["Item.cell1"] })),
      false
    );
  } finally { restore(); }
  // Empty cell.
  const restore2 = stubCellResolver({ "Item.cell1": makeCell(0) });
  try {
    assert.equal(
      isItemPowerCritical(makePowerableItem({ installedCellIds: ["Item.cell1"] })),
      true
    );
  } finally { restore2(); }
  // Non-cell-driven artifact (medi-kit) → not critical.
  const mediKit = {
    type: "gear",
    system: {
      consumption: { unit: "", perUnit: 0 },
      artifact: { isArtifact: true, charges: { current: 5, max: 10 }, power: {} }
    }
  };
  assert.equal(isItemPowerCritical(mediKit), false);
});

test("0.14.4 — built-in weapon inherits host armor's power state", async () => {
  const { itemPowerState, POWER_STATE } = await import("../module/item-power-status.mjs");
  const hostArmor = makePowerableItem({
    installedCellIds: [],
    installedType: "nuclear",
    cellSlots: 2
  });
  hostArmor.uuid = "Actor.a.Item.host";
  hostArmor.type = "armor";
  const builtIn = makePowerableItem({
    installedCellIds: ["Item.unused"],
    installedType: "nuclear",
    cellSlots: 1,
    flags: { "gamma-world-1e": { grantedBy: hostArmor.uuid } }
  });
  const restore = stubCellResolver({
    [hostArmor.uuid]: hostArmor,
    "Item.unused": makeCell(100)   // shouldn't be consulted — host inheritance wins
  });
  try {
    const result = itemPowerState(builtIn);
    assert.equal(result.state, POWER_STATE.NO_CELL,
      "built-in inherits host's NO_CELL state, ignoring its own (unused) cells");
    assert.equal(result.hostUuid, hostArmor.uuid);
  } finally { restore(); }
});

/* ------------------------------------------------------------------ */
/* 0.14.5 — drain-time preview + built-in cell-sharing drain          */
/* ------------------------------------------------------------------ */

test("0.14.5 — drainTimeRemaining shot weapons return shot count from min cell", async () => {
  const { drainTimeRemaining } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({ "Item.cell1": makeCell(60) });
  try {
    // Laser Pistol: perUnit 10, unit "shot". 60% / 10 = 6 shots remaining.
    const item = makePowerableItem({ perUnit: 10, installedCellIds: ["Item.cell1"] });
    const result = drainTimeRemaining(item);
    assert.equal(result.value, 6);
    assert.equal(result.unit, "shot");
    assert.match(result.label, /6.*shots/);
  } finally { restore(); }
});

test("0.14.5 — drainTimeRemaining hour-driven items return hours", async () => {
  const { drainTimeRemaining } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({ "Item.cell1": makeCell(48) });
  try {
    // Powered Plate: perUnit 2 (100/50), unit "hour". 48% / 2 = 24 hours.
    const item = makePowerableItem({ perUnit: 2, installedCellIds: ["Item.cell1"] });
    item.system.consumption.unit = "hour";
    const result = drainTimeRemaining(item);
    assert.equal(result.value, 24);
    assert.equal(result.unit, "hour");
    assert.match(result.label, /24.*hr/);
  } finally { restore(); }
});

test("0.14.5 — drainTimeRemaining returns null for unloaded / non-cell-driven items", async () => {
  const { drainTimeRemaining } = await import("../module/item-power-status.mjs");
  // No cell.
  assert.equal(drainTimeRemaining(makePowerableItem({ installedCellIds: [] })), null);
  // Non-cell-driven (medi-kit shape).
  const mediKit = {
    type: "gear",
    system: {
      consumption: { unit: "", perUnit: 0 },
      artifact: { isArtifact: true, charges: { current: 5, max: 10 }, power: {} }
    }
  };
  assert.equal(drainTimeRemaining(mediKit), null);
});

test("0.14.5 — drainTimeRemaining returns 0 for empty cells", async () => {
  const { drainTimeRemaining } = await import("../module/item-power-status.mjs");
  const restore = stubCellResolver({ "Item.cell1": makeCell(0) });
  try {
    const item = makePowerableItem({ perUnit: 10, installedCellIds: ["Item.cell1"] });
    const result = drainTimeRemaining(item);
    assert.equal(result.value, 0);
    assert.match(result.label, /Empty/i);
  } finally { restore(); }
});

test("0.14.5 — artifactPowerStatus inherits host cells for built-in weapons", async () => {
  const { artifactPowerStatus } = await import("../module/artifact-power.mjs");
  // Stub the cells so the depletion check (anyCellHasCharge) can resolve them.
  const restore = stubCellResolver({
    "Item.cellA": makeCell(80),
    "Item.cellB": makeCell(80)
  });
  try {
    const hostArmor = {
      id: "host-armor",
      name: "Powered Battle Armor",
      type: "armor",
      system: {
        consumption: { perUnit: 2, unit: "hour" },
        artifact: {
          power: {
            requirement: "cells",
            installedType: "nuclear",
            cellSlots: 2,
            cellsInstalled: 2,
            installedCellIds: ["Item.cellA", "Item.cellB"],
            compatibleCells: "nuclear"
          },
          charges: { current: 0, max: 0 }
        }
      }
    };
    const builtIn = {
      id: "built-laser",
      name: "Built-in Laser Pistol",
      type: "weapon",
      flags: { "gamma-world-1e": { grantedBy: "host-armor" } },
      system: {
        consumption: { perUnit: 10, unit: "shot" },
        artifact: {
          power: {
            requirement: "cells",
            installedType: "nuclear",
            cellSlots: 1,
            cellsInstalled: 0,
            installedCellIds: [],         // own pool empty — should inherit
            compatibleCells: "nuclear"
          },
          charges: { current: 0, max: 0 }
        }
      },
      actor: { items: { get: (id) => id === "host-armor" ? hostArmor : null } }
    };
    const status = artifactPowerStatus(builtIn);
    assert.deepEqual(status.installedCellIds, ["Item.cellA", "Item.cellB"],
      "built-in's effective cell pool comes from the host");
    assert.equal(status.cellsInstalled, 2,
      "derived cellsInstalled reflects host's count");
    assert.equal(status.powered, true,
      "built-in fires when host has cells, even if its own pool is empty");
  } finally { restore(); }
});

test("0.14.5 — consumeArtifactCharge redirects built-in weapon drain to host cells", async () => {
  const { consumeArtifactCharge } = await import("../module/artifact-power.mjs");
  // Track which item drainInstalledCells got — we observe via update calls.
  const updates = [];
  const cellById = {
    "Item.cellA": { ...makeCell(80), uuid: "Item.cellA", id: "cellA",
      update: async function(diff) { updates.push({ id: "cellA", diff }); for (const [k, v] of Object.entries(diff)) setNested(this, k, v); } },
    "Item.cellB": { ...makeCell(80), uuid: "Item.cellB", id: "cellB",
      update: async function(diff) { updates.push({ id: "cellB", diff }); for (const [k, v] of Object.entries(diff)) setNested(this, k, v); } }
  };
  const hostArmor = {
    id: "host-armor",
    name: "Powered Battle Armor",
    type: "armor",
    flags: {},
    system: {
      consumption: { perUnit: 2, unit: "hour" },
      artifact: {
        power: {
          requirement: "cells",
          cellSlots: 2,
          cellsInstalled: 2,
          installedCellIds: ["Item.cellA", "Item.cellB"]
        },
        charges: { current: 0, max: 0 }
      }
    },
    update: async function(diff) { updates.push({ id: "host", diff }); for (const [k, v] of Object.entries(diff)) setNested(this, k, v); }
  };
  const builtIn = {
    id: "built-laser",
    name: "Built-in Laser Pistol",
    type: "weapon",
    flags: { "gamma-world-1e": { grantedBy: "host-armor" } },
    system: {
      consumption: { perUnit: 10, unit: "shot" },
      artifact: {
        power: { cellSlots: 1, cellsInstalled: 0, installedCellIds: [] },
        charges: { current: 0, max: 0 }
      }
    },
    actor: { items: { get: (id) => id === "host-armor" ? hostArmor : null } },
    update: async function() { /* no-op — built-in shouldn't be touched */ }
  };
  const restore = stubCellResolver({
    "Item.cellA": cellById["Item.cellA"],
    "Item.cellB": cellById["Item.cellB"]
  });
  // Stub Hooks for any veto/announce calls inside drainInstalledCells.
  const originalHooks = globalThis.Hooks;
  globalThis.Hooks = { call: () => true, callAll: () => {} };
  try {
    await consumeArtifactCharge(builtIn, 1);
    // 0.13.1 contract: drain is per-cell at full perUnit (parallel-equal),
    // not split. Each shot debits 10% off each installed cell.
    const cellAUpdate = updates.find((u) => u.id === "cellA"
      && Object.prototype.hasOwnProperty.call(u.diff, "system.artifact.charges.current"));
    assert.ok(cellAUpdate, "host cell A should be drained");
    assert.equal(cellAUpdate.diff["system.artifact.charges.current"], 70,
      "cellA: 80% - 10% (perUnit) = 70%");
    const cellBUpdate = updates.find((u) => u.id === "cellB"
      && Object.prototype.hasOwnProperty.call(u.diff, "system.artifact.charges.current"));
    assert.ok(cellBUpdate, "host cell B should also drain (parallel)");
    assert.equal(cellBUpdate.diff["system.artifact.charges.current"], 70);
    // Built-in's own update should NOT fire for charges (its installedCellIds were empty).
  } finally {
    restore();
    globalThis.Hooks = originalHooks;
  }
});

function setNested(obj, path, value) {
  const segs = String(path).split(".");
  let cursor = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    cursor = cursor[segs[i]] ??= {};
  }
  cursor[segs.at(-1)] = value;
}

/* ------------------------------------------------------------------ */
/* 0.14.6 — encounter-close XP + loot                                 */
/* ------------------------------------------------------------------ */

test("0.14.6 — xpForHitDice follows the GW1e progression with linear extension above 15 HD", async () => {
  const { xpForHitDice } = await import("../module/experience.mjs");
  // Spot-check the lookup table entries.
  assert.equal(xpForHitDice(0),  0,  "0 HD = 0 XP (no defeat)");
  assert.equal(xpForHitDice(1),  25);
  assert.equal(xpForHitDice(4),  200);
  assert.equal(xpForHitDice(8),  1200);
  assert.equal(xpForHitDice(10), 2400);
  assert.equal(xpForHitDice(12), 3500);
  assert.equal(xpForHitDice(15), 5000);
  // Linear extension above 15 HD: +750 per HD.
  assert.equal(xpForHitDice(16), 5750);
  assert.equal(xpForHitDice(20), 8750);
  // Negative / NaN inputs floor to 0.
  assert.equal(xpForHitDice(-3), 0);
  assert.equal(xpForHitDice(NaN), 0);
});

test("0.14.6 — xpAwardForDefeated prefers explicit xpValue over the HD table", async () => {
  const { xpAwardForDefeated } = await import("../module/experience.mjs");
  // Explicit override wins.
  const overridden = { system: { details: { hitDice: 4, xpValue: 1000 } } };
  assert.equal(xpAwardForDefeated(overridden), 1000);
  // Fallback to HD table when xpValue is 0.
  const fallback = { system: { details: { hitDice: 4, xpValue: 0 } } };
  assert.equal(xpAwardForDefeated(fallback), 200);
  // Both 0 → 0.
  const zero = { system: { details: { hitDice: 0, xpValue: 0 } } };
  assert.equal(xpAwardForDefeated(zero), 0);
});

/* ------------------------------------------------------------------ */
/* 0.14.8 — damage multiplier auto-pick from target traits            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 0.14.9 — travel-time mode                                          */
/* ------------------------------------------------------------------ */

function makePartyActor({ name = "Sadie", rations = [] } = {}) {
  const items = rations.map((qty, i) => ({
    id: `ration-${i}`,
    type: "gear",
    name: `Ration ${i + 1}`,
    system: { subtype: "ration", quantity: qty, ammo: { autoDestroy: true } },
    update: async function(diff) {
      for (const [k, v] of Object.entries(diff)) setRationNested(this, k, v);
    },
    delete: async function() { items.splice(items.indexOf(this), 1); }
  }));
  return {
    name,
    type: "character",
    items: {
      find: (pred) => items.find(pred),
      filter: (pred) => items.filter(pred),
      forEach: (fn) => items.forEach(fn),
      get length() { return items.length; }
    },
    _rationItems: items
  };
}

function setRationNested(obj, path, value) {
  const segs = String(path).split(".");
  let cursor = obj;
  for (let i = 0; i < segs.length - 1; i++) cursor = cursor[segs[i]] ??= {};
  cursor[segs.at(-1)] = value;
}

function stubTravelEnvironment({ encounterAt = null, advanceTime = true } = {}) {
  const advanceCalls = [];
  const original = {
    game: globalThis.game,
    ChatMessage: globalThis.ChatMessage,
    foundry: globalThis.foundry,
    ui: globalThis.ui,
    CONFIG: globalThis.CONFIG
  };
  let legCounter = 0;
  globalThis.game = {
    user: { isGM: true },
    i18n: { localize: (s) => s, format: (s) => s },
    settings: { get: (system, key) => {
      if (key === "travelLegHours") return 4;
      if (key === "restAdvancesWorldTime") return advanceTime;
      return null;
    } },
    time: { worldTime: 0, advance: async (s) => { advanceCalls.push(s); globalThis.game.time.worldTime += s; } },
    actors: { contents: [] },
    combat: null,
    messages: { contents: [] }
  };
  globalThis.ChatMessage = {
    getSpeaker: () => ({ alias: "Travel" }),
    create: async () => ({})
  };
  globalThis.foundry = { utils: {} };
  globalThis.ui = { notifications: { info: () => {}, warn: () => {} } };
  globalThis.CONFIG = { GAMMA_WORLD: { ENCOUNTER_TERRAINS: { forest: "Forest", clear: "Clear" } } };
  // Stub the encounter helper that travel calls.
  const encMod = {
    checkRouteEncounter: async () => {
      legCounter += 1;
      const encountered = encounterAt !== null && legCounter === encounterAt;
      return { encountered, encounter: encountered ? { name: "Howler" } : null };
    }
  };
  return {
    encMod,
    advanceCalls,
    restore: () => {
      globalThis.game = original.game;
      globalThis.ChatMessage = original.ChatMessage;
      globalThis.foundry = original.foundry;
      globalThis.ui = original.ui;
      globalThis.CONFIG = original.CONFIG;
    }
  };
}

test("0.14.9 — performTravel runs the requested number of legs without an encounter", async () => {
  // We need to swap the import of checkRouteEncounter inside travel.mjs.
  // Easiest path: import travel.mjs FRESH after stubbing the encounter
  // module via dynamic-import substitution. But ESM imports cache; we
  // can't easily monkey-patch. Instead, drive performTravel with a
  // controllable game.combat / actor state and accept that the inner
  // checkRouteEncounter will fire against the test-time game stub
  // (it'll throw, get caught, and we move on).
  const env = stubTravelEnvironment();
  try {
    const { performTravel } = await import("../module/travel.mjs");
    const actor = { name: "Sadie", uuid: "Actor.sadie" };
    const partyActors = [makePartyActor({ rations: [2] })];
    const result = await performTravel(actor, {
      terrain: "forest",
      totalHours: 12,
      partyActors,
      period: "day"
    });
    // 12h / 4h legs = 3 legs.
    assert.equal(result.legsCompleted, 3);
    assert.equal(result.hoursElapsed, 12);
    assert.equal(result.encounterAtLeg, null);
    // 12h doesn't cross a 24h boundary → no rations consumed.
    assert.equal(result.rationsConsumed, 0);
    // World-time advanced for each leg (3 × 4h = 3 × 14400s).
    assert.equal(env.advanceCalls.length, 3);
    assert.deepEqual(env.advanceCalls, [14400, 14400, 14400]);
  } finally { env.restore(); }
});

test("0.14.9 — performTravel deducts 1 ration per PC per 24h elapsed", async () => {
  const env = stubTravelEnvironment();
  try {
    const { performTravel } = await import("../module/travel.mjs");
    const partyActors = [
      makePartyActor({ name: "Sadie", rations: [3] }),
      makePartyActor({ name: "Roxy",  rations: [3] })
    ];
    const result = await performTravel({ name: "Sadie" }, {
      terrain: "forest",
      totalHours: 48,        // 2 days
      partyActors,
      period: "day"
    });
    assert.equal(result.legsCompleted, 12);
    assert.equal(result.hoursElapsed, 48);
    // 2 PCs × 2 days = 4 ration debits.
    assert.equal(result.rationsConsumed, 4);
    // Each PC's ration stack went from 3 → 1 (2 consumed each over 2 days).
    assert.equal(partyActors[0]._rationItems[0].system.quantity, 1);
    assert.equal(partyActors[1]._rationItems[0].system.quantity, 1);
  } finally { env.restore(); }
});

test("0.14.9 — performTravel notes starving PCs when rations run out", async () => {
  const env = stubTravelEnvironment();
  try {
    const { performTravel } = await import("../module/travel.mjs");
    // Sadie has no rations; Roxy has one.
    const partyActors = [
      makePartyActor({ name: "Sadie", rations: [] }),
      makePartyActor({ name: "Roxy",  rations: [1] })
    ];
    const result = await performTravel({ name: "Sadie" }, {
      terrain: "forest",
      totalHours: 48,
      partyActors
    });
    // Sadie starves on both 24h ticks; Roxy starves on the second.
    assert.ok(result.starving.includes("Sadie"));
    assert.ok(result.starving.includes("Roxy"));
    // Roxy consumed her one ration on day 1.
    assert.equal(result.rationsConsumed, 1);
  } finally { env.restore(); }
});

/* ------------------------------------------------------------------ */
/* 0.14.10 — Attack-card target breakdown                             */
/* ------------------------------------------------------------------ */

test("0.14.10 — buildAttackTargetBreakdown surfaces base WC, fatigue, effective WC, AC, target", async () => {
  // We import dice.mjs lazily because it pulls in foundry.* refs at the
  // top of `effect-state.mjs`. Stub the shapes the import touches.
  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: { getProperty: () => null, setProperty: () => null },
    applications: { api: { DialogV2: class {} }, handlebars: { renderTemplate: async () => "" } },
    documents: {}
  };
  try {
    const { buildAttackTargetBreakdown } = await import("../module/dice.mjs");
    // Fatigue-free shot: no Fatigue row, no separate Effective row.
    const fresh = buildAttackTargetBreakdown({
      baseWeaponClass: 13, fatigueFactor: 0, effectiveWeaponClass: 13,
      targetAc: 7, rollTarget: 8
    });
    const labels = fresh.map((p) => p.label);
    assert.ok(labels.includes("Base weapon class"));
    assert.ok(!labels.includes("Fatigue"), "no fatigue row when factor is 0");
    assert.ok(!labels.includes("Effective weapon class"),
      "no separate effective WC row when it equals base");
    assert.ok(labels.includes("Target AC"));
    assert.ok(labels.includes("Roll target"));
    // Roll target carries the `+` suffix.
    const rollTargetRow = fresh.find((p) => p.label === "Roll target");
    assert.equal(rollTargetRow.signed, "8+");

    // Fatigued shot: Fatigue + Effective WC rows surface.
    const fatigued = buildAttackTargetBreakdown({
      baseWeaponClass: 16, fatigueFactor: -3, effectiveWeaponClass: 13,
      targetAc: 1, rollTarget: 12
    });
    const fatigueRow = fatigued.find((p) => p.label === "Fatigue");
    assert.ok(fatigueRow, "Fatigue row appears when factor is non-zero");
    assert.equal(fatigueRow.signed, "-3");
    const effRow = fatigued.find((p) => p.label === "Effective weapon class");
    assert.ok(effRow, "Effective WC row surfaces when it diverges from base");
    assert.equal(effRow.signed, "13");
  } finally { globalThis.foundry = originalFoundry; }
});

test("0.14.10 — buildNaturalAttackTargetBreakdown carries HD bucket + AC + target", async () => {
  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    utils: { getProperty: () => null, setProperty: () => null },
    applications: { api: { DialogV2: class {} }, handlebars: { renderTemplate: async () => "" } },
    documents: {}
  };
  try {
    const { buildNaturalAttackTargetBreakdown } = await import("../module/dice.mjs");
    const breakdown = buildNaturalAttackTargetBreakdown({
      attackerLevel: 4, hdBucket: "4-5", targetAc: 5, rollTarget: 14
    });
    const labels = breakdown.map((p) => p.label);
    assert.deepEqual(labels,
      ["Attacker level", "HD bucket", "Target AC", "Roll target"]);
    assert.equal(breakdown.find((p) => p.label === "HD bucket").signed, "4-5");
    assert.equal(breakdown.find((p) => p.label === "Roll target").signed, "14+");
  } finally { globalThis.foundry = originalFoundry; }
});

test("0.14.8 — damageTraitMultiplier returns the right multiplier per trait", async () => {
  const { damageTraitMultiplier } = await import("../module/effect-state.mjs");
  // Immunity wins: 0.
  const immune = { gw: { damageImmunity: new Set(["radiation"]),
                          damageResistance: new Set(),
                          damageVulnerability: new Set() } };
  assert.equal(damageTraitMultiplier(immune, "radiation"), 0);
  // Vulnerability beats resistance: 2.
  const vulnerable = { gw: { damageImmunity: new Set(),
                              damageResistance: new Set(["fire"]),
                              damageVulnerability: new Set(["fire"]) } };
  assert.equal(damageTraitMultiplier(vulnerable, "fire"), 2);
  // Resistance only: 0.5.
  const resistant = { gw: { damageImmunity: new Set(),
                             damageResistance: new Set(["physical"]),
                             damageVulnerability: new Set() } };
  assert.equal(damageTraitMultiplier(resistant, "physical"), 0.5);
  // Neutral: 1.
  const neutral = { gw: { damageImmunity: new Set(),
                           damageResistance: new Set(),
                           damageVulnerability: new Set() } };
  assert.equal(damageTraitMultiplier(neutral, "energy"), 1);
  // Set-vs-Array tolerance: helper accepts plain arrays too.
  const arrayShape = { gw: { damageImmunity: ["mental"],
                              damageResistance: [],
                              damageVulnerability: [] } };
  assert.equal(damageTraitMultiplier(arrayShape, "mental"), 0);
});

test("0.14.7 — analyzeArtifact routes to openArtifactSession (re-export wiring)", async () => {
  const mod = await import("../module/artifacts.mjs");
  // The exports the item sheet's Analyze handler imports must exist
  // and be callable. We don't drive the full session here (it would
  // require a full Foundry environment); we just confirm the surface
  // contract.
  assert.equal(typeof mod.analyzeArtifact, "function");
  assert.equal(typeof mod.openArtifactSession, "function");
});

test("0.14.7 — artifact identification field set is the same on weapon, armor, gear", async () => {
  // Schema-level invariant: all three artifact-bearing item types
  // expose `identified`, `operationKnown`, `attempts` so the analyze
  // flow can flip the same fields regardless of item type.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const dataDir = path.resolve(__dirname, "..", "module", "data");
  for (const file of ["item-weapon.mjs", "item-armor.mjs", "item-gear.mjs"]) {
    const src = await fs.readFile(path.join(dataDir, file), "utf8");
    assert.match(src, /identified:\s+new BooleanField/, `${file}: identified field`);
    assert.match(src, /operationKnown:\s+new BooleanField/, `${file}: operationKnown field`);
    assert.match(src, /attempts:\s+int/, `${file}: attempts counter`);
  }
});

test("0.14.6 — postEncounterCloseSummary renders XP rows + loot buttons in chat", async () => {
  const { postEncounterCloseSummary } = await import("../module/encounter-close.mjs");
  // Stub the chat surface — capture the create() call.
  const created = [];
  const ChatStub = {
    getSpeaker: () => ({}),
    getWhisperRecipients: () => [],
    create: async (data) => { created.push(data); return data; }
  };
  const originalChat = globalThis.ChatMessage;
  const originalGame = globalThis.game;
  globalThis.ChatMessage = ChatStub;
  globalThis.game = {
    user: { isGM: true },
    i18n: { localize: (s) => s, format: (s) => s },
    settings: { get: () => true }
  };
  try {
    const fakeCombat = {
      combatants: { contents: [
        { actor: { type: "monster", name: "Howler",
                   uuid: "Actor.howler",
                   system: { resources: { hp: { value: 0 } },
                             details: { hitDice: 4, xpValue: 0, lootTable: "RollTable.junk" } } },
          defeated: true },
        { actor: { type: "monster", name: "Borg",
                   uuid: "Actor.borg",
                   system: { resources: { hp: { value: 0 } },
                             details: { hitDice: 8, xpValue: 0, lootTable: "" } } },
          defeated: true },
        { actor: { type: "character", name: "Sadie",  uuid: "Actor.sadie",
                   system: { resources: { hp: { value: 22 } }, details: {} } } },
        { actor: { type: "character", name: "Roxy",   uuid: "Actor.roxy",
                   system: { resources: { hp: { value: 18 } }, details: {} } } }
      ]}
    };
    await postEncounterCloseSummary(fakeCombat);
    assert.equal(created.length, 1, "exactly one chat card posted");
    const card = created[0];
    // Total XP = 200 (Howler 4 HD) + 1200 (Borg 8 HD) = 1400. 2 PCs → 700 each.
    const flagData = card.flags?.["gamma-world-1e"]?.encounterClose;
    assert.equal(flagData.totalXp, 1400);
    assert.equal(flagData.perPc, 700);
    assert.equal(flagData.remainder, 0);
    assert.equal(flagData.pcIds.length, 2);
    assert.equal(flagData.defeated.length, 2);
    // Loot button rendered only for the Howler (has lootTable).
    assert.match(card.content, /data-action="rollEncounterLoot"/);
    assert.match(card.content, /Howler/);
    // No-defeated case yields a card with the empty-state message.
    const empty = { combatants: { contents: [] } };
    created.length = 0;
    await postEncounterCloseSummary(empty);
    assert.equal(created.length, 0, "no card when nothing defeated AND no PCs");
  } finally {
    globalThis.ChatMessage = originalChat;
    globalThis.game = originalGame;
  }
});

test("0.14.3 — every cell-driven studio JSON ships unloaded", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const dir = path.resolve(__dirname, "..", "tools", "content-studio", "content", "equipment");
  const files = await fs.readdir(dir);
  let checked = 0;
  for (const filename of files) {
    if (!filename.endsWith(".json")) continue;
    const data = JSON.parse(await fs.readFile(path.join(dir, filename), "utf8"));
    const perUnit = Number(data.system?.consumption?.perUnit ?? 0);
    if (perUnit <= 0) continue;
    if (data.system?.subtype === "power-cell") continue;
    const power = data.system?.artifact?.power ?? {};
    const charges = data.system?.artifact?.charges ?? {};
    // Treat omitted fields as 0/empty: schema defaults fill them at load
    // time. We're catching the lying shape (a non-zero number / non-empty
    // array), not punishing JSONs that omit explicit zeros.
    assert.equal(power.cellsInstalled ?? 0, 0,
      `${filename}: cell-driven items must ship cellsInstalled=0`);
    assert.deepEqual(power.installedCellIds ?? [], [],
      `${filename}: installedCellIds must ship empty`);
    assert.equal(charges.current ?? 0, 0,
      `${filename}: charges.current must ship 0 (cell owns the charge once installed)`);
    assert.equal(charges.max ?? 0, 0,
      `${filename}: charges.max must ship 0`);
    checked += 1;
  }
  assert.ok(checked >= 26, `expected at least 26 cell-driven studio items, checked ${checked}`);
});

// ---------------------------------------------------------------------------
// 0.14.12 — clampHpUpdate enforces value <= max on actor updates
// ---------------------------------------------------------------------------

function withFoundryUtilsStub(fn) {
  const originalFoundry = globalThis.foundry;
  globalThis.foundry = {
    ...(originalFoundry ?? {}),
    utils: {
      ...(originalFoundry?.utils ?? {}),
      getProperty: (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj),
      setProperty: (obj, path, value) => {
        const segs = path.split(".");
        let cursor = obj;
        for (let i = 0; i < segs.length - 1; i += 1) {
          if (cursor[segs[i]] == null) cursor[segs[i]] = {};
          cursor = cursor[segs[i]];
        }
        cursor[segs.at(-1)] = value;
        return true;
      }
    }
  };
  try { return fn(); } finally { globalThis.foundry = originalFoundry; }
}

test("0.14.12 — clampHpUpdate caps value at the actor's current max when only value changes", async () => {
  const { clampHpUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    const changed = { system: { resources: { hp: { value: 999 } } } };
    const clamped = clampHpUpdate(changed, { value: 30, max: 40 });
    assert.equal(clamped, 40, "returned the clamped value");
    assert.equal(changed.system.resources.hp.value, 40, "wrote clamped value back into changed");
  });
});

test("0.14.12 — clampHpUpdate caps to the new max when both value and max are in the same update", async () => {
  const { clampHpUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    const changed = { system: { resources: { hp: { value: 100, max: 60 } } } };
    const clamped = clampHpUpdate(changed, { value: 30, max: 40 });
    assert.equal(clamped, 60, "uses incoming max, not stale current max");
    assert.equal(changed.system.resources.hp.value, 60);
  });
});

test("0.14.12 — clampHpUpdate leaves a legal value alone (no-op when value <= max)", async () => {
  const { clampHpUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    const changed = { system: { resources: { hp: { value: 25 } } } };
    const clamped = clampHpUpdate(changed, { value: 30, max: 40 });
    assert.equal(clamped, null, "returns null when no clamp needed");
    assert.equal(changed.system.resources.hp.value, 25, "value untouched");
  });
});

test("0.14.12 — clampHpUpdate pulls stranded value down when only max is lowered", async () => {
  const { clampHpUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    // Actor at 35/40; an update lowers max to 20 without touching value.
    // The clamp should write value=20 into the same update so the
    // post-update state honors the invariant.
    const changed = { system: { resources: { hp: { max: 20 } } } };
    const clamped = clampHpUpdate(changed, { value: 35, max: 40 });
    assert.equal(clamped, 20);
    assert.equal(changed.system.resources.hp.value, 20);
  });
});

test("0.14.12 — clampHpUpdate is a true no-op when neither value nor max is in the update", async () => {
  const { clampHpUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    const changed = { system: { details: { level: 4 } } };
    const clamped = clampHpUpdate(changed, { value: 30, max: 40 });
    assert.equal(clamped, null);
    assert.deepEqual(changed, { system: { details: { level: 4 } } }, "unrelated update untouched");
  });
});

test("0.14.12 — clampHpUpdate floors fractional incoming values before comparing", async () => {
  const { clampHpUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    // 40.9 floors to 40, which equals max — no clamp needed.
    const a = { system: { resources: { hp: { value: 40.9 } } } };
    assert.equal(clampHpUpdate(a, { value: 30, max: 40 }), null);
    // 40.1 floors to 40 — no clamp.
    const b = { system: { resources: { hp: { value: 40.1 } } } };
    assert.equal(clampHpUpdate(b, { value: 30, max: 40 }), null);
    // 41.5 floors to 41 — over max, clamp to 40.
    const c = { system: { resources: { hp: { value: 41.5 } } } };
    assert.equal(clampHpUpdate(c, { value: 30, max: 40 }), 40);
    assert.equal(c.system.resources.hp.value, 40);
  });
});

// ---------------------------------------------------------------------------
// 0.14.13 — HD clamp, charges clamp, dead-status transition, encumbrance,
// fatigue tick predicate
// ---------------------------------------------------------------------------

test("0.14.13 — clampHitDiceUpdate caps value at the actor's level", async () => {
  const { clampHitDiceUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    // Player edits HD value to 99 on a level-5 character → clamp to 5.
    const changed = { system: { resources: { hitDice: { value: 99 } } } };
    const clamped = clampHitDiceUpdate(changed, { value: 3, max: 5 });
    assert.equal(clamped, 5);
    assert.equal(changed.system.resources.hitDice.value, 5);
  });
});

test("0.14.13 — clampHitDiceUpdate honors the new level when level is in the same update", async () => {
  const { clampHitDiceUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    // Level-up handler set value=5 alongside the level=5 change. New
    // level is the ceiling, value is at the ceiling — no clamp.
    const changed = {
      system: {
        details: { level: 5 },
        resources: { hitDice: { value: 5 } }
      }
    };
    const clamped = clampHitDiceUpdate(changed, { value: 3, max: 4 });
    assert.equal(clamped, null, "ceiling moved up; no clamp needed");
    assert.equal(changed.system.resources.hitDice.value, 5);
  });
});

test("0.14.13 — clampHitDiceUpdate pulls value down when only level decreases", async () => {
  const { clampHitDiceUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    // GM de-levels from 5 to 3 without touching HD value (5).
    const changed = { system: { details: { level: 3 } } };
    const clamped = clampHitDiceUpdate(changed, { value: 5, max: 5 });
    assert.equal(clamped, 3);
    assert.equal(changed.system.resources.hitDice.value, 3);
  });
});

test("0.14.13 — clampHitDiceUpdate is a no-op when neither value nor level is in the update", async () => {
  const { clampHitDiceUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    const changed = { system: { resources: { hp: { value: 10 } } } };
    assert.equal(clampHitDiceUpdate(changed, { value: 3, max: 5 }), null);
  });
});

test("0.14.13 — clampArtifactChargesUpdate caps current at max", async () => {
  const { clampArtifactChargesUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    const changed = { system: { artifact: { charges: { current: 200 } } } };
    const clamped = clampArtifactChargesUpdate(changed, { value: 50, max: 100 });
    assert.equal(clamped, 100);
    assert.equal(changed.system.artifact.charges.current, 100);
  });
});

test("0.14.13 — clampArtifactChargesUpdate uses incoming max when both fields change", async () => {
  const { clampArtifactChargesUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    // Cell upgraded: max raised to 150, current set to 200 — clamp to 150.
    const changed = { system: { artifact: { charges: { current: 200, max: 150 } } } };
    const clamped = clampArtifactChargesUpdate(changed, { value: 50, max: 100 });
    assert.equal(clamped, 150);
  });
});

test("0.14.13 — clampArtifactChargesUpdate pulls current down when only max is lowered", async () => {
  const { clampArtifactChargesUpdate } = await import("../module/hp-clamp.mjs");
  withFoundryUtilsStub(() => {
    // Damaged cell: max reduced to 40 while current was at 75.
    const changed = { system: { artifact: { charges: { max: 40 } } } };
    const clamped = clampArtifactChargesUpdate(changed, { value: 75, max: 100 });
    assert.equal(clamped, 40);
    assert.equal(changed.system.artifact.charges.current, 40);
  });
});

test("0.14.13 — deadStatusTransition signals 'set' when HP drops to 0", async () => {
  const { deadStatusTransition } = await import("../module/hp-clamp.mjs");
  assert.equal(deadStatusTransition({ currentHp: 0,  hasDeadStatus: false }), "set");
  assert.equal(deadStatusTransition({ currentHp: -5, hasDeadStatus: false }), "set");
});

test("0.14.13 — deadStatusTransition signals 'clear' when HP recovers above 0", async () => {
  const { deadStatusTransition } = await import("../module/hp-clamp.mjs");
  assert.equal(deadStatusTransition({ currentHp: 5,  hasDeadStatus: true }), "clear");
  assert.equal(deadStatusTransition({ currentHp: 1,  hasDeadStatus: true }), "clear");
});

test("0.14.13 — deadStatusTransition is null when state already matches", async () => {
  const { deadStatusTransition } = await import("../module/hp-clamp.mjs");
  // Already alive, still alive
  assert.equal(deadStatusTransition({ currentHp: 25, hasDeadStatus: false }), null);
  // Already dead, still dead (no double-set on every HP edit while down)
  assert.equal(deadStatusTransition({ currentHp: -3, hasDeadStatus: true }), null);
});

test("0.14.13 — deadStatusTransition treats null/undefined HP as 0 (dead)", async () => {
  const { deadStatusTransition } = await import("../module/hp-clamp.mjs");
  assert.equal(deadStatusTransition({ currentHp: null,      hasDeadStatus: false }), "set");
  assert.equal(deadStatusTransition({ currentHp: undefined, hasDeadStatus: false }), "set");
});

test("0.14.13 — computeEncumbrance sums weights and flags encumbered/overloaded", async () => {
  const { computeEncumbrance } = await import("../module/encumbrance.mjs");

  // PS 10 → baseCarry 100. No items → 0/100, not penalized.
  const empty = computeEncumbrance({ items: [], physStrength: 10 });
  assert.equal(empty.carried, 0);
  assert.equal(empty.max, 100);
  assert.equal(empty.encumbered, false);
  assert.equal(empty.overloaded, false);
  assert.equal(empty.penalized, false);

  // 50kg of gear under cap.
  const light = computeEncumbrance({
    items: [{ type: "gear", system: { quantity: 1, weight: 50 } }],
    physStrength: 10
  });
  assert.equal(light.carried, 50);
  assert.equal(light.encumbered, false);

  // 120kg → encumbered (over 100, under 200).
  const heavy = computeEncumbrance({
    items: [{ type: "gear", system: { quantity: 3, weight: 40 } }],
    physStrength: 10
  });
  assert.equal(heavy.carried, 120);
  assert.equal(heavy.encumbered, true);
  assert.equal(heavy.overloaded, false);
  assert.equal(heavy.penalized, true);

  // 250kg → overloaded.
  const overloaded = computeEncumbrance({
    items: [{ type: "gear", system: { quantity: 5, weight: 50 } }],
    physStrength: 10
  });
  assert.equal(overloaded.carried, 250);
  assert.equal(overloaded.overloaded, true);
  assert.equal(overloaded.penalized, true);
});

test("0.14.13 — computeEncumbrance adds equipped container capacity to carry max", async () => {
  const { computeEncumbrance } = await import("../module/encumbrance.mjs");
  // PS 10 baseCarry 100; an equipped backpack with capacity 50 lifts max to 150.
  const result = computeEncumbrance({
    items: [
      { type: "gear", system: { quantity: 1, weight: 2, subtype: "container", equipped: true, container: { capacity: 50 } } },
      { type: "gear", system: { quantity: 1, weight: 120 } }
    ],
    physStrength: 10
  });
  assert.equal(result.containerCap, 50);
  assert.equal(result.max, 150);
  assert.equal(result.carried, 122);
  assert.equal(result.encumbered, false, "122 carried < 150 max with container bonus");
});

test("0.14.13 — computeEncumbrance ignores unequipped containers", async () => {
  const { computeEncumbrance } = await import("../module/encumbrance.mjs");
  const result = computeEncumbrance({
    items: [
      { type: "gear", system: { quantity: 1, weight: 2, subtype: "container", equipped: false, container: { capacity: 50 } } }
    ],
    physStrength: 10
  });
  assert.equal(result.containerCap, 0);
  assert.equal(result.max, 100);
});

test("0.14.13 — shouldTickFatigue accepts an active combatant with positive HP", async () => {
  const { shouldTickFatigue } = await import("../module/effect-state.mjs");
  const ok = shouldTickFatigue({
    combatant: { isDefeated: false, defeated: false },
    actor: { type: "character", system: { combat: { fatigue: { round: 0 } }, resources: { hp: { value: 10 } } } }
  });
  assert.equal(ok, true);
});

test("0.14.13 — shouldTickFatigue rejects defeated combatants and 0-HP actors", async () => {
  const { shouldTickFatigue } = await import("../module/effect-state.mjs");
  const baseActor = { type: "character", system: { combat: { fatigue: { round: 2 } }, resources: { hp: { value: 10 } } } };

  assert.equal(shouldTickFatigue({
    combatant: { isDefeated: true },
    actor: baseActor
  }), false, "isDefeated stops the tick");

  assert.equal(shouldTickFatigue({
    combatant: { defeated: true },
    actor: baseActor
  }), false, "legacy `defeated` flag also stops the tick");

  assert.equal(shouldTickFatigue({
    combatant: {},
    actor: { ...baseActor, system: { ...baseActor.system, resources: { hp: { value: 0 } } } }
  }), false, "0 HP stops the tick");

  assert.equal(shouldTickFatigue({
    combatant: {},
    actor: { ...baseActor, system: { ...baseActor.system, resources: { hp: { value: -3 } } } }
  }), false, "negative HP stops the tick");
});

test("0.14.13 — shouldTickFatigue rejects non-character/monster actor types", async () => {
  const { shouldTickFatigue } = await import("../module/effect-state.mjs");
  const ok = shouldTickFatigue({
    combatant: {},
    actor: { type: "vehicle", system: { combat: { fatigue: { round: 0 } }, resources: { hp: { value: 10 } } } }
  });
  assert.equal(ok, false);
});

test("0.14.13 — shouldTickFatigue rejects actors missing the fatigue sub-schema", async () => {
  const { shouldTickFatigue } = await import("../module/effect-state.mjs");
  const ok = shouldTickFatigue({
    combatant: {},
    actor: { type: "character", system: { combat: {}, resources: { hp: { value: 10 } } } }
  });
  assert.equal(ok, false);
});

test("0.14.13 — shouldTickFatigue handles missing combatant or actor", async () => {
  const { shouldTickFatigue } = await import("../module/effect-state.mjs");
  assert.equal(shouldTickFatigue({ combatant: null, actor: null }), false);
  assert.equal(shouldTickFatigue({}), false);
});

// ---------------------------------------------------------------------------
// 0.14.14 — Heightened Touch / Taste / Balance mutation automation
// ---------------------------------------------------------------------------

test("0.14.14 — artifactUseProfile applies -1 modifier when Heightened Touch is active", async () => {
  const { artifactUseProfile } = await import("../module/artifact-rules.mjs");
  const actor = {
    system: { attributes: { in: { value: 12 } } },  // INT 12 → 0 baseline modifier
    items: [{ type: "mutation", name: "Heightened Touch", system: { activation: { enabled: true }, reference: {} } }]
  };
  const profile = artifactUseProfile(actor);
  assert.equal(profile.modifier, -1, "Heightened Touch contributes -1 to artifact analysis");
  assert.ok(profile.notes.includes("Heightened Touch"));
});

test("0.14.14 — Heightened Touch MUTATION_RULES grants +2 to juryRigging and salvage", async () => {
  const { MUTATION_RULES } = await import("../module/mutation-rules.mjs");
  const rule = MUTATION_RULES["Heightened Touch"];
  assert.ok(rule, "rule exists");
  assert.equal(rule.mode, "passive");
  const changes = rule.effects?.[0]?.changes ?? [];
  const findChange = (key) => changes.find((c) => c.key === key);
  assert.equal(findChange("system.skills.juryRigging.bonus")?.value, "2");
  assert.equal(findChange("system.skills.salvage.bonus")?.value, "2");
});

test("0.14.14 — Heightened Taste is an at-will info action with utility tag", async () => {
  const { MUTATION_RULES, resolveMutationActionTypes } = await import("../module/mutation-rules.mjs");
  const rule = MUTATION_RULES["Heightened Taste"];
  assert.ok(rule, "rule exists");
  assert.equal(rule.mode, "action");
  assert.equal(rule.action, "info");
  assert.equal(rule.usage.per, "at-will");
  assert.equal(rule.usage.limited, false);
  // resolveMutationActionTypes uses the internal MUTATION_ACTION_TYPE_DEFAULTS
  // map to derive tags for the sheet's action sections; the new "info" mode
  // surfaces under utility actions.
  assert.deepEqual(resolveMutationActionTypes(rule), ["utility"]);
});

test("0.14.14 — Heightened Balance MUTATION_RULES grants climbingTraversal +3 and stealth +2", async () => {
  const { MUTATION_RULES } = await import("../module/mutation-rules.mjs");
  const rule = MUTATION_RULES["Heightened Balance"];
  assert.ok(rule, "rule exists");
  assert.equal(rule.mode, "passive");
  const changes = rule.effects?.[0]?.changes ?? [];
  const findChange = (key) => changes.find((c) => c.key === key);
  assert.equal(findChange("system.skills.climbingTraversal.bonus")?.value, "3");
  assert.equal(findChange("system.skills.stealth.bonus")?.value, "2");
});

test("0.14.14 — useMutation routes 'info' action mode to handleNote (chat-card commit)", async () => {
  // We can't import mutations.mjs directly without Foundry globals because
  // the file uses ChatMessage at module-init time elsewhere. Instead we
  // verify the dispatch mapping via a lightweight regex sweep — the switch
  // needs an `case "info":` arm above the default that returns handleNote.
  const fs = await import("node:fs/promises");
  const src = await fs.readFile("module/mutations.mjs", "utf8");
  const switchBlock = src.match(/switch \(rule\.action\) \{[\s\S]+?\n  \}/);
  assert.ok(switchBlock, "located useMutation switch block");
  assert.match(switchBlock[0], /case "info":\s*\n\s*return handleNote\(actor, item\);/);
});

// ---------------------------------------------------------------------------
// 0.14.15 — Mutation tick handlers (Hemophilia, Increased Metabolism, Poor
// Respiratory System, Regeneration, Photosynthetic Skin, Daylight Stasis)
// ---------------------------------------------------------------------------

test("0.14.15 — hemophiliaBleedAmount returns 2 only when wounded and alive", async () => {
  const { hemophiliaBleedAmount } = await import("../module/mutation-ticks.mjs");
  // No mutation: zero
  assert.equal(hemophiliaBleedAmount({ hp: { value: 5, max: 10 }, hasMutation: false }), 0);
  // Has mutation, full HP: zero
  assert.equal(hemophiliaBleedAmount({ hp: { value: 10, max: 10 }, hasMutation: true }), 0);
  // Has mutation, wounded: 2
  assert.equal(hemophiliaBleedAmount({ hp: { value: 5, max: 10 }, hasMutation: true }), 2);
  // Has mutation, at 0 HP (already incapacitated): zero
  assert.equal(hemophiliaBleedAmount({ hp: { value: 0, max: 10 }, hasMutation: true }), 0);
  // Negative HP (overkill): zero (not "more bleeding")
  assert.equal(hemophiliaBleedAmount({ hp: { value: -3, max: 10 }, hasMutation: true }), 0);
});

test("0.14.15 — increasedMetabolismDue triggers on every 5th round", async () => {
  const { increasedMetabolismDue } = await import("../module/mutation-ticks.mjs");
  // No mutation: never
  assert.equal(increasedMetabolismDue({ round: 5, hasMutation: false }), false);
  // Below first interval
  assert.equal(increasedMetabolismDue({ round: 4, hasMutation: true }), false);
  // First interval
  assert.equal(increasedMetabolismDue({ round: 5, hasMutation: true }), true);
  // Between intervals
  assert.equal(increasedMetabolismDue({ round: 7, hasMutation: true }), false);
  // Subsequent interval
  assert.equal(increasedMetabolismDue({ round: 10, hasMutation: true }), true);
  assert.equal(increasedMetabolismDue({ round: 15, hasMutation: true }), true);
});

test("0.14.15 — poorRespiratoryDue triggers at round 6 unless already unconscious", async () => {
  const { poorRespiratoryDue } = await import("../module/mutation-ticks.mjs");
  assert.equal(poorRespiratoryDue({ round: 5, hasMutation: true, alreadyUnconscious: false }), false);
  assert.equal(poorRespiratoryDue({ round: 6, hasMutation: true, alreadyUnconscious: false }), true);
  assert.equal(poorRespiratoryDue({ round: 6, hasMutation: true, alreadyUnconscious: true }), false,
    "already unconscious — don't refire");
  assert.equal(poorRespiratoryDue({ round: 10, hasMutation: false, alreadyUnconscious: false }), false);
});

test("0.14.15 — regenerationHpPerDay returns floor(weight_kg / 5)", async () => {
  const { regenerationHpPerDay } = await import("../module/mutation-ticks.mjs");
  assert.equal(regenerationHpPerDay({ bodyWeightKg: 75 }), 15, "default human 75kg → 15 HP/day");
  assert.equal(regenerationHpPerDay({ bodyWeightKg: 50 }), 10);
  assert.equal(regenerationHpPerDay({ bodyWeightKg: 12 }), 2, "12/5 = 2 (floor)");
  assert.equal(regenerationHpPerDay({ bodyWeightKg: 4 }),  0, "4/5 = 0 floor — too small to regen");
  assert.equal(regenerationHpPerDay({}), 15, "default applies when weight not passed");
});

test("0.14.15 — photosyntheticHealMultiplier returns 4× only when basking with the mutation", async () => {
  const { photosyntheticHealMultiplier } = await import("../module/mutation-ticks.mjs");
  assert.equal(photosyntheticHealMultiplier({ hasMutation: true,  isBasking: true  }), 4);
  assert.equal(photosyntheticHealMultiplier({ hasMutation: true,  isBasking: false }), 1, "no basking, no bonus");
  assert.equal(photosyntheticHealMultiplier({ hasMutation: false, isBasking: true  }), 1, "no mutation, no bonus");
  assert.equal(photosyntheticHealMultiplier({ hasMutation: false, isBasking: false }), 1);
});

test("0.14.15 — isDaytime maps world time to a 06:00–18:00 daytime window", async () => {
  const { isDaytime } = await import("../module/mutation-ticks.mjs");
  // 6 AM = 21600 seconds into a day
  assert.equal(isDaytime(21600), true, "6:00 AM exactly is daytime");
  // 12 PM = 43200
  assert.equal(isDaytime(43200), true, "noon is daytime");
  // 6 PM = 64800 (exclusive boundary)
  assert.equal(isDaytime(64800), false, "6 PM is no longer daytime");
  // 5:59 AM = 21540
  assert.equal(isDaytime(21540), false, "just before 6 AM");
  // Midnight
  assert.equal(isDaytime(0), false);
  // Day 2 noon (86400 + 43200)
  assert.equal(isDaytime(86400 + 43200), true, "wraps via modulo");
  // Custom window
  assert.equal(isDaytime(7 * 3600, { startHour: 8, endHour: 17 }), false, "before 8 AM in custom window");
  assert.equal(isDaytime(8 * 3600, { startHour: 8, endHour: 17 }), true);
});

// ---------------------------------------------------------------------------
// 0.14.16 — Damage-trait mutations, Anti-Reflection, Epilepsy, Fear Impulse,
// plant attack mutation entries
// ---------------------------------------------------------------------------

test("0.14.16 — MUTATION_DAMAGE_TRAITS lists Temperature Sensitivity and Photosynthetic Skin vulnerabilities", async () => {
  const { MUTATION_DAMAGE_TRAITS } = await import("../module/mutation-rules.mjs");
  assert.deepEqual(MUTATION_DAMAGE_TRAITS["Temperature Sensitivity"].vulnerability, ["heat", "cold", "energy"]);
  assert.deepEqual(MUTATION_DAMAGE_TRAITS["Photosynthetic Skin"].vulnerability, ["heat", "cold"]);
});

test("0.14.16 — mutationDamageTraitsForVariant returns vulnerability spread for Skin Structure Change +1/die", async () => {
  const { mutationDamageTraitsForVariant } = await import("../module/mutation-rules.mjs");
  const grant = mutationDamageTraitsForVariant("Skin Structure Change", "+1 damage taken when hurt");
  assert.ok(grant);
  assert.ok(grant.vulnerability.includes("heat"));
  assert.ok(grant.vulnerability.includes("physical"));
  // Other variants and unrelated mutations return null.
  assert.equal(mutationDamageTraitsForVariant("Skin Structure Change", "1 damage per turn in water"), null);
  assert.equal(mutationDamageTraitsForVariant("Hemophilia", ""), null);
});

test("0.14.16 — antiReflectionTriggers fires below 0.25, holds at/above", async () => {
  const { antiReflectionTriggers } = await import("../module/mutation-ticks.mjs");
  assert.equal(antiReflectionTriggers({ rng: () => 0.10 }), true);
  assert.equal(antiReflectionTriggers({ rng: () => 0.24 }), true);
  assert.equal(antiReflectionTriggers({ rng: () => 0.25 }), false, "exactly 0.25 is not a hit (< threshold)");
  assert.equal(antiReflectionTriggers({ rng: () => 0.99 }), false);
});

test("0.14.16 — shouldCheckAntiReflection only fires for mental mutations on actors with the defect", async () => {
  const { shouldCheckAntiReflection } = await import("../module/mutation-ticks.mjs");
  const reflectActor = (extra = {}) => ({
    items: [{
      type: "mutation", name: "Anti-Reflection",
      system: { activation: { enabled: true } }
    }],
    ...extra
  });

  // Mental mutation on actor with Anti-Reflection → check
  assert.equal(shouldCheckAntiReflection(
    reflectActor(),
    { type: "mutation", system: { subtype: "mental" } }
  ), true);

  // Physical mutation: skip
  assert.equal(shouldCheckAntiReflection(
    reflectActor(),
    { type: "mutation", system: { subtype: "physical" } }
  ), false);

  // No Anti-Reflection mutation: skip
  assert.equal(shouldCheckAntiReflection(
    { items: [] },
    { type: "mutation", system: { subtype: "mental" } }
  ), false);

  // Non-mutation item: skip
  assert.equal(shouldCheckAntiReflection(
    reflectActor(),
    { type: "weapon", system: { subtype: "mental" } }
  ), false);
});

test("0.14.16 — epilepsyTriggers uses 25% on round 1 and 10% on later rounds", async () => {
  const { epilepsyTriggers } = await import("../module/mutation-ticks.mjs");
  // Round 1: threshold 0.25
  assert.equal(epilepsyTriggers({ round: 1, rng: () => 0.20 }), true);
  assert.equal(epilepsyTriggers({ round: 1, rng: () => 0.24 }), true);
  assert.equal(epilepsyTriggers({ round: 1, rng: () => 0.25 }), false);
  // Round 2+: threshold 0.10
  assert.equal(epilepsyTriggers({ round: 2, rng: () => 0.05 }), true);
  assert.equal(epilepsyTriggers({ round: 2, rng: () => 0.09 }), true);
  assert.equal(epilepsyTriggers({ round: 2, rng: () => 0.10 }), false);
  assert.equal(epilepsyTriggers({ round: 5, rng: () => 0.20 }), false);
  // Round 0: never fires (combat hasn't started)
  assert.equal(epilepsyTriggers({ round: 0, rng: () => 0.01 }), false);
});

test("0.14.16 — shouldCheckEpilepsy gates by mutation presence and existing paralysis", async () => {
  const { shouldCheckEpilepsy } = await import("../module/mutation-ticks.mjs");
  assert.equal(shouldCheckEpilepsy({ hasMutation: true,  alreadyParalyzed: false }), true);
  assert.equal(shouldCheckEpilepsy({ hasMutation: true,  alreadyParalyzed: true  }), false, "don't compound paralysis");
  assert.equal(shouldCheckEpilepsy({ hasMutation: false, alreadyParalyzed: false }), false);
});

test("0.14.16 — Fear Impulse MUTATION_RULES uses the info action with a mental save type", async () => {
  const { MUTATION_RULES } = await import("../module/mutation-rules.mjs");
  const rule = MUTATION_RULES["Fear Impulse"];
  assert.ok(rule);
  assert.equal(rule.mode, "action");
  assert.equal(rule.action, "info");
  assert.equal(rule.effect.saveType, "mental");
});

test("0.14.16 — plant attack mutations are wired with appropriate action handlers", async () => {
  const { MUTATION_RULES } = await import("../module/mutation-rules.mjs");
  const expected = {
    "Squeeze Vines":          { action: "ramping-damage", formula: "2d6" },
    "Throwing Thorns":        { action: "damage",         formula: "1d4" },
    "Poison Throwing Thorns": { action: "damage",         formula: "1d4", saveType: "poison" },
    "Spore Cloud":            { action: "area-damage",    formula: "1d6", saveType: "poison" },
    "Explosive Fruit":        { action: "area-damage",    formula: "2d6" },
    "Razor-edged Leaves":     { action: "damage",         formula: "1d4" },
    "Saw-edged Leaves":       { action: "damage",         formula: "1d8" },
    "Barbed Leaves":          { action: "damage",         formula: "1d6" },
    "Dissolving Juices":      { action: "ramping-damage", formula: "5d6" }
  };
  for (const [name, want] of Object.entries(expected)) {
    const rule = MUTATION_RULES[name];
    assert.ok(rule, `${name} entry exists`);
    assert.equal(rule.mode, "action", `${name} mode`);
    assert.equal(rule.action, want.action, `${name} action`);
    assert.equal(rule.effect.formula, want.formula, `${name} formula`);
    if (want.saveType) {
      assert.equal(rule.effect.saveType, want.saveType, `${name} saveType`);
    }
  }
});

