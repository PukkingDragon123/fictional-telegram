window.__scenario3 = () => {
  const g = __game, st = g.state, gr = g.grid;
  st.coins = 99999;
  for (const r of ['r_beavers', 'r_dams', 'r_fences']) st.research.push(r);
  for (let z = 20; z < 50; z++) if (gr.isWater(28, z)) g.structures.place('dam', 28, z, { instant: true });
  for (let z = 20; z < 50; z++) for (let x = 29; x < 46; x++) {
    if (gr.isWater(x, z) || !gr.hasWaterNeighbor(x, z, true)) continue;
    g.structures.place('fence', x, z, { instant: true });
  }
  g.onTopologyChanged();
  const [ex, ez] = g.bears.entryTile;
  const field = gr.bearField([ez * gr.w + ex]);
  // find a reachable east water tile
  let target = null;
  for (let z = 20; z < 50 && !target; z++) for (let x = 29; x < 46 && !target; x++) if (gr.isWater(x, z) && isFinite(field[z * gr.w + x]) && gr.region[z * gr.w + x] >= 0 && gr.regionSizes[gr.region[z*gr.w+x]] < 40) target = [x, z];
  if (!target) return { sealed: true, regions: gr.regionSizes };
  // walk back
  const path = [target];
  let [cx, cz] = target, guard = 0;
  while (field[cz * gr.w + cx] > 0 && guard++ < 300) { const n = gr.descend(field, cx, cz); if (!n) break; [cx, cz] = n; path.push(n); }
  const desc = path.reverse().map(([x, z]) => { const s = gr.structAt(x, z); return `${x},${z}${gr.isWater(x, z) ? '~' : ''}${s ? '[' + s.type + ']' : ''}${gr.occ[z*gr.w+x]===-2?'[hut]':''}`; });
  return { sealed: false, target, path: desc.join(' > ') };
};
