/**
 * Public hook surface for the Gamma World 1e system.
 *
 * Nine named hooks fire at key points in the attack/save/damage/effect
 * pipeline. Macro authors and third-party modules can subscribe with:
 *
 *     Hooks.on("gammaWorld.v1.attackRollComplete", (payload) => { ... });
 *
 * Every hook name is prefixed `gammaWorld.v1.` — the `.v1.` namespace is
 * deliberate, so payload shapes can evolve to `v2` later without breaking
 * existing subscribers.
 *
 * Payloads always include:
 *   - `version: 1` — the hook surface revision
 *   - `context` — an AttackContext object (or a partial shape for
 *     non-attack hooks like condition/save). See `attack-context.mjs`.
 *   - stage-specific extras (e.g. `{ roll }` on preAttackRoll, `{ amount }`
 *     on applyIncomingDamage).
 *
 * Veto-capable hooks are invoked via `Hooks.call` and stop on the first
 * falsy return. Announce-only hooks use `Hooks.callAll` (fire-and-forget,
 * all listeners run).
 *
 * Table (updated alongside this file):
 *
 *   Hook                                   Fires at                Vetoable
 *   -----------------------------------    --------------------    --------
 *   gammaWorld.v1.preAttackRoll            before d20 evaluates    yes
 *   gammaWorld.v1.attackRollComplete       after d20, before card  no
 *   gammaWorld.v1.preRollDamage            before damage formula   yes
 *   gammaWorld.v1.damageRollComplete       after damage evaluates  no
 *   gammaWorld.v1.preApplyDamage           before HP mutation      yes
 *   gammaWorld.v1.damageApplied            after HP update         no
 *   gammaWorld.v1.preSaveRoll              before save resolves    yes
 *   gammaWorld.v1.saveResolved             after save outcome      no
 *   gammaWorld.v1.conditionApplied         after AE applied        no
 *   gammaWorld.v1.preSkillRoll             before skill d20 evals  yes
 *   gammaWorld.v1.skillRollComplete        after skill d20, before card
 *
 * A tenth hook, `gammaWorld.v1.resourceConsumed`, is declared here for
 * naming consistency but wired in Phase 4 alongside the consumeResource
 * refactor.
 */

export const HOOK = Object.freeze({
  preAttackRoll:        "gammaWorld.v1.preAttackRoll",
  attackRollComplete:   "gammaWorld.v1.attackRollComplete",
  preRollDamage:        "gammaWorld.v1.preRollDamage",
  damageRollComplete:   "gammaWorld.v1.damageRollComplete",
  preApplyDamage:       "gammaWorld.v1.preApplyDamage",
  damageApplied:        "gammaWorld.v1.damageApplied",
  preSaveRoll:          "gammaWorld.v1.preSaveRoll",
  saveResolved:         "gammaWorld.v1.saveResolved",
  conditionApplied:     "gammaWorld.v1.conditionApplied",
  resourceConsumed:     "gammaWorld.v1.resourceConsumed",
  // 0.8.3 — Cinematic Roll Request surface. Skills posted silently in
  // 0.8.0; these hooks let the banner substitute the skill chat card
  // without duplicating it, and give macro authors a veto point.
  preSkillRoll:         "gammaWorld.v1.preSkillRoll",
  skillRollComplete:    "gammaWorld.v1.skillRollComplete"
});

export const HOOK_SURFACE_VERSION = 1;

/**
 * Fire a veto-capable hook. Returns `true` if no subscriber vetoed
 * (pipeline should proceed), `false` if any listener returned `false`
 * (caller should abort gracefully).
 *
 * Guards against `Hooks` being unavailable (tests, pre-init) — in
 * that case always returns true (proceed) so production behavior is
 * never blocked by missing infra.
 */
export function fireVetoHook(name, payload) {
  if (typeof Hooks === "undefined" || !Hooks?.call) return true;
  try {
    const result = Hooks.call(name, { version: HOOK_SURFACE_VERSION, ...payload });
    return result !== false;
  } catch (error) {
    // A subscriber threw — don't let a macro-author bug break combat.
    console.warn(`gamma-world-1e | hook "${name}" subscriber threw:`, error);
    return true;
  }
}

/**
 * Fire an announce-only hook. Never vetoes; errors in subscribers are
 * caught and logged so a buggy macro doesn't break the pipeline.
 */
export function fireAnnounceHook(name, payload) {
  if (typeof Hooks === "undefined" || !Hooks?.callAll) return;
  try {
    Hooks.callAll(name, { version: HOOK_SURFACE_VERSION, ...payload });
  } catch (error) {
    console.warn(`gamma-world-1e | hook "${name}" subscriber threw:`, error);
  }
}
