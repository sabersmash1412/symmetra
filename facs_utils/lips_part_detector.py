from .facs_balance_detector import FACS_balance_detector

import numpy as np

CLOSED_THRESHOLD = 1e-5

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
        Positive = right lip opening smaller, negative = left lip opening smaller.
        """

        left_area  = self._get_lip_opening_area(landmarks, self.left_landmark_arr)
        right_area = self._get_lip_opening_area(landmarks, self.right_landmark_arr)

        left_area  = max(0.0, left_area  - CLOSED_THRESHOLD)
        right_area = max(0.0, right_area - CLOSED_THRESHOLD)

        return float(left_area - right_area) * 1000

