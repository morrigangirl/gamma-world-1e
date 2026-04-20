import { findMutationByName } from "./tables/mutation-data.mjs";
import { mutationDescriptionFor } from "./tables/mutation-descriptions.generated.mjs";

/**
 * 0.8.4 Tier 1 — ActiveEffect migration pilot.
 *
 * Foundry core's ACTIVE_EFFECT_MODES mapped to the numeric enum values
 * Foundry uses on-wire. Referenced when authoring `effects` arrays on
 * mutation rule entries so the rule table stays readable without a
 * CONST import at module-top.
 */
const AE_MODE = Object.freeze({
  CUSTOM:    0,
  MULTIPLY:  1,
  ADD:       2,
  DOWNGRADE: 3,
  UPGRADE:   4,
  OVERRIDE:  5
});

/**
 * Pilot mutations that have been migrated to the AE-style data-driven
 * effects pipeline. When a mutation's name appears in this set AND its
 * rule entry declares an `effects` array, `applyMutationModifiers`
 * skips its hardcoded case branch and defers to `applyMutationEffects`
 * below, which reads the `effects` data off the rule and applies the
 * changes to derived.
 *
 * Growing this set is the Tier 2 delivery — add more mutations, remove
 * their case branches, populate their `effects` in the rule table.
 */
export const AE_MIGRATED_MUTATIONS = new Set([
  // Tier 1 (0.8.4)
  "Heightened Strength",
  "Radar/Sonar",
  "Wings",
  "Shorter",
  "Taller",
  "Fat Cell Accumulation",
  "Vision Defect",
  "Weight Decrease",
  "Intuition",
  "Heightened Hearing",
  // Tier 2 (0.8.5) — fixed-value passives with no attribute scaling
  // or enabled-gate; mental resistance tweaks rely on the existing
  // 3-18 clamp in buildActorDerived to cap at 18 after the ADD fires.
  "Double Physical Pain",
  "Multiple Damage",
  "Heightened Intelligence",
  "Mental Defense Shield",
  "Heightened Precision",
  "Increased Speed",
  "Mental Defenselessness",
  "Molecular Understanding",
  "Partial Carapace",
  "Heightened Smell",
  "Heightened Vision",
  "Ultravision",
  "Infravision",
  "Total Carapace",
  // Phase 3 (0.8.6) — holdouts migrated via the conditional-effects
  // framework. Telekinetic Flight and Heightened Constitution slot into
  // the existing Tier 2 pattern; the rest exercise condition /
  // computeValue / compound condition primitives.
  "Telekinetic Flight",
  "Heightened Constitution",
  // Phase 3 Genius Capability retirement — three standalone mutations
  // replace the variant-branched original. Military / Economic slot
  // into the existing Tier 2 pattern (literal ADDs, no condition).
  // Scientific Genius targets `system.skills.<key>.bonus` (Foundry
  // core AE applies these) plus `gw.artifactAnalysisBonus`.
  "Military Genius",
  "Economic Genius",
  "Scientific Genius",
  // Phase 3 conditional holdouts — three primitives the earlier tiers
  // couldn't express:
  //   Heightened Dexterity: `unencumbered` condition (armor-gated AC cap)
  //   Mental Control Over Physical State: `toggleEnabled` + computeValue
  //   Will Force: compound `{ all: [toggleEnabled, variantIs] }`
  "Heightened Dexterity",
  "Mental Control Over Physical State",
  "Will Force"
]);

function randomChoice(choices, rng = Math.random) {
  if (!Array.isArray(choices) || !choices.length) return "";
  const index = Math.floor(rng() * choices.length);
  return choices[Math.max(0, Math.min(choices.length - 1, index))];
}

function appendNote(existing, extra) {
  const notes = [existing, extra].filter(Boolean);
  return notes.join(" ");
}

function combatBonusFromDexterity(score) {
  const value = Math.round(Number(score) || 0);
  if (value > 15) return value - 15;
  if (value < 6) return value - 6;
  return 0;
}

function damageBonusFromStrength(score) {
  const value = Math.round(Number(score) || 0);
  if (value > 15) return value - 15;
  if (value < 6) return value - 6;
  return 0;
}

/**
 * Physical Strength contributes a to-hit bonus on melee and thrown
 * attacks (RAW GW1e uses PS for melee to-hit and damage; DX for ranged
 * to-hit). Same 6–15 neutral band as the damage bonus so the two stay
 * numerically in sync.
 */
function hitBonusFromStrength(score) {
  const value = Math.round(Number(score) || 0);
  if (value > 15) return value - 15;
  if (value < 6) return value - 6;
  return 0;
}

/**
 * Generic ability-score → d20 modifier for the 0.8.0 skill system.
 * Identical curve to combatBonusFromDexterity / damageBonusFromStrength /
 * hitBonusFromStrength so attack rolls, save rolls, and skill rolls all
 * use the same 6–15 neutral band. Pulling them together under one
 * helper lets the skill layer roll d20s that scale with any of the six
 * abilities without importing the three ability-specific helpers.
 */
export function abilityModifierFromScore(score) {
  const value = Math.round(Number(score) || 0);
  if (value > 15) return value - 15;
  if (value < 6) return value - 6;
  return 0;
}

function fillVariant(summary, variant) {
  if (!variant) return summary ?? "";
  return String(summary ?? "").replace(/_+/g, variant);
}

/**
 * Map of mutation name → the list of random variant outcomes. A mutation
 * in this table has one of its outcomes rolled once at the moment the
 * mutation is added to an actor (chargen, hazard award, or compendium
 * drag-drop). The roll happens against `rng()` using the same index-
 * picking logic as `randomChoice`.
 *
 * Special-case mutations whose outcome isn't a flat uniform pick
 * (Genius Capability: 2/6/2/6/2/6 weighted table) are handled inline
 * below. Everything else goes through this table so the drop hook can
 * decide whether to roll by simple membership lookup.
 */
const MUTATION_VARIANT_POOLS = Object.freeze({
  "Absorption":              ["cold", "heat", "light", "paralysis rays", "radiation", "mental blasts"],
  "Body Structure Change":   ["brittle bones", "hairless body", "single central eye"],
  "Complete Mental Block":   ["robotic beings", "technology", "plants", "animals"],
  "Fear Impulse":            ["fire", "darkness", "water", "robots", "heights"],
  "Physical Reflection":     ["heat", "cold", "light", "electricity", "laser fire", "radiation"],
  "Skin Structure Change":   ["+1 damage taken when hurt", "1 damage per turn in water", "1d3 damage per turn in bright light"]
});

function mutationVariant(name, rng = Math.random) {
  const pool = MUTATION_VARIANT_POOLS[name];
  if (pool) return randomChoice(pool, rng);
  // 0.8.6 — Genius Capability retired and split into Military /
  // Economic / Scientific Genius as standalone mutations, each with
  // its own slot on the d100 table and no variant sub-roll. Items
  // still named "Genius Capability" on legacy actors are migrated via
  // migrateGeniusCapability086 on world load.
  return "";
}

/**
 * Whether the named mutation has a random variant that should be rolled
 * when the mutation is added to an actor. Used by the drop-hook so we
 * only re-roll for mutations that genuinely have a variant slot — drag-
 * dropping a Heightened Brain Talent (no variant) doesn't trigger.
 */
export function mutationHasVariant(name) {
  return !!MUTATION_VARIANT_POOLS[name];
}

/** Exposed for the drop-hook so it can write the rolled variant + patch
 *  the summary placeholder in a single updateSource call. */
