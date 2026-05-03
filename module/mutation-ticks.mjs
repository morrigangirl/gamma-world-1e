/**
 * 0.14.15 — Mutation tick handlers.
 *
 * Six mutations whose mechanics fire on the existing combat-round
 * (`updateCombat`) or world-time (`updateWorldTime`) hooks:
 *
 *   Combat-round:
 *     - Hemophilia              — bleed 2 HP/round while wounded
 *     - Increased Metabolism    — every 5th round, must rest or lose -1 PS / -2 HP
 *     - Poor Respiratory System — after 6 rounds of combat, faint 1d6 minutes
 *
 *   World-time:
 *     - Regeneration            — 1 HP/day per 5kg body weight
 *     - Daylight Stasis         — paralyzed during daytime hours (plant defect)
 *
 *   Rest-flow modifier:
 *     - Photosynthetic Skin     — 4× daily heal rate while basking (see
 *                                  applyRest in healing.mjs)
 *
 * Pure helpers are exported for unit-testing without Foundry globals.
 * The async `tick*` wrappers call the helpers, perform the actor
 * update, and post the chat card.
 */

import { SYSTEM_ID } from "./config.mjs";

const SECONDS_PER_DAY = 86400;
export const HEMOPHILIA_BLEED_PER_ROUND = 2;
export const RESPIRATORY_FATIGUE_THRESHOLD = 6;
export const METABOLISM_REST_INTERVAL = 5;
export const REGEN_DEFAULT_BODY_WEIGHT_KG = 75;
export const REGEN_HP_PER_KG_PER_DAY = 1 / 5;
export const DAYTIME_START_HOUR = 6;
export const DAYTIME_END_HOUR = 18;

/* ------------------------------------------------------------------ */
/* Pure helpers — no Foundry globals                                  */
/* ------------------------------------------------------------------ */

/**
 * How much HP does a Hemophilia-afflicted actor lose this round?
 * Returns 0 if the actor isn't wounded, isn't carrying the mutation,
 * or is already at 0 HP (already incapacitated; no further bleed).
 */
export function hemophiliaBleedAmount({ hp, hasMutation }) {
  if (!hasMutation) return 0;
  if (!hp) return 0;
  const value = Number(hp.value ?? 0);
  const max = Number(hp.max ?? 0);
  if (value <= 0) return 0;
  if (value >= max) return 0;
  return HEMOPHILIA_BLEED_PER_ROUND;
}

/**
 * Should the Increased Metabolism eat-or-lose warning fire this round?
 * GW1e text: "must stop every 5th melee turn and spend 1 full turn
 * eating before it can rejoin the fight."
 */
export function increasedMetabolismDue({ round, hasMutation }) {
  if (!hasMutation) return false;
  const r = Math.max(0, Number(round) || 0);
  if (r < METABOLISM_REST_INTERVAL) return false;
  return r % METABOLISM_REST_INTERVAL === 0;
}

/**
 * Should Poor Respiratory System collapse the actor this round?
 * GW1e text: "must rest after 5 melee turns of combat. If it keeps
 * fighting beyond that point, it faints for 1-6 minutes immediately
 * after the 6th melee turn."
 */
export function poorRespiratoryDue({ round, hasMutation, alreadyUnconscious }) {
  if (!hasMutation) return false;
  if (alreadyUnconscious) return false;
  return Math.max(0, Number(round) || 0) >= RESPIRATORY_FATIGUE_THRESHOLD;
}

/**
 * GW1e: 1 HP/day per 5kg body weight. Default body weight assumed 75kg
 * (yields 15 HP/day) when the actor doesn't carry an explicit weight
 * flag. Returns the integer HP gained over `daysElapsed` whole days.
 */
export function regenerationHpPerDay({ bodyWeightKg = REGEN_DEFAULT_BODY_WEIGHT_KG } = {}) {
  const kg = Math.max(0, Number(bodyWeightKg) || 0);
  return Math.floor(kg * REGEN_HP_PER_KG_PER_DAY);
}

