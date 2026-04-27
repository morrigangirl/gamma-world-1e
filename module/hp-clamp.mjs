/**
 * 0.14.12 — Resource invariant helpers.
 *
 * Enforces `value <= max` on actor / item updates regardless of who's
 * editing (player, GM, macro, API). Pure functions: depend only on
 * `foundry.utils.get/setProperty`, so they import cleanly into
 * Node-based unit tests without needing the Foundry Actor or Item base
 * class.
 *
 * Used by `GammaWorldActor._preUpdate` (HP, HD) and `GammaWorldItem.
 * _preUpdate` (artifact charges) before any GM short-circuit so the
 * invariants hold for every code path that mutates the resource.
 *
 * Two named exports today:
 *   - `clampHpUpdate(changed, current)`           — `value <= max`
 *   - `clampHitDiceUpdate(changed, current)`      — `value <= details.level`
 *
 * Both delegate to the same `clampValueAtCeiling` core. The HD ceiling
 * is `system.details.level`, not `hitDice.max`, because the schema's
 * persisted `hitDice.max` is rebuilt from level in
 * `prepareDerivedData`; level is the authoritative source.
 */

/**
 * Internal core. Reads `paths.value` and `paths.max` from the update
 * payload, falls back to `current.value` / `current.max` when absent,
 * and writes a clamped `paths.value` back into `changed` when the
 * proposed value exceeds the effective ceiling.
 *
 * @param {object} changed
 * @param {{value: string, max: string}} paths
 * @param {{value?: number, max?: number}} current
 * @returns {number|null}
 */
function clampValueAtCeiling(changed, paths, current) {
  const nextValueIn = foundry.utils.getProperty(changed, paths.value);
  const nextMaxIn   = foundry.utils.getProperty(changed, paths.max);
  if (nextValueIn == null && nextMaxIn == null) return null;

  const effectiveMax = nextMaxIn != null
    ? Math.max(0, Math.floor(Number(nextMaxIn) || 0))
    : Math.max(0, Math.floor(Number(current?.max ?? 0) || 0));
  const proposedValue = nextValueIn != null
    ? Math.floor(Number(nextValueIn) || 0)
    : Math.floor(Number(current?.value ?? 0) || 0);

  if (proposedValue > effectiveMax) {
    foundry.utils.setProperty(changed, paths.value, effectiveMax);
    return effectiveMax;
  }
  return null;
}

/**
 * Clamp HP value in an update payload to the effective HP max.
 *
 * Behavior:
 *   - If both `value` and `max` are in the update, the new `max` is the
 *     ceiling.
 *   - If only `value` is in the update, the actor's current `max` is
 *     the ceiling.
 *   - If only `max` is in the update (and the new max is below the
 *     current value), `value` is pulled down to the new max so the
 *     post-update state honors the invariant.
 *   - If neither is in the update, returns null (no-op).
 *
 * @param {object} changed                Foundry update payload (mutated).
 * @param {{value?: number, max?: number}} current  Actor's pre-update HP.
 * @returns {number|null}  Clamped value when a clamp was applied; else null.
 */
export function clampHpUpdate(changed, current) {
  return clampValueAtCeiling(changed, {
    value: "system.resources.hp.value",
    max:   "system.resources.hp.max"
  }, current);
}

/**
 * Clamp Hit Dice value in an update payload to the actor's level.
 *
 * The Hit Dice ceiling is `system.details.level` rather than
 * `system.resources.hitDice.max` because `prepareDerivedData` rebuilds
 * `hitDice.max` from level on every data prep — level is the source of
 * truth. The level-up branch in `GammaWorldActor._preUpdate` already
 * handles the level-change case; this helper guards direct edits to
 * `hitDice.value` (sheet number input, macro, API).
 *
 * @param {object} changed                Foundry update payload (mutated).
 * @param {{value?: number, max?: number}} current  Pre-update HD pool.
 *        Pass `{ value: <hitDice.value>, max: <details.level> }`.
 * @returns {number|null}  Clamped value when a clamp was applied; else null.
 */
export function clampHitDiceUpdate(changed, current) {
  return clampValueAtCeiling(changed, {
    value: "system.resources.hitDice.value",
    max:   "system.details.level"
  }, current);
}

