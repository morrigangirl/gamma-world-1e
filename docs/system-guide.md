# Gamma World 1st Edition — Foundry VTT System Guide

> **System version:** 0.14.9
> **Foundry compatibility:** v13 (verified)
> **Scope:** every mechanic the system automates, every setting that controls it, and every hook macro/module authors can subscribe to.

This guide pairs with the rulebook prose shipped in the **Rulebook Reference** compendium. The rulebook is the authority on RAW; this document explains how the *automation* implements those rules and where the GM still drives the flow manually.

---

## 1. Overview

Gamma World 1e on Foundry is a **rules-aware** system: it doesn't just give you sheets, it actively rolls attacks, drains cells, ticks fatigue, applies status conditions, advances world time on rest, distributes XP at encounter close, and prompts saves on hit. The design rule is **"automate the bookkeeping, leave the storytelling alone"** — every automated step has a setting to disable if your table prefers manual control.

### What makes Gamma World 1e mechanically distinct (and how the system handles it)

| GW1e mechanic | Implementation |
|---|---|
| **Combat matrix** (not THAC0) | `module/tables/combat-matrix.mjs` — descending AC, weapon class 1–16, fatigue-adjusted lookup |
| **Hit dice + cn × d6 HP** | Schema field `system.resources.hp.formula = "@attributes.cn.value d6"` rolled at chargen |
| **Mutation rolls + variants** | Auto-rolled at item-create time via `preCreateItem` hook |
| **Artifact identification flowcharts** | Multi-step session UI in `module/artifact-session.mjs` (Chart A / B / C difficulties) |
| **Power cells** | Per-cell percentage charge, parallel drain, host-armor cell sharing for built-in weapons |
| **Cryptic alliance reactions** | `allianceReactionModifier(actor, target)` modifies reaction rolls |
| **Mental combat** | `mentalAttackTarget` matrix lookup separate from physical |

---

## 2. The character sheet at a glance

### Header (always visible regardless of tab)

- **HP / AC / MR / RR / PR** — derived live from attributes + mutations + equipment.
- **Resource summary actions row**:
  - `Short Rest` — opens an HD-spend dialog (see §10).
  - `Long Rest` — restores all HP unless poisoned/radiation-sick (see §10).
  - `Travel` — overland-hex travel session (see §11).
  - `Award XP` (GM only).
  - `Apply Bonus` (visible only when level-up granted a pending stat bonus).
- **Active Now panel** — collapses when nothing is live; shows toggled-on mutations, cooldowns, timed effects, and powered items currently draining or in critical state. (See §6 Mutations and §5 Power.)

### Tabs

| Tab | Contents |
|---|---|
| **Main** | Attributes, derived stats, status conditions, action group buttons (Attack / Defense / Utility / Movement / Buff / Heal). |
| **Mutations** | Per-subtype list (Physical / Mental / Defects); each row carries a colored status pill (Active / Cooldown / Spent / Ready / Available / Passive) + activation button. |
| **Skills** | Proficient skills (max 3 marked); each row computes its live d20 modifier from the chosen ability + proficiency bonus. |
| **Inventory** | Weapons, armor, gear. Each row may display a **power pill** (Healthy / Low / Empty / No cell) and an `Inert` plain badge for armor. |
| **Effects** | Standard Foundry ActiveEffect list (transferred from items + actor-direct). |
| **Bio** | Free-form biography, alliance, reputation. |

---

## 3. Combat — attack rolls, damage, range, fatigue

### Attack roll formula

```
d20 + dxToHit + psToHit + closeRangeBonus + rangePenalty
   vs
weaponAttackTarget(effectiveWeaponClass, target.armorClass)
```

| Component | Source |
|---|---|
| `dxToHit` | DX-derived: `+1 / DX above 15`, `−1 / DX below 6`, else `0`. ActiveEffects targeting `gw.toHitBonus` modify it. |
| `psToHit` | PS-derived (same formula); applied **only** for `attackType ∈ {melee, thrown}`. Ranged/energy don't get PS. |
| `closeRangeBonus` | `gw.closeRangeToHitBonus`, only when target distance ≤ 30 m. Heightened Precision mutation grants +2. |
| `rangePenalty` | `module/range.mjs:determineRangeBand` — short/unlimited 0, medium −2, long −5, out-of-range −999 (aborts). |
| `effectiveWeaponClass` | `weapon.weaponClass + combinedFatigueFactor(...)` clamped to 1+. |
| `targetNumber` | `PHYSICAL_ATTACK_MATRIX_I[ac][wc]` lookup. |

**d20 = 20** → automatic hit (crit). **d20 = 1** → automatic miss (fumble).

### Damage card

After a hit, a **damage card** posts to chat with one row per target. Each row has a multiplier picker:

| Pill | Meaning |
|---|---|
| × | Skip (dismiss row) |
| ×0 | Immune |
| ×¼ | Quarter (rare; partial cover, shield-deflect chains) |
| ×½ | Resistant |
| ×1 | Default |
| ×2 | Vulnerable |

**0.14.8 — auto-pick**: the system reads `target.gw.damage{Resistance,Immunity,Vulnerability}` against the weapon's damage type and pre-selects the right pill. The Apply button's `data-multiplier` matches. Disable via the **Auto-pick damage multiplier** setting.

