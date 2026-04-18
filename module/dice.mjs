import { SYSTEM_ID } from "./config.mjs";
import { addDiceToFormula, addFlatBonusToFormula, addPerDieBonusToFormula, doubleDiceInFormula, scaleFormula } from "./formulas.mjs";
import { naturalAttackTarget, weaponAttackTarget } from "./tables/combat-matrix.mjs";
import {
  combinedFatigueFactor,
  resolveWeaponFatigueFamily
} from "./tables/fatigue-matrix.mjs";
import {
  actorHasForceField,
  actorHasHazardProtection,
  applyIncomingDamage,
  applyStunDamage,
  applyTemporaryEffect
} from "./effect-state.mjs";
import { runAsUser } from "./gm-executor.mjs";
import { autoApplyOnHitEffect, shouldHideManualFollowUp } from "./on-hit-effects.mjs";
import { determineRangeBand } from "./range.mjs";
import { buildAttackContext, serializeAttackContext } from "./attack-context.mjs";
import { HOOK, fireAnnounceHook, fireVetoHook } from "./hook-surface.mjs";
import { consumeResource, postDepletedNotice } from "./resource-consumption.mjs";
import {
  clampSaveScore,
  evaluateSaveForActor,
  preferredSaveUserId,
  saveContextForActor
} from "./save-flow.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

async function renderTemplate(path, data) {
  return foundry.applications.handlebars.renderTemplate(path, data);
}

/**
 * World-setting gate for auto-rolling NPC damage after an attack card posts.
 * Returns false for any player-owned attacker (so PCs always click their own
 * damage button) and for any case where the setting is off or unreadable.
 *
 * Modes (`npcDamageMode` setting, migrated from legacy `autoRollNpcDamage`):
 *   - "none"   — never auto-roll; GM clicks
 *   - "onHit"  — auto-roll only if the outer caller reports a hit (default)
 *   - "always" — auto-roll regardless of hit outcome
 *
 * Callers still gate on `hit &&` at the use site for weapon attacks, so
 * "onHit" and "always" behave identically there; the distinction matters for
 * save-based attacks (mental/grenade) that don't have a to-hit roll.
 */
function shouldAutoRollNpcDamage(actor) {
  if (!actor) return false;
  if (actor.hasPlayerOwner) return false;
  try {
    const mode = game.settings?.get(SYSTEM_ID, "npcDamageMode");
    return mode === "always" || mode === "onHit";
  } catch (_error) {
    return false;
  }
}

function tokenCenter(token) {
  if (!token) return null;
  return {
    x: token.x + (token.w / 2),
    y: token.y + (token.h / 2)
  };
}

function tokenDocumentUuid(token) {
  return token?.document?.uuid ?? token?.uuid ?? null;
}

export function resolveTargetActor(token) {
  if (!token) return null;
  if (token.actor) return token.actor;
  const actorId = token.document?.actorId ?? token.actor?.id ?? null;
  return game.actors?.get(actorId) ?? null;
}

function actorFromDocument(document) {
  if (!document) return null;
  if (document instanceof Actor) return document;
  if (document.actor instanceof Actor) return document.actor;
  if (document.document?.actor instanceof Actor) return document.document.actor;
  if (document.object?.actor instanceof Actor) return document.object.actor;
  return null;
}

export async function resolveActorFromUuid(uuid) {
  if (!uuid) return null;
  const document = await fromUuid(uuid);
  return actorFromDocument(document);
}

async function resolveTokenFromUuid(uuid) {
  if (!uuid) return null;
  const document = await fromUuid(uuid);
  return document?.object ?? document ?? null;
}

function uniqueActors(actors) {
  const seen = new Set();
  return actors.filter((actor) => {
    if (!actor?.uuid || seen.has(actor.uuid)) return false;
    seen.add(actor.uuid);
    return true;
  });
}

async function resolveTargetActors({
  targetUuid = null,
  targetUuids = [],
  fallbackToUserTargets = true,
  fallbackToControlledTokens = true
} = {}) {
  let actors = [];

  if (targetUuid) {
    const targetActor = await resolveActorFromUuid(targetUuid);
    if (targetActor) actors = [targetActor];
  }

  if (!actors.length && Array.isArray(targetUuids) && targetUuids.length) {
    const resolved = await Promise.all(targetUuids.map((uuid) => resolveActorFromUuid(uuid)));
    actors = uniqueActors(resolved.filter(Boolean));
  }

  if (!actors.length && fallbackToUserTargets) {
    actors = uniqueActors(
      [...(game.user?.targets ?? new Set())]
        .map((token) => resolveTargetActor(token))
        .filter(Boolean)
    );
  }

  if (!actors.length && fallbackToControlledTokens) {
    actors = uniqueActors(
      (canvas.tokens?.controlled ?? [])
        .map((token) => resolveTargetActor(token))
        .filter(Boolean)
    );
  }

  return actors;
}

export function measureTokenDistance(originToken, targetToken) {
  const origin = tokenCenter(originToken);
  const target = tokenCenter(targetToken);
  if (!origin || !target || !canvas?.grid?.size || !canvas?.scene) return 0;
  const pixels = Math.hypot(target.x - origin.x, target.y - origin.y);
  return (pixels / canvas.grid.size) * (canvas.scene.grid.distance || 1);
}

export function primaryTarget() {
  const target = [...(game.user?.targets ?? new Set())][0];
  if (!target) return null;
  const actor = resolveTargetActor(target);
  return {
    token: target,
    actor,
    uuid: actor?.uuid ?? null
  };
}

export async function promptNumber({
  title,
  label,
  name = "value",
  value = 0,
  min = null,
  max = null
}) {
  const minAttr = min == null ? "" : `min="${min}"`;
  const maxAttr = max == null ? "" : `max="${max}"`;
  return DialogV2.prompt({
    window: { title },
    content: `<form><label>${label}
      <input type="number" name="${name}" value="${value}" ${minAttr} ${maxAttr} autofocus>
    </label></form>`,
    ok: {
      label: "OK",
      callback: (_event, button) => Number(new foundry.applications.ux.FormDataExtended(button.form).object[name])
    },
    rejectClose: false
  });
}

function saveTypeLabel(type) {
  return game.i18n.localize(`GAMMA_WORLD.Save.${type.charAt(0).toUpperCase() + type.slice(1)}`);
}

function savePromptTitle(type) {
  return `${type === "mental" ? "Roll" : "Resolve"} ${saveTypeLabel(type)} Save`;
}

function savePromptLabel(type) {
  return type === "mental" ? "Attacker mental strength:" : `${saveTypeLabel(type)} intensity:`;
}

function abilityLabel(key) {
  return game.i18n.localize(`GAMMA_WORLD.Attribute.${String(key ?? "").toUpperCase()}.full`);
}

function signedNumber(value) {
  const numeric = Math.round(Number(value) || 0);
  return numeric >= 0 ? `+${numeric}` : String(numeric);
}

function labeledModifierTerm(value, label) {
  const numeric = Math.round(Number(value) || 0);
  const absolute = Math.abs(numeric);
  if (!absolute) return ` + 0[${label}]`;
  return numeric >= 0 ? ` + ${absolute}[${label}]` : ` - ${absolute}[${label}]`;
}

