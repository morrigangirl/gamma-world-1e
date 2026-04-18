import { SYSTEM_ID } from "./config.mjs";
import {
  actorHasForceField,
  applyIncomingDamage,
  applyTemporaryEffect,
  clearBarrier,
  getActorState,
  removeTemporaryEffect,
  setActorState,
  setBarrier
} from "./effect-state.mjs";
import { promptNumber, resolveTargetActor, rollScaledDamageCard, requestSaveResolution, applyHealingToTargets } from "./dice.mjs";
import { runActorFlag, runActorUpdate } from "./gm-executor.mjs";
import { actorIsRobot, rechargeRobot } from "./robots.mjs";
import {
  artifactPowerFailureMessage,
  artifactPowerStatus,
  artifactUsesRechargeableCells,
  rechargeArtifact
} from "./artifact-power.mjs";

const DialogV2 = foundry.applications.api.DialogV2;
const MISSILE_ORDNANCE_NAMES = new Set([
  "Built-in Micro Missile Rack",
  "Micro Missile",
  "Mini Missile",
  "Neutron Missile",
  "Negation Missile",
  "Fission Missile",
  "Surface Missile"
]);

function currentTargetActors() {
  return [...(game.user?.targets ?? new Set())]
    .map((token) => resolveTargetActor(token))
    .filter(Boolean);
}

function currentTargetTokens() {
  return [...(game.user?.targets ?? new Set())].filter(Boolean);
}

function directTargetOrSelf(actor) {
  return currentTargetActors()[0] ?? actor;
}

function sourceTokenForActor(actor) {
  return actor.getActiveTokens?.()[0] ?? null;
}

function primaryTargetToken() {
  return currentTargetTokens()[0] ?? null;
}

function targetTokensForActors(actors = []) {
  return actors
    .map((actor) => actor.getActiveTokens?.()[0] ?? null)
    .filter(Boolean);
}

async function playOrdnanceAnimation(actor, item, { explosionOnly = false } = {}) {
  const animations = game.gammaWorld?.animations;
  const targetToken = primaryTargetToken();
  if (!animations || !targetToken) return false;

  const sourceToken = sourceTokenForActor(actor);
  if (!explosionOnly) {
    if (MISSILE_ORDNANCE_NAMES.has(item.name)) {
      await animations.playMissileLaunch?.({ itemName: item.name, sourceToken, targetToken });
    } else {
      await animations.playThrownOrdnance?.({ itemName: item.name, sourceToken, targetToken });
    }
  }

  await animations.playExplosion?.({ itemName: item.name, targetToken });
  return true;
}

async function playSupportAnimation(actor, item, targets = [], { phase = "apply" } = {}) {
  const animations = game.gammaWorld?.animations;
  if (!animations) return false;

  const sourceToken = sourceTokenForActor(actor);
  const targetTokens = targetTokensForActors(targets);
  const resolvedTargets = targetTokens.length ? targetTokens : [sourceToken].filter(Boolean);

  let played = false;
  for (const targetToken of resolvedTargets) {
    const result = await animations.playSupportEffect?.({
      itemName: item.name,
      sourceToken,
      targetToken,
      phase
    });
    played = !!result || played;
  }

  return played;
}

function currentCombatDateKey() {
  return new Date().toISOString().slice(0, 7);
}

async function postItemMessage(actor, item, content, { rolls = [] } = {}) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card"><h3>${item.name}</h3>${content}</div>`,
    rolls
  });
}

async function consumeGear(item) {
  const amount = Math.max(0, Number(item.system.action?.consumeQuantity ?? 0));
  if (!amount) return;
  const next = Math.max(0, Number(item.system.quantity ?? 0) - amount);
  await item.update({ "system.quantity": next });
}

function customEffectChanges(item, target) {
  const marker = item.system.action?.status ?? "";
  switch (marker) {
    case "laser-immune":
      return { laserImmune: true };
    case "mind-boost":
      return { attributes: { ms: 3 } };
    case "stim":
      return { attributes: { dx: 1, ps: 3 } };
    case "pain-reducer":
      return { hpBonus: Math.max(0, Number(target.system.attributes.cn.value ?? 0)) };
    case "goggles":
      return { surpriseModifier: 1 };
    case "anti-grav":
      return { movementMultiplier: 2 };
    case "stasis":
      return { movementMultiplier: 0 };
    default:
      return {};
  }
}

