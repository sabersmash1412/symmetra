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
# CROP FACE FROM FRAME USING LANDMARKS
# ─────────────────────────────────────────────
def crop_face(frame, landmarks, padding=FACE_PADDING):
    """
    Tight crop around all 478 landmarks with padding.
    Returns cropped image and the (x1, y1) offset for coordinate mapping.
    """
    h, w = frame.shape[:2]
    xs = [lm.x * w for lm in landmarks]
    ys = [lm.y * h for lm in landmarks]

    x_min, x_max = int(min(xs)), int(max(xs))
    y_min, y_max = int(min(ys)), int(max(ys))

    pad_x = int((x_max - x_min) * padding)
    pad_y = int((y_max - y_min) * padding)

    x1 = max(0, x_min - pad_x)
    y1 = max(0, y_min - pad_y)
    x2 = min(w, x_max + pad_x)
    y2 = min(h, y_max + pad_y)

    return frame[y1:y2, x1:x2], (x1, y1)

# ─────────────────────────────────────────────
# SPLIT FACE AND MIRROR EACH HALF
# ─────────────────────────────────────────────
def make_mirrored_halves(face_crop, landmarks, offset, frame_shape):
    """
    1. Find midline x from nose landmark (index 1 = nose tip) in crop space.
    2. Split crop into left/right halves.
    3. Mirror each half to produce two full-width symmetric face images.
    Returns: (left_mirrored, right_mirrored)
    """
    h_frame, w_frame = frame_shape[:2]
    ox, oy = offset
    crop_h, crop_w = face_crop.shape[:2]

    # Nose tip landmark index = 1 (MediaPipe canonical)
    nose_lm = landmarks[1]
    nose_x_global = nose_lm.x * w_frame
    midline_x = int(nose_x_global - ox)   # midline in crop coordinates
    midline_x = np.clip(midline_x, 1, crop_w - 1)

    # ── LEFT half (user's left, i.e. right side of image) ──
    left_half  = face_crop[:, :midline_x]          # pixels left of midline
    # Mirror: flip horizontally and paste next to original
    left_mirror = np.hstack([left_half, cv2.flip(left_half, 1)])

    # ── RIGHT half (user's right, i.e. left side of image) ──
    right_half  = face_crop[:, midline_x:]
    right_mirror = np.hstack([cv2.flip(right_half, 1), right_half])

    # Resize both to the same width for consistent display
    target_w = crop_w
    left_display  = cv2.resize(left_mirror,  (target_w, crop_h))
    right_display = cv2.resize(right_mirror, (target_w, crop_h))

    return left_display, right_display

# ─────────────────────────────────────────────
# DRAW LANDMARKS ON FRAME (optional overlay)
# ─────────────────────────────────────────────
def draw_landmarks(frame, landmarks):
    h, w = frame.shape[:2]
    for lm in landmarks:
        x, y = int(lm.x * w), int(lm.y * h)
        cv2.circle(frame, (x, y), 1, (0, 255, 0), -1)

# ─────────────────────────────────────────────
# OVERLAY LABELS — top-right corner
# Takes a dict e.g. {"Yaw": "3.2°", "AU12": "0.85"}
# Prints each key: value line by line, right-aligned
# ─────────────────────────────────────────────
def draw_overlay_labels(frame, labels: dict,
                         font=cv2.FONT_HERSHEY_SIMPLEX,
                         font_scale=0.55,
                         thickness=1,
                         line_gap=22,
                         margin=10,
                         text_color=(255, 255, 255),
                         bg_color=(0, 0, 0)):
    """
    Render a dict of labels on the top-right corner of frame, in-place.

    Args:
        frame      : BGR image (modified in-place)
        labels     : dict — keys and values are converted to strings.
                     Rendered as "key: value" lines top-to-bottom.
        font_scale : text size
        line_gap   : vertical pixels between lines
        margin     : padding from right/top edges
        text_color : (B, G, R)
        bg_color   : semi-transparent background rectangle color
    """
    h, w = frame.shape[:2]
    lines = [f"{k}: {v}" for k, v in labels.items()]

    # Measure max text width for background rectangle
    max_text_w = 0
    text_h = 0
    for line in lines:
        (tw, th), baseline = cv2.getTextSize(line, font, font_scale, thickness)
        max_text_w = max(max_text_w, tw)
        text_h = th

    total_h = len(lines) * line_gap + margin
    x1 = w - max_text_w - margin * 2
    y1 = margin

    # Draw semi-transparent background
    overlay = frame.copy()
    cv2.rectangle(overlay, (x1 - 5, y1 - 5),
                  (w - margin + 5, y1 + total_h), bg_color, -1)
    cv2.addWeighted(overlay, 0.45, frame, 0.55, 0, frame)

    # Draw each line right-aligned
    for i, line in enumerate(lines):
        (tw, _), _ = cv2.getTextSize(line, font, font_scale, thickness)
        x = w - tw - margin
        y = y1 + (i + 1) * line_gap
        # thin dark shadow for readability
        cv2.putText(frame, line, (x + 1, y + 1), font,
                    font_scale, (0, 0, 0), thickness + 1, cv2.LINE_AA)
        cv2.putText(frame, line, (x, y), font,
                    font_scale, text_color, thickness, cv2.LINE_AA)

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

        matrix_raw = result.facial_transformation_matrixes[0]

        M = np.array(matrix_raw.data).reshape(4, 4)
        R = M[:3, :3]
        yaw_deg, pitch_deg, roll_deg = rotation_matrix_to_euler(R)
        
        return result.face_landmarks[0], yaw_deg, pitch_deg, roll_deg, R



 
