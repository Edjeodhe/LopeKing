# 유니티 이전 설계 (웹 프로토 → Unity)

웹 프로토(`src/*.js`)가 기준 구현이다. 유니티로 옮길 때 **데이터는 그대로 읽고, 규칙(코드)은 1:1로 옮긴다.**
옮길 데이터는 전부 JSON·PNG라 변환기가 필요 없다.

## 1. 그대로 가져가는 데이터
| 파일 | 내용 | 유니티 위치(제안) |
|---|---|---|
| `art/<id>/rig.json` | 리그: 칸 크기·축척·부위별 pivot/joints·무기 grip/tip·사망 컷 | `Assets/Resources/Rig/<id>.json` |
| `art/<id>/parts/*.png` · `weapon_cut.png` · `death/*.png` | 부위 그림 (칸 512×640, 크롭 안 함 → 좌표 = 칸 px) | `Assets/Resources/Characters/<id>/` (Read/Write 켜기, 필터 Bilinear, 압축 없음) |
| `levels/*.json` | 맵: 사각형 채우기 + 점 배치 + 문(gates) | `Assets/Resources/Levels/` → 타일맵으로 찍는 로더 |
| `data/unity/motions.json` | 모션 각도 프레임 (`node tools/export_unity.mjs` 로 다시 뽑음) | `Assets/Resources/Motions.json` |
| `data/unity/tuning.json` | 이동·로프·적·보스 수치 | ScriptableObject 로 읽어 들임 |
| `art/fonts/neodgm.woff2` | 네오둥근모(OFL) | TMP 폰트 에셋 (16px 배수로만) |

`motions.json`·`tuning.json`은 웹 코드에서 **뽑아낸 결과**다. 웹에서 모션·수치를 고친 뒤 다시 내보내면 유니티도 같은 값을 쓴다.

## 2. 좌표·단위
- 게임 px 기준: 화면 480×270, 타일 16px, y 아래로 +. 유니티는 **1 유닛 = 16px(타일 한 칸)**, y 위로 + → 읽을 때 y 뒤집기
- 캐릭터 위치 = 발 가운데. 충돌 상자 주인공 10×26px, 구울 10×24, 보스 26×62
- 물리 120Hz 고정 스텝 → `Time.fixedDeltaTime = 1/120`. 수치(`tuning.json`)는 px/s, px/s² 그대로 → 16으로 나눠 유닛으로

## 3. 리그 (rig.js → `CutoutRig.cs`)
- 부위마다 `Transform` 하나, 부모 관계: hips(뿌리) → torso → head·cape·팔 / hips → 다리
- `rig.json parts[n]`: `pivot`(부모에 붙는 점) · `joints`(자식이 붙는 점), 단위 칸 px. 부위 스프라이트의 pivot = `pivot / cell`
- 자식 위치 = `(joint - pivot) * scale`. `scale`(칸 px → 게임 px) × `size`(부위 배율) × 종류 배율(보스 1.9)
- 각도: 팔다리 `R(d) = -d°` (0 = 아래, + = 보는 쪽), 몸통·머리는 반대 부호. 좌우는 루트 스케일 x = facing
- 엉덩이 높이 = 허벅지(무릎-피벗) + 정강이(발바닥-피벗) + 엉덩이 관절 높이 → 발이 늘 땅에 닿게 루트를 올림 (`hipHeight`)
- 레이어 순서: `rig.js LAYERS` 표 그대로 sortingOrder 로 (먼 팔 10 · 망토 15 · 먼 다리 20 · 몸 30 · 엉덩이 40 · 가까운 다리 50(코트 캐릭터 25) · 머리 60 · 가까운 위팔 70 · 칼 75 · 아래팔 80)
- 먼 쪽 팔다리는 어둡게 한 사본(`darken 0.38`) → 머티리얼 색 곱하기로
- 망토: 그림을 세로 3마디로 나눠 마디마다 각도 (`anim.js stepCape` 스프링 물리 그대로, 6도 단위로 끊음)
- 소켓: 칼끝(blade.tip)·손(hand·offHand)·발·머리·허리 위치를 매 프레임 기록 → 칼끝 궤적·잘린 조각·로프 시작점에 씀
- 잘린 조각(gore): `pose.only / hide`(부위·묶음 upper/lower/nearArm/farArm) 로 그 부위만 렌더 → 별도 렌더 텍스처

