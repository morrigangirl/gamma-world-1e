/**
 * 0.8.1 weapon/ammo migration constants and pure helpers.
 *
 * Extracted into its own module so the tests can import without pulling
 * in Foundry-only dependencies that sit in migrations.mjs's transitive
 * graph (GammaWorldConfig, prototype-token defaults, etc.). All symbols
 * here must stay Foundry-agnostic — no `foundry.*`, no `game.*`, no
 * Application classes.
 */

/**
 * Map ammo-type slugs to the canonical ammo gear item names that the
 * compendium generator emits. Consumed by the inline-ammo migration to
 * figure out which gear item to create / merge into on the actor.
 *
 * 0.14.0 — bundle/pouch/clip suffixes dropped; each ammo gear is now a
 * per-unit stack with `system.quantity` carrying the count. Six entries
 * removed: the five orphan cartridges (energy-clip, blaster-pack,
 * black-ray-cell, fusion-cell, stun-cell) plus `javelin` (now tracked
 * as weapon quantity).
 */
export const AMMO_GEAR_BY_TYPE = Object.freeze({
  "arrow":             "Arrow",
  "crossbow-bolt":     "Crossbow Bolt",
  "sling-stone":       "Sling Stone",
  "sling-bullet":      "Sling Bullet",
  "slug":              "Slug",
  "needler-paralysis": "Needler Dart, Paralysis",
  "needler-poison":    "Needler Dart, Poison",
  "gyrojet":           "Gyrojet Slug"
});

/**
 * 0.8.1 weapon renames: old name → { name, ammoType[] }. Each entry is a
 * straight rename with the SetField conversion baked in.
 */
export const WEAPON_RENAMES_081 = Object.freeze({
  "Bow and Arrows":     { name: "Bow",          ammoType: ["arrow"] },
  "Sling Stones":       { name: "Sling",        ammoType: ["sling-stone", "sling-bullet"] },
  "Slug Thrower (.38)": { name: "Slug Thrower", ammoType: ["slug"] }
});

/**
 * 0.8.1 Needler collapse: two legacy entries fold into one weapon that
 * accepts either dart type. The first matching item on the actor is
 * renamed; any additional Needler (Poison) / Needler (Paralysis) items
 * are deleted after ammo drain.
 */
export const NEEDLER_NAMES_081 = Object.freeze(new Set([
  "Needler (Poison)",
  "Needler (Paralysis)"
]));

/**
 * 0.8.1: the "Sling Bullets" weapon entry is removed from the pack. The
 * item survives only as ammo gear. Any actor carrying the weapon version
 * has it deleted during migration.
 */
export const SLING_BULLETS_WEAPON_081 = "Sling Bullets";

/**
 * Coerce a weapon's ammoType value to a single legacy string (used for
 * pre-rename migration lookups). SetFields read as Sets; arrays read as
 * arrays; legacy string values pass through. Returns "" when the weapon
 * has no ammo type at all.
 */
export function legacyAmmoTypeString(value) {
  if (!value) return "";
  if (value instanceof Set) {
    const first = [...value][0];
    return first ? String(first).trim() : "";
  }
  if (Array.isArray(value)) {
    const first = value.find(Boolean);
    return first ? String(first).trim() : "";
  }
  return String(value).trim();
}
