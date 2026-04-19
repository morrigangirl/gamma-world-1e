/**
 * 0.8.3 Cinematic Roll Request — roll-type registry.
 *
 * Pure-data module enumerating every kind of roll the GM can request
 * from players. Both the composer dialog (what form fields to show)
 * and the banner (what title / "ask" text to render) consume this
 * registry. Each entry names a `resolver` — the string key the banner
 * uses to pick which existing runner evaluates the roll on the actor.
 *
 * Adding a new roll type:
 *   1. Add an entry here with a unique `key`, a localizable label, and
 *      a resolver string from RESOLVERS below.
 *   2. If the type needs a new form field beyond DC / intensity / skill
 *      picker, extend the composer template to branch on `requires*`.
 *
 * The resolver string must be one of RESOLVERS — there's no runtime
 * fall-through. Foreign values throw at registry access so a macro
 * author who invents a type without wiring the runner fails fast.
 */

/**
 * Resolver keys consumed by the banner's roll-button handler. The
 * banner looks up the entry's `resolver`, then dispatches to the
 * matching helper elsewhere in the module tree:
 *
 *   attribute  → `module/dice.mjs` rollAttributeCheck
 *   save       → `module/dice.mjs` rollBareHazardSave (poison / radiation)
 *                 OR rollMentalSave (mental) — the evaluator decides
 *                 based on the entry's `saveType`.
 *   skill      → `module/skills.mjs` rollSkill (with suppressCard: true,
 *                 the banner renders the aggregate instead).
 *   initiative → Foundry's `Combat.rollInitiative` with the GW DX mod
 *                injected upstream.
 */
export const RESOLVERS = Object.freeze({
  attribute:  "attribute",
  save:       "save",
  skill:      "skill",
  initiative: "initiative"
});

/**
 * Category tags — used for grouping in the composer dialog's type picker
 * and for styling banner titles differently per category.
 */
export const CATEGORIES = Object.freeze(["attribute", "save", "skill", "initiative"]);

/**
 * The registry itself. Order here is the order shown in the composer.
 */
export const ROLL_TYPES = Object.freeze([
  // Ability checks — the six Gamma World attributes.
  {
    key: "attribute.ms",
    label: "GAMMA_WORLD.Cinematic.RollType.AttributeMS",
    category: "attribute",
    resolver: RESOLVERS.attribute,
    abilityKey: "ms",
    requiresDc: true,
    requiresIntensity: false,
    requiresSkill: false,
    requiresSaveType: false
  },
  {
    key: "attribute.in",
    label: "GAMMA_WORLD.Cinematic.RollType.AttributeIN",
    category: "attribute",
    resolver: RESOLVERS.attribute,
    abilityKey: "in",
    requiresDc: true,
    requiresIntensity: false,
    requiresSkill: false,
    requiresSaveType: false
  },
  {
    key: "attribute.dx",
    label: "GAMMA_WORLD.Cinematic.RollType.AttributeDX",
    category: "attribute",
    resolver: RESOLVERS.attribute,
    abilityKey: "dx",
    requiresDc: true,
    requiresIntensity: false,
    requiresSkill: false,
    requiresSaveType: false
  },
  {
    key: "attribute.ch",
    label: "GAMMA_WORLD.Cinematic.RollType.AttributeCH",
    category: "attribute",
    resolver: RESOLVERS.attribute,
    abilityKey: "ch",
    requiresDc: true,
    requiresIntensity: false,
    requiresSkill: false,
    requiresSaveType: false
  },
  {
    key: "attribute.cn",
    label: "GAMMA_WORLD.Cinematic.RollType.AttributeCN",
    category: "attribute",
    resolver: RESOLVERS.attribute,
    abilityKey: "cn",
    requiresDc: true,
    requiresIntensity: false,
    requiresSkill: false,
    requiresSaveType: false
  },
  {
    key: "attribute.ps",
    label: "GAMMA_WORLD.Cinematic.RollType.AttributePS",
    category: "attribute",
    resolver: RESOLVERS.attribute,
    abilityKey: "ps",
    requiresDc: true,
    requiresIntensity: false,
    requiresSkill: false,
    requiresSaveType: false
  },

  // Saves — the three hazard types. Mental uses the matrix; poison and
  // radiation use the 0.8.2 d20 + CN mod vs intensity homebrew. The
  // composer surfaces an intensity field for all three; the resolver
  // decides how to interpret it.
  {
    key: "save.mental",
    label: "GAMMA_WORLD.Cinematic.RollType.SaveMental",
    category: "save",
    resolver: RESOLVERS.save,
    saveType: "mental",
    requiresDc: false,
    requiresIntensity: true,
    requiresSkill: false,
    requiresSaveType: false
  },
  {
    key: "save.radiation",
    label: "GAMMA_WORLD.Cinematic.RollType.SaveRadiation",
    category: "save",
    resolver: RESOLVERS.save,
    saveType: "radiation",
    requiresDc: false,
    requiresIntensity: true,
    requiresSkill: false,
    requiresSaveType: false
  },
  {
    key: "save.poison",
    label: "GAMMA_WORLD.Cinematic.RollType.SavePoison",
    category: "save",
    resolver: RESOLVERS.save,
    saveType: "poison",
    requiresDc: false,
    requiresIntensity: true,
    requiresSkill: false,
    requiresSaveType: false
  },

  // Skill check — single entry; the composer dialog pops a second
  // dropdown listing the 25 canonical skills from config.mjs when
  // `requiresSkill` is set.
  {
    key: "skill",
    label: "GAMMA_WORLD.Cinematic.RollType.Skill",
    category: "skill",
    resolver: RESOLVERS.skill,
    requiresDc: true,
    requiresIntensity: false,
    requiresSkill: true,
    requiresSaveType: false
  },

  // Initiative — only offered when a Combat doc exists.
  {
    key: "initiative",
    label: "GAMMA_WORLD.Cinematic.RollType.Initiative",
    category: "initiative",
    resolver: RESOLVERS.initiative,
    requiresDc: false,
    requiresIntensity: false,
    requiresSkill: false,
    requiresSaveType: false
  }
]);

/**
 * Index for O(1) lookups. Throws on unknown keys so a banner that
 * instantiates with a bogus key fails immediately rather than silently
 * rendering a blank card.
 */
const ROLL_TYPES_BY_KEY = new Map(ROLL_TYPES.map((entry) => [entry.key, entry]));

export function getRollType(key) {
  const entry = ROLL_TYPES_BY_KEY.get(key);
  if (!entry) throw new Error(`Unknown Cinematic roll-type key: ${key}`);
  return entry;
}

export function hasRollType(key) {
  return ROLL_TYPES_BY_KEY.has(key);
}

export function rollTypesByCategory() {
  const grouped = Object.fromEntries(CATEGORIES.map((cat) => [cat, []]));
  for (const entry of ROLL_TYPES) {
    grouped[entry.category]?.push(entry);
  }
  return grouped;
}
