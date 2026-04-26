import { SYSTEM_ID, CRYPTIC_ALLIANCES, SKILLS } from "./config.mjs";
import { findMutationByName } from "./tables/mutation-data.mjs";
import { getMutationRule } from "./mutation-rules.mjs";
import { equipmentMigrationUpdate, inferGearSubtype, inferWeaponCategory, CONSUMPTION_CATALOG, consumptionRateFor } from "./equipment-rules.mjs";
import { prototypeTokenMigrationUpdate } from "./token-defaults.mjs";
import { GammaWorldConfig } from "./apps/gm-automation-config.mjs";
import { legacyToMeters } from "./movement-conversion.mjs";
import {
  AMMO_GEAR_BY_TYPE,
  WEAPON_RENAMES_081,
  NEEDLER_NAMES_081,
  SLING_BULLETS_WEAPON_081,
  legacyAmmoTypeString
} from "./ammo-migration.mjs";

// Re-export so existing callers (tests, other modules) can keep pulling
// these off migrations.mjs.
export { WEAPON_RENAMES_081, NEEDLER_NAMES_081, SLING_BULLETS_WEAPON_081 };

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

  // A single menu button in the default Settings panel opens the dedicated
  // Gamma World Configuration window. Every world-scoped toggle below is
  // `config: false` and lives only inside that window, so the default panel
  // doesn't balloon as new automation knobs land.
  game.settings.registerMenu(SYSTEM_ID, "gwConfigWindow", {
    name: "GAMMA_WORLD.Settings.Config.MenuName",
    label: "GAMMA_WORLD.Settings.Config.MenuLabel",
    hint: "GAMMA_WORLD.Settings.Config.MenuHint",
    icon: "fa-solid fa-sliders",
    type: GammaWorldConfig,
    restricted: true
  });

  game.settings.register(SYSTEM_ID, "pshTechReliable", {
    name: "GAMMA_WORLD.Settings.PshTechReliable.Name",
    hint: "GAMMA_WORLD.Settings.PshTechReliable.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  // Retained (hidden) for one deprecation cycle so the 0.6.0 → 0.7.0 migration
  // can read the old value and translate it into `npcDamageMode`. Remove in 0.8.0.
  game.settings.register(SYSTEM_ID, "autoRollNpcDamage", {
    name: "GAMMA_WORLD.Settings.AutoRollNpcDamage.Name",
    hint: "GAMMA_WORLD.Settings.AutoRollNpcDamage.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "npcDamageMode", {
    name: "GAMMA_WORLD.Settings.NpcDamageMode.Name",
    hint: "GAMMA_WORLD.Settings.NpcDamageMode.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      none: "GAMMA_WORLD.Settings.NpcDamageMode.Choice.None",
      onHit: "GAMMA_WORLD.Settings.NpcDamageMode.Choice.OnHit",
      always: "GAMMA_WORLD.Settings.NpcDamageMode.Choice.Always"
    },
    default: "onHit"
  });

  game.settings.register(SYSTEM_ID, "promptBeforeApplyDamage", {
    name: "GAMMA_WORLD.Settings.PromptBeforeApplyDamage.Name",
    hint: "GAMMA_WORLD.Settings.PromptBeforeApplyDamage.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "npcSaveMode", {
    name: "GAMMA_WORLD.Settings.NpcSaveMode.Name",
    hint: "GAMMA_WORLD.Settings.NpcSaveMode.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      auto: "GAMMA_WORLD.Settings.NpcSaveMode.Choice.Auto",
      button: "GAMMA_WORLD.Settings.NpcSaveMode.Choice.Button"
    },
    default: "auto"
  });

  game.settings.register(SYSTEM_ID, "playerSaveTimeout", {
    name: "GAMMA_WORLD.Settings.PlayerSaveTimeout.Name",
    hint: "GAMMA_WORLD.Settings.PlayerSaveTimeout.Hint",
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    range: { min: 0, max: 300, step: 5 }
  });

  const ROLL_MODE_CHOICES = {
    publicroll: "GAMMA_WORLD.Settings.RollMode.Choice.Public",
    gmroll:     "GAMMA_WORLD.Settings.RollMode.Choice.GM",
    blindroll:  "GAMMA_WORLD.Settings.RollMode.Choice.Blind",
    selfroll:   "GAMMA_WORLD.Settings.RollMode.Choice.Self"
  };

  game.settings.register(SYSTEM_ID, "attackRollMode", {
    name: "GAMMA_WORLD.Settings.AttackRollMode.Name",
    hint: "GAMMA_WORLD.Settings.AttackRollMode.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: ROLL_MODE_CHOICES,
    default: "publicroll"
  });

  game.settings.register(SYSTEM_ID, "damageRollMode", {
    name: "GAMMA_WORLD.Settings.DamageRollMode.Name",
    hint: "GAMMA_WORLD.Settings.DamageRollMode.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: ROLL_MODE_CHOICES,
    default: "publicroll"
  });

  game.settings.register(SYSTEM_ID, "saveRollMode", {
    name: "GAMMA_WORLD.Settings.SaveRollMode.Name",
    hint: "GAMMA_WORLD.Settings.SaveRollMode.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: ROLL_MODE_CHOICES,
    default: "publicroll"
  });

  game.settings.register(SYSTEM_ID, "hideGmRollDetails", {
    name: "GAMMA_WORLD.Settings.HideGmRollDetails.Name",
    hint: "GAMMA_WORLD.Settings.HideGmRollDetails.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      none:   "GAMMA_WORLD.Settings.HideGmRollDetails.Choice.None",
      attack: "GAMMA_WORLD.Settings.HideGmRollDetails.Choice.Attack",
      damage: "GAMMA_WORLD.Settings.HideGmRollDetails.Choice.Damage",
      save:   "GAMMA_WORLD.Settings.HideGmRollDetails.Choice.Save",
      all:    "GAMMA_WORLD.Settings.HideGmRollDetails.Choice.All"
    },
    default: "none"
  });

  game.settings.register(SYSTEM_ID, "suppressGmDiceAnimation", {
    name: "GAMMA_WORLD.Settings.SuppressGmDiceAnimation.Name",
    hint: "GAMMA_WORLD.Settings.SuppressGmDiceAnimation.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "autoRemoveInstantTemplate", {
    name: "GAMMA_WORLD.Settings.AutoRemoveInstantTemplate.Name",
    hint: "GAMMA_WORLD.Settings.AutoRemoveInstantTemplate.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "autoConsumeCharges", {
    name: "GAMMA_WORLD.Settings.AutoConsumeCharges.Name",
    hint: "GAMMA_WORLD.Settings.AutoConsumeCharges.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "autoTickFatigue", {
    name: "GAMMA_WORLD.Settings.AutoTickFatigue.Name",
    hint: "GAMMA_WORLD.Settings.AutoTickFatigue.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "resetFatigueOnCombatEnd", {
    name: "GAMMA_WORLD.Settings.ResetFatigueOnCombatEnd.Name",
    hint: "GAMMA_WORLD.Settings.ResetFatigueOnCombatEnd.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  // 0.14.1 — Short / Long Rest world-time advance. When true (default),
  // a Short Rest advances world time +1h and a Long Rest +6h, which means
  // hourly cell drain (Powered Plate, Energy Cloak) ticks while resting.
  // GMs can disable for tables that prefer manual time control.
  game.settings.register(SYSTEM_ID, "restAdvancesWorldTime", {
    name: "GAMMA_WORLD.Settings.RestAdvancesWorldTime.Name",
    hint: "GAMMA_WORLD.Settings.RestAdvancesWorldTime.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  // 0.14.6 — encounter-close XP + loot summary card. When true (default),
  // ending a combat (deleting it from the tracker) posts a GM-whisper
  // chat card with a "Distribute XP" button + per-defeated-monster
  // "Roll Loot" buttons. Disable for tables that prefer manual XP
  // tracking.
  game.settings.register(SYSTEM_ID, "encounterCloseSummary", {
    name: "GAMMA_WORLD.Settings.EncounterCloseSummary.Name",
    hint: "GAMMA_WORLD.Settings.EncounterCloseSummary.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "autoApplyOnHitConditions", {
    name: "GAMMA_WORLD.Settings.AutoApplyOnHitConditions.Name",
    hint: "GAMMA_WORLD.Settings.AutoApplyOnHitConditions.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "grenadePersistentRounds", {
    name: "GAMMA_WORLD.Settings.GrenadePersistentRounds.Name",
    hint: "GAMMA_WORLD.Settings.GrenadePersistentRounds.Hint",
    scope: "world",
    config: false,
    type: Number,
    default: 3,
    range: { min: 0, max: 20, step: 1 }
  });

  // Phase 6: Sound cues. Master toggle + 8 file-path settings, one per
  // combat event routed from the public hook surface. Leaving a path
  // empty silences that specific cue; flipping the master off silences
  // all cues without losing the configured paths.
  game.settings.register(SYSTEM_ID, "soundCuesEnabled", {
    name: "GAMMA_WORLD.Settings.SoundCuesEnabled.Name",
    hint: "GAMMA_WORLD.Settings.SoundCuesEnabled.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  const registerSoundCue = (key, nameLoc, hintLoc) => {
    game.settings.register(SYSTEM_ID, key, {
      name: nameLoc,
      hint: hintLoc,
      scope: "world",
      config: false,
      type: String,
      default: "",
      filePicker: "audio"
    });
  };
  registerSoundCue("soundCueAttackHit",
    "GAMMA_WORLD.Settings.SoundCueAttackHit.Name",
    "GAMMA_WORLD.Settings.SoundCueAttackHit.Hint");
  registerSoundCue("soundCueAttackMiss",
    "GAMMA_WORLD.Settings.SoundCueAttackMiss.Name",
    "GAMMA_WORLD.Settings.SoundCueAttackMiss.Hint");
  registerSoundCue("soundCueAttackCrit",
    "GAMMA_WORLD.Settings.SoundCueAttackCrit.Name",
    "GAMMA_WORLD.Settings.SoundCueAttackCrit.Hint");
  registerSoundCue("soundCueAttackFumble",
    "GAMMA_WORLD.Settings.SoundCueAttackFumble.Name",
    "GAMMA_WORLD.Settings.SoundCueAttackFumble.Hint");
  registerSoundCue("soundCueDamageApplied",
    "GAMMA_WORLD.Settings.SoundCueDamageApplied.Name",
    "GAMMA_WORLD.Settings.SoundCueDamageApplied.Hint");
  registerSoundCue("soundCueSaveSuccess",
    "GAMMA_WORLD.Settings.SoundCueSaveSuccess.Name",
    "GAMMA_WORLD.Settings.SoundCueSaveSuccess.Hint");
  registerSoundCue("soundCueSaveFail",
    "GAMMA_WORLD.Settings.SoundCueSaveFail.Name",
    "GAMMA_WORLD.Settings.SoundCueSaveFail.Hint");
  registerSoundCue("soundCueConditionApplied",
    "GAMMA_WORLD.Settings.SoundCueConditionApplied.Name",
    "GAMMA_WORLD.Settings.SoundCueConditionApplied.Hint");

  // 0.8.3 — Cinematic Roll Request cues. Intro fires when a banner
  // opens; success / failure fire at the outro phase based on the
  // aggregate result.
  registerSoundCue("soundCueCinematicIntro",
    "GAMMA_WORLD.Settings.SoundCueCinematicIntro.Name",
    "GAMMA_WORLD.Settings.SoundCueCinematicIntro.Hint");
  registerSoundCue("soundCueCinematicSuccess",
    "GAMMA_WORLD.Settings.SoundCueCinematicSuccess.Name",
    "GAMMA_WORLD.Settings.SoundCueCinematicSuccess.Hint");
  registerSoundCue("soundCueCinematicFailure",
    "GAMMA_WORLD.Settings.SoundCueCinematicFailure.Name",
    "GAMMA_WORLD.Settings.SoundCueCinematicFailure.Hint");
}

function mutationUpdateData(item) {
  const update = {};
  const definition = findMutationByName(item.name);
  const rule = getMutationRule(item);
  const system = item.system;

  if (!system.code && definition?.code) update["system.code"] = definition.code;
  // 0.12.0 — system.summary was dropped from the schema. Issue a field
  // deletion so pre-0.12.0 items stored with a summary don't leave
  // stale data in the DB. Foundry's `system.-=summary: null` idiom
  // silently no-ops when the field is already absent.
  if (item._source?.system && "summary" in item._source.system) {
    update["system.-=summary"] = null;
  }
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

/**
 * 0.11.0 — convert an armor item's per-round distance mobility fields
 * from legacy to metric. `mobility.flight` and `mobility.jump` are
 * distances (legacy anchor 120 = 10 m/round, applied via
 * `legacyToMeters`). `mobility.lift` is a tonnage / ratio and is
 * explicitly left untouched. No-op for non-armor items.
 *
 * Safe for actor-owned items and loose world items. Caller is
 * expected to gate on `storedVersion < 0.11.0` so the conversion
 * runs exactly once per world.
 */
async function migrateArmorMobilityToMeters0110(item) {
  if (item.type !== "armor") return;
  const update = {};
  const flight = Number(item.system?.mobility?.flight ?? 0);
  if (flight > 0) {
    const converted = legacyToMeters(flight);
    if (converted !== flight) update["system.mobility.flight"] = converted;
  }
  const jump = Number(item.system?.mobility?.jump ?? 0);
  if (jump > 0) {
    const converted = legacyToMeters(jump);
    if (converted !== jump) update["system.mobility.jump"] = converted;
  }
  if (Object.keys(update).length) {
    await item.update(update, { gammaWorldSync: true });
  }
}

/**
 * 0.11.0 — convert an actor's base movement from legacy to metric.
 * Operates on `system.details.movement` (the only movement-bearing
 * field the character/monster schema exposes; armor mobility rides on
 * owned items, swept separately via `migrateArmorMobilityToMeters0110`).
 *
 * Caller is expected to gate on `storedVersion < 0.11.0`.
 */
async function migrateActorMovementToMeters0110(actor) {
  const current = Number(actor.system?.details?.movement ?? 0);
  const converted = legacyToMeters(current);
  if (converted !== current) {
    await actor.update(
      { "system.details.movement": converted },
      { gammaWorldSync: true }
    );
  }
}

async function migrateItem(item, options = {}) {
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

  if (item.type === "armor") {
    // 0.7.0 (Phase 5): lift the deprecated protection.*Immune booleans
    // into the declarative traits.grantsImmunity set. Leaves the old
    // booleans in place for one version cycle so any outside reader
    // that hasn't migrated still sees the legacy shape; they'll be
    // removed from the schema in 0.8.0.
    const p = item.system?.protection ?? {};
    const existing = new Set([...(item.system?.traits?.grantsImmunity ?? [])]);
    const want = new Set(existing);
    if (p.blackRayImmune)  want.add("black-ray");
    if (p.radiationImmune) want.add("radiation");
    if (p.poisonImmune)    want.add("poison");
    if (p.laserImmune)     want.add("laser");
    if (p.mentalImmune)    want.add("mental");
    // Only write if the set actually changed so untouched armor doesn't
    // get pinned with an empty `traits.grantsImmunity: []` entry.
    if (want.size !== existing.size) {
      update["system.traits.grantsImmunity"] = [...want];
    }
  }

  if (item.type === "mutation") {
    Object.assign(update, mutationUpdateData(item));
  }

  if (Object.keys(update).length) {
    await item.update(update, { gammaWorldSync: true });
  }

  // 0.11.0: armor mobility.flight / mobility.jump — legacy → metric.
  // Gated by the caller; only fires on worlds upgrading from <0.11.0.
  if (options.convertMovementToMeters) {
    await migrateArmorMobilityToMeters0110(item);
  }
}

/**
 * For ranged weapons on an actor with an inline ammo counter, create a gear
 * ammo item alongside the weapon and zero the inline counter. Called once per
 * actor during migration. 0.8.1: handles SetField-typed ammoType.
 */
async function migrateInlineAmmoToGear(actor) {
  const weapons = actor.items.filter((i) => i.type === "weapon"
    && legacyAmmoTypeString(i.system?.ammoType)
    && Number(i.system?.ammo?.current ?? 0) > 0);
  if (!weapons.length) return;

  const equipmentPack = game.packs?.get(`${SYSTEM_ID}.equipment`);
  for (const weapon of weapons) {
    const ammoType = legacyAmmoTypeString(weapon.system.ammoType);
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
 * 0.8.1 weapon rename + Needler collapse + Sling Bullets deletion.
 * Must run AFTER migrateInlineAmmoToGear so the pre-rename single-string
 * ammoType is used to drain inline counters into the correct gear stack.
 * Idempotent — re-running finds no matching old names.
 */
async function migrateWeaponRenames081(actor) {
  const weapons = actor.items.filter((i) => i.type === "weapon");
  if (!weapons.length) return;

  // Plain renames (single rename per weapon entry).
  for (const weapon of weapons) {
    const rename = WEAPON_RENAMES_081[weapon.name];
    if (rename) {
      await weapon.update({
        name: rename.name,
        "system.ammoType": rename.ammoType
      }, { gammaWorldSync: true });
    }
  }

  // Needler collapse: the first matching weapon becomes "Needler" with both
  // dart types; any additional matches are deleted as duplicates.
  const needlers = weapons.filter((w) => NEEDLER_NAMES_081.has(w.name));
  const deleteIds = [];
  if (needlers.length) {
    const keeper = needlers[0];
    await keeper.update({
      name: "Needler",
      "system.ammoType": ["needler-poison", "needler-paralysis"]
    }, { gammaWorldSync: true });
    for (const donor of needlers.slice(1)) {
      deleteIds.push(donor.id);
    }
  }

  // Sling Bullets weapon → removed (lives on as ammo gear).
  for (const weapon of weapons) {
    if (weapon.name === SLING_BULLETS_WEAPON_081) {
      deleteIds.push(weapon.id);
    }
  }

  if (deleteIds.length) {
    await actor.deleteEmbeddedDocuments("Item", [...new Set(deleteIds)]);
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

async function migrateActor(actor, options = {}) {
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

  // 0.8.0 — backfill the skills map. Fills in any skill key that's
  // missing on this actor with the canonical ability + proficient:false.
  // Preserves existing entries (so a player who already flipped
  // proficient: true keeps it). Runs for character AND monster actors
  // since they share the data model; monsters just don't render the
  // Skills tab.
  const existingSkills = actor.system?.skills ?? {};
  for (const [key, def] of Object.entries(SKILLS)) {
    if (existingSkills[key] == null) {
      update[`system.skills.${key}`] = { ability: def.ability, proficient: false, bonus: 0 };
    } else {
      if (existingSkills[key].ability == null) update[`system.skills.${key}.ability`] = def.ability;
      if (existingSkills[key].proficient == null) update[`system.skills.${key}.proficient`] = false;
      // 0.8.6 — per-skill `bonus` field backfill; target of Scientific
      // Genius's +2 ActiveEffects. Defaults to 0 so rolls stay identical
      // for pre-0.8.6 actors until an AE writes a nonzero value.
      if (existingSkills[key].bonus == null) update[`system.skills.${key}.bonus`] = 0;
    }
  }

  if (Object.keys(update).length) {
    await actor.update(update, { gammaWorldSync: true });
  }

  // 0.11.0: convert actor base movement legacy → metric. Gated by the
  // caller; the item-level sweep below also propagates the option so
  // every armor item gets its mobility.flight / mobility.jump swept in
  // the same pass.
  if (options.convertMovementToMeters) {
    await migrateActorMovementToMeters0110(actor);
  }

  for (const item of actor.items) {
    await migrateItem(item, options);
  }

  // 0.5.0: convert inline ammo counters into ammo gear items.
  await migrateInlineAmmoToGear(actor);

  // 0.8.1: weapon renames + Needler collapse + Sling Bullets deletion. Runs
  // AFTER inline-ammo migration so the pre-rename ammoType drives the gear
  // lookup (e.g. "Needler (Poison)" with ammo.current=8 ends up as eight
  // rounds in "Needler Darts, Poison (10)" gear).
  await migrateWeaponRenames081(actor);

  // 0.8.4 Tier 1: backfill ActiveEffect embeds on piloted mutation items
  // so old-world characters see their effects on the Effects tab.
  await migrateMutationEffects084(actor);

  // 0.8.6 Phase 3: retire Genius Capability in favor of three standalone
  // mutations (Military/Economic/Scientific Genius). Must run AFTER the
  // 0.8.4 AE backfill because the new items emit their own AE entries
  // on create (Foundry's item.create pipeline handles it).
  await migrateGeniusCapability086(actor);

  // 0.9.0 Tier 3: retire the legacy temporaryEffects flag array for
  // generic-mode entries. Converts each into a real Foundry
  // ActiveEffect on the actor; stateful-mode entries (tear-gas,
  // clouds, morale-watch) stay in place since they drive per-round
  // procedural logic the AE framework can't express.
  const tempCount = await migrateTempEffectsToAE090(actor);
  if (tempCount > 0) {
    globalThis.gammaWorldTempEffectsMigrated = (globalThis.gammaWorldTempEffectsMigrated ?? 0) + tempCount;
  }

  // 0.10.0: populate `system.actionTypes` on every item from the rule
  // tables. Idempotent — items that already carry a non-empty set are
  // skipped.
  await migrateActionTypes0100(actor);

  await actor.refreshDerivedResources({ adjustCurrent: false });
}

/**
 * 0.8.6 Phase 3 — retire the "Genius Capability" mutation in favor of
 * three standalone mutations (Military Genius, Economic Genius,
 * Scientific Genius). For each Genius Capability item on the actor:
 *   1. Read the legacy `system.reference.variant` field
 *   2. Look up the matching replacement from the mutations pack
 *   3. Delete the old item and create the replacement
 * Idempotent: the actor's second migration pass finds no Genius
 * Capability items to migrate (they were replaced on the first pass).
 *
 * Unknown or empty variants default to Scientific Genius (the safest
 * pick — purely flavorful +2 technical skill bonuses, no combat math).
 */
async function migrateGeniusCapability086(actor) {
  const legacy = actor.items.filter((item) => item.type === "mutation" && item.name === "Genius Capability");
  if (!legacy.length) return;

  const variantToReplacement = {
    military:   "Military Genius",
    economic:   "Economic Genius",
    scientific: "Scientific Genius"
  };

  const mutationsPack = game.packs?.get(`${SYSTEM_ID}.mutations`);
  if (!mutationsPack) {
    console.warn(`${SYSTEM_ID} | Genius Capability migration: mutations pack unavailable`);
    return;
  }

  const packIndex = await mutationsPack.getIndex();

  for (const old of legacy) {
    const variant = String(old.system?.reference?.variant ?? "").toLowerCase();
    const replacementName = variantToReplacement[variant] ?? "Scientific Genius";
    if (!variantToReplacement[variant]) {
      console.warn(`${SYSTEM_ID} | Genius Capability on ${actor.name}: variant "${variant}" not recognized; defaulting to Scientific Genius`);
    }

    const entry = packIndex.find((e) => e.name === replacementName);
    if (!entry) {
      console.warn(`${SYSTEM_ID} | Genius Capability migration: ${replacementName} not found in mutations pack`);
      continue;
    }

    const source = await mutationsPack.getDocument(entry._id);
    const data = source.toObject();
    try {
      await Item.create(data, { parent: actor, gammaWorldSync: true });
      await old.delete({ gammaWorldSync: true });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | failed to replace Genius Capability on ${actor.name} with ${replacementName}`, error);
    }
  }
}

/**
 * 0.10.0 — backfill `system.actionTypes` on every item an actor owns.
 * Inferred from the rule tables:
 *   - Mutation → resolveMutationActionTypes(rule)
 *   - Armor    → inferArmorActionTypes(rule)
 *   - Gear     → inferGearActionTypes(rule) with fallback to item.action.mode
 *   - Weapon   → inferWeaponActionTypes(item.system.effect?.mode ?? "damage")
 *
 * Idempotent: items that already carry a non-empty actionTypes set are
 * skipped. Runs after the 0.9.0 temp-effects migration inside
 * `migrateActor`.
 */
async function migrateActionTypes0100(actor) {
  const { resolveMutationActionTypes, getMutationRule } = await import("./mutation-rules.mjs");
  const { getArmorRule, getGearRule, inferArmorActionTypes, inferGearActionTypes, inferWeaponActionTypes } = await import("./equipment-rules.mjs");

  for (const item of actor.items) {
    const current = item.system?.actionTypes;
    const hasAny = current instanceof Set ? current.size > 0 : (Array.isArray(current) && current.length > 0);
    if (hasAny) continue;

    let tags = [];
    if (item.type === "mutation") {
      tags = resolveMutationActionTypes(getMutationRule(item));
    } else if (item.type === "armor") {
      tags = inferArmorActionTypes(getArmorRule(item));
    } else if (item.type === "gear") {
      const rule = getGearRule(item);
      const fromRule = inferGearActionTypes(rule);
      // When the rule returns the generic utility fallback but the
      // item's own action.mode is richer, re-infer from the item.
      if (fromRule.length === 1 && fromRule[0] === "utility") {
        const itemMode = String(item.system?.action?.mode ?? "").toLowerCase();
        tags = inferGearActionTypes({ action: { mode: itemMode } });
      } else {
        tags = fromRule;
      }
    } else if (item.type === "weapon") {
      tags = inferWeaponActionTypes(item.system?.effect?.mode ?? "damage");
    }

    if (!tags.length) continue;
    try {
      await item.update({ "system.actionTypes": tags }, { gammaWorldSync: true });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | migrateActionTypes0100: failed to tag ${item.type} "${item.name}"`, error);
    }
  }
}

/**
 * 0.9.0 Tier 3 — retire the legacy `flags[SYSTEM_ID].state.temporaryEffects`
 * array. For each generic-mode entry on the actor, emit a matching
 * Foundry ActiveEffect with duration, statuses, and changes translated
 * from the legacy shape. Stateful-mode entries (tear-gas / poison-cloud
 * / stun-cloud / morale-watch) stay in the flag array because their
 * per-round procedural mechanics don't fit AE.
 *
 * Returns the number of entries converted to AE (0 if nothing to do).
 * Idempotent: on a second run, the flag array has no generic entries
 * left so the function is a no-op. If the AE with the matching
 * effectId flag already exists (e.g., manual re-run), the entry is
 * skipped and the flag entry is still cleared from the array.
 */
async function migrateTempEffectsToAE090(actor) {
  const { getActorState, setActorState } = await import("./effect-state.mjs");
  const state = getActorState(actor);
  const temp = Array.isArray(state.temporaryEffects) ? state.temporaryEffects : [];
  if (!temp.length) return 0;

  const STATEFUL_MODES = new Set(["tear-gas", "poison-cloud", "stun-cloud", "morale-watch"]);
  const toMigrate = temp.filter((entry) => !STATEFUL_MODES.has(entry.mode ?? "generic"));
  if (!toMigrate.length) return 0;

  const { applyTemporaryEffect } = await import("./effect-state.mjs");
  let migrated = 0;

  // Clear the generic entries from the flag array FIRST so
  // applyTemporaryEffect (which will now route to the AE writer for
  // generic mode) doesn't observe the in-flight legacy copy.
  const remaining = temp.filter((entry) => STATEFUL_MODES.has(entry.mode ?? "generic"));
  state.temporaryEffects = remaining;
  await setActorState(actor, state, { refresh: false });

  for (const entry of toMigrate) {
    try {
      await applyTemporaryEffect(actor, entry);
      migrated += 1;
    } catch (error) {
      console.warn(`${SYSTEM_ID} | migrateTempEffectsToAE090: failed to migrate "${entry.label ?? entry.id}" on ${actor.name}`, error);
    }
  }

  return migrated;
}

/**
 * 0.8.4 Tier 1 — for every piloted mutation on the actor whose rule
 * has an `effects` array AND whose item's effects collection is empty,
 * materialize matching ActiveEffect docs via `item.createEmbeddedDocuments`.
 * Idempotent: skips items that already have effects.
 */
async function migrateMutationEffects084(actor) {
  const { AE_MIGRATED_MUTATIONS } = await import("./mutation-rules.mjs");
  const mutationItems = actor.items.filter((item) => item.type === "mutation" && AE_MIGRATED_MUTATIONS.has(item.name));
  for (const item of mutationItems) {
    if (item.effects?.size > 0) continue;
    const rule = getMutationRule(item);
    const effects = Array.isArray(rule?.effects) ? rule.effects : [];
    if (!effects.length) continue;
    const effectData = effects.map((effect, index) => ({
      name: effect.label ?? `${item.name} effect ${index + 1}`,
      img: "icons/svg/aura.svg",
      transfer: true,
      disabled: false,
      changes: (Array.isArray(effect.changes) ? effect.changes : []).map((change) => ({
        key: change.key,
        mode: Number.isInteger(change.mode) ? change.mode : 2,
        value: String(change.value ?? ""),
        priority: Number.isFinite(Number(change.priority)) ? Number(change.priority) : 20
      }))
    }));
    try {
      await item.createEmbeddedDocuments("ActiveEffect", effectData);
    } catch (error) {
      console.warn(`${SYSTEM_ID} | failed to backfill effects on mutation "${item.name}"`, error);
    }
  }
}

/**
 * 0.12.0 — bring power-cell gear items onto the percent-charge model.
 *
 * For each gear item with `system.subtype === "power-cell"`:
 *   - If `quantity > 1`, split into that many `quantity: 1` rows, each
 *     fresh at `charges: { current: 100, max: 100 }`. Foundry stacks
 *     assume uniform members and we now have to carry distinct charge
 *     levels per cell, so stacks become individual rows.
 *   - If `quantity === 1` but `charges.max !== 100`, rewrite to
 *     `{ current: 100, max: 100 }`. Existing half-drained cells can't
 *     be recovered from the old model (charge used to live on the
 *     consuming weapon) so every surviving cell starts fresh.
 *   - Otherwise skip. Idempotent: second pass finds nothing to change.
 *
 * Works for both world-level unowned items (`owner: null`) and
 * actor-owned items (`owner: Actor`). Returns a `{ migrated, split }`
 * counter so the caller can aggregate for the chat summary.
 */
async function migratePowerCells012(owner) {
  const counters = { migrated: 0, split: 0 };
  const collection = owner?.items ?? game.items;
  const cells = [...collection.contents].filter(
    (item) => item?.type === "gear" && item?.system?.subtype === "power-cell"
  );

  for (const cell of cells) {
    const qty = Math.max(1, Number(cell.system?.quantity ?? 1));
    const max = Number(cell.system?.artifact?.charges?.max ?? 0);

    if (qty > 1) {
      // Clone (qty - 1) siblings, update the original to singleton/fresh.
      const source = cell.toObject();
      delete source._id;
      delete source._key;
      source.system.quantity = 1;
      source.system.artifact = source.system.artifact ?? {};
      source.system.artifact.charges = { current: 100, max: 100 };
      const clones = Array.from({ length: qty - 1 }, () => foundry.utils.deepClone(source));
      try {
        if (owner) {
          await owner.createEmbeddedDocuments("Item", clones, { gammaWorldSync: true });
        } else {
          for (const clone of clones) {
            await Item.create(clone, { gammaWorldSync: true });
          }
        }
        await cell.update({
          "system.quantity": 1,
          "system.artifact.charges.current": 100,
          "system.artifact.charges.max": 100
        }, { gammaWorldSync: true });
        counters.split += 1;
        counters.migrated += qty;
      } catch (error) {
        console.warn(`${SYSTEM_ID} | 0.12.0 cell stack-split failed for "${cell.name}"`, error);
      }
      continue;
    }

    if (max !== 100) {
      try {
        await cell.update({
          "system.artifact.charges.current": 100,
          "system.artifact.charges.max": 100
        }, { gammaWorldSync: true });
        counters.migrated += 1;
      } catch (error) {
        console.warn(`${SYSTEM_ID} | 0.12.0 cell charge rewrite failed for "${cell.name}"`, error);
      }
    }
  }

  return counters;
}

/**
 * 0.13.0 — attach a declarative consumption rule to every cell-powered
 * weapon / armor / gear item and (where possible) claim cells from the
 * owning actor's inventory to populate installedCellIds.
 *
 * For each item whose `name` is keyed in CONSUMPTION_CATALOG:
 *  - Write system.consumption.{unit, perUnit} from the catalog.
 *  - Try to claim `cellSlots` uninstalled cells of the matching
 *    powerSource from the owning actor's inventory. If claim succeeds:
 *      - Rewrite each claimed cell's charges.current to reflect the
 *        item's legacy charges.current/max ratio (a Laser Pistol at
 *        7/10 shots → each cell becomes 70%). If the item has no legacy
 *        max, leave claimed cells at their pre-existing charge.
 *      - Flag each cell `installedIn: <item.uuid>`.
 *      - Set installedCellIds + cellsInstalled on the item, and zero
 *        the item's own charges.current/max (cell owns the charge now).
 *    If claim fails (too few matching cells in inventory): leave the
 *    item's legacy counter intact so the device doesn't stop working.
 *    The consumption block is still set — the new path activates as
 *    soon as cells are installed.
 *
 * Idempotent: an already-migrated item has `consumption.perUnit > 0`
 * AND `charges.max === 0` AND `installedCellIds.length > 0`; the second
 * pass finds no work to do.
 */
async function migrateConsumerCharges013(owner) {
  const counters = { items: 0, cellsInstalled: 0, legacyPreserved: 0 };
  const collection = owner?.items ?? game.items;
  const candidates = [...collection.contents].filter((item) => {
    if (item.type !== "weapon" && item.type !== "armor" && item.type !== "gear") return false;
    if (item.system?.subtype === "power-cell") return false;
    return Object.prototype.hasOwnProperty.call(CONSUMPTION_CATALOG, item.name);
  });

  for (const item of candidates) {
    const catalog = CONSUMPTION_CATALOG[item.name];
    const perUnit = consumptionRateFor(catalog);
    const currentUses = Math.max(0, Number(item.system?.artifact?.charges?.current ?? 0));
    const maxUses     = Math.max(0, Number(item.system?.artifact?.charges?.max ?? 0));
    const existingPerUnit = Number(item.system?.consumption?.perUnit ?? 0);
    const existingIds = Array.isArray(item.system?.artifact?.power?.installedCellIds)
      ? item.system.artifact.power.installedCellIds : [];

    // Idempotency: skip only when consumption.perUnit matches the
    // current catalog rate AND either cells are installed or legacy
    // counter is zeroed. Comparing against the catalog rate (not just
    // ">0") catches 0.13.0-era worlds where multi-cell devices had a
    // halved perUnit due to the formula bug; those re-migrate to the
    // correct per-cell rate on world load.
    const perUnitMatches = Math.abs(existingPerUnit - perUnit) < 1e-6;
    if (perUnitMatches && (existingIds.length > 0 || maxUses === 0)) {
      continue;
    }

    const update = {
      "system.consumption.unit":    catalog.unit,
      "system.consumption.perUnit": perUnit
    };

    // Try to claim cells. Actor must be present and the item must have
    // at least `cellSlots` uninstalled matching cells in inventory.
    let claimed = [];
    if (owner && catalog.cellSlots > 0) {
      const cellItemName = cellNameForPowerSource(catalog.powerSource);
      if (cellItemName) {
        const pct = maxUses > 0
          ? Math.round(100 * currentUses / maxUses)
          : 100;   // no legacy usage data → assume fresh cells
        const candidates = owner.items.filter((e) =>
          e.type === "gear" &&
          e.system?.subtype === "power-cell" &&
          e.name === cellItemName &&
          !e.flags?.[SYSTEM_ID]?.installedIn
        ).sort((a, b) => {
          const ac = Number(a.system?.artifact?.charges?.current ?? 0);
          const bc = Number(b.system?.artifact?.charges?.current ?? 0);
          return bc - ac;
        });
        if (candidates.length >= catalog.cellSlots) {
          const chosen = candidates.slice(0, catalog.cellSlots);
          for (const cell of chosen) {
            await cell.update({
              "system.artifact.charges.current": Math.max(0, Math.min(100, pct)),
              [`flags.${SYSTEM_ID}.installedIn`]: item.uuid
            }, { gammaWorldSync: true });
            claimed.push(cell.uuid);
          }
        }
      }
    }

    if (claimed.length > 0) {
      update["system.artifact.power.installedCellIds"] = claimed;
      update["system.artifact.power.cellsInstalled"]   = claimed.length;
      update["system.artifact.power.installedType"]    = catalog.powerSource;
      // Zero the item's own shot counter — cells carry the charge now.
      update["system.artifact.charges.current"] = 0;
      update["system.artifact.charges.max"]     = 0;
      counters.cellsInstalled += claimed.length;
    } else if (maxUses > 0) {
      // Keep the legacy counter intact so the device still works on the
      // old path. consumption.perUnit is set either way, so the new path
      // activates the moment cells are installed.
      counters.legacyPreserved += 1;
    }

    await item.update(update, { gammaWorldSync: true });
    counters.items += 1;
  }

  return counters;
}

const CELL_NAMES_BY_SOURCE = {
  chemical: "Chemical Energy Cell",
  solar:    "Solar Energy Cell",
  hydrogen: "Hydrogen Energy Cell",
  nuclear:  "Atomic Energy Cell"
};
function cellNameForPowerSource(source) {
  return CELL_NAMES_BY_SOURCE[source] ?? null;
}

/**
 * 0.14.0 — Ammunition refactor maps. Bundle-style names ("Arrows
 * (bundle of 20)") collapse to per-unit names ("Arrow") with
 * `system.quantity` carrying the count. Five orphan cartridges and
 * the Javelin gear are deleted entirely.
 */
const AMMO_RENAMES_0140 = Object.freeze({
  "Arrows (bundle of 20)":            { name: "Arrow",                   roundsPerStack: 20 },
  "Crossbow Bolts (bundle of 20)":    { name: "Crossbow Bolt",           roundsPerStack: 20 },
  "Sling Stones (pouch of 30)":       { name: "Sling Stone",             roundsPerStack: 30 },
  "Sling Bullets (pouch of 30)":      { name: "Sling Bullet",            roundsPerStack: 30 },
  "Slug-Thrower Rounds (clip of 15)": { name: "Slug",                    roundsPerStack: 15 },
  "Needler Darts, Paralysis (10)":    { name: "Needler Dart, Paralysis", roundsPerStack: 10 },
  "Needler Darts, Poison (10)":       { name: "Needler Dart, Poison",    roundsPerStack: 10 },
  "Gyrojet Slugs (clip of 10)":       { name: "Gyrojet Slug",            roundsPerStack: 10 }
});

const AMMO_DELETES_0140 = Object.freeze(new Set([
  "Energy Clip (10 shots)",
  "Blaster Pack (5 shots)",
  "Black Ray Cell (4 shots)",
  "Fusion Cell (10 shots)",
  "Stun Rifle Cell (10 shots)",
  "Javelin (single)"
]));

const AMMO_SLUGS_DROPPED_0140 = Object.freeze(new Set([
  "energy-clip", "blaster-pack", "black-ray-cell", "fusion-cell", "stun-cell", "javelin"
]));

/**
 * Per-actor 0.14.0 ammunition migration. Renames bundle gear to per-unit,
 * merges multiple legacy stacks into one, deletes orphan cartridges,
 * folds Javelin gear into the Javelin weapon's quantity, and prunes
 * dropped slugs from every weapon's ammoType SetField.
 *
 * Returns counts: `{ renamed, deletedCartridges, javelinFolded, weaponsPruned }`.
 */
async function migrateAmmunition014(actor) {
  const counts = { renamed: 0, deletedCartridges: 0, javelinFolded: 0, weaponsPruned: 0 };
  if (!actor?.items) return counts;

  const ammoItems = actor.items.filter((i) =>
    i.type === "gear" && i.system?.subtype === "ammunition");
  const weapons = actor.items.filter((i) => i.type === "weapon");

  // Pass 1: classify each ammo item — rename target, javelin spare, or delete.
  const merged = new Map();   // newName → { keeperId, totalQuantity, autoDestroy }
  const toDelete = [];
  let javelinSpareCount = 0;

  for (const item of ammoItems) {
    const rename = AMMO_RENAMES_0140[item.name];
    if (rename) {
      const legacyQty    = Math.max(1, Number(item.system.quantity ?? 1));
      const legacyRounds = Math.max(0, Number(item.system.ammo?.rounds ?? 0));
      const newQty = legacyQty * legacyRounds;
      const slot = merged.get(rename.name);
      if (slot) {
        slot.totalQuantity += newQty;
        toDelete.push(item.id);
      } else {
        merged.set(rename.name, {
          keeperId: item.id,
          totalQuantity: newQty,
          autoDestroy: item.system.ammo?.autoDestroy ?? true
        });
      }
      continue;
    }
    if (item.name === "Javelin (single)") {
      javelinSpareCount += Math.max(1, Number(item.system.quantity ?? 1))
                         * Math.max(1, Number(item.system.ammo?.rounds ?? 1));
      toDelete.push(item.id);
      counts.deletedCartridges += 1;
      continue;
    }
    if (AMMO_DELETES_0140.has(item.name)) {
      toDelete.push(item.id);
      counts.deletedCartridges += 1;
    }
  }

  // Pass 2: apply renames + quantity merges + autoDestroy default.
  const updates = [];
  for (const [newName, data] of merged) {
    updates.push({
      _id: data.keeperId,
      name: newName,
      "system.quantity": data.totalQuantity,
      "system.ammo.rounds": 0,
      "system.ammo.autoDestroy": data.autoDestroy
    });
    counts.renamed += 1;
  }
  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates, { gammaWorldSync: true });
  }

  // Pass 3: javelin-as-quantity rollup. Fold spare gear into the Javelin
  // weapon's quantity. Discard if no Javelin weapon (gear was unusable).
  if (javelinSpareCount > 0) {
    const javelinWeapon = weapons.find((w) => w.name === "Javelin");
    if (javelinWeapon) {
      const newQty = Math.max(1, Number(javelinWeapon.system.quantity ?? 1)) + javelinSpareCount;
      await javelinWeapon.update({ "system.quantity": newQty }, { gammaWorldSync: true });
      counts.javelinFolded = javelinSpareCount;
    }
  }

  // Pass 4: prune dropped slugs from every weapon's ammoType SetField.
  for (const weapon of weapons) {
    const current = weapon.system?.ammoType;
    const list = current instanceof Set ? [...current]
              : Array.isArray(current) ? current
              : [];
    const filtered = list.filter((slug) => !AMMO_SLUGS_DROPPED_0140.has(slug));
    if (filtered.length !== list.length) {
      await weapon.update({ "system.ammoType": filtered }, { gammaWorldSync: true });
      counts.weaponsPruned += 1;
    }
  }

  // Pass 5: delete orphaned cartridge gear + javelin gear (and merged duplicates).
  if (toDelete.length) {
    await actor.deleteEmbeddedDocuments("Item", [...new Set(toDelete)]);
  }

  return counts;
}

/**
 * World-level pass: same logic as the per-actor variant but operates on
 * `game.items.contents` (no actor-bound weapon merge complexity).
 */
async function migrateAmmunition014World() {
  const counts = { renamed: 0, deletedCartridges: 0, weaponsPruned: 0 };
  for (const item of game.items.contents) {
    if (item.type !== "gear" || item.system?.subtype !== "ammunition") continue;
    const rename = AMMO_RENAMES_0140[item.name];
    if (rename) {
      const legacyQty    = Math.max(1, Number(item.system.quantity ?? 1));
      const legacyRounds = Math.max(0, Number(item.system.ammo?.rounds ?? 0));
      await item.update({
        name: rename.name,
        "system.quantity": legacyQty * legacyRounds,
        "system.ammo.rounds": 0,
        "system.ammo.autoDestroy": item.system.ammo?.autoDestroy ?? true
      }, { gammaWorldSync: true });
      counts.renamed += 1;
    } else if (AMMO_DELETES_0140.has(item.name)) {
      await item.delete();
      counts.deletedCartridges += 1;
    }
  }
  for (const item of game.items.contents) {
    if (item.type !== "weapon") continue;
    const current = item.system?.ammoType;
    const list = current instanceof Set ? [...current]
              : Array.isArray(current) ? current : [];
    const filtered = list.filter((slug) => !AMMO_SLUGS_DROPPED_0140.has(slug));
    if (filtered.length !== list.length) {
      await item.update({ "system.ammoType": filtered }, { gammaWorldSync: true });
      counts.weaponsPruned += 1;
    }
  }
  return counts;
}

/**
 * Unlinked-token pass: each unlinked token carries its own actor snapshot
 * with its own item collection. Easy to forget; without this, NPCs on
 * the canvas keep their pre-migration ammo names while world actors
 * get fixed.
 */
async function migrateAmmunition014UnlinkedTokens() {
  const totals = { renamed: 0, deletedCartridges: 0, javelinFolded: 0, weaponsPruned: 0 };
  for (const scene of game.scenes?.contents ?? []) {
    for (const tokenDoc of scene.tokens?.contents ?? []) {
      if (tokenDoc.actorLink) continue;
      const actor = tokenDoc.actor;
      if (!actor) continue;
      const counts = await migrateAmmunition014(actor);
      totals.renamed += counts.renamed;
      totals.deletedCartridges += counts.deletedCartridges;
      totals.javelinFolded += counts.javelinFolded;
      totals.weaponsPruned += counts.weaponsPruned;
    }
  }
  return totals;
}

export async function migrateWorld() {
  if (!game.user?.isGM) return;

  const currentVersion = game.system.version ?? "0.1.0";
  const storedVersion = game.settings.get(SYSTEM_ID, "schemaVersion");
  if (storedVersion === currentVersion) return;

  // 0.9.0 Tier 3 — counter for the chat notice posted once per world
  // when temp-effect migration converts legacy flag entries into AEs.
  globalThis.gammaWorldTempEffectsMigrated = 0;

  // 0.11.0: one-shot legacy-to-metric movement conversion. Fires only on
  // worlds upgrading from below 0.11.0; past the gate, storedVersion is
  // bumped at the end of this function and subsequent loads skip.
  const itemMigrationOptions = {
    convertMovementToMeters: compareSemver(storedVersion, "0.11.0") < 0
  };
  const actorMigrationOptions = { ...itemMigrationOptions };

  for (const item of game.items.contents) {
    await migrateItem(item, itemMigrationOptions);
  }

  for (const actor of game.actors.contents) {
    await migrateActor(actor, actorMigrationOptions);
  }

  // 0.5.0: remove the deprecated Broadcast Power Station item.
  await removeLegacyBroadcastPowerItems();

  // 0.7.0: translate autoRollNpcDamage (bool) → npcDamageMode (enum).
  //   old true  → "always" (preserve: auto-roll regardless of hit)
  //   old false → "none"   (preserve: never auto-roll)
  // Only applied on worlds upgrading from <0.7.0; fresh worlds keep the new
  // default of "onHit". We detect "never set" from "set false" indirectly by
  // only migrating when npcDamageMode is still at its own default.
  if (compareSemver(storedVersion, "0.7.0") < 0) {
    const legacyAutoRollNpc = game.settings.get(SYSTEM_ID, "autoRollNpcDamage");
    const currentNpcMode = game.settings.get(SYSTEM_ID, "npcDamageMode");
    if (currentNpcMode === "onHit") {
      const nextMode = legacyAutoRollNpc ? "always" : "none";
      await game.settings.set(SYSTEM_ID, "npcDamageMode", nextMode);
    }
  }

  // 0.9.0 Tier 3 — post a one-shot chat summary if any temp effects
  // were migrated this pass. Scoped to the GM to avoid duplicate
  // messages when multiple clients load the world.
  const migratedCount = Number(globalThis.gammaWorldTempEffectsMigrated ?? 0);
  globalThis.gammaWorldTempEffectsMigrated = 0;
  if (migratedCount > 0 && game.user?.isGM) {
    try {
      await ChatMessage.create({
        speaker: { alias: "Gamma World" },
        content: `<div class="gw-chat-card"><p><strong>Tier 3 migration:</strong> ${migratedCount} temporary effect${migratedCount === 1 ? "" : "s"} moved to the new Effects panel.</p></div>`
      });
    } catch (_error) {
      // Cosmetic; don't block migration on a chat failure.
    }
  }

  // 0.12.0 — power cells switch from a 1/1 binary token to integer
  // percent charge. Stacks are split so each cell carries its own
  // charge level. Walks world-level items first, then every actor.
  if (compareSemver(storedVersion, "0.12.0") < 0) {
    const cellTotals = { migrated: 0, split: 0 };
    try {
      const worldCounts = await migratePowerCells012(null);
      cellTotals.migrated += worldCounts.migrated;
      cellTotals.split += worldCounts.split;
      for (const actor of game.actors.contents) {
        const actorCounts = await migratePowerCells012(actor);
        cellTotals.migrated += actorCounts.migrated;
        cellTotals.split += actorCounts.split;
      }
      if (cellTotals.migrated > 0 && game.user?.isGM) {
        const splitLine = cellTotals.split > 0
          ? `; ${cellTotals.split} stack${cellTotals.split === 1 ? "" : "s"} split into individual items`
          : "";
        await ChatMessage.create({
          speaker: { alias: "Gamma World" },
          whisper: ChatMessage.getWhisperRecipients("GM"),
          content: `<div class="gw-chat-card"><p><strong>Migration 0.12.0:</strong> ${cellTotals.migrated} power cell${cellTotals.migrated === 1 ? "" : "s"} migrated to percent-charge${splitLine}.</p></div>`
        });
      }
    } catch (error) {
      console.warn(`${SYSTEM_ID} | 0.12.0 power-cell migration failed`, error);
    }
  }

  // 0.13.0 — attach per-item consumption rules and (where possible)
  // claim installed cells from actor inventory. Items without matching
  // cells on hand retain their legacy charges counter; the new path
  // activates automatically when cells are later installed.
  //
  // 0.13.1 — re-runs the migration with a corrected per-cell drain
  // formula. The 0.13.0 release used `100 / uses / cellSlots` which
  // halved the rate for multi-cell devices (Mark VII Blaster Rifle,
  // powered armor). The fixed formula `100 / uses` writes the correct
  // per-cell rate; the migration's idempotency check compares against
  // the current catalog rate so stale 0.13.0 values are overwritten.
  if (compareSemver(storedVersion, "0.13.1") < 0) {
    const consumerTotals = { items: 0, cellsInstalled: 0, legacyPreserved: 0 };
    try {
      const worldCounts = await migrateConsumerCharges013(null);
      consumerTotals.items          += worldCounts.items;
      consumerTotals.cellsInstalled += worldCounts.cellsInstalled;
      consumerTotals.legacyPreserved += worldCounts.legacyPreserved;
      for (const actor of game.actors.contents) {
        const actorCounts = await migrateConsumerCharges013(actor);
        consumerTotals.items          += actorCounts.items;
        consumerTotals.cellsInstalled += actorCounts.cellsInstalled;
        consumerTotals.legacyPreserved += actorCounts.legacyPreserved;
      }
      if (consumerTotals.items > 0 && game.user?.isGM) {
        const pieces = [`${consumerTotals.items} powered item${consumerTotals.items === 1 ? "" : "s"} converted`];
        if (consumerTotals.cellsInstalled > 0) pieces.push(`${consumerTotals.cellsInstalled} cell${consumerTotals.cellsInstalled === 1 ? "" : "s"} installed`);
        if (consumerTotals.legacyPreserved > 0) pieces.push(`${consumerTotals.legacyPreserved} item${consumerTotals.legacyPreserved === 1 ? "" : "s"} kept legacy counter (no matching cells on hand)`);
        await ChatMessage.create({
          speaker: { alias: "Gamma World" },
          whisper: ChatMessage.getWhisperRecipients("GM"),
          content: `<div class="gw-chat-card"><p><strong>Migration 0.13.1:</strong> ${pieces.join("; ")}.</p></div>`
        });
      }
    } catch (error) {
      console.warn(`${SYSTEM_ID} | 0.13.1 consumer-charge migration failed`, error);
    }
  }

  // 0.13.2 — scrub bogus self-pointing installedIn flags on cells.
  // The 0.13.0/0.13.1 build of compatibleCellTypes() falls back to
  // [powerSource] when compatibleCells is empty, which let cells appear
  // as 1-slot devices that accept their own type. Clicking the battery
  // icon on a cell ran replaceArtifactCells with the cell as the target,
  // which claimed the cell INTO ITSELF (installedIn = self.uuid).
  // The 0.13.2 manageArtifactPower / replaceArtifactCells guards stop
  // new self-installs; this migration scrubs the existing damage so
  // the Replace Cells dialog stops treating those cells as "installed."
  if (compareSemver(storedVersion, "0.13.2") < 0) {
    const scrubTotals = { scanned: 0, scrubbed: 0 };
    try {
      const visit = async (collection) => {
        for (const item of collection.contents) {
          if (item?.type !== "gear" || item?.system?.subtype !== "power-cell") continue;
          scrubTotals.scanned += 1;
          const installedIn = item.flags?.[SYSTEM_ID]?.installedIn;
          if (installedIn && installedIn === item.uuid) {
            await item.update({
              [`flags.${SYSTEM_ID}.-=installedIn`]: null
            }, { gammaWorldSync: true });
            scrubTotals.scrubbed += 1;
          }
        }
      };
      await visit(game.items);
      for (const actor of game.actors.contents) {
        await visit(actor.items);
      }
      if (scrubTotals.scrubbed > 0 && game.user?.isGM) {
        await ChatMessage.create({
          speaker: { alias: "Gamma World" },
          whisper: ChatMessage.getWhisperRecipients("GM"),
          content: `<div class="gw-chat-card"><p><strong>Migration 0.13.2:</strong> scrubbed ${scrubTotals.scrubbed} cell${scrubTotals.scrubbed === 1 ? "" : "s"} that had been incorrectly self-installed (out of ${scrubTotals.scanned} scanned).</p></div>`
        });
      }
    } catch (error) {
      console.warn(`${SYSTEM_ID} | 0.13.2 self-install scrub failed`, error);
    }
  }

  // 0.14.1 — Hit Dice resource backfill. Every character actor gets
  // `system.resources.hitDice.value = level` so the new Short Rest
  // dialog has a real spend pool to work from. `max` is derived from
  // level on prepareDerivedData; persisting it just keeps the schema
  // happy on first load.
  if (compareSemver(storedVersion, "0.14.1") < 0) {
    let updated = 0;
    try {
      for (const actor of game.actors.contents) {
        if (actor.type !== "character") continue;
        const level = Math.max(1, Math.floor(Number(actor.system?.details?.level ?? 1)));
        const currentValue = Number(actor.system?.resources?.hitDice?.value ?? 0);
        const currentMax = Number(actor.system?.resources?.hitDice?.max ?? 0);
        if (currentMax >= level && currentValue > 0) continue;   // already migrated
        await actor.update({
          "system.resources.hitDice.value": level,
          "system.resources.hitDice.max":   level
        }, { gammaWorldSync: true });
        updated += 1;
      }
      if (updated > 0 && game.user?.isGM) {
        await ChatMessage.create({
          speaker: { alias: "Gamma World" },
          whisper: ChatMessage.getWhisperRecipients("GM"),
          content: `<div class="gw-chat-card"><p><strong>Migration 0.14.1:</strong> Hit Dice resource added to ${updated} character${updated === 1 ? "" : "s"}. Use the new Short Rest / Long Rest buttons on the character sheet.</p></div>`
        });
      }
    } catch (error) {
      console.warn(`${SYSTEM_ID} | 0.14.1 hitDice backfill failed`, error);
    }
  }

  // 0.14.3 — heal cell-driven items that ship "lying" from the studio.
  // Pre-0.14.3 studio JSONs set `power.cellsInstalled: 1` and a positive
  // `charges.max` even though `installedCellIds: []`. The mismatch let
  // unloaded weapons fire by satisfying the `cellsSatisfied` gate via
  // the legacy count. Here we sweep every owned + world cell-driven
  // item and force the unloaded shape: cellsInstalled = installedCellIds.length,
  // charges.{current,max} zeroed when no cells are claimed.
  if (compareSemver(storedVersion, "0.14.3") < 0) {
    let healed = 0;
    try {
      const healItem = async (item) => {
        if (!["weapon", "armor", "gear"].includes(item.type)) return;
        const perUnit = Number(item.system?.consumption?.perUnit ?? 0);
        if (perUnit <= 0) return;
        const ids = Array.isArray(item.system?.artifact?.power?.installedCellIds)
          ? item.system.artifact.power.installedCellIds : [];
        const recordedCount = Number(item.system?.artifact?.power?.cellsInstalled ?? 0);
        const chargesMax = Number(item.system?.artifact?.charges?.max ?? 0);
        const chargesCur = Number(item.system?.artifact?.charges?.current ?? 0);
        // Mismatch between count and array, OR a legacy charges counter
        // sitting on a cell-driven item, both indicate the lying shape.
        if (recordedCount === ids.length && chargesMax === 0 && chargesCur === 0) return;
        const update = {
          "system.artifact.power.cellsInstalled": ids.length,
          "system.artifact.charges.current": 0,
          "system.artifact.charges.max":     0
        };
        if (ids.length === 0) {
          update["system.artifact.power.installedType"] = "none";
        }
        await item.update(update, { gammaWorldSync: true });
        healed += 1;
      };
      for (const item of game.items.contents) await healItem(item);
      for (const actor of game.actors.contents) {
        for (const item of actor.items.contents) await healItem(item);
      }
      for (const scene of game.scenes?.contents ?? []) {
        for (const tokenDoc of scene.tokens?.contents ?? []) {
          if (tokenDoc.actorLink) continue;
          const actor = tokenDoc.actor;
          if (!actor) continue;
          for (const item of actor.items.contents) await healItem(item);
        }
      }
      if (healed > 0 && game.user?.isGM) {
        await ChatMessage.create({
          speaker: { alias: "Gamma World" },
          whisper: ChatMessage.getWhisperRecipients("GM"),
          content: `<div class="gw-chat-card"><p><strong>Migration 0.14.3:</strong> ${healed} cell-driven item${healed === 1 ? "" : "s"} healed (legacy phantom charges cleared; cellsInstalled now reflects actual installed cells). Players may need to install cells via the artifact's power-management dialog before firing.</p></div>`
        });
      }
    } catch (error) {
      console.warn(`${SYSTEM_ID} | 0.14.3 cell-shape heal failed`, error);
    }
  }

  // 0.14.0 — ammunition refactor. Rename bundle gear ("Arrows (bundle of
  // 20)" → "Arrow", quantity 20), delete five orphan cartridges and the
  // Javelin gear, prune dropped slugs from weapon ammoType SetFields,
  // and fold spare javelin gear into the Javelin weapon's quantity.
  if (compareSemver(storedVersion, "0.14.0") < 0) {
    const totals = { renamed: 0, deletedCartridges: 0, javelinFolded: 0, weaponsPruned: 0 };
    try {
      const worldCounts = await migrateAmmunition014World();
      totals.renamed += worldCounts.renamed;
      totals.deletedCartridges += worldCounts.deletedCartridges;
      totals.weaponsPruned += worldCounts.weaponsPruned;
      for (const actor of game.actors.contents) {
        const counts = await migrateAmmunition014(actor);
        totals.renamed += counts.renamed;
        totals.deletedCartridges += counts.deletedCartridges;
        totals.javelinFolded += counts.javelinFolded;
        totals.weaponsPruned += counts.weaponsPruned;
      }
      const tokenCounts = await migrateAmmunition014UnlinkedTokens();
      totals.renamed += tokenCounts.renamed;
      totals.deletedCartridges += tokenCounts.deletedCartridges;
      totals.javelinFolded += tokenCounts.javelinFolded;
      totals.weaponsPruned += tokenCounts.weaponsPruned;
      if (game.user?.isGM) {
        const summary = [
          `<strong>Migration 0.14.0:</strong> ammunition refactored to per-unit stacks.`,
          totals.renamed > 0
            ? `${totals.renamed} ammo stack${totals.renamed === 1 ? "" : "s"} renamed (e.g. "Arrows (bundle of 20)" → "Arrow", quantity 20).`
            : null,
          totals.deletedCartridges > 0
            ? `${totals.deletedCartridges} orphan cartridge${totals.deletedCartridges === 1 ? "" : "s"} removed (Energy Clip / Blaster Pack / Black Ray Cell / Fusion Cell / Stun Rifle Cell / Javelin gear).`
            : null,
          totals.javelinFolded > 0
            ? `${totals.javelinFolded} javelin${totals.javelinFolded === 1 ? "" : "s"} folded into the Javelin weapon's quantity.`
            : null,
          totals.weaponsPruned > 0
            ? `${totals.weaponsPruned} weapon${totals.weaponsPruned === 1 ? "" : "s"} had obsolete ammo slugs pruned.`
            : null
        ].filter(Boolean).join(" ");
        await ChatMessage.create({
          speaker: { alias: "Gamma World" },
          whisper: ChatMessage.getWhisperRecipients("GM"),
          content: `<div class="gw-chat-card"><p>${summary}</p></div>`
        });
      }
    } catch (error) {
      console.warn(`${SYSTEM_ID} | 0.14.0 ammo migration failed`, error);
    }
  }

  await game.settings.set(SYSTEM_ID, "schemaVersion", currentVersion);
}

/**
 * Minimal semver comparison: returns -1 / 0 / +1.
 * Treats missing segments as 0 (e.g. "0.6" vs "0.6.0" → 0).
 */
function compareSemver(a, b) {
  const segs = (v) => String(v ?? "").split(".").map((n) => Number(n) || 0);
  const [aMajor = 0, aMinor = 0, aPatch = 0] = segs(a);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = segs(b);
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}