export { mutationVariant, fillVariant, MUTATION_VARIANT_POOLS };

export const MUTATION_RULES = {
  "Absorption": {
    mode: "action",
    range: "Self",
    duration: "Until depleted",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Choose the mutation's stored energy type and track the absorbed damage pool manually if the source is unusual." },
    action: "note"
  },
  "Cryokinesis": {
    mode: "action",
    range: "25 m",
    duration: "Concentration, up to 10 rounds",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "1d6", saveType: "", notes: "Choose 1-10 rounds of concentration; damage increases by 1d6 per round." },
    action: "ramping-damage"
  },
  "Death Field Generation": {
    mode: "action",
    range: "20 m radius",
    duration: "Instant",
    usage: { limited: true, per: "encounter", uses: 1, max: 1 },
    effect: { formula: "", saveType: "", notes: "All affected creatures drop to 1 HP. User is nearly unconscious for 1d20 rounds." },
    action: "death-field"
  },
  "De-Evolution": {
    mode: "action",
    range: "30 m",
    duration: "One combat",
    usage: { limited: true, per: "week", uses: 1, max: 1 },
    effect: { formula: "", saveType: "mental", notes: "On a failed mental save, strip the target's greatest mutation (GM picks which) for the rest of this combat." },
    action: "mental-save"
  },
  "Density Control": {
    mode: "action",
    range: "Self",
    duration: "Variable",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Use to describe shrinking for protection or enlarging for speed; adjust manually for unusual sizes." },
    action: "toggle-density"
  },
  "Density Control (Others)": {
    mode: "action",
    range: "30 m",
    duration: "Variable",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "mental", notes: "Manipulates another being's density after a successful mental attack." },
    action: "density-control-others"
  },
  "Electrical Generation": {
    mode: "action",
    range: "Touch",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "3d6", saveType: "", notes: "Shocks creatures you touch." },
    action: "damage"
  },
  "Empathy": {
    mode: "action",
    range: "30 m",
    duration: "Concentration",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "mental", notes: "On a failed mental save, the target feels the emotion the user projects (treat non-intelligent creatures as MR 12)." },
    action: "mental-save"
  },
  "Force Field Generation": {
    mode: "toggle",
    range: "Self",
    duration: "Up to 1 hour",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "5d6", saveType: "", notes: "Barrier surrounds the body and absorbs up to 5d6 damage." },
    action: "toggle",
    actionTypes: ["defense"]
  },
  "Gas Generation: Musk": {
    mode: "action",
    range: "10 m",
    duration: "Variable",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Use to repel or attract creatures with an overpowering musk." },
    action: "note"
  },
  "Heat Generation": {
    mode: "action",
    range: "15 m",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    cooldown: { current: 0, max: 3 },
    effect: { formula: "4d6", saveType: "", notes: "Emit a beam of heat once every 3 rounds." },
    action: "damage"
  },
  "Illusion Generation": {
    mode: "action",
    range: "30 m",
    duration: "Concentration",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Creates visual, audible, and olfactory illusions until touched." },
    action: "note"
  },
  "Light Generation": {
    mode: "action",
    range: "10 m",
    duration: "1d4 rounds",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "1d4", saveType: "", notes: "Blinds viewers, lowering armor class and to-hit by 4." },
    action: "light-generation"
  },
  "Light Wave Manipulation": {
    mode: "toggle",
    range: "10 m",
    duration: "While active",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Become invisible, create darkness, or negate lasers." },
    action: "toggle",
    actionTypes: ["attack", "save", "utility"]
  },
  "Life Leech": {
    mode: "action",
    range: "10 m radius +3 m per 4 MS",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "6", saveType: "", notes: "Drains 6 HP from each valid target and heals the mutant by the same amount." },
    action: "life-leech"
  },
  "Magnetic Control": {
    mode: "action",
    range: "100 m",
    duration: "25 rounds",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "", saveType: "mental", notes: "On a failed mental save (ferrous objects resist as MR 12), the target is controlled for up to 25 rounds." },
    action: "mental-save"
  },
  "Mental Blast": {
    mode: "action",
    range: "15 m",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    cooldown: { current: 0, max: 2 },
    effect: { formula: "3d6", saveType: "mental", notes: "Launch a mental assault once every other round." },
    action: "mental-damage"
  },
  "Mental Control": {
    mode: "action",
    range: "15 m",
    duration: "While maintained",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "mental", notes: "Controller shares the target's fate while control is active." },
    action: "mental-control"
  },
  "Mental Control Over Physical State": {
    mode: "toggle",
    range: "Self",
    duration: "5d10 rounds in danger",
    usage: { limited: true, per: "week", uses: 1, max: 1 },
    effect: { formula: "5d10", saveType: "", notes: "Doubles strength, dexterity, and speed during overwhelming danger." },
    action: "toggle",
    actionTypes: ["buff"],
    // 0.8.6 — toggle-gated attribute-scaled bonuses.
    effects: [
      { label: "Mental Control Over Physical State — activated bonuses",
        condition: "toggleEnabled",
        changes: [
          { key: "gw.toHitBonus", mode: AE_MODE.ADD,
            computeValue: (actor) => Math.max(0, combatBonusFromDexterity(actor?.system?.attributes?.dx?.value)),
            priority: 20 },
          { key: "gw.damageFlat", mode: AE_MODE.ADD,
            computeValue: (actor) => Math.max(0, damageBonusFromStrength(actor?.system?.attributes?.ps?.value)),
            priority: 20 },
          { key: "gw.movementMultiplier", mode: AE_MODE.MULTIPLY, value: "2", priority: 20 }
        ] }
    ]
  },
  "Molecular Disruption": {
    mode: "action",
    range: "30 m",
    duration: "Instant",
    usage: { limited: true, per: "week", uses: 1, max: 1 },
    effect: { formula: "", saveType: "", notes: "Success chance depends on material; user drops to 1 HP and half movement for 1 day." },
    action: "note"
  },
  "Physical Reflection": {
    mode: "passive"
  },
  "Planar Travel": {
    mode: "action",
    range: "Touch",
    duration: "3 rounds",
    usage: { limited: true, per: "week", uses: 1, max: 1 },
    effect: { formula: "", saveType: "", notes: "Opens a 3 m by 3 m doorway to another plane." },
    action: "note"
  },
  "Precognition": {
    mode: "action",
    range: "Self",
    duration: "3 minutes",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "See three minutes into the future; may take shock damage from traumatic visions." },
    action: "note"
  },
  "Pyrokinesis": {
    mode: "action",
    range: "25 m",
    duration: "Concentration, up to 10 rounds",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "1d6", saveType: "", notes: "Choose 1-10 rounds of concentration; damage increases by 1d6 per round." },
    action: "ramping-damage"
  },
  "Quills/Spines": {
    mode: "action",
    range: "3 m",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "1d4", saveType: "", notes: "Use the sheet's formula field to match this mutant's quill or spine damage." },
    action: "damage"
  },
  "Radiated Eyes": {
    mode: "action",
    range: "10 m",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    cooldown: { current: 0, max: 4 },
    effect: { formula: "3d6", saveType: "radiation", notes: "Roll intensity and resolve the target's radiation exposure." },
    action: "radiation-eyes"
  },
  "Reflection": {
    mode: "toggle",
    range: "Self",
    duration: "Up to 18 rounds",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "", saveType: "", notes: "Begins by reflecting up to 3 dice of damage, increasing by 1 die per round of concentration." },
    action: "toggle",
    actionTypes: ["defense"]
  },
  "Repulsion Field": {
    mode: "toggle",
    range: "15 m",
    duration: "Up to 1 hour",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "5d6", saveType: "", notes: "Improved force field that can enclose other beings." },
    action: "toggle",
    actionTypes: ["defense"]
  },
  "Shapechange": {
    mode: "toggle",
    range: "Self",
    duration: "While active",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Takes two rounds to assume a new shape." },
    action: "toggle",
    actionTypes: ["utility"]
  },
  "Sonic Attack Ability": {
    mode: "action",
    range: "10 m radius",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    cooldown: { current: 0, max: 4 },
    effect: { formula: "3d6", saveType: "", notes: "Damages every other creature within 10 meters." },
    action: "area-damage"
  },
  "Symbiotic Attachment": {
    mode: "action",
    range: "Melee",
    duration: "After 3 rounds of contact",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "After a successful attack and 3 rounds of attachment, control the victim." },
    action: "note"
  },
  "Telekinesis": {
    mode: "action",
    range: "15 m",
    duration: "5 rounds on, 5 rounds off",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "mental", notes: "On a failed mental save, a living target can be lifted / moved (same weight the user can normally lift) for 5 rounds on, 5 rounds off. Inert objects auto-fail the save." },
    action: "mental-save"
  },
  "Telekinetic Arm": {
    mode: "action",
    range: "20 m",
    duration: "While visible",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "1d6", saveType: "", notes: "Acts as a telekinetic arm with Strength 18." },
    action: "damage"
  },
  // 0.8.6 — Telekinetic Flight rule change: simplified to match Wings
  // exactly. Passive, always-on flight speed of 20. No more toggle;
  // the "Activate" button no longer appears on the item sheet.
  "Telekinetic Flight": {
    mode: "passive",
    range: "Self",
    duration: "Always on",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Fly at up to 20 meters per second, carrying a normal load." },
    actionTypes: ["movement"],
    effects: [
      { label: "Telekinetic Flight — flight speed",
        changes: [{ key: "gw.flightSpeed", mode: AE_MODE.UPGRADE, value: "20", priority: 20 }] }
    ]
  },
  "Telepathy": {
    mode: "action",
    range: "10 m",
    duration: "Concentration",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Read and project thoughts or emotions." },
    action: "note"
  },
  "Teleportation": {
    mode: "action",
    range: "30 km",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "10d6", saveType: "", notes: "Unfamiliar destinations carry a 25% chance of 10d6 damage." },
    action: "note"
  },
  "Time Field Manipulation": {
    mode: "action",
    range: "Touch",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "See the mutation text for time-distance percentages and the heavy personal cost." },
    action: "note"
  },
  "Total Healing": {
    mode: "action",
    range: "Self",
    duration: "Instant",
    usage: { limited: true, per: "week", uses: 4, max: 4 },
    effect: { formula: "", saveType: "", notes: "May be used once per day, up to four times per week, to heal to full." },
    action: "full-heal"
  },
  "Weather Manipulation": {
    mode: "action",
    range: "10 km radius",
    duration: "Concentration",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "", saveType: "", notes: "Concentrate 6 rounds to begin the shift and 12 more to complete it." },
    action: "note"
  },
  // 0.8.6 — Will Force: compound { toggleEnabled + variantIs } AE
  // entries (one per ability variant). Most variants use computeValue
  // to express attribute-scaled math. The active variant's effect
  // lights up when toggle is on; the other five stay inert.
  "Will Force": {
    mode: "toggle",
    range: "Self",
    duration: "1d10 rounds",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "1d10", saveType: "", notes: "Choose one ability to double or gain +1 to hit while active." },
    action: "toggle",
    actionTypes: ["buff"],
    effects: [
      { label: "Will Force — to-hit variant",
        condition: { all: [{ toggleEnabled: true }, { variantIs: "to-hit" }] },
        changes: [
          { key: "gw.toHitBonus", mode: AE_MODE.ADD, value: "1", priority: 20 }
        ] },
      { label: "Will Force — dx variant (doubled DX to-hit)",
        condition: { all: [{ toggleEnabled: true }, { variantIs: "dx" }] },
        changes: [
          { key: "gw.toHitBonus", mode: AE_MODE.ADD,
            computeValue: (actor) => {
              const dx = Number(actor?.system?.attributes?.dx?.value ?? 0) || 0;
              return combatBonusFromDexterity(dx * 2) - combatBonusFromDexterity(dx);
            },
            priority: 20 }
        ] },
      { label: "Will Force — ps variant (doubled PS damage)",
        condition: { all: [{ toggleEnabled: true }, { variantIs: "ps" }] },
        changes: [
          { key: "gw.damageFlat", mode: AE_MODE.ADD,
            computeValue: (actor) => {
              const ps = Number(actor?.system?.attributes?.ps?.value ?? 0) || 0;
              return damageBonusFromStrength(ps * 2) - damageBonusFromStrength(ps);
            },
            priority: 20 }
        ] },
      { label: "Will Force — ms variant (doubled MS mental resistance)",
        condition: { all: [{ toggleEnabled: true }, { variantIs: "ms" }] },
        changes: [
          { key: "gw.mentalResistance", mode: AE_MODE.UPGRADE,
            computeValue: (actor) => {
              const ms = Number(actor?.system?.attributes?.ms?.value ?? 0) || 0;
              return Math.min(18, ms * 2);
            },
            priority: 20 }
        ] },
      { label: "Will Force — ch variant (doubled CH charisma)",
        condition: { all: [{ toggleEnabled: true }, { variantIs: "ch" }] },
        changes: [
          { key: "gw.charismaBonus", mode: AE_MODE.ADD,
            computeValue: (actor) => Number(actor?.system?.attributes?.ch?.value ?? 0) || 0,
            priority: 20 }
        ] },
      { label: "Will Force — cn variant (doubled CN radiation / poison)",
        condition: { all: [{ toggleEnabled: true }, { variantIs: "cn" }] },
        changes: [
          { key: "gw.radiationResistance", mode: AE_MODE.ADD,
            computeValue: (actor) => Math.max(0, Number(actor?.system?.attributes?.cn?.value ?? 0) || 0),
            priority: 20 },
          { key: "gw.poisonResistance", mode: AE_MODE.ADD,
            computeValue: (actor) => Math.max(0, Number(actor?.system?.attributes?.cn?.value ?? 0) || 0),
            priority: 20 }
        ] }
    ]
  },
  "Chameleon Powers": {
    mode: "toggle",
    range: "Self",
    duration: "While active",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Blend into the environment; treat the mutant as invisible until revealed." },
    action: "toggle",
    actionTypes: ["utility", "buff"]
  },

  // 0.8.4 quick-win gap fixes (ported from the audit report).
  // Two plant mutations with clear damage formulas route to the
  // existing damage / life-leech handlers; two sensory-bump plant
  // mutations that were inferred as "guided" become explicit passives
  // so they don't show up as activated abilities at all.
  "Carnivorous Jaws": {
    mode: "action",
    range: "2 m",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "2d6", saveType: "", notes: "Hinged jaws close around a target within 2m for 2d6 bite damage." },
    action: "damage"
  },
  "Sucker Vines": {
    mode: "action",
    range: "Melee",
    duration: "Instant",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "1d4", saveType: "", notes: "Vines drain 1d4 HP from each gripped victim; the plant heals by the same amount." },
    action: "life-leech"
  },
  "Color Sensitivity": {
    // Summary text is mechanically a +4 stealth/observation bump — a
    // passive trait, not an activated ability. Flipping to passive
    // removes it from the audit's "active effect but no automation"
    // list; GMs apply the +4 narratively when the player is hiding
    // or looking for something specific.
    mode: "passive"
  },
  "Increased Senses": {
    // Same shape as Color Sensitivity: a +4 detection bump.
    mode: "passive"
  },
  "Tangle Vines": {
    // RAW: Vines entangle victims within 3m; Strength save vs 18 to
    // break free. The handler applies a Restrained temp effect with a
    // -4 to-hit penalty; the GM removes it when the victim escapes
    // (via the PS-check button on the sheet).
    mode: "action",
    range: "3 m",
    duration: "Until escape",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "10", saveType: "", notes: "Target is restrained. They may attempt a Strength check (1d20 + PS mod) vs DC 18 to break free; on success the GM clears the effect." },
    action: "restrain"
  },

  // 0.8.4 Category C gap fixes — three mental mutations that the rule-
  // inference keyword matcher classified as activated abilities are
  // actually declarative / reactive passives. Summary text describes
  // an always-on sensory bump or a conditional reflect/mimic trait.
  // GM narrates the conditional bonus when it applies; no player
  // activation is needed.
  "Radar/Sonar": {
    // RAW: "See day or night, +2 to hit within 30 meters." The
    // day/night sight is continuous. The +2 is plumbed via AE into
    // `gw.closeRangeToHitBonus` (already range-gated at attack-roll
    // time to the <30m band — see module/dice.mjs ~L695), so wiring
    // it here matches exactly what the hardcoded case did before.
    mode: "passive",
    effects: [
      { label: "Radar/Sonar — close range bonus",
        changes: [{ key: "gw.closeRangeToHitBonus", mode: AE_MODE.ADD, value: "2", priority: 20 }] }
    ]
  },
  "Sound Imitation": {
    // RAW: "Reflect sonic attack (still take effects) or mimic sounds."
    // The reflect-sonic-attack path is a reactive passive (triggers on
    // incoming sonic damage, not on the mutant's turn). The mimicry is
    // narrative. Neither is an activated ability.
    mode: "passive"
  },
  "Thought Imitation": {
    // Same shape as Sound Imitation but for mental attacks + thought
    // mimicry. Reactive reflect + narrative mimic.
    mode: "passive"
  },

  /* ------------------------------------------------------------------ */
  /* 0.8.4 Tier 1 — AE pilot mutations                                  */
  /*                                                                    */
  /* Ten passive mutations with effects expressed declaratively as      */
  /* ActiveEffect-style `changes` arrays. applyMutationModifiers skips  */
  /* these (keyed by AE_MIGRATED_MUTATIONS above); applyMutationEffects */
  /* reads the `effects` field and folds them into derived.             */
  /* ------------------------------------------------------------------ */

  "Heightened Strength": {
    mode: "passive",
    effects: [
      { label: "Heightened Strength — conventional weapon damage",
        changes: [{ key: "gw.conventionalWeaponExtraDice", mode: AE_MODE.ADD, value: "3", priority: 20 }] }
    ]
  },
  "Wings": {
    mode: "passive",
    actionTypes: ["movement"],
    effects: [
      { label: "Wings — flight speed",
        changes: [{ key: "gw.flightSpeed", mode: AE_MODE.UPGRADE, value: "120", priority: 20 }] }
    ]
  },
  "Shorter": {
    mode: "passive",
    effects: [
      { label: "Shorter — stat adjustments",
        changes: [
          { key: "gw.ac",                        mode: AE_MODE.ADD,      value: "-1",   priority: 20 },
          { key: "gw.damageReductionMultiplier", mode: AE_MODE.MULTIPLY, value: "0.75", priority: 20 }
        ] }
    ]
  },
  "Taller": {
    mode: "passive",
    effects: [
      { label: "Taller — stat adjustments",
        changes: [
          { key: "gw.damageFlat", mode: AE_MODE.ADD, value: "2",  priority: 20 },
          { key: "gw.toHitBonus", mode: AE_MODE.ADD, value: "-1", priority: 20 }
        ] }
    ]
  },
  "Fat Cell Accumulation": {
    mode: "passive",
    effects: [
      { label: "Fat Cell Accumulation — stat adjustments",
        changes: [
          { key: "gw.movementMultiplier", mode: AE_MODE.MULTIPLY, value: "0.75", priority: 20 },
          { key: "gw.toHitBonus",         mode: AE_MODE.ADD,      value: "-1",   priority: 20 }
        ] }
    ]
  },
  "Vision Defect": {
    mode: "passive",
    effects: [
      { label: "Vision Defect — to-hit penalty",
        changes: [{ key: "gw.toHitBonus", mode: AE_MODE.ADD, value: "-4", priority: 20 }] }
    ]
  },
  "Weight Decrease": {
    mode: "passive",
    effects: [
      { label: "Weight Decrease — stat adjustments",
        changes: [
          { key: "gw.movementMultiplier", mode: AE_MODE.MULTIPLY, value: "0.75", priority: 20 },
          { key: "gw.damageFlat",         mode: AE_MODE.ADD,      value: "-1",   priority: 20 }
        ] }
    ]
  },
  "Intuition": {
    mode: "passive",
    effects: [
      { label: "Intuition — combat + surprise bonuses",
        changes: [
          { key: "gw.toHitBonus",        mode: AE_MODE.ADD,      value: "1",    priority: 20 },
          { key: "gw.damagePerDie",      mode: AE_MODE.ADD,      value: "3",    priority: 20 },
          { key: "gw.cannotBeSurprised", mode: AE_MODE.OVERRIDE, value: "true", priority: 20 }
        ] }
    ]
  },
  "Heightened Hearing": {
    mode: "passive",
    effects: [
      { label: "Heightened Hearing — surprise bonuses",
        changes: [
          { key: "gw.cannotBeSurprised", mode: AE_MODE.OVERRIDE, value: "true", priority: 20 },
          { key: "gw.surpriseModifier",  mode: AE_MODE.ADD,      value: "2",    priority: 20 }
        ] }
    ]
  },

  /* ------------------------------------------------------------------ */
  /* 0.8.5 Tier 2 — AE pilot expansion                                  */
  /*                                                                    */
  /* Fourteen more passives. Every entry here has fixed numeric values  */
  /* only — no attribute scaling, no enabled-gate, no variant branching.*/
  /* Mental-resistance tweaks rely on the 3-18 clamp that still runs    */
  /* in buildActorDerived AFTER applyMutationEffects, so the ADD +4     */
  /* can't spill over 18.                                               */
  /* ------------------------------------------------------------------ */

  "Double Physical Pain": {
    mode: "passive",
    effects: [
      { label: "Double Physical Pain — double damage taken",
        changes: [{ key: "gw.damageTakenMultiplier", mode: AE_MODE.MULTIPLY, value: "2", priority: 20 }] }
    ]
  },
  "Multiple Damage": {
    mode: "passive",
    effects: [
      { label: "Multiple Damage — double damage taken",
        changes: [{ key: "gw.damageTakenMultiplier", mode: AE_MODE.MULTIPLY, value: "2", priority: 20 }] }
    ]
  },
  "Heightened Intelligence": {
    mode: "passive",
    effects: [
      { label: "Heightened Intelligence — mental resistance",
        // +4 to MR; the 3-18 clamp in buildActorDerived keeps it from
        // exceeding 18 without needing a second DOWNGRADE effect here.
        changes: [{ key: "gw.mentalResistance", mode: AE_MODE.ADD, value: "4", priority: 20 }] }
    ]
  },
  "Mental Defense Shield": {
    mode: "passive",
    effects: [
      { label: "Mental Defense Shield — mental resistance",
        changes: [{ key: "gw.mentalResistance", mode: AE_MODE.ADD, value: "4", priority: 20 }] }
    ]
  },
  "Heightened Precision": {
    mode: "passive",
    effects: [
      { label: "Heightened Precision — extra damage dice",
        changes: [{ key: "gw.weaponExtraDice", mode: AE_MODE.ADD, value: "2", priority: 20 }] }
    ]
  },
  "Increased Speed": {
    mode: "passive",
    effects: [
      { label: "Increased Speed — double move + extra attack",
        changes: [
          { key: "gw.movementMultiplier", mode: AE_MODE.MULTIPLY, value: "2", priority: 20 },
          { key: "gw.extraAttacks",       mode: AE_MODE.ADD,      value: "1", priority: 20 }
        ] }
    ]
  },
  "Mental Defenselessness": {
    mode: "passive",
    effects: [
      { label: "Mental Defenselessness — MR floored at 3",
        // OVERRIDE at higher priority than the Heightened Intelligence /
        // Mental Defense Shield ADDs so this wins if the character has
        // both mutations. 3-18 clamp enforces the floor anyway.
        changes: [{ key: "gw.mentalResistance", mode: AE_MODE.OVERRIDE, value: "3", priority: 50 }] }
    ]
  },
  "Molecular Understanding": {
    mode: "passive",
    effects: [
      { label: "Molecular Understanding — extra damage die",
        changes: [{ key: "gw.weaponExtraDice", mode: AE_MODE.ADD, value: "1", priority: 20 }] }
    ]
  },
  "Partial Carapace": {
    mode: "passive",
    effects: [
      { label: "Partial Carapace — AC cap",
        // Descending-AC: DOWNGRADE sets to min(current, 6). If the
        // character's baseAc is already below 6 (better natural armor)
        // the DOWNGRADE leaves it alone.
        changes: [{ key: "gw.baseAc", mode: AE_MODE.DOWNGRADE, value: "6", priority: 20 }] }
    ]
  },
  "Heightened Smell": {
    mode: "passive",
    effects: [
      { label: "Heightened Smell — surprise modifier",
        changes: [{ key: "gw.surpriseModifier", mode: AE_MODE.ADD, value: "1", priority: 20 }] }
    ]
  },
  "Heightened Vision": {
    mode: "passive",
    effects: [
      { label: "Heightened Vision — surprise modifier",
        changes: [{ key: "gw.surpriseModifier", mode: AE_MODE.ADD, value: "1", priority: 20 }] }
    ]
  },
  "Ultravision": {
    mode: "passive",
    effects: [
      { label: "Ultravision — surprise modifier",
        changes: [{ key: "gw.surpriseModifier", mode: AE_MODE.ADD, value: "1", priority: 20 }] }
    ]
  },
  "Infravision": {
    mode: "passive",
    effects: [
      { label: "Infravision — surprise modifier",
        changes: [{ key: "gw.surpriseModifier", mode: AE_MODE.ADD, value: "1", priority: 20 }] }
    ]
  },
  "Total Carapace": {
    mode: "passive",
    effects: [
      { label: "Total Carapace — heavy armor bundle",
        changes: [
          { key: "gw.baseAc",                    mode: AE_MODE.DOWNGRADE, value: "4",    priority: 20 },
          { key: "gw.damageReductionMultiplier", mode: AE_MODE.MULTIPLY,  value: "0.5",  priority: 20 },
          { key: "gw.movementMultiplier",        mode: AE_MODE.MULTIPLY,  value: "0.75", priority: 20 }
        ] }
    ]
  },

  /* ------------------------------------------------------------------ */
  /* 0.8.6 Phase 3 — Holdouts + conditional-effects framework           */
  /*                                                                    */
  /* These entries exercise the three new framework primitives:         */
  /*   - `computeValue` on a change (Heightened Constitution hpBonus)   */
  /*   - `condition` on an effect (MCOPS, Heightened Dexterity,         */
  /*     Will Force — all added later in this tier)                     */
  /*   - Compound `{ all: [...] }` conditions (Will Force variants)     */
  /*                                                                    */
  /* 0.8.6 rule change — Heightened Constitution's poison/radiation     */
  /* effects simplified: +1 to each save rather than the previous +3    */
  /* radiation / upgrade-to-18 poison. HP bonus (CN × 2) unchanged.     */
  /* ------------------------------------------------------------------ */

  "Heightened Constitution": {
    mode: "passive",
    effects: [
      { label: "Heightened Constitution — CN bonuses",
        changes: [
          { key: "gw.poisonResistance",    mode: AE_MODE.ADD, value: "1", priority: 20 },
          { key: "gw.radiationResistance", mode: AE_MODE.ADD, value: "1", priority: 20 },
          // HP bonus scales with the live CN score; computeValue runs at
          // derive time rather than emit time so attribute changes flow
          // through without re-emitting the AE.
          { key: "gw.hpBonus", mode: AE_MODE.ADD,
            computeValue: (actor) => (Number(actor?.system?.attributes?.cn?.value ?? 0) || 0) * 2,
            priority: 20 }
        ] }
    ]
  },

  // 0.8.6 — Genius Capability retirement. Replaced by three standalone
  // mutations, each with its own d100 slot. All three are passive and
  // always-on; no variant sub-roll.
  "Military Genius": {
    mode: "passive",
    effects: [
      { label: "Military Genius — tactical prodigy",
        changes: [
          { key: "gw.toHitBonus",     mode: AE_MODE.ADD, value: "4", priority: 20 },
          { key: "gw.weaponExtraDice", mode: AE_MODE.ADD, value: "1", priority: 20 }
        ] }
    ]
  },
  "Economic Genius": {
    mode: "passive",
    effects: [
      { label: "Economic Genius — leadership bonus",
        changes: [
          { key: "gw.charismaBonus", mode: AE_MODE.ADD, value: "3", priority: 20 }
        ] }
    ]
  },
  "Scientific Genius": {
    mode: "passive",
    effects: [
      { label: "Scientific Genius — technical skills",
        changes: [
          // +2 to each of the seven technical / scientific skills.
          // Targets live on the per-skill `bonus` schema field added in
          // 0.8.6; Foundry core applies these via applyActiveEffects()
          // during super.prepareDerivedData(). Skill roll formula picks
          // them up as `@bonus` in the d20 roll.
          { key: "system.skills.ancientTech.bonus",      mode: AE_MODE.ADD, value: "2", priority: 20 },
          { key: "system.skills.computers.bonus",        mode: AE_MODE.ADD, value: "2", priority: 20 },
          { key: "system.skills.juryRigging.bonus",      mode: AE_MODE.ADD, value: "2", priority: 20 },
          { key: "system.skills.salvage.bonus",          mode: AE_MODE.ADD, value: "2", priority: 20 },
          { key: "system.skills.robotics.bonus",         mode: AE_MODE.ADD, value: "2", priority: 20 },
          { key: "system.skills.abnormalBiology.bonus",  mode: AE_MODE.ADD, value: "2", priority: 20 },
          { key: "system.skills.toxicology.bonus",       mode: AE_MODE.ADD, value: "2", priority: 20 },
          // Artifact analysis -1: flows through the derived bonus layer,
          // which artifactUseProfileForChart folds into the roll mod.
          { key: "gw.artifactAnalysisBonus", mode: AE_MODE.ADD, value: "-1", priority: 20 }
        ] }
    ]
  },

  // 0.8.6 — Heightened Dexterity: declarative AC cap gated on the
  // unencumbered condition. Evaluator reads the derived.encumbered flag
  // computed in applyMutationEffects (any equipped armor ⇒ encumbered).
  // The Mental Control Over Physical State and Will Force entries live
  // at their original positions above (grouped with other toggle/
  // mental mutations) and carry the Phase 3 `effects` arrays directly.
  "Heightened Dexterity": {
    mode: "passive",
    effects: [
      { label: "Heightened Dexterity — unencumbered AC cap",
        condition: "unencumbered",
        changes: [
          { key: "gw.baseAc", mode: AE_MODE.DOWNGRADE, value: "4", priority: 20 }
        ] }
    ]
  }
};

