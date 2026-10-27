// 이펙트: 칼 궤적 띠 · 몸을 감싸는 고리(앞 반/뒤 반 나눠 그림) · 불티·먼지·피 입자 · 피 자국(타일에 묻음) · 속도선 · 화면 흔들림
// 모두 1px 도트로 직접 찍는다 (반투명 없음). 사라질 땐 체크무늬 대신 띠가 가늘어지고·짧아짐(잡티 없이) → 캐릭터 굽기와 같은 결. 콤보 베기는 Codex 그림을 도트로 구워 씀 (pixfx.js)
import { loadSheet, pixelFx } from './pixfx.js';

export const fx = { rings: [], parts: [], lines: [], flashes: [], texts: [], cuts: [], sprites: [], arcs: [], ghosts: [] };
export const cam = { x: 0, y: 0, shake: 0, kick: [0, 0] };
let decal = null, decalCtx = null, world = null;

export const BLOOD = ['#3a060c', '#601018', '#961c24', '#c8323a'];

export function initFx(w) {
  world = w;
  for (const k in fx) fx[k].length = 0;
  decal = document.createElement('canvas'); decal.width = w.pw; decal.height = w.ph;
  decalCtx = decal.getContext('2d');
}
export const decalCanvas = () => decal;

export function shake(a, kx = 0, ky = 0) { cam.shake = Math.max(cam.shake, a); cam.kick[0] += kx; cam.kick[1] += ky; }

// ---------- 베기 이펙트 색 ----------
// 칼 궤적 띠·고리 공용 4단: 흰 심 → 밝음 → 본색 → 어둠 (칼 궤적은 몸을 따라가는 띠 sweepArc 로 그림)
export const SMEAR = { life: 0.12, inner: 0.35, cols: ['#ffffff', '#ffd0d0', '#e04048', '#701020'] };

// ---------- 몸을 감싸는 고리 (이펙트 안에 캐릭터가 서 있게) ----------
// 납작한 타원 고리: 위쪽(먼 쪽) 반은 캐릭터 뒤에, 아래쪽(가까운 쪽) 반은 캐릭터 앞에 그린다 → 고리 안에 몸이 들어간 것처럼 보임
// { x, y, rx, ry, t, life, cols, th(두께), span(그려지는 각도, 2π = 한 바퀴), a0, dir, grow }
export function ring(o) { fx.rings.push({ t: 0, life: 0.3, th: 3, span: Math.PI * 2, a0: 0, dir: 1, grow: 0.4, cols: SMEAR.cols, ...o }); }
function drawRingHalf(ctx, R, front) {
  const k = R.t / R.life, grow = 1 + R.grow * k;
  const rx = R.rx * grow, ry = R.ry * grow;
  // 그려지는 구간: 처음엔 빠르게 한 바퀴 휘감고(span), 끝물엔 꼬리부터 사라짐
  const head = R.a0 + R.dir * R.span * Math.min(1, 0.4 + k * 2.2), tail = R.a0 + R.dir * R.span * Math.max(0, k * 1.6 - 0.6);   // 처음부터 40%는 그려진 채로 (타격 멈춤 화면에 보이게)
  const n = Math.ceil((rx + ry) * 2.2);
  for (let i = 0; i <= n; i++) {
    const a = tail + (head - tail) * (i / n);
    const s = Math.sin(a);
    if ((s >= 0) !== front) continue;
    const u = i / n;   // 0 꼬리 → 1 머리(밝음)
    const th = Math.max(1, Math.round(R.th * (1 - k * 0.7)));   // 사라질 땐 가늘어짐 (체크무늬 없음)
    for (let w = 0; w < th; w++) {
      const X = Math.round(R.x + Math.cos(a) * (rx - w)), Y = Math.round(R.y + s * (ry - w * ry / rx));
      ctx.fillStyle = R.cols[w === 0 && u > 0.8 ? 0 : u > 0.5 ? 1 : u > 0.2 ? 2 : 3];
      ctx.fillRect(X, Y, 1, 1);
    }
  }
}

