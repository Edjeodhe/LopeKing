// 모션 = 뼈 각도 데이터 (옆모습 전용). 그림을 바꿔도 모션은 그대로.
// 픽셀 게임처럼 몇 장으로 끊어 보여 준다 (매끈하게 이어지면 리그 티가 남): 달리기 8장, 공격 30fps.
import { ZERO, lerpPose, CAPE_SEGS } from './rig.js';

export const P = o => ({ ...ZERO, ...o });

// 대기 (적·보스 공용 — 주인공은 아래 heroIdle): 칼을 몸 앞 낮게 들고 무릎을 살짝 굽힌 자세 (꼿꼿하면 허수아비 같음)
export const IDLE = P({ torso: 8, head: -4, nU: 18, nF: 52, sw: 34, fU: -12, fF: 34, nT: 16, nS: -16, fT: -14, fS: -4, y: 0.5 });

// 대기 숨쉬기 (약 3초 주기)
export function idle(t) {
  const ph = (t / 3.2) % 1;
  const b = ph < 0.55 ? Math.sin(ph / 0.55 * Math.PI / 2) * 2 - 1 : Math.cos((ph - 0.55) / 0.45 * Math.PI / 2) * 2 - 1;
  const q = Math.round(b * 2) / 2;   // 숨도 3단으로 끊음
  return { ...IDLE, br: q, y: IDLE.y - q * 0.4, torso: IDLE.torso - q, nU: IDLE.nU + q * 2, fU: IDLE.fU + q * 2, sw: IDLE.sw + q };
}

// 달리기 (적·보스 공용 — 주인공은 heroRun): 상체 숙이고 칼은 몸 뒤로 낮게 끌고, 디딜 때 몸이 툭 떨어졌다 차오름. 8장
export const RUN_FRAMES = 8;
export function run(p) {
  p = Math.floor((((p % 1) + 1) % 1) * RUN_FRAMES) / RUN_FRAMES;
  const s = Math.sin(p * Math.PI * 2), c = Math.cos(p * Math.PI * 2);
  const leg = q => {   // 한 다리: 허벅지 앞뒤 + 뒤로 찰 때 무릎 굽힘
    const a = Math.sin(q * Math.PI * 2), b = Math.cos(q * Math.PI * 2);
    return { T: 38 * a - 4, S: -12 - 46 * Math.max(0, -b) - 18 * Math.max(0, a) };
  };
  const n = leg(p), f = leg(p + 0.5);
  const bob = Math.abs(c) < 0.5 ? 1.2 : 0;
  return P({
    torso: 20, head: -12, y: bob - 0.5,
    nU: -38 + 8 * s, nF: 30, sw: -70,           // 칼 든 팔은 뒤로, 칼은 뒤쪽 아래로 끔
    fU: 32 * s + 10, fF: 50 - 10 * s,              // 빈손은 다리와 반대로 흔듦
    nT: n.T, nS: n.S, fT: f.T, fS: f.S,
  });
}

