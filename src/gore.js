// 잔혹한 사망 연출 — 리그 부위를 잘라 날린다 (원더월드 프로토 gore.js 방식):
//   decap 참수 · bisect 두 동강 · sever 팔 절단 · burst 처형(사지가 다 흩어짐) · crumple 그대로 고꾸라짐
// 조각 = 죽은 순간의 자세에서 pose.only/hide 로 그 부위만 골라, 고해상도에서 돌려 같은 팔레트로 굽는다 (화면 결이 같음).
// 잘린 자리(그루터기)에선 피가 몇 번 뿜어지고, 피는 바닥·벽에 묻어 남는다 (fx.js decal).
import { bakeGib, newBakeCanvas, ACT } from './actor.js';   // 보스처럼 큰 개체는 e.low 크기·기준점을 따름
import { blood, pool, spark, BLOOD } from './fx.js';
import { P } from './anim.js';

const gibs = [];
let world = null;
export function initGore(w) { world = w; gibs.length = 0; }
export const gibList = () => gibs;

// 축 늘어진 자세 (쓰러진 몸)
const LIMP = P({ torso: -10, head: 20, nU: 30, nF: 10, sw: 10, fU: 40, fF: 10, nT: 20, nS: -10, fT: -10, fS: -5 });

// 어떻게 죽일지: hit = { kind: 'slash' | 'exec' | 'bullet' | 'spike', ang(맞은 방향, 라디안), power }
export function pickDeath(hit) {
  const r = Math.random();
  if (hit.kind === 'exec') return r < 0.55 ? 'burst' : 'bisect';
  if (hit.kind === 'bullet') return r < 0.4 ? 'decap' : 'crumple';
  if (hit.kind === 'spike') return 'crumple';
  // 칼: 가로로 벴으면 두 동강·참수, 세로로 벴으면 팔 절단·참수
  const horiz = Math.abs(Math.cos(hit.ang ?? 0)) > 0.6;
  if (horiz) return r < 0.45 ? 'bisect' : r < 0.85 ? 'decap' : 'sever';
  return r < 0.45 ? 'decap' : r < 0.8 ? 'sever' : 'crumple';
}

