/**
 * 0.14.9 — Travel-time mode for overland hex play.
 *
 * `performTravel(actor, { terrain, totalHours, partyActors })` runs the
 * party through one travel session: divides the duration into 4-hour
 * legs, rolls a wandering-encounter check per leg, decrements rations
 * per 24h elapsed, advances world time so hourly cell drain (Powered
 * Plate, Energy Cloak) ticks naturally. Stops early when an encounter
 * triggers — the GM resolves the encounter, then the player starts a
 * new travel for the remaining hours.
 *
 * Why 4-hour legs:
 *   RAW splits the day into 4-hour watches; one route-check per leg
 *   matches the rulebook's "check at the start of each watch" cadence.
 *   Configurable via the `travelLegHours` system setting (default 4).
 *
 * Encounter integration:
 *   Reuses `checkRouteEncounter(actor, { terrain, period })` from
 *   encounters.mjs. That helper posts its own chat card with the
 *   d6 check + d20 result. We just inspect the returned `{ encountered }`
 *   to decide whether to stop the loop.
 *
 * Ration consumption:
 *   Each PC in `partyActors` consumes 1 ration item (gear with
 *   `system.subtype === "ration"`) per 24 hours of travel. The first
 *   matching stack on the actor decrements; auto-destroy fires when
 *   the stack hits 0 (matches the 0.14.0 ammunition pattern). When
 *   nobody has rations left, posts a "starving" warning. Consumption
 *   is per-day-elapsed, so a 6-hour leg won't deduct (10h carryover
 *   builds, deducts on the leg that crosses 24h).
 */

import { SYSTEM_ID } from "./config.mjs";
// `checkRouteEncounter` lives in `encounters.mjs`, which has a
// top-level `foundry.applications.api.DialogV2` reference. We
// dynamic-import inside `performTravel` so tests can drive the loop
// without a Foundry environment.

export const TRAVEL_DEFAULT_LEG_HOURS = 4;
export const HOURS_PER_DAY = 24;

/**
 * Run a travel session.
 *
 * @param {Actor} actor          — the actor "leading" travel (used as
 *                                 the speaker on the route-check chat
 *                                 cards). Usually the player who
 *                                 initiated.
 * @param {object} opts
 * @param {string} opts.terrain  — terrain key (clear / forest / mountains
 *                                 / desert / water / ruins / zones)
 * @param {number} opts.totalHours
 * @param {string} [opts.period] — "day" | "night" — passed to the route
 *                                 check. Defaults to game.time-derived
 *                                 day/night (best-effort) or "day".
 * @param {Actor[]} [opts.partyActors] — PCs whose rations consume.
 *                                 Defaults to every player-owned
 *                                 character actor in the world.
 *
 * @returns {{ legsCompleted: number, hoursElapsed: number,
 *             encounterAtLeg: number|null, rationsConsumed: number,
 *             starving: string[] }}
 */