// ---------- 주인공 대기·달리기 (카타나 제로풍) ----------
// art/dokkaebi/pose_idle.png · pose_run.png (Codex 로 뽑은 자세 참고 시트)에 리그를 맞춘 값 (tools/posefit.js).
// 대기: 힘 빼고 살짝 구부정하게 서서 칼을 옆에 낮게 늘어뜨림 — 칼끝은 앞·아래 땅 쪽. 4장을 평균 내 기본 자세로 두고 숨만 얹음
export const HERO_IDLE = P({ torso: 1.5, head: -9.5, nU: -15, nF: 19, sw: 70, fU: -5.5, fF: 1, nT: 8.5, nS: -16, fT: -21, fS: -3.5, y: 0.5 });
export function heroIdle(t) {
  const ph = (t / 3.2) % 1;   // 숨 주기 3.2초
  const b = ph < 0.55 ? Math.sin(ph / 0.55 * Math.PI / 2) * 2 - 1 : Math.cos((ph - 0.55) / 0.45 * Math.PI / 2) * 2 - 1;
  const q = Math.round(b * 2) / 2;   // 숨도 3단으로 끊음 (들이쉼 = 어깨가 올라가고 가슴이 부풂)
  const I = HERO_IDLE;
  return { ...I, br: q, y: I.y - q * 0.4, torso: I.torso - q, head: I.head + q, nU: I.nU + q * 2.5, fU: I.fU + q * 2.5, sw: I.sw - q };
}
// 달리기: 윗몸은 참고 시트 8장에 맞춘 값의 가운데값(조금 덜 눕힘 — 고개를 들고 앞을 봄), 칼 든 팔은 뒤로 칼을 수평에 가깝게 끌고
// 빈손 주먹은 앞에서 다리와 반대로 크게 흔듦. 다리는 손으로 짠 8장 전력 질주 (참고 시트의 접지 → 내려앉음 → 밀기 → 차올림 → 지나감 → 무릎 올림 → 뻗음)
// [허벅지 T, 정강이 S] — 한쪽 다리의 8장, 반대 다리는 4장 늦게
const SPRINT = [[52, -12], [28, -34], [-8, -16], [-40, -24], [-32, -96], [22, -112], [70, -84], [62, -30]];
const SPRINT_Y = [1.5, 2.5, 0.5, -1.5];   // 디딜 때 낮고 떠 있을 때 높음 (반 바퀴마다 되풀이)
export function heroRun(p) {
  const i = Math.floor((((p % 1) + 1) % 1) * RUN_FRAMES), s = Math.sin(i / RUN_FRAMES * Math.PI * 2);
  const [nT, nS] = SPRINT[i], [fT, fS] = SPRINT[(i + 4) % 8];
  return P({
    rot: -14, torso: 17, head: -24, y: SPRINT_Y[i % 4],
    nU: -21 - 8 * s, nF: 26, sw: -93 + 6 * s,     // 칼은 등 뒤로 (칼 세상 각도 ≈ -100)
    fU: 70 + 22 * s, fF: 60 - 12 * s,              // 빈손 주먹은 앞에서 크게 흔듦
    nT, nS, fT, fS,
  });
}

// 주인공 점프 (사람 비율 — 허벅지 ≈ 정강이, 팔이 허리 아래까지): 세로 속도로 세 열쇠 자세를 섞음
//   솟음: 몸을 위로 펴고 앞무릎을 끌어올리며 뒷다리는 곧게 늘어뜨림, 칼 든 팔은 뒤로·빈 팔은 앞위로 치켜 차오름
//   꼭대기: 두 무릎을 당겨 몸을 웅크림 · 떨어짐: 다리를 아래로 뻗어 디딜 준비, 두 팔을 벌려 균형
const AIR_RISE = P({ torso: 8, head: -4, nU: -35, nF: 25, sw: -55, fU: 95, fF: 45, nT: 75, nS: -95, fT: -18, fS: -12, y: -1 });
const AIR_APEX = P({ torso: 18, head: -10, nU: -20, nF: 50, sw: -60, fU: 60, fF: 70, nT: 70, nS: -110, fT: 45, fS: -105, y: -2 });
const AIR_FALL = P({ torso: 6, head: -2, nU: -70, nF: 20, sw: -30, fU: 95, fF: 30, nT: 30, nS: -38, fT: 2, fS: -24 });
export function heroAir(vy) {
  const s = Math.max(-1, Math.min(1, vy / 300));
  return s < 0 ? lerpPose(AIR_APEX, AIR_RISE, -s) : lerpPose(AIR_APEX, AIR_FALL, s);
}

