# Manual In-Game Test Plan — Cell-Drain System (0.13.x)

This walks through every batch of the cell-drain rollout from outside the unit-test layer. Run each batch's checks in a live Foundry world to verify behavior end-to-end. Tests within a batch are listed in the order they should be performed.

## Setup once

1. **Start fresh.** Open a Foundry world running this system at version ≥ 0.13.1. If your world was last saved before 0.13.0, the migration will fire on first load — wait for the GM-whispered chat lines:
   - `Migration 0.12.0: N power cells migrated...` (only if upgrading from < 0.12.0)
   - `Migration 0.13.1: N powered items converted; M cells installed; ...`
2. **Make a test actor.** Create a PC (or use an existing one). It just needs an inventory.
3. **Stock cells.** From the Equipment compendium, drag at least:
   - 4× Chemical Energy Cell
   - 4× Hydrogen Energy Cell
   - 4× Solar Energy Cell
   - 4× Atomic Energy Cell

   Confirm: each cell appears as its own inventory row with `qty 1 · 100% charge`. (If a stack of 3 appears, the 0.12.0 migration was supposed to split it — reload the world.)
4. **Open the cell sheets** for each type and confirm the **Artifact tab** reads `Charge: 100 %` (single percent input, not the legacy `current / max` pair).

---

## Batch 1 — Discrete-shot weapons (per-shot drain)

Tests one weapon end-to-end then quick spot-checks on the multi-cell case (Mark VII) and the fractional-drain case (Needler).

### Test 1.1 — Laser Pistol per-shot drain

| Step | Action | Expected |
|---|---|---|
| 1 | Drag a **Laser Pistol** from compendium onto the test actor. | Inventory row reads `qty 1 · ... · 10% / shot`. Item sheet's Artifact tab shows `Consumption: 10 % per shot` and an empty Installed Cells list. |
| 2 | Open the pistol's item sheet and click `Manage Power → Replace Cells` (or whichever button the artifact panel exposes for cell management). Choose Hydrogen. | A Hydrogen cell from inventory becomes flagged `installed in Laser Pistol`. The Installed Cells list on the pistol shows that cell at 100%. The cell still appears in actor inventory but with `installed in Laser Pistol` in its detail line. |
| 3 | Fire the pistol at any target via the actor's Attack section. | Attack rolls normally. After resolution, the installed cell drops to **90%**. No depletion notice yet. |
| 4 | Fire 9 more times (10 shots total). | After shot #10 the cell reads **0%**. A GM-whispered chat line posts: `Laser Pistol's Hydrogen Energy Cell is depleted.` |
| 5 | Try to fire one more shot. | The attack is **refused** with a "out of power" warning. No cell update, no attack roll. |
| 6 | Use `Manage Power → Replace Cells` to swap in a fresh Hydrogen cell. | The depleted cell stays in inventory at 0% (NOT auto-removed). The fresh cell is now installed at 100%. The pistol fires again normally. |

### Test 1.2 — Mark VII parallel cell drain

| Step | Action | Expected |
|---|---|---|
| 1 | Drag a **Mark VII Blaster Rifle** onto the actor. | Inventory: `qty 1 · ... · 20% / shot`. |
| 2 | Use `Replace Cells` to install **2 Hydrogen cells**. Both go in. | Installed Cells list shows two Hydrogen cells, each at 100%. |
| 3 | Fire one shot. | Both installed cells drop to **80%** (each drained by 20%). |
| 4 | Fire 4 more shots (5 total). | Both cells at **0%**. Two depletion notices post (one per cell). |
| 5 | Try to fire again. | Refused — out of power. |

This was the math-bug case before 0.13.1 (each cell would drain only 5%/shot → both at 75% after 5 shots). On 0.13.1+ it's correct.

### Test 1.3 — Needler fractional drain

