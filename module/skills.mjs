/**
 * 0.8.0 — Lightweight skill + proficiency layer.
 *
 * Each actor carries a `system.skills.<key>` map with `{ ability, proficient, bonus }`
 * entries for every canonical skill (25 total, declared in config.mjs).
 * Rolling a skill:
 *
 *   1d20 + ability modifier                          (baseline)
 *   1d20 + ability modifier + 2                      (proficient)
 *   1d20 + ability modifier + 2 + bonus              (proficient + AE-granted bonus)
 *
 * 0.8.6 — `bonus` integer per skill lets ActiveEffects add flat
 * modifiers. Scientific Genius applies +2 to seven technical / scientific
 * skills via AE changes targeting `system.skills.<key>.bonus`; the field
 * defaults to 0 so existing rolls are unchanged when no AE is present.
 *
 * The ability modifier curve is the same 6–15 neutral band used elsewhere
 * in the system (see `abilityModifierFromScore` in mutation-rules.mjs) so
 * a PS 18 character gets the same +3 on Climbing/Traversal as they do on
 * PS-based to-hit and damage.
 *
 * This module does NOT hook the combat pipeline. Skill rolls post a
 * standalone chat card via the same `renderTemplate + ChatMessage.create`
 * idiom used for attack / save / damage cards, and that's it — no save
 * routing, no damage application, no public hook firing. The rule of
 * thumb is that a skill check is a narrative resolution tool, so the
 * roll's visible total is its only output.
 */

import { SYSTEM_ID, SKILLS, ATTRIBUTES } from "./config.mjs";
import { abilityModifierFromScore } from "./mutation-rules.mjs";
import { HOOK, fireAnnounceHook, fireVetoHook } from "./hook-surface.mjs";

/**
 * Pure-JS computation of an actor's total modifier on a given skill.
 * Returns `{ ok: false }` for an unknown skill key so callers can
 * bail without the caller needing to pre-validate.
 *
 * Reading precedence:
 *   - `actor.system.skills.<key>.ability` if the GM has overridden it
 *   - the canonical `SKILLS[key].ability` otherwise
 *
 * Ability score is read from `actor.system.attributes.<abilityKey>.value`
 * and mapped through the neutral-band helper. `proficient: true` adds a
 * flat +2; nothing else in the chain scales by level.
 */
export function computeSkillModifier(actor, skillKey) {
  const def = SKILLS[skillKey];
  if (!def) return { ok: false };
  const entry = actor?.system?.skills?.[skillKey] ?? {};
  const abilityKey = entry.ability || def.ability;
  const score = Number(actor?.system?.attributes?.[abilityKey]?.value ?? 10) || 10;
  const abilityMod = abilityModifierFromScore(score);
  const proficient = !!entry.proficient;
  const profBonus = proficient ? 2 : 0;
  const bonus = Number(entry.bonus ?? 0) || 0;
  return {
    ok: true,
    skillKey,
    abilityKey,
    abilityScore: score,
    abilityMod,
    proficient,
    profBonus,
    bonus,
    total: abilityMod + profBonus + bonus
  };
}

/**
 * Count how many skills a given actor has flagged as proficient. Used
 * by the sheet's max-3 guardrail and by the tab header pill.
 */
export function countProficientSkills(actor) {
  const skills = actor?.system?.skills ?? {};
  let count = 0;
  for (const key of Object.keys(SKILLS)) {
    if (skills[key]?.proficient) count += 1;
  }
  return count;
}

/**
 * Roll an actor's skill and post a chat card. Returns a descriptor
 * `{ roll, ok, skillKey, abilityKey, abilityMod, profBonus, total }`
 * (the pure modifier fields copied through) for callers that want to
 * inspect the result; the primary side effect is the ChatMessage.
 *
 * Exposed on `game.gammaWorld.rollSkill` for macro use (see api.mjs).
 *
 * 0.8.3 — fires the `gammaWorld.v1.preSkillRoll` veto hook before
 * evaluating the d20 and the `gammaWorld.v1.skillRollComplete` announce
 * hook before posting the card. Accepts a `{ suppressCard }` option so
 * the Cinematic Roll Request banner can consume the roll without
 * duplicating the chat card.
 */
export async function rollSkill(actor, skillKey, { suppressCard = false } = {}) {
  if (!actor) return null;
  const mod = computeSkillModifier(actor, skillKey);
  if (!mod.ok) {
    ui.notifications?.warn(`Unknown skill: ${skillKey}`);
    return null;
  }

  // Veto-capable pre-hook — macros / the banner can swap in a different
  // resolution here (e.g. auto-success for a narrative moment).
  const preProceed = fireVetoHook(HOOK.preSkillRoll, {
    actorUuid: actor.uuid,
    actorName: actor.name,
    skillKey,
    abilityKey: mod.abilityKey,
    abilityMod: mod.abilityMod,
    profBonus: mod.profBonus,
    proficient: mod.proficient,
    bonus: mod.bonus
  });
  if (!preProceed) return null;

  const roll = await new Roll("1d20 + @ability + @prof + @bonus", {
    ability: mod.abilityMod,
    prof: mod.profBonus,
    bonus: mod.bonus
  }).evaluate();
  const rollTooltip = await roll.getTooltip();

  const i18n = (key, fallback) => {
    const localized = game.i18n?.localize?.(key);
    if (localized && localized !== key) return localized;
    return fallback;
  };
  const abilityAbbrKey = ATTRIBUTES[mod.abilityKey]?.abbr ?? mod.abilityKey.toUpperCase();
  const abilityAbbr = i18n(abilityAbbrKey, mod.abilityKey.toUpperCase());
  const skillLabelKey = SKILLS[skillKey]?.label ?? skillKey;
  const skillLabel = i18n(skillLabelKey, skillKey);

  const templatePath = `systems/${SYSTEM_ID}/templates/chat/skill-card.hbs`;
  const content = await foundry.applications.handlebars.renderTemplate(templatePath, {
    actorName: actor.name,
    skillLabel,
    abilityKey: mod.abilityKey,
    abilityAbbr,
    abilityMod: mod.abilityMod,
    proficient: mod.proficient,
    profBonus: mod.profBonus,
    bonus: mod.bonus,
    d20: roll.terms?.[0]?.total ?? roll.total,
    total: roll.total,
    rollFormula: roll.formula,
    rollTooltip
  });

  // Announce-only — fires for BOTH sheet-initiated rolls and banner-
  // initiated rolls. The Cinematic Roll Request banner subscribes here
  // to snapshot the total onto its per-actor card, regardless of whether
  // it also asked us to suppress the chat card.
  fireAnnounceHook(HOOK.skillRollComplete, {
    actorUuid: actor.uuid,
    actorName: actor.name,
    skillKey,
    abilityKey: mod.abilityKey,
    abilityMod: mod.abilityMod,
    profBonus: mod.profBonus,
    proficient: mod.proficient,
    bonus: mod.bonus,
    d20: roll.terms?.[0]?.total ?? roll.total,
    total: roll.total,
    rollFormula: roll.formula,
    roll
  });

  if (!suppressCard) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: [roll],
      flags: {
        [SYSTEM_ID]: {
          card: "skill",
          skill: {
            actorUuid: actor.uuid,
            skillKey,
            abilityKey: mod.abilityKey,
            abilityMod: mod.abilityMod,
            profBonus: mod.profBonus,
            proficient: mod.proficient,
            bonus: mod.bonus,
            total: roll.total
          }
        }
      }
    });
  }

  return { roll, ...mod };
}
