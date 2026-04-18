/**
 * Gamma World actor document with derived combat / mutation data helpers.
 */

import { applyMutationModifiers, baseCombatBonuses, enrichMutationSystemData } from "../mutation-rules.mjs";
import { applyEquipmentModifiers } from "../equipment-rules.mjs";
import { applyTemporaryDerivedModifiers } from "../effect-state.mjs";
import { actorInitiativeModifier } from "../initiative.mjs";
import { applyRobotDerived, actorIsRobot } from "../robots.mjs";
import { charismaReactionAdjustment, resolveEncounterIntelligence } from "../tables/encounter-tables.mjs";
import { runAsGM } from "../gm-executor.mjs";
import { artifactUseProfile } from "../artifact-rules.mjs";
import { shouldRouteHpReduction } from "../save-flow.mjs";

function clampArmorClass(value) {
  return Math.max(1, Math.min(10, Math.round(Number(value) || 10)));
}

function clampResistance(value) {
  return Math.max(3, Math.min(18, Math.round(Number(value) || 3)));
}

function roundMovement(value) {
  return Math.max(1, Math.round(Number(value) || 0));
}

function supportsGammaWorldActorData(actor) {
  return ["character", "monster"].includes(actor?.type);
}

export function buildActorDerived(actor) {
  const system = actor.system;
  const armor = actor.items.filter((item) => item.type === "armor" && item.system.equipped);
  const wornArmor = armor.filter((item) => item.system.armorType !== "shield");
  const shields = armor.filter((item) => item.system.armorType === "shield");
  const bestArmor = wornArmor.length
    ? Math.min(...wornArmor.map((item) => Number(item.system.acValue) || 10))
    : 10;
  const dxPenalty = armor.reduce((sum, item) => sum + Math.max(0, Number(item.system.dxPenalty) || 0), 0);
  const baseBonuses = baseCombatBonuses(actor);

  const charismaScore = Math.round(Number(system.attributes.ch.value) || 0);
  const reactionFromCharisma = charismaReactionAdjustment(charismaScore);
  const maxFollowers = charismaScore <= 4
    ? 1
    : charismaScore <= 6
      ? 2
      : charismaScore <= 8
        ? 3
        : charismaScore <= 10
          ? 4
          : charismaScore <= 12
            ? 5
            : charismaScore <= 14
              ? 6
              : charismaScore <= 15
                ? 7
                : charismaScore <= 16
                  ? 8
                  : charismaScore <= 17
                    ? 10
                    : 15;
  const moraleAdjustment = charismaScore <= 4
    ? -3
    : charismaScore <= 6
      ? -2
      : charismaScore <= 8
        ? -1
        : charismaScore <= 12
          ? 0
          : charismaScore <= 15
            ? 1
      : 2;
  const encounterIntelligence = resolveEncounterIntelligence(actor);

  const derived = {
    hpBase: Math.max(0, Math.round(Number(system.resources.hp.base ?? system.resources.hp.max ?? 0) || 0)),
    hpBonus: 0,
    hpMax: Math.max(1, Math.round(Number(system.resources.hp.max ?? 0) || 1)),
    baseAc: clampArmorClass(system.combat?.baseAc ?? 10),
    armorAc: bestArmor,
    shieldCount: shields.length,
    ac: 10,
    dxPenalty,
    mentalResistance: clampResistance(system.attributes.ms.value),
    radiationResistance: clampResistance(system.attributes.cn.value),
    poisonResistance: clampResistance(system.attributes.cn.value),
    mentalAttackStrength: Math.round(Number(system.attributes.ms.value) || 0),
    movementBase: roundMovement(system.details.movement ?? 120),
    movementMultiplier: 1,
    movement: roundMovement(system.details.movement ?? 120),
    initiative: actorInitiativeModifier(actor),
    toHitBonus: baseBonuses.toHitBonus,
    meleeToHitBonus: baseBonuses.meleeToHitBonus ?? 0,
    closeRangeToHitBonus: 0,
    damageFlat: baseBonuses.damageFlat,
    damagePerDie: 0,
    weaponExtraDice: 0,
    conventionalWeaponExtraDice: 0,
    extraAttacks: 0,
    attacksPerRound: 1,
    damageTakenMultiplier: 1,
    damageReductionMultiplier: 1,
    flightSpeed: 0,
    jumpSpeed: 0,
    liftCapacity: 0,
    charismaBonus: 0,
    reactionAdjustment: Math.round(Number(system.encounter?.reactionModifier ?? 0)) + reactionFromCharisma,
    charismaReactionAdjustment: reactionFromCharisma,
    maxFollowers,
    moraleAdjustment,
    moraleModifier: Math.round(Number(system.encounter?.morale ?? 0)),
    encounterIntelligence,
    surpriseModifier: Math.round(Number(system.encounter?.surpriseModifier ?? 0)),
    cannotBeSurprised: !!system.encounter?.cannotBeSurprised,
    artifactAnalysisBonus: 0,
    artifactAnalysisSpeed: 1,
    artifactUse: {
      rollModifier: 0,
      speedMultiplier: 1,
      instantCharts: [],
      notes: []
    },
    laserImmune: false,
    mentalImmune: false,
    activeEffects: []
  };

  for (const item of actor.items.filter((entry) => entry.type === "mutation")) {
    enrichMutationSystemData(item);
  }

  applyMutationModifiers(actor, derived);
  applyEquipmentModifiers(actor, derived);
  applyRobotDerived(actor, derived);

  let armorClass = Math.min(derived.baseAc, derived.armorAc);
  armorClass -= derived.shieldCount;
  derived.ac = clampArmorClass(armorClass);
  derived.toHitBonus -= derived.dxPenalty;
  derived.initiative = actorInitiativeModifier(actor);
  derived.movement = roundMovement(derived.movementBase * derived.movementMultiplier);
  derived.hpMax = Math.max(1, derived.hpBase + derived.hpBonus);
  derived.mentalResistance = clampResistance(derived.mentalResistance);
  derived.radiationResistance = clampResistance(derived.radiationResistance);
  derived.poisonResistance = clampResistance(derived.poisonResistance);
  derived.attacksPerRound = Math.max(1, 1 + derived.extraAttacks);
  derived.charisma = clampResistance((system.attributes.ch.value ?? 0) + derived.charismaBonus);
  applyTemporaryDerivedModifiers(actor, derived);
  derived.mentalResistance = clampResistance(derived.mentalResistance);
  derived.radiationResistance = clampResistance(derived.radiationResistance);
  derived.poisonResistance = clampResistance(derived.poisonResistance);
  derived.ac = clampArmorClass(derived.ac);
  derived.movement = roundMovement(derived.movementBase * derived.movementMultiplier);
  const profile = artifactUseProfile(actor);
  derived.artifactUse = {
    rollModifier: profile.modifier + Math.round(Number(derived.artifactAnalysisBonus) || 0),
    speedMultiplier: Math.max(1, Number(profile.speedMultiplier || 1)) * Math.max(1, Number(derived.artifactAnalysisSpeed || 1)),
    instantCharts: [...profile.instantCharts],
    notes: [...profile.notes]
  };
  derived.artifactAnalysisBonus = derived.artifactUse.rollModifier;
  derived.artifactAnalysisSpeed = derived.artifactUse.speedMultiplier;

  return derived;
}