/**
 * GW1e: while basking in sunlight without moving, Photosynthetic Skin
 * heals at 4× normal. The basking flag is a per-actor toggle the
 * GM/player sets manually (no auto-detection). Without basking, no
 * special bonus.
 */
export function photosyntheticHealMultiplier({ hasMutation, isBasking }) {
  if (!hasMutation) return 1;
  if (!isBasking) return 1;
  return 4;
}

/**
 * Is the given world time in the configured daytime range?
 * Default 06:00–18:00 (6 AM to 6 PM exclusive). World time is seconds
 * since epoch; we modulo into a 24h cycle and convert to hours.
 */
export function isDaytime(worldTime, { startHour = DAYTIME_START_HOUR, endHour = DAYTIME_END_HOUR } = {}) {
  const t = Math.max(0, Number(worldTime) || 0);
  const secondsIntoDay = t % SECONDS_PER_DAY;
  const hour = secondsIntoDay / 3600;
  return hour >= startHour && hour < endHour;
}

/* ------------------------------------------------------------------ */
/* Async tick wrappers — wire into combat / world-time hooks          */
/* ------------------------------------------------------------------ */

function activeMutation(actor, name) {
  return Array.from(actor?.items ?? []).find(
    (item) => item?.type === "mutation"
      && item?.name === name
      && (item?.system?.activation?.enabled ?? true)
  ) ?? null;
}

async function postMutationChatCard(actor, title, body, { extraHtml = "" } = {}) {
  if (typeof globalThis.ChatMessage?.create !== "function") return;
  const speaker = ChatMessage.getSpeaker?.({ actor }) ?? {};
  await ChatMessage.create({
    speaker,
    content: `<div class="gw-chat-card gw-mutation-tick-card"><h3>${title}</h3><p>${body}</p>${extraHtml}</div>`
  });
}

/**
 * Apply Hemophilia bleed for one combat round.
 *
 * 0.14.18 — skips when the actor's `flags.gamma-world-1e.hemophiliaBound`
 * flag is set (the wound has been bound). The flag is set by clicking
 * the "Bind Wound" button on the bleed chat card, and auto-cleared by
 * GammaWorldActor._onUpdate when HP returns to max.
 */
export async function tickHemophiliaCombat(actor) {
  if (!activeMutation(actor, "Hemophilia")) return null;
  if (actor?.getFlag?.(SYSTEM_ID, "hemophiliaBound")) return null;
  const hp = actor?.system?.resources?.hp;
  const amount = hemophiliaBleedAmount({ hp, hasMutation: true });
  if (!amount) return null;
  const next = Math.max(0, Number(hp.value ?? 0) - amount);
  await actor.update({ "system.resources.hp.value": next }, { gammaWorldSync: true });
  // 0.14.18 — chat card includes a "Bind Wound" button; clicking it
  // sets the bound flag (handled by registerHemophiliaChatHandlers).
  const escUuid = String(actor.uuid ?? "").replace(/[<>&"]/g, (ch) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;"
  })[ch]);
  const button = `<button type="button" class="gw-bind-wound-btn" data-action="bindHemophiliaWound" data-actor-uuid="${escUuid}">Bind Wound</button>`;
  await postMutationChatCard(actor, "Hemophilia bleeding",
    `${actor.name} loses ${amount} HP from uncontrolled bleeding (${next}/${hp.max} HP). Bind the wound to halt further loss.`,
    { extraHtml: button });
  return { delta: -amount, hp: next };
}

/**
 * 0.14.18 — wire the "Bind Wound" button on Hemophilia bleed chat
 * cards. Setting the bound flag halts further bleed ticks until the
 * actor heals back to max HP, at which point GammaWorldActor._onUpdate
 * auto-clears the flag.
 *
 * Intended to be called from the renderChatMessage hook in hooks.mjs.
 */