// e = 죽는 개체 { type, pose, facing, x, y(발), sock(마지막 굽기의 소켓, low px), vx }
export function killActor(e, hit, kind = pickDeath(hit)) {
  const ang = hit.ang ?? 0, dx = Math.cos(ang), dy = Math.sin(ang), pw = hit.power ?? 1;
  const big = e.kind === 'boss' ? 2 : 1;   // 보스: 키가 두 배라 관절 기본값·조각 반지름도 두 배
  const S = e.sock || {};
  const L = e.low || { width: ACT.CW, height: ACT.CH, ax: ACT.AX, ay: ACT.AY };
  const foot = [L.ax, L.ay];
  const at = (k, fb) => S[k] || fb;
  const neck = at('head', [foot[0], foot[1] - 28 * big]), chest = at('chest', [foot[0], foot[1] - 22 * big]), waist = at('waist', [foot[0], foot[1] - 14 * big]);
  const pose = { ...e.pose };
  const base = { type: e.type, facing: e.facing, ox: e.x - L.ax, oy: e.y - L.ay, size: [L.width, L.height, L.ax, L.ay] };
  // 날아가는 조각: only = 그릴 부위, c = 무게중심(low px), stump = 잘린 자리(low px), v = 속도
  const fly = (only, c, stump, vx, vy, spin, r = 4) => add({ ...base, pose: { ...pose, only }, c0: c, stump, x: base.ox + c[0], y: base.oy + c[1],
    vx: vx + (e.vx || 0) * 0.5, vy, va: spin, ang: 0, r: r * big, spurts: stump ? 3 + Math.floor(Math.random() * 3) : 0 });
  // 남은 몸: 발 기준으로 맞은 쪽 반대로 넘어짐 (hide = 떨어져 나간 부위)
  const topple = (hide, stump) => add({ ...base, pose: { ...pose, hide }, c0: foot, stump, x: e.x, y: e.y, topple: true,
    dir: Math.sign(dx || -e.facing) || 1, ang: 0, va: 0, spurts: stump ? 4 + Math.floor(Math.random() * 3) : 0, limp: 0 });
  const swordAway = (hide) => {
    if (!e.type.rig.sword) return;
    const h = S.hand || chest;
    fly(['sword'], h, null, dx * 90 + (Math.random() - 0.5) * 80, -160 - Math.random() * 80, (Math.random() - 0.5) * 30, 5);
    hide.push('sword');
  };
  const head = [neck[0], neck[1] - 7 * big];
  if (kind === 'decap') {
    fly(['head'], head, neck, dx * 140 * pw, -200 - Math.random() * 120, (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 10), 5);
    const hide = ['head']; swordAway(hide);
    topple(hide, neck);
    blood(base.ox + neck[0], base.oy + neck[1], -Math.PI / 2 + dx * 0.4, 26, 1.3);
  } else if (kind === 'bisect') {
    fly(['upper'], chest, waist, dx * 160 * pw, -170 - Math.random() * 60, (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 6), 7);
    topple(['upper'], waist);
    blood(base.ox + waist[0], base.oy + waist[1], ang, 34, 1.4);
    spark(base.ox + waist[0], base.oy + waist[1], ang, 6, { cols: ['#ffffff', '#ffd0d0'], v: 240, life: 0.12 });
  } else if (kind === 'sever') {
    const el = at('nearElbow', chest);
    fly(['nearArm'], el, at('nearShoulder', chest), dx * 120 * pw, -220, (Math.random() < 0.5 ? -1 : 1) * 14, 4);
    topple(['nearArm'], at('nearShoulder', chest));
    blood(base.ox + el[0], base.oy + el[1], ang, 22, 1.2);
  } else if (kind === 'burst') {
    // 처형: 사지가 사방으로. 머리 · 두 팔 · 몸통 · 하체
    const out = (a, s = 1) => [Math.cos(a) * 200 * s * pw, Math.sin(a) * 200 * s * pw - 120];
    let v = out(-Math.PI / 2 + dx * 0.5, 1.1); fly(['head'], head, neck, v[0], v[1], 18, 5);
    v = out(ang - 0.6); fly(['nearArm'], at('nearElbow', chest), at('nearShoulder', chest), v[0], v[1], -16, 4);
    v = out(ang + 0.7); fly(['farArm'], at('farElbow', chest), at('farShoulder', chest), v[0], v[1], 14, 4);
    v = out(ang, 0.7); fly(['torso', 'cape'], chest, waist, v[0], v[1], 8, 7);
    topple(['upper'], waist);
    blood(base.ox + chest[0], base.oy + chest[1], ang, 50, 1.8);
    blood(base.ox + chest[0], base.oy + chest[1], -Math.PI / 2, 24, 1.4);
  } else {
    const hide = []; swordAway(hide);
    topple(hide, null);
    blood(base.ox + chest[0], base.oy + chest[1], ang, 14, 1);
  }
  return kind;
}

function add(g) {
  g.low = newBakeCanvas(...(g.size || [])); g.dirty = true; g.t = 0; g.spurtT = 0.05; g.settled = false;
  gibs.push(g);
  if (gibs.length > 80) { const i = gibs.findIndex(q => q.settled); gibs.splice(i < 0 ? 0 : i, 1); }
  return g;
}

// 그루터기 자리(월드): 조각 무게중심에서 돌린 만큼
function stumpWorld(g) {
  const rx = g.stump[0] - g.c0[0], ry = g.stump[1] - g.c0[1], c = Math.cos(g.ang), s = Math.sin(g.ang);
  return [g.x + rx * c - ry * s, g.y + rx * s + ry * c, Math.atan2(rx * s + ry * c, rx * c - ry * s)];
}

