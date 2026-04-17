function buildRangeMap(ranges = []) {
  return ranges.map((entry) => ({
    min: Number(entry.min),
    max: Number(entry.max),
    to: String(entry.to),
    label: String(entry.label ?? `${entry.min}-${entry.max}`),
    returnAlias: entry.returnAlias ? String(entry.returnAlias) : "",
    note: entry.note ? String(entry.note) : ""
  }));
}

function chart(id, aliases, legend, nodeMeta, transitions, returnBoxes = []) {
  const normalizedTransitions = Object.fromEntries(
    Object.entries(transitions).map(([nodeId, entries]) => [String(nodeId), buildRangeMap(entries)])
  );

  return {
    id,
    aliases: Object.fromEntries(Object.entries(aliases).map(([key, value]) => [key, String(value)])),
    legend,
    nodeMeta: Object.fromEntries(
      Object.entries(nodeMeta).map(([nodeId, meta]) => [String(nodeId), {
        public: true,
        ...meta,
        x: Number(meta.x),
        y: Number(meta.y),
        label: meta.label ?? ""
      }])
    ),
    transitions: normalizedTransitions,
    returnBoxes: returnBoxes.map((box) => ({
      ...box,
      x: Number(box.x),
      y: Number(box.y),
      targetAlias: String(box.targetAlias)
    }))
  };
}

