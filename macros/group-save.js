// Group Save — prompt for a save type, roll it for every targeted token.
//
// Use case: a hazard hits the whole party. Target everyone in the AOE,
// run this macro, pick the save type from the dialog, and the system
// rolls a save for each one with proper modifiers (Heightened
// Constitution, Will Force, Bacterial Symbiosis, No Resistance to
// Poison, etc.).

(async () => {
  const targets = Array.from(game.user.targets ?? []);
  if (!targets.length) {
    ui.notifications?.warn("Target one or more tokens first.");
    return;
  }

  const choice = await new Promise((resolve) => {
    new Dialog({
      title: "Group Save",
      content: `<p>Roll which save for ${targets.length} target(s)?</p>`,
      buttons: {
        mental:    { label: "Mental",    callback: () => resolve("mental") },
        radiation: { label: "Radiation", callback: () => resolve("radiation") },
        poison:    { label: "Poison",    callback: () => resolve("poison") },
        cancel:    { label: "Cancel",    callback: () => resolve(null) }
      },
      default: "mental",
      close: () => resolve(null)
    }).render(true);
  });

  if (!choice) return;
  for (const t of targets) {
    if (!t.actor) continue;
    await game.gammaWorld.rollSave(t.actor, choice);
  }
})();