export function registerHemophiliaChatHandlers(rootElement) {
  if (!rootElement || typeof rootElement.querySelectorAll !== "function") return;
  rootElement.querySelectorAll('[data-action="bindHemophiliaWound"]').forEach((btn) => {
    if (btn.dataset.gwBound) return; // idempotent — Foundry rebinds on render
    btn.dataset.gwBound = "1";
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const uuid = btn.dataset.actorUuid;
      if (!uuid) return;
      try {
        const actor = await fromUuid(uuid);
        if (!actor) return;
        if (typeof actor.setFlag !== "function") return;
        await actor.setFlag(SYSTEM_ID, "hemophiliaBound", true);
        btn.disabled = true;
        btn.textContent = "Wound bound";
      } catch (error) {
        console.warn(`${SYSTEM_ID} | bind-wound handler failed`, error);
      }
    });
  });
}

/** Post Increased Metabolism warning when round count is divisible by 5. */
export async function tickIncreasedMetabolismCombat(actor, combat) {
  if (!activeMutation(actor, "Increased Metabolism")) return null;
  const round = Number(combat?.round) || 0;
  if (!increasedMetabolismDue({ round, hasMutation: true })) return null;
  await postMutationChatCard(actor, "Increased Metabolism",
    `${actor.name} must spend the next round eating or lose -1 Physical Strength and -2 HP.`);
  return { round };
}

/**
 * Apply Poor Respiratory System collapse. Posts a chat card and
 * toggles Foundry's "unconscious" status; the duration (1d6 minutes)
 * is recorded as a flag for downstream world-time-tick recovery.
 */
export async function tickPoorRespiratoryCombat(actor, combat) {
  if (!activeMutation(actor, "Poor Respiratory System")) return null;
  const round = Number(combat?.round) || 0;
  const alreadyUnconscious = !!actor?.statuses?.has?.("unconscious");
  if (!poorRespiratoryDue({ round, hasMutation: true, alreadyUnconscious })) return null;

  const Roll = globalThis.Roll;
  let minutes = 3;
  if (Roll) {
    try {
      const roll = await new Roll("1d6").evaluate({ async: true });
      minutes = Math.max(1, Math.round(Number(roll.total) || 3));
    } catch { /* fall through to default */ }
  }

  if (typeof actor.toggleStatusEffect === "function") {
    await actor.toggleStatusEffect("unconscious", { active: true });
  }
  const expiresAt = (Number(globalThis.game?.time?.worldTime) || 0) + minutes * 60;
  if (typeof actor.setFlag === "function") {
    await actor.setFlag(SYSTEM_ID, "poorRespiratoryFaint", { expiresAt, minutes, round });
  }
  await postMutationChatCard(actor, "Poor Respiratory System",
    `${actor.name} can no longer keep up the pace and collapses unconscious for ${minutes} minute(s).`);
  return { minutes, round };
}

/**
 * Apply Regeneration daily heal. Tracks last-tick time on a per-actor
 * flag; only fires on whole-day boundaries. Body weight defaults to
 * 75kg when the actor doesn't carry a `bodyWeightKg` flag.
 */
