import { autoRollCharacter } from "./chargen/chargen.mjs";
import { createAnimationApi } from "./animations.mjs";
import { buildActorDerived } from "./documents/actor.mjs";
import {
  applyDamageToTargets,
  applyHealingToTargets,
  grantRandomMutation,
  resolveHazardCard,
  resolveHazardDamage,
  resolveHazardLethal,
  resolveHazardMutation,
  rollAttack,
  rollDamageFromFlags,
  rollNaturalAttack,
  rollSave
} from "./dice.mjs";
import {
  buildMutationItemSource,
  resetMutationResources,
  tickMutationStateForActor,
  useMutation
} from "./mutations.mjs";
import { itemHasUseAction, useGear } from "./item-actions.mjs";
import {
  analyzeArtifact,
  interruptArtifactSession,
  openArtifactSession,
  openArtifactWorkflow,
  overrideArtifactAnalysis,
  registerArtifactSessionSocket,
  resetArtifactSession,
  revealArtifactOutcome,
  reassignArtifactOperator,
  rollArtifactSession,
  setArtifactSessionHelpers,
  startArtifactSession,
  tryArtifactSession,
  useArtifactItem
} from "./artifacts.mjs";
import { checkRouteEncounter, continueMoraleWatch, promptEncounterTerrain, rollMorale, rollReaction, rollSurprise, rollTerrainEncounter } from "./encounters.mjs";
import {
  applyIncomingDamage,
  applyTemporaryEffect,
  removeTemporaryEffect,
  syncActorProtectionState,
  tickActorStateForActor
} from "./effect-state.mjs";
import { syncGrantedItems } from "./equipment-rules.mjs";
import { actorIsRobot, cycleRobotMode, rechargeRobot, repairRobot, spendRobotPower, syncRobotImpairments } from "./robots.mjs";
import { beneficialMutationChoices, pickMutation } from "./tables/mutation-tables.mjs";

export function createSystemApi() {
  const animations = createAnimationApi();
  return {
    animations,
    autoRollCharacter,
    buildActorDerived,
    applyDamageToTargets,
    applyHealingToTargets,
    applyIncomingDamage,
    applyTemporaryEffect,
    removeTemporaryEffect,
    resolveHazardCard,
    resolveHazardDamage,
    resolveHazardLethal,
    resolveHazardMutation,
    grantRandomMutation,
    rollAttack,
    rollDamageFromFlags,
    rollNaturalAttack,
    rollSave,
    buildMutationItemSource,
    itemHasUseAction,
    resetMutationResources,
    syncActorProtectionState,
    syncGrantedItems,
    tickActorStateForActor,
    tickMutationStateForActor,
    useGear,
    useMutation,
    analyzeArtifact,
    interruptArtifactSession,
    openArtifactSession,
    openArtifactWorkflow,
    overrideArtifactAnalysis,
    registerArtifactSessionSocket,
    resetArtifactSession,
    revealArtifactOutcome,
    reassignArtifactOperator,
    rollArtifactSession,
    setArtifactSessionHelpers,
    startArtifactSession,
    tryArtifactSession,
    useArtifactItem,
    checkRouteEncounter,
    continueMoraleWatch,
    promptEncounterTerrain,
    rollMorale,
    rollReaction,
    rollSurprise,
    rollTerrainEncounter,
    actorIsRobot,
    cycleRobotMode,
    rechargeRobot,
    repairRobot,
    spendRobotPower,
    syncRobotImpairments,
    beneficialMutationChoices,
    pickMutation
  };
}
