import { SYSTEM_ID } from "./config.mjs";
import { runAsGM } from "./gm-executor.mjs";
import {
  artifactData,
  artifactDisplayName,
  artifactDisplayCondition,
  artifactElapsedMinutes,
  artifactFunctionPercent,
  artifactHarmMetadata,
  artifactUseProfileForChart,
  formatArtifactElapsedMinutes,
  itemIsArtifact
} from "./artifact-rules.mjs";
import {
  artifactChartConfig,
  artifactChartFinishNode,
  artifactChartHarmNode,
  artifactChartNodeId,
  artifactChartStartNode,
  normalizeArtifactChartId,
  resolveArtifactChartStep
} from "./tables/artifact-flowcharts.mjs";
import {
  artifactSessionSnapshot,
  clearArtifactSessionSnapshot,
  setArtifactSessionSnapshot
} from "./artifact-session-store.mjs";

const SOCKET_NAME = `system.${SYSTEM_ID}`;
const FLAG_KEY = `flags.${SYSTEM_ID}.artifactSession`;
const openRequests = new Set();

function activeGmIds() {
  return game.users
    .filter((user) => user.active && user.isGM)
    .map((user) => user.id)
    .sort((a, b) => a.localeCompare(b));
}

function primaryGmId() {
  return activeGmIds()[0] ?? null;
}

function isPrimaryGm() {
  return !!game.user?.isGM && (primaryGmId() === game.user.id);
}

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function gmRecipientIds() {
  return game.users.filter((user) => user.isGM).map((user) => user.id);
}

function operatorNameFor(userId) {
  return game.users.get(userId)?.name ?? game.user?.name ?? game.i18n.localize("GAMMA_WORLD.Artifact.Session.UnknownOperator");
}

async function renderTemplate(path, data) {
  return foundry.applications.handlebars.renderTemplate(path, data);
}

async function resolveDocumentItem(itemOrUuid) {
  if (!itemOrUuid) return null;
  if (typeof itemOrUuid !== "string") return itemOrUuid;
  return fromUuid(itemOrUuid);
}

async function resolveOwnedItem(itemOrUuid) {
  const item = await resolveDocumentItem(itemOrUuid);
  if (!item || (item.documentName !== "Item" && !(item instanceof Item))) return null;
  return item;
}

function actorFromItem(item, fallbackActor = null) {
  if (fallbackActor) return fallbackActor;
  if (item?.parent instanceof Actor) return item.parent;
  return item?.actorOwner ?? null;
}

function sessionFlag(item) {
  return item?.flags?.[SYSTEM_ID]?.artifactSession ?? item?.getFlag?.(SYSTEM_ID, "artifactSession") ?? null;
}

async function updateSessionFlag(item, session) {
  return item.update({ [FLAG_KEY]: session }, { gammaWorldSync: true });
}

async function clearSessionFlag(item) {
  return item.update({ [`flags.${SYSTEM_ID}.-=artifactSession`]: null }, { gammaWorldSync: true });
}

function createAuditEntry(type, text, extra = {}) {
  return {
    type,
    text,
    timestamp: nowIso(),
    ...extra
  };
}

function emptyHiddenState(item) {
  return {
    functionCheckRolled: false,
    functionCheck: null,
    secondaryMishapCheck: null,
    observableOutcome: null,
    harmResolution: null,
    pendingHarmResolution: false,
    functionChance: artifactFunctionPercent(item),
    condition: artifactDisplayCondition(item),
    lastCause: "",
    resolvedAt: null
  };
}

function buildSession(actor, item, { operatorUserId = game.user?.id ?? "", helperCount = 0 } = {}) {
  const chartId = normalizeArtifactChartId(artifactData(item).chart || "A");
  const profile = artifactUseProfileForChart(actor, chartId);
  const createdAt = nowIso();
  return {
    sessionId: foundry.utils.randomID(),
    itemUuid: item.uuid,
    actorUuid: actor?.uuid ?? null,
    actorName: actor?.name ?? "",
    chartId,
    operatorUserId,
    operatorName: operatorNameFor(operatorUserId),
    currentNode: artifactChartStartNode(chartId),
    path: [],
    rollsThisAttempt: 0,
    helperCount: Math.max(0, Math.round(Number(helperCount) || 0)),
    elapsedMinutes: 0,
    rollModifier: profile.modifier,
    speedMultiplier: profile.speedMultiplier,
    modifierSummary: [...profile.notes],
    resolved: false,
    result: null,
    latestRoll: null,
    publicOutcome: "",
    revealCondition: false,
    revealHidden: false,
    startedAt: createdAt,
    updatedAt: createdAt,
    auditLog: [
      createAuditEntry("started", `${operatorNameFor(operatorUserId)} begins identifying ${item.name}.`, {
        userId: operatorUserId
      })
    ],
    gmHidden: emptyHiddenState(item)
  };
}

