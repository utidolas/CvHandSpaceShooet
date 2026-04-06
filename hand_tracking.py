"""
hand_tracking.py — MediaPipe hand tracker + WebSocket broadcaster for Aetheric Skies.

Security & quality fixes applied (see CHANGES.md for full list):
  • HTTP server whitelists only game assets — no source-code exposure
  • SHA-256 integrity check on model download
  • WebSocket connection cap + per-message size guard
  • Bounded frame queue (prevents unbounded memory growth)
  • Broken id()-based frame-skip guard replaced with a frame counter
  • Camera open-failure detected and raised early
  • CPU-spin guard in CameraReader._loop
  • Full type annotations throughout
  • Env-var suppression moved inside main() (no silent import-time side-effects)
  • HTTP log suppression via subclass instead of type-unsafe monkey-patch
  • draw_hand / start_http_server properly typed
  • main() decomposed into named helper functions
"""

from __future__ import annotations

import asyncio
import functools
import hashlib
import http.server
import json
import logging
import math
import queue as _queue
import ssl
import threading
import time
import urllib.request
import webbrowser
from collections import deque
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
import websockets
from websockets.server import WebSocketServerProtocol

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MediaPipe aliases
# ---------------------------------------------------------------------------
BaseOptions           = mp.tasks.BaseOptions
HandLandmarker        = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

# ---------------------------------------------------------------------------
# Paths & model
# ---------------------------------------------------------------------------
_SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_PATH  = _SCRIPT_DIR / "hand_landmarker.task"
MODEL_URL   = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)
# SHA-256 of the official float16/1 checkpoint (re-verify after any upstream update).
MODEL_SHA256 = "5d2c8fc1040b6fbc1da37f7d7daf1bb7c61de6a51f77680a01a69b89ba929c78"

# FIX #6 — verify model integrity after download (and on every startup).
def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _ensure_model() -> None:
    """Download the MediaPipe hand-landmarker model if absent; verify SHA-256."""
    if not MODEL_PATH.exists():
        log.info("Downloading hand_landmarker.task …")
        # FIX #6a — use a proper SSL context (default already verifies certs, but
        # being explicit avoids accidental overrides from the environment).
        ssl_ctx = ssl.create_default_context()
        req = urllib.request.Request(MODEL_URL, headers={"User-Agent": "hand_tracker/1.0"})
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=60) as resp:
            data = resp.read()
        MODEL_PATH.write_bytes(data)
        log.info("Model downloaded.")

    digest = _sha256(MODEL_PATH)
    if digest != MODEL_SHA256:
        # Delete the corrupt/tampered file so the next run re-downloads it.
        MODEL_PATH.unlink(missing_ok=True)
        raise RuntimeError(
            f"Model integrity check FAILED.\n"
            f"  expected : {MODEL_SHA256}\n"
            f"  got      : {digest}\n"
            "The file has been removed. Re-run to re-download."
        )
    log.info("Model integrity OK.")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FINGERTIP_IDS: frozenset[int] = frozenset({4, 8, 12, 16, 20})

HAND_CONNECTIONS: list[tuple[int, int]] = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9), (9, 13), (13, 17),
]

# Game asset filenames the HTTP server is allowed to serve.
# FIX #4 — whitelist; no other file in _SCRIPT_DIR is reachable.
_ALLOWED_ASSETS: frozenset[str] = frozenset({
    "game.html",
    "game.js",
    "game.css",
})

# WebSocket tunables
_MAX_WS_CLIENTS   = 10          # FIX #5 — connection cap
_MAX_MSG_BYTES    = 256         # FIX #7 — inbound message size guard
_QUEUE_MAXSIZE    = 64          # FIX #3 — bounded frame queue
_BROADCAST_HZ     = 120

# Inference resolution
INFERENCE_W = 320
INFERENCE_H = 240

DEBOUNCE_FRAMES = 2


