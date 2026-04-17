import { SYSTEM_ID } from "./config.mjs";
import {
  buildMutationItemSource,
  describeMutation,
  getMutationRule,
  mutationActionLabel,
  mutationHasAction
} from "./mutation-rules.mjs";
import {
  applyTemporaryEffect,
  clearBarrier,
  removeTemporaryEffect,
  setBarrier
} from "./effect-state.mjs";
import {
  applyDamageToTargets,
  applyHealingToTargets,
  primaryTarget,
  resolveTargetActor,
  resolveHazardCard,
  rollMentalAttackCard,
  rollScaledDamageCard
} from "./dice.mjs";

function mutationUsageAvailable(item) {
  if (item.system.cooldown.current > 0) {
    ui.notifications?.warn(`${item.name} is cooling down for ${item.system.cooldown.current} more round(s).`);
    return false;
  }

  if (item.system.usage.limited && item.system.usage.uses <= 0) {
    ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Error.MutationNoUses"));
    return false;
  }

  return true;
}

async function setTokenStatus(actor, statusId, active) {
  try {
    await actor.toggleStatusEffect(statusId, { active });
  } catch (_error) {
    // Status sync is cosmetic; actor state is authoritative.
  }
}

function currentTargetActors() {
  return [...(game.user?.targets ?? new Set())]
    .map((token) => resolveTargetActor(token))
    .filter(Boolean);
}

function mutationEffectId(item, suffix = "effect") {
  return `${item.id}:${suffix}`;
}

function mutationBarrierId(item) {
  return mutationEffectId(item, "barrier");
}

function densityEffectData(choice) {
  if (choice === "light") {
    return {
      label: "Light Form",
      changes: {
        acDelta: 2,
        movementMultiplier: 1.5
      }
    };
  }

  return {
    label: "Dense Form",
    changes: {
      acDelta: -2,
      movementMultiplier: 0.5
    }
  };
}

async function commitMutationUse(item, {
  consumeUse = true,
  setCooldown = false,
  enabled = null,
  remaining = null,
  variant = null
} = {}) {
  const update = {};

  if (consumeUse && item.system.usage.limited) {
    update["system.usage.uses"] = Math.max(0, Number(item.system.usage.uses ?? 0) - 1);
  }
  if (setCooldown && Number(item.system.cooldown.max ?? 0) > 0) {
    update["system.cooldown.current"] = Number(item.system.cooldown.max ?? 0);
  }
  if (enabled != null) update["system.activation.enabled"] = !!enabled;
  if (remaining != null) update["system.activation.remaining"] = Math.max(0, Number(remaining) || 0);
  if (variant != null) update["system.reference.variant"] = variant;

  if (Object.keys(update).length) {
    await item.update(update);
  }
}

async function postMutationMessage(actor, item, content) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card gw-mutation-card"><h3>${item.name}</h3>${content}</div>`
  });
}

async function promptRounds(title, max = 10) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<form><label>Rounds of concentration:
      <input type="number" name="rounds" value="1" min="1" max="${max}" autofocus>
    </label></form>`,
    ok: {
      label: "Use",
      callback: (_event, button) => Number(new foundry.applications.ux.FormDataExtended(button.form).object.rounds)
    },
    rejectClose: false
  });
}

async function promptWillForceChoice() {
  return foundry.applications.api.DialogV2.prompt({
    window: { title: "Will Force" },
    content: `<form>
      <label>Boost:
        <select name="choice">
          <option value="to-hit">+1 to hit</option>
          <option value="ms">Mental Strength</option>
          <option value="dx">Dexterity</option>
          <option value="ch">Charisma</option>
          <option value="cn">Constitution</option>
          <option value="ps">Physical Strength</option>
        </select>
      </label>
    </form>`,
    ok: {
      label: "Activate",
      callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object.choice
    },
    rejectClose: false
  });
}

async function promptDensityChoice(title, { includeDuration = false } = {}) {
  const durationField = includeDuration
    ? `<label>Rounds:
        <input type="number" name="rounds" value="5" min="1" max="20">
      </label>`
    : "";

  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<form>
      <label>Form:
        <select name="choice">
          <option value="dense">Dense / compact (+protection, -speed)</option>
          <option value="light">Light / extended (-protection, +speed)</option>
        </select>
      </label>
      ${durationField}
    </form>`,
    ok: {
      label: "Apply",
      callback: (_event, button) => {
        const data = new foundry.applications.ux.FormDataExtended(button.form).object;
        if (!includeDuration) return data.choice;
        return {
          choice: data.choice,
          rounds: Math.max(1, Number(data.rounds) || 5)
        };
      }
    },
    rejectClose: false
  });
}

