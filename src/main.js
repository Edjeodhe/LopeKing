// 로프킹 웹 프로토: 픽셀 횡스크롤 액션 (산나비·카타나 제로풍). 480×270 내부 해상도, 정수배 확대.
// 흐름: 입력 → 고정 스텝(120Hz) 물리·AI·전투 → 자세 → 리그 굽기 → 그리기
import { input, bindInput, endFrame, hit } from './input.js';
import { World } from './world.js';
import { bakeTiles, makeBackground, drawBackground, drawLamp, drawRing, drawExit, PAL } from './scenery.js';
import { loadActorType, newBakeCanvas, bakeActor, bakeDeath, ACT, deathDone } from './actor.js';
import { Player, TUNE } from './player.js';
import { Enemy, drawEnemyMarks } from './enemies.js';
import * as A from './anim.js';
import { fx, cam, initFx, updateFx, updateFlash, drawFxBack, drawFxFront, drawFlash, decalCanvas, pushSmear, shake, ring, flash, spark, blood, BLOOD } from './fx.js';
import { initGore, updateGore, drawGore, killActor } from './gore.js';
import { sfx } from './sfx.js';
import { loadFont, font } from './font.js';

const W = 480, H = 270, STEP = 1 / 120;
const canvas = document.getElementById('game');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// 화면 맞추기: 정수배로만 키움 (도트가 뭉개지지 않게)
let zoom = 1;
function fit() {
  zoom = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  canvas.style.width = W * zoom + 'px'; canvas.style.height = H * zoom + 'px';
}
addEventListener('resize', fit); fit();
bindInput(canvas, (cx, cy) => { const r = canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H]; });

// ---------- 게임 상태 ----------
const G = {
  world: null, player: null, enemies: [], bullets: [], exits: [],
  time: 0, stop: 0, slow: 0, slowScale: 1, debug: false, clear: false, msg: null,
  sfx,
};
const TYPES = {};
globalThis.__G = G; G.cam = cam;   // 콘솔·자동 확인용
let tilesImg = null, bg = null, levelDef = null, playerLow = newBakeCanvas(), deathT = 0;

async function boot() {
  await loadFont();
  levelDef = await (await fetch('levels/level1.json', { cache: 'no-store' })).json();
  bg = makeBackground(W, H);
  // 진짜 그림(art/<id>/rig.json)이 없으면 임시 그림으로 같은 파이프라인을 돌림
  const [hero, ghoul, gunner] = await Promise.all([
    loadActorType('art/assassin', { colors: 18, keep: [[200, 40, 48]] }),
    loadActorType('art/ghoul', { colors: 14, weapon: 'saber', placeholder: { cloth: '#4a4a3a', clothD: '#2c2c22', clothL: '#6a6a50', skin: '#8a9a88', skinD: '#5a6a5a', accent: '#b8e040' }, tint: [40, 30, 60, 0.08] }),
    loadActorType('art/gunner', { colors: 14, weapon: 'gun', placeholder: { cloth: '#26304a', clothD: '#161c2e', clothL: '#3a4868', metal: '#8a7a50', metalD: '#5a4a30', metalL: '#c8b070', accent: '#b8e040' }, tint: [40, 30, 60, 0.08] }),
  ]);
  TYPES.hero = hero; TYPES.grunt = ghoul; TYPES.gunner = gunner;
  startLevel();
  requestAnimationFrame(frame);
}

function startLevel() {
  const w = new World(levelDef);
  G.world = w; G.enemies = []; G.bullets = []; G.exits = []; G.clear = false; G.msg = null;
  tilesImg = bakeTiles(w);
  initFx(w); initGore(w);
  for (const s of w.spawns) {
    if (s.kind === 'player') G.player = new Player(s.x, s.y);
    else if (s.kind === 'grunt' || s.kind === 'gunner') G.enemies.push(new Enemy(s.kind, TYPES[s.kind], s.x, s.y));
    else if (s.kind === 'exit') G.exits.push(s);
  }
  cam.x = G.player.x - W / 2; cam.y = G.player.y - H / 2;
  deathT = 0;
}

