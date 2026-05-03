# Gamma World 1e — Migration Guide

The system runs `migrateWorld()` on the `ready` hook for every GM client. It
compares the world's stored `schemaVersion` against `game.system.version` and
runs all pending migrations in order. **Players don't trigger migrations** —
only the GM does — so loading an older world from a player client is safe.

This guide covers the user-facing changes per version, what to expect when an
older world boots, and the rare cases where manual cleanup is helpful.

---

## How it works

| Phase | What happens |
|---|---|
| 1. Settings register | Every world setting is registered, including the hidden `schemaVersion` (default `0.0.0`). New settings get their default value when a world has never seen them. |
| 2. Compare versions | If `schemaVersion === game.system.version`, the migration runner returns immediately. |
| 3. Per-item pass | Walk `game.items.contents` and run `migrateItem` on each. |
| 4. Per-actor pass | Walk `game.actors.contents`. For each actor: migrate the actor doc itself, then every embedded item, then any inline-ammo / weapon-rename / mutation-effect / temp-effect / action-types passes. |
| 5. World-level passes | Power-cell percent migration (0.12), consumption-rule migration (0.13), ammunition refactor (0.14.0), Hit-Dice backfill (0.14.1), cell heal pass (0.14.3), and so on. |
| 6. Bump `schemaVersion` | Save the new system version so subsequent loads skip everything above. |

The migration is **idempotent** for any given version — re-running a pass that's
already done is a no-op. If an upgrade goes wrong, you can manually reset
`schemaVersion` back to `"0.0.0"` (Settings → Edit Configuration → schemaVersion)
and reload to re-trigger.

---

## Per-version notes

### 0.5.0 — schema scaffolding

- Weapons gain a `category` (pistol / rifle / etc.) used by the artifact
  identification flow. Existing weapons get `category` inferred from name.
- Gear gains `subtype` (container, ration, communications, vehicle, etc.) —
  inferred similarly.
- Inline weapon-ammo counters (`weapon.system.ammo.rounds`) become real ammo
  gear items on each owning actor. The legacy field is zeroed but kept on the
  schema for one cycle.
- The retired "Broadcast Power Station" item is deleted from world inventories.
- Schema fields added to actors: `social.languages / literacy / relatives /
  homeRegion / reputation`. Existing actors get sane defaults.

### 0.6.0 → 0.7.0 — settings consolidation

- `autoRollNpcDamage` (boolean) is replaced by `npcDamageMode`
  (`none | onHit | always`). Worlds upgrading from <0.7.0 see their old
  setting translated: true → `always`, false → `none`. Fresh worlds default
  to `onHit`.
- The deprecated `protection.*Immune` booleans on armor (`blackRayImmune`,
  `radiationImmune`, etc.) are lifted into the new `system.traits.grantsImmunity`
  Set. The booleans stay readable for one deprecation cycle.

### 0.8.0 — skills map

- Actors gain a per-skill schema with `ability`, `proficient`, and `bonus`
  fields (24 skills across Field / Tech / Combat / Lore / Social / Medical
  groups). The migrator backfills any missing keys with defaults.
- Existing actors keep their old proficiencies if any. Skill bonuses default
  to 0; mutations like Scientific Genius write into the new `bonus` field via
  Active Effects.

### 0.8.1 — weapon renames

- Older weapon names are unified to their canonical forms (Mark V Blaster,
  Needler, Slug Thrower, etc.). The Sling-Bullets weapon is deleted; sling
  ammo lives as gear instead.
- Each affected actor has its weapons renamed in place; existing equipped /
  ammo references are updated.

### 0.8.3 — Cinematic Roll Request

- Adds the `cinematic.*` API plus 3 sound-cue settings. No actor-data changes;
  no manual cleanup needed.

### 0.8.4 — Active-Effect mutation backfill

- A subset of mutations migrate from inline flag-driven changes to declarative
  Active Effects on the mutation Item. Players see the same outcomes, but the
  Effects panel on the actor sheet now lists each contribution.
- The pilot covers Tangle Vines, Heightened Strength, and the variant flow for
  Will Force / Mental Defense Shield. Subsequent versions extend the list.

### 0.8.6 — Genius Capability split

- The single "Genius Capability" mutation is retired in favor of three
  standalone mutations: **Military Genius**, **Economic Genius**,
  **Scientific Genius**. Each carries its own Active Effects.
- An actor with Genius Capability gets it replaced by the variant they had
  rolled. The replacement is one-shot per actor; subsequent migrations skip.

### 0.9.0 — temp-effects → Active Effects

- The legacy `flags.gamma-world-1e.temporaryEffects` array migrates into real
  Active Effect documents on the actor. Every effect retains its label,
  source, and remaining duration.
- A one-shot GM whisper posts in chat after migration: "Tier 3 migration: N
  temporary effect(s) moved to the new Effects panel."

### 0.10.0 — action-types tagging

- Every Item gains a `system.actionTypes` array (e.g., `["attack", "damage",
  "save"]`). Drives sheet section grouping and the action filter UI. Inferred
  from each item's existing `rule.action` mode.

### 0.11.0 — metric movement

- Actor `system.details.movement` and armor `system.mobility.flight / jump`
  switch from imperial-style legacy units to meters-per-round. The migrator
  divides legacy values by 12 to recover the GW1e canon (10 m/round = 120
  legacy units).