async function promptGuidedMutation(item) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title: item.name },
    content: `<form>
      <label>Track on:
        <select name="applyTo">
          <option value="chat">Chat only</option>
          <option value="self">Self</option>
          <option value="target">Current target</option>
          <option value="targets">All current targets</option>
        </select>
      </label>
      <label>Rounds to track:
        <input type="number" name="rounds" value="0" min="0" max="600">
      </label>
    </form>`,
    ok: {
      label: "Resolve",
      callback: (_event, button) => {
        const data = new foundry.applications.ux.FormDataExtended(button.form).object;
        return {
          applyTo: data.applyTo || "chat",
          rounds: Math.max(0, Number(data.rounds) || 0)
        };
      }
    },
    rejectClose: false
  });
}

async function storedBarrierTarget(actor, item) {
  const targetUuid = item.getFlag(SYSTEM_ID, "barrierTargetUuid");
  if (!targetUuid) return actor;
  const target = await fromUuid(targetUuid);
  return target ?? actor;
}

async function clearBarrierTargetFlag(item) {
  if (item.getFlag(SYSTEM_ID, "barrierTargetUuid")) {
    await item.unsetFlag(SYSTEM_ID, "barrierTargetUuid");
  }
}

async function applyToggleAutomation(actor, item, { variant = "" } = {}) {
  switch (item.name) {
    case "Light Wave Manipulation":
    case "Chameleon Powers":
      await setTokenStatus(actor, "invisible", true);
      break;

    case "Density Control": {
      const effect = densityEffectData(variant || "dense");
      await applyTemporaryEffect(actor, {
        id: mutationEffectId(item, "density"),
        label: `${item.name} (${effect.label})`,
        mode: "generic",
        remainingRounds: 0,
        sourceName: item.name,
        changes: effect.changes
      });
      break;
    }

    case "Force Field Generation":
    case "Repulsion Field": {
      const targetActor = item.name === "Repulsion Field"
        ? (primaryTarget()?.actor ?? actor)
        : actor;
      const barrierRoll = await new Roll(item.system.effect.formula || "5d6").evaluate();
      await barrierRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${item.name} capacity`
      });
      await setBarrier(targetActor, {
        id: mutationBarrierId(item),
        label: item.name,
        sourceName: item.name,
        remaining: barrierRoll.total
      });
      if ((item.name === "Repulsion Field") && (targetActor.uuid !== actor.uuid)) {
        await item.setFlag(SYSTEM_ID, "barrierTargetUuid", targetActor.uuid);
      } else {
        await clearBarrierTargetFlag(item);
      }
      break;
    }

    default:
      break;
  }
}

async function clearToggleAutomation(actor, item) {
  switch (item.name) {
    case "Light Wave Manipulation":
    case "Chameleon Powers":
      await setTokenStatus(actor, "invisible", false);
      break;

    case "Density Control":
      await removeTemporaryEffect(actor, mutationEffectId(item, "density"));
      break;

    case "Force Field Generation":
    case "Repulsion Field": {
      const targetActor = await storedBarrierTarget(actor, item);
      await clearBarrier(targetActor, mutationBarrierId(item));
      await clearBarrierTargetFlag(item);
      break;
    }

    default:
      break;
  }
}

async function handleToggle(actor, item) {
  const enabling = !item.system.activation.enabled;
  let remaining = item.system.activation.remaining ?? 0;
  let variant = item.system.reference.variant ?? "";

  if (item.name === "Will Force" && enabling) {
    variant = await promptWillForceChoice();
    if (!variant) return false;
    const roll = await new Roll(item.system.effect.formula || "1d10").evaluate();
    remaining = roll.total;
  } else if (item.name === "Mental Control Over Physical State" && enabling) {
    const roll = await new Roll(item.system.effect.formula || "5d10").evaluate();
    remaining = roll.total;
  } else if (item.name === "Density Control" && enabling) {
    variant = await promptDensityChoice(item.name);
    if (!variant) return false;
  } else if (["Force Field Generation", "Repulsion Field"].includes(item.name) && enabling) {
    remaining = 600;
  } else if (!enabling) {
    remaining = 0;
  }

  await commitMutationUse(item, {
    consumeUse: enabling,
    setCooldown: enabling,
    enabled: enabling,
    remaining,
    variant
  });

  if (enabling) await applyToggleAutomation(actor, item, { variant });
  else await clearToggleAutomation(actor, item);

  const actionLabel = enabling ? "activated" : "deactivated";
  const durationLine = remaining ? `<p>Duration remaining: ${remaining} round(s).</p>` : "";
  await postMutationMessage(actor, item, `<p>${actor.name} has ${actionLabel} ${item.name}.</p>${durationLine}<p>${describeMutation(item)}</p>`);
  await actor.refreshDerivedResources({ adjustCurrent: false });
  return true;
}

async function handleRampingDamage(actor, item) {
  const rounds = await promptRounds(item.name, 10);
  if (!rounds) return false;
  await commitMutationUse(item, { consumeUse: true, setCooldown: false });
  await rollScaledDamageCard({
    actor,
    sourceName: item.name,
    baseFormula: item.system.effect.formula || "1d6",
    multiplier: rounds,
    damageType: item.name === "Cryokinesis" ? "cold" : "heat",
    notes: `${rounds} round(s) of concentration.`
  });
  return true;
}

async function handleDamage(actor, item) {
  await commitMutationUse(item, { consumeUse: true, setCooldown: false });
  const targetUuid = primaryTarget()?.actor?.uuid ?? null;
  await rollScaledDamageCard({
    actor,
    sourceName: item.name,
    baseFormula: item.system.effect.formula || "1d6",
    targetUuid,
    damageType: item.system.effect.saveType || "physical",
    notes: describeMutation(item)
  });
  return true;
}

async function handleAreaDamage(actor, item) {
  const targets = currentTargetActors();
  await commitMutationUse(item, { consumeUse: true, setCooldown: true });
  await rollScaledDamageCard({
    actor,
    sourceName: item.name,
    baseFormula: item.system.effect.formula || "1d6",
    targetUuid: null,
    targetUuids: targets.map((target) => target.uuid),
    damageType: "area",
    notes: "Apply to all current targets."
  });
  return true;
}

async function handleMentalDamage(actor, item) {
  const target = primaryTarget();
  if (!target?.actor) {
    ui.notifications?.warn("Target a token before using a mental attack.");
    return false;
  }

  await commitMutationUse(item, { consumeUse: true, setCooldown: true });
  await rollMentalAttackCard({
    actor,
    sourceName: item.name,
    sourceUuid: item.uuid,
    targetUuid: target.actor.uuid,
    damageFormula: item.system.effect.formula || "3d6",
    notes: item.system.effect.notes
  });
  return true;
}

async function handleRadiationEyes(actor, item) {
  const target = primaryTarget();
  if (!target?.actor) {
    ui.notifications?.warn("Target a token before using Radiated Eyes.");
    return false;
  }

  await commitMutationUse(item, { consumeUse: true, setCooldown: true });
  const intensityRoll = await new Roll(item.system.effect.formula || "3d6").evaluate();
  await intensityRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${item.name} intensity`
  });
  await resolveHazardCard(target.actor, "radiation", intensityRoll.total, { sourceName: item.name });
  return true;
}

