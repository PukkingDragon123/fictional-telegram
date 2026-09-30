/**
 * The Bear Must Eat - procedural audio engine.
 *
 * 100% synthesised with the Web Audio API: oscillators, generated noise buffers, Karplus-Strong pluck
 * buffers and a generated-impulse convolution reverb. No audio files, no dependencies.
 *
 *   import audio from './audio/audio.js';
 *
 *   audio.unlock()                       create/resume the AudioContext. Call from a user gesture; idempotent.
 *                                        (The module also hooks pointerdown/pointerup/touchend/click/keydown
 *                                        itself, so iOS Safari and interruption recovery work regardless.)
 *   audio.play(name, { volume = 1, pitch = 1, pan = 0, delay = 0 })
 *                                        silent no-op while locked / muted / tab hidden / unknown name; never throws.
 *   audio.setMuted(bool)  audio.isMuted()  audio.toggleMute() -> bool        localStorage 'tbme.muted'
 *   audio.setVolumes({ master, sfx, music, ambience })  audio.getVolumes()   0..1, localStorage 'tbme.volumes'
 *   audio.setMusic('title' | 'day' | 'rush' | 'night' | null)                 1.5 s crossfade, same mood = no-op
 *   audio.setAmbience({ hour: 0..24, night: 0..1 })                           cheap, call it every frame
 *   audio.update(dt)                     optional per-frame hook (gives the scheduler extra chances to run)
 *
 * SFX names: click hover open close error buy coin coins plop splash bigsplash bubble chomp nibble heart hatch
 *   discover research levelup place build hammer demolish dig gate whistle bell footsteps jump growl roar smash
 *   review_good review_bad loon honk bees day_start day_end warning gameover fanfare
 *
 * Architecture
 *   - SFX builders are pure functions (ctx, destination, opts) -> absolute end time, so the very same code renders
 *     into an OfflineAudioContext: audio._debugRenderSfx / _debugRenderMix / _debugRenderMusic /
 *     _debugRenderAmbience (used by tools/audio-check.mjs).
 *   - Chain: buses (sfx / music / ambience, each with a dry and a reverb-send gain) -> master ->
 *     DynamicsCompressor (gentle limiting) -> soft-knee safety limiter -> destination.
 *   - Voice limiting per SFX name and globally (48); every voice disconnects its nodes when its last source ends.
 *   - Music and random ambience events are scheduled by a lookahead scheduler (setInterval 25 ms, 120 ms ahead of
 *     ctx.currentTime); it pauses while muted or while the tab is hidden, and the context is suspended meanwhile.
 */

/* ========================================================================== *
 *  constants & tiny helpers
 * ========================================================================== */

const LS_MUTED = 'tbme.muted';
const LS_VOLUMES = 'tbme.volumes';
const DEFAULT_VOLUMES = Object.freeze({ master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.6 });

const LOOKAHEAD = 0.12; // seconds of music scheduled ahead of the audio clock
const TICK_MS = 25; // scheduler tick
const XFADE = 1.5; // music crossfade, seconds
const MAX_VOICES = 48; // global cap of concurrently sounding SFX
const OFFLINE_SR = 44100;

// Per-bus trims (constants folded into the bus gain so that the default slider
// positions land at sensible loudness).
const TRIM = { sfx: 1.35, music: 1.6, amb: 1.6 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rr = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (a) => a[(Math.random() * a.length) | 0];
const chance = (p) => Math.random() < p;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const noop = () => {};
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** slider position (0..1) -> linear gain. Squared feels closer to even loudness steps. */
const gainCurve = (v) => v * v;

const HAS_DOC = typeof document !== 'undefined';

function lsGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
function lsSet(key, val) {
  try {
    window.localStorage.setItem(key, val);
  } catch (e) {
    /* private mode / blocked storage */
  }
}
function loadVolumes() {
  const v = { ...DEFAULT_VOLUMES };
  try {
    const raw = lsGet(LS_VOLUMES);
    if (raw) {
      const o = JSON.parse(raw);
      for (const k of Object.keys(v)) if (typeof o[k] === 'number' && isFinite(o[k])) v[k] = clamp(o[k], 0, 1);
    }
  } catch (e) {
    /* corrupt JSON -> defaults */
  }
  return v;
}

// debug counters (also used by the leak check in tools/audio-check.mjs)
const stats = { voices: 0, disposed: 0, notes: 0, dropped: 0 };
let lastVoice = null;

/* ========================================================================== *
 *  per-context resources: noise, reverb impulse, pluck buffers, curves
 * ========================================================================== */

function makeNoiseBuffers(ctx) {
  const sr = ctx.sampleRate;
  const F = Math.floor(sr * 0.2); // crossfade length
  const make = (fill, seconds = 3) => {
    const N = Math.floor(sr * seconds); // loopable
    const raw = new Float32Array(N + F);
    fill(raw);
    const buf = ctx.createBuffer(1, N, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = raw[i];
    // seamless loop: crossfade the extra tail into the head
    for (let i = 0; i < F; i++) {
      const w = i / F;
      d[i] = raw[i] * Math.sqrt(w) + raw[N + i] * Math.sqrt(1 - w);
    }
    let s2 = 0;
    for (let i = 0; i < N; i++) s2 += d[i] * d[i];
    const g = 0.28 / (Math.sqrt(s2 / N) || 1); // normalise to rms 0.28
    for (let i = 0; i < N; i++) d[i] = clamp(d[i] * g, -1, 1);
    return buf;
  };
  return {
    white: make((raw) => {
      for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 2 - 1;
    }, 1.5),
    pink: make((raw) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < raw.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      }
    }),
    brown: make((raw) => {
      let last = 0;
      for (let i = 0; i < raw.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        raw[i] = last * 3.5;
      }
    }),
  };
}

/** Generated stereo impulse response: soft cabin/forest room, ~1.7 s, darkening tail. */
function makeImpulse(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 1.7);
  const buf = ctx.createBuffer(2, len, sr);
  const rt60 = 1.45;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const e = Math.pow(10, (-3 * t) / rt60);
      const fc = 7500 * Math.pow(0.11, t / rt60); // 7.5 kHz -> ~0.8 kHz
      const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * k;
      lp2 += (lp - lp2) * k;
      const onset = clamp((t - 0.012) / 0.03, 0, 1);
      d[i] = lp2 * e * onset * 2.4;
    }
    // sparse early reflections, slightly different per channel
    const taps = ch === 0 ? [[0.011, 0.5], [0.023, -0.38], [0.037, 0.3], [0.052, -0.22]] : [[0.015, 0.46], [0.027, -0.34], [0.041, 0.28], [0.058, -0.2]];
    for (const [tt, a] of taps) d[Math.floor(tt * sr)] += a;
  }
  return buf;
}

/** Karplus-Strong plucked string rendered into a buffer (retuned by playbackRate). */
function makePluck(ctx, midi, seconds = 2.2, t60 = 2.4) {
  const sr = ctx.sampleRate;
  const f0 = mtof(midi);
  const L = Math.max(2, Math.round(sr / f0 - 0.5));
  const actual = sr / (L + 0.5);
  const N = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, N, sr);
  const d = buf.getChannelData(0);
  const line = new Float32Array(L);
  let prev = 0, mean = 0;
  for (let i = 0; i < L; i++) {
    prev = prev * 0.4 + (Math.random() * 2 - 1) * 0.6; // slightly soft excitation
    line[i] = prev;
    mean += prev;
  }
  mean /= L;
  for (let i = 0; i < L; i++) line[i] -= mean;
  const rho = Math.pow(10, -3 / (actual * t60));
  let idx = 0, peak = 0;
  for (let n = 0; n < N; n++) {
    const nx = idx + 1 === L ? 0 : idx + 1;
    const y = line[idx];
    d[n] = y;
    const ay = y < 0 ? -y : y;
    if (ay > peak) peak = ay;
    line[idx] = rho * 0.5 * (y + line[nx]);
    idx = nx;
  }
  const g = 0.9 / (peak || 1);
  const fadeN = Math.floor(sr * 0.06);
  for (let n = 0; n < N; n++) {
    let s = d[n] * g;
    if (n > N - fadeN) s *= (N - n) / fadeN;
    d[n] = s;
  }
  return { buf, f: actual, dur: seconds };
}

const PLUCK_BASES = [50, 57, 64, 71, 78, 85];

function makeCurve(n, fn) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}
/**
 * Transparent safety limiter after the compressor. A WaveShaper only sees inputs in [-1, 1], so the chain is
 * gain 0.5 -> shaper -> gain 2: the curve below is defined for the *pre-attenuated* signal and behaves like
 * a soft-knee limiter over input +-2 (+6 dB over full scale): identity up to 0.7, then a tanh knee that
 * settles at 0.95.
 */
const SAFE_CURVE = makeCurve(4097, (x) => {
  const v = x * 2;
  const a = Math.abs(v);
  const y = a <= 0.7 ? a : 0.7 + 0.25 * Math.tanh((a - 0.7) / 0.25);
  return (Math.sign(v) * y) / 2;
});

const resCache = new WeakMap();
function getRes(ctx) {
  let r = resCache.get(ctx);
  if (!r) {
    r = {
      _noise: null,
      _ir: null,
      _dist: null,
      _plucks: {},
      get noise() {
        return this._noise || (this._noise = makeNoiseBuffers(ctx));
      },
      get ir() {
        return this._ir || (this._ir = makeImpulse(ctx));
      },
      get dist() {
        return this._dist || (this._dist = makeCurve(1024, (x) => Math.tanh(x * 2.0) * 0.95));
      },
      pluck(midi) {
        let best = PLUCK_BASES[0];
        for (const b of PLUCK_BASES) if (Math.abs(b - midi) < Math.abs(best - midi)) best = b;
        return this._plucks[best] || (this._plucks[best] = makePluck(ctx, best));
      },
    };
    resCache.set(ctx, r);
  }
  return r;
}

/* ========================================================================== *
 *  envelope + Voice (tracked, self-cleaning graph fragment)
 * ========================================================================== */

/** attack (linear) -> hold -> exponential release to silence. `rel` is time to -70 dB. */
function env(param, t, a, peak, hold, rel) {
  const p = peak > 0.0002 ? peak : 0.0002;
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(p, t + Math.max(a, 0.0005));
  if (hold > 0) param.setValueAtTime(p, t + a + hold);
  param.exponentialRampToValueAtTime(0.0001, t + a + hold + Math.max(rel, 0.005));
}

const BELL = [[1, 1, 1], [2.756, 0.45, 0.6], [5.404, 0.22, 0.34], [8.933, 0.1, 0.2]];
const GLOCK = [[1, 1, 1], [3.99, 0.32, 0.42], [9.5, 0.09, 0.2]];
const SOFT = [[1, 1, 1], [2, 0.22, 0.55], [3, 0.08, 0.3]];
const CELESTA = [[1, 1, 1], [4.01, 0.28, 0.5], [6.28, 0.1, 0.3]];
const COINP = [[1, 1, 1], [2.02, 0.38, 0.5], [3.97, 0.14, 0.3]];

/**
 * A Voice owns the output gain (volume / pan / reverb send) of one sound plus every node
 * created for it. When the last source node ends, the whole fragment is disconnected.
 * All `t` arguments of the helpers taking a `p` object are offsets from the voice start,
 * all frequencies are multiplied by the voice pitch.
 */
