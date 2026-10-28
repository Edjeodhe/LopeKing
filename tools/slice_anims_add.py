# 프레임 애니메이션 시트만 더 잘라 넣기 (rig.json 의 다른 것 — 부위·관절·대기·달리기·사망 컷 — 은 그대로 둠)
# 사용: python tools/slice_anims_add.py art/dokkaebi flash:pose_flash.png:16 sheath:pose_sheath.png:10
#   이름:시트:초당 장수 — 시트는 4×2 칸 8장 (slice_char.py slice_anims 와 같은 규칙). 축척은 이미 있는 대기(idle) 축척을 그대로
#   눈(노란 가면 눈)이 있으면 초록으로 바꾸고 장마다 eye 자리를 적음 (main.js drawEye — 가면 눈빛)
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from slice_char import key_magenta, slice_grid, bbox, row_center, save
from PIL import Image


def find_eye(c):
    """가면 눈: 노란(또는 초록) 덩어리 중 둘레가 검은 눈구멍이고 그 바깥이 붉은 가면인 것 (12~80점). 없으면 None"""
    from scipy import ndimage
    r, g, b, a = [c[..., k].astype(int) for k in range(4)]
    # 노란 눈(예전 그림) 또는 이미 초록인 눈 (새로 뽑는 그림은 초록 눈으로 그려 달라고 함)
    yel = (a > 0) & (((r > 200) & (g > 70) & (b < 90) & (r - b > 150)) | ((g > 170) & (r < 150) & (b < 190) & (g - r > 60)))
    lab, n = ndimage.label(yel, structure=np.ones((3, 3)))
    best = None
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if not 12 <= len(xs) <= 80: continue
        m = lab == i
        ring = ndimage.binary_dilation(m) & ~m
        dark = ((a > 0) & (r + g + b < 120) & ring).sum() / max(1, ring.sum())
        y0, y1, x0, x1 = max(0, ys.min() - 5), ys.max() + 6, max(0, xs.min() - 5), xs.max() + 6
        box = np.zeros_like(m); box[y0:y1, x0:x1] = True; box &= ~m
        red = ((a > 0) & (r > 130) & (g < 70) & (b < 70) & box).sum() / max(1, box.sum())
        sc = dark * red
        if dark > 0.25 and red > 0.2 and (not best or sc > best[0]): best = (sc, m, [round(float(xs.mean()), 1), round(float(ys.mean()), 1)])
    return best


def main():
    root = sys.argv[1]
    rig_path = os.path.join(root, 'rig.json')
    rig = json.load(open(rig_path, encoding='utf-8'))
    size = rig['anims']['idle']['size']
    for spec in sys.argv[2:]:
        name, src, fps = spec.split(':')
        sheet = key_magenta(os.path.join(root, src))
        cells, _ = slice_grid(sheet, 4, 2, [f'{name}_{i}' for i in range(8)], 0)
        imgs = [cells[f'{name}_{i}'] for i in range(8) if f'{name}_{i}' in cells]
        boxes = [bbox(im) for im in imgs]
        ground = max(b[3] for b in boxes)
        ax = float(np.median([row_center(im, y0 + (y1 - y0) * 0.3, y0 + (y1 - y0) * 0.6) for im, (x0, y0, x1, y1) in zip(imgs, boxes)]))
        frames = []
        for i, (im, (x0, y0, x1, y1)) in enumerate(zip(imgs, boxes)):
            cx0, cy0 = max(0, x0 - 8), max(0, y0 - 8)
            c = im[cy0:y1 + 8, cx0:x1 + 8].copy()
            f = {'src': f'anims/{name}_{i}.png', 'pivot': [round(ax - cx0, 1), float(ground - cy0)], 'w': c.shape[1], 'h': c.shape[0], 'mouth': None}
            e = find_eye(c)
            if e:
                m = e[1]; v = (c[..., 0].astype(int) + c[..., 1]) / 2 / 255
                c[m, 0] = (40 + 60 * v[m]).astype(np.uint8); c[m, 1] = (150 + 105 * v[m]).astype(np.uint8); c[m, 2] = (80 + 60 * v[m]).astype(np.uint8)
                f['eye'] = e[2]
            save(c, os.path.join(root, 'anims', f'{name}_{i}.png'))
            frames.append(f)
        rig['anims'][name] = {'frames': frames, 'size': size, 'fps': int(fps)}
        print(name, len(frames), '장 · 눈', sum(1 for f in frames if 'eye' in f), '장')
    json.dump(rig, open(rig_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
