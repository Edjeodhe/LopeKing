// 주인공: 이동(가속·코요테 타임·점프 버퍼·벽 타기) · 대시 · 로프 · 쿠나이(귀보) · 마우스 방향 베기
// 이름 (사용자 정함): '로프' = 붉은 실 달린 갈고리를 던져 걸고 스윙·돌진 · '쿠나이' = 적에게 표식을 박고 연쇄로 그어 베는 것(귀보, 키보드 조작)
// 로프 (레퍼런스: INARI — 던진 자리로 즉시 몸을 던지는 이동+전투):
//   우클릭 톡 = 붉은 실 달린 로프 끝(쇠촉)을 마우스 쪽으로 던짐 → 벽·천장·바닥·고리·적에 꽂힘
//   꽂힌 뒤 다시 우클릭 = 그 자리로 순간 돌진 — 지나가는 길의 적을 베고 관통, 적에 꽂혔으면 처형
//   우클릭 꾹 누른 채 꽂히면 = 실이 팽팽해져 진자 스윙 (W/S 감기, A/D 흔들기) — 떼면 실만 느슨해지고 쿠나이는 남음
//   스윙 중 Space(뛰어내림)·Shift(대시) = 실을 끊음: 쿠나이가 빠져 손으로 돌아옴 (두 조작 방식 다)
//   벽에 도착하면 잠깐 매달림(벽 점프·다음 투척으로 연쇄), 천장이면 잠깐 매달렸다 떨어짐
// 대시(Shift) = 방향키 8방향, 공중 1회 · 더블 점프 = 공중 1회 (벽·천장에 매달리거나 쿠나이 돌진이 끝나면 다시 채워짐)
// 키보드만 조작 (CTRL.kb, Tab 으로 바꿈) — 조준 대신 고르기 (main.js G.markedEnemies · G.chainNext · G.anchorPick):
//   방향키 이동 · Ctrl 베기 = 방향키 쪽 (안 누르면 보는 쪽) · F = 쿠나이 또는 로프 (마우스 버튼은 안 받음):
//   둘레에 적이 있으면 = 쿠나이 → 귀보(鬼步, 참고: 아칼리 E 의 표식 → 다시 눌러 날아듦 · 젠이츠 벽력일섬의 긋고 지나감): 실 없는 표식 쿠나이를
//     범위 안 적마다 던져 꽂음 (표식 = 삼태극 문양, sealLife 초) → F 다시 = 겨눈 쪽 표식 적부터 → 가까운 표식 적 순으로 번개처럼 꿰뚫고 지나가며
//     한 줄씩 그음(그어진 적은 멈춤) → 마지막 적을 지나 잠깐 뒤 그어진 적이 한꺼번에 베임 (Space·Shift 로 끊어도 그은 적은 베임). 이펙트 = 초록 혼불
//   적이 없으면 = 로프: 방향키 쪽 걸 곳(안 누르면 보는 쪽 위 대각선)에 반드시 꽂힘 → 몸보다 위면 바로 스윙. F 다시 = 돌진 · Space·Shift = 실 끊기
// 물리는 고정 스텝(120Hz)으로 돈다 (main.js). 수치는 게임 px · 초 단위.
import { input, held } from './input.js';
import * as A from './anim.js';
import { T } from './world.js';
import { dust, speedLine, spark, shake } from './fx.js';

export const TUNE = {
  run: 128, accG: 1500, accA: 900, fric: 1800,
  grav: 900, maxFall: 420, jump: 292, jumpCut: 0.45, coyote: 0.08, buffer: 0.11,
  wallSlide: 70, wallJumpX: 175, wallJumpY: 270,
  dash: 1200, dashEnd: 240, dashT: 0.22, dashCd: 0.32, dJump: 345, flipT: 0.45, airJumps: 1,
  hookSpeed: 1500, hookMax: 320, hookMin: 18, reel: 190, pump: 760, ropeJump: 200,
  swingLong: 140, swingShort: 56, swingClear: 26, autoReel: 520, swingGrav: 1.2, swingMax: 560, ropeKeep: 0.92, ropeFling: 1.12,
  zip: 1050, zipCd: 0.12, zipKeep: 0.35, cling: 0.6, ceilHang: 0.35, leash: 400,
  atkLunge: 190, riseHop: 150,
  hp: 5, iframes: 1.0,
  sealMax: 5, sealLife: 5, flashGap: 0.12, flashCd: 0.3, flashWind: 0.22,   // 귀보: 표식 쿠나이 수·남는 시간 · 한 번 긋고 다음까지 · 끝난 뒤 다시 쓰기까지 · 첫 관통 전 발도 준비 자세
  sheathMin: 3, sheathT: 0.9, sheathQuick: 0.5, sheathClick: 0.755,   // 귀보가 끝나면 늘 칼을 검집에 넣음(납도): 3명 이상 그었으면 천천히 0.9초, 아니면 빠르게 0.5초 · 딸깍(7번째 장, 길이의 75.5%) = 그어진 적이 베이는 순간
  hop: 1900, hopPast: 26, hopFinish: 0.32,   // 귀보 관통 속도 · 적 너머로 지나가는 거리 · 마지막에 지나간 뒤 한꺼번에 베이기까지 (검무 연속 베기가 끝날 만큼)
};
// 조작 방식: kb = 키보드만 · false = 마우스 조준 (main.js 가 Tab 으로 바꾸고 기억함)
export const CTRL = { kb: true };

