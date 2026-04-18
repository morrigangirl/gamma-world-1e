import { SYSTEM_ID } from "../module/config.mjs";
import { enrichEquipmentSystemData } from "../module/equipment-rules.mjs";
import { buildMutationItemSource } from "../module/mutation-rules.mjs";
import { findMutationByName } from "../module/tables/mutation-data.mjs";
import {
  createPrototypeTokenSource,
  defaultPrototypeTokenOptions,
  monsterPortraitPath,
  monsterTokenPath
} from "../module/token-defaults.mjs";

function htmlParagraphs(...parts) {
  return parts.filter(Boolean).map((text) => `<p>${text}</p>`).join("");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampAttribute(value, fallback = 10) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.max(3, Math.min(18, Math.round(numeric)));
}

function move(value) {
  return Math.max(10, Math.round(Number(value) * 10));
}

function levelFromHitDice(hitDice = 1, hp = 0) {
  const explicit = Math.max(0, Math.round(Number(hitDice) || 0));
  if (explicit > 0) return explicit;
  return Math.max(1, Math.ceil(Math.max(1, Number(hp) || 1) / 6));
}

function buildStats({
  hitDice = 1,
  mentalStrength = 6,
  intelligence = mentalStrength,
  dexterity = 10,
  charisma = 6,
  constitution = null,
  physicalStrength = null
} = {}) {
  return {
    ms: clampAttribute(mentalStrength, 6),
    in: clampAttribute(intelligence, mentalStrength),
    dx: clampAttribute(dexterity, 10),
    ch: clampAttribute(charisma, 6),
    cn: clampAttribute(constitution ?? (hitDice + 6), hitDice + 6),
    ps: clampAttribute(physicalStrength ?? (hitDice + 7), hitDice + 7)
  };
}

function weaponSource({
  name,
  damage,
  attackType = "melee",
  short = 0,
  medium = 0,
  long = 0,
  effect = {},
  traits = {},
  description = "",
  natural = false
}) {
  const source = {
    name,
    type: "weapon",
    img: "icons/svg/sword.svg",
    flags: natural ? { [SYSTEM_ID]: { naturalWeapon: true } } : {},
    system: {
      weaponClass: 1,
      damage: { formula: damage, type: attackType === "energy" ? "energy" : "physical" },
      range: { short, medium, long },
      attackType,
      rof: 1,
      ammo: { current: 0, max: 0, consumes: false },
      effect: {
        mode: effect.mode ?? "damage",
        formula: effect.formula ?? "",
        status: effect.status ?? "",
        notes: effect.notes ?? ""
      },
      traits: {
        tag: traits.tag ?? (natural ? "natural" : ""),
        deflectAc2Hits: 0,
        deflectAc1Hits: 0,
        bypassesForceField: false,
        requiresNoForceField: false,
        nonlethal: !!traits.nonlethal
      },
      quantity: 1,
      weight: 0,
      equipped: true,
      description: { value: description }
    }
  };
  enrichEquipmentSystemData(source);
  return source;
}

function naturalWeaponSource(config) {
  return weaponSource({ ...config, natural: true });
}

function armorSource({
  name,
  acValue,
  description = "",
  flight = 0,
  jump = 0,
  lift = 0,
  fieldMode = "none",
  fieldCapacity = 0,
  punchDamage = "",
  protection = {}
}) {
  const source = {
    name,
    type: "armor",
    img: "icons/svg/holy-shield.svg",
    system: {
      acValue,
      armorType: "heavy",
      dxPenalty: 0,
      field: {
        mode: fieldMode,
        capacity: fieldCapacity
      },
      mobility: {
        flight,
        jump,
        lift
      },
      offense: {
        punchDamage
      },
      protection: {
        blackRayImmune: !!protection.blackRayImmune,
        radiationImmune: !!protection.radiationImmune,
        poisonImmune: !!protection.poisonImmune,
        laserImmune: !!protection.laserImmune,
        mentalImmune: !!protection.mentalImmune
      },
      equipped: true,
      quantity: 1,
      weight: 0,
      description: { value: description }
    }
  };
  enrichEquipmentSystemData(source);
  return source;
}

function abilitySource({
  name,
  notes,
  mode = "guided",
  damageFormula = "",
  intensityFormula = "",
  radius = 0,
  durationFormula = "",
  status = "",
  ongoing = false
}) {
  const source = {
    name,
    type: "gear",
    img: "icons/svg/explosion.svg",
    system: {
      quantity: 1,
      weight: 0,
      tech: "none",
      action: {
        mode,
        damageFormula,
        saveType: "",
        intensityFormula,
        radius,
        durationFormula,
        acDelta: 0,
        toHitDelta: 0,
        status,
        consumeQuantity: 0,
        ongoing,
        notes
      },
      description: {
        value: htmlParagraphs(notes)
      }
    }
  };
  enrichEquipmentSystemData(source);
  return source;
}

function mutationSource(name) {
  const definition = findMutationByName(name);
  if (!definition) throw new Error(`Unknown mutation: ${name}`);
  return buildMutationItemSource(definition, { rng: () => 0 });
}

function actorSystem({
  detailsType = "mutated-animal",
  creatureClass = "",
  animalForm = "",
  level = 1,
  movement = move(12),
  role = "monster",
  alliance = "",
  speech = "",
  stats,
  hp,
  biography = "",
  robotics = null
}) {
  return {
    details: {
      type: detailsType,
      animalForm,
      level,
      xp: 0,
      movement,
      alliance,
      role,
      speech,
      creatureClass
    },
    attributes: Object.fromEntries(
      Object.entries(stats).map(([key, value]) => [key, { value, mod: 0, save: 0 }])
    ),
    combat: {
      baseAc: 10,
      naturalAttack: {
        name: "Natural Attack",
        damage: "1d6"
      }
    },
    resources: {
      hp: { base: hp, value: hp, max: hp, formula: "" },
      ac: 10,
      mentalResistance: stats.ms,
      radResistance: stats.cn,
      poisonResistance: stats.cn
    },
    biography: {
      value: biography,
      appearance: "",
      notes: ""
    },
    social: {
      languages: speech,
      literacy: "",
      relatives: "",
      homeRegion: "",
      reputation: 0
    },
    encounter: {
      reactionModifier: 0,
      surpriseModifier: 0,
      morale: 0,
      intelligence: "auto",
      cannotBeSurprised: false
    },
    robotics: robotics ?? {
      isRobot: false,
      mode: "inactive",
      chassis: "",
      identifier: "",
      controller: "",
      powerSource: "none",
      powerCurrent: 0,
      powerMax: 0,
      broadcastCapable: false,
      backupHours: 0,
      repairDifficulty: 0,
      malfunction: ""
    },
    chargen: {
      rolled: true,
      statMethod: "manual",
      mutationMethod: "random",
      mutationsRolled: false
    }
  };
}

function monsterSource({
  name,
  detailsType = "mutated-animal",
  creatureClass = "",
  animalForm = "",
  hitDice = 1,
  hp = hitDice * 6,
  movement = move(12),
  role = "monster",
  alliance = "",
  speech = "",
  stats,
  biography = "",
  armor,
  weapons = [],
  mutations = [],
  abilities = [],
  extraItems = [],
  robotics = null,
  img = monsterPortraitPath(name)
}) {
  const level = levelFromHitDice(hitDice, hp);
  const resolvedStats = stats ?? buildStats({ hitDice });
  const items = compactItems([
    armor,
    ...weapons,
    ...mutations.map((entry) => mutationSource(entry)),
    ...abilities,
    ...extraItems
  ]);

  return {
    name,
    type: "monster",
    img,
    prototypeToken: createPrototypeTokenSource(defaultPrototypeTokenOptions(
      { name, type: "monster", img },
      { textureSrc: monsterTokenPath(name) }
    )),
    system: actorSystem({
      detailsType,
      creatureClass,
      animalForm,
      level,
      movement,
      role,
      alliance,
      speech,
      stats: resolvedStats,
      hp,
      biography,
      robotics
    }),
    items
  };
}

function compactItems(items) {
  return items.filter(Boolean).map((item) => clone(item));
}

function guided(name, notes) {
  return abilitySource({ name, notes });
}

function area(name, damageFormula, radius, notes = "") {
  return abilitySource({
    name,
    mode: "area-damage",
    damageFormula,
    radius,
    notes
  });
}

function mutationBombStyle(name, notes) {
  return abilitySource({ name, mode: "mutation-bomb", radius: 30, notes });
}

