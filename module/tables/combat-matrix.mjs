/**
 * Gamma World 1e reference combat tables.
 *
 * Source: local OCR'd rulebook in `ref/gamma-world-core-rules.pdf`
 * (reference sheets / PHYSICAL ATTACK MATRIX I & II / MENTAL ATTACK MATRIX).
 */

/**
 * Physical attacks made with weapons.
 * Rows use descending armor class 1..10, columns use weapon class 1..16.
 */
export const PHYSICAL_ATTACK_MATRIX_I = {
  1:  { 1: 19, 2: 19, 3: 18, 4: 15, 5: 13, 6: 16, 7: 14, 8: 18, 9: 18, 10: 16, 11: 16, 12: 16, 13: 12, 14: 14, 15: 14, 16: 12 },
  2:  { 1: 17, 2: 18, 3: 17, 4: 14, 5: 12, 6: 15, 7: 13, 8: 17, 9: 16, 10: 15, 11: 15, 12: 15, 13: 11, 14: 13, 15: 13, 16: 11 },
  3:  { 1: 16, 2: 16, 3: 16, 4: 12, 5: 10, 6: 15, 7: 12, 8: 16, 9: 15, 10: 14, 11: 15, 12: 15, 13: 8,  14: 12, 15: 13, 16: 11 },
  4:  { 1: 15, 2: 14, 3: 15, 4: 12, 5: 10, 6: 15, 7: 11, 8: 15, 9: 14, 10: 13, 11: 15, 12: 15, 13: 8,  14: 11, 15: 13, 16: 10 },
  5:  { 1: 14, 2: 13, 3: 14, 4: 12, 5: 10, 6: 15, 7: 10, 8: 14, 9: 13, 10: 12, 11: 14, 12: 15, 13: 8,  14: 11, 15: 13, 16: 11 },
  6:  { 1: 13, 2: 12, 3: 13, 4: 12, 5: 10, 6: 15, 7: 9,  8: 13, 9: 12, 10: 11, 11: 11, 12: 15, 13: 8,  14: 10, 15: 13, 16: 11 },
  7:  { 1: 12, 2: 11, 3: 12, 4: 12, 5: 10, 6: 13, 7: 8,  8: 12, 9: 11, 10: 10, 11: 10, 12: 11, 13: 8,  14: 10, 15: 13, 16: 11 },
  8:  { 1: 11, 2: 10, 3: 11, 4: 12, 5: 10, 6: 13, 7: 7,  8: 11, 9: 10, 10: 9,  11: 9,  12: 9,  13: 8,  14: 9,  15: 13, 16: 11 },
  9:  { 1: 10, 2: 9,  3: 10, 4: 12, 5: 10, 6: 7,  7: 6,  8: 10, 9: 9,  10: 8,  11: 7,  12: 6,  13: 8,  14: 8,  15: 8,  16: 11 },
  10: { 1: 9,  2: 8,  3: 9,  4: 11, 5: 9,  6: 6,  7: 5,  8: 9,  9: 8,  10: 7,  11: 6,  12: 5,  13: 8,  14: 8,  15: 8,  16: 10 }
};

/**
 * Physical attacks made by creatures / mutations without weapons.
 * Columns are hit-dice buckets.
 */
export const PHYSICAL_ATTACK_MATRIX_II = {
  1:  { "1": 20, "2-3": 19, "4-5": 18, "6-8": 17, "9-10": 16, "11-14": 15, "15+": 14 },
  2:  { "1": 19, "2-3": 18, "4-5": 17, "6-8": 16, "9-10": 15, "11-14": 14, "15+": 13 },
  3:  { "1": 18, "2-3": 17, "4-5": 16, "6-8": 15, "9-10": 14, "11-14": 13, "15+": 12 },
  4:  { "1": 17, "2-3": 16, "4-5": 15, "6-8": 14, "9-10": 13, "11-14": 12, "15+": 11 },
  5:  { "1": 16, "2-3": 15, "4-5": 14, "6-8": 13, "9-10": 12, "11-14": 11, "15+": 10 },
  6:  { "1": 14, "2-3": 13, "4-5": 12, "6-8": 11, "9-10": 10, "11-14": 9,  "15+": 8  },
  7:  { "1": 13, "2-3": 12, "4-5": 11, "6-8": 10, "9-10": 9,  "11-14": 8,  "15+": 7  },
  8:  { "1": 12, "2-3": 11, "4-5": 10, "6-8": 9,  "9-10": 8,  "11-14": 7,  "15+": 6  },
  9:  { "1": 11, "2-3": 10, "4-5": 9,  "6-8": 8,  "9-10": 7,  "11-14": 6,  "15+": 5  },
  10: { "1": 10, "2-3": 9,  "4-5": 8,  "6-8": 7,  "9-10": 6,  "11-14": 5,  "15+": 4  }
};

