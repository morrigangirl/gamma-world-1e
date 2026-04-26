/**
 * 0.14.6 — Encounter-close summary card.
 *
 * Fires once when a combat is deleted (`deleteCombat` hook). Tallies
 * defeated monster combatants, sums their XP awards, identifies PC
 * participants, and posts a GM-whisper chat card with two button
 * groups:
 *
 *   - Distribute XP — splits the total evenly across PCs in the
 *     encounter and calls `awardXp` for each. One-shot button (the
 *     card flips a flag so re-clicks no-op).
 *
 *   - Roll Loot — one button per defeated monster that has a non-empty
 *     `system.details.lootTable`. Rolling a button posts the table's
 *     result publicly (or whispered, depending on the table's draw
 *     mode) and marks the monster's row as "rolled" so accidental
 *     double-clicks no-op.
 *
 * Posting is gated behind the `encounterCloseSummary` setting (default
 * true). GMs that prefer manual XP/loot can disable.
 */

import { SYSTEM_ID } from "./config.mjs";
import { awardXp, xpAwardForDefeated } from "./experience.mjs";

/**
 * @param {Combat} combat — the just-deleted combat document
 */
export async function postEncounterCloseSummary(combat) {
  if (!combat?.combatants) return;
  const defeated = collectDefeatedMonsters(combat);
  const pcs      = collectPCs(combat);
  const totalXp  = defeated.reduce((sum, row) => sum + row.xp, 0);
  if (defeated.length === 0 && pcs.length === 0) return;

  const perPc = pcs.length > 0 ? Math.floor(totalXp / pcs.length) : 0;
  const remainder = pcs.length > 0 ? totalXp - (perPc * pcs.length) : totalXp;

  const flagId = foundry?.utils?.randomID?.() ?? `enc-${Date.now()}`;
  const cardData = {
    flagId,
    totalXp,
    perPc,
    remainder,
    pcIds: pcs.map((p) => p.uuid),
    defeated: defeated.map((row) => ({
      uuid:       row.actor.uuid,
      name:       row.actor.name,
      xp:         row.xp,
      lootTable:  row.lootTable
    })),
    distributed: false,
    lootRolled:  []   // monster uuids whose loot has already been rolled
  };

  const ChatMessageClass = globalThis.ChatMessage ?? foundry?.documents?.ChatMessage;
  if (!ChatMessageClass) return;

  const html = renderEncounterCloseHtml(cardData);
  const speakerName = game.i18n?.localize?.("GAMMA_WORLD.Encounter.Close.Speaker") ?? "Encounter";
  await ChatMessageClass.create({
    speaker: { alias: speakerName },
    whisper: ChatMessageClass.getWhisperRecipients?.("GM") ?? [],
    content: html,
    flags: { [SYSTEM_ID]: { encounterClose: cardData } }
  });
}

function collectDefeatedMonsters(combat) {
  const rows = [];
  for (const combatant of combat.combatants.contents) {
    const actor = combatant.actor;
    if (!actor || actor.type !== "monster") continue;
    const hp = Number(actor.system?.resources?.hp?.value ?? 0);
    // Defeated = HP ≤ 0 OR explicitly marked defeated on the combatant.
    const isDefeated = hp <= 0 || !!combatant.defeated;
    if (!isDefeated) continue;
    const xp = xpAwardForDefeated(actor);
    const lootTable = String(actor.system?.details?.lootTable ?? "").trim();
    rows.push({ actor, xp, lootTable });
  }
  return rows;
}

function collectPCs(combat) {
  const out = [];
  for (const combatant of combat.combatants.contents) {
    const actor = combatant.actor;
    if (!actor || actor.type !== "character") continue;
    out.push(actor);
  }
  return out;
}