function sanitizedPath(path = []) {
  return path.map((step) => ({
    step: Number(step.step ?? 0),
    rawRoll: Number(step.rawRoll ?? 0),
    modifier: Number(step.modifier ?? 0),
    adjustedRoll: Number(step.adjustedRoll ?? 0),
    from: String(step.from ?? ""),
    to: String(step.to ?? ""),
    note: String(step.note ?? ""),
    transitionLabel: String(step.transitionLabel ?? ""),
    returnAlias: String(step.returnAlias ?? ""),
    timestamp: String(step.timestamp ?? "")
  }));
}

export function sanitizeArtifactSession(item, session) {
  if (!item || !session) return null;
  return {
    sessionId: String(session.sessionId ?? ""),
    itemUuid: item.uuid,
    actorUuid: session.actorUuid ?? actorFromItem(item)?.uuid ?? null,
    itemName: artifactDisplayName(item),
    actorName: session.actorName ?? actorFromItem(item)?.name ?? "",
    chartId: normalizeArtifactChartId(session.chartId),
    operatorUserId: String(session.operatorUserId ?? ""),
    operatorName: String(session.operatorName ?? operatorNameFor(session.operatorUserId)),
    currentNode: artifactChartNodeId(session.chartId, session.currentNode),
    path: sanitizedPath(session.path),
    rollsThisAttempt: Math.max(0, Number(session.rollsThisAttempt ?? 0)),
    helperCount: Math.max(0, Number(session.helperCount ?? 0)),
    elapsedMinutes: Math.max(0, Number(session.elapsedMinutes ?? 0)),
    elapsedLabel: formatArtifactElapsedMinutes(session.elapsedMinutes ?? 0),
    resolved: !!session.resolved,
    result: session.result ?? null,
    latestRoll: session.latestRoll ? sanitizedPath([session.latestRoll])[0] : null,
    rollModifier: Number(session.rollModifier ?? 0),
    speedMultiplier: Number(session.speedMultiplier ?? 1),
    modifierSummary: Array.isArray(session.modifierSummary) ? [...session.modifierSummary] : [],
    publicOutcome: String(session.publicOutcome ?? ""),
    revealCondition: !!session.revealCondition,
    condition: session.revealCondition ? artifactDisplayCondition(item) : "",
    updatedAt: String(session.updatedAt ?? session.startedAt ?? ""),
    startedAt: String(session.startedAt ?? "")
  };
}

function setLocalSnapshot(item, session) {
  const snapshot = sanitizeArtifactSession(item, session);
  if (snapshot) setArtifactSessionSnapshot(snapshot);
  return snapshot;
}

async function openArtifactApp(itemUuid, { snapshot = null, focus = true } = {}) {
  const mod = await import("./artifact-flowchart-app.mjs");
  return mod.openArtifactSessionApp(itemUuid, { snapshot, focus });
}

function emitArtifactSocket(message) {
  game.socket.emit(SOCKET_NAME, {
    kind: "artifact-session",
    ...message
  });
}

function broadcastArtifactSnapshot(type, snapshot, { recipientId = null } = {}) {
  emitArtifactSocket({
    type,
    recipientId,
    itemUuid: snapshot?.itemUuid ?? null,
    snapshot
  });
}

function broadcastArtifactClose(itemUuid) {
  emitArtifactSocket({
    type: "close",
    itemUuid
  });
}

function requestSnapshotFromGm(itemUuid) {
  emitArtifactSocket({
    type: "snapshot-request",
    itemUuid,
    requesterId: game.user?.id ?? null
  });
}

async function postArtifactChat(actor, item, heading, body, { rolls = [], whisper = [] } = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card gw-artifact-chat"><h3>${escapeHtml(heading)}</h3>${body}</div>`,
    rolls,
    whisper
  });
}

