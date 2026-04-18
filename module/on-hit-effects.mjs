/**
 * Gamma World 1e on-hit effect resolver.
 *
 * When a weapon attack hits and the weapon's `effect.mode` is something other
 * than plain `damage`, this module fires the matching save / condition flow
 * automatically (when the `autoApplyOnHitConditions` setting is on). The
 * existing manual "Apply Effect" follow-up button on the attack card remains
 * as a fallback when the setting is off or the mode requires GM adjudication
 * (`note`).
 *
 * Behaviour by mode:
 *
 *   poison, radiation, mental → delegate to `rollDamageFromFlags()`. It
 *     already runs the save chain, routing PC dialogs and NPC auto-rolls via
 *     `preferredSaveUserId`. On fail the existing resistance tables apply the
 *     HP loss, mutation gain, etc.
 *
 *   stun, paralysis → request a poison (physique) save. On fail, call
 *     `rollDamageFromFlags()` which applies the timed temporary effect (and
 *     the matching status id) for the configured duration. Save success
 *     posts a brief "resisted" chat note and no effect is applied.
 *
 *   death → delegate to `rollDamageFromFlags()` (which already handles the
 *     force-field guard and the instant-kill flow).
 *
 *   note → no-op here; GM uses the manual follow-up button.
 *
 *   damage → no-op; damage rolls are handled separately in Phase G.
 */

import { SYSTEM_ID } from "./config.mjs";

/**
 * Default mapping per RAW effect mode.
 *
 * `statusId` mirrors what `rollDamageFromFlags()` actually applies to the
 * actor (see `module/dice.mjs`): `stun` applies the `unconscious` status (the
 * 1e "stunned" state) and `paralysis` applies the core `paralysis` status.
 * Descriptors for save-only modes (poison/radiation/mental) label the chat
 * card; no AE is applied for those — the hazard table handles damage.
 */
const DESCRIPTORS = {
  poison:    { saveType: "poison",    statusId: "poisoned",   durationFormula: "",     needsSave: false },
  radiation: { saveType: "radiation", statusId: "irradiated", durationFormula: "",     needsSave: false },
  mental:    { saveType: "mental",    statusId: "stunned",    durationFormula: "1d4",  needsSave: false },
  stun:      { saveType: "poison",    statusId: "unconscious", durationFormula: "1d6",  needsSave: true },
  paralysis: { saveType: "poison",    statusId: "paralysis",  durationFormula: "1d10", needsSave: true },
  death:     { saveType: null,        statusId: null,         durationFormula: "",     needsSave: false }
};

/** Modes that the auto-apply flow handles (hides the manual button for). */
const AUTO_APPLIED_MODES = new Set(["poison", "radiation", "mental", "stun", "paralysis", "death"]);

/**
 * Resolve an item or raw effect-flags object into an on-hit descriptor,
 * or null if the effect is a simple damage/note case we don't auto-apply.
 */
export function onHitEffectDescriptor(source) {
  if (!source) return null;

  // Accept either an item-like { system: { effect: { ... } } } or a raw
  // { effectMode, effectFormula, effectStatus } flag object.
  const mode = source.system?.effect?.mode ?? source.effectMode ?? "";
  if (!mode || mode === "damage" || mode === "note") return null;

  const base = DESCRIPTORS[mode];
  if (!base) return null;

  const formula = source.system?.effect?.formula ?? source.effectFormula ?? "";
  const status = source.system?.effect?.status ?? source.effectStatus ?? "";

  return {
    mode,
    saveType: base.saveType,
    statusId: status || base.statusId,
    durationFormula: formula || base.durationFormula,
    needsSave: base.needsSave
  };
}

/** Should the attack card hide its manual Apply Effect button for this mode? */
export function shouldHideManualFollowUp(mode) {
  if (!mode) return false;
  if (!AUTO_APPLIED_MODES.has(mode)) return false;
  try {
    return !!game.settings?.get(SYSTEM_ID, "autoApplyOnHitConditions");
  } catch (_error) {
    return false;
  }
}

/**
 * Auto-fire the on-hit effect for a weapon attack's flags payload. Intended
 * to be called from `rollAttack()` immediately after the attack card is
 * posted on a hit. Returns `true` if the effect was auto-applied (or its
 * save was attempted); `false` if this caller should do nothing more.
 */
export async function autoApplyOnHitEffect(flags, { actor, target } = {}) {
  const descriptor = onHitEffectDescriptor({
    effectMode: flags.effectMode,
    effectFormula: flags.effectFormula,
    effectStatus: flags.effectStatus
  });
  if (!descriptor) return false;
  if (!shouldHideManualFollowUp(descriptor.mode)) return false;

  const { rollDamageFromFlags, requestSaveResolution } = await import("./dice.mjs");

  // Poison / radiation / mental: existing flow already does save + resolution.
  if (!descriptor.needsSave) {
    await rollDamageFromFlags(flags);
    return true;
  }

  // Stun / paralysis: interpose a poison save before applying the AE.
  const saveTarget = target ?? null;
  if (!saveTarget) {
    // No target to save — fall back to the unconditional apply path.
    await rollDamageFromFlags(flags);
    return true;
  }

  const save = await requestSaveResolution(saveTarget, descriptor.saveType, {
    sourceName: flags.sourceName || "",
    intensity: null,
    inputLocked: false
  });

  if (save?.status === "resolved" && save.success) {
    // Save succeeded — post a brief note; no condition applied.
    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="gw-chat-card"><h3>${flags.sourceName ?? descriptor.mode}</h3>`
          + `<p>${saveTarget.name} resists the ${descriptor.mode}.</p></div>`
      });
    } catch (_error) { /* best-effort */ }
    return true;
  }

  // Save failed (or was not resolved): apply the timed effect/condition.
  await rollDamageFromFlags(flags);
  return true;
}
