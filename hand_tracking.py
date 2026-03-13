import cv2
import mediapipe as mp
import urllib.request
import time
import os
import json
import math
import asyncio
import threading
import functools
import http.server
import websockets

# ---- tasks API ----
BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

# ---- model download ----
MODEL_PATH = "hand_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"    
)

# check if existis
if not os.path.exists(MODEL_PATH):
    print("Downloading model tasks (hand landmarker)...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("Model tasksdownloaded.")

# --- hand connections ---
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),  # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),  # Index finger
    (0, 9), (9, 10), (10, 11), (11, 12),  # Middle finger
    (0, 13), (13, 14), (14, 15), (15, 16),  # Ring finger
    (0, 17), (17, 18), (18, 19), (19, 20),   # Pinky
    (5, 9), (9, 13), (13, 17)  # Palm connections
]

LANDMARK_NAMES = [
    "WRIST",
    "THUMB_CMC",
    "THUMB_MCP",
    "THUMB_IP",
    "THUMB_TIP",
    "INDEX_FINGER_MCP",
    "INDEX_FINGER_PIP",
    "INDEX_FINGER_DIP",
    "INDEX_FINGER_TIP",
    "MIDDLE_FINGER_MCP",
    "MIDDLE_FINGER_PIP",
    "MIDDLE_FINGER_DIP",
    "MIDDLE_FINGER_TIP",
    "RING_FINGER_MCP",
    "RING_FINGER_PIP",
    "RING_FINGER_DIP",
    "RING_FINGER_TIP",
    "PINKY_MCP",
    "PINKY_PIP",
    "PINKY_DIP",
    "PINKY_TIP"
]

# -- OneEuro filter ---
class OneEuroFilter:
    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.01, d_cutoff: float = 1.0):

        # init parameters
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x_prev = None
        self._dx_prev = 0.0
        self._t_prev = None

    # compute alpha
    def _alpha(self, cutoff: float, dt: float) -> float:
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)
    
    # call the filter
    def __call__(self, x: float, t: float) -> float:
        if self._t_prev is None:
            self._x_prev = x
            self._t_prev = t
            return x
        
        dt = max(t - self._t_prev, 1e-6)
        self._t_prev = t
        dx = (x - self._x_prev) / dt
        a_d = self._alpha(self.d_cutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * self._dx_prev
        self._dx_prev = dx_hat
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        a = self._alpha(cutoff, dt)
        x_hat = a * x + (1 - a) * self._x_prev
        self._x_prev = x_hat
        return x_hat
    
class HandFilter:
    def __init__(self, min_cutoff = 1.0, beta = 0.01,):
        self.filters = [
            [OneEuroFilter(min_cutoff, beta) for _ in range(3)] for _ in range(21)  # 21 landmarks
        ]

    # apply filter to landmarks
    def apply(self, landmarks: list, t: float) -> list:
        out = []
        for i, lm in enumerate(landmarks):
            out.append({
                "x": self.filters[i][0](lm.x, t),
                "y": self.filters[i][1](lm.y, t),
                "z": self.filters[i][2](lm.z, t)
            })
        return out
    
# --- webscoket server ---
_latest_payload: str | None = None
_connected_clients: set = set()
_payload_dirty: bool = False  # True only when new ML data arrived since last broadcast

async def _ws_handler(websocket):
    _connected_clients.add(websocket)
    try:
        async for _ in websocket:
            pass # ignore incoming messages

    finally:
        _connected_clients.discard(websocket)

async def _broadcast_loop():
    global _latest_payload, _connected_clients, _payload_dirty
    while True:
        if _payload_dirty and _latest_payload and _connected_clients:
            _payload_dirty = False
            dead = set()
            for ws in list(_connected_clients):
                try:
                    await ws.send(_latest_payload)
                except Exception:
                    dead.add(ws)
            _connected_clients -= dead
        await asyncio.sleep(1 / 60) # broadcast at ~60 FPS

# run ws server
async def _run_ws_server():
    async with websockets.serve(_ws_handler, "localhost", 8765):
        await _broadcast_loop()

# start ws server 
def start_ws_server():
    asyncio.run(_run_ws_server())

# -- HTTPS server ---
def start_http_server():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=script_dir) # get current directory

    handler.log_message = lambda *_: None # suppress logging

    # start
    server = http.server.HTTPServer(("localhost", 8766), handler)
    server.serve_forever()

