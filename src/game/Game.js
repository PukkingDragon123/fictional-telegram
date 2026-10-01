// The Game: owns every system, the clock and the day cycle, the economy,
// reviews/rating, research, player actions, the egg tray, the daily ledger
// and saving.
//
// Day cycle:  day (9 AM work day, lunch break 12-13)
//   -> rush (5 PM: cinematic feast, bears eat)
//   -> evening (sun sets while the last bears leave)
//   -> report (the daily ledger + grade)
//   -> bedtime (Reynard walks home and falls asleep)
//   -> night (the night flies by; ponds keep producing, eggs hatch)
//   -> dawn (sunrise + the "while you slept" summary) -> next day
import * as THREE from 'three';
import { PixelRenderer } from '../core/pixelRenderer.js';
import { CameraRig } from '../core/cameraRig.js';
import { World } from '../world/world.js';
import { Sky } from '../world/sky.js';
import { KIND, WATER_Y } from '../world/grid.js';
import { refreshWaterHeights, MEADOW, HUT } from '../world/worldgen.js';
import { Particles } from './Particles.js';
import { updateSpriteUniforms } from '../core/spriteBatch.js';
import { FishSystem, GROW_TIME } from './FishSystem.js';
import { FoodSystem } from './FoodSystem.js';
import { StructureSystem } from './StructureSystem.js';
import { BearSystem } from './BearSystem.js';
import { BeaverSystem } from './BeaverSystem.js';
import { Fox, Ambient } from './Ambient.js';
import audio from './audioProxy.js';
import { SPECIES, SPECIES_BY_ID, MORPHS } from '../data/species.js';
import { STRUCTURES, CHARM_CAP } from '../data/structures.js';
import { RESEARCH, RESEARCH_BY_ID, computeMods } from '../data/research.js';
import { WEEKDAYS } from '../data/bears.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { clamp } from '../core/rng.js';
import { rollGenes, rarityOf, hatchCard, valueMult } from './genes.js';

const SAVE_KEY = 'tbme.save.v2';
const LEGACY_KEY = 'tbme.legacy.v1';
export const RUSH_HOUR = 17;
export const LUNCH = [12, 13];
const EGG_TIMES = [10, 16, 26, 38, 55]; // seconds to hatch by rarity

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