export class GammaWorldActor extends Actor {
  async _preUpdate(changed, options, user) {
    const result = await super._preUpdate(changed, options, user);
    if (result === false || options?.gammaWorldSync || game.user?.isGM || !supportsGammaWorldActorData(this)) return result;

    const nextHp = foundry.utils.getProperty(changed, "system.resources.hp.value");
    if (nextHp == null) return result;

    const currentHp = Number(this.system.resources.hp.value ?? 0);
    const normalizedHp = Math.max(0, Math.floor(Number(nextHp) || 0));
    foundry.utils.setProperty(changed, "system.resources.hp.value", normalizedHp);

    if (shouldRouteHpReduction({ currentHp, nextHp: normalizedHp, isGM: false })) {
      await runAsGM("actor-set-hp", { actorUuid: this.uuid, value: normalizedHp });
      return false;
    }

    return result;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    if (!supportsGammaWorldActorData(this)) return;

    this.gw = buildActorDerived(this);

    // Expose the effective values in the runtime system data so templates and
    // formulas always see the same numbers, even before the sync hook writes
    // them back to the document.
    this.system.resources.hp.max = this.gw.hpMax;
    this.system.resources.ac = this.gw.ac;
    this.system.resources.mentalResistance = this.gw.mentalResistance;
    this.system.resources.radResistance = this.gw.radiationResistance;
    this.system.resources.poisonResistance = this.gw.poisonResistance;

    this._prepareEncumbrance();
  }

