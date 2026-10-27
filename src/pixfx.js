// 그림 이펙트(Codex 흑백 그림) → 도트 굽기. 원더월드 프로토 src/pixfx.js 방식.
// 원본 = 검은 바탕 흰 그림 → 밝기를 알파로 보고, 게임 크기(가로 w px)로 반씩 줄인 뒤 밝기를 4단(어둠·본색·밝음·흰 심)으로 끊고 반투명은 없앤다.
// dither = 체크무늬로 반만 남김 (사라지는 마지막 프레임). 크기는 2px 단위로 캐시.
// o = { ang, flip, vflip, py }: 돌리기·뒤집기를 도트로 굽기 '전에' 큰 그림에서 함 (구운 도트를 돌리면 격자가 비뚤어짐) — 각도는 15° 단위.
//   구운 그림은 c.ax·c.ay(기준점 = 원래 그림의 가로 가운데 · 세로 py)를 가짐 → drawImage(c, x - c.ax, y - c.ay)
const baked = new Map();
const hex = c => { const n = parseInt(String(c).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const STEP = Math.PI / 12;

// 4×4 칸 그림 한 장을 칸마다 캔버스로 잘라 둠: cells[줄][칸]
export async function loadSheet(src, cols, rows) {
  const im = new Image();
  await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = src; });   // decode() 는 가려진 탭에서 멈출 때가 있음
  const cw = im.naturalWidth / cols, ch = im.naturalHeight / rows;
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    cv.getContext('2d').drawImage(im, -c * cw, -r * ch);
    cv.key = `${src}#${r},${c}`;
    return cv;
  }));
}

// ramp = 4색 (어둠 → 본색 → 밝음 → 흰 심)
export function pixelFx(im, ramp, w, dither = false, o = null) {
  if (!im) return null;
  w = Math.max(4, Math.round(w / 2) * 2);
  const q = o ? ((Math.round((o.ang || 0) / STEP) % 24) + 24) % 24 : 0, fl = o?.flip ? -1 : 1, vf = o?.vflip ? -1 : 1, py = o?.py ?? 0.5;
  const key = `${im.key}|${ramp.join()}|${w}|${dither ? 1 : 0}|${q},${fl},${vf},${py}`;
  if (baked.has(key)) return baked.get(key);
  let cur = im, cw = im.width, ch = im.height;
  while (cw / 2 > w) {
    const c = document.createElement('canvas'); c.width = Math.ceil(cw / 2); c.height = Math.ceil(ch / 2);
    c.getContext('2d').drawImage(cur, 0, 0, c.width, c.height); cur = c; cw = c.width; ch = c.height;
  }
  const k = w / cw;
  // 기준점(가운데·py)을 원점에 두고 뒤집기 → 돌리기 한 네 모서리의 범위가 새 캔버스
  const a = q * STEP, ca = Math.cos(a), sa = Math.sin(a);
  const pts = [[-cw / 2, -ch * py], [cw / 2, -ch * py], [-cw / 2, ch * (1 - py)], [cw / 2, ch * (1 - py)]].map(([px, qy]) => { const X = px * fl, Y = qy * vf; return [X * ca - Y * sa, X * sa + Y * ca]; });
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  const W = Math.max(2, Math.ceil((x1 - x0) * k)), H = Math.max(2, Math.ceil((y1 - y0) * k));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); x.rotate(a); x.scale(fl, vf);
  x.drawImage(cur, -cw / 2, -ch * py);
  x.setTransform(1, 0, 0, 1, 0, 0);
  const d = x.getImageData(0, 0, W, H), p = d.data, R = ramp.map(hex);
  // 1) 밝기 → 4단 (-1 = 비움). 옅은 번짐은 버리고 경계만 체크무늬로
  const tone = new Int8Array(W * H).fill(-1);
  for (let i = 0, n = 0; i < p.length; i += 4, n++) {
    const al = p[i + 3] / 255 * Math.max(p[i], p[i + 1], p[i + 2]) / 255;
    const xx = n % W, yy = (n / W) | 0;
    if (al < 0.32 || (al < 0.42 && (xx + yy) % 2) || (dither && (xx + yy) % 2)) continue;
    tone[n] = al < 0.52 ? 0 : al < 0.74 ? 1 : al < 0.9 ? 2 : 3;
  }
  // 2) 잔부스러기(8방향으로 이어진 점 3개 이하, 흰 심 없는 조각)는 줄이면서 생긴 잡티 → 지움
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? -1 : tone[yy * W + xx]);
  if (!dither) {
    const seen = new Uint8Array(W * H), stack = [], part = [];
    for (let n0 = 0; n0 < W * H; n0++) {
      if (tone[n0] < 0 || seen[n0]) continue;
      stack.push(n0); seen[n0] = 1; part.length = 0;
      let hot = false;
      while (stack.length) {
        const n = stack.pop(); part.push(n); if (tone[n] === 3) hot = true;
        const xx = n % W, yy = (n / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = xx + dx, Y = yy + dy, m = Y * W + X;
          if ((dx || dy) && X >= 0 && Y >= 0 && X < W && Y < H && tone[m] >= 0 && !seen[m]) { seen[m] = 1; stack.push(m); }
        }
      }
      if (part.length <= 3 && !hot) for (const n of part) tone[n] = -1;
    }
  }
  // 3) 밝은 덩어리 바깥 1px 어두운 테두리 (배경에서 떨어져 보이게)
  const rim = new Uint8Array(W * H);
  if (!dither) for (let n = 0; n < W * H; n++) {
    if (tone[n] >= 0) continue;
    const xx = n % W, yy = (n / W) | 0;
    if (at(xx - 1, yy) >= 2 || at(xx + 1, yy) >= 2 || at(xx, yy - 1) >= 2 || at(xx, yy + 1) >= 2) rim[n] = 1;
  }
  const K = R[0].map(v => Math.round(v * 0.55));
  for (let i = 0, n = 0; i < p.length; i += 4, n++) {
    const t = tone[n] >= 0 ? R[tone[n]] : rim[n] ? K : null;
    if (!t) { p[i + 3] = 0; continue; }
    p[i] = t[0]; p[i + 1] = t[1]; p[i + 2] = t[2]; p[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  c.ax = Math.round(-x0 * k); c.ay = Math.round(-y0 * k);
  if (baked.size > 600) baked.delete(baked.keys().next().value);
  baked.set(key, c);
  return c;
}
