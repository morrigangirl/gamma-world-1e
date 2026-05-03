// Bind Hemophilia Wound — set the Hemophilia bound flag manually.
//
// The Hemophilia bleed chat card includes a "Bind Wound" button that
// does the same thing. Use this macro when the chat card has scrolled
// off, or to bind a wound proactively before the next round's bleed
// tick fires. Auto-clears when HP returns to max.

(async () => {
  const actor = canvas.tokens.controlled[0]?.actor
            ?? Array.from(game.user.targets ?? [])[0]?.actor
            ?? null;
  if (!actor) {
    ui.notifications?.warn("Select or target a token first.");
    return;
  }
  const hasHemo = actor.items.some(
    (i) => i.type === "mutation" && i.name === "Hemophilia"
  );
  if (!hasHemo) {
    ui.notifications?.warn(`${actor.name} doesn't have Hemophilia.`);
    return;
  }
  await actor.setFlag("gamma-world-1e", "hemophiliaBound", true);
  ui.notifications?.info(`${actor.name}'s wound bound — bleed paused until HP returns to max.`);
})();