async function promptAbilityRoll(actor, abilityKey, {
  sourceName = "",
  situationalModifier = 0,
  dc = null
} = {}) {
  const ability = actor?.system?.attributes?.[abilityKey];
  if (!ability) return null;

  const sourceLine = sourceName
    ? `<p>Reason: <strong>${foundry.utils.escapeHTML(sourceName)}</strong></p>`
    : "";
  const dcLine = Number.isFinite(Number(dc))
    ? `<p>DC: <strong>${Math.round(Number(dc) || 0)}</strong></p>`
    : "";

  return DialogV2.prompt({
    window: { title: `Roll ${abilityLabel(abilityKey)}` },
    content: `<form>
      <p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> rolls ${foundry.utils.escapeHTML(abilityLabel(abilityKey))}.</p>
      ${sourceLine}
      ${dcLine}
      <p>Ability modifier: <strong>${signedNumber(ability.mod ?? 0)}</strong></p>
      <p>Situational modifier: <strong>${signedNumber(situationalModifier)}</strong></p>
    </form>`,
    ok: {
      label: "Roll",
      callback: () => true
    },
    rejectClose: false
  });
}

async function promptSaveInput(actor, type, {
  sourceName = "",
  intensity = null,
  inputLocked = false
} = {}) {
  const value = clampSaveScore(intensity ?? 10);
  const readonly = inputLocked ? "readonly" : "";
  const autofocus = inputLocked ? "" : "autofocus";
  const sourceLine = sourceName
    ? `<p>Source: <strong>${foundry.utils.escapeHTML(sourceName)}</strong></p>`
    : "";
  const actorLine = actor?.name
    ? `<p>${foundry.utils.escapeHTML(actor.name)} resolves a ${foundry.utils.escapeHTML(saveTypeLabel(type).toLowerCase())} save.</p>`
    : "";

  return DialogV2.prompt({
    window: { title: savePromptTitle(type) },
    content: `<form>
      ${actorLine}
      ${sourceLine}
      <label>${savePromptLabel(type)}
        <input type="number" name="value" value="${value}" min="3" max="18" ${readonly} ${autofocus}>
      </label>
    </form>`,
    ok: {
      label: type === "mental" ? "Roll Save" : "Resolve Save",
      callback: (_event, button) => {
        const data = new foundry.applications.ux.FormDataExtended(button.form).object;
        return clampSaveScore(data.value);
      }
    },
    rejectClose: false
  });
}

async function localSaveResolution(actor, type, options = {}) {
  return promptAndResolveSave(actor, type, options);
}

async function resolveAttackTarget(actor, { allowManualAc = true } = {}) {
  const sourceToken = actor.getActiveTokens?.()[0] ?? null;
  const target = primaryTarget();
  if (target?.actor) {
    const distance = measureTokenDistance(sourceToken, target.token);
    return {
      targetUuid: target.uuid,
      targetTokenUuid: tokenDocumentUuid(target.token),
      targetToken: target.token,
      targetName: target.actor.name,
      armorClass: target.actor.system.resources?.ac ?? 10,
      distance
    };
  }

  if (!allowManualAc) return null;
  const armorClass = await promptNumber({
    title: "Target Armor Class",
    label: "Target armor class:",
    value: 10,
    min: 1,
    max: 10
  });
  if (armorClass == null) return null;

  return {
    targetUuid: null,
    targetTokenUuid: null,
    targetToken: null,
    targetName: "Manual Target",
    armorClass
  };
}

export { determineRangeBand };

/**
 * Build an ordered list of attack-bonus contributions so the attack
 * card can surface each component on its own line. Zero values are
 * omitted so only factors that actually changed the total appear.
 */
function buildAttackBonusBreakdown({ dxToHit = 0, psToHit = 0, closeRangeBonus = 0, rangePenalty = 0, rangeLabel = "" } = {}) {
  const parts = [];
  const push = (label, value) => {
    const n = Number(value) || 0;
    if (!n) return;
    parts.push({ label, value: n, signed: n > 0 ? `+${n}` : `${n}` });
  };
  push("DX (Dexterity)", dxToHit);
  push("PS (Physical Strength)", psToHit);
  push("Close range", closeRangeBonus);
  if (rangePenalty) {
    parts.push({
      label: rangeLabel ? `Range (${rangeLabel})` : "Range",
      value: rangePenalty,
      signed: rangePenalty > 0 ? `+${rangePenalty}` : `${rangePenalty}`
    });
  }
  return parts;
}

/**
 * Return both the final damage formula AND an ordered list of
 * contributions so chat cards can surface where each bonus / penalty
 * came from. The `.formula` return is what actually gets rolled.
 *
 * Each contribution is `{ label, value, signed }`:
 *   - `label`: human-readable source (e.g. "PS (Physical Strength)")
 *   - `value`: the numeric or formula delta as a string
 *   - `signed`: the signed string form for template display ("+3", "-1")
 *
 * Zero-valued contributions are skipped so the breakdown only lists
 * factors that actually changed the result.
 */
function computeWeaponDamageFormula(actor, weapon) {
  const base = weapon.system.damage?.formula || "1d6";
  let formula = base;
  const derived = actor.gw ?? {};
  const contributions = [{ label: "Base", value: base, signed: base }];

  const weaponExtra = Number(derived.weaponExtraDice ?? 0) || 0;
  if (weaponExtra) {
    formula = addDiceToFormula(formula, weaponExtra);
    contributions.push({
      label: "Bonus dice",
      value: weaponExtra,
      signed: weaponExtra > 0 ? `+${weaponExtra}d` : `${weaponExtra}d`
    });
  }

  if (weapon.system.attackType !== "energy") {
    const convExtra = Number(derived.conventionalWeaponExtraDice ?? 0) || 0;
    if (convExtra) {
      formula = addDiceToFormula(formula, convExtra);
      contributions.push({
        label: "Conventional weapon dice",
        value: convExtra,
        signed: convExtra > 0 ? `+${convExtra}d` : `${convExtra}d`
      });
    }
  }

  if (weapon.system.attackType === "melee" || weapon.system.attackType === "thrown") {
    const psFlat = Number(derived.damageFlat ?? 0) || 0;
    if (psFlat) {
      formula = addFlatBonusToFormula(formula, psFlat);
      contributions.push({
        label: "PS damage",
        value: psFlat,
        signed: psFlat > 0 ? `+${psFlat}` : `${psFlat}`
      });
    }
  }

  const perDie = Number(derived.damagePerDie ?? 0) || 0;
  if (perDie) {
    formula = addPerDieBonusToFormula(formula, perDie);
    contributions.push({
      label: "Bonus per die",
      value: perDie,
      signed: perDie > 0 ? `+${perDie}/die` : `${perDie}/die`
    });
  }

  return { formula, contributions };
}

