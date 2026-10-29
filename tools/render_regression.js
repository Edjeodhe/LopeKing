// /tools/render_regression.html?level=0 : 실제 브라우저의 Canvas/WebGL로 렌더링 버그 검사.
import { applyLight } from '../src/light.js';
import { drawFxGlow, fx, moveTrail } from '../src/fx.js';
import { bakeBackdrop, BACKDROP_STYLE } from '../src/backdrop.js';
import { loadBackdrops, setTheme, makeBackground, drawBackground } from '../src/scenery.js';

const results = [], output = document.getElementById('results');
function check(ok, label, detail = '') {
  results.push({ ok: !!ok, label, detail });
  output.textContent = results.map(t => `${t.ok ? 'PASS' : 'FAIL'} ${t.label}${t.detail ? ': ' + t.detail : ''}`).join('\n');
  if (!ok) console.error('렌더링 회귀 검사 실패:', label, detail);
}
const surface = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const pixel = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];
const image = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const luma = p => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];

async function run() {
  // multiply/lighter가 투명 공간을 채우거나 불투명 배우의 알파를 낮추지 않아야 한다.
  const actor = surface(48, 48), a = actor.getContext('2d');
  a.fillStyle = '#ad6450'; a.fillRect(12, 8, 24, 32);
  applyLight(a, 48, 48, { x: 0, y: 0 }, [142, 137, 125], [{ x: 24, y: 20, r: 30, col: [255, 200, 165], glow: 0.2 }]);
  const litPixels = a.getImageData(0, 0, 48, 48).data;
  let wrongAlpha = 0;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    if (litPixels[(y * 48 + x) * 4 + 3] !== (x >= 12 && x < 36 && y >= 8 && y < 40 ? 255 : 0)) wrongAlpha++;
  }
  check(wrongAlpha === 0, '조명 패스가 배우·투명 공간 알파를 보존', `${wrongAlpha}개 오류`);
  const backgrounds = ['#f05020', '#2040f0'].map(col => {
    const c = surface(48, 48), x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 48, 48); x.drawImage(actor, 0, 0); return c;
  });
  check(pixel(backgrounds[0], 24, 20).join() === pixel(backgrounds[1], 24, 20).join(), '배우 내부로 후경 색이 비치지 않음');

  const gradient = surface(480, 270), g = gradient.getContext('2d');
  g.fillStyle = '#090807'; g.fillRect(0, 0, 240, 270); g.fillStyle = '#b8a793'; g.fillRect(240, 0, 240, 270);
  const renders = {};
  for (const layer of ['sky', 'far', 'mid']) {
    renders[layer] = bakeBackdrop(gradient, layer);
    const cpu = bakeBackdrop(gradient, layer, true);
    const w = renders[layer].img.width, h = renders[layer].img.height;
    check(w > 0 && h === BACKDROP_STYLE[layer].height && pixel(renders[layer].img, w / 2 | 0, h / 2 | 0)[3] === 255, `${layer} 셰이더 출력`, renders[layer].backend);
    const p = pixel(renders[layer].img, w * 0.75 | 0, h / 2 | 0), q = pixel(cpu.img, cpu.img.width * 0.75 | 0, cpu.img.height / 2 | 0);
    check(p.slice(0, 3).every((v, k) => Math.abs(v - q[k]) <= 5), `${layer} WebGL·Canvas 대체 경로 색 일치`, `${p.slice(0, 3)} / ${q.slice(0, 3)}`);
  }
  const contrast = c => Math.abs(luma(pixel(c, c.width * 0.75 | 0, c.height / 2 | 0)) - luma(pixel(c, c.width * 0.25 | 0, c.height / 2 | 0)));
  check(contrast(renders.far.img) < contrast(renders.mid.img), '먼 층의 대비가 가까운 폐허보다 낮음', `${contrast(renders.far.img).toFixed(2)} < ${contrast(renders.mid.img).toFixed(2)}`);

  await loadBackdrops(); setTheme('ruin');
  const layers = makeBackground(480, 270);
  check(layers.length === 3 && layers.every((l, i) => i === 0 || layers[i - 1].depth < l.depth), '하늘 → 먼 산 → 폐허 정렬 및 깊이');
  const backdrop = surface(480, 270), bx = backdrop.getContext('2d');
  drawBackground(bx, layers, { x: 550, y: 250 }, 480, 270, 544, 2, 1 / 60);
  check(pixel(backdrop, 0, 0)[3] === 255 && pixel(backdrop, 479, 269)[3] === 255, '카메라 이동 뒤에도 하늘·하단이 비지 않음');
  for (const layer of ['far', 'mid']) {
    const baked = bakeBackdrop(await image(`art/bg/ruin_${layer}.png`), layer);
    check(pixel(baked.img, baked.img.width / 2 | 0, 0)[3] === 0, `${layer} 투명 상단 유지`);
    const x = baked.img.getContext('2d'), data = x.getImageData(0, 0, baked.img.width, baked.img.height).data;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) max = Math.max(max, luma(data.subarray(i, i + 3)));
    check(max < 75, `${layer} 후경 밝기 상한`, max.toFixed(1));
  }

  for (let n = 0; n < 200 && !window.__G?.player; n++) await new Promise(r => setTimeout(r, 50));
  const G = window.__G;
  if (!G?.player) throw new Error('게임 부팅 실패');
  G.mode = 'play'; G.stop = 1e6; G.msg = null;
  const p = G.player, game = document.getElementById('game');
  p.x = 120; p.y = G.level === 1 ? 640 : 448; p.vx = p.vy = 0; p.str = 0;
  // 일반 적·보스를 함께 배치해 실제 런타임 원화/리그를 검사한다.
  G.enemies.filter(e => e.kind !== 'boss').slice(0, 2).forEach((e, i) => { e.x = 260 + i * 95; e.y = p.y; e.facing = -1; });
  if (G.boss) { G.boss.x = 440; G.boss.y = p.y; G.boss.state = 'idle'; }
  G.cam.x = 0; G.cam.y = Math.max(0, p.y - 175);
  const snapshot = async label => {
    const c = surface(480, 270); c.getContext('2d').drawImage(game, 0, 0);
    const figure = document.createElement('figure'), caption = document.createElement('figcaption'); caption.textContent = label;
    figure.append(caption, c); document.getElementById('shots').append(figure);
    await new Promise(ok => c.toBlob(async blob => { await fetch('/shot?name=' + label, { method: 'POST', body: blob }); ok(); }));
  };
  G.advance(1 / 60); await snapshot(`render-level-${G.level + 1}`);
  // 피격 무적의 두 위상을 비교: 예전처럼 몸 전체가 사라지는 위상이 없어야 한다.
  p.hurtInv = 1; p.hurtT = 0;
  for (const t of [1, 1.1]) { G.time = t; G.advance(1 / 60); await snapshot(`render-invulnerable-${G.level}-${t}`); }
  check(G.enemies.every(e => e.low.bbox), '모든 일반 적·보스 리그/프레임이 빈 캔버스가 아님');
  const ghost = surface(480, 270), mask = surface(480, 270);
  mask.getContext('2d').fillRect(100, 50, 30, 80);
  fx.rings = []; fx.sprites = []; fx.arcs = []; fx.soft = []; fx.ghosts = []; fx.cuts = []; fx.trail = null;
  moveTrail(580, 340, 'dash', 1 / 60); moveTrail(650, 340, 'dash', 1 / 60);
  drawFxGlow(ghost.getContext('2d'), 0, { x: 500, y: 250 }, 480, 270, { img: mask, x: 0, y: 0 });
  check(pixel(ghost, 110, 90)[3] === 0, '이동한 카메라의 화면 좌표 이펙트 가림');
  check(pixel(ghost, 90, 90)[3] > 0, '가림 밖의 대시 흔적은 계속 표시');
  check(results.every(t => t.ok), '전체 검사 완료', `${results.length}개`);
  document.title = results.every(t => t.ok) ? 'PASS — LopeKing 렌더링 검사' : 'FAIL — LopeKing 렌더링 검사';
}
run().catch(e => { check(false, '검사 실행 예외', e.stack || e.message); document.title = 'FAIL — LopeKing 렌더링 검사'; });
