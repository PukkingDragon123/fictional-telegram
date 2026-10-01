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
 *   - Music and random ambience events are scheduled by a lookahead scheduler (setInterval 25 ms, 250 ms ahead of
 *     ctx.currentTime, so main-thread hitches don't glitch the rhythm); it pauses while muted or while the tab is
 *     hidden, and the context is suspended meanwhile.
 */

/* ========================================================================== *
 *  constants & tiny helpers
 * ========================================================================== */

const LS_MUTED = 'tbme.muted';
const LS_VOLUMES = 'tbme.volumes';
const DEFAULT_VOLUMES = Object.freeze({ master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.6 });

const LOOKAHEAD = 0.25; // seconds of music scheduled ahead of the audio clock (absorbs main-thread hitches)
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
const stats = { voices: 0, disposed: 0, notes: 0, dropped: 0, droppedBy: {} };
const drop = (name) => {
  stats.dropped++;
  stats.droppedBy[name] = (stats.droppedBy[name] || 0) + 1;
};
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

  /**
   * rustling noise: a randomly flickering envelope with a swell shape (paper, pen strokes, saw, flopping fish...).
   * peakAt = where the swell peaks (0..1 of dur), rise/fall = curve exponents, flicker = random dips (0..1)
   */
  rustle(p) {
    const ctx = this.ctx, k = this.k;
    const t = this.t0 + (p.t || 0), dur = p.dur, n = p.n || 24;
    const s = this.nsrc(p.buf || 'white', t, dur + 0.05);
    const f0 = clamp(p.f * k, 10, ctx.sampleRate * 0.45);
    const f = this.flt(p.ft || 'bandpass', f0, p.q != null ? p.q : 1);
    if (p.f2) {
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(clamp(p.f2 * k, 10, ctx.sampleRate * 0.45), t + dur);
    }
    const g = this.gn(0);
    const at = p.peakAt != null ? p.peakAt : 0.35, fl = p.flicker != null ? p.flicker : 0.6;
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 1; i <= n; i++) {
      const x = i / n;
      const shape = x < at ? Math.pow(x / at, p.rise || 1) : Math.pow(Math.max(0, 1 - (x - at) / (1 - at)), p.fall || 1.5);
      g.gain.linearRampToValueAtTime(Math.max(0.0001, p.peak * shape * (1 - fl * Math.random())), t + x * dur);
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

/**
 * Steam whistle pipes: sine + saw + a little air per pipe, through a soft low-pass ("a little distant"), with the
 * steam "pfff" at the start. o = { L (blow length s), tail (s), notes [[Hz, level]], lpf (Hz), level }
 */
function steamWhistle(v, o) {
  const t = v.t0, k = v.k, L = o.L, T = L + o.tail, lv = o.level;
  const lp = v.flt('lowpass', o.lpf, 0.4);
  const eg = v.gn(0);
  eg.gain.setValueAtTime(0.0001, t);
  eg.gain.linearRampToValueAtTime(0.28 * lv, t + 0.07);
  eg.gain.linearRampToValueAtTime(0.4 * lv, t + 0.4);
  eg.gain.setValueAtTime(0.4 * lv, t + L);
  eg.gain.exponentialRampToValueAtTime(0.0003, t + T);
  lp.connect(eg);
  eg.connect(v.out);
  // slow pressure wobble shared by all pipes
  const vib = v.osc('sine', t, T + 0.05);
  vib.frequency.value = 5.3;
  const vibG = v.gn(7);
  vib.connect(vibG);
  o.notes.forEach(([f0, amp]) => {
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
  sg.gain.linearRampToValueAtTime(0.6 * lv, t + 0.03);
  sg.gain.exponentialRampToValueAtTime(0.13 * lv, t + 0.5);
  sg.gain.setValueAtTime(0.13 * lv, t + L);
  sg.gain.exponentialRampToValueAtTime(0.0003, t + T);
  s.connect(sb);
  sb.connect(sg);
  sg.connect(lp);
}

function sfxWhistle(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.5, 0.008);
  // two-tone: a perfect fourth (D4 + G4) with a faint octave on top
  steamWhistle(v, { L: 1.35, tail: 0.55, notes: [[293.66, 1], [392, 0.9], [587.33, 0.3]], lpf: 2300, level: 1 });
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
  // sad trombone: falling semitones, "wah" filter on each note
  wahNote(v, 0, 233.08, 0.22);
  wahNote(v, 0.25, 220, 0.22);
  wahNote(v, 0.5, 207.65, 0.55, 196, true);
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

/* ---- voices: formant "babble" synthesis ----------------------------------------------------------------
 * A band-limited sawtooth (the glottal buzz) feeds three parallel band-pass resonators (the formants). Vowel
 * quality = formant frequencies, consonants = a burst / hiss in front or a formant glide out of a closed mouth.
 * Everything talking in the game (single syllables, laughs, yawns and the babble API) is built from this. */

/** vowel formants F1..F3 (Hz) of an adult-sized mouth */
const VOWELS = {
  a: [800, 1250, 2600], // "ah"
  e: [560, 1900, 2650], // "eh"
  i: [320, 2250, 3050], // "ee"
  o: [520, 930, 2600], // "oh"
  u: [350, 830, 2450], // "oo"
  x: [700, 1720, 2550], // "a" as in "cat"
  n: [610, 1200, 2500], // neutral "uh"
};
const VOWEL_KEYS = Object.keys(VOWELS);
const NASAL_M = [270, 1000, 2300];

/**
 * What a consonant letter does in front of its vowel.
 *   burst / hiss / breath: [kind, centre Hz, Q, length s, level]      glide / nasal: [kind, starting formants]
 */
const CONS = {
  p: ['burst', 900, 0.9, 0.016, 0.5],
  b: ['burst', 620, 0.9, 0.014, 0.36],
  t: ['burst', 4300, 1.6, 0.014, 0.5],
  d: ['burst', 3200, 1.2, 0.012, 0.36],
  k: ['burst', 1900, 1.3, 0.02, 0.55],
  g: ['burst', 1300, 1.2, 0.016, 0.4],
  s: ['hiss', 6300, 1.8, 0.05, 0.4],
  z: ['hiss', 5700, 1.6, 0.042, 0.34],
  f: ['hiss', 4800, 0.6, 0.042, 0.28],
  v: ['hiss', 4200, 0.6, 0.034, 0.24],
  j: ['hiss', 3300, 1.2, 0.038, 0.32],
  h: ['breath', 1800, 0.8, 0.032, 0.42],
  m: ['nasal', NASAL_M],
  n: ['nasal', [270, 1400, 2450]],
  l: ['glide', [400, 1050, 2650]],
  r: ['glide', [430, 1250, 1650]],
  w: ['glide', VOWELS.u],
  y: ['glide', VOWELS.i],
};
const CONS_LIKE = { c: 'k', q: 'k', x: 's' };
const TALK_CONS = ['m', 'n', 'b', 'p', 'd', 't', 'k', 'g', 'w', 'y', 'l', 'h', 's', 'z', 'f', 'j'];

/**
 * Character voices. f0 = base pitch (Hz), size = mouth/formant scale, rate = relative syllable speed,
 * lp = roundness (low-pass Hz, 0 = open), rough = growl depth, att = attack, breath = airiness, trim = loudness.
 */
const VOICES = {
  fox: { f0: 330, size: 1.1, rate: 1, lp: 0, rough: 0, att: 0.008, breath: 0.02, trim: 1, vow: 'eiaxeoa' },
  bear: { f0: 126, size: 0.86, rate: 0.94, lp: 2500, rough: 0, att: 0.013, breath: 0.03, trim: 1, vow: 'ouanoau' },
  cub: { f0: 540, size: 1.26, rate: 1.12, lp: 0, rough: 0, att: 0.006, breath: 0.015, trim: 1, vow: 'iexaie' },
  ceo: { f0: 84, size: 0.74, rate: 0.7, lp: 2100, rough: 0.55, att: 0.02, breath: 0.05, trim: 1, vow: 'ouanou' },
};
const BABBLE_VOICES = Object.freeze(Object.keys(VOICES));

/**
 * One voiced sound.  p = {
 *   t, dur           start offset and voiced length (s); the release follows
 *   f0               Hz, or a contour [[t, Hz], ...] (exponential glides between points)
 *   form             [[t, [F1, F2, F3]], ...] formant keyframes         size  formant scale (mouth size)
 *   peak, att, rel   envelope                                            vr / vc / vd  vibrato Hz / cents / delay s
 *   breath           noise mixed in     rough  growl depth 0..1 (rr = growl Hz)    lp  low-pass Hz    bright  F3 level
 * }
 */
function vocal(v, p) {
  const ctx = v.ctx, k = v.k, sr = ctx.sampleRate;
  const t = v.t0 + (p.t || 0), dur = p.dur;
  const att = p.att != null ? p.att : 0.01, rel = p.rel != null ? p.rel : 0.045;
  const total = dur + rel + 0.03;
  const pts = Array.isArray(p.f0) ? p.f0 : [[0, p.f0]];
  const hz = (f) => clamp(f * k, 20, sr * 0.4);
  const o = v.osc('sawtooth', t, total);
  o.frequency.setValueAtTime(hz(pts[0][1]), t);
  for (let i = 1; i < pts.length; i++) o.frequency.exponentialRampToValueAtTime(hz(pts[i][1]), t + pts[i][0]);
  if (p.vr) {
    const l = v.osc('sine', t, total);
    l.frequency.value = p.vr;
    const lg = v.gn(0);
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(p.vc || 20, t + (p.vd != null ? p.vd : 0.12));
    l.connect(lg);
    lg.connect(o.detune);
  }
  let src = o;
  if (p.rough) {
    // gravel: amplitude flutter of the buzz
    const am = v.gn(1 - p.rough * 0.5);
    const l = v.osc('sine', t, total);
    l.frequency.value = p.rr || 34;
    const lg = v.gn(p.rough * 0.5);
    l.connect(lg);
    lg.connect(am.gain);
    o.connect(am);
    src = am;
  }
  // a sawtooth excites a formant more the higher its pitch: compensate so loudness stays even across pitches
  let fm = 0;
  for (const q of pts) fm += q[1];
  fm = Math.max(40, (fm / pts.length) * k);
  const sum = v.gn(0);
  env(sum.gain, t, att, p.peak * Math.sqrt(140 / fm), Math.max(0, dur - att), rel);
  let head = sum;
  if (p.lp) {
    const lp = v.flt('lowpass', p.lp, 0.5);
    sum.connect(lp);
    head = lp;
  }
  head.connect(p.dest || v.out);
  const sc = (p.size || 1) * Math.pow(k, 0.3);
  const gains = [1, 0.62, 0.38 * (p.bright != null ? p.bright : 1)], qs = p.q || [5, 7, 9];
  const fmt = (f) => clamp(f * sc, 10, sr * 0.45);
  for (let j = 0; j < 3; j++) {
    const b = v.flt('bandpass', fmt(p.form[0][1][j]), qs[j]);
    for (let i = 1; i < p.form.length; i++) b.frequency.exponentialRampToValueAtTime(fmt(p.form[i][1][j]), t + p.form[i][0]);
    const g = v.gn(gains[j]);
    src.connect(b);
    b.connect(g);
    g.connect(sum);
  }
  if (p.breath) {
    const n = v.nsrc('white', t, total), nb = v.flt('bandpass', fmt(p.form[0][1][1]), 1.2), ng = v.gn(p.breath);
    n.connect(nb);
    nb.connect(ng);
    ng.connect(sum);
  }
}

const NOISE_K = 2.6; // consonant noise level relative to the voiced peak

/**
 * A syllable: optional consonant + vowel, in the character voice s.P.
 *   s = { P, c (consonant letter), vw (vowel key), f0 (Hz | contour), dur, peak, rel, size, breath, vr, vc, vd, bright, form }
 * `form` (keyframes) replaces the vowel lookup for glides that need custom shapes.
 */
function speak(v, t, s) {
  const P = s.P, size = P.size * (s.size || 1), nsize = Math.sqrt(size);
  const cons = s.c ? CONS[CONS_LIKE[s.c] || s.c] : null;
  const target = s.vf || VOWELS[s.vw] || VOWELS.a;
  let lead = 0, form = [[0, target]];
  if (cons) {
    if (cons[0] === 'glide' || cons[0] === 'nasal') {
      form = [[0, cons[1]], [Math.min(0.05, s.dur * 0.5), target]];
    } else {
      const kind = cons[0], f = cons[1], q = cons[2], len = cons[3], lv = cons[4];
      if (kind === 'burst') v.noise({ t, buf: 'white', f: f * nsize, q, bursts: [[0, lv * s.peak * NOISE_K, len]] });
      else v.noise({ t, buf: kind === 'breath' ? 'pink' : 'white', f: f * nsize, q, a: 0.006, hold: len * 0.3, rel: len * 0.7, peak: lv * s.peak * NOISE_K });
      lead = len * (kind === 'burst' ? 0.45 : 0.6);
    }
  }
  vocal(v, {
    t: t + lead, dur: s.dur, f0: s.f0, form: s.form || form, size, peak: s.peak, att: s.att != null ? s.att : P.att, rel: s.rel,
    lp: P.lp, rough: P.rough, breath: s.breath != null ? s.breath : P.breath, vr: s.vr, vc: s.vc, vd: s.vd, bright: s.bright,
  });
}

/** a random vowel of the voice's favourite set, blended with a second one so repeated calls never repeat exactly */
function randVowel(P) {
  const a = VOWELS[P.vow[(Math.random() * P.vow.length) | 0]], b = VOWELS[pick(VOWEL_KEYS)], m = rr(0, 0.4);
  return a.map((f, i) => (f + (b[i] - f) * m) * rr(0.95, 1.05));
}

/** one random "word-ish" syllable of a character (fox_talk / bear_talk) */
function talkSyllable(v, name) {
  const P = VOICES[name];
  const f = P.f0 * rr(0.84, 1.22), dur = rr(0.075, 0.135);
  const arc = pick([[1, 1.03, 0.97], [0.96, 1.05, 1.1], [1.06, 1.04, 0.9], [1, 1.09, 1.0]]);
  speak(v, 0, {
    P, c: chance(0.7) ? pick(TALK_CONS) : null, vf: randVowel(P), dur, peak: 0.5, rel: 0.05,
    f0: [[0, f * arc[0]], [dur * 0.35, f * arc[1]], [dur, f * arc[2]]],
  });
}

/* ---- the babble planner: text -> timeline of syllables ------------------------------------------ */

const BABBLE_MAX = 1500; // characters considered per call
const LETTER_RE = /[\p{L}\p{N}]/u;

/**
 * Turns a text into a list of syllable events (one per letter/digit; spaces and punctuation only make gaps).
 * Deterministic in timing so `total` is exactly what the caller is told; pitch/loudness get an intonation:
 * a question rises at the end, an exclamation is louder and higher, a statement falls, commas lift slightly.
 * -> { evs: [{ t, dur, rel, c, vw, pm, g, arc }], total }
 */
function planBabble(voice, text, cps) {
  const P = VOICES[voice];
  if (!P) return null;
  const chars = Array.from(String(text == null ? '' : text).slice(0, BABBLE_MAX));
  const period = 1 / (clamp(cps, 2, 40) * P.rate);
  const sents = [], evs = [];
  let cur = null, word = null, shift = 0, pause = 0, t = 0;
  for (let ci = 0; ci < chars.length; ci++) {
    const ch = chars[ci];
    if (LETTER_RE.test(ch)) {
      if (!cur || cur.closed) {
        cur = { evs: [], kind: '', closed: false };
        sents.push(cur);
      }
      if (!word) {
        word = [];
        shift = clamp(shift * 0.6 + rr(-1.6, 1.6), -3, 3);
      }
      t += pause * period;
      pause = 0;
      const ev = { t, ch: ch.toLowerCase(), upper: ch !== ch.toLowerCase(), word, wi: word.length, shift, sent: cur, si: cur.evs.length, phraseEnd: false };
      word.push(ev);
      cur.evs.push(ev);
      evs.push(ev);
      t += period;
    } else if ((ch === "'" || ch === '’') && word && ci + 1 < chars.length && LETTER_RE.test(chars[ci + 1])) {
      continue; // don't => one word
    } else {
      word = null;
      if (ch === ',' || ch === ';' || ch === ':' || ch === '—' || ch === '–') {
        pause = Math.max(pause, 2.2);
        if (evs.length) evs[evs.length - 1].phraseEnd = true;
      } else if (ch === '.' || ch === '!' || ch === '?' || ch === '…' || ch === '\n') {
        pause = Math.max(pause, ch === '\n' ? 4 : 4.5);
        if (cur) {
          cur.closed = true;
          if (ch === '!') cur.kind = '!';
          else if (ch === '?') cur.kind = cur.kind === '!' ? '!' : '?';
          else if (!cur.kind) cur.kind = '.';
        }
      } else if (/\s/.test(ch)) pause = Math.max(pause, 0.45);
      else pause = Math.max(pause, 0.3);
    }
  }
  const rel = clamp(period * 0.5, 0.02, 0.06);
  for (const ev of evs) {
    const c0 = ev.ch, isV = 'aeiou'.includes(c0);
    // vowel quality from the letter; consonants borrow the vowel that follows (or precedes) them in the word
    let vw = null, c = null;
    if (isV) vw = c0 === 'a' && chance(0.3) ? 'x' : c0;
    else if (c0 === 'y' && ev.wi > 0) vw = 'i';
    else {
      c = /[a-z]/.test(c0) ? c0 : null;
      const w = ev.word;
      for (let d = 1; d <= 3 && !vw; d++) {
        const nx = w[ev.wi + d];
        if (nx && 'aeiou'.includes(nx.ch)) vw = nx.ch;
      }
      for (let d = 1; d <= 2 && !vw; d++) {
        const pv = w[ev.wi - d];
        if (pv && 'aeiou'.includes(pv.ch)) vw = pv.ch;
      }
      if (!vw) vw = c ? 'n' : VOWEL_KEYS[c0.charCodeAt(0) % VOWEL_KEYS.length];
    }
    // intonation
    const s = ev.sent, L = s.evs.length, x = L > 1 ? ev.si / (L - 1) : 1;
    let semi = ev.shift + (((c0.charCodeAt(0) * 7) % 5) - 2) * 0.45 + rr(-0.35, 0.35), g = 1, arc = 0;
    if (ev.wi === 0) {
      semi += 1.5;
      g *= 1.15;
    } else if (ev.wi === 1) semi += 0.5;
    if (s.kind === '?') {
      semi += 5.5 * smooth(0.5, 1, x);
      if (x > 0.8) arc = 1;
    } else if (s.kind === '!') {
      semi += 1 + 2.5 * smooth(0.55, 1, x);
      g *= 1.18 + 0.3 * smooth(0.5, 1, x);
      arc = x > 0.85 ? -1 : 0;
    } else if (s.kind === '.') semi -= 0.8 * x + 2.6 * smooth(0.75, 1, x);
    else semi -= 0.5 * x;
    if (ev.phraseEnd) {
      semi += 1.2;
      arc = 1;
    }
    if (ev.upper && ev.word.length > 1 && ev.word.every((e) => e.upper)) g *= 1.3;
    if (!isV) g *= 0.88;
    ev.pm = Math.pow(2, semi / 12);
    ev.g = g;
    ev.arc = arc;
    ev.vw = vw;
    ev.c = c;
    ev.dur = clamp(period * (isV ? 0.78 : 0.62), 0.03, 0.17);
    ev.rel = rel;
    if (ev.t > 0) ev.t = Math.max(0, ev.t + rr(-0.04, 0.04) * period);
  }
  const last = evs[evs.length - 1];
  return { evs, total: last ? last.t + last.dur + rel : 0, rel };
}

/** builds one planned syllable at absolute time `when` (shared by the live scheduler and the offline renderer) */
function babbleSyllable(ctx, dest, when, ev, name, pitch, volume, rev) {
  const P = VOICES[name];
  const v = new Voice(ctx, dest, { when, volume: volume * ev.g * P.trim, pitch: pitch * ev.pm, rev }, 0.05, 0);
  const f = P.f0, d = ev.dur;
  const c = ev.arc > 0 ? [0.97, 1.1] : ev.arc < 0 ? [1.05, 0.9] : [1.02, 0.97];
  speak(v, 0, { P, c: ev.c, vw: ev.vw, dur: d, peak: 0.5, rel: ev.rel, f0: [[0, f * c[0]], [d, f * c[1]]] });
  return v;
}

/* ---- voice SFX ------------------------------------------------------------------------------- */

function sfxFoxTalk(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.06);
  talkSyllable(v, 'fox');
  return v.end;
}

function sfxBearTalk(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.06);
  talkSyllable(v, 'bear');
  return v.end;
}

/** Reynard's evil "mwa-ha-ha-haaa": a long wind-up, three barks stepping down, one drawn-out wobbly finish */
function sfxFoxLaugh(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.2, 0.03);
  const P = VOICES.fox;
  const pk = 0.5;
  speak(v, 0, { P, c: 'm', vw: 'a', dur: 0.27, peak: pk, rel: 0.07, f0: [[0, 240], [0.08, 335], [0.27, 285]], vr: 6, vc: 25, vd: 0.12 });
  [[0.34, 335], [0.5, 295], [0.66, 260]].forEach(([tt, f]) => {
    speak(v, tt, { P, c: 'h', vw: 'a', dur: 0.09, peak: pk, rel: 0.05, f0: [[0, f * 1.06], [0.09, f * 0.92]] });
  });
  speak(v, 0.82, { P, c: 'h', vw: 'a', dur: 0.34, peak: pk, rel: 0.16, f0: [[0, 235], [0.12, 250], [0.34, 190]], vr: 6.4, vc: 45, vd: 0.12 });
  return v.end;
}

/** cartoon snore: a rattly breath in that swells and climbs, then a thin nasal whistle out */
function sfxFoxSnore(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.12, 0.04);
  const t = v.t0, k = v.k, T1 = 0.6;
  const rat = v.osc('sawtooth', t, T1 + 0.15);
  rat.frequency.setValueAtTime(36 * k, t);
  rat.frequency.linearRampToValueAtTime(62 * k, t + T1);
  const rf = v.flt('bandpass', 300 * k, 1.5);
  rf.frequency.setValueAtTime(300 * k, t);
  rf.frequency.exponentialRampToValueAtTime(700 * k, t + T1);
  const rg = v.gn(0);
  env(rg.gain, t, 0.32, 0.9, 0.12, 0.16);
  rat.connect(rf);
  rf.connect(rg);
  rg.connect(v.out);
  v.noise({ buf: 'pink', f: 500, f2: 1100, gl: T1, q: 1, a: 0.34, hold: 0.1, rel: 0.16, peak: 0.7 });
  // out again: a whistling nostril
  v.tone({ t: 0.74, f: 900, f2: 760, gl: 0.6, a: 0.14, hold: 0.22, rel: 0.34, peak: 0.3, vr: 5.2, vc: 24, vd: 0.2, lp: 2200 });
  v.noise({ t: 0.74, buf: 'pink', f: 1500, q: 3.5, a: 0.16, hold: 0.22, rel: 0.34, peak: 0.2 });
  return v.end;
}

