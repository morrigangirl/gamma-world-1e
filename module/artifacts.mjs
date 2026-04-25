import {
  artifactData,
  artifactDisplayName,
  itemIsArtifact
} from "./artifact-rules.mjs";
import {
  artifactPowerFailureMessage,
  artifactPowerStatus,
  consumeArtifactCharge,
  manageArtifactPower
} from "./artifact-power.mjs";
import {
  interruptArtifactSession,
  openArtifactSession,
  overrideArtifactAnalysis,
  registerArtifactSessionSocket,
  requestArtifactSessionSnapshot,
  resetArtifactSession,
  revealArtifactOutcome,
  reassignArtifactOperator,
  resolveArtifactOperationCheck,
  rollArtifactSession,
  setArtifactSessionHelpers,
  startArtifactSession
} from "./artifact-session.mjs";

function escapeHtml(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

async function postArtifactMessage(actor, item, body) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="gw-chat-card gw-artifact-chat"><h3>${escapeHtml(artifactDisplayName(item))}</h3>${body}</div>`
  });
}

export {
  interruptArtifactSession,
  openArtifactSession,
  overrideArtifactAnalysis,
  registerArtifactSessionSocket,
  requestArtifactSessionSnapshot,
  resetArtifactSession,
  revealArtifactOutcome,
  reassignArtifactOperator,
  rollArtifactSession,
  setArtifactSessionHelpers,
  startArtifactSession
};

export { itemIsArtifact };

export async function openArtifactWorkflow(actor, item) {
  if (!itemIsArtifact(item)) {
    ui.notifications?.info(game.i18n.localize("GAMMA_WORLD.Artifact.NotArtifact"));
    return null;
  }
  return openArtifactSession(actor, item);
}

export async function analyzeArtifact(actor, item) {
  return openArtifactWorkflow(actor, item);
}

export async function resolveArtifactOperation(actor, item, { cause = "use" } = {}) {
  if (!itemIsArtifact(item)) return { success: true };

  const artifact = artifactData(item);
  if (!artifact.operationKnown) {
    await openArtifactWorkflow(actor, item);
    ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.Artifact.Session.OperationUnknown"));
    return { success: false, blocked: true };
  }

  if (artifact.malfunction) {
    ui.notifications?.warn(`${item.name} is malfunctioning: ${artifact.malfunction}`);
    return { success: false, malfunction: artifact.malfunction };
  }

  const power = artifactPowerStatus(item);
  if (!power.powered) {
    ui.notifications?.warn(artifactPowerFailureMessage(item));
    return { success: false, unpowered: true, reason: power.reason };
  }

  const hidden = await resolveArtifactOperationCheck(actor, item, { cause });
  if (!hidden?.success) return hidden ?? { success: false };

  // 0.13.0: fire the consume path when either (a) the item has a cell-drain
  // rule populated (new path — debits installed cell by perUnit%), OR
  // (b) the legacy own-charges-max counter is nonzero (medi-kit doses,
  // un-migrated items). The consume helper routes between the two.
  if (power.usesCellDrain || power.chargesMax > 0) {
    await consumeArtifactCharge(item, 1);
  }

  return hidden;
}

export async function useArtifactItem(actor, item) {
  const operation = await resolveArtifactOperation(actor, item, { cause: "use" });
  if (!operation.success) return operation;

  if (item.type === "weapon") {
    const { rollAttack } = await import("./dice.mjs");
    return rollAttack(actor, item);
  }
  if (item.type === "gear") {
    const { useGear } = await import("./item-actions.mjs");
    return useGear(actor, item, { skipArtifactCheck: true });
  }
  if (item.type === "armor") {
    const nextEquipped = !item.system.equipped;
    await item.update({ "system.equipped": nextEquipped });
    await actor.refreshDerivedResources?.({ adjustCurrent: false });
    await postArtifactMessage(
      actor,
      item,
      `<p>${escapeHtml(item.name)} is now ${nextEquipped ? "equipped" : "inactive"}.</p>`
    );
    return { success: true };
  }

  return operation;
}

export async function tryArtifactSession(actor, item) {
  return useArtifactItem(actor, item);
}

export async function manageArtifactItemPower(actor, item) {
  return manageArtifactPower(actor, item);
}
