// 로그라이크 한 판(런): 스컬식. 방을 하나씩 깨고, 방의 적을 다 잡으면 끝자리에 상자 + 다음 방 문 2개.
// 방 종류(=상자 보상) 3가지: 가면 · 골드 · 아이템. 중간에 쉬어가는 곳(주막: 체력·아이템·가면을 골드로 삼), 끝에 보스.
// 가면은 하나만 씀 — 새 가면을 쓰면 쓰던 건 바닥에 떨어지고, 안 쓰는 가면·아이템은 분해하면 골드.
// 죽으면 처음부터 (영구 성장 없음).

// 등급 (스컬: 일반·희귀·고유·전설). 가면 피해 보너스 · 분해 골드 · 주막 값
export const GRADES = [
  { name: '일반', col: '#c9c1d4', dmg: 0, scrap: 15, price: 60 },
  { name: '희귀', col: '#5ab0ff', dmg: 0.15, scrap: 35, price: 100 },
  { name: '고유', col: '#c07aff', dmg: 0.3, scrap: 70, price: 160 },
  { name: '전설', col: '#ffb040', dmg: 0.5, scrap: 130, price: 260 },
];
const GRADE_W = [50, 30, 15, 5];   // 떨어질 확률 (%)

// 가면 = 혼령 폼. 전부 도깨비 컨셉, 몸·무기·기술이 통째로 바뀜 (그림: art/<art>, 없으면 기본 도깨비 그림을 tint 로 물들임)
// atk: 평타 — hits 콤보 타수 · speed 동작 빠르기 · dmg 한 타 피해 · reach 범위 배율 · ranged = 도깨비불 투척
// airDash: 공중 대시 횟수 · skill: F(적 근처) 기술 · skillCd 초 · fx: 이펙트 색 (주인공 기본 초록)
export const MASKS = {
  dokkaebi: { name: '도깨비', kind: '균형', art: 'art/dokkaebi', tint: null, fx: '#3ee08a',
    atk: { hits: 4, speed: 1, dmg: 1, reach: 1 }, airDash: 1, skill: 'gwibo', skillCd: 5,
    desc: ['가로 베기 4타 콤보', '기술: 귀보 — 표식 적을 연달아 벰'] },
  fire: { name: '불 도깨비', kind: '힘', art: 'art/dokkaebi_fire', tint: [255, 120, 40, 0.35], fx: '#ff8a3a',
    atk: { hits: 3, speed: 0.72, dmg: 2.2, reach: 1.3 }, airDash: 1, skill: 'quake', skillCd: 6,
    desc: ['방망이 3타 · 느리지만 한 방이 큼', '기술: 내리찍기 — 둘레에 불기둥'] },
  water: { name: '물 도깨비', kind: '속도', art: 'art/dokkaebi_water', tint: [40, 200, 210, 0.35], fx: '#5af0ff',
    atk: { hits: 5, speed: 1.45, dmg: 0.7, reach: 0.9 }, airDash: 2, skill: 'mist', skillCd: 5,
    desc: ['쌍낫 5타 · 빠름 · 대시 2번', '기술: 물안개 — 둘레 적을 연달아 벰'] },
  moon: { name: '달 도깨비', kind: '주술', art: 'art/dokkaebi_moon', tint: [190, 150, 255, 0.35], fx: '#c79bff',
    atk: { hits: 3, speed: 1.1, dmg: 1, reach: 1, ranged: true }, airDash: 1, skill: 'wisps', skillCd: 5,
    desc: ['도깨비불을 던지는 원거리 평타', '기술: 도깨비불 다섯 개가 적을 쫓음'] },
};
export const DROP_MASKS = ['fire', 'water', 'moon'];   // 가면 방에서 나오는 것 (사용자: 세 가면 중 하나 랜덤)