/** "haaaAAAaah": mouth opens wide, pitch climbs and sags, breath all over it */
function sfxFoxYawn(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.16, 0.04);
  const P = VOICES.fox;
  vocal(v, {
    dur: 0.72, f0: [[0, 250], [0.3, 380], [0.55, 340], [1.0, 185]], size: P.size * 0.95, peak: 0.5, att: 0.3, rel: 0.5, breath: 0.4,
    form: [[0, VOWELS.n], [0.36, VOWELS.a], [0.7, VOWELS.a], [1.1, VOWELS.o]], vr: 5.4, vc: 32, vd: 0.35,
  });
  v.noise({ buf: 'pink', f: 1400, q: 0.7, a: 0.16, hold: 0.06, rel: 0.4, peak: 0.16 });
  return v.end;
}

/** the little springy boing shared by startles, pops and brawls */
function boing(v, t, f, dur, peak) {
  const k = v.k, tt = v.t0 + t;
  const os = v.osc('sine', tt, dur + 0.05), ot = v.osc('triangle', tt, dur + 0.05);
  const g = v.gn(0);
  env(g.gain, tt, 0.006, peak, dur * 0.2, dur * 0.8);
  for (const s of [os, ot]) {
    s.frequency.setValueAtTime(f * 0.62 * k, tt);
    s.frequency.exponentialRampToValueAtTime(f * 1.5 * k, tt + dur * 0.28);
    s.frequency.exponentialRampToValueAtTime(f * k, tt + dur);
  }
  const l = v.osc('sine', tt, dur + 0.05);
  l.frequency.value = 16;
  const lg = v.gn(0);
  lg.gain.setValueAtTime(240, tt + 0.01);
  lg.gain.exponentialRampToValueAtTime(6, tt + dur);
  l.connect(lg);
  lg.connect(os.detune);
  lg.connect(ot.detune);
  const tg = v.gn(0.3);
  os.connect(g);
  ot.connect(tg);
  tg.connect(g);
  g.connect(v.out);
}

/** "hwah!" - sharp gasp, a squeaked-up vowel, then a spring boing */
function sfxFoxStartle(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.1, 0.05);
  v.noise({ buf: 'pink', f: 2300, q: 0.8, a: 0.004, hold: 0.02, rel: 0.05, peak: 0.55 });
  vocal(v, {
    t: 0.025, dur: 0.17, f0: [[0, 430], [0.05, 760], [0.17, 660]], size: 1.1, peak: 0.55, att: 0.006, rel: 0.07,
    form: [[0, VOWELS.n], [0.05, VOWELS.a], [0.17, VOWELS.x]], breath: 0.12, vr: 9, vc: 30, vd: 0.05,
  });
  boing(v, 0.17, 330, 0.34, 0.11);
  return v.end;
}

/** happy low "mmmm-MM!" of a bear with a full belly */
function sfxBearYum(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.04);
  const P = VOICES.bear;
  vocal(v, {
    dur: 0.42, f0: [[0, 112], [0.2, 146], [0.42, 138]], size: P.size, peak: 0.55, att: 0.04, rel: 0.1, lp: 1300,
    form: [[0, NASAL_M], [0.22, [380, 1050, 2400]], [0.42, [330, 1000, 2350]]], vr: 6, vc: 20, vd: 0.15,
  });
  vocal(v, {
    t: 0.4, dur: 0.2, f0: [[0, 168], [0.06, 178], [0.2, 150]], size: P.size, peak: 0.6, att: 0.012, rel: 0.14, lp: 1900,
    form: [[0, [340, 1000, 2400]], [0.09, [560, 1000, 2500]], [0.2, [400, 1000, 2400]]],
  });
  return v.end;
}

/** cartoon burp: a very low, falling, rattling "uuuurp" and a wet little pop */
function sfxBurp(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.06, 0.06);
  vocal(v, {
    dur: 0.36, f0: [[0, 74], [0.12, 60], [0.36, 38]], size: 0.9, peak: 0.6, att: 0.02, rel: 0.09, breath: 0.1, rough: 0.6, rr: 47,
    form: [[0, VOWELS.u], [0.12, [560, 1000, 2400]], [0.36, VOWELS.o]], q: [4, 5, 7],
  });
  v.noise({ t: 0.37, buf: 'pink', ft: 'lowpass', f: 900, q: 1, bursts: [[0, 1.3, 0.024]] });
  v.tone({ t: 0.37, f: 380, f2: 140, gl: 0.03, a: 0.002, rel: 0.06, peak: 0.34 });
  return v.end;
}

/** three bears going "yaaaay!" */
function sfxBearCheer(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.16, 0.03);
  const P = VOICES.bear;
  [[0, 1], [0.035, 1.12], [0.07, 0.84]].forEach(([tt, m], i) => {
    const f = 150 * m;
    vocal(v, {
      t: tt, dur: 0.56, f0: [[0, f * 0.9], [0.14, f * 1.3], [0.56, f * 1.18]], size: P.size * (i === 2 ? 0.9 : 1), peak: i === 2 ? 0.34 : 0.4, att: 0.03, rel: 0.2, lp: 2800,
      form: [[0, VOWELS.i], [0.12, VOWELS.a], [0.42, VOWELS.a], [0.56, VOWELS.e]], vr: 5.8, vc: 26, vd: 0.2, breath: 0.03,
    });
  });
  return v.end;
}

/* ---- paper & office ------------------------------------------------------------------------------ */

/** the nib touches down and scribbles back and forth; every call scribbles differently */
function sfxPen(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.03, 0.1);
  v.noise({ buf: 'pink', f: 1300, q: 1.2, bursts: [[0, 0.22, 0.008]] });
  const n = ri(3, 6), fc = rr(3000, 4800);
  let t = 0.012;
  for (let i = 0; i < n; i++) {
    const d = rr(0.032, 0.062), up = i % 2 === 0;
    v.rustle({ t, dur: d, f: fc * (up ? 0.8 : 1.25), f2: fc * (up ? 1.3 : 0.8), q: 1.3, n: 9, peak: rr(0.4, 0.7), peakAt: 0.45, flicker: 0.5 });
    t += d * rr(0.75, 1);
  }
  return v.end;
}

/** a sheet dragged over the desk: soft "shhh" with a crinkly top and a few creases */
function sfxPaper(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.04, 0.08);
  const d = rr(0.3, 0.38);
  v.rustle({ buf: 'pink', dur: d, f: 900, f2: 2400, q: 0.5, n: 26, peak: 0.55, peakAt: 0.4, flicker: 0.35, rise: 0.8, fall: 1.2 });
  v.rustle({ dur: d, f: 3200, f2: 5200, q: 0.7, n: 40, peak: 0.6, peakAt: 0.35, flicker: 0.85, rise: 1, fall: 1.4 });
  for (let i = 0; i < 4; i++) v.noise({ t: rr(0.03, d * 0.9), buf: 'white', ft: 'highpass', f: rr(4500, 7000), q: 0.6, bursts: [[0, rr(0.2, 0.45), 0.008]] });
  return v.end;
}

/** rubber stamp: a heavy, soft THUNK, then the desk answers with a low resonance and rattling pens and clips */
function sfxStamp(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.06, 0.04);
  v.tone({ f: 150, f2: 66, gl: 0.07, a: 0.001, rel: 0.22, peak: 0.6 });
  v.tone({ type: 'triangle', f: 330, f2: 160, gl: 0.05, a: 0.001, rel: 0.12, peak: 0.55, lp: 1100 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 1100, q: 0.5, a: 0.001, rel: 0.09, peak: 1.2 });
  v.noise({ buf: 'pink', f: 420, q: 0.8, a: 0.001, rel: 0.07, peak: 0.9 });
  v.noise({ buf: 'pink', f: 1600, q: 0.9, bursts: [[0, 0.75, 0.02]] }); // wooden handle "tock"
  v.tone({ t: 0.006, f: 196, a: 0.002, rel: 0.17, peak: 0.2 });
  let t = 0.04;
  for (let i = 0; i < 6; i++) {
    const a = 1 - i / 7, f = rr(1400, 4200);
    v.tone({ t, f, f2: f * 0.8, gl: 0.02, a: 0.001, rel: 0.03, peak: 0.07 * a });
    v.noise({ t, buf: 'white', f: f * 1.1, q: 2, bursts: [[0, 0.25 * a, 0.01]] });
    t += rr(0.022, 0.05);
  }
  return v.end;
}

