# Plan 
**Create a Endless Space Shooter controlled by user's hand**
* First Stage: Detect hand
* Second Stage: Mirror hand into a digital hand with no visible jitter lag
* Third Stage: Build the game!
* Fourth Stage: Gesture Recognition; shoot, shield, boost, with less than 5% false positive rate
* Fifth Stage: Play a full round using only hand
* Sixth Stage: Demo ready; latency under 80ms?

# Troubeshooting

## Hand Tracking (Python)
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
* fingettips add a frozenset to allocate it once
* start_ws_server was declared async def -- coroutine never actually ran
    * thread just returned a coroutine object and died silently
    * remove the async, just def
* _payload_dirty and _latest_payload were "local" inside main() because python scopes any assigned variable as local
    * added both to the global declaration in main()
* mediapipe warnings flooding the console (XNNPACK, inference_feedback_manager, landmark_projection_calculator)
    * has to set env vars BEFORE importing mediapipe, C++ glog reads them at load time
    * GLOG_minloglevel=2, TF_CPP_MIN_LOG_LEVEL=3, MEDIAPIPE_DISABLE_GPU=1

## Hand Viewer (Three.js / HTML)
* bones array never created, only joints
    * added const bones = CONNECTIONS.map(...)
* joins.forEach typo (missing t), poisitions typo (extra i)
* data.label is wrong key, python sends "hand" not "label"
* .connected css class is not defined, code that
* #label not defined as well, the color
* LERP assumes 60 fps; use delta time to not break
* _va and _vb vectors were declared but never used, dead code from earlier version
* hand gets stuck "Disconnected Reconnecting..." when opening from file://
    * browser blocks ws:// from file:// origin
    * serve from http server (already fixed above but took a while to realize that was the cause)

## Game (JS)
* game canvas stuck on empty HUD, weapon select never shows, nothing runs
    * let parallaxLayers = [] was declared on line 184
    * but resizeCanvas() was called on line 133, which calls initParallax(), which writes to parallaxLayers
    * let is not hoisted unlike var, so javascript throws ReferenceError (TDZ - temporal dead zone)
    * entire script crashes before initGame() ever runs
    * fix: move the declaration above resizeCanvas()
* hand mapping felt wrong -- moved hand to the edge of camera but character still not at edge of screen
    * was mapping raw [0,1] camera coords directly to screen
    * camera "comfortable range" is like [0.18, 0.82] not full [0,1]
    * added HAND_X0, HAND_X1, HAND_Y0, HAND_Y1 remap constants in CFG
    * clamp + normalize so reaching 18% from camera edge = reaching game edge
* control switched from wrist (landmark 0) to index fingertip (landmark 8)
    * feels more natural and precise to point at things
    * added brass crosshair cursor drawn at the fingertip game position so you can see where youre pointing
* browser doesnt open automatically
    * webbrowser.open_new_tab after 1.2s delay in a daemon thread
    * delay needed so HTTPServer has time to bind before browser requests the page

# Game Design

## Overview
Endless top-down space shooter. Steampunk aesthetic -- iron hulls, rotating gear enemies, brass bullets, copper palette. Player never stops shooting; all skill expression is in movement and upgrade choices between waves.

## Architecture

### Communication
```
[webcam] --> [mediapipe] --> [OneEuro filter] --> [SimpleQueue]
                                                       |
                                              [asyncio WS server]
                                                       |
                                              [browser WebSocket]
                                                       |
                                         [game.js setHandTargets()]
```
Python pushes JSON at ~30fps (mediapipe inference rate). Browser lerps at 60fps to fill the gaps. Game and hand renderer run in the same requestAnimationFrame loop.

### Files
* `hand_tracking.py` -- webcam capture, mediapipe inference, OneEuro smoothing, WebSocket + HTTP servers
* `game.html` -- shell; no inline styles or scripts, just IDs that JS references
* `game.css` -- all visual styling; steam punk palette via CSS variables, overlays, HUD layout
* `game.js` -- everything else: game loop, entities, draw calls, Three.js hand viewer, WebSocket client

### Game Loop
Single `requestAnimationFrame` loop drives everything:
1. `update(dt)` -- move ship, enemies, bullets, orbs; check collisions; wave timer
2. `draw()` -- background parallax, enemies, player, bullets, orbs, particles, cursor
3. `stepHandLerp(dt)` -- interpolate Three.js hand joints toward WS targets
4. `handRenderer.render()` -- draw the small hand viewer panel

dt is capped at 50ms to avoid tunneling on tab focus restore.

### Player Stats
All stats live on the `player` object and are modified in place by upgrades:
* hp / maxHp -- starts at 200
* moveSpeed -- multiplier on BASE_SPEED (400 px/s)
* atkSpeed -- shots per second; affected by weapon choice and upgrades
* damage -- base damage per bullet
* critChance / critMult -- 5% / 150% base
* bulletSpeed -- multiplier on PLAYER_BULLET_BASE_SPD (820 px/s)
* weapon -- 'heavy' | 'spread' | 'burst'; chosen at game start, affects dmgMult and fire pattern

