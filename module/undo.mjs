/**
 * Undo stack for damage application.
 *
 * Snapshot-based and persisted on the Damage Applied chat message itself
 * (not a session-scoped JS array), so the stack survives client reloads
 * and GMs can undo from any client. Foundry's chat-log retention bounds
 * storage naturally — no explicit cap or eviction logic needed.
 *
 * What we capture (before any HP mutation in `applyDamageToTargets`):
 *   - `hp.value`           — current HP
 *   - `combat.fatigue.round` — round-counter (mostly unused for damage,
 *                              but cheap to include and useful for other
 *                              undo kinds later)
 *   - `flags[SYSTEM_ID].state` — the full effect-state flag (barriers,
 *                                 temporary effects, stun counters, etc.)
 *
 * On undo, we restore those three paths via `runAsGM` and delete the
 * Damage Applied message. The original Attack card and Damage card
 * remain in the chat log as history — the undo reverses the *effect* of
 * the click, not the click itself.
 */

import { SYSTEM_ID } from "./config.mjs";
import { runAsGM } from "./gm-executor.mjs";

export const UNDO_VERSION = 1;

/**
 * Pure-JS helper: reduce an actor document to the minimum shape needed
 * to reverse a damage/condition application. Returns null for missing
 * input. Safe to stringify: no live doc refs leak through.
 */
export function captureActorSnapshot(actor) {
  if (!actor) return null;
  const hp = actor.system?.resources?.hp ?? {};
  const fatigue = actor.system?.combat?.fatigue ?? {};
  const rawState = actor.flags?.[SYSTEM_ID]?.state ?? {};
  let state;
  try {
    state = JSON.parse(JSON.stringify(rawState));
  } catch (_error) {
    state = {};
  }
  return {
    uuid: actor.uuid ?? null,
    name: actor.name ?? "",
    hp: {
      value: Number(hp.value ?? 0) || 0,
      max: Number(hp.max ?? 0) || 0
    },
    fatigue: {
      round: Number(fatigue.round ?? 0) || 0
    },
    state
  };
}

/**
 * Build the serializable undo snapshot that lives on a chat message's
 * `flags[SYSTEM_ID].undo`. Caller provides the kind and the list of
 * actors whose state was about to be mutated.
 */
export function buildUndoSnapshot({ kind, actors = [], chatMessageIds = [], userId = null }) {
  return {
    version: UNDO_VERSION,
    kind: String(kind || "unknown"),
    timestamp: Date.now(),
    userId: userId ?? null,
    actorStates: actors.map(captureActorSnapshot).filter(Boolean),
    chatMessageIds: [...chatMessageIds]
  };
}

/**
 * User-side: prompt to confirm, then route the restore to the GM via
 * `runAsGM`. Non-GM users are still allowed to initiate an undo; the
 * socket hop ensures all doc updates happen GM-side.
 */
export async function requestUndo(chatMessageId) {
  const message = game.messages?.get?.(chatMessageId);
  if (!message) return false;
  const snapshot = message.getFlag?.(SYSTEM_ID, "undo");
  if (!snapshot) {
    ui.notifications?.warn("This message has no undo snapshot attached.");
    return false;
  }

  const { DialogV2 } = foundry.applications.api;
  const count = snapshot.actorStates?.length ?? 0;
  const kindLabel = snapshot.kind === "damageApplied" ? "damage application"
                  : snapshot.kind === "conditionApplied" ? "condition application"
                  : snapshot.kind === "aoeResolved" ? "area-effect resolution"
                  : snapshot.kind || "action";
  const confirmed = await DialogV2.confirm({
    window: { title: "Undo Action" },
    content: `<p>Restore <strong>${count}</strong> actor(s) to their state before this ${kindLabel}? The chat message will be removed.</p><p><em>Actions taken after this one are not automatically reversed.</em></p>`
  });
  if (!confirmed) return false;

  try {
    return await runAsGM("undo-apply", { chatMessageId });
  } catch (error) {
    ui.notifications?.error(error?.message ?? String(error));
    return false;
  }
}

/**
 * GM-side executor registered with `dispatchOperation` in gm-executor.
 * Restores each actor's HP / fatigue / state to the captured values,
 * then deletes the chat message that carried the snapshot plus any
 * linked secondary messages.
 */
export async function executeUndoRestore({ chatMessageId }) {
  const message = game.messages?.get?.(chatMessageId);
  if (!message) return false;
  const snapshot = message.getFlag(SYSTEM_ID, "undo");
  if (!snapshot) return false;

  for (const actorState of snapshot.actorStates ?? []) {
    if (!actorState?.uuid) continue;
    let actor;
    try {
      actor = await fromUuid(actorState.uuid);
    } catch (_error) {
      actor = null;
    }
    if (!actor) continue;
    try {
      await actor.update({
        "system.resources.hp.value": actorState.hp?.value ?? 0,
        "system.combat.fatigue.round": actorState.fatigue?.round ?? 0,
        [`flags.${SYSTEM_ID}.-=state`]: null,
        [`flags.${SYSTEM_ID}.state`]: actorState.state ?? {}
      });
      if (["character", "monster"].includes(actor.type)) {
        await actor.refreshDerivedResources?.({ adjustCurrent: false });
      }
    } catch (error) {
      console.warn(`${SYSTEM_ID} | undo: actor restore failed for ${actorState.uuid}`, error);
    }
  }

  for (const linkedId of snapshot.chatMessageIds ?? []) {
    if (linkedId === chatMessageId) continue;
    const linked = game.messages?.get?.(linkedId);
    if (linked) {
      try { await linked.delete(); } catch (_error) { /* swallow */ }
    }
  }
  try {
    await message.delete();
  } catch (_error) { /* swallow */ }
  return true;
}

/**
 * DOM helper called from the renderChatMessageHTML hook. Injects a
 * GM-only "⟲ Undo" pill into the message footer if the message carries
 * a v1 undo snapshot and the viewer is the GM.
 *
 * The caller is responsible for wiring the click handler
 * (see module/hooks.mjs — `gw-undo` action).
 */
export function renderUndoButton(message, html) {
  if (!message?.getFlag) return;
  const snapshot = message.getFlag(SYSTEM_ID, "undo");
  if (!snapshot) return;
  if (!game.user?.isGM) return;

  const existing = html.querySelector?.('[data-action="gw-undo"]');
  if (existing) return;

  const container = html.querySelector?.(".gw-chat-card") ?? html;
  if (!container) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gw-chat-button gw-undo-button";
  button.dataset.action = "gw-undo";
  button.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Undo';
  button.title = "Revert this action and delete this message (GM only).";

  const wrapper = document.createElement("div");
  wrapper.className = "gw-chat-undo-row";
  wrapper.appendChild(button);
  container.appendChild(wrapper);
}