/** sticker: a fingertip slap, then a tiny stick-slip peel of the backing */
function sfxSticker(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.03, 0.06);
  v.noise({ buf: 'white', f: 1900, q: 0.8, bursts: [[0, 0.9, 0.022]] });
  v.tone({ f: 300, f2: 170, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.34 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 600, q: 0.5, a: 0.001, rel: 0.04, peak: 0.5 });
  const bs = [];
  for (let i = 0; i < 8; i++) bs.push([i * 0.011, 0.14 + i * 0.03, 0.009]);
  v.noise({ t: 0.085, buf: 'white', ft: 'highpass', f: 3200, f2: 5200, gl: 0.09, q: 0.6, bursts: bs });
  v.tone({ t: 0.19, f: 2400, f2: 3000, gl: 0.01, a: 0.001, rel: 0.02, peak: 0.05 });
  return v.end;
}

/** page flip: air under the page, a flutter, and it lands with a soft pat */
function sfxPage(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.04, 0.06);
  v.noise({ buf: 'pink', f: 600, f2: 3000, gl: 0.17, q: 0.7, a: 0.05, hold: 0.02, rel: 0.12, peak: 0.5 });
  v.rustle({ t: 0.03, dur: 0.16, f: 2600, f2: 4800, q: 0.6, n: 26, peak: 0.45, peakAt: 0.5, flicker: 0.7 });
  v.noise({ t: 0.19, buf: 'white', ft: 'highpass', f: 2800, q: 0.6, bursts: [[0, 0.55, 0.02]] });
  v.tone({ t: 0.192, f: 200, f2: 120, gl: 0.04, a: 0.002, rel: 0.06, peak: 0.16 });
  return v.end;
}

/** a burst of keyboard clacks at a human rhythm; sometimes it ends on a heavier space bar */
function sfxTyping(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.03, 0.05);
  const n = ri(6, 10);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const heavy = i === n - 1 && chance(0.5);
    const a = heavy ? 1 : rr(0.6, 1), f = heavy ? rr(0.6, 0.7) : rr(0.85, 1.3);
    v.noise({ t, buf: 'white', f: 3000 * f, q: 1.1, bursts: [[0, 1.1 * a, 0.012], [0.05, 0.4 * a, 0.01]] }); // key down, key up
    v.tone({ t, type: 'triangle', f: 1300 * f, f2: 820 * f, gl: 0.02, a: 0.001, rel: 0.03, peak: 0.2 * a });
    v.tone({ t, f: 210 * f, f2: 140 * f, gl: 0.03, a: 0.001, rel: 0.045, peak: 0.12 * a });
    t += rr(0.04, 0.11) * (chance(0.18) ? 1.7 : 1);
  }
  return v.end;
}

/** terminal blip */
function sfxBeep(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.04, 0.02);
  v.tone({ type: 'square', f: 1180, f2: 1260, gl: 0.01, a: 0.002, hold: 0.045, rel: 0.02, peak: 0.13, lp: 3600 });
  v.tone({ f: 1180, f2: 1260, gl: 0.01, a: 0.002, hold: 0.045, rel: 0.03, peak: 0.2 });
  v.noise({ buf: 'white', f: 4000, q: 1, bursts: [[0, 0.05, 0.006]] });
  return v.end;
}

/** CRT power-on: relay THUNK, the degauss "bwoOOom" wobbling and settling, a rising flyback whine, phosphor fizz */
function sfxCrtOn(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.02);
  const t = v.t0, k = v.k;
  v.tone({ f: 135, f2: 56, gl: 0.06, a: 0.001, rel: 0.2, peak: 0.7 });
  v.noise({ buf: 'pink', f: 1500, q: 1, bursts: [[0, 0.8, 0.014], [0.035, 0.4, 0.01]] });
  const hum = v.osc('sine', t + 0.04, 0.8), hum2 = v.osc('triangle', t + 0.04, 0.8);
  hum.frequency.value = 110 * k;
  hum2.frequency.value = 220 * k;
  const am = v.gn(0.5), lfo = v.osc('sine', t + 0.04, 0.8), lg = v.gn(0);
  lfo.frequency.value = 11;
  lg.gain.setValueAtTime(0.5, t + 0.04);
  lg.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
  lfo.connect(lg);
  lg.connect(am.gain);
  const h2 = v.gn(0.9), hg = v.gn(0);
  env(hg.gain, t + 0.04, 0.02, 0.3, 0.05, 0.4);
  hum.connect(am);
  hum2.connect(h2);
  h2.connect(am);
  am.connect(hg);
  hg.connect(v.out);
  v.tone({ t: 0.06, f: 900, f2: 4800, gl: 0.55, a: 0.3, hold: 0.25, rel: 0.5, peak: 0.12, lp: 7000 });
  v.tone({ t: 0.06, type: 'triangle', f: 450, f2: 2400, gl: 0.55, a: 0.3, hold: 0.25, rel: 0.45, peak: 0.06 });
  v.noise({ t: 0.05, buf: 'white', ft: 'highpass', f: 6000, q: 0.5, a: 0.25, hold: 0.2, rel: 0.4, peak: 0.08 });
  v.noise({ t: 0.78, buf: 'pink', f: 3000, q: 1, bursts: [[0, 0.3, 0.008]] }); // picture is up
  return v.end;
}

/** CRT power-off: click, thunk, the picture collapsing into a dot with a falling whistle, one last faint glow */
function sfxCrtOff(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.02);
  v.noise({ buf: 'pink', f: 2200, q: 1, bursts: [[0, 0.6, 0.01]] });
  v.tone({ f: 190, f2: 78, gl: 0.05, a: 0.001, rel: 0.12, peak: 0.42 });
  v.tone({ t: 0.015, f: 5200, f2: 230, gl: 0.17, a: 0.004, hold: 0.04, rel: 0.09, peak: 0.16 });
  v.tone({ t: 0.015, type: 'triangle', f: 2600, f2: 115, gl: 0.17, a: 0.004, hold: 0.04, rel: 0.09, peak: 0.08 });
  v.noise({ t: 0.02, buf: 'white', ft: 'highpass', f: 4500, f2: 2000, gl: 0.2, q: 0.5, a: 0.006, rel: 0.2, peak: 0.16 });
  v.bell({ t: 0.2, f: 2637, parts: SOFT, peak: 0.05, rel: 0.4 });
  return v.end;
}

/* ---- eggs & reveals ------------------------------------------------------------------------------ */

/** the egg rocks: two hollow shell knocks, the second a little lower */
function sfxEggWobble(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.06, 0.08);
  const rock = (t, f, a) => {
    v.tone({ t, f, f2: f * 0.7, gl: 0.05, a: 0.001, rel: 0.09, peak: 0.42 * a });
    v.tone({ t, type: 'triangle', f: f * 2.3, f2: f * 1.6, gl: 0.03, a: 0.001, rel: 0.04, peak: 0.12 * a });
    v.noise({ t, buf: 'pink', f: 1100, q: 1.2, bursts: [[0, 0.3 * a, 0.012]] });
  };
  rock(0, 430, 1);
  rock(0.15, 380, 0.85);
  v.noise({ t: 0.05, buf: 'pink', ft: 'lowpass', f: 700, q: 0.5, a: 0.03, hold: 0.06, rel: 0.12, peak: 0.12 }); // scuffing the straw
  return v.end;
}

/** a crack races across the shell (pitch = crack stage) */
function sfxEggCrack(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.06);
  v.noise({ buf: 'white', f: 2600, q: 1.1, bursts: [[0, 1.3, 0.012], [0.02, 0.8, 0.01], [0.038, 1, 0.009]] });
  v.tone({ f: 1300, f2: 700, gl: 0.03, a: 0.001, rel: 0.07, peak: 0.28 });
  v.tone({ type: 'triangle', f: 3100, f2: 2200, gl: 0.03, a: 0.001, rel: 0.04, peak: 0.08 });
  const cr = [];
  for (let i = 0; i < 9; i++) cr.push([0.05 + i * 0.022 + rr(0, 0.012), rr(0.25, 0.7) * (1 - i / 11), 0.008]);
  v.noise({ buf: 'white', f: 3600, q: 0.9, bursts: cr.map((b) => [b[0], b[1] * 1.6, b[2]]) });
  for (let i = 0; i < 4; i++) v.tone({ t: 0.06 + i * 0.045 + rr(0, 0.02), f: rr(2500, 5200), a: 0.001, rel: 0.03, peak: 0.05 });
  return v.end;
}

/** the egg bursts: a pop, shell shards tinkling everywhere, then a sparkle rising out of it */
function sfxEggBurst(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.3, 0.02);
  v.tone({ f: 620, f2: 110, gl: 0.07, a: 0.001, rel: 0.16, peak: 0.6 });
  v.noise({ buf: 'white', f: 2600, f2: 900, gl: 0.12, q: 0.7, a: 0.001, rel: 0.16, peak: 1 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 600, q: 0.5, a: 0.001, rel: 0.12, peak: 0.6 });
  for (let i = 0; i < 14; i++) v.tone({ t: 0.03 + i * 0.028 + rr(0, 0.02), f: rr(1800, 6200), a: 0.001, rel: rr(0.05, 0.14), peak: 0.09 * (1 - i / 18) });
  [1568, 2093, 2637, 3136, 3951].forEach((f, i) => v.bell({ t: 0.09 + i * 0.06, f, parts: GLOCK, peak: 0.16, rel: 0.7 }));
  v.noise({ t: 0.05, buf: 'white', ft: 'highpass', f: 7000, q: 0.5, a: 0.01, rel: 0.6, peak: 0.12 });
  return v.end;
}

/** brass section: detuned saw pairs through a low-pass that opens with the attack */
function brassChord(v, t, midis, hold, rel, peak, lp2 = 3600) {
  for (const m of midis) {
    const f = mtof(m);
    v.tone({ t, type: 'sawtooth', f, a: 0.025, hold, rel, peak, lp: 600, lp2, lpt: 0.09, q: 1, det: -6 });
    v.tone({ t, type: 'sawtooth', f, a: 0.025, hold, rel, peak: peak * 0.8, lp: 600, lp2, lpt: 0.09, q: 1, det: 6 });
  }
}

/** timpani: a pitched skin thump */
function timpani(v, t, f, peak, rel = 0.6) {
  v.tone({ t, f: f * 1.28, f2: f, gl: 0.07, a: 0.002, rel, peak: peak * 0.75 });
  v.tone({ t, type: 'triangle', f: f * 2.4, f2: f * 1.8, gl: 0.09, a: 0.002, rel: rel * 0.45, peak: peak * 0.5, lp: 900 });
  v.noise({ t, buf: 'pink', ft: 'lowpass', f: 520, q: 0.5, a: 0.001, rel: 0.07, peak: peak * 1.1 });
}

/** crash cymbal (a = attack, rel = decay) */
function cymbal(v, t, peak, rel, a = 0.004) {
  v.noise({ t, buf: 'white', ft: 'highpass', f: 5200, q: 0.6, a, rel, peak });
  v.noise({ t, buf: 'white', f: 8500, q: 0.9, a, rel: rel * 0.8, peak: peak * 0.7 });
}

/**
 * a little choir: detuned saws through a vowel filter bank that morphs `from` -> `to` while the chord swells in and out
 * (t, dur, peak in the usual voice-relative units)
 */
function choir(v, t, midis, dur, peak, from = VOWELS.o, to = VOWELS.a) {
  const k = v.k, tt = v.t0 + t, rel = dur * 0.8, total = dur + rel + 0.05, att = dur * 0.55;
  const mix = v.gn(0);
  env(mix.gain, tt, att, peak, Math.max(0, dur - att), rel);
  mix.connect(v.out);
  const bus = v.gn(1);
  const gains = [1, 0.5, 0.25], qs = [6, 8, 10];
  for (let j = 0; j < 3; j++) {
    const b = v.flt('bandpass', from[j], qs[j]);
    b.frequency.setValueAtTime(from[j], tt);
    b.frequency.exponentialRampToValueAtTime(to[j], tt + dur * 0.7);
    const g = v.gn(gains[j]);
    bus.connect(b);
    b.connect(g);
    g.connect(mix);
  }
  const vib = v.osc('sine', tt, total), vg = v.gn(0);
  vib.frequency.value = 5.2;
  vg.gain.setValueAtTime(0, tt);
  vg.gain.linearRampToValueAtTime(14, tt + dur * 0.6);
  vib.connect(vg);
  midis.forEach((m) => {
    for (const d of [-9, 8]) {
      const s = v.osc('sawtooth', tt, total), sg = v.gn(0.5 / Math.sqrt(midis.length * 2));
      s.frequency.value = mtof(m) * k;
      s.detune.value = d + rr(-3, 3);
      vg.connect(s.detune);
      s.connect(sg);
      sg.connect(bus);
    }
  });
}

/** common reveal: a friendly two-note "ta-da" */
function sfxRevealCommon(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.22, 0.01);
  v.bell({ t: 0, f: 784, parts: SOFT, peak: 0.24, rel: 0.5 });
  v.tone({ t: 0, type: 'triangle', f: 784, a: 0.004, rel: 0.22, peak: 0.12 });
  v.bell({ t: 0.12, f: 1047, parts: GLOCK, peak: 0.32, rel: 0.8 });
  v.tone({ t: 0.12, type: 'triangle', f: 1047, a: 0.004, rel: 0.3, peak: 0.12 });
  v.tone({ t: 0.16, f: 3136, a: 0.003, rel: 0.25, peak: 0.05 });
  return v.end;
}

/** rare reveal: a harp-like arpeggio landing on a glowing chord */
function sfxRevealRare(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.3, 0.01);
  [392, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => {
    v.bell({ t: i * 0.075, f, parts: SOFT, peak: 0.22, rel: 0.6 });
    v.tone({ t: i * 0.075, type: 'triangle', f, a: 0.003, rel: 0.24, peak: 0.1 });
  });
  [783.99, 987.77, 1174.66, 1568].forEach((f) => v.bell({ t: 0.38, f, parts: GLOCK, peak: 0.16, rel: 1.1 }));
  v.noise({ t: 0.38, buf: 'white', ft: 'highpass', f: 6500, q: 0.5, a: 0.02, rel: 0.7, peak: 0.08 });
  return v.end;
}

/** epic reveal: brass "ba-ba-BAAA" over timpani, a cymbal crash, bells glittering on top */
function sfxRevealEpic(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.3, 0.008);
  timpani(v, 0, 98, 0.4);
  [0, 0.13, 0.26].forEach((t) => brassChord(v, t, [60, 64, 67], 0.05, 0.09, 0.05));
  timpani(v, 0.42, 98, 0.5, 0.9);
  brassChord(v, 0.42, [60, 64, 67, 72, 76, 79], 0.5, 0.7, 0.04);
  cymbal(v, 0.42, 0.22, 1.3);
  [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => v.bell({ t: 0.6 + i * 0.11, f, parts: GLOCK, peak: 0.13, rel: 0.9 }));
  return v.end;
}

/** legendary reveal: a sub boom and a rising shimmer, then the choir swells over full brass, cymbals and glitter */
function sfxRevealLegendary(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.4, 0.008);
  v.tone({ f: 96, f2: 48, gl: 0.9, a: 0.01, rel: 0.9, peak: 0.34 });
  v.tone({ type: 'triangle', f: 192, f2: 96, gl: 0.9, a: 0.01, rel: 0.7, peak: 0.16, lp: 700 });
  v.noise({ buf: 'pink', f: 300, f2: 3200, gl: 0.9, q: 0.8, a: 0.7, hold: 0.05, rel: 0.2, peak: 0.45 });
  [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => v.bell({ t: 0.15 + i * 0.09, f, parts: GLOCK, peak: 0.13, rel: 0.7 }));
  choir(v, 0.95, [48, 55, 60, 64, 67, 72], 1.5, 0.42);
  timpani(v, 0.95, 82, 0.55, 1.1);
  brassChord(v, 0.95, [55, 60, 64, 67, 72], 0.3, 1.0, 0.035);
  cymbal(v, 0.95, 0.26, 1.7);
  [1046.5, 1318.5, 1568, 2093].forEach((f) => v.bell({ t: 0.95, f: f * 2, parts: GLOCK, peak: 0.1, rel: 1.6 }));
  for (let i = 0; i < 18; i++) v.tone({ t: 1.05 + i * 0.1 + rr(0, 0.06), f: pick([2093, 2637, 3136, 3520, 4186, 5274]), a: 0.002, rel: 0.3, peak: 0.07 * (1 - i / 22) });
  return v.end;
}

