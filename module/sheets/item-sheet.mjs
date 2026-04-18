/**
 * GammaWorldItemSheet — ApplicationV2 sheet for all four item types.
 * One class, one template, branches on this.document.type.
 */

import { SYSTEM_ID, DAMAGE_TYPES, DAMAGE_TYPE_LABELS } from "../config.mjs";
import { artifactPowerSummary } from "../artifact-power.mjs";
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
      clearMalfunction: GammaWorldItemSheet.#onClearMalfunction
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
    context.artifactSession = item.flags?.[SYSTEM_ID]?.artifactSession ?? null;
    context.artifactSessionStatus = context.artifactSession?.resolved
      ? (context.artifactSession.result === "resolved-success" ? "Function understood" : "Danger result")
      : (context.artifactSession ? "Active session" : "No active session");

    // Artifact tab is only meaningful for weapon/armor/gear. Mutations
    // and other types hide the tab button entirely.
    context.hasArtifactTab = ["weapon", "armor", "gear"].includes(item.type);
    context.activeTab = context.hasArtifactTab ? this.#activeTab : "item";

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

    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML.bind(
      foundry.applications.ux.TextEditor.implementation
    );
    context.enrichedDescription = await enrich(item.system.description?.value ?? "", { relativeTo: item });

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
