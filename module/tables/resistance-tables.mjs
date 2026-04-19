/**
 * Gamma World 1e hazard tables.
 *
 * Source: local OCR'd rulebook in `ref/gamma-world-core-rules.pdf`
 * (reference sheets / POISON MATRIX / RADIATION MATRIX).
 *
 * NOTE (0.8.2 homebrew): the matrices + `resolvePoison` / `resolveRadiation`
 * helpers below are kept as RAW reference only. The live save pipeline no
 * longer consumes them — `save-flow.mjs` runs a `d20 + CN mod vs difficulty`
 * roll and consults `damageDiceFromIntensity` / `radiationBandFromMargin`
 * below. See Chapter 11 "Homebrew & Departures" in the rulebook pack for
 * the in-fiction rules. These functions are retained so macros / external
 * content referring to the original matrices still load.
 *
 * Poison outcomes (legacy / RAW):
 * - "*" => no effect
 * - 1/2/3 => that many d6 damage
 * - "D" => death unless antidote is administered within two turns
 *
 * Radiation outcomes (legacy / RAW):
 * - 0..8 => that many d6 damage
 * - "M" => new mutation
 * - "D" => 20% mutational defect, 80% death
 */

export const POISON_MATRIX = {
  18: { 3: "*", 4: "*", 5: "*", 6: "*", 7: "*", 8: "*", 9: "*", 10: "*", 11: "*", 12: "*", 13: "*", 14: "*", 15: 1, 16: 2, 17: 3, 18: "D" },
  17: { 3: "*", 4: "*", 5: "*", 6: "*", 7: "*", 8: "*", 9: "*", 10: "*", 11: "*", 12: "*", 13: "*", 14: 1, 15: 2, 16: 3, 17: "D", 18: "D" },
  16: { 3: "*", 4: "*", 5: "*", 6: "*", 7: "*", 8: "*", 9: "*", 10: "*", 11: "*", 12: "*", 13: 1, 14: 2, 15: 3, 16: "D", 17: "D", 18: "D" },
  15: { 3: "*", 4: "*", 5: "*", 6: "*", 7: "*", 8: "*", 9: "*", 10: "*", 11: "*", 12: 1, 13: 2, 14: 3, 15: "D", 16: "D", 17: "D", 18: "D" },
  14: { 3: "*", 4: "*", 5: "*", 6: "*", 7: "*", 8: "*", 9: "*", 10: "*", 11: 1, 12: 2, 13: 3, 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  13: { 3: "*", 4: "*", 5: "*", 6: "*", 7: "*", 8: "*", 9: "*", 10: 1, 11: 2, 12: 3, 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  12: { 3: "*", 4: "*", 5: "*", 6: "*", 7: "*", 8: "*", 9: 1, 10: 2, 11: 3, 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  11: { 3: "*", 4: "*", 5: "*", 6: "*", 7: "*", 8: 1, 9: 2, 10: 3, 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  10: { 3: "*", 4: "*", 5: "*", 6: "*", 7: 1, 8: 2, 9: 3, 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  9:  { 3: "*", 4: "*", 5: "*", 6: 1, 7: 2, 8: 3, 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  8:  { 3: "*", 4: "*", 5: 1, 6: 2, 7: 3, 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  7:  { 3: "*", 4: 1, 5: 2, 6: 3, 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  6:  { 3: 1, 4: 2, 5: 3, 6: "D", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  5:  { 3: 2, 4: 3, 5: "D", 6: "D", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  4:  { 3: 3, 4: "D", 5: "D", 6: "D", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  3:  { 3: "D", 4: "D", 5: "D", 6: "D", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" }
};

export const RADIATION_MATRIX = {
  18: { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1, 9: 2, 10: 3, 11: 4, 12: 5, 13: 6, 14: 7, 15: 8, 16: "M", 17: "M", 18: "D" },
  17: { 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 2, 9: 3, 10: 4, 11: 5, 12: 6, 13: 7, 14: 8, 15: "M", 16: "M", 17: "D", 18: "D" },
  16: { 3: 0, 4: 0, 5: 0, 6: 1, 7: 2, 8: 3, 9: 4, 10: 5, 11: 6, 12: 7, 13: 8, 14: "M", 15: "M", 16: "D", 17: "D", 18: "D" },
  15: { 3: 0, 4: 0, 5: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6, 11: 7, 12: 8, 13: "M", 14: "M", 15: "D", 16: "D", 17: "D", 18: "D" },
  14: { 3: 0, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6, 10: 7, 11: 8, 12: "M", 13: "M", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  13: { 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: "M", 12: "M", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  12: { 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: "M", 11: "M", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  11: { 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: "M", 10: "M", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  10: { 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: "M", 9: "M", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  9:  { 3: 5, 4: 6, 5: 7, 6: 8, 7: "M", 8: "M", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  8:  { 3: 6, 4: 7, 5: 8, 6: "M", 7: "M", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  7:  { 3: 7, 4: 8, 5: "M", 6: "M", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  6:  { 3: 8, 4: "M", 5: "M", 6: "D", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  5:  { 3: "M", 4: "M", 5: "D", 6: "D", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  4:  { 3: "M", 4: "D", 5: "D", 6: "D", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" },
  3:  { 3: "D", 4: "D", 5: "D", 6: "D", 7: "D", 8: "D", 9: "D", 10: "D", 11: "D", 12: "D", 13: "D", 14: "D", 15: "D", 16: "D", 17: "D", 18: "D" }
};

function clampScore(value) {
  return Math.max(3, Math.min(18, Math.round(Number(value) || 3)));
}

export function resolvePoison(constitution, strength) {
  const con = clampScore(constitution);
  const str = clampScore(strength);
  const outcome = POISON_MATRIX[con]?.[str] ?? "D";
  return {
    kind: "poison",
    constitution: con,
    strength: str,
    outcome,
    damageDice: Number.isInteger(outcome) ? outcome : 0
  };
}

export function resolveRadiation(constitution, intensity) {
  const con = clampScore(constitution);
  const rad = clampScore(intensity);
  const outcome = RADIATION_MATRIX[con]?.[rad] ?? "D";
  return {
    kind: "radiation",
    constitution: con,
    intensity: rad,
    outcome,
    damageDice: Number.isInteger(outcome) ? outcome : 0
  };
}

export function describePoisonOutcome(result) {
  if (result.outcome === "*") return "No effect.";
  if (Number.isInteger(result.outcome)) return `${result.outcome}d6 poison damage.`;
  return "Death unless a suitable antidote is administered within two turns.";
}

export function describeRadiationOutcome(result) {
  if (Number.isInteger(result.outcome)) return `${result.outcome}d6 radiation damage.`;
  if (result.outcome === "M") return "Gain one new mutation.";
  return "20% chance of a mutational defect, 80% chance of death.";
}

/* ------------------------------------------------------------------ */
/* 0.8.2 homebrew helpers                                             */
/* ------------------------------------------------------------------ */

/**
 * Intensity → number of d6 of damage for the new homebrew poison /
 * radiation rules. Kept deliberately flat — four bands, no per-intensity
 * micro-scaling. A weapon/hazard author who needs finer control can
 * override the damage formula directly on the effect.
 *
 *   intensity ≤ 6   → 1d6
 *   intensity 7-11  → 2d6
 *   intensity 12-15 → 3d6
 *   intensity ≥ 16  → 4d6
 */
export function damageDiceFromIntensity(intensity) {
  const numeric = Math.max(0, Math.round(Number(intensity) || 0));
  if (numeric <= 6) return 1;
  if (numeric <= 11) return 2;
  if (numeric <= 15) return 3;
  return 4;
}

/**
 * Radiation fail-margin → outcome band (homebrew).
 *
 *   margin ≤ 0 → "safe"         (roll met or beat intensity)
 *   margin 1-3 → "mild"         (Radiation Sickness, fully fatigued 1-3 days)
 *   margin 4-6 → "severe"       (Radiation Sickness + 1 random mutation)
 *   margin ≥ 7 → "catastrophic" (seems fine; tomorrow: -10% max HP / hour)
 *
 * Intensity < 10 is handled at a higher layer (auto-pass, no band); this
 * helper only runs when a save has already been rolled.
 */
export function radiationBandFromMargin(margin) {
  const numeric = Math.round(Number(margin) || 0);
  if (numeric <= 0) return "safe";
  if (numeric <= 3) return "mild";
  if (numeric <= 6) return "severe";
  return "catastrophic";
}

/**
 * Random duration (in days) for a Radiation Sickness bout.
 *
 *   "mild"   → 1-3 days  (1d3)
 *   "severe" → 3-6 days  (roughly 1d4+2)
 *
 * Accepts an optional rng (defaults to `Math.random`) so tests can
 * pin the roll deterministically.
 */
export function radiationSicknessDurationDays(band, rng = Math.random) {
  if (band === "mild")   return 1 + Math.floor(rng() * 3);
  if (band === "severe") return 3 + Math.floor(rng() * 4);
  return 0;
}

