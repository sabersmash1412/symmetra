from detector import Lm_Detector
from variables import AU_TO_LM_ARR_DICT_LEFT, AU_TO_LM_ARR_DICT_RIGHT, FAU_NUM_TO_NAME_DICT, YAW_THRESHOLD_DEG, PITCH_THRESHOLD_DEG, ROW_THRESHOLD_DEG
from facs_utils import FACS_IMBALANCE_DETECTOR_LIST

import os
import cv2
import numpy as np

# Compute and draw FACS balance values (top-left)
font       = cv2.FONT_HERSHEY_SIMPLEX
font_scale = 0.55
thickness  = 1
line_gap   = 22
margin     = 10


def ensure_flat(indexes):
    """Flatten if 2D (list of lists), leave as-is if already 1D."""
    if indexes and isinstance(indexes[0], (list, tuple)):
        return [idx for sublist in indexes for idx in sublist]
    return list(indexes)


def draw_landmarks(frame, face_landmarks, highlight_indexes=None, highlight_color=(0, 255, 0)):
    """Draw face landmarks on frame. Highlighted indexes drawn red, rest green."""
    
    if highlight_indexes is None:
        highlight_indexes = []

    highlight_indexes = ensure_flat(highlight_indexes)


    print(highlight_indexes)


    h, w = frame.shape[:2]

    for idx in highlight_indexes:
        
        lm = face_landmarks[idx]
        x = int(lm.x * w)
        y = int(lm.y * h)
        cv2.circle(frame, (x, y), 1, highlight_color, -1)

    return frame

COLOUR_SATURATION_THRESHOLD = 0.5  # tune this: value at which colour becomes fully red

def value_to_color(magnitude: float) -> tuple:
    """
    Nonlinear green -> yellow -> red gradient.
    Saturates to full red at COLOUR_SATURATION_THRESHOLD instead of 1.0.
    """
    # Normalise so saturation_threshold maps to 1.0
    t = np.clip(abs(magnitude) / COLOUR_SATURATION_THRESHOLD, 0.0, 1.0)
    
    # Nonlinear curve: makes small changes more visible
    t = t ** 0.5  # square root — accelerates early colour change

    # Green (0,255,0) -> Yellow (0,255,255) -> Red (0,0,255) in BGR
    if t < 0.5:
        # Green to Yellow: increase blue channel (BGR: blue goes 0->255)
        green = 255
        blue  = int(255 * (t * 2))
    else:
        # Yellow to Red: decrease green channel
        green = int(255 * ((1.0 - t) * 2))
        blue  = 255

    return (0, green, blue)  # BGR

def build_display(frame, face_landmarks, facs_name, facs_value):
    right_indexes = AU_TO_LM_ARR_DICT_RIGHT.get(facs_name, [])
    left_indexes  = AU_TO_LM_ARR_DICT_LEFT.get(facs_name, [])

    magnitude = np.clip(abs(facs_value), 0.0, 1.0)  # clamp to [0,1] for color blend
    blend_color = value_to_color(magnitude)

    # Right side magnitude, left side by green
    if facs_value >= 1.0:
        draw_landmarks(frame, face_landmarks, highlight_indexes=left_indexes, highlight_color=(0, 255, 0))
        draw_landmarks(frame, face_landmarks, highlight_indexes=right_indexes, highlight_color=blend_color)
        

    elif facs_value <= -1.0:
        draw_landmarks(frame, face_landmarks, highlight_indexes=right_indexes, highlight_color=(0, 255, 0))
        draw_landmarks(frame, face_landmarks, highlight_indexes=left_indexes, highlight_color=blend_color)
    else:
        draw_landmarks(frame, face_landmarks, highlight_indexes=right_indexes + left_indexes, highlight_color=(0, 255, 0))

    return frame


def get_facs_balance_val(face_landmarks, facs_balance_detector_list):

    facs_balance_val_dict = {}
    for facs_balance_detector in facs_balance_detector_list:
        facs_val = facs_balance_detector.get_FACS_balance_val(face_landmarks)

        facs_balance_val_dict[facs_balance_detector.name] = facs_val
    
    return facs_balance_val_dict


