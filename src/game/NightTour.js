// [v19 overnight] The night, shown in the world instead of a summary card.
//
// While Reynard sleeps the pond keeps living (~2 min of pond time): clutches
// hatch, fry grow up, plants grow and ripen, couples lay new eggs, ponds and
// hives refill. simulate() works all of that out up front, but holds back the
// visible change for the spots the camera will visit; the moonlit tour then
// flies there and lets it happen on camera (fry pop out of the eggs with a
// "+3 fry" tag, plants jump a stage with a puff and a "Carrots: ripe!" tag).
// Whatever the tour didn't show (or skipped) is applied in finish(). At sunrise
// a small tally ("3 eggs hatched · 2 crops ripe") fades in and out by itself.
//
//   const tour = game.nightTour ||= new NightTour(game);
//   tour.simulate(120, { tour: true });   // plan; holds back the shown changes
//   await tour.play();                     // camera tour (skippable), then finish()
//   tour.showTally();                      // sunrise banner, removes itself
import * as THREE from 'three';
import { WATER_Y } from '../world/grid.js';
import { HUT } from '../world/worldgen.js';
import { STRUCTURES } from '../data/structures.js';
import { FOOD_ITEMS } from '../data/foods.js';
import { CROPS } from '../data/crops.js';
import { MORPHS } from '../data/species.js';
import { GROW_TIME } from './FishSystem.js';
import { spriteCanvas, hasSprite } from '../ui/sprites.js';
import '../ui/nighttour.css';

const SPEED = 0.65; // Cutscene runs every shot at 65% of its written length
const SHOT = 2.6; // written length of an event shot (~1.7 s on screen)
const MAX_SHOTS = 5;
const NEAR = 5; // tiles: things this close share one shot
const PRODUCE = {
  seaweed: ['Seaweed', 'seaweed'], honey: ['Honey', 'honey'], syrup: ['Syrup', 'syrup'], berries: ['Berries', 'berry'],
  rice: ['Wild rice', 'wildrice'], mushroom: ['Mushrooms', 'mushroom'],
};
const STAGE_WORD = ['planted', 'sprouted', 'growing', 'ripe!'];
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const _v = new THREE.Vector3();

export class NightTour {
  constructor(game) {
    this.game = game;
    this.events = [];
    this.tally = null;
    this.layer = null;
    this.tags = [];
    this.timers = [];
    this.raf = 0;
  }

