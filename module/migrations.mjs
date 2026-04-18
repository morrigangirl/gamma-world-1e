import { SYSTEM_ID, CRYPTIC_ALLIANCES } from "./config.mjs";
import { findMutationByName } from "./tables/mutation-data.mjs";
import { getMutationRule } from "./mutation-rules.mjs";
import { equipmentMigrationUpdate, inferGearSubtype, inferWeaponCategory } from "./equipment-rules.mjs";
import { prototypeTokenMigrationUpdate } from "./token-defaults.mjs";

const ALLIANCE_ALIASES = {
  "brotherhood of thought":    "brotherhood",
  "thought":                   "brotherhood",
  "the seekers":               "seekers",
  "seekers":                   "seekers",
  "zoopremisists":             "zoopremisists",
  "zoo":                       "zoopremisists",
  "the healers":               "healers",
  "healers":                   "healers",
  "restorationists":           "restorationists",
  "followers of the voice":    "followers",
  "followers":                 "followers",
  "ranks of the fit":          "ranks-of-the-fit",
  "the archivists":            "archivists",
  "archivists":                "archivists",
  "radiationists":             "radiationists",
  "the created":               "created",
  "created":                   "created"
};

function normalizeAlliance(current) {
  if (!current) return "";
  if (Object.prototype.hasOwnProperty.call(CRYPTIC_ALLIANCES, current)) return current;
  const hit = ALLIANCE_ALIASES[String(current).trim().toLowerCase()];
  return hit ?? current; // preserve unknown homebrew strings
}

