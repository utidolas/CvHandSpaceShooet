'use strict';

// ================================================================
// CONFIG
// ================================================================
const CFG = {
  // Player base stats
  BASE_HP:                2000,
  BASE_SPEED:             400,         
  BASE_ATK_SPEED:         2.5,
  BASE_DAMAGE:            100,
  BASE_CRIT_CHANCE:       0.15,
  BASE_CRIT_MULT:         1.50,
  BASE_BULLET_SPEED:      1.0,

  // Enemy scaling
  ENEMY_BASE_HP:          300,
  ENEMY_HP_SCALE:         1.28,
  ENEMY_BASE_DMG:         250,
  ENEMY_DMG_SCALE:        1.19,
  ENEMY_SHOOT_BASE:       2.5,
  ENEMY_SHOOT_MIN:        0.065, // minimum attack speed
  ENEMY_SHOOT_DEC:        0.15, // enemy will gain 15% attack speed per wave

  // Wave
  WAVE_TIMER:             16,
  WAVE_PENALTY:           0.05,

  // Formation
  ENEMY_ZONE_TOP:         0.07,
  ENEMY_ZONE_BTM:         0.46,
  FORMATION_SPEED:        80,          
  FORMATION_DIP:          18,

  // Bullets
  PLAYER_BULLET_BASE_SPD: 920,         
  ENEMY_BULLET_SPD:       360,         

  // Ship
  SHIP_LERP_60:           0.40,
  SHIP_ZONE_TOP:          0.50,
  SHIP_SIZE:              18,

  // Health orbs
  ORB_DROP_CHANCE:        0.25,
  ORB_HEAL_MIN:           150,
  ORB_HEAL_MAX:           300,
  ORB_FALL_SPEED:         240,         // full-viewport px/sec

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
// XP / LEVEL / PERSISTENT SKILL TREE
// ================================================================
// XP needed to go from level N to N+1:  floor(80 × N^1.4)
// Level 1→2: 80  |  2→3: 188  |  3→4: 327  |  5→6: 680  |  10→11: 1599
function xpForNextLevel(lv) { return Math.floor(80 * Math.pow(lv, 1.4)); }

// XP per enemy kill — scales with wave
// wave 1: 15  |  wave 5: 87  |  wave 10: 200  |  wave 20: 479
function killXP(w) { return Math.round(15 * Math.pow(w, 1.2)); }

// XP bonus for clearing a wave — scales with wave^1.4
// wave 1: 100  |  wave 5: 765  |  wave 10: 1985  |  wave 20: 5154
function waveXP(w) { return Math.round(100 * Math.pow(w, 1.4)); }

// Three paths, four nodes each.
// Three paths, six nodes each. Bonuses persist across all runs.
const SKILL_TREE = [
  {
    id: 'defense', label: 'DEFENSE', color: '#5a90e0', icon: '\u26CA',
    nodes: [
      { id:'def_1', name:'Hull Plating',    icon:'\u2B21', desc:'Reinforce outer hull layers',        stat:'maxHp',     val:0.15, cost:1, req:null    },
      { id:'def_2', name:'Bulkhead',         icon:'\u29EB', desc:'Reduce bullet damage by 10%',        stat:'dmgReduce', val:0.10, cost:1, req:'def_1' },
      { id:'def_3', name:'Boiler Fortress',  icon:'\u2699', desc:'Massive secondary hull expansion',   stat:'maxHp',     val:0.25, cost:2, req:'def_2' },
      { id:'def_4', name:'Blast Dampener',   icon:'\u25CE', desc:'Reduce bullet damage by 8%',         stat:'dmgReduce', val:0.08, cost:2, req:'def_3' },
      { id:'def_5', name:'Iron Cathedral',   icon:'\u2736', desc:'Titan-grade hull reinforcement',     stat:'maxHp',     val:0.40, cost:3, req:'def_4' },
      { id:'def_6', name:'Titan Chassis',    icon:'\u2654', desc:'Near-impenetrable plating layers',   stat:'dmgReduce', val:0.15, cost:3, req:'def_5' },
    ]
  },
  {
    id: 'attack', label: 'ATTACK', color: '#e05a5a', icon: '\u2694',
    nodes: [
      { id:'atk_1', name:'Refined Powder',  icon:'\u25C6', desc:'Higher-grade propellant charge',     stat:'damage',    val:0.10, cost:1, req:null    },
      { id:'atk_2', name:'Hair Trigger',     icon:'\u25CE', desc:'Faster firing mechanism cycle',      stat:'atkSpeed',  val:0.10, cost:1, req:'atk_1' },
      { id:'atk_3', name:'Precision Sight',  icon:'\u2726', desc:'Improved critical hit chance',       stat:'critChance',val:0.08, cost:2, req:'atk_2' },
      { id:'atk_4', name:'Volatile Core',    icon:'\u2605', desc:'Devastating critical hit damage',    stat:'critMult',  val:0.25, cost:2, req:'atk_3' },
      { id:'atk_5', name:'Arcane Charge',    icon:'\u25C6', desc:'Elite propellant charge mix',        stat:'damage',    val:0.15, cost:3, req:'atk_4' },
      { id:'atk_6', name:'Inferno Chamber',  icon:'\u2726', desc:'Precision crit targeting system',    stat:'critChance',val:0.10, cost:3, req:'atk_5' },
    ]
  },
  {
    id: 'utility', label: 'UTILITY', color: '#50d4a0', icon: '\u2699',
    nodes: [
      { id:'utl_1', name:'Steam Turbine',   icon:'\u26A1', desc:'Boost thruster output',              stat:'moveSpeed', val:0.10, cost:1, req:null    },
      { id:'utl_2', name:'Medic Orbs',       icon:'\u2665', desc:'Orbs heal +2% more HP on pickup',    stat:'orbHeal',   val:0.02, cost:1, req:'utl_1' },
      { id:'utl_3', name:'Aether Fuel',      icon:'\u27A4', desc:'Faster projectile velocity',         stat:'bulletSpeed',val:0.12,cost:2, req:'utl_2' },
      { id:'utl_4', name:'Fortune Gears',    icon:'\u29BE', desc:'Higher chance for health orb drops', stat:'orbDrop',   val:0.10, cost:2, req:'utl_3' },
      { id:'utl_5', name:'Overdrive',        icon:'\u26A1', desc:'Extreme thruster overdrive',         stat:'moveSpeed', val:0.15, cost:3, req:'utl_4' },
      { id:'utl_6', name:'Vital Essence',    icon:'\u2665', desc:'Orbs heal an additional +3% HP',     stat:'orbHeal',   val:0.03, cost:3, req:'utl_5' },
    ]
  },
];

// ---- Persistent state (survives runs) ----
const PERSIST_KEY = 'aethericSkiesPersist_v1';

let PERSIST = {
  totalXP:  0,
  level:    1,
  skills:   {},   // id → true if purchased
};

function loadPersist() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      PERSIST.totalXP = parsed.totalXP || 0;
      PERSIST.skills  = parsed.skills  || {};
      PERSIST.level   = calcLevel(PERSIST.totalXP);
    }
  } catch(e) { /* ignore */ }
}

function savePersist() {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      totalXP: PERSIST.totalXP,
      skills:  PERSIST.skills,
    }));
  } catch(e) { /* ignore */ }
}

