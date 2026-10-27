// 임시 부위 그림 (코드로 그림): 그림이 아직 없는 캐릭터(적)도 같은 리그·굽기 파이프라인으로 돌리기 위한 것.
// 진짜 그림이 생기면 같은 rig.json 규격(칸 px 관절)으로 바꿔 끼우면 된다.
const CELL = [128, 160];

function cv(w = CELL[0], h = CELL[1]) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// 셀 셰이딩 흉내: 본색 → 왼쪽(빛 반대) 그림자 띠 → 오른쪽 위 밝은 테
function blob(x, path, base, shadow, light) {
  x.save();
  path(); x.fillStyle = base; x.fill();
  x.clip();
  const b = x.canvas;
  x.fillStyle = shadow; x.fillRect(0, 0, b.width * 0.47, b.height);
  x.restore();
  x.save(); path(); x.clip();
  x.strokeStyle = light; x.lineWidth = 5; x.translate(2, -2); path(); x.stroke();
  x.restore();
}
const rr = (x, l, t, w, h, r) => () => { x.beginPath(); x.roundRect(l, t, w, h, r); };

export function placeholderType(col) {
  const C = { cloth: '#3a3550', clothD: '#25213a', clothL: '#5a5478', metal: '#8a8fa0', metalD: '#555a6a', metalL: '#c8ccd8', skin: '#c89c80', skinD: '#8a6450', accent: '#c03030', ...col };
  const img = {};
  { const c = cv(), x = c.getContext('2d');   // 머리: 투구 + 얼굴 가리개
    blob(x, rr(x, 54, 86, 20, 22, 4), C.skinD, C.skinD, C.skin);
    blob(x, () => { x.beginPath(); x.ellipse(64, 66, 27, 30, 0, 0, Math.PI * 2); }, C.metal, C.metalD, C.metalL);
    blob(x, rr(x, 64, 58, 26, 14, 3), C.clothD, C.clothD, C.accent);
    blob(x, () => { x.beginPath(); x.moveTo(30, 52); x.lineTo(98, 52); x.lineTo(92, 42); x.lineTo(36, 42); x.closePath(); }, C.metalD, C.metalD, C.metalL);
    img.head = c; }
  { const c = cv(), x = c.getContext('2d');
    blob(x, rr(x, 44, 30, 40, 62, 12), C.cloth, C.clothD, C.clothL);
    blob(x, rr(x, 44, 46, 40, 8, 2), C.metalD, C.metalD, C.metal);
    img.torso = c; }
  { const c = cv(), x = c.getContext('2d');
    blob(x, rr(x, 45, 40, 38, 34, 8), C.clothD, C.clothD, C.cloth);
    blob(x, rr(x, 44, 40, 40, 8, 2), C.accent, C.accent, C.metalL);
    img.hips = c; }
  { const c = cv(), x = c.getContext('2d');
    blob(x, rr(x, 54, 14, 20, 52, 9), C.cloth, C.clothD, C.clothL);
    img.upperArm = c; }
  { const c = cv(), x = c.getContext('2d');
    blob(x, rr(x, 56, 16, 16, 44, 7), C.clothD, C.clothD, C.cloth);
    blob(x, rr(x, 54, 50, 20, 16, 7), C.skinD, C.skinD, C.skin);
    img.foreArm = c; }
  { const c = cv(), x = c.getContext('2d');
    blob(x, rr(x, 53, 16, 22, 54, 10), C.clothD, C.clothD, C.cloth);
    img.thigh = c; }
  { const c = cv(), x = c.getContext('2d');
    blob(x, rr(x, 55, 16, 18, 50, 8), C.clothD, C.clothD, C.cloth);
    blob(x, () => { x.beginPath(); x.roundRect(52, 62, 32, 18, [6, 10, 3, 3]); }, C.metalD, C.metalD, C.metal);
    img.shin = c; }
  const rigDef = {
    cell: CELL, scale: 0.15, cloak: false,
    parts: {
      head: { pivot: [64, 104] },
      torso: { pivot: [64, 90], joints: { neck: [64, 34], shoulderN: [66, 42], shoulderF: [60, 42], cape: [52, 36] } },
      hips: { pivot: [64, 56], joints: { waist: [64, 43], hipN: [67, 64], hipF: [60, 64] } },
      upperArm: { pivot: [64, 22], joints: { elbow: [64, 60] } },
      foreArm: { pivot: [64, 22], joints: { hand: [64, 58] } },
      thigh: { pivot: [64, 24], joints: { knee: [64, 64] } },
      shin: { pivot: [64, 22], joints: { sole: [66, 80] } },
    },
  };
  return { img, rigDef, C };
}

// 무기 임시 그림: 칸 64×160, 손잡이가 위 (grip), 아래로 뻗음
export function placeholderWeapon(kind, C) {
  const c = cv(64, 160), x = c.getContext('2d');
  if (kind === 'gun') {
    // 총: 손잡이를 쥐고 총구가 아래(= 팔 방향)로
    blob(x, rr(x, 26, 10, 12, 26, 3), C.metalD, C.metalD, C.metal);
    blob(x, rr(x, 22, 26, 22, 64, 4), C.metalD, '#2a2c36', C.metalL);
    blob(x, rr(x, 26, 86, 12, 10, 2), '#20222a', '#20222a', C.metal);
    return { img: c, def: { src: null, cell: [64, 160], grip: [32, 18], tip: [32, 96] } };
  }
  blob(x, rr(x, 28, 6, 8, 26, 3), C.clothD, C.clothD, C.accent);
  blob(x, rr(x, 20, 30, 24, 6, 2), C.metalD, C.metalD, C.metal);
  blob(x, () => { x.beginPath(); x.moveTo(28, 36); x.lineTo(38, 36); x.lineTo(36, 132); x.lineTo(30, 150); x.lineTo(27, 132); x.closePath(); }, C.metal, C.metalD, C.metalL);
  return { img: c, def: { src: null, cell: [64, 160], grip: [32, 18], tip: [31, 150] } };
}
