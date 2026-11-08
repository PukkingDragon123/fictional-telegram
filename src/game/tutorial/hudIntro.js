// [v33 tut] The HUD arrives one piece at a time. Each piece: it appears (with a little ceremony),
// Reynard hops over to it and says what it's for, then you try it.
//
// The hotbar is Reynard's leather tool roll (src/ui/kit/ToolKit.js): game.ui.kitIntroduce(feature) sews
// the pocket in with its ceremony (and unlocks the feature), game.ui.kitSpotlight(feature, on) lights it
// while you try it. HUD pieces that aren't pockets (coins, clock, speed) and builds without the kit
// use the old path: game.unlockFeature (UI.onUnlock's unlock-pop) + a stepped glow and a pixel arrow
// from src/game/tutorial/marks.js.
//
//   await introduce(T, 'feed', { line, mood, tryIt: () => promise, tryLine, timeout, fallback })

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** the DOM element of a HUD piece / hotbar slot (null if it isn't on screen) */
export function hudEl(game, feature) {
  const ui = game.ui;
  try { const el = ui?.kit?.el?.(feature); if (el instanceof Element) return el; } catch { /* ignore */ }
  if (feature === 'coins') return document.querySelector('#hudhost .hud2-tag') || document.getElementById('hudhost');
  if (feature === 'clock' || feature === 'speed') return document.getElementById('clockwrap');
  if (feature === 'rating') return document.querySelector('#hudhost .hud2-stars') || document.getElementById('hudhost');
  return document.querySelector(`#toolbar .tool[data-feature="${feature}"]`) || document.querySelector(`[data-kit="${feature}"], [data-feature="${feature}"]`);
}

/** a TeacherOverlay target that keeps finding the element (it may be rebuilt) */
export const hudTarget = (game, feature) => () => hudEl(game, feature) || { x: innerWidth / 2, y: innerHeight - 60 };

export async function introduce(T, feature, o = {}) {
  const game = T.game, ui = game.ui;
  const { line = null, mood = 'happy', tryIt = null, tryLine = null, nagLine = null, timeout = 45, fallback = null, quiet = false } = o;
  T.stage = 'hud:' + feature;
  // 1. it appears (the kit's ceremony is for hotbar pockets: coins / clock / speed use the old reveal)
  const pocket = !!document.querySelector(`#toolbar .tool[data-feature="${feature}"]`);
  if (pocket && typeof ui?.kitIntroduce === 'function' && !game.isOpen(feature)) {
    try { await T.g(Promise.race([Promise.resolve(ui.kitIntroduce(feature)), wait(9)])); } catch (e) { if (T.isSkip(e)) throw e; console.warn('[tut] kitIntroduce', feature, e); }
    game.unlockFeature(feature, { quiet: true });
  } else if (!game.isOpen(feature)) {
    game.unlockFeature(feature, { quiet });
    const el = hudEl(game, feature);
    if (el) { el.classList.remove('tutm-new'); void el.offsetWidth; el.classList.add('tutm-new'); setTimeout(() => el.classList.remove('tutm-new'), 1600); }
    game.audio?.play?.('star_pop', { volume: 0.4, pitch: 1.2 });
    await T.wait(0.5);
  }
  if (!line && !tryIt) return;
  // 2. Reynard hops over and tells you about it
  const spot = (on) => {
    try { if (pocket && typeof ui?.kitSpotlight === 'function') { ui.kitSpotlight(feature, on); return; } } catch { /* ignore */ }
    const el = hudEl(game, feature);
    el?.classList.toggle('tutm-hot', on);
  };
  spot(true);
  const tgt = hudTarget(game, feature);
  const arrow = T.guide.marks.ui(tgt);
  try {
    if (line) await T.teach(line, { target: tgt, circle: true, wait: true, mood });
    // 3. you try it
    if (tryIt) {
      const p = Promise.resolve(tryIt());
      if (tryLine) T.teach(tryLine, { target: tgt, dur: 5, mood: 'excited' });
      if (nagLine) T.nag(() => nagLine);
      const done = await T.within(p, timeout);
      T.stopNag();
      if (!done) {
        if (fallback) await fallback();
        await T.within(p, 6);
      }
      T.win();
    }
  } finally {
    arrow.stop();
    spot(false);
    T.clearChalk();
  }
}

/** resolves when the tool `kind` is picked */
export function toolPicked(T, kind) {
  const game = T.game;
  if (game.tool?.kind === kind) return Promise.resolve(true);
  return T.until('tool', (t) => t?.kind === kind);
}
