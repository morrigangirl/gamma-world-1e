import { getActorState, aeChangesToLegacyShape } from "./effect-state.mjs";
import { SYSTEM_ID } from "./config.mjs";
import { abilityModifierFromScore, mutationIsEnabled } from "./mutation-rules.mjs";
import { mentalAttackTarget } from "./tables/combat-matrix.mjs";
import {
  damageDiceFromIntensity,
  radiationBandFromMargin
} from "./tables/resistance-tables.mjs";

const OWNER_LEVEL = 3;
const SAVE_ATTEMPT_MUTATIONS = [
  { name: "Heightened Brain Talent", multiplier: 2 },
  { name: "Dual Brain", multiplier: 2 }
];

export function clampSaveScore(value) {
  return Math.max(3, Math.min(18, Math.round(Number(value) || 3)));
}

function signed(value) {
  const numeric = Math.round(Number(value) || 0);
  return numeric >= 0 ? `+${numeric}` : String(numeric);
}

function mutationItems(actor) {
  return Array.from(actor?.items ?? [])
    .filter((item) => item?.type === "mutation" && mutationIsEnabled(item));
}

function activeMutation(actor, name) {
  return mutationItems(actor).find((item) => item.name === name) ?? null;
}

function temporaryEffects(actor) {
  if (!actor || (typeof actor.getFlag !== "function")) {
    return Array.isArray(actor?.temporaryEffects) ? actor.temporaryEffects : [];
  }
  const legacy = getActorState(actor).temporaryEffects ?? [];
  // 0.9.0 Tier 3 — include AE-backed temp effects in the itemized
  // details. `aeChangesToLegacyShape` reverse-translates each AE into
  // the same `{ label, sourceName, changes: {...} }` shape that the
  // downstream loops (lines ~168, ~294) already read.
  const aes = Array.from(actor?.effects ?? [])
    .filter((ae) => !ae.disabled && ae.flags?.[SYSTEM_ID]?.temporaryEffect)
    .map((ae) => aeChangesToLegacyShape(ae));
  return [...legacy, ...aes];
}

function detailLabel(effect, fallback) {
  return effect?.label || effect?.sourceName || fallback;
}

function finalizeResistance(value, details) {
  const finalValue = clampSaveScore(value);
  if (finalValue !== value) details.push(`Rule cap ${finalValue}`);
  return finalValue;
}

function robotActor(actor) {
  return !!(actor?.system?.robotics?.isRobot || actor?.system?.details?.type === "robot");
}

function derivedResistanceOverride(actor, type) {
  if (type === "mental") {
    const value = actor?.gw?.mentalResistance ?? actor?.system?.resources?.mentalResistance;
    return Number.isFinite(Number(value)) ? Math.round(Number(value) || 0) : null;
  }

  if (type === "radiation") {
    const value = actor?.gw?.radiationResistance ?? actor?.system?.resources?.radResistance;
    return Number.isFinite(Number(value)) ? Math.round(Number(value) || 0) : null;
  }

  const value = actor?.gw?.poisonResistance ?? actor?.system?.resources?.poisonResistance;
  return Number.isFinite(Number(value)) ? Math.round(Number(value) || 0) : null;
}

function saveAttempts(actor) {
  if (!actor) return { attemptCount: 1, attemptLabel: "", attemptSources: [] };

  let attemptCount = 1;
  const attemptSources = [];
  for (const mutation of SAVE_ATTEMPT_MUTATIONS) {
    if (activeMutation(actor, mutation.name)) {
      attemptCount *= mutation.multiplier;
      attemptSources.push(mutation.name);
    }
  }

  return {
    attemptCount,
    attemptSources,
    attemptLabel: attemptCount > 1
      ? `${attemptCount} attempts (${attemptSources.join(", ")})`
      : ""
  };
}

function actorOwnershipLevel(actor, userId) {
  const ownership = actor?.ownership ?? actor?.permission ?? {};
  if (ownership && (typeof ownership === "object")) {
    return Number(ownership[userId] ?? ownership.default ?? 0);
  }
  return 0;
}

function actorOwnedByUser(actor, user) {
  if (!actor || !user) return false;
  if (typeof actor.testUserPermission === "function") {
    return !!actor.testUserPermission(user, OWNER_LEVEL);
  }
  return actorOwnershipLevel(actor, user.id) >= OWNER_LEVEL;
}