function activeRule(name) {
  return MUTATION_RULES[name] ?? inferMutationRule(name);
}

function inferMutationRule(name) {
  const definition = findMutationByName(name);
  if (!definition) return { mode: "passive" };
  if (definition.category === "defect") return { mode: "passive" };

  const summary = String(definition.summary ?? "").toLowerCase();
  const passiveKeywords = [
    "always know",
    "cannot be surprised",
    "+4 mental resistance",
    "+4ac",
    "+2hp",
    "+18 vs.",
    "+3 vs.",
    "+2 damage dice",
    "+3 damage dice",
    "detect poison",
    "see clearly",
    "feed on sun",
    "regenerate",
    "base ac6",
    "reduce damage to 1/2",
    "-4 to hit",
    "25% slower",
    "fly 12m per turn",
    "see uv",
    "see heat",
    "better chance to figure out",
    "maintain balance"
  ];
  const guidedKeywords = [
    "within ",
    "once ",
    "create ",
    "control ",
    "concentrate",
    "reflect",
    "teleport",
    "door",
    "open ",
    "blast",
    "shock",
    "expel",
    "mimic",
    "read/send",
    "read",
    "send thoughts",
    "affect others",
    "drain",
    "heall",
    "prevailing conditions",
    "project",
    "force feelings"
  ];
  const toggleKeywords = ["blend in", "mimic animal", "invisible at will"];

  if (toggleKeywords.some((keyword) => summary.includes(keyword))) {
    return {
      mode: "toggle",
      range: "Self",
      duration: "While active",
      usage: { limited: false, per: "at-will", uses: 0, max: 0 },
      effect: { formula: "", saveType: "", notes: definition.summary },
      action: "guided"
    };
  }

  if (passiveKeywords.some((keyword) => summary.includes(keyword))) {
    return { mode: "passive" };
  }

  if (guidedKeywords.some((keyword) => summary.includes(keyword))) {
    return {
      mode: "action",
      range: "",
      duration: "",
      usage: { limited: false, per: "at-will", uses: 0, max: 0 },
      effect: { formula: "", saveType: "", notes: definition.summary },
      action: "guided"
    };
  }

  return { mode: "passive" };
}