async function createDamageCard({
  actor,
  sourceName,
  formula,
  damageType = "",
  targetUuid = null,
  targetUuids = [],
  sourceUuid = null,
  sourceKind = "weapon",
  weaponTag = "",
  nonlethal = false,
  notes = "",
  isCritical = false,
  /** Ordered list of damage contributions from computeWeaponDamageFormula
   *  (or a caller-supplied equivalent). Surfaced on the chat card so the
   *  GM can see where each +/- came from at a glance. Optional; omit for
   *  callers that roll a plain formula without bonus context. */
  contributions = null
}) {
  // Phase 2b: preRollDamage — veto-capable. Payload is a minimal
  // damage-intent snapshot keyed from the args (callers don't thread
  // AttackContext through this helper yet).
  const preRollPayload = {
    actorUuid: actor?.uuid ?? null,
    sourceUuid, sourceKind, sourceName,
    targetUuid, targetUuids,
    formula, damageType, weaponTag, nonlethal,
    isCritical
  };
  if (!fireVetoHook(HOOK.preRollDamage, { intent: preRollPayload })) return;

  const effectiveFormula = isCritical ? doubleDiceInFormula(formula) : formula;
  const roll = await new Roll(effectiveFormula).evaluate();

  // Phase 2b: damageRollComplete — announce after evaluation.
  fireAnnounceHook(HOOK.damageRollComplete, {
    intent: preRollPayload,
    roll,
    total: roll.total,
    effectiveFormula
  });

  // Expandable breakdown: Foundry's built-in getTooltip() renders every
  // die term as its own section. Paired with the gw-toggle-roll click
  // handler in hooks.mjs, this gives the card a D&D-5e-style reveal.
  const rollTooltip = await roll.getTooltip();

  // Per-target apply picker: each damage card can list one or many
  // targets, and the GM wants per-target adjustment (forcefield on
  // target A, vulnerability on target B, etc.). Resolve names + UUIDs
  // upfront so the template renders one row of multiplier pills per
  // target; click handlers in hooks.mjs manage the selection state and
  // commit the chosen multiplier individually.
  const combinedUuids = Array.from(new Set([
    ...(targetUuid ? [targetUuid] : []),
    ...(Array.isArray(targetUuids) ? targetUuids : [])
  ].filter(Boolean)));
  const templateTargets = [];
  for (const uuid of combinedUuids) {
    let name = "Target";
    try {
      const doc = await fromUuid(uuid);
      if (doc) {
        name = doc.name ?? doc?.actor?.name ?? name;
        // Token documents expose their actor at `.actor`; use that name
        // when available so unlinked tokens show the bespoke name.
        if (doc?.documentName === "Token") name = doc?.name ?? doc?.actor?.name ?? name;
      }
    } catch (_error) { /* leave fallback name */ }
    templateTargets.push({ uuid, name });
  }

  // Only surface the contributions section if there's more than just
  // the base formula (i.e. at least one actual bonus/penalty kicked in).
  // For a crit, insert a doubled-dice contribution so the breakdown
  // doesn't lie about why the formula grew.
  const contributionList = Array.isArray(contributions) ? contributions.slice() : [];
  if (isCritical && contributionList.length > 0) {
    contributionList.splice(1, 0, {
      label: "Critical hit",
      value: "×2 dice",
      signed: "×2 dice"
    });
  }
  const showContributions = contributionList.length > 1;

  const content = await renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/damage-card.hbs`,
    {
      actorName: actor.name,
      weaponName: sourceName,
      formula: effectiveFormula,
      total: roll.total,
      dmgType: damageType,
      notes: isCritical
        ? [notes, game.i18n.localize("GAMMA_WORLD.Combat.CriticalHit")].filter(Boolean).join(" · ")
        : notes,
      isCritical,
      rollTooltip,
      rollFormula: roll.formula,
      contributions: contributionList,
      showContributions,
      targets: templateTargets,
      hasTargets: templateTargets.length > 0
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: {
      [SYSTEM_ID]: {
        card: "damage",
        damage: {
          actorUuid: actor.uuid,
          sourceUuid,
          sourceKind,
          targetUuid,
          targetUuids,
          total: roll.total,
          formula,
          damageType,
          sourceName,
          weaponTag,
          nonlethal
        }
      }
    }
  });
}

async function evaluateEffectFormula(formula, actor, target, fallback = 0) {
  if (!formula) return fallback;
  const roll = await new Roll(formula, {
    attacker: actor.getRollData?.() ?? actor.system,
    target: target?.getRollData?.() ?? target?.system ?? {}
  }).evaluate();
  return roll.total;
}

async function postAttackEffectMessage(actor, sourceName, summary) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card"><h3>${sourceName}</h3><p>${summary}</p></div>`
  });
}

function followUpLabelForWeapon(weapon) {
  switch (weapon.system.effect?.mode) {
    case "damage":
      return "Roll Damage";
    case "death":
      return "Resolve Death";
    default:
      return "Resolve Effect";
  }
}

export async function applyDamageToTargets(amount, multiplier = 1, {
  targetUuid = null,
  targetUuids = [],
  damageType = "",
  weaponTag = "",
  sourceName = "",
  nonlethal = false,
  sourceMessageId = null,
  idempotencyKey = ""
} = {}) {
  const damage = Math.max(0, Math.floor((Number(amount) || 0) * multiplier));
  const actors = await resolveTargetActors({ targetUuid, targetUuids });

  if (!actors.length) {
    ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Error.NoTarget"));
    return;
  }

  if (sourceMessageId && idempotencyKey) {
    const prior = game.messages?.get(sourceMessageId)?.getFlag(SYSTEM_ID, `applied.${idempotencyKey}`);
    if (prior) {
      ui.notifications?.info("That damage card has already been applied.");
      return;
    }
  }

  // Phase 3: capture the pre-mutation snapshot now, stash on the
  // "Damage Applied" summary card at the end so a GM can undo the
  // whole click with one button.
  const { buildUndoSnapshot } = await import("./undo.mjs");
  const undoSnapshot = buildUndoSnapshot({
    kind: "damageApplied",
    actors,
    chatMessageIds: [],
    userId: game.user?.id ?? null
  });

  const summaries = [];
  for (const actor of actors) {
    const multiplierAdjusted = actor.gw?.damageTakenMultiplier ?? 1;
    const reduction = actor.gw?.damageReductionMultiplier ?? 1;
    const finalDamage = Math.max(0, Math.floor(damage * multiplierAdjusted * reduction));
    if (nonlethal) {
      await applyStunDamage(actor, finalDamage, { sourceName });
      summaries.push(`${actor.name}: ${finalDamage} stun`);
      continue;
    }
    const result = await applyIncomingDamage(actor, finalDamage, { damageType, weaponTag, sourceName });
    const notes = result.notes?.length ? ` (${result.notes.join("; ")})` : "";
    summaries.push(`${actor.name}: ${result.applied} applied, ${result.prevented} prevented${notes}`);
  }

  if (sourceMessageId && idempotencyKey) {
    const message = game.messages?.get(sourceMessageId);
    if (message) await message.setFlag(SYSTEM_ID, `applied.${idempotencyKey}`, true);
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actors[0] }),
    content: `<div class="gw-chat-card"><h3>${sourceName || "Damage Applied"}</h3><p>${summaries.join("<br>")}</p></div>`,
    flags: {
      [SYSTEM_ID]: { undo: undoSnapshot }
    }
  });
}

export async function applyHealingToTargets(amount, multiplier = 1, {
  targetUuid = null,
  targetUuids = []
} = {}) {
  const healing = Math.max(0, Math.floor((Number(amount) || 0) * multiplier));
  const actors = await resolveTargetActors({ targetUuid, targetUuids });

  if (!actors.length) {
    ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Error.NoTarget"));
    return;
  }

  for (const actor of actors) {
    await actor.heal(healing);
  }
}

function findAmmoGearItem(actor, ammoType) {
  if (!ammoType || !actor?.items) return null;
  return actor.items.find((item) =>
    item?.type === "gear"
    && item.system?.subtype === "ammunition"
    && item.system?.ammo?.type === ammoType
    && Number(item.system?.ammo?.rounds ?? 0) > 0
  ) ?? null;
}

