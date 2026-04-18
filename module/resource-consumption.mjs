/**
 * Resource consumption helper — a single funnel for every runtime
 * debit of a consumable item field.
 *
 * Before Phase 4, weapon ammo (`system.ammo.current`) and artifact
 * charges (`system.artifact.charges.current`) were each decremented
 * inline at their own call sites with slightly different idioms — no
 * shared settings gate, no hook emission, no depletion chat card, no
 * way for undo/macros to observe or reverse the consumption.
 *
 * `consumeResource(item, kind, amount)` unifies all of that. Callers
 * that want to mutate a consumable field call this instead of
 * `item.update()`. Every call:
 *
 *   1. honors the `autoConsumeCharges` world setting (bypass entirely
 *      if the GM turned auto-consumption off)
 *   2. blocks the debit and posts a GM-whispered "out of …" notice if
 *      the resource is already at zero
 *   3. routes the write through `runAsGM` so non-owner players can fire
 *      weapons without flailing on permissions
 *   4. records the delta in `context.resources` (if a Phase 2a
 *      AttackContext was passed in) so future undo phases can refund
 *   5. fires `gammaWorld.v1.resourceConsumed` so macros can observe
 *
 * Returns `{ consumed: boolean, reason?: string, before?: number,
 * after?: number }`. Non-blocking on failure — a caller that gets
 * `{ consumed: false }` must decide whether to abort the action.
 */

import { SYSTEM_ID } from "./config.mjs";
import { runAsGM } from "./gm-executor.mjs";
import { HOOK, fireAnnounceHook } from "./hook-surface.mjs";

/**
 * Maps a resource kind to the document field path that holds its
 * current count. Adding a new kind = add a line here (and a matching
 * line in KIND_LABELS below).
 */
const KIND_PATHS = Object.freeze({
  ammo:           "system.ammo.current",
  artifactCharge: "system.artifact.charges.current"
});

/**
 * Human-facing labels used in the depletion chat card. Keep these
 * short — they appear alongside the item name.
 */
const KIND_LABELS = Object.freeze({
  ammo:           "is out of ammo",
  artifactCharge: "has no charges remaining"
});

function autoConsumeEnabled() {
  try {
    return !!game.settings?.get(SYSTEM_ID, "autoConsumeCharges");
  } catch (_error) {
    return true;
  }
}

/**
 * Main entry. See the file header for semantics.
 *
 * @param {Item} item — the item whose resource is debited.
 * @param {"ammo"|"artifactCharge"} kind
 * @param {number} amount — units to debit (default 1).
 * @param {object} [opts]
 * @param {object} [opts.context] — Phase 2a AttackContext; if present,
 *   the debit is recorded in `context.resources` for later undo.
 * @param {boolean} [opts.silent] — suppress the depletion chat card on
 *   block. Defaults to false.
 */
export async function consumeResource(item, kind, amount = 1, { context = null, silent = false } = {}) {
  if (!autoConsumeEnabled()) return { consumed: false, reason: "setting-off" };
  if (!item) return { consumed: false, reason: "no-item" };

  const path = KIND_PATHS[kind];
  if (!path) throw new Error(`consumeResource: unknown kind "${kind}"`);

  const debit = Math.max(0, Math.floor(Number(amount) || 0));
  const current = Number(foundry.utils.getProperty(item, path) ?? 0) || 0;

  if (debit > 0 && current <= 0) {
    if (!silent) await postDepletedNotice(item, kind);
    return { consumed: false, reason: "depleted", before: current, after: current };
  }

  const next = Math.max(0, current - debit);

  if (context && Array.isArray(context.resources)) {
    context.resources.push({
      itemUuid: item.uuid,
      kind,
      path,
      before: current,
      after: next,
      amount: debit
    });
  }

  if (debit > 0) {
    try {
      if (game.user?.isGM || item.isOwner) {
        await item.update({ [path]: next });
      } else {
        await runAsGM("actor-update", {
          actorUuid: item.parent?.uuid ?? item.uuid,
          update: { [path]: next }
        });
      }
    } catch (error) {
      console.warn(`${SYSTEM_ID} | consumeResource write failed for ${item?.uuid}`, error);
      return { consumed: false, reason: "write-failed", before: current, after: current };
    }
  }

  fireAnnounceHook(HOOK.resourceConsumed, {
    itemUuid: item.uuid ?? null,
    itemName: item.name ?? "",
    kind,
    before: current,
    after: next,
    amount: debit,
    context: context ?? null
  });

  return { consumed: debit > 0, before: current, after: next };
}

/**
 * GM-whispered chat card announcing that a consumable resource has
 * hit zero. Whisper rather than public — players don't need a public
 * "you're out of ammo" rubbed in.
 */
export async function postDepletedNotice(item, kind) {
  if (!item) return;
  if (typeof ChatMessage === "undefined") return;
  const label = KIND_LABELS[kind] ?? "has no charges remaining";
  const gmIds = (game.users?.filter?.((u) => u.isGM) ?? []).map((u) => u.id);
  try {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.parent ?? null }),
      content: `<div class="gw-chat-card gw-depleted-notice"><p>🔻 <strong>${foundry.utils.escapeHTML(item.name ?? "Item")}</strong> ${label}.</p></div>`,
      whisper: gmIds.length ? gmIds : undefined
    });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | depletion notice failed for ${item?.uuid}`, error);
  }
}

/**
 * Pure helper for tests: given a stub item with the expected path,
 * return whether it has at least one unit of the resource remaining.
 */
export function hasResource(item, kind) {
  const path = KIND_PATHS[kind];
  if (!item || !path) return false;
  return (Number(foundry.utils?.getProperty?.(item, path) ?? 0) || 0) > 0;
}

export const RESOURCE_KIND_PATHS = KIND_PATHS;
export const RESOURCE_KIND_LABELS = KIND_LABELS;