export function getMutationRule(mutation) {
  const name = typeof mutation === "string" ? mutation : mutation?.name;
  return activeRule(name);
}

/**
 * 0.10.0 — default inference map from `rule.action` to the canonical
 * ACTION_TYPES tags. Covers the 16 observed `action` values in
 * MUTATION_RULES; `"toggle"` has no default because the semantic is
 * ambiguous (defense vs. buff vs. utility), so each toggle rule MUST
 * carry an explicit `rule.actionTypes`.
 *
 * `null` means "no tags" — purely narrative or passive, never surfaces
 * in any action section of the sheet.
 */
const MUTATION_ACTION_TYPE_DEFAULTS = Object.freeze({
  "note":                     null,
  "passive":                  null,
  "ramping-damage":           ["attack", "damage"],
  "death-field":              ["attack", "damage", "save"],
  "mental-save":              ["attack", "save"],
  "toggle-density":           ["buff"],
  "density-control-others":   ["attack", "save"],
  "damage":                   ["attack", "damage"],
  // "toggle": per-rule override required (no entry here)
  "light-generation":         ["attack", "save", "utility"],
  "life-leech":               ["attack", "damage", "heal"],
  "mental-control":           ["attack", "save"],
  "mental-damage":            ["attack", "damage", "save"],
  "area-damage":              ["attack", "damage", "save"],
  "radiation-eyes":           ["attack", "damage"],
  "full-heal":                ["heal"],
  "guided":                   ["utility"],
  "restrain":                 ["attack", "save"]
});