  // ------------------------------------------------------------ simulate
  simulate(T = 120, { tour = false } = {}) {
    const g = this.game;
    const on = (g.overnight ||= { produced: {}, hatched: [], grew: 0, t: 0, events: [] });
    if (on.done) { this.finish(); return on; }
    on.done = true;
    on.produced ||= {}; on.hatched ||= []; on.events ||= [];
    const tally = (this.tally = { fry: 0, ripe: 0, grown: 0, ready: 0, clutches: 0, produce: null });
    const ev = (this.events = []);
    const mods = g.mods;
    const fish = g.fish;

    // --- garden: every plant grows; the ones the camera visits wait to pop on screen
    const crops = g.structures.list.filter((s) => s.built && !s.removed && g.harvest.isCrop(s));
    const snap = (s) => ({ crop: s.crop ? { ...s.crop, batch: s.crop.batch ? { ...s.crop.batch } : null } : null, stock: s.stock });
    const before = new Map(crops.map((s) => [s, snap(s)]));
    g.harvest.simulate(T);
    const grown = [];
    for (const s of crops) {
      const b = before.get(s);
      if (!b.crop || !s.crop || s.crop.stage <= b.crop.stage) continue;
      grown.push({ s, from: b.crop.stage, to: s.crop.stage, before: b, after: snap(s) });
    }
    tally.ripe = grown.filter((c) => c.to === 3).length;
    on.produced.crops = tally.ripe;
    const cropRank = (c) => (c.to === 3 ? 10 + (c.after.crop.batch?.r || 0) : c.to);
    for (const cl of this.cluster(grown.slice().sort((a, b) => cropRank(b) - cropRank(a)), (c) => c.s.x + 0.5, (c) => c.s.z + 0.5).slice(0, 2)) {
      const ripe = cl.items.some((c) => c.to === 3);
      ev.push({ kind: 'crop', prio: ripe ? 2 : 6, x: cl.x, z: cl.z, zoom: 0.026, items: cl.items, apply: () => this.applyCrops(cl.items) });
      if (tour) for (const c of cl.items) this.setCrop(c.s, c.before);
    }

    // --- ponds, hives, maple taps refill
    let best = null;
    for (const s of g.structures.list) {
      if (!s.built || s.removed || !s.def.food || g.harvest.isCrop(s)) continue;
      const was = s.stock;
      s.stock = Math.min(s.def.food.max, s.stock + s.def.food.regen * mods.produceMult * T * (g.structures.sprinklerBoost?.(s) || 1));
      const gain = Math.floor(s.stock) - Math.floor(was);
      g.structures.updateVisual(s);
      if (gain <= 0) continue;
      const k = s.def.food.kind;
      on.produced[k] = (on.produced[k] || 0) + gain;
      if (!best || on.produced[k] > best.n) best = { kind: k, n: on.produced[k], s };
      else if (best.kind === k) best.n = on.produced[k];
    }
    if (best && PRODUCE[best.kind]) {
      const [name, icon] = PRODUCE[best.kind];
      const s = best.s;
      tally.produce = { n: best.n, name, icon };
      ev.push({ kind: 'produce', prio: 7, x: s.x + 0.5, z: s.z + 0.5, zoom: 0.026, apply: () => {
        const y = g.structures.baseY(s);
        g.particles.sparkle(s.x + 0.5, y + 0.6, s.z + 0.5, 10, 0xfff2a0);
        this.tag(s.x + 0.5, y + 1.1, s.z + 0.5, `+${best.n} ${name.toLowerCase()}`, { icon });
      } });
    }

    // --- night breeding: well-fed couples lay a clutch
    const room = () => fish.capacity() - fish.population();
    const singles = fish.list.filter((f) => f.adult && f.fed >= 0.9 && !f.tank);
    const used = new Set();
    let love = null;
    for (const a of singles) {
      if (used.has(a) || room() <= 1) continue;
      const b = singles.find((o) => o !== a && !used.has(o) && o.region === a.region && fish.compatible(a, o));
      if (!b || Math.random() > 0.55) continue;
      used.add(a); used.add(b);
      fish.mate(a, b);
      tally.clutches++;
      love ||= { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    }
    if (love) {
      const n = tally.clutches;
      ev.push({ kind: 'love', prio: 5, x: love.x, z: love.z, zoom: 0.024, apply: () => {
        g.particles.hearts(love.x, WATER_Y + 0.4, love.z, 8);
        this.tag(love.x, WATER_Y + 0.9, love.z, n > 1 ? `${n} new clutches` : 'New clutch', { icon: 'heart' });
      } });
    }

    // --- eggs incubate; ready clutches from your own fish hatch (on camera).
    // Bought eggs, tank eggs and brand-new species keep waiting for a tap (their reveal is the fun part).
    for (const e of fish.eggs) {
      if (e.stage === 'laid') fish.fertilize(e, null);
      e.t = Math.max(0, (e.t || 0) - T);
      if (e.t <= 0 && !e.ready) e.ready = true;
    }
    for (const f of fish.list) if (f.state === 'fertilize') { f.state = 'wander'; f.eggs = null; }
    const known = g.state.discovered || [];
    const hatchable = fish.eggs.filter((e) => e.ready && !e.dead && !e.bought && !e.tank && known.includes(e.species));
    const waiting = fish.eggs.filter((e) => e.ready && !e.dead && !hatchable.includes(e));
    for (const cl of this.cluster(hatchable, (e) => e.x, (e) => e.z).slice(0, 2)) {
      ev.push({ kind: 'hatch', prio: 1, x: cl.x, z: cl.z, zoom: 0.022, apply: () => this.applyHatch(cl.items, cl) });
    }
    // clutches the tour won't fly to still hatch (in finish)
    this.leftoverEggs = hatchable;
    if (waiting.length) {
      const e0 = waiting.find((e) => !e.tank) || waiting[0];
      const x = e0.tank ? e0.tank.x + 0.5 : e0.x, z = e0.tank ? e0.tank.z + 0.5 : e0.z;
      tally.ready = waiting.length;
      ev.push({ kind: 'ready', prio: 4, x, z, zoom: 0.024, apply: () => {
        g.particles.sparkle(x, WATER_Y + 0.25, z, 14, 0xfff2a0);
        this.tag(x, WATER_Y + 0.8, z, `${plural(waiting.length, 'egg')} ready`, { icon: 'egg' });
      } });
    }

    // --- fry grow up (the first one waits for the camera)
    let star = null;
    for (const f of fish.list) {
      if (!f.adult) {
        const age0 = f.age;
        f.age += T * f.sp.growth * mods.growthMult * 0.6;
        if (f.age >= GROW_TIME) {
          f.adult = true; on.grew++; tally.grown++;
          if (!star && !f.tank) star = { f, age0, age1: f.age };
        }
      }
      f.hunger = Math.max(0.15, f.hunger - 0.1);
    }
    if (star) {
      const { f } = star;
      if (tour) { f.adult = false; f.age = Math.min(star.age0, GROW_TIME - 0.01); }
      ev.push({ kind: 'grown', prio: 3, at: () => ({ x: f.x, z: f.z }), x: f.x, z: f.z, zoom: 0.02, apply: () => {
        f.age = Math.max(f.age, star.age1); f.adult = true;
        g.particles.bubbles(f.x, (f.y || WATER_Y) + 0.2, f.z, 8);
        g.particles.sparkle(f.x, WATER_Y + 0.3, f.z, 10, 0xd8ffa0);
        const n = tally.grown;
        this.tag(f.x, WATER_Y + 0.8, f.z, n > 1 ? `${plural(n, 'fry', 'fry')} grown` : `${f.sp.name}: grown`, { icon: 'fish', follow: f });
      } });
    }

    // --- the egg tray and the pellet bag
    for (const e of g.state.eggTray) e.t = Math.max(0, e.t - T);
    const R = FOOD_ITEMS.pellets?.refill;
    if (R && g.foodStore.count('pellets') < R.upTo) g.foodStore.inv.pellets = R.upTo;

    on.events = ev;
    if (!tour) this.finish();
    return on;
  }

  // greedy clusters of things close together; biggest first
  cluster(list, fx, fz) {
    const left = list.slice(), out = [];
    while (left.length) {
      const a = left[0];
      const items = left.filter((b) => Math.hypot(fx(b) - fx(a), fz(b) - fz(a)) <= NEAR);
      for (const b of items) left.splice(left.indexOf(b), 1);
      const x = items.reduce((s, b) => s + fx(b), 0) / items.length, z = items.reduce((s, b) => s + fz(b), 0) / items.length;
      out.push({ items, x, z });
    }
    return out;
  }

  setCrop(s, st) {
    const g = this.game;
    s.crop = st.crop ? { ...st.crop, batch: st.crop.batch ? { ...st.crop.batch } : null } : s.crop;
    s.stock = st.stock;
    g.structures.updateVisual(s);
    g.structures.spritesDirty = true;
  }

  applyCrops(items) {
    const g = this.game;
    const groups = new Map(); // one tag per crop name: "Carrots: ripe!"
    for (const c of items) {
      if (c.applied) continue;
      c.applied = true;
      const s = c.s;
      this.setCrop(s, c.after);
      s.popT = 0.45;
      const y = g.structures.baseY(s);
      g.particles.puff(s.x + 0.5, y + 0.15, s.z + 0.5, 8, 0.28);
      g.particles.leaf?.(s.x + 0.5, y + 0.4, s.z + 0.5, 0x7ad04a);
      if (c.to === 3) g.particles.sparkle(s.x + 0.5, y + 0.6, s.z + 0.5, 8 + (c.after.crop.batch?.r || 0) * 4, 0xfff2a0);
      const item = FOOD_ITEMS[CROPS[s.type]?.item];
      const name = item?.name || STRUCTURES[s.type]?.name || 'Plant';
      const gr = groups.get(name) || { name, icon: item?.icon, to: 0, xs: [], ys: [], zs: [] };
      gr.to = Math.max(gr.to, c.to); gr.xs.push(s.x + 0.5); gr.ys.push(y); gr.zs.push(s.z + 0.5);
      groups.set(name, gr);
    }
    const avg = (a) => a.reduce((p, v) => p + v, 0) / a.length;
    [...groups.values()].sort((a, b) => b.to - a.to).slice(0, 3).forEach((gr, i) => {
      this.tag(avg(gr.xs), Math.max(...gr.ys) + 1.0, avg(gr.zs), `${gr.name}: ${STAGE_WORD[gr.to]}`, { icon: gr.icon, delay: i * 0.2 });
    });
    if (groups.size) g.audio.play('harvest_pop', { volume: 0.3, pitch: 1.2 });
  }

  applyHatch(eggs, cl = null) {
    const g = this.game, ui = g.ui;
    // one "+N fry" tag for the whole cluster: no floater per clutch, no corner-fox
    // toast (he's asleep); a new morph is named on the tag instead
    const mute = ui ? ['floatTextAt', 'toast'].filter((k) => !Object.prototype.hasOwnProperty.call(ui, k)) : [];
    for (const k of mute) ui[k] = () => {};
    const born = [];
    try {
      for (const e of eggs) {
        if (e.hatched || !g.fish.eggs.includes(e)) continue;
        if (g.fish.capacity() - g.fish.list.length <= 0) break; // pond full: they wait for room
        e.hatched = true;
        born.push(...g.fish.hatchNow(e));
      }
    } finally { for (const k of mute) delete ui[k]; }
    if (!born.length) return;
    this.tally.fry += born.length;
    const on = g.overnight;
    for (const f of born) on.hatched.push({ speciesId: f.sp.id, name: f.sp.name });
    if (cl) {
      const odd = born.find((f) => f.g?.morph && f.g.morph !== 'normal' && MORPHS[f.g.morph]);
      g.particles.splash(cl.x, cl.z, 8, 0.6);
      this.tag(cl.x, WATER_Y + 0.8, cl.z, `+${born.length} fry`, { icon: 'egg' });
      if (odd) this.tag(cl.x, WATER_Y + 1.25, cl.z, `${MORPHS[odd.g.morph].name} ${odd.sp.name}!`, { icon: 'sparkle', gold: true, delay: 0.3 });
    }
  }

  // ------------------------------------------------------------ the tour
  // shots for game.cutscene.play: Reynard's hut, then each spot, nearest first
  shots() {
    const g = this.game;
    const hut = { x: HUT.x + 1.5, z: HUT.z + 1.5 };
    const pick = this.events.slice().sort((a, b) => a.prio - b.prio).slice(0, MAX_SHOTS);
    if (!pick.length) return [];
    const order = [];
    let at = hut;
    while (pick.length) {
      let bi = 0, bd = Infinity;
      pick.forEach((e, i) => { const d = Math.hypot(e.x - at.x, e.z - at.z) + e.prio * 2; if (d < bd) { bd = d; bi = i; } });
      const e = pick.splice(bi, 1)[0];
      order.push(e); at = e;
    }
    const shots = [{
      at: hut, wupp: 0.05, yaw: 0.9, cut: true, dur: 1.8,
      call: () => {
        for (let i = 0; i < 18; i++) g.particles.firefly(hut.x + (Math.random() - 0.5) * 12, WATER_Y + 0.3 + Math.random() * 1.4, hut.z + (Math.random() - 0.5) * 10);
        g.particles.zzz?.(hut.x, 2.4, hut.z);
        g.audio.play('loon', { volume: 0.3 });
        this.bubble = g.say?.({ getWorldPos: (v) => v.set(hut.x, 2.6, hut.z) }, this.sleepLine(order[0]), { dur: 1.6, size: 's', mood: 'whisper', key: 'nightzz' });
      },
    }];
    order.forEach((e, i) => {
      shots.push({
        at: e.at || { x: e.x, z: e.z }, wupp: e.zoom || 0.024, yaw: i % 2 ? 0.55 : -0.15, dur: SHOT, ease: 'out',
        call: () => this.later(() => this.run(e), SHOT * SPEED * 0.38),
      });
    });
    // a beat on the last spot so its tag can be read
    shots[shots.length - 1].hold = 0.9;
    return shots;
  }

  sleepLine(e) {
    switch (e?.kind) {
      case 'hatch': return 'Zzz... little fins...';
      case 'crop': {
        const c = e.items?.find((x) => x.to === 3) || e.items?.[0];
        const n = FOOD_ITEMS[CROPS[c?.s.type]?.item]?.name;
        return n ? `Zzz... ${n.toLowerCase()}...` : 'Zzz... veggies...';
      }
      case 'grown': return 'Zzz... big fish, big bills...';
      case 'love': return 'Zzz... wedding bells...';
      case 'ready': return 'Zzz... eggs... tap...';
      default: return 'Zzz... coins...';
    }
  }

  run(e) {
    if (e.done) return;
    e.done = true;
    if (!this.quiet) this.fadeTags(); // the previous spot's labels make way
    try { e.apply(); } catch (err) { console.warn('night event', err); }
  }

  later(fn, s) { this.timers.push(setTimeout(fn, s * 1000)); }

  async play() {
    const g = this.game;
    const shots = this.shots();
    try {
      if (shots.length) await g.cutscene.play({ shots });
    } finally {
      this.finish();
    }
  }

  // everything the tour didn't get to (or skipped past) happens now
  finish() {
    for (const t of this.timers.splice(0)) clearTimeout(t);
    const prevQuiet = this.quiet;
    this.quiet = true;
    for (const e of this.events) this.run(e);
    if (this.leftoverEggs?.length) this.applyHatch(this.leftoverEggs);
    this.leftoverEggs = null;
    this.quiet = prevQuiet;
    try { this.bubble?.close?.(); } catch { /* already gone */ }
    this.bubble = null;
    this.fadeTags(); // the tour is over
  }

  fadeTags() { for (const t of this.tags) t.life = Math.min(t.life, Math.max(0, t.t) + 0.3); }

  // ------------------------------------------------------------ tags (pixel labels over the world)
  ensureLayer() {
    if (this.layer && this.layer.isConnected) return this.layer;
    const el = document.createElement('div');
    el.className = 'nt-layer';
    document.body.appendChild(el);
    this.layer = el;
    return el;
  }

  icon(name) {
    if (!name || !hasSprite(name)) return null;
    try {
      const src = spriteCanvas(name, 1);
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      return c;
    } catch { return null; }
  }

  tag(x, y, z, text, { icon = null, follow = null, life = 2.4, delay = 0, gold = false } = {}) {
    if (this.quiet) return; // skipped: no labels for things nobody is looking at
    const el = document.createElement('div');
    el.className = 'nt-tag' + (gold ? ' gold' : '');
    if (delay) el.style.animationDelay = `${delay}s`;
    const ic = this.icon(icon);
    if (ic) el.appendChild(ic);
    const b = document.createElement('b');
    b.textContent = text;
    el.appendChild(b);
    this.ensureLayer().appendChild(el);
    this.tags.push({ el, x, y, z, follow, t: -delay, life, out: false });
    this.loop();
  }

  loop() {
    if (this.raf) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const g = this.game;
      const placed = []; // labels side by side stack up instead of overlapping
      for (const t of this.tags) {
        t.t += dt;
        if (t.follow) { t.x = t.follow.x; t.z = t.follow.z; }
        const p = g.rig.worldToScreen(_v.set(t.x, t.y, t.z), g.renderer);
        const w = (t.w ||= t.el.offsetWidth || 100), h = (t.h ||= t.el.offsetHeight || 24);
        let y = p.y - Math.min(1, Math.max(0, t.t)) * 10;
        for (let k = 0; k < 6; k++) {
          const hit = placed.find((r) => Math.abs(r.x - p.x) < (r.w + w) / 2 + 2 && y > r.y - r.h - 2 && y - h < r.y + 2);
          if (!hit) break;
          y = hit.y - hit.h - 3;
        }
        if (!t.out) placed.push({ x: p.x, y, w, h });
        t.el.style.left = `${Math.round(p.x)}px`;
        t.el.style.top = `${Math.round(y)}px`;
        t.el.style.visibility = p.visible ? '' : 'hidden';
      }
      for (let i = this.tags.length - 1; i >= 0; i--) {
        const t = this.tags[i];
        if (!t.out && t.t > t.life) { t.out = true; t.el.classList.add('out'); }
        if (t.t > t.life + 0.35) { t.el.remove(); this.tags.splice(i, 1); }
      }
      if (this.tags.length) this.raf = requestAnimationFrame(step);
      else this.raf = 0;
    };
    this.raf = requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ sunrise tally
  tallyItems() {
    const T = this.tally;
    if (!T) return [];
    const out = [];
    if (T.fry) out.push({ icon: 'egg', text: `${plural(T.fry, 'egg')} hatched` });
    if (T.ripe) out.push({ icon: 'harvest', text: `${plural(T.ripe, 'crop')} ripe` });
    if (T.grown) out.push({ icon: 'fish', text: `${T.grown} fry grown` });
    if (T.ready) out.push({ icon: 'egg', text: `${plural(T.ready, 'egg')} to tap` });
    if (T.clutches) out.push({ icon: 'heart', text: plural(T.clutches, 'new clutch', 'new clutches') });
    if (T.produce) out.push({ icon: T.produce.icon, text: `+${T.produce.n} ${T.produce.name.toLowerCase()}` });
    return out.slice(0, 3);
  }

  showTally() {
    const items = this.tallyItems();
    this.tally = null;
    if (!items.length) return null;
    document.querySelector('.nt-tally')?.remove();
    const el = document.createElement('div');
    el.className = 'nt-tally';
    items.forEach((it, i) => {
      if (i) { const d = document.createElement('i'); d.textContent = '·'; el.appendChild(d); }
      const s = document.createElement('span');
      const ic = this.icon(it.icon);
      if (ic) s.appendChild(ic);
      s.appendChild(document.createTextNode(it.text));
      el.appendChild(s);
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
    return el;
  }
}
