// 브라우저 콘솔(또는 자동 확인)에서 붙여 쓰는 조작 도우미: rAF 가 멈춰도 __G.advance 로 시간을 돌리며 입력·스크린샷
// 사용: const s = document.createElement('script'); s.src = '/tools/autotest.js'; document.head.append(s);
(() => {
  const cv = document.getElementById('game');
  const ev = (type, gx, gy, button = 0) => {
    const r = cv.getBoundingClientRect();
    const e = new MouseEvent(type, { clientX: r.left + gx / 480 * r.width, clientY: r.top + gy / 270 * r.height, button, bubbles: true });
    (type === 'mousedown' ? cv : window).dispatchEvent(e);
  };
  const T = {
    shot: async n => { const b = await new Promise(r => cv.toBlob(r)); await fetch('/shot?name=' + n, { method: 'POST', body: b }); },
    key: (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
    tap(code) { T.key(code, true); __G.advance(1 / 60); T.key(code, false); },
    // 월드 좌표를 겨눔 (카메라 기준 화면 좌표로 바꿔 마우스 이동)
    aim(wx, wy) { ev('mousemove', wx - __G.cam.x, wy - __G.cam.y); },
    click(button = 0) { ev('mousedown', ...T.cur(), button); __G.advance(1 / 60); ev('mouseup', ...T.cur(), button); },
    press(button = 0) { ev('mousedown', ...T.cur(), button); },
    release(button = 0) { ev('mouseup', ...T.cur(), button); },
    // 겨눈 월드 좌표는 카메라가 움직여도 매 프레임 다시 겨눔
    run: s => __G.advance(s, () => { if (T.target) _aim(...T.target); }),
    p: () => { const p = __G.player; return { x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), hp: p.hp, rope: p.rope?.state, ground: p.onGround }; },
  };
  const _aim = (wx, wy) => ev('mousemove', wx - __G.cam.x, wy - __G.cam.y);
  T.aim = (wx, wy) => { T.target = [wx, wy]; _aim(wx, wy); };
  T.cur = () => T.target ? [T.target[0] - __G.cam.x, T.target[1] - __G.cam.y] : [240, 135];
  window.T = T;
})();
