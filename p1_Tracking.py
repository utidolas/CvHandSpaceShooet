import cv2
import mediapipe as mp
import urllib.request
import time
import os

# task api imports
BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

# downloadm odel if missing
MODEL_PATH = "hand_landmarker.task"
MODEL_URL  = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

if not os.path.exists(MODEL_PATH):
    print("Downloading hand_landmarker.task …")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("Download complete.")

# hand connections as defined by MediaPipe — used for drawing skeleton lines

HAND_CONNECTIONS = [
    (0, 1),  (1, 2),  (2, 3),  (3, 4),   # thumb
    (0, 5),  (5, 6),  (6, 7),  (7, 8),   # index
    (0, 9),  (9, 10), (10, 11),(11, 12),  # middle
    (0, 13),(13, 14), (14, 15),(15, 16),  # ring
    (0, 17),(17, 18), (18, 19),(19, 20),  # pinky
    (5, 9),  (9, 13), (13, 17),           # palm knuckle line
]

LANDMARK_NAMES = [
    "WRIST",
    "THUMB_CMC",  "THUMB_MCP",  "THUMB_IP",   "THUMB_TIP",
    "INDEX_MCP",  "INDEX_PIP",  "INDEX_DIP",  "INDEX_TIP",
    "MIDDLE_MCP", "MIDDLE_PIP", "MIDDLE_DIP", "MIDDLE_TIP",
    "RING_MCP",   "RING_PIP",   "RING_DIP",   "RING_TIP",
    "PINKY_MCP",  "PINKY_PIP",  "PINKY_DIP",  "PINKY_TIP",
]

def draw_hand(frame, hand_landmarks, handedness_label):
    """Draw skeleton and dots on frame using pure OpenCV."""
    h, w = frame.shape[:2]

    # Convert normalised coords → pixel coords once
    pts = [
        (int(lm.x * w), int(lm.y * h))
        for lm in hand_landmarks
    ]

    # Bones
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (80, 200, 120), 2, cv2.LINE_AA)

    # Joints — fingertips slightly larger
    fingertips = {4, 8, 12, 16, 20}
    for i, (x, y) in enumerate(pts):
        r = 6 if i in fingertips else 4
        cv2.circle(frame, (x, y), r, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, (x, y), r, (80, 200, 120),  1,  cv2.LINE_AA)

    # Handedness label above the wrist
    wx, wy = pts[0]
    cv2.putText(frame, handedness_label, (wx - 20, wy - 14),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (88, 205, 54), 2, cv2.LINE_AA)

    return pts   # return pixel coords — useful for Phase 3 gesture work


# landmarker
options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.VIDEO,
    num_hands=1,
    min_hand_detection_confidence=0.7,
    min_hand_presence_confidence=0.7,
    min_tracking_confidence=0.5,
)

# camera setup
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

# fPS fix
fps_counter = 0
fps_display = 0.0
fps_timer   = time.time()

print("Phase 1 running — press Q to quit")
print("──────────────────────────────────")

with HandLandmarker.create_from_options(options) as landmarker:
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("Camera read failed — check device index (currently 0)")
            break

        frame = cv2.flip(frame, 1)  # mirror so movement feels natural

        # Wrap frame for Tasks API — must be RGB, not BGR
        rgb      = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # VIDEO mode requires a monotonically increasing timestamp in ms
        timestamp_ms = int(time.time() * 1000)
        result       = landmarker.detect_for_video(mp_image, timestamp_ms)

        # ── Draw & print ──────────────────────────────────────────────────────
        if result.hand_landmarks:
            for i, hand_landmarks in enumerate(result.hand_landmarks):
                label = result.handedness[i][0].display_name
                pts   = draw_hand(frame, hand_landmarks, label)

                # Print each landmark once to confirm tracking is live.
                # Comment this block out after your first successful run —
                # 21 prints × 30fps floods the terminal and slows the loop.
                h, w = frame.shape[:2]
                for j, lm in enumerate(hand_landmarks):
                    print(f"  [{j:02d}] {LANDMARK_NAMES[j]:<12}  "
                          f"norm=({lm.x:.3f}, {lm.y:.3f}, {lm.z:.3f})  "
                          f"px={pts[j]}")
                print("──────────────────────────────────")
        else:
            cv2.putText(frame, "No hand detected", (20, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (80, 80, 80), 2,
                        cv2.LINE_AA)

        # FPS
        fps_counter += 1
        elapsed = time.time() - fps_timer
        if elapsed >= 1.0:
            fps_display = fps_counter / elapsed
            fps_counter = 0
            fps_timer   = time.time()

        cv2.putText(frame, f"FPS: {fps_display:.1f}", (20, 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 120), 2,
                    cv2.LINE_AA)

        cv2.imshow("Phase 1 — Hand Tracking", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

cap.release()
cv2.destroyAllWindows()
print("Done.")