export async function rollAttack(actor, weapon) {
  const target = await resolveAttackTarget(actor);
  if (!target) return;
  const sourceToken = actor.getActiveTokens?.()[0] ?? null;

  // Ammunition resolution: prefer a matching gear item; fall back to the
  // weapon's legacy inline counter so older content still fires.
  const ammoType = String(weapon.system.ammoType ?? "").trim();
  let ammoItem = null;
  if (ammoType) {
    ammoItem = findAmmoGearItem(actor, ammoType);
    if (!ammoItem && (!weapon.system.ammo?.consumes || Number(weapon.system.ammo?.current ?? 0) <= 0)) {
      ui.notifications?.warn(`No ${ammoType.replace(/-/g, " ")} ammunition available.`);
      return;
    }
  } else if (weapon.system.ammo?.consumes && Number(weapon.system.ammo.current ?? 0) <= 0) {
    ui.notifications?.warn("No ammunition remaining.");
    await postDepletedNotice(weapon, "ammo");
    return;
  }

  const range = determineRangeBand(weapon, target.distance ?? 0);
  if (range.penalty <= -999) {
    ui.notifications?.warn("Target is out of range.");
    return;
  }

  // RAW GW1e: Physical Strength bonus applies to melee and thrown
  // to-hit (stacked on top of the dexterity bonus from the same band).
  // Ranged / energy weapons don't get the PS to-hit contribution.
  const isMeleeLike = weapon.system.attackType === "melee"
    || weapon.system.attackType === "thrown";
  const psToHit = isMeleeLike ? Number(actor.gw?.meleeToHitBonus ?? 0) || 0 : 0;
  const closeRangeBonus = target.distance && target.distance <= 30
    ? Number(actor.gw?.closeRangeToHitBonus ?? 0) || 0
    : 0;
  const dxToHit = Number(actor.gw?.toHitBonus ?? 0) || 0;
  const attackBonus = dxToHit + psToHit + closeRangeBonus + range.penalty;

  const attackBonusContributions = buildAttackBonusBreakdown({
    dxToHit, psToHit, closeRangeBonus,
    rangePenalty: range.penalty,
    rangeLabel: range.label
  });

  const meleeTurn = Number(actor.system.combat?.fatigue?.round ?? 0);
  const fatigueFactor = combinedFatigueFactor({
    family: resolveWeaponFatigueFamily({ name: weapon.name, weaponClass: weapon.system.weaponClass }),
    armorClass: actor.system.resources?.ac,
    meleeTurn
  });
  const effectiveWeaponClass = Math.max(1, Number(weapon.system.weaponClass ?? 1) + fatigueFactor);
  const targetNumber = weaponAttackTarget(effectiveWeaponClass, target.armorClass);

  // Phase 2b: preAttackRoll — veto-capable. Intent payload (no roll yet).
  const preRollContext = buildAttackContext({
    actor, token: sourceToken, weapon, target, range,
    attackBonus, hitTarget: targetNumber,
    effectMode: weapon.system.effect?.mode || "damage",
    sourceKind: "weapon", sourceName: weapon.name
  });
  if (!fireVetoHook(HOOK.preAttackRoll, { context: preRollContext })) return;

  const roll = await new Roll("1d20 + @bonus", { bonus: attackBonus }).evaluate();
  const d20Value = roll.terms?.[0]?.total ?? roll.total;
  const isCritical = d20Value === 20;
  const isFumble = d20Value === 1;
  const hit = isCritical || (!isFumble && roll.total >= targetNumber);
  const { formula: damageFormula, contributions: damageContributions } =
    computeWeaponDamageFormula(actor, weapon);
  const effectMode = weapon.system.effect?.mode || "damage";
  const hideFollowUp = hit && shouldHideManualFollowUp(effectMode);

  // Build the AttackContext early (Phase 2a/4): the ammo-consume path
  // below writes into `context.resources` so a later refund flow can
  // trace the debit back to this attack.
  const context = buildAttackContext({
    actor, token: sourceToken, weapon, target, roll, range,
    attackBonus, hitTarget: targetNumber, hit, isCritical, isFumble,
    damageFormula, damageType: weapon.system.damage?.type ?? "",
    effectMode, effectFormula: weapon.system.effect?.formula || "",
    effectStatus: weapon.system.effect?.status || "",
    effectNotes: weapon.system.effect?.notes || "",
    weaponTag: weapon.system.traits?.tag || "",
    nonlethal: !!weapon.system.traits?.nonlethal,
    sourceKind: "weapon", sourceName: weapon.name
  });

  const rollTooltip = await roll.getTooltip();

  const content = await renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/attack-card.hbs`,
    {
      actorName: actor.name,
      weaponName: weapon.name,
      attackerLevel: actor.system.details.level ?? 1,
      targetAc: target.armorClass,
      hitTarget: targetNumber,
      d20: d20Value,
      total: roll.total,
      hit,
      isCritical,
      isFumble,
      targetName: target.targetName,
      attackBonus,
      rangeLabel: range.label,
      rangePenalty: range.penalty,
      distance: target.distance ?? 0,
      followUpLabel: followUpLabelForWeapon(weapon),
      showFollowUp: !hideFollowUp,
      rollTooltip,
      rollFormula: roll.formula,
      attackBonusContributions,
      showAttackBonusBreakdown: attackBonusContributions.length > 0
    }
  );

  // Consume the ammo gear item first; fall back to the weapon's inline
  // counter if no gear ammo was found. The inline path routes through
  // consumeResource so the `autoConsumeCharges` setting, depletion
  // notice, and resourceConsumed hook fire consistently (Phase 4).
  if (ammoItem) {
    // Ammo gear items track counts under system.ammo.rounds, not
    // system.ammo.current — the consumeResource helper doesn't know
    // about this shape. Keep the direct update here.
    const remaining = Math.max(0, Number(ammoItem.system.ammo.rounds ?? 0) - 1);
    await ammoItem.update({ "system.ammo.rounds": remaining });
  } else if (weapon.system.ammo?.consumes) {
    await consumeResource(weapon, "ammo", 1, { context });
  }

  await game.gammaWorld?.animations?.playWeaponProjectile?.({
    weaponName: weapon.name,
    sourceToken,
    targetToken: target.targetToken ?? null
  });

  const attackFlags = {
    actorUuid: actor.uuid,
    weaponUuid: weapon.uuid,
    targetUuid: target.targetUuid,
    sourceTokenUuid: tokenDocumentUuid(sourceToken),
    targetTokenUuid: target.targetTokenUuid,
    targetAc: target.armorClass,
    targetNumber,
    hit,
    isCritical,
    isFumble,
    damageFormula,
    damageContributions,
    damageType: weapon.system.damage?.type ?? "",
    sourceName: weapon.name,
    sourceKind: "weapon",
    effectMode,
    effectFormula: weapon.system.effect?.formula || "",
    effectStatus: weapon.system.effect?.status || "",
    effectNotes: weapon.system.effect?.notes || "",
    weaponTag: weapon.system.traits?.tag || "",
    nonlethal: !!weapon.system.traits?.nonlethal
  };

  // Phase 2b: attackRollComplete — announce-only, fires after the roll
  // resolves and before the card posts. `context` was built earlier so
  // the ammo-consume path could record its debit on it.
  fireAnnounceHook(HOOK.attackRollComplete, { context, roll });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: {
      [SYSTEM_ID]: {
        card: "attack",
        attack: attackFlags,
        context: serializeAttackContext(context)
      }
    }
  });

  if (hit && hideFollowUp) {
    const targetActor = await resolveActorFromUuid(attackFlags.targetUuid);
    try {
      await autoApplyOnHitEffect(attackFlags, { actor, target: targetActor });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | auto-apply on-hit effect failed`, error);
    }
  } else if (hit && shouldAutoRollNpcDamage(actor)) {
    try {
      await rollDamageFromFlags(attackFlags);
    } catch (error) {
      console.warn(`${SYSTEM_ID} | auto-roll NPC damage failed`, error);
    }
  }
}

