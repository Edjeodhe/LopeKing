// 가면별 평타 이펙트 (로그라이크 가면: 불 · 물 · 달). 기본 도깨비는 main.js comboFx · hitBloom 그대로.
// 그림 = Codex 흑백 시트 art/fx/fx_atk_<가면>.png (4×4 칸, 줄마다 4장) → fx.js spiritFx 로 가면 색(SPIRIT)에 물들여 '더하기'로 그림 (테두리 없이 부드러운 빛)
//   fire  : 줄 0 두꺼운 방망이 궤적 · 1 땅 내리치기(균열·불씨, 땅 = 칸 아래) · 2 둔기 타격 폭발 · 3 마무리 불 고리
//   water : 줄 0 쌍낫 엇갈린 물줄기 · 1 가는 물 초승달 · 2 물 튐 · 3 마무리 소용돌이
//   moon  : 줄 0 달빛 부채꼴(기준 = 칸 왼쪽) · 1 부적 종이 조각 · 2 도깨비불 명중 · 3 도깨비불 (날아가는 공, 4장 반복 — skills.js drawOrb)
// 불 = 힘: 굵고 느리고 '쾅' (타격 멈춤·흔들림 크게, 재·불티) · 물 = 속도: 가늘고 빠르게 두 줄 (멈춤 짧게, 물방울·물안개) · 달 = 주술: 부채 + 부적 + 도깨비불
import { spiritFx, sweepArc, spark, ring, dust, speedLine, shake, SPIRIT_COLS, FX_LIGHT } from './fx.js';
import { sfx } from './sfx.js';

const D = Math.PI / 180;
// 겨눈 각 a → 그림 기울기 (왼쪽 f<0 이면 뒤집은 그림 기준), lim 까지
function tiltOf(a, f, lim = 1.2) {
  let t = f < 0 ? a - Math.PI : a; while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI;
  return Math.max(-lim, Math.min(lim, t));
}
const EMBER = ['#fff4d0', '#ffc060', '#ff7a28'], ASH = ['#7a706a', '#5a524e', '#9a8e84'];
const DROP = ['#ffffff', '#c8f8ff', '#5ae8ff'];
const burst = (x, y, a, n, len) => { for (let i = 0; i < n; i++) { const b = a + (i / n) * Math.PI * 2, k = 0.5 + 0.5 * Math.max(0, Math.cos(b - a)); speedLine(x, y, Math.cos(b), Math.sin(b), len * (0.5 + k) * (0.7 + Math.random() * 0.6)); } };

// ---------- 불 도깨비: 거대 방망이 (콤보 0 가로 · 2 올려치기 · 3 회전 마무리 → 땅 내리치기) ----------
const fire = {
  swingSfx: c => c === 3 ? 'spinHeavy' : 'swingHeavy', hitSfx: 'hitFire', stop: 1.5, shake: 1.5,
  swing(G, p, at, m, sp) {
    const f = p.facing, a = at.ang, ca = Math.cos(a), sa = Math.sin(a), act = m.act / sp;
    // 칼 같은 가는 도트 띠(sweepArc)는 안 씀 — 두꺼운 불 궤적 그림만 몸을 따라감 (사용자: 칼날 초승달 말고 '쾅')
    if (at.combo === 0) spiritFx({ sheet: 'atk_fire', row: 0, follow: p, x: ca * 32, y: -20 + sa * 32, w: 128, ang: tiltOf(a, f), flip: f < 0, life: act + 0.36, a: 0.85 });
    if (at.combo === 2) spiritFx({ sheet: 'atk_fire', row: 0, follow: p, x: f * 16, y: -30, w: 116, ang: tiltOf(-Math.PI / 2 + f * 0.6, f), flip: f < 0, vflip: true, life: act + 0.36, a: 0.85 });
    if (at.combo === 3) spiritFx({ sheet: 'atk_fire', row: 3, follow: p, x: 0, y: -14, w: 132, flip: f < 0, life: act + 0.3, a: 0.7 });
    // 휘두를 때 방망이 끝에서 떨어지는 불씨
    spark(p.x + ca * 26, p.cy + sa * 26, a + Math.PI, 6, { cols: EMBER, v: 90, spread: 1.6, g: -70, life: 0.45, drag: 3 });
    G.flares.push({ x: p.x + ca * 20, y: p.cy, r: 56, col: [...FX_LIGHT], t: 0.22, glow: 0.12 });
  },
  // 마무리 끝: 앞쪽 땅을 내리침 (공중이면 앞에서 터짐)
  finish(G, p, at) {
    const f = p.facing, gx = p.x + f * 34;
    if (p.onGround) {
      spiritFx({ sheet: 'atk_fire', row: 1, x: gx, y: p.y + 2, py: 0.86, w: 128, flip: f < 0, life: 0.5, a: 0.9 });
      dust(gx - 8, p.y, -1, 7); dust(gx + 8, p.y, 1, 7);
      spark(gx, p.y - 2, -Math.PI / 2, 14, { cols: EMBER, v: 230, spread: 1.4, g: 420, life: 0.55, size: 2 });
      spark(gx, p.y - 4, -Math.PI / 2, 8, { cols: ASH, v: 60, spread: 2, g: -25, life: 0.8, drag: 2 });
    } else spiritFx({ sheet: 'atk_fire', row: 2, x: gx, y: p.cy, w: 110, life: 0.4 });
    G.flares.push({ x: gx, y: p.y - 6, r: 90, col: [...FX_LIGHT], t: 0.3, glow: 0.2 });
    G.stop = Math.max(G.stop, 0.05);
    sfx('smash');
    return [9, 0, 6];   // 흔들림 (세기, 밀림 x, y)
  },
  hit(G, p, e, x, y, ang, fin) {
    const k = fin ? 1.35 : 1;
    spiritFx({ sheet: 'atk_fire', row: 2, x: e.x + Math.cos(ang) * 4, y: e.cy, w: 64 * k, ang: Math.random() * 0.6 - 0.3, flip: Math.cos(ang) < 0, life: 0.34, a: 0.7 });
    ring({ x: e.x, y: e.cy, rx: 11 * k, ry: 11 * k, life: 0.2, th: 2, grow: 1.4, cols: SPIRIT_COLS });
    spark(x, y, ang, Math.round(10 * k), { cols: EMBER, v: 260 * k, spread: 1.1, g: 380, life: 0.4, size: 2 });   // 튀는 불티 (떨어짐)
    spark(e.x, e.cy, -Math.PI / 2, Math.round(7 * k), { cols: ASH, v: 70, spread: 2.4, g: -30, life: 0.8, drag: 2.5 });   // 피어오르는 재
    burst(e.x, e.cy, ang, 8, 22 * k);
    G.flares.push({ x: e.x, y: e.cy, r: 56 * k, col: [...FX_LIGHT], t: 0.2, glow: 0.18 });
  },
};

