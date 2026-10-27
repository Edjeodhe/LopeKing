// 로프킹 웹 프로토: 픽셀 횡스크롤 액션 (산나비·카타나 제로풍). 480×270 내부 해상도, 정수배 확대.
// 흐름: 입력 → 고정 스텝(120Hz) 물리·AI·전투 → 자세 → 리그 굽기 → 그리기
import { input, bindInput, endFrame, hit } from './input.js';
import { World } from './world.js';
import { bakeTiles, makeBackground, drawBackground, drawLamp, drawRing, drawExit, drawCheck, drawGates, setTheme, PAL } from './scenery.js';
import { loadActorType, newBakeCanvas, bakeActor, bakeDeath, ACT, deathDone } from './actor.js';
import { Player, TUNE } from './player.js';
import { Enemy, drawEnemyMarks } from './enemies.js';
import { Boss, drawBossMarks, stepHazards, drawHazards } from './boss.js';
import * as A from './anim.js';
import { fx, cam, initFx, updateFx, updateFlash, cutLine, speedLine, dust, drawFxBack, drawFxFront, drawFlash, decalCanvas, pushSmear, shake, ring, flash, spark, blood, BLOOD } from './fx.js';
import { initGore, updateGore, drawGore, killActor } from './gore.js';
import { sfx } from './sfx.js';
import { applyLight } from './light.js';
import { startMusic, setMood, toggleMute } from './music.js';
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
  world: null, player: null, enemies: [], bullets: [], exits: [], flares: [], hazards: [], checks: [], boss: null,
  time: 0, stop: 0, slow: 0, slowScale: 1, debug: false, clear: false, msg: null,
  mode: 'title',          // title · play · pause · fade(레벨 사이) · end
  level: 0, checkpoint: null, fade: 0, fadeTo: null,
  sfx,
};
// 레벨 순서 (levels/*.json). 마지막 레벨을 깨면 끝 화면
const LEVELS = ['level1', 'level2'];
const levelDefs = {};
const TYPES = {};
globalThis.__G = G; G.cam = cam;   // 콘솔·자동 확인용
let tilesImg = null, bg = null, levelDef = null, playerLow = newBakeCanvas(), deathT = 0, titleBg = null;

async function boot() {
  await loadFont();
  await Promise.all(LEVELS.map(async n => { levelDefs[n] = await (await fetch(`levels/${n}.json`, { cache: 'no-store' })).json(); }));
  setTheme('night'); titleBg = makeBackground(W, H);
  // 진짜 그림(art/<id>/rig.json)이 없으면 임시 그림으로 같은 파이프라인을 돌림
  const [hero, ghoul, gunner, boss] = await Promise.all([
    loadActorType('art/assassin', { colors: 18, keep: [[200, 40, 48]] }),
    loadActorType('art/ghoul', { colors: 14, weapon: 'saber', placeholder: { cloth: '#4a4a3a', clothD: '#2c2c22', clothL: '#6a6a50', skin: '#8a9a88', skinD: '#5a6a5a', accent: '#b8e040' }, tint: [40, 30, 60, 0.08] }),
    loadActorType('art/gunner', { colors: 14, weapon: 'gun', placeholder: { cloth: '#26304a', clothD: '#161c2e', clothL: '#3a4868', metal: '#8a7a50', metalD: '#5a4a30', metalL: '#c8b070', accent: '#b8e040' }, tint: [40, 30, 60, 0.08] }),
    // 보스: 같은 뼈대를 1.9배로 (그림 키 44px → 약 84px)
    loadActorType('art/executioner', { colors: 18, scale: 1.9, weapon: 'saber', placeholder: { cloth: '#5a2028', clothD: '#3a1018', clothL: '#8a3038', skin: '#7a6a80', skinD: '#4a3a50', accent: '#b8e040' }, tint: [40, 30, 60, 0.06] }),
  ]);
  TYPES.hero = hero; TYPES.grunt = ghoul; TYPES.gunner = gunner; TYPES.boss = boss;
  if (new URLSearchParams(location.search).has('level')) { G.mode = 'play'; loadLevel(+new URLSearchParams(location.search).get('level') || 0); }
  else loadLevel(0);   // 타이틀 뒤에도 레벨 1 이 깔려 있음
  startMusic();
  requestAnimationFrame(frame);
}

