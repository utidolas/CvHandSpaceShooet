'use strict';

// ================================================================
// CONFIG
// ================================================================
const CFG = {
  BASE_HP:                200,
  BASE_SPEED:             400,
  BASE_ATK_SPEED:         1.20,         // increased from 0.80
  BASE_DAMAGE:            10,
  BASE_CRIT_CHANCE:       0.05,
  BASE_CRIT_MULT:         1.50,
  BASE_BULLET_SPEED:      1.0,

  ENEMY_BASE_HP:          30,
  ENEMY_HP_SCALE:         1.28,
  ENEMY_BASE_DMG:         15,
  ENEMY_DMG_SCALE:        1.18,
  ENEMY_SHOOT_BASE:       2.5,
  ENEMY_SHOOT_MIN:        0.65,
  ENEMY_SHOOT_DEC:        0.18,

  WAVE_TIMER:             60,
  WAVE_PENALTY:           0.05,

  ENEMY_ZONE_TOP:         0.07,
  ENEMY_ZONE_BTM:         0.46,
  FORMATION_SPEED:        72,
  FORMATION_DIP:          18,

  PLAYER_BULLET_BASE_SPD: 1100,         // increased from 820
  ENEMY_BULLET_SPD:       360,

  SHIP_LERP_60:           0.40,
  SHIP_ZONE_TOP:          0.50,
  SHIP_SIZE:              22,

  ORB_DROP_CHANCE:        0.10,         // reduced from 0.25
  ORB_HEAL_MIN:           15,
  ORB_HEAL_MAX:           30,
  ORB_FALL_SPEED:         110,

  HAND_X0: 0.18,   HAND_X1: 0.82,
  HAND_Y0: 0.18,   HAND_Y1: 0.88,

  // Phase 4 gesture thresholds
  GESTURE_HOLD_FRAMES:    12,           // WS frames (~0.4s at 30fps)
  GESTURE_COOLDOWN_MS:    800,
};

// ================================================================
// WEAPON DEFINITIONS
// Three unlocked from start, three locked behind score milestones.
// ================================================================
const WEAPONS = [
  {
    id: 'heavy',  name: 'Iron Cannon',
    icon: '\u25CE', color: '#e8a020',
    desc: 'Single massive shell.\nDevastating but slow fire rate.',
    dmgMult: 1.60, atkMult: 0.75,
    hint: 'High single-hit damage',
    locked: false, unlockScore: 0,
  },
  {
    id: 'spread', name: 'Tri-Barrel',
    icon: '\u2756', color: '#40c8e8',
    desc: 'Three shots in a spread cone.\nCovers wide area, less damage each.',
    dmgMult: 0.65, atkMult: 1.10,
    hint: 'Wide area coverage',
    locked: false, unlockScore: 0,
  },
  {
    id: 'burst',  name: 'Double Repeater',
    icon: '\u25C8', color: '#80d040',
    desc: 'Fires two rounds in quick\nsuccession. Reliable sustained DPS.',
    dmgMult: 0.90, atkMult: 1.15,
    hint: 'Consistent double-tap',
    locked: false, unlockScore: 0,
  },
  // --- locked weapons ---
  {
    id: 'homing', name: 'Aether Seeker',
    icon: '\u2609', color: '#c060ff',
    desc: 'Rounds that track the nearest\nenemy. Low damage, never misses.',
    dmgMult: 0.40, atkMult: 1.40,
    hint: 'Set and forget tracking',
    locked: true, unlockScore: 500,
  },
  {
    id: 'bounce', name: 'Ricochet Chamber',
    icon: '\u2B22', color: '#ff8040',
    desc: 'Fires at random angles and\nbounces off walls, growing bigger.',
    dmgMult: 0.72, atkMult: 0.95,
    hint: 'Chaos and wall coverage',
    locked: true, unlockScore: 2000,
  },
  {
    id: 'laser',  name: 'Tesla Lance',
    icon: '\u26A1', color: '#40e8ff',
    desc: 'Instant vertical beam of energy.\nMassive damage, very slow rate.',
    dmgMult: 3.80, atkMult: 0.22,
    hint: 'High risk, high reward',
    locked: true, unlockScore: 5000,
  },
];

// ================================================================
// UPGRADE POOL
// ================================================================
const UPGRADE_POOL = [
  { icon:'\u2699', name:'Steam Turbine',     desc:'Upgrade thruster output',          stat:'moveSpeed',   val:0.10, fmt:v=>`+${Math.round(v*100)}% move speed`    },
  { icon:'\u2699', name:'Gyro Stabiliser',   desc:'Enhanced directional control',     stat:'moveSpeed',   val:0.16, fmt:v=>`+${Math.round(v*100)}% move speed`    },
  { icon:'\u2665', name:'Boiler Plating',    desc:'Reinforce hull with iron plating', stat:'maxHp',       val:30,   fmt:v=>`+${v} max hull`                       },
  { icon:'\u2665', name:'Riveted Armour',    desc:'Extra layers of forged steel',     stat:'maxHp',       val:50,   fmt:v=>`+${v} max hull`                       },
  { icon:'+',      name:'Emergency Steam',   desc:'Repair critical hull damage',      stat:'heal',        val:0.15, fmt:v=>`+${Math.round(v*100)}% hull restored`  },
  { icon:'\u25CE', name:'Rapid Valves',      desc:'Faster firing cycle',              stat:'atkSpeed',    val:0.15, fmt:v=>`+${v.toFixed(2)} shots/s`             },
  { icon:'\u25CE', name:'Pressure Chamber',  desc:'High-pressure shot cycle',         stat:'atkSpeed',    val:0.25, fmt:v=>`+${v.toFixed(2)} shots/s`             },
  { icon:'\u25C6', name:'Explosive Powder',  desc:'More potent propellant charge',    stat:'damage',      val:4,    fmt:v=>`+${v} base damage`                    },
  { icon:'\u25C6', name:'Refined Rounds',    desc:'Precision-machined ammunition',    stat:'damage',      val:7,    fmt:v=>`+${v} base damage`                    },
  { icon:'\u25C6', name:'Masterwork Shot',   desc:'Rare artisan-crafted shells',      stat:'damage',      val:12,   fmt:v=>`+${v} base damage`                    },
  { icon:'\u2726', name:'Telescopic Sight',  desc:'Improved targeting optics',        stat:'critChance',  val:0.03, fmt:v=>`+${Math.round(v*100)}% crit chance`   },
  { icon:'\u2726', name:'Precision Gauge',   desc:'Fine-tuned aiming apparatus',      stat:'critChance',  val:0.05, fmt:v=>`+${Math.round(v*100)}% crit chance`   },
  { icon:'\u2605', name:'Volatile Mix',      desc:'Unstable but devastating charge',  stat:'critMult',    val:0.20, fmt:v=>`+${Math.round(v*100)}% crit damage`   },
  { icon:'\u2605', name:'Detonation Core',   desc:'Catastrophic critical strikes',    stat:'critMult',    val:0.35, fmt:v=>`+${Math.round(v*100)}% crit damage`   },
  { icon:'\u27A4', name:'Aether Propellant', desc:'Aetherium-charged powder',         stat:'bulletSpeed', val:0.15, fmt:v=>`+${Math.round(v*100)}% shot speed`    },
  { icon:'\u27A4', name:'Vacuum Barrel',     desc:'Frictionless shot barrel',         stat:'bulletSpeed', val:0.25, fmt:v=>`+${Math.round(v*100)}% shot speed`    },
];

// ================================================================
// STATE
// ================================================================
let player, bullets, eBullets, enemies, particles, orbs;
let score, wave, waveTimer, shootTimer;
let groupDir, groupX, screenFlash;
let gameState;   // 'weapon-select'|'playing'|'upgrading'|'paused'|'gameover'

let fingerRawX = null;
let fingerRawY = null;

// Unlocked weapons (persisted in localStorage)
let unlockedWeapons = new Set(['heavy', 'spread', 'burst']);

// ================================================================
// CANVAS
// ================================================================
const gc  = document.getElementById('gc');
const ctx = gc.getContext('2d');

let GW = 0, GH = 0;
let parallaxLayers = [];   // declared before resizeCanvas() to avoid TDZ