# -- OpenCV drawing --
def draw_hand(frame, hand_landmarks, label):
    h, w = frame.shape[:2]
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in hand_landmarks]
    fingertips = [4, 8, 12, 16, 20]
    # draw larndmardks
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (80, 200, 120), 2, cv2.LINE_AA)
    # draw points
    for i, (x, y) in enumerate(pts):
        r = 6 if i in fingertips else 4
        cv2.circle(frame, (x, y), r, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, (x, y), r, (80, 200, 120), 1, cv2.LINE_AA)

    wx, wy = pts[0]
    cv2.putText(frame, label, (wx - 20, wy - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (88, 205, 54), 2, cv2.LINE_AA)

# -- main looop ---
def main():
    global _latest_payload, _payload_dirty

    # start ws server in background thread
    threading.Thread(target=start_ws_server, daemon=True).start()
    threading.Thread(target=start_http_server, daemon=True).start()

    # print info
    print("WebSocket server started at ws://localhost:8765")
    print("HTTP server started at http://localhost:8766/hand_viewer.html") # add hand_viewer html page
    print("Press 'q' to quit.")

    # init hand landmarker
    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.5,  # lower → reacquires faster after motion blur
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.4
    )

    # start video capture
    cap = cv2.VideoCapture(0)
    # MJPEG compresses on the camera chip — much lower USB bus time than raw YUYV
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    # 640x480: less motion blur per pixel on fast moves → fewer detection drops
    # also halves MediaPipe inference time vs 1280x720
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    hand_filter = HandFilter(min_cutoff=1.0, beta=0.05)
    last_seen: float = 0.0  # timestamp of last successful detection
    fps_counter = 0
    fps_display = 0.0
    fps_timer = time.time()

    with HandLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("Failed to capture frame from webcam. Exiting.")
                break
            
            frame = cv2.flip(frame, 1) # mirror image
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) # convert to RGB
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb) # create mediapipe image
            timestamp_ms = int(time.time()  * 1000) # current timestamp in ms
            result = landmarker.detect_for_video(mp_image, timestamp_ms) # detect hands
            now = time.time()

            if result.hand_landmarks:
                raw_landmarks = result.hand_landmarks[0] # get first hand
                raw_label = result.handedness[0][0].display_name # label
                label = "Left" if raw_label == "Right" else "Right"

                # if hand was absent for >300ms, reset filter so it
                # snaps instantly to the new position instead of gliding from the old one
                if now - last_seen > 0.3:
                    hand_filter = HandFilter(min_cutoff=1.0, beta=0.05)
                last_seen = now

                smoothed = hand_filter.apply(raw_landmarks, now) # apply filter
                _latest_payload = json.dumps({"landmarks": smoothed, "hand": label}) # update payload
                _payload_dirty = True
                draw_hand(frame, raw_landmarks, label) # draw on frame
            else:
                _latest_payload = json.dumps({"landmarks": None, "hand": None}) # no hand detected, clear payload
                _payload_dirty = True
                cv2.putText(frame, "No hand detected", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (80, 80, 80), 2, cv2.LINE_AA)
            
            # fps calculation
            fps_counter += 1
            elapsed = time.time() - fps_timer
            if elapsed >= 1.0:
                fps_display = fps_counter / elapsed
                fps_counter = 0
                fps_timer = time.time()

            # init window and display
            cv2.putText(frame, f"FPS: {fps_display:.1f}", (20, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 120), 2, cv2.LINE_AA)
            cv2.imshow("Hand Tracking", frame)

            # exit
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()
    print("Exiting...")

if __name__ == "__main__":
    main()