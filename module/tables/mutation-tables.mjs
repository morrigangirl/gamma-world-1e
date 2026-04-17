/**
 * Gamma World 1e mutation-table resolution.
 *
 * The physical and mental tables differ for humanoids and mutated animals,
 * include beneficial and defect entries on the same chart, and reserve high
 * rolls for either "good mutation" rerolls or "pick any mutation" results.
 */

import {
  MUTATION_TABLE_SPECIALS,
  entriesForSubtype
} from "./mutation-data.mjs";

const MAX_REROLLS = 100;

function normalizeCharacterType(type) {
  return type === "mutated-animal" ? "mutated-animal" : "humanoid";
}

function normalizeSubtype(subtype) {
  return subtype === "mental" ? "mental" : "physical";
}

function normalizePercentile(percentile, rng = Math.random) {
  const value = Number(percentile);
  if (Number.isInteger(value) && value >= 1 && value <= 100) return value;
  return Math.floor(rng() * 100) + 1;
}

function rangeIncludes(range, value) {
  if (!Array.isArray(range) || range.length !== 2) return false;
  return value >= range[0] && value <= range[1];
}

function chooseRandomEntry(entries, rng = Math.random) {
  if (!entries.length) return null;
  const index = Math.floor(rng() * entries.length);
  return entries[Math.max(0, Math.min(entries.length - 1, index))];
}

export function mutationEntriesFor(subtype, characterType, { beneficialOnly = false } = {}) {
  const normalizedSubtype = normalizeSubtype(subtype);
  const normalizedType = normalizeCharacterType(characterType);

  return entriesForSubtype(normalizedSubtype)
    .filter((entry) => Array.isArray(entry.ranges?.[normalizedType]))
    .filter((entry) => !beneficialOnly || entry.category !== "defect");
}

export function beneficialMutationChoices(subtype, characterType, excludeNames = []) {
  const excluded = new Set(excludeNames);
  const choices = mutationEntriesFor(subtype, characterType, { beneficialOnly: true })
    .filter((entry) => !excluded.has(entry.name));

  return choices.length
    ? choices
    : mutationEntriesFor(subtype, characterType, { beneficialOnly: true });
}

export function findMutationByPercentile(subtype, characterType, percentile) {
  const normalizedSubtype = normalizeSubtype(subtype);
  const normalizedType = normalizeCharacterType(characterType);
  const roll = normalizePercentile(percentile);

  return mutationEntriesFor(normalizedSubtype, normalizedType)
    .find((entry) => rangeIncludes(entry.ranges[normalizedType], roll)) ?? null;
}

export function specialMutationRoll(subtype, characterType, percentile) {
  const normalizedSubtype = normalizeSubtype(subtype);
  const normalizedType = normalizeCharacterType(characterType);
  const specials = MUTATION_TABLE_SPECIALS?.[normalizedSubtype]?.[normalizedType];
  const roll = normalizePercentile(percentile);

  if (!specials) return null;
  if (rangeIncludes(specials.good, roll)) return "good";
  if (rangeIncludes(specials.pick, roll)) return "pick";
  return null;
}

export function rollMutationPercentile(rng = Math.random) {
  return normalizePercentile(null, rng);
}

/**
 * Resolve a mutation roll into a concrete mutation entry.
 *
 * Returns:
 * {
 *   entry,                // mutation definition
 *   rolledPercentile,     // original percentile result
 *   resolvedPercentile,   // final percentile if rerolled
 *   special,              // null | "good" | "pick"
 *   subtype,              // "physical" | "mental"
 *   rolledSubtype         // original subtype argument
 * }
 */
export function pickMutation(subtype, {
  characterType = "humanoid",
  percentile = null,
  beneficialOnly = false,
  excludeNames = [],
  rng = Math.random
} = {}) {
  const normalizedSubtype = normalizeSubtype(subtype);
  const normalizedType = normalizeCharacterType(characterType);
  const excluded = new Set(excludeNames);
  const initialRoll = normalizePercentile(percentile, rng);

  let roll = initialRoll;
  let special = specialMutationRoll(normalizedSubtype, normalizedType, roll);
  let forceBeneficial = beneficialOnly || special === "good";

  for (let attempts = 0; attempts < MAX_REROLLS; attempts += 1) {
    if (special === "pick") {
      const entry = chooseRandomEntry(
        beneficialMutationChoices(normalizedSubtype, normalizedType, [...excluded]),
        rng
      );
      return {
        entry,
        rolledPercentile: initialRoll,
        resolvedPercentile: roll,
        special,
        subtype: normalizedSubtype,
        rolledSubtype: normalizedSubtype
      };
    }

    if (special === "good") {
      roll = rollMutationPercentile(rng);
      special = specialMutationRoll(normalizedSubtype, normalizedType, roll);
      forceBeneficial = true;
      if (special === "pick") continue;
    }

    const entry = findMutationByPercentile(normalizedSubtype, normalizedType, roll);
    if (!entry) {
      roll = rollMutationPercentile(rng);
      special = specialMutationRoll(normalizedSubtype, normalizedType, roll);
      continue;
    }

    if (forceBeneficial && entry.category === "defect") {
      roll = rollMutationPercentile(rng);
      special = specialMutationRoll(normalizedSubtype, normalizedType, roll);
      continue;
    }

    if (excluded.has(entry.name)) {
      roll = rollMutationPercentile(rng);
      special = specialMutationRoll(normalizedSubtype, normalizedType, roll);
      continue;
    }

    return {
      entry,
      rolledPercentile: initialRoll,
      resolvedPercentile: roll,
      special,
      subtype: normalizedSubtype,
      rolledSubtype: normalizedSubtype
    };
  }

  const fallback = chooseRandomEntry(
    forceBeneficial
      ? beneficialMutationChoices(normalizedSubtype, normalizedType, [...excluded])
      : mutationEntriesFor(normalizedSubtype, normalizedType),
    rng
  );

  return {
    entry: fallback,
    rolledPercentile: initialRoll,
    resolvedPercentile: roll,
    special,
    subtype: normalizedSubtype,
    rolledSubtype: normalizedSubtype
  };
}
