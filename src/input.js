// 입력: 키보드 + 마우스(게임 화면 좌표로 바꿔 둠). 눌린 순간(pressed)·뗀 순간(released)은 프레임마다 비움
export const input = {
  down: new Set(), pressed: new Set(), released: new Set(),
  mx: 0, my: 0,         // 마우스 (게임 화면 px)
  mouse: [false, false, false], mPressed: [false, false, false], mReleased: [false, false, false],
};

const KEYMAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  Space: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyE: 'rope', KeyR: 'restart', KeyF: 'full', Backquote: 'debug', KeyP: 'pause', Escape: 'pause', KeyM: 'mute' };

export function bindInput(canvas, toGame) {
  addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (!input.down.has(k)) input.pressed.add(k);
    input.down.add(k);
  });
  addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (!k) return;
    input.down.delete(k); input.released.add(k);
  });
  const move = e => { const [x, y] = toGame(e.clientX, e.clientY); input.mx = x; input.my = y; };
  addEventListener('mousemove', move);
  canvas.addEventListener('mousedown', e => { move(e); input.mouse[e.button] = true; input.mPressed[e.button] = true; e.preventDefault(); });
  addEventListener('mouseup', e => { input.mouse[e.button] = false; input.mReleased[e.button] = true; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('blur', () => { input.down.clear(); input.mouse.fill(false); });
}
export function endFrame() {
  input.pressed.clear(); input.released.clear();
  input.mPressed.fill(false); input.mReleased.fill(false);
}
export const held = k => input.down.has(k);
export const hit = k => input.pressed.has(k);
