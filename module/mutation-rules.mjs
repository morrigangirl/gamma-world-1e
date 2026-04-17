import { findMutationByName } from "./tables/mutation-data.mjs";

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

function fillVariant(summary, variant) {
  if (!variant) return summary ?? "";
  return String(summary ?? "").replace(/_+/g, variant);
}

function mutationVariant(name, rng = Math.random) {
  switch (name) {
    case "Absorption":
      return randomChoice(["cold", "heat", "light", "paralysis rays", "radiation", "mental blasts"], rng);
    case "Body Structure Change":
      return randomChoice(["brittle bones", "hairless body", "single central eye"], rng);
    case "Complete Mental Block":
      return randomChoice(["robotic beings", "technology", "plants", "animals"], rng);
    case "Fear Impulse":
      return randomChoice(["fire", "darkness", "water", "robots", "heights"], rng);
    case "Genius Capability": {
      const roll = Math.floor(rng() * 6) + 1;
      if (roll <= 2) return "military";
      if (roll <= 4) return "scientific";
      return "economic";
    }
    case "Physical Reflection":
      return randomChoice(["heat", "cold", "light", "electricity", "laser fire", "radiation"], rng);
    default:
      return "";
  }
}

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
    effect: { formula: "", saveType: "mental", notes: "Successful mental attack strips away a target's greatest mutation first." },
    action: "note"
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
    effect: { formula: "", saveType: "mental", notes: "Treat non-intelligent creatures as MR 12 when forcing emotions." },
    action: "note"
  },
  "Force Field Generation": {
    mode: "toggle",
    range: "Self",
    duration: "Up to 1 hour",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "5d6", saveType: "", notes: "Barrier surrounds the body and absorbs up to 5d6 damage." },
    action: "toggle"
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
    action: "toggle"
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
    effect: { formula: "", saveType: "mental", notes: "Ferrous objects resist as MR 12." },
    action: "note"
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
    action: "toggle"
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
    action: "toggle"
  },
  "Repulsion Field": {
    mode: "toggle",
    range: "15 m",
    duration: "Up to 1 hour",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "5d6", saveType: "", notes: "Improved force field that can enclose other beings." },
    action: "toggle"
  },
  "Shapechange": {
    mode: "toggle",
    range: "Self",
    duration: "While active",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Takes two rounds to assume a new shape." },
    action: "toggle"
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
    effect: { formula: "", saveType: "mental", notes: "Living targets resist as mental attacks." },
    action: "note"
  },
  "Telekinetic Arm": {
    mode: "action",
    range: "20 m",
    duration: "While visible",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "1d6", saveType: "", notes: "Acts as a telekinetic arm with Strength 18." },
    action: "damage"
  },
  "Telekinetic Flight": {
    mode: "toggle",
    range: "Self",
    duration: "While active",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Fly at up to 20 meters per second, carrying a normal load." },
    action: "toggle"
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
  "Will Force": {
    mode: "toggle",
    range: "Self",
    duration: "1d10 rounds",
    usage: { limited: true, per: "day", uses: 1, max: 1 },
    effect: { formula: "1d10", saveType: "", notes: "Choose one ability to double or gain +1 to hit while active." },
    action: "toggle"
  },
  "Chameleon Powers": {
    mode: "toggle",
    range: "Self",
    duration: "While active",
    usage: { limited: false, per: "at-will", uses: 0, max: 0 },
    effect: { formula: "", saveType: "", notes: "Blend into the environment; treat the mutant as invisible until revealed." },
    action: "toggle"
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

export function buildMutationItemSource(definition, { rng = Math.random } = {}) {
  const rule = getMutationRule(definition.name);
  const variant = mutationVariant(definition.name, rng);
  const summary = fillVariant(definition.summary, variant);
  const notes = variant ? `Variant: ${variant}.` : "";

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
      description: {
        value: `<p>${summary}</p>`
      }
    }
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
  if ((system.cooldown.max ?? 0) === 0 && Number(rule.cooldown?.max ?? 0) > 0) {
    system.cooldown.max = rule.cooldown.max;
  }
  return system;
}

export function applyMutationModifiers(actor, derived) {
  const equippedArmor = actor.items.filter((item) => item.type === "armor" && item.system.equipped);
  const encumbered = equippedArmor.length > 0;

  for (const item of actor.items.filter((entry) => entry.type === "mutation")) {
    const enabled = mutationIsEnabled(item);
    const name = item.name;
    const variant = item.system.reference?.variant ?? "";

    switch (name) {
      case "Double Physical Pain":
      case "Multiple Damage":
        derived.damageTakenMultiplier *= 2;
        break;
      case "Genius Capability":
        if (variant === "military") {
          derived.toHitBonus += 4;
          derived.weaponExtraDice += 1;
        } else if (variant === "economic") {
          derived.charismaBonus += 3;
        }
        break;
      case "Heightened Constitution":
        derived.hpBonus += (actor.system.attributes.cn.value ?? 0) * 2;
        derived.poisonResistance = Math.max(derived.poisonResistance, 18);
        derived.radiationResistance += 3;
        break;
      case "Heightened Dexterity":
        if (!encumbered) derived.baseAc = Math.min(derived.baseAc, 4);
        break;
      case "Heightened Intelligence":
      case "Mental Defense Shield":
        derived.mentalResistance = Math.min(18, derived.mentalResistance + 4);
        break;
      case "Heightened Brain Talent":
        break;
      case "Heightened Precision":
        derived.weaponExtraDice += 2;
        break;
      case "Heightened Strength":
        derived.conventionalWeaponExtraDice += 3;
        break;
      case "Increased Speed":
        derived.movementMultiplier *= 2;
        derived.extraAttacks += 1;
        break;
      case "Intuition":
        derived.toHitBonus += 1;
        derived.damagePerDie += 3;
        derived.cannotBeSurprised = true;
        break;
      case "Mental Control Over Physical State":
        if (enabled) {
          derived.toHitBonus += Math.max(0, combatBonusFromDexterity(actor.system.attributes.dx.value));
          derived.damageFlat += Math.max(0, damageBonusFromStrength(actor.system.attributes.ps.value));
          derived.movementMultiplier *= 2;
        }
        break;
      case "Mental Defenselessness":
        derived.mentalResistance = 3;
        break;
      case "Molecular Understanding":
        derived.weaponExtraDice += 1;
        break;
      case "Partial Carapace":
        derived.baseAc = Math.min(derived.baseAc, 6);
        break;
      case "Heightened Hearing":
        derived.cannotBeSurprised = true;
        derived.surpriseModifier += 2;
        break;
      case "Heightened Smell":
      case "Heightened Vision":
      case "Ultravision":
      case "Infravision":
        derived.surpriseModifier += 1;
        break;
      case "Heightened Touch":
      case "No Sensory Nerve Endings":
        break;
      case "Radar/Sonar":
        derived.closeRangeToHitBonus += 2;
        break;
      case "Shorter":
        derived.ac = Math.max(1, derived.ac - 1);
        derived.damageReductionMultiplier *= 0.75;
        break;
      case "Taller":
        derived.damageFlat += 2;
        derived.toHitBonus -= 1;
        break;
      case "Fat Cell Accumulation":
        derived.movementMultiplier *= 0.75;
        derived.toHitBonus -= 1;
        break;
      case "Telekinetic Flight":
        if (enabled) derived.flightSpeed = Math.max(derived.flightSpeed, 200);
        break;
      case "Total Carapace":
        derived.baseAc = Math.min(derived.baseAc, 4);
        derived.damageReductionMultiplier *= 0.5;
        derived.movementMultiplier *= 0.75;
        break;
      case "Vision Defect":
        derived.toHitBonus -= 4;
        break;
      case "Weight Decrease":
        derived.movementMultiplier *= 0.75;
        derived.damageFlat -= 1;
        break;
      case "Will Force":
        if (enabled) {
          const chosen = variant || "to-hit";
          if (chosen === "to-hit") {
            derived.toHitBonus += 1;
          } else if (actor.system.attributes[chosen]) {
            const score = actor.system.attributes[chosen].value ?? 0;
            if (chosen === "dx") {
              derived.toHitBonus += combatBonusFromDexterity(score * 2) - combatBonusFromDexterity(score);
            } else if (chosen === "ps") {
              derived.damageFlat += damageBonusFromStrength(score * 2) - damageBonusFromStrength(score);
            } else if (chosen === "ms") {
              derived.mentalResistance = Math.min(18, Math.max(derived.mentalResistance, score * 2));
            } else if (chosen === "ch") {
              derived.charismaBonus += score;
            } else if (chosen === "cn") {
              derived.radiationResistance += Math.max(0, score);
              derived.poisonResistance += Math.max(0, score);
            }
          }
        }
        break;
      case "Wings":
        derived.flightSpeed = Math.max(derived.flightSpeed, 120);
        break;
      default:
        break;
    }
  }
}

export function baseCombatBonuses(actor) {
  return {
    toHitBonus: combatBonusFromDexterity(actor.system.attributes.dx.value),
    damageFlat: damageBonusFromStrength(actor.system.attributes.ps.value)
  };
}
