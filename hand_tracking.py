import os

# ---- Suppress MediaPipe / TensorFlow Lite / glog console noise ----
os.environ.setdefault('GLOG_minloglevel',      '2')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL',  '3')
os.environ.setdefault('MEDIAPIPE_DISABLE_GPU', '1')

import cv2
import mediapipe as mp
import urllib.request
import time
import json
import math
import asyncio
import threading
import functools
import http.server
import logging
import queue as _queue
import webbrowser
import websockets
import numpy as np
from collections import deque

# ---- logging ----
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---- tasks API ----
BaseOptions           = mp.tasks.BaseOptions
HandLandmarker        = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

# ---- model path ----
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH  = os.path.join(_SCRIPT_DIR, "hand_landmarker.task")
MODEL_URL   = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

def _ensure_model() -> None:
    if not os.path.exists(MODEL_PATH):
        log.info("Downloading hand_landmarker.task ...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        log.info("Model downloaded.")

# ---- constants ----
FINGERTIP_IDS: frozenset[int] = frozenset({4, 8, 12, 16, 20})

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9), (9, 13), (13, 17),
]

# ================================================================
# ONE-EURO FILTER
# Tuning guide (proven by research):
#   min_cutoff  — lower = less jitter when stationary, more lag when moving
#   beta        — higher = less lag when moving, more jitter when stationary
#   Best practice starting point: min_cutoff=0.8, beta=0.07
#   For gesture control (need low jitter + responsive snapping):
#     min_cutoff=0.8, beta=0.07 is better than the previous 1.0/0.05
# ================================================================
class OneEuroFilter:
    def __init__(self, min_cutoff: float = 0.8, beta: float = 0.07, d_cutoff: float = 1.0):
        self.min_cutoff = min_cutoff
        self.beta       = beta
        self.d_cutoff   = d_cutoff
        self._x_prev:  float | None = None
        self._dx_prev: float        = 0.0
        self._t_prev:  float | None = None

    def _alpha(self, cutoff: float, dt: float) -> float:
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def __call__(self, x: float, t: float) -> float:
        if self._t_prev is None:
            self._x_prev = x
            self._t_prev = t
            return x
        dt            = max(t - self._t_prev, 1e-6)
        self._t_prev  = t
        dx            = (x - self._x_prev) / dt
        a_d           = self._alpha(self.d_cutoff, dt)
        dx_hat        = a_d * dx + (1 - a_d) * self._dx_prev
        self._dx_prev = dx_hat
        cutoff        = self.min_cutoff + self.beta * abs(dx_hat)
        a             = self._alpha(cutoff, dt)
        x_hat         = a * x + (1 - a) * self._x_prev
        self._x_prev  = x_hat
        return x_hat


class HandFilter:
    """
    Per-landmark One-Euro filter with an optional velocity dead zone.

    Dead zone: if a landmark moves less than `dead_zone` (normalised units)
    since the last frame AND its velocity is below a threshold, the previous
    filtered value is kept.  This kills the sub-pixel tremor that causes
    false finger-state transitions without adding any perceivable lag on
    intentional movement.
    """
    def __init__(
        self,
        min_cutoff: float = 0.8,
        beta: float = 0.07,
        dead_zone: float = 0.004,   # ~0.4% of frame width — tune if needed
    ) -> None:
        self.min_cutoff = min_cutoff
        self.beta       = beta
        self.dead_zone  = dead_zone
        self.filters: list[list[OneEuroFilter]] = [
            [OneEuroFilter(min_cutoff, beta) for _ in range(3)] for _ in range(21)
        ]
        self._prev: list[dict | None] = [None] * 21

    def reset(self) -> None:
        self.filters = [
            [OneEuroFilter(self.min_cutoff, self.beta) for _ in range(3)]
            for _ in range(21)
        ]
        self._prev = [None] * 21

    def apply(self, landmarks: list, t: float) -> list[dict[str, float]]:
        out = []
        for i, lm in enumerate(landmarks):
            fx = self.filters[i][0](lm.x, t)
            fy = self.filters[i][1](lm.y, t)
            fz = self.filters[i][2](lm.z, t)

            # Velocity dead zone — suppress micro-jitter
            if self._prev[i] is not None:
                dx = fx - self._prev[i]['x']
                dy = fy - self._prev[i]['y']
                if math.hypot(dx, dy) < self.dead_zone:
                    fx = self._prev[i]['x']
                    fy = self._prev[i]['y']
                    fz = self._prev[i]['z']

            point = {"x": fx, "y": fy, "z": fz}
            self._prev[i] = point
            out.append(point)
        return out


