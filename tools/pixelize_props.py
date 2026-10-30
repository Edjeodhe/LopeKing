# 로그라이크 물건 그림 (Codex 큰 그림 → 게임이 쓰는 1배 도트)
# art/props/<이름>.png (마젠타 바탕 도트 그림) → 덩어리마다 잘라 게임 크기로 줄임 → art/props/<이름>_px.png
# 줄이는 법: 그림 색을 32색 팔레트로 고르고, 작은 칸마다 '가장 많은 팔레트 색'을 고름 (평균을 내면 뭉개짐).
#   Codex 는 부탁한 격자 크기를 안 지키고 더 잘게 그려서(가면 1칸 ≈ 12px) 원래 격자로 되돌리는 게 아니라 원하는 크기로 줄임
#   chests_px: 4열(닫힘 → 열림) × 3줄(가면·골드·아이템), 칸 아래 가운데 = 상자 바닥 가운데 (몸통 기준으로 맞춤)
#   masks_px: 1줄 4칸 (dokkaebi·fire·water·moon), 칸 가운데 = 아이콘 가운데 · masks16_px: 같은 것 16px (스킬 칸용)
#   items_px: 1줄 14칸 (run.js ITEMS 순서)
#   gate_px: 1줄 2칸 (닫힘·열림, 아래 가운데) · stall_px: 좌판 1장
# 사용: python tools/pixelize_props.py [이름 ...]   크게 본 확인 그림: out/props_preview_<이름>.png
import sys, os
import numpy as np
from PIL import Image

D = 'art/props'
MAG = np.array([255, 0, 255])
# 이름: (게임 크기 px, 기준) — 'h' 높이 · 'max' 긴 변 · 'w0'/'h0' 모든 장을 첫 장 너비/높이 기준 같은 배율로
# 문은 34px 간격으로 둘 서니 32px 너비 안, 상자도 문과 안 겹치게 32px (main.js: 상자 = 끝자리 -30, 문 = 끝자리 · +34)
# masks16 = 스킬 칸(32px)에 2배로 그릴 작은 가면 (main.js drawSkillSlot 이 maskGlyph 를 2배로 부름)
SIZE = {'chests': (32, 'w0'), 'masks': (20, 'h'), 'masks16': (16, 'h'), 'items': (18, 'max'), 'gate': (52, 'h0')}
STALL_W = 28
# 장마다 팔레트 (색 수, 드문 색 가중): 작은 아이콘은 색이 섞이면 눈·테두리가 사라짐. 가면은 드문 색(눈빛)을 더 쳐줌
# 상자·문은 장끼리 색이 같아야(애니메이션이 번쩍이지 않게) 한 팔레트
OWN_PAL = {'masks': (10, 0.35), 'masks16': (10, 0.35), 'items': (16, 0)}
SRC = {'masks': 'masks2', 'masks16': 'masks2'}   # 가면은 두 번째 그림(크게·단순하게 다시 뽑음)을 씀 — 첫 그림(masks.png)은 20px 에서 눈이 사라짐

def load(n):
    a = np.array(Image.open(f'{D}/{SRC.get(n, n)}.png').convert('RGB')).astype(int)
    bg = (np.abs(a - MAG).sum(2) < 150) | ((a[:, :, 0] > 170) & (a[:, :, 2] > 170) & (a[:, :, 1] < 90))
    return a, ~bg

def bands(m, axis, gap):
    """m 을 axis 방향으로 투영해 빈 띠(gap 이상)로 나눈 [시작, 끝) 목록"""
    on = m.any(axis=axis)
    out, s, empty = [], None, 0
    for i, v in enumerate(on):
        if v:
            if s is None: s = i
            empty = 0; e = i + 1
        elif s is not None:
            empty += 1
            if empty >= gap: out.append((s, e)); s = None
    if s is not None: out.append((s, e))
    return out

def pieces(m, gap=24):
    """줄 → 칸 순서로 덩어리 bbox (y0, y1, x0, x1). 작은 부스러기(반짝이 등)는 버림"""
    res = []
    for y0, y1 in bands(m, 1, gap):
        row = []
        for x0, x1 in bands(m[y0:y1], 0, gap):
            sub = m[y0:y1, x0:x1]
            if sub.sum() < 3000: continue
            ys = np.where(sub.any(1))[0]
            row.append((y0 + ys[0], y0 + ys[-1] + 1, x0, x1))
        if row: res.append(row)
    return res

def palette(a, m, n=32):
    px = a[m].astype(np.uint8).reshape(-1, 1, 3)
    q = Image.fromarray(px).quantize(n, method=Image.Quantize.MEDIANCUT, kmeans=4)
    return np.array(q.getpalette()[:n * 3]).reshape(n, 3)