// ---------- 로프가 닿는 것 찾기 ----------
// (ox, oy)에서 방향 (dx, dy)로 from ~ d 구간: 적(살아 있는) · 갈고리 고리 · 벽 중 가장 가까운 것
G.ropeTarget = (ox, oy, dx, dy, d, from = 0) => {
  let best = null;
  const take = h => { if (h && (!best || h.d < best.d)) best = h; };
  const wall = G.world.ray(ox, oy, dx, dy, d);
  if (wall) take({ ...wall });
  for (const e of G.enemies) {
    if (e.dead) continue;
    // 선분 - 상자 (조금 넉넉히)
    const cx = e.x, cy = e.y - e.h / 2, hw = e.w / 2 + 5, hh = e.h / 2 + 5;
    const t = segBox(ox, oy, dx, dy, cx - hw, cy - hh, cx + hw, cy + hh);
    if (t !== null && t <= d && t >= from - 12 && (!wall || t < wall.d)) take({ x: ox + dx * t, y: oy + dy * t, d: t, enemy: e });
  }
  for (const r of G.world.rings) {
    const t = (r.x - ox) * dx + (r.y - oy) * dy;
    if (t < 0 || t > d + 6) continue;
    const px = ox + dx * t - r.x, py = oy + dy * t - r.y;
    if (px * px + py * py < 64 && (!wall || t < wall.d)) take({ x: r.x, y: r.y, d: Math.min(t, d), hook: true, ring: r });
  }
  return best;
};
function segBox(ox, oy, dx, dy, x0, y0, x1, y1) {
  let t0 = 0, t1 = Infinity;
  for (const [o, dd, a, b] of [[ox, dx, x0, x1], [oy, dy, y0, y1]]) {
    if (Math.abs(dd) < 1e-9) { if (o < a || o > b) return null; continue; }
    let ta = (a - o) / dd, tb = (b - o) / dd;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

// ---------- 전투 ----------
// 주인공 베기: 시작할 때 등록, 칼이 지나가는 동안(active) 부채꼴 판정. exec = 로프로 끌려가 처형하는 적
G.onAttack = (p, exec) => {
  const a = p.aimRad;
  G.atk = { id: p.atkId, ang: a, exec, hit: new Set() };
  sfx('slash');
  if (exec) {
    // 처형: 끌려간 적은 바로 죽음 + 몸을 감싸는 붉은 고리(앞 반은 몸 앞, 뒤 반은 몸 뒤) + 번쩍 + 슬로모션
    const hitInfo = { kind: 'exec', ang: a, power: 1.3 };
    G.killEnemy(exec, hitInfo);
    ring({ x: p.x, y: p.y - 14, rx: 26, ry: 8, life: 0.32, th: 3, a0: Math.PI, dir: p.facing, grow: 0.5 });
    ring({ x: p.x, y: p.y - 14, rx: 16, ry: 5, life: 0.22, th: 2, a0: 0, dir: -p.facing, grow: 0.8, cols: ['#ffffff', '#ffe8e0', '#ff9090', '#b02030'] });
    flash('#ffffff', 0.05);
    G.stop = 0.1; G.slow = 0.35; G.slowScale = 0.3;
    shake(5, Math.cos(a) * 4, Math.sin(a) * 4);
    sfx('exec');
  }
};
function stepCombat(dt) {
  const p = G.player, at = G.atk;
  if (!at || p.atkT < 0 || at.id !== p.atkId) return;
  const t = p.atkT;
  if (t < A.SLASH.wind - 0.01 || t > A.SLASH.wind + A.SLASH.act + 0.03) return;
  const R = at.exec ? 46 : 36, half = 1.35;
  const ox = p.x, oy = p.cy;
  const inArc = (x, y, pad = 0) => {
    const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
    if (d > R + pad) return false;
    if (d < 10) return true;
    let da = Math.atan2(dy, dx) - at.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    return Math.abs(da) < half;
  };
  for (const e of G.enemies) {
    if (e.dead || at.hit.has(e)) continue;
    if (inArc(e.x, e.cy, 6) || inArc(e.x, e.y - 4, 6) || inArc(e.x, e.y - e.h + 2, 6)) {
      at.hit.add(e);
      const hitInfo = { kind: 'slash', ang: at.ang, power: 1 };
      const contact = [(ox + e.x) / 2, (oy + e.cy) / 2];
      spark(contact[0], contact[1], at.ang, 8, { cols: ['#ffffff', '#ffe0e0', '#ff6060'], v: 220, life: 0.14 });
      e.damage(G, 1, hitInfo);
      if (!e.dead) { sfx('hit'); G.stop = Math.max(G.stop, 0.06); shake(2.5, Math.cos(at.ang) * 2, Math.sin(at.ang) * 2); }
    }
  }
  // 총알 되받아치기 (카타나 제로식)
  for (const b of G.bullets) {
    if (b.owner !== 'enemy' || !inArc(b.x, b.y, 8)) continue;
    const sp = 460;
    b.owner = 'player'; b.vx = Math.cos(at.ang) * sp; b.vy = Math.sin(at.ang) * sp; b.t = 0;
    spark(b.x, b.y, at.ang, 10, { cols: ['#ffffff', '#fff0a0', '#80e0ff'], v: 200, life: 0.15 });
    G.stop = Math.max(G.stop, 0.08); shake(2); sfx('deflect');
  }
}
G.killEnemy = (e, hit) => {
  if (e.dead) return;
  e.dead = true;
  const kind = killActor(e, hit);
  G.stop = Math.max(G.stop, hit.kind === 'exec' ? 0.1 : 0.07);
  shake(hit.kind === 'exec' ? 5 : 3.5, Math.cos(hit.ang || 0) * 3, Math.sin(hit.ang || 0) * 3);
  sfx('gore');
  if (kind === 'bisect' || kind === 'burst') { G.slow = Math.max(G.slow, 0.18); G.slowScale = 0.35; }
};
G.onPlayerHurt = (p, from) => {
  sfx('hurt');
  flash('#d02030', 0.06);
  shake(4);
  G.stop = 0.08;
  blood(p.x, p.cy, Math.atan2(p.cy - (from.cy ?? from.y), p.x - from.x), 12, 1);
};

function stepBullets(dt) {
  const w = G.world, p = G.player;
  for (const b of G.bullets) {
    b.t += dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    if (w.solidPx(nx, ny) || b.t > 3) { b.dead = true; spark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 4, { cols: ['#ffd080', '#8a8fa0'], v: 80 }); continue; }
    b.x = nx; b.y = ny;
    if (b.owner === 'enemy' && !p.dead && Math.abs(b.x - p.x) < 5 && b.y > p.y - p.h && b.y < p.y) {
      if (p.hurt(G, 1, { x: b.x - b.vx, y: b.y })) b.dead = true;
    }
    if (b.owner === 'player') for (const e of G.enemies) {
      if (e.dead || Math.abs(b.x - e.x) > 7 || b.y < e.y - e.h || b.y > e.y) continue;
      G.killEnemy(e, { kind: 'bullet', ang: Math.atan2(b.vy, b.vx), power: 1.2 }); b.dead = true; break;
    }
  }
  G.bullets = G.bullets.filter(b => !b.dead);
}

// ---------- 한 스텝 ----------
function step(dt) {
  G.time += dt;
  const p = G.player;
  p.step(dt, G);
  for (const e of G.enemies) e.step(dt, G);
  stepCombat(dt);
  stepBullets(dt);
  updateGore(dt);
  updateFx(dt);
  G.enemies = G.enemies.filter(e => !e.dead);
  if (!G.clear && G.exits.some(x => Math.abs(x.x - p.x) < 12 && Math.abs(x.y - p.y) < 20)) { G.clear = true; G.msg = { text: '지붕길 돌파', t: 0 }; }
}

// ---------- 카메라 ----------
function updateCam(dt) {
  const p = G.player, w = G.world;
  // 마우스 쪽으로 살짝 내다봄
  const lx = Math.max(-70, Math.min(70, (input.mx - W / 2) * 0.28)), ly = Math.max(-40, Math.min(40, (input.my - H / 2) * 0.22));
  const tx = p.x - W / 2 + lx + p.vx * 0.12, ty = p.y - 20 - H / 2 + ly + Math.max(0, p.vy) * 0.08;
  cam.x += (tx - cam.x) * (1 - Math.exp(-dt * 7));
  cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 5));
  cam.x = Math.max(0, Math.min(w.pw - W, cam.x));
  cam.y = Math.max(0, Math.min(w.ph - H, cam.y));
}