class Voice {
  constructor(ctx, dest, o, wet = 0, jit = 0) {
    this.ctx = ctx;
    this.res = getRes(ctx);
    this.t0 = o.when != null ? o.when : ctx.currentTime;
    this.k = (o.pitch > 0 ? o.pitch : 1) * (jit ? 1 + (Math.random() * 2 - 1) * jit : 1);
    this.nodes = [];
    this.live = 0;
    this.end = this.t0;
    this.dead = false;
    this._ended = () => {
      if (--this.live <= 0) this.dispose();
    };
    stats.voices++;
    const out = ctx.createGain();
    out.gain.value = o.volume != null ? o.volume : 1;
    this.nodes.push(out);
    this.out = out;
    let tail = out;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      out.connect(p);
      this.nodes.push(p);
      tail = p;
    }
    tail.connect(dest);
    if (o.rev && wet > 0) this.send(tail, o.rev, wet);
    if (o.sends) for (const s of o.sends) if (s && s[0]) this.send(tail, s[0], s[1]);
    lastVoice = this;
  }

  send(from, to, amt) {
    const g = this.ctx.createGain();
    g.gain.value = amt;
    from.connect(g);
    g.connect(to);
    this.nodes.push(g);
    return g;
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    stats.disposed++;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch (e) {
        /* already gone */
      }
    }
    this.nodes.length = 0;
  }

  /** register any node for cleanup */
  add(n) {
    this.nodes.push(n);
    return n;
  }

  gn(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }

  flt(type, f, q) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = clamp(f, 10, this.ctx.sampleRate * 0.45);
    b.Q.value = q;
    this.nodes.push(b);
    return b;
  }

  /** start + schedule stop of a source node; tracks its lifetime */
  begin(src, t0, t1, off) {
    this.live++;
    src.onended = this._ended;
    this.nodes.push(src);
    if (off != null) src.start(t0, off);
    else src.start(t0);
    src.stop(t1);
    if (t1 > this.end) this.end = t1;
    return src;
  }

  /** raw oscillator, absolute start time t and duration */
  osc(type, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = type;
    return this.begin(o, t, t + dur);
  }

  /** looping noise source (random offset), absolute start time */
  nsrc(kind, t, dur) {
    const s = this.ctx.createBufferSource();
    const buf = this.res.noise[kind] || this.res.noise.white;
    s.buffer = buf;
    s.loop = true;
    return this.begin(s, t, t + dur, Math.random() * (buf.duration - 0.1));
  }

  /** enveloped oscillator */
  tone(p) {
    const ctx = this.ctx, k = this.k;
    const t = this.t0 + (p.t || 0);
    const a = p.a != null ? p.a : 0.005, hold = p.hold || 0, rel = p.rel != null ? p.rel : 0.2;
    const dur = a + hold + rel;
    const o = this.osc(p.type || 'sine', t, dur + 0.03);
    const nyq = ctx.sampleRate * 0.47;
    const f0 = Math.min(p.f * k, nyq);
    o.frequency.setValueAtTime(f0, t);
    if (p.f2) {
      const gt = t + (p.gl != null ? p.gl : dur), f1 = Math.min(p.f2 * k, nyq);
      if (p.lin) o.frequency.linearRampToValueAtTime(f1, gt);
      else o.frequency.exponentialRampToValueAtTime(f1, gt);
    }
    if (p.det) o.detune.value = p.det;
    if (p.vr) {
      const l = this.osc('sine', t, dur + 0.03);
      l.frequency.value = p.vr;
      const lg = this.gn(0);
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(p.vc || 15, t + (p.vd || 0.15));
      l.connect(lg);
      lg.connect(o.detune);
    }
    let node = o;
    if (p.lp) {
      const f = this.flt(p.ft || 'lowpass', p.lp * k, p.q != null ? p.q : 0.7);
      if (p.lp2) {
        f.frequency.setValueAtTime(clamp(p.lp * k, 10, ctx.sampleRate * 0.45), t);
        f.frequency.exponentialRampToValueAtTime(clamp(p.lp2 * k, 10, ctx.sampleRate * 0.45), t + (p.lpt != null ? p.lpt : dur));
      }
      node.connect(f);
      node = f;
    }
    const g = this.gn(0);
    env(g.gain, t, a, p.peak, hold, rel);
    node.connect(g);
    g.connect(p.dest || this.out);
    return g;
  }

  /** enveloped, filtered noise. `bursts` = [[offset, peak, dur], ...] replaces the envelope */
  noise(p) {
    const ctx = this.ctx, k = this.k;
    const t = this.t0 + (p.t || 0);
    const a = p.a != null ? p.a : 0.004, hold = p.hold || 0, rel = p.rel != null ? p.rel : 0.1;
    let dur = a + hold + rel;
    let bursts = null;
    if (p.bursts) {
      bursts = p.bursts.slice().sort((x, y) => x[0] - y[0]);
      const last = bursts[bursts.length - 1];
      dur = last[0] + last[2];
    }
    const s = this.nsrc(p.buf || 'white', t, dur + 0.03);
    let node = s;
    if (p.ft !== 'none') {
      const f0 = clamp((p.f || 1000) * k, 10, ctx.sampleRate * 0.45);
      const f = this.flt(p.ft || 'bandpass', f0, p.q != null ? p.q : 0.8);
      if (p.f2) {
        f.frequency.setValueAtTime(f0, t);
        f.frequency.exponentialRampToValueAtTime(clamp(p.f2 * k, 10, ctx.sampleRate * 0.45), t + (p.gl != null ? p.gl : dur));
      }
      node.connect(f);
      node = f;
    }
    const g = this.gn(0);
    if (bursts) {
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < bursts.length; i++) {
        const [bt, bp, bd0] = bursts[i];
        const room = i + 1 < bursts.length ? bursts[i + 1][0] - bt - 0.001 : bd0;
        const bd = Math.max(0.004, Math.min(bd0, room));
        const tb = t + bt;
        g.gain.setValueAtTime(0.0001, tb);
        g.gain.linearRampToValueAtTime(Math.max(bp, 0.0002), tb + 0.0015);
        g.gain.exponentialRampToValueAtTime(0.0001, tb + bd);
      }
    } else {
      env(g.gain, t, a, p.peak, hold, rel);
    }
    node.connect(g);
    g.connect(p.dest || this.out);
    return g;
  }

  /** crackling spray: noise with a randomly flickering decaying envelope */
  spray(p) {
    const ctx = this.ctx, k = this.k;
    const t = this.t0 + (p.t || 0), dur = p.dur, n = p.n || 30;
    const s = this.nsrc(p.buf || 'pink', t, dur + 0.05);
    const f0 = clamp(p.f * k, 10, ctx.sampleRate * 0.45);
    const f = this.flt(p.ft || 'highpass', f0, p.q != null ? p.q : 0.6);
    if (p.f2) {
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(clamp(p.f2 * k, 10, ctx.sampleRate * 0.45), t + dur);
    }
    const g = this.gn(0);
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const a = i === 0 ? 0 : Math.pow(1 - x, p.curve || 1.7);
      const val = Math.max(0.0001, p.peak * a * (0.3 + 0.7 * Math.random()));
      g.gain.linearRampToValueAtTime(val, t + Math.max(0.006, x * dur));
    }
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    return g;
  }

  /** additive inharmonic bell / glockenspiel hit */
  bell(p) {
    const parts = p.parts || BELL;
    const nyq = this.ctx.sampleRate * 0.42;
    for (const [ratio, amp, ds] of parts) {
      const f = p.f * ratio;
      if (f * this.k > nyq) continue;
      this.tone({ t: p.t, type: 'sine', f, a: p.a != null ? p.a : 0.004, rel: p.rel * ds, peak: p.peak * amp, dest: p.dest });
    }
  }

  /** Karplus-Strong pluck (buffer playback retuned to `midi`) */
  pluck(p) {
    const ctx = this.ctx;
    const t = this.t0 + (p.t || 0);
    const pl = this.res.pluck(p.midi);
    const rate = (mtof(p.midi) * this.k) / pl.f;
    const dur = Math.max(0.05, p.dur || 0.5), rel = p.rel != null ? p.rel : 0.25;
    const s = ctx.createBufferSource();
    s.buffer = pl.buf;
    s.playbackRate.value = rate;
    this.begin(s, t, t + Math.min(dur + rel + 0.05, pl.dur / rate - 0.01), 0);
    let node = s;
    if (p.lp) {
      const f = this.flt('lowpass', p.lp * this.k, 0.5);
      node.connect(f);
      node = f;
    }
    const g = this.gn(0);
    env(g.gain, t, 0.002, p.peak, dur, rel);
    node.connect(g);
    g.connect(p.dest || this.out);
    return g;
  }
}

/* ========================================================================== *
 *  SFX builders:  (ctx, destination, opts) -> absolute end time
 *  opts = { when, volume, pitch, pan, rev }   (rev = reverb send node or null)
 * ========================================================================== */

/* ---- UI ---------------------------------------------------------------- */

function sfxClick(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.07);
  v.tone({ f: 1500, f2: 760, gl: 0.03, a: 0.001, rel: 0.07, peak: 0.2 });
  v.tone({ type: 'triangle', f: 2500, f2: 1500, gl: 0.02, a: 0.001, rel: 0.03, peak: 0.05 });
  v.noise({ buf: 'pink', f: 3400, q: 1.2, a: 0.001, rel: 0.02, peak: 0.1 });
  return v.end;
}

function sfxHover(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.02, 0.06);
  v.tone({ type: 'triangle', f: 2300, f2: 2000, gl: 0.012, a: 0.001, rel: 0.025, peak: 0.1 });
  return v.end;
}

function sfxOpen(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.1, 0.04);
  v.noise({ buf: 'pink', f: 500, f2: 2800, gl: 0.16, q: 1.1, a: 0.05, hold: 0.02, rel: 0.12, peak: 0.5 });
  v.tone({ t: 0.09, f: 420, f2: 900, gl: 0.07, a: 0.004, rel: 0.13, peak: 0.24 });
  v.tone({ t: 0.09, type: 'triangle', f: 840, f2: 1800, gl: 0.07, a: 0.004, rel: 0.08, peak: 0.07 });
  return v.end;
}

function sfxClose(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.04);
  v.noise({ buf: 'pink', f: 2400, f2: 420, gl: 0.13, q: 1.1, a: 0.02, rel: 0.12, peak: 0.45 });
  v.tone({ f: 760, f2: 360, gl: 0.08, a: 0.003, rel: 0.12, peak: 0.22 });
  v.tone({ type: 'triangle', f: 1520, f2: 720, gl: 0.08, a: 0.003, rel: 0.06, peak: 0.05 });
  return v.end;
}

function sfxError(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.06, 0.04);
  v.tone({ type: 'triangle', f: 277, f2: 237, gl: 0.1, a: 0.004, hold: 0.04, rel: 0.13, peak: 0.34, lp: 1600 });
  v.tone({ t: 0.12, type: 'triangle', f: 208, f2: 165, gl: 0.16, a: 0.004, hold: 0.06, rel: 0.24, peak: 0.38, lp: 1400 });
  v.tone({ t: 0.12, type: 'square', f: 208, f2: 165, gl: 0.16, a: 0.004, hold: 0.04, rel: 0.16, peak: 0.08, lp: 800 });
  return v.end;
}

/* ---- money ------------------------------------------------------------- */

function sfxBuy(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.2, 0.03);
  // "ka": drawer clack
  v.noise({ buf: 'white', f: 2400, q: 0.9, bursts: [[0, 0.7, 0.02], [0.022, 0.35, 0.02]] });
  v.tone({ f: 330, f2: 140, gl: 0.04, a: 0.001, rel: 0.07, peak: 0.28 });
  // "ching": bright bell
  v.bell({ t: 0.06, f: 2093, parts: [[1, 1, 1], [2.756, 0.4, 0.55], [5.404, 0.12, 0.3]], peak: 0.26, rel: 0.85 });
  v.bell({ t: 0.06, f: 3136, parts: COINP, peak: 0.1, rel: 0.55 });
  return v.end;
}

function sfxCoin(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.14, 0.05);
  v.tone({ type: 'square', f: 988, a: 0.002, rel: 0.07, peak: 0.07, lp: 4200 });
  v.tone({ f: 988, a: 0.002, rel: 0.07, peak: 0.16 });
  v.tone({ t: 0.06, type: 'square', f: 1319, a: 0.002, rel: 0.5, peak: 0.07, lp: 5200 });
  v.tone({ t: 0.06, f: 1319, a: 0.002, rel: 0.55, peak: 0.2 });
  v.tone({ t: 0.06, f: 2637, a: 0.002, rel: 0.25, peak: 0.07 });
  return v.end;
}

function sfxCoins(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.22, 0.03);
  let t = 0, gap = 0.092;
  for (let i = 0; i < 8; i++) {
    const f = pick([1319, 1568, 1760, 2093, 2349, 2637, 3136]);
    const amp = 1 - i * 0.05;
    v.bell({ t, f, parts: COINP, peak: 0.2 * amp, rel: 0.32 });
    v.noise({ t, buf: 'white', ft: 'highpass', f: 5200, q: 0.5, bursts: [[0, 0.16 * amp, 0.012]] });
    t += gap * rr(0.85, 1.15);
    gap *= 0.86;
  }
  v.bell({ t: t + 0.02, f: 3136, parts: SOFT, peak: 0.12, rel: 0.32 });
  return v.end;
}

/* ---- water ------------------------------------------------------------- */

function sfxPlop(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.07, 0.12);
  v.tone({ f: 330, f2: 900, gl: 0.055, a: 0.002, rel: 0.13, peak: 0.42 });
  v.tone({ f: 660, f2: 1800, gl: 0.055, a: 0.002, rel: 0.06, peak: 0.08 });
  v.noise({ buf: 'pink', f: 1800, q: 1, a: 0.001, rel: 0.02, peak: 0.2 });
  return v.end;
}

function sfxSplash(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.12, 0.1);
  v.noise({ buf: 'white', f: 2600, f2: 1000, gl: 0.26, q: 0.7, a: 0.008, rel: 0.4, peak: 0.85 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 900, f2: 300, gl: 0.16, q: 0.5, a: 0.005, rel: 0.2, peak: 0.55 });
  v.tone({ f: 200, f2: 80, gl: 0.1, a: 0.004, rel: 0.16, peak: 0.22 });
  for (let i = 0; i < 3; i++) {
    const f = rr(700, 1700);
    v.tone({ t: rr(0.07, 0.3), f, f2: f * 1.8, gl: 0.04, a: 0.002, rel: 0.09, peak: 0.07 });
  }
  return v.end;
}

function sfxBigSplash(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.16, 0.08);
  v.tone({ f: 150, f2: 42, gl: 0.32, a: 0.004, rel: 0.5, peak: 0.55 });
  v.tone({ type: 'triangle', f: 96, f2: 50, gl: 0.22, a: 0.004, rel: 0.3, peak: 0.2, lp: 420 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 1500, f2: 240, gl: 0.6, q: 0.5, a: 0.01, rel: 0.75, peak: 0.95 });
  v.noise({ buf: 'white', f: 3400, f2: 1300, gl: 0.6, q: 0.6, a: 0.006, rel: 0.8, peak: 1.0 });
  v.spray({ t: 0.04, dur: 1.15, f: 2600, f2: 1500, peak: 0.5, n: 46 });
  for (let i = 0; i < 14; i++) {
    const f = rr(900, 3200);
    v.tone({ t: 0.12 + i * 0.07 + rr(0, 0.05), f, f2: f * 1.5, gl: 0.03, a: 0.001, rel: 0.07, peak: 0.07 * (1 - i / 17) });
  }
  for (let i = 0; i < 3; i++) {
    const f = rr(220, 480);
    v.tone({ t: 0.22 + i * 0.2 + rr(0, 0.06), f, f2: f * 2.3, gl: 0.09, a: 0.004, rel: 0.16, peak: 0.14 * (1 - i * 0.25) });
  }
  return v.end;
}

function sfxBubble(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.25);
  const f = rr(520, 1000);
  v.tone({ f, f2: f * 2.4, gl: 0.045, a: 0.002, rel: 0.09, peak: 0.2 });
  return v.end;
}

/* ---- eating / fish ------------------------------------------------------ */

function crunch(v, t, amp) {
  v.tone({ t, f: 170, f2: 80, gl: 0.05, a: 0.002, rel: 0.09, peak: 0.3 * amp });
  v.noise({
    t,
    buf: 'white',
    f: rr(1400, 2300),
    q: 0.9,
    bursts: [[0, 1.4 * amp, 0.018], [0.014, 1.1 * amp, 0.016], [0.03, 0.9 * amp, 0.018], [0.05, 0.5 * amp, 0.03]],
  });
  v.noise({ t, buf: 'white', ft: 'highpass', f: 4200, q: 0.5, bursts: [[0, 0.3 * amp, 0.03]] });
}

function sfxChomp(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.1);
  crunch(v, 0, 1);
  crunch(v, 0.115, 0.8);
  return v.end;
}

function sfxNibble(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.04, 0.25);
  v.tone({ f: 1100, f2: 420, gl: 0.025, a: 0.001, rel: 0.05, peak: 0.24 });
  v.noise({ buf: 'pink', f: 2200, q: 1, bursts: [[0, 0.14, 0.008]] });
  return v.end;
}

function sfxHeart(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.35, 0.015);
  v.bell({ t: 0, f: 1047, parts: SOFT, peak: 0.3, rel: 0.7 });
  v.bell({ t: 0.11, f: 1568, parts: SOFT, peak: 0.32, rel: 1.0 });
  v.tone({ t: 0.11, f: 3136, a: 0.003, rel: 0.4, peak: 0.05 });
  return v.end;
}

function sfxHatch(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.1, 0.1);
  v.noise({ buf: 'white', f: 2600, q: 1, bursts: [[0, 0.9, 0.012], [0.06, 0.7, 0.01]] });
  for (let i = 0; i < 3; i++) {
    const f = rr(360, 620);
    v.tone({ t: 0.03 + i * 0.09, f, f2: f * 2.2, gl: 0.03, a: 0.002, rel: 0.11, peak: 0.28 });
  }
  v.tone({ t: 0.32, f: 1900, f2: 2700, gl: 0.07, a: 0.01, hold: 0.03, rel: 0.13, peak: 0.16, vr: 34, vc: 60 });
  return v.end;
}

