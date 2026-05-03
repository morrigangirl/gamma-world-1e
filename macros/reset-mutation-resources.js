// Reset Mutation Resources — refill uses + clear cooldowns.
//
// Equivalent to a manual long-rest for the selected actor's mutations.
// Useful when you want to skip the rest flow (e.g., narrative downtime
// or a session-start reset).

(async () => {
  const actor = canvas.tokens.controlled[0]?.actor
            ?? Array.from(game.user.targets ?? [])[0]?.actor
            ?? null;
  if (!actor) {
    ui.notifications?.warn("Select or target a token first.");
    return;
  }
  await game.gammaWorld.resetMutationResources(actor);
  ui.notifications?.info(`Mutation resources refreshed on ${actor.name}.`);
})();
