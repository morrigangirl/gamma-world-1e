/**
 * Legacy-to-metric movement conversion.
 *
 *   meters_per_round = round((legacy_move / 120) * 10)
 *
 * Anchor: 120 legacy = 10 m/round (default human/humanoid).
 * Non-zero legacy values floor at 1 m/round so no mover becomes
 * stationary from rounding alone. A legacy value of 0 stays 0.
 *
 * Applied once at build time to rule-table numbers
 * (ARMOR_RULES mobility, MUTATION_RULES flight speeds, monster
 * and pregen defaults), and by a one-shot 0.11.0 migration to
 * existing actors / items carrying stored legacy values.
 *
 * Pure function — safe to import from both build scripts and
 * Foundry runtime code.
 */
export function legacyToMeters(legacy) {
  const n = Number(legacy) || 0;
  if (n === 0) return 0;
  return Math.max(1, Math.round((n / 120) * 10));
}
