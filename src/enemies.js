// 적: 리그 캐릭터(주인공과 같은 리그·굽기) + 단순 AI.
//   grunt (구울 검객): 순찰 → 발견 → 쫓아옴 → 칼 들어 올림(예고) → 베기
//   gunner (조총 구울): 거리를 두고 → 겨눔(붉은 조준선 예고) → 발사. 총알은 주인공이 베면 되받아침
import * as A from './anim.js';
import { newBakeCanvas } from './actor.js';
import { blood, spark, shake, flash } from './fx.js';

export const KINDS = {
  grunt: { hp: 2, w: 10, h: 24, walk: 40, chase: 92, sight: 190, reach: 26, wind: 0.36, act: 0.1, rec: 0.45, dmg: 1 },
  gunner: { hp: 1, w: 10, h: 24, walk: 32, chase: 60, sight: 240, keep: 120, aim: 0.75, cd: 1.5, bullet: 250, dmg: 1 },
};

export class Enemy {
  constructor(kind, type, x, y) {
    const K = KINDS[kind];
    Object.assign(this, { kind, K, type, x, y, w: K.w, h: K.h, vx: 0, vy: 0, facing: -1, onGround: false, hp: K.hp });
    this.state = 'patrol'; this.t = 0; this.alert = 0; this.flashT = 0; this.stun = 0; this.dead = false;
    this.low = newBakeCanvas(); this.pose = { ...A.IDLE }; this.cape = A.newCape(); this.runPh = Math.random();
    this.hitBy = -1; this.sock = {};
    this.patrolDir = Math.random() < 0.5 ? -1 : 1;
  }
  get cy() { return this.y - 14; }

  step(dt, G) {
    if (this.dead) return;
    const W = G.world, p = G.player, K = this.K;
    this.t += dt; this.flashT = Math.max(0, this.flashT - dt);
    const dx = p.x - this.x, dy = p.cy - this.cy, dist = Math.hypot(dx, dy);
    const sees = !p.dead && dist < K.sight && (Math.sign(dx) === this.facing || dist < 60 || this.alert > 0) && W.clear(this.x, this.cy - 4, p.x, p.cy);
    if (sees) this.alert = 2.5; else this.alert = Math.max(0, this.alert - dt);
    let want = 0;
    if (this.stun > 0) { this.stun -= dt; this.vx *= Math.exp(-dt * 5); }
    else if (this.kind === 'grunt') want = this.gruntAI(dt, G, dx, dist);
    else want = this.gunnerAI(dt, G, dx, dy, dist);
    if (this.stun <= 0) this.vx += Math.max(-900 * dt, Math.min(900 * dt, want - this.vx));
    this.vy = Math.min(420, this.vy + 900 * dt);
    W.move(this, this.vx * dt, this.vy * dt);
    if (W.spikeHit(this) || this.y > W.ph + 40) G.killEnemy(this, { kind: 'spike', ang: -Math.PI / 2 });
  }

  // 낭떠러지·벽 앞에서 돌아섬
  blocked(W, d) {
    const ahead = this.x + d * (this.w / 2 + 3);
    return W.solidPx(ahead, this.y - 8) || !W.solidPx(ahead, this.y + 2) && W.atPx(ahead, this.y + 2) !== 3;
  }

  gruntAI(dt, G, dx, dist) {
    const K = this.K, W = G.world;
    if (this.state === 'wind' || this.state === 'act' || this.state === 'rec') {
      this.st += dt;
      if (this.state === 'wind' && this.st >= K.wind) { this.state = 'act'; this.st = 0; this.vx = this.facing * 140; G.sfx?.('enemySwing'); }
      else if (this.state === 'act') {
        // 칼이 지나가는 앞쪽 상자에 주인공이 있으면 맞음
        const p = G.player, fx = this.x + this.facing * K.reach * 0.6;
        if (Math.abs(p.x - fx) < K.reach * 0.7 && Math.abs(p.cy - this.cy) < 20) p.hurt(G, K.dmg, this);
        if (this.st >= K.act) { this.state = 'rec'; this.st = 0; }
      } else if (this.state === 'rec' && this.st >= K.rec) { this.state = 'chase'; }
      return 0;
    }
    if (this.alert > 0) {
      this.state = 'chase';
      this.facing = dx > 0 ? 1 : -1;
      if (dist < K.reach && Math.abs(G.player.cy - this.cy) < 24) { this.state = 'wind'; this.st = 0; G.sfx?.('alert'); return 0; }
      if (this.blocked(W, this.facing)) return 0;
      return this.facing * K.chase;
    }
    this.state = 'patrol';
    if (this.blocked(W, this.patrolDir) || Math.random() < dt * 0.15) this.patrolDir *= -1;
    this.facing = this.patrolDir;
    return this.patrolDir * K.walk;
  }

