import { SYSTEM_ID } from "./config.mjs";

const ANIMATION_SETTING = "enablePilotAnimations";
const SEQUENCER_MODULE_ID = "sequencer";
const JB2A_MODULE_IDS = ["jb2a_patreon", "JB2A_DnD5e"];

const PILOT_PROFILE_DEFINITIONS = {
  "Laser Pistol": {
    kind: "weapon",
    aliases: [/^built-in laser pistol\b/i],
    projectile: [
      "jb2a.energy_beam.normal.bluegreen.01.15ft",
      "jb2a.energy_beam.normal.dark_green.01.15ft",
      "jb2a.bullet.01.green.15ft"
    ],
    sourceBurst: [
      "jb2a.impact.001.green",
      "jb2a.impact.010.green"
    ],
    impact: [
      "jb2a.impact.010.green",
      "jb2a.impact.001.green"
    ],
    projectileScale: 0.8,
    sourceScale: 0.32,
    impactScale: 0.45
  },
  "Black Ray Gun": {
    kind: "weapon",
    aliases: [],
    projectile: [
      "jb2a.energy_beam.normal.dark_purplered.02.15ft",
      "jb2a.energy_beam.normal.dark_greenpurple.02.15ft",
      "jb2a.bullet.01.purple.15ft"
    ],
    sourceBurst: [
      "jb2a.impact.001.dark_purple",
      "jb2a.impact.012.dark_purple"
    ],
    impact: [
      "jb2a.impact.012.dark_purple",
      "jb2a.explosion.04.dark_purple",
      "jb2a.impact.001.dark_purple"
    ],
    projectileScale: 0.95,
    sourceScale: 0.38,
    impactScale: 0.62
  },
  "Force Field Generation": {
    kind: "mutation",
    aliases: [],
    burst: [
      "jb2a.energy_field.01.blue"
    ],
    loopBelow: [
      "jb2a.energy_field.02.below.blue"
    ],
    loopAbove: [
      "jb2a.energy_field.02.above.blue"
    ],
    loopScale: 1.25,
    burstScale: 1.42
  }
};

const availableDataPaths = new Set();
const activeBarrierEffects = new Map();
let hooksRegistered = false;
let missingSupportWarningShown = false;

function settingEnabled() {
  return game.settings?.get(SYSTEM_ID, ANIMATION_SETTING) ?? true;
}

function sequencerRuntimePresent() {
  return (
    !!game.modules?.get(SEQUENCER_MODULE_ID)?.active
    && typeof globalThis.Sequence === "function"
    && !!globalThis.Sequencer?.EffectManager
    && !!globalThis.Sequencer?.Database
  );
}

function jb2aRuntimePresent() {
  return JB2A_MODULE_IDS.some((id) => game.modules?.get(id)?.active);
}

function runtimeAvailable({ warn = false } = {}) {
  const available = settingEnabled() && sequencerRuntimePresent() && jb2aRuntimePresent();
  if (!available && warn && settingEnabled() && !missingSupportWarningShown) {
    missingSupportWarningShown = true;
    ui.notifications?.warn("Gamma World pilot animations need both Sequencer and JB2A active in this world.");
  }
  return available;
}

function primeAvailableDataPaths() {
  const keys = globalThis.Sequencer?.Database?.flattenedEntries ?? [];
  if (!availableDataPaths.size && Array.isArray(keys) && keys.length) {
    for (const key of keys) {
      if (typeof key === "string") availableDataPaths.add(key);
    }
  }
}

function firstAvailableDataPath(candidates = []) {
  if (!runtimeAvailable()) return null;
  primeAvailableDataPaths();
  for (const candidate of candidates) {
    if (availableDataPaths.has(candidate)) return candidate;
  }
  return null;
}

function normalizedName(name) {
  return String(name ?? "").trim().toLowerCase();
}

export function resolvePilotAnimationKey(name, { kind = "any" } = {}) {
  const normalized = normalizedName(name);
  if (!normalized) return "";

  for (const [key, profile] of Object.entries(PILOT_PROFILE_DEFINITIONS)) {
    if ((kind !== "any") && (profile.kind !== kind)) continue;
    if (normalized === normalizedName(key)) return key;
    if (profile.aliases.some((pattern) => pattern.test(String(name)))) return key;
  }

  return "";
}

function profileFor(name, options = {}) {
  const key = resolvePilotAnimationKey(name, options);
  return key ? { key, ...PILOT_PROFILE_DEFINITIONS[key] } : null;
}

function tokenUuid(token) {
  return token?.document?.uuid ?? token?.uuid ?? "";
}

function actorStateBarriers(actor) {
  return actor?.getFlag(SYSTEM_ID, "state")?.barriers ?? {};
}

