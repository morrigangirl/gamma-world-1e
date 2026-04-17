import { SYSTEM_ID } from "./config.mjs";
import {
  ENCOUNTER_TABLE_LABELS,
  ENCOUNTER_TABLE_SEED_VERSION,
  ENCOUNTER_TERRAIN_KEYS
} from "./tables/encounter-tables.mjs";

function desiredEncounterTableNames() {
  return ENCOUNTER_TERRAIN_KEYS.map((terrain) => ENCOUNTER_TABLE_LABELS[terrain] ?? terrain);
}

export async function ensureEncounterTablesImported() {
  if (!game.user?.isGM) return;

  const pack = game.packs.get(`${SYSTEM_ID}.encounter-tables`);
  if (!pack) return;

  const expectedNames = desiredEncounterTableNames();
  const documents = await pack.getDocuments();
  const imported = [];
  const refreshed = [];
  const existingByName = new Map(
    game.tables.contents.map((table) => [table.name, table])
  );

  for (const table of documents) {
    if (!expectedNames.includes(table.name)) continue;
    const existing = existingByName.get(table.name);
    const existingVersion = Number(existing?.flags?.[SYSTEM_ID]?.encounterSeedVersion ?? 0);
    const existingManaged = !!existing?.flags?.[SYSTEM_ID]?.encounterSeed;

    if (existing && existingManaged && (existingVersion >= ENCOUNTER_TABLE_SEED_VERSION)) continue;
    if (existing) {
      await existing.delete();
      refreshed.push(table.name);
    }

    const created = await game.tables.importFromCompendium(pack, table.id, {}, { keepId: false });
    if (created) imported.push(created.name);
  }

  if (imported.length || refreshed.length) {
    const parts = [];
    if (imported.length) parts.push(`imported ${imported.length}`);
    if (refreshed.length) parts.push(`refreshed ${refreshed.length}`);
    ui.notifications?.info(`Gamma World encounter tables ${parts.join(" and ")}.`);
  }
}
