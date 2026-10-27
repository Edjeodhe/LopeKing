// 이펙트: 칼끝 궤적(smear) · 몸을 감싸는 고리(앞 반/뒤 반 나눠 그림) · 불티·먼지·피 입자 · 피 자국(타일에 묻음) · 속도선 · 화면 흔들림
// 모두 1px 도트로 직접 찍는다 (반투명 없음, 사라질 땐 체크무늬) → 캐릭터 굽기와 같은 결

export const fx = { smear: [], rings: [], parts: [], lines: [], flashes: [], texts: [] };
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

// ---------- 칼끝 궤적 ----------
// 매 프레임 리그가 그린 칼의 손잡이·칼끝 자리를 적어 두고, 휘두르는 동안의 자리들을 이어 칼날이 쓸고 간 부채꼴을 도트로 칠한다.
// 칼끝 쪽이 희고 뜨겁고(흰 → 밝음 → 본색 → 어둠), 안쪽·오래된 쪽부터 체크무늬로 사라짐. dir = 휘두르는 쪽(+ 화면 시계 방향)
export const SMEAR = { life: 0.12, inner: 0.35, cols: ['#ffffff', '#ffd0d0', '#e04048', '#701020'] };
export function pushSmear(q) { fx.smear.push(q); }
function drawSmear(ctx, time) {
  const S = fx.smear;
  for (let i = 1; i < S.length; i++) {
    const a = S[i - 1], b = S[i];
    if (a.id !== b.id) continue;
    const cols = b.cols || SMEAR.cols, inner = b.inner ?? SMEAR.inner;
    const age = (time - b.at) / (b.life || SMEAR.life);
    if (age >= 1) continue;
    const a0 = Math.atan2(a.t[1] - a.g[1], a.t[0] - a.g[0]), a1 = Math.atan2(b.t[1] - b.g[1], b.t[0] - b.g[0]);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) > 0.5 && Math.sign(da) !== b.dir) da += b.dir * 2 * Math.PI;
    const L0 = Math.hypot(a.t[0] - a.g[0], a.t[1] - a.g[1]), L1 = Math.hypot(b.t[0] - b.g[0], b.t[1] - b.g[1]);
    const n = Math.max(2, Math.ceil(Math.abs(da) * Math.max(L0, L1) / 1.1));
    for (let j = 0; j <= n; j++) {
      const f = j / n, ang = a0 + da * f, L = (L0 + (L1 - L0) * f) * (b.reach || 1);
      const gx = a.g[0] + (b.g[0] - a.g[0]) * f, gy = a.g[1] + (b.g[1] - a.g[1]) * f;
      const k = Math.min(1, age + (1 - f) * 0.5);
      const r0 = L * (inner + (1 - inner) * k * 0.8);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let r = r0; r <= L + 0.5; r += 0.8) {
        const u = (r - r0) / Math.max(1, L - r0);
        const X = Math.round(gx + ca * r), Y = Math.round(gy + sa * r);
        if (k > 0.55 && (X + Y) & 1) continue;
        ctx.fillStyle = cols[u > 0.85 && k < 0.5 ? 0 : u > 0.6 ? 1 : u > 0.3 ? 2 : 3];
        ctx.fillRect(X, Y, 1, 1);
      }
    }
  }
}

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
    for (let w = 0; w < R.th; w++) {
      const X = Math.round(R.x + Math.cos(a) * (rx - w)), Y = Math.round(R.y + s * (ry - w * ry / rx));
      if (k > 0.6 && (X + Y) & 1) continue;
      ctx.fillStyle = R.cols[w === 0 && u > 0.8 ? 0 : u > 0.5 ? 1 : u > 0.2 ? 2 : 3];
      ctx.fillRect(X, Y, 1, 1);
    }
  }
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
  spark(x, y, ang, n, { v: 170 * power, spread: 0.9, g: 520, life: 0.9, cols: BLOOD.slice(1), blood: true, size: 2 });
  spark(x, y, ang, Math.ceil(n / 3), { v: 60 * power, spread: 2.5, g: 400, life: 0.6, cols: [BLOOD[1], BLOOD[2]], blood: true, size: 1 });
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
// 화면 번쩍 (처형·피격): { col, life }
export function flash(col, life = 0.06) { fx.flashes.push({ col, t: 0, life }); }

export function updateFx(dt) {
  cam.shake = Math.max(0, cam.shake - dt * 30);
  cam.kick[0] *= Math.exp(-dt * 18); cam.kick[1] *= Math.exp(-dt * 18);
  for (const R of fx.rings) R.t += dt;
  fx.rings = fx.rings.filter(R => R.t < R.life);
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
  for (const t of fx.texts) t.t += dt;
  fx.texts = fx.texts.filter(t => t.t < t.life);
  // 오래된 궤적 버림
  if (fx.smear.length > 64) fx.smear.splice(0, fx.smear.length - 64);
}

// 번쩍임은 타격 멈춤·슬로모션과 상관없이 실제 시간으로 (안 그러면 멈춘 동안 화면이 하얗게 남음)
export function updateFlash(real) {
  for (const f of fx.flashes) f.t += real;
  fx.flashes = fx.flashes.filter(f => f.t < f.life);
}

// 캐릭터 뒤에 그릴 것 (고리 먼 반·속도선·궤적)
export function drawFxBack(ctx, time) {
  for (const l of fx.lines) {
    const k = l.t / l.life, L = l.len * (1 - k);
    ctx.fillStyle = k > 0.5 ? '#8a86b0' : '#e8e4ff';
    for (let s = 0; s < L; s++) ctx.fillRect(Math.round(l.x + l.dx * (s + k * 14)), Math.round(l.y + l.dy * (s + k * 14)), 1, 1);
  }
  for (const R of fx.rings) drawRingHalf(ctx, R, false);
}
// 캐릭터 앞에 그릴 것 (고리 가까운 반·칼끝 궤적·입자)
export function drawFxFront(ctx, time) {
  drawSmear(ctx, time);
  for (const R of fx.rings) drawRingHalf(ctx, R, true);
  for (const p of fx.parts) {
    const k = p.t / p.life;
    if (k > 0.75 && !p.blood && (Math.round(p.x) + Math.round(p.y)) & 1) continue;
    ctx.fillStyle = p.col;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
}
export function drawFlash(ctx, W, H) {
  for (const f of fx.flashes) {
    const k = f.t / f.life;
    ctx.fillStyle = f.col;
    if (k < 0.34) ctx.fillRect(0, 0, W, H);
    else for (let y = 0; y < H; y += 2) ctx.fillRect(0, y + (Math.floor(f.t * 60) & 1), W, 1);   // 끝물은 줄무늬로
  }
}
