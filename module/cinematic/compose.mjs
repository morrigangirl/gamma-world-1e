/**
 * 0.8.3 Cinematic Roll Request — GM composer dialog.
 *
 * Opens a DialogV2 form that lets the GM:
 *   - pick one or more actors (defaults to controlled + targeted + active
 *     PCs, same selection heuristic request-rolls.mjs uses),
 *   - pick a roll type from ROLL_TYPES (grouped by category),
 *   - provide the context-sensitive parameters (DC for skill/attribute,
 *     intensity for saves, skill key when the type is "skill"),
 *   - set a title override + blind-mode toggle.
 *
 * On submit, emits `cinematic-begin` via the broadcast socket with a
 * self-contained payload — the banner (Commit 4) subscribes to that
 * event and renders on every client. Nothing else in this module
 * depends on the banner existing yet, so the composer is shippable
 * standalone.
 */

import { SYSTEM_ID, SKILLS } from "../config.mjs";
import { preferredSaveUserId } from "../save-flow.mjs";
import {
  ROLL_TYPES,
  CATEGORIES,
  getRollType,
  hasRollType
} from "./roll-types.mjs";
import { CINEMATIC_EVENTS, broadcastCinematicEvent } from "./socket.mjs";

// Tiny inline copy of dice.mjs's resolveTargetActor so we don't pull
// in the whole dice module (which accesses `foundry.applications.api`
// at module-top and therefore blows up when imported in node tests).
function resolveTargetActor(token) {
  if (!token) return null;
  if (token.actor) return token.actor;
  const actorId = token.document?.actorId ?? token.actor?.id ?? null;
  return game?.actors?.get?.(actorId) ?? null;
}

const DialogV2 = () => foundry.applications.api.DialogV2;

function uniqueActors(actors) {
  const seen = new Set();
  return actors.filter((actor) => {
    if (!actor?.uuid || seen.has(actor.uuid)) return false;
    seen.add(actor.uuid);
    return true;
  });
}

function currentSelectionActors() {
  return uniqueActors([
    ...(canvas.tokens?.controlled ?? []).map((token) => resolveTargetActor(token)).filter(Boolean),
    ...[...(game.user?.targets ?? new Set())].map((token) => resolveTargetActor(token)).filter(Boolean)
  ]);
}

function candidateActors() {
  const users = typeof game.users?.filter === "function"
    ? game.users.filter(() => true)
    : Array.from(game.users ?? []);
  const selected = currentSelectionActors();
  const selectedIds = new Set(selected.map((actor) => actor.uuid));
  const sceneTokens = Array.from(canvas.scene?.tokens ?? []);
  const sceneActors = uniqueActors(sceneTokens
    .map((token) => token.actor ?? game.actors?.get(token.actorId))
    .filter(Boolean));
  const actors = (sceneActors.length ? sceneActors : Array.from(game.actors?.contents ?? []))
    .filter((actor) => ["character", "monster"].includes(actor.type))
    .filter((actor) => preferredSaveUserId(actor, users));
  const sorted = actors.sort((left, right) => left.name.localeCompare(right.name));
  return uniqueActors([
    ...selected,
    ...sorted.filter((actor) => !selectedIds.has(actor.uuid))
  ]);
}

function actorRowMarkup(actors, preChecked) {
  return actors.map((actor) => {
    const checked = preChecked.has(actor.uuid) ? " checked" : "";
    const owner = actor.hasPlayerOwner ? " · <span class=\"gw-cinematic-compose__owner-hint\">player</span>" : "";
    return `<label class="gw-cinematic-compose__target">
      <input type="checkbox" name="targetUuid" value="${actor.uuid}"${checked}>
      <span class="gw-cinematic-compose__target-name">${foundry.utils.escapeHTML(actor.name)}</span>
      ${owner}
    </label>`;
  }).join("");
}

function localize(key, fallback) {
  const s = game.i18n?.localize?.(key);
  if (s && s !== key) return s;
  return fallback;
}