export const ARTIFACT_FLOWCHARTS = {
  A: chart(
    "A",
    { S: 1, A: 2, F: 5, H: 9 },
    [
      "Pistols, rifles, and most hand weapons",
      "Grenades, bombs, missiles, and compact defenses",
      "Portent, Energy Cloak, Control Baton",
      "Communication Sender, Anti-grav Sled, UV/IR Goggles",
      "Chemical, solar, hydrogen, and atomic cells"
    ],
    {
      1: { shape: "square", label: "S", x: 18, y: 18 },
      2: { shape: "square", label: "A", x: 48, y: 18 },
      3: { shape: "circle", x: 80, y: 18 },
      4: { shape: "square", x: 48, y: 43 },
      5: { shape: "square", label: "F", x: 48, y: 70 },
      6: { shape: "circle", x: 19, y: 61 },
      7: { shape: "circle", x: 78, y: 57 },
      8: { shape: "diamond", x: 82, y: 82 },
      9: { shape: "terminal", label: "☠", x: 82, y: 95 }
    },
    {
      1: [
        { min: 1, max: 7, to: 2, label: "1-7" },
        { min: 8, max: 10, to: 1, label: "8-10" }
      ],
      2: [
        { min: 1, max: 5, to: 4, label: "1-5" },
        { min: 6, max: 7, to: 2, label: "6-7" },
        { min: 8, max: 10, to: 3, label: "8-10" }
      ],
      3: [
        { min: 1, max: 2, to: 4, label: "1-2" },
        { min: 3, max: 10, to: 3, label: "3-10" }
      ],
      4: [
        { min: 1, max: 3, to: 5, label: "1-3" },
        { min: 4, max: 7, to: 4, label: "4-7" },
        { min: 8, max: 10, to: 7, label: "8-10" }
      ],
      5: [
        { min: 1, max: 10, to: 5, label: "1-10" }
      ],
      6: [
        { min: 1, max: 2, to: 2, label: "1-2" },
        { min: 3, max: 4, to: 1, label: "3-4" },
        { min: 5, max: 10, to: 6, label: "5-10" }
      ],
      7: [
        { min: 1, max: 1, to: 5, label: "1" },
        { min: 2, max: 5, to: 6, label: "2-5" },
        { min: 6, max: 8, to: 7, label: "6-8" },
        { min: 9, max: 10, to: 8, label: "9-10" }
      ],
      8: [
        { min: 1, max: 3, to: 6, label: "1-3" },
        { min: 4, max: 7, to: 2, label: "4-7", returnAlias: "A" },
        { min: 8, max: 10, to: 9, label: "8-10" }
      ],
      9: [
        { min: 1, max: 10, to: 9, label: "1-10" }
      ]
    },
    [
      { id: "return-a", label: "Return to Square A", targetAlias: "A", x: 62, y: 84 }
    ]
  ),
  B: chart(
    "B",
    { C: 4, S: 6, A: 7, B: 8, F: 11, H: 17 },
    [
      "Offensive armor and heavy military gear",
      "Combustion, turbine, hover, and flit vehicles",
      "Cargo lifters and transports",
      "Medi-kit, Energy Cell Charger, Rejuv/Stasis Chambers",
      "Robotic units and service machines"
    ],
    {
      1: { shape: "circle", x: 11, y: 64 },
      2: { shape: "diamond", x: 88, y: 56 },
      3: { shape: "circle", x: 10, y: 36 },
      4: { shape: "square", label: "C", x: 82, y: 16 },
      5: { shape: "square", x: 29, y: 46 },
      6: { shape: "square", label: "S", x: 12, y: 16 },
      7: { shape: "square", label: "A", x: 34, y: 16 },
      8: { shape: "square", label: "B", x: 57, y: 16 },
      9: { shape: "square", x: 56, y: 52 },
      10: { shape: "square", x: 32, y: 74 },
      11: { shape: "square", label: "F", x: 32, y: 94 },
      12: { shape: "diamond", x: 75, y: 40 },
      13: { shape: "circle", x: 58, y: 35 },
      14: { shape: "circle", x: 71, y: 76 },
      15: { shape: "circle", x: 55, y: 82 },
      16: { shape: "diamond", x: 84, y: 83 },
      17: { shape: "terminal", label: "☠", x: 91, y: 95 }
    },
    {
      1: [
        { min: 1, max: 2, to: 5, label: "1-2" },
        { min: 3, max: 10, to: 1, label: "3-10" }
      ],
      2: [
        { min: 1, max: 2, to: 1, label: "1-2" },
        { min: 3, max: 5, to: 8, label: "3-5", returnAlias: "B" },
        { min: 6, max: 10, to: 17, label: "6-10" }
      ],
      3: [
        { min: 1, max: 3, to: 4, label: "1-3" },
        { min: 4, max: 4, to: 7, label: "4" },
        { min: 5, max: 10, to: 3, label: "5-10" }
      ],
      4: [
        { min: 1, max: 2, to: 5, label: "1-2" },
        { min: 3, max: 3, to: 8, label: "3" },
        { min: 4, max: 6, to: 4, label: "4-6" },
        { min: 7, max: 10, to: 1, label: "7-10" }
      ],
      5: [
        { min: 1, max: 5, to: 10, label: "1-5" },
        { min: 6, max: 10, to: 2, label: "6-10" }
      ],
      6: [
        { min: 1, max: 7, to: 7, label: "1-7" },
        { min: 8, max: 9, to: 6, label: "8-9" },
        { min: 10, max: 10, to: 3, label: "10" }
      ],
      7: [
        { min: 1, max: 5, to: 8, label: "1-5" },
        { min: 6, max: 7, to: 4, label: "6-7" },
        { min: 8, max: 10, to: 13, label: "8-10" }
      ],
      8: [
        { min: 1, max: 3, to: 9, label: "1-3" },
        { min: 4, max: 10, to: 8, label: "4-10" }
      ],
      9: [
        { min: 1, max: 2, to: 10, label: "1-2" },
        { min: 3, max: 6, to: 9, label: "3-6" },
        { min: 7, max: 10, to: 5, label: "7-10" }
      ],
      10: [
        { min: 1, max: 1, to: 11, label: "1" },
        { min: 2, max: 5, to: 10, label: "2-5" },
        { min: 6, max: 10, to: 15, label: "6-10" }
      ],
      11: [
        { min: 1, max: 10, to: 11, label: "1-10" }
      ],
      12: [
        { min: 1, max: 1, to: 7, label: "1" },
        { min: 2, max: 4, to: 6, label: "2-4" },
        { min: 5, max: 8, to: 4, label: "5-8", returnAlias: "C" },
        { min: 9, max: 10, to: 17, label: "9-10" }
      ],
      13: [
        { min: 1, max: 3, to: 8, label: "1-3" },
        { min: 4, max: 7, to: 13, label: "4-7" },
        { min: 8, max: 10, to: 12, label: "8-10" }
      ],
      14: [
        { min: 1, max: 1, to: 10, label: "1" },
        { min: 2, max: 4, to: 9, label: "2-4" },
        { min: 5, max: 10, to: 13, label: "5-10" }
      ],
      15: [
        { min: 1, max: 1, to: 11, label: "1" },
        { min: 2, max: 5, to: 15, label: "2-5" },
        { min: 6, max: 7, to: 14, label: "6-7" },
        { min: 8, max: 10, to: 16, label: "8-10" }
      ],
      16: [
        { min: 1, max: 3, to: 14, label: "1-3" },
        { min: 4, max: 7, to: 7, label: "4-7", returnAlias: "A" },
        { min: 8, max: 10, to: 17, label: "8-10" }
      ],
      17: [
        { min: 1, max: 10, to: 17, label: "1-10" }
      ]
    },
    [
      { id: "return-b", label: "Return to Square B", targetAlias: "B", x: 85, y: 33 },
      { id: "return-c", label: "Return to Square C", targetAlias: "C", x: 62, y: 41 },
      { id: "return-a", label: "Return to Square A", targetAlias: "A", x: 63, y: 89 }
    ]
  ),
  C: chart(
    "C",
    { S: 8, A: 9, B: 10, C: 11, F: 14, H: 22 },
    [
      "Environmental and Bubble Cars",
      "Permanent cybernetic installations",
      "Think Tanks, building computers, and networked systems",
      "Life Ray, broadcast stations, and major installations",
      "Highly complex or integrated Ancient devices"
    ],
    {
      1: { shape: "circle", x: 8, y: 18 },
      2: { shape: "diamond", x: 19, y: 38 },
      3: { shape: "diamond", x: 70, y: 56 },
      4: { shape: "circle", x: 31, y: 39 },
      5: { shape: "circle", x: 48, y: 39 },
      6: { shape: "circle", x: 61, y: 39 },
      7: { shape: "circle", x: 74, y: 39 },
      8: { shape: "square", label: "S", x: 14, y: 18 },
      9: { shape: "square", label: "A", x: 29, y: 18 },
      10: { shape: "square", label: "B", x: 44, y: 18 },
      11: { shape: "square", label: "C", x: 59, y: 18 },
      12: { shape: "square", x: 50, y: 62 },
      13: { shape: "square", x: 64, y: 62 },
      14: { shape: "square", label: "F", x: 78, y: 62 },
      15: { shape: "circle", x: 27, y: 57 },
      16: { shape: "square", x: 39, y: 78 },
      17: { shape: "square", x: 54, y: 78 },
      18: { shape: "square", x: 69, y: 78 },
      19: { shape: "circle", x: 83, y: 78 },
      20: { shape: "diamond", x: 35, y: 94 },
      21: { shape: "diamond", x: 63, y: 94 },
      22: { shape: "terminal", label: "☠", x: 88, y: 94 }
    },
    {
      1: [
        { min: 1, max: 2, to: 8, label: "1-2" },
        { min: 3, max: 10, to: 1, label: "3-10" }
      ],
      2: [
        { min: 1, max: 2, to: 5, label: "1-2" },
        { min: 3, max: 5, to: 4, label: "3-5" },
        { min: 6, max: 7, to: 1, label: "6-7" },
        { min: 8, max: 10, to: 22, label: "8-10" }
      ],
      3: [
        { min: 1, max: 2, to: 6, label: "1-2" },
        { min: 3, max: 4, to: 2, label: "3-4" },
        { min: 5, max: 8, to: 11, label: "5-8", returnAlias: "C" },
        { min: 9, max: 10, to: 22, label: "9-10" }
      ],
      4: [
        { min: 1, max: 2, to: 10, label: "1-2" },
        { min: 3, max: 4, to: 5, label: "3-4" },
        { min: 5, max: 10, to: 4, label: "5-10" }
      ],
      5: [
        { min: 1, max: 2, to: 12, label: "1-2" },
        { min: 3, max: 5, to: 6, label: "3-5" },
        { min: 6, max: 10, to: 3, label: "6-10" }
      ],
      6: [
        { min: 1, max: 3, to: 13, label: "1-3" },
        { min: 4, max: 10, to: 7, label: "4-10" }
      ],
      7: [
        { min: 1, max: 2, to: 14, label: "1-2" },
        { min: 3, max: 5, to: 7, label: "3-5" },
        { min: 6, max: 10, to: 3, label: "6-10" }
      ],
      8: [
        { min: 1, max: 6, to: 9, label: "1-6" },
        { min: 7, max: 7, to: 15, label: "7" },
        { min: 8, max: 10, to: 8, label: "8-10" }
      ],
      9: [
        { min: 1, max: 5, to: 10, label: "1-5" },
        { min: 6, max: 10, to: 4, label: "6-10" }
      ],
      10: [
        { min: 1, max: 3, to: 11, label: "1-3" },
        { min: 4, max: 7, to: 10, label: "4-7" },
        { min: 8, max: 10, to: 15, label: "8-10" }
      ],
      11: [
        { min: 1, max: 2, to: 12, label: "1-2" },
        { min: 3, max: 5, to: 11, label: "3-5" },
        { min: 6, max: 7, to: 17, label: "6-7" },
        { min: 8, max: 10, to: 5, label: "8-10" }
      ],
      12: [
        { min: 1, max: 1, to: 13, label: "1" },
        { min: 2, max: 10, to: 12, label: "2-10" }
      ],
      13: [
        { min: 1, max: 1, to: 14, label: "1" },
        { min: 2, max: 6, to: 13, label: "2-6" },
        { min: 7, max: 10, to: 7, label: "7-10" }
      ],
      14: [
        { min: 1, max: 10, to: 14, label: "1-10" }
      ],
      15: [
        { min: 1, max: 2, to: 9, label: "1-2" },
        { min: 3, max: 3, to: 16, label: "3" },
        { min: 4, max: 10, to: 15, label: "4-10" }
      ],
      16: [
        { min: 1, max: 4, to: 17, label: "1-4" },
        { min: 5, max: 10, to: 11, label: "5-10" }
      ],
      17: [
        { min: 1, max: 2, to: 18, label: "1-2" },
        { min: 3, max: 10, to: 17, label: "3-10" }
      ],
      18: [
        { min: 1, max: 2, to: 14, label: "1-2" },
        { min: 3, max: 4, to: 12, label: "3-4" },
        { min: 5, max: 10, to: 19, label: "5-10" }
      ],
      19: [
        { min: 1, max: 1, to: 17, label: "1" },
        { min: 2, max: 6, to: 16, label: "2-6" },
        { min: 7, max: 8, to: 21, label: "7-8" },
        { min: 9, max: 10, to: 20, label: "9-10" }
      ],
      20: [
        { min: 1, max: 5, to: 16, label: "1-5" },
        { min: 6, max: 8, to: 9, label: "6-8", returnAlias: "A" },
        { min: 9, max: 10, to: 22, label: "9-10" }
      ],
      21: [
        { min: 1, max: 2, to: 18, label: "1-2" },
        { min: 3, max: 6, to: 10, label: "3-6", returnAlias: "B" },
        { min: 7, max: 10, to: 22, label: "7-10" }
      ],
      22: [
        { min: 1, max: 10, to: 22, label: "1-10" }
      ]
    },
    [
      { id: "return-c", label: "Return to Square C", targetAlias: "C", x: 77, y: 50 },
      { id: "return-a", label: "Return to Square A", targetAlias: "A", x: 18, y: 94 },
      { id: "return-b", label: "Return to Square B", targetAlias: "B", x: 72, y: 86 }
    ]
  )
};