function resizeCanvas() {
  GW = gc.width  = window.innerWidth;
  GH = gc.height = window.innerHeight;
  gc.style.width  = GW + 'px';
  gc.style.height = GH + 'px';
  initParallax();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ================================================================
// SCALING FORMULAS
// ================================================================
function enemyHp(w)    { return Math.round(CFG.ENEMY_BASE_HP  * Math.pow(CFG.ENEMY_HP_SCALE,  w - 1)); }
function enemyDmg(w)   { return Math.round(CFG.ENEMY_BASE_DMG * Math.pow(CFG.ENEMY_DMG_SCALE, w - 1)); }
function enemyShoot(w) { return Math.max(CFG.ENEMY_SHOOT_MIN, CFG.ENEMY_SHOOT_BASE - CFG.ENEMY_SHOOT_DEC * (w - 1)); }

// ================================================================
// FACTORIES
// ================================================================
function makePlayer() {
  return {
    x: GW / 2,   y: GH * 0.82,
    tx: GW / 2,  ty: GH * 0.82,
    hp: CFG.BASE_HP,    maxHp: CFG.BASE_HP,
    displayHp: CFG.BASE_HP,   // smooth animated bar value
    ghostHp:   CFG.BASE_HP,   // ghost/lag bar value
    moveSpeed:   1.0,
    atkSpeed:    CFG.BASE_ATK_SPEED,
    damage:      CFG.BASE_DAMAGE,
    critChance:  CFG.BASE_CRIT_CHANCE,
    critMult:    CFG.BASE_CRIT_MULT,
    bulletSpeed: CFG.BASE_BULLET_SPEED,
    weapon:      null,
    size:        CFG.SHIP_SIZE,
    invulTimer:  0,
    burstTimer:  0,
    laserFlash:  0,    // visual timer for laser beam
  };
}

function makeEnemy(baseX, y, w) {
  const hp = enemyHp(w);
  const si  = enemyShoot(w);
  return {
    baseX, y,
    r:          20 + Math.min(w * 1.4, 12),
    hp, maxHp:  hp,
    damage:     enemyDmg(w),
    shootTimer: Math.random() * si,
    shootInt:   si,
    angle:      Math.random() * Math.PI * 2,
    rotSpeed:   (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6),
    flash:      0,
  };
}

// ================================================================
// SCORE / UNLOCK STORAGE  (localStorage)
// ================================================================
const LS_HS      = 'aetheric_hs';
const LS_RUNS    = 'aetheric_runs';
const LS_UNLOCKS = 'aetheric_unlocks';

function loadHighScore() {
  return parseInt(localStorage.getItem(LS_HS) || '0');
}

function saveRun(s, w) {
  const hs = loadHighScore();
  if (s > hs) localStorage.setItem(LS_HS, String(s));

  let runs = [];
  try { runs = JSON.parse(localStorage.getItem(LS_RUNS) || '[]'); } catch (_) {}
  runs.unshift({ score: s, wave: w, date: Date.now() });
  localStorage.setItem(LS_RUNS, JSON.stringify(runs.slice(0, 5)));
}

function loadUnlocks() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_UNLOCKS) || '["heavy","spread","burst"]');
    unlockedWeapons = new Set(saved);
  } catch (_) {
    unlockedWeapons = new Set(['heavy', 'spread', 'burst']);
  }
  // Also unlock via high score
  const hs = loadHighScore();
  for (const wep of WEAPONS) {
    if (wep.locked && hs >= wep.unlockScore) unlockedWeapons.add(wep.id);
  }
}

function saveUnlocks() {
  localStorage.setItem(LS_UNLOCKS, JSON.stringify([...unlockedWeapons]));
}

function checkScoreUnlocks(s) {
  let newUnlock = false;
  for (const wep of WEAPONS) {
    if (wep.locked && s >= wep.unlockScore && !unlockedWeapons.has(wep.id)) {
      unlockedWeapons.add(wep.id);
      newUnlock = true;
    }
  }
  if (newUnlock) saveUnlocks();
}

// ================================================================
// SPACE PARALLAX BACKGROUND
// 3 layers: nebulae+dim stars / medium stars+planets / bright fast stars
// ================================================================
function initParallax() {
  const tH = GH * 2.5;

  function genStars(count, rMin, rMax) {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        type: 'star',
        x:    Math.random() * GW,
        y:    (i / count) * tH + Math.random() * (tH / count),
        r:    rMin + Math.random() * (rMax - rMin),
        // hue: mostly white, occasionally blue-white or warm
        hue:  Math.random() > 0.75 ? 210 : (Math.random() > 0.85 ? 38 : 0),
        sat:  Math.random() > 0.6 ? Math.round(Math.random() * 25) : 0,
        lum:  72 + Math.round(Math.random() * 28),
        twinkle:      Math.random() * Math.PI * 2,
        twinkleSpeed: 0.4 + Math.random() * 2.5,
      });
    }
    return items;
  }

  function genNebulae(count) {
    const items = [];
    const palettes = [
      [220, 55, 55],  // blue-purple
      [275, 50, 50],  // deep purple
      [170, 45, 60],  // cyan-teal
      [340, 50, 55],  // pink-red (supernova remnant)
    ];
    for (let i = 0; i < count; i++) {
      const c = palettes[Math.floor(Math.random() * palettes.length)];
      items.push({
        type: 'nebula',
        x:    Math.random() * GW,
        y:    (i / count) * tH + Math.random() * (tH / count),
        r:    90 + Math.random() * 180,
        hue: c[0], sat: c[1], lum: c[2],
      });
    }
    return items;
  }

  function genPlanets(count) {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        type:    'planet',
        x:       120 + Math.random() * (GW - 240),
        y:       (i / count) * tH + tH * 0.15 + Math.random() * (tH * 0.7 / count),
        r:       40 + Math.random() * 55,
        variant: Math.floor(Math.random() * 3),  // 0=rocky, 1=gas, 2=icy
        ringChance: Math.random() > 0.55,
      });
    }
    return items;
  }

  parallaxLayers = [
    { speed:  8, alpha: 1.0, offset: 0,                tileH: tH, items: [...genNebulae(5),  ...genStars(70, 0.5, 1.2)] },
    { speed: 22, alpha: 1.0, offset: Math.random()*GH, tileH: tH, items: [...genStars(40, 1.0, 2.2), ...genPlanets(3)] },
    { speed: 58, alpha: 1.0, offset: Math.random()*GH, tileH: tH, items: genStars(22, 1.5, 3.8) },
  ];
}

function updateParallax(dt) {
  for (const layer of parallaxLayers) {
    layer.offset = (layer.offset + layer.speed * dt) % layer.tileH;
    for (const item of layer.items) {
      if (item.type === 'star') item.twinkle += item.twinkleSpeed * dt;
    }
  }
}