export async function rollNaturalWeaponAttack(actor, weapon) {
  const target = await resolveAttackTarget(actor);
  if (!target) return;
  const sourceToken = actor.getActiveTokens?.()[0] ?? null;

  // Natural weapons (claws, bites, etc.) never consume ammo. Respect a
  // defensive inline counter only if somebody deliberately set one.
  if (weapon.system.ammo?.consumes && Number(weapon.system.ammo.current ?? 0) <= 0) {
    ui.notifications?.warn("No ammunition remaining.");
    await postDepletedNotice(weapon, "ammo");
    return;
  }

  const range = determineRangeBand(weapon, target.distance ?? 0);
  if (range.penalty <= -999) {
    ui.notifications?.warn("Target is out of range.");
    return;
  }

  // Natural weapons (claws, bites, tentacles) are effectively melee
  // regardless of the attackType field — include the PS to-hit bonus.
  const isMeleeLike = weapon.system.attackType !== "ranged"
    && weapon.system.attackType !== "energy";
  const psToHit = isMeleeLike ? Number(actor.gw?.meleeToHitBonus ?? 0) || 0 : 0;
  const closeRangeBonus = target.distance && target.distance <= 30
    ? Number(actor.gw?.closeRangeToHitBonus ?? 0) || 0
    : 0;
  const dxToHit = Number(actor.gw?.toHitBonus ?? 0) || 0;
  const attackBonus = dxToHit + psToHit + closeRangeBonus + range.penalty;

  const attackBonusContributions = buildAttackBonusBreakdown({
    dxToHit, psToHit, closeRangeBonus,
    rangePenalty: range.penalty,
    rangeLabel: range.label
  });

  const targetNumber = naturalAttackTarget(actor.system.details.level ?? 1, target.armorClass);

  // Phase 2b: preAttackRoll — veto-capable.
  {
    const preRollContext = buildAttackContext({
      actor, token: sourceToken, weapon, target, range,
      attackBonus, hitTarget: targetNumber,
      effectMode: weapon.system.effect?.mode || "damage",
      sourceKind: "natural", sourceName: weapon.name
    });
    if (!fireVetoHook(HOOK.preAttackRoll, { context: preRollContext })) return;
  }

  const roll = await new Roll("1d20 + @bonus", { bonus: attackBonus }).evaluate();
  const d20Value = roll.terms?.[0]?.total ?? roll.total;
  const isCritical = d20Value === 20;
  const isFumble = d20Value === 1;
  const hit = isCritical || (!isFumble && roll.total >= targetNumber);
  const { formula: damageFormula, contributions: damageContributions } =
    computeWeaponDamageFormula(actor, weapon);
  const effectMode = weapon.system.effect?.mode || "damage";
  const hideFollowUp = hit && shouldHideManualFollowUp(effectMode);

  // AttackContext (Phase 2a/4) — built early so ammo-consume can record
  // the debit on it.
  const context = buildAttackContext({
    actor, token: sourceToken, weapon, target, roll, range,
    attackBonus, hitTarget: targetNumber, hit, isCritical, isFumble,
    damageFormula, damageType: weapon.system.damage?.type ?? "physical",
    effectMode, effectFormula: weapon.system.effect?.formula || "",
    effectStatus: weapon.system.effect?.status || "",
    effectNotes: weapon.system.effect?.notes || "",
    weaponTag: weapon.system.traits?.tag || "natural",
    nonlethal: !!weapon.system.traits?.nonlethal,
    sourceKind: "natural", sourceName: weapon.name
  });

  const rollTooltip = await roll.getTooltip();

  const content = await renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/attack-card.hbs`,
    {
      actorName: actor.name,
      weaponName: weapon.name,
      attackerLevel: actor.system.details.level ?? 1,
      targetAc: target.armorClass,
      hitTarget: targetNumber,
      d20: d20Value,
      total: roll.total,
      hit,
      isCritical,
      isFumble,
      targetName: target.targetName,
      attackBonus,
      rangeLabel: range.label,
      rangePenalty: range.penalty,
      distance: target.distance ?? 0,
      followUpLabel: followUpLabelForWeapon(weapon),
      showFollowUp: !hideFollowUp,
      rollTooltip,
      rollFormula: roll.formula,
      attackBonusContributions,
      showAttackBonusBreakdown: attackBonusContributions.length > 0
    }
  );

  if (weapon.system.ammo?.consumes) {
    await consumeResource(weapon, "ammo", 1, { context });
  }

  const attackFlags = {
    actorUuid: actor.uuid,
    weaponUuid: weapon.uuid,
    targetUuid: target.targetUuid,
    sourceTokenUuid: tokenDocumentUuid(sourceToken),
    targetTokenUuid: target.targetTokenUuid,
    targetAc: target.armorClass,
    targetNumber,
    hit,
    isCritical,
    isFumble,
    damageFormula,
    damageContributions,
    damageType: weapon.system.damage?.type ?? "physical",
    sourceName: weapon.name,
    sourceKind: "natural",
    effectMode,
    effectFormula: weapon.system.effect?.formula || "",
    effectStatus: weapon.system.effect?.status || "",
    effectNotes: weapon.system.effect?.notes || "",
    weaponTag: weapon.system.traits?.tag || "natural",
    nonlethal: !!weapon.system.traits?.nonlethal
  };

  fireAnnounceHook(HOOK.attackRollComplete, { context, roll });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: {
      [SYSTEM_ID]: {
        card: "attack",
        attack: attackFlags,
        context: serializeAttackContext(context)
      }
    }
  });

  if (hit && hideFollowUp) {
    const targetActor = await resolveActorFromUuid(attackFlags.targetUuid);
    try {
      await autoApplyOnHitEffect(attackFlags, { actor, target: targetActor });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | auto-apply on-hit effect failed`, error);
    }
  } else if (hit && shouldAutoRollNpcDamage(actor)) {
    try {
      await rollDamageFromFlags(attackFlags);
    } catch (error) {
      console.warn(`${SYSTEM_ID} | auto-roll NPC damage failed`, error);
    }
  }
}

