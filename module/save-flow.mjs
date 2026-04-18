import { getActorState } from "./effect-state.mjs";
import { mutationIsEnabled } from "./mutation-rules.mjs";
import { mentalAttackTarget } from "./tables/combat-matrix.mjs";
import {
  describePoisonOutcome,
  describeRadiationOutcome,
  resolvePoison,
  resolveRadiation
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
  return getActorState(actor).temporaryEffects ?? [];
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

function hazardResistanceDetails(actor, type) {
  const base = clampSaveScore(
    actor?.system?.attributes?.cn?.value
    ?? (type === "radiation" ? actor?.system?.resources?.radResistance : actor?.system?.resources?.poisonResistance)
    ?? (type === "radiation" ? actor?.gw?.radiationResistance : actor?.gw?.poisonResistance)
    ?? (type === "radiation" ? actor?.radiationResistance : actor?.poisonResistance)
    ?? 3
  );
  const details = [`CN ${base}`];
  let total = base;

  if (activeMutation(actor, "Heightened Constitution")) {
    if (type === "radiation") {
      total += 3;
      details.push("Heightened Constitution +3");
    } else if (total < 18) {
      total = 18;
      details.push("Heightened Constitution sets PR to 18");
    } else {
      details.push("Heightened Constitution maintains PR 18");
    }
  }

  const willForce = activeMutation(actor, "Will Force");
  if ((willForce?.system?.reference?.variant ?? "") === "cn") {
    const cnScore = Math.max(0, Math.round(Number(actor?.system?.attributes?.cn?.value ?? 0) || 0));
    if (cnScore) {
      total += cnScore;
      details.push(`Will Force (CN) ${signed(cnScore)}`);
    }
  }

  if (robotActor(actor)) {
    total = Math.max(total, 18);
    details.push("Robot chassis sets resistance to 18");
  }

  for (const effect of temporaryEffects(actor)) {
    const changes = effect?.changes ?? {};
    const additiveKey = type === "radiation" ? "radiationResistance" : "poisonResistance";
    const additive = Math.round(Number(changes[additiveKey]) || 0);
    if (additive) {
      total += additive;
      details.push(`${detailLabel(effect, "Temporary effect")} ${type} resistance ${signed(additive)}`);
    }

    const cnShift = Math.round(Number(changes.attributes?.cn) || 0);
    if (cnShift) {
      total += cnShift;
      details.push(`${detailLabel(effect, "Temporary effect")} CN ${signed(cnShift)}`);
    }
  }

  const override = derivedResistanceOverride(actor, type);
  if ((override != null) && (override !== total)) {
    total = override;
    details.push(`Effective ${type === "radiation" ? "RR" : "PR"} ${override}`);
  }

  const resistance = finalizeResistance(total, details);
  return {
    resistance,
    resistanceSummary: `${resistance} (${details.join("; ")})`,
    resistanceDetails: details,
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

function evaluatePoisonSave({ defenderContext, intensity }) {
  const resistance = clampSaveScore(defenderContext?.resistance ?? 3);
  const result = resolvePoison(resistance, intensity);
  return {
    kind: "poison",
    code: result.outcome,
    targetNumber: null,
    resistance: result.constitution,
    intensity: result.strength,
    rollTotal: null,
    rollTotals: [],
    success: result.outcome === "*",
    damageDice: result.damageDice ?? 0,
    outcome: describePoisonOutcome(result),
    resistanceSummary: defenderContext?.resistanceSummary ?? `${result.constitution}`,
    resistanceDetails: defenderContext?.resistanceDetails ?? [],
    attemptCount: 1,
    attemptSources: [],
    attemptLabel: "",
    result
  };
}

function evaluateRadiationSave({ defenderContext, intensity }) {
  const resistance = clampSaveScore(defenderContext?.resistance ?? 3);
  const result = resolveRadiation(resistance, intensity);
  return {
    kind: "radiation",
    code: result.outcome,
    targetNumber: null,
    resistance: result.constitution,
    intensity: result.intensity,
    rollTotal: null,
    rollTotals: [],
    success: Number.isInteger(result.outcome) ? (result.outcome === 0) : false,
    damageDice: result.damageDice ?? 0,
    outcome: describeRadiationOutcome(result),
    resistanceSummary: defenderContext?.resistanceSummary ?? `${result.constitution}`,
    resistanceDetails: defenderContext?.resistanceDetails ?? [],
    attemptCount: 1,
    attemptSources: [],
    attemptLabel: "",
    result
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
      intensity
    });
  }

  return evaluateRadiationSave({
    defenderContext: saveContextForActor(actor, type),
    intensity
  });
}

export function shouldRouteHpReduction({ currentHp, nextHp, isGM = false } = {}) {
  if (isGM) return false;
  const current = Math.max(0, Math.floor(Number(currentHp) || 0));
  const next = Math.max(0, Math.floor(Number(nextHp) || 0));
  return next < current;
}
