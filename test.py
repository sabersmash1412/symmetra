from application_pipeline import get_facs_balance_val
from facs_utils import LIPS_PART_DETECTOR, INNER_EYEBROW_RAISER_DETECTOR, NOSE_WRINKLER_DETECTOR
from detector import Lm_Detector
from variables import AU_TO_LM_ARR_DICT_LEFT, AU_TO_LM_ARR_DICT_RIGHT

import os
import cv2
from tqdm import tqdm

# Compute and draw FACS balance values (top-left)
font       = cv2.FONT_HERSHEY_SIMPLEX
font_scale = 0.55
thickness  = 1
line_gap   = 22
margin     = 10

detector_list = [LIPS_PART_DETECTOR(), INNER_EYEBROW_RAISER_DETECTOR(), NOSE_WRINKLER_DETECTOR()]



img_folder_path = "./data/normal"
detector = Lm_Detector()

for img_filename in tqdm(os.listdir(os.path.join(img_folder_path, "not_labelled")), desc="detect landmarks in images: "):
    print(f"[test]: {img_filename}")
    img = cv2.imread(os.path.join(img_folder_path, "not_labelled", img_filename))
    h, w = img.shape[:2]
    
    landmark, _, _, _, _ = detector.detect(img)
      
    highlighted_index =  AU_TO_LM_ARR_DICT_LEFT["Inner_Brow_Raiser"] + AU_TO_LM_ARR_DICT_LEFT["Lips_Part"][0] + AU_TO_LM_ARR_DICT_LEFT["Lips_Part"][1] + AU_TO_LM_ARR_DICT_LEFT["Nose_Wrinkler"] + \
                        AU_TO_LM_ARR_DICT_RIGHT["Inner_Brow_Raiser"] + AU_TO_LM_ARR_DICT_RIGHT["Lips_Part"][0] + AU_TO_LM_ARR_DICT_RIGHT["Lips_Part"][1]  + AU_TO_LM_ARR_DICT_RIGHT["Nose_Wrinkler"]


    for idx, lm in enumerate(landmark):
        x = int(lm.x * w)
        y = int(lm.y * h)
        if idx in highlighted_index:
            cv2.circle(img, (x, y), 1, (0, 0, 255), -1)
        else:
            cv2.circle(img, (x, y), 1, (0 , 255, 0), -1)

    

    for i,  facs_balance_detector in enumerate(detector_list):
        facs_balance_val = facs_balance_detector.get_FACS_balance_val(landmark) 
        
        label = f"{facs_balance_detector.name}: {facs_balance_val:.3f}"

        x = margin
        y = margin + (i + 1) * line_gap

        # Dark shadow for readability
        cv2.putText(img, label, (x + 1, y + 1), font, font_scale, (0, 0, 0),     thickness + 1, cv2.LINE_AA)
        cv2.putText(img, label, (x,     y    ), font, font_scale, (255, 255, 255), thickness,    cv2.LINE_AA)



    cv2.imwrite(os.path.join(img_folder_path, "labelled", f"labelled_{img_filename}"), img)