/**
 * Mental combat table.
 *
 * Results are:
 * - integer target number on d20
 * - "A" for automatic success
 * - "NE" for no effect / impossible
 */
export const MENTAL_ATTACK_MATRIX = {
  3:  { 3: 10, 4: 9,  5: 8,  6: 7,  7: 6,  8: 5,  9: 4,  10: 3,  11: 2,  12: "A", 13: "A", 14: "A", 15: "A", 16: "A", 17: "A", 18: "A" },
  4:  { 3: 11, 4: 10, 5: 9,  6: 8,  7: 7,  8: 6,  9: 5,  10: 4,  11: 3,  12: 2,   13: "A", 14: "A", 15: "A", 16: "A", 17: "A", 18: "A" },
  5:  { 3: 12, 4: 11, 5: 10, 6: 9,  7: 8,  8: 7,  9: 6,  10: 5,  11: 4,  12: 3,   13: 2,   14: "A", 15: "A", 16: "A", 17: "A", 18: "A" },
  6:  { 3: 13, 4: 12, 5: 11, 6: 10, 7: 9,  8: 8,  9: 7,  10: 6,  11: 5,  12: 4,   13: 3,   14: 2,   15: "A", 16: "A", 17: "A", 18: "A" },
  7:  { 3: 14, 4: 13, 5: 12, 6: 11, 7: 10, 8: 9,  9: 8,  10: 7,  11: 6,  12: 5,   13: 4,   14: 3,   15: 2,   16: "A", 17: "A", 18: "A" },
  8:  { 3: 15, 4: 14, 5: 13, 6: 12, 7: 11, 8: 10, 9: 9,  10: 8,  11: 7,  12: 6,   13: 5,   14: 4,   15: 3,   16: 2,   17: "A", 18: "A" },
  9:  { 3: 16, 4: 15, 5: 14, 6: 13, 7: 12, 8: 11, 9: 10, 10: 9,  11: 8,  12: 7,   13: 6,   14: 5,   15: 4,   16: 3,   17: 2,   18: "A" },
  10: { 3: 17, 4: 16, 5: 15, 6: 14, 7: 13, 8: 12, 9: 11, 10: 10, 11: 9,  12: 8,   13: 7,   14: 6,   15: 5,   16: 4,   17: 3,   18: 2   },
  11: { 3: 18, 4: 17, 5: 16, 6: 15, 7: 14, 8: 13, 9: 12, 10: 11, 11: 10, 12: 9,   13: 8,   14: 7,   15: 6,   16: 5,   17: 4,   18: 3   },
  12: { 3: 19, 4: 18, 5: 17, 6: 16, 7: 15, 8: 14, 9: 13, 10: 12, 11: 11, 12: 10,  13: 9,   14: 8,   15: 7,   16: 6,   17: 5,   18: 4   },
  13: { 3: 20, 4: 19, 5: 18, 6: 17, 7: 16, 8: 15, 9: 14, 10: 13, 11: 12, 12: 11,  13: 10,  14: 9,   15: 8,   16: 7,   17: 6,   18: 5   },
  14: { 3: "NE", 4: 20, 5: 19, 6: 18, 7: 17, 8: 16, 9: 15, 10: 14, 11: 13, 12: 12, 13: 11, 14: 10, 15: 9, 16: 8, 17: 7, 18: 6 },
  15: { 3: "NE", 4: "NE", 5: 20, 6: 19, 7: 18, 8: 17, 9: 16, 10: 15, 11: 14, 12: 13, 13: 12, 14: 11, 15: 10, 16: 9, 17: 8, 18: 7 },
  16: { 3: "NE", 4: "NE", 5: "NE", 6: 20, 7: 19, 8: 18, 9: 17, 10: 16, 11: 15, 12: 14, 13: 13, 14: 12, 15: 11, 16: 10, 17: 9, 18: 8 },
  17: { 3: "NE", 4: "NE", 5: "NE", 6: "NE", 7: 20, 8: 19, 9: 18, 10: 17, 11: 16, 12: 15, 13: 14, 14: 13, 15: 12, 16: 11, 17: 10, 18: 9 },
  18: { 3: "NE", 4: "NE", 5: "NE", 6: "NE", 7: "NE", 8: 20, 9: 19, 10: 18, 11: 17, 12: 16, 13: 15, 14: 14, 15: 13, 16: 12, 17: 11, 18: 10 }
};