// 각인 (스컬 각인): 같은 각인 아이템이 2 · 4개면 효과
export const TAGS = {
  쇠: { col: '#9aa4b8', at: [[2, { dmg: 0.1 }], [4, { dmg: 0.3 }]], txt: ['피해 +10%', '피해 +30%'] },
  바람: { col: '#8af0c0', at: [[2, { move: 0.1 }], [4, { atkSpeed: 0.2, move: 0.1 }]], txt: ['이동 +10%', '공격 속도 +20%'] },
  혼불: { col: '#3ee08a', at: [[2, { skillCd: 0.15 }], [4, { skillCd: 0.35 }]], txt: ['기술 쿨타임 -15%', '기술 쿨타임 -35%'] },
  피: { col: '#ff5a5a', at: [[2, { heal: 0.05 }], [4, { heal: 0.15 }]], txt: ['처치 시 5% 회복', '처치 시 15% 회복'] },
  재물: { col: '#f0c060', at: [[2, { gold: 0.2 }], [4, { gold: 0.5 }]], txt: ['골드 +20%', '골드 +50%'] },
  생명: { col: '#ff9ab0', at: [[2, { hp: 1 }], [4, { hp: 2 }]], txt: ['최대 체력 +1', '최대 체력 +2'] },
  달: { col: '#c79bff', at: [[2, { crit: 0.1 }], [4, { crit: 0.25 }]], txt: ['치명타 +10%', '치명타 +25%'] },
};

// 아이템: 지니고 있으면 늘 효과 (스탯). g = 등급(0~3). desc 는 한 줄 (화면 16px 글꼴)
export const ITEMS = {
  blade: { name: '부러진 칼끝', g: 0, tags: ['쇠', '피'], st: { dmg: 0.15 }, desc: '피해 +15%' },
  sandal: { name: '닳은 짚신', g: 0, tags: ['바람'], st: { move: 0.12 }, desc: '이동 속도 +12%' },
  coins: { name: '엽전 꾸러미', g: 0, tags: ['재물'], st: { gold: 0.25 }, desc: '골드 +25%' },
  yakgwa: { name: '약과', g: 0, tags: ['생명'], st: { hp: 1 }, desc: '최대 체력 +1' },
  lamp: { name: '혼불 등잔', g: 1, tags: ['혼불'], st: { skillCd: 0.25 }, desc: '기술 쿨타임 -25%' },
  charm: { name: '피 묻은 부적', g: 1, tags: ['피', '혼불'], st: { heal: 0.1 }, desc: '처치 시 10% 확률 체력 1' },
  feather: { name: '바람 깃', g: 1, tags: ['바람'], st: { dashCd: 0.4, airDash: 1 }, desc: '대시 쿨 -40% · 공중 대시 +1' },
  club: { name: '쇠 방망이 조각', g: 1, tags: ['쇠'], st: { dmg: 0.3, atkSpeed: -0.1 }, desc: '피해 +30% · 공격 속도 -10%' },
  drum: { name: '천둥 북', g: 1, tags: ['쇠', '바람'], st: { ropeDmg: 1 }, desc: '로프 돌진 피해 2배' },
  bead: { name: '여우 구슬', g: 2, tags: ['혼불', '달'], st: { crit: 0.2 }, desc: '치명타 20% (피해 2배)' },
  fan: { name: '삼태극 부채', g: 2, tags: ['바람', '달'], st: { atkSpeed: 0.25 }, desc: '공격 속도 +25%' },
  hellcoin: { name: '저승 엽전', g: 2, tags: ['재물', '피'], st: { gold: 0.5, killGold: 2 }, desc: '골드 +50% · 처치마다 +2' },
  scale: { name: '용왕의 비늘', g: 3, tags: ['생명', '쇠'], st: { hp: 2, iframes: 0.5 }, desc: '최대 체력 +2 · 무적 +0.5초' },
  gamtu: { name: '도깨비 감투', g: 3, tags: ['혼불'], st: { skillCd: 0.5, dmg: 0.2 }, desc: '기술 쿨 -50% · 피해 +20%' },
};
export const MAX_ITEMS = 9;

// 방 종류 (문 위에 그려지는 표시)
export const STAGE = {
  mask: { name: '가면', col: '#3ee08a' },
  gold: { name: '골드', col: '#f0c060' },
  item: { name: '아이템', col: '#5ab0ff' },
  rest: { name: '주막', col: '#ff9a50' },
  boss: { name: '보스', col: '#ff4040' },
};
// 한 판의 순서: 시작 방 → 싸움 4 → 주막 → 싸움 3 → 보스
export const PLAN = ['start', 'fight', 'fight', 'fight', 'fight', 'rest', 'fight', 'fight', 'fight', 'boss'];
export const ROOMS = ['r_yard', 'r_bridge', 'r_pavilion', 'r_wall', 'r_market', 'r_alley', 'r_gate'];