export function updateGore(dt) {
  for (const g of gibs) {
    if (g.settled) continue;
    g.t += dt;
    // 그루터기에서 피가 몇 번 뿜어짐 (점점 약하게)
    if (g.spurts > 0 && g.stump && (g.spurtT -= dt) <= 0) {
      const [sx, sy, a] = stumpWorld(g);
      blood(sx, sy, g.topple ? -Math.PI / 2 + g.dir * 0.3 : a, 8 + g.spurts * 2, 0.6 + g.spurts * 0.12);
      g.spurts--; g.spurtT = 0.14 + Math.random() * 0.12;
    }
    if (g.topple) {
      // 발을 축으로 넘어짐 (가속) → 바닥에 닿으면 한 번 튐
      g.limp = Math.min(1, g.limp + dt * 4);
      for (const k of ['torso', 'head', 'nU', 'nF', 'fU', 'fF', 'nT', 'nS', 'fT', 'fS']) g.pose[k] += (LIMP[k] - g.pose[k]) * Math.min(1, dt * 6);
      g.va += 22 * dt;
      g.ang += g.dir * g.va * dt;
      const lim = Math.PI / 2 * 0.96;
      if (Math.abs(g.ang) >= lim) {
        g.ang = Math.sign(g.ang) * lim;
        if (g.va > 3) { g.va *= -0.25; }
        else if (!world.solidPx(g.x + g.dir * 14, g.y + 3) && !world.solidPx(g.x + g.dir * 22, g.y + 3)) {
          // 벼랑 끝으로 넘어갔으면 허공에 걸린 채 멈추지 않고 떨어짐
          g.topple = false; g.r = 6; g.vx = g.dir * 50; g.vy = 0; g.va = g.dir * 4;
        } else { g.settled = true; pool(g.x + g.dir * 12, g.y - 1, 10); }
      }
      g.dirty = true;
      continue;
    }
    g.vy += 640 * dt;
    let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
    if (world.solidPx(nx, ny + g.r)) {   // 바닥
      ny = Math.floor((ny + g.r) / 16) * 16 - g.r;
      if (g.vy > 80) { blood(nx, ny + g.r - 1, -Math.PI / 2, 4, 0.5); }
      g.vy = -g.vy * 0.28; g.vx *= 0.55; g.va *= 0.5;
      if (Math.abs(g.vy) < 40 && Math.abs(g.vx) < 25) {
        g.settled = true;
        // 눕힌 각도로: 길쭉한 조각(팔·몸통)은 옆으로 눕고, 머리는 가까운 직각으로, 칼은 꽂힌 그대로
        if (g.pose.only?.includes('head')) g.ang = Math.round(g.ang / (Math.PI / 2)) * (Math.PI / 2);
        else if (!g.pose.only?.includes('sword')) g.ang = Math.sin(g.ang) >= 0 ? Math.PI / 2 : -Math.PI / 2;
        if (g.stump) pool(nx, Math.floor((ny + g.r) / 16) * 16 - 1, 5);
      }
    } else if (world.solidPx(nx + Math.sign(g.vx) * g.r, ny)) { nx = g.x; g.vx = -g.vx * 0.4; }
    else if (world.solidPx(nx, ny - g.r)) { ny = g.y; g.vy = Math.abs(g.vy) * 0.3; }
    g.x = nx; g.y = ny;
    g.ang += g.va * dt;
    g.dirty = true;
    // 날아가며 피 흘림
    if (g.stump && g.t < 0.7 && Math.random() < 0.5) {
      const [sx, sy] = stumpWorld(g);
      spark(sx, sy, Math.PI / 2, 1, { v: 20, g: 500, life: 0.6, cols: [BLOOD[1], BLOOD[2]], blood: true, size: 1 });
    }
  }
}

// bakeNow: 30fps 로만 다시 굽기 (도트 애니메이션 느낌 + 비용 절반)
export function drawGore(ctx, bakeNow) {
  for (const g of gibs) {
    if (g.dirty && (bakeNow || !g.baked)) {
      bakeGib(g.type, g.pose, g.facing, g.low, g.c0, g.ang);
      g.dirty = false; g.baked = true;
    }
    const lift = g.topple ? Math.abs(Math.sin(g.ang)) * 4 : 0;
    ctx.drawImage(g.low, Math.round(g.x - g.low.width / 2), Math.round(g.y - g.low.height / 2 - lift));
  }
}
