import { applyTemporaryEffect, removeTemporaryEffect } from "./effect-state.mjs";
import { runActorUpdate } from "./gm-executor.mjs";

function robotImpairments() {
  return [
    { id: "mobility", label: "Mobility damaged", changes: { movementMultiplier: 0.5 }, notes: "Locomotion impaired." },
    { id: "aim", label: "Targeting drift", changes: { toHitBonus: -2 }, notes: "Weapons tracking degrades." },
    { id: "defense", label: "Armor breach", changes: { acDelta: 1 }, notes: "Protective plating is compromised." },
    { id: "power", label: "Power fluctuation", changes: { damageFlat: -2 }, notes: "Subsystems are underpowered." }
  ];
}

export function actorIsRobot(actor) {
  return !!(actor?.system?.robotics?.isRobot || actor?.system?.details?.type === "robot");
}

export function applyRobotDerived(actor, derived) {
  if (!actorIsRobot(actor)) return;
  derived.poisonResistance = 18;
  derived.radiationResistance = 18;
  derived.hazardProtection ??= {};
  derived.hazardProtection.poison = true;
  derived.hazardProtection.radiation = true;
  derived.mentalImmune = true;
  derived.reactionAdjustment -= 2;
}

export async function syncRobotImpairments(actor) {
  if (!actorIsRobot(actor)) return;

  const max = Math.max(1, Number(actor.system.resources.hp.max ?? 1));
  const current = Math.max(0, Number(actor.system.resources.hp.value ?? 0));
  const lostQuarters = Math.floor(((max - current) / max) * 4);
  const impairments = robotImpairments();

  for (let index = 0; index < impairments.length; index += 1) {
    const impairment = impairments[index];
    const effectId = `robot:${impairment.id}`;
    if (index < lostQuarters) {
      await applyTemporaryEffect(actor, {
        id: effectId,
        label: impairment.label,
        mode: "generic",
        remainingRounds: 0,
        sourceName: "Robot damage",
        notes: impairment.notes,
        changes: impairment.changes
      });
    } else {
      await removeTemporaryEffect(actor, effectId);
    }
  }
}

export async function spendRobotPower(actor, amount = 1) {
  if (!actorIsRobot(actor)) return null;
  const current = Math.max(0, Number(actor.system.robotics.powerCurrent ?? 0));
  const next = Math.max(0, current - Math.max(0, Math.round(Number(amount) || 0)));
  const update = {
    "system.robotics.powerCurrent": next
  };
  if (!next) update["system.robotics.mode"] = "inactive";
  await runActorUpdate(actor, update);
  return next;
}

export async function rechargeRobot(actor) {
  if (!actorIsRobot(actor)) return null;
  const max = Math.max(0, Number(actor.system.robotics.powerMax ?? 0));
  await runActorUpdate(actor, {
    "system.robotics.powerCurrent": max,
    "system.robotics.mode": max > 0 ? "programmed" : actor.system.robotics.mode
  });
  return max;
}

export async function cycleRobotMode(actor) {
  if (!actorIsRobot(actor)) return null;
  const order = ["inactive", "programmed", "controlled", "wild"];
  const current = actor.system.robotics.mode ?? "inactive";
  const index = order.indexOf(current);
  const next = order[(index + 1) % order.length];
  await runActorUpdate(actor, { "system.robotics.mode": next });
  return next;
}

export async function repairRobot(actor) {
  if (!actorIsRobot(actor)) return null;

  const difficulty = Math.max(4, Math.round(Number(actor.system.robotics.repairDifficulty ?? 12) || 12));
  const intelligence = Math.round(Number(actor.system.attributes.in.value ?? 0));
  const bonus = Math.max(-2, intelligence - 10);
  const roll = await new Roll("1d20 + @bonus", { bonus }).evaluate();
  let healed = 0;

  if (roll.total >= difficulty) {
    const repairRoll = await new Roll("2d6").evaluate();
    healed = Math.max(0, repairRoll.total);
    await actor.heal(healed);
    await runActorUpdate(actor, { "system.robotics.malfunction": "" });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="gw-chat-card"><h3>Robot Repair</h3><p>${actor.name} regains ${healed} HP.</p></div>`,
      rolls: [roll, repairRoll]
    });
    return { success: true, roll, repairRoll, healed };
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card"><h3>Robot Repair</h3><p>${actor.name} repair attempt fails.</p></div>`,
    rolls: [roll]
  });
  return { success: false, roll, healed: 0 };
}