## 4. 픽셀 굽기 = 셰이더 (bake.js → 렌더 텍스처 + 셰이더)
캐릭터마다: 리그를 **SS(4)배 해상도 렌더 텍스처**에 그림 → 아래 순서로 1배로 줄임. AI 그림이 직접 픽셀이 되지 않고 이 규칙으로만 픽셀이 생긴다.
1. 4×4 박스 평균 (알파 가중) — 앞 2×2 는 GPU bilinear 반 축소로
2. 알파 이진화: 덮인 비율 ≥ 50% 면 칠함, 아니면 투명
3. 채도 `sat` 배율
4. 팔레트 양자화: 캐릭터 부위 색을 k-means(14~18색, 결정적 시드) → 가장 가까운 색 (지각 가중 거리 2R²+4G²+3B²)
5. 셀 음영: 가장자리까지 거리(chamfer) → 바깥 방향 · 빛(오른쪽 위) 내적 → 2~3단 띠(그림자 = 차가운 보라, 밝음 = 따뜻한 빛), 발밑 AO 1줄
6. 환경색 물들이기 `tint`
7. 외곽선: 빈 칸 중 4방향 이웃이 칠해진 곳 = 이웃 색을 어둡게 + 보랏빛 (선택적 외곽선)
8. 맞았을 때 흰색(flash)
- 유니티 구현: 컴퓨트 셰이더 한 장(1~2, 3~6, 7)이 쉬움. 팔레트는 캐릭터마다 텍스처 한 줄
- 이펙트도 같은 규칙: 1px 도트, 반투명 없음, 사라질 땐 체크무늬

## 5. 조명 (light.js)
- 화면 크기 버퍼에 환경색 채움 → 빛마다 띠 4단 도트 원(lighten) → 화면에 **곱하기**, 번짐(glow)은 **더하기** 한 겹
- 유니티: 2D URP 라이트 대신 같은 방식의 풀스크린 패스 (띠·체크무늬 유지가 중요)

## 6. 게임 규칙 옮길 순서 (제안)
1. 레벨 로더(json → Tilemap, 타일 종류: 돌·기와·쇠벽·대나무·발판·가시·문) + 충돌 (world.js `move` 축 분리 이동)
2. 주인공 이동 (player.js: 코요테 0.08, 점프 버퍼 0.11, 누른 만큼 점프 0.45배 끊기, 벽 미끄럼·벽 점프, 대시 무적)
3. 리그 + 모션 재생 (`motions.json`) + 굽기 셰이더
4. 로프 쿠나이: fly(1300px/s, 230px) → stuck(벽 법선 기록) → zip(1050px/s, 지나간 구간 적 베기) / tether(진자 = 길이 제약 + 바깥 속도 제거) → 도착 면에 따라 벽 매달림 0.6초·천장 0.35초
5. 전투: 마우스 방향 부채꼴(반지름 36, ±77°), 타격 멈춤 0.05~0.1초, 슬로모션, 총알 되받아치기
6. 적 AI (enemies.js) · 보스 상태 기계 (boss.js: 예고 → 공격 → 빈틈, 2페이즈 1.3배)
7. gore · fx(칼끝 궤적·고리 앞뒤 반·피 자국 decal) · 조명 · 소리(sfx/music 은 코드 합성 → 유니티에선 실제 음원으로 교체 권장)

## 7. 그림 파이프라인은 그대로 유지
새 캐릭터는 웹 쪽에서 뽑고 맞춘다: `tools/char_prompts.py` → `sh tools/gen_char.sh <id>` → `python tools/slice_char.py art/<id>` → 리그 편집기 자동 맞춤·저장 → 결과(rig.json + PNG)를 유니티로 복사.
