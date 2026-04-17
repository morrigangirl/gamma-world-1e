import { SYSTEM_ID } from "./config.mjs";
import {
  applyDamageToTargets,
  applyHealingToTargets,
  resolveHazardDamage,
  resolveHazardLethal,
  resolveHazardMutation,
  rollDamageFromFlags
} from "./dice.mjs";
import { syncGrantedItems, enrichEquipmentSystemData, equipmentMigrationUpdate } from "./equipment-rules.mjs";
import { syncActorProtectionState, tickCombatActorState } from "./effect-state.mjs";
import { tickCombatMutationState } from "./mutations.mjs";
import { prototypeTokenMigrationUpdate } from "./token-defaults.mjs";

const actorMaintenanceJobs = new Map();
const GM_ONLY_CHAT_ACTIONS = new Set([
  "gw-apply-damage",
  "gw-apply-healing",
  "gw-hazard-damage",
  "gw-hazard-lethal",
  "gw-hazard-mutation"
]);

export function registerHooks() {
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("createActor", onActorCreate);
  Hooks.on("createItem", onMutationRelevantItemChange);
  Hooks.on("updateItem", onMutationRelevantItemChange);
  Hooks.on("deleteItem", onMutationRelevantItemDelete);
  Hooks.on("updateActor", onActorRefresh);
  Hooks.on("updateCombat", tickCombatMutationState);
  Hooks.on("updateCombat", tickCombatActorState);
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

  if (!game.user?.isGM) {
    for (const action of GM_ONLY_CHAT_ACTIONS) {
      html.querySelectorAll(`[data-action="${action}"]`).forEach((button) => button.remove());
    }
    html.querySelectorAll(".gw-card-actions").forEach((wrapper) => {
      if (!wrapper.querySelector("button")) wrapper.remove();
    });
  }

  html.querySelectorAll('[data-action="gw-roll-damage"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!flags.attack) return;
      await rollDamageFromFlags(flags.attack);
    });
  });

  html.querySelectorAll('[data-action="gw-apply-damage"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const multiplier = Number(button.dataset.multiplier ?? "1") || 1;
      if (!flags.damage) return;
      await applyDamageToTargets(flags.damage.total, multiplier, {
        targetUuid: flags.damage.targetUuid,
        targetUuids: flags.damage.targetUuids ?? [],
        damageType: flags.damage.damageType ?? "",
        sourceName: flags.damage.sourceName ?? "",
        weaponTag: flags.damage.weaponTag ?? "",
        nonlethal: !!flags.damage.nonlethal,
        sourceMessageId: message.id,
        idempotencyKey: `damage:${multiplier}`
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
