// 주인공: 이동(가속·코요테 타임·점프 버퍼·벽 타기) · 대시 · 로프 쿠나이 · 마우스 방향 베기
// 로프 쿠나이 (레퍼런스: INARI — 던진 자리로 즉시 몸을 던지는 이동+전투):
//   우클릭 톡 = 붉은 실 달린 쿠나이를 마우스 쪽으로 던짐 → 벽·천장·바닥·고리·적에 꽂힘
//   꽂힌 뒤 다시 우클릭 = 그 자리로 순간 돌진 — 지나가는 길의 적을 베고 관통, 적에 꽂혔으면 처형
//   우클릭 꾹 누른 채 꽂히면 = 실이 팽팽해져 진자 스윙 (W/S 감기, A/D 흔들기, Space 놓고 뛰기) — 떼면 실만 느슨해지고 쿠나이는 남음
//   벽에 도착하면 잠깐 매달림(벽 점프·다음 투척으로 연쇄), 천장이면 잠깐 매달렸다 떨어짐
// 대시(Shift) = 방향키 8방향, 공중 1회 · 더블 점프 = 공중 1회 (벽·천장에 매달리거나 쿠나이 돌진이 끝나면 다시 채워짐)
// 물리는 고정 스텝(120Hz)으로 돈다 (main.js). 수치는 게임 px · 초 단위.
import { input, held } from './input.js';
import * as A from './anim.js';
import { T } from './world.js';
import { dust, speedLine, spark, shake } from './fx.js';

export const TUNE = {
  run: 128, accG: 1500, accA: 900, fric: 1800,
  grav: 900, maxFall: 420, jump: 292, jumpCut: 0.45, coyote: 0.08, buffer: 0.11,
  wallSlide: 70, wallJumpX: 175, wallJumpY: 270,
  dash: 520, dashT: 0.2, dashCd: 0.32, dJump: 270, airJumps: 1,
  hookSpeed: 1300, hookMax: 230, hookMin: 18, reel: 150, pump: 520, ropeJump: 200,
  zip: 1050, zipCd: 0.12, zipKeep: 0.35, cling: 0.6, ceilHang: 0.35, leash: 300,
  atkLunge: 190,
  hp: 5, iframes: 1.0,
};

export class Player {
  constructor(x, y) {
    Object.assign(this, { x, y, w: 10, h: 26, vx: 0, vy: 0, facing: 1, onGround: false, wall: 0, drop: false });
    this.hp = TUNE.hp; this.inv = 0; this.dead = false; this.deadT = 0;
    this.coyote = 0; this.buf = 0; this.airDash = true; this.airAtk = true; this.dashT = 0; this.dashCd = 0;
    this.atkT = -1; this.atkCd = 0; this.atkDir = 1; this.atkId = 0; this.aim = 90; this.aimRad = 0;
    this.combo = 0; this.comboT = 0; this.move = A.COMBO[0];   // 콤보: 지금 타(0~3) · 다음 타를 받는 남은 시간 · 지금 동작 타이밍
    // 쿠나이: { state: 'fly' | 'stuck' | 'back' | 'zip', x, y(쿠나이 자리), dx, dy, tether(팽팽한 실), len, target(꽂힌 적), nx, ny(꽂힌 면) }
    this.rope = null;
    this.cling = 0; this.clingDir = 0; this.ceil = 0; this.zipCd = 0; this.throwT = 0; this.airJump = 1; this.flipT = 0;
    this.t = 0; this.runPh = 0; this.landT = 0;
    this.cape = A.newCape();
    this.pose = { ...A.IDLE };
    this.safe = { x, y };
    this.hurtT = 0;
    this.mouse = [x + 50, y - 20];
  }
  get cx() { return this.x; }
  get cy() { return this.y - 18; }    // 가슴 (로프·조준 기준)

