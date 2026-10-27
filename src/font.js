// 글꼴: 네오둥근모 (NeoDunggeunmo, SIL OFL 1.1 — art/fonts/LICENSE_neodgm.txt)
// 16px 격자로 그린 픽셀 글꼴이라 16px(또는 그 배수)로 써야 또렷하다. 캔버스 fillText는 글꼴이 다 읽힌 뒤에 써야 하니
// 시작할 때 loadFont()를 기다린다. document.fonts에 넣으므로 CSS font-family "NeoDunggeunmo"도 같은 글꼴을 쓴다.

export const FONT = '"NeoDunggeunmo", "Galmuri11", "DungGeunMo", monospace';
export const font = (size = 16) => `${size}px ${FONT}`;

let ready = null;
export function loadFont() {
  if (ready) return ready;
  const path = 'art/fonts/neodgm.woff2';
  const url = globalThis.__ASSETS?.[path] ?? path;
  const face = new FontFace('NeoDunggeunmo', `url(${url})`);
  ready = face.load().then(f => { document.fonts.add(f); return f; })
    .catch(e => console.warn('글꼴 로드 실패 (기본 글꼴로 대신)', e.message));
  return ready;
}