# ---------------------------------------------------------------------------
# Camera reader (threaded, non-blocking)
# ---------------------------------------------------------------------------
class CameraReader:
    """
    Captures frames in a background thread so the main loop never blocks.
    ``read()`` returns the latest frame instantly.

    FIX #10 — raises ``RuntimeError`` immediately if the camera cannot be opened.
    FIX #11 — background loop sleeps briefly on consecutive read failures to
               avoid burning a CPU core at 100 %.
    FIX #1  — exposes a monotonic ``frame_count`` counter so callers can detect
               truly new frames without the broken ``id()`` trick.
    """

    def __init__(self, index: int = 0) -> None:
        cap = cv2.VideoCapture(index)

        # FIX #10 — fail fast instead of silently producing black frames.
        if not cap.isOpened():
            raise RuntimeError(
                f"Cannot open camera at index {index}. "
                "Make sure a webcam is connected and not in use by another app."
            )

        cap.set(cv2.CAP_PROP_FOURCC,      cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS,          60)
        cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)

        self._cap         = cap
        self._frame:      np.ndarray | None = None
        self._lock        = threading.Lock()
        self._stopped     = False
        self.frame_count  = 0          # FIX #1 — monotonic counter

        threading.Thread(target=self._loop, daemon=True, name="cam-reader").start()

    def _loop(self) -> None:
        consecutive_failures = 0
        while not self._stopped:
            ret, frame = self._cap.read()
            if ret:
                consecutive_failures = 0
                with self._lock:
                    self._frame = frame
                    self.frame_count += 1
            else:
                consecutive_failures += 1
                # FIX #11 — back off instead of spinning at 100 % CPU.
                sleep_s = min(0.001 * consecutive_failures, 0.05)
                time.sleep(sleep_s)

    def read(self) -> tuple[bool, np.ndarray | None, int]:
        """Return (ok, frame_copy, frame_count)."""
        with self._lock:
            if self._frame is None:
                return False, None, self.frame_count
            return True, self._frame.copy(), self.frame_count

    def stop(self) -> None:
        self._stopped = True
        self._cap.release()

    @property
    def cap(self) -> cv2.VideoCapture:
        return self._cap


# ---------------------------------------------------------------------------
# One-Euro filter
# ---------------------------------------------------------------------------
class OneEuroFilter:
    def __init__(
        self,
        min_cutoff: float = 0.7,
        beta: float       = 0.10,
        d_cutoff: float   = 1.0,
    ) -> None:
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
        dx            = (x - self._x_prev) / dt          # type: ignore[operator]
        a_d           = self._alpha(self.d_cutoff, dt)
        dx_hat        = a_d * dx + (1 - a_d) * self._dx_prev
        self._dx_prev = dx_hat
        cutoff        = self.min_cutoff + self.beta * abs(dx_hat)
        a             = self._alpha(cutoff, dt)
        x_hat         = a * x + (1 - a) * self._x_prev   # type: ignore[operator]
        self._x_prev  = x_hat
        return x_hat


# ---------------------------------------------------------------------------
# Per-landmark smoother
# ---------------------------------------------------------------------------
class HandFilter:
    """Per-landmark One-Euro filter with a tightened velocity dead zone."""

    def __init__(
        self,
        min_cutoff: float = 0.7,
        beta: float       = 0.10,
        dead_zone: float  = 0.003,
    ) -> None:
        self.min_cutoff = min_cutoff
        self.beta       = beta
        self.dead_zone  = dead_zone
        self.filters: list[list[OneEuroFilter]] = [
            [OneEuroFilter(min_cutoff, beta) for _ in range(3)] for _ in range(21)
        ]
        # FIX #13 — tighter inner type annotation.
        self._prev: list[dict[str, float] | None] = [None] * 21

    def reset(self) -> None:
        self.filters = [
            [OneEuroFilter(self.min_cutoff, self.beta) for _ in range(3)]
            for _ in range(21)
        ]
        self._prev = [None] * 21

    def apply(self, landmarks: list[Any], t: float) -> list[dict[str, float]]:
        out: list[dict[str, float]] = []
        for i, lm in enumerate(landmarks):
            fx = self.filters[i][0](lm.x, t)
            fy = self.filters[i][1](lm.y, t)
            fz = self.filters[i][2](lm.z, t)

            if self._prev[i] is not None:
                dx = fx - self._prev[i]["x"]
                dy = fy - self._prev[i]["y"]
                if math.hypot(dx, dy) < self.dead_zone:
                    fx = self._prev[i]["x"]
                    fy = self._prev[i]["y"]
                    fz = self._prev[i]["z"]

            point: dict[str, float] = {"x": fx, "y": fy, "z": fz}
            self._prev[i] = point
            out.append(point)
        return out


# ---------------------------------------------------------------------------
# Gesture temporal smoother
# ---------------------------------------------------------------------------
class GestureDebounce:
    def __init__(self, n_frames: int = DEBOUNCE_FRAMES) -> None:
        self.n      = n_frames
        self.buffer: deque[list[dict[str, float]]] = deque(maxlen=n_frames)

    def push(self, landmarks: list[dict[str, float]]) -> list[dict[str, float]]:
        self.buffer.append(landmarks)
        if len(self.buffer) < 2:
            return landmarks
        out: list[dict[str, float]] = []
        for i in range(21):
            xs = [frame[i]["x"] for frame in self.buffer]
            ys = [frame[i]["y"] for frame in self.buffer]
            zs = [frame[i]["z"] for frame in self.buffer]
            out.append({
                "x": float(np.median(xs)),
                "y": float(np.median(ys)),
                "z": float(np.median(zs)),
            })
        return out

    def clear(self) -> None:
        self.buffer.clear()