function barrierEffectName(token, barrierId) {
  return `${SYSTEM_ID}.barrier.${tokenUuid(token)}.${String(barrierId ?? "barrier")}`;
}

function barrierEffectsForActor(actor) {
  return activeBarrierEffects.get(actor.uuid) ?? new Set();
}

function cacheBarrierEffects(actor, names) {
  if (!names.size) {
    activeBarrierEffects.delete(actor.uuid);
    return;
  }
  activeBarrierEffects.set(actor.uuid, names);
}

function tokenByUuid(uuid) {
  if (!uuid || !canvas?.tokens) return null;
  return canvas.tokens.placeables.find((token) => tokenUuid(token) === uuid) ?? null;
}

function activeSceneTokensForActor(actor) {
  return actor?.getActiveTokens?.() ?? [];
}

function playSequence(sequence) {
  try {
    return sequence.play();
  } catch (error) {
    console.warn(`${SYSTEM_ID} | Animation playback failed`, error);
    return false;
  }
}

function effectManagerActive(name) {
  const active = globalThis.Sequencer?.EffectManager?.getEffects?.({ name }) ?? [];
  return Array.isArray(active) ? active.length > 0 : false;
}

async function playWeaponSequence(profile, sourceToken, targetToken, { impactOnly = false } = {}) {
  if (!runtimeAvailable({ warn: true }) || !sourceToken || !targetToken) return false;

  const projectilePath = firstAvailableDataPath(profile.projectile);
  const sourceBurstPath = firstAvailableDataPath(profile.sourceBurst);
  const impactPath = firstAvailableDataPath(profile.impact);

  if (impactOnly && !impactPath) return false;
  if (!impactOnly && !projectilePath) return false;

  const sequence = new globalThis.Sequence();

  if (!impactOnly && sourceBurstPath) {
    sequence
      .effect()
      .file(sourceBurstPath)
      .atLocation(sourceToken)
      .rotateTowards(targetToken)
      .scaleToObject(profile.sourceScale ?? 0.35)
      .opacity(0.7)
      .fadeOut(150);
  }

  if (!impactOnly && projectilePath) {
    sequence
      .effect()
      .file(projectilePath)
      .atLocation(sourceToken)
      .stretchTo(targetToken)
      .scale(profile.projectileScale ?? 1)
      .waitUntilFinished(-120);
  }

  if (impactPath) {
    sequence
      .effect()
      .file(impactPath)
      .atLocation(targetToken)
      .scaleToObject(profile.impactScale ?? 0.5)
      .opacity(0.85)
      .fadeOut(180);
  }

  return playSequence(sequence);
}

function supportedBarrierEntries(actor) {
  return Object.values(actorStateBarriers(actor)).filter((barrier) => {
    if (!(Number(barrier?.remaining ?? 0) > 0)) return false;
    return !!resolvePilotAnimationKey(barrier.sourceName || barrier.label || "", { kind: "mutation" });
  });
}

function desiredBarrierEffects(actor) {
  const desired = new Map();
  const tokens = activeSceneTokensForActor(actor);
  const barriers = supportedBarrierEntries(actor);

  for (const token of tokens) {
    for (const barrier of barriers) {
      desired.set(barrierEffectName(token, barrier.id), { token, barrier });
    }
  }

  return desired;
}

async function startBarrierSequence(token, barrier) {
  const profile = profileFor(barrier.sourceName || barrier.label || "", { kind: "mutation" });
  if (!profile || !runtimeAvailable({ warn: true }) || !token) return false;

  const burstPath = firstAvailableDataPath(profile.burst);
  const loopBelowPath = firstAvailableDataPath(profile.loopBelow);
  const loopAbovePath = firstAvailableDataPath(profile.loopAbove);
  const effectName = barrierEffectName(token, barrier.id);

  if (!loopBelowPath && !loopAbovePath) return false;
  if (effectManagerActive(effectName)) return true;

  const sequence = new globalThis.Sequence();

  if (burstPath) {
    sequence
      .effect()
      .file(burstPath)
      .attachTo(token, { bindVisibility: false })
      .scaleToObject(profile.burstScale ?? 1.55)
      .opacity(0.82)
      .fadeOut(220)
      .waitUntilFinished(-180);
  }

  if (loopBelowPath) {
    sequence
      .effect()
      .file(loopBelowPath)
      .attachTo(token, { bindVisibility: false })
      .belowTokens()
      .name(effectName)
      .persist()
      .scaleToObject(profile.loopScale ?? 1.25)
      .opacity(0.44)
      .fadeIn(180);
  }

  if (loopAbovePath) {
    sequence
      .effect()
      .file(loopAbovePath)
      .attachTo(token, { bindVisibility: false })
      .name(effectName)
      .persist()
      .scaleToObject(profile.loopScale ?? 1.25)
      .opacity(0.36)
      .fadeIn(180);
  }

  return playSequence(sequence);
}