### Ammunition

Per-unit gear stacks — fire decrements `system.quantity` by 1; auto-destroys at 0 unless `system.ammo.autoDestroy` is false. Multi-stack pickers (Needler poison / paralysis, Sling stones / bullets) prompt at fire-time and remember the last choice via `flags.gamma-world-1e.lastAmmoId`.

Energy weapons (`consumption.unit === "shot"` with installed cells) drain the cell instead — the ammo path is skipped to avoid double-charging.

### Cell drain on attack

Energy weapons (Laser Pistol, Mark V/VII Blaster, Black Ray Gun, Fusion Rifle, Stun Rifle, Stun Ray Pistol, Needler, Slug Thrower) drain the installed cell by `consumption.perUnit %` per shot. Multi-cell weapons (Mark VII = 2 hydrogen cells) drain in parallel — both cells lose perUnit % each shot. When all cells are at 0%, the gate refuses subsequent shots; the attack button greys out.

### Combat round side-effects

Each new combat round (`updateCombat` hook):
- `tickCombatMutationState` decrements `cooldown.current` and `activation.remaining` per mutation.
- `tickCombatActorState` increments `combat.fatigue.round` per combatant (controlled by `autoTickFatigue`).
- `tickCombatPowerDrain` debits cells on actively-drained items (ignited Vibro Dagger drains its hydrogen cell each minute = each round at default `MINUTES_PER_ROUND = 1`).
- **0.14.15 / 0.14.16** — per-mutation ticks: Hemophilia bleed, Increased Metabolism warning, Poor Respiratory faint, Epilepsy paralysis chance.
- **0.14.17** — `postCombatRoundSummary` whispers a GM-only chat card with initiative order, current HP (bloodied/defeated tagged), and fatigue level for each combatant (controlled by `combatRoundSummary`).

When a combat is deleted, fatigue resets (controlled by `resetFatigueOnCombatEnd`) **and** the encounter-close XP/loot summary card posts (controlled by `encounterCloseSummary`, see §12).

### Combat-UX automation (0.14.17)

| Feature | Setting | Effect |
|---|---|---|
| Bloodied auto-status | `bloodiedThreshold` (default 0.5) | When HP / max HP drops to or below the threshold, the Foundry-core "bloodied" status auto-applies on the actor; clears when HP rises above. Dead actors are never bloodied (the dead-status auto-toggle from 0.14.13 handles that side). |
| Incapacitated action gate | (always on) | When the actor carries any of `unconscious / paralyzed / sleeping / stunned` statuses, every quick-action button (Attack, Use Mutation, Roll Save, Roll Skill) gets HTML `disabled` + a tooltip explaining why. Defensive guards in the dice / mutation flow still catch macro / API callers. |
| Auto-roll initiative | `autoRollNewCombatantInitiative` (default on) | A combatant added to a started combat without a rolled initiative gets one automatically (GM-side). |
| Round summary card | `combatRoundSummary` (default on) | Per-round GM whisper with initiative + HP + fatigue for every combatant. |
| Token fatigue overlay | `tokenFatigueOverlay` (default on) | Renders a small "F-N" badge in the top-right of any token whose actor has `fatigue.round > 0`. Updates on round tick + status changes. |

---

## 4. Status pills and the Active Now panel

The sheet header carries an **"Active Now"** panel (visible when at least one section is non-empty) with up to four groups:

| Group | Shows |
|---|---|
| **Mutations** | Toggled-on mutations; `Active (3 rd)` countdown when `activation.remaining > 0`, plain `Active` for indefinite toggles, with a one-click ⏻ off button for toggleables. |
| **Recharging** | Mutations with `cooldown.current > 0`; orange pill with rounds remaining. |
| **Effects** | Non-disabled Active Effects with a finite timer (status conditions, hazard clouds, equipment buffs). Compact unit labels: `3 rd` / `5 min` / `2 hr` / `2 days`. |
| **Powered items** | Equipped cell-driven items either currently draining (`isItemActiveForDrain`) or in critical state (no cell / empty). |

---

## 5. Power — cells, drain, sharing

### Cell types

`config.mjs` defines: `chemical`, `solar`, `hydrogen`, `nuclear`, `atomic`, `antimatter`, `crystalline`, `broadcast`. Each has a corresponding gear item (e.g. `Hydrogen Energy Cell`) with `subtype: "power-cell"` and `system.artifact.charges.current/max` storing **integer percent** (0–100).

### Cell-driven items

Any item (weapon / armor / gear) with `system.consumption.perUnit > 0` is **cell-driven**: its power lives in the installed cells, not in any legacy `charges` counter. As of 0.14.3, all 26 cell-driven studio items ship **unloaded** — players install cells via the artifact's power-management dialog before the device works.

| State | Detection | Pill |
|---|---|---|
| **No cell** | `installedCellIds === []` (cell-driven only) | Red dashed `No cell` |
| **Empty** | All installed cells at 0% | Muted red `Empty` |
| **Low** | Min cell 1–50% | Orange `30% low` |
| **Healthy** | Min cell > 50% | Green `60%` |

When cells diverge >5% (one fresh cell slotted into a depleted pair), the pill renders `min · max` (e.g. `0% · 80%`).

