import {
  moraleLairBonus,
  moraleResult,
  moraleThreshold,
  reactionResult,
  resolveEncounterIntelligence,
  routeEncounterResult,
  surpriseEntry,
  terrainEncounterEntry,
  typeReactionAdjustment
} from "./tables/encounter-tables.mjs";
import { actorDexterityForInitiative, initiativeBonusFromDexterity } from "./initiative.mjs";
import { applyTemporaryEffect, removeTemporaryEffect } from "./effect-state.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

async function renderTemplate(path, data) {
  return foundry.applications.handlebars.renderTemplate(path, data);
}

function actorNameList(actors) {
  return actors.map((actor) => actor?.name ?? "Unknown").join(", ");
}

function actorsFromTargets() {
  return [...(game.user?.targets ?? new Set())]
    .map((token) => token.actor)
    .filter(Boolean);
}

function actorsFromControlledTokens() {
  return (canvas.tokens?.controlled ?? [])
    .map((token) => token.actor)
    .filter(Boolean);
}

function actorType(actor) {
  return actor?.system?.details?.type ?? "humanoid";
}

function initiativeBonus(actors) {
  return actors.some((actor) => initiativeBonusFromDexterity(actorDexterityForInitiative(actor))) ? 1 : 0;
}

function surpriseModifier(actors) {
  return actors.reduce((sum, actor) => sum + Math.round(Number(actor?.system?.encounter?.surpriseModifier ?? 0)), 0);
}

function cannotBeSurprised(actors) {
  return actors.some((actor) => actor?.system?.encounter?.cannotBeSurprised);
}

function terrainLabel(terrain) {
  const key = CONFIG.GAMMA_WORLD.ENCOUNTER_TERRAINS?.[terrain];
  return key ? game.i18n.localize(key) : terrain;
}

function routePeriodLabel(period) {
  const key = CONFIG.GAMMA_WORLD.ROUTE_PERIODS?.[period];
  return key ? game.i18n.localize(key) : period;
}

function intelligenceLabel(intelligence) {
  const key = CONFIG.GAMMA_WORLD.ENCOUNTER_INTELLIGENCE?.[intelligence];
  return key ? game.i18n.localize(key) : intelligence;
}

function halfHitPoints(actor) {
  return Number(actor?.system?.resources?.hp?.value ?? 0) < (Number(actor?.system?.resources?.hp?.max ?? 0) / 2);
}

async function evaluateRoll(formula, providedTotal = null) {
  if (providedTotal != null) {
    return {
      total: Math.round(Number(providedTotal) || 0),
      formula
    };
  }
  return new Roll(formula).evaluate();
}

async function rollFirstStrikeTieBreaker(actorGroup, targetGroup) {
  const actorBonus = initiativeBonus(actorGroup);
  const targetBonus = initiativeBonus(targetGroup);

  let actorRoll;
  let targetRoll;
  do {
    actorRoll = await new Roll("1d6 + @bonus", { bonus: actorBonus }).evaluate();
    targetRoll = await new Roll("1d6 + @bonus", { bonus: targetBonus }).evaluate();
  } while (actorRoll.total === targetRoll.total);

  return {
    actorRoll,
    targetRoll,
    actorBonus,
    targetBonus
  };
}

function encounterSpeaker(actor) {
  return ChatMessage.getSpeaker({ actor: actor ?? null });
}

function moraleWatchId(actor) {
  return `morale-watch:${actor.id}`;
}

function moraleEffectData(actor, {
  manualModifier = 0,
  defendingLair = false,
  lairYoung = false,
  reason = ""
} = {}) {
  return {
    id: moraleWatchId(actor),
    label: game.i18n.localize("GAMMA_WORLD.Encounter.MoraleWatch"),
    mode: "morale-watch",
    sourceName: game.i18n.localize("GAMMA_WORLD.Encounter.Morale"),
    notes: reason || "",
    changes: {
      manualModifier: Math.round(Number(manualModifier) || 0),
      defendingLair: !!defendingLair,
      lairYoung: !!lairYoung
    }
  };
}

function moraleEvaluation(actor, {
  rollTotal,
  manualModifier = 0,
  defendingLair = false,
  lairYoung = false,
  reason = ""
} = {}) {
  const intelligence = resolveEncounterIntelligence(actor);
  const threshold = moraleThreshold(intelligence);
  const actorModifier = Math.round(Number(actor?.system?.encounter?.morale ?? actor?.gw?.moraleModifier ?? 0));
  const lairBonus = moraleLairBonus(intelligence, { defendingLair, lairYoung });
  const modifier = actorModifier + Math.round(Number(manualModifier) || 0) + lairBonus;
  const total = Math.round(Number(rollTotal) || 0) + modifier;
  const outcome = moraleResult(total, threshold);

  return {
    actor,
    intelligence,
    threshold,
    actorModifier,
    manualModifier: Math.round(Number(manualModifier) || 0),
    lairBonus,
    modifier,
    total,
    continues: outcome.continues,
    resultKey: outcome.key,
    reason: reason || (halfHitPoints(actor) ? game.i18n.localize("GAMMA_WORLD.Encounter.BelowHalfHp") : ""),
    defendingLair: !!defendingLair,
    lairYoung: !!lairYoung
  };
}

