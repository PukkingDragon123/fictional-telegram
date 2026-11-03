// [v31 cine] Easter eggs (game.secrets). Nine hidden things; each one found shows a gold
// SECRET FOUND card (n of 9) and pays a little the first time. Found ids: game.state.secrets.
//
//   konami    up up down down left right left right B A: Reynard's victory dance, a cheat that isn't
//   poke      tap Reynard ten times in a row: he gets crankier, then pays you to stop
//   whistle   tap the office tower five times: someone blows the 5 PM whistle early. The CEO is NOT amused
//   reynard   type his name: a very fancy bow
//   money     type "money": a coin shower he won't let you keep
//   salmon    type "salmon": every fish in the pond jumps at once
//   nap       leave the pond alone for three minutes: Reynard dozes off standing up
//   thirteen  wake up on day 13: something is off with the fish
//   title     name a pond "The Bear Must Eat"
// (Typed words avoid B and F: those keys ring the bell and follow bears. The Konami B is swallowed.)
import { OFFICE } from '../../world/worldgen.js';
import { floatText, floatTitle } from '../../ui/kinetic/floatText.js';
import { Vector3 } from 'three';

export const SECRETS = {
  konami: { name: 'Old School', pay: 30 },
  poke: { name: 'Do Not Poke the Fox', pay: 1 },
  whistle: { name: 'Who Touched My Whistle', pay: 25 },
  reynard: { name: 'At Your Service', pay: 15 },
  money: { name: 'Look, Don\'t Touch', pay: 0 },
  salmon: { name: 'Synchronized Swimming', pay: 20 },
  nap: { name: 'Power Nap', pay: 10 },
  thirteen: { name: 'Unlucky Thirteen', pay: 13 },
  title: { name: 'Meta', pay: 50 },
};
const N = Object.keys(SECRETS).length;
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
const WORDS = { reynard: 'reynard', money: 'money', salmon: 'salmon' };
const POKE_LINES = [
  [2, 'Hm?', 'say'], [4, 'Can I help you?', 'say'], [6, 'Please stop that.', 'angry'], [9, 'I am a BUSINESS FOX!', 'shout'],
  [8, 'My monocle! You\'ll knock it off!', 'scared'],
];
const _v = new Vector3();

export class Secrets {
  constructor(game) {
    this.game = game;
    this.keys = [];
    this.pokes = []; this.pokeN = 0;
    this.taps = [];
    this.lastInput = performance.now();
    this.dozing = false;
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('pointerdown', (e) => this.onPtr(e), true);
    window.addEventListener('wheel', () => this.touch(), { passive: true });
    game.on('day', () => setTimeout(() => this.onDay(), 3500));
    game.on('pondNamed', (p) => { if (/bear\s*must\s*eat/i.test(p?.name || '')) this.title(); });
  }

  get found() { return (this.game.state.secrets ||= []); }
  has(id) { return this.found.includes(id); }

  /** the gold card, a jingle and the first-time coins */
  reveal(id) {
    const g = this.game, S = SECRETS[id];
    if (!S) return;
    const first = !this.has(id);
    if (first) this.found.push(id);
    const n = this.found.length;
    setTimeout(() => {
      g.audio?.play?.('reveal_rare', { volume: 0.45 });
      floatTitle({ kicker: first ? 'SECRET FOUND' : 'SECRET', title: S.name, sub: `${n} of ${N} secrets${first && S.pay ? ` · +${S.pay} coins` : ''}`, style: 'gold', y: 0.16, ms: 2800 });
      if (first && S.pay) g.earnMisc?.(S.pay, 'tips');
      if (first) g.save?.();
    }, 300);
  }

  ok() {
    const g = this.game;
    return g.started && !g.titleMode && !g.tutorial?.active && !g.director?.active && !g.cutscene?.active && !g.inputLocked;
  }
  touch() {
    this.lastInput = performance.now();
    if (this.dozing) this.wake();
  }

  // ---------------------------------------------------------------- keys
  onKey(e) {
    this.touch();
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = String(e.key || '').toLowerCase();
    if (!k || e.repeat) return;
    this.keys.push(k);
    if (this.keys.length > 12) this.keys.shift();
    if (!this.ok()) return;
    // the Konami B must not ring the bell
    const tail = this.keys.slice(-KONAMI.length);
    const pre = this.keys.slice(-9);
    if (k === 'b' && pre.join() === KONAMI.slice(0, 9).join()) { e.stopImmediatePropagation(); e.preventDefault(); }
    if (tail.join() === KONAMI.join()) { this.keys.length = 0; this.konami(); return; }
    const typed = this.keys.join('');
    for (const [w, id] of Object.entries(WORDS)) if (typed.endsWith(w)) { this.keys.length = 0; this[id](); return; }
  }

