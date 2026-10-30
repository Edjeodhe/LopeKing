"""Codex 그림(마젠타 배경) → 리그 부위 PNG + rig.json 관절 초안 + 사망 컷 + 비교용 통 이미지.

칸 격자로 자르지 않고 '덩어리'로 자른다: 그림이 칸을 넘어도(삿갓 챙) 안 잘리게, 덩어리 무게중심이 든 칸의 부위로.
부위 그림은 칸 + 둘레 여유(MARGIN)를 한 장으로 저장 → 좌표 = 그 칸 기준 px (rig.json 의 cell).

사용: python tools/slice_char.py art/<id> [--keep-joints]
  --keep-joints : rig.json 에 이미 있는 관절 값(리그 편집기에서 맞춘 것)은 건드리지 않고 그림만 다시 자름
  --margin=N    : 칸 둘레 여유 px (기본 64). 그림이 옆 칸까지 크게 넘으면(가면 뿔·코 등) 키움
출력: parts/<부위>.png · weapon_cut.png · death/death_<n>.png · full_side_key.png · rig.json · out/<id>_slice.png (확인용)
"""
import json
import os
import sys

import cv2
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
    # 단 갇힌 조각이 보라 쪽(파랑이 빨강보다 뚜렷이 높음 — 달 도깨비 가면 눈빛·보라 옷)이면 배경이 아니라 그림 (배경은 r ≈ b)
    lab, n = ndimage.label(bg)
    if n > 1:
        edge_ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        lean = ndimage.mean((b - r).astype(float), lab, range(1, n + 1))
        violet = [i + 1 for i in range(n) if i + 1 not in edge_ids and lean[i] > 20]
        if violet:
            bg = bg & ~np.isin(lab, violet)
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
    margin = next((int(a.split('=')[1]) for a in sys.argv if a.startswith('--margin=')), MARGIN)
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
    parts, cell = slice_grid(sheet, *PARTS_GRID, margin)
    rig = {'cell': cell, 'scale': old.get('scale', scale), 'cloak': True, 'parts': {}}
    for n, img in parts.items():
        save(img, os.path.join(root, 'parts', n + '.png'))
        prev = old.get('parts', {}).get(n)
        j = prev if keep and prev else auto_joints(n, img)
        j['src'] = f'parts/{n}.png'
        if n == 'head' and not (keep and prev and 'eye' in prev.get('joints', {})):
            e = find_eye(img, cid)
            if e:
                j.setdefault('joints', {})['eye'] = e
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
    slice_anims(root, rig, full_h)
    finish(root, cid, rig, old, keep, full, fx0, fy0, fx1, fy1, parts, cell, rig_path)


def slice_death(root, rig, old, keep, full_h):
    d = key_magenta(os.path.join(root, 'death.png'))
    dparts, _ = slice_grid(d, *DEATH_GRID, 48)   # 여유: 칸 경계를 조금 넘는 컷이 잘리지 않게 (덩어리는 무게중심 칸으로만 가니 옆 컷이 섞이진 않음)
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


ANIM_SHEETS = {'idle': ('pose_idle.png', 8, 6), 'run': ('pose_run.png', 8, 12), 'walk': ('pose_walk.png', 8, 8)}   # 이름: (시트, 장수, 초당 장수) — 4×2 칸. walk = 보스
# 프레임 축척 보정 (캐릭터별 곱): 대기 첫 장 키로 맞추면 웅크린 대기(물)·벌린 다리(불)는 머리가 통 이미지보다 커 보여 줄임.
# 기준 = 기본 도깨비의 '머리 맞춤 축척 × 1.1' 쯤 (몸 키가 리그와 너무 벌어지지 않게 그 사이)
ANIM_FIT = {'dokkaebi_fire': 0.95, 'dokkaebi_water': 0.88}
# 가면 눈빛 색 (캐릭터별): 머리 부위의 눈 자리(eye — main.js drawEye·eyefire.js)를 이 색 덩어리로 잼. 없으면 안 잼 (손으로 적은 값을 --keep-joints 로 지킴)
# 프레임마다 눈은 색이 아니라 머리 부위 눈 둘레를 본으로 찾음(match_eye) — 프레임엔 눈빛이 없기도 하고(달) 뿔·머리끝이 같은 색이라
EYE_COLOR = {
    'dokkaebi_fire': lambda r, g, b: (r > 230) & (g > 140) & (b < 70),     # 숯불 주황 (살색은 파랑이 높아 빠짐)
    'dokkaebi_water': lambda r, g, b: (g > 230) & (b > 230) & (r < 160),   # 밝은 물빛 (흰 소용돌이 무늬·이빨은 빨강이 높아 빠짐)
    'dokkaebi_moon': lambda r, g, b: (b > 180) & (r > 120) & (g < 110),    # 보라
}