export const JUMP = P({ torso: 6, head: -6, nU: -30, nF: 40, sw: -40, fU: 60, fF: 60, nT: 58, nS: -86, fT: -6, fS: -50, y: -1 });
export const FALL = P({ torso: -4, head: 4, nU: -50, nF: 20, sw: -30, fU: 80, fF: 20, nT: 24, nS: -30, fT: -16, fS: -24 });
export const LAND = P({ torso: 26, head: -14, nU: 10, nF: 60, sw: 60, fU: -10, fF: 50, nT: 64, nS: -96, fT: -20, fS: -50, y: 5 });
// 벽 타기: 벽 쪽 손을 벽에 대고 몸을 웅크림 (facing = 벽 반대쪽)
export const WALL = P({ torso: -4, head: 4, nU: 20, nF: 50, sw: 50, fU: -130, fF: 20, nT: 50, nS: -70, fT: 10, fS: -50 });
// 벽에 매달림 (쿠나이 돌진으로 벽에 붙음): 벽 쪽 손발로 버티고 몸은 벽 반대쪽(보는 쪽)으로 웅크림. facing = 벽 반대쪽
export const CLING = P({ torso: 18, head: -10, nU: 30, nF: 60, sw: 40, fU: -150, fF: 30, nT: 70, nS: -100, fT: -40, fS: -60, y: -2 });
export const DASH = P({ torso: 50, head: -30, nU: -60, nF: 20, sw: -40, fU: -70, fF: 15, nT: 64, nS: -60, fT: -52, fS: -24, y: 3 });
export const HURT = P({ torso: -22, head: -24, nU: 40, nF: 30, sw: 30, fU: 50, fF: 10, nT: 20, nS: -20, fT: -24, fS: -10, y: 1 });

// 로프에 매달림: 빈손(먼 팔)을 갈고리 쪽으로 뻗고, 몸은 로프 각도를 조금 따라 기움.
// ang = 로프 방향(뼈 기준, 180 = 바로 위, 보는 쪽으로 + ), swing = 접선 속도(-1~1, 다리가 흔들림)
export function hang(ang, swing, reel) {
  const tilt = Math.max(-50, Math.min(50, (180 - ang) * -0.45));
  return P({
    rot: -tilt, torso: 4, head: -10 + tilt * 0.2,
    fU: ang + tilt, fF: 0,                                  // 로프 쥔 팔: 곧게 갈고리 쪽
    nU: -30 - 20 * swing, nF: 40, sw: -50,                   // 칼 든 팔: 뒤로 빼 균형
    nT: 30 + 30 * swing + (reel ? 30 : 0), nS: -50 - (reel ? 40 : 0),
    fT: -10 + 30 * swing, fS: -30,
  });
}

// ---------- 공격 (마우스 방향 베기) ----------
// aim = 겨눈 방향(뼈 기준: 90 = 정면 수평, 180 = 위, 0 = 아래). 팔을 겨눈 방향 둘레로 크게 휘두름.
// dir: 1 = 위에서 아래로 내리침, -1 = 아래에서 위로 올려 벰 (콤보 번갈아)
export const SLASH = { wind: 0.05, act: 0.07, rec: 0.16 };
export const ATTACK_FPS = 30;
export function slash(t, aim, dir = 1, m = SLASH) {
  t = Math.floor(t * ATTACK_FPS) / ATTACK_FPS;
  const { wind, act, rec } = m;
  const from = aim + dir * 115, to = aim - dir * 95;
  const lean = Math.max(-30, Math.min(40, (aim - 90) * -0.35 + 18));
  const body = P({ torso: lean, head: -lean * 0.5, fU: -30, fF: 50, nT: 40, nS: -40, fT: -30, fS: -10, y: 2 });
  let u, sw, swLen = 1;
  if (t < wind) { const k = t / wind; u = aim + dir * (60 + 55 * k); sw = dir * 10; }
  else if (t < wind + act) {
    const k = (t - wind) / act, e = 1 - (1 - k) * (1 - k);
    u = from + (to - from) * e; sw = dir * (10 - 30 * e); swLen = 1.12;
  } else { const k = Math.min(1, (t - wind - act) / rec); u = to + 8 * k * dir; sw = -dir * 20; }
  return { ...body, nU: u, nF: 6, sw };
}
export const slashLen = () => SLASH.wind + SLASH.act + SLASH.rec;