const pick = a => a[Math.floor(Math.random() * a.length)];
// 등급 뽑기: 0~3 (가중치 GRADE_W, bonus 만큼 위 등급 쪽으로)
function gradeRoll(bonus = 0) {
  const w = GRADE_W.map((v, i) => Math.max(1, v + (i ? bonus : -bonus * 3)));
  let r = Math.random() * w.reduce((a, b) => a + b);
  for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i;
  return 0;
}

export function newRun() {
  return {
    step: 0, mask: { id: 'dokkaebi', g: 0 }, items: [], gold: 0, kills: 0, rooms: [],
    used: [],          // 이번 판에 나온 방 (겹치지 않게)
    stage: 'start',    // 지금 방 종류 (mask·gold·item = 상자 보상)
    started: 0,
  };
}
// 다음 방 이름 (같은 판에 겹치지 않게, 다 쓰면 다시)
export function nextRoom(run) {
  const kind = PLAN[run.step];
  if (kind !== 'fight') return 'r_' + kind;
  let pool = ROOMS.filter(r => !run.used.includes(r));
  if (!pool.length) { run.used = []; pool = ROOMS; }
  const r = pick(pool); run.used.push(r); return r;
}
// 이 방을 깨면 나오는 문 (다음 방 종류). 다음이 주막·보스면 문 하나
export function doorChoices(run) {
  const next = PLAN[run.step + 1];
  if (!next) return [];
  if (next !== 'fight') return [next];
  const kinds = ['mask', 'gold', 'item'];
  const a = pick(kinds), b = pick(kinds.filter(k => k !== a));
  return [a, b];
}
// 방이 깊을수록 적이 단단해짐
export const depthHp = run => 1 + Math.max(0, run.step - 1) * 0.12;

// 보상: 상자 안
export function rollMask(run, exclude = []) {
  const pool = DROP_MASKS.filter(m => m !== run.mask.id && !exclude.includes(m));
  return { type: 'mask', id: pick(pool.length ? pool : DROP_MASKS), g: gradeRoll(run.step * 2) };
}
export function rollItem(run, exclude = []) {
  const g = gradeRoll(run.step * 2);
  const have = new Set([...run.items, ...exclude]);
  let pool = Object.keys(ITEMS).filter(k => !have.has(k) && ITEMS[k].g === g);
  if (!pool.length) pool = Object.keys(ITEMS).filter(k => !have.has(k));
  if (!pool.length) return null;
  return { type: 'item', id: pick(pool) };
}
export const goldAmount = run => Math.round((70 + Math.random() * 40) * (1 + run.step * 0.1));

// 값 · 분해 골드
export const gradeOf = o => o.type === 'mask' ? o.g : ITEMS[o.id].g;
export const priceOf = o => o.type === 'heal' ? o.price : Math.round(GRADES[gradeOf(o)].price * (o.type === 'mask' ? 1.5 : 1));
export const scrapOf = o => Math.round(GRADES[gradeOf(o)].scrap * (o.type === 'mask' ? 1.4 : 1));
export const nameOf = o => o.type === 'mask' ? MASKS[o.id].name : o.type === 'item' ? ITEMS[o.id].name : o.name;

// 각인 개수
export function tagCounts(run) {
  const n = {};
  for (const k of run.items) for (const t of ITEMS[k].tags) n[t] = (n[t] || 0) + 1;
  return n;
}
// 지금 능력치: 가면 + 아이템 + 각인 (더하기)
export function statsOf(run) {
  const s = { dmg: 0, atkSpeed: 0, move: 0, gold: 0, hp: 0, skillCd: 0, heal: 0, crit: 0, dashCd: 0, airDash: 0, iframes: 0, ropeDmg: 0, killGold: 0 };
  const add = o => { for (const k in o) s[k] += o[k]; };
  s.dmg += GRADES[run.mask.g].dmg;
  for (const k of run.items) add(ITEMS[k].st);
  const n = tagCounts(run);
  for (const t in n) for (const [c, o] of TAGS[t].at) if (n[t] >= c) add(o);
  s.skillCd = Math.min(0.75, s.skillCd);
  return s;
}
