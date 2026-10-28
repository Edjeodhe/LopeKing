// 타일 월드: 충돌 · 로프 레이캐스트 · 한쪽 발판 · 가시 · 갈고리 고리.
// 맵은 그림이 아니라 데이터(levels/*.json: 사각형 채우기 + 점 배치)로 짓는다 → 같은 데이터를 유니티 타일맵으로 옮길 수 있게.
export const TILE = 16;
const POLE_NEAR = 20;
const MOVE_STEP = 6;   // 한 번에 이보다 많이 움직이면 잘게 나눠 감 (빠른 귀보 2600px/s = 한 스텝 22px 가 타일 16px 을 건너뛰어 벽 속에 끼던 것)   // 쿠나이가 대나무 줄기에 꽂히는 최소 거리 (손 바로 옆 줄기는 지나침 — 로프 최소 길이 hookMin 18 쯤)

// 타일 종류. hook = 로프가 박히는가
export const T = {
  EMPTY: 0,
  ROCK: 1,     // '#' 돌·벽 (로프 O)
  BRICK: 2,    // 'B' 기와·벽돌 (로프 O)
  PLANK: 3,    // '=' 나무 발판: 위에서만 밟힘 (로프 X)
  SPIKE: 4,    // '^' 가시: 닿으면 피해
  METAL: 5,    // 'M' 쇠벽: 로프 안 박힘 (막힘만)
  BAMBOO: 6,   // 'Z' 대나무 줄기: 몸은 통과, 쿠나이만 꽂힘 → 돌진하면 줄기를 붙잡고 매달림 (어느 쪽으로든 다시 던짐)
  GATE: 7,     // 문: 보스 방에 들어서면 닫힘 (로프 X)
};
const CH = { '#': T.ROCK, B: T.BRICK, '=': T.PLANK, '^': T.SPIKE, M: T.METAL, Z: T.BAMBOO, '.': T.EMPTY };
export const SOLID = t => t === T.ROCK || t === T.BRICK || t === T.METAL || t === T.GATE;
export const HOOKABLE = t => t === T.ROCK || t === T.BRICK || t === T.BAMBOO;