// ---------- 그리기 ----------
let acc = 0, last = 0, frameNo = 0, fps = 60, fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, (now - (last || now)) / 1000)); last = now;
}
// 자동 확인용: 화면이 가려져 rAF 가 멈춰도 시간을 직접 진행 (콘솔에서 __G.advance(초))
G.advance = (sec, fn) => { for (let i = 0; i < Math.round(sec * 60); i++) { fn?.(i); tick(1 / 60); } };
function tick(real) {
  fpsAcc += real; fpsN++; if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  frameNo++;
  if (hit('restart')) startLevel();
  if (hit('debug')) G.debug = !G.debug;
  if (hit('full')) (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

  const p = G.player;
  p.readInput([input.mx + Math.round(cam.x), input.my + Math.round(cam.y)]);
  // 타격 멈춤(hitstop) 동안은 시간이 안 흐르고, 슬로모션은 느리게
  let dt = real;
  if (G.stop > 0) { G.stop -= real; dt = 0; }
  else if (G.slow > 0) { G.slow -= real; dt *= G.slowScale; }
  acc += dt;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
  updateCam(real);
  if (dt > 0) { p.animate(dt); for (const e of G.enemies) e.animate(dt); }
  if (G.msg) G.msg.t += real;
  updateFlash(real);
  render(real);
  endFrame();
}

function render(real) {
  const p = G.player, w = G.world;
  const sx = (Math.random() - 0.5) * cam.shake * 2 + cam.kick[0], sy = (Math.random() - 0.5) * cam.shake * 2 + cam.kick[1];
  const cx = Math.round(cam.x + sx), cy = Math.round(cam.y + sy);
  drawBackground(ctx, bg, cam, W, H, w.ph);
  ctx.save();
  ctx.translate(-cx, -cy);
  ctx.drawImage(tilesImg, cx, cy, W, H, cx, cy, W, H);
  ctx.drawImage(decalCanvas(), cx, cy, W, H, cx, cy, W, H);
  for (const l of w.lamps) drawLamp(ctx, l, G.time);
  for (const x of G.exits) drawExit(ctx, x, G.time);
  // 로프 겨냥 미리보기: 지금 쏘면 걸리는 고리 깜빡임
  const prev = !p.dead && !p.rope ? G.ropeTarget(p.cx, p.cy, Math.cos(p.aimRad), Math.sin(p.aimRad), TUNE.hookMax) : null;
  for (const r of w.rings) drawRing(ctx, r, prev?.ring === r, G.time);
  drawFxBack(ctx, G.time);
  drawGore(ctx, frameNo % 2 === 0);

  // 적: 30fps 로만 다시 굽기
  for (const e of G.enemies) {
    if (frameNo % 2 === 0 || !e.baked) { const o = bakeActor(e.type, e.pose, e.facing, e.low, e.flashT > 0); e.sock = o.sock; e.baked = true; }
    ctx.drawImage(e.low, Math.round(e.x - ACT.AX), Math.round(e.y - ACT.AY));
  }
  // 로프: 로프 쏘는 손(먼 팔)에서 갈고리까지 — 몸 뒤에 그림
  drawRope(p);
  // 주인공
  const px = Math.round(p.x - ACT.AX), py = Math.round(p.y - ACT.AY);
  if (p.dead) {
    deathT += real * (G.slow > 0 ? G.slowScale : 1);
    if (TYPES.hero.death) bakeDeath(TYPES.hero, deathT, p.facing, playerLow);
    else bakeActor(TYPES.hero, { ...A.HURT, rot: Math.min(85, deathT * 300), rotDrop: true }, p.facing, playerLow);
  } else {
    const blink = p.inv > 0 && p.hurtT <= 0 && Math.floor(G.time * 20) % 2;
    const o = bakeActor(TYPES.hero, p.pose, p.drawFacing ?? p.facing, playerLow, p.hurtT > 0.18);
    p.sock = {}; for (const k in o.sock) p.sock[k] = [o.sock[k][0] + px, o.sock[k][1] + py];
    sampleBlade(p, o.blade, px, py);
    if (blink) playerLow.__skip = true; else playerLow.__skip = false;
  }
  if (!playerLow.__skip) ctx.drawImage(playerLow, px, py);
  for (const e of G.enemies) drawEnemyMarks(ctx, e, G.time);
  drawFxFront(ctx, G.time);
  for (const b of G.bullets) drawBullet(b);
  if (G.debug) drawDebug();
  ctx.restore();

  drawFlash(ctx, W, H);
  drawHud(p, prev);
}

// 칼끝 궤적 기록: 휘두르기 직전 자리 하나를 쥐고 있다가 내리치는 첫 프레임에 그 자리부터 이음
function sampleBlade(p, bl, px, py) {
  if (!bl || p.atkT < 0) { p.preBlade = null; return; }
  const q = { g: [bl.g[0] + px, bl.g[1] + py], t: [bl.t[0] + px, bl.t[1] + py], at: G.time, id: p.atkId, dir: p.atkDir * (p.drawFacing ?? p.facing) };
  if (G.atk?.exec && G.atk.id === p.atkId) { q.cols = ['#ffffff', '#ffe8e0', '#ff5050', '#901020']; q.life = 0.2; q.inner = 0.1; q.reach = 1.25; }
  if (p.atkT < A.SLASH.wind) { p.preBlade = q; return; }
  if (p.atkT > A.SLASH.wind + A.SLASH.act + 0.05) return;
  if (p.preBlade?.id === p.atkId) { pushSmear({ ...p.preBlade, at: G.time }); p.preBlade = null; }
  pushSmear(q);
}

function drawRope(p) {
  const r = p.rope;
  if (!r) return;
  const hand = p.sock?.offHand || [p.x, p.cy];
  const hx = r.state === 'fly' ? r.x : r.hx, hy = r.state === 'fly' ? r.y : r.hy;
  const d = Math.hypot(hx - hand[0], hy - hand[1]);
  // 느슨하면 아래로 처짐 (매달려 팽팽하면 곧게)
  const slack = r.state === 'hook' ? Math.max(0, r.len - d) * 0.6 : r.state === 'fly' ? 4 : 0;
  const n = Math.max(2, Math.ceil(d));
  let lx = null, ly = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.round(hand[0] + (hx - hand[0]) * t), y = Math.round(hand[1] + (hy - hand[1]) * t + Math.sin(t * Math.PI) * slack);
    if (x === lx && y === ly) continue;
    ctx.fillStyle = PAL.ink; ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillStyle = i % 4 < 2 ? '#d8c8a0' : '#a08a60'; ctx.fillRect(x, y, 1, 1);
    lx = x; ly = y;
  }
  // 갈고리 머리
  const a = Math.atan2(hy - hand[1], hx - hand[0]);
  ctx.fillStyle = '#c8ccd8';
  for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(hx - Math.cos(a) * k), Math.round(hy - Math.sin(a) * k), 1, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(hx), Math.round(hy), 1, 1);
  ctx.fillStyle = '#8a8fa0';
  ctx.fillRect(Math.round(hx - Math.cos(a + 0.9) * 3), Math.round(hy - Math.sin(a + 0.9) * 3), 1, 1);
  ctx.fillRect(Math.round(hx - Math.cos(a - 0.9) * 3), Math.round(hy - Math.sin(a - 0.9) * 3), 1, 1);
}

