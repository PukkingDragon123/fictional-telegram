// In-page scenario: late game with every research, structures of each type, big wave.
window.__scenario = () => {
  const g = __game, st = g.state, log = [];
  st.coins = 99999;
  for (const r of __data.RESEARCH) { if (!st.research.includes(r.id)) { st.research.push(r.id); } }
  g.mods = __data.computeMods(st.research, 0);
  const place = (t, x, z) => { const ok = g.placeStructure(t, x, z); log.push(`${t}@${x},${z}:${ok ? 'ok' : g.structures.canPlace(t, x, z).reason}`); return ok; };
  // lodge + beavers first
  for (let z = 28; z < 40; z++) for (let x = 18; x < 26; x++) if (!g.structures.list.some(s=>s.type==='lodge') && g.structures.canPlace('lodge', x, z).ok) place('lodge', x, z);
  // food structures on the east meadow
  place('willow', 40, 28); place('beehive', 41, 28); place('beehive', 40, 29); place('flowers', 42, 29);
  place('maple', 44, 32); place('berries', 42, 33); place('berries', 43, 34); place('bughotel', 38, 29);
  for (let i = 0; i < 6; i++) { const p = g.fish.randomWaterPoint(); if (p) place(i % 2 ? 'lilypad' : 'seaweed', Math.floor(p.x), Math.floor(p.z)); }
  // fill the pond with a mix of species
  const sp = ['bluegill', 'perch', 'bass', 'brook', 'rainbow', 'sockeye', 'pike', 'walleye', 'char', 'sturgeon'];
  for (let i = 0; i < 50; i++) { const p = g.fish.randomWaterPoint(); if (p) g.fish.spawn(sp[i % sp.length], p.x, p.z, { adult: true, hunger: 0.2 }); }
  // let beavers build for a while
  for (let i = 0; i < 400; i++) { g.update(0.05); }
  // force a big friday wave on day 12
  st.day = 12;
  g.wave = g.bears.planWave(12);
  const types = {};
  for (const b of g.wave.bears) types[b.type + (b.wants.length ? '(' + b.wants.join(',') + ')' : '') + (b.prefer ? '[' + b.prefer + ']' : '')] = (types[b.type + (b.wants.length ? '(' + b.wants.join(',') + ')' : '') + (b.prefer ? '[' + b.prefer + ']' : '')] || 0) + 1;
  st.hour = 16.99;
  const errors = [];
  let t = 0;
  while (t < 200 && st.phase !== 'night' && st.phase !== 'gameover') {
    try { g.update(0.05); g.ui.update(0.05); } catch (e) { errors.push(String(e.stack || e).split('\n').slice(0, 4).join(' | ')); break; }
    t += 0.05;
  }
  const d = g.day;
  return { log: log.join(' '), types, wave: g.wave.bears.length, served: d.served, happy: d.happy, ramp: d.rampages, earned: d.coins, fishLeft: g.fish.count, rating: st.rating.toFixed(2), phase: st.phase, t: t.toFixed(1), errors,
    stock: { honey: g.structures.totalStock('honey'), syrup: g.structures.totalStock('syrup'), berries: g.structures.totalStock('berries') },
    reviews: st.reviews.slice(0, 8).map((r) => r.stars + ':' + r.type + ':' + r.text.slice(0, 40)) };
};
