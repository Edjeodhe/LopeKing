// 주인공: 이동(가속·코요테 타임·점프 버퍼·벽 타기) · 대시 · 로프(마우스 조준 갈고리 → 진자 스윙 · 감기 · 적에게 걸면 끌려가 처형) · 마우스 방향 베기
// 물리는 고정 스텝(120Hz)으로 돈다 (main.js). 수치는 게임 px · 초 단위.
import { input, held } from './input.js';
import * as A from './anim.js';
import { T } from './world.js';
import { dust, speedLine, spark, shake } from './fx.js';

export const TUNE = {
  run: 128, accG: 1500, accA: 900, fric: 1800,
  grav: 900, maxFall: 420, jump: 292, jumpCut: 0.45, coyote: 0.08, buffer: 0.11,
  wallSlide: 70, wallJumpX: 175, wallJumpY: 270,
  dash: 330, dashT: 0.15, dashCd: 0.35,
  hookSpeed: 1100, hookMax: 200, hookMin: 18, reel: 150, pump: 520, ropeJump: 200, zip: 470,
  atkLunge: 190, atkCd: 0.3,
  hp: 5, iframes: 1.0,
};

export class Player {
  constructor(x, y) {
    Object.assign(this, { x, y, w: 10, h: 26, vx: 0, vy: 0, facing: 1, onGround: false, wall: 0, drop: false });
    this.hp = TUNE.hp; this.inv = 0; this.dead = false; this.deadT = 0;
    this.coyote = 0; this.buf = 0; this.airDash = true; this.airAtk = true; this.dashT = 0; this.dashCd = 0;
    this.atkT = -1; this.atkCd = 0; this.atkDir = 1; this.atkId = 0; this.aim = 90; this.aimRad = 0;
    this.rope = null;        // { state: 'fly' | 'hook' | 'zip', x, y, hx, hy, len, target(적) }
    this.state = 'idle'; this.t = 0; this.runPh = 0; this.landT = 0;
    this.cape = A.newCape();
    this.pose = { ...A.IDLE };
    this.safe = { x, y };
    this.hurtT = 0;
  }
  get cx() { return this.x; }
  get cy() { return this.y - 18; }    // 가슴 (로프·조준 기준)

  // 한 프레임 입력을 스텝 버퍼로 (눌린 순간을 놓치지 않게)
  readInput(mouseWorld) {
    if (this.dead) return;
    if (input.pressed.has('jump')) this.buf = TUNE.buffer;
    if (input.released.has('jump')) this.jumpRelease = true;
    if (input.pressed.has('dash')) this.dashReq = true;
    if (input.mPressed[0]) this.atkReq = 0.12;
    if (input.mPressed[2] || input.pressed.has('rope')) this.ropeReq = true;
    if (input.mReleased[2] || input.released.has('rope')) this.ropeRel = true;
    this.mouse = mouseWorld;
  }

