/**
 * Full Gamma World 1e mutation table metadata derived from the local rules reference.
 * Summaries are intentionally concise so the system remains portable without bundling the PDF.
 */

export const MUTATION_DEFINITIONS = [
  {
    code: 1,
    name: "Absorption",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [1, 1],
      "mutated-animal": [1, 1]
    },
    summary: "Withstand additional damage for _______ up to current HP.",
    page: 11
  },
  {
    code: 2,
    name: "Anti-Reflection",
    subtype: "mental",
    category: "defect",
    ranges: {
      humanoid: [2, 2],
      "mutated-animal": [2, 2]
    },
    summary: "25% chance to reverse attack and defense when using mental power.",
    page: 11
  },
  {
    code: 3,
    name: "Complete Mental Block",
    subtype: "mental",
    category: "defect",
    ranges: {
      humanoid: [3, 6],
      "mutated-animal": [3, 4]
    },
    summary: "Unable to see or approach __________.",
    page: 11
  },
  {
    code: 4,
    name: "Cryokinesis",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [7, 7],
      "mutated-animal": [5, 5]
    },
    summary: "Within 25m, 1d6 freezing damage... +1d6/rd for 10 rounds.",
    page: 11
  },
  {
    code: 5,
    name: "Death Field Generation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [8, 8],
      "mutated-animal": [6, 6]
    },
    summary: "Drain all but one HP from all beings within 20m; unconscious for d20 turns.",
    page: 12
  },
  {
    code: 6,
    name: "De-Evolution",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [9, 10],
      "mutated-animal": [7, 9]
    },
    summary: "Once per week, within 30m, strip abilities from mutant opponent.",
    page: 12
  },
  {
    code: 7,
    name: "Density Control (Others)",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [11, 11],
      "mutated-animal": [10, 10]
    },
    summary: "Within 30m, affect others: shrink to improve AC, grow to improve speed.",
    page: 12
  },
  {
    code: 8,
    name: "Directional Sense",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [12, 12],
      "mutated-animal": [11, 13]
    },
    summary: "Always know where you are related to where you've been.",
    page: 12
  },
  {
    code: 9,
    name: "Dual Brain",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [13, 13],
      "mutated-animal": [14, 14]
    },
    summary: "Two brains; -1 to artifacts; two mental saves, but increase mental 1/2.",
    page: 12
  },
  {
    code: 10,
    name: "Empathy",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [14, 14],
      "mutated-animal": [15, 15]
    },
    summary: "Sense feelings of others; force feelings on others in 30m with DC12 MR.",
    page: 12
  },
  {
    code: 11,
    name: "Epilepsy",
    subtype: "mental",
    category: "defect",
    ranges: {
      humanoid: [15, 18],
      "mutated-animal": [16, 18]
    },
    summary: "10% chance to do nothing per melee turn during combat.",
    page: 12
  },
  {
    code: 12,
    name: "Fear Impulse",
    subtype: "mental",
    category: "defect",
    ranges: {
      humanoid: [19, 22],
      "mutated-animal": [19, 20]
    },
    summary: "Unreasonable fear of _______.",
    page: 12
  },
  {
    code: 13,
    name: "Force Field Generation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [23, 25],
      "mutated-animal": [21, 24]
    },
    summary: "Every 24 hours, create invisible force 15cm from body, takes 5d6 damage.",
    page: 12
  },
  // 0.8.6 — Genius Capability retired. Split into three standalone
  // mutations with distinct slots on the d100 table. Heightened Brain
  // Talent loses 2 slots (humanoid 5→3, mutated-animal 3→1) to make
  // room; overall Genius-flavored odds triple (1-in-100 → 3-in-100)
  // per the Phase 3 plan. Existing "Genius Capability" items on actors
  // are migrated via migrateGeniusCapability086().
  {
    code: 14,
    name: "Military Genius",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [26, 26],
      "mutated-animal": [25, 25]
    },
    summary: "Tactical prodigy: +4 to hit and +1 damage die on all attacks.",
    page: 12
  },
  {
    code: 14.1,
    name: "Economic Genius",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [27, 27],
      "mutated-animal": [26, 26]
    },
    summary: "Shrewd trader and leader: +3 charisma bonus.",
    page: 12
  },
  {
    code: 14.2,
    name: "Scientific Genius",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [28, 28],
      "mutated-animal": [27, 27]
    },
    summary: "Technical savant: +2 to technical skills and artifact analysis.",
    page: 12
  },
  {
    code: 15,
    name: "Heightened Brain Talent",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [29, 31],
      "mutated-animal": [28, 28]
    },
    summary: "Figure out artificat in 1/3 time; 2 mental saves; detect all lies.",
    page: 12
  },
  {
    code: 16,
    name: "Heightened Intelligence",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [32, 41],
      "mutated-animal": [29, 43]
    },
    summary: "+4 mental resistance (max 18), -2 to figure out artifact.",
    page: 12
  },
  {
    code: 17,
    name: "Hostility Field",
    subtype: "mental",
    category: "defect",
    ranges: {
      humanoid: [42, 45],
      "mutated-animal": [44, 44]
    },
    summary: "Any being with 16 INT or less has 20% chance to attack once within 30m.",
    page: 12
  },
  {
    code: 18,
    name: "Illusion Generation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [46, 46],
      "mutated-animal": [45, 45]
    },
    summary: "Create illusions for beings within 30 meters; dispelled by touch.",
    page: 12
  },
  {
    code: 19,
    name: "Intuition",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [47, 47],
      "mutated-animal": [46, 49]
    },
    summary: "+1 to hit, +3 damage per dice, cannot be used with other powers.",
    page: 12
  },
  {
    code: 20,
    name: "Life Leech",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [48, 52],
      "mutated-animal": [50, 52]
    },
    summary: "Leech 6 HP/turn from eachi being in 10m (+3m per 4pts of mental strength).",
    page: 12
  },
  {
    code: 21,
    name: "Light Wave Manipulation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [53, 53],
      "mutated-animal": [53, 53]
    },
    summary: "Invisible at will; negate laser or create darkness within 10 meters.",
    page: 12
  },
  {
    code: 22,
    name: "Magnetic Control",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [54, 54],
      "mutated-animal": [54, 54]
    },
    summary: "Once / 24 hours, control iron object (25rds, 100m) (MR 12 to succeed).",
    page: 12
  },
  {
    code: 23,
    name: "Mass Mind",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [55, 55],
      "mutated-animal": [55, 55]
    },
    summary: "Empathize with same type / same power... increase effectiveness.",
    page: 12
  },
  {
    code: 24,
    name: "Mental Blast",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [56, 58],
      "mutated-animal": [56, 56]
    },
    summary: "Every other turn, do 3d6 mental damage within 15 meters.",
    page: 12
  },
  {
    code: 25,
    name: "Mental Control",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [59, 59],
      "mutated-animal": [57, 57]
    },
    summary: "Take control of being within 15m, but get hurt or die with that being.",
    page: 13
  },
  {
    code: 26,
    name: "Mental Control Over Physical State",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [60, 60],
      "mutated-animal": [58, 58]
    },
    summary: "Once per week, increase physical attributes, ignore physical harm, heal 4x.",
    page: 13
  },
  {
    code: 27,
    name: "Mental Defenselessness",
    subtype: "mental",
    category: "defect",
    ranges: {
      humanoid: [61, 62],
      "mutated-animal": [59, 61]
    },
    summary: "Mental Strength is now 3.",
    page: 13
  },
  {
    code: 28,
    name: "Mental Defense Shield",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [63, 63],
      "mutated-animal": [62, 66]
    },
    summary: "Sense beings with mental powers in 30m; +4 to mental resistance (max 18).",
    page: 13
  },
  {
    code: 29,
    name: "Molecular Disruption",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [64, 64],
      "mutated-animal": [67, 67]
    },
    summary: "Every d6 days, attempt molecular disruption at great cost, see page 14.",
    page: 13
  },
  {
    code: 30,
    name: "Molecular Understanding",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [65, 66],
      "mutated-animal": [68, 68]
    },
    summary: "+1 die of damage; immediately figure out Chart A, -1 on other charts.",
    page: 13
  },
  {
    code: 31,
    name: "Multiple Damage",
    subtype: "mental",
    category: "defect",
    ranges: {
      humanoid: [67, 69],
      "mutated-animal": [69, 71]
    },
    summary: "Take double (or triple per referree) damage.",
    page: 13
  },
  {
    code: 32,
    name: "Planar Travel",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [70, 70],
      "mutated-animal": [72, 72]
    },
    summary: "Once / week, open 3m x 3m door that lasts 3 rounds to another plane.",
    page: 13
  },
  {
    code: 33,
    name: "Poor Dual Brain",
    subtype: "mental",
    category: "defect",
    ranges: {
      humanoid: [71, 73],
      "mutated-animal": [73, 75]
    },
    summary: "Second brain that causes problem at inopportune times; see referree.",
    page: 13
  },
  {
    code: 34,
    name: "Precognition",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [74, 74],
      "mutated-animal": [76, 76]
    },
    summary: "Concentrate, see 3 min into future; take shock damage if you see injury.",
    page: 13
  },
  {
    code: 35,
    name: "Pyrokinesis",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [75, 75],
      "mutated-animal": [77, 77]
    },
    summary: "1d6 fire damage... +1d6 per round of concentration.",
    page: 13
  },
  {
    code: 36,
    name: "Radar/Sonar",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [76, 76],
      "mutated-animal": [78, 78]
    },
    summary: "See day or night, +2 to hit within 30 meters.",
    page: 13
  },
  {
    code: 37,
    name: "Reflection",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [77, 77],
      "mutated-animal": [79, 79]
    },
    summary: "Every 24 hours, reflect damage; 3d damage + 1d per round of concentration.",
    page: 13
  },
  {
    code: 38,
    name: "Repulsion Field",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [78, 78],
      "mutated-animal": [80, 80]
    },
    summary: "Every 24 hours, create invisible within 15 meters, takes 5d6 damage.",
    page: 13
  },
  {
    code: 39,
    name: "Sound Imitation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [79, 79],
      "mutated-animal": [81, 81]
    },
    summary: "Reflect sonic attack (still take effects) or mimic sounds.",
    page: 13
  },
  {
    code: 40,
    name: "Telekinesis",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [80, 82],
      "mutated-animal": [82, 82]
    },
    summary: "Lift objects (same weight as normally lift) within 15m for 5 turns every 5 turns.",
    page: 13
  },
  {
    code: 41,
    name: "Telekinetic Arm",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [83, 83],
      "mutated-animal": [83, 83]
    },
    summary: "20 meter telekinetic arm with 18 STR; powered weapons damage if hit arm.",
    page: 13
  },
  {
    code: 42,
    name: "Telekinetic Flight",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [84, 84],
      "mutated-animal": [84, 84]
    },
    summary: "Fly up to 20 meters per second, carry as much as usual.",
    page: 13
  },
  {
    code: 43,
    name: "Telepathy",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [85, 85],
      "mutated-animal": [85, 85]
    },
    summary: "Read/send thoughts/emotions up to 10 meters.",
    page: 13
  },
  {
    code: 44,
    name: "Teleportation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [86, 86],
      "mutated-animal": [86, 86]
    },
    summary: "Teleport self up to 30 km... 25% chance of 10d6 damage if unfamiliar.",
    page: 13
  },
  {
    code: 45,
    name: "Thought Imitation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [87, 87],
      "mutated-animal": [87, 87]
    },
    summary: "Reflect mental attack (still take effects) or mimic thoughts to communicate.",
    page: 14
  },
  {
    code: 46,
    name: "Time Field Manipulation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [88, 88],
      "mutated-animal": [88, 88]
    },
    summary: "PERCENT CHANCE OF SUCCESS:.",
    page: 0
  },
  {
    code: 47,
    name: "Total Healing",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [89, 89],
      "mutated-animal": [89, 89]
    },
    summary: "Heall all HP once per day up to 4 times per week.",
    page: 14
  },
  {
    code: 48,
    name: "Weather Manipulation",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [90, 90],
      "mutated-animal": [90, 90]
    },
    summary: "Prevailing Conditions.",
    page: 0
  },
  {
    code: 49,
    name: "Will Force",
    subtype: "mental",
    category: "beneficial",
    ranges: {
      humanoid: [91, 95],
      "mutated-animal": [91, 95]
    },
    summary: "Double any ability score or +1 to hit for d10 turns every 24 hours.",
    page: 14
  },
  {
    code: 1,
    name: "Attraction Odor",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [1, 2],
      "mutated-animal": [1, 2]
    },
    summary: "You attract carnivores.",
    page: 9
  },
  {
    code: 2,
    name: "Body Structure Change",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [3, 4],
      "mutated-animal": [3, 3]
    },
    summary: "Reduce your resistance to some outside element.",
    page: 9
  },
  {
    code: 3,
    name: "Chameleon Powers",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [5, 5],
      "mutated-animal": [4, 6]
    },
    summary: "Change color to blend in.",
    page: 9
  },
  {
    code: 4,
    name: "Density Control",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [6, 6],
      "mutated-animal": [7, 7]
    },
    summary: "Shrink to improve AC, grow to improve speed.",
    page: 9
  },
  {
    code: 5,
    name: "Diminished Sense",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [7, 8],
      "mutated-animal": [8, 8]
    },
    summary: "One sense does not function normally.",
    page: 9
  },
  {
    code: 6,
    name: "Double Physical Pain",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [9, 10],
      "mutated-animal": [9, 9]
    },
    summary: "Sustain double damage.",
    page: 9
  },
  {
    code: 7,
    name: "Electrical Generation",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [11, 12],
      "mutated-animal": [10, 11]
    },
    summary: "Shock those you touch for 3d6.",
    page: 9
  },
  {
    code: 8,
    name: "Fat Cell Accumulation",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [13, 14],
      "mutated-animal": [12, 12]
    },
    summary: "Impaired movement and fighting ability.",
    page: 9
  },
  {
    code: 9,
    name: "Gas Generation: Musk",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [15, 16],
      "mutated-animal": [13, 13]
    },
    summary: "Expel gas up to 10 meters.",
    page: 9
  },
  {
    code: 10,
    name: "Heat Generation",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [17, 17],
      "mutated-animal": [14, 14]
    },
    summary: "Beams of heat up to 15 meters that do 4d6 every 3 turns.",
    page: 9
  },
  {
    code: 11,
    name: "Heightened Balance",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [18, 18],
      "mutated-animal": [15, 15]
    },
    summary: "Maintain balance in difficult circumstances.",
    page: 9
  },
  {
    code: 12,
    name: "Heightened Constitution",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [19, 22],
      "mutated-animal": [16, 21]
    },
    summary: "+2HP per Constitution. Under the 0.8.2 homebrew saves: +3 to poison and radiation saves, and radiation severity is capped at \"severe\" (never Catastrophic Exposure from a single exposure).",
    page: 9
  },
  {
    code: 13,
    name: "Heightened Dexterity",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [23, 23],
      "mutated-animal": [22, 22]
    },
    summary: "+4AC when unencumbered.",
    page: 9
  },
  {
    code: 14,
    name: "Heightened Hearing",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [24, 24],
      "mutated-animal": [23, 23]
    },
    summary: "Cannot be surprised.",
    page: 9
  },
  {
    code: 15,
    name: "Heightened Precision",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [25, 25],
      "mutated-animal": [24, 24]
    },
    summary: "+2 damage dice with any weapon.",
    page: 9
  },
  {
    code: 16,
    name: "Heightened Smell",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [26, 26],
      "mutated-animal": [25, 25]
    },
    summary: "Can smell, detect, and track like a bloodhound.",
    page: 9
  },
  {
    code: 17,
    name: "Heightened Strength",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [27, 32],
      "mutated-animal": [26, 29]
    },
    summary: "+3 damage dice with non-powered weapons.",
    page: 10
  },
  {
    code: 18,
    name: "Heightened Taste",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [33, 33],
      "mutated-animal": [30, 32]
    },
    summary: "Detect poison/edibility.",
    page: 10
  },
  {
    code: 19,
    name: "Heightened Touch",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [34, 34],
      "mutated-animal": [33, 33]
    },
    summary: "Better chance to figure out / use artifacts.",
    page: 10
  },
  {
    code: 20,
    name: "Heightened Vision",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [35, 35],
      "mutated-animal": [34, 34]
    },
    summary: "See clearly at 3 kilometers, see infrared and ultraviolet.",
    page: 10
  },
  {
    code: 21,
    name: "Hemophilia",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [36, 37],
      "mutated-animal": [35, 36]
    },
    summary: "Lose 2HP per round until wounds are bound.",
    page: 10
  },
  {
    code: 22,
    name: "Increased Metabolism",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [38, 39],
      "mutated-animal": [37, 37]
    },
    summary: "Eat every 5th round or lose 1STR and 2HP / turn.",
    page: 10
  },
  {
    code: 23,
    name: "Increased Speed",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [40, 42],
      "mutated-animal": [38, 39]
    },
    summary: "Move 2x, Attack 2x, accomplish mental tasks quickly.",
    page: 10
  },
  {
    code: 24,
    name: "Infravision",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [43, 43],
      "mutated-animal": [40, 41]
    },
    summary: "See heat; blinded by extreme/close heat, daylight painful.",
    page: 10
  },
  {
    code: 25,
    name: "Light Generation",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [44, 44],
      "mutated-animal": [42, 42]
    },
    summary: "Reduce viewers' AC and to-hit by 4 for d4 turns.",
    page: 10
  },
  {
    code: 26,
    name: "Multiple Body Parts",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [45, 46],
      "mutated-animal": [43, 45]
    },
    summary: "Multiply any normal body part (except the brain).",
    page: 10
  },
  {
    code: 27,
    name: "New Body Parts",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [47, 51],
      "mutated-animal": [46, 47]
    },
    summary: "Add one or more body parts.",
    page: 10
  },
  {
    code: 28,
    name: "No Resistance To Bacteria",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [52, 53],
      "mutated-animal": [48, 48]
    },
    summary: "Little to no resistance to infection or illness; -10HP/day.",
    page: 10
  },
  {
    code: 29,
    name: "No Resistance To Poison",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [54, 55],
      "mutated-animal": [49, 49]
    },
    summary: "Under the 0.8.2 homebrew saves: the character loses their Constitution modifier on every poison save — the roll is a flat 1d20 vs. poison difficulty. Successes still halve damage; failures still take full damage.",
    page: 10
  },
  {
    code: 30,
    name: "No Sensory Nerve Endings",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [56, 57],
      "mutated-animal": [50, 51]
    },
    summary: "Cannot feel pain or judge HP; +2 penalty to figure artifacts.",
    page: 10
  },
  {
    code: 31,
    name: "Oversized Body Parts",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [58, 58],
      "mutated-animal": [52, 52]
    },
    summary: "Beneficial/effective increase in size of one body part.",
    page: 10
  },
  {
    code: 32,
    name: "Partial Carapace",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [59, 59],
      "mutated-animal": [53, 56]
    },
    summary: "Base AC6, reduce damage to back and head by half.",
    page: 10
  },
  {
    code: 33,
    name: "Photosynthetic Skin",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [60, 61],
      "mutated-animal": [57, 60]
    },
    summary: "Feed on sun, heal 4x in sun, +1DMG/die from heat/cold, half speed in dark.",
    page: 10
  },
  {
    code: 34,
    name: "Physical Reflection",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [62, 62],
      "mutated-animal": [61, 61]
    },
    summary: "Reflect one type of energy away in random direction.",
    page: 10
  },
  {
    code: 35,
    name: "Poor Respiratory System",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [63, 64],
      "mutated-animal": [62, 62]
    },
    summary: "Must rest after 5 rounds of combat or faint for d6 minutes.",
    page: 10
  },
  {
    code: 36,
    name: "Quills/Spines",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [65, 65],
      "mutated-animal": [63, 63]
    },
    summary: "Quills/Spines, d4/d3 or d12 DMG, throw 3 meters, re-grow in 1 week.",
    page: 10
  },
  {
    code: 37,
    name: "Radiated Eyes",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [66, 67],
      "mutated-animal": [64, 64]
    },
    summary: "Blasts of radiation up to 10 meters that do 3d6 every 4 turns.",
    page: 10
  },
  {
    code: 38,
    name: "Regeneration",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [68, 69],
      "mutated-animal": [65, 67]
    },
    summary: "Regenerate 1HP per 5 kilograms of body weight per day.",
    page: 10
  },
  {
    code: 39,
    name: "Shapechange",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [70, 70],
      "mutated-animal": [68, 68]
    },
    summary: "In 2 melee turns, mimic animal, but without abilities.",
    page: 10
  },
  {
    code: 40,
    name: "Shorter",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [71, 74],
      "mutated-animal": [69, 71]
    },
    summary: "D%+D% centimeters tall; reduce damage, but very hard to hit.",
    page: 10
  },
  {
    code: 41,
    name: "Skin Structure Change",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [75, 76],
      "mutated-animal": [72, 72]
    },
    summary: "Skin defect causes _______.",
    page: 10
  },
  {
    code: 42,
    name: "Sonic Attack Ability",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [77, 77],
      "mutated-animal": [73, 73]
    },
    summary: "Blast all creatures within 10 meters with 3d6 sonic damage every 4 turns.",
    page: 10
  },
  {
    code: 43,
    name: "Symbiotic Attachment",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [78, 78],
      "mutated-animal": [74, 74]
    },
    summary: "After a successful attack and 3 rounds of contact, control creature.",
    page: 11
  },
  {
    code: 44,
    name: "Taller",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [79, 83],
      "mutated-animal": [75, 82]
    },
    summary: "D6+2 meters tall... +1DMG per meter over 2, -1 \"to hit\" per 2 meters over 2.",
    page: 11
  },
  {
    code: 45,
    name: "Total Carapace",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [84, 84],
      "mutated-animal": [83, 83]
    },
    summary: "Reduce damage to 1/2 and raise AC to 4 but reduce movement by 25%.",
    page: 11
  },
  {
    code: 46,
    name: "Ultravision",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [85, 85],
      "mutated-animal": [84, 86]
    },
    summary: "See UV, radiation, energy cells, mental powers, electricity, etc.",
    page: 11
  },
  {
    code: 47,
    name: "Vision Defect",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [86, 87],
      "mutated-animal": [87, 87]
    },
    summary: "-4 to hit, difficulty seeing objects more than 15m away.",
    page: 11
  },
  {
    code: 48,
    name: "Weight Decrease",
    subtype: "physical",
    category: "defect",
    ranges: {
      humanoid: [88, 89],
      "mutated-animal": [88, 88]
    },
    summary: "25% slower, 25% weaker.",
    page: 11
  },
  {
    code: 49,
    name: "Wings",
    subtype: "physical",
    category: "beneficial",
    ranges: {
      humanoid: [90, 90],
      "mutated-animal": [89, 90]
    },
    summary: "Fly 12m per turn, carry no more than 25% body weight.",
    page: 11
  },
  ...plantMutationDefinitions()
];

