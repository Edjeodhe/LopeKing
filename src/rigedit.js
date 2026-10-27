// 리그 편집기: 부위 관절 맞추기 · 통 이미지와 겹쳐 비교(차렷 자세 조립) · 게임 픽셀 굽기 미리보기
// 리깅 방식(원더월드 프로토): 통 이미지를 같이 뽑아 두고, 잘라 낸 부위를 조립한 결과를 통 이미지와 겹쳐 어긋난 곳을 본다
import { SS, ZERO, loadRig, drawRig, cachedImage, PARTS } from './rig.js';
import { loadActorType, newBakeCanvas, bakeActor, bakeDeath, ACT } from './actor.js';
import * as A from './anim.js';

const $ = id => document.getElementById(id);
const st = { id: 'assassin', rig: null, part: 'torso', point: 'pivot', ov: 'diff', motion: 'idle', type: null, hiRig: null, ref: null, dirty: false };
const dir = () => `art/${st.id}`;
const EDIT_PARTS = [...PARTS, 'weapon'];

async function load(id) {
  st.id = id;
  st.rig = await (await fetch(`${dir()}/rig.json`, { cache: 'no-store' })).json();
  st.ref = st.rig.ref ? await cachedImage(`${dir()}/${st.rig.ref.src}?${Date.now()}`) : null;
  st.imgs = {};
  for (const n of PARTS) if (st.rig.parts[n]) st.imgs[n] = await cachedImage(`${dir()}/${st.rig.parts[n].src}`);
  if (st.rig.weapon) st.imgs.weapon = await cachedImage(`${dir()}/${st.rig.weapon.src}`);
  $('scale').value = st.rig.scale;
  $('refk').value = st.rig.ref?.k ?? 1;
  buildPartButtons();
  await rebuild();
}

function buildPartButtons() {
  const box = $('parts'); box.innerHTML = '';
  for (const n of EDIT_PARTS) {
    if (n !== 'weapon' && !st.rig.parts[n]) continue;
    const b = document.createElement('button');
    b.textContent = n; b.className = n === st.part ? 'on' : '';
    b.onclick = () => { st.part = n; st.point = 'pivot'; buildPartButtons(); drawPart(); };
    box.appendChild(b);
  }
  const p = spec();
  $('size').value = Array.isArray(p.size) ? p.size[0] : (p.size ?? 1);
}
// 지금 고른 부위의 명세 (무기는 grip·tip 을 pivot·joints 처럼 다룸)
function spec() { return st.part === 'weapon' ? st.rig.weapon : st.rig.parts[st.part]; }
function points() {
  const p = spec();
  if (st.part === 'weapon') return { pivot: p.grip, tip: p.tip };
  return { pivot: p.pivot, ...(p.joints || {}) };
}
function setPoint(name, v) {
  const p = spec();
  if (st.part === 'weapon') { if (name === 'pivot') p.grip = v; else p.tip = v; }
  else if (name === 'pivot') p.pivot = v; else p.joints[name] = v;
}

