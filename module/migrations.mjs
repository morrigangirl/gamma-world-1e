import { SYSTEM_ID } from "./config.mjs";
import { findMutationByName } from "./tables/mutation-data.mjs";
import { getMutationRule } from "./mutation-rules.mjs";
import { equipmentMigrationUpdate } from "./equipment-rules.mjs";
import { prototypeTokenMigrationUpdate } from "./token-defaults.mjs";

export function registerMigrationSettings() {
  game.settings.register(SYSTEM_ID, "schemaVersion", {
    name: "Schema Version",
    scope: "world",
    config: false,
    type: String,
    default: "0.0.0"
  });
}

function mutationUpdateData(item) {
  const update = {};
  const definition = findMutationByName(item.name);
  const rule = getMutationRule(item);
  const system = item.system;

  if (!system.code && definition?.code) update["system.code"] = definition.code;
  if (!system.summary && definition?.summary) update["system.summary"] = definition.summary;
  if (!system.reference?.table && definition?.subtype) update["system.reference.table"] = definition.subtype;
  if (!(system.reference?.page > 0) && definition?.page) update["system.reference.page"] = definition.page;
  if (!system.activation?.mode) update["system.activation.mode"] = rule.mode;
  if ((system.activation?.mode ?? "passive") === "passive" && rule.mode !== "passive") {
    update["system.activation.mode"] = rule.mode;
    update["system.active"] = true;
  } else if (system.active == null) {
    update["system.active"] = rule.mode !== "passive";
  }
  if (system.activation?.enabled == null) update["system.activation.enabled"] = false;
  if (system.activation?.remaining == null) update["system.activation.remaining"] = 0;
  if (system.range === "" && rule.range) update["system.range"] = rule.range;
  if (system.duration === "" && rule.duration) update["system.duration"] = rule.duration;
  if (!system.effect?.formula && rule.effect?.formula) update["system.effect.formula"] = rule.effect.formula;
  if (!system.effect?.saveType && rule.effect?.saveType) update["system.effect.saveType"] = rule.effect.saveType;
  if (!system.effect?.notes && rule.effect?.notes) update["system.effect.notes"] = rule.effect.notes;
  if (system.usage?.limited == null) update["system.usage.limited"] = !!rule.usage?.limited;
  if (!system.usage?.per) update["system.usage.per"] = rule.usage?.per ?? "at-will";
  if ((system.usage?.max ?? 0) === 0 && Number(rule.usage?.max ?? 0) > 0) {
    update["system.usage.max"] = rule.usage.max;
    if ((system.usage?.uses ?? 0) === 0) update["system.usage.uses"] = rule.usage.max;
  }
  if ((system.cooldown?.max ?? 0) === 0 && Number(rule.cooldown?.max ?? 0) > 0) {
    update["system.cooldown.max"] = rule.cooldown.max;
  }

  return update;
}

async function migrateItem(item) {
  const update = equipmentMigrationUpdate(item);

  if (item.type === "weapon") {
    const weaponClass = Math.max(1, Math.min(16, Math.round(Number(item.system.weaponClass) || 1)));
    if (weaponClass !== item.system.weaponClass) {
      update["system.weaponClass"] = weaponClass;
    }
    if (!item.system.effect?.mode) {
      update["system.effect.mode"] = "damage";
    }
  }

  if (item.type === "mutation") {
    Object.assign(update, mutationUpdateData(item));
  }

  if (Object.keys(update).length) {
    await item.update(update, { gammaWorldSync: true });
  }
}

async function migrateActor(actor) {
  const update = {};
  const hpBase = Number(actor.system.resources?.hp?.base ?? 0);
  const hpMax = Number(actor.system.resources?.hp?.max ?? 0);
  if (!(hpBase > 0) && hpMax > 0) {
    update["system.resources.hp.base"] = hpMax;
  }
  if (!(Number(actor.system.combat?.baseAc) >= 1)) {
    update["system.combat.baseAc"] = 10;
  }
  if (!actor.system.combat?.naturalAttack?.name) {
    update["system.combat.naturalAttack.name"] = "Natural Attack";
  }
  if (!actor.system.combat?.naturalAttack?.damage) {
    update["system.combat.naturalAttack.damage"] = "1d3";
  }
  if (actor.system.details?.role == null) update["system.details.role"] = "adventurer";
  if (actor.system.details?.speech == null) update["system.details.speech"] = "common";
  if (actor.system.details?.creatureClass == null) update["system.details.creatureClass"] = "";
  if (actor.system.social?.languages == null) update["system.social.languages"] = "Common";
  if (actor.system.social?.literacy == null) update["system.social.literacy"] = "";
  if (actor.system.social?.relatives == null) update["system.social.relatives"] = "";
  if (actor.system.social?.homeRegion == null) update["system.social.homeRegion"] = "";
  if (actor.system.social?.reputation == null) update["system.social.reputation"] = 0;
  if (actor.system.encounter?.reactionModifier == null) update["system.encounter.reactionModifier"] = 0;
  if (actor.system.encounter?.surpriseModifier == null) update["system.encounter.surpriseModifier"] = 0;
  if (actor.system.encounter?.morale == null) update["system.encounter.morale"] = 0;
  if (actor.system.encounter?.intelligence == null) update["system.encounter.intelligence"] = "auto";
  if (actor.system.encounter?.cannotBeSurprised == null) update["system.encounter.cannotBeSurprised"] = false;
  if (actor.system.robotics?.isRobot == null) update["system.robotics.isRobot"] = actor.system.details?.type === "robot";
  if (actor.system.robotics?.mode == null) update["system.robotics.mode"] = actor.system.details?.type === "robot" ? "programmed" : "inactive";
  if (actor.system.robotics?.powerSource == null) update["system.robotics.powerSource"] = actor.system.details?.type === "robot" ? "broadcast" : "none";
  if (actor.system.robotics?.powerCurrent == null) update["system.robotics.powerCurrent"] = 0;
  if (actor.system.robotics?.powerMax == null) update["system.robotics.powerMax"] = 0;
  if (actor.system.robotics?.broadcastCapable == null) update["system.robotics.broadcastCapable"] = actor.system.details?.type === "robot";
  if (actor.system.robotics?.backupHours == null) update["system.robotics.backupHours"] = 0;
  if (actor.system.robotics?.repairDifficulty == null) update["system.robotics.repairDifficulty"] = 0;
  if (actor.system.robotics?.malfunction == null) update["system.robotics.malfunction"] = "";
  if (actor.system.chargen?.mutationMethod == null) update["system.chargen.mutationMethod"] = "random";
  Object.assign(update, prototypeTokenMigrationUpdate(actor));

  if (Object.keys(update).length) {
    await actor.update(update, { gammaWorldSync: true });
  }

  for (const item of actor.items) {
    await migrateItem(item);
  }

  await actor.refreshDerivedResources({ adjustCurrent: false });
}

export async function migrateWorld() {
  if (!game.user?.isGM) return;

  const currentVersion = game.system.version ?? "0.1.0";
  const storedVersion = game.settings.get(SYSTEM_ID, "schemaVersion");
  if (storedVersion === currentVersion) return;

  for (const item of game.items.contents) {
    await migrateItem(item);
  }

  for (const actor of game.actors.contents) {
    await migrateActor(actor);
  }

  await game.settings.set(SYSTEM_ID, "schemaVersion", currentVersion);
}