async function postArtifactRollChat(actor, item, session, step) {
  const chartNodeLabels = artifactChartConfig(session.chartId).aliases;
  const aliasLabel = (nodeId) => {
    const entry = Object.entries(chartNodeLabels).find(([_alias, value]) => String(value) === String(nodeId));
    return entry?.[0] ?? String(nodeId);
  };
  const modifier = Number(step.modifier ?? 0);
  const modifierLabel = modifier > 0 ? `+${modifier}` : `${modifier}`;
  const noteLabel = step.note === "return"
    ? game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Return")
    : step.note === "success"
      ? game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Success")
      : step.note === "harm"
        ? game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Harm")
        : step.note === "loop"
          ? game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Loop")
          : game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Advance");

  const content = [
    `<p><strong>${escapeHtml(artifactDisplayName(item))}</strong> · ${escapeHtml(session.operatorName)} · Chart ${escapeHtml(session.chartId)}</p>`,
    `<p>#${step.step} · raw ${step.rawRoll} · mod ${modifierLabel} · adj ${step.adjustedRoll} · ${escapeHtml(aliasLabel(step.from))} → ${escapeHtml(aliasLabel(step.to))} · ${escapeHtml(noteLabel.toLowerCase())}</p>`
  ].join("");

  await postArtifactChat(actor, item, game.i18n.localize("GAMMA_WORLD.Artifact.Session.RollHeading"), content);
}

function artifactHarmDescriptor(item, actor, mode = "function") {
  const metadata = artifactHarmMetadata(item);
  const fallbackTarget = actor?.uuid ?? null;
  const baseFormula = item?.system?.damage?.formula || item?.system?.action?.damageFormula || "";
  const descriptor = {
    type: metadata.harmResolutionType,
    formula: baseFormula,
    targetUuid: fallbackTarget,
    targetUuids: fallbackTarget ? [fallbackTarget] : [],
    publicMessage: game.i18n.localize("GAMMA_WORLD.Artifact.Session.Public.Burst"),
    notes: `${item.name} artifact mishap`,
    damageType: item?.type === "weapon"
      ? (item.system.damage?.type || "energy")
      : "artifact"
  };

  switch (metadata.harmResolutionType) {
    case "explosion":
      descriptor.formula ||= "3d6";
      descriptor.damageType = "explosion";
      break;
    case "weapon-feedback":
      descriptor.formula ||= "2d6";
      break;
    case "armor-feedback":
      descriptor.formula ||= "2d6";
      descriptor.damageType = "shock";
      break;
    case "vehicle-incident":
      descriptor.formula ||= "3d6";
      descriptor.damageType = "collision";
      break;
    case "robot-incident":
      descriptor.formula ||= "2d6";
      descriptor.damageType = "impact";
      break;
    case "medical-incident":
      descriptor.formula ||= "1d6";
      descriptor.damageType = "biological";
      break;
    case "life-ray":
      descriptor.formula ||= "2d6";
      descriptor.damageType = "energy";
      break;
    case "portent":
      descriptor.formula ||= "2d6";
      descriptor.damageType = "energy";
      break;
    case "energy-discharge":
    default:
      descriptor.formula ||= mode === "short-circuit" ? "1d6" : "2d6";
      descriptor.damageType = "energy";
      break;
  }

  return descriptor;
}