// Walk upward from level 1, consuming xpForNextLevel each step.
function calcLevel(xp) {
  let lv = 1, remaining = xp;
  while (remaining >= xpForNextLevel(lv)) {
    remaining -= xpForNextLevel(lv);
    lv++;
  }
  return lv;
}
// XP already spent inside the current level bracket.
function xpIntoCurrentLevel(xp) {
  let remaining = xp, lv = 1;
  while (remaining >= xpForNextLevel(lv)) {
    remaining -= xpForNextLevel(lv);
    lv++;
  }
  return remaining;
}
// XP threshold for the current level bracket (used for progress bar width).
function xpNeededThisLevel(xp) {
  let remaining = xp, lv = 1;
  while (remaining >= xpForNextLevel(lv)) {
    remaining -= xpForNextLevel(lv);
    lv++;
  }
  return xpForNextLevel(lv);
}

function getSpentSP() {
  let spent = 0;
  for (const path of SKILL_TREE) {
    for (const node of path.nodes) {
      if (PERSIST.skills[node.id]) spent += node.cost;
    }
  }
  return spent;
}
function getAvailableSP() { return Math.max(0, (PERSIST.level - 1) - getSpentSP()); }

function addXP(amount) {
  const prevLevel = PERSIST.level;
  PERSIST.totalXP += amount;
  PERSIST.level = calcLevel(PERSIST.totalXP);
  if (PERSIST.level > prevLevel) {
    const gained = PERSIST.level - prevLevel;
    showLevelUpBanner(PERSIST.level, gained);
  }
  savePersist();
  updateXPBar();
}

function updateXPBar() {
  const lvlEl  = document.getElementById('level-num');
  const fillEl = document.getElementById('xp-fill');
  const spEl   = document.getElementById('xp-sp');
  if (lvlEl)  lvlEl.textContent  = PERSIST.level;
  if (fillEl) {
    const into    = xpIntoCurrentLevel(PERSIST.totalXP);
    const needed  = xpNeededThisLevel(PERSIST.totalXP);
    fillEl.style.width = ((into / needed) * 100).toFixed(1) + '%';
  }
  if (spEl)   spEl.textContent   = getAvailableSP() + ' SP';
}

let _lvlBannerTimer = null;
function showLevelUpBanner(lvl, gained) {
  const el  = document.getElementById('level-up-banner');
  const txt = document.getElementById('lvlup-text');
  if (!el || !txt) return;
  txt.textContent = `LEVEL ${lvl}  +${gained} SKILL POINT${gained > 1 ? 'S' : ''}`;
  el.classList.add('show');
  if (_lvlBannerTimer) clearTimeout(_lvlBannerTimer);
  _lvlBannerTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function applySkillBonuses() {
  const s = PERSIST.skills;
  let hpMult = 1.0, dmgReduce = 0;
  if (s.def_1) hpMult    += 0.15;
  if (s.def_2) dmgReduce += 0.10;
  if (s.def_3) hpMult    += 0.25;
  if (s.def_4) dmgReduce += 0.08;
  if (s.def_5) hpMult    += 0.40;
  if (s.def_6) dmgReduce += 0.15;

  let dmgMult = 1.0, atkMult = 1.0, critBonus = 0, critMultBonus = 0;
  if (s.atk_1) dmgMult       += 0.10;
  if (s.atk_2) atkMult       += 0.10;
  if (s.atk_3) critBonus     += 0.08;
  if (s.atk_4) critMultBonus += 0.25;
  if (s.atk_5) dmgMult       += 0.15;
  if (s.atk_6) critBonus     += 0.10;

  let speedMult = 1.0, orbHealBonus = 0, bspeedMult = 1.0, orbDropBonus = 0;
  if (s.utl_1) speedMult    += 0.10;
  if (s.utl_2) orbHealBonus += 0.02;
  if (s.utl_3) bspeedMult   += 0.12;
  if (s.utl_4) orbDropBonus += 0.10;
  if (s.utl_5) speedMult    += 0.15;
  if (s.utl_6) orbHealBonus += 0.03;

  const baseHp = Math.round(CFG.BASE_HP * hpMult);
  player.hp           = baseHp;
  player.maxHp        = baseHp;
  player.damage       = Math.round(CFG.BASE_DAMAGE * dmgMult);
  player.skillAtkMult = atkMult;            // ← saved so applyWeapon can use it
  player.atkSpeed     = CFG.BASE_ATK_SPEED * atkMult;
  player.critChance   = Math.min(0.95, CFG.BASE_CRIT_CHANCE + critBonus);
  player.critMult     = CFG.BASE_CRIT_MULT + critMultBonus;
  player.moveSpeed    = 1.0 * speedMult;
  player.bulletSpeed  = CFG.BASE_BULLET_SPEED * bspeedMult;
  player.dmgReduce    = dmgReduce;
  player.orbHealBonus = orbHealBonus;
  player.orbDropBonus = orbDropBonus;
}

// ================================================================
// SKILL TREE — POE-STYLE ENGINE CANVAS RENDERER
// ================================================================
function isNodeUnlocked(node) {
  if (!node.req) return true;
  return !!PERSIST.skills[node.req];
}
const ST_W = 840, ST_H = 540;
const ST_NR = 28;   // node gear outer radius
const ST_HR = 40;   // hub gear outer radius
const ST_HUB = { x: 420, y: 52 };

// Canvas positions: [path_id] → [[cx,cy], ...] (6 nodes each)
const ST_POS = {
  defense: [[120,148],[120,213],[120,278],[120,343],[120,408],[120,468]],
  attack:  [[420,148],[420,213],[420,278],[420,343],[420,408],[420,468]],
  utility: [[720,148],[720,213],[720,278],[720,343],[720,408],[720,468]],
};

let _stCv = null, _stCx = null, _stRaf = null, _stHover = null;

function _stGear(ctx, cx, cy, outerR, innerR, teeth, angle) {
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2 + angle;
    const r = i % 2 === 0 ? outerR : innerR;
    i === 0 ? ctx.moveTo(cx + r*Math.cos(a), cy + r*Math.sin(a))
            : ctx.lineTo(cx + r*Math.cos(a), cy + r*Math.sin(a));
  }
  ctx.closePath();
}

