export const ARTIFACT_FUNCTION_BY_CONDITION = {
  broken: 0,
  poor: 20,
  fair: 40,
  good: 60,
  excellent: 80,
  perfect: 100
};

export const ARTIFACT_CHART_DIFFICULTY = {
  none: 999,
  a: 10,
  b: 13,
  c: 16
};

export const ARTIFACT_ANALYSIS_STAGES = {
  unknown: "Identify purpose",
  identified: "Determine operation",
  known: "Mastered"
};

export function artifactFunctionChance(condition = "fair") {
  return ARTIFACT_FUNCTION_BY_CONDITION[condition] ?? ARTIFACT_FUNCTION_BY_CONDITION.fair;
}

export function artifactDifficulty(chart = "a") {
  return ARTIFACT_CHART_DIFFICULTY[chart] ?? ARTIFACT_CHART_DIFFICULTY.a;
}

export function artifactConditionFromRoll(roll) {
  const total = Math.round(Number(roll) || 0);
  if (total <= 5) return "broken";
  if (total <= 7) return "poor";
  if (total <= 9) return "fair";
  if (total <= 10) return "good";
  if (total <= 11) return "excellent";
  return "perfect";
}