async function createEncounterMessage({
  speakerActor = null,
  rolls = [],
  type,
  payload,
  contentData
}) {
  const content = await renderTemplate("systems/gamma-world-1e/templates/chat/encounter-card.hbs", contentData);
  await ChatMessage.create({
    speaker: encounterSpeaker(speakerActor),
    content,
    rolls: rolls.filter((roll) => roll?.constructor?.name === "Roll"),
    flags: {
      "gamma-world-1e": {
        card: "encounter",
        encounter: {
          type,
          ...payload
        }
      }
    }
  });
}

async function performMoraleCheck(actor, {
  speakerActor = null,
  roll = null,
  manualModifier = 0,
  defendingLair = false,
  lairYoung = false,
  reason = "",
  ongoing = false
} = {}) {
  const rollResult = await evaluateRoll("1d10", roll);
  const details = moraleEvaluation(actor, {
    rollTotal: rollResult.total,
    manualModifier,
    defendingLair,
    lairYoung,
    reason
  });

  await createEncounterMessage({
    speakerActor: speakerActor ?? actor,
    rolls: [rollResult],
    type: "morale",
    payload: {
      actorUuid: actor?.uuid ?? null,
      roll: rollResult.total,
      total: details.total,
      threshold: details.threshold,
      modifier: details.modifier,
      result: details.resultKey,
      intelligence: details.intelligence,
      ongoing
    },
    contentData: {
      type: "morale",
      actorName: actor?.name ?? "Unknown",
      rollTotal: rollResult.total,
      total: details.total,
      threshold: details.threshold,
      modifier: details.modifier,
      actorModifier: details.actorModifier,
      manualModifier: details.manualModifier,
      lairBonus: details.lairBonus,
      intelligenceLabel: intelligenceLabel(details.intelligence),
      reason: details.reason,
      ongoing,
      continues: details.continues,
      result: details.continues
        ? game.i18n.localize("GAMMA_WORLD.Encounter.MoraleContinue")
        : game.i18n.localize("GAMMA_WORLD.Encounter.MoraleFlee")
    }
  });

  return {
    ...details,
    roll: rollResult
  };
}

function defaultMoraleTargets(actor, targetActors = []) {
  if (targetActors.length) return targetActors;
  const targets = actorsFromTargets();
  if (targets.length) return targets;
  const controlled = actorsFromControlledTokens();
  if (controlled.length) return controlled;
  return actor ? [actor] : [];
}

export async function rollReaction(actor, { targetActors = actorsFromTargets(), offerModifier = 0, manualModifier = 0 } = {}) {
  const target = targetActors[0] ?? null;
  const totalModifier =
    Math.round(Number(actor?.gw?.reactionAdjustment ?? actor?.system?.encounter?.reactionModifier ?? 0))
    + typeReactionAdjustment(actorType(actor), actorType(target))
    + Math.round(Number(offerModifier) || 0)
    + Math.round(Number(manualModifier) || 0);

  const roll = await new Roll("2d6 + @modifier", { modifier: totalModifier }).evaluate();
  const result = reactionResult(roll.total);

  await createEncounterMessage({
    speakerActor: actor,
    rolls: [roll],
    type: "reaction",
    payload: {
      actorUuid: actor?.uuid ?? null,
      targetUuid: target?.uuid ?? null,
      total: roll.total,
      modifier: totalModifier,
      result: result.key
    },
    contentData: {
      type: "reaction",
      actorName: actor?.name ?? "Unknown",
      targetName: target?.name ?? "Unknown",
      rollTotal: roll.total,
      baseRoll: roll.terms?.[0]?.total ?? roll.total,
      modifier: totalModifier,
      result: game.i18n.localize(`GAMMA_WORLD.Encounter.ReactionResult.${result.key}`)
    }
  });

  return { roll, result, modifier: totalModifier };
}