function _stPipe(ctx, x1, y1, x2, y2, active, color) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = active ? color+'33' : '#150d05';
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.strokeStyle = active ? color+'77' : '#231208';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.strokeStyle = active ? color+'bb' : '#1a0d04';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const dist = Math.hypot(x2-x1, y2-y1);
  const n = Math.max(0, Math.floor(dist/50) - 1);
  for (let i = 1; i <= n; i++) {
    const t = i/(n+1), rx = x1+(x2-x1)*t, ry = y1+(y2-y1)*t;
    ctx.fillStyle   = active ? '#c8860a' : '#1e0e06';
    ctx.strokeStyle = active ? '#e8a020' : '#0e0804';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = active ? '#f0d08088' : '#0a0604';
    ctx.beginPath(); ctx.arc(rx-1.2, ry-1.2, 2, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function _stNodeGear(ctx, cx, cy, node, pathColor, angle, t) {
  const r = ST_NR, sp = getAvailableSP();
  const purchased = !!PERSIST.skills[node.id];
  const unlocked  = isNodeUnlocked(node);
  const available = unlocked && !purchased && sp >= node.cost;
  const c = pathColor;
  ctx.save();
  if (purchased)       { ctx.shadowColor = c; ctx.shadowBlur = 22; }
  else if (available)  { ctx.shadowColor = c; ctx.shadowBlur = 5 + Math.sin(t*2.6)*4; }
  _stGear(ctx, cx, cy, r, r*0.74, 8, angle);
  ctx.fillStyle   = purchased ? '#3c1e0a' : available ? '#1a0e06' : '#0c0806';
  ctx.fill();
  ctx.strokeStyle = purchased ? c : available ? c+'99' : '#2a1608';
  ctx.lineWidth   = purchased ? 2.5 : available ? 2 : 1.5;
  ctx.stroke();
  ctx.shadowBlur  = 0;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.60, 0, Math.PI*2);
  ctx.fillStyle   = purchased ? '#2c1608' : available ? '#160c04' : '#080604';
  ctx.fill();
  ctx.strokeStyle = purchased ? c+'aa' : available ? c+'33' : '#1a0a04';
  ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = `${Math.round(r*0.56)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = purchased ? c : available ? c+'cc' : '#382010';
  ctx.fillText(node.icon, cx, cy+1);
  ctx.font = `bold 7px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = purchased ? c : available ? '#906840' : '#2a1608';
  ctx.fillText(node.name.toUpperCase().slice(0,13), cx, cy+r+5);
  const bx = cx+r*0.72, by = cy-r*0.72;
  ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI*2);
  ctx.fillStyle   = purchased ? c : available ? '#c8860a' : '#180e06';
  ctx.fill();
  ctx.strokeStyle = purchased ? c+'aa' : available ? '#e8a020' : '#0e0804';
  ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = purchased ? '#0a0604' : available ? '#fffbe8' : '#3a2010';
  ctx.font = `bold ${purchased?9:8}px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(purchased ? '\u2713' : node.cost, bx, by);
  ctx.restore();
}

function _stHub(ctx, t) {
  const {x, y} = ST_HUB, r = ST_HR;
  ctx.save();
  ctx.shadowColor = '#e8a020'; ctx.shadowBlur = 32;
  _stGear(ctx, x, y, r, r*0.76, 14, t*0.28);
  ctx.fillStyle = '#3a1e08'; ctx.fill();
  ctx.strokeStyle = '#e8a020'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(x, y, r*0.56, 0, Math.PI*2);
  ctx.fillStyle = '#1a0e04'; ctx.fill();
  ctx.strokeStyle = '#c8860a'; ctx.lineWidth = 2; ctx.stroke();
  _stGear(ctx, x, y, r*0.42, r*0.30, 8, -t*0.56);
  ctx.fillStyle = '#2a1408'; ctx.fill();
  ctx.strokeStyle = '#c8860a'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#e8a020';
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#e8a020';
  ctx.font = `bold 7px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ENGINE', x, y-5); ctx.fillText('CORE', x, y+5);
  ctx.restore();
}

function _stTooltip(ctx, node, path, nx, ny) {
  const sp = getAvailableSP();
  const purchased  = !!PERSIST.skills[node.id];
  const unlocked   = isNodeUnlocked(node);
  const affordable = sp >= node.cost;
  const statusTxt  = purchased  ? '\u2713 PURCHASED'
    : !unlocked    ? '\u26A0 LOCKED \u2014 BUY PREVIOUS NODE'
    : !affordable  ? `NEED ${node.cost} SP (HAVE ${sp})`
    : `CLICK TO PURCHASE  \u2022  ${node.cost} SP`;
  const statusCol = purchased ? '#50d4a0' : (!unlocked||!affordable) ? '#6a4030' : '#e8a020';
  const tw=215, th=86, pad=10;
  let tx = nx+ST_NR+14, ty = ny-th/2;
  if (tx+tw > ST_W-6) tx = nx-ST_NR-tw-14;
  if (ty < 4) ty = 4;
  if (ty+th > ST_H-4) ty = ST_H-th-4;
  ctx.save();
  ctx.fillStyle = 'rgba(7,4,2,0.97)';
  ctx.strokeStyle = path.color; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx+4,ty); ctx.lineTo(tx+tw-4,ty); ctx.arcTo(tx+tw,ty,tx+tw,ty+4,4);
  ctx.lineTo(tx+tw,ty+th-4); ctx.arcTo(tx+tw,ty+th,tx+tw-4,ty+th,4);
  ctx.lineTo(tx+4,ty+th); ctx.arcTo(tx,ty+th,tx,ty+th-4,4);
  ctx.lineTo(tx,ty+4); ctx.arcTo(tx,ty,tx+4,ty,4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  let ly = ty+pad;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = `bold 9px "Share Tech Mono", monospace`;
  ctx.fillStyle = path.color; ctx.fillText(node.name.toUpperCase(), tx+pad, ly); ly+=14;
  ctx.font = `8px "Share Tech Mono", monospace`;
  ctx.fillStyle = '#8a7050'; ctx.fillText(node.desc, tx+pad, ly); ly+=13;
  ctx.fillStyle = path.color; ctx.fillText(formatSkillVal(node), tx+pad, ly); ly+=13;
  ctx.fillStyle = statusCol; ctx.font = `7px "Share Tech Mono", monospace`;
  ctx.fillText(statusTxt, tx+pad, ly);
  ctx.restore();
}

function _stRender(ts) {
  if (!_stCv) return;
  const ctx = _stCx, W = ST_W, H = ST_H, t = ts*0.001;
  ctx.fillStyle = '#060408'; ctx.fillRect(0,0,W,H);
  const g0 = ctx.createRadialGradient(ST_HUB.x,ST_HUB.y,0,ST_HUB.x,ST_HUB.y,320);
  g0.addColorStop(0,'rgba(232,160,32,0.055)'); g0.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g0; ctx.fillRect(0,0,W,H);
  for (const path of SKILL_TREE) {
    const [fx] = ST_POS[path.id][0];
    const gp = ctx.createRadialGradient(fx,H/2,0,fx,H/2,230);
    gp.addColorStop(0,path.color+'0a'); gp.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gp; ctx.fillRect(0,0,W,H);
  }
  // Decorative small junction gears between paths
  const jx1 = (ST_POS.defense[0][0]+ST_POS.attack[0][0])/2;
  const jx2 = (ST_POS.attack[0][0]+ST_POS.utility[0][0])/2;
  const jy  = ST_POS.defense[0][1];
  for (const [jx, spd] of [[jx1, -0.7],[jx2, 0.7]]) {
    ctx.save();
    _stGear(ctx, jx, jy, 13, 9, 7, t*spd);
    ctx.fillStyle='#1a0d05'; ctx.fill();
    ctx.strokeStyle='#342010'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(jx,jy,4,0,Math.PI*2);
    ctx.fillStyle='#0e0804'; ctx.fill();
    ctx.restore();
  }
  // Hub-to-first-node pipes
  for (const path of SKILL_TREE) {
    const [fx,fy] = ST_POS[path.id][0];
    const act = !!PERSIST.skills[path.nodes[0].id];
    _stPipe(ctx, ST_HUB.x, ST_HUB.y+ST_HR+2, fx, fy-ST_NR-2, act, path.color);
  }
  // Inter-node pipes
  for (const path of SKILL_TREE) {
    const pos = ST_POS[path.id];
    for (let ni=0; ni<path.nodes.length-1; ni++) {
      const [x1,y1]=pos[ni], [x2,y2]=pos[ni+1];
      const act = !!PERSIST.skills[path.nodes[ni].id];
      _stPipe(ctx, x1, y1+ST_NR+2, x2, y2-ST_NR-2, act, path.color);
    }
  }
  // Path labels
  for (const path of SKILL_TREE) {
    const [lx] = ST_POS[path.id][0];
    ctx.save();
    ctx.fillStyle = path.color+'cc';
    ctx.font = `bold 9px "Share Tech Mono", monospace`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(`\u2500\u2500 ${path.label} \u2500\u2500`, lx, 120);
    ctx.restore();
  }
  // Hub (drawn on top of pipe ends)
  _stHub(ctx, t);
  // Nodes
  for (let pi=0; pi<SKILL_TREE.length; pi++) {
    const path = SKILL_TREE[pi], pos = ST_POS[path.id];
    const phase = pi * Math.PI * 0.9;
    for (let ni=0; ni<path.nodes.length; ni++) {
      const [cx,cy] = pos[ni];
      const angle = (ni%2===0 ? -1 : 1) * t * 0.44 + phase + ni*0.22;
      _stNodeGear(ctx, cx, cy, path.nodes[ni], path.color, angle, t);
    }
  }
  // Hover tooltip (topmost layer)
  if (_stHover) {
    const {pi, ni} = _stHover;
    const path = SKILL_TREE[pi];
    const [nx,ny] = ST_POS[path.id][ni];
    _stTooltip(ctx, path.nodes[ni], path, nx, ny);
  }
  _stRaf = requestAnimationFrame(_stRender);
}