/**
 * 0.10.0 — resolve the `actionTypes` tag set for a mutation rule.
 * Precedence:
 *   1. Explicit `rule.actionTypes: [...]` on the rule entry (wins).
 *   2. Default inference from `rule.action` via the map above.
 *   3. Empty array (no tags, no sheet section surface).
 *
 * Exported so `buildMutationItemSource` and the migration pass can
 * share the same resolution. Returns a fresh array each call.
 */
export function resolveMutationActionTypes(rule) {
  if (Array.isArray(rule?.actionTypes)) return [...rule.actionTypes];
  const action = rule?.action;
  if (action && action in MUTATION_ACTION_TYPE_DEFAULTS) {
    const defaults = MUTATION_ACTION_TYPE_DEFAULTS[action];
    return defaults ? [...defaults] : [];
  }
  return [];
}

export function mutationIsEnabled(item) {
  const mode = item?.system?.activation?.mode ?? getMutationRule(item).mode;
  if (mode === "passive") return true;
  return !!item?.system?.activation?.enabled;
}

export function mutationHasAction(item) {
  return (item?.system?.activation?.mode ?? getMutationRule(item).mode) !== "passive";
}

export function mutationActionLabel(item) {
  const mode = item?.system?.activation?.mode ?? getMutationRule(item).mode;
  const enabled = !!item?.system?.activation?.enabled;
  if (mode === "toggle") return enabled ? "Deactivate" : "Activate";
  return "Use";
}

