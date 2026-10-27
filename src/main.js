// 로프킹 웹 프로토: 픽셀 횡스크롤 액션 (산나비·카타나 제로풍). 480×270 내부 해상도, 정수배 확대.
// 흐름: 입력 → 고정 스텝(120Hz) 물리·AI·전투 → 자세 → 리그 굽기 → 그리기
import { input, bindInput, endFrame, hit } from './input.js';
import { World } from './world.js';
import { bakeTiles, makeBackground, drawBackground, drawLamp, drawRing, drawExit, drawCheck, drawGates, setTheme, PAL } from './scenery.js';
import { loadActorType, newBakeCanvas, bakeActor, bakeDeath, bakeFrame, ACT, deathDone } from './actor.js';
import { Player, TUNE } from './player.js';
import { Enemy, drawEnemyMarks } from './enemies.js';
import { Boss, drawBossMarks, stepHazards, drawHazards } from './boss.js';
import * as A from './anim.js';
import { fx, cam, initFx, updateFx, updateFlash, cutLine, dust, drawFxBack, drawFxFront, drawFxGlow, fxLights, fadeSlashFx, popSlashFx, sweepArc, pushGhost, speedLine, drawFlash, decalCanvas, shake, ring, flash, spark, blood, BLOOD, slashFx, loadSlashFx } from './fx.js';
import { initGore, updateGore, drawGore, killActor } from './gore.js';
import { stepSteam, drawSteam } from './steam.js';
import { sfx } from './sfx.js';
import { applyLight } from './light.js';
import { startMusic, setMood, toggleMute } from './music.js';
import { loadFont, font } from './font.js';