function _stInitCanvas() {
  if (_stCv) return;
  _stCv = document.getElementById('st-canvas');
  if (!_stCv) return;
  _stCx = _stCv.getContext('2d');
  _stCv.addEventListener('mousemove', e => {
    const rect = _stCv.getBoundingClientRect();
    const sx = ST_W/rect.width, sy = ST_H/rect.height;
    const mx = (e.clientX-rect.left)*sx, my = (e.clientY-rect.top)*sy;
    _stHover = null;
    outer: for (let pi=0; pi<SKILL_TREE.length; pi++) {
      const pos = ST_POS[SKILL_TREE[pi].id];
      for (let ni=0; ni<SKILL_TREE[pi].nodes.length; ni++) {
        const [cx,cy] = pos[ni];
        if (Math.hypot(mx-cx, my-cy) < ST_NR+10) { _stHover={pi,ni}; break outer; }
      }
    }
    _stCv.style.cursor = _stHover ? 'pointer' : 'default';
  });
  _stCv.addEventListener('mouseleave', () => { _stHover = null; });
  _stCv.addEventListener('click', () => {
    if (_stHover) purchaseSkill(SKILL_TREE[_stHover.pi].nodes[_stHover.ni]);
  });
}

function renderSkillTree() {
  const sp = getAvailableSP();
  const el = document.getElementById('st-sp');
  const ll = document.getElementById('st-lvl');
  if (el) el.textContent = `${sp} SP AVAILABLE`;
  if (ll) ll.textContent = `LEVEL ${PERSIST.level}`;
}

function formatSkillVal(node) {
  switch (node.stat) {
    case 'maxHp':       return `+${Math.round(node.val*100)}% MAX HP`;
    case 'dmgReduce':   return `\u2212${Math.round(node.val*100)}% DAMAGE TAKEN`;
    case 'damage':      return `+${Math.round(node.val*100)}% DAMAGE`;
    case 'atkSpeed':    return `+${Math.round(node.val*100)}% FIRE RATE`;
    case 'critChance':  return `+${Math.round(node.val*100)}% CRIT CHANCE`;
    case 'critMult':    return `+${Math.round(node.val*100)}% CRIT DMG`;
    case 'moveSpeed':   return `+${Math.round(node.val*100)}% MOVE SPEED`;
    case 'orbHeal':     return `+${Math.round(node.val*100)}% ORB HEAL`;
    case 'bulletSpeed': return `+${Math.round(node.val*100)}% SHOT SPEED`;
    case 'orbDrop':     return `+${Math.round(node.val*100)}% ORB DROP RATE`;
    default:            return '';
  }
}

function purchaseSkill(node) {
  if (!isNodeUnlocked(node)) return;
  if (PERSIST.skills[node.id]) return;
  if (getAvailableSP() < node.cost) return;
  PERSIST.skills[node.id] = true;
  savePersist();
  applySkillBonuses();   // apply immediately so stats update live
  renderSkillTree();
}

function showSkillTree() {
  _stInitCanvas();
  renderSkillTree();
  document.getElementById('skilltree-overlay').classList.add('visible');
  if (!_stRaf) _stRaf = requestAnimationFrame(_stRender);
}

function hideSkillTree() {
  document.getElementById('skilltree-overlay').classList.remove('visible');
  if (_stRaf) { cancelAnimationFrame(_stRaf); _stRaf = null; }
}