export function normalizeArtifactChartId(chartId = "A") {
  const normalized = String(chartId ?? "A").trim().toUpperCase();
  return ARTIFACT_FLOWCHARTS[normalized] ? normalized : "A";
}

export function artifactChartConfig(chartId = "A") {
  return ARTIFACT_FLOWCHARTS[normalizeArtifactChartId(chartId)];
}

export function artifactChartNodeId(chartId, nodeOrAlias) {
  const config = artifactChartConfig(chartId);
  const raw = String(nodeOrAlias ?? config.aliases.S);
  return config.aliases[raw] ?? raw;
}

export function artifactChartNodeMeta(chartId, nodeOrAlias) {
  const config = artifactChartConfig(chartId);
  return config.nodeMeta[artifactChartNodeId(config.id, nodeOrAlias)] ?? null;
}

export function artifactChartStartNode(chartId) {
  return artifactChartConfig(chartId).aliases.S;
}

export function artifactChartFinishNode(chartId) {
  return artifactChartConfig(chartId).aliases.F;
}

export function artifactChartHarmNode(chartId) {
  return artifactChartConfig(chartId).aliases.H;
}

export function isArtifactChartSuccessNode(chartId, nodeOrAlias) {
  return artifactChartNodeId(chartId, nodeOrAlias) === artifactChartFinishNode(chartId);
}

