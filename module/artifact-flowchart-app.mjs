import { SYSTEM_ID } from "./config.mjs";
import {
  artifactSessionSnapshot,
  registerArtifactSessionApp,
  unregisterArtifactSessionApp
} from "./artifact-session-store.mjs";
import { artifactChartConfig, artifactChartNodeMeta } from "./tables/artifact-flowcharts.mjs";
import { formatArtifactElapsedMinutes } from "./artifact-rules.mjs";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const openApps = new Map();

function escapeHtml(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function signed(value) {
  const number = Math.round(Number(value) || 0);
  if (!number) return "0";
  return number > 0 ? `+${number}` : `${number}`;
}

function stepNoteLabel(note = "") {
  switch (note) {
    case "return":
      return game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Return");
    case "success":
      return game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Success");
    case "harm":
      return game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Harm");
    case "loop":
      return game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Loop");
    default:
      return game.i18n.localize("GAMMA_WORLD.Artifact.Session.Note.Advance");
  }
}

function stepSummary(step) {
  if (!step) return "";
  return `#${step.step} | raw ${step.rawRoll} | mod ${signed(step.modifier)} | adj ${step.adjustedRoll} | ${step.from} -> ${step.to} | ${stepNoteLabel(step.note).toLowerCase()}`;
}

function edgeKey(from, to) {
  return `${from}->${to}`;
}

function groupedEdges(config) {
  const groups = new Map();
  for (const [from, transitions] of Object.entries(config.transitions)) {
    for (const transition of transitions) {
      const key = edgeKey(from, transition.to);
      const bucket = groups.get(key) ?? {
        from,
        to: String(transition.to),
        labels: [],
        returnAliases: []
      };
      bucket.labels.push(transition.label);
      if (transition.returnAlias) bucket.returnAliases.push(transition.returnAlias);
      groups.set(key, bucket);
    }
  }
  return [...groups.values()];
}

function loopPath(meta) {
  const x = Number(meta.x);
  const y = Number(meta.y);
  return {
    d: `M ${x} ${y - 3.5} C ${x + 8} ${y - 13}, ${x + 11} ${y + 4}, ${x + 1.5} ${y + 6}`,
    labelX: x + 10,
    labelY: y - 8
  };
}

function linePath(fromMeta, toMeta) {
  const x1 = Number(fromMeta.x);
  const y1 = Number(fromMeta.y);
  const x2 = Number(toMeta.x);
  const y2 = Number(toMeta.y);
  return {
    d: `M ${x1} ${y1} L ${x2} ${y2}`,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2 - 1.4
  };
}

function edgePath(config, edge) {
  const fromMeta = config.nodeMeta[edge.from];
  const toMeta = config.nodeMeta[edge.to];
  if (!fromMeta || !toMeta) return { d: "", labelX: 0, labelY: 0 };
  if (edge.from === edge.to) return loopPath(fromMeta);
  return linePath(fromMeta, toMeta);
}

function nodeMarkup(meta, { active = false, current = false, debug = false } = {}) {
  const x = Number(meta.x);
  const y = Number(meta.y);
  const label = meta.label ? `<text class="gw-artifact-flowchart__node-label" x="${x}" y="${y + 1.4}">${escapeHtml(meta.label)}</text>` : "";
  const debugLabel = debug ? `<text class="gw-artifact-flowchart__debug-label" x="${x}" y="${y - 6.6}">${escapeHtml(meta.debugId ?? "")}</text>` : "";
  const halo = active || current
    ? `<circle class="gw-artifact-flowchart__active-halo" cx="${x}" cy="${y}" r="6.6"></circle>`
    : "";

  let shape = "";
  switch (meta.shape) {
    case "circle":
      shape = `<circle class="gw-artifact-flowchart__node gw-artifact-flowchart__node--circle" cx="${x}" cy="${y}" r="4.2"></circle>`;
      break;
    case "diamond":
      shape = `<polygon class="gw-artifact-flowchart__node gw-artifact-flowchart__node--diamond" points="${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}"></polygon>`;
      break;
    case "terminal":
      shape = `
        <circle class="gw-artifact-flowchart__node gw-artifact-flowchart__node--terminal" cx="${x}" cy="${y}" r="4.7"></circle>
        <text class="gw-artifact-flowchart__terminal-label" x="${x}" y="${y + 1.6}">${escapeHtml(meta.label || "☠")}</text>
      `;
      break;
    case "square":
    default:
      shape = `<rect class="gw-artifact-flowchart__node gw-artifact-flowchart__node--square" x="${x - 4.4}" y="${y - 4.4}" width="8.8" height="8.8" rx="1.1"></rect>`;
      break;
  }

  return `<g class="gw-artifact-flowchart__node-group">${halo}${shape}${label}${debugLabel}</g>`;
}

function buildGraphSvg(session, { debug = false } = {}) {
  if (!session) return "";
  const config = artifactChartConfig(session.chartId);
  const edges = groupedEdges(config);
  const traversed = new Set((session.path ?? []).map((step) => edgeKey(step.from, step.to)));
  const latest = session.latestRoll ? edgeKey(session.latestRoll.from, session.latestRoll.to) : "";

  const edgeMarkup = edges.map((edge) => {
    const path = edgePath(config, edge);
    const classes = [
      "gw-artifact-flowchart__edge",
      traversed.has(edgeKey(edge.from, edge.to)) ? "is-traversed" : "",
      latest === edgeKey(edge.from, edge.to) ? "is-latest" : ""
    ].filter(Boolean).join(" ");
    const label = edge.labels.join(" / ");
    return `
      <g class="gw-artifact-flowchart__edge-group">
        <path class="${classes}" d="${path.d}" marker-end="url(#gw-artifact-arrow)"></path>
        <text class="gw-artifact-flowchart__edge-label" x="${path.labelX}" y="${path.labelY}">${escapeHtml(label)}</text>
      </g>
    `;
  }).join("");

  const returnBoxes = (config.returnBoxes ?? []).map((box) => `
    <g class="gw-artifact-flowchart__return-box">
      <rect x="${box.x - 10}" y="${box.y - 3.8}" width="20" height="7.6" rx="1.4"></rect>
      <text x="${box.x}" y="${box.y + 0.8}">${escapeHtml(box.label)}</text>
    </g>
  `).join("");

  const nodeMarkupAll = Object.entries(config.nodeMeta).map(([nodeId, meta]) => nodeMarkup(
    { ...meta, debugId: nodeId },
    {
      active: latest && (session.latestRoll?.to === nodeId),
      current: session.currentNode === nodeId,
      debug
    }
  )).join("");

  const currentMeta = artifactChartNodeMeta(session.chartId, session.currentNode);
  const token = currentMeta
    ? `<circle class="gw-artifact-flowchart__token" cx="${currentMeta.x}" cy="${currentMeta.y}" r="2.1"></circle>`
    : "";
  const motion = session.latestRoll && (session.latestRoll.from !== session.latestRoll.to)
    ? (() => {
      const latestEdge = edgePath(config, { from: session.latestRoll.from, to: session.latestRoll.to });
      return `
        <circle class="gw-artifact-flowchart__token-travel" r="2.1">
          <animateMotion dur="420ms" fill="freeze" path="${latestEdge.d}"></animateMotion>
        </circle>
      `;
    })()
    : "";

  return `
    <svg class="gw-artifact-flowchart__svg" viewBox="0 0 100 100" role="img" aria-label="Artifact flowchart">
      <defs>
        <marker id="gw-artifact-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z"></path>
        </marker>
      </defs>
      <rect class="gw-artifact-flowchart__frame" x="1" y="1" width="98" height="98" rx="2"></rect>
      <g class="gw-artifact-flowchart__edges">${edgeMarkup}</g>
      <g class="gw-artifact-flowchart__returns">${returnBoxes}</g>
      <g class="gw-artifact-flowchart__nodes">${nodeMarkupAll}</g>
      <g class="gw-artifact-flowchart__token-layer">${motion}${token}</g>
    </svg>
  `;
}

export class ArtifactFlowchartApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #snapshot = null;
  #debug = false;
  #requested = false;
  #busy = false;

  constructor(options = {}) {
    super(options);
    this.itemUuid = String(options.itemUuid ?? "");
    this.#snapshot = options.snapshot ?? artifactSessionSnapshot(this.itemUuid);
    registerArtifactSessionApp(this.itemUuid, this);
  }

  static DEFAULT_OPTIONS = {
    classes: ["gamma-world", "artifact-session-app"],
    position: { width: 1080, height: 780 },
    window: {
      title: "Artifact Identification",
      resizable: true,
      contentClasses: ["gamma-world-sheet"]
    },
    actions: {
      rollStep: ArtifactFlowchartApp.#onRollStep,
      interruptSession: ArtifactFlowchartApp.#onInterruptSession,
      tryArtifact: ArtifactFlowchartApp.#onTryArtifact,
      resetSession: ArtifactFlowchartApp.#onResetSession,
      reassignOperator: ArtifactFlowchartApp.#onReassignOperator,
      revealOutcome: ArtifactFlowchartApp.#onRevealOutcome,
      toggleDebug: ArtifactFlowchartApp.#onToggleDebug,
      changeHelpers: ArtifactFlowchartApp.#onChangeHelpers,
      closeWindow: ArtifactFlowchartApp.#onCloseWindow
    }
  };

  static PARTS = {
    form: {
      template: `systems/${SYSTEM_ID}/templates/apps/artifact-flowchart.hbs`,
      scrollable: [".gw-artifact-session__history-list", ".gw-artifact-session__legend"]
    }
  };

  async close(options) {
    unregisterArtifactSessionApp(this.itemUuid, this);
    openApps.delete(this.itemUuid);
    return super.close(options);
  }

  onArtifactSessionUpdate(snapshot) {
    this.#snapshot = snapshot ?? null;
    if (!snapshot) {
      this.close();
      return;
    }
    this.render(true);
  }

  async _prepareContext() {
    let snapshot = this.#snapshot ?? artifactSessionSnapshot(this.itemUuid);
    let item = null;
    let actor = null;
    let gmSession = null;

    try {
      item = await fromUuid(this.itemUuid);
    } catch (_error) {
      item = null;
    }

    actor = item?.parent instanceof Actor ? item.parent : null;
    if (game.user?.isGM) {
      gmSession = item?.flags?.[SYSTEM_ID]?.artifactSession ?? null;
      if (!snapshot && gmSession) {
        const mod = await import("./artifact-session.mjs");
        snapshot = mod.sanitizeArtifactSession(item, gmSession);
      }
    }

    if (!snapshot && !this.#requested) {
      this.#requested = true;
      const mod = await import("./artifact-session.mjs");
      await mod.requestArtifactSessionSnapshot(this.itemUuid);
    }

    const isGM = !!game.user?.isGM;
    const isOperator = !!snapshot && (snapshot.operatorUserId === game.user?.id);
    const status = snapshot?.result ?? (snapshot ? "active" : "idle");
    const canRoll = !!snapshot && !snapshot.resolved && (isGM || isOperator);
    const canInterrupt = !!snapshot && !snapshot.resolved && (isGM || isOperator);
    const canTry = !!snapshot && snapshot.resolved && (snapshot.result === "resolved-success") && (isGM || isOperator);
    const canAdjustHelpers = !!snapshot && !snapshot.resolved && (isGM || isOperator);
    const canReset = !!snapshot && isGM;
    const canReassign = !!snapshot && isGM;
    const canReveal = !!snapshot && isGM && !!gmSession?.gmHidden?.functionCheckRolled;
    const modifierSummary = snapshot?.modifierSummary?.length
      ? snapshot.modifierSummary.join(" · ")
      : game.i18n.localize("GAMMA_WORLD.Artifact.Session.NoSpecialMods");

    const history = (snapshot?.path ?? []).map((step) => ({
      ...step,
      modifierLabel: signed(step.modifier),
      noteLabel: stepNoteLabel(step.note)
    }));

    const gmDiagnostics = isGM && gmSession
      ? [
        { label: game.i18n.localize("GAMMA_WORLD.Artifact.Session.Condition"), value: gmSession.gmHidden?.condition ?? item?.system?.artifact?.condition ?? "" },
        { label: game.i18n.localize("GAMMA_WORLD.Artifact.FunctionChance"), value: `${gmSession.gmHidden?.functionChance ?? item?.system?.artifact?.functionChance ?? 0}%` },
        { label: game.i18n.localize("GAMMA_WORLD.Artifact.Session.FunctionRoll"), value: gmSession.gmHidden?.functionCheck ?? "—" },
        { label: game.i18n.localize("GAMMA_WORLD.Artifact.Session.MishapRoll"), value: gmSession.gmHidden?.secondaryMishapCheck ?? "—" },
        { label: game.i18n.localize("GAMMA_WORLD.Artifact.Session.ObservableOutcome"), value: gmSession.gmHidden?.observableOutcome ?? "—" },
        { label: game.i18n.localize("GAMMA_WORLD.Artifact.Malfunction"), value: item?.system?.artifact?.malfunction || "—" }
      ]
      : [];

    return {
      hasSession: !!snapshot,
      itemUuid: this.itemUuid,
      itemName: snapshot?.itemName ?? item?.name ?? game.i18n.localize("GAMMA_WORLD.Artifact.Title"),
      actorName: snapshot?.actorName ?? actor?.name ?? "",
      operatorName: snapshot?.operatorName ?? game.i18n.localize("GAMMA_WORLD.Artifact.Session.UnknownOperator"),
      chartId: snapshot?.chartId ?? "A",
      status,
      statusLabel: snapshot?.resolved
        ? (snapshot.result === "resolved-success"
          ? game.i18n.localize("GAMMA_WORLD.Artifact.Session.StatusSuccess")
          : game.i18n.localize("GAMMA_WORLD.Artifact.Session.StatusHarm"))
        : game.i18n.localize("GAMMA_WORLD.Artifact.Session.StatusActive"),
      conditionVisible: !!snapshot?.revealCondition || isGM,
      conditionLabel: isGM
        ? (gmSession?.gmHidden?.condition ?? item?.system?.artifact?.condition ?? "")
        : (snapshot?.condition ?? ""),
      rollsThisAttempt: snapshot?.rollsThisAttempt ?? 0,
      elapsedLabel: snapshot?.elapsedLabel ?? formatArtifactElapsedMinutes(snapshot?.elapsedMinutes ?? 0),
      helperCount: snapshot?.helperCount ?? 0,
      rollModifier: signed(snapshot?.rollModifier ?? 0),
      modifierSummary,
      publicOutcome: snapshot?.publicOutcome ?? "",
      legend: artifactChartConfig(snapshot?.chartId ?? "A").legend,
      graphSvg: snapshot ? buildGraphSvg(snapshot, { debug: this.#debug }) : "",
      history,
      latestRoll: snapshot?.latestRoll ? {
        ...snapshot.latestRoll,
        modifierLabel: signed(snapshot.latestRoll.modifier),
        summary: stepSummary(snapshot.latestRoll),
        noteLabel: stepNoteLabel(snapshot.latestRoll.note)
      } : null,
      isGM,
      isOperator,
      canRoll,
      canInterrupt,
      canTry,
      canAdjustHelpers,
      canReset,
      canReassign,
      canReveal,
      debugEnabled: this.#debug,
      gmDiagnostics
    };
  }

  static async #withAction(app, fn) {
    if (app.#busy) return;
    app.#busy = true;
    try {
      await fn();
    } finally {
      app.#busy = false;
    }
  }

  static async #onRollStep(event) {
    event.preventDefault();
    await ArtifactFlowchartApp.#withAction(this, async () => {
      const mod = await import("./artifact-session.mjs");
      await mod.rollArtifactSession(null, this.itemUuid, { force: !!game.user?.isGM && !(this.#snapshot?.operatorUserId === game.user?.id) });
    });
  }

  static async #onInterruptSession(event) {
    event.preventDefault();
    const confirm = await DialogV2.confirm({
      window: { title: game.i18n.localize("GAMMA_WORLD.Artifact.Session.Interrupt") },
      content: `<p>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.InterruptConfirm")}</p>`
    });
    if (!confirm) return;
    await ArtifactFlowchartApp.#withAction(this, async () => {
      const mod = await import("./artifact-session.mjs");
      await mod.interruptArtifactSession(null, this.itemUuid);
    });
  }

  static async #onTryArtifact(event) {
    event.preventDefault();
    await ArtifactFlowchartApp.#withAction(this, async () => {
      const item = await fromUuid(this.itemUuid);
      const actor = item?.parent instanceof Actor ? item.parent : null;
      if (!item?.use) return;
      await item.use(actor);
    });
  }

  static async #onResetSession(event) {
    event.preventDefault();
    const confirm = await DialogV2.confirm({
      window: { title: game.i18n.localize("GAMMA_WORLD.Artifact.Session.Reset") },
      content: `<p>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.ResetConfirm")}</p>`
    });
    if (!confirm) return;
    await ArtifactFlowchartApp.#withAction(this, async () => {
      const mod = await import("./artifact-session.mjs");
      await mod.resetArtifactSession(null, this.itemUuid);
    });
  }

  static async #onReassignOperator(event) {
    event.preventDefault();
    const users = game.users
      .filter((user) => user.active && !user.isGM)
      .map((user) => `<option value="${user.id}" ${user.id === this.#snapshot?.operatorUserId ? "selected" : ""}>${escapeHtml(user.name)}</option>`)
      .join("");
    const selected = await DialogV2.prompt({
      window: { title: game.i18n.localize("GAMMA_WORLD.Artifact.Session.Reassign") },
      content: `<form><label>${game.i18n.localize("GAMMA_WORLD.Artifact.Session.Operator")}
        <select name="userId">${users}</select>
      </label></form>`,
      ok: {
        label: game.i18n.localize("GAMMA_WORLD.Artifact.Session.Reassign"),
        callback: (_event, button) => {
          const data = new foundry.applications.ux.FormDataExtended(button.form).object;
          return String(data.userId || "");
        }
      },
      rejectClose: false
    });
    if (!selected) return;
    await ArtifactFlowchartApp.#withAction(this, async () => {
      const mod = await import("./artifact-session.mjs");
      await mod.reassignArtifactOperator(null, this.itemUuid, selected);
    });
  }

  static async #onRevealOutcome(event) {
    event.preventDefault();
    await ArtifactFlowchartApp.#withAction(this, async () => {
      const mod = await import("./artifact-session.mjs");
      await mod.revealArtifactOutcome(null, this.itemUuid);
    });
  }

  static async #onToggleDebug(event) {
    event.preventDefault();
    this.#debug = !this.#debug;
    this.render(true);
  }

  static async #onChangeHelpers(event, target) {
    event.preventDefault();
    const delta = Math.round(Number(target.dataset.delta ?? 0));
    const next = Math.max(0, Math.round(Number(this.#snapshot?.helperCount ?? 0) + delta));
    await ArtifactFlowchartApp.#withAction(this, async () => {
      const mod = await import("./artifact-session.mjs");
      await mod.setArtifactSessionHelpers(null, this.itemUuid, next);
    });
  }

  static async #onCloseWindow(event) {
    event.preventDefault();
    await this.close();
  }
}

export async function openArtifactSessionApp(itemUuid, { snapshot = null, focus = true } = {}) {
  const key = String(itemUuid ?? "");
  if (!key) return null;
  const existing = openApps.get(key);
  if (existing) {
    if (snapshot) existing.onArtifactSessionUpdate(snapshot);
    existing.render(true, { focus });
    return existing;
  }

  const app = new ArtifactFlowchartApp({ itemUuid: key, snapshot });
  openApps.set(key, app);
  await app.render(true, { focus });
  return app;
}
