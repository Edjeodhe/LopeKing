// 가면 증기 (블리치 호로화처럼): 도깨비 가면 폼으로 가만히 서 있으면 가면 입가에서 김이 새어 나와 뒤·위로 흩어짐.
// 숨 쉬기(anim.js idle, 3.2초 주기)에 맞춰 내쉬는 순간 앞으로 크게 한 번 뿜고, 그 사이엔 가늘게 샘.
// 김 한 덩이 = 도트 원(반지름 1 → 3~4px)이 커지며 옅은 색으로 바뀌다 끝물에 줄어들며 사라짐 (반투명·체크무늬 없음)
const puffs = [];
const COLS = ['#f6f0f6', '#d4cadc', '#a49ab6', '#746c8e'];   // 막 나온 짙은 김 → 흩어진 옅은 김
const BREATH = 3.2, EXHALE = 0.55;   // anim.js idle 과 같은 주기·내쉬는 자리
let seep = 0;

// 가면 입가: 머리 기준점(목) 에서 보는 쪽 앞·위 (게임 px, art/dokkaebi 머리 그림 기준)
const mouth = p => [p.sock.head[0] + (p.drawFacing ?? p.facing) * 10, p.sock.head[1] - 5];

function puff(x, y, vx, vy, big) {
  puffs.push({ x, y, vx, vy, t: 0, life: (big ? 0.9 : 0.6) + Math.random() * 0.4, r: big ? 3 + Math.random() * 1.5 : 1.5 + Math.random() });
  if (puffs.length > 90) puffs.shift();
}

export function stepSteam(dt, p) {
  for (const q of puffs) {
    q.t += dt;
    q.vx *= Math.exp(-dt * 2.6); q.vy = q.vy * Math.exp(-dt * 1.5) - 26 * dt;   // 느려지며 위로 떠오름
    q.x += q.vx * dt; q.y += q.vy * dt;
  }
  for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t >= puffs[i].life) puffs.splice(i, 1);
  if (p.dead || p.mask !== 'dokkaebi' || !p.sock?.head || (p.idleT || 0) < 0.35) return;
  const f = p.drawFacing ?? p.facing, [mx, my] = mouth(p);
  // 내쉼: 숨 주기의 EXHALE 자리를 지나는 순간 앞으로 크게 뿜음
  const ph = (p.t / BREATH) % 1, prev = ((p.t - dt) / BREATH) % 1;
  if (prev < EXHALE && ph >= EXHALE) for (let i = 0; i < 7; i++) puff(mx, my + Math.random() * 2, f * (30 + Math.random() * 30), -6 + Math.random() * 14, i < 4);
  // 평소: 입가·뿔 언저리에서 가늘게 샘
  seep += dt * 7;
  while (seep >= 1) {
    seep--;
    const horn = Math.random() < 0.3;
    puff(mx - f * (horn ? 4 : 0) + (Math.random() - 0.5) * 2, my - (horn ? 7 : 0), -f * (6 + Math.random() * 10), -8 - Math.random() * 12, false);
  }
}

export function drawSteam(ctx) {
  for (const q of puffs) {
    const k = q.t / q.life;
    const r = Math.max(0.5, q.r * (k < 0.7 ? 0.4 + 0.6 * (k / 0.7) : 1 - (k - 0.7) / 0.3 * 0.8));
    ctx.fillStyle = COLS[Math.min(3, Math.floor(k * 4))];
    const cx = Math.round(q.x), cy = Math.round(q.y), R = Math.round(r);
    for (let dy = -R; dy <= R; dy++) {
      const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    }
  }
}