| Step | Action | Expected |
|---|---|---|
| 1 | Drag a **Needler** onto the actor. | Inventory: `qty 1 · ... · 3.3% / shot`. |
| 2 | Drag in a clip of **Needler Darts** (poison or paralysis — whichever). The Needler's `ammoType` should accept it. | Two inventory rows: the Needler and the dart clip. |
| 3 | Install a Chemical cell. | Cell at 100% installed. |
| 4 | Fire 1 dart. | Cell at **97%** (one dart at 3.33% per dart, but integer-floored; accumulator carries 0.33). Dart count on the clip drops by 1. |
| 5 | Fire 2 more darts (3 total). | Cell at **91%** (3.33+0.33+3.33=6.99 → 6% drained, residue 0.99; +3.33=4.32 → 4% drained, residue 0.32. Wait — recheck the test. 3 ticks give 9.99% → 9% drained, residue 0.99. So cell at **91%**). |
| 6 | Continue firing until depletion (~30 darts on a fresh cell, ammo permitting). | Cell hits 0% on the 30th dart roughly. Depletion notice posts. The clip can still have darts left — the Needler refuses to fire because the **cell** is empty, not the ammo. |

### Test 1.4 — Energy weapon with both clip and cell

This is a sanity check on the ammo-gear double-drain guard. It only matters if you have a legacy clip in inventory (Energy Clip, Blaster Pack, Fusion Cell as ammo, etc.).

| Step | Action | Expected |
|---|---|---|
| 1 | Drag a **Laser Pistol** + an **Energy Clip (10 shots)** gear item onto the actor. | Both visible in inventory. |
| 2 | Install a Hydrogen cell in the pistol. | Cell at 100% installed. |
| 3 | Fire one shot. | The **cell** drains by 10%. The **Energy Clip's** rounds counter (legacy) is **unchanged**. |

The 0.13.0 ammo-gear guard ensures energy weapons with installed cells skip the ammo-clip path. The clip becomes inert inventory.

### Test 1.5 — Slug Thrower per-clip cell drain

The Slug Thrower drains its cell **on clip-load**, not per-slug. Cell drain is per **clip** (5 clips per cell).

| Step | Action | Expected |
|---|---|---|
| 1 | Drag a **Slug Thrower** + a clip of **Slug Thrower Rounds** onto the actor. | Both rows present. |
| 2 | Install a Hydrogen cell. | Cell at 100%. |
| 3 | Fire one slug. | Slug ammo decrements by 1. Cell **unchanged**. |
| 4 | Fire all 15 slugs from the clip until empty. | Slug ammo at 0/15. Cell still 100%. |
| 5 | Reload (load a fresh clip via the weapon's `Replace Cells` / clip-swap UI, if exposed; otherwise edit the clip's `system.ammo.rounds` back up). | Cell drops to **80%** on clip-load (one clip = 20% of cell). |

> Note: the explicit "load a clip → drain cell 20%" UI action is **not yet wired** as of 0.13.1. The Slug Thrower retains its `consumption: { unit: "clip", perUnit: 20 }` declaration but the trigger needs a follow-up reload-button feature. For now, this test is informational; expect the cell to NOT drain until a follow-up batch.

---

## Batch 2 — Time-based weapons (per-minute drain on combat-round advance)

Vibro Dagger, Vibro Blade, Stun Whip, Energy Mace, Micro Missile launcher.

### Test 2.1 — Vibro Dagger ignite/stow drain

| Step | Action | Expected |
|---|---|---|
| 1 | Drag a **Vibro Dagger** onto the actor. | Inventory row: `qty 1 · ... · 3.3% / minute`. Item sheet's Artifact tab shows `Consumption: 3.33 % per minute` and a new `Active: ☐ Ignite` checkbox. |
| 2 | Install a Hydrogen cell. | Cell at 100%. |
| 3 | Start a combat encounter with the actor as a combatant. Advance to round 1 (start combat). | No drain yet (combat just started, no round-advance hook fire). |
| 4 | Click the dagger's Ignite checkbox in its item sheet. The label switches to `Stow`. | `system.artifact.active` is now `true`. |
| 5 | Advance combat to round 2 (click "Next Turn" or "Next Round" until the round counter ticks). | Cell drops to **97%** (round 1 → 2 = 1 minute @ 3.33%, integer-floored to 3, residue 0.33). |
| 6 | Advance to round 4 total (3 rounds elapsed). | Cell at **91%** (residue progression: 0.33 → 3.66 → 0.66 → 3.99 → 0.99 → 4.32 → 0.32; cumulative 9). |
| 7 | Stow the dagger (uncheck Ignite). Advance several more rounds. | Cell stays at 91% — drain pauses while inactive. |
| 8 | Re-ignite. End combat (close the encounter). | Drain pauses out of combat. Cell stays where it is. |
| 9 | Start a new encounter. The dagger is still active. Advance 30 more rounds with full drain. | Cell hits **0%** somewhere around round 22-23 of the new encounter (since it started at 91%). Depletion notice posts. |