async function promptGuidedItem(item, { defaultApplyTo = "self" } = {}) {
  return DialogV2.prompt({
    window: { title: item.name },
    content: `<form>
      <label>Track on:
        <select name="applyTo">
          <option value="self" ${defaultApplyTo === "self" ? "selected" : ""}>Self</option>
          <option value="target" ${defaultApplyTo === "target" ? "selected" : ""}>Current target</option>
          <option value="targets" ${defaultApplyTo === "targets" ? "selected" : ""}>All current targets</option>
          <option value="chat" ${defaultApplyTo === "chat" ? "selected" : ""}>Chat only</option>
        </select>
      </label>
      <label>Rounds to track:
        <input type="number" name="rounds" value="0" min="0" max="999">
      </label>
    </form>`,
    ok: {
      label: "Use",
      callback: (_event, button) => {
        const data = new foundry.applications.ux.FormDataExtended(button.form).object;
        return {
          applyTo: data.applyTo || defaultApplyTo,
          rounds: Math.max(0, Number(data.rounds) || 0)
        };
      }
    },
    rejectClose: false
  });
}

async function toggleGuidedEffect(target, effect) {
  const existing = getActorState(target).temporaryEffects.find((entry) => entry.id === effect.id);
  if (existing) {
    await removeTemporaryEffect(target, effect.id);
    return false;
  }
  await applyTemporaryEffect(target, effect);
  return true;
}

async function useGuidedItem(actor, item, { defaultApplyTo = "self", defaultNotes = "" } = {}) {
  const setup = await promptGuidedItem(item, { defaultApplyTo });
  if (!setup) return false;

  let targets = [];
  if (setup.applyTo === "self") targets = [actor];
  else if (setup.applyTo === "target") targets = currentTargetActors().slice(0, 1);
  else if (setup.applyTo === "targets") targets = currentTargetActors();

  if ((setup.applyTo !== "chat") && !targets.length) {
    ui.notifications?.warn("Select a target or choose chat-only tracking for this item.");
    return false;
  }

  const notes = item.system.action?.notes || defaultNotes || item.system.description?.value || "";
  const toggled = [];

  for (const target of targets) {
    const customMode = item.system.action?.status || "generic";
    const effect = {
      id: `${item.id}:guided:${target.id}`,
      label: item.name,
      mode: customMode,
      statusId: customMode === "stasis" ? "unconscious" : "",
      remainingRounds: setup.rounds,
      sourceName: item.name,
      notes,
      changes: {
        acDelta: Math.round(Number(item.system.action?.acDelta ?? 0) || 0),
        toHitBonus: Math.round(Number(item.system.action?.toHitDelta ?? 0) || 0),
        ...customEffectChanges(item, target)
      }
    };
    const active = await toggleGuidedEffect(target, effect);
    toggled.push(`${target.name}: ${active ? "applied" : "removed"}`);
  }

  await consumeGear(item);
  const trackedNames = toggled.length ? toggled.join("<br>") : "Chat guidance only";

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const active = toggled[index]?.endsWith("applied");
    await playSupportAnimation(actor, item, [target], { phase: active ? "apply" : "remove" });
  }

  await postItemMessage(
    actor,
    item,
    `<p>${notes || "Guided item workflow recorded."}</p><p>${trackedNames}</p>`
  );
  return true;
}

async function applyCloudEffect(actor, item, target, mode) {
  const durationRoll = await new Roll(item.system.action.durationFormula || "1d4").evaluate();
  await durationRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${item.name} duration`
  });

  if (mode === "tear-gas") {
    await applyTemporaryEffect(target, {
      id: `${item.id}:tear-gas:${target.id}`,
      label: item.name,
      mode: "tear-gas",
      remainingRounds: durationRoll.total,
      stacks: 1,
      maxStacks: durationRoll.total,
      recoveryEvery: 3,
      sourceName: item.name
    });
    return;
  }

  await applyTemporaryEffect(target, {
    id: `${item.id}:${mode}:${target.id}`,
    label: item.name,
    mode,
    remainingRounds: durationRoll.total,
    tickFormula: item.system.action.intensityFormula || "3d6",
    sourceName: item.name
  });
}

async function useAreaDamage(actor, item) {
  const targets = currentTargetActors();
  if (!targets.length) {
    ui.notifications?.warn("Target every creature in the blast area before using this item.");
    return false;
  }

  await playOrdnanceAnimation(actor, item);
  await rollScaledDamageCard({
    actor,
    sourceName: item.name,
    baseFormula: item.system.action.damageFormula || "1d6",
    targetUuid: null,
    targetUuids: targets.map((target) => target.uuid),
    damageType: "blast",
    notes: `${item.system.action.radius || 0} meter radius. Apply to all current targets.`
  });
  await consumeGear(item);
  return true;
}

async function useMutationBomb(actor, item) {
  const targets = currentTargetActors();
  if (!targets.length) {
    ui.notifications?.warn("Target every creature in the blast area before using this item.");
    return false;
  }

  await playOrdnanceAnimation(actor, item);
  for (const target of targets) {
    if (actorHasForceField(target)) {
      await postItemMessage(actor, item, `<p>${target.name} is protected by a force field and ignores the blast.</p>`);
      continue;
    }

    const roll = await new Roll("1d100").evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${item.name} effect on ${target.name}`
    });

    if (roll.total <= 60) {
      const { grantRandomMutation } = await import("./dice.mjs");
      await grantRandomMutation(target, { defectOnly: true });
    } else {
      await requestSaveResolution(target, "radiation", {
        sourceName: item.name,
        intensity: Number(item.system.action.intensityFormula || 12),
        inputLocked: true
      });
    }
  }

  await consumeGear(item);
  return true;
}

