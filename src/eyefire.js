// 가면 눈 혼불 (블리치 호로화 참고): 도깨비 가면의 초록 눈에서 영기(혼불 연기)가 늘 새어 나와 뒤·위로 흔들리며 흘러감.
// 연기 알갱이는 월드 좌표에 남아서 몸이 움직이면 자연히 뒤로 꼬리를 끌고, 빠르게 움직일수록(대시·돌진·귀보) 더 많이 뿜음.
// 따로 눈빛 잔상 (사용자: 움직일 때 눈 이펙트가 잔상으로 지나가는 느낌): 최근 TRAIL 초 동안의 눈 자리를 잇는 빛 줄기(바깥 번짐 + 흰 민트 심)가
// 오래된 쪽부터 가늘고 옅어지고, 지나간 자리마다 눈 모양(뒤로 치켜 오른 3칸)이 옅게 남았다 사라짐 — 빨리 움직일수록 길게.
// 조명 패스 뒤, 더하기(lighter)로 그림 → 어둠 속에서 빛남. 예전 입 김(steam.js)은 사용자 요청으로 뺌
const wisps = [];
const trail = [];   // { x, y, t, f } 최근 눈 자리 (실제 시간) · f = 보는 쪽
const TRAIL = 0.35;
const COLS = ['#eafff2', '#8affc0', '#4ef0a0', '#2aa870', '#146a44'];   // 갓 난 → 사라짐
let acc = 0, clock = 0;

export function stepEyeFire(dt, p) {
  clock += dt;
  for (const w of wisps) {
    w.t += dt;
    const k = w.t / w.life;
    w.vx *= Math.exp(-dt * 1.5); w.vy -= 26 * dt;   // 위로 말려 오름
    w.x += (w.vx + Math.sin(clock * 6 + w.ph) * 8 * k) * dt; w.y += w.vy * dt;
  }
  for (let i = wisps.length - 1; i >= 0; i--) if (wisps[i].t >= wisps[i].life) wisps.splice(i, 1);
  const e = p.dead ? null : p.sock?.eye;
  if (!e) { trail.length = 0; return; }
  // 눈빛 잔상: TRAIL 초치 자리
  const sp = Math.hypot(p.vx, p.vy), f = p.drawFacing ?? p.facing;
  trail.push({ x: e[0], y: e[1], t: clock, f });
  while (trail.length && clock - trail[0].t > TRAIL) trail.shift();
  // 뿜는 양: 가만히 = 초당 16, 빠를수록 많이 (최대 60)
  acc += dt * Math.min(60, 16 + sp * 0.06);
  while (acc >= 1) {
    acc -= 1;
    wisps.push({ x: e[0] - f * 1 + (Math.random() - 0.5), y: e[1] + (Math.random() - 0.5), vx: -f * (14 + Math.random() * 22), vy: -6 - Math.random() * 10,
      t: 0, life: 0.35 + Math.random() * 0.45, ph: Math.random() * 6, big: Math.random() < 0.35 });
  }
  if (wisps.length > 220) wisps.splice(0, wisps.length - 220);
}

export function drawEyeFire(ctx, cx, cy) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 눈빛 잔상: 오래된 자리일수록(나이 k → 1) 가늘고 옅음. 바깥 번짐 한 겹 + 심 한 겹. 멈춰 있으면 자리가 겹쳐 안 보임
  if (trail.length > 2) {
    ctx.lineCap = 'round';
    for (const [wd, col, al] of [[4.5, '60,230,140', 0.22], [1.6, '220,255,235', 0.85]]) {
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1], p1 = trail[i];
        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.3) continue;
        const k = 1 - (clock - p1.t) / TRAIL;   // 1 = 방금 · 0 = 사라짐
        ctx.strokeStyle = `rgba(${col},${al * k * k})`; ctx.lineWidth = wd * (0.35 + 0.65 * k);
        ctx.beginPath(); ctx.moveTo(p0.x - cx, p0.y - cy); ctx.lineTo(p1.x - cx, p1.y - cy); ctx.stroke();
      }
    }
    // 지나간 자리에 눈 모양 잔상 (몇 칸 건너 하나씩, 앞 자리와 4px 이상 떨어진 것만)
    let lx = null, ly = null;
    for (let i = trail.length - 2; i >= 0; i--) {
      const q = trail[i];
      if (lx !== null && Math.hypot(q.x - lx, q.y - ly) < 5) continue;
      lx = q.x; ly = q.y;
      const k = 1 - (clock - q.t) / TRAIL;
      if (k <= 0.05 || i === trail.length - 2) continue;
      const x = Math.round(q.x - cx + q.f * 0.5), y = Math.round(q.y - cy);
      ctx.globalAlpha = 0.7 * k;
      ctx.fillStyle = '#2ee88a'; ctx.fillRect(x - 2 * q.f, y - 1, 1, 1);
      ctx.fillStyle = '#5cffaa'; ctx.fillRect(x - q.f, y, 1, 1);
      ctx.fillStyle = '#eafff2'; ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  // 혼불 연기 알갱이: 도트(1~2px), 나이 들며 색이 한 단씩 짙어지고 옅어짐
  for (const w of wisps) {
    const k = w.t / w.life;
    ctx.globalAlpha = Math.min(1, (1 - k) * 1.4);
    ctx.fillStyle = COLS[Math.min(COLS.length - 1, Math.floor(k * COLS.length))];
    const s = w.big && k < 0.5 ? 2 : 1;
    ctx.fillRect(Math.round(w.x - cx), Math.round(w.y - cy), s, s);
  }
  ctx.restore();
}
