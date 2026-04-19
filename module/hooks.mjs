import { SYSTEM_ID } from "./config.mjs";
import {
  applyCatastrophicRadiation,
  applyDamageToTargets,
  applyHealingToTargets,
  applyRadiationSickness,
  resolveHazardDamage,
  resolveHazardLethal,
  resolveHazardMutation,
  rollDamageFromFlags
} from "./dice.mjs";
import { syncGrantedItems, enrichEquipmentSystemData, equipmentMigrationUpdate } from "./equipment-rules.mjs";
import { resetCombatFatigue, syncActorProtectionState, tickCombatActorState } from "./effect-state.mjs";
import { resolveAllPendingAoe, resolveAoeSaveRow } from "./aoe.mjs";
import { renderUndoButton, requestUndo } from "./undo.mjs";
import { fillVariant, mutationHasVariant, mutationVariant } from "./mutation-rules.mjs";
import { tickCombatMutationState } from "./mutations.mjs";
import { openChatRollRequestDialog } from "./request-rolls.mjs";
import { prototypeTokenMigrationUpdate } from "./token-defaults.mjs";

const actorMaintenanceJobs = new Map();
const GM_ONLY_CHAT_ACTIONS = new Set([
  "gw-apply-damage",
  "gw-apply-healing",
  "gw-damage-mult",
  "gw-damage-skip",
  "gw-hazard-damage",
  "gw-hazard-lethal",
  "gw-hazard-mutation",
  "gw-hazard-rad-sickness",
  "gw-hazard-rad-catastrophic",
  "gw-aoe-resolve-all",
  "gw-undo"
]);

export function registerHooks() {
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("renderChatLog", onRenderChatLog);
  Hooks.on("renderSidebarTab", onRenderSidebarTab);
  Hooks.on("createActor", onActorCreate);
  Hooks.on("preCreateItem", onPreCreateMutationRollVariant);
  Hooks.on("createItem", onMutationRelevantItemChange);
  Hooks.on("updateItem", onMutationRelevantItemChange);
  Hooks.on("deleteItem", onMutationRelevantItemDelete);
  Hooks.on("updateActor", onActorRefresh);
  Hooks.on("updateCombat", tickCombatMutationState);
  Hooks.on("updateCombat", tickCombatActorState);
  Hooks.on("deleteCombat", onCombatDelete);
}

/**
 * Roll a random variant for mutations that have a d6-style pick-one at
 * acquisition (Absorption, Body Structure Change, Complete Mental Block,
 * Fear Impulse, Genius Capability, Physical Reflection, Skin Structure
 * Change). Fires on every item create, but only acts when:
 *   - the item is a mutation owned by an Actor,
 *   - the variant slot is empty (so pre-rolled items keep their choice), and
 *   - the mutation name is one we know how to roll for.
 *
 * updateSource() mutates the in-flight document before the DB write, so
 * the rolled variant ships with the same create and there's no flash of
 * an empty placeholder on the sheet.
 */
function onPreCreateMutationRollVariant(item, data, _options, _userId) {
  if (!item || item.type !== "mutation") return;
  if (!(item.parent instanceof Actor)) return;
  const existingVariant = item.system?.reference?.variant ?? data?.system?.reference?.variant ?? "";
  if (existingVariant) return;
  const name = item.name ?? data?.name ?? "";
  if (!mutationHasVariant(name)) return;

  const rolled = mutationVariant(name);
  if (!rolled) return;

  const updates = { "system.reference.variant": rolled };
  const currentSummary = item.system?.summary ?? data?.system?.summary ?? "";
  if (typeof currentSummary === "string" && currentSummary.includes("_")) {
    updates["system.summary"] = fillVariant(currentSummary, rolled);
  }
  try {
    item.updateSource(updates);
    // ui.notifications isn't available during pre-create on some paths;
    // log instead so the GM can see which variant was drawn in the
    // browser console and the roll is auditable.
    console.info(`gamma-world-1e | rolled "${rolled}" for ${name} on ${item.parent?.name ?? "actor"}`);
  } catch (error) {
    console.warn(`gamma-world-1e | preCreateItem variant roll failed for ${name}`, error);
  }
}

async function onCombatDelete(combat) {
  if (!game.user?.isGM) return;
  try {
    if (game.settings.get(SYSTEM_ID, "resetFatigueOnCombatEnd")) {
      await resetCombatFatigue(combat);
    }
  } catch (error) {
    console.warn(`${SYSTEM_ID} | fatigue reset on combat end failed`, error);
  }
}

async function onActorCreate(actor, options = {}) {
  if (options.gammaWorldSync) return;
  if (!(actor instanceof Actor) || !["character", "monster"].includes(actor.type)) return;
  const update = prototypeTokenMigrationUpdate(actor);
  if (Object.keys(update).length) {
    await actor.update(update, { gammaWorldSync: true });
  }
}

