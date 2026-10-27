// 보스: 거대 망나니 구울 (art/executioner, 주인공과 같은 뼈대를 1.9배로).
// 패턴 (모두 예고 → 공격 → 빈틈):
//   내려찍기 — 칼을 머리 위로 들고(붉은 ! 깜빡임) 내리침 → 바닥을 따라 양쪽으로 충격파(뛰어 넘기)
//   휩쓸기   — 칼을 뒤로 젖혔다 몸 앞을 가로로 크게 벰 (뛰어 넘거나 대시 무적으로)
//   도약     — 주인공 자리로 뛰어올라 내려찍기 (그림자 예고)
//   2페이즈(체력 절반) — 빨라지고, 내려찍기 때 천장에서 기와·돌이 떨어짐(바닥 예고 표시), 쇠사슬 갈고리 던지기
// 빈틈: 짧은 시간에 많이 맞으면 무릎 꿇음(휘청) → 쿠나이를 꽂고 돌진하면 큰 피해. 등 뒤에 꽂은 쿠나이 돌진은 늘 2배
import * as A from './anim.js';
import { newBakeCanvas } from './actor.js';
import { blood, spark, shake, dust, ring } from './fx.js';

export const BOSS = { hp: 40, w: 26, h: 62, walk: 46, speed2: 1.3, staggerDmg: 7, staggerT: 1.8 };
const T_ = {   // 패턴 시간 (예고 · 공격 · 빈틈)
  slam: [0.75, 0.12, 0.7], sweep: [0.6, 0.14, 0.55], leap: [0.45, 0.7, 0.8], chain: [0.6, 0.5, 0.5], roar: [1.1, 0, 0],
};

export class Boss {
  constructor(type, x, y) {
    Object.assign(this, { kind: 'boss', type, x, y, w: BOSS.w, h: BOSS.h, vx: 0, vy: 0, facing: -1, onGround: false, hp: BOSS.hp, maxHp: BOSS.hp });
    this.state = 'sleep'; this.st = 0; this.t = 0; this.flashT = 0; this.dead = false; this.phase = 1;
    this.low = newBakeCanvas(260, 200, 130, 182); this.pose = { ...A.IDLE }; this.cape = A.newCape(); this.runPh = 0;
    this.recent = []; this.sock = {}; this.name = '참수터의 망나니';
    this.next = 0.8;
  }
  get cy() { return this.y - 40; }

  // 보스 방에 들어오면 깨어남 (main.js)
  wake(G) { if (this.state !== 'sleep') return; this.state = 'roar'; this.st = 0; G.sfx?.('roar'); shake(6); }

