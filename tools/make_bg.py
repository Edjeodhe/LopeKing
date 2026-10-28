# 배경 그림(Codex, 4배 도트) → 게임 배경 층 (art/bg/<이름>_<층>.png + 빛나는 부분 <층>_glow.png)
# 사용: python tools/make_bg.py ruin art/bg_concept   → bg_sky.png · bg_far.png · bg_mid.png 를 읽음
#   sky = 고정 층 (480×270 에 꽉 차게) · far·mid = 가로로 끝없이 이어 붙는 띠 (마젠타 배경 → 투명)
#   이어 붙이기: 오른쪽 끝 근처에서 '그다음 열이 왼쪽 첫 열과 가장 닮은' 자리를 찾아 거기서 자르고,
#     왼쪽 첫 BLEND 열을 그 자리 뒤 열들과 섞어 넘어가게 함 → 끝 → 처음이 끊김 없이 이어짐. 섞은 뒤 색을 다시 줄여 도트 결 유지
#   glow = 불·달·불 켜진 창처럼 밝은 점만 (main.js 가 조명 뒤에 더하기로 그려 어둠 속에서 빛나게, 불은 일렁임)
import os, sys
import numpy as np
from PIL import Image

W, H = 480, 270
BLEND = 24


def load(path, key=False):
    a = np.array(Image.open(path).convert('RGBA')).astype(np.int32)
    if key:   # 마젠타(및 그 번짐) → 투명
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        mag = (r > 150) & (b > 150) & (g < 110) & (np.abs(r - b) < 90)
        a[mag, 3] = 0
        # 번짐 빼기(despill): 남은 점의 마젠타 기운(빨강·파랑이 초록보다 넘치는 만큼)을 덜어 냄 → 연기·불 가장자리의 분홍빛이 회색·주황으로
        m = np.minimum(r, b) - g
        sp = m > 20
        a[sp, 0] -= (m[sp] * 0.85).astype(np.int32); a[sp, 2] -= (m[sp] * 0.85).astype(np.int32)
    return a


def block_down(a, k=4):
    """4배 도트 → 1배: 칸마다 가운데 점 (알파는 칸 안 과반)"""
    h, w = a.shape[0] // k * k, a.shape[1] // k * k
    a = a[:h, :w]
    out = a[k // 2::k, k // 2::k].copy()
    al = (a[..., 3] > 127).reshape(h // k, k, w // k, k).mean(axis=(1, 3))
    out[..., 3] = np.where(al >= 0.5, 255, 0)
    return out


def requant(a, n=64):
    rgb = Image.fromarray(a[..., :3].clip(0, 255).astype(np.uint8), 'RGB').quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out = np.dstack([np.array(rgb), np.where(a[..., 3] > 127, 255, 0)])
    return out


def seamless(a):
    h, w = a.shape[:2]
    def col(x): return a[:, x].astype(np.float32)
    best, bx = 1e18, w - 1
    for c in range(int(w * 0.8), w - BLEND):
        s = sum(np.abs(col(k) - col(c + k)).sum() for k in range(4))
        if s < best: best, bx = s, c
    tile = a[:, :bx].copy().astype(np.float32)
    for i in range(BLEND):   # 처음 BLEND 열: 자른 자리 뒤(bx+i) → 원래(i) 로 서서히
        t = i / BLEND
        tile[:, i] = a[:, bx + i] * (1 - t) + a[:, i] * t
    print('  이어 붙는 폭', bx, '/', w)
    tile[..., 3] = np.where(tile[..., 3] > 127, 255, 0)   # 색은 그대로(줄이면 불 주황이 뭉개짐), 반투명만 없앰
    return tile


def glow(a, with_fire=True):
    r, g, b, al = [a[..., k] for k in range(4)]
    fire = (al > 0) & (r > 170) & (g > 60) & (b < 120) & (r > g + 30) & with_fire
    bright = (al > 0) & (np.maximum(np.maximum(r, g), b) > 175) & ~((r > 170) & (r > g + 30) & (b < 120))   # 달·별·흰 빛 (주황 아님)
    m = fire | bright
    out = np.zeros_like(a); out[m] = a[m]; out[m, 3] = 255
    # 불(주황)은 알파 255, 그 밖의 밝은 점(달·흰 빛)은 180 → 그릴 때 불만 일렁이게 구분
    out[m & ~fire, 3] = 180
    return out


def save(a, path):
    Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA').save(path)


def main():
    name, src = sys.argv[1], sys.argv[2]
    os.makedirs('art/bg', exist_ok=True)
    # 하늘: 480×270 에 꽉 차게 (가운데 기준, 위쪽 남김)
    sky = Image.open(os.path.join(src, 'bg_sky.png')).convert('RGB')
    k = max(W / sky.width, H / sky.height)
    sky = sky.resize((round(sky.width * k), round(sky.height * k)), Image.LANCZOS)
    x0 = (sky.width - W) // 2
    sky = sky.crop((x0, 0, x0 + W, H)).quantize(48, dither=Image.Dither.NONE).convert('RGBA')
    sa = np.array(sky).astype(np.int32)
    save(sa, f'art/bg/{name}_sky.png'); save(glow(sa, with_fire=False), f'art/bg/{name}_sky_glow.png')   # 하늘은 달·별만 (아래 불빛 노을은 넓어서 빼고)
    for layer in ('far', 'mid'):
        a = block_down(load(os.path.join(src, f'bg_{layer}.png'), key=True))
        print(layer, '1배 크기', a.shape[1], 'x', a.shape[0])
        t = seamless(a)
        save(t, f'art/bg/{name}_{layer}.png'); save(glow(t), f'art/bg/{name}_{layer}_glow.png')
    print('ok')


if __name__ == '__main__':
    main()