export function isArtifactChartHarmNode(chartId, nodeOrAlias) {
  return artifactChartNodeId(chartId, nodeOrAlias) === artifactChartHarmNode(chartId);
}

export function artifactChartTransition(chartId, nodeOrAlias, roll) {
  const config = artifactChartConfig(chartId);
  const nodeId = artifactChartNodeId(config.id, nodeOrAlias);
  const total = Number(roll);
  const transition = (config.transitions[nodeId] ?? []).find((entry) => total >= entry.min && total <= entry.max) ?? null;
  if (!transition) return null;
  return {
    ...transition,
    from: nodeId,
    to: artifactChartNodeId(config.id, transition.to)
  };
}

export function artifactChartStepKind(chartId, fromNode, transition) {
  if (!transition) return "loop";
  const toNode = artifactChartNodeId(chartId, transition.to);
  if (isArtifactChartSuccessNode(chartId, toNode)) return "success";
  if (isArtifactChartHarmNode(chartId, toNode)) return "harm";
  if (transition.returnAlias) return "return";
  if (artifactChartNodeId(chartId, fromNode) === toNode) return "loop";
  return "advance";
}

export function resolveArtifactChartStep(chartId, currentNode, adjustedRoll) {
  const config = artifactChartConfig(chartId);
  const from = artifactChartNodeId(config.id, currentNode);
  const transition = artifactChartTransition(config.id, from, adjustedRoll);
  if (!transition) {
    throw new Error(`No chart transition found for Chart ${config.id}, node ${from}, roll ${adjustedRoll}.`);
  }
  return {
    chartId: config.id,
    from,
    to: transition.to,
    transition,
    note: artifactChartStepKind(config.id, from, transition),
    isSuccess: isArtifactChartSuccessNode(config.id, transition.to),
    isHarm: isArtifactChartHarmNode(config.id, transition.to)
  };
}

