/**
 * 0.14.17 / 0.14.21 — Token decorations.
 *
 * The system adds three optional badges to a Foundry Token, each
 * setting-gated:
 *   - **Fatigue (top-right)** — "F-N" when fatigue.round > 0.
 *   - **HP (top-left)** — current/max as either fraction or percentage,
 *     tinted by remaining HP.
 *   - **AC (bottom-left)** — small AC value pill (descending, tier-tinted).
 *
 * Pure helpers are unit-tested; the `attach*Overlay(token)` wrappers
 * do the PIXI work and are called from the `refreshToken` hook.
 */

import { SYSTEM_ID } from "./config.mjs";

/* ------------------------------------------------------------------ */
/* Common — text-decoration utility                                   */
/* ------------------------------------------------------------------ */

function makeTextNode(label, style) {
  const PIXI = globalThis.PIXI;
  if (!PIXI?.Text) return null;
  return new PIXI.Text(label, new PIXI.TextStyle(style));
}

/**
 * Internal: maintain a named PIXI.Text child on a token under
 * `token[key]`. Removes it when `label` is null. Updates in place
 * when the label or style changes.
 *
 * @returns {object|null} the PIXI.Text node, or null when none.
 */
function maintainBadge(token, key, label, baseStyle, anchor, position) {
  const existing = token[key] ?? null;

  if (!label) {
    if (existing) {
      try {
        token.removeChild(existing);
        existing.destroy?.({ children: true });
      } catch { /* swallow — token may be mid-tear-down */ }
      token[key] = null;
    }
    return null;
  }

  let node = existing;
  if (!node) {
    node = makeTextNode(label, baseStyle);
    if (!node) return null;
    node.anchor?.set?.(anchor.x, anchor.y);
    token[key] = node;
    token.addChild(node);
  } else {
    if (node.text !== label) node.text = label;
    // Re-apply style fill in case HP color tier crossed a threshold.
    if (node.style) {
      node.style.fill = baseStyle.fill;
    }
  }

  node.x = position.x;
  node.y = position.y;
  return node;
}

/* ------------------------------------------------------------------ */
/* Fatigue badge (0.14.17)                                            */
/* ------------------------------------------------------------------ */

const FATIGUE_TEXT_KEY = "_gwFatigueOverlay";
const FATIGUE_TEXT_STYLE = {
  fontFamily: "Signika, sans-serif",
  fontSize: 18,
  fontWeight: "bold",
  fill: 0xffaa44,
  stroke: 0x000000,
  strokeThickness: 4,
  align: "right"
};

export function fatigueOverlayText(fatigue) {
  const n = Math.max(0, Math.floor(Number(fatigue) || 0));
  if (n <= 0) return null;
  return `F-${n}`;
}

export function attachFatigueOverlay(token) {
  if (!token || typeof token.addChild !== "function") return;
  const actor = token.actor;
  if (!actor) return;
  if (!["character", "monster"].includes(actor.type)) return;

  let enabled = true;
  try { enabled = !!game.settings.get(SYSTEM_ID, "tokenFatigueOverlay"); } catch { /* default on */ }

  const fatigue = Number(actor.system?.combat?.fatigue?.round ?? 0) || 0;
  const label = enabled ? fatigueOverlayText(fatigue) : null;

  const pad = 4;
  maintainBadge(token, FATIGUE_TEXT_KEY, label, FATIGUE_TEXT_STYLE,
    { x: 1, y: 0 },                 // anchor top-right
    { x: (token.w ?? 100) - pad, y: pad });
}

/* ------------------------------------------------------------------ */
/* HP badge (0.14.21)                                                 */
/* ------------------------------------------------------------------ */

const HP_TEXT_KEY = "_gwHpOverlay";

/**
 * Pure: format the HP overlay label for a given style.
 *
 * @param {number} value  current HP
 * @param {number} max    max HP
 * @param {"fraction"|"percent"} mode
 * @returns {string|null}
 */
export function hpOverlayText(value, max, mode = "fraction") {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  const m = Math.max(0, Math.floor(Number(max) || 0));
  if (m <= 0) return null;
  if (mode === "percent") {
    const pct = Math.min(100, Math.max(0, Math.round((v / m) * 100)));
    return `${pct}%`;
  }
  return `${v}/${m}`;
}