  // ---------------------------------------------------------------- taps (Reynard, the tower)
  screenOf(x, y, z) {
    const g = this.game;
    _v.set(x, y, z);
    const p = g.rig.worldToScreen(_v, g.renderer);
    return p.visible ? p : null;
  }
  onPtr(e) {
    this.touch();
    if (!this.ok() || e.button > 0) return;
    if (e.target && e.target.tagName !== 'CANVAS') return;
    const g = this.game, f = g.fox;
    const now = performance.now();
    // Reynard
    const fp = f && !f.asleep && f.rig?.root?.visible ? this.screenOf(f.x, f.y + 0.9, f.z) : null;
    if (fp && Math.hypot(e.clientX - fp.x, e.clientY - fp.y) < 34) {
      e.stopPropagation(); // a poke is a poke: the feed tool doesn't send him running off to the shore
      this.pokes = this.pokes.filter((t) => now - t < 2600);
      this.pokes.push(now);
      this.pokeN = this.pokes.length >= 2 ? this.pokeN + 1 : 1;
      this.poke(this.pokeN);
      return;
    }
    // the office tower (by day)
    if (g.state.phase === 'day') {
      const op = this.screenOf(OFFICE.x, OFFICE.h + 4.5, OFFICE.z + 1.5);
      if (op && Math.abs(e.clientX - op.x) < 60 && Math.abs(e.clientY - op.y) < 90) {
        this.taps = this.taps.filter((t) => now - t < 4000);
        this.taps.push(now);
        if (this.taps.length >= 5) { this.taps.length = 0; this.whistle(); }
      }
    }
  }

  foxBark(text, style = 'say', ms = 1.6) {
    const f = this.game.fox;
    return floatText({ text, at: { getWorldPos: (v) => v.set(f.x, f.y + 1.75, f.z) }, style, name: 'Reynard', color: '#ff9a3c', voice: 'fox', ms: ms * 1000, prio: 3 });
  }

  poke(n) {
    const g = this.game, f = g.fox;
    g.audio?.play?.('pet', { volume: 0.4, pitch: 1 + n * 0.04 });
    f.react?.(n >= 9 ? 'panic' : 'cheer', 0.5);
    const L = POKE_LINES.find((x) => x[0] === n);
    if (L) this.foxBark(L[1], L[2]);
    if (n >= 10) {
      this.pokes.length = 0; this.pokeN = 0;
      this.foxBark('FINE. Here\'s a coin. Now SHOO.', 'angry', 2.4);
      g.particles?.coins?.(f.x, f.y + 1.4, f.z, 3);
      this.reveal('poke');
    }
  }

  // ---------------------------------------------------------------- the eggs
  konami() {
    const g = this.game, D = g.director;
    if (!D) return;
    D.play(async (c) => {
      const f = g.fox;
      c.center(null);
      await c.shot([f.x, f.z], { zoom: 0.017, dur: 0.8 });
      c.sfx('fanfare', { volume: 0.45 });
      c.fox.hold('dance');
      c.fx('confetti', f.x, f.y + 1.6, f.z, 60);
      await c.card({ title: '+30 LIVES', style: 'gold', y: 0.18, ms: 1800 });
      c.fox.hold('shrug');
      await c.say(c.fox, '...This isn\'t that kind of game.', { style: 'whisper' });
      await c.say(c.fox, 'But I respect the classics.', { anim: 'bow_fancy' });
    }, { id: 'egg_konami', pause: true }).then(() => this.reveal('konami'));
  }

