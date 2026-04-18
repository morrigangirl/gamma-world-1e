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
- `Rulebook Reference`: paraphrased rules summaries and factual tables, organized by chapter and cross-linked to compendium items.
- `Imported Rulebook`: owner-transcribed rulebook prose, one journal entry per chapter, rebuilt on demand from `ref/rulebook-prose/*.md` (see *Transcribing the Rulebook* below).
- `System Documentation`: quick-start, artifact/robot notes, and encounter workflow docs.

## Development

```bash
npm test
npm run test:foundry
npm run test:foundry:phase2
npm run test:foundry:phase3
npm run build:monster-prompts
npm run build:monster-assets
npm run extract:rulebook-prose
npm run import:rulebook-prose
npm run prose:refresh
npm run build:compendia
```

- `npm test` runs the lightweight rules tests.
- `npm run test:foundry` runs a browser smoke test against a local Foundry instance at `http://127.0.0.1:30000/`.
- `npm run test:foundry:phase2` runs the longer end-to-end player workflow validation for chargen, combat, saves, gear, mutations, artifacts, and robot actions.
- `npm run test:foundry:phase3` runs the encounter/referee workflow validation for terrain encounters, route checks, morale tracking, and the new sheet controls.
- `npm run build:monster-prompts` regenerates the JSONL prompt batch used to create the monster base art with the explicit image CLI fallback.
- `npm run build:monster-assets` converts the generated transparent monster base renders in `output/imagegen/monsters/base/` into Foundry-ready portraits and token art in `assets/monsters/`.
- `npm run extract:rulebook-prose` OCR-extracts `ref/gamma-world-core-rules.pdf` into one Markdown file per chapter under `ref/rulebook-prose/`. Chapter 10 is intentionally skipped (its first page is a map graphic whose OCR output is unusable). Existing hand-edited files without the generator sentinel comment at the top are left alone; marker-bearing files are regenerated from scratch.
- `npm run import:rulebook-prose` reads `ref/rulebook-prose/*.md` and writes `scripts/rulebook-prose.generated.mjs` — the overlay module consumed by the Imported Rulebook pack generator.
- `npm run build:compendia` wipes and rebuilds only `packs/imported-rulebook/` from the prose overlay via `@foundryvtt/foundryvtt-cli`'s `compilePack`. No other compendium pack on disk is read, modified, or deleted. Running Foundry is fine as long as the Imported Rulebook compendium window is closed.
- `npm run prose:refresh` is the one-liner that chains `extract:rulebook-prose && import:rulebook-prose && build:compendia` — use it after polishing transcriptions or after re-extracting from the PDF.
- Named Ancient devices and weapons are normalized as artifacts on import and migration, so older worlds pick up the correct Analyze / Use workflows without hand-editing item data.
- Bundled actors and monsters ship with configured prototype tokens, and newly created world actors inherit the same linked/friendly or hostile defaults automatically.

## Transcribing the Rulebook

The `Imported Rulebook` compendium is populated from owner-transcribed Markdown under `ref/rulebook-prose/`. The standard cycle:

1. **Extract** — `npm run extract:rulebook-prose` OCRs `ref/gamma-world-core-rules.pdf` into nine chapter files (`01-introduction.md` through `09-experience.md`). The extractor inserts a sentinel comment at the top of each file; regeneration only overwrites files that still carry the sentinel, so hand-edited chapters are safe if you remove the comment before editing.
2. **Proofread** — open each file and clean up OCR artifacts (OCRmyPDF + Tesseract produce the occasional garbled word). The importer supports a small Markdown subset: `## Section` → new page, `### Subheading` → `<h4>`, `**bold**`, `*italic*`, backtick `code`, bulleted / numbered lists, and pipe tables. Anything else passes through as plain text.
3. **Import** — `npm run import:rulebook-prose` converts the Markdown into the `RULEBOOK_PROSE` overlay at `scripts/rulebook-prose.generated.mjs`.
4. **Build** — `npm run build:compendia` rebuilds `packs/imported-rulebook/` from the overlay. No other pack is touched.

For a full refresh in one shot: `npm run prose:refresh`.

The new pack appears in Foundry's Compendium browser as **Imported Rulebook** alongside the existing **Rulebook Reference** pack (the paraphrased summary with factual tables). Both are JournalEntry packs; they do not conflict.

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