// ---------- 콤보 4타 (가로 베기 위주) ----------
// 1 가로 베기: 칼을 눕혀 몸 뒤 → 가까운 쪽(카메라) → 앞으로 휩쓺 · 2 역방향: 앞 → 가까운 쪽 → 뒤로 되돌림
// 3 올려 베기 = slash(dir -1) 팔 + 깊이 웅크렸다 솟는 몸 · 4 회전 마무리: 앞으로 내디디며 한 바퀴 (반 바퀴쯤 등이 보임 = turn)
// 1~3타는 몸을 감았다(wind) 크게 내디디며 풀고(act) 버티는(rec) 세 열쇠 자세(BODY)를 이어 액션이 큼직하게 보이게.
// 판정·이펙트는 wind ~ wind+act 동안 (main.js stepCombat). dmg = 피해, cd = 다음 타를 받기까지 (rec 끝물은 다음 타로 끊음)
export const COMBO = [
  { name: 'sweep', wind: 0.07, act: 0.07, rec: 0.18, dmg: 1 },
  { name: 'sweepBack', wind: 0.05, act: 0.07, rec: 0.18, dmg: 1 },
  { name: 'rise', wind: 0.07, act: 0.08, rec: 0.18, dmg: 1 },
  { name: 'spin', wind: 0.08, act: 0.2, rec: 0.24, dmg: 2 },
];
export const COMBO_WINDOW = 0.35;   // 공격이 끝난 뒤 이 안에 다시 누르면 다음 타
export const moveLen = m => m.wind + m.act + m.rec;
export const moveCd = (m, i) => i === COMBO.length - 1 ? moveLen(m) + 0.15 : m.wind + m.act + m.rec * 0.5;