/** a star lands: bubble pop into a bright ding (pitch rises with every star) */
function sfxStarPop(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.2, 0.01);
  v.tone({ f: 700, f2: 1900, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.24 });
  v.noise({ buf: 'white', f: 4000, q: 1.2, bursts: [[0, 0.2, 0.008]] });
  v.bell({ t: 0.02, f: 1568, parts: GLOCK, peak: 0.34, rel: 0.6 });
  v.tone({ t: 0.02, f: 3136, a: 0.002, rel: 0.3, peak: 0.08 });
  return v.end;
}

/** soft UI ding */
function sfxChip(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.12, 0.02);
  v.bell({ f: 1760, parts: SOFT, peak: 0.24, rel: 0.4 });
  v.noise({ buf: 'white', f: 5000, q: 1, bursts: [[0, 0.06, 0.006]] });
  return v.end;
}

/* ---- the office clock ---------------------------------------------------------------------------- */

/** one click of a wall clock: a sharp tick, a tiny case resonance (f = pitch scale) */
function clockClick(v, f, a, body) {
  v.noise({ buf: 'white', f: 3600 * f, q: 1.4, bursts: [[0, 0.8 * a, 0.006]] });
  v.tone({ f: 2000 * f, f2: 1500 * f, gl: 0.012, a: 0.0008, rel: 0.02, peak: 0.25 * a });
  v.tone({ f: 640 * f, f2: 520 * f, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.16 * body });
}

function sfxTick(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.03, 0.02);
  clockClick(v, 1, 1, 1);
  return v.end;
}

function sfxTock(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.03, 0.02);
  clockClick(v, 0.72, 0.9, 1.4);
  return v.end;
}

/** lub-DUB */
function sfxHeartbeat(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.03);
  const thump = (t, f, a) => {
    v.tone({ t, f, f2: f * 0.55, gl: 0.09, a: 0.006, rel: 0.16, peak: 0.7 * a });
    v.tone({ t, type: 'triangle', f: f * 2.8, f2: f * 1.5, gl: 0.07, a: 0.006, rel: 0.1, peak: 0.42 * a, lp: 700 }); // so small speakers hear it too
    v.noise({ t, buf: 'pink', ft: 'lowpass', f: 480, q: 0.5, a: 0.004, rel: 0.08, peak: 0.9 * a });
  };
  thump(0, 82, 1);
  thump(0.19, 96, 0.8);
  return v.end;
}

/** office alarm bell: an inharmonic bell hammered ~26 times a second by the clapper, for about 1.2 s */
function sfxAlarm(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.12, 0.02);
  const t = v.t0, k = v.k, D = 1.1;
  const am = v.gn(0.58), lfo = v.osc('sawtooth', t, D + 0.4), lg = v.gn(-0.42);
  lfo.frequency.value = 26;
  lfo.connect(lg);
  lg.connect(am.gain); // each clapper strike: full level, then a fast fall
  const eg = v.gn(0);
  env(eg.gain, t, 0.004, 1, D - 0.2, 0.22);
  am.connect(eg);
  eg.connect(v.out);
  [[1, 1], [2.32, 0.55], [4.25, 0.35], [6.63, 0.2]].forEach(([r, a]) => {
    for (const d of [1, 1.006]) {
      const f = 1020 * r * d * k;
      if (f > ctx.sampleRate * 0.42) continue;
      const os = v.osc('sine', t, D + 0.4), og = v.gn(0.16 * a);
      os.frequency.value = f;
      os.connect(og);
      og.connect(am);
    }
  });
  const cl = [];
  for (let i = 0; i * 0.0385 < D - 0.1; i++) cl.push([i * 0.0385, 0.22 * Math.min(1, (D - 0.1 - i * 0.0385) / 0.3), 0.012]);
  v.noise({ buf: 'white', ft: 'highpass', f: 3200, q: 0.5, bursts: cl }); // clatter of the hammer
  return v.end;
}

/** cheery hand bell: a shaken "ding-a-ling-a-ling" that rings out */
function sfxLunchBell(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.22, 0.02);
  let t = 0;
  for (let i = 0; i < 9; i++) {
    const f = i % 2 ? 2349 : 2093, a = 0.2 * (1 - i * 0.04);
    v.bell({ t, f: f * rr(0.99, 1.01), parts: BELL, peak: a, rel: 0.42 });
    v.noise({ t, buf: 'white', f: 5200, q: 0.8, bursts: [[0, 0.1, 0.006]] });
    t += rr(0.058, 0.09);
  }
  v.bell({ t: t + 0.06, f: 2093, parts: BELL, peak: 0.24, rel: 0.95 });
  v.bell({ t: t + 0.2, f: 2637, parts: BELL, peak: 0.18, rel: 0.95 });
  return v.end;
}

/** 5 PM: a chiming factory steam whistle (C major!) and a distant crowd going "wooo" */
function sfxOffwork(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.5, 0.008);
  steamWhistle(v, { L: 1.05, tail: 0.65, notes: [[261.63, 1], [329.63, 0.9], [392, 0.55]], lpf: 2300, level: 1 });
  for (let i = 0; i < 6; i++) {
    const f = i % 2 ? rr(300, 360) : rr(190, 230);
    vocal(v, {
      t: 0.3 + rr(0, 0.5), dur: rr(0.4, 0.6), f0: [[0, f], [0.25, f * 1.3], [0.7, f * 1.22]], size: i % 2 ? 1.1 : 0.9, peak: 0.34, att: 0.12, rel: 0.35, lp: 1800,
      form: [[0, VOWELS.u], [0.2, VOWELS.o], [0.6, VOWELS.o]], vr: 5.5, vc: 24, vd: 0.2, breath: 0.05,
    });
  }
  return v.end;
}

/* ---- eating (cartoon gore, played for laughs) --------------------------------------------------- */

/** juicy bite: teeth break the skin, a wet resonant slosh slides down, a few bubbles pop */
function sfxSquelch(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.1);
  v.noise({ buf: 'white', f: 2200, q: 1, bursts: [[0, 0.7, 0.012], [0.02, 0.4, 0.01]] });
  v.rustle({ buf: 'pink', t: 0.01, dur: 0.27, f: 1800, f2: 420, q: 4, n: 26, peak: 0.9, peakAt: 0.15, flicker: 0.75, fall: 1.1 });
  v.tone({ t: 0.02, type: 'sawtooth', f: 220, f2: 85, gl: 0.26, a: 0.008, hold: 0.06, rel: 0.14, peak: 0.16, lp: 700, vr: 34, vc: 420, vd: 0.02 });
  [[0.07, 0.25], [0.15, 0.2], [0.23, 0.13]].forEach(([t, a]) => {
    const f = rr(280, 540);
    v.tone({ t, f, f2: f * 2.3, gl: 0.04, a: 0.002, rel: 0.06, peak: a });
  });
  return v.end;
}

/** bone crunch: a sharp CRACK with a low knock, then grinding grains and a final splinter */
function sfxCrunch(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.08);
  v.tone({ f: 210, f2: 70, gl: 0.06, a: 0.001, rel: 0.12, peak: 0.55 });
  v.noise({ buf: 'white', f: 1700, q: 0.7, bursts: [[0, 1.5, 0.02], [0.012, 1.2, 0.016]] });
  v.tone({ type: 'square', f: 760, f2: 520, gl: 0.02, a: 0.001, rel: 0.035, peak: 0.12, lp: 2200 });
  const cr = [];
  for (let i = 0; i < 12; i++) cr.push([0.04 + i * 0.024 + rr(0, 0.014), rr(0.5, 1.2) * (1 - i / 16), rr(0.01, 0.02)]);
  v.noise({ buf: 'white', f: 1400, q: 0.8, bursts: cr });
  v.noise({ buf: 'pink', f: 380, q: 0.7, a: 0.02, hold: 0.15, rel: 0.12, peak: 0.9 });
  v.noise({ t: 0.34, buf: 'white', f: 2600, q: 1, bursts: [[0, 0.8, 0.014]] });
  v.tone({ t: 0.34, f: 900, f2: 500, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.1 });
  return v.end;
}

/** a pass-by whoosh: pink noise through a band-pass that sweeps f0 -> f1 (40%) -> f2 while the level swells and dies away */
function swish(v, t, dur, f0, f1, f2, peak, q = 1, buf = 'pink') {
  const k = v.k, tt = v.t0 + t;
  const s = v.nsrc(buf, tt, dur + 0.05), b = v.flt('bandpass', f0 * k, q);
  b.frequency.setValueAtTime(clamp(f0 * k, 10, 20000), tt);
  b.frequency.exponentialRampToValueAtTime(clamp(f1 * k, 10, 20000), tt + dur * 0.4);
  b.frequency.exponentialRampToValueAtTime(clamp(f2 * k, 10, 20000), tt + dur);
  const g = v.gn(0);
  env(g.gain, tt, dur * 0.4, peak, dur * 0.05, dur * 0.55);
  s.connect(b);
  b.connect(g);
  g.connect(v.out);
}

/** a bone flung through the air, tumbling */
function sfxBoneToss(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.08);
  const t = v.t0, k = v.k, T = 0.42;
  const s = v.nsrc('pink', t, T + 0.05), b = v.flt('bandpass', 600 * k, 1.2);
  b.frequency.setValueAtTime(600 * k, t);
  b.frequency.exponentialRampToValueAtTime(2600 * k, t + 0.16);
  b.frequency.exponentialRampToValueAtTime(800 * k, t + T);
  const am = v.gn(0.7), l = v.osc('sine', t, T + 0.05), lg = v.gn(0.3);
  l.frequency.value = 15; // the tumble
  l.connect(lg);
  lg.connect(am.gain);
  const g = v.gn(0);
  env(g.gain, t, 0.08, 0.7, 0.06, T - 0.14);
  s.connect(b);
  b.connect(am);
  am.connect(g);
  g.connect(v.out);
  return v.end;
}

/** a bone bouncing on hard ground: hollow "tok"s and dull thuds, quicker and quieter every time */
function sfxBoneClatter(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.06, 0.06);
  let t = 0, gap = 0.13, a = 1;
  for (let i = 0; i < 5; i++) {
    const f = rr(620, 1000);
    v.tone({ t, f, f2: f * 0.72, gl: 0.04, a: 0.001, rel: 0.06, peak: 0.42 * a });
    v.tone({ t, type: 'triangle', f: f * 2.4, f2: f * 1.9, gl: 0.03, a: 0.001, rel: 0.03, peak: 0.1 * a });
    v.noise({ t, buf: 'pink', f: 1400, q: 1.1, bursts: [[0, 0.5 * a, 0.012]] });
    v.noise({ t, buf: 'pink', ft: 'lowpass', f: 500, q: 0.5, bursts: [[0, 0.4 * a, 0.03]] });
    t += gap;
    gap *= rr(0.62, 0.74);
    a *= 0.62;
  }
  v.tone({ t: t + 0.02, f: rr(1200, 1600), f2: 900, gl: 0.02, a: 0.001, rel: 0.03, peak: 0.05 });
  return v.end;
}

/** cartoon splat: a fat wet slap, a gurgling spread, a few droplets */
function sfxBloodSplat(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.08, 0.08);
  v.tone({ f: 260, f2: 85, gl: 0.06, a: 0.001, rel: 0.14, peak: 0.6 });
  v.noise({ buf: 'pink', f: 1300, q: 0.7, a: 0.002, hold: 0.01, rel: 0.09, peak: 1.1 });
  v.rustle({ t: 0.02, buf: 'pink', dur: 0.28, f: 2400, f2: 500, q: 3.5, n: 26, peak: 0.85, peakAt: 0.1, flicker: 0.7, fall: 1.3 });
  for (let i = 0; i < 5; i++) {
    const f = rr(500, 1400);
    v.tone({ t: 0.12 + i * 0.05 + rr(0, 0.03), f, f2: f * rr(1.6, 2.4), gl: 0.03, a: 0.002, rel: 0.05, peak: 0.12 * (1 - i / 6) });
  }
  return v.end;
}

/* ---- building ------------------------------------------------------------------------------------ */

/** the cartoon fight cloud: a scuffling dust ball with rapid whacks, bonks, zips, squeaks and boings, ending in a POW */
function sfxBuildCloud(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.06, 0.04);
  const D = 1.0;
  v.rustle({ buf: 'pink', dur: D, f: 700, f2: 1300, q: 0.7, n: 60, peak: 0.5, peakAt: 0.5, flicker: 0.85, rise: 0.4, fall: 0.6 });
  let t = 0.03;
  while (t < D - 0.08) {
    const a = rr(0.6, 1) * 1.5;
    switch (ri(0, 5)) {
      case 0: // whack
        v.noise({ t, buf: 'white', f: rr(1500, 2600), q: 1.2, bursts: [[0, 0.9 * a, 0.02]] });
        v.tone({ t, f: rr(500, 800), f2: 260, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.2 * a });
        break;
      case 1: { // bonk
        const f = rr(240, 420);
        v.tone({ t, f, f2: f * 0.5, gl: 0.06, a: 0.002, rel: 0.1, peak: 0.42 * a });
        v.tone({ t, type: 'triangle', f: f * 2.2, f2: f * 1.1, gl: 0.05, a: 0.002, rel: 0.05, peak: 0.12 * a });
        break;
      }
      case 2: { // zip
        const up = chance(0.5), f = rr(300, 600), f2 = rr(1800, 3000);
        v.tone({ t, f: up ? f : f2, f2: up ? f2 : f, gl: rr(0.07, 0.12), a: 0.004, rel: 0.05, peak: 0.13 * a });
        break;
      }
      case 3: // slap
        v.noise({ t, buf: 'white', ft: 'highpass', f: 3000, q: 0.5, bursts: [[0, 0.7 * a, 0.012]] });
        v.tone({ t, f: 190, f2: 110, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.2 * a });
        break;
      case 4: { // boing
        const f = rr(200, 400);
        v.tone({ t, f, f2: f * 2, gl: 0.08, a: 0.003, rel: 0.09, peak: 0.16 * a, vr: 20, vc: 200, vd: 0.02 });
        break;
      }
      default: { // squeak
        const f = rr(900, 1400);
        v.tone({ t, f, f2: rr(1500, 2400), gl: 0.05, a: 0.005, rel: 0.05, peak: 0.1 * a });
      }
    }
    t += rr(0.045, 0.095);
  }
  v.tone({ t: D - 0.1, f: 220, f2: 70, gl: 0.1, a: 0.002, rel: 0.25, peak: 0.42 });
  v.noise({ t: D - 0.1, buf: 'white', f: 1800, f2: 500, gl: 0.2, q: 0.7, a: 0.002, rel: 0.3, peak: 0.75 });
  v.bell({ t: D - 0.02, f: 2637, parts: GLOCK, peak: 0.12, rel: 0.4 });
  return v.end;
}

