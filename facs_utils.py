from abc import ABC, abstractmethod
from variables import AU_TO_LM_ARR_DICT_LEFT, AU_TO_LM_ARR_DICT_RIGHT

import numpy as np

# Stable anchors: inner eye corners (barely move with expressions)
LEFT_EYE_INNER  = 133
RIGHT_EYE_INNER = 362


"""
In mdeiapipe facial landmarks, y increases downwards
"""

# function to get the centre point of a group of landmarks
def get_centroid(landmarks, indices):
    pts = np.array([[landmarks[i].x, landmarks[i].y] for i in indices])
    return pts.mean(axis=0)

class FACS_balance_detector(ABC):

    def __init__(self, AU_name):
        self.name = AU_name


    @abstractmethod
    def get_FACS_balance_val(self, landmarks) -> float:
        """
        Returns:
            float: positive = right more activated, negative = left more activated, 0 = balanced
        """
        ...

class INNER_EYEBROW_RAISER_DETECTOR(FACS_balance_detector):
    def __init__(self):
        super().__init__("Inner_Brow_Raiser")


    def get_FACS_balance_val(self, landmarks) -> float:
        """
        0 if both sides balance
        +ve value if right more activated
        -ve if left more activated
        """
        
        left_centroid = get_centroid(landmarks, AU_TO_LM_ARR_DICT_LEFT[self.name])
        right_centroid = get_centroid(landmarks, AU_TO_LM_ARR_DICT_RIGHT[self.name])

        return (left_centroid[1] - right_centroid[1]) * 100


class LIPS_PART_DETECTOR(FACS_balance_detector):
    def __init__(self):
        super().__init__("Lips_Part")


    def _get_lip_opening_area(self, landmarks, lips_indexes):
        upper_pts = np.array([[landmarks[i].x, landmarks[i].y] for i in lips_indexes[0]])
        lower_pts = np.array([[landmarks[i].x, landmarks[i].y] for i in lips_indexes[1]])

        upper_pts = upper_pts[np.argsort(upper_pts[:, 0])]
        lower_pts = lower_pts[np.argsort(lower_pts[:, 0])]

        x_min = max(upper_pts[0, 0],  lower_pts[0, 0])
        x_max = min(upper_pts[-1, 0], lower_pts[-1, 0])
        x_grid = np.linspace(x_min, x_max, 50)

        upper_y = np.interp(x_grid, upper_pts[:, 0], upper_pts[:, 1])
        lower_y = np.interp(x_grid, lower_pts[:, 0], lower_pts[:, 1])

        gap = np.maximum(0.0, lower_y - upper_y)

        # Gate: if peak gap never exceeds threshold, lips are closed
        OPEN_THRESHOLD = 0.01  # tune this — in normalised coords
        if gap.max() < OPEN_THRESHOLD:
            return 0.0
        
        return gap.max()
        # return np.trapezoid(gap, x_grid)

    def get_FACS_balance_val(self, landmarks) -> float:
        """
        Positive = right lip opening larger, negative = left lip opening larger.
        """
        CLOSED_THRESHOLD = 1e-5

        left_area  = self._get_lip_opening_area(landmarks, AU_TO_LM_ARR_DICT_LEFT[self.name])
        right_area = self._get_lip_opening_area(landmarks, AU_TO_LM_ARR_DICT_RIGHT[self.name])

        left_area  = max(0.0, left_area  - CLOSED_THRESHOLD)
        right_area = max(0.0, right_area - CLOSED_THRESHOLD)

        return float(right_area - left_area) * 1000


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
        left_spread  = self._get_cluster_tightness(landmarks, AU_TO_LM_ARR_DICT_LEFT[self.name])
        right_spread = self._get_cluster_tightness(landmarks, AU_TO_LM_ARR_DICT_RIGHT[self.name])

        # Invert: smaller spread = more activated, so negate
        return float(left_spread - right_spread) * 1000

    
        
