/**
 * Gamma World 1e experience and advancement.
 *
 * RAW XP awards (p. 41-42):
 *   - Combat: XP value of defeated foes (referee estimate; HP of foe is a
 *     common shorthand used by 1e referees).
 *   - Artifact ID: the listed XP value of the artifact once function is known.
 *   - Referee discretion: creative solutions, mission completion, etc.
 *
 * RAW advancement thresholds for PSH and humanoid PCs (p. 41):
 *   Level 1  →  0
 *   Level 2  →  3,000
 *   Level 3  →  6,000
 *   Level 4  →  12,000
 *   Level 5  →  24,000
 *   Level 6  →  48,000
 *   Level 7  →  96,000
 *   Level 8  →  200,000
 *   Level 9  →  400,000
 *   Level 10 →  1,000,000
 *
 * On level-up, each PC rolls d10 against the Attribute Bonus Matrix and
 * gains +1 to that attribute. The resulting key is pushed to
 * `system.advancement.availableBonuses`; applying it moves it to
 * `appliedBonuses` and bumps the attribute.
 *
 * Mutated animals earn XP and apply attribute bonuses but do not advance in
 * level per RAW — they level-cap at 1 and accumulate `availableBonuses` only.
 */

import { ATTRIBUTE_KEYS, SYSTEM_ID } from "./config.mjs";

export const LEVEL_THRESHOLDS = [
  0, 3000, 6000, 12000, 24000, 48000, 96000, 200000, 400000, 1000000
];

/** d10 Attribute Bonus Matrix. Keyed by d10 roll 1..10 → attribute key. */
export const ATTRIBUTE_BONUS_MATRIX = {
  1:  "ms",
  2:  "in",
  3:  "dx",
  4:  "ch",
  5:  "cn",
  6:  "ps",
  7:  "ms",
  8:  "cn",
  9:  "dx",
  10: "ps"
};

export function levelForXp(xp) {
  const n = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (n >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

export function xpForNextLevel(level) {
  const lvl = Math.floor(Number(level) || 1);
  if (lvl < 1 || lvl > LEVEL_THRESHOLDS.length) return null;
  return LEVEL_THRESHOLDS[lvl - 1] ?? null;
}

/**
 * 0.14.6 — XP value awarded by defeating a monster of N hit dice.
 * Lookup table follows the GW1e DMG XP-by-HD progression. Used as a
 * fallback when a monster's `system.details.xpValue` is 0; explicit
 * overrides win.
 *
 * RAW table (rounded — RAW gives ranges; we pick the median):
 *   1 HD  →   25 XP        7 HD  →   800 XP
 *   2 HD  →   50 XP        8 HD  →  1200 XP
 *   3 HD  →  100 XP        9 HD  →  1600 XP
 *   4 HD  →  200 XP       10 HD  →  2400 XP
 *   5 HD  →  400 XP       12 HD  →  3500 XP
 *   6 HD  →  600 XP       15+ HD →  5000 XP (and ~+750/HD beyond)
 */
const XP_BY_HD = Object.freeze({
   1:   25,  2:   50,  3:  100,  4:  200,  5:  400,
   6:  600,  7:  800,  8: 1200,  9: 1600, 10: 2400,
  11: 3000, 12: 3500, 13: 4000, 14: 4500, 15: 5000
});

export function xpForHitDice(hitDice) {
  const hd = Math.max(0, Math.floor(Number(hitDice) || 0));
  if (hd <= 0) return 0;
  if (hd >= 15) return 5000 + (hd - 15) * 750;
  return XP_BY_HD[hd] ?? 0;
}

/** Resolve XP an actor's defeat awards: explicit field wins, else HD table. */
export function xpAwardForDefeated(actor) {
  const explicit = Number(actor?.system?.details?.xpValue ?? 0);
  if (explicit > 0) return Math.floor(explicit);
  return xpForHitDice(actor?.system?.details?.hitDice ?? 0);
}

/** Does this character type level up? PSH + humanoids do; mutated-animal/plant and robots do not. */
export function levelsByType(type) {
  return type === "psh" || type === "humanoid";
}

/**
 * Award XP to an actor. Returns the post-award level (may differ from prior).
 */
export async function awardXp(actor, amount, { source = "referee" } = {}) {
  if (!actor || !(Number.isFinite(amount) && amount > 0)) return null;
  const priorXp = Number(actor.system.details?.xp ?? 0);
  const priorLevel = Number(actor.system.details?.level ?? 1);
  const newXp = priorXp + Math.round(amount);
  const canLevel = levelsByType(actor.system.details?.type);
  const newLevel = canLevel ? levelForXp(newXp) : priorLevel;

  const bonuses = Array.from(actor.system.advancement?.availableBonuses ?? []);
  const levelsGained = Math.max(0, newLevel - priorLevel);
  for (let i = 0; i < levelsGained; i += 1) {
    const die = Math.floor(Math.random() * 10) + 1;
    bonuses.push(ATTRIBUTE_BONUS_MATRIX[die] ?? "cn");
  }

  const updates = {
    "system.details.xp": newXp,
    "system.details.level": newLevel,
    "system.advancement.availableBonuses": bonuses
  };
  await actor.update(updates);

  await postAwardChat(actor, { amount, source, priorLevel, newLevel, bonuses, levelsGained });
  return newLevel;
}

/** Apply a pending attribute bonus (moves from available → applied, bumps the attribute). */
export async function applyAttributeBonus(actor, attributeKey) {
  if (!actor) return;
  const key = ATTRIBUTE_KEYS.includes(attributeKey) ? attributeKey : null;
  if (!key) throw new Error(`Unknown attribute key: ${attributeKey}`);
  const available = Array.from(actor.system.advancement?.availableBonuses ?? []);
  const idx = available.indexOf(key);
  if (idx < 0) {
    ui.notifications?.warn(`${actor.name} has no pending bonus for ${key.toUpperCase()}.`);
    return;
  }
  available.splice(idx, 1);
  const applied = Array.from(actor.system.advancement?.appliedBonuses ?? []);
  applied.push(key);
  const currentValue = Number(actor.system.attributes?.[key]?.value ?? 10);
  await actor.update({
    [`system.attributes.${key}.value`]: Math.min(21, currentValue + 1),
    "system.advancement.availableBonuses": available,
    "system.advancement.appliedBonuses": applied
  });
}

async function postAwardChat(actor, { amount, source, priorLevel, newLevel, bonuses, levelsGained }) {
  try {
    const ChatMessageClass = globalThis.ChatMessage ?? foundry?.documents?.ChatMessage;
    if (!ChatMessageClass) return;
    const lines = [
      `<strong>${actor.name}</strong> earned <strong>${amount}</strong> XP (${source}).`
    ];
    if (levelsGained > 0) {
      lines.push(`Advanced from level ${priorLevel} to <strong>${newLevel}</strong>.`);
      const newBonuses = bonuses.slice(-levelsGained);
      lines.push(`Pending attribute bonuses: ${newBonuses.map((k) => k.toUpperCase()).join(", ")}.`);
    }
    await ChatMessageClass.create({
      speaker: ChatMessageClass.getSpeaker?.({ actor }),
      content: `<div class="gw-chat-card gw-xp-card">${lines.join("<br>")}</div>`
    });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | XP chat notice failed`, error);
  }
}