export function preferredOwnedPlayerId(actor, users = []) {
  return users
    .filter((user) => user?.active && !user?.isGM && actorOwnedByUser(actor, user))
    .map((user) => user.id)
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export function preferredSaveUserId(actor, users = []) {
  const playerId = preferredOwnedPlayerId(actor, users);
  if (playerId) return playerId;
  return users
    .filter((user) => user?.active && user?.isGM)
    .map((user) => user.id)
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export function effectiveMentalResistance(actor) {
  return saveContextForActor(actor, "mental").resistance;
}

export function effectiveRadiationResistance(actor) {
  return saveContextForActor(actor, "radiation").resistance;
}

export function effectivePoisonResistance(actor) {
  return saveContextForActor(actor, "poison").resistance;
}

function mentalResistanceDetails(actor) {
  const base = clampSaveScore(
    actor?.system?.attributes?.ms?.value
    ?? actor?.system?.resources?.mentalResistance
    ?? actor?.gw?.mentalResistance
    ?? actor?.mentalResistance
    ?? 3
  );
  const details = [`MS ${base}`];
  let total = base;
  let mentalImmune = !!actor?.gw?.mentalImmune;

  if (activeMutation(actor, "Heightened Intelligence")) {
    total += 4;
    details.push("Heightened Intelligence +4");
  }
  if (activeMutation(actor, "Mental Defense Shield")) {
    total += 4;
    details.push("Mental Defense Shield +4");
  }
  if (activeMutation(actor, "Mental Defenselessness")) {
    total = 3;
    details.push("Mental Defenselessness sets MR to 3");
  }

  const willForce = activeMutation(actor, "Will Force");
  if ((willForce?.system?.reference?.variant ?? "") === "ms") {
    const doubled = clampSaveScore((Number(actor?.system?.attributes?.ms?.value ?? 0) || 0) * 2);
    if (doubled > total) {
      total = doubled;
      details.push(`Will Force raises MR to ${doubled}`);
    }
  }

  for (const effect of temporaryEffects(actor)) {
    const changes = effect?.changes ?? {};
    const additive = Math.round(Number(changes.mentalResistance) || 0);
    if (additive) {
      total += additive;
      details.push(`${detailLabel(effect, "Temporary effect")} mental resistance ${signed(additive)}`);
    }

    const msShift = Math.round(Number(changes.attributes?.ms) || 0);
    if (msShift) {
      total += msShift;
      details.push(`${detailLabel(effect, "Temporary effect")} MS ${signed(msShift)}`);
    }

    if (changes.mentalImmune) {
      mentalImmune = true;
      details.push(`${detailLabel(effect, "Temporary effect")} grants mental immunity`);
    }
  }

  const override = derivedResistanceOverride(actor, "mental");
  if ((override != null) && (override !== total)) {
    total = override;
    details.push(`Effective MR ${override}`);
  }

  const resistance = finalizeResistance(total, details);
  const attempts = saveAttempts(actor);
  return {
    resistance,
    resistanceSummary: `${resistance} (${details.join("; ")})`,
    resistanceDetails: details,
    mentalImmune,
    ...attempts
  };
}

/**
 * 0.8.2 homebrew: hazard saves (poison + radiation) are now d20 + CN mod +
 * mutation/effect bonuses vs the hazard's intensity. This helper returns
 * the bonus side of the sum plus the mutation-flag surface that drives
 * the band outcome (severity caps, auto-success tokens, immunity, etc.).
 *
 * Mutation alternate effects under the new rules:
 *   - Heightened Constitution      → +3 save; radiation severity caps at
 *                                    "severe" (never catastrophic).
 *   - Bacterial Symbiosis (plant)  → +3 save on both poison and radiation.
 *   - No Resistance to Poison      → poison saves lose the CN modifier.
 *   - Will Force (CN variant)      → +CN score bonus (legacy behavior
 *                                    preserved; fires once, any save type).
 *   - Poison-/Radiation-immune     → auto-success (chassis traits honored
 *                                    via actorHasHazardProtection upstream;
 *                                    flag echoed here for tests).
 */
export function collectHazardSaveFlags(actor, type) {
  const flags = {
    targetBonus: 0,
    bonusDetails: [],
    disableConModifier: false,
    capSeverityAt: null,
    autoSuccess: false,
    immune: false
  };

  if (type === "radiation" && activeMutation(actor, "Heightened Constitution")) {
    flags.targetBonus += 3;
    flags.bonusDetails.push("Heightened Constitution +3");
    flags.capSeverityAt = "severe";
  }
  if (type === "poison" && activeMutation(actor, "Heightened Constitution")) {
    flags.targetBonus += 3;
    flags.bonusDetails.push("Heightened Constitution +3");
  }

  if (activeMutation(actor, "Bacterial Symbiosis")) {
    flags.targetBonus += 3;
    flags.bonusDetails.push("Bacterial Symbiosis +3");
  }

  if (type === "poison" && activeMutation(actor, "No Resistance To Poison")) {
    flags.disableConModifier = true;
    flags.bonusDetails.push("No Resistance to Poison (CN bonus disabled)");
  }

  const willForce = activeMutation(actor, "Will Force");
  if ((willForce?.system?.reference?.variant ?? "") === "cn") {
    const cnScore = Math.max(0, Math.round(Number(actor?.system?.attributes?.cn?.value ?? 0) || 0));
    if (cnScore) {
      flags.targetBonus += cnScore;
      flags.bonusDetails.push(`Will Force (CN) ${signed(cnScore)}`);
    }
  }

  if (type === "radiation" && actor?.gw?.radiationImmune) flags.immune = true;
  if (type === "poison" && actor?.gw?.poisonImmune) flags.immune = true;
  if (robotActor(actor)) flags.immune = true;

  return flags;
}

/**
 * Build the save-bonus side of a hazard save (signed integer that gets
 * added to the d20 before comparing against intensity). Replaces the
 * old clamped-resistance matrix lookup axis. Returns the full breakdown
 * so the chat card can surface each contributor.
 */
function hazardSaveBonus(actor, type) {
  const cnScore = Math.max(3, Math.round(Number(actor?.system?.attributes?.cn?.value ?? 10) || 10));
  const conMod = abilityModifierFromScore(cnScore);
  const details = [];
  const saveFlags = collectHazardSaveFlags(actor, type);
  let bonus = 0;

  if (!saveFlags.disableConModifier) {
    bonus += conMod;
    details.push(`CN ${cnScore} ${signed(conMod)}`);
  } else {
    details.push(`CN modifier disabled`);
  }

  bonus += saveFlags.targetBonus;
  for (const line of saveFlags.bonusDetails) details.push(line);

  // Temporary effects keep contributing via the same keys the 0.7.0 trait
  // framework uses, so an armor grant of "+2 radiation resistance" still
  // reads as a save bonus under the new rules.
  for (const effect of temporaryEffects(actor)) {
    const changes = effect?.changes ?? {};
    const additiveKey = type === "radiation" ? "radiationResistance" : "poisonResistance";
    const additive = Math.round(Number(changes[additiveKey]) || 0);
    if (additive) {
      bonus += additive;
      details.push(`${detailLabel(effect, "Temporary effect")} ${type} save ${signed(additive)}`);
    }
    const cnShift = Math.round(Number(changes.attributes?.cn) || 0);
    if (cnShift && !saveFlags.disableConModifier) {
      // CN shift affects the ability modifier — recompute the delta by
      // sampling the band function at the new CN value.
      const shiftedMod = abilityModifierFromScore(cnScore + cnShift);
      const delta = shiftedMod - conMod;
      if (delta) {
        bonus += delta;
        details.push(`${detailLabel(effect, "Temporary effect")} CN ${signed(cnShift)} (mod ${signed(delta)})`);
      }
    }
  }

  return { bonus, conMod, cnScore, details, flags: saveFlags };
}

function hazardResistanceDetails(actor, type) {
  const { bonus, conMod, cnScore, details, flags } = hazardSaveBonus(actor, type);
  const summary = `${signed(bonus)} (${details.join("; ")})`;
  return {
    // Historical fields retained for consumers (chat card, UI, tests) that
    // still read "resistance" from the context. Under the new rules this
    // value IS the save bonus (no longer a clamped 3-18 score).
    resistance: bonus,
    resistanceSummary: summary,
    resistanceDetails: details,
    // New fields — surface the pieces the banner / chat card break out.
    saveBonus: bonus,
    conMod,
    cnScore,
    saveFlags: flags,
    attemptCount: 1,
    attemptSources: [],
    attemptLabel: ""
  };
}

export function saveContextForActor(actor, type) {
  if (type === "mental") return mentalResistanceDetails(actor);
  return hazardResistanceDetails(actor, type);
}

function evaluateMentalSave({
  attackerMentalStrength,
  defenderContext,
  mentalImmune = false,
  rollTotals = []
}) {
  const intensity = clampSaveScore(attackerMentalStrength);
  const resistance = clampSaveScore(defenderContext?.resistance ?? 3);
  if (mentalImmune) {
    return {
      kind: "mental",
      code: "NE",
      targetNumber: "NE",
      resistance,
      intensity,
      rollTotal: null,
      rollTotals: [],
      success: true,
      damageDice: 0,
      outcome: "Protected by total mental immunity.",
      resistanceSummary: defenderContext?.resistanceSummary ?? `${resistance}`,
      resistanceDetails: defenderContext?.resistanceDetails ?? [],
      attemptCount: defenderContext?.attemptCount ?? 1,
      attemptSources: defenderContext?.attemptSources ?? [],
      attemptLabel: defenderContext?.attemptLabel ?? "",
      result: {
        kind: "mental",
        attackerMentalStrength: intensity,
        targetNumber: "NE"
      }
    };
  }

  const targetNumber = mentalAttackTarget(intensity, resistance);
  if (targetNumber === "NE") {
    return {
      kind: "mental",
      code: "NE",
      targetNumber,
      resistance,
      intensity,
      rollTotal: null,
      rollTotals: [],
      success: true,
      damageDice: 0,
      outcome: "No effect.",
      resistanceSummary: defenderContext?.resistanceSummary ?? `${resistance}`,
      resistanceDetails: defenderContext?.resistanceDetails ?? [],
      attemptCount: defenderContext?.attemptCount ?? 1,
      attemptSources: defenderContext?.attemptSources ?? [],
      attemptLabel: defenderContext?.attemptLabel ?? "",
      result: {
        kind: "mental",
        attackerMentalStrength: intensity,
        targetNumber
      }
    };
  }

  if (targetNumber === "A") {
    return {
      kind: "mental",
      code: "A",
      targetNumber,
      resistance,
      intensity,
      rollTotal: null,
      rollTotals: [],
      success: false,
      damageDice: 0,
      outcome: "Automatic success.",
      resistanceSummary: defenderContext?.resistanceSummary ?? `${resistance}`,
      resistanceDetails: defenderContext?.resistanceDetails ?? [],
      attemptCount: defenderContext?.attemptCount ?? 1,
      attemptSources: defenderContext?.attemptSources ?? [],
      attemptLabel: defenderContext?.attemptLabel ?? "",
      result: {
        kind: "mental",
        attackerMentalStrength: intensity,
        targetNumber
      }
    };
  }

  const totals = Array.isArray(rollTotals)
    ? rollTotals
      .map((value) => Math.round(Number(value) || 0))
      .filter((value) => value > 0)
    : [];
  const success = !totals.length ? null : totals.some((total) => total < targetNumber);
  return {
    kind: "mental",
    code: targetNumber,
    targetNumber,
    resistance,
    intensity,
    rollTotal: totals[0] ?? null,
    rollTotals: totals,
    success,
    damageDice: 0,
    outcome: success == null
      ? `Mental attack succeeds on ${targetNumber}+ on 1d20.`
      : success
        ? "Mental attack resisted."
        : "Mental attack succeeds.",
    resistanceSummary: defenderContext?.resistanceSummary ?? `${resistance}`,
    resistanceDetails: defenderContext?.resistanceDetails ?? [],
    attemptCount: defenderContext?.attemptCount ?? 1,
    attemptSources: defenderContext?.attemptSources ?? [],
    attemptLabel: defenderContext?.attemptLabel ?? "",
    result: {
      kind: "mental",
      attackerMentalStrength: intensity,
      targetNumber
    }
  };
}

/**
 * 0.8.2 homebrew poison save.
 *   roll + saveBonus ≥ intensity  →  success (half damage)
 *   roll + saveBonus <  intensity  →  failure (full damage)
 * Mutation-granted immunity (e.g. robot chassis) short-circuits to success
 * with zero damage. There is no "save or die" outcome under the new rules.
 */
function evaluatePoisonSave({ defenderContext, intensity, rollTotal }) {
  const saveBonus = Number.isFinite(defenderContext?.saveBonus)
    ? Number(defenderContext.saveBonus)
    : 0;
  const flags = defenderContext?.saveFlags ?? {};
  const difficulty = Math.max(3, Math.round(Number(intensity) || 0));
  const damageDice = damageDiceFromIntensity(difficulty);

  if (flags.immune) {
    return {
      kind: "poison",
      code: "IMMUNE",
      band: "immune",
      targetNumber: difficulty,
      resistance: saveBonus,
      saveBonus,
      intensity: difficulty,
      rollTotal: null,
      rollTotals: [],
      total: null,
      marginOfFailure: null,
      success: true,
      damageDice: 0,
      damageMultiplier: 0,
      outcome: "Immune to poison.",
      resistanceSummary: defenderContext?.resistanceSummary ?? signed(saveBonus),
      resistanceDetails: defenderContext?.resistanceDetails ?? [],
      attemptCount: 1,
      attemptSources: [],
      attemptLabel: "",
      result: { kind: "poison", outcome: "IMMUNE" }
    };
  }

  const numericRoll = rollTotal == null ? null : Math.round(Number(rollTotal) || 0);
  if (numericRoll == null) {
    // Evaluator called without a roll — return an "awaiting roll" envelope
    // so the caller can roll, then re-evaluate with the rollTotal. Keeps
    // the two-phase pattern mental saves already use.
    return {
      kind: "poison",
      code: null,
      band: null,
      targetNumber: difficulty,
      resistance: saveBonus,
      saveBonus,
      intensity: difficulty,
      rollTotal: null,
      rollTotals: [],
      total: null,
      marginOfFailure: null,
      success: null,
      damageDice,
      damageMultiplier: null,
      outcome: `Roll 1d20 ${signed(saveBonus)} vs difficulty ${difficulty}.`,
      resistanceSummary: defenderContext?.resistanceSummary ?? signed(saveBonus),
      resistanceDetails: defenderContext?.resistanceDetails ?? [],
      attemptCount: 1,
      attemptSources: [],
      attemptLabel: "",
      result: { kind: "poison", pending: true }
    };
  }

  const total = numericRoll + saveBonus;
  const margin = difficulty - total;
  const success = total >= difficulty;
  const band = success ? "half" : "full";

  return {
    kind: "poison",
    code: success ? "HALF" : "FULL",
    band,
    targetNumber: difficulty,
    resistance: saveBonus,
    saveBonus,
    intensity: difficulty,
    rollTotal: numericRoll,
    rollTotals: [numericRoll],
    total,
    marginOfFailure: success ? 0 : margin,
    success,
    damageDice,
    damageMultiplier: success ? 0.5 : 1,
    outcome: success
      ? `Poison save resisted — take half damage (${damageDice}d6 halved).`
      : `Poison save failed — take full damage (${damageDice}d6).`,
    resistanceSummary: defenderContext?.resistanceSummary ?? signed(saveBonus),
    resistanceDetails: defenderContext?.resistanceDetails ?? [],
    attemptCount: 1,
    attemptSources: [],
    attemptLabel: "",
    result: { kind: "poison", success, total, damageDice, band }
  };
}

/**
 * 0.8.2 homebrew radiation save.
 *   intensity < 10       →  no effect (band "below-threshold", no save)
 *   roll + bonus ≥ int   →  no effect (band "safe", recheck in 1 hour)
 *   fail by 1-3          →  "mild"          Radiation Sickness (1-3 days fatigue)
 *   fail by 4-6          →  "severe"        Radiation Sickness (3-6 days fatigue) + mutation
 *   fail by 7+           →  "catastrophic"  onset tomorrow, -10% max HP / hour until cured
 */
function evaluateRadiationSave({ defenderContext, intensity, rollTotal }) {
  const saveBonus = Number.isFinite(defenderContext?.saveBonus)
    ? Number(defenderContext.saveBonus)
    : 0;
  const flags = defenderContext?.saveFlags ?? {};
  const difficulty = Math.max(3, Math.round(Number(intensity) || 0));
  const damageDice = damageDiceFromIntensity(difficulty);

  if (difficulty < 10) {
    return {
      kind: "radiation",
      code: "BELOW-THRESHOLD",
      band: "below-threshold",
      targetNumber: difficulty,
      resistance: saveBonus,
      saveBonus,
      intensity: difficulty,
      rollTotal: null,
      rollTotals: [],
      total: null,
      marginOfFailure: null,
      success: true,
      damageDice: 0,
      damageMultiplier: 0,
      outcome: "Intensity below 10 — no save required, no mechanical effect.",
      resistanceSummary: defenderContext?.resistanceSummary ?? signed(saveBonus),
      resistanceDetails: defenderContext?.resistanceDetails ?? [],
      attemptCount: 1,
      attemptSources: [],
      attemptLabel: "",
      result: { kind: "radiation", band: "below-threshold" }
    };
  }

  if (flags.immune) {
    return {
      kind: "radiation",
      code: "IMMUNE",
      band: "immune",
      targetNumber: difficulty,
      resistance: saveBonus,
      saveBonus,
      intensity: difficulty,
      rollTotal: null,
      rollTotals: [],
      total: null,
      marginOfFailure: null,
      success: true,
      damageDice: 0,
      damageMultiplier: 0,
      outcome: "Immune to radiation.",
      resistanceSummary: defenderContext?.resistanceSummary ?? signed(saveBonus),
      resistanceDetails: defenderContext?.resistanceDetails ?? [],
      attemptCount: 1,
      attemptSources: [],
      attemptLabel: "",
      result: { kind: "radiation", band: "immune" }
    };
  }

  const numericRoll = rollTotal == null ? null : Math.round(Number(rollTotal) || 0);
  if (numericRoll == null) {
    return {
      kind: "radiation",
      code: null,
      band: null,
      targetNumber: difficulty,
      resistance: saveBonus,
      saveBonus,
      intensity: difficulty,
      rollTotal: null,
      rollTotals: [],
      total: null,
      marginOfFailure: null,
      success: null,
      damageDice,
      damageMultiplier: null,
      outcome: `Roll 1d20 ${signed(saveBonus)} vs intensity ${difficulty}.`,
      resistanceSummary: defenderContext?.resistanceSummary ?? signed(saveBonus),
      resistanceDetails: defenderContext?.resistanceDetails ?? [],
      attemptCount: 1,
      attemptSources: [],
      attemptLabel: "",
      result: { kind: "radiation", pending: true }
    };
  }

  const total = numericRoll + saveBonus;
  const margin = difficulty - total;
  let band = radiationBandFromMargin(margin);

  // Mutation flag: Heightened Constitution caps radiation severity at
  // "severe" (catastrophic gets stepped down so the character still
  // suffers, but no delayed lethal spiral).
  if ((band === "catastrophic") && (flags.capSeverityAt === "severe")) {
    band = "severe";
  }

  const success = band === "safe";
  const outcomes = {
    safe:           `Radiation save passed — no immediate effect. Recheck in 1 hour if still exposed.`,
    mild:           `Radiation save failed by ${margin} — Radiation Sickness (mild). Fully fatigued for 1–3 days.`,
    severe:         `Radiation save failed by ${margin} — Radiation Sickness (severe). Fully fatigued for 3–6 days and a new mutation manifests.`,
    catastrophic:   `Radiation save failed by ${margin} — catastrophic exposure. Tomorrow onward: −10% max HP per hour until ancient treatment is applied.`
  };

  return {
    kind: "radiation",
    code: band.toUpperCase(),
    band,
    targetNumber: difficulty,
    resistance: saveBonus,
    saveBonus,
    intensity: difficulty,
    rollTotal: numericRoll,
    rollTotals: [numericRoll],
    total,
    marginOfFailure: success ? 0 : margin,
    success,
    damageDice: 0,
    damageMultiplier: 0,
    outcome: outcomes[band],
    resistanceSummary: defenderContext?.resistanceSummary ?? signed(saveBonus),
    resistanceDetails: defenderContext?.resistanceDetails ?? [],
    attemptCount: 1,
    attemptSources: [],
    attemptLabel: "",
    result: { kind: "radiation", band, margin, success, total }
  };
}

export function evaluateSaveForActor(actor, type, intensity, {
  rollTotal = null,
  rollTotals = null
} = {}) {
  const totals = Array.isArray(rollTotals)
    ? rollTotals
    : rollTotal == null
      ? []
      : [rollTotal];

  if (type === "mental") {
    const context = saveContextForActor(actor, type);
    return evaluateMentalSave({
      attackerMentalStrength: intensity,
      defenderContext: context,
      mentalImmune: !!context.mentalImmune,
      rollTotals: totals
    });
  }

  if (type === "poison") {
    return evaluatePoisonSave({
      defenderContext: saveContextForActor(actor, type),
      intensity,
      rollTotal: totals[0] ?? null
    });
  }

  return evaluateRadiationSave({
    defenderContext: saveContextForActor(actor, type),
    intensity,
    rollTotal: totals[0] ?? null
  });
}

export function shouldRouteHpReduction({ currentHp, nextHp, isGM = false } = {}) {
  if (isGM) return false;
  const current = Math.max(0, Math.floor(Number(currentHp) || 0));
  const next = Math.max(0, Math.floor(Number(nextHp) || 0));
  return next < current;
}
