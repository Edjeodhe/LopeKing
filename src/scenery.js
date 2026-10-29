// 배경·타일 그림을 코드로 픽셀 단위로 그린다. 타일은 레벨을 읽을 때 한 장으로 구워 둠.
// '몰락한 조선'은 일반 원화에 픽셀·음영·거리 안개 셰이더를 적용한다.
// 규칙: 색은 정해진 몇 단계만, 반투명 없음, 경계는 체크무늬(디더) — 캐릭터 굽기와 같은 결
import { TILE, T, SOLID } from './world.js';
import { bakeBackdrop, BACKDROP_STYLE } from './backdrop.js';

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export const PAL = {
  ink: '#0b0a14',
  rock: ['#15141f', '#201f30', '#2c2b42', '#3d3c5a'], moon: '#9aa2d8',
  brick: ['#121a22', '#1b2833', '#273a48', '#3b5466'],
  metal: ['#1a1b22', '#2a2c36', '#3e414e', '#5e6272'],
  plank: ['#2a1c16', '#4a3226', '#6a4a34', '#8e6a48'],
  spike: ['#3a3f52', '#7a8298', '#c4cad8'],
  sky: ['#07060f', '#0c0a1a', '#141028', '#1e1838', '#2a2148'],
  far: '#221d3e', mid: '#16132a', near: '#0d0c18', win: ['#d88a3a', '#f0c070'],
  crimson: ['#5a0e14', '#9a1a22', '#d23a3a', '#ff8a7a'],
};

// 테마: 레벨 json 의 theme 으로 팔레트·배경을 바꿈 (밤 기와 마을 · 대나무 숲)
const THEMES = {
  night: { ...PAL },
  ruin: {
    ink: '#0d0c0b', rock: ['#191817', '#282522', '#3a352e', '#575044'], moon: '#918371',
    brick: ['#191918', '#292a27', '#3c3e37', '#5b5c4d'],
    metal: ['#1c1c1b', '#2d2e2b', '#44453e', '#626256'],
    plank: ['#241d17', '#3b3025', '#574634', '#7d664a'],
    spike: ['#373a34', '#777b6a', '#c3c6ab'], near: '#151411',
  },
  bamboo: {
    rock: ['#0f1512', '#18231c', '#243228', '#34473a'], moon: '#9ad0a0',
    brick: ['#1a1410', '#2a2018', '#3e3022', '#5a4630'],
    spike: ['#2a3a20', '#6a8a48', '#c8d8a0'],
    sky: ['#040807', '#07100e', '#0c1a16', '#122620', '#1a342a'],
    far: '#13261f', mid: '#0c1a15', near: '#08110d',
    bamboo: ['#0e2014', '#1e4024', '#3a6a38', '#7aa860'],
  },
};
export let theme = 'night';
export function setTheme(name) { theme = THEMES[name] ? name : 'night'; Object.assign(PAL, THEMES.night, THEMES[theme]); }

