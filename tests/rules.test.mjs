import test from "node:test";
import assert from "node:assert/strict";

import {
  addDiceToFormula,
  addFlatBonusToFormula,
  addPerDieBonusToFormula,
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

test("pilot animation registry resolves supported weapons and mutation aliases", () => {
  assert.equal(resolvePilotAnimationKey("Laser Pistol", { kind: "weapon" }), "Laser Pistol");
  assert.equal(resolvePilotAnimationKey("Built-in Laser Pistol (Left)", { kind: "weapon" }), "Laser Pistol");
  assert.equal(resolvePilotAnimationKey("Black Ray Gun", { kind: "weapon" }), "Black Ray Gun");
  assert.equal(resolvePilotAnimationKey("Force Field Generation", { kind: "mutation" }), "Force Field Generation");
  assert.equal(resolvePilotAnimationKey("Stone Spear", { kind: "weapon" }), "");
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
  assert.equal(actors.length, 4);
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