async function postArtifactDamageWhisper(actor, item, descriptor) {
  if (!descriptor?.formula || !actor?.uuid) return null;
  const roll = await new Roll(descriptor.formula).evaluate();
  const content = await renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/damage-card.hbs`,
    {
      actorName: actor.name,
      weaponName: `${item.name} Artifact Mishap`,
      formula: descriptor.formula,
      total: roll.total,
      dmgType: descriptor.damageType,
      notes: descriptor.notes
    }
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    whisper: gmRecipientIds(),
    flags: {
      [SYSTEM_ID]: {
        card: "damage",
        damage: {
          actorUuid: actor.uuid,
          sourceUuid: item.uuid,
          sourceKind: "artifact-harm",
          targetUuid: descriptor.targetUuid,
          targetUuids: descriptor.targetUuids,
          total: roll.total,
          formula: descriptor.formula,
          damageType: descriptor.damageType,
          sourceName: `${item.name} Artifact Mishap`,
          weaponTag: "",
          nonlethal: false
        }
      }
    }
  });
}

async function postHiddenOutcomeWhisper(actor, item, session, outcome) {
  const functionRoll = outcome.functionRoll ? `<li>Function check: ${outcome.functionRoll}/${outcome.functionChance}%</li>` : "";
  const mishapRoll = outcome.secondaryRoll ? `<li>Mishap check: ${outcome.secondaryRoll}</li>` : "";
  const descriptor = outcome.harmDescriptor
    ? `<li>Harm flow: ${escapeHtml(outcome.harmDescriptor.type)} (${escapeHtml(outcome.harmDescriptor.formula)})</li>`
    : "";
  await postArtifactChat(
    actor,
    item,
    game.i18n.localize("GAMMA_WORLD.Artifact.Session.GmWhisper"),
    `<ul>${functionRoll}${mishapRoll}${descriptor}<li>Observed: ${escapeHtml(outcome.publicMessage)}</li></ul>`,
    { whisper: gmRecipientIds() }
  );
}

function outcomeSummary(item, actor, cause, functionRoll, secondaryRoll = null) {
  const functionChance = artifactFunctionPercent(item);
  const metadata = artifactHarmMetadata(item);
  const functionSuccess = Number(functionRoll) <= functionChance;
  if (functionSuccess) {
    const harmDescriptor = cause === "harm" ? artifactHarmDescriptor(item, actor, "function") : null;
    return {
      success: true,
      functionChance,
      functionRoll,
      secondaryRoll,
      publicMessage: cause === "harm"
        ? harmDescriptor?.publicMessage ?? game.i18n.localize("GAMMA_WORLD.Artifact.Session.Public.Burst")
        : game.i18n.localize("GAMMA_WORLD.Artifact.Session.Public.Hum"),
      malfunctionText: "",
      harmDescriptor,
      publicOutcome: cause === "harm" ? "danger" : "functioned"
    };
  }

  let mishap = "";
  let harmDescriptor = null;
  if (secondaryRoll && metadata.canExplode && (secondaryRoll <= 10)) {
    mishap = game.i18n.localize("GAMMA_WORLD.Artifact.Session.Malfunction.Exploded");
    harmDescriptor = artifactHarmDescriptor(item, actor, "explosion");
  } else if (secondaryRoll && metadata.canShortOut && (secondaryRoll <= 10)) {
    mishap = game.i18n.localize("GAMMA_WORLD.Artifact.Session.Malfunction.ShortCircuit");
    harmDescriptor = artifactHarmDescriptor(item, actor, "short-circuit");
  }

  return {
    success: false,
    functionChance,
    functionRoll,
    secondaryRoll,
    publicMessage: mishap
      ? game.i18n.localize("GAMMA_WORLD.Artifact.Session.Public.Burst")
      : game.i18n.localize("GAMMA_WORLD.Artifact.Session.Public.Nothing"),
    malfunctionText: mishap,
    harmDescriptor,
    publicOutcome: mishap ? "mishap" : "inert"
  };
}

async function resolveHiddenOutcome(actor, item, session, { cause = "use" } = {}) {
  const functionRoll = await new Roll("1d100").evaluate();
  const metadata = artifactHarmMetadata(item);
  const needsSecondary = !((Number(functionRoll.total) <= artifactFunctionPercent(item)) || (!metadata.canExplode && !metadata.canShortOut));
  const secondary = needsSecondary ? await new Roll("1d100").evaluate() : null;
  const outcome = outcomeSummary(item, actor, cause, functionRoll.total, secondary?.total ?? null);

  const update = {};
  if (session) {
    session.gmHidden = {
      ...session.gmHidden,
      functionCheckRolled: true,
      functionCheck: functionRoll.total,
      secondaryMishapCheck: secondary?.total ?? null,
      observableOutcome: outcome.publicOutcome,
      harmResolution: outcome.harmDescriptor ?? null,
      pendingHarmResolution: !!outcome.harmDescriptor,
      functionChance: outcome.functionChance,
      condition: artifactDisplayCondition(item),
      lastCause: cause,
      resolvedAt: nowIso()
    };
    session.publicOutcome = outcome.publicMessage;
    update[FLAG_KEY] = session;
  }
  if (outcome.malfunctionText) {
    update["system.artifact.malfunction"] = outcome.malfunctionText;
  }
  if (Object.keys(update).length) {
    await item.update(update, { gammaWorldSync: true });
  }

  await postArtifactChat(actor, item, artifactDisplayName(item), `<p>${escapeHtml(outcome.publicMessage)}</p>`);
  await postHiddenOutcomeWhisper(actor, item, session ?? {}, outcome);
  if (outcome.harmDescriptor) {
    await postArtifactDamageWhisper(actor, item, outcome.harmDescriptor);
  }
  if (session) {
    setLocalSnapshot(item, session);
    broadcastArtifactSnapshot("update", sanitizeArtifactSession(item, session));
  }
  return outcome;
}

async function postSessionStatusChat(actor, item, session) {
  if (session.result === "resolved-success") {
    await postArtifactChat(
      actor,
      item,
      artifactDisplayName(item),
      `<p>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.SuccessPublic")}</p>`
    );
  } else if (session.result === "resolved-harm-pending-gm-check" || session.result === "resolved-harm") {
    await postArtifactChat(
      actor,
      item,
      artifactDisplayName(item),
      `<p>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.HarmPublic")}</p>`
    );
  }
}