function drawParallaxItem(item, x, y) {
  if (y > GH + 300 || y < -300) return;

  if (item.type === 'star') {
    const tw = 0.55 + Math.abs(Math.sin(item.twinkle)) * 0.45;
    ctx.globalAlpha = tw;
    ctx.fillStyle   = `hsl(${item.hue},${item.sat}%,${item.lum}%)`;
    const r = Math.ceil(item.r);
    ctx.fillRect(Math.round(x) - r, Math.round(y) - r, r * 2, r * 2);

  } else if (item.type === 'nebula') {
    ctx.globalAlpha = 1;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, item.r);
    grd.addColorStop(0,   `hsla(${item.hue},${item.sat}%,${item.lum}%,0.10)`);
    grd.addColorStop(0.55,`hsla(${item.hue},${item.sat}%,${item.lum}%,0.05)`);
    grd.addColorStop(1,   `hsla(${item.hue},${item.sat}%,${item.lum}%,0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, item.r, 0, Math.PI * 2);
    ctx.fill();

  } else if (item.type === 'planet') {
    ctx.globalAlpha = 1;
    const r = item.r;
    const ix = Math.round(x), iy = Math.round(y);

    if (item.variant === 0) {
      // Rocky: dark with craters
      ctx.fillStyle = '#181520';
      ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,100,140,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.stroke();
      // Craters
      ctx.fillStyle = 'rgba(8,6,14,0.7)';
      for (let c = 0; c < 4; c++) {
        const ca = c * 1.62 + 0.4;
        const cd = r * 0.45 * (0.5 + (c % 2) * 0.4);
        ctx.beginPath();
        ctx.arc(ix + Math.cos(ca)*cd, iy + Math.sin(ca)*cd * 0.55, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
      // Rim light
      ctx.strokeStyle = 'rgba(160,140,200,0.22)'; ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.arc(ix - r*0.18, iy - r*0.22, r * 0.88, Math.PI*0.8, Math.PI*1.8); ctx.stroke();

    } else if (item.variant === 1) {
      // Gas giant: banded
      ctx.save();
      ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#0e0b18'; ctx.fillRect(ix-r, iy-r, r*2, r*2);
      const bands = [0.10, 0.30, 0.50, 0.68, 0.84];
      const bclrs = ['rgba(80,55,130,0.45)','rgba(55,40,100,0.35)','rgba(95,65,145,0.50)','rgba(60,45,110,0.38)','rgba(75,50,120,0.42)'];
      for (let bi = 0; bi < bands.length; bi++) {
        ctx.fillStyle = bclrs[bi];
        ctx.fillRect(ix-r, Math.round(iy - r + r*2*bands[bi]), r*2, Math.round(r * 0.17));
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(120,85,200,0.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.stroke();
      // Ring
      if (item.ringChance) {
        ctx.save();
        ctx.strokeStyle = 'rgba(140,110,200,0.22)';
        ctx.lineWidth = r * 0.28;
        ctx.beginPath();
        ctx.ellipse(ix, iy, r * 1.65, r * 0.30, -0.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

    } else {
      // Icy planet: pale blue
      ctx.fillStyle = '#0a1020';
      ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(170,210,255,0.38)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.stroke();
      // Ice cap highlight
      ctx.fillStyle = 'rgba(200,225,255,0.20)';
      ctx.beginPath();
      ctx.ellipse(ix, iy - r*0.62, r*0.60, r*0.40, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(230,240,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(ix, iy + r*0.62, r*0.55, r*0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawParallax() {
  for (const layer of parallaxLayers) {
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    for (const item of layer.items) {
      const y = (item.y + layer.offset) % layer.tileH - GH;
      drawParallaxItem(item, item.x, y);
      drawParallaxItem(item, item.x, y + layer.tileH);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ================================================================
// PHASE 4 — GESTURE DETECTION
// ================================================================

// Returns how many fingers (index, middle, ring) are extended.
// Sequential: can't have middle up without index.
function countExtendedFingers(lms) {
  const margin = 0.04; // 4% of normalised frame
  function up(tipIdx, mcpIdx) { return lms[tipIdx].y < lms[mcpIdx].y - margin; }
  const index  = up(8,  5);
  const middle = up(12, 9);
  const ring   = up(16, 13);
  if (index && middle && ring)  return 3;
  if (index && middle && !ring) return 2;
  if (index && !middle)         return 1;
  return 0;
}

// Returns 'up', 'down', or null.
function detectThumb(lms) {
  const diff = lms[1].y - lms[4].y;  // CMC.y - TIP.y; positive = tip above CMC
  if (diff >  0.10) return 'up';
  if (diff < -0.08) return 'down';
  return null;
}

// Gesture state machine
const GS = {
  // Card selection
  fingers:      0,
  holdFrames:   0,
  cooldownUntil: 0,
  pendingIdx:   -1,     // 0/1/2 card index
  confirming:   false,
  // Thumb confirmation
  thumbGesture: null,
  thumbFrames:  0,
  thumbCoolUntil: 0,
};

// Called each time landmarks arrive from WebSocket
function processGesture(lms) {
  const now  = performance.now();
  const over = gameState === 'weapon-select' || gameState === 'upgrading';

  if (!over && !GS.confirming) {
    // Not in an overlay, reset and skip
    if (GS.holdFrames > 0) { GS.holdFrames = 0; GS.fingers = 0; clearGestureHighlights(); }
    return;
  }

  // -- Thumb confirmation state --
  if (GS.confirming) {
    if (now < GS.thumbCoolUntil) return;
    const thumb = detectThumb(lms);
    if (thumb && thumb === GS.thumbGesture) {
      GS.thumbFrames++;
      updateThumbProgress(GS.thumbFrames / CFG.GESTURE_HOLD_FRAMES);
      if (GS.thumbFrames >= CFG.GESTURE_HOLD_FRAMES) {
        if (thumb === 'up') confirmCard(GS.pendingIdx);
        else cancelCard();
        GS.confirming     = false;
        GS.thumbFrames    = 0;
        GS.thumbGesture   = null;
        GS.thumbCoolUntil = now + CFG.GESTURE_COOLDOWN_MS;
        updateThumbProgress(0);
      }
    } else {
      GS.thumbGesture = thumb;
      GS.thumbFrames  = thumb ? 1 : 0;
      updateThumbProgress(0);
    }
    return;
  }

  // -- Card selection state --
  if (now < GS.cooldownUntil) return;
  const f = countExtendedFingers(lms);

  if (f === 0) {
    if (GS.holdFrames > 0) { GS.holdFrames = 0; GS.fingers = 0; clearGestureHighlights(); }
    return;
  }

  if (f !== GS.fingers) {
    GS.fingers    = f;
    GS.holdFrames = 1;
  } else {
    GS.holdFrames++;
  }

  const progress = GS.holdFrames / CFG.GESTURE_HOLD_FRAMES;
  highlightGestureCard(f - 1, progress);

  if (GS.holdFrames >= CFG.GESTURE_HOLD_FRAMES) {
    GS.pendingIdx  = f - 1;
    GS.confirming  = true;
    GS.holdFrames  = 0;
    GS.fingers     = 0;
    GS.cooldownUntil = now + CFG.GESTURE_COOLDOWN_MS;
    clearGestureHighlights();
    openConfirmOverlay(f - 1);
  }
}

function highlightGestureCard(idx, progress) {
  const overlayId = gameState === 'weapon-select' ? 'weapon-cards' : 'upgrade-cards';
  const cards = document.querySelectorAll(`#${overlayId} .upgrade-card`);
  cards.forEach((c, i) => {
    c.classList.remove('gesture-hover', 'gesture-active');
    if (i === idx) c.classList.add(progress >= 1 ? 'gesture-active' : 'gesture-hover');
  });

  // Update gesture progress bar
  const barId = gameState === 'weapon-select' ? 'gesture-bar' : 'upgrade-gesture-bar';
  const bar = document.getElementById(barId);
  if (bar) bar.style.width = (Math.min(1, progress) * 100).toFixed(1) + '%';

  // Highlight gesture hint tags
  const prefix = gameState === 'weapon-select' ? 'gh-' : 'ugh-';
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(prefix + i);
    if (el) el.classList.toggle('active', i === idx + 1);
  }
}

function clearGestureHighlights() {
  document.querySelectorAll('.upgrade-card').forEach(c => c.classList.remove('gesture-hover', 'gesture-active'));
  ['gesture-bar', 'upgrade-gesture-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.width = '0%';
  });
  ['gh-1','gh-2','gh-3','ugh-1','ugh-2','ugh-3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
}

function openConfirmOverlay(cardIdx) {
  const overlayId = gameState === 'weapon-select' ? 'weapon-cards' : 'upgrade-cards';
  const cards = document.querySelectorAll(`#${overlayId} .upgrade-card`);
  const name  = cards[cardIdx]?.querySelector('.card-name')?.textContent || '?';
  document.getElementById('confirm-card-name').textContent = name;
  document.getElementById('confirm-yes').classList.remove('active-thumb');
  document.getElementById('confirm-no').classList.remove('active-thumb');
  document.getElementById('confirm-thumb-bar').style.width = '0%';
  showOverlay('confirm-overlay');
}