function scheduleActorMaintenance(actor, {
  syncGranted = true,
  syncProtection = true,
  refresh = true
} = {}) {
  if (!(actor instanceof Actor) || !["character", "monster"].includes(actor.type)) return Promise.resolve();

  const key = actor.uuid ?? actor.id;
  let job = actorMaintenanceJobs.get(key);
  if (!job) {
    job = {
      syncGranted: false,
      syncProtection: false,
      refresh: false,
      timer: null,
      resolve: null,
      reject: null,
      promise: null
    };
    job.promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    actorMaintenanceJobs.set(key, job);
  }

  job.syncGranted ||= syncGranted;
  job.syncProtection ||= syncProtection;
  job.refresh ||= refresh;

  if (job.timer) globalThis.clearTimeout(job.timer);
  job.timer = globalThis.setTimeout(async () => {
    try {
      if (job.syncGranted) await syncGrantedItems(actor);
      if (job.syncProtection) await syncActorProtectionState(actor);
      if (job.refresh) await actor.refreshDerivedResources({ adjustCurrent: false });
      job.resolve?.();
    } catch (error) {
      job.reject?.(error);
    } finally {
      actorMaintenanceJobs.delete(key);
    }
  }, 25);

  return job.promise;
}

function onRenderChatMessage(message, html) {
  const flags = message.flags?.[SYSTEM_ID];
  if (!flags) return;

  // Phase 3: GM-only Undo button for any message carrying an undo snapshot.
  // Button DOM is injected here; the click handler below routes the undo.
  if (flags.undo) renderUndoButton(message, html);

  if (!game.user?.isGM) {
    for (const action of GM_ONLY_CHAT_ACTIONS) {
      html.querySelectorAll(`[data-action="${action}"]`).forEach((button) => button.remove());
    }
    html.querySelectorAll(".gw-card-actions").forEach((wrapper) => {
      if (!wrapper.querySelector("button")) wrapper.remove();
    });
  }

  html.querySelectorAll('[data-action="gw-undo"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      await requestUndo(message.id);
    });
  });

  // Click-to-expand dice breakdown: toggles the sibling
  // .gw-roll-breakdown that the renderer emitted next to the total.
  html.querySelectorAll('[data-action="gw-toggle-roll"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const card = button.closest(".gw-chat-card") ?? html;
      const breakdown = card?.querySelector(".gw-roll-breakdown");
      if (!breakdown) return;
      const nowHidden = !breakdown.hasAttribute("hidden");
      if (nowHidden) breakdown.setAttribute("hidden", "");
      else breakdown.removeAttribute("hidden");
      // Update every gw-roll-total button on this card so aria state
      // stays in sync even if multiple totals share the breakdown.
      card.querySelectorAll('[data-action="gw-toggle-roll"]').forEach((btn) => {
        btn.setAttribute("aria-expanded", String(!nowHidden));
      });
    });
  });

  html.querySelectorAll('[data-action="gw-roll-damage"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!flags.attack) return;
      await rollDamageFromFlags(flags.attack);
    });
  });

  // Per-target multiplier pill selector: flips the active pill and
  // updates the sibling Apply button's data-multiplier so the GM can
  // pick and commit per target.
  html.querySelectorAll('[data-action="gw-damage-mult"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const targetUuid = button.dataset.targetUuid;
      const multiplier = button.dataset.multiplier ?? "1";
      const row = button.closest(".gw-damage-target");
      if (!row) return;
      row.querySelectorAll('[data-action="gw-damage-mult"]').forEach((btn) => {
        btn.classList.toggle("is-active", btn === button);
      });
      const applyBtn = row.querySelector('[data-action="gw-apply-damage"]');
      if (applyBtn) applyBtn.dataset.multiplier = multiplier;
      // Live preview: update the per-target "× N" pill so the GM sees
      // the effective damage before committing.
      const preview = row.querySelector('[data-role="gw-damage-preview"]');
      if (preview) {
        const baseTotal = Number(preview.dataset.baseTotal ?? "0") || 0;
        const mult = Number(multiplier) || 0;
        const effective = Math.max(0, Math.floor(baseTotal * mult));
        preview.textContent = mult === 1 ? "×1" : `×${multiplier} = ${effective}`;
      }
    });
  });

  // "Skip this target" button — dismisses the row from the card DOM.
  // Does not mutate world data (no damage is applied). If every row is
  // dismissed, the card becomes a record-only entry.
  html.querySelectorAll('[data-action="gw-damage-skip"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const row = button.closest(".gw-damage-target");
      if (row) row.remove();
    });
  });

  html.querySelectorAll('[data-action="gw-apply-damage"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const multiplier = Number(button.dataset.multiplier ?? "1") || 1;
      if (!flags.damage) return;
      // Per-target Apply: the picker row ships its own target UUID.
      // Legacy fallback (no data-target-uuid) still applies to every
      // target listed in the damage flags with a single multiplier.
      const pickerTargetUuid = button.dataset.targetUuid ?? "";
      const targetUuid = pickerTargetUuid || flags.damage.targetUuid;
      const targetUuids = pickerTargetUuid ? [] : (flags.damage.targetUuids ?? []);
      const idempotencySuffix = pickerTargetUuid ? `:${pickerTargetUuid}` : "";
      await applyDamageToTargets(flags.damage.total, multiplier, {
        targetUuid,
        targetUuids,
        damageType: flags.damage.damageType ?? "",
        sourceName: flags.damage.sourceName ?? "",
        weaponTag: flags.damage.weaponTag ?? "",
        nonlethal: !!flags.damage.nonlethal,
        sourceMessageId: message.id,
        idempotencyKey: `damage:${multiplier}${idempotencySuffix}`
      });
    });
  });

  html.querySelectorAll('[data-action="gw-apply-healing"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const multiplier = Number(button.dataset.multiplier ?? "1") || 1;
      if (!flags.damage) return;
      await applyHealingToTargets(flags.damage.total, multiplier, { targetUuid: flags.damage.targetUuid });
    });
  });

  html.querySelectorAll('[data-action="gw-hazard-damage"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!flags.hazard) return;
      await resolveHazardDamage(flags.hazard);
    });
  });

  html.querySelectorAll('[data-action="gw-hazard-lethal"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!flags.hazard) return;
      await resolveHazardLethal(flags.hazard);
    });
  });

  html.querySelectorAll('[data-action="gw-hazard-mutation"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!flags.hazard) return;
      await resolveHazardMutation(flags.hazard);
    });
  });

  html.querySelectorAll('[data-action="gw-hazard-rad-sickness"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!flags.hazard) return;
      const severity = button.dataset.severity === "severe" ? "severe" : "mild";
      await applyRadiationSickness(flags.hazard, severity);
    });
  });

  html.querySelectorAll('[data-action="gw-hazard-rad-catastrophic"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!flags.hazard) return;
      await applyCatastrophicRadiation(flags.hazard);
    });
  });

  html.querySelectorAll('[data-action="gw-aoe-save"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const tokenUuid = button.dataset.tokenUuid ?? "";
      if (!flags.aoe || !tokenUuid) return;
      await resolveAoeSaveRow(message.id, tokenUuid);
    });
  });

  html.querySelectorAll('[data-action="gw-aoe-resolve-all"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!flags.aoe) return;
      await resolveAllPendingAoe(message.id);
    });
  });
}