export async function rollNaturalAttack(actor) {
  const target = await resolveAttackTarget(actor);
  if (!target) return;
  const sourceToken = actor.getActiveTokens?.()[0] ?? null;

  // Generic natural attacks are melee by definition — include the PS
  // to-hit bonus on top of the DX bonus.
  const dxToHit = Number(actor.gw?.toHitBonus ?? 0) || 0;
  const psToHit = Number(actor.gw?.meleeToHitBonus ?? 0) || 0;
  const attackBonus = dxToHit + psToHit;
  const attackBonusContributions = buildAttackBonusBreakdown({
    dxToHit, psToHit, closeRangeBonus: 0, rangePenalty: 0, rangeLabel: "melee"
  });
  const targetNumber = naturalAttackTarget(actor.system.details.level ?? 1, target.armorClass);

  // Phase 2b: preAttackRoll — veto-capable. Generic natural attack has
  // no weapon document.
  {
    const preRollContext = buildAttackContext({
      actor, token: sourceToken, weapon: null, target,
      range: { label: "melee", penalty: 0 },
      attackBonus, hitTarget: targetNumber,
      sourceKind: "natural",
      sourceName: actor.system.combat?.naturalAttack?.name || "Natural Attack"
    });
    if (!fireVetoHook(HOOK.preAttackRoll, { context: preRollContext })) return;
  }

  const roll = await new Roll("1d20 + @bonus", { bonus: attackBonus }).evaluate();
  const d20Value = roll.terms?.[0]?.total ?? roll.total;
  const isCritical = d20Value === 20;
  const isFumble = d20Value === 1;
  const hit = isCritical || (!isFumble && roll.total >= targetNumber);
  const attackName = actor.system.combat?.naturalAttack?.name || "Natural Attack";
  const baseFormula = actor.system.combat?.naturalAttack?.damage || "1d3";
  const psFlat = Number(actor.gw?.damageFlat ?? 0) || 0;
  const damageFormula = addFlatBonusToFormula(baseFormula, psFlat);
  const damageContributions = [{ label: "Base", value: baseFormula, signed: baseFormula }];
  if (psFlat) {
    damageContributions.push({
      label: "PS damage",
      value: psFlat,
      signed: psFlat > 0 ? `+${psFlat}` : `${psFlat}`
    });
  }

  const rollTooltip = await roll.getTooltip();

  const content = await renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/attack-card.hbs`,
    {
      actorName: actor.name,
      weaponName: attackName,
      attackerLevel: actor.system.details.level ?? 1,
      targetAc: target.armorClass,
      hitTarget: targetNumber,
      d20: d20Value,
      total: roll.total,
      hit,
      isCritical,
      isFumble,
      targetName: target.targetName,
      attackBonus,
      rangeLabel: "melee",
      rangePenalty: 0,
      distance: target.distance ?? 0,
      followUpLabel: "Roll Damage",
      showFollowUp: true,
      rollTooltip,
      rollFormula: roll.formula,
      attackBonusContributions,
      showAttackBonusBreakdown: attackBonusContributions.length > 0
    }
  );

  const attackFlags = {
    actorUuid: actor.uuid,
    weaponUuid: null,
    targetUuid: target.targetUuid,
    sourceTokenUuid: tokenDocumentUuid(sourceToken),
    targetTokenUuid: target.targetTokenUuid,
    targetAc: target.armorClass,
    targetNumber,
    hit,
    isCritical,
    isFumble,
    damageFormula,
    damageContributions,
    damageType: "physical",
    sourceName: attackName,
    sourceKind: "natural"
  };

  // AttackContext (Phase 2a) — no weapon doc on this path (generic
  // natural attack).
  const context = buildAttackContext({
    actor, token: sourceToken, weapon: null, target, roll,
    range: { label: "melee", penalty: 0 },
    attackBonus, hitTarget: targetNumber, hit, isCritical, isFumble,
    damageFormula, damageType: "physical",
    sourceKind: "natural", sourceName: attackName
  });

  fireAnnounceHook(HOOK.attackRollComplete, { context, roll });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: {
      [SYSTEM_ID]: {
        card: "attack",
        attack: attackFlags,
        context: serializeAttackContext(context)
      }
    }
  });

  if (hit && shouldAutoRollNpcDamage(actor)) {
    try {
      await rollDamageFromFlags(attackFlags);
    } catch (error) {
      console.warn(`${SYSTEM_ID} | auto-roll NPC damage failed`, error);
    }
  }
}

export async function rollDamageFromFlags(flags) {
  const actor = await resolveActorFromUuid(flags.actorUuid);
  if (!actor) return;
  const target = flags.targetUuid ? await resolveActorFromUuid(flags.targetUuid) : null;

  switch (flags.effectMode || "damage") {
    case "poison":
    case "radiation":
    case "mental": {
      if (!target) {
        ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Error.NoTarget"));
        return;
      }
      const intensity = await evaluateEffectFormula(flags.effectFormula || "0", actor, target, 0);
      await requestSaveResolution(target, flags.effectMode, {
        sourceName: flags.sourceName,
        intensity,
        inputLocked: true
      });
      return;
    }

    case "stun":
    case "paralysis": {
      if (!target) {
        ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Error.NoTarget"));
        return;
      }
      const statusId = flags.effectStatus || (flags.effectMode === "stun" ? "unconscious" : "paralysis");
      const baseDuration = await evaluateEffectFormula(flags.effectFormula || "0", actor, target, 0);
      const constitution = Number(target.system.attributes.cn.value ?? 0);
      const duration = Math.max(1, (Math.max(1, baseDuration) - constitution) * 10);
      await applyTemporaryEffect(target, {
        id: `${flags.sourceKind}:${flags.sourceName}:${flags.effectMode}`,
        label: `${flags.sourceName} ${flags.effectMode}`,
        mode: "generic",
        remainingRounds: duration,
        statusId,
        sourceName: flags.sourceName
      });
      const durationText = duration > 0 ? ` for ${Math.ceil(duration / 10)} minute(s)` : "";
      const notes = flags.effectNotes ? ` ${flags.effectNotes}` : "";
      await postAttackEffectMessage(actor, flags.sourceName, `${target.name} suffers ${flags.effectMode}${durationText}.${notes}`.trim());
      return;
    }

    case "death": {
      if (!target) {
        ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Error.NoTarget"));
        return;
      }
      if (actorHasForceField(target)) {
        await postAttackEffectMessage(actor, flags.sourceName, `${target.name} is protected by a force field.`);
        return;
      }
      await target.setHitPoints(0);
      await postAttackEffectMessage(actor, flags.sourceName, `${target.name} is slain instantly.${flags.effectNotes ? ` ${flags.effectNotes}` : ""}`);
      return;
    }

    case "note": {
      await postAttackEffectMessage(actor, flags.sourceName, flags.effectNotes || "Resolve this item's special effect manually.");
      return;
    }

    case "damage":
    default:
      break;
  }

  const sourceToken = await resolveTokenFromUuid(flags.sourceTokenUuid ?? null);
  const targetToken = await resolveTokenFromUuid(flags.targetTokenUuid ?? null);
  await game.gammaWorld?.animations?.playWeaponImpact?.({
    weaponName: flags.sourceName ?? "",
    sourceToken,
    targetToken
  });

  await createDamageCard({
    actor,
    sourceName: flags.sourceName,
    formula: flags.damageFormula || "1d6",
    damageType: flags.damageType || "",
    targetUuid: flags.targetUuid ?? null,
    targetUuids: flags.targetUuids ?? [],
    weaponTag: flags.weaponTag ?? "",
    nonlethal: !!flags.nonlethal,
    sourceUuid: flags.weaponUuid ?? flags.sourceUuid ?? null,
    sourceKind: flags.sourceKind ?? "weapon",
    isCritical: !!flags.isCritical,
    contributions: Array.isArray(flags.damageContributions) ? flags.damageContributions : null
  });
}

export async function promptAndResolveSave(actor, type, {
  sourceName = "",
  intensity = null,
  inputLocked = false
} = {}) {
  const selectedIntensity = await promptSaveInput(actor, type, {
    sourceName,
    intensity,
    inputLocked
  });
  if (selectedIntensity == null) {
    return {
      status: "canceled",
      actorUuid: actor?.uuid ?? null,
      actorName: actor?.name ?? "",
      type,
      sourceName
    };
  }
  return resolveHazardCard(actor, type, selectedIntensity, { sourceName });
}

export async function requestSaveResolution(actor, type, {
  sourceName = "",
  intensity = null,
  inputLocked = false
} = {}) {
  if (!actor) {
    return { status: "canceled", actorUuid: null, actorName: "", type, sourceName };
  }

  // Phase 2b: preSaveRoll — veto-capable. Macros may veto to substitute
  // an alternative save flow entirely.
  if (!fireVetoHook(HOOK.preSaveRoll, {
    actorUuid: actor.uuid, actorName: actor.name,
    type, sourceName, intensity, inputLocked
  })) {
    return { status: "canceled", actorUuid: actor.uuid, actorName: actor.name, type, sourceName };
  }

  const users = typeof game.users?.filter === "function"
    ? game.users.filter(() => true)
    : Array.from(game.users ?? []);
  const targetUserId = preferredSaveUserId(actor, users);
  if (!targetUserId) {
    ui.notifications?.error("No active player owner or GM is available to resolve that save.");
    return {
      status: "canceled",
      actorUuid: actor.uuid,
      actorName: actor.name,
      type,
      sourceName
    };
  }

  const options = {
    sourceName,
    intensity: intensity == null ? null : clampSaveScore(intensity),
    inputLocked
  };

  let result;
  if (targetUserId === game.user?.id) {
    result = await localSaveResolution(actor, type, options);
  } else {
    try {
      result = await runAsUser(targetUserId, "resolve-save", {
        actorUuid: actor.uuid,
        type,
        options
      }, {
        timeoutMs: 120000,
        timeoutMessage: `Timed out waiting for ${actor.name}'s ${saveTypeLabel(type).toLowerCase()} save.`
      });
      if (result?.status === "canceled") {
        ui.notifications?.info(`${actor.name}'s ${saveTypeLabel(type).toLowerCase()} save was canceled.`);
      }
    } catch (error) {
      ui.notifications?.error(error?.message ?? String(error));
      result = {
        status: "canceled",
        actorUuid: actor.uuid,
        actorName: actor.name,
        type,
        sourceName
      };
    }
  }

  // Phase 2b: saveResolved — announce with the outcome.
  fireAnnounceHook(HOOK.saveResolved, {
    actorUuid: actor.uuid, actorName: actor.name,
    type, sourceName, intensity, result
  });
  return result;
}

