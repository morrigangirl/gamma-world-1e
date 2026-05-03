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
import { syncGrantedItems, enrichEquipmentSystemData, equipmentMigrationUpdate, getArmorRule } from "./equipment-rules.mjs";
import { resetCombatFatigue, syncActorProtectionState, tickCombatActorState } from "./effect-state.mjs";
import { resolveAllPendingAoe, resolveAoeSaveRow } from "./aoe.mjs";
import { renderUndoButton, requestUndo } from "./undo.mjs";
import {
  evaluateCondition,
  getMutationRule,
  mutationHasVariant,
  mutationVariant
} from "./mutation-rules.mjs";
import { tickCombatMutationState } from "./mutations.mjs";
import { tickCombatPowerDrain, tickWorldTimePowerDrain } from "./artifact-power.mjs";
import { openChatRollRequestDialog } from "./request-rolls.mjs";
import { openCinematicComposer } from "./cinematic/compose.mjs";
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
  Hooks.on("updateCombat", tickCombatPowerDrain);
  // 0.14.17 — auto-roll initiative when a combatant is added to an
  // already-started combat without one. GM-side only; gated behind
  // setting `autoRollNewCombatantInitiative`.
  Hooks.on("createCombatant", onCreateCombatantAutoInit);
  // 0.14.17 — fatigue overlay on tokens. The `refreshToken` hook
  // fires on every token redraw (after combat tick, AE toggle,
  // movement, etc.); the helper is idempotent so this is safe.
  Hooks.on("refreshToken", onRefreshTokenOverlay);
  // Also refresh visible tokens for an actor when its fatigue.round
  // changes — `updateActor` lets us catch combat-tick HP / fatigue
  // updates without waiting for an unrelated render.
  Hooks.on("updateActor", onActorFatigueOverlayUpdate);
  Hooks.on("updateWorldTime", tickWorldTimePowerDrain);
  // 0.14.2 — refresh open character sheets when world time advances so
  // the "Active Now" panel's seconds-based effect countdowns tick down
  // visibly. Cheap when no sheets are open; throttled by Foundry's
  // render scheduler when many are.
  Hooks.on("updateWorldTime", refreshOpenCharacterSheetsForWorldTime);
  Hooks.on("deleteCombat", onCombatDelete);
}

/**
 * 0.14.2 — re-render any open character sheet whose actor carries an
 * Active Effect with a finite seconds-based timer. Round-based timers
 * already trigger a re-render via tickCombatMutationState → updateActor,
 * but pure world-time effects (status conditions applied with
 * `duration.seconds`) need this nudge to refresh the countdown text.
 */
function refreshOpenCharacterSheetsForWorldTime() {
  const apps = Object.values(globalThis.ui?.windows ?? {});
  for (const app of apps) {
    const actor = app?.document;
    if (!actor || actor.documentName !== "Actor") continue;
    if (!app.rendered) continue;
    const effects = typeof actor.allApplicableEffects === "function"
      ? [...actor.allApplicableEffects()]
      : [...(actor.effects ?? [])];
    const hasSecondsTimer = effects.some((e) => !e?.disabled
      && Number.isFinite(e?.duration?.seconds) && e.duration.seconds > 0);
    if (hasSecondsTimer) app.render(false);
  }
}

/**
 * Roll a random variant for mutations that have a d6-style pick-one at
 * acquisition (Absorption, Body Structure Change, Complete Mental Block,
 * Fear Impulse, Physical Reflection, Skin Structure Change). Fires on
 * every item create, but only acts when:
 *   - the item is a mutation owned by an Actor,
 *   - the variant slot is empty (so pre-rolled items keep their choice), and
 *   - the mutation name is one we know how to roll for.
 *
 * updateSource() mutates the in-flight document before the DB write so
 * the rolled variant ships with the same create. Sheet and chat card
 * surfaces render `Variant: X` labels off `system.reference.variant`.
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

/**
 * 0.14.17 — auto-roll initiative when a combatant is added to a
 * running combat without one. The originating client (the GM who
 * dragged the token in) handles the roll so we don't double-fire on
 * other GM clients.
 */