function confirmCard(idx) {
  hideOverlay('confirm-overlay');
  const overlayId = gameState === 'weapon-select' ? 'weapon-cards' : 'upgrade-cards';
  const cards = document.querySelectorAll(`#${overlayId} .upgrade-card`);
  if (cards[idx]) cards[idx].dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function cancelCard() {
  hideOverlay('confirm-overlay');
  clearGestureHighlights();
}

function updateThumbProgress(progress) {
  const bar = document.getElementById('confirm-thumb-bar');
  if (bar) bar.style.width = (Math.min(1, progress) * 100).toFixed(1) + '%';
  // Highlight active thumb button
  const up   = document.getElementById('confirm-yes');
  const down = document.getElementById('confirm-no');
  if (GS.thumbGesture === 'up')   { up.classList.add('active-thumb');    down.classList.remove('active-thumb'); }
  if (GS.thumbGesture === 'down') { down.classList.add('active-thumb');  up.classList.remove('active-thumb');   }
  if (!GS.thumbGesture)           { up.classList.remove('active-thumb'); down.classList.remove('active-thumb'); }
}

// ================================================================
// INIT
// ================================================================
function initGame() {
  loadUnlocks();
  player      = makePlayer();
  bullets     = [];
  eBullets    = [];
  enemies     = [];
  particles   = [];
  orbs        = [];
  score       = 0;
  wave        = 0;
  waveTimer   = CFG.WAVE_TIMER;
  shootTimer  = 1 / CFG.BASE_ATK_SPEED;
  groupDir    = 1;
  groupX      = 0;
  screenFlash = 0;
  gameState   = 'weapon-select';

  ['upgrade-overlay', 'pause-overlay', 'gameover-overlay', 'confirm-overlay'].forEach(hideOverlay);
  clearGestureHighlights();
  updateStatsPanel();
  updateTopBar();
  showWeaponSelect();
}

// ================================================================
// WEAPON SELECTION
// ================================================================
function showWeaponSelect() {
  const container = document.getElementById('weapon-cards');
  container.innerHTML = '';
  for (const wep of WEAPONS) {
    const isLocked = !unlockedWeapons.has(wep.id);
    const card = document.createElement('div');
    card.className = 'upgrade-card weapon-card' + (isLocked ? ' locked' : '');
    card.style.borderTopColor = isLocked ? '#3a2010' : wep.color;
    card.innerHTML =
      `<span class="card-icon" style="color:${isLocked ? '#4a3020' : wep.color}">${wep.icon}</span>` +
      `<div class="card-name" style="color:${isLocked ? '#4a3020' : wep.color}">${wep.name}</div>` +
      `<div class="card-desc">${wep.desc.replace('\n', '<br>')}</div>` +
      `<div class="card-stat" style="color:${isLocked ? '#4a3020' : wep.color}">DMG \u00D7${wep.dmgMult.toFixed(2)}&nbsp;&nbsp;SPD \u00D7${wep.atkMult.toFixed(2)}</div>` +
      `<div class="card-stat2">${isLocked ? '' : wep.hint}</div>` +
      (wep.locked ? `<div class="card-unlock">${isLocked ? 'SCORE ' + wep.unlockScore + ' TO UNLOCK' : 'UNLOCKED'}</div>` : '');
    if (!isLocked) card.addEventListener('click', () => applyWeapon(wep));
    container.appendChild(card);
  }
  showOverlay('weapon-overlay');
}

function applyWeapon(wep) {
  player.weapon   = wep.id;
  player.atkSpeed = CFG.BASE_ATK_SPEED * wep.atkMult;
  shootTimer      = 1 / player.atkSpeed;
  hideOverlay('weapon-overlay');
  hideOverlay('confirm-overlay');
  gameState = 'playing';
  spawnWave();
  updateStatsPanel();
}

// ================================================================
// WAVE SPAWNING
// ================================================================
function spawnWave() {
  wave++;
  waveTimer = CFG.WAVE_TIMER;
  groupX    = 0;
  groupDir  = 1;

  const count   = Math.min(4 + wave * 2, 24);
  const cols    = Math.min(count, 7);
  const margin  = 90;
  const spacing = Math.min((GW - margin * 2) / Math.max(cols - 1, 1), 105);
  const startX  = (GW - spacing * (cols - 1)) / 2;
  const startY  = GH * CFG.ENEMY_ZONE_TOP + 55;
  const rowGap  = 65;

  for (let i = 0; i < count; i++) {
    enemies.push(makeEnemy(
      startX + (i % cols) * spacing,
      startY + Math.floor(i / cols) * rowGap,
      wave
    ));
  }
  announceWave(wave);
}

// ================================================================
// KEYBOARD
// ================================================================
const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.key);
  if (e.key === 'p' || e.key === 'P') togglePause();
  if ((e.key === 'r' || e.key === 'R') && gameState === 'gameover') initGame();
  // Debug: unlock all weapons
  if (e.key === 'u' || e.key === 'U') {
    WEAPONS.forEach(w => unlockedWeapons.add(w.id));
    saveUnlocks();
    if (gameState === 'weapon-select') showWeaponSelect();
  }
});
window.addEventListener('keyup', e => keys.delete(e.key));
document.getElementById('restart-btn').addEventListener('click', initGame);

// ================================================================
// SPAWN HELPERS
// ================================================================
let _lastCrit = false;

function calcDamage(dmgMult = 1.0) {
  _lastCrit = Math.random() < player.critChance;
  return Math.round(player.damage * dmgMult * (_lastCrit ? player.critMult : 1));
}

// Fire a single bullet (angle in radians, -PI/2 = straight up)
function fireBullet(x, y, angle, dmgMult, type = 'normal') {
  const spd = CFG.PLAYER_BULLET_BASE_SPD * player.bulletSpeed;
  const dmg = calcDamage(dmgMult);
  const b = { x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, dmg, crit: _lastCrit, type };
  if (type === 'homing') {
    b.turnRate = 3.2;   // radians/sec
  } else if (type === 'bounce') {
    b.r         = 6;    // current collision radius (grows on bounce)
    b.bounces   = 0;
    b.maxBounces = 3;
  }
  bullets.push(b);
}

function spawnWeaponBullets() {
  const wep  = WEAPONS.find(w => w.id === player.weapon);
  const mult = wep ? wep.dmgMult : 1.0;
  const bx   = player.x;
  const by   = player.y - player.size * 0.7;

  if (player.weapon === 'heavy') {
    fireBullet(bx, by, -Math.PI / 2, mult);

  } else if (player.weapon === 'spread') {
    const s = 0.28;
    fireBullet(bx, by, -Math.PI / 2 - s, mult);
    fireBullet(bx, by, -Math.PI / 2,      mult);
    fireBullet(bx, by, -Math.PI / 2 + s,  mult);

  } else if (player.weapon === 'burst') {
    fireBullet(bx, by, -Math.PI / 2, mult);
    player.burstTimer = 0.13;

  } else if (player.weapon === 'homing') {
    fireBullet(bx, by, -Math.PI / 2, mult, 'homing');

  } else if (player.weapon === 'bounce') {
    // Random angle upward: 45° to 135° (π/4 to 3π/4 from horizontal → -3π/4 to -π/4)
    const a = -(Math.PI / 4) - Math.random() * (Math.PI / 2);
    fireBullet(bx, by, a, mult, 'bounce');

  } else if (player.weapon === 'laser') {
    fireLaser(mult);
  }
}

function fireLaser(mult) {
  // Instant damage to all enemies in a ~30px column above the player
  const dmg = calcDamage(mult);
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const e  = enemies[ei];
    const ex = e.baseX + groupX;
    if (Math.abs(ex - player.x) < e.r + 28) {
      e.hp   -= dmg;
      e.flash = 1.0;
      spawnDmgNumber(ex, e.y - e.r - 6, dmg, _lastCrit);
      if (e.hp <= 0) {
        spawnParticles(ex, e.y, '#40d8ff', 14);
        if (Math.random() < CFG.ORB_DROP_CHANCE) spawnOrb(ex, e.y);
        enemies.splice(ei, 1);
        score += 10 * wave;
        updateTopBar();
      }
    }
  }
  player.laserFlash = 0.20;  // visual duration
}

function spawnEnemyBullet(ex, ey, dmg) {
  const dx    = player.x - ex, dy = player.y - ey;
  const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.22;
  eBullets.push({ x: ex, y: ey, vx: Math.cos(angle) * CFG.ENEMY_BULLET_SPD, vy: Math.sin(angle) * CFG.ENEMY_BULLET_SPD, r: 5, dmg });
}

function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 130 + 45;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 30, r: Math.random()*3.5+1, life:1.0, decay: Math.random()*1.4+0.6, color });
  }
}

