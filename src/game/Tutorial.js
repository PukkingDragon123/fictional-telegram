// First-day tutorial. It opens inside Reynard's room: he spins round in his
// chair, introduces himself in speech bubbles, then walks you out to the pond.
// The UI starts empty and each piece appears only when he introduces it:
// e-Buy (order a beaver crew), Moose Express delivers it, the blueprint build
// mode (place the lodge), clearing forest with beavers, buying fish eggs,
// feeding, and finally the clock. Day 1 is a building day: bears start on day 2.
import { HUT } from '../world/worldgen.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

export const ALL_FEATURES = ['coins', 'ebuy', 'build', 'clear', 'feed', 'hand', 'tag', 'pet', 'clock', 'speed', 'rating', 'lab', 'dex', 'reviews'];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
  }

  // Resolves when `ev` fires (and passes `pred`, if given)
  until(ev, pred = null) {
    return new Promise((res) => {
      const fn = (d) => {
        if (pred && !pred(d)) return;
        const L = this.game.listeners[ev];
        L.splice(L.indexOf(fn), 1);
        res(d);
      };
      this.game.on(ev, fn);
    });
  }

  foxAnchor() {
    const f = this.game.fox;
    return { getWorldPos: (v) => v.set(f.x, f.y + 1.75, f.z) };
  }

  // a line from the in-world fox; `wait` = click to continue
  async fox(text, { mood = 'normal', wait: w = true, expr = null, dur } = {}) {
    const game = this.game;
    if (expr) game.fox.react?.(expr, 1.5);
    const h = game.say(this.foxAnchor(), text, { voice: 'fox', mood, wait: w, key: 'tutfox', size: 'm', dur });
    if (w && h?.done) await h.done;
    else await wait(dur || 1.6);
  }

  async lab(text, expr, mood = 'normal') {
    const h = this.game.lab.say(text, expr, { mood, wait: true });
    if (h?.done) await h.done; else await wait(2);
  }

  async run() {
    const game = this.game;
    const L = game.lab;
    this.active = true;
    game.tutorialHold = true; // the clock waits until the tour is over
    game.state.unlocked = [];
    game.ui?.refreshUnlocks?.();

    // ---- inside the fox's room
    L.enterTutorial();
    await wait(2.4);
    await L.tutorialStand();
    await this.lab('Oh! You\'re here!', 'shocked', 'excited');
    await this.lab('I\'m Reynard. Fish tycoon.', 'smug');
    L.fox?.play('laugh_evil', { loop: false, onDone: () => L.fox?.play('idle', { loop: true }) });
    await this.lab('Bears in suits eat here at 5. We sell them FISH!', 'scheming', 'happy');
    await this.lab('Mwahaha! ...Follow me!', 'excited', 'excited');
    await L.walkOut();

    // ---- out of the hut door, down to the pond
    const fox = game.fox;
    fox.x = HUT.x + 1.5; fox.z = HUT.z + 3.2; fox.heading = Math.PI / 2;
    game.rig.lookAt(fox.x, fox.z + 1, true);
    game.rig.wupp = game.rig.wuppGoal = 0.022;
    game.state.paused = false;
    await this.irisOpen(fox.x, 1, fox.z);
    const pond = game.shoreTiles().sort((a, b) => Math.hypot(a[0] - fox.x, a[1] - fox.z) - Math.hypot(b[0] - fox.x, b[1] - fox.z))[0];
    if (pond) fox.target = { x: pond[0] + 0.5, z: pond[1] + 0.5 };
    this.follow = true;
    await wait(2.2);
    await this.fox('Behold! The pond!', { mood: 'excited', expr: 'cheer' });
    const fish = game.fish.list[0];
    if (fish) { this.follow = false; game.rig.lookAt(fish.x, fish.z); }
    await this.fox('Clyde & Bonnie. Our only fish.', { mood: 'normal' });
    this.follow = true;
    await this.fox('We need workers. BEAVERS!', { mood: 'shout' });

    // ---- e-Buy: order a beaver crew
    game.unlockFeature('coins');
    game.unlockFeature('ebuy');
    let ptr = game.ui?.pointAt?.('tool:ebuy');
    this.fox('Order a crew on e-Buy!', { wait: false, dur: 4 });
    await this.until('ordered', (o) => o.items.some((it) => it.type === 'lodge'));
    ptr?.();
    this.fox('Moose Express is on it!', { wait: false, mood: 'happy', dur: 2.5 });
    await this.until('delivered', (o) => o.items.some((it) => it.type === 'lodge'));
    await wait(0.8);

    // ---- build mode: place the lodge
    game.unlockFeature('build');
    ptr = game.ui?.pointAt?.('tool:build');
    this.fox('Place the lodge by the water!', { wait: false, dur: 4 });
    await this.until('built', (s) => s.type === 'lodge');
    ptr?.();
    await wait(1);
    await this.fox('Beavers! They work for berries.', { mood: 'happy' });
    game.unlockFeature('clear');
    await this.fox('Clear trees = more land + money!', { mood: 'excited' });
    ptr = game.ui?.pointAt?.('tool:build');
    await this.until('cleared');
    ptr?.();
    await this.fox('Ka-ching!', { wait: false, mood: 'excited', dur: 1.5 });
    await wait(1.5);

    // ---- buy a fish egg
    ptr = game.ui?.pointAt?.('tool:ebuy');
    this.fox('Now: fish eggs!', { wait: false, dur: 3 });
    await this.until('ordered', (o) => o.items.some((it) => it.kind === 'egg'));
    ptr?.();
    await this.until('delivered', (o) => o.items.some((it) => it.kind === 'egg'));
    await wait(1.2);
    await this.fox('It hatches in the pond soon!', { mood: 'happy' });

    // ---- feeding
    game.unlockFeature('feed');
    this.fox('Tap the water to feed them!', { wait: false, dur: 4 });
    await this.until('fed');
    await wait(1.2);
    game.unlockFeature('hand');
    game.unlockFeature('pet');

    // ---- the clock (bears come tomorrow)
    game.unlockFeature('clock');
    ptr = game.ui?.pointAt?.('clock');
    await this.fox('Bears come TOMORROW at 5.', { mood: 'scared' });
    await this.fox('Today we build! Tap the clock to go faster.', { mood: 'happy' });
    ptr?.();
    game.unlockFeature('speed');
    this.follow = false;
    game.tutorialHold = false;
    game.state.tutorialDone = true;
    this.active = false;
    game.save();
  }

  irisOpen(x, y, z) {
    const game = this.game;
    return new Promise((res) => {
      const t0 = performance.now();
      const R = Math.hypot(window.innerWidth, window.innerHeight);
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 1100);
        const p = game.rig.worldToScreen({ x, y, z }, game.renderer);
        game.renderer.setIris(p.x, p.y, R * k * k + 1);
        if (k < 1) requestAnimationFrame(step);
        else { game.renderer.setIris(0, 0, -1); res(); }
      };
      step();
    });
  }

  update() {
    if (this.follow) { const f = this.game.fox; this.game.rig.lookAt(f.x, f.z + 0.6); }
  }

  // later unlocks that come from playing, not the tour
  static progress(game) {
    if (!game.state.tutorialDone) return;
    if (game.state.day >= 2) { game.unlockFeature('rating'); game.unlockFeature('reviews'); }
    if (game.state.day >= 2) game.unlockFeature('lab');
    if (game.state.discovered.length >= 2 || game.state.day >= 3) game.unlockFeature('dex');
    if (game.state.day >= 3) game.unlockFeature('tag');
  }
}
