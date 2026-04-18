/**
 * Gamma World 1st Edition — FoundryVTT v13 game system.
 * Entry point (registered in system.json as esmodules).
 */

import { GAMMA_WORLD, SYSTEM_ID, registerGammaWorldStatusEffects } from "./module/config.mjs";
import {
  CharacterData,
  WeaponData,
  ArmorData,
  GearData,
  MutationData
} from "./module/data/_module.mjs";
import { GammaWorldActor } from "./module/documents/actor.mjs";
import { GammaWorldItem }  from "./module/documents/item.mjs";
import { GammaWorldCharacterSheet, GammaWorldMonsterSheet } from "./module/sheets/actor-character-sheet.mjs";
import { GammaWorldItemSheet }      from "./module/sheets/item-sheet.mjs";
import { registerHelpers } from "./module/helpers.mjs";
import { registerHooks }   from "./module/hooks.mjs";
import { registerSoundCueHooks } from "./module/sound-cues.mjs";
import { migrateWorld, registerMigrationSettings } from "./module/migrations.mjs";
import { createSystemApi } from "./module/api.mjs";
import { registerAnimationHooks, registerAnimationSettings } from "./module/animations.mjs";
import { syncGrantedItems } from "./module/equipment-rules.mjs";
import { syncActorProtectionState } from "./module/effect-state.mjs";
import { registerGmExecutor } from "./module/gm-executor.mjs";
import { registerArtifactSessionSocket } from "./module/artifacts.mjs";
import { ensureEncounterTablesImported } from "./module/compendium-bootstrap.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing Gamma World 1st Edition system`);

  // Expose system config for templates and downstream code.
  CONFIG.GAMMA_WORLD = GAMMA_WORLD;

  // Document classes
  CONFIG.Actor.documentClass = GammaWorldActor;
  CONFIG.Item.documentClass  = GammaWorldItem;

  // DataModels — one per Actor type and Item type
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.monster = CharacterData;
  CONFIG.Item.dataModels.weapon     = WeaponData;
  CONFIG.Item.dataModels.armor      = ArmorData;
  CONFIG.Item.dataModels.gear       = GearData;
  CONFIG.Item.dataModels.mutation   = MutationData;

  // Initiative
  CONFIG.Combat.initiative = { formula: "1d20 + @attributes.dx.mod", decimals: 0 };

  // Status effects — ensure Gamma World-specific condition ids exist so the
  // on-hit auto-apply flow can toggle them on actor tokens.
  registerGammaWorldStatusEffects();

  const api = createSystemApi();
  game.gammaWorld = api;
  game.system.api = api;

  registerMigrationSettings();
  registerAnimationSettings();

  // Handlebars helpers
  registerHelpers();

  // Sheets — Actor
  const ActorsCollection = foundry.documents.collections.Actors;
  ActorsCollection.registerSheet(SYSTEM_ID, GammaWorldCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "GAMMA_WORLD.Sheet.Character"
  });
  ActorsCollection.registerSheet(SYSTEM_ID, GammaWorldMonsterSheet, {
    types: ["monster"],
    makeDefault: true,
    label: "GAMMA_WORLD.Sheet.Monster"
  });
  ActorsCollection.registerSheet(SYSTEM_ID, GammaWorldMonsterSheet, {
    types: ["character"],
    makeDefault: false,
    label: "GAMMA_WORLD.Sheet.Monster"
  });

  // Sheets — Item
  const ItemsCollection = foundry.documents.collections.Items;
  ItemsCollection.registerSheet(SYSTEM_ID, GammaWorldItemSheet, {
    types: ["weapon", "armor", "gear", "mutation"],
    makeDefault: true,
    label: "GAMMA_WORLD.Sheet.Item"
  });

  // Hooks (chat card wiring)
  registerHooks();
  registerAnimationHooks();
  registerSoundCueHooks();
});

Hooks.once("ready", () => {
  console.log(`${SYSTEM_ID} | Ready`);
  (async () => {
    registerGmExecutor();
    registerArtifactSessionSocket();
    await migrateWorld();
    if (!game.user?.isGM) return;
    await ensureEncounterTablesImported();
    for (const actor of game.actors.contents.filter((entry) => ["character", "monster"].includes(entry.type))) {
      await syncGrantedItems(actor);
      await syncActorProtectionState(actor);
      await actor.refreshDerivedResources({ adjustCurrent: false });
    }
  })().catch((error) => {
    console.error(`${SYSTEM_ID} | Migration failed`, error);
  });
});