const W = 480, H = 270, STEP = 1 / 120;
const AMBIENT = [96, 90, 150];   // 밤 환경색 (레벨에 ambient 가 없을 때). 어둡게 깔고 빛·이펙트 자리만 밝혀 명암을 또렷하게
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
  await Promise.all([loadFont(), loadSlashFx()]);
  await Promise.all(LEVELS.map(async n => { levelDefs[n] = await (await fetch(`levels/${n}.json`, { cache: 'no-store' })).json(); }));
  setTheme('night'); titleBg = makeBackground(W, H);
  // 진짜 그림(art/<id>/rig.json)이 없으면 임시 그림으로 같은 파이프라인을 돌림
  const [hero, ghoul, gunner, boss] = await Promise.all([
    // 주인공 = 가면 폼. 기본 폼 도깨비 (예전 삿갓 암살자 그림은 art/assassin 에 남겨 둠). keep = 팔레트에 꼭 남길 색 (진홍·금테·가면 눈빛)
    loadActorType('art/dokkaebi', { colors: 18, keep: [[200, 32, 40], [222, 172, 64], [255, 120, 40]] }),
    loadActorType('art/ghoul', { colors: 14, weapon: 'saber', placeholder: { cloth: '#4a4a3a', clothD: '#2c2c22', clothL: '#6a6a50', skin: '#8a9a88', skinD: '#5a6a5a', accent: '#b8e040' }, tint: [40, 30, 60, 0.08] }),
    loadActorType('art/gunner', { colors: 14, weapon: 'gun', placeholder: { cloth: '#26304a', clothD: '#161c2e', clothL: '#3a4868', metal: '#8a7a50', metalD: '#5a4a30', metalL: '#c8b070', accent: '#b8e040' }, tint: [40, 30, 60, 0.08] }),
    // 보스: 거대 도깨비, 같은 뼈대를 1.9배로 (그림 키 44px → 약 84px). keep = 눈빛 (예전 망나니 구울은 art/executioner)
    loadActorType('art/boss_dokkaebi', { colors: 18, keep: [[190, 230, 40]], scale: 1.9, weapon: 'saber', placeholder: { cloth: '#5a2028', clothD: '#3a1018', clothL: '#8a3038', skin: '#7a6a80', skinD: '#4a3a50', accent: '#b8e040' }, tint: [40, 30, 60, 0.06] }),
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

// ---------- 쿠나이 조준 보정 ----------
// 겨눈 줄에서 적 가슴·갈고리 고리까지의 옆 거리가 너그러운 범위(적 16px · 고리 20px, 멀수록 조금 더) 안이고, 그 사이에 벽이 없으면
// 그것을 겨눈 것으로 봄. 여럿이면 줄에 가장 가까운 것. 돌려주는 값 = 그 자리로 가는 방향 (없으면 null)
G.ropeAssist = (ox, oy, dx, dy) => {
  let best = null, bestPerp = Infinity;
  const consider = (tx, ty, tol0) => {
    const ex = tx - ox, ey = ty - oy, t = ex * dx + ey * dy;
    if (t < 6 || t > TUNE.hookMax + 8) return;
    const perp = Math.abs(ex * dy - ey * dx);
    if (perp > tol0 + t * 0.06 || perp >= bestPerp) return;
    const L = Math.hypot(ex, ey);
    if (G.world.ray(ox, oy, ex / L, ey / L, L - 4)) return;   // 벽 너머는 안 됨
    best = [ex / L, ey / L]; bestPerp = perp;
  };
  for (const e of G.enemies) if (!e.dead) consider(e.x, e.y - e.h / 2, 16);
  for (const r of G.world.rings) consider(r.x, r.y, 20);
  return best;
};

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
    const cx = e.x, cy = e.y - e.h / 2, hw = e.w / 2 + 10, hh = e.h / 2 + 8;   // 쿠나이는 몸보다 넉넉히 맞음
    const t = segBox(ox, oy, dx, dy, cx - hw, cy - hh, cx + hw, cy + hh);
    if (t !== null && t <= d && t >= from - 12 && (!wall || t < wall.d)) take({ x: ox + dx * t, y: oy + dy * t, d: t, enemy: e });
  }
  for (const r of G.world.rings) {
    const t = (r.x - ox) * dx + (r.y - oy) * dy;
    if (t < 0 || t > d + 6) continue;
    const px = ox + dx * t - r.x, py = oy + dy * t - r.y;
    if (px * px + py * py < 13 * 13 && (!wall || t < wall.d)) take({ x: r.x, y: r.y, d: Math.min(t, d), hook: true, ring: r });   // 고리는 넉넉히 (반지름 13px)
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
// 주인공 베기: 시작할 때 등록, 칼이 지나가는 동안(active) 판정. exec = 로프로 끌려가 처형하는 적
// 콤보 타마다 판정 모양이 다름: 가로 베기 = 겨눈 쪽으로 납작한 타원 · 올려 베기 = 부채꼴 · 회전 = 몸 둘레 타원 + 끝에 앞쪽 큰 부채꼴
G.onAttack = (p, exec) => {
  const a = p.aimRad;
  G.atk = { id: p.atkId, ang: a, exec, hit: new Set(), combo: p.combo, move: p.move, fx: 0 };
  fadeSlashFx();
  sfx(exec ? 'slash' : ['sweep', 'sweep', 'slash', 'spin'][p.combo]);
  if (exec) {
    // 처형: 끌려간 적은 바로 죽음 + 몸을 감싸는 붉은 고리(앞 반은 몸 앞, 뒤 반은 몸 뒤) + 번쩍 + 슬로모션
    const hitInfo = { kind: 'exec', ang: a, power: 1.3 };
    if (exec.kind === 'boss') exec.damage(G, 4, hitInfo);   // 보스는 처형 대신 큰 한 방 (등 뒤·휘청이면 더 큼)
    else G.killEnemy(exec, hitInfo);
    // 칼 궤적: 3타와 같은 세운 원 띠를 휘두름 전체로, 처음부터 다 그어진 채 (처형은 칼질 한가운데부터 시작해 칼끝 궤적이 부채꼴 조각으로 잘려 보였음)
    const D = Math.PI / 180;
    sweepArc({ follow: p, y: -19, rx: 36, ry: 36, f: p.facing, vert: true, th: 11, a0: (205 - p.aim) * D, a1: (-5 - p.aim) * D, dur: 0.05, life: 0.34, t: 0.05,
      cols: ['#ffffff', '#ffe8e0', '#ff5050', '#901020'] });
    ring({ x: p.x, y: p.y - 14, rx: 26, ry: 8, life: 0.32, th: 3, a0: Math.PI, dir: p.facing, grow: 0.5 });
    ring({ x: p.x, y: p.y - 14, rx: 16, ry: 5, life: 0.22, th: 2, a0: 0, dir: -p.facing, grow: 0.8, cols: ['#ffffff', '#ffe8e0', '#ff9090', '#b02030'] });
    flash('#ffffff', 0.05);
    G.flares.push({ x: p.x, y: p.cy, r: 110, col: [255, 200, 200], t: 0.3, glow: 0.35 });
    G.stop = 0.1; G.slow = 0.35; G.slowScale = 0.3;
    shake(5, Math.cos(a) * 4, Math.sin(a) * 4);
    sfx('exec');
  }
};
// 콤보 이펙트: 칼이 휘둘리기 시작하는 순간에 띄움. 1·2타·회전 = 칼끝 타원을 따라 그어지는 두꺼운 띠(fx.js sweepArc, 겨눈 만큼 기울임 ±45°),
// 4타 끝 = 큰 초승달 그림(fx_slash.png 줄 2)
function comboFx(p, at, t) {
  const f = p.facing, a = at.ang, m = at.move, ca = Math.cos(a), sa = Math.sin(a);
  const tilt = Math.max(-45, Math.min(45, p.aim - 90)) * Math.PI / 180 * -f;
  if (at.fx === 0 && t >= m.wind - 0.01) {   // 판정 창과 같이 시작 → 타격 멈춤 화면에 이펙트가 찍혀 있게
    at.fx = 1;
    // 1타: 몸 뒤 → 가까운 쪽 → 앞 → 먼 쪽 · 2타: 거꾸로 되돌림 (각도는 anim.js sweep · sweepBack 의 칼끝 phi 와 같음)
    const D = Math.PI / 180, arc = { follow: p, x: ca * 10, y: -20 + sa * 10, rx: 56, ry: 17, tilt, f, dur: m.act, life: m.act + 0.18 };
    if (at.combo === 0) sweepArc({ ...arc, a0: 175 * D, a1: -45 * D });
    if (at.combo === 1) sweepArc({ ...arc, a0: -55 * D, a1: 180 * D });
    // 3타 올려 베기: 가슴을 축으로 세운 원 — 칼(anim.js slash dir -1)이 뼈 각도 aim-115 → aim+95 를 지나므로 띠 각도 = 90° - 뼈 각도.
    // 몸이 뛰어올라도 띠가 몸을 따라가 한 덩어리로 이어짐 (예전엔 매 프레임 칼 자리를 이어 붙여 위·아래 두 조각으로 갈라졌음)
    if (at.combo === 2) sweepArc({ follow: p, y: -19, rx: 31, ry: 31, f, vert: true, th: 9, a0: (205 - p.aim) * D, a1: (-5 - p.aim) * D, dur: m.act, life: m.act + 0.17 });
    // 4타: 몸을 감싸며 한 바퀴 반 도는 띠 (먼 반은 몸 뒤, 가까운 반은 몸 앞)
    if (at.combo === 3) { sweepArc({ follow: p, y: -16, rx: 62, ry: 19, f, th: 7, a0: 178 * D, a1: -370 * D, dur: m.act, life: m.act + 0.12 }); G.flares.push({ x: p.x, y: p.cy, r: 50, col: [255, 200, 200], t: 0.2, glow: 0.1 }); }
  }
  // 4타 끝: 겨눈 쪽으로 큰 초승달 + 속도선
  if (at.combo === 3 && at.fx === 1 && t >= m.wind + m.act * 0.7) {
    at.fx = 2;
    const big = Math.max(-60, Math.min(60, p.aim - 90)) * Math.PI / 180 * -f;
    slashFx({ row: 2, follow: p, x: ca * 30, y: -20 + sa * 30, w: 120, ang: big, flip: f < 0, life: 0.28 });
    shake(3, ca * 3, sa * 3); sfx('slash');
  }
}
function stepCombat(dt) {
  const p = G.player, at = G.atk;
  if (!at || p.atkT < 0 || at.id !== p.atkId) return;
  const t = p.atkT, m = at.move;
  if (!at.exec) comboFx(p, at, t);
  if (t < m.wind - 0.01 || t > m.wind + m.act + 0.03) return;
  const ox = p.x, oy = p.cy, ca = Math.cos(at.ang), sa = Math.sin(at.ang);
  const fan = (dx, dy, R, half, pad) => {
    const d = Math.hypot(dx, dy);
    if (d > R + pad) return false;
    if (d < 10) return true;
    let da = Math.atan2(dy, dx) - at.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    return Math.abs(da) < half;
  };
  const oval = (u, v, rx, ry, pad) => (u / (rx + pad)) ** 2 + (v / (ry + pad)) ** 2 < 1;
  const inside = (x, y, pad = 0) => {
    const dx = x - ox, dy = y - oy;
    if (at.exec || at.combo === 2) return fan(dx, dy, at.exec ? 52 : 50, 1.4, pad);
    if (at.combo < 2) return oval(dx * ca + dy * sa - 12, -dx * sa + dy * ca, 54, 22, pad);   // 겨눈 쪽으로 납작한 타원
    return oval(dx, dy + 4, 60, 26, pad) || (t > m.wind + m.act * 0.6 && fan(dx, dy, 68, 0.6, pad));
  };
  const fin = at.combo === 3 && !at.exec;
  for (const e of G.enemies) {
    if (e.dead || at.hit.has(e)) continue;
    if (inside(e.x, e.cy, 6) || inside(e.x, e.y - 4, 6) || inside(e.x, e.y - e.h + 2, 6)) {
      at.hit.add(e);
      const ang = at.combo === 3 ? Math.atan2(e.cy - oy, e.x - ox) : at.ang;   // 회전은 몸 바깥쪽으로 튕김
      const hitInfo = { kind: 'slash', ang, power: fin ? 1.4 : 1, kb: at.exec ? 1 : fin ? 1.4 : 0.3 };
      const contact = [(ox + e.x) / 2, (oy + e.cy) / 2];
      spark(contact[0], contact[1], ang, fin ? 12 : 8, { cols: ['#ffffff', '#ffe0e0', '#ff6060'], v: fin ? 280 : 220, life: 0.14 });
      popSlashFx();
      slashFx({ row: 3, x: contact[0], y: contact[1], w: fin ? 56 : 40, life: 0.16 });
      e.damage(G, at.exec ? 1 : m.dmg, hitInfo);
      if (!e.dead) { sfx('hit'); G.stop = Math.max(G.stop, fin ? 0.11 : 0.07); shake(fin ? 6 : 3.5, Math.cos(ang) * (fin ? 6 : 4), Math.sin(ang) * (fin ? 6 : 4)); }
    }
  }
  // 총알 되받아치기 (카타나 제로식)
  for (const b of G.bullets) {
    if (b.owner !== 'enemy' || !inside(b.x, b.y, 8)) continue;
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
  // 대기·걷기 그림 중에 죽어도 몸은 리그 조각으로 잘려 나가니, 잘릴 자리(소켓)를 지금 자세로 다시 잼
  b.sock = bakeActor(b.type, b.pose, b.facing, b.low).sock;
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
  if (dt > 0) { p.animate(dt); for (const e of G.enemies) e.animate(dt); stepSteam(dt, p); }
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
  const aimDir = !p.dead && !p.rope ? G.ropeAssist(p.cx, p.cy, Math.cos(p.aimRad), Math.sin(p.aimRad)) || [Math.cos(p.aimRad), Math.sin(p.aimRad)] : null;
  const prev = aimDir ? G.ropeTarget(p.cx, p.cy, aimDir[0], aimDir[1], TUNE.hookMax) : null;   // 조준 보정까지 반영한 미리보기 (적이면 조준점이 붉게)
  for (const r of w.rings) drawRing(ctx, r, prev?.ring === r, G.time);
  drawFxBack(ctx, G.time);
  drawGore(ctx, frameNo % 2 === 0);

  // 적: 30fps 로만 다시 굽기
  for (const e of G.enemies) {
    if (frameNo % 2 === 0 || !e.baked) {
      // 보스 대기·걷기는 장면 그림 (주인공과 같은 방식), 나머지는 리그
      const fa = e.frameAnim, set = fa && e.type.anims?.[fa.name];
      if (set) {
        const n = set.frames.length, i = fa.ph !== undefined ? Math.floor(fa.ph * n) : Math.floor(fa.t * set.fps);
        bakeFrame(e.type, fa.name, ((i % n) + n) % n, e.facing, e.low, e.flashT > 0);
      } else { const o = bakeActor(e.type, e.pose, e.facing, e.low, e.flashT > 0); e.sock = o.sock; }
      e.baked = true;
    }
    ctx.drawImage(e.low, Math.round(e.x - e.low.ax) + shudderOf(e, real), Math.round(e.y - e.low.ay));
  }
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
    // 대기·달리기는 장면 그림(프레임 애니메이션, rig.json anims), 나머지는 리그
    const fa = p.frameAnim, set = fa && TYPES.hero.anims?.[fa.name];
    if (set) {
      const n = set.frames.length, i = fa.name === 'run' ? Math.floor(fa.ph * n) : Math.floor(fa.t * set.fps);
      const m = bakeFrame(TYPES.hero, fa.name, ((i % n) + n) % n, p.drawFacing ?? p.facing, playerLow);
      p.sock = m ? { mouth: [m[0] + px, m[1] + py] } : {};
    } else {
      const o = bakeActor(TYPES.hero, p.pose, p.drawFacing ?? p.facing, playerLow, p.hurtT > 0.18);
      p.sock = {}; for (const k in o.sock) p.sock[k] = [o.sock[k][0] + px, o.sock[k][1] + py];
    }
    afterimages(p, px, py, real);
    if (blink) playerLow.__skip = true; else playerLow.__skip = false;
  }
  if (!playerLow.__skip) ctx.drawImage(playerLow, px + shudderOf(p, real), py);
  drawSteam(ctx);   // 가면 증기 (몸 앞, 조명을 받음)
  for (const e of G.enemies) if (e.kind === 'boss') drawBossMarks(ctx, e, G.time); else drawEnemyMarks(ctx, e, G.time);
  drawHazards(ctx, G, G.time);
  drawFxFront(ctx, G.time);
  for (const b of G.bullets) drawBullet(b);
  ctx.font = font(16); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of fx.texts) { const y = Math.round(t.y - t.t * 30); ctx.fillStyle = PAL.ink; ctx.fillText(t.text, Math.round(t.x) + 1, y + 1); ctx.fillStyle = '#ffe060'; ctx.fillText(t.text, Math.round(t.x), y); }
  if (G.debug) drawDebug();
  ctx.restore();

  // 조명: 밤 환경색으로 곱하고 등불·주인공·총구·처형 섬광 자리만 밝힘
  const lights = [{ x: p.x, y: p.cy, r: 60, col: [235, 225, 255], k: 0.8 }];
  for (const l of w.lamps) lights.push({ x: l.x, y: l.y + 4, r: 80 + Math.round(Math.sin(G.time * 9 + l.x)) * 2, col: [255, 200, 165], glow: 0.1 });
  for (const x of G.exits) lights.push({ x: x.x + 6, y: x.y - 20, r: 48, col: [255, 170, 150] });
  for (const b of G.bullets) lights.push({ x: b.x, y: b.y, r: 14, col: [255, 220, 150] });
  for (const e of G.enemies) lights.push({ x: e.x, y: e.cy, r: e.kind === 'boss' ? 56 : 30, col: [200, 190, 235], k: 0.4 });   // 적은 어둠 속 실루엣이 겨우 읽힐 만큼
  for (const f of G.flares) lights.push(f);
  if (p.rope && p.rope.state !== 'back') lights.push({ x: p.rope.x, y: p.rope.y, r: 12, col: [255, 140, 140] });
  fxLights(lights, G.time);
  if (!G.noLight) applyLight(ctx, W, H, { x: cx, y: cy }, G.world.def.ambient || AMBIENT, lights);
  // 빛나는 이펙트는 조명 뒤에 그대로 (어두운 화면에서 도드라지게). 몸 뒤 반은 주인공 실루엣만큼 가림
  drawFxGlow(ctx, G.time, { x: cx, y: cy }, W, H, p.dead || playerLow.__skip ? null : { img: playerLow, x: px - cx, y: py - cy });
  zoomPulse(real, p.x - cx, p.cy - cy);

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

// 맞은 몸 떨림: shudder 초 동안 프레임마다 좌우 2px → 1px 로 번갈아 밀림 (실제 시간으로 줄어 타격 멈춤 중에도 떨림)
function shudderOf(o, real) {
  if (!(o.shudder > 0)) return 0;
  o.shudder = Math.max(0, o.shudder - real);
  return (frameNo & 1 ? 1 : -1) * (o.shudder > 0.08 ? 2 : 1);
}

// ---------- 잔상 (대시·쿠나이 돌진·더블 점프) ----------
// 잔상은 지나온 거리 기준 간격으로 한 장씩 (빠를 땐 듬성, 감속하면 촘촘) — fx.js pushGhost (반투명 한 색, 나이 들며 색이 바뀌고 가로 조각으로 쓸려 사라짐)
// 대시·돌진 중엔 몸 뒤로 가는 속도선, 끝나는 순간 화면이 살짝 당겨졌다 놓임(zoomPulse) → 속도감
const GHOST_GAP = { dash: 22, zip: 26, jump: 24 };   // 몸 너비(약 20px)쯤 → 잔상끼리 거의 안 겹침
let lastGhost = null, moveKind = null;
function afterimages(p, px, py, real) {
  const kind = p.rope?.state === 'zip' ? 'zip' : p.dashT > 0 ? 'dash' : p.flipT > TUNE.flipT * 0.5 && !p.onGround ? 'jump' : null;
  const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
  if (!kind) lastGhost = null;
  else if (!lastGhost || lastGhost.kind !== kind || Math.hypot(px - lastGhost.x, py - lastGhost.y) >= GHOST_GAP[kind]) {
    pushGhost(playerLow, px, py, kind, ux, uy); lastGhost = { x: px, y: py, kind };
  }
  if (kind && kind !== 'jump' && Math.random() < 0.8) speedLine(p.x - ux * 6, p.y - 4 - Math.random() * 30, -ux, -uy, 16 + Math.random() * 14);
  const mv = kind === 'jump' ? null : kind;
  if (moveKind && mv !== moveKind) G.zoomT = ZOOM.life;   // 대시·돌진이 끝나는 순간 화면 살짝 당김
  moveKind = mv;
}
// 화면 당김: 주인공 자리를 중심으로 내부 480×270 화면을 최대 amt 만큼 확대해 다시 그림 (조명·이펙트까지, HUD 는 빼고)
const ZOOM = { amt: 0.06, life: 0.22 };
let zoomBuf = null;
function zoomPulse(real, fx0, fy0) {
  if (!(G.zoomT > 0)) return;
  G.zoomT = Math.max(0, G.zoomT - real);
  const u = 1 - G.zoomT / ZOOM.life, env = u < 0.2 ? u / 0.2 : (1 - (u - 0.2) / 0.8) ** 2;   // 확 당겼다가 천천히 놓음
  const z = 1 + ZOOM.amt * env;
  if (z < 1.005) return;
  if (!zoomBuf) { zoomBuf = document.createElement('canvas'); zoomBuf.width = W; zoomBuf.height = H; }
  const zb = zoomBuf.getContext('2d');
  zb.clearRect(0, 0, W, H); zb.drawImage(canvas, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(zoomBuf, fx0 * (1 - 1 / z), fy0 * (1 - 1 / z), W / z, H / z, 0, 0, W, H);
}
// 대시 시작: 발밑 먼지 뭉치 + 뒤로 튀는 불티 + 출발 방향으로 화면 툭
G.onDash = p => {
  const [ux, uy] = p.dashDir;
  dust(p.x, p.y, -Math.sign(ux || p.facing), 8);
  spark(p.x, p.cy, Math.atan2(-uy, -ux), 6, { cols: ['#ffffff', '#ff8090'], v: 140, g: 0, life: 0.14, drag: 6 });
  shake(1.5, -ux * 2, -uy * 2);
};
// 더블 점프: 발밑에서 공기가 아래·옆으로 터짐 (짧은 속도선 + 먼지), 고리는 없음
G.onDoubleJump = p => {
  for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i - 2.5) * 0.35; speedLine(p.x + Math.cos(a) * 3, p.y + 1, Math.cos(a), Math.sin(a), 8 + Math.random() * 6); }
  dust(p.x - 3, p.y, -1, 4); dust(p.x + 3, p.y, 1, 4);
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