// 레벨 읽기: 테마(팔레트·배경) → 타일 굽기 → 개체 배치. 체크포인트는 레벨마다 처음부터
function loadLevel(i) {
  G.level = i; levelDef = levelDefs[LEVELS[i]]; G.checkpoint = null;
  setTheme(levelDef.theme); bg = makeBackground(W, H);
  startLevel();
}
function startLevel() {
  const w = new World(levelDef);
  G.world = w; G.enemies = []; G.bullets = []; G.exits = []; G.flares = []; G.hazards = []; G.checks = []; G.boss = null;
  G.clear = false; G.msg = { text: levelDef.name, t: 0, sub: true }; G.levelT = G.time;
  tilesImg = bakeTiles(w);
  initFx(w); initGore(w);
  for (const s of w.spawns) {
    if (s.kind === 'player') G.player = new Player(s.x, s.y);
    else if (s.kind === 'grunt' || s.kind === 'gunner') G.enemies.push(new Enemy(s.kind, TYPES[s.kind], s.x, s.y));
    else if (s.kind === 'exit') G.exits.push(s);
    else if (s.kind === 'check') G.checks.push({ x: s.x, y: s.y, lit: false });
    else if (s.kind === 'boss') {
      const b = new Boss(TYPES.boss, s.x, s.y);
      b.arena = [s.arena[0] * 16, s.arena[1] * 16]; b.trigger = s.trigger * 16;
      G.boss = b; G.enemies.push(b);
    }
  }
  cam.x = G.player.x - W / 2; cam.y = G.player.y - H / 2;
  deathT = 0;
}
// 쓰러지면 마지막 체크포인트에서 다시 (체력 가득, 죽인 적은 그대로). 보스전 중이었으면 보스도 처음 상태로
function respawn() {
  const c = G.checkpoint, old = G.player;
  if (!c) { startLevel(); return; }
  G.player = new Player(c.x, c.y);
  G.player.facing = old.facing;
  G.bullets = []; G.hazards = [];
  const b = G.boss;
  if (b && !b.dead && b.state !== 'sleep') {
    const nb = new Boss(TYPES.boss, b.home[0], b.home[1]);
    nb.arena = b.arena; nb.trigger = b.trigger;
    G.enemies[G.enemies.indexOf(b)] = nb; G.boss = nb;
    G.world.setGates(false);
  }
  deathT = 0;
  cam.x = c.x - W / 2; cam.y = c.y - H / 2;
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
    if (exec.kind === 'boss') exec.damage(G, 4, hitInfo);   // 보스는 처형 대신 큰 한 방 (등 뒤·휘청이면 더 큼)
    else G.killEnemy(exec, hitInfo);
    ring({ x: p.x, y: p.y - 14, rx: 26, ry: 8, life: 0.32, th: 3, a0: Math.PI, dir: p.facing, grow: 0.5 });
    ring({ x: p.x, y: p.y - 14, rx: 16, ry: 5, life: 0.22, th: 2, a0: 0, dir: -p.facing, grow: 0.8, cols: ['#ffffff', '#ffe8e0', '#ff9090', '#b02030'] });
    flash('#ffffff', 0.05);
    G.flares.push({ x: p.x, y: p.cy, r: 110, col: [255, 200, 200], t: 0.3, glow: 0.35 });
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
// 쿠나이 돌진이 지나간 구간(x0,y0 → x1,y1, 가슴 높이)의 적을 벰 — 몸을 던져 관통하며 베는 느낌. 꽂힌 적(target)은 도착해서 처형
G.zipCut = (p, x0, y0, x1, y1, target) => {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (L < 0.01) return;
  const ang = Math.atan2(dy, dx);
  for (const e of G.enemies) {
    if (e.dead || e === target || e.zipHit === p.zipId) continue;
    const hw = e.w / 2 + 6, top = e.y - e.h - 4;
    const t = segBox(x0, y0, dx / L, dy / L, e.x - hw, top, e.x + hw, e.y + 2);
    if (t === null || t > L) continue;
    e.zipHit = p.zipId;
    spark(e.x, e.cy, ang, 10, { cols: ['#ffffff', '#ffd0d0', '#ff4040'], v: 240, life: 0.14 });
    cutLine(e.x - Math.cos(ang) * 30, e.cy - Math.sin(ang) * 30, e.x + Math.cos(ang) * 30, e.cy + Math.sin(ang) * 30);
    e.damage(G, e.kind === 'boss' ? 2 : 99, { kind: 'slash', ang, power: 1.2 });
    G.stop = Math.max(G.stop, 0.05);
  }
  // 돌진 길의 총알도 베어 냄
  for (const b of G.bullets) if (b.owner === 'enemy' && Math.abs((b.x - x0) * dy - (b.y - y0) * dx) / L < 8 && (b.x - x0) * dx + (b.y - y0) * dy >= -4 && (b.x - x0) * dx + (b.y - y0) * dy <= L * L + 4) { b.dead = true; spark(b.x, b.y, ang, 6, { cols: ['#ffffff', '#fff0a0'], v: 120 }); sfx('deflect'); }
};
// 보스 처치: 참수 + 사지 분산, 긴 슬로모션, 문 열림 → 잠시 뒤 레벨 끝
G.killBoss = (b, hit) => {
  if (b.dead) return;
  b.dead = true;
  killActor(b, { ...hit, power: 1.6 }, 'decap');
  G.stop = 0.25; G.slow = 1.4; G.slowScale = 0.25;
  flash('#ffffff', 0.08); shake(10);
  G.flares.push({ x: b.x, y: b.cy, r: 160, col: [255, 210, 200], t: 1.2, glow: 0.4 });
  for (let i = 0; i < 4; i++) blood(b.x, b.cy - 10, -Math.PI / 2 + (i - 1.5) * 0.6, 20, 1.6);
  sfx('exec'); sfx('gore');
  G.world.setGates(false);
  G.bossDownT = 0;
  G.msg = { text: '망나니를 베었다', t: 0 };
};
G.popText = (text, x, y) => fx.texts.push({ text, x, y, t: 0, life: 0.7 });
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
      if (e.dead || Math.abs(b.x - e.x) > e.w / 2 + 2 || b.y < e.y - e.h || b.y > e.y) continue;
      const hit = { kind: 'bullet', ang: Math.atan2(b.vy, b.vx), power: 1.2 };
      if (e.kind === 'boss') e.damage(G, 2, hit); else G.killEnemy(e, hit);
      b.dead = true; break;
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
  stepHazards(G, dt);
  updateGore(dt);
  updateFx(dt);
  for (const f of G.flares) f.t -= dt;
  G.flares = G.flares.filter(f => f.t > 0);
  G.enemies = G.enemies.filter(e => !e.dead);
  // 배경음 분위기: 보스전 · 쫓기는 중 · 평소
  setMood(G.boss && !G.boss.dead && G.boss.state !== 'sleep' ? 'boss' : G.enemies.some(e => e.alert > 0 && !e.dead) ? 'fight' : 'calm');
  // 체크포인트: 지나가면 불이 켜지고 그 자리에서 다시 시작
  for (const c of G.checks) if (!c.lit && !p.dead && Math.abs(c.x - p.x) < 14 && Math.abs(c.y - p.y) < 24) {
    for (const o of G.checks) o.lit = false;
    c.lit = true; G.checkpoint = { x: c.x, y: c.y }; p.hp = Math.max(p.hp, TUNE.hp); sfx('check');
    spark(c.x, c.y - 14, -Math.PI / 2, 10, { cols: ['#ffd080', '#ff8a5a'], v: 70, g: -40, life: 0.5 });
  }
  // 보스 방: 들어서면 문이 닫히고 보스가 깸
  const b = G.boss;
  if (b && b.state === 'sleep' && !p.dead && p.x > b.trigger) {
    b.home = b.home || [b.x, b.y];
    b.wake(G); G.world.setGates(true);
    G.msg = { text: b.name, t: 0, sub: true };
  }
  if (b?.dead && G.bossDownT !== undefined && (G.bossDownT += dt) > 3 && !G.clear) levelClear();
  if (!G.clear && G.exits.some(x => Math.abs(x.x - p.x) < 12 && Math.abs(x.y - p.y) < 20)) levelClear();
}
function levelClear() {
  G.clear = true; G.bossDownT = undefined;
  G.msg = { text: G.level + 1 < LEVELS.length ? '돌파' : '끝 — 플레이해 주셔서 고맙습니다', t: 0 };
  G.fadeTo = G.level + 1 < LEVELS.length ? G.level + 1 : 'end'; G.fade = 0;
  G.mode = 'fade';
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
  if (hit('debug')) G.debug = !G.debug;
  if (hit('mute')) G.muted = toggleMute();
  if (G.mode === 'title') {
    if (input.mPressed[0] || hit('jump')) { G.mode = 'play'; loadLevel(0); G.time = 0; sfx('check'); }
    drawTitle(real); endFrame(); return;
  }
  if (G.mode === 'end') { if (input.mPressed[0] || hit('jump')) { G.mode = 'title'; loadLevel(0); } drawEnd(real); endFrame(); return; }
  if (hit('pause')) G.mode = G.mode === 'pause' ? 'play' : G.mode === 'play' ? 'pause' : G.mode;
  if (hit('restart')) { G.mode = 'play'; G.checkpoint = null; startLevel(); }
  if (G.mode === 'pause') { render(0); drawPause(); endFrame(); return; }
  if (G.mode === 'fade') {
    G.fade += real;
    if (G.fade > 2.2) { if (G.fadeTo === 'end') G.mode = 'end'; else { loadLevel(G.fadeTo); G.mode = 'play'; } G.fade = 0; }
  }
  // 쓰러진 뒤 잠시 뒤 체크포인트에서 다시
  if (G.player.dead && deathT > 1.8) respawn();
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
  for (const c of G.checks) drawCheck(ctx, c, G.time);
  drawGates(ctx, w, G.time);
  // 로프 겨냥 미리보기: 지금 쏘면 걸리는 고리 깜빡임
  const prev = !p.dead && !p.rope ? G.ropeTarget(p.cx, p.cy, Math.cos(p.aimRad), Math.sin(p.aimRad), TUNE.hookMax) : null;
  for (const r of w.rings) drawRing(ctx, r, prev?.ring === r, G.time);
  drawFxBack(ctx, G.time);
  drawGore(ctx, frameNo % 2 === 0);

  // 적: 30fps 로만 다시 굽기
  for (const e of G.enemies) {
    if (frameNo % 2 === 0 || !e.baked) { const o = bakeActor(e.type, e.pose, e.facing, e.low, e.flashT > 0); e.sock = o.sock; e.baked = true; }
    ctx.drawImage(e.low, Math.round(e.x - e.low.ax), Math.round(e.y - e.low.ay));
  }
  drawGhosts(real);
  // 로프: 로프 쏘는 손(먼 팔)에서 쿠나이까지 — 몸 뒤에 그림
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
    if (p.rope?.state === 'zip') pushGhost(playerLow, px, py, 'zip', 0.22);
    else if (p.dashT > 0) pushGhost(playerLow, px, py, 'dash', 0.3);           // 대시는 매 프레임 — 지나간 길 전체에 잔상이 늘어섬
    else if (p.flipT > 0 && frameNo % 2) pushGhost(playerLow, px, py, 'jump', 0.18);
    if (blink) playerLow.__skip = true; else playerLow.__skip = false;
  }
  if (!playerLow.__skip) ctx.drawImage(playerLow, px, py);
  for (const e of G.enemies) if (e.kind === 'boss') drawBossMarks(ctx, e, G.time); else drawEnemyMarks(ctx, e, G.time);
  drawHazards(ctx, G, G.time);
  drawFxFront(ctx, G.time);
  for (const b of G.bullets) drawBullet(b);
  ctx.font = font(16); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of fx.texts) { const y = Math.round(t.y - t.t * 30); ctx.fillStyle = PAL.ink; ctx.fillText(t.text, Math.round(t.x) + 1, y + 1); ctx.fillStyle = '#ffe060'; ctx.fillText(t.text, Math.round(t.x), y); }
  if (G.debug) drawDebug();
  ctx.restore();

  // 조명: 밤 환경색으로 곱하고 등불·주인공·총구·처형 섬광 자리만 밝힘
  const lights = [{ x: p.x, y: p.cy, r: 56, col: [235, 225, 255], k: 0.75 }];
  for (const l of w.lamps) lights.push({ x: l.x, y: l.y + 4, r: 80 + Math.round(Math.sin(G.time * 9 + l.x)) * 2, col: [255, 200, 165], glow: 0.1 });
  for (const x of G.exits) lights.push({ x: x.x + 6, y: x.y - 20, r: 48, col: [255, 170, 150] });
  for (const b of G.bullets) lights.push({ x: b.x, y: b.y, r: 14, col: [255, 220, 150] });
  for (const f of G.flares) lights.push(f);
  if (p.rope && p.rope.state !== 'back') lights.push({ x: p.rope.x, y: p.rope.y, r: 12, col: [255, 140, 140] });
  if (!G.noLight) applyLight(ctx, W, H, { x: cx, y: cy }, G.world.def.ambient || [172, 164, 216], lights);

  drawFlash(ctx, W, H);
  drawHud(p, prev);
  if (G.boss && !G.boss.dead && G.boss.state !== 'sleep') drawBossBar(G.boss);
  if (G.mode === 'fade' && G.fade > 1.2) {
    // 레벨 사이 암전: 가로 줄무늬로 덮음
    const k = Math.min(1, (G.fade - 1.2) / 0.6);
    ctx.fillStyle = '#05040a';
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    if (k >= 1) ctx.fillRect(0, 0, W, H);
  }
}

