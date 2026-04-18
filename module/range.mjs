/**
 * Pure-JS range-band resolver.
 *
 * Kept separate from `dice.mjs` so tests can import it without pulling in
 * Foundry-only globals. Returns a `{ label, penalty }` pair for the given
 * attacker-to-target distance:
 *
 *   melee       → flat (no range bands)
 *   unlimited   → weapon has no configured ranges
 *   short       → 0 penalty
 *   medium      → −2
 *   long        → −5 (including the implicit 2×short fallback when no long is
 *                    configured)
 *   out         → penalty −999 (signal; caller aborts the shot)
 *
 * The weapon is inspected via `weapon.system.attackType` and `weapon.system.range`
 * so it accepts either a real Foundry document or a plain fixture in tests.
 */

export function determineRangeBand(weapon, distance = 0) {
  const attackType = weapon?.system?.attackType;
  if (attackType === "melee") return { label: "melee", penalty: 0 };

  const short = Number(weapon?.system?.range?.short ?? 0);
  const medium = Number(weapon?.system?.range?.medium ?? 0);
  const long = Number(weapon?.system?.range?.long ?? 0);

  if (!short && !medium && !long) return { label: "unlimited", penalty: 0 };
  if (distance <= short || (!short && distance <= medium)) return { label: "short", penalty: 0 };
  if (medium && distance <= medium) return { label: "medium", penalty: -2 };
  if (long && distance <= long) return { label: "long", penalty: -5 };
  if (short && !long && distance <= short * 2) return { label: "long", penalty: -5 };
  return { label: "out", penalty: -999 };
}
