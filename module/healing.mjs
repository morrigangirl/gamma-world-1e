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