// ================================================================
// WEAPON DEFINITIONS
// ================================================================
const WEAPONS = [
  {
    id: 'heavy',  name: 'Iron Cannon',
    icon: '\u25CE', color: '#e8a020',
    desc: 'Single massive shell.\nDevastating but slow fire rate.',
    dmgMult: 1.60, atkMult: 0.80,
    hint: 'High single-hit damage',
  },
  {
    id: 'spread', name: 'Tri-Barrel',
    icon: '\u2756', color: '#40c8e8',
    desc: 'Three shots in a spread cone.\nCovers wide area, less damage each.',
    dmgMult: 0.65, atkMult: 1.30,
    hint: 'Wide area coverage',
  },
  {
    id: 'burst',  name: 'Double Repeater',
    icon: '\u25C8', color: '#80d040',
    desc: 'Fires two rounds in quick\nsuccession. Reliable sustained DPS.',
    dmgMult: 0.80, atkMult: 1.00,
    hint: 'Consistent double-tap',
  },
  {
    id: 'aether', name: 'Aether Seeker',
    icon: '\u2726', color: '#7cc0ff',
    desc: 'Homing rounds chase targets.\nLow damage per shot.',
    dmgMult: 0.40, atkMult: 2.00,
    hint: 'Auto-tracking rounds',
    unlockScore: 1000,
  },
  {
    id: 'ricochet', name: 'Ricochet Chamber',
    icon: '\u21BB', color: '#e0b060',
    desc: 'Wild angles and bounces.\nUnpredictable but deadly.',
    dmgMult: 0.58, atkMult: 1.2,
    hint: 'Bouncing rounds',
    unlockScore: 5000,
  },
  {
    id: 'tesla', name: 'Tesla Lance',
    icon: '\u26A1', color: '#60e8ff',
    desc: 'Instant beam strike.\nSlow cycle, massive burst.',
    dmgMult: 3.90, atkMult: 0.23,
    hint: 'Line-damage beam',
    unlockScore: 20000,
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
  { icon:'+',      name:'Emergency Steam',   desc:'Repair critical hull damage',      stat:'heal',        val:0.20, fmt:v=>`+${Math.round(v*100)}% hull restored`  },
  { icon:'\u25CE', name:'Rapid Valves',      desc:'Faster firing cycle',              stat:'atkSpeed',    val:0.25, fmt:v=>`+${v.toFixed(2)} shots/s`             },
  { icon:'\u25CE', name:'Pressure Chamber',  desc:'High-pressure shot cycle',         stat:'atkSpeed',    val:0.45, fmt:v=>`+${v.toFixed(2)} shots/s`             },
  { icon:'\u25C6', name:'Explosive Powder',  desc:'More potent propellant charge',    stat:'damage',      val:4,    fmt:v=>`+${v} base damage`                    },
  { icon:'\u25C6', name:'Refined Rounds',    desc:'Precision-machined ammunition',    stat:'damage',      val:7,    fmt:v=>`+${v} base damage`                    },
  { icon:'\u25C6', name:'Masterwork Shot',   desc:'Rare artisan-crafted shells',      stat:'damage',      val:12,   fmt:v=>`+${v} base damage`                    },
  { icon:'\u2726', name:'Telescopic Sight',  desc:'Improved targeting optics',        stat:'critChance',  val:0.05, fmt:v=>`+${Math.round(v*100)}% crit chance`   },
  { icon:'\u2726', name:'Precision Gauge',   desc:'Fine-tuned aiming apparatus',      stat:'critChance',  val:0.10, fmt:v=>`+${Math.round(v*100)}% crit chance`   },
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
let teslaBeamFx = null;

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
    dmgReduce:   0,      // % damage reduction (from Defense skill tree)
    orbHealBonus: 0,     // extra % heal per orb (from Utility skill tree)
    orbDropBonus: 0,     // extra orb drop chance (from Utility skill tree)
    invulTimer:  0,
    burstTimer:    0,
    teslaCooldown: 0,  // countdown in seconds until next tesla fire
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
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.009)
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

  function genBoilers(count) {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        type: 'boiler',
        x: 120 + Math.random() * (GW - 240),
        y: Math.random() * tH,
        r: 40 + Math.random() * 70,
        ring: Math.random() > 0.5,
        pipeAngle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.009)
      });
    }
    return items;
  }

  function genScrap(count){
    const items=[];
    for(let i=0;i<count;i++){
      items.push({
        type:'scrap',
        x:Math.random()*GW,
        y:Math.random()*tH,
        r:10+Math.random()*26,
        angle:Math.random()*Math.PI*2,
        rot:(Math.random()-0.5)*0.02,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.009)
      });
    }
    return items;
  }

  function genStars(count){
    const items=[];
    for(let i=0;i<count;i++){
      items.push({
        type:'star',
        x:Math.random()*GW,
        y:Math.random()*tH,
        r:1+Math.random()*2,
        flicker:Math.random()*Math.PI*2
      });
    }
    return items;
  }

  function genGalaxies(count){
    const items=[];
    for(let i=0;i<count;i++){
      items.push({
        type:'galaxy',
        x:Math.random()*GW,
        y:Math.random()*tH,
        r:80+Math.random()*140,
        rot:Math.random()*Math.PI*2,
        flicker:Math.random()*Math.PI*2,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.009) 
      });
    }
    return items;
  }

  parallaxLayers = [
    // distant furnace sky
    { speed:110, alpha:0.20, offset:0, tileH:tH, items:[...genStars(120), ...genGalaxies(2)]},
  
    // industrial sky objects
    { speed:138, alpha:0.08, offset:0, tileH:tH, items:[...genGears(4,55,90,10,14), ...genBoilers(2)]},
  
    // mid structures
    { speed:162, alpha:0.22, offset:Math.random()*GH, tileH:tH, items:[...genGears(8,24,46,7,10), ...genPipes(7)]},
  
    // debris
    { speed:200, alpha:0.18, offset:Math.random()*GH, tileH:tH, items:[...genScrap(22)]},
  
    // embers
    { speed:235, alpha:0.14, offset:Math.random()*GH, tileH:tH, items:genEmbers(35)}
  ];
}

function updateParallax(dt) {
  for (const layer of parallaxLayers) {
    layer.offset = (layer.offset + layer.speed * dt) % layer.tileH;
    for (const item of layer.items) {
      if (item.type === 'gear') item.angle += item.rotSpeed;
      if (item.type === 'scrap' || item.type === 'galaxy') item.angle += item.rotSpeed * 0.60; // 40%
      if (item.type === 'star' || item.type === 'galaxy') item.flicker += 0.04; // flicker effect for stars and galaxies
      if (item.type === 'boiler' || item.type === 'pipe') item.angle += item.rotSpeed * 0.85; // 15% 
    }
  }
}

