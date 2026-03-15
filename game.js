'use strict';

// ================================================================
// CONFIG
// ================================================================
const CFG = {
  // Player base stats
  BASE_HP:                200,
  BASE_SPEED:             400,          // px/sec — faster than before
  BASE_ATK_SPEED:         0.80,
  BASE_DAMAGE:            10,
  BASE_CRIT_CHANCE:       0.05,
  BASE_CRIT_MULT:         1.50,
  BASE_BULLET_SPEED:      1.0,

  // Enemy scaling
  ENEMY_BASE_HP:          30,
  ENEMY_HP_SCALE:         1.28,
  ENEMY_BASE_DMG:         15,
  ENEMY_DMG_SCALE:        1.18,
  ENEMY_SHOOT_BASE:       2.5,
  ENEMY_SHOOT_MIN:        0.65,
  ENEMY_SHOOT_DEC:        0.18,

  // Wave
  WAVE_TIMER:             60,
  WAVE_PENALTY:           0.05,

  // Formation
  ENEMY_ZONE_TOP:         0.07,
  ENEMY_ZONE_BTM:         0.46,
  FORMATION_SPEED:        72,           // faster
  FORMATION_DIP:          18,

  // Bullets
  PLAYER_BULLET_BASE_SPD: 820,          // faster
  ENEMY_BULLET_SPD:       360,          // faster

  // Ship
  SHIP_LERP_60:           0.40,
  SHIP_ZONE_TOP:          0.50,
  SHIP_SIZE:              22,

  // Health orbs
  ORB_DROP_CHANCE:        0.25,
  ORB_HEAL_MIN:           15,
  ORB_HEAL_MAX:           30,
  ORB_FALL_SPEED:         110,          // full-viewport px/sec

  // Hand remapping — maps camera sub-range to full game range.
  // Tweak these to match your comfortable arm movement.
  HAND_X0: 0.18,   HAND_X1: 0.82,     // camera X [0.18, 0.82] → game [0, 1]
  HAND_Y0: 0.18,   HAND_Y1: 0.88,     // camera Y [0.18, 0.88] → game [0, 1]

  // ---- Phase 4: Gesture thresholds ----
  GESTURE_HOLD_FRAMES:  95,    // hold finger gesture ~3.17s to select card
  THUMB_HOLD_FRAMES:    95,    // hold thumb gesture ~3.17s to confirm/cancel (increased)
  FIST_HOLD_FRAMES:     95,    // hold fist ~3.17s to click in menu
  GESTURE_COOLDOWN_MS:  1400,  // ms between any two confirmed gesture actions
  FINGER_MARGIN:        0.06,  // tip must be this far above PIP to count as extended

  // Thumb thresholds — use CMC (LM1) as base, not MCP (LM2).
  // CMC is deeper in the palm → more vertical travel → easier to hit reliably.
  // diff = lms[1].y - lms[4].y  (positive = tip above CMC = thumbs UP in camera space)
  THUMB_MARGIN_UP:      0.07,  // was 0.12 — thumb tip ~7% above CMC registers as up
  THUMB_MARGIN_DOWN:    0.06,  // thumb tip ~6% below CMC registers as down

  // How many fingers must be "not extended" before thumb direction means anything.
  // Loose check: tip.y > MCP.y - 0.04 (tip not more than 4% above MCP).
  THUMB_PRECOND_FINGERS: 3,    // at least 3 of 4 non-thumb fingers must be not raised
};

// ================================================================
// WEAPON DEFINITIONS
// ================================================================
const WEAPONS = [
  {
    id: 'heavy',  name: 'Iron Cannon',
    icon: '\u25CE', color: '#e8a020',
    desc: 'Single massive shell.\nDevastating but slow fire rate.',
    dmgMult: 1.60, atkMult: 0.70,
    hint: 'High single-hit damage',
  },
  {
    id: 'spread', name: 'Tri-Barrel',
    icon: '\u2756', color: '#40c8e8',
    desc: 'Three shots in a spread cone.\nCovers wide area, less damage each.',
    dmgMult: 0.65, atkMult: 1.00,
    hint: 'Wide area coverage',
  },
  {
    id: 'burst',  name: 'Double Repeater',
    icon: '\u25C8', color: '#80d040',
    desc: 'Fires two rounds in quick\nsuccession. Reliable sustained DPS.',
    dmgMult: 0.90, atkMult: 1.00,
    hint: 'Consistent double-tap',
  },
  {
    id: 'aether', name: 'Aether Seeker',
    icon: '\u2726', color: '#7cc0ff',
    desc: 'Homing rounds chase targets.\nLow damage per shot.',
    dmgMult: 0.40, atkMult: 1.00,
    hint: 'Auto-tracking rounds',
    unlockScore: 500,
  },
  {
    id: 'ricochet', name: 'Ricochet Chamber',
    icon: '\u21BB', color: '#e0b060',
    desc: 'Wild angles and bounces.\nUnpredictable but deadly.',
    dmgMult: 0.85, atkMult: 0.90,
    hint: 'Bouncing rounds',
    unlockScore: 2000,
  },
  {
    id: 'tesla', name: 'Tesla Lance',
    icon: '\u26A1', color: '#60e8ff',
    desc: 'Instant beam strike.\nSlow cycle, massive burst.',
    dmgMult: 3.80, atkMult: 0.22,
    hint: 'Line-damage beam',
    unlockScore: 5000,
  },
];

function isWeaponLocked(wep) {
  if (debugUnlockAllWeapons) return false;
  return typeof wep.unlockScore === 'number' && wep.unlockScore > 0;
}

