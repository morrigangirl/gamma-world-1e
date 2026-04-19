/**
 * Gamma World 1e Rulebook Reference pack generator.
 *
 * This pack provides a navigable in-world summary of the 1978 Gamma World
 * rulebook, organized by chapter. Content here is paraphrased rules
 * mechanics plus factual tables (weapon classes, armor classes, damage
 * matrices, etc.), cross-linked to the system's compendium items.
 *
 * The authoritative source remains the physical / PDF rulebook in `ref/`.
 * Each chapter page cites the rulebook page range for quick lookup.
 *
 * If the owner runs `npm run import:rulebook-prose`, the generator overlays
 * their transcribed prose from `ref/rulebook-prose/*.md` onto the paraphrased
 * stub chapters. See `scripts/import-rulebook-prose.mjs` for details.
 */

import { RULEBOOK_PROSE } from "./rulebook-prose.generated.mjs";

function p(...lines) {
  return lines.filter(Boolean).map((l) => `<p>${l}</p>`).join("");
}

function section({ name, pageRange, body }) {
  return {
    name,
    type: "text",
    text: {
      format: 1,
      content: [
        `<p class="gw-rulebook__cite"><em>Rulebook p. ${pageRange}</em></p>`,
        body
      ].filter(Boolean).join("")
    }
  };
}

