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
import { refreshWaterHeights, MEADOW, HUT, WORLD_W, WORLD_H, LANDMARKS } from '../world/worldgen.js';
import { Particles } from './Particles.js';
import { updateSpriteUniforms } from '../core/spriteBatch.js';
import { FishSystem, GROW_TIME } from './FishSystem.js';
import { FoodSystem } from './FoodSystem.js';
import { StructureSystem } from './StructureSystem.js';
import { BearSystem } from './BearSystem.js';
import { BeaverSystem, BEAVER_LEVELS } from './BeaverSystem.js';
import { Delivery } from './Delivery.js';
import { BugSystem } from './BugSystem.js';
import { ZONE_INFO } from '../data/zones.js';
import { ZoneSystem } from './Zones.js';
import { Villagers } from './Villagers.js';
import { Livestock } from './Livestock.js';
import { Tanks } from './Tanks.js';
import { Fox, Ambient } from './Ambient.js';
import { FoodStore } from './FoodStore.js';
import { Harvest } from './Harvest.js';
import { LandAnimals } from './LandAnimals.js';
import { FOOD_ITEMS, STARTING_FOOD, STORAGE, BAG_IDS } from '../data/foods.js';
import { SIGNING_BONUS } from './BeaverSystem.js';
import audio from './audioProxy.js';
import { SPECIES, SPECIES_BY_ID, MORPHS, MUTATIONS, RARITIES } from '../data/species.js';
import { STRUCTURES, CHARM_CAP } from '../data/structures.js';
import { BREEDS } from '../data/livestock.js';
import { BIRD_BY_ID, BIRD_BOUNTY, WILD_BIRDS } from '../data/birds.js';
import { RESEARCH, RESEARCH_BY_ID, computeMods } from '../data/research.js';
import { WEEKDAYS } from '../data/bears.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { clamp } from '../core/rng.js';
import { rollGenes, rarityOf, hatchCard, valueMult } from './genes.js';

