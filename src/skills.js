// 가면 기술 (31차 로그라이크): F = 쓴 가면마다 다른 기술 · 달 도깨비 평타(도깨비불 던지기)
// main.js 가 부름: maskSkill(G, p, 둘레 적, 피해 배율) · spawnOrb / stepOrb / drawOrb (orb 총알)
// 기술 이펙트 색은 가면 색(fx.js setFxTheme)을 따라감 — 불 = 주황·숯불, 물 = 청록, 달 = 보라
import { spark, cutLine, shake, flash, spiritFx, drawSpiritCell, speedLine, ring, dust, SPIRIT_COLS } from './fx.js';

const FIRE = ['#ffffff', '#ffe0b0', '#ff9a48', '#ff6a20'];   // 불기둥 불티: 흰 → 노랑빛 주황 → 주황
const EMBER = ['#ff8a3a', '#c8501c', '#8a2a10'];             // 숯불 (흩날리는 불똥)
const WATER = ['#ffffff', '#c8f8ff', '#5ae8ff'];
const MIST = ['#c8f8ff', '#8adcec', '#5ab8d0'];               // 물안개 (천천히 떠오르며 퍼짐)

export function maskSkill(G, p, pool, mul = 1) {
  const s = p.spec?.m.skill;
  if (s === 'quake') quake(G, p, pool, mul);
  else if (s === 'mist') mist(G, p, pool, mul);
  else if (s === 'wisps') wisps(G, p, pool, mul);
}

// 발밑 땅 높이 (x 에서 y0 부터 아래로 찾음, 없으면 null)
function groundAt(G, x, y0, reach = 48) {
  const w = G.world;
  if (w.solidPx(x, y0 - 6)) return null;   // 벽 속
  for (let y = Math.round(y0 - 4); y < y0 + reach; y++) if (w.solidPx(x, y)) return y;
  return null;
}

// ---------- 불 도깨비: 내리찍기 ----------
// 살짝 솟았다가(0.2초) 방망이로 땅을 내리찍음 → 가로 110px 안 적에게 큰 피해 + 땅에서 불기둥 5개가 차례로 솟음
function quake(G, p, pool, mul) {
  p.vy = Math.min(p.vy, -170);
  p.inv = Math.max(p.inv, 0.45);
  spark(p.x, p.y, -Math.PI / 2, 8, { cols: EMBER, v: 90, spread: 2.2, g: -60, life: 0.3, drag: 3 });
  spiritFx({ row: 1, x: p.x, y: p.y + 2, py: 0.95, w: 50, life: 0.3, a: 0.7 });
  G.sfx?.('flame');
  G.later(0.2, () => {
    if (p.dead) return;
    p.vy = Math.max(p.vy, 380);   // 땅으로 꽂힘
    const x = p.x, gy = groundAt(G, x, p.y, 80) ?? p.y;
    // 땅 울림: 납작한 충격 고리 둘 + 양옆 먼지 + 가운데 큰 빛
    ring({ x, y: gy - 1, rx: 26, ry: 6, life: 0.32, th: 3, grow: 3.4, cols: [FIRE[0], FIRE[1], FIRE[2], EMBER[1]] });
    ring({ x, y: gy - 1, rx: 14, ry: 4, life: 0.24, th: 2, grow: 2.2, cols: [FIRE[0], FIRE[0], FIRE[1], FIRE[2]] });
    dust(x - 6, gy - 1, -1, 10); dust(x + 6, gy - 1, 1, 10);
    spark(x, gy - 2, -Math.PI / 2, 18, { cols: FIRE, v: 240, spread: 1.6, g: 260, life: 0.35, size: 2 });
    spiritFx({ row: 2, x, y: gy + 1, py: 0.7, w: 120, life: 0.45 });
    G.flares.push({ x, y: gy - 10, r: 150, col: [255, 160, 80], t: 0.4, glow: 0.35 });
    flash('#ffd8a8', 0.04); shake(10, 0, 7);
    G.stop = Math.max(G.stop, 0.1);
    G.sfx?.('quake');
    for (const e of pool) {
      if (e.dead || Math.abs(e.x - x) > 110 || Math.abs(e.y - gy) > 70) continue;
      const dir = Math.sign(e.x - x) || p.facing;
      e.damage(G, 3 * mul, { kind: 'slash', ang: Math.atan2(-0.7, dir), power: 1.5, kb: 1.4 });
    }
    // 불기둥 5개: 가운데부터 바깥으로 0.05초씩 늦게 솟음
    for (let i = 0; i < 5; i++) {
      const off = [0, -44, 44, -88, 88][i];
      G.later(0.03 + Math.ceil(i / 2) * 0.05, () => pillar(G, x + off, gy, i === 0 ? 1.2 : 1));
    }
  });
}
// 불기둥 하나: 땅에서 위로 뿜는 불티 기둥 + 가운데 뜨거운 줄 + 숯불 불똥 + 빛
function pillar(G, x, gy0, k) {
  const gy = groundAt(G, x, gy0, 40);
  if (gy === null) return;   // 낭떠러지·벽이면 건너뜀
  for (let j = -1; j <= 1; j++) spark(x + j * 3, gy - 1, -Math.PI / 2, 9, { cols: FIRE, v: 300 * k, spread: 0.18, g: -40, life: 0.42, drag: 2.2, size: 2 });
  spark(x, gy - 4, -Math.PI / 2, 10, { cols: EMBER, v: 150, spread: 0.9, g: -90, life: 0.8, drag: 1.5 });
  cutLine(x, gy, x, gy - 58 * k);
  spiritFx({ row: 1, x, y: gy + 2, py: 0.95, w: 46 * k, life: 0.42, a: 0.85 });   // 부드러운 불꽃 기둥 (가면 색 = 주황)
  ring({ x, y: gy - 1, rx: 9, ry: 3, life: 0.22, th: 2, grow: 1.6, cols: [FIRE[0], FIRE[1], FIRE[2], EMBER[1]] });
  G.flares.push({ x, y: gy - 24, r: 60 * k, col: [255, 140, 60], t: 0.35, glow: 0.25 });
  G.sfx?.('flame');
}

