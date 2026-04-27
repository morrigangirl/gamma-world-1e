/**
 * 0.14.13 — pure encumbrance math.
 *
 * Extracted from `GammaWorldActor._prepareEncumbrance` so the
 * weight-summing and carry-capacity logic can be unit-tested without
 * the Foundry Actor base class. The actor wrapper still owns the
 * mutation of `this.gw` / `this.system.encumbrance` (those depend on
 * actor-document context); this module returns the pure record.
 *
 * Strict mode (per world design):
 *   - encumbered = carried > carryMax            (penalized: yes)
 *   - overloaded = carried > carryMax * 2        (movement halts)
 */

/**
 * Compute carry totals from an item list and physical-strength score.
 *
 * @param {{
 *   items: Array<{type: string, system?: object}>,
 *   physStrength: number
 * }} input
 * @returns {{
 *   carried: number,
 *   max: number,
 *   baseCarry: number,
 *   containerCap: number,
 *   encumbered: boolean,
 *   overloaded: boolean,
 *   penalized: boolean
 * }}
 */
export function computeEncumbrance({ items, physStrength }) {
  const safeItems = Array.isArray(items) ? items : [];
  const baseCarry = Math.max(0, Number(physStrength) || 0) * 10;

  let containerCap = 0;
  let carried = 0;
  for (const item of safeItems) {
    if (!item) continue;
    const qty = Math.max(0, Number(item.system?.quantity ?? 1));
    const weight = Math.max(0, Number(item.system?.weight ?? 0));
    carried += qty * weight;
    if (item.type === "gear"
        && item.system?.subtype === "container"
        && item.system?.equipped) {
      containerCap += Math.max(0, Number(item.system?.container?.capacity ?? 0));
    }
  }

  const max = baseCarry + containerCap;
  const encumbered = carried > max;
  const overloaded = carried > (max * 2);

  return {
    carried: Math.round(carried * 100) / 100,
    max,
    baseCarry,
    containerCap,
    encumbered,
    overloaded,
    penalized: encumbered || overloaded
  };
}
