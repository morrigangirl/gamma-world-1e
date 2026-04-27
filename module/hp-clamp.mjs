/**
 * 0.14.12 — HP invariant helper.
 *
 * Enforces `system.resources.hp.value <= system.resources.hp.max` on
 * actor updates regardless of who's editing (player, GM, macro, API).
 * Pure function: depends only on `foundry.utils.get/setProperty`, so it
 * imports cleanly into Node-based unit tests without needing the Foundry
 * Actor base class.
 *
 * Used by `GammaWorldActor._preUpdate` before the GM short-circuit so
 * the invariant holds for every code path that mutates HP.
 */

/**
 * Clamp HP value in an update payload to the effective max.
 *
 * Mutates `changed` in place when the proposed value would exceed max.
 * Behavior:
 *   - If both `value` and `max` are in the update, the new `max` is used
 *     as the ceiling.
 *   - If only `value` is in the update, the actor's current `max` is
 *     used as the ceiling.
 *   - If only `max` is in the update (and the new max is below the
 *     current value), `value` is pulled down to the new max so the
 *     post-update state honors the invariant.
 *   - If neither is in the update, returns null (no-op).
 *
 * @param {object} changed                Foundry update payload (mutated).
 * @param {{value?: number, max?: number}} current  Actor's pre-update HP.
 * @returns {number|null}  The clamped value when a clamp was applied,
 *                         otherwise `null`.
 */
export function clampHpUpdate(changed, current) {
  const nextHpInChange  = foundry.utils.getProperty(changed, "system.resources.hp.value");
  const nextMaxInChange = foundry.utils.getProperty(changed, "system.resources.hp.max");
  if (nextHpInChange == null && nextMaxInChange == null) return null;

  const effectiveMax = nextMaxInChange != null
    ? Math.max(0, Math.floor(Number(nextMaxInChange) || 0))
    : Math.max(0, Math.floor(Number(current?.max ?? 0) || 0));
  const proposedValue = nextHpInChange != null
    ? Math.floor(Number(nextHpInChange) || 0)
    : Math.floor(Number(current?.value ?? 0) || 0);

  if (proposedValue > effectiveMax) {
    foundry.utils.setProperty(changed, "system.resources.hp.value", effectiveMax);
    return effectiveMax;
  }
  return null;
}