/** something pops into existence: a bubble pop, a rising bloop and a springy landing */
function sfxPopIn(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.1, 0.06);
  v.noise({ buf: 'white', f: 2400, q: 1, bursts: [[0, 0.5, 0.008]] });
  v.tone({ f: 260, f2: 900, gl: 0.045, a: 0.002, rel: 0.09, peak: 0.42 });
  boing(v, 0.03, 420, 0.3, 0.26);
  v.bell({ t: 0.05, f: 1568, parts: SOFT, peak: 0.08, rel: 0.3 });
  return v.end;
}

/** hand saw: push - pull - push, the teeth rasping */
function sfxSaw(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.06);
  const k = v.k;
  const stroke = (t, d, f0, f1, a) => {
    const tt = v.t0 + t;
    const s = v.nsrc('white', tt, d + 0.05), b = v.flt('bandpass', f0 * k, 1.4);
    b.frequency.setValueAtTime(f0 * k, tt);
    b.frequency.linearRampToValueAtTime(f1 * k, tt + d);
    const am = v.gn(0.5), l = v.osc('sawtooth', tt, d + 0.05), lg = v.gn(0.5);
    l.frequency.value = rr(78, 92);
    l.connect(lg);
    lg.connect(am.gain);
    const g = v.gn(0);
    env(g.gain, tt, d * 0.15, a, d * 0.55, d * 0.3);
    s.connect(b);
    b.connect(am);
    am.connect(g);
    g.connect(v.out);
    v.tone({ t, type: 'triangle', f: 300, f2: 340, gl: d, a: d * 0.2, hold: d * 0.4, rel: d * 0.4, peak: 0.05, vr: 7, vc: 30 }); // the blade flexes
  };
  stroke(0, 0.24, 1500, 2400, 0.6);
  stroke(0.26, 0.24, 2600, 1700, 0.55);
  stroke(0.52, 0.24, 1500, 2300, 0.5);
  return v.end;
}

/** a little hammer taps a nail: steel "tink" over a wood thunk, then again a bit deeper as it sinks */
function sfxNail(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.06, 0.1);
  v.noise({ buf: 'white', f: 4200, q: 1.5, bursts: [[0, 0.5, 0.005]] });
  v.bell({ f: 3520, parts: [[1, 1, 1], [2.32, 0.5, 0.5], [3.9, 0.25, 0.3]], peak: 0.28, rel: 0.12 });
  v.tone({ f: 420, f2: 300, gl: 0.03, a: 0.001, rel: 0.04, peak: 0.16 });
  v.noise({ t: 0.09, buf: 'white', f: 3000, q: 1.5, bursts: [[0, 0.35, 0.005]] });
  v.bell({ t: 0.09, f: 2960, parts: [[1, 1, 1], [2.32, 0.4, 0.5]], peak: 0.18, rel: 0.09 });
  v.tone({ t: 0.09, f: 330, f2: 230, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.16 });
  return v.end;
}

/* ---- nature & fish ------------------------------------------------------------------------------- */

/** a songbird: one of six little songs, different every time (pitch = the bird's size) */
function sfxBirdChirp(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.2, 0.06);
  const base = rr(2600, 4200);
  const chirp = (t, f, f2, d, a, vr) => {
    v.tone({ t, f, f2, gl: d * 0.85, a: 0.006, hold: d * 0.25, rel: d * 0.6, peak: a, vr: vr || 0, vc: 60, vd: 0.02 });
    v.tone({ t, f: f * 2, f2: f2 * 2, gl: d * 0.85, a: 0.006, hold: d * 0.2, rel: d * 0.5, peak: a * 0.18 });
  };
  switch (ri(0, 5)) {
    case 0: // sparrow "chip-chip-chip"
      for (let i = 0; i < 3; i++) chirp(i * rr(0.09, 0.12), base, base * rr(1.15, 1.3), 0.05, 0.26);
      break;
    case 1: // "tweet-tweet": two rising whistles
      chirp(0, base * 0.85, base * 1.3, 0.11, 0.26);
      chirp(0.2, base * 0.95, base * 1.4, 0.12, 0.26);
      break;
    case 2: { // trill
      const n = ri(7, 11);
      for (let i = 0; i < n; i++) chirp(i * 0.045, base * (i % 2 ? 1.14 : 1), base * (i % 2 ? 1.1 : 1.04), 0.035, 0.2);
      break;
    }
    case 3: // sweet descending "fee-bee"
      chirp(0, base * 1.2, base * 1.16, 0.2, 0.26, 7);
      chirp(0.27, base * 0.94, base * 0.88, 0.24, 0.26, 7);
      break;
    case 4: // chickadee "chick-a-dee-dee"
      chirp(0, base * 0.9, base * 1.1, 0.045, 0.24);
      chirp(0.08, base * 1.3, base * 1.2, 0.045, 0.2);
      for (let i = 0; i < ri(2, 3); i++) chirp(0.19 + i * 0.12, base * 0.8, base * 0.72, 0.09, 0.24);
      break;
    default: { // warble
      let t = 0, f = base;
      for (let i = 0; i < 6; i++) {
        const f2 = base * rr(0.8, 1.3);
        chirp(t, f, f2, rr(0.05, 0.09), 0.22, 30);
        f = f2;
        t += rr(0.07, 0.11);
      }
    }
  }
  return v.end;
}

/** "rrRIB - bit": two croaks, each a rattle of pulses through a resonant throat sac */
function sfxFrogCroak(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.12, 0.08);
  const k = v.k;
  const croak = (t, p0, p1, r0, r1, dur, peak) => {
    const tt = v.t0 + t;
    const os = v.osc('sawtooth', tt, dur + 0.05);
    os.frequency.setValueAtTime(p0 * k, tt);
    os.frequency.linearRampToValueAtTime(p1 * k, tt + dur);
    const g = v.gn(0);
    env(g.gain, tt, 0.012, peak, dur * 0.55, dur * 0.3);
    [[1, 5.5, 1], [1.7, 6, 0.5]].forEach(([m, q, a]) => {
      const b = v.flt('bandpass', r0 * m * k, q), ga = v.gn(a);
      b.frequency.setValueAtTime(r0 * m * k, tt);
      b.frequency.exponentialRampToValueAtTime(r1 * m * k, tt + dur * 0.9);
      os.connect(b);
      b.connect(ga);
      ga.connect(g);
    });
    g.connect(v.out);
  };
  croak(0, 52, 68, 420, 760, 0.2, 1.6);
  croak(0.21, 92, 74, 900, 1150, 0.13, 1.8);
  return v.end;
}

/** a water drop: the bubble resonance sweeps up, a smaller echo follows in the stone room */
function sfxWaterDrip(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.3, 0.15);
  const f = rr(700, 1100);
  v.tone({ f, f2: f * 2.1, gl: 0.05, a: 0.001, rel: 0.11, peak: 0.34 });
  v.tone({ f: f * 2, f2: f * 4, gl: 0.05, a: 0.001, rel: 0.05, peak: 0.06 });
  v.noise({ buf: 'white', f: 3500, q: 1.5, bursts: [[0, 0.1, 0.004]] });
  v.tone({ t: 0.17, f: f * 1.15, f2: f * 2.4, gl: 0.05, a: 0.001, rel: 0.09, peak: 0.09 });
  return v.end;
}

/** a fish on dry land: wet slaps that slow down and fade as it tires */
function sfxFishFlop(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.08);
  let t = 0, gap = 0.1, a = 1;
  for (let i = 0; i < 5; i++) {
    v.tone({ t, f: rr(170, 230), f2: 90, gl: 0.05, a: 0.001, rel: 0.09, peak: 0.42 * a });
    v.noise({ t, buf: 'pink', f: rr(1000, 1700), q: 0.8, a: 0.001, hold: 0.008, rel: 0.05, peak: 0.9 * a });
    v.rustle({ t: t + 0.01, dur: 0.07, f: 3200, f2: 1600, q: 1, n: 7, peak: 0.4 * a, peakAt: 0.2, flicker: 0.6 });
    t += gap * rr(0.8, 1.2);
    gap *= 1.16;
    a *= 0.8;
  }
  return v.end;
}

/** a pat on the head and a happy, rolled little trill */
function sfxPet(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.1, 0.05);
  const t = v.t0 + 0.09, k = v.k;
  v.noise({ buf: 'pink', ft: 'lowpass', f: 700, q: 0.5, a: 0.004, rel: 0.05, peak: 0.7 });
  v.tone({ f: 210, f2: 140, gl: 0.04, a: 0.003, rel: 0.06, peak: 0.24 });
  const os = v.osc('sine', t, 0.36), h2 = v.osc('sine', t, 0.36);
  os.frequency.setValueAtTime(600 * k, t);
  os.frequency.exponentialRampToValueAtTime(980 * k, t + 0.22);
  h2.frequency.setValueAtTime(1200 * k, t);
  h2.frequency.exponentialRampToValueAtTime(1960 * k, t + 0.22);
  const am = v.gn(0.6), l = v.osc('sine', t, 0.36), lg = v.gn(0.4), hg = v.gn(0.22), g = v.gn(0);
  l.frequency.value = 24; // the rolled "r"
  l.connect(lg);
  lg.connect(am.gain);
  env(g.gain, t, 0.03, 0.26, 0.1, 0.16);
  os.connect(am);
  h2.connect(hg);
  hg.connect(am);
  am.connect(g);
  g.connect(v.out);
  return v.end;
}

/** label maker: key click, the printing motor zipping along, a snip of the cutter */
function sfxTag(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.04, 0.05);
  v.noise({ buf: 'white', f: 2600, q: 1.2, bursts: [[0, 0.8, 0.008]] });
  v.tone({ f: 900, f2: 600, gl: 0.02, a: 0.001, rel: 0.03, peak: 0.16 });
  v.tone({ t: 0.05, type: 'square', f: 70, f2: 115, gl: 0.16, a: 0.006, hold: 0.12, rel: 0.05, peak: 0.5, lp: 1500, lp2: 2500, lpt: 0.16, ft: 'bandpass', q: 2.2 });
  v.noise({ t: 0.26, buf: 'white', ft: 'highpass', f: 3500, q: 0.6, bursts: [[0, 0.7, 0.01]] });
  v.tone({ t: 0.26, f: 2800, f2: 2000, gl: 0.012, a: 0.001, rel: 0.02, peak: 0.08 });
  return v.end;
}

/** picking something up: a quick rising whoosh and a tiny snap */
function sfxGrab(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.03, 0.08);
  v.noise({ buf: 'pink', f: 500, f2: 3000, gl: 0.12, q: 1, a: 0.03, hold: 0.01, rel: 0.09, peak: 0.6 });
  v.tone({ t: 0.09, f: 620, f2: 900, gl: 0.03, a: 0.002, rel: 0.05, peak: 0.12 });
  return v.end;
}

/** letting go: a falling whoosh, then a soft landing */
function sfxDrop(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.05, 0.08);
  v.noise({ buf: 'pink', f: 2600, f2: 500, gl: 0.1, q: 1, a: 0.01, rel: 0.08, peak: 0.4 });
  v.tone({ t: 0.1, f: 240, f2: 120, gl: 0.05, a: 0.002, rel: 0.1, peak: 0.36 });
  v.noise({ t: 0.1, buf: 'pink', ft: 'lowpass', f: 900, q: 0.5, a: 0.002, rel: 0.07, peak: 0.9 });
  v.noise({ t: 0.1, buf: 'pink', f: 1500, q: 1, bursts: [[0, 0.3, 0.012]] });
  return v.end;
}

/* ---- transitions & jingles ----------------------------------------------------------------------- */

/** scene whoosh: a big body of air sweeping past */
function sfxWhoosh(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.12, 0.05);
  swish(v, 0, 0.6, 250, 3200, 500, 0.75, 0.9);
  swish(v, 0.05, 0.5, 900, 4200, 1200, 0.25, 1.4, 'white');
  return v.end;
}

/** iris wipe: the circle closes with a falling whistle-swoosh and a soft blip */
function sfxIris(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.1, 0.03);
  swish(v, 0, 0.5, 3600, 1600, 300, 0.6, 1.6);
  v.tone({ f: 1400, f2: 230, gl: 0.5, a: 0.03, hold: 0.25, rel: 0.2, peak: 0.16, vr: 6, vc: 20 });
  v.tone({ t: 0.5, f: 520, f2: 260, gl: 0.06, a: 0.003, rel: 0.1, peak: 0.24 });
  v.noise({ t: 0.5, buf: 'pink', f: 1800, q: 1, bursts: [[0, 0.25, 0.01]] });
  return v.end;
}

/** "dun dun DUUN": two short orchestra hits, then a huge one with timpani and a cymbal */
function sfxCinema(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.35, 0.008);
  const hit = (t, midis, hold, rel, amp, timp) => {
    brassChord(v, t, midis, hold, rel, 0.05 * amp, 3000);
    for (const m of midis) v.tone({ t, type: 'sawtooth', f: mtof(m) * 2, a: 0.03, hold, rel, peak: 0.012 * amp, lp: 1800, det: 4 }); // strings
    timpani(v, t, timp, 0.4 * amp, rel);
  };
  hit(0, [43, 50, 55, 58], 0.12, 0.22, 0.85, 98);
  hit(0.4, [43, 50, 55, 58], 0.12, 0.22, 0.9, 98);
  hit(0.8, [36, 48, 51, 55, 60], 0.5, 0.9, 1.15, 82);
  cymbal(v, 0.8, 0.24, 1.4);
  return v.end;
}

const MUSICBOX = [[1, 1, 1], [4, 0.2, 0.42], [6.3, 0.07, 0.22]];

/** a music-box lullaby winding down */
function sfxSleep(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.55, 0.01);
  [[84, 0], [81, 0.3], [77, 0.6], [79, 0.95], [81, 1.3], [79, 1.7], [77, 2.2]].forEach(([m, t], i) => {
    v.bell({ t, f: mtof(m), parts: MUSICBOX, peak: 0.24 * (1 - i * 0.05), rel: 1.4 });
    v.noise({ t, buf: 'white', f: 6000, q: 1, bursts: [[0, 0.03, 0.004]] }); // the pin plucking the comb
  });
  v.tone({ f: mtof(53), a: 0.8, hold: 1.3, rel: 1.2, peak: 0.03, lp: 600 });
  return v.end;
}

/** warm morning chime: a glow swells up under a climbing string of bells */
function sfxSunrise(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.45, 0.01);
  [60, 64, 67, 72].forEach((m) => {
    v.tone({ f: mtof(m), a: 0.9, hold: 0.9, rel: 1.3, peak: 0.04, lp: 1400 });
    v.tone({ type: 'triangle', f: mtof(m), a: 0.9, hold: 0.9, rel: 1.3, peak: 0.03, lp: 1000 });
  });
  [72, 76, 79, 84, 88].forEach((m, i) => {
    v.bell({ t: 0.25 + i * 0.17, f: mtof(m), parts: SOFT, peak: 0.2, rel: 1.1 });
    v.tone({ t: 0.25 + i * 0.17, type: 'triangle', f: mtof(m), a: 0.004, rel: 0.4, peak: 0.07 });
  });
  [1046.5, 1318.5, 1568, 2093].forEach((f) => v.bell({ t: 1.2, f, parts: GLOCK, peak: 0.09, rel: 1.4 }));
  v.noise({ t: 1.2, buf: 'white', ft: 'highpass', f: 6500, q: 0.5, a: 0.05, rel: 1.0, peak: 0.05 });
  return v.end;
}

