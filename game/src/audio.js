// Every sound is generated at runtime with WebAudio: noise bursts shaped into gunshots, a
// filtered thump for grenades, a two-tone beep for the bomb timer, and a dry click for hits.
// No files, no network, no oscillators left running: each burst makes its nodes and lets them end.
import { state } from './store.js';

const GUN = {
  pistol: { level: 0.5, band: 1400, length: 0.14, tail: 0.22 },
  rifle: { level: 0.42, band: 900, length: 0.2, tail: 0.3 },
  smg: { level: 0.34, band: 1800, length: 0.1, tail: 0.16 },
  shotgun: { level: 0.6, band: 620, length: 0.26, tail: 0.42 },
};

function distanceGain(x, z, listenerX, listenerZ) {
  const d = Math.hypot(x - listenerX, z - listenerZ);
  return Math.max(0, 1 - d / 55) ** 2;
}

export function createAudio() {
  let context = null;
  let master = null;
  let noise = null;

  function ensure() {
    if (context !== null) return true;
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (Ctx === undefined) return false;
    context = new Ctx();
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);
    const length = Math.floor(context.sampleRate * 0.5);
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      // Brown-ish noise: quieter highs, closer to a room than a hiss.
      last = (last + (Math.random() * 2 - 1) * 0.18) * 0.985;
      data[i] = last;
    }
    return true;
  }

  function burst({ level, band, length, tail, when = 0 }) {
    if (!ensure()) return;
    const start = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = band;
    filter.Q.value = 0.9;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + length + tail);
    source.connect(filter).connect(gain).connect(master);
    source.start(start, Math.random() * 0.2, length + tail + 0.02);
  }

  function tone({ frequency, level, length, type = 'sine', when = 0, slide = 0 }) {
    if (!ensure()) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), start + length);
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + length);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  return {
    resume() {
      if (!ensure()) return;
      if (context.state === 'suspended') context.resume();
    },
    shot(shot, spec) {
      if (state.player === null) return;
      const listener = state.player.body.pos;
      const gain = shot.agent === state.player ? 1 : distanceGain(shot.x, shot.z, listener.x, listener.z);
      if (gain < 0.02) return;
      const shape = GUN[spec.sound] ?? GUN.rifle;
      burst({ level: shape.level * gain, band: shape.band, length: shape.length, tail: shape.tail });
      burst({ level: shape.level * 0.35 * gain, band: shape.band * 2.4, length: shape.length * 0.5, tail: shape.tail * 0.6 });
      tone({ frequency: 120, level: 0.18 * gain, length: 0.09, type: 'triangle', slide: -70 });
    },
    explosion(grenade) {
      const player = state.player;
      if (player === null) return;
      const gain = distanceGain(grenade.x, grenade.z, player.body.pos.x, player.body.pos.z);
      if (gain < 0.02) return;
      const flash = grenade.kind === 'dazzle';
      burst({ level: 0.75 * gain, band: flash ? 2600 : 320, length: 0.34, tail: 1.1 });
      tone({ frequency: flash ? 900 : 74, level: 0.4 * gain, length: flash ? 1.2 : 0.5, type: 'sawtooth', slide: -40 });
    },
    beep(bomb) {
      const player = state.player;
      if (player === null) return;
      const gain = distanceGain(bomb.position.x, bomb.position.z, player.body.pos.x, player.body.pos.z);
      if (gain < 0.03) return;
      tone({ frequency: 1320, level: 0.16 * gain, length: 0.07, type: 'square' });
    },
    hit(part) {
      tone({ frequency: part === 'head' ? 2100 : 1500, level: part === 'head' ? 0.2 : 0.13, length: 0.05, type: 'square' });
    },
    kill() {
      tone({ frequency: 620, level: 0.18, length: 0.08, type: 'triangle' });
      tone({ frequency: 930, level: 0.14, length: 0.12, type: 'triangle', when: 0.07 });
    },
    hurt() {
      burst({ level: 0.3, band: 420, length: 0.1, tail: 0.18 });
      tone({ frequency: 90, level: 0.2, length: 0.16, type: 'sawtooth', slide: -30 });
    },
    empty() {
      tone({ frequency: 2400, level: 0.08, length: 0.03, type: 'square' });
    },
    reload() {
      tone({ frequency: 380, level: 0.09, length: 0.04, type: 'square' });
      tone({ frequency: 520, level: 0.08, length: 0.04, type: 'square', when: 0.18 });
    },
    throwGrenade() {
      burst({ level: 0.12, band: 900, length: 0.08, tail: 0.1 });
    },
    plant() {
      tone({ frequency: 640, level: 0.16, length: 0.1, type: 'square' });
      tone({ frequency: 880, level: 0.16, length: 0.1, type: 'square', when: 0.14 });
    },
    round(win) {
      tone({ frequency: win ? 520 : 320, level: 0.2, length: 0.18, type: 'triangle' });
      tone({ frequency: win ? 780 : 240, level: 0.18, length: 0.3, type: 'triangle', when: 0.16 });
    },
  };
}
