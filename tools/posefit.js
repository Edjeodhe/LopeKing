// 참고 그림 → 리그 자세 맞추기 (브라우저에서: const F = await import('/tools/posefit.js'))
// Codex 로 뽑은 자세 참고 시트(마젠타 바탕, 칸 격자)의 칸마다, 리그를 그 자세로 그렸을 때 실루엣이 가장 많이 겹치도록(IoU)
// 뼈 각도를 하나씩 조금씩 돌려 보며 맞춘다 (좌표 하강, 큰 걸음 → 작은 걸음). 관절이 꺾이는 범위는 사람 몸대로 묶음.
// 망토 각도도 같이 맞추지만(겹침 계산용) 게임에선 망토는 물리로 움직이니 버림.
import { loadRig, drawRig, ZERO } from '../src/rig.js';

// 각도(도)·위치(게임 px) 범위: 무릎은 뒤로만, 팔꿈치는 앞으로만 접힘
const RANGE = {
  rot: [-40, 15], torso: [-25, 60], head: [-50, 35], y: [-10, 12], x: [-12, 12],
  nU: [-200, 200], nF: [0, 150], sw: [-200, 200], fU: [-200, 200], fF: [0, 150],
  nT: [-90, 120], nS: [-155, 0], fT: [-90, 120], fS: [-155, 0],
};
const KEYS = ['rot', 'torso', 'head', 'y', 'x', 'nT', 'nS', 'fT', 'fS', 'nU', 'nF', 'sw', 'fU', 'fF'];

// 마젠타 → 알파 가면 (1 = 그림)
function maskOf(canvas) {
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  const m = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, n = 0; i < d.length; i += 4, n++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    m[n] = d[i + 3] > 128 && !(r > 170 && b > 170 && g < 110) ? 1 : 0;
  }
  return m;
}
function bbox(m, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

// 시트를 칸으로 잘라 반 크기 가면으로 (칸마다 { m, W, H, box })
export async function loadSheet(src, cols, rows, half = 2) {
  const im = new Image(); im.src = src + '?v=' + Date.now();
  await new Promise((ok, no) => { im.onload = ok; im.onerror = no; });
  const cw = im.naturalWidth / cols, ch = im.naturalHeight / rows, W = Math.round(cw / half), H = Math.round(ch / half);
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.fillStyle = '#ff00ff'; g.fillRect(0, 0, W, H);
    g.drawImage(im, c * cw, r * ch, cw, ch, 0, 0, W, H);
    const m = maskOf(cv);
    cells.push({ m, W, H, box: bbox(m, W, H), img: cv });
  }
  return cells;
}

// dir 캐릭터 리그를 칸 크기에 맞는 축척으로 읽음: 똑바로 선 키 = standH (칸 px)
export async function rigFor(dir, standH) {
  const def = await (await fetch(`/${dir}/rig.json`, { cache: 'no-store' })).json();
  let P = await loadRig(dir, def);
  const probe = document.createElement('canvas'); probe.width = 400; probe.height = 400;
  drawRig(probe.getContext('2d'), P, { ...ZERO, cape: [0, 0, 0, 0] }, 200, 380, 1, 1);
  const b = bbox(maskAlpha(probe), 400, 400), h0 = b[3] - b[1];
  const k = standH / h0;
  P = await loadRig(dir, { ...def, scale: def.scale * k });
  return { P, k };
}
function maskAlpha(cv) {
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
  const m = new Uint8Array(cv.width * cv.height);
  for (let i = 3, n = 0; i < d.length; i += 4, n++) m[n] = d[i] > 128 ? 1 : 0;
  return m;
}

// 한 칸 맞추기: init 자세에서 출발, foot = [x, y] 리그 발 기준점(칸 px), k = rigFor 축척(게임 px → 칸 px 는 k*4 아님: drawRig 가 SS 배로 그림)
export function fit(P, cell, init, foot, o = {}) {
  const { W, H, m } = cell;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const pose = { ...ZERO, ...init, cape: [...(init.cape || [-20, -30, -40, -50])] };
  const score = q => {
    g.clearRect(0, 0, W, H);
    drawRig(g, P, q, foot[0], foot[1], 1, 1);
    const d = g.getImageData(0, 0, W, H).data;
    let i0 = 0, u = 0;
    for (let n = 0, i = 3; n < W * H; n++, i += 4) { const a = m[n], b = d[i] > 128; if (a && b) i0++; if (a || b) u++; }
    // 출발 자세에서 너무 멀어지면 조금 깎음 (겹침만 보면 팔다리가 엉뚱하게 꺾이기도 함)
    let pen = 0; for (const k of KEYS) pen += Math.abs((q[k] ?? 0) - (init[k] ?? 0));
    return i0 / Math.max(1, u) - pen * (o.reg ?? 0.00004);
  };
  let best = score(pose);
  // o.keys = 맞출 키만 (나머지는 init 그대로 묶음 — 달리기처럼 윗몸은 장면마다 같게 두고 다리만 맞출 때)
  const keys = [...(o.keys || KEYS), ...(o.cape === false ? [] : ['c0', 'c1', 'c2', 'c3'])];
  for (const step of o.steps || [24, 12, 6, 3, 1.5]) {
    let improved = true, rounds = 0;
    while (improved && rounds++ < 6) {
      improved = false;
      for (const key of keys) {
        const isCape = key[0] === 'c' && key.length === 2, ci = +key[1];
        const st = key === 'y' || key === 'x' ? step / 6 : step;
        for (const dv of [st, -st]) {
          const q = isCape ? { ...pose, cape: pose.cape.map((v, i) => i === ci ? Math.max(-160, Math.min(50, v + dv)) : v) }
            : { ...pose, [key]: Math.max(RANGE[key][0], Math.min(RANGE[key][1], (pose[key] ?? 0) + dv)) };
          const s = score(q);
          if (s > best + 1e-5) { best = s; Object.assign(pose, q); improved = true; }
        }
      }
    }
  }
  return { pose, iou: best, preview: () => { g.clearRect(0, 0, W, H); drawRig(g, P, pose, foot[0], foot[1], 1, 1); return cv; } };
}