// ---------- 눕힌 칼 궤적 띠 (콤보 가로 베기·회전) ----------
// 칼끝이 지나는 타원(rx, ry, 기울기 tilt, f = 보는 쪽)을 각도 a0 → a1 로 dur 동안 그어 가고, 남은 띠는 life 까지 꼬리부터 따라 사라짐.
// 각도: 0 = 앞, π/2 = 가까운 쪽(아래, 몸 앞), π = 몸 뒤, -π/2 = 먼 쪽(위, 몸 뒤). 굵기(th)는 화면에서 고르게(타원 법선 방향),
// 머리 쪽이 두껍고 꼬리로 갈수록 가늘며, 바깥 가장자리(칼끝 쪽)가 희고 뜨거움. 그림 이펙트와 달리 잘리거나 얇아지지 않음
export function sweepArc(o) { const A = { t: 0, life: 0.24, dur: 0.07, th: 8, tilt: 0, f: 1, x: 0, y: 0, cols: SMEAR.cols, ...o }; fx.arcs.push(A); return A; }
// vert = 화면에 세운 원(올려 베기): 앞뒤로 나누지 않고 전부 몸 앞에
function drawArc(ctx, A, front) {
  if (A.vert && !front) return;
  const k = A.t / A.life, span = A.a1 - A.a0;
  const head = Math.min(1, A.t / A.dur);
  const tail = Math.max(0, Math.max((A.t - A.dur * 0.6) / (A.life - A.dur * 0.6), head - 1.7 * Math.PI / Math.abs(span)));   // 띠는 길어야 한 바퀴 조금 못 되게
  if (head <= tail) return;
  const cx = (A.follow?.x ?? 0) + A.x, cy = (A.follow?.y ?? 0) + A.y, ct = Math.cos(A.tilt), st = Math.sin(A.tilt);
  const thin = A.th * (1 - k * 0.6), step = 2 * Math.PI / span;
  // 픽셀마다 거꾸로: 타원 각도 a · 바깥 가장자리에서 안쪽 거리 d → 띠 안이면 칠함 (구멍·줄무늬 없음)
  const ex = Math.abs(A.rx * ct) + Math.abs(A.ry * st) + 2, ey = Math.abs(A.rx * st) + Math.abs(A.ry * ct) + 2;
  for (let Y = Math.floor(cy - ey); Y <= Math.ceil(cy + ey); Y++) for (let X = Math.floor(cx - ex); X <= Math.ceil(cx + ex); X++) {
    const dx = X + 0.5 - cx, dy = Y + 0.5 - cy;
    const lx = (dx * ct + dy * st) * A.f, ly = -dx * st + dy * ct;   // 기울임·좌우를 되돌린 타원 좌표
    const nx = lx / A.rx, ny = ly / A.ry, rn = Math.hypot(nx, ny);
    if (rn > 1.02 || rn < 0.5) continue;
    const a = Math.atan2(ny, nx), ca = Math.cos(a), sa = Math.sin(a);
    if (!A.vert && (sa >= 0) !== front) continue;
    const d = (1 - rn) / Math.hypot(ca / A.rx, sa / A.ry);   // 바깥 가장자리에서 안쪽으로 몇 px
    if (d < -0.3 || d > thin) continue;
    // 이 각도가 띠의 어디쯤인지 (한 바퀴 넘게 돌면 여러 번 지나므로 머리에 가장 가까운 것)
    let s0 = (a - A.a0) / span, best = -1;
    const n0 = Math.ceil((tail - s0) / Math.abs(step)) - 1;
    for (let n = n0; n <= n0 + 3; n++) { const sv = s0 + n * Math.abs(step); if (sv >= tail && sv <= head) best = Math.max(best, sv); }
    if (best < 0) continue;
    const v = (best - tail) / (head - tail);
    const w = thin * Math.pow(v, 0.7) * Math.min(1, (1 - v) * 7 + 0.4);
    if (d > w) continue;
    const u = Math.max(0, d) / Math.max(1, w);
    ctx.fillStyle = A.cols[u < 0.3 && v > 0.45 && k < 0.55 ? 0 : u < 0.55 ? 1 : u < 0.82 ? 2 : 3];
    ctx.fillRect(X, Y, 1, 1);
  }
}

