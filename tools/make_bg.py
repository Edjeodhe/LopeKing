"""일반 배경 원화 준비. 픽셀화·음영·거리 흐림은 src/backdrop.js 셰이더가 맡는다.

python tools/make_bg.py ruin art/bg_source
하늘은 원본 유지, far/mid는 알파를 보존하며 좌우 이음만 겹친다.
마젠타 키·4배 픽셀 가정·팔레트 축소·오프라인 발광 추출은 사용하지 않는다.
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image


def seamless(image):
    a = np.array(image.convert('RGBA'), dtype=np.float32)
    h, w = a.shape[:2]
    overlap = max(24, w // 16)
    tile = a[:, :w - overlap].copy()
    # 프리멀티플라이드 알파로 섞어 투명 경계의 검은 RGB가 지붕에 번지지 않게 한다.
    t = ((np.arange(overlap) + 0.5) / overlap)[None, :, None]
    left, right = a[:, w - overlap:], a[:, :overlap]
    la, ra = left[..., 3:4] / 255, right[..., 3:4] / 255
    alpha = la * (1 - t) + ra * t
    rgb = (left[..., :3] * la * (1 - t) + right[..., :3] * ra * t) / np.maximum(alpha, 1e-6)
    tile[:, :overlap, :3] = rgb
    tile[:, :overlap, 3:4] = alpha * 255
    return Image.fromarray(np.clip(tile, 0, 255).astype(np.uint8))


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'ruin'
    src = Path(sys.argv[2] if len(sys.argv) > 2 else 'art/bg_source')
    dst = Path('art/bg')
    dst.mkdir(parents=True, exist_ok=True)
    for layer in ('sky', 'far', 'mid'):
        with Image.open(src / f'bg_{layer}.png') as source:
            image = source.convert('RGBA')
        if layer != 'sky':
            if image.getextrema()[3][0] == 255:
                raise ValueError(f'{layer}: 실제 투명 알파가 있는 레이어 원화가 필요합니다')
            image = seamless(image)
        path = dst / f'{name}_{layer}.png'
        image.save(path)
        print(f'{path}: {image.width}x{image.height} (일반 원화, runtime shader)')


if __name__ == '__main__':
    main()
