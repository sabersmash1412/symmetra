from detector import Lm_Detector
from variables import AU_TO_LM_ARR_DICT_LEFT, AU_TO_LM_ARR_DICT_RIGHT, FAU_NUM_TO_NAME_DICT, YAW_THRESHOLD_DEG, PITCH_THRESHOLD_DEG, ROW_THRESHOLD_DEG
from facs_utils import NOSE_WRINKLER_DETECTOR, INNER_EYEBROW_RAISER_DETECTOR, LIPS_PART_DETECTOR

import cv2
import numpy as np
import mediapipe as mp

# Compute and draw FACS balance values (top-left)
font       = cv2.FONT_HERSHEY_SIMPLEX
font_scale = 0.55
thickness  = 1
line_gap   = 22
margin     = 10

def draw_landmarks(frame, face_landmarks, highlight_indexes=None):
    """Draw face landmarks on frame. Highlighted indexes drawn red, rest green."""
    if highlight_indexes is None:
        highlight_indexes = []

    highlight_set = set(highlight_indexes)
    h, w = frame.shape[:2]

    for idx, lm in enumerate(face_landmarks):
        x = int(lm.x * w)
        y = int(lm.y * h)
        color = (0, 0, 255) if idx in highlight_set else (0, 255, 0)  # Red or Green (BGR)
        cv2.circle(frame, (x, y), 1, color, -1)


    # # ✅ Pass the full landmark list + indices separately
    # if highlight_indexes:
    #     centroid = get_centroid(face_landmarks, highlight_indexes)
    #     cx = int(centroid[0] * w)
    #     cy = int(centroid[1] * h)
    #     cv2.circle(frame, (cx, cy), 5, (255, 0, 0), -1)  # Blue dot, larger

    return frame


def build_display(frame, face_landmarks, yaw_deg, pitch_deg, roll_deg, facs_detector):
    is_frontal = (abs(yaw_deg)   < YAW_THRESHOLD_DEG and
                abs(pitch_deg) < PITCH_THRESHOLD_DEG and
                abs(roll_deg)  < ROW_THRESHOLD_DEG)
    
    if not is_frontal:
        print("not frontal")
        return frame
    
    draw_landmarks(frame, face_landmarks, AU_TO_LM_ARR_DICT_LEFT["Lips_Part"][0])

    return frame


def get_facs_balance_val(face_landmarks, facs_balance_detector_list):

    facs_balance_val_dict = {}
    for facs_balance_detector in facs_balance_detector_list:
        facs_val = facs_balance_detector.get_FACS_balance_val(face_landmarks)

        facs_balance_val_dict[facs_balance_detector.name] = facs_val
    
    return facs_balance_val_dict


def main():
    lm_detector = Lm_Detector()

    facs_balance_detector_list = [NOSE_WRINKLER_DETECTOR(), INNER_EYEBROW_RAISER_DETECTOR(), LIPS_PART_DETECTOR()]

    # Indexes to highlight in red (e.g. left eye corners)
    highlight_indexes = AU_TO_LM_ARR_DICT_RIGHT[FAU_NUM_TO_NAME_DICT[1]]

    cap = cv2.VideoCapture(0)

    max_val, min_val = 0, 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        lm, yaw_deg, pitch_deg, roll_deg, rot_mat = lm_detector.detect(rgb_frame)


        # print(f"yaw_deg: {yaw_deg} pitch_deg: {pitch_deg} roll_deg: {roll_deg}")
        
        

        frame = build_display(frame, lm, yaw_deg, pitch_deg, roll_deg, facs_balance_detector_list[0])

        
        for facs_detector in facs_balance_detector_list:
            for i,  facs_balance_detector in enumerate(facs_balance_detector_list):
                facs_balance_val = facs_balance_detector.get_FACS_balance_val(lm) 
                
                label = f"{facs_balance_detector.name}: {facs_balance_val:.3f}"

                x = margin
                y = margin + (i + 1) * line_gap

                # Dark shadow for readability
                cv2.putText(frame, label, (x + 1, y + 1), font, font_scale, (0, 0, 0),     thickness + 1, cv2.LINE_AA)
                cv2.putText(frame, label, (x,     y    ), font, font_scale, (255, 255, 255), thickness,    cv2.LINE_AA)



        

        cv2.imshow("Face Landmarks", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
   main()