/**
 * Pure: pick the tint for a given HP fraction.
 *   >= 75% → green
 *   25-75% → amber
 *   1-25%  → red
 *   <= 0   → dark red
 */
export function hpOverlayTint(value, max) {
  const m = Math.max(0, Math.floor(Number(max) || 0));
  if (m <= 0) return 0xcccccc;
  const v = Math.max(0, Math.floor(Number(value) || 0));
  const frac = v / m;
  if (v <= 0) return 0x801010;
  if (frac <= 0.25) return 0xee4444;
  if (frac <= 0.75) return 0xeebb44;
  return 0x66cc66;
}

export function attachHpOverlay(token) {
  if (!token || typeof token.addChild !== "function") return;
  const actor = token.actor;
  if (!actor) return;
  if (!["character", "monster"].includes(actor.type)) return;

  let enabled = false;
  let mode = "fraction";
  try { enabled = !!game.settings.get(SYSTEM_ID, "tokenHpOverlay"); } catch { /* default off */ }
  try { mode = String(game.settings.get(SYSTEM_ID, "tokenHpOverlayMode") || "fraction"); } catch { /* default fraction */ }

  const hp = actor.system?.resources?.hp ?? {};
  const value = Number(hp.value ?? 0) || 0;
  const max = Number(hp.max ?? 0) || 0;
  const label = enabled ? hpOverlayText(value, max, mode) : null;
  const tint = hpOverlayTint(value, max);

  const style = {
    fontFamily: "Signika, sans-serif",
    fontSize: 16,
    fontWeight: "bold",
    fill: tint,
    stroke: 0x000000,
    strokeThickness: 4,
    align: "left"
  };
  const pad = 4;
  maintainBadge(token, HP_TEXT_KEY, label, style,
    { x: 0, y: 0 },                 // anchor top-left
    { x: pad, y: pad });
}

/* ------------------------------------------------------------------ */
/* AC badge (0.14.21)                                                 */
/* ------------------------------------------------------------------ */

const AC_TEXT_KEY = "_gwAcOverlay";

/**
 * Pure: format the AC overlay label. GW1e uses descending AC (lower
 * = better armor), so we prefix with "AC" to make the meaning obvious
 * to players who might mistake it for d20-style ascending AC.
 */
export function acOverlayText(ac) {
  if (ac == null) return null;
  const n = Math.floor(Number(ac));
  if (!Number.isFinite(n)) return null;
  return `AC ${n}`;
}

/**
 * Pure: pick the tint for a descending-AC value.
 *   AC <= 3  → green   (heavy armor / impressive)
 *   AC 4-6   → amber
 *   AC 7-9   → orange
 *   AC >= 10 → red     (unarmored)
 */
export function acOverlayTint(ac) {
  const n = Number(ac);
  if (!Number.isFinite(n)) return 0xcccccc;
  if (n <= 3) return 0x66cc66;
  if (n <= 6) return 0xeebb44;
  if (n <= 9) return 0xee9944;
  return 0xee4444;
}

export function attachAcOverlay(token) {
  if (!token || typeof token.addChild !== "function") return;
  const actor = token.actor;
  if (!actor) return;
  if (!["character", "monster"].includes(actor.type)) return;

  let enabled = false;
  try { enabled = !!game.settings.get(SYSTEM_ID, "tokenAcOverlay"); } catch { /* default off */ }

  const ac = Number(actor.system?.resources?.ac ?? actor.gw?.ac ?? NaN);
  const label = enabled && Number.isFinite(ac) ? acOverlayText(ac) : null;
  const tint = acOverlayTint(ac);

  const style = {
    fontFamily: "Signika, sans-serif",
    fontSize: 14,
    fontWeight: "bold",
    fill: tint,
    stroke: 0x000000,
    strokeThickness: 3,
    align: "left"
  };
  const pad = 4;
  maintainBadge(token, AC_TEXT_KEY, label, style,
    { x: 0, y: 1 },                 // anchor bottom-left
    { x: pad, y: (token.h ?? 100) - pad });
}

/* ------------------------------------------------------------------ */
/* Convenience: attach all enabled overlays at once.                  */
/* ------------------------------------------------------------------ */

export function attachTokenOverlays(token) {
  attachFatigueOverlay(token);
  attachHpOverlay(token);
  attachAcOverlay(token);
}
