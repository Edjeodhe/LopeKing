// 배경음: 코드로 합성하는 국악풍 루프 (파일 없음). 미리 0.2초씩 예약해 박자가 밀리지 않게 (lookahead 스케줄러)
//   지속음(낮은 해금 같은 톱니파 + 5도) · 가야금 뜯기(오음계 계면조, 손이 가는 대로 걸음) · 장구(덩·덕·쿵) · 북
// mood: 'calm'(돌아다닐 때) · 'fight'(적이 쫓아올 때 장구가 빨라짐) · 'boss'(보스: 빠른 북·낮은 음)
import { audio } from './sfx.js';

const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];   // 단조 오음계 (계면조 느낌)
const MOODS = {
  calm: { bpm: 84, root: 57, drums: [1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 3, 0, 0, 0], melody: 0.45, drone: 0.05 },
  fight: { bpm: 112, root: 57, drums: [1, 0, 3, 0, 2, 0, 3, 1, 1, 0, 3, 0, 2, 3, 2, 0], melody: 0.6, drone: 0.06 },
  boss: { bpm: 132, root: 52, drums: [4, 0, 3, 1, 2, 0, 4, 1, 4, 0, 3, 1, 2, 3, 4, 2], melody: 0.7, drone: 0.08 },
};
let gain = null, mood = 'calm', want = 'calm', next = 0, stepN = 0, deg = 2, muted = false, timer = null, droneNodes = null;
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function pluck(ac, t, f, vol) {
  // 가야금: 삼각파 + 빠른 감쇠 + 처음에 살짝 위에서 떨어지는 음 (농현)
  const o = ac.createOscillator(), g = ac.createGain(), flt = ac.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f * 1.02, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  if (Math.random() < 0.3) { o.frequency.setValueAtTime(f, t + 0.25); o.frequency.linearRampToValueAtTime(f * 1.03, t + 0.4); o.frequency.linearRampToValueAtTime(f, t + 0.55); }
  flt.type = 'lowpass'; flt.frequency.setValueAtTime(3200, t); flt.frequency.exponentialRampToValueAtTime(700, t + 0.5);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.9);
  o.connect(flt).connect(g).connect(gain); o.start(t); o.stop(t + 1);
}
function drum(ac, buf, t, kind) {
  if (kind === 1 || kind === 4) {   // 덩 / 북: 낮게 떨어지는 사인 + 가죽 소리
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(kind === 4 ? 70 : 110, t); o.frequency.exponentialRampToValueAtTime(kind === 4 ? 38 : 55, t + 0.25);
    g.gain.setValueAtTime(kind === 4 ? 0.55 : 0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(gain); o.start(t); o.stop(t + 0.4);
  }
  if (kind === 1 || kind === 2 || kind === 3) {   // 덕(채편): 짧고 높은 딱 소리
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = kind === 2 ? 2400 : kind === 3 ? 1500 : 900; f.Q.value = 3;
    g.gain.setValueAtTime(kind === 3 ? 0.18 : 0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    s.connect(f).connect(g).connect(gain); s.start(t); s.stop(t + 0.1);
  }
}
function setDrone(ac, M) {
  if (droneNodes) { for (const n of droneNodes.o) n.stop(ac.currentTime + 0.6); droneNodes.g.gain.setTargetAtTime(0, ac.currentTime, 0.2); }
  const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(M.drone, ac.currentTime, 0.5);
  const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 420;
  const o = [0, 7, -12].map(semi => { const x = ac.createOscillator(); x.type = 'sawtooth'; x.frequency.value = midi(M.root - 12 + semi); x.detune.value = (Math.random() - 0.5) * 8; x.connect(flt); x.start(); return x; });
  flt.connect(g).connect(gain);
  droneNodes = { o, g };
}

function schedule() {
  const A = audio();
  if (!A || muted) return;
  const { ac, noiseBuf } = A;
  if (!gain) { gain = ac.createGain(); gain.gain.value = 0.22; gain.connect(ac.destination); next = ac.currentTime + 0.1; setDrone(ac, MOODS[mood]); }
  if (want !== mood && stepN % 16 === 0) { mood = want; setDrone(ac, MOODS[mood]); }
  const M = MOODS[mood], dt = 60 / M.bpm / 4;
  while (next < ac.currentTime + 0.2) {
    const k = stepN % 16, d = M.drums[k];
    if (d) drum(ac, noiseBuf, next, d);
    // 가락: 박마다 확률적으로 한 음, 음계 위를 한두 칸씩 걸음 (가끔 도약)
    if ((k % 2 === 0 && Math.random() < M.melody) || (k % 4 === 0)) {
      deg = Math.max(0, Math.min(SCALE.length - 1, deg + (Math.random() < 0.15 ? (Math.random() < 0.5 ? -3 : 3) : Math.round((Math.random() - 0.5) * 2.4))));
      pluck(ac, next, midi(M.root + SCALE[deg]), mood === 'calm' ? 0.12 : 0.16);
      if (mood === 'boss' && k % 8 === 0) pluck(ac, next, midi(M.root - 12 + SCALE[deg % 5]), 0.14);
    }
    next += dt; stepN++;
  }
}

export function startMusic() { if (!timer) timer = setInterval(schedule, 50); }
export function setMood(m) { if (MOODS[m]) want = m; }
export function toggleMute() {
  muted = !muted;
  if (gain) gain.gain.value = muted ? 0 : 0.22;
  return muted;
}
