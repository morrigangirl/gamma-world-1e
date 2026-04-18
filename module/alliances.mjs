/**
 * Gamma World 1e Cryptic Alliances — data and mechanical helpers.
 *
 * RAW (p. 27): nine secretive factions with agendas that shape reactions,
 * morale, and encounter outcomes. Most alliances accept humanoid PCs more
 * readily than pure mutants or pure strain humans; some are the opposite.
 */

/**
 * Alliance reference data. Keys match `CRYPTIC_ALLIANCES` in config.mjs.
 *
 * - purpose:         one-line charter description (for journal import).
 * - allies/enemies:  alliance-key arrays for inter-faction reaction hints.
 * - accepts:         character-type keys the alliance is most welcoming to.
 * - reactionBonus:   default modifier applied on reaction rolls when the
 *                    PC identifies themselves as a member to a kindred NPC.
 */
export const ALLIANCE_DATA = {
  brotherhood: {
    label: "Brotherhood of Thought",
    purpose: "Preserve pre-Shadow-Years knowledge and champion peaceful coexistence among mutants and PSH.",
    allies: ["seekers", "healers"],
    enemies: ["ranks-of-the-fit", "radiationists"],
    accepts: ["psh", "humanoid", "mutated-animal", "mutated-plant"],
    reactionBonus: +2
  },
  seekers: {
    label: "The Seekers",
    purpose: "Hunt down Ancient artifacts and the lost secrets of their creators.",
    allies: ["brotherhood", "restorationists"],
    enemies: ["radiationists"],
    accepts: ["psh", "humanoid", "mutated-animal"],
    reactionBonus: +1
  },
  zoopremisists: {
    label: "Zoopremisists",
    purpose: "Hold that mutated animals are the rightful heirs of the world.",
    allies: ["ranks-of-the-fit"],
    enemies: ["restorationists", "ranks-of-the-fit"],
    accepts: ["mutated-animal"],
    reactionBonus: +2
  },
  healers: {
    label: "The Healers",
    purpose: "Treat the wounded and dispossessed of the wastes without preference.",
    allies: ["brotherhood"],
    enemies: [],
    accepts: ["psh", "humanoid", "mutated-animal", "mutated-plant", "robot"],
    reactionBonus: +1
  },
  restorationists: {
    label: "Restorationists",
    purpose: "Rebuild the pre-war technological civilization under human leadership.",
    allies: ["ranks-of-the-fit"],
    enemies: ["zoopremisists", "radiationists"],
    accepts: ["psh", "humanoid"],
    reactionBonus: +1
  },
  followers: {
    label: "Followers of the Voice",
    purpose: "Obey the signals of a mysterious broadcast from deep in the wastes.",
    allies: [],
    enemies: [],
    accepts: ["humanoid", "mutated-animal"],
    reactionBonus: 0
  },
  "ranks-of-the-fit": {
    label: "Ranks of the Fit",
    purpose: "Militant purity — humans and hardy humanoids only; cleanse the world of deviants.",
    allies: ["restorationists"],
    enemies: ["zoopremisists", "created", "radiationists"],
    accepts: ["psh", "humanoid"],
    reactionBonus: +2
  },
  archivists: {
    label: "The Archivists",
    purpose: "Catalogue every pre-war document, artifact, and scrap of data.",
    allies: ["brotherhood", "seekers"],
    enemies: [],
    accepts: ["psh", "humanoid", "mutated-animal", "mutated-plant"],
    reactionBonus: +1
  },
  radiationists: {
    label: "Radiationists",
    purpose: "Revere radiation as a purifying force; embrace mutation as divine.",
    allies: [],
    enemies: ["brotherhood", "seekers", "restorationists", "ranks-of-the-fit"],
    accepts: ["humanoid", "mutated-animal", "mutated-plant"],
    reactionBonus: +1
  },
  created: {
    label: "The Created",
    purpose: "Secret alliance of sentient robots and androids planning humanity's replacement.",
    allies: [],
    enemies: ["ranks-of-the-fit"],
    accepts: ["robot"],
    reactionBonus: +2
  }
};

const ALLIANCE_KEYS = Object.keys(ALLIANCE_DATA);

export function allianceRecord(key) {
  if (!key) return null;
  return ALLIANCE_DATA[key] ?? null;
}

/** Does the alliance welcome this character type? */
export function allianceAccepts(key, characterType) {
  const record = allianceRecord(key);
  if (!record) return false;
  return record.accepts.includes(characterType);
}

/**
 * Reaction modifier between an actor and a target based on alliance affinity.
 * Positive means friendlier, negative means hostile.
 */
export function allianceReactionModifier(actor, target) {
  const actorAlliance = actor?.system?.details?.alliance ?? "";
  const targetAlliance = target?.system?.details?.alliance ?? "";
  if (!actorAlliance || !targetAlliance) return 0;
  if (!ALLIANCE_KEYS.includes(actorAlliance) || !ALLIANCE_KEYS.includes(targetAlliance)) return 0;
  if (actorAlliance === targetAlliance) {
    return ALLIANCE_DATA[actorAlliance].reactionBonus ?? 0;
  }
  const record = ALLIANCE_DATA[actorAlliance];
  if (record.allies.includes(targetAlliance)) return Math.max(1, Math.floor((record.reactionBonus ?? 0) / 2));
  if (record.enemies.includes(targetAlliance)) return -2;
  return 0;
}