// ---------- 타일 굽기 ----------
export function bakeTiles(world) {
  const c = document.createElement('canvas');
  c.width = world.pw; c.height = world.ph;
  const x = c.getContext('2d');
  const px = (X, Y, col) => { x.fillStyle = col; x.fillRect(X, Y, 1, 1); };
  for (let j = 0; j < world.h; j++) for (let i = 0; i < world.w; i++) {
    const t = world.at(i, j);
    if (!t) continue;
    const X = i * TILE, Y = j * TILE;
    const open = (di, dj) => !SOLID(world.at(i + di, j + dj)) && world.at(i + di, j + dj) !== t;
    if (t === T.ROCK || t === T.BRICK || t === T.METAL) {
      const P = t === T.ROCK ? PAL.rock : t === T.BRICK ? PAL.brick : PAL.metal;
      x.fillStyle = P[1]; x.fillRect(X, Y, TILE, TILE);
      if (t === T.ROCK) {
        // 돌덩이: 8px 줄마다 어긋난 이음매
        for (let r = 0; r < 2; r++) {
          const yy = Y + r * 8, off = ((j * 2 + r) % 2) * 8;
          x.fillStyle = P[0]; x.fillRect(X, yy + 7, TILE, 1);
          x.fillRect(X + ((off + 4) % 16), yy, 1, 7);
          x.fillStyle = P[2]; x.fillRect(X + ((off + 5) % 16), yy, 3, 1);
          if (hash(i, j, r) < 0.3) { x.fillStyle = P[0]; x.fillRect(X + 2 + Math.floor(hash(i, j, 9 + r) * 10), yy + 3, 2, 1); }
        }
      } else if (t === T.BRICK) {
        // 기와: 줄마다 반원 비늘
        for (let r = 0; r < 4; r++) {
          const yy = Y + r * 4, off = (r % 2) * 4;
          x.fillStyle = P[0]; x.fillRect(X, yy + 3, TILE, 1);
          for (let k = -1; k < 3; k++) { const xx = X + off + k * 8; x.fillStyle = P[2]; x.fillRect(Math.max(X, xx + 1), yy, Math.max(0, Math.min(X + TILE, xx + 6) - Math.max(X, xx + 1)), 1); }
        }
      } else {
        x.fillStyle = P[0]; x.fillRect(X, Y + 15, TILE, 1); x.fillRect(X + 15, Y, 1, TILE);
        x.fillStyle = P[2]; x.fillRect(X, Y, TILE, 1); x.fillRect(X, Y, 1, TILE);
        x.fillStyle = P[3]; px(X + 3, Y + 3, P[3]); px(X + 12, Y + 3, P[3]); px(X + 3, Y + 12, P[3]); px(X + 12, Y + 12, P[3]);
      }
      // 드러난 가장자리: 위는 달빛 테, 옆·아래는 어두운 외곽선
      if (open(0, -1)) { x.fillStyle = PAL.ink; x.fillRect(X, Y, TILE, 1); x.fillStyle = t === T.METAL ? P[3] : PAL.moon; x.fillRect(X, Y + 1, TILE, 1); x.fillStyle = P[3]; x.fillRect(X, Y + 2, TILE, 1);
        // 풀·이끼 대신 달빛 받은 부스러기
        if (t === T.ROCK && hash(i, j, 3) < 0.4) { x.fillStyle = P[3]; x.fillRect(X + Math.floor(hash(i, j, 4) * 12), Y - 1, 3, 1); } }
      if (open(-1, 0)) { x.fillStyle = PAL.ink; x.fillRect(X, Y, 1, TILE); x.fillStyle = P[2]; x.fillRect(X + 1, Y + 1, 1, TILE - 1); }
      if (open(1, 0)) { x.fillStyle = PAL.ink; x.fillRect(X + TILE - 1, Y, 1, TILE); x.fillStyle = P[0]; x.fillRect(X + TILE - 2, Y + 1, 1, TILE - 1); }
      if (open(0, 1)) { x.fillStyle = PAL.ink; x.fillRect(X, Y + TILE - 1, TILE, 1); x.fillStyle = P[0]; x.fillRect(X, Y + TILE - 2, TILE, 1); }
    } else if (t === T.BAMBOO) {
      // 대나무 줄기: 12px 폭, 마디마다 굵은 띠, 왼쪽 그림자·오른쪽 빛
      const P = PAL.bamboo || ['#0e2014', '#1e4024', '#3a6a38', '#7aa860'];
      x.fillStyle = PAL.ink; x.fillRect(X + 1, Y, 14, TILE);
      x.fillStyle = P[1]; x.fillRect(X + 2, Y, 12, TILE);
      x.fillStyle = P[2]; x.fillRect(X + 6, Y, 6, TILE);
      x.fillStyle = P[3]; x.fillRect(X + 10, Y, 1, TILE);
      x.fillStyle = P[0]; x.fillRect(X + 2, Y, 2, TILE);
      if (j % 2 === 0) { x.fillStyle = PAL.ink; x.fillRect(X + 1, Y + 8, 14, 1); x.fillStyle = P[3]; x.fillRect(X + 2, Y + 9, 12, 1); x.fillStyle = P[0]; x.fillRect(X + 2, Y + 7, 12, 1); }
      // 잎: 마디에서 가끔 옆으로 뻗음
      if (j % 2 === 0 && hash(i, j, 5) < 0.35) { const d = hash(i, j, 6) < 0.5 ? -1 : 1; x.fillStyle = P[2]; for (let k = 0; k < 6; k++) x.fillRect(X + 8 + d * (7 + k), Y + 8 - Math.floor(k / 2), 1, 1); }
    } else if (t === T.PLANK) {
      const P = PAL.plank;
      x.fillStyle = PAL.ink; x.fillRect(X, Y, TILE, 6);
      x.fillStyle = P[2]; x.fillRect(X, Y + 1, TILE, 4);
      x.fillStyle = P[3]; x.fillRect(X, Y + 1, TILE, 1);
      x.fillStyle = P[1]; x.fillRect(X, Y + 4, TILE, 1);
      x.fillStyle = P[0]; x.fillRect(X + (i % 2 ? 3 : 11), Y + 1, 1, 4);
      // 받침 막대
      if (i % 2 === 0) { x.fillStyle = P[1]; x.fillRect(X + 6, Y + 6, 2, 6); x.fillStyle = PAL.ink; x.fillRect(X + 8, Y + 6, 1, 6); }
    } else if (t === T.SPIKE) {
      const P = PAL.spike;
      for (let k = 0; k < 4; k++) {
        const bx = X + k * 4;
        for (let h = 0; h < 8; h++) {
          const w = Math.max(1, Math.round((8 - h) / 2));
          x.fillStyle = h === 7 ? P[2] : P[0]; x.fillRect(bx + 2 - Math.floor(w / 2), Y + 15 - h, Math.max(1, w), 1);
          if (h < 7 && w > 1) { x.fillStyle = P[1]; x.fillRect(bx + 2, Y + 15 - h, 1, 1); }
        }
      }
    }
  }
  return c;
}