/* ---- jingles ------------------------------------------------------------ */

function sfxDiscover(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.28, 0.01);
  [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
    const t = i * 0.075;
    v.tone({ t, type: 'square', f, a: 0.003, hold: 0.02, rel: 0.2, peak: 0.1, lp: 3200 });
    v.tone({ t, type: 'triangle', f, a: 0.003, rel: 0.22, peak: 0.16 });
  });
  [1046.5, 1318.5, 1568, 2093].forEach((f) => {
    v.tone({ t: 0.5, type: 'square', f, a: 0.012, hold: 0.28, rel: 0.6, peak: 0.055, lp: 3600 });
    v.tone({ t: 0.5, f, a: 0.012, hold: 0.26, rel: 0.7, peak: 0.1 });
    v.tone({ t: 0.5, f: f * 1.005, a: 0.012, hold: 0.18, rel: 0.6, peak: 0.04 });
  });
  for (let i = 0; i < 10; i++) {
    v.tone({ t: 0.5 + i * 0.085 + rr(0, 0.04), f: pick([2093, 2637, 3136, 3520, 4186]), a: 0.003, rel: 0.25, peak: 0.06 * (1 - i / 14) });
  }
  return v.end;
}

function sfxResearch(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.2, 0.04);
  [[0, 380], [0.12, 520], [0.24, 690]].forEach(([t, f]) => {
    v.tone({ t, f, f2: f * 2.2, gl: 0.07, a: 0.003, rel: 0.13, peak: 0.28 });
    v.tone({ t, f: f * 2, f2: f * 4.4, gl: 0.07, a: 0.003, rel: 0.06, peak: 0.06 });
  });
  v.bell({ t: 0.38, f: 1760, parts: GLOCK, peak: 0.26, rel: 0.8 });
  v.noise({ buf: 'white', ft: 'highpass', f: 5500, q: 0.5, bursts: [[0, 0.16, 0.01], [0.09, 0.14, 0.01], [0.17, 0.16, 0.01], [0.3, 0.12, 0.01]] });
  return v.end;
}

function sfxLevelUp(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.25, 0.01);
  [392, 523.25, 659.25, 783.99].forEach((f, i) => {
    const t = i * 0.07;
    v.tone({ t, type: 'square', f, a: 0.003, hold: 0.03, rel: 0.16, peak: 0.1, lp: 3000 });
    v.tone({ t, type: 'triangle', f, a: 0.003, rel: 0.18, peak: 0.15 });
  });
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => {
    v.tone({ t: 0.3, type: 'square', f, a: 0.01, hold: 0.22, rel: 0.6, peak: 0.06, lp: 3400 });
    v.tone({ t: 0.3, f, a: 0.01, hold: 0.2, rel: 0.7, peak: 0.1 });
  });
  v.bell({ t: 0.3, f: 2093, parts: GLOCK, peak: 0.2, rel: 0.9 });
  return v.end;
}

/* ---- building ----------------------------------------------------------- */

function sfxPlace(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.08);
  v.tone({ f: 190, f2: 78, gl: 0.09, a: 0.002, rel: 0.2, peak: 0.45 });
  v.tone({ type: 'triangle', f: 480, f2: 270, gl: 0.03, a: 0.001, rel: 0.09, peak: 0.34 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 900, q: 0.5, a: 0.002, rel: 0.12, peak: 0.7 });
  v.noise({ buf: 'pink', f: 1700, q: 1, bursts: [[0, 0.9, 0.02]] });
  return v.end;
}

function knock(v, t, f, amp) {
  v.tone({ t, f, f2: f * 0.6, gl: 0.04, a: 0.001, rel: 0.1, peak: 0.4 * amp });
  v.tone({ t, type: 'triangle', f: f * 2, f2: f * 1.25, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.1 * amp });
  v.noise({ t, buf: 'pink', f: 1500, q: 1.2, bursts: [[0, 0.6 * amp, 0.02]] });
}

function sfxBuild(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.22, 0.03);
  knock(v, 0, 320, 1);
  knock(v, 0.11, 290, 0.85);
  v.bell({ t: 0.27, f: 1046.5, parts: SOFT, peak: 0.26, rel: 0.7 });
  v.bell({ t: 0.36, f: 1568, parts: SOFT, peak: 0.26, rel: 0.8 });
  v.bell({ t: 0.45, f: 2093, parts: GLOCK, peak: 0.24, rel: 0.9 });
  return v.end;
}

function sfxHammer(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.03, 0.15);
  v.tone({ type: 'triangle', f: 1000, f2: 600, gl: 0.015, a: 0.001, rel: 0.05, peak: 0.16 });
  v.noise({ buf: 'pink', f: 2400, q: 1.4, bursts: [[0, 0.3, 0.012]] });
  return v.end;
}

function sfxDemolish(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.1, 0.08);
  v.tone({ f: 130, f2: 48, gl: 0.22, a: 0.003, rel: 0.4, peak: 0.5 });
  v.noise({ buf: 'pink', f: 900, f2: 400, gl: 0.4, q: 0.8, a: 0.004, rel: 0.55, peak: 1.0 });
  const cr = [];
  for (let i = 0; i < 7; i++) cr.push([i * 0.05 + rr(0, 0.03), rr(0.6, 1.1), 0.012]);
  v.noise({ buf: 'white', f: 2200, q: 0.8, bursts: cr });
  for (let i = 0; i < 4; i++) {
    const f = rr(250, 600);
    v.tone({ t: rr(0.03, 0.3), type: 'triangle', f, f2: f * 0.6, gl: 0.07, a: 0.002, rel: 0.12, peak: 0.13 });
  }
  return v.end;
}

function sfxDig(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.1);
  v.noise({ buf: 'brown', f: 500, f2: 1700, gl: 0.17, q: 0.6, a: 0.03, rel: 0.14, peak: 1.2 });
  v.noise({ buf: 'white', ft: 'highpass', f: 3000, q: 0.5, bursts: [[0.02, 0.14, 0.02], [0.06, 0.12, 0.02], [0.1, 0.1, 0.02], [0.13, 0.08, 0.02]] });
  v.tone({ t: 0.16, f: 145, f2: 68, gl: 0.06, a: 0.002, rel: 0.14, peak: 0.34 });
  v.noise({ t: 0.21, buf: 'white', f: 2200, f2: 1100, gl: 0.2, q: 0.8, a: 0.008, rel: 0.25, peak: 0.7 });
  const f = rr(500, 900);
  v.tone({ t: 0.23, f, f2: f * 2, gl: 0.05, a: 0.002, rel: 0.09, peak: 0.13 });
  return v.end;
}

function sfxGate(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.06);
  v.tone({ type: 'sawtooth', f: 120, f2: 205, gl: 0.34, a: 0.03, hold: 0.24, rel: 0.1, peak: 1.0, lp: 800, ft: 'bandpass', q: 4, vr: 41, vc: 90, vd: 0.05 });
  v.tone({ type: 'square', f: 143, f2: 236, gl: 0.34, a: 0.03, hold: 0.22, rel: 0.1, peak: 0.45, lp: 1300, ft: 'bandpass', q: 3, vr: 29, vc: 120, vd: 0.05 });
  v.tone({ t: 0.37, f: 120, f2: 52, gl: 0.09, a: 0.002, rel: 0.24, peak: 0.55 });
  v.noise({ t: 0.37, buf: 'brown', ft: 'lowpass', f: 550, q: 0.5, a: 0.002, rel: 0.14, peak: 0.55 });
  v.tone({ t: 0.37, type: 'triangle', f: 320, f2: 180, gl: 0.04, a: 0.001, rel: 0.09, peak: 0.16 });
  return v.end;
}

/* ---- factory whistle & bell -------------------------------------------- */

function sfxWhistle(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.5, 0.008);
  const t = v.t0, k = v.k, L = 1.35, T = L + 0.55;
  const lp = v.flt('lowpass', 2300, 0.4); // a little distant
  const eg = v.gn(0);
  eg.gain.setValueAtTime(0.0001, t);
  eg.gain.linearRampToValueAtTime(0.28, t + 0.07);
  eg.gain.linearRampToValueAtTime(0.4, t + 0.4);
  eg.gain.setValueAtTime(0.4, t + L);
  eg.gain.exponentialRampToValueAtTime(0.0003, t + T);
  lp.connect(eg);
  eg.connect(v.out);
  // slow pressure wobble shared by all pipes
  const vib = v.osc('sine', t, T + 0.05);
  vib.frequency.value = 5.3;
  const vibG = v.gn(7);
  vib.connect(vibG);
  // two-tone: a perfect fourth (D4 + G4) with a faint octave on top
  [[293.66, 1], [392, 0.9], [587.33, 0.3]].forEach(([f0, amp]) => {
    const f = f0 * k;
    const os = v.osc('sine', t, T + 0.05);
    const sw = v.osc('sawtooth', t, T + 0.05);
    for (const s of [os, sw]) {
      s.frequency.setValueAtTime(f * 0.94, t); // steam scoop up
      s.frequency.exponentialRampToValueAtTime(f, t + 0.14);
      s.frequency.setValueAtTime(f, t + L - 0.2);
      s.frequency.exponentialRampToValueAtTime(f * 0.925, t + T); // pitch sags as pressure drops
      vibG.connect(s.detune);
    }
    sw.detune.value = 3;
    const g1 = v.gn(0.42 * amp), g2 = v.gn(0.22 * amp), sf = v.flt('lowpass', f * 6, 0.4);
    os.connect(g1);
    g1.connect(lp);
    sw.connect(sf);
    sf.connect(g2);
    g2.connect(lp);
    // air resonating in the pipe
    const n = v.nsrc('pink', t, T + 0.05), nb = v.flt('bandpass', f * 2, 10), ng = v.gn(7 * amp);
    n.connect(nb);
    nb.connect(ng);
    ng.connect(lp);
  });
  // steam "pfff" at the start + constant hiss
  const s = v.nsrc('white', t, T + 0.05), sb = v.flt('bandpass', 3400, 1.4), sg = v.gn(0);
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.linearRampToValueAtTime(0.6, t + 0.03);
  sg.gain.exponentialRampToValueAtTime(0.13, t + 0.5);
  sg.gain.setValueAtTime(0.13, t + L);
  sg.gain.exponentialRampToValueAtTime(0.0003, t + T);
  s.connect(sb);
  sb.connect(sg);
  sg.connect(lp);
  return v.end;
}

function sfxBell(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.18, 0.03);
  [0, 0.17].forEach((t, i) => {
    v.bell({ t, f: i ? 1568 : 1560, parts: BELL, peak: 0.3, rel: 0.9 });
    v.noise({ t, buf: 'white', f: 4500, q: 0.8, bursts: [[0, 0.2, 0.008]] });
  });
  return v.end;
}

/* ---- bears -------------------------------------------------------------- */

function sfxFootsteps(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.02, 0.18);
  v.tone({ f: 150, f2: 68, gl: 0.07, a: 0.003, rel: 0.14, peak: 0.5 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 700, q: 0.5, a: 0.003, rel: 0.1, peak: 0.7 });
  v.noise({ buf: 'pink', f: 1100, q: 0.9, bursts: [[0.004, 0.5, 0.035]] }); // dry leaves / dirt
  return v.end;
}

function sfxJump(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.06, 0.08);
  const t = v.t0, k = v.k, T = 0.42;
  const os = v.osc('sine', t, T + 0.05);
  const ot = v.osc('triangle', t, T + 0.05);
  const g = v.gn(0);
  env(g.gain, t, 0.006, 0.4, 0.04, T - 0.05);
  for (const s of [os, ot]) {
    s.frequency.setValueAtTime(190 * k, t);
    s.frequency.exponentialRampToValueAtTime(470 * k, t + 0.16);
    s.frequency.exponentialRampToValueAtTime(330 * k, t + T);
  }
  // spring wobble: decaying pitch LFO
  const l = v.osc('sine', t, T + 0.05);
  l.frequency.value = 17;
  const lg = v.gn(0);
  lg.gain.setValueAtTime(300, t + 0.02);
  lg.gain.exponentialRampToValueAtTime(8, t + T);
  l.connect(lg);
  lg.connect(os.detune);
  lg.connect(ot.detune);
  const tg = v.gn(0.35);
  os.connect(g);
  ot.connect(tg);
  tg.connect(g);
  g.connect(v.out);
  v.noise({ buf: 'pink', f: 500, f2: 1500, gl: 0.2, q: 0.9, a: 0.04, rel: 0.16, peak: 0.34 });
  return v.end;
}

function sfxGrowl(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.08);
  const t = v.t0, k = v.k, T = 0.85;
  const saw = v.osc('sawtooth', t, T + 0.06);
  saw.frequency.setValueAtTime(96 * k, t);
  saw.frequency.exponentialRampToValueAtTime(70 * k, t + 0.5);
  saw.frequency.exponentialRampToValueAtTime(84 * k, t + T);
  const vib = v.osc('sine', t, T + 0.06);
  vib.frequency.value = 7.5;
  const vg = v.gn(35);
  vib.connect(vg);
  vg.connect(saw.detune);
  // rough throat: amplitude modulation
  const am = v.gn(0.55);
  const lfo = v.osc('sine', t, T + 0.06);
  lfo.frequency.value = 28;
  const lg = v.gn(0.45);
  lfo.connect(lg);
  lg.connect(am.gain);
  saw.connect(am);
  const mix = v.gn(0);
  env(mix.gain, t, 0.09, 1.3, 0.45, 0.3);
  // vowel "grrr-oww": moving formants
  const f1 = v.flt('bandpass', 320 * k, 3);
  f1.frequency.setValueAtTime(320 * k, t);
  f1.frequency.exponentialRampToValueAtTime(650 * k, t + 0.4);
  f1.frequency.exponentialRampToValueAtTime(430 * k, t + T);
  const f2 = v.flt('bandpass', 1100 * k, 4);
  const g1 = v.gn(1.0), g2 = v.gn(0.4);
  am.connect(f1);
  f1.connect(g1);
  g1.connect(mix);
  am.connect(f2);
  f2.connect(g2);
  g2.connect(mix);
  // breathy rumble
  const n = v.nsrc('brown', t, T + 0.06), nl = v.flt('lowpass', 500, 0.5), ng = v.gn(0.35);
  n.connect(nl);
  nl.connect(ng);
  ng.connect(mix);
  mix.connect(v.out);
  return v.end;
}