  step(dt, G) {
    const W = G.world;
    this.t += dt;
    this.inv = Math.max(0, this.inv - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.buf = Math.max(0, this.buf - dt);
    if (this.atkReq) this.atkReq = Math.max(0, this.atkReq - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.dead) { this.deadT += dt; this.vy = Math.min(TUNE.maxFall, this.vy + TUNE.grav * dt); this.vx *= Math.exp(-dt * 6); W.move(this, this.vx * dt, this.vy * dt); return; }

    // 조준 (마우스 - 가슴)
    const mx = this.mouse[0] - this.cx, my = this.mouse[1] - this.cy;
    this.aimRad = Math.atan2(my, mx);

    const L = held('left'), R = held('right'), dir = (R ? 1 : 0) - (L ? 1 : 0);
    this.drop = held('down') && this.onGround;

    // ---- 로프 ----
    if (this.ropeReq) {
      this.ropeReq = false;
      if (!this.rope || this.rope.state !== 'fly') this.fireRope(G);
    }
    if (this.ropeRel) { this.ropeRel = false; if (this.rope && this.rope.state !== 'zip') this.releaseRope(false); }
    const rope = this.rope;
    if (rope) this.stepRope(dt, G, dir);

    // ---- 대시 ----
    if (this.dashReq) {
      this.dashReq = false;
      if (rope && rope.state === 'hook') {
        // 로프에 매달린 채 대시 = 갈고리 쪽으로 확 당겨짐 (산나비식)
        rope.state = 'zip';
      } else if (this.dashCd <= 0 && (this.onGround || this.airDash)) {
        const d = dir || this.facing;
        this.dashT = TUNE.dashT; this.dashCd = TUNE.dashCd; this.inv = Math.max(this.inv, TUNE.dashT + 0.05);
        this.vx = d * TUNE.dash; this.vy = Math.min(this.vy, 0) * 0.2; this.facing = d;
        if (!this.onGround) this.airDash = false;
        dust(this.x, this.y, -d, 5); G.sfx?.('dash');
      }
    }

    // ---- 공격 ----
    if (this.atkReq && this.atkCd <= 0 && (!rope || rope.state !== 'zip')) {
      this.atkReq = 0;
      this.startAttack(G, false);
    }

    const zipping = rope && rope.state === 'zip';
    const hooked = rope && rope.state === 'hook';
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (Math.random() < 0.7) speedLine(this.x - this.facing * 4, this.y - 6 - Math.random() * 20, -this.facing, 0, 12);
    } else if (!zipping) {
      // 가로 이동
      const acc = this.onGround ? TUNE.accG : hooked ? 0 : TUNE.accA;
      const atkSlow = this.atkT >= 0 && this.onGround ? 0.35 : 1;
      const target = dir * TUNE.run * atkSlow;
      if (dir && acc) {
        if (Math.abs(this.vx) > TUNE.run && Math.sign(this.vx) === dir && !this.onGround) { /* 스윙 탄력은 유지 */ }
        else this.vx += Math.max(-acc * dt, Math.min(acc * dt, target - this.vx));
      } else if (this.onGround) {
        const f = TUNE.fric * dt;
        this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
      } else if (!hooked) this.vx *= Math.exp(-dt * 0.6);   // 공중 저항 (로프 탄력은 오래 감)
      if (dir && this.atkT < 0 && !hooked) this.facing = dir;
      // 중력
      const sliding = !this.onGround && this.wall && dir === this.wall && this.vy > 0 && !hooked;
      this.vy += TUNE.grav * dt;
      this.vy = Math.min(this.vy, sliding ? TUNE.wallSlide : TUNE.maxFall);
      if (sliding && Math.random() < 0.3) spark(this.x + this.wall * 5, this.y - 20, Math.PI / 2, 1, { cols: ['#8a86b0'], v: 20, g: 50, life: 0.2 });
    }

    // ---- 점프 ----
    if (this.onGround) { this.coyote = TUNE.coyote; this.airDash = true; this.airAtk = true; } else this.coyote -= dt;
    if (this.buf > 0 && !zipping) {
      if (hooked) {
        // 로프에서 뛰어내림: 지금 탄력 + 위로
        this.releaseRope(true);
        this.vy = Math.min(this.vy, 0) - TUNE.ropeJump; this.buf = 0;
        G.sfx?.('jump');
      } else if (this.coyote > 0) {
        if (held('down') && this.onGround && this.groundTile === T.PLANK) { this.drop = true; this.y += 1; }
        else { this.vy = -TUNE.jump; dust(this.x, this.y, 0, 6); G.sfx?.('jump'); }
        this.buf = 0; this.coyote = 0;
      } else if (!this.onGround && (W.wallAt(this, -1) || W.wallAt(this, 1))) {
        // 벽 차고 뛰기
        const wdir = W.wallAt(this, -1) ? -1 : 1;
        this.vx = -wdir * TUNE.wallJumpX; this.vy = -TUNE.wallJumpY; this.facing = -wdir; this.buf = 0;
        dust(this.x + wdir * 5, this.y - 10, -wdir, 5); G.sfx?.('jump');
      }
    }
    if (this.jumpRelease) { this.jumpRelease = false; if (this.vy < 0 && !rope) this.vy *= TUNE.jumpCut; }

    // ---- 움직이기 ----
    const wasGround = this.onGround, vy0 = this.vy;
    W.move(this, this.vx * dt, this.vy * dt);
    if (!this.onGround && this.vy === 0 && vy0 > 0) this.onGround = W.standing(this);
    if (this.rope && this.rope.state === 'hook') this.constrainRope(G);
    this.wall = W.wallAt(this, -1) ? -1 : W.wallAt(this, 1) ? 1 : 0;
    if (!wasGround && this.onGround) {
      if (vy0 > 250) { dust(this.x - 4, this.y, -1, 4); dust(this.x + 4, this.y, 1, 4); this.landT = 0.12; G.sfx?.('land'); }
    }
    if (this.onGround && W.standing(this) && !W.spikeHit(this) && this.groundTile !== T.PLANK) this.safe = { x: this.x, y: this.y };
    this.landT = Math.max(0, this.landT - dt);

    // ---- 공격 진행 ----
    if (this.atkT >= 0) {
      this.atkT += dt;
      if (this.atkT >= A.slashLen()) this.atkT = -1;
    }

    // ---- 피해: 가시 · 낙사 ----
    // 무적 중(대시·막 맞음)엔 피해 없이 안전한 자리로만 되돌림
    if (W.spikeHit(this) || this.y > W.ph + 40) {
      this.hurt(G, 1, { x: this.x, y: this.y + 10 });
      if (!this.dead) { this.releaseRope(false); this.x = this.safe.x; this.y = this.safe.y; this.vx = this.vy = 0; }
    }
  }