/** happy grade: "ba-da-da-DAAA" on a bouncy marimba with a sparkling chord */
function sfxGradeGood(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.25, 0.01);
  const xylo = (t, f, rel, peak) => {
    v.tone({ t, type: 'triangle', f, a: 0.002, rel, peak });
    v.tone({ t, f: f * 4, a: 0.002, rel: rel * 0.3, peak: peak * 0.3 });
    v.noise({ t, buf: 'white', f: 3500, q: 1, bursts: [[0, 0.06, 0.005]] });
  };
  [[392, 0], [523.25, 0.1], [659.25, 0.2], [783.99, 0.3]].forEach(([f, t]) => xylo(t, f, 0.16, 0.2));
  [1046.5, 1318.5, 1568].forEach((f) => {
    xylo(0.44, f, 0.6, 0.16);
    v.bell({ t: 0.44, f: f * 2, parts: GLOCK, peak: 0.07, rel: 0.9 });
  });
  v.tone({ t: 0.44, f: 130.8, f2: 98, gl: 0.3, a: 0.004, rel: 0.5, peak: 0.14 });
  for (let i = 0; i < 6; i++) v.tone({ t: 0.5 + i * 0.07, f: pick([3136, 3520, 4186, 4699]), a: 0.002, rel: 0.2, peak: 0.05 });
  return v.end;
}

/** trombone "wah": a saw+square pair through a low-pass that opens and closes (d = length, f2 = slide target, vib = vibrato) */
function wahNote(v, t, f, d, f2, vib, peak = 0.32) {
  const k = v.k, tt = v.t0 + t;
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
  env(g.gain, tt, 0.035, peak, d * 0.55, d * 0.45);
  const gs = v.gn(0.5);
  os.connect(lp);
  sq.connect(gs);
  gs.connect(lp);
  lp.connect(g);
  g.connect(v.out);
}

/** sad grade: "wah - wah - wah - waaaah" */
function sfxGradeBad(ctx, dest, o) {
  const v = new Voice(ctx, dest, o, 0.14, 0.02);
  wahNote(v, 0, 261.63, 0.24);
  wahNote(v, 0.3, 246.94, 0.24);
  wahNote(v, 0.6, 233.08, 0.24);
  wahNote(v, 0.9, 220, 0.85, 196, true, 0.36);
  return v.end;
}

/*
 * ---- table: name -> { fn, max, gap, g } ------------------------------------------------------------------
 *  fn   builder (ctx, destination, opts) -> absolute end time
 *  max  concurrently sounding voices of this name        gap  minimum seconds between two starts
 *  g    calibrated level trim (applied on top of opts.volume). Calibrated with the default sliders so that at
 *       volume 1 UI ticks peak around 0.1-0.3, everyday sounds around 0.5 and big moments around 0.7; the game's
 *       own volume values scale from there. Re-derive with a level sweep if a builder is changed.
 */

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
  bigsplash: { fn: sfxBigSplash, max: 3, gap: 0.12, g: 1.55 },
  bubble: { fn: sfxBubble, max: 6, gap: 0.02, g: 3.53 },
  chomp: { fn: sfxChomp, max: 4, gap: 0.03, g: 2.2 },
  nibble: { fn: sfxNibble, max: 5, gap: 0.02, g: 5.8 },
  heart: { fn: sfxHeart, max: 4, gap: 0.05, g: 1.2 },
  hatch: { fn: sfxHatch, max: 4, gap: 0.05, g: 2.22 },
  discover: { fn: sfxDiscover, max: 2, gap: 0.3, g: 1.35 },
  research: { fn: sfxResearch, max: 2, gap: 0.2, g: 2.32 },
  levelup: { fn: sfxLevelUp, max: 2, gap: 0.3, g: 1.25 },
  place: { fn: sfxPlace, max: 3, gap: 0.05, g: 2.3 },
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
  roar: { fn: sfxRoar, max: 2, gap: 0.2, g: 0.8 },
  smash: { fn: sfxSmash, max: 3, gap: 0.08, g: 1.83 },
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
  // ---- voices
  fox_talk: { fn: sfxFoxTalk, max: 4, gap: 0.04, g: 4.77 },
  bear_talk: { fn: sfxBearTalk, max: 4, gap: 0.04, g: 3.2 },
  fox_laugh: { fn: sfxFoxLaugh, max: 1, gap: 0.5, g: 3.68 },
  fox_snore: { fn: sfxFoxSnore, max: 1, gap: 0.5, g: 0.68 },
  fox_yawn: { fn: sfxFoxYawn, max: 1, gap: 0.5, g: 2.96 },
  fox_startle: { fn: sfxFoxStartle, max: 2, gap: 0.15, g: 2.65 },
  bear_yum: { fn: sfxBearYum, max: 2, gap: 0.2, g: 1.86 },
  burp: { fn: sfxBurp, max: 2, gap: 0.2, g: 1.39 },
  bear_cheer: { fn: sfxBearCheer, max: 2, gap: 0.3, g: 2.3 },
  // ---- paper & office
  pen: { fn: sfxPen, max: 3, gap: 0.06, g: 2.45 },
  paper: { fn: sfxPaper, max: 2, gap: 0.1, g: 1.4 },
  stamp: { fn: sfxStamp, max: 2, gap: 0.12, g: 2.04 },
  sticker: { fn: sfxSticker, max: 3, gap: 0.08, g: 3.55 },
  page: { fn: sfxPage, max: 2, gap: 0.12, g: 1.3 },
  typing: { fn: sfxTyping, max: 2, gap: 0.1, g: 1.2 },
  beep: { fn: sfxBeep, max: 3, gap: 0.05, g: 1.54 },
  crt_on: { fn: sfxCrtOn, max: 1, gap: 0.5, g: 2 },
  crt_off: { fn: sfxCrtOff, max: 1, gap: 0.5, g: 2.72 },
  // ---- eggs & reveals
  egg_wobble: { fn: sfxEggWobble, max: 2, gap: 0.1, g: 1.43 },
  egg_crack: { fn: sfxEggCrack, max: 3, gap: 0.08, g: 3.86 },
  egg_burst: { fn: sfxEggBurst, max: 2, gap: 0.2, g: 2.62 },
  reveal_common: { fn: sfxRevealCommon, max: 2, gap: 0.3, g: 1.14 },
  reveal_rare: { fn: sfxRevealRare, max: 2, gap: 0.3, g: 0.89 },
  reveal_epic: { fn: sfxRevealEpic, max: 1, gap: 0.5, g: 1.35 },
  reveal_legendary: { fn: sfxRevealLegendary, max: 1, gap: 0.5, g: 1.13 },
  star_pop: { fn: sfxStarPop, max: 4, gap: 0.08, g: 2.17 },
  chip: { fn: sfxChip, max: 4, gap: 0.04, g: 3.06 },
  // ---- the office clock
  tick: { fn: sfxTick, max: 3, gap: 0.05, g: 1.89 },
  tock: { fn: sfxTock, max: 3, gap: 0.05, g: 2.43 },
  heartbeat: { fn: sfxHeartbeat, max: 2, gap: 0.2, g: 0.99 },
  alarm: { fn: sfxAlarm, max: 1, gap: 0.5, g: 1.49 },
  lunch_bell: { fn: sfxLunchBell, max: 1, gap: 0.5, g: 1.77 },
  offwork: { fn: sfxOffwork, max: 1, gap: 1, g: 0.83 },
  // ---- eating
  squelch: { fn: sfxSquelch, max: 4, gap: 0.05, g: 2.47 },
  crunch: { fn: sfxCrunch, max: 4, gap: 0.05, g: 2.68 },
  bone_toss: { fn: sfxBoneToss, max: 3, gap: 0.08, g: 2.46 },
  bone_clatter: { fn: sfxBoneClatter, max: 3, gap: 0.1, g: 2.07 },
  blood_splat: { fn: sfxBloodSplat, max: 4, gap: 0.06, g: 2.46 },
  // ---- building
  build_cloud: { fn: sfxBuildCloud, max: 2, gap: 0.3, g: 1.37 },
  pop_in: { fn: sfxPopIn, max: 4, gap: 0.06, g: 2.03 },
  saw: { fn: sfxSaw, max: 2, gap: 0.2, g: 3.01 },
  nail: { fn: sfxNail, max: 4, gap: 0.04, g: 1.62 },
  // ---- nature & fish
  bird_chirp: { fn: sfxBirdChirp, max: 4, gap: 0.08, g: 1.43 },
  frog_croak: { fn: sfxFrogCroak, max: 3, gap: 0.15, g: 0.85 },
  water_drip: { fn: sfxWaterDrip, max: 4, gap: 0.05, g: 2.21 },
  fish_flop: { fn: sfxFishFlop, max: 3, gap: 0.12, g: 1.62 },
  pet: { fn: sfxPet, max: 3, gap: 0.1, g: 1.58 },
  tag: { fn: sfxTag, max: 3, gap: 0.1, g: 1.23 },
  grab: { fn: sfxGrab, max: 4, gap: 0.05, g: 3.3 },
  drop: { fn: sfxDrop, max: 4, gap: 0.05, g: 1.08 },
  // ---- transitions & jingles
  whoosh: { fn: sfxWhoosh, max: 3, gap: 0.1, g: 2.09 },
  iris: { fn: sfxIris, max: 2, gap: 0.3, g: 1.64 },
  cinema: { fn: sfxCinema, max: 1, gap: 1, g: 1.57 },
  sleep: { fn: sfxSleep, max: 1, gap: 1, g: 1.43 },
  sunrise: { fn: sfxSunrise, max: 1, gap: 1, g: 1.12 },
  grade_good: { fn: sfxGradeGood, max: 1, gap: 0.5, g: 1.11 },
  grade_bad: { fn: sfxGradeBad, max: 1, gap: 0.5, g: 1.01 },
};
const SFX_NAMES = Object.freeze(Object.keys(SFX));

/* ========================================================================== *
 *  MUSIC: theory helpers
 * ========================================================================== */