function simpleTable({ caption, columns, rows }) {
  const head = columns.map((c) => `<th>${c}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  return `<table class="gw-rulebook__table"><caption>${caption}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Chapter 1 — Introduction
// ---------------------------------------------------------------------------
const CHAPTER_1 = {
  name: "1. Introduction",
  pages: [
    section({
      name: "The Setting",
      pageRange: "2-3",
      body: p(
        "Gamma World 1e is set on Earth centuries after a civilization-ending cataclysm. Players take the roles of adventurers emerging from isolated enclaves into a transformed wasteland populated by radiation-born mutants, relict pre-war survivors, and the sentient machines of a ruined technological order.",
        "The referee constructs the play area and populates it with ruined cities, wastelands, cryptic alliances, and Ancient installations. Characters scavenge for surviving technology, barter with settlements, and build legends.",
        "This pack is a navigable rules reference. The physical or PDF rulebook remains the authoritative source — each page of this pack cites the rulebook page range. Compendium items are linked inline with @UUID references so you can pivot from rule text to the matching weapon, armor, mutation, or monster."
      )
    }),
    section({
      name: "How to Use This Reference",
      pageRange: "2-5",
      body: p(
        "Each chapter below mirrors the rulebook's chapter structure. Pages inside a chapter mirror the rulebook's section breaks.",
        "Open the <strong>System Documentation</strong> pack for the combat reference sheets, hazard matrices, and automation workflows. Open <strong>Roll Tables</strong> for reaction, morale, surprise, artifact condition, mutation draws, and trade values. Open <strong>Cryptic Alliances</strong> for one-page faction briefs.",
        "House rules that deviate from RAW are called out in-place with a <em>House Rule</em> note; see the <strong>System Documentation</strong> pack's House Rules journal for the full list."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 2 — Designing Gamma World
// ---------------------------------------------------------------------------
const CHAPTER_2 = {
  name: "2. Designing Gamma World",
  pages: [
    section({
      name: "The Referee's Task",
      pageRange: "4-5",
      body: p(
        "The referee designs a region, populates it with terrain and encounters, and runs it for the players.",
        "The typical starting region is 100-400 km across, covering one or two terrain types. Use the <strong>Encounter Tables</strong> pack's terrain-specific tables for random encounters; roll on them when the party moves through a zone without an obvious keyed encounter.",
        "Keep notes on cryptic alliance presence in each region — faction activity drives the political backdrop of your campaign."
      )
    }),
    section({
      name: "Time and Scale",
      pageRange: "5-6",
      body: p(
        "Combat is tracked in <strong>melee turns</strong> of 10 seconds each. Six melee turns (one minute) make up the typical round of careful action.",
        "Exploration movement is tracked in meters per melee turn or kilometers per hour depending on pace.",
        "Route movement (long-distance travel) is tracked in days; the referee rolls for daily random encounters once per day and once per night."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 3 — Creating Characters
// ---------------------------------------------------------------------------
const CHAPTER_3 = {
  name: "3. Creating Characters",
  pages: [
    section({
      name: "Character Types",
      pageRange: "6-8",
      body: p(
        "Characters fall into one of five types:",
        "<strong>Pure Strain Human (PSH)</strong>: unmutated humans. Interact easily with Ancient technology; see the <em>PSH Reliability</em> house rule in the System Documentation pack.",
        "<strong>Humanoid</strong>: visibly-mutated humans. Roll both physical and mental mutations.",
        "<strong>Mutated Animal</strong>: sentient animals with one or more mutations. Pick a base animal (bear, dog, lizard, etc.) and roll the animal mutation tables.",
        "<strong>Mutated Plant</strong>: sentient plants. Roll on the Plant Mutation table.",
        "<strong>Robot</strong>: a pre-war robotic unit under player control. Uses the Robotic Units chassis profiles."
      )
    }),
    section({
      name: "Attributes",
      pageRange: "6-7",
      body: [
        p(
          "Roll 3d6 for each of the six attributes, in order: Mental Strength (MS), Intelligence (IN), Dexterity (DX), Charisma (CH), Constitution (CN), Physical Strength (PS).",
          "Mutated animals may adjust up to three attributes by up to 2 points each to reflect their stock.",
          "Robots use a fixed profile appropriate to their chassis; see the <strong>Robotic Units</strong> pack."
        ),
        simpleTable({
          caption: "Attribute Modifiers",
          columns: ["Score", "Modifier Effect"],
          rows: [
            ["3-4",  "-2 effective"],
            ["5-8",  "-1 effective"],
            ["9-12", "no modifier"],
            ["13-15","+1 effective"],
            ["16-17","+2 effective"],
            ["18",   "+3 effective"]
          ]
        })
      ].join("")
    }),
    section({
      name: "Hit Points",
      pageRange: "7",
      body: p(
        "Starting HP = sum of 1d6 rolls, one per point of CN (3-18 dice).",
        "PSH and humanoid characters gain additional HP when leveling up; mutated animals, plants, and robots do not level in RAW but gain attribute bonuses."
      )
    }),
    section({
      name: "Mutations",
      pageRange: "9-16",
      body: p(
        "Humanoids roll 1d4 physical mutations and 1d4 mental mutations on the humanoid tables.",
        "Mutated animals roll 1d4 physical mutations and 1d4 mental mutations on the animal tables.",
        "Mutated plants roll 1d4-1 mutations on the Plant table.",
        "A result in the Defect range is a drawback; a result in the \"Good Mutation\" reroll range re-rolls with guaranteed benefit; a result in the \"Pick Any\" range lets the player choose.",
        "Use the <strong>Roll Tables</strong> pack's Mutation Draw tables to roll mutations at the table."
      )
    }),
    section({
      name: "Cryptic Alliance",
      pageRange: "27",
      body: p(
        "At character creation, a PC may elect to belong to one of the nine cryptic alliances — or remain independent.",
        "Membership is not automatic: a faction recruits those whose type and disposition fit its agenda. Roll percentile to test acceptance: 75% for a humanoid, lower for pure mutants, lower still for those the faction considers unfit.",
        "See the <strong>Cryptic Alliances</strong> pack for faction briefs and the <code>allianceReactionModifier</code> helper for inter-faction reaction bonuses."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 4 — Mutations
// ---------------------------------------------------------------------------
const CHAPTER_4 = {
  name: "4. Mutations",
  pages: [
    section({
      name: "Physical Mutations",
      pageRange: "9-11",
      body: p(
        "Roll d100 on the humanoid or animal physical mutation table; defect rolls carry a drawback, high rolls allow rerolls or free pick.",
        "See the <strong>Mutation Index</strong> pack for the full catalogue (98 humanoid/animal entries plus 41 plant entries).",
        "Activation: passive mutations operate continuously; active mutations must be used like a weapon, consuming a limited daily or weekly use.",
        "Use the <strong>Mutations tab</strong> on the character sheet to toggle, fire, and track cooldowns."
      )
    }),
    section({
      name: "Mental Mutations",
      pageRange: "11-13",
      body: p(
        "Mental mutations interact with the Mental Attack Matrix: attacker's MS vs. defender's MS on 1d20. See the <strong>Combat Reference Sheets</strong> journal in System Documentation for the table.",
        "Mental attacks can be made alongside physical attacks in the same melee round.",
        "Mental defense is always-on; no action needed to resist a mental attack."
      )
    }),
    section({
      name: "Plant Mutations",
      pageRange: "15-16",
      body: p(
        "Plant characters and intelligent plant creatures roll on a separate 42-entry mutation table: <em>Adaptation</em>, <em>Explosive Fruit</em>, <em>Thorns</em>, <em>Electrical Generation</em>, and more.",
        "Plants are slower to act and more resilient than humanoids; they favor patience and area-denial abilities."
      )
    }),
    section({
      name: "Defects",
      pageRange: "9-13",
      body: p(
        "A defect is a permanent drawback that counts as one of the character's rolled mutations.",
        "Common defects: Attraction Odor, Hostility Field, Hemophilia, No Resistance to Disease, Mental Defenselessness.",
        "Defects cannot be re-rolled or healed — they are part of the character's body."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 5 — Play of the Game
// ---------------------------------------------------------------------------
const CHAPTER_5 = {
  name: "5. Play of the Game",
  pages: [
    section({
      name: "Combat Overview",
      pageRange: "18-21",
      body: p(
        "Combat proceeds in melee turns (10 seconds each).",
        "<strong>Initiative</strong>: this system uses 5e-style 1d20 + DX mod per combatant. RAW 1e uses side-based initiative — see the <em>House Rules</em> journal for the departure.",
        "<strong>Attacks</strong>: physical attacks use Physical Attack Matrix I (weapons) or II (natural attacks). Mental attacks use the Mental Attack Matrix.",
        "<strong>Damage</strong>: each weapon has a small-target and large-target damage roll. On hit, the attacker rolls; the referee applies HP loss manually via the <em>Apply Damage</em> chat card button."
      )
    }),
    section({
      name: "Surprise and Initiative",
      pageRange: "21",
      body: p(
        "Each side rolls 1d6 for surprise; rolls of 1-2 indicate that side is surprised and loses the first melee turn.",
        "After surprise, initiative is rolled per combatant (5e-style 1d20 + DX mod) in this system; in RAW 1e, each side rolls 1d10 and higher goes first.",
        "See the <strong>Roll Tables</strong> pack for importable Reaction / Morale / Surprise tables."
      )
    }),
    section({
      name: "Fatigue",
      pageRange: "21",
      body: [
        p(
          "Extended combat fatigues combatants. Starting as early as the 11th melee turn, weapon class drops (making hits harder to land) based on weapon weight.",
          "Wearing armor adds its own fatigue penalty starting at the 15th melee turn.",
          "See the <strong>System Documentation</strong> Hazards and Fatigue Reference journal for the full matrices; they are wired automatically into the attack flow."
        )
      ].join("")
    }),
    section({
      name: "Morale",
      pageRange: "21",
      body: p(
        "When casualties mount or the tactical situation turns, the referee calls a morale check.",
        "Roll 1d10: non-intelligent creatures need 5+ to hold; intelligent creatures need 3+.",
        "Once failed, the creature flees combat; the check repeats each melee turn until conditions change.",
        "Use the Morale (1d10) roll table in the <strong>Roll Tables</strong> pack."
      )
    }),
    section({
      name: "Encounters",
      pageRange: "22",
      body: p(
        "Roll the terrain-specific 1d20 encounter table (see the <strong>Encounter Tables</strong> pack) when the party enters a new zone or after a significant rest.",
        "On an encounter, roll 2d6 on the Reaction table (modified by the party's apparent Charisma and the group type). See the <strong>Roll Tables</strong> pack's Reaction table for canonical bands."
      )
    }),
    section({
      name: "Saving Throws: Radiation and Poison",
      pageRange: "28 (homebrew)",
      body: p(
        "<strong>This system replaces the RAW 1e poison and radiation matrices with a save-vs-intensity homebrew.</strong> See Chapter 11, \"Homebrew &amp; Departures\", for the mechanical details of both saves, including the radiation fail-margin bands and the new Radiation Sickness and Catastrophic Exposure conditions.",
        "Short form: roll <strong>1d20 + Constitution modifier</strong> and compare to the hazard's intensity (poison difficulty or radiation intensity). Poison deals damage on either outcome — half on a success, full on a failure — and no longer kills outright on a single bad roll.",
        "The RAW matrices are preserved as reference material in the <strong>System Documentation</strong> pack's Poison Matrix and Radiation Matrix journals, but the live save pipeline no longer consults them."
      )
    }),
    section({
      name: "Healing",
      pageRange: "28",
      body: p(
        "Natural healing: 1 HP per full day of rest.",
        "Medical devices (see the <strong>Armory and Gear</strong> pack's Medical subtype): pain reducer, stim dose, anti-radiation serum, cur-in dose, accelera dose, rejuv chamber, life ray, medi-kit.",
        "Use the <em>Rest</em> button on the character sheet to apply daily healing."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 6 — Artifacts and Equipment
// ---------------------------------------------------------------------------
const CHAPTER_6 = {
  name: "6. Artifacts and Equipment",
  pages: [
    section({
      name: "Artifact Discovery",
      pageRange: "29-30",
      body: p(
        "Roll on the Artifact Category (d100) table to determine the kind of Ancient artifact found. Then roll the Artifact Condition (2d6) table for its functional state.",
        "Condition sets the base function chance: Broken (0%), Poor (30%), Fair (50%), Good (70%), Excellent (85%), Perfect (95%).",
        "Both tables are importable from the <strong>Roll Tables</strong> pack."
      )
    }),
    section({
      name: "Artifact Analysis Flowchart",
      pageRange: "29-30",
      body: p(
        "Unknown artifacts follow the Chart A / B / C flowchart. Operators roll on the chart; results advance, loop, return, or complete the analysis.",
        "The system ships a live flowchart app: open an unknown artifact's item sheet and click <em>Analyze</em> to start a shared session.",
        "Intelligence, Heightened Intelligence, Dual Brain, Scientific Genius, and related mutations modify the roll; Heightened Brain Talent triples the analysis rate; Molecular Understanding auto-solves Chart A."
      )
    }),
    section({
      name: "Power and Charges",
      pageRange: "29",
      body: p(
        "Ancient devices draw power from installed cells (chemical, solar, hydrogen, nuclear) or ambient sources (line power, broadcast power).",
        "<strong>Broadcast power</strong> is not a portable item — it is a feature of surviving Ancient infrastructure. Its availability is set by the referee.",
        "Charged devices consume a power step whenever they fire successfully."
      )
    }),
    section({
      name: "Weapons (Overview)",
      pageRange: "20, 30-34",
      body: p(
        "Weapons span 16 classes on the Weapon Class Table, from simple clubs and spears (Class 1) to Fusion Rifle and micro-missile (Class 16).",
        "Primitive weapons (Classes 1-9) rely on muscle and mechanical advantage. Modern weapons (Classes 10-14) use slug-throwers, needlers, stun rays, and lasers. Classes 15-16 are high-tech Ancient weapons.",
        "See the <strong>Armory and Gear</strong> pack's Weapon folders for the full catalogue."
      )
    }),
    section({
      name: "Ammunition",
      pageRange: "20, 30-34",
      body: p(
        "Ranged weapons require matching ammunition. Each ammo type is a stackable gear item (Arrows, Crossbow Bolts, Sling Stones, Sling Bullets, Slug-Thrower Rounds, Needler Darts, Stun Rifle Cells, Javelins, Gyrojet Slugs).",
        "A ranged weapon's <em>Ammo Type</em> field is matched against the actor's ammo gear on fire; the corresponding gear item decrements by one. If no matching ammo is present, the attack is refused."
      )
    }),
    section({
      name: "Armor and Shields",
      pageRange: "19",
      body: [
        p(
          "Armor class is descending: AC 10 is no protection, AC 1-2 is powered/energized armor.",
          "Some Ancient armors grant immunities — black-ray, laser, radiation, poison, mental attacks. See the <strong>Armory and Gear</strong> pack for the full list."
        ),
        simpleTable({
          caption: "Armor Class Reference",
          columns: ["Class", "Description"],
          rows: [
            ["10", "No protection"],
            ["9",  "Shield only"],
            ["8",  "Furs or skins"],
            ["7",  "Furs or skins + shield"],
            ["6",  "Cured hide / plant-fiber armor, partial carapace"],
            ["5",  "Cured hide or plant-fiber + shield"],
            ["4",  "Sheath, riot-control, total carapace"],
            ["3",  "Powered plate and plastic armors"],
            ["2",  "Powered alloy, energized, inertia, powered scout/battle armor"],
            ["1",  "Powered attack and assault armor"]
          ]
        })
      ].join("")
    }),
    section({
      name: "Containers and Encumbrance",
      pageRange: "36-37",
      body: p(
        "Carry capacity in this system is PS × 10 kilograms, plus the capacity of any equipped container (belt pouch, satchel, backpack, ruck sack, saddlebag, large backpack, cargo hamper).",
        "Strict encumbrance: at over-cap, DX AC bonus zeros, movement halves, and attacks take -1. At 2× cap, the character cannot move, attack, or activate mutations.",
        "See the Encumbrance summary card on the Bio tab."
      )
    }),
    section({
      name: "Explosives, Bombs, and Missiles",
      pageRange: "31-33",
      body: p(
        "Grenades, bombs, and missiles are thrown or launched area attacks. See the <strong>Armory and Gear</strong> pack's Explosive folder.",
        "Gas clouds (tear, poison, stun) create ongoing area effects; the system ticks these every melee round as long as the combat is active."
      )
    }),
    section({
      name: "Medical Devices",
      pageRange: "34-35",
      body: p(
        "Use the <em>Use</em> action on any medical item to apply its effect via the healing module.",
        "Canonical items: Pain Reducer, Stim Dose, Accelera Dose, Anti-Radiation Serum, Cur-in Dose, Intera Shot, Sustenance Dose, Rejuv Chamber, Stasis Chamber, Life Ray, Medi-kit.",
        "See the <strong>Armory and Gear</strong> pack's Medical folder."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 7 — Standard Devices and Materials
// ---------------------------------------------------------------------------
const CHAPTER_7 = {
  name: "7. Standard Devices and Materials",
  pages: [
    section({
      name: "Common Gear",
      pageRange: "35-37",
      body: p(
        "The Armory and Gear pack's Tools, Rations, Communications, and Survival folders cover the expedition staples: rope, flint & steel, torches, canteens, tents, bedrolls, hand radios, signal flares.",
        "Use a container (backpack, satchel) to carry multiple items without tripping encumbrance."
      )
    }),
    section({
      name: "Power Cells",
      pageRange: "35",
      body: [
        p(
          "Four cell types power most Ancient devices:"
        ),
        simpleTable({
          caption: "Power Cell Types",
          columns: ["Cell", "Typical Capacity", "Notes"],
          rows: [
            ["Chemical", "~10 device-hours", "Short lifespan but plentiful."],
            ["Solar",    "~50 device-hours", "Recharges in sunlight."],
            ["Hydrogen", "~200 device-hours", "Mid-tier capacity; safer than nuclear."],
            ["Nuclear",  "~500+ device-hours", "Long-lived but rare and regulated."]
          ]
        })
      ].join("")
    }),
    section({
      name: "Trade Values",
      pageRange: "37",
      body: p(
        "The wasteland economy runs on barter and on pre-war coinage (domars). See the <strong>Roll Tables</strong> pack's Trade Value / Barter table for representative values.",
        "Archivists and Seekers pay premium rates for books, intact pre-war devices, and functioning artifacts."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 8 — Robotic Units
// ---------------------------------------------------------------------------
const CHAPTER_8 = {
  name: "8. Robotic Units",
  pages: [
    section({
      name: "Design",
      pageRange: "38-40",
      body: p(
        "A robotic unit is defined by chassis, power source, sensors, control circuit, armor class, hit points, and armament.",
        "See the <strong>Robotic Units</strong> pack for the 18 canonical chassis profiles: cargo lifters, ecology bots, engineering bots, medical / security robotoids, household robots, supervisor / defense / attack borgs, warbots, death machines, and think tanks."
      )
    }),
    section({
      name: "Control Modes",
      pageRange: "38-40",
      body: p(
        "Robots operate in one of four modes: <em>inactive</em> (powered down), <em>programmed</em> (following pre-war routines), <em>wild</em> (instructions lost; behavior random), <em>controlled</em> (slaved to a current operator).",
        "A Control Baton can temporarily place a robot into <em>controlled</em> mode if the operator succeeds on an Intelligence check. This allows issuing commands and temporary cooperation."
      )
    }),
    section({
      name: "Immunities and Damage",
      pageRange: "38-40",
      body: p(
        "Robots are immune to radiation, poison, and (usually) mental attacks. Mechanical damage is full; electrical damage scales by chassis.",
        "A robot at less than half HP suffers impairments: reduced accuracy, movement, or power draw. Use the <em>Robotics</em> panel on the character sheet to track."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 9 — Experience
// ---------------------------------------------------------------------------
const CHAPTER_9 = {
  name: "9. Experience",
  pages: [
    section({
      name: "XP Awards",
      pageRange: "41-42",
      body: p(
        "Award XP for defeated foes (a common shorthand is the foe's HP total), identified artifacts (their listed XP value), and referee-discretionary awards for clever play, mission completion, and roleplaying.",
        "Use the <em>Award XP</em> button on the character sheet to grant XP via a GM-only dialog."
      )
    }),
    section({
      name: "Advancement",
      pageRange: "41-42",
      body: [
        p(
          "Pure Strain Humans and humanoids level up as they accumulate XP. Mutated animals, plants, and robots do not level, but they gain attribute bonuses whenever they would have hit a new level threshold."
        ),
        simpleTable({
          caption: "Level Thresholds (PSH and Humanoid)",
          columns: ["Level", "XP Required"],
          rows: [
            ["1", "0"],
            ["2", "3,000"],
            ["3", "6,000"],
            ["4", "12,000"],
            ["5", "24,000"],
            ["6", "48,000"],
            ["7", "96,000"],
            ["8", "200,000"],
            ["9", "400,000"],
            ["10", "1,000,000"]
          ]
        })
      ].join("")
    }),
    section({
      name: "Attribute Bonus (d10)",
      pageRange: "42",
      body: p(
        "At every level-up (or equivalent milestone for non-leveling types), roll 1d10 on the Attribute Bonus table; that attribute gains +1 up to a natural cap of 21.",
        "See the <strong>Roll Tables</strong> pack's <em>Experience Attribute Bonus (d10)</em> table for the roll mapping."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 10 — Example of Play
// ---------------------------------------------------------------------------
const CHAPTER_10 = {
  name: "10. Example of Play",
  pages: [
    section({
      name: "Running a Session",
      pageRange: "43-45",
      body: p(
        "Start with a keyed situation (encounter, discovery, mission). Let the players choose an approach. Roll surprise and reaction as appropriate.",
        "During combat, use the <em>Attack</em> actions on the character sheet. On hit, click <em>Roll Damage</em>. The referee applies damage via the <em>Apply Damage</em> button on the damage card.",
        "Use the GM <em>Request Roll</em> toolbar button in chat to ask specific players (or all players) for a saving throw or attribute check."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Chapter 11 — Homebrew Notes
// ---------------------------------------------------------------------------
const CHAPTER_11 = {
  name: "11. Homebrew & Departures",
  pages: [
    section({
      name: "PSH Technology Reliability",
      pageRange: "—",
      body: p(
        "<strong>House rule.</strong> Once a Pure Strain Human has figured out an Ancient artifact (operation known), further uses by that PSH actor bypass the condition and malfunction rolls. The artifact simply works.",
        "Toggle via the world setting <em>PSH technology always works once figured out</em>. Non-PSH actors and unanalyzed artifacts follow RAW."
      )
    }),
    section({
      name: "Initiative (5e-Style)",
      pageRange: "—",
      body: p(
        "This system uses 5e-style individual initiative (1d20 + DX mod per combatant) instead of 1e's side-based procedure, so the Foundry combat tracker behaves consistently.",
        "For RAW 1e initiative, roll it manually and set each combatant's value in the tracker."
      )
    }),
    section({
      name: "Containers & Strict Encumbrance",
      pageRange: "—",
      body: p(
        "Containers (backpacks, pouches, satchels) are not strictly RAW — they are added for usable inventory management.",
        "Strict encumbrance: carried weight over cap halves movement and zeroes DX AC bonus; over 2× cap disables movement, attacks, and mutations."
      )
    }),
    section({
      name: "Radiation Homebrew",
      pageRange: "—",
      body: p(
        "<strong>House rule.</strong> RAW radiation uses a Constitution × Intensity matrix whose \"D\" cells kill the victim outright and whose \"M\" cells force an immediate new mutation. In ongoing play this is a character grinder — the rules below replace the matrix with a save-vs-intensity roll and four graded outcomes.",
        "<strong>Baseline resistance.</strong> Radiation zones of intensity <strong>less than 10</strong> have no mechanical effect. No save is required and no damage accumulates. The Foundry system short-circuits these exposures to \"Below threshold — no effect\" on the save card.",
        "<strong>The save.</strong> At intensity 10 or higher, roll <code>1d20 + CN modifier</code> and compare to the radiation intensity. CN modifier uses the same 6–15 neutral band the rest of the system uses (PS 8 = +0, PS 18 = +3, PS 4 = −2).",
        "<strong>Outcome bands.</strong>",
        "<strong>Pass (total ≥ intensity)</strong> — No immediate effect. Recheck after one hour if still exposed.",
        "<strong>Miss by 1–3 — Radiation Sickness (Mild)</strong>. The character is immediately treated as <em>fully fatigued</em> (every weapon / armor fatigue penalty applies at maximum) for <strong>1d3 days</strong>.",
        "<strong>Miss by 4–6 — Radiation Sickness (Severe)</strong>. Fully fatigued for <strong>1d4+2 days</strong>, and a random new mutation manifests immediately (the existing \"M\" outcome). The mutation grant fires automatically on the chat card.",
        "<strong>Miss by 7 or more — Catastrophic Exposure</strong>. The character appears fine for now. <strong>Beginning the next day</strong>, the body deteriorates at <strong>−10% of maximum HP per hour</strong>. The only thing that halts the spiral is Ancient radiation treatment (rejuv chamber, anti-radiation serum, GM-fiat equivalent); without it, the character dies.",
        "<strong>Mutation alternate effects.</strong>",
        "<strong>Heightened Constitution</strong> now grants <strong>+3</strong> to radiation saves <em>and</em> caps radiation severity at \"severe\" — a Heightened Constitution character cannot take Catastrophic Exposure from a single roll.",
        "<strong>Bacterial Symbiosis</strong> (plant mutation) grants <strong>+3</strong> to both radiation and poison saves.",
        "<strong>Automation.</strong> The character sheet's fatigue klaxon overlays a ☢ mark and flips to the appropriate sickness or catastrophic state. The world-time hook auto-expires sickness when its duration elapses and auto-drips catastrophic HP loss every in-game hour. The <code>game.gammaWorld.clearCatastrophicRadiation(actor)</code> macro cancels the catastrophic spiral when the party finds an ancient treatment device."
      )
    }),
    section({
      name: "Poison Homebrew",
      pageRange: "—",
      body: p(
        "<strong>House rule.</strong> RAW poison kills on a bad matrix row (the \"D\" cell); in practice, that turns every contact-poison encounter into a one-hit save-or-die. This system replaces the matrix with a damage roll modulated by a Constitution save.",
        "<strong>The save.</strong> Roll <code>1d20 + CN modifier</code> vs. the poison's difficulty (the intensity number the poison source provides).",
        "<strong>Outcome.</strong> Damage is <strong>N d6</strong> where N is pulled from the intensity band: intensity ≤ 6 = 1d6, 7–11 = 2d6, 12–15 = 3d6, 16+ = 4d6. On a <strong>success</strong> the victim takes <strong>half</strong> of the rolled damage (rounded down). On a <strong>failure</strong> the victim takes <strong>full</strong> damage. There is no \"save or die\" cell.",
        "<strong>Mutation alternate effects.</strong>",
        "<strong>Heightened Constitution</strong> grants <strong>+3</strong> to poison saves.",
        "<strong>Bacterial Symbiosis</strong> grants <strong>+3</strong> to poison saves (in addition to radiation).",
        "<strong>No Resistance to Poison</strong> (defect) removes the character's CN modifier entirely on poison saves — the roll is a flat <code>1d20</code> vs. difficulty.",
        "<strong>Robots &amp; chassis immunity.</strong> Robot chassis still auto-succeed (no damage). Armor and chassis poison-immunity traits short-circuit the roll entirely."
      )
    }),
    section({
      name: "Skills & Proficiencies",
      pageRange: "—",
      body: p(
        "<strong>House rule.</strong> Every PC gets a 25-skill sheet split across six groups (Field, Tech, Combat, Lore, Social, Medical). Each skill is tied to an ability (PS, DX, CN, IN, CH, or MS); the ability can be remapped per-character on the Skills tab if a mutation or unusual build justifies it.",
        "Players may mark up to <strong>three</strong> skills as <em>proficient</em>. The skill roll is <code>1d20 + ability modifier</code>, and proficient rolls add a flat <strong>+2</strong> on top. There is no scaling by level, no expertise, and no advantage/disadvantage — the cap stays at three forever.",
        "Ability modifiers use the same 6–15 neutral band as DX-to-hit, PS-damage, and PS-melee-to-hit. A PS 8 character gets +0 on Climbing/Traversal; a PS 18 character gets +3; a PS 4 character gets −2.",
        "The Skills tab on the character sheet lists every skill as a compact row: name · ability (selectable) · total modifier · proficient toggle · Roll button. The header shows <code>N/3</code> so the proficient cap is always visible. Ticking a fourth proficient skill is blocked with a warning.",
        "Skill checks exist as a narrative resolution tool. They do not route through the combat pipeline, do not trigger saves, and do not fire Phase 2b hooks. The result is the total on the chat card and nothing else — the GM decides what happens next.",
        "<em>Design goal: \"you are slightly better at not dying stupidly.\"</em>"
      )
    }),
    section({
      name: "Field Skills",
      pageRange: "—",
      body: p(
        "<strong>Survival (CN)</strong> — living off hostile terrain: finding food and water, reading weather, building shelter, enduring exposure.",
        "<strong>Tracking (IN)</strong> — following trails, identifying creatures from spoor, and knowing when a trail's gone cold.",
        "<strong>Navigation (IN)</strong> — finding a destination in the wastes without landmarks. Overland pathfinding and starmap reading.",
        "<strong>Stealth (DX)</strong> — moving unseen and unheard in hostile territory. Also pickpocketing and hand-tricks.",
        "<strong>Climbing / Traversal (PS)</strong> — ropes, chimneys, sheer walls, ruined stairwells, swimming in rough water, squeezing through tight passages."
      )
    }),
    section({
      name: "Tech Skills",
      pageRange: "—",
      body: p(
        "<strong>Ancient Tech (IN)</strong> — identifying, activating, or safely handling unfamiliar pre-Fall gadgets. Paired with the artifact-session roll when an artifact's operation is still unknown.",
        "<strong>Computers (IN)</strong> — coaxing answers from pre-Fall terminals, data cores, and holo-archives.",
        "<strong>Jury-Rigging (IN)</strong> — stitching together emergency repairs from salvage. Getting one more use out of a broken device, or bolting two half-working ones into something useful.",
        "<strong>Salvage (IN)</strong> — knowing what's valuable in a rubble pile, which components are worth pulling, and how to extract them without triggering a failsafe.",
        "<strong>Robotics (IN)</strong> — diagnosing, commanding, and working around robotic units. Also recognizing robot types before they recognize you."
      )
    }),
    section({
      name: "Combat Skills",
      pageRange: "—",
      body: p(
        "<strong>Ballistics (DX)</strong> — threading difficult ranged shots: curves, bank shots, leading a moving target, called shots. Does not replace the attack roll; it informs narrative situations around it.",
        "<strong>Melee Technique (PS)</strong> — non-damage melee moves: disarms, trips, shoves, grapples, and fighting defensively to reach a wounded ally.",
        "<strong>Tactics (IN)</strong> — reading enemy formations, spotting ambush terrain, improvising a plan under pressure.",
        "<strong>Threat Assessment (MS)</strong> — sizing up a hostile encounter before swords come out. Guessing hit dice, cryptic alliances, mutational warning signs."
      )
    }),
    section({
      name: "Lore Skills",
      pageRange: "—",
      body: p(
        "<strong>Abnormal Biology (IN)</strong> — recognizing mutant creatures by their anatomy, guessing what a new mutation might do, and knowing where to cut on a creature nobody's cataloged.",
        "<strong>Radiation Lore (IN)</strong> — identifying radiation sources, reading hot zones from context, and knowing the long-term effects of various intensities.",
        "<strong>Toxicology (IN)</strong> — identifying poisons, antidotes, contact hazards, and the intensity of a gas cloud from its color and smell.",
        "<strong>Pre-Fall Lore (IN)</strong> — history, geography, and culture of the Ancient civilization; interpreting ruins, dates, and names.",
        "<strong>Faction Lore (IN)</strong> — cryptic alliances, their ranks and watchwords, their grudges, their public faces and private aims."
      )
    }),
    section({
      name: "Social Skills",
      pageRange: "—",
      body: p(
        "<strong>Barter (CH)</strong> — haggling, appraising, and not getting ripped off in a domar-economy where nobody agrees what a gun is worth.",
        "<strong>Intimidation (CH)</strong> — threats, displays of force, posture. Works on scared creatures, cracks on brave ones, angers alliances.",
        "<strong>Diplomacy (CH)</strong> — finding common ground with strangers, defusing tension, making requests that don't end in violence.",
        "<strong>Deception (CH)</strong> — lying convincingly, bluffing, disguising intent or identity."
      )
    }),
    section({
      name: "Medical Skills",
      pageRange: "—",
      body: p(
        "<strong>Field Medicine (IN)</strong> — first aid, bleeding control, setting breaks, stabilizing at 0 HP. Works with or without an Ancient medi-kit; the skill determines how effective the care is.",
        "<strong>Biotech Handling (IN)</strong> — safely operating anti-radiation serum, cur-in doses, stim doses, rejuv chambers, and unknown biotech. Reduces the chance of a bad interaction when the patient's biology is novel."
      )
    })
  ]
};

// ---------------------------------------------------------------------------
// Generator export
// ---------------------------------------------------------------------------

/**
 * Merge user-provided prose onto a stub chapter. If the chapter exists in the
 * RULEBOOK_PROSE overlay, its sections are appended as additional pages after
 * the stub pages (so the factual tables stay, and the owner's transcription
 * sits alongside them).
 */
function mergeChapter(stub) {
  const overlay = RULEBOOK_PROSE?.[stub.name];
  if (!overlay?.length) return stub;
  const prosePages = overlay.map((section) => ({
    name: section.name,
    type: "text",
    text: {
      format: 1,
      content: section.body
    }
  }));
  return {
    name: stub.name,
    pages: [...stub.pages, ...prosePages]
  };
}

export function rulebookPackSources() {
  return [
    CHAPTER_1,
    CHAPTER_2,
    CHAPTER_3,
    CHAPTER_4,
    CHAPTER_5,
    CHAPTER_6,
    CHAPTER_7,
    CHAPTER_8,
    CHAPTER_9,
    CHAPTER_10,
    CHAPTER_11
  ].map(mergeChapter);
}