// ================================================================
// UPGRADE POOL
// ================================================================
const UPGRADE_POOL = [
  { icon:'\u2699', name:'Steam Turbine',     desc:'Upgrade thruster output',          stat:'moveSpeed',   val:0.10, fmt:v=>`+${Math.round(v*100)}% move speed`    },
  { icon:'\u2699', name:'Gyro Stabiliser',   desc:'Enhanced directional control',     stat:'moveSpeed',   val:0.16, fmt:v=>`+${Math.round(v*100)}% move speed`    },
  { icon:'\u2665', name:'Boiler Plating',    desc:'Reinforce hull with iron plating', stat:'maxHp',       val:30,   fmt:v=>`+${v} max hull`                       },
  { icon:'\u2665', name:'Riveted Armour',    desc:'Extra layers of forged steel',     stat:'maxHp',       val:50,   fmt:v=>`+${v} max hull`                       },
  { icon:'+',      name:'Emergency Steam',   desc:'Repair critical hull damage',      stat:'heal',        val:0.15, fmt:v=>`+${Math.round(v*100)}% hull restored`  },
  { icon:'\u25CE', name:'Rapid Valves',      desc:'Faster firing cycle',              stat:'atkSpeed',    val:0.12, fmt:v=>`+${v.toFixed(2)} shots/s`             },
  { icon:'\u25CE', name:'Pressure Chamber',  desc:'High-pressure shot cycle',         stat:'atkSpeed',    val:0.20, fmt:v=>`+${v.toFixed(2)} shots/s`             },
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
let debugUnlockAllWeapons = false;

// Hand tracking — set by WebSocket from index fingertip (landmark 8)
let fingerRawX = null;   // remapped [0,1]
let fingerRawY = null;   // remapped [0,1]

// ================================================================
// CANVAS — full viewport, resized dynamically
// ================================================================
const gc  = document.getElementById('gc');
const ctx = gc.getContext('2d');

let GW = 0, GH = 0;       // current game dimensions
let parallaxLayers = [];   // populated by initParallax() — declared here to avoid TDZ error

function resizeCanvas() {
  GW = gc.width  = window.innerWidth;
  GH = gc.height = window.innerHeight;
  gc.style.width  = GW + 'px';
  gc.style.height = GH + 'px';
  initParallax();   // regenerate parallax for new dimensions
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
    hp: CFG.BASE_HP, maxHp: CFG.BASE_HP,
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
// PARALLAX BACKGROUND
// Three layers scroll at different speeds for depth.
// Items are placed in a 2×GH tile so we can wrap seamlessly.
// ================================================================

function gearPath(ctx2, cx, cy, outerR, angle, teeth) {
  const innerR = outerR * 0.70;
  ctx2.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a   = (i / (teeth * 2)) * Math.PI * 2 + angle;
    const rad = (i % 2 === 0) ? outerR : innerR;
    const px  = cx + rad * Math.cos(a);
    const py  = cy + rad * Math.sin(a);
    (i === 0) ? ctx2.moveTo(px, py) : ctx2.lineTo(px, py);
  }
  ctx2.closePath();
}

function initParallax() {
  const tH = GH * 2.2;  // seamless tile height (slightly more than 2×)

  function genGears(count, rMin, rMax, tMin, tMax) {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        type:     'gear',
        x:        60 + Math.random() * (GW - 120),
        y:        (i / count) * tH + Math.random() * (tH / count * 0.8),
        r:        rMin + Math.random() * (rMax - rMin),
        teeth:    Math.floor(tMin + Math.random() * (tMax - tMin)),
        angle:    Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.009),
      });
    }
    return items;
  }

  function genPipes(count) {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        type: 'pipe',
        x:    20 + Math.random() * (GW - 40),
        y:    (i / count) * tH + Math.random() * (tH / count),
        w:    10 + Math.random() * 20,
        h:    80 + Math.random() * 140,
      });
    }
    return items;
  }

  function genEmbers(count) {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        type:    'ember',
        x:       Math.random() * GW,
        y:       Math.random() * tH,
        r:       1.5 + Math.random() * 3,
        flicker: Math.random() * Math.PI * 2,
      });
    }
    return items;
  }

  parallaxLayers = [
    // Layer 0 — far: large gear silhouettes at the edges
    { speed: 18,  alpha: 0.040, offset: 0,                tileH: tH, items: genGears(5, 55, 90, 10, 14) },
    // Layer 1 — mid: medium gears + pipes
    { speed: 42,  alpha: 0.060, offset: Math.random()*GH, tileH: tH, items: [...genGears(8, 24, 46, 7, 10), ...genPipes(7)] },
    // Layer 2 — near: ember particles
    { speed: 85,  alpha: 0.050, offset: Math.random()*GH, tileH: tH, items: genEmbers(35) },
  ];
}

function updateParallax(dt) {
  for (const layer of parallaxLayers) {
    layer.offset = (layer.offset + layer.speed * dt) % layer.tileH;
    for (const item of layer.items) {
      if (item.type === 'gear') item.angle += item.rotSpeed;
    }
  }
}

function drawParallaxItem(item, x, y) {
  if (y > GH + 200 || y < -200) return;
  if (item.type === 'gear') {
    gearPath(ctx, x, y, item.r, item.angle, item.teeth);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, item.r * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  } else if (item.type === 'pipe') {
    ctx.fillRect(Math.round(x - item.w / 2), Math.round(y), Math.round(item.w), Math.round(item.h));
  } else if (item.type === 'ember') {
    item.flicker += 0.04;
    const ea = 0.35 + Math.sin(item.flicker) * 0.25;
    const eg = Math.round(60 + Math.sin(item.flicker * 1.3) * 35);
    ctx.fillStyle = `rgba(255,${eg},15,${ea})`;
    const er = Math.round(item.r);
    ctx.fillRect(Math.round(x - er), Math.round(y - er), er * 2, er * 2);
  }
}

function drawParallax() {
  for (const layer of parallaxLayers) {
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    ctx.strokeStyle = '#c8860a';
    ctx.fillStyle   = '#2a1a0a';
    ctx.lineWidth   = 1.5;
    for (const item of layer.items) {
      // draw at current position and one tile earlier (seamless wrap)
      const y = (item.y + layer.offset) % layer.tileH - GH;
      drawParallaxItem(item, item.x, y);
      drawParallaxItem(item, item.x, y + layer.tileH);
    }
    ctx.restore();
  }
}

// ================================================================
// INIT
// ================================================================
function initGame() {
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
  const weapons = [...WEAPONS].sort((a, b) => {
    const al = isWeaponLocked(a) ? 1 : 0;
    const bl = isWeaponLocked(b) ? 1 : 0;
    if (al !== bl) return al - bl;
    return (a.unlockScore || 0) - (b.unlockScore || 0);
  });
  for (const wep of weapons) {
    const locked = isWeaponLocked(wep);
    const card = document.createElement('div');
    card.className = 'upgrade-card weapon-card';
    if (locked) card.classList.add('locked');
    card.style.borderTopColor = wep.color;
    card.innerHTML =
      `<span class="card-icon" style="color:${wep.color}">${wep.icon}</span>` +
      `<div class="card-name" style="color:${wep.color}">${wep.name}</div>` +
      `<div class="card-desc">${wep.desc.replace('\n', '<br>')}</div>` +
      `<div class="card-stat" style="color:${wep.color}">DMG \u00D7${wep.dmgMult.toFixed(2)}&nbsp;&nbsp;SPD \u00D7${wep.atkMult.toFixed(2)}</div>` +
      `<div class="card-stat2">${wep.hint}</div>`;
    if (!locked) {
      card.addEventListener('click', () => applyWeapon(wep));
    } else {
      const badge = document.createElement('div');
      badge.className = 'lock-badge';
      badge.textContent = 'LOCKED';
      const scoreReq = document.createElement('div');
      scoreReq.className = 'lock-score';
      scoreReq.textContent = `UNLOCK AT ${wep.unlockScore} SCORE`;
      card.appendChild(badge);
      card.appendChild(scoreReq);
    }
    container.appendChild(card);
  }
  showOverlay('weapon-overlay');
}


