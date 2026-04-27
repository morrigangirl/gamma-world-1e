/**
 * GammaWorldCharacterSheet — ApplicationV2 sheet for Actor.type === "character".
 */

import { SYSTEM_ID, ATTRIBUTE_KEYS, CRYPTIC_ALLIANCES, DAMAGE_TYPES, DAMAGE_TYPE_LABELS, SKILLS, SKILL_GROUPS, SKILL_GROUP_LABELS, MAX_PROFICIENT_SKILLS, ATTRIBUTES } from "../config.mjs";
import { computeSkillModifier, countProficientSkills, rollSkill } from "../skills.mjs";
import { mutationActionLabel, mutationHasAction } from "../mutations.mjs";
import { itemActionLabel, itemHasUseAction } from "../item-actions.mjs";
import { artifactNeedsPowerManagement, artifactPowerSummary, isPowerCell, cellChargePercent, isItemActiveForDrain, armorIsInert } from "../artifact-power.mjs";
import { itemPowerBadge, isItemPowerCritical, POWER_STATE } from "../item-power-status.mjs";
import { artifactDisplayName, artifactOperationKnown, itemIsArtifact } from "../artifact-rules.mjs";
import { applyRest, performShortRest, performLongRest, shortRestMaxHD, availableHitDice } from "../healing.mjs";
import { mutationStatus, isMutationDashboardWorthy, MUTATION_STATUS } from "../mutation-status.mjs";
import { formatEffectCountdown } from "../effect-countdown.mjs";
import { awardXp, applyAttributeBonus, xpForNextLevel } from "../experience.mjs";
import { overlayRadiationIndicatorState } from "../conditions.mjs";
import { saveContextForActor } from "../save-flow.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const DialogV2 = foundry.applications.api.DialogV2;

function plainText(html = "") {
  const source = String(html ?? "");
  if (!source) return "";
  if (typeof DOMParser !== "undefined") {
    const parsed = new DOMParser().parseFromString(source, "text/html");
    return parsed.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }
  return source.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function paragraphize(text = "") {
  const value = String(text ?? "").trim();
  if (!value) return "";
  const escaped = foundry.utils.escapeHTML(value);
  const lines = escaped
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => `<p>${line}</p>`).join("");
}

function truncate(text = "", max = 180) {
  if (!text || (text.length <= max)) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function signedNumber(value) {
  const rounded = Math.round(Number(value) || 0);
  if (!rounded) return "";
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function compact(...values) {
  return values.flat().filter((value) => !!value);
}

function localizeConfig(map, key, fallback = "") {
  if (!key) return fallback;
  const label = map?.[key];
  return label ? game.i18n.localize(label) : fallback || key;
}

function currentTargetActors() {
  return [...(game.user?.targets ?? new Set())]
    .map((token) => token.actor)
    .filter(Boolean);
}

export function isRichEditorChange(event) {
  const target = event?.target;
  if (!target?.closest) return false;
  return !!target.closest(".gw-rich-editor__edit");
}

export function wireRichEditorToggles(app) {
  const root = app?.element;
  if (!root) return;
  const containers = root.querySelectorAll(".gw-rich-editor");
  for (const container of containers) {
    const button = container.querySelector(".gw-rich-editor__toggle");
    const editor = container.querySelector(".gw-rich-editor__edit");
    if (!button || !editor || button.dataset.gwToggleBound === "1") continue;
    button.dataset.gwToggleBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const turningOn = container.dataset.mode !== "edit";
      container.dataset.mode = turningOn ? "edit" : "view";
      if (turningOn) {
        window.requestAnimationFrame(() => {
          const area = editor.querySelector?.(".editor-content, .ProseMirror") ?? editor;
          area?.focus?.();
        });
        return;
      }
      commitRichEditorValue(editor, app);
    });
  }
}

function commitRichEditorValue(editor, app) {
  const name = editor?.getAttribute?.("name");
  if (!name) return;
  let value = null;
  if (typeof editor.value === "string") value = editor.value;
  else if (editor.hasAttribute?.("value")) value = editor.getAttribute("value");
  else {
    const content = editor.querySelector?.(".ProseMirror, .editor-content");
    if (content) value = content.innerHTML;
  }
  if (value == null) return;
  const document = app?.document;
  if (!document?.update) return;
  document.update({ [name]: value }).catch((error) => {
    console.error(`${app?.constructor?.name ?? "Sheet"} | rich editor commit failed`, error);
  });
}

function controlledTokenActors() {
  return (canvas.tokens?.controlled ?? [])
    .map((token) => token.actor)
    .filter(Boolean);
}

function defaultEncounterScope() {
  if (currentTargetActors().length) return "targets";
  if (controlledTokenActors().length) return "controlled";
  return "self";
}

function resolveEncounterScopeActors(actor, scope) {
  if (scope === "targets") return currentTargetActors();
  if (scope === "controlled") return controlledTokenActors();
  return actor ? [actor] : [];
}

function sortInventory(a, b) {
  const aEquipped = Number(!!(a.system.equipped || a.system.activation?.enabled));
  const bEquipped = Number(!!(b.system.equipped || b.system.activation?.enabled));
  const aGranted = Number(!!a.flags?.[SYSTEM_ID]?.grantedBy);
  const bGranted = Number(!!b.flags?.[SYSTEM_ID]?.grantedBy);
  return (bEquipped - aEquipped)
    || (aGranted - bGranted)
    || a.name.localeCompare(b.name);
}

function formatWeaponRange(item) {
  const attackType = localizeConfig(CONFIG.GAMMA_WORLD.ATTACK_TYPES, item.system.attackType, item.system.attackType);
  if (item.system.attackType === "melee") return attackType;
  const short = Number(item.system.range.short ?? 0);
  const medium = Number(item.system.range.medium ?? 0);
  const long = Number(item.system.range.long ?? 0);
  const ranges = compact(
    short ? `S ${short}` : "",
    medium ? `M ${medium}` : "",
    long ? `L ${long}` : ""
  ).join(" / ");
  return compact(attackType, ranges).join(" · ");
}

function unknownArtifactSummary() {
  return game.i18n.localize("GAMMA_WORLD.Artifact.AnalysisRequired");
}

function unknownArtifactUseLabel() {
  return game.i18n.localize("GAMMA_WORLD.Artifact.NotUsable");
}

function prepareArtifactPresentation(item) {
  const isArtifact = itemIsArtifact(item);
  const operationKnown = artifactOperationKnown(item);
  const unknownArtifact = isArtifact && !operationKnown;
  item.gwDisplayName = artifactDisplayName(item);
  item.gwCanAnalyze = unknownArtifact;
  item.gwCanRevealFunction = !!(unknownArtifact && game.user?.isGM);
  item.gwCanEdit = !unknownArtifact || !!game.user?.isGM;
  item.gwIsUnknownArtifact = unknownArtifact;
  item.gwArtifactKnown = !unknownArtifact;
  return { isArtifact, operationKnown, unknownArtifact };
}

// 0.14.4 — shared i18n resolver for the format helpers below. Returns
// the fallback string when the key is missing or the resolver itself
// isn't available (e.g. early in render lifecycle). Mirrors the pattern
// already used in `formatMutationItem` (~line 367).
function localizeOrFallback(key, fallback) {
  const out = game.i18n?.localize?.(key);
  return (out && out !== key) ? out : (fallback ?? key);
}

