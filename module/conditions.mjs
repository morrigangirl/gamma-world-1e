/**
 * 0.8.2 homebrew radiation conditions.
 *
 * Two flag-persisted states live here, both set by the save-card button
 * handlers in module/dice.mjs:
 *
 *   flags[SYSTEM_ID].radiationSickness     — fixed-duration fatigue bout
 *     { severity: "mild" | "severe", durationDays, appliedAt, expiresAt }
 *
 *   flags[SYSTEM_ID].catastrophicRadiation — delayed-lethal HP drain
 *     { active: true, appliedAt, onsetAt, lastTickAt }
 *
 * This module is the read/automate surface for both:
 *   - `getRadiationCondition(actor)` returns the unified state + sheet
 *     display info the character sheet renders.
 *   - `registerConditionTicker()` attaches to Foundry's updateWorldTime
 *     hook and auto-expires sickness + drip-drains catastrophic HP.
 *   - `effectiveFatigueRound(actor)` overrides the combat-round counter
 *     upward when a sickness bout makes the character fully fatigued,
 *     without touching the stored round value.
 *   - `clearCatastrophicRadiation(actor)` is the "ancient treatment"
 *     exit for the delayed-lethal spiral (macro-callable).
 */

import { SYSTEM_ID } from "./config.mjs";

/** Turn counter that saturates every fatigue-matrix penalty to its worst
 * column. Using 20 (> the highest row in WEAPON_FATIGUE_MATRIX) means any
 * weapon family hits its most-penalized value and every armor class has
 * started bleeding its penalty. The stored `system.combat.fatigue.round`
 * is NOT mutated — this is a derived override for the duration of the
 * sickness. */
const SICKNESS_MAX_ROUND = 20;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;
const CATASTROPHIC_HP_LOSS_PER_TICK = 0.1; // 10% of max HP per hour

/**
 * Read both homebrew conditions off an actor and normalize them into a
 * single display-ready envelope. Never throws — returns an object with
 * `sickness: null` / `catastrophic: null` when either state is absent.
 */
export function getRadiationCondition(actor) {
  const sicknessRaw = actor?.flags?.[SYSTEM_ID]?.radiationSickness ?? null;
  const catastrophicRaw = actor?.flags?.[SYSTEM_ID]?.catastrophicRadiation ?? null;

  const sickness = sicknessRaw
    ? {
      severity: sicknessRaw.severity === "severe" ? "severe" : "mild",
      durationDays: Number(sicknessRaw.durationDays) || 0,
      appliedAt: Number(sicknessRaw.appliedAt) || 0,
      expiresAt: Number(sicknessRaw.expiresAt) || 0
    }
    : null;

  const catastrophic = catastrophicRaw?.active
    ? {
      appliedAt: Number(catastrophicRaw.appliedAt) || 0,
      onsetAt: Number(catastrophicRaw.onsetAt) || 0,
      lastTickAt: Number(catastrophicRaw.lastTickAt) || 0
    }
    : null;

  return { sickness, catastrophic };
}

/**
 * Effective fatigue round for combat-matrix lookups. If the actor is
 * suffering Radiation Sickness (mild or severe), they are "fully
 * fatigued" — every weapon + armor fatigue penalty applies at maximum.
 * Otherwise the stored combat round is returned untouched.
 *
 * Called by dice.mjs's attack pipeline; does NOT modify persisted data.
 */
export function effectiveFatigueRound(actor) {
  const stored = Math.max(0, Math.round(Number(actor?.system?.combat?.fatigue?.round ?? 0) || 0));
  const { sickness } = getRadiationCondition(actor);
  if (sickness) return Math.max(stored, SICKNESS_MAX_ROUND);
  return stored;
}

/**
 * Extend the character sheet's fatigueState envelope with radiation-sick
 * overrides. The sheet renders a single klaxon indicator; sickness and
 * catastrophic conditions commandeer its color / title so the GM sees
 * the worst status at a glance.
 *
 * Returns a NEW object; the caller decides whether to use it or the
 * vanilla fatigue state.
 */
export function overlayRadiationIndicatorState(baseState, actor) {
  const { sickness, catastrophic } = getRadiationCondition(actor);
  if (!sickness && !catastrophic) return baseState;

  const round = baseState?.round ?? 0;
  let level = baseState?.level ?? "green";
  let label = baseState?.label ?? "Fresh";
  let title = baseState?.title ?? "";
  let badge = null;

  if (sickness) {
    level = "red";
    const severityLabel = sickness.severity === "severe" ? "Severe" : "Mild";
    label = `Radiation Sickness (${severityLabel.toLowerCase()})`;
    const daysRemaining = sickness.expiresAt
      ? Math.max(0, Math.ceil((sickness.expiresAt - Number(game.time?.worldTime ?? 0)) / SECONDS_PER_DAY))
      : sickness.durationDays;
    title = `Radiation Sickness (${severityLabel}) — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining. Fully fatigued.`;
    badge = sickness.severity === "severe" ? "sickness-severe" : "sickness-mild";
  }

  if (catastrophic) {
    level = "red";
    const now = Number(game.time?.worldTime ?? 0);
    const hoursUntilOnset = Math.max(0, Math.ceil((catastrophic.onsetAt - now) / SECONDS_PER_HOUR));
    label = hoursUntilOnset > 0
      ? `Catastrophic exposure — onset in ~${hoursUntilOnset}h`
      : `Catastrophic exposure — ACTIVE, losing 10% HP / hour`;
    title = hoursUntilOnset > 0
      ? `Catastrophic radiation exposure. Onset in ${hoursUntilOnset}h; then −10% max HP per hour until ancient treatment or death.`
      : `CATASTROPHIC RADIATION — actively dying. −10% max HP every hour. Requires ancient radiation treatment.`;
    badge = "catastrophic";
  }

  return { round, level, label, title, badge };
}

