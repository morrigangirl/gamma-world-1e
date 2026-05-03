# Gamma World 1e — System API (`game.gammaWorld`)

The system exposes a public API surface so macros and external modules can drive
combat, healing, mutation use, artifact analysis, encounter generation, and
robot-power flows without re-implementing the rules. Every function is also
mirrored on `game.system.api` for parity with newer Foundry conventions.

```js
// Both forms are equivalent.
const api = game.gammaWorld;
const api2 = game.system.api;
```

The full list lives in `module/api.mjs::createSystemApi()`. This document
groups it by use-case with worked examples.

---

## 1. Combat — attacks, saves, damage

| Call | Returns | Notes |
|---|---|---|
| `api.rollAttack(actor, weapon, options?)` | `Promise<roll-result>` | Routes through the artifact-operation gate, ammo / cell drain, fatigue lookup, and posts the attack chat card. |
| `api.rollNaturalAttack(actor, options?)` | `Promise<roll-result>` | Same pipeline for the actor's `combat.naturalAttack`. |
| `api.rollSave(actor, type)` | `Promise<roll-result>` | `type ∈ {"mental", "radiation", "poison"}`. Honors save-attempt mutations (Heightened Brain Talent / Dual Brain), Heightened Constitution, Will Force, etc. |
| `api.rollDamageFromFlags(message)` | `Promise<roll-result>` | Re-rolls damage from a saved attack-card flag — useful for ApplyDamage macros that re-derive intensity. |
| `api.applyDamageToTargets(targets, amount, options?)` | `Promise<void>` | Uses the saved `target.gw.damage*` traits to multiply per damage type when `options.type` is set. |
| `api.applyHealingToTargets(targets, amount)` | `Promise<void>` | Caps at max HP per target. |
| `api.applyIncomingDamage(actor, payload)` | `Promise<{applied, type}>` | Lower-level: bypasses targeting and routes a single damage payload through the trait pipeline. |

```js
// Macro: roll the selected actor's first equipped weapon
const actor = canvas.tokens.controlled[0]?.actor;
const weapon = actor?.items.find((i) => i.type === "weapon" && i.system.equipped);
if (actor && weapon) await game.gammaWorld.rollAttack(actor, weapon);
```

```js
// Macro: poison save for everyone targeted
for (const t of game.user.targets) await game.gammaWorld.rollSave(t.actor, "poison");
```

---

## 2. Mutations

| Call | Returns | Notes |
|---|---|---|
| `api.useMutation(actor, item)` | `Promise<boolean>` | Routes to the action handler implied by the mutation rule. Returns false when usage is depleted. |
| `api.tickMutationStateForActor(actor)` | `Promise<void>` | Advances `cooldown.current` and `activation.remaining` once. The combat-round hook calls this; macros usually don't need to. |
| `api.resetMutationResources(actor)` | `Promise<void>` | Refills uses + clears cooldowns. Long-rest hooks call this. |
| `api.buildMutationItemSource(definition, options?)` | `object` | Used by chargen and the GM tool to mint a new mutation Item document from a row in `tables/mutation-data.mjs`. |
| `api.grantRandomMutation(actor, options?)` | `Promise<Item>` | Roll a random beneficial mutation onto the actor. |
| `api.beneficialMutationChoices()` | `string[]` | List of beneficial mutation names from the table. |
| `api.pickMutation(category, percentile)` | `definition` | Direct lookup against the mutation-data table. |

```js
// Macro: hand out a random mutation to the selected token's actor
const actor = canvas.tokens.controlled[0]?.actor;
if (actor) await game.gammaWorld.grantRandomMutation(actor);
```

---

## 3. Artifacts

The artifact session API is broad because the GM-driven workflow has many
phases (analyze → roll-against-chart → reveal → apply outcome).

| Call | Notes |
|---|---|
| `api.useArtifactItem(actor, item)` | The single entry the sheet's Use button calls. Routes to analyze if unidentified, refuses on malfunction or missing power, otherwise consumes a charge and proceeds to the attack/use flow. |
| `api.analyzeArtifact(actor, item)` | Open the Analyze workflow on an unidentified item. |
| `api.openArtifactSession(actor, item)` | Start a fresh analysis session. |
| `api.rollArtifactSession(sessionId)` | Roll the current step of an open session. |
| `api.tryArtifactSession(sessionId)` | Combined open + roll for "one-shot" GM use. |
| `api.startArtifactSession(actor, item, options?)` | Lower-level session creator with explicit operator / chart / helpers. |
| `api.setArtifactSessionHelpers(sessionId, helperCount)` | Mid-session helper change. |
| `api.reassignArtifactOperator(sessionId, actorId)` | Mid-session operator handoff. |
| `api.revealArtifactOutcome(sessionId)` | Final reveal step. |
| `api.overrideArtifactAnalysis(actor, item, identified, operationKnown)` | GM tool to skip the workflow and mark known. |
| `api.resetArtifactSession(actor, item)` | Clear `attempts`, malfunction, etc., for a "second-attempt" flow. |
| `api.interruptArtifactSession(sessionId, reason?)` | Cancel an in-progress session. |
| `api.openArtifactWorkflow(actor, item)` | Open the GM analysis UI without starting a session. |

---

## 4. Encounters