  whistle() {
    const g = this.game, D = g.director;
    if (!D) return;
    D.play(async (c) => {
      const O = c.office;
      const W = { x: O.x + 3.1, y: O.h + 11.3, z: O.z - 1.1 };
      await c.shot([W.x - 0.4, W.z + 0.8], { zoom: 0.013, dur: 0.9, lift: W.y - 1.2 });
      c.sfx('whistle', { volume: 0.4, pitch: 1.35 });
      c.fx('puff', W.x, W.y + 0.4, W.z, 4, 0.3);
      c.bark(c.spot(W.x, W.y + 0.5, W.z), 'toot?', { style: 'whisper', ms: 1.4 });
      await c.beat(1.2);
      const tower = c.spot(O.x, O.h + 4, O.z + 2, 'The CEO', '#bfe6ff', 'ceo');
      await c.say(tower, 'WHO. TOUCHED. MY WHISTLE.', { style: 'radio', shake: 0.3 });
      await c.say(tower, 'It\'s not five o\'clock. Back to your desks. ALL of you.', { style: 'radio' });
      await c.shot([g.fox.x, g.fox.z], { zoom: 0.02, dur: 1 });
      await c.say(c.fox, 'I saw nothing.', { style: 'whisper', anim: 'tiptoe' });
    }, { id: 'egg_whistle', pause: true }).then(() => this.reveal('whistle'));
  }

  reynard() {
    const g = this.game, f = g.fox;
    f.cine = { anim: 'bow_fancy', face: Math.PI / 2 };
    this.foxBark('Reynard. At your service.', 'happy', 2.2);
    g.particles?.sparkle?.(f.x, f.y + 1.6, f.z, 8);
    setTimeout(() => { if (f.cine?.anim === 'bow_fancy') f.cine = null; }, 2200);
    this.reveal('reynard');
  }

  money() {
    const g = this.game, f = g.fox;
    g.particles?.coins?.(f.x, f.y + 2.4, f.z, 24);
    g.audio?.play?.('coins', { volume: 0.5 });
    f.react?.('greedy', 2);
    setTimeout(() => this.foxBark('Look. Don\'t touch.', 'whisper', 2), 600);
    this.reveal('money');
  }

  salmon() {
    const g = this.game;
    const list = (g.fish?.list || []).filter((x) => !x.dead && !x.tank).slice(0, 40);
    list.forEach((fi, i) => setTimeout(() => {
      try { g.particles.splash(fi.x, fi.z, 8, 0.9); g.particles.sparkle(fi.x, 0.6, fi.z, 3); } catch { /* */ }
    }, i * 40));
    g.audio?.play?.('bigsplash', { volume: 0.5 });
    this.foxBark(list.length ? 'Ta-daa! Synchronized swimming!' : 'Salmon? I have no fish yet!', list.length ? 'excited' : 'sad', 2);
    if (list.length) this.reveal('salmon');
  }

  title() {
    const g = this.game;
    setTimeout(() => {
      this.foxBark('...Wait. Isn\'t that the name of the game?', 'spooky', 3);
      this.reveal('title');
    }, 900);
  }

  onDay() {
    const g = this.game, st = g.state;
    if (st.day === 13 && !this.has('thirteen')) {
      floatTitle({ kicker: 'DAY', title: '13', sub: 'The fish seem... nervous.', style: 'spooky', y: 0.2, ms: 3200 });
      g.audio?.play?.('heartbeat', { volume: 0.4 });
      setTimeout(() => this.reveal('thirteen'), 3600);
    }
  }

  // ---------------------------------------------------------------- the nap
  update() {
    const g = this.game;
    if (this.dozing || !this.ok() || g.state.phase !== 'day' || g.state.paused || g.ui?.panel) return;
    if (performance.now() - this.lastInput > 180000) this.doze();
  }
  doze() {
    const g = this.game, f = g.fox;
    this.dozing = true;
    f.cine = { anim: 'sit_doze', face: Math.PI / 2 };
    this.zzz = setInterval(() => { try { g.particles.zzz(f.x, f.y + 1.6, f.z); } catch { /* */ } }, 1400);
    floatText({ text: 'zzz... money... zzz...', at: { getWorldPos: (v) => v.set(f.x, f.y + 1.5, f.z) }, style: 'think', ms: 5000, prio: 4 });
  }
  wake() {
    const g = this.game, f = g.fox;
    this.dozing = false;
    clearInterval(this.zzz);
    f.cine = { anim: 'wake_startle', face: Math.PI / 2 };
    g.audio?.play?.('fox_startle', { volume: 0.45 });
    setTimeout(() => { this.foxBark('I was NOT sleeping!', 'shout', 1.8); }, 250);
    setTimeout(() => { if (f.cine?.anim === 'wake_startle') f.cine = null; }, 1600);
    this.reveal('nap');
  }
}
