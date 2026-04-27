import { SYSTEM_ID, DAMAGE_TYPES } from "./config.mjs";
import { syncBarrierEffectsForActor, syncTemporaryEffectsForActor } from "./animations.mjs";
import { charismaReactionAdjustment } from "./tables/encounter-tables.mjs";
import { runAsGM } from "./gm-executor.mjs";
import { HOOK, fireAnnounceHook, fireVetoHook } from "./hook-surface.mjs";
import { armorIsInert } from "./artifact-power.mjs";

/**
 * 0.9.0 Tier 3 — modes that stay on the legacy flag array because
 * their mechanics (per-round procedural rolls, counter-scaled
 * modifiers, callback-driven continuation) don't fit Foundry's
 * declarative ActiveEffect model. Everything else (mode === "generic")
 * emits a real AE on the actor via createTemporaryActiveEffect.
 */
const STATEFUL_TEMP_EFFECT_MODES = new Set([
  "tear-gas",
  "poison-cloud",
  "stun-cloud",
  "morale-watch"
]);

/**
 * Foundry ACTIVE_EFFECT_MODES mapped to the numeric enum values used
 * on-wire. Repeated here to keep effect-state.mjs free of the core
 * CONFIG import; matches the AE_MODE constant in mutation-rules.mjs.
 */
const AE_MODE = Object.freeze({
  CUSTOM:    0,
  MULTIPLY:  1,
  ADD:       2,
  DOWNGRADE: 3,
  UPGRADE:   4,
  OVERRIDE:  5
});

/**
 * Scalar-keyed legacy change entries → `gw.*` target path. Producers
 * wrote `changes.toHitBonus = -4` and the derived fold-in was
 * hardcoded; now the same keys emit as AE changes targeting
 * `gw.toHitBonus` (ADD mode) so Foundry's AE pipeline + our shared
 * applyEffectChange can both read them.
 */
const SCALAR_CHANGE_KEYS = Object.freeze({
  acDelta:              "gw.acDelta",
  toHitBonus:           "gw.toHitBonus",
  damageFlat:           "gw.damageFlat",
  damagePerDie:         "gw.damagePerDie",
  extraAttacks:         "gw.extraAttacks",
  closeRangeToHitBonus: "gw.closeRangeToHitBonus",
  hpBonus:              "gw.hpBonus",
  mentalResistance:     "gw.mentalResistance",
  radiationResistance:  "gw.radiationResistance",
  poisonResistance:     "gw.poisonResistance",
  artifactAnalysisBonus:"gw.artifactAnalysisBonus",
  reactionAdjustment:   "gw.reactionAdjustment",
  surpriseModifier:     "gw.surpriseModifier",
  mentalAttackStrength: "gw.mentalAttackStrength"
});

/** Reverse lookup used by the AE → legacy-shape adapter. */
const SCALAR_CHANGE_KEYS_REVERSE = Object.freeze(
  Object.fromEntries(Object.entries(SCALAR_CHANGE_KEYS).map(([scalar, path]) => [path, scalar]))
);

/** Boolean-valued legacy change keys → `gw.*` target path. All emit OVERRIDE true. */
const BOOLEAN_CHANGE_KEYS = Object.freeze({
  cannotBeSurprised: "gw.cannotBeSurprised",
  laserImmune:       "gw.laserImmune",
  mentalImmune:      "gw.mentalImmune"
});

const BOOLEAN_CHANGE_KEYS_REVERSE = Object.freeze(
  Object.fromEntries(Object.entries(BOOLEAN_CHANGE_KEYS).map(([scalar, path]) => [path, scalar]))
);

const ATTRIBUTE_CHANGE_KEYS = Object.freeze(["dx", "ps", "ms", "ch", "cn"]);

/**
 * 0.9.0 Tier 3 — translate a legacy `changes` object (e.g., what
 * `applyTemporaryEffect` used to shove into the flag array under
 * `.changes`) into an AE-shaped `changes[]` array. Keys with value 0 /
 * absent are omitted. Attribute shifts get emitted as
 * `gw.attributeShift.<key>` ADDs so the post-apply cascade in
 * buildActorDerived can re-run the combat-bonus helpers against the
 * shifted scores without recomputing from raw legacy fields.
 *
 * Shared by `createTemporaryActiveEffect` (runtime writer path) and
 * `migrateTempEffectsToAE` (world upgrade). Exported for test use.
 */