// ---------- 물 도깨비: 물안개 ----------
// 물안개 속에서 눈 깜짝할 새: 가까운 적 최대 6명을 적마다 3번씩 벰 (0.05초 간격). 그동안 주인공은 무적
function mist(G, p, pool, mul) {
  const targets = pool.filter(e => !e.dead).sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - Math.abs(b.x - p.x) - Math.abs(b.y - p.y)).slice(0, 6);
  p.inv = Math.max(p.inv, 0.35 + targets.length * 0.06 + 0.15);
  // 주인공 둘레 물안개 + 사방 속도선 + 몸에서 피어오르는 혼불(사라짐)
  mistPuff(p.x, p.cy, 16, 26);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; speedLine(p.x + Math.cos(a) * 6, p.cy + Math.sin(a) * 6, Math.cos(a), Math.sin(a), 16); }
  spiritFx({ row: 1, x: p.x, y: p.y + 2, py: 0.95, w: 56, life: 0.4, a: 0.9 });
  ring({ x: p.x, y: p.y - 14, rx: 30, ry: 9, life: 0.3, th: 2, a0: Math.PI, dir: p.facing, grow: 0.8, cols: SPIRIT_COLS });
  G.flares.push({ x: p.x, y: p.cy, r: 90, col: [140, 235, 255], t: 0.3, glow: 0.18 });
  G.stop = Math.max(G.stop, 0.04);
  G.sfx?.('mist');
  targets.forEach((e, i) => {
    const base = 0.05 + i * 0.06;
    G.later(base, () => { if (!e.dead) { mistPuff(e.x, e.cy, 10, 14); spiritFx({ sheet: 'flurry', row: 1, x: e.x, y: e.cy, w: 70, ang: Math.random() * 6.28, life: 0.3, a: 0.8 }); } });
    for (let k = 0; k < 3; k++) G.later(base + k * 0.05, () => {
      if (e.dead) return;
      const a = (Math.random() - 0.5) * 1.2 + (k % 2 ? Math.PI : 0) + (Math.random() < 0.5 ? Math.PI / 2 : 0);
      const ca = Math.cos(a) * 24, sa = Math.sin(a) * 24, y = e.y - e.h / 2;
      cutLine(e.x - ca, y - sa, e.x + ca, y + sa);
      spark(e.x, y, a, 6, { cols: WATER, v: 220, spread: 0.5, life: 0.14 });
      spiritFx({ sheet: 'flurry', row: 3, x: e.x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 10, w: 36, life: 0.14 });
      G.flares.push({ x: e.x, y, r: 36, col: [140, 235, 255], t: 0.1, glow: 0.12 });
      e.damage(G, 0.9 * mul, { kind: 'slash', ang: a, power: 0.8, kb: k === 2 ? 0.6 : 0.1 });
      G.stop = Math.max(G.stop, 0.02);
      shake(2.5, Math.cos(a) * 2, Math.sin(a) * 2);
      G.sfx?.('slash');
    });
  });
}
// 물안개 덩이: 느리게 떠오르며 퍼지다 사라지는 큰 알갱이
function mistPuff(x, y, r, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r;
    spark(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, a, 1, { cols: [MIST[i % 3]], v: 40, spread: 0.5, g: -18, life: 0.7, drag: 3.5, size: 2 });
  }
}

