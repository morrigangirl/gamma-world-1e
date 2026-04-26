/**
 * Gamma World 1e healing & rest.
 *
 * Natural healing: 1 HP per day of rest (rulebook, p. 28).
 * Medical devices:
 *   - Pain Reducer:           +1d4 HP, 1/day
 *   - Stim Dose:              +2d6 HP, combat usable, max 3 doses before poisoning
 *   - Mind Booster:           no HP, +2 mental strength for 1 hour
 *   - Intera Shot:            +1d6 HP (antibiotic, one use per wound)
 *   - Sustenance Dose:        restores 1d4 HP and suppresses hunger for 24 hours
 *   - Accelera Dose:          doubles actions for 1 melee turn, then exhaust
 *   - Cur-In Dose:            cures diseases; restores 1d4 HP
 *   - Anti-Radiation Serum:   removes one radiation effect, +1d4 HP
 *   - Suggestion Change:      mental; non-HP
 *   - Rejuv Chamber:          full heal over 24 hours
 *   - Stasis Chamber:         suspended animation; preservation
 *   - Life Ray:               revive from death; full heal
 *   - Medi-Kit:               +1d6 HP per application, 1d6+4 charges
 */

import { SYSTEM_ID } from "./config.mjs";
import { resetActorFatigue } from "./effect-state.mjs";
import { HOOK, fireVetoHook, fireAnnounceHook } from "./hook-surface.mjs";

/* ------------------------------------------------------------------ */
/* 0.14.1 — homebrew Short / Long Rest                                */
/* ------------------------------------------------------------------ */

/** Hours each rest type advances world time when the GM setting permits. */
export const SHORT_REST_HOURS = 1;
export const LONG_REST_HOURS  = 6;

/** Spend cap on Short Rest: floor(level / 3). */
export const SHORT_REST_HD_FRACTION = 1 / 3;

/** Conditions that prevent the Long Rest's "restore all HP" benefit.
 *  Status IDs match `module/conditions.mjs` / `config.mjs`. */
const LONG_REST_HEAL_BLOCKERS = Object.freeze([
  { id: "poisoned",            reason: "poisoned" },
  { id: "poison",              reason: "poisoned" },
  { id: "radiation-sickness",  reason: "radiationSickness" }
]);

/** Maximum HD a character can spend on a Short Rest. */
export function shortRestMaxHD(actor) {
  const level = Math.max(1, Math.floor(Number(actor?.system?.details?.level ?? 1)));
  return Math.max(0, Math.floor(level * SHORT_REST_HD_FRACTION));
}

/** Available HD on the actor (drains on Short Rest, refills on Long Rest). */
export function availableHitDice(actor) {
  return Math.max(0, Math.floor(Number(actor?.system?.resources?.hitDice?.value ?? 0)));
}

/** Returns `{ blocked: true, reason: <statusId> }` if any blocker condition
 *  is active, else `{ blocked: false }`. Used by Long Rest to skip the heal
 *  while still letting time advance + HD refill. */
export function longRestHealingStatus(actor) {
  const statuses = actor?.statuses;
  if (statuses?.has) {
    for (const blocker of LONG_REST_HEAL_BLOCKERS) {
      if (statuses.has(blocker.id)) return { blocked: true, reason: blocker.reason };
    }
  }
  return { blocked: false, reason: null };
}

/**
 * Short Rest: roll up to `hitDiceSpent` HD (each 1d6), heal that much
 * (capped at max HP). Drains HD by the requested count, advances world
 * time +1h (when setting allows), fires veto + announce hooks.
 *
 * Returns a result object even when the rest is vetoed (`{ vetoed: true }`)
 * so callers can branch.
 */