export function changesToAEChanges(changes = {}) {
  const result = [];
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (key === "attributes") continue; // handled below
    if (SCALAR_CHANGE_KEYS[key]) {
      const delta = Math.round(Number(value) || 0);
      if (delta === 0) continue;
      result.push({
        key: SCALAR_CHANGE_KEYS[key],
        mode: AE_MODE.ADD,
        value: String(delta),
        priority: 20
      });
      continue;
    }
    if (key === "movementMultiplier") {
      const factor = Number(value ?? 1);
      if (!Number.isFinite(factor) || factor === 1) continue;
      result.push({
        key: "gw.movementMultiplier",
        mode: AE_MODE.MULTIPLY,
        value: String(factor),
        priority: 20
      });
      continue;
    }
    if (BOOLEAN_CHANGE_KEYS[key]) {
      if (!value) continue;
      result.push({
        key: BOOLEAN_CHANGE_KEYS[key],
        mode: AE_MODE.OVERRIDE,
        value: "true",
        priority: 20
      });
      continue;
    }
    console.warn(`${SYSTEM_ID} | changesToAEChanges: unknown key "${key}" (value: ${JSON.stringify(value)}) — skipped`);
  }
  const attrs = changes?.attributes ?? {};
  for (const attr of ATTRIBUTE_CHANGE_KEYS) {
    const shift = Math.round(Number(attrs?.[attr]) || 0);
    if (shift === 0) continue;
    result.push({
      key: `gw.attributeShift.${attr}`,
      mode: AE_MODE.ADD,
      value: String(shift),
      priority: 20
    });
  }
  return result;
}

/**
 * Reverse translator: given a Foundry ActiveEffect document (or
 * plain object with `changes[]`), reconstruct the legacy
 * `{ scalarKey: number, attributes: { ... }, booleanKey: true }` shape.
 * Used by save-flow.mjs to keep its itemized details logic working
 * while consuming AE-backed temp effects. Exported for test use.
 */
export function aeChangesToLegacyChanges(aeEffect) {
  const changes = aeEffect?.changes ?? [];
  const result = {};
  const attributes = {};
  for (const change of changes) {
    const key = String(change?.key ?? "");
    if (!key.startsWith("gw.")) continue;
    if (SCALAR_CHANGE_KEYS_REVERSE[key]) {
      const legacyKey = SCALAR_CHANGE_KEYS_REVERSE[key];
      result[legacyKey] = (result[legacyKey] ?? 0) + (Number(change.value) || 0);
      continue;
    }
    if (key === "gw.movementMultiplier") {
      const prior = result.movementMultiplier ?? 1;
      result.movementMultiplier = prior * (Number(change.value) || 1);
      continue;
    }
    if (BOOLEAN_CHANGE_KEYS_REVERSE[key]) {
      const legacyKey = BOOLEAN_CHANGE_KEYS_REVERSE[key];
      result[legacyKey] = String(change.value) === "true";
      continue;
    }
    if (key.startsWith("gw.attributeShift.")) {
      const attr = key.slice("gw.attributeShift.".length);
      if (ATTRIBUTE_CHANGE_KEYS.includes(attr)) {
        attributes[attr] = (attributes[attr] ?? 0) + (Number(change.value) || 0);
      }
    }
  }
  if (Object.keys(attributes).length) result.attributes = attributes;
  return result;
}

/**
 * 0.9.0 Tier 3 — emit a native Foundry ActiveEffect on the actor
 * mirroring the legacy temp-effect spec. Used by the generic-mode
 * branch of `applyTemporaryEffect`. Status icons sync via the AE's
 * `statuses` field (Foundry picks it up automatically); duration
 * countdown is handled by Foundry's combat tick.
 */