function injectChatRequestToolbar(html) {
  if (!game.user?.isGM) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".gw-chat-request-toolbar")) return;

  const form = root.querySelector("form");
  const toolbar = document.createElement("div");
  toolbar.className = "gw-chat-request-toolbar";
  toolbar.innerHTML = `<button type="button" class="gw-chat-request-button">
    <i class="fas fa-dice-d20" aria-hidden="true"></i>
    <span>${game.i18n.localize("GAMMA_WORLD.Chat.RequestRoll")}</span>
  </button>`;

  toolbar.querySelector("button")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await openChatRollRequestDialog();
  });

  if (form) form.prepend(toolbar);
  else root.prepend(toolbar);
}

function onRenderChatLog(_app, html) {
  injectChatRequestToolbar(html);
}

function onRenderSidebarTab(app, html) {
  const id = app?.options?.id ?? app?.tabName ?? "";
  if (id !== "chat") return;
  injectChatRequestToolbar(html);
}

async function onMutationRelevantItemChange(item, changesOrOptions = {}, maybeOptions = {}) {
  const candidateOptions = [];
  if (changesOrOptions && (typeof changesOrOptions === "object")) candidateOptions.push(changesOrOptions);
  if (maybeOptions && (typeof maybeOptions === "object")) candidateOptions.push(maybeOptions);
  const options = candidateOptions.find((entry) => ("gammaWorldSync" in entry) || ("parent" in entry)) ?? candidateOptions[0] ?? {};
  if (options.gammaWorldSync) return;
  if (item.flags?.[SYSTEM_ID]?.grantedBy) return;
  enrichEquipmentSystemData(item);
  const update = equipmentMigrationUpdate(item);
  if (Object.keys(update).length) {
    await item.update(update, { gammaWorldSync: true });
  }
  const actor = item.parent;
  if (!(actor instanceof Actor) || !["character", "monster"].includes(actor.type)) return;
  await scheduleActorMaintenance(actor);
}

async function onMutationRelevantItemDelete(item, options = {}) {
  if (options.gammaWorldSync) return;
  const actor = item.parent;
  if (!(actor instanceof Actor) || !["character", "monster"].includes(actor.type)) return;
  if (item.flags?.[SYSTEM_ID]?.grantedBy) {
    const ownerId = item.flags[SYSTEM_ID].grantedBy;
    const owner = actor.items.get(ownerId);
    if (owner?.type === "armor" && owner.system.equipped) {
      await scheduleActorMaintenance(actor);
    }
    return;
  }
  await scheduleActorMaintenance(actor);
}

async function onActorRefresh(actor, changes, options = {}) {
  if (options.gammaWorldSync) return;
  if (!["character", "monster"].includes(actor.type)) return;

  const touchesDerivedInputs =
    !!changes.system?.attributes ||
    !!changes.system?.details?.movement ||
    !!changes.system?.resources?.hp?.base;

  if (touchesDerivedInputs) {
    await actor.refreshDerivedResources({ adjustCurrent: false });
  }
}
