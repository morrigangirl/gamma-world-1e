/**
 * 0.8.3 Cinematic Roll Request — banner overlay.
 *
 * Full-screen ApplicationV2 that renders on every client when a
 * cinematic-begin event fires. The banner is a singleton:
 *   - A new cinematic-begin while one is already open closes the old
 *     banner first, then opens the new one.
 *   - cinematic-result events update the matching per-actor card.
 *   - cinematic-end triggers the outro phase; the banner auto-closes
 *     a few seconds later.
 *   - cinematic-cancel closes immediately with no recap.
 *
 * State machine (`this.#phase`):
 *   intro → roll → outro → closed
 *
 * Visual layout:
 *   Full-viewport overlay with a dark blur backdrop. Centered title
 *   slab animates in ("DC 15 Stealth Check"). Below it, a horizontal
 *   row of actor cards (portrait + name + roll badge). Each card
 *   renders a Roll button for its actor's owner(s). When a result
 *   arrives (locally or over the wire), the matching card's badge
 *   animates the number in. When every card has a result, the GM's
 *   client emits cinematic-end; all banners transition to outro.
 *
 * Per the plan: no Sequencer / JB2A — CSS + Web Animations API only.
 * Reduced-motion media query disables slides and just fades.
 */

import { SYSTEM_ID, SKILLS, ATTRIBUTES } from "../config.mjs";
import { getRollType } from "./roll-types.mjs";
import {
  CINEMATIC_EVENTS,
  broadcastCinematicEvent,
  onCinematicEvent
} from "./socket.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api ?? {};

const OUTRO_CLOSE_DELAY_MS = 2800;
const INTRO_DURATION_MS = 900;

let activeBanner = null;

/**
 * Resolve the localized label for a roll-type entry + its parameters.
 * The banner title shows e.g. "DC 15 Stealth Check" or "Radiation
 * Intensity 14" — the composer may also supply a custom override.
 */
function titleForRequest(request) {
  if (request?.title) return request.title;
  const entry = getRollType(request.rollTypeKey);
  const base = game.i18n?.localize?.(entry.label) ?? entry.label;

  if (entry.requiresSkill && request.skillKey) {
    const skillDef = SKILLS[request.skillKey];
    const skillLabel = skillDef ? (game.i18n?.localize?.(skillDef.label) ?? request.skillKey) : request.skillKey;
    return `DC ${request.dc ?? "?"} ${skillLabel} check`;
  }
  if (entry.requiresDc) {
    return `DC ${request.dc ?? "?"} ${base}`;
  }
  if (entry.requiresIntensity) {
    return `${base} — intensity ${request.intensity ?? "?"}`;
  }
  return base;
}

/**
 * Decide whether the local user should see a Roll button for a given
 * actor card. Actor owners can roll their own; the GM can roll for any
 * unowned / unclaimed actor (post-pilot-offline scenarios).
 */
function canRollFor(actor) {
  if (!actor) return false;
  if (game.user?.isGM) return true;
  if (typeof actor.testUserPermission === "function") {
    return !!actor.testUserPermission(game.user, "OWNER");
  }
  return !!actor.isOwner;
}

function aggregateStatus(cards) {
  if (!cards.length) return "failure";
  const finished = cards.filter((c) => c.result);
  if (finished.length < cards.length) return "partial";
  const passed = finished.filter((c) => c.result.passed).length;
  if (passed === finished.length) return "success";
  if (passed === 0) return "failure";
  return "mixed";
}