- The grid setting changes from feet to meters. Existing scenes keep their
  per-grid-square distance; the labelling changes.

### 0.12.0 — power-cell percent

- Power cells switch from 1/1 binary tokens to integer percent charge
  (`charges.current 0–100`).
- Stacks of cells are split into individual items so each carries its own
  charge level. Drift in charge between previously-bundled cells is preserved.
- A one-shot GM whisper posts in chat after migration with the migrated and
  split counts.

### 0.13.0 — declarative consumption

- Cell-driven items get a `system.consumption.{unit, perUnit}` rule (one of
  `shot`, `clip`, `minute`, `hour`, `day` with a `perUnit` percent). Drives
  the new per-tick drain pipeline.
- The migrator infers `unit` and `perUnit` from each item's existing power
  schema. Items it can't classify keep their legacy `chargesPerUnit` for one
  cycle.

### 0.13.1 / 0.13.2 — drain corrections

- 0.13.1 re-runs the per-cell drain divisor with the corrected per-shot
  formula (the prior pass under-charged multi-cell weapons by one division).
- 0.13.2 scrubs bogus self-pointing `installedIn` flags on cells (a 0.12.0
  edge case).

### 0.14.0 — ammunition refactor

- Bundle gear like "Arrows (bundle of 20)" splits into per-unit gear with
  `quantity = 20`. Slug names are unified (Crossbow Bolt, Gyrojet Slug, etc.).
- Stale references on weapons whose ammo was renamed are updated. Sample
  actors are re-validated against the new names.

### 0.14.1 — Hit Dice resource

- Each character actor gets a `system.resources.hitDice = { value, max }` pair
  initialized to `{ value: level, max: level }`. Spendable on Short Rest;
  refilled on Long Rest.

### 0.14.3 — heal cell-driven items

- One-shot heal pass for cell-driven items that shipped from the studio with
  zero charges. After this pass, every studio item that should ship with a
  cell installed has one.

### 0.14.x feature toggles

A series of new settings landed in 0.14.x; defaults are picked so they're
useful out of the gate but every one is configurable. Notable additions:

| Version | Setting | Default | What it does |
|---|---|---|---|
| 0.14.1 | `restAdvancesWorldTime` | true | Short / Long Rest advance world time so daily heals tick. |
| 0.14.6 | `encounterCloseSummary` | true | GM-whisper card on combat end with XP + loot buttons. |
| 0.14.6 | `autoTickFatigue` | true | Increment fatigue.round per combatant on round change. |
| 0.14.6 | `resetFatigueOnCombatEnd` | true | Clear fatigue on combat-delete. |
| 0.14.8 | `damageMultiplierAutoPick` | true | Pre-select the multiplier pill from target traits. |
| 0.14.9 | `travelLegHours` | 4 | Hours per travel leg (Travel mode). |
| 0.14.17 | `bloodiedThreshold` | 0.5 | Auto-Bloodied at HP fraction ≤ this. |
| 0.14.17 | `autoRollNewCombatantInitiative` | true | Auto-roll initiative for new mid-combat combatants. |
| 0.14.17 | `combatRoundSummary` | true | GM-whisper round summary card. |
| 0.14.17 | `tokenFatigueOverlay` | true | "F-N" badge on tokens with positive fatigue. |

All world-scoped settings live under **Settings → System Settings → Gamma
World Configuration** (one menu per system; no clutter in the default panel).

---

## Loading an older world — what to expect

1. **Open as GM.** Player clients won't run the migration — Foundry only
   exposes pre-`ready` migration to the GM client.
2. **Watch chat for one-shot summary cards.** If 0.9.0 (temp effects) or
   0.12.0 (power cells) migrations fired, you'll see whisper notes. These
   are informational only.
3. **Open a few actors.** Verify HP / AC / movement match what they were.
   Mutations should still display in the Mutations tab; Active Effects
   should populate the Effects tab for migrated mutations.
4. **Check power-cell stacks.** If you had stacks of identical cells, they
   may now appear as multiple individual items with the same name and
   independent charge percentages — that's correct.
5. **Verify equipped weapons still fire.** Energy weapons should retain
   their installed cells; ammo-bearing weapons should find their renamed
   ammo gear.

If anything looks wrong, the safest recovery is:

1. Quit Foundry without saving an active scene.
2. Open the world in `--no-update` mode (or roll back the system version in
   the manifest).
3. Restore from your latest backup.

---

## When to bump `schemaVersion` manually

You generally shouldn't. The two cases where it's useful:

- **Re-trigger a partial migration** after a failed run. Set to `"0.0.0"`,
  reload, and the full chain runs again. All passes are idempotent so this
  is safe.
- **Test a migration on a copy world.** Useful when authoring a new
  migration locally.

Set via the F12 console:

```js
await game.settings.set("gamma-world-1e", "schemaVersion", "0.0.0");
location.reload();
```

---

## Reporting migration issues

Migrations log to the browser console with the `gamma-world-1e |` prefix.
When filing a bug report, include:

1. The console log lines from the F12 panel.
2. The world's prior version (visible in `system.json` if you have a
   backup).
3. The actor/item that misbehaves, exported via right-click → Export.

Backups before a major upgrade are cheap insurance — run **Foundry's**
Backup tool from the Setup screen before pulling a new system version.
