/**
 * Gamma World actor document with derived combat / mutation data helpers.
 */

import { applyMutationEffects, applyMutationModifiers, baseCombatBonuses, enrichMutationSystemData, MUTATION_DAMAGE_TRAITS, mutationDamageTraitsForVariant } from "../mutation-rules.mjs";
import { applyEquipmentEffects, applyEquipmentModifiers } from "../equipment-rules.mjs";
import { armorIsInert } from "../artifact-power.mjs";
import { applyTemporaryDerivedModifiers } from "../effect-state.mjs";
import { actorInitiativeModifier } from "../initiative.mjs";
import { applyRobotDerived, actorIsRobot } from "../robots.mjs";
import { charismaReactionAdjustment, resolveEncounterIntelligence } from "../tables/encounter-tables.mjs";
import { runAsGM } from "../gm-executor.mjs";
import { artifactUseProfile } from "../artifact-rules.mjs";
import { shouldRouteHpReduction } from "../save-flow.mjs";
import { clampHpUpdate, clampHitDiceUpdate, deadStatusTransition, bloodiedStatusTransition } from "../hp-clamp.mjs";
import { computeEncumbrance } from "../encumbrance.mjs";

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
  // 0.13.0 Batch 4 — split equipped armor by power state. An "inert"
  // powered-armor (cells depleted) loses its acValue benefit, force
  // field, mobility upgrades, and trait grants — but the wearer is
  // still lugging the carcass around, so dxPenalty stays.
  const poweredArmor = armor.filter((item) => !armorIsInert(item));
  const wornArmor = poweredArmor.filter((item) => item.system.armorType !== "shield");
  const shields = poweredArmor.filter((item) => item.system.armorType === "shield");
  const bestArmor = wornArmor.length
    ? Math.min(...wornArmor.map((item) => Number(item.system.acValue) || 10))
    : 10;
  // dxPenalty reads from the full equipped set (inert armors still
  // weigh on the wearer; the suit doesn't get lighter when it dies).
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
    // 0.11.0: metric move — default human 10 m/round (was 120 legacy).
    movementBase: roundMovement(system.details.movement ?? 10),
    movementMultiplier: 1,
    movement: roundMovement(system.details.movement ?? 10),
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
    // Phase 5: aggregated damage-trait sets. Start from the actor's
    // own declared traits, then fold in every equipped armor's grants
    // below via applyEquipmentModifiers / explicit rollup.
    damageResistance:    new Set(system.traits?.damageResistance    ?? []),
    damageImmunity:      new Set(system.traits?.damageImmunity      ?? []),
    damageVulnerability: new Set(system.traits?.damageVulnerability ?? []),
    // 0.9.0 Tier 3 — per-attribute delta accumulated from temp effects
    // (both AE-backed and legacy flag entries). applyTemporaryDerivedModifiers
    // increments each attribute's tally; external readers can inspect the
    // shift without walking the temp-effect list.
    attributeShift: { dx: 0, ps: 0, ms: 0, ch: 0, cn: 0 },
    activeEffects: []
  };

  for (const item of actor.items.filter((entry) => entry.type === "mutation")) {
    enrichMutationSystemData(item);
  }

  applyMutationModifiers(actor, derived);
  // 0.8.4 Tier 1 — data-driven AE-style mutation effects (pilot of 10
  // mutations whose modifiers moved out of the hardcoded switch above).
  // Runs after the switch so the pilot mutations see a fully-initialized
  // derived object to fold into.
  applyMutationEffects(actor, derived);
  applyEquipmentModifiers(actor, derived);
  // 0.9.1 Tier 4 — declarative armor effects (flight / jump / lift from
  // powered armors and Energized Armor). Runs after applyEquipmentModifiers
  // so the imperative hazardProtection booleans land first; the
  // declarative path then layers mobility UPGRADEs on top. Both paths
  // read `item.system.equipped` as the gate, so unequipped armor is a
  // no-op through either.
  applyEquipmentEffects(actor, derived);
  applyRobotDerived(actor, derived);

  // Armor trait rollup — every equipped armor piece contributes its
  // grants to the aggregated sets. Runs after applyEquipmentModifiers
  // so any legacy protection booleans the equipment layer already
  // translated are included too.
  // 0.13.0 Batch 4 — inert powered armor (cells depleted) loses its
  // grants; the force field has collapsed and the suit's resistances
  // were dependent on the powered defenses.
  for (const armor of actor.items.filter((i) =>
    i.type === "armor" && i.system?.equipped && !armorIsInert(i)
  )) {
    const t = armor.system?.traits ?? {};
    for (const v of t.grantsResistance    ?? []) if (v) derived.damageResistance.add(v);
    for (const v of t.grantsImmunity      ?? []) if (v) derived.damageImmunity.add(v);
    for (const v of t.grantsVulnerability ?? []) if (v) derived.damageVulnerability.add(v);
    // Legacy booleans: keep reading them during the deprecation window
    // so worlds that haven't migrated still get the expected immunities.
    const p = armor.system?.protection ?? {};
    if (p.blackRayImmune)  derived.damageImmunity.add("black-ray");
    if (p.radiationImmune) derived.damageImmunity.add("radiation");
    if (p.poisonImmune)    derived.damageImmunity.add("poison");
    if (p.laserImmune)     derived.damageImmunity.add("laser");
    if (p.mentalImmune)    derived.damageImmunity.add("mental");
  }

  // 0.14.16 — fold mutation-driven damage traits into the same sets.
  // Static grants (Temperature Sensitivity, Photosynthetic Skin) come
  // from MUTATION_DAMAGE_TRAITS; Skin Structure Change reads the
  // rolled variant via mutationDamageTraitsForVariant.
  for (const mut of actor.items.filter((i) => i.type === "mutation" && (i.system?.activation?.enabled ?? true))) {
    const staticGrant = MUTATION_DAMAGE_TRAITS[mut.name];
    const variant = mut.system?.reference?.variant ?? "";
    const variantGrant = variant ? mutationDamageTraitsForVariant(mut.name, variant) : null;
    for (const grant of [staticGrant, variantGrant]) {
      if (!grant) continue;
      for (const t of grant.vulnerability ?? []) derived.damageVulnerability.add(t);
      for (const t of grant.immunity      ?? []) derived.damageImmunity.add(t);
      for (const t of grant.resistance    ?? []) derived.damageResistance.add(t);
    }
  }

  // Keep the legacy convenience flags in sync with the aggregated set
  // so the 60+ call sites that read `actor.gw.laserImmune` /
  // `actor.gw.mentalImmune` keep working without change.
  derived.laserImmune  = derived.laserImmune  || derived.damageImmunity.has("laser");
  derived.mentalImmune = derived.mentalImmune || derived.damageImmunity.has("mental");

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
  // 0.8.6 — `derived.artifactAnalysisBonus` carries ONLY the AE + temp
  // contribution (Scientific Genius -1, any temp cloud modifiers). The
  // INT + switch portion lives in `profile.modifier`. The combined roll
  // modifier surfaces on `derived.artifactUse.rollModifier`; external
  // callers fetch the full value via `artifactUseProfileForChart`, which
  // adds `actor.gw.artifactAnalysisBonus` back on top. Keeping the two
  // sources separate prevents double-counting when an external roll
  // re-computes the profile after prepareDerivedData has run.
  const rawAnalysisBonus = Math.round(Number(derived.artifactAnalysisBonus) || 0);
  derived.artifactUse = {
    rollModifier: profile.modifier + rawAnalysisBonus,
    speedMultiplier: Math.max(1, Number(profile.speedMultiplier || 1)) * Math.max(1, Number(derived.artifactAnalysisSpeed || 1)),
    instantCharts: [...profile.instantCharts],
    notes: [...profile.notes]
  };
  derived.artifactAnalysisSpeed = derived.artifactUse.speedMultiplier;

  return derived;
}

