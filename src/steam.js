// 가면 숨 (블리치 호로화처럼): 도깨비 가면 폼으로 가만히 서 있으면 가면 입에서 흰 김과 붉은 기운이 섞여 새어 나옴.
// 입에서 앞·아래로 가늘게 흘러나와 곧 위로 말려 오르고, 숨 주기(anim.js idle, 3.2초)에 맞춰 내쉴 때 앞으로 크게 한 번 뿜음.
// 김 한 덩이 = 도트 원(반지름 1 → 3~4px)이 커지며 색이 한 단씩 바뀌다 끝물에 줄어들며 사라짐 (반투명·체크무늬 없음)
const puffs = [];
// 흰 김: 흰 → 옅은 분홍 → 잿빛 · 붉은 기운: 선홍 → 진홍 → 검붉음
const RAMP = { w: ['#ffffff', '#f2dce2', '#c4b0c0', '#8a7a92'], r: ['#ff6a5a', '#e0283a', '#a01428', '#5a0c1c'] };
const BREATH = 3.2, EXHALE = 0.55;   // anim.js idle 과 같은 주기·내쉬는 자리
let seep = 0;

// 가면 입: 머리 기준점(목)에서 보는 쪽 앞·위 (게임 px, art/dokkaebi 머리 그림 + SD 배율 기준)
const mouth = p => [p.sock.head[0] + (p.drawFacing ?? p.facing) * 5, p.sock.head[1] - 3];

function puff(x, y, vx, vy, big, kind) {
  puffs.push({ x, y, vx, vy, t: 0, kind, life: (big ? 0.85 : 0.55) + Math.random() * 0.35, r: big ? 2.6 + Math.random() * 1.4 : 1.2 + Math.random() * 0.8 });
  if (puffs.length > 110) puffs.shift();
}

export function stepSteam(dt, p) {
  for (const q of puffs) {
    q.t += dt;
    q.vx *= Math.exp(-dt * 3.2); q.vy = q.vy * Math.exp(-dt * 2.2) - 34 * dt;   // 앞으로 뿜던 힘이 빠지며 위로 말려 오름
    q.x += q.vx * dt; q.y += q.vy * dt;
  }
  for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t >= puffs[i].life) puffs.splice(i, 1);
  if (p.dead || p.mask !== 'dokkaebi' || !p.sock?.head || (p.idleT || 0) < 0.35) return;
  const f = p.drawFacing ?? p.facing, [mx, my] = mouth(p);
  // 내쉼: 숨 주기의 EXHALE 자리를 지나는 순간 앞·아래로 크게 뿜음 (흰 김 사이로 붉은 기운)
  const ph = (p.t / BREATH) % 1, prev = ((p.t - dt) / BREATH) % 1;
  if (prev < EXHALE && ph >= EXHALE) for (let i = 0; i < 9; i++) puff(mx, my, f * (34 + Math.random() * 34), 4 + Math.random() * 16, i < 5, i % 3 === 1 ? 'r' : 'w');
  // 평소: 입에서 가늘게 흘러나옴 — 대부분 흰 김, 셋에 하나는 붉은 기운
  seep += dt * 9;
  while (seep >= 1) {
    seep--;
    puff(mx + f * Math.random(), my + Math.random(), f * (10 + Math.random() * 12), 2 + Math.random() * 8, false, Math.random() < 0.33 ? 'r' : 'w');
  }
}

export function drawSteam(ctx) {
  for (const q of puffs) {
    const k = q.t / q.life;
    const r = Math.max(0.5, q.r * (k < 0.7 ? 0.45 + 0.55 * (k / 0.7) : 1 - (k - 0.7) / 0.3 * 0.8));
    ctx.fillStyle = RAMP[q.kind][Math.min(3, Math.floor(k * 4))];
    const cx = Math.round(q.x), cy = Math.round(q.y), R = Math.round(r);
    for (let dy = -R; dy <= R; dy++) {
      const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    }
  }
}