function sfxRoar(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.18, 0.06);
  const t = v.t0, k = v.k, T = 1.25, D = T + 0.55;
  const oscs = [v.osc('sawtooth', t, D), v.osc('sawtooth', t, D), v.osc('square', t, D)];
  const base = [104, 107, 52];
  const amps = [0.5, 0.5, 0.35];
  const sum = v.gn(1);
  oscs.forEach((s, i) => {
    const f = base[i] * k;
    s.frequency.setValueAtTime(f * 0.8, t);
    s.frequency.exponentialRampToValueAtTime(f * 1.55, t + 0.16); // rising "rrRAWR"
    s.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.6);
    s.frequency.exponentialRampToValueAtTime(f * 0.62, t + T);
    const g = v.gn(amps[i]);
    s.connect(g);
    g.connect(sum);
  });
  // throat jitter
  const jit = v.osc('sawtooth', t, D);
  jit.frequency.value = 23;
  const jg = v.gn(70);
  jit.connect(jg);
  for (const s of oscs) jg.connect(s.detune);
  // roughness (AM) then soft-clip for grit
  const am = v.gn(0.5);
  const lfo = v.osc('sine', t, D);
  lfo.frequency.value = 31;
  const lg = v.gn(0.5);
  lfo.connect(lg);
  lg.connect(am.gain);
  sum.connect(am);
  const ws = v.add(ctx.createWaveShaper());
  ws.curve = v.res.dist;
  am.connect(ws);
  // vowel formants sweep open -> closed
  const mix = v.gn(0);
  env(mix.gain, t, 0.05, 1.5, 0.62, 0.6);
  const fa = v.flt('bandpass', 500 * k, 2.5), fb = v.flt('bandpass', 1300 * k, 3);
  fa.frequency.setValueAtTime(500 * k, t);
  fa.frequency.exponentialRampToValueAtTime(950 * k, t + 0.25);
  fa.frequency.exponentialRampToValueAtTime(420 * k, t + T);
  fb.frequency.setValueAtTime(1300 * k, t);
  fb.frequency.exponentialRampToValueAtTime(1750 * k, t + 0.25);
  fb.frequency.exponentialRampToValueAtTime(1000 * k, t + T);
  const ga = v.gn(1), gb = v.gn(0.55);
  ws.connect(fa);
  fa.connect(ga);
  ga.connect(mix);
  ws.connect(fb);
  fb.connect(gb);
  gb.connect(mix);
  // breath
  const n = v.nsrc('pink', t, D), nb = v.flt('bandpass', 800 * k, 0.8), ng = v.gn(0.9);
  n.connect(nb);
  nb.connect(ng);
  ng.connect(mix);
  const lpo = v.flt('lowpass', 2300, 0.5);
  mix.connect(lpo);
  lpo.connect(v.out);
  return v.end;
}

function sfxSmash(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.12, 0.08);
  v.tone({ f: 125, f2: 40, gl: 0.3, a: 0.002, rel: 0.55, peak: 0.6 });
  v.noise({ buf: 'white', f: 1900, f2: 500, gl: 0.45, q: 0.6, a: 0.002, rel: 0.7, peak: 1.3 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 1000, f2: 200, gl: 0.5, q: 0.5, a: 0.003, rel: 0.6, peak: 0.8 });
  const cr = [];
  for (let i = 0; i < 6; i++) cr.push([i * 0.035 + rr(0, 0.02), rr(0.9, 1.5), 0.014]);
  v.noise({ buf: 'white', f: 3200, q: 0.7, bursts: cr });
  for (let i = 0; i < 12; i++) {
    const tt = 0.08 + i * 0.06 + rr(0, 0.05), a = 1 - i / 15;
    if (chance(0.6)) {
      const f = rr(280, 1800);
      v.tone({ t: tt, type: 'triangle', f, f2: f * 0.5, gl: 0.07, a: 0.001, rel: 0.09, peak: 0.12 * a });
    } else {
      v.noise({ t: tt, buf: 'white', f: rr(1500, 4500), q: 1.5, bursts: [[0, 0.6 * a, 0.02]] });
    }
  }
  return v.end;
}

/* ---- reviews ------------------------------------------------------------ */

function sfxReviewGood(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.25, 0.02);
  v.bell({ t: 0, f: 1568, parts: SOFT, peak: 0.24, rel: 0.35 });
  v.bell({ t: 0.075, f: 2093, parts: GLOCK, peak: 0.3, rel: 0.85 });
  [0.09, 0.15, 0.22, 0.3].forEach((t) => v.tone({ t, f: pick([3136, 3520, 4186, 4699]), a: 0.003, rel: 0.2, peak: 0.05 }));
  return v.end;
}

function sfxReviewBad(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.1, 0.02);
  const k = v.k;
  // sad trombone: falling semitones, "wah" filter on each note
  const wah = (t, f, d, f2, vib) => {
    const tt = v.t0 + t;
    const os = v.osc('sawtooth', tt, d + 0.1), sq = v.osc('square', tt, d + 0.1);
    for (const s of [os, sq]) {
      s.frequency.setValueAtTime(f * k, tt);
      if (f2) s.frequency.exponentialRampToValueAtTime(f2 * k, tt + d);
    }
    sq.detune.value = 4;
    if (vib) {
      const l = v.osc('sine', tt, d + 0.1);
      l.frequency.value = 5.2;
      const lg = v.gn(0);
      lg.gain.setValueAtTime(0, tt);
      lg.gain.linearRampToValueAtTime(28, tt + d * 0.7);
      l.connect(lg);
      lg.connect(os.detune);
      lg.connect(sq.detune);
    }
    const lp = v.flt('lowpass', 300, 3);
    lp.frequency.setValueAtTime(300, tt);
    lp.frequency.exponentialRampToValueAtTime(1500, tt + d * 0.35);
    lp.frequency.exponentialRampToValueAtTime(420, tt + d);
    const g = v.gn(0);
    env(g.gain, tt, 0.035, 0.32, d * 0.55, d * 0.45);
    const gs = v.gn(0.5);
    os.connect(lp);
    sq.connect(gs);
    gs.connect(lp);
    lp.connect(g);
    g.connect(v.out);
  };
  wah(0, 233.08, 0.22);
  wah(0.25, 220, 0.22);
  wah(0.5, 207.65, 0.55, 196, true);
  return v.end;
}

/* ---- nature ------------------------------------------------------------- */

function sfxLoon(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.6, 0.03);
  const t = v.t0, k = v.k, T = 2.45;
  // the wail: rises about an octave, hangs, then lifts again at the end
  const pts = [[0, 500], [0.12, 560], [0.5, 860], [0.85, 830], [1.3, 880], [1.7, 1090], [2.05, 1180], [2.4, 1020]];
  const eg = v.gn(0);
  env(eg.gain, t, 0.35, 0.36, 1.5, 0.55);
  const lp = v.flt('lowpass', 3200, 0.3);
  lp.connect(eg);
  eg.connect(v.out);
  const vib = v.osc('sine', t, T + 0.1);
  vib.frequency.value = 5.6;
  const vg = v.gn(0);
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(0, t + 0.5);
  vg.gain.linearRampToValueAtTime(28, t + 1.1);
  vib.connect(vg);
  [[1, 1, 0], [1.004, 0.55, 6], [2, 0.32, 0], [3, 0.1, 0]].forEach(([m, a, det]) => {
    const os = v.osc('sine', t, T + 0.1);
    os.frequency.setValueAtTime(pts[0][1] * m * k, t);
    for (let i = 1; i < pts.length; i++) os.frequency.exponentialRampToValueAtTime(pts[i][1] * m * k, t + pts[i][0]);
    os.detune.value = det;
    vg.connect(os.detune);
    const g = v.gn(a);
    os.connect(g);
    g.connect(lp);
  });
  // faint breathy edge
  const n = v.nsrc('pink', t, T), nb = v.flt('bandpass', 1500 * k, 1.5), ng = v.gn(0.05);
  n.connect(nb);
  nb.connect(ng);
  ng.connect(lp);
  return v.end;
}

function sfxHonk(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.12, 0.08);
  const k = v.k, sk = Math.sqrt(k);
  const syl = (t, d, f0, f1, f2, peak) => {
    const tt = v.t0 + t;
    const os = v.osc('sawtooth', tt, d + 0.1);
    os.frequency.setValueAtTime(f0 * k, tt);
    os.frequency.exponentialRampToValueAtTime(f1 * k, tt + d * 0.4);
    os.frequency.exponentialRampToValueAtTime(f2 * k, tt + d);
    const l = v.osc('sine', tt, d + 0.1);
    l.frequency.value = 31; // rasp
    const lg = v.gn(38);
    l.connect(lg);
    lg.connect(os.detune);
    const g = v.gn(0);
    env(g.gain, tt, 0.012, peak, d * 0.55, d * 0.45);
    [[880, 5, 1], [1900, 6, 0.7], [2900, 5, 0.25]].forEach(([ff, q, a]) => {
      const b = v.flt('bandpass', ff * sk, q), bg = v.gn(a * 2.2);
      os.connect(b);
      b.connect(bg);
      bg.connect(g);
    });
    g.connect(v.out);
  };
  syl(0, 0.12, 330, 400, 380, 0.5);
  syl(0.13, 0.36, 400, 540, 430, 0.6);
  return v.end;
}

function sfxBees(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.1);
  const t = v.t0, k = v.k, T = 1.05;
  const eg = v.gn(0);
  env(eg.gain, t, 0.16, 0.5, 0.5, 0.42);
  const bp = v.flt('bandpass', 900 * k, 1.1);
  bp.connect(eg);
  eg.connect(v.out);
  // buzz tremolo
  const trem = v.gn(0.55);
  const tl = v.osc('sine', t, T + 0.5);
  tl.frequency.value = 105;
  const tg = v.gn(0.45);
  tl.connect(tg);
  tg.connect(trem.gain);
  trem.connect(bp);
  for (let i = 0; i < 5; i++) {
    const os = v.osc('sawtooth', t, T + 0.5);
    os.frequency.value = rr(190, 300) * k;
    os.detune.value = rr(-60, 60);
    const wl = v.osc('sine', t, T + 0.5);
    wl.frequency.value = rr(4, 11);
    const wg = v.gn(rr(40, 90));
    wl.connect(wg);
    wg.connect(os.detune);
    const g = v.gn(0.3);
    os.connect(g);
    g.connect(trem);
  }
  const n = v.nsrc('white', t, T + 0.5), nb = v.flt('bandpass', 2200 * k, 0.8), ng = v.gn(0.16);
  n.connect(nb);
  nb.connect(ng);
  ng.connect(eg);
  return v.end;
}

/* ---- day cycle & game state -------------------------------------------- */

function sfxDayStart(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.4, 0.01);
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    v.bell({ t: i * 0.14, f, parts: SOFT, peak: 0.22, rel: 0.9 });
    v.tone({ t: i * 0.14, type: 'triangle', f, a: 0.003, rel: 0.4, peak: 0.08 });
  });
  [1046.5, 1318.5, 1568].forEach((f) => v.bell({ t: 0.78, f, parts: SOFT, peak: 0.13, rel: 1.4 }));
  return v.end;
}

function sfxDayEnd(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.45, 0.01);
  [1318.5, 1046.5, 783.99, 659.25].forEach((f, i) => {
    v.bell({ t: i * 0.24, f, parts: SOFT, peak: 0.2, rel: 1.0 });
    v.tone({ t: i * 0.24, type: 'triangle', f, a: 0.004, rel: 0.5, peak: 0.06 });
  });
  [523.25, 659.25, 783.99].forEach((f) => v.bell({ t: 0.95, f, parts: SOFT, peak: 0.1, rel: 1.6 }));
  return v.end;
}

function sfxWarning(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.02);
  [0, 0.16].forEach((t) => {
    v.tone({ t, type: 'square', f: 880, a: 0.004, hold: 0.07, rel: 0.05, peak: 0.1, lp: 2600 });
    v.tone({ t, f: 880, a: 0.004, hold: 0.07, rel: 0.05, peak: 0.16 });
    v.tone({ t, f: 1760, a: 0.004, hold: 0.04, rel: 0.04, peak: 0.04 });
  });
  return v.end;
}

function sfxGameOver(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.3, 0.01);
  [[392, 0, 0.26], [349.23, 0.3, 0.26], [311.13, 0.6, 0.26], [261.63, 0.9, 0.9]].forEach(([f, t, d], i) => {
    const last = i === 3;
    v.tone({ t, type: 'triangle', f, f2: last ? f * 0.94 : 0, gl: d, a: 0.01, hold: d * 0.5, rel: d * (last ? 1.4 : 0.9), peak: 0.28, lp: 1800, vr: last ? 5.5 : 0, vc: 25, vd: 0.4 });
    v.tone({ t, f: f / 2, a: 0.01, hold: d * 0.4, rel: d * 0.9, peak: 0.16 });
    v.tone({ t, type: 'square', f, a: 0.01, hold: d * 0.3, rel: d * 0.7, peak: 0.04, lp: 900 });
  });
  return v.end;
}

function sfxFanfare(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.3, 0.01);
  const brass = (t, f, hold, rel, peak) => {
    v.tone({ t, type: 'sawtooth', f, a: 0.02, hold, rel, peak, lp: 500, lp2: 3400, lpt: 0.08, q: 1, det: -6 });
    v.tone({ t, type: 'sawtooth', f, a: 0.02, hold, rel, peak: peak * 0.8, lp: 500, lp2: 3400, lpt: 0.08, q: 1, det: 6 });
  };
  [0, 0.15, 0.3].forEach((t) => brass(t, 392, 0.05, 0.1, 0.06));
  [261.63, 329.63, 392, 523.25, 659.25].forEach((f) => brass(0.45, f, 0.75, 0.85, 0.045));
  v.noise({ t: 0.45, buf: 'white', ft: 'highpass', f: 5500, q: 0.5, a: 0.01, rel: 1.4, peak: 0.16 });
  v.tone({ t: 0.45, f: 98, f2: 60, gl: 0.3, a: 0.004, rel: 0.6, peak: 0.35 });
  [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => v.bell({ t: 0.7 + i * 0.13, f, parts: GLOCK, peak: 0.14, rel: 0.8 }));
  return v.end;
}

/* ---- table: name -> { fn, max concurrent, min gap between starts } -------- */