// ---------- 배경 (시차 스크롤) ----------
// 픽셀 버퍼: 한 점씩 fillRect 하면 느려서 ImageData 에 직접 씀
function pixels(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), d = x.createImageData(w, h), u = new Uint32Array(d.data.buffer), cache = {};
  const abgr = hex => cache[hex] ?? (cache[hex] = (255 << 24 | parseInt(hex.slice(5, 7), 16) << 16 | parseInt(hex.slice(3, 5), 16) << 8 | parseInt(hex.slice(1, 3), 16)) >>> 0);
  return { c, x, set: (X, Y, hex) => { if (X >= 0 && Y >= 0 && X < w && Y < h) u[Y * w + X] = abgr(hex); }, flush: () => x.putImageData(d, 0, 0) };
}
// '몰락한 조선' 배경 그림 층 읽기 (boot 에서 한 번). 없으면 ruin 테마도 밤 배경(코드 그림)으로
const BACKDROP = {};
const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
export async function loadBackdrops() {
  try {
    for (const k of ['sky', 'far', 'mid']) {
      BACKDROP[k] = bakeBackdrop(await loadImg(`art/bg/ruin_${k}.png`), k);
    }
  } catch (e) { console.warn('배경 원화 로드 실패', e); for (const k in BACKDROP) delete BACKDROP[k]; }
}
// 셰이더가 분리한 절제된 주황 발광에서만 불티를 뽑는다 (달·회색 연기 제외).
function firePoints(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, pts = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 12) pts.push([(i / 4) % c.width, Math.floor(i / 4 / c.width)]);
  return pts;
}
function ruinLayers(W, H) {
  const B = BACKDROP, L = [];
  L.push({ ...B.sky, depth: BACKDROP_STYLE.sky.depth, f: 0, y: 0, fixed: true, glowK: 0 });
  // depth가 작을수록 먼 층. 먼 산을 지붕보다 높여 산등성이가 처마 뒤로 읽히게 한다.
  L.push({ ...B.far, depth: BACKDROP_STYLE.far.depth, f: 0.07, y: -85, glowK: 0.34, fire: firePoints(B.far.glow), embers: [], rate: 1.2 });
  L.push({ ...B.mid, depth: BACKDROP_STYLE.mid.depth, f: 0.24, y: 20, glowK: 0.62, fire: firePoints(B.mid.glow), embers: [], rate: 3.5 });
  return L;
}
export function makeBackground(W, H) {
  const layers = [];
  if (theme === 'ruin' && BACKDROP.sky) {
    layers.push(...ruinLayers(W, H));
    layers.sort((a, b) => a.depth - b.depth);
    return layers;
  }
  // 하늘 (고정) + 별 + 달
  {
    const B = pixels(W, H), n = PAL.sky.length;
    for (let y = 0; y < H; y++) {
      const f = Math.pow(y / H, 1.3) * (n - 1), i = Math.floor(f), fr = f - i;
      for (let xx = 0; xx < W; xx++) B.set(xx, y, fr > 0.6 && ((xx + y) & 1) ? PAL.sky[Math.min(n - 1, i + 1)] : PAL.sky[i]);
    }
    for (let k = 0; k < 90; k++) B.set(Math.floor(hash(k, 1) * W), Math.floor(hash(k, 2) * H * 0.6), hash(k, 3) < 0.2 ? '#e8e4ff' : '#6a6890');
    // 달: 둥근 원 + 무늬 + 헤일로 두 겹(체크무늬)
    const mx = Math.round(W * 0.72), my = Math.round(H * 0.24), R = 22;
    for (let y = -R * 2; y <= R * 2; y++) for (let xx = -R * 2; xx <= R * 2; xx++) {
      const d = Math.hypot(xx, y);
      let col = null;
      if (d <= R) { const sh = (xx + y * 0.6) / R; col = sh < -0.55 ? '#c8bc9e' : hash(xx + 50, y + 50) < 0.06 ? '#d8ccb0' : '#f4ead0'; }
      else if (d <= R + 4 && ((xx + y) & 1)) col = '#4a4270';
      else if (d <= R + 12 && ((xx + y) % 4 === 0) && (y & 1)) col = '#2e2852';
      if (col) B.set(mx + xx, my + y, col);
    }
    B.flush();
    const c = B.c;
    layers.push({ img: c, f: 0, y: 0, fixed: true });
  }
  // 대숲: 먼 줄기(가늘고 촘촘) · 가까운 줄기(굵고 듬성, 마디·잎)
  const stalks = (count, wMin, wMax, col, leaf, seed) => {
    const w = W * 2, c = document.createElement('canvas'); c.width = w; c.height = H; const x = c.getContext('2d');
    for (let k = 0; k < count; k++) {
      const sx = Math.floor(hash(k, seed) * w), sw = wMin + Math.floor(hash(k, seed + 1) * (wMax - wMin + 1)), lean = (hash(k, seed + 2) - 0.5) * 0.08;
      for (let y = 0; y < H; y++) {
        const xx = Math.round(sx + (H - y) * lean);
        x.fillStyle = col; x.fillRect(((xx % w) + w) % w, y, sw, 1);
        if (y % 22 === Math.floor(hash(k, seed + 3) * 22)) { x.fillStyle = leaf; x.fillRect(((xx % w) + w) % w - 1, y, sw + 2, 1); x.fillStyle = col; }
      }
      // 잎 덩어리
      x.fillStyle = leaf;
      for (let q = 0; q < 5; q++) {
        const ly = Math.floor(hash(k, seed + 10 + q) * H * 0.7), d = hash(k, q) < 0.5 ? -1 : 1, xx = Math.round(sx + (H - ly) * lean);
        for (let m = 0; m < 7; m++) x.fillRect(((xx + d * (sw + m)) % w + w) % w, ly + Math.floor(m / 2), 2, 1);
      }
    }
    return c;
  };
  if (theme === 'bamboo') {
    layers.push({ img: stalks(70, 1, 2, PAL.far, '#1a3a2c', 20), f: 0.15, y: 0 });
    layers.push({ img: stalks(26, 3, 5, PAL.mid, '#16301f', 40), f: 0.35, y: 0 });
  } else {
  // 먼 산
  {
    const w = W * 2, c = document.createElement('canvas'); c.width = w; c.height = H; const x = c.getContext('2d');
    x.fillStyle = PAL.far;
    for (let xx = 0; xx < w; xx++) {
      const h = 60 + 26 * Math.sin(xx / w * Math.PI * 6) + 14 * Math.sin(xx / w * Math.PI * 22 + 1) + 5 * Math.sin(xx * 0.21);
      x.fillRect(xx, Math.round(H - h - 40), 1, Math.round(h + 40));
    }
    layers.push({ img: c, f: 0.12, y: -30 });
  }
  // 중간: 기와지붕 마을 실루엣 + 불 켜진 창
  {
    const w = W * 2, c = document.createElement('canvas'); c.width = w; c.height = H; const x = c.getContext('2d');
    let xx = 0, k = 0;
    while (xx < w) {
      const bw = 34 + Math.floor(hash(k, 7) * 40), bh = 40 + Math.floor(hash(k, 8) * 70), top = H - bh;
      x.fillStyle = PAL.mid; x.fillRect(xx, top, bw, bh);
      // 기와 처마: 양끝이 들린 지붕
      for (let r = 0; r < 6; r++) { const lift = r === 0 ? 3 : r === 1 ? 1 : 0; x.fillRect(xx - 6 + r, top - 6 + lift, 1, 6 - lift); x.fillRect(xx + bw + 5 - r, top - 6 + lift, 1, 6 - lift); }
      x.fillRect(xx - 1, top - 6, bw + 2, 6);
      if (hash(k, 9) < 0.35) { x.fillRect(xx + bw / 2 - 1, top - 14, 2, 8); }   // 탑 꼭대기
      for (let wy = top + 8; wy < H - 10; wy += 10) for (let wx = xx + 5; wx < xx + bw - 6; wx += 9)
        if (hash(wx, wy, k) < 0.18) { x.fillStyle = PAL.win[hash(wx, wy) < 0.5 ? 0 : 1]; x.fillRect(wx, wy, 3, 4); x.fillStyle = PAL.mid; }
      xx += bw + 10 + Math.floor(hash(k, 10) * 20); k++;
    }
    layers.push({ img: c, f: 0.3, y: -10 });
  }
  }
  // 가까운 안개 띠 (체크무늬)
  {
    const w = W * 2, B = pixels(w, H);
    for (let y = H - 50; y < H; y++) for (let xx = 0; xx < w; xx++) {
      const d = (y - (H - 50)) / 50 + 0.15 * Math.sin(xx * 0.03 + y * 0.1);
      if (d > 0.55 || (d > 0.25 && ((xx + y) & 1))) B.set(xx, y, PAL.near);
    }
    B.flush();
    const c = B.c;
    layers.push({ img: c, f: 0.5, y: 20 });
  }
  return layers;
}
const layerOffset = (L, cam, H, worldH) => {
  const w = L.img.width;
  // 세로: 카메라가 맵 아래로 갈수록 배경이 살짝 올라감
  return [-Math.round(cam.x * L.f) % w, Math.round(L.y - (cam.y - (worldH - H)) * L.f * 0.5)];
};
export function drawBackground(ctx, layers, cam, W, H, worldH, time = 0, dt = 0) {
  ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#191815'; ctx.fillRect(0, 0, W, H);
  for (const L of layers) {
    if (L.fixed) { ctx.drawImage(L.img, 0, 0); continue; }
    const w = L.img.width, [ox, oy] = layerOffset(L, cam, H, worldH);
    for (let xx = ox - w; xx < W; xx += w) ctx.drawImage(L.img, xx, oy);
    // 각 층의 발광도 다음 가까운 층을 그리기 전에 합성한다.
    if (L.glow && L.glowK) drawBackdropGlow(ctx, [L], cam, W, H, worldH, time, dt);
  }
  ctx.restore();
}
// 발광은 해당 배경 층 안에서만 더한다. 지형·배우를 그린 뒤 호출하지 않는다.
let glowBuf = null;
function drawBackdropGlow(ctx, layers, cam, W, H, worldH, time, dt) {
  if (!layers.some(L => L.glow)) return;
  if (!glowBuf) { glowBuf = document.createElement('canvas'); glowBuf.width = W; glowBuf.height = H; }
  const g = glowBuf.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  for (const L of layers) {
    if (!L.glow) continue;
    if (L.fixed) { g.globalAlpha = L.glowK; g.drawImage(L.glow, 0, 0); continue; }
    const w = L.img.width, [ox, oy] = layerOffset(L, cam, H, worldH), S = 12;
    for (let xx = ox - w; xx < W; xx += w) {
      if (xx + w < 0) continue;
      for (let s = 0; s < w; s += S) {
        const sx = xx + s; if (sx + S < 0 || sx > W) continue;
        const n = s / S;
        g.globalAlpha = L.glowK * (0.72 + 0.28 * Math.sin(time * 9 + n * 1.7) * Math.sin(time * 5.3 + n * 0.9 + L.f * 10));
        const lift = Math.sin(time * 5.3 + n * 1.7) > 0.6 ? -1 : 0;
        g.drawImage(L.glow, s, 0, Math.min(S, w - s), L.glow.height, sx, oy + lift, Math.min(S, w - s), L.glow.height);
      }
    }
    // 불티: 불 점에서 생겨 위로 흔들리며 올라가다 꺼짐 (층 좌표, 시차 그대로)
    if (L.fire?.length && dt > 0) {
      const births = L.rate * dt;
      for (let k = 0; k < Math.floor(births) + (Math.random() < births % 1 ? 1 : 0); k++) {
        const [px, py] = L.fire[Math.floor(Math.random() * L.fire.length)];
        L.embers.push({ x: px, y: py, vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 16, t: 0, life: 1 + Math.random() * 1.6, ph: Math.random() * 6 });
      }
      for (const e of L.embers) { e.t += dt; e.x += (e.vx + Math.sin(time * 3 + e.ph) * 5) * dt; e.y += e.vy * dt; }
      L.embers = L.embers.filter(e => e.t < e.life).slice(-160);
    }
    for (const e of L.embers || []) {
      const k = 1 - e.t / e.life, ex = ((Math.round(ox + e.x) % w) + w) % w;
      g.globalAlpha = Math.min(0.38, k * L.glowK);
      g.fillStyle = k > 0.6 ? '#ad7845' : k > 0.3 ? '#87512c' : '#633b25';
      for (let xx = ex - w; xx < W; xx += w) if (xx >= 0) g.fillRect(xx, Math.round(oy + e.y), 1, 1);
    }
  }
  g.globalAlpha = 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowBuf, 0, 0); ctx.restore();
}

