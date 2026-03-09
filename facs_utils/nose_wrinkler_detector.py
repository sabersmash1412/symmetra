from .facs_balance_detector import FACS_balance_detector

import numpy as np

class NOSE_WRINKLER_DETECTOR(FACS_balance_detector):
    def __init__(self):
        super().__init__("Nose_Wrinkler")

    def _get_cluster_tightness(self, landmarks, indices):
        """
        Returns the mean distance of each point from the centroid.
        Smaller value = more clustered = more activated.
        """
        pts = np.array([[landmarks[i].x, landmarks[i].y] for i in indices])
        centroid = pts.mean(axis=0)
        distances = np.linalg.norm(pts - centroid, axis=1)
        return distances.mean()

    def get_FACS_balance_val(self, landmarks) -> float:
        """
        Positive = right more activated, negative = left more activated.
        More wrinkled → landmarks cluster tighter → smaller spread.
        """
        left_spread  = self._get_cluster_tightness(landmarks, self.left_landmark_arr)
        right_spread = self._get_cluster_tightness(landmarks, self.right_landmark_arr)

        # Invert: smaller spread = more activated, so negate
        return float(left_spread - right_spread) * 1000