// ---------- 부위 보기 ----------
let view = { k: 1, ox: 0, oy: 0 };
function drawPart() {
  const c = $('partView'), x = c.getContext('2d');
  x.fillStyle = '#0c0b12'; x.fillRect(0, 0, c.width, c.height);
  const img = st.imgs[st.part], cell = st.part === 'weapon' ? st.rig.weapon.cell : (spec().cell || st.rig.cell);
  const k = Math.min(c.width / cell[0], c.height / cell[1]);
  view = { k, ox: (c.width - cell[0] * k) / 2, oy: (c.height - cell[1] * k) / 2 };
  x.strokeStyle = '#2a2638'; x.strokeRect(view.ox + 0.5, view.oy + 0.5, cell[0] * k, cell[1] * k);
  x.imageSmoothingEnabled = true;
  if (img) x.drawImage(img, view.ox, view.oy, cell[0] * k, cell[1] * k);
  for (const [n, v] of Object.entries(points())) {
    if (!v) continue;
    const px = view.ox + v[0] * k, py = view.oy + v[1] * k, on = n === st.point;
    x.strokeStyle = n === 'pivot' ? '#ffe040' : '#40e0ff'; x.lineWidth = on ? 3 : 1.5;
    x.beginPath(); x.arc(px, py, on ? 7 : 5, 0, Math.PI * 2); x.stroke();
    x.fillStyle = x.strokeStyle; x.font = '11px system-ui'; x.fillText(n, px + 9, py - 6);
  }
  const v = points()[st.point];
  $('pointInfo').textContent = v ? `${st.part}.${st.point} = [${v.map(n => n.toFixed(1)).join(', ')}]` : '';
}
let drag = null;
$('partView').addEventListener('mousedown', e => {
  const r = e.target.getBoundingClientRect(), mx = (e.clientX - r.left) * e.target.width / r.width, my = (e.clientY - r.top) * e.target.height / r.height;
  let best = null, bd = 14;
  for (const [n, v] of Object.entries(points())) {
    if (!v) continue;
    const d = Math.hypot(view.ox + v[0] * view.k - mx, view.oy + v[1] * view.k - my);
    if (d < bd) { bd = d; best = n; }
  }
  if (best) { st.point = best; drag = true; drawPart(); }
});
addEventListener('mousemove', e => {
  if (!drag) return;
  const c = $('partView'), r = c.getBoundingClientRect();
  const mx = (e.clientX - r.left) * c.width / r.width, my = (e.clientY - r.top) * c.height / r.height;
  setPoint(st.point, [+((mx - view.ox) / view.k).toFixed(1), +((my - view.oy) / view.k).toFixed(1)]);
  drawPart(); changed();
});
addEventListener('mouseup', () => { drag = null; });
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const v = points()[st.point];
  if (e.key === 'Tab') { e.preventDefault(); const ks = Object.keys(points()); st.point = ks[(ks.indexOf(st.point) + 1) % ks.length]; drawPart(); return; }
  if (!v) return;
  const s = e.shiftKey ? 10 : 1, d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
  if (!d) return;
  e.preventDefault();
  setPoint(st.point, [v[0] + d[0], v[1] + d[1]]); drawPart(); changed();
});
$('size').addEventListener('change', e => { const p = spec(); p.size = +e.target.value; changed(); });
$('scale').addEventListener('change', e => { st.rig.scale = +e.target.value; changed(); });
$('refk').addEventListener('change', e => { st.rig.ref.k = +e.target.value; changed(); });
for (const b of document.querySelectorAll('[data-ov]')) b.onclick = () => { st.ov = b.dataset.ov; for (const q of document.querySelectorAll('[data-ov]')) q.className = q === b ? 'on' : ''; drawCompare(); };

let timer = 0;
function changed() { st.dirty = true; $('status').textContent = '저장 안 됨'; clearTimeout(timer); timer = setTimeout(rebuild, 120); }

// 통 이미지와 비교할 땐 부위 배율(size)을 빼고 조립 — 통 이미지는 배율 전 그림이라서.
// (SD 비율은 그림을 맞춘 뒤 rig.json size 로 머리를 키우고 다리를 줄여 만든다: 프로토 사막 은둔자와 같은 방식)
const unsized = r => ({ ...r, scale: 1 / SS, parts: Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, { ...v, size: 1 }])) });

// ---------- 다시 조립 ----------
async function rebuild() {
  // 비교용: 칸 px = 그림 px 1:1 (K = 1/SS)
  st.hiRig = await loadRig(dir(), unsized(st.rig), st.imgs);
  st.type = await loadActorType(dir(), { rigDef: st.rig, colors: 18 });
  drawPart(); drawCompare();
}

function drawCompare() {
  const c = $('cmp'), x = c.getContext('2d');
  x.fillStyle = '#0c0b12'; x.fillRect(0, 0, c.width, c.height);
  if (!st.ref || !st.hiRig) return;
  const W = st.ref.width, H = st.ref.height;
  const mk = () => { const q = document.createElement('canvas'); q.width = W; q.height = H; return q; };
  const ref = mk(), rig = mk();
  ref.getContext('2d').drawImage(st.ref, 0, 0);
  const rx = rig.getContext('2d');
  const k = st.rig.ref.k ?? 1, f = st.rig.ref.foot;
  drawRig(rx, st.hiRig, { ...ZERO, cape: [0, 0, 0], hide: ['sword'] }, f[0], f[1], 1, k);
  const a = ref.getContext('2d').getImageData(0, 0, W, H).data, b = rx.getImageData(0, 0, W, H).data;
  const out = new ImageData(W, H), o = out.data;
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i += 4) {
    const A_ = a[i + 3] > 128, B = b[i + 3] > 128;
    if (A_ && B) inter++; if (A_ || B) uni++;
    if (st.ov === 'diff') {
      if (A_ && B) { o[i] = a[i] * 0.45; o[i + 1] = a[i + 1] * 0.45; o[i + 2] = a[i + 2] * 0.45; o[i + 3] = 255; }
      else if (A_) { o[i] = 235; o[i + 1] = 60; o[i + 2] = 60; o[i + 3] = 255; }
      else if (B) { o[i] = 70; o[i + 1] = 200; o[i + 2] = 255; o[i + 3] = 255; }
    } else if (st.ov === 'blend') {
      const s = B ? b : a, w = A_ && B ? 0.5 : 1;
      if (A_ || B) { o[i] = A_ && B ? (a[i] + b[i]) / 2 : s[i]; o[i + 1] = A_ && B ? (a[i + 1] + b[i + 1]) / 2 : s[i + 1]; o[i + 2] = A_ && B ? (a[i + 2] + b[i + 2]) / 2 : s[i + 2]; o[i + 3] = 255 * w; }
    } else {
      const s = st.ov === 'rig' ? b : a;
      o[i] = s[i]; o[i + 1] = s[i + 1]; o[i + 2] = s[i + 2]; o[i + 3] = s[i + 3];
    }
  }
  const t = mk(); t.getContext('2d').putImageData(out, 0, 0);
  const s = Math.min(c.width / W, c.height / H);
  x.imageSmoothingEnabled = true;
  x.drawImage(t, (c.width - W * s) / 2, (c.height - H * s) / 2, W * s, H * s);
  $('score').textContent = `IoU ${(inter / Math.max(1, uni) * 100).toFixed(1)}%`;
}