def label_img(frame, lm_detector, facs_balance_detector_list, add_text_label=False, check_frontal=True):
    lm, yaw_deg, pitch_deg, roll_deg, rot_mat = lm_detector.detect(frame)

    is_frontal = (abs(yaw_deg)   < YAW_THRESHOLD_DEG and
            abs(pitch_deg) < PITCH_THRESHOLD_DEG and
            abs(roll_deg)  < ROW_THRESHOLD_DEG)
    
    # no process if not frontal
    if check_frontal and not is_frontal:
        return frame

    # go through each facs imbalance detector and draw results
    for i,  facs_balance_detector in enumerate(facs_balance_detector_list):
        facs_balance_val = facs_balance_detector.get_FACS_balance_val(lm) 

        frame = build_display(frame, lm, facs_balance_detector.name, facs_balance_val)

        if add_text_label:
            label = f"{facs_balance_detector.name}: {facs_balance_val:.3f}"

            x = margin
            y = margin + (i + 1) * line_gap

            # Dark shadow for readability
            cv2.putText(frame, label, (x + 1, y + 1), font, font_scale, (0, 0, 0),     thickness + 1, cv2.LINE_AA)
            cv2.putText(frame, label, (x,     y    ), font, font_scale, (255, 255, 255), thickness,    cv2.LINE_AA)

    return frame


def main_video(lm_detector, facs_balance_detector_list, add_text_label=True):
    cap = cv2.VideoCapture(0)
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        cv2.imshow("application", label_img(frame, lm_detector, facs_balance_detector_list, add_text_label=add_text_label))
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


VALID_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}

def main_label_image(
    input_image_or_path,
    lm_detector,
    facs_balance_detector_list,
    output_folder_path,
    output_image_name=None,
    add_text_label=True,
    show_image=False,
    save_image=False
):

    print(f"[INFO] Processing: {input_image_or_path}")  
    # Case 1: path to a folder — recurse over all valid images
    if isinstance(input_image_or_path, str) and os.path.isdir(input_image_or_path):
        for root, _, files in os.walk(input_image_or_path):
            for fname in files:
                if os.path.splitext(fname)[1].lower() in VALID_EXTS:
                    # Mirror subfolder structure under output_folder_path
                    rel_root   = os.path.relpath(root, input_image_or_path)
                    out_folder = os.path.join(output_folder_path, rel_root)
                    main_label_image(
                        os.path.join(root, fname), 
                        lm_detector,
                        facs_balance_detector_list, 
                        out_folder, 
                        output_image_name,
                        add_text_label,
                        show_image,
                        save_image)
    
    # Case 2: path to a single image file
    elif isinstance(input_image_or_path, str) and os.path.isfile(input_image_or_path):
        if os.path.splitext(input_image_or_path)[1].lower() not in VALID_EXTS:
            print(f"[WARN] Unsupported file type: {input_image_or_path}")
            return
        
        image = cv2.imread(input_image_or_path)

        if image is None:
            print(f"[WARN] Could not read image: {input_image_or_path}")
            return
        
        main_label_image(
            image, 
            lm_detector,
            facs_balance_detector_list, 
            output_folder_path, 
            output_image_name,
            add_text_label,
            show_image,
            save_image)    
        
    # Case 1: numpy array passed directly
    elif isinstance(input_image_or_path, np.ndarray):
        labelled = label_img(input_image_or_path, lm_detector, facs_balance_detector_list, add_text_label=add_text_label, check_frontal=False)
        os.makedirs(output_folder_path, exist_ok=True)

        print(f"[INFO] Output folder: {output_folder_path}")

        fname = output_image_name if output_image_name else "labelled_image.jpg"

        if save_image:
            save_path = os.path.join(output_folder_path, fname)
            cv2.imwrite(save_path, labelled)
            print(f"[SAVED] {save_path}")

        if show_image:
            cv2.imshow("Labelled", labelled)
            cv2.waitKey(0)
            cv2.destroyAllWindows()

    else:
        raise ValueError(f"Invalid input: {input_image_or_path!r} is not a numpy array, file, or directory.")
    



if __name__ == "__main__":
    lm_detector = Lm_Detector()

    facs_balance_detector_list = [detector() for detector in FACS_IMBALANCE_DETECTOR_LIST]


    # main_video(lm_detector, facs_balance_detector_list)

    img_folder_path = "./data/facial_palsy_patient_img/not_labelled"

    main_label_image(
        input_image_or_path=img_folder_path,
        lm_detector=lm_detector,
        facs_balance_detector_list=facs_balance_detector_list,
        output_folder_path="./data/facial_palsy_patient_img/labelled",
        add_text_label=True,
        show_image=True,
        save_image=True
    )