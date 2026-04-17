import { POWER_CELL_TYPES, ARTIFACT_AMBIENT_SOURCES } from "./config.mjs";

const CELL_ITEM_NAMES = {
  chemical: "Chemical Energy Cell",
  solar: "Solar Energy Cell",
  hydrogen: "Hydrogen Energy Cell",
  nuclear: "Atomic Energy Cell"
};

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
    ambientSource,
    ambientAvailable,
    chargesCurrent,
    chargesMax,
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

function availableCellStacks(actor, type) {
  const itemName = artifactCellItemName(type);
  if (!itemName) return [];
  return actor.items
    .filter((entry) => entry.type === "gear" && entry.name === itemName)
    .sort((a, b) => Number(a.system.quantity ?? 0) - Number(b.system.quantity ?? 0));
}

function availableCellCount(actor, type) {
  return availableCellStacks(actor, type).reduce((sum, entry) => sum + Math.max(0, Number(entry.system.quantity ?? 0)), 0);
}

async function consumeCellQuantity(actor, type, quantity) {
  let remaining = Math.max(0, Number(quantity ?? 0));
  if (!remaining) return true;

  const stacks = availableCellStacks(actor, type);
  if (stacks.reduce((sum, entry) => sum + Math.max(0, Number(entry.system.quantity ?? 0)), 0) < remaining) {
    return false;
  }

  for (const stack of stacks) {
    if (!remaining) break;
    const current = Math.max(0, Number(stack.system.quantity ?? 0));
    if (!current) continue;
    const spend = Math.min(current, remaining);
    remaining -= spend;
    const next = current - spend;
    if (next > 0) await stack.update({ "system.quantity": next });
    else await stack.delete();
  }

  return remaining === 0;
}

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
      count: availableCellCount(actor, type)
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

  const currentCharge = Math.max(0, Number(item.system.artifact?.charges?.current ?? 0));
  if ((status.cellsInstalled > 0) && (currentCharge > 0)) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const confirmed = await DialogV2.confirm({
      window: { title: `${item.name} Power Cells` },
      content: `<p>Replacing the installed cells will discard the remaining ${currentCharge} power in ${item.name}. Continue?</p>`
    });
    if (!confirmed) return false;
  }

  const consumed = await consumeCellQuantity(actor, selectedType, slots);
  if (!consumed) {
    ui.notifications?.warn(`Could not consume enough ${artifactCellTypeLabel(selectedType)} cells for ${item.name}.`);
    return false;
  }

  const update = {
    "system.artifact.power.cellsInstalled": slots,
    "system.artifact.power.installedType": selectedType,
    "system.artifact.power.requirement": status.requirement === "ambient" ? "cells-or-ambient" : status.requirement,
    "system.artifact.powerSource": selectedType
  };
  if (status.chargesMax > 0) update["system.artifact.charges.current"] = status.chargesMax;
  await item.update(update);
  return true;
}

export async function setArtifactAmbientAvailability(item, available) {
  await item.update({ "system.artifact.power.ambientAvailable": !!available });
  return true;
}

export async function consumeArtifactCharge(item, amount = 1) {
  const current = Math.max(0, Number(item.system.artifact?.charges?.current ?? 0));
  await item.update({
    "system.artifact.charges.current": Math.max(0, current - Math.max(0, Number(amount ?? 0)))
  });
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
