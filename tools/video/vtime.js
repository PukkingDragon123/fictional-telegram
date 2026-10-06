// Virtual time for frame-by-frame recording. Injected before any page script
// (Playwright addInitScript). Replaces requestAnimationFrame, performance.now,
// Date.now, setTimeout/setInterval with a clock that only moves when the recorder
// calls window.__vt.step(ms). CSS animations/transitions are paused and seeked to
// the same clock, so DOM effects line up with the WebGL frames.
(() => {
  if (window.__vt) return;
  const V = (window.__vt = { t: 0, raf: [], timers: new Map(), id: 1, anims: new WeakMap(), errors: [] });
  const dateBase = 1760000000000; // fixed wall clock so runs are repeatable
  const RealDate = Date;
  performance.now = () => V.t;
  function VDate(...a) { if (!(this instanceof VDate)) return new RealDate(dateBase + V.t).toString(); return a.length ? new RealDate(...a) : new RealDate(dateBase + V.t); }
  VDate.prototype = RealDate.prototype;
  VDate.now = () => dateBase + V.t;
  VDate.parse = RealDate.parse; VDate.UTC = RealDate.UTC;
  window.Date = VDate;
  window.requestAnimationFrame = (cb) => { const id = V.id++; V.raf.push([id, cb]); return id; };
  window.cancelAnimationFrame = (id) => { V.raf = V.raf.filter((r) => r[0] !== id); };
  const addTimer = (cb, ms, args, every) => { const id = V.id++; V.timers.set(id, { at: V.t + Math.max(0, +ms || 0), cb, args, every }); return id; };
  window.setTimeout = (cb, ms, ...args) => addTimer(cb, ms, args, 0);
  window.setInterval = (cb, ms, ...args) => addTimer(cb, ms, args, Math.max(1, +ms || 1));
  window.clearTimeout = window.clearInterval = (id) => { V.timers.delete(id); };
  const run = (fn, args) => { try { typeof fn === 'function' ? fn(...(args || [])) : (0, eval)(fn); } catch (e) { V.errors.push(String(e && e.stack || e)); console.error(e); } };
  // advance the clock by ms: fire due timers in order, then one animation frame
  V.step = (ms = 1000 / 30, frame = true) => {
    const end = V.t + ms;
    for (let guard = 0; guard < 10000; guard++) {
      let best = null, bid = 0;
      for (const [id, tm] of V.timers) if (tm.at <= end && (!best || tm.at < best.at)) { best = tm; bid = id; }
      if (!best) break;
      V.t = Math.max(V.t, best.at);
      if (best.every) best.at += best.every; else V.timers.delete(bid);
      run(best.cb, best.args);
    }
    V.t = end;
    V.syncAnims();
    if (frame) { const list = V.raf; V.raf = []; for (const [, cb] of list) run(cb, [V.t]); }
    V.syncAnims();
    return V.t;
  };
  // CSS animations / transitions / WAAPI: pause and seek to virtual time since first seen
  V.syncAnims = () => {
    if (!document.getAnimations) return;
    for (const a of document.getAnimations()) {
      let s = V.anims.get(a);
      if (s == null) { s = V.t - (a.currentTime || 0); V.anims.set(a, s); try { a.pause(); } catch {} }
      try { a.currentTime = V.t - s; } catch {}
    }
  };
})();