export async function rollSurprise(sideAActors, sideBActors = actorsFromTargets()) {
  const actorGroup = Array.isArray(sideAActors) ? sideAActors.filter(Boolean) : [sideAActors].filter(Boolean);
  const targetGroup = Array.isArray(sideBActors) ? sideBActors.filter(Boolean) : [sideBActors].filter(Boolean);
  if (!actorGroup.length || !targetGroup.length) {
    ui.notifications?.warn("Select at least one opponent before rolling surprise.");
    return null;
  }

  const actorRoll = await new Roll("1d6").evaluate();
  const targetRoll = await new Roll("1d6").evaluate();
  const actorSurprised = !cannotBeSurprised(actorGroup) && ((actorRoll.total + surpriseModifier(actorGroup)) <= 2);
  const targetSurprised = !cannotBeSurprised(targetGroup) && ((targetRoll.total + surpriseModifier(targetGroup)) <= 2);

  let firstStrike = "simultaneous";
  let tieBreaker = "";
  if (actorSurprised && !targetSurprised) firstStrike = "target";
  else if (!actorSurprised && targetSurprised) firstStrike = "actor";
  else {
    const actorInitiative = actorRoll.total + initiativeBonus(actorGroup);
    const targetInitiative = targetRoll.total + initiativeBonus(targetGroup);
    if (actorInitiative > targetInitiative) firstStrike = "actor";
    else if (targetInitiative > actorInitiative) firstStrike = "target";
    else {
      const reroll = await rollFirstStrikeTieBreaker(actorGroup, targetGroup);
      firstStrike = reroll.actorRoll.total > reroll.targetRoll.total ? "actor" : "target";
      tieBreaker = `${actorNameList(actorGroup)} ${reroll.actorRoll.terms?.[0]?.total ?? reroll.actorRoll.total}${reroll.actorBonus ? ` + ${reroll.actorBonus}` : ""} vs ${actorNameList(targetGroup)} ${reroll.targetRoll.terms?.[0]?.total ?? reroll.targetRoll.total}${reroll.targetBonus ? ` + ${reroll.targetBonus}` : ""}`;
    }
  }

  await createEncounterMessage({
    speakerActor: actorGroup[0],
    rolls: [actorRoll, targetRoll],
    type: "surprise",
    payload: {
      actor: surpriseEntry({ side: "actor", roll: actorRoll.total, surprised: actorSurprised, firstStrike: firstStrike === "actor" }),
      target: surpriseEntry({ side: "target", roll: targetRoll.total, surprised: targetSurprised, firstStrike: firstStrike === "target" })
    },
    contentData: {
      type: "surprise",
      actorName: actorNameList(actorGroup),
      targetName: actorNameList(targetGroup),
      actorRoll: actorRoll.total,
      targetRoll: targetRoll.total,
      actorSurprised,
      targetSurprised,
      tieBreaker,
      firstStrike: firstStrike === "actor"
        ? `${actorNameList(actorGroup)}: ${game.i18n.localize("GAMMA_WORLD.Encounter.FirstStrike")}`
        : firstStrike === "target"
          ? `${actorNameList(targetGroup)}: ${game.i18n.localize("GAMMA_WORLD.Encounter.FirstStrike")}`
          : game.i18n.localize("GAMMA_WORLD.Encounter.Simultaneous")
    }
  });

  return {
    actorRoll,
    targetRoll,
    actorSurprised,
    targetSurprised,
    firstStrike,
    tieBreaker
  };
}

export async function rollTerrainEncounter(actor, { terrain, roll = null } = {}) {
  const encounterRoll = await evaluateRoll("1d20", roll);
  const entry = terrainEncounterEntry(terrain, encounterRoll.total);
  if (!entry) {
    ui.notifications?.warn("Choose a terrain before rolling on the encounter table.");
    return null;
  }

  const candidateText = entry.candidates.length ? entry.candidates.join(", ") : "";
  await createEncounterMessage({
    speakerActor: actor,
    rolls: [encounterRoll],
    type: "terrain",
    payload: {
      terrain: entry.terrain,
      roll: encounterRoll.total,
      name: entry.name
    },
    contentData: {
      type: "terrain",
      terrain: terrainLabel(entry.terrain),
      rollTotal: encounterRoll.total,
      resultName: entry.name,
      countText: entry.countText,
      notes: entry.notes,
      candidateText,
      noEncounter: entry.noEncounter
    }
  });

  return { roll: encounterRoll, entry };
}