function formatWeaponItem(item) {
  const { isArtifact, operationKnown, unknownArtifact } = prepareArtifactPresentation(item);
  const effectMode = item.system.effect?.mode ?? "damage";
  const effectLabel = effectMode === "damage" ? "" : effectMode.replace(/-/g, " ");
  const ammoLine = item.system.ammo?.consumes
    ? `${item.system.ammo.current}/${item.system.ammo.max} ammo`
    : "";
  const detailLine = compact(
    `${item.system.damage.formula} ${item.system.damage.type}`,
    `WC ${item.system.weaponClass}`,
    formatWeaponRange(item),
    ammoLine
  ).join(" · ");
  const ruleLine = compact(
    item.system.traits?.tag ? `tag ${item.system.traits.tag}` : "",
    effectLabel ? `${effectLabel}${item.system.effect.formula ? ` ${item.system.effect.formula}` : ""}` : "",
    item.system.effect?.status ? `status ${item.system.effect.status}` : "",
    item.system.traits?.nonlethal ? "nonlethal" : "",
    item.flags?.[SYSTEM_ID]?.grantedByName ? `built into ${item.flags[SYSTEM_ID].grantedByName}` : ""
  ).join(" · ");
  const description = truncate(plainText(item.system.description?.value) || item.system.effect?.notes || "");

  item.gwBadges = compact(
    item.system.equipped ? "equipped" : "",
    item.flags?.[SYSTEM_ID]?.grantedByName ? "Built-in" : "",
    unknownArtifact ? game.i18n.localize("GAMMA_WORLD.Artifact.UnknownBadge") : (isArtifact ? "Artifact" : "")
  );
  item.gwDetailLine = unknownArtifact ? unknownArtifactSummary() : detailLine;
  item.gwRuleLine = unknownArtifact ? unknownArtifactUseLabel() : ruleLine;
  item.gwDescription = unknownArtifact ? "" : description;
  item.gwRangeLabel = formatWeaponRange(item);
  item.gwArtifactLine = isArtifact && operationKnown
    ? `${item.system.artifact.chart?.toUpperCase?.() ?? "?"} · ${item.system.artifact.condition} · ${item.system.artifact.functionChance}%`
    : "";
  item.gwPowerLine = isArtifact && operationKnown ? artifactPowerSummary(item) : "";
  item.gwHasPowerControls = !!(isArtifact && operationKnown && artifactNeedsPowerManagement(item));
  // 0.14.4 — colored pill driven by the new power-status helper. Returns
  // null for non-cell-driven items so the legacy `gwPowerLine` keeps
  // rendering for medi-kits etc.
  item.gwPowerBadge = isArtifact && operationKnown
    ? itemPowerBadge(item, { localize: localizeOrFallback })
    : null;
  item.gwCanAttack = !isArtifact || operationKnown;
  // 0.14.4 — power-blocked attack: button stays rendered but is HTML
  // disabled with a tooltip when the cell-driven weapon has no cell or
  // every cell is empty. Severity 2 = EMPTY or NO_CELL. Player sees the
  // affordance is there but greyed out; the colored pill explains why.
  // The defensive `consumeArtifactCharge` refusal stays for macro / API
  // callers who bypass the UI.
  item.gwAttackDisabled = !!(item.gwPowerBadge && item.gwPowerBadge.severity >= 2);
  item.gwCanToggleEquipped = !isArtifact || operationKnown || !!item.system.equipped;
  return item;
}

function formatArmorItem(item) {
  const { isArtifact, operationKnown, unknownArtifact } = prepareArtifactPresentation(item);
  const typeLabel = localizeConfig(CONFIG.GAMMA_WORLD.ARMOR_TYPES, item.system.armorType, item.system.armorType);
  const fieldMode = item.system.field?.mode ?? "none";
  const protections = compact(
    item.system.protection?.radiationImmune ? "radiation" : "",
    item.system.protection?.poisonImmune ? "poison" : "",
    item.system.protection?.blackRayImmune ? "black ray" : "",
    item.system.protection?.laserImmune ? "laser" : "",
    item.system.protection?.mentalImmune ? "mental" : ""
  );
  item.gwBadges = compact(
    item.system.equipped ? "equipped" : "",
    unknownArtifact ? "" : (fieldMode !== "none" ? `${fieldMode} field` : ""),
    unknownArtifact ? game.i18n.localize("GAMMA_WORLD.Artifact.UnknownBadge") : (isArtifact ? "Artifact" : ""),
    // 0.14.4 — surface armor that's lost power. armorIsInert is true
    // when every installed cell is at 0% (or no cells at all). Players
    // need this mid-combat: AC reverts to base, flight stops, force
    // field collapses. Plain string in the badge list for legibility;
    // the colored pill below carries the cell percentage.
    isArtifact && operationKnown && armorIsInert(item)
      ? game.i18n.localize("GAMMA_WORLD.Artifact.Power.State.Inert")
      : ""
  );
  item.gwDetailLine = unknownArtifact
    ? unknownArtifactSummary()
    : compact(
    `${typeLabel} armor`,
    `AC ${item.system.acValue}`,
    signedNumber(-Number(item.system.dxPenalty ?? 0)) ? `DX ${signedNumber(-Number(item.system.dxPenalty ?? 0))}` : ""
  ).join(" · ");
  item.gwRuleLine = unknownArtifact
    ? unknownArtifactUseLabel()
    : compact(
    fieldMode !== "none" ? `${fieldMode} field ${item.system.field.capacity}` : "",
    Number(item.system.mobility?.flight ?? 0) > 0 ? `flight ${item.system.mobility.flight}m` : "",
    Number(item.system.mobility?.jump ?? 0) > 0 ? `jump ${item.system.mobility.jump}m` : "",
    Number(item.system.mobility?.lift ?? 0) > 0 ? `lift ${item.system.mobility.lift}` : "",
    item.system.offense?.punchDamage ? `punch ${item.system.offense.punchDamage}` : "",
    protections.length ? `protects vs ${protections.join(", ")}` : ""
  ).join(" · ");
  item.gwDescription = unknownArtifact ? "" : truncate(plainText(item.system.description?.value));
  item.gwArtifactLine = isArtifact && operationKnown
    ? `${item.system.artifact.chart?.toUpperCase?.() ?? "?"} · ${item.system.artifact.condition} · ${item.system.artifact.functionChance}%`
    : "";
  item.gwPowerLine = isArtifact && operationKnown ? artifactPowerSummary(item) : "";
  item.gwHasPowerControls = !!(isArtifact && operationKnown && artifactNeedsPowerManagement(item));
  // 0.14.4 — same colored pill as weapons, so a powered armor's cell
  // state shows in the inventory list at a glance.
  item.gwPowerBadge = isArtifact && operationKnown
    ? itemPowerBadge(item, { localize: localizeOrFallback })
    : null;
  item.gwCanToggleEquipped = !isArtifact || operationKnown || !!item.system.equipped;
  return item;
}