  gunnerAI(dt, G, dx, dy, dist) {
    const K = this.K, W = G.world, p = G.player;
    this.cd = Math.max(0, (this.cd ?? 0.5) - dt);
    if (this.state === 'aim') {
      this.st += dt;
      this.facing = dx > 0 ? 1 : -1;
      // 겨누는 동안 조준선이 주인공을 천천히 따라감 (마지막 0.2초는 고정 → 피할 틈)
      if (this.st < K.aim - 0.2) this.aimAng = Math.atan2(dy, dx);
      if (this.st >= K.aim) {
        const a = this.aimAng, mx = this.x + Math.cos(a) * 14, my = this.cy - 2 + Math.sin(a) * 14;
        G.bullets.push({ x: mx, y: my, vx: Math.cos(a) * K.bullet, vy: Math.sin(a) * K.bullet, owner: 'enemy', t: 0 });
        spark(mx, my, a, 6, { cols: ['#fff6c0', '#ffb040'], v: 120, life: 0.12 });
        this.vx = -Math.cos(a) * 60;
        G.sfx?.('shot');
        this.state = 'chase'; this.cd = K.cd;
      }
      return 0;
    }
    if (this.alert > 0) {
      this.state = 'chase';
      this.facing = dx > 0 ? 1 : -1;
      if (this.cd <= 0 && W.clear(this.x, this.cy - 4, p.x, p.cy)) { this.state = 'aim'; this.st = 0; this.aimAng = Math.atan2(dy, dx); G.sfx?.('aim'); return 0; }
      // 너무 가까우면 물러나고, 멀면 다가감
      const d = Math.abs(dx);
      const go = d < K.keep * 0.7 ? -this.facing : d > K.keep * 1.4 ? this.facing : 0;
      if (go && this.blocked(W, go)) return 0;
      return go * K.chase;
    }
    this.state = 'patrol';
    if (this.blocked(W, this.patrolDir) || Math.random() < dt * 0.1) this.patrolDir *= -1;
    this.facing = this.patrolDir;
    return this.patrolDir * K.walk;
  }

  // 맞음: 살아남으면 휘청 + 피. 죽으면 G.killEnemy 가 잔혹 연출
  damage(G, dmg, hit) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flashT = 0.08;
    blood(this.x, this.cy, hit.ang, 10, 0.9);
    if (this.hp <= 0) { G.killEnemy(this, hit); return; }
    this.stun = 0.35; this.state = 'chase'; this.alert = 3;
    this.vx = Math.cos(hit.ang) * 150; this.vy = -80;
    this.facing = Math.cos(hit.ang) > 0 ? -1 : 1;
  }

  animate(dt) {
    if (this.dead) return;
    let target;
    if (this.stun > 0) target = A.HURT;
    else if (this.kind === 'grunt' && (this.state === 'wind' || this.state === 'act' || this.state === 'rec')) {
      // 예고: 칼을 머리 위로 크게 들어 올림 → 내리침
      const t = this.state === 'wind' ? 0.03 : this.state === 'act' ? A.SLASH.wind + this.st / this.K.act * A.SLASH.act : A.SLASH.wind + A.SLASH.act + this.st;
      target = A.slash(this.state === 'wind' ? 0 : t, 90, 1);
      if (this.state === 'wind') target = { ...target, nU: 200, sw: 20, torso: -10 };
    } else if (this.kind === 'gunner' && this.state === 'aim') {
      const a = 90 - Math.atan2(Math.sin(this.aimAng), Math.abs(Math.cos(this.aimAng))) * 180 / Math.PI;
      target = A.P({ torso: 4, head: -6, nU: a, nF: 0, sw: 0, fU: a - 10, fF: 30, nT: 24, nS: -20, fT: -18, fS: -6 });
    } else if (!this.onGround) target = A.FALL;
    else if (Math.abs(this.vx) > 10) { this.runPh += dt * Math.abs(this.vx) / 70; target = A.run(this.runPh); }
    else target = A.idle(this.t + this.x);
    const snap = this.state === 'act' || (this.onGround && Math.abs(this.vx) > 10);
    this.pose = snap ? { ...target } : A.follow(this.pose, target, dt);
    this.pose.cape = A.stepCape(this.cape, this.vx, this.vy, this.facing, dt);
  }
}

// 조준선 · 경계 표시 (월드 좌표)
export function drawEnemyMarks(ctx, e, time) {
  if (e.dead) return;
  if (e.kind === 'gunner' && e.state === 'aim') {
    const a = e.aimAng, k = e.st / e.K.aim, len = 260;
    const locked = k > 1 - 0.2 / e.K.aim;
    ctx.fillStyle = locked ? '#ff3030' : '#a01818';
    for (let s = 12; s < len; s += locked ? 1 : 3) ctx.fillRect(Math.round(e.x + Math.cos(a) * s), Math.round(e.cy - 2 + Math.sin(a) * s), 1, 1);
  }
  if (e.kind === 'grunt' && e.state === 'wind' && Math.floor(time * 20) % 2) {
    ctx.fillStyle = '#ff3030'; ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y - 40), 2, 5); ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y - 33), 2, 2);
  }
}