### Built-in armor weapons share host cells

Powered Battle Armor's "Built-in Laser Pistol" carries `flags.gamma-world-1e.grantedBy: <armor-id>`. The 0.14.5 wiring makes both the fire gate (`artifactPowerStatus`) and the drain (`consumeArtifactCharge`) inherit the host's cell pool: firing the built-in laser drains the suit's atomic cells at the laser's per-shot rate (10%). When the host has no cells or goes inert, the built-in refuses to fire.

### Drain cadence

| Weapon family | Unit | Trigger |
|---|---|---|
| Laser Pistol / Rifle, Mark V / VII, Black Ray Gun, Fusion Rifle, Stun Rifle / Pistol, Needler | `shot` | Per-attack via `consumeArtifactCharge` |
| Slug Thrower | `clip` | Cumulative shot tracker on the weapon flag; debits 20% per 15 slugs fired |
| Vibro Dagger / Blade, Energy Mace, Stun Whip, Micro Missile | `minute` | Per combat round when the weapon's `system.artifact.active === true` (Ignite toggle) |
| Powered Plate / Alloyed Plate / Energized / Inertia / Scout / Battle / Attack / Assault, Energy Cloak, Communications Sender, Portent, Anti-grav Sled | `hour` | Per `updateWorldTime` tick when equipped |

### Drain time preview

Item sheet's Artifact tab shows `~N hr remaining` / `~N shots remaining` based on the min cell percent and the device's drain rate.

### Armor inert state

When all installed cells of a powered armor reach 0%, `armorIsInert(item)` returns true. The 0.14.4 sheet wiring renders an "Inert" plain badge on the armor row and a power-state pill. AC reverts to base, flight stops, force field collapses (these consequences live in derived data, not in this doc).

### Currently NOT automated (deferred)

- Energy Cell Charger workflow — depleted cell + charger + world-time advance → restored charge.
- Solar passive recharge in daylight.
- Disuse drain — RAW: chemical/solar cells in storage lose 1d6 years' charge.

GMs hand-edit cell percent on the cell sheet for now.

---

## 6. Mutations

### Schema overview

| Field | Purpose |
|---|---|
| `system.activation.mode` | `passive` / `action` / `toggle`. |
| `system.activation.enabled` | Toggle on/off (toggle mode only). |
| `system.activation.remaining` | Rounds remaining on a timed effect; ticked down each combat round. |
| `system.usage.{limited, uses, max, per}` | N-per-period counter; `per ∈ {day, week, encounter, scene, at-will}`. |
| `system.cooldown.{current, max}` | Rounds-to-recharge counter. |

### Variant rolls

Some mutations have at-acquisition variant choices (Absorption, Body Structure Change, Complete Mental Block, Fear Impulse, Physical Reflection, Skin Structure Change). The `preCreateItem` hook auto-rolls these on add; the variant is stored in `system.reference.variant` and surfaces on the row.

### Activation flow

Click the **Use** button (or **Deactivate** for an active toggle). The system:
1. Checks `mutationHasAction` — passive mutations have no action.
2. Checks remaining uses + cooldown.
3. Opens the appropriate parameter dialog (e.g., target picker for Telekinesis, intensity slider for Will Force).
4. Resolves the mutation's effect — fires save cards, applies temp effects, etc.
5. Decrements uses + sets cooldown.

### Status pill colors

The 0.14.2 helper `mutationStatus(item)` returns one of seven kinds, each with its own CSS class:

- **Active (timed)** — green, with countdown
- **Active** — green, no countdown
- **Cooldown** — orange, with rounds
- **Spent** — grey, limited uses depleted
- **Ready** — blue, action-mode with uses available
- **Available** — blue-grey, toggle currently OFF
- **Passive** — faded, always-on trait

### Automation registry

Of the 141 mutations seeded in `tools/content-studio/content/mutations`, the table below summarizes those with **mechanical** automation (active effects, ticks, save modifiers, action handlers). Flavor-only mutations (e.g., Multiple Body Parts, Mass Mind, Aromatic Powers) appear on the sheet as passives with descriptive text only.

#### Passive AE bonuses

| Mutation | Effect | Where wired |
|---|---|---|
| Scientific Genius | +2 to seven tech skills, −1 artifact analysis | `MUTATION_RULES` AE on `system.skills.*.bonus` + `gw.artifactAnalysisBonus` |
| Heightened Hearing | Cannot be surprised, +2 surprise modifier | `MUTATION_RULES` AE on `gw.cannotBeSurprised` / `gw.surpriseModifier` |
| Heightened Touch (0.14.14) | −1 artifact analysis, +2 juryRigging, +2 salvage | `artifactUseProfile` switch + `MUTATION_RULES` AE on skills |
| Heightened Balance (0.14.14) | +3 climbingTraversal, +2 stealth | `MUTATION_RULES` AE on skills |
| Heightened Brain Talent | 3× artifact analysis speed, 2 save attempts vs mental | `artifactUseProfile.speedMultiplier` + `SAVE_ATTEMPT_MUTATIONS` |
| Dual Brain | −1 artifact analysis, 2 save attempts vs mental | `artifactUseProfile` switch + `SAVE_ATTEMPT_MUTATIONS` |
| Heightened Intelligence | −2 artifact analysis | `artifactUseProfile` switch |
| Molecular Understanding | Instant chart A | `artifactUseProfile.instantCharts` |
| Heightened Constitution | +3 to radiation/poison saves; rad cap "severe" | `collectHazardSaveFlags` |
| Bacterial Symbiosis | +3 to radiation + poison saves | `collectHazardSaveFlags` |
| Will Force (CN variant) | +CN score to saves | `collectHazardSaveFlags` |
| No Resistance to Poison | Poison saves lose CN modifier | `collectHazardSaveFlags` |
| Heightened Dexterity | AC bonus when unencumbered | `MUTATION_RULES` AE w/ encumbrance gate |
| Mental Defense Shield | +4 mental resistance | `MUTATION_RULES` AE on `gw.mentalResistance` |
| Mental Defenselessness | −4 mental resistance | `MUTATION_RULES` AE |
| Double Physical Pain / Multiple Damage | ×2 damage taken | `MUTATION_RULES` AE on `gw.damageTakenMultiplier` |