/**
 * Clamp an item's `system.artifact.charges.current` to
 * `system.artifact.charges.max` (or the legacy
 * `system.consumption.charges` shape if the item uses it). Used by
 * `GammaWorldItem._preUpdate` so direct edits / macros can't push a
 * power cell or charged artifact above its capacity.
 *
 * @param {object} changed                Foundry update payload (mutated).
 * @param {{value?: number, max?: number}} current  Item's pre-update
 *        charges. Pass `{ value: <charges.current>, max: <charges.max> }`.
 * @returns {number|null}  Clamped value when a clamp was applied; else null.
 */
export function clampArtifactChargesUpdate(changed, current) {
  return clampValueAtCeiling(changed, {
    value: "system.artifact.charges.current",
    max:   "system.artifact.charges.max"
  }, current);
}

/**
 * 0.14.13 — decide whether the "dead" status effect should be toggled
 * given a new HP value and the actor's current dead-status state.
 *
 * Returns:
 *   - "set"   when HP <= 0 and the status isn't already on (just died)
 *   - "clear" when HP > 0 and the status is on (revived)
 *   - null    otherwise (no transition needed)
 *
 * Pure: no Foundry globals. The caller (GammaWorldActor._onUpdate) is
 * responsible for calling `actor.toggleStatusEffect("dead", ...)` when
 * this returns a non-null action. The transition-only contract means
 * a GM who manually toggles "dead" on a healthy actor stays in
 * control: that toggle didn't change HP, so this helper is never asked
 * about it.
 *
 * @param {{currentHp: number|string|null|undefined, hasDeadStatus: boolean}} input
 * @returns {"set"|"clear"|null}
 */
export function deadStatusTransition({ currentHp, hasDeadStatus }) {
  const hp = Number(currentHp ?? 0) || 0;
  const isDead = hp <= 0;
  if (isDead && !hasDeadStatus) return "set";
  if (!isDead && hasDeadStatus) return "clear";
  return null;
}

/**
 * 0.14.17 — decide whether the "bloodied" status effect should be
 * toggled given the new HP value, max HP, and the actor's current
 * bloodied-status state.
 *
 * Bloodied = alive (HP > 0) AND HP fraction <= threshold (default
 * 50%). Dead actors are never bloodied — when HP crosses to 0 the
 * dead-status helper handles it and bloodied gets cleared here.
 *
 * Same transition-only contract as deadStatusTransition: returns null
 * when no toggle is needed, so a GM who manually toggles bloodied on
 * a fresh actor stays in control until HP changes.
 *
 * @param {{
 *   currentHp: number|string|null|undefined,
 *   maxHp: number|string|null|undefined,
 *   hasBloodiedStatus: boolean,
 *   threshold?: number
 * }} input
 * @returns {"set"|"clear"|null}
 */
export function bloodiedStatusTransition({ currentHp, maxHp, hasBloodiedStatus, threshold = 0.5 }) {
  const hp = Number(currentHp ?? 0) || 0;
  const max = Math.max(1, Number(maxHp ?? 1) || 1);
  const t = Math.max(0, Math.min(1, Number(threshold) || 0.5));
  const isBloodied = hp > 0 && (hp / max) <= t;
  if (isBloodied && !hasBloodiedStatus) return "set";
  if (!isBloodied && hasBloodiedStatus) return "clear";
  return null;
}

/**
 * 0.14.17 — pure predicate: is the actor incapacitated and therefore
 * unable to take quick-actions (Attack, Use Mutation, Roll Save)?
 *
 * Reads from the standard `actor.statuses` Set populated by Foundry
 * after status-effect toggles. Any of the configured incapacitating
 * conditions returns true.
 *
 * Default blocking statuses match the GW1e text on each condition:
 *   - unconscious — knocked out (stunning damage / Poor Respiratory)
 *   - paralyzed   — frozen (Daylight Stasis, Epilepsy, paralysis rays)
 *   - sleeping    — Sleep mutation effect
 *   - stunned     — stun damage tier below unconscious
 *
 * @param {{statuses?: Set<string>}|null|undefined} actor
 * @param {{blocking?: Iterable<string>}} options
 * @returns {boolean}
 */
export function actorIsIncapacitated(actor, { blocking = ["unconscious", "paralyzed", "sleeping", "stunned"] } = {}) {
  const statuses = actor?.statuses;
  if (!statuses || typeof statuses.has !== "function") return false;
  for (const id of blocking) {
    if (statuses.has(id)) return true;
  }
  return false;
}