const SAVE_KEY = 'tbme.save.v3';
const LEGACY_KEY = 'tbme.legacy.v1';
export const RUSH_HOUR = 17;
export const LUNCH = [12, 13];
const EGG_TIMES = [40, 60, 85, 115, 150]; // seconds for a pond egg to hatch, by rarity

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
    this.harvest = new Harvest(this);
    this.foodStore = new FoodStore(this);
    this.food = new FoodSystem(this);
    this.bugs = new BugSystem(this);
    this.fish = new FishSystem(this);
    this.beavers = new BeaverSystem(this);
    this.delivery = new Delivery(this);
    this.bears = new BearSystem(this);
    this.world.sim.blocked = (x, z) => {
      const s = this.structures.structureAtTile(x, z);
      return !!(s && s.built && s.def.blocksFish && !(s.def.gate && s.open));
    };
    this.fox = new Fox(this);
    this.ambient = new Ambient(this);
    this.livestock = new Livestock(this);
    this.tanks = new Tanks(this);
    this.zones = new ZoneSystem(this);
    this.villagers = new Villagers(this);
    this.landAnimals = new LandAnimals(this);
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
    this.rig.setBounds({ minX: 8, maxX: WORLD_W - 8, minZ: 9, maxZ: WORLD_H - 6 });
    this.rig.lookAt(MEADOW.x0 + 21, 36, true);
    this.running = false;
    this.started = false;
    this.grid.computeRegions();
  }

  // ------------------------------------------------------------ events
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { for (const fn of this.listeners[ev] || []) fn(data); }

  freshState() {
    return {
      coins: 120, day: 1, hour: 9, phase: 'day', rating: 3.0, reviews: [], research: [], discovered: ['bluegill'], morphsSeen: [],
      speed: 1, paused: false, tutorial: 0, tips: {}, totalEarned: 0, bestRating: 3, digCount: 0, gameOver: false, achievements: [],
      eggTray: [], bestNet: 0, grades: [],
      inventory: {}, landmarks: [], zones: [], villagers: {}, birdsSpotted: [], beaverLevel: 1, unlocked: [], bossesSeen: [], shopDay: 0, shop: [],
      food: { ...STARTING_FOOD }, foodSel: 'pellets', foodSeen: ['pellets'], beaverCredit: SIGNING_BONUS, landSpotted: [], harvested: {},
    };
  }

  freshStats() {
    return { fishEaten: 0, hatched: 0, courtships: 0, cannonballs: 0, smashed: 0, bugsEaten: 0, bearsServed: 0, rampages: 0, fishBought: 0, coinsEarned: 0, eggsHatched: 0, snacksServed: 0 };
  }

  resetDayStats() {
    this.day = {
      coins: 0, served: 0, happy: 0, rampages: 0, eaten: this.stats.fishEaten, hatched: this.stats.hatched, reviews: [], ratingStart: this.state.rating, discoveries: [],
      income: { bills: 0, tips: 0, snacks: 0, trophies: 0, refunds: 0, clearing: 0 }, expense: { eggs: 0, builds: 0, research: 0, digging: 0, clearing: 0, shop: 0 }, stars: [], smashed: 0, golden: 0,
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
    // skipping the tutorial: a breeding pair to start with, Bonnie & Clyde
    // (the tutorial has you buy your first two fish instead)
    for (const [sex, name] of this.skipTutorial ? [['M', 'Clyde'], ['F', 'Bonnie']] : []) {
      const p = this.fish.randomWaterPoint();
      if (!p) continue;
      const g = rollGenes('bluegill', this.mods, { sex });
      g.traits = []; g.morph = 'normal'; g.size = 1; g.stars = 1;
      const f = this.fish.spawn('bluegill', p.x, p.z, { adult: true, hunger: 0.3, g });
      if (f) { f.name = name; f.loveT = 6 + Math.random() * 4; }
    }
    this.bugs.load(null);
    this.livestock?.clear();
    this.landAnimals.clear();
    this.zones.onLoad();
    this.villagers.onLoad();
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
      (st.achievementDays ||= {})[a.id] = st.day;
      st.coins += a.reward;
      if (this.day) this.day.income.trophies += a.reward;
      this.emit('coins', { delta: a.reward });
      this.audio.play('levelup', { volume: 0.5 });
      this.ui?.toast(`TROPHY: <b>${a.name}</b> +${a.reward} coins`, 'gold');
      this.ui?.foxMood('laugh', 1.5);
      break;
    }
  }

  isUnlocked(rid) {
    if (!rid || rid === 'start') return true;
    if (rid.startsWith('day:')) return this.state.day >= +rid.slice(4);
    if (rid.startsWith('zone_')) return (this.state.zones || []).includes(rid.slice(5));
    return this.state.research.includes(rid);
  }
  // why something is still locked, in a few words
  lockReason(rid) {
    if (!rid || this.isUnlocked(rid)) return null;
    if (rid.startsWith('day:')) return `Day ${rid.slice(4)}`;
    if (rid.startsWith('zone_')) { const Z = ZONE_INFO[rid.slice(5)]; return Z ? `Meet ${Z.npcName}` : 'Explore the forest'; }
    return 'Research';
  }
  isStructureUnlocked(type) { const d = STRUCTURES[type]; return d && this.isUnlocked(d.unlock) && (!d.landmark || this.state.landmarks.includes(d.landmark)); }
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
    return d === 1 ? 240 : d <= 3 ? 200 : 180;
  }
  secondsToRush() {
    if (this.state.phase !== 'day') return 0;
    return ((RUSH_HOUR - this.state.hour) / (8 / this.dayLength()));
  }
  tagLimit() { return 1 + this.mods.tagBonus; }
  tagsUsed() { let n = 0; for (const f of this.fish.list) if (f.tagged) n++; return n; }

  // beauty -> bigger bills and more customers
  beauty() {
    let b = this.mods.beautyFlat || 0;
    for (const s of this.structures.list) if (s.built) b += (s.def.beauty || 0) + (s.def.comfort || 0) * 0.7;
    for (const f of this.fish.list) if (f.g.traits.includes('sparkly')) b += 1;
    if (this.fish.list.some((f) => f.sp.id === 'grayling')) b += 2;
    b += this.bugs?.charmBonus || 0; // butterflies!
    b += this.livestock?.beauty?.() || 0; // happy ducks & geese
    return Math.round(b * this.mods.beautyMult * 10) / 10;
  }
  // restaurant pull: neon signs & grills bring extra customers
  extraBears() { let n = 0; for (const s of this.structures.list) if (s.built && s.def.bearBonus) n += s.def.bearBonus; return Math.floor(n); }
  charmPct() { return Math.min(CHARM_CAP, Math.floor(this.beauty() * 1.5)); }

  canAfford(c) { return this.state.coins >= c; }
  spend(c, kind = null) {
    if (this.state.coins < c) { this.audio.play('error', { volume: 0.5 }); this.notify('Not enough coins!', 'no'); return false; }
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

  // coins from anything that isn't a bear's bill (clearing land, landmarks...)
  earnMisc(amount, kind = 'refunds') {
    if (amount <= 0) return;
    if (kind === 'clearing' && this.state.landmarks.includes('lumberhut')) amount *= 2;
    this.state.coins += amount;
    this.state.totalEarned += amount;
    this.stats.coinsEarned += amount;
    if (this.day) { this.day.coins += amount; this.day.income[kind] = (this.day.income[kind] || 0) + amount; }
    this.audio.play('coin', { volume: 0.35, pitch: 1 + Math.random() * 0.2 });
    this.emit('coins', { delta: amount });
  }

  // Reynard pops up in the corner to tell you something
  notify(text, mood = 'info', opts = {}) {
    if (this.ui?.notify) return this.ui.notify(text, mood, opts);
    this.ui?.toast?.(text, mood === 'no' || mood === 'warn' ? 'bad' : 'gold');
    return null;
  }

  // speech bubble above anything that can tell us where it is
  say(anchor, text, opts = {}) {
    return this.ui?.say?.(anchor, text, opts) || null;
  }

  // progressive unlocks: tools/UI appear one by one
  isOpen(feature) { return this.state.unlocked.includes(feature) || this.skipTutorial; }
  unlockFeature(feature, { quiet = false } = {}) {
    if (this.state.unlocked.includes(feature)) return false;
    this.state.unlocked.push(feature);
    this.emit('unlock', feature);
    this.ui?.onUnlock?.(feature, quiet);
    return true;
  }

  // landmarks deep in the forest open up once your land reaches them
  checkLandmarks() {
    const g = this.grid;
    for (const L of LANDMARKS) {
      if (this.state.landmarks.includes(L.id)) continue;
      let touch = false;
      for (let z = L.z - 1; z <= L.z + L.d && !touch; z++)
        for (let x = L.x - 1; x <= L.x + L.w && !touch; x++) {
          const inside = x >= L.x && x < L.x + L.w && z >= L.z && z < L.z + L.d;
          if (!inside && g.inb(x, z) && g.meadow[z * g.w + x]) touch = true;
        }
      if (!touch) continue;
      this.discoverLandmark(L);
    }
  }

  discoverLandmark(L, { quiet = false } = {}) {
    const g = this.grid;
    if (this.state.landmarks.includes(L.id)) return;
    this.state.landmarks.push(L.id);
    this.applyLandmarkMods();
    this.particles.confetti(L.x + L.w / 2, g.height[L.z * g.w + L.x] + 2, L.z + L.d / 2, 50);
    if (!quiet) { this.audio.play('discover', { volume: 0.6 }); this.ui?.onLandmark?.(L, LANDMARK_PERKS[L.id]); }
    this.emit('landmark', L);
    this.save();
  }

  applyLandmarkMods() {
    const m = this.mods;
    const lm = this.state.landmarks || [];
    if (lm.includes('firetower')) { this.rig.maxWupp = 0.16; m.patienceMult = (m.patienceMult || 1) * 1.2; }
    if (lm.includes('lumberhut')) m.beaverBonus = (m.beaverBonus || 0) + 1;
    if (lm.includes('willowshrine')) m.beautyFlat = (m.beautyFlat || 0) + 15;
    if (lm.includes('swampshack')) m.mutationMult = (m.mutationMult || 1) * 1.6;
    if (lm.includes('mushhut')) m.hatchSpeed = (m.hatchSpeed || 1) * 1.35;
  }

  // ------------------------------------------------------------ e-Buy
  // today's listings: eggs (genes pre-rolled, what you see is what you get),
  // plant seeds and decor for the blueprint inventory, and gear
  ebuyListings() {
    const st = this.state;
    if (st.shopDay !== st.day || !st.shop?.length) {
      st.shopDay = st.day;
      const pool = this.availableSpecies();
      const n = 5 + Math.min(5, Math.floor(st.day / 2));
      st.shop = [];
      for (let i = 0; i < n; i++) {
        const sp = pool[Math.floor(Math.random() * pool.length)];
        const luck = i === 0 ? 1.6 : 1;
        const g = rollGenes(sp, this.mods, { luck });
        const rarity = rarityOf(g.stars);
        const mu = g.mut ? MUTATIONS[g.mut] : null;
        st.shop.push({ id: 'egg' + st.day + '_' + i, species: sp, g, sold: false, title: eggTitle(SPECIES_BY_ID[sp], g, rarity, mu), off: 2 + Math.random() * 6, last: Math.random() < 0.3, sold0: Math.floor(30 + Math.random() * 2000) });
      }
    }
    const L = [];
    for (const e of st.shop) {
      if (e.sold) continue;
      const sp = SPECIES_BY_ID[e.species];
      const rarity = rarityOf(e.g.stars);
      const mu = e.g.mut ? MUTATIONS[e.g.mut] : null;
      const price = Math.max(8, Math.round(sp.price * (0.8 + rarity * 0.45) * (mu ? Math.sqrt(mu.value) : 1)));
      L.push({ id: e.id, cat: 'eggs', kind: 'egg', species: e.species, genes: e.g, title: e.title, sub: sp.name, price, oldPrice: Math.round(price * (e.off || 3)), rarity: RARITIES[rarity].id, mutation: mu ? { id: e.g.mut, name: mu.name, color: mu.color, mult: mu.value } : null, badges: [rarity >= 2 ? 'hot' : null, e.last ? 'last' : null, mu ? 'new' : null].filter(Boolean), seller: { name: pickSeller(e.id), stars: 4 + (e.sold0 % 10) / 10, sold: e.sold0 || 100 }, eta: 'Moose Express' });
    }
    for (const it of SHOP_ITEMS) {
      const def = STRUCTURES[it.type];
      const locked = it.unlock && !this.isUnlocked(it.unlock) ? { reason: 'Needs research', icon: 'lab' } : it.landmark && !st.landmarks.includes(it.landmark) ? { reason: 'Find the ' + it.landmarkName, icon: 'map' } : null;
      if (it.once && (st.inventory[it.type] || this.structures.countBuilt(it.type))) continue;
      L.push({ id: 'item_' + it.type, cat: it.cat, kind: 'item', type: it.type, qty: it.qty || 1, title: it.title, sub: def?.name || it.sub, price: it.price, oldPrice: it.oldPrice, badges: it.badges || [], seller: it.seller, locked, eta: 'Moose Express' });
    }
    // live fish: a ready-to-breed pair in a bag of pond water
    for (const sp of LIVE_PAIRS) {
      const S = SPECIES_BY_ID[sp];
      if (!S) continue;
      const locked = this.speciesUnlocked(sp) ? null : { reason: 'Lab: unlock this fish first', icon: 'flask' };
      L.push({ id: 'pair_' + sp, cat: 'eggs', kind: 'fish', species: sp, pair: true, genes: { morph: 'normal', stars: 1, traits: [], size: 1 }, title: `LIVE ${S.name} pair ♂+♀ (adults, ready to love!)`, sub: `${S.name} pair`, price: Math.max(20, Math.round(S.price * 2.2)), oldPrice: Math.round(S.price * 7), rarity: 'common', badges: sp === 'bluegill' ? ['hot'] : [], seller: { name: 'Pet Pond Plus', stars: 4.9, sold: 2400 }, locked, eta: 'Moose Express' });
    }
    // fish food bags & produce crates
    for (const id of BAG_IDS) {
      const F = FOOD_ITEMS[id];
      if (F.kind !== 'bag') continue;
      const locked = this.isUnlocked(F.unlock || 'start') ? null : { reason: this.lockReason(F.unlock) || 'Coming soon', icon: 'clock' };
      L.push({ id: 'food_' + id, cat: 'food', kind: 'food', foodId: id, n: F.scoops, title: `${F.brand} ${F.name} (${F.scoops} scoops) - ${F.tagline}`, sub: `${F.name} ×${F.scoops}`, price: F.price, oldPrice: Math.round(F.price * 2.4), badges: F.price >= 100 ? ['hot'] : id === 'pellets' ? ['sale'] : [], seller: { name: F.brand, stars: 4.6 + (F.price % 4) / 10, sold: 300 + F.scoops * 37 }, locked, eta: 'Moose Express' });
    }
    for (const c of PRODUCE_CRATES) {
      const F = FOOD_ITEMS[c.id];
      L.push({ id: 'crate_' + c.id, cat: 'food', kind: 'food', foodId: c.id, n: c.n, title: c.title, sub: `${F.name} ×${c.n}`, price: c.price, oldPrice: c.price * 3, badges: [], seller: { name: 'Farmer Moe', stars: 4.7, sold: 880 }, locked: null, eta: 'Moose Express' });
    }
    // beaver tool upgrades: the next one is buyable, later ones show locked
    const lvl = st.beaverLevel || 1;
    for (let n = 2; n < BEAVER_LEVELS.length; n++) {
      if (n <= lvl) continue;
      const B = BEAVER_LEVELS[n];
      const locked = n > lvl + 1 ? { reason: `Need Lv${n - 1} first`, icon: 'lock' } : !this.beavers.count() ? { reason: 'Hire beavers first', icon: 'beaver' } : null;
      L.push({ id: 'upg_beaver' + n, cat: 'gear', kind: 'upgrade', level: n, type: 'lodge', title: `BEAVER TOOLS Lv${n}: ${B.name}!! (${B.desc})`, sub: `Beaver tools Lv${n}`, price: B.price, oldPrice: B.price * 4, badges: ['hot'], seller: { name: 'BuckTooth Bros', stars: 4.9, sold: 300 + n * 40 }, locked, eta: 'Moose Express' });
    }
    // ducks & geese (live birds come in a crate)
    this.livestock?.ebuyListings?.(L);
    // the rest of the catalogue: every plant, decor piece, gadget and
    // restaurant kit, including the ones you can't have yet (greyed + why)
    const handmade = new Set(SHOP_ITEMS.map((it) => it.type));
    const catOf = { food: 'plants', nature: 'plants', decor: 'decor', contraption: 'gear', restaurant: 'restaurant', farm: 'farm' };
    for (const [type, def] of Object.entries(STRUCTURES)) {
      const cat = catOf[def.category];
      if (!cat || handmade.has(type) || type === 'lodge') continue;
      let locked = null;
      if (def.landmark && !st.landmarks.includes(def.landmark)) locked = { reason: 'Find the ' + (LANDMARKS.find((x) => x.id === def.landmark)?.name || 'landmark'), icon: 'map' };
      else if (!this.isUnlocked(def.unlock)) locked = RESEARCH_BY_ID[def.unlock] ? { reason: 'Lab: ' + RESEARCH_BY_ID[def.unlock].name, icon: 'flask' } : { reason: this.lockReason(def.unlock), icon: 'map' };
      const price = Math.max(5, Math.round(def.cost * 1.15));
      L.push({ id: 'item_' + type, cat, kind: 'item', type, qty: 1, title: autoTitle(type, def), sub: def.name, price, oldPrice: Math.round(price * (2.5 + (type.length % 5))), badges: def.beauty >= 3 ? ['hot'] : [], seller: { name: pickSeller(type), stars: 4 + (type.length % 10) / 10, sold: 50 + type.length * 37 }, locked, eta: 'Moose Express' });
    }
    // fish you haven't unlocked yet: a teaser of what the lab can get you
    const pool = new Set(this.availableSpecies());
    let teasers = 0;
    for (const sp of SPECIES) {
      if (pool.has(sp.id) || sp.unlock === 'hybrid' || teasers >= 8) continue;
      teasers++;
      L.push({ id: 'lockegg_' + sp.id, cat: 'eggs', kind: 'egg', species: sp.id, genes: { morph: 'normal', stars: 1 + Math.min(4, sp.tier || 0), traits: [], size: 1 }, title: `${sp.name} egg ??? (coming soon)`, sub: sp.name, price: sp.price, rarity: RARITIES[Math.min(4, sp.tier || 0)].id, badges: ['new'], seller: { name: pickSeller(sp.id), stars: 4.8, sold: 0 }, locked: RESEARCH_BY_ID[sp.unlock] ? { reason: 'Lab: ' + RESEARCH_BY_ID[sp.unlock].name, icon: 'flask' } : { reason: this.lockReason(sp.unlock) || 'Coming soon', icon: 'map' }, eta: 'Moose Express' });
    }
    return L;
  }

  // returns true on success; the package arrives later by moose
  ebuyBuy(listing, qty = 1) {
    if (listing.locked) { this.notify('Not yet!', 'no'); return false; }
    const cost = listing.price * qty;
    if (this.state.coins < cost) { this.audio.play('error', { volume: 0.4 }); return false; }
    this.spend(cost, listing.kind === 'egg' ? 'eggs' : 'shop');
    this.audio.play('buy', { volume: 0.5 });
    if (listing.kind === 'bird') {
      const B = BREEDS[listing.breed];
      const items = listing.pair ? [{ kind: 'bird', breed: listing.breed, sex: 'm' }, { kind: 'bird', breed: listing.breed, sex: 'f' }] : [{ kind: 'bird', breed: listing.breed, sex: listing.sex || 'f' }];
      for (let k = 1; k < qty; k++) items.push(...items.slice(0, listing.pair ? 2 : 1).map((it) => ({ ...it })));
      this.delivery.order(items, { label: `${B.name}${listing.pair ? ' pair' : ' hen'}${qty > 1 ? ' ×' + qty : ''}`, fast: !!this.tutorialOnly });
    } else if (listing.kind === 'upgrade') {
      this.delivery.order([{ kind: 'upgrade', level: listing.level }], { label: `Beaver tools Lv${listing.level}`, fast: !!this.tutorialOnly });
    } else if (listing.kind === 'fish') {
      const items = [];
      for (let k = 0; k < qty; k++) for (const sex of ['M', 'F']) {
        const g = rollGenes(listing.species, this.mods, { sex });
        g.sex = sex;
        items.push({ kind: 'fish', species: listing.species, genes: g });
      }
      this.delivery.order(items, { label: `${SPECIES_BY_ID[listing.species]?.name || 'Fish'} pair${qty > 1 ? ' ×' + qty : ''}`, fast: !!this.tutorialOnly });
      this.stats.fishBought += qty * 2;
    } else if (listing.kind === 'food') {
      const F = FOOD_ITEMS[listing.foodId];
      this.delivery.order([{ kind: 'food', id: listing.foodId, n: listing.n * qty }], { label: `${F?.name || 'Food'}${qty > 1 ? ' ×' + qty : ''}`, fast: !!this.tutorialOnly });
    } else if (listing.kind === 'egg') {
      const e = this.state.shop.find((x) => x.id === listing.id);
      if (e) e.sold = true;
      const rarity = rarityOf(listing.genes.stars);
      // one egg per unit bought: the listed egg, then siblings from the same clutch
      const eggs = [];
      for (let k = 0; k < qty; k++) {
        const genes = k === 0 ? listing.genes : { ...listing.genes, traits: [...(listing.genes.traits || [])], sex: Math.random() < 0.5 ? 'M' : 'F' };
        eggs.push({ kind: 'egg', species: listing.species, genes, t: EGG_TIMES[rarity] / this.hatchSpeed() });
      }
      this.delivery.order(eggs, { label: `${SPECIES_BY_ID[listing.species]?.name || 'Fish'} egg${qty > 1 ? ' ×' + qty : ''}`, fast: !!this.tutorialOnly });
      this.stats.fishBought += qty;
    } else {
      const n = (listing.qty || 1) * qty;
      this.delivery.order([{ kind: 'item', type: listing.type, qty: n }], { label: `${STRUCTURES[listing.type]?.name || 'Parcel'}${n > 1 ? ' ×' + n : ''}`, fast: !!this.tutorialOnly });
    }
    this.unlockFeature('ebuy', { quiet: true });
    this.save();
    return true;
  }

  // a bought egg hatched in the pond: show off what came out
  onEggHatched(e, born) {
    const f = born[0];
    if (!f) return;
    const st = this.state;
    if (!st.discovered.includes(e.species)) { st.discovered.push(e.species); this.day?.discoveries.push(e.species); }
    const mk = `${e.species}:${f.g.morph}`;
    if (f.g.morph !== 'normal' && !st.morphsSeen.includes(mk)) st.morphsSeen.push(mk);
    this.stats.eggsHatched++;
    const rarity = rarityOf(f.g.stars);
    this.particles.sparkle(e.x, 0.4, e.z, 10 + rarity * 6, 0xfff2a0);
    if (rarity >= 3) this.particles.confetti(e.x, 0.6, e.z, 30);
    this.audio.play(['reveal_common', 'reveal_common', 'reveal_rare', 'reveal_epic', 'reveal_legendary'][rarity], { volume: 0.45 });
    this.ui?.onFishHatched?.(f, rarity);
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
    const ripeBefore = new Set(this.harvest.ripeList());
    this.harvest.simulate(T);
    for (const s of this.harvest.ripeList()) if (!ripeBefore.has(s)) on.produced.crops = (on.produced.crops || 0) + 1;
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
    const singles = fish.list.filter((f) => f.adult && f.fed >= 1 && !f.tank);
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
    // overnight the dads do their job and the eggs incubate; they still wait for your tap
    for (const e of fish.eggs) {
      if (e.stage === 'laid') fish.fertilize(e, null);
      e.t = Math.max(0, (e.t || 0) - T);
      if (e.t <= 0 && !e.ready) { e.ready = true; on.eggsReady = (on.eggsReady || 0) + 1; }
    }
    for (const f of fish.list) if (f.state === 'fertilize') { f.state = 'wander'; f.eggs = null; }
    for (const f of fish.list) {
      if (!before.has(f)) on.hatched.push({ speciesId: f.sp.id, morph: f.g.morph, rarity: rarityOf(f.g.stars), name: f.sp.name });
      if (!f.adult) {
        f.age += T * f.sp.growth * mods.growthMult * 0.6;
        if (f.age >= GROW_TIME) { f.adult = true; on.grew++; }
      }
      f.hunger = Math.max(0.15, f.hunger - 0.1);
    }
    for (const e of this.state.eggTray) e.t = Math.max(0, e.t - T);
    // the fox tops the pellet bag up overnight
    const R = FOOD_ITEMS.pellets.refill;
    if (this.foodStore.count('pellets') < R.upTo) this.foodStore.inv.pellets = R.upTo;
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
    const icons = { seaweed: 'seaweed', honey: 'honey', syrup: 'syrup', berries: 'berry', rice: 'wildrice', mushroom: 'mushroom', crops: 'harvest' };
    const names = { seaweed: 'Seaweed', honey: 'Honey', syrup: 'Maple syrup', berries: 'Blueberries', rice: 'Wild rice', mushroom: 'Chanterelles', crops: 'Plants ready to harvest' };
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
    const ms = (this.state.mutationsSeen ||= []);
    for (const f of born) if (f.g?.mut && !ms.includes(`${f.sp.id}:${f.g.mut}`)) ms.push(`${f.sp.id}:${f.g.mut}`);
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
    if (s.def.nest) this.livestock?.onNestBuilt(s);
    this.bugs?.showRing(s, 6);
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

  // the Food tool on water: throw a scoop of the selected food
  feedAt(x, z) {
    const ok = this.foodStore.throwAt(x, z);
    if (ok && this.state.tutorial === 1) this.advanceTutorial();
    return ok;
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

  placeStructure(type, x, z, { free = false, quiet = false } = {}) {
    const def = STRUCTURES[type];
    const inv = this.state.inventory;
    if (free && !(inv[type] > 0)) free = false;
    if (!def || (!free && !this.isStructureUnlocked(type))) return false;
    if (def.builder === 'beaver' && !this.structures.list.some((s) => s.type === 'lodge' && s.built)) {
      this.notify('Need beavers first!', 'no');
      this.audio.play('error', { volume: 0.4 });
      return false;
    }
    const chk = this.structures.canPlace(type, x, z);
    if (!chk.ok) { this.notify(chk.reason, 'no'); this.audio.play('error', { volume: 0.4 }); return false; }
    if (free) { inv[type]--; if (inv[type] <= 0) { delete inv[type]; if (this.tool?.free) this.setTool({ kind: 'feed' }); } this.emit('inventory', inv); }
    else if (!this.spend(def.cost, 'builds')) return false;
    const s = this.structures.place(type, x, z, { free });
    if (!s) { if (free) inv[type] = (inv[type] || 0) + 1; else this.state.coins += def.cost; return false; }
    this.placeFx(s, quiet);
    if (s.built) this.onStructureBuilt(s);
    if (s.built && (def.blocksBear || def.blocksFish)) this.onTopologyChanged();
    this.emit('built', s);
    return true;
  }

  // mark a tree / forest tile / rock / weed for the beavers (tap again to cancel)
  clearAt(x, z) {
    const B = this.beavers;
    if (!B.count()) { this.notify('Need beavers first!', 'no'); return false; }
    if (B.cancelClear(x, z)) { this.audio.play('close', { volume: 0.3 }); return true; }
    const r = B.queueClear(x, z);
    if (r.ok) { this.audio.play('paper', { volume: 0.3, pitch: 1.2 }); return true; }
    if (r.reason === 'far') this.notify('Too far! Start from the edge of your land.', 'no');
    else if (r.reason === 'fog') this.notify('Too foggy! Clear right up to the fog and it lifts.', 'no');
    else if (r.reason === 'level') this.notify(`Need Lv${r.need} beaver tools! Upgrade on e-Buy.`, 'no');
    this.audio.play('error', { volume: 0.3 });
    return false;
  }

  // cartoon "plonk!": squash & stretch pop, a dust puff ring, little stars,
  // a POP! word and a rising-pitch pop when you paint several in a row
  placeFx(s, quiet = false) {
    const [fw, fd] = s.def.size || [1, 1];
    const cx = s.x + fw / 2, cz = s.z + fd / 2, y = this.structures.baseY(s);
    s.popT = 0.45;
    const now = performance.now();
    this._plonk = now - (this._plonkT || 0) < 600 ? Math.min(12, (this._plonk || 0) + 1) : 0;
    this._plonkT = now;
    const pitch = 1 + this._plonk * 0.06;
    this.audio.play('pop_in', { volume: quiet ? 0.3 : 0.5, pitch });
    if (!quiet || this._plonk % 3 === 0) this.audio.play('place', { volume: 0.3, pitch });
    this.particles.puff(cx, y + 0.15, cz, 8 + fw * 3, 0.32);
    this.particles.dust(cx, y + 0.1, cz, 6);
    this.particles.stars?.(cx, y + 0.8, cz, 5);
    if (this.grid.isWater(s.x, s.z)) { this.particles.splash(cx, cz, 8, 0.7); this.world.sim.disturb(cx, cz, 0.6, 0.35); }
    if (!quiet || this._plonk === 0) this.particles.word?.('pow', cx, y + 1.3, cz, { size: 0.26, life: 0.7 });
    this.rig.shake = Math.max(this.rig.shake, 0.08 + fw * 0.04);
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

  // tapped a wild bird: add it to the bird log (Professor Hoot pays for new ones)
  spotBird(b) {
    const info = BIRD_BY_ID[b.sp];
    if (!info) return;
    const list = (this.state.birdsSpotted ||= []);
    const anchor = { getWorldPos: (v) => v.set(b.x, this.grid.groundAt(b.x, b.z) + b.y + 0.7, b.z) };
    this.audio.play('bird_chirp', { volume: 0.35, pitch: 1.2 });
    if (list.includes(info.id)) { this.say(anchor, info.name, { mood: 'happy', dur: 1.6, size: 's', key: 'bird' }); return; }
    list.push(info.id);
    const hoot = (this.state.zones || []).includes('tower');
    const pay = hoot ? BIRD_BOUNTY[info.rarity] : 3;
    this.earnMisc(pay, 'tips');
    this.particles.sparkle(b.x, this.grid.groundAt(b.x, b.z) + 0.4, b.z, 6, 0xfff2a0);
    this.say(anchor, `NEW BIRD! ${info.name}`, { mood: 'excited', dur: 2.4, size: 'm', key: 'bird' });
    this.notify(`Bird log ${list.length}/${WILD_BIRDS.length}! +${pay}${hoot ? ' (Hoot\'s bounty)' : ''}`, 'happy');
    this.emit('birdSpotted', info);
  }

  tapStructure(s) {
    if (s.def.gate) { this.structures.toggleGate(s); this.onTopologyChanged(); return true; }
    if (s.def.crop && s.built) {
      if (s.crop?.stage === 3) { this.harvest.harvest(s); return true; }
      this.ui?.showCropCard?.(s);
      return true;
    }
    if (STORAGE[s.type] && s.built) {
      const sel = this.foodStore.selected, F = FOOD_ITEMS[sel];
      const fits = STORAGE[s.type].for === 'beaver' ? F?.beaver : F?.bear;
      if (this.tool.kind === 'feed' && fits && this.foodStore.count(sel) > 0 && this.foodStore.room(s) > 0) { this.foodStore.fillStorage(s, sel); return true; }
      this.ui?.showStorageCard?.(s);
      return true;
    }
    if (s.def.grinder && s.built) { if (!this.structures.collectGrinder(s)) this.ui?.showStructureInfo?.(s); return true; }
    if (s.def.hutch && s.built) { this.ui?.showHutchCard?.(s); return true; }
    if (s.def.nest && s.built) { this.ui?.showNestCard?.(s); return true; }
    if (s.def.tank && s.built) { this.ui?.showTankCard?.(s); return true; }
    if (this.bugs?.farmDef(s) && s.built && (s.def.category === 'farm' || s.type === 'bughotel')) { this.bugs.showRing(s, 6); this.ui?.showFarmCard?.(s); return true; }
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
      if (!this.tutorialHold) st.hour += simDt * (8 / this.dayLength());
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
    // free pellet trickle
    this.foodStore.update(simDt);

    // systems
    const calm = st.phase === 'night' || st.phase === 'dawn' || st.phase === 'bedtime' || st.phase === 'report' || st.phase === 'morning';
    const simPhase = calm ? dt * 0.5 : simDt;
    if (st.phase !== 'gameover') {
      this.structures.update(simPhase);
      this.harvest.update(simPhase);
      this.food.update(simPhase);
      this.bugs.update(simPhase);
      this.livestock.update(simPhase);
      this.tanks.update(simPhase);
      this.fish.update(simPhase);
      this.bears.update(st.phase === 'evening' ? dt : simDt);
      this.beavers.update(simPhase);
      this.delivery.update(calm ? dt : simDt || 0);
      this.updateEggs(calm ? simPhase : simDt);
    }
    this.fox.update(dt);
    this.ambient.update(dt);
    if (st.phase !== 'gameover') this.landAnimals.update(simDt || dt * 0.3);
    this.zones.update(dt);
    this.villagers.update(dt);
    this.cine?.update(realDt);
    this.tutorial?.update(realDt);
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
    this.structures.renderSprites();
    this.food.render();
    this.bears.render(realDt);
    this.beavers.render(realDt);
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
    this.renderer.setFogEnabled(!this.overrideScene && !this.titleMode);
    if (this.overrideScene) this.renderer.render(this.overrideScene, this.overrideRig || rig);
    else this.renderer.render(this.scene, rig);
  }

  // ------------------------------------------------------------ save / load
  serialize() {
    const g = this.grid;
    const water = [], land = [];
    for (let i = 0; i < g.w * g.h; i++) {
      if (!g.meadow[i]) continue;
      if (g.kind[i] === KIND.WATER) water.push(i);
      const x = i % g.w, z = (i / g.w) | 0;
      if (x < MEADOW.x0 || x >= MEADOW.x1 || z < MEADOW.z0 || z >= MEADOW.z1) land.push(i);
    }
    const removedDecos = [];
    this.world.decos.forEach((d, i) => { if (d.removed) removedDecos.push(i); });
    const st = { ...this.state };
    if (st.phase === 'rush' || st.phase === 'evening') { st.phase = 'day'; st.hour = 16.5; }
    if (['report', 'bedtime', 'night'].includes(st.phase)) { st.phase = 'day'; st.hour = 9; st.day = this.state.day + 1; }
    if (st.phase === 'dawn' || st.phase === 'morning') { st.phase = 'day'; st.hour = 9; }
    return {
      v: 3, state: st, stats: this.stats, water, land, removedDecos, removedClutter: this.world.clutter.filter((c) => c.type === 'none').map((c) => [Math.floor(c.x), Math.floor(c.z)]), structures: this.structures.serialize(),
      beavers: this.beavers.serialize(), delivery: this.delivery.serialize(),
      fish: this.fish.serialize(), food: this.food.serialize(), bugs: this.bugs.serialize(), livestock: this.livestock?.serialize(), land: this.landAnimals.serialize(), cam: [this.rig.goal.x, this.rig.goal.z, this.rig.wuppGoal, this.rig.yawGoal],
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
    if (!data || data.v !== 3) return false;
    const g = this.grid;
    for (const i of data.land || []) { if (g.kind[i] === KIND.FOREST) g.kind[i] = KIND.GRASS; g.meadow[i] = 1; }
    for (let i = 0; i < g.w * g.h; i++) if (g.meadow[i] && g.kind[i] === KIND.WATER) g.kind[i] = KIND.GRASS;
    for (const i of data.water) g.kind[i] = KIND.WATER;
    refreshWaterHeights(g);
    for (const [x, z] of data.removedClutter || []) this.world.removeClutter?.(x, z);
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
    this.beavers.loadClears(data.beavers?.clears);
    this.delivery.load(data.delivery);
    this.bugs.load(data.bugs);
    this.livestock?.load(data.livestock);
    this.landAnimals.load(data.land);
    this.zones.onLoad();
    this.villagers.onLoad();
    this.applyLandmarkMods();
    this.world.landVersion++;
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

// what Reynard gets for reaching each landmark
export const LANDMARK_PERKS = {
  firetower: { icon: 'binoculars', line: 'I can see bears coming for miles! Zoom out further, and bears wait longer.' },
  lumberhut: { icon: 'axe', line: 'Lumber prices! Clearing pays double, and +1 beaver per lodge.' },
  willowshrine: { icon: 'heart', line: 'The Great Willow blesses the pond. +15 beauty!' },
  mushhut: { icon: 'mushroom', line: 'Magic spores! Eggs hatch 35% faster.' },
  swampshack: { icon: 'sparkle', line: 'Swamp water is... weird. Mutations happen way more often.' },
};

// things e-Buy sells besides eggs (delivered into your blueprint inventory)
const SHOP_ITEMS = [
  { type: 'lodge', cat: 'gear', title: 'BEAVER CREW!! hard workers (2 beavers + lodge)', price: 60, oldPrice: 999, badges: ['hot'], once: true, seller: { name: 'BuckTooth Bros', stars: 4.9, sold: 812 } },
  { type: 'berries', cat: 'plants', title: 'Blueberry bush seeds (beavers LOVE these)', price: 25, oldPrice: 80, badges: ['new'], qty: 1, seller: { name: 'Berry Mom', stars: 4.8, sold: 3100 } },
  { type: 'flowers', cat: 'plants', title: 'Flower bed kit - pretty = more bears', price: 18, oldPrice: 50, seller: { name: 'Petal Pusher', stars: 4.6, sold: 920 } },
  { type: 'seaweed', cat: 'plants', title: 'Seaweed starter (fish snack + hiding)', price: 12, oldPrice: 30, seller: { name: 'Kelp Kelly', stars: 4.4, sold: 410 } },
  { type: 'beehive', cat: 'plants', title: 'Beehive w/ REAL bees (honey!!)', price: 70, oldPrice: 300, unlock: 'r_bees', seller: { name: 'Buzzwell', stars: 4.7, sold: 230 } },
  { type: 'gnome', cat: 'decor', title: 'Garden gnome (cursed? no refunds)', price: 22, oldPrice: 66, badges: ['sale'], seller: { name: 'GnomeDepot', stars: 3.9, sold: 666 } },
  { type: 'pinwheel', cat: 'decor', title: 'Spinny pinwheel - bears go wow', price: 15, oldPrice: 40, seller: { name: 'WindyCity', stars: 4.5, sold: 1200 } },
  { type: 'stonelantern', cat: 'decor', title: 'Stone lantern (glows at night!)', price: 35, oldPrice: 120, seller: { name: 'Zen Den', stars: 4.8, sold: 340 } },
  { type: 'floatlantern', cat: 'decor', title: 'Floating lanterns x3 MAGICAL', price: 40, oldPrice: 160, seller: { name: 'Zen Den', stars: 4.8, sold: 290 } },
  { type: 'moose', cat: 'decor', title: 'Life-size moose statue (not my cousin)', price: 90, oldPrice: 400, badges: ['hot'], seller: { name: 'Moose Express', stars: 5, sold: 77 } },
  { type: 'hatchery', cat: 'gear', title: 'Egg incubator - hatch faster', price: 80, oldPrice: 250, unlock: 'r_hatchery', seller: { name: 'EggCellent', stars: 4.7, sold: 150 } },
];
// live adult pairs on e-Buy (the tutorial's first purchase)
const LIVE_PAIRS = ['bluegill', 'pumpkinseed', 'goldfish', 'perch', 'brook'];
const PRODUCE_CRATES = [
  { id: 'carrot', n: 6, price: 18, title: 'Crate of carrots x6 (beavers will work for these!!)' },
  { id: 'lettuce', n: 8, price: 14, title: 'Lettuce crate x8 - fresh, crunchy, cheap' },
  { id: 'blueberry', n: 6, price: 16, title: 'Wild blueberries x6 (bears LOVE a side dish)' },
];
const SELLERS = ['xX_FishLord_Xx', 'grandma_trout', 'BigPondEnergy', 'eggs4u_ca', 'NotAScam_Fish', 'Canuck_Carp', 'reel_deal', 'fin_tastic'];
function pickSeller(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return SELLERS[Math.abs(h) % SELLERS.length]; }
function autoTitle(type, def) {
  const n = def.name;
  const t = [`${n} (bears LOVE this)`, `${n} - limited edition!!`, `BRAND NEW ${n} 🔥`, `${n}, slightly used by a moose`, `${n} - 5 stars, would build again`];
  let h = 0; for (const c of type) h = (h * 31 + c.charCodeAt(0)) | 0;
  return t[Math.abs(h) % t.length];
}
function eggTitle(sp, g, rarity, mu) {
  const n = sp.name.toUpperCase();
  if (mu && rarity >= 3) return `!!! ${mu.name.toUpperCase()} ${n} EGG !!! (not clickbait)`;
  if (mu) return `${mu.name} ${sp.name} egg?!? u won't believe it`;
  if (rarity >= 3) return `RARE?! ${sp.name} egg - LAST ONE`;
  if (rarity >= 2) return `${sp.name} egg (shiny vibes) 🔥`;
  return [`${sp.name} egg, fresh, no questions`, `Totally normal ${sp.name} egg`, `${sp.name} egg - mom says it's special`][Math.floor(Math.random() * 3)];
}

export { RESEARCH, SPECIES, STRUCTURES };