const SFX = {
  click: { fn: sfxClick, max: 4, gap: 0.03, g: 4.1 },
  hover: { fn: sfxHover, max: 3, gap: 0.05, g: 4.17 },
  open: { fn: sfxOpen, max: 3, gap: 0.05, g: 1.81 },
  close: { fn: sfxClose, max: 3, gap: 0.05, g: 3.65 },
  error: { fn: sfxError, max: 3, gap: 0.1, g: 1.57 },
  buy: { fn: sfxBuy, max: 4, gap: 0.05, g: 2.19 },
  coin: { fn: sfxCoin, max: 8, gap: 0.015, g: 2.78 },
  coins: { fn: sfxCoins, max: 3, gap: 0.08, g: 3.06 },
  plop: { fn: sfxPlop, max: 6, gap: 0.02, g: 3.27 },
  splash: { fn: sfxSplash, max: 6, gap: 0.03, g: 3.33 },
  bigsplash: { fn: sfxBigSplash, max: 3, gap: 0.12, g: 1.89 },
  bubble: { fn: sfxBubble, max: 6, gap: 0.02, g: 3.53 },
  chomp: { fn: sfxChomp, max: 4, gap: 0.03, g: 2.2 },
  nibble: { fn: sfxNibble, max: 5, gap: 0.02, g: 5.8 },
  heart: { fn: sfxHeart, max: 4, gap: 0.05, g: 1.2 },
  hatch: { fn: sfxHatch, max: 4, gap: 0.05, g: 2.22 },
  discover: { fn: sfxDiscover, max: 2, gap: 0.3, g: 1.35 },
  research: { fn: sfxResearch, max: 2, gap: 0.2, g: 2.32 },
  levelup: { fn: sfxLevelUp, max: 2, gap: 0.3, g: 1.25 },
  place: { fn: sfxPlace, max: 3, gap: 0.05, g: 2.61 },
  build: { fn: sfxBuild, max: 3, gap: 0.1, g: 1.95 },
  hammer: { fn: sfxHammer, max: 4, gap: 0.03, g: 8.79 },
  demolish: { fn: sfxDemolish, max: 3, gap: 0.08, g: 2.98 },
  dig: { fn: sfxDig, max: 3, gap: 0.08, g: 1.93 },
  gate: { fn: sfxGate, max: 2, gap: 0.1, g: 1.24 },
  whistle: { fn: sfxWhistle, max: 1, gap: 1, g: 0.9 },
  bell: { fn: sfxBell, max: 2, gap: 0.1, g: 1.5 },
  footsteps: { fn: sfxFootsteps, max: 6, gap: 0.03, g: 2.49 },
  jump: { fn: sfxJump, max: 4, gap: 0.04, g: 1.81 },
  growl: { fn: sfxGrowl, max: 3, gap: 0.1, g: 0.98 },
  roar: { fn: sfxRoar, max: 2, gap: 0.2, g: 0.85 },
  smash: { fn: sfxSmash, max: 3, gap: 0.08, g: 2.01 },
  review_good: { fn: sfxReviewGood, max: 4, gap: 0.05, g: 1.77 },
  review_bad: { fn: sfxReviewBad, max: 3, gap: 0.1, g: 1.03 },
  loon: { fn: sfxLoon, max: 2, gap: 1, g: 0.52 },
  honk: { fn: sfxHonk, max: 3, gap: 0.08, g: 1.18 },
  bees: { fn: sfxBees, max: 2, gap: 0.3, g: 1.63 },
  day_start: { fn: sfxDayStart, max: 1, gap: 1, g: 1.36 },
  day_end: { fn: sfxDayEnd, max: 1, gap: 1, g: 1.37 },
  warning: { fn: sfxWarning, max: 2, gap: 0.15, g: 2.04 },
  gameover: { fn: sfxGameOver, max: 1, gap: 1, g: 1.67 },
  fanfare: { fn: sfxFanfare, max: 1, gap: 1, g: 2.18 },
};
const SFX_NAMES = Object.freeze(Object.keys(SFX));

/* ========================================================================== *
 *  MUSIC: theory helpers
 * ========================================================================== */

const SC = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const PENT = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] };

/** scale degree (may be negative or > 6) -> midi note */
function degNote(key, scale, d) {
  const n = scale.length, o = Math.floor(d / n), i = d - o * n;
  return key + scale[i] + 12 * o;
}
/** stacked thirds inside the scale, root position */
function triad(key, scale, d, size = 3) {
  const c = [];
  for (let i = 0; i < size; i++) c.push(degNote(key, scale, d + 2 * i));
  return c;
}
/** wrap a note into [lo, lo+12) */
function toRange(m, lo) {
  return lo + ((((m - lo) % 12) + 12) % 12);
}
/** the note with the pitch class of `m` that is closest to `ref`, inside [lo, hi] (smooth bass lines) */
function nearOct(m, ref, lo, hi) {
  let best = -1;
  for (let n = lo; n <= hi; n++) {
    if ((((n - m) % 12) + 12) % 12 === 0 && (best < 0 || Math.abs(n - ref) < Math.abs(best - ref))) best = n;
  }
  return best < 0 ? toRange(m, lo) : best;
}
/** compact voicing of a chord inside [lo, lo+12), ascending */
function voicing(chord, lo) {
  return chord.map((m) => toRange(m, lo)).sort((a, b) => a - b);
}
/** sorted midi pitches of a pentatonic scale between lo and hi */
function pentRange(keyPc, type, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (PENT[type].includes((((m - keyPc) % 12) + 12) % 12)) out.push(m);
  return out;
}

// progressions as 0-based scale degrees (I = 0)
const PROG_MAJOR = [[0, 5, 3, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 3, 0, 4], [0, 2, 3, 4], [0, 3, 5, 4]];
const PROG_MINOR = [[0, 5, 2, 6], [0, 3, 6, 2], [0, 6, 5, 6], [0, 5, 3, 4], [0, 3, 4, 0]];
const PROG_LYDIAN = [[0, 1, 0, 4], [0, 1, 5, 4], [0, 4, 5, 1], [0, 5, 1, 4]];

const RH_TITLE = [[0, 6, 10], [0, 4, 8, 12], [2, 8, 12], [0, 8], [0, 3, 6, 10, 14], [4, 8, 14], [0, 6, 8, 12]];
const RH_DAY = [[0, 4, 6, 8, 12], [0, 3, 6, 8, 10, 12], [0, 2, 4, 8, 11, 14], [2, 6, 8, 12], [0, 6, 8, 14], [0, 4, 8, 10, 12], [0, 8, 10], [0, 3, 6, 10, 12]];
const RH_RUSH = [[0, 2, 3, 6, 8, 10, 11, 14], [0, 3, 4, 7, 8, 11, 12, 15], [0, 2, 4, 6, 8, 10, 12, 14], [0, 1, 2, 4, 6, 8, 9, 10, 12], [0, 3, 6, 8, 11, 14]];
const RH_NIGHT = [[0], [0, 8], [4, 12], [0, 6], [2, 10], [0, 4, 12], [6]];

/** chord progression walker: plays a random progression, then picks another one */
function makeProg(pool) {
  let cur = pick(pool), i = 0;
  return {
    next() {
      if (i >= cur.length) {
        let n;
        do n = pick(pool);
        while (n === cur && pool.length > 1);
        cur = n;
        i = 0;
      }
      return cur[i++];
    },
  };
}

/**
 * Motif-aware pentatonic melody: mostly stepwise moves, first note of each bar snaps to a
 * chord tone, motifs are sometimes repeated (transposed onto the new chord).
 */
const STEPS_UP = [-1, 0, 1, 1, 1, 2, 2, 3];
const STEPS_DOWN = [-3, -2, -2, -1, -1, -1, 0, 1];
const STEPS_FREE = [-2, -1, -1, 0, 1, 1, 2];

function makeMelody(pitches, centerMidi) {
  const last = pitches.length - 1;
  let mid = 0;
  for (let i = 0; i <= last; i++) if (Math.abs(pitches[i] - centerMidi) < Math.abs(pitches[mid] - centerMidi)) mid = i;
  const st = { idx: mid, motif: null };
  const nearest = (idx, pcs) => {
    for (let d = 0; d <= last; d++) {
      for (const j of [idx - d, idx + d]) if (j >= 0 && j <= last && pcs.includes(pitches[j] % 12)) return j;
    }
    return clamp(idx, 0, last);
  };
  return {
    /** rhythm = step positions in a 16-step bar -> [{ s, len, m }] */
    bar(rhythm, pcs, opt = {}) {
      const reuse = st.motif && st.motif.length === rhythm.length && chance(opt.reuse != null ? opt.reuse : 0.4);
      let sim = st.idx;
      const deltas = reuse
        ? st.motif
        : rhythm.map(() => {
            // gravity: mostly stepwise, but drift back towards the home register instead of wandering off
            const pull = (mid - sim) / (last / 2 || 1);
            const d = pick(pull > 0.35 ? STEPS_UP : pull < -0.35 ? STEPS_DOWN : STEPS_FREE);
            sim = clamp(sim + d, 0, last);
            return d;
          });
      let idx = st.idx;
      const evs = [];
      for (let j = 0; j < rhythm.length; j++) {
        if (j === 0) {
          idx = nearest(clamp(idx + deltas[0], 0, last), pcs);
        } else {
          let n = idx + deltas[j];
          if (n < 0) n = -n;
          if (n > last) n = 2 * last - n;
          idx = clamp(n, 0, last);
        }
        const nextS = j + 1 < rhythm.length ? rhythm[j + 1] : 16;
        evs.push({ s: rhythm[j], len: nextS - rhythm[j], m: pitches[idx] });
      }
      if (opt.endPcs) {
        idx = nearest(idx, opt.endPcs);
        evs[evs.length - 1].m = pitches[idx];
      }
      st.idx = idx;
      st.motif = deltas;
      return evs;
    },
  };
}

/* ========================================================================== *
 *  MUSIC: instruments (each builds a self-cleaning Voice at absolute time t)
 * ========================================================================== */

function mv(ctx, out, t, vol, wet, ex) {
  stats.notes++;
  return new Voice(ctx, out.dry, { when: t, volume: vol, rev: out.wet, sends: ex && ex.sends, pan: ex && ex.pan }, wet, 0);
}

/** tempo-synced feedback echo living inside a mood */
function makeEcho(ctx, out, time, fb, lpf, level) {
  const inp = ctx.createGain();
  const d = ctx.createDelay(2.5);
  d.delayTime.value = time;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lpf;
  f.Q.value = 0.3;
  const g = ctx.createGain();
  g.gain.value = fb;
  const o = ctx.createGain();
  o.gain.value = level;
  const w = ctx.createGain();
  w.gain.value = level * 0.6;
  inp.connect(d);
  d.connect(f);
  f.connect(g);
  g.connect(d);
  f.connect(o);
  o.connect(out.dry);
  f.connect(w);
  w.connect(out.wet);
  return { in: inp, nodes: [inp, d, f, g, o, w] };
}

const INS = {
  pad(ctx, out, t, midis, dur, vol, o = {}) {
    const v = mv(ctx, out, t, vol, o.wet != null ? o.wet : 0.55, o);
    const a = Math.min(o.att != null ? o.att : 1.2, dur * 0.6);
    const rel = o.rel != null ? o.rel : 1.6;
    const total = dur + rel + 0.05;
    const lpf = o.lp || 900;
    const lp = v.flt('lowpass', lpf, 0.6);
    lp.frequency.setValueAtTime(lpf * 0.6, t);
    lp.frequency.linearRampToValueAtTime(lpf * 1.25, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(lpf * 0.7, t + total);
    const g = v.gn(0);
    env(g.gain, t, a, 1, Math.max(0, dur - a), rel);
    lp.connect(g);
    g.connect(v.out);
    const n = midis.length;
    for (const m of midis) {
      const f = mtof(m);
      const s1 = v.osc('sawtooth', t, total);
      const s2 = v.osc('triangle', t, total);
      s1.frequency.value = f;
      s1.detune.value = -8 + rr(-2, 2);
      s2.frequency.value = f;
      s2.detune.value = 7 + rr(-2, 2);
      const g1 = v.gn(0.11 / Math.sqrt(n)), g2 = v.gn(0.24 / Math.sqrt(n));
      s1.connect(g1);
      g1.connect(lp);
      s2.connect(g2);
      g2.connect(lp);
    }
    return v;
  },

  pluck(ctx, out, t, midi, dur, vol, o = {}) {
    const v = mv(ctx, out, t, 1, o.wet != null ? o.wet : 0.3, o);
    v.pluck({ midi, dur, peak: vol, lp: o.lp, rel: o.rel });
    return v;
  },

  bass(ctx, out, t, midi, dur, vol) {
    const v = mv(ctx, out, t, vol, 0.04);
    const f = mtof(midi), hold = Math.max(0, dur - 0.1);
    v.tone({ type: 'triangle', f, a: 0.004, hold, rel: 0.25, peak: 0.6, lp: 900, lp2: 380, lpt: 0.18 });
    v.tone({ f, a: 0.004, hold, rel: 0.25, peak: 0.5 });
    return v;
  },

  walk(ctx, out, t, midi, dur, vol) {
    const v = mv(ctx, out, t, vol, 0.03);
    const f = mtof(midi), hold = Math.max(0, dur - 0.05);
    v.tone({ type: 'sawtooth', f, a: 0.003, hold, rel: 0.06, peak: 0.5, lp: 1400, lp2: 350, lpt: 0.1 });
    v.tone({ type: 'square', f, a: 0.003, hold, rel: 0.06, peak: 0.25, lp: 700 });
    v.tone({ f, a: 0.003, hold, rel: 0.07, peak: 0.4 });
    return v;
  },

  kick(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vol, 0);
    v.tone({ f: 135, f2: 46, gl: 0.11, a: 0.001, rel: 0.28, peak: 1 });
    v.noise({ buf: 'pink', ft: 'lowpass', f: 300, q: 0.5, bursts: [[0, 0.7, 0.02]] });
    return v;
  },

  snare(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vol, 0.12);
    v.noise({ buf: 'white', f: 1900, q: 0.7, a: 0.001, rel: 0.16, peak: 2.2 });
    v.tone({ type: 'triangle', f: 210, f2: 150, gl: 0.08, a: 0.001, rel: 0.12, peak: 0.5 });
    return v;
  },

  hat(ctx, out, t, vol, open) {
    const v = mv(ctx, out, t, vol, 0.05);
    v.noise({ buf: 'white', ft: 'highpass', f: 7500, q: 0.5, a: 0.001, rel: open ? 0.22 : 0.05, peak: 0.9 });
    return v;
  },

  shaker(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vol, 0.05);
    v.noise({ buf: 'white', f: 6500, q: 0.9, a: 0.012, rel: 0.06, peak: 1.6 });
    return v;
  },

  glock(ctx, out, t, midi, vol, o = {}) {
    const v = mv(ctx, out, t, vol, o.wet != null ? o.wet : 0.5, o);
    v.bell({ f: mtof(midi), parts: GLOCK, peak: 1, rel: o.rel || 1.1 });
    return v;
  },

  celesta(ctx, out, t, midi, vol, o = {}) {
    const v = mv(ctx, out, t, vol, o.wet != null ? o.wet : 0.7, o);
    v.bell({ f: mtof(midi), parts: CELESTA, peak: 1, rel: o.rel || 2.4 });
    return v;
  },

  stab(ctx, out, t, midis, vol) {
    const v = mv(ctx, out, t, vol, 0.08);
    const s = 1 / Math.sqrt(midis.length);
    for (const m of midis) {
      const f = mtof(m);
      v.tone({ type: 'square', f, a: 0.003, rel: 0.12, peak: 0.5 * s, lp: 2800, lp2: 900, lpt: 0.08 });
      v.tone({ type: 'sawtooth', f, det: 7, a: 0.003, rel: 0.1, peak: 0.25 * s, lp: 2400, lp2: 800, lpt: 0.07 });
    }
    return v;
  },

  lead(ctx, out, t, midi, dur, vol) {
    const v = mv(ctx, out, t, vol, 0.12);
    const f = mtof(midi);
    v.tone({ type: 'square', f, a: 0.004, hold: dur * 0.4, rel: dur * 0.5 + 0.05, peak: 0.5, lp: 3200, lp2: 1500, lpt: dur });
    v.tone({ type: 'triangle', f: f * 2, a: 0.004, hold: dur * 0.3, rel: dur * 0.4 + 0.04, peak: 0.12 });
    return v;
  },

  /** slow aurora shimmer: a few high sines swelling in and out */
  shimmer(ctx, out, t, pitches, vol) {
    const v = mv(ctx, out, t, vol, 0.9, { pan: rr(-0.5, 0.5) });
    const dur = rr(4.5, 6.5);
    for (const m of pitches) {
      const os = v.osc('sine', t, dur * 2 + 0.1);
      os.frequency.value = mtof(m);
      os.detune.value = rr(-8, 8);
      const am = v.gn(0.6);
      const l = v.osc('sine', t, dur * 2 + 0.1);
      l.frequency.value = rr(0.25, 0.7);
      const lg = v.gn(0.4);
      l.connect(lg);
      lg.connect(am.gain);
      const g = v.gn(0);
      env(g.gain, t, dur * 0.6, 0.5, dur * 0.1, dur * 1.2);
      os.connect(am);
      am.connect(g);
      g.connect(v.out);
    }
    return v;
  },
};