function spawnDmgNumber(x, y, dmg, crit) {
  particles.push({ isDmgText:true, x, y, vy:-60, text: crit?`\u2605${dmg}`:`${dmg}`, color: crit?'#ffcc00':'#e8a020', size: crit?17:13, life:1.2, decay:0.75 });
}

function spawnOrb(x, y) {
  orbs.push({ x, y, vy: CFG.ORB_FALL_SPEED, r: 10, healAmt: Math.round(CFG.ORB_HEAL_MIN + Math.random()*(CFG.ORB_HEAL_MAX-CFG.ORB_HEAL_MIN)), bob: Math.random()*Math.PI*2 });
}

// ================================================================
// UPDATE
// ================================================================
function update(dt) {
  if (gameState !== 'playing') return;

  if (player.invulTimer  > 0) player.invulTimer  -= dt;
  if (player.laserFlash  > 0) player.laserFlash  -= dt * 5;
  if (screenFlash        > 0) screenFlash = Math.max(0, screenFlash - dt * 3.5);

  // Smooth HP animation
  if (player.hp < player.displayHp) {
    player.displayHp += (player.hp - player.displayHp) * Math.min(1, dt * 4.5);
  } else {
    player.displayHp += (player.hp - player.displayHp) * Math.min(1, dt * 8.0);
  }
  player.ghostHp = Math.max(player.displayHp, player.ghostHp - dt * 22);

  // Wave timer penalty
  if (enemies.length > 0) {
    waveTimer -= dt;
    if (waveTimer <= 0) {
      damagePlayer(Math.round(player.maxHp * CFG.WAVE_PENALTY), true);
      waveTimer = CFG.WAVE_TIMER;
    }
  }

  updateShip(dt);
  updateParallax(dt);

  // Auto-shoot
  shootTimer -= dt;
  if (shootTimer <= 0) {
    spawnWeaponBullets();
    shootTimer = 1 / player.atkSpeed;
  }

  // Burst second shot
  if (player.weapon === 'burst' && player.burstTimer > 0) {
    player.burstTimer -= dt;
    if (player.burstTimer <= 0) {
      const wep = WEAPONS.find(w => w.id === 'burst');
      fireBullet(player.x, player.y - player.size * 0.7, -Math.PI / 2, wep.dmgMult);
    }
  }

  // Homing bullet steering (before move)
  if (enemies.length > 0) {
    for (const b of bullets) {
      if (b.type !== 'homing') continue;
      let nearest = null, nearD2 = Infinity;
      for (const e of enemies) {
        const ex = e.baseX + groupX;
        const d2 = (b.x-ex)**2 + (b.y-e.y)**2;
        if (d2 < nearD2) { nearD2 = d2; nearest = e; }
      }
      if (!nearest) continue;
      const ex      = nearest.baseX + groupX;
      const tAngle  = Math.atan2(nearest.y - b.y, ex - b.x);
      const cAngle  = Math.atan2(b.vy, b.vx);
      let diff      = tAngle - cAngle;
      while (diff >  Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const turn    = Math.sign(diff) * Math.min(Math.abs(diff), b.turnRate * dt);
      const newA    = cAngle + turn;
      const spd     = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(newA) * spd;
      b.vy = Math.sin(newA) * spd;
    }
  }

  // Move all bullets
  for (const b of bullets)  { b.x += b.vx * dt; b.y += b.vy * dt; }
  for (const b of eBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }

  // Bounce bullet wall reflection + cull
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.type === 'bounce') {
      if ((b.x < b.r && b.vx < 0) || (b.x > GW - b.r && b.vx > 0)) {
        b.vx *= -1;
        b.r   = Math.min(b.r + 4, 28);
        b.bounces++;
      }
      if (b.y < -50 || b.bounces > b.maxBounces) bullets.splice(i, 1);
    } else {
      if (b.y < -30 || b.x < -30 || b.x > GW + 30) bullets.splice(i, 1);
    }
  }
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b = eBullets[i];
    if (b.x < -30 || b.x > GW+30 || b.y < -30 || b.y > GH+30) eBullets.splice(i, 1);
  }

  // Formation drift
  groupX += groupDir * CFG.FORMATION_SPEED * dt;
  let minEX = Infinity, maxEX = -Infinity;
  for (const e of enemies) {
    const ex = e.baseX + groupX;
    if (ex - e.r < minEX) minEX = ex - e.r;
    if (ex + e.r > maxEX) maxEX = ex + e.r;
  }
  if (maxEX > GW - 20 || minEX < 20) {
    groupDir *= -1;
    groupX   += groupDir * CFG.FORMATION_SPEED * dt * 2;
    for (const e of enemies) e.y += CFG.FORMATION_DIP;
  }

  // Enemy update: rotate + shoot
  for (const e of enemies) {
    e.angle     += e.rotSpeed * dt;
    e.flash      = Math.max(0, e.flash - dt * 7);
    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
      spawnEnemyBullet(e.baseX + groupX, e.y, e.damage);
      e.shootTimer = e.shootInt;
    }
  }

  checkBulletEnemyHits();
  checkEnemyBulletPlayerHits();
  updateOrbs(dt);

  // Wave cleared
  if (enemies.length === 0) {
    gameState = 'upgrading';
    setTimeout(showUpgradeCards, 400);
  }

  // Particles
  for (const p of particles) {
    if (p.isDmgText) { p.y += p.vy * dt; }
    else { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 85 * dt; }
    p.life -= p.decay * dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) { if (particles[i].life <= 0) particles.splice(i, 1); }

  updateTopBar();
}

function updateShip(dt) {
  const spd = CFG.BASE_SPEED * player.moveSpeed;
  const sz  = player.size;

  if (fingerRawX !== null) {
    player.tx = fingerRawX * GW;
    player.ty = GH * CFG.SHIP_ZONE_TOP + fingerRawY * GH * (1 - CFG.SHIP_ZONE_TOP);
  } else {
    if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) player.tx -= spd * dt;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) player.tx += spd * dt;
    if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) player.ty -= spd * dt;
    if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) player.ty += spd * dt;
  }

  player.tx = Math.max(sz, Math.min(GW - sz, player.tx));
  player.ty = Math.max(GH * CFG.SHIP_ZONE_TOP + sz, Math.min(GH - sz - 8, player.ty));

  const alpha = 1 - Math.pow(1 - CFG.SHIP_LERP_60, dt * 60);
  player.x += (player.tx - player.x) * alpha;
  player.y += (player.ty - player.y) * alpha;
}

function checkBulletEnemyHits() {
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b  = bullets[bi];
    const br = b.type === 'bounce' ? b.r : 4;
    let hit  = false;
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e  = enemies[ei];
      const ex = e.baseX + groupX;
      const dx = b.x - ex, dy = b.y - e.y;
      if (dx * dx + dy * dy < (e.r + br) ** 2) {
        e.hp   -= b.dmg;
        e.flash = 1.0;
        spawnDmgNumber(ex + (Math.random()-0.5)*18, e.y-e.r-6, b.dmg, b.crit);
        hit = true;
        if (e.hp <= 0) {
          spawnParticles(ex, e.y, '#c8860a', 12);
          spawnParticles(ex, e.y, '#e04010',  5);
          if (Math.random() < CFG.ORB_DROP_CHANCE) spawnOrb(ex, e.y);
          enemies.splice(ei, 1);
          score += 10 * wave;
          checkScoreUnlocks(score);
          updateTopBar();
        }
        break;
      }
    }
    if (hit) bullets.splice(bi, 1);
  }
}

function checkEnemyBulletPlayerHits() {
  if (player.invulTimer > 0) return;
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b  = eBullets[i];
    const dx = b.x - player.x, dy = b.y - player.y;
    if (dx * dx + dy * dy < (b.r + player.size * 0.58) ** 2) {
      damagePlayer(b.dmg, false);
      eBullets.splice(i, 1);
    }
  }
}

function updateOrbs(dt) {
  for (const o of orbs) { o.y += o.vy * dt; o.bob += dt * 3.5; }
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o  = orbs[i];
    if (o.y > GH + 20) { orbs.splice(i, 1); continue; }
    const dx = player.x - o.x, dy = player.y - o.y;
    if (dx*dx + dy*dy < (player.size + o.r)**2) {
      player.hp = Math.min(player.maxHp, player.hp + o.healAmt);
      updateStatsPanel();
      particles.push({ isDmgText:true, x:o.x, y:o.y, vy:-55, text:`+${o.healAmt}`, color:'#60ff80', size:15, life:1.4, decay:0.55 });
      orbs.splice(i, 1);
    }
  }
}