function plantMutationDefinitions() {
  const entries = [
    ["Adaptation",                 "beneficial", [1, 3],   "Adapt once per day to a hostile environment (heat, cold, radiation, vacuum) for up to 24 hours."],
    ["Aromatic Powers",            "beneficial", [4, 6],   "Release a scent that attracts or repels specific creatures within 15m."],
    ["Attraction Odor",            "defect",     [7, 8],   "Emit a scent that draws carnivores — attackers gain +2 to hit."],
    ["Bacterial Symbiosis",        "beneficial", [9, 11],  "Internal bacteria grant +3 to radiation and poison saves."],
    ["Barbed Leaves",              "beneficial", [12, 14], "Anyone striking in melee suffers 1d3 puncture damage per attack."],
    ["Berries (effects)",          "beneficial", [15, 17], "Bears 2d6 berries per day; fruit causes a random beneficial or mild harmful effect if ingested."],
    ["Boring Tendrils",            "beneficial", [18, 20], "Drill into soil, stone, or flesh at 1m/round; tendrils deal 1d6 damage to gripped victims."],
    ["Carnivorous Jaws",           "beneficial", [21, 23], "Hinged snapping jaws inflict 2d6 bite damage within 2m."],
    ["Color Sensitivity",          "beneficial", [24, 25], "Mimic colors of surroundings; +4 on stealth and observation rolls."],
    ["Contact Poison Sap",         "beneficial", [26, 28], "Exudes intensity 12 contact poison; anyone touching bare plant must save."],
    ["Daylight Stasis",            "defect",     [29, 30], "Becomes inert and inactive during daylight hours."],
    ["Dissolving Juices",          "beneficial", [31, 33], "Digestive fluids dissolve gripped organic matter for 2d6 damage per round."],
    ["Divisional Body Segments",   "beneficial", [34, 36], "Can detach a segment as a mobile duplicate with 1/4 HP for up to 1 hour."],
    ["Electrical Generation",      "beneficial", [37, 39], "Discharge 3d6 electrical damage within 5m once per melee turn."],
    ["Explosive Fruit",            "beneficial", [40, 42], "Fruit detonates for 2d6 damage in a 5m radius when disturbed or thrown."],
    ["Heat Generation",            "beneficial", [43, 44], "Radiates heat; 1d6 damage per round within 3m to unprotected creatures."],
    ["Increased Senses",           "beneficial", [45, 47], "Sense movement, heat, and vibration within 20m; +4 to detect intruders."],
    ["Low Fertility",              "defect",     [48, 49], "Only 10% of seeds germinate; cannot propagate normally."],
    ["Manipulation Vines",         "beneficial", [50, 52], "1d4 prehensile vines wield items and weapons as if with hands."],
    ["Mobility",                   "beneficial", [53, 55], "Move on root-legs at 6m per turn."],
    ["New Plant Parts",            "beneficial", [56, 58], "Gain an additional organ (extra jaw, vine cluster, fruit type) chosen by the referee."],
    ["New Senses",                 "beneficial", [59, 61], "Gain a new sense such as infravision, sonar, or radiation sense."],
    ["Parasitic Attachment",       "beneficial", [62, 63], "Attach to a host (1d4 damage/day); the plant gains nutrients and mobility."],
    ["Physical Reflection",        "beneficial", [64, 66], "50% chance to reflect a physical attack back on the attacker."],
    ["Poison Throwing Thorns",     "beneficial", [67, 69], "Launch 1d6 thorns up to 10m; each does 1d4 damage + intensity 10 poison save."],
    ["Poison Vines",               "beneficial", [70, 72], "Vine contact causes intensity 12 poison save plus 1d6 damage."],
    ["Radiating Plant Fiber",      "beneficial", [73, 74], "Fibers emit intensity 6 radiation in a 3m radius."],
    ["Razor-edged Leaves",         "beneficial", [75, 77], "Leaves inflict 1d6 slashing damage on contact or brushing pass."],
    ["Saw-edged Leaves",           "beneficial", [78, 80], "Leaves saw through ropes, vines, and soft material; 1d4 damage per turn of contact."],
    ["Seed Mobility",              "beneficial", [81, 82], "Seeds travel up to 50m and plant themselves autonomously."],
    ["Size Decrease",              "defect",     [83, 84], "Half normal plant size; all damage dice lowered by one step."],
    ["Size Increase",              "beneficial", [85, 86], "Double normal plant size; HP and melee damage increased by +50%."],
    ["Sonic Attack Ability",       "beneficial", [87, 88], "Emits high-pitched sonic pulse for 2d6 damage within 6m once per round."],
    ["Squeeze Vines",              "beneficial", [89, 90], "Constricting vines deal 2d6 damage per round to gripped targets."],
    ["Spore Cloud",                "beneficial", [91, 92], "Releases a cloud of reproductive or poison spores in a 4m radius."],
    ["Sucker Vines",               "beneficial", [93, 94], "Drain 1d4 HP per round from gripped victims; HP is transferred to the plant."],
    ["Tangle Vines",               "beneficial", [95, 95], "Vines entangle victims within 3m; Strength save vs 18 to break free."],
    ["Temperature Sensitivity",    "defect",     [96, 96], "Wilts at temperatures below 5°C or above 35°C; -50% movement."],
    ["Throwing Thorns",            "beneficial", [97, 97], "Launch thorns up to 10m; 1d6 damage each, up to three per round."],
    ["Winged Seeds",               "beneficial", [98, 98], "Seeds travel up to 200m on air currents; spread across wide areas."],
    ["Pick Any Mutation (Plant)",  "beneficial", [99, 100], "Select any other plant mutation from the list."]
  ];
  return entries.map(([name, category, range, summary], index) => ({
    code: 51 + index,
    name,
    subtype: "plant",
    category,
    ranges: { "mutated-plant": range },
    summary,
    page: 15
  }));
}

