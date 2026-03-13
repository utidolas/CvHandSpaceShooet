# Plan 
**Create a Endless Space Shooter controlled by user's hand**
* First Stage: Detect hand
* Second Stage: Mirror hand into a digital hand with no visible jitter lag
* Third Stage: Gesture Recognition; shoot, shield, boost, with less than 5% false positive rate
* Fourth Stage: Play a full round using only hand
* Fifth Stage: Demo ready; latency under 80ms?

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
* hand tracking has a bit of ping & when move hand too fast, it stops detecting for a whilw
    * fewer pixels per frame 
    * adjust confidence parameter 0.7 -> 0.5 tracking 0.5 -> 0.4
    * increase euro beta 0.01->0.05
* MODEL_PATH is relative path, anchor to __ file __
* add queue.SimpleQueue to avoid shared mutable state
* move download to main() instead at import runtime
* compute time_stamp and now once instead of separated, they are same
* reset() to Handfilter
* .connected css class is not defined, code that
* #label not defined as well, the color
* LERP assumes 60 fps; use delta time to not break
* fingettips add a frozenset to allocate it once