async function handleLightGeneration(actor, item) {
  const targets = currentTargetActors();
  if (!targets.length) {
    ui.notifications?.warn("Target every creature dazzled by the burst of light.");
    return false;
  }

  await commitMutationUse(item, { consumeUse: true, setCooldown: true });
  const durationRoll = await new Roll(item.system.effect.formula || "1d4").evaluate();
  await durationRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${item.name} duration`
  });
  for (const target of targets) {
    await applyTemporaryEffect(target, {
      id: `${item.id}:light:${target.id}`,
      label: item.name,
      mode: "generic",
      remainingRounds: durationRoll.total,
      statusId: "blind",
      sourceName: item.name,
      changes: {
        acDelta: 4,
        toHitBonus: -4
      }
    });
  }
  await postMutationMessage(
    actor,
    item,
    `<p>${targets.map((target) => target.name).join(", ")} are dazzled for ${durationRoll.total} round(s).</p>
     <p>The effect applies blind status plus +4 AC and -4 to-hit while it lasts.</p>`
  );
  return true;
}

async function handleDensityControlOthers(actor, item) {
  const target = primaryTarget();
  if (!target?.actor) {
    ui.notifications?.warn("Target a token before using Density Control (Others).");
    return false;
  }

  const configuration = await promptDensityChoice(item.name, { includeDuration: true });
  if (!configuration?.choice) return false;

  await commitMutationUse(item, { consumeUse: true, setCooldown: true });
  const hit = await rollMentalAttackCard({
    actor,
    sourceName: item.name,
    sourceUuid: item.uuid,
    targetUuid: target.actor.uuid,
    damageFormula: "0",
    notes: item.system.effect.notes,
    showFollowUp: false
  });
  if (!hit) return true;

  const effect = densityEffectData(configuration.choice);
  await applyTemporaryEffect(target.actor, {
    id: `${item.id}:density:${target.actor.id}`,
    label: `${item.name} (${effect.label})`,
    mode: "generic",
    remainingRounds: configuration.rounds,
    sourceName: item.name,
    changes: effect.changes
  });
  await postMutationMessage(
    actor,
    item,
    `<p>${target.actor.name} is forced into ${effect.label.toLowerCase()} for ${configuration.rounds} round(s).</p>`
  );
  return true;
}

async function handleLifeLeech(actor, item) {
  const targets = currentTargetActors();
  if (!targets.length) {
    ui.notifications?.warn("Target at least one creature for Life Leech.");
    return false;
  }

  await commitMutationUse(item, { consumeUse: true, setCooldown: true });
  const amount = 6;
  await applyDamageToTargets(amount);
  await actor.heal(amount * targets.length);
  await postMutationMessage(
    actor,
    item,
    `<p>${actor.name} drains ${amount} hit points from each targeted creature and heals ${amount * targets.length} HP.</p>`
  );
  return true;
}

async function handleDeathField(actor, item) {
  const targets = currentTargetActors();
  if (!targets.length) {
    ui.notifications?.warn("Target at least one creature for Death Field Generation.");
    return false;
  }

  await commitMutationUse(item, { consumeUse: true, setCooldown: true, enabled: true });
  for (const target of targets) {
    await target.update({ "system.resources.hp.value": Math.min(1, Number(target.system.resources.hp.value ?? 1)) });
  }

  const recoveryRoll = await new Roll("1d20").evaluate();
  await item.update({ "system.activation.remaining": recoveryRoll.total });
  await postMutationMessage(
    actor,
    item,
    `<p>${actor.name} drains all but 1 HP from each targeted creature.</p>
     <p>The user is nearly unconscious for ${recoveryRoll.total} round(s).</p>`
  );
  return true;
}

async function handleFullHeal(actor, item) {
  await commitMutationUse(item, { consumeUse: true, setCooldown: false });
  const max = Number(actor.system.resources.hp.max ?? 0);
  await actor.update({ "system.resources.hp.value": max });
  await postMutationMessage(actor, item, `<p>${actor.name} recovers to full hit points.</p>`);
  return true;
}

async function handleMentalControl(actor, item) {
  const target = primaryTarget();
  if (!target?.actor) {
    ui.notifications?.warn("Target a token before using Mental Control.");
    return false;
  }

  const rounds = await promptRounds(item.name, 20);
  if (!rounds) return false;

  await commitMutationUse(item, { consumeUse: true, setCooldown: true });
  const hit = await rollMentalAttackCard({
    actor,
    sourceName: item.name,
    sourceUuid: item.uuid,
    targetUuid: target.actor.uuid,
    damageFormula: "0",
    notes: item.system.effect.notes,
    showFollowUp: false
  });
  if (!hit) return true;

  await applyTemporaryEffect(target.actor, {
    id: `${item.id}:mental-control:${target.actor.id}`,
    label: item.name,
    mode: "generic",
    remainingRounds: rounds,
    sourceName: item.name,
    notes: `${actor.name} directs ${target.actor.name}.`
  });
  await postMutationMessage(
    actor,
    item,
    `<p>${target.actor.name} falls under ${actor.name}'s control for ${rounds} round(s).</p>`
  );
  return true;
}

