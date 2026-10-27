// 리그 캐릭터 종류(주인공·적): rig.json + 부위 그림 → 리그 → 팔레트. 개체마다 자기 굽기 캔버스(low)를 가진다.
// 그리는 순서: 고해상도 캔버스에 리그 → bake.js 로 픽셀 굽기 (팔레트·음영·외곽선) → 월드에 1배로 찍음
import { SS, loadRig, drawRig, sampleColors, blade, sockets, cachedImage, downscale } from './rig.js';
import { bake, kmeans, Palette } from './bake.js';
import { placeholderType, placeholderWeapon } from './placeholder.js';

// 굽기 캔버스 (게임 px): 망토·칼·뻗은 팔이 들어가게 넉넉히. AX·AY = 발 기준점
export const ACT = { CW: 128, CH: 104, AX: 64, AY: 86 };
const his = new Map();
function hiFor(low) {
  const key = low.width + 'x' + low.height;
  let H = his.get(key);
  if (!H) { const hi = document.createElement('canvas'); hi.width = low.width * SS; hi.height = low.height * SS; H = { hi, hctx: hi.getContext('2d') }; his.set(key, H); }
  return { ...H, ax: low.ax * SS, ay: low.ay * SS };
}
export function newBakeCanvas(w = ACT.CW, h = ACT.CH, ax = ACT.AX, ay = ACT.AY) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.ax = ax; c.ay = ay; return c;
}

// dir 의 rig.json 을 읽는다. 없으면 임시 그림(opts.placeholder 색)으로
export async function loadActorType(dir, opts = {}) {
  let rigDef = opts.rigDef || null, images = null;
  if (dir && !rigDef) { try { rigDef = await (await fetch(`${dir}/rig.json`, { cache: 'no-store' })).json(); } catch (e) { rigDef = null; } }
  if (!rigDef) {
    const ph = placeholderType(opts.placeholder);
    rigDef = ph.rigDef; images = { ...ph.img };
    if (opts.weapon) { const w = placeholderWeapon(opts.weapon, ph.C); images.weapon = w.img; rigDef.weapon = w.def; }
  }
  const rig = await loadRig(dir, rigDef, images);
  const pal = new Palette([...kmeans(sampleColors(rig), opts.colors || 16), ...(opts.keep || [])]);
  const death = rigDef.death ? await loadDeath(dir, rigDef.death).catch(e => (console.warn('사망 통그림 없음', dir, e.message), null)) : null;
  // 프레임 애니메이션 (대기·달리기 등, 리그 대신 장면 그림을 그대로): rig.json anims = { 이름: { frames, size, fps } }
  const anims = {};
  for (const [n, def] of Object.entries(rigDef.anims || {})) anims[n] = await loadDeath(dir, def).then(a => ({ ...a, fps: def.fps || 10 })).catch(e => (console.warn('프레임 애니메이션 없음', dir, n, e.message), null));
  return {
    dir, rigDef, rig, pal, death, anims, placeholder: !images ? false : true,
    outline: opts.outline ?? 2, sat: opts.sat ?? 1.05, rim: !!opts.rim, tint: opts.tint || null, scale: opts.scale ?? 1,
  };
}