export function describeMutation(item) {
  const summary = item?.system?.summary || findMutationByName(item?.name)?.summary || "";
  return fillVariant(summary, item?.system?.reference?.variant);
}

/**
 * 0.8.6 — initial `disabled` state for an emitted AE whose rule carries
 * a `condition`. We don't have an actor context at emit time (this
 * function runs during pack build and at mutation-drop), so any
 * conditional effect starts disabled; the `updateItem` hook
 * (onMutationRelevantItemChange) re-syncs the flag on first mount to
 * the correct evaluator state. Unconditional effects start enabled.
 */
function conditionStartsDisabled(condition, _rule) {
  return condition != null && condition !== false;
}

/**
 * Serialize a rule-table `condition` into the flags bag on the emitted
 * AE. Conditions are plain strings, plain objects, or arrays of them —
 * all JSON-safe — so this is a passthrough today. The wrapper exists as
 * a single strip point if a future condition primitive adds a
 * non-serializable member (e.g. a function reference).
 */
function serializeCondition(condition) {
  if (condition == null) return null;
  if (typeof condition === "string") return condition;
  if (Array.isArray(condition)) return condition.map(serializeCondition);
  if (typeof condition === "object") {
    const out = {};
    for (const [k, v] of Object.entries(condition)) {
      if (typeof v === "function") continue;
      out[k] = serializeCondition(v);
    }
    return out;
  }
  return condition;
}

