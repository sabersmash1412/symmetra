"""
Face Mirror Script
------------------
- Captures webcam feed
- Detects face using MediaPipe Face Landmarker (478 landmarks)
- Checks if face is frontal using yaw angle from transformation matrix
- If frontal: crops face, mirrors each half, shows 2 separate windows
- If not frontal: shows original camera feed with a warning overlay

Requirements:
    pip install mediapipe opencv-python numpy

MediaPipe model download (run once):
    The script auto-downloads face_landmarker.task from Google's CDN.
"""

from variables import FACE_PADDING, MODEL_PATH, MODEL_URL

import cv2
import numpy as np
import mediapipe as mp
import urllib.request
import os

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

# ─────────────────────────────────────────────
# DOWNLOAD MODEL IF NEEDED
# ─────────────────────────────────────────────
def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print(f"[INFO] Downloading MediaPipe Face Landmarker model...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print(f"[INFO] Model saved to: {MODEL_PATH}")
    else:
        print(f"[INFO] Model found: {MODEL_PATH}")

# ─────────────────────────────────────────────
# DECOMPOSE ROTATION MATRIX → YAW / PITCH / ROLL
# ─────────────────────────────────────────────
def rotation_matrix_to_euler(R):
    """
    Extract Euler angles (degrees) from a 3x3 rotation matrix.
    MediaPipe coordinate convention:
        yaw   = rotation around Y axis  (turning head left/right) ← frontality check
        pitch = rotation around X axis  (nodding up/down)
        roll  = rotation around Z axis  (tilting head sideways)
    """
    # Yaw: Y-axis — head turning left/right
    yaw   = np.arctan2(-R[2, 0], np.sqrt(R[2, 1]**2 + R[2, 2]**2))

    # Pitch: X-axis — nodding
    pitch = np.arctan2( R[2, 1],  R[2, 2])

    # Roll: Z-axis — head tilt
    roll  = np.arctan2( R[1, 0],  R[0, 0])

    return (
        np.degrees(yaw),
        np.degrees(pitch),
        np.degrees(roll),
    )


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
WINDOW_NAME = "Facial Palsy Monitor"


def create_landmarker_detector():

    ensure_model()

    BaseOptions        = mp.tasks.BaseOptions
    FaceLandmarker     = mp.tasks.vision.FaceLandmarker
    FaceLandmarkerOpts = mp.tasks.vision.FaceLandmarkerOptions
    VisionRunningMode  = mp.tasks.vision.RunningMode

    options = FaceLandmarkerOpts(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.IMAGE,
        num_faces=1,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=True,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
    )

    return FaceLandmarker.create_from_options(options)


class Lm_Detector:

    def __init__(self):
        self._detector = create_landmarker_detector()

    def detect(self, rgb_img):
        """
        return the first face landmarks, yaw, pitch and roll
        """
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_img)

        result = self._detector.detect(mp_image)

        # print(f"Detected {len(result.face_landmarks)} faces")

        matrix_raw = result.facial_transformation_matrixes[0]

        M = np.array(matrix_raw.data).reshape(4, 4)
        R = M[:3, :3]
        yaw_deg, pitch_deg, roll_deg = rotation_matrix_to_euler(R)
        
        return result.face_landmarks[0], yaw_deg, pitch_deg, roll_deg, R



 
