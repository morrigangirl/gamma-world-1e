import { ATTRIBUTE_KEYS } from "./config.mjs";
import {
  requestAbilityRollResolution,
  requestSaveResolution,
  resolveTargetActor
} from "./dice.mjs";
import { preferredSaveUserId } from "./save-flow.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

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

function requestCandidateActors() {
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

function actorCheckboxList(actors, checkedUuids) {
  return actors.map((actor) => {
    const checked = checkedUuids.has(actor.uuid) ? "checked" : "";
    return `<label class="gw-roll-request__target">
      <input type="checkbox" name="targetUuid" value="${actor.uuid}" ${checked}>
      <span>${foundry.utils.escapeHTML(actor.name)}</span>
    </label>`;
  }).join("");
}

function abilityOptions() {
  return ATTRIBUTE_KEYS.map((key) => (
    `<option value="${key}">${foundry.utils.escapeHTML(game.i18n.localize(`GAMMA_WORLD.Attribute.${key.toUpperCase()}.full`))}</option>`
  )).join("");
}

async function promptRollRequest(actors) {
  const preselected = new Set(currentSelectionActors().map((actor) => actor.uuid));
  if (!preselected.size && (actors.length === 1)) preselected.add(actors[0].uuid);

  return DialogV2.prompt({
    window: { title: game.i18n.localize("GAMMA_WORLD.RollRequest.Title") },
    content: `<form class="gw-roll-request-form">
      <label>
        ${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.Type"))}
        <select name="requestType">
          <option value="mental">${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.Mental"))}</option>
          <option value="radiation">${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.Radiation"))}</option>
          <option value="ability">${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.Ability"))}</option>
        </select>
      </label>
      <label>
        ${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.Reason"))}
        <input type="text" name="sourceName" value="">
      </label>
      <fieldset class="gw-roll-request__targets">
        <legend>${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.Targets"))}</legend>
        <div class="gw-roll-request__target-list">
          ${actorCheckboxList(actors, preselected)}
        </div>
      </fieldset>
      <fieldset class="gw-roll-request__fields">
        <legend>${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.SaveFields"))}</legend>
        <label>
          ${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.MentalStrength"))}
          <input type="number" name="mentalIntensity" value="10" min="3" max="18">
        </label>
        <label>
          ${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.RadiationIntensity"))}
          <input type="number" name="radiationIntensity" value="10" min="3" max="18">
        </label>
      </fieldset>
      <fieldset class="gw-roll-request__fields">
        <legend>${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.AbilityFields"))}</legend>
        <label>
          ${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.AbilityKey"))}
          <select name="abilityKey">
            ${abilityOptions()}
          </select>
        </label>
        <label>
          ${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.Modifier"))}
          <input type="number" name="situationalModifier" value="0" min="-20" max="20">
        </label>
        <label>
          ${foundry.utils.escapeHTML(game.i18n.localize("GAMMA_WORLD.RollRequest.DC"))}
          <input type="number" name="dc" value="" min="1" max="30" placeholder="optional">
        </label>
      </fieldset>
    </form>`,
    ok: {
      label: game.i18n.localize("GAMMA_WORLD.RollRequest.Send"),
      callback: (_event, button) => {
        const form = button.form;
        const data = new foundry.applications.ux.FormDataExtended(form).object;
        return {
          requestType: String(data.requestType || "mental"),
          sourceName: String(data.sourceName || "").trim(),
          targetUuids: Array.from(form.querySelectorAll('input[name="targetUuid"]:checked')).map((input) => input.value),
          mentalIntensity: Math.round(Number(data.mentalIntensity) || 10),
          radiationIntensity: Math.round(Number(data.radiationIntensity) || 10),
          abilityKey: String(data.abilityKey || "ms"),
          situationalModifier: Math.round(Number(data.situationalModifier) || 0),
          dc: data.dc === "" ? null : Math.round(Number(data.dc) || 0)
        };
      }
    },
    rejectClose: false
  });
}

export async function openChatRollRequestDialog() {
  if (!game.user?.isGM) return;

  const actors = requestCandidateActors();
  if (!actors.length) {
    ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.RollRequest.NoActors"));
    return;
  }

  const request = await promptRollRequest(actors);
  if (!request) return;

  const actorMap = new Map(actors.map((actor) => [actor.uuid, actor]));
  const targets = request.targetUuids.map((uuid) => actorMap.get(uuid)).filter(Boolean);
  if (!targets.length) {
    ui.notifications?.warn(game.i18n.localize("GAMMA_WORLD.RollRequest.NoTargets"));
    return;
  }

  await Promise.all(targets.map(async (actor) => {
    if (request.requestType === "ability") {
      return requestAbilityRollResolution(actor, request.abilityKey, {
        sourceName: request.sourceName,
        situationalModifier: request.situationalModifier,
        dc: request.dc
      });
    }

    const intensity = request.requestType === "mental"
      ? request.mentalIntensity
      : request.radiationIntensity;
    return requestSaveResolution(actor, request.requestType, {
      sourceName: request.sourceName,
      intensity,
      inputLocked: true
    });
  }));
}
