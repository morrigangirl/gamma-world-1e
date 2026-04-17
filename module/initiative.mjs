import { SYSTEM_ID } from "./config.mjs";

export function initiativeBonusFromDexterity(score) {
  return Math.round(Number(score) || 0) >= 17 ? 1 : 0;
}

export function actorDexterityForInitiative(actor) {
  if (!actor) return 0;
  const base = Math.round(Number(actor.system?.attributes?.dx?.value ?? 0));
  const state = actor.getFlag?.(SYSTEM_ID, "state") ?? {};
  const temporaryEffects = Array.isArray(state.temporaryEffects) ? state.temporaryEffects : [];
  const delta = temporaryEffects.reduce((sum, effect) => (
    sum + Math.round(Number(effect?.changes?.attributes?.dx) || 0)
  ), 0);
  return base + delta;
}

export function initiativeAbilityModifier(score) {
  return Math.floor((Math.round(Number(score) || 0) - 10) / 2);
}

export function actorInitiativeModifier(actor) {
  return initiativeAbilityModifier(actorDexterityForInitiative(actor));
}

export function fiveEInitiativeFormula() {
  return "1d20 + @attributes.dx.mod";
}
