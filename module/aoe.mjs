/**
 * Area-of-effect orchestration for grenades, bombs, and persistent clouds.
 *
 * The flow:
 *   1. `useAoeOrdnance(actor, item)` is the single entry point (wired from
 *      `useGear`). It places a MeasuredTemplate, fires the configured
 *      animation, enumerates affected tokens, and posts a consolidated save
 *      card with one row per target.
 *   2. Each row's "Roll Save" button routes through `requestSaveResolution`.
 *      PCs see a dialog via the existing owner-preference routing; NPCs
 *      auto-roll via the GM. The row's result cell is updated after the save
 *      resolves.
 *   3. On failed save (or save-not-required), damage is applied to that
 *      target and, if the item specifies `onFailStatus`, a timed Active
 *      Effect is added using the item's `durationFormula` (if any).
 *   4. Persistent clouds (`persistentRounds > 0`) keep the MeasuredTemplate
 *      alive for N combat rounds; the tick hook cleans them up when expired.
 *
 * Reuses:
 *   - `requestSaveResolution` (dice.mjs) — PC dialog vs GM auto-roll split.
 *   - `applyIncomingDamage` (effect-state.mjs) — HP/AC guarded apply step.
 *   - `applyTemporaryEffect` (effect-state.mjs) — timed status AE.
 *   - `playAreaEffect` (animations.mjs) — JB2A animation filling the template.
 */

import { SYSTEM_ID } from "./config.mjs";
import {
  applyIncomingDamage,
  applyTemporaryEffect
} from "./effect-state.mjs";

/** Foundry MeasuredTemplate `t` codes keyed by our canonical shape names. */
const SHAPE_T = { circle: "circle", cone: "cone", line: "ray" };

/** Thin wrapper around the v13 template renderer. */
async function renderTemplate(path, data) {
  return foundry.applications.handlebars.renderTemplate(path, data);
}

/** Resolve an actor from its UUID, tolerating token-placed actors. */
async function resolveActorFromUuid(uuid) {
  if (!uuid) return null;
  const document = await fromUuid(uuid);
  if (!document) return null;
  if (document instanceof Actor) return document;
  if (document.actor instanceof Actor) return document.actor;
  return null;
}

/** Resolve a token document or placeable from its UUID. */
async function resolveTokenFromUuid(uuid) {
  if (!uuid) return null;
  try {
    const document = await fromUuid(uuid);
    return document?.object ?? document ?? null;
  } catch (_error) {
    return null;
  }
}

/** Does this gear item describe an AOE that our system should orchestrate? */
export function itemHasAoeArea(item) {
  const area = item?.system?.area;
  if (!area) return false;
  return Number(area.radius ?? 0) > 0;
}

/** Persistent-round default from settings, respecting per-item override. */
function resolvePersistentRounds(item) {
  const own = Number(item?.system?.area?.persistentRounds ?? 0);
  if (own > 0) return own;
  try {
    const defaulted = Number(game.settings?.get(SYSTEM_ID, "grenadePersistentRounds") ?? 0);
    return Math.max(0, defaulted);
  } catch (_error) {
    return 0;
  }
}

/**
 * Interactive MeasuredTemplate placement. Waits for the user to click the
 * canvas; returns the created template document (or null if canceled).
 * Uses a simple click-once handler — no live preview, but the template
 * appears immediately at the click location and the user can drag-adjust.
 */