export const MUTATION_TABLE_SPECIALS = {
  "physical": {
    "humanoid": {
      "good": [91, 94],
      "pick": [95, 100]
    },
    "mutated-animal": {
      "good": [91, 94],
      "pick": [95, 100]
    }
  },
  "mental": {
    "humanoid": {
      "good": [96, 99],
      "pick": [100, 100]
    },
    "mutated-animal": {
      "good": [96, 99],
      "pick": [100, 100]
    }
  },
  "plant": {
    "mutated-plant": {
      "good": [],
      "pick": [99, 100]
    }
  }
};

export const MUTATIONS_BY_NAME = Object.fromEntries(
  MUTATION_DEFINITIONS.map((entry) => [entry.name, entry])
);

export const MUTATIONS_BY_SUBTYPE = {
  physical: MUTATION_DEFINITIONS.filter((entry) => entry.subtype === "physical"),
  mental:   MUTATION_DEFINITIONS.filter((entry) => entry.subtype === "mental"),
  plant:    MUTATION_DEFINITIONS.filter((entry) => entry.subtype === "plant")
};

export function entriesForSubtype(subtype) {
  return MUTATIONS_BY_SUBTYPE[subtype] ?? [];
}

export function findMutationByName(name) {
  return MUTATIONS_BY_NAME[name] ?? null;
}