function drawParallaxItem(item, x, y) {
  if (y > GH + 200 || y < -200) return;
  ctx.save();
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
  } else if (item.type === 'boiler') {
    // main tank
    ctx.beginPath();
    ctx.arc(x, y, item.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // rivets
    const rivets = 12;
    for (let i=0;i<rivets;i++){
      const a = (i/rivets)*Math.PI*2;
      const rx = x + Math.cos(a)*(item.r*0.85);
      const ry = y + Math.sin(a)*(item.r*0.85);
      ctx.fillRect(rx-1, ry-1, 2, 2);
    }
    // ring structure
    if (item.ring){
      ctx.beginPath();
      ctx.ellipse(x, y, item.r*1.4, item.r*0.35, 0, 0, Math.PI*2);
      ctx.stroke();
    }
    // pipe sticking out
    const px = x + Math.cos(item.pipeAngle)*item.r;
    const py = y + Math.sin(item.pipeAngle)*item.r;
    ctx.fillRect(px-3, py-6, 6, 12);
  } else if (item.type === 'scrap') {
    ctx.translate(x,y);
    ctx.rotate(item.angle);
    ctx.beginPath();
    ctx.moveTo(-item.r, -item.r*0.4);
    ctx.lineTo(item.r*0.8, -item.r*0.6);
    ctx.lineTo(item.r, item.r*0.3);
    ctx.lineTo(-item.r*0.4, item.r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // rivet
    ctx.fillRect(-1,-1,2,2);
  } else if(item.type==='star'){
    item.flicker += 0.05;
    const a = 0.4 + Math.sin(item.flicker)*0.3;
    ctx.fillStyle=`rgba(255,180,60,${a})`;
    ctx.fillRect(x,y,item.r,item.r);
  } else if(item.type==='galaxy'){
    const g=ctx.createRadialGradient(x,y,0,x,y,item.r);
    g.addColorStop(0,'rgba(255,180,90,0.18)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.arc(x,y,item.r,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
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
  applySkillBonuses();   // apply persistent skill tree bonuses
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
  teslaBeamFx = null;

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
  // Skill tree button inside weapon overlay
  const stBtn = document.getElementById('weapon-skilltree-btn');
  if (stBtn) stBtn.onclick = showSkillTree;

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
  // Combine skill-tree atk multiplier with weapon multiplier so tree bonuses are respected
  player.atkSpeed = CFG.BASE_ATK_SPEED * (player.skillAtkMult || 1.0) * wep.atkMult;
  shootTimer      = 1 / player.atkSpeed;
  hideOverlay('weapon-overlay');
  gameState = 'playing';
  spawnWave();
  updateStatsPanel();
}

// ================================================================
// WAVE SPAWNING — random formation each wave
// ================================================================

// Each formation fn receives (count, wave) and pushes into enemies[].
const FORMATIONS = [

  // 0 · Classic grid — the baseline
  function formGrid(count) {
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
  },

  // 1 · V-wedge pointing down
  function formWedge(count) {
    const cx = GW / 2;
    const yBase = GH * CFG.ENEMY_ZONE_TOP + 40;
    const xStep = 80, yStep = 52;
    const half = Math.floor(count / 2);
    for (let i = 0; i < count; i++) {
      const side   = i <= half ? i : count - 1 - i;
      const mirror = i <= half ? -1 : 1;
      enemies.push(makeEnemy(cx + mirror * side * xStep, yBase + side * yStep, wave));
    }
  },

  // 2 · Diamond / rhombus
  function formDiamond(count) {
    const cx   = GW / 2;
    const cyTop = GH * CFG.ENEMY_ZONE_TOP + 30;
    const xStep = 82, yStep = 52;
    const n     = Math.ceil(Math.sqrt(count));
    let placed  = 0;
    for (let row = 0; row < n && placed < count; row++) {
      const cols = row < n / 2 ? row * 2 + 1 : (n - row) * 2 + 1;
      const w    = (cols - 1) * xStep;
      for (let col = 0; col < cols && placed < count; col++) {
        enemies.push(makeEnemy(cx - w / 2 + col * xStep, cyTop + row * yStep, wave));
        placed++;
      }
    }
  },

  // 3 · Two flanking columns
  function formColumns(count) {
    const yBase  = GH * CFG.ENEMY_ZONE_TOP + 30;
    const yStep  = 62;
    const half   = Math.ceil(count / 2);
    const leftX  = GW * 0.22;
    const rightX = GW * 0.78;
    for (let i = 0; i < count; i++) {
      const x = i < half ? leftX : rightX;
      const y = yBase + (i % half) * yStep;
      enemies.push(makeEnemy(x, y, wave));
    }
  },

  // 4 · Arc / crescent across the top
  function formArc(count) {
    const cx    = GW / 2;
    const cy    = GH * CFG.ENEMY_ZONE_TOP - 20;
    const rx    = GW * 0.38;
    const ry    = GH * 0.18;
    const aMin  = Math.PI * 0.08;
    const aMax  = Math.PI * 0.92;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const a = aMin + t * (aMax - aMin);
      enemies.push(makeEnemy(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, wave));
    }
  },

  // 5 · X cross
  function formCross(count) {
    const cx    = GW / 2;
    const yBase = GH * CFG.ENEMY_ZONE_TOP + 20;
    const step  = 68;
    const arm   = Math.floor((count - 1) / 4);
    // Centre
    enemies.push(makeEnemy(cx, yBase + arm * step, wave));
    let placed = 1;
    for (let i = 1; i <= arm && placed < count; i++) {
      enemies.push(makeEnemy(cx,           yBase + (arm - i) * step, wave)); placed++;
      if (placed < count) { enemies.push(makeEnemy(cx,           yBase + (arm + i) * step, wave)); placed++; }
      if (placed < count) { enemies.push(makeEnemy(cx - i * step, yBase + arm * step,       wave)); placed++; }
      if (placed < count) { enemies.push(makeEnemy(cx + i * step, yBase + arm * step,       wave)); placed++; }
    }
  },

  // 6 · Scattered random clusters
  function formScatter(count) {
    const zoneH = (CFG.ENEMY_ZONE_BTM - CFG.ENEMY_ZONE_TOP) * GH * 0.7;
    const margin = 80;
    for (let i = 0; i < count; i++) {
      const x = margin + Math.random() * (GW - margin * 2);
      const y = GH * CFG.ENEMY_ZONE_TOP + 30 + Math.random() * zoneH;
      enemies.push(makeEnemy(x, y, wave));
    }
  },

  // 7 · Three tight squads
  function formSquads(count) {
    const yBase = GH * CFG.ENEMY_ZONE_TOP + 40;
    const centers = [GW * 0.22, GW * 0.5, GW * 0.78];
    const step  = 52;
    for (let i = 0; i < count; i++) {
      const squad = i % 3;
      const rank  = Math.floor(i / 3);
      const col   = rank % 2;
      const row   = Math.floor(rank / 2);
      enemies.push(makeEnemy(
        centers[squad] + (col - 0.5) * step,
        yBase + row * step,
        wave
      ));
    }
  },
];

// Track last formation index to avoid immediate repeats
let _lastFormationIdx = -1;

function spawnWave() {
  wave++;
  waveTimer = CFG.WAVE_TIMER;
  groupX    = 0;
  groupDir  = 1;

  const count = Math.min(4 + wave * 2, 24);

  // Pick a random formation, avoiding immediate repeat
  let idx;
  do { idx = Math.floor(Math.random() * FORMATIONS.length); }
  while (idx === _lastFormationIdx && FORMATIONS.length > 1);
  _lastFormationIdx = idx;

  FORMATIONS[idx](count);
  announceWave(wave);
}

// ================================================================
// KEYBOARD
// ================================================================
const keys = new Set();

function unlockAllWeapons() {
  if (debugUnlockAllWeapons) return;
  debugUnlockAllWeapons = true;
  if (gameState === 'weapon-select') showWeaponSelect();
}

window.addEventListener('keydown', e => {
  keys.add(e.key);

  if (e.code === 'KeyP') {
    togglePause();
    return;
  }

  if (e.code === 'KeyM') {
    // Return to main menu — confirm first to avoid accidental resets
    if (gameState !== 'gameover' && gameState !== 'weapon-select') {
      showMainMenuConfirm();
    }
    return;
  }

  if (e.code === 'KeyU') {
    unlockAllWeapons();
    return;
  }

  if (e.code === 'KeyR' && gameState === 'gameover') initGame();
});
window.addEventListener('keyup', e => keys.delete(e.key));
document.getElementById('restart-btn').addEventListener('click', initGame);

// ================================================================
// MAIN MENU CONFIRM
// ================================================================
function showMainMenuConfirm() {
  const prev = gameState;
  if (prev === 'playing') togglePause();   // pause the game while dialog is open
  const overlay = document.getElementById('mainmenu-overlay');
  overlay.classList.add('visible');

  document.getElementById('mainmenu-yes-btn').onclick = () => {
    overlay.classList.remove('visible');
    initGame();
  };
  document.getElementById('mainmenu-no-btn').onclick = () => {
    overlay.classList.remove('visible');
    if (prev === 'playing') togglePause();  // resume
  };
}

// ================================================================
// PANEL TOGGLE BUTTONS
// ================================================================
(function initPanelToggles() {
  function makeToggle(panelId, btnId) {
    const panel = document.getElementById(panelId);
    const btn   = document.getElementById(btnId);
    if (!panel || !btn) return;
    btn.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('panel-collapsed');
      btn.textContent = collapsed ? '+' : '−';
      btn.title       = collapsed ? 'Show panel' : 'Hide panel';
    });
  }
  makeToggle('stats-panel',  'stats-toggle-btn');
  makeToggle('hand-viewer',  'hand-toggle-btn');
})();

// ================================================================
// SPAWN HELPERS
// ================================================================
let _lastCrit = false;