export async function checkRouteEncounter(actor, {
  terrain,
  period = "day",
  checkRoll = null,
  encounterRoll = null
} = {}) {
  const routeRoll = await evaluateRoll("1d6", checkRoll);
  const evaluated = routeEncounterResult(terrain, {
    checkRoll: routeRoll.total,
    period
  });
  if (!evaluated.terrain) {
    ui.notifications?.warn("Choose a terrain before checking for route encounters.");
    return null;
  }

  let encounterResult = null;
  let encounterResultRoll = null;
  if (evaluated.encountered) {
    encounterResultRoll = await evaluateRoll("1d20", encounterRoll);
    encounterResult = terrainEncounterEntry(evaluated.terrain, encounterResultRoll.total);
  }

  const candidateText = encounterResult?.candidates?.length ? encounterResult.candidates.join(", ") : "";
  await createEncounterMessage({
    speakerActor: actor,
    rolls: [routeRoll, encounterResultRoll].filter(Boolean),
    type: "route",
    payload: {
      terrain: evaluated.terrain,
      period: evaluated.period,
      checkRoll: routeRoll.total,
      encountered: evaluated.encountered,
      encounterRoll: encounterResultRoll?.total ?? null,
      name: encounterResult?.name ?? ""
    },
    contentData: {
      type: "route",
      terrain: terrainLabel(evaluated.terrain),
      period: routePeriodLabel(evaluated.period),
      checkRoll: routeRoll.total,
      encountered: evaluated.encountered,
      encounterRoll: encounterResultRoll?.total ?? 0,
      resultName: encounterResult?.name ?? "",
      countText: encounterResult?.countText ?? "",
      notes: encounterResult?.notes ?? "",
      routeTimeNote: game.i18n.localize("GAMMA_WORLD.Encounter.RouteTimeNote"),
      candidateText,
      noEncounter: encounterResult?.noEncounter ?? false
    }
  });

  return {
    checkRoll: routeRoll,
    encountered: evaluated.encountered,
    encounterRoll: encounterResultRoll,
    encounter: encounterResult
  };
}

export async function rollMorale(actor, {
  targetActors = [],
  roll = null,
  manualModifier = 0,
  defendingLair = false,
  lairYoung = false,
  reason = "",
  track = true
} = {}) {
  const targets = defaultMoraleTargets(actor, Array.isArray(targetActors) ? targetActors.filter(Boolean) : [targetActors].filter(Boolean));
  if (!targets.length) {
    ui.notifications?.warn("Select a target, control a token, or use a sheet actor before rolling morale.");
    return null;
  }

  const results = [];
  for (const target of targets) {
    const result = await performMoraleCheck(target, {
      speakerActor: actor ?? target,
      roll,
      manualModifier,
      defendingLair,
      lairYoung,
      reason
    });
    results.push(result);

    if (result.continues && track) {
      await applyTemporaryEffect(target, moraleEffectData(target, {
        manualModifier,
        defendingLair,
        lairYoung,
        reason: result.reason
      }));
    } else if (!result.continues) {
      await removeTemporaryEffect(target, moraleWatchId(target)).catch(() => null);
    }
  }

  return results.length === 1 ? results[0] : results;
}

export async function continueMoraleWatch(actor, effect, { roll = null } = {}) {
  if (!actor || !effect) return null;
  return performMoraleCheck(actor, {
    speakerActor: actor,
    roll,
    manualModifier: Math.round(Number(effect.changes?.manualModifier) || 0),
    defendingLair: !!effect.changes?.defendingLair,
    lairYoung: !!effect.changes?.lairYoung,
    reason: effect.notes || "",
    ongoing: true
  });
}

export async function promptEncounterTerrain({
  title,
  includePeriod = false,
  initialTerrain = "clear",
  initialPeriod = "day"
} = {}) {
  return DialogV2.prompt({
    window: { title },
    content: `<form>
      <label>${game.i18n.localize("GAMMA_WORLD.Encounter.TerrainLabel")}
        <select name="terrain">
          ${Object.entries(CONFIG.GAMMA_WORLD.ENCOUNTER_TERRAINS ?? {}).map(([key, label]) => `
            <option value="${key}" ${key === initialTerrain ? "selected" : ""}>${game.i18n.localize(label)}</option>
          `).join("")}
        </select>
      </label>
      ${includePeriod ? `
        <label>${game.i18n.localize("GAMMA_WORLD.Encounter.Route.Period")}
          <select name="period">
            ${Object.entries(CONFIG.GAMMA_WORLD.ROUTE_PERIODS ?? {}).map(([key, label]) => `
              <option value="${key}" ${key === initialPeriod ? "selected" : ""}>${game.i18n.localize(label)}</option>
            `).join("")}
          </select>
        </label>
      ` : ""}
    </form>`,
    ok: {
      label: game.i18n.localize("GAMMA_WORLD.Button.Use"),
      callback: (_event, button) => {
        const data = new foundry.applications.ux.FormDataExtended(button.form).object;
        return {
          terrain: data.terrain || initialTerrain,
          period: data.period || initialPeriod
        };
      }
    },
    rejectClose: false
  });
}
