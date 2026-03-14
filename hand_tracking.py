import os

# ---- Suppress MediaPipe / TensorFlow Lite / glog console noise ----
# Must be set BEFORE mediapipe is imported — the C++ runtime reads these
# env vars at load time.
#   GLOG_minloglevel  0=INFO  1=WARNING  2=ERROR  3=FATAL
#   TF_CPP_MIN_LOG_LEVEL mirrors the same scale for TFLite
os.environ.setdefault('GLOG_minloglevel',      '2')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL',  '3')
os.environ.setdefault('MEDIAPIPE_DISABLE_GPU', '1')   # avoids GL chatter on macOS

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
import websockets   # imported after env vars so noise is suppressed

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

# ---- model path — anchored to script dir so it works from any cwd ----
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

# ---- OneEuro filter ----
class OneEuroFilter:
    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.01, d_cutoff: float = 1.0):
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
    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.01) -> None:
        self.min_cutoff = min_cutoff
        self.beta       = beta
        self.filters: list[list[OneEuroFilter]] = [
            [OneEuroFilter(min_cutoff, beta) for _ in range(3)] for _ in range(21)
        ]

    def reset(self) -> None:
        """Snap filter state — call when hand reappears after absence."""
        self.filters = [
            [OneEuroFilter(self.min_cutoff, self.beta) for _ in range(3)]
            for _ in range(21)
        ]

    def apply(self, landmarks: list, t: float) -> list[dict[str, float]]:
        out = []
        for i, lm in enumerate(landmarks):
            out.append({
                "x": self.filters[i][0](lm.x, t),
                "y": self.filters[i][1](lm.y, t),
                "z": self.filters[i][2](lm.z, t),
            })
        return out


# ---- WebSocket server ----
# SimpleQueue: thread-safe one-producer (OpenCV loop) to one-consumer (asyncio).
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
        # Drain queue — keep only the freshest frame, discard stale ones
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

    # Auto-open the game in the default browser.
    # 1.2s delay gives the HTTP server time to bind before the browser requests the page.
    def _open_browser() -> None:
        time.sleep(1.2)
        webbrowser.open_new_tab("http://localhost:8766/game.html")

    threading.Thread(target=_open_browser, daemon=True).start()

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.4,
    )

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    hand_filter = HandFilter(min_cutoff=1.0, beta=0.05)
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
            rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Single time.time() call — timestamp_ms and now are always consistent
            now          = time.time()
            timestamp_ms = int(now * 1000)

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result   = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.hand_landmarks:
                raw_landmarks = result.hand_landmarks[0]
                raw_label     = result.handedness[0][0].display_name
                label         = "Left" if raw_label == "Right" else "Right"

                if now - last_seen > 0.3:
                    hand_filter.reset()
                last_seen = now

                smoothed = hand_filter.apply(raw_landmarks, now)
                _frame_queue.put(json.dumps({"landmarks": smoothed, "hand": label}))
                draw_hand(frame, raw_landmarks, label)
            else:
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