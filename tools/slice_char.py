"""Codex 그림(마젠타 배경) → 리그 부위 PNG + rig.json 관절 초안 + 사망 컷 + 비교용 통 이미지.

칸 격자로 자르지 않고 '덩어리'로 자른다: 그림이 칸을 넘어도(삿갓 챙) 안 잘리게, 덩어리 무게중심이 든 칸의 부위로.
부위 그림은 칸 + 둘레 여유(MARGIN)를 한 장으로 저장 → 좌표 = 그 칸 기준 px (rig.json 의 cell).

사용: python tools/slice_char.py art/<id> [--keep-joints]
  --keep-joints : rig.json 에 이미 있는 관절 값(리그 편집기에서 맞춘 것)은 건드리지 않고 그림만 다시 자름
출력: parts/<부위>.png · weapon_cut.png · death/death_<n>.png · full_side_key.png · rig.json · out/<id>_slice.png (확인용)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

MARGIN = 64
PARTS_GRID = (4, 2, ['head', 'torso', 'hips', 'cape', 'upperArm', 'foreArm', 'thigh', 'shin'])
DEATH_GRID = (2, 2, ['death_0', 'death_1', 'death_2', 'death_3'])
TARGET_H = 44          # 서 있는 키(게임 px) — 480×270 화면 기준 SD 캐릭터 (카타나 제로 주인공 비율쯤)
SIZE = {'head': 1.0}   # SD 비율 미세조정 (프로토 은둔자: 머리 1.18 · 다리 0.9). 편집기에서 바꿈


def key_magenta(path):
    """마젠타 배경 → 알파 (반쯤 섞인 테두리 색도 걷어 냄)"""
    a = np.array(Image.open(path).convert('RGB')).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (r > 170) & (b > 170) & (g < 110) & (np.abs(r - b) < 70)
    # 캐릭터 디자인에 마젠타는 쓰지 않으니 머리카락 사이에 갇힌 배경 조각까지 전부 지움
    keep = bg
    # 가장자리: 반쯤 섞인 마젠타 테두리까지 지움 (빨강·파랑이 초록보다 많이 높은 픽셀)
    fringe = ndimage.binary_dilation(keep, iterations=2) & ~keep & (r > g + 70) & (b > g + 70)
    keep |= fringe
    edge = ndimage.binary_dilation(keep, iterations=2) & ~keep
    out = a.copy()
    m = edge & (r > g + 40) & (b > g + 40)
    lo = np.minimum(r, b)
    out[..., 0] = np.where(m, np.clip(r - (lo - g) // 2, 0, 255), r)
    out[..., 2] = np.where(m, np.clip(b - (lo - g) // 2, 0, 255), b)
    alpha = np.where(keep, 0, 255).astype(np.uint8)
    rgba = np.dstack([out.astype(np.uint8), alpha])
    rgba[alpha == 0, :3] = 0
    return rgba


def components(rgba, min_px=60):
    fg = rgba[..., 3] > 0
    lab, n = ndimage.label(fg, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab)
    out = []
    for i, sl in enumerate(objs):
        m = lab[sl] == i + 1
        if m.sum() < min_px:
            continue
        ys, xs = np.nonzero(m)
        out.append({'id': i + 1, 'sl': sl, 'cx': xs.mean() + sl[1].start, 'cy': ys.mean() + sl[0].start, 'n': int(m.sum())})
    return lab, out


def slice_grid(rgba, cols, rows, names, margin):
    """덩어리를 무게중심이 든 칸에 모아 칸 + 여유 크기 그림으로"""
    H, W = rgba.shape[:2]
    cw, ch = W // cols, H // rows
    lab, comps = components(rgba)
    cells = {}
    for c in comps:
        ci = min(cols - 1, int(c['cx'] // cw)) + cols * min(rows - 1, int(c['cy'] // ch))
        cells.setdefault(ci, []).append(c['id'])
    out = {}
    for ci, name in enumerate(names):
        if name == '-' or ci not in cells:
            continue
        x0, y0 = (ci % cols) * cw - margin, (ci // cols) * ch - margin
        img = np.zeros((ch + margin * 2, cw + margin * 2, 4), np.uint8)
        m = np.isin(lab, cells[ci])
        ys, xs = np.nonzero(m)
        ok = (xs - x0 >= 0) & (xs - x0 < img.shape[1]) & (ys - y0 >= 0) & (ys - y0 < img.shape[0])
        img[ys[ok] - y0, xs[ok] - x0] = rgba[ys[ok], xs[ok]]
        out[name] = img
    return out, [cw + margin * 2, ch + margin * 2]


def bbox(img):
    ys, xs = np.nonzero(img[..., 3] > 0)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def row_center(img, y0, y1):
    """y0~y1 줄들의 불투명 픽셀 가로 가운데"""
    a = img[max(0, int(y0)):max(int(y0) + 1, int(y1)), :, 3] > 0
    xs = np.nonzero(a)[1]
    return float(xs.mean()) if len(xs) else img.shape[1] / 2


def auto_joints(name, img):
    """그림 모양에서 관절 초안. 정확한 값은 리그 편집기에서 통 이미지와 겹쳐 맞춘다"""
    x0, y0, x1, y1 = bbox(img)
    h = y1 - y0
    top = lambda f: y0 + h * f
    cx = lambda f, w=0.04: round(row_center(img, top(f) - h * w, top(f) + h * w), 1)
    r = lambda v: round(float(v), 1)
    if name == 'head':
        # 목 아래 끝 (가장 아래 줄 가운데)
        return {'pivot': [cx(0.96), r(top(0.97))]}
    if name == 'torso':
        return {'pivot': [cx(0.95), r(top(0.95))], 'joints': {
            'neck': [cx(0.06), r(top(0.08))],
            'shoulderN': [cx(0.2), r(top(0.2))], 'shoulderF': [cx(0.2) - 6, r(top(0.2))],
            'cape': [r(x0 + (x1 - x0) * 0.32), r(top(0.08))]}}
    if name == 'hips':
        hy = top(0.3)
        return {'pivot': [cx(0.3), r(hy)], 'joints': {
            'waist': [cx(0.05), r(top(0.06))], 'hipN': [cx(0.3) + 6, r(hy)], 'hipF': [cx(0.3) - 6, r(hy)]}}
    if name == 'cape':
        return {'pivot': [cx(0.03), r(top(0.03))]}
    end = {'upperArm': ('elbow', 0.9), 'foreArm': ('hand', 0.86), 'thigh': ('knee', 0.9), 'shin': ('sole', 1.0)}[name]
    jx = cx(0.62) if name == 'shin' else cx(end[1])   # 발바닥 = 발목 아래 (발끝이 아니라)
    return {'pivot': [cx(0.07), r(top(0.07))], 'joints': {end[0]: [jx, r(top(end[1]))]}}


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(img, 'RGBA').save(path, optimize=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    keep = '--keep-joints' in sys.argv
    root = args[0] if args else 'art/assassin'
    cid = os.path.basename(root.rstrip('/'))
    rig_path = os.path.join(root, 'rig.json')
    old = json.load(open(rig_path, encoding='utf-8')) if os.path.exists(rig_path) else {}

    # 통 이미지 (비교 기준)
    full = key_magenta(os.path.join(root, 'full_side.png'))
    fx0, fy0, fx1, fy1 = bbox(full)
    save(full, os.path.join(root, 'full_side_key.png'))
    full_h = fy1 - fy0
    scale = round(TARGET_H / full_h, 5)

    # 부위
    sheet = key_magenta(os.path.join(root, 'parts_side.png'))
    parts, cell = slice_grid(sheet, *PARTS_GRID, MARGIN)
    rig = {'cell': cell, 'scale': old.get('scale', scale), 'cloak': True, 'parts': {}}
    for n, img in parts.items():
        save(img, os.path.join(root, 'parts', n + '.png'))
        prev = old.get('parts', {}).get(n)
        j = prev if keep and prev else auto_joints(n, img)
        j['src'] = f'parts/{n}.png'
        if n in SIZE and 'size' not in j:
            j['size'] = SIZE[n]
        rig['parts'][n] = j

    # 무기: 한 덩어리, 세로 · 손잡이 위
    w = key_magenta(os.path.join(root, 'weapon.png'))
    wx0, wy0, wx1, wy1 = bbox(w)
    pad = 16
    wc = w[max(0, wy0 - pad):wy1 + pad, max(0, wx0 - pad):wx1 + pad]
    save(wc, os.path.join(root, 'weapon_cut.png'))
    L = wy1 - wy0
    # 쥐는 자리 = 손잡이 가운데(위에서 13%) · 칼끝 = 가장 아래 불투명 픽셀
    gy = pad + L * 0.13
    tip_y = wc.shape[0] - 1
    while tip_y > 0 and not (wc[tip_y, :, 3] > 0).any():
        tip_y -= 1
    tip_x = float(np.nonzero(wc[tip_y, :, 3] > 0)[0].mean())
    prev_w = old.get('weapon') if keep else None
    rig['weapon'] = prev_w or {'src': 'weapon_cut.png', 'cell': [wc.shape[1], wc.shape[0]],
                               'grip': [round(row_center(wc, gy - 4, gy + 4), 1), round(gy, 1)], 'rot': 0,
                               'tip': [round(tip_x, 1), float(tip_y)], 'size': 1}
    rig['weapon']['cell'] = [wc.shape[1], wc.shape[0]]

    # 사망 통그림 4컷 (있을 때만): 컷마다 바닥 닿는 자리(가장 아래 줄 가운데)가 기준점
    if os.path.exists(os.path.join(root, 'death.png')):
        # 사망 컷 축척 기준 키: SD 배율로 조립한 참고 그림(sd_ref.png)이 있으면 그 키, 없으면 통 이미지 키
        ref_h = full_h
        if os.path.exists(os.path.join(root, 'sd_ref.png')):
            sb = bbox(key_magenta(os.path.join(root, 'sd_ref.png')))
            ref_h = sb[3] - sb[1]
        slice_death(root, rig, old, keep, ref_h)
    finish(root, cid, rig, old, keep, full, fx0, fy0, fx1, fy1, parts, cell, rig_path)


def slice_death(root, rig, old, keep, full_h):
    d = key_magenta(os.path.join(root, 'death.png'))
    dparts, _ = slice_grid(d, *DEATH_GRID, 0)
    frames = []
    for i in range(4):
        img = dparts[f'death_{i}']
        x0, y0, x1, y1 = bbox(img)
        c = img[max(0, y0 - 8):y1 + 8, max(0, x0 - 8):x1 + 8]
        save(c, os.path.join(root, 'death', f'death_{i}.png'))
        bx0, by0, bx1, by1 = bbox(c)
        # 서 있는 컷은 발(가장 아래 줄), 누운 컷은 몸 가운데 아래
        px = row_center(c, by1 - 6, by1 + 1) if i < 2 else (bx0 + bx1) / 2
        # 몸이 오른쪽을 보고 뒤(왼쪽)로 쓰러지니, 기준점은 처음 서 있던 발 자리에 맞춰 이어지게
        frames.append({'src': f'death/death_{i}.png', 'pivot': [round(px, 1), float(by1)], 'w': c.shape[1], 'h': c.shape[0]})
    # 사망 컷 축척: 첫 컷(선 채로 맞음)의 키 ≈ 통 이미지 키로 맞춤
    h0 = bbox(dparts['death_0'])
    death_scale = full_h / max(1, (h0[3] - h0[1]) * 1.04)
    rig['death'] = old.get('death') if keep and old.get('death') else {
        'frames': frames, 'size': round(rig['scale'] * death_scale, 5), 'times': [0, 0.12, 0.34, 0.6]}


def finish(root, cid, rig, old, keep, full, fx0, fy0, fx1, fy1, parts, cell, rig_path):
    # 비교 기준: 통 이미지 발 자리와 축척 (리그 편집기에서 겹쳐 봄)
    foot_x = row_center(full, fy1 - 30, fy1 + 1)
    rig['ref'] = old.get('ref') if keep and old.get('ref') else {'src': 'full_side_key.png', 'foot': [round(foot_x, 1), float(fy1)], 'k': 1.0}
    json.dump(rig, open(rig_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(rig_path, 'scale', rig['scale'], 'cell', cell, 'parts', list(parts))

    # 확인 그림: 부위마다 관절 점
    os.makedirs('out', exist_ok=True)
    tiles = []
    for n in PARTS_GRID[2]:
        if n not in parts:
            continue
        im = Image.fromarray(parts[n], 'RGBA')
        bg = Image.new('RGBA', im.size, (40, 40, 52, 255))
        bg.alpha_composite(im)
        dr = ImageDraw.Draw(bg)
        spec = rig['parts'][n]
        pts = [('pivot', spec['pivot'])] + list(spec.get('joints', {}).items())
        for k, (x, y) in pts:
            col = (255, 230, 60) if k == 'pivot' else (60, 230, 255)
            dr.ellipse([x - 7, y - 7, x + 7, y + 7], outline=col, width=3)
            dr.text((x + 9, y - 6), k, fill=col)
        dr.text((6, 6), n, fill=(255, 255, 255))
        tiles.append(bg)
    sheet_out = Image.new('RGBA', (cell[0] * 4, cell[1] * 2), (0, 0, 0, 255))
    for i, t in enumerate(tiles):
        sheet_out.paste(t, ((i % 4) * cell[0], (i // 4) * cell[1]))
    sheet_out.resize((sheet_out.width // 2, sheet_out.height // 2)).save(f'out/{cid}_slice.png')
    print(f'out/{cid}_slice.png')


if __name__ == '__main__':
    main()
