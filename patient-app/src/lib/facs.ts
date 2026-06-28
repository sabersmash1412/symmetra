export const ALGORITHM_VERSION = "symmetra-fau-v2-pose-normalized";

export type Landmark = {
  x: number;
  y: number;
  z?: number;
};

export type HeadPoseInput = {
  yaw: number;
  pitch: number;
  roll: number;
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
  symmetryScore: number;
  affectedSide: "left" | "right" | "balanced";
};

export type SessionSummary = {
  overallSymmetryScore: number;
  metrics: FauMetric[];
};

export const FAU_DEFINITIONS: FauDefinition[] = [
  {
    id: "inner_brow_raiser",
    au: "AU1",
    label: "Inner brow",
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
    label: "Nose wrinkle",
    shortLabel: "Nose",
    left: [232, 128, 188, 121, 196, 47, 114, 174, 126, 217, 209, 198, 236, 3],
    right: [452, 357, 412, 419, 350, 343, 399, 277, 437, 355, 429, 420, 456, 248],
    saturation: 2
  },
  {
    id: "lip_corner_puller",
    au: "AU12",
    label: "Smile balance",
    shortLabel: "Smile",
    left: [[62], [50, 36, 205, 206, 207, 187, 216]],
    right: [[291], [266, 280, 425, 411, 427, 436, 427]],
    saturation: 1
  }
];

const CLOSED_THRESHOLD = 1e-5;
const OPEN_THRESHOLD = 0.01;

export function computeFauMetrics(landmarks: Landmark[], pose?: HeadPoseInput | null): FauMetric[] {
  const poseNormalizedLandmarks = pose ? normalizeLandmarksForPose(landmarks, pose) : landmarks;

  return FAU_DEFINITIONS.map((definition) => {
    const balance = computeRawBalance(definition, poseNormalizedLandmarks);
    const severity = clamp(Math.abs(balance) / definition.saturation, 0, 1);

    return {
      id: definition.id,
      au: definition.au,
      label: definition.label,
      shortLabel: definition.shortLabel,
      balance,
      symmetryScore: Math.round((1 - severity) * 100),
      affectedSide: getAffectedSide(balance)
    };
  });
}

function normalizeLandmarksForPose(landmarks: Landmark[], pose: HeadPoseInput): Landmark[] {
  const center = getFaceCenter(landmarks);
  const yaw = degreesToRadians(-pose.yaw);
  const pitch = degreesToRadians(-pose.pitch);
  const roll = degreesToRadians(-pose.roll);

  return landmarks.map((landmark) => {
    let x = landmark.x - center.x;
    let y = landmark.y - center.y;
    let z = (landmark.z ?? 0) - center.z;

    [x, y, z] = rotateZ(x, y, z, roll);
    [x, y, z] = rotateY(x, y, z, yaw);
    [x, y, z] = rotateX(x, y, z, pitch);

    return {
      x: x + center.x,
      y: y + center.y,
      z: z + center.z
    };
  });
}

function getFaceCenter(landmarks: Landmark[]) {
  const bounds = landmarks.reduce(
    (acc, landmark) => ({
      minX: Math.min(acc.minX, landmark.x),
      maxX: Math.max(acc.maxX, landmark.x),
      minY: Math.min(acc.minY, landmark.y),
      maxY: Math.max(acc.maxY, landmark.y),
      minZ: Math.min(acc.minZ, landmark.z ?? 0),
      maxZ: Math.max(acc.maxZ, landmark.z ?? 0)
    }),
    { minX: 1, maxX: 0, minY: 1, maxY: 0, minZ: 1, maxZ: -1 }
  );

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  };
}

function rotateX(x: number, y: number, z: number, angle: number): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x, y * cos - z * sin, y * sin + z * cos];
}

function rotateY(x: number, y: number, z: number, angle: number): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function rotateZ(x: number, y: number, z: number, angle: number): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos, z];
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function summarizeMetricSamples(samples: FauMetric[][]): SessionSummary | null {
  if (!samples.length) {
    return null;
  }

  const metrics = FAU_DEFINITIONS.map((definition) => {
    const values = samples
      .map((sample) => sample.find((metric) => metric.id === definition.id))
      .filter((metric): metric is FauMetric => Boolean(metric));

    const balance = average(values.map((metric) => metric.balance));
    const symmetryScore = Math.round(average(values.map((metric) => metric.symmetryScore)));

    return {
      id: definition.id,
      au: definition.au,
      label: definition.label,
      shortLabel: definition.shortLabel,
      balance,
      symmetryScore,
      affectedSide: getAffectedSide(balance)
    };
  });

  return {
    overallSymmetryScore: getOverallSymmetryScore(metrics),
    metrics
  };
}

export function getOverallSymmetryScore(metrics: FauMetric[]) {
  if (!metrics.length) {
    return 0;
  }

  return Math.round(average(metrics.map((metric) => metric.symmetryScore)));
}

export function getRelevantLandmarkIndexes() {
  return FAU_DEFINITIONS.flatMap((definition) => [
    ...flattenIndexes(definition.left).map((index) => ({ index, side: "left" as const, metricId: definition.id })),
    ...flattenIndexes(definition.right).map((index) => ({ index, side: "right" as const, metricId: definition.id }))
  ]);
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

function getAffectedSide(value: number): FauMetric["affectedSide"] {
  if (Math.abs(value) < 0.05) {
    return "balanced";
  }

  return value > 0 ? "right" : "left";
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