async function useGasCloud(actor, item, mode) {
  const targets = currentTargetActors();
  if (!targets.length) {
    ui.notifications?.warn("Target every creature caught in the gas cloud before using this item.");
    return false;
  }

  await playOrdnanceAnimation(actor, item);
  for (const target of targets) {
    await applyCloudEffect(actor, item, target, mode);
  }

  await postItemMessage(actor, item, `<p>${item.name} affects ${targets.map((target) => target.name).join(", ")}.</p>`);
  await consumeGear(item);
  return true;
}

async function useHealingGear(actor, item, { sourceName = item.name } = {}) {
  const targets = currentTargetActors();
  const formula = item.system.action?.damageFormula || "1d10";
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${sourceName} healing`
  });
  await applyHealingToTargets(roll.total, 1, {
    targetUuids: targets.map((target) => target.uuid)
  });
  await playSupportAnimation(actor, item, targets);
  await consumeGear(item);
  return true;
}

async function useRejuvChamber(actor, item) {
  const target = directTargetOrSelf(actor);
  const max = Math.max(1, Number(target.system.resources.hp.max ?? 1));
  const current = Math.max(0, Number(target.system.resources.hp.value ?? 0));
  const ratio = current / max;
  const monthKey = currentCombatDateKey();
  const lastUse = target.getFlag(SYSTEM_ID, "rejuvMonth") ?? "";
  const repeatedUse = lastUse === monthKey;
  const chance = repeatedUse
    ? 70
    : ratio >= 0.5
      ? 100
      : ratio >= 0.25
        ? 75
        : 50;

  const roll = await new Roll("1d100").evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${item.name} recovery chance`
  });

  await runActorFlag(target, "rejuvMonth", monthKey);
  if (roll.total <= chance) {
    await target.setHitPoints(max);
    await postItemMessage(actor, item, `<p>${target.name} is fully restored.</p>`, { rolls: [roll] });
  } else if (repeatedUse && (roll.total > 70)) {
    await target.setHitPoints(0);
    await postItemMessage(actor, item, `<p>${target.name} suffers fatal system shock.</p>`, { rolls: [roll] });
  } else {
    await postItemMessage(actor, item, `<p>${target.name} does not recover in the chamber.</p>`, { rolls: [roll] });
  }
  return true;
}

async function usePortent(actor, item) {
  const targets = currentTargetActors().slice(0, 4);
  const recipients = targets.length ? targets : [actor];

  for (const target of recipients) {
    const barrierId = `${item.id}:portent:${target.id}`;
    const existing = getActorState(target).barriers[barrierId];
    if (existing) await clearBarrier(target, barrierId);
    else {
      await setBarrier(target, {
        id: barrierId,
        label: item.name,
        sourceName: item.name,
        remaining: 5
      });
    }
  }

  await consumeGear(item);
  await postItemMessage(actor, item, `<p>Shielded: ${recipients.map((target) => target.name).join(", ")}.</p>`);
  return true;
}

