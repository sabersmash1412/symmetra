FAU_NUM_TO_NAME_DICT = {1: 'Inner_Brow_Raiser',
                        2: 'Outer_Brow_Raiser',
                        4: 'Brow_Lowerer',
                        5: 'Upper_Lid_Raiser',
                        6: 'Cheek_Raiser',
                        9: 'Nose_Wrinkler',
                        12: 'Lip_Corner_Puller',
                        15: 'Lip_Corner_Depressor',
                        17: 'Chin_Raiser',
                        20: 'Lip_Stretcher',
                        25: 'Lips_Part',
                        26: 'Jaw_Drop'}

AU_INDEX_LIST = [1, 2, 4, 5, 6, 9, 12, 15, 17, 20, 25, 26]

AU_INDEX_TO_LABEL_INDEX_DICT = {1: 0,
                                2: 1,
                                4: 2,
                                5: 3,
                                6: 4,
                                9: 5,   
                                12: 6,
                                15: 7,
                                17: 8,
                                20: 9,
                                25: 10,
                                26: 11}


ZERO_AU_FOLDER_NAME = "all_au_zero"

import torch
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

from torchvision import transforms

IMG_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                        std=[0.229, 0.224, 0.225])
])


YAW_THRESHOLD_DEG   = 4     # degrees — beyond this, face is considered off-axis
ROW_THRESHOLD_DEG   = 4     # degrees — beyond this, head tilt is severe
PITCH_THRESHOLD_DEG = 15     # degrees — beyond this, nodding is severe

FACE_PADDING        = 0.25   # fractional padding around the face crop (0.25 = 25%)
MODEL_PATH          = "model_weights/face_landmarker.task"
MODEL_URL           = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)

AU_TO_LM_ARR_DICT_LEFT = {
    'Inner_Brow_Raiser': [
        103, 67, 109,
        104, 69, 108,
        105, 66, 107, 
        52, 65, 55 
    ],
    "Lips_Part": [
        # upper lip
        [        
            # 185, 40, 39, 37,
            # 184, 74, 73, 72, 
            # 183, 42, 41, 38,
            191, 80, 81, 82,
        ], 

        # lower lip
        [ 
            95, 77, 178, 87
            # 86, 179, 89, 96,
            # 85, 180, 90, 77,
            # 84, 181, 91, 146
        ]
    ],
    "Nose_Wrinkler": [
         232, 128, 188,
         121, 196,
         47, 114, 174,
         126, 217, 
        209, 198, 236, 3
    ],
    "Lip_Corner_Puller": [
        [62], # lip corner
        [50, 36, 205, 206, 
         207, 187, 216]   # cheek
    ]
}

AU_TO_LM_ARR_DICT_RIGHT = {
    'Inner_Brow_Raiser': [
        332, 297, 338,
        333, 299, 337,
        334, 296, 336,
        282, 295, 285
    ],
    "Lips_Part": [
        # upper lip
        [        
            # 267, 269, 270, 409,
            # 302, 303, 304, 408,
            # 268, 271, 272, 407,
            312, 311, 310, 415
        ], 

        # lower lip
        [ 
            317, 402, 318, 324,
            # 316, 403, 319, 325,
            # 315, 404, 320, 307,
            # 314, 405, 321, 375
        ]
    ],
    "Nose_Wrinkler": [
         452, 357, 412, 419,
         350, 343, 399, 
         277, 437, 
         355, 
        429, 420, 456, 248
    ],
    "Lip_Corner_Puller": [
        [291], # lip corner
        [266, 280, 425, 411, 
         427, 436, 427]   # cheek
    ]
}

