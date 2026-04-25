import { SYSTEM_ID, POWER_CELL_TYPES, ARTIFACT_AMBIENT_SOURCES, CELL_MAX_CHARGE, MINUTES_PER_ROUND } from "./config.mjs";

const CELL_ITEM_NAMES = {
  chemical: "Chemical Energy Cell",
  solar: "Solar Energy Cell",
  hydrogen: "Hydrogen Energy Cell",
  nuclear: "Atomic Energy Cell"
};

/**
 * 0.12.0 — single-source-of-truth test for "is this a power-cell gear item?"
 * Power cells are `type: "gear"` with `subtype: "power-cell"`. Their
 * `system.artifact.charges.current/max` is interpreted as integer percent
 * charge (0..CELL_MAX_CHARGE). Non-cell artifacts keep the legacy
 * "shots/uses remaining" meaning on the same field.
 */
export function isPowerCell(item) {
  return item?.type === "gear" && item?.system?.subtype === "power-cell";
}

/**
 * 0.12.0 — read a cell's current charge as an integer percent clamped to
 * [0, CELL_MAX_CHARGE]. Returns `null` for non-cell items so callers can
 * distinguish "no cell here" from "cell at 0%".
 */
export function cellChargePercent(item) {
  if (!isPowerCell(item)) return null;
  const raw = Number(item.system?.artifact?.charges?.current ?? 0);
  return Math.max(0, Math.min(CELL_MAX_CHARGE, Math.round(raw)));
}

function artifactData(item) {
  return item?.system?.artifact ?? {};
}

function powerData(item) {
  return artifactData(item).power ?? {};
}