#### Damage-trait grants (0.14.16)

Folded into `derived.damageVulnerability/Immunity/Resistance` in `buildActorDerived` via `MUTATION_DAMAGE_TRAITS`:

| Mutation | Damage types vulnerable |
|---|---|
| Temperature Sensitivity | heat, cold, energy |
| Photosynthetic Skin | heat, cold |
| Skin Structure Change (variant: "+1 damage taken when hurt") | physical, heat, cold, energy, laser |

#### Action mutations (active abilities)

Each entry has a `system.activation.mode = "action"` row; clicking **Use** runs the named handler.

| Mutation | Range | Formula | Handler | Notes |
|---|---|---|---|---|
| Heat Generation | 25 m | 1d6 | damage | |
| Cryokinesis | 25 m | 1d6 | damage | |
| Pyrokinesis | 25 m | 1d6 | ramping-damage | Per round of concentration |
| Mental Blast | 30 m | varies | mental-damage | |
| Mental Control | Sight | — | mental-control | |
| Death Field Generation | 30 m | save-or-die | death-field | |
| Light Generation | 30 m | varies | light-generation | |
| Life Leech | Touch | varies | life-leech | Heals user |
| Telekinesis | varies | — | guided | Tracked rounds |
| Precognition | Self | — | note (guided) | 3-min foresight |
| Total Healing | Self | full | full-heal | |
| Tangle Vines (plant) | 3 m | save | restrain | Strength check vs DC 18 |
| Carnivorous Jaws (plant) | 2 m | 2d6 | damage | |
| Sucker Vines (plant) | Melee | 1d4 | life-leech | |
| **Squeeze Vines (0.14.16)** | Melee | 2d6/round | ramping-damage | Per-round constriction |
| **Throwing Thorns (0.14.16)** | 10 m | 1d4 | damage | Dagger damage thorns |
| **Poison Throwing Thorns (0.14.16)** | 10 m | 1d4 + poison save | damage | Random-intensity poison |
| **Spore Cloud (0.14.16)** | 4 m AOE | 1d6 + poison save | area-damage | |
| **Explosive Fruit (0.14.16)** | Throw 10 m / 5 m AOE | 2d6 | area-damage | |
| **Razor-edged Leaves (0.14.16)** | Melee | 1d4 | damage | |
| **Saw-edged Leaves (0.14.16)** | Melee | 1d8 | damage | |
| **Barbed Leaves (0.14.16)** | Melee | 1d6 | damage | May grip |
| **Dissolving Juices (0.14.16)** | Melee | 5d6/turn | ramping-damage | Per-turn while in contact |
| **Heightened Taste (0.14.14)** | Self | — | info | At-will GM identify-substance prompt |
| **Fear Impulse (0.14.16)** | Self | — | info | Mental save when trigger appears |

#### Combat-round ticks (0.14.15 / 0.14.16)

Fired from `tickCombatActorState` on every `updateCombat` round change. See `module/mutation-ticks.mjs`.

| Mutation | Trigger | Effect |
|---|---|---|
| Hemophilia | actor wounded | −2 HP/round, chat prompt to bind wound |
| Increased Metabolism | every 5th round | warning chat (−1 PS / −2 HP if ignored) |
| Poor Respiratory System | round ≥ 6 | 1d6 minutes unconscious + wake-up flag |
| Epilepsy (0.14.16) | round 1 (25%) / round 2+ (10%) | apply paralyzed status |

#### World-time ticks (0.14.15)

Fired from `tickAllActors` on every `updateWorldTime` advance. See `module/conditions.mjs`.

| Mutation | Trigger | Effect |
|---|---|---|
| Regeneration | every 24h | 1 HP/day per 5kg body weight (default 75kg → 15 HP/day) |
| Daylight Stasis | crosses 06:00 / 18:00 | toggles paralyzed status |

#### Rest-flow modifiers

| Mutation | Trigger | Effect |
|---|---|---|
| Photosynthetic Skin (0.14.15) | `flags.basking = true` during `applyRest` | 4× daily heal rate |

#### Reactive intercepts (0.14.16)

