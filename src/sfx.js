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
// 배경음(music.js)도 같은 오디오 장치를 씀
export function audio() { return ensure() ? { ac, noiseBuf } : null; }
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
  sweep: t => { noise(t, 0.14, 3600, 700, 0.5, 0.7); },
  spin: t => { noise(t, 0.28, 1200, 4800, 0.4, 0.8); tone(t, 0.22, 180, 420, 0.05, 'triangle'); },
  hit: t => { noise(t, 0.18, 1400, 200, 0.7, 0.6, 'lowpass'); tone(t, 0.08, 180, 60, 0.25); },
  gore: t => { noise(t, 0.35, 900, 120, 0.8, 0.5, 'lowpass'); noise(t + 0.03, 0.2, 2600, 400, 0.3, 2); tone(t, 0.2, 110, 40, 0.3, 'sine'); },
  exec: t => { noise(t, 0.08, 7000, 3000, 0.6, 1); tone(t, 0.5, 70, 30, 0.5, 'sine'); noise(t + 0.02, 0.5, 800, 80, 0.7, 0.5, 'lowpass'); },
  dash: t => { noise(t, 0.2, 2600, 500, 0.45, 0.7); tone(t, 0.12, 500, 180, 0.06, 'triangle'); },
  djump: t => { noise(t, 0.1, 1200, 3000, 0.25, 1.5); tone(t, 0.1, 600, 1100, 0.07, 'triangle'); },
  jump: t => { noise(t, 0.06, 900, 1600, 0.15, 1); },
  land: t => { noise(t, 0.08, 500, 120, 0.3, 0.8, 'lowpass'); },
  rope: t => { noise(t, 0.1, 3000, 6000, 0.2, 3); tone(t, 0.06, 900, 1600, 0.06); },
  zip: t => { noise(t, 0.16, 800, 7000, 0.45, 1.2); tone(t, 0.12, 300, 1400, 0.08, 'triangle'); },
  hook: t => { tone(t, 0.05, 1600, 1200, 0.15); noise(t, 0.05, 4000, 2000, 0.3, 4); },
  hookEnemy: t => { noise(t, 0.12, 1200, 300, 0.5, 1, 'lowpass'); tone(t, 0.08, 300, 120, 0.2); },
  clink: t => { tone(t, 0.04, 2400, 1800, 0.1); },
  hurt: t => { noise(t, 0.25, 1200, 150, 0.7, 0.6, 'lowpass'); tone(t, 0.2, 220, 80, 0.3, 'sawtooth'); },
  shot: t => { noise(t, 0.25, 3000, 200, 0.8, 0.5, 'lowpass'); tone(t, 0.1, 120, 40, 0.4); },
  deflect: t => { tone(t, 0.12, 3200, 2400, 0.25, 'triangle'); noise(t, 0.06, 6000, 3000, 0.4, 2); },
  aim: t => { tone(t, 0.05, 1200, 1200, 0.05, 'sine'); },
  alert: t => { tone(t, 0.06, 700, 900, 0.08); },
  enemySwing: t => { noise(t, 0.1, 2000, 600, 0.35, 0.8); },
  roar: t => { tone(t, 0.9, 90, 50, 0.4, 'sawtooth'); noise(t, 0.9, 500, 150, 0.5, 0.7, 'lowpass'); tone(t + 0.05, 0.7, 130, 70, 0.2, 'square'); },
  bossSlam: t => { noise(t, 0.5, 400, 40, 1.0, 0.5, 'lowpass'); tone(t, 0.4, 60, 25, 0.6, 'sine'); },
  bossSwing: t => { noise(t, 0.25, 1200, 200, 0.6, 0.6); },
  bossJump: t => { noise(t, 0.2, 300, 900, 0.4, 0.7, 'lowpass'); },
  crit: t => { tone(t, 0.1, 1800, 900, 0.25, 'square'); noise(t, 0.2, 1500, 200, 0.7, 0.6, 'lowpass'); },
  coin: t => { tone(t, 0.05, 1900, 1900, 0.06, 'square'); tone(t + 0.04, 0.08, 2500, 2500, 0.05, 'square'); },
  check: t => { tone(t, 0.25, 660, 660, 0.12, 'triangle'); tone(t + 0.12, 0.35, 990, 990, 0.1, 'triangle'); },
  // 가면 기술 (skills.js)
  quake: t => { noise(t, 0.55, 600, 50, 1.0, 0.5, 'lowpass'); tone(t, 0.45, 75, 28, 0.6, 'sine'); noise(t + 0.04, 0.4, 2400, 300, 0.35, 0.6); },   // 내리찍기: 땅 울림 + 불 터지는 쉭
  flame: t => { noise(t, 0.3, 700, 2600, 0.3, 0.6); },   // 불기둥 솟음
  mist: t => { noise(t, 0.3, 6000, 1800, 0.35, 1.2); tone(t, 0.18, 900, 2200, 0.04, 'sine'); },   // 물안개: 젖은 바람 소리
  wisps: t => { tone(t, 0.35, 420, 880, 0.07, 'sine'); tone(t + 0.06, 0.35, 630, 1320, 0.05, 'sine'); noise(t, 0.3, 1500, 4000, 0.15, 2); },   // 도깨비불: 맑게 울림
  orb: t => { tone(t, 0.12, 700, 1300, 0.06, 'sine'); noise(t, 0.1, 2000, 4500, 0.15, 2); },   // 달 평타 던지기
  orbHit: t => { tone(t, 0.12, 1100, 500, 0.08, 'triangle'); noise(t, 0.12, 3000, 800, 0.3, 1); },
  death: t => { tone(t, 0.8, 220, 40, 0.4, 'sawtooth'); noise(t, 0.6, 600, 60, 0.5, 0.5, 'lowpass'); },
};
export function sfx(name) {
  if (!ensure() || !SFX[name]) return;
  if (ac.state === 'suspended') ac.resume();
  SFX[name](ac.currentTime + 0.001);
}