/* ========================================================================== *
 *  MUSIC: mood generators.  factory(ctx, out) -> { stepDur, nodes, step(i, t) }
 *  `out` = { dry, wet } gain nodes owned by the mood (faded on crossfade).
 *  Steps are 16th notes; 16 steps per bar.
 * ========================================================================== */

function moodTitle(ctx, out) {
  const key = 50, scale = SC.major; // D major, chords around D3
  const sd = 60 / 68 / 4;
  const prog = makeProg(PROG_MAJOR);
  const pent = pentRange(key % 12, 'major', 62, 86);
  const mel = makeMelody(pent, 71);
  const echo = makeEcho(ctx, out, sd * 3, 0.4, 2600, 0.5);
  let evs = {}, bar = 0, sparkle = -1;
  return {
    stepDur: sd,
    nodes: echo.nodes,
    step(i, t) {
      const s = i & 15;
      if (s === 0) {
        const deg = prog.next();
        const chord = triad(key, scale, deg);
        INS.pad(ctx, out, t, [chord[0], chord[1], chord[2], chord[0] + 12], sd * 16, 0.5, { wet: 0.6, att: 1.4, rel: 2.0, lp: 1000 });
        INS.pad(ctx, out, t, [chord[0] - 12], sd * 16, 0.35, { wet: 0.3, att: 1.6, rel: 2.0, lp: 380 });
        evs = {};
        if (chance(0.88)) {
          const pcs = chord.map((m) => m % 12);
          const list = mel.bar(pick(RH_TITLE), pcs, { reuse: 0.4, endPcs: bar % 4 === 3 ? [key % 12, (key + 7) % 12] : null });
          for (const e of list) evs[e.s] = e;
        }
        sparkle = chance(0.3) ? pick([2, 6, 10, 14]) : -1;
        bar++;
      }
      const e = evs[s];
      if (e) INS.pluck(ctx, out, t, e.m, Math.min(e.len * sd, 2.4), 0.55, { wet: 0.5, lp: 3000, sends: [[echo.in, 0.4]], pan: rr(-0.2, 0.2) });
      if (s === sparkle) INS.glock(ctx, out, t, pick(pent) + 12, 0.16, { sends: [[echo.in, 0.3]], pan: rr(-0.4, 0.4) });
    },
  };
}

function moodDay(ctx, out) {
  const key = 55, scale = SC.major; // G major
  const sd = 60 / 90 / 4;
  const prog = makeProg(PROG_MAJOR);
  const pent = pentRange(key % 12, 'major', 62, 86);
  const mel = makeMelody(pent, 72);
  const echo = makeEcho(ctx, out, sd * 3, 0.28, 2400, 0.45);
  let chord = null, keys = null, evs = {}, bar = 0, sparkle = null, quiet = false, bassRoot = 43;
  const strum = (t, notes, vol) =>
    notes.forEach((m, j) => INS.pluck(ctx, out, t + j * 0.022, m, 1.0, vol, { wet: 0.3, lp: 2600, sends: [[echo.in, 0.15]], pan: rr(-0.15, 0.15) }));
  return {
    stepDur: sd,
    nodes: echo.nodes,
    step(i, t) {
      const s = i & 15;
      const T = t + (s & 1 ? sd * 0.14 : 0); // lofi swing
      if (s === 0) {
        chord = triad(key, scale, prog.next());
        keys = voicing(chord, 55);
        bassRoot = nearOct(chord[0], bassRoot, 38, 50); // smooth bass line: nearest octave to the last root (>= 73 Hz)
        quiet = bar > 0 && bar % 8 === 0 && chance(0.35); // occasional drums-out bar
        evs = {};
        if (chance(0.62)) {
          const list = mel.bar(pick(RH_DAY), chord.map((m) => m % 12), { reuse: 0.45, endPcs: bar % 4 === 3 ? [key % 12, (key + 7) % 12] : null });
          for (const e of list) evs[e.s] = e;
        }
        sparkle = chance(0.35) ? { s: pick([2, 6, 10, 14]), m: pick(pent) + 12 } : null;
        bar++;
      }
      // drums: soft kick + shaker
      if (!quiet) {
        if (s === 0 || s === 8) INS.kick(ctx, out, T, 0.34);
        else if ((s === 6 || s === 14) && chance(0.22)) INS.kick(ctx, out, T, 0.2);
        if (s % 2 === 0) INS.shaker(ctx, out, T, s % 4 === 2 ? 0.1 : 0.06);
        else if (chance(0.22)) INS.shaker(ctx, out, T, 0.035);
      }
      // plucked bass
      const root = bassRoot;
      const third = (((chord[1] - chord[0]) % 12) + 12) % 12; // 3 or 4 semitones: stays in the key
      if (s === 0) INS.bass(ctx, out, T, root, sd * 5, 0.42);
      else if (s === 6 && chance(0.55)) INS.bass(ctx, out, T, root + 7, sd * 2, 0.3);
      else if (s === 8) INS.bass(ctx, out, T, root, sd * 4, 0.36);
      else if (s === 14 && chance(0.4)) INS.bass(ctx, out, T, root + pick([third, 7, 12]), sd * 2, 0.3);
      // guitar-ish strums
      if (s === 0) strum(T, keys, 0.18);
      else if (s === 6 && chance(0.7)) strum(T, keys.slice(1), 0.11);
      else if (s === 10 && chance(0.5)) strum(T, keys.slice(1), 0.09);
      // lead motif + glockenspiel sparkle
      const e = evs[s];
      if (e) INS.pluck(ctx, out, T, e.m, Math.min(e.len * sd, 1.3), 0.36, { wet: 0.38, lp: 3600, sends: [[echo.in, 0.3]], pan: rr(-0.1, 0.25) });
      if (sparkle && sparkle.s === s) INS.glock(ctx, out, T, sparkle.m, 0.13, { sends: [[echo.in, 0.3]], pan: rr(-0.5, 0.5) });
    },
  };
}

const BASS_PATS = [
  ['r', 'f', 'o', 'f', 'r', 'f', 'o', 't'],
  ['r', 'r', 'o', 'r', 'f', 'f', 'o', 'f'],
  ['r', 't', 'f', 't', 'o', 'f', 't', 'f'],
];

function moodRush(ctx, out) {
  const key = 45, scale = SC.minor; // A minor
  const sd = 60 / 140 / 4;
  const prog = makeProg(PROG_MINOR);
  const pent = pentRange(key % 12, 'minor', 64, 84);
  const mel = makeMelody(pent, 74);
  let chord = null, stabs = null, stabPat = [2, 6, 10, 14], bassPat = BASS_PATS[0], evs = {}, bar = 0, run = false, bassRoot = 45;
  return {
    stepDur: sd,
    nodes: [],
    step(i, t) {
      const s = i & 15;
      if (s === 0) {
        chord = triad(key, scale, prog.next());
        stabs = voicing(chord, 57);
        bassRoot = nearOct(chord[0], bassRoot, 40, 52);
        stabPat = chance(0.5) ? [3, 6, 9, 12, 14] : [2, 6, 10, 14];
        bassPat = pick(BASS_PATS);
        evs = {};
        if (bar % 2 === 0 || chance(0.5)) {
          const list = mel.bar(pick(RH_RUSH), chord.map((m) => m % 12), { reuse: 0.6 });
          for (const e of list) evs[e.s] = e;
        }
        run = bar % 4 === 3 && chance(0.6); // comedic chromatic scramble at the end of a phrase
        bar++;
      }
      // drums
      if (s === 0 || s === 8 || ((s === 6 || s === 10) && chance(0.28))) INS.kick(ctx, out, t, 0.5);
      if (s === 4 || s === 12) INS.snare(ctx, out, t, 0.3);
      else if (s === 15 && chance(0.25)) INS.snare(ctx, out, t, 0.12);
      if (s % 2 === 0) INS.hat(ctx, out, t, s % 4 === 2 ? 0.11 : 0.06, false);
      if (s === 14 && chance(0.4)) INS.hat(ctx, out, t, 0.1, true);
      // walking bass on 8ths
      if (s % 2 === 0) {
        const root = bassRoot;
        const third = (((chord[1] - chord[0]) % 12) + 12) % 12, fifth = (((chord[2] - chord[0]) % 12) + 12) % 12;
        const tok = bassPat[s >> 1];
        const m = tok === 'r' ? root : tok === 't' ? root + third : tok === 'f' ? root + fifth : root + 12;
        INS.walk(ctx, out, t, m, sd * 1.6, 0.34);
      }
      // staccato square stabs
      if (stabPat.includes(s)) INS.stab(ctx, out, t, stabs, 0.2);
      // bouncy lead
      const e = evs[s];
      if (e) INS.lead(ctx, out, t, e.m, Math.min(e.len, 3) * sd * 0.7, 0.2);
      if (run && s >= 12) INS.lead(ctx, out, t, 69 + (s - 12), sd * 0.8, 0.18);
    },
  };
}

function moodNight(ctx, out) {
  const key = 48, scale = SC.lydian; // C lydian, pads around C3
  const sd = 60 / 56 / 4;
  const prog = makeProg(PROG_LYDIAN);
  const pent = pentRange(0, 'major', 72, 96);
  const mel = makeMelody(pent, 81);
  const echo = makeEcho(ctx, out, sd * 6, 0.45, 2200, 0.55);
  let chord = null, evs = {}, bar = 0;
  return {
    stepDur: sd,
    nodes: echo.nodes,
    step(i, t) {
      const s = i & 15;
      if (s === 0) {
        if ((bar & 1) === 0) {
          const deg = prog.next();
          chord = triad(key, scale, deg);
          const r = chord[0];
          INS.pad(ctx, out, t, [r, r + 7, degNote(key, scale, deg + 8), chord[1] + 12], sd * 32, 0.5, { att: 3.0, rel: 3.2, lp: 720, wet: 0.7 });
          INS.pad(ctx, out, t, [toRange(r, 33)], sd * 32, 0.3, { att: 3.5, rel: 3.2, lp: 300, wet: 0.3 });
        }
        evs = {};
        if (chance(0.72)) {
          const list = mel.bar(pick(RH_NIGHT), chord.map((m) => m % 12), { reuse: 0.3 });
          for (const e of list) evs[e.s] = e;
        }
        if (chance(0.22)) {
          const hi = pentRange(0, 'major', 84, 100);
          INS.shimmer(ctx, out, t + rr(0, sd * 8), [pick(hi), pick(hi), pick(hi)], 0.12);
        }
        bar++;
      }
      const e = evs[s];
      if (e) INS.celesta(ctx, out, t, e.m, 0.36, { wet: 0.75, sends: [[echo.in, 0.5]], pan: rr(-0.4, 0.4) });
    },
  };
}

const MOODS = { title: moodTitle, day: moodDay, rush: moodRush, night: moodNight };
const MOOD_NAMES = Object.freeze(Object.keys(MOODS));

/** instantiate a mood on a music bus: gains start at 0 (see fadeMood) */
// per-mood loudness trim so every mood sits at a similar perceived level
const MOOD_LEVEL = { title: 1.6, day: 0.85, rush: 1.0, night: 1.5 };

function createMood(name, ctx, bus) {
  const dry = ctx.createGain(), wet = ctx.createGain(); // crossfade gains (0 -> 1)
  const ld = ctx.createGain(), lw = ctx.createGain(); // level trim
  dry.gain.value = 0;
  wet.gain.value = 0;
  ld.gain.value = lw.gain.value = MOOD_LEVEL[name] || 1;
  dry.connect(ld);
  ld.connect(bus.dry);
  wet.connect(lw);
  lw.connect(bus.wet);
  const out = { dry, wet };
  const gen = MOODS[name](ctx, out);
  return { name, gen, out, dry, wet, trim: [ld, lw], i: 0, nextTime: 0, disposeAt: Infinity };
}

/** equal-power-ish fade using chained linear ramps (robust across browsers) */
function fadeMood(m, ctx, from, to, dur, at) {
  const t = at != null ? at : ctx.currentTime;
  for (const g of [m.dry.gain, m.wet.gain]) {
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(from, t);
      const N = 12;
      for (let j = 1; j <= N; j++) {
        const x = j / N;
        const e = to > from ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
        g.linearRampToValueAtTime(to > from ? from + (to - from) * e : to + (from - to) * e, t + dur * x);
      }
    } catch (e) {
      /* ignore */
    }
  }
}

function disposeMood(m) {
  const all = [m.dry, m.wet, ...m.trim, ...(m.gen.nodes || [])];
  for (const n of all) {
    try {
      n.disconnect();
    } catch (e) {
      /* ignore */
    }
  }
}

/* ========================================================================== *
 *  AMBIENCE: continuous beds (wind, water) + random events (birds, crickets, owl, loon)
 * ========================================================================== */