export class Player {
  constructor(x, y) {
    Object.assign(this, { x, y, w: 10, h: 26, vx: 0, vy: 0, facing: 1, onGround: false, wall: 0, drop: false });
    this.hp = TUNE.hp; this.inv = 0; this.dead = false; this.deadT = 0;
    this.coyote = 0; this.buf = 0; this.airDash = true; this.airAtk = true; this.dashT = 0; this.dashCd = 0;
    this.atkT = -1; this.atkCd = 0; this.atkDir = 1; this.atkId = 0; this.aim = 90; this.aimRad = 0;
    this.combo = 0; this.comboT = 0; this.move = A.COMBO[0];   // 콤보: 지금 타(0~3) · 다음 타를 받는 남은 시간 · 지금 동작 타이밍
    // 쿠나이: { state: 'fly' | 'stuck' | 'back' | 'zip', x, y(쿠나이 자리), dx, dy, tether(팽팽한 실), len, target(꽂힌 적), nx, ny(꽂힌 면) }
    this.rope = null;
    this.seals = []; this.flash = null;   // 귀보 표식 쿠나이 { state: 'fly' | 'stuck', enemy, x, y, t } · 순간이동 연쇄 { t }
    this.cling = 0; this.clingDir = 0; this.ceil = 0; this.zipCd = 0; this.throwT = 0; this.airJump = 1; this.flipT = 0;
    this.t = 0; this.runPh = 0; this.landT = 0;
    this.cape = A.newCape();
    this.pose = { ...A.HERO_IDLE };
    this.safe = { x, y };
    this.hurtT = 0;
    this.mouse = [x + 50, y - 20];
    // 가면 폼: 가면마다 평타·기술이 달라지는 컨셉 (지금은 기본 폼 도깨비 하나). 도깨비 = 가만히 있으면 가면에서 증기 (steam.js)
    this.mask = 'dokkaebi'; this.idleT = 0;
  }
  get cx() { return this.x; }
  get cy() { return this.y - 18; }    // 가슴 (로프·조준 기준)

  // 한 프레임 입력을 스텝 버퍼로 (눌린 순간을 놓치지 않게)
  readInput(mouseWorld) {
    if (this.dead) return;
    if (input.pressed.has('jump')) this.buf = TUNE.buffer;
    if (input.released.has('jump')) this.jumpRelease = true;
    if (input.pressed.has('dash')) this.dashReq = true;
    // 키보드만 조작이면 마우스 버튼은 안 받음 (베기 = Ctrl, 쿠나이 = F)
    const m = !CTRL.kb;
    if ((m && input.mPressed[0]) || input.pressed.has('attack')) this.atkReq = 0.2;
    if ((m && input.mPressed[2]) || input.pressed.has('rope')) this.ropeReq = true;
    if ((m && input.mReleased[2]) || input.released.has('rope')) this.ropeRel = true;
    this.ropeHeld = (m && input.mouse[2]) || held('rope');
    this.mouse = mouseWorld;
  }