  step(dt, G) {
    if (this.dead) return;
    const W = G.world, p = G.player;
    this.t += dt; this.flashT = Math.max(0, this.flashT - dt);
    const sp = this.phase === 2 ? BOSS.speed2 : 1;
    const dx = p.x - this.x, adx = Math.abs(dx);
    this.recent = this.recent.filter(r => this.t - r.t < 2.5);
    if (this.phase === 1 && this.hp <= this.maxHp / 2) { this.phase = 2; this.state = 'roar'; this.st = 0; G.sfx?.('roar'); shake(7); }
    let want = 0;
    const T = k => T_[k].map(v => v / sp);
    this.st += dt;
    switch (this.state) {
      case 'sleep': break;
      case 'roar':
        if (this.st > T_.roar[0]) this.pick(G, dx);
        break;
      case 'walk':
        this.facing = dx > 0 ? 1 : -1;
        want = this.facing * BOSS.walk * sp;
        if ((this.next -= dt) <= 0) this.pick(G, dx);
        break;
      case 'stagger':
        if (this.st > BOSS.staggerT) { this.state = 'walk'; this.next = 0.3; }
        break;
      case 'slam': {
        const [w, a, r] = T('slam');
        if (this.st >= w && !this.did) {
          this.did = true;
          const tipX = this.x + this.facing * 52;
          G.sfx?.('bossSlam'); shake(8, 0, 5);
          dust(tipX, this.y, -1, 10); dust(tipX, this.y, 1, 10);
          ring({ x: tipX, y: this.y - 2, rx: 30, ry: 6, life: 0.3, th: 2, cols: ['#ffffff', '#ffd0a0', '#a07050', '#4a3020'] });
          // 칼끝 자리 직접 판정 + 양쪽으로 충격파
          if (Math.abs(p.x - tipX) < 26 && p.y > this.y - 40) p.hurt(G, 1, { x: tipX, y: this.y });
          G.hazards.push({ kind: 'wave', x: tipX, y: this.y, dir: 1, v: 210 * sp, t: 0, life: 1.4 });
          G.hazards.push({ kind: 'wave', x: tipX, y: this.y, dir: -1, v: 210 * sp, t: 0, life: 1.4 });
          if (this.phase === 2) for (let i = 0; i < 4; i++) G.hazards.push({ kind: 'rock', x: p.x + (i - 1.5) * 46 + (Math.random() - 0.5) * 20, y: W.def.ceilY ?? (this.y - 200), vy: 0, warn: 0.7 + i * 0.12, t: 0 });
        }
        if (this.st >= w + a + r) this.recover();
        break;
      }
      case 'sweep': {
        const [w, a, r] = T('sweep');
        if (this.st >= w && this.st < w + a) {
          if (!this.did) { this.did = true; G.sfx?.('bossSwing'); this.vx = this.facing * 160; }
          // 몸 앞 넓게, 허리 높이 (뛰어 넘으면 피함)
          const fx = this.x + this.facing * 40;
          if (Math.abs(p.x - fx) < 50 && p.y > this.y - 34) p.hurt(G, 1, this);
        }
        if (this.st >= w + a + r) this.recover();
        break;
      }
      case 'leap': {
        const [w, a, r] = T('leap');
        if (this.st >= w && !this.did) {
          this.did = true;
          const tx = Math.max(this.arena[0] + 30, Math.min(this.arena[1] - 30, p.x));
          this.vx = (tx - this.x) / a; this.vy = -480; this.leapX = tx; G.sfx?.('bossJump');
        }
        if (this.did && !this.landed && this.st > w + 0.1 && this.onGround) {
          this.landed = true; this.vx = 0;
          G.sfx?.('bossSlam'); shake(9, 0, 6);
          dust(this.x - 10, this.y, -1, 12); dust(this.x + 10, this.y, 1, 12);
          if (Math.abs(p.x - this.x) < 46 && p.y > this.y - 50) p.hurt(G, 1, this);
          G.hazards.push({ kind: 'wave', x: this.x, y: this.y, dir: 1, v: 240 * sp, t: 0, life: 1.2 });
          G.hazards.push({ kind: 'wave', x: this.x, y: this.y, dir: -1, v: 240 * sp, t: 0, life: 1.2 });
        }
        if (this.landed && this.st >= w + a + r) this.recover();
        if (this.st > 4) this.recover();
        break;
      }
      case 'chain': {
        const [w, a, r] = T('chain');
        if (this.st < w) this.aimAng = Math.atan2(p.cy - (this.y - 50), p.x - this.x);
        if (this.st >= w && !this.did) {
          this.did = true; G.sfx?.('rope');
          G.hazards.push({ kind: 'chain', x: this.x + this.facing * 20, y: this.y - 50, a: this.aimAng, d: 0, t: 0, owner: this });
        }
        if (this.st >= w + a + r) this.recover();
        break;
      }
    }
    if (this.state !== 'leap' || !this.did) this.vx += Math.max(-900 * dt, Math.min(900 * dt, want - this.vx));
    this.vy = Math.min(600, this.vy + 900 * dt);
    W.move(this, this.vx * dt, this.vy * dt);
    if (this.arena) this.x = Math.max(this.arena[0] + this.w / 2, Math.min(this.arena[1] - this.w / 2, this.x));
    // 몸에 닿으면 밀려남
    if (this.state !== 'sleep' && this.state !== 'stagger' && !p.dead && Math.abs(p.x - this.x) < this.w / 2 + 4 && p.y > this.y - this.h && p.y - p.h < this.y) p.hurt(G, 1, this);
  }

  pick(G, dx) {
    const adx = Math.abs(dx), r = Math.random();
    this.did = false; this.landed = false; this.st = 0;
    this.facing = dx > 0 ? 1 : -1;
    if (adx > 150) this.state = r < 0.55 ? 'leap' : this.phase === 2 && r < 0.85 ? 'chain' : 'walk';
    else if (adx < 70) this.state = r < 0.55 ? 'sweep' : 'slam';
    else this.state = r < 0.4 ? 'slam' : r < 0.7 ? 'leap' : this.phase === 2 ? 'chain' : 'walk';
    if (this.state === 'walk') this.next = 0.6 + Math.random() * 0.6;
    else G.sfx?.('alert');
  }
  recover() { this.state = 'walk'; this.st = 0; this.next = (this.phase === 2 ? 0.35 : 0.7) + Math.random() * 0.4; }