function rollTypeOptions() {
  // Group by category for readability. A combat-less scene still shows
  // the initiative entry but we'll disable it when no Combat doc exists.
  const groupLabels = {
    attribute:  localize("GAMMA_WORLD.Cinematic.Category.Attribute",  "Attribute Checks"),
    save:       localize("GAMMA_WORLD.Cinematic.Category.Save",       "Saves"),
    skill:      localize("GAMMA_WORLD.Cinematic.Category.Skill",      "Skills"),
    initiative: localize("GAMMA_WORLD.Cinematic.Category.Initiative", "Initiative")
  };
  return CATEGORIES.map((cat) => {
    const entries = ROLL_TYPES.filter((entry) => entry.category === cat);
    if (!entries.length) return "";
    const opts = entries.map((entry) => {
      const lbl = localize(entry.label, entry.key);
      return `<option value="${entry.key}">${foundry.utils.escapeHTML(lbl)}</option>`;
    }).join("");
    return `<optgroup label="${foundry.utils.escapeHTML(groupLabels[cat] ?? cat)}">${opts}</optgroup>`;
  }).join("");
}

function skillOptions() {
  return Object.entries(SKILLS).map(([key, def]) => {
    const lbl = localize(def.label, key);
    return `<option value="${key}">${foundry.utils.escapeHTML(lbl)}</option>`;
  }).join("");
}

function composerHtml(actors, preChecked) {
  return `<form class="gw-cinematic-compose">
    <label class="gw-cinematic-compose__field">
      ${foundry.utils.escapeHTML(localize("GAMMA_WORLD.Cinematic.Compose.Type", "Roll Type"))}
      <select name="rollTypeKey">${rollTypeOptions()}</select>
    </label>
    <label class="gw-cinematic-compose__field" data-visible-for="skill">
      ${foundry.utils.escapeHTML(localize("GAMMA_WORLD.Cinematic.Compose.Skill", "Skill"))}
      <select name="skillKey">${skillOptions()}</select>
    </label>
    <label class="gw-cinematic-compose__field" data-visible-for="dc">
      ${foundry.utils.escapeHTML(localize("GAMMA_WORLD.Cinematic.Compose.DC", "DC"))}
      <input type="number" name="dc" value="15" min="1" max="40">
    </label>
    <label class="gw-cinematic-compose__field" data-visible-for="intensity">
      ${foundry.utils.escapeHTML(localize("GAMMA_WORLD.Cinematic.Compose.Intensity", "Intensity"))}
      <input type="number" name="intensity" value="12" min="0" max="30">
    </label>
    <label class="gw-cinematic-compose__field">
      ${foundry.utils.escapeHTML(localize("GAMMA_WORLD.Cinematic.Compose.Title", "Title (optional)"))}
      <input type="text" name="title" placeholder="${foundry.utils.escapeHTML(localize("GAMMA_WORLD.Cinematic.Compose.TitlePlaceholder", "Leave blank for auto-generated"))}">
    </label>
    <fieldset class="gw-cinematic-compose__targets">
      <legend>${foundry.utils.escapeHTML(localize("GAMMA_WORLD.Cinematic.Compose.Targets", "Actors"))}</legend>
      <div class="gw-cinematic-compose__target-list">
        ${actorRowMarkup(actors, preChecked)}
      </div>
    </fieldset>
    <fieldset class="gw-cinematic-compose__toggles">
      <label><input type="checkbox" name="blind"> ${foundry.utils.escapeHTML(localize("GAMMA_WORLD.Cinematic.Compose.Blind", "Blind (hide results until reveal)"))}</label>
    </fieldset>
  </form>`;
}

/**
 * Given the form's compiled data + the entry registry, produce the
 * canonical request payload we emit over the socket. Pure JS; tests
 * exercise this without touching DialogV2.
 */