  startAttack(G, exec) {
    this.atkT = 0; this.atkCd = TUNE.atkCd; this.atkId++; this.atkDir = -this.atkDir;
    const a = this.aimRad, dx = Math.cos(a), dy = Math.sin(a);
    if (Math.abs(dx) > 0.15) this.facing = dx > 0 ? 1 : -1;
    // 뼈 기준 조준각: 90 = 정면, 180 = 위, 0 = 아래
    this.aim = 90 - Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
    // 앞으로 내딛는 베기 (공중에선 마우스 방향 그대로 한 번 — 카타나 제로식)
    if (this.onGround) this.vx = dx * TUNE.atkLunge * 0.7;
    else if (this.airAtk) { this.vx = dx * TUNE.atkLunge; this.vy = Math.min(this.vy, dy * TUNE.atkLunge * 0.8); if (dy < 0) this.airAtk = false; }
    // 처형은 칼이 지나가는 순간부터 시작 → 타격 멈춤 화면에 칼질·궤적이 찍혀 있게
    if (exec) this.atkT = A.SLASH.wind + A.SLASH.act * 0.4;
    G.onAttack(this, exec);
  }

  // ---- 로프 ----
  fireRope(G) {
    const a = this.aimRad;
    this.rope = { state: 'fly', x: this.cx, y: this.cy, dx: Math.cos(a), dy: Math.sin(a), d: 0, len: 0 };
    G.sfx?.('rope');
  }
  releaseRope(boost) {
    if (!this.rope) return;
    if (boost && this.rope.state === 'hook') { this.vx *= 1.08; }
    this.rope = null;
  }
  stepRope(dt, G, dir) {
    const r = this.rope, W = G.world;
    if (r.state === 'fly') {
      // 갈고리가 날아감: 이번 스텝 이동 구간에서 벽·고리·적을 찾음
      const step = TUNE.hookSpeed * dt, from = r.d;
      r.d = Math.min(TUNE.hookMax, r.d + step);
      const ox = this.cx, oy = this.cy;
      const hit = G.ropeTarget(ox, oy, r.dx, r.dy, r.d, from);
      if (hit) {
        if (hit.enemy) { r.state = 'zip'; r.target = hit.enemy; r.hx = hit.x; r.hy = hit.y; G.sfx?.('hookEnemy'); }
        else if (hit.hook) { r.state = 'hook'; r.hx = hit.x; r.hy = hit.y; r.len = Math.max(TUNE.hookMin, Math.hypot(hit.x - ox, hit.y - oy)); spark(hit.x, hit.y, Math.atan2(-r.dy, -r.dx), 5, { v: 90 }); G.sfx?.('hook'); }
        else { this.rope = null; spark(hit.x, hit.y, Math.atan2(-r.dy, -r.dx), 3, { cols: ['#8a8fa0'], v: 60 }); G.sfx?.('clink'); }
        if (this.rope) shake(1);
        return;
      }
      r.x = ox + r.dx * r.d; r.y = oy + r.dy * r.d;
      if (r.d >= TUNE.hookMax) this.rope = null;
      return;
    }
    if (r.state === 'zip') {
      // 갈고리 쪽으로 빠르게 끌려감. 적에 걸었으면 닿는 순간 처형 베기
      if (r.target) { r.hx = r.target.x; r.hy = r.target.y - 14; if (r.target.dead) { this.rope = null; return; } }
      const dx = r.hx - this.cx, dy = r.hy - this.cy, d = Math.hypot(dx, dy);
      this.vx = dx / d * TUNE.zip; this.vy = dy / d * TUNE.zip;
      this.facing = dx > 0 ? 1 : -1;
      if (Math.random() < 0.8) speedLine(this.x - dx / d * 6, this.y - 8 - Math.random() * 16, -dx / d, -dy / d, 14);
      if (d < (r.target ? 16 : 10)) {
        if (r.target) { this.aimRad = Math.atan2(dy, dx); this.rope = null; this.startAttack(G, r.target); this.vx *= 0.5; this.vy = -120; }
        else { this.rope = null; this.vx *= 0.6; this.vy = Math.min(this.vy * 0.5, -140); this.airDash = true; }
      }
      return;
    }
    // 매달림: W/S 로 감고 풀기, A/D 로 흔들기(접선 방향 힘)
    if (held('up')) r.len = Math.max(TUNE.hookMin, r.len - TUNE.reel * dt);
    if (held('down')) r.len = Math.min(TUNE.hookMax, r.len + TUNE.reel * dt);
    const dx = this.cx - r.hx, dy = this.cy - r.hy, d = Math.hypot(dx, dy) || 1;
    if (dir && d >= r.len - 2) {
      // 접선 = 로프에 수직, dir 쪽
      let tx = -dy / d, ty = dx / d;
      if (tx * dir < 0) { tx = -tx; ty = -ty; }
      this.vx += tx * TUNE.pump * dt; this.vy += ty * TUNE.pump * dt;
      this.facing = dir;
    }
    if (this.onGround && !dir && r.len > d) r.len = Math.max(TUNE.hookMin, d);
  }
  // 로프 길이를 넘으면 원 위로 되돌리고 바깥으로 가는 속도를 없앰 → 진자
  constrainRope(G) {
    const r = this.rope, dx = this.cx - r.hx, dy = this.cy - r.hy, d = Math.hypot(dx, dy);
    if (d <= r.len) return;
    const nx = dx / d, ny = dy / d;
    const tx = r.hx + nx * r.len - this.cx, ty = r.hy + ny * r.len - this.cy;
    G.world.move(this, tx, ty);
    const vr = this.vx * nx + this.vy * ny;
    if (vr > 0) { this.vx -= vr * nx; this.vy -= vr * ny; }
  }