// ---------- 사망 통그림 (리깅으로 하기 힘든 동작은 통 이미지 컷으로) ----------
// rig.json death = { frames: [{ src, pivot(그림 px, 바닥 닿은 자리), w, h }], size(게임 px / 그림 px), times }
// 죽는 동안은 리그 대신 컷을 같은 굽기(팔레트·외곽선)로 굽는다 → 화면 결이 같음
async function loadDeath(dir, def) {
  const frames = await Promise.all(def.frames.map(async f => {
    const img = await cachedImage(`${dir}/${f.src}`);
    return { img, pivot: f.pivot, w: f.w || img.width, h: f.h || img.height, scaled: new Map() };
  }));
  return { frames: frames.map((f, i) => ({ ...f, mouth: def.frames[i].mouth })), size: def.size, times: def.times || [0, 0.1, 0.3, 0.55] };
}
export const deathFrame = (type, t) => { const T = type.death.times; let i = 0; while (i < T.length - 1 && t >= T[i + 1]) i++; return i; };
export const deathDone = (type, t) => !type.death || t >= type.death.times[type.death.times.length - 1];
function scaledFrame(f, k) {
  const key = Math.round(k * 1e4);
  if (!f.scaled.has(key)) f.scaled.set(key, downscale(f.img, f.w * k, f.h * k));
  return f.scaled.get(key);
}
export function bakeDeath(type, t, facing, low) { bakeCut(type, type.death, type.death.frames[deathFrame(type, t)], facing, low); }
// 프레임 애니메이션 한 장 굽기 (대기·달리기). 돌려주는 값 = 그 장의 입 자리(low px, 가면 숨 steam.js 용)
export function bakeFrame(type, name, i, facing, low, flash = false) {
  const set = type.anims[name], f = set.frames[i % set.frames.length];
  bakeCut(type, set, f, facing, low, flash);
  if (!f.mouth) return null;
  const k = set.size * type.scale;
  return [low.ax + (f.mouth[0] - f.pivot[0]) * k * (facing < 0 ? -1 : 1), low.ay + (f.mouth[1] - f.pivot[1]) * k];
}
// 통그림 한 장(사망 컷·프레임 애니메이션)을 발 기준점에 맞춰 리그와 같은 굽기(팔레트·외곽선)로
function bakeCut(type, set, f, facing, low, flash = false) {
  const k = set.size * SS * type.scale;
  const c = scaledFrame(f, k);
  const { hi, hctx, ax, ay } = hiFor(low);
  hctx.clearRect(0, 0, hi.width, hi.height);
  hctx.save();
  hctx.translate(ax, ay);
  hctx.scale(facing < 0 ? -1 : 1, 1);
  hctx.drawImage(c, -f.pivot[0] * k, -f.pivot[1] * k);
  hctx.restore();
  bake(hi, low, type.pal, bakeOpts(type, flash, facing));
}

function bakeOpts(type, flash, facing) {
  return { quantize: true, outline: type.outline, sat: type.sat, rim: type.rim, flash, tint: type.tint, shade: { depth: 2, ao: 1, lightX: 1 } };
}

// 잘려 나간 조각 굽기: 죽은 순간의 자세(pose.only/hide 로 그 조각만)를, 조각 무게중심 c0(low px)이 low 가운데 오게 옮기고 ang 만큼 돌려 굽는다
// (구운 도트를 돌리면 격자가 비뚤어지니 고해상도에서 돌린 뒤 굽는다)
export function bakeGib(type, pose, facing, low, c0, ang) {
  const { hi, hctx, ax, ay } = hiFor(low);
  hctx.clearRect(0, 0, hi.width, hi.height);
  hctx.save();
  hctx.translate(low.width / 2 * SS, low.height / 2 * SS);
  hctx.rotate(ang);
  hctx.translate(-c0[0] * SS, -c0[1] * SS);
  drawRig(hctx, type.rig, pose, ax, ay, facing, type.scale);
  hctx.restore();
  bake(hi, low, type.pal, bakeOpts(type, false, facing));
}

// pose 를 그 개체의 low 캔버스에 굽는다. flash = 맞았을 때 흰색. 돌아올 때 칼끝·소켓을 low px 로 적어 줌
export function bakeActor(type, pose, facing, low, flash = false) {
  const { hi, hctx, ax, ay } = hiFor(low);
  hctx.clearRect(0, 0, hi.width, hi.height);
  hctx.imageSmoothingEnabled = true;
  drawRig(hctx, type.rig, pose, ax, ay, facing, type.scale);
  bake(hi, low, type.pal, bakeOpts(type, flash, facing));
  const toLow = q => q && [q[0] / SS, q[1] / SS];
  const out = { blade: blade.tip ? { g: toLow(blade.grip), t: toLow(blade.tip) } : null, sock: {} };
  for (const k in sockets) out.sock[k] = toLow(sockets[k]);
  return out;
}