export async function rollAbilityCheck(actor, abilityKey, {
  sourceName = "",
  situationalModifier = 0,
  dc = null
} = {}) {
  const ability = actor?.system?.attributes?.[abilityKey];
  if (!ability) {
    ui.notifications?.warn("That ability roll is not available for this actor.");
    return {
      status: "canceled",
      actorUuid: actor?.uuid ?? null,
      actorName: actor?.name ?? "",
      abilityKey
    };
  }

  const formula = `1d20${labeledModifierTerm(ability.mod ?? 0, `${abilityLabel(abilityKey)} mod`)}${labeledModifierTerm(situationalModifier, "Situational")}`;
  const roll = await new Roll(formula).evaluate();
  const flavor = [
    sourceName ? foundry.utils.escapeHTML(sourceName) : "",
    `${abilityLabel(abilityKey)} check`,
    Number.isFinite(Number(dc)) ? `DC ${Math.round(Number(dc) || 0)}` : ""
  ].filter(Boolean).join(" &middot; ");

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor
  });

  return {
    status: "rolled",
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? "",
    abilityKey,
    total: roll.total,
    dc: Number.isFinite(Number(dc)) ? Math.round(Number(dc) || 0) : null
  };
}

export async function promptAndRollAbility(actor, abilityKey, options = {}) {
  if (!actor?.system?.attributes?.[abilityKey]) {
    return {
      status: "canceled",
      actorUuid: actor?.uuid ?? null,
      actorName: actor?.name ?? "",
      abilityKey
    };
  }

  const confirmed = await promptAbilityRoll(actor, abilityKey, options);
  if (confirmed == null) {
    return {
      status: "canceled",
      actorUuid: actor?.uuid ?? null,
      actorName: actor?.name ?? "",
      abilityKey
    };
  }

  return rollAbilityCheck(actor, abilityKey, options);
}

export async function requestAbilityRollResolution(actor, abilityKey, options = {}) {
  if (!actor) {
    return {
      status: "canceled",
      actorUuid: null,
      actorName: "",
      abilityKey
    };
  }

  const users = typeof game.users?.filter === "function"
    ? game.users.filter(() => true)
    : Array.from(game.users ?? []);
  const targetUserId = preferredSaveUserId(actor, users);
  if (!targetUserId) {
    ui.notifications?.error("No active player owner or GM is available to resolve that roll.");
    return {
      status: "canceled",
      actorUuid: actor.uuid,
      actorName: actor.name,
      abilityKey
    };
  }

  if (targetUserId === game.user?.id) {
    return promptAndRollAbility(actor, abilityKey, options);
  }

  try {
    const result = await runAsUser(targetUserId, "roll-ability", {
      actorUuid: actor.uuid,
      abilityKey,
      options
    }, {
      timeoutMs: 120000,
      timeoutMessage: `Timed out waiting for ${actor.name}'s ${abilityLabel(abilityKey).toLowerCase()} roll.`
    });
    if (result?.status === "canceled") {
      ui.notifications?.info(`${actor.name}'s ${abilityLabel(abilityKey).toLowerCase()} roll was canceled.`);
    }
    return result;
  } catch (error) {
    ui.notifications?.error(error?.message ?? String(error));
    return {
      status: "canceled",
      actorUuid: actor.uuid,
      actorName: actor.name,
      abilityKey
    };
  }
}

export async function rollMentalAttackCard({
  actor,
  sourceName,
  sourceUuid = null,
  targetUuid = null,
  damageFormula = "3d6",
  notes = "",
  showFollowUp = true,
  followUpLabel = "Roll Damage"
}) {
  const targetActor = targetUuid ? await resolveActorFromUuid(targetUuid) : primaryTarget()?.actor;
  if (!targetActor) {
    ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Error.NoTarget"));
    return false;
  }

  const save = await requestSaveResolution(targetActor, "mental", {
    sourceName,
    intensity: actor.gw?.mentalAttackStrength ?? actor.system.attributes.ms.value,
    inputLocked: true
  });
  if (save?.status !== "resolved" || save.success) return false;

  if (showFollowUp) {
    await createDamageCard({
      actor,
      sourceName,
      formula: damageFormula,
      damageType: "mental",
      targetUuid: targetActor.uuid,
      sourceUuid,
      sourceKind: "mutation",
      notes
    });
  }

  return true;
}

