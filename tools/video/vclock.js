// Virtual clock for deterministic video capture (injected with page.addInitScript
// by tools/video/render.mjs, before any page script runs).
//
// Until __vclock.start() everything runs on real time (so the game boots
// normally). After start():
//   - performance.now(), Date.now(), requestAnimationFrame timestamps, setTimeout,
//     setInterval all run on a virtual clock that only moves in __vclock.tick(ms)
//   - CSS animations / transitions (Web Animations) are paused and their
//     currentTime is set from the virtual clock after every tick, so bubble
//     pop-ins, letter hops etc. play at the right speed however slow the
//     (SwiftShader) frame actually is.
//   - Math.random is a seeded PRNG from the very start (reproducible renders).
(() => {
  const W = window;
  if (W.__vclock) return;
  const realRAF = W.requestAnimationFrame.bind(W), realCAF = W.cancelAnimationFrame.bind(W);
  const realST = W.setTimeout.bind(W), realCT = W.clearTimeout.bind(W);
  const realSI = W.setInterval.bind(W), realCI = W.clearInterval.bind(W);
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now;

  // seeded Math.random (mulberry32)
  let seed = 0x5eed1234;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rand;

  const V = (W.__vclock = { on: false, t: 0, dateBase: 0, raf: new Map(), timers: new Map(), id: 1e7, frames: 0, errors: [] });
  V.reseed = (s) => { seed = s >>> 0; };

  performance.now = () => (V.on ? V.t : realNow());
  Date.now = () => (V.on ? Math.floor(V.dateBase + V.t) : realDateNow());

  W.requestAnimationFrame = (cb) => {
    if (!V.on) return realRAF(cb);
    const id = ++V.id;
    V.raf.set(id, cb);
    return id;
  };
  W.cancelAnimationFrame = (id) => { if (!V.raf.delete(id)) realCAF(id); };
  W.setTimeout = (fn, ms, ...args) => {
    if (!V.on) return realST(fn, ms, ...args);
    const id = ++V.id;
    V.timers.set(id, { at: V.t + Math.max(0, +ms || 0), fn, args, iv: 0 });
    return id;
  };
  W.setInterval = (fn, ms, ...args) => {
    if (!V.on) return realSI(fn, ms, ...args);
    const id = ++V.id;
    const iv = Math.max(4, +ms || 0);
    V.timers.set(id, { at: V.t + iv, fn, args, iv });
    return id;
  };
  W.clearTimeout = (id) => { if (!V.timers.delete(id)) realCT(id); };
  W.clearInterval = (id) => { if (!V.timers.delete(id)) realCI(id); };

  // a real macrotask yield (lets promise chains / awaits settle between timers)
  const mc = new MessageChannel();
  const q = [];
  mc.port1.onmessage = () => { const r = q.shift(); r && r(); };
  const yieldTask = () => new Promise((r) => { q.push(r); mc.port2.postMessage(0); });

  const seen = new WeakMap();
  function syncAnimations() {
    let list;
    try { list = document.getAnimations(); } catch { return; }
    for (const a of list) {
      let s = seen.get(a);
      if (!s) {
        s = { t0: V.t };
        seen.set(a, s);
        try { a.pause(); } catch { /* ignore */ }
      }
      if (s.done) continue;
      const ct = V.t - s.t0;
      let end = Infinity;
      try { end = a.effect.getComputedTiming().endTime; } catch { /* ignore */ }
      try {
        if (Number.isFinite(end) && ct >= end) { s.done = true; a.finish(); }
        else a.currentTime = ct;
      } catch { /* ignore */ }
    }
  }
  V.syncAnimations = syncAnimations;

  V.start = () => {
    if (V.on) return V.t;
    V.t = realNow();
    V.dateBase = realDateNow() - V.t;
    V.on = true;
    syncAnimations();
    return V.t;
  };

  // advance the clock by `ms`: due timers in order (with a task yield after each), then
  // one round of rAF callbacks at the new time, then CSS animations
  V.tick = async (ms) => {
    const end = V.t + ms;
    for (let guard = 0; guard < 5000; guard++) {
      let bid = 0, bt = null;
      for (const [id, tm] of V.timers) if (tm.at <= end && (!bt || tm.at < bt.at || (tm.at === bt.at && id < bid))) { bid = id; bt = tm; }
      if (!bt) break;
      V.t = Math.max(V.t, bt.at);
      if (bt.iv) bt.at += bt.iv; else V.timers.delete(bid);
      try { if (typeof bt.fn === 'function') bt.fn(...bt.args); } catch (e) { V.errors.push(String(e && e.stack || e)); }
      await yieldTask();
    }
    V.t = end;
    const cbs = [...V.raf.values()];
    V.raf.clear();
    for (const cb of cbs) {
      try { cb(V.t); } catch (e) { V.errors.push(String(e && e.stack || e)); }
    }
    await yieldTask();
    syncAnimations();
    V.frames++;
    return V.t;
  };
  V.yieldTask = yieldTask;
})();