### Test 2.2 — Two ignited weapons drain independently

| Step | Action | Expected |
|---|---|---|
| 1 | Equip the same actor with a **Vibro Dagger** AND an **Energy Mace** (different cell types — Hydrogen and Chemical). | Both in inventory. |
| 2 | Install cells in each. | Hydrogen in Dagger, Chemical in Mace. |
| 3 | Ignite both. | Both `active: true`. |
| 4 | Run 5 combat rounds with the actor as a combatant. | Dagger's hydrogen cell drains by ~17% (5 × 3.33). Mace's chemical cell drains by ~33% (5 × 6.67). Both updates happen on each round-advance. |

### Test 2.3 — Inactive minute-drain weapon doesn't drain

| Step | Action | Expected |
|---|---|---|
| 1 | Vibro Dagger with installed cell, **NOT ignited**. | `system.artifact.active: false`. |
| 2 | Run several combat rounds. | Cell stays at 100%. No drain. |

---

## Batch 3 — Time-based wearables (per-hour drain on world-time advance)

Energy Cloak, Communications Sender, Portent Shield, Anti-grav Sled.

> Drain ticks fire on `Hooks.on("updateWorldTime")`. Foundry advances world time when `game.time.advance(seconds)` is called — usually by a long-rest button, a "fast-forward" macro, or the system's own combat encounter pacing.

To drive this manually, run in the chat console:
```
game.time.advance(3600 * N)
```
where `N` is the number of in-world hours to skip.

### Test 3.1 — Energy Cloak (12h, chemical)

| Step | Action | Expected |
|---|---|---|
| 1 | Drag an **Energy Cloak** onto the actor. Equip it. | `system.equipped: true`. Inventory: `... · 8.3% / hour`. |
| 2 | Install a Chemical cell. | Cell at 100%. |
| 3 | In the chat console: `game.time.advance(3600)` (1 hour). | Cell drops to **92%** (8% drained, residue 0.33). |
| 4 | `game.time.advance(3600 * 11)` (11 more hours, 12 total). | Cell at **0%**. Depletion notice posts once. |
| 5 | `game.time.advance(3600)` (one more hour with empty cell). | No further drain (cell already empty). No additional notice. |
| 6 | Unequip the cloak. `game.time.advance(3600 * 5)` (5 hours). | Cell stays at 0% (drain paused while unequipped). |

### Test 3.2 — Portent Shield (24h, 2 solar cells parallel)

This is the first multi-cell time-drain device.

| Step | Action | Expected |
|---|---|---|
| 1 | Drag a **Portent** onto the actor. Equip. | `qty 1 · ... · 4.2% / hour` per cell. |
| 2 | Install **2 Solar cells**. | Both at 100% in the Installed Cells list. |
| 3 | `game.time.advance(3600 * 12)` (12 hours). | **Both** cells drain by ~50% — to about 50% each. |
| 4 | `game.time.advance(3600 * 12)` (24 hours total). | Both cells at **0%**. Two depletion notices (one per cell). |

Pre-0.13.1 bug: each cell would only drain to ~75% after 24h. Post-fix: both at 0% as the rulebook says.

### Test 3.3 — Anti-grav Sled (100h, atomic)

| Step | Action | Expected |
|---|---|---|
| 1 | Drag an **Anti-grav Sled** onto the actor. Equip. | `1% / hour`. |
| 2 | Install an Atomic cell. | Cell at 100%. |
| 3 | `game.time.advance(3600 * 50)` (50 hours). | Cell at **50%**. |
| 4 | `game.time.advance(3600 * 50)` (100 hours total). | Cell at **0%**. Depletion notice. |

### Test 3.4 — Communications Sender accepts chemical OR solar

| Step | Action | Expected |
|---|---|---|
| 1 | **Comms Sender** + Chemical cell installed. Equip. Advance 12 hours. | Cell at 0%. |
| 2 | Eject the depleted chemical cell. Install a Solar cell. Advance 12 hours. | Solar cell at 0%. Same drain rate (8.33%/h) regardless of cell type. |

---

## Batch 4 — Powered armor (per-hour drain + inert state)

