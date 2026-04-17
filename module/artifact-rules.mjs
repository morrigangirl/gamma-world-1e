import { artifactFunctionChance } from "./tables/artifact-tables.mjs";
import { normalizeArtifactChartId } from "./tables/artifact-flowcharts.mjs";

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

export function artifactUseProfile(actor) {
  const intelligence = Math.round(Number(actor?.system?.attributes?.in?.value ?? 0));
  const profile = {
    intelligence,
    baseModifier: artifactIntelligenceModifier(intelligence),
    modifier: artifactIntelligenceModifier(intelligence),
    speedMultiplier: 1,
    instantCharts: new Set(),
    notes: []
  };

  for (const item of mutationEntries(actor)) {
    const name = String(item.name ?? "");
    const variant = String(item.system?.reference?.variant ?? "").toLowerCase();
    const enabled = mutationEnabled(item);
    if (!enabled) continue;

    switch (name) {
      case "Dual Brain":
        profile.modifier -= 1;
        profile.notes.push("Dual Brain");
        break;
      case "Scientific Genius":
        profile.modifier -= 1;
        profile.notes.push("Scientific Genius");
        break;
      case "Genius Capability":
        if (!variant || (variant === "scientific")) {
          profile.modifier -= 1;
          profile.notes.push("Scientific Genius");
        }
        break;
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
  if (normalizeArtifactChartId(chartId) !== "A" && profile.notes.includes("Molecular Understanding")) {
    return profile.modifier - 2;
  }
  return profile.modifier;
}

export function artifactUseProfileForChart(actor, chartId = "A") {
  const normalizedChart = normalizeArtifactChartId(chartId);
  const profile = artifactUseProfile(actor);
  const modifier = normalizedChart !== "A" && profile.notes.includes("Molecular Understanding")
    ? profile.modifier - 2
    : profile.modifier;
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