export function buildBeginPayload(rawForm, { actorUuids, user }) {
  const rollTypeKey = String(rawForm.rollTypeKey || "").trim();
  if (!hasRollType(rollTypeKey)) {
    throw new Error(`Cinematic composer produced unknown rollTypeKey: ${rollTypeKey}`);
  }
  const entry = getRollType(rollTypeKey);
  const requestId = (typeof foundry !== "undefined" && foundry?.utils?.randomID)
    ? foundry.utils.randomID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const payload = {
    requestId,
    rollTypeKey,
    resolver: entry.resolver,
    category: entry.category,
    actorUuids: Array.isArray(actorUuids) ? [...actorUuids] : [],
    title: String(rawForm.title || "").trim(),
    blind: !!rawForm.blind,
    requesterId: user?.id ?? null
  };

  if (entry.requiresSkill) {
    payload.skillKey = String(rawForm.skillKey || "").trim();
    if (!payload.skillKey || !SKILLS[payload.skillKey]) {
      throw new Error(`Cinematic skill roll needs a valid skillKey; got "${payload.skillKey}"`);
    }
  }
  if (entry.requiresDc) {
    payload.dc = Math.round(Number(rawForm.dc) || 0);
  }
  if (entry.requiresIntensity) {
    payload.intensity = Math.round(Number(rawForm.intensity) || 0);
  }
  if (entry.abilityKey) payload.abilityKey = entry.abilityKey;
  if (entry.saveType)   payload.saveType   = entry.saveType;

  return payload;
}

/**
 * GM-facing entry point. Opens the composer, collects answers, and
 * broadcasts the `cinematic-begin` event. The banner (wired in the
 * next commit) subscribes to that event and renders on every client.
 */
export async function openCinematicComposer() {
  if (!game.user?.isGM) {
    ui.notifications?.warn(localize("GAMMA_WORLD.Cinematic.Compose.GMOnly", "Only the GM can request a cinematic roll."));
    return null;
  }

  const actors = candidateActors();
  if (!actors.length) {
    ui.notifications?.warn(localize("GAMMA_WORLD.Cinematic.Compose.NoActors", "No eligible actors to roll."));
    return null;
  }
  const preChecked = new Set(currentSelectionActors().map((actor) => actor.uuid));
  if (!preChecked.size && actors.length === 1) preChecked.add(actors[0].uuid);

  const result = await DialogV2().prompt({
    id: `${SYSTEM_ID}-cinematic-compose`,
    window: { title: localize("GAMMA_WORLD.Cinematic.Compose.Title.Window", "Cinematic Roll Request") },
    position: { width: 520 },
    content: composerHtml(actors, preChecked),
    ok: {
      label: localize("GAMMA_WORLD.Cinematic.Compose.Send", "Roll!"),
      callback: (_event, button) => {
        const form = button.form;
        const data = new foundry.applications.ux.FormDataExtended(form).object;
        const targetUuids = Array.from(form.querySelectorAll('input[name="targetUuid"]:checked')).map((input) => input.value);
        return { data, targetUuids };
      }
    },
    rejectClose: false,
    render: (_event, app) => {
      // Context-sensitive field visibility. Toggles when the roll-type
      // picker changes.
      const root = app?.element ?? app;
      const select = root?.querySelector?.("select[name=\"rollTypeKey\"]");
      const fields = root?.querySelectorAll?.(".gw-cinematic-compose__field[data-visible-for]");
      if (!select || !fields) return;
      const updateVisibility = () => {
        const entry = hasRollType(select.value) ? getRollType(select.value) : null;
        for (const field of fields) {
          const visibleFor = field.getAttribute("data-visible-for");
          let show = false;
          if (entry) {
            if (visibleFor === "skill") show = !!entry.requiresSkill;
            else if (visibleFor === "dc") show = !!entry.requiresDc;
            else if (visibleFor === "intensity") show = !!entry.requiresIntensity;
          }
          field.style.display = show ? "" : "none";
        }
      };
      updateVisibility();
      select.addEventListener("change", updateVisibility);
    }
  });
  if (!result) return null;

  const { data, targetUuids } = result;
  if (!targetUuids?.length) {
    ui.notifications?.warn(localize("GAMMA_WORLD.Cinematic.Compose.NoTargets", "Pick at least one actor."));
    return null;
  }

  let payload;
  try {
    payload = buildBeginPayload(data, { actorUuids: targetUuids, user: game.user });
  } catch (error) {
    ui.notifications?.error(error?.message ?? String(error));
    return null;
  }

  broadcastCinematicEvent(CINEMATIC_EVENTS.begin, payload);
  return payload;
}
