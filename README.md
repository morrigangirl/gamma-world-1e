# Gamma World 1e for Foundry VTT 13

A personal-use Foundry VTT system for **Gamma World 1st Edition** with working automation for chargen, combat, mutations, saves, chat cards, migrations, and bundled compendia.

## What Works

- Actor data prep for derived AC, HP, movement, resistances, combat bonuses, mutation modifiers, natural attack configuration, and 5e-style per-combatant initiative support.
- RAW-first chargen for Pure Strain Humans, humanoids, mutated animals, and robot actors on the shared character model.
- Real Gamma World 1e weapon attack matrix, natural attack matrix, mental attack matrix, and radiation / poison resistance tables.
- Mutation automation with passive modifiers, toggles, limited uses, cooldowns, durations, combat-round ticking, and chat output.
- Weapon workflows for normal damage plus special on-hit effects such as poison, radiation, paralysis, stun, and instant-death weapons.
- Optional Sequencer + JB2A animation support for Gamma World's combat-first kit, including beam weapons, darts, powered melee weapons, grenades, bombs, missiles, shield effects, gas clouds, and high-value support gear such as `Life Ray`, `Medi-kit`, `Portent`, and `Energy Cloak`.
- Equipment automation for powered armor, force fields, black-ray protection, laser deflection, built-in granted weapons, grenades, bombs, missiles, Portent shields, artifact power cells, rejuv chambers, and Life Ray revival.
- Artifact workflows for analysis, operation checks, condition/function percentages, charge tracking, and guided use of Ancient devices.
- Robot workflows for power management, repair, immunity handling, quarter-damage impairments, and shared-sheet controls.
- Encounter workflows for reaction, surprise, morale, terrain encounter tables, and route-movement encounter checks with persistent morale tracking.
- Save and hazard chat cards with follow-up buttons for damage, lethal outcomes, and radiation-triggered mutation fallout.
- Persistence across reloads, world migrations, and data normalization for older actors and items.
- V13 actor and item sheets plus bundled compendia for mutations, equipment, sample actors, and system docs.

## Included Compendia

- `Mutation Index`: full humanoid and mutated-animal mutation lists with summaries and activation data.
- `Armory and Gear`: primitive weapons, Ancient weapons, armor, explosives, medical devices, vehicles, power cells, and common scavenger equipment.
- `Sample Actors`: ready-to-import examples for PSH, humanoid, mutated-animal, and robot play.
- `Monsters and Beasts`: core-book creatures as ready-to-import Monster actors with attacks, defenses, mutations, and encounter-ready notes.
- `Rulebook Reference`: chapter-by-chapter rulebook prose plus factual tables, cross-linked to compendium items. Authored and rebuilt via the content studio (see below).
- `System Documentation`: quick-start, artifact/robot notes, and encounter workflow docs.

## Development

```bash
npm test
npm run test:foundry
npm run test:foundry:phase2
npm run test:foundry:phase3
npm run build:monster-prompts
npm run build:monster-assets
npm run build:mutation-descriptions
npm run seal:packs
```

- `npm test` runs the lightweight rules tests.
- `npm run test:foundry` runs a browser smoke test against a local Foundry instance at `http://127.0.0.1:30000/`.
- `npm run test:foundry:phase2` runs the longer end-to-end player workflow validation for chargen, combat, saves, gear, mutations, artifacts, and robot actions.
- `npm run test:foundry:phase3` runs the encounter/referee workflow validation for terrain encounters, route checks, morale tracking, and the new sheet controls.
- `npm run build:monster-prompts` regenerates the JSONL prompt batch used to create the monster base art with the explicit image CLI fallback. Reads from the committed `packs/monsters` LevelDB.
- `npm run build:monster-assets` converts the generated transparent monster base renders in `output/imagegen/monsters/base/` into Foundry-ready portraits and token art in `assets/monsters/`.
- Parallel `build:weapon-prompts` / `build:mutation-prompts` / `build:robot-prompts` + matching `*-art` / `*-assets` commands drive the weapons, mutations, and robotic-unit asset pipelines the same way.
- `npm run build:mutation-descriptions` parses `ref/rulebook-prose/06-Updated-Mutations.md` into `module/tables/mutation-descriptions.generated.mjs`, the runtime lookup `buildMutationItemSource` consults when chargen or a dice roll creates a new mutation item. Run after editing the homebrew markdown.
- `npm run seal:packs` opens every declared compendium pack with `classic-level` and forces a LevelDB compaction so all entries live in sealed SSTables (`.ldb`) rather than the write-ahead log. Run this after any pack-side change — Foundry v13 reliably reads sealed SSTables, but its bundled LevelDB has silently produced empty packs from populated WALs written by older compile pipelines.
- Named Ancient devices and weapons are normalized as artifacts on import and migration, so older worlds pick up the correct Analyze / Use workflows without hand-editing item data.
- Bundled actors and monsters ship with configured prototype tokens, and newly created world actors inherit the same linked/friendly or hostile defaults automatically.