export async function tickRegenerationWorldTime(actor, worldTime) {
  if (!activeMutation(actor, "Regeneration")) return null;
  const now = Math.max(0, Number(worldTime) || 0);
  const lastTick = Math.max(0, Number(actor.getFlag?.(SYSTEM_ID, "regenLastTick") ?? now) || now);
  if (lastTick === now) {
    // First-time observation; mark the start so subsequent ticks compute
    // a real elapsed window rather than treating epoch as the baseline.
    await actor.setFlag?.(SYSTEM_ID, "regenLastTick", now);
    return null;
  }
  const elapsed = now - lastTick;
  if (elapsed < SECONDS_PER_DAY) return null;
  const days = Math.floor(elapsed / SECONDS_PER_DAY);
  const bodyWeight = Number(actor.getFlag?.(SYSTEM_ID, "bodyWeightKg") ?? REGEN_DEFAULT_BODY_WEIGHT_KG);
  const hpPerDay = regenerationHpPerDay({ bodyWeightKg: bodyWeight });
  if (hpPerDay <= 0) {
    await actor.setFlag?.(SYSTEM_ID, "regenLastTick", lastTick + days * SECONDS_PER_DAY);
    return null;
  }
  const totalHeal = hpPerDay * days;
  const hp = actor.system?.resources?.hp;
  if (!hp) return null;
  const currentHp = Number(hp.value ?? 0);
  const maxHp = Number(hp.max ?? currentHp);
  const newHp = Math.min(maxHp, currentHp + totalHeal);
  if (newHp !== currentHp) {
    await actor.update({ "system.resources.hp.value": newHp }, { gammaWorldSync: true });
    await postMutationChatCard(actor, "Regeneration",
      `${actor.name} regenerates ${newHp - currentHp} HP over ${days} day${days === 1 ? "" : "s"} (${newHp}/${maxHp} HP).`);
  }
  await actor.setFlag?.(SYSTEM_ID, "regenLastTick", lastTick + days * SECONDS_PER_DAY);
  return { healed: newHp - currentHp, days };
}

/* ------------------------------------------------------------------ */
/* 0.14.18 — Skin Structure Change: per-round environmental damage    */
/*                                                                    */
/* Variant-driven tick. The defect's static-vulnerability variant is  */
/* handled by MUTATION_DAMAGE_TRAITS in 0.14.16; this covers the two  */
/* environmental variants:                                            */
/*   - "1 damage per turn in water"           — when actor's          */
/*       `flags.inWater` is set, lose 1 HP per combat round           */
/*   - "1d3 damage per turn in bright light"  — when actor's          */
/*       `flags.inBrightLight` is set, lose 1d3 HP per combat round   */
/*                                                                    */
/* The flags are toggled manually by the GM (or via macro) when the   */
/* environmental condition applies — there's no scene-introspection.  */
/* ------------------------------------------------------------------ */

/** Pure: which kind of environmental damage applies to the variant? */
export function skinStructureTickKind(variant) {
  if (variant === "1 damage per turn in water") return "water";
  if (variant === "1d3 damage per turn in bright light") return "light";
  return null;
}

/** Async: apply Skin Structure Change environmental damage for one round. */
export async function tickSkinStructureCombat(actor) {
  const mutation = activeMutation(actor, "Skin Structure Change");
  if (!mutation) return null;
  const variant = mutation.system?.reference?.variant ?? "";
  const kind = skinStructureTickKind(variant);
  if (!kind) return null;

  const flagName = kind === "water" ? "inWater" : "inBrightLight";
  if (!actor?.getFlag?.(SYSTEM_ID, flagName)) return null;

  const hp = actor?.system?.resources?.hp;
  if (!hp) return null;
  const value = Number(hp.value ?? 0);
  if (value <= 0) return null;

  // Roll 1d3 for the light variant; fixed 1 for water.
  let amount = 1;
  if (kind === "light") {
    const Roll = globalThis.Roll;
    if (Roll) {
      try {
        const roll = await new Roll("1d3").evaluate({ async: true });
        amount = Math.max(1, Math.round(Number(roll.total) || 2));
      } catch { amount = 2; }
    } else {
      amount = 2; // average when Roll isn't loaded (test environment)
    }
  }

  const next = Math.max(0, value - amount);
  await actor.update({ "system.resources.hp.value": next }, { gammaWorldSync: true });
  const reason = kind === "water"
    ? "skin dissolves in water"
    : "phosphorescent skin damaged by bright light";
  await postMutationChatCard(actor, "Skin Structure Change",
    `${actor.name} loses ${amount} HP from ${reason} (${next}/${hp.max} HP).`);
  return { kind, amount, hp: next };
}

/* ------------------------------------------------------------------ */
/* 0.14.16 — Anti-Reflection: 25% chance a mental mutation reverses    */
/* ------------------------------------------------------------------ */

/** Pure: return true with 25% probability. Caller passes `rng` for tests. */
export function antiReflectionTriggers({ rng = Math.random } = {}) {
  return rng() < 0.25;
}

