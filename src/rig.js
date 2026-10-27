// 컷아웃 리그 (옆모습 전용): 부위 PNG를 뼈 각도대로 고해상도 캔버스에 그린다 → bake.js 가 픽셀로 굽는다.
// 단위는 게임 화면 픽셀. 고해상도 단계는 SS배로 그린다. 횡스크롤이라 정면·뒷모습은 없음, 좌우는 반전으로.
// 원더월드 프로토 rig.js 의 옆모습 부분을 가져와 망토를 사슬(여러 마디)로 바꾼 것.

export const SS = 4;

// 부위 목록 (옆모습, 오른쪽을 봄). rig.json parts[이름] = { pivot:[x,y], joints:{...} } (칸 px)
// head(삿갓 포함) · torso(neck, shoulderN, shoulderF, cape) · hips(waist, hipN, hipF) · cape(망토, 위 가운데가 pivot)
// upperArm(elbow) · foreArm(hand) · thigh(knee) · shin(sole)
export const PARTS = ['head', 'torso', 'hips', 'cape', 'upperArm', 'foreArm', 'thigh', 'shin'];
const OPTIONAL = new Set(['cape']);
export const CAPE_SEGS = 3;   // 망토를 세로로 몇 마디로 나눠 꺾을지 (사슬 물리, anim.js capeChain)

function loadImage(src) {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => fail(new Error('이미지 로드 실패 ' + src));
    im.src = src;
  });
}
const imgCache = new Map();
export const cachedImage = src => {
  if (!imgCache.has(src)) imgCache.set(src, loadImage(src));
  return imgCache.get(src);
};

// 큰 원본을 반씩 줄여 가며 목표 크기로 (한 번에 줄이면 계단이 생김)
export function downscale(img, w, h) {
  let cur = img, cw = img.width, ch = img.height;
  while (cw / 2 > w && ch / 2 > h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(cw / 2); c.height = Math.ceil(ch / 2);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, c.width, c.height);
  return c;
}

// 먼 쪽 팔·다리용 어둡게 한 사본
function darken(c, alpha) {
  const d = document.createElement('canvas');
  d.width = c.width; d.height = c.height;
  const x = d.getContext('2d');
  x.drawImage(c, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = `rgba(14,12,30,${alpha})`;
  x.fillRect(0, 0, d.width, d.height);
  return d;
}

// 칸 그림 하나 → 부위. 크기는 그림 px 가 아니라 칸 크기(cell)로 계산 (칸을 줄여 넣어도 관절이 안 어긋나게)
// size: 배율 하나 또는 [높이, 가로] — SD 비율 맞추기(머리 키우기·다리 줄이기)
export function cellPart(img, a, cell, K, size = 1) {
  const [hm, wm] = Array.isArray(size) ? size : [size, size];
  const c = downscale(img, cell[0] * K * SS * wm, cell[1] * K * SS * hm);
  const fx = ([x, y]) => [x / cell[0], y / cell[1]];
  const def = { pivot: fx(a.pivot), joints: {}, rot: a.rot || 0 };
  for (const k in a.joints || {}) def.joints[k] = fx(a.joints[k]);
  return { def, img: c, dark: darken(c, 0.38), w: c.width, h: c.height, px: def.pivot[0], py: def.pivot[1] };
}

// rigDef = art/<캐릭터>/rig.json, images = { 부위: Image|Canvas, weapon } (없으면 dir 에서 읽음)
export async function loadRig(dir, rigDef, images = null) {
  const P = {};
  const get = async n => images ? images[n] : cachedImage(`${dir}/${rigDef.parts[n].src || `parts/${n}.png`}`);
  await Promise.all(PARTS.map(async n => {
    const a = rigDef.parts[n];
    if (!a) { if (OPTIONAL.has(n)) return; throw new Error('부위 없음 ' + n); }
    try { P[n] = cellPart(await get(n), a, a.cell ?? rigDef.cell, rigDef.scale, a.size ?? 1); }
    catch (e) { if (!OPTIONAL.has(n)) throw e; }
  }));
  const w = rigDef.weapon;
  if (w) {
    const img = images ? images.weapon : await cachedImage(`${dir}/${w.src}`);
    P.sword = cellPart(img, { pivot: w.grip, rot: w.rot }, w.cell, rigDef.scale, w.size ?? 1);
    P.sword.tipLocal = w.tip ? [(w.tip[0] / w.cell[0] - P.sword.px) * P.sword.w, (w.tip[1] / w.cell[1] - P.sword.py) * P.sword.h] : null;
  }
  Object.defineProperty(P, 'cloak', { value: !!rigDef.cloak, enumerable: false });
  return P;
}

const R = d => -d * Math.PI / 180;

function J(p, name) {
  const j = p.def.joints[name];
  if (!j) return [0, 0];
  return [(j[0] - p.px) * p.w, (j[1] - p.py) * p.h];
}

// 칼날: 마지막으로 그린 무기의 손잡이(grip)·칼끝(tip) 자리 (그린 캔버스 px). 칼끝 궤적 이펙트가 이걸 따라감 (fx.js smear)
export const blade = { grip: null, tip: null };
function tipOf(p) {
  if (p.tip) return p.tip;
  if (p.tipLocal) return (p.tip = p.tipLocal);
  // 칼끝 = 쥔 자리(피벗)에서 가장 먼 불투명 픽셀 (그림 하나에 한 번)
  const c = p.img, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const cx = p.px * p.w, cy = p.py * p.h;
  let best = 0, tip = [0, p.h - cy];
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    if (d[(y * c.width + x) * 4 + 3] < 128) continue;
    const dd = (x - cx) ** 2 + (y - cy) ** 2;
    if (dd > best) { best = dd; tip = [x - cx, y - cy]; }
  }
  return (p.tip = tip);
}
function markBlade(ctx, p) {
  const m = ctx.getTransform(), t = tipOf(p);
  blade.grip = [m.e, m.f];
  blade.tip = [m.a * t[0] + m.c * t[1] + m.e, m.b * t[0] + m.d * t[1] + m.f];
}

