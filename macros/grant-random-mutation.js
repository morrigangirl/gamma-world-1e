// Grant Random Mutation — give the selected actor a random beneficial mutation.
//
// Selection: controlled token preferred; falls back to first target.
// Uses `game.gammaWorld.grantRandomMutation`, which rolls against the
// beneficial-mutation table and creates a real mutation Item document
// on the actor (with any variant pre-rolled by the preCreateItem hook).

(async () => {
  const actor = canvas.tokens.controlled[0]?.actor
            ?? Array.from(game.user.targets ?? [])[0]?.actor
            ?? null;
  if (!actor) {
    ui.notifications?.warn("Select or target a token first.");
    return;
  }
  const mutation = await game.gammaWorld.grantRandomMutation(actor);
  if (mutation) {
    ui.notifications?.info(`${actor.name} gained: ${mutation.name}`);
  }
})();