function damagePlayer(amount, isTimerPenalty) {
  // Snap ghost bar to current position before damage reduces the bar
  player.ghostHp   = Math.max(player.ghostHp, player.displayHp);
  player.hp        = Math.max(0, player.hp - amount);
  player.invulTimer = 1.0;
  screenFlash = 1.0;
  spawnParticles(player.x, player.y, '#ff3030', 7);
  if (isTimerPenalty) {
    particles.push({ isDmgText:true, x:GW/2, y:GH*0.12, vy:-30, text:`HULL BREACH \u2212${amount}`, color:'#e05050', size:14, life:2.0, decay:0.38 });
  }
  updateStatsPanel();
  if (player.hp <= 0) {
    gameState = 'gameover';
    saveRun(score, wave);
    checkScoreUnlocks(score);
    document.getElementById('go-score').textContent     = 'SCORE: ' + String(score).padStart(5, '0');
    document.getElementById('go-highscore').textContent = 'BEST: '  + String(loadHighScore()).padStart(5, '0');
    document.getElementById('go-wave').textContent      = 'REACHED WAVE ' + wave;
    showOverlay('gameover-overlay');
  }
}

// ================================================================
// UPGRADE SYSTEM
// ================================================================
function showUpgradeCards() {
  const pool  = [...UPGRADE_POOL];
  const picks = [];
  while (picks.length < 3 && pool.length > 0) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);

  const container = document.getElementById('upgrade-cards');
  container.innerHTML = '';
  for (const up of picks) {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.innerHTML =
      `<span class="card-icon">${up.icon}</span>` +
      `<div class="card-name">${up.name}</div>` +
      `<div class="card-desc">${up.desc}</div>` +
      `<div class="card-stat">${up.fmt(up.val)}</div>`;
    card.addEventListener('click', () => {
      applyUpgrade(up);
      hideOverlay('upgrade-overlay');
      hideOverlay('confirm-overlay');
      gameState = 'playing';
      spawnWave();
    });
    container.appendChild(card);
  }
  showOverlay('upgrade-overlay');
}

function applyUpgrade(up) {
  switch (up.stat) {
    case 'moveSpeed':   player.moveSpeed   += up.val; break;
    case 'maxHp':       player.maxHp += up.val; player.hp += up.val; player.ghostHp += up.val; player.displayHp += up.val; break;
    case 'heal':        player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * up.val)); break;
    case 'atkSpeed':    player.atkSpeed    += up.val; break;
    case 'damage':      player.damage      += up.val; break;
    case 'critChance':  player.critChance   = Math.min(0.95, player.critChance + up.val); break;
    case 'critMult':    player.critMult    += up.val; break;
    case 'bulletSpeed': player.bulletSpeed += up.val; break;
  }
  updateStatsPanel();
}

// ================================================================
// PAUSE
// ================================================================
function togglePause() {
  if (gameState === 'gameover' || gameState === 'upgrading' || gameState === 'weapon-select') return;
  if (gameState === 'playing') {
    gameState = 'paused';
    showOverlay('pause-overlay');
  } else {
    gameState = 'playing';
    hideOverlay('pause-overlay');
  }
}

// ================================================================
// DRAW
// ================================================================

function fillRRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y, x+w,y+r, r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h, x+w-r,y+h, r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h, x,y+h-r, r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y, x+r,y, r);
  ctx.closePath(); ctx.fill();
}