export async function performShortRest(actor, { hitDiceSpent = 0, advanceTime = null } = {}) {
  if (!actor) return { vetoed: true, reason: "no-actor" };

  const available = availableHitDice(actor);
  const cap = Math.min(available, shortRestMaxHD(actor));
  const requested = Math.max(0, Math.min(Math.floor(Number(hitDiceSpent) || 0), cap));

  // Veto-capable pre-hook. Subscribers can return false to cancel.
  const proceed = fireVetoHook(HOOK.preShortRest, {
    type: "short",
    actor,
    hitDiceRequested: requested,
    hitDiceAvailable: available,
    hitDiceCap: cap
  });
  if (!proceed) return { vetoed: true, reason: "pre-hook-veto" };

  // Roll healing.
  let roll = null;
  let healed = 0;
  if (requested > 0) {
    try {
      roll = await new Roll(`${requested}d6`).evaluate();
      healed = Math.max(0, Math.round(Number(roll.total) || 0));
    } catch (error) {
      console.warn(`${SYSTEM_ID} | short rest HD roll failed`, error);
    }
  }

  const hpMax = Number(actor.system?.resources?.hp?.max ?? 0);
  const hpCur = Number(actor.system?.resources?.hp?.value ?? 0);
  const newHp = Math.min(hpMax, hpCur + healed);
  const actualHealing = Math.max(0, newHp - hpCur);

  const update = {
    "system.resources.hitDice.value": Math.max(0, available - requested)
  };
  if (actualHealing > 0) update["system.resources.hp.value"] = newHp;

  await actor.update(update, { gammaWorldSync: true });

  // Time advance (cells drain over the hour, etc.). Setting controls.
  if (shouldAdvanceTime(advanceTime)) {
    await advanceWorldTime(SHORT_REST_HOURS);
  }

  await postRestChat(actor, {
    type: "short",
    hours: SHORT_REST_HOURS,
    hitDiceSpent: requested,
    healed: actualHealing,
    rollFormula: roll?.formula ?? null,
    rollTotal: roll?.total ?? null
  });

  fireAnnounceHook(HOOK.shortRest, {
    type: "short",
    actor,
    hitDiceSpent: requested,
    hitDiceRemaining: Math.max(0, available - requested),
    healed: actualHealing,
    rollFormula: roll?.formula ?? null,
    rollTotal: roll?.total ?? null
  });

  return {
    vetoed: false,
    type: "short",
    hitDiceSpent: requested,
    hitDiceRemaining: Math.max(0, available - requested),
    healed: actualHealing,
    roll
  };
}

/**
 * Long Rest: restore all HP (unless poisoned or radiation-sick), refill
 * Hit Dice to max, advance world time +6h (setting permitting). Fatigue
 * is cleared either way — that's just rest, not healing.
 *
 * Blocked-healing scenarios still drain time and refresh HD, so the
 * party can long-rest "trying to sleep it off" while sick.
 */
export async function performLongRest(actor, { advanceTime = null } = {}) {
  if (!actor) return { vetoed: true, reason: "no-actor" };

  const blocker = longRestHealingStatus(actor);

  const proceed = fireVetoHook(HOOK.preLongRest, {
    type: "long",
    actor,
    healBlocked: blocker.blocked,
    blockReason: blocker.reason
  });
  if (!proceed) return { vetoed: true, reason: "pre-hook-veto" };

  const hpMax = Number(actor.system?.resources?.hp?.max ?? 0);
  const hpCur = Number(actor.system?.resources?.hp?.value ?? 0);
  const level = Math.max(1, Math.floor(Number(actor?.system?.details?.level ?? 1)));

  const healed = blocker.blocked ? 0 : Math.max(0, hpMax - hpCur);

  const update = {
    "system.resources.hitDice.value": level
  };
  if (healed > 0) update["system.resources.hp.value"] = hpMax;

  await actor.update(update, { gammaWorldSync: true });

  // Rest clears fatigue regardless of whether HP was restored.
  await resetActorFatigue(actor);

  if (shouldAdvanceTime(advanceTime)) {
    await advanceWorldTime(LONG_REST_HOURS);
  }

  await postRestChat(actor, {
    type: "long",
    hours: LONG_REST_HOURS,
    healed,
    healBlocked: blocker.blocked,
    blockReason: blocker.reason,
    hitDiceRefilled: level
  });

  fireAnnounceHook(HOOK.longRest, {
    type: "long",
    actor,
    healed,
    healBlocked: blocker.blocked,
    blockReason: blocker.reason,
    hitDiceRefilled: level
  });

  return {
    vetoed: false,
    type: "long",
    healed,
    healBlocked: blocker.blocked,
    blockReason: blocker.reason,
    hitDiceRefilled: level
  };
}

