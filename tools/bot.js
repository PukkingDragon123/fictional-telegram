// In-page bot: plays N days quickly and returns per-day stats.
window.__bot = (days = 6) => {
  const g = __game, out = [];
  const errors = [];
  const origErr = console.error;
  const tick = () => {
    const st = g.state;
    if (st.phase === 'day') {
      if (g.foodBag.count > 2 && g.fish.list.length) {
        const hungry = g.fish.list.filter((f) => f.hunger > 0.3);
        if (hungry.length) { const f = hungry[Math.floor(Math.random() * hungry.length)]; g.feedAt(f.x, f.z); }
      }
      if (st.hour > 9.5 && st.hour < 15 && g.fish.population() < g.fish.capacity() * 0.5) {
        const sp = g.availableSpecies().filter((id) => g.speciesUnlocked(id)).sort((a, b) => g.speciesPrice(a) - g.speciesPrice(b));
        const best = sp[sp.length > 1 ? 1 : 0];
        if (best && g.canAfford(g.speciesPrice(best) + 20)) g.buyFish(best, 1);
      }
      if (Math.random() < 0.02) {
        const { RESEARCH } = window.__data;
        const avail = RESEARCH.filter((r) => !st.research.includes(r.id) && r.req.every((q) => st.research.includes(q))).sort((a, b) => a.cost - b.cost);
        if (avail[0] && st.coins > avail[0].cost + 40) g.research(avail[0].id);
      }
      if (g.structures.countBuilt('seaweed') < 5 && st.coins > 60) {
        const p = g.fish.randomWaterPoint();
        if (p) g.placeStructure('seaweed', Math.floor(p.x), Math.floor(p.z));
      }
    }
  };
  let guard = 0;
  const startDay = g.state.day;
  while (g.state.day < startDay + days && guard++ < 200000 && g.state.phase !== 'gameover') {
    tick();
    try { g.update(0.05); g.ui.update(0.05); } catch (e) { errors.push(String(e.stack || e).split('\n').slice(0, 4).join(' | ')); if (errors.length > 5) break; }
    if (g.state.phase === 'night') {
      const d = g.day;
      out.push({ day: g.state.day, coins: g.state.coins, earned: d.coins, served: d.served, happy: d.happy, ramp: d.rampages, fish: g.fish.count, cap: g.fish.capacity(), rating: +g.state.rating.toFixed(2), res: g.state.research.length });
      g.ui.closeModal();
      g.nextDay();
    }
  }
  return { out, errors, phase: g.state.phase };
};
