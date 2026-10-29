// 일반 원화 → 게임 해상도 픽셀 셰이더. 로딩 때만 처리하고 결과를 캐시한다.
// depth 0 = 먼 하늘, 1 = 전투 공간: 멀수록 흐림·안개를 늘리고 대비·채도·발광을 줄인다.
export const BACKDROP_STYLE = {
  sky: { depth: 0.03, height: 270, blur: 1.6, fog: 0.3, saturation: 0.24, exposure: 0.65, contrast: 0.62, emission: 0 },
  far: { depth: 0.18, height: 246, blur: 2.4, fog: 0.58, saturation: 0.26, exposure: 0.85, contrast: 0.42, emission: 0.13 },
  mid: { depth: 0.45, height: 232, blur: 0.65, fog: 0.12, saturation: 0.48, exposure: 0.72, contrast: 0.82, emission: 0.62 },
};
const FOG = [0.16, 0.15, 0.135];
const VERTEX = `attribute vec2 a_position;
varying vec2 uv;
void main() { uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5); gl_Position = vec4(a_position, 0.0, 1.0); }`;
const FRAGMENT = `precision highp float;
varying vec2 uv;
uniform sampler2D u_image;
uniform vec2 u_grid;
uniform float u_blur, u_fog, u_saturation, u_exposure, u_contrast, u_depth, u_emission, u_glow;
vec4 sampleAt(vec2 p) {
  vec4 c = texture2D(u_image, vec2(fract(p.x), clamp(p.y, 0.0, 1.0)));
  return vec4(c.rgb * c.a, c.a);
}
void main() {
  vec2 p = (floor(uv * u_grid) + 0.5) / u_grid;
  vec2 d = vec2(u_blur) / u_grid;
  vec4 c = vec4(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
    c += sampleAt(p + vec2(float(x), float(y)) * d) * w / 16.0;
  }
  vec3 rgb = c.rgb / max(c.a, 0.0001);
  float fire = smoothstep(0.08, 0.28, rgb.r - rgb.b) * smoothstep(0.23, 0.6, rgb.r);
  if (u_glow > 0.5) {
    gl_FragColor = vec4(vec3(0.62, 0.29, 0.09), fire * c.a * u_emission);
    return;
  }
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(luma), rgb, u_saturation);
  rgb = max(vec3(0.0), (rgb - 0.18) * u_contrast + 0.18) * u_exposure;
  // 3단 면 음영. 위쪽 실루엣과 명도에서 밝은 면을 잡고 회갈색 빛으로 통일한다.
  float a = sampleAt(p - vec2(0.0, 1.0 / u_grid.y)).a;
  float edge = clamp(c.a - a, 0.0, 1.0);
  float shade = luma < 0.09 ? 0.82 : (luma > 0.3 || edge > 0.35 ? 1.08 : 1.0);
  rgb *= mix(1.0, shade, u_depth);
  rgb *= vec3(1.045, 1.0, 0.92);
  rgb = mix(rgb, vec3(0.16, 0.15, 0.135), u_fog);
  rgb = min(rgb, vec3(0.29, 0.265, 0.23));
  rgb = floor(rgb * 63.0 + 0.5) / 63.0;
  gl_FragColor = vec4(rgb, c.a);
}`;

let gpu;
function renderer() {
  if (gpu !== undefined) return gpu;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false });
  if (!gl) return (gpu = null);
  const compile = (kind, source) => {
    const shader = gl.createShader(kind); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  try {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const name of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, name, gl.LINEAR);
    for (const name of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, name, gl.CLAMP_TO_EDGE);
    const uniforms = Object.fromEntries(['grid', 'blur', 'fog', 'saturation', 'exposure', 'contrast', 'depth', 'emission', 'glow'].map(k => [k, gl.getUniformLocation(program, 'u_' + k)]));
    return (gpu = { canvas, gl, uniforms });
  } catch (error) { console.warn('배경 셰이더: Canvas 대체 경로 사용', error); return (gpu = null); }
}
function surface(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// WebGL 불가 환경도 같은 원화·색·깊이 설정으로 부팅한다. 프레임 중 readback은 없다.
function fallback(img, w, h, s) {
  const imgOut = surface(w, h), glow = surface(w, h), x = imgOut.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.filter = `blur(${s.blur}px)`;
  // 좌우 이웃 복사도 흐리게 해서 반복 경계에서 검은 테두리가 생기지 않게 한다.
  for (const dx of [-w, 0, w]) x.drawImage(img, dx, 0, w, h);
  x.filter = 'none';
  const pixels = x.getImageData(0, 0, w, h), e = x.createImageData(w, h), p = pixels.data;
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255, l = 0.299 * r + 0.587 * g + 0.114 * b;
    e.data.set([158, 74, 23, smooth(0.08, 0.28, r - b) * smooth(0.23, 0.6, r) * p[i + 3] * s.emission], i);
    const shade = l < 0.09 ? 0.82 : l > 0.3 ? 1.08 : 1;
    for (let k = 0; k < 3; k++) {
      let v = Math.max(0, ((l + (p[i + k] / 255 - l) * s.saturation) - 0.18) * s.contrast + 0.18) * s.exposure;
      v *= (1 + (shade - 1) * s.depth) * [1.045, 1, 0.92][k];
      v = v * (1 - s.fog) + FOG[k] * s.fog;
      p[i + k] = Math.round(Math.min([0.29, 0.265, 0.23][k], v) * 63) / 63 * 255;
    }
  }
  x.putImageData(pixels, 0, 0); glow.getContext('2d').putImageData(e, 0, 0);
  return { img: imgOut, glow, backend: 'canvas' };
}

export function bakeBackdrop(img, layer, forceCanvas = false) {
  const s = BACKDROP_STYLE[layer];
  const h = s.height, w = layer === 'sky' ? 480 : Math.round(img.width / img.height * h);
  const g = forceCanvas ? null : renderer();
  if (!g || g.gl.isContextLost()) return fallback(img, w, h, s);
  const { canvas, gl, uniforms: u } = g;
  canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.uniform2f(u.grid, w, h);
  for (const k of ['blur', 'fog', 'saturation', 'exposure', 'contrast', 'depth', 'emission']) gl.uniform1f(u[k], s[k]);
  const output = {};
  for (const [name, mode] of [['img', 0], ['glow', 1]]) {
    gl.uniform1f(u.glow, mode); gl.drawArrays(gl.TRIANGLES, 0, 6);
    const c = surface(w, h); c.getContext('2d').drawImage(canvas, 0, 0); output[name] = c;
  }
  return { ...output, backend: 'webgl' };
}