function createBeds(ctx, bus) {
  const res = getRes(ctx);
  const nodes = [];
  const mk = (n) => {
    nodes.push(n);
    return n;
  };
  const out = mk(ctx.createGain());
  out.gain.value = 0.6;
  const rumble = mk(ctx.createBiquadFilter()); // keep sub-bass rumble out of small speakers
  rumble.type = 'highpass';
  rumble.frequency.value = 110;
  rumble.Q.value = 0.5;
  out.connect(rumble);
  rumble.connect(bus.dry); // dry only: keeps the reverb tail idle when nothing else plays
  const loopSrc = (kind) => {
    const s = mk(ctx.createBufferSource());
    s.buffer = res.noise[kind];
    s.loop = true;
    s.start(0, Math.random() * 2);
    return s;
  };
  const filt = (type, f, q) => {
    const b = mk(ctx.createBiquadFilter());
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const gain = (v) => {
    const g = mk(ctx.createGain());
    g.gain.value = v;
    return g;
  };
  // Slow random drifts. Audio-rate LFOs on AudioParams are comparatively expensive, so instead the
  // scheduler tick nudges each parameter towards a new random target every few seconds.
  let windScale = 1, lapScale = 1;
  const mods = [];
  const wander = (param, base, depth, t0, t1) => mods.push({ p: param, base, depth, t0, t1, next: 0 });
  // wind: swells of band-passed brown noise + a faint airy whistle layer
  const wind = gain(0.7);
  const wSrc = loopSrc('brown'), wBp = filt('bandpass', 380, 0.6);
  wSrc.connect(wBp);
  wBp.connect(wind);
  wind.connect(out);
  const air = gain(0.14);
  const aSrc = loopSrc('pink'), aBp = filt('bandpass', 1200, 1.4);
  aSrc.connect(aBp);
  aBp.connect(air);
  air.connect(wind);
  // water: slow lapping swells + a little high ripple
  const lap = gain(0.15);
  const lSrc = loopSrc('pink'), lLp = filt('lowpass', 850, 0.4);
  lSrc.connect(lLp);
  lLp.connect(lap);
  lap.connect(out);
  const rip = gain(0.03);
  const rSrc = loopSrc('white'), rBp = filt('bandpass', 3200, 1.8);
  rSrc.connect(rBp);
  rBp.connect(rip);
  rip.connect(out);
  wander(wind.gain, () => 0.7 * windScale, 0.3, 3, 7);
  wander(wBp.frequency, () => 380, 170, 4, 9);
  wander(air.gain, () => 0.14 * windScale, 0.11, 4, 9);
  wander(aBp.frequency, () => 1200, 400, 5, 11);
  wander(lap.gain, () => 0.15 * lapScale, 0.075, 1.2, 2.6);
  wander(rip.gain, () => 0.03 * lapScale, 0.02, 1.5, 3);
  return {
    out,
    nodes,
    /** calmer water/wind at night (takes effect on the next drift step) */
    setLevels(night) {
      windScale = 1 - 0.3 * night;
      lapScale = 1 - 0.15 * night;
    },
    /** advance the random drifts; cheap, call from the scheduler tick */
    update(now) {
      for (const m of mods) {
        if (now < m.next) continue;
        const dur = rr(m.t0, m.t1);
        const target = Math.max(0.0001, m.base() + rr(-1, 1) * m.depth);
        try {
          m.p.setTargetAtTime(target, now, dur * 0.4);
        } catch (e) {
          m.p.value = target;
        }
        m.next = now + dur;
      }
    },
  };
}

function ambBird(ctx, bus, t) {
  const v = new Voice(ctx, bus.dry, { when: t, volume: rr(0.45, 0.9), pan: rr(-0.8, 0.8), rev: bus.wet }, 0.45, 0);
  const base = rr(2500, 4300), kind = Math.random();
  if (kind < 0.3) {
    // tsee-tsee
    const n = ri(1, 3);
    for (let i = 0; i < n; i++) v.tone({ t: i * rr(0.1, 0.14), f: base, f2: base * rr(1.15, 1.4), gl: 0.05, a: 0.008, rel: 0.09, peak: 0.28 });
  } else if (kind < 0.55) {
    // two-note whistle ("fee-bee")
    v.tone({ f: base * 1.15, f2: base * 1.12, gl: 0.3, a: 0.02, hold: 0.2, rel: 0.1, peak: 0.26 });
    v.tone({ t: 0.36, f: base * 0.92, f2: base * 0.9, gl: 0.3, a: 0.02, hold: 0.24, rel: 0.12, peak: 0.26 });
  } else if (kind < 0.8) {
    // trill
    const n = ri(5, 9);
    for (let i = 0; i < n; i++) v.tone({ t: i * 0.048, f: base * (i % 2 ? 1.12 : 1), a: 0.004, rel: 0.05, peak: 0.2 });
  } else {
    // chick-a-dee-dee
    v.tone({ f: base * 0.9, f2: base * 1.1, gl: 0.04, a: 0.004, rel: 0.06, peak: 0.24 });
    v.tone({ t: 0.09, f: base * 1.3, f2: base * 1.2, gl: 0.04, a: 0.004, rel: 0.05, peak: 0.2 });
    const n = ri(2, 4);
    for (let i = 0; i < n; i++) v.tone({ t: 0.2 + i * 0.13, f: base * 0.8, f2: base * 0.72, gl: 0.08, a: 0.006, rel: 0.11, peak: 0.24 });
  }
  return v.end;
}

function ambCricket(ctx, bus, t, f, lvl) {
  const v = new Voice(ctx, bus.dry, { when: t, volume: lvl, pan: rr(-0.9, 0.9), rev: bus.wet }, 0.15, 0);
  const n = ri(3, 5), sp = rr(0.045, 0.06);
  const dur = n * sp + 0.05;
  const os = v.osc('sine', t, dur + 0.05);
  os.frequency.value = f;
  const g = v.gn(0);
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < n; i++) {
    const tp = t + i * sp;
    g.gain.setValueAtTime(0.0001, tp);
    g.gain.linearRampToValueAtTime(0.35, tp + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0002, tp + sp * 0.85);
  }
  os.connect(g);
  g.connect(v.out);
  return v.end;
}

function ambOwl(ctx, bus, t) {
  const v = new Voice(ctx, bus.dry, { when: t, volume: 0.7, pan: rr(-0.7, 0.7), rev: bus.wet }, 0.7, 0);
  const f = rr(330, 400);
  // "hoo, hoo-hoo, hoooo"
  [[0, 0.3, 1], [0.55, 0.16, 1.02], [0.8, 0.16, 1.0], [1.3, 0.55, 0.96]].forEach(([tt, d, m]) => {
    v.tone({ t: tt, f: f * m, f2: f * m * 0.9, gl: d, a: 0.05, hold: d * 0.4, rel: d * 0.9, peak: 0.3, lp: 1200 });
    v.tone({ t: tt, f: f * m * 2, f2: f * m * 1.8, gl: d, a: 0.05, hold: d * 0.3, rel: d * 0.8, peak: 0.05 });
  });
  return v.end;
}

function ambLoon(ctx, bus, t) {
  return sfxLoon(ctx, bus.dry, { when: t, volume: 0.6 * SFX.loon.g, pitch: rr(0.94, 1.06), pan: rr(-0.7, 0.7), rev: bus.wet });
}

function ambPlip(ctx, bus, t) {
  return sfxBubble(ctx, bus.dry, { when: t, volume: rr(0.15, 0.3), pitch: rr(0.8, 1.2), pan: rr(-0.8, 0.8), rev: bus.wet });
}

/** event rates (per second) and levels derived from the clock + darkness */
function ambFactors(hour, night) {
  const day = (1 - night) * smooth(4.5, 7, hour) * (1 - smooth(18, 20.5, hour));
  const dusk = smooth(16.5, 18.5, hour) * (1 - smooth(20.5, 21.5, hour));
  return {
    day,
    bird: 0.42 * day,
    cricket: smooth(0.3, 0.75, night),
    owl: 0.05 * smooth(0.6, 0.95, night),
    loon: 0.012 * Math.max(dusk * 0.6, smooth(0.35, 0.8, night)), // rarer than the game's own scripted loons
  };
}

function newAmbState() {
  return {
    hour: 12,
    night: 0,
    lastApply: 0,
    lastTick: 0,
    owlCool: 0,
    loonCool: 0,
    crickets: [0, 1, 2].map((i) => ({ f: 4300 + i * 380 + rr(-60, 60), next: rr(0, 1) })),
  };
}

/** one scheduler step of the random ambience events (shared by live + offline) */
function ambStep(ctx, bus, A, now, dt) {
  if (dt <= 0) return;
  const f = ambFactors(A.hour, A.night);
  const T = now + 0.02;
  if (f.bird > 0 && Math.random() < f.bird * dt) ambBird(ctx, bus, T);
  if (f.cricket > 0.05) {
    for (const c of A.crickets) {
      if (now >= c.next) {
        ambCricket(ctx, bus, T, c.f, 0.45 * f.cricket);
        c.next = now + rr(0.75, 1.7) / (0.5 + f.cricket);
      }
    }
  }
  if (f.owl > 0 && now > A.owlCool && Math.random() < f.owl * dt) {
    ambOwl(ctx, bus, T);
    A.owlCool = now + 12;
  }
  if (f.loon > 0 && now > A.loonCool && Math.random() < f.loon * dt) {
    ambLoon(ctx, bus, T);
    A.loonCool = now + 30;
  }
  if (Math.random() < 0.07 * dt) ambPlip(ctx, bus, T);
}

/* ========================================================================== *
 *  RIG: master chain, buses, reverb
 * ========================================================================== */

const REVERB_RETURN = 0.55;

/**
 * sfx/music/amb buses each have a dry and a wet (reverb send) gain that follow the same volume.
 * master -> DynamicsCompressor (gentle limiting) -> [transparent soft-knee safety limiter] -> destination
 */
function createRig(ctx, opts = {}) {
  const res = getRes(ctx);
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 14;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.25;
  master.connect(comp);
  let last = comp;
  if (opts.safety !== false) {
    const pre = ctx.createGain(), safe = ctx.createWaveShaper(), post = ctx.createGain();
    pre.gain.value = 0.5;
    post.gain.value = 2;
    safe.curve = SAFE_CURVE;
    comp.connect(pre);
    pre.connect(safe);
    safe.connect(post);
    last = post;
  }
  last.connect(ctx.destination);

  const revIn = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 320;
  hp.Q.value = 0.5;
  const conv = ctx.createConvolver();
  const attachReverb = () => {
    if (!conv.buffer) conv.buffer = res.ir; // (silent until then)
  };
  if (!opts.deferReverb) attachReverb();
  const revOut = ctx.createGain();
  revOut.gain.value = REVERB_RETURN;
  revIn.connect(hp);
  hp.connect(conv);
  conv.connect(revOut);
  revOut.connect(master);

  const bus = () => {
    const dry = ctx.createGain(), wet = ctx.createGain();
    dry.connect(master);
    wet.connect(revIn);
    return { dry, wet };
  };
  return { ctx, master, comp, last, revIn, revOut, attachReverb, buses: { sfx: bus(), music: bus(), amb: bus() } };
}

/** push volume settings into the rig (tc = smoothing time constant, 0 = immediate) */
function applyRigVolumes(rig, vols, tc, silent) {
  const t = rig.ctx.currentTime;
  const set = (p, v) => {
    try {
      if (tc > 0) p.setTargetAtTime(v, t, tc);
      else p.value = v;
    } catch (e) {
      /* ignore */
    }
  };
  set(rig.master.gain, silent ? 0 : gainCurve(vols.master));
  const s = TRIM.sfx * gainCurve(vols.sfx), m = TRIM.music * gainCurve(vols.music), a = TRIM.amb * gainCurve(vols.ambience);
  set(rig.buses.sfx.dry.gain, s);
  set(rig.buses.sfx.wet.gain, s);
  set(rig.buses.music.dry.gain, m);
  set(rig.buses.music.wet.gain, m);
  set(rig.buses.amb.dry.gain, a);
  set(rig.buses.amb.wet.gain, a);
}

/* ========================================================================== *
 *  ENGINE (singleton state + public API)
 * ========================================================================== */

const S = {
  ctx: null,
  rig: null,
  beds: null,
  unlocked: false,
  muted: lsGet(LS_MUTED) === '1',
  hidden: HAS_DOC ? !!document.hidden : false,
  resumeUntil: 0,
  vols: loadVolumes(),
  want: null, // requested mood
  cur: null, // sounding mood instance
  fading: [], // moods fading out
  timer: 0,
  suspendTimer: 0,
  suspending: false, // a ctx.suspend() is in flight (state still reads 'running' until it lands)
  live: [], // sounding SFX: { name, end }
  counts: {},
  lastStart: {},
  amb: newAmbState(),
  analyser: null,
};

let warned = false;
/** a real bug in a timer/builder must not fail silently, but must never spam the console either */
function reportOnce(e) {
  if (warned) return;
  warned = true;
  try {
    console.warn('[audio]', e);
  } catch (err) {
    /* no console */
  }
}

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const wantRunning = () => S.unlocked && !S.muted && !S.hidden;

function ensureContext() {
  if (S.ctx) return S.ctx;
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  let ctx = null;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch (e) {
    try {
      ctx = new AC();
    } catch (e2) {
      return null;
    }
  }
  S.ctx = ctx;
  S.rig = createRig(ctx, { safety: true, deferReverb: true });
  applyRigVolumes(S.rig, S.vols, 0, S.muted || S.hidden);
  S.amb.lastTick = ctx.currentTime;
  // The one-time buffer generation (reverb impulse, noise for the ambience beds) takes tens of milliseconds:
  // keep it out of the user-gesture handler, in two small timer tasks. Until then: no reverb / no beds.
  setTimeout(() => {
    try {
      if (S.rig && S.ctx === ctx) S.rig.attachReverb();
    } catch (e) {
      reportOnce(e);
    }
    setTimeout(() => {
      try {
        if (S.ctx === ctx && !S.beds) S.beds = createBeds(ctx, S.rig.buses.amb);
      } catch (e) {
        reportOnce(e);
      }
    }, 0);
  }, 0);
  return ctx;
}

function safeResume() {
  const c = S.ctx;
  if (!c || c.state === 'closed') return;
  try {
    S.resumeUntil = nowMs() + 500; // sounds requested during the first moments after a gesture are allowed
    const p = c.resume();
    if (p && p.catch) p.catch(noop);
  } catch (e) {
    /* ignore */
  }
}

function startTimer() {
  if (S.timer || typeof setInterval === 'undefined') return;
  S.timer = setInterval(tick, TICK_MS);
}
function stopTimer() {
  if (S.timer) clearInterval(S.timer);
  S.timer = 0;
}

