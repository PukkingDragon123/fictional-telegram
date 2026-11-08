// [v33 tut] SKIP TOUR: a button in the cutscenes' own SKIP look (Director .dir-skip), at the top of the
// screen for the whole tour. Tap it, Reynard's painted YES / NO planks ask "Skip the whole tour?", and a yes ends
// the tour at once with everything a finished tour leaves you (finishSkipped below).
import { ynPair } from '../../ui/ynButtons.js';
import { rollGenes } from '../genes.js';
import { spriteImg, hasSprite } from '../../ui/sprites.js';

export class SkipTag {
  constructor(T) {
    this.T = T;
    const el = (this.el = document.createElement('button'));
    el.type = 'button';
    el.className = 'tut-skiptag';
    el.title = 'Skip the tour';
    el.innerHTML = `${hasSprite('skip') ? spriteImg('skip', 2) : ''}<span>SKIP TOUR</span>`;
    el.addEventListener('pointerenter', () => T.game.audio?.play?.('hover', { volume: 0.3 }));
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.ask(); });
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
  }

  async ask() {
    const T = this.T, game = T.game;
    if (this.asking || T.skipping || !T.active) return;
    this.asking = true;
    game.audio?.play?.('page', { volume: 0.4 });
    this.el.classList.add('pulled');
    const yes = await planks('Skip the whole tour?', ['Skip it', 'Keep going'], game);
    this.el.classList.remove('pulled');
    this.asking = false;
    if (yes) T.skipNow();
  }

  remove() {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('on');
    el.classList.add('off');
    setTimeout(() => el.remove(), 400);
  }
}

/** the painted YES / NO planks with a paper question card (resolves true for the first) */
export function planks(question, [yesLabel, noLabel], game) {
  return new Promise((res) => {
    const el = document.createElement('div');
    el.className = 'tut-choice tut-ask';
    el.innerHTML = `<div class="q">${question}</div><div class="row"><button class="yes">${yesLabel}</button><button class="no">${noLabel}</button></div>`;
    const done = (v) => { el.classList.add('bye'); game.audio?.play?.(v ? 'pop_in' : 'click', { volume: 0.5 }); setTimeout(() => el.remove(), 250); res(v); };
    el.querySelector('.yes').addEventListener('click', (e) => { e.stopPropagation(); done(true); });
    el.querySelector('.no').addEventListener('click', (e) => { e.stopPropagation(); done(false); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    try { ynPair(el.querySelector('.yes'), el.querySelector('.no'), { keys: true }); } catch (e) { console.warn('yn', e); }
  });
}

// what a finished tour leaves you with
export const TOUR_FEATURES = ['coins', 'ebuy', 'feed', 'pet', 'tag', 'hand', 'lab', 'build', 'clear', 'clock', 'speed'];
const TOUR_RESEARCH = ['r_beavers', 'r_snackbar', 'r_carrot', 'r_woodgarage'];

/** end the tour now and catch the save up with it (no softlock, whatever step it was on) */
export function finishSkipped(T) {
  const game = T.game, ui = game.ui;
  const tryy = (f) => { try { f(); } catch (e) { console.warn('[tut] skip', e); } };
  tryy(() => T.stopNag());
  tryy(() => T.force(null));
  tryy(() => T.guide?.dispose());
  tryy(() => { const t = T.teacher; if (t) { t.clearChalk({ instant: true }); t.skip(); t.hide({ clear: true }); } });
  tryy(() => { if (game.director?.active) game.director.skip(); });
  tryy(() => { if (game.classroom?.active) game.classroom.skip(); });
  tryy(() => window.__fishScope?.close?.());
  tryy(() => ui?.closeEBuy?.());
  tryy(() => ui?.blueprint?.exit?.());
  tryy(() => ui?.closePanel?.());
  tryy(() => document.querySelectorAll('.tut-choice:not(.tut-ask)').forEach((e) => e.remove()));
  const L = game.lab;
  tryy(() => {
    if (!L?.active) return;
    if (L.tutorial || L.state === 'tut') {
      L.walking = null; L.tutorial = false;
      L.finishExit(false);
      const f = game.fox;
      f.x = f.home.x; f.z = f.home.z + 0.4; f.heading = Math.PI / 2;
      game.rig.lookAt(f.x, f.z + 1, true);
      game.rig.wupp = game.rig.wuppGoal = 0.03;
    } else L.exit();
  });
  tryy(() => game.renderer?.setIris?.(0, 0, -1));
  // the starting kit
  for (const f of TOUR_FEATURES) tryy(() => game.unlockFeature(f, { quiet: true }));
  tryy(() => {
    const adults = game.fish.list.filter((f) => f.adult && !f.tank);
    const need = [['M', 'Clyde'], ['F', 'Bonnie']].filter(([sex]) => !adults.some((f) => f.g.sex === sex));
    for (const [sex, name] of need) {
      const p = game.fish.randomWaterPoint();
      if (!p) continue;
      const g = rollGenes('bluegill', game.mods, { sex });
      g.traits = []; g.morph = 'normal'; g.size = 1; g.stars = 1;
      const f = game.fish.spawn('bluegill', p.x, p.z, { adult: true, hunger: 0.3, g, splash: true });
      if (f) { f.name = name; f.loveT = 8 + Math.random() * 6; }
    }
  });
  tryy(() => { for (const id of TOUR_RESEARCH) if (!game.state.research.includes(id)) game.research(id); });
  tryy(() => {
    const inv = (game.state.inventory ||= {});
    const has = (t) => game.structures.list.some((s) => s.type === t && !s.removed) || (inv[t] || 0) > 0;
    // the beaver crew's lodge (the questline gifts the Snack Bar, carrot seeds and Wood Garage itself
    // once their research is done: src/data/questline.js)
    if (!has('lodge')) inv.lodge = (inv.lodge || 0) + 1;
    game.emit('inventory', inv);
  });
  game.quickEggs = false;
  game.quickCrops = false;
  game.researchBoost = 1;
  game.timeScale = 1;
  if (game.fox) game.fox.cine = null;
  game.state.paused = false;
  game.inputLocked = false;
  game.tutorialHold = false;
  game.state.tutorialDone = true;
  T.active = false;
  tryy(() => game.setTool({ kind: 'feed' }));
  tryy(() => ui?.refreshUnlocks?.());
  tryy(() => ui?.syncFoodPicker?.());
  tryy(() => game.save());
  setTimeout(() => tryy(() => game.notify('Tour skipped. The pond is all yours. Make me rich!', 'excited', { dur: 4 })), 600);
}
