/**
 * Gamma World 1e Fatigue Factors matrices (p. 21).
 *
 * Extended combat starts to fatigue combatants as early as the 11th melee
 * turn, as late as the 18th. The penalty is subtracted from the attacker's
 * weapon class when looking up Physical Attack Matrix I. Armor also has
 * a fatigue penalty, subtracted from weapon class as well.
 *
 * Keys are weapon families (not individual item names). A resolver maps
 * common item names and weapon classes to a family.
 */

/**
 * Weapon fatigue penalty per melee turn (columns 11..19). Negative values
 * are applied to the attacker's weapon class. `undefined` = no penalty.
 */
export const WEAPON_FATIGUE_MATRIX = {
  axe:            { 14: -1, 15: -2, 16: -3, 17: -4, 18: -5, 19: -6 },
  bow:            { 14: -1, 15: -2, 16: -3, 17: -4, 18: -5 },
  club:           { 14: -1, 15: -2, 16: -3, 17: -4, 18: -5 },
  dagger:         { 18: -1, 19: -2 },
  flail:          { 11: -1, 12: -2, 13: -3, 14: -4, 15: -5, 16: -6, 17: -7, 18: -8 },
  javelin:        { 15: -1, 16: -2, 17: -3, 18: -4 },
  "lance-mounted":{ 14: -1, 15: -2, 16: -3, 17: -4, 18: -5, 19: -6 },
  mace:           { 14: -1, 15: -2, 16: -3, 17: -4, 18: -5, 19: -6 },
  "morning-star": { 14: -1, 15: -2, 16: -3, 17: -4, 18: -5, 19: -6 },
  "pole-arm":     { 11: -1, 12: -2, 13: -3, 14: -4, 15: -5, 16: -6, 17: -7, 18: -8 },
  sling:          { 16: -1, 17: -2, 18: -3, 19: -4 },
  spear:          { 16: -1, 17: -2, 18: -3, 19: -4 },
  "sword-one":    { 14: -1, 15: -2, 16: -3, 17: -4, 18: -5, 19: -6 },
  "sword-two":    { 11: -1, 12: -2, 13: -3, 14: -4, 15: -5, 16: -6, 17: -7, 18: -8, 19: -9 }
};

/**
 * Armor fatigue penalty per melee turn (columns 15..20). Applied on top of
 * any weapon fatigue. AC 10 and AC 9 never fatigue. Powered / energy armors
 * the RAW lists as "powered offensive armor" do not incur a fatigue penalty
 * and should be mapped to AC 10 for this lookup.
 */
export const ARMOR_FATIGUE_MATRIX = {
  10: {},
  9:  {},
  8:  { 17: -1, 18: -2, 19: -3, 20: -4 },
  7:  { 16: -1, 17: -2, 18: -3, 19: -4, 20: -5 },
  6:  { 17: -1, 18: -2, 19: -3, 20: -4 },
  5:  { 15: -1, 16: -2, 17: -3, 18: -4, 19: -5, 20: -6 },
  4:  { 15: -1, 16: -2, 17: -3, 18: -4, 19: -5, 20: -6 },
  3:  { 15: -1, 16: -2, 17: -3, 18: -4, 19: -5, 20: -6 },
  2:  { 15: -1, 16: -2, 17: -3, 18: -4, 19: -5, 20: -6 }
};

/** Map common item names to fatigue-family keys. Case-insensitive substring match. */
const NAME_PATTERNS = [
  [/two[-\s]?hand|great|claymore/i, "sword-two"],
  [/sword|scimitar|rapier|cutlass/i, "sword-one"],
  [/pole\s*arm|glaive|halberd|naginata/i, "pole-arm"],
  [/flail/i, "flail"],
  [/morning[-\s]?star/i, "morning-star"],
  [/mace|hammer/i, "mace"],
  [/lance/i, "lance-mounted"],
  [/axe|hatchet|tomahawk/i, "axe"],
  [/dagger|knife|stiletto/i, "dagger"],
  [/javelin/i, "javelin"],
  [/spear|pike|trident/i, "spear"],
  [/bow|crossbow/i, "bow"],
  [/sling/i, "sling"],
  [/club|cudgel|truncheon|baton/i, "club"]
];

/** Weapon class → default family when the item name has no clearer match. */
const CLASS_DEFAULT = {
  1: "club",
  2: "axe",
  3: "sword-one",
  4: "dagger",
  5: "sword-one",
  6: "club",
  7: "club",
  8: "javelin",
  9: "bow",
  10: null, // pistol slugs — no fatigue
  11: null, // needler
  12: null, // stun ray
  13: null, // lasers
  14: null, // blasters
  15: null, // black ray
  16: null  // fusion / missile
};

/**
 * Resolve a weapon item (or plain fields) to a fatigue-family key, or null if
 * the weapon is not subject to fatigue (e.g. energy weapons, needler, sling projectile).
 */
export function resolveWeaponFatigueFamily({ name = "", weaponClass = 0 } = {}) {
  for (const [pattern, key] of NAME_PATTERNS) {
    if (pattern.test(name)) return key;
  }
  const cls = Math.max(1, Math.min(16, Math.round(Number(weaponClass) || 0)));
  return CLASS_DEFAULT[cls] ?? null;
}

/** Compute the current fatigue penalty for a weapon at a given melee turn. */
export function weaponFatigueModifier(family, meleeTurn) {
  if (!family) return 0;
  const turn = Math.max(1, Math.round(Number(meleeTurn) || 0));
  const table = WEAPON_FATIGUE_MATRIX[family];
  if (!table) return 0;
  return Number(table[turn] ?? 0);
}

/** Compute armor fatigue penalty at a given melee turn. */
export function armorFatigueModifier(armorClass, meleeTurn) {
  if (armorClass == null) return 0;
  const ac = Math.max(1, Math.min(10, Math.round(Number(armorClass) || 10)));
  const turn = Math.max(1, Math.round(Number(meleeTurn) || 0));
  const bucket = ac <= 2 ? 2 : ac;
  const table = ARMOR_FATIGUE_MATRIX[bucket];
  if (!table) return 0;
  return Number(table[turn] ?? 0);
}

/**
 * Combined fatigue factor to subtract from weapon class for the attack
 * matrix lookup. Pass the resolved weapon family (from a name/class) and
 * the wearer's armor class.
 */
export function combinedFatigueFactor({ family, armorClass, meleeTurn }) {
  return weaponFatigueModifier(family, meleeTurn) + armorFatigueModifier(armorClass, meleeTurn);
}