// 눕힌 칼: 칼끝이 허리 높이의 납작한 타원 위 phi(도)에 있음 — 0 = 앞, 90 = 가까운 쪽(카메라), ±180 = 몸 뒤, -90 = 먼 쪽.
// 앞/뒤로 뻗으면 칼이 길고, 카메라 쪽·먼 쪽이면 짧게(swLen) 줄여 누운 것처럼. 먼 쪽이면 칼을 몸 뒤 층에(swBack).
// aim 만큼 타원을 기울임 (±45°)
function flat(phi, aim, body) {
  const a = phi * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const tilt = Math.max(-45, Math.min(45, aim - 90)) * Math.PI / 180;
  // 화면 방향(앞 +, 아래 +) → 기울임 → 뼈 기준 각도(0 아래, 90 앞)
  const rot = (x, y) => [x * Math.cos(tilt) + y * Math.sin(tilt), -x * Math.sin(tilt) + y * Math.cos(tilt)];
  const deg = (x, y) => Math.atan2(x, y) * 180 / Math.PI;
  const [bx, by] = rot(c, s * 0.3);
  const [hx, hy] = rot(0.55 * c + 0.3, 0.55 + 0.15 * s);   // 손: 어깨 높이 앞에서 칼끝을 따라 작게 돎
  const torso = body.torso;
  const u = deg(hx, hy) + torso, nF = 35 * (1 - Math.abs(c));
  return { ...body, nU: u, nF, sw: deg(bx, by) - u - nF + torso, swLen: Math.max(0.3, Math.hypot(c, s * 0.3)), swBack: s < -0.25 ? 1 : 0 };
}
const ease = k => 1 - (1 - k) * (1 - k);
// 시간 t 동안 phi 를 wind(a0→a1) · act(a1→a2, 빠르게) · rec(a2→a3) 로 이음
function phiAt(m, t, a0, a1, a2, a3) {
  if (t < m.wind) return a0 + (a1 - a0) * (t / m.wind);
  if (t < m.wind + m.act) return a1 + (a2 - a1) * ease((t - m.wind) / m.act);
  return a2 + (a3 - a2) * Math.min(1, (t - m.wind - m.act) / m.rec);
}
// 몸 열쇠 자세 [감기(wind 끝), 풀기(act 끝), 버팀(rec 끝)] — 팔·칼은 따로 (flat · slash)
const BODY = {
  // 가로: 상체를 뒤로 감고 앞발을 들었다가 → 크게 내디디며 상체를 앞으로 던짐
  sweep: [
    P({ torso: -8, head: 4, fU: 55, fF: 40, nT: 26, nS: -50, fT: -6, fS: -34, y: 3 }),
    P({ torso: 32, head: -20, fU: -55, fF: 30, nT: 74, nS: -74, fT: -54, fS: -6, y: 5 }),
    P({ torso: 24, head: -14, fU: -45, fF: 40, nT: 62, nS: -66, fT: -48, fS: -10, y: 4 }),
  ],
  // 역방향: 앞으로 던진 몸을 그대로 비틀어 되돌리며 뒷발로 버팀
  sweepBack: [
    P({ torso: 36, head: -18, fU: -65, fF: 30, nT: 68, nS: -72, fT: -50, fS: -8, y: 5 }),
    P({ torso: 4, head: -2, fU: 65, fF: 50, nT: 34, nS: -34, fT: -62, fS: -22, y: 3 }),
    P({ torso: 12, head: -8, fU: 45, fF: 50, nT: 40, nS: -42, fT: -52, fS: -16, y: 3 }),
  ],
  // 올려 베기: 깊이 웅크렸다가 몸을 펴며 솟구침 (땅에선 살짝 뜀 — player.js)
  rise: [
    P({ torso: 40, head: -22, fU: -40, fF: 40, nT: 84, nS: -112, fT: -40, fS: -54, y: 7 }),
    P({ torso: -16, head: 12, fU: -85, fF: 20, nT: 34, nS: -24, fT: -18, fS: -12, y: -2 }),
    P({ torso: -6, head: 4, fU: -60, fF: 30, nT: 42, nS: -52, fT: -24, fS: -22, y: 0 }),
  ],
};
// 시간 t 의 몸: 대기 자세 → 감기(wind, 빠르게) → 풀기(act, 튕기듯) → 버팀(rec 앞 절반) 그대로
function bodyAt(keys, m, t) {
  if (t < m.wind) return lerpPose(IDLE, keys[0], ease(t / m.wind));
  if (t < m.wind + m.act) return lerpPose(keys[0], keys[1], ease((t - m.wind) / m.act));
  return lerpPose(keys[1], keys[2], Math.min(1, (t - m.wind - m.act) / (m.rec * 0.5)));
}
export function sweep(t, aim) {
  t = Math.floor(t * ATTACK_FPS) / ATTACK_FPS;
  const m = COMBO[0];
  return flat(phiAt(m, t, 150, 178, -40, -55), aim, bodyAt(BODY.sweep, m, t));
}
export function sweepBack(t, aim) {
  t = Math.floor(t * ATTACK_FPS) / ATTACK_FPS;
  const m = COMBO[1];
  return flat(phiAt(m, t, -45, -60, 175, 185), aim, bodyAt(BODY.sweepBack, m, t));
}
export function rise(t, aim) {
  t = Math.floor(t * ATTACK_FPS) / ATTACK_FPS;
  const m = COMBO[2], s = slash(t, aim, -1, m);
  return { ...bodyAt(BODY.rise, m, t), nU: s.nU, nF: s.nF, sw: s.sw };
}
// 회전 마무리: 웅크렸다가 칼끝이 몸 뒤에서 한 바퀴 반 돌아 앞에서 멈춤, 몸은 가운데쯤 돌아섬(turn)
export function spin(t, aim) {
  t = Math.floor(t * ATTACK_FPS) / ATTACK_FPS;
  const m = COMBO[3], k = Math.max(0, Math.min(1, (t - m.wind) / m.act));
  const phi = phiAt(m, t, 150, 178, -370, -380);   // 몸 뒤에서 한 바퀴 반 돌아 앞에서 멈춤
  const turn = k > 0.3 && k < 0.62 ? 1 : 0;
  const body = P({ torso: t < m.wind ? 30 : 10, head: -10, fU: t < m.wind ? 40 : -60, fF: 30, nT: 56, nS: -70, fT: -40, fS: -20, y: t < m.wind ? 5 : 3 });
  // 돌아선 동안엔 그림이 뒤집혀 그려지므로 칼끝 자리도 앞뒤를 바꿔 줌
  const o = flat(turn ? 180 - phi : phi, turn ? 90 : aim, body);
  return { ...o, turn };
}
// 콤보 i 번째 타의 자세
export function comboPose(i, t, aim) {
  return i === 0 ? sweep(t, aim) : i === 1 ? sweepBack(t, aim) : i === 2 ? rise(t, aim) : spin(t, aim);
}

