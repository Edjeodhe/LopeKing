// 픽셀 굽기: 고해상도 리그 그림 → SS×SS 박스 평균 → 알파 이진화 → 고정 팔레트 → 외곽선
// AI가 픽셀을 찍지 않고, 여기 규칙대로만 픽셀이 생긴다. (유니티에선 같은 규칙으로 오프라인 굽기)

import { SS } from './rig.js'; // SS는 짝수여야 함

// 지각 가중 RGB 거리
const dist = (a, b) => {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
};

// 결정적 k-means (같은 그림이면 언제나 같은 팔레트)
export function kmeans(samples, k, iters = 14) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const cents = [samples[Math.floor(rnd() * samples.length)].slice()];
  while (cents.length < k) {
    // k-means++ : 먼 색일수록 다음 중심으로 뽑힐 확률이 높다
    const d = samples.map(s => Math.min(...cents.map(c => dist(s, c))));
    const sum = d.reduce((a, b) => a + b, 0);
    let r = rnd() * sum, i = 0;
    while ((r -= d[i]) > 0 && i < d.length - 1) i++;
    cents.push(samples[i].slice());
  }
  for (let it = 0; it < iters; it++) {
    const acc = cents.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const dd = dist(s, cents[j]); if (dd < bd) { bd = dd; bi = j; } }
      const a = acc[bi]; a[0] += s[0]; a[1] += s[1]; a[2] += s[2]; a[3]++;
    }
    acc.forEach((a, j) => { if (a[3]) cents[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  return cents.map(c => c.map(Math.round)).sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
}

export class Palette {
  constructor(colors) {
    this.colors = colors;
    this.cache = new Map();
  }
  nearest(r, g, b) {
    const key = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
    let v = this.cache.get(key);
    if (v !== undefined) return v;
    let bi = 0, bd = Infinity;
    const c = [r, g, b];
    for (let j = 0; j < this.colors.length; j++) { const d = dist(c, this.colors[j]); if (d < bd) { bd = d; bi = j; } }
    this.cache.set(key, bi);
    return bi;
  }
}

export const OUTLINE = [18, 12, 24];

// ---------------- 음영 (셀 셰이딩) ----------------
// 픽셀화한 실루엣을 둥근 덩어리로 보고 가장자리 쪽에 명암 띠를 넣는다.
// 1) 가장자리까지 거리(d) → 2) 그 기울기 = 바깥으로 향하는 면 방향 → 3) 빛 방향과 내적 → 4) 2~3단계 띠로 끊어서
// 그림자는 차가운 보라로, 밝은 쪽은 따뜻한 횃불빛으로 색조를 틀어 준다 (픽셀 아트 램프 규칙). 그라데이션은 만들지 않는다.
const SH1 = [52, 40, 92], SH2 = [26, 18, 52], HI = [255, 226, 170];
const LIGHT = [0.55, -0.83];   // 빛이 오는 쪽 (화면 좌표, 오른쪽 위에서 거의 위)
let shBuf = null;
/**
 * o: RGBA 픽셀, filled: 채워짐(0/1), W·H 크기.
 * s: { depth: 명암 띠 두께(px), lightX: 1 | -1 (빛이 오른쪽/왼쪽), hi: 밝은 띠 넣기, ao: 발밑 어둡게 할 줄 수,
 *      levels: Int8Array(W*H) — 주면 색을 섞지 않고 단계(-2·-1·0·1)만 적음 (팔레트 램프로 고르는 쪽이 씀) }
 */
export function shade(o, filled, W, H, s = {}) {
  const R = s.depth ?? 3, N = W * H;
  if (!shBuf || shBuf.length < N) shBuf = new Float32Array(N);
  const d = shBuf;
  // 가장자리까지 거리: 두 번 훑는 chamfer (곧은 1, 대각 1.41), R+1에서 자름
  for (let k = 0; k < N; k++) d[k] = filled[k] ? R + 1 : 0;
  const relax = (k, n, c) => { if (d[n] + c < d[k]) d[k] = d[n] + c; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; if (!d[k]) continue;
    if (x === 0 || y === 0) { d[k] = 1; continue; }
    relax(k, k - 1, 1); relax(k, k - W, 1); relax(k, k - W - 1, 1.41);
    if (x < W - 1) relax(k, k - W + 1, 1.41);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const k = y * W + x; if (!d[k]) continue;
    if (x === W - 1 || y === H - 1) { d[k] = 1; continue; }
    relax(k, k + 1, 1); relax(k, k + W, 1); relax(k, k + W + 1, 1.41);
    if (x > 0) relax(k, k + W - 1, 1.41);
  }
  const lx = LIGHT[0] * (s.lightX ?? 1), ly = LIGHT[1];
  let bottom = 0;
  if (s.ao) for (let k = N - 1; k >= 0; k--) if (filled[k]) { bottom = (k / W) | 0; break; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!filled[k] || d[k] > R) continue;
    // 바깥 방향 = 거리가 줄어드는 쪽 (밖은 0)
    const gx = (x > 0 ? d[k - 1] : 0) - (x < W - 1 ? d[k + 1] : 0);
    const gy = (y > 0 ? d[k - W] : 0) - (y < H - 1 ? d[k + W] : 0);
    const gl = Math.hypot(gx, gy);
    if (!gl) continue;
    const w = 1 - (d[k] - 1) / R;             // 가장자리 1 → 안쪽 0
    const L = (gx * lx + gy * ly) / gl * w;
    let lv = L < -0.5 ? -2 : L < -0.1 ? -1 : (s.hi && L > 0.45 && d[k] < 2.5) ? 1 : 0;
    if (s.ao && y > bottom - s.ao && lv > -2) lv--;   // 발밑(바닥에 닿는 쪽)은 한 단계 더 어둡게
    if (lv) { if (s.levels) s.levels[k] = lv; else tone(o, k * 4, lv); }
  }
  if (s.ao) for (let y = Math.max(0, bottom - s.ao + 1); y <= bottom; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (filled[k] && d[k] > R) { if (s.levels) s.levels[k] = -1; else tone(o, k * 4, -1); }
  }
}
export function tone(o, i, lv) {
  if (lv === 1) { o[i] += (HI[0] - o[i]) * 0.24; o[i + 1] += (HI[1] - o[i + 1]) * 0.22; o[i + 2] += (HI[2] - o[i + 2]) * 0.16; return; }
  const [m, c, t] = lv === -1 ? [0.68, SH1, 0.18] : [0.48, SH2, 0.28];
  o[i] = o[i] * m * (1 - t) + c[0] * t; o[i + 1] = o[i + 1] * m * (1 - t) + c[1] * t; o[i + 2] = o[i + 2] * m * (1 - t) + c[2] * t;
}

/**
 * hi: 고해상도 캔버스 (W*SS × H*SS), low: 결과 캔버스 (W × H)
 * opts: { quantize, outline: 0 없음 | 1 진한 단색 | 2 선택적(이웃 색을 어둡게), flash, silhouette:[r,g,b], shade: {depth, hi, ao} }
 */
let mid = null;
export function bake(hi, low, pal, opts) {
  const W = low.width, H = low.height, S = SS / 2, N = S * S;
  // 첫 2배 축소는 GPU에 맡김 (정확히 절반 크기 bilinear = 2×2 평균), 읽어 오는 픽셀이 1/4로 준다
  if (!mid || mid.width !== W * S || mid.height !== H * S) {
    mid = document.createElement('canvas');
    mid.width = W * S; mid.height = H * S;
  }
  const mctx = mid.getContext('2d', { willReadFrequently: true });
  mctx.clearRect(0, 0, mid.width, mid.height);
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(hi, 0, 0, mid.width, mid.height);
  const src = mctx.getImageData(0, 0, W * S, H * S).data;
  const lctx = low.getContext('2d');
  const out = lctx.createImageData(W, H);
  const o = out.data;
  const filled = new Uint8Array(W * H);
  const rowStride = W * S * 4;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      let p = (y * S) * rowStride + x * S * 4;
      for (let yy = 0; yy < S; yy++, p += rowStride) {
        for (let xx = 0, q = p; xx < S; xx++, q += 4) {
          const a = src[q + 3];
          if (a) { sr += src[q] * a; sg += src[q + 1] * a; sb += src[q + 2] * a; sa += a; }
        }
      }
      if (sa < N * 255 * 0.5) continue; // 절반 넘게 덮어야 픽셀 하나
      let r = sr / sa, g = sg / sa, b = sb / sa;
      if (opts.sat && opts.sat !== 1) {
        const gray = 0.3 * r + 0.59 * g + 0.11 * b;
        r = gray + (r - gray) * opts.sat; g = gray + (g - gray) * opts.sat; b = gray + (b - gray) * opts.sat;
      }
      const i = (y * W + x) * 4;
      o[i] = r < 0 ? 0 : r > 255 ? 255 : r; o[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; o[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b; o[i + 3] = 255;
      filled[y * W + x] = 1;
    }
  }

  // 림 라이트: 빛(오른쪽 위)을 받는 가장자리 한 줄을 따뜻하게 밝힘
  if (opts.rim && !opts.silhouette && !opts.flash) {
    const rim = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (!filled[k]) continue;
      const up = y > 0 && filled[k - W], right = x < W - 1 && filled[k + 1];
      if (!up || !right) rim[k] = 1;
    }
    for (let k = 0; k < W * H; k++) if (rim[k]) {
      const i = k * 4;
      o[i] = o[i] + (255 - o[i]) * 0.5; o[i + 1] = o[i + 1] + (232 - o[i + 1]) * 0.45; o[i + 2] = o[i + 2] + (180 - o[i + 2]) * 0.3;
    }
  }

  for (let k = 0; k < W * H; k++) {
    if (!filled[k]) continue;
    const i = k * 4;
    if (opts.silhouette) { o[i] = opts.silhouette[0]; o[i + 1] = opts.silhouette[1]; o[i + 2] = opts.silhouette[2]; }
    else if (opts.flash) { o[i] = 255; o[i + 1] = 250; o[i + 2] = 240; }
    else if (opts.quantize) { const c = pal.colors[pal.nearest(o[i], o[i + 1], o[i + 2])]; o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; }
  }

  // 음영: shade = { depth, hi, ao } (위 shade() 참고). 림 라이트를 켰으면 밝은 띠는 림이 대신함
  if (opts.shade && !opts.flash && !opts.silhouette) shade(o, filled, W, H, { hi: !opts.rim, ...opts.shade });

  // 환경색 물들이기: tint = [r, g, b, 세기] — 캐릭터가 맵 색감(차가운 보라)에서 떠 보이지 않게
  if (opts.tint && !opts.flash && !opts.silhouette) {
    const [tr, tg, tb, ta] = opts.tint;
    for (let k = 0; k < W * H; k++) if (filled[k]) {
      const i = k * 4;
      o[i] += (tr - o[i]) * ta; o[i + 1] += (tg - o[i + 1]) * ta; o[i + 2] += (tb - o[i + 2]) * ta;
    }
  }

  if (opts.outline && !opts.silhouette) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (filled[y * W + x]) continue;
        // 4방향 이웃 중 채워진 픽셀
        let n = -1;
        if (x > 0 && filled[y * W + x - 1]) n = y * W + x - 1;
        else if (x < W - 1 && filled[y * W + x + 1]) n = y * W + x + 1;
        else if (y > 0 && filled[(y - 1) * W + x]) n = (y - 1) * W + x;
        else if (y < H - 1 && filled[(y + 1) * W + x]) n = (y + 1) * W + x;
        if (n < 0) continue;
        const i = (y * W + x) * 4;
        if (opts.outline === 2 && !opts.flash) {
          // 선택적 외곽선: 이웃 색을 어둡게 + 보랏빛으로 색조를 틀어 줌
          const j = n * 4;
          o[i] = o[j] * 0.28 + 10; o[i + 1] = o[j + 1] * 0.2 + 4; o[i + 2] = o[j + 2] * 0.3 + 18;
        } else {
          o[i] = OUTLINE[0]; o[i + 1] = OUTLINE[1]; o[i + 2] = OUTLINE[2];
        }
        o[i + 3] = 255;
      }
    }
  }
  lctx.putImageData(out, 0, 0);
  // 그려진 영역 (low px, 외곽선 포함) — 맞는 판정을 그림 크기에 맞추는 데 씀
  let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (o[(y * W + x) * 4 + 3]) {
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  low.bbox = bx1 < 0 ? null : [bx0, by0, bx1 + 1, by1 + 1];
}
