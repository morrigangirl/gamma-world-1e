/**
 * 0.8.3 Cinematic Roll Request — per-type roll resolvers.
 *
 * Each banner roll dispatches through here. The resolver takes an
 * actor + the request payload, rolls the right d20 (or matrix
 * lookup) for that type, and returns a normalized result envelope
 * that the banner broadcasts via cinematic-result.
 *
 * Result shape (contract between banner + resolver):
 *   {
 *     d20: number,                 // face value of the raw d20
 *     total: number,               // d20 + modifiers (or matrix total)
 *     rollFormula: string,         // for the tooltip
 *     passed: boolean | null,      // pass/fail when a DC / target is known,
 *                                  // null for bare rolls
 *     breakdown: string,           // human-readable modifier chain
 *     roll: Roll                   // the underlying Foundry Roll object
 *                                  // (for ChatMessage attachment in recap)
 *   }
 *
 * The resolver does NOT post chat cards — the recap (Commit 6) builds
 * one aggregate card after cinematic-end. skills.mjs's rollSkill is
 * called with { suppressCard: true } to respect this.
 */

import { SKILLS, ATTRIBUTES } from "../config.mjs";
import { abilityModifierFromScore } from "../mutation-rules.mjs";
import { saveContextForActor, evaluateSaveForActor } from "../save-flow.mjs";
import { rollSkill } from "../skills.mjs";
import { getRollType } from "./roll-types.mjs";

function signed(n) { return n >= 0 ? `+${n}` : String(n); }

/**
 * Skill resolver. Reuses rollSkill() with suppressCard so the banner
 * is the only surface showing the result. DC comparison uses the
 * request's `dc` field.
 */
async function resolveSkill(actor, request) {
  if (!request.skillKey || !SKILLS[request.skillKey]) {
    throw new Error(`Cinematic skill resolver missing valid skillKey: ${request.skillKey}`);
  }
  const result = await rollSkill(actor, request.skillKey, { suppressCard: true });
  if (!result?.roll) return null;
  const d20 = Number(result.roll.terms?.[0]?.total ?? result.roll.total);
  const total = Number(result.roll.total);
  const dc = Number.isFinite(Number(request.dc)) ? Number(request.dc) : null;
  const breakdown = `${d20} ${signed(result.abilityMod)} ${result.profBonus ? `${signed(result.profBonus)} (prof)` : ""}`.trim();
  return {
    d20,
    total,
    rollFormula: result.roll.formula,
    passed: dc == null ? null : (total >= dc),
    breakdown,
    roll: result.roll
  };
}

/**
 * Attribute check resolver — straight 1d20 + ability modifier (same
 * 6-15 neutral band as every other ability-based roll). Compared
 * against request.dc for pass/fail.
 */
async function resolveAttribute(actor, request) {
  const entry = getRollType(request.rollTypeKey);
  const abilityKey = entry.abilityKey;
  const score = Number(actor?.system?.attributes?.[abilityKey]?.value ?? 10) || 10;
  const mod = abilityModifierFromScore(score);
  const roll = await new Roll("1d20 + @mod", { mod }).evaluate();
  const d20 = Number(roll.terms?.[0]?.total ?? roll.total);
  const total = Number(roll.total);
  const dc = Number.isFinite(Number(request.dc)) ? Number(request.dc) : null;
  return {
    d20,
    total,
    rollFormula: roll.formula,
    passed: dc == null ? null : (total >= dc),
    breakdown: `${d20} ${signed(mod)} (${abilityKey.toUpperCase()} ${score})`,
    roll
  };
}

/**
 * Save resolver — dispatches on saveType.
 *   poison / radiation: d20 + CN-mod save bonus vs intensity.
 *   mental: d20 vs the matrix target (roll-under).
 */
async function resolveSave(actor, request) {
  const entry = getRollType(request.rollTypeKey);
  const intensity = Math.round(Number(request.intensity) || 0);

  if (entry.saveType === "mental") {
    // Mental: roll 1d20, compare roll ≤ matrix target. Use the
    // existing evaluate path to honor matrix "NE" / "A" cells and
    // multi-attempt mutations (Dual Brain, Heightened Brain Talent).
    const context = saveContextForActor(actor, "mental");
    if (context.mentalImmune) {
      return { d20: 0, total: 0, rollFormula: "immune", passed: true, breakdown: "Immune", roll: null };
    }
    const attemptCount = Math.max(1, context.attemptCount ?? 1);
    const rolls = [];
    for (let i = 0; i < attemptCount; i++) {
      rolls.push(await new Roll("1d20").evaluate());
    }
    const primary = rolls[0];
    const evaluation = evaluateSaveForActor(actor, "mental", intensity, {
      rollTotals: rolls.map((r) => r.total)
    });
    const d20 = Number(primary.terms?.[0]?.total ?? primary.total);
    return {
      d20,
      total: d20, // mental has no "total" beyond the d20 face
      rollFormula: primary.formula,
      passed: evaluation.success === null ? null : !!evaluation.success,
      breakdown: `${rolls.map((r) => r.total).join(", ")} ≤ ${evaluation.targetNumber} (MR ${context.resistance})`,
      roll: primary
    };
  }

  // Poison / radiation: d20 + save bonus vs intensity.
  const context = saveContextForActor(actor, entry.saveType);
  const saveBonus = Number.isFinite(context?.saveBonus) ? context.saveBonus : 0;
  const roll = await new Roll("1d20 + @bonus", { bonus: saveBonus }).evaluate();
  const d20 = Number(roll.terms?.[0]?.total ?? roll.total);
  const total = Number(roll.total);
  const evaluation = evaluateSaveForActor(actor, entry.saveType, intensity, { rollTotal: total });
  return {
    d20,
    total,
    rollFormula: roll.formula,
    passed: evaluation.success === null ? null : !!evaluation.success,
    breakdown: `${d20} ${signed(saveBonus)} = ${total} vs DC ${intensity} · ${evaluation.band ?? "?"}`,
    roll,
    band: evaluation.band ?? null
  };
}

/**
 * Initiative resolver. Foundry's Combat doc will recompute initiative
 * from the system's initiative formula (GW uses 1d20 + DX mod) when
 * `combat.rollInitiative` is called for the combatant, but in the
 * banner case we're pre-posting — roll locally and let the GM apply.
 */
async function resolveInitiative(actor, _request) {
  const dxScore = Number(actor?.system?.attributes?.dx?.value ?? 10) || 10;
  const mod = abilityModifierFromScore(dxScore);
  const roll = await new Roll("1d20 + @mod", { mod }).evaluate();
  const d20 = Number(roll.terms?.[0]?.total ?? roll.total);
  const total = Number(roll.total);
  return {
    d20,
    total,
    rollFormula: roll.formula,
    passed: null,
    breakdown: `${d20} ${signed(mod)} (DX ${dxScore}) — initiative`,
    roll,
    initiativeValue: total
  };
}

const RESOLVER_MAP = Object.freeze({
  skill:      resolveSkill,
  attribute:  resolveAttribute,
  save:       resolveSave,
  initiative: resolveInitiative
});

/**
 * Dispatch a cinematic roll for one actor + one request. Errors are
 * caught upstream in the banner so a broken resolver doesn't wedge
 * the overlay open.
 */
export async function resolveCinematicRoll(actor, request) {
  const entry = getRollType(request.rollTypeKey);
  const resolver = RESOLVER_MAP[entry.resolver];
  if (!resolver) throw new Error(`No cinematic resolver for "${entry.resolver}"`);
  return resolver(actor, request);
}
