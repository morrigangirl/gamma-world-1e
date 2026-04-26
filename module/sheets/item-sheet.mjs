/**
 * GammaWorldItemSheet — ApplicationV2 sheet for all four item types.
 * One class, one template, branches on this.document.type.
 */

import { SYSTEM_ID, DAMAGE_TYPES, DAMAGE_TYPE_LABELS, AMMO_TYPES, AMMO_TYPE_KEYS } from "../config.mjs";
import { artifactPowerSummary, isPowerCell, cellChargePercent, uninstallCell as uninstallCellFn } from "../artifact-power.mjs";
import { itemPowerBadge } from "../item-power-status.mjs";
import { isRichEditorChange, wireRichEditorToggles } from "./actor-character-sheet.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class GammaWorldItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** Currently-active tab (item vs artifact). Preserved across re-renders
   *  so auto-save on field change doesn't reset the view. */
  #activeTab = "item";

  static DEFAULT_OPTIONS = {
    classes: ["gamma-world", "sheet", "item"],
    // Wider than the previous 560 so weapon tables (Short/Med/Long,
    // Deflection, ammo) fit on a single row without wrapping. Height
    // is explicit so ApplicationV2's resize handle activates.
    position: { width: 720, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      clearMalfunction: GammaWorldItemSheet.#onClearMalfunction,
      uninstallCell:    GammaWorldItemSheet.#onUninstallCell,
      createItemAE: GammaWorldItemSheet.#onCreateItemAE,
      toggleItemAE: GammaWorldItemSheet.#onToggleItemAE,
      editItemAE:   GammaWorldItemSheet.#onEditItemAE,
      deleteItemAE: GammaWorldItemSheet.#onDeleteItemAE
    }
  };

  static PARTS = {
    form: {
      template: `systems/${SYSTEM_ID}/templates/item/item-sheet.hbs`,
      // Scroll the active tab's panel when content exceeds the window.
      scrollable: [".gw-item-form__body"]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    context.item   = item;
    context.system = item.system;
    context.config = CONFIG.GAMMA_WORLD;
    context.type   = item.type;
    context.isGM   = !!game.user?.isGM;
    context.artifactPowerSummary = item.system.artifact?.isArtifact ? artifactPowerSummary(item) : "";
    // 0.14.4 — colored banner for the Artifact tab. Reuses the same
    // helper that drives the inventory-row pill so signal stays
    // consistent across surfaces. Returns null for non-artifact items
    // and for legacy (non-cell-driven) artifacts so the existing
    // power summary line keeps rendering for medi-kits etc.
    context.powerBadge = item.system.artifact?.isArtifact
      ? itemPowerBadge(item, {
          localize: (key, fb) => {
            const out = game.i18n?.localize?.(key);
            return (out && out !== key) ? out : (fb ?? key);
          }
        })
      : null;

    // 0.12.0 — cells carry a charge percentage instead of a shot count.
    // Template branches on `isPowerCell` to render the Charge row.
    context.isPowerCell = isPowerCell(item);
    context.cellChargePercent = context.isPowerCell ? cellChargePercent(item) : null;

    // 0.13.0 — consumer-side: non-cell artifacts expose a per-use drain
    // rate (system.consumption) and list the cells they've claimed.
    context.hasConsumption = ["weapon", "armor", "gear"].includes(item.type) && !context.isPowerCell;
    // 0.13.0 Batch 2 — Ignite / Stow toggle is rendered only for weapons
    // with a time-based drain (vibro dagger, stun whip, etc.). Other item
    // types use `equipped` for the active gate; weapons need their own
    // toggle because "equipped" doesn't mean "powered on" for them.
    context.showActiveToggle =
      item.type === "weapon" &&
      ["minute", "hour", "day"].includes(item.system?.consumption?.unit ?? "");
    const installedCellIds = Array.isArray(item.system?.artifact?.power?.installedCellIds)
      ? item.system.artifact.power.installedCellIds : [];
    context.installedCellEntries = [];
    for (const uuid of installedCellIds) {
      try {
        const cell = await fromUuid(uuid);
        if (cell && cell.type === "gear" && cell.system?.subtype === "power-cell") {
          context.installedCellEntries.push({
            uuid: cell.uuid,
            name: cell.name,
            chargePercent: cellChargePercent(cell) ?? 0
          });
        }
      } catch (_error) { /* dangling ref — dropped silently */ }
    }
    context.artifactSession = item.flags?.[SYSTEM_ID]?.artifactSession ?? null;
    context.artifactSessionStatus = context.artifactSession?.resolved
      ? (context.artifactSession.result === "resolved-success" ? "Function understood" : "Danger result")
      : (context.artifactSession ? "Active session" : "No active session");

    // Artifact tab is only meaningful for weapon/armor/gear. Mutations
    // and other types hide the tab button entirely. The Effects tab is
    // available for every item type. Clamp the stored active-tab value
    // to tabs that are actually rendered for this item type so clicking
    // back after a reload doesn't land on a hidden panel.
    context.hasArtifactTab = ["weapon", "armor", "gear"].includes(item.type);
    const validTabs = new Set(["item", "effects"]);
    if (context.hasArtifactTab) validTabs.add("artifact");
    context.activeTab = validTabs.has(this.#activeTab) ? this.#activeTab : "item";

    // Phase 5: armor trait multi-select options. Exposed to every sheet
    // context for uniformity; only the armor template reads them.
    const localize = (key) => game.i18n?.localize?.(key) ?? key;
    const traitsGranted = item.system?.traits ?? {};
    const buildTraitOptions = (selected) => {
      const set = new Set(selected ?? []);
      return DAMAGE_TYPES.map((value) => ({
        value,
        label: localize(DAMAGE_TYPE_LABELS[value] ?? value),
        selected: set.has(value)
      }));
    };
    context.damageTraitOptions = {
      grantsResistance:    buildTraitOptions(traitsGranted.grantsResistance),
      grantsImmunity:      buildTraitOptions(traitsGranted.grantsImmunity),
      grantsVulnerability: buildTraitOptions(traitsGranted.grantsVulnerability)
    };

    // 0.8.1: weapon ammo types as a multi-select. SetField reads as a Set
    // on the data model; coerce to an array before membership checks so
    // the template's `selected` flag is set correctly.
    if (item.type === "weapon") {
      const ammoSet = item.system?.ammoType;
      const selectedAmmo = new Set(
        ammoSet instanceof Set
          ? [...ammoSet]
          : Array.isArray(ammoSet) ? ammoSet : []
      );
      context.ammoTypeOptions = AMMO_TYPE_KEYS.map((key) => ({
        value: key,
        label: localize(AMMO_TYPES[key] ?? key),
        selected: selectedAmmo.has(key)
      }));
    }

    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML.bind(
      foundry.applications.ux.TextEditor.implementation
    );
    context.enrichedDescription = await enrich(item.system.description?.value ?? "", { relativeTo: item });

    // 0.8.4 Tier 5 — Effects tab on the item sheet. Flattens the item's
    // embedded ActiveEffect collection into display rows the template
    // iterates. Row UUIDs let the action handlers resolve effects via
    // fromUuid regardless of which parent owns them.
    context.effectsList = [...(item.effects ?? [])].map((effect) => {
      const duration = effect.duration ?? {};
      let durationLabel = "";
      if (duration.rounds) durationLabel = `${duration.rounds} round${duration.rounds === 1 ? "" : "s"}`;
      else if (duration.turns) durationLabel = `${duration.turns} turn${duration.turns === 1 ? "" : "s"}`;
      else if (duration.seconds) durationLabel = `${Math.round(duration.seconds / 60)} min`;
      const changes = Array.isArray(effect.changes) ? effect.changes : [];
      const keys = changes.map((c) => c.key).filter(Boolean);
      return {
        uuid: effect.uuid,
        id: effect.id,
        name: effect.name ?? "Effect",
        img: effect.img ?? "icons/svg/aura.svg",
        disabled: !!effect.disabled,
        transfer: !!effect.transfer,
        durationLabel,
        changesCount: changes.length,
        changesSummary: keys.slice(0, 3).join(", ") + (keys.length > 3 ? "…" : "")
      };
    }).sort((a, b) => {
      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return context;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    wireRichEditorToggles(this);

    const root = this.element;
    if (!root) return;
    root.querySelectorAll(".gw-item-form__tab-button").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const tabId = button.dataset.tab;
        if (!tabId || tabId === this.#activeTab) return;
        this.#activeTab = tabId;
        root.querySelectorAll(".gw-item-form__tab-button").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.tab === tabId);
        });
        root.querySelectorAll(".gw-item-form__panel").forEach((panel) => {
          panel.classList.toggle("active", panel.dataset.panel === tabId);
        });
      });
    });
  }

  _onChangeForm(formConfig, event) {
    if (isRichEditorChange(event)) return;
    return super._onChangeForm?.(formConfig, event);
  }

  /**
   * GM-only "Clear Malfunction" action — unlatches the `system.artifact
   * .malfunction` field so a short-circuited / exploded artifact can be
   * used again. resolveArtifactOperation refuses any artifact with a
   * non-empty malfunction field before it even rolls, so a single
   * mishap bricks the item forever without a way to recover. This button
   * is the recovery path (for GM fiat / repair narrative beats).
   */
  /* --- 0.8.4 Tier 5: item-level ActiveEffect CRUD -------------------- */

  static async #onCreateItemAE(event, _target) {
    event?.preventDefault?.();
    const item = this.document;
    if (!item) return;
    const [effect] = await item.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n?.localize?.("GAMMA_WORLD.Effects.DefaultName") ?? "New Effect",
      img: "icons/svg/aura.svg",
      disabled: false,
      transfer: true,
      changes: []
    }]);
    effect?.sheet?.render?.(true);
  }

  static async #onToggleItemAE(event, target) {
    event?.preventDefault?.();
    const uuid = target?.dataset?.effectUuid;
    if (!uuid) return;
    const effect = await fromUuid(uuid);
    if (!effect) return;
    await effect.update({ disabled: !effect.disabled });
  }

  static async #onEditItemAE(event, target) {
    event?.preventDefault?.();
    const uuid = target?.dataset?.effectUuid;
    if (!uuid) return;
    const effect = await fromUuid(uuid);
    if (!effect) return;
    effect.sheet?.render?.(true);
  }

  static async #onDeleteItemAE(event, target) {
    event?.preventDefault?.();
    const uuid = target?.dataset?.effectUuid;
    if (!uuid) return;
    const effect = await fromUuid(uuid);
    if (!effect) return;
    if (typeof effect.deleteDialog === "function") {
      await effect.deleteDialog();
    } else {
      await effect.delete();
    }
  }

  /**
   * 0.13.0 — uninstall a specific cell from this device. Strips the
   * cell's installedIn flag and removes its UUID from the device's
   * installedCellIds. Cell stays in actor inventory at its current
   * charge. GM-only because it mutates shared inventory state.
   */
  static async #onUninstallCell(event, target) {
    event?.preventDefault?.();
    if (!game.user?.isGM) {
      ui.notifications?.warn(game.i18n?.localize?.("GAMMA_WORLD.Consumption.GmOnly")
        ?? "Only the GM can eject cells.");
      return;
    }
    const cellUuid = target?.dataset?.cellUuid;
    if (!cellUuid) return;
    const item = this.document;
    if (!item) return;
    try {
      await uninstallCellFn(item, cellUuid);
    } catch (error) {
      console.warn(`gamma-world-1e | uninstall cell failed for ${item?.uuid}`, error);
      ui.notifications?.error(error?.message ?? String(error));
    }
  }

  static async #onClearMalfunction(event, button) {
    event?.preventDefault?.();
    if (!game.user?.isGM) {
      ui.notifications?.warn(game.i18n?.localize?.("GAMMA_WORLD.Artifact.ClearMalfunctionGmOnly")
        ?? "Only the GM can clear a malfunction.");
      return;
    }
    const item = this.document;
    if (!item) return;
    const current = item.system?.artifact?.malfunction ?? "";
    if (!current) return;
    try {
      await item.update({ "system.artifact.malfunction": "" }, { gammaWorldSync: true });
      ui.notifications?.info(game.i18n?.localize?.("GAMMA_WORLD.Artifact.ClearMalfunctionDone")
        ?? `Cleared malfunction on ${item.name}.`);
    } catch (error) {
      console.warn(`gamma-world-1e | clear malfunction failed for ${item?.uuid}`, error);
      ui.notifications?.error(error?.message ?? String(error));
    }
  }
}