def shrink(a, m, box, scale, pal, rare=0):
    """bbox 를 scale 배로: 칸마다 가장 많은 팔레트 색 (rare > 0 이면 그림에 드문 색일수록 더 쳐줌), 칸의 절반 넘게 바탕이면 투명"""
    y0, y1, x0, x1 = box
    sa, sm = a[y0:y1, x0:x1], m[y0:y1, x0:x1]
    idx = np.zeros(sm.shape, int)
    for r in range(0, sm.shape[0], 64):   # 메모리 아끼려고 나눠서
        idx[r:r + 64] = ((sa[r:r + 64, :, None, :] - pal[None, None]) ** 2).sum(-1).argmin(-1)
    f = np.bincount(idx[sm], minlength=len(pal)).astype(float)
    wt = (f.sum() / np.maximum(f, 1)) ** rare
    h, w = max(1, round(sm.shape[0] * scale)), max(1, round(sm.shape[1] * scale))
    ey, ex = np.linspace(0, sm.shape[0], h + 1).astype(int), np.linspace(0, sm.shape[1], w + 1).astype(int)
    out = np.zeros((h, w, 4), np.uint8)
    for j in range(h):
        for i in range(w):
            mm = sm[ey[j]:ey[j + 1], ex[i]:ex[i + 1]]
            if mm.mean() < 0.5: continue
            k = (np.bincount(idx[ey[j]:ey[j + 1], ex[i]:ex[i + 1]][mm], minlength=len(pal)) * wt).argmax()
            out[j, i, :3] = pal[k]; out[j, i, 3] = 255
    return out

def body_cx(s):
    """아래 6줄(몸통)의 가로 가운데"""
    xs = np.where((s[-6:, :, 3] > 0).any(0))[0]
    return (xs[0] + xs[-1] + 1) / 2

def sheet(sprites, cw, ch, anchor):
    """같은 크기 칸에 늘어놓기. anchor = 'center' | 'bottom' (아래 가운데) | 'body' (아래 몸통 가운데)"""
    out = np.zeros((ch * len(sprites), cw * len(sprites[0]), 4), np.uint8)
    for r, row in enumerate(sprites):
        for c, s in enumerate(row):
            h, w = s.shape[:2]
            if anchor == 'center': ox, oy = (cw - w) // 2, (ch - h) // 2
            else: ox, oy = int(round(cw / 2 - (body_cx(s) if anchor == 'body' else w / 2))), ch - h
            ox = max(0, min(cw - w, ox))
            out[r * ch + oy:r * ch + oy + h, c * cw + ox:c * cw + ox + w] = s
    return out

def preview(n, arr, k=6):
    os.makedirs('out', exist_ok=True)
    im = Image.fromarray(arr, 'RGBA')
    bg = Image.new('RGBA', im.size, (40, 34, 52, 255)); bg.alpha_composite(im)
    bg.resize((im.width * k, im.height * k), Image.NEAREST).save(f'out/props_preview_{n}.png')

def run(n):
    a, m = load(n)
    P = pieces(m)
    flat = [b for row in P for b in row]
    pal = palette(a, m)
    size, how = SIZE[n]
    own = lambda b: palette(a[b[0]:b[1], b[2]:b[3]], m[b[0]:b[1], b[2]:b[3]], OWN_PAL[n][0])
    if how == 'w0': sc = [size / (flat[0][3] - flat[0][2])] * len(flat)
    elif how == 'h0': sc = [size / (flat[0][1] - flat[0][0])] * len(flat)
    elif how == 'h': sc = [size / (b[1] - b[0]) for b in flat]
    else: sc = [size / max(b[1] - b[0], b[3] - b[2]) for b in flat]
    if n == 'gate': sc[2] = STALL_W / (flat[2][3] - flat[2][2])
    spr = [shrink(a, m, b, s, own(b), OWN_PAL[n][1]) if n in OWN_PAL else shrink(a, m, b, s, pal) for b, s in zip(flat, sc)]
    print(n, [(s.shape[1], s.shape[0]) for s in spr])
    if n == 'chests':
        assert [len(r) for r in P] == [4, 4, 4], [len(r) for r in P]
        rows = [spr[0:4], spr[4:8], spr[8:12]]
        res = sheet(rows, max(s.shape[1] for s in spr) + 2, max(s.shape[0] for s in spr), 'body')
    elif n in ('masks', 'masks16', 'items'):
        assert len(spr) == (14 if n == 'items' else 4), len(spr)
        res = sheet([spr], max(s.shape[1] for s in spr), max(s.shape[0] for s in spr), 'center')
    elif n == 'gate':
        assert len(spr) == 3, len(spr)
        res = sheet([spr[:2]], max(s.shape[1] for s in spr[:2]), max(s.shape[0] for s in spr[:2]), 'bottom')
        Image.fromarray(spr[2], 'RGBA').save(f'{D}/stall_px.png'); preview('stall', spr[2])
    Image.fromarray(res, 'RGBA').save(f'{D}/{n}_px.png')
    preview(n, res)
    print(f'  → {D}/{n}_px.png {res.shape[1]}x{res.shape[0]}')

for n in sys.argv[1:] or list(SIZE):
    if os.path.exists(f'{D}/{SRC.get(n, n)}.png'): run(n)
    else: print(n, '그림 없음')
