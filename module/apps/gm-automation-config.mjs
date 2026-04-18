/**
 * GammaWorldConfig — a single dedicated window that groups every
 * Gamma World 1e world-scoped setting into readable sections, so the
 * default Foundry "System Settings" panel doesn't balloon as new toggles
 * land in future phases.
 *
 * Registered as a menu by `registerMigrationSettings()` in migrations.mjs
 * (via `game.settings.registerMenu`). The individual settings remain
 * `config: false` in the default panel; this app is where they're edited.
 *
 * Pattern follows `module/artifact-flowchart-app.mjs`: ApplicationV2 +
 * HandlebarsApplicationMixin, form-driven via `form.handler`.
 */

import { SYSTEM_ID } from "../config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Declarative spec of which settings appear in which section, in which
 * order. Keyed by setting id; values describe the input kind. The set of
 * kinds here mirrors what `game.settings.register` supports — `Boolean`,
 * `Number` (with or without range), `String` (with or without choices).
 *
 * Adding a new setting in a later phase = add an entry here + register it
 * with `config: false`. No other edits needed.
 */
const SECTIONS = [
  {
    id: "houseRules",
    title: "GAMMA_WORLD.Settings.Config.Section.HouseRules",
    settings: [
      "pshTechReliable",
      "autoApplyOnHitConditions",
      "autoTickFatigue",
      "resetFatigueOnCombatEnd",
      "autoConsumeCharges"
    ]
  },
  {
    id: "combatAutomation",
    title: "GAMMA_WORLD.Settings.Config.Section.CombatAutomation",
    settings: [
      "npcDamageMode",
      "promptBeforeApplyDamage",
      "npcSaveMode",
      "playerSaveTimeout"
    ]
  },
  {
    id: "rollVisibility",
    title: "GAMMA_WORLD.Settings.Config.Section.RollVisibility",
    settings: [
      "attackRollMode",
      "damageRollMode",
      "saveRollMode",
      "hideGmRollDetails",
      "suppressGmDiceAnimation"
    ]
  },
  {
    id: "templates",
    title: "GAMMA_WORLD.Settings.Config.Section.Templates",
    settings: [
      "grenadePersistentRounds",
      "autoRemoveInstantTemplate"
    ]
  }
];

function settingDefinition(key) {
  // Read the registered config from game.settings.settings, a Map keyed
  // by `${namespace}.${key}`.
  return game.settings?.settings?.get(`${SYSTEM_ID}.${key}`) ?? null;
}

function settingKind(definition) {
  if (!definition) return "unknown";
  if (definition.choices) return "select";
  if (definition.type === Boolean) return "boolean";
  if (definition.type === Number) return "number";
  return "string";
}

function coerceFormValue(kind, value) {
  if (kind === "boolean") return value === true || value === "true" || value === "on" || value === 1;
  if (kind === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return value == null ? "" : String(value);
}

function localizeLabel(key, fallback) {
  const localized = game.i18n?.localize?.(key);
  if (localized && localized !== key) return localized;
  return fallback;
}

function buildFieldDescriptor(key) {
  const def = settingDefinition(key);
  if (!def) return null;
  const kind = settingKind(def);
  const value = game.settings.get(SYSTEM_ID, key);

  const descriptor = {
    key,
    kind,
    name: localizeLabel(def.name ?? "", key),
    hint: localizeLabel(def.hint ?? "", ""),
    value,
    type: kind
  };

  if (kind === "boolean") {
    descriptor.checked = !!value;
  } else if (kind === "number") {
    descriptor.min = def.range?.min ?? "";
    descriptor.max = def.range?.max ?? "";
    descriptor.step = def.range?.step ?? "";
    descriptor.hasRange = !!def.range;
  } else if (kind === "select") {
    descriptor.options = Object.entries(def.choices ?? {}).map(([optValue, optLabel]) => ({
      value: optValue,
      label: localizeLabel(optLabel, optValue),
      selected: String(value) === String(optValue)
    }));
  } else {
    descriptor.text = value ?? "";
  }

  return descriptor;
}

export class GammaWorldConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "gamma-world-config",
    classes: ["gamma-world", "gamma-world-config"],
    position: { width: 640, height: "auto" },
    window: {
      title: "GAMMA_WORLD.Settings.Config.WindowTitle",
      icon: "fa-solid fa-sliders",
      resizable: true
    },
    tag: "form",
    form: {
      handler: GammaWorldConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      resetDefaults: GammaWorldConfig.#onResetDefaults
    }
  };

  static PARTS = {
    form: {
      template: `systems/${SYSTEM_ID}/templates/apps/gm-automation-config.hbs`
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  async _prepareContext() {
    const sections = SECTIONS.map((section) => ({
      id: section.id,
      title: localizeLabel(section.title, section.id),
      fields: section.settings
        .map((key) => buildFieldDescriptor(key))
        .filter(Boolean)
    })).filter((section) => section.fields.length > 0);

    return {
      sections,
      buttons: [
        { type: "button", action: "resetDefaults", icon: "fa-solid fa-rotate-left", label: "GAMMA_WORLD.Settings.Config.ResetDefaults" },
        { type: "submit", icon: "fa-solid fa-floppy-disk", label: "GAMMA_WORLD.Settings.Config.Save" }
      ]
    };
  }

  /**
   * Form submission handler. Called by ApplicationV2's form framework
   * with the parsed FormDataExtended. Writes each field back via
   * `game.settings.set` only when the value actually differs from the
   * current one — avoids firing onChange for untouched rows.
   */
  static async #onSubmit(_event, _form, formData) {
    const data = formData?.object ?? {};
    const tasks = [];
    for (const section of SECTIONS) {
      for (const key of section.settings) {
        if (!(key in data)) continue;
        const def = settingDefinition(key);
        if (!def) continue;
        const kind = settingKind(def);
        const next = coerceFormValue(kind, data[key]);
        const current = game.settings.get(SYSTEM_ID, key);
        if (String(current) === String(next)) continue;
        tasks.push(game.settings.set(SYSTEM_ID, key, next));
      }
    }
    await Promise.all(tasks);
    ui.notifications?.info(game.i18n.localize("GAMMA_WORLD.Settings.Config.Saved"));
  }

  /**
   * Reset every setting shown in this window to its registered default.
   * Prompts the user first so it's not a surprise.
   */
  static async #onResetDefaults() {
    const { DialogV2 } = foundry.applications.api;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("GAMMA_WORLD.Settings.Config.ResetConfirmTitle") },
      content: `<p>${game.i18n.localize("GAMMA_WORLD.Settings.Config.ResetConfirmBody")}</p>`
    });
    if (!confirmed) return;
    const tasks = [];
    for (const section of SECTIONS) {
      for (const key of section.settings) {
        const def = settingDefinition(key);
        if (!def) continue;
        tasks.push(game.settings.set(SYSTEM_ID, key, def.default));
      }
    }
    await Promise.all(tasks);
    this.render();
    ui.notifications?.info(game.i18n.localize("GAMMA_WORLD.Settings.Config.ResetDone"));
  }
}
