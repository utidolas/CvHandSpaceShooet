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

class CameraReader:
    """
    Non-blocking webcam reader that captures in a background thread.
    ``read()`` always returns the most recently decoded frame with
    zero blocking time.
    """
    def __init__(self, index: int = 0):
        cap = cv2.VideoCapture(index)
        cap.set(cv2.CAP_PROP_FOURCC,      cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS,          60)   # ← request 60 fps
        cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)    # ← keep only latest frame
        self._cap     = cap
        self._frame:  np.ndarray | None = None
        self._lock    = threading.Lock()
        self._stopped = False
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self) -> None:
        while not self._stopped:
            ret, frame = self._cap.read()
            if ret:
                with self._lock:
                    self._frame = frame

    def read(self) -> tuple[bool, np.ndarray | None]:
        with self._lock:
            if self._frame is None:
                return False, None
            return True, self._frame.copy()

    def stop(self) -> None:
        self._stopped = True
        self._cap.release()

    @property
    def cap(self):
        return self._cap


class OneEuroFilter:
    def __init__(self, min_cutoff: float = 0.7, beta: float = 0.10, d_cutoff: float = 1.0):
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
    Per-landmark One-Euro filter with a tightened velocity dead zone.
    """
    def __init__(
        self,
        min_cutoff: float = 0.7,
        beta: float       = 0.10,
        dead_zone: float  = 0.003,   # tightened from 0.004
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




DEBOUNCE_FRAMES = 2   # reduced from 3

class GestureDebounce:
    def __init__(self, n_frames: int = DEBOUNCE_FRAMES) -> None:
        self.n      = n_frames
        self.buffer: deque[list[dict]] = deque(maxlen=n_frames)

    def push(self, landmarks: list[dict]) -> list[dict]:
        self.buffer.append(landmarks)
        if len(self.buffer) < 2:
            return landmarks
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



# INFERENCE RESOLUTION DOWNSCALE

INFERENCE_W = 320
INFERENCE_H = 240

_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

def preprocess_for_mediapipe(bgr_frame: np.ndarray) -> np.ndarray:
    """
    1. Downsample to INFERENCE_W × INFERENCE_H   ← NEW: reduces palm-detector latency
    2. CLAHE on the luminance channel             ← retained: improves dim-light detection
    3. Return RGB
    """
    # Downscale first — cheapest operation, largest latency win
    small = cv2.resize(bgr_frame, (INFERENCE_W, INFERENCE_H), interpolation=cv2.INTER_LINEAR)
    # CLAHE on LAB luminance
    lab       = cv2.cvtColor(small, cv2.COLOR_BGR2LAB)
    l, a, b   = cv2.split(lab)
    l_eq      = _clahe.apply(l)
    lab_eq    = cv2.merge([l_eq, a, b])
    bgr_eq    = cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)
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



#  WEBSOCKET BROADCAST AT 120 HZ POLL RATE
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

        await asyncio.sleep(1 / 120)   # ← halved from 1/60


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
    handler.log_message = lambda *_: None   # type: ignore[method-assign]
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
        min_hand_detection_confidence  = 0.60,
        min_hand_presence_confidence   = 0.65,   # raised from 0.60
        min_tracking_confidence        = 0.60,   # raised from 0.55
    )

    #  CameraReader (threaded, non-blocking)
    cam = CameraReader(index=0)
    actual_fps = cam.cap.get(cv2.CAP_PROP_FPS)
    log.info(f"Camera opened — reported FPS: {actual_fps:.0f}")

    hand_filter  = HandFilter(min_cutoff=0.7, beta=0.10)
    debounce     = GestureDebounce(n_frames=DEBOUNCE_FRAMES)
    last_seen: float = 0.0
    fps_counter  = 0
    fps_display  = 0.0
    fps_timer    = time.time()

    # FRAME-SKIP GUARD
    
    last_frame_id: int = -1    # compare frame identity to detect duplicates

    with HandLandmarker.create_from_options(options) as landmarker:
        while True:
            ret, frame = cam.read()
            if not ret or frame is None:
                time.sleep(0.001)
                continue

            # Skip if frame hasn't changed since last iteration
            frame_id = id(frame)
            if frame_id == last_frame_id:
                time.sleep(0.001)
                continue
            last_frame_id = frame_id

            frame = cv2.flip(frame, 1)

            now          = time.time()
            timestamp_ms = int(now * 1000)

            # Downsampled + CLAHE frame for inference
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

    cam.stop()
    cv2.destroyAllWindows()
    log.info("Exiting.")


if __name__ == "__main__":
    main()