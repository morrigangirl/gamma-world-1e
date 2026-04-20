import { SYSTEM_ID, CRYPTIC_ALLIANCES, SKILLS } from "./config.mjs";
import { findMutationByName } from "./tables/mutation-data.mjs";
import { getMutationRule } from "./mutation-rules.mjs";
import { equipmentMigrationUpdate, inferGearSubtype, inferWeaponCategory } from "./equipment-rules.mjs";
import { prototypeTokenMigrationUpdate } from "./token-defaults.mjs";
import { GammaWorldConfig } from "./apps/gm-automation-config.mjs";
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

  for (const item of actor.items) {
    await migrateItem(item);
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

export async function migrateWorld() {
  if (!game.user?.isGM) return;

  const currentVersion = game.system.version ?? "0.1.0";
  const storedVersion = game.settings.get(SYSTEM_ID, "schemaVersion");
  if (storedVersion === currentVersion) return;

  // 0.9.0 Tier 3 — counter for the chat notice posted once per world
  // when temp-effect migration converts legacy flag entries into AEs.
  globalThis.gammaWorldTempEffectsMigrated = 0;

  for (const item of game.items.contents) {
    await migrateItem(item);
  }

  for (const actor of game.actors.contents) {
    await migrateActor(actor);
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