// 처형(로프로 끌려가 베기) 준비 자세: 칼을 몸 뒤로 크게 젖힘
export const ZIP = P({ torso: 40, head: -24, nU: -110, nF: 20, sw: -50, fU: 95, fF: 0, nT: 30, nS: -70, fT: -50, fS: -40 });

// 자세 사이를 부드럽게 따라가기 (관절마다 속도가 다름). 숫자만
const FOLLOW = { x: 30, y: 30, rot: 14, torso: 22, head: 18 };
export function follow(cur, target, dt, mul = 1) {
  const o = {};
  for (const k in target) {
    const v = target[k];
    if (typeof v !== 'number' || cur[k] === undefined) { o[k] = v; continue; }
    o[k] = cur[k] + (v - cur[k]) * (1 - Math.exp(-dt * (FOLLOW[k] ?? 26) * mul));
  }
  return o;
}
export { lerpPose };

// ---------- 망토 사슬 ----------
// 마디마다 세상 기준 각도(뼈 기준: 0 아래, - 뒤로)를 스프링으로 따라감. 바람 = 몸이 움직이는 반대쪽 + 중력.
// 뒤 마디일수록 늦게·크게 펄럭임. vx·vy = 몸 속도(px/s), facing = 보는 쪽
export function newCape() { return { a: Array(CAPE_SEGS).fill(0), w: Array(CAPE_SEGS).fill(0), t: Math.random() * 10 }; }
export function stepCape(cape, vx, vy, facing, dt) {
  cape.t += dt;
  const G = 260, K = 2.8;   // 바람 세기: 달리면(125px/s) 55° 남짓, 대시·로프 스윙이면 수평으로 날림
  const fx = -vx * K, fy = G - vy * K * 0.3;   // 떨어질 때 너무 크게 들리면 머리 위로 깃발처럼 솟음
  // 세상 각도(화면: 아래 0, 오른쪽 +) → 뼈 기준(보는 쪽 +)
  let target = Math.atan2(fx, fy) * 180 / Math.PI * facing;
  const speed = Math.hypot(vx, vy);
  for (let i = 0; i < cape.a.length; i++) {
    // 펄럭임: 움직일수록 크고 빠르게, 가만히 있어도 밤바람에 끝자락이 살랑 (뒤 마디일수록 크게)
    const flutter = Math.sin(cape.t * (11 + i * 3) + i * 1.7) * Math.min(22, 3 + speed * 0.08) * (0.5 + i * 0.5);
    const want = (i === 0 ? target * 0.75 : cape.a[i - 1] + (target - cape.a[i - 1]) * 0.6) + flutter;
    const k = 120 - i * 25, damp = 10 - i * 1.5;
    cape.w[i] += ((want - cape.a[i]) * k - cape.w[i] * damp) * dt;
    cape.a[i] += cape.w[i] * dt;
    cape.a[i] = Math.max(-165, Math.min(60, cape.a[i]));
  }
  return cape.a.map(v => Math.round(v / 6) * 6);   // 6도 단위로 끊어 픽셀이 덜 떨리게
}
