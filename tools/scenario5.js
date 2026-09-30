window.__scenario5 = () => {
  const g = __game, st = g.state;
  st.coins = 99999;
  for (const r of __data.RESEARCH) if (!st.research.includes(r.id)) st.research.push(r.id);
  g.mods = __data.computeMods(st.research, 0);
  for (let i = 0; i < 60; i++) { const p = g.fish.randomWaterPoint(); if (p) g.fish.spawn(['bluegill','bass','sockeye','pike'][i % 4], p.x, p.z, { adult: true }); }
  st.day = 40;
  g.wave = g.bears.planWave(40);
  st.hour = 16.99;
  const times = [];
  const spikes = [];
  let worst = 0, total = 0, n = 0, fields = 0;
  const orig = g.grid.bearField.bind(g.grid);
  g.grid.bearField = (a, b) => { fields++; return orig(a, b); };
  for (let t = 0; t < 120 && st.phase === 'rush' || t < 1; t += 0.05) {
    const t0 = performance.now();
    g.update(0.05);
    const dt = performance.now() - t0;
    worst = Math.max(worst, dt); total += dt; n++;
    if (dt > 30) spikes.push(t.toFixed(2) + ':' + dt.toFixed(0) + ':' + g.bears.list.filter(b=>b.visible).length);
  }
  return { bears: g.wave.bears.length, avgMs: (total / n).toFixed(2), worstMs: worst.toFixed(1), fieldsPerSec: (fields / (n * 0.05)).toFixed(1), served: g.day.served, ramp: g.day.rampages, spikes: spikes.slice(0, 20) };
};
window.__profile = () => {
  const g = __game;
  const sys = { structures: g.structures, food: g.food, fish: g.fish, bears: g.bears, beavers: g.beavers, particles: g.particles, fox: g.fox, ambient: g.ambient };
  const acc = {}, worst = {};
  for (const [k, o] of Object.entries(sys)) {
    const f = o.update.bind(o);
    acc[k] = 0; worst[k] = 0;
    o.update = (...a) => { const t0 = performance.now(); const r = f(...a); const d = performance.now() - t0; acc[k] += d; worst[k] = Math.max(worst[k], d); return r; };
  }
  const topo = g.onTopologyChanged.bind(g);
  let topoN = 0, topoMs = 0;
  g.onTopologyChanged = () => { const t0 = performance.now(); topo(); topoMs += performance.now() - t0; topoN++; };
  const bm = g.structures.buildMesh.bind(g.structures);
  let bmN = 0, bmMs = 0, bmWorst = 0;
  g.structures.buildMesh = (s) => { const t0 = performance.now(); bm(s); const d = performance.now() - t0; bmMs += d; bmN++; bmWorst = Math.max(bmWorst, d); };
  const r = __scenario5();
  return { r, acc, worst, topoN, topoMs: topoMs.toFixed(1), bmN, bmMs: bmMs.toFixed(1), bmWorst: bmWorst.toFixed(1) };
};
window.__profile2 = () => {
  const g = __game;
  const bs = g.bears;
  const orig = bs.step.bind(bs);
  const slow = [];
  bs.step = (b, dt) => { const s0 = b.state; const t0 = performance.now(); orig(b, dt); const d = performance.now() - t0; if (d > 15) slow.push(`${d.toFixed(0)}ms ${s0}->${b.state} goal=${b.goal?.kind} angry=${b.angry} ramp=${b.rampLeft}`); };
  const fns = ['decide', 'decideSmash', 'beginLeave', 'beginPay', 'finishReview', 'startRampage', 'catchFish', 'show', 'hide'];
  const tm = {};
  for (const fn of fns) { const f = bs[fn].bind(bs); tm[fn] = [0, 0]; bs[fn] = (...a) => { const t0 = performance.now(); const r = f(...a); const d = performance.now() - t0; tm[fn][0]++; tm[fn][1] = Math.max(tm[fn][1], +d.toFixed(1)); return r; }; }
  const e = g.earn.bind(g); let ew = 0; g.earn = (...a) => { const t0 = performance.now(); e(...a); ew = Math.max(ew, performance.now() - t0); };
  const ar = g.addReview.bind(g); let aw = 0; g.addReview = (...a) => { const t0 = performance.now(); ar(...a); aw = Math.max(aw, performance.now() - t0); };
  const r = __scenario5();
  return { spikes: r.spikes, slow: slow.slice(0, 10), tm, earnWorst: ew.toFixed(1), reviewWorst: aw.toFixed(1) };
};
