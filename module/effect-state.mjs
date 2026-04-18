import { SYSTEM_ID, DAMAGE_TYPES } from "./config.mjs";
import { syncBarrierEffectsForActor, syncTemporaryEffectsForActor } from "./animations.mjs";
import { charismaReactionAdjustment } from "./tables/encounter-tables.mjs";
import { runAsGM } from "./gm-executor.mjs";
import { HOOK, fireAnnounceHook, fireVetoHook } from "./hook-surface.mjs";

/**
 * Canonicalize incoming damage into one of the DAMAGE_TYPES. `weaponTag`
 * carries the finer-grained channel when a weapon explicitly declares
 * one (laser / fusion / black-ray), so it wins over the broad
 * damage.type field. Unknown inputs fall back to "physical".
 */
const DAMAGE_TAG_OVERRIDES = Object.freeze({
  "black-ray": "black-ray",
  "laser":     "laser",
  "fusion":    "fusion",
  "needler":   "poison",
  "stun":      "electrical"
});

export function resolveDamageType(damageType = "", weaponTag = "") {
  const tag = String(weaponTag ?? "").trim().toLowerCase();
  if (tag && DAMAGE_TAG_OVERRIDES[tag]) return DAMAGE_TAG_OVERRIDES[tag];
  const raw = String(damageType ?? "").trim().toLowerCase();
  if (!raw) return "physical";
  if (DAMAGE_TYPES.includes(raw)) return raw;
  // Accept common aliases so content authored before Phase 5 keeps working.
  if (raw === "kinetic" || raw === "slashing" || raw === "piercing" || raw === "bludgeoning") return "physical";
  if (raw === "heat" || raw === "flame") return "fire";
  if (raw === "ice" || raw === "frost") return "cold";
  if (raw === "shock" || raw === "lightning") return "electrical";
  if (raw === "psionic" || raw === "psychic") return "mental";
  return "physical";
}

/**
 * Given an actor and a canonical damage type, return the multiplier the
 * trait model applies. Priority: immunity (0) > vulnerability (×2) >
 * resistance (×0.5). If none match, returns 1 (neutral).
 */
