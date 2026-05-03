// Quick Attack — roll the selected actor's first equipped weapon.
//
// Selection: prefers a controlled token; falls back to the first
// targeted token. Picks the first weapon with `system.equipped === true`.
//
// Routes through `game.gammaWorld.rollAttack`, which handles ammo /
// cell drain, the artifact-operation gate, fatigue lookup, and the
// full attack chat card.

(async () => {
  const actor = canvas.tokens.controlled[0]?.actor
            ?? Array.from(game.user.targets ?? [])[0]?.actor
            ?? null;
  if (!actor) {
    ui.notifications?.warn("Select or target a token first.");
    return;
  }
  const weapon = actor.items.find((item) => item.type === "weapon" && item.system.equipped);
  if (!weapon) {
    ui.notifications?.warn(`${actor.name} has no equipped weapons.`);
    return;
  }
  await game.gammaWorld.rollAttack(actor, weapon);
})();
