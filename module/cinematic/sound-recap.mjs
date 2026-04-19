/**
 * 0.8.3 Cinematic Roll Request — sound cues + chat recap.
 *
 * Subscribes to cinematic-begin / cinematic-end events and fires two
 * things:
 *
 *   1. A configured sound file — reuses the 0.7.0 sound-cue pipeline
 *      so the same master toggle / settings panel governs these.
 *      Three new cue slots: cinematic.intro / success / failure.
 *
 *   2. A single aggregate chat recap posted when the request ends —
 *      one chat card listing every actor, their total, and their
 *      pass/fail verdict. Blind mode is honored: if blind and a
 *      non-GM listener fires, the recap is skipped for them (only
 *      the GM's client posts the card, and chat visibility then
 *      depends on the world setting `cinematicRecapMessage`).
 */

import { SYSTEM_ID } from "../config.mjs";
import { CINEMATIC_EVENTS, onCinematicEvent } from "./socket.mjs";
import { getRollType } from "./roll-types.mjs";

const SECONDARY_CUES = Object.freeze({
  intro:   "soundCueCinematicIntro",
  success: "soundCueCinematicSuccess",
  failure: "soundCueCinematicFailure"
});

function cueMasterEnabled() {
  try {
    return !!game.settings?.get(SYSTEM_ID, "soundCuesEnabled");
  } catch (_) {
    return false;
  }
}

function cuePath(settingKey) {
  try {
    const value = game.settings?.get(SYSTEM_ID, settingKey);
    return typeof value === "string" ? value.trim() : "";
  } catch (_) {
    return "";
  }
}

async function playCinematicCue(settingKey) {
  if (!cueMasterEnabled()) return;
  const path = cuePath(settingKey);
  if (!path) return;
  const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper ?? null;
  if (!helper?.play) return;
  try {
    await helper.play({ src: path, volume: 0.8, autoplay: true, loop: false }, { excludeUser: null });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | cinematic cue failed for "${path}"`, error);
  }
}

/**
 * Snapshot of the last cinematic-begin payload so the recap builder
 * can cross-reference the roll type / intensity / DC. Reset when the
 * end event fires.
 */
const pendingRecaps = new Map(); // requestId → { begin, results: [] }

function cacheBegin(payload) {
  pendingRecaps.set(payload.requestId, {
    begin: payload,
    results: []
  });
}

function cacheResult(payload) {
  const entry = pendingRecaps.get(payload.requestId);
  if (!entry) return;
  entry.results.push({
    actorUuid: payload.actorUuid,
    d20: payload.d20,
    total: payload.total,
    passed: payload.passed,
    band: payload.band,
    breakdown: payload.breakdown ?? "",
    initiativeValue: payload.initiativeValue ?? null
  });
}

function clearRecap(requestId) {
  pendingRecaps.delete(requestId);
}

async function buildRecap(requestId, aggregate) {
  const entry = pendingRecaps.get(requestId);
  if (!entry) return;
  const { begin, results } = entry;

  const actorRows = results.map((r) => {
    const actor = fromUuidSync?.(r.actorUuid) ?? null;
    const name = actor?.name ?? r.actorUuid;
    const verdict = r.passed === true ? "✔" : r.passed === false ? "✘" : "·";
    const cls = r.passed === true ? "is-pass" : r.passed === false ? "is-fail" : "is-bare";
    const detail = r.breakdown ? ` <span class="gw-cinematic-recap__detail">${foundry.utils.escapeHTML(r.breakdown)}</span>` : "";
    return `<li class="${cls}">
      <span class="gw-cinematic-recap__verdict">${verdict}</span>
      <span class="gw-cinematic-recap__actor">${foundry.utils.escapeHTML(name)}</span>
      <span class="gw-cinematic-recap__total">${Number.isFinite(r.total) ? r.total : "—"}</span>
      ${detail}
    </li>`;
  }).join("");

  const typeEntry = getRollType(begin.rollTypeKey);
  const title = begin.title
    || game.i18n?.localize?.(typeEntry.label)
    || typeEntry.key;

  const aggregateLabel = ({
    success: "All passed",
    failure: "All failed",
    mixed:   "Mixed result",
    partial: "Partial result"
  })[aggregate] ?? "Resolved";

  const content = `<div class="gw-chat-card gw-cinematic-recap">
    <h3>${foundry.utils.escapeHTML(title)}</h3>
    <div class="gw-card-meta">${foundry.utils.escapeHTML(aggregateLabel)}</div>
    <ul class="gw-cinematic-recap__rows">${actorRows}</ul>
  </div>`;

  await ChatMessage.create({
    content,
    flags: {
      [SYSTEM_ID]: {
        card: "cinematic-recap",
        cinematic: {
          requestId,
          rollTypeKey: begin.rollTypeKey,
          aggregate,
          results: results.map((r) => ({
            actorUuid: r.actorUuid,
            total: r.total,
            passed: r.passed,
            band: r.band
          }))
        }
      }
    }
  });
}

export function registerCinematicSoundAndRecap() {
  onCinematicEvent(CINEMATIC_EVENTS.begin, async (payload) => {
    cacheBegin(payload);
    await playCinematicCue(SECONDARY_CUES.intro);
  });

  onCinematicEvent(CINEMATIC_EVENTS.result, (payload) => {
    cacheResult(payload);
  });

  onCinematicEvent(CINEMATIC_EVENTS.end, async (payload) => {
    const aggregate = payload?.aggregate ?? "partial";
    const cue = (aggregate === "success") ? SECONDARY_CUES.success
      : (aggregate === "failure" || aggregate === "mixed") ? SECONDARY_CUES.failure
      : null;
    if (cue) await playCinematicCue(cue);

    // Only the GM posts the recap so N-client tables don't spam
    // N copies of the same card.
    if (game.user?.isGM && payload?.requestId) {
      try {
        await buildRecap(payload.requestId, aggregate);
      } catch (error) {
        console.warn(`${SYSTEM_ID} | cinematic recap build failed`, error);
      }
    }
    // Clear the cache a short delay after end so any late-arriving
    // result messages don't ghost the next request.
    setTimeout(() => clearRecap(payload?.requestId), 2000);
  });

  onCinematicEvent(CINEMATIC_EVENTS.cancel, (payload) => {
    clearRecap(payload?.requestId);
  });
}
