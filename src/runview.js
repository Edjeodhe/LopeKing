// 로그라이크 화면 그리기: 상자 · 문 · 바닥에 떨어진 가면·아이템 · 주막 좌판 · 정보 창 · HUD(골드·가면·아이템) · 가방 · 판 결과
// 상자·문·좌판·가면·아이템 = Codex 도트 그림 (art/props/*_px.png, tools/pixelize_props.py). 다 읽기 전·없으면 예전 코드 도트
// 나머지(골드·↑ 표시·창)는 코드로 그린 도트. 글씨는 16px 픽셀 글꼴만 (또렷하게)
import { font } from './font.js';
import { MASKS, ITEMS, GRADES, STAGE, TAGS, MAX_ITEMS, gradeOf, nameOf, priceOf, scrapOf, tagCounts } from './run.js';

const INK = '#0b0a14';
// 그림: 모듈을 읽을 때 바로 부름 (단일 HTML 은 build_single 이 Image.src 를 data: URL 로 돌림)
const ART = {};
for (const n of ['chests', 'masks', 'masks16', 'items', 'gate', 'stall']) { const im = new Image(); im.onload = () => { ART[n] = im; }; im.src = `art/props/${n}_px.png`; }
const MASK_COL = { dokkaebi: 0, fire: 1, water: 2, moon: 3 }, CHEST_ROW = { mask: 0, gold: 1, item: 2 };
const ITEM_COL = Object.fromEntries(Object.keys(ITEMS).map((k, i) => [k, i]));   // items_px 칸 = run.js ITEMS 순서
// 아이템 아이콘 + 등급 테두리 (희귀 이상, 등급 색 1px). 한 번 만들어 둠
const itemCache = {};
function itemArt(id) {
  if (itemCache[id]) return itemCache[id];
  const im = ART.items, s = im.height, g = ITEMS[id].g, c = document.createElement('canvas');
  c.width = c.height = s + 2;
  const x = c.getContext('2d'), sx = ITEM_COL[id] * s;
  if (g > 0) {
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(im, sx, 0, s, s, dx, dy, s, s);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = GRADES[g].col; x.fillRect(0, 0, s + 2, s + 2);
    x.globalCompositeOperation = 'source-over';
  }
  x.drawImage(im, sx, 0, s, s, 1, 1, s, s);
  return (itemCache[id] = c);
}
export function text(ctx, s, x, y, c = '#f2e8d0', align = 'left') {
  ctx.font = font(16); ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = INK; ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = c; ctx.fillText(s, x, y);
}
const box = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