/** Pure: should we even roll? Only for mental mutations on actors that
 *  carry Anti-Reflection. */
export function shouldCheckAntiReflection(actor, item) {
  if (!actor || !item) return false;
  if (item.type !== "mutation") return false;
  if (item.system?.subtype !== "mental") return false;
  return !!activeMutation(actor, "Anti-Reflection");
}

/** Async: roll the 25% gate; if it fires, post a chat card warning the
 *  GM to reverse the mutation's effect. The mutation still runs — this
 *  hook informs rather than blocks, because the reversal semantics
 *  (attack rebounds, defense protects opponent) are too heterogeneous
 *  to apply cleanly in code. */
export async function checkAntiReflectionOnUse(actor, item, { rng = Math.random } = {}) {
  if (!shouldCheckAntiReflection(actor, item)) return false;
  const triggers = antiReflectionTriggers({ rng });
  if (!triggers) return false;
  await postMutationChatCard(actor, "Anti-Reflection",
    `Anti-Reflection triggers (25%) on <strong>${item.name}</strong>. The mutation reverses: a mental attack rebounds onto ${actor.name}; a mental defense protects the opponent instead. (GM reverses target / effect manually.)`);
  return true;
}

/* ------------------------------------------------------------------ */
/* 0.14.16 — Epilepsy: per-round paralysis chance during combat        */
/* ------------------------------------------------------------------ */

/** Pure: probability gate for the round. 25% on round 1 (pre-fight
 *  jitters) and 10% on each subsequent round. */
export function epilepsyTriggers({ round, rng = Math.random }) {
  const r = Math.max(0, Number(round) || 0);
  if (r <= 0) return false;
  const threshold = (r === 1) ? 0.25 : 0.10;
  return rng() < threshold;
}

/** Pure: should we even roll? Only when actor has the mutation and
 *  isn't already paralyzed (don't compound the lock). */
export function shouldCheckEpilepsy({ hasMutation, alreadyParalyzed }) {
  if (!hasMutation) return false;
  if (alreadyParalyzed) return false;
  return true;
}

/** Async: roll the per-round chance, apply paralyzed if it fires. */
export async function tickEpilepsyCombat(actor, combat, { rng = Math.random } = {}) {
  if (!activeMutation(actor, "Epilepsy")) return null;
  const round = Number(combat?.round) || 0;
  const alreadyParalyzed = !!actor?.statuses?.has?.("paralyzed");
  if (!shouldCheckEpilepsy({ hasMutation: true, alreadyParalyzed })) return null;
  if (!epilepsyTriggers({ round, rng })) return null;
  if (typeof actor.toggleStatusEffect === "function") {
    await actor.toggleStatusEffect("paralyzed", { active: true });
  }
  await postMutationChatCard(actor, "Epilepsy",
    `${actor.name} suffers a sudden seizure and is paralyzed this round. (Recovers on the GM's next status update.)`);
  return { round };
}

/**
 * Toggle the paralyzed status for plants with Daylight Stasis based on
 * the world clock. Only flips status when crossing a day/night
 * boundary so player-set paralyzed (e.g., from an attack) at night
 * stays in place during the day window.
 */
export async function tickDaylightStasisWorldTime(actor, worldTime) {
  if (!activeMutation(actor, "Daylight Stasis")) return null;
  const day = isDaytime(worldTime);
  const isParalyzed = !!actor?.statuses?.has?.("paralyzed");
  if (day && !isParalyzed) {
    await actor.toggleStatusEffect?.("paralyzed", { active: true });
    await postMutationChatCard(actor, "Daylight Stasis",
      `${actor.name} falls inert under direct daylight.`);
    return { action: "set" };
  }
  if (!day && isParalyzed) {
    await actor.toggleStatusEffect?.("paralyzed", { active: false });
    await postMutationChatCard(actor, "Daylight Stasis",
      `${actor.name} stirs as darkness falls.`);
    return { action: "clear" };
  }
  return null;
}
