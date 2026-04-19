/**
 * 0.8.3 Cinematic Roll Request — broadcast socket channel.
 *
 * Piggybacks on the existing `system.${SYSTEM_ID}` socket that
 * gm-executor.mjs already listens on, but introduces three new message
 * kinds that every client acts on (not just the GM or a single
 * targeted user):
 *
 *   cinematic-begin   — GM announces a new request; every client
 *                       instantiates the banner with the payload.
 *   cinematic-result  — any client (the actor's owner) reports the
 *                       rolled total so every other client's banner
 *                       updates its per-actor card.
 *   cinematic-end     — GM announces the aggregate resolution; every
 *                       banner transitions to outro then fades.
 *   cinematic-cancel  — GM aborted the request mid-flight; every
 *                       banner closes without a recap.
 *
 * Events are dispatched through a local listener registry so the
 * banner subscribes once and the module layer doesn't have to know
 * whether a given event came from the wire or from the local emitter.
 *
 * The helpers are pure-JS (no Foundry globals required beyond
 * `game.socket` and `game.user`), so the test suite can exercise the
 * dispatcher by swapping in stubs.
 */

import { SYSTEM_ID } from "../config.mjs";

const SOCKET_NAME = `system.${SYSTEM_ID}`;

export const CINEMATIC_EVENTS = Object.freeze({
  begin:  "cinematic-begin",
  result: "cinematic-result",
  end:    "cinematic-end",
  cancel: "cinematic-cancel"
});

const KIND_SET = new Set(Object.values(CINEMATIC_EVENTS));

/** Listener registry: eventKind → Set<callback>. Callbacks receive
 * `(payload, meta)` where `meta = { sender: userId }`. */
const listeners = new Map();

function ensureListenerBucket(kind) {
  if (!listeners.has(kind)) listeners.set(kind, new Set());
  return listeners.get(kind);
}

/**
 * Subscribe to a cinematic event. Returns a disposer function — call
 * it to unsubscribe (the banner does this in its `_onClose` hook).
 */
export function onCinematicEvent(kind, callback) {
  if (!KIND_SET.has(kind)) throw new Error(`Unknown cinematic event kind: ${kind}`);
  if (typeof callback !== "function") throw new Error("Listener must be a function.");
  const bucket = ensureListenerBucket(kind);
  bucket.add(callback);
  return () => bucket.delete(callback);
}

/**
 * Dispatch an event locally without going over the socket — used by
 * the broadcaster for same-client delivery and by tests.
 */
export function dispatchCinematicLocal(kind, payload, meta = {}) {
  const bucket = listeners.get(kind);
  if (!bucket || bucket.size === 0) return;
  for (const cb of [...bucket]) {
    try {
      cb(payload, meta);
    } catch (error) {
      console.warn(`${SYSTEM_ID} | cinematic listener for "${kind}" threw`, error);
    }
  }
}

/**
 * Broadcast a cinematic event to every client (including this one).
 * The local dispatch happens synchronously before the socket emit so
 * the originating client sees their own banner transitions without a
 * round-trip.
 */
export function broadcastCinematicEvent(kind, payload) {
  if (!KIND_SET.has(kind)) throw new Error(`Unknown cinematic event kind: ${kind}`);
  const senderId = game?.user?.id ?? null;
  const message = { kind, payload, sender: senderId };
  dispatchCinematicLocal(kind, payload, { sender: senderId, local: true });
  if (game?.socket?.emit) {
    game.socket.emit(SOCKET_NAME, message);
  }
}

/**
 * Attach the socket listener that routes incoming cinematic messages
 * to the local dispatcher. Idempotent — registered once per client at
 * init time.
 */
export function registerCinematicSocket() {
  if (typeof game === "undefined" || !game?.socket) return;
  if (game.gammaWorld?.cinematicSocketRegistered) return;
  game.gammaWorld ??= {};
  game.gammaWorld.cinematicSocketRegistered = true;

  game.socket.on(SOCKET_NAME, (message) => {
    if (!message || typeof message !== "object") return;
    if (!KIND_SET.has(message.kind)) return;
    // Don't re-dispatch our own emissions — the local dispatch already
    // fired synchronously before we emitted.
    if (message.sender && message.sender === game.user?.id) return;
    dispatchCinematicLocal(message.kind, message.payload, {
      sender: message.sender ?? null,
      local: false
    });
  });
}

/** Test-only — reset the listener registry between test cases. */
export function __resetCinematicListenersForTesting() {
  listeners.clear();
}
