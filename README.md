# Plan 

# Troubeshooting
* mediapipe "solutions" deprecated
    * mp.tasks.vision.HandLandmarker instead
    * need to download .task model file and wraps frames in mp.Image
    * download in google api in case its not downloaded yet
* label in hand is flipped, cv2.flip to swap it again
* websocket server + OneEuro filter for latency
* browser blocks websocket to localhost
    * serve html to htpp instead
    * async instead of await for websocket
* "_connected_client -=" cannot be used inside _broadcast_loop
    * add a global var