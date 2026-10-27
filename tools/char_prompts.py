"""캐릭터 그림 프롬프트 만들기 → art/<id>/prompt_<이름>.txt (Codex CLI 로 뽑음: sh tools/gen_char.sh <id>)
순서: full_side (통 이미지, 디자인 기준) → parts_side · weapon · (death) — 뒤 셋은 full_side 를 참고로.
모든 캐릭터는 같은 뼈대(head·torso·hips·cape·upperArm·foreArm·thigh·shin + 무기)라 같은 리그·굽기 코드로 돈다.
사용: python tools/char_prompts.py [id ...]   (없으면 전부)"""
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art')

COMMON_STYLE = (
    '- PROPORTIONS: stylized chibi-action "SD" proportions, about 3.3 heads tall: the head (with headgear) is BIG (about 30% of the '
    'full height), short sturdy body, short limbs, a slightly oversized look like a modern pixel action game character (Sanabi / Katana Zero era). '
    'NOT cute, no big anime eyes.\n'
    '- RENDERING: flat CEL SHADING, every material exactly THREE flat tones (shadow, base, light) with hard edges, plus a thin cold moonlight '
    'rim light ON the upper-right edges of each shape (inside the shape, not a glow around it). NO outlines, NO black linework, NO gradients, '
    'NO texture noise, NO glow halos, NO tiny details. Big simple readable shapes with a few bold cloth folds: it will be shrunk to a '
    '40-pixel-tall sprite.\n'
)

