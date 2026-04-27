/**
 * 0.14.17 — Token decoration: fatigue level overlay.
 *
 * When an actor's `system.combat.fatigue.round` is positive, the
 * token gets a small "F-N" badge in the top-right corner. Cleared
 * when fatigue returns to 0. Setting-gated.
 *
 * Pure helper `fatigueOverlayText(fatigue)` is unit-testable; the
 * `attachFatigueOverlay(token)` wrapper does the PIXI work and is
 * called from the `refreshToken` hook.
 */

import { SYSTEM_ID } from "./config.mjs";

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

/**
 * Pure: returns the badge label for a given fatigue round count, or
 * null when no badge should render. Used by tests and by the live
 * overlay attachment below.
 *
 * @param {number|string|null|undefined} fatigue
 * @returns {string|null}
 */
export function fatigueOverlayText(fatigue) {
  const n = Math.max(0, Math.floor(Number(fatigue) || 0));
  if (n <= 0) return null;
  return `F-${n}`;
}

/**
 * Attach / update / remove the fatigue overlay on a Foundry Token
 * during its `refreshToken` lifecycle. Safe to call when PIXI isn't
 * available (returns silently). Idempotent — repeated calls reuse
 * the same PIXI.Text instance.
 *
 * @param {object} token  Foundry Token instance
 */
export function attachFatigueOverlay(token) {
  if (!token || typeof token.addChild !== "function") return;
  const actor = token.actor;
  if (!actor) return;
  if (!["character", "monster"].includes(actor.type)) return;

  // Setting-gate first so the badge is removed when the GM disables
  // the feature mid-session.
  let enabled = true;
  try { enabled = !!game.settings.get(SYSTEM_ID, "tokenFatigueOverlay"); } catch { /* default on */ }

  const fatigue = Number(actor.system?.combat?.fatigue?.round ?? 0) || 0;
  const label = enabled ? fatigueOverlayText(fatigue) : null;
  const existing = token[FATIGUE_TEXT_KEY] ?? null;

  if (!label) {
    if (existing) {
      try {
        token.removeChild(existing);
        existing.destroy?.({ children: true });
      } catch { /* swallow — token may be mid-tear-down */ }
      token[FATIGUE_TEXT_KEY] = null;
    }
    return;
  }

  const PIXI = globalThis.PIXI;
  if (!PIXI?.Text) return;

  let textNode = existing;
  if (!textNode) {
    textNode = new PIXI.Text(label, new PIXI.TextStyle(FATIGUE_TEXT_STYLE));
    textNode.anchor?.set?.(1, 0);
    token[FATIGUE_TEXT_KEY] = textNode;
    token.addChild(textNode);
  } else if (textNode.text !== label) {
    textNode.text = label;
  }

  // Position to top-right corner. `token.w` is grid-units * size.
  const pad = 4;
  textNode.x = (token.w ?? 100) - pad;
  textNode.y = pad;
}
