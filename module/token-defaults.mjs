import { SYSTEM_ID } from "./config.mjs";

export const TOKEN_DISPLAY_MODES = Object.freeze({
  NONE: 0,
  CONTROL: 10,
  OWNER_HOVER: 20,
  HOVER: 30,
  OWNER: 40,
  ALWAYS: 50
});

export const TOKEN_DISPOSITIONS = Object.freeze({
  SECRET: -2,
  HOSTILE: -1,
  NEUTRAL: 0,
  FRIENDLY: 1
});

export const DEFAULT_TOKEN_SIGHT_RANGE = 60;

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  return value && (typeof value === "object")
    ? JSON.parse(JSON.stringify(value))
    : {};
}

export function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function monsterPortraitPath(name) {
  return `systems/${SYSTEM_ID}/assets/monsters/portraits/${slugify(name)}.png`;
}

export function monsterTokenPath(name) {
  return `systems/${SYSTEM_ID}/assets/monsters/tokens/${slugify(name)}.png`;
}

function actorImage(actor) {
  return String(actor?.img ?? "");
}

function actorName(actor) {
  return String(actor?.name ?? "");
}

function actorType(actor) {
  return String(actor?.type ?? "character");
}

function currentPrototypeToken(actor) {
  return clone(actor?.prototypeToken?.toObject?.() ?? actor?.prototypeToken ?? actor?._source?.prototypeToken ?? {});
}

function tokenTextureFromActor(actor, explicitTextureSrc = "") {
  if (explicitTextureSrc) return explicitTextureSrc;
  const current = currentPrototypeToken(actor);
  const img = actorImage(actor);
  if ((actorType(actor) === "monster") && img.includes(`/systems/${SYSTEM_ID}/assets/monsters/portraits/`)) {
    return img.replace("/portraits/", "/tokens/");
  }
  return String(current.texture?.src ?? img ?? "");
}

export function defaultPrototypeTokenOptions(actor, {
  textureSrc = "",
  disposition = null,
  actorLink = null,
  sightRange = DEFAULT_TOKEN_SIGHT_RANGE
} = {}) {
  const type = actorType(actor);
  return {
    name: actorName(actor),
    actorLink: actorLink ?? (type === "character"),
    disposition: disposition ?? (type === "monster" ? TOKEN_DISPOSITIONS.HOSTILE : TOKEN_DISPOSITIONS.FRIENDLY),
    displayName: TOKEN_DISPLAY_MODES.OWNER_HOVER,
    displayBars: TOKEN_DISPLAY_MODES.OWNER_HOVER,
    width: 1,
    height: 1,
    barAttribute: "resources.hp",
    sightRange,
    textureSrc: tokenTextureFromActor(actor, textureSrc),
    ringEnabled: false
  };
}

export function createPrototypeTokenSource(config) {
  const sightRange = Math.max(0, numeric(config.sightRange, DEFAULT_TOKEN_SIGHT_RANGE));
  return {
    name: String(config.name ?? ""),
    actorLink: !!config.actorLink,
    disposition: numeric(config.disposition, TOKEN_DISPOSITIONS.NEUTRAL),
    displayName: numeric(config.displayName, TOKEN_DISPLAY_MODES.OWNER_HOVER),
    displayBars: numeric(config.displayBars, TOKEN_DISPLAY_MODES.OWNER_HOVER),
    width: Math.max(1, numeric(config.width, 1)),
    height: Math.max(1, numeric(config.height, 1)),
    bar1: {
      attribute: config.barAttribute ?? "resources.hp"
    },
    texture: {
      src: String(config.textureSrc ?? "")
    },
    sight: {
      enabled: sightRange > 0,
      range: sightRange,
      visionMode: "basic"
    },
    ring: {
      enabled: !!config.ringEnabled
    }
  };
}

export function prototypeTokenNeedsPolish(actor) {
  const current = currentPrototypeToken(actor);
  return numeric(current.displayName, TOKEN_DISPLAY_MODES.NONE) === TOKEN_DISPLAY_MODES.NONE
    && numeric(current.displayBars, TOKEN_DISPLAY_MODES.NONE) === TOKEN_DISPLAY_MODES.NONE
    && numeric(current.sight?.range, 0) === 0;
}

function maybeSet(update, path, current, desired, condition = true) {
  if (!condition) return;
  if (current !== desired) update[path] = desired;
}

export function prototypeTokenMigrationUpdate(actor, options = {}) {
  const current = currentPrototypeToken(actor);
  const desired = createPrototypeTokenSource(defaultPrototypeTokenOptions(actor, options));
  const polish = !!options.force || prototypeTokenNeedsPolish(actor);
  const update = {};

  maybeSet(update, "prototypeToken.name", current.name ?? "", desired.name, polish || !current.name);
  maybeSet(update, "prototypeToken.actorLink", current.actorLink ?? null, desired.actorLink, polish || (current.actorLink == null));
  maybeSet(update, "prototypeToken.disposition", numeric(current.disposition, TOKEN_DISPOSITIONS.NEUTRAL), desired.disposition, polish || (current.disposition == null));
  maybeSet(update, "prototypeToken.displayName", numeric(current.displayName, TOKEN_DISPLAY_MODES.NONE), desired.displayName, polish || (current.displayName == null));
  maybeSet(update, "prototypeToken.displayBars", numeric(current.displayBars, TOKEN_DISPLAY_MODES.NONE), desired.displayBars, polish || (current.displayBars == null));
  maybeSet(update, "prototypeToken.width", numeric(current.width, 1), desired.width, polish || (current.width == null));
  maybeSet(update, "prototypeToken.height", numeric(current.height, 1), desired.height, polish || (current.height == null));
  maybeSet(update, "prototypeToken.bar1.attribute", current.bar1?.attribute ?? null, desired.bar1.attribute, polish || !current.bar1?.attribute);
  maybeSet(update, "prototypeToken.texture.src", String(current.texture?.src ?? ""), desired.texture.src, (polish || !current.texture?.src) && !!desired.texture.src);
  maybeSet(update, "prototypeToken.sight.enabled", current.sight?.enabled ?? null, desired.sight.enabled, polish || (current.sight?.enabled == null));
  maybeSet(update, "prototypeToken.sight.range", numeric(current.sight?.range, 0), desired.sight.range, polish || (current.sight?.range == null));
  maybeSet(update, "prototypeToken.sight.visionMode", current.sight?.visionMode ?? "", desired.sight.visionMode, polish || !current.sight?.visionMode);
  maybeSet(update, "prototypeToken.ring.enabled", current.ring?.enabled ?? null, desired.ring.enabled, polish || (current.ring?.enabled == null));

  return update;
}
