import { SYSTEM_ID } from "./config.mjs";

const SOCKET_NAME = `system.${SYSTEM_ID}`;
const pendingRequests = new Map();

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

function actorFromDocument(document) {
  if (!document) return null;
  if (document instanceof Actor) return document;
  if (document.actor instanceof Actor) return document.actor;
  if (document.document?.actor instanceof Actor) return document.document.actor;
  if (document.object?.actor instanceof Actor) return document.object.actor;
  return null;
}

async function resolveActorDocument(uuid) {
  if (!uuid) return null;
  const document = await fromUuid(uuid);
  return actorFromDocument(document);
}

async function dispatchOperation(operation, payload = {}) {
  switch (operation) {
    case "actor-update": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for update.");
      await actor.update(payload.update ?? {}, payload.options ?? {});
      return true;
    }

    case "actor-set-hp": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for HP update.");
      await actor.setHitPoints(payload.value ?? 0);
      return true;
    }

    case "actor-apply-damage": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for damage.");
      await actor.applyDamage(payload.amount ?? 0);
      return true;
    }

    case "actor-heal": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for healing.");
      await actor.heal(payload.amount ?? 0);
      return true;
    }

    case "actor-set-state": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for state update.");
      await actor.update({
        [`flags.${SYSTEM_ID}.-=state`]: null,
        [`flags.${SYSTEM_ID}.state`]: payload.state ?? {}
      });
      if (payload.refresh !== false && ["character", "monster"].includes(actor.type)) {
        await actor.refreshDerivedResources({ adjustCurrent: false });
      }
      return true;
    }

    case "actor-toggle-status": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for status toggle.");
      await actor.toggleStatusEffect(payload.statusId, { active: !!payload.active });
      return true;
    }

    case "actor-set-flag": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for flag update.");
      await actor.setFlag(payload.scope ?? SYSTEM_ID, payload.key, payload.value);
      return true;
    }

    case "artifact-session-action": {
      const { executeArtifactSessionAction } = await import("./artifact-session.mjs");
      return executeArtifactSessionAction(payload.action, payload);
    }

    default:
      throw new Error(`Unknown GM operation: ${operation}`);
  }
}

async function dispatchPromptOperation(operation, payload = {}) {
  switch (operation) {
    case "resolve-save": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for save resolution.");
      const { promptAndResolveSave } = await import("./dice.mjs");
      return promptAndResolveSave(actor, payload.type, payload.options ?? {});
    }

    case "roll-ability": {
      const actor = await resolveActorDocument(payload.actorUuid);
      if (!actor) throw new Error("Actor not found for requested roll.");
      const { promptAndRollAbility } = await import("./dice.mjs");
      return promptAndRollAbility(actor, payload.abilityKey, payload.options ?? {});
    }

    default:
      throw new Error(`Unknown prompt operation: ${operation}`);
  }
}

export function registerGmExecutor() {
  if (game.gammaWorld?.gmExecutorRegistered) return;
  game.gammaWorld ??= {};
  game.gammaWorld.gmExecutorRegistered = true;

  game.socket.on(SOCKET_NAME, async (message) => {
    if (!message || (typeof message !== "object")) return;

    if (message.kind === "request") {
      if (!isPrimaryGm()) return;
      if (message.gmId && (message.gmId !== game.user.id)) return;

      try {
        const result = await dispatchOperation(message.operation, message.payload);
        game.socket.emit(SOCKET_NAME, {
          kind: "response",
          requestId: message.requestId,
          requesterId: message.requesterId,
          result
        });
      } catch (error) {
        game.socket.emit(SOCKET_NAME, {
          kind: "response",
          requestId: message.requestId,
          requesterId: message.requesterId,
          error: error?.message ?? String(error)
        });
      }
      return;
    }

    if (message.kind === "prompt-request") {
      if (!message.targetUserId || (message.targetUserId !== game.user?.id)) return;

      try {
        const result = await dispatchPromptOperation(message.operation, message.payload);
        game.socket.emit(SOCKET_NAME, {
          kind: "prompt-response",
          requestId: message.requestId,
          requesterId: message.requesterId,
          result
        });
      } catch (error) {
        game.socket.emit(SOCKET_NAME, {
          kind: "prompt-response",
          requestId: message.requestId,
          requesterId: message.requesterId,
          error: error?.message ?? String(error)
        });
      }
      return;
    }

    if (!["response", "prompt-response"].includes(message.kind) || (message.requesterId !== game.user?.id)) return;
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    pendingRequests.delete(message.requestId);
    clearTimeout(pending.timeout);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  });
}

export async function runAsGM(operation, payload = {}) {
  if (game.user?.isGM) return dispatchOperation(operation, payload);

  const gmId = primaryGmId();
  if (!gmId) throw new Error("No active GM is available to apply that change.");

  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Timed out waiting for the GM to apply that change."));
    }, 15000);

    pendingRequests.set(requestId, { resolve, reject, timeout });
    game.socket.emit(SOCKET_NAME, {
      kind: "request",
      requestId,
      requesterId: game.user.id,
      gmId,
      operation,
      payload
    });
  });
}

export async function runActorUpdate(actor, update, options = {}) {
  if (!actor) return null;
  if (game.user?.isGM || actor.isOwner) return actor.update(update, options);
  return runAsGM("actor-update", {
    actorUuid: actor.uuid,
    update,
    options
  });
}

export async function runActorFlag(actor, key, value, { scope = SYSTEM_ID } = {}) {
  if (!actor) return null;
  if (game.user?.isGM || actor.isOwner) return actor.setFlag(scope, key, value);
  return runAsGM("actor-set-flag", {
    actorUuid: actor.uuid,
    scope,
    key,
    value
  });
}

export async function runAsUser(targetUserId, operation, payload = {}, {
  timeoutMs = 60000,
  timeoutMessage = "Timed out waiting for the requested user action."
} = {}) {
  if (!targetUserId) throw new Error("No active user is available for that prompt.");
  if (targetUserId === game.user?.id) return dispatchPromptOperation(operation, payload);

  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timeout });
    game.socket.emit(SOCKET_NAME, {
      kind: "prompt-request",
      requestId,
      requesterId: game.user.id,
      targetUserId,
      operation,
      payload
    });
  });
}
