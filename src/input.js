// 입력: 키보드 + 마우스(게임 화면 좌표로 바꿔 둠). 눌린 순간(pressed)·뗀 순간(released)은 프레임마다 비움
export const input = {
  down: new Set(), pressed: new Set(), released: new Set(),
  mx: 0, my: 0,         // 마우스 (게임 화면 px)
  mouse: [false, false, false], mPressed: [false, false, false], mReleased: [false, false, false],
};

// 키 배치: 둘이 같이 쓰는 키 + 조작 방식마다 다른 키 (setKeyLayout, Tab 으로 바꿈)
const COMMON = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Space: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyR: 'restart', Backquote: 'debug', KeyP: 'pause', Escape: 'pause', KeyM: 'mute', Tab: 'ctrl' };
// 마우스 조작: WASD 이동 · E 쿠나이 · F 전체 화면 (베기·조준은 마우스)
const MOUSE_KEYS = { ...COMMON, KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyE: 'rope', KeyF: 'full' };
// 키보드만 조작 (흔한 배치): 방향키 이동 · Ctrl 베기 · F 쿠나이. WASD 는 뺌 (Ctrl 누른 채 W = 브라우저 탭 닫기라 막을 수 없음)
const KB_KEYS = { ...COMMON, ControlLeft: 'attack', ControlRight: 'attack', KeyF: 'rope' };
let KEYMAP = KB_KEYS;
export function setKeyLayout(kb) {
  KEYMAP = kb ? KB_KEYS : MOUSE_KEYS;
  input.down.clear();   // 바꾸는 순간 눌려 있던 키가 남지 않게
}

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