// 기준점(소켓): hand(칼 든 손) · offHand(로프 쏘는 손) · footN/footF · capeTop · chest — 그린 캔버스 px
export const sockets = {};
function mark(ctx, name, pt = [0, 0]) {
  const m = ctx.getTransform();
  sockets[name] = [m.a * pt[0] + m.c * pt[1] + m.e, m.b * pt[0] + m.d * pt[1] + m.f];
}

function draw(ctx, p, dark) {
  ctx.drawImage(dark ? p.dark : p.img, -p.px * p.w, -p.py * p.h);
}

// ---------- 자세 ----------
// 각도는 도(deg). 팔다리는 0 = 곧게 아래, + = 앞으로(보는 쪽) 돌아감. 몸통·머리는 + = 앞으로 숙임.
// n = 가까운 쪽(near, 칼 든 팔), f = 먼 쪽(far, 로프 쏘는 팔). U 위팔 · F 아래팔(팔꿈치 굽힘) · T 허벅지 · S 정강이
// sw = 칼 각도(손 기준), swLen = 칼 길이 배율, swBack = 1 이면 칼을 몸 뒤 층에 (눕힌 칼이 먼 쪽을 지날 때), rot = 몸 전체 회전(+ = 등 쪽으로 넘어감), br = 숨
// cape = 망토 마디별 세상 기준 각도 배열 (0 = 아래로 늘어짐, - = 뒤로 날림, 보는 쪽 기준)
export const ZERO = {
  x: 0, y: 0, torso: 0, head: 0, br: 0, swLen: 1, swBack: 0, rot: 0,
  nU: 0, nF: 0, sw: 0, fU: 0, fF: 0,
  nT: 0, nS: 0, fT: 0, fS: 0,
};

export function lerpPose(a, b, t) {
  const o = {};
  for (const k in b) o[k] = typeof b[k] === 'number' ? (a[k] ?? 0) + (b[k] - (a[k] ?? 0)) * t : b[k];
  return o;
}

// 레이어 순서 (작은 번호부터 = 뒤쪽). 시점이 하나라 표 하나.
// 먼 팔 → 망토 → 먼 다리 → 몸 → 엉덩이(코트 자락) → 가까운 다리 → 머리 → 가까운 위팔 → 칼 → 가까운 아래팔
export const LAYERS = { farArm: 10, cape: 15, farLeg: 20, torso: 30, hips: 40, nearLeg: 50, head: 60, nearUpperArm: 70, sword: 75, nearForeArm: 80 };
// 긴 코트 자락(cloak): 두 다리 모두 자락 뒤
export const LAYERS_CLOAK = { ...LAYERS, nearLeg: 25 };
function layerList() {
  const L = [];
  return { at: (z, fn) => L.push([z, L.length, fn]), run: () => { L.sort((a, b) => a[0] - b[0] || a[1] - b[1]); for (const l of L) l[2](); } };
}