// ---------- 그림 이펙트 (art/fx/fx_slash.png 4×4 칸, 줄마다 4장 애니메이션) ----------
// 줄: 0 가로 베기 초승달 · 1 회전 타원 고리 · 2 마무리 큰 초승달 · 3 타격 섬광. 그림 기준점 = 칸 가운데 · 위에서 40% (그림이 그 높이에 있음)
// { row, x, y(follow 가 있으면 그 몸 기준), w(칸 가로 = 게임 px), ang(라디안, 15° 단위), flip, vflip, life,
//   layer: 'front' 몸 앞 · 'back' 몸 뒤 · 'split' 위(먼) 반은 몸 뒤 + 아래(가까운) 반은 몸 앞 }
let sheet = null;
export async function loadSlashFx() { sheet = await loadSheet('art/fx/fx_slash.png', 4, 4); }
export function slashFx(o) { fx.sprites.push({ t: 0, life: 0.2, w: 80, ang: 0, layer: 'front', ramp: [...SMEAR.cols].reverse(), ...o }); }
function drawSprite(ctx, s, back) {
  if (!sheet || (s.layer !== 'split' && (s.layer === 'back') !== back)) return;
  const k = s.t / s.life, f = Math.min(3, Math.floor(k * 4));
  const c = pixelFx(sheet[s.row][f], s.ramp, s.w, false, { ang: s.ang, flip: s.flip, vflip: s.vflip, py: 0.4 });
  const x = Math.round((s.follow?.x ?? 0) + s.x) - c.ax, y = Math.round((s.follow?.y ?? 0) + s.y) - c.ay;
  if (s.layer !== 'split') { ctx.drawImage(c, x, y); return; }
  const h = c.ay, top = !s.vflip;   // 뒤집으면 위·아래 반도 바뀜
  if (back === top) ctx.drawImage(c, 0, 0, c.width, h, x, y, c.width, h);
  else ctx.drawImage(c, 0, h, c.width, c.height - h, x, y + h, c.width, c.height - h);
}

// ---------- 입자 ----------
// { x, y, vx, vy, g, life, col, size, blood(벽·바닥에 닿으면 자국), drag }
export function spark(x, y, ang, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = ang + (Math.random() - 0.5) * (o.spread ?? 1.2), v = (o.v ?? 160) * (0.4 + Math.random());
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.g ?? 300, life: (o.life ?? 0.25) * (0.5 + Math.random()), t: 0,
      col: o.cols ? o.cols[i % o.cols.length] : '#fff0c0', size: o.size ?? (Math.random() < 0.3 ? 2 : 1), blood: !!o.blood, drag: o.drag ?? 0 });
  }
}
// 피: 베인 방향으로 뿜어져 나가 바닥·벽에 묻음
export function blood(x, y, ang, n, power = 1) {
  n = Math.ceil(n * 0.7);   // 너무 많으면 공중에 붉은 점이 떠 보임
  spark(x, y, ang, n, { v: 170 * power, spread: 0.9, g: 560, life: 0.8, cols: BLOOD.slice(1), blood: true, size: 2 });
  spark(x, y, ang, Math.ceil(n / 3), { v: 60 * power, spread: 2.5, g: 450, life: 0.5, cols: [BLOOD[1], BLOOD[2]], blood: true, size: 1 });
}
export function dust(x, y, dir, n) {
  for (let i = 0; i < n; i++) {
    const s = 20 + Math.random() * 60;
    fx.parts.push({ x: x + (Math.random() - 0.5) * 6, y: y - Math.random() * 2, vx: dir * s * (0.3 + Math.random()), vy: -8 - Math.random() * 22, g: -10,
      life: 0.25 + Math.random() * 0.25, t: 0, col: i % 2 ? '#4a4660' : '#6a6684', size: 1, drag: 3 });
  }
}
// 피 자국: 월드 decal 캔버스에 찍음 (사라지지 않음)
function stain(x, y, col, big) {
  if (!decalCtx) return;
  decalCtx.fillStyle = col;
  decalCtx.fillRect(Math.round(x), Math.round(y), big ? 2 : 1, 1);
}
// 쓰러진 자리에 피 웅덩이 (바닥 위로 넓게 번짐)
export function pool(x, y, w) {
  if (!decalCtx) return;
  for (let i = -w; i <= w; i++) {
    const X = Math.round(x + i), Y = Math.round(y);
    if (!world.solidPx(X, Y + 1) || world.solidPx(X, Y)) continue;
    const e = Math.abs(i) / w;
    decalCtx.fillStyle = e > 0.8 ? BLOOD[1] : BLOOD[0];
    decalCtx.fillRect(X, Y, 1, 1);
    if (e < 0.5) { decalCtx.fillStyle = BLOOD[1]; decalCtx.fillRect(X, Y - 1, 1, 1); }
  }
}