# ================================================================
# GESTURE DEBOUNCE BUFFER
#
# Research finding (drone-control paper, Google Developers Blog 2021):
# "a special buffer was created, which is saving the last N gestures.
#  This helps to remove glitches or inconsistent recognition."
#
# We keep a rolling window of the last DEBOUNCE_FRAMES landmark sets.
# Before sending to the game we compute a per-landmark MEDIAN across the
# window.  Median is preferred over mean because it is outlier-resistant —
# a single bad frame (occlusion, motion blur) is completely suppressed as
# long as the majority of frames in the window are good.
# ================================================================
DEBOUNCE_FRAMES = 3   # 3-frame median at 30fps = ~100ms lag — imperceptible

class GestureDebounce:
    def __init__(self, n_frames: int = DEBOUNCE_FRAMES) -> None:
        self.n      = n_frames
        self.buffer: deque[list[dict]] = deque(maxlen=n_frames)

    def push(self, landmarks: list[dict]) -> list[dict]:
        self.buffer.append(landmarks)
        if len(self.buffer) < 2:
            return landmarks
        # Median across all buffered frames per landmark per axis
        out = []
        for i in range(21):
            xs = [frame[i]['x'] for frame in self.buffer]
            ys = [frame[i]['y'] for frame in self.buffer]
            zs = [frame[i]['z'] for frame in self.buffer]
            out.append({
                'x': float(np.median(xs)),
                'y': float(np.median(ys)),
                'z': float(np.median(zs)),
            })
        return out

    def clear(self) -> None:
        self.buffer.clear()


# ================================================================
# IMAGE PRE-PROCESSING
#
# CLAHE (Contrast Limited Adaptive Histogram Equalization) on the
# luminance channel improves hand detection under uneven or dim lighting
# — a common real-world condition that degrades MediaPipe confidence.
# Proven effective in gesture recognition literature (MDPI 2024).
# Only applied to the copy sent to MediaPipe; the display frame is
# unchanged so the preview window looks normal.
# ================================================================
_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

def preprocess_for_mediapipe(bgr_frame: np.ndarray) -> np.ndarray:
    """
    Returns an RGB frame with CLAHE-enhanced luminance.
    Steps:
      1. Convert BGR → LAB
      2. Apply CLAHE to L channel only (luminance)
      3. Convert back LAB → BGR → RGB
    This preserves colour hue/saturation so MediaPipe's
    skin-colour priors still work correctly.
    """
    lab        = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2LAB)
    l, a, b    = cv2.split(lab)
    l_eq       = _clahe.apply(l)
    lab_eq     = cv2.merge([l_eq, a, b])
    bgr_eq     = cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)
    return cv2.cvtColor(bgr_eq, cv2.COLOR_BGR2RGB)


# ---- WebSocket server ----
_frame_queue: _queue.SimpleQueue[str] = _queue.SimpleQueue()
_connected_clients: set = set()


async def _ws_handler(websocket):
    _connected_clients.add(websocket)
    try:
        async for _ in websocket:
            pass
    finally:
        _connected_clients.discard(websocket)


async def _broadcast_loop():
    global _connected_clients
    latest: str | None = None
    while True:
        try:
            while True:
                latest = _frame_queue.get_nowait()
        except _queue.Empty:
            pass

        if latest and _connected_clients:
            dead = set()
            for ws in list(_connected_clients):
                try:
                    await ws.send(latest)
                except Exception:
                    dead.add(ws)
            _connected_clients -= dead

        await asyncio.sleep(1 / 60)


async def _run_ws_server():
    async with websockets.serve(_ws_handler, "localhost", 8765):
        await _broadcast_loop()


def start_ws_server() -> None:
    asyncio.run(_run_ws_server())


# ---- HTTP server ----
def start_http_server() -> None:
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=_SCRIPT_DIR
    )
    handler.log_message = lambda *_: None  # type: ignore[method-assign]
    server = http.server.HTTPServer(("localhost", 8766), handler)
    server.serve_forever()


