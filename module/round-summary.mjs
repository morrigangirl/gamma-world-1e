/**
 * 0.14.17 — Combat round summary card.
 *
 * On every round advance, a GM-whispered chat card lists the
 * initiative order, current HP, and fatigue level for each combatant.
 * Helps the GM catch up after a session pause and gives a snapshot
 * of "who's hurting" at a glance.
 *
 * Pure helper `buildRoundSummaryRows(combat)` is unit-testable; the
 * async `postCombatRoundSummary(combat)` wires it to `ChatMessage`.
 */

import { SYSTEM_ID } from "./config.mjs";

/**
 * Pure: build the per-combatant rows for a round summary card.
 * Returns an array of `{ initiative, name, hp, hpMax, fatigue,
 * defeated }` objects in the same order Foundry surfaces via
 * `combat.turns`. The caller renders the array as HTML.
 *
 * @param {{turns: Array}} combat
 * @returns {Array<{initiative: string|number, name: string, hp: number, hpMax: number, fatigue: number, defeated: boolean}>}
 */
export function buildRoundSummaryRows(combat) {
  const rows = [];
  const turns = Array.isArray(combat?.turns) ? combat.turns : [];
  for (const c of turns) {
    const actor = c?.actor;
    if (!actor) continue;
    rows.push({
      initiative: c.initiative ?? "—",
      name: actor.name ?? "(unknown)",
      hp:    Number(actor.system?.resources?.hp?.value ?? 0) || 0,
      hpMax: Number(actor.system?.resources?.hp?.max   ?? 0) || 0,
      fatigue: Number(actor.system?.combat?.fatigue?.round ?? 0) || 0,
      defeated: !!(c.isDefeated || c.defeated)
    });
  }
  return rows;
}

/**
 * Build the HTML body of the round-summary card from the rows + the
 * round number. Pure (no Foundry globals).
 */
export function renderRoundSummaryHtml(rows, round) {
  const r = Math.max(1, Number(round) || 1);
  const items = rows.map((row) => {
    const hpFrac = row.hpMax > 0 ? Math.max(0, Math.min(1, row.hp / row.hpMax)) : 0;
    const hpClass = row.defeated ? "gw-round-summary__row--defeated"
      : (hpFrac <= 0.5 ? "gw-round-summary__row--bloodied" : "");
    const fatigueTag = row.fatigue > 0 ? ` · F-${row.fatigue}` : "";
    const defeatedTag = row.defeated ? " · defeated" : "";
    const escName = String(row.name).replace(/[<>&"]/g, (ch) => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;"
    })[ch]);
    return `<li class="gw-round-summary__row ${hpClass}"><span class="gw-round-summary__init">${row.initiative}</span> <strong>${escName}</strong> — HP ${row.hp}/${row.hpMax}${fatigueTag}${defeatedTag}</li>`;
  }).join("");
  return `<div class="gw-chat-card gw-round-summary"><h3>Round ${r}</h3><ul class="gw-round-summary__list">${items}</ul></div>`;
}

/**
 * Async: build + post a GM-whispered round summary card. Returns the
 * created ChatMessage (or null when nothing was posted — empty combat
 * or setting disabled).
 */
export async function postCombatRoundSummary(combat) {
  if (typeof globalThis.ChatMessage?.create !== "function") return null;
  if (!combat?.combatants) return null;
  let enabled = true;
  try { enabled = !!game.settings.get(SYSTEM_ID, "combatRoundSummary"); } catch { /* default on */ }
  if (!enabled) return null;

  const rows = buildRoundSummaryRows(combat);
  if (!rows.length) return null;

  const round = Number(combat.round) || 1;
  const content = renderRoundSummaryHtml(rows, round);
  const whisperIds = (game.users?.filter?.((u) => u.isGM) ?? []).map((u) => u.id);
  return ChatMessage.create({ content, whisper: whisperIds });
}