// 속도선 (대시·로프 당기기): 몸 뒤로 짧은 줄이 흘러감
export function speedLine(x, y, dx, dy, len = 10) {
  fx.lines.push({ x, y, dx, dy, len: len * (0.6 + Math.random() * 0.8), t: 0, life: 0.1 + Math.random() * 0.06 });
}
// 일직선 베기 자국 (쿠나이 돌진이 적을 관통): 흰 심 → 붉은 테, 가운데부터 가늘어지며 사라짐
export function cutLine(x0, y0, x1, y1) { fx.cuts.push({ x0, y0, x1, y1, t: 0, life: 0.16 }); }
function drawCuts(ctx) {
  for (const c of fx.cuts) {
    const k = c.t / c.life, L = Math.hypot(c.x1 - c.x0, c.y1 - c.y0), ux = (c.x1 - c.x0) / L, uy = (c.y1 - c.y0) / L;
    // 픽셀마다: 칼자국 선을 따라 어디(s)·옆으로 얼마(o) → 가운데가 두껍고(최대 3px) 시간이 갈수록 가늘어짐
    for (let Y = Math.floor(Math.min(c.y0, c.y1) - 4); Y <= Math.ceil(Math.max(c.y0, c.y1) + 4); Y++) for (let X = Math.floor(Math.min(c.x0, c.x1) - 4); X <= Math.ceil(Math.max(c.x0, c.x1) + 4); X++) {
      const rx = X + 0.5 - c.x0, ry = Y + 0.5 - c.y0, sAlong = rx * ux + ry * uy, o = Math.abs(-rx * uy + ry * ux);
      if (sAlong < 0 || sAlong > L) continue;
      const w = Math.max(0.5, (1 - Math.abs(sAlong / L - 0.5) * 2) * 3 * (1 - k));
      if (o > w) continue;
      ctx.fillStyle = o < w * 0.4 ? '#ffffff' : o < w * 0.8 ? '#ff6a6a' : '#9a1a22';
      ctx.fillRect(X, Y, 1, 1);
    }
  }
}

