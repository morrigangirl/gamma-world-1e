/**
 * 0.14.4 — Power-state surface for cell-driven items (weapons, armor,
 * wearables). Mirrors `mutation-status.mjs`: pure functions that read
 * persisted state and return a normalized `{ state, percent, ... }`
 * object the sheet can render into a colored pill.
 *
 * Why a dedicated module: the post-0.14.3 mechanics correctly refuse to
 * fire unloaded weapons, but the data was invisible to players. Today
 * an unpowered Laser Pistol on the inventory looks identical to a
 * fully-charged one. This helper is the single source of truth the
 * sheet templates and the Active Now dashboard share.
 *
 * Four user-visible states (plus N_A for non-cell-driven items):
 *
 *   HEALTHY  — min installed cell > 50%
 *   LOW      — 1% ≤ min cell ≤ 50%  (orange warning)
 *   EMPTY    — every installed cell at 0%  (red, attack refused)
 *   NO_CELL  — installedCellIds is empty AND consumption.perUnit > 0
 *              (red dashed border, attack refused)
 *   N_A      — item has no per-unit drain rate (medi-kit, mundane gear)
 */

import {
  artifactPowerStatus,
  artifactPowerFailureMessage,
  cellChargePercent
} from "./artifact-power.mjs";

export const POWER_STATE = Object.freeze({
  HEALTHY: "healthy",
  LOW:     "low",
  EMPTY:   "empty",
  NO_CELL: "no-cell",
  N_A:     "n-a"
});

const SEVERITY = Object.freeze({
  [POWER_STATE.HEALTHY]: 0,
  [POWER_STATE.N_A]:     0,
  [POWER_STATE.LOW]:     1,
  [POWER_STATE.EMPTY]:   2,
  [POWER_STATE.NO_CELL]: 2
});

/** Spread (max - min) above which we render `min · max` instead of just min. */
const DIVERGENCE_DISPLAY_THRESHOLD = 5;

/**
 * Compute the live power state for an item. Reads `installedCellIds`
 * via `fromUuidSync`, falls back to `artifactPowerStatus` for the
 * powered/reason booleans, and inherits from the host armor when the
 * item is a built-in weapon (flags.gamma-world-1e.grantedBy).
 *
 * Pure-ish: the helper is testable without a Foundry game. `fromUuidSync`
 * is read off `globalThis.foundry.utils` / `globalThis.fromUuidSync`
 * with safe fallbacks; tests can stub it.
 */
export function itemPowerState(item) {
  if (!item) return makeState(POWER_STATE.N_A, { reason: "missing-item" });

  // Built-in weapons (Powered Battle Armor's arm laser, etc.) inherit from
  // their host armor. Recurse one level deep; if the host can't be
  // resolved, fall back to computing this item's own state — better to
  // show stale data than throw.
  const grantedBy = item.flags?.["gamma-world-1e"]?.grantedBy;
  if (grantedBy && typeof grantedBy === "string") {
    const host = resolveByUuidSync(grantedBy);
    if (host && host !== item) {
      const hostState = itemPowerState(host);
      return { ...hostState, hostUuid: grantedBy };
    }
  }

  const perUnit = Number(item.system?.consumption?.perUnit ?? 0);
  // Non-cell-driven items (medi-kit, pain reducer, mundane gear) get
  // N_A so their existing legacy `artifactPowerSummary` line keeps
  // rendering its X/Y counter unchanged.
  if (perUnit <= 0) return makeState(POWER_STATE.N_A, { reason: "no-drain-rule" });

  const status = artifactPowerStatus(item);
  const ids = Array.isArray(status.installedCellIds) ? status.installedCellIds : [];

  if (ids.length === 0) {
    return makeState(POWER_STATE.NO_CELL, {
      percent: null,
      cellPercents: [],
      reason: "no-cell"
    });
  }

  // Resolve each installed cell's charge. UUIDs that don't resolve
  // (deleted cells, broken refs) contribute 0 to the aggregate so the
  // device reads as more-empty rather than less.
  const cellPercents = ids.map((uuid) => {
    const cell = resolveByUuidSync(uuid);
    if (!cell) return 0;
    const pct = cellChargePercent(cell);
    return Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  });

  const minPercent = cellPercents.length ? Math.min(...cellPercents) : 0;
  const maxPercent = cellPercents.length ? Math.max(...cellPercents) : 0;

  let stateKey;
  if (cellPercents.every((p) => p <= 0)) stateKey = POWER_STATE.EMPTY;
  else if (minPercent <= 50)             stateKey = POWER_STATE.LOW;
  else                                   stateKey = POWER_STATE.HEALTHY;

  return makeState(stateKey, {
    percent: minPercent,
    maxPercent,
    cellPercents,
    reason: stateKey === POWER_STATE.EMPTY ? "depleted" : null
  });
}

