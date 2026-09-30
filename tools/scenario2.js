window.__scenario2 = () => {
  const g = __game, st = g.state;
  st.coins = 99999;
  for (const r of ['r_beavers', 'r_dams', 'r_fences']) st.research.push(r);
  g.mods = __data.computeMods(st.research, 0);
  for (const f of [...g.fish.list]) g.fish.remove(f);
  let lodge = null;
  for (let z = 28; z < 40 && !lodge; z++) for (let x = 18; x < 26 && !lodge; x++) if (g.structures.canPlace('lodge', x, z).ok) { g.placeStructure('lodge', x, z); lodge = [x, z]; }
  const col = 28;
  for (let z = 20; z < 50; z++) if (g.grid.isWater(col, z)) { const s = g.structures.place('dam', col, z, { instant: true }); }
  g.onTopologyChanged();
  // fish only on the east side (x > 28)
  const east = [];
  for (let z = 20; z < 50; z++) for (let x = 29; x < 45; x++) if (g.grid.fishPassable(x, z)) east.push([x, z]);
  for (let i = 0; i < 12; i++) { const [x, z] = east[i % east.length]; g.fish.spawn('bluegill', x + 0.5, z + 0.5, { adult: true }); }
  // fence the east shore so bears can only reach the west half by land
  let fences = 0;
  for (let z = 20; z < 50; z++) for (let x = 29; x < 46; x++) {
    if (g.grid.isWater(x, z)) continue;
    if (!g.grid.hasWaterNeighbor(x, z, true)) continue;
    if (g.structures.place('fence', x, z, { instant: true })) fences++;
  }
  // re-close the ring around the reserved trail entry
  const [ex, ez] = g.bears.entryTile;
  for (const [x, z] of [[ex + 2, ez - 1], [ex + 2, ez], [ex + 2, ez + 1], [ex + 2, ez + 2], [ex + 1, ez + 2], [ex, ez + 2], [ex - 1, ez + 2]]) if (!g.grid.isWater(x, z)) { if (g.structures.place('fence', x, z, { instant: true })) fences++; } else if (g.structures.place('dam', x, z, { instant: true })) fences++;
  g.onTopologyChanged();
  const regions = g.grid.regionSizes.slice();
  st.hour = 16.99;
  let t = 0; const errors = [];
  const snaps = [];
  while (t < 240 && st.phase !== 'night' && st.phase !== 'gameover') {
    try { g.update(0.05); g.ui.update(0.05); } catch (e) { errors.push(String(e.stack || e).split('\n').slice(0, 4).join(' | ')); break; }
    t += 0.05;
    if (Math.abs(t % 15) < 0.05) snaps.push(`${t.toFixed(0)}s:` + g.bears.list.map((b) => b.state[0] + (b.angry ? '!' : '') + b.eaten.toFixed(0)).join(','));
  }
  const d = g.day;
  return { fences, regions, served: d.served, happy: d.happy, ramp: d.rampages, fishLeft: g.fish.count, dams: g.structures.list.filter((s) => s.type === 'dam').length, fencesLeft: g.structures.list.filter((s) => s.type === 'fence').length, smashed: g.stats.smashed, rating: st.rating.toFixed(2), snaps, errors };
};
window.__scenario2b = () => {
  const g = __game;
  const catches = [];
  const orig = g.bears.catchFish.bind(g.bears);
  g.bears.catchFish = (b, f) => { catches.push(`bear@${b.x.toFixed(1)},${b.z.toFixed(1)} r${b.region} st=${b.state} fish@${f.x.toFixed(1)},${f.z.toFixed(1)} r${f.region} tile=${g.grid.regionAt(f.x,f.z)}`); orig(b, f); };
  const r = __scenario2();
  r.catches = catches.slice(0, 12);
  return r;
};