function hipHeight(P) {
  const t = P.thigh, s = P.shin;
  const sole = s.def.joints?.sole?.[1] ?? 1;
  // 엉덩이 피벗 ~ 엉덩이 관절(hipN) 높이 차이까지 더함 → 피벗을 어디 찍어도 발이 땅에 닿음
  return ((t.def.joints.knee[1] - t.py) * t.h + (sole - s.py) * s.h + J(P.hips, 'hipN')[1]) / SS - 0.5;
}

// 쓰러지기·로프에 매달린 몸 기울기(pose.rot): 엉덩이 높이를 축으로 몸 전체를 돌림
function rotBody(ctx, pose, hipH) {
  if (!pose.rot) return;
  const a = pose.rot * Math.PI / 180;
  ctx.translate(0, -hipH * SS);
  if (pose.rotDrop) ctx.translate(0, (hipH - 4) * Math.sin(Math.abs(a)) * SS);   // 쓰러질 때만 바닥으로 내림
  ctx.rotate(-a);
  ctx.translate(0, hipH * SS);
}

// 부위 가리기: pose.hide = [...] (그 부위만 빼고) · pose.only = [...] (그 부위만) — 잘려 나간 조각을 따로 그릴 때 (gore.js)
// 이름: 부위 이름 그대로 + 묶음 upper(허리 위 전부) · lower(엉덩이·다리) · nearArm · farArm · nearLeg · farLeg
const GROUP = { head: ['upper'], torso: ['upper'], cape: ['upper'], upperArm: ['upper'], foreArm: ['upper'], sword: ['upper'], hips: ['lower'], thigh: ['lower'], shin: ['lower'] };
function shown(pose, n, side) {
  if (!pose.hide && !pose.only) return true;
  const toks = [n, ...(GROUP[n] || [])];
  if (side) toks.push(side + (n === 'thigh' || n === 'shin' ? 'Leg' : 'Arm'));
  if (pose.only && !toks.some(t => pose.only.includes(t))) return false;
  if (pose.hide && toks.some(t => pose.hide.includes(t))) return false;
  return true;
}