def find_eye(img, cid, region=None):
    """눈빛 색 덩어리 중 머리 앞쪽(오른쪽)·아래쪽에 가까운 것 (뿔·머리카락 끝의 비슷한 색은 위·뒤에 있음). region = (x0, y0, x1, y1)"""
    if cid not in EYE_COLOR:
        return None
    x0, y0, x1, y1 = region or (0, 0, img.shape[1], img.shape[0])
    sub = img[y0:y1, x0:x1].astype(int)
    m = EYE_COLOR[cid](sub[..., 0], sub[..., 1], sub[..., 2]) & (sub[..., 3] > 128)
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    best = None
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(xs) < 3:
            continue
        score = xs.mean() + ys.mean() * 0.5 + min(len(xs), 40) * 2
        if best is None or score > best[0]:
            best = (score, xs.mean(), ys.mean())
    if not best:
        return None
    # 눈빛이 여러 조각으로 갈라져 있으면 둘레 조각까지 합친 가운데
    ys, xs = np.nonzero(m)
    near = (xs - best[1]) ** 2 + (ys - best[2]) ** 2 < 18 ** 2
    return [round(float(xs[near].mean()) + x0, 1), round(float(ys[near].mean()) + y0, 1)]


def match_eye(frame, head, eye, region, box=(80, 70, 50, 60), scales=None):
    """머리 부위의 눈 둘레(box = 눈에서 왼·위·오른·아래 px)를 축척을 바꿔 가며 프레임 region 안에서 찾음 → 프레임 속 눈 자리, 축척"""
    def comp(a):   # 어두운 바탕에 얹어 비교
        al = a[..., 3:4].astype(np.float32) / 255
        return a[..., :3].astype(np.float32) * al + np.float32([40, 40, 52]) * (1 - al)
    ex, ey = eye
    px0, py0 = int(ex - box[0]), int(ey - box[1])
    patch = comp(head[max(0, py0):int(ey + box[3]), max(0, px0):int(ex + box[2])])
    px0, py0 = max(0, px0), max(0, py0)
    x0, y0, x1, y1 = region
    reg = comp(frame[y0:y1, x0:x1])
    best = None
    for s in (np.arange(0.25, 0.8, 0.02) if scales is None else scales):
        t = cv2.resize(patch, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        if t.shape[0] >= reg.shape[0] or t.shape[1] >= reg.shape[1]:
            continue
        _, mv, _, ml = cv2.minMaxLoc(cv2.matchTemplate(reg, t, cv2.TM_CCOEFF_NORMED))
        if best is None or mv > best[0]:
            best = (mv, s, ml)
    if best is None:
        return None, None
    _, s, (mx, my) = best
    return [round(float(x0 + mx + (ex - px0) * s), 1), round(float(y0 + my + (ey - py0) * s), 1)], s


def frame_eye(c, head, eye, ax):
    """프레임 한 장의 눈: 머리 둘레로 크게 찾고(위 40%, 몸통 가운데 조금 뒤부터 앞) → 그 둘레에서 눈만 좁게 다시"""
    e, s = match_eye(c, head, eye, (max(0, int(ax) - 40), 0, c.shape[1], int(c.shape[0] * 0.4)))
    if e is None:
        return None
    rg = (max(0, int(e[0] - 40)), max(0, int(e[1] - 40)), min(c.shape[1], int(e[0] + 40)), min(c.shape[0], int(e[1] + 40)))
    e2, _ = match_eye(c, head, eye, rg, (34, 30, 30, 30), np.arange(s - 0.06, s + 0.2, 0.01))
    return e2 or e


def slice_anims(root, rig, full_h):
    """프레임 애니메이션 시트(4×2 칸) → anims/<이름>_<n>.png + rig['anims'].
    장마다 발 기준점을 같게 둬야 재생할 때 안 떨림: 바닥 = 시트 전체에서 가장 아래 발끝, 가로 = 장마다 몸통(키의 30~60% 줄) 가운데의 가운데값.
    입 자리(mouth): 머리 쪽 붉은 가면 덩어리의 앞 끝 아래 — 가면 숨(steam.js)이 나오는 곳.
    눈 자리(eye): 머리 부위에 eye 관절이 있으면 그 둘레를 본으로 찾음 (frame_eye).
    축척: 대기 첫 장 키 ≈ 통 이미지 키 (달리기도 같은 축척)"""
    cid = os.path.basename(os.path.normpath(root))
    hd = rig['parts'].get('head', {})
    eye = hd.get('joints', {}).get('eye')
    head = np.array(Image.open(os.path.join(root, hd['src'])).convert('RGBA')) if eye else None
    out, size = {}, None
    for name, (src, n, fps) in ANIM_SHEETS.items():
        path = os.path.join(root, src)
        if not os.path.exists(path):
            continue
        sheet = key_magenta(path)
        cells, _ = slice_grid(sheet, 4, 2, [f'{name}_{i}' for i in range(n)], 48)   # 여유 = 사망 컷과 같음
        imgs = [cells[f'{name}_{i}'] for i in range(n) if f'{name}_{i}' in cells]
        boxes = [bbox(im) for im in imgs]
        ground = max(b[3] for b in boxes)
        mids = []
        for im, (x0, y0, x1, y1) in zip(imgs, boxes):
            h = y1 - y0
            mids.append(row_center(im, y0 + h * 0.3, y0 + h * 0.6))
        ax = float(np.median(mids))
        if size is None:
            size = round(rig['scale'] * full_h / max(1, (boxes[0][3] - boxes[0][1]) * 1.02) * ANIM_FIT.get(cid, 1), 5)
        os.makedirs(os.path.join(root, 'anims'), exist_ok=True)
        frames = []
        for i, (im, (x0, y0, x1, y1)) in enumerate(zip(imgs, boxes)):
            cx0, cy0 = max(0, x0 - 8), max(0, y0 - 8)
            c = im[cy0:y1 + 8, cx0:x1 + 8]
            save(c, os.path.join(root, 'anims', f'{name}_{i}.png'))
            # 가면(진홍) 덩어리: 키의 위 25% 안 붉은 점들 → 앞(오른쪽) 끝, 세로 가운데보다 조금 아래
            top = im[y0:y0 + int((y1 - y0) * 0.25)]
            r, g, b, a = [top[..., k].astype(int) for k in range(4)]
            ys, xs = np.nonzero((a > 128) & (r > 140) & (g < 90) & (b < 90))
            mouth = [round(float(xs.max()) + x0 - cx0 - 1, 1), round(float(np.median(ys)) + y0 + 3 - cy0, 1)] if len(xs) else None
            fr = {'src': f'anims/{name}_{i}.png', 'pivot': [round(ax - cx0, 1), float(ground - cy0)], 'w': c.shape[1], 'h': c.shape[0], 'mouth': mouth}
            e = frame_eye(c, head, eye, ax - cx0) if eye else None
            if e:
                fr['eye'] = e
            frames.append(fr)
        out[name] = {'frames': frames, 'size': size, 'fps': fps}
        print(name, len(frames), '장, 축척', size)
    if out:
        rig['anims'] = out


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