async function useLifeRay(actor, item) {
  const target = currentTargetActors()[0] ?? null;
  if (!target) {
    ui.notifications?.warn("Target a dead creature before using the Life Ray.");
    return false;
  }
  if (Number(target.system.resources.hp.value ?? 0) > 0) {
    ui.notifications?.warn("The Life Ray only works on the recently dead.");
    return false;
  }
  if (target.getFlag(SYSTEM_ID, "lifeRayAttempted")) {
    ui.notifications?.warn("The Life Ray has already been used on this being.");
    return false;
  }

  await playSupportAnimation(actor, item, [target]);
  const successRoll = await new Roll("1d100").evaluate();
  await runActorFlag(target, "lifeRayAttempted", true);
  if (successRoll.total > 50) {
    await postItemMessage(actor, item, `<p>${target.name} does not revive.</p>`, { rolls: [successRoll] });
    return true;
  }

  const statRoll = await new Roll("3d6").evaluate();
  const stats = {};
  for (const key of ["ms", "in", "dx", "ch", "cn", "ps"]) {
    const roll = await new Roll("3d6").evaluate();
    stats[key] = roll.total;
  }
  if (target.system.details.type === "psh") {
    stats.ch = Math.min(18, stats.ch + 3);
  }
  const hpRoll = await new Roll(`${Math.max(1, stats.cn)}d6`).evaluate();
  const update = {
    "system.resources.hp.base": hpRoll.total,
    "system.resources.hp.max": hpRoll.total,
    "system.resources.hp.value": hpRoll.total
  };
  for (const [key, value] of Object.entries(stats)) {
    update[`system.attributes.${key}.value`] = value;
  }
  await runActorUpdate(target, update);
  await target.refreshDerivedResources({ adjustCurrent: true });
  await postItemMessage(
    actor,
    item,
    `<p>${target.name} returns to life with a newly altered body and mind.</p>`,
    { rolls: [successRoll, statRoll, hpRoll] }
  );
  return true;
}

async function useEnergyCellCharger(actor, item) {
  const chargerPower = artifactPowerStatus(item);
  if (!chargerPower.powered) {
    ui.notifications?.warn(artifactPowerFailureMessage(item));
    return false;
  }

  const targets = currentTargetActors();
  const options = [];

  if (actorIsRobot(actor)) options.push({ value: "self-robot", label: `${actor.name} (robot)` });
  for (const target of targets.filter((entry) => actorIsRobot(entry))) {
    options.push({ value: `robot:${target.uuid}`, label: `${target.name} (robot)` });
  }

  for (const candidate of actor.items.filter((entry) =>
    entry.system.artifact?.isArtifact
    && artifactUsesRechargeableCells(entry)
    && (artifactPowerStatus(entry).chargesMax > 0))) {
    options.push({ value: `item:${candidate.id}`, label: candidate.name });
  }

  if (!options.length) {
    ui.notifications?.warn("No compatible robot or powered artifact is available to recharge.");
    return false;
  }

  const choice = await DialogV2.prompt({
    window: { title: item.name },
    content: `<form><label>Recharge:
      <select name="target">${options.map((entry) => `<option value="${entry.value}">${entry.label}</option>`).join("")}</select>
    </label></form>`,
    ok: {
      label: "Recharge",
      callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object.target
    },
    rejectClose: false
  });
  if (!choice) return false;

  if (choice === "self-robot") {
    await rechargeRobot(actor);
    await postItemMessage(actor, item, `<p>${actor.name} is recharged.</p>`);
    return true;
  }

  if (choice.startsWith("robot:")) {
    const robot = await fromUuid(choice.slice(6));
    if (actorIsRobot(robot)) {
      await rechargeRobot(robot);
      await postItemMessage(actor, item, `<p>${robot.name} is recharged.</p>`);
      return true;
    }
  }

  if (choice.startsWith("item:")) {
    const targetItem = actor.items.get(choice.slice(5));
    if (!targetItem) return false;
    const targetPower = artifactPowerStatus(targetItem);
    if (!artifactUsesRechargeableCells(targetItem)) {
      ui.notifications?.warn(`${targetItem.name} does not use rechargeable chemical or hydrogen cells.`);
      return false;
    }
    if (targetPower.cellSlots > 0 && targetPower.cellsInstalled <= 0) {
      ui.notifications?.warn(`Install compatible power cells in ${targetItem.name} before recharging it.`);
      return false;
    }
    await rechargeArtifact(targetItem);
    await postItemMessage(actor, item, `<p>${targetItem.name} is fully recharged.</p>`);
    return true;
  }

  return false;
}