/**
 * Clear catastrophic radiation exposure (the "ancient treatment" cure).
 * Used by macros / a GM action on rejuv-chamber style items.
 */
export async function clearCatastrophicRadiation(actor) {
  if (!actor) return;
  await actor.unsetFlag(SYSTEM_ID, "catastrophicRadiation");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card"><h3>Radiation Treatment</h3>`
      + `<p>${actor.name} has received ancient radiation treatment. Catastrophic exposure cleared.</p></div>`
  });
}

/**
 * Clear an active Radiation Sickness bout (e.g. Medical Robotoid
 * intervention, GM fiat). Companion to the catastrophic clearer.
 */
export async function clearRadiationSickness(actor) {
  if (!actor) return;
  await actor.unsetFlag(SYSTEM_ID, "radiationSickness");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card"><h3>Radiation Sickness Cleared</h3>`
      + `<p>${actor.name} has recovered from radiation sickness.</p></div>`
  });
}

/**
 * Attach the world-time hook that auto-processes both conditions. Runs
 * only when the local user is the GM who advanced the clock, so the
 * updates don't fire N times across a N-client table.
 */
export function registerConditionTicker() {
  Hooks.on("updateWorldTime", async (worldTime, _dt, _options, userId) => {
    if (!game.user?.isGM) return;
    if (userId && userId !== game.user.id) return;
    try {
      await tickAllActors(Number(worldTime) || 0);
    } catch (error) {
      console.warn(`${SYSTEM_ID} | radiation condition ticker failed`, error);
    }
  });
}

async function tickAllActors(worldTime) {
  for (const actor of game.actors?.contents ?? []) {
    if (!["character", "monster"].includes(actor.type)) continue;
    await tickRadiationSickness(actor, worldTime);
    await tickCatastrophicRadiation(actor, worldTime);
  }
}

async function tickRadiationSickness(actor, worldTime) {
  const state = actor.getFlag(SYSTEM_ID, "radiationSickness");
  if (!state) return;
  const expiresAt = Number(state.expiresAt) || 0;
  if (!expiresAt || worldTime < expiresAt) return;

  await actor.unsetFlag(SYSTEM_ID, "radiationSickness");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card"><h3>Radiation Sickness Recovered</h3>`
      + `<p>${actor.name} has recovered from their radiation sickness.</p></div>`
  });
}

async function tickCatastrophicRadiation(actor, worldTime) {
  const state = actor.getFlag(SYSTEM_ID, "catastrophicRadiation");
  if (!state?.active) return;
  const onsetAt = Number(state.onsetAt) || 0;
  if (!onsetAt || worldTime < onsetAt) return;

  const lastTick = Number(state.lastTickAt) || onsetAt;
  if (worldTime <= lastTick) return;

  const secondsSinceLastTick = worldTime - lastTick;
  const hoursElapsed = Math.floor(secondsSinceLastTick / SECONDS_PER_HOUR);
  if (hoursElapsed < 1) return;

  const maxHp = Math.max(1, Math.round(Number(actor.system?.resources?.hp?.max ?? 0) || 0));
  const damagePerHour = Math.max(1, Math.ceil(maxHp * CATASTROPHIC_HP_LOSS_PER_TICK));
  const totalDamage = damagePerHour * hoursElapsed;

  const currentHp = Math.max(0, Math.round(Number(actor.system?.resources?.hp?.value ?? 0) || 0));
  const nextHp = Math.max(0, currentHp - totalDamage);

  await actor.update({ "system.resources.hp.value": nextHp }, { gammaWorldSync: true });
  await actor.setFlag(SYSTEM_ID, "catastrophicRadiation", {
    ...state,
    lastTickAt: lastTick + (hoursElapsed * SECONDS_PER_HOUR)
  });

  const dead = nextHp === 0;
  const contentParts = [
    `<div class="gw-chat-card gw-hazard-card">`,
    `<h3>Catastrophic Radiation Deterioration</h3>`,
    `<p>${actor.name} loses <strong>${totalDamage} HP</strong> `,
    `(${hoursElapsed} hour${hoursElapsed === 1 ? "" : "s"} × ${damagePerHour} per hour). `,
    `Current HP: ${nextHp} / ${maxHp}.</p>`
  ];
  if (dead) {
    contentParts.push(`<p><strong>${actor.name} succumbs to catastrophic radiation exposure.</strong></p>`);
  } else {
    contentParts.push(`<p>Ancient radiation treatment will halt the deterioration.</p>`);
  }
  contentParts.push(`</div>`);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: contentParts.join("")
  });

  if (dead) {
    await actor.unsetFlag(SYSTEM_ID, "catastrophicRadiation");
  }
}