export async function placeAoeTemplate(actor, item) {
  const scene = canvas?.scene;
  if (!scene) {
    ui.notifications?.warn("No active scene to place the template on.");
    return null;
  }

  const area = item.system.area ?? {};
  const distance = Number(area.radius ?? 0);
  if (!distance) return null;

  const shape = area.shape || "circle";
  const t = SHAPE_T[shape] ?? "circle";
  const persistentRounds = resolvePersistentRounds(item);

  ui.notifications?.info(`Click to place ${item.name}.`);

  return new Promise((resolve) => {
    const stage = canvas.stage;
    const handler = async (event) => {
      stage?.off?.("pointerdown", handler);
      const raw = event?.data?.getLocalPosition?.(canvas.templates ?? canvas.stage)
        ?? { x: 0, y: 0 };

      const gridSize = scene.grid?.size ?? 100;
      const gridUnits = scene.grid?.distance ?? 1;
      // Convert world meters (grid units) into pixel distance the Foundry
      // template wants. distance is in grid units, not pixels, so this is a
      // pure passthrough.
      const templateDistance = distance / Math.max(0.0001, gridUnits) * gridUnits;

      try {
        const created = await foundry.documents.MeasuredTemplateDocument.createDocuments([{
          t,
          user: game.user?.id ?? null,
          x: raw.x,
          y: raw.y,
          distance: templateDistance,
          direction: 0,
          fillColor: game.user?.color ?? "#ff8800",
          flags: {
            [SYSTEM_ID]: {
              aoe: {
                itemUuid: item.uuid,
                actorUuid: actor.uuid,
                persistentRounds,
                expiresOnRound: null,
                placedAtRound: Number(game.combat?.round ?? 0),
                gridSize
              }
            }
          }
        }], { parent: scene });
        resolve(created?.[0] ?? null);
      } catch (error) {
        console.warn(`${SYSTEM_ID} | placing AOE template failed`, error);
        ui.notifications?.error("Could not place the area template.");
        resolve(null);
      }
    };

    stage?.once?.("pointerdown", handler) ?? stage?.on?.("pointerdown", handler);
  });
}

/**
 * Return every token whose center is inside the template's geometry.
 * Safely no-ops when the template or canvas are unavailable.
 */
export function enumerateTargetsInTemplate(templateDoc) {
  if (!templateDoc) return [];
  const placeables = canvas?.tokens?.placeables ?? [];
  if (!placeables.length) return [];

  const templateObject = templateDoc.object ?? canvas.templates?.get?.(templateDoc.id);
  if (!templateObject) return [];

  const matched = [];
  for (const token of placeables) {
    if (!token?.actor) continue;
    const centerX = token.center?.x ?? (token.x + (token.w ?? token.document?.width ?? 0) / 2);
    const centerY = token.center?.y ?? (token.y + (token.h ?? token.document?.height ?? 0) / 2);
    const localX = centerX - templateObject.x;
    const localY = centerY - templateObject.y;

    let inside = false;
    try {
      inside = typeof templateObject.shape?.contains === "function"
        ? templateObject.shape.contains(localX, localY)
        : typeof templateObject.containsPoint === "function"
          ? templateObject.containsPoint({ x: centerX, y: centerY })
          : false;
    } catch (_error) {
      inside = false;
    }
    if (inside) matched.push(token);
  }
  return matched;
}

/**
 * Persist the aoe flag that links a chat card to the template + targets.
 * Returns the created ChatMessage (or null if the card couldn't be posted).
 */
