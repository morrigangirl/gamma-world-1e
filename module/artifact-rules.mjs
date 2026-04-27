import { artifactFunctionChance } from "./tables/artifact-tables.mjs";
import { normalizeArtifactChartId } from "./tables/artifact-flowcharts.mjs";
import { SYSTEM_ID } from "./config.mjs";

export const PSH_RELIABLE_TECH_SETTING = "pshTechReliable";

/**
 * Homebrew: once a Pure Strain Human has figured out an Ancient artifact
 * (operation known), further uses of that artifact by that actor bypass the
 * condition / malfunction roll and succeed. Gated by the world setting
 * `pshTechReliable` (default true).
 */
export function pshReliableTechActive() {
  try {
    const game = globalThis.game;
    if (!game?.settings?.get) return true;
    return !!game.settings.get(SYSTEM_ID, PSH_RELIABLE_TECH_SETTING);
  } catch (_error) {
    return true;
  }
}

export function pshReliableTechApplies(actor, item) {
  if (!pshReliableTechActive()) return false;
  if (actor?.system?.details?.type !== "psh") return false;
  return artifactOperationKnown(item);
}

function mutationEntries(actor) {
  const items = actor?.items;
  if (!items) return [];
  if (Array.isArray(items)) return items.filter((item) => item?.type === "mutation");
  if (typeof items.filter === "function") return items.filter((item) => item?.type === "mutation");
  return [];
}

function mutationEnabled(item) {
  return item?.system?.activation?.enabled !== false;
}

export function artifactData(item) {
  return item?.system?.artifact ?? {};
}

export function itemIsArtifact(item) {
  return !!artifactData(item).isArtifact;
}

function defaultUnknownArtifactLabel() {
  return globalThis.game?.i18n?.localize?.("GAMMA_WORLD.Artifact.UnknownName") ?? "Unknown Artifact";
}

export function artifactIdentityKnown(item) {
  if (!itemIsArtifact(item)) return true;
  return artifactOperationKnown(item);
}

export function artifactOperationKnown(item) {
  if (!itemIsArtifact(item)) return true;
  return !!artifactData(item).operationKnown;
}

export function artifactDisplayName(item, { unknownLabel } = {}) {
  if (artifactIdentityKnown(item)) return String(item?.name ?? "");
  return String(unknownLabel ?? defaultUnknownArtifactLabel());
}

export function artifactIntelligenceModifier(score) {
  const value = Math.round(Number(score) || 0);
  if (value > 15) return -(value - 15);
  if (value < 7) return 7 - value;
  return 0;
}

export function clampArtifactUseRoll(total) {
  return Math.max(1, Math.min(10, Math.round(Number(total) || 0)));
}

/**
 * 0.8.6 — the raw ActiveEffect + temp-effect contribution to the artifact
 * analysis roll modifier. Scientific Genius's AE adds -1 to
 * `gw.artifactAnalysisBonus`; applyTemporaryDerivedModifiers can stack
 * further temp contributions. `artifactUseProfile` stays switch-only so
 * the internal buildActorDerived call site (where `actor.gw` is still
 * being computed) isn't fooled by a stale value; external callers fold
 * this bonus in via `artifactUseProfileForChart` / `artifactUseModifier`.
 */
export function artifactAnalysisBonusFromDerived(actor) {
  return Math.round(Number(actor?.gw?.artifactAnalysisBonus ?? 0)) || 0;
}

