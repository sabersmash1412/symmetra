export type Landmark = {
  x: number;
  y: number;
  z?: number;
};

type LandmarkIndexGroup = number[] | number[][];

type FauDefinition = {
  id: string;
  au: string;
  label: string;
  shortLabel: string;
  left: LandmarkIndexGroup;
  right: LandmarkIndexGroup;
  saturation: number;
};

export type FauMetric = {
  id: string;
  au: string;
  label: string;
  shortLabel: string;
  balance: number;
  baselineBalance: number | null;
  baselineCorrectedBalance: number | null;
  leftMovementPct: number | null;
  rightMovementPct: number | null;
  movementMagnitudePct: number | null;
  symmetryScore: number;
  affectedSide: "left" | "right" | "balanced";
};

export type SessionSnapshot = {
  id: string;
  createdAt: string;
  exercise: string;
  symmetryScore: number;
  movementMagnitudePct: number | null;
  qualityScore: number;
  metrics: FauMetric[];
};

export const FAU_DEFINITIONS: FauDefinition[] = [
  {
    id: "inner_brow_raiser",
    au: "AU1",
    label: "Inner brow raiser",
    shortLabel: "Brow",
    left: [103, 67, 109, 104, 69, 108, 105, 66, 107, 52, 65, 55],
    right: [332, 297, 338, 333, 299, 337, 334, 296, 336, 282, 295, 285],
    saturation: 0.5
  },
  {
    id: "lips_part",
    au: "AU25",
    label: "Lips part",
    shortLabel: "Lips",
    left: [
      [191, 80, 81, 82],
      [95, 77, 178, 87]
    ],
    right: [
      [312, 311, 310, 415],
      [317, 402, 318, 324]
    ],
    saturation: 5
  },
  {
    id: "nose_wrinkler",
    au: "AU9",
    label: "Nose wrinkler",
    shortLabel: "Nose",
    left: [232, 128, 188, 121, 196, 47, 114, 174, 126, 217, 209, 198, 236, 3],
    right: [452, 357, 412, 419, 350, 343, 399, 277, 437, 355, 429, 420, 456, 248],
    saturation: 2
  },
  {
    id: "lip_corner_puller",
    au: "AU12",
    label: "Lip corner puller",
    shortLabel: "Smile",
    left: [[62], [50, 36, 205, 206, 207, 187, 216]],
    right: [[291], [266, 280, 425, 411, 427, 436, 427]],
    saturation: 1
  }
];

export const EXERCISES = [
  { id: "rest", label: "Rest", metricIds: FAU_DEFINITIONS.map((definition) => definition.id) },
  { id: "brow_raise", label: "Brow raise", metricIds: ["inner_brow_raiser"] },
  { id: "smile", label: "Smile", metricIds: ["lip_corner_puller"] },
  { id: "lips_part", label: "Lips part", metricIds: ["lips_part"] },
  { id: "nose_wrinkle", label: "Nose wrinkle", metricIds: ["nose_wrinkler"] }
];

const CLOSED_THRESHOLD = 1e-5;
const OPEN_THRESHOLD = 0.01;

export function computeFauMetrics(landmarks: Landmark[], baseline?: Landmark[] | null): FauMetric[] {
  const baselineBalances = baseline ? computeRawBalances(baseline) : new Map<string, number>();

  return FAU_DEFINITIONS.map((definition) => {
    const balance = computeRawBalance(definition, landmarks);
    const baselineBalance = baselineBalances.get(definition.id) ?? null;
    const movement = baseline ? computeMovement(definition, landmarks, baseline) : null;
    const baselineCorrectedBalance = baselineBalance === null ? null : balance - baselineBalance;
    const symmetryValue = baselineCorrectedBalance ?? balance;
    const severity = clamp(Math.abs(symmetryValue) / definition.saturation, 0, 1);

    return {
      id: definition.id,
      au: definition.au,
      label: definition.label,
      shortLabel: definition.shortLabel,
      balance,
      baselineBalance,
      baselineCorrectedBalance,
      leftMovementPct: movement?.left ?? null,
      rightMovementPct: movement?.right ?? null,
      movementMagnitudePct: movement?.average ?? null,
      symmetryScore: Math.round((1 - severity) * 100),
      affectedSide: getAffectedSide(symmetryValue)
    };
  });
}

export function buildSessionSnapshot(
  exercise: string,
  qualityScore: number,
  metrics: FauMetric[]
): SessionSnapshot {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    exercise,
    symmetryScore: getOverallSymmetryScore(metrics),
    movementMagnitudePct: getOverallMovementMagnitude(metrics),
    qualityScore,
    metrics
  };
}

export function getOverallSymmetryScore(metrics: FauMetric[]) {
  if (!metrics.length) {
    return 0;
  }

  const total = metrics.reduce((sum, metric) => sum + metric.symmetryScore, 0);
  return Math.round(total / metrics.length);
}

