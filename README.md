# Facial Palsy FACS Balance Monitor

A real-time facial asymmetry detection system for assessing facial palsy using MediaPipe landmarks and Facial Action Coding System (FACS) analysis. The system computes left/right balance values for specific Facial Action Units (FAUs) to quantify muscle activation asymmetry — a key indicator of facial palsy severity and recovery.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Running the Code](#running-the-code)
- [Adding New FAU Detectors](#adding-new-fau-detectors)

---

## Overview

The system works by:

1. Detecting 478 facial landmarks in real-time using MediaPipe Face Landmarker
2. Estimating head pose (yaw, pitch, roll) from the facial transformation matrix
3. Gating analysis to only frontal-facing frames (within configurable thresholds)
4. Computing a **balance value** per FAU — how much more activated the left vs right side of the face is
5. Displaying these values as an overlay in real-time, or writing labelled output images for static test sets

A balance value of `0` means both sides are equally activated. A positive value means the right side is more activated; negative means the left side is more activated.

---

## Project Structure

```
.
├── application_pipeline.py   # Webcam loop, display logic, orchestration
├── detector.py               # MediaPipe landmark detection + head pose estimation
├── facs_utils.py             # FAU detector base class + concrete detector implementations
├── variables.py              # Landmark index mappings, thresholds, model config
└── test.py                   # Batch test on a folder of static images
```

### `detector.py`
Wraps MediaPipe's Face Landmarker. The `Lm_Detector` class exposes a single `detect(rgb_img)` method that returns:
- `face_landmarks` — list of 478 `NormalizedLandmark` objects (x, y, z in [0,1])
- `yaw_deg`, `pitch_deg`, `roll_deg` — head pose in degrees
- `R` — 3×3 rotation matrix


### `facs_utils.py`
Contains the abstract base class `FACS_balance_detector` and all concrete FAU detector implementations. Each detector takes the full landmark list and returns a signed float indicating left/right activation asymmetry.

Currently implemented detectors:
| Class | FAU | Description |
|---|---|---|
| `INNER_EYEBROW_RAISER_DETECTOR` | AU1 | Compares vertical centroid position of inner brow landmarks |
| `LIPS_PART_DETECTOR` | AU25 | Computes lip opening gap area on each side |
| `NOSE_WRINKLER_DETECTOR` | AU9 | Measures landmark cluster tightness on each nostril side |

### `variables.py`
Central configuration file. Contains:
- `AU_TO_LM_ARR_DICT_LEFT` / `AU_TO_LM_ARR_DICT_RIGHT` — landmark index arrays per FAU per side
- `FAU_NUM_TO_NAME_DICT` — FACS AU number → string name
- `YAW_THRESHOLD_DEG`, `PITCH_THRESHOLD_DEG`, `ROW_THRESHOLD_DEG` — frontality gate thresholds
- Model path and download URL

### `application_pipeline.py`
Main webcam application. Captures frames, runs landmark detection, checks frontality, and renders FAU balance values as a text overlay on the live feed.

### `test.py`
This script is for testing of the effect of each FAU balance detector. 

Batch processing script for static images. Reads images from `./data/facial_palsy_patient_img/not_labelled/`, runs detection, draws highlighted landmarks and FAU balance values, and saves labelled outputs to `./data/facial_palsy_patient_img/labelled/`.

---

## Setup & Installation

```bash
pip install mediapipe opencv-python numpy torch torchvision tqdm
```

The MediaPipe face landmarker model is automatically downloaded on first run to `model_weights/face_landmarker.task`.

---

## Running the Code

### Real-time webcam monitor

```bash
python application_pipeline.py
```

- Opens your default webcam (`cv2.VideoCapture(0)`)
- Displays FAU balance values as a white text overlay (top-left)
- Only computes values when the face is frontal (within yaw/pitch/roll thresholds)
- Press `q` to quit

### Image based FAU balance testing

```bash
python test.py
```

Expects the following folder structure:
```
data/
└── facial_palsy_patient_img/
    ├── not_labelled/   ← input images go here
    └── labelled/       ← labelled output images written here
```

Produces images with:
- Green landmarks for all 478 points
- Red landmarks for the specific AU-relevant indices
- FAU balance values printed top-left

---

## Adding New FAU Detectors

### Step 1 — Define landmark indices in `variables.py`

Add entries to both `AU_TO_LM_ARR_DICT_LEFT` and `AU_TO_LM_ARR_DICT_RIGHT` for your new FAU. Use [MediaPipe's face landmark map](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) to identify the relevant indices for the left and right sides of the face.

```python
# variables.py

AU_TO_LM_ARR_DICT_LEFT = {
    # ... existing entries ...
    "Lip_Corner_Puller": [61, 185, 40, 39],   # ← add your new entry
}

AU_TO_LM_ARR_DICT_RIGHT = {
    # ... existing entries ...
    "Lip_Corner_Puller": [291, 409, 270, 269], # ← mirrored equivalent
}
```

> **Tip:** For AUs involving area or opening (like lips), store indices as a list of lists — `[upper_indices, lower_indices]` — as done for `Lips_Part`. For point-cluster AUs, a flat list is sufficient.

### Step 2 — Implement the detector class in `facs_utils.py`

Subclass `FACS_balance_detector` and implement `get_FACS_balance_val`. The method receives the full 478-landmark list and must return a signed float.

```python
# facs_utils.py

class LIP_CORNER_PULLER_DETECTOR(FACS_balance_detector):
    def __init__(self):
        super().__init__("Lip_Corner_Puller")  # must match the key in AU_TO_LM_ARR_DICT_*

    def get_FACS_balance_val(self, landmarks) -> float:
        """
        Returns:
            float: positive = right more activated,
                   negative = left more activated,
                   0        = balanced
        """
        left_centroid  = get_centroid(landmarks, AU_TO_LM_ARR_DICT_LEFT[self.name])
        right_centroid = get_centroid(landmarks, AU_TO_LM_ARR_DICT_RIGHT[self.name])

        # Example: compare horizontal displacement from resting position
        # Adjust the geometry to suit the AU's physical motion
        return float(left_centroid[0] - right_centroid[0]) * 100
```
