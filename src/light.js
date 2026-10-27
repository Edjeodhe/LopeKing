// 조명 패스: 화면 전체를 어두운 환경색으로 곱하고(multiply), 빛 자리만 띠로 끊은 도트 원으로 밝힌다.
// 반투명 그라데이션은 쓰지 않는다 — 빛 원은 3~4단 띠 + 경계 체크무늬라 픽셀 결이 그대로 남음.
// 빛: { x, y, r, col: [r,g,b] (가운데 색), k: 0~1 세기, glow: 0~1 더하기 번짐(선택) }
const sprites = new Map();
let buf = null, bctx = null;

// 빛 원 하나 (r 반지름, 색) — 바깥부터 띠: 환경 → 1단 → 2단 → 가운데
function lightSprite(r, col) {
  r = Math.max(4, Math.round(r / 2) * 2);
  const key = r + '|' + col.join(',');
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement('canvas'); c.width = c.height = r * 2;
  const x = c.getContext('2d'), d = x.createImageData(r * 2, r * 2), u = d.data;
  const bands = [[1.0, 0.3], [0.78, 0.6], [0.52, 0.85], [0.28, 1]];   // [반지름 비율, 세기]
  for (let yy = 0; yy < r * 2; yy++) for (let xx = 0; xx < r * 2; xx++) {
    const dd = Math.hypot(xx - r + 0.5, yy - r + 0.5) / r;
    let k = 0;
    for (const [rr, kk] of bands) {
      if (dd <= rr) k = kk;
      else if (dd <= rr + 0.05 && (xx + yy) & 1) k = Math.max(k, kk * 0.8);   // 띠 경계 체크무늬
    }
    if (!k) continue;
    const i = (yy * r * 2 + xx) * 4;
    u[i] = col[0] * k; u[i + 1] = col[1] * k; u[i + 2] = col[2] * k; u[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  sprites.set(key, c);
  if (sprites.size > 200) sprites.delete(sprites.keys().next().value);
  return c;
}

// ambient = 환경색(어두울수록 밤이 깊음). lights 는 월드 좌표, cam 으로 화면 좌표로
export function applyLight(ctx, W, H, cam, ambient, lights) {
  if (!buf) { buf = document.createElement('canvas'); buf.width = W; buf.height = H; bctx = buf.getContext('2d'); }
  bctx.globalCompositeOperation = 'source-over';
  bctx.fillStyle = `rgb(${ambient[0]},${ambient[1]},${ambient[2]})`;
  bctx.fillRect(0, 0, W, H);
  bctx.globalCompositeOperation = 'lighten';
  for (const l of lights) {
    const sx = Math.round(l.x - cam.x), sy = Math.round(l.y - cam.y), r = l.r;
    if (sx + r < 0 || sy + r < 0 || sx - r > W || sy - r > H) continue;
    const col = l.col.map(v => Math.min(255, v * (l.k ?? 1)));
    const s = lightSprite(r, col);
    bctx.drawImage(s, sx - s.width / 2, sy - s.height / 2);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(buf, 0, 0);
  // 빛 번짐: glow 가 있는 빛(등불·섬광)은 더하기로 한 겹 더 — 빛 자리 색이 실제로 달아오름
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (!l.glow) continue;
    const sx = Math.round(l.x - cam.x), sy = Math.round(l.y - cam.y), r = Math.round(l.r * 0.6);
    if (sx + r < 0 || sy + r < 0 || sx - r > W || sy - r > H) continue;
    const s = lightSprite(r, l.col.map(v => v * l.glow));
    ctx.drawImage(s, sx - s.width / 2, sy - s.height / 2);
  }
  ctx.restore();
}
