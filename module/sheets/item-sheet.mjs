/**
 * GammaWorldItemSheet — ApplicationV2 sheet for all four item types.
 * One class, one template, branches on this.document.type.
 */

import { SYSTEM_ID } from "../config.mjs";
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
    form: { submitOnChange: true, closeOnSubmit: false }
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
}