// ---------- 달 도깨비: 도깨비불 ----------
// 주인공 머리 위로 반원을 그리며 도깨비불 다섯이 하나씩 피어나 적을 쫓아감 (orb 총알, wisp = 세게 휘어감)
function wisps(G, p, pool, mul) {
  const live = pool.filter(e => !e.dead).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
  spiritFx({ row: 2, x: p.x, y: p.y + 1, py: 0.7, w: 80, life: 0.45 });
  ring({ x: p.x, y: p.y - 18, rx: 22, ry: 7, life: 0.35, th: 2, a0: Math.PI, dir: p.facing, grow: 0.9, cols: SPIRIT_COLS });
  G.flares.push({ x: p.x, y: p.cy, r: 80, col: [200, 160, 255], t: 0.4, glow: 0.2 });
  G.sfx?.('wisps');
  for (let i = 0; i < 5; i++) G.later(i * 0.06, () => {
    if (p.dead) return;
    const a = -Math.PI + (i + 0.5) / 5 * Math.PI, x = p.x + Math.cos(a) * 16, y = p.cy - 4 + Math.sin(a) * 14;
    G.bullets.push({ x, y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, t: 0, owner: 'player', dmg: 1.5 * mul, orb: '#c79bff', home: true, wisp: true,
      target: live.length ? live[i % live.length] : null, life: 2.4 });
    spark(x, y, a, 5, { cols: ['#ffffff', '#eadcff', '#c79bff'], v: 70, g: -30, life: 0.25, drag: 4 });
  });
}

// ---------- 달 도깨비 평타: 도깨비불 하나 ----------
// ang = 겨눈 각 (라디안). 피해 = mul (main 이 평타 배율·능력치를 곱해 넘김)
export function spawnOrb(G, p, ang, mul = 1) {
  const ca = Math.cos(ang), sa = Math.sin(ang), x = p.x + ca * 10, y = p.cy + sa * 10, sp = 250;
  G.bullets.push({ x, y, vx: ca * sp, vy: sa * sp, t: 0, owner: 'player', dmg: mul, orb: '#c79bff', home: true, life: 0.85 });
  spark(x, y, ang, 5, { cols: ['#ffffff', '#eadcff', '#c79bff'], v: 120, spread: 0.8, g: 0, life: 0.14, drag: 5 });
  G.flares.push({ x, y, r: 30, col: [200, 160, 255], t: 0.1, glow: 0.12 });
  G.sfx?.('orb');
}

// 매 프레임 (main.js stepBullets 가 orb 이면 부름): 속도 방향만 적 쪽으로 휘고 나이를 셈. 위치 이동·벽·적 맞음은 main
// 평타 = 앞쪽 120px 안 가까운 적에게 살짝(초당 3rad) · 기술 도깨비불(wisp) = 처음 0.18초 퍼졌다가 정한 적에게 세게(초당 10rad) 빨라지며
export function stepOrb(G, b, dt) {
  b.age = (b.age || 0) + dt;
  if (b.age > b.life) { b.dead = true; spark(b.x, b.y, -Math.PI / 2, 6, { cols: ['#eadcff', '#c79bff', '#8a5ad0'], v: 50, spread: 2.5, g: -40, life: 0.3, drag: 4 }); return; }
  (b.tail ||= []).push(b.x, b.y);
  if (b.tail.length > 16) b.tail.splice(0, 2);
  const sp = Math.hypot(b.vx, b.vy);
  let tgt = b.target && !b.target.dead ? b.target : null;
  if (!tgt) tgt = b.target = nearest(G, b, b.wisp ? 260 : 120, b.wisp ? 7 : 1.1);
  if (b.wisp && b.age < 0.18) { b.vx *= Math.exp(-dt * 6); b.vy *= Math.exp(-dt * 6); return; }   // 피어나며 잠깐 멈칫
  const want = b.wisp ? Math.min(330, sp + 900 * dt) : sp;
  let a = Math.atan2(b.vy, b.vx);
  if (tgt) {
    let da = Math.atan2(tgt.y - tgt.h / 2 - b.y, tgt.x - b.x) - a;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const turn = (b.wisp ? 10 : 3) * dt;
    a += Math.max(-turn, Math.min(turn, da));
  }
  b.vx = Math.cos(a) * want; b.vy = Math.sin(a) * want;
  if (Math.random() < dt * 30) spark(b.x, b.y, a + Math.PI, 1, { cols: ['#c79bff', '#8a5ad0'], v: 20, spread: 1.5, g: -30, life: 0.25, drag: 3 });
}
// 날아가는 쪽 앞(cone rad 안), R 안에서 가장 가까운 산 적
function nearest(G, b, R, cone) {
  const a0 = Math.atan2(b.vy, b.vx);
  let best = null, bd = R;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - b.x, dy = e.y - e.h / 2 - b.y, d = Math.hypot(dx, dy);
    if (d >= bd) continue;
    let da = Math.atan2(dy, dx) - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) > cone) continue;
    best = e; bd = d;
  }
  return best;
}

