from abc import ABC, abstractmethod
from variables import AU_TO_LM_ARR_DICT_LEFT, AU_TO_LM_ARR_DICT_RIGHT

import numpy as np



"""
In mdeiapipe facial landmarks, y increases downwards
"""
class FACS_balance_detector(ABC):

    def __init__(self, AU_name):
        self.name = AU_name
        self.left_landmark_arr = AU_TO_LM_ARR_DICT_LEFT[AU_name]
        self.right_landmark_arr = AU_TO_LM_ARR_DICT_RIGHT[AU_name]


    # function to get the centre point of a group of landmarks
    def get_centroid(self, landmarks, indices):
        pts = np.array([[landmarks[i].x, landmarks[i].y] for i in indices])
        return pts.mean(axis=0)

    @abstractmethod
    def get_FACS_balance_val(self, landmarks) -> float:
        """
        Returns:
            float: positive = right more activated, negative = left more activated, 0 = balanced
        """
        ...

    def get_landmark_values(self, landmarks, indices):
        return np.array([[landmarks[i].x, landmarks[i].y] for i in indices])