| Mutation | Where | Effect |
|---|---|---|
| Anti-Reflection | top of `useMutation` | 25% chance to post a chat warning that the mental mutation reverses (GM applies reversal) |

#### Per-actor automation flags

| Flag | Purpose |
|---|---|
| `flags["gamma-world-1e"].bodyWeightKg` | Overrides 75kg default for Regeneration |
| `flags["gamma-world-1e"].basking` | Turns on Photosynthetic Skin's 4× heal multiplier |
| `flags["gamma-world-1e"].regenLastTick` | Internal: last regen tick timestamp |
| `flags["gamma-world-1e"].poorRespiratoryFaint` | Internal: faint expiry tracker |

#### Variant pools (auto-rolled at item-create)

The `preCreateItem` hook calls `mutationVariant(name)` for: Absorption, Body Structure Change, Complete Mental Block, Fear Impulse, Physical Reflection, Skin Structure Change. The rolled value lives at `system.reference.variant` and is read by the dependent automation (Skin Structure Change consults it for damage traits; Fear Impulse displays it on the chat card; etc.).

#### Audit findings — flavor-only mutations

These mutations have no mechanical automation and rely on GM narration:
- **Mental**: Mass Mind, Directional Sense, Sound Imitation, Thought Imitation, Empathy, Telepathy
- **Physical**: Multiple Body Parts, New Body Parts, Oversized Body Parts
- **Plant**: Mobility, Adaptation, Size Increase, Size Decrease, Winged Seeds, Seed Mobility, Divisional Body Segments, Manipulation Vines (passive), Aromatic Powers, Berries (effects), Bacterial Symbiosis (disease side; +3 save side IS automated), Boring Tendrils, Contact Poison Sap, Parasitic Attachment
- **Defects**: Most defects (Diminished Sense, Low Fertility, No Sensory Nerve Endings, Poor Dual Brain, Body Structure Change, Hostility Field, Attraction Odor, Complete Mental Block, etc.)

These either depend on world state the system can't introspect (e.g., is-fire-in-the-scene), apply only in GM-narrated situations (e.g., breeding rates), or describe physical traits that don't change game numbers (e.g., extra eyes for cosmetic flavor).

---

## 7. Artifacts and identification

### Schema fields

`system.artifact.*` on weapon, armor, and gear:

| Field | Use |
|---|---|
| `isArtifact` | `true` for Ancient Tech items |
| `category` | `pistol / rifle / armor / vehicle / robot / etc.` |
| `chart` | A / B / C — drives `artifactDifficulty()` |
| `condition` | `broken / poor / fair / good / excellent / perfect` — drives `artifactFunctionChance()` |
| `identified` | Boolean — has the player learned what it is? |
| `operationKnown` | Boolean — has the player learned how to use it? |
| `attempts` | Integer — failed identification attempts so far |
| `malfunction` | String — when set, blocks operation until cleared |

### Identification flow

The 0.14.7 commit added an **Analyze** button on the item sheet's Artifact tab (visible when `!identified || !operationKnown`). Clicking opens the existing `openArtifactSession` UI — a multi-step GM-driven flow with helper rolls, time tracking, and chart resolution. Once both flags flip, the button hides; the device is fully usable.

The same Analyze button exists on the actor sheet's inventory row for unidentified artifacts (`gwCanAnalyze` gate).

### Operation gate

Firing an artifact weapon routes through `resolveArtifactOperation`:

1. If `operationKnown` is false → opens the analysis workflow, refuses fire.
2. If `malfunction` is set → refuses fire with the malfunction message.
3. If power is unsatisfied (`!powered`) → refuses fire.
4. Roll `artifactFunctionChance()` against d100 — if it fails, the artifact malfunctions on this use.
5. Otherwise consume cell charge / legacy counter and proceed to the attack roll.

---

## 8. Saves and conditions

### Save resolution

When a hit / hazard inflicts a save-required effect, the system posts a **save card** to chat:

- **NPC targets** auto-resolve locally via `npcSaveMode` (default `auto` — system rolls + applies).
- **PC targets** get a Dialog asking for the save (with timeout from `playerSaveTimeout`).

Save formulas use the existing GW1e tables: poison vs CN (`d20 + cn-mod ≥ intensity`), radiation vs CN (band-banded outcomes), mental vs MS, paralysis vs CN.

### Auto-applied conditions

`autoApplyOnHitConditions` (default true) — when an attack carries a special on-hit effect (poison, paralysis, radiation, stun, etc.), the system auto-posts the save card and on failure applies the matching **timed status effect** (Foundry Active Effect with a duration). The Active Now panel surfaces these countdowns.

Disable this setting to keep the manual "Apply Effect" follow-up button on the attack card.

### Tracked conditions

| Status ID | Behavior |
|---|---|
| `poisoned` | HP drain over rounds; long-rest healing skipped |
| `radiation-sickness` | Inflates `effectiveFatigueRound` to saturation; long-rest healing skipped |
| `catastrophic-radiation` | Hourly HP drain (10% max/hour) until "ancient treatment" or death |
| `unconscious`, `paralyzed`, `stunned`, `prone`, `helpless` | Standard Foundry effects |

---

## 9. Encounters

### Roll types (each has a chat card + sound cue)