# 캐릭터마다: 설명 · 팔레트 · 부위별 설명 · 무기 · 사망 컷 여부
CHARS = {
    'assassin': {
        'who': 'an original ASSASSIN hero inspired by the Assassin\'s Creed silhouette mixed with East-Asian wanderer gear (original design, '
               'do NOT copy any existing character). Wears a wide conical woven bamboo hat (Korean "satgat" / straw kasa) tilted slightly forward '
               'so its brim shades the eyes, with one sharp eye glint visible under the brim; the lower face is covered by a dark cloth mask. '
               'Ivory-white fitted assassin coat with layered coat tails, dark leather straps and bracers, a deep CRIMSON waist sash, dark charcoal '
               'trousers, cloth-wrapped soft boots. A separate dark charcoal-indigo SHORT CLOAK hangs from the shoulders down to about the knees, '
               'with a ragged torn hem.',
        'palette': 'ivory white, charcoal, indigo-gray, dark leather brown, straw tan for the hat, and ONE vivid accent: deep crimson red.',
        'parts': {
            'HEAD': 'big head with the wide conical woven bamboo hat on, brim tilted forward, dark cloth mask on the lower face with a short tail '
                    'of the mask cloth fluttering backward (left), short neck with a flat cut at the bottom. The hat must fit inside the cell.',
            'TORSO': 'chest and back of the ivory assassin coat with dark leather chest strap, NO cloak (the cloak is a separate part), NO arms. '
                     'Flat cut at the neck and at the waist.',
            'HIPS': 'crimson waist sash with a short hanging knot tail, dark belt, the layered ivory coat tails hanging down to the knees, top of '
                    'charcoal trousers. Flat cut on top.',
            'CAPE': 'ONLY the short dark charcoal-indigo cloak, seen from the side, hanging straight DOWN from a narrow fastened top (the shoulder '
                    'mount point at the top center), widening toward a ragged torn hem. About 440 px long. No body inside it.',
            'UPPER ARM': 'ivory sleeve with a rounded shoulder at the top, flat cut at the elbow.',
            'FOREARM + HAND': 'dark leather bracer with a small mechanical rope-launcher on the wrist, closed fist in a dark glove.',
            'THIGH': 'dark charcoal trousers, rounded hip cap on top, flat cut at the knee.',
            'SHIN + BOOT': 'charcoal trousers wrapped with cloth bindings, soft dark boot, toe pointing RIGHT, flat sole at the bottom.',
        },
        'weapon': 'a jet-BLACK-bladed katana (a "black nichirin"-like blade): slim, slightly curved single-edged blade that is entirely matte '
                  'black, with only a very thin dark steel-gray cutting edge line; a simple bold BLACK round guard (tsuba); grip wrapped in a '
                  'black-and-crimson diamond pattern, small dark pommel. Total length about 760 px. Blade edge faces RIGHT.',
        'death': True,
    },
    'ghoul': {
        'who': 'an original undead GHOUL BANDIT swordsman, a corrupted monster of a cursed night town (original design, do NOT copy any existing '
               'character). Gaunt and hunched, ash-gray rotting skin, sunken face with a torn lipless grin showing teeth, small glowing sickly '
               'yellow-green eyes, stringy black hair, a battered dented iron headband. Ragged dirty hemp clothes with exposed ribs, rope belt, '
               'bare bony shins with filthy foot wraps. A torn STRAW RAIN CAPE (Korean "dorongi") hangs from the shoulders as a separate part.',
        'palette': 'ash gray-green skin, dirty hemp beige, rotten brown, straw yellow-brown, rusty iron, and ONE vivid accent: sickly '
                   'yellow-green glowing eyes.',
        'parts': {
            'HEAD': 'big gaunt ghoul head in side view with a torn lipless grin, glowing yellow-green eye, stringy hair, dented iron headband, '
                    'short neck with a flat cut at the bottom.',
            'TORSO': 'hunched bony chest in torn hemp vest, ribs visible on the side, NO arms, NO cape. Flat cut at neck and waist.',
            'HIPS': 'rope belt, torn hemp skirt flaps down to mid-thigh, top of ragged trousers. Flat cut on top.',
            'CAPE': 'ONLY the torn straw rain cape (dorongi), hanging straight DOWN from a narrow top (the mount point at the top center), '
                    'shaggy layered straw ending in a ragged hem. About 400 px long. No body inside it.',
            'UPPER ARM': 'thin ash-gray bony arm with a torn hemp sleeve stub at the shoulder, flat cut at the elbow.',
            'FOREARM + HAND': 'thin ash-gray forearm with dirty cloth wrap, bony clawed hand closed into a fist.',
            'THIGH': 'ragged dark hemp trousers, rounded hip cap on top, flat cut at the knee.',
            'SHIN + BOOT': 'bare bony gray shin with filthy cloth foot wraps, toe pointing RIGHT, flat sole at the bottom.',
        },
        'weapon': 'a RUSTY notched curved saber with a broken chipped edge and a rag-wrapped grip, small round rusty guard. Total length about '
                  '620 px. Blade edge faces RIGHT.',
        'death': False,
    },
    'gunner': {
        'who': 'an original undead MUSKETEER ghoul, a corrupted soldier of a cursed night town (original design, do NOT copy any existing '
               'character). Wears a wide flat-brimmed black soldier hat (Joseon "jeollip") with a red tassel, a cracked pale ceramic mask with '
               'one glowing yellow-green eye hole, a dark padded soldier coat with tarnished brass studs, ammunition pouches, wrapped gaiters. '
               'A tattered dark-red military half-cape hangs from one shoulder as a separate part.',
        'palette': 'black hat, pale bone-white mask, dark navy padded coat, tarnished brass, dull leather, and ONE vivid accent: sickly '
                   'yellow-green eye glow (plus a small faded red tassel).',
        'parts': {
            'HEAD': 'big head with the wide flat-brimmed black soldier hat with a red tassel, cracked pale ceramic mask with one glowing eye hole, '
                    'short neck with a flat cut at the bottom. The hat must fit inside the cell.',
            'TORSO': 'dark navy padded soldier coat chest with brass studs and a powder-flask strap, NO arms, NO cape. Flat cut at neck and waist.',
            'HIPS': 'leather belt with ammunition pouches, padded coat skirt down to mid-thigh, top of trousers. Flat cut on top.',
            'CAPE': 'ONLY the tattered dark-red military half-cape, hanging straight DOWN from a narrow top (the mount point at the top center), '
                    'torn hem. About 380 px long. No body inside it.',
            'UPPER ARM': 'padded navy sleeve with a rounded shoulder at the top, flat cut at the elbow.',
            'FOREARM + HAND': 'padded navy sleeve cuff with brass studs, pale gray hand closed into a fist.',
            'THIGH': 'dark trousers, rounded hip cap on top, flat cut at the knee.',
            'SHIN + BOOT': 'wrapped cloth gaiters and soft dark boot, toe pointing RIGHT, flat sole at the bottom.',
        },
        'weapon': 'an old MATCHLOCK MUSKET (Korean "jochong"), seen from the side, VERTICAL with the wooden STOCK/GRIP at the TOP and the long '
                  'iron BARREL pointing straight DOWN, a glowing match cord on the lock, brass bands. Total length about 700 px.',
        'death': False,
    },
}

HEAD = ('Use your built-in image generation tool to create ONE image and save it as PNG to: {name}.png '
        '(in the current working directory). Do not write code to draw it; it must be a generated illustration. '
        'After saving, reply only with the file name.\n\nImage spec:\n')
BG = ('- Solid flat MAGENTA background (#FF00FF) everywhere behind the drawings. No text, no letters, no numbers, '
      'no labels, no grid lines, no frames, no cast shadows, no ground.\n')