async function handleNote(actor, item) {
  await commitMutationUse(item, { consumeUse: true, setCooldown: true });
  await postMutationMessage(
    actor,
    item,
    `<p>${describeMutation(item)}</p><p>${item.system.effect.notes || ""}</p>`
  );
  return true;
}

async function handleGuided(actor, item) {
  const setup = await promptGuidedMutation(item);
  if (!setup) return false;

  let targets = [];
  if (setup.applyTo === "self") targets = [actor];
  else if (setup.applyTo === "target") {
    const target = primaryTarget()?.actor ?? null;
    if (target) targets = [target];
  } else if (setup.applyTo === "targets") {
    targets = currentTargetActors();
  }

  if ((setup.applyTo !== "chat") && !targets.length) {
    ui.notifications?.warn("Select a target or choose chat-only tracking for this mutation.");
    return false;
  }

  await commitMutationUse(item, { consumeUse: true, setCooldown: true });

  for (const target of targets) {
    await applyTemporaryEffect(target, {
      id: `${item.id}:guided:${target.id}`,
      label: item.name,
      mode: "generic",
      remainingRounds: setup.rounds,
      sourceName: item.name,
      notes: item.system.effect.notes || describeMutation(item),
      changes: {}
    });
  }

  const trackedNames = targets.length ? targets.map((target) => target.name).join(", ") : "chat only";
  await postMutationMessage(
    actor,
    item,
    `<p>${describeMutation(item)}</p>
     <p>${item.system.effect.notes || ""}</p>
     <p>Tracking: ${trackedNames}${setup.rounds > 0 ? ` for ${setup.rounds} round(s)` : ""}.</p>`
  );
  return true;
}

