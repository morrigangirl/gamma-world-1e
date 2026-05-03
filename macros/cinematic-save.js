// Cinematic Save — open the Cinematic Roll Request composer.
//
// GM-only. Opens the composer dialog where you pick the actors, save
// type, intensity, and outcome handling. Each chosen player sees a
// banner on their screen and rolls inline; the composer aggregates
// the result into a single chat card.

(async () => {
  if (!game.user.isGM) {
    ui.notifications?.warn("Cinematic roll requests are GM-only.");
    return;
  }
  await game.gammaWorld.cinematic.openComposer();
})();
