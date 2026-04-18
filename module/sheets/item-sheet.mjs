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

  static DEFAULT_OPTIONS = {
    classes: ["gamma-world", "sheet", "item"],
    position: { width: 560, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    form: {
      template: `systems/${SYSTEM_ID}/templates/item/item-sheet.hbs`,
      scrollable: [""]
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

    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML.bind(
      foundry.applications.ux.TextEditor.implementation
    );
    context.enrichedDescription = await enrich(item.system.description?.value ?? "", { relativeTo: item });

    return context;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    wireRichEditorToggles(this);
  }

  _onChangeForm(formConfig, event) {
    if (isRichEditorChange(event)) return;
    return super._onChangeForm?.(formConfig, event);
  }
}