async function persistSession(actor, item, session, artifactUpdate = {}) {
  const update = {
    [FLAG_KEY]: session,
    ...artifactUpdate
  };
  if (Object.keys(update).length) {
    await item.update(update, { gammaWorldSync: true });
  }
  const snapshot = setLocalSnapshot(item, session);
  broadcastArtifactSnapshot("update", snapshot);
  return snapshot;
}

async function startArtifactSessionLocal(actor, item, { operatorUserId = game.user?.id ?? "", helperCount = 0 } = {}) {
  let session = sessionFlag(item);
  if (!session) {
    session = buildSession(actor, item, { operatorUserId, helperCount });
    const profile = artifactUseProfileForChart(actor, session.chartId);
    if (profile.instantCharts.has("A") && (session.chartId === "A")) {
      session.currentNode = artifactChartFinishNode(session.chartId);
      session.resolved = true;
      session.result = "resolved-success";
      session.publicOutcome = game.i18n.localize("GAMMA_WORLD.Artifact.Session.InstantSuccess");
      session.auditLog.push(createAuditEntry("instant-success", session.publicOutcome, {
        userId: operatorUserId
      }));
      await item.update({
        [FLAG_KEY]: session,
        "system.artifact.identified": true,
        "system.artifact.operationKnown": true
      }, { gammaWorldSync: true });
      await postArtifactChat(actor, item, artifactDisplayName(item), `<p>${escapeHtml(session.publicOutcome)}</p>`);
    } else {
      await updateSessionFlag(item, session);
    }
  } else if (!session.operatorUserId) {
    session.operatorUserId = operatorUserId;
    session.operatorName = operatorNameFor(operatorUserId);
    session.auditLog.push(createAuditEntry("reassigned", `${session.operatorName} takes over identification.`, {
      userId: operatorUserId
    }));
    await updateSessionFlag(item, session);
  }

  const snapshot = setLocalSnapshot(item, session);
  broadcastArtifactSnapshot("open", snapshot);
  return snapshot;
}

async function rollArtifactSessionLocal(actor, item, { userId = game.user?.id ?? "", force = false } = {}) {
  let session = sessionFlag(item);
  if (!session) {
    session = buildSession(actor, item, { operatorUserId: userId });
  }

  const actingUserId = String(userId ?? "");
  const gmOverride = !!game.users.get(actingUserId)?.isGM || !!game.user?.isGM;
  if (!force && !gmOverride && (session.operatorUserId !== actingUserId)) {
    throw new Error(game.i18n.localize("GAMMA_WORLD.Artifact.Session.NotOperator"));
  }
  if (session.resolved) return sanitizeArtifactSession(item, session);

  const profile = artifactUseProfileForChart(actor, session.chartId);
  session.rollModifier = profile.modifier;
  session.speedMultiplier = profile.speedMultiplier;
  session.modifierSummary = [...profile.notes];
  const rawRoll = await new Roll("1d10").evaluate();
  const adjustedRoll = Math.max(1, Math.min(10, rawRoll.total + profile.modifier));
  const stepResult = resolveArtifactChartStep(session.chartId, session.currentNode, adjustedRoll);
  const step = {
    step: (session.path?.length ?? 0) + 1,
    rawRoll: rawRoll.total,
    modifier: profile.modifier,
    adjustedRoll,
    from: stepResult.from,
    to: stepResult.to,
    note: stepResult.note,
    transitionLabel: stepResult.transition.label,
    returnAlias: stepResult.transition.returnAlias ?? "",
    timestamp: nowIso()
  };

  session.currentNode = step.to;
  session.path = [...(session.path ?? []), step];
  session.latestRoll = step;
  session.rollsThisAttempt = Math.max(0, Number(session.rollsThisAttempt ?? 0) + 1);
  session.elapsedMinutes = artifactElapsedMinutes({
    rollsThisAttempt: session.rollsThisAttempt,
    helperCount: session.helperCount,
    speedMultiplier: profile.speedMultiplier
  });
  session.updatedAt = nowIso();
  session.auditLog.push(createAuditEntry("roll", `Step ${step.step}: ${step.from} -> ${step.to}`, {
    userId: actingUserId,
    adjustedRoll
  }));

  const artifactUpdate = {
    "system.artifact.attempts": Math.max(0, Number(artifactData(item).attempts ?? 0) + 1)
  };

  if (stepResult.isSuccess) {
    session.resolved = true;
    session.result = "resolved-success";
    session.publicOutcome = game.i18n.localize("GAMMA_WORLD.Artifact.Session.SuccessPublic");
    artifactUpdate["system.artifact.identified"] = true;
    artifactUpdate["system.artifact.operationKnown"] = true;
  } else if (stepResult.isHarm) {
    session.resolved = true;
    session.result = "resolved-harm-pending-gm-check";
  }

  const snapshot = await persistSession(actor, item, session, artifactUpdate);
  await postArtifactRollChat(actor, item, session, step);

  if (stepResult.isSuccess || stepResult.isHarm) {
    await postSessionStatusChat(actor, item, session);
  }
  if (stepResult.isHarm) {
    await resolveHiddenOutcome(actor, item, session, { cause: "harm" });
    session.result = "resolved-harm";
    session.updatedAt = nowIso();
    await persistSession(actor, item, session);
  }

  return snapshot;
}