  step(dt, G) {
    const W = G.world;
    this.t += dt;
    this.inv = Math.max(0, this.inv - dt);
    this.hurtInv = Math.max(0, (this.hurtInv || 0) - dt);   // 맞은 뒤 무적만 (깜빡임용) — 대시·돌진 무적은 안 깜빡임
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
    if (!this.dead && W.unstick(this)) { this.vx = this.vy = 0; if (this.flash?.hop) this.endHop(G); }   // 혹시 벽 속에 끼었으면 꺼냄
    if (this.dead) { this.deadT += dt; this.vy = Math.min(TUNE.maxFall, this.vy + TUNE.grav * dt); this.vx *= Math.exp(-dt * 6); W.move(this, this.vx * dt, this.vy * dt); return; }

    const dir = this.sheath ? 0 : (held('right') ? 1 : 0) - (held('left') ? 1 : 0);   // 납도 중엔 안 움직임
    this.drop = held('down') && this.onGround;

    // 조준: 마우스 - 가슴 · 키보드 = 방향키 8방향 (안 누르면 보는 쪽, 땅에선 아래로 안 겨눔)
    if (CTRL.kb) {
      let ax = dir, ay = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
      if (this.onGround && ay > 0) ay = 0;
      if (!ax && !ay) ax = this.facing;
      this.aimRad = Math.atan2(ay, ax);
    } else this.aimRad = Math.atan2(this.mouse[1] - this.cy, this.mouse[0] - this.cx);

    // ---- 로프 쿠나이 ----
    this.flashCd = Math.max(0, (this.flashCd || 0) - dt);
    this.flashBuf = Math.max(0, (this.flashBuf || 0) - dt);
    if (this.ropeReq) {
      this.ropeReq = false;
      const r = this.rope;
      if (CTRL.kb) this.kbRope(G, dir);
      else if (!r || r.state === 'back') this.throwKunai(G);
      else if (r.state === 'stuck') this.startZip(G);
    }
    if (this.ropeRel) { this.ropeRel = false; if (!CTRL.kb) this.releaseRope(); }   // 키보드는 Space 로 놓음
    this.stepSeals(dt, G);
    // 귀보: 한 번 긋고 잠깐 뒤 다음 표식 적으로 (지금 자리에서 가장 가까운 것). 남은 표식이 없으면 끝
    if (this.flash && !this.flash.hop) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) {
        const f = this.flash.first, s = f && !f.enemy.dead && this.seals.includes(f) ? f : this.nextSeal();
        this.flash.first = null;
        if (s) this.hopTo(G, s); else this.endFlash();
      }
    }
    // 베기 자세 시간 · 납도 (Space·대시로 끊을 수 있음 — 끊어도 그어진 적은 베임)
    if (this.slashPose) this.slashPose.t += dt;
    if (this.sheath) {
      this.sheath.t += dt; this.inv = Math.max(this.inv, 0.05);
      if (this.sheath.t >= this.sheath.dur || this.buf > 0 || this.dashReq) this.sheath = null;
    }
    // 그어진 적이 한꺼번에 베임 (마지막에 지나가고 hopFinish 초 뒤, 납도면 딸깍 하는 순간)
    if (this.cutWait) { this.cutWait.t -= dt; if (this.cutWait.t <= 0) { G.onChainFinish?.(this, this.cutWait.list); this.cutWait = null; } }
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
        if (this.rope?.tether) this.cutRope();   // 스윙 중 대시 = 실을 끊고 튀어 나감
        if (this.flash) this.endFlash();
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

    const zipping = this.rope?.state === 'zip', hopping = !!this.flash?.hop;
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
    if (hopping) {
      // 귀보 관통: 곧게 아주 빠르게 (남은 거리만큼만), 중력 없음
      const h = this.flash.hop, v = Math.min(TUNE.hop, h.left / dt);
      this.vx = h.ux * v; this.vy = h.uy * v;
    } else if (this.flash?.first) { this.vx = this.vy = 0;   // 발도 준비: 그 자리에 멈춤 (공중이어도)
    } else if (zipping || holding) { /* 돌진·매달림 중엔 이동 입력·중력 없음 */ }
    else if (this.dashT > 0) {
      // 대시 중: 처음에 확 튀어 나가 점점 느려짐 (dash → dashEnd, 감속 곡선) → 잔상 간격도 넓다가 촘촘해짐. 중력 없음
      this.dashT -= dt;
      const [ux, uy] = this.dashDir || [this.facing, 0];
      const k = 1 - Math.max(0, this.dashT) / TUNE.dashT, v = TUNE.dashEnd + (TUNE.dash - TUNE.dashEnd) * (1 - k) * (1 - k);
      this.vx = ux * v; this.vy = uy * v;
      if (Math.random() < 0.7) speedLine(this.x - ux * 4, this.y - 6 - Math.random() * 20, -ux, -uy, 12);
      if (this.dashT <= 0) { this.vx = ux * TUNE.dashEnd; this.vy = uy * TUNE.dashEnd * (uy < 0 ? 0.8 : 1); }   // 끝 속도는 탄력으로 남김
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
      this.vy += TUNE.grav * (hooked ? TUNE.swingGrav : 1) * dt;   // 스윙 중엔 조금 무겁게 → 호가 또렷하고 빠름
      this.vy = Math.min(this.vy, sliding ? TUNE.wallSlide : hooked ? TUNE.swingMax : TUNE.maxFall);   // 스윙은 낙하 속도 제한 없이
      if (sliding && Math.random() < 0.3) spark(this.x + this.wall * 5, this.y - 20, Math.PI / 2, 1, { cols: ['#8a86b0'], v: 20, g: 50, life: 0.2 });
    }

    // ---- 점프 ----
    if (this.onGround || this.cling > 0 || this.ceil > 0) { this.airJump = TUNE.airJumps; this.airDash = true; }
    if (this.onGround) { this.coyote = TUNE.coyote; this.airAtk = true; } else this.coyote -= dt;
    if (this.buf > 0 && this.flash && !hopping) this.endFlash();   // 점프로 귀보 연쇄를 끊음 (긋는 중엔 그 한 줄은 마저)
    if (this.buf > 0 && !zipping) {
      if (hooked) {
        // 로프에서 뛰어내림: 실을 끊고 지금 탄력 + 위로
        this.cutRope(); this.vx *= 1.08;
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
        this.flipT = TUNE.flipT;
        G.onDoubleJump?.(this);
        G.sfx?.('djump');
      }
    }
    // 손을 떼면 낮게 끊는 건 첫 점프만 — 더블 점프(앞구르기 중)는 늘 끝까지 높이 뜀
    if (this.jumpRelease) { this.jumpRelease = false; if (this.vy < 0 && !hooked && !zipping && this.dashT <= 0 && this.flipT <= 0) this.vy *= TUNE.jumpCut; }

    // ---- 움직이기 ----
    const wasGround = this.onGround, vy0 = this.vy, x0 = this.cx, y0 = this.cy;
    W.move(this, this.vx * dt, this.vy * dt);
    if (!this.onGround && this.vy === 0 && vy0 > 0) this.onGround = W.standing(this);
    if (this.rope?.state === 'stuck' && this.rope.tether) this.constrainRope(G);
    if (this.rope?.state === 'zip') this.zipMoved(G, x0, y0);
    if (this.flash?.hop) {
      const h = this.flash.hop, moved = Math.hypot(this.cx - x0, this.cy - y0);
      h.left -= moved; h.t += dt;
      if (h.left <= 0.5 || (moved < 0.5 && h.t > 0.02) || h.t > 0.3) this.endHop(G);   // 다 갔거나 벽에 막힘
    }
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
    // 땅: 타마다 내딛는 세기가 다름 (1타 가장 크게) · 올려 베기는 살짝 뜀
    if (this.combo === n - 1 && !exec) this.vx = this.facing * TUNE.atkLunge * (this.onGround ? 1.3 : 1);
    else if (this.onGround) { this.vx = dx * TUNE.atkLunge * [1.05, 0.85, 0.6][this.combo]; if (this.combo === 2 && !exec) this.vy = -TUNE.riseHop; }
    else if (this.airAtk) { this.vx = dx * TUNE.atkLunge; this.vy = Math.min(this.vy, dy * TUNE.atkLunge * 0.8); if (dy < 0) this.airAtk = false; }
    // 처형은 칼이 지나가는 순간부터 시작 → 타격 멈춤 화면에 칼질·궤적이 찍혀 있게
    if (exec) this.atkT = this.move.wind + this.move.act * 0.4;
    G.onAttack(this, exec);
  }

  // ---- 로프 쿠나이 ----
  // aim (키보드): { enemy } = 그 적 가슴으로 · { point } = 고른 걸 곳으로 (둘 다 유도돼 반드시 꽂힘) · { dir } = 그 방향으로 그냥
  throwKunai(G, aim) {
    let dx, dy;
    if (aim?.enemy || aim?.point) {
      const [tx, ty] = homeOf(aim), L = Math.hypot(tx - this.cx, ty - this.cy) || 1;
      dx = (tx - this.cx) / L; dy = (ty - this.cy) / L;
    } else if (aim?.dir) [dx, dy] = aim.dir;
    // 조준 보정: 대충 적 근처로 던지면 그 적 가슴으로 날아감 (main.js G.ropeAssist)
    else [dx, dy] = G.ropeAssist?.(this.cx, this.cy, Math.cos(this.aimRad), Math.sin(this.aimRad)) || [Math.cos(this.aimRad), Math.sin(this.aimRad)];
    const home = aim?.enemy || aim?.point ? aim : null;
    this.rope = { state: 'fly', x: this.cx, y: this.cy, dx, dy, d: 0, len: 0, tether: false, home };
    this.throwT = 0.12;   // 던지는 팔 자세
    G.sfx?.('rope');
  }
  // 키보드 F: 로프가 꽂혀 있으면 돌진 · 표식이 꽂혀 있으면 귀보 · 표식·로프가 날아가는 중이면 꽂히자마자(두 번 톡)
  //   · 아니면 고른 곳(kbPick): 둘레 적 = 표식 쿠나이 · 없으면 로프
  kbRope(G, dir) {
    const r = this.rope;
    if (this.flash) return;
    if (r?.state === 'stuck') { this.startZip(G); return; }
    if (this.seals.some(s => s.state === 'stuck')) { this.startFlash(G); return; }
    if (this.seals.length) { this.flashBuf = 0.4; return; }
    if (r?.state === 'fly') { this.zipBuf = 0.35; return; }
    if (r && r.state !== 'back') return;
    const pick = this.kbPick(G, dir);
    if (pick.first) { if (this.flashCd <= 0) this.throwSeals(G, pick); }
    else this.throwKunai(G, pick.anchor ? { point: pick.anchor } : { dir: pick.dir });
  }
  // ---- 귀보 (표식 쿠나이 → 순간이동 처형) ----
  // 표식 쿠나이: 실 없이 적 가슴으로 유도돼 반드시 꽂힘. 겨눈 적이 먼저, 나머지는 가까운 순 (sealMax 개까지)
  throwSeals(G, pick) {
    const dist = e => Math.hypot(e.x - this.x, e.y - this.y);
    const rest = pick.pool.filter(e => e !== pick.first).sort((a, b) => dist(a) - dist(b));
    for (const e of [pick.first, ...rest].slice(0, TUNE.sealMax)) this.seals.push({ state: 'fly', enemy: e, x: this.cx, y: this.cy, d: 0, dx: 0, dy: 0, t: 0 });
    this.throwT = 0.12; this.aimRad = Math.atan2(pick.first.y - pick.first.h / 2 - this.cy, pick.first.x - this.cx);
    G.sfx?.('rope');
  }
  stepSeals(dt, G) {
    for (const s of this.seals) {
      const e = s.enemy;
      if (e.dead) { s.gone = true; continue; }
      if (s.state === 'fly') {
        const ox = this.cx, oy = this.cy, [tx, ty] = homeOf(s), L = Math.hypot(tx - ox, ty - oy) || 1;
        if (L > TUNE.leash) { s.gone = true; continue; }
        s.dx = (tx - ox) / L; s.dy = (ty - oy) / L;
        s.d = Math.min(L, s.d + TUNE.hookSpeed * dt);
        s.x = ox + s.dx * s.d; s.y = oy + s.dy * s.d;
        if (s.d >= L) { s.state = 'stuck'; s.ox = tx - e.x; s.oy = ty - e.y; G.onSeal?.(s); G.sfx?.('hookEnemy'); }
      } else {
        s.x = e.x + s.ox; s.y = e.y + s.oy;
        if ((s.t += dt) > TUNE.sealLife) { s.gone = true; G.onSealFade?.(s); }
      }
    }
    this.seals = this.seals.filter(s => !s.gone);
    if (this.flashBuf > 0 && !this.flash && this.seals.some(s => s.state === 'stuck')) { this.flashBuf = 0; this.startFlash(G); }
  }
  // 다음 순간이동할 표식: first = 겨눈 쪽(±70°)에 가까운 것 먼저, 아니면 지금 자리에서 가장 가까운 것 (사거리 leash 안)
  nextSeal(first) {
    let best = null, bs = Infinity;
    const ax = Math.cos(this.aimRad), ay = Math.sin(this.aimRad);
    for (const s of this.seals) {
      if (s.state !== 'stuck' || s.enemy.dead) continue;
      const dx = s.x - this.cx, dy = s.y - this.cy, d = Math.hypot(dx, dy) || 1;
      if (d > TUNE.leash) continue;
      let sc = d;
      if (first) { const ang = Math.acos(Math.max(-1, Math.min(1, (dx * ax + dy * ay) / d))); sc = ang < 1.2 ? ang * 200 + d * 0.3 : 1000 + d; }
      if (sc < bs) { bs = sc; best = s; }
    }
    return best;
  }
  startFlash(G) {
    // 겨눈 쪽: 키보드 조준(방향키, 안 누르면 보는 쪽)
    const s = this.nextSeal(true);
    if (!s) return;
    // 바로 튀어 나가지 않고 flashWind 초 동안 발도 준비 자세(칼집에 손 → 웅크림)로 멈춤 — 사용자: 너무 빨라 자세가 안 보임
    this.flash = { t: TUNE.flashWind, hop: null, cut: [], first: s };
    this.rope = null; this.zipBuf = 0; this.dashT = 0; this.atkT = -1; this.cling = this.ceil = 0;
    this.facing = Math.sign(s.enemy.x - this.x) || this.facing; this.inv = Math.max(this.inv, TUNE.flashWind + 0.1);
    this.slashPose = { k: 'ready', t: 0 }; this.sheath = null;
    G.onFlashWind?.(this);
  }
  // 벽력일섬식 관통: 표식 적을 꿰뚫고 그 너머(hopPast)까지 한 줄로 그으며 날아감 (아주 빠름, 무적). 적 발 높이 기준이라 같은 땅이면 곧게 옆으로
  hopTo(G, s) {
    const e = s.enemy, side = Math.sign(e.x - this.x) || this.facing;
    const x1 = e.x + side * (e.w / 2 + TUNE.hopPast), y1 = e.y;
    const dx = x1 - this.x, dy = y1 - this.y, L = Math.hypot(dx, dy) || 1;
    this.seals = this.seals.filter(o => o !== s);
    this.flash.hop = { e, x0: this.cx, y0: this.cy, ux: dx / L, uy: dy / L, left: L, t: 0 };
    this.slashPose = { k: 'dash', t: 0 }; this.sheath = null;
    this.cling = this.ceil = 0; this.pole = null; this.dashT = 0; this.atkT = -1; this.flipT = 0; this.rope = null;
    this.facing = side; this.inv = Math.max(this.inv, 0.4);
    this.aimRad = Math.atan2(dy, dx);
    if (e.stun !== undefined) e.stun = Math.max(e.stun, 3);   // 그어진 적은 베일 때까지 멈춤 (보스는 안 멈춤)
    G.onHopStart?.(this, this.flash.hop, x1, y1 - this.h * 0.7);
  }
  // 한 줄 다 그음: 그은 적을 '베일 적'에 넣고, 탄력 조금 남기고 다음 줄까지 잠깐
  endHop(G) {
    const h = this.flash.hop;
    this.flash.hop = null;
    if (!h.e.dead) this.flash.cut.push({ e: h.e, ang: Math.atan2(h.uy, h.ux) });
    G.onHopCut?.(this, h);
    this.slashPose = { k: 'follow', t: 0 };
    G.slow = Math.max(G.slow, 0.1); G.slowScale = Math.min(G.slowScale, 0.35);   // 벤 직후 잠깐 느리게 → 지나간 자세가 보임
    this.vx = h.ux * 160; this.vy = Math.min(h.uy * 160, -40);
    this.airDash = true; this.airAtk = true; this.airJump = TUNE.airJumps;
    this.flash.t = TUNE.flashGap;
  }
  // 연쇄 끝 (다 그었거나 Space·Shift·맞아서 끊김): 그은 적은 hopFinish 초 뒤 한꺼번에 베임
  endFlash() {
    const cut = this.flash?.cut || [];
    // 다 그었으면 납도: 칼을 검집에 넣고 딸깍 하는 순간 한꺼번에 베임 (3명 이상이면 천천히). 긋는 도중 끊겼으면 잠깐 뒤 바로 베임
    if (cut.length && !this.flash.hop) {
      const dur = cut.length >= TUNE.sheathMin ? TUNE.sheathT : TUNE.sheathQuick;
      this.sheath = { t: 0, dur }; this.slashPose = null; this.cutWait = { t: dur * TUNE.sheathClick, list: cut };
    } else if (cut.length) this.cutWait = { t: TUNE.hopFinish, list: cut };
    this.flash = null; this.flashCd = TUNE.flashCd;
  }
  // 지금 F 를 누르면 갈 곳 (미리보기도 같은 것 — main.js): 표식 적이 있으면 { pool, first }, 없으면 { anchor | null, dir }
  kbPick(G, dir = (held('right') ? 1 : 0) - (held('left') ? 1 : 0)) {
    const pool = G.markedEnemies(this.cx, this.cy).slice(0, 12);
    const first = pool.length ? G.chainNext(this.cx, this.cy, pool, Math.cos(this.aimRad), Math.sin(this.aimRad)) : null;
    if (first) return { pool, first };
    // 위·아래를 안 누르면 위 대각선 (스윙할 곳)
    let ax = dir, ay = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
    if (!ay) { ay = -1; ax = ax || this.facing; }
    const L = Math.hypot(ax, ay), d = [ax / L, ay / L];
    return { pool, anchor: G.anchorPick(this.cx, this.cy, d[0], d[1]), dir: d };
  }
  // 쿠나이가 hit 자리에 닿음: 적 = 꽂힘 · 걸 곳 = 꽂힘 · 안 걸리는 면 = 튕겨 돌아옴
  stickKunai(r, hit, ox, oy, G) {
    const back = Math.atan2(-r.dy, -r.dx);
    if (hit.enemy) {
      Object.assign(r, { state: 'stuck', x: hit.x, y: hit.y, target: hit.enemy, ox: hit.x - hit.enemy.x, oy: hit.y - hit.enemy.y });
      spark(hit.x, hit.y, back, 6, { cols: ['#3ee08a', '#ffffff'], v: 90 }); G.sfx?.('hookEnemy');
    } else if (hit.hook) {
      Object.assign(r, { state: 'stuck', x: hit.x, y: hit.y, nx: hit.nx || 0, ny: hit.ny || 0, ring: hit.ring || null, pole: !!hit.pole });
      spark(hit.x, hit.y, back, 5, { v: 90 }); G.sfx?.('hook');
    } else { r.state = 'back'; r.x = hit.x; r.y = hit.y; spark(hit.x, hit.y, back, 3, { cols: ['#8a8fa0'], v: 60 }); G.sfx?.('clink'); }
    if (r.state !== 'stuck') return;
    shake(1);
    if (CTRL.kb) {
      // 걸 곳이 몸보다 위면 바로 스윙 (누르고 있을 필요 없음, Space·Shift 로 끊음)
      if (!r.target && r.y < oy - 8) this.attachRope(r, ox, oy, G);
    } else if (this.ropeHeld && !r.target) this.attachRope(r, ox, oy, G);   // 누른 채 꽂히면 실이 팽팽 → 스윙 (적에게 꽂혔으면 스윙 없음)
  }
  stepRope(dt, G, dir) {
    const r = this.rope;
    if (r.state === 'fly' && r.home) {
      // 고른 곳으로 유도: 적·내 몸이 움직여도 그 자리로 꺾여 반드시 꽂힘 (고른 뒤 적이 죽거나 너무 멀어지면 돌아옴)
      const ox = this.cx, oy = this.cy, e = r.home.enemy;
      const [tx, ty] = homeOf(r.home), L = Math.hypot(tx - ox, ty - oy) || 1;
      if (e?.dead || L > TUNE.leash) { r.state = 'back'; return; }
      r.dx = (tx - ox) / L; r.dy = (ty - oy) / L;
      r.d = Math.min(L, r.d + TUNE.hookSpeed * dt);
      r.x = ox + r.dx * r.d; r.y = oy + r.dy * r.d;
      if (r.d >= L) this.stickKunai(r, e ? { x: tx, y: ty, enemy: e } : { ...r.home.point, hook: true }, ox, oy, G);
      return;
    }
    if (r.state === 'fly') {
      // 날아가는 쿠나이: 이번 스텝 구간에서 벽·고리·적을 찾음 (실은 늘 손에 이어짐)
      const from = r.d;
      r.d = Math.min(TUNE.hookMax, r.d + TUNE.hookSpeed * dt);
      const ox = this.cx, oy = this.cy;
      const hit = G.ropeTarget(ox, oy, r.dx, r.dy, r.d, from);
      if (hit) { this.stickKunai(r, hit, ox, oy, G); return; }
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
    // 매달림 (산나비식): 걸린 직전엔 목표 길이까지 빠르게 감겨 몸이 호를 그리며 끌려 들어감. W/S 로 감고 풀면 목표 길이가 바뀜
    if (held('up')) r.goal = Math.max(TUNE.hookMin, Math.min(r.goal, r.len) - TUNE.reel * dt);
    if (held('down')) r.goal = Math.min(TUNE.hookMax, Math.max(r.goal, r.len) + TUNE.reel * dt);
    if (r.len > r.goal) r.len = Math.max(r.goal, r.len - (held('up') ? TUNE.reel : TUNE.autoReel) * dt);
    else if (r.len < r.goal) r.len = Math.min(r.goal, r.len + TUNE.reel * dt);
    // A/D 흔들기: 접선 방향 힘. 아래쪽(진자 바닥)일수록 세고, 지금 흔들리는 쪽과 반대로 누르면 브레이크(약하게)
    if (dir && d >= r.len - 2) {
      let tx = -dy / d, ty = dx / d;
      if (tx * dir < 0) { tx = -tx; ty = -ty; }
      const low = Math.max(0, dy / d), along = this.vx * tx + this.vy * ty;
      const f = TUNE.pump * (0.45 + 0.55 * low) * (along < -30 ? 0.6 : 1);
      this.vx += tx * f * dt; this.vy += ty * f * dt;
      this.facing = dir;
    }
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > TUNE.swingMax) { this.vx *= TUNE.swingMax / sp; this.vy *= TUNE.swingMax / sp; }
    if (this.onGround && !dir && r.len > d) r.len = r.goal = Math.max(TUNE.hookMin, d);
    // 실이 벽에 가려지면 팽팽함만 풀림 (쿠나이는 꽂힌 채)
    if (G.world.ray(this.cx, this.cy, -dx, -dy, d - 4, false)) r.tether = false;
  }
  // 실이 팽팽해짐: 길이 = 지금 거리에서 시작, 목표 길이 = 자동 길이(fitRopeLen) → 길면 빠르게 감겨 호를 그리며 끌려 올라가고, 짧으면 자연스럽게 풀림
  attachRope(r, ox, oy, G) {
    const d = Math.max(TUNE.hookMin, Math.hypot(r.x - ox, r.y - oy));
    r.tether = true; r.len = d;
    r.goal = G ? this.fitRopeLen(G, r, d, oy) : d;
  }
  // 자동 길이 (산나비식 — 콤므의 게임연구소 영상 분석): 어떻게 던졌든 '기분 좋게 스윙할 수 있는 길이'로 맞춤.
  // 너무 길게 던졌으면 스윙하기 좋은 최대 길이(swingLong)로 줄이고, 너무 짧으면 최소 길이(swingShort)까지 늘림.
  // 화면의 지형도 봄: 고리 아래로 그리는 진자 호(아래·양옆 30°·50°)가 땅·벽에 닿으면 그 앞(몸 반 높이 swingClear)까지만.
  // 고리가 몸보다 아래·옆이면 스윙이 아니니 거리 그대로. W/S 로 감고 푸는 건 그대로 덮어씀(선택)
  fitRopeLen(G, r, d, oy = this.cy) {
    if (r.y > oy - 8) return d;
    let L = Math.max(TUNE.swingShort, Math.min(TUNE.swingLong, d));
    const sx0 = r.x + (r.nx || 0) * 3, sy0 = r.y + (r.ny || 0) * 3 + 1;   // 꽂힌 면에서 살짝 떨어진 자리에서 훑음
    for (const a of [0, -0.52, 0.52, -0.87, 0.87]) {
      if (r.nx && Math.sign(Math.sin(a)) === -Math.sign(r.nx)) continue;   // 벽에 꽂혔으면 그 벽 쪽 호는 안 봄 (벽에 막혀 그쪽으론 못 감)
      const hit = G.world.ray(sx0, sy0, Math.sin(a), Math.cos(a), L + TUNE.swingClear, false);
      if (hit && hit.d > 4) L = Math.min(L, hit.d - TUNE.swingClear);
    }
    // 비좁은 곳(바로 아래가 턱)이라도 최소 스윙 길이(던진 거리가 더 짧으면 그만큼)는 남김 — 고리 밑에 몸이 달라붙지 않게
    return Math.max(TUNE.hookMin, L, Math.min(d, TUNE.swingShort));
  }
  // 실을 끊음 (스윙 중 Space·Shift): 쿠나이가 빠져 손으로 빨려 돌아옴 → 다시 던질 수 있음
  cutRope() {
    const r = this.rope;
    if (!r) return;
    r.state = 'back'; r.tether = false; r.target = null;
    spark(r.x, r.y, Math.atan2(this.cy - r.y, this.cx - r.x), 3, { cols: ['#3ee08a', '#ffffff'], v: 60 });
  }
  // 실을 놓음: 스윙 탄력을 살려 조금 더 멀리 던져짐 (산나비식 놓기)
  releaseRope() {
    const r = this.rope;
    if (!r?.tether) return;
    r.tether = false;
    if (Math.hypot(this.vx, this.vy) > 140) { this.vx *= TUNE.ropeFling; this.vy = this.vy * TUNE.ropeFling - 60; }
  }
  // 로프 길이를 넘으면 원 위로 되돌리고 바깥으로 가는 속도를 없앰 → 진자.
  // 막 팽팽해지는 순간(바깥으로 빠르게 가던 중)엔 속력을 버리지 않고 접선 방향으로 돌려 줌 → 끊김 없이 스윙으로 이어짐
  constrainRope(G) {
    const r = this.rope, dx = this.cx - r.x, dy = this.cy - r.y, d = Math.hypot(dx, dy);
    if (d <= r.len) return;
    const nx = dx / d, ny = dy / d;
    G.world.move(this, r.x + nx * r.len - this.cx, r.y + ny * r.len - this.cy);
    const vr = this.vx * nx + this.vy * ny;
    if (vr <= 0) return;
    const sp = Math.hypot(this.vx, this.vy);
    this.vx -= vr * nx; this.vy -= vr * ny;
    const vt = Math.hypot(this.vx, this.vy);
    if (vr > 60 && vt > 1) { const k = Math.max(vt, sp * TUNE.ropeKeep) / vt; this.vx *= k; this.vy *= k; }
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
    const d = Math.hypot(r.x - this.cx, r.y - this.cy) || 1;
    G.onZip?.(this, (r.x - this.cx) / d, (r.y - this.cy) / d);
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
    if (arrived) G.onZipEnd?.(this, ux, uy, r);   // 도착 충격 (멈춤·흔들림·불티, main.js)
    else shake(1.5, ux * 2, uy * 2);
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
    this.hp -= dmg; this.inv = TUNE.iframes; this.hurtInv = TUNE.iframes; this.hurtT = 0.25; this.shudder = 0.22;
    const k = this.x < from.x ? -1 : 1;
    this.vx = k * 170; this.vy = -170;
    if (this.rope?.state === 'zip' || this.rope?.state === 'fly') this.rope = null;
    if (this.rope) this.rope.tether = false;
    if (this.flash) this.endFlash();
    this.cling = this.ceil = 0;
    G.onPlayerHurt(this, from);
    if (this.hp <= 0) { this.dead = true; this.deadT = 0; this.rope = null; this.facing = -k; }
    return true;
  }

  // 귀보 베기·납도 장면 그림 (art/dokkaebi anims.flash · anims.sheath, Codex — 벽력일섬 발도 자세 참고) — 몇 번째 장인지
  // flash 8장: 0 준비 · 1 웅크림 · 2 튀어 나감 · 3 발도 베기 · 4 지나감 · 5 미끄러져 멈춤 · 6 멈춤 자세 · 7 일어섬
  slashFrame() {
    if (this.sheath) return { name: 'sheath', i: Math.min(7, Math.floor(this.sheath.t / this.sheath.dur * 8)) };
    const s = this.slashPose;
    if (!s) return null;
    if (s.k === 'ready') return { name: 'flash', i: s.t < TUNE.flashWind * 0.45 ? 0 : 1 };
    // 관통은 아주 짧으니(무리 안에선 0.03초쯤) 튀어 나감(2)은 한 순간만, 발도 베기(3)는 관통 내내 + 벤 직후까지 이어서 보임
    if (s.k === 'dash') return { name: 'flash', i: s.t < 0.012 ? 2 : 3 };
    const i = s.t < 0.05 ? 3 : s.t < 0.12 ? 4 : s.t < 0.22 ? 5 : s.t < 0.42 ? 6 : s.t < 0.52 ? 7 : -1;
    if (i < 0 || (this.onGround && Math.abs(this.vx) > 40 && s.t > 0.12) || this.atkT >= 0 || this.dashT > 0 || this.rope) { this.slashPose = null; return null; }
    return { name: 'flash', i };
  }
  // ---- 자세 고르기 (그리기 직전, 실제 프레임 dt) ----
  animate(dt) {
    if (this.dead) return;
    let target, idle = false;
    this.frameAnim = null;   // 대기·달리기는 장면 그림으로 (main.js render) — 리그 자세(target)는 그대로 계산해 둠 (자세 이어짐용)
    const slashFrame = this.slashFrame();
    const r = this.rope;
    if (this.hurtT > 0) target = A.HURT;
    else if (this.atkT >= 0) target = A.comboPose(this.combo, this.atkT, this.aim);
    else if (r?.state === 'zip' || this.flash?.hop) {
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
      const base = this.onGround ? (Math.abs(this.vx) > 12 ? A.heroRun(this.runPh) : A.HERO_IDLE) : A.heroAir(this.vy);
      target = { ...base, fU: 90 - Math.atan2(r.dy ?? 0, (r.dx ?? 1) * this.facing) * 180 / Math.PI, fF: 0 };
    } else if (this.dashT > 0) {
      // 대시: 몸을 대시 방향으로 눕힘 (위로 대시면 세우고, 아래면 숙임)
      const [ux, uy] = this.dashDir || [this.facing, 0];
      target = { ...A.DASH, rot: Math.abs(ux) < 0.2 ? (uy < 0 ? 30 : -40) : -Math.atan2(uy, Math.abs(ux)) * 180 / Math.PI * 0.6 };
    } else if (this.flipT > 0 && !this.onGround) {
      // 더블 점프 앞구르기: 확 감아 돌다 느려지며 펴짐 (감속 곡선, 30도씩 끊어 도트 결 유지). 처음엔 무릎을 바짝 당기고 끝물에 다리를 폄
      const k = 1 - this.flipT / TUNE.flipT, e = 1 - (1 - k) ** 3, tuck = Math.max(0, 1 - k * 1.4);
      target = { ...A.JUMP, nT: 50 + 50 * tuck, nS: -70 - 60 * tuck, fT: 20 + 55 * tuck, fS: -60 - 55 * tuck, torso: 10 + 25 * tuck, fU: 40 + 50 * tuck, nU: -20 + 40 * tuck,
        rot: -(Math.round(e * 12) % 12) * 30 };   // 끝은 0도 (한 바퀴 다 돈 뒤 거꾸로 감기지 않게)
    }
    else if (!this.onGround) target = this.wall && this.vy > 0 ? A.WALL : A.heroAir(this.vy);   // 솟음 → 웅크림 → 내려 뻗기를 세로 속도로 섞음
    else if (this.landT > 0) target = A.LAND;
    else if (Math.abs(this.vx) > 12) { this.runPh += dt * Math.max(Math.abs(this.vx), 110) / 70; target = A.heroRun(this.runPh); this.frameAnim = { name: 'run', ph: this.runPh }; }   // 막 출발할 때도 걷지 않고 달리는 발놀림
    else { target = A.heroIdle(this.t); idle = true; this.frameAnim = { name: 'idle', t: this.t }; }
    if (slashFrame) { this.frameAnim = slashFrame; idle = false; }
    this.idleT = idle ? this.idleT + dt : 0;   // 가만히 선 시간 (가면 증기)
    this.throwT = Math.max(0, this.throwT - dt);
    // 벽 타기·매달림은 벽 반대쪽을 봄
    this.drawFacing = target.turn ? -this.facing : this.cling > 0 ? (this.pole ? -this.clingSide : -this.clingDir) : !this.onGround && this.wall && this.vy > 0 && !r ? -this.wall : this.facing;
    // 공격·달리기는 끊어 보이게 바로, 나머지는 부드럽게 따라감
    const snap = this.atkT >= 0 || r?.state === 'zip' || this.flash?.hop || this.dashT > 0 || this.flipT > 0 || (this.onGround && Math.abs(this.vx) > 12 && this.dashT <= 0);
    this.pose = snap ? { ...target } : A.follow(this.pose, target, dt);
    this.pose.cape = A.stepCape(this.cape, this.vx, this.vy, this.drawFacing, dt);
  }
}
// 유도 쿠나이가 갈 자리: 적 가슴 · 고른 걸 곳
const homeOf = h => h.enemy ? [h.enemy.x, h.enemy.y - h.enemy.h / 2] : [h.point.x, h.point.y];   // 표식 쿠나이({ enemy })도 같음