// ---------- 잔상 (대시·쿠나이 돌진·더블 점프) ----------
// 지금 구운 주인공 그림을 한 색 반투명 실루엣으로 떠서 그 자리에 남김. 나이가 들수록 색이 한 단씩 바뀌고(대시: 진홍 → 자홍 → 보라)
// 흐려지면서 2px 가로 조각으로 갈라져 움직인 반대쪽으로 밀려나며 하나씩 빠져 사라짐 (바람에 쓸려 가는 느낌, 체크무늬 없음).
// 간격은 부르는 쪽(main.js)이 이동 거리 기준으로 정함 → 빠를 땐 듬성, 느려지면 촘촘. 빛나는 층(조명 뒤)에 그리고 주인공 실루엣만큼 가림
const GHOST = {
  dash: { cols: ['#ff6a7a', '#e0306a', '#8a2ad0'], a: 0.6, life: 0.32 },
  zip: { cols: ['#ffffff', '#ff4a5a', '#a0206a'], a: 0.65, life: 0.28 },
  jump: { cols: ['#fff0c8', '#ffb050', '#c05030'], a: 0.32, life: 0.18 },   // 앞구르기는 느려서 옅고 짧게 (몸에 뭉치지 않게)
};
function tint(low, col) {
  const c = document.createElement('canvas'); c.width = low.width; c.height = low.height;
  const g = c.getContext('2d'); g.drawImage(low, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return c;
}
// (dx, dy) = 움직이는 방향(단위) — 조각은 그 반대쪽으로 밀림
export function pushGhost(low, x, y, kind, dx = 1, dy = 0) {
  const G = GHOST[kind];
  fx.ghosts.push({ cs: G.cols.map(c => tint(low, c)), x, y, dx, dy, t: 0, life: G.life, a: G.a, seed: Math.random() * 100 });
  if (fx.ghosts.length > 10) fx.ghosts.shift();
}
const hash = n => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
function drawGhosts(ctx) {
  for (const G of fx.ghosts) {
    const k = G.t / G.life, c = G.cs[k < 0.25 ? 0 : k < 0.6 ? 1 : 2];
    ctx.globalAlpha = G.a * Math.pow(1 - k, 1.2);
    if (k < 0.3) { ctx.drawImage(c, G.x, G.y); continue; }
    const q = (k - 0.3) / 0.7;   // 조각으로 쓸려 가는 정도 0 → 1
    for (let r = 0; r < c.height; r += 2) {
      const h = hash(r + G.seed), sh = q * q * 14 * (0.4 + h);
      if (hash(r * 3.1 + G.seed) < q * 0.9) continue;   // 조각이 하나씩 빠짐
      ctx.drawImage(c, 0, r, c.width, 2, Math.round(G.x - G.dx * sh), Math.round(G.y + r - G.dy * sh), c.width, 2);
    }
  }
  ctx.globalAlpha = 1;
}

// 화면 번쩍 (처형·피격): { col, life }
export function flash(col, life = 0.06) { fx.flashes.push({ col, t: 0, life }); }

export function updateFx(dt) {
  cam.shake = Math.max(0, cam.shake - dt * 30);
  cam.kick[0] *= Math.exp(-dt * 18); cam.kick[1] *= Math.exp(-dt * 18);
  for (const R of fx.rings) R.t += dt;
  fx.rings = fx.rings.filter(R => R.t < R.life);
  for (const S of fx.sprites) S.t += dt;
  for (const A of fx.arcs) A.t += dt;
  fx.arcs = fx.arcs.filter(A => A.t < A.life);
  for (const G of fx.ghosts) G.t += dt;
  fx.ghosts = fx.ghosts.filter(G => G.t < G.life);
  fx.sprites = fx.sprites.filter(S => S.t < S.life);
  for (const p of fx.parts) {
    p.t += dt;
    p.vy += p.g * dt;
    if (p.drag) { p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); }
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (p.blood && world && world.solidPx(nx, ny)) {
      // 벽·바닥에 닿은 자리에 묻고 사라짐
      stain(p.x, p.y, p.col, p.size > 1);
      if (p.vy > 0 && world.solidPx(p.x, p.y + 2)) stain(p.x + (Math.random() < 0.5 ? -1 : 1), p.y, BLOOD[0], false);
      p.t = p.life;
      continue;
    }
    p.x = nx; p.y = ny;
  }
  fx.parts = fx.parts.filter(p => p.t < p.life);
  for (const l of fx.lines) l.t += dt;
  fx.lines = fx.lines.filter(l => l.t < l.life);
  for (const c of fx.cuts) c.t += dt;
  fx.cuts = fx.cuts.filter(c => c.t < c.life);
  for (const t of fx.texts) t.t += dt;
  fx.texts = fx.texts.filter(t => t.t < t.life);
}

// 번쩍임은 타격 멈춤·슬로모션과 상관없이 실제 시간으로 (안 그러면 멈춘 동안 화면이 하얗게 남음)
export function updateFlash(real) {
  for (const f of fx.flashes) f.t += real;
  fx.flashes = fx.flashes.filter(f => f.t < f.life);
}