async function interruptArtifactSessionLocal(actor, item, { userId = game.user?.id ?? "" } = {}) {
  const session = sessionFlag(item);
  if (!session) return null;
  const actingUserId = String(userId ?? "");
  const gmOverride = !!game.users.get(actingUserId)?.isGM || !!game.user?.isGM;
  if (!gmOverride && (session.operatorUserId !== actingUserId)) {
    throw new Error(game.i18n.localize("GAMMA_WORLD.Artifact.Session.NotOperator"));
  }

  session.currentNode = artifactChartStartNode(session.chartId);
  session.path = [];
  session.rollsThisAttempt = 0;
  session.elapsedMinutes = 0;
  session.resolved = false;
  session.result = null;
  session.latestRoll = null;
  session.publicOutcome = "";
  session.updatedAt = nowIso();
  session.gmHidden = emptyHiddenState(item);
  session.auditLog.push(createAuditEntry("interrupted", `${operatorNameFor(actingUserId)} interrupts the attempt.`, {
    userId: actingUserId
  }));

  const snapshot = await persistSession(actor, item, session);
  await postArtifactChat(actor, item, artifactDisplayName(item), `<p>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.InterruptedPublic")}</p>`);
  return snapshot;
}

async function setArtifactSessionHelpersLocal(actor, item, { helperCount = 0, userId = game.user?.id ?? "" } = {}) {
  const session = sessionFlag(item);
  if (!session) return null;
  const actingUserId = String(userId ?? "");
  const gmOverride = !!game.users.get(actingUserId)?.isGM || !!game.user?.isGM;
  if (!gmOverride && (session.operatorUserId !== actingUserId)) {
    throw new Error(game.i18n.localize("GAMMA_WORLD.Artifact.Session.NotOperator"));
  }

  const profile = artifactUseProfileForChart(actor, session.chartId);
  session.helperCount = Math.max(0, Math.round(Number(helperCount) || 0));
  session.rollModifier = profile.modifier;
  session.speedMultiplier = profile.speedMultiplier;
  session.modifierSummary = [...profile.notes];
  session.elapsedMinutes = artifactElapsedMinutes({
    rollsThisAttempt: session.rollsThisAttempt,
    helperCount: session.helperCount,
    speedMultiplier: profile.speedMultiplier
  });
  session.updatedAt = nowIso();
  session.auditLog.push(createAuditEntry("helpers", `Helper count set to ${session.helperCount}.`, {
    userId: actingUserId
  }));
  return persistSession(actor, item, session);
}

async function reassignArtifactOperatorLocal(actor, item, { operatorUserId } = {}) {
  const session = sessionFlag(item);
  if (!session) return null;
  session.operatorUserId = String(operatorUserId ?? session.operatorUserId ?? "");
  session.operatorName = operatorNameFor(session.operatorUserId);
  session.updatedAt = nowIso();
  session.auditLog.push(createAuditEntry("reassigned", `${session.operatorName} becomes the operator.`, {
    userId: session.operatorUserId
  }));
  return persistSession(actor, item, session);
}