export async function postAoeSaveCard({
  actor,
  item,
  templateDoc,
  targets,
  damageFormula,
  damageRoll
}) {
  const saveType = item.system.area?.saveType || "";
  const onFailStatus = item.system.area?.onFailStatus || "";
  const halfDamageOnSave = !!item.system.area?.halfDamageOnSave;
  const durationFormula = item.system.action?.durationFormula || "";

  const rowTargets = targets.map((token) => {
    const a = token.actor;
    return {
      name: a.name,
      isPlayerOwned: !!a.hasPlayerOwner,
      actorUuid: a.uuid,
      tokenUuid: token.document?.uuid ?? null,
      status: "pending",
      resultText: ""
    };
  });

  const content = await renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/aoe-save-card.hbs`,
    {
      sourceName: item.name,
      actorName: actor.name,
      saveType,
      saveTypeLabel: saveType ? saveType.charAt(0).toUpperCase() + saveType.slice(1) : "",
      damageFormula,
      damageTotal: damageRoll?.total ?? 0,
      targets: rowTargets,
      hasDamage: !!damageFormula,
      needsSave: !!saveType
    }
  );

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: damageRoll ? [damageRoll] : [],
    flags: {
      [SYSTEM_ID]: {
        card: "aoe",
        aoe: {
          itemUuid: item.uuid,
          actorUuid: actor.uuid,
          sourceName: item.name,
          templateUuid: templateDoc?.uuid ?? null,
          saveType,
          onFailStatus,
          halfDamageOnSave,
          durationFormula,
          damageFormula,
          damageTotal: damageRoll?.total ?? 0,
          damageType: "blast",
          rows: rowTargets
        }
      }
    }
  });

  return message;
}

/** Apply full-or-half damage to an AOE row target. */
async function applyAoeDamage(target, { total, multiplier, damageType, sourceName }) {
  const final = Math.floor(Math.max(0, total * multiplier));
  if (!final) return { applied: 0 };
  const result = await applyIncomingDamage(target, final, {
    damageType: damageType ?? "blast",
    sourceName: sourceName ?? ""
  });
  return { applied: final, result };
}

/** Apply the timed onFailStatus AE to a single target. */
async function applyAoeCondition(target, { statusId, durationFormula, sourceName }) {
  if (!statusId) return;
  let remainingRounds = 1;
  if (durationFormula) {
    try {
      const roll = await new Roll(String(durationFormula)).evaluate();
      remainingRounds = Math.max(1, Math.round(roll.total));
    } catch (_error) {
      remainingRounds = 1;
    }
  }
  await applyTemporaryEffect(target, {
    id: `aoe:${sourceName}:${statusId}:${target.id}`,
    label: `${sourceName} ${statusId}`,
    mode: "generic",
    remainingRounds,
    statusId,
    sourceName
  });
}

/**
 * Resolve one row of the AOE save card. Called from the chat-button click
 * handler in hooks.mjs. Updates the message's rendered row with the save
 * outcome and applies damage / conditions as configured.
 */
export async function resolveAoeSaveRow(messageId, tokenUuid) {
  const message = game.messages?.get?.(messageId);
  if (!message) return;
  const flags = message.flags?.[SYSTEM_ID]?.aoe;
  if (!flags) return;

  const row = flags.rows?.find((entry) => entry.tokenUuid === tokenUuid);
  if (!row || row.status === "resolved") return;

  const target = await resolveActorFromUuid(row.actorUuid);
  if (!target) return;

  // Soft lock: mark the row in_progress so double-clicks don't re-enter.
  row.status = "in_progress";

  let saveSucceeded = false;
  let resultText = "";

  if (flags.saveType) {
    const { requestSaveResolution } = await import("./dice.mjs");
    const save = await requestSaveResolution(target, flags.saveType, {
      sourceName: flags.sourceName ?? "",
      intensity: null,
      inputLocked: false
    });
    if (save?.status === "canceled") {
      row.status = "pending";
      await message.update({ [`flags.${SYSTEM_ID}.aoe.rows`]: flags.rows });
      return;
    }
    saveSucceeded = !!(save?.status === "resolved" && save.success);
    resultText = saveSucceeded ? "Saved" : "Failed";
  }

  // Damage apply.
  if (Number(flags.damageTotal) > 0) {
    const multiplier = !flags.saveType
      ? 1
      : saveSucceeded
        ? (flags.halfDamageOnSave ? 0.5 : 0)
        : 1;
    if (multiplier > 0) {
      const { applied } = await applyAoeDamage(target, {
        total: Number(flags.damageTotal),
        multiplier,
        damageType: flags.damageType,
        sourceName: flags.sourceName ?? ""
      });
      resultText += resultText ? ` · ${applied} dmg` : `${applied} dmg`;
    } else if (saveSucceeded && flags.halfDamageOnSave === false) {
      resultText += resultText ? " · no dmg" : "no dmg";
    }
  }

  // Condition apply on fail.
  if (!saveSucceeded && flags.onFailStatus) {
    await applyAoeCondition(target, {
      statusId: flags.onFailStatus,
      durationFormula: flags.durationFormula,
      sourceName: flags.sourceName ?? ""
    });
    resultText += resultText ? ` · ${flags.onFailStatus}` : flags.onFailStatus;
  }

  row.status = "resolved";
  row.resultText = resultText || (saveSucceeded ? "Saved" : "Resolved");
  await message.update({ [`flags.${SYSTEM_ID}.aoe.rows`]: flags.rows });
}

/**
 * GM sweep button — resolve every pending NPC row in one click. PCs are
 * skipped (they must roll their own saves).
 */
export async function resolveAllPendingAoe(messageId) {
  const message = game.messages?.get?.(messageId);
  if (!message) return;
  const flags = message.flags?.[SYSTEM_ID]?.aoe;
  if (!flags) return;

  for (const row of flags.rows ?? []) {
    if (row.status === "resolved" || row.isPlayerOwned) continue;
    await resolveAoeSaveRow(messageId, row.tokenUuid);
  }
}

/**
 * Sweep expired persistent templates at round ticks. Wired from
 * `tickCombatActorState` in effect-state.mjs. Safe to call on every round
 * update — no-ops for templates without our flag or still-alive clouds.
 */
export async function cleanupExpiredTemplates(combat) {
  if (!game.user?.isGM) return;
  const scene = canvas?.scene;
  const templates = scene?.templates?.contents ?? [];
  if (!templates.length) return;

  const currentRound = Number(combat?.round ?? 0);
  for (const templateDoc of templates) {
    const flag = templateDoc.flags?.[SYSTEM_ID]?.aoe;
    if (!flag) continue;
    const persistentRounds = Number(flag.persistentRounds ?? 0);
    if (persistentRounds <= 0) continue;

    const placed = Number(flag.placedAtRound ?? 0);
    const expires = placed + persistentRounds;
    if (currentRound < expires) continue;

    try {
      await templateDoc.delete();
    } catch (error) {
      console.warn(`${SYSTEM_ID} | failed to remove expired AOE template`, error);
    }
  }
}

/**
 * Top-level orchestration used by `useGear`. Places the template, plays the
 * animation, pre-rolls shared damage, and posts the consolidated save card.
 */
export async function useAoeOrdnance(actor, item) {
  const templateDoc = await placeAoeTemplate(actor, item);
  if (!templateDoc) return false;

  const persistentRounds = resolvePersistentRounds(item);
  const animationKey = item.system.area?.animationKey || "";

  try {
    await game.gammaWorld?.animations?.playAreaEffect?.({
      template: templateDoc,
      animationKey,
      itemName: item.name,
      persistentRounds
    });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | area animation failed`, error);
  }

  const targets = enumerateTargetsInTemplate(templateDoc).filter((token) => token.actor);

  // One shared damage roll for all targets — standard RAW behavior.
  const formula = item.system.action?.damageFormula || item.system.area?.damageFormula || "";
  let damageRoll = null;
  if (formula) {
    try {
      damageRoll = await new Roll(String(formula)).evaluate();
    } catch (_error) {
      damageRoll = null;
    }
  }

  const message = await postAoeSaveCard({
    actor,
    item,
    templateDoc,
    targets,
    damageFormula: formula,
    damageRoll
  });

  // Auto-resolve NPC rows when the setting is on ("onHit" or "always";
  // AOE has no to-hit roll so the two are equivalent here).
  try {
    const mode = game.settings?.get(SYSTEM_ID, "npcDamageMode");
    const autoNpc = mode === "always" || mode === "onHit";
    if (autoNpc && message?.id) {
      await resolveAllPendingAoe(message.id);
    }
  } catch (_error) { /* setting read failed — leave manual */ }

  return true;
}
