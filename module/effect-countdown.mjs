/**
 * 0.14.2 — Active Effect countdown formatter for the sheet dashboard.
 *
 * Takes an ActiveEffect and returns a normalized "time remaining" view:
 *   { remainingRounds, remainingSeconds, label, expired, hasTimer }
 *
 * Foundry's ActiveEffect#duration carries `rounds`, `turns`, `seconds`,
 * `startRound`, `startTurn`, `startTime`. Foundry's runtime computes
 * `effect.duration.remaining` for round/turn-based effects when a combat
 * is active. For world-time effects we compute remaining from
 * `startTime + seconds - game.time.worldTime`.
 *
 * Pure-ish: takes an optional `now` injection (combat round, world time)
 * so this stays unit-testable without a Foundry game instance.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR   = 3600;
const SECONDS_PER_DAY    = 86400;

/**
 * @param {ActiveEffect} effect
 * @param {object}  [opts]
 * @param {number}  [opts.combatRound]  — current combat round (defaults to
 *                                        live game.combat?.round when unset)
 * @param {number}  [opts.worldTime]    — current world time in seconds
 *                                        (defaults to live game.time?.worldTime)
 * @param {(key, fallback) => string} [opts.localize]
 * @returns {{
 *   hasTimer: boolean,
 *   expired: boolean,
 *   remainingRounds: number|null,
 *   remainingSeconds: number|null,
 *   label: string
 * }}
 */
export function formatEffectCountdown(effect, opts = {}) {
  const localize = opts.localize ?? passthrough;
  const duration = effect?.duration ?? {};
  const combatRound = opts.combatRound ?? readCombatRound();
  const worldTime   = opts.worldTime   ?? readWorldTime();

  // Round-based timer: rounds set, optionally with startRound.
  if (Number.isFinite(duration.rounds) && duration.rounds > 0) {
    const start = Number(duration.startRound ?? combatRound ?? 0);
    const elapsed = Math.max(0, (combatRound ?? start) - start);
    const remaining = Math.max(0, duration.rounds - elapsed);
    return {
      hasTimer: true,
      expired: remaining <= 0,
      remainingRounds: remaining,
      remainingSeconds: null,
      label: formatRoundsLabel(localize, remaining)
    };
  }

  // Turn-based timer (rare in GW1e but Foundry supports it).
  if (Number.isFinite(duration.turns) && duration.turns > 0) {
    return {
      hasTimer: true,
      expired: false,
      remainingRounds: null,
      remainingSeconds: null,
      label: formatTurnsLabel(localize, duration.turns)
    };
  }

  // World-time-based timer.
  if (Number.isFinite(duration.seconds) && duration.seconds > 0) {
    const start = Number(duration.startTime ?? worldTime ?? 0);
    const elapsed = Math.max(0, (worldTime ?? start) - start);
    const remaining = Math.max(0, duration.seconds - elapsed);
    return {
      hasTimer: true,
      expired: remaining <= 0,
      remainingRounds: null,
      remainingSeconds: remaining,
      label: formatSecondsLabel(localize, remaining)
    };
  }

  // No timer — passive / permanent / GM-managed effect.
  return {
    hasTimer: false,
    expired: false,
    remainingRounds: null,
    remainingSeconds: null,
    label: localize("GAMMA_WORLD.Effect.Countdown.Permanent", "Permanent")
  };
}

/** Pretty-print a round count using the system's compact "{n} rd" form
 *  so dashboard pills stay narrow. Fallbacks match the en.json values. */
export function formatRoundsLabel(localize, rounds) {
  if (rounds === 1) return localize("GAMMA_WORLD.Effect.Countdown.Round", "1 rd");
  return formatTemplated(localize, "GAMMA_WORLD.Effect.Countdown.Rounds",
                          "{n} rd", { n: rounds });
}

function formatTurnsLabel(localize, turns) {
  if (turns === 1) return localize("GAMMA_WORLD.Effect.Countdown.Turn", "1 turn");
  return formatTemplated(localize, "GAMMA_WORLD.Effect.Countdown.Turns",
                          "{n} turns", { n: turns });
}

/** Pretty-print seconds → biggest-unit label (days/hours/minutes/seconds).
 *  All fallbacks use compact unit names matching en.json. */
export function formatSecondsLabel(localize, seconds) {
  if (seconds <= 0) return localize("GAMMA_WORLD.Effect.Countdown.Expired", "Expired");
  if (seconds >= SECONDS_PER_DAY) {
    const days = Math.round(seconds / SECONDS_PER_DAY);
    return days === 1
      ? localize("GAMMA_WORLD.Effect.Countdown.Day", "1 day")
      : formatTemplated(localize, "GAMMA_WORLD.Effect.Countdown.Days", "{n} days", { n: days });
  }
  if (seconds >= SECONDS_PER_HOUR) {
    const hours = Math.round(seconds / SECONDS_PER_HOUR);
    return hours === 1
      ? localize("GAMMA_WORLD.Effect.Countdown.Hour", "1 hr")
      : formatTemplated(localize, "GAMMA_WORLD.Effect.Countdown.Hours", "{n} hr", { n: hours });
  }
  if (seconds >= SECONDS_PER_MINUTE) {
    const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
    return minutes === 1
      ? localize("GAMMA_WORLD.Effect.Countdown.Minute", "1 min")
      : formatTemplated(localize, "GAMMA_WORLD.Effect.Countdown.Minutes", "{n} min", { n: minutes });
  }
  const s = Math.max(0, Math.round(seconds));
  return s === 1
    ? localize("GAMMA_WORLD.Effect.Countdown.Second", "1 sec")
    : formatTemplated(localize, "GAMMA_WORLD.Effect.Countdown.Seconds", "{n} sec", { n: s });
}

/* ------------------------------------------------------------------ */

function passthrough(_key, fallback) { return fallback; }

function formatTemplated(localize, key, fallback, params) {
  const raw = localize(key, fallback);
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replaceAll(`{${k}}`, String(v)),
    raw
  );
}

function readCombatRound() {
  try {
    return Number(globalThis.game?.combat?.round ?? 0) || 0;
  } catch { return 0; }
}

function readWorldTime() {
  try {
    return Number(globalThis.game?.time?.worldTime ?? 0) || 0;
  } catch { return 0; }
}