// ---- 작은 그림 (아이콘) ----
// 가면 얼굴 (도깨비: 뿔 · 눈 · 송곳니). (x, y) = 가운데쯤 (그림은 20px 높이, 한 칸 위로)
function maskGlyph(ctx, x, y, id) {
  const im = ctx.getTransform().a >= 2 ? ART.masks16 || ART.masks : ART.masks;   // 2배로 그릴 땐(스킬 칸 32px) 16px 판
  if (im) { const w = im.width / 4, h = im.height; ctx.drawImage(im, MASK_COL[id] * w, 0, w, h, Math.round(x - w / 2), Math.round(y - 1 - h / 2), w, h); return; }
  const m = MASKS[id], base = { dokkaebi: '#b02028', fire: '#2a2220', water: '#1e7a80', moon: '#e8e4f0' }[id], eye = m.fx;
  box(ctx, x - 5, y - 4, 11, 10, INK);
  box(ctx, x - 4, y - 3, 9, 8, base);
  if (id === 'fire') { box(ctx, x - 1, y - 7, 3, 4, '#3a302a'); box(ctx, x, y - 8, 1, 1, '#ff8a3a'); box(ctx, x - 3, y, 1, 3, '#ff8a3a'); }
  else if (id === 'water') { box(ctx, x - 4, y - 6, 2, 3, '#5af0ff'); box(ctx, x + 3, y - 6, 2, 3, '#5af0ff'); }
  else if (id === 'moon') { box(ctx, x - 4, y - 5, 2, 2, '#c0c0d0'); box(ctx, x + 3, y - 5, 2, 2, '#c0c0d0'); box(ctx, x, y - 2, 1, 1, '#c79bff'); }
  else { box(ctx, x - 4, y - 6, 2, 3, '#e0d0b0'); box(ctx, x + 3, y - 6, 2, 3, '#e0d0b0'); }
  box(ctx, x - 3, y - 1, 2, 1, eye); box(ctx, x + 2, y - 1, 2, 1, eye);
  box(ctx, x - 2, y + 3, 5, 1, INK); box(ctx, x - 2, y + 3, 1, 1, '#f0c060'); box(ctx, x + 2, y + 3, 1, 1, '#f0c060');
}
// 아이템: 그림 18px + 등급 테두리 (x, y = 가운데). 그림이 없으면 등급 색 구슬 + 각인 색 점
function itemGlyph(ctx, x, y, id) {
  if (ART.items) { const c = itemArt(id); ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); return; }
  const it = ITEMS[id], c = GRADES[it.g].col;
  box(ctx, x - 4, y - 4, 9, 9, INK);
  box(ctx, x - 3, y - 3, 7, 7, '#2a2438'); box(ctx, x - 2, y - 2, 5, 5, c); box(ctx, x - 1, y - 2, 2, 1, '#ffffff');
  it.tags.forEach((t, i) => box(ctx, x - 3 + i * 5, y + 3, 2, 2, TAGS[t].col));
}
function coinGlyph(ctx, x, y) { box(ctx, x - 3, y - 3, 7, 7, INK); box(ctx, x - 2, y - 2, 5, 5, '#f0c060'); box(ctx, x, y - 1, 1, 3, '#8a5a20'); box(ctx, x - 1, y - 2, 1, 1, '#fff0b0'); }
function stageGlyph(ctx, x, y, kind, t) {
  if (kind === 'mask') maskGlyph(ctx, x, y, 'dokkaebi');
  else if (kind === 'gold') { coinGlyph(ctx, x - 3, y + 1); coinGlyph(ctx, x + 3, y - 1); }
  else if (kind === 'item') { box(ctx, x - 4, y - 4, 9, 9, INK); box(ctx, x - 3, y - 3, 7, 7, '#5ab0ff'); box(ctx, x - 1, y - 3, 1, 7, '#c8e8ff'); if (Math.floor(t * 4) % 2) box(ctx, x + 4, y - 6, 1, 1, '#ffffff'); }
  else if (kind === 'rest') { box(ctx, x - 4, y - 2, 9, 6, INK); box(ctx, x - 3, y - 1, 7, 4, '#c08a3a'); box(ctx, x - 1, y - 5 + Math.round(Math.sin(t * 3)), 1, 2, '#e0e0e0'); box(ctx, x + 2, y - 6 + Math.round(Math.sin(t * 3 + 1)), 1, 2, '#e0e0e0'); }
  else if (kind === 'boss') { box(ctx, x - 4, y - 4, 9, 8, INK); box(ctx, x - 3, y - 3, 7, 6, '#e8e0d0'); box(ctx, x - 2, y - 1, 2, 2, INK); box(ctx, x + 1, y - 1, 2, 2, INK); box(ctx, x - 1, y + 2, 3, 2, '#e8e0d0'); }
}