async function resetArtifactSessionLocal(item) {
  await clearSessionFlag(item);
  clearArtifactSessionSnapshot(item.uuid);
  broadcastArtifactClose(item.uuid);
  return true;
}

async function revealArtifactOutcomeLocal(actor, item) {
  const session = sessionFlag(item);
  if (!session?.gmHidden?.functionCheckRolled) return null;
  session.revealCondition = true;
  session.revealHidden = true;
  session.updatedAt = nowIso();
  await updateSessionFlag(item, session);
  const summary = [
    `<p><strong>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.Condition")}:</strong> ${escapeHtml(artifactDisplayCondition(item))}</p>`,
    `<p><strong>${game.i18n.localize("GAMMA_WORLD.Artifact.FunctionChance")}:</strong> ${artifactFunctionPercent(item)}%</p>`,
    `<p><strong>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.FunctionRoll")}:</strong> ${session.gmHidden.functionCheck}</p>`
  ].join("");
  await postArtifactChat(actor, item, artifactDisplayName(item), summary);
  const snapshot = setLocalSnapshot(item, session);
  broadcastArtifactSnapshot("update", snapshot);
  return snapshot;
}

async function overrideArtifactAnalysisLocal(actor, item, { userId = game.user?.id ?? "" } = {}) {
  const actingUserId = String(userId ?? "");
  const gmOverride = !!game.users.get(actingUserId)?.isGM || !!game.user?.isGM;
  if (!gmOverride) {
    throw new Error(game.i18n.localize("GAMMA_WORLD.Artifact.Session.RevealFunctionGmOnly"));
  }

  const publicMessage = game.i18n.localize("GAMMA_WORLD.Artifact.Session.RevealFunctionPublic");
  let session = sessionFlag(item);
  if (session) {
    session.currentNode = artifactChartFinishNode(session.chartId);
    session.resolved = true;
    session.result = "resolved-success";
    session.publicOutcome = publicMessage;
    session.updatedAt = nowIso();
    session.auditLog.push(createAuditEntry("gm-reveal-function", publicMessage, {
      userId: actingUserId
    }));

    const snapshot = await persistSession(actor, item, session, {
      "system.artifact.identified": true,
      "system.artifact.operationKnown": true
    });
    await postArtifactChat(actor, item, artifactDisplayName(item), `<p>${escapeHtml(publicMessage)}</p>`);
    return snapshot;
  }

  await item.update({
    "system.artifact.identified": true,
    "system.artifact.operationKnown": true
  }, { gammaWorldSync: true });
  await postArtifactChat(actor, item, artifactDisplayName(item), `<p>${escapeHtml(publicMessage)}</p>`);
  return {
    itemUuid: item.uuid,
    itemName: artifactDisplayName(item),
    actorName: actor?.name ?? "",
    resolved: true,
    result: "resolved-success",
    publicOutcome: publicMessage
  };
}

async function resolveArtifactOperationCheckLocal(actor, item, { cause = "use" } = {}) {
  const session = sessionFlag(item);
  if (session) {
    session.updatedAt = nowIso();
    session.gmHidden = session.gmHidden ?? emptyHiddenState(item);
    await updateSessionFlag(item, session);
  }
  return resolveHiddenOutcome(actor, item, session ?? null, { cause });
}

async function executeArtifactActionLocal(action, payload = {}) {
  const item = await resolveOwnedItem(payload.itemUuid);
  if (!item || !itemIsArtifact(item)) throw new Error(game.i18n.localize("GAMMA_WORLD.Artifact.NotArtifact"));
  const actor = actorFromItem(item, payload.actorUuid ? await fromUuid(payload.actorUuid) : null);

  switch (action) {
    case "start":
      return startArtifactSessionLocal(actor, item, payload);
    case "roll":
      return rollArtifactSessionLocal(actor, item, payload);
    case "interrupt":
      return interruptArtifactSessionLocal(actor, item, payload);
    case "helpers":
      return setArtifactSessionHelpersLocal(actor, item, payload);
    case "reassign":
      return reassignArtifactOperatorLocal(actor, item, payload);
    case "reset":
      return resetArtifactSessionLocal(item);
    case "reveal":
      return revealArtifactOutcomeLocal(actor, item);
    case "reveal-function":
      return overrideArtifactAnalysisLocal(actor, item, payload);
    case "operation-check":
      return resolveArtifactOperationCheckLocal(actor, item, payload);
    default:
      throw new Error(`Unknown artifact session action: ${action}`);
  }
}