export async function performTravel(actor, opts = {}) {
  const terrain    = String(opts.terrain ?? "").trim();
  const totalHours = Math.max(1, Math.floor(Number(opts.totalHours ?? 0)));
  const period     = opts.period || resolveDayNight();
  const partyActors = Array.isArray(opts.partyActors) && opts.partyActors.length
    ? opts.partyActors
    : defaultPartyActors();
  const legHoursSetting = legHours();

  const result = {
    legsCompleted:   0,
    hoursElapsed:    0,
    encounterAtLeg:  null,
    rationsConsumed: 0,
    starving:        []   // names of party members who ran out of rations
  };
  if (!terrain || totalHours <= 0) {
    ui.notifications?.warn(
      game.i18n?.localize?.("GAMMA_WORLD.Travel.BadInputs")
      ?? "Pick a terrain and duration before traveling."
    );
    return result;
  }

  // Lazy-import the route-check helper. Loading `encounters.mjs` at
  // module top would pull in `foundry.applications.api.DialogV2` and
  // break unit tests; deferring the import lets tests stub the
  // function via globalThis before the first leg runs.
  let checkRouteEncounter = null;
  try {
    ({ checkRouteEncounter } = await import("./encounters.mjs"));
  } catch (_error) {
    // Tests run without the encounter module; performTravel still
    // ticks legs (no encounter rolls fire — encountered stays false).
  }

  let elapsed = 0;
  let dayAccumulator = 0;   // hours since last ration tick

  while (elapsed < totalHours) {
    if (game.combat?.started) {
      ui.notifications?.warn(
        game.i18n?.localize?.("GAMMA_WORLD.Travel.CombatActive")
        ?? "Travel paused — finish the active combat first."
      );
      break;
    }

    const legDuration = Math.min(legHoursSetting, totalHours - elapsed);

    // Per-leg encounter check (uses existing route-check helper).
    let encountered = false;
    if (checkRouteEncounter) {
      try {
        const legResult = await checkRouteEncounter(actor, { terrain, period });
        encountered = !!legResult?.encountered;
      } catch (error) {
        console.warn(`${SYSTEM_ID} | travel encounter check failed`, error);
      }
    }

    elapsed += legDuration;
    dayAccumulator += legDuration;
    result.legsCompleted += 1;

    // Ration consumption: each whole 24h crossed deducts 1 ration per PC.
    while (dayAccumulator >= HOURS_PER_DAY) {
      dayAccumulator -= HOURS_PER_DAY;
      const consumed = await consumeRations(partyActors, result.starving);
      result.rationsConsumed += consumed;
    }

    // Advance world time (cells / radiation / status effects all tick).
    await advanceTravelTime(legDuration);

    if (encountered) {
      result.encounterAtLeg = result.legsCompleted;
      break;
    }
  }

  result.hoursElapsed = elapsed;
  await postTravelSummary(actor, terrain, totalHours, result);
  return result;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function legHours() {
  try {
    const v = Number(game.settings?.get?.(SYSTEM_ID, "travelLegHours") ?? TRAVEL_DEFAULT_LEG_HOURS);
    return Math.max(1, Math.min(12, Math.floor(v) || TRAVEL_DEFAULT_LEG_HOURS));
  } catch { return TRAVEL_DEFAULT_LEG_HOURS; }
}

function resolveDayNight() {
  // Foundry stores worldTime as seconds-since-epoch. Use the day-fraction
  // to pick day vs night without dragging in a calendar module.
  try {
    const seconds = Number(game.time?.worldTime ?? 0);
    const hourOfDay = ((seconds / 3600) % 24 + 24) % 24;
    return (hourOfDay >= 6 && hourOfDay < 18) ? "day" : "night";
  } catch { return "day"; }
}

function defaultPartyActors() {
  if (!game.actors) return [];
  return game.actors.contents.filter((a) =>
    a.type === "character" && (a.hasPlayerOwner || a.testUserPermission?.(game.user, "OWNER"))
  );
}

/**
 * Decrement 1 ration item (gear, subtype: "ration") on each party
 * actor. Returns the count of rations actually consumed. Actors with
 * no rations on hand are pushed onto `starving` (deduped).
 */
async function consumeRations(partyActors, starving) {
  let consumed = 0;
  for (const pc of partyActors) {
    const ration = pc.items?.find?.((i) =>
      i.type === "gear"
      && i.system?.subtype === "ration"
      && Number(i.system?.quantity ?? 0) > 0
    );
    if (!ration) {
      if (!starving.includes(pc.name)) starving.push(pc.name);
      continue;
    }
    const remaining = Math.max(0, Number(ration.system.quantity ?? 0) - 1);
    await ration.update({ "system.quantity": remaining }, { gammaWorldSync: true });
    if (remaining === 0 && ration.system?.ammo?.autoDestroy !== false) {
      // Match the 0.14.0 ammunition pattern: empty stacks auto-destroy
      // unless explicitly opted out per-item.
      try { await ration.delete(); } catch (_e) { /* swallow */ }
    }
    consumed += 1;
  }
  return consumed;
}

async function advanceTravelTime(hours) {
  if (!game.user?.isGM) return;
  try {
    if (game.settings?.get?.(SYSTEM_ID, "restAdvancesWorldTime") === false) return;
    await game.time?.advance?.(hours * 3600);
  } catch (error) {
    console.warn(`${SYSTEM_ID} | travel world-time advance failed`, error);
  }
}

async function postTravelSummary(actor, terrain, requestedHours, result) {
  try {
    const ChatMessageClass = globalThis.ChatMessage ?? foundry?.documents?.ChatMessage;
    if (!ChatMessageClass) return;
    const localize = (key, fb) => {
      const out = game.i18n?.localize?.(key);
      return (out && out !== key) ? out : (fb ?? key);
    };
    const heading = localize("GAMMA_WORLD.Travel.SummaryHeading", "Travel summary");
    const terrainLabel = localize(`GAMMA_WORLD.Encounter.Terrain.${capitalize(terrain)}`, terrain);
    const lines = [
      `<div class="gw-chat-card gw-travel-summary"><h3>${escapeHtml(heading)}</h3>`,
      `<p>${escapeHtml(terrainLabel)} · ${result.hoursElapsed} / ${requestedHours} hr</p>`
    ];
    if (result.encounterAtLeg) {
      lines.push(`<p><strong>${escapeHtml(localize("GAMMA_WORLD.Travel.StoppedAt", "Stopped at leg {n} due to encounter."))
        .replace("{n}", result.encounterAtLeg)}</strong></p>`);
    } else if (result.hoursElapsed >= requestedHours) {
      lines.push(`<p>${escapeHtml(localize("GAMMA_WORLD.Travel.ArrivedSafely", "Travel completed without incident."))}</p>`);
    } else {
      lines.push(`<p>${escapeHtml(localize("GAMMA_WORLD.Travel.PausedCombat", "Travel paused — combat is active."))}</p>`);
    }
    if (result.rationsConsumed > 0) {
      lines.push(`<p>${result.rationsConsumed} ration${result.rationsConsumed === 1 ? "" : "s"} consumed.</p>`);
    }
    if (result.starving.length > 0) {
      lines.push(`<p><em>${escapeHtml(localize("GAMMA_WORLD.Travel.Starving", "Out of rations:"))} ${escapeHtml(result.starving.join(", "))}</em></p>`);
    }
    lines.push("</div>");
    await ChatMessageClass.create({
      speaker: ChatMessageClass.getSpeaker?.({ actor }) ?? { alias: "Travel" },
      content: lines.join("")
    });
  } catch (error) {
    console.warn(`${SYSTEM_ID} | travel summary post failed`, error);
  }
}

function capitalize(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* ------------------------------------------------------------------ */
/* Travel dialog                                                        */
/* ------------------------------------------------------------------ */

/**
 * Prompt the GM/player for travel inputs, then call `performTravel`.
 * Wires from the actor sheet's "Travel" action button.
 */
export async function openTravelDialog(actor) {
  if (!actor) return null;
  const DialogV2 = foundry.applications.api.DialogV2;
  const localize = (key, fb) => {
    const out = game.i18n?.localize?.(key);
    return (out && out !== key) ? out : (fb ?? key);
  };
  const terrains = CONFIG.GAMMA_WORLD?.ENCOUNTER_TERRAINS ?? {};
  const terrainOptionsHtml = Object.entries(terrains).map(([key, label]) =>
    `<option value="${key}">${localize(label, capitalize(key))}</option>`
  ).join("");

  const result = await DialogV2.prompt({
    window: { title: localize("GAMMA_WORLD.Travel.DialogTitle", "Travel") },
    content: `<form class="gw-travel-form">
      <p>${localize("GAMMA_WORLD.Travel.Prompt", "How far does the party travel before the next stop?")}</p>
      <div class="form-group">
        <label>${localize("GAMMA_WORLD.Travel.Terrain", "Terrain")}</label>
        <select name="terrain">${terrainOptionsHtml}</select>
      </div>
      <div class="form-group">
        <label>${localize("GAMMA_WORLD.Travel.Hours", "Hours")}</label>
        <input type="number" name="totalHours" value="6" min="1" max="48" step="1" />
      </div>
      <div class="form-group">
        <label>${localize("GAMMA_WORLD.Travel.Period", "Period")}</label>
        <select name="period">
          <option value="day">${localize("GAMMA_WORLD.Encounter.Period.Day", "Day")}</option>
          <option value="night">${localize("GAMMA_WORLD.Encounter.Period.Night", "Night")}</option>
        </select>
      </div>
    </form>`,
    ok: {
      label: localize("GAMMA_WORLD.Travel.Confirm", "Begin travel"),
      callback: (_event, button) => {
        const form = button.form ?? button.closest("form") ?? button.closest(".window-content");
        const terrain    = form?.querySelector?.("select[name='terrain']")?.value ?? "";
        const totalHours = Number(form?.querySelector?.("input[name='totalHours']")?.value ?? 0);
        const period     = form?.querySelector?.("select[name='period']")?.value ?? "day";
        return { terrain, totalHours, period };
      }
    },
    rejectClose: false
  });

  if (!result || !result.terrain || !result.totalHours) return null;
  return performTravel(actor, result);
}