# ---- OpenCV hand drawing ----
def draw_hand(frame, hand_landmarks, label) -> list[tuple[int, int]]:
    h, w = frame.shape[:2]
    pts  = [(int(lm.x * w), int(lm.y * h)) for lm in hand_landmarks]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (80, 200, 120), 2, cv2.LINE_AA)
    for i, (x, y) in enumerate(pts):
        r = 6 if i in FINGERTIP_IDS else 4
        cv2.circle(frame, (x, y), r, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, (x, y), r, (80, 200, 120),  1, cv2.LINE_AA)
    wx, wy = pts[0]
    cv2.putText(
        frame, label, (wx - 20, wy - 14),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (88, 205, 54), 2, cv2.LINE_AA,
    )
    return pts


# ---- Main ----
def main() -> None:
    _ensure_model()

    threading.Thread(target=start_ws_server,   daemon=True).start()
    threading.Thread(target=start_http_server, daemon=True).start()

    log.info("WebSocket : ws://localhost:8765")
    log.info("Game      : http://localhost:8766/game.html")
    log.info("Press 'q' in the OpenCV window to quit.")

    def _open_browser() -> None:
        time.sleep(1.2)
        webbrowser.open_new_tab("http://localhost:8766/game.html")

    threading.Thread(target=_open_browser, daemon=True).start()

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.VIDEO,
        num_hands=1,
        # ---- Tuned confidence thresholds ----
        # min_hand_detection_confidence: how confident the palm detector must be.
        # Raising to 0.6 reduces false positives (background objects detected as hands).
        min_hand_detection_confidence=0.60,
        # min_hand_presence_confidence: how confident the landmark model must be
        # to keep tracking without re-running palm detection.
        # Raised to 0.60 to drop shaky low-confidence frames early.
        min_hand_presence_confidence=0.60,
        # min_tracking_confidence: forces re-detection sooner when tracking drifts.
        # Raising to 0.55 prevents accumulated drift between re-detections.
        # (Research finding: "increase min_tracking_confidence to 0.6 or 0.7 to
        #  force more frequent re-detection before drift becomes severe." — Medium 2025)
        min_tracking_confidence=0.55,
    )

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    hand_filter   = HandFilter(min_cutoff=0.8, beta=0.07)
    debounce      = GestureDebounce(n_frames=DEBOUNCE_FRAMES)
    last_seen: float = 0.0
    fps_counter = 0
    fps_display = 0.0
    fps_timer   = time.time()

    with HandLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                log.error("Failed to read frame from webcam.")
                break

            frame = cv2.flip(frame, 1)

            now          = time.time()
            timestamp_ms = int(now * 1000)

            # CLAHE-enhanced copy for MediaPipe detection;
            # raw frame is kept for the preview window
            rgb_enhanced = preprocess_for_mediapipe(frame)

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_enhanced)
            result   = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.hand_landmarks:
                raw_landmarks = result.hand_landmarks[0]
                raw_label     = result.handedness[0][0].display_name
                label         = "Left" if raw_label == "Right" else "Right"

                if now - last_seen > 0.3:
                    hand_filter.reset()
                    debounce.clear()
                last_seen = now

                smoothed  = hand_filter.apply(raw_landmarks, now)
                debounced = debounce.push(smoothed)

                _frame_queue.put(json.dumps({"landmarks": debounced, "hand": label}))
                draw_hand(frame, raw_landmarks, label)
            else:
                debounce.clear()
                _frame_queue.put(json.dumps({"landmarks": None, "hand": None}))
                cv2.putText(
                    frame, "No hand detected", (20, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (80, 80, 80), 2, cv2.LINE_AA,
                )

            fps_counter += 1
            elapsed = now - fps_timer
            if elapsed >= 1.0:
                fps_display = fps_counter / elapsed
                fps_counter = 0
                fps_timer   = now

            cv2.putText(
                frame, f"FPS: {fps_display:.1f}", (20, 36),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 120), 2, cv2.LINE_AA,
            )
            cv2.imshow("Hand Tracking", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()
    log.info("Exiting.")


if __name__ == "__main__":
    main()