/** Setting check; the override arg lets callers force a specific value. */
function shouldAdvanceTime(override) {
  if (override === true || override === false) return override;
  try {
    return !!game.settings?.get(SYSTEM_ID, "restAdvancesWorldTime");
  } catch {
    return true;   // pre-init / tests: default behavior
  }
}

/** GM-only world-time advance. Non-GMs no-op (server-side update needed). */
async function advanceWorldTime(hours) {
  try {
    if (!game.user?.isGM) return;
    await game.time?.advance?.(hours * 3600);
  } catch (error) {
    console.warn(`${SYSTEM_ID} | rest world-time advance failed`, error);
  }
}

async function postRestChat(actor, payload) {
  try {
    const ChatMessageClass = globalThis.ChatMessage ?? foundry?.documents?.ChatMessage;
    if (!ChatMessageClass) return;
    const isShort = payload.type === "short";
    const title = isShort ? "Short Rest" : "Long Rest";
    const body = isShort
      ? buildShortRestBody(payload)
      : buildLongRestBody(payload);
    await ChatMessageClass.create({
      speaker: ChatMessageClass.getSpeaker?.({ actor }),
      content: `<div class="gw-chat-card gw-rest-card"><h3>${actor.name} — ${title}</h3>${body}</div>`
    });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | rest chat notice failed`, error);
  }
}

function buildShortRestBody(p) {
  const lines = [`<p>Rested ${p.hours} hour(s).</p>`];
  if (p.hitDiceSpent > 0) {
    lines.push(`<p>Spent <strong>${p.hitDiceSpent}</strong> Hit Die${p.hitDiceSpent === 1 ? "" : "ce"}` +
      (p.rollFormula ? ` (<code>${p.rollFormula}</code> = ${p.rollTotal})` : "") +
      ` → <strong>+${p.healed} HP</strong>.</p>`);
  } else {
    lines.push(`<p>No Hit Dice spent.</p>`);
  }
  return lines.join("");
}

function buildLongRestBody(p) {
  const lines = [`<p>Rested ${p.hours} hour(s); Hit Dice refreshed (max ${p.hitDiceRefilled}).</p>`];
  if (p.healBlocked) {
    const label = p.blockReason === "poisoned" ? "poisoned" : "suffering radiation sickness";
    lines.push(`<p><em>HP not restored — character is ${label}.</em></p>`);
  } else if (p.healed > 0) {
    lines.push(`<p><strong>+${p.healed} HP</strong> — fully healed.</p>`);
  } else {
    lines.push(`<p>Already at full HP.</p>`);
  }
  return lines.join("");
}

export const MEDICAL_DEVICES = {
  "pain-reducer":       { heal: "1d4",  period: "day",      message: "Pain is dulled and minor wounds close." },
  "stim-dose":          { heal: "2d6",  period: "dose",     message: "Adrenaline surges; wounds knit before your eyes." },
  "mind-booster":       { heal: null,   period: "dose",     message: "Mental strength sharpens for one hour." },
  "intera-shot":        { heal: "1d6",  period: "wound",    message: "Antibiotics flood the wound site." },
  "sustenance-dose":    { heal: "1d4",  period: "day",      message: "Hunger is suppressed and lost vigor returns." },
  "accelera-dose":      { heal: null,   period: "dose",     message: "Time slows; metabolism burns hot for a melee turn." },
  "cur-in-dose":        { heal: "1d4",  period: "dose",     message: "Diseases are purged and vigor returns." },
  "anti-radiation-serum": { heal: "1d4", period: "dose",    message: "Radiation poisoning flushes out of the body." },
  "rejuv-chamber":      { heal: "full", period: "24h",      message: "Rejuvenation complete; stand out of the chamber renewed." },
  "stasis-chamber":     { heal: null,   period: "indef",    message: "Subject is preserved in stasis." },
  "life-ray":           { heal: "full", period: "revive",   message: "Consciousness flickers back — the Life Ray has done its work." },
  "medi-kit":           { heal: "1d6",  period: "charge",   message: "Medi-kit patches wounds and injects coagulants." }
};

/** Roll or clamp a heal formula. Returns an integer amount. */
async function resolveHealAmount(actor, formula) {
  if (!formula) return 0;
  if (formula === "full") {
    const max = Number(actor.system.resources?.hp?.max ?? 0);
    const cur = Number(actor.system.resources?.hp?.value ?? 0);
    return Math.max(0, max - cur);
  }
  try {
    const roll = await new Roll(formula).evaluate();
    return Math.max(0, Math.round(roll.total));
  } catch (error) {
    console.warn(`${SYSTEM_ID} | heal formula roll failed`, formula, error);
    return 0;
  }
}

/** Apply natural rest. hours = 24 for a full day. */
export async function applyRest(actor, { hours = 24 } = {}) {
  if (!actor) return 0;
  const daily = Number(actor.system.resources?.hp?.restDaily ?? 1);
  const days = Math.max(0, hours / 24);
  const heal = Math.floor(daily * days);
  // Rest always clears fatigue per RAW, regardless of whether any HP is gained.
  await resetActorFatigue(actor);
  if (heal <= 0) return 0;
  await actor.heal?.(heal) ?? applyHealFallback(actor, heal);
  await postHealingChat(actor, {
    label: `Rested ${Math.round(hours)} hour(s)`,
    amount: heal,
    message: `Natural rest: regained ${heal} HP.`
  });
  return heal;
}

/** Apply a medical device by key. Falls back gracefully if the device is unknown. */
export async function applyMedicalDevice(actor, deviceKey, { sourceItem = null } = {}) {
  if (!actor || !deviceKey) return 0;
  const device = MEDICAL_DEVICES[deviceKey];
  if (!device) {
    ui.notifications?.warn(`Unknown medical device: ${deviceKey}`);
    return 0;
  }
  const amount = await resolveHealAmount(actor, device.heal);
  if (amount > 0) {
    if (typeof actor.heal === "function") await actor.heal(amount);
    else applyHealFallback(actor, amount);
  }
  await postHealingChat(actor, {
    label: sourceItem?.name ?? deviceKey,
    amount,
    message: device.message
  });
  return amount;
}

function applyHealFallback(actor, heal) {
  const max = Number(actor.system.resources?.hp?.max ?? 0);
  const cur = Number(actor.system.resources?.hp?.value ?? 0);
  const next = Math.min(max, cur + heal);
  return actor.update({ "system.resources.hp.value": next });
}

async function postHealingChat(actor, { label, amount, message }) {
  try {
    const ChatMessageClass = globalThis.ChatMessage ?? foundry?.documents?.ChatMessage;
    if (!ChatMessageClass) return;
    const gain = amount > 0 ? `<strong>+${amount} HP</strong>` : "";
    await ChatMessageClass.create({
      speaker: ChatMessageClass.getSpeaker?.({ actor }),
      content: `<div class="gw-chat-card gw-heal-card"><h3>${actor.name} — ${label}</h3><p>${message}</p>${gain ? `<p>${gain}</p>` : ""}</div>`
    });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | heal chat notice failed`, error);
  }
}