async function onCreateCombatantAutoInit(combatant, _options, userId) {
  if (!game.user?.isGM) return;
  if (game.user.id !== userId) return;
  try {
    if (!game.settings.get(SYSTEM_ID, "autoRollNewCombatantInitiative")) return;
  } catch { return; }
  if (combatant?.initiative != null) return;
  const combat = combatant?.combat;
  if (!combat?.started) return;
  try {
    await combat.rollInitiative([combatant.id]);
  } catch (error) {
    console.warn(`${SYSTEM_ID} | auto-roll initiative failed for ${combatant?.name}`, error);
  }
}

/**
 * 0.14.17 — token render hook: attach / update / remove the fatigue
 * "F-N" badge on every token redraw. Idempotent and cheap; the heavy
 * work happens in `attachFatigueOverlay` only when the value actually
 * changed.
 */
function onRefreshTokenOverlay(token) {
  try {
    // Lazy-import keeps the module load order clean and lets the
    // helper be unit-tested in isolation.
    import("./token-overlay.mjs").then(({ attachFatigueOverlay }) => {
      attachFatigueOverlay(token);
    });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | fatigue overlay refresh failed`, error);
  }
}

/** When an actor's fatigue.round changes, refresh any visible tokens. */
function onActorFatigueOverlayUpdate(actor, changed) {
  if (foundry.utils.getProperty(changed, "system.combat.fatigue.round") == null) return;
  try {
    const tokens = actor?.getActiveTokens?.() ?? [];
    import("./token-overlay.mjs").then(({ attachFatigueOverlay }) => {
      for (const token of tokens) attachFatigueOverlay(token);
    });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | fatigue overlay update failed`, error);
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
  // 0.14.6 — encounter-resolved chat card. Tally defeated monsters,
  // sum XP, identify PC participants, post a GM-whisper card with
  // Distribute XP + per-monster Roll Loot buttons. Loot rolling is
  // gated behind buttons rather than auto-rolled so the GM can choose
  // not to (or roll publicly vs privately).
  try {
    if (game.settings.get(SYSTEM_ID, "encounterCloseSummary")) {
      const { postEncounterCloseSummary } = await import("./encounter-close.mjs");
      await postEncounterCloseSummary(combat);
    }
  } catch (error) {
    console.warn(`${SYSTEM_ID} | encounter-close summary failed`, error);
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
  // 0.14.6 — wire encounter-close chat card buttons. Runs first so it
  // fires regardless of system-flag presence (the encounter-close card
  // carries its own flags namespace and is independent of attack-card
  // / undo-snapshot wiring below).
  const root = html?.[0] ?? html;
  if (root && typeof root.querySelectorAll === "function") {
    if (root.querySelector('[data-action="distributeEncounterXp"]')
     || root.querySelector('[data-action="rollEncounterLoot"]')) {
      import("./encounter-close.mjs").then(({ registerEncounterCloseChatHandlers }) => {
        registerEncounterCloseChatHandlers(root);
      }).catch((error) => {
        console.warn(`${SYSTEM_ID} | encounter-close chat handlers failed to load`, error);
      });
    }
    // 0.14.18 — wire the "Bind Wound" button on Hemophilia bleed chat
    // cards. Same lazy-import pattern as encounter-close.
    if (root.querySelector('[data-action="bindHemophiliaWound"]')) {
      import("./mutation-ticks.mjs").then(({ registerHemophiliaChatHandlers }) => {
        registerHemophiliaChatHandlers(root);
      }).catch((error) => {
        console.warn(`${SYSTEM_ID} | hemophilia chat handlers failed to load`, error);
      });
    }
  }

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
  toolbar.innerHTML = `<button type="button" class="gw-chat-request-button" data-gw-request="quiet">
    <i class="fas fa-dice-d20" aria-hidden="true"></i>
    <span>${game.i18n.localize("GAMMA_WORLD.Chat.RequestRoll")}</span>
  </button>
  <button type="button" class="gw-chat-request-button" data-gw-request="cinematic">
    <i class="fas fa-star-of-life" aria-hidden="true"></i>
    <span>${game.i18n.localize("GAMMA_WORLD.Chat.CinematicRoll")}</span>
  </button>`;

  toolbar.querySelector('[data-gw-request="quiet"]')?.addEventListener("click", async (event) => {
    event.preventDefault();
    await openChatRollRequestDialog();
  });
  toolbar.querySelector('[data-gw-request="cinematic"]')?.addEventListener("click", async (event) => {
    event.preventDefault();
    await openCinematicComposer();
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
  // 0.8.6 — keep each conditional AE's `disabled` flag in sync with its
  // rule-declared condition so the Effects tab shows the right greyed-
  // out state after the user toggles a mutation or swaps its variant.
  // Runtime apply (applyMutationEffects) already respects the condition
  // independently; this sync only affects visual state.
  if (item.type === "mutation") await syncConditionalEffectsDisabledState(item, actor);
  // 0.9.1 Tier 4 — same sync for armor items: when equipped flips, the
  // rule-declared "equipped" condition changes truthiness, so the
  // transferred AE's disabled flag should update accordingly.
  if (item.type === "armor") await syncArmorEffectsDisabledState(item, actor);
  await scheduleActorMaintenance(actor);
}

/**
 * 0.8.6 — for a mutation item whose rule has `effects[i].condition`,
 * evaluate each condition against the current actor/item state and
 * flip the matching embedded ActiveEffect's `disabled` field if it
 * doesn't match. Runs on both createItem (initial sync after emit-time
 * default) and updateItem (variant / toggle changes).
 */
async function syncConditionalEffectsDisabledState(item, actor) {
  const rule = getMutationRule(item);
  const effects = Array.isArray(rule?.effects) ? rule.effects : [];
  if (!effects.length || !item.effects?.size) return;
  const ctx = {
    actor,
    item,
    derived: {
      encumbered: actor.items.some((entry) => entry.type === "armor" && entry.system?.equipped)
    }
  };
  const updates = [];
  // Pair each rule effect with its emitted AE by insertion order. Most
  // mutations have a single effect entry; Will Force has six. The
  // stable ordering matches buildMutationItemSource's map().
  const itemEffects = [...item.effects.contents];
  for (let i = 0; i < effects.length; i += 1) {
    const rule_effect = effects[i];
    const ae = itemEffects[i];
    if (!ae) continue;
    const condition = rule_effect.condition ?? null;
    const shouldBeEnabled = evaluateCondition(condition, ctx);
    const wantDisabled = !shouldBeEnabled;
    if (!!ae.disabled !== wantDisabled) {
      updates.push({ _id: ae.id, disabled: wantDisabled });
    }
  }
  if (updates.length) {
    try {
      await item.updateEmbeddedDocuments("ActiveEffect", updates, { gammaWorldSync: true });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | failed to sync conditional AE state on "${item.name}"`, error);
    }
  }
}

/**
 * 0.9.1 Tier 4 — mirror of `syncConditionalEffectsDisabledState` for
 * armor. The armor rule's `effects[i].condition` (usually "equipped")
 * is evaluated against the live item state and the corresponding AE's
 * `disabled` field is flipped to match. Runtime apply (applyEquipment-
 * Effects) already respects the condition independently; this sync
 * only affects the Effects tab display.
 */
async function syncArmorEffectsDisabledState(item, actor) {
  const rule = getArmorRule(item);
  const effects = Array.isArray(rule?.effects) ? rule.effects : [];
  if (!effects.length || !item.effects?.size) return;
  const ctx = { actor, item, derived: {} };
  const updates = [];
  const itemEffects = [...item.effects.contents];
  for (let i = 0; i < effects.length; i += 1) {
    const rule_effect = effects[i];
    const ae = itemEffects[i];
    if (!ae) continue;
    const condition = rule_effect.condition ?? null;
    const shouldBeEnabled = evaluateCondition(condition, ctx);
    const wantDisabled = !shouldBeEnabled;
    if (!!ae.disabled !== wantDisabled) {
      updates.push({ _id: ae.id, disabled: wantDisabled });
    }
  }
  if (updates.length) {
    try {
      await item.updateEmbeddedDocuments("ActiveEffect", updates, { gammaWorldSync: true });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | failed to sync armor AE state on "${item.name}"`, error);
    }
  }
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