// 등불: 붉은 종이 등 + 흔들림. 빛은 따로 (main.js light pass)
export function drawLamp(ctx, l, time) {
  const sway = Math.round(Math.sin(time * 1.6 + l.x) * 1);
  const x = Math.round(l.x) + sway, y = Math.round(l.y);
  ctx.fillStyle = PAL.ink; ctx.fillRect(x, y - 10, 1, 6);
  const C = PAL.crimson;
  ctx.fillStyle = PAL.ink; ctx.fillRect(x - 4, y - 4, 9, 10);
  ctx.fillStyle = C[1]; ctx.fillRect(x - 3, y - 3, 7, 8);
  ctx.fillStyle = C[2]; ctx.fillRect(x - 1, y - 3, 4, 8);
  ctx.fillStyle = C[3]; ctx.fillRect(x, y - 1, 2, 3);
  ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 3, y - 4, 7, 1); ctx.fillRect(x - 3, y + 5, 7, 1);
}

// 갈고리 고리: 놋쇠 고리. hot = 지금 겨누면 걸리는 고리 (깜빡임)
export function drawRing(ctx, r, hot, time) {
  const x = Math.round(r.x), y = Math.round(r.y);
  const pts = [[-1, -4], [0, -4], [1, -4], [2, -3], [3, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-3, -2], [-2, -3]];
  ctx.fillStyle = PAL.ink;
  for (const [a, b] of pts) ctx.fillRect(x + a, y + b + 1, 1, 1);
  for (const [a, b] of pts) { ctx.fillStyle = b < 0 ? '#ffe0a0' : '#c08a3a'; ctx.fillRect(x + a, y + b, 1, 1); }
  ctx.fillStyle = PAL.ink; ctx.fillRect(x, y - 9, 1, 5);
  if (hot && Math.floor(time * 8) % 2) {
    ctx.fillStyle = '#ffffff';
    for (const [a, b] of [[-6, 0], [6, 0], [0, -7], [0, 6]]) ctx.fillRect(x + a, y + b, 1, 1);
  }
}