// ctx: 고해상도 캔버스. (ax, ay): 발 기준점(고해상도 px). facing: 1 오른쪽 / -1 왼쪽
export function drawRig(ctx, P, pose, ax, ay, facing, scale = 1) {
  blade.grip = blade.tip = null;
  for (const k in sockets) delete sockets[k];
  const hipH = hipHeight(P);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.scale(facing * scale, scale);
  rotBody(ctx, pose, hipH);
  ctx.translate(pose.x * SS, pose.y * SS);
  ctx.translate(0, -hipH * SS);

  const torsoFrame = fn => {
    ctx.save();
    ctx.translate(...J(P.hips, 'waist'));
    ctx.rotate(-R(pose.torso));
    if (pose.br) ctx.scale(1 + pose.br * 0.02, 1 + pose.br * 0.035);
    fn();
    ctx.restore();
  };
  // 팔: 어깨 → 위팔 → 팔꿈치 → 아래팔 → 손 (→ 칼). what = 'upper' | 'fore' | 'sword'
  const arm = (shoulder, u, f, dark, what, sw) => torsoFrame(() => {
    const side = dark ? 'far' : 'near';
    ctx.translate(...J(P.torso, shoulder));
    mark(ctx, side + 'Shoulder');
    ctx.rotate(R(u));
    if (what === 'upper') { if (shown(pose, 'upperArm', side)) draw(ctx, P.upperArm, dark); return; }
    ctx.translate(...J(P.upperArm, 'elbow'));
    mark(ctx, side + 'Elbow');
    ctx.rotate(R(f));
    if (what === 'fore') { if (shown(pose, 'foreArm', side)) draw(ctx, P.foreArm, dark); mark(ctx, dark ? 'offHand' : 'handNear', J(P.foreArm, 'hand')); return; }
    ctx.translate(...J(P.foreArm, 'hand'));
    mark(ctx, 'hand');
    ctx.rotate(R(sw + (P.sword.def.rot || 0)));
    ctx.scale(1, pose.swLen ?? 1);
    markBlade(ctx, P.sword);
    if (shown(pose, 'sword', 'near')) draw(ctx, P.sword, false);
  });
  const leg = (hip, t, s, dark) => {
    const side = dark ? 'far' : 'near';
    ctx.save();
    ctx.translate(...J(P.hips, hip));
    ctx.rotate(R(t));
    if (shown(pose, 'thigh', side)) draw(ctx, P.thigh, dark);
    ctx.translate(...J(P.thigh, 'knee'));
    ctx.rotate(R(s));
    if (shown(pose, 'shin', side)) draw(ctx, P.shin, dark);
    mark(ctx, dark ? 'footF' : 'footN', J(P.shin, 'sole'));
    ctx.restore();
  };
  // 망토: 어깨 뒤 cape 관절에 매달린 사슬. 그림을 세로로 CAPE_SEGS 마디로 잘라 마디마다 꺾는다.
  // 각도는 세상 기준이라 몸통·몸 회전을 빼서 지금 좌표계로 바꿈
  const cape = () => torsoFrame(() => {
    if (!P.cape || !shown(pose, 'cape')) return;
    const c = P.cape, segs = pose.cape || [0];
    ctx.translate(...J(P.torso, 'cape'));
    mark(ctx, 'capeTop');
    const top = c.py * c.h, H = c.h - top, n = CAPE_SEGS, sh = H / n;
    let prev = -(pose.torso || 0) + (pose.rot || 0);   // 지금 좌표계가 세상에 대해 돌아간 각도(도, 뼈 기준)
    for (let i = 0; i < n; i++) {
      const a = segs[Math.min(i, segs.length - 1)] ?? 0;
      ctx.rotate(R(a + (i === 0 ? -prev : 0) - (i === 0 ? 0 : segs[Math.min(i - 1, segs.length - 1)])));
      // 뒤로 크게 날릴수록 살짝 펴짐
      const st = 1 + Math.min(0.2, Math.max(0, -a) / 300);
      const y0 = top + sh * i, h = Math.min(sh + SS, c.h - y0);   // 마디끼리 조금 겹쳐 틈을 메움
      ctx.drawImage(c.img, 0, y0, c.w, h, -c.px * c.w, 0, c.w, h * st);
      ctx.translate(0, sh * st);
    }
  });

  const Z = P.cloak ? LAYERS_CLOAK : LAYERS, ly = layerList();
  ly.at(Z.farArm, () => { arm('shoulderF', pose.fU, pose.fF, true, 'upper'); arm('shoulderF', pose.fU, pose.fF, true, 'fore'); });
  ly.at(Z.cape, cape);
  ly.at(Z.farLeg, () => leg('hipF', pose.fT, pose.fS, true));
  ly.at(Z.torso, () => torsoFrame(() => { mark(ctx, 'chest', J(P.torso, 'shoulderN')); if (shown(pose, 'torso')) draw(ctx, P.torso, false); }));
  ly.at(Z.hips, () => {
    mark(ctx, 'waist', J(P.hips, 'waist'));
    if (!shown(pose, 'hips')) return;
    if (!P.cloak) return draw(ctx, P.hips, false);
    // 코트 자락: 다리를 따라 허리 축으로 흔들리고 보폭만큼 벌어짐
    ctx.save();
    ctx.translate(...J(P.hips, 'waist'));
    ctx.rotate(R((pose.nT + pose.fT) * 0.3));
    ctx.scale(1 + Math.min(0.3, Math.abs(pose.nT - pose.fT) / 300), 1);
    ctx.translate(...J(P.hips, 'waist').map(v => -v));
    draw(ctx, P.hips, false);
    ctx.restore();
  });
  ly.at(Z.nearLeg, () => leg('hipN', pose.nT, pose.nS, false));
  ly.at(Z.head, () => torsoFrame(() => {
    ctx.translate(...J(P.torso, 'neck'));
    ctx.rotate(-R(pose.head));
    mark(ctx, 'head');
    if (shown(pose, 'head')) draw(ctx, P.head, false);
  }));
  ly.at(Z.nearUpperArm, () => arm('shoulderN', pose.nU, pose.nF, false, 'upper'));
  if (P.sword) ly.at(pose.swBack > 0.5 ? Z.torso - 1 : Z.sword, () => arm('shoulderN', pose.nU, pose.nF, false, 'sword', pose.sw));
  ly.at(Z.nearForeArm, () => arm('shoulderN', pose.nU, pose.nF, false, 'fore'));
  ly.run();
  ctx.restore();
}

// 팔레트 추출용: 모든 부위 픽셀 샘플
export function sampleColors(P, max = 8000) {
  const out = [];
  for (const p of Object.values(P)) {
    const d = p.img.getContext('2d').getImageData(0, 0, p.img.width, p.img.height).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) out.push([d[i], d[i + 1], d[i + 2]]);
  }
  const step = Math.max(1, Math.floor(out.length / max));
  return out.filter((_, i) => i % step === 0);
}