  hurt(G, dmg, from) {
    if (this.dead || this.inv > 0) return false;
    this.hp -= dmg; this.inv = TUNE.iframes; this.hurtT = 0.25;
    const k = this.x < from.x ? -1 : 1;
    this.vx = k * 170; this.vy = -170;
    if (this.rope && this.rope.state !== 'hook') this.rope = null;
    G.onPlayerHurt(this, from);
    if (this.hp <= 0) { this.dead = true; this.deadT = 0; this.rope = null; this.facing = -k; }
    return true;
  }

  // ---- 자세 고르기 (그리기 직전, 실제 프레임 dt) ----
  animate(dt) {
    let target;
    if (this.dead) return;
    const r = this.rope;
    if (this.hurtT > 0) target = A.HURT;
    else if (this.atkT >= 0) target = A.slash(this.atkT, this.aim, this.atkDir);
    else if (r && r.state === 'zip') target = A.ZIP;
    else if (r && r.state === 'hook') {
      const dx = r.hx - this.cx, dy = r.hy - this.cy;
      const ang = 90 - Math.atan2(dy, dx * this.facing) * 180 / Math.PI;   // 뼈 기준 로프 방향
      const d = Math.hypot(dx, dy) || 1, tan = (this.vx * -dy / d + this.vy * dx / d) / 200 * this.facing;
      target = A.hang(ang, Math.max(-1, Math.min(1, tan)), held('up'));
    } else if (r && r.state === 'fly') {
      target = { ...(this.onGround ? A.IDLE : A.FALL), fU: 90 - Math.atan2(r.dy, r.dx * this.facing) * 180 / Math.PI, fF: 0 };
    } else if (this.dashT > 0) target = A.DASH;
    else if (!this.onGround) target = this.wall && this.vy > 0 ? A.WALL : this.vy < -40 ? A.JUMP : A.FALL;
    else if (this.landT > 0) target = A.LAND;
    else if (Math.abs(this.vx) > 12) { this.runPh += dt * Math.abs(this.vx) / 70; target = A.run(this.runPh); }
    else target = A.idle(this.t);
    // 벽 타기는 벽 반대쪽을 봄
    this.drawFacing = !this.onGround && this.wall && this.vy > 0 && !r ? -this.wall : this.facing;
    // 공격·달리기는 끊어 보이게 바로, 나머지는 부드럽게 따라감
    const snap = this.atkT >= 0 || (this.onGround && Math.abs(this.vx) > 12 && this.dashT <= 0);
    this.pose = snap ? { ...target } : A.follow(this.pose, target, dt);
    this.pose.cape = A.stepCape(this.cape, this.vx, this.vy, this.drawFacing, dt);
  }
}
