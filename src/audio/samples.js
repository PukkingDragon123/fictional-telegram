// [v33 sfx] Recorded sound effects: loads the clips in ./samples/*.mp3 and builds SFX players from SAMPLE_MAP.
// Vite turns every clip into a URL (a hashed file in dist/, a data: URI in the single-file build); the clips are
// fetched and decoded once, in the background right after the audio unlock, most-used names first. A name whose
// clip is still decoding when it is played starts as soon as it is ready (or is skipped if that takes too long).

const URLS = import.meta.glob('./samples/*.mp3', { eager: true, query: '?url', import: 'default' });
const URL_BY_ID = {};
for (const [p, u] of Object.entries(URLS)) URL_BY_ID[p.slice(p.lastIndexOf('/') + 1, -4)] = u;

const buffers = Object.create(null); // id -> AudioBuffer
const loading = Object.create(null); // id -> Promise<AudioBuffer|null>
const failed = Object.create(null);
let decoder = null;

const MAX_LATE = 0.25; // seconds a play may start late while its clip is still decoding

function decodeWith(ctx, ab) {
  return new Promise((res, rej) => {
    try {
      const p = ctx.decodeAudioData(ab, res, rej); // callback form: old Safari has no promise version
      if (p && p.then) p.then(res, rej);
    } catch (e) {
      rej(e);
    }
  });
}

/** fetch + decode one clip (memoised); resolves to the AudioBuffer or null */
export function loadSample(id, ctx) {
  if (buffers[id]) return Promise.resolve(buffers[id]);
  if (loading[id]) return loading[id];
  const url = URL_BY_ID[id];
  if (!url) return Promise.resolve(null);
  const dc = ctx || decoder;
  if (!dc) return Promise.resolve(null);
  loading[id] = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    })
    .then((ab) => decodeWith(dc, ab))
    .then((b) => {
      buffers[id] = b;
      return b;
    })
    .catch((e) => {
      failed[id] = String((e && e.message) || e);
      loading[id] = null;
      return null;
    });
  return loading[id];
}

/** start decoding every clip (a few at a time, `first` ids before the rest); resolves when all are done */
export function loadAllSamples(ctx, first = []) {
  if (ctx) decoder = decoder || ctx;
  const seen = new Set();
  const order = [...first, ...Object.keys(URL_BY_ID)].filter((id) => URL_BY_ID[id] && !seen.has(id) && seen.add(id));
  let i = 0;
  const worker = () => (i < order.length ? loadSample(order[i++], ctx).then(worker) : Promise.resolve());
  return Promise.all([worker(), worker(), worker(), worker()]).then(() => ({
    loaded: Object.keys(buffers).length,
    total: order.length,
    failed: { ...failed },
  }));
}

export const sampleIds = () => Object.keys(URL_BY_ID);
export const sampleBuffer = (id) => buffers[id] || null;
export const sampleFailures = () => ({ ...failed });

const split = (s) => (Array.isArray(s) ? s : String(s || '').split(/\s+/).filter(Boolean));

/** every clip id a map entry uses */
export function specIds(spec) {
  const out = [];
  for (const l of spec.L || [spec]) out.push(...split(l.s));
  return out;
}

/**
 * Build an SFX builder (ctx, dest, o) -> end time that plays the recorded sample(s) of one map entry, with the
 * same contract as the synth builders in audio.js: o = { when, volume, pitch, pan, rev }.
 */
export function makeSampleSfx(spec, kit) {
  const layers = (spec.L || [spec]).map((l) => ({ ...l, ids: split(l.s) })).filter((l) => l.ids.length);
  const wet = spec.rev != null ? spec.rev : 0.06;
  const last = layers.map(() => -1);
  const pickIdx = (li) => {
    const n = layers[li].ids.length;
    if (n === 1) return 0;
    let k = (Math.random() * n) | 0;
    if (k === last[li]) k = (k + 1 + ((Math.random() * (n - 1)) | 0)) % n;
    last[li] = k;
    return k;
  };
  const jit = spec.j || 0;
  const layered = !!spec.L;

  function build(ctx, dest, o, picks) {
    const v = new kit.Voice(ctx, dest, o, wet, 0);
    const rnd = jit ? 1 + (Math.random() * 2 - 1) * jit : 1;
    const base = (o.pitch > 0 ? o.pitch : 1) * (spec.p || 1) * rnd;
    for (let li = 0; li < layers.length; li++) {
      const l = layers[li];
      const buf = buffers[l.ids[picks[li]]];
      if (!buf) continue;
      const rate = Math.max(0.1, base * (layered ? l.p || 1 : 1));
      const off = Math.min(l.o || 0, buf.duration - 0.01);
      const len = Math.min(buf.duration - off, l.d || Infinity);
      const dur = len / rate;
      const t = v.t0 + (l.t || 0) / (o.pitch > 0 ? o.pitch : 1);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = v.gn(l.v != null ? l.v : 1);
      if (l.d && l.d < buf.duration - off) {
        const f = Math.min(0.05, dur * 0.4);
        g.gain.setValueAtTime(g.gain.value, t + dur - f);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
      }
      src.connect(g);
      g.connect(v.out);
      v.begin(src, t, t + dur + 0.01, off);
    }
    if (v.live === 0) v.dispose();
    return v.end;
  }

  return function sampleSfx(ctx, dest, o) {
    const picks = layers.map((_, li) => pickIdx(li));
    const need = layers.map((l, li) => l.ids[picks[li]]).filter((id) => !buffers[id]);
    if (!need.length) return build(ctx, dest, o, picks);
    // still decoding: start it the moment the clip arrives, unless that is too late to still make sense
    const when = o.when != null ? o.when : ctx.currentTime;
    Promise.all(need.map((id) => loadSample(id, ctx))).then(() => {
      try {
        const late = ctx.currentTime - when;
        if (late > MAX_LATE || ctx.state === 'closed') return;
        build(ctx, dest, { ...o, when: Math.max(when, ctx.currentTime + 0.005) }, picks);
      } catch (e) {
        /* never throw from a late start */
      }
    });
    return when + 0.6;
  };
}
