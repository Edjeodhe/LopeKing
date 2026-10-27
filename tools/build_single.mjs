// 단일 HTML 뽑기 (node tools/build_single.mjs [출력 경로]) → 기본 out/lopeking.html
// 서버 없이 파일 하나로 열리게: src/*.js 모듈은 importmap 으로 data: URL 에 넣고(상대 import 를 'lk/x.js' 로 바꿈),
// 그림·레벨·글꼴은 window.__ASSETS 에 data: URL 로 넣은 뒤 fetch · Image.src 를 거기로 돌린다 (font.js 는 __ASSETS 를 직접 봄).
// 넣는 그림은 main.js 가 부르는 캐릭터(loadActorType)의 rig.json 이 가리키는 것 + 글꼴·이펙트 그림 + levels/*.json
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, extname } from 'node:path';

const out = process.argv[2] || 'out/lopeking.html';
const MIME = { '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.js': 'text/javascript' };
const dataUrl = (path, buf = readFileSync(path)) => `data:${MIME[extname(path)]};base64,${buf.toString('base64')}`;

// ---- 모듈: main.js 에서 import 를 따라가며 모음 ----
const mods = new Map();
const IMPORT = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])\.\/([\w-]+\.js)\2/g;
(function walk(name) {
  if (mods.has(name)) return;
  const src = readFileSync(`src/${name}`, 'utf8');
  const deps = [];
  mods.set(name, src.replace(IMPORT, (_, kw, q, dep) => { deps.push(dep); return `${kw}${q}lk/${dep}${q}`; }));
  deps.forEach(walk);
})('main.js');

// ---- 그림·데이터 ----
const assets = new Set(['art/fonts/neodgm.woff2', 'art/fx/fx_slash.png']);
for (const f of readdirSync('levels')) if (f.endsWith('.json')) assets.add(`levels/${f}`);
const PARTS = ['head', 'torso', 'hips', 'cape', 'upperArm', 'foreArm', 'thigh', 'shin'];
for (const [, dir] of mods.get('main.js').matchAll(/loadActorType\('([^']+)'/g)) {
  const rig = `${dir}/rig.json`;
  if (!existsSync(rig)) continue;   // 없으면 게임이 임시 그림으로 그림
  assets.add(rig);
  const def = JSON.parse(readFileSync(rig, 'utf8'));
  for (const n of PARTS) { const p = `${dir}/${def.parts?.[n]?.src || `parts/${n}.png`}`; if (existsSync(p)) assets.add(p); }
  if (def.weapon?.src) assets.add(`${dir}/${def.weapon.src}`);
  for (const f of def.death?.frames || []) assets.add(`${dir}/${f.src}`);
  for (const an of Object.values(def.anims || {})) for (const f of an.frames) assets.add(`${dir}/${f.src}`);   // 프레임 애니메이션(대기·달리기)
}
const assetMap = Object.fromEntries([...assets].map(p => [p, dataUrl(p)]));

// ---- 조립 ----
const imports = Object.fromEntries([...mods].map(([n, src]) => [`lk/${n}`, dataUrl(`${n}.js`, Buffer.from(src, 'utf8'))]));
const shim = `window.__ASSETS = ${JSON.stringify(assetMap)};
(() => {
  const A = window.__ASSETS, key = u => String(u).replace(/^(\\.\\/|\\/)/, '');
  const f0 = window.fetch.bind(window);
  window.fetch = (u, o) => A[key(u)] ? f0(A[key(u)]) : f0(u, o);
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...d, set(v) { d.set.call(this, A[key(v)] ?? v); } });
})();`;
const html = readFileSync('index.html', 'utf8').replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  () => `<script>${shim}</script>\n<script type="importmap">${JSON.stringify({ imports })}</script>\n<script type="module">import 'lk/main.js';</script>`);
if (html.includes('src="src/main.js"')) throw new Error('index.html 의 main.js 스크립트 태그를 못 찾음');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out, `${(html.length / 1048576).toFixed(1)}MB`, `모듈 ${mods.size}개 · 그림·데이터 ${assets.size}개`);
