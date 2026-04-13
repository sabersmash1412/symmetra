from .facs_balance_detector import FACS_balance_detector

import numpy as np

class LIP_CORNER_PULLER_DETECTOR(FACS_balance_detector):
    def __init__(self):
        super().__init__("Lip_Corner_Puller")

    
    def _get_lip_corner_pull_activation(self, landmarks, lips_indexes):
        lip_corner = np.array([[landmarks[i].x, landmarks[i].y] for i in lips_indexes[0]])  # shape (1, 2)
        cheek_pts  = np.array([[landmarks[i].x, landmarks[i].y] for i in lips_indexes[1]])    # shape (N, 2)
        cheek_centroid = cheek_pts.mean(axis=0)  # shape (2,)
        activation = cheek_centroid[1] - lip_corner[0, 1]  # vertical distance
        return activation



    def get_FACS_balance_val(self, landmarks) -> float:
        """
        0 if both sides balance
        +ve value if right more activated
        -ve if left more activated
        """

        left_lip_pull_activation  = self._get_lip_corner_pull_activation(landmarks, self.left_landmark_arr)
        right_lip_pull_activation = self._get_lip_corner_pull_activation(landmarks, self.right_landmark_arr)    
        

        return (left_lip_pull_activation - right_lip_pull_activation) * 100