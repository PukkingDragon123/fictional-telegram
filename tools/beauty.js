window.__beauty = () => {
  const g = __game, st = g.state;
  st.coins = 99999;
  for (const r of __data.RESEARCH) if (!st.research.includes(r.id)) st.research.push(r.id);
  g.mods = __data.computeMods(st.research, 0);
  const P = (t, x, z) => g.structures.place(t, x, z, { instant: true });
  P('lodge', 22, 31);
  for (let z = 30; z <= 37; z++) if (g.grid.isWater(31, z)) P('dam', 31, z);
  P('willow', 36, 30); P('beehive', 35, 29); P('beehive', 37, 31); P('flowers', 36, 32); P('flowers', 34, 30);
  P('maple', 20, 37); P('flag', 34, 36); P('chair', 33, 37); P('picnic', 35, 38); P('lantern', 29, 38);
  P('berries', 19, 34); P('bughotel', 38, 33);
  for (let i = 0; i < 6; i++) { const p = g.fish.randomWaterPoint(); if (p) P(i % 2 ? 'lilypad' : 'seaweed', Math.floor(p.x), Math.floor(p.z)); }
  g.onTopologyChanged();
  const sp = ['bluegill', 'perch', 'bass', 'brook', 'rainbow', 'sockeye', 'pike', 'char', 'aurora', 'tiger', 'mapleKoi'];
  for (let i = 0; i < 34; i++) { const p = g.fish.randomWaterPoint(); if (p) g.fish.spawn(sp[i % sp.length], p.x, p.z, { adult: true, golden: i === 7 }); }
  g.beavers.refreshCounts();
  st.day = 5;
  g.wave = g.bears.planWave(5);
  st.hour = 16.99;
  for (let t = 0; t < 30; t += 0.05) g.update(0.05);
  return g.bears.list.map((b) => b.typeId + ':' + b.state).join(',');
};
