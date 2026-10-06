// Offline sound mix for the gig video, rendered with the game's own synth (src/audio/audio.js):
// music moods, sound effects and the fox's babble voice, placed at the times the director
// (and the recorded clips) logged them. window.__mix(events, seconds) -> base64 WAV.
//   events: { t, kind: 'music', mood, volume, fade } | { t, kind: 'sfx', name, volume, pitch }
//         | { t, kind: 'babble', voice, text, cps, pitch, volume }
import audio from '../../src/audio/audio.js';

const SR = 44100;
const cache = new Map();
async function buf(key, make) {
  if (!cache.has(key)) cache.set(key, make().catch((e) => { console.warn('render failed', key, e.message); return null; }));
  return cache.get(key);
}
function add(L, R, b, at, gain, fadeIn = 0, fadeOut = 0, len = Infinity) {
  if (!b) return;
  const l = b.getChannelData(0), r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
  const o = Math.round(at * SR), n = Math.min(l.length, Math.round(len * SR));
  const fi = Math.round(fadeIn * SR), fo = Math.round(fadeOut * SR);
  for (let i = 0; i < n; i++) {
    const j = o + i;
    if (j < 0) continue;
    if (j >= L.length) break;
    let g = gain;
    if (fi && i < fi) g *= i / fi;
    if (fo && i > n - fo) g *= Math.max(0, (n - i) / fo);
    L[j] += l[i] * g; R[j] += r[i] * g;
  }
}

window.__mix = async (events, seconds, opts = {}) => {
  const N = Math.ceil(seconds * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const music = events.filter((e) => e.kind === 'music').sort((a, b) => a.t - b.t);
  // music: each mood plays until the next cue, crossfaded
  for (let i = 0; i < music.length; i++) {
    const m = music[i], next = music[i + 1];
    if (!m.mood) continue;
    const end = next ? next.t : seconds;
    const fade = next ? next.fade ?? 1.2 : 1.5;
    const len = end - m.t + fade;
    const b = await audio._debugRenderMusic(m.mood, Math.min(120, len + 0.5));
    add(L, R, b, m.t, (m.volume ?? 0.6) * (opts.music ?? 1), i ? m.fade ?? 1.2 : 0.3, fade, len);
  }
  for (const e of events) {
    if (e.kind === 'sfx') {
      const v = +(e.volume ?? 0.5).toFixed(2), p = +(e.pitch ?? 1).toFixed(2);
      const b = await buf(`s:${e.name}:${v}:${p}`, () => audio._debugRenderSfx(e.name, e.len || 3.5, { volume: v, pitch: p }));
      add(L, R, b, e.t, opts.sfx ?? 1);
    } else if (e.kind === 'babble') {
      const b = await buf(`b:${e.voice}:${e.text}:${e.cps}:${e.pitch}`, () => audio._debugRenderBabble(e.voice, e.text, { cps: e.cps || 16, pitch: e.pitch || 1, volume: 1 }));
      add(L, R, b, e.t - 0.04, (e.volume ?? 0.5) * (opts.voice ?? 1.6));
    }
  }
  // master: normalise to -1 dBFS, gentle soft clip
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0 ? Math.min(4, 0.89 / peak) : 1;
  const out = new DataView(new ArrayBuffer(44 + N * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + N * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, SR, true);
  out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, N * 4, true);
  const sc = (x) => Math.max(-1, Math.min(1, Math.tanh(x * k * 1.05) / Math.tanh(1.05)));
  for (let i = 0; i < N; i++) { out.setInt16(44 + i * 4, sc(L[i]) * 32767, true); out.setInt16(46 + i * 4, sc(R[i]) * 32767, true); }
  const bytes = new Uint8Array(out.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { wav: btoa(s), peak, gain: k };
};
window.__ready = true;