| Action | Helper | What it does |
|---|---|---|
| **Reaction** | `rollReaction(actor, { targetActors, offerModifier, manualModifier })` | Charisma + cryptic alliance modifier on 2d6 vs reaction table |
| **Surprise** | `rollSurprise(sideA, sideB)` | 1d10 each side; lower side surprised |
| **Morale** | `rollMorale(actor, { ... })` | 2d6 vs intelligence-derived threshold; outcome posted |
| **Route encounter** | `checkRouteEncounter(actor, { terrain, period })` | Per-period d6 check; if encountered, d20 on terrain table |
| **Random encounter** | `rollTerrainEncounter(actor, { terrain })` | Direct d20 on terrain table (skipping the d6 check) |

Buttons live in the monster-sheet header (Reaction, Morale, Route Check) and the character-sheet header (Travel button uses the route check internally).

### Terrain keys

`clear`, `mountains`, `forest`, `desert`, `water`, `ruins`, `zones` (radioactive). Each maps to a Foundry RollTable in the **Encounter Tables** compendium pack.

---

## 10. Rest

### Short Rest (1 hour)

Click **Short Rest** on the character sheet. Dialog asks how many Hit Dice to spend (0 to `min(available, floor(level/3))`). Each HD rolls 1d6 healing; total adds to current HP (capped at max). HD pool decrements. World time advances 1 hour (gated by `restAdvancesWorldTime`).

Hit Dice resource: `system.resources.hitDice.value/max`. Max derives from `details.level`; bumps by the level delta on level-up. Long Rest refills to max.

### Long Rest (6 hours)

Click **Long Rest**. Confirmation dialog → restores all HP to max **unless** poisoned or radiation-sick (in which case HD still refresh and time still advances, but HP heal is skipped). Fatigue clears regardless. World time advances 6 hours.

### Hooks

- `gammaWorld.v1.preShortRest` / `preLongRest` — vetoable (return false to cancel).
- `gammaWorld.v1.shortRest` / `longRest` — announce-only, payload includes `type`, `actor`, `healed`, `hitDiceSpent`, etc.

A single listener can branch on `payload.type === "short" | "long"`.

---

## 11. Travel-time mode

Click **Travel** on the character sheet. Dialog asks for terrain + total hours + day/night. The system loops 4-hour legs (configurable via `travelLegHours`):

1. Roll a wandering-encounter check via `checkRouteEncounter` (the existing route-check chat card posts as usual).
2. Advance world time by the leg duration — hourly cell drain on equipped armor / wearables progresses naturally.
3. At each 24h boundary: deduct 1 ration (gear with `subtype: "ration"`) per PC. Auto-destroy empty stacks. Track PCs who run out.
4. If an encounter triggered, **stop early** — GM resolves; player runs Travel again for remaining hours.

Posts a single summary chat card: hours/legs/encounters/rations/starving.

The party defaults to all player-owned characters in the world; can be overridden by passing `partyActors` to `performTravel(actor, opts)` programmatically.

---

## 12. XP and loot — encounter close

When a combat is **deleted** from the tracker (the GM clicks the trash icon), the system:

1. Resets fatigue (controlled by `resetFatigueOnCombatEnd`).
2. Posts the **encounter-close summary card** (controlled by `encounterCloseSummary`):
   - Tallies XP from defeated monsters (`system.details.xpValue` if explicit, else `xpForHitDice(hitDice)` from the RAW table).
   - Identifies PC participants (character-typed combatants).
   - Renders a **Distribute XP** button that splits total evenly across PCs (remainder to first).
   - Renders a per-monster **Roll Loot** button when the monster has `system.details.lootTable` set (any RollTable UUID, e.g. `RollTable.<id>` or `Compendium.<pack>.<id>`).

Buttons are one-shot (a flag on the message records the click). GMs can re-roll loot manually from the table sidebar.

### Adding XP / loot to a monster

Edit the monster's actor sheet:
- `system.details.xpValue` — explicit XP override (wins over HD fallback).
- `system.details.hitDice` — used by the fallback table when xpValue is 0.
- `system.details.lootTable` — UUID of the table to roll on death.

---

## 13. Settings reference

Most are **world-scoped, GM-edited**. The handful exposed in the Foundry Settings UI (`config: true`) are marked ✅; the rest are tweaked via the system's GM Automation Config menu or via macro.