## Authoring Pack Content

Pack content (mutations, equipment, sample actors, monsters, rulebook prose, system docs, encounter & roll tables, cryptic alliances, robot chassis) is authored in the **content studio** under `tools/content-studio/`. `tools/content-studio/content/*.json` is the source of truth; `tools/content-studio/scripts/build.mjs` compiles it into the repo-level `packs/` LevelDB that Foundry ships. See `tools/content-studio/README.md` for the full workflow (extract, edit, validate, publish).

The retired source-of-truth scripts (`build-compendia.mjs`, `compendium-content.mjs`, `monster-content.mjs`, `rulebook-content.mjs`) were removed in 0.11.x once the content studio covered every pack; tests and art-prompt builders now read the committed `packs/` directly via `classic-level`.

## Manual Validation

1. Launch or relaunch the world on Foundry VTT 13.
2. Import a sample actor from the `Sample Actors` pack, import a beast from `Monsters and Beasts`, or create a fresh character.
3. Use `Roll Character (Auto)` and confirm HP, defenses, mutations, and quick actions populate on the Main tab.
4. Switch through `Mutations`, `Inventory`, and `Bio` and confirm each tab activates and renders the expected actor data.
5. Equip a weapon and target a token. Attack from the Inventory tab and resolve the follow-up chat card.
6. Trigger poison, radiation, or mental saves from the Main tab.
7. Start a combat encounter and confirm initiative is rolled once per combatant on `1d20 + DX mod`, then remains unchanged on the next round.
8. Drag armor, weapons, and gear from `Armory and Gear` onto the actor and confirm named equipment auto-fills its rules fields.
9. Equip powered armor and confirm any built-in fists, pistols, or missile racks appear automatically in Inventory.
10. Use grenades or gas gear from the Inventory tab and confirm the Active Effects list updates on affected targets.
11. Use an active mutation from the Mutations tab and confirm cooldowns, barriers, invisibility, or density effects update.
12. Drag an Ancient device such as `Portent`, `Energy Cloak`, `Accelera Dose`, or `Life Ray` onto the actor and confirm its use flow either resolves mechanically or opens a guided persistent workflow.
13. Import the robot sample actor and confirm power, mode, and repair actions work from the Main tab.
14. Use `Random Encounter`, `Route Check`, and `Roll Morale` from the Main tab and confirm the chat cards match the chosen terrain and actor state.
15. Reload the world and confirm actor state, active barriers, granted equipment, morale watches, robot impairments, and sheet tabs still persist and render.
16. If `Sequencer` and `JB2A - Patreon Complete Collection` are active, leave `Enable Pilot Animations` on and confirm representative weapons (`Laser Pistol`, `Laser Rifle`, `Fusion Rifle`), ordnance (`Fragmentation Grenade`, `Micro Missile`, `Negation Bomb`), and protections (`Force Field Generation`, `Portent`, `Energy Cloak`) play visuals without affecting the underlying rules results.

## Monster Art

- Generated monster portraits live in `assets/monsters/portraits/`.
- Generated monster token art lives in `assets/monsters/tokens/`.
- Raw transparent image-model outputs live in `output/imagegen/monsters/base/` and can be reprocessed with `npm run build:monster-assets`.
- The monster prompt batch is generated from the monster compendium source data, so rerunning `npm run build:monster-prompts` after changing monster definitions keeps the art prompts in sync with the system data.

## Notes

- The local rulebook PDF in `ref/` is used for transcription and validation, but it is not required at runtime.
- JB2A supplies the animated assets only; the system's animation layer uses Sequencer to fire them and safely no-ops when either dependency is unavailable or the world setting is disabled.
- The system is intentionally scoped to Foundry VTT 13.