function formatGearItem(item) {
  const { isArtifact, operationKnown, unknownArtifact } = prepareArtifactPresentation(item);
  const techLabel = localizeConfig(CONFIG.GAMMA_WORLD.TECH_LEVELS, item.system.tech, item.system.tech);
  const actionMode = item.system.action?.mode ?? "none";
  item.gwBadges = compact(
    unknownArtifact ? "" : (techLabel && (item.system.tech !== "none") ? techLabel : ""),
    unknownArtifact ? "" : (actionMode !== "none" ? actionMode.replace(/-/g, " ") : ""),
    unknownArtifact ? game.i18n.localize("GAMMA_WORLD.Artifact.UnknownBadge") : (isArtifact ? "Artifact" : "")
  );
  // 0.12.0: power cells surface their charge % in the inventory row.
  // Hidden behind unknownArtifact so unidentified cells don't leak state.
  const chargeSegment = isPowerCell(item) ? `${cellChargePercent(item)}% charge` : "";
  // 0.13.0: if this cell is installed in a device, tell the player which
  // one so they can tell "loose in the pack" from "in my laser pistol."
  // Uses fromUuidSync (Foundry 11+); null if the target is gone.
  let installedInSegment = "";
  const installedInUuid = isPowerCell(item) ? item.flags?.["gamma-world-1e"]?.installedIn : null;
  if (installedInUuid) {
    try {
      const host = foundry.utils.fromUuidSync?.(installedInUuid)
        ?? globalThis.fromUuidSync?.(installedInUuid);
      if (host?.name) installedInSegment = `installed in ${host.name}`;
    } catch (_error) { /* dangling ref */ }
  }
  // 0.13.0: non-cell consumers show a per-use drain rate badge so the
  // player can eyeball "this drains my cell 10% per shot" at a glance.
  let drainSegment = "";
  const consumptionUnit = item.system?.consumption?.unit ?? "";
  const consumptionPer  = Number(item.system?.consumption?.perUnit ?? 0);
  if (!isPowerCell(item) && consumptionUnit && consumptionPer > 0) {
    // Round to 1 decimal for display; 3.333 → "3.3% / shot"
    const rounded = Math.round(consumptionPer * 10) / 10;
    drainSegment = `${rounded}% / ${consumptionUnit}`;
  }
  item.gwDetailLine = unknownArtifact
    ? unknownArtifactSummary()
    : compact(
    `qty ${item.system.quantity}`,
    techLabel && (item.system.tech !== "none") ? techLabel : "",
    Number(item.system.weight ?? 0) > 0 ? `${item.system.weight} wt` : "",
    chargeSegment,
    installedInSegment,
    drainSegment
  ).join(" · ");
  item.gwRuleLine = unknownArtifact
    ? unknownArtifactUseLabel()
    : compact(
    actionMode !== "none" ? `mode ${actionMode}` : "",
    item.system.action?.damageFormula ? `damage ${item.system.action.damageFormula}` : "",
    item.system.action?.intensityFormula ? `intensity ${item.system.action.intensityFormula}` : "",
    item.system.action?.durationFormula ? `duration ${item.system.action.durationFormula}` : "",
    Number(item.system.action?.radius ?? 0) > 0 ? `${item.system.action.radius} m radius` : "",
    Number(item.system.action?.consumeQuantity ?? 0) > 0 ? `uses ${item.system.action.consumeQuantity}` : ""
  ).join(" · ");
  item.gwDescription = unknownArtifact ? "" : truncate(
    plainText(item.system.description?.value)
    || item.system.action?.notes
    || ""
  );
  item.gwArtifactLine = isArtifact && operationKnown
    ? `${item.system.artifact.chart?.toUpperCase?.() ?? "?"} · ${item.system.artifact.condition} · ${item.system.artifact.functionChance}%`
    : "";
  item.gwPowerLine = isArtifact && operationKnown ? artifactPowerSummary(item) : "";
  item.gwHasPowerControls = !!(isArtifact && operationKnown && artifactNeedsPowerManagement(item));
  // 0.14.4 — power pill for cell-driven gear (Energy Cloak, Anti-grav
  // Sled, Communications Sender, Portent, Micro Missile). Returns null
  // for non-cell-driven gear so medi-kits etc. don't get a stray pill.
  item.gwPowerBadge = isArtifact && operationKnown
    ? itemPowerBadge(item, { localize: localizeOrFallback })
    : null;
  return item;
}

function formatMutationItem(item) {
  const activation = item.system.activation?.mode ?? "passive";
  const category = localizeConfig(CONFIG.GAMMA_WORLD.MUTATION_CATEGORIES, item.system.category, item.system.category);
  const usageLine = item.system.usage?.limited
    ? `${item.system.usage.uses}/${item.system.usage.max} ${item.system.usage.per}`
    : game.i18n.localize("GAMMA_WORLD.Mutation.Usage.AtWill");
  // 0.14.2 — drive the status pill from the dedicated helper so the
  // "Active Now" dashboard and the mutation row share one source of
  // truth for "is this currently running / cooling down / ready".
  item.gwStatus = mutationStatus(item, {
    localize: (key, fb) => {
      const out = game.i18n?.localize?.(key);
      return (out && out !== key) ? out : fb;
    }
  });
  item.gwBadges = compact(
    activation,
    category
    // Note: legacy "ActiveNow" badge intentionally dropped here — the
    // gwStatus pill replaces it, and we don't want both rendering on the
    // same row. Keep activation + category since they're invariant.
  );
  item.gwDetailLine = compact(
    truncate(plainText(item.system.description?.value ?? ""), 180),
    item.system.reference?.variant ? `variant: ${item.system.reference.variant}` : ""
  ).join(" · ");
  item.gwRuleLine = compact(
    item.system.range ? `range ${item.system.range}` : "",
    item.system.duration ? `duration ${item.system.duration}` : "",
    usageLine,
    Number(item.system.cooldown?.current ?? 0) > 0 ? `CD ${item.system.cooldown.current}` : "",
    item.system.reference?.page ? `p. ${item.system.reference.page}` : ""
  ).join(" · ");
  item.gwDescription = truncate(
    item.system.effect?.notes
    || plainText(item.system.description?.value)
    || ""
  );
  return item;
}

function buildTabNav(tabs, { mutations = 0, inventory = 0, effects = 0 } = {}) {
  // Keep this in sync with TABS.primary.tabs above. The filter drops any
  // tab ID that isn't in this list, so a new tab added to TABS without a
  // matching entry here will register correctly but never render a nav
  // button. (That's how the 0.8.0 Skills tab went missing in the first
  // pass.)
  const ordered = ["main", "mutations", "skills", "inventory", "effects", "bio"];
  return ordered
    .map((id) => tabs[id])
    .filter(Boolean)
    .map((tab) => ({
      ...tab,
      badge: tab.id === "mutations"
        ? (mutations || "")
        : tab.id === "inventory"
          ? (inventory || "")
          : tab.id === "effects"
            ? (effects || "")
            : ""
    }));
}

/**
 * 0.8.4 Tier 5 — build the Effects tab row model.
 *
 * Pulls every ActiveEffect applicable to the actor (direct + transferred
 * from embedded items) and flattens into a display-ready row. Each row
 * carries the effect UUID so the toggle / edit / delete action handlers
 * on the sheet can resolve it via `fromUuid(uuid)` regardless of
 * whether the owning document is the actor or one of its items.
 */