export function registerMigrationSettings() {
  game.settings.register(SYSTEM_ID, "schemaVersion", {
    name: "Schema Version",
    scope: "world",
    config: false,
    type: String,
    default: "0.0.0"
  });

  game.settings.register(SYSTEM_ID, "pshTechReliable", {
    name: "GAMMA_WORLD.Settings.PshTechReliable.Name",
    hint: "GAMMA_WORLD.Settings.PshTechReliable.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
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
    // 0.5.0: tag weapon category if missing.
    const currentCategory = String(item.system.category ?? "");
    if (!currentCategory || currentCategory === "primitive") {
      const inferred = inferWeaponCategory(item);
      if (inferred !== currentCategory) update["system.category"] = inferred;
    }
  }

  if (item.type === "gear") {
    // 0.5.0: tag gear subtype if missing.
    const currentSubtype = String(item.system.subtype ?? "");
    if (!currentSubtype || currentSubtype === "misc") {
      const inferred = inferGearSubtype(item);
      if (inferred && inferred !== currentSubtype) update["system.subtype"] = inferred;
    }
  }

  if (item.type === "mutation") {
    Object.assign(update, mutationUpdateData(item));
  }

  if (Object.keys(update).length) {
    await item.update(update, { gammaWorldSync: true });
  }
}

/**
 * Map ammoType keys to the canonical ammo gear item names that the generator
 * produces. Used by the inline-ammo migration to figure out which gear item
 * to grant on the actor.
 */
const AMMO_GEAR_BY_TYPE = {
  "arrow":             "Arrows (bundle of 20)",
  "crossbow-bolt":     "Crossbow Bolts (bundle of 20)",
  "sling-stone":       "Sling Stones (pouch of 30)",
  "sling-bullet":      "Sling Bullets (pouch of 30)",
  "slug":              "Slug-Thrower Rounds (clip of 15)",
  "needler-paralysis": "Needler Darts, Paralysis (10)",
  "needler-poison":    "Needler Darts, Poison (10)",
  "stun-cell":         "Stun Rifle Cell (10 shots)",
  "javelin":           "Javelin (single)",
  "gyrojet":           "Gyrojet Slugs (clip of 10)"
};

/**
 * For ranged weapons on an actor with an inline ammo counter, create a gear
 * ammo item alongside the weapon and zero the inline counter. Called once per
 * actor during migration.
 */
async function migrateInlineAmmoToGear(actor) {
  const weapons = actor.items.filter((i) => i.type === "weapon"
    && i.system?.ammoType
    && Number(i.system?.ammo?.current ?? 0) > 0);
  if (!weapons.length) return;

  const equipmentPack = game.packs?.get(`${SYSTEM_ID}.equipment`);
  for (const weapon of weapons) {
    const ammoType = String(weapon.system.ammoType);
    const gearName = AMMO_GEAR_BY_TYPE[ammoType];
    if (!gearName) continue;

    // Skip if the actor already has ammo of this type.
    const existing = actor.items.find((i) => i.type === "gear"
      && i.system?.subtype === "ammunition"
      && i.system?.ammo?.type === ammoType);
    if (existing) {
      const combined = Math.max(0, Number(existing.system.ammo?.rounds ?? 0))
        + Math.max(0, Number(weapon.system.ammo?.current ?? 0));
      await existing.update({ "system.ammo.rounds": combined }, { gammaWorldSync: true });
    } else if (equipmentPack) {
      const packIndex = await equipmentPack.getIndex();
      const entry = packIndex.find((e) => e.name === gearName);
      if (entry) {
        const source = await equipmentPack.getDocument(entry._id);
        const data = source.toObject();
        data.system.ammo.rounds = Math.max(0, Number(weapon.system.ammo?.current ?? 0));
        await Item.create(data, { parent: actor, gammaWorldSync: true });
      }
    }

    await weapon.update({
      "system.ammo.current": 0,
      "system.ammo.max": 0,
      "system.ammo.consumes": false
    }, { gammaWorldSync: true });
  }
}

/**
 * Delete the legacy "Broadcast Power Station" world item if it exists
 * (it was removed in 0.5.0 — broadcast power is ambient infrastructure,
 * not a portable item).
 */
async function removeLegacyBroadcastPowerItems() {
  const offenders = game.items?.contents?.filter((item) => item.name === "Broadcast Power Station") ?? [];
  for (const item of offenders) {
    await item.delete();
  }
  // Also scrub it from any actor inventory.
  for (const actor of game.actors?.contents ?? []) {
    const onActor = actor.items.filter((i) => i.name === "Broadcast Power Station");
    for (const i of onActor) await i.delete();
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
  // 0.5.0 schema additions
  const normalizedAlliance = normalizeAlliance(actor.system.details?.alliance ?? "");
  if (normalizedAlliance !== (actor.system.details?.alliance ?? "")) {
    update["system.details.alliance"] = normalizedAlliance;
  }
  if (actor.system.advancement?.availableBonuses == null) update["system.advancement.availableBonuses"] = [];
  if (actor.system.advancement?.appliedBonuses == null) update["system.advancement.appliedBonuses"] = [];
  if (actor.system.combat?.fatigue?.round == null) update["system.combat.fatigue.round"] = 0;
  if (actor.system.combat?.fatigue?.modifier == null) update["system.combat.fatigue.modifier"] = 0;
  if (actor.system.encumbrance?.carried == null) update["system.encumbrance.carried"] = 0;
  if (actor.system.encumbrance?.max == null) update["system.encumbrance.max"] = 0;
  if (actor.system.encumbrance?.penalized == null) update["system.encumbrance.penalized"] = false;
  if (actor.system.resources?.hp?.restDaily == null) update["system.resources.hp.restDaily"] = 1;
  if (actor.system.resources?.hp?.medical == null) update["system.resources.hp.medical"] = 0;
  Object.assign(update, prototypeTokenMigrationUpdate(actor));

  if (Object.keys(update).length) {
    await actor.update(update, { gammaWorldSync: true });
  }

  for (const item of actor.items) {
    await migrateItem(item);
  }

  // 0.5.0: convert inline ammo counters into ammo gear items.
  await migrateInlineAmmoToGear(actor);

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

  // 0.5.0: remove the deprecated Broadcast Power Station item.
  await removeLegacyBroadcastPowerItems();

  await game.settings.set(SYSTEM_ID, "schemaVersion", currentVersion);
}