function renderEncounterCloseHtml(data) {
  const localize = (key, fb) => {
    const out = game.i18n?.localize?.(key);
    return (out && out !== key) ? out : (fb ?? key);
  };
  const heading = localize("GAMMA_WORLD.Encounter.Close.Heading", "Encounter resolved");
  const xpHeading = localize("GAMMA_WORLD.Encounter.Close.XpHeading", "Experience");
  const distributeLabel = localize("GAMMA_WORLD.Encounter.Close.Distribute", "Distribute XP");
  const lootHeading = localize("GAMMA_WORLD.Encounter.Close.LootHeading", "Loot");
  const rollLootLabel = localize("GAMMA_WORLD.Encounter.Close.RollLoot", "Roll");

  const lines = [`<div class="gw-chat-card gw-encounter-close" data-flag="${escapeHtml(data.flagId)}">`,
                 `<h3>${escapeHtml(heading)}</h3>`];

  // XP block
  lines.push(`<section class="gw-encounter-close__xp"><h4>${escapeHtml(xpHeading)}</h4>`);
  if (data.defeated.length > 0) {
    lines.push("<ul>");
    for (const row of data.defeated) {
      lines.push(`<li>${escapeHtml(row.name)} — ${row.xp} XP</li>`);
    }
    lines.push("</ul>");
    lines.push(`<p><strong>Total: ${data.totalXp} XP</strong>` +
               (data.pcIds.length > 0
                 ? ` → ${data.pcIds.length} PC${data.pcIds.length === 1 ? "" : "s"} × ${data.perPc}` +
                   (data.remainder > 0 ? ` (+${data.remainder} extra to first PC)` : "")
                 : ` (no PCs in encounter)`) + `</p>`);
    if (data.pcIds.length > 0) {
      lines.push(`<button type="button" data-action="distributeEncounterXp" data-flag-id="${escapeHtml(data.flagId)}">${escapeHtml(distributeLabel)}</button>`);
    }
  } else {
    lines.push(`<p><em>${escapeHtml(localize("GAMMA_WORLD.Encounter.Close.NoDefeated", "No monsters defeated."))}</em></p>`);
  }
  lines.push("</section>");

  // Loot block
  const lootRows = data.defeated.filter((row) => row.lootTable);
  if (lootRows.length > 0) {
    lines.push(`<section class="gw-encounter-close__loot"><h4>${escapeHtml(lootHeading)}</h4>`);
    lines.push("<ul>");
    for (const row of lootRows) {
      lines.push(`<li>${escapeHtml(row.name)} — ` +
                 `<button type="button" data-action="rollEncounterLoot" data-flag-id="${escapeHtml(data.flagId)}" data-actor-uuid="${escapeHtml(row.uuid)}" data-loot-table="${escapeHtml(row.lootTable)}">${escapeHtml(rollLootLabel)}</button>` +
                 `</li>`);
    }
    lines.push("</ul></section>");
  }

  lines.push("</div>");
  return lines.join("");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* ------------------------------------------------------------------ */
/* Chat-card click handlers                                            */
/* ------------------------------------------------------------------ */

/**
 * Wire up the chat card's button handlers. Called from `module/hooks.mjs`
 * `renderChatLog` so every rendered chat card gets its buttons activated.
 */
export function registerEncounterCloseChatHandlers(rootElement) {
  if (!rootElement) return;
  rootElement.querySelectorAll('[data-action="distributeEncounterXp"]').forEach((btn) => {
    btn.addEventListener("click", onDistributeXp);
  });
  rootElement.querySelectorAll('[data-action="rollEncounterLoot"]').forEach((btn) => {
    btn.addEventListener("click", onRollLoot);
  });
}

async function onDistributeXp(event) {
  event.preventDefault();
  if (!game.user?.isGM) {
    ui.notifications?.warn("Only the GM can distribute encounter XP.");
    return;
  }
  const button = event.currentTarget;
  const flagId = button.dataset.flagId;
  const message = findEncounterCloseMessage(flagId);
  if (!message) return;
  const data = message.flags?.[SYSTEM_ID]?.encounterClose;
  if (!data || data.distributed) {
    ui.notifications?.info("XP already distributed.");
    return;
  }

  let bonusForFirst = data.remainder ?? 0;
  for (let i = 0; i < data.pcIds.length; i++) {
    const uuid = data.pcIds[i];
    const actor = await fromUuid(uuid);
    if (!actor) continue;
    const award = data.perPc + (i === 0 ? bonusForFirst : 0);
    if (award > 0) await awardXp(actor, award, { source: "encounter" });
  }

  // Mark the card distributed so re-clicks no-op.
  await message.update({
    [`flags.${SYSTEM_ID}.encounterClose.distributed`]: true
  });
  // Disable the button visually on the just-clicked element.
  button.setAttribute("disabled", "true");
  button.textContent = `${button.textContent} ✓`;
  ui.notifications?.info(`Distributed ${data.totalXp} XP across ${data.pcIds.length} PC(s).`);
}

async function onRollLoot(event) {
  event.preventDefault();
  if (!game.user?.isGM) {
    ui.notifications?.warn("Only the GM can roll encounter loot.");
    return;
  }
  const button = event.currentTarget;
  const flagId = button.dataset.flagId;
  const lootTableUuid = button.dataset.lootTable;
  const actorUuid = button.dataset.actorUuid;
  const message = findEncounterCloseMessage(flagId);
  if (!message) return;
  const data = message.flags?.[SYSTEM_ID]?.encounterClose;
  if (data?.lootRolled?.includes(actorUuid)) {
    ui.notifications?.info("Loot already rolled for that monster.");
    return;
  }

  // Resolve the table (UUID-style or by name within world tables).
  let table = null;
  try { table = await fromUuid(lootTableUuid); } catch (_e) { table = null; }
  if (!table || table.documentName !== "RollTable") {
    ui.notifications?.warn(`Loot table not found: ${lootTableUuid}`);
    return;
  }

  await table.draw({ rollMode: "gmroll" });

  // Update the card's flag to record the roll, so the button can be marked done.
  const nextRolled = Array.isArray(data?.lootRolled) ? [...data.lootRolled, actorUuid] : [actorUuid];
  await message.update({
    [`flags.${SYSTEM_ID}.encounterClose.lootRolled`]: nextRolled
  });
  button.setAttribute("disabled", "true");
  button.textContent = `${button.textContent} ✓`;
}

function findEncounterCloseMessage(flagId) {
  if (!flagId) return null;
  for (const msg of game.messages?.contents ?? []) {
    if (msg.flags?.[SYSTEM_ID]?.encounterClose?.flagId === flagId) return msg;
  }
  return null;
}