export class CinematicRollBanner extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {"intro" | "roll" | "outro" | "closed"} */
  #phase = "intro";
  #request = null;
  /** Map<actorUuid, { actor, result, pending }>. */
  #cards = new Map();
  #disposers = [];
  #closeTimer = null;

  constructor(request, options = {}) {
    super(options);
    this.#request = request;
    this.#initCards();
  }

  static DEFAULT_OPTIONS = {
    id: "gw-cinematic-banner",
    classes: ["gw-cinematic-banner"],
    window: { frame: false, positioned: false, resizable: false, minimizable: false },
    position: { width: "100%", height: "100%", top: 0, left: 0 },
    actions: {
      rollActor: CinematicRollBanner.#onActorRoll,
      dismiss:   CinematicRollBanner.#onDismiss
    }
  };

  static PARTS = {
    frame: {
      template: `systems/${SYSTEM_ID}/templates/apps/cinematic-banner.hbs`
    }
  };

  /* -------------------------------------------- */
  /*  Init                                        */
  /* -------------------------------------------- */

  #initCards() {
    for (const uuid of this.#request?.actorUuids ?? []) {
      const actor = fromUuidSync?.(uuid) ?? null;
      this.#cards.set(uuid, {
        uuid,
        actor,
        name: actor?.name ?? uuid,
        img: actor?.img ?? "icons/svg/mystery-man.svg",
        canRoll: canRollFor(actor),
        pending: false,
        result: null
      });
    }
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  async _prepareContext() {
    const entry = getRollType(this.#request.rollTypeKey);
    return {
      phase: this.#phase,
      title: titleForRequest(this.#request),
      blind: !!this.#request.blind,
      cards: [...this.#cards.values()].map((card) => ({
        uuid: card.uuid,
        name: card.name,
        img: card.img,
        canRoll: card.canRoll && !card.result,
        pending: card.pending,
        badge: this.#renderBadge(card),
        passed: card.result?.passed ?? null,
        hasResult: !!card.result
      })),
      aggregate: aggregateStatus([...this.#cards.values()]),
      isGM: !!game.user?.isGM,
      rollTypeKey: this.#request.rollTypeKey,
      category: entry.category,
      isOutro: this.#phase === "outro",
      isIntro: this.#phase === "intro",
      isRoll:  this.#phase === "roll"
    };
  }

  #renderBadge(card) {
    if (!card.result) return card.pending ? "…" : "";
    if (this.#request.blind && this.#phase !== "outro" && !game.user?.isGM) return "?";
    return String(card.result.total ?? card.result.d20 ?? "—");
  }

  /* -------------------------------------------- */
  /*  Render lifecycle                            */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#wireEventSubscriptions();
    this.#scheduleIntroCompletion();
  }

  _onClose(options) {
    super._onClose?.(options);
    this.#phase = "closed";
    for (const dispose of this.#disposers) {
      try { dispose(); } catch (_) { /* ignore */ }
    }
    this.#disposers = [];
    if (this.#closeTimer) { clearTimeout(this.#closeTimer); this.#closeTimer = null; }
    if (activeBanner === this) activeBanner = null;
  }

  #wireEventSubscriptions() {
    if (this.#disposers.length) return;
    const requestId = this.#request.requestId;

    this.#disposers.push(onCinematicEvent(CINEMATIC_EVENTS.result, (payload) => {
      if (payload?.requestId !== requestId) return;
      this.#applyResult(payload);
    }));

    this.#disposers.push(onCinematicEvent(CINEMATIC_EVENTS.end, (payload) => {
      if (payload?.requestId !== requestId) return;
      this.#enterOutro(payload);
    }));

    this.#disposers.push(onCinematicEvent(CINEMATIC_EVENTS.cancel, (payload) => {
      if (payload?.requestId !== requestId) return;
      this.close({ force: true });
    }));
  }

  #scheduleIntroCompletion() {
    if (this.#phase !== "intro") return;
    setTimeout(() => {
      if (this.#phase !== "intro") return;
      this.#phase = "roll";
      this.render();
    }, INTRO_DURATION_MS);
  }

  /* -------------------------------------------- */
  /*  State transitions                           */
  /* -------------------------------------------- */

  #applyResult(payload) {
    const card = this.#cards.get(payload.actorUuid);
    if (!card) return;
    card.pending = false;
    card.result = {
      d20: payload.d20 ?? null,
      total: payload.total ?? payload.d20 ?? null,
      passed: payload.passed ?? null,
      rollFormula: payload.rollFormula ?? null
    };
    this.render();

    // GM is the one that decides when to end the request (typically
    // when every card has a result). Non-GM clients just update the
    // banner and wait for the end event.
    if (game.user?.isGM && [...this.#cards.values()].every((c) => c.result)) {
      broadcastCinematicEvent(CINEMATIC_EVENTS.end, {
        requestId: this.#request.requestId,
        aggregate: aggregateStatus([...this.#cards.values()])
      });
    }
  }

  #enterOutro(_payload) {
    if (this.#phase === "outro" || this.#phase === "closed") return;
    this.#phase = "outro";
    this.render();
    this.#closeTimer = setTimeout(() => this.close({ force: true }), OUTRO_CLOSE_DELAY_MS);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onActorRoll(event, target) {
    event?.preventDefault?.();
    const uuid = target?.dataset?.actorUuid;
    if (!uuid) return;
    await this.#rollForActor(uuid);
  }

  static #onDismiss(event) {
    event?.preventDefault?.();
    if (!game.user?.isGM) return;
    broadcastCinematicEvent(CINEMATIC_EVENTS.cancel, {
      requestId: this.#request.requestId
    });
    this.close({ force: true });
  }

  async #rollForActor(uuid) {
    const card = this.#cards.get(uuid);
    if (!card || card.result || card.pending) return;
    if (!card.canRoll) {
      ui.notifications?.warn("You don't own that actor.");
      return;
    }
    card.pending = true;
    this.render();

    // Commit 4 ships a stub d20; Commit 5 replaces this with real
    // resolver dispatch (skill / save / attribute / initiative).
    const roll = await new Roll("1d20").evaluate();
    const total = roll.total;

    broadcastCinematicEvent(CINEMATIC_EVENTS.result, {
      requestId: this.#request.requestId,
      actorUuid: uuid,
      d20: roll.terms?.[0]?.total ?? total,
      total,
      rollFormula: roll.formula,
      passed: null // resolver wiring in Commit 5 will populate this
    });
  }
}

/* ------------------------------------------------------------------ */
/* Singleton lifecycle                                                */
/* ------------------------------------------------------------------ */

export function registerCinematicBanner() {
  onCinematicEvent(CINEMATIC_EVENTS.begin, async (payload) => {
    if (activeBanner) {
      await activeBanner.close({ force: true });
      activeBanner = null;
    }
    activeBanner = new CinematicRollBanner(payload);
    activeBanner.render({ force: true });
  });
}

export function getCurrentBanner() {
  return activeBanner;
}