// ---------- 자동 맞춤 ----------
// 부위마다 피벗을 조금씩 옮겨 보며(= 부모 관절에 붙는 자리를 옮김) 통 이미지와 겹치는 정도(IoU)가 오르면 남긴다.
// 절반 크기로 계산 (빠르게). 뼈대 순서대로: 엉덩이 → 몸통 → 머리·망토 → 다리 → 팔
async function autoFit() {
  $('status').textContent = '자동 맞춤 중…';
  await new Promise(r => setTimeout(r, 20));
  const W = st.ref.width >> 1, H = st.ref.height >> 1;
  const refC = document.createElement('canvas'); refC.width = W; refC.height = H;
  refC.getContext('2d').drawImage(st.ref, 0, 0, W, H);
  const ra = refC.getContext('2d').getImageData(0, 0, W, H).data;
  const refMask = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) refMask[i] = ra[i * 4 + 3] > 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
  const score = async () => {
    const P = await loadRig(dir(), unsized(st.rig), st.imgs);
    x.clearRect(0, 0, W, H); x.save(); x.scale(0.5, 0.5);
    const f = st.rig.ref.foot;
    drawRig(x, P, { ...ZERO, cape: [0, 0, 0], hide: ['sword'] }, f[0], f[1], 1, st.rig.ref.k ?? 1);
    x.restore();
    const d = x.getImageData(0, 0, W, H).data;
    let i0 = 0, u = 0;
    for (let i = 0; i < W * H; i++) { const a = refMask[i], b = d[i * 4 + 3] > 128; if (a && b) i0++; if (a || b) u++; }
    return i0 / Math.max(1, u);
  };
  let best = await score();
  // 피벗은 그 부위 그림 안(테두리 6px 여유)에만 — 밖으로 나가면 몸통·엉덩이 사이가 벌어짐 (부위 배율을 넣으면 드러남)
  const bbox = {};
  for (const n of Object.keys(st.rig.parts)) {
    const im = st.imgs[n], c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const k = (st.rig.parts[n].cell || st.rig.cell)[0] / im.width;   // 그림 px → 칸 px
    bbox[n] = [x0 * k - 6, y0 * k - 6, x1 * k + 6, y1 * k + 6];
  }
  const inside = (n, q) => { const b = bbox[n]; return !b || (q[0] >= b[0] && q[0] <= b[2] && q[1] >= b[1] && q[1] <= b[3]); };
  const order = ['hips', 'torso', 'head', 'cape', 'thigh', 'shin', 'upperArm', 'foreArm'].filter(n => st.rig.parts[n]);
  for (const step of [24, 12, 6, 3]) {
    for (const n of order) {
      const p = st.rig.parts[n];
      let improved = true;
      while (improved) {
        improved = false;
        for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const old = p.pivot;
          p.pivot = [old[0] + dx, old[1] + dy];
          if (!inside(n, p.pivot)) { p.pivot = old; continue; }
          const s = await score();
          if (s > best + 1e-4) { best = s; improved = true; }
          else p.pivot = old;
        }
      }
    }
    $('status').textContent = `자동 맞춤 중… IoU ${(best * 100).toFixed(1)}%`;
  }
  changed();
}