### Enemy Scaling
Exponential per wave so early waves feel easy and later waves punish greediness:
* `hp = BASE_HP * 1.28^(wave-1)`
* `dmg = BASE_DMG * 1.18^(wave-1)`
* `shootInterval = max(0.65, 2.5 - 0.18 * (wave-1))`

Enemies move as a formation (Space Invaders style), only on the X axis. They bounce off walls and drop a few pixels each bounce. Each enemy has an individual shoot timer so they dont all fire at once.

### Wave Timer
60 second countdown per wave. If timer hits 0 with enemies still alive, player loses 5% of maxHp and timer resets. Meant to punish passive/avoidant play without outright killing you.

### Upgrade System
Pool of 16 upgrades. 3 random picks shown between waves (no repeats per draw). Inspired by Vampire Survivors / Path of Exile -- incremental but each pick matters:
* smaller numbers for stats that compound (crit chance, crit damage)
* bigger numbers for flat stats (base damage, maxHp)
* heal upgrade exists so there's always a "safe" panic option
* bullet speed is in the pool because it affects gameplay feel not just damage numbers

### Parallax Background
3 layers scrolling at different speeds to sell the feeling of flying through a steampunk sky:
* far (18 px/s) -- large gear silhouettes, alpha 0.04
* mid (42 px/s) -- medium gears + iron pipe columns, alpha 0.06
* near (85 px/s) -- flickering ember particles, alpha 0.05

All generated procedurally at init and on window resize. Items are placed in a 2.2x screen-height tile and wrapped modulo tile height for seamless looping.

### Health Orbs
25% drop chance on enemy kill. Fall at 110 px/s with a sine bob. Heal 15-30 HP on pickup. Adds a risk/reward layer -- do you move toward an orb and risk enemy bullets, or ignore it?

### Hand Viewer Panel
Small 214x158px Three.js renderer in the bottom-right corner. Completely separate from the main game canvas. Joints and bones rendered in copper/brass to match the theme. Lerp factor is independent from the game's ship lerp so the hand can feel snappier than the ship movement.

# Project Improvement

## Phase 3 — Game Polish

### Bullet speed & fire rate
* BASE_ATK_SPEED bumped 0.80 -> 1.20, PLAYER_BULLET_BASE_SPD 820 -> 1100
* per-weapon atkMult also bumped across the board
* game feels noticeably more responsive without needing to reduce enemy HP

### Space parallax background
* replaced gear/pipe/ember parallax entirely with a proper space theme
    * layer 0 (8 px/s): procedural nebulae (soft radial gradient blobs, 4 palette variants) + dim tiny stars with twinkle animation
    * layer 1 (22 px/s): medium stars + procedural planets (3 variants: rocky, gas giant, icy)
    * layer 2 (58 px/s): bright fast-moving stars, heavy twinkle