export function buildMutationItemSource(definition, { rng = Math.random, rollVariant = true } = {}) {
  const rule = getMutationRule(definition.name);
  // rollVariant = false: leave the variant empty and keep the summary
  // placeholder as-is. Used by compendium pack builds so that dragging
  // e.g. Absorption onto a character triggers a fresh d6 roll rather
  // than always defaulting to whatever happened to roll at pack build
  // time. The drop-hook (see module/hooks.mjs mutation-variant wiring)
  // is responsible for rolling the variant on add.
  const variant = rollVariant ? mutationVariant(definition.name, rng) : "";
  const summary = fillVariant(definition.summary, variant);
  const notes = variant ? `Variant: ${variant}.` : "";

  // 0.8.4 Tier 1 — emit the rule's `effects` array onto the item source
  // as Foundry-native ActiveEffect documents with `transfer: true` so
  // they auto-flow to the actor when the mutation is added. The embedded
  // ActiveEffectConfig sheet + Effects tab (Tier 5) inherit free UI for
  // viewing and toggling these.
  //
  // 0.8.6 — conditional + computed changes land here too. For conditions,
  // the rule carries a declarative `condition` field (see
  // evaluateCondition) that is serialized onto the AE flag bag; the
  // emitted AE starts disabled when the condition requires state the
  // item doesn't yet have (e.g. toggle off, variant unrolled). The
  // updateItem hook (see module/hooks.mjs) re-syncs the `disabled` field
  // whenever activation.enabled or reference.variant changes.
  //
  // For computed changes (rule uses `computeValue: (actor, item) => ...`
  // instead of a static `value`), the emitted AE carries a placeholder
  // "0" value and a `computed: true` flag so the Effects tab can badge
  // the entry as dynamic. The authoritative apply path runs through
  // applyMutationEffects, which resolves the function at derive time.
  const ruleEffects = Array.isArray(rule.effects) ? rule.effects : [];
  const emittedEffects = ruleEffects.map((effect, index) => {
    const condition = effect.condition ?? null;
    const changes = Array.isArray(effect.changes) ? effect.changes : [];
    const hasComputed = changes.some((change) => typeof change?.computeValue === "function");
    return {
      name: effect.label ?? effect.name ?? `${definition.name} effect ${index + 1}`,
      img: "icons/svg/aura.svg",
      transfer: true,
      disabled: conditionStartsDisabled(condition, rule),
      changes: changes.map((change) => ({
        key: change.key,
        mode: Number.isInteger(change.mode) ? change.mode : 2,
        value: typeof change.computeValue === "function" ? "0" : String(change.value ?? ""),
        priority: Number.isFinite(Number(change.priority)) ? Number(change.priority) : 20
      })),
      flags: {
        "gamma-world-1e": {
          condition: serializeCondition(condition),
          computed: hasComputed
        }
      }
    };
  });

  return {
    name: definition.name,
    type: "mutation",
    system: {
      code: definition.code,
      subtype: definition.category === "defect" ? "defect" : definition.subtype,
      category: definition.category,
      summary,
      reference: {
        table: definition.subtype,
        page: definition.page,
        variant
      },
      active: rule.mode !== "passive",
      activation: {
        mode: rule.mode,
        enabled: false,
        remaining: 0
      },
      range: rule.range ?? "",
      duration: rule.duration ?? "",
      usage: {
        limited: !!rule.usage?.limited,
        per: rule.usage?.per ?? "at-will",
        uses: Number(rule.usage?.uses ?? 0),
        max: Number(rule.usage?.max ?? 0)
      },
      cooldown: {
        current: Number(rule.cooldown?.current ?? 0),
        max: Number(rule.cooldown?.max ?? 0)
      },
      effect: {
        formula: rule.effect?.formula ?? "",
        saveType: rule.effect?.saveType ?? "",
        notes: appendNote(notes, rule.effect?.notes ?? "")
      },
      // 0.10.0 — canonical action-type tags. Explicit `rule.actionTypes`
      // on the rule entry wins; otherwise derive from `rule.action` via
      // the default-inference map. Passive / "note" actions that have
      // no sheet-surface contribution return an empty array here.
      actionTypes: resolveMutationActionTypes(rule),
      description: {
        // 0.10.0 — homebrew descriptions authored in
        // ref/rulebook-prose/06-Updated-Mutations.md flow through
        // `mutation-descriptions.generated.mjs`. Falls back to the
        // summary-based placeholder when the mutation has no entry
        // in the markdown (e.g. the three split Genius items).
        value: mutationDescriptionFor(definition.subtype, definition.name) ?? `<p>${summary}</p>`
      }
    },
    effects: emittedEffects
  };
}

export function enrichMutationSystemData(item) {
  if (item?.type !== "mutation") return item?.system ?? null;
  const definition = findMutationByName(item.name);
  const rule = getMutationRule(item);
  const system = item.system;

  system.code ||= definition?.code ?? 0;
  system.summary ||= fillVariant(definition?.summary ?? "", system.reference?.variant);
  system.reference.table ||= definition?.subtype ?? "";
  system.reference.page ||= definition?.page ?? 0;
  system.activation.mode ||= rule.mode;
  system.active = system.activation.mode !== "passive";
  if (rule.range && !system.range) system.range = rule.range;
  if (rule.duration && !system.duration) system.duration = rule.duration;
  if (!system.effect.notes && rule.effect?.notes) system.effect.notes = rule.effect.notes;
  if (!system.effect.formula && rule.effect?.formula) system.effect.formula = rule.effect.formula;
  if (!system.effect.saveType && rule.effect?.saveType) system.effect.saveType = rule.effect.saveType;
  if (system.usage.limited == null) system.usage.limited = !!rule.usage?.limited;
  if (!system.usage.per) system.usage.per = rule.usage?.per ?? "at-will";
  if ((system.usage.max ?? 0) === 0 && Number(rule.usage?.max ?? 0) > 0) {
    system.usage.max = rule.usage.max;
    if ((system.usage.uses ?? 0) === 0) system.usage.uses = rule.usage.max;
  }
  // 0.10.0 — backfill actionTypes if the mutation item was created
  // before the field existed. Resolves from the rule table so
  // existing actors get the correct sheet-section classification on
  // their next prep.
  const hasActionTypes = system.actionTypes instanceof Set
    ? system.actionTypes.size > 0
    : Array.isArray(system.actionTypes) && system.actionTypes.length > 0;
  if (!hasActionTypes) {
    const tags = resolveMutationActionTypes(rule);
    if (tags.length) system.actionTypes = new Set(tags);
  }
  if ((system.cooldown.max ?? 0) === 0 && Number(rule.cooldown?.max ?? 0) > 0) {
    system.cooldown.max = rule.cooldown.max;
  }
  return system;
}

/**
 * 0.8.6 — evaluate a condition against a runtime context. Returns true
 * when the condition permits its effect to apply; false otherwise.
 *
 * Supported forms:
 *   "toggleEnabled"               — item.system.activation.enabled === true
 *   "unencumbered"                — no armor item is equipped on the actor
 *   { toggleEnabled: true|false } — same, explicit value form
 *   { unencumbered: true|false }
 *   { variantIs: "<string>" }     — item.system.reference.variant matches
 *   { all: [cond1, cond2, ...] }  — every sub-condition passes (AND)
 *   null / undefined              — no condition, applies unconditionally
 *
 * Unknown condition shapes fail closed (return false) so a typo or a
 * rule referencing a future-but-unimplemented primitive doesn't silently
 * grant a bonus.
 */
