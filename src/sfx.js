// 효과음: 코드로 합성 (파일 없음). 첫 입력 뒤에 오디오가 켜짐 (브라우저 규칙)
let ac = null, master = null, noiseBuf = null;
function ensure() {
  if (ac) return ac;
  try {
    ac = new AudioContext();
    master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ac = null; }
  return ac;
}
addEventListener('pointerdown', ensure, { once: true });
addEventListener('keydown', ensure, { once: true });

function noise(t0, dur, f0, f1, vol, q = 1, type = 'bandpass') {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
}
function tone(t0, dur, f0, f1, vol, type = 'square') {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}

const SFX = {
  slash: t => { noise(t, 0.12, 5000, 900, 0.5, 0.8); },
  hit: t => { noise(t, 0.18, 1400, 200, 0.7, 0.6, 'lowpass'); tone(t, 0.08, 180, 60, 0.25); },
  gore: t => { noise(t, 0.35, 900, 120, 0.8, 0.5, 'lowpass'); noise(t + 0.03, 0.2, 2600, 400, 0.3, 2); tone(t, 0.2, 110, 40, 0.3, 'sine'); },
  exec: t => { noise(t, 0.08, 7000, 3000, 0.6, 1); tone(t, 0.5, 70, 30, 0.5, 'sine'); noise(t + 0.02, 0.5, 800, 80, 0.7, 0.5, 'lowpass'); },
  dash: t => { noise(t, 0.14, 1800, 600, 0.3, 0.7); },
  jump: t => { noise(t, 0.06, 900, 1600, 0.15, 1); },
  land: t => { noise(t, 0.08, 500, 120, 0.3, 0.8, 'lowpass'); },
  rope: t => { noise(t, 0.1, 3000, 6000, 0.2, 3); tone(t, 0.06, 900, 1600, 0.06); },
  hook: t => { tone(t, 0.05, 1600, 1200, 0.15); noise(t, 0.05, 4000, 2000, 0.3, 4); },
  hookEnemy: t => { noise(t, 0.12, 1200, 300, 0.5, 1, 'lowpass'); tone(t, 0.08, 300, 120, 0.2); },
  clink: t => { tone(t, 0.04, 2400, 1800, 0.1); },
  hurt: t => { noise(t, 0.25, 1200, 150, 0.7, 0.6, 'lowpass'); tone(t, 0.2, 220, 80, 0.3, 'sawtooth'); },
  shot: t => { noise(t, 0.25, 3000, 200, 0.8, 0.5, 'lowpass'); tone(t, 0.1, 120, 40, 0.4); },
  deflect: t => { tone(t, 0.12, 3200, 2400, 0.25, 'triangle'); noise(t, 0.06, 6000, 3000, 0.4, 2); },
  aim: t => { tone(t, 0.05, 1200, 1200, 0.05, 'sine'); },
  alert: t => { tone(t, 0.06, 700, 900, 0.08); },
  enemySwing: t => { noise(t, 0.1, 2000, 600, 0.35, 0.8); },
  death: t => { tone(t, 0.8, 220, 40, 0.4, 'sawtooth'); noise(t, 0.6, 600, 60, 0.5, 0.5, 'lowpass'); },
};
export function sfx(name) {
  if (!ensure() || !SFX[name]) return;
  if (ac.state === 'suspended') ac.resume();
  SFX[name](ac.currentTime + 0.001);
}