  // 맞음: hit.kind = slash | zip | bullet. 등 뒤에서 맞으면 2배. 휘청 중엔 2배
  damage(G, dmg, hit) {
    if (this.dead || this.state === 'sleep') return;
    if (dmg > 10) dmg = 3;   // 쿠나이 관통(즉사용 99)은 보스에겐 3
    const back = Math.sign(Math.cos(hit.ang)) === this.facing;   // 맞은 방향이 보스가 보는 쪽 = 등 뒤에서 옴
    if (back) dmg *= 2;
    this.shudder = 0.2;   // 맞은 몸 떨림
    if (this.state === 'stagger') dmg *= 2;
    this.hp -= dmg; this.flashT = 0.08;
    blood(this.x - Math.cos(hit.ang) * 6, this.cy, hit.ang, 10 + dmg * 3, 1);
    this.recent.push({ t: this.t, d: dmg });
    G.sfx?.(back ? 'crit' : 'hit');
    if (back) { spark(this.x, this.cy, hit.ang, 12, { cols: ['#ffffff', '#ffe060'], v: 220 }); G.popText?.('약점!', this.x, this.y - 70); }
    if (this.hp <= 0) { G.killBoss(this, hit); return; }
    const sum = this.recent.reduce((a, r) => a + r.d, 0);
    if (this.state !== 'stagger' && sum >= BOSS.staggerDmg) { this.state = 'stagger'; this.st = 0; this.recent.length = 0; this.vx = Math.cos(hit.ang) * 80; G.sfx?.('roar'); }
  }

  animate(dt) {
    if (this.dead) return;
    const sp = this.phase === 2 ? BOSS.speed2 : 1, st = this.st;
    let target;
    const T = k => T_[k].map(v => v / sp);
    switch (this.state) {
      case 'sleep': target = A.P({ torso: 30, head: 30, nU: 10, nF: 10, sw: 20, fU: 5, fF: 10, nT: 20, nS: -20, fT: -10, fS: -5, y: 2 }); break;
      case 'roar': target = A.P({ torso: -22, head: -34, nU: -40, nF: 30, sw: -30, fU: 70, fF: 40, nT: 30, nS: -30, fT: -30, fS: -10, br: Math.sin(this.t * 30) }); break;
      case 'stagger': target = A.P({ torso: 46, head: 30, nU: 30, nF: 10, sw: 70, fU: 20, fF: 20, nT: 95, nS: -140, fT: -10, fS: -100, y: 10 }); break;
      case 'slam': {
        const [w, a] = T('slam');
        if (st < w) target = A.P({ torso: -18, head: -10, nU: 195, nF: 20, sw: 0, fU: 175, fF: 30, nT: 30, nS: -30, fT: -30, fS: -10 });
        else target = A.slash(A.SLASH.wind + Math.min(1, (st - w) / a) * A.SLASH.act + Math.max(0, st - w - a), 40, 1);
        break;
      }
      case 'sweep': {
        const [w, a] = T('sweep');
        if (st < w) target = A.P({ torso: -12, head: 0, nU: -100, nF: 20, sw: -30, fU: -60, fF: 30, nT: 40, nS: -40, fT: -40, fS: -10 });
        else target = A.slash(A.SLASH.wind + Math.min(1, (st - w) / a) * A.SLASH.act + Math.max(0, st - w - a), 95, -1);
        break;
      }
      case 'leap': target = !this.did ? A.LAND : !this.landed ? A.P({ torso: -10, nU: 190, nF: 20, sw: 0, fU: 160, fF: 20, nT: 60, nS: -90, fT: -10, fS: -50 }) : A.slash(0.2, 30, 1); break;
      case 'chain': target = A.P({ torso: 6, nU: 90 - this.aimAng * 180 / Math.PI * this.facing, nF: 0, sw: 30, fU: 40, fF: 40, nT: 30, nS: -30, fT: -20, fS: -10 }); break;
      default:
        if (Math.abs(this.vx) > 10) { this.runPh += dt * Math.abs(this.vx) / 90; target = A.run(this.runPh); }
        else target = A.idle(this.t);
    }
    // 예고 깜빡임: 공격 직전엔 붉은 번쩍임 (bakeActor flash 는 흰색이라 marks 로 따로)
    this.pose = A.follow(this.pose, target, dt, this.state === 'slam' || this.state === 'sweep' ? 1.6 : 1);
    this.pose.cape = A.stepCape(this.cape, this.vx, this.vy, this.facing, dt);
  }
}

// 보스 공격 예고 표시 + 위험물(충격파·낙석·쇠사슬) 그리기·진행 (main.js 가 부름)
export function drawBossMarks(ctx, b, time) {
  if (b.dead) return;
  const warn = (b.state === 'slam' || b.state === 'sweep' || b.state === 'leap' || b.state === 'chain') && !b.did;
  if (warn && Math.floor(time * 16) % 2) {
    ctx.fillStyle = '#ff3030';
    const x = Math.round(b.x) - 1, y = Math.round(b.y - b.h - 22);
    ctx.fillRect(x, y, 3, 8); ctx.fillRect(x, y + 10, 3, 3);
  }
  if (b.state === 'chain' && !b.did) {
    ctx.fillStyle = '#a01818';
    for (let s = 20; s < 260; s += 4) ctx.fillRect(Math.round(b.x + Math.cos(b.aimAng) * s), Math.round(b.y - 50 + Math.sin(b.aimAng) * s), 1, 1);
  }
}