  // 한 프레임 입력을 스텝 버퍼로 (눌린 순간을 놓치지 않게)
  readInput(mouseWorld) {
    if (this.dead) return;
    if (input.pressed.has('jump')) this.buf = TUNE.buffer;
    if (input.released.has('jump')) this.jumpRelease = true;
    if (input.pressed.has('dash')) this.dashReq = true;
    if (input.mPressed[0]) this.atkReq = 0.2;
    if (input.mPressed[2] || input.pressed.has('rope')) this.ropeReq = true;
    if (input.mReleased[2] || input.released.has('rope')) this.ropeRel = true;
    this.ropeHeld = input.mouse[2] || held('rope');
    this.mouse = mouseWorld;
  }

  step(dt, G) {
    const W = G.world;
    this.t += dt;
    this.inv = Math.max(0, this.inv - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.zipCd = Math.max(0, this.zipCd - dt);
    this.zipBuf = Math.max(0, (this.zipBuf || 0) - dt);
    if (this.zipBuf > 0 && this.zipCd <= 0 && this.rope?.state === 'stuck') { this.zipBuf = 0; this.startZip(G); }
    this.atkCd = Math.max(0, this.atkCd - dt);
    if (this.atkT < 0) this.comboT = Math.max(0, this.comboT - dt);
    this.buf = Math.max(0, this.buf - dt);
    if (this.atkReq) this.atkReq = Math.max(0, this.atkReq - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.flipT = Math.max(0, this.flipT - dt);
    if (this.dead) { this.deadT += dt; this.vy = Math.min(TUNE.maxFall, this.vy + TUNE.grav * dt); this.vx *= Math.exp(-dt * 6); W.move(this, this.vx * dt, this.vy * dt); return; }

    // 조준 (마우스 - 가슴)
    this.aimRad = Math.atan2(this.mouse[1] - this.cy, this.mouse[0] - this.cx);

    const dir = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    this.drop = held('down') && this.onGround;

    // ---- 로프 쿠나이 ----
    if (this.ropeReq) {
      this.ropeReq = false;
      const r = this.rope;
      if (!r || r.state === 'back') this.throwKunai(G);
      else if (r.state === 'stuck') this.startZip(G);
    }
    if (this.ropeRel) { this.ropeRel = false; if (this.rope?.tether) this.rope.tether = false; }
    if (this.rope) this.stepRope(dt, G, dir);
    const rope = this.rope;

    // ---- 대시: 방향키 8방향 (입력 없으면 보는 쪽), 공중에선 한 번. 무적 ----
    if (this.dashReq) {
      this.dashReq = false;
      if (this.dashCd <= 0 && this.rope?.state !== 'zip' && (this.onGround || this.airDash || this.cling > 0 || this.ceil > 0)) {
        let dx = dir, dy = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
        if (this.onGround && dy > 0) dy = 0;                                   // 땅에선 아래로 대시 안 함
        if (this.cling > 0 && !this.pole && dx === this.clingDir) dx = -dx;     // 매달린 벽 쪽으론 못 감 → 반대로
        if (!dx && !dy) dx = this.cling > 0 && !this.pole ? -this.clingDir : this.facing;
        const L = Math.hypot(dx, dy);
        this.dashDir = [dx / L, dy / L];
        if (this.rope?.tether) this.rope.tether = false;
        this.cling = 0; this.ceil = 0; this.pole = null; this.atkT = -1;
        this.dashT = TUNE.dashT; this.dashCd = TUNE.dashCd; this.inv = Math.max(this.inv, TUNE.dashT + 0.05);
        this.vx = this.dashDir[0] * TUNE.dash; this.vy = this.dashDir[1] * TUNE.dash;
        if (dx) this.facing = Math.sign(dx);
        if (!this.onGround) this.airDash = false;
        G.onDash?.(this);
        dust(this.x, this.y, -Math.sign(dx || this.facing), 5); G.sfx?.('dash');
      }
    }

    // ---- 공격 ----
    if (this.atkReq && this.atkCd <= 0 && this.rope?.state !== 'zip') {
      this.atkReq = 0;
      this.cling = 0; this.ceil = 0;
      this.startAttack(G, false);
    }

    const zipping = this.rope?.state === 'zip';
    const hooked = this.rope?.state === 'stuck' && this.rope.tether;
    // 벽·천장에 잠깐 매달림: 중력 없이 버팀 (점프·투척·대시로 이어감)
    if (this.cling > 0) {
      this.cling -= dt; this.vx = 0; this.vy = Math.min(this.vy + 60 * dt, 25);
      if (this.pole) this.x = this.pole.x - this.clingSide * 3;   // 줄기를 붙잡음 (줄기 옆에 몸)
      else if (!W.wallAt(this, this.clingDir)) this.cling = 0;
    }
    if (this.ceil > 0) { this.ceil -= dt; this.vx *= Math.exp(-dt * 10); this.vy = 0; if (this.ceil <= 0) this.vy = 20; }
    if (this.cling <= 0) this.pole = null;
    const holding = this.cling > 0 || this.ceil > 0;
    if (zipping || holding) { /* 돌진·매달림 중엔 이동 입력·중력 없음 */ }
    else if (this.dashT > 0) {
      // 대시 중: 속도 고정, 중력 없음. 끝나면 탄력을 조금 남김 (위로 대시는 더 짧게 끊음)
      this.dashT -= dt;
      const [ux, uy] = this.dashDir || [this.facing, 0];
      this.vx = ux * TUNE.dash; this.vy = uy * TUNE.dash;
      if (Math.random() < 0.7) speedLine(this.x - ux * 4, this.y - 6 - Math.random() * 20, -ux, -uy, 12);
      if (this.dashT <= 0) { this.vx = ux * TUNE.dash * 0.45; this.vy = uy < 0 ? uy * TUNE.dash * 0.35 : uy * TUNE.dash * 0.5; }
    } else {
      // 가로 이동
      const acc = this.onGround ? TUNE.accG : hooked ? 0 : TUNE.accA;
      const atkSlow = this.atkT >= 0 && this.onGround ? 0.35 : 1;
      const target = dir * TUNE.run * atkSlow;
      if (dir && acc) {
        if (Math.abs(this.vx) > TUNE.run && Math.sign(this.vx) === dir && !this.onGround) { /* 스윙·돌진 탄력은 유지 */ }
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
    if (this.onGround || this.cling > 0 || this.ceil > 0) { this.airJump = TUNE.airJumps; this.airDash = true; }
    if (this.onGround) { this.coyote = TUNE.coyote; this.airAtk = true; } else this.coyote -= dt;
    if (this.buf > 0 && !zipping) {
      if (hooked) {
        // 로프에서 뛰어내림: 지금 탄력 + 위로 (쿠나이는 꽂힌 채 남음)
        this.rope.tether = false; this.vx *= 1.08;
        this.vy = Math.min(this.vy, 0) - TUNE.ropeJump; this.buf = 0;
        G.sfx?.('jump');
      } else if (this.cling > 0) {
        // 벽 꼭대기 근처면 턱 위로 올라섬 (맨틀) — 머리 위가 비어 있고 벽 윗면이 가까울 때
        const top = !this.pole && this.clingDir && !W.solidPx(this.x + this.clingDir * 8, this.y - this.h - 14) && W.solidPx(this.x + this.clingDir * 8, this.y - 4);
        if (top) {
          this.vx = this.clingDir * 110; this.vy = -280; this.facing = this.clingDir; this.cling = 0; this.buf = 0;
          dust(this.x + this.clingDir * 5, this.y - 6, this.clingDir, 4); G.sfx?.('jump');
        }
        // 매달린 벽을 차고 뜀 (줄기면 누른 쪽·보는 쪽으로)
        const jd = top ? 0 : this.pole ? (dir || this.facing) : -this.clingDir;
        if (jd) {
        this.vx = jd * TUNE.wallJumpX * 1.1; this.vy = -TUNE.wallJumpY; this.facing = jd; this.cling = 0; this.pole = null; this.buf = 0;
        dust(this.x - jd * 5, this.y - 10, -jd, 6); G.sfx?.('jump');
        }
      } else if (this.ceil > 0) { this.ceil = 0; this.buf = 0; this.vy = 60; }
      else if (this.coyote > 0) {
        if (held('down') && this.onGround && this.groundTile === T.PLANK) { this.drop = true; this.y += 1; }
        else { this.vy = -TUNE.jump; dust(this.x, this.y, 0, 6); G.sfx?.('jump'); }
        this.buf = 0; this.coyote = 0;
      } else if (!this.onGround && (W.wallAt(this, -1) || W.wallAt(this, 1))) {
        // 벽 차고 뛰기
        const wdir = W.wallAt(this, -1) ? -1 : 1;
        this.vx = -wdir * TUNE.wallJumpX; this.vy = -TUNE.wallJumpY; this.facing = -wdir; this.buf = 0;
        dust(this.x + wdir * 5, this.y - 10, -wdir, 5); G.sfx?.('jump');
      } else if (this.airJump > 0 && this.dashT <= 0) {
        // 더블 점프: 공중에서 한 번 더 (앞구르기 + 발밑 고리 + 잔상)
        this.airJump--; this.buf = 0;
        this.vy = -TUNE.dJump; if (dir) { this.vx = dir * Math.max(Math.abs(this.vx), TUNE.run); this.facing = dir; }
        this.flipT = 0.3;
        G.onDoubleJump?.(this);
        G.sfx?.('djump');
      }
    }
    if (this.jumpRelease) { this.jumpRelease = false; if (this.vy < 0 && !hooked && !zipping && this.dashT <= 0) this.vy *= TUNE.jumpCut; }

    // ---- 움직이기 ----
    const wasGround = this.onGround, vy0 = this.vy, x0 = this.cx, y0 = this.cy;
    W.move(this, this.vx * dt, this.vy * dt);
    if (!this.onGround && this.vy === 0 && vy0 > 0) this.onGround = W.standing(this);
    if (this.rope?.state === 'stuck' && this.rope.tether) this.constrainRope(G);
    if (this.rope?.state === 'zip') this.zipMoved(G, x0, y0);
    if (this.onGround) { this.cling = 0; this.ceil = 0; }
    this.wall = W.wallAt(this, -1) ? -1 : W.wallAt(this, 1) ? 1 : 0;
    if (!wasGround && this.onGround && vy0 > 250) { dust(this.x - 4, this.y, -1, 4); dust(this.x + 4, this.y, 1, 4); this.landT = 0.12; G.sfx?.('land'); }
    if (this.onGround && W.standing(this) && !W.spikeHit(this) && this.groundTile !== T.PLANK) this.safe = { x: this.x, y: this.y };
    this.landT = Math.max(0, this.landT - dt);

    // ---- 공격 진행 ----
    if (this.atkT >= 0) {
      this.atkT += dt;
      if (this.atkT >= A.moveLen(this.move)) this.atkT = -1;
    }

    // ---- 피해: 가시 · 낙사 ----
    // 무적 중(대시·막 맞음)엔 피해 없이 안전한 자리로만 되돌림
    if (W.spikeHit(this) || this.y > W.ph + 40) {
      this.hurt(G, 1, { x: this.x, y: this.y + 10 });
      if (!this.dead) { this.rope = null; this.cling = this.ceil = 0; this.x = this.safe.x; this.y = this.safe.y; this.vx = this.vy = 0; }
    }
  }

  // 콤보: 공격이 끝나기 전(cd 가 풀린 뒤)이나 끝난 뒤 COMBO_WINDOW 안에 다시 누르면 다음 타, 놓치면 1타부터.
  // 처형(exec)은 올려 베기 자세로 하고 콤보는 처음으로
  startAttack(G, exec) {
    const n = A.COMBO.length;
    this.combo = exec ? 2 : this.atkT >= 0 || this.comboT > 0 ? (this.combo + 1) % n : 0;
    this.move = A.COMBO[this.combo];
    this.atkT = 0; this.atkCd = A.moveCd(this.move, this.combo); this.atkId++; this.atkDir = this.combo === 2 ? -1 : 1;
    this.comboT = exec || this.combo === n - 1 ? 0 : A.COMBO_WINDOW;
    const a = this.aimRad, dx = Math.cos(a), dy = Math.sin(a);
    if (Math.abs(dx) > 0.15) this.facing = dx > 0 ? 1 : -1;
    // 뼈 기준 조준각: 90 = 정면, 180 = 위, 0 = 아래
    this.aim = 90 - Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
    // 앞으로 내딛는 베기 (공중에선 마우스 방향 그대로 — 카타나 제로식). 회전 마무리는 보는 쪽으로 크게 내디딤
    if (this.combo === n - 1 && !exec) this.vx = this.facing * TUNE.atkLunge * (this.onGround ? 1.3 : 1);
    else if (this.onGround) this.vx = dx * TUNE.atkLunge * 0.7;
    else if (this.airAtk) { this.vx = dx * TUNE.atkLunge; this.vy = Math.min(this.vy, dy * TUNE.atkLunge * 0.8); if (dy < 0) this.airAtk = false; }
    // 처형은 칼이 지나가는 순간부터 시작 → 타격 멈춤 화면에 칼질·궤적이 찍혀 있게
    if (exec) this.atkT = A.SLASH.wind + A.SLASH.act * 0.4;
    G.onAttack(this, exec);
  }

  // ---- 로프 쿠나이 ----
  throwKunai(G) {
    const a = this.aimRad;
    this.rope = { state: 'fly', x: this.cx, y: this.cy, dx: Math.cos(a), dy: Math.sin(a), d: 0, len: 0, tether: false };
    this.throwT = 0.12;   // 던지는 팔 자세
    G.sfx?.('rope');
  }
  stepRope(dt, G, dir) {
    const r = this.rope;
    if (r.state === 'fly') {
      // 날아가는 쿠나이: 이번 스텝 구간에서 벽·고리·적을 찾음 (실은 늘 손에 이어짐)
      const from = r.d;
      r.d = Math.min(TUNE.hookMax, r.d + TUNE.hookSpeed * dt);
      const ox = this.cx, oy = this.cy;
      const hit = G.ropeTarget(ox, oy, r.dx, r.dy, r.d, from);
      if (hit) {
        const back = Math.atan2(-r.dy, -r.dx);
        if (hit.enemy) {
          Object.assign(r, { state: 'stuck', x: hit.x, y: hit.y, target: hit.enemy, ox: hit.x - hit.enemy.x, oy: hit.y - hit.enemy.y });
          spark(hit.x, hit.y, back, 6, { cols: ['#ff6060', '#ffffff'], v: 90 }); G.sfx?.('hookEnemy');
        } else if (hit.hook) {
          Object.assign(r, { state: 'stuck', x: hit.x, y: hit.y, nx: hit.nx || 0, ny: hit.ny || 0, ring: hit.ring || null, pole: !!hit.pole });
          spark(hit.x, hit.y, back, 5, { v: 90 }); G.sfx?.('hook');
        } else { r.state = 'back'; r.x = hit.x; r.y = hit.y; spark(hit.x, hit.y, back, 3, { cols: ['#8a8fa0'], v: 60 }); G.sfx?.('clink'); }
        if (r.state === 'stuck') {
          shake(1);
          // 누른 채 꽂히면 실이 팽팽 → 스윙 (적에게 꽂혔으면 스윙 없음)
          if (this.ropeHeld && !r.target) { r.tether = true; r.len = Math.max(TUNE.hookMin, Math.hypot(r.x - ox, r.y - oy)); }
        }
        return;
      }
      r.x = ox + r.dx * r.d; r.y = oy + r.dy * r.d;
      if (r.d >= TUNE.hookMax) r.state = 'back';
      return;
    }
    if (r.state === 'back') {
      // 빗나간·빠진 쿠나이가 손으로 빨려 돌아옴
      const dx = this.cx - r.x, dy = this.cy - r.y, d = Math.hypot(dx, dy), sp = 1500 * dt;
      if (d <= sp) { this.rope = null; return; }
      r.x += dx / d * sp; r.y += dy / d * sp;
      return;
    }
    if (r.state === 'zip') return;   // 움직임은 zipMoved
    // 꽂혀 있음
    if (r.target) {
      if (r.target.dead) { r.state = 'back'; r.target = null; return; }
      r.x = r.target.x + r.ox; r.y = r.target.y + r.oy;
    }
    const dx = this.cx - r.x, dy = this.cy - r.y, d = Math.hypot(dx, dy) || 1;
    // 너무 멀어지면(실이 안 팽팽할 때) 쿠나이가 빠져 돌아옴
    if (!r.tether) { if (d > TUNE.leash) { r.state = 'back'; r.target = null; } return; }
    // 매달림: W/S 로 감고 풀기, A/D 로 흔들기(접선 방향 힘)
    if (held('up')) r.len = Math.max(TUNE.hookMin, r.len - TUNE.reel * dt);
    if (held('down')) r.len = Math.min(TUNE.hookMax, r.len + TUNE.reel * dt);
    if (dir && d >= r.len - 2) {
      let tx = -dy / d, ty = dx / d;
      if (tx * dir < 0) { tx = -tx; ty = -ty; }
      this.vx += tx * TUNE.pump * dt; this.vy += ty * TUNE.pump * dt;
      this.facing = dir;
    }
    if (this.onGround && !dir && r.len > d) r.len = Math.max(TUNE.hookMin, d);
    // 실이 벽에 가려지면 팽팽함만 풀림 (쿠나이는 꽂힌 채)
    if (G.world.ray(this.cx, this.cy, -dx, -dy, d - 4, false)) r.tether = false;
  }
  // 로프 길이를 넘으면 원 위로 되돌리고 바깥으로 가는 속도를 없앰 → 진자
  constrainRope(G) {
    const r = this.rope, dx = this.cx - r.x, dy = this.cy - r.y, d = Math.hypot(dx, dy);
    if (d <= r.len) return;
    const nx = dx / d, ny = dy / d;
    G.world.move(this, r.x + nx * r.len - this.cx, r.y + ny * r.len - this.cy);
    const vr = this.vx * nx + this.vy * ny;
    if (vr > 0) { this.vx -= vr * nx; this.vy -= vr * ny; }
  }
  // 꽂힌 쿠나이로 순간 돌진 (INARI 식): 아주 빠르게 몸을 던지며 지나가는 길의 적을 벰
  startZip(G) {
    const r = this.rope;
    if (!r || r.state !== 'stuck') return;
    if (this.zipCd > 0) { this.zipBuf = 0.15; return; }   // 막 돌진을 끝낸 직후면 입력을 잠깐 기억했다가 실행
    r.state = 'zip'; r.tether = false; r.zipT = 0;
    this.cling = 0; this.ceil = 0; this.dashT = 0; this.atkT = -1;
    this.inv = Math.max(this.inv, 0.2);
    this.zipId = (this.zipId || 0) + 1;
    G.sfx?.('zip');
  }
  zipMoved(G, x0, y0) {
    const r = this.rope;
    r.zipT += 1 / 120;
    if (r.target) { if (r.target.dead) { this.endZip(G, false); return; } r.x = r.target.x + r.ox; r.y = r.target.y + r.oy; }
    // 지나온 구간의 적을 벰 (꽂힌 적은 도착해서 처형)
    G.zipCut?.(this, x0, y0, this.cx, this.cy, r.target);
    const dx = r.x - this.cx, dy = r.y - this.cy, d = Math.hypot(dx, dy);
    const blocked = Math.hypot(this.cx - x0, this.cy - y0) < 0.5 && r.zipT > 0.03;   // 벽에 막혀 못 감
    if (d < (r.target ? 14 : 8) || blocked || r.zipT > 0.5) { this.endZip(G, !blocked); return; }
    this.vx = dx / d * TUNE.zip; this.vy = dy / d * TUNE.zip;
    this.inv = Math.max(this.inv, 0.1);
    if (Math.abs(dx) > 1) this.facing = dx > 0 ? 1 : -1;
  }
  endZip(G, arrived) {
    const r = this.rope, sp = Math.hypot(this.vx, this.vy) || 1;
    const ux = this.vx / sp, uy = this.vy / sp;
    this.rope = null; this.zipCd = TUNE.zipCd; this.airDash = true; this.airAtk = true; this.airJump = TUNE.airJumps;
    if (r.target && !r.target.dead && arrived) {
      // 적에 꽂힌 쿠나이: 닿는 순간 처형
      this.aimRad = Math.atan2(uy, ux); this.vx = ux * 120; this.vy = -140;
      this.startAttack(G, r.target);
      return;
    }
    // 도착한 면에 따라: 벽 = 매달림 · 천장 = 잠깐 매달림 · 바닥/고리 = 탄력 조금 남기고 멈춤
    this.vx = ux * TUNE.zip * TUNE.zipKeep; this.vy = uy * TUNE.zip * TUNE.zipKeep;
    shake(1.5, ux * 2, uy * 2);
    if (r.ring) { this.vy = Math.min(this.vy, -160); return; }
    if (r.pole) {
      // 대나무 줄기를 붙잡음: 온 쪽에 몸을 두고 매달림
      this.cling = TUNE.cling; this.clingDir = 0; this.clingSide = ux >= 0 ? 1 : -1; this.pole = { x: r.x };
      this.vx = this.vy = 0; this.facing = this.clingSide;
      spark(r.x, this.cy, -Math.PI / 2, 4, { cols: ['#7aa860', '#c8d8a0'], v: 50 });
      return;
    }
    const W = G.world;
    // 벽에 꽂혔으면 도착 판정 거리(8px)만큼 남은 틈을 메워 벽면에 몸을 붙임
    if (r.nx) W.move(this, r.x + r.nx * (this.w / 2 + 0.5) - this.x, 0);
    const wdir = W.wallAt(this, 1) ? 1 : W.wallAt(this, -1) ? -1 : 0;
    if (r.nx && wdir) { this.cling = TUNE.cling; this.clingDir = wdir; this.vx = this.vy = 0; this.facing = -wdir; dust(this.x + wdir * 5, this.y - 14, -wdir, 4); }
    else if (r.ny > 0) { this.ceil = TUNE.ceilHang; this.vx *= 0.3; this.vy = 0; }
    else if (uy < 0) this.vy = Math.min(this.vy, -120);
  }

  hurt(G, dmg, from) {
    if (this.dead || this.inv > 0) return false;
    this.hp -= dmg; this.inv = TUNE.iframes; this.hurtT = 0.25;
    const k = this.x < from.x ? -1 : 1;
    this.vx = k * 170; this.vy = -170;
    if (this.rope?.state === 'zip' || this.rope?.state === 'fly') this.rope = null;
    if (this.rope) this.rope.tether = false;
    this.cling = this.ceil = 0;
    G.onPlayerHurt(this, from);
    if (this.hp <= 0) { this.dead = true; this.deadT = 0; this.rope = null; this.facing = -k; }
    return true;
  }

  // ---- 자세 고르기 (그리기 직전, 실제 프레임 dt) ----
  animate(dt) {
    if (this.dead) return;
    let target;
    const r = this.rope;
    if (this.hurtT > 0) target = A.HURT;
    else if (this.atkT >= 0) target = A.comboPose(this.combo, this.atkT, this.aim);
    else if (r?.state === 'zip') {
      // 돌진: 몸을 날아가는 쪽으로 눕힘
      const a = Math.atan2(this.vy, Math.abs(this.vx)) * 180 / Math.PI;
      target = { ...A.ZIP, rot: -Math.max(-70, Math.min(70, a)) * 0.8 };
    } else if (r?.state === 'stuck' && r.tether) {
      const dx = r.x - this.cx, dy = r.y - this.cy;
      const ang = 90 - Math.atan2(dy, dx * this.facing) * 180 / Math.PI;   // 뼈 기준 로프 방향
      const d = Math.hypot(dx, dy) || 1, tan = (this.vx * -dy / d + this.vy * dx / d) / 200 * this.facing;
      target = A.hang(ang, Math.max(-1, Math.min(1, tan)), held('up'));
    } else if (this.cling > 0) target = A.CLING;
    else if (this.ceil > 0) target = A.hang(180, 0, true);
    else if (this.throwT > 0 && r) {
      // 던지는 팔: 빈손을 던진 쪽으로 쭉 뻗음
      const base = this.onGround ? (Math.abs(this.vx) > 12 ? A.run(this.runPh) : A.IDLE) : A.FALL;
      target = { ...base, fU: 90 - Math.atan2(r.dy ?? 0, (r.dx ?? 1) * this.facing) * 180 / Math.PI, fF: 0 };
    } else if (this.dashT > 0) {
      // 대시: 몸을 대시 방향으로 눕힘 (위로 대시면 세우고, 아래면 숙임)
      const [ux, uy] = this.dashDir || [this.facing, 0];
      target = { ...A.DASH, rot: Math.abs(ux) < 0.2 ? (uy < 0 ? 30 : -40) : -Math.atan2(uy, Math.abs(ux)) * 180 / Math.PI * 0.6 };
    } else if (this.flipT > 0 && !this.onGround) {
      // 더블 점프 앞구르기: 45도씩 끊어 돎 (도트 애니메이션처럼)
      const k = 1 - this.flipT / 0.3;
      target = { ...A.JUMP, nT: 90, nS: -120, fT: 70, fS: -110, torso: 30, rot: -(Math.round(k * 8) % 8) * 45 };   // 끝은 0도 (한 바퀴 다 돈 뒤 거꾸로 감기지 않게)
    }
    else if (!this.onGround) target = this.wall && this.vy > 0 ? A.WALL : this.vy < -40 ? A.JUMP : A.FALL;
    else if (this.landT > 0) target = A.LAND;
    else if (Math.abs(this.vx) > 12) { this.runPh += dt * Math.abs(this.vx) / 70; target = A.run(this.runPh); }
    else target = A.idle(this.t);
    this.throwT = Math.max(0, this.throwT - dt);
    // 벽 타기·매달림은 벽 반대쪽을 봄
    this.drawFacing = target.turn ? -this.facing : this.cling > 0 ? (this.pole ? -this.clingSide : -this.clingDir) : !this.onGround && this.wall && this.vy > 0 && !r ? -this.wall : this.facing;
    // 공격·달리기는 끊어 보이게 바로, 나머지는 부드럽게 따라감
    const snap = this.atkT >= 0 || r?.state === 'zip' || this.dashT > 0 || this.flipT > 0 || (this.onGround && Math.abs(this.vx) > 12 && this.dashT <= 0);
    this.pose = snap ? { ...target } : A.follow(this.pose, target, dt);
    this.pose.cape = A.stepCape(this.cape, this.vx, this.vy, this.drawFacing, dt);
  }
}