// ---- 월드 안 ----
// 상자: 흑칠 반닫이 + 금 장식, 보상 종류 색 띠·자물쇠 문양 (가면 = 초록 도깨비 · 골드 = 엽전 · 아이템 = 파란 마름모)
// open = 연 뒤 지난 초 (0 = 닫힘·잠김). 그림 4장: 닫힘 → 자물쇠 풀림 → 반쯤 → 활짝, 0.08초씩. appear = 땅에서 솟는 정도(0~1)
export function drawChest(ctx, c, t) {
  const x = Math.round(c.x), y = Math.round(c.y), col = STAGE[c.kind].col;
  if (c.appear <= 0) return;
  const im = ART.chests;
  if (im) {
    const w = im.width / 4, h = im.height / 3, f = c.open > 0 ? Math.min(3, 1 + Math.floor(c.open / 0.08)) : 0;
    const rise = Math.round((1 - Math.min(1, c.appear)) * h);
    ctx.save(); ctx.beginPath(); ctx.rect(x - w, y - h - 8, w * 2, h + 8); ctx.clip();   // 땅 위만 (땅에서 솟음)
    ctx.drawImage(im, f * w, CHEST_ROW[c.kind] * h, w, h, x - w / 2, y - h + rise, w, h);
    ctx.restore();
    if (c.open > 0 && c.open < 0.6) {   // 열리는 순간 상자 안에서 솟는 빛 기둥 (더하기, 위로 갈수록 가늘게)
      const a = 1 - c.open / 0.6, top = Math.round(14 + 26 * Math.min(1, c.open / 0.15));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * a; box(ctx, x - 6, y - top, 13, top - 14, col);
      ctx.globalAlpha = 0.5 * a; box(ctx, x - 2, y - top - 8, 5, top - 6, col);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (!c.open && c.appear >= 1 && Math.floor(t * 3) % 3 === 0) box(ctx, x + w / 2 - 4, y - h + 6, 1, 1, '#ffffff');   // 닫힌 상자 반짝
    return;
  }
  const rise = c.appear < 1 ? Math.round((1 - c.appear) * 6) : 0;
  const lid = Math.round(Math.min(1, c.open) * 6);
  box(ctx, x - 10, y - 11 + rise, 21, 11, INK);
  box(ctx, x - 9, y - 10 + rise, 19, 9, '#2a1c16'); box(ctx, x - 9, y - 10 + rise, 19, 1, '#4a3226');
  box(ctx, x - 9, y - 6 + rise, 19, 1, '#c08a3a'); box(ctx, x - 1, y - 8 + rise, 3, 4, '#f0c060');
  box(ctx, x - 9, y - 3 + rise, 19, 1, col);
  // 뚜껑
  box(ctx, x - 10, y - 16 - lid + rise, 21, 6, INK); box(ctx, x - 9, y - 15 - lid + rise, 19, 4, '#3a2820'); box(ctx, x - 9, y - 15 - lid + rise, 19, 1, '#c08a3a');
  if (c.open > 0 && c.open < 1.6) { ctx.globalAlpha = Math.max(0, 1 - c.open / 1.6); box(ctx, x - 7, y - 30 + rise, 15, 20, col); ctx.globalAlpha = 1; }
  if (!c.open && Math.floor(t * 3) % 2) box(ctx, x + 8, y - 18 + rise, 1, 1, '#ffffff');
}
// 문: 홍살문 비슷한 나무 문. 방을 깨기 전엔 창살로 닫힘. 위에 다음 방 종류 표시
// 그림(gate_px: 닫힘·열림, 32×52)이 있으면 그 위에 열린 문 안 기운 + 위에 뜬 방 종류 표시
export function drawDoor(ctx, d, t, open) {
  const x = Math.round(d.x), y = Math.round(d.y), col = STAGE[d.kind].col;
  const im = ART.gate;
  if (im) {
    const w = im.width / 2, h = im.height;
    ctx.drawImage(im, open ? w : 0, 0, w, h, x - w / 2, y - h, w, h);
    if (open) {
      for (let i = 0; i < 6; i++) {   // 안쪽에 종류 색 기운이 일렁임 (문 안 = 가운데 20px, 아래 38px)
        const yy = y - 4 - ((t * 18 + i * 6) % 32), ww = 4 + ((i * 5) % 9);
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 4 + i); box(ctx, x - ww / 2, yy, ww, 2, col);
      }
      ctx.globalAlpha = 0.5; box(ctx, x - 3, y - h + 3, 6, 4, col); ctx.globalAlpha = 1;   // 현판에 종류 색
    }
    stageGlyph(ctx, x, y - h - 10 + Math.round(Math.sin(t * 2 + x) * 1), d.kind, t);
    return;
  }
  box(ctx, x - 13, y - 40, 27, 40, INK);
  box(ctx, x - 11, y - 36, 23, 36, open ? '#120e18' : '#1a1820');
  if (open) {
    // 안쪽에 종류 색 기운이 일렁임
    for (let i = 0; i < 6; i++) {
      const yy = y - 4 - ((t * 18 + i * 6) % 32), w = 4 + ((i * 5) % 9);
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 4 + i); box(ctx, x - w / 2, yy, w, 2, col);
    }
    ctx.globalAlpha = 1;
  } else for (let i = -9; i <= 9; i += 4) box(ctx, x + i, y - 36, 1, 36, '#4a4458');
  box(ctx, x - 13, y - 40, 2, 40, '#7a2a24'); box(ctx, x + 12, y - 40, 2, 40, '#7a2a24');   // 붉은 기둥
  box(ctx, x - 15, y - 43, 31, 3, '#7a2a24'); box(ctx, x - 15, y - 43, 31, 1, '#a84a3a');
  box(ctx, x - 8, y - 56, 17, 13, INK); box(ctx, x - 7, y - 55, 15, 11, open ? '#2a2438' : '#16141e');
  stageGlyph(ctx, x, y - 50, d.kind, t);
}
// 바닥에 떨어진 가면·아이템: 둥실 + 등급 빛 기둥
export function drawPickup(ctx, o, t) {
  const g = gradeOf(o.obj), col = GRADES[g].col, x = Math.round(o.x), bob = Math.round(Math.sin(t * 3 + o.x) * 1.5), y = Math.round(o.y) - 10 + bob;
  ctx.globalAlpha = 0.18; box(ctx, x - 1, y - 18, 3, 26 - bob, col); ctx.globalAlpha = 1;
  if (o.obj.type === 'mask') maskGlyph(ctx, x, y, o.obj.id); else itemGlyph(ctx, x, y, o.obj.id);
  if (o.scrap > 0) { box(ctx, x - 8, y + 10, 17, 3, INK); box(ctx, x - 7, y + 11, Math.round(15 * o.scrap), 1, '#f0c060'); }
}
// 주막 좌판: 낮은 상 + 물건 + 값
export function drawShop(ctx, s, t) {
  const x = Math.round(s.x), y = Math.round(s.y), im = ART.stall;
  if (im) ctx.drawImage(im, x - Math.floor(im.width / 2), y - im.height);   // Codex 좌판 (붉은 천 덮은 소반)
  else { box(ctx, x - 11, y - 9, 23, 9, INK); box(ctx, x - 10, y - 8, 21, 3, '#5a3a26'); box(ctx, x - 9, y - 5, 2, 5, '#3a2618'); box(ctx, x + 8, y - 5, 2, 5, '#3a2618'); }
  if (s.sold) return;
  const top = im ? im.height + 10 : 16, o = s.obj, oy = y - top + Math.round(Math.sin(t * 2.5 + x) * 1);
  if (o.type === 'mask') maskGlyph(ctx, x, oy, o.id);
  else if (o.type === 'item') itemGlyph(ctx, x, oy, o.id);
  else { box(ctx, x - 5, oy - 1, 11, 6, INK); box(ctx, x - 4, oy, 9, 4, '#e8e0d0'); box(ctx, x - 3, oy, 7, 2, '#c05a3a'); box(ctx, x - 1, oy - 4 + Math.round(Math.sin(t * 3)), 1, 2, '#e0e0e0'); }
  text(ctx, String(priceOf(o)), x, oy - 22, '#f0c060', 'center');
}
// 날아오는 골드 (상자·적에서 튀어나와 주인공에게 빨려 듦)
export function drawCoins(ctx, coins) { for (const c of coins) coinGlyph(ctx, Math.round(c.x), Math.round(c.y)); }
// 손 닿는 것 위에 ↑ 표시
export function drawPrompt(ctx, x, y, t) { const b = Math.round(Math.sin(t * 6)); box(ctx, x - 4, y - 7 + b, 9, 9, INK); box(ctx, x - 3, y - 6 + b, 7, 7, '#f2e8d0'); box(ctx, x, y - 5 + b, 1, 5, INK); box(ctx, x - 1, y - 4 + b, 3, 1, INK); box(ctx, x - 2, y - 3 + b, 5, 1, INK); }

