/**
 * Phase 6 — sound cues per outcome.
 *
 * Subscribes to the Phase 2b `gammaWorld.v1.*` hook surface and plays a
 * configured audio file whenever a particular combat event fires. Each
 * cue is a world-scoped setting storing an absolute file path (or a
 * `modules/…` / `sounds/…` path relative to Foundry's data root). Empty
 * path = no sound; master toggle gates the whole pipeline.
 *
 * The implementation is deliberately module-agnostic: it uses Foundry's
 * built-in `foundry.audio.AudioHelper.play` (v13) so it runs with no
 * module dependencies. Tables like the Patreon PSFX module can still
 * subscribe to their own Foundry events in parallel — this pipeline
 * doesn't interfere.
 *
 * Extending the system with a new cue = add an entry to SOUND_CUE_KEYS
 * below + a matching setting registration in migrations.mjs. The hook
 * dispatch picks it up automatically.
 */

import { SYSTEM_ID } from "./config.mjs";
import { HOOK } from "./hook-surface.mjs";

const MASTER_SETTING = "soundCuesEnabled";

/**
 * Canonical list of cue keys. Each maps to:
 *   - a world-scoped setting named `soundCue<Key>` storing the file path
 *   - a dispatch function that inspects the hook payload and returns true
 *     iff this cue should fire
 *
 * The pipeline listens to just five hooks total
 * (attackRollComplete, damageApplied, saveResolved, conditionApplied,
 * resourceConsumed) and routes each to the matching cue via the
 * predicate. This keeps the hook surface stable even as we add more cues.
 */
const SOUND_CUE_KEYS = Object.freeze({
  AttackHit:        { setting: "soundCueAttackHit",        hook: HOOK.attackRollComplete, test: (p) => p?.context?.hit && !p?.context?.isCritical },
  AttackMiss:       { setting: "soundCueAttackMiss",       hook: HOOK.attackRollComplete, test: (p) => !p?.context?.hit && !p?.context?.isFumble },
  AttackCrit:       { setting: "soundCueAttackCrit",       hook: HOOK.attackRollComplete, test: (p) => !!p?.context?.isCritical },
  AttackFumble:     { setting: "soundCueAttackFumble",     hook: HOOK.attackRollComplete, test: (p) => !!p?.context?.isFumble },
  DamageApplied:    { setting: "soundCueDamageApplied",    hook: HOOK.damageApplied,      test: (p) => (p?.applied ?? 0) > 0 },
  SaveSuccess:      { setting: "soundCueSaveSuccess",      hook: HOOK.saveResolved,       test: (p) => !!p?.result?.success },
  SaveFail:         { setting: "soundCueSaveFail",         hook: HOOK.saveResolved,       test: (p) => p?.result && p.result.success === false && p?.result?.status === "resolved" },
  ConditionApplied: { setting: "soundCueConditionApplied", hook: HOOK.conditionApplied,   test: () => true }
});

export const SOUND_CUE_SETTING_KEYS = Object.freeze(
  Object.values(SOUND_CUE_KEYS).map((entry) => entry.setting)
);

export { MASTER_SETTING as SOUND_CUE_MASTER_SETTING };

function audioHelper() {
  // Foundry v13 exposes the helper under `foundry.audio.AudioHelper`;
  // earlier builds used `AudioHelper` as a global. Fall back gracefully
  // so the system keeps working across minor-version differences.
  return foundry.audio?.AudioHelper ?? globalThis.AudioHelper ?? null;
}

async function playCue(path) {
  if (!path) return;
  const helper = audioHelper();
  if (!helper?.play) return;
  try {
    await helper.play({ src: path, volume: 0.8, autoplay: true, loop: false }, { excludeUser: null });
  } catch (error) {
    console.warn(`gamma-world-1e | sound cue failed for "${path}"`, error);
  }
}

function cueEnabled() {
  try {
    return !!game.settings?.get(SYSTEM_ID, MASTER_SETTING);
  } catch (_error) {
    return false;
  }
}

function cuePath(settingKey) {
  try {
    return String(game.settings?.get(SYSTEM_ID, settingKey) ?? "").trim();
  } catch (_error) {
    return "";
  }
}

/**
 * Fire all matching cues for a given hook payload. Because multiple
 * cue keys bind to the same hook (e.g. attackRollComplete → Hit / Miss /
 * Crit / Fumble), we test every cue and play each one whose predicate
 * matches. In practice the tests are mutually exclusive, but we don't
 * enforce that — so a configured cue and an unconfigured cue can share
 * a hook without interference.
 */
function dispatchHook(hookName, payload) {
  if (!cueEnabled()) return;
  for (const [, entry] of Object.entries(SOUND_CUE_KEYS)) {
    if (entry.hook !== hookName) continue;
    let matches = false;
    try {
      matches = !!entry.test(payload);
    } catch (_error) {
      matches = false;
    }
    if (!matches) continue;
    const path = cuePath(entry.setting);
    if (!path) continue;
    // Fire-and-forget; don't await so multiple cues can play in parallel
    // and the hook pipeline isn't blocked.
    playCue(path);
  }
}

/**
 * Subscribe to the five hooks we route cues from. Idempotent — calling
 * twice won't double-register.
 */
let registered = false;
export function registerSoundCueHooks() {
  if (registered) return;
  registered = true;

  // Keep the set of hooks to bind small; one listener per hook dispatches
  // to all matching cues.
  const hooksToBind = new Set(Object.values(SOUND_CUE_KEYS).map((c) => c.hook));
  for (const hookName of hooksToBind) {
    Hooks.on(hookName, (payload) => dispatchHook(hookName, payload));
  }
}