// ---------- 게임 미리보기 ----------
const MOTIONS = {
  idle: t => [A.idle(t), 0, 0],
  run: t => [A.run(t * 1.7), 125, 0],
  heroIdle: t => [A.heroIdle(t), 0, 0],
  heroRun: t => [A.heroRun(t * 1.7), 125, 0],
  jump: () => [A.JUMP, 40, -200],
  fall: () => [A.FALL, 40, 250],
  slashDown: t => [A.slash(t % 0.6, 90, 1), 0, 0],
  slashUp: t => [A.slash(t % 0.6, 120, -1), 0, 0],
  combo: t => { const L = A.COMBO.map(A.moveLen), T = t % (L.reduce((a, b) => a + b) + 0.4); let i = 0, u = T; while (i < 3 && u >= L[i]) u -= L[i++]; return [A.comboPose(i, Math.min(u, L[i] - 0.001), 90), 0, 0]; },
  hang: t => [A.hang(170 + Math.sin(t * 2.5) * 30, Math.cos(t * 2.5), false), Math.cos(t * 2.5) * 150, 0],
  dash: () => [A.DASH, 330, 0],
  wall: () => [A.WALL, 0, 60],
  hurt: () => [A.HURT, -80, -60],
  death: t => [null, 0, 0],
};
function buildMotionButtons() {
  const box = $('motions'); box.innerHTML = '';
  for (const n in MOTIONS) {
    const b = document.createElement('button'); b.textContent = n; b.className = n === st.motion ? 'on' : '';
    b.onclick = () => { st.motion = n; buildMotionButtons(); }; box.appendChild(b);
  }
}
const low = newBakeCanvas(), cape = A.newCape();
let t0 = performance.now(), last = t0;
function loop(now) {
  requestAnimationFrame(loop);
  const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!st.type) return;
  const c = $('game'), x = c.getContext('2d');
  x.fillStyle = '#1e1838'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#2c2b42'; x.fillRect(0, ACT.AY * 6, c.width, c.height);
  if (st.motion === 'death') {
    if (st.type.death) bakeDeath(st.type, t % 1.6, 1, low);
    else low.getContext('2d').clearRect(0, 0, low.width, low.height);
  } else {
    const [pose, vx, vy] = MOTIONS[st.motion](t);
    bakeActor(st.type, { ...pose, cape: A.stepCape(cape, vx, vy, 1, dt) }, pose.turn ? -1 : 1, low);   // turn = 회전 베기 중 돌아선 프레임
  }
  x.imageSmoothingEnabled = false;
  x.drawImage(low, 0, 0, low.width * 6, low.height * 6);
}

// 모션 한 장 보기: 모션마다 6장씩 시간 순서로 (픽셀 굽기 그대로 3배)
function motionSheet() {
  if (!st.type) return;   // 아직 읽는 중
  const names = Object.keys(MOTIONS).filter(n => n !== 'death'), N = 6, Z = 3;
  const cw = 96, chh = 80, c = $('sheet');
  c.width = cw * N * Z; c.height = chh * (names.length + 1) * Z;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.fillStyle = '#1e1838'; x.fillRect(0, 0, c.width, c.height);
  const tmp = newBakeCanvas(), cp = A.newCape();
  names.forEach((n, row) => {
    for (let i = 0; i < N; i++) {
      const t = n.startsWith('slash') ? i * 0.04 : n === 'combo' ? i * 0.3 : i * 0.11;
      const [pose, vx, vy] = MOTIONS[n](t);
      for (let k = 0; k < 20; k++) A.stepCape(cp, vx, vy, 1, 1 / 60);
      bakeActor(st.type, { ...pose, cape: A.stepCape(cp, vx, vy, 1, 1 / 60) }, pose.turn ? -1 : 1, tmp);
      x.drawImage(tmp, (ACT.AX - cw / 2), ACT.AY - chh + 10, cw, chh, i * cw * Z, row * chh * Z, cw * Z, chh * Z);
    }
    x.fillStyle = '#fff'; x.font = '12px system-ui'; x.fillText(n, 4, row * chh * Z + 14);
  });
  if (st.type.death) for (let i = 0; i < 4; i++) {
    bakeDeath(st.type, st.type.death.times[i] + 0.01, 1, tmp);
    x.drawImage(tmp, (ACT.AX - cw / 2), ACT.AY - chh + 10, cw, chh, i * cw * Z, names.length * chh * Z, cw * Z, chh * Z);
  }
}
$('char').onchange = e => load(e.target.value);
$('sheetBtn').onclick = motionSheet;
$('fit').onclick = autoFit;
$('save').onclick = async () => {
  const r = await fetch(`/save?path=${encodeURIComponent(`art/${st.id}/rig.json`)}`, { method: 'POST', body: JSON.stringify(st.rig) });
  $('status').textContent = r.ok ? '저장함' : '저장 실패 (tools/server.py 로 띄웠는지 확인)';
  st.dirty = !r.ok;
};
buildMotionButtons();
load(new URLSearchParams(location.search).get('char') || 'assassin');
requestAnimationFrame(loop);