// 그리기 (월드 좌표): 꼬리 = 지나온 자리를 따라 작아지는 도트 → 몸 = 부드러운 보라 빛 번짐(더하기) + 도트 심 · 일렁이는 불꽃 혀
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function drawOrb(ctx, b, t) {
  const [r, g, bl] = rgb(b.orb || '#c79bff');
  const hi = `rgb(${(r + 255 * 2) / 3 | 0},${(g + 255 * 2) / 3 | 0},${(bl + 255 * 2) / 3 | 0})`, mid = b.orb || '#c79bff', dark = `rgb(${r * 0.45 | 0},${g * 0.4 | 0},${bl * 0.6 | 0})`;
  const big = b.wisp ? 1.3 : 1, x = Math.round(b.x), y = Math.round(b.y), ph = t * 18 + (b.x + b.y) * 0.1;
  ctx.save();
  // 부드러운 빛 (테두리 없이 번짐)
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 11 * big);
  gr.addColorStop(0, `rgba(${r},${g},${bl},0.55)`); gr.addColorStop(0.45, `rgba(${r},${g},${bl},0.2)`); gr.addColorStop(1, `rgba(${r},${g},${bl},0)`);
  ctx.fillStyle = gr; ctx.fillRect(b.x - 12 * big, b.y - 12 * big, 24 * big, 24 * big);
  ctx.globalCompositeOperation = 'source-over';
  // 그림이 있으면 (art/fx/fx_atk_moon.png 줄 3: 초승달 품은 도깨비불 + 뒤로 일렁이는 불꽃 혀, 4장 반복) 그걸로 — 공 심이 칸 오른쪽 3/4 자리
  const sz = (b.big ? 1.35 : 1) * big, va = Math.atan2(b.vy, b.vx), W = 46 * sz;
  if (drawSpiritCell(ctx, 3, Math.floor(t * 14 + b.x * 0.01) & 3, b.x - Math.cos(va) * W * 0.24, b.y - Math.sin(va) * W * 0.24, W, { sheet: 'atk_moon', ang: va })) { ctx.restore(); return; }
  // 꼬리: 지나온 자리를 1px 씩 이어 그림 — 오래된 쪽일수록 가늘고 어둡게 (체크무늬 없이 굵기로 사라짐)
  const T = b.tail || [], n = T.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = T[i * 2], y0 = T[i * 2 + 1], x1 = i + 1 < n ? T[i * 2 + 2] : b.x, y1 = i + 1 < n ? T[i * 2 + 3] : b.y, L = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s < L; s++) {
      const u = (i + s / L + 1) / (n + 1), sz = Math.max(1, Math.round(3 * big * u));
      ctx.fillStyle = u > 0.7 ? mid : u > 0.35 ? dark : '#2a1a50';
      ctx.fillRect(Math.round(x0 + (x1 - x0) * s / L - sz / 2), Math.round(y0 + (y1 - y0) * s / L - sz / 2), sz, sz);
    }
  }
  // 불꽃 혀: 날아가는 반대쪽으로 일렁임
  const a = Math.atan2(b.vy, b.vx) + Math.PI, wob = Math.sin(ph) * 0.5;
  for (let k = 1; k <= 4; k++) {
    ctx.fillStyle = k < 2 ? hi : k < 4 ? mid : dark;
    ctx.fillRect(Math.round(x + Math.cos(a + wob * k * 0.3) * k * 1.6 * big), Math.round(y + Math.sin(a + wob * k * 0.3) * k * 1.6 * big - k * 0.4), 2, 2);
  }
  // 몸: 바깥 보라 → 안 연보라 → 흰 심 (깜빡이며 살짝 커졌다 작아짐)
  const R = (b.wisp ? 3 : 2) + (Math.sin(ph * 0.7) > 0.3 ? 1 : 0);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > R + 0.3) continue;
    ctx.fillStyle = d < R * 0.5 ? '#ffffff' : d < R * 0.8 ? hi : mid;
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  ctx.restore();
}