function textOut(s, x, y, c = '#f2e8d0', align = 'center', size = 16) {
  ctx.font = font(size); ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = PAL.ink; ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = c; ctx.fillText(s, x, y);
}
// 보스 체력: 화면 아래 붉은 띠 + 이름
function drawBossBar(b) {
  const w = 300, x = (W - w) / 2, y = H - 18;
  ctx.fillStyle = PAL.ink; ctx.fillRect(x - 2, y - 2, w + 4, 8);
  ctx.fillStyle = '#2a1018'; ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = b.phase === 2 ? '#ff4040' : BLOOD[3]; ctx.fillRect(x, y, Math.round(w * Math.max(0, b.hp) / b.maxHp), 4);
  ctx.fillStyle = '#ffb0a0'; ctx.fillRect(x, y, Math.round(w * Math.max(0, b.hp) / b.maxHp), 1);
  textOut(b.name, W / 2, y - 20, '#e8d0c8');
}
// 타이틀: 배경 위 이름과 시작 안내
function drawTitle(real) {
  G.time += real;
  drawBackground(ctx, titleBg, { x: G.time * 12, y: 0 }, W, H, H);
  ctx.fillStyle = PAL.ink; ctx.fillRect(0, H - 40, W, 40);
  textOut('로 프 킹', W / 2, 70, '#f2e8d0', 'center', 32);
  textOut('달빛 아래, 붉은 실 하나', W / 2, 112, '#c9a0a0');
  if (Math.floor(G.time * 2) % 2) textOut('클릭 또는 Space 로 시작', W / 2, 170, '#ffffff');
  textOut('좌클릭 베기 · 우클릭 쿠나이 · Shift 대시 · P 일시정지 · M 소리', W / 2, H - 30, '#8a86a0');
}
function drawPause() {
  ctx.fillStyle = '#05040a';
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  textOut('일시정지', W / 2, 90, '#f2e8d0', 'center', 32);
  textOut('P 계속 · R 레벨 처음부터', W / 2, 140, '#c9c1d4');
}
function drawEnd(real) {
  G.time += real;
  ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
  textOut('끝', W / 2, 80, '#f2e8d0', 'center', 32);
  textOut('웹 프로토 — 유니티 이전 전 단계', W / 2, 124, '#c9a0a0');
  if (Math.floor(G.time * 2) % 2) textOut('클릭하면 처음으로', W / 2, 170, '#ffffff');
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

// 붉은 실 + 쿠나이: 실은 로프 쏘는 손(먼 팔)에서 쿠나이까지 — 몸 뒤에 그림
//   팽팽(스윙 중) = 곧은 실선 · 느슨(꽂아만 둠) = 아래로 처진 점선 · 날아감 = 살짝 흔들리는 실선 · 돌진 중 = 점점 짧아지는 실선
function drawRope(p) {
  const r = p.rope;
  if (!r) return;
  const hand = p.sock?.offHand || [p.x, p.cy];
  const hx = r.x, hy = r.y;
  const d = Math.hypot(hx - hand[0], hy - hand[1]);
  const loose = r.state === 'stuck' && !r.tether;
  const slack = loose ? Math.min(26, d * 0.18) : r.state === 'fly' || r.state === 'back' ? Math.sin(G.time * 60) * 2 : 0;
  const n = Math.max(2, Math.ceil(d));
  let lx = null, ly = null;
  for (let i = 0; i <= n; i++) {
    if (loose && i % 3 === 2) continue;   // 점선
    const t = i / n, x = Math.round(hand[0] + (hx - hand[0]) * t), y = Math.round(hand[1] + (hy - hand[1]) * t + Math.sin(t * Math.PI) * slack);
    if (x === lx && y === ly) continue;
    if (!loose) { ctx.fillStyle = PAL.ink; ctx.fillRect(x, y + 1, 1, 1); }
    ctx.fillStyle = r.tether || r.state === 'zip' ? (i % 6 < 3 ? '#ff4a4a' : '#c01c28') : '#d02a34';
    ctx.fillRect(x, y, 1, 1);
    lx = x; ly = y;
  }
  drawKunai(hx, hy, r.state === 'fly' ? Math.atan2(r.dy, r.dx) : Math.atan2(hy - hand[1], hx - hand[0]), r.state === 'stuck');
}
// 쿠나이: 칼날(흰 끝) + 손잡이 고리. stuck 이면 날 반쯤이 박혀 보이게 짧게
function drawKunai(x, y, a, stuck) {
  const c = Math.cos(a), s = Math.sin(a), L = stuck ? 3 : 5;
  const at = (k, w) => [Math.round(x - c * k - s * w), Math.round(y - s * k + c * w)];
  ctx.fillStyle = PAL.ink;
  for (let k = -1; k <= L + 4; k++) { const [X, Y] = at(k, 0); ctx.fillRect(X, Y + 1, 1, 1); }
  for (let k = 0; k <= L; k++) { const [X, Y] = at(k, 0); ctx.fillStyle = k === 0 ? '#ffffff' : '#c8ccd8'; ctx.fillRect(X, Y, 1, 1); if (k === L) { for (const w of [-1, 1]) { const [A1, B1] = at(k, w); ctx.fillStyle = '#8a8fa0'; ctx.fillRect(A1, B1, 1, 1); } } }
  for (let k = L + 1; k <= L + 3; k++) { const [X, Y] = at(k, 0); ctx.fillStyle = '#3a2a2a'; ctx.fillRect(X, Y, 1, 1); }
  const [X, Y] = at(L + 4, 0); ctx.fillStyle = '#c08a3a'; ctx.fillRect(X, Y, 1, 1);
}

// ---------- 잔상 (대시·더블 점프·쿠나이 돌진) ----------
// 지금 구운 주인공 그림을 실루엣으로 떠서 그 자리에 남김. 색 3단(밝음 → 본색 → 어둠)을 미리 떠 두고 나이 들수록 어두운 쪽으로,
// 끝물은 체크무늬로 깜빡이며 사라짐 (반투명 없이 도트 결 유지)
const ghosts = [];
const GHOST_COLS = { dash: ['#e8f0ff', '#7a8cff', '#3a3a8a'], zip: ['#ffffff', '#ff4652', '#7a1020'], jump: ['#fff4d8', '#ffb050', '#8a4a20'] };
function tinted(low, col) {
  const c = document.createElement('canvas'); c.width = low.width; c.height = low.height;
  const g = c.getContext('2d');
  g.drawImage(low, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function pushGhost(low, x, y, kind = 'dash', life = 0.26) {
  ghosts.push({ cs: GHOST_COLS[kind].map(col => tinted(low, col)), x, y, t: 0, life });
  if (ghosts.length > 28) ghosts.shift();
}
function drawGhosts(real) {
  for (const g of ghosts) g.t += real;
  for (let i = ghosts.length - 1; i >= 0; i--) if (ghosts[i].t >= ghosts[i].life) ghosts.splice(i, 1);
  for (const g of ghosts) {
    const k = g.t / g.life;
    if (k > 0.6 && (frameNo + Math.round(g.x)) % 2) continue;
    ctx.drawImage(g.cs[k < 0.18 ? 0 : k < 0.5 ? 1 : 2], g.x, g.y);
  }
}
// 대시: 시작 자리에 밝은 잔상 + 뒤로 터지는 바람 줄기 · 더블 점프: 발밑 고리(앞 반·뒤 반) + 아래로 튀는 불티
G.onDash = p => {
  const [ux, uy] = p.dashDir;
  for (let i = 0; i < 8; i++) speedLine(p.x - ux * (6 + i * 4), p.y - 4 - Math.random() * 22, -ux, -uy, 18 + Math.random() * 14);
  spark(p.x, p.y - 12, Math.atan2(-uy, -ux), 8, { cols: ['#ffffff', '#a0b0ff'], v: 160, g: 0, life: 0.16, drag: 6 });
  shake(1.5, -ux * 2, -uy * 2);
};
G.onDoubleJump = p => {
  ring({ x: p.x, y: p.y + 1, rx: 14, ry: 4, life: 0.28, th: 2, a0: 0, dir: 1, grow: 1.2, cols: ['#ffffff', '#fff0c0', '#ffb050', '#8a4a20'] });
  spark(p.x, p.y, Math.PI / 2, 10, { cols: ['#ffffff', '#ffd080'], v: 120, g: 200, spread: 1.6, life: 0.22 });
  dust(p.x - 3, p.y, -1, 3); dust(p.x + 3, p.y, 1, 3);
};

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
  const help = G.level === 0 && G.time - (G.levelT || 0) < 12 && !G.boss;
  if (help && !p.dead) { text('A/D 이동 · Space 점프 · Shift 대시 · 좌클릭 베기', W / 2, H - 40, '#c9c1d4', 'center'); text('우클릭 쿠나이 (톡: 꽂기 · 꾹: 스윙)', W / 2, H - 22, '#c9c1d4', 'center'); }
  else if (p.rope?.tether && G.level === 0 && !G.boss) { text('W/S 감기 · A/D 흔들기 · Space 놓기', W / 2, H - 40, '#c9c1d4', 'center'); text('우클릭 다시(Shift) = 쿠나이로 돌진', W / 2, H - 22, '#c9c1d4', 'center'); }
  else if (p.rope?.state === 'stuck' && G.level === 0) text('우클릭 다시(Shift) = 쿠나이로 돌진', W / 2, H - 22, '#c9c1d4', 'center');
  if (p.dead && deathT > 0.8) text('쓰러졌다', W / 2, H / 2 - 8, BLOOD[3], 'center');
  if (G.msg && (G.msg.t < 2.8 || G.clear)) text(G.msg.text, W / 2, G.msg.sub ? 24 : H / 2 - 30, G.msg.sub ? '#e8e0f0' : '#f7cf6d', 'center');
  if (G.debug) text(`${fps}fps 적 ${G.enemies.length}`, W - 4, 4, '#8f8', 'right');
}

boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88">${e.stack}</pre>`); });