// ---------- 물 도깨비: 쌍낫 (콤보 0 · 1 번갈아 빠르게 → 3 소용돌이 마무리) ----------
const water = {
  swingSfx: c => c === 3 ? 'spinWater' : 'swingWater', hitSfx: 'hitWater', stop: 0.6, shake: 0.7,
  swing(G, p, at, m, sp) {
    const f = p.facing, a = at.ang, ca = Math.cos(a), sa = Math.sin(a), act = m.act / sp;
    const tilt = Math.max(-45, Math.min(45, p.aim - 90)) * D * -f, back = at.combo === 1;
    if (at.combo < 2) {
      // 두 자루 = 가는 띠 두 줄이 살짝 어긋나 엇갈림
      const arc = { follow: p, x: ca * 10, y: -20 + sa * 10, f, th: 3, dur: act, life: act + 0.14 };
      sweepArc({ ...arc, rx: 54, ry: 15, tilt: tilt - 0.18, a0: (back ? -55 : 175) * D, a1: (back ? 180 : -45) * D });
      sweepArc({ ...arc, rx: 48, ry: 20, tilt: tilt + 0.22, y: arc.y + 3, a0: (back ? -40 : 165) * D, a1: (back ? 170 : -60) * D, dur: act * 1.2 });
      spiritFx({ sheet: 'atk_water', row: 0, x: p.x + ca * 22, y: p.cy + sa * 22, w: 100, ang: tiltOf(a, f, 0.9), flip: f < 0, vflip: back, life: act + 0.22, a: 0.9 });
    }
    if (at.combo === 3) {
      sweepArc({ follow: p, y: -16, rx: 58, ry: 17, f, th: 3, a0: 178 * D, a1: -400 * D, dur: act, life: act + 0.12 });
      sweepArc({ follow: p, y: -12, rx: 50, ry: 22, f, th: 3, a0: 160 * D, a1: -380 * D, dur: act * 1.1, life: act + 0.14 });
      spiritFx({ sheet: 'atk_water', row: 3, follow: p, x: 0, y: -14, w: 130, flip: f < 0, life: act + 0.3 });
    }
    spark(p.x + ca * 22, p.cy + sa * 22, a, 5, { cols: DROP, v: 170, spread: 1.0, g: 480, life: 0.32 });   // 물방울 튐
  },
  // 소용돌이 끝: 겨눈 쪽으로 물 초승달 하나 날리듯 + 물방울 둘레로
  finish(G, p, at) {
    const f = p.facing, a = at.ang, ca = Math.cos(a), sa = Math.sin(a);
    spiritFx({ sheet: 'atk_water', row: 1, x: p.x + ca * 34, y: p.cy + sa * 34, w: 140, ang: tiltOf(a, f), flip: f < 0, life: 0.34 });
    for (let i = 0; i < 8; i++) spark(p.x, p.cy, i / 8 * Math.PI * 2, 2, { cols: DROP, v: 200, spread: 0.3, g: 460, life: 0.4 });
    burst(p.x + ca * 30, p.cy + sa * 30, a, 6, 24);
    sfx('swingWater');
    return [3, ca * 2, sa * 2];
  },
  hit(G, p, e, x, y, ang, fin) {
    const k = fin ? 1.3 : 1;
    spiritFx({ sheet: 'atk_water', row: 2, x: e.x, y: e.cy, w: 64 * k, ang: tiltOf(ang, Math.cos(ang) < 0 ? -1 : 1, 0.8), flip: Math.cos(ang) < 0, life: 0.26 });
    spiritFx({ sheet: 'atk_water', row: 1, x: e.x, y: e.cy, w: 50 * k, ang: Math.random() * 1.2 - 0.6, flip: Math.random() < 0.5, vflip: Math.random() < 0.5, life: 0.16, a: 0.8 });
    spark(x, y, ang, Math.round(8 * k), { cols: DROP, v: 230 * k, spread: 1.0, g: 520, life: 0.36 });
    spark(e.x, e.cy, ang, 4, { cols: ['#bfeaf4', '#8ac8d8'], v: 40, spread: 2.5, g: -10, life: 0.5, drag: 3 });   // 물안개
    G.flares.push({ x: e.x, y: e.cy, r: 36 * k, col: [...FX_LIGHT], t: 0.1, glow: 0.1 });
  },
};