let eggUid = 1;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new PixelRenderer(canvas);
    this.rig = new CameraRig();
    this.scene = new THREE.Scene();
    this.audio = audio;
    this.listeners = {};
    this.sky = new Sky(this.scene);
    this.world = new World(this.scene);
    this.grid = this.world.grid;
    this.particles = new Particles(this.scene);
    this.particles.groundAt = (x, z) => this.grid.surfaceY(Math.floor(x), Math.floor(z));
    this.particles.sim = this.world.sim;
    this.legacy = this.loadLegacy();
    this.state = this.freshState();
    this.stats = this.freshStats();
    this.mods = computeMods([], this.legacy.tails);
    this.structures = new StructureSystem(this);
    this.food = new FoodSystem(this);
    this.fish = new FishSystem(this);
    this.beavers = new BeaverSystem(this);
    this.bears = new BearSystem(this);
    this.world.sim.blocked = (x, z) => {
      const s = this.structures.structureAtTile(x, z);
      return !!(s && s.built && s.def.blocksFish && !(s.def.gate && s.open));
    };
    this.fox = new Fox(this);
    this.ambient = new Ambient(this);
    this.ui = null;
    this.cine = null; // cinematic director (set by main)
    this.tool = { kind: 'feed' };
    this.foodBag = { count: 12, max: 12, t: 0 };
    this.wave = null;
    this.time = 0;
    this.saveT = 0;
    this.transition = null;
    this.timeScale = 1; // cinematic slow-mo
    this.inputLocked = false;
    this.wind = 1;
    this.rig.setBounds({ minX: MEADOW.x0 + 2, maxX: MEADOW.x1 - 2, minZ: 9, maxZ: MEADOW.z1 - 2 });
    this.rig.lookAt(29, 36, true);
    this.running = false;
    this.started = false;
    this.grid.computeRegions();
  }

  // ------------------------------------------------------------ events
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { for (const fn of this.listeners[ev] || []) fn(data); }

  freshState() {
    return {
      coins: 60, day: 1, hour: 9, phase: 'day', rating: 3.0, reviews: [], research: [], discovered: ['bluegill'], morphsSeen: [],
      speed: 1, paused: false, tutorial: 0, tips: {}, totalEarned: 0, bestRating: 3, digCount: 0, gameOver: false, achievements: [],
      eggTray: [], bestNet: 0, grades: [],
    };
  }

  freshStats() {
    return { fishEaten: 0, hatched: 0, courtships: 0, cannonballs: 0, smashed: 0, bugsEaten: 0, bearsServed: 0, rampages: 0, fishBought: 0, coinsEarned: 0, eggsHatched: 0, snacksServed: 0 };
  }

  resetDayStats() {
    this.day = {
      coins: 0, served: 0, happy: 0, rampages: 0, eaten: this.stats.fishEaten, hatched: this.stats.hatched, reviews: [], ratingStart: this.state.rating, discoveries: [],
      income: { bills: 0, tips: 0, snacks: 0, trophies: 0, refunds: 0 }, expense: { eggs: 0, builds: 0, research: 0, digging: 0, clearing: 0 }, stars: [], smashed: 0, golden: 0,
    };
  }

  // ------------------------------------------------------------ setup
  newGame() {
    safeDel(SAVE_KEY);
    this.state = this.freshState();
    this.stats = this.freshStats();
    this.mods = computeMods([], this.legacy.tails);
    this.bears.clear();
    this.beavers.clear();
    for (const s of [...this.structures.list]) this.structures.remove(s, { silent: true });
    for (const f of [...this.fish.list]) this.fish.remove(f);
    this.fish.eggs.length = 0;
    this.fish.bones.length = 0;
    this.food.pellets.length = 0;
    this.grid.computeRegions();
    const starts = [[24, 33], [30, 35]];
    for (const [x, z] of starts) if (this.grid.isWater(x, z)) this.structures.place('seaweed', x, z, { instant: true, free: true });
    const shore = this.shoreTiles();
    const cat = shore.filter(([x, z]) => z > 33).slice(0, 2);
    for (const [x, z] of cat) this.structures.place('cattail', x, z, { instant: true, free: true });
    // a breeding pair to start with: Bonnie & Clyde
    for (const [sex, name] of [['M', 'Clyde'], ['F', 'Bonnie']]) {
      const p = this.fish.randomWaterPoint();
      if (!p) continue;
      const g = rollGenes('bluegill', this.mods, { sex });
      g.traits = []; g.morph = 'normal'; g.size = 1; g.stars = 1;
      const f = this.fish.spawn('bluegill', p.x, p.z, { adult: true, hunger: 0.3, g });
      if (f) { f.name = name; f.loveT = 6 + Math.random() * 4; }
    }
    this.onTopologyChanged();
    this.startDay(true);
    this.started = true;
    this.save();
  }

  shoreTiles() {
    const g = this.grid;
    const out = [];
    for (let z = MEADOW.z0; z < MEADOW.z1; z++)
      for (let x = MEADOW.x0; x < MEADOW.x1; x++)
        if (!g.isWater(x, z) && g.hasWaterNeighbor(x, z) && g.deco[z * g.w + x] < 0 && g.occ[z * g.w + x] === -1) out.push([x, z]);
    return out.sort(() => Math.random() - 0.5);
  }

  // ------------------------------------------------------------ helpers
  speciesById(id) { return SPECIES_BY_ID[id]; }
  speciesCount() { return SPECIES.length; }

  checkAchievements() {
    const st = this.state;
    for (const a of ACHIEVEMENTS) {
      if (st.achievements.includes(a.id)) continue;
      let ok = false;
      try { ok = a.test(this); } catch { ok = false; }
      if (!ok) continue;
      st.achievements.push(a.id);
      st.coins += a.reward;
      if (this.day) this.day.income.trophies += a.reward;
      this.emit('coins', { delta: a.reward });
      this.audio.play('levelup', { volume: 0.5 });
      this.ui?.toast(`TROPHY: <b>${a.name}</b> +${a.reward} coins`, 'gold');
      this.ui?.foxMood('laugh', 1.5);
      break;
    }
  }

  isUnlocked(rid) { return !rid || rid === 'start' || this.state.research.includes(rid); }
  isStructureUnlocked(type) { const d = STRUCTURES[type]; return d && this.isUnlocked(d.unlock); }
  speciesUnlocked(id) {
    const sp = SPECIES_BY_ID[id];
    if (!sp) return false;
    if (sp.unlock === 'hybrid') return this.state.discovered.includes(id);
    return this.isUnlocked(sp.unlock);
  }
  availableSpecies() {
    const have = new Set(this.fish.list.map((f) => f.sp.id));
    return SPECIES.filter((s) => this.speciesUnlocked(s.id) || have.has(s.id)).map((s) => s.id);
  }
  speciesPrice(id) {
    const sp = SPECIES_BY_ID[id];
    if (sp.unlock === 'hybrid') return Math.round(sp.meal * sp.value * 26);
    return sp.price;
  }
  mysteryPrice() { return Math.round(28 + Math.min(40, this.state.day * 3)); }
  digCost() { return Math.round((12 + this.state.digCount * 1.6) * this.mods.digMult); }
  weekday(day = this.state.day) { return WEEKDAYS[(day - 1) % 7]; }
  isDayOff(day = this.state.day) { return (day - 1) % 7 === 6; }
  dayLength() {
    if (this.isDayOff()) return 90;
    const d = this.state.day;
    return d === 1 ? 210 : d <= 3 ? 190 : 170;
  }
  secondsToRush() {
    if (this.state.phase !== 'day') return 0;
    return ((RUSH_HOUR - this.state.hour) / (8 / this.dayLength()));
  }
  tagLimit() { return 1 + this.mods.tagBonus; }
  tagsUsed() { let n = 0; for (const f of this.fish.list) if (f.tagged) n++; return n; }

  // beauty -> bigger bills and more customers
  beauty() {
    let b = 0;
    for (const s of this.structures.list) if (s.built && s.def.beauty) b += s.def.beauty;
    for (const f of this.fish.list) if (f.g.traits.includes('sparkly')) b += 1;
    if (this.fish.list.some((f) => f.sp.id === 'grayling')) b += 2;
    return Math.round(b * this.mods.beautyMult * 10) / 10;
  }
  charmPct() { return Math.min(CHARM_CAP, Math.floor(this.beauty() * 1.5)); }

  canAfford(c) { return this.state.coins >= c; }
  spend(c, kind = null) {
    if (this.state.coins < c) { this.audio.play('error', { volume: 0.5 }); this.ui?.toast('Not enough coins!', 'bad'); return false; }
    this.state.coins -= c;
    if (kind && this.day) this.day.expense[kind] = (this.day.expense[kind] || 0) + c;
    this.emit('coins', { delta: -c });
    return true;
  }

  earn(amount, bear, parts = null) {
    if (amount <= 0) return;
    this.state.coins += amount;
    this.state.totalEarned += amount;
    this.stats.coinsEarned += amount;
    if (this.day) {
      this.day.coins += amount;
      const inc = this.day.income;
      if (parts) { inc.bills += parts.bills; inc.tips += parts.tips; inc.snacks += parts.snacks; }
      else inc.bills += amount;
    }
    this.particles.coins(bear.x, bear.y + 1.6 * bear.def.scale, bear.z, Math.min(18, 4 + Math.floor(amount / 4)));
    this.audio.play('coins', { volume: 0.55 });
    this.ui?.flyCoins(bear, amount);
    this.fox.react('cheer', 1.4);
    this.emit('coins', { delta: amount });
  }

  // ------------------------------------------------------------ phases
  startDay(first = false) {
    const st = this.state;
    st.phase = 'day';
    st.hour = 9;
    this.resetDayStats();
    this.wave = this.bears.planWave(st.day);
    this.lunch = this.bears.planLunch(st.day);
    this.lunchDone = false;
    this.warned = {};
    this.audio.setMusic(first ? 'day' : 'morning');
    if (!first) { this.audio.play('day_start', { volume: 0.4 }); setTimeout(() => { if (this.state.phase === 'day') this.audio.setMusic('day'); }, 45000); }
    this.emit('day', { day: st.day });
    this.ui?.onDayStart(this.wave);
    this.save();
  }

  startRush() {
    const st = this.state;
    st.hour = RUSH_HOUR;
    if (this.wave.dayOff || !this.wave.bears.length) { this.startEvening(); return; }
    st.phase = 'rush';
    this.setTool({ kind: 'feed' });
    this.bears.startWave(this.wave);
    this.ambient.onRushStart();
    this.audio.play('offwork', { volume: 0.8 });
    this.audio.play('whistle', { volume: 0.7 });
    setTimeout(() => this.audio.setMusic('feast'), 900);
    this.ui?.onRushStart(this.wave);
    this.fox.react('greedy', 3);
    this.cine?.startFeast(this.wave);
    this.emit('rush');
  }

  ringBell() {
    if (this.state.phase !== 'day' || this.transition || this.isDayOff()) return;
    this.audio.play('bell', { volume: 0.6 });
    this.startRush();
  }

  onWaveComplete() {
    if (this.state.phase === 'rush') this.startEvening();
  }

  startEvening() {
    this.state.phase = 'evening';
    this.transition = { kind: 'evening', from: this.state.hour, to: Math.max(this.state.hour, 19.4), t: 0, dur: 3.5 };
  }

  // the ledger for the day
  buildReport() {
    const st = this.state;
    const d = this.day;
    const inc = d.income, exp = d.expense;
    const lines = [];
    const add = (label, amount, icon, kind) => { if (amount) lines.push({ label, amount: Math.round(amount), icon, kind }); };
    add('Fish dinners billed', inc.bills, 'fish', 'income');
    add('Snack bar (berries, honey...)', inc.snacks, 'berry', 'income');
    add('Tips from happy bears', inc.tips, 'coins', 'income');
    add('Trophy prizes', inc.trophies, 'trophy', 'income');
    add('Refunds (demolition)', inc.refunds, 'trash', 'income');
    add('Fish eggs bought', -exp.eggs, 'egg', 'expense');
    add('Construction', -exp.builds, 'hammer', 'expense');
    add('Research & development', -exp.research, 'flask', 'expense');
    add('Digging the pond', -exp.digging, 'shovel', 'expense');
    add('Land clearing', -exp.clearing, 'trash', 'expense');
    const income = inc.bills + inc.snacks + inc.tips + inc.trophies + inc.refunds;
    const expense = exp.eggs + exp.builds + exp.research + exp.digging + exp.clearing;
    const net = Math.round(income - expense);
    const eaten = this.stats.fishEaten - d.eaten;
    const born = this.stats.hatched - d.hatched;
    const avgStars = d.stars.length ? d.stars.reduce((a, b) => a + b, 0) / d.stars.length : 0;
    if (!lines.length) lines.push({ label: 'A quiet day at the pond', amount: 0, icon: 'fish', kind: 'note' });
    let score = 0;
    if (this.isDayOff()) score = 2.5 + (born > 0 ? 0.6 : 0) + (expense > 0 ? 0.3 : 0);
    else if (d.served) score = avgStars * 0.75 - d.rampages * 0.6 + Math.min(1.2, income / Math.max(40, 30 + st.day * 20)) + (d.golden ? 0.3 : 0);
    else score = 1;
    const grade = score >= 4.4 ? 'A+' : score >= 3.7 ? 'A' : score >= 2.9 ? 'B' : score >= 2.1 ? 'C' : score >= 1.3 ? 'D' : 'F';
    const stickers = [];
    if (d.served && d.rampages === 0) stickers.push({ id: 'sticker_paw', caption: 'No rampages!' });
    if (d.discoveries.length) stickers.push({ id: 'sticker_fish', caption: 'New species!' });
    if (net > st.bestNet && net > 0) { stickers.push({ id: 'sticker_crown', caption: 'Record profit!' }); st.bestNet = net; }
    if (d.happy >= 3) stickers.push({ id: 'sticker_heart', caption: `${d.happy} happy bears` });
    if (born >= 4) stickers.push({ id: 'sticker_egg', caption: `${born} fry born` });
    if (d.golden) stickers.push({ id: 'sticker_star', caption: 'Golden fish served!' });
    if (grade === 'A+') stickers.push({ id: 'sticker_wow', caption: 'Top marks!' });
    if (this.isDayOff()) stickers.push({ id: 'sticker_coffee', caption: 'Day off!' });
    const comments = {
      'A+': ['Magnificent. Profitable. Me.', 'I should give myself a raise.', 'Mwahaha! The bears LOVE me!'],
      A: ['A fine day of legal fish crimes.', 'Very good. Keep them hungry.', 'Excellent work, partner.'],
      B: ['Not bad. Not great. Heh.', 'Solid. But I want MORE.', 'Decent haul. We can do better.'],
      C: ['Mediocre. I hate mediocre.', 'The bears were... fine. Ugh.', 'We need more fish, pronto.'],
      D: ['That was embarrassing.', 'The reviews... I can\'t look.', 'Tomorrow we fix this. Right?'],
      F: ['DISASTER! Where were the fish?!', 'I\'m going to cry into my money. What\'s left of it.', 'We are one review from ruin!'],
    };
    const c = comments[grade];
    st.grades.push(grade);
    if (st.grades.length > 60) st.grades.shift();
    return {
      day: st.day, weekday: this.weekday(), dayOff: this.isDayOff(), lines, net, served: d.served, happy: d.happy, rampages: d.rampages,
      fishEaten: eaten, fishBorn: born, avgStars: Math.round(avgStars * 10) / 10, ratingBefore: Math.round(d.ratingStart * 10) / 10, ratingAfter: Math.round(st.rating * 10) / 10,
      grade, stickers: stickers.slice(0, 4), comment: c[Math.floor(Math.random() * c.length)], reviews: d.reviews.slice(0, 6), discoveries: d.discoveries,
      fish: this.fish.count, capacity: this.fish.capacity(), coins: d.coins,
    };
  }

  startReport() {
    const st = this.state;
    st.phase = 'report';
    this.audio.setMusic('sheet');
    this.audio.play('day_end', { volume: 0.4 });
    if (st.rating < 1.0 && !this.isDayOff()) { this.gameOver(); return; }
    const report = this.buildReport();
    if (st.rating < 1.8) this.audio.play('warning', { volume: 0.5 });
    this.save();
    const done = () => this.startBedtime();
    if (this.ui?.showReport) this.ui.showReport(report, done);
    else done();
  }

  startBedtime() {
    const st = this.state;
    if (st.phase !== 'report') return;
    st.phase = 'bedtime';
    this.audio.setMusic('sleep');
    this.bedT = 0;
    this.fox.goToBed?.();
    this.ui?.onBedtime?.();
  }

  startNight() {
    const st = this.state;
    if (st.phase !== 'bedtime') return;
    st.phase = 'night';
    this.overnight = { produced: {}, hatched: [], grew: 0, t: 0 };
    this.transition = { kind: 'night', from: st.hour, to: 24 + 6, t: 0, dur: 7 };
    this.audio.play('sleep', { volume: 0.4 });
  }

  // skip the rest of the night quickly (tap)
  hurryNight() {
    if (this.transition && this.transition.kind === 'night') this.transition.dur = Math.min(this.transition.dur, this.transition.t + 1.2);
  }

  // the pond keeps living while Reynard sleeps (~2 minutes of pond time)
  simulateOvernight(T = 120) {
    const on = this.overnight;
    const mods = this.mods;
    for (const s of this.structures.list) {
      if (!s.built || !s.def.food) continue;
      const before = s.stock;
      s.stock = Math.min(s.def.food.max, s.stock + s.def.food.regen * mods.produceMult * T * (this.structures.sprinklerBoost?.(s) || 1));
      const gain = Math.floor(s.stock) - Math.floor(before);
      if (gain > 0) on.produced[s.def.food.kind] = (on.produced[s.def.food.kind] || 0) + gain;
      this.structures.updateVisual(s);
    }
    // night breeding: well-fed couples lay a clutch
    const fish = this.fish;
    const room = () => fish.capacity() - fish.population();
    const singles = fish.list.filter((f) => f.adult && f.hunger < 0.6);
    const used = new Set();
    for (const a of singles) {
      if (used.has(a) || room() <= 1) continue;
      const b = singles.find((o) => o !== a && !used.has(o) && o.region === a.region && fish.compatible(a, o));
      if (!b || Math.random() > 0.55) continue;
      used.add(a); used.add(b);
      fish.mate(a, b);
    }
    // eggs in the pond hatch, fry grow
    const before = new Set(fish.list);
    for (let i = fish.eggs.length - 1; i >= 0; i--) { const e = fish.eggs.splice(i, 1)[0]; fish.hatch(e); }
    for (const f of fish.list) {
      if (!before.has(f)) on.hatched.push({ speciesId: f.sp.id, morph: f.g.morph, rarity: rarityOf(f.g.stars), name: f.sp.name });
      if (!f.adult) {
        f.age += T * f.sp.growth * mods.growthMult * 0.6;
        if (f.age >= GROW_TIME) { f.adult = true; on.grew++; }
      }
      f.hunger = Math.max(0.15, f.hunger - 0.1);
    }
    for (const e of this.state.eggTray) e.t = Math.max(0, e.t - T);
    this.foodBag.count = this.foodBag.max;
  }

  startDawn() {
    const st = this.state;
    st.phase = 'dawn';
    st.day++;
    this.transition = { kind: 'dawn', from: 6, to: 9, t: 0, dur: 3.2 };
    this.audio.play('sunrise', { volume: 0.5 });
    this.fox.wakeUp?.();
  }

  finishDawn() {
    const on = this.overnight || { produced: {}, hatched: [], grew: 0 };
    const icons = { seaweed: 'seaweed', honey: 'honey', syrup: 'syrup', berries: 'berry', rice: 'wildrice', mushroom: 'mushroom' };
    const names = { seaweed: 'Seaweed', honey: 'Honey', syrup: 'Maple syrup', berries: 'Blueberries', rice: 'Wild rice', mushroom: 'Chanterelles' };
    const data = {
      day: this.state.day, weekday: this.weekday(),
      produced: Object.entries(on.produced).map(([k, n]) => ({ icon: icons[k] || 'sparkle', label: names[k] || k, amount: n })),
      hatched: on.hatched.slice(0, 12), grew: on.grew,
      quote: this.morningQuote(),
    };
    this.state.phase = 'morning';
    const go = () => this.startDay();
    if (this.ui?.showOvernight) this.ui.showOvernight(data, go);
    else go();
  }

  morningQuote() {
    const q = [
      'Rise and shine! Another day, another dollar. Several dollars. All mine.',
      'I dreamt the bears paid in gold bars. A fox can dream.',
      'Coffee. Then fish. Then more fish. Then money.',
      'The early fox gets the... fish. Wait, that\'s not how it goes.',
      'Today\'s plan: breed fish, feed bears, count coins. Mwahaha.',
      'Somebody left a bad review at 3 AM. Bears never sleep, apparently.',
      'Remember: happy bears tip. Hungry bears smash. Choose wisely.',
      'Plant berries. Bears love a side dish, and it saves our fish!',
    ];
    if (this.isDayOff()) return 'Sunday! The bears stay home. Let\'s breed some fish in peace.';
    if (this.state.rating < 2) return 'Our rating is in the dumpster. Today we win them back, partner.';
    return q[Math.floor(Math.random() * q.length)];
  }

  gameOver() {
    const st = this.state;
    st.gameOver = true;
    st.phase = 'gameover';
    const tails = Math.floor(Math.sqrt(st.totalEarned / 400));
    const gained = Math.max(0, tails - this.legacy.tails);
    this.legacy.tails = Math.max(this.legacy.tails, tails);
    this.legacy.best = Math.max(this.legacy.best || 0, st.day);
    this.saveLegacy();
    safeDel(SAVE_KEY);
    this.audio.setMusic(null);
    this.audio.play('gameover', { volume: 0.6 });
    this.ui?.showGameOver({ day: st.day, earned: st.totalEarned, stats: this.stats, tails: this.legacy.tails, gained });
  }

  retire() {
    const st = this.state;
    const tails = Math.floor(Math.sqrt(st.totalEarned / 400)) + 3;
    const gained = Math.max(0, tails - this.legacy.tails);
    this.legacy.tails = Math.max(this.legacy.tails, tails);
    this.legacy.best = Math.max(this.legacy.best || 0, st.day);
    this.legacy.retired = (this.legacy.retired || 0) + 1;
    this.saveLegacy();
    safeDel(SAVE_KEY);
    this.audio.play('fanfare', { volume: 0.6 });
    this.ui?.showGameOver({ day: st.day, earned: st.totalEarned, stats: this.stats, tails: this.legacy.tails, gained, retired: true });
    st.phase = 'gameover';
  }

  // ------------------------------------------------------------ callbacks
  onTopologyChanged() {
    this.world.sim.refreshMask();
    this.grid.computeRegions();
    this.grid.version++;
    this.fish.onTopologyChanged();
    for (const p of this.food.pellets) p.region = this.grid.regionAt(p.x, p.z);
  }

  onFishBorn(sp, egg, born = []) {
    const st = this.state;
    for (const f of born) {
      const key = `${f.sp.id}:${f.g.morph}`;
      if (f.g.morph !== 'normal' && !st.morphsSeen.includes(key)) {
        st.morphsSeen.push(key);
        this.ui?.toast(`A <b>${MORPHS[f.g.morph].name}</b> ${f.sp.name} hatched!`, 'gold');
        this.particles.sparkle(f.x, 0.3, f.z, 12, 0xfff2a0);
      }
    }
    if (!st.discovered.includes(sp.id)) {
      st.discovered.push(sp.id);
      if (this.day) this.day.discoveries.push(sp.id);
      this.audio.play('discover', { volume: 0.7 });
      this.particles.confetti(egg.x, 0.5, egg.z, 50);
      this.fox.react('cheer', 2.5);
      const f = born[0];
      if (f && this.ui?.showDiscovery) this.ui.showDiscovery(sp, f);
      this.save();
    }
  }

  onRampage(b) {
    const st = this.state;
    this.stats.rampages++;
    if (this.day) this.day.rampages++;
    this.fox.react('panic', 3);
    this.ui?.onRampage(b);
    this.cine?.onRampage?.(b);
    if (!st.tips.rampage) { st.tips.rampage = 1; this.ui?.foxSay('RAMPAGE! Hungry bears smash things. Plant berries as side dishes, research Beaver Dams to protect a nursery... and always keep enough fish around!', 'shocked'); }
  }

  addReview(r, b) {
    const st = this.state;
    st.reviews.unshift(r);
    if (st.reviews.length > 60) st.reviews.length = 60;
    let alpha = Math.min(0.5, 0.11 * (r.weight || 1));
    if (r.stars <= 2) alpha *= this.mods.badReviewMult;
    st.rating = clamp(st.rating * (1 - alpha) + r.stars * alpha, 0, 5);
    st.bestRating = Math.max(st.bestRating, st.rating);
    if (this.day) {
      this.day.reviews.unshift(r);
      this.day.served++;
      this.day.stars.push(r.stars);
      if (r.stars >= 4) this.day.happy++;
    }
    this.stats.bearsServed++;
    this.audio.play(r.stars >= 4 ? 'review_good' : r.stars <= 1 ? 'review_bad' : 'coin', { volume: r.stars >= 4 ? 0.35 : 0.4 });
    this.ui?.showReviewBubble(b, r);
    this.emit('review', r);
  }

  onStructureBuilt(s) {
    this.particles.popIn(s.x + 0.5, this.structures.baseY(s), s.z + 0.5, 1);
    this.particles.word('built', s.x + 0.5, this.structures.baseY(s) + 1.3, s.z + 0.5, { size: 0.28 });
    this.audio.play('pop_in', { volume: 0.5 });
  }

  // ------------------------------------------------------------ eggs
  eggSlots() { return 2 + this.mods.eggSlots + this.structures.countBuilt('hatchery'); }
  hatchSpeed() { return this.mods.hatchSpeed * (1 + Math.min(0.9, this.structures.countBuilt('hatchery') * 0.3)); }

  // Buy an egg: it goes into the egg tray and hatches (with a ceremony) later.
  buyEgg(id, { mystery = false } = {}) {
    const st = this.state;
    if (st.eggTray.length >= this.eggSlots()) { this.audio.play('error', { volume: 0.5 }); this.ui?.toast('Your egg tray is full! Hatch an egg first.', 'bad'); return false; }
    let species = id;
    const price = mystery ? this.mysteryPrice() : this.speciesPrice(id);
    if (!mystery && !this.speciesUnlocked(id)) return false;
    if (!this.spend(price, 'eggs')) return false;
    let luck = 1;
    if (mystery) {
      const pool = this.availableSpecies();
      const w = pool.map((s) => 1 / (1 + SPECIES_BY_ID[s].tier * 1.4));
      let x = Math.random() * w.reduce((a, b) => a + b, 0);
      species = pool[0];
      for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { species = pool[i]; break; } }
      luck = 1.8;
    }
    const g = rollGenes(species, this.mods, { luck });
    const rarity = rarityOf(g.stars);
    const t = EGG_TIMES[rarity] / this.hatchSpeed();
    st.eggTray.push({ uid: eggUid++, species, g, rarity, t, total: t, mystery });
    this.stats.fishBought++;
    this.audio.play('buy', { volume: 0.5 });
    this.audio.play('egg_wobble', { volume: 0.4 });
    this.ui?.onEggBought?.(st.eggTray[st.eggTray.length - 1]);
    if (!st.tips.egg) { st.tips.egg = 1; this.ui?.foxSay('Fish come as <b>eggs</b> now! They incubate in the <b>egg tray</b>. When one is ready, <b>tap it to hatch</b> and see what genes you got.', 'wink'); }
    return true;
  }

  eggReady(e) { return e.t <= 0; }

  // Called by the UI when the player opens a ready egg. Returns the card data;
  // the fish is released by releaseEgg() after the ceremony.
  openEgg(uid) {
    const st = this.state;
    const e = st.eggTray.find((x) => x.uid === uid);
    if (!e || e.t > 0) return null;
    const sp = SPECIES_BY_ID[e.species];
    const isNewSpecies = !st.discovered.includes(e.species);
    const mk = `${e.species}:${e.g.morph}`;
    const isNewMorph = e.g.morph !== 'normal' && !st.morphsSeen.includes(mk);
    return { egg: e, card: hatchCard(e.species, e.g, { isNewSpecies, isNewMorph, value: Math.round(sp.meal * sp.value * valueMult(e.g) * 7) }) };
  }

  releaseEgg(uid) {
    const st = this.state;
    const i = st.eggTray.findIndex((x) => x.uid === uid);
    if (i < 0) return null;
    const e = st.eggTray.splice(i, 1)[0];
    const p = this.releasePoint();
    if (!p) return null;
    const f = this.fish.spawn(e.species, p.x, p.z, { adult: false, splash: true, hunger: 0.25, g: e.g });
    if (f) {
      f.age = GROW_TIME * 0.45;
      if (!st.discovered.includes(e.species)) { st.discovered.push(e.species); this.day?.discoveries.push(e.species); }
      const mk = `${e.species}:${e.g.morph}`;
      if (e.g.morph !== 'normal' && !st.morphsSeen.includes(mk)) st.morphsSeen.push(mk);
      this.particles.sparkle(p.x, 0.4, p.z, 10, 0xfff2a0);
      this.stats.eggsHatched++;
      this.rig.lookAt(p.x, p.z);
    }
    this.save();
    return f;
  }

  updateEggs(dt) {
    let ready = 0;
    for (const e of this.state.eggTray) {
      const was = e.t;
      if (e.t > 0) e.t = Math.max(0, e.t - dt);
      if (was > 0 && e.t <= 0) { ready++; this.audio.play('egg_crack', { volume: 0.4, pitch: 1.3 }); }
    }
    if (ready) this.ui?.onEggReady?.();
  }

  // ------------------------------------------------------------ actions
  setTool(tool) {
    this.tool = tool || { kind: 'feed' };
    this.emit('tool', this.tool);
  }

  feedAt(x, z) {
    const bag = this.foodBag;
    if (bag.count < 1) { this.audio.play('error', { volume: 0.3 }); this.ui?.toast('Food bag empty, it refills over time', 'bad'); return; }
    bag.count -= 1;
    this.fox.goToward(x, z);
    const h = this.fox.handPos();
    this.fox.react('throw', 0.4);
    this.food.throwHandful(h.x, h.y, h.z, x, z, 6, 0.6);
    this.audio.play('click', { volume: 0.25, pitch: 1.4 });
    if (this.state.tutorial === 1) this.advanceTutorial();
  }

  // --- fish tools
  tagFish(f) {
    if (!f || f.dead) return false;
    if (f.tagged) {
      f.tagged = false;
      this.audio.play('tag', { volume: 0.4, pitch: 0.8 });
      this.ui?.floatTextAt(f.x, 0.5, f.z, 'Untagged', '#ffe0d0');
      return true;
    }
    if (this.tagsUsed() >= this.tagLimit()) {
      this.audio.play('error', { volume: 0.4 });
      this.ui?.toast(`All ${this.tagLimit()} "DO NOT EAT" tags are in use. Research the Label Maker for more.`, 'bad');
      return false;
    }
    f.tagged = true;
    this.audio.play('tag', { volume: 0.5 });
    this.particles.sparkle(f.x, 0.3, f.z, 5, 0xff8a7a);
    this.ui?.floatTextAt(f.x, 0.5, f.z, 'DO NOT EAT!', '#ff9a8a');
    return true;
  }

  nurtureFish(f) {
    if (!f || f.dead) return false;
    const now = this.time;
    if (f.petT && now - f.petT < 0.35) return false;
    f.petT = now;
    const was = f.love;
    f.love = Math.min(1, f.love + 0.2 * (1 + (this.mods.nurtureMult - 1) * 0.5));
    f.hunger = Math.max(0, f.hunger - 0.03);
    this.particles.hearts(f.x, WATER_Y + 0.3, f.z, 2);
    this.audio.play('pet', { volume: 0.45, pitch: 0.9 + f.love * 0.4 });
    this.world.sim.disturb(f.x, f.z, 0.15, 0.05);
    if (was < 1 && f.love >= 1) {
      this.ui?.floatTextAt(f.x, 0.6, f.z, 'Nurtured!', '#ffb0d0');
      this.particles.sparkle(f.x, 0.4, f.z, 8, 0xffc0e0);
      this.audio.play('chip', { volume: 0.5 });
    }
    return true;
  }

  releasePoint() {
    const g = this.grid;
    const tx = Math.floor(this.rig.target.x), tz = Math.floor(this.rig.target.z);
    let region = g.inb(tx, tz) ? g.region[tz * g.w + tx] : -1;
    if (region < 0) {
      let best = -1, bs = 0;
      g.regionSizes.forEach((s, i) => { if (s > bs) { bs = s; best = i; } });
      region = best;
    }
    return this.fish.randomWaterPoint(region);
  }

  // legacy direct purchase (debug / tests)
  buyFish(id, n = 1) {
    let ok = false;
    for (let i = 0; i < n; i++) ok = this.buyEgg(id) || ok;
    return ok;
  }

  placeStructure(type, x, z) {
    const def = STRUCTURES[type];
    if (!def || !this.isStructureUnlocked(type)) return false;
    if (def.builder === 'beaver' && !this.structures.list.some((s) => s.type === 'lodge' && s.built)) {
      this.ui?.toast('You need a Beaver Lodge first!', 'bad');
      this.audio.play('error', { volume: 0.4 });
      return false;
    }
    const chk = this.structures.canPlace(type, x, z);
    if (!chk.ok) { this.ui?.toast(chk.reason, 'bad'); this.audio.play('error', { volume: 0.4 }); return false; }
    if (!this.spend(def.cost, 'builds')) return false;
    const s = this.structures.place(type, x, z);
    if (!s) { this.state.coins += def.cost; return false; }
    this.audio.play('place', { volume: 0.5 });
    this.particles.dust(x + 0.5, this.structures.baseY(s) + 0.1, z + 0.5, 5);
    if (this.grid.isWater(x, z)) this.particles.splash(x + 0.5, z + 0.5, 6, 0.6);
    if (s.built) this.onStructureBuilt(s);
    if (s.built && (def.blocksBear || def.blocksFish)) this.onTopologyChanged();
    this.emit('built', s);
    return true;
  }

  canDig(x, z) {
    const g = this.grid;
    if (!g.inb(x, z)) return 'Out of bounds';
    const i = z * g.w + x;
    if (!g.meadow[i]) return 'Outside your land';
    if (g.kind[i] === KIND.WATER) return 'Already water';
    if (g.deco[i] >= 0) return 'Clear the tree/rock first';
    if (g.occ[i] !== -1) return 'Something is built here';
    if (!g.hasWaterNeighbor(x, z)) return 'Must be next to the pond';
    const entry = this.bears.entryTile;
    if (Math.max(Math.abs(x - entry[0]), Math.abs(z - entry[1])) <= 1) return 'Keep the trail clear for customers!';
    if (x >= HUT.x - 1 && x <= HUT.x + 3 && z >= HUT.z - 1 && z <= HUT.z + 4) return 'Too close to the hut';
    return null;
  }

  dig(x, z, batch = false) {
    const why = this.canDig(x, z);
    if (why) { if (!batch) { this.ui?.toast(why, 'bad'); this.audio.play('error', { volume: 0.35 }); } return false; }
    const cost = this.digCost();
    if (!this.spend(cost, 'digging')) return false;
    const g = this.grid;
    g.kind[z * g.w + x] = KIND.WATER;
    this.state.digCount++;
    for (const c of this.world.clutter) if (Math.floor(c.x) === x && Math.floor(c.z) === z) c.removed = true;
    (this._dug ||= []).push([x, z]);
    this.particles.debris(x + 0.5, 0.2, z + 0.5, 12, [0x6a4a2a, 0x8a6a44, 0x4a3a28]);
    this.particles.puff(x + 0.5, 0.1, z + 0.5, 6, 0.3);
    this.audio.play('dig', { volume: 0.6 });
    if (!batch) this.applyDigs();
    return true;
  }

  applyDigs() {
    const dug = this._dug;
    if (!dug || !dug.length) return;
    this._dug = [];
    refreshWaterHeights(this.grid);
    this.world.rebuildTerrain();
    this.world.buildClutter();
    for (const s of this.structures.list)
      if (dug.some(([x, z]) => Math.abs(s.x - x) <= 1 && Math.abs(s.z - z) <= 1)) this.structures.buildMesh(s);
    this.onTopologyChanged();
    for (const [x, z] of dug) this.particles.splash(x + 0.5, z + 0.5, 8, 0.7);
    this.emit('dig');
  }

  demolishAt(x, z) {
    const g = this.grid;
    if (!g.inb(x, z)) return false;
    const i = z * g.w + x;
    const s = this.structures.structureAtTile(x, z);
    if (s) {
      const refund = Math.floor((s.paid || 0) * 0.5);
      if (s.type === 'lodge') this.beavers.removeForLodge(s);
      this.structures.remove(s);
      if (refund) { this.state.coins += refund; if (this.day) this.day.income.refunds += refund; this.emit('coins', { delta: refund }); }
      this.audio.play('demolish', { volume: 0.55 });
      this.particles.puff(x + 0.5, 0.2, z + 0.5, 8, 0.35);
      this.ui?.floatTextAt(x + 0.5, 1, z + 0.5, refund ? `+${refund}` : 'Removed', '#ffe9a0');
      return true;
    }
    if (g.deco[i] >= 0 && g.meadow[i]) {
      const cost = 10;
      if (!this.spend(cost, 'clearing')) return false;
      const d = this.world.decos[g.deco[i]];
      d.removed = true;
      g.deco[i] = -1;
      this.world.buildDecos();
      this.onTopologyChanged();
      this.particles.debris(x + 0.5, 1.2, z + 0.5, 22, d.type === 'boulder' ? [0x9c918c, 0x8b817c] : [0x2b5634, 0x3a6b3c, 0x6b4a2f, 0xc0392b]);
      this.particles.puff(x + 0.5, 0.3, z + 0.5, 10, 0.4);
      this.audio.play('demolish', { volume: 0.6 });
      this.ui?.floatTextAt(x + 0.5, 1.4, z + 0.5, `-${cost}`, '#ffb0a0');
      return true;
    }
    return false;
  }

  canResearch(id) {
    const r = RESEARCH_BY_ID[id];
    const st = this.state;
    if (!r) return { ok: false, reason: 'Unknown' };
    if (st.research.includes(id)) return { ok: false, reason: 'Already researched' };
    if (!r.req.every((q) => st.research.includes(q))) return { ok: false, reason: 'Research the prerequisites first' };
    if (st.coins < r.cost) return { ok: false, reason: `Need ${r.cost - Math.floor(st.coins)} more coins` };
    return { ok: true };
  }

  research(id) {
    const r = RESEARCH_BY_ID[id];
    const st = this.state;
    if (!r || st.research.includes(id)) return false;
    if (!r.req.every((q) => st.research.includes(q))) { this.ui?.toast('Research the prerequisites first', 'bad'); return false; }
    if (!this.spend(r.cost, 'research')) return false;
    st.research.push(id);
    this.mods = computeMods(st.research, this.legacy.tails);
    if (r.species && !st.discovered.includes(r.species)) st.discovered.push(r.species);
    if (r.mods?.beaverBonus) this.beavers.refreshCounts();
    if (r.mods?.bagBonus) this.foodBag.max = Math.round(12 * this.mods.bagBonus);
    this.audio.play('research', { volume: 0.6 });
    this.emit('research', r);
    this.save();
    return true;
  }

  tapStructure(s) {
    if (s.def.gate) { this.structures.toggleGate(s); this.onTopologyChanged(); return true; }
    return false;
  }

  advanceTutorial() {
    this.state.tutorial++;
    this.ui?.tutorialStep(this.state.tutorial);
  }

  setSpeed(n) { this.state.speed = n; this.emit('speed', n); }

  // ------------------------------------------------------------ loop
  update(realDt) {
    const st = this.state;
    const dt = Math.min(0.05, realDt);
    this.time += realDt;
    const ts = this.timeScale;
    const playing = st.phase === 'day' || st.phase === 'rush';
    const speed = st.phase === 'rush' && this.cine?.active ? (this.cine.fast ? 3 : 1) : st.speed;
    let simDt = st.paused ? 0 : dt * ts * (playing ? speed : 1);
    if (st.phase === 'gameover') simDt = dt * 0.3;
    // clock
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.dur);
      const e = k * k * (3 - 2 * k);
      st.hour = tr.from + (tr.to - tr.from) * e;
      if (st.hour >= 24) st.hour -= 24;
      if (tr.kind === 'night') {
        this.overnight.t = k;
        if (!tr.simulated && k > 0.5) { tr.simulated = true; this.simulateOvernight(); }
      }
      if (k >= 1) {
        this.transition = null;
        if (tr.kind === 'evening') this.startReport();
        else if (tr.kind === 'night') this.startDawn();
        else if (tr.kind === 'dawn') this.finishDawn();
      }
    } else if (st.phase === 'day') {
      st.hour += simDt * (8 / this.dayLength());
      if (!this.lunchDone && st.hour >= LUNCH[0] && this.lunch?.length) {
        this.lunchDone = true;
        this.bears.startLunch(this.lunch);
        this.audio.play('lunch_bell', { volume: 0.5 });
        const d = this.bears.list.find((b) => b.lunch);
        this.ui?.toast(`Lunch break! ${d ? d.name + ' from ' + d.dept : 'Someone'} sneaks out for a snack.`, 'gold');
      }
      if (st.hour >= RUSH_HOUR) this.startRush();
    } else if (st.phase === 'rush') {
      st.hour = Math.min(19.2, st.hour + simDt * 0.025);
    } else if (st.phase === 'bedtime') {
      this.bedT += dt;
      st.hour = Math.min(21, st.hour + dt * 0.25);
      if (this.bedT > (this.fox.asleep ? 1.5 : 9)) this.startNight();
    }
    // food bag refill
    const bag = this.foodBag;
    if (bag.count < bag.max) { bag.t += simDt; if (bag.t >= 2.2 / Math.max(1, this.mods.bagBonus)) { bag.t = 0; bag.count++; } }

    // systems
    const calm = st.phase === 'night' || st.phase === 'dawn' || st.phase === 'bedtime' || st.phase === 'report' || st.phase === 'morning';
    const simPhase = calm ? dt * 0.5 : simDt;
    if (st.phase !== 'gameover') {
      this.structures.update(simPhase);
      this.food.update(simPhase);
      this.fish.update(simPhase);
      this.bears.update(st.phase === 'evening' ? dt : simDt);
      this.beavers.update(simPhase);
      this.updateEggs(calm ? simPhase : simDt);
    }
    this.fox.update(dt);
    this.ambient.update(dt);
    this.cine?.update(realDt);
    this.lab?.update(realDt);
    this.particles.update(simDt || dt * 0.5);
    this.world.sim.update(simDt || dt * 0.5, this.wind);
    this.audio.setAmbience({ hour: st.hour, night: this.sky.state.night });
    this.audio.update(dt);
    this.achT = (this.achT || 0) + realDt;
    if (this.achT > 1 && this.started && st.phase !== 'gameover') { this.achT = 0; this.checkAchievements(); }
    this.saveT += realDt;
    if (this.saveT > 25 && st.phase !== 'gameover') { this.saveT = 0; this.save(); }
  }

  render(realDt) {
    const rig = this.rig;
    rig.update(realDt, this.renderer);
    this.sky.update(this.state.hour, this.time, rig.target, rig.yaw);
    this.sky.setShadowExtent(this.renderer.rtW * rig.wupp * 0.75);
    this.world.update(this.time, this.sky, rig.camera);
    this.fish.render();
    this.food.render();
    this.bears.render(realDt);
    this.beavers.render();
    const pushers = this._pushers || (this._pushers = []);
    pushers.length = 0;
    pushers.push({ x: this.fox.x, y: this.fox.y, z: this.fox.z, r: 0.7 });
    for (const b of this.bears.list) {
      if (!b.visible || pushers.length >= 8) continue;
      pushers.push({ x: b.x, y: b.y, z: b.z, r: 0.9 * b.def.scale });
    }
    for (const bv of this.beavers.list) { if (pushers.length >= 8) break; pushers.push({ x: bv.x, y: bv.y || 0, z: bv.z, r: 0.5 }); }
    // foliage in front of whoever the camera is about goes see-through
    const csh = this.cine?.active && this.cine.shot;
    const cut = csh && csh.kind === 'close' && csh.bear?.visible
      ? { x: csh.bear.x, z: csh.bear.z, r: 1.7 * csh.bear.def.scale, k: 1 }
      : { x: this.fox.x, z: this.fox.z, r: 0.9, k: 0.75 };
    updateSpriteUniforms(rig.camera, { time: this.time, wind: this.wind, sunDir: this.sky.state.sunDir, pushers, cut });
    this.particles.setBrightness(1 - this.sky.state.night * 0.45);
    if (this.overrideScene) this.renderer.render(this.overrideScene, this.overrideRig || rig);
    else this.renderer.render(this.scene, rig);
  }

  // ------------------------------------------------------------ save / load
  serialize() {
    const g = this.grid;
    const water = [];
    for (let z = MEADOW.z0; z < MEADOW.z1; z++)
      for (let x = MEADOW.x0; x < MEADOW.x1; x++) if (g.kind[z * g.w + x] === KIND.WATER) water.push(z * g.w + x);
    const removedDecos = [];
    this.world.decos.forEach((d, i) => { if (d.removed) removedDecos.push(i); });
    const st = { ...this.state };
    if (st.phase === 'rush' || st.phase === 'evening') { st.phase = 'day'; st.hour = 16.5; }
    if (['report', 'bedtime', 'night'].includes(st.phase)) { st.phase = 'day'; st.hour = 9; st.day = this.state.day + 1; }
    if (st.phase === 'dawn' || st.phase === 'morning') { st.phase = 'day'; st.hour = 9; }
    return {
      v: 2, state: st, stats: this.stats, water, removedDecos, structures: this.structures.serialize(),
      fish: this.fish.serialize(), food: this.food.serialize(), cam: [this.rig.goal.x, this.rig.goal.z, this.rig.wuppGoal, this.rig.yawGoal],
    };
  }

  save() {
    if (!this.started || this.state.gameOver) return;
    try { safeSet(SAVE_KEY, JSON.stringify(this.serialize())); } catch { /* ignore */ }
  }

  hasSave() { return !!safeGet(SAVE_KEY); }

  load() {
    const raw = safeGet(SAVE_KEY);
    if (!raw) return false;
    let data;
    try { data = JSON.parse(raw); } catch { return false; }
    if (!data || data.v !== 2) return false;
    const g = this.grid;
    for (let z = MEADOW.z0; z < MEADOW.z1; z++)
      for (let x = MEADOW.x0; x < MEADOW.x1; x++) {
        const i = z * g.w + x;
        if (g.kind[i] === KIND.WATER) g.kind[i] = KIND.GRASS;
      }
    for (const i of data.water) g.kind[i] = KIND.WATER;
    refreshWaterHeights(g);
    for (const i of data.removedDecos || []) {
      const d = this.world.decos[i];
      if (d) { d.removed = true; g.deco[d.z * g.w + d.x] = -1; }
    }
    this.world.rebuildTerrain();
    this.world.buildDecos();
    for (const c of this.world.clutter) if (g.kind[Math.floor(c.z) * g.w + Math.floor(c.x)] === KIND.WATER) c.removed = true;
    this.world.buildClutter();
    this.state = { ...this.freshState(), ...data.state };
    for (const e of this.state.eggTray) eggUid = Math.max(eggUid, e.uid + 1);
    this.stats = { ...this.freshStats(), ...data.stats };
    this.mods = computeMods(this.state.research, this.legacy.tails);
    this.foodBag.max = Math.round(12 * this.mods.bagBonus);
    this.grid.computeRegions();
    this.bears.clear();
    this.beavers.clear();
    this.structures.load(data.structures);
    this.grid.computeRegions();
    this.fish.load(data.fish);
    this.food.load(data.food);
    this.onTopologyChanged();
    this.beavers.refreshCounts();
    if (data.cam) { this.rig.lookAt(data.cam[0], data.cam[1], true); this.rig.wupp = this.rig.wuppGoal = data.cam[2]; this.rig.yaw = this.rig.yawGoal = data.cam[3] || 0; }
    this.started = true;
    this.startDay(true);
    this.state.hour = data.state.hour || 9;
    return true;
  }

  loadLegacy() {
    try { return { tails: 0, best: 0, ...(JSON.parse(safeGet(LEGACY_KEY) || '{}')) }; } catch { return { tails: 0, best: 0 }; }
  }
  saveLegacy() { safeSet(LEGACY_KEY, JSON.stringify(this.legacy)); }
}

export { RESEARCH, SPECIES, STRUCTURES };
