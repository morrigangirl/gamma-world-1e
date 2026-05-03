# Sample Macros

A small library of ready-to-paste Foundry macros that exercise the system
API documented in [`docs/api-guide.md`](../docs/api-guide.md). Drop any of
these into a Foundry script macro (Macros → Create New Macro → type:
script) and bind a hotbar slot to it.

Every macro defaults to the **selected token's actor** and falls back to
**the first targeted token** when no selection exists. Run as the GM unless
the macro is annotated otherwise.

## Quick reference

| Macro | What it does |
|---|---|
| [`quick-attack.js`](quick-attack.js) | Roll the selected actor's first equipped weapon. |
| [`group-save.js`](group-save.js) | Prompt for a save type, roll it for every targeted token. |
| [`grant-random-mutation.js`](grant-random-mutation.js) | Grant a random beneficial mutation to the selected actor. |
| [`reset-mutation-resources.js`](reset-mutation-resources.js) | Refill uses + clear cooldowns on the selected actor (manual long-rest). |
| [`bind-hemophilia-wound.js`](bind-hemophilia-wound.js) | Set the Hemophilia bound flag (alternate to the chat-card button). |
| [`roll-reaction.js`](roll-reaction.js) | NPC reaction roll for the first targeted token. |
| [`cinematic-save.js`](cinematic-save.js) | Open the Cinematic Roll Request composer pre-filled for a save. |
| [`refresh-derived.js`](refresh-derived.js) | Force `refreshDerivedResources()` on the selected actor (recompute HP max / AC / encumbrance). |

## Conventions

Each macro starts with a `selectedActor()` helper:

```js
function selectedActor() {
  return canvas.tokens.controlled[0]?.actor
      ?? Array.from(game.user.targets ?? [])[0]?.actor
      ?? null;
}
```

If you'd rather hardcode an actor by name or id, replace the body with
`game.actors.getName("Sadie")` or similar.