// ---- 화면 (HUD) ----
// 정보 창: 손 닿는 가면·아이템·좌판·문. 화면 위 가운데 (방 이름 아래 — 아래쪽은 땅·상자를 가림)
export function drawInfo(ctx, W, H, info) {
  // 오른쪽 위, 글 길이만큼 (왼쪽 위는 HUD — 아이템 칸 줄 오른쪽 끝 HUD_R 과 겹치면 그 아래로)
  ctx.font = font(16);
  const lines = info.lines, w = Math.max(160, ...lines.map(([s]) => Math.ceil(ctx.measureText(s).width) + 16));
  const h = 10 + lines.length * 17, x = W - w - 10, y = x < HUD_R ? 104 : 44;
  box(ctx, x - 2, y - 2, w + 4, h + 4, INK); box(ctx, x, y, w, h, '#0e0c16'); box(ctx, x, y, w, 1, '#c08a3a'); box(ctx, x, y + h - 1, w, 1, '#c08a3a');
  lines.forEach(([s, c], i) => text(ctx, s, x + 8, y + 5 + i * 17, c || '#e8e0f0'));
}
export function infoFor(o, run, kind) {
  const L = [];
  if (kind === 'door') { L.push([`${STAGE[o.kind].name} 방으로`, STAGE[o.kind].col]); L.push(['↑ 들어가기', '#8a86a0']); return { lines: L }; }
  if (kind === 'chest') { L.push([`${STAGE[o.kind].name} 상자`, STAGE[o.kind].col]); L.push(['↑ 열기', '#8a86a0']); return { lines: L }; }
  const obj = o.obj;
  if (obj.type === 'heal') { L.push([obj.name, '#ff9ab0']); L.push([obj.desc]); }
  else {
    const g = GRADES[gradeOf(obj)];
    if (obj.type === 'mask') { const m = MASKS[obj.id]; L.push([`${m.name} · ${m.kind}  [${g.name}]`, g.col]); m.desc.forEach(d => L.push([d])); if (g.dmg) L.push([`피해 +${Math.round(g.dmg * 100)}%`, '#c9c1d4']); }
    else { const it = ITEMS[obj.id]; L.push([`${it.name}  [${g.name}]`, g.col]); L.push([it.desc]); L.push(['각인: ' + it.tags.join(' · '), TAGS[it.tags[0]].col]); }
  }
  if (kind === 'shop') L.push([`↑ 사기 (${priceOf(obj)} 골드, 가진 것 ${run.gold})`, run.gold >= priceOf(obj) ? '#f0c060' : '#8a5a5a']);
  else L.push([`↑ ${obj.type === 'mask' ? '쓰기' : '줍기'} · X 꾹 분해 (+${scrapOf(obj)} 골드)`, '#8a86a0']);
  return { lines: L };
}
// 골드 · 지금 가면 · 아이템 칸 (체력·스킬 칸 아래). 칸 MAX_ITEMS 개 — 빈 칸도 보여서 몇 개 더 들어가는지 보임.
// 방금 들어온 칸은 1.2초 동안 깜빡임 (run.got = { i, t })
export function drawRunHud(ctx, run, y0, t = 0) {
  coinGlyph(ctx, 12, y0 + 6); text(ctx, String(run.gold), 20, y0 - 2, '#f0c060');
  const m = MASKS[run.mask.id];
  text(ctx, m.name, 60, y0 - 2, GRADES[run.mask.g].col);
  for (let i = 0; i < MAX_ITEMS; i++) {
    const x = 6 + i * 23, y = y0 + 15, id = run.items[i];   // 칸 22px (아이템 그림 20px)
    slotBox(ctx, x, y, 22, id, newGlow(run, i, t));
    if (id) itemGlyph(ctx, x + 11, y + 11, id);
  }
  text(ctx, 'I', 6 + MAX_ITEMS * 23 + 2, y0 + 18, '#8a86a0');
}
const HUD_R = 6 + MAX_ITEMS * 23 + 12;   // HUD 아이템 칸 줄 + 'I' 의 오른쪽 끝
const newGlow =(run, i, t) => run.got && run.got.i === i && t - run.got.t < 1.2 ? (Math.floor((t - run.got.t) * 8) % 2 ? 2 : 1) : 0;
// 아이템 칸: 검은 테 + 안쪽 바탕 + 등급 색 테 (빈 칸은 어둡게). glow 1·2 = 새로 들어옴 깜빡임 · sel = 가방에서 고른 칸
function slotBox(ctx, x, y, S, id, glow = 0, sel = false) {
  box(ctx, x, y, S, S, INK);
  box(ctx, x + 1, y + 1, S - 2, S - 2, id ? '#1c1828' : '#0e0c16');
  const c = sel ? '#f0c060' : glow === 2 ? '#ffffff' : id ? GRADES[ITEMS[id].g].col : '#2a2636';
  ctx.globalAlpha = id || sel || glow ? 1 : 0.8;
  box(ctx, x + 1, y + 1, S - 2, 1, c); box(ctx, x + 1, y + S - 2, S - 2, 1, c); box(ctx, x + 1, y + 1, 1, S - 2, c); box(ctx, x + S - 2, y + 1, 1, S - 2, c);
  if (sel) { box(ctx, x, y, S, 1, c); box(ctx, x, y + S - 1, S, 1, c); box(ctx, x, y, 1, S, c); box(ctx, x + S - 1, y, 1, S, c); }
  if (glow) { ctx.globalAlpha = glow === 2 ? 0.35 : 0.15; box(ctx, x + 2, y + 2, S - 4, S - 4, '#ffffff'); }
  ctx.globalAlpha = 1;
}
// 가방 (I): 왼쪽 아이템 칸 3×3 (방향키로 고름) · 오른쪽 고른 아이템 설명 · 아래 각인 효과
export const BAG_COLS = 3;
export function drawBag(ctx, W, H, run, sel = 0, t = 0) {
  ctx.fillStyle = '#05040a'; for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  const x0 = 14, y0 = 10, pw = W - 28, ph = H - 20;
  box(ctx, x0 - 2, y0 - 2, pw + 4, ph + 4, INK); box(ctx, x0, y0, pw, ph, '#0e0c16');
  box(ctx, x0, y0, pw, 1, '#c08a3a'); box(ctx, x0, y0 + ph - 1, pw, 1, '#c08a3a');
  text(ctx, '가방', W / 2, y0 + 6, '#f2e8d0', 'center');
  text(ctx, `${run.items.length}/${MAX_ITEMS}`, W / 2 + 22, y0 + 6, '#8a86a0');
  const m = MASKS[run.mask.id], g = GRADES[run.mask.g];
  maskGlyph(ctx, x0 + 18, y0 + 36, run.mask.id);
  text(ctx, `${m.name} · ${m.kind} [${g.name}]`, x0 + 30, y0 + 28, g.col);
  text(ctx, `골드 ${run.gold}`, x0 + pw - 10, y0 + 28, '#f0c060', 'right');
  // 칸 3×3: 아이콘 2배
  const S = 44, gap = 2, gx = x0 + 14, gy = y0 + 48;   // 칸 44px · 아이템 그림 2배(40px)
  for (let i = 0; i < MAX_ITEMS; i++) {
    const x = gx + (i % BAG_COLS) * (S + gap), y = gy + Math.floor(i / BAG_COLS) * (S + gap), id = run.items[i];
    slotBox(ctx, x, y, S, id, newGlow(run, i, t), i === sel);
    if (id) { ctx.save(); ctx.translate(x + S / 2, y + S / 2); ctx.scale(2, 2); itemGlyph(ctx, 0, 0, id); ctx.restore(); }
  }
  // 고른 칸 설명
  const dx = gx + BAG_COLS * (S + gap) + 14, id = run.items[sel];
  box(ctx, dx - 8, gy, 1, 3 * S + 2 * gap, '#2a2636');
  if (id) {
    const it = ITEMS[id], ig = GRADES[it.g];
    text(ctx, it.name, dx, gy + 2, ig.col);
    text(ctx, `[${ig.name}]`, dx, gy + 20, ig.col);
    text(ctx, it.desc, dx, gy + 42, '#e8e0f0');
    it.tags.forEach((tg, k) => { box(ctx, dx + k * 60, gy + 68, 5, 5, TAGS[tg].col); text(ctx, tg, dx + 8 + k * 60, gy + 62, TAGS[tg].col); });
    text(ctx, `분해하면 +${scrapOf({ type: 'item', id })} 골드`, dx, gy + 84, '#6a6680');
  } else text(ctx, run.items.length ? '빈 칸' : '상자에서 얻은 아이템이 여기 들어감', dx, gy + 2, '#6a6680');
  // 각인: 개수 / 다음 단계 — 한 줄에 안 들어가면 다음 줄 (켜진 각인 먼저)
  const n = tagCounts(run);
  let tx = x0 + 14, ty = y0 + ph - 58;
  const keys = Object.keys(n).sort((a, b) => (TAGS[b].at[0][0] <= n[b]) - (TAGS[a].at[0][0] <= n[a]));
  for (const tg of keys) {
    const on = TAGS[tg].at.filter(([c]) => n[tg] >= c).length, s = `${tg} ${n[tg]}` + (on ? ` ▸ ${TAGS[tg].txt[on - 1]}` : '');
    ctx.font = font(16); const w = ctx.measureText(s).width;
    if (tx + w > x0 + pw - 10) { tx = x0 + 14; ty += 17; }
    text(ctx, s, tx, ty, on ? TAGS[tg].col : '#6a6680');
    tx += w + 14;
  }
  text(ctx, 'I 닫기 · 방향키 고르기', x0 + 10, y0 + 6, '#8a86a0');
}
// 한 판 결과 (죽었을 때 · 보스를 깼을 때)
export function drawResult(ctx, W, H, run, win, t) {
  box(ctx, 0, 0, W, H, '#05040a');
  text(ctx, win ? '참수터를 넘었다' : '쓰러졌다', W / 2, 52, win ? '#f2e8d0' : '#d0303a', 'center');
  const L = [
    ['지나온 방', `${run.cleared}`], ['벤 적', `${run.kills}`], ['모은 골드', `${run.earned}`],
    ['마지막 가면', `${MASKS[run.mask.id].name} [${GRADES[run.mask.g].name}]`], ['아이템', `${run.items.length}개`],
  ];
  L.forEach(([a, b], i) => { text(ctx, a, W / 2 - 20, 92 + i * 18, '#8a86a0', 'right'); text(ctx, b, W / 2, 92 + i * 18, '#e8e0f0'); });
  if (Math.floor(t * 2) % 2) text(ctx, 'Space 로 다시', W / 2, 200, '#ffffff', 'center');
}
export { maskGlyph, nameOf };