export class GammaWorldActor extends Actor {
  async _preUpdate(changed, options, user) {
    const result = await super._preUpdate(changed, options, user);
    if (result === false || !supportsGammaWorldActorData(this)) return result;

    // 0.14.1 — level changed: bump available Hit Dice by the level delta
    // so leveling up gives the player back the freshly-gained HD. Skip when
    // the caller is doing a sync update (avoid recursion) or when the
    // hitDice resource isn't yet populated.
    const nextLevel = foundry.utils.getProperty(changed, "system.details.level");
    if (nextLevel != null && !options?.gammaWorldSync) {
      const currentLevel = Number(this.system?.details?.level ?? 1);
      const newLevel = Math.max(1, Math.floor(Number(nextLevel) || currentLevel));
      const delta = newLevel - currentLevel;
      if (delta > 0) {
        const currentHd = Number(this.system?.resources?.hitDice?.value ?? 0);
        const newHd = Math.max(0, Math.min(newLevel, currentHd + delta));
        foundry.utils.setProperty(changed, "system.resources.hitDice.value", newHd);
      } else if (delta < 0) {
        // De-leveling (rare GM tool). Clamp value to new max.
        const currentHd = Number(this.system?.resources?.hitDice?.value ?? 0);
        foundry.utils.setProperty(changed, "system.resources.hitDice.value", Math.min(currentHd, newLevel));
      }
    }

    // 0.14.12 — enforce the HP invariant `value <= max` for every editor
    // (player, GM, macro, API) before the GM short-circuit below. Uses
    // the incoming `max` if the same update changes both fields; else
    // falls back to the actor's current effective max. Also pulls a
    // stranded `value` down when only `max` is being lowered.
    clampHpUpdate(changed, this.system?.resources?.hp);

    // 0.14.13 — same invariant for the Hit Dice pool. Ceiling is the
    // actor's level (the schema's `hitDice.max` is rebuilt from level
    // in prepareDerivedData every cycle, so it isn't authoritative).
    // The level-up branch above already wrote a leveled `hitDice.value`
    // when level changed; this clamp catches direct-edit paths.
    clampHitDiceUpdate(changed, {
      value: this.system?.resources?.hitDice?.value,
      max:   this.system?.details?.level
    });

    if (options?.gammaWorldSync || game.user?.isGM) return result;

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

  /**
   * 0.14.13 — auto-toggle the core "dead" status effect when an HP
   * update crosses the 0 threshold either way. The toggle is gated to
   * one client (the GM who issued / received the update) to keep the
   * status flip from firing N times in N-player worlds, and short-
   * circuits when HP isn't in the update so manual GM status toggles
   * on healthy actors aren't overwritten on the next unrelated edit.
   *
   * The "dead" status is Foundry core's default condition (skull
   * overlay); it isn't redefined in `GAMMA_WORLD_STATUS_EFFECTS`. GW1e
   * treats 0 HP as killed; resurrection / stabilization is a GM call
   * (manual untoggle, or heal back to >0 HP which auto-untoggles here).
   */
  async _onUpdate(changed, options, userId) {
    await super._onUpdate?.(changed, options, userId);
    if (!supportsGammaWorldActorData(this)) return;
    if (!game.user?.isGM) return;
    if (foundry.utils.getProperty(changed, "system.resources.hp.value") == null) return;

    const deadAction = deadStatusTransition({
      currentHp: this.system?.resources?.hp?.value,
      hasDeadStatus: !!this.statuses?.has?.("dead")
    });
    if (deadAction != null) {
      try {
        await this.toggleStatusEffect("dead", { active: deadAction === "set" });
      } catch (error) {
        console.warn(`gamma-world-1e | dead status auto-toggle failed for ${this.name}`, error);
      }
    }

    // 0.14.17 — bloodied status auto-toggle. Threshold is configurable
    // via the world setting (default 0.5 = 50% HP). Same transition-only
    // contract as dead-status: a manual GM toggle on a healthy actor
    // sticks until HP changes.
    let threshold = 0.5;
    try { threshold = Number(game.settings?.get?.("gamma-world-1e", "bloodiedThreshold")) || 0.5; }
    catch { /* settings may not be ready in early lifecycle; fall through */ }
    const bloodiedAction = bloodiedStatusTransition({
      currentHp: this.system?.resources?.hp?.value,
      maxHp:     this.system?.resources?.hp?.max,
      hasBloodiedStatus: !!this.statuses?.has?.("bloodied"),
      threshold
    });
    if (bloodiedAction != null) {
      try {
        await this.toggleStatusEffect("bloodied", { active: bloodiedAction === "set" });
      } catch (error) {
        console.warn(`gamma-world-1e | bloodied status auto-toggle failed for ${this.name}`, error);
      }
    }
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

    // 0.14.1 — Hit Dice max derives from level. Persisted `value` is the
    // spendable pool; clamp it to max so a stale save can't exceed the
    // current cap. The persisted `max` field exists in the schema but
    // is never authoritative — derived data wins.
    if (this.system.resources.hitDice) {
      const level = Math.max(1, Math.floor(Number(this.system?.details?.level ?? 1)));
      this.system.resources.hitDice.max = level;
      const value = Number(this.system.resources.hitDice.value ?? 0);
      this.system.resources.hitDice.value = Math.max(0, Math.min(value, level));
    }

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
    const result = computeEncumbrance({
      items: [...this.items],
      physStrength: Number(system.attributes?.ps?.value ?? 10)
    });

    system.encumbrance = {
      carried: result.carried,
      max: result.max,
      penalized: result.penalized
    };

    this.gw = this.gw ?? {};
    this.gw.encumbrance = {
      carried: result.carried,
      max: result.max,
      encumbered: result.encumbered,
      overloaded: result.overloaded
    };

    if (result.encumbered || result.overloaded) {
      const moveFactor = result.overloaded ? 0 : 0.5;
      // 0.11.0: metric move — default human 10 m/round (was 120 legacy).
      this.gw.movement = Math.round((this.gw.movement ?? system.details.movement ?? 10) * moveFactor);
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