export function artifactUseProfile(actor) {
  const intelligence = Math.round(Number(actor?.system?.attributes?.in?.value ?? 0));
  const baseModifier = artifactIntelligenceModifier(intelligence);
  const profile = {
    intelligence,
    baseModifier,
    modifier: baseModifier,
    speedMultiplier: 1,
    instantCharts: new Set(),
    notes: []
  };

  for (const item of mutationEntries(actor)) {
    const name = String(item.name ?? "");
    const enabled = mutationEnabled(item);
    if (!enabled) continue;

    switch (name) {
      case "Dual Brain":
        profile.modifier -= 1;
        profile.notes.push("Dual Brain");
        break;
      // "Scientific Genius" and the scientific variant of the retired
      // "Genius Capability" migrated to ActiveEffect in 0.8.6. Their -1
      // contribution flows through `actor.gw.artifactAnalysisBonus` and
      // is folded in by `artifactUseProfileForChart` /
      // `artifactUseModifier` on behalf of external callers.
      case "Heightened Intelligence":
        profile.modifier -= 2;
        profile.notes.push("Heightened Intelligence");
        break;
      case "Heightened Brain Talent":
        profile.speedMultiplier = Math.max(profile.speedMultiplier, 3);
        profile.notes.push("Heightened Brain Talent");
        break;
      case "Molecular Understanding":
        profile.instantCharts.add("A");
        profile.notes.push("Molecular Understanding");
        break;
      case "Heightened Touch":
        // 0.14.14 — actually apply the bonus we'd been advertising via the
        // notes line. -1 mirrors Dual Brain's contribution (the GW1e text
        // says it "improves the mutant's chance to figure out ancient
        // devices"); skill bonuses for opening locks / safes are wired
        // via the MUTATION_RULES AE entry on juryRigging and salvage.
        profile.modifier -= 1;
        profile.notes.push("Heightened Touch");
        break;
      default:
        break;
    }
  }

  return profile;
}

export function artifactUseModifier(actor, chartId = "A") {
  const profile = artifactUseProfile(actor);
  const aeBonus = artifactAnalysisBonusFromDerived(actor);
  const base = profile.modifier + aeBonus;
  if (normalizeArtifactChartId(chartId) !== "A" && profile.notes.includes("Molecular Understanding")) {
    return base - 2;
  }
  return base;
}

export function artifactUseProfileForChart(actor, chartId = "A") {
  const normalizedChart = normalizeArtifactChartId(chartId);
  const profile = artifactUseProfile(actor);
  const aeBonus = artifactAnalysisBonusFromDerived(actor);
  const base = profile.modifier + aeBonus;
  const modifier = normalizedChart !== "A" && profile.notes.includes("Molecular Understanding")
    ? base - 2
    : base;
  if (aeBonus) profile.notes.push("Analysis Bonus");
  return {
    ...profile,
    chartId: normalizedChart,
    modifier
  };
}

export function artifactRollsPerHour(helperCount = 0, speedMultiplier = 1) {
  return Math.max(1, 5 + Math.max(0, Math.round(Number(helperCount) || 0))) * Math.max(1, Number(speedMultiplier) || 1);
}

export function artifactElapsedMinutes({
  rollsThisAttempt = 0,
  helperCount = 0,
  speedMultiplier = 1
} = {}) {
  const rolls = Math.max(0, Number(rollsThisAttempt) || 0);
  if (!rolls) return 0;
  const rollsPerHour = artifactRollsPerHour(helperCount, speedMultiplier);
  return Math.round((rolls / rollsPerHour) * 60);
}

export function formatArtifactElapsedMinutes(totalMinutes = 0) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}m`;
  if (hours) return `${hours}h`;
  return `${remainder}m`;
}

export function artifactFunctionPercent(item) {
  const artifact = artifactData(item);
  return Math.max(0, Math.min(100, Number(artifact.functionChance ?? artifactFunctionChance(artifact.condition)) || 0));
}

export function artifactDisplayCondition(item) {
  return String(artifactData(item).condition ?? "fair");
}

export function artifactHarmMetadata(item) {
  const artifact = artifactData(item);
  return {
    canShortOut: artifact.canShortOut !== false,
    canExplode: !!artifact.canExplode,
    harmResolutionType: String(artifact.harmResolutionType ?? "generic"),
    harmCallback: String(artifact.harmCallback ?? "")
  };
}
