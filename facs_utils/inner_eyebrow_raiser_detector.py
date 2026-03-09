from .facs_balance_detector import FACS_balance_detector

class INNER_EYEBROW_RAISER_DETECTOR(FACS_balance_detector):
    def __init__(self):
        super().__init__("Inner_Brow_Raiser")


    def get_FACS_balance_val(self, landmarks) -> float:
        """
        0 if both sides balance
        +ve value if right more activated
        -ve if left more activated
        """
        
        left_centroid = self.get_centroid(landmarks, self.left_landmark_arr)
        right_centroid = self.get_centroid(landmarks, self.right_landmark_arr)

        return (left_centroid[1] - right_centroid[1]) * 100
