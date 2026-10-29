// 전투 공간 전용 조명: 환경색을 곱하고 빛을 더한 뒤 원래 실루엣 알파로 다시 자른다.
// 배경은 별도 셰이더에서 음영 처리한다. 빛 감쇠는 게임 픽셀 격자에서 부드럽게 계산한다.
// 빛나는 이펙트 자체는 이 패스 뒤에 그려 조명을 안 받음 (fx.js drawFxGlow)
// 빛: { x, y, r, col: [r,g,b] (가운데 색), k: 0~1 세기, glow: 0~1 더하기 번짐(선택) }
const sprites = new Map();
let buf = null, bctx = null, source = null;

// 빛 원 하나 (r 반지름, 색), 결과는 캐시해 매 프레임 재사용
function lightSprite(r, col) {
  r = Math.max(4, Math.round(r / 2) * 2);
  const key = r + '|' + col.join(',');
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement('canvas'); c.width = c.height = r * 2;
  const x = c.getContext('2d'), d = x.createImageData(r * 2, r * 2), u = d.data;
  for (let yy = 0; yy < r * 2; yy++) for (let xx = 0; xx < r * 2; xx++) {
    const dd = Math.hypot(xx - r + 0.5, yy - r + 0.5) / r;
    // 게임 픽셀 격자 위에서 완만한 감쇠. 고리 모양 조명 경계가 배경보다 튀지 않게 한다.
    const t = Math.max(0, 1 - dd), k = t * t * (3 - 2 * t);
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
  if (!buf || buf.width !== W || buf.height !== H) {
    buf = document.createElement('canvas'); buf.width = W; buf.height = H; bctx = buf.getContext('2d');
    source = document.createElement('canvas'); source.width = W; source.height = H;
  }
  const original = source.getContext('2d');
  original.clearRect(0, 0, W, H); original.drawImage(ctx.canvas, 0, 0);
  bctx.globalCompositeOperation = 'source-over';
  bctx.fillStyle = `rgb(${ambient[0]},${ambient[1]},${ambient[2]})`;
  bctx.fillRect(0, 0, W, H);
  bctx.globalCompositeOperation = 'lighter';
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
  // multiply는 빈 픽셀까지 불투명하게 채운다. 원래 전투 공간 알파로 잘라 후경을 보존한다.
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(source, 0, 0);
  ctx.restore();
}
