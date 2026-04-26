/**
 * 0.14.2 — Mutation status surface for the "Active Now" sheet dashboard
 * and per-row status pills.
 *
 * The system already tracks every state we need:
 *   - system.activation.mode      — passive | action | toggle
 *   - system.activation.enabled   — current toggle on/off
 *   - system.activation.remaining — rounds left on a timed effect
 *                                   (decremented by tickCombatMutationState
 *                                    in mutations.mjs each combat round)
 *   - system.cooldown.current     — rounds until ready again
 *   - system.cooldown.max         — total cooldown length
 *   - system.usage.limited        — true if N-per-period
 *   - system.usage.uses           — uses remaining
 *   - system.usage.max            — uses per period
 *   - system.usage.per            — day | week | encounter | scene | at-will
 *
 * This module reads those fields and returns a compact display payload
 * the character sheet template can render into a colored pill.
 */

/**
 * Status kinds, in display priority order. The first matching kind wins.
 * Each kind maps to a CSS class `gw-mutation-status--<kind>`.
 */
export const MUTATION_STATUS = Object.freeze({
  ACTIVE_TIMED: "active-timed",   // toggle ON with rounds remaining countdown
  ACTIVE:       "active",          // toggle ON, indefinite (no countdown)
  COOLDOWN:     "cooldown",        // cooling down, N rounds left
  SPENT:        "spent",           // limited uses, none remaining
  READY:        "ready",           // action mutation with uses available
  AVAILABLE:    "available",       // toggle that is currently OFF
  PASSIVE:      "passive"          // always-on, no activation
});

/**
 * Compute display status for a mutation item.
 *
 * @param {Item} item                 mutation document
 * @param {object} [opts]
 * @param {(key: string, fallback?: string) => string} [opts.localize]
 *        i18n resolver. Defaults to a passthrough so this stays
 *        unit-testable without a Foundry game instance.
 * @returns {{ kind: string, label: string, countdown: number|null,
 *            countdownUnit: "rounds"|null, css: string }}
 */
export function mutationStatus(item, { localize = passthrough } = {}) {
  if (!item || item.type !== "mutation") {
    return { kind: MUTATION_STATUS.PASSIVE, label: "", countdown: null, countdownUnit: null, css: classFor(MUTATION_STATUS.PASSIVE) };
  }

  const sys = item.system ?? {};
  const mode = sys.activation?.mode ?? "passive";
  const enabled = !!sys.activation?.enabled;
  const remaining = Math.max(0, Math.floor(Number(sys.activation?.remaining ?? 0)));
  const cooldown = Math.max(0, Math.floor(Number(sys.cooldown?.current ?? 0)));
  const usage = sys.usage ?? {};
  const limitedSpent = !!usage.limited && Number(usage.uses ?? 0) <= 0;

  // 1. Active + timed countdown wins highest — players need this most.
  if (enabled && remaining > 0) {
    return {
      kind: MUTATION_STATUS.ACTIVE_TIMED,
      label: formatLabel(localize, "GAMMA_WORLD.Mutation.Status.ActiveTimed",
                          "Active ({n} rd)", { n: remaining }),
      countdown: remaining,
      countdownUnit: "rounds",
      css: classFor(MUTATION_STATUS.ACTIVE_TIMED)
    };
  }

  // 2. Active toggle without countdown.
  if (enabled) {
    return {
      kind: MUTATION_STATUS.ACTIVE,
      label: localize("GAMMA_WORLD.Mutation.Status.Active", "Active"),
      countdown: null,
      countdownUnit: null,
      css: classFor(MUTATION_STATUS.ACTIVE)
    };
  }

  // 3. Cooldown beats spent + ready: cooling down means user can't act.
  if (cooldown > 0) {
    return {
      kind: MUTATION_STATUS.COOLDOWN,
      label: formatLabel(localize, "GAMMA_WORLD.Mutation.Status.Cooldown",
                          "Cooldown ({n} rd)", { n: cooldown }),
      countdown: cooldown,
      countdownUnit: "rounds",
      css: classFor(MUTATION_STATUS.COOLDOWN)
    };
  }

  // 4. Limited-use mutation with no remaining uses.
  if (limitedSpent) {
    return {
      kind: MUTATION_STATUS.SPENT,
      label: localize("GAMMA_WORLD.Mutation.Status.Spent", "Spent"),
      countdown: null,
      countdownUnit: null,
      css: classFor(MUTATION_STATUS.SPENT)
    };
  }

  // 5. Action-mode mutation with uses left → ready to fire.
  if (mode === "action") {
    return {
      kind: MUTATION_STATUS.READY,
      label: localize("GAMMA_WORLD.Mutation.Status.Ready", "Ready"),
      countdown: null,
      countdownUnit: null,
      css: classFor(MUTATION_STATUS.READY)
    };
  }

  // 6. Toggle currently off, available to enable.
  if (mode === "toggle") {
    return {
      kind: MUTATION_STATUS.AVAILABLE,
      label: localize("GAMMA_WORLD.Mutation.Status.Available", "Available"),
      countdown: null,
      countdownUnit: null,
      css: classFor(MUTATION_STATUS.AVAILABLE)
    };
  }

  // 7. Default: passive trait.
  return {
    kind: MUTATION_STATUS.PASSIVE,
    label: localize("GAMMA_WORLD.Mutation.Status.Passive", "Passive"),
    countdown: null,
    countdownUnit: null,
    css: classFor(MUTATION_STATUS.PASSIVE)
  };
}

/**
 * True when a mutation should appear in the "Active Now" dashboard
 * (currently running OR cooling down — both are interesting to a
 * player making turn-by-turn decisions). Passive / Ready / Available
 * mutations don't surface here; they're visible on the mutations tab.
 */
export function isMutationDashboardWorthy(item) {
  const status = mutationStatus(item);
  return status.kind === MUTATION_STATUS.ACTIVE_TIMED
      || status.kind === MUTATION_STATUS.ACTIVE
      || status.kind === MUTATION_STATUS.COOLDOWN;
}

/** True for the green "actively running" subset (excludes cooldown). */
export function isMutationActive(item) {
  const kind = mutationStatus(item).kind;
  return kind === MUTATION_STATUS.ACTIVE_TIMED || kind === MUTATION_STATUS.ACTIVE;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function passthrough(_key, fallback) { return fallback; }

function classFor(kind) {
  return `gw-mutation-status--${kind}`;
}

function formatLabel(localize, key, fallback, params) {
  const raw = localize(key, fallback);
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replaceAll(`{${k}}`, String(v)),
    raw
  );
}