* rocky planets have craters and rim light, gas giants have coloured bands + optional ring, icy have polar caps
* background gradient changed from warm iron to deep space blue-black (#000008 -> #020118)
* all items procedurally placed in a 2.5x screen-height tile, wrapping modulo tile height

### 3 locked weapons
* Aether Seeker (homing): bullet steers toward nearest enemy at 3.2 rad/s; dmgMult 0.40; unlocks at score 500
* Ricochet Chamber (bounce): random 45-135 degree upward angle, reflects off walls up to 3 times, collision radius grows +4px per bounce; unlocks at 2000
* Tesla Lance (laser): no bullet object, instant damage to all enemies within ±28px of player X, visual beam fades over 0.20s; dmgMult 3.80, atkMult 0.22; unlocks at 5000
* locked cards shown at 0.42 opacity with a "LOCKED" badge and required score
* pointer-events: none on locked cards so cursor and fist can't accidentally select them
* checkScoreUnlocks() called on every kill; saves to localStorage immediately if newly unlocked

### Debug unlock (U key)
* pressing U unlocks all 6 weapons and refreshes the weapon select overlay in real time
* saveUnlocks() persists to localStorage so they stay across sessions

### Score storage (localStorage)
* three keys: aetheric_hs (current high score int), aetheric_runs (last 5 runs as JSON), aetheric_unlocks (JSON array of unlocked weapon IDs)
* saveRun() on game over; updates high score if beaten
* game over overlay now shows both current score and all-time best

### Smooth HP bar animation
* player.displayHp lerps toward actual hp each frame (rate 4.5/s going down, 8.0/s going up)
* player.ghostHp snaps to displayHp on damage, then falls at 22/s -- classic "hit lag" bar from RPGs
* ghost bar drawn as semi-transparent orange segment between displayHp and ghostHp positions
* bar-wrap changed to position:relative, hp-ghost and hp-fill are absolute children with z-index layering
* same displayHp/ghostHp values drive both the canvas bar under the ship and the HUD stats panel

### Orb drop chance
* ORB_DROP_CHANCE 0.25 -> 0.10, makes orbs feel more rewarding when they do drop

## Phase 4 — Gesture Recognition

### Why the previous detection felt too sensitive
* was comparing fingertip.y against MCP (mid-palm, landmark 5/9/13) -- a 45-degree bent finger still passes because MCP is close to the palm
* fix: switched to PIP joints (landmarks 6/10/14) which are the proximal knuckles -- much tighter gate
* margin bumped from 0.04 to 0.06 normalised units -- needs more deliberate extension
* hold threshold was 12 frames (~0.4s at 30fps) -- way too short for a UI action
    * card gesture hold: 12 -> 25 frames (~0.83s)
    * thumb confirm hold: was 22 frames, kept but now has a proper precondition
    * fist click hold: new at 18 frames (~0.60s)
    * cooldown between any two confirmed actions: 800ms -> 1400ms
* thumb detection had no precondition -- any open-hand position could false-fire
    * fix: _detectThumb() now calls _fingersCurled() first and returns null if any finger is extended

### Gesture detection architecture (_countFingers, _detectThumb, _isFist)
* _countFingers(lms): checks index/middle/ring against PIP joints with sequential logic
    * index only = 1, index+middle = 2, index+middle+ring = 3
    * sequential: middle can't be up without index, ring can't be up without middle
    * never reads index finger state as "2 fingers" even if middle is slightly elevated
* _detectThumb(lms): compares thumb tip (LM4) vs thumb MCP (LM2)
    * diff > 0.12 = up, diff < -0.10 = down; asymmetric because down needs more force
    * requires _fingersCurled() as precondition so it only fires when hand is fist-like
* _isFist(lms): all 4 fingers below their PIP + thumb is not strongly up
    * used for the menu cursor click action

### Gesture state machine (GS object + processGesture)
* two stages: card selection then thumb confirmation
* stage 1 -- finger count:
    * hold finger gesture for GESTURE_HOLD_FRAMES consecutive frames
    * if count changes, holdFrames resets to 0 (no accidental cross-reads)
    * on success: store pendingIdx, set confirming=true, show confirm overlay
* stage 2 -- thumb:
    * hold thumb direction for THUMB_HOLD_FRAMES consecutive frames
    * if direction changes, thumbFrames resets to 0
    * thumbs up = _confirmCard(idx) which simulates a DOM click on the card
    * thumbs down = _cancelConfirm() which hides overlay and resets highlights

### Menu cursor (index finger as mouse)
* in overlay states (weapon-select or upgrading), raw landmark 8 maps to full viewport pixels -- no remapping
    * different from ship control which uses the remapped sub-range; cursor needs full screen reach for cards
* #menu-cursor CSS div positioned via style.left/top, CSS pulse animation on ::before ring
* .fist-loading class changes ring + dot color to green while fist hold is building
* document.elementFromPoint() used to find the card under the cursor
    * cursor div hidden temporarily during the call so it doesnt block its own hit test
* fist hold on a valid card = dispatchEvent(new MouseEvent('click')) on that card element
    * works for both weapon cards and upgrade cards without any special cases
    * locked cards are skipped (classList check before firing)

### Confirmation popup
* appears after both finger-gesture hold AND fist-click
* shows the selected card name and two thumb options side by side
* each option has its own progress bar that fills while the matching thumb gesture is held
* cancel clears all highlights and returns to the card overlay
* confirm simulates a click on the pending card

### Visual feedback
* .gesture-hint-row shows which finger count maps to which card; active tag highlights with border + bg tint
* .gesture-hold-bar fills 0->100% during hold, turns brass color (var --brass) on completion
* .upgrade-card.g-hover: card lifts 3px, border turns copper
* .upgrade-card.g-active: card lifts 6px, border turns brass, soft glow
* .upgrade-card.g-fist-hover: card gets green border when fist cursor is hovering it
* conf-bar fills independently for yes and no so partial holds on wrong direction are visible

### Known issues / future work
* gesture reads from one hand only; left hand could theoretically hover cursor while right controls ship
* finger detection still trips on people with very flexible fingers or unusual hand geometry -- thresholds in CFG are the first knob to turn
* in fast waves, index fingertip position and gesture detection share the same landmark (LM8); this means if a player is doing small fast pointing movements, the finger might briefly dip below the PIP threshold and reset a gesture hold -- probably acceptable tradeoff for now
* phase 5 will need in-game gestures (fist = shield, two fingers = boost etc) which means a second detection layer running only when not in overlay states