export const WEAPON_CLASS_TABLE = {
  1: "Clubs, hammers, lances, maces, spears",
  2: "Axes, daggers, flails, morning stars",
  3: "Pole arms, swords",
  4: "Vibro dagger",
  5: "Vibro blade, energy mace",
  6: "Stun whip",
  7: "Robotic tentacles",
  8: "Grenades, javelins",
  9: "Arrows, crossbow bolts, sling projectiles",
  10: "Pistol slugs",
  11: "Needler",
  12: "Stun ray pistols and rifles",
  13: "Laser pistols and rifles",
  14: "Mk V blaster and Mk VII rifle",
  15: "Black ray pistol",
  16: "Fusion rifle, micro missile, mini missile"
};

export const WEAPON_DAMAGE_TABLE = {
  arrow:             { small: "1d6",     large: "1d6",     effectiveRange: 100 },
  "axe-battle":      { small: "1d8",     large: "1d8",     effectiveRange: 0 },
  "axe-hand":        { small: "1d6",     large: "1d4",     effectiveRange: 20 },
  club:              { small: "1d6",     large: "1d3",     effectiveRange: 10 },
  "crossbow-bolt":   { small: "1d4",     large: "1d4",     effectiveRange: 120 },
  dagger:            { small: "1d4",     large: "1d3",     effectiveRange: 20 },
  flail:             { small: "2d4-1",   large: "2d4",     effectiveRange: 0 },
  javelin:           { small: "1d6",     large: "1d6",     effectiveRange: 40 },
  "lance-mounted":   { small: "1d6",     large: "1d10",    effectiveRange: 0 },
  mace:              { small: "2d4-1",   large: "1d6",     effectiveRange: 0 },
  "morning-star":    { small: "2d4",     large: "2d4-1",   effectiveRange: 0 },
  "pole-arm":        { small: "1d8",     large: "1d12",    effectiveRange: 0 },
  "sling-bullet":    { small: "1d4+1",   large: "2d4-1",   effectiveRange: 100 },
  "sling-stone":     { small: "1d4",     large: "1d4",     effectiveRange: 80 },
  spear:             { small: "1d6",     large: "1d8",     effectiveRange: 20 },
  "sword-long":      { small: "1d8",     large: "1d12",    effectiveRange: 0 },
  "sword-short":     { small: "1d6",     large: "1d8",     effectiveRange: 0 },
  "sword-two-hand":  { small: "1d10",    large: "3d6",     effectiveRange: 0 }
};

function clampArmorClass(ac) {
  return Math.max(1, Math.min(10, Math.round(Number(ac) || 10)));
}

function clampMentalStrength(ms) {
  return Math.max(3, Math.min(18, Math.round(Number(ms) || 3)));
}

/**
 * Compute the d20 target needed for a weapon attack.
 */
export function weaponAttackTarget(weaponClass, armorClass) {
  const wc = Math.max(1, Math.min(16, Math.round(Number(weaponClass) || 1)));
  const ac = clampArmorClass(armorClass);
  return PHYSICAL_ATTACK_MATRIX_I[ac]?.[wc] ?? 20;
}

/**
 * Convert hit dice / level to the nearest GW1e creature bucket.
 */
export function hitDiceBucket(hitDice) {
  const hd = Math.max(1, Math.round(Number(hitDice) || 1));
  if (hd === 1) return "1";
  if (hd <= 3) return "2-3";
  if (hd <= 5) return "4-5";
  if (hd <= 8) return "6-8";
  if (hd <= 10) return "9-10";
  if (hd <= 14) return "11-14";
  return "15+";
}

/**
 * Compute the d20 target for natural / unarmed attacks.
 */
export function naturalAttackTarget(hitDice, armorClass) {
  const ac = clampArmorClass(armorClass);
  return PHYSICAL_ATTACK_MATRIX_II[ac]?.[hitDiceBucket(hitDice)] ?? 20;
}

/**
 * Compute the target result for mental combat.
 *
 * Returns:
 * - integer target on d20
 * - "A" for automatic success
 * - "NE" for impossible / no effect
 */
export function mentalAttackTarget(attackerMentalStrength, defenderMentalStrength) {
  const attacker = clampMentalStrength(attackerMentalStrength);
  const defender = clampMentalStrength(defenderMentalStrength);
  return MENTAL_ATTACK_MATRIX[defender]?.[attacker] ?? 20;
}