function refreshWeaponCardsUnlockedState() {
  const cards = document.querySelectorAll('#weapon-cards .weapon-card');
  if (!cards.length) return;

  const weapons = [...WEAPONS].sort((a, b) => {
    const al = isWeaponLocked(a) ? 1 : 0;
    const bl = isWeaponLocked(b) ? 1 : 0;
    if (al !== bl) return al - bl;
    return (a.unlockScore || 0) - (b.unlockScore || 0);
  });

  cards.forEach((card, idx) => {
    const wep = weapons[idx];
    if (!wep) return;
    if (isWeaponLocked(wep)) return;

    card.classList.remove('locked');
    card.querySelector('.lock-badge')?.remove();
    card.querySelector('.lock-score')?.remove();

    if (!card.dataset.unlockBound) {
      card.addEventListener('click', () => applyWeapon(wep));
      card.dataset.unlockBound = '1';
    }
  });
}

function applyWeapon(wep) {
  player.weapon   = wep.id;
  player.atkSpeed = CFG.BASE_ATK_SPEED * wep.atkMult;
  shootTimer      = 1 / player.atkSpeed;
  hideOverlay('weapon-overlay');
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

function isLetterKey(e, letter) {
  const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  const code = typeof e.code === 'string' ? e.code : '';
  return key === letter || code === `Key${letter.toUpperCase()}`;
}

function unlockAllWeapons() {
  debugUnlockAllWeapons = true;
  if (gameState === 'weapon-select') {
    showWeaponSelect();
  }
  refreshWeaponCardsUnlockedState();
}

window.addEventListener('keydown', e => {
  keys.add(e.key);

  if (isLetterKey(e, 'p')) {
    togglePause();
    return;
  }

  if (isLetterKey(e, 'u')) {
    unlockAllWeapons();
    return;
  }

  if (isLetterKey(e, 'r')) {
    initGame();
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

function fireBullet(x, y, angle, dmgMult) {
  const spd = CFG.PLAYER_BULLET_BASE_SPD * player.bulletSpeed;
  const dmg = calcDamage(dmgMult);
  bullets.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, dmg, crit: _lastCrit });
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
  } else {
    fireBullet(bx, by, -Math.PI / 2, mult);
    player.burstTimer = 0.13;
  }
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
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, r: Math.random() * 3.5 + 1, life: 1.0, decay: Math.random() * 1.4 + 0.6, color });
  }
}

function spawnDmgNumber(x, y, dmg, crit) {
  particles.push({ isDmgText: true, x, y, vy: -60, text: crit ? `\u2605${dmg}` : `${dmg}`, color: crit ? '#ffcc00' : '#e8a020', size: crit ? 17 : 13, life: 1.2, decay: 0.75 });
}

function spawnOrb(x, y) {
  orbs.push({ x, y, vy: CFG.ORB_FALL_SPEED, r: 10, healAmt: Math.round(CFG.ORB_HEAL_MIN + Math.random() * (CFG.ORB_HEAL_MAX - CFG.ORB_HEAL_MIN)), bob: Math.random() * Math.PI * 2 });
}