// 캐릭터 뒤에 그릴 것 (속도선) — 조명을 받음
export function drawFxBack(ctx, time) {
  for (const l of fx.lines) {
    const k = l.t / l.life, L = l.len * (1 - k);
    ctx.fillStyle = k > 0.5 ? '#8a86b0' : '#e8e4ff';
    for (let s = 0; s < L; s++) ctx.fillRect(Math.round(l.x + l.dx * (s + k * 14)), Math.round(l.y + l.dy * (s + k * 14)), 1, 1);
  }
}
// 캐릭터 앞에 그릴 것 (불티·피 입자) — 조명을 받음
export function drawFxFront(ctx, time) {
  for (const p of fx.parts) {
    ctx.fillStyle = p.col;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
}
// 빛나는 이펙트 (칼끝 궤적·베기 그림·고리·관통 자국): 조명을 '받지 않고' 조명 뒤에 그대로 그림 → 어두운 화면에서 도드라짐.
// 몸 뒤에 있어야 할 반(고리 먼 반·'back'·'split' 위 반)은 따로 그려 주인공 실루엣(occ)만큼 지운 뒤 얹음
let glowBuf = null;
export function drawFxGlow(ctx, time, cam, W, H, occ) {
  if (!glowBuf) { glowBuf = document.createElement('canvas'); glowBuf.width = W; glowBuf.height = H; }
  const g = glowBuf.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
  g.translate(-cam.x, -cam.y);
  for (const R of fx.rings) drawRingHalf(g, R, false);
  for (const S of fx.sprites) drawSprite(g, S, true);
  for (const A of fx.arcs) drawArc(g, A, false);
  drawGhosts(g);   // 잔상은 몸 뒤
  if (occ?.img) { g.globalCompositeOperation = 'destination-out'; g.drawImage(occ.img, occ.x, occ.y); }
  ctx.save();
  ctx.drawImage(glowBuf, 0, 0);
  ctx.translate(-cam.x, -cam.y);
  drawCuts(ctx);
  for (const R of fx.rings) drawRingHalf(ctx, R, true);
  for (const S of fx.sprites) drawSprite(ctx, S, false);
  for (const A of fx.arcs) drawArc(ctx, A, true);
  ctx.restore();
}
// 이펙트가 내는 빛: 베기 그림·고리·궤적·관통 자국 둘레를 비춤 (조명 패스에 넣음). 막 생겼을 때 가장 밝고 사라지며 약해짐
const FX_LIGHT = [255, 150, 160];
export function fxLights(out, time) {
  const add = (x, y, r, k) => { if (k > 0.05) out.push({ x, y, r, col: FX_LIGHT, k, glow: 0.25 * k }); };
  for (const S of fx.sprites) {
    const k = 1 - S.t / S.life;
    add((S.follow?.x ?? 0) + S.x, (S.follow?.y ?? 0) + S.y, S.row === 3 ? S.w * 0.6 : S.w * 0.75, k);
  }
  for (const R of fx.rings) add(R.x, R.y, R.rx * 1.6, 1 - R.t / R.life);
  for (const A of fx.arcs) add((A.follow?.x ?? 0) + A.x, (A.follow?.y ?? 0) + A.y, A.rx * 1.3, 1 - A.t / A.life);
  for (const c of fx.cuts) add((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, 40, 1 - c.t / c.life);
}
// 새 베기가 시작되면 앞 타의 베기 그림은 바로 사라지는 끝물(체크무늬)로 넘김 — 겹쳐 지저분해지지 않고, 뚝 끊기지도 않게. 타격 섬광(줄 3)은 그대로
export function fadeSlashFx(rows = [0, 1, 2], arcs = true) {
  for (const S of fx.sprites) if (rows.includes(S.row)) S.t = Math.max(S.t, S.life * 0.9);
  if (arcs) for (const A of fx.arcs) A.t = Math.max(A.t, A.life * 0.85);
}
// 칼이 닿은 순간: 막 생긴 베기 그림을 가장 큰 장(2번째 칸)으로 → 타격 멈춤 화면에 다 그려진 궤적이 찍힘
export function popSlashFx() {
  for (const S of fx.sprites) if (S.row < 3 && S.t < S.life * 0.25) S.t = S.life * 0.25;
  for (const A of fx.arcs) if (A.t < A.dur * 0.85) A.t = A.dur * 0.85;
}

export function drawFlash(ctx, W, H) {
  for (const f of fx.flashes) {
    const k = f.t / f.life;
    ctx.fillStyle = f.col;
    if (k < 0.34) ctx.fillRect(0, 0, W, H);
    else for (let y = 0; y < H; y += 2) ctx.fillRect(0, y + (Math.floor(f.t * 60) & 1), W, 1);   // 끝물은 줄무늬로
  }
}