| Key | Type | Default | Config UI | What it controls |
|---|---|---|---|---|
| `pshTechReliable` | Boolean | true | | Pure Strain Humans get +5 to artifact-use chance per RAW. |
| `autoRollNpcDamage` | (deprecated; use `npcDamageMode`) | | | |
| `npcDamageMode` | String | `onHit` | | `none` / `onHit` / `always` — when NPCs auto-roll damage. |
| `promptBeforeApplyDamage` | Boolean | true | | Confirmation step before applying damage to a target. |
| `npcSaveMode` | String | `auto` | | `manual` / `auto` — how NPC saves resolve. |
| `playerSaveTimeout` | Number | 30 | | Seconds before a PC save dialog auto-rolls. |
| `attackRollMode` | String | `publicroll` | | Default roll mode for attacks. |
| `damageRollMode` | String | `publicroll` | | Default for damage. |
| `saveRollMode` | String | `publicroll` | | Default for saves. |
| `hideGmRollDetails` | Boolean | false | | When GM rolls publicly, mask the breakdown. |
| `suppressGmDiceAnimation` | Boolean | false | | Skip Dice So Nice for GM rolls. |
| `autoRemoveInstantTemplate` | Boolean | true | | AOE templates auto-remove after the attack resolves. |
| `autoConsumeCharges` | Boolean | true | | Decrement artifact / weapon charges on use. |
| `autoTickFatigue` | Boolean | true | | Increment fatigue round each new combat round. |
| `resetFatigueOnCombatEnd` | Boolean | true | | Zero fatigue on combat delete. |
| `autoApplyOnHitConditions` | Boolean | true | | Auto-post save cards + apply timed effects on failure. |
| `grenadePersistentRounds` | Number | 5 | | Default duration for tear-gas / poison clouds. |
| `soundCuesEnabled` | Boolean | false | | Play audio on attack hit/miss/crit, save success/fail, condition applied. |
| `restAdvancesWorldTime` | Boolean | true | | Short Rest +1h / Long Rest +6h advance world time. |
| `encounterCloseSummary` | Boolean | true | | Post the XP + loot summary card on combat delete. |
| `autoPickDamageMultiplier` | Boolean | true | ✅ | Damage card pre-selects ×0/×½/×2 from target traits. |
| `travelLegHours` | Number | 4 (1–12) | ✅ | Travel-mode leg duration; one encounter check per leg. |
| `schemaVersion` | String | (auto) | | Internal — version of last-run migration. |

The non-`config: true` settings are reachable via the **GM Automation Config** application (registered as a settings menu).

---

## 14. Hook surface (`gammaWorld.v1.*`)

For module / macro authors. Every hook payload includes `version: 1` and an `AttackContext`-shape `context` object. **Veto** hooks are invoked via `Hooks.call` and stop on the first falsy return; **announce** hooks use `Hooks.callAll`.

| Hook | Stage | Vetoable |
|---|---|---|
| `gammaWorld.v1.preAttackRoll` | Before d20 rolls; intent payload | ✅ |
| `gammaWorld.v1.attackRollComplete` | After d20, before chat card | |
| `gammaWorld.v1.preRollDamage` | Before damage formula evaluates | ✅ |
| `gammaWorld.v1.damageRollComplete` | After damage roll | |
| `gammaWorld.v1.preApplyDamage` | Before HP mutation | ✅ |
| `gammaWorld.v1.damageApplied` | After HP update | |
| `gammaWorld.v1.preSaveRoll` | Before save resolves | ✅ |
| `gammaWorld.v1.saveResolved` | After save outcome | |
| `gammaWorld.v1.conditionApplied` | After AE applied to target | |
| `gammaWorld.v1.resourceConsumed` | After ammo / charge / cell drain | |
| `gammaWorld.v1.preSkillRoll` | Before skill d20 | ✅ |
| `gammaWorld.v1.skillRollComplete` | After skill d20, before card | |
| `gammaWorld.v1.preShortRest` | Before short-rest resolves | ✅ |
| `gammaWorld.v1.shortRest` | After short-rest commits | |
| `gammaWorld.v1.preLongRest` | Before long-rest resolves | ✅ |
| `gammaWorld.v1.longRest` | After long-rest commits | |

Subscribe with the namespace constant from `module/hook-surface.mjs:HOOK`:

```js
import { HOOK } from "./hook-surface.mjs";
Hooks.on(HOOK.shortRest, (payload) => {
  if (payload.actor.system.details.alliance === "restorationists") {
    payload.actor.update({ "system.details.xp": ... });
  }
});
```

Or use the literal name from a macro:

```js
Hooks.on("gammaWorld.v1.damageApplied", (p) => { /* ... */ });
```

---

## 15. Public API (`game.gammaWorld`)

`module/api.mjs` exposes a curated surface for macros and modules. Highlights:

| Export | Use |
|---|---|
| `awardXp(actor, amount, { source })` | Programmatic XP award. |
| `applyAttributeBonus(actor, key)` | Spend a pending level-up bonus. |
| `rollSkill(actor, skillKey)` | Skill d20 with full chat card. |
| `rollReaction / rollSurprise / rollMorale` | Encounter mechanics. |
| `checkRouteEncounter(actor, { terrain, period })` | Per-period wandering check. |
| `rollTerrainEncounter(actor, { terrain })` | Direct table draw. |
| `applyMedicalDevice(actor, deviceKey, { sourceItem })` | Apply medi-kit / pain reducer / etc. |
| `applyRest(actor, { hours })` | Legacy 24h natural rest (pre-0.14.1; still works). |
| `performShortRest / performLongRest` | The 0.14.1 homebrew rest helpers. |
| `performTravel(actor, opts)` | Programmatic travel (skips the dialog). |
| `openArtifactSession(actor, item)` | Open the artifact-analysis multi-step UI. |
| `consumeArtifactCharge(item, amount)` | Drain a cell-driven item's cell pool. |
| `replaceArtifactCells(actor, item, opts)` | Install fresh cells from inventory. |
| `uninstallCell(item, cellUuid)` | Eject a specific cell. |

Full list: `module/api.mjs`.

---

## 16. What's still manual