// ---------- 달 도깨비: 부적 부채 (근접 판정 없음 — 휘두르면 도깨비불 하나, skills.js spawnOrb) ----------
const moon = {
  swingSfx: () => 'fan', hitSfx: 'orbHit', stop: 1, shake: 1,
  // 던지는 순간: 부채꼴 달빛 + 부적 종이. 마무리(3)는 크게
  swing(G, p, at) {
    const f = p.facing, a = at.ang, ca = Math.cos(a), sa = Math.sin(a), big = at.combo === 3 ? 1.3 : 1, w = 84 * big;
    spiritFx({ sheet: 'atk_moon', row: 0, x: p.x + ca * (w * 0.3), y: p.cy - 4 + sa * (w * 0.3), w, ang: tiltOf(a, f, Math.PI), flip: f < 0, vflip: at.combo === 2, life: 0.32, a: 0.85 });
    spiritFx({ sheet: 'atk_moon', row: 1, x: p.x + ca * 14, y: p.cy - 6 + sa * 14, w: 58 * big, flip: f < 0, life: 0.5, a: 0.9 });
    spark(p.x + ca * 12, p.cy + sa * 12, a, 4, { cols: ['#ffffff', '#eadcff', '#c0c4e0'], v: 110, spread: 1.2, g: 30, life: 0.3, drag: 4 });
    G.flares.push({ x: p.x + ca * 24, y: p.cy, r: 44 * big, col: [...FX_LIGHT], t: 0.16, glow: 0.1 });
  },
  // 도깨비불이 맞음 (main.js stepBullets)
  orbHit(G, b, e) {
    const k = b.big ? 1.3 : 1;
    spiritFx({ sheet: 'atk_moon', row: 2, x: b.x, y: b.y, w: 64 * k, ang: Math.random() * 0.8 - 0.4, life: 0.3 });
    spiritFx({ sheet: 'atk_moon', row: 1, x: b.x, y: b.y, w: 44 * k, flip: Math.random() < 0.5, life: 0.42, a: 0.7 });
    spark(b.x, b.y, Math.atan2(b.vy, b.vx), 6, { cols: ['#ffffff', '#eadcff', '#c79bff'], v: 150, spread: 1.4, g: 0, life: 0.25, drag: 4 });
    G.flares.push({ x: b.x, y: b.y, r: 40 * k, col: [...FX_LIGHT], t: 0.14, glow: 0.14 });
  },
};

const MASK_FX = { fire, water, moon };
export const maskFxOf = p => MASK_FX[p?.mask] || null;
// 휘두르는 순간 (main.js comboFx 대신) — 근접 가면
export function maskComboFx(G, p, at, t, M) {
  const m = at.move, sp = p.atkSpd || 1;
  if (at.fx === 0 && t >= m.wind - 0.01) { at.fx = 1; M.swing(G, p, at, m, sp); }
  if (at.combo === 3 && at.fx === 1 && t >= m.wind + m.act * 0.7) {
    at.fx = 2;
    const [s, kx, ky] = M.finish(G, p, at);
    shake(s, kx, ky);
  }
}