function calcDamage(dmgMult = 1.0) {
  _lastCrit = Math.random() < player.critChance;
  return Math.round(player.damage * dmgMult * (_lastCrit ? player.critMult : 1));
}

function fireBullet(x, y, angle, dmgMult, extra = {}) {
  const spd = CFG.PLAYER_BULLET_BASE_SPD * player.bulletSpeed;
  const baseDmg = calcDamage(dmgMult);
  const dmgScale = typeof extra.dmgScale === 'number' ? extra.dmgScale : 1.0;
  const dmg = Math.max(1, Math.round(baseDmg * dmgScale));
  bullets.push({
    x,
    y,
    vx: Math.cos(angle) * spd,
    vy: Math.sin(angle) * spd,
    angle,
    dmg,
    crit: _lastCrit,
    hitR: typeof extra.hitR === 'number' ? extra.hitR : 4,
    type: 'normal',
    ...extra,
  });
}

function findClosestEnemy(x, y, skipEnemy = null) {
  let best = null;
  let bestD2 = Infinity;
  for (const e of enemies) {
    if (e === skipEnemy) continue;
    const ex = e.baseX + groupX;
    const dx = ex - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

function setBulletAngleFromVelocity(b) {
  b.angle = Math.atan2(b.vy, b.vx);
}

function scaleRicochetBullet(b) {
  b.ricochetCount = (b.ricochetCount || 0) + 1;
  b.hitR = Math.min(24, (b.hitR || 4) + 3);
  b.drawR = Math.min(20, (b.drawR || 6) + 2);
  b.dmg = Math.max(1, Math.round(b.dmg * 1.25));
}

function fireTeslaBeam(dmgMult) {
  const bx = player.x;
  const by = player.y - player.size * 0.8;
  const dmg = calcDamage(dmgMult);
  bullets.push({
    x,
    y,
    vx: Math.cos(angle) * spd,
    vy: Math.sin(angle) * spd,
    dmg,
    crit: _lastCrit,
    type: 'normal',
    ...extra,
  });
}

function findClosestEnemy(x, y, skipEnemy = null) {
  let best = null;
  let bestD2 = Infinity;
  for (const e of enemies) {
    if (e === skipEnemy) continue;
    const ex = e.baseX + groupX;
    const dx = ex - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}

function fireTeslaBeam(dmgMult) {
  const bx = player.x;
  const by = player.y - player.size * 0.8;
  const dmg = calcDamage(dmgMult);
  const beamHalfW = 26;

  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const e = enemies[ei];
    const ex = e.baseX + groupX;
    if (Math.abs(ex - bx) > e.r + beamHalfW) continue;
    if (e.y > by) continue;

    e.hp -= dmg;
    e.flash = 1.0;
    spawnDmgNumber(ex + (Math.random() - 0.5) * 16, e.y - e.r - 6, dmg, _lastCrit);
    if (e.hp <= 0) {
      spawnParticles(ex, e.y, '#60e8ff', 10);
      spawnParticles(ex, e.y, '#c8f8ff', 6);
      if (Math.random() < CFG.ORB_DROP_CHANCE + (player.orbDropBonus || 0)) spawnOrb(ex, e.y);
      enemies.splice(ei, 1);
      score += 10 * wave;
      addXP(killXP(wave));
      updateTopBar();
    }
  }

  teslaBeamFx = { x: bx, y0: by, y1: GH * 0.04, t: 0.12 };
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
  } else if (player.weapon === 'aether') {
    fireBullet(bx, by, -Math.PI / 2, mult, { type: 'homing', turnRate: 8.8 });
  } else if (player.weapon === 'ricochet') {
    // 150° arc (-75° to +75° from straight up), edge-biased
    // Use a U-shaped distribution: bias toward the ±75° extremes
    const halfArc = (75 * Math.PI) / 180; // 75° in radians
    const u = Math.random();
    // Bias toward edges: map uniform [0,1] → edge-heavy via power curve
    // u < 0.5 → negative side, u >= 0.5 → positive side
    const sign = u < 0.5 ? -1 : 1;
    const t = sign < 0 ? (0.5 - u) * 2 : (u - 0.5) * 2; // [0,1] per side
    // Power curve (exponent < 1 pushes mass toward edges)
    const wobble = sign * Math.pow(t, 0.35) * halfArc;
    fireBullet(bx, by, -Math.PI / 2 + wobble, mult, {
      type: 'ricochet',
      bouncesLeft: 2,
      hitR: 5,
      drawR: 7,
    });
  } else if (player.weapon === 'tesla') {
    fireTeslaBeam(mult);
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
  particles.push({ isDmgText: true, x, y, vy: -60, text: crit ? `\u2605${dmg}` : `${dmg}`, color: crit ? '#ff3020' : '#e8a020', size: crit ? 17 : 13, life: 1.2, decay: 0.75 });
}

function spawnOrb(x, y) {
  // Heal = 4% base + any bonus from Utility skill tree
  const healPct = 0.04 + (player.orbHealBonus || 0);
  orbs.push({ x, y, vy: CFG.ORB_FALL_SPEED, r: 10, healPct, bob: Math.random() * Math.PI * 2 });
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

  if (teslaBeamFx) {
    teslaBeamFx.t -= dt;
    if (teslaBeamFx.t <= 0) teslaBeamFx = null;
  }

  // Auto-shoot
  shootTimer -= dt;
  if (player.weapon === 'tesla') {
    player.teslaCooldown = shootTimer;
  } else {
    player.teslaCooldown = 0;
  }
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
    for (const e of enemies) {
      e.y = Math.min(e.y + CFG.FORMATION_DIP, GH * CFG.ENEMY_ZONE_BTM - e.r - 6);
    }
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
  for (const b of bullets) {
    if (b.type === 'homing' && enemies.length > 0) {
      const target = findClosestEnemy(b.x, b.y);
      if (target) {
        const tx = target.baseX + groupX;
        const ty = target.y;
        const desired = Math.atan2(ty - b.y, tx - b.x);
        const current = Math.atan2(b.vy, b.vx);
        let delta = desired - current;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const turn = Math.max(-b.turnRate * dt, Math.min(b.turnRate * dt, delta));
        const next = current + turn;
        const speed = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(next) * speed;
        b.vy = Math.sin(next) * speed;
      }
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.type === 'ricochet') {
      if (b.x < 8 || b.x > GW - 8) {
        b.vx *= -1;
        b.bouncesLeft--;
        scaleRicochetBullet(b);
      }
      if (b.y < 8) {
        b.vy = Math.abs(b.vy);
        b.bouncesLeft--;
        scaleRicochetBullet(b);
      }
    }
  }
  for (const b of eBullets) { b.x += b.vx * dt;  b.y += b.vy * dt; }
  for (let i = bullets.length  - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.type === 'ricochet' && b.bouncesLeft < 0) { bullets.splice(i, 1); continue; }
    if (b.y < -30 || b.x < -30 || b.x > GW + 30 || b.y > GH + 30) bullets.splice(i, 1);
  }
  for (let i = eBullets.length - 1; i >= 0; i--) { const b = eBullets[i]; if (b.x < -30 || b.x > GW + 30 || b.y < -30 || b.y > GH + 30) eBullets.splice(i, 1); }

  checkBulletEnemyHits();
  checkEnemyBulletPlayerHits();
  updateOrbs(dt);

  // Wave cleared
  if (enemies.length === 0) {
    addXP(waveXP(wave));   // wave-clear bonus scales with wave^1.5
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
    let consumed = false;

    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e  = enemies[ei];
      const ex = e.baseX + groupX;
      const dx = b.x - ex;
      const dy = b.y - e.y;
      const br = b.hitR || 4;
      if (dx * dx + dy * dy >= (e.r + br) ** 2) continue;

      e.hp   -= b.dmg;
      e.flash = 1.0;
      spawnDmgNumber(ex + (Math.random() - 0.5) * 18, e.y - e.r - 6, b.dmg, b.crit);

      if (e.hp <= 0) {
        spawnParticles(ex, e.y, '#c8860a', 12);
        spawnParticles(ex, e.y, '#e04010',  5);
        if (Math.random() < CFG.ORB_DROP_CHANCE + (player.orbDropBonus || 0)) spawnOrb(ex, e.y);
        enemies.splice(ei, 1);
        score += 10 * wave;
        addXP(killXP(wave));
        updateTopBar();
      }

      if (b.type === 'ricochet' && b.bouncesLeft > 0) {
        b.bouncesLeft--;
        const nt = findClosestEnemy(b.x, b.y, e);
        const ang = nt
          ? Math.atan2(nt.y - b.y, (nt.baseX + groupX) - b.x)
          : Math.atan2(-b.vy, -b.vx) + (Math.random() - 0.5) * 0.5;
        const speed = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(ang) * speed;
        b.vy = Math.sin(ang) * speed;
        b.x += b.vx * 0.012;
        b.y += b.vy * 0.012;
        scaleRicochetBullet(b);
      } else {
        consumed = true;
      }

      break;
    }

    if (consumed) bullets.splice(bi, 1);
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
      const healAmt = Math.round(player.maxHp * o.healPct);
      player.hp = Math.min(player.maxHp, player.hp + healAmt);
      updateStatsPanel();
      particles.push({ isDmgText: true, x: o.x, y: o.y, vy: -55, text: `+${healAmt}`, color: '#60ff80', size: 15, life: 1.4, decay: 0.55 });
      orbs.splice(i, 1);
    }
  }
}

