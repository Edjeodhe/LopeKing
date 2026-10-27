// 유니티로 옮길 데이터 내보내기 (node tools/export_unity.mjs)
// 웹 프로토의 모션(anim.js 함수)·수치(player/enemies/boss)를 그대로 돌려서 JSON 으로 뽑는다 →
// 유니티는 이 JSON 을 읽어 같은 각도·같은 타이밍으로 리그를 움직이면 됨 (코드를 다시 짤 필요 없음)
// 출력: data/unity/motions.json · data/unity/tuning.json
import { writeFileSync, mkdirSync } from 'node:fs';
import * as A from '../src/anim.js';
import { ZERO } from '../src/rig.js';
import { TUNE } from '../src/player.js';
import { KINDS } from '../src/enemies.js';
import { BOSS } from '../src/boss.js';

const KEYS = Object.keys(ZERO);
const round = v => Math.round(v * 100) / 100;
const pose = p => { const o = {}; for (const k of KEYS) if (typeof p[k] === 'number' && p[k] !== 0) o[k] = round(p[k]); return o; };
// 시간 함수 → 프레임 배열 (fps 로 끊어 저장)
const sample = (fn, len, fps) => Array.from({ length: Math.round(len * fps) }, (_, i) => pose(fn(i / fps)));

const motions = {
  _doc: '뼈 각도(도). 팔다리 0 = 곧게 아래, + = 앞(보는 쪽). torso/head + = 앞으로 숙임. rot = 몸 전체 회전(+ 등 쪽). 없는 키 = 0. 망토(cape)는 물리라 모션에 없음 (anim.js stepCape 를 옮길 것)',
  keys: KEYS,
  idle: { fps: 12, loop: true, frames: sample(t => A.idle(t), 3.2, 12) },
  run: { fps: A.RUN_FRAMES, loop: true, note: '한 바퀴 = 8장, 재생 속도는 달리는 속도/70 (player.js runPh)', frames: Array.from({ length: A.RUN_FRAMES }, (_, i) => pose(A.run(i / A.RUN_FRAMES))) },
  // 주인공(도깨비 가면 폼) 전용 대기·달리기 — 적·보스는 위 idle·run
  heroIdle: { fps: 12, loop: true, frames: sample(t => A.heroIdle(t), 3.2, 12) },
  heroRun: { fps: A.RUN_FRAMES, loop: true, note: '재생 속도 = max(달리는 속도, 110)/70 (player.js runPh)', frames: Array.from({ length: A.RUN_FRAMES }, (_, i) => pose(A.heroRun(i / A.RUN_FRAMES))) },
  heroAir: { note: 'A.heroAir(vy): 세로 속도(px/s)로 솟음(-300) · 꼭대기(0) · 떨어짐(+300) 세 자세를 섞음', table: Object.fromEntries([-300, -150, 0, 150, 300].map(v => [`vy${v}`, pose(A.heroAir(v))])) },
  poses: Object.fromEntries(['IDLE', 'JUMP', 'FALL', 'LAND', 'WALL', 'CLING', 'DASH', 'HURT', 'ZIP'].map(n => [n, pose(A[n])])),
  // 베기: 겨눈 방향(aim, 뼈 기준 90 = 정면 수평, 180 = 위)마다 · dir 1 = 위→아래, -1 = 아래→위. 30fps
  slash: {
    fps: A.ATTACK_FPS, timing: A.SLASH, note: '판정은 wind ~ wind+act 동안 (main.js stepCombat)',
    variants: Object.fromEntries([0, 45, 90, 135, 180].flatMap(aim => [1, -1].map(dir => [`aim${aim}_dir${dir}`, sample(t => A.slash(t, aim, dir), A.slashLen(), A.ATTACK_FPS)]))),
  },
  // 콤보 4타 (가로 베기 → 역방향 가로 → 올려 베기 → 회전 마무리). 겨눈 방향(aim)마다 · 30fps
  // swLen = 칼 길이 배율(눕힌 칼은 짧게) · swBack = 1 이면 칼을 몸 뒤 층에 · turn = 1 이면 그 프레임만 반대쪽을 보고 그림
  combo: {
    fps: A.ATTACK_FPS, window: A.COMBO_WINDOW,
    note: '공격이 끝나기 전(cd 가 풀린 뒤)이나 끝난 뒤 window 초 안에 다시 누르면 다음 타, 놓치면 1타. 판정·이펙트는 wind ~ wind+act (main.js stepCombat · comboFx). 이펙트 그림 = art/fx/fx_slash.png',
    moves: A.COMBO.map((m, i) => ({
      ...m, cd: round(A.moveCd(m, i)),
      variants: Object.fromEntries((i === 3 ? [90] : [45, 90, 135]).map(aim => [`aim${aim}`,
        Array.from({ length: Math.round(A.moveLen(m) * A.ATTACK_FPS) }, (_, k) => { const q = A.comboPose(i, k / A.ATTACK_FPS, aim); return { ...pose(q), ...(q.turn ? { turn: 1 } : {}) }; })])),
    })),
  },
  // 로프 매달림: 로프 방향(ang, 뼈 기준)과 흔들림(swing -1~1)으로 섞음
  hang: {
    note: 'A.hang(ang, swing, reel): ang 120~240 을 30도마다, swing -1/0/1',
    table: Object.fromEntries([120, 150, 180, 210, 240].flatMap(ang => [-1, 0, 1].map(sw => [`ang${ang}_sw${sw}`, pose(A.hang(ang, sw, false))]))),
  },
};

const tuning = {
  _doc: '단위: 게임 px(480×270 화면 기준), 초. 물리는 120Hz 고정 스텝. 유니티에서는 1 유닛 = 16px(타일 한 칸)로 두면 편함',
  player: TUNE,
  enemies: KINDS,
  boss: BOSS,
  screen: { w: 480, h: 270, tile: 16, physicsHz: 120, supersample: 4 },
};

mkdirSync('data/unity', { recursive: true });
writeFileSync('data/unity/motions.json', JSON.stringify(motions, null, 1));
writeFileSync('data/unity/tuning.json', JSON.stringify(tuning, null, 1));
console.log('data/unity/motions.json', Object.keys(motions.slash.variants).length, 'slash variants');
console.log('data/unity/tuning.json');