export function drawExit(ctx, e, time) {
  const x = Math.round(e.x), y = Math.round(e.y);
  ctx.fillStyle = PAL.ink; ctx.fillRect(x - 1, y - 30, 3, 30);
  ctx.fillStyle = '#6a5a4a'; ctx.fillRect(x, y - 30, 1, 30);
  const wave = Math.floor(time * 6) % 2;
  ctx.fillStyle = PAL.crimson[1]; ctx.fillRect(x + 1, y - 29, 12, 8 + wave);
  ctx.fillStyle = PAL.crimson[2]; ctx.fillRect(x + 1, y - 29, 12, 3);
}

// 체크포인트: 돌 등롱. 지나가면(lit) 불이 켜짐
export function drawCheck(ctx, c, time) {
  const x = Math.round(c.x), y = Math.round(c.y);
  ctx.fillStyle = PAL.ink; ctx.fillRect(x - 5, y - 22, 11, 22);
  ctx.fillStyle = '#4a4a5a'; ctx.fillRect(x - 4, y - 6, 9, 6); ctx.fillRect(x - 2, y - 14, 5, 8); ctx.fillRect(x - 5, y - 21, 11, 3);
  ctx.fillStyle = '#6a6a7e'; ctx.fillRect(x - 4, y - 6, 9, 1); ctx.fillRect(x - 5, y - 21, 11, 1);
  // 불 창
  const lit = c.lit, f = Math.floor(time * 10) % 3;
  ctx.fillStyle = lit ? ['#ffd080', '#ffb040', '#ffe0a0'][f] : '#1a1820';
  ctx.fillRect(x - 1, y - 13, 3, 5);
  if (lit) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y - 12, 1, 2); }
}

// 보스 방 문: 닫히면 굵은 쇠창살
export function drawGates(ctx, world, time) {
  for (const [gx, gy, gw, gh] of world.gates) {
    if (world.at(gx, gy) !== T.GATE) continue;
    const X = gx * TILE, Y = gy * TILE, Hh = gh * TILE, Ww = gw * TILE;
    ctx.fillStyle = PAL.ink; ctx.fillRect(X, Y, Ww, Hh);
    for (let i = 2; i < Ww; i += 5) { ctx.fillStyle = '#5e6272'; ctx.fillRect(X + i, Y, 2, Hh); ctx.fillStyle = '#9aa0b0'; ctx.fillRect(X + i, Y, 1, Hh); }
    for (let j = 6; j < Hh; j += 24) { ctx.fillStyle = '#3e414e'; ctx.fillRect(X, Y + j, Ww, 3); }
  }
}