function drawBackground() {
  ctx.imageSmoothingEnabled = false;
  // Deep space gradient — dark blue-black
  const grad = ctx.createLinearGradient(0, 0, 0, GH);
  grad.addColorStop(0,   '#000008');
  grad.addColorStop(0.4, '#010214');
  grad.addColorStop(1,   '#020118');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GW, GH);
  drawParallax();
  // Thin zone separator
  ctx.save();
  ctx.strokeStyle = 'rgba(200,134,10,0.06)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([6, 14]);
  ctx.beginPath();
  ctx.moveTo(0, GH * CFG.ENEMY_ZONE_BTM);
  ctx.lineTo(GW, GH * CFG.ENEMY_ZONE_BTM);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawGearEnemy(x, y, r, angle, flash, hp, maxHp) {
  const ix = Math.round(x), iy = Math.round(y);
  const teeth = 8, outerR = r, innerR = r * 0.68;
  ctx.save();
  ctx.translate(ix, iy);
  ctx.rotate(angle);

  ctx.beginPath();
  for (let i = 0; i < teeth*2; i++) {
    const a   = (i/(teeth*2))*Math.PI*2;
    const rad = (i%2===0) ? outerR : innerR;
    const px  = Math.round(rad*Math.cos(a));
    const py  = Math.round(rad*Math.sin(a));
    (i===0) ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
  }
  ctx.closePath();
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash*0.9})`; ctx.strokeStyle='#ffffff';
  } else {
    ctx.fillStyle = '#5a3010'; ctx.strokeStyle='#c8860a';
  }
  ctx.lineWidth = 2; ctx.fill(); ctx.stroke();

  if (flash <= 0) {
    const grd = ctx.createRadialGradient(0,0,0, 0,0,r*0.45);
    grd.addColorStop(0, '#ff6500'); grd.addColorStop(0.5,'#c03800'); grd.addColorStop(1,'rgba(160,40,0,0)');
    ctx.beginPath(); ctx.arc(0,0,r*0.45,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();
  }
  ctx.fillStyle='#1a0e04';
  ctx.fillRect(-Math.round(r*0.16), -Math.round(r*0.16), Math.round(r*0.32), Math.round(r*0.32));
  ctx.restore();

  if (hp < maxHp) {
    const bw=r*2.4, bx=ix-bw/2, by=iy-r-9;
    ctx.fillStyle='#1a0e04'; ctx.fillRect(Math.round(bx),Math.round(by),Math.round(bw),4);
    ctx.fillStyle=hp/maxHp>0.5?'#c8860a':'#c04020';
    ctx.fillRect(Math.round(bx),Math.round(by),Math.round(bw*(hp/maxHp)),4);
    ctx.strokeStyle='#3a1a04'; ctx.lineWidth=0.5;
    ctx.strokeRect(Math.round(bx),Math.round(by),Math.round(bw),4);
  }
}

function drawAirship(x, y, sz, invul) {
  if (invul && Math.floor(Date.now()/75)%2===0) return;
  const ix=Math.round(x), iy=Math.round(y);
  ctx.save(); ctx.translate(ix,iy);

  ctx.fillStyle='#4a2808'; ctx.strokeStyle='#c8860a'; ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(-Math.round(sz*0.30),Math.round(sz*0.08));
  ctx.lineTo(-Math.round(sz*0.90),Math.round(sz*0.62));
  ctx.lineTo(-Math.round(sz*0.14),Math.round(sz*0.42));
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(Math.round(sz*0.30),Math.round(sz*0.08));
  ctx.lineTo(Math.round(sz*0.90),Math.round(sz*0.62));
  ctx.lineTo(Math.round(sz*0.14),Math.round(sz*0.42));
  ctx.closePath(); ctx.fill(); ctx.stroke();

  ctx.fillStyle='#6b3c0a';
  ctx.beginPath(); ctx.ellipse(0,-Math.round(sz*0.08),Math.round(sz*0.40),Math.round(sz*0.88),0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#c8860a'; ctx.lineWidth=2; ctx.stroke();

  ctx.fillStyle='#1c3a60';
  ctx.beginPath(); ctx.ellipse(0,-Math.round(sz*0.28),Math.round(sz*0.17),Math.round(sz*0.13),0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#5090b0'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle='#80c0e0';
  ctx.fillRect(-Math.round(sz*0.10),-Math.round(sz*0.34),Math.round(sz*0.06),Math.round(sz*0.04));

  ctx.fillStyle='#e8a020';
  for (const sx of[-1,1]) {
    ctx.fillRect(Math.round(sx*sz*0.28)-2,Math.round(sz*0.17)-2,4,4);
    ctx.fillRect(Math.round(sx*sz*0.22)-2,Math.round(sz*0.05)-2,4,4);
  }

  const t = Date.now()/280;
  for (const sx of[-1,1]) {
    const px=Math.round(sx*sz*0.20), py0=Math.round(sz*0.40), ph=Math.round(sz*0.28);
    ctx.fillStyle='#1e1006'; ctx.strokeStyle='#c8860a'; ctx.lineWidth=1;
    ctx.fillRect(px-3,py0,6,ph); ctx.strokeRect(px-3,py0,6,ph);
    const pyS=py0+ph+Math.round(Math.sin(t+sx)*2.5);
    ctx.beginPath(); ctx.arc(px,pyS,5+Math.sin(t*1.4+sx)*1.5,0,Math.PI*2);
    ctx.fillStyle=`rgba(160,140,95,${0.20+Math.sin(t*1.4+sx)*0.06})`; ctx.fill();
  }
  ctx.fillStyle='#e8a020'; ctx.fillRect(-2,-Math.round(sz*1.04),4,Math.round(sz*0.16));
  ctx.restore();
}

// Smooth HP bar — ghost bar + main bar
function drawPlayerHPBar() {
  const bw  = player.size * 2 + 8;
  const bx  = Math.round(player.x - bw / 2);
  const by  = Math.round(player.y + player.size + 4);
  const pct      = Math.max(0, player.displayHp / player.maxHp);
  const ghostPct = Math.max(0, player.ghostHp   / player.maxHp);

  // Background
  ctx.fillStyle = '#1a0e04';
  ctx.fillRect(bx, by, Math.round(bw), 4);

  // Ghost bar (orange-red, semi-transparent, shows where HP was before hit)
  if (ghostPct > pct + 0.005) {
    ctx.fillStyle = 'rgba(210, 90, 20, 0.52)';
    ctx.fillRect(Math.round(bx + bw * pct), by, Math.round(bw * (ghostPct - pct)), 4);
  }

  // Main bar
  ctx.fillStyle = pct > 0.55 ? '#408020' : pct > 0.28 ? '#c8800a' : '#c02010';
  ctx.fillRect(bx, by, Math.round(bw * pct), 4);

  ctx.strokeStyle = '#3a1a04'; ctx.lineWidth = 0.5;
  ctx.strokeRect(bx, by, Math.round(bw), 4);
}

function drawFingertipCursor() {
  if (fingerRawX === null) return;
  const cx = Math.round(fingerRawX * GW);
  const cy = Math.round(GH * CFG.SHIP_ZONE_TOP + fingerRawY * GH * (1 - CFG.SHIP_ZONE_TOP));
  const t  = Date.now() / 500;
  const pulse = 7 + Math.sin(t) * 2;

  ctx.save(); ctx.globalAlpha = 0.90;
  ctx.strokeStyle='#e8a020'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(cx, cy, pulse, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle='#ffcc40'; ctx.fillRect(cx-3, cy-3, 6, 6);
  const gap=pulse+3, len=8;
  ctx.beginPath();
  ctx.moveTo(cx-gap-len,cy); ctx.lineTo(cx-gap,cy);
  ctx.moveTo(cx+gap,    cy); ctx.lineTo(cx+gap+len,cy);
  ctx.moveTo(cx,cy-gap-len); ctx.lineTo(cx,cy-gap);
  ctx.moveTo(cx,cy+gap);     ctx.lineTo(cx,cy+gap+len);
  ctx.stroke();
  ctx.restore();
}

function drawPlayerBullet(b) {
  const px=Math.round(b.x), py=Math.round(b.y);
  ctx.fillStyle='#e8a020'; ctx.fillRect(px-2,py-14,4,12);
  ctx.fillStyle='rgba(255,240,150,0.65)'; ctx.fillRect(px-2,py-16,4,3);
}

function drawHomingBullet(b) {
  const px=Math.round(b.x), py=Math.round(b.y);
  ctx.fillStyle='rgba(180,80,255,0.35)'; ctx.fillRect(px-7,py-7,14,14);
  ctx.fillStyle='#c060ff';
  ctx.beginPath(); ctx.moveTo(px,py-5); ctx.lineTo(px+4,py+3); ctx.lineTo(px-4,py+3); ctx.closePath(); ctx.fill();
}

function drawBounceBullet(b) {
  const px=Math.round(b.x), py=Math.round(b.y);
  const r=Math.round(b.r || 6);
  ctx.fillStyle='rgba(255,130,50,0.30)'; ctx.fillRect(px-r-4,py-r-4,(r+4)*2,(r+4)*2);
  ctx.fillStyle='#ff8040';
  ctx.beginPath();
  for (let i=0;i<6;i++) {
    const a=(i/6)*Math.PI*2-Math.PI/6;
    const px2=px+r*Math.cos(a), py2=py+r*Math.sin(a);
    (i===0)?ctx.moveTo(px2,py2):ctx.lineTo(px2,py2);
  }
  ctx.closePath(); ctx.fill();
}

function drawLaserBeam() {
  if (player.laserFlash <= 0) return;
  const a  = player.laserFlash * 5; // alpha: bright at first, fades
  const cx = Math.round(player.x);
  ctx.save();
  // Outer glow
  ctx.strokeStyle = `rgba(64,220,255,${Math.min(1,a*0.25)})`;
  ctx.lineWidth = 28; ctx.beginPath(); ctx.moveTo(cx,player.y); ctx.lineTo(cx,0); ctx.stroke();
  // Mid beam
  ctx.strokeStyle = `rgba(180,240,255,${Math.min(1,a*0.60)})`;
  ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(cx,player.y); ctx.lineTo(cx,0); ctx.stroke();
  // Core
  ctx.strokeStyle = `rgba(255,255,255,${Math.min(1,a)})`;
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx,player.y); ctx.lineTo(cx,0); ctx.stroke();
  ctx.restore();
}

function drawEnemyBullet(b) {
  const px=Math.round(b.x), py=Math.round(b.y);
  ctx.fillStyle='#ff6020'; ctx.fillRect(px-4,py-4,8,8);
  ctx.fillStyle='rgba(255,140,30,0.40)'; ctx.fillRect(px-7,py-7,14,14);
}

function drawOrb(o) {
  const px=Math.round(o.x), py=Math.round(o.y+Math.sin(o.bob)*3);
  ctx.fillStyle=`rgba(64,255,128,${0.18+Math.sin(o.bob*1.5)*0.06})`; ctx.fillRect(px-14,py-14,28,28);
  ctx.fillStyle='#1a5024'; ctx.fillRect(px-9,py-9,18,18);
  ctx.fillStyle='#38c058'; ctx.fillRect(px-7,py-7,14,14);
  ctx.fillStyle='#70e890'; ctx.fillRect(px-5,py-5,10,10);
  ctx.fillStyle='#b0ffc8'; ctx.fillRect(px-5,py-5,4,4);
  ctx.fillStyle='#ffffff'; ctx.fillRect(px-2,py-7,4,14); ctx.fillRect(px-7,py-2,14,4);
}

function draw() {
  ctx.imageSmoothingEnabled = false;
  drawBackground();

  if (screenFlash > 0) {
    ctx.fillStyle=`rgba(200,40,20,${screenFlash*0.28})`; ctx.fillRect(0,0,GW,GH);
  }

  // Laser beam drawn first (behind bullets)
  drawLaserBeam();

  // Player bullets
  for (const b of bullets) {
    if (b.type === 'homing') drawHomingBullet(b);
    else if (b.type === 'bounce') drawBounceBullet(b);
    else drawPlayerBullet(b);
  }
  for (const b of eBullets) drawEnemyBullet(b);
  for (const o of orbs)     drawOrb(o);
  for (const e of enemies)  drawGearEnemy(e.baseX+groupX, e.y, e.r, e.angle, e.flash, e.hp, e.maxHp);

  drawAirship(player.x, player.y, player.size, player.invulTimer > 0);
  drawPlayerHPBar();
  drawFingertipCursor();

  ctx.save();
  for (const p of particles) {
    const a=Math.max(0,p.life);
    if (p.isDmgText) {
      ctx.globalAlpha=a; ctx.fillStyle=p.color;
      ctx.font=`${p.size}px "Share Tech Mono","Courier New",monospace`;
      ctx.textAlign='center'; ctx.fillText(p.text,Math.round(p.x),Math.round(p.y));
    } else {
      ctx.globalAlpha=a; ctx.fillStyle=p.color;
      ctx.fillRect(Math.round(p.x-p.r),Math.round(p.y-p.r),Math.round(p.r*2),Math.round(p.r*2));
    }
  }
  ctx.textAlign='left'; ctx.globalAlpha=1;
  ctx.restore();
}

// ================================================================
// HUD UPDATES
// ================================================================
function updateTopBar() {
  document.getElementById('wave-num').textContent  = wave;
  document.getElementById('score-num').textContent = String(score).padStart(5,'0');
  const frac=Math.max(0, waveTimer/CFG.WAVE_TIMER);
  const timerN=document.getElementById('timer-num');
  const timerF=document.getElementById('timer-fill');
  timerN.textContent = Math.ceil(Math.max(0,waveTimer));
  timerN.className   = frac < 0.25 ? 'warning' : '';
  timerF.style.width = (frac*100).toFixed(1)+'%';
  timerF.className   = frac < 0.25 ? 'warning' : '';
}

function updateStatsPanel() {
  const hpPct      = player.hp       / player.maxHp;
  const displayPct = player.displayHp / player.maxHp;
  const ghostPct   = player.ghostHp   / player.maxHp;

  const fill  = document.getElementById('hp-fill');
  const ghost = document.getElementById('hp-ghost');
  fill.style.width  = (Math.max(0, displayPct) * 100).toFixed(1) + '%';
  ghost.style.width = (Math.max(0, ghostPct)   * 100).toFixed(1) + '%';
  fill.className    = 'bar hp' + (hpPct < 0.30 ? ' critical' : '');

  document.getElementById('val-hp').textContent    = `${Math.round(player.hp)}/${player.maxHp}`;
  document.getElementById('val-spd').textContent   = `${Math.round(player.moveSpeed*100)}%`;
  document.getElementById('val-atk').textContent   = `${player.atkSpeed.toFixed(2)}/s`;
  document.getElementById('val-dmg').textContent   = `${player.damage}`;
  document.getElementById('val-crit').textContent  = `${Math.round(player.critChance*100)}%`;
  document.getElementById('val-cdmg').textContent  = `${Math.round(player.critMult*100)}%`;
  document.getElementById('val-bspd').textContent  = `${Math.round(player.bulletSpeed*100)}%`;
  const wep = WEAPONS.find(w=>w.id===player.weapon);
  document.getElementById('val-weapon').textContent = wep ? wep.name : '\u2014';
  if (wep) document.getElementById('val-weapon').style.color = wep.color;
}

let _waveAnnounceTimer = null;
function announceWave(w) {
  const el=document.getElementById('wave-announce');
  document.getElementById('wa-num').textContent=w;
  el.classList.add('show');
  if (_waveAnnounceTimer) clearTimeout(_waveAnnounceTimer);
  _waveAnnounceTimer=setTimeout(()=>el.classList.remove('show'),2400);
}

function showOverlay(id) { document.getElementById(id).classList.add('visible');    }
function hideOverlay(id) { document.getElementById(id).classList.remove('visible'); }

// ================================================================
// THREE.JS HAND VIEWER
// ================================================================
let handRenderer, handScene, handCamera;
let handJoints, handBones, handTargetPos, hasHand;
const _hmid=new THREE.Vector3(), _hdir=new THREE.Vector3();
const _hup =new THREE.Vector3(0,1,0), _hq=new THREE.Quaternion();
const HCONN=[
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17],
];
const HTIPS=new Set([4,8,12,16,20]);

function initHandViewer() {
  const wrap=document.getElementById('hand-canvas-wrap');
  const W=214, H=158;
  handRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  handRenderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  handRenderer.setSize(W,H); handRenderer.setClearColor(0x000000,0);
  wrap.appendChild(handRenderer.domElement);
  handScene=new THREE.Scene();
  handCamera=new THREE.PerspectiveCamera(50,W/H,0.01,100);
  handCamera.position.set(0,0,1.8);
  handScene.add(new THREE.AmbientLight(0xffffff,0.5));
  const dl=new THREE.DirectionalLight(0xffffff,1.0); dl.position.set(1,2,3); handScene.add(dl);
  const JMAT=new THREE.MeshPhongMaterial({color:0xd4b070,transparent:true,opacity:0.90});
  const BMAT=new THREE.MeshPhongMaterial({color:0xc8860a,transparent:true,opacity:0.90});
  const TMAT=new THREE.MeshPhongMaterial({color:0xe8a020,transparent:true,opacity:0.90});
  handJoints=Array.from({length:21},(_,i)=>{
    const m=new THREE.Mesh(new THREE.SphereGeometry(HTIPS.has(i)?0.018:0.013,10,10),HTIPS.has(i)?TMAT:JMAT);
    m.visible=false; handScene.add(m); return m;
  });
  handBones=HCONN.map(()=>{
    const m=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,1,8),BMAT);
    m.visible=false; handScene.add(m); return m;
  });
  handTargetPos=Array.from({length:21},()=>new THREE.Vector3());
  hasHand=false;
}

function lmToVec3(lm) { return new THREE.Vector3((lm.x-0.5)*2.0,-(lm.y-0.5)*2.0,-lm.z*2.5); }
function remapHand(v,lo,hi) { return Math.max(0,Math.min(1,(v-lo)/(hi-lo))); }

function setHandTargets(landmarks) {
  landmarks.forEach((lm,i)=>handTargetPos[i].copy(lmToVec3(lm)));
  hasHand=true;
  handJoints.forEach(m=>m.visible=true);
  handBones.forEach(m=>m.visible=true);
  const tip=landmarks[8];
  fingerRawX=remapHand(tip.x,CFG.HAND_X0,CFG.HAND_X1);
  fingerRawY=remapHand(tip.y,CFG.HAND_Y0,CFG.HAND_Y1);
  processGesture(landmarks);
}

function clearHand() {
  hasHand=false;
  handJoints.forEach(m=>m.visible=false);
  handBones.forEach(m=>m.visible=false);
  fingerRawX=null; fingerRawY=null;
}

function stepHandLerp(dt) {
  if (!hasHand) return;
  const alpha=1-Math.pow(0.55,dt*60);
  handJoints.forEach((m,i)=>m.position.lerp(handTargetPos[i],alpha));
  HCONN.forEach(([a,b],i)=>{
    const pa=handJoints[a].position, pb=handJoints[b].position;
    _hmid.addVectors(pa,pb).multiplyScalar(0.5);
    const len=pa.distanceTo(pb);
    handBones[i].position.copy(_hmid);
    _hdir.subVectors(pb,pa).normalize();
    _hq.setFromUnitVectors(_hup,_hdir);
    handBones[i].setRotationFromQuaternion(_hq);
    handBones[i].scale.set(1,len,1);
  });
}

// ================================================================
// WEBSOCKET
// ================================================================
const wsStatusEl=document.getElementById('ws-status');
const noHandEl  =document.getElementById('no-hand-hint');
let ws;

function connectWS() {
  ws=new WebSocket('ws://localhost:8765');
  ws.onopen=()=>{ wsStatusEl.textContent='\u25cf Connected'; wsStatusEl.classList.add('connected'); };
  ws.onmessage=(e)=>{
    const data=JSON.parse(e.data);
    if (data.landmarks) { setHandTargets(data.landmarks); noHandEl.style.display='none'; }
    else               { clearHand(); noHandEl.style.display='block'; }
  };
  ws.onclose=()=>{
    wsStatusEl.textContent='\u25cb Disconnected'; wsStatusEl.classList.remove('connected');
    clearHand(); noHandEl.style.display='block';
    setTimeout(connectWS,1500);
  };
  ws.onerror=()=>ws.close();
}

// ================================================================
// MAIN LOOP
// ================================================================
let lastTime=performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt=Math.min((now-lastTime)/1000,0.05);
  lastTime=now;
  update(dt);
  draw();
  stepHandLerp(dt);
  handRenderer.render(handScene,handCamera);
}

// ================================================================
// BOOT
// ================================================================
initHandViewer();
connectWS();
initGame();
requestAnimationFrame(loop);