async function usePhotonItem(actor, item, { fieldDamage = 100, disintegrates = false } = {}) {
  const targets = currentTargetActors();
  if (!targets.length) {
    ui.notifications?.warn("Target every creature in the blast area before using this item.");
    return false;
  }

  await playOrdnanceAnimation(actor, item);
  const lines = [];
  for (const target of targets) {
    const protectedBefore = actorHasForceField(target);
    if (protectedBefore && fieldDamage > 0) {
      await applyIncomingDamage(target, fieldDamage, { damageType: "energy", sourceName: item.name });
    }
    if (actorHasForceField(target)) {
      lines.push(`${target.name} is protected by a force field.`);
      continue;
    }
    await target.setHitPoints(0);
    lines.push(`${target.name} is ${disintegrates ? "disintegrated" : "killed"} instantly.`);
  }

  await consumeGear(item);
  await postItemMessage(actor, item, `<p>${lines.join("<br>")}</p>`);
  return true;
}

async function useNegationBomb(actor, item) {
  const targets = currentTargetActors();
  if (!targets.length) {
    ui.notifications?.warn("Target every creature in the blast area before using this item.");
    return false;
  }

  await playOrdnanceAnimation(actor, item);
  const results = [];
  for (const target of targets) {
    const state = getActorState(target);
    state.barriers = {};
    for (const armor of target.items.filter((entry) => entry.type === "armor" && entry.system.equipped && entry.system.field?.mode === "full")) {
      state.barriers[`${armor.id}:field`] = { id: `${armor.id}:field`, destroyed: true, remaining: 0 };
    }
    await setActorState(target, state);
    if (actorIsRobot(target) && !actorHasForceField(target)) {
      const duration = await new Roll("4d6").evaluate();
      await runActorUpdate(target, {
        "system.robotics.mode": "inactive",
        "system.robotics.powerCurrent": 0
      });
      await applyTemporaryEffect(target, {
        id: `${item.id}:negation:${target.id}`,
        label: item.name,
        mode: "generic",
        remainingRounds: duration.total * 10,
        sourceName: item.name,
        notes: "Negation pulse disables powered systems."
      });
      results.push(`${target.name}: systems drained for ${duration.total} minute(s).`);
    } else {
      results.push(`${target.name}: energy fields collapse.`);
    }
  }

  await consumeGear(item);
  await postItemMessage(actor, item, `<p>${results.join("<br>")}</p>`);
  return true;
}

export function itemHasUseAction(item) {
  if (item?.type === "gear") return (item.system?.action?.mode ?? "none") !== "none";
  return false;
}

export function itemActionLabel(item) {
  return itemHasUseAction(item) ? "Use" : "";
}

export async function useGear(actor, item, { skipArtifactCheck = false } = {}) {
  if (item.system.artifact?.isArtifact && !skipArtifactCheck) {
    const { useArtifactItem } = await import("./artifacts.mjs");
    return useArtifactItem(actor, item);
  }

  // Any gear item with a non-zero `system.area.radius` routes through the
  // MeasuredTemplate-based AOE flow before falling back to the legacy
  // action-mode dispatch. The AOE flow posts its own consolidated save card.
  if (Number(item.system.area?.radius ?? 0) > 0) {
    const { useAoeOrdnance } = await import("./aoe.mjs");
    const resolved = await useAoeOrdnance(actor, item);
    if (resolved) return true;
    // Fall through when the template placement was canceled — lets the legacy
    // action path still work if somebody has it configured.
  }

  switch (item.system.action?.mode) {
    case "area-damage":
      return useAreaDamage(actor, item);
    case "tear-gas-cloud":
      return useGasCloud(actor, item, "tear-gas");
    case "poison-cloud":
      return useGasCloud(actor, item, "poison-cloud");
    case "stun-cloud":
      return useGasCloud(actor, item, "stun-cloud");
    case "mutation-bomb":
      return useMutationBomb(actor, item);
    case "healing":
    case "radiation-heal":
      return useHealingGear(actor, item);
    case "rejuv":
      return useRejuvChamber(actor, item);
    case "portent":
      return usePortent(actor, item);
    case "life-ray":
      return useLifeRay(actor, item);
    case "charger":
      return useEnergyCellCharger(actor, item);
    case "photon":
      return usePhotonItem(actor, item, { fieldDamage: 100, disintegrates: false });
    case "torc":
    case "trek":
      return usePhotonItem(actor, item, {
        fieldDamage: item.system.action.mode === "trek" ? 30 : 0,
        disintegrates: true
      });
    case "negation":
      return useNegationBomb(actor, item);
    case "guided":
      return useGuidedItem(actor, item, {
        defaultApplyTo: item.system.action?.ongoing ? "self" : "chat",
        defaultNotes: item.system.action?.notes
      });
    case "none":
    default:
      return useGuidedItem(actor, item, {
        defaultApplyTo: "chat",
        defaultNotes: item.system.action?.notes || item.system.description?.value || "Guided use for this Ancient item."
      });
  }
}