async function createTemporaryActiveEffect(actor, spec, { origin = null } = {}) {
  const rounds = Math.max(0, Number(spec.remainingRounds ?? 0));
  const aeData = {
    name: spec.label || spec.sourceName || spec.id || "Temporary Effect",
    img: spec.statusId
      ? (CONFIG.statusEffects?.find?.((entry) => entry.id === spec.statusId)?.img ?? "icons/svg/aura.svg")
      : "icons/svg/aura.svg",
    transfer: false,
    disabled: false,
    statuses: spec.statusId ? [spec.statusId] : [],
    duration: {
      // Foundry accepts null for an unbounded duration; remainingRounds=0
      // in the legacy API meant "until manually cleared" (toggle-style).
      rounds: rounds > 0 ? rounds : null,
      seconds: null,
      turns: null
    },
    changes: changesToAEChanges(spec.changes ?? {}),
    origin: origin ?? undefined,
    flags: {
      [SYSTEM_ID]: {
        temporaryEffect: true,
        effectId: spec.id,
        mode: "generic",
        sourceName: spec.sourceName ?? "",
        notes: spec.notes ?? ""
      }
    }
  };
  try {
    const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [aeData], { gammaWorldSync: true });
    return created ?? null;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | createTemporaryActiveEffect failed for "${spec.label ?? spec.id}"`, error);
    return null;
  }
}

/**
 * 0.9.0 Tier 3 — exported for save-flow.mjs. Given an AE, return a
 * legacy-shape `{ id, label, sourceName, mode, changes, remainingRounds }`
 * object so downstream readers that iterate `{ effect.changes }` keep
 * working without knowing whether the source was a legacy flag entry
 * or an AE. The save-flow resistance-details loop (e.g.,
 * "Temporary effect ... mental resistance +N") relies on this.
 */
export function aeChangesToLegacyShape(ae) {
  const flags = ae?.flags?.[SYSTEM_ID] ?? {};
  return {
    id: flags.effectId ?? ae?.id ?? "",
    label: ae?.name ?? flags.sourceName ?? "",
    sourceName: flags.sourceName ?? "",
    mode: flags.mode ?? "generic",
    changes: aeChangesToLegacyChanges(ae),
    remainingRounds: Math.max(0, Number(ae?.duration?.rounds ?? 0)),
    statusId: Array.isArray(ae?.statuses) ? (ae.statuses[0] ?? "") : (ae?.statuses?.first?.() ?? ""),
    notes: flags.notes ?? ""
  };
}

/**
 * List the AE-backed temp effects on an actor. Filters to non-disabled
 * AEs marked via `flags["gamma-world-1e"].temporaryEffect`.
 */
function getActorTemporaryAEs(actor) {
  const effects = Array.from(actor?.effects ?? []);
  return effects.filter((ae) => !ae.disabled && ae.flags?.[SYSTEM_ID]?.temporaryEffect);
}

/**
 * Lookup an AE-backed temp effect by its producer-assigned id
 * (stored under flags.gamma-world-1e.effectId). Returns null if not found.
 */
function findActorTemporaryAEById(actor, effectId) {
  if (!effectId) return null;
  return getActorTemporaryAEs(actor).find((ae) => ae.flags?.[SYSTEM_ID]?.effectId === effectId) ?? null;
}

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

  // 0.9.0 Tier 3 — generic-mode effects emit real ActiveEffects on the
  // actor (duration-tracked by Foundry, status-icon-synced via the
  // `statuses` field, visible on the Effects tab with standard
  // toggle / edit / delete controls). Stateful-mode effects
  // (tear-gas / clouds / morale-watch) still flow through the legacy
  // flag array because their per-round procedural logic + counter-
  // scaled modifiers can't be expressed declaratively.
  if (!STATEFUL_TEMP_EFFECT_MODES.has(normalized.mode)) {
    // If an AE with the same producer id already exists, update it in
    // place; otherwise create a new one.
    const existing = findActorTemporaryAEById(actor, normalized.id);
    if (existing) {
      const rounds = Math.max(0, Number(normalized.remainingRounds ?? 0));
      await existing.update({
        name: normalized.label || existing.name,
        statuses: normalized.statusId ? [normalized.statusId] : [],
        "duration.rounds": rounds > 0 ? rounds : null,
        changes: changesToAEChanges(normalized.changes ?? {}),
        [`flags.${SYSTEM_ID}.sourceName`]: normalized.sourceName ?? "",
        [`flags.${SYSTEM_ID}.notes`]: normalized.notes ?? "",
        disabled: false
      }, { gammaWorldSync: true });
    } else {
      await createTemporaryActiveEffect(actor, normalized);
    }

    fireAnnounceHook(HOOK.conditionApplied, {
      actorUuid: actor?.uuid ?? null,
      actorName: actor?.name ?? "",
      effect: normalized
    });
    return getActorState(actor);
  }

  // Legacy path — stateful modes still live in the flag array.
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
  // 0.9.0 Tier 3 — check both surfaces. Producers used to store in the
  // flag array; generic-mode producers now emit AEs. Either source
  // might hold the effect depending on when / how it was created.
  const aeEntry = findActorTemporaryAEById(actor, effectId);
  if (aeEntry) {
    const statusId = aeEntry.statuses?.first?.() ?? (Array.isArray(aeEntry.statuses) ? aeEntry.statuses[0] : "") ?? "";
    try {
      await aeEntry.delete({ gammaWorldSync: true });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | removeTemporaryEffect: AE delete failed`, error);
    }
    // If any OTHER source (legacy flag entry or a different AE) still
    // declares the same status, leave the icon alone; otherwise drop it.
    if (statusId) {
      const state = getActorState(actor);
      const stillClaimed = statusStillActive(state, statusId)
        || getActorTemporaryAEs(actor).some((ae) => ae.statuses?.has?.(statusId) || (Array.isArray(ae.statuses) && ae.statuses.includes(statusId)));
      if (!stillClaimed) await setActorStatus(actor, statusId, false);
    }
    return getActorState(actor);
  }

  const effect = getActorState(actor).temporaryEffects.find((entry) => entry.id === effectId);
  const statusId = effect?.statusId ?? "";
  const state = await updateActorState(actor, async (next) => {
    next.temporaryEffects = next.temporaryEffects.filter((entry) => entry.id !== effectId);
  });

  if (statusId && !statusStillActive(state, statusId)) {
    // Also check AE-backed effects before clearing.
    const aeClaimsStatus = getActorTemporaryAEs(actor).some((ae) =>
      ae.statuses?.has?.(statusId) || (Array.isArray(ae.statuses) && ae.statuses.includes(statusId))
    );
    if (!aeClaimsStatus) await setActorStatus(actor, statusId, false);
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
      removable: true,
      // 0.9.0 Tier 3 — `source` lets the sheet filter between legacy
      // flag entries (kept for stateful tear-gas / clouds / morale
      // watchers that aren't AE-shaped) and barriers (HP-pool force
      // fields, also not AE-shaped). AE-backed temp effects are no
      // longer included here — the Tier 5 Effects tab renders them
      // via `context.effectsList`.
      source: "legacy"
    };
  });

  const barriers = Object.values(state.barriers)
    .filter((barrier) => Number(barrier.remaining ?? 0) > 0)
    .map((barrier) => ({
      id: `barrier:${barrier.id}`,
      label: barrier.label,
      suffix: `${Math.max(0, Number(barrier.remaining ?? 0))} hp`,
      removable: false,
      source: "barrier"
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

  // 0.9.0 Tier 3 — unified fold-in that covers both legacy flag
  // entries (now only the stateful modes — tear-gas, clouds, morale-
  // watch) and AE-backed entries (everything previously mode:
  // "generic"). Each entry is normalized into the same
  // { changes: {...} } shape so the existing scalar/attribute/boolean
  // application logic handles them identically. `derived.attributeShift`
  // accumulates per-attribute deltas so the subsequent cascade in
  // buildActorDerived can re-run combat-bonus helpers against the
  // shifted scores.
  const entries = [];
  for (const effect of state.temporaryEffects) {
    entries.push({ source: "legacy", effect, changes: { ...(effect.changes ?? {}) } });
  }
  for (const ae of getActorTemporaryAEs(actor)) {
    entries.push({ source: "ae", effect: ae, changes: aeChangesToLegacyChanges(ae) });
  }

  // `derived.attributeShift` is initialized in buildActorDerived. Each
  // loop iteration below accumulates its contribution so external
  // callers (save-flow, future sheet badges) can read the final delta.
  for (const entry of entries) {
    const effect = entry.effect;
    const changes = entry.changes;
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
      derived.attributeShift.dx += dxShift;
    }
    if (psShift) {
      derived.damageFlat += damageBonusFromStrength(basePs + psShift) - damageBonusFromStrength(basePs);
      derived.attributeShift.ps += psShift;
    }
    if (msShift) {
      derived.mentalResistance += msShift;
      derived.mentalAttackStrength += msShift;
      derived.attributeShift.ms += msShift;
    }
    if (chShift) {
      derived.reactionAdjustment += charismaReactionAdjustment(baseCh + chShift) - charismaReactionAdjustment(baseCh);
      derived.attributeShift.ch += chShift;
    }
    if (cnShift) {
      derived.radiationResistance += cnShift;
      derived.poisonResistance += cnShift;
      derived.attributeShift.cn += cnShift;
    }

    if (changes.cannotBeSurprised) derived.cannotBeSurprised = true;
    if (changes.laserImmune) derived.laserImmune = true;
    if (changes.mentalImmune) derived.mentalImmune = true;
  }

  derived.activeEffects = temporaryEffectSummary(actor);
}

export function syncActorProtectionStateData(actor, state = getActorState(actor)) {
  // 0.13.0 Batch 4 — inert powered armor (cells depleted) loses both
  // its laser-deflect benefit and its partial force field. Treat it as
  // unequipped for protection-state purposes; the actorHasForceField
  // and AC paths gate on the same `!armorIsInert` filter.
  const equippedArmor = actor.items.filter((item) =>
    item.type === "armor" && item.system.equipped && !armorIsInert(item)
  );
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
  // 0.13.0 Batch 4 — inert powered armor's hazard protection booleans
  // (radiationImmune, poisonImmune, blackRayImmune) are powered defenses;
  // they collapse along with the force field when the cells run dry.
  const equippedArmor = actor.items.filter((item) =>
    item.type === "armor" && item.system.equipped && !armorIsInert(item)
  );
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
  // 0.13.0 Batch 4 — inert powered armor's force field has collapsed.
  // Filter it out so depleted Powered Plate / Scout / Battle / Attack /
  // Assault Armor don't claim a phantom field bonus.
  const equippedArmor = actor.items.filter((item) =>
    item.type === "armor" && item.system.equipped && !armorIsInert(item)
  );
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
        // 0.9.0 Tier 3 — generic-mode effects now emit as Foundry
        // ActiveEffects with `duration.rounds` set; Foundry's built-in
        // combat tick decrements the duration and auto-removes expired
        // AEs. Any legacy flag entry that still falls through here
        // (pre-migration world, edge-case) gets the countdown for
        // back-compat; post-migration the flag array only contains
        // stateful-mode entries handled above.
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

  // 0.14.15 — per-mutation combat-round ticks. Deferred import keeps the
  // dependency graph flat (mutation-ticks.mjs imports SYSTEM_ID only).
  try {
    const {
      tickHemophiliaCombat,
      tickIncreasedMetabolismCombat,
      tickPoorRespiratoryCombat
    } = await import("./mutation-ticks.mjs");
    for (const actor of actors) {
      await tickHemophiliaCombat(actor);
      await tickIncreasedMetabolismCombat(actor, combat);
      await tickPoorRespiratoryCombat(actor, combat);
    }
  } catch (error) {
    console.warn(`${SYSTEM_ID} | mutation combat tick failed`, error);
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
 * 0.14.13 — pure predicate: should this combatant's actor get its
 * fatigue.round incremented on the current round advance?
 *
 * Skips:
 *   - defeated combatants (combat-end housekeeping handles them)
 *   - non-character/monster actors (NPCs without combat fatigue schema)
 *   - actors without the `combat.fatigue` sub-schema
 *   - actors at 0 HP or below (already incapacitated; fatigue is moot)
 *
 * Pure: caller passes `{ combatant, actor }`; returns boolean.
 * Extracted so the filter can be unit-tested without a full Foundry
 * Combat / Combatant stub graph.
 *
 * @param {{combatant: object, actor: object}} input
 * @returns {boolean}
 */
export function shouldTickFatigue({ combatant, actor }) {
  if (!combatant || !actor) return false;
  if (combatant.isDefeated || combatant.defeated) return false;
  if (!["character", "monster"].includes(actor.type)) return false;
  if (!actor.system?.combat?.fatigue) return false;
  const hpValue = Number(actor.system?.resources?.hp?.value ?? 0);
  if (hpValue <= 0) return false;
  return true;
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
    const actor = combatant.actor;
    if (!shouldTickFatigue({ combatant, actor })) continue;
    const fatigue = actor.system.combat.fatigue;
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