| Call | Returns | Notes |
|---|---|---|
| `api.checkRouteEncounter(routeKey, options?)` | `Promise<encounter|null>` | Used by Travel mode (0.14.9). |
| `api.promptEncounterTerrain()` | `Promise<terrainKey>` | Dialog: pick the active terrain. |
| `api.rollTerrainEncounter(terrainKey)` | `Promise<encounter>` | Pulls from the terrain's encounter table. |
| `api.rollReaction(actor, target?)` | `Promise<reaction>` | NPC reaction roll with charisma adjustment. |
| `api.rollMorale(actor)` | `Promise<{passed, total, target}>` | Morale check. |
| `api.continueMoraleWatch(combatId)` | `Promise<void>` | Re-check morale at round-edge. |
| `api.rollSurprise(actorIds)` | `Promise<{surprised, byActor}>` | Surprise round resolution. |

---

## 5. Character creation

| Call | Notes |
|---|---|
| `api.autoRollCharacter(actor, options?)` | Walks chargen end-to-end: rolls attributes, mutations, gear, and writes them onto the actor. |
| `api.rollSkill(actor, skillKey)` | Skill check; reads `system.skills.<key>.bonus` (Scientific Genius, Heightened Touch, etc.). |
| `api.computeSkillModifier(actor, skillKey)` | Pure: returns the modifier without rolling. |
| `api.countProficientSkills(actor)` | Helper for the proficiency cap. |

---

## 6. Robots

| Call | Notes |
|---|---|
| `api.actorIsRobot(actor)` | Predicate. |
| `api.cycleRobotMode(actor)` | Cycles `inactive → programmed → wild → controlled → inactive`. |
| `api.rechargeRobot(actor)` | Restore `power.current` to `power.max`. |
| `api.repairRobot(actor, options?)` | Heal HP via repair flow (uses the actor's repairDifficulty). |
| `api.spendRobotPower(actor, amount, options?)` | Debit `power.current`; returns false when insufficient. |
| `api.syncRobotImpairments(actor)` | Recompute robot-specific derived state. |

---

## 7. Conditions, hazards, and effect state

| Call | Notes |
|---|---|
| `api.applyTemporaryEffect(actor, payload)` | Shorthand for the AE / legacy temp-effect pipeline. |
| `api.removeTemporaryEffect(actor, id)` | Clear by id. |
| `api.tickActorStateForActor(actor)` | One round-tick for status durations. |
| `api.syncActorProtectionState(actor)` | Refresh equipment-driven AE protections. |
| `api.applyRadiationSickness(actor, options?)` | Set the radiation-sickness flag with an expiry. |
| `api.applyCatastrophicRadiation(actor, options?)` | Set the catastrophic-radiation flag with onset + tick state. |
| `api.clearRadiationSickness(actor)` | Remove flag. |
| `api.clearCatastrophicRadiation(actor)` | Remove flag. |
| `api.getRadiationCondition(actor)` | Return `{ sickness, catastrophic }` snapshot. |
| `api.resolveHazardCard(payload)` | Render a hazard chat card. |
| `api.resolveHazardDamage(payload)` | Run the hazard's damage lookup. |
| `api.resolveHazardLethal(payload)` | Run the lethal-side branch. |
| `api.resolveHazardMutation(payload)` | Hand a hazard-rolled mutation to a target actor. |

---

## 8. Equipment and inventory

| Call | Notes |
|---|---|
| `api.useGear(actor, item)` | Single entry for any gear's Use action (medi-kit, comms, anti-grav sled, etc.). |
| `api.itemHasUseAction(item)` | Predicate — does this gear have an attached action? |
| `api.syncGrantedItems(actor)` | Recompute auto-granted items from equipped armor / mutations. |
| `api.buildActorDerived(actor)` | Re-runs the derived-state pipeline (HP, AC, encumbrance, traits) without persisting. |

---

## 9. Cinematic Roll Request (0.8.3)

```js
// Macro: open the GM's cinematic composer
await game.gammaWorld.cinematic.openComposer();

// Programmatic: request a save from a specific actor
await game.gammaWorld.cinematic.requestRoll({
  actorIds: [actor.id],
  rollType: "save",
  saveType: "mental",
  intensity: 14
});

// Read the live banner state (null when none active)
const banner = game.gammaWorld.cinematic.getCurrentBanner();
```

| Call | Notes |
|---|---|
| `api.cinematic.openComposer()` | Open the composer dialog (GM only). |
| `api.cinematic.requestRoll(options)` | Send a roll request to one or more clients with a banner. |
| `api.cinematic.getCurrentBanner()` | Snapshot of the live banner; null when no banner is active. |

---

## 10. Animations

```js
// Macro: play the laser-fire animation between two tokens
const [src, tgt] = canvas.tokens.controlled;
await game.gammaWorld.animations.fireBeam(src, tgt, { color: "red" });
```

The full animation API is exposed under `api.animations` (registered in
`module/animations.mjs::createAnimationApi`). Common helpers:
- `fireBeam(source, target, options)` — energy weapon beam
- `fireProjectile(source, target, options)` — bullet / arrow
- `playOnTarget(target, animKey)` — apply a named animation overlay
- `cleanupExpired()` — manual cleanup of expired persistent effects

---

## 11. Conventions

- **Sync option**: any update routed through the API can pass
  `{ gammaWorldSync: true }` in update options to bypass `_preUpdate`
  side-effects (HP clamp, dead/bloodied auto-toggle, level-up HD
  delta, etc.). Useful when you're recalculating derived state
  inside a hook and don't want re-entry.
- **Hooks**: the system fires veto-able and announce-only hooks via
  `module/hook-surface.mjs`. Names live in the `HOOK` constant and
  follow `gammaWorld.v1.<event>`. See `module/hooks.mjs` for the
  registered consumers.
- **Settings**: read via `game.settings.get("gamma-world-1e", "<key>")`.
  All keys are documented in the in-game GW1e Configuration window
  (Settings → System Settings → Gamma World Configuration).