function damagePlayer(amount, isTimerPenalty) {
  // Defence tree reduction applies only to enemy fire, NOT the wave-timer penalty
  const reduced = isTimerPenalty
    ? amount
    : Math.round(amount * (1 - (player.dmgReduce || 0)));
  player.hp = Math.max(0, player.hp - reduced);
  player.invulTimer = 1.0;
  screenFlash = 1.0;
  spawnParticles(player.x, player.y, '#ff3030', 7);
  if (isTimerPenalty) {
    particles.push({ isDmgText: true, x: GW / 2, y: GH * 0.12, vy: -30, text: `HULL BREACH \u2212${reduced}`, color: '#e05050', size: 14, life: 2.0, decay: 0.38 });
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

  // Zone separator — clean glowing line
  ctx.save();
  const sepY = GH * CFG.ENEMY_ZONE_BTM;
  ctx.shadowColor = 'rgba(232,160,32,0.70)';
  ctx.shadowBlur  = 8;
  ctx.strokeStyle = 'rgba(232,160,32,0.55)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, sepY);
  ctx.lineTo(GW, sepY);
  ctx.stroke();
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

// Tesla Lance cooldown bar — shown below HP bar when weapon is tesla
function drawTeslaCooldownBar() {
  if (player.weapon !== 'tesla') return;
  const maxCd = 1 / player.atkSpeed;
  const cd    = Math.max(0, player.teslaCooldown || 0);
  const pct   = cd / maxCd;   // 1 = just fired (full cooldown), 0 = ready

  const bw = player.size * 2 + 8;
  const bx = Math.round(player.x - bw / 2);
  const by = Math.round(player.y + player.size + 4 + 7);  // 7px below HP bar

  // Background track
  ctx.fillStyle = '#0a1018';
  ctx.fillRect(bx, by, Math.round(bw), 3);

  // Fill — light blue, shrinks toward 0 as cooldown elapses
  ctx.fillStyle = pct < 0.15 ? '#a0ffff' : '#50c8e8';
  ctx.fillRect(bx, by, Math.round(bw * (1 - pct)), 3);

  // Border
  ctx.strokeStyle = '#1a3040';
  ctx.lineWidth   = 0.5;
  ctx.strokeRect(bx, by, Math.round(bw), 3);
}
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
function drawTeslaBeam() {
  if (!teslaBeamFx) return;
  const a = Math.max(0, teslaBeamFx.t / 0.12);

  ctx.save();
  ctx.globalAlpha = 0.35 * a;
  ctx.strokeStyle = '#60e8ff';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(teslaBeamFx.x, teslaBeamFx.y0);
  ctx.lineTo(teslaBeamFx.x, teslaBeamFx.y1);
  ctx.stroke();

  ctx.globalAlpha = 0.92 * a;
  ctx.strokeStyle = '#d8ffff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(teslaBeamFx.x, teslaBeamFx.y0);
  ctx.lineTo(teslaBeamFx.x, teslaBeamFx.y1);
  ctx.stroke();
  ctx.restore();
}

function drawPlayerBullet(b) {
  const px = Math.round(b.x), py = Math.round(b.y);

  if (b.type === 'homing') {
    const r = 6;
    ctx.fillStyle = '#7cc0ff';
    ctx.beginPath();
    ctx.arc(px, py - 6, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,235,255,0.85)';
    ctx.beginPath();
    ctx.arc(px + 1, py - 9, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (b.type === 'ricochet') {
    const r = b.drawR || 7;
    ctx.fillStyle = '#e0b060';
    ctx.beginPath();
    ctx.arc(px, py - 6, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,160,0.80)';
    ctx.beginPath();
    ctx.arc(px + 1, py - 9, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

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

  // Tesla beam
  drawTeslaBeam();

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
  drawTeslaCooldownBar();

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
  updateXPBar();
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
  // Guard: landmarks must be a full 21-point array with finite coordinates.
  // A malformed/partial frame (e.g. MediaPipe returning NaN or undefined for
  // a partially-detected hand) would otherwise push NaN into player.tx/ty,
  // which collapses to 0 after Math.max/min and teleports the ship top-left.
  if (!Array.isArray(landmarks) || landmarks.length < 21) return;
  const tip = landmarks[8];
  if (!tip || !isFinite(tip.x) || !isFinite(tip.y)) return;

  landmarks.forEach((lm, i) => handTargetPos[i].copy(lmToVec3(lm)));
  hasHand = true;
  handJoints.forEach(m => m.visible = true);
  handBones.forEach(m  => m.visible = true);

  // Use INDEX_FINGER_TIP (landmark 8) for ship/cursor control
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
const kbShortcutsEl = document.getElementById('kb-shortcuts');
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
loadPersist();
updateXPBar();
connectWS();
initGame();
kbShortcutsEl.style.display = 'flex';   // always visible

// Skill tree close button
document.getElementById('st-close-btn').addEventListener('click', () => {
  hideSkillTree();
  applySkillBonuses();   // re-apply in case new skills were bought
  showWeaponSelect();
});

requestAnimationFrame(loop);