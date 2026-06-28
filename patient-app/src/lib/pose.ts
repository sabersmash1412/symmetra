export type HeadPose = {
  yaw: number;
  pitch: number;
  roll: number;
};

export type PoseQuality = {
  isFrontal: boolean;
  score: number;
  label: "Ready" | "Adjust";
};

export const POSE_THRESHOLDS = {
  yaw: 4,
  pitch: 15,
  roll: 4
};

type MatrixLike = {
  data?: number[] | Float32Array;
};

export const emptyQuality: PoseQuality = { isFrontal: false, score: 0, label: "Adjust" };

export function rotationMatrixToEuler(matrix: unknown): HeadPose | null {
  const data = getMatrixData(matrix);
  if (!data || data.length < 16) {
    return null;
  }

  const r00 = data[0];
  const r10 = data[4];
  const r20 = data[8];
  const r21 = data[9];
  const r22 = data[10];

  return {
    yaw: radiansToDegrees(Math.atan2(-r20, Math.sqrt(r21 ** 2 + r22 ** 2))),
    pitch: radiansToDegrees(Math.atan2(r21, r22)),
    roll: radiansToDegrees(Math.atan2(r10, r00))
  };
}

export function getPoseQuality(pose: HeadPose | null): PoseQuality {
  if (!pose) {
    return emptyQuality;
  }

  const worst = Math.max(
    Math.abs(pose.yaw) / POSE_THRESHOLDS.yaw,
    Math.abs(pose.pitch) / POSE_THRESHOLDS.pitch,
    Math.abs(pose.roll) / POSE_THRESHOLDS.roll
  );
  const score = Math.round(Math.max(0, 1 - worst) * 100);

  return {
    isFrontal:
      Math.abs(pose.yaw) < POSE_THRESHOLDS.yaw &&
      Math.abs(pose.pitch) < POSE_THRESHOLDS.pitch &&
      Math.abs(pose.roll) < POSE_THRESHOLDS.roll,
    score,
    label: score >= 35 ? "Ready" : "Adjust"
  };
}

function getMatrixData(matrix: unknown) {
  if (!matrix) {
    return null;
  }

  if (Array.isArray(matrix)) {
    return matrix;
  }

  const candidate = matrix as MatrixLike;
  return candidate.data ? Array.from(candidate.data) : null;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}