# ---------------------------------------------------------------------------
# Frame pre-processing
# ---------------------------------------------------------------------------
_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))


def preprocess_for_mediapipe(bgr_frame: np.ndarray) -> np.ndarray:
    """
    1. Downsample to INFERENCE_W × INFERENCE_H  — reduces palm-detector latency.
    2. CLAHE on the luminance channel            — improves dim-light detection.
    3. Return RGB uint8.
    """
    small   = cv2.resize(bgr_frame, (INFERENCE_W, INFERENCE_H),
                         interpolation=cv2.INTER_LINEAR)
    lab     = cv2.cvtColor(small, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    lab_eq  = cv2.merge([_clahe.apply(l), a, b])
    bgr_eq  = cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)
    return cv2.cvtColor(bgr_eq, cv2.COLOR_BGR2RGB)


# ---------------------------------------------------------------------------
# WebSocket server
# FIX #3  — bounded queue (_QUEUE_MAXSIZE) prevents unbounded memory growth.
# FIX #5  — hard cap on concurrent connections (_MAX_WS_CLIENTS).
# FIX #7  — inbound messages exceeding _MAX_MSG_BYTES are silently dropped.
# ---------------------------------------------------------------------------
_frame_queue: _queue.Queue[str] = _queue.Queue(maxsize=_QUEUE_MAXSIZE)
_connected_clients: set[WebSocketServerProtocol] = set()


async def _ws_handler(websocket: WebSocketServerProtocol) -> None:
    # FIX #5 — reject connections beyond the cap.
    if len(_connected_clients) >= _MAX_WS_CLIENTS:
        log.warning("WS connection rejected — client cap (%d) reached.", _MAX_WS_CLIENTS)
        await websocket.close(1013, "Server at capacity")
        return

    _connected_clients.add(websocket)
    log.debug("WS client connected  (total: %d)", len(_connected_clients))
    try:
        async for raw_msg in websocket:
            # FIX #7 — drop oversized inbound messages; game clients send nothing,
            # so any large payload is unexpected and potentially malicious.
            msg_bytes = raw_msg if isinstance(raw_msg, bytes) else raw_msg.encode()
            if len(msg_bytes) > _MAX_MSG_BYTES:
                log.warning(
                    "WS: dropped oversized inbound message (%d bytes).", len(msg_bytes)
                )
    finally:
        _connected_clients.discard(websocket)
        log.debug("WS client disconnected (total: %d)", len(_connected_clients))


async def _broadcast_loop() -> None:
    latest: str | None = None
    while True:
        # Drain the queue — keep only the most recent landmark payload.
        try:
            while True:
                latest = _frame_queue.get_nowait()
        except _queue.Empty:
            pass

        if latest and _connected_clients:
            dead: set[WebSocketServerProtocol] = set()
            for ws in list(_connected_clients):
                try:
                    await ws.send(latest)
                except Exception as exc:
                    # FIX #3b — log disconnections instead of silently discarding.
                    log.debug("WS send failed (%s); removing client.", exc)
                    dead.add(ws)
            _connected_clients -= dead

        await asyncio.sleep(1 / _BROADCAST_HZ)


async def _run_ws_server() -> None:
    async with websockets.serve(_ws_handler, "localhost", 8765):
        await _broadcast_loop()


def start_ws_server() -> None:
    asyncio.run(_run_ws_server())