export async function useMutation(actor, item) {
  if (!mutationHasAction(item)) {
    await postMutationMessage(actor, item, `<p>${describeMutation(item)}</p>`);
    return true;
  }

  const rule = getMutationRule(item);
  const isToggleAction = ["toggle", "toggle-density"].includes(rule.action);
  const enabling = isToggleAction ? !item.system.activation.enabled : true;
  if (enabling && !mutationUsageAvailable(item)) return false;

  switch (rule.action) {
    case "toggle":
    case "toggle-density":
      return handleToggle(actor, item);
    case "ramping-damage":
      return handleRampingDamage(actor, item);
    case "damage":
      return handleDamage(actor, item);
    case "area-damage":
      return handleAreaDamage(actor, item);
    case "mental-damage":
      return handleMentalDamage(actor, item);
    case "radiation-eyes":
      return handleRadiationEyes(actor, item);
    case "light-generation":
      return handleLightGeneration(actor, item);
    case "density-control-others":
      return handleDensityControlOthers(actor, item);
    case "life-leech":
      return handleLifeLeech(actor, item);
    case "death-field":
      return handleDeathField(actor, item);
    case "full-heal":
      return handleFullHeal(actor, item);
    case "mental-control":
      return handleMentalControl(actor, item);
    case "guided":
      return handleGuided(actor, item);
    case "note":
    default:
      return handleGuided(actor, item);
  }
}

export async function resetMutationResources(actor) {
  const updates = actor.items
    .filter((item) => item.type === "mutation")
    .map((item) => ({
      _id: item.id,
      "system.usage.uses": item.system.usage.max ?? item.system.usage.uses,
      "system.cooldown.current": 0
    }));

  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }
}

export async function tickMutationStateForActor(actor) {
  const updates = [];

  for (const item of actor.items.filter((entry) => entry.type === "mutation")) {
    const cooldown = Math.max(0, Number(item.system.cooldown.current ?? 0));
    const remaining = Math.max(0, Number(item.system.activation.remaining ?? 0));
    const patch = { _id: item.id };
    let changed = false;

    if (cooldown > 0) {
      patch["system.cooldown.current"] = cooldown - 1;
      changed = true;
    }
    if (remaining > 0) {
      const next = remaining - 1;
      patch["system.activation.remaining"] = next;
      if (next <= 0 && item.system.activation.enabled) {
        patch["system.activation.enabled"] = false;
        await clearToggleAutomation(actor, item);
      }
      changed = true;
    }

    if (changed) updates.push(patch);
  }

  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
    await actor.refreshDerivedResources({ adjustCurrent: false });
  }
}

export async function tickCombatMutationState(combat, changed) {
  if (!game.user?.isGM) return;
  if (!("round" in changed) || changed.round == null) return;

  const actors = new Set();
  for (const combatant of combat.combatants) {
    if (combatant.actor) actors.add(combatant.actor);
  }

  for (const actor of actors) {
    await tickMutationStateForActor(actor);
  }
}

export { buildMutationItemSource, mutationActionLabel, mutationHasAction };