  /**
   * Compute carried weight, carry cap, and strict encumbrance state.
   * Strict mode (per world design):
   *   - encumbered (carried > cap): halve movement, -1 to-hit on physical attacks, DX-AC bonus zeroed.
   *   - overloaded (carried > cap*2): movement = 0, attacks refused, mutations cannot be activated.
   *
   * Convention: underscore-prefixed instead of ES `#private` fields. Private
   * methods trip V8's receiver brand check when Foundry's ActorDelta
   * reconstructs a synthetic actor for an unlinked token — the receiver
   * passed through the synthetic pipeline isn't the direct class instance
   * the private method was declared on, so `this.#foo()` throws
   * "Receiver must be an instance of class GammaWorldActor". Foundry core
   * uses the same `_` convention for exactly this reason.
   */
  _prepareEncumbrance() {
    const system = this.system;
    const physStrength = Number(system.attributes?.ps?.value ?? 10);
    const baseCarry = physStrength * 10;

    let containerCap = 0;
    let carried = 0;
    for (const item of this.items) {
      const qty = Math.max(0, Number(item.system?.quantity ?? 1));
      const weight = Math.max(0, Number(item.system?.weight ?? 0));
      carried += qty * weight;
      if (item.type === "gear"
          && item.system?.subtype === "container"
          && item.system?.equipped) {
        containerCap += Math.max(0, Number(item.system?.container?.capacity ?? 0));
      }
    }

    const carryMax = baseCarry + containerCap;
    const encumbered = carried > carryMax;
    const overloaded = carried > (carryMax * 2);

    system.encumbrance = {
      carried: Math.round(carried * 100) / 100,
      max: carryMax,
      penalized: encumbered || overloaded
    };

    this.gw = this.gw ?? {};
    this.gw.encumbrance = {
      carried: system.encumbrance.carried,
      max: carryMax,
      encumbered,
      overloaded
    };

    if (encumbered || overloaded) {
      const moveFactor = overloaded ? 0 : 0.5;
      this.gw.movement = Math.round((this.gw.movement ?? system.details.movement ?? 120) * moveFactor);
      this.gw.movementMultiplier = (this.gw.movementMultiplier ?? 1) * moveFactor;
      this.gw.toHitBonus = (this.gw.toHitBonus ?? 0) - 1;
      if (this.gw.dxAcBonus) this.gw.dxAcBonus = 0;
    }
  }

  async refreshDerivedResources({ adjustCurrent = false } = {}) {
    if (!supportsGammaWorldActorData(this)) return;

    const derived = buildActorDerived(this);
    const update = {};
    const currentHp = Number(this.system.resources.hp.value ?? 0);
    const oldMaxHp = Number(this.system.resources.hp.max ?? 0);
    const desiredCurrent = adjustCurrent && currentHp >= oldMaxHp
      ? derived.hpMax
      : Math.min(currentHp, derived.hpMax);

    if ((this.system.resources.hp.max ?? 0) !== derived.hpMax) {
      update["system.resources.hp.max"] = derived.hpMax;
    }
    if ((this.system.resources.hp.value ?? 0) !== desiredCurrent) {
      update["system.resources.hp.value"] = desiredCurrent;
    }
    if ((this.system.resources.ac ?? 0) !== derived.ac) {
      update["system.resources.ac"] = derived.ac;
    }
    if ((this.system.resources.mentalResistance ?? 0) !== derived.mentalResistance) {
      update["system.resources.mentalResistance"] = derived.mentalResistance;
    }
    if ((this.system.resources.radResistance ?? 0) !== derived.radiationResistance) {
      update["system.resources.radResistance"] = derived.radiationResistance;
    }
    if ((this.system.resources.poisonResistance ?? 0) !== derived.poisonResistance) {
      update["system.resources.poisonResistance"] = derived.poisonResistance;
    }

    if (Object.keys(update).length) {
      await this.update(update, { gammaWorldSync: true });
    }
  }

  async applyDamage(amount) {
    const damage = Math.max(0, Math.floor(Number(amount) || 0));
    if (!game.user?.isGM) {
      return runAsGM("actor-apply-damage", { actorUuid: this.uuid, amount: damage });
    }
    const current = Number(this.system.resources.hp.value ?? 0);
    const result = await this.update({ "system.resources.hp.value": current - damage });
    if (actorIsRobot(this)) {
      const { syncRobotImpairments } = await import("../robots.mjs");
      await syncRobotImpairments(this);
    }
    return result;
  }

  async heal(amount) {
    const healing = Math.max(0, Math.floor(Number(amount) || 0));
    if (!game.user?.isGM && !this.isOwner) {
      return runAsGM("actor-heal", { actorUuid: this.uuid, amount: healing });
    }
    const current = Number(this.system.resources.hp.value ?? 0);
    const max = Number(this.system.resources.hp.max ?? current);
    const result = await this.update({ "system.resources.hp.value": Math.min(max, current + healing) });
    if (actorIsRobot(this)) {
      const { syncRobotImpairments } = await import("../robots.mjs");
      await syncRobotImpairments(this);
    }
    return result;
  }

  async setHitPoints(value) {
    const target = Math.max(0, Math.floor(Number(value) || 0));
    const current = Number(this.system.resources.hp.value ?? 0);
    if (!game.user?.isGM && (shouldRouteHpReduction({ currentHp: current, nextHp: target, isGM: false }) || !this.isOwner)) {
      return runAsGM("actor-set-hp", { actorUuid: this.uuid, value: target });
    }
    const result = await this.update({ "system.resources.hp.value": target });
    if (actorIsRobot(this)) {
      const { syncRobotImpairments } = await import("../robots.mjs");
      await syncRobotImpairments(this);
    }
    return result;
  }
}
