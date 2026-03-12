# Troubeshooting
* mediapipe "solutions" deprecated
    * mp.tasks.vision.HandLandmarker instead
    * need to download .task model file and wraps frames in mp.Image
    * download in google api in case its not downloaded yet
* label in hand is flipped, cv2.flip to swap it again
* websocket server + OneEuro filter for latency