function stopBarrierSequenceByName(name) {
  if (!runtimeAvailable()) return false;
  try {
    globalThis.Sequencer?.EffectManager?.endEffects?.({ name });
    return true;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | Barrier animation cleanup failed`, error);
    return false;
  }
}

export async function playWeaponProjectile({ weaponName = "", sourceToken = null, targetToken = null } = {}) {
  const profile = profileFor(weaponName, { kind: "weapon" });
  if (!profile) return false;
  return playWeaponSequence(profile, sourceToken, targetToken, { impactOnly: false });
}

export async function playWeaponImpact({ weaponName = "", sourceToken = null, targetToken = null } = {}) {
  const profile = profileFor(weaponName, { kind: "weapon" });
  if (!profile) return false;
  return playWeaponSequence(profile, sourceToken, targetToken, { impactOnly: true });
}

export async function startBarrierEffect({ actor = null, token = null, barrierId = "", sourceName = "" } = {}) {
  if (!actor || !token || !barrierId) return false;
  return startBarrierSequence(token, {
    id: barrierId,
    sourceName
  });
}

export async function stopBarrierEffect({ token = null, barrierId = "" } = {}) {
  if (!token || !barrierId) return false;
  return stopBarrierSequenceByName(barrierEffectName(token, barrierId));
}

export async function syncBarrierEffectsForActor(actor) {
  if (!(actor instanceof Actor)) return;

  const desired = desiredBarrierEffects(actor);
  const desiredNames = new Set(desired.keys());
  const current = new Set(barrierEffectsForActor(actor));

  for (const effectName of current) {
    if (!desiredNames.has(effectName)) stopBarrierSequenceByName(effectName);
  }

  for (const [effectName, data] of desired.entries()) {
    if (current.has(effectName)) continue;
    await startBarrierSequence(data.token, data.barrier);
  }

  cacheBarrierEffects(actor, desiredNames);
}

function clearBarrierEffectsForTokenDocument(tokenDocument) {
  const targetUuid = tokenDocument?.uuid ?? "";
  if (!targetUuid) return;

  for (const [actorUuid, names] of activeBarrierEffects.entries()) {
    const retained = new Set();
    for (const name of names) {
      if (name.includes(`.${targetUuid}.`)) stopBarrierSequenceByName(name);
      else retained.add(name);
    }
    if (retained.size) activeBarrierEffects.set(actorUuid, retained);
    else activeBarrierEffects.delete(actorUuid);
  }
}

async function syncSceneBarrierEffects() {
  if (!runtimeAvailable()) return;
  for (const actor of game.actors?.contents ?? []) {
    if (!["character", "monster"].includes(actor.type)) continue;
    await syncBarrierEffectsForActor(actor);
  }
}

export function registerAnimationSettings() {
  game.settings.register(SYSTEM_ID, ANIMATION_SETTING, {
    name: game.i18n.localize("GAMMA_WORLD.Settings.PilotAnimations.Name"),
    hint: game.i18n.localize("GAMMA_WORLD.Settings.PilotAnimations.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: async () => {
      availableDataPaths.clear();
      missingSupportWarningShown = false;
      if (runtimeAvailable()) await syncSceneBarrierEffects();
      else {
        for (const names of activeBarrierEffects.values()) {
          for (const name of names) stopBarrierSequenceByName(name);
        }
        activeBarrierEffects.clear();
      }
    }
  });
}

export function registerAnimationHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  Hooks.on("ready", async () => {
    availableDataPaths.clear();
    primeAvailableDataPaths();
    await syncSceneBarrierEffects();
  });

  Hooks.on("canvasReady", async () => {
    await syncSceneBarrierEffects();
  });

  Hooks.on("updateActor", async (actor, changes) => {
    if (!["character", "monster"].includes(actor.type)) return;
    if (!(changes.flags?.[SYSTEM_ID])) return;
    await syncBarrierEffectsForActor(actor);
  });

  Hooks.on("createToken", (tokenDocument) => {
    const actor = tokenDocument?.actor ?? game.actors?.get(tokenDocument?.actorId);
    if (!actor) return;
    globalThis.setTimeout(() => {
      syncBarrierEffectsForActor(actor);
    }, 0);
  });

  Hooks.on("deleteToken", (tokenDocument) => {
    clearBarrierEffectsForTokenDocument(tokenDocument);
  });
}

export function createAnimationApi() {
  return {
    playWeaponProjectile,
    playWeaponImpact,
    startBarrierEffect,
    stopBarrierEffect
  };
}
