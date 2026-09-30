window.__scenario4 = () => {
  const g = __game, st = g.state;
  st.coins = 99999;
  for (const r of ['r_perch','r_bass','r_brook','r_rainbow','r_beavers','r_dams','r_feeder','r_gates','r_genetics','r_love1','r_food1']) g.research(r);
  for (const f of [...g.fish.list]) g.fish.remove(f);
  for (let i = 0; i < 8; i++) { const p = g.fish.randomWaterPoint(); g.fish.spawn(i % 2 ? 'brook' : 'rainbow', p.x, p.z, { adult: true, hunger: 0.1 }); }
  for (let i = 0; i < 6; i++) { const p = g.fish.randomWaterPoint(); g.fish.spawn(i % 2 ? 'bluegill' : 'perch', p.x, p.z, { adult: true, hunger: 0.1 }); }
  let lodge = null;
  for (let z = 28; z < 40 && !lodge; z++) for (let x = 18; x < 26 && !lodge; x++) if (g.structures.canPlace('lodge', x, z).ok) { g.placeStructure('lodge', x, z); lodge = [x, z]; }
  // feeder on a shore tile
  const shore = g.shoreTiles();
  let feederOk = false;
  for (const [x, z] of shore) { if (g.placeStructure('feeder', x, z)) { feederOk = [x, z]; break; } }
  let gateOk = null;
  for (let z = 25; z < 45 && !gateOk; z++) if (g.grid.isWater(26, z) && g.structures.canPlace('gate', 26, z).ok) { g.placeStructure('gate', 26, z); gateOk = [26, z]; }
  const disc0 = st.discovered.length;
  const pellets0 = g.food.pellets.length;
  let maxPellets = 0;
  for (let t = 0; t < 60; t += 0.05) { g.update(0.05); maxPellets = Math.max(maxPellets, g.food.pellets.length); st.hour = Math.min(st.hour, 15); for (const f of g.fish.list) f.hunger = Math.min(f.hunger, 0.3); }
  const gate = g.structures.list.find((s) => s.type === 'gate');
  const regionsBefore = g.grid.regionSizes.length;
  if (gate && gate.built) g.structures.toggleGate(gate);
  const regionsAfterOpen = g.grid.regionSizes.length;
  return { feederOk, gateOk, gateBuilt: gate && gate.built, regionsBefore, regionsAfterOpen, maxPellets, pellets0, fish: g.fish.count, eggs: g.fish.eggs.length, hatched: g.stats.hatched, courtships: g.stats.courtships, discovered: st.discovered.slice(disc0), counts: g.fish.countBySpecies() };
};