/**
 * Sheet-ready badge for an item. Returns null when the item isn't
 * cell-driven (state === N_A) so the template can `{{#if gwPowerBadge}}`
 * cleanly skip rendering for medi-kits, mundane weapons, etc.
 *
 * @param {Item} item
 * @param {object} [opts]
 * @param {(key: string, fallback?: string) => string} [opts.localize]
 * @returns {{ label: string, css: string, title: string, state: string,
 *            percent: number|null, severity: number, hostUuid?: string } | null}
 */
export function itemPowerBadge(item, { localize = passthrough } = {}) {
  const state = itemPowerState(item);
  if (state.state === POWER_STATE.N_A) return null;

  const css = `gw-power-status--${state.state}`;
  let label;
  let title;

  switch (state.state) {
    case POWER_STATE.HEALTHY:
    case POWER_STATE.LOW: {
      const labelKey = state.state === POWER_STATE.LOW
        ? "GAMMA_WORLD.Artifact.Power.State.Low"
        : "GAMMA_WORLD.Artifact.Power.State.Healthy";
      const fallback = state.state === POWER_STATE.LOW
        ? "{n}% low" : "{n}%";
      // Show min · max when cells diverge enough to matter. Otherwise
      // just show the headline percent.
      const spread = (state.maxPercent ?? state.percent ?? 0) - (state.percent ?? 0);
      label = (state.cellPercents.length > 1 && spread > DIVERGENCE_DISPLAY_THRESHOLD)
        ? `${state.percent}% · ${state.maxPercent}%`
        : formatTemplated(localize, labelKey, fallback, { n: state.percent ?? 0 });
      title = state.cellPercents.map((p) => `${p}%`).join(" · ");
      break;
    }
    case POWER_STATE.EMPTY:
      label = localize("GAMMA_WORLD.Artifact.Power.State.Empty", "Empty");
      title = artifactPowerFailureMessage(item);
      break;
    case POWER_STATE.NO_CELL:
      label = localize("GAMMA_WORLD.Artifact.Power.State.NoCell", "No cell");
      title = artifactPowerFailureMessage(item);
      break;
    default:
      label = "";
      title = "";
  }

  // Built-in weapons render a "via {host}" suffix on the tooltip so
  // players know to manage cells on the host, not the embedded weapon.
  if (state.hostUuid) {
    const host = resolveByUuidSync(state.hostUuid);
    const hostName = host?.name ?? "host";
    const viaSuffix = formatTemplated(localize,
      "GAMMA_WORLD.Artifact.Power.State.ViaHost",
      "via {host}", { host: hostName });
    title = title ? `${title} · ${viaSuffix}` : viaSuffix;
  }

  return {
    label,
    css,
    title: title ?? "",
    state: state.state,
    percent: state.percent,
    severity: state.severity,
    ...(state.hostUuid ? { hostUuid: state.hostUuid } : {})
  };
}

/** True when state ∈ { EMPTY, NO_CELL } — feeds the Active Now critical filter. */
export function isItemPowerCritical(item) {
  const state = itemPowerState(item);
  return state.state === POWER_STATE.EMPTY || state.state === POWER_STATE.NO_CELL;
}

/* ------------------------------------------------------------------ */

function makeState(stateKey, extras = {}) {
  return {
    state: stateKey,
    severity: SEVERITY[stateKey] ?? 0,
    percent: extras.percent ?? null,
    maxPercent: extras.maxPercent ?? extras.percent ?? null,
    cellPercents: extras.cellPercents ?? [],
    reason: extras.reason ?? null,
    hostUuid: extras.hostUuid ?? null
  };
}

function passthrough(_key, fallback) { return fallback; }

function formatTemplated(localize, key, fallback, params) {
  const raw = localize(key, fallback);
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replaceAll(`{${k}}`, String(v)),
    raw
  );
}

/**
 * Safe `fromUuidSync` lookup — checks a few namespaces so the helper
 * works in production (Foundry game) and in unit tests (where tests
 * stub `globalThis.foundry.utils.fromUuidSync` or `globalThis.fromUuidSync`).
 * Returns null on any throw / missing infra.
 */
function resolveByUuidSync(uuid) {
  if (!uuid) return null;
  try {
    const fns = [
      globalThis?.foundry?.utils?.fromUuidSync,
      globalThis?.fromUuidSync
    ].filter((fn) => typeof fn === "function");
    for (const fn of fns) {
      const out = fn(uuid);
      if (out) return out;
    }
  } catch (_error) { /* swallow */ }
  return null;
}