export function evaluateCondition(condition, ctx) {
  if (condition == null) return true;
  if (typeof condition === "string") {
    if (condition === "toggleEnabled") return !!ctx?.item?.system?.activation?.enabled;
    if (condition === "unencumbered") return !ctx?.derived?.encumbered;
    // 0.9.1 Tier 4 — true when the context item has `system.equipped`
    // set. Lets armor (and other equippable items) gate their effects
    // on equipped state. Reads from ctx.item, not ctx.derived, so an
    // armor's AE-via-rule entry self-gates without iterating actor-wide
    // state.
    if (condition === "equipped") return !!ctx?.item?.system?.equipped;
    return false;
  }
  if (typeof condition === "object") {
    if (condition.toggleEnabled != null) {
      return !!ctx?.item?.system?.activation?.enabled === !!condition.toggleEnabled;
    }
    if (condition.unencumbered != null) {
      return !ctx?.derived?.encumbered === !!condition.unencumbered;
    }
    if (condition.equipped != null) {
      return !!ctx?.item?.system?.equipped === !!condition.equipped;
    }
    if (condition.variantIs != null) {
      return String(ctx?.item?.system?.reference?.variant ?? "") === String(condition.variantIs);
    }
    if (Array.isArray(condition.all)) {
      return condition.all.every((sub) => evaluateCondition(sub, ctx));
    }
  }
  return false;
}

/**
 * 0.8.6 — if a change carries a `computeValue(actor, item)` function,
 * run it to derive the value at apply time. Returns the literal `value`
 * field otherwise. Thrown errors resolve to 0 and log once so a broken
 * custom computation doesn't stop the whole derived pass.
 */
function resolveChangeValue(change, ctx) {
  if (typeof change?.computeValue === "function") {
    try {
      return change.computeValue(ctx?.actor, ctx?.item);
    } catch (err) {
      console.warn("gamma-world-1e: computeValue failed", err, change);
      return 0;
    }
  }
  return change?.value;
}

/**
 * 0.8.4 Tier 1 — apply data-driven AE-style effects to the derived
 * object. Iterates every enabled mutation item on the actor; for each
 * mutation whose rule has an `effects` array, applies each change's
 * mode to the target derived path.
 *
 * 0.8.6 — extends the flatten-sort-apply pipeline with:
 *   - condition filtering (effect.condition OR change.condition)
 *   - computeValue resolution (change.computeValue function replaces
 *     the static `value` field when present)
 *   - a computed `encumbered` context flag (matches the Heightened
 *     Dexterity check: any armor equipped ⇒ encumbered)
 *
 * Only targets keys under `gw.*` today — AE changes targeting
 * `system.*` paths are handled by Foundry's own applyActiveEffects()
 * during super.prepareDerivedData(), so we don't need to duplicate
 * that work here. Future tiers will expand the supported targets.
 */
export function applyMutationEffects(actor, derived) {
  // Compute the "encumbered" flag for condition evaluation. Matches the
  // Heightened Dexterity gate in applyMutationModifiers (any equipped
  // armor ⇒ encumbered). Computed here rather than stored on derived
  // because _prepareEncumbrance (which populates `gw.encumbrance`) runs
  // AFTER buildActorDerived, so we can't rely on derived.encumbered.
  const encumbered = actor.items.some((entry) => entry.type === "armor" && entry.system?.equipped);
  const evalCtx = { actor, derived: { ...derived, encumbered } };

  // Collect every change across every enabled mutation, then sort by
  // priority ascending (Foundry's convention). Priority lets high-
  // priority OVERRIDEs (Mental Defenselessness → MR 3, priority 50)
  // win over low-priority ADDs (Heightened Intelligence → MR +4,
  // priority 20) regardless of the order the mutation items appear in
  // the actor's inventory.
  const mutations = actor.items.filter((item) => item.type === "mutation");
  const collected = [];
  for (const item of mutations) {
    if (!mutationIsEnabled(item)) continue;
    const rule = getMutationRule(item);
    const effects = rule?.effects;
    if (!Array.isArray(effects) || !effects.length) continue;
    const itemCtx = { ...evalCtx, item };
    for (const effect of effects) {
      if (effect?.condition && !evaluateCondition(effect.condition, itemCtx)) continue;
      const changes = Array.isArray(effect?.changes) ? effect.changes : [];
      for (const change of changes) {
        if (change?.condition && !evaluateCondition(change.condition, itemCtx)) continue;
        collected.push({ change, ctx: itemCtx });
      }
    }
  }
  collected.sort((a, b) => {
    const pa = Number.isFinite(Number(a?.change?.priority)) ? Number(a.change.priority) : 20;
    const pb = Number.isFinite(Number(b?.change?.priority)) ? Number(b.change.priority) : 20;
    return pa - pb;
  });
  for (const entry of collected) applyEffectChange(derived, entry.change, entry.ctx);
}

/**
 * 0.9.0 Tier 3 — exposed so effect-state.mjs can reuse the same mode
 * switch for AE-backed temp effects. applyMutationEffects still owns the
 * priority-flatten-sort pass for mutation items; this helper is the
 * per-change atomic apply that both paths share.
 */
export function applyEffectChange(derived, change, ctx) {
  const rawKey = String(change?.key ?? "");
  if (!rawKey.startsWith("gw.")) return; // future: handle system.* / flags.*
  const path = rawKey.slice(3); // strip "gw."
  const rawValue = resolveChangeValue(change, ctx);
  const mode = Number(change?.mode) || 0;

  const currentRaw = foundry.utils.getProperty(derived, path);
  switch (mode) {
    case 1: { // MULTIPLY
      const current = Number(currentRaw) || 1;
      const factor = Number(rawValue) || 1;
      foundry.utils.setProperty(derived, path, current * factor);
      break;
    }
    case 2: { // ADD
      const current = Number(currentRaw) || 0;
      const delta = Number(rawValue) || 0;
      foundry.utils.setProperty(derived, path, current + delta);
      break;
    }
    case 3: { // DOWNGRADE (min)
      const current = Number(currentRaw);
      const candidate = Number(rawValue) || 0;
      const next = Number.isFinite(current) ? Math.min(current, candidate) : candidate;
      foundry.utils.setProperty(derived, path, next);
      break;
    }
    case 4: { // UPGRADE (max)
      const current = Number(currentRaw) || 0;
      const candidate = Number(rawValue) || 0;
      foundry.utils.setProperty(derived, path, Math.max(current, candidate));
      break;
    }
    case 5: { // OVERRIDE
      let value = rawValue;
      if (rawValue === "true") value = true;
      else if (rawValue === "false") value = false;
      else if (Number.isFinite(Number(rawValue)) && String(rawValue).trim() !== "") value = Number(rawValue);
      foundry.utils.setProperty(derived, path, value);
      break;
    }
    case 0: // CUSTOM — not yet supported; silently skip
    default:
      break;
  }
}

/**
 * 0.8.6 — every mutation with numeric mechanical effects has migrated
 * to MUTATION_RULES.effects and flows through applyMutationEffects.
 * This function stays as a no-op extension point (the buildActorDerived
 * pipeline still calls it before applyMutationEffects) so any future
 * mutation needing non-AE runtime logic can slot back in without
 * re-wiring the derived pipeline. Remove it only when we're certain no
 * future mutation will need the imperative path.
 */
// eslint-disable-next-line no-unused-vars
export function applyMutationModifiers(_actor, _derived) {
  // Intentionally empty. See block comment above.
}

export function baseCombatBonuses(actor) {
  return {
    toHitBonus:      combatBonusFromDexterity(actor.system.attributes.dx.value),
    meleeToHitBonus: hitBonusFromStrength(actor.system.attributes.ps.value),
    damageFlat:      damageBonusFromStrength(actor.system.attributes.ps.value)
  };
}

/** Exposed for tests. */
export { hitBonusFromStrength, damageBonusFromStrength, combatBonusFromDexterity };