SCALE = ('- Scale: as if the whole figure is 1150 px tall from boot sole to the top of the head/headgear '
         '(head with headgear about 360 px tall and at most 360 px wide, thigh about 190 px long, shin with boot about 230 px long).\n')
SAME = ('- The attached reference image shows THIS EXACT CHARACTER. Keep the identical design, colors, '
        'proportions and scale.\n')
CELLS = ['HEAD', 'TORSO', 'HIPS', 'CAPE', 'UPPER ARM', 'FOREARM + HAND', 'THIGH', 'SHIN + BOOT']


def style(c):
    return f'- CHARACTER: {c["who"]}\n' + COMMON_STYLE + f'- PALETTE: {c["palette"]}\n'


def prompts(c):
    p = {
        # 통 이미지: 리그 부위를 맞출 때 겹쳐 비교하는 기준 자세 (팔다리 곧게 내림)
        'full_side': '- 1024x1536 portrait.\n' + BG + style(c) + SCALE +
        '- ONE full-body figure, pure SIDE VIEW, FACING RIGHT (face and toes point to the right), centered, with clear magenta margin all around.\n'
        '- NEUTRAL RIG REFERENCE POSE: standing straight and still, both arms hanging perfectly straight DOWN along the body (the far arm hidden '
        'behind the near arm), hands closed into fists, both legs straight and vertical, feet slightly apart front-to-back, the cape hanging '
        'straight down behind the back. NO weapon, NO sheath.\n',
        # 부위 시트: 4×2 칸 (칸 384×512). 망토(cape)는 따로 분리
        'parts_side': '- 1536x1024, an exact grid of 4 columns x 2 rows (each cell 384x512).\n' + BG +
        '- Each drawing sits centered in its own cell with a clear magenta margin; drawings must NOT touch or cross cell borders.\n'
        '- Cut-out body parts for a 2D paper-doll (cutout) rig. Arms and legs hang perfectly straight DOWN and vertical, with a flat clean cut '
        'at each joint (rounded joint caps so rotation hides seams).\n' + SAME + style(c) + SCALE +
        'Every part is a pure SIDE VIEW, FACING RIGHT.\nCells, left to right, top to bottom:\n'
        'Row 1: 1. HEAD  2. TORSO  3. HIPS  4. CAPE\nRow 2: 5. UPPER ARM  6. FOREARM + HAND  7. THIGH  8. SHIN + BOOT\n' +
        ''.join(f' {k}: {c["parts"][k]}\n' for k in CELLS),
        'weapon': '- 1024x1536 portrait.\n' + BG + SAME + style(c) + SCALE +
        '- ONE weapon only, VERTICAL, pointing straight DOWN, handle/grip at the TOP, centered with clear magenta margin.\n'
        f'- WEAPON: {c["weapon"]}\n',
    }
    if c.get('death'):
        p['death'] = ('- 1536x1024, an exact grid of 2 columns x 2 rows (each cell 768x512).\n' + BG +
            '- Each drawing sits in its own cell with clear magenta margin and its feet/body resting on the BOTTOM of the cell area '
            '(about 40 px above the cell bottom). Drawings must NOT cross cell borders.\n' + SAME + style(c) +
            '- Scale: smaller, the standing figure would be about 440 px tall (same proportions as the reference).\n'
            '- A 4-frame DEATH animation, pure SIDE VIEW, the character FACES RIGHT and is struck from the right, so falls BACKWARD (to the left).\n'
            ' 1. (top-left) HIT: body jolts backward, chest pushed back, head snapping back, arms flung loose, the headgear starting to lift off.\n'
            ' 2. (top-right) KNEES BUCKLE: dropping to the knees, torso leaning back, arms limp, the headgear falling away behind.\n'
            ' 3. (bottom-left) FALLING: body falling backward toward the ground at about 45 degrees, cape spread.\n'
            ' 4. (bottom-right) LYING: lying flat on the back on the ground, limbs relaxed, the headgear on the ground beside the head, '
            'cape spread under the body. Long and low, fits the cell width.\n'
            '- NO blood pools, NO weapon. Keep the SD proportions of the reference (big head, short limbs).\n')
    return p


if __name__ == '__main__':
    ids = sys.argv[1:] or list(CHARS)
    for cid in ids:
        d = os.path.join(ROOT, cid)
        os.makedirs(d, exist_ok=True)
        for name, body in prompts(CHARS[cid]).items():
            with open(os.path.join(d, f'prompt_{name}.txt'), 'w', encoding='utf-8', newline='\n') as f:
                f.write(HEAD.format(name=name) + body)
        print(cid, list(prompts(CHARS[cid])))