function drawBullet(b) {
  const a = Math.atan2(b.vy, b.vx), mine = b.owner === 'player';
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k === 0 ? '#ffffff' : k < 3 ? (mine ? '#80e0ff' : '#ffd060') : (mine ? '#3080c0' : '#c06020');
    ctx.fillRect(Math.round(b.x - Math.cos(a) * k), Math.round(b.y - Math.sin(a) * k), 1, 1);
  }
}

function drawDebug() {
  const p = G.player;
  ctx.strokeStyle = '#0f0'; ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(p.x - p.w / 2) + 0.5, Math.round(p.y - p.h) + 0.5, p.w, p.h);
  for (const e of G.enemies) { ctx.strokeStyle = '#f80'; ctx.strokeRect(Math.round(e.x - e.w / 2) + 0.5, Math.round(e.y - e.h) + 0.5, e.w, e.h); }
  for (const k in p.sock || {}) { ctx.fillStyle = '#0ff'; ctx.fillRect(Math.round(p.sock[k][0]), Math.round(p.sock[k][1]), 1, 1); }
}

// ---------- HUD ----------
function drawHud(p, prev) {
  // 체력: 붉은 마름모
  for (let i = 0; i < TUNE.hp; i++) {
    const x = 10 + i * 11, y = 10, on = i < p.hp;
    ctx.fillStyle = PAL.ink;
    for (let k = -4; k <= 4; k++) { const w = 5 - Math.abs(k); ctx.fillRect(x - w, y + k, w * 2 + 1, 1); }
    ctx.fillStyle = on ? BLOOD[3] : '#2a2236';
    for (let k = -3; k <= 3; k++) { const w = 4 - Math.abs(k); ctx.fillRect(x - w + 1, y + k, w * 2 - 1, 1); }
    if (on) { ctx.fillStyle = '#ffb0a0'; ctx.fillRect(x - 1, y - 2, 1, 1); }
  }
  // 조준점: 걸리는 곳이면 색이 바뀜 (흰 = 벽·고리, 붉음 = 적 처형, 회색 = 안 걸림)
  const mx = Math.round(input.mx), my = Math.round(input.my);
  const col = !prev ? '#6a6684' : prev.enemy ? '#ff4040' : prev.hook ? '#ffffff' : '#8a7a7a';
  ctx.fillStyle = PAL.ink;
  for (const [a, b] of [[-4, 0], [-3, 0], [3, 0], [4, 0], [0, -4], [0, -3], [0, 3], [0, 4]]) ctx.fillRect(mx + a + 1, my + b + 1, 1, 1);
  ctx.fillStyle = col;
  for (const [a, b] of [[-4, 0], [-3, 0], [3, 0], [4, 0], [0, -4], [0, -3], [0, 3], [0, 4]]) ctx.fillRect(mx + a, my + b, 1, 1);
  if (prev?.enemy && Math.floor(G.time * 10) % 2) { ctx.fillRect(mx - 1, my - 1, 3, 3); }

  ctx.font = font(16); ctx.textBaseline = 'top';
  const text = (s, x, y, c = '#f2e8d0', align = 'left') => {
    ctx.textAlign = align;
    ctx.fillStyle = PAL.ink; ctx.fillText(s, x + 1, y + 1);
    ctx.fillStyle = c; ctx.fillText(s, x, y);
  };
  if (G.time < 12 && !p.dead) { text('A/D 이동 · Space 점프 · Shift 대시', W / 2, H - 40, '#c9c1d4', 'center'); text('좌클릭 베기 · 우클릭(E) 로프', W / 2, H - 22, '#c9c1d4', 'center'); }
  else if (p.rope?.state === 'hook' && G.time < 60) { text('W/S 감기 · A/D 흔들기 · Space 놓기', W / 2, H - 40, '#c9c1d4', 'center'); text('Shift 갈고리로 날아가기', W / 2, H - 22, '#c9c1d4', 'center'); }
  if (p.dead && deathT > 1) text('쓰러졌다 — R 다시', W / 2, H / 2 - 8, BLOOD[3], 'center');
  if (G.msg) text(G.msg.text, W / 2, H / 2 - 30, '#f7cf6d', 'center');
  if (G.debug) text(`${fps}fps 적 ${G.enemies.length}`, W - 4, 4, '#8f8', 'right');
}

boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88">${e.stack}</pre>`); });