/** reconcile context running state, master gain and scheduler with unlocked/muted/hidden */
function syncRun() {
  const ctx = S.ctx;
  if (!ctx) return;
  try {
    const on = wantRunning();
    applyRigVolumes(S.rig, S.vols, 0.02, !on);
    if (S.suspendTimer) {
      clearTimeout(S.suspendTimer);
      S.suspendTimer = 0;
    }
    if (on) {
      // resume() queues behind an in-flight suspend(), so mute -> quick unmute always ends up running
      if (ctx.state !== 'running' || S.suspending) safeResume();
      S.amb.lastTick = ctx.currentTime;
      startTimer();
      syncMusic();
    } else {
      stopTimer();
      S.suspendTimer = setTimeout(() => {
        S.suspendTimer = 0;
        if (!wantRunning() && S.ctx && S.ctx.state === 'running') {
          try {
            S.suspending = true;
            const done = () => {
              S.suspending = false;
            };
            const p = S.ctx.suspend();
            if (p && p.then) p.then(done, done);
            else done();
          } catch (e) {
            S.suspending = false;
          }
        }
      }, 300);
    }
  } catch (e) {
    /* never throw */
  }
}

function syncMusic() {
  const ctx = S.ctx;
  if (!ctx || !S.unlocked) return;
  const cur = S.cur ? S.cur.name : null;
  if (cur === S.want) return;
  const now = ctx.currentTime;
  if (S.cur) {
    const old = S.cur;
    fadeMood(old, ctx, clamp(old.dry.gain.value, 0, 1), 0, XFADE, now);
    old.disposeAt = now + XFADE + 0.4;
    S.fading.push(old);
    S.cur = null;
  }
  while (S.fading.length > 3) disposeMood(S.fading.shift());
  if (S.want) {
    const m = createMood(S.want, ctx, S.rig.buses.music);
    fadeMood(m, ctx, 0, 1, XFADE, now);
    m.nextTime = now + 0.06;
    S.cur = m;
  }
}

/** lookahead scheduler: runs every TICK_MS, schedules music + ambience events ahead of the audio clock */
function tick() {
  const ctx = S.ctx;
  if (!ctx || ctx.state !== 'running') return; // frozen clock -> nothing to schedule
  try {
    const now = ctx.currentTime;
    for (let i = S.fading.length - 1; i >= 0; i--) {
      if (now >= S.fading[i].disposeAt) {
        disposeMood(S.fading[i]);
        S.fading.splice(i, 1);
      }
    }
    const m = S.cur;
    if (m) {
      if (m.nextTime < now - 0.35) m.nextTime = now + 0.05; // main thread stalled: resync instead of a note burst
      const horizon = now + LOOKAHEAD;
      let guard = 0;
      while (m.nextTime < horizon && guard++ < 40) {
        m.gen.step(m.i, Math.max(m.nextTime, now));
        m.i++;
        m.nextTime += m.gen.stepDur;
      }
    }
    if (S.beds) {
      S.beds.update(now);
      if (S.vols.ambience > 0.01 && S.vols.master > 0.01) {
        const A = S.amb;
        ambStep(ctx, S.rig.buses.amb, A, now, clamp(now - A.lastTick, 0, 0.25));
      }
    }
    S.amb.lastTick = now;
  } catch (e) {
    reportOnce(e); /* never throw from a timer */
  }
}

/* ---- public API -------------------------------------------------------- */

/**
 * Call from any user gesture (pointerdown / keydown / click ...). Creates the AudioContext on first use and
 * resumes it inside the gesture (required by iOS Safari and Chrome's autoplay policy). Safe to call any number of
 * times; later calls only recover a context that the system suspended or interrupted.
 */
function unlock() {
  try {
    const ctx = ensureContext();
    if (!ctx) return;
    if (!S.unlocked) {
      S.unlocked = true;
      safeResume();
      try {
        // iOS Safari: a started (silent) source inside the gesture fully unlocks output
        const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) {
        /* ignore */
      }
      syncMusic();
      syncRun();
    } else if (wantRunning() && ctx.state !== 'running') {
      safeResume(); // e.g. iOS 'interrupted' after a phone call / backgrounding
    }
  } catch (e) {
    /* never throw */
  }
}

function prune(now) {
  const L = S.live;
  let j = 0;
  for (let i = 0; i < L.length; i++) {
    if (L[i].end > now) L[j++] = L[i];
    else S.counts[L[i].name]--;
  }
  L.length = j;
}

function play(name, opts) {
  try {
    const ctx = S.ctx;
    if (!ctx || !S.unlocked || S.muted || S.hidden) return;
    if (ctx.state !== 'running' && nowMs() > S.resumeUntil) return;
    const def = SFX[name];
    if (!def) return;
    const o = opts || {};
    const volume = clamp(num(o.volume, 1), 0, 2);
    if (volume < 0.0005) return;
    const pitch = clamp(num(o.pitch, 1), 0.25, 4); // keeps every partial below Nyquist
    const pan = clamp(num(o.pan, 0), -1, 1);
    const delay = clamp(num(o.delay, 0), 0, 60);
    const now = ctx.currentTime;
    const when = now + delay + 0.004;
    prune(now);
    if (S.live.length >= MAX_VOICES || (S.counts[name] || 0) >= def.max) {
      stats.dropped++;
      return;
    }
    const last = S.lastStart[name];
    if (last != null && Math.abs(when - last) < def.gap) {
      stats.dropped++;
      return;
    }
    S.lastStart[name] = when;
    const bus = S.rig.buses.sfx;
    let end;
    try {
      end = def.fn(ctx, bus.dry, { when, volume: volume * def.g, pitch, pan, rev: bus.wet });
    } catch (e) {
      reportOnce(e);
      if (lastVoice) lastVoice.dispose(); // half-built graph -> release it
      return;
    }
    S.live.push({ name, end: num(end, when + 1) });
    S.counts[name] = (S.counts[name] || 0) + 1;
  } catch (e) {
    /* never throw */
  }
}

function setMuted(m) {
  try {
    const next = !!m;
    if (next === S.muted) return;
    S.muted = next;
    lsSet(LS_MUTED, next ? '1' : '0');
    if (!next && S.ctx && S.unlocked) safeResume(); // usually inside the click that toggled it
    syncRun();
  } catch (e) {
    /* never throw */
  }
}
const isMuted = () => S.muted;
function toggleMute() {
  setMuted(!S.muted);
  return S.muted;
}

function setVolumes(v) {
  try {
    if (!v || typeof v !== 'object') return;
    for (const k of ['master', 'sfx', 'music', 'ambience']) {
      if (v[k] != null) {
        const n = Number(v[k]);
        if (isFinite(n)) S.vols[k] = clamp(n, 0, 1);
      }
    }
    lsSet(LS_VOLUMES, JSON.stringify(S.vols));
    if (S.rig) applyRigVolumes(S.rig, S.vols, 0.03, S.muted || S.hidden || !S.unlocked);
  } catch (e) {
    /* never throw */
  }
}
const getVolumes = () => ({ master: S.vols.master, sfx: S.vols.sfx, music: S.vols.music, ambience: S.vols.ambience });

function setMusic(mood) {
  try {
    const m = mood && MOODS[mood] ? mood : null;
    if (m === S.want) return;
    S.want = m;
    syncMusic();
  } catch (e) {
    /* never throw */
  }
}

/** called every frame: only stores values and (throttled) nudges two gain targets */
function setAmbience(p) {
  try {
    if (!p) return;
    const A = S.amb;
    const h = +p.hour, n = +p.night;
    if (h === h) A.hour = ((h % 24) + 24) % 24;
    if (n === n) A.night = n < 0 ? 0 : n > 1 ? 1 : n;
    const t = nowMs();
    if (t - A.lastApply < 250) return; // throttle the (already trivial) bed update
    A.lastApply = t;
    if (S.beds) S.beds.setLevels(A.night);
  } catch (e) {
    /* never throw */
  }
}

/**
 * Optional per-frame hook. The lookahead scheduler already runs on its own timer; calling tick() here as well
 * just gives it extra chances to run when the timer is starved by a busy main thread (tick is idempotent).
 */
function update() {
  if (S.timer) tick();
}

if (HAS_DOC) {
  document.addEventListener('visibilitychange', () => {
    S.hidden = !!document.hidden;
    syncRun();
  });

  // Belt and braces: unlock() is idempotent, so also hook the gestures that count as user activation on touch
  // devices (iOS only unlocks audio on touchend/click, not on pointerdown) and use them to recover from system
  // interruptions later on. Nearly free: the handler returns immediately while the context is healthy.
  const onGesture = () => {
    if (!S.unlocked || (S.ctx && wantRunning() && S.ctx.state !== 'running')) unlock();
  };
  for (const g of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(g, onGesture, { capture: true, passive: true });
}

/* ---- debug / verification helpers ---------------------------------------- */

function renderOffline(seconds, build, safety) {
  const OAC = typeof window !== 'undefined' ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null;
  if (!OAC) return Promise.reject(new Error('OfflineAudioContext unavailable'));
  const ctx = new OAC(2, Math.ceil(seconds * OFFLINE_SR), OFFLINE_SR);
  // by default the safety limiter is bypassed so headroom problems of the sounds themselves stay visible
  const rig = createRig(ctx, { safety: !!safety });
  applyRigVolumes(rig, DEFAULT_VOLUMES, 0, false);
  build(ctx, rig);
  return ctx.startRendering();
}

/** render several SFX at once (worst-case pile-up); `opts.safety` adds the final soft limiter to the chain */
function _debugRenderMix(names, seconds = 4, opts = {}) {
  return renderOffline(
    seconds,
    (ctx, rig) => {
      const bus = rig.buses.sfx;
      for (const n of names) {
        const def = SFX[n];
        if (def) def.fn(ctx, bus.dry, { when: 0.02, volume: num(opts.volume, 1) * def.g, pitch: 1, pan: 0, rev: bus.wet });
      }
    },
    opts.safety,
  );
}

/** render one SFX through the full master chain (default volumes, no safety limiter) */
function _debugRenderSfx(name, seconds = 4, opts = {}) {
  const def = SFX[name];
  if (!def) return Promise.reject(new Error('unknown sfx ' + name));
  return renderOffline(seconds, (ctx, rig) => {
    const bus = rig.buses.sfx;
    def.fn(ctx, bus.dry, { when: 0.02, volume: num(opts.volume, 1) * (opts.raw ? 1 : def.g), pitch: clamp(num(opts.pitch, 1), 0.25, 4), pan: num(opts.pan, 0), rev: bus.wet });
  });
}

/**
 * Calls pump(now) every 100 ms of *rendered* time (OfflineAudioContext.suspend), so generators are driven
 * just-in-time exactly like the live lookahead scheduler instead of building the whole graph up front.
 */
function driveOffline(ctx, seconds, pump) {
  pump(0);
  for (let t = 0.1; t < seconds - 0.05; t += 0.1) {
    ctx.suspend(t).then(() => {
      pump(t);
      ctx.resume();
    });
  }
}

/** render `seconds` of a music mood (no crossfade), scheduled with the same lookahead as the live engine */
function _debugRenderMusic(mood, seconds = 8) {
  if (!MOODS[mood]) return Promise.reject(new Error('unknown mood ' + mood));
  return renderOffline(seconds, (ctx, rig) => {
    const m = createMood(mood, ctx, rig.buses.music);
    m.dry.gain.value = 1;
    m.wet.gain.value = 1;
    let i = 0, t = 0.05;
    driveOffline(ctx, seconds, (now) => {
      while (t < now + LOOKAHEAD && t < seconds) {
        m.gen.step(i++, t);
        t += m.gen.stepDur;
      }
    });
  });
}

/** render beds + random events for a given clock/darkness; `force` guarantees one of each event */
function _debugRenderAmbience(seconds = 8, o = {}) {
  const hour = num(o.hour, 12), night = clamp(num(o.night, 0), 0, 1);
  return renderOffline(seconds, (ctx, rig) => {
    const bus = rig.buses.amb;
    const beds = o.beds !== false ? createBeds(ctx, bus) : null;
    if (beds) beds.setLevels(night);
    const A = newAmbState();
    A.hour = hour;
    A.night = night;
    let last = 0;
    driveOffline(ctx, seconds, (now) => {
      if (beds) beds.update(now);
      if (o.events !== false) ambStep(ctx, bus, A, now, now - last);
      last = now;
    });
    if (o.events === false) return;
    if (o.force !== false) {
      const f = ambFactors(hour, night);
      if (f.day > 0.2) ambBird(ctx, bus, 0.5);
      if (f.cricket > 0.05) ambCricket(ctx, bus, 0.8, 4600, 0.45 * f.cricket);
      if (night > 0.5) ambOwl(ctx, bus, 1.5);
      if (night > 0.3 || hour > 17) ambLoon(ctx, bus, 0.3);
    }
  });
}

function _debugState() {
  const c = S.ctx;
  if (c) prune(c.currentTime); // the live-voice list is pruned lazily, report the true count
  return {
    ctxState: c ? c.state : 'none',
    currentTime: c ? c.currentTime : 0,
    sampleRate: c ? c.sampleRate : 0,
    unlocked: S.unlocked,
    muted: S.muted,
    hidden: S.hidden,
    want: S.want,
    mood: S.cur ? S.cur.name : null,
    fading: S.fading.length,
    liveVoices: S.live.length,
    amb: { hour: S.amb.hour, night: S.amb.night, crickets: S.amb.crickets.map((k) => +k.next.toFixed(2)) },
    timer: !!S.timer,
    stats: { ...stats },
    volumes: getVolumes(),
  };
}

/** current output level (RMS/peak of the last analyser window) - for live smoke tests */
function _debugLevel() {
  const c = S.ctx;
  if (!c || !S.rig) return { rms: 0, peak: 0 };
  if (!S.analyser) {
    S.analyser = c.createAnalyser();
    S.analyser.fftSize = 2048;
    S.rig.last.connect(S.analyser); // what actually reaches the speakers
    return { rms: 0, peak: 0 };
  }
  const d = new Float32Array(S.analyser.fftSize);
  S.analyser.getFloatTimeDomainData(d);
  let s = 0, p = 0;
  for (let i = 0; i < d.length; i++) {
    s += d[i] * d[i];
    const a = Math.abs(d[i]);
    if (a > p) p = a;
  }
  return { rms: Math.sqrt(s / d.length), peak: p };
}

export const audio = {
  unlock,
  play,
  setMuted,
  isMuted,
  toggleMute,
  setVolumes,
  getVolumes,
  setMusic,
  setAmbience,
  update,
  isUnlocked: () => S.unlocked,
  getMusic: () => S.want,
  sfxNames: SFX_NAMES,
  moods: MOOD_NAMES,
  _debugRenderSfx,
  _debugRenderMix,
  _debugRenderMusic,
  _debugRenderAmbience,
  _debugState,
  _debugLevel,
};

export { SFX_NAMES, MOOD_NAMES };
export default audio;