async function rollMentalSave(actor) {
  const context = saveContextForActor(actor, "mental");
  const rolls = [];
  if (!context.mentalImmune) {
    for (let index = 0; index < Math.max(1, context.attemptCount ?? 1); index += 1) {
      rolls.push(await new Roll("1d20").evaluate());
    }
  }

  const content = `<div class="gw-chat-card gw-save-card">
    <h3>${foundry.utils.escapeHTML(saveTypeLabel("mental"))} Save Roll</h3>
    <div class="gw-card-meta">${foundry.utils.escapeHTML(actor.name)}</div>
    <div class="gw-card-meta">Resistance: ${foundry.utils.escapeHTML(context.resistanceSummary)}</div>
    ${context.attemptLabel ? `<div class="gw-card-meta">Attempts: ${foundry.utils.escapeHTML(context.attemptLabel)}</div>` : ""}
    ${context.mentalImmune
      ? `<div class="gw-card-meta">Protected by total mental immunity.</div>`
      : `<div class="gw-card-meta">Rolls: ${rolls.map((roll) => roll.total).join(", ")}</div>`}
  </div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls
  });

  return {
    status: "rolled",
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? "",
    type: "mental",
    resistance: context.resistance,
    resistanceSummary: context.resistanceSummary,
    rollTotal: rolls[0]?.total ?? null,
    rollTotals: rolls.map((roll) => roll.total),
    attemptCount: context.attemptCount ?? 1,
    attemptSources: context.attemptSources ?? []
  };
}

export async function resolveHazardCard(actor, type, intensity, { sourceName = "" } = {}) {
  const normalizedIntensity = clampSaveScore(intensity ?? 10);
  const context = saveContextForActor(actor, type);
  let evaluation;
  const saveRolls = [];

  if ((type !== "mental") && actorHasHazardProtection(actor, type)) {
    evaluation = {
      kind: type,
      code: "*",
      targetNumber: null,
      resistance: context.resistance,
      intensity: normalizedIntensity,
      rollTotal: null,
      rollTotals: [],
      success: true,
      damageDice: 0,
      outcome: "Protected by shielding.",
      resistanceSummary: context.resistanceSummary,
      resistanceDetails: context.resistanceDetails,
      attemptCount: context.attemptCount ?? 1,
      attemptSources: context.attemptSources ?? [],
      attemptLabel: context.attemptLabel ?? "",
      result: { kind: type, outcome: "*" }
    };
  } else {
    evaluation = evaluateSaveForActor(actor, type, normalizedIntensity);
    if ((type === "mental") && (typeof evaluation.targetNumber === "number")) {
      for (let index = 0; index < Math.max(1, evaluation.attemptCount ?? 1); index += 1) {
        saveRolls.push(await new Roll("1d20").evaluate());
      }
      evaluation = evaluateSaveForActor(actor, type, normalizedIntensity, {
        rollTotals: saveRolls.map((roll) => roll.total)
      });
    }
  }

  let damageFormula = "";
  let damageTotal = 0;
  let damageRoll = null;
  if (Number.isInteger(evaluation.damageDice) && evaluation.damageDice > 0) {
    damageFormula = `${evaluation.damageDice}d6`;
    damageRoll = await new Roll(damageFormula).evaluate();
    damageTotal = damageRoll.total;
  }

  // Combine per-save-attempt tooltips + damage tooltip (if any) for the
  // click-to-expand breakdown on the card.
  const rollTooltipParts = [];
  for (const roll of saveRolls) {
    rollTooltipParts.push(await roll.getTooltip());
  }
  if (damageRoll) rollTooltipParts.push(await damageRoll.getTooltip());
  const rollTooltip = rollTooltipParts.join("");
  const rollFormula = [
    ...saveRolls.map((r) => r.formula),
    damageRoll ? `${damageFormula} = ${damageTotal}` : null
  ].filter(Boolean).join(" | ");

  const content = await renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/save-card.hbs`,
    {
      actorName: actor.name,
      type,
      typeLabel: saveTypeLabel(type),
      resistance: evaluation.resistance,
      resistanceSummary: evaluation.resistanceSummary ?? "",
      intensity: evaluation.intensity,
      target: evaluation.code ?? "—",
      targetLabel: typeof evaluation.targetNumber === "number" ? `${evaluation.targetNumber}+ on 1d20` : "",
      rollLabel: evaluation.rollTotals?.length ? evaluation.rollTotals.join(", ") : "",
      attemptLabel: evaluation.attemptLabel ?? "",
      success: !!evaluation.success,
      outcome: evaluation.outcome,
      damageFormula,
      damageTotal,
      sourceName,
      rollTooltip,
      rollFormula
    }
  );

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [...saveRolls, damageRoll].filter(Boolean),
    flags: {
      [SYSTEM_ID]: {
        card: "hazard",
        hazard: {
          actorUuid: actor.uuid,
          type,
          result: evaluation.result,
          targetNumber: evaluation.targetNumber ?? null,
          rollTotal: evaluation.rollTotal ?? null,
          rollTotals: evaluation.rollTotals ?? [],
          success: !!evaluation.success,
          outcome: evaluation.outcome,
          intensity: evaluation.intensity,
          resistance: evaluation.resistance,
          resistanceSummary: evaluation.resistanceSummary ?? "",
          attemptCount: evaluation.attemptCount ?? 1,
          attemptSources: evaluation.attemptSources ?? [],
          code: evaluation.code ?? null,
          damageFormula,
          damageTotal
        }
      }
    }
  });

  return {
    status: "resolved",
    actorUuid: actor.uuid,
    actorName: actor.name,
    type,
    sourceName,
    resistance: evaluation.resistance,
    resistanceSummary: evaluation.resistanceSummary ?? "",
    intensity: evaluation.intensity,
    targetNumber: evaluation.targetNumber ?? null,
    rollTotal: evaluation.rollTotal ?? null,
    rollTotals: evaluation.rollTotals ?? [],
    success: !!evaluation.success,
    outcome: evaluation.outcome,
    code: evaluation.code ?? null,
    attemptCount: evaluation.attemptCount ?? 1,
    attemptSources: evaluation.attemptSources ?? [],
    damageFormula,
    damageTotal,
    messageId: message?.id ?? null,
    result: evaluation.result
  };
}

export async function rollSave(actor, type) {
  if (type === "mental") {
    return rollMentalSave(actor);
  }

  return promptAndResolveSave(actor, type);
}

export async function resolveHazardDamage(flags) {
  if (!flags?.damageTotal) return;
  await applyDamageToTargets(flags.damageTotal, 1, {
    targetUuid: flags.actorUuid,
    damageType: flags.type,
    sourceName: flags.type
  });
}

export async function resolveHazardLethal(flags) {
  const actor = await resolveActorFromUuid(flags.actorUuid);
  if (!actor) return;

  if (flags.type === "poison") {
    await actor.setHitPoints(0);
    return;
  }

  if (flags.type === "radiation") {
    const roll = await new Roll("1d100").evaluate();
    if (roll.total <= 20) {
      await grantRandomMutation(actor, { defectOnly: true });
      return "defect";
    }
    await actor.setHitPoints(0);
  }
}

export async function grantRandomMutation(actor, { defectOnly = false } = {}) {
  const [{ mutationEntriesFor }, { buildMutationItemSource }] = await Promise.all([
    import("./tables/mutation-tables.mjs"),
    import("./mutations.mjs")
  ]);

  const characterType = actor.system.details.type === "psh" ? "humanoid" : actor.system.details.type;
  const subtype = Math.random() < 0.5 ? "physical" : "mental";
  const pool = mutationEntriesFor(subtype, characterType, { beneficialOnly: !defectOnly })
    .filter((entry) => defectOnly ? entry.category === "defect" : entry.category !== "defect");

  const entry = pool[Math.floor(Math.random() * pool.length)];
  if (!entry) return null;

  const [created] = await actor.createEmbeddedDocuments("Item", [buildMutationItemSource(entry)]);
  await actor.refreshDerivedResources({ adjustCurrent: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card"><h3>${defectOnly ? "Mutational Defect" : "New Mutation"}</h3><p>${actor.name} gains <strong>${created.name}</strong>.</p></div>`
  });
  return created;
}

export async function resolveHazardMutation(flags) {
  const actor = await resolveActorFromUuid(flags.actorUuid);
  if (!actor) return null;
  return grantRandomMutation(actor, { defectOnly: false });
}

export async function rollScaledDamageCard({
  actor,
  sourceName,
  baseFormula,
  multiplier = 1,
  targetUuid = null,
  targetUuids = [],
  damageType = "",
  notes = ""
}) {
  return createDamageCard({
    actor,
    sourceName,
    formula: scaleFormula(baseFormula, multiplier),
    targetUuid,
    targetUuids,
    damageType,
    notes,
    sourceKind: "mutation"
  });
}