// ================================================================
// UPDATE
// ================================================================
function update(dt) {
  if (gameState !== 'playing') return;

  if (player.invulTimer > 0) player.invulTimer -= dt;
  if (screenFlash > 0)       screenFlash = Math.max(0, screenFlash - dt * 3.5);

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

  // Bullets
  for (const b of bullets)  { b.x += b.vx * dt;  b.y += b.vy * dt; }
  for (const b of eBullets) { b.x += b.vx * dt;  b.y += b.vy * dt; }
  for (let i = bullets.length  - 1; i >= 0; i--) { if (bullets[i].y  < -30 || bullets[i].x < -30 || bullets[i].x > GW + 30)  bullets.splice(i, 1); }
  for (let i = eBullets.length - 1; i >= 0; i--) { const b = eBullets[i]; if (b.x < -30 || b.x > GW + 30 || b.y < -30 || b.y > GH + 30) eBullets.splice(i, 1); }

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
    // Remapped index fingertip maps to full game X and lower-half Y
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
    const b = bullets[bi];
    let hit = false;
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e  = enemies[ei];
      const ex = e.baseX + groupX;
      const dx = b.x - ex, dy = b.y - e.y;
      if (dx * dx + dy * dy < (e.r + 4) ** 2) {
        e.hp   -= b.dmg;
        e.flash = 1.0;
        spawnDmgNumber(ex + (Math.random() - 0.5) * 18, e.y - e.r - 6, b.dmg, b.crit);
        hit = true;
        if (e.hp <= 0) {
          spawnParticles(ex, e.y, '#c8860a', 12);
          spawnParticles(ex, e.y, '#e04010',  5);
          if (Math.random() < CFG.ORB_DROP_CHANCE) spawnOrb(ex, e.y);
          enemies.splice(ei, 1);
          score += 10 * wave;
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
    if (dx * dx + dy * dy < (player.size + o.r) ** 2) {
      player.hp = Math.min(player.maxHp, player.hp + o.healAmt);
      updateStatsPanel();
      particles.push({ isDmgText: true, x: o.x, y: o.y, vy: -55, text: `+${o.healAmt}`, color: '#60ff80', size: 15, life: 1.4, decay: 0.55 });
      orbs.splice(i, 1);
    }
  }
}

function damagePlayer(amount, isTimerPenalty) {
  player.hp = Math.max(0, player.hp - amount);
  player.invulTimer = 1.0;   // 1 second invulnerability
  screenFlash = 1.0;
  spawnParticles(player.x, player.y, '#ff3030', 7);
  if (isTimerPenalty) {
    particles.push({ isDmgText: true, x: GW / 2, y: GH * 0.12, vy: -30, text: `HULL BREACH \u2212${amount}`, color: '#e05050', size: 14, life: 2.0, decay: 0.38 });
  }
  updateStatsPanel();
  if (player.hp <= 0) {
    gameState = 'gameover';
    document.getElementById('go-score').textContent = 'SCORE: ' + String(score).padStart(5, '0');
    document.getElementById('go-wave').textContent  = 'REACHED WAVE ' + wave;
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
    case 'maxHp':       player.maxHp += up.val; player.hp += up.val; break;
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

// Pixel-style rounded rect
function fillRRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawBackground() {
  ctx.imageSmoothingEnabled = false;

  // Sky gradient (dark iron at top, slightly warmer at bottom)
  const grad = ctx.createLinearGradient(0, 0, 0, GH);
  grad.addColorStop(0,   '#080508');
  grad.addColorStop(0.5, '#0d0908');
  grad.addColorStop(1,   '#120a06');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GW, GH);

  // Three parallax layers (already updated in update())
  drawParallax();

  // Thin dashed zone separator
  ctx.save();
  ctx.strokeStyle = 'rgba(200,134,10,0.07)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([6, 14]);
  ctx.beginPath();
  ctx.moveTo(0, GH * CFG.ENEMY_ZONE_BTM);
  ctx.lineTo(GW, GH * CFG.ENEMY_ZONE_BTM);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ---- Enemy: rotating gear with furnace glow — pixel-art style ----
function drawGearEnemy(x, y, r, angle, flash, hp, maxHp) {
  const ix = Math.round(x), iy = Math.round(y);
  const teeth = 8, outerR = r, innerR = r * 0.68;

  ctx.save();
  ctx.translate(ix, iy);
  ctx.rotate(angle);

  // Gear body (blocky, no smooth curves)
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a   = (i / (teeth * 2)) * Math.PI * 2;
    const rad = (i % 2 === 0) ? outerR : innerR;
    const px  = Math.round(rad * Math.cos(a));
    const py  = Math.round(rad * Math.sin(a));
    (i === 0) ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();

  if (flash > 0) {
    ctx.fillStyle   = `rgba(255,255,255,${flash * 0.9})`;
    ctx.strokeStyle = '#ffffff';
  } else {
    ctx.fillStyle   = '#5a3010';
    ctx.strokeStyle = '#c8860a';
  }
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // Furnace glow (radial, pixel art warmth)
  if (flash <= 0) {
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.45);
    grd.addColorStop(0,   '#ff6500');
    grd.addColorStop(0.5, '#c03800');
    grd.addColorStop(1,   'rgba(160,40,0,0)');
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }

  // Center bolt (2×2 pixel)
  ctx.fillStyle = '#1a0e04';
  ctx.fillRect(-Math.round(r * 0.16), -Math.round(r * 0.16), Math.round(r * 0.32), Math.round(r * 0.32));

  ctx.restore();

  // HP bar
  if (hp < maxHp) {
    const bw = r * 2.4, bx = ix - bw / 2, by = iy - r - 9;
    ctx.fillStyle = '#1a0e04';
    ctx.fillRect(Math.round(bx), Math.round(by), Math.round(bw), 4);
    ctx.fillStyle = hp / maxHp > 0.5 ? '#c8860a' : '#c04020';
    ctx.fillRect(Math.round(bx), Math.round(by), Math.round(bw * (hp / maxHp)), 4);
    ctx.strokeStyle = '#3a1a04';
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(Math.round(bx), Math.round(by), Math.round(bw), 4);
  }
}

// ---- Player: pixel-art steampunk airship ----
function drawAirship(x, y, sz, invul) {
  // Flicker on invulnerability (every 75ms)
  if (invul && Math.floor(Date.now() / 75) % 2 === 0) return;
  const ix = Math.round(x), iy = Math.round(y);

  ctx.save();
  ctx.translate(ix, iy);

  // Wings — solid pixel triangles
  ctx.fillStyle   = '#4a2808';
  ctx.strokeStyle = '#c8860a';
  ctx.lineWidth   = 1.5;

  ctx.beginPath();
  ctx.moveTo(-Math.round(sz * 0.30), Math.round(sz * 0.08));
  ctx.lineTo(-Math.round(sz * 0.90), Math.round(sz * 0.62));
  ctx.lineTo(-Math.round(sz * 0.14), Math.round(sz * 0.42));
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(Math.round(sz * 0.30),  Math.round(sz * 0.08));
  ctx.lineTo(Math.round(sz * 0.90),  Math.round(sz * 0.62));
  ctx.lineTo(Math.round(sz * 0.14),  Math.round(sz * 0.42));
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Hull — pixel ellipse approximated with fillRect blocks
  ctx.fillStyle = '#6b3c0a';
  ctx.beginPath();
  ctx.ellipse(0, -Math.round(sz * 0.08), Math.round(sz * 0.40), Math.round(sz * 0.88), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c8860a';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Cockpit window
  ctx.fillStyle = '#1c3a60';
  ctx.beginPath();
  ctx.ellipse(0, -Math.round(sz * 0.28), Math.round(sz * 0.17), Math.round(sz * 0.13), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5090b0';
  ctx.lineWidth   = 1;
  ctx.stroke();
  // Window highlight (2px pixel block)
  ctx.fillStyle = '#80c0e0';
  ctx.fillRect(-Math.round(sz * 0.10), -Math.round(sz * 0.34), Math.round(sz * 0.06), Math.round(sz * 0.04));

  // Rivets (2×2 pixel blocks)
  ctx.fillStyle = '#e8a020';
  for (const sx of [-1, 1]) {
    ctx.fillRect(Math.round(sx * sz * 0.28) - 2, Math.round(sz * 0.17) - 2, 4, 4);
    ctx.fillRect(Math.round(sx * sz * 0.22) - 2, Math.round(sz * 0.05) - 2, 4, 4);
  }

  // Exhaust pipes + animated smoke
  const t = Date.now() / 280;
  for (const sx of [-1, 1]) {
    const px = Math.round(sx * sz * 0.20);
    const py0 = Math.round(sz * 0.40);
    const ph  = Math.round(sz * 0.28);
    ctx.fillStyle   = '#1e1006';
    ctx.strokeStyle = '#c8860a';
    ctx.lineWidth   = 1;
    ctx.fillRect(px - 3, py0, 6, ph);
    ctx.strokeRect(px - 3, py0, 6, ph);
    // Smoke puff (round, animated)
    const pySmoke = py0 + ph + Math.round(Math.sin(t + sx) * 2.5);
    ctx.beginPath();
    ctx.arc(px, pySmoke, 5 + Math.sin(t * 1.4 + sx) * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(160,140,95,${0.20 + Math.sin(t * 1.4 + sx) * 0.06})`;
    ctx.fill();
  }

  // Nose spike (3-pixel column)
  ctx.fillStyle = '#e8a020';
  ctx.fillRect(-2, -Math.round(sz * 1.04), 4, Math.round(sz * 0.16));

  ctx.restore();
}

// HP bar below the player ship
function drawPlayerHPBar() {
  const bw  = player.size * 2 + 8;
  const bx  = Math.round(player.x - bw / 2);
  const by  = Math.round(player.y + player.size + 4);
  const pct = player.hp / player.maxHp;

  ctx.fillStyle = '#1a0e04';
  ctx.fillRect(bx, by, Math.round(bw), 4);

  ctx.fillStyle = pct > 0.55 ? '#408020' : pct > 0.28 ? '#c8800a' : '#c02010';
  ctx.fillRect(bx, by, Math.round(bw * pct), 4);

  ctx.strokeStyle = '#3a1a04';
  ctx.lineWidth   = 0.5;
  ctx.strokeRect(bx, by, Math.round(bw), 4);
}

// Fingertip cursor — brass crosshair dot
function drawFingertipCursor() {
  if (fingerRawX === null) return;

  // Map to same coordinates the ship targets
  const cx = Math.round(fingerRawX * GW);
  const cy = Math.round(GH * CFG.SHIP_ZONE_TOP + fingerRawY * GH * (1 - CFG.SHIP_ZONE_TOP));

  const t = Date.now() / 500;
  const pulse = 7 + Math.sin(t) * 2;  // pulsing outer ring radius

  ctx.save();
  ctx.globalAlpha = 0.90;

  // Outer pulsing ring
  ctx.strokeStyle = '#e8a020';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
  ctx.stroke();

  // Inner solid dot (4×4 pixel block)
  ctx.fillStyle = '#ffcc40';
  ctx.fillRect(cx - 3, cy - 3, 6, 6);

  // Cross hair lines
  ctx.strokeStyle = '#e8a020';
  ctx.lineWidth   = 1.5;
  const gap = pulse + 3, len = 8;
  ctx.beginPath();
  ctx.moveTo(cx - gap - len, cy);  ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap,       cy);  ctx.lineTo(cx + gap + len, cy);
  ctx.moveTo(cx, cy - gap - len);  ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap);        ctx.lineTo(cx, cy + gap + len);
  ctx.stroke();

  ctx.restore();
}

// Player bullet — brass capsule (pixel style)
function drawPlayerBullet(b) {
  const px = Math.round(b.x), py = Math.round(b.y);
  ctx.fillStyle = '#e8a020';
  ctx.fillRect(px - 2, py - 14, 4, 12);
  ctx.fillStyle = 'rgba(255,240,150,0.65)';
  ctx.fillRect(px - 2, py - 16, 4, 3);
}

// Enemy bullet — glowing coal
function drawEnemyBullet(b) {
  const px = Math.round(b.x), py = Math.round(b.y);
  ctx.fillStyle = '#ff6020';
  ctx.fillRect(px - 4, py - 4, 8, 8);
  ctx.fillStyle = 'rgba(255,140,30,0.40)';
  ctx.fillRect(px - 7, py - 7, 14, 14);
}

// Health orb — glowing pixel gem with cross
function drawOrb(o) {
  const px = Math.round(o.x);
  const py = Math.round(o.y + Math.sin(o.bob) * 3);

  // Outer glow
  ctx.fillStyle = `rgba(64,255,128,${0.18 + Math.sin(o.bob * 1.5) * 0.06})`;
  ctx.fillRect(px - 14, py - 14, 28, 28);

  // Body
  ctx.fillStyle = '#1a5024';
  ctx.fillRect(px - 9, py - 9, 18, 18);
  ctx.fillStyle = '#38c058';
  ctx.fillRect(px - 7, py - 7, 14, 14);
  ctx.fillStyle = '#70e890';
  ctx.fillRect(px - 5, py - 5, 10, 10);

  // Highlight
  ctx.fillStyle = '#b0ffc8';
  ctx.fillRect(px - 5, py - 5, 4, 4);

  // Pixel cross
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px - 2, py - 7, 4, 14);
  ctx.fillRect(px - 7, py - 2, 14,  4);
}

function draw() {
  ctx.imageSmoothingEnabled = false;

  drawBackground();

  // Screen flash on hit
  if (screenFlash > 0) {
    ctx.fillStyle = `rgba(200,40,20,${screenFlash * 0.28})`;
    ctx.fillRect(0, 0, GW, GH);
  }

  // Player bullets
  for (const b of bullets)  drawPlayerBullet(b);
  // Enemy bullets
  for (const b of eBullets) drawEnemyBullet(b);
  // Orbs
  for (const o of orbs)     drawOrb(o);

  // Enemies
  for (const e of enemies) drawGearEnemy(e.baseX + groupX, e.y, e.r, e.angle, e.flash, e.hp, e.maxHp);

  // Player
  drawAirship(player.x, player.y, player.size, player.invulTimer > 0);
  drawPlayerHPBar();

  // Fingertip cursor (drawn on top of everything)
  drawFingertipCursor();

  // Particles + damage numbers
  ctx.save();
  for (const p of particles) {
    const a = Math.max(0, p.life);
    if (p.isDmgText) {
      ctx.globalAlpha = a;
      ctx.fillStyle   = p.color;
      ctx.font        = `${p.size}px "Share Tech Mono", "Courier New", monospace`;
      ctx.textAlign   = 'center';
      ctx.fillText(p.text, Math.round(p.x), Math.round(p.y));
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle   = p.color;
      ctx.fillRect(Math.round(p.x - p.r), Math.round(p.y - p.r), Math.round(p.r * 2), Math.round(p.r * 2));
    }
  }
  ctx.textAlign   = 'left';
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ================================================================
// HUD UPDATES
// ================================================================
function updateTopBar() {
  document.getElementById('wave-num').textContent  = wave;
  document.getElementById('score-num').textContent = String(score).padStart(5, '0');
  const frac   = Math.max(0, waveTimer / CFG.WAVE_TIMER);
  const timerN = document.getElementById('timer-num');
  const timerF = document.getElementById('timer-fill');
  timerN.textContent = Math.ceil(Math.max(0, waveTimer));
  timerN.className   = frac < 0.25 ? 'warning' : '';
  timerF.style.width = (frac * 100).toFixed(1) + '%';
  timerF.className   = frac < 0.25 ? 'warning' : '';
}

function updateStatsPanel() {
  const hpPct = player.hp / player.maxHp;
  const fill  = document.getElementById('hp-fill');
  fill.style.width = (hpPct * 100).toFixed(1) + '%';
  fill.className   = 'bar hp' + (hpPct < 0.30 ? ' critical' : '');
  document.getElementById('val-hp').textContent    = `${Math.round(player.hp)}/${player.maxHp}`;
  document.getElementById('val-spd').textContent   = `${Math.round(player.moveSpeed * 100)}%`;
  document.getElementById('val-atk').textContent   = `${player.atkSpeed.toFixed(2)}/s`;
  document.getElementById('val-dmg').textContent   = `${player.damage}`;
  document.getElementById('val-crit').textContent  = `${Math.round(player.critChance * 100)}%`;
  document.getElementById('val-cdmg').textContent  = `${Math.round(player.critMult * 100)}%`;
  document.getElementById('val-bspd').textContent  = `${Math.round(player.bulletSpeed * 100)}%`;
  const wep = WEAPONS.find(w => w.id === player.weapon);
  document.getElementById('val-weapon').textContent = wep ? wep.name : '\u2014';
  if (wep) document.getElementById('val-weapon').style.color = wep.color;
}

let _waveAnnounceTimer = null;
function announceWave(w) {
  const el = document.getElementById('wave-announce');
  document.getElementById('wa-num').textContent = w;
  el.classList.add('show');
  if (_waveAnnounceTimer) clearTimeout(_waveAnnounceTimer);
  _waveAnnounceTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function showOverlay(id) { document.getElementById(id).classList.add('visible');    }
function hideOverlay(id) { document.getElementById(id).classList.remove('visible'); }

// ================================================================
// THREE.JS HAND VIEWER — small panel, bottom-right
// ================================================================
let handRenderer, handScene, handCamera;
let handJoints, handBones, handTargetPos, hasHand;
const _hmid = new THREE.Vector3();
const _hdir = new THREE.Vector3();
const _hup  = new THREE.Vector3(0, 1, 0);
const _hq   = new THREE.Quaternion();
const HCONN = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17],
];
const HTIPS = new Set([4, 8, 12, 16, 20]);

function initHandViewer() {
  const wrap = document.getElementById('hand-canvas-wrap');
  const W = 214, H = 158;
  handRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  handRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  handRenderer.setSize(W, H);
  handRenderer.setClearColor(0x000000, 0);
  wrap.appendChild(handRenderer.domElement);
  handScene  = new THREE.Scene();
  handCamera = new THREE.PerspectiveCamera(50, W / H, 0.01, 100);
  handCamera.position.set(0, 0, 1.8);
  handScene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xffffff, 1.0);
  dl.position.set(1, 2, 3);
  handScene.add(dl);

  const JMAT = new THREE.MeshPhongMaterial({ color: 0xd4b070, transparent: true, opacity: 0.90 });
  const BMAT = new THREE.MeshPhongMaterial({ color: 0xc8860a, transparent: true, opacity: 0.90 });
  const TMAT = new THREE.MeshPhongMaterial({ color: 0xe8a020, transparent: true, opacity: 0.90 });

  handJoints = Array.from({ length: 21 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(HTIPS.has(i) ? 0.018 : 0.013, 10, 10), HTIPS.has(i) ? TMAT : JMAT);
    m.visible = false; handScene.add(m); return m;
  });
  handBones = HCONN.map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8), BMAT);
    m.visible = false; handScene.add(m); return m;
  });
  handTargetPos = Array.from({ length: 21 }, () => new THREE.Vector3());
  hasHand = false;
}

function lmToVec3(lm) {
  return new THREE.Vector3((lm.x - 0.5) * 2.0, -(lm.y - 0.5) * 2.0, -lm.z * 2.5);
}

// Apply remap: clamp camera sub-range to [0,1]
function remapHand(rawVal, lo, hi) {
  return Math.max(0, Math.min(1, (rawVal - lo) / (hi - lo)));
}

function setHandTargets(landmarks) {
  landmarks.forEach((lm, i) => handTargetPos[i].copy(lmToVec3(lm)));
  hasHand = true;
  handJoints.forEach(m => m.visible = true);
  handBones.forEach(m  => m.visible = true);

  // Use INDEX_FINGER_TIP (landmark 8) for ship/cursor control
  const tip = landmarks[8];
  fingerRawX = remapHand(tip.x, CFG.HAND_X0, CFG.HAND_X1);
  fingerRawY = remapHand(tip.y, CFG.HAND_Y0, CFG.HAND_Y1);

  // Feed all landmarks to the gesture engine every frame
  processGesture(landmarks);
}

// ================================================================
// PHASE 4 — GESTURE ENGINE
// ================================================================

// ---- Landmark indices reference ----
// Wrist:        0
// Thumb CMC:    1   ← deepest thumb joint, use as base for up/down
// Thumb MCP:    2
// Thumb IP:     3
// Thumb Tip:    4
// Index  MCP:5  PIP:6  DIP:7  Tip:8
// Middle MCP:9  PIP:10 DIP:11 Tip:12
// Ring   MCP:13 PIP:14 DIP:15 Tip:16
// Pinky  MCP:17 PIP:18 DIP:19 Tip:20
//
// Y-axis in MediaPipe: 0=top of frame, 1=bottom.
// "Above" in real space = SMALLER y value.

// Strict check: all 4 finger tips well below their PIP joints (tight fist).
// Used only for fist-click detection.
function _fingersCurledStrict(lms) {
  return lms[8].y  > lms[6].y  &&
         lms[12].y > lms[10].y &&
         lms[16].y > lms[14].y &&
         lms[20].y > lms[18].y;
}

// Loose check: finger tips not significantly above their MCP joints.
// Used as precondition for thumb detection — passes for a relaxed closed hand
// or a loosely curled fist (thumbs-up position).
function _fingersNotRaised(lms) {
  // tip.y > mcp.y - 0.04 means tip is not more than 4% above MCP
  const t = 0.04;
  let notRaised = 0;
  if (lms[8].y  > lms[5].y  - t) notRaised++;  // index
  if (lms[12].y > lms[9].y  - t) notRaised++;  // middle
  if (lms[16].y > lms[13].y - t) notRaised++;  // ring
  if (lms[20].y > lms[17].y - t) notRaised++;  // pinky
  // Require at least 3 of 4 fingers not raised
  return notRaised >= CFG.THUMB_PRECOND_FINGERS;
}

// Count extended fingers (index / middle / ring) using PIP joint gate.
// Sequential: middle counts only if index is up; ring only if middle is up.
function _countFingers(lms) {
  const m       = CFG.FINGER_MARGIN;
  const indexUp  = lms[8].y  < lms[6].y  - m;
  const middleUp = lms[12].y < lms[10].y - m;
  const ringUp   = lms[16].y < lms[14].y - m;
  if (indexUp && middleUp && ringUp)  return 3;
  if (indexUp && middleUp && !ringUp) return 2;
  if (indexUp && !middleUp)           return 1;
  return 0;
}

// Detect thumb direction using CMC (LM1) as base — deepest palm landmark,
// gives ~40% more vertical travel than MCP (LM2).
// diff = CMC.y - Tip.y:  positive → tip above CMC → thumbs UP
//                        negative → tip below CMC → thumbs DOWN
// Precondition: most fingers must not be raised (prevents open-hand false fires).
function _detectThumb(lms) {
  if (!_fingersNotRaised(lms)) return null;

  const diff = lms[1].y - lms[4].y;   // CMC.y − Tip.y

  // Extra guard: thumb must also be away from the palm laterally.
  // If the thumb tip is very close to index MCP in X, it's tucked and ambiguous.
  const thumbIndexXDiff = Math.abs(lms[4].x - lms[5].x);
  if (thumbIndexXDiff < 0.04) return null;  // thumb tucked alongside index, ignore

  if (diff >  CFG.THUMB_MARGIN_UP)   return 'up';
  if (diff < -CFG.THUMB_MARGIN_DOWN) return 'down';
  return null;
}

// Fist: strict finger curl AND thumb not making a clear "up" gesture.
function _isFist(lms) {
  return _fingersCurledStrict(lms) && (_detectThumb(lms) !== 'up');
}

// ---- Gesture state machine ----
const GS = {
  // Stage 1: finger-count card selection
  fingers:       0,    // current stable finger count
  holdFrames:    0,    // consecutive frames at current count
  coolUntil:     0,    // ms timestamp — no new selections before this
  pendingIdx:   -1,    // 0/1/2 = card index queued for confirmation

  // Stage 2: thumb confirmation
  confirming:    false,
  thumbDir:      null, // 'up'|'down'|null
  thumbFrames:   0,

  // Fist-click (menu cursor)
  fistFrames:    0,
  fistHovering:  null, // DOM element currently under cursor
};

// ---- Menu cursor (full-viewport pointer) ----
const _menuCursor = document.getElementById('menu-cursor');
let _menuCursorX = -999, _menuCursorY = -999;

function _updateMenuCursor(lms) {
  // Use the same remapped index fingertip range as the ship controls.
  const rx = (fingerRawX !== null) ? fingerRawX : remapHand(lms[8].x, CFG.HAND_X0, CFG.HAND_X1);
  const ry = (fingerRawY !== null) ? fingerRawY : remapHand(lms[8].y, CFG.HAND_Y0, CFG.HAND_Y1);
  _menuCursorX = rx * window.innerWidth;
  _menuCursorY = ry * window.innerHeight;
  _menuCursor.style.left = _menuCursorX + 'px';
  _menuCursor.style.top  = _menuCursorY + 'px';
}

function _showMenuCursor(show) {
  _menuCursor.classList.toggle('visible', show);
}

function _getCardUnderCursor() {
  // Temporarily hide the cursor so elementFromPoint isn't blocked by it
  _menuCursor.style.display = 'none';
  const el = document.elementFromPoint(_menuCursorX, _menuCursorY);
  _menuCursor.style.display = '';
  if (!el) return null;
  return el.closest('.upgrade-card');
}

// ---- Progress bar helpers ----
function _setGestureBar(progress, overlayPrefix) {
  const id = overlayPrefix === 'wg' ? 'wg-bar' : 'ug-bar';
  const bar = document.getElementById(id);
  if (!bar) return;
  const pct = Math.min(1, progress);
  bar.style.width = (pct * 100).toFixed(1) + '%';
  bar.classList.toggle('ready', pct >= 1);
}

function _clearGestureBar(overlayPrefix) {
  _setGestureBar(0, overlayPrefix);
}

function _setThumbBar(which, progress) {
  const id   = which === 'up' ? 'conf-yes-bar' : 'conf-no-bar';
  const optId = which === 'up' ? 'conf-yes'    : 'conf-no';
  const bar  = document.getElementById(id);
  const opt  = document.getElementById(optId);
  if (bar) bar.style.width = (Math.min(1, progress) * 100).toFixed(1) + '%';
  if (opt) opt.classList.toggle('thumb-active', progress > 0);
}

function _clearThumbBars() {
  _setThumbBar('up',   0);
  _setThumbBar('down', 0);
  document.getElementById('conf-yes')?.classList.remove('thumb-active');
  document.getElementById('conf-no')?.classList.remove('thumb-active');
}

// ---- Gesture tag highlight ----
function _highlightGestureTag(fingers, prefix) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`${prefix}-${i}`);
    if (el) el.classList.toggle('g-active', i === fingers);
  }
}

function _clearGestureTags() {
  ['wg-1','wg-2','wg-3','wg-fist','ug-1','ug-2','ug-3','ug-fist'].forEach(id => {
    document.getElementById(id)?.classList.remove('g-active');
  });
}

// ---- Card highlight ----
function _highlightCard(idx, state) {
  // state: 'none' | 'hover' | 'active' | 'fist'
  const overlayId = gameState === 'weapon-select' ? 'weapon-cards' : 'upgrade-cards';
  document.querySelectorAll(`#${overlayId} .upgrade-card`).forEach((c, i) => {
    c.classList.remove('g-hover', 'g-active', 'g-fist-hover');
    if (i === idx) {
      if (state === 'hover')  c.classList.add('g-hover');
      if (state === 'active') c.classList.add('g-active');
      if (state === 'fist')   c.classList.add('g-fist-hover');
    }
  });
}

function _clearCardHighlights() {
  document.querySelectorAll('.upgrade-card').forEach(c =>
    c.classList.remove('g-hover', 'g-active', 'g-fist-hover')
  );
}

// ---- Confirmation overlay ----
function _openConfirm(cardIdx) {
  const overlayId = gameState === 'weapon-select' ? 'weapon-cards' : 'upgrade-cards';
  const cards = document.querySelectorAll(`#${overlayId} .upgrade-card`);
  const name  = cards[cardIdx]?.querySelector('.card-name')?.textContent || '?';
  document.getElementById('confirm-card-name').textContent = name;
  _clearThumbBars();
  // Reset debug readout
  const dbg = document.getElementById('confirm-debug');
  if (dbg) dbg.textContent = 'waiting for thumb…';
  showOverlay('confirm-overlay');
}

function _confirmCard(idx) {
  hideOverlay('confirm-overlay');
  const overlayId = gameState === 'weapon-select' ? 'weapon-cards' : 'upgrade-cards';
  const cards = document.querySelectorAll(`#${overlayId} .upgrade-card`);
  if (cards[idx]) cards[idx].dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function _cancelConfirm() {
  hideOverlay('confirm-overlay');
  _clearCardHighlights();
  _clearGestureTags();
}

// ---- Main gesture dispatcher — called each time landmarks arrive ----
function processGesture(lms) {
  const inOverlay = gameState === 'weapon-select' || gameState === 'upgrading';
  const prefix    = gameState === 'weapon-select' ? 'wg' : 'ug';

  // Show/hide menu cursor only in overlay states
  _showMenuCursor(inOverlay);

  if (!inOverlay && !GS.confirming) {
    // Not in a menu — reset everything silently
    if (GS.holdFrames > 0 || GS.fistFrames > 0) {
      GS.holdFrames = 0; GS.fingers = 0;
      GS.fistFrames = 0; GS.fistHovering = null;
      _clearGestureBar(prefix);
      _clearGestureTags();
      _clearCardHighlights();
    }
    return;
  }

  // Update full-viewport cursor position whenever in overlay
  if (inOverlay) _updateMenuCursor(lms);

  const now = performance.now();

  // ================================================================
  // STAGE 2: Thumb confirmation (blocks stage 1)
  // ================================================================
  if (GS.confirming) {
    const thumb = _detectThumb(lms);

    // Live debug — shows raw diff and detected state so thresholds can be tuned
    const dbg = document.getElementById('confirm-debug');
    if (dbg) {
      const diff = (lms[1].y - lms[4].y).toFixed(3);
      const notRaised = _fingersNotRaised(lms);
      dbg.textContent = `diff=${diff}  fingers-ok=${notRaised}  state=${thumb ?? 'none'}`;
    }

    if (thumb !== GS.thumbDir) {
      GS.thumbDir    = thumb;
      GS.thumbFrames = thumb ? 1 : 0;
      _clearThumbBars();
    } else if (thumb) {
      GS.thumbFrames++;
      const progress = GS.thumbFrames / CFG.THUMB_HOLD_FRAMES;
      _setThumbBar(thumb, progress);

      if (GS.thumbFrames >= CFG.THUMB_HOLD_FRAMES) {
        if (now < GS.coolUntil) return; // still in cooldown
        GS.confirming  = false;
        GS.thumbFrames = 0;
        GS.thumbDir    = null;
        GS.coolUntil   = now + CFG.GESTURE_COOLDOWN_MS;
        _clearThumbBars();
        _clearCardHighlights();
        _clearGestureTags();
        if (thumb === 'up') {
          _confirmCard(GS.pendingIdx);
        } else {
          _cancelConfirm();
        }
      }
    }
    return; // don't process card gestures while confirming
  }

  // ================================================================
  // FIST-CLICK: hover with cursor, close fist to click
  // ================================================================
  const fist = _isFist(lms);
  if (fist && inOverlay) {
    GS.fistFrames++;
    const cardEl = _getCardUnderCursor();
    GS.fistHovering = cardEl;

    // Highlight card under cursor
    if (cardEl) {
      const overlayId = gameState === 'weapon-select' ? 'weapon-cards' : 'upgrade-cards';
      const cards     = [...document.querySelectorAll(`#${overlayId} .upgrade-card`)];
      const idx       = cards.indexOf(cardEl);
      _clearCardHighlights();
      _highlightCard(idx, 'fist');
      document.getElementById(`${prefix}-fist`)?.classList.add('g-active');
    }

    _menuCursor.classList.add('fist-loading');

    if (GS.fistFrames >= CFG.FIST_HOLD_FRAMES && now >= GS.coolUntil) {
      if (GS.fistHovering && !GS.fistHovering.classList.contains('locked')) {
        GS.coolUntil  = now + CFG.GESTURE_COOLDOWN_MS;
        GS.fistFrames = 0;
        _menuCursor.classList.remove('fist-loading');
        _clearCardHighlights();
        GS.fistHovering.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    }
    return;
  } else {
    // Fist released — clear fist state
    if (GS.fistFrames > 0) {
      GS.fistFrames = 0;
      GS.fistHovering = null;
      _menuCursor.classList.remove('fist-loading');
      document.getElementById(`${prefix}-fist`)?.classList.remove('g-active');
    }
  }

  // ================================================================
  // STAGE 1: Finger-count card selection
  // ================================================================
  if (now < GS.coolUntil) return;

  const f = _countFingers(lms);

  if (f === 0) {
    // No fingers up — reset hold counter
    if (GS.holdFrames > 0) {
      GS.holdFrames = 0; GS.fingers = 0;
      _clearGestureBar(prefix);
      _clearGestureTags();
      _clearCardHighlights();
    }
    return;
  }

  if (f !== GS.fingers) {
    // Finger count changed — restart hold from 1
    GS.fingers    = f;
    GS.holdFrames = 1;
    _clearGestureBar(prefix);
  } else {
    GS.holdFrames++;
  }

  const progress = GS.holdFrames / CFG.GESTURE_HOLD_FRAMES;
  _setGestureBar(progress, prefix);
  _highlightGestureTag(f, prefix);
  _highlightCard(f - 1, progress >= 1 ? 'active' : 'hover');

  if (GS.holdFrames >= CFG.GESTURE_HOLD_FRAMES) {
    const overlayId = gameState === 'weapon-select' ? 'weapon-cards' : 'upgrade-cards';
    const cards = document.querySelectorAll(`#${overlayId} .upgrade-card`);
    const target = cards[f - 1];
    if (target && target.classList.contains('locked')) {
      GS.holdFrames = 0;
      GS.fingers = 0;
      _clearGestureBar(prefix);
      _clearGestureTags();
      _clearCardHighlights();
      return;
    }
    GS.pendingIdx  = f - 1;
    GS.confirming  = true;
    GS.thumbDir    = null;
    GS.thumbFrames = 0;
    GS.holdFrames  = 0;
    GS.fingers     = 0;
    GS.coolUntil   = now + CFG.GESTURE_COOLDOWN_MS;
    _clearGestureBar(prefix);
    _clearGestureTags();
    _clearCardHighlights();
    _openConfirm(GS.pendingIdx);
  }
}

function clearHand() {
  hasHand = false;
  handJoints.forEach(m => m.visible = false);
  handBones.forEach(m  => m.visible = false);
  fingerRawX = null;
  fingerRawY = null;
  _showMenuCursor(false);
  GS.holdFrames  = 0;
  GS.fistFrames  = 0;
  GS.thumbFrames = 0;
}

function stepHandLerp(dt) {
  if (!hasHand) return;
  const alpha = 1 - Math.pow(0.55, dt * 60);
  handJoints.forEach((m, i) => m.position.lerp(handTargetPos[i], alpha));
  HCONN.forEach(([a, b], i) => {
    const pa = handJoints[a].position, pb = handJoints[b].position;
    _hmid.addVectors(pa, pb).multiplyScalar(0.5);
    const len = pa.distanceTo(pb);
    handBones[i].position.copy(_hmid);
    _hdir.subVectors(pb, pa).normalize();
    _hq.setFromUnitVectors(_hup, _hdir);
    handBones[i].setRotationFromQuaternion(_hq);
    handBones[i].scale.set(1, len, 1);
  });
}

// ================================================================
// WEBSOCKET
// ================================================================
const wsStatusEl = document.getElementById('ws-status');
const noHandEl   = document.getElementById('no-hand-hint');
let ws;

function connectWS() {
  ws = new WebSocket('ws://localhost:8765');
  ws.onopen = () => { wsStatusEl.textContent = '\u25cf Connected'; wsStatusEl.classList.add('connected'); };
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.landmarks) {
      setHandTargets(data.landmarks);
      noHandEl.style.display = 'none';
    } else {
      clearHand();
      noHandEl.style.display = 'block';
    }
  };
  ws.onclose = () => {
    wsStatusEl.textContent = '\u25cb Disconnected';
    wsStatusEl.classList.remove('connected');
    clearHand();
    noHandEl.style.display = 'block';
    setTimeout(connectWS, 1500);
  };
  ws.onerror = () => ws.close();
}

// ================================================================
// MAIN LOOP
// ================================================================
let lastTime = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;
  update(dt);
  draw();
  stepHandLerp(dt);
  handRenderer.render(handScene, handCamera);
}

// ================================================================
// BOOT
// ================================================================
initHandViewer();
connectWS();
initGame();
requestAnimationFrame(loop);