function titleCase(value = "") {
  return String(value ?? "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function localizeConfig(map, key, fallback = key) {
  const label = map?.[key];
  if (label && globalThis.game?.i18n) return game.i18n.localize(label);
  return fallback;
}

function splitCsv(value = "") {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizedCellSlotCount(item) {
  const explicit = Math.max(0, Number(powerData(item).cellSlots ?? 0));
  if (explicit > 0) return explicit;
  return compatibleCellTypes(item).length ? 1 : 0;
}

function currentAmbientSource(item) {
  const power = powerData(item);
  if (power.ambientSource && (power.ambientSource !== "none")) return power.ambientSource;
  if ((artifactData(item).powerSource ?? "none") === "broadcast") return "broadcast";
  return "none";
}

function currentRequirement(item) {
  const power = powerData(item);
  if (power.requirement) return power.requirement;
  if (currentAmbientSource(item) !== "none") return compatibleCellTypes(item).length ? "cells-or-ambient" : "ambient";
  return compatibleCellTypes(item).length ? "cells" : "none";
}

export function compatibleCellTypes(item) {
  const explicit = splitCsv(powerData(item).compatibleCells ?? "");
  if (explicit.length) return explicit;
  const legacy = artifactData(item).powerSource ?? "none";
  return CELL_ITEM_NAMES[legacy] ? [legacy] : [];
}

export function artifactCellTypeLabel(type = "none") {
  if (type === "none") return localizeConfig(POWER_CELL_TYPES, type, "none");
  return localizeConfig(POWER_CELL_TYPES, type, titleCase(type));
}

export function artifactAmbientSourceLabel(source = "none") {
  return localizeConfig(ARTIFACT_AMBIENT_SOURCES, source, titleCase(source));
}

export function artifactPowerStatus(item) {
  const artifact = artifactData(item);
  const power = powerData(item);
  const compatibleTypes = compatibleCellTypes(item);
  const cellSlots = normalizedCellSlotCount(item);
  const cellsInstalled = Math.max(0, Number(power.cellsInstalled ?? 0));
  const installedType = power.installedType && (power.installedType !== "none")
    ? power.installedType
    : compatibleTypes[0] ?? "none";
  const ambientSource = currentAmbientSource(item);
  const ambientAvailable = !!power.ambientAvailable;
  const requirement = currentRequirement(item);
  const chargesCurrent = Math.max(0, Number(artifact.charges?.current ?? 0));
  const chargesMax = Math.max(0, Number(artifact.charges?.max ?? 0));

  // 0.13.0: cell-drain path. When an item has declared a per-use drain
  // rate and installed at least one cell, it's considered "depleted"
  // only when every installed cell is at 0% charge. Drops the legacy
  // own-charges-current check for these items.
  const perUnit = Number(item?.system?.consumption?.perUnit ?? 0);
  const installedCellIds = Array.isArray(power.installedCellIds) ? power.installedCellIds : [];
  const usesCellDrain = perUnit > 0 && installedCellIds.length > 0;

  const cellsSatisfied = !requirement.includes("cells") || (cellSlots > 0 && cellsInstalled >= cellSlots);
  const ambientSatisfied = !requirement.includes("ambient") || ambientAvailable;

  let powered = true;
  let reason = "";

  if (requirement === "cells" && !cellsSatisfied) {
    powered = false;
    reason = "cells";
  } else if (requirement === "ambient" && !ambientSatisfied) {
    powered = false;
    reason = "ambient";
  } else if ((requirement === "cells-or-ambient") && !(cellsSatisfied || ambientSatisfied)) {
    powered = false;
    reason = "cells-or-ambient";
  } else if (usesCellDrain) {
    // Depleted iff every installed cell is at 0% charge. Resolving cells
    // by UUID here would require awaits, so we defer the aggregate charge
    // check to drainInstalledCells' own depletion notice; the gate below
    // just needs to know "is there at least one non-broken, non-empty
    // cell in the pool?" We approximate using the synchronous UUID sync:
    const anyCellHasCharge = installedCellIds.some((uuid) => {
      try {
        const cell = foundry.utils.fromUuidSync?.(uuid)
          ?? globalThis.fromUuidSync?.(uuid);
        return cell ? (cellChargePercent(cell) ?? 0) > 0 : false;
      } catch (_error) {
        return false;
      }
    });
    if (!anyCellHasCharge) {
      powered = false;
      reason = "depleted";
    }
  } else if ((chargesMax > 0) && (chargesCurrent <= 0)) {
    powered = false;
    reason = "depleted";
  }

  return {
    requirement,
    compatibleTypes,
    cellSlots,
    cellsInstalled,
    installedType,
    installedCellIds,
    ambientSource,
    ambientAvailable,
    chargesCurrent,
    chargesMax,
    usesCellDrain,
    perUnit,
    powered,
    reason
  };
}

export function artifactNeedsPowerManagement(item) {
  const status = artifactPowerStatus(item);
  return !!(status.cellSlots || (status.ambientSource !== "none") || status.chargesMax > 0);
}

export function artifactPowerFailureMessage(item) {
  const status = artifactPowerStatus(item);
  const deviceName = item?.name ?? "This artifact";
  const compatible = status.compatibleTypes.map((type) => artifactCellTypeLabel(type)).join(" or ");
  if (status.reason === "cells") {
    const plural = status.cellSlots === 1 ? "" : "s";
    return `${deviceName} requires ${status.cellSlots} ${compatible || "power"} cell${plural}.`;
  }
  if (status.reason === "ambient") {
    return `${deviceName} needs ${artifactAmbientSourceLabel(status.ambientSource).toLowerCase()} power to be available.`;
  }
  if (status.reason === "cells-or-ambient") {
    return `${deviceName} needs either fitted ${compatible || "power"} cells or available external power.`;
  }
  if (status.reason === "depleted") {
    return `${deviceName} is out of power.`;
  }
  return `${deviceName} is not powered.`;
}

export function artifactPowerSummary(item) {
  const status = artifactPowerStatus(item);
  const parts = [];

  if (status.cellSlots > 0) {
    const baseType = status.installedType !== "none"
      ? artifactCellTypeLabel(status.installedType)
      : status.compatibleTypes.map((type) => artifactCellTypeLabel(type)).join(" / ");
    const plural = status.cellSlots === 1 ? "cell" : "cells";
    parts.push(`${status.cellsInstalled}/${status.cellSlots} ${baseType} ${plural}`);
  }

  if (status.ambientSource !== "none") {
    parts.push(`${artifactAmbientSourceLabel(status.ambientSource)} ${status.ambientAvailable ? "online" : "offline"}`);
  }

  if (status.chargesMax > 0) {
    parts.push(`${status.chargesCurrent}/${status.chargesMax} power`);
  }

  return parts.join(" · ");
}

export function artifactUsesRechargeableCells(item) {
  const status = artifactPowerStatus(item);
  const activeType = status.installedType !== "none"
    ? status.installedType
    : status.compatibleTypes[0] ?? "none";
  return ["chemical", "hydrogen"].includes(activeType);
}

export function artifactCellItemName(type = "none") {
  return CELL_ITEM_NAMES[type] ?? "";
}

/**
 * 0.13.0 — return every uninstalled cell of the given type on the actor,
 * sorted highest-charge-first. Under the 0.12.0 quantity: 1 invariant each
 * cell is its own inventory row; we filter out any already-installed cells
 * (flagged `installedIn: <device uuid>`) so they're not double-claimed.
 */
function uninstalledCellsOfType(actor, type) {
  const itemName = artifactCellItemName(type);
  if (!itemName) return [];
  return actor.items
    .filter((entry) => {
      if (entry.type !== "gear" || entry.name !== itemName) return false;
      if (entry.system?.subtype !== "power-cell") return false;
      const installedIn = entry.flags?.[SYSTEM_ID]?.installedIn;
      return !installedIn;
    })
    .sort((a, b) => (cellChargePercent(b) ?? 0) - (cellChargePercent(a) ?? 0));
}

function uninstalledCellCount(actor, type) {
  return uninstalledCellsOfType(actor, type).length;
}

/**
 * 0.13.0 — tag `slots` cells of `type` as installed in `item`, returning
 * their UUIDs. Cells stay in the actor's inventory but are flagged so
 * they can't be claimed by another device. Picks the highest-charged
 * cells first. Returns an empty array if fewer than `slots` cells are
 * available.
 */
async function claimCellsForDevice(actor, type, slots, item) {
  const candidates = uninstalledCellsOfType(actor, type);
  if (candidates.length < slots) return [];
  const chosen = candidates.slice(0, slots);
  const uuids = [];
  for (const cell of chosen) {
    await cell.update({ [`flags.${SYSTEM_ID}.installedIn`]: item.uuid });
    uuids.push(cell.uuid);
  }
  return uuids;
}

/**
 * 0.13.0 — uninstall a single cell from `item` by cellUuid. Strips the
 * cell's `installedIn` flag, removes it from the item's `installedCellIds`
 * array, and decrements `cellsInstalled`. The cell stays in the actor's
 * inventory at its current charge.
 */
export async function uninstallCell(item, cellUuid) {
  const currentIds = [...(item.system?.artifact?.power?.installedCellIds ?? [])];
  const nextIds = currentIds.filter((uuid) => uuid !== cellUuid);
  if (nextIds.length === currentIds.length) return false;   // not installed

  try {
    const cell = await fromUuid(cellUuid);
    if (cell && cell.flags?.[SYSTEM_ID]?.installedIn === item.uuid) {
      await cell.update({ [`flags.${SYSTEM_ID}.-=installedIn`]: null });
    }
  } catch (_error) {
    // Cell is gone — still scrub the item's ID list below.
  }

  await item.update({
    "system.artifact.power.installedCellIds": nextIds,
    "system.artifact.power.cellsInstalled": Math.max(0, nextIds.length)
  });
  return true;
}

/**
 * 0.13.0 — pivot from the legacy "consume N cell quantities on install"
 * model to UUID-claim: find uninstalled cells in inventory, flag them as
 * installed in this device, and record their UUIDs on the device. The
 * cells stay in the actor's inventory; they just can't be claimed again
 * until uninstalled. We do NOT overwrite the item's own charges.current
 * anymore — cells carry the charge now.
 */
export async function replaceArtifactCells(actor, item, { cellType = "" } = {}) {
  const status = artifactPowerStatus(item);
  const slots = Math.max(1, status.cellSlots);
  const compatible = status.compatibleTypes;
  if (!compatible.length || !slots) {
    ui.notifications?.info(`${item.name} does not accept removable power cells.`);
    return false;
  }

  const options = compatible
    .map((type) => ({
      type,
      count: uninstalledCellCount(actor, type)
    }))
    .filter((entry) => entry.count > 0);

  if (!options.length) {
    ui.notifications?.warn(`No compatible power cells are available for ${item.name}.`);
    return false;
  }

  let selectedType = cellType;
  if (!selectedType) {
    const DialogV2 = foundry.applications.api.DialogV2;
    selectedType = await DialogV2.prompt({
      window: { title: `${item.name} Power Cells` },
      content: `<form class="gw-power-dialog">
        <p>Select a replacement cell set for <strong>${item.name}</strong>.</p>
        <label>Cell type
          <select name="cellType">
            ${options.map((entry) => `<option value="${entry.type}">${artifactCellTypeLabel(entry.type)} (${entry.count} available)</option>`).join("")}
          </select>
        </label>
      </form>`,
      ok: {
        label: "Load Cells",
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object.cellType
      },
      rejectClose: false
    });
  }

  if (!selectedType) return false;
  const selectedOption = options.find((entry) => entry.type === selectedType);
  if (!selectedOption) {
    ui.notifications?.warn(`No ${artifactCellTypeLabel(selectedType)} cells are available.`);
    return false;
  }
  if (selectedOption.count < slots) {
    ui.notifications?.warn(`${item.name} needs ${slots} ${artifactCellTypeLabel(selectedType)} cell${slots === 1 ? "" : "s"}.`);
    return false;
  }

  // 0.13.0: eject any currently-installed cells (strip their flags) so
  // fresh claims don't collide with stale ones. Cells retain their charge.
  const currentIds = [...(item.system?.artifact?.power?.installedCellIds ?? [])];
  for (const uuid of currentIds) {
    try {
      const existing = await fromUuid(uuid);
      if (existing && existing.flags?.[SYSTEM_ID]?.installedIn === item.uuid) {
        await existing.update({ [`flags.${SYSTEM_ID}.-=installedIn`]: null });
      }
    } catch (_error) { /* best-effort scrub */ }
  }

  const claimedUuids = await claimCellsForDevice(actor, selectedType, slots, item);
  if (claimedUuids.length < slots) {
    ui.notifications?.warn(`Could not claim enough ${artifactCellTypeLabel(selectedType)} cells for ${item.name}.`);
    return false;
  }

  const update = {
    "system.artifact.power.installedCellIds": claimedUuids,
    "system.artifact.power.cellsInstalled": slots,
    "system.artifact.power.installedType": selectedType,
    "system.artifact.power.requirement": status.requirement === "ambient" ? "cells-or-ambient" : status.requirement,
    "system.artifact.powerSource": selectedType
  };
  // 0.13.0: do NOT set charges.current = chargesMax. The cell owns the
  // charge now. The item's own charges.current/max stays at whatever the
  // legacy path / migration wrote. For medi-kit-style consumers (still on
  // the legacy counter because they have no consumption rule), nothing
  // here changes; the medi-kit code path continues to run as before.
  await item.update(update);
  return true;
}

export async function setArtifactAmbientAvailability(item, available) {
  await item.update({ "system.artifact.power.ambientAvailable": !!available });
  return true;
}

/**
 * 0.13.0 — an item is "active for drain" if it's currently running and
 * should be debiting its installed cells. For armor and most gear this
 * maps to the `equipped` flag; for weapons it's the new
 * `system.artifact.active` toggle (defaulted false; set by the Ignite
 * button in Batch 2 — discrete-shot weapons skip this check since
 * firing is the drain trigger itself).
 */
export function isItemActiveForDrain(item) {
  if (!item) return false;
  if (item.type === "armor") return !!item.system?.equipped;
  if (item.type === "weapon") return !!item.system?.artifact?.active;
  if (item.type === "gear")   return !!item.system?.equipped;
  return false;
}

/**
 * 0.13.0 — debit each installed cell by `amount * perUnit` percent.
 *
 * Semantic note (0.13.1 fix): cells in parallel drain at the same rate
 * simultaneously; the catalog's perUnit IS the per-cell drain rate.
 * Earlier code divided by cellIds.length, which halved the drain for
 * multi-cell devices and made them last twice as long as the rulebook.
 * Removed.
 *
 * Sub-percent residue accumulates in the item's
 * `flags.<SYSTEM_ID>.drainAccumulator` so a 2%/hour armor eventually
 * debits 1% after half an hour, etc. Broken cell UUIDs (cell deleted
 * or transferred off the actor) are scrubbed from the item on the next
 * drain. Returns a summary object describing what was debited.
 */
async function drainInstalledCells(item, amount, perUnit, cellIds) {
  const unitsRequested = Math.max(0, Number(amount) || 0);
  if (unitsRequested === 0) return { consumed: false, reason: "zero-amount" };
  if (!Array.isArray(cellIds) || cellIds.length === 0) {
    return { consumed: false, reason: "no-cells" };
  }

  // perUnit is the per-cell drain rate. With cells in parallel they all
  // drain at the same rate simultaneously, so one accumulator on the
  // item suffices for the whole pool.
  const perCellRate = unitsRequested * Number(perUnit || 0);

  const flagPath = `flags.${SYSTEM_ID}.drainAccumulator`;
  const priorAcc = Number(foundry.utils.getProperty(item, flagPath) ?? 0) || 0;
  const proposedPerCell = priorAcc + perCellRate;
  const wholePctPerCell = Math.floor(proposedPerCell);
  const residue         = proposedPerCell - wholePctPerCell;

  // Persist the new residue (even if wholePct = 0 — the fraction needs
  // to carry forward to the next call).
  await item.update({ [flagPath]: residue });

  if (wholePctPerCell <= 0) {
    return { consumed: true, integerPercentPerCell: 0, residueAfter: residue };
  }

  const actor = item.parent ?? null;
  const freshInstalledIds = [];
  const depleted = [];
  let scrubbed = 0;

  for (const cellUuid of cellIds) {
    let cell;
    try { cell = await fromUuid(cellUuid); } catch (_e) { cell = null; }
    const stillValid =
      cell &&
      cell.type === "gear" &&
      cell.system?.subtype === "power-cell" &&
      (!actor || cell.parent === actor);
    if (!stillValid) {
      scrubbed += 1;
      console.warn(`${SYSTEM_ID} | ${item.name} has a dangling installed cell reference (${cellUuid}); scrubbing.`);
      continue;
    }
    const before = cellChargePercent(cell) ?? 0;
    const after  = Math.max(0, before - wholePctPerCell);
    if (after !== before) {
      await cell.update({ "system.artifact.charges.current": after });
    }
    if (after === 0 && before > 0) depleted.push(cell);
    freshInstalledIds.push(cellUuid);
  }

  if (scrubbed > 0) {
    await item.update({
      "system.artifact.power.installedCellIds": freshInstalledIds,
      "system.artifact.power.cellsInstalled": freshInstalledIds.length
    });
  }

  for (const cell of depleted) {
    await postCellDepletedNotice(item, cell);
  }

  return {
    consumed: true,
    integerPercentPerCell: wholePctPerCell,
    residueAfter: residue,
    installedCellIdsAfter: freshInstalledIds,
    depletedCount: depleted.length
  };
}

async function postCellDepletedNotice(item, cell) {
  const deviceName = item?.name ?? "Device";
  const cellName   = cell?.name ?? "Power cell";
  try {
    await ChatMessage.create({
      speaker: { alias: "Gamma World" },
      whisper: ChatMessage.getWhisperRecipients("GM"),
      content: `<div class="gw-chat-card"><p><strong>${deviceName}</strong>'s <strong>${cellName}</strong> is depleted.</p></div>`
    });
  } catch (_error) { /* cosmetic */ }
}

/**
 * 0.13.0 — entry point for time-based drain (Batches 2-4). Gates on
 * `isItemActiveForDrain`, then funnels through `consumeArtifactCharge`
 * (which will route to drainInstalledCells when installedCellIds is
 * populated).
 */
export async function accumulateDrain(item, deltaUnits) {
  if (!isItemActiveForDrain(item)) return { consumed: false, reason: "inactive" };
  return consumeArtifactCharge(item, deltaUnits);
}

/**
 * 0.13.0 Batch 4 — true when a cell-drained armor has run out of power.
 *
 * An armor is "inert" iff:
 *   1. It declares a per-tick drain rule (consumption.perUnit > 0)
 *   2. AND either it has no installed cells at all, OR every installed
 *      cell is at 0% charge (or its UUID is broken).
 *
 * Used by buildActorDerived and applyEquipmentEffects to gate the
 * powered benefits (AC bonus, force field, flight, lift, granted
 * traits) on the armor still having juice. The `dxPenalty` continues
 * to apply regardless — an inert powered-armor suit is still a heavy
 * carcass on the wearer; the penalty stays.
 *
 * Non-cell-drained armor (no consumption rule) is never inert — those
 * pieces are mechanical/passive and don't depend on power.
 */
export function armorIsInert(armor) {
  // Hardened against throws — derived-data pipeline calls this for every
  // equipped armor on every prepareData pass, including in-flight states
  // during item drag/drop where partial documents can be in unusual
  // shapes. Any throw here would break the sheet render (and therefore
  // drop acceptance), so the whole function is wrapped to fail-soft to
  // "not inert" — that matches pre-0.13.0 behavior (armor stays usable).
  try {
    if (!armor || armor.type !== "armor") return false;
    const perUnit = Number(armor.system?.consumption?.perUnit ?? 0);
    if (perUnit <= 0) return false;   // not cell-drained, can't go inert
    const rawCellIds = armor.system?.artifact?.power?.installedCellIds;
    const cellIds = Array.isArray(rawCellIds) ? rawCellIds : [];
    if (cellIds.length === 0) return true;   // declares drain but no cells slotted
    // Inert iff every cell is at 0% (broken UUIDs count as missing/empty).
    for (const uuid of cellIds) {
      try {
        const cell = foundry.utils.fromUuidSync?.(uuid)
          ?? globalThis.fromUuidSync?.(uuid);
        if (cell && (cellChargePercent(cell) ?? 0) > 0) return false;
      } catch (_error) { /* broken ref counts as empty */ }
    }
    return true;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | armorIsInert threw on ${armor?.name ?? "?"}; treating as not-inert`, error);
    return false;
  }
}

/**
 * 0.13.0 Batch 3 — world-time tick for per-hour drain devices.
 *
 * Wired to `Hooks.on("updateWorldTime")` in module/hooks.mjs. Foundry
 * fires this whenever `game.time.advance(seconds)` is called (e.g. by
 * a long-rest button, a "fast forward" macro, or the system's combat
 * encounter pacing). The `dt` argument is the delta in seconds.
 *
 * Walks every actor on the world; for each gear/armor/weapon item with
 * `consumption.unit === "hour"` AND `isItemActiveForDrain(item)` AND
 * at least one installed cell, debits those cells by `dt / 3600` hours.
 * The per-hour rate is fractional for most devices; `accumulateDrain`
 * carries sub-percent residue across calls.
 *
 * Out-of-scope (deferred): solar passive recharge in daylight (would
 * tick UP); disuse drain over years; ambient line/broadcast power.
 */
export async function tickWorldTimePowerDrain(_worldTime, dt, _options) {
  if (!game.user?.isGM) return;
  const seconds = Math.max(0, Number(dt) || 0);
  if (seconds === 0) return;
  const hours = seconds / 3600;

  for (const actor of game.actors?.contents ?? []) {
    for (const item of actor.items) {
      if (item.system?.consumption?.unit !== "hour") continue;
      if (!isItemActiveForDrain(item)) continue;
      const installed = item.system?.artifact?.power?.installedCellIds ?? [];
      if (!installed.length) continue;
      try {
        await accumulateDrain(item, hours);
      } catch (error) {
        console.warn(`${SYSTEM_ID} | tickWorldTimePowerDrain failed for ${item?.name}`, error);
      }
    }
  }
}

/**
 * 0.13.0 Batch 2 — combat-round tick for per-minute drain devices.
 *
 * Wired to `Hooks.on("updateCombat")` in module/hooks.mjs. Fires only
 * when the round counter advances (skipping turn-changes within the
 * same round). For each combatant's actor, scans owned items for
 * `consumption.unit === "minute"` AND `isItemActiveForDrain(item)` AND
 * at least one installed cell, then debits those cells by
 * MINUTES_PER_ROUND minutes' worth of drain via `accumulateDrain`.
 *
 * Out-of-combat the drain pauses — GW1e melee time only advances during
 * combat. A vibro dagger left ignited after combat doesn't burn its
 * cell on the world clock; players narratively handwave that away.
 */
export async function tickCombatPowerDrain(combat, changed) {
  if (!game.user?.isGM) return;
  if (!("round" in changed) || changed.round == null) return;

  const actors = new Set();
  for (const combatant of combat.combatants) {
    if (combatant.actor) actors.add(combatant.actor);
  }

  for (const actor of actors) {
    for (const item of actor.items) {
      if (item.system?.consumption?.unit !== "minute") continue;
      if (!isItemActiveForDrain(item)) continue;
      const installed = item.system?.artifact?.power?.installedCellIds ?? [];
      if (!installed.length) continue;
      try {
        await accumulateDrain(item, MINUTES_PER_ROUND);
      } catch (error) {
        console.warn(`${SYSTEM_ID} | tickCombatPowerDrain failed for ${item?.name}`, error);
      }
    }
  }
}

/**
 * 0.13.0 — route charge drain to installed cells when the item declares
 * a `consumption.perUnit > 0` AND has installedCellIds. Falls back to
 * the legacy per-item counter via consumeResource for medi-kit / pain
 * reducer / any item without the new consumption block set.
 */
export async function consumeArtifactCharge(item, amount = 1, { context = null } = {}) {
  const perUnit = Number(item?.system?.consumption?.perUnit ?? 0);
  const cellIds = Array.isArray(item?.system?.artifact?.power?.installedCellIds)
    ? item.system.artifact.power.installedCellIds
    : [];

  if (perUnit > 0 && cellIds.length > 0) {
    return drainInstalledCells(item, Math.max(0, Number(amount ?? 0)), perUnit, cellIds);
  }

  // Legacy per-item counter path (medi-kit doses, pre-migration items).
  const { consumeResource } = await import("./resource-consumption.mjs");
  return consumeResource(item, "artifactCharge", Math.max(0, Number(amount ?? 0)), { context });
}

export async function rechargeArtifact(item) {
  const max = Math.max(0, Number(item.system.artifact?.charges?.max ?? 0));
  await item.update({ "system.artifact.charges.current": max });
  return true;
}

export async function manageArtifactPower(actor, item) {
  const status = artifactPowerStatus(item);
  const actions = [];

  if (status.cellSlots > 0) actions.push({ value: "replace-cells", label: "Replace Cells" });
  if ((status.ambientSource !== "none") && game.user?.isGM) {
    actions.push({
      value: status.ambientAvailable ? "ambient-off" : "ambient-on",
      label: status.ambientAvailable ? "Disable External Power" : "Enable External Power"
    });
  }

  if (!actions.length) {
    ui.notifications?.info(`${item.name} has no configurable power controls.`);
    return false;
  }

  let choice = actions[0].value;
  if (actions.length > 1) {
    const DialogV2 = foundry.applications.api.DialogV2;
    choice = await DialogV2.prompt({
      window: { title: `${item.name} Power` },
      content: `<form class="gw-power-dialog">
        <p>${artifactPowerSummary(item) || "No active power state recorded."}</p>
        <label>Action
          <select name="choice">
            ${actions.map((entry) => `<option value="${entry.value}">${entry.label}</option>`).join("")}
          </select>
        </label>
      </form>`,
      ok: {
        label: "Confirm",
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object.choice
      },
      rejectClose: false
    });
  }

  if (!choice) return false;
  if (choice === "replace-cells") return replaceArtifactCells(actor, item);
  if (choice === "ambient-on") return setArtifactAmbientAvailability(item, true);
  if (choice === "ambient-off") return setArtifactAmbientAvailability(item, false);
  return false;
}