Honest list of things the system **does not** automate (yet):

- **Cell recharge** — Energy Cell Charger workflow, solar passive recharge, disuse drain. GMs hand-edit cell percent.
- **Rest cell-charger gameplay** — same as above; the rules exist in `06-artifacts-and-equipment.md` but no UI.
- **Round-cycle saves** for persistent AOE hazards — initial save is automated, but a radiation cloud's per-round re-saves aren't auto-fired.
- **Treasure / loot tables** — system loads the RollTable and provides a button, but the **content** of treasure tables has to be authored per-campaign (the encounter-tables pack ships with creature tables, not loot).
- **Built-in robot weapons** — robot inventory items aren't yet wired into the cell-sharing model the way armor built-ins are.
- **Per-monster natural attack icons** — many bestiary natural attacks (Bite, Defensive Minigun, etc.) still use Foundry default SVG placeholders; cosmetic only.
- **Day/night cycle** — Foundry's clock advances; the system reads it for Travel's day/night default, but lighting transitions are a GM job.

---

## 17. Migration story (pre-existing world load)

When a world opens, `migrateWorld()` runs once (gated on `schemaVersion`). The current chain handles every prior version up through 0.14.x. Migrations are idempotent — second run is a no-op.

Recent migrations of note:

| Version | What it did |
|---|---|
| 0.13.0 | Cell-drain foundation; auto-installed cells from actor inventory if available. |
| 0.13.2 | Scrubbed bogus self-pointing `installedIn` flags on cells. |
| 0.14.0 | Ammunition refactor; renamed bundle gear ("Arrows (bundle of 20)" → "Arrow", quantity 20); deleted 6 orphan cartridges. |
| 0.14.1 | Hit Dice resource backfilled on every character actor. |
| 0.14.3 | Healed cell-driven items where studio shipped lying state (cellsInstalled lied vs installedCellIds). |
| 0.14.6 | Schema additions on `details` (xpValue / hitDice / lootTable) — defaults apply automatically; no migration step needed. |

GM whisper chat cards announce each migration that ran, with counts.

---

## 18. Where to look in the code

| Area | File |
|---|---|
| Combat resolution | `module/dice.mjs` |
| Damage application | `module/dice.mjs` (`applyIncomingDamage`) |
| Range bands | `module/range.mjs` |
| Combat matrix | `module/tables/combat-matrix.mjs` |
| Cells / power | `module/artifact-power.mjs` |
| Power state pills | `module/item-power-status.mjs` |
| Mutations | `module/mutations.mjs` + `module/mutation-rules.mjs` |
| Mutation status | `module/mutation-status.mjs` |
| Effect-state helpers | `module/effect-state.mjs` |
| Active Effect countdown | `module/effect-countdown.mjs` |
| Skills | `module/skills.mjs` + `module/config.mjs:SKILLS` |
| Save flow | `module/save-flow.mjs` |
| Conditions | `module/conditions.mjs` |
| Encounters | `module/encounters.mjs` |
| Rest | `module/healing.mjs` |
| Travel | `module/travel.mjs` |
| Encounter-close (XP / loot) | `module/encounter-close.mjs` |
| Artifact session | `module/artifact-session.mjs` |
| Hook surface | `module/hook-surface.mjs` |
| Public API | `module/api.mjs` |
| Migrations | `module/migrations.mjs` |
| Item data models | `module/data/item-{weapon,armor,gear,mutation}.mjs` |
| Actor data model | `module/data/actor-character.mjs` |

---

## 19. Asset pipeline

Studio JSON content lives at `tools/content-studio/content/<pack>/`. The build pipeline:

```
node tools/content-studio/scripts/validate.mjs           # JSON sanity
node tools/content-studio/scripts/build.mjs <pack> --publish --confirm-overwrite
node tools/content-studio/scripts/seal.mjs <pack>        # post-build LevelDB seal
```

Image generation:

```
node scripts/build-item-art-prompts.mjs --category <cat>
node scripts/build-monster-art-prompts.mjs
python3 scripts/generate-art.py --category <cat>          # requires OPENAI_API_KEY
python3 scripts/render-assets.py --category <cat> --shape <portrait-token|square-icon>
node scripts/repoint-art-imgs.mjs                         # writes systems/...png paths into JSONs
```

Categories: `weapons`, `armor`, `gear`, `monsters`, `mutations`, `robots`, `sample-actors`.

---

## 20. Testing

`npm test` runs `node --test` against `tests/rules.test.mjs` (~166 tests as of 0.14.9). Tests cover:

- Combat math (range bands, fatigue lookups, attack target resolution).
- Cell drain (single-cell, multi-cell parallel, cap behavior, residue accumulator).
- Mutation status truth tables.
- Power state pill kinds + built-in inheritance.
- Rest math (HD spend, condition gates).
- Travel loop (legs, ration consumption, starving detection).
- Damage trait multiplier truth table.
- Schema invariants on studio JSONs.
- Migration idempotency (second-run no-ops).

Tests run without a Foundry environment — helpers stub `globalThis.foundry`, `Hooks`, `ChatMessage`, `game` as needed.

---

*This guide reflects system version 0.14.9. When mechanics change, update this file alongside the code — the version stamp at the top should always match `system.json:version`.*