8 atomic-cell armors. World-time drives the drain. **When all installed cells hit 0% the armor goes "inert"**: AC drops, force field collapses, mobility upgrades stop.

### Test 4.1 — Powered Plate full lifecycle (50h, 1 atomic)

| Step | Action | Expected |
|---|---|---|
| 1 | Drag a **Powered Plate** onto the actor. **Note the actor's current AC**. | Item shows `2% / hour` and `cellSlots: 1`. |
| 2 | Install an Atomic cell. **Equip the armor**. | AC drops to the armor's `acValue` (typically a single-digit class for descending AC). Cell at 100% in Installed Cells list. |
| 3 | `game.time.advance(3600 * 25)` (25 hours). | Cell at **50%**. AC unchanged (armor still powered). |
| 4 | `game.time.advance(3600 * 25)` (50 hours total). | Cell at **0%**. Armor is now **inert**. AC reverts to base (10 if no other armor; whatever the actor's `combat.baseAc` says). Force field gone. Trait grants gone. |
| 5 | `game.time.advance(3600 * 5)` (5 more hours with depleted armor). | No further cell drain. AC stays at base. |
| 6 | Eject the depleted atomic cell. Install a fresh Atomic cell. | Armor is **no longer inert** — AC drops back to the powered value. Drain resumes on next world-time advance. |

### Test 4.2 — Powered Scout Armor (54h, 2 atomics parallel)

| Step | Action | Expected |
|---|---|---|
| 1 | Drag **Powered Scout Armor** onto the actor. Note the actor's flight speed (probably 0). | Item shows `1.85% / hour`, `cellSlots: 2`. |
| 2 | Install 2 Atomic cells. Equip. | Flight speed jumps to the armor's grant (anti-grav flight). Both cells at 100%. |
| 3 | `game.time.advance(3600 * 27)` (27 hours, half the lifespan). | Both cells at **50%**. Armor still powered. Flight unchanged. |
| 4 | `game.time.advance(3600 * 27)` (54 hours total). | Both cells at **0%**. Armor inert. Flight speed reverts to 0. AC reverts. |
| 5 | Eject one of the depleted cells, install a fresh one. | Armor still inert — needs **all** cells filled (or at least one charged?). With 1 fresh cell + 1 depleted, the inert check returns: at least one cell has charge > 0, so armor is **NOT inert**. Powered benefits return. The fresh cell will solo-power the armor for ~54 hours / 2 = ~27 hours of effective use (since the depleted cell drains at 1.85%/h alongside but provides nothing, while the fresh cell provides the actual power). |

> Note on step 5 nuance: the current implementation marks armor inert iff every installed cell is at 0%. A fresh cell + a 0% cell = armor functions, but BOTH cells drain at the per-cell rate per tick. The fresh cell hits 0% in ~54 hours of advance, whatever the depleted cell does. This may or may not match the rulebook; the rulebook says "requires both cells" but doesn't define mid-life mismatch.

### Test 4.3 — Powered Assault Armor (48h, 3 atomics)

| Step | Action | Expected |
|---|---|---|
| 1 | Drag **Powered Assault Armor**. | Item shows `2.08% / hour`, `cellSlots: 3`. |
| 2 | Install 3 Atomic cells. Equip. | All three cells at 100%. Flight + lift bonuses applied. |
| 3 | `game.time.advance(3600 * 24)`. | All three cells at **50%**. |
| 4 | `game.time.advance(3600 * 24)` (48 total). | All three at **0%**. Armor inert. |

### Test 4.4 — Inert armor loses force field

| Step | Action | Expected |
|---|---|---|
| 1 | Equip **Powered Battle Armor** with cells. Note: `system.field.mode === "full"` with 30 hp capacity. | Force field present. `actorHasForceField(actor)` returns true. |
| 2 | Drain the cells via `game.time.advance` until 0%. | Armor inert. `actorHasForceField` should now return **false** (filtered by `armorIsInert`). The 30hp barrier is gone. |
| 3 | Take damage in some way (or attack and look at damage application). | Damage hits HP directly — no field absorption. |
| 4 | Install fresh atomic cells. Force field returns. | Power restored, field active again. |

### Test 4.5 — Non-cell armor never goes inert

| Step | Action | Expected |
|---|---|---|
| 1 | Drag **Sheath Armor** or **Plastic Armor** (no power source) onto the actor. Equip. | These armors have no `consumption` block (or `unit: ""`). |
| 2 | Run any number of `game.time.advance` calls. | These armors **never** go inert — they don't depend on cells. AC stays. |

---

## Migration sanity (one-shot, on world load)

If you upgraded from 0.12.0 to 0.13.x, on first world load the GM should see (whispered):

```
Migration 0.13.1: N powered items converted; M cells installed; K items kept legacy counter (no matching cells on hand).
```

After this:
- Every actor-owned weapon/armor/gear that's in `CONSUMPTION_CATALOG` now has a `system.consumption` block with the correct rate.
- Items where the actor had matching cells in inventory have `installedCellIds` populated and the legacy `charges.current/max` zeroed.
- The cells claimed by the migration carry charge percentages reflecting the legacy shot ratio (a Laser Pistol that was at 7/10 shots → its installed cell is at 70%).

A second world load is a no-op (idempotency check matches catalog rate within 1e-6).

---

## Sanity checks across all batches

1. **Cell portability**: Pull a 47% Hydrogen cell out of one Laser Pistol. Drop it into a different Laser Pistol. The new pistol now has a 47%-charged cell — **the charge travels with the cell**, not with the device. Fire 4 shots → cell at 7%. Fire one more → depletion notice; cell at 0%; weapon refuses next fire.

2. **Quantity invariant**: Every cell in inventory should always be `qty 1`. If you ever see a cell with `qty 2+` in an actor's inventory, the 0.12.0 stack-split migration didn't fire. Reload the world.

3. **Unidentified cells**: If a cell on the actor sheet shows "Unknown Artifact" instead of its name and charge, the actor hasn't analyzed it yet. The charge is still tracked under the hood — running the figure-out workflow reveals the type and current %.

4. **Migration didn't claim cells you wanted**: If the 0.13.1 migration left a weapon with its legacy `charges` counter intact (the chat summary will mention "K items kept legacy counter"), it's because the actor didn't have matching cells in inventory at migration time. Drop a fresh cell on them and use the weapon's `Replace Cells` button to install it manually. The new cell-drain path activates immediately.

5. **Atomic cells aren't rechargeable**: The Energy Cell Charger (a tool item) doesn't yet have a workflow wired up (deferred to a sub-plan). When it lands, dropping a depleted Atomic cell on the charger should refuse with "Atomic cells are not rechargeable — swap fuel cylinders instead."

---

## What's NOT yet wired (for awareness)

- **Energy Cell Charger workflow** — UI + per-cell-type recharge time. Deferred to a separate sub-plan.
- **Solar passive recharge** — Solar cells should regain charge in daylight. Not implemented.
- **Disuse drain** — Chemical/solar cells should lose 1d6 years' worth of charge when sitting in storage. Not implemented.
- **Slug Thrower clip-reload trigger** — schema is set up (`unit: "clip"`, `perUnit: 20`), but no UI button drives the drain on clip-swap.
- **Vehicles** — Hover Car, Flit Car, Bubble Car, Environmental Car. None have `consumption` blocks. Their hybrid drain models (water + atomic, mode-switching, solar+atomic backup) need their own batch.
- **Powered armor built-in weapons** — Powered Scout / Battle / Attack / Assault armor have built-in lasers and missile racks that should parasitically drain the armor's cell pool. Currently those built-in items consume nothing.

---

## If something breaks

- **Tests pass, in-game broken**: Most likely an actor-side state issue. Check `actor.gw` (the derived data) in the browser console: `_token.actor.gw.ac` should reflect the powered-armor AC when armor is active, base AC when inert.
- **Migration didn't run**: Check `game.settings.get("gamma-world-1e", "schemaVersion")` — should be `"0.13.1"`. If it's `"0.13.0"` or earlier, force a re-run by setting it back: `game.settings.set("gamma-world-1e", "schemaVersion", "0.12.0")` then reload.
- **Cell charge not draining**: Check `item.system.consumption.perUnit` (should be > 0) and `item.system.artifact.power.installedCellIds` (should be a non-empty array of valid UUIDs that point to cell items still on the actor).
- **Mark VII still drains 5%/shot**: The 0.13.0 → 0.13.1 migration should have rewritten this. Confirm `schemaVersion === "0.13.1"`. If still wrong, manually edit the weapon's `system.consumption.perUnit` to 20.