export function damageTraitMultiplier(actor, type) {
  const derived = actor?.gw ?? {};
  const immune     = derived.damageImmunity      instanceof Set ? derived.damageImmunity      : new Set(derived.damageImmunity      ?? []);
  const vulnerable = derived.damageVulnerability instanceof Set ? derived.damageVulnerability : new Set(derived.damageVulnerability ?? []);
  const resistant  = derived.damageResistance    instanceof Set ? derived.damageResistance    : new Set(derived.damageResistance    ?? []);
  if (immune.has(type))     return 0;
  if (vulnerable.has(type)) return 2;
  if (resistant.has(type))  return 0.5;
  return 1;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function liveActorDocument(actor) {
  if (!(actor instanceof Actor)) return actor;
  return game.actors?.get(actor.id) ?? actor;
}

function defaultActorState() {
  return {
    temporaryEffects: [],
    barriers: {},
    laserDeflect: {},
    partialFields: {},
    nonlethal: {
      stunDamage: 0,
      unconsciousRounds: 0
    }
  };
}

function combatRoundKey() {
  if (!game.combat) return "freeplay";
  return `${game.combat.id}:${game.combat.round ?? 0}:${game.combat.turn ?? 0}`;
}

function mergeWithDefaults(state) {
  return foundry.utils.mergeObject(defaultActorState(), clone(state ?? {}), {
    inplace: false,
    insertKeys: true,
    insertValues: true,
    overwrite: true
  });
}

async function replaceActorStateFlag(actor, state) {
  return actor.update({
    [`flags.${SYSTEM_ID}.-=state`]: null,
    [`flags.${SYSTEM_ID}.state`]: state
  });
}

export function getActorState(actor) {
  const liveActor = liveActorDocument(actor);
  return mergeWithDefaults(liveActor.getFlag(SYSTEM_ID, "state"));
}

export async function setActorState(actor, state, { refresh = true } = {}) {
  const liveActor = liveActorDocument(actor);
  if (!game.user?.isGM && !liveActor.isOwner) {
    await runAsGM("actor-set-state", {
      actorUuid: liveActor.uuid,
      state,
      refresh
    });
    return;
  }
  const updatedActor = (await replaceActorStateFlag(liveActor, state)) ?? liveActor;
  await syncBarrierEffectsForActor(updatedActor);
  await syncTemporaryEffectsForActor(updatedActor);
  if (refresh && ["character", "monster"].includes(updatedActor.type)) {
    await updatedActor.refreshDerivedResources({ adjustCurrent: false });
  }
}

export async function updateActorState(actor, updater, options = {}) {
  const state = getActorState(actor);
  await updater(state);
  await setActorState(actor, state, options);
  return state;
}

function effectStatusIds(state, statusId) {
  return state.temporaryEffects.filter((effect) => effect.statusId === statusId);
}

function statusStillActive(state, statusId) {
  if (!statusId) return false;
  if (effectStatusIds(state, statusId).length) return true;
  if ((statusId === "unconscious") && (Number(state.nonlethal?.unconsciousRounds ?? 0) > 0)) return true;
  return false;
}

async function setActorStatus(actor, statusId, active) {
  if (!statusId) return;
  if (!game.user?.isGM && !actor.isOwner) {
    await runAsGM("actor-toggle-status", {
      actorUuid: actor.uuid,
      statusId,
      active
    });
    return;
  }
  try {
    await actor.toggleStatusEffect(statusId, { active });
  } catch (_error) {
    // Cosmetic sync only.
  }
}

function normalizeTemporaryEffect(effect) {
  return {
    id: effect.id,
    label: effect.label ?? effect.id,
    mode: effect.mode ?? "generic",
    remainingRounds: Math.max(0, Number(effect.remainingRounds ?? 0)),
    statusId: effect.statusId ?? "",
    sourceName: effect.sourceName ?? "",
    changes: clone(effect.changes ?? {}),
    stacks: Math.max(0, Number(effect.stacks ?? 0)),
    maxStacks: Math.max(0, Number(effect.maxStacks ?? effect.remainingRounds ?? 0)),
    recoveryEvery: Math.max(0, Number(effect.recoveryEvery ?? 0)),
    phase: effect.phase ?? "active",
    tickFormula: effect.tickFormula ?? "",
    notes: effect.notes ?? ""
  };
}

export function activeTemporaryEffects(actor) {
  return getActorState(actor).temporaryEffects;
}

export async function applyTemporaryEffect(actor, effect) {
  const normalized = normalizeTemporaryEffect(effect);
  const state = await updateActorState(actor, async (next) => {
    const index = next.temporaryEffects.findIndex((entry) => entry.id === normalized.id);
    if (index >= 0) next.temporaryEffects[index] = normalized;
    else next.temporaryEffects.push(normalized);
  });

  if (normalized.statusId) await setActorStatus(actor, normalized.statusId, true);

  // Phase 2b: conditionApplied — announce after the effect is live on
  // the actor. Lets macros react to new status conditions.
  fireAnnounceHook(HOOK.conditionApplied, {
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? "",
    effect: normalized
  });

  return state;
}

export async function removeTemporaryEffect(actor, effectId) {
  const effect = getActorState(actor).temporaryEffects.find((entry) => entry.id === effectId);
  const statusId = effect?.statusId ?? "";
  const state = await updateActorState(actor, async (next) => {
    next.temporaryEffects = next.temporaryEffects.filter((entry) => entry.id !== effectId);
  });

  if (statusId && !statusStillActive(state, statusId)) {
    await setActorStatus(actor, statusId, false);
  }
  return state;
}

export async function setBarrier(actor, barrier) {
  await updateActorState(actor, async (state) => {
    state.barriers[barrier.id] = {
      id: barrier.id,
      label: barrier.label ?? barrier.id,
      sourceName: barrier.sourceName ?? barrier.label ?? barrier.id,
      remaining: Math.max(0, Number(barrier.remaining ?? 0)),
      hazardProtection: clone(barrier.hazardProtection ?? {}),
      blackRayImmune: !!barrier.blackRayImmune
    };
  });
}

export async function clearBarrier(actor, barrierId) {
  await updateActorState(actor, async (state) => {
    delete state.barriers[barrierId];
  });
}

export function temporaryEffectSummary(actor) {
  const state = getActorState(actor);
  const effects = activeTemporaryEffects(actor).map((effect) => {
    let suffix = "";
    if (effect.mode === "tear-gas") {
      suffix = effect.phase === "recovery"
        ? `recovery ${effect.stacks}`
        : `stacks ${effect.stacks || 1}`;
    } else if (effect.mode === "morale-watch") {
      suffix = effect.notes || "auto";
    } else if (effect.remainingRounds > 0) {
      suffix = `${effect.remainingRounds} rd`;
    }
    return {
      id: effect.id,
      label: effect.label,
      suffix,
      removable: true
    };
  });

  const barriers = Object.values(state.barriers)
    .filter((barrier) => Number(barrier.remaining ?? 0) > 0)
    .map((barrier) => ({
      id: `barrier:${barrier.id}`,
      label: barrier.label,
      suffix: `${Math.max(0, Number(barrier.remaining ?? 0))} hp`,
      removable: false
    }));

  return [...effects, ...barriers];
}

export function applyTemporaryDerivedModifiers(actor, derived) {
  const state = getActorState(actor);
  const baseDx = Math.round(Number(actor.system.attributes.dx.value) || 0);
  const basePs = Math.round(Number(actor.system.attributes.ps.value) || 0);
  const baseCh = Math.round(Number(actor.system.attributes.ch.value) || 0);

  const combatBonusFromDexterity = (score) => {
    const value = Math.round(Number(score) || 0);
    if (value > 15) return value - 15;
    if (value < 6) return value - 6;
    return 0;
  };

  const damageBonusFromStrength = (score) => {
    const value = Math.round(Number(score) || 0);
    if (value > 15) return value - 15;
    if (value < 6) return value - 6;
    return 0;
  };

  for (const effect of state.temporaryEffects) {
    const changes = { ...effect.changes };
    const attributeChanges = changes.attributes ?? {};
    if (effect.mode === "tear-gas") {
      const stacks = Math.max(1, Number(effect.stacks || 1));
      changes.acDelta = (changes.acDelta ?? 0) + stacks;
      changes.toHitBonus = (changes.toHitBonus ?? 0) - (2 * stacks);
    }

    derived.ac = Math.max(1, Math.min(10, derived.ac + Math.round(Number(changes.acDelta) || 0)));
    derived.toHitBonus += Math.round(Number(changes.toHitBonus) || 0);
    derived.damageFlat += Math.round(Number(changes.damageFlat) || 0);
    derived.damagePerDie += Math.round(Number(changes.damagePerDie) || 0);
    derived.extraAttacks += Math.round(Number(changes.extraAttacks) || 0);
    derived.closeRangeToHitBonus += Math.round(Number(changes.closeRangeToHitBonus) || 0);
    derived.movementMultiplier *= Number(changes.movementMultiplier ?? 1) || 1;
    derived.hpBonus += Math.round(Number(changes.hpBonus) || 0);
    derived.mentalResistance += Math.round(Number(changes.mentalResistance) || 0);
    derived.radiationResistance += Math.round(Number(changes.radiationResistance) || 0);
    derived.poisonResistance += Math.round(Number(changes.poisonResistance) || 0);
    derived.artifactAnalysisBonus += Math.round(Number(changes.artifactAnalysisBonus) || 0);
    derived.reactionAdjustment += Math.round(Number(changes.reactionAdjustment) || 0);
    derived.surpriseModifier += Math.round(Number(changes.surpriseModifier) || 0);
    derived.mentalAttackStrength += Math.round(Number(changes.mentalAttackStrength) || 0);

    const dxShift = Math.round(Number(attributeChanges.dx) || 0);
    const psShift = Math.round(Number(attributeChanges.ps) || 0);
    const msShift = Math.round(Number(attributeChanges.ms) || 0);
    const chShift = Math.round(Number(attributeChanges.ch) || 0);
    const cnShift = Math.round(Number(attributeChanges.cn) || 0);

    if (dxShift) {
      derived.toHitBonus += combatBonusFromDexterity(baseDx + dxShift) - combatBonusFromDexterity(baseDx);
    }
    if (psShift) {
      derived.damageFlat += damageBonusFromStrength(basePs + psShift) - damageBonusFromStrength(basePs);
    }
    if (msShift) {
      derived.mentalResistance += msShift;
      derived.mentalAttackStrength += msShift;
    }
    if (chShift) {
      derived.reactionAdjustment += charismaReactionAdjustment(baseCh + chShift) - charismaReactionAdjustment(baseCh);
    }
    if (cnShift) {
      derived.radiationResistance += cnShift;
      derived.poisonResistance += cnShift;
    }

    if (changes.cannotBeSurprised) derived.cannotBeSurprised = true;
    if (changes.laserImmune) derived.laserImmune = true;
    if (changes.mentalImmune) derived.mentalImmune = true;
  }

  derived.activeEffects = temporaryEffectSummary(actor);
}

export function syncActorProtectionStateData(actor, state = getActorState(actor)) {
  const equippedArmor = actor.items.filter((item) => item.type === "armor" && item.system.equipped);
  const activeArmorIds = new Set(equippedArmor.map((item) => item.id));

  for (const [armorId] of Object.entries(state.laserDeflect)) {
    if (!activeArmorIds.has(armorId)) delete state.laserDeflect[armorId];
  }
  for (const [armorId] of Object.entries(state.partialFields)) {
    if (!activeArmorIds.has(armorId)) delete state.partialFields[armorId];
  }

  for (const armor of equippedArmor) {
    if ((Number(armor.system.acValue ?? 10) <= 2) && !(armor.id in state.laserDeflect)) {
      state.laserDeflect[armor.id] = Number(armor.system.acValue ?? 10) <= 1 ? 2 : 1;
    }
    if ((armor.system.field?.mode === "partial") && !(armor.id in state.partialFields)) {
      state.partialFields[armor.id] = { roundKey: "", absorbed: 0 };
    }
  }

  return state;
}

export async function syncActorProtectionState(actor) {
  await updateActorState(actor, async (state) => {
    syncActorProtectionStateData(actor, state);
  }, { refresh: false });
}

function hasArmorHazardProtection(actor, type) {
  const equippedArmor = actor.items.filter((item) => item.type === "armor" && item.system.equipped);
  return equippedArmor.some((armor) => {
    if (type === "radiation") return !!armor.system.protection?.radiationImmune;
    if (type === "poison") return !!armor.system.protection?.poisonImmune;
    if (type === "black-ray") return !!armor.system.protection?.blackRayImmune;
    return false;
  });
}

export function actorHasHazardProtection(actor, type) {
  const state = getActorState(actor);
  if (actor?.gw?.hazardProtection?.[type]) return true;
  if (hasArmorHazardProtection(actor, type)) return true;
  return Object.values(state.barriers).some((barrier) => {
    if (type === "black-ray") return !!barrier.blackRayImmune;
    return !!barrier.hazardProtection?.[type];
  });
}

export function actorHasForceField(actor) {
  const state = getActorState(actor);
  const equippedArmor = actor.items.filter((item) => item.type === "armor" && item.system.equipped);
  if (Object.values(state.barriers).some((barrier) => barrier.remaining > 0)) return true;
  return equippedArmor.some((armor) => (
    (armor.system.field?.mode === "full" && !(state.barriers?.[`${armor.id}:field`]?.destroyed))
    || (armor.system.field?.mode === "partial")
  ));
}

export async function applyStunDamage(actor, amount, { sourceName = "" } = {}) {
  const stunDamage = Math.max(0, Math.floor(Number(amount) || 0));
  if (!stunDamage) return;

  await updateActorState(actor, async (state) => {
    state.nonlethal.stunDamage += stunDamage;
  }, { refresh: false });

  const state = getActorState(actor);
  const threshold = Math.max(1, Math.ceil(Number(actor.system.resources.hp.max ?? 1) / 2));
  if (Number(state.nonlethal.unconsciousRounds ?? 0) > 0) return;
  if (state.nonlethal.stunDamage >= threshold) {
    const roll = await new Roll("1d6").evaluate();
    await updateActorState(actor, async (next) => {
      next.nonlethal.unconsciousRounds = roll.total * 10;
    }, { refresh: false });
    await setActorStatus(actor, "unconscious", true);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="gw-chat-card"><h3>${sourceName || "Stunning Damage"}</h3><p>${actor.name} collapses unconscious for ${roll.total} minute(s).</p></div>`
    });
  }
}

async function applyBarrierDamage(actor, state, amount) {
  let remainingDamage = amount;
  const barriers = Object.values(state.barriers)
    .filter((barrier) => Number(barrier.remaining ?? 0) > 0)
    .sort((a, b) => Number(a.remaining ?? 0) - Number(b.remaining ?? 0));

  for (const barrier of barriers) {
    if (remainingDamage <= 0) break;
    const absorbed = Math.min(remainingDamage, Number(barrier.remaining ?? 0));
    barrier.remaining = Math.max(0, Number(barrier.remaining ?? 0) - absorbed);
    remainingDamage -= absorbed;
    if (barrier.remaining <= 0) delete state.barriers[barrier.id];
  }

  await setActorState(actor, state, { refresh: false });
  return remainingDamage;
}

async function consumeLaserDeflection(actor, state) {
  const equippedArmor = actor.items.filter((item) => item.type === "armor" && item.system.equipped)
    .sort((a, b) => Number(a.system.acValue ?? 10) - Number(b.system.acValue ?? 10));

  for (const armor of equippedArmor) {
    const remaining = Number(state.laserDeflect[armor.id] ?? 0);
    if (remaining > 0) {
      state.laserDeflect[armor.id] = remaining - 1;
      await setActorState(actor, state, { refresh: false });
      return armor;
    }
  }

  return null;
}

async function applyFullField(actor, state, amount) {
  const armor = actor.items.find((item) => (
    item.type === "armor"
    && item.system.equipped
    && item.system.field?.mode === "full"
  ));
  if (!armor) return { prevented: false, notes: "" };

  const fieldId = `${armor.id}:field`;
  if (state.barriers[fieldId]?.destroyed) return { prevented: false, notes: "" };

  const capacity = Number(armor.system.field?.capacity ?? 0);
  if (capacity <= 0) return { prevented: false, notes: "" };
  if (amount > capacity) {
    state.barriers[fieldId] = { id: fieldId, destroyed: true, remaining: 0 };
    await setActorState(actor, state, { refresh: false });
    return { prevented: true, notes: `${armor.name} force field burns out.` };
  }
  return { prevented: true, notes: `${armor.name} force field absorbs the hit.` };
}

async function applyPartialField(actor, state, amount) {
  const armor = actor.items.find((item) => (
    item.type === "armor"
    && item.system.equipped
    && item.system.field?.mode === "partial"
  ));
  if (!armor) return { amount, notes: "" };

  const capacity = Number(armor.system.field?.capacity ?? 0);
  const tracker = state.partialFields[armor.id] ?? { roundKey: "", absorbed: 0 };
  const roundKey = combatRoundKey();
  if (tracker.roundKey !== roundKey) {
    tracker.roundKey = roundKey;
    tracker.absorbed = 0;
  }

  const available = Math.max(0, capacity - tracker.absorbed);
  const absorbed = Math.min(available, Math.ceil(amount / 2));
  tracker.absorbed += absorbed;
  state.partialFields[armor.id] = tracker;
  await setActorState(actor, state, { refresh: false });

  if (!absorbed) return { amount, notes: "" };
  return {
    amount: Math.max(0, amount - absorbed),
    notes: `${armor.name} absorbs ${absorbed} point(s) of damage.`
  };
}

export async function applyIncomingDamage(actor, amount, {
  damageType = "",
  weaponTag = "",
  sourceName = ""
} = {}) {
  let pending = Math.max(0, Math.floor(Number(amount) || 0));
  if (!pending) return { applied: 0, prevented: 0, notes: [] };

  // Phase 2b: preApplyDamage — veto-capable. Macros can cancel the
  // damage application entirely (e.g. a cover rule that absorbs the hit).
  // They cannot modify `amount` via the veto — for that, register the
  // `applyIncomingDamage` path upstream or adjust it in
  // `preRollDamage`.
  if (!fireVetoHook(HOOK.preApplyDamage, {
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? "",
    amount: pending, damageType, weaponTag, sourceName
  })) {
    return { applied: 0, prevented: pending, notes: ["Damage prevented by subscriber veto."] };
  }

  let state = getActorState(actor);
  syncActorProtectionStateData(actor, state);
  const notes = [];
  const original = pending;

  // Phase 5: declarative DR/DI/DV trait pass. Resolve the incoming damage
  // into one of DAMAGE_TYPES and apply the actor's trait multiplier.
  // Immunity (×0) short-circuits entirely; resistance (×0.5) halves,
  // vulnerability (×2) doubles. Rollup of equipped-armor grants happens
  // in buildActorDerived so equipped armor contributes automatically.
  const resolvedType = resolveDamageType(damageType, weaponTag);
  const traitMult = damageTraitMultiplier(actor, resolvedType);
  if (traitMult === 0) {
    return { applied: 0, prevented: original, notes: [`Immune to ${resolvedType} damage.`] };
  }
  if (traitMult !== 1) {
    const scaled = Math.max(0, Math.floor(pending * traitMult));
    notes.push(traitMult > 1
      ? `Vulnerable to ${resolvedType}: ${pending} → ${scaled}.`
      : `Resistant to ${resolvedType}: ${pending} → ${scaled}.`);
    pending = scaled;
    if (!pending) {
      return { applied: 0, prevented: original, notes };
    }
  }

  if ((weaponTag === "black-ray") || (sourceName === "Black Ray Gun")) {
    if (actorHasHazardProtection(actor, "black-ray") || actorHasForceField(actor)) {
      await setActorState(actor, state, { refresh: false });
      return { applied: 0, prevented: original, notes: ["Protected by a force field."] };
    }
  }

  if (["laser", "fusion"].includes(weaponTag)) {
    // Laser immunity now flows through the trait pass above; this branch
    // only handles the armor-class-2 deflection counter (finite hits the
    // armor absorbs per session) which is a state-ful, not trait-based
    // mechanism.
    const armor = await consumeLaserDeflection(actor, state);
    if (armor) {
      return {
        applied: 0,
        prevented: original,
        notes: [`${armor.name} deflects the beam.`]
      };
    }
  }

  pending = await applyBarrierDamage(actor, state, pending);
  state = getActorState(actor);
  if (pending <= 0) {
    return { applied: 0, prevented: original, notes: ["Absorbed by an active force barrier."] };
  }

  const fullField = await applyFullField(actor, state, pending);
  if (fullField.prevented) {
    if (fullField.notes) notes.push(fullField.notes);
    return { applied: 0, prevented: original, notes };
  }

  const partialField = await applyPartialField(actor, state, pending);
  pending = partialField.amount;
  if (partialField.notes) notes.push(partialField.notes);

  if (pending > 0) {
    await actor.applyDamage(pending);
  }

  const result = {
    applied: pending,
    prevented: Math.max(0, original - pending),
    notes
  };

  // Phase 2b: damageApplied — announce after HP mutation completes.
  fireAnnounceHook(HOOK.damageApplied, {
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? "",
    damageType, weaponTag, sourceName,
    requested: original,
    applied: result.applied,
    prevented: result.prevented,
    notes: result.notes
  });

  return result;
}

async function tickStunCloud(actor, effect) {
  const intensity = await new Roll(effect.tickFormula || "3d6").evaluate();
  await intensity.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${effect.label} intensity`
  });

  const { requestSaveResolution } = await import("./dice.mjs");
  const save = await requestSaveResolution(actor, "poison", {
    sourceName: effect.label,
    intensity: intensity.total,
    inputLocked: true
  });
  if (save?.status !== "resolved") return;

  if (save.code === "D") {
    const rounds = Math.max(1, (20 - Number(actor.system.attributes.cn.value ?? 0)) * 10);
    await applyTemporaryEffect(actor, {
      id: `${effect.id}:stunned`,
      label: `${effect.label} Stun`,
      mode: "generic",
      remainingRounds: rounds,
      statusId: "unconscious",
      sourceName: effect.label
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="gw-chat-card"><h3>${effect.label}</h3><p>${actor.name} is stunned for ${Math.ceil(rounds / 10)} minute(s).</p></div>`
    });
  }
}

async function tickPoisonCloud(actor, effect) {
  const { requestSaveResolution } = await import("./dice.mjs");
  const intensity = await new Roll(effect.tickFormula || "3d6").evaluate();
  await intensity.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${effect.label} intensity`
  });
  await requestSaveResolution(actor, "poison", {
    sourceName: effect.label,
    intensity: intensity.total,
    inputLocked: true
  });
}

export async function tickActorStateForActor(actor) {
  const state = getActorState(actor);
  const removals = [];
  const clearedStatuses = new Set();

  for (const effect of state.temporaryEffects) {
    switch (effect.mode) {
      case "tear-gas":
        if (effect.phase === "active") {
          effect.remainingRounds = Math.max(0, Number(effect.remainingRounds ?? 0) - 1);
          effect.stacks = Math.min(effect.maxStacks || effect.stacks + 1, (effect.stacks || 1) + 1);
          if (effect.remainingRounds <= 0) {
            effect.phase = "recovery";
            effect.remainingRounds = Math.max(1, Number(effect.recoveryEvery ?? 3));
          }
        } else {
          effect.remainingRounds = Math.max(0, Number(effect.remainingRounds ?? 0) - 1);
          if (effect.remainingRounds <= 0) {
            effect.stacks = Math.max(0, Number(effect.stacks ?? 0) - 1);
            if (effect.stacks <= 0) removals.push(effect.id);
            else effect.remainingRounds = Math.max(1, Number(effect.recoveryEvery ?? 3));
          }
        }
        break;

      case "poison-cloud":
        effect.remainingRounds = Math.max(0, Number(effect.remainingRounds ?? 0) - 1);
        await tickPoisonCloud(actor, effect);
        if (effect.remainingRounds <= 0) removals.push(effect.id);
        break;

      case "stun-cloud":
        effect.remainingRounds = Math.max(0, Number(effect.remainingRounds ?? 0) - 1);
        await tickStunCloud(actor, effect);
        if (effect.remainingRounds <= 0) removals.push(effect.id);
        break;

      case "morale-watch": {
        const { continueMoraleWatch } = await import("./encounters.mjs");
        const result = await continueMoraleWatch(actor, effect);
        if (!result?.continues) removals.push(effect.id);
        break;
      }

      default:
        if (effect.remainingRounds > 0) {
          effect.remainingRounds -= 1;
          if (effect.remainingRounds <= 0) removals.push(effect.id);
        }
        break;
    }
  }

  if (state.nonlethal.unconsciousRounds > 0) {
    state.nonlethal.unconsciousRounds -= 1;
    if (state.nonlethal.unconsciousRounds <= 0) {
      state.nonlethal.stunDamage = 0;
      clearedStatuses.add("unconscious");
    }
  }

  const removedEffects = state.temporaryEffects.filter((effect) => removals.includes(effect.id));
  state.temporaryEffects = state.temporaryEffects.filter((effect) => !removals.includes(effect.id));
  await setActorState(actor, state);

  for (const effect of removedEffects) {
    if (effect.statusId && !statusStillActive(state, effect.statusId)) {
      clearedStatuses.add(effect.statusId);
    }
  }

  for (const statusId of clearedStatuses) {
    if (!statusStillActive(state, statusId)) {
      await setActorStatus(actor, statusId, false);
    }
  }
}

export async function tickCombatActorState(combat, changed) {
  if (!game.user?.isGM) return;
  if (!("round" in changed) || (changed.round == null)) return;

  const actors = new Set();
  for (const combatant of combat.combatants) {
    if (combatant.actor) actors.add(combatant.actor);
  }

  for (const actor of actors) {
    await tickActorStateForActor(actor);
  }

  try {
    if (game.settings.get(SYSTEM_ID, "autoTickFatigue")) {
      await advanceCombatFatigue(combat);
    }
  } catch (error) {
    console.warn(`${SYSTEM_ID} | fatigue auto-tick failed`, error);
  }

  // Expire persistent AOE templates (gas / smoke clouds) that have outlived
  // their `persistentRounds`. Deferred import keeps the dependency graph flat.
  try {
    const { cleanupExpiredTemplates } = await import("./aoe.mjs");
    await cleanupExpiredTemplates(combat);
  } catch (error) {
    console.warn(`${SYSTEM_ID} | AOE template cleanup failed`, error);
  }
}

/**
 * Increment `system.combat.fatigue.round` by 1 on every combatant whose actor
 * can fatigue. Skips defeated combatants and actors at 0 HP or below.
 * Only called on the GM client; invoked from the `updateCombat` hook.
 */
export async function advanceCombatFatigue(combat) {
  if (!game.user?.isGM) return;
  if (!combat?.combatants) return;

  for (const combatant of combat.combatants) {
    if (combatant.isDefeated || combatant.defeated) continue;
    const actor = combatant.actor;
    if (!actor) continue;
    if (!["character", "monster"].includes(actor.type)) continue;
    const fatigue = actor.system?.combat?.fatigue;
    if (!fatigue) continue;
    const hpValue = Number(actor.system?.resources?.hp?.value ?? 0);
    if (hpValue <= 0) continue;
    const next = Math.max(0, Number(fatigue.round ?? 0)) + 1;
    await actor.update(
      { "system.combat.fatigue.round": next },
      { gammaWorldSync: true }
    );
  }
}

/**
 * Reset `system.combat.fatigue.round` to 0 on every combatant's actor. Called
 * from the `deleteCombat` hook when the `resetFatigueOnCombatEnd` setting is
 * on, and invoked ad-hoc when the GM uses a rest/heal action.
 */
export async function resetCombatFatigue(combat) {
  if (!game.user?.isGM) return;
  if (!combat?.combatants) return;

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    if (!["character", "monster"].includes(actor.type)) continue;
    const fatigue = actor.system?.combat?.fatigue;
    if (!fatigue) continue;
    if (Number(fatigue.round ?? 0) === 0) continue;
    await actor.update(
      { "system.combat.fatigue.round": 0 },
      { gammaWorldSync: true }
    );
  }
}

/** Reset a single actor's fatigue round to 0 (used by rest / heal flows). */
export async function resetActorFatigue(actor) {
  if (!actor) return;
  if (!["character", "monster"].includes(actor.type)) return;
  const fatigue = actor.system?.combat?.fatigue;
  if (!fatigue) return;
  if (Number(fatigue.round ?? 0) === 0) return;
  if (game.user?.isGM || actor.isOwner) {
    await actor.update(
      { "system.combat.fatigue.round": 0 },
      { gammaWorldSync: true }
    );
  } else {
    await runAsGM("actor-update", {
      actorUuid: actor.uuid,
      update: { "system.combat.fatigue.round": 0 },
      options: { gammaWorldSync: true }
    });
  }
}