export class World {
  // def = { w, h, fill?: '#', rects: [[x, y, w, h, ch]], points: [[x, y, kind, opts?]] }
  constructor(def) {
    this.def = def;
    this.w = def.w; this.h = def.h;
    this.t = new Uint8Array(this.w * this.h);
    for (const [x, y, w, h, ch] of def.rects) {
      const v = CH[ch] ?? T.ROCK;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.t[j * this.w + i] = v;
    }
    // 점: 'player' 시작, 'ring' 갈고리 고리, 적('grunt'·'gunner'), 'exit', 'lamp' …
    this.rings = []; this.spawns = []; this.lamps = [];
    for (const [x, y, kind, o] of def.points) {
      const px = x * TILE + TILE / 2, py = (y + 1) * TILE;   // 타일 발밑 가운데
      if (kind === 'ring') this.rings.push({ x: px, y: y * TILE + TILE / 2 });
      else if (kind === 'lamp') this.lamps.push({ x: px, y: y * TILE + TILE / 2 });
      else this.spawns.push({ kind, x: px, y: py, ...(o || {}) });
    }
    this.pw = this.w * TILE; this.ph = this.h * TILE;
    this.gates = def.gates || [];
  }
  // 문 닫기·열기 (보스 방)
  setGates(closed) {
    for (const [x, y, w, h] of this.gates) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const k = j * this.w + i;
      if (closed && !this.t[k]) this.t[k] = T.GATE;
      else if (!closed && this.t[k] === T.GATE) this.t[k] = T.EMPTY;
    }
  }
  at(i, j) { return i < 0 || i >= this.w ? T.ROCK : j < 0 || j >= this.h ? T.EMPTY : this.t[j * this.w + i]; }
  atPx(x, y) { return this.at(Math.floor(x / TILE), Math.floor(y / TILE)); }
  solidPx(x, y) { return SOLID(this.atPx(x, y)); }

  // 상자 움직이기 (축마다 따로). e = { x, y(발), w, h, vx, vy, drop }. 결과: e.onGround · e.wall(-1|0|1) · e.ceil
  // 많이 움직이면 MOVE_STEP 씩 나눠 감: 벽에 막힌 축은 거기서 멈추고 나머지 축만 마저 감
  move(e, dx, dy) {
    const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MOVE_STEP);
    if (n <= 1) return this.moveStep(e, dx, dy);
    let wall = 0, ceil = false, hx = true, hy = true;
    for (let k = 0; k < n; k++) {
      this.moveStep(e, hx ? dx / n : 0, hy ? dy / n : 0);
      if (e.wall) { wall = e.wall; hx = false; }
      if (e.ceil || (dy > 0 && e.onGround)) { ceil ||= e.ceil; hy = false; }
    }
    e.wall = wall; e.ceil = ceil;
    return e;
  }
  // 벽 속에 끼었으면 가장 가까운 빈자리로 꺼냄 (옆 → 위 → 아래 순, 32px 까지)
  unstick(e) {
    if (!this.overlaps(e)) return false;
    const x0 = e.x, y0 = e.y;
    for (let d = 2; d <= 32; d += 2) {
      for (const [ox, oy] of [[d, 0], [-d, 0], [0, -d], [0, d], [d, -d], [-d, -d]]) {
        e.x = x0 + ox; e.y = y0 + oy;
        if (!this.overlaps(e)) return true;
      }
    }
    e.x = x0; e.y = y0;
    return false;
  }
  overlaps(e) {
    for (let j = Math.floor((e.y - e.h + 0.01) / TILE); j <= Math.floor((e.y - 0.01) / TILE); j++)
      for (let i = Math.floor((e.x - e.w / 2 + 0.01) / TILE); i <= Math.floor((e.x + e.w / 2 - 0.01) / TILE); i++)
        if (SOLID(this.at(i, j))) return true;
    return false;
  }
  moveStep(e, dx, dy) {
    e.wall = 0; e.ceil = false;
    const wasGround = e.onGround; e.onGround = false;
    // 가로
    if (dx) {
      e.x += dx;
      const top = e.y - e.h + 0.01, bot = e.y - 0.01;
      const side = dx > 0 ? e.x + e.w / 2 : e.x - e.w / 2;
      const i = Math.floor(side / TILE);
      for (let j = Math.floor(top / TILE); j <= Math.floor(bot / TILE); j++) {
        if (!SOLID(this.at(i, j))) continue;
        e.x = dx > 0 ? i * TILE - e.w / 2 - 0.001 : (i + 1) * TILE + e.w / 2 + 0.001;
        e.wall = dx > 0 ? 1 : -1; e.vx = 0;
        break;
      }
    }
    // 세로
    if (dy) {
      const prevBot = e.y;
      e.y += dy;
      const l = e.x - e.w / 2 + 0.01, r = e.x + e.w / 2 - 0.01;
      if (dy > 0) {
        const j = Math.floor((e.y - 0.001) / TILE);
        for (let i = Math.floor(l / TILE); i <= Math.floor(r / TILE); i++) {
          const t = this.at(i, j);
          const oneWay = t === T.PLANK && prevBot <= j * TILE + 0.5 && !e.drop;
          if (!SOLID(t) && !oneWay) continue;
          e.y = j * TILE; e.vy = 0; e.onGround = true; e.groundTile = t;
          break;
        }
      } else {
        const j = Math.floor((e.y - e.h) / TILE);
        for (let i = Math.floor(l / TILE); i <= Math.floor(r / TILE); i++) {
          if (!SOLID(this.at(i, j))) continue;
          e.y = (j + 1) * TILE + e.h + 0.001; e.vy = 0; e.ceil = true;
          break;
        }
      }
    }
    // 땅에 서 있었는데 움직임이 없으면 발밑 확인 (가만히 서 있어도 onGround 유지)
    if (!dy && wasGround) e.onGround = this.standing(e);
    return e;
  }
  standing(e) {
    const j = Math.floor((e.y + 0.5) / TILE);
    if (Math.abs(e.y - j * TILE) > 0.6) return false;
    for (let i = Math.floor((e.x - e.w / 2 + 0.01) / TILE); i <= Math.floor((e.x + e.w / 2 - 0.01) / TILE); i++) {
      const t = this.at(i, j);
      if (SOLID(t) || (t === T.PLANK && !e.drop)) return true;
    }
    return false;
  }
  // 옆에 벽이 붙어 있나 (벽 타기): dir = -1 왼쪽 / 1 오른쪽
  wallAt(e, dir) {
    const x = dir > 0 ? e.x + e.w / 2 + 1 : e.x - e.w / 2 - 1;
    return this.solidPx(x, e.y - e.h * 0.3) && this.solidPx(x, e.y - e.h * 0.8);
  }
  // 상자가 가시에 닿았나
  spikeHit(e) {
    for (let j = Math.floor((e.y - e.h) / TILE); j <= Math.floor((e.y - 1) / TILE); j++)
      for (let i = Math.floor((e.x - e.w / 2) / TILE); i <= Math.floor((e.x + e.w / 2) / TILE); i++)
        if (this.at(i, j) === T.SPIKE) return true;
    return false;
  }

  // 로프 레이캐스트: (x, y)에서 (dx, dy) 방향으로 len 까지. 처음 닿는 벽(hook 여부 포함)을 돌려줌
  // 타일 격자를 DDA 로 훑음 (빠르고 정확함). poles = 대나무 줄기에도 걸림 (쿠나이만. 시야·실 가림 판정은 false) — 시작 칸의 줄기는 건너뜀(붙잡고 있는 줄기)
  ray(x, y, dx, dy, len, poles = true) {
    const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    let i = Math.floor(x / TILE), j = Math.floor(y / TILE);
    const si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1;
    const tdx = Math.abs(TILE / (dx || 1e-9)), tdy = Math.abs(TILE / (dy || 1e-9));
    let tx = ((dx > 0 ? (i + 1) * TILE - x : x - i * TILE)) / Math.abs(dx || 1e-9);
    let ty = ((dy > 0 ? (j + 1) * TILE - y : y - j * TILE)) / Math.abs(dy || 1e-9);
    let d = 0, nx = 0, ny = 0;
    // 붙잡고 있는 줄기(시작 칸이 대나무면 그 세로줄 전체)는 건너뜀 — 위·아래로 던져도 제 줄기에 꽂히지 않게
    const i0 = this.at(i, j) === T.BAMBOO ? i : -999;
    while (d <= len) {
      const t = this.at(i, j);
      if (SOLID(t)) return { x: x + dx * d, y: y + dy * d, d, tile: t, hook: HOOKABLE(t), nx, ny };
      if (poles && t === T.BAMBOO && i !== i0) {
        // 줄기 가운데에 꽂힘. 가운데 줄까지 실제로 가는 경우만 — 칸 경계에 서서 위·아래로 던지면(가로 성분 0) 옆 줄기 칸에 d=0 으로 걸리던 것,
        // 손 바로 옆(POLE_NEAR 안) 줄기에 쿠나이가 손에서 바로 꽂히던 것은 지나침
        const px = i * TILE + TILE / 2, dd = Math.abs(dx) > 1e-6 ? (px - x) / dx : -1;
        if (dd >= POLE_NEAR && dd <= len) return { x: px, y: y + dy * dd, d: dd, tile: t, hook: true, pole: true, nx: 0, ny: 0 };
      }
      if (tx < ty) { d = tx; tx += tdx; i += si; nx = -si; ny = 0; }
      else { d = ty; ty += tdy; j += sj; nx = 0; ny = -sj; }
    }
    return null;
  }
  // 두 점 사이가 뚫려 있나 (적 시야)
  clear(x0, y0, x1, y1) {
    const r = this.ray(x0, y0, x1 - x0, y1 - y0, Math.hypot(x1 - x0, y1 - y0), false);
    return !r;
  }
}
