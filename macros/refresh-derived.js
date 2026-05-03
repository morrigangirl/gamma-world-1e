// Refresh Derived Resources — recompute HP max / AC / encumbrance.
//
// The system computes derived state (HP max, AC, attribute mods, carry
// capacity, etc.) on every data prep cycle, but the persisted fields
// can drift after migrations or hand-edits. This macro forces a
// `refreshDerivedResources()` call so the persisted fields match what
// `prepareDerivedData()` produces.
//
// Pass `{adjustCurrent: true}` to also bump current HP up to max if
// max increased (e.g., after a level-up). Default is false.

(async () => {
  const actor = canvas.tokens.controlled[0]?.actor
            ?? Array.from(game.user.targets ?? [])[0]?.actor
            ?? null;
  if (!actor) {
    ui.notifications?.warn("Select or target a token first.");
    return;
  }
  await actor.refreshDerivedResources?.({ adjustCurrent: false });
  ui.notifications?.info(`Refreshed derived state on ${actor.name}.`);
})();