export function stepHazards(G, dt) {
  const p = G.player, W = G.world;
  for (const h of G.hazards) {
    h.t += dt;
    if (h.kind === 'wave') {
      h.x += h.dir * h.v * dt;
      if (W.solidPx(h.x + h.dir * 4, h.y - 6) || !W.solidPx(h.x, h.y + 2)) h.t = h.life;   // 벽·낭떠러지에서 끝
      if (!p.dead && Math.abs(p.x - h.x) < 8 && p.y > h.y - 14 && p.y <= h.y + 1) p.hurt(G, 1, { x: h.x - h.dir * 10, y: h.y });
      if (Math.random() < 0.5) dust(h.x, h.y, h.dir, 1);
    } else if (h.kind === 'rock') {
      if (h.t < h.warn) continue;
      h.vy += 700 * dt; h.y += h.vy * dt;
      if (!p.dead && Math.abs(p.x - h.x) < 8 && Math.abs(p.cy - h.y) < 14) { p.hurt(G, 1, h); h.t = 99; }
      if (W.solidPx(h.x, h.y + 4)) { h.t = 99; dust(h.x, h.y, -1, 4); dust(h.x, h.y, 1, 4); spark(h.x, h.y, -Math.PI / 2, 6, { cols: ['#6a6684', '#3a3850'], v: 90, g: 400 }); G.sfx?.('land'); }
    } else if (h.kind === 'chain') {
      // 쇠사슬 갈고리: 겨눈 쪽으로 뻗었다가 돌아옴. 맞으면 보스 앞으로 끌려감
      const out = h.t < 0.3;
      h.d = out ? h.t / 0.3 * 230 : Math.max(0, 230 - (h.t - 0.3) / 0.3 * 230);
      const ex = h.x + Math.cos(h.a) * h.d, ey = h.y + Math.sin(h.a) * h.d;
      h.ex = ex; h.ey = ey;
      if (out && !p.dead && Math.abs(p.x - ex) < 9 && Math.abs(p.cy - ey) < 14 && p.hurt(G, 1, h.owner)) { p.vx = -Math.cos(h.a) * 260; p.vy = -120; }
      if (h.t > 0.6) h.t = 99;
    }
  }
  G.hazards = G.hazards.filter(h => h.t < (h.life ?? 50) && h.t < 99);
}

export function drawHazards(ctx, G, time) {
  for (const h of G.hazards) {
    if (h.kind === 'wave') {
      // 땅을 따라 솟는 충격파: 앞쪽이 높은 흙·빛 기둥 몇 줄
      const k = h.t / h.life;
      for (let i = 0; i < 10; i++) {
        const x = Math.round(h.x - h.dir * i), hh = Math.max(1, Math.round((10 - i) * (1 - k * 0.5) * (0.7 + 0.3 * Math.sin(time * 40 + i))));
        if (k > 0.6 && (x + i) & 1) continue;
        ctx.fillStyle = i < 2 ? '#ffffff' : i < 5 ? '#ffd0a0' : '#a07050';
        ctx.fillRect(x, Math.round(h.y) - hh, 1, hh);
      }
    } else if (h.kind === 'rock') {
      if (h.t < h.warn) {
        // 떨어질 자리 예고: 바닥에 깜빡이는 붉은 표시
        if (Math.floor(time * 12) % 2) { ctx.fillStyle = '#ff3030'; ctx.fillRect(Math.round(h.x) - 4, Math.round(G.player.y) - 1, 9, 1); }
        continue;
      }
      ctx.fillStyle = '#0b0a14'; ctx.fillRect(Math.round(h.x) - 4, Math.round(h.y) - 4, 9, 9);
      ctx.fillStyle = '#3e414e'; ctx.fillRect(Math.round(h.x) - 3, Math.round(h.y) - 3, 7, 7);
      ctx.fillStyle = '#5e6272'; ctx.fillRect(Math.round(h.x) - 3, Math.round(h.y) - 3, 4, 2);
    } else if (h.kind === 'chain' && h.ex !== undefined) {
      const n = Math.ceil(h.d);
      for (let s = 0; s < n; s += 2) {
        ctx.fillStyle = (s / 2) % 2 ? '#5e6272' : '#9aa0b0';
        ctx.fillRect(Math.round(h.x + Math.cos(h.a) * s), Math.round(h.y + Math.sin(h.a) * s), 2, 2);
      }
      ctx.fillStyle = '#d0d4e0'; ctx.fillRect(Math.round(h.ex) - 2, Math.round(h.ey) - 2, 5, 5);
    }
  }
}