# ---------------------------------------------------------------------------
# HTTP server — whitelisted assets only
# FIX #4 — prevents source-code / model / credential exposure.
# FIX #15 — suppresses request logs via a proper subclass instead of
#            type-unsafe monkey-patching.
# ---------------------------------------------------------------------------
class _AssetHandler(http.server.SimpleHTTPRequestHandler):
    """
    Serves only the filenames listed in ``_ALLOWED_ASSETS`` from ``_SCRIPT_DIR``.
    Any request outside that whitelist gets a 403 — never a directory listing
    or access to .py / .task / config files.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(_SCRIPT_DIR), **kwargs)

    # FIX #4 — whitelist enforcement.
    def do_GET(self) -> None:  # type: ignore[override]
        # Strip leading slash and any query string.
        path = self.path.lstrip("/").split("?")[0].split("#")[0]

        # Block directory traversal sequences explicitly.
        if ".." in path or path not in _ALLOWED_ASSETS:
            self.send_error(403, "Forbidden")
            return
        super().do_GET()

    # FIX #15 — silence access log without monkey-patching.
    def log_message(self, fmt: str, *args: Any) -> None:  # type: ignore[override]
        pass


def start_http_server() -> None:
    server = http.server.HTTPServer(("localhost", 8766), _AssetHandler)
    server.serve_forever()


# ---------------------------------------------------------------------------
# OpenCV hand overlay
# ---------------------------------------------------------------------------
def draw_hand(
    frame:           np.ndarray,
    hand_landmarks:  list[Any],
    label:           str,
) -> list[tuple[int, int]]:
    """Draw skeleton + landmark dots on *frame* (in-place) and return pixel coords."""
    h, w = frame.shape[:2]
    pts: list[tuple[int, int]] = [
        (int(lm.x * w), int(lm.y * h)) for lm in hand_landmarks
    ]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (80, 200, 120), 2, cv2.LINE_AA)
    for i, (x, y) in enumerate(pts):
        r = 6 if i in FINGERTIP_IDS else 4
        cv2.circle(frame, (x, y), r, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, (x, y), r, (80, 200, 120),   1, cv2.LINE_AA)
    wx, wy = pts[0]
    cv2.putText(
        frame, label, (wx - 20, wy - 14),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (88, 205, 54), 2, cv2.LINE_AA,
    )
    return pts


# ---------------------------------------------------------------------------
# Main loop helpers  (FIX #17 — decomposed out of one monolithic main())
# ---------------------------------------------------------------------------
def _enqueue_frame(payload: str) -> None:
    """Put payload into the bounded queue; discard oldest entry if full."""
    # FIX #3 — put_nowait + discard-oldest keeps latency low under backpressure.
    try:
        _frame_queue.put_nowait(payload)
    except _queue.Full:
        try:
            _frame_queue.get_nowait()   # evict stale frame
        except _queue.Empty:
            pass
        _frame_queue.put_nowait(payload)


def _build_landmarker_options() -> HandLandmarkerOptions:
    return HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=VisionRunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence = 0.60,
        min_hand_presence_confidence  = 0.65,
        min_tracking_confidence       = 0.60,
    )


def _process_frame(
    frame:        np.ndarray,
    landmarker:   Any,
    timestamp_ms: int,
    now:          float,
    last_seen:    float,
    hand_filter:  HandFilter,
    debounce:     GestureDebounce,
) -> float:
    """Run inference on one frame; enqueue result; return updated last_seen."""
    rgb_enhanced = preprocess_for_mediapipe(frame)
    mp_image     = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_enhanced)
    result       = landmarker.detect_for_video(mp_image, timestamp_ms)

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

        _enqueue_frame(json.dumps({"landmarks": debounced, "hand": label}))
        draw_hand(frame, raw_landmarks, label)
    else:
        debounce.clear()
        _enqueue_frame(json.dumps({"landmarks": None, "hand": None}))
        cv2.putText(
            frame, "No hand detected", (20, 60),
            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (80, 80, 80), 2, cv2.LINE_AA,
        )

    return last_seen


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    # FIX #8 — suppress MediaPipe/TF noise inside main() instead of at module
    # import time, avoiding side-effects on any other library that imports us.
    import os
    os.environ.setdefault("GLOG_minloglevel",      "2")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL",  "3")
    os.environ.setdefault("MEDIAPIPE_DISABLE_GPU", "1")

    _ensure_model()

    threading.Thread(target=start_ws_server,   daemon=True, name="ws-server").start()
    threading.Thread(target=start_http_server, daemon=True, name="http-server").start()

    log.info("WebSocket  : ws://localhost:8765")
    log.info("Game       : http://localhost:8766/game.html")
    log.info("Press 'q' in the OpenCV window to quit.")

    def _open_browser() -> None:
        time.sleep(1.2)
        webbrowser.open_new_tab("http://localhost:8766/game.html")

    threading.Thread(target=_open_browser, daemon=True, name="browser-opener").start()

    # FIX #10 — camera open failure is now raised with a clear message.
    cam        = CameraReader(index=0)
    actual_fps = cam.cap.get(cv2.CAP_PROP_FPS)
    log.info(f"Camera opened — reported FPS: {actual_fps:.0f}")

    hand_filter  = HandFilter(min_cutoff=0.7, beta=0.10)
    debounce     = GestureDebounce(n_frames=DEBOUNCE_FRAMES)
    last_seen    = 0.0
    fps_counter  = 0
    fps_display  = 0.0
    fps_timer    = time.time()

    # FIX #1 — track truly new frames via the monotonic counter, not object id().
    last_frame_count: int = -1

    with HandLandmarker.create_from_options(_build_landmarker_options()) as landmarker:
        while True:
            ret, frame, frame_count = cam.read()
            if not ret or frame is None:
                time.sleep(0.001)
                continue

            # FIX #1 — skip duplicate frames reliably.
            if frame_count == last_frame_count:
                time.sleep(0.001)
                continue
            last_frame_count = frame_count

            frame        = cv2.flip(frame, 1)
            now          = time.time()
            timestamp_ms = int(now * 1000)

            last_seen = _process_frame(
                frame, landmarker, timestamp_ms, now,
                last_seen, hand_filter, debounce,
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