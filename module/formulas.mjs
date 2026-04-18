/**
 * Small helpers for manipulating simple dice formulas such as `1d8+2`.
 * Gamma World mostly uses compact single-term formulas, so we keep the
 * parser intentionally narrow and fall back cleanly when a formula is exotic.
 */

const SIMPLE_DICE_RE = /^\s*(\d*)d(\d+)([+-]\d+)?\s*$/i;

export function parseSimpleDiceFormula(formula) {
  const match = SIMPLE_DICE_RE.exec(String(formula ?? ""));
  if (!match) return null;

  const [, rawCount, rawFaces, rawModifier] = match;
  return {
    count: Number(rawCount || 1),
    faces: Number(rawFaces),
    modifier: Number(rawModifier || 0)
  };
}

export function formatSimpleDiceFormula({ count, faces, modifier = 0 }) {
  const safeCount = Math.max(1, Math.round(Number(count) || 1));
  const safeFaces = Math.max(2, Math.round(Number(faces) || 6));
  const safeModifier = Math.round(Number(modifier) || 0);
  const suffix = safeModifier === 0 ? "" : safeModifier > 0 ? `+${safeModifier}` : `${safeModifier}`;
  return `${safeCount}d${safeFaces}${suffix}`;
}

export function addDiceToFormula(formula, extraDice = 0) {
  const parsed = parseSimpleDiceFormula(formula);
  if (!parsed) return formula;
  parsed.count += Math.max(0, Math.round(Number(extraDice) || 0));
  return formatSimpleDiceFormula(parsed);
}

export function addFlatBonusToFormula(formula, flatBonus = 0) {
  const parsed = parseSimpleDiceFormula(formula);
  if (!parsed) {
    const bonus = Math.round(Number(flatBonus) || 0);
    if (!bonus) return formula;
    return `(${formula})${bonus > 0 ? "+" : ""}${bonus}`;
  }

  parsed.modifier += Math.round(Number(flatBonus) || 0);
  return formatSimpleDiceFormula(parsed);
}

export function addPerDieBonusToFormula(formula, bonusPerDie = 0) {
  const parsed = parseSimpleDiceFormula(formula);
  if (!parsed) return formula;
  parsed.modifier += parsed.count * Math.round(Number(bonusPerDie) || 0);
  return formatSimpleDiceFormula(parsed);
}

export function scaleFormula(formula, multiplier = 1) {
  const parsed = parseSimpleDiceFormula(formula);
  if (!parsed) return formula;

  const scale = Math.max(1, Math.round(Number(multiplier) || 1));
  parsed.count *= scale;
  parsed.modifier *= scale;
  return formatSimpleDiceFormula(parsed);
}

/**
 * Double the dice count of every `NdM` term in a compound formula. Flat
 * bonuses and keep-high/explode suffixes are left untouched — this implements
 * the standard 5e-style crit convention where dice (but not static
 * modifiers) are doubled. Accepts multi-term formulas like `2d6+1d4+3`.
 */
export function doubleDiceInFormula(formula) {
  if (formula == null) return formula;
  const str = String(formula);
  if (!str) return str;
  return str.replace(/(\d*)d(\d+)/gi, (_, countStr, facesStr) => {
    const count = Math.max(1, Number(countStr || 1));
    return `${count * 2}d${facesStr}`;
  });
}
