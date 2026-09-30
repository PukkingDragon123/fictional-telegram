// The Game: owns every system, the clock (9 AM -> 5 PM rush hour -> night),
// the economy, reviews/rating, research, player actions and saving.
import * as THREE from 'three';
import { PixelRenderer } from '../core/pixelRenderer.js';
import { CameraRig } from '../core/cameraRig.js';
import { World } from '../world/world.js';
import { Sky } from '../world/sky.js';
import { KIND } from '../world/grid.js';
import { refreshWaterHeights, MEADOW, HUT } from '../world/worldgen.js';
import { Particles } from './Particles.js';
import { FishSystem } from './FishSystem.js';
import { FoodSystem } from './FoodSystem.js';
import { StructureSystem } from './StructureSystem.js';
import { BearSystem } from './BearSystem.js';
import { BeaverSystem } from './BeaverSystem.js';
import { Fox, Ambient } from './Ambient.js';
import audio from './audioProxy.js';
import { SPECIES, SPECIES_BY_ID } from '../data/species.js';
import { STRUCTURES } from '../data/structures.js';
import { RESEARCH, RESEARCH_BY_ID, computeMods } from '../data/research.js';
import { WEEKDAYS } from '../data/bears.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { clamp } from '../core/rng.js';

const SAVE_KEY = 'tbme.save.v1';
const LEGACY_KEY = 'tbme.legacy.v1';
export const RUSH_HOUR = 17;

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

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
    this.legacy = this.loadLegacy();
    this.state = this.freshState();
    this.stats = this.freshStats();
    this.mods = computeMods([], this.legacy.tails);
    this.structures = new StructureSystem(this);
    this.food = new FoodSystem(this);
    this.fish = new FishSystem(this);
    this.beavers = new BeaverSystem(this);
    this.bears = new BearSystem(this);
    this.fox = new Fox(this);
    this.ambient = new Ambient(this);
    this.ui = null;
    this.tool = { kind: 'feed' };
    this.foodBag = { count: 12, max: 12, t: 0 };
    this.wave = null;
    this.time = 0;
    this.saveT = 0;
    this.transition = null;
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
      coins: 60, day: 1, hour: 9, phase: 'day', rating: 3.0, reviews: [], research: [], discovered: ['bluegill'],
      speed: 1, paused: false, tutorial: 0, tips: {}, totalEarned: 0, bestRating: 3, digCount: 0, gameOver: false, achievements: [],
    };
  }

  freshStats() {
    return { fishEaten: 0, hatched: 0, courtships: 0, cannonballs: 0, smashed: 0, bugsEaten: 0, bearsServed: 0, rampages: 0, fishBought: 0, coinsEarned: 0 };
  }

  resetDayStats() {
    this.day = { coins: 0, served: 0, happy: 0, rampages: 0, eaten: this.stats.fishEaten, hatched: this.stats.hatched, reviews: [], ratingStart: this.state.rating, discoveries: [] };
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
    this.food.pellets.length = 0;
    // starter pond life
    this.grid.computeRegions();
    const starts = [[24, 33], [30, 35], [27, 31]];
    for (const [x, z] of starts) if (this.grid.isWater(x, z)) this.structures.place('seaweed', x, z, { instant: true, free: true });
    const shore = this.shoreTiles();
    const cat = shore.filter(([x, z]) => z > 33).slice(0, 2);
    for (const [x, z] of cat) this.structures.place('cattail', x, z, { instant: true, free: true });
    for (let i = 0; i < 6; i++) {
      const p = this.fish.randomWaterPoint();
      if (p) this.fish.spawn('bluegill', p.x, p.z, { adult: true, hunger: 0.35 });
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
      this.emit('coins', { delta: a.reward });
      this.audio.play('levelup', { volume: 0.5 });
      this.ui?.toast(`TROPHY: <b>${a.name}</b> +${a.reward} coins`, 'gold');
      this.ui?.foxMood('laugh', 1.5);
      break; // one per check keeps toasts readable
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
    if (sp.unlock === 'hybrid') return Math.round(sp.meal * sp.value * 22);
    return sp.price;
  }
  digCost() { return Math.round((12 + this.state.digCount * 1.6) * this.mods.digMult); }
  weekday(day = this.state.day) { return WEEKDAYS[(day - 1) % 7]; }
  isDayOff(day = this.state.day) { return (day - 1) % 7 === 6; }
  dayLength() {
    if (this.isDayOff()) return 45;
    const d = this.state.day;
    return d === 1 ? 110 : Math.max(60, 88 - d * 1.5);
  }
  secondsToRush() {
    if (this.state.phase !== 'day') return 0;
    return ((RUSH_HOUR - this.state.hour) / (8 / this.dayLength()));
  }

  canAfford(c) { return this.state.coins >= c; }
  spend(c) {
    if (this.state.coins < c) { this.audio.play('error', { volume: 0.5 }); this.ui?.toast("Not enough coins!", 'bad'); return false; }
    this.state.coins -= c;
    this.emit('coins', { delta: -c });
    return true;
  }

  earn(amount, bear) {
    if (amount <= 0) return;
    this.state.coins += amount;
    this.state.totalEarned += amount;
    this.stats.coinsEarned += amount;
    if (this.day) this.day.coins += amount;
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
    this.audio.setMusic('day');
    if (!first) this.audio.play('day_start', { volume: 0.4 });
    this.emit('day', { day: st.day });
    this.ui?.onDayStart(this.wave);
    this.save();
  }

  startRush() {
    const st = this.state;
    st.hour = RUSH_HOUR;
    if (this.wave.dayOff || !this.wave.bears.length) { this.startEvening(); return; }
    st.phase = 'rush';
    this.bears.startWave(this.wave);
    this.ambient.onRushStart();
    this.audio.play('whistle', { volume: 0.8 });
    setTimeout(() => this.audio.setMusic('rush'), 1200);
    this.ui?.onRushStart(this.wave);
    this.fox.react('greedy', 3);
    this.emit('rush');
  }

  ringBell() {
    if (this.state.phase !== 'day' || this.transition) return;
    this.audio.play('bell', { volume: 0.6 });
    this.startRush();
  }

  onWaveComplete() {
    if (this.state.phase === 'rush') this.startEvening();
  }

  startEvening() {
    this.state.phase = 'evening';
    this.transition = { kind: 'evening', from: this.state.hour, to: Math.max(this.state.hour, 20.6), t: 0, dur: 3 };
  }

  startNight() {
    const st = this.state;
    st.phase = 'night';
    this.audio.setMusic('night');
    this.audio.play('day_end', { volume: 0.4 });
    if (st.rating < 1.0 && !this.isDayOff()) { this.gameOver(); return; }
    const d = this.day;
    const report = {
      day: st.day, weekday: this.weekday(), dayOff: this.isDayOff(), coins: d.coins, served: d.served, happy: d.happy, rampages: d.rampages,
      eaten: this.stats.fishEaten - d.eaten, hatched: this.stats.hatched - d.hatched, rating: st.rating, ratingDelta: st.rating - d.ratingStart,
      reviews: d.reviews.slice(0, 6), discoveries: d.discoveries, fish: this.fish.count, capacity: this.fish.capacity(),
    };
    if (st.rating < 1.8) this.audio.play('warning', { volume: 0.5 });
    this.ui?.showReport(report);
    this.save();
  }

  nextDay() {
    if (this.state.phase !== 'night') return;
    this.state.phase = 'morning';
    this.transition = { kind: 'morning', from: this.state.hour, to: 24 + 9, t: 0, dur: 3.2 };
    // overnight: fish recover a little and eggs hatch
    for (const f of this.fish.list) f.hunger = Math.max(0.15, f.hunger - 0.1);
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
    // voluntary prestige after Franchise Empire
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
    this.grid.computeRegions();
    this.grid.version++;
    this.fish.onTopologyChanged();
    for (const p of this.food.pellets) p.region = this.grid.regionAt(p.x, p.z);
  }

  onFishBorn(sp, egg) {
    const st = this.state;
    if (!st.discovered.includes(sp.id)) {
      st.discovered.push(sp.id);
      if (this.day) this.day.discoveries.push(sp.id);
      this.audio.play('discover', { volume: 0.7 });
      this.particles.confetti(egg.x, 0.5, egg.z, 50);
      this.fox.react('cheer', 2.5);
      this.ui?.showDiscovery(sp);
      this.save();
    }
    if (egg.golden) this.ui?.toast(`A GOLDEN ${sp.name} hatched! (worth 5x)`, 'gold');
  }

  onRampage(b) {
    const st = this.state;
    this.stats.rampages++;
    if (this.day) this.day.rampages++;
    this.fox.react('panic', 3);
    this.ui?.onRampage(b);
    if (!st.tips.rampage) { st.tips.rampage = 1; this.ui?.foxSay('RAMPAGE! Hungry bears smash things. Research Beaver Dams in my lab to protect a breeding nursery... and always keep enough fish around!', 'shocked'); }
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
      if (r.stars >= 4) this.day.happy++;
    }
    this.stats.bearsServed++;
    this.audio.play(r.stars >= 4 ? 'review_good' : r.stars <= 1 ? 'review_bad' : 'coin', { volume: r.stars >= 4 ? 0.35 : 0.4 });
    this.ui?.showReviewBubble(b, r);
    this.emit('review', r);
  }

  onStructureBuilt(s) {
    this.ui?.floatTextAt(s.x + 0.5, 1.2, s.z + 0.5, 'Built!', '#ffe9a0');
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

  buyFish(id, n = 1) {
    if (!this.speciesUnlocked(id)) return false;
    const price = this.speciesPrice(id);
    let bought = 0;
    for (let i = 0; i < n; i++) {
      if (this.fish.population() >= this.fish.capacity()) { this.ui?.toast('The pond is full! Dig it bigger.', 'bad'); break; }
      if (this.state.coins < price) { if (!bought) { this.audio.play('error', { volume: 0.5 }); this.ui?.toast('Not enough coins!', 'bad'); } break; }
      const p = this.releasePoint();
      if (!p) break;
      this.state.coins -= price;
      this.fish.spawn(id, p.x, p.z, { adult: true, splash: true, hunger: 0.3 });
      this.particles.sprite('fish', p.x, 0.6, p.z, { vy: 0.8, life: 0.9, size: 0.3 });
      bought++;
    }
    if (bought) {
      this.stats.fishBought += bought;
      this.audio.play('buy', { volume: 0.5 });
      this.emit('coins', { delta: -price * bought });
    }
    return bought > 0;
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
    if (!this.spend(def.cost)) return false;
    const s = this.structures.place(type, x, z);
    if (!s) { this.state.coins += def.cost; return false; }
    this.audio.play('place', { volume: 0.5 });
    this.particles.dust(x + 0.5, this.structures.baseY(s) + 0.1, z + 0.5, 5);
    if (this.grid.isWater(x, z)) this.particles.splash(x + 0.5, z + 0.5, 6, 0.6);
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

  // Dig one tile. With `batch`, the (expensive) terrain rebuild waits for
  // applyDigs() so dragging a long line stays smooth.
  dig(x, z, batch = false) {
    const why = this.canDig(x, z);
    if (why) { if (!batch) { this.ui?.toast(why, 'bad'); this.audio.play('error', { volume: 0.35 }); } return false; }
    const cost = this.digCost();
    if (!this.spend(cost)) return false;
    const g = this.grid;
    g.kind[z * g.w + x] = KIND.WATER;
    this.state.digCount++;
    for (const c of this.world.clutter) if (Math.floor(c.x) === x && Math.floor(c.z) === z) c.removed = true;
    (this._dug ||= []).push([x, z]);
    this.particles.debris(x + 0.5, 0.2, z + 0.5, 12, [0x6a4a2a, 0x8a6a44, 0x4a3a28]);
    this.particles.splash(x + 0.5, z + 0.5, 10, 0.8);
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
      if (refund) { this.state.coins += refund; this.emit('coins', { delta: refund }); }
      this.audio.play('demolish', { volume: 0.55 });
      this.ui?.floatTextAt(x + 0.5, 1, z + 0.5, refund ? `+${refund}` : 'Removed', '#ffe9a0');
      return true;
    }
    if (g.deco[i] >= 0 && g.meadow[i]) {
      const cost = 10;
      if (!this.spend(cost)) return false;
      const d = this.world.decos[g.deco[i]];
      d.removed = true;
      g.deco[i] = -1;
      this.world.buildDecos();
      this.onTopologyChanged();
      this.particles.debris(x + 0.5, 1.2, z + 0.5, 22, d.type === 'boulder' ? [0x9c918c, 0x8b817c] : [0x2b5634, 0x3a6b3c, 0x6b4a2f, 0xc0392b]);
      this.audio.play('demolish', { volume: 0.6 });
      this.ui?.floatTextAt(x + 0.5, 1.4, z + 0.5, `-${cost}`, '#ffb0a0');
      return true;
    }
    return false;
  }

  research(id) {
    const r = RESEARCH_BY_ID[id];
    const st = this.state;
    if (!r || st.research.includes(id)) return false;
    if (!r.req.every((q) => st.research.includes(q))) { this.ui?.toast('Research the prerequisites first', 'bad'); return false; }
    if (!this.spend(r.cost)) return false;
    st.research.push(id);
    this.mods = computeMods(st.research, this.legacy.tails);
    if (r.species && !st.discovered.includes(r.species)) st.discovered.push(r.species);
    if (r.mods?.beaverBonus) this.beavers.refreshCounts();
    this.audio.play('research', { volume: 0.6 });
    this.particles.sparkle(HUT.x + 1.9, 2.8, HUT.z + 0.4, 14, 0x9affb0);
    this.emit('research', r);
    this.save();
    return true;
  }

  tapStructure(s) {
    if (s.def.gate) { this.structures.toggleGate(s); return true; }
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
    let simDt = st.paused ? 0 : dt * (st.phase === 'day' || st.phase === 'rush' ? st.speed : 1);
    if (st.phase === 'gameover') simDt = dt * 0.3;
    // clock
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.dur);
      const e = k * k * (3 - 2 * k);
      st.hour = tr.from + (tr.to - tr.from) * e;
      if (st.hour >= 24) st.hour -= 24;
      if (k >= 1) {
        this.transition = null;
        if (tr.kind === 'evening') this.startNight();
        else if (tr.kind === 'morning') { st.day++; this.startDay(); }
      }
    } else if (st.phase === 'day') {
      st.hour += simDt * (8 / this.dayLength());
      if (!this.lunchDone && st.hour >= 12.5 && this.lunch?.length) {
        this.lunchDone = true;
        this.bears.startLunch(this.lunch);
        const d = this.bears.list.find((b) => b.lunch);
        this.ui?.toast(`Lunch break! ${d ? d.name + ' from ' + d.dept : 'Someone'} sneaks out for a snack.`, 'gold');
        this.audio.play('bell', { volume: 0.3, pitch: 1.3 });
      }
      if (st.hour >= RUSH_HOUR) this.startRush();
    } else if (st.phase === 'rush') {
      st.hour = Math.min(20.2, st.hour + simDt * 0.03);
    }
    // food bag refill
    const bag = this.foodBag;
    if (bag.count < bag.max) { bag.t += simDt; if (bag.t >= 2.2) { bag.t = 0; bag.count++; } }

    // systems
    const simPhase = st.phase === 'night' || st.phase === 'morning' ? dt * 0.5 : simDt;
    if (st.phase !== 'gameover') {
      this.structures.update(simDt);
      this.food.update(simDt);
      this.fish.update(simPhase);
      this.bears.update(simDt);
      this.beavers.update(simDt);
    }
    this.fox.update(dt);
    this.ambient.update(dt);
    this.particles.update(simDt || dt * 0.5);
    this.audio.setAmbience({ hour: st.hour, night: this.sky.state.night });
    this.audio.update(dt);
    // trophies
    this.achT = (this.achT || 0) + realDt;
    if (this.achT > 1 && this.started && st.phase !== 'gameover') { this.achT = 0; this.checkAchievements(); }
    // autosave
    this.saveT += realDt;
    if (this.saveT > 25 && st.phase !== 'gameover') { this.saveT = 0; this.save(); }
  }

  render(realDt) {
    const rig = this.rig;
    rig.update(realDt, this.renderer);
    this.sky.update(this.state.hour, this.time, rig.target, rig.yaw);
    this.sky.setShadowExtent(this.renderer.rtW * rig.wupp * 0.75);
    this.world.update(this.time, this.sky);
    this.fish.render();
    this.food.render();
    this.bears.render(realDt);
    this.beavers.render();
    this.renderer.render(this.scene, rig);
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
    if (st.phase === 'morning' || st.phase === 'night') { st.phase = 'day'; st.hour = 9; if (this.state.phase === 'morning' || this.state.phase === 'night') st.day = this.state.day + 1; }
    return {
      v: 1, state: st, stats: this.stats, water, removedDecos, structures: this.structures.serialize(),
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
    if (!data || data.v !== 1) return false;
    const g = this.grid;
    // terrain: reset meadow water to saved layout
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
    this.stats = { ...this.freshStats(), ...data.stats };
    this.mods = computeMods(this.state.research, this.legacy.tails);
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