export async function executeArtifactSessionAction(action, payload = {}) {
  return executeArtifactActionLocal(action, payload);
}

async function runArtifactAction(action, actor, item, payload = {}) {
  const itemUuid = typeof item === "string" ? item : item?.uuid;
  const actorUuid = actor?.uuid ?? (typeof actor === "string" ? actor : null);
  if (!itemUuid) return null;
  if (game.user?.isGM) {
    return executeArtifactActionLocal(action, { ...payload, itemUuid, actorUuid });
  }
  return runAsGM("artifact-session-action", {
    action,
    itemUuid,
    actorUuid,
    userId: game.user?.id ?? "",
    ...payload
  });
}

export async function registerArtifactSessionSocket() {
  if (game.gammaWorld?.artifactSessionSocketRegistered) return;
  game.gammaWorld ??= {};
  game.gammaWorld.artifactSessionSocketRegistered = true;

  game.socket.on(SOCKET_NAME, async (message) => {
    if (!message || (message.kind !== "artifact-session")) return;
    if (message.recipientId && (message.recipientId !== game.user?.id)) return;

    if (message.type === "snapshot-request") {
      if (!isPrimaryGm()) return;
      const item = await resolveOwnedItem(message.itemUuid);
      const session = sessionFlag(item);
      if (!item || !session) return;
      const snapshot = sanitizeArtifactSession(item, session);
      broadcastArtifactSnapshot("snapshot", snapshot, { recipientId: message.requesterId });
      return;
    }

    if (message.type === "close") {
      clearArtifactSessionSnapshot(message.itemUuid);
      return;
    }

    if (!message.snapshot?.itemUuid) return;
    setArtifactSessionSnapshot(message.snapshot);
    if (message.type === "open") {
      await openArtifactApp(message.snapshot.itemUuid, { snapshot: message.snapshot, focus: false });
    }
  });
}

export async function requestArtifactSessionSnapshot(itemUuid) {
  if (!itemUuid || openRequests.has(itemUuid)) return null;
  openRequests.add(itemUuid);
  requestSnapshotFromGm(itemUuid);
  globalThis.setTimeout(() => openRequests.delete(itemUuid), 2000);
  return null;
}

export async function startArtifactSession(actor, item, options = {}) {
  const targetItem = await resolveOwnedItem(item);
  if (!targetItem || !itemIsArtifact(targetItem)) {
    ui.notifications?.info(game.i18n.localize("GAMMA_WORLD.Artifact.NotArtifact"));
    return null;
  }
  const snapshot = await runArtifactAction("start", actor, targetItem, {
    operatorUserId: options.operatorUserId ?? game.user?.id ?? "",
    helperCount: options.helperCount ?? 0
  });
  await openArtifactApp(targetItem.uuid, { snapshot, focus: true });
  return snapshot;
}

export async function openArtifactSession(actor, item, options = {}) {
  return startArtifactSession(actor, item, options);
}

export async function rollArtifactSession(actor, item, options = {}) {
  return runArtifactAction("roll", actor, item, {
    force: !!options.force,
    userId: options.userId ?? game.user?.id ?? ""
  });
}

export async function interruptArtifactSession(actor, item, options = {}) {
  return runArtifactAction("interrupt", actor, item, {
    userId: options.userId ?? game.user?.id ?? ""
  });
}

export async function setArtifactSessionHelpers(actor, item, helperCount, options = {}) {
  return runArtifactAction("helpers", actor, item, {
    helperCount,
    userId: options.userId ?? game.user?.id ?? ""
  });
}

export async function reassignArtifactOperator(actor, item, operatorUserId) {
  return runArtifactAction("reassign", actor, item, { operatorUserId });
}

export async function resetArtifactSession(actor, item) {
  return runArtifactAction("reset", actor, item);
}

export async function revealArtifactOutcome(actor, item) {
  return runArtifactAction("reveal", actor, item);
}

export async function overrideArtifactAnalysis(actor, item, options = {}) {
  return runArtifactAction("reveal-function", actor, item, {
    userId: options.userId ?? game.user?.id ?? ""
  });
}

export async function resolveArtifactOperationCheck(actor, item, { cause = "use" } = {}) {
  const targetItem = await resolveOwnedItem(item);
  if (!targetItem || !itemIsArtifact(targetItem)) return { success: true };
  return runArtifactAction("operation-check", actor, targetItem, { cause });
}

export function currentArtifactSessionView(itemUuid) {
  return artifactSessionSnapshot(itemUuid);
}