const SC = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  hminor: [0, 2, 3, 5, 7, 8, 11], // harmonic minor: the raised seventh makes the villain's V chord major
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
/** sorted midi pitches of a scale (semitone offsets from the key's pitch class) between lo and hi */
function scaleRange(keyPc, scale, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (scale.includes((((m - keyPc) % 12) + 12) % 12)) out.push(m);
  return out;
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
// "human" feel: melodic notes land a few ms late and vary in velocity, percussion only varies in velocity
const late = (t) => t + rr(0, 0.014);
const vel = (v) => v * rr(0.85, 1.1);
const vel2 = (v) => v * rr(0.8, 1.15);

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
    const tt = late(t);
    const v = mv(ctx, out, tt, 1, o.wet != null ? o.wet : 0.3, o);
    v.pluck({ midi, dur, peak: vel(vol), lp: o.lp, rel: o.rel });
    return v;
  },

  bass(ctx, out, t, midi, dur, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.04);
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
    const v = mv(ctx, out, t, vel(vol), 0);
    v.tone({ f: 135, f2: 46, gl: 0.11, a: 0.001, rel: 0.28, peak: 1 });
    v.noise({ buf: 'pink', ft: 'lowpass', f: 300, q: 0.5, bursts: [[0, 0.7, 0.02]] });
    return v;
  },

  snare(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.12);
    v.noise({ buf: 'white', f: 1900, q: 0.7, a: 0.001, rel: 0.16, peak: 2.2 });
    v.tone({ type: 'triangle', f: 210, f2: 150, gl: 0.08, a: 0.001, rel: 0.12, peak: 0.5 });
    return v;
  },

  hat(ctx, out, t, vol, open) {
    const v = mv(ctx, out, t, vel2(vol), 0.05);
    v.noise({ buf: 'white', ft: 'highpass', f: 7500, q: 0.5, a: 0.001, rel: open ? 0.22 : 0.05, peak: 0.9 });
    return v;
  },

  shaker(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vel2(vol), 0.05);
    v.noise({ buf: 'white', f: 6500, q: 0.9, a: 0.012, rel: 0.06, peak: 1.6 });
    return v;
  },

  glock(ctx, out, t, midi, vol, o = {}) {
    const v = mv(ctx, out, late(t), vel(vol), o.wet != null ? o.wet : 0.5, o);
    v.bell({ f: mtof(midi), parts: GLOCK, peak: 1, rel: o.rel || 1.1 });
    return v;
  },

  celesta(ctx, out, t, midi, vol, o = {}) {
    const v = mv(ctx, out, late(t), vel(vol), o.wet != null ? o.wet : 0.7, o);
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

  /** FM electric piano: a bright tine that mellows within a fraction of a second */
  epiano(ctx, out, t, midi, dur, vol, o = {}) {
    const v = mv(ctx, out, late(t), vel(vol), o.wet != null ? o.wet : 0.4, o);
    const f = mtof(midi), t0 = v.t0, T = dur + 0.6;
    const car = v.osc('sine', t0, T), mod = v.osc('sine', t0, T), mg = v.gn(0);
    car.frequency.value = f;
    mod.frequency.value = f;
    mg.gain.setValueAtTime(f * 1.5, t0);
    mg.gain.exponentialRampToValueAtTime(f * 0.18, t0 + 0.4);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = v.gn(0);
    env(g.gain, t0, 0.004, 0.5, Math.max(0, dur - 0.05), 0.5);
    car.connect(g);
    g.connect(v.out);
    v.tone({ f: f * 7.01, a: 0.001, rel: 0.09, peak: 0.05 }); // tine ping
    return v;
  },

  /** vibraphone: a soft bell with a slow tremolo */
  vibes(ctx, out, t, midi, vol, o = {}) {
    const rel = o.rel || 1.8, vv = vel(vol);
    const v = mv(ctx, out, late(t), vv, o.wet != null ? o.wet : 0.45, o);
    v.bell({ f: mtof(midi), parts: [[1, 1, 1], [4, 0.14, 0.35], [10, 0.05, 0.18]], peak: 1, rel });
    const l = v.osc('sine', v.t0, rel + 0.3), lg = v.gn(vv * 0.22);
    l.frequency.value = 5;
    l.connect(lg);
    lg.connect(v.out.gain);
    return v;
  },

  /** music-box tine and the tick of the pin that plucks it */
  musicbox(ctx, out, t, midi, vol, o = {}) {
    const v = mv(ctx, out, late(t), vel(vol), o.wet != null ? o.wet : 0.7, o);
    v.bell({ f: mtof(midi), parts: MUSICBOX, peak: 1, rel: o.rel || 1.9 });
    v.noise({ buf: 'white', f: 6500, q: 1, bursts: [[0, 0.05, 0.004]] });
    return v;
  },

  /** synth bass: saw + square with a resonant filter pluck and a sine sub */
  synthbass(ctx, out, t, midi, dur, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.03);
    const f = mtof(midi), hold = Math.max(0, dur - 0.1);
    v.tone({ type: 'sawtooth', f, a: 0.005, hold, rel: 0.12, peak: 0.42, lp: 1500, lp2: 240, lpt: 0.22, q: 5, det: -6 });
    v.tone({ type: 'square', f, a: 0.005, hold, rel: 0.12, peak: 0.22, lp: 900, lp2: 220, lpt: 0.2, q: 3, det: 6 });
    v.tone({ f, a: 0.005, hold, rel: 0.14, peak: 0.42 });
    return v;
  },

  /** staccato pizzicato: the sneaky voice of the lab */
  pizz(ctx, out, t, midi, vol, o = {}) {
    const v = mv(ctx, out, late(t), vel(vol), o.wet != null ? o.wet : 0.25, o);
    const f = mtof(midi);
    v.tone({ type: 'triangle', f, a: 0.002, rel: 0.11, peak: 0.6, lp: 3200, lp2: 800, lpt: 0.09 });
    v.tone({ f: f * 2, a: 0.002, rel: 0.05, peak: 0.12 });
    v.noise({ buf: 'white', f: 3000, q: 1, bursts: [[0, 0.06, 0.006]] });
    return v;
  },

  /** theremin: slow portamento, deep vibrato, ooooOOOoooh */
  theremin(ctx, out, t, midi, dur, vol, o = {}) {
    const v = mv(ctx, out, t, vol, o.wet != null ? o.wet : 0.55, o);
    const f = mtof(midi);
    v.tone({ f: f * 0.93, f2: f, gl: 0.16, a: 0.25, hold: dur * 0.5, rel: dur * 0.45, peak: 0.5, vr: 5.6, vc: 38, vd: 0.35, lp: 1700 });
    v.tone({ f: f * 1.86, f2: f * 2, gl: 0.16, a: 0.3, hold: dur * 0.4, rel: dur * 0.4, peak: 0.06 });
    return v;
  },

  /** a bubbling beaker */
  bloop(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.25, { pan: rr(-0.6, 0.6) });
    const f = rr(380, 720);
    v.tone({ f, f2: f * 2.3, gl: 0.05, a: 0.002, rel: 0.09, peak: 0.6 });
    return v;
  },

  /** dust on the record */
  crackle(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vol * rr(0.4, 1), 0);
    v.noise({ buf: 'white', ft: 'highpass', f: rr(2500, 6000), q: 0.5, bursts: [[0, 1, rr(0.002, 0.006)]] });
    return v;
  },

  /** a soft, dull hand clap */
  clap(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.15);
    v.noise({ buf: 'pink', f: 1300, q: 0.9, bursts: [[0, 0.8, 0.012], [0.011, 0.7, 0.012], [0.024, 0.9, 0.06]] });
    return v;
  },

  /** side-stick "click" of a bossa nova rhythm section */
  rim(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vel2(vol), 0.08);
    v.tone({ f: 1750, f2: 1500, gl: 0.01, a: 0.001, rel: 0.02, peak: 0.5 });
    v.tone({ type: 'triangle', f: 480, f2: 400, gl: 0.02, a: 0.001, rel: 0.03, peak: 0.25 });
    v.noise({ buf: 'white', f: 2800, q: 1.2, bursts: [[0, 0.8, 0.008]] });
    return v;
  },

  /** oompah tuba: short, round and a little bit silly */
  tuba(ctx, out, t, midi, dur, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.05);
    const f = mtof(midi);
    v.tone({ type: 'triangle', f, f2: f * 0.985, gl: dur, a: 0.008, hold: dur * 0.35, rel: dur * 0.5 + 0.03, peak: 0.6, lp: 900 });
    v.tone({ f, a: 0.008, hold: dur * 0.35, rel: dur * 0.5 + 0.03, peak: 0.5 });
    v.noise({ buf: 'pink', f: 500, q: 0.8, bursts: [[0, 0.25, 0.02]] });
    return v;
  },

  /** brass section stab (a chord) */
  brass(ctx, out, t, midis, dur, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.1);
    const s = 1 / Math.sqrt(midis.length);
    for (const m of midis) {
      const f = mtof(m);
      v.tone({ type: 'sawtooth', f, a: 0.012, hold: dur * 0.45, rel: dur * 0.55 + 0.03, peak: 0.5 * s, lp: 550, lp2: 3400, lpt: 0.045, q: 1, det: -7 });
      v.tone({ type: 'sawtooth', f, a: 0.012, hold: dur * 0.45, rel: dur * 0.55 + 0.03, peak: 0.4 * s, lp: 550, lp2: 3000, lpt: 0.05, q: 1, det: 7 });
    }
    return v;
  },

  /** a single brassy melody note (with a little vibrato once it has settled) */
  horn(ctx, out, t, midi, dur, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.12);
    const f = mtof(midi);
    v.tone({ type: 'sawtooth', f, a: 0.02, hold: dur * 0.5, rel: dur * 0.4 + 0.03, peak: 0.5, lp: 700, lp2: 3000, lpt: 0.06, det: -5, vr: 5.5, vc: 14, vd: 0.15 });
    v.tone({ type: 'sawtooth', f, a: 0.02, hold: dur * 0.5, rel: dur * 0.4 + 0.03, peak: 0.35, lp: 700, lp2: 2600, lpt: 0.06, det: 5, vr: 5.5, vc: 14, vd: 0.15 });
    return v;
  },

  crash(ctx, out, t, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.15);
    cymbal(v, 0, 1, 1.5);
    return v;
  },

  timp(ctx, out, t, midi, vol) {
    const v = mv(ctx, out, t, vel(vol), 0.12);
    timpani(v, 0, mtof(midi), 1, 0.55);
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

/* ---- the extra moods ------------------------------------------------------------------------------ */

const RH_MORNING = [[0, 6, 10], [0, 8], [2, 8, 12], [0, 4, 8, 12], [0, 6, 8, 14], [4, 10], [0, 10, 12]];

/** Morning: fingerpicked guitar and a sleepy melody in F major - warm, open and sparse enough for the birds */
function moodMorning(ctx, out) {
  const key = 53, scale = SC.major;
  const sd = 60 / 76 / 4;
  const prog = makeProg(PROG_MAJOR);
  const pent = pentRange(key % 12, 'major', 65, 89);
  const mel = makeMelody(pent, 77);
  const echo = makeEcho(ctx, out, sd * 6, 0.3, 2200, 0.4);
  let chord = null, keys = null, evs = {}, bar = 0, bassRoot = 41, twinkle = -1;
  return {
    stepDur: sd,
    nodes: echo.nodes,
    step(i, t) {
      const s = i & 15;
      if (s === 0) {
        chord = triad(key, scale, prog.next());
        keys = voicing(chord, 57);
        bassRoot = nearOct(chord[0], bassRoot, 40, 52);
        INS.pad(ctx, out, t, chord.map((m) => toRange(m, 50)), sd * 16, 0.5, { att: 1.8, rel: 2.2, lp: 700, wet: 0.6 });
        evs = {};
        if (chance(0.7)) {
          const list = mel.bar(pick(RH_MORNING), chord.map((m) => m % 12), { reuse: 0.5, endPcs: bar % 4 === 3 ? [key % 12, (key + 7) % 12] : null });
          for (const e of list) evs[e.s] = e;
        }
        twinkle = chance(0.25) ? pick([6, 10, 14]) : -1;
        bar++;
      }
      // fingerpicked arpeggio in eighth notes: bass - up - down
      if ((s & 1) === 0) {
        const j = s >> 1, seq = [bassRoot, keys[0], keys[1], keys[2], bassRoot + 7, keys[2], keys[1], keys[0]];
        const bass = j === 0 || j === 4;
        INS.pluck(ctx, out, t, seq[j], bass ? 1.6 : 0.9, bass ? 0.34 : j === 2 || j === 6 ? 0.3 : 0.23, {
          wet: 0.3, lp: bass ? 1400 : 2400, sends: [[echo.in, bass ? 0 : 0.08]], pan: bass ? -0.15 : rr(-0.3, 0.3),
        });
      }
      // a soft brush on the off-beats
      if (s === 4 || s === 12) INS.shaker(ctx, out, t, 0.05);
      else if (s % 4 === 2 && chance(0.5)) INS.shaker(ctx, out, t, 0.025);
      const e = evs[s];
      if (e) INS.pluck(ctx, out, t, e.m, Math.min(e.len * sd, 2.4), 0.6, { wet: 0.42, lp: 3000, sends: [[echo.in, 0.3]], pan: rr(0, 0.3) });
      if (s === twinkle) INS.glock(ctx, out, t, pick(pent.slice(-8)), 0.13, { sends: [[echo.in, 0.3]], pan: rr(-0.5, 0.5) });
    },
  };
}

const PROG_LAB = [[0, 3, 4, 0], [0, 5, 4, 4], [0, 3, 5, 4], [0, 4, 0, 5], [0, 1, 4, 0], [0, 5, 3, 4]];
const RH_LAB = [[0, 3, 6, 8, 11], [0, 2, 6, 8, 10, 14], [3, 6, 10, 12], [0, 6, 8], [2, 3, 6, 10, 14], [0, 3, 8, 11, 14]];
// bass patterns: [step, interval token, length in steps]  (r root, o octave, f fifth, t third, b flat seventh, s fourth)
const LAB_BASS = [
  [[0, 'r', 5], [6, 'r', 2], [8, 'o', 2], [10, 'f', 4], [14, 's', 2]],
  [[0, 'r', 3], [3, 'r', 2], [6, 'f', 2], [8, 'r', 3], [12, 'o', 2], [14, 'b', 2]],
  [[0, 'r', 4], [4, 'f', 2], [7, 'r', 1], [8, 'r', 3], [11, 't', 2], [14, 'f', 2]],
];
const LAB_STEP = { r: 0, o: 12, f: 7, b: 10, s: 5 };

/** Lab: lo-fi evil-genius groove in D harmonic minor - swung drums, minor-major-seventh keys, a sneaky pizzicato, theremin, bubbling beakers */
function moodLab(ctx, out) {
  const key = 50, scale = SC.hminor;
  const sd = 60 / 86 / 4;
  const prog = makeProg(PROG_LAB);
  const pitches = scaleRange(key % 12, scale, 64, 86);
  const mel = makeMelody(pitches, 73);
  const echo = makeEcho(ctx, out, sd * 3, 0.34, 1800, 0.4);
  let chord = null, keys = null, evs = {}, bar = 0, bassRoot = 38, bassPat = LAB_BASS[0], third = 3, creep = false, ooh = false, sparkle = -1;
  return {
    stepDur: sd,
    nodes: echo.nodes,
    step(i, t) {
      const s = i & 15;
      const T = t + (s & 1 ? sd * 0.24 : 0); // lazy lo-fi swing
      if (s === 0) {
        const deg = prog.next();
        chord = triad(key, scale, deg);
        keys = voicing(triad(key, scale, deg, 4), 57);
        bassRoot = nearOct(chord[0], bassRoot, 36, 47);
        third = (((chord[1] - chord[0]) % 12) + 12) % 12;
        bassPat = pick(LAB_BASS);
        creep = bar % 4 === 3 && chance(0.55); // the villain tiptoes up the stairs
        ooh = bar % 4 === 1 && chance(0.6);
        sparkle = chance(0.22) ? pick([3, 6, 10, 13]) : -1;
        evs = {};
        if (chance(0.66)) {
          const list = mel.bar(pick(RH_LAB), chord.map((m) => m % 12), { reuse: 0.5, endPcs: bar % 4 === 3 ? [key % 12, (key + 7) % 12] : null });
          for (const e of list) evs[e.s] = e;
        }
        if (ooh) INS.theremin(ctx, out, t, chord[2] + 12, sd * 11, 0.17, { sends: [[echo.in, 0.3]], pan: 0.2 });
        bar++;
      }
      // dusty drums
      if (s === 0) INS.kick(ctx, out, T, 0.32);
      else if (s === 7 && chance(0.5)) INS.kick(ctx, out, T, 0.19);
      else if (s === 10) INS.kick(ctx, out, T, 0.24);
      if (s === 4 || s === 12) INS.clap(ctx, out, T, 0.15);
      if (s % 2 === 0) INS.hat(ctx, out, T, s % 4 === 2 ? 0.05 : 0.036, false);
      else if (chance(0.25)) INS.hat(ctx, out, T, 0.02, false);
      if (s === 14 && chance(0.3)) INS.hat(ctx, out, T, 0.05, true);
      if (chance(0.3)) INS.crackle(ctx, out, T, 0.03);
      // bass: syncopated, with an occasional chromatic creep
      for (const [st, tok, len] of bassPat) {
        if (st !== s || (creep && s >= 12)) continue;
        INS.synthbass(ctx, out, T, bassRoot + (tok === 't' ? third : LAB_STEP[tok]), sd * len, 0.3);
      }
      if (creep && s >= 12) INS.synthbass(ctx, out, t, bassRoot + (s - 12), sd * 1.6, 0.28);
      // keys: minor-major sevenths on the off-beats
      if (s === 0 || s === 6 || s === 10) keys.forEach((m, j) => INS.epiano(ctx, out, T + j * 0.012, m, sd * (s === 0 ? 5 : 2.4), 0.13, { sends: [[echo.in, 0.2]], pan: -0.2 }));
      // the sneaky lead
      const e = evs[s];
      if (e) INS.pizz(ctx, out, T, e.m, 0.4, { sends: [[echo.in, 0.3]], pan: rr(0, 0.35) });
      if (s === sparkle) INS.glock(ctx, out, T, pick(pitches) + 12, 0.1, { sends: [[echo.in, 0.4]], pan: rr(-0.5, 0.5) });
      if ((s & 1) && chance(0.07)) INS.bloop(ctx, out, T, 0.12);
    },
  };
}

const PROG_FEAST = [[0, 3, 4, 0], [0, 4, 0, 4], [0, 5, 4, 0], [0, 3, 0, 4], [0, 6, 4, 0]];
const RH_FEAST = [[0, 2, 4, 6, 8, 10, 12, 14], [0, 3, 4, 7, 8, 11, 12], [0, 2, 4, 8, 10, 12, 14], [0, 4, 6, 8, 12, 14], [0, 2, 3, 4, 8, 10, 11, 12], [0, 2, 4, 6, 8, 12]];

/** Feast: a comedic, slightly frantic cinematic march - oompah tuba, brass "pah"s, marching snare with rolls, crashing cymbals */
function moodFeast(ctx, out) {
  const key = 50, scale = SC.hminor;
  const sd = 60 / 150 / 4;
  const prog = makeProg(PROG_FEAST);
  const pitches = scaleRange(key % 12, scale, 62, 86);
  const mel = makeMelody(pitches, 74);
  let chord = null, stabs = null, evs = {}, bar = 0, bassRoot = 38, roll = false, run = false;
  return {
    stepDur: sd,
    nodes: [],
    step(i, t) {
      const s = i & 15;
      if (s === 0) {
        chord = triad(key, scale, prog.next());
        stabs = voicing(chord, 57);
        bassRoot = nearOct(chord[0], bassRoot, 38, 49);
        roll = bar % 4 === 3;
        run = roll && chance(0.5);
        evs = {};
        if (chance(0.9)) {
          const list = mel.bar(pick(RH_FEAST), chord.map((m) => m % 12), { reuse: 0.55, endPcs: bar % 4 === 3 ? [key % 12, (key + 7) % 12] : null });
          for (const e of list) evs[e.s] = e;
        }
        if (bar % 4 === 0) {
          INS.crash(ctx, out, t, 0.11);
          INS.timp(ctx, out, t, bassRoot + 12, 0.28);
        }
        bar++;
      }
      // the march: kick on 1 and 3, tuba on the beat, brass "pah" in between
      if (s === 0 || s === 8) INS.kick(ctx, out, t, 0.34);
      if (s === 0) INS.tuba(ctx, out, t, bassRoot, sd * 4, 0.4);
      else if (s === 8) INS.tuba(ctx, out, t, bassRoot + 7, sd * 4, 0.36);
      else if (s === 4 || s === 12) INS.brass(ctx, out, t, stabs, sd * 3, 0.32);
      if (roll && s >= 8) INS.snare(ctx, out, t, 0.12 + (s - 8) * 0.02);
      else if (s === 4 || s === 12) INS.snare(ctx, out, t, 0.28);
      else if ((s === 6 || s === 14 || s === 15) && chance(0.6)) INS.snare(ctx, out, t, 0.1);
      if (s % 2 === 0) INS.hat(ctx, out, t, s % 4 === 2 ? 0.07 : 0.04, false);
      // the melody: staccato brass, with a chromatic scramble at the end of every fourth bar
      const e = evs[s];
      if (e) INS.horn(ctx, out, t, e.m, Math.min(e.len, 3) * sd * 0.8, 0.32);
      if (run && s >= 12) INS.horn(ctx, out, t, 74 + (s - 12), sd * 0.8, 0.26);
    },
  };
}

const PROG_SHEET = [[1, 4, 0, 5], [0, 5, 1, 4], [0, 3, 1, 4], [2, 5, 1, 4], [0, 2, 3, 4], [3, 4, 0, 0]];
const RH_SHEET = [[0, 6, 10], [0, 8], [2, 8, 12], [0, 4, 10], [4, 10, 14], [0, 6, 8, 14]];

/** Sheet: calm office bossa nova - rim-click clave, dotted bass, electric-piano comping, vibes and a hint of strings */
function moodSheet(ctx, out) {
  const key = 53, scale = SC.major;
  const sd = 60 / 104 / 4;
  const prog = makeProg(PROG_SHEET);
  const pent = pentRange(key % 12, 'major', 65, 86);
  const mel = makeMelody(pent, 74);
  const echo = makeEcho(ctx, out, sd * 6, 0.22, 2000, 0.3);
  let chord = null, keys = null, evs = {}, bar = 0, bassRoot = 41;
  return {
    stepDur: sd,
    nodes: echo.nodes,
    step(i, t) {
      const s = i & 15;
      if (s === 0) {
        const deg = prog.next(), ch7 = triad(key, scale, deg, 4);
        chord = triad(key, scale, deg);
        keys = voicing(ch7, 55);
        bassRoot = nearOct(chord[0], bassRoot, 36, 47);
        INS.pad(ctx, out, t, ch7.map((m) => toRange(m, 48)), sd * 16, 0.24, { att: 1.2, rel: 1.8, lp: 650, wet: 0.5 });
        evs = {};
        if (chance(0.65)) {
          const list = mel.bar(pick(RH_SHEET), chord.map((m) => m % 12), { reuse: 0.4, endPcs: bar % 4 === 3 ? [key % 12, (key + 7) % 12] : null });
          for (const e of list) evs[e.s] = e;
        }
        bar++;
      }
      const even = (bar & 1) === 0; // bar was incremented: this is the 2-bar clave cycle
      // bossa bass: dotted quarter + eighth
      if (s === 0) INS.bass(ctx, out, t, bassRoot, sd * 5, 0.26);
      else if (s === 6) INS.bass(ctx, out, t, bassRoot + 7, sd * 2, 0.2);
      else if (s === 8) INS.bass(ctx, out, t, bassRoot, sd * 5, 0.22);
      else if (s === 14) INS.bass(ctx, out, t, bassRoot + 7, sd * 2, 0.19);
      // rim-click clave over two bars, shaker in eighths
      if (even ? s === 0 || s === 6 || s === 12 : s === 4 || s === 10) INS.rim(ctx, out, t, 0.11);
      if (s % 2 === 0) INS.shaker(ctx, out, t, s % 4 === 0 ? 0.045 : 0.03);
      // electric-piano comping on the syncopations
      if (even ? s === 0 || s === 6 || s === 10 : s === 2 || s === 6 || s === 12) {
        keys.forEach((m, j) => INS.epiano(ctx, out, t + j * 0.01, m, sd * 2.5, 0.11, { sends: [[echo.in, 0.15]], pan: -0.15 }));
      }
      const e = evs[s];
      if (e) INS.vibes(ctx, out, t, e.m, 0.3, { sends: [[echo.in, 0.3]], pan: rr(0, 0.3) });
    },
  };
}

// lullaby cells: [step in the 12-step bar, pentatonic steps above the bar's anchor note]
const CELLS_SLEEP = [
  [[0, 0], [4, 1], [8, 0]], // rock
  [[0, 0], [4, 1], [8, 2]], // climb
  [[0, 2], [4, 1], [8, 0]], // fall
  [[0, 0], [4, 2], [8, 1]], // arch
  [[0, 0], [8, 1]], // long - short
  [[0, 1], [6, 0], [8, -1]], // sigh
  [[0, 0], [4, 0], [6, 1], [8, 2]], // gathering
];
const CADENCE_SLEEP = [[[0, 2], [4, 1], [8, 0]], [[0, 1], [4, 1], [8, 0]], [[0, 2], [6, 1], [8, 0]]]; // ends of phrases: settle down onto the tonic

/** Sleep: a very soft music-box lullaby in waltz time (12 sixteenth steps per bar) over a warm hum */
function moodSleep(ctx, out) {
  const key = 53, scale = SC.major;
  const sd = 60 / 62 / 4;
  const prog = makeProg(PROG_MAJOR);
  const pent = pentRange(key % 12, 'major', 72, 96);
  const mid = pent.findIndex((m) => m >= 81);
  const echo = makeEcho(ctx, out, sd * 4, 0.42, 2400, 0.5);
  let chord = null, cell = CELLS_SLEEP[0], evs = {}, bar = 0, idx = mid, rested = false;
  return {
    stepDur: sd,
    bar: 12,
    nodes: echo.nodes,
    step(i, t) {
      const s = i % 12;
      if (s === 0) {
        chord = triad(key, scale, prog.next());
        INS.pad(ctx, out, t, [toRange(chord[0], 41), toRange(chord[2], 48)], sd * 12, 0.26, { att: 1.6, rel: 2, lp: 380, wet: 0.5 });
        evs = {};
        if (rested || !chance(0.1)) {
          rested = false;
          // anchor: the chord tone closest to where the tune is now, pulled back towards the middle of the box
          const pcs = chord.map((m) => m % 12), home = clamp(idx + (idx > mid ? -1 : idx < mid ? 1 : 0), mid - 3, mid + 2);
          let anchor = idx;
          for (let d = 0; d < 4; d++) {
            const c = [home + d, home - d].find((j) => j >= 0 && j < pent.length && pcs.includes(pent[j] % 12));
            if (c != null) {
              anchor = c;
              break;
            }
          }
          const cadence = bar % 4 === 3;
          if (cadence) cell = pick(CADENCE_SLEEP);
          else if (!chance(0.4)) cell = pick(CELLS_SLEEP);
          if (cadence) anchor = pent.findIndex((m) => m % 12 === key % 12 && Math.abs(m - 81) <= 6);
          anchor = clamp(anchor, mid - 3, mid + 2);
          for (const [st, up] of cell) {
            idx = clamp(anchor + up, mid - 4, mid + 4);
            evs[st] = pent[idx];
          }
        } else rested = true; // a bar of just the rocking left hand, never two in a row
        bar++;
      }
      // a rocking left hand: root - fifth - third, very soft
      if (s === 0 || s === 4 || s === 8) INS.musicbox(ctx, out, t, toRange(chord[s === 0 ? 0 : s === 4 ? 2 : 1], 60), 0.09, { sends: [[echo.in, 0.3]], pan: -0.2 });
      if (evs[s]) INS.musicbox(ctx, out, t, evs[s], 0.22, { sends: [[echo.in, 0.5]], pan: rr(0, 0.3) });
    },
  };
}

const MOODS = { title: moodTitle, day: moodDay, rush: moodRush, night: moodNight, morning: moodMorning, lab: moodLab, feast: moodFeast, sheet: moodSheet, sleep: moodSleep };
const MOOD_NAMES = Object.freeze(Object.keys(MOODS));

/** instantiate a mood on a music bus: gains start at 0 (see fadeMood) */
// per-mood loudness trim so every mood sits at a similar perceived level
const MOOD_LEVEL = { title: 1.6, day: 0.85, rush: 1.0, night: 1.5, morning: 1.9, lab: 0.95, feast: 1.3, sheet: 0.85, sleep: 1.3 };

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
  let connected = true;
  return {
    out,
    nodes,
    /** disconnect from the graph while the ambience volume is zero: nothing gets processed then */
    setEnabled(on) {
      if (on === connected) return;
      connected = on;
      try {
        if (on) rumble.connect(bus.dry);
        else rumble.disconnect();
      } catch (e) {
        /* ignore */
      }
    },
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
  return sfxBubble(ctx, bus.dry, { when: t, volume: rr(0.3, 0.6) * SFX.bubble.g, pitch: rr(0.8, 1.2), pan: rr(-0.8, 0.8), rev: bus.wet });
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
  babbles: [], // talking characters: { name, plan, i, t0, pitch, volume, voices }
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
const AUDIBLE = 0.001; // slider positions below this count as "off": skip the synthesis work entirely
const sfxOn = () => S.vols.master > AUDIBLE && S.vols.sfx > AUDIBLE;
const musicOn = () => S.vols.master > AUDIBLE && S.vols.music > AUDIBLE;
const ambienceOn = () => S.vols.master > AUDIBLE && S.vols.ambience > AUDIBLE;

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
  try {
    // the system may suspend/interrupt us (autoplay policy, iOS calls...): try to come back on our own
    ctx.onstatechange = () => {
      if (wantRunning() && !S.suspending && ctx.state !== 'running' && ctx.state !== 'closed') safeResume();
    };
  } catch (e) {
    /* ignore */
  }
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
        if (S.ctx === ctx && !S.beds) {
          S.beds = createBeds(ctx, S.rig.buses.amb);
          S.beds.setEnabled(ambienceOn());
        }
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
      S.babbles.length = 0; // a line of dialogue must not resume mid-sentence after a mute / tab switch
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
    pumpBabbles(ctx, now);
    const m = S.cur;
    if (m && !musicOn()) {
      m.nextTime = now + 0.05; // music slider at zero: no notes, no CPU; picks up again when raised
    } else if (m) {
      if (m.nextTime < now - 0.35) m.nextTime = now + 0.05; // main thread stalled: resync instead of a note burst
      const horizon = now + LOOKAHEAD;
      let guard = 0;
      while (m.nextTime < horizon && guard++ < 40) {
        // A step that is already clearly late (main thread stalled) is skipped instead of being played in a
        // flam-like burst; bar starts always run so chords/motifs stay in sync with the bar grid.
        if (m.nextTime > now - 0.06 || m.i % (m.gen.bar || 16) === 0) m.gen.step(m.i, Math.max(m.nextTime, now + 0.01));
        m.i++;
        m.nextTime += m.gen.stepDur;
      }
    }
    if (S.beds) {
      S.beds.update(now);
      if (ambienceOn()) {
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
    if (!ctx || !S.unlocked || S.muted || S.hidden || !sfxOn()) return;
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
      drop(name);
      return;
    }
    const last = S.lastStart[name];
    if (last != null && Math.abs(when - last) < def.gap) {
      drop(name);
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

/* ---- babble: talking characters --------------------------------------------------------------------- */

/** schedules the syllables of every talking character that fall inside the lookahead window */
function pumpBabbles(ctx, now) {
  const B = S.babbles;
  if (!B.length) return;
  const bus = S.rig.buses.sfx, horizon = now + LOOKAHEAD;
  for (let j = B.length - 1; j >= 0; j--) {
    const b = B[j], evs = b.plan.evs;
    let guard = 0;
    while (b.i < evs.length && b.t0 + evs[b.i].t < horizon && guard++ < 24) {
      const ev = evs[b.i++], at = b.t0 + ev.t;
      if (at < now - 0.04) continue; // already in the past (stalled main thread): skip it, stay in sync with the text
      b.voices.push(babbleSyllable(ctx, bus.dry, Math.max(at, now + 0.004), ev, b.name, b.pitch, b.volume, bus.wet));
    }
    if (b.voices.length > 12) b.voices = b.voices.filter((v) => v.end > now);
    if (b.i >= evs.length && now > b.t0 + b.plan.total + 0.1) B.splice(j, 1);
  }
}

/** quick fade-out of everything a talking character has scheduled */
function hushBabble(b, now) {
  for (const v of b.voices) {
    try {
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(0, now, 0.008);
    } catch (e) {
      /* voice already gone */
    }
  }
}

/**
 * Animal-Crossing style gibberish for a line of dialogue: one syllable per letter, longer pauses at . , ! ?
 * A new line of the same voice replaces its previous one, up to three characters talk at once.
 * Returns how many seconds the line takes (also while muted or locked, so callers can time their text boxes).
 */
function babble(voice, text, opts) {
  try {
    const o = opts && typeof opts === 'object' ? opts : {};
    const name = typeof voice === 'string' ? voice : '';
    const plan = planBabble(name, text, num(o.cps, 16));
    if (!plan) return 0;
    const ctx = S.ctx;
    const volume = clamp(num(o.volume, 1), 0, 2), pitch = clamp(num(o.pitch, 1), 0.25, 4);
    if (!plan.evs.length || !ctx || !S.unlocked || S.muted || S.hidden || !sfxOn() || volume < 0.0005) return plan.total;
    if (ctx.state !== 'running' && nowMs() > S.resumeUntil) return plan.total;
    const now = ctx.currentTime;
    for (let j = S.babbles.length - 1; j >= 0; j--) {
      if (S.babbles[j].name === name) {
        hushBabble(S.babbles[j], now);
        S.babbles.splice(j, 1);
      }
    }
    while (S.babbles.length >= 3) hushBabble(S.babbles.shift(), now);
    S.babbles.push({ name, plan, i: 0, t0: now + 0.02, pitch, volume, voices: [] });
    pumpBabbles(ctx, now);
    return plan.total;
  } catch (e) {
    return 0; /* never throw */
  }
}

/** shut everybody up (scene change, skipped dialogue) */
function stopBabble() {
  try {
    const now = S.ctx ? S.ctx.currentTime : 0;
    for (const b of S.babbles) hushBabble(b, now);
    S.babbles.length = 0;
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
    if (S.beds) S.beds.setEnabled(ambienceOn());
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
  try {
    const ctx = new OAC(2, Math.ceil(clamp(num(seconds, 4), 0.05, 120) * OFFLINE_SR), OFFLINE_SR);
    // by default the safety limiter is bypassed so headroom problems of the sounds themselves stay visible
    const rig = createRig(ctx, { safety: !!safety });
    applyRigVolumes(rig, DEFAULT_VOLUMES, 0, false);
    build(ctx, rig);
    return ctx.startRendering();
  } catch (e) {
    return Promise.reject(e);
  }
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

/** render a line of babble through the full master chain (o = { cps, pitch, volume, seconds, raw }) */
function _debugRenderBabble(voice, text, o = {}) {
  const plan = planBabble(String(voice), text, num(o.cps, 16));
  if (!plan) return Promise.reject(new Error('unknown voice ' + voice));
  const pitch = clamp(num(o.pitch, 1), 0.25, 4), volume = clamp(num(o.volume, 1), 0, 2);
  return renderOffline(num(o.seconds, plan.total + 0.6), (ctx, rig) => {
    const bus = rig.buses.sfx;
    for (const ev of plan.evs) babbleSyllable(ctx, bus.dry, 0.04 + ev.t, ev, voice, pitch, volume, bus.wet);
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
    babbling: S.babbles.length,
    amb: { hour: S.amb.hour, night: S.amb.night, crickets: S.amb.crickets.map((k) => +k.next.toFixed(2)) },
    timer: !!S.timer,
    stats: { ...stats, droppedBy: { ...stats.droppedBy } },
    volumes: getVolumes(),
  };
}

/** current output level (RMS/peak of the last analyser window, compressor gain reduction in dB) - for live tests */
function _debugLevel() {
  const c = S.ctx;
  if (!c || !S.rig) return { rms: 0, peak: 0, reduction: 0 };
  if (!S.analyser) {
    S.analyser = c.createAnalyser();
    S.analyser.fftSize = 2048;
    S.rig.last.connect(S.analyser); // what actually reaches the speakers
    return { rms: 0, peak: 0, reduction: 0 };
  }
  const d = new Float32Array(S.analyser.fftSize);
  S.analyser.getFloatTimeDomainData(d);
  let s = 0, p = 0;
  for (let i = 0; i < d.length; i++) {
    s += d[i] * d[i];
    const a = Math.abs(d[i]);
    if (a > p) p = a;
  }
  return { rms: Math.sqrt(s / d.length), peak: p, reduction: S.rig.comp.reduction }; // reduction: compressor gain change in dB
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
  babble,
  stopBabble,
  isUnlocked: () => S.unlocked,
  getMusic: () => S.want,
  sfxNames: SFX_NAMES,
  moods: MOOD_NAMES,
  voices: BABBLE_VOICES,
  _debugRenderSfx,
  _debugRenderMix,
  _debugRenderMusic,
  _debugRenderAmbience,
  _debugRenderBabble,
  _debugState,
  _debugLevel,
};

export { SFX_NAMES, MOOD_NAMES };
export default audio;