function buildEffectsList(actor) {
  const rows = [];
  const allEffects = typeof actor.allApplicableEffects === "function"
    ? [...actor.allApplicableEffects()]
    : [...(actor.effects ?? [])];

  // 0.14.2 — share the live i18n resolver with the effect-countdown
  // helper so the displayed "3 rounds" / "12 min" text is localized.
  const localize = (key, fb) => {
    const out = game.i18n?.localize?.(key);
    return (out && out !== key) ? out : fb;
  };

  for (const effect of allEffects) {
    if (!effect) continue;
    const parent = effect.parent;
    const parentIsActor = parent === actor;
    const countdown = formatEffectCountdown(effect, { localize });

    const changeKeys = Array.isArray(effect.changes)
      ? effect.changes.map((c) => c.key).filter(Boolean)
      : [];

    rows.push({
      uuid: effect.uuid,
      id: effect.id,
      name: effect.name ?? "Effect",
      img: effect.img ?? "icons/svg/aura.svg",
      disabled: !!effect.disabled,
      sourceName: parentIsActor ? actor.name : (parent?.name ?? "Unknown"),
      sourceType: parentIsActor ? "actor" : (parent?.type ?? "item"),
      durationLabel:    countdown.label,
      hasTimer:         countdown.hasTimer,
      remainingRounds:  countdown.remainingRounds,
      remainingSeconds: countdown.remainingSeconds,
      changesCount: changeKeys.length,
      changesSummary: changeKeys.slice(0, 3).join(", ") + (changeKeys.length > 3 ? "…" : "")
    });
  }

  rows.sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

const actionLocks = new Set();

export class GammaWorldCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static SHEET_MODE = "character";

  static DEFAULT_OPTIONS = {
    classes: ["gamma-world", "sheet", "actor", "character"],
    position: { width: 680, height: 820 },
    window: { resizable: true, contentClasses: ["gamma-world-sheet"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      changeTab:      GammaWorldCharacterSheet.#onChangeTab,
      chargenAuto:    GammaWorldCharacterSheet.#onChargenAuto,
      rollAttribute:  GammaWorldCharacterSheet.#onRollAttribute,
      rollSave:       GammaWorldCharacterSheet.#onRollSave,
      rollReaction:   GammaWorldCharacterSheet.#onRollReaction,
      rollMorale:     GammaWorldCharacterSheet.#onRollMorale,
      routeEncounter: GammaWorldCharacterSheet.#onRouteEncounter,
      randomEncounter: GammaWorldCharacterSheet.#onRandomEncounter,
      travel:         GammaWorldCharacterSheet.#onTravel,
      rollAttack:     GammaWorldCharacterSheet.#onRollAttack,
      rollNaturalAttack: GammaWorldCharacterSheet.#onRollNaturalAttack,
      showMutationChat: GammaWorldCharacterSheet.#onShowMutationChat,
      useMutation:    GammaWorldCharacterSheet.#onUseMutation,
      useItem:        GammaWorldCharacterSheet.#onUseItem,
      analyzeItem:    GammaWorldCharacterSheet.#onAnalyzeItem,
      revealArtifactFunction: GammaWorldCharacterSheet.#onRevealArtifactFunction,
      managePower:    GammaWorldCharacterSheet.#onManagePower,
      removeEffect:   GammaWorldCharacterSheet.#onRemoveEffect,
      toggleAE:       GammaWorldCharacterSheet.#onToggleAE,
      editAE:         GammaWorldCharacterSheet.#onEditAE,
      deleteAE:       GammaWorldCharacterSheet.#onDeleteAE,
      resetMutations: GammaWorldCharacterSheet.#onResetMutations,
      toggleEquipped: GammaWorldCharacterSheet.#onToggleEquipped,
      robotSpendPower: GammaWorldCharacterSheet.#onRobotSpendPower,
      robotRecharge:  GammaWorldCharacterSheet.#onRobotRecharge,
      robotCycleMode: GammaWorldCharacterSheet.#onRobotCycleMode,
      robotRepair:    GammaWorldCharacterSheet.#onRobotRepair,
      itemCreate:     GammaWorldCharacterSheet.#onItemCreate,
      itemEdit:       GammaWorldCharacterSheet.#onItemEdit,
      itemDelete:     GammaWorldCharacterSheet.#onItemDelete,
      rest:           GammaWorldCharacterSheet.#onRest,
      shortRest:      GammaWorldCharacterSheet.#onShortRest,
      longRest:       GammaWorldCharacterSheet.#onLongRest,
      awardXp:        GammaWorldCharacterSheet.#onAwardXp,
      applyBonus:     GammaWorldCharacterSheet.#onApplyBonus,
      rollSkill:      GammaWorldCharacterSheet.#onRollSkill
    }
  };

  static PARTS = {
    form: {
      template: `systems/${SYSTEM_ID}/templates/actor/character-sheet.hbs`,
      scrollable: [".gamma-world__tab"]
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main",      label: "GAMMA_WORLD.Tab.Main" },
        { id: "mutations", label: "GAMMA_WORLD.Tab.Mutations" },
        { id: "skills",    label: "GAMMA_WORLD.Tab.Skills" },
        { id: "inventory", label: "GAMMA_WORLD.Tab.Inventory" },
        { id: "effects",   label: "GAMMA_WORLD.Tab.Effects" },
        { id: "bio",       label: "GAMMA_WORLD.Tab.Bio" }
      ],
      initial: "main",
      labelPrefix: "GAMMA_WORLD.Tab"
    }
  };

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  get isMonsterSheet() {
    return this.constructor.SHEET_MODE === "monster";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor  = this.document;
    const system = actor.system;
    const isMonsterSheet = this.isMonsterSheet;

    context.actor  = actor;
    context.system = system;
    // 0.8.2: the Main-tab "Poison Resistance" / "Radiation Resistance"
    // fields now display the signed save bonus (CN mod + mutation hooks
    // + temp effects), matching what the save chat card uses when the
    // GM clicks Roll Poison / Roll Radiation. Mental save stays on the
    // matrix so derived.mentalResistance keeps its legacy 3-18 shape.
    const poisonCtx = saveContextForActor(actor, "poison");
    const radiationCtx = saveContextForActor(actor, "radiation");
    context.derived = {
      ...(actor.gw ?? {}),
      poisonSaveBonus: Number.isFinite(poisonCtx?.saveBonus) ? poisonCtx.saveBonus : 0,
      poisonSaveSummary: poisonCtx?.resistanceSummary ?? "",
      radiationSaveBonus: Number.isFinite(radiationCtx?.saveBonus) ? radiationCtx.saveBonus : 0,
      radiationSaveSummary: radiationCtx?.resistanceSummary ?? ""
    };
    context.config = CONFIG.GAMMA_WORLD;
    context.attributeKeys = ATTRIBUTE_KEYS;
    context.tabs   = this._prepareTabs("primary");
    context.isMonsterSheet = isMonsterSheet;
    context.isCharacterSheet = !isMonsterSheet;
    context.canChargen = !isMonsterSheet && actor.type === "character" && !system.chargen.rolled;
    context.actorKindLabel = game.i18n.localize(`TYPES.Actor.${actor.type}`);
    context.characterTypeLabel = localizeConfig(CONFIG.GAMMA_WORLD.CHARACTER_TYPES, system.details.type, system.details.type);
    context.identityLabel = compact(context.actorKindLabel, context.characterTypeLabel).join(" · ");
    context.isRobot = !!(system.robotics?.isRobot || system.details.type === "robot");

    // Fatigue klaxon — green/yellow/red indicator next to the Level
    // input. Thresholds follow the Fatigue Factors matrix:
    //   - 0–10: green (no weapon fatigues yet)
    //   - 11–13: yellow (heavy weapons start — flail / pole-arm / two-
    //            handed sword begin accruing penalties)
    //   - 14+: red + flashing (common weapons all fatiguing; penalties
    //          stacking into -4 and worse across the board)
    const fatigueRound = Math.max(0, Number(system?.combat?.fatigue?.round ?? 0) || 0);
    let fatigueLevel = "green";
    let fatigueLabel = "Fresh";
    if (fatigueRound >= 14) {
      fatigueLevel = "red";
      fatigueLabel = "Severely fatigued";
    } else if (fatigueRound >= 11) {
      fatigueLevel = "yellow";
      fatigueLabel = "Caution — heavy weapons fatiguing";
    }
    const baseFatigueState = {
      round: fatigueRound,
      level: fatigueLevel,
      label: fatigueLabel,
      title: `Fatigue round ${fatigueRound} — ${fatigueLabel}`,
      badge: null
    };
    // 0.8.2: Radiation Sickness / catastrophic exposure overlay the
    // klaxon so the worst active state shows at a glance. The stored
    // combat round is preserved — the overlay only mutates the
    // display-level level/label/title.
    context.fatigueState = overlayRadiationIndicatorState(baseFatigueState, actor);

    // Phase 5 — damage-trait multi-select options for the Bio tab. Built
    // from the canonical DAMAGE_TYPES vocabulary; each entry carries a
    // `selected` flag so the template's <option> tags render correctly.
    const localizeDamageType = (key) => {
      const i18n = game.i18n?.localize?.(DAMAGE_TYPE_LABELS[key] ?? "");
      if (i18n && i18n !== DAMAGE_TYPE_LABELS[key]) return i18n;
      return key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    };
    const buildDamageTraitOptions = (selected) => {
      const set = new Set(selected ?? []);
      return DAMAGE_TYPES.map((value) => ({
        value,
        label: localizeDamageType(value),
        selected: set.has(value)
      }));
    };
    const traits = system?.traits ?? {};
    context.damageTraitOptions = {
      damageResistance:    buildDamageTraitOptions(traits.damageResistance),
      damageImmunity:      buildDamageTraitOptions(traits.damageImmunity),
      damageVulnerability: buildDamageTraitOptions(traits.damageVulnerability)
    };
    context.aggregatedDamageTraits = {
      immunity:      [...(actor.gw?.damageImmunity      ?? [])],
      resistance:    [...(actor.gw?.damageResistance    ?? [])],
      vulnerability: [...(actor.gw?.damageVulnerability ?? [])]
    };

    // 0.8.0 — Skills tab context. Build rows per skill key in the
    // canonical order, then group them by SKILL_GROUPS for the template.
    // Each row computes its live total from computeSkillModifier so
    // edits to ability scores or proficient flags flow through on the
    // next render. Abilities for the per-row dropdown come from the
    // canonical ATTRIBUTE_KEYS list with localized abbrs.
    const localize = (key, fallback = key) => {
      if (!key) return fallback;
      const out = game.i18n?.localize?.(key);
      return (out && out !== key) ? out : fallback;
    };
    const abilityOption = (key) => {
      const abbrKey = ATTRIBUTES[key]?.abbr;
      return { key, abbr: localize(abbrKey, key.toUpperCase()) };
    };
    const abilityOptions = ATTRIBUTE_KEYS.map(abilityOption);
    const skillRowsByGroup = Object.fromEntries(SKILL_GROUPS.map((g) => [g, []]));
    for (const [key, def] of Object.entries(SKILLS)) {
      const mod = computeSkillModifier(actor, key);
      const abilityKey = mod.ok ? mod.abilityKey : def.ability;
      skillRowsByGroup[def.group].push({
        key,
        label: localize(def.label, key),
        group: def.group,
        abilityKey,
        abilityAbbr: localize(ATTRIBUTES[abilityKey]?.abbr, abilityKey.toUpperCase()),
        abilityMod: mod.abilityMod ?? 0,
        profBonus: mod.profBonus ?? 0,
        total: mod.total ?? 0,
        proficient: !!mod.proficient,
        abilityOptions: abilityOptions.map((opt) => ({ ...opt, selected: opt.key === abilityKey }))
      });
    }
    context.skillGroups = SKILL_GROUPS.map((groupKey) => ({
      key: groupKey,
      label: localize(SKILL_GROUP_LABELS[groupKey], groupKey),
      rows: skillRowsByGroup[groupKey]
    })).filter((g) => g.rows.length);
    context.proficientCount = countProficientSkills(actor);
    context.maxProficientSkills = MAX_PROFICIENT_SKILLS;

    // Group embedded items by type.
    const grouped = { weapon: [], armor: [], gear: [], mutation: [] };
    for (const item of actor.items) {
      if (grouped[item.type]) grouped[item.type].push(item);
    }

    grouped.weapon.sort(sortInventory).forEach(formatWeaponItem);
    grouped.armor.sort(sortInventory).forEach(formatArmorItem);
    grouped.gear.sort(sortInventory).forEach(formatGearItem);
    grouped.mutation.sort(sortInventory).forEach(formatMutationItem);

    // 0.14.17 — incapacitating-status gate. When the actor carries any
    // of unconscious / paralyzed / sleeping / stunned, every quick-action
    // button (Attack, Use Mutation, Roll Save, Roll Skill) gets the
    // HTML disabled attribute + a tooltip explaining why. The defensive
    // dice / mutation flow guards stay in place for macro / API callers.
    const { actorIsIncapacitated } = await import("../hp-clamp.mjs");
    const incapacitated = actorIsIncapacitated(actor);
    context.actorIncapacitated = incapacitated;
    context.actorIncapacitatedReason = incapacitated
      ? localize("GAMMA_WORLD.Sheet.IncapacitatedTooltip", "Cannot act while stunned, paralyzed, sleeping, or unconscious.")
      : "";
    if (incapacitated) {
      for (const item of grouped.weapon) {
        if (item.gwCanAttack) item.gwAttackDisabled = true;
      }
    }

    // Mutations split by subtype for the mutations tab.
    const mutationsBySubtype = { physical: [], mental: [], defect: [] };
    for (const mut of grouped.mutation) {
      const st = mut.system.subtype;
      mut.gwActionLabel = mutationActionLabel(mut);
      mut.gwHasAction = mutationHasAction(mut);
      mut.gwIsEnabled = !!mut.system.activation?.enabled;
      mut.gwUseDisabled = incapacitated && mut.gwHasAction;
      if (mutationsBySubtype[st]) mutationsBySubtype[st].push(mut);
    }
    for (const gear of grouped.gear) {
      gear.gwHasAction = gear.system.artifact?.isArtifact
        ? artifactOperationKnown(gear)
        : itemHasUseAction(gear);
      gear.gwActionLabel = gear.gwHasAction
        ? (itemActionLabel(gear) || game.i18n.localize("GAMMA_WORLD.Button.Use"))
        : "";
    }
    context.items = grouped;
    context.mutationsBySubtype = mutationsBySubtype;
    context.activeEffects = actor.gw?.activeEffects ?? [];

    // 0.8.4 Tier 5 — standard Foundry ActiveEffect list for the Effects
    // tab. Pulls both direct actor-level AEs and transferred AEs from
    // embedded items (mutations / armor / gear). Each row carries the
    // effect's UUID so the toggle / edit / delete handlers can resolve
    // it via fromUuid regardless of which embedded document owns it.
    context.effectsList = buildEffectsList(actor);

    // 0.14.2 — "Active Now" dashboard. Surfaces what's currently
    // affecting the character right now: timed mutations, lasting
    // toggles, mutation cooldowns, and any timed Active Effect
    // (status conditions, hazard effects, equipment buffs). Empty
    // sections collapse so the header stays compact for default
    // characters with nothing running.
    const dashboardMutations = grouped.mutation
      .filter(isMutationDashboardWorthy)
      .map((mut) => ({
        id: mut.id,
        name: mut.name,
        status: mut.gwStatus,
        canDeactivate: !!mut.system.activation?.enabled
                    && mut.system.activation?.mode === "toggle"
      }));
    const activeMutationRows = dashboardMutations
      .filter((row) => row.status.kind === MUTATION_STATUS.ACTIVE_TIMED
                     || row.status.kind === MUTATION_STATUS.ACTIVE);
    const cooldownMutationRows = dashboardMutations
      .filter((row) => row.status.kind === MUTATION_STATUS.COOLDOWN);
    // Effects worth surfacing: anything not disabled, with a finite
    // timer, that isn't itself attached to a mutation we're already
    // listing (avoid double-counting).
    const mutationItemIds = new Set(grouped.mutation.map((i) => i.id));
    const activeEffectRows = context.effectsList
      .filter((row) => !row.disabled && row.hasTimer)
      .filter((row) => {
        // Skip effects whose source IS a mutation already in the
        // mutations list (its own row has the countdown).
        const ownerId = row.uuid?.split(".").slice(-3, -2)[0];
        return !mutationItemIds.has(ownerId);
      });
    // 0.14.4 — "Powered items" group. Surfaces equipped cell-driven
    // items that are EITHER actively draining (ignited weapons,
    // equipped powered armor) OR in a critical state (no cell / all
    // cells empty). Filtering by "draining or broken" keeps the panel
    // useful without becoming an inventory list — a passive Vibro
    // Dagger sitting equipped-but-not-ignited won't clutter it.
    const cellDriven = (i) =>
      Number(i?.system?.consumption?.perUnit ?? 0) > 0;
    const poweredItemRows = actor.items
      .filter((i) => ["weapon", "armor", "gear"].includes(i.type))
      .filter(cellDriven)
      .filter((i) => i.system?.equipped || isItemActiveForDrain(i) || isItemPowerCritical(i))
      .filter((i) => isItemActiveForDrain(i) || isItemPowerCritical(i))
      .map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        badge: itemPowerBadge(i, { localize: localizeOrFallback }),
        active: isItemActiveForDrain(i),
        critical: isItemPowerCritical(i)
      }))
      .filter((row) => row.badge);   // skip if helper returned null

    context.activeNow = {
      mutations: activeMutationRows,
      cooldowns: cooldownMutationRows,
      effects:   activeEffectRows,
      poweredItems: poweredItemRows,
      hasAny: activeMutationRows.length
            + cooldownMutationRows.length
            + activeEffectRows.length
            + poweredItemRows.length > 0
    };

    context.tabNav = buildTabNav(context.tabs, {
      mutations: grouped.mutation.length,
      inventory: grouped.weapon.length + grouped.armor.length + grouped.gear.length,
      effects:   context.effectsList.length
    });
    context.quickActions = {
      weapons: grouped.weapon.filter((item) => item.system.equipped && (item.gwCanAttack !== false)),
      mutations: grouped.mutation.filter((item) => item.gwHasAction),
      gear: grouped.gear.filter((item) => item.gwHasAction)
    };

    // 0.10.0 — cross-type action-section grouping. Any item with the
    // matching action-type tag surfaces in its section; unequipped
    // weapons still show on Attack (the GM may fire a stowed weapon by
    // intent), but unequipped armor is filtered off the Defense
    // section because unequipped armor grants nothing. Mutations are
    // included regardless of activation state — passive mutations
    // with `["defense"]` tag (e.g. Inertia Armor trait chains) need
    // to surface; activation check belongs to `item.use()` not the
    // visibility filter.
    const hasTag = (item, tag) => {
      const tags = item.system?.actionTypes;
      if (tags instanceof Set) return tags.has(tag);
      if (Array.isArray(tags)) return tags.includes(tag);
      return false;
    };
    const actionGroupSource = actor.items.filter((item) => {
      if (item.type === "armor" && item.system?.equipped === false) return false;
      return true;
    });
    context.actionGroups = {
      attack:   actionGroupSource.filter((i) => hasTag(i, "attack")),
      defense:  actionGroupSource.filter((i) => hasTag(i, "defense")),
      utility:  actionGroupSource.filter((i) => hasTag(i, "utility")),
      movement: actionGroupSource.filter((i) => hasTag(i, "movement")),
      buff:     actionGroupSource.filter((i) => hasTag(i, "buff")),
      heal:     actionGroupSource.filter((i) => hasTag(i, "heal"))
    };
    context.inventorySummary = {
      equippedWeapons: grouped.weapon.filter((item) => item.system.equipped).map((item) => item.gwDisplayName ?? item.name),
      equippedArmor: grouped.armor.filter((item) => item.system.equipped).map((item) => item.gwDisplayName ?? item.name),
      protections: compact(
        actor.gw?.hazardProtection?.radiation ? "Radiation shielding" : "",
        actor.gw?.hazardProtection?.poison ? "Poison shielding" : "",
        actor.gw?.hazardProtection?.blackRay ? "Black-ray shielding" : "",
        actor.gw?.laserImmune ? "Laser immunity" : "",
        actor.gw?.mentalImmune ? "Mental immunity" : "",
        context.activeEffects.some((effect) => String(effect.id).startsWith("barrier:")) ? "Active barrier" : ""
      ),
      totalItems: grouped.weapon.length + grouped.armor.length + grouped.gear.length
    };
    context.artifactItems = [...grouped.weapon, ...grouped.armor, ...grouped.gear]
      .filter((item) => item.system.artifact?.isArtifact);
    context.inventorySummary.primaryArmor = context.inventorySummary.equippedArmor[0] ?? "";
    context.inventorySummary.protectionSummary = context.inventorySummary.protections.join(" · ");
    context.mutationSummary = {
      total: grouped.mutation.length,
      physical: mutationsBySubtype.physical.length,
      mental: mutationsBySubtype.mental.length,
      defect: mutationsBySubtype.defect.length,
      active: grouped.mutation.filter((item) => item.system.activation?.enabled).length
    };

    // Enriched rich text for the Bio tab
    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML.bind(
      foundry.applications.ux.TextEditor.implementation
    );
    const relOpt = { relativeTo: actor };
    context.enrichedBiography  = await enrich(system.biography.value ?? "",      relOpt);
    context.enrichedAppearance = await enrich(system.biography.appearance ?? "", relOpt);
    context.enrichedNotes      = await enrich(system.biography.notes ?? "",      relOpt);

    // Advancement & encumbrance summaries
    const level = Number(system.details?.level ?? 1);
    const nextLevelXp = xpForNextLevel(level + 1);
    const pendingBonuses = Array.from(system.advancement?.availableBonuses ?? []);
    context.advancement = {
      nextLevelXp: nextLevelXp && Number.isFinite(nextLevelXp) ? nextLevelXp : 0,
      xpToNextLevel: nextLevelXp ? Math.max(0, nextLevelXp - Number(system.details?.xp ?? 0)) : 0,
      pendingBonuses,
      pendingSummary: pendingBonuses.map((k) => k.toUpperCase()).join(", ") || "—"
    };
    context.encumbrance = {
      carried: Number(system.encumbrance?.carried ?? 0),
      max: Number(system.encumbrance?.max ?? 0),
      penalized: !!system.encumbrance?.penalized
    };
    context.allianceLabel = CRYPTIC_ALLIANCES?.[system.details?.alliance]
      ? game.i18n.localize(CRYPTIC_ALLIANCES[system.details.alliance])
      : system.details?.alliance ?? "";
    context.isGM = !!game.user?.isGM;

    return context;
  }

  /* -------------------------------------------- */
  /*  Action handlers                             */
  /* -------------------------------------------- */

  static async #onChangeTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    const group = target.dataset.group;
    if (!tab || !group) return;
    await this.changeTab(tab, group, {
      event,
      navElement: target.closest(".tabs")
    });
  }

  /** One-click chargen — auto-rolled characters. */
  static async #onChargenAuto(event, _target) {
    event.preventDefault();
    const release = GammaWorldCharacterSheet.#lockAction(this, null, "chargenAuto", "actor");
    if (!release) return;
    const mod = await import("../chargen/chargen.mjs").catch(() => null);
    if (!mod?.autoRollCharacter) {
      ui.notifications?.error("Chargen automation could not be loaded.");
      release();
      return;
    }
    try {
      await mod.autoRollCharacter(this.document);
    } finally {
      release();
    }
  }

  /** Roll a plain attribute check (d20 + mod). */
  static async #onRollAttribute(event, target) {
    event.preventDefault();
    const key = target.dataset.attribute;
    const { rollAbilityCheck } = await import("../dice.mjs");
    await rollAbilityCheck(this.document, key);
  }

  static async #onRollSave(event, target) {
    event.preventDefault();
    const type = target.dataset.saveType;
    const { rollSave } = await import("../dice.mjs");
    await rollSave(this.document, type);
  }

  static async #onRollReaction(event, _target) {
    event.preventDefault();
    const { rollReaction } = await import("../encounters.mjs");
    await rollReaction(this.document);
  }

  static async #onRollMorale(event, _target) {
    event.preventDefault();
    const defaultScope = defaultEncounterScope();
    const setup = await DialogV2.prompt({
      window: { title: game.i18n.localize("GAMMA_WORLD.Encounter.RollMorale") },
      content: `<form>
        <label>${game.i18n.localize("GAMMA_WORLD.Encounter.Scope")}
          <select name="scope">
            <option value="self" ${defaultScope === "self" ? "selected" : ""}>${game.i18n.localize("GAMMA_WORLD.Encounter.ScopeSelf")}</option>
            <option value="targets" ${defaultScope === "targets" ? "selected" : ""}>${game.i18n.localize("GAMMA_WORLD.Encounter.ScopeTargets")}</option>
            <option value="controlled" ${defaultScope === "controlled" ? "selected" : ""}>${game.i18n.localize("GAMMA_WORLD.Encounter.ScopeControlled")}</option>
          </select>
        </label>
        <label>${game.i18n.localize("GAMMA_WORLD.Encounter.Reason")}
          <input type="text" name="reason" value="">
        </label>
        <label>${game.i18n.localize("GAMMA_WORLD.Encounter.Modifier")}
          <input type="number" name="manualModifier" value="0" min="-20" max="20">
        </label>
        <label><input type="checkbox" name="defendingLair"> ${game.i18n.localize("GAMMA_WORLD.Encounter.DefendingLair")}</label>
        <label><input type="checkbox" name="lairYoung"> ${game.i18n.localize("GAMMA_WORLD.Encounter.LairYoung")}</label>
        <label><input type="checkbox" name="track" checked> ${game.i18n.localize("GAMMA_WORLD.Encounter.TrackMorale")}</label>
      </form>`,
      ok: {
        label: game.i18n.localize("GAMMA_WORLD.Encounter.RollMorale"),
        callback: (_event, button) => {
          const data = new foundry.applications.ux.FormDataExtended(button.form).object;
          return {
            scope: data.scope || defaultScope,
            reason: String(data.reason || "").trim(),
            manualModifier: Math.round(Number(data.manualModifier) || 0),
            defendingLair: !!data.defendingLair,
            lairYoung: !!data.lairYoung,
            track: !!data.track
          };
        }
      },
      rejectClose: false
    });
    if (!setup) return;

    const targets = resolveEncounterScopeActors(this.document, setup.scope);
    if (!targets.length) {
      ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Encounter.NoScopeActors"));
      return;
    }

    const { rollMorale } = await import("../encounters.mjs");
    await rollMorale(this.document, {
      targetActors: targets,
      manualModifier: setup.manualModifier,
      defendingLair: setup.defendingLair,
      lairYoung: setup.lairYoung,
      reason: setup.reason,
      track: setup.track
    });
  }

  static async #onRouteEncounter(event, _target) {
    event.preventDefault();
    const { checkRouteEncounter, promptEncounterTerrain } = await import("../encounters.mjs");
    const setup = await promptEncounterTerrain({
      title: game.i18n.localize("GAMMA_WORLD.Encounter.RouteCheck"),
      includePeriod: true
    });
    if (!setup) return;
    await checkRouteEncounter(this.document, setup);
  }

  static async #onRandomEncounter(event, _target) {
    event.preventDefault();
    const { promptEncounterTerrain, rollTerrainEncounter } = await import("../encounters.mjs");
    const setup = await promptEncounterTerrain({
      title: game.i18n.localize("GAMMA_WORLD.Encounter.RandomEncounter")
    });
    if (!setup) return;
    await rollTerrainEncounter(this.document, setup);
  }

  /**
   * 0.14.9 — open the travel-time dialog. Loops 4-hour legs (configurable
   * via `travelLegHours`), each rolling a wandering-encounter check via
   * the existing route-check helper. Stops early when an encounter
   * triggers; advances world time so cell drain ticks naturally; deducts
   * 1 ration per PC per 24h elapsed.
   */
  static async #onTravel(event, _target) {
    event.preventDefault();
    const { openTravelDialog } = await import("../travel.mjs");
    await openTravelDialog(this.document);
  }

  static #lockAction(sheet, target, action, itemId = "") {
    const key = `${sheet.document?.uuid ?? sheet.document?.id ?? "actor"}:${action}:${itemId}`;
    if (actionLocks.has(key)) return null;
    actionLocks.add(key);
    if (target instanceof HTMLElement) {
      target.disabled = true;
      target.dataset.busy = "true";
    }
    return () => {
      actionLocks.delete(key);
      if (target instanceof HTMLElement && target.isConnected) {
        target.disabled = false;
        delete target.dataset.busy;
      }
    };
  }

  static async #onRollAttack(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const release = GammaWorldCharacterSheet.#lockAction(this, target, "rollAttack", itemId);
    if (!release) return;
    const item = this.document.items.get(itemId);
    if (!item) {
      release();
      return;
    }
    try {
      await item.rollAttack();
    } finally {
      release();
    }
  }

  static async #onRollNaturalAttack(event, _target) {
    event.preventDefault();
    const { rollNaturalAttack } = await import("../dice.mjs");
    await rollNaturalAttack(this.document);
  }

  static async #onShowMutationChat(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item || item.type !== "mutation") return;

    const editor = foundry.applications.ux.TextEditor.implementation;
    const enrich = editor.enrichHTML.bind(editor);
    const descriptionHtml = String(item.system.description?.value ?? "").trim();
    const notesText = String(item.system.effect?.notes ?? "").trim();

    let content = descriptionHtml
      ? await enrich(descriptionHtml, { relativeTo: item })
      : paragraphize(notesText);

    const descriptionText = plainText(descriptionHtml);
    if (notesText && (plainText(notesText) !== descriptionText)) {
      content += paragraphize(notesText);
    }

    if (!content.trim()) {
      ui.notifications?.warn(`${item.name} has no description to show.`);
      return;
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      content: `<div class="gw-chat-card gw-mutation-card"><h3>${item.name}</h3>${content}</div>`
    });
  }

  static async #onUseMutation(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const release = GammaWorldCharacterSheet.#lockAction(this, target, "useMutation", itemId);
    if (!release) return;
    const item = this.document.items.get(itemId);
    if (!item) {
      release();
      return;
    }
    try {
      await item.useMutation();
    } finally {
      release();
    }
  }

  static async #onUseItem(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const release = GammaWorldCharacterSheet.#lockAction(this, target, "useItem", itemId);
    if (!release) return;
    const item = this.document.items.get(itemId);
    if (!item) {
      release();
      return;
    }
    try {
      await item.use();
    } finally {
      release();
    }
  }

  static async #onAnalyzeItem(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const release = GammaWorldCharacterSheet.#lockAction(this, target, "analyzeItem", itemId);
    if (!release) return;
    const item = this.document.items.get(itemId);
    if (!item) {
      release();
      return;
    }
    try {
      await item.openArtifactWorkflow();
    } finally {
      release();
    }
  }

  static async #onRevealArtifactFunction(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item || !game.user?.isGM) return;

    const confirm = await DialogV2.confirm({
      window: { title: game.i18n.localize("GAMMA_WORLD.Artifact.Session.RevealFunction") },
      content: `<p>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.RevealFunctionConfirm")}</p>`
    });
    if (!confirm) return;

    const release = GammaWorldCharacterSheet.#lockAction(this, target, "revealArtifactFunction", itemId);
    if (!release) return;
    try {
      const { overrideArtifactAnalysis } = await import("../artifacts.mjs");
      await overrideArtifactAnalysis(this.document, item);
    } finally {
      release();
    }
  }

  static async #onManagePower(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const release = GammaWorldCharacterSheet.#lockAction(this, target, "managePower", itemId);
    if (!release) return;
    const item = this.document.items.get(itemId);
    if (!item) {
      release();
      return;
    }
    const { manageArtifactPower } = await import("../artifact-power.mjs");
    try {
      await manageArtifactPower(this.document, item);
      await this.document.refreshDerivedResources({ adjustCurrent: false });
    } finally {
      release();
    }
  }

  static async #onRemoveEffect(event, target) {
    event.preventDefault();
    const effectId = target.dataset.effectId;
    if (!effectId) return;
    const { removeTemporaryEffect } = await import("../effect-state.mjs");
    await removeTemporaryEffect(this.document, effectId);
  }

  /* --- 0.8.4 Tier 5: standard ActiveEffect row actions ------------- */

  static async #onToggleAE(event, target) {
    event.preventDefault();
    const uuid = target?.dataset?.effectUuid;
    if (!uuid) return;
    const effect = await fromUuid(uuid);
    if (!effect) return;
    await effect.update({ disabled: !effect.disabled });
  }

  static async #onEditAE(event, target) {
    event.preventDefault();
    const uuid = target?.dataset?.effectUuid;
    if (!uuid) return;
    const effect = await fromUuid(uuid);
    if (!effect) return;
    effect.sheet?.render?.(true);
  }

  static async #onDeleteAE(event, target) {
    event.preventDefault();
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

  static async #onResetMutations(event, _target) {
    event.preventDefault();
    const { resetMutationResources } = await import("../mutations.mjs");
    await resetMutationResources(this.document);
  }

  static async #onToggleEquipped(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const release = GammaWorldCharacterSheet.#lockAction(this, target, "toggleEquipped", itemId);
    if (!release) return;
    const item = this.document.items.get(itemId);
    if (!item || !("equipped" in item.system)) {
      release();
      return;
    }
    try {
      await item.toggleEquipped();
      await this.document.refreshDerivedResources({ adjustCurrent: false });
    } finally {
      release();
    }
  }

  static async #onRobotSpendPower(event, _target) {
    event.preventDefault();
    const release = GammaWorldCharacterSheet.#lockAction(this, null, "robotSpendPower", "actor");
    if (!release) return;
    try {
      const amount = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Spend Robot Power" },
        content: `<form><label>Power to spend:
          <input type="number" name="amount" value="1" min="1" max="999">
        </label></form>`,
        ok: {
          label: "Spend",
          callback: (_event, button) => Number(new foundry.applications.ux.FormDataExtended(button.form).object.amount)
        },
        rejectClose: false
      });
      if (amount == null) return;
      const { spendRobotPower } = await import("../robots.mjs");
      await spendRobotPower(this.document, amount);
    } finally {
      release();
    }
  }

  static async #onRobotRecharge(event, _target) {
    event.preventDefault();
    const release = GammaWorldCharacterSheet.#lockAction(this, null, "robotRecharge", "actor");
    if (!release) return;
    try {
      const { rechargeRobot } = await import("../robots.mjs");
      await rechargeRobot(this.document);
    } finally {
      release();
    }
  }

  static async #onRobotCycleMode(event, _target) {
    event.preventDefault();
    const release = GammaWorldCharacterSheet.#lockAction(this, null, "robotCycleMode", "actor");
    if (!release) return;
    try {
      const { cycleRobotMode } = await import("../robots.mjs");
      await cycleRobotMode(this.document);
    } finally {
      release();
    }
  }

  static async #onRobotRepair(event, _target) {
    event.preventDefault();
    const release = GammaWorldCharacterSheet.#lockAction(this, null, "robotRepair", "actor");
    if (!release) return;
    try {
      const { repairRobot } = await import("../robots.mjs");
      await repairRobot(this.document);
    } finally {
      release();
    }
  }

  static async #onItemCreate(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    if (!type) return;
    const name = game.i18n.localize(`TYPES.Item.${type}`);
    await this.document.createEmbeddedDocuments("Item", [{ name: `New ${name}`, type }]);
  }

  static async #onItemEdit(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const release = GammaWorldCharacterSheet.#lockAction(this, target, "itemEdit", itemId);
    if (!release) return;
    try {
      const item = this.document.items.get(itemId);
      if (!item) return;
      if (item.system.artifact?.isArtifact && !artifactOperationKnown(item) && !game.user?.isGM) {
        await item.openArtifactWorkflow();
        return;
      }
      item.sheet?.render({ force: true });
    } finally {
      release();
    }
  }

  static async #onItemDelete(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId;
    const release = GammaWorldCharacterSheet.#lockAction(this, target, "itemDelete", itemId);
    if (!release) return;
    const item = this.document.items.get(itemId);
    if (!item) {
      release();
      return;
    }
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window:  { title: game.i18n.localize("GAMMA_WORLD.Button.Delete") },
      content: `<p>Delete <strong>${artifactDisplayName(item)}</strong>?</p>`
    });
    try {
      if (confirmed) {
        await item.delete();
        await this.document.refreshDerivedResources({ adjustCurrent: false });
      }
    } finally {
      release();
    }
  }

  static async #onRest(event, _target) {
    event.preventDefault();
    const hours = 24;
    await applyRest(this.document, { hours });
  }

  /**
   * 0.14.1 — Short Rest. Prompts for HD count (0..min(available, level/3)),
   * rolls Nd6 healing, drains HD, advances time +1h (per setting), fires
   * `gammaWorld.v1.shortRest` hook.
   */
  static async #onShortRest(event, _target) {
    event.preventDefault();
    const actor = this.document;
    const available = availableHitDice(actor);
    const cap = Math.min(available, shortRestMaxHD(actor));

    if (cap <= 0 && available <= 0) {
      ui.notifications?.warn(game.i18n?.localize?.("GAMMA_WORLD.Action.ShortRest.NoHitDice")
        ?? "No Hit Dice remaining for a Short Rest.");
      // Still allow time-advance / hook fire with 0 HD spent.
    }

    const DialogV2 = foundry.applications.api.DialogV2;
    const titleText  = game.i18n?.localize?.("GAMMA_WORLD.Action.ShortRest.DialogTitle") ?? "Short Rest";
    const promptText = game.i18n?.format?.("GAMMA_WORLD.Action.ShortRest.Prompt", {
      cap, available, level: Number(actor.system?.details?.level ?? 1)
    }) ?? `Hit Dice to spend (0–${cap}, you have ${available}):`;
    const buttonLabel = game.i18n?.localize?.("GAMMA_WORLD.Action.ShortRest.Confirm") ?? "Rest";

    const result = await DialogV2.prompt({
      window: { title: `${actor.name} — ${titleText}` },
      content: `<form class="gw-short-rest-form">
        <p>${promptText}</p>
        <input type="number" name="hitDiceSpent" value="${Math.min(cap, available)}" min="0" max="${Math.max(0, cap)}" step="1" autofocus />
      </form>`,
      ok: {
        label: buttonLabel,
        callback: (_ev, button) => {
          const form = button.form ?? button.closest("form") ?? button.closest(".window-content");
          const input = form?.querySelector?.("input[name='hitDiceSpent']");
          return Math.max(0, Math.floor(Number(input?.value ?? 0)));
        }
      },
      rejectClose: false
    });

    if (result == null) return;   // cancelled
    await performShortRest(actor, { hitDiceSpent: result });
  }

  /**
   * 0.14.1 — Long Rest. Confirms (no parameters), restores all HP unless
   * the actor is poisoned or radiation-sick, refills HD, advances time +6h,
   * fires `gammaWorld.v1.longRest` hook.
   */
  static async #onLongRest(event, _target) {
    event.preventDefault();
    const actor = this.document;
    const DialogV2 = foundry.applications.api.DialogV2;

    const titleText = game.i18n?.localize?.("GAMMA_WORLD.Action.LongRest.DialogTitle") ?? "Long Rest";
    const promptText = game.i18n?.localize?.("GAMMA_WORLD.Action.LongRest.Prompt")
      ?? "Take a 6-hour long rest? HP will fully restore unless poisoned or radiation-sick.";
    const buttonLabel = game.i18n?.localize?.("GAMMA_WORLD.Action.LongRest.Confirm") ?? "Long Rest";

    const confirmed = await DialogV2.confirm({
      window: { title: `${actor.name} — ${titleText}` },
      content: `<p>${promptText}</p>`,
      yes: { label: buttonLabel },
      rejectClose: false
    }).catch(() => null);

    if (!confirmed) return;
    await performLongRest(actor);
  }

  static async #onAwardXp(event, _target) {
    event.preventDefault();
    if (!game.user?.isGM) {
      ui.notifications?.warn("Only the GM can award XP.");
      return;
    }
    const DialogV2 = foundry.applications.api.DialogV2;
    const amount = await DialogV2.prompt({
      window: { title: "Award XP" },
      content: `<p>Amount of XP to award to <strong>${this.document.name}</strong>:</p>
                <input type="number" name="amount" value="100" min="1" step="1" autofocus />
                <p><label>Source: <input type="text" name="source" value="referee" /></label></p>`,
      ok: {
        label: "Award",
        callback: (_ev, button) => {
          const form = button.form ?? button.closest("form") ?? button.closest(".window-content");
          const amountInput = form?.querySelector?.("input[name='amount']");
          const sourceInput = form?.querySelector?.("input[name='source']");
          return {
            amount: Number(amountInput?.value ?? 0),
            source: String(sourceInput?.value ?? "referee")
          };
        }
      }
    });
    if (!amount || !amount.amount) return;
    await awardXp(this.document, amount.amount, { source: amount.source });
  }

  static async #onApplyBonus(event, _target) {
    event.preventDefault();
    const pending = Array.from(this.document.system.advancement?.availableBonuses ?? []);
    if (!pending.length) {
      ui.notifications?.info("No pending attribute bonuses.");
      return;
    }
    const next = pending[0];
    await applyAttributeBonus(this.document, next);
  }

  /** Roll one skill from the Skills tab "Roll" button. */
  static async #onRollSkill(event, target) {
    event.preventDefault();
    const skillKey = target?.dataset?.skillKey;
    if (!skillKey) return;
    await rollSkill(this.document, skillKey);
  }

  /* -------------------------------------------- */
  /*  Render-time wiring                          */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender?.(context, options);
    wireRichEditorToggles(this);
  }

  _onChangeForm(formConfig, event) {
    if (isRichEditorChange(event)) return;

    // Max-3 proficient-skills guardrail. Intercepts the change on a
    // proficient checkbox when ticking it on would exceed the cap;
    // un-ticks the checkbox and notifies the GM. Leaves the existing
    // data untouched since the flip never reaches the submit handler.
    const target = event?.target;
    if (target?.type === "checkbox" && target.checked
        && typeof target.name === "string"
        && target.name.startsWith("system.skills.")
        && target.name.endsWith(".proficient")) {
      const currentCount = countProficientSkills(this.document);
      if (currentCount >= MAX_PROFICIENT_SKILLS) {
        target.checked = false;
        const cap = MAX_PROFICIENT_SKILLS;
        ui.notifications?.warn(
          game.i18n?.localize?.("GAMMA_WORLD.SkillSheet.MaxProficientWarn")
          ?? `Max of ${cap} proficient skills.`
        );
        return;
      }
    }

    return super._onChangeForm?.(formConfig, event);
  }
}

export class GammaWorldMonsterSheet extends GammaWorldCharacterSheet {
  static SHEET_MODE = "monster";

  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);
    options.classes = ["gamma-world", "sheet", "actor", "monster"];
    options.position = { width: 760, height: 840 };
    return options;
  }
}
