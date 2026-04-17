/**
 * D&D 5e-style point-buy cost table + validators.
 */

import { POINT_BUY, ATTRIBUTE_KEYS } from "../config.mjs";

export const POINT_BUY_MIN = POINT_BUY.minValue;
export const POINT_BUY_MAX = POINT_BUY.maxValue;
export const POINT_BUY_BUDGET = POINT_BUY.budget;

/** Cost to reach `value` starting from the minimum. */
export function costFor(value) {
  return POINT_BUY.costs[value] ?? null;
}

/** Total cost of a full stat assignment. Invalid values contribute Infinity. */
export function totalCost(stats) {
  let sum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const c = costFor(stats[key]);
    if (c == null) return Infinity;
    sum += c;
  }
  return sum;
}

/** True if the assignment is a legal point-buy within the budget and bounds. */
export function isValidPointBuy(stats) {
  for (const key of ATTRIBUTE_KEYS) {
    const v = stats[key];
    if (!Number.isInteger(v) || v < POINT_BUY_MIN || v > POINT_BUY_MAX) return false;
  }
  return totalCost(stats) <= POINT_BUY_BUDGET;
}

/** A default assignment with all attributes at the minimum. */
export function defaultPointBuy() {
  return Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, POINT_BUY_MIN]));
}