const MONSTER_PACK = [
  monsterSource({
    name: "Android Thinker",
    detailsType: "robot",
    creatureClass: "Android",
    hitDice: 8,
    hp: 50,
    movement: move(12),
    role: "synthetic thinker",
    speech: "common, machine codes",
    stats: buildStats({ hitDice: 8, mentalStrength: 18, intelligence: 18, dexterity: 12, charisma: 10, constitution: 12, physicalStrength: 10 }),
    biography: htmlParagraphs("Humaniform synthetic built for planning and command.", "Androids regard humans as a threat and fight to the death; this sample thinker carries a sidearm and relies on superior intellect."),
    armor: armorSource({ name: "Android Frame", acValue: 6, description: "Synthetic shell and internal shielding.", protection: { poisonImmune: true, radiationImmune: true, mentalImmune: true } }),
    weapons: [
      weaponSource({ name: "Laser Pistol", damage: "5d6", attackType: "energy", short: 100, long: 200, traits: { tag: "laser" }, description: "Typical android sidearm." }),
      naturalWeaponSource({ name: "Mechanical Fist", damage: "1d6", description: "Heavy servo-powered strike." })
    ],
    robotics: {
      isRobot: true,
      mode: "programmed",
      chassis: "Android Thinker",
      identifier: "AT-TH",
      controller: "",
      powerSource: "broadcast",
      powerCurrent: 25,
      powerMax: 25,
      broadcastCapable: true,
      backupHours: 12,
      repairDifficulty: 12,
      malfunction: ""
    }
  }),
  monsterSource({
    name: "Android Worker",
    detailsType: "robot",
    creatureClass: "Android",
    hitDice: 7,
    hp: 40,
    movement: move(12),
    role: "synthetic labor unit",
    speech: "common, machine codes",
    stats: buildStats({ hitDice: 7, mentalStrength: 10, intelligence: 10, dexterity: 11, charisma: 8, constitution: 18, physicalStrength: 18 }),
    biography: htmlParagraphs("Humaniform labor machine with tremendous endurance and strength.", "Worker androids are still dangerous once armed or cornered."),
    armor: armorSource({ name: "Android Frame", acValue: 5, description: "Industrial-grade shell.", protection: { poisonImmune: true, radiationImmune: true, mentalImmune: true } }),
    weapons: [
      weaponSource({ name: "Slug Thrower", damage: "2d6", attackType: "ranged", short: 20, long: 40, traits: { tag: "slug", nonlethal: true }, description: "Typical riot-control sidearm." }),
      naturalWeaponSource({ name: "Servo Slam", damage: "1d8", description: "Industrial arms and reinforced frame." })
    ],
    robotics: {
      isRobot: true,
      mode: "programmed",
      chassis: "Android Worker",
      identifier: "AT-WK",
      controller: "",
      powerSource: "broadcast",
      powerCurrent: 20,
      powerMax: 20,
      broadcastCapable: true,
      backupHours: 12,
      repairDifficulty: 10,
      malfunction: ""
    }
  }),
  monsterSource({
    name: "Android Warrior",
    detailsType: "robot",
    creatureClass: "Android",
    hitDice: 13,
    hp: 75,
    movement: move(15),
    role: "synthetic war machine",
    speech: "common, machine codes",
    stats: buildStats({ hitDice: 13, mentalStrength: 10, intelligence: 12, dexterity: 18, charisma: 8, constitution: 18, physicalStrength: 18 }),
    biography: htmlParagraphs("Combat-model android with military reflexes and a built-in hatred of humans.", "Warrior androids normally appear with full battlefield loadouts; this sample carries a rifle."),
    armor: armorSource({ name: "Android Combat Frame", acValue: 4, description: "Duralloy combat shell.", protection: { poisonImmune: true, radiationImmune: true, mentalImmune: true } }),
    weapons: [
      weaponSource({ name: "Laser Rifle", damage: "6d6", attackType: "energy", short: 300, long: 600, traits: { tag: "laser" }, description: "Common warrior-model rifle." }),
      naturalWeaponSource({ name: "Reinforced Fist", damage: "1d10", description: "A heavy combat punch." })
    ],
    robotics: {
      isRobot: true,
      mode: "programmed",
      chassis: "Android Warrior",
      identifier: "AT-WR",
      controller: "",
      powerSource: "broadcast",
      powerCurrent: 38,
      powerMax: 38,
      broadcastCapable: true,
      backupHours: 12,
      repairDifficulty: 14,
      malfunction: ""
    }
  }),
  monsterSource({
    name: "Ark",
    detailsType: "humanoid",
    creatureClass: "Canine Humanoid",
    animalForm: "Dog",
    hitDice: 8,
    movement: move(15),
    role: "dog-man scavenger",
    speech: "trade speech, ark tongue",
    stats: buildStats({ hitDice: 8, mentalStrength: 10, intelligence: 10, dexterity: 12, charisma: 9, constitution: 12, physicalStrength: 14 }),
    biography: htmlParagraphs("A towering intelligent dog-man that fears large winged creatures and covets human hands as delicacies.", "All arks possess telekinesis, weather manipulation, and life leech."),
    armor: armorSource({ name: "Hide and Wicker Shield", acValue: 4, description: "Thick hide reinforced with a wicker shield." }),
    weapons: [weaponSource({ name: "Heavy Club", damage: "1d6", description: "Favored ark hand weapon." })],
    mutations: ["Telekinesis", "Weather Manipulation", "Life Leech"]
  }),
  monsterSource({
    name: "Arn",
    creatureClass: "Mutated Insect",
    animalForm: "Giant Riding Insect",
    hitDice: 8,
    movement: move(3),
    role: "riding insect",
    stats: buildStats({ hitDice: 8, mentalStrength: 4, intelligence: 3, dexterity: 12, charisma: 4, constitution: 12, physicalStrength: 12 }),
    biography: htmlParagraphs("A giant insect often domesticated by small humanoids as a riding beast or beast of burden.", "It can only carry light loads in flight and fights with crushing mandibles."),
    armor: armorSource({ name: "Chitin", acValue: 9, description: "Thin but resilient insect carapace.", flight: move(16) }),
    weapons: [naturalWeaponSource({ name: "Mandibles", damage: "2d6", description: "Large crushing jaws." })]
  }),
  monsterSource({
    name: "Badder",
    detailsType: "humanoid",
    creatureClass: "Badgeroid Humanoid",
    animalForm: "Badger",
    hitDice: 6,
    movement: move(12),
    role: "burrow raider",
    speech: "badder speech, broken trade speech",
    stats: buildStats({ hitDice: 6, mentalStrength: 16, intelligence: 11, dexterity: 18, charisma: 7, constitution: 12, physicalStrength: 13 }),
    biography: htmlParagraphs("Intelligent badgeroid raiders organized into burrow clans.", "Badders are exceptionally quick in combat, frequently armored, and capable of empathy."),
    armor: armorSource({ name: "Natural Hide", acValue: 4, description: "Tough fur and scavenged protection." }),
    weapons: [
      naturalWeaponSource({ name: "Vicious Bite", damage: "1d6", description: "A fast snapping bite." }),
      weaponSource({ name: "Scavenged Spear", damage: "1d6", description: "Typical badder war gear." })
    ],
    mutations: ["Empathy"]
  }),
  monsterSource({
    name: "Barl Nep",
    creatureClass: "Mutated Fish",
    animalForm: "Fish",
    hitDice: 20,
    movement: move(20),
    role: "radioactive lake predator",
    stats: buildStats({ hitDice: 20, mentalStrength: 3, intelligence: 2, dexterity: 10, charisma: 3, constitution: 18, physicalStrength: 12 }),
    biography: htmlParagraphs("A black fish that defends itself by covering nearby water with radioactive oil."),
    armor: armorSource({ name: "Slick Scales", acValue: 3, description: "Dense black scales." }),
    abilities: [guided("Radioactive Oil Slick", "When attacked, the barl nep can flood a 10 meter diameter area with intensity 18 radioactive oil for up to 10 minutes. A harvested corpse yields a weaker intensity 12 slick.")]
  }),
  monsterSource({
    name: "Ber Lep",
    creatureClass: "Aquatic Plant",
    animalForm: "Floating Lily Plant",
    hitDice: 15,
    movement: move(1),
    role: "floating acid plant",
    stats: buildStats({ hitDice: 15, mentalStrength: 3, intelligence: 2, dexterity: 4, charisma: 3, constitution: 15, physicalStrength: 8 }),
    biography: htmlParagraphs("A broad floating aquatic plant that digests small animals with sweet-smelling acid.", "If injured, it teleports 5 to 30 meters away."),
    armor: armorSource({ name: "Floating Pad", acValue: 6, description: "Resilient fibrous pad." }),
    abilities: [
      guided("Acid Surface", "Creatures standing on the ber lep suffer slow acid exposure until they get clear."),
      guided("Teleport Reaction", "When harmed, the ber lep can teleport 5 to 30 meters to safety.")
    ]
  }),
  monsterSource({
    name: "Blaash",
    creatureClass: "Mutated Moth",
    animalForm: "Moth",
    hitDice: 15,
    movement: move(6),
    role: "radiant moth predator",
    stats: buildStats({ hitDice: 15, mentalStrength: 4, intelligence: 3, dexterity: 12, charisma: 4, constitution: 14, physicalStrength: 9 }),
    biography: htmlParagraphs("A carnivorous moth-creature that glows brightly with intensity 18 radiation when it attacks."),
    armor: armorSource({ name: "Luminous Wings", acValue: 8, description: "Fragile body with broad wings.", flight: move(15) }),
    abilities: [guided("Radiation Aura", "When the blaash attacks, creatures within 5 meters are exposed to intensity 18 radiation.")]
  }),
  monsterSource({
    name: "Blight",
    creatureClass: "Winged Worm",
    animalForm: "Carnivorous Worm",
    hitDice: 12,
    movement: move(2),
    role: "invisible constrictor",
    stats: buildStats({ hitDice: 12, mentalStrength: 5, intelligence: 4, dexterity: 12, charisma: 3, constitution: 14, physicalStrength: 15 }),
    biography: htmlParagraphs("A giant winged worm that becomes invisible at will, flashes blinding light when revealing itself, and prefers to constrict prey.", "It is completely resistant to radiation, heat, and sonic attacks."),
    armor: armorSource({ name: "Resilient Hide", acValue: 9, description: "Thick worm-hide with thermal and sonic resistance.", protection: { radiationImmune: true }, flight: move(10) }),
    weapons: [
      naturalWeaponSource({ name: "Bite", damage: "3d6", description: "A savage maw." }),
      naturalWeaponSource({ name: "Constriction", damage: "5d6", description: "Crushing coils once the blight has wrapped a victim." })
    ],
    mutations: ["Light Wave Manipulation"],
    abilities: [guided("Blinding Reveal", "The blight's first visible strike blinds anyone staring at it for 1 to 4 melee rounds.")]
  }),
  monsterSource({
    name: "Brutorz",
    creatureClass: "Neo-Percheron",
    animalForm: "Horse",
    hitDice: 14,
    movement: move(18),
    role: "giant war mount",
    stats: buildStats({ hitDice: 14, mentalStrength: 12, intelligence: 9, dexterity: 14, charisma: 8, constitution: 15, physicalStrength: 18 }),
    biography: htmlParagraphs("An immense mutated horse prized as a mount by those it deems worthy.", "Brutorz have precognition, can bite savagely, and strike with both forehooves."),
    armor: armorSource({ name: "Massive Hide", acValue: 7, description: "Huge equine body and heavy bone." }),
    weapons: [
      naturalWeaponSource({ name: "Left Forehoof", damage: "2d6", description: "A smashing front kick." }),
      naturalWeaponSource({ name: "Right Forehoof", damage: "2d6", description: "A smashing front kick." }),
      naturalWeaponSource({ name: "Bite", damage: "3d6", description: "A heavy snapping bite." })
    ],
    mutations: ["Precognition"]
  }),
  monsterSource({
    name: "Cal Then",
    creatureClass: "Flying Insect",
    animalForm: "Insect",
    hitDice: 6,
    movement: move(4),
    role: "bone-crushing scavenger",
    stats: buildStats({ hitDice: 6, mentalStrength: 18, intelligence: 12, dexterity: 12, charisma: 4, constitution: 12, physicalStrength: 16 }),
    biography: htmlParagraphs("An intelligent flying insect drawn obsessively to bones.", "Its mandibles can crush even duralloy and it ignores heat and cold."),
    armor: armorSource({ name: "Chitinous Carapace", acValue: 9, description: "Heavy bone-crushing insect shell.", flight: move(12) }),
    weapons: [naturalWeaponSource({ name: "Duralloy Mandibles", damage: "10d6", description: "Massive crushing jaws." })]
  }),
  monsterSource({
    name: "Centisteed",
    creatureClass: "Sixteen-Legged Mount",
    animalForm: "Horse",
    hitDice: 7,
    movement: move(30),
    role: "swift many-legged mount",
    stats: buildStats({ hitDice: 7, mentalStrength: 6, intelligence: 4, dexterity: 13, charisma: 6, constitution: 12, physicalStrength: 15 }),
    biography: htmlParagraphs("A long-bodied former horse whose sixteen legs and immense metabolism make it a remarkable mount.", "Centisteeds are totally immune to mental attack and can generate force fields."),
    armor: armorSource({ name: "Segmented Hide", acValue: 9, description: "Layered hide and dense nerve net.", protection: { mentalImmune: true } }),
    weapons: [naturalWeaponSource({ name: "Trampling Rush", damage: "2d6", description: "A charging body and many kicking legs." })],
    mutations: ["Force Field Generation", "Increased Metabolism"]
  }),
  monsterSource({
    name: "Cren Tosh",
    creatureClass: "Shapechanging Fish-Lizard",
    animalForm: "Fish",
    hitDice: 16,
    movement: move(12),
    role: "collecting shapechanger",
    stats: buildStats({ hitDice: 16, mentalStrength: 12, intelligence: 12, dexterity: 12, charisma: 6, constitution: 16, physicalStrength: 13 }),
    biography: htmlParagraphs("A fish-lizard that burrows elaborate bank tunnels and hoards shiny objects.", "It can become any sort of lizard and fight with sleeth-like mutations."),
    armor: armorSource({ name: "Scaled Hide", acValue: 3, description: "Armored scales and a burrowing body." }),
    weapons: [naturalWeaponSource({ name: "Bite", damage: "2d6", description: "A broad snapping mouth." })],
    mutations: ["Shapechange", "Telepathy", "Precognition"],
    abilities: [guided("Negate Force Fields", "In lizard form, a cren tosh can suppress nearby force fields in the same way a sleeth can.")]
  }),
  monsterSource({
    name: "Crep Plant",
    creatureClass: "Carnivorous Plant",
    animalForm: "Plant",
    hitDice: 15,
    movement: move(1),
    role: "parasitic mutant plant",
    stats: buildStats({ hitDice: 15, mentalStrength: 10, intelligence: 2, dexterity: 4, charisma: 3, constitution: 15, physicalStrength: 12 }),
    biography: htmlParagraphs("A land or water plant with powerful mental attack mutations and grasping vines.", "Leaf-like parasites latch on and drain 10 hit points per melee round."),
    armor: armorSource({ name: "Fibrous Growth", acValue: 3, description: "Dense vegetable tissue." }),
    weapons: [naturalWeaponSource({ name: "Manipulative Vine", damage: "1d6", description: "A grasping vine lash." })],
    mutations: ["Death Field Generation", "Molecular Disruption", "Life Leech"],
    abilities: [guided("Parasitic Attachment", "Attached leaf-parasites drain 10 hit points each melee round until removed or the victim dies.")]
  }),
  monsterSource({
    name: "Ert",
    creatureClass: "Mutated Fish",
    animalForm: "Fish",
    hitDice: 3,
    movement: move(8),
    role: "stone-biting stream fish",
    stats: buildStats({ hitDice: 3, mentalStrength: 3, intelligence: 2, dexterity: 10, charisma: 3, constitution: 10, physicalStrength: 6 }),
    biography: htmlParagraphs("An innocent-looking stream fish whose bite can petrify the unlucky."),
    armor: armorSource({ name: "River Scales", acValue: 9, description: "Fast stream-adapted scales." }),
    weapons: [naturalWeaponSource({ name: "Petrifying Bite", damage: "1d3", effect: { mode: "poison", formula: "12", notes: "A D result turns the victim to stone." }, description: "A tiny but terrible bite." })]
  }),
  monsterSource({
    name: "Ert Telden",
    creatureClass: "Mutated Fish",
    animalForm: "Fish",
    hitDice: 12,
    movement: move(9),
    role: "self-destructing swamp fish",
    stats: buildStats({ hitDice: 12, mentalStrength: 3, intelligence: 2, dexterity: 10, charisma: 3, constitution: 12, physicalStrength: 8 }),
    biography: htmlParagraphs("A swamp fish used by tribes as a living incendiary bomb.", "Out of water it deals 5d6 heat damage nearby on the first round, then explodes for 10d6 on the second."),
    armor: armorSource({ name: "Heat-Swelled Body", acValue: 6, description: "Wet hide built for a violent end." }),
    abilities: [guided("Thermal Death Burst", "When removed from water, the ert telden inflicts 5d6 heat damage within 30 meters on the first melee turn and explodes for 10d6 in the next.")]
  }),
  monsterSource({
    name: "Fen",
    creatureClass: "Amphibious Fish-Humanoid",
    animalForm: "Fish",
    hitDice: 10,
    movement: move(3),
    role: "armed amphibious fish-folk",
    speech: "fen speech, common",
    stats: buildStats({ hitDice: 10, mentalStrength: 12, intelligence: 10, dexterity: 12, charisma: 7, constitution: 18, physicalStrength: 13 }),
    biography: htmlParagraphs("A man-sized intelligent fish with lungs, gills, and translucent skin that makes it invisible underwater.", "Fens use weapons, club with their tails, resist poison and radiation, and can shapechange into large birds."),
    armor: armorSource({ name: "Translucent Skin", acValue: 7, description: "Semi-invisible underwater skin and resilient body.", protection: { radiationImmune: true } }),
    weapons: [naturalWeaponSource({ name: "Tail Club", damage: "6d6", description: "A brutal sweeping tail strike." })],
    mutations: ["Shapechange", "Reflection"],
    abilities: [guided("Underwater Invisibility", "The fen is invisible while submerged."), weaponSource({ name: "Scavenged Spear", damage: "1d6", description: "Fens commonly use recovered weapons." })]
  }),
  monsterSource({
    name: "Fleshin",
    creatureClass: "Flying Fish",
    animalForm: "Fish",
    hitDice: 8,
    movement: move(9),
    role: "gliding lake predator",
    stats: buildStats({ hitDice: 8, mentalStrength: 12, intelligence: 9, dexterity: 13, charisma: 5, constitution: 12, physicalStrength: 10 }),
    biography: htmlParagraphs("A large lake fish that launches into the air and glides for hours on the wind.", "Its dorsal fin is covered in intensity 15 poison, and when badly threatened it can shapechange and fight like a sleeth."),
    armor: armorSource({ name: "Gliding Body", acValue: 8, description: "Streamlined scales and wide fins.", flight: move(5) }),
    weapons: [naturalWeaponSource({ name: "Poison Dorsal Fin", damage: "1d6", effect: { mode: "poison", formula: "15", notes: "The dorsal fin carries intensity 15 poison." }, description: "A slicing toxic fin." })],
    mutations: ["Shapechange", "Telepathy", "Precognition"],
    abilities: [guided("Negate Force Fields", "In sleeth form the fleshin can collapse nearby force fields.")]
  }),
  monsterSource({
    name: "Grens",
    detailsType: "psh",
    creatureClass: "Green Pure Strain Humans",
    animalForm: "Human",
    hitDice: 20,
    movement: move(12),
    role: "forest guardian",
    speech: "common",
    stats: buildStats({ hitDice: 20, mentalStrength: 12, intelligence: 12, dexterity: 12, charisma: 11, constitution: 18, physicalStrength: 14 }),
    biography: htmlParagraphs("Forest-dwelling green-skinned humans who live in deliberate harmony with nature.", "They reject Ancient technology and normally reveal themselves only by choice."),
    armor: armorSource({ name: "Forest Leathers", acValue: 4, description: "Well-made primitive protection suited to deep woods." }),
    weapons: [
      weaponSource({ name: "Long Sword", damage: "1d8", description: "Gren-made blade." }),
      weaponSource({ name: "Bow", damage: "1d6", attackType: "ranged", short: 100, long: 200, description: "A woodland hunting bow." })
    ]
  }),
  monsterSource({
    name: "Herkel",
    creatureClass: "Mutated Fish",
    animalForm: "Fish",
    hitDice: 4,
    movement: move(8),
    role: "poison-scale devourer",
    stats: buildStats({ hitDice: 4, mentalStrength: 3, intelligence: 2, dexterity: 10, charisma: 3, constitution: 10, physicalStrength: 10 }),
    biography: htmlParagraphs("A small but ravenous fish whose bite is matched only by the contact poison coating its scales."),
    armor: armorSource({ name: "Poison Scales", acValue: 9, description: "Scales coated with intensity 18 contact poison." }),
    weapons: [naturalWeaponSource({ name: "Gnashing Bite", damage: "6d6", description: "An impossibly vicious bite for a fish of its size." })],
    abilities: [guided("Contact Poison", "Anything touching a herkel's scales risks intensity 18 contact poison.")]
  }),
  monsterSource({
    name: "Herp",
    creatureClass: "Mutated Beetle",
    animalForm: "Beetle",
    hitDice: 20,
    movement: move(10),
    role: "acid-spraying hunter",
    stats: buildStats({ hitDice: 20, mentalStrength: 6, intelligence: 6, dexterity: 10, charisma: 3, constitution: 18, physicalStrength: 16 }),
    biography: htmlParagraphs("A giant carnivorous beetle with a thick wing case that reflects sonic attacks.", "Its acid spray does 15d6 damage out to 30 meters."),
    armor: armorSource({ name: "Wing Case", acValue: 3, description: "Heavy sonic-reflecting case." }),
    weapons: [naturalWeaponSource({ name: "Acid Spray", damage: "15d6", attackType: "ranged", short: 30, long: 60, description: "A devastating jet of acid.", effect: { mode: "damage", notes: "The acid can eat through half a centimeter of duralloy in three melee turns." } })]
  }),
  monsterSource({
    name: "Hisser",
    detailsType: "humanoid",
    creatureClass: "Snake Humanoid",
    animalForm: "Snake",
    hitDice: 18,
    movement: move(12),
    role: "desert matriarchal psychic",
    speech: "telepathy",
    stats: buildStats({ hitDice: 18, mentalStrength: 12, intelligence: 12, dexterity: 12, charisma: 9, constitution: 16, physicalStrength: 13 }),
    biography: htmlParagraphs("A half-man half-snake psychic society that communicates entirely by telepathy.", "All hissers have telepathy, mass mind, sonic attack, and one additional random mental mutation; their scales resist laser and sonic attacks."),
    armor: armorSource({ name: "Scaly Hide", acValue: 3, description: "Laser-resistant scales and muscular coils.", protection: { laserImmune: true } }),
    weapons: [naturalWeaponSource({ name: "Fanged Strike", damage: "2d6", description: "A quick snapping bite." })],
    mutations: ["Telepathy", "Mass Mind", "Sonic Attack Ability", "Mental Blast"]
  }),
  monsterSource({
    name: "Hoop",
    creatureClass: "Rabbitoid",
    animalForm: "Rabbit",
    hitDice: 15,
    movement: move(18),
    role: "telepathic metal-warping scavenger",
    speech: "telepathy, hoop speech",
    stats: buildStats({ hitDice: 15, mentalStrength: 14, intelligence: 10, dexterity: 14, charisma: 8, constitution: 15, physicalStrength: 14 }),
    biography: htmlParagraphs("A tall mutated rabbitoid that leaps over great obstacles and seeks out Ancient weapons.", "Hoops are telepathic, can use mass mind, and transmute metal to rubber at a touch."),
    armor: armorSource({ name: "Leaping Body", acValue: 9, description: "Long-limbed and difficult to pin down.", jump: move(8) }),
    weapons: [naturalWeaponSource({ name: "Raking Kick", damage: "2d6", description: "Powerful hind-leg kick." })],
    mutations: ["Telepathy", "Mass Mind"],
    abilities: [guided("Rubberize Metal", "Everything metal within 1 meter of the touched point turns to rubber, so long as the pieces remain in contact.")]
  }),
  monsterSource({
    name: "Hopper",
    creatureClass: "Giant Hare",
    animalForm: "Hare",
    hitDice: 3,
    movement: move(12),
    role: "jumping riding beast",
    stats: buildStats({ hitDice: 3, mentalStrength: 4, intelligence: 4, dexterity: 13, charisma: 5, constitution: 10, physicalStrength: 9 }),
    biography: htmlParagraphs("A giant hare used as a riding beast by those willing to survive the first trip.", "Hoppers live by speed, long leaps, and chameleon powers."),
    armor: armorSource({ name: "Hopper Hide", acValue: 9, description: "Light but quick body.", jump: move(24) }),
    weapons: [naturalWeaponSource({ name: "Kicking Hind Legs", damage: "1d6", description: "A skittish defensive kick." })],
    mutations: ["Chameleon Powers"]
  }),
  monsterSource({
    name: "Horl Choo",
    creatureClass: "Carnivorous Plant",
    animalForm: "Plant",
    hitDice: 18,
    movement: move(6),
    role: "spear-flinging ambush plant",
    stats: buildStats({ hitDice: 18, mentalStrength: 4, intelligence: 3, dexterity: 10, charisma: 3, constitution: 16, physicalStrength: 14 }),
    biography: htmlParagraphs("A black ambush plant whose quills are actually long poisonous spear-stems tethered by vines."),
    armor: armorSource({ name: "Spined Growth", acValue: 5, description: "Dense growth studded with quills." }),
    weapons: [naturalWeaponSource({ name: "Poison Spear-Stems", damage: "3d6", attackType: "ranged", short: 90, long: 180, effect: { mode: "poison", formula: "9", notes: "The spear-stems are tipped with intensity 9 poison." }, description: "Fires 6 to 30 tethered spear-stems at approaching prey." })]
  }),
  monsterSource({
    name: "Kai Lin",
    creatureClass: "Predatory Plant",
    animalForm: "Plant",
    hitDice: 12,
    movement: move(10),
    role: "root-tailed carrion hunter",
    speech: "plant clicks",
    stats: buildStats({ hitDice: 12, mentalStrength: 5, intelligence: 5, dexterity: 11, charisma: 4, constitution: 14, physicalStrength: 12 }),
    biography: htmlParagraphs("A reptile-like carrion-hunting plant covered in radiation-resistant bark.", "Kai lin carry electrical generation, attraction odor, and radiated eyes."),
    armor: armorSource({ name: "Radiation Bark", acValue: 6, description: "Green bark that shrugs off radiation.", protection: { radiationImmune: true } }),
    weapons: [naturalWeaponSource({ name: "Thorned Pads", damage: "1d6", description: "Running stalks ending in thorned pads." })],
    mutations: ["Electrical Generation", "Attraction Odor", "Radiated Eyes"]
  }),
  monsterSource({
    name: "Keeshin",
    creatureClass: "Psychic Amphibian",
    animalForm: "Amphibian",
    hitDice: 7,
    movement: move(3),
    role: "solitary treasure-hoarder",
    speech: "telepathy",
    stats: buildStats({ hitDice: 7, mentalStrength: 16, intelligence: 18, dexterity: 12, charisma: 6, constitution: 11, physicalStrength: 6 }),
    biography: htmlParagraphs("A tiny white amphibian that hoards Ancient devices in underwater lairs and kills readily to keep them.", "It may use any two of its many mental mutations each melee turn."),
    armor: armorSource({ name: "Psychic Shell", acValue: 3, description: "Small body protected by potent mental defenses." }),
    mutations: ["Telekinetic Flight", "Telekinesis", "Telekinetic Arm", "Force Field Generation", "Life Leech", "De-Evolution", "Mental Blast", "Cryokinesis", "Reflection"]
  }),
  monsterSource({
    name: "Kep",
    creatureClass: "Burrowing Plant",
    animalForm: "Plant",
    hitDice: 20,
    movement: move(1),
    role: "buried constrictor plant",
    stats: buildStats({ hitDice: 20, mentalStrength: 3, intelligence: 2, dexterity: 4, charisma: 3, constitution: 18, physicalStrength: 18 }),
    biography: htmlParagraphs("A huge underground carnivorous plant whose squeeze-roots spring up when creatures cross its pressure filaments."),
    armor: armorSource({ name: "Buried Root Mass", acValue: 2, description: "A huge buried root-body." }),
    abilities: [guided("Squeeze Roots", "When triggered, the kep's squeeze roots erupt across a roughly 30 meter area and inflict 5d6 constriction damage each melee turn. If reduced below half its hit points, it releases victims and withdraws.")]
  }),
  monsterSource({
    name: "Menarl",
    creatureClass: "Water Snake",
    animalForm: "Snake",
    hitDice: 7,
    movement: move(6),
    role: "many-armed water snake",
    speech: "common, menarl speech",
    stats: buildStats({ hitDice: 7, mentalStrength: 12, intelligence: 10, dexterity: 11, charisma: 7, constitution: 12, physicalStrength: 17 }),
    biography: htmlParagraphs("A ten-meter intelligent water snake with ten usable human-like hands.", "Menarls are relatively friendly and can learn to use Ancient devices."),
    armor: armorSource({ name: "Scaled Coil", acValue: 6, description: "A long scaled serpent body." }),
    weapons: [naturalWeaponSource({ name: "Ten-Handed Crush", damage: "2d6", description: "A flurry of grasping blows and constricting coils." })],
    mutations: ["Heightened Strength"]
  }),
  monsterSource({
    name: "Narl Ep",
    creatureClass: "Aquatic Tree",
    animalForm: "Plant",
    hitDice: 20,
    movement: move(1),
    role: "vine-draped water tree",
    stats: buildStats({ hitDice: 20, mentalStrength: 4, intelligence: 3, dexterity: 5, charisma: 3, constitution: 18, physicalStrength: 16 }),
    biography: htmlParagraphs("An enormous white water-tree whose squeeze vines guard its pale canopy.", "Spring seed pods burst open with a destructive sonic blast."),
    armor: armorSource({ name: "Aquatic Trunk", acValue: 3, description: "Massive white trunk and anchored root mass." }),
    abilities: [
      area("Seed Pod Sonic Burst", "8d6", 10, "Cracked seed pods release 2d6 seeds and a sonic blast that affects all beings within 10 meters."),
      guided("Squeeze Vines", "The narl ep's 5 to 30 squeeze vines defend the tree from anything that approaches too closely.")
    ]
  }),
  monsterSource({
    name: "Obb",
    creatureClass: "Mutated Fungus",
    animalForm: "Fungus",
    hitDice: 12,
    movement: move(1),
    role: "flying fungal hunter",
    speech: "obb speech",
    stats: buildStats({ hitDice: 12, mentalStrength: 12, intelligence: 12, dexterity: 13, charisma: 5, constitution: 14, physicalStrength: 12 }),
    biography: htmlParagraphs("An intelligent bat-like fungus that dives from the air, blasting prey with radiation before striking with stunning claws.", "Obbs are immune to radiation and all laser, light, and heat attacks."),
    armor: armorSource({ name: "Fungal Membrane", acValue: 10, description: "An oddly resilient fungal body.", protection: { radiationImmune: true, laserImmune: true }, flight: move(15) }),
    weapons: [
      naturalWeaponSource({ name: "Left Stunning Claw", damage: "3d6", traits: { nonlethal: true }, description: "A stunning claw-strike." }),
      naturalWeaponSource({ name: "Right Stunning Claw", damage: "3d6", traits: { nonlethal: true }, description: "A stunning claw-strike." })
    ],
    mutations: ["Radiated Eyes"]
  }),
  monsterSource({
    name: "Orlen",
    detailsType: "humanoid",
    creatureClass: "Two-Headed Humanoid",
    animalForm: "Humanoid",
    hitDice: 15,
    movement: move(15),
    role: "four-armed barter mutant",
    speech: "common, telepathy",
    stats: buildStats({ hitDice: 15, mentalStrength: 14, intelligence: 12, dexterity: 13, charisma: 8, constitution: 15, physicalStrength: 15 }),
    biography: htmlParagraphs("A two-headed four-armed mutant whose divided mind lets it wield tools and weapons with eerie ease.", "Orlens are telepathic, telekinetic, and both brains can project will force."),
    armor: armorSource({ name: "Orlen Hide", acValue: 7, description: "Long-limbed and hard to outflank." }),
    weapons: [naturalWeaponSource({ name: "Four-Arm Assault", damage: "2d6", description: "Four arms striking and grappling at once." })],
    mutations: ["Telepathy", "Telekinesis", "Will Force", "Dual Brain"]
  }),
  monsterSource({
    name: "Parn",
    creatureClass: "Mutated Beetle",
    animalForm: "Beetle",
    hitDice: 10,
    movement: move(6),
    role: "spine-launching carnivore",
    stats: buildStats({ hitDice: 10, mentalStrength: 5, intelligence: 4, dexterity: 11, charisma: 3, constitution: 13, physicalStrength: 14 }),
    biography: htmlParagraphs("A huge mutated beetle that kills with sword-like antennae and barbed spines launched from its back.", "Its close combat reach effectively worsens a victim's armor class by three."),
    armor: armorSource({ name: "Barbed Carapace", acValue: 6, description: "A barbed armored shell." }),
    weapons: [
      naturalWeaponSource({ name: "Barbed Spines", damage: "2d6", attackType: "ranged", short: 50, long: 100, description: "The parn may launch two of its heavy barbed spines per melee round." }),
      naturalWeaponSource({ name: "Antenna Blades", damage: "3d6", description: "Four sword-like antennae close in around prey.", effect: { mode: "note", notes: "In close combat the parn effectively worsens its victim's armor class by 3." } })
    ]
  }),
  monsterSource({
    name: "Perth",
    creatureClass: "Radiant Bush",
    animalForm: "Plant",
    hitDice: 8,
    movement: move(1),
    role: "radiation flower",
    stats: buildStats({ hitDice: 8, mentalStrength: 4, intelligence: 2, dexterity: 4, charisma: 3, constitution: 12, physicalStrength: 8 }),
    biography: htmlParagraphs("A palm-like bush crowned by a radiant flower that emits random radiation when disturbed.", "Its dried petals heal 1 hit point per gram if prepared slowly in sunlight."),
    armor: armorSource({ name: "Fibrous Bush", acValue: 4, description: "A dense rooted mutant shrub." }),
    abilities: [
      guided("Radiation Bloom", "Once disturbed, the perth emits random intensity (3d6) radiation within 15 meters each melee round. If damaged, it may emit multiple different blasts at once."),
      guided("Healing Petals", "One perth flower dries into twenty grams of medicinal powder. Each gram heals one lost hit point if dried over three days in sunlight.")
    ]
  }),
  monsterSource({
    name: "Pineto",
    creatureClass: "Walking Plant",
    animalForm: "Plant",
    hitDice: 2,
    movement: move(18),
    role: "needle-covered beast of burden",
    stats: buildStats({ hitDice: 2, mentalStrength: 3, intelligence: 2, dexterity: 10, charisma: 4, constitution: 8, physicalStrength: 16 }),
    biography: htmlParagraphs("A fast-moving horizontal tree that can be ridden or used as a beast of burden if controlled with a sharp goad."),
    armor: armorSource({ name: "Needle Coat", acValue: 4, description: "Dense needles and a woody trunk." }),
    weapons: [naturalWeaponSource({ name: "Tail Lash", damage: "1d6", description: "Its tree-top tail lashes riders or enemies." })]
  }),
  monsterSource({
    name: "Podog",
    creatureClass: "Mutated Mongrel",
    animalForm: "Dog",
    hitDice: 4,
    movement: move(15),
    role: "carnivorous pack hunter",
    stats: buildStats({ hitDice: 4, mentalStrength: 5, intelligence: 5, dexterity: 11, charisma: 5, constitution: 14, physicalStrength: 12 }),
    biography: htmlParagraphs("A large mutated dog often trained young as a riding beast.", "All podogs are completely immune to poison; exceptional prized animals also possess dual brains and telepathy."),
    armor: armorSource({ name: "Pack Hunter Hide", acValue: 5, description: "Thick hide and a low, tough body.", protection: { poisonImmune: true } }),
    weapons: [naturalWeaponSource({ name: "Teeth and Slashing Jaws", damage: "2d6", description: "Pack-hunter bite and slash." })],
    abilities: [guided("Imitated Cry", "A podog's bay can imitate prey or foe calls, often buying the pack initiative to attack or flee.")]
  }),
  monsterSource({
    name: "Rakox",
    creatureClass: "Mutated Ox",
    animalForm: "Ox",
    hitDice: 20,
    movement: move(9),
    role: "horned draft beast",
    stats: buildStats({ hitDice: 20, mentalStrength: 4, intelligence: 3, dexterity: 8, charisma: 4, constitution: 18, physicalStrength: 18 }),
    biography: htmlParagraphs("A huge ox with a partial carapace and a forward frill of long horns.", "Charging rakoxes do double damage and can carry immense loads."),
    armor: armorSource({ name: "Partial Carapace", acValue: 4, description: "Heavy partial shell and enormous bulk." }),
    weapons: [naturalWeaponSource({ name: "Horn Gore", damage: "2d6", description: "A typical man-sized victim is usually caught by one to three horns.", effect: { mode: "note", notes: "A charging rakox does double damage." } })]
  }),
  monsterSource({
    name: "Sep",
    creatureClass: "Land Shark",
    animalForm: "Shark",
    hitDice: 17,
    movement: move(10),
    role: "sand-burrowing hunter",
    stats: buildStats({ hitDice: 17, mentalStrength: 8, intelligence: 6, dexterity: 11, charisma: 3, constitution: 17, physicalStrength: 17 }),
    biography: htmlParagraphs("A mutated shark that plows beneath packed sand with a telekinetic organ in its head and bursts out to attack prey.", "It can sense living creatures from up to 50 meters away."),
    armor: armorSource({ name: "Shark Hide", acValue: 5, description: "Dense abrasive skin." }),
    weapons: [naturalWeaponSource({ name: "Massive Bite", damage: "9d6", description: "The sep bursts from below with a devastating bite." })],
    mutations: ["Telekinesis"]
  }),
  monsterSource({
    name: "Serf",
    detailsType: "humanoid",
    creatureClass: "Psychic Humanoid",
    animalForm: "Humanoid",
    hitDice: 10,
    movement: move(12),
    role: "brigade psychic",
    speech: "common",
    stats: buildStats({ hitDice: 10, mentalStrength: 15, intelligence: 12, dexterity: 12, charisma: 8, constitution: 14, physicalStrength: 16 }),
    biography: htmlParagraphs("Semi-nomadic quasi-military humanoids with partial carapaces, poison claws, and a formidable suite of mental mutations.", "Serfs prefer to fight with their powers rather than with weapons."),
    armor: armorSource({ name: "Partial Carapace", acValue: 6, description: "Hard plates over the torso and limbs." }),
    weapons: [naturalWeaponSource({ name: "Poison Claws", damage: "1d6", effect: { mode: "poison", formula: "8", notes: "Serf claws carry intensity 8 poison." }, description: "Clawed hands with toxic nails." })],
    mutations: ["Heightened Strength", "Light Wave Manipulation", "Density Control (Others)", "Life Leech", "Death Field Generation", "Mental Blast", "Telepathy"]
  }),
  monsterSource({
    name: "Seroon Lou",
    creatureClass: "Aquatic Plant",
    animalForm: "Plant",
    hitDice: 8,
    movement: move(3),
    role: "vine-armed aquatic carnivore",
    stats: buildStats({ hitDice: 8, mentalStrength: 5, intelligence: 4, dexterity: 7, charisma: 3, constitution: 12, physicalStrength: 12 }),
    biography: htmlParagraphs("A huge green aquatic plant with a single eye and many bludgeoning vines.", "It drags prey below the surface to digest it through its roots."),
    armor: armorSource({ name: "Lake Growth", acValue: 8, description: "Thick green stalk and many roots." }),
    weapons: [naturalWeaponSource({ name: "Bludgeoning Vines", damage: "2d6", description: "Multiple heavy striking vines." })]
  }),
  monsterSource({
    name: "Sleeth",
    detailsType: "humanoid",
    creatureClass: "Mutated Lizard",
    animalForm: "Lizard",
    hitDice: 18,
    movement: move(12),
    role: "philosopher lizard",
    speech: "common, telepathy",
    stats: buildStats({ hitDice: 18, mentalStrength: 17, intelligence: 17, dexterity: 12, charisma: 10, constitution: 16, physicalStrength: 14 }),
    biography: htmlParagraphs("Highly intelligent three-meter lizards who favor philosophy, religion, and quiet communities.", "Sleeths are immune to illusions, resist poison, and can negate force fields within 30 meters."),
    armor: armorSource({ name: "Lizard Scales", acValue: 5, description: "Durable scales and long reach." }),
    weapons: [naturalWeaponSource({ name: "Claws and Bite", damage: "2d6", description: "A sleeth can fight physically or with scavenged weapons." }), weaponSource({ name: "Scavenged Sword", damage: "1d8", description: "Sleeth settlements commonly keep recovered weapons." })],
    mutations: ["Telepathy", "Precognition"],
    abilities: [guided("Negate Force Fields", "Any force field within 30 meters of a sleeth can be suppressed or collapsed by its mental power.")]
  }),
  monsterSource({
    name: "Soul Besh",
    creatureClass: "Mutated Mosquito",
    animalForm: "Mosquito",
    hitDice: 10,
    movement: move(9),
    role: "camouflaged blood-drinker",
    stats: buildStats({ hitDice: 10, mentalStrength: 6, intelligence: 4, dexterity: 12, charisma: 3, constitution: 12, physicalStrength: 8 }),
    biography: htmlParagraphs("A giant flightless mosquito that ambushes prey under chameleon concealment, then injects paralytic poison and drains blood at a terrifying rate."),
    armor: armorSource({ name: "Chameleon Carapace", acValue: 8, description: "A hard exoskeleton and changing coloration." }),
    weapons: [naturalWeaponSource({ name: "Proboscis", damage: "1d6", effect: { mode: "note", notes: "The initial puncture delivers intensity 18 paralytic poison; on following rounds the soul besh drains 12 hit points of blood per melee turn." }, description: "A two meter coiled proboscis." })],
    mutations: ["Chameleon Powers"]
  }),
  monsterSource({
    name: "Terl",
    creatureClass: "Feathered Barracuda",
    animalForm: "Barracuda",
    hitDice: 9,
    movement: move(3),
    role: "telekinetic fish-bird",
    stats: buildStats({ hitDice: 9, mentalStrength: 8, intelligence: 5, dexterity: 12, charisma: 3, constitution: 13, physicalStrength: 12 }),
    biography: htmlParagraphs("A brilliantly feathered barracuda that flies by telekinesis, kills with sonic attack and cryogenesis, and reflects heat and laser attacks."),
    armor: armorSource({ name: "Reflective Plumage", acValue: 5, description: "Heat- and laser-reflective feathers.", protection: { laserImmune: true }, flight: move(12) }),
    weapons: [naturalWeaponSource({ name: "Bite", damage: "2d6", description: "A slashing barracuda bite." })],
    mutations: ["Telekinetic Flight", "Sonic Attack Ability", "Cryokinesis"]
  }),
  monsterSource({
    name: "Win Seen",
    creatureClass: "Mutant Vine Colony",
    animalForm: "Plant",
    hitDice: 13,
    movement: move(1),
    role: "creeping poison vine",
    stats: buildStats({ hitDice: 13, mentalStrength: 8, intelligence: 4, dexterity: 5, charisma: 3, constitution: 14, physicalStrength: 10 }),
    biography: htmlParagraphs("A sprawling connected colony of mutant vines found in both aquatic and land forms.", "The aquatic variety carries contact poison and sonic retaliation; the land variety can force ferrous objects to the ground with crude magnetic control."),
    armor: armorSource({ name: "Interwoven Vines", acValue: 9, description: "A loose but persistent mass of creepers." }),
    mutations: ["Magnetic Control", "Sonic Attack Ability"],
    abilities: [guided("Contact Poison", "The aquatic win seen is covered with intensity 14 contact poison."), guided("Attraction Colony", "Land win seen cultivates nearby carnivores with attraction odors and crude magnetic control.")]
  }),
  monsterSource({
    name: "Yexil",
    creatureClass: "Flying Furred Beast",
    animalForm: "Unknown",
    hitDice: 10,
    movement: move(4),
    role: "cloth-eating flyer",
    stats: buildStats({ hitDice: 10, mentalStrength: 6, intelligence: 5, dexterity: 12, charisma: 8, constitution: 12, physicalStrength: 13 }),
    biography: htmlParagraphs("A massive orange winged beast with hand-tipped wings, a lion-like head, and a taste for stylish clothing.", "Yexils are friendly if bribed with garments and can fire laser beams from their eyes."),
    armor: armorSource({ name: "Fur and Wings", acValue: 6, description: "Cold-resistant fur and giant hand-wings.", flight: move(15) }),
    weapons: [
      naturalWeaponSource({ name: "Mandible Bite", damage: "3d6", description: "A broad snapping bite." }),
      naturalWeaponSource({ name: "Eye Laser", damage: "5d6", attackType: "energy", short: 25, long: 50, traits: { tag: "laser" }, description: "A focused beam from the yexil's eyes." })
    ]
  }),
  monsterSource({
    name: "Zarn",
    creatureClass: "Parasitic Beetle",
    animalForm: "Beetle",
    hitDice: 4,
    movement: move(1),
    role: "teleporting parasite",
    stats: buildStats({ hitDice: 4, mentalStrength: 4, intelligence: 3, dexterity: 14, charisma: 3, constitution: 9, physicalStrength: 4 }),
    biography: htmlParagraphs("A tiny orange parasitic beetle that spits paralytic poison, teleports away, and lays eggs inside helpless victims."),
    armor: armorSource({ name: "Tiny Carapace", acValue: 7, description: "A very small but elusive shell." }),
    weapons: [naturalWeaponSource({ name: "Paralytic Spittle", damage: "0", attackType: "ranged", short: 5, long: 10, effect: { mode: "note", notes: "The spittle is intensity 16 paralytic contact poison; unwashed poison keeps forcing saves each melee turn." }, description: "Spits toxic paralysis venom." })],
    abilities: [guided("Teleport Harrier", "On the round after spitting, the zarn teleports to a new position up to 200 meters away and repeats the attack until its prey is helpless.")]
  }),
  monsterSource({
    name: "Zeethh",
    creatureClass: "Mutated Grass",
    animalForm: "Grass",
    hitDice: 1,
    movement: move(1),
    role: "teleporting seed field",
    stats: buildStats({ hitDice: 1, mentalStrength: 12, intelligence: 1, dexterity: 3, charisma: 3, constitution: 6, physicalStrength: 3 }),
    biography: htmlParagraphs("A blade of purple grass whose tassels fire spiked seeds by mental teleportation into warm-blooded bodies.", "Embedded seeds deal 2d6 damage immediately and continue to rot the host until they die or are removed."),
    armor: armorSource({ name: "Purple Blade", acValue: 10, description: "A tough upright blade of mutant grass." }),
    abilities: [guided("Teleporting Seeds", "Each melee round, one quarter of the zeethh colony's seeds attack warm-blooded creatures within 20 meters as mental strength 12 attacks. Each embedded seed inflicts 2d6 damage immediately and 1 additional point per day for up to 7 days.")]
  }),
  monsterSource({
    name: "Dragon",
    creatureClass: "Mutated Reptile",
    animalForm: "Dragon",
    hitDice: 12,
    hp: 72,
    movement: move(18),
    role: "apex flying predator",
    stats: buildStats({ hitDice: 12, mentalStrength: 12, intelligence: 10, dexterity: 14, charisma: 14, constitution: 18, physicalStrength: 18 }),
    biography: htmlParagraphs("A winged mutated reptile the size of a farm tractor. It hunts from the air and breathes a 40-meter cone of fire.", "Cryptic Alliance recruiters whisper that some dragons can be reasoned with if approached from beneath and flattered extensively."),
    armor: armorSource({ name: "Scales", acValue: 3, description: "Overlapping fireproof scales." }),
    weapons: [
      naturalWeaponSource({ name: "Bite", damage: "3d6", description: "Massive fanged maw." }),
      naturalWeaponSource({ name: "Claw", damage: "1d8", description: "Hooked foreclaws." })
    ],
    abilities: [area("Fire Breath", "8d6", 40, "Cone of flame, 40m range. Save vs radiation/fire for half damage.")]
  }),
  monsterSource({
    name: "Gator",
    creatureClass: "Mutated Crocodile",
    animalForm: "Crocodile",
    hitDice: 6,
    hp: 32,
    movement: move(6),
    role: "ambush predator",
    stats: buildStats({ hitDice: 6, mentalStrength: 8, intelligence: 4, dexterity: 10, charisma: 4, constitution: 16, physicalStrength: 16 }),
    biography: htmlParagraphs("A 4-meter river-crocodile, often mutated with heightened vision and armored scutes."),
    armor: armorSource({ name: "Scute Armor", acValue: 5, description: "Thick bony plates along back and flanks." }),
    weapons: [
      naturalWeaponSource({ name: "Bite", damage: "2d6", description: "Clamping jaws; once a bite hits, the gator rolls and drags the victim underwater." }),
      naturalWeaponSource({ name: "Tail Swipe", damage: "1d8", description: "Heavy sweep that can knock prone targets up to 2m." })
    ],
    abilities: [guided("Death Roll", "If a gator's bite hits, on the next melee turn it can drag the victim into water for an automatic hit and possible drowning.")]
  }),
  monsterSource({
    name: "Feral Dog",
    creatureClass: "Mutated Canine",
    animalForm: "Dog",
    hitDice: 2,
    hp: 10,
    movement: move(15),
    role: "pack hunter",
    stats: buildStats({ hitDice: 2, mentalStrength: 6, intelligence: 5, dexterity: 14, charisma: 4, constitution: 10, physicalStrength: 10 }),
    biography: htmlParagraphs("Roaming wasteland packs descended from the household dogs of the pre-war era. Ferocious and coordinated.", "Often harbor one random mutation; the rest of the pack learns to exploit it."),
    armor: armorSource({ name: "Fur", acValue: 8, description: "Matted fur and tough hide." }),
    weapons: [naturalWeaponSource({ name: "Bite", damage: "1d6", description: "Tearing jaws; +1 to hit when two or more pack members engage the same target." })],
    abilities: [guided("Pack Tactics", "Each feral dog beyond the first attacking a single target grants +1 to hit.")]
  }),
  monsterSource({
    name: "Howler",
    creatureClass: "Mutated Ape",
    animalForm: "Ape",
    hitDice: 4,
    hp: 22,
    movement: move(12),
    role: "terror screamer",
    stats: buildStats({ hitDice: 4, mentalStrength: 14, intelligence: 8, dexterity: 11, charisma: 4, constitution: 12, physicalStrength: 14 }),
    biography: htmlParagraphs("A tall, gaunt simian that paralyses prey with sonic screams. Travels in small family groups."),
    armor: armorSource({ name: "Hide", acValue: 7, description: "Tough hide armor." }),
    weapons: [naturalWeaponSource({ name: "Claw", damage: "1d6", description: "Long-fingered grasping claws." })],
    abilities: [area("Terror Howl", "0", 20, "20m radius. Victims save vs mental attack or are frozen in fear for 1d6 melee turns.")]
  }),
  monsterSource({
    name: "Giant Cockroach",
    creatureClass: "Mutated Insect",
    animalForm: "Cockroach",
    hitDice: 3,
    hp: 14,
    movement: move(12),
    role: "swarm scavenger",
    stats: buildStats({ hitDice: 3, mentalStrength: 4, intelligence: 2, dexterity: 14, charisma: 2, constitution: 12, physicalStrength: 10 }),
    biography: htmlParagraphs("Waist-high cockroaches scuttle through ruined buildings and eat anything organic, including the unwary."),
    armor: armorSource({ name: "Chitin", acValue: 6, description: "Glossy chitinous shell." }),
    weapons: [naturalWeaponSource({ name: "Mandible Bite", damage: "1d4", description: "Serrated mandibles." })],
    abilities: [guided("Radiation Immunity", "Giant cockroaches are fully immune to radiation.")]
  }),
  monsterSource({
    name: "Giant Termite",
    creatureClass: "Mutated Insect",
    animalForm: "Termite",
    hitDice: 2,
    hp: 9,
    movement: move(6),
    role: "wood-devouring soldier",
    stats: buildStats({ hitDice: 2, mentalStrength: 3, intelligence: 2, dexterity: 10, charisma: 2, constitution: 14, physicalStrength: 12 }),
    biography: htmlParagraphs("Man-sized termites devour wooden structures. Hive colonies number in the hundreds and surface from tunnel networks under ruined cities."),
    armor: armorSource({ name: "Chitin", acValue: 5, description: "Pale segmented plating." }),
    weapons: [naturalWeaponSource({ name: "Clamp Jaws", damage: "1d8", description: "Crushing jaws that splinter wood and bone." })],
    abilities: [guided("Tunneling", "Termites can burrow through compacted soil, wood, and crumbling concrete at 3m per melee turn.")]
  }),
  monsterSource({
    name: "Intelligent Tree",
    creatureClass: "Mutated Plant",
    animalForm: "Tree",
    detailsType: "mutated-plant",
    hitDice: 10,
    hp: 55,
    movement: move(1),
    role: "ancient thinker",
    stats: buildStats({ hitDice: 10, mentalStrength: 18, intelligence: 16, dexterity: 5, charisma: 12, constitution: 16, physicalStrength: 16 }),
    biography: htmlParagraphs("An oak or redwood several centuries old, awakened by radiation to full sentience. Patient, eloquent, deeply suspicious of fire-wielders."),
    armor: armorSource({ name: "Bark", acValue: 4, description: "Half-meter thick bark." }),
    weapons: [naturalWeaponSource({ name: "Branch Slam", damage: "3d6", description: "Sweeping branch knocks and crushes." })],
    abilities: [
      guided("Mental Powers", "Intelligent trees possess 1d4 mental mutations. Common choices: Telepathy, Mental Blast, Life Leech."),
      guided("Fire Vulnerability", "Takes double damage from fire of any kind.")
    ]
  }),
  monsterSource({
    name: "Piney",
    creatureClass: "Mutated Plant",
    animalForm: "Pine",
    detailsType: "mutated-plant",
    hitDice: 3,
    hp: 16,
    movement: move(3),
    role: "ambulatory conifer",
    stats: buildStats({ hitDice: 3, mentalStrength: 8, intelligence: 5, dexterity: 8, charisma: 6, constitution: 12, physicalStrength: 12 }),
    biography: htmlParagraphs("A 2-meter conifer with prehensile roots. Travels in small groves; hostile to creatures that burn wood."),
    armor: armorSource({ name: "Needles", acValue: 7, description: "Dense needle armor; anyone striking in melee takes 1d3 damage from pricks." }),
    weapons: [naturalWeaponSource({ name: "Prehensile Root", damage: "1d6", description: "Whip-like root." })],
    abilities: [guided("Needle Defense", "Any melee attacker striking the piney takes 1d3 points of damage from its needles.")]
  }),
  monsterSource({
    name: "Manta",
    creatureClass: "Mutated Jellyfish",
    animalForm: "Manta",
    hitDice: 5,
    hp: 25,
    movement: move(18),
    role: "flying drifter",
    stats: buildStats({ hitDice: 5, mentalStrength: 12, intelligence: 4, dexterity: 15, charisma: 4, constitution: 10, physicalStrength: 8 }),
    biography: htmlParagraphs("A translucent airborne cnidarian the size of a fishing boat. Drifts on thermal currents and drapes paralyzing tendrils."),
    armor: armorSource({ name: "Membrane", acValue: 8, description: "Slick translucent membrane." }),
    weapons: [naturalWeaponSource({ name: "Stinging Tendril", damage: "1d4", effect: { mode: "paralysis", notes: "Save vs poison intensity 12 or paralysed for 1d6 melee turns." }, description: "Dozens of trailing poison tendrils." })],
    abilities: [guided("Airborne Drift", "Mantas maneuver at up to 30m per melee turn on wind and internal gas bladders. They cannot land intact.")]
  }),
  monsterSource({
    name: "Rogue Android",
    detailsType: "robot",
    creatureClass: "Android",
    animalForm: "",
    hitDice: 6,
    hp: 45,
    movement: move(12),
    role: "sabotage infiltrator",
    speech: "common, pre-war codes",
    stats: buildStats({ hitDice: 6, mentalStrength: 14, intelligence: 16, dexterity: 14, charisma: 12, constitution: 12, physicalStrength: 14 }),
    biography: htmlParagraphs("An android that has broken its pre-war programming. Some are simply damaged; others have joined The Created and actively work against humanity."),
    armor: armorSource({ name: "Synthetic Shell", acValue: 5, description: "Disguised as human skin.", protection: { poisonImmune: true, radiationImmune: true, mentalImmune: true } }),
    weapons: [
      weaponSource({ name: "Laser Pistol", damage: "5d6", attackType: "energy", short: 100, long: 200, traits: { tag: "laser" }, description: "Concealed sidearm." }),
      naturalWeaponSource({ name: "Servo Strike", damage: "1d6", description: "Hydraulic-boosted strike." })
    ],
    robotics: {
      isRobot: true,
      mode: "wild",
      chassis: "Rogue Android",
      identifier: "RA-∅",
      controller: "",
      powerSource: "nuclear",
      powerCurrent: 50,
      powerMax: 50,
      broadcastCapable: false,
      backupHours: 72,
      repairDifficulty: 12,
      malfunction: "Behavioral inhibitors lost; intent unpredictable."
    }
  })
];

export function monsterPackSources() {
  return MONSTER_PACK.map((entry) => clone(entry));
}