export function getOverallMovementMagnitude(metrics: FauMetric[]) {
  const values = metrics
    .map((metric) => metric.movementMagnitudePct)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getActiveMetrics(metrics: FauMetric[], exerciseId: string) {
  const exercise = EXERCISES.find((item) => item.id === exerciseId);
  if (!exercise || exercise.id === "rest") {
    return metrics;
  }

  return metrics.filter((metric) => exercise.metricIds.includes(metric.id));
}

export function getRelevantLandmarkIndexes(metricIds?: string[]) {
  const definitions = metricIds?.length
    ? FAU_DEFINITIONS.filter((definition) => metricIds.includes(definition.id))
    : FAU_DEFINITIONS;

  return definitions.flatMap((definition) => [
    ...flattenIndexes(definition.left).map((index) => ({ index, side: "left" as const, metricId: definition.id })),
    ...flattenIndexes(definition.right).map((index) => ({ index, side: "right" as const, metricId: definition.id }))
  ]);
}

function computeRawBalances(landmarks: Landmark[]) {
  return new Map(FAU_DEFINITIONS.map((definition) => [definition.id, computeRawBalance(definition, landmarks)]));
}

function computeRawBalance(definition: FauDefinition, landmarks: Landmark[]) {
  switch (definition.id) {
    case "inner_brow_raiser": {
      const leftCentroid = getCentroid(landmarks, definition.left as number[]);
      const rightCentroid = getCentroid(landmarks, definition.right as number[]);
      return (rightCentroid.y - leftCentroid.y) * 100;
    }
    case "lips_part": {
      const leftOpening = getLipOpening(landmarks, definition.left as number[][]);
      const rightOpening = getLipOpening(landmarks, definition.right as number[][]);
      return (Math.max(0, leftOpening - CLOSED_THRESHOLD) - Math.max(0, rightOpening - CLOSED_THRESHOLD)) * 1000;
    }
    case "nose_wrinkler": {
      const leftSpread = getClusterSpread(landmarks, definition.left as number[]);
      const rightSpread = getClusterSpread(landmarks, definition.right as number[]);
      return (rightSpread - leftSpread) * 1000;
    }
    case "lip_corner_puller": {
      const leftActivation = getLipCornerPullActivation(landmarks, definition.left as number[][]);
      const rightActivation = getLipCornerPullActivation(landmarks, definition.right as number[][]);
      return (leftActivation - rightActivation) * 100;
    }
    default:
      return 0;
  }
}

function computeMovement(definition: FauDefinition, landmarks: Landmark[], baseline: Landmark[]) {
  const scale = getFaceScale(landmarks, baseline);
  const left = getMeanDisplacement(landmarks, baseline, flattenIndexes(definition.left), scale);
  const right = getMeanDisplacement(landmarks, baseline, flattenIndexes(definition.right), scale);
  return { left, right, average: (left + right) / 2 };
}

function getFaceScale(landmarks: Landmark[], baseline: Landmark[]) {
  const currentScale = distance(landmarks[33], landmarks[263]) || distance(landmarks[234], landmarks[454]);
  const baselineScale = distance(baseline[33], baseline[263]) || distance(baseline[234], baseline[454]);
  return Math.max((currentScale + baselineScale) / 2, 0.001);
}

function getMeanDisplacement(current: Landmark[], baseline: Landmark[], indexes: number[], scale: number) {
  const total = indexes.reduce((sum, index) => sum + distance(current[index], baseline[index]), 0);
  return (total / Math.max(indexes.length, 1) / scale) * 100;
}

function getLipOpening(landmarks: Landmark[], lipsIndexes: number[][]) {
  const upper = lipsIndexes[0].map((index) => landmarks[index]).sort((a, b) => a.x - b.x);
  const lower = lipsIndexes[1].map((index) => landmarks[index]).sort((a, b) => a.x - b.x);
  const xMin = Math.max(upper[0].x, lower[0].x);
  const xMax = Math.min(upper[upper.length - 1].x, lower[lower.length - 1].x);
  let peakGap = 0;

  for (let i = 0; i < 50; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / 49;
    peakGap = Math.max(peakGap, Math.max(0, interpolateY(lower, x) - interpolateY(upper, x)));
  }

  return peakGap < OPEN_THRESHOLD ? 0 : peakGap;
}

function getLipCornerPullActivation(landmarks: Landmark[], lipsIndexes: number[][]) {
  const lipCorner = landmarks[lipsIndexes[0][0]];
  const cheekCentroid = getCentroid(landmarks, lipsIndexes[1]);
  return cheekCentroid.y - lipCorner.y;
}

function getClusterSpread(landmarks: Landmark[], indexes: number[]) {
  const centroid = getCentroid(landmarks, indexes);
  const total = indexes.reduce((sum, index) => sum + distance(landmarks[index], centroid), 0);
  return total / Math.max(indexes.length, 1);
}

function getCentroid(landmarks: Landmark[], indexes: number[]) {
  const total = indexes.reduce(
    (sum, index) => ({ x: sum.x + landmarks[index].x, y: sum.y + landmarks[index].y }),
    { x: 0, y: 0 }
  );

  return { x: total.x / indexes.length, y: total.y / indexes.length };
}

function interpolateY(points: Landmark[], x: number) {
  if (x <= points[0].x) {
    return points[0].y;
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (x >= start.x && x <= end.x) {
      const t = (x - start.x) / Math.max(end.x - start.x, 0.000001);
      return start.y + (end.y - start.y) * t;
    }
  }

  return points[points.length - 1].y;
}

function flattenIndexes(indexes: LandmarkIndexGroup): number[] {
  return indexes.length > 0 && Array.isArray(indexes[0]) ? (indexes as number[][]).flat() : (indexes as number[]);
}

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getAffectedSide(value: number) {
  if (Math.abs(value) < 0.05) {
    return "balanced";
  }

  return value > 0 ? "right" : "left";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
