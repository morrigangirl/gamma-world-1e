// Roll Reaction — NPC reaction roll for the first targeted token.
//
// The PC making the social check should be controlled; the NPC being
// reacted to should be targeted. The result includes the charisma
// adjustment from the controlled actor and posts a chat card with the
// reaction band (hostile / unfriendly / neutral / friendly / helpful).

(async () => {
  const pc = canvas.tokens.controlled[0]?.actor;
  const npc = Array.from(game.user.targets ?? [])[0]?.actor;
  if (!pc) {
    ui.notifications?.warn("Control a PC token to provide the charisma adjustment.");
    return;
  }
  if (!npc) {
    ui.notifications?.warn("Target an NPC token to roll their reaction.");
    return;
  }
  await game.gammaWorld.rollReaction(npc, pc);
})();
