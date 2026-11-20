// All sounds are synthesized with WebAudio (no external audio assets -> nothing to license).
let ctx = null, master = null, musicGain = null, musicTimer = null;
let volume = 0.6;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.18;
  musicGain.connect(master);
  return true;
}
export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}
export function unlock() {
  if (ensure() && ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, { type = 'sine', gain = 0.3, slide = 0, delay = 0, dest = null } = {}) {
  if (!ensure()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  pick: () => tone(1320, 0.12, { type: 'triangle', gain: 0.15, slide: 400 }),
  lit: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.2, delay: i * 0.08 })),
  pulse: () => tone(220, 0.5, { type: 'sine', gain: 0.35, slide: 660 }),
  hit: () => tone(140, 0.35, { type: 'sawtooth', gain: 0.25, slide: -90 }),
  jump: () => tone(380, 0.15, { type: 'square', gain: 0.08, slide: 300 }),
  dash: () => tone(900, 0.12, { type: 'sawtooth', gain: 0.07, slide: -600 }),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.22, delay: i * 0.12 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.22, delay: i * 0.18 })),
  shade: () => tone(90, 0.7, { type: 'sawtooth', gain: 0.12, slide: 40 }),
  tick: () => tone(880, 0.08, { type: 'square', gain: 0.1 }),
  steal: () => tone(700, 0.3, { type: 'triangle', gain: 0.15, slide: -500 }),
  charm: () => [880, 1175].forEach((f, i) => tone(f, 0.2, { type: 'triangle', gain: 0.18, delay: i * 0.07 })),
  wind: () => tone(200, 1.5, { type: 'sawtooth', gain: 0.05, slide: 120 }),
};

// soft night music: pentatonic notes over a low drone
const NOTES = [262, 294, 330, 392, 440, 523, 587];
export function startMusic() {
  if (!ensure() || musicTimer) return;
  let i = 0;
  const play = () => {
    tone(131, 2.6, { type: 'sine', gain: 0.25, dest: musicGain });
    for (let k = 0; k < 4; k++) tone(NOTES[(i * 3 + k * 2) % NOTES.length], 0.9, { type: 'triangle', gain: 0.18, delay: k * 0.6, dest: musicGain });
    i++;
  };
  play();
  musicTimer = setInterval(play, 2400);
}
export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
