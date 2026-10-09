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
import { BearEvents } from './BearEvents.js'; // [v18 bear events] boss days, blood moon, defenses
import { BeaverSystem, BEAVER_LEVELS } from './BeaverSystem.js';
import { Delivery } from './Delivery.js';
import { BugSystem } from './BugSystem.js';
import { ZONES, ZONE_INFO } from '../data/zones.js';
import { ZoneSystem } from './Zones.js';
import { Villagers } from './Villagers.js';
import { Livestock } from './Livestock.js';
import { Tanks } from './Tanks.js';
import { Fox, Ambient } from './Ambient.js';
import { FoodStore } from './FoodStore.js';
import { Harvest } from './Harvest.js';
import { LandAnimals } from './LandAnimals.js';
import { Land } from './Land.js';
import { Cutscene } from './Cutscene.js';
import { NightTour } from './NightTour.js'; // [v19 overnight] the night shown in-world (no summary card)
import { Quests } from './Quests.js';
import { Matchmaking } from './Matchmaking.js';
import { Workshop } from './Workshop.js';
import { PipVisit } from './PipVisit.js';
import { NpcScenes } from './NpcScenes.js'; // [npc cutscenes] arrival + first-visit scenes
import { HomeMode } from './HomeMode.js'; // [v20 npc homes]
import { Forage } from './Forage.js';
import { Terraform } from './Terraform.js';
import { Resources } from './Resources.js'; // [F&S mining] ore + parts inventory (game.res)
import { Mining } from './Mining.js'; // [F&S mining] veins, the bear mine, Flint
import { Industry } from './Industry.js'; // [F&S industry] machines, belts, power, worker bears, pollution
const bedMods = import.meta.glob('./Bedtime.js', { eager: true });
// [v26] extension systems (see installExt below)
const EXT_SYSTEMS = import.meta.glob('./ext/*.js', { eager: true });
const Bedtime = bedMods['./Bedtime.js']?.Bedtime || null;
import { FOOD_ITEMS, STARTING_FOOD, STORAGE, BAG_IDS } from '../data/foods.js';
import { SIGNING_BONUS } from './BeaverSystem.js';
import audio from './audioProxy.js';
import { SPECIES, SPECIES_BY_ID, MORPHS, MUTATIONS, RARITIES } from '../data/species.js';
import { STRUCTURES, CHARM_CAP } from '../data/structures.js';
import { BREEDS } from '../data/livestock.js';
import { BIRD_BY_ID, BIRD_BOUNTY, WILD_BIRDS } from '../data/birds.js';
import { RESEARCH, RESEARCH_BY_ID, UNLOCKS_BUILD, UNLOCKS_SPECIES, computeMods } from '../data/research.js';
import { BRANCHES as RESEARCH_BRANCHES, BRANCH_BY_ID as RESEARCH_BRANCH_BY_ID, STARTER_SECTIONS, researchRushPrice } from '../data/research.js'; // [v18 research]
import { WEEKDAYS } from '../data/bears.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { clamp } from '../core/rng.js';
import { rollGenes, rarityOf, hatchCard, valueMult } from './genes.js';
import { updateWakes } from '../world/water.js'; // [v20 water]

const SAVE_KEY = 'tbme.save.v3';
const LEGACY_KEY = 'tbme.legacy.v1';
export const RUSH_HOUR = 17;
export const LUNCH = [12, 13];
const EGG_TIMES = [40, 60, 85, 115, 150]; // seconds for a pond egg to hatch, by rarity

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

let eggUid = 1;

// v17: research (src/data/research.js) is THE unlock path; neighbours gate
// research nodes (`zone`), not builds. These tables only describe the OLD
// (pre-v17) rules, so old saves keep everything they could already build.
const LEGACY_TUTORIAL_BUILDS = new Set(['lodge', 'beaverbar', 'carrot', 'woodgarage']);
const LEGACY_CATEGORY_GATE = { restaurant: 'treehouse', woodwork: 'treehouse', beaver: 'river', nature: 'bend', crops: 'patch', farm: 'tower', decor: 'willow', contraption: 'mush' };
const LEGACY_TYPE_GATE = {
  snackbowl: 'bakery', pantry: 'bakery', buggrinder: 'swamp', rabbithutch: 'patch', compost: 'patch', glasstank: 'bend',
  berries: 'patch', raspberry: 'patch', strawberry: 'patch', saskatoon: 'patch', cranberry: 'patch', cloudberry: 'patch', elderberry: 'patch', goldenberry: 'patch',
  beehive: 'bakery', maple: 'bakery', wildrice: 'bend', mushrooms: 'patch', willow: 'willow', flowers: 'willow', fern: 'patch', tallgrass: 'tower',
  tipjar: 'bakery', pricesign: 'bakery', waitbench: 'bakery', stressbin: 'bakery', prboard: 'bakery', franchise: 'bakery',
  tagrack: 'bend', feedsilo: 'bend', shovelshed: 'bend', whispershell: 'bend', toolbox: 'river', gearstation: 'river', beaverbed: 'river',
};
// pre-v17 `unlock` of each structure / species (types not listed had none)
const LEGACY_UNLOCK = {
  duckweed: 'r_duckweed', reeds: 'r_duckweed', lilypad: 'r_lilypad', flowers: 'r_flowers', fern: 'r_flowers', willow: 'r_willow', bughotel: 'r_bughotel',
  butterflybush: 'day:3', bogpool: 'zone_swamp', rottinglog: 'zone_swamp', glowmeadow: 'zone_mush',
  beehive: 'r_bees', wildrice: 'r_wildrice', mushrooms: 'r_mushrooms', maple: 'r_maple', saskatoon: 'r_berries',
  peas: 'day:2', potato: 'day:2', corn: 'day:3', sunflower: 'day:3', pumpkin: 'day:4', pantry: 'day:2', rabbithutch: 'day:2',
  lodge: 'r_beavers', dam: 'r_dams', fence: 'r_fences', gate: 'r_gates', platform: 'r_platforms',
  feeder: 'r_feeder', aerator: 'r_aerator', hatchery: 'r_hatchery', sprinkler: 'r_sprinkler', buglamp: 'r_buglamp',
  mailbox: 'r_decor1', pinwheel: 'r_decor1', bench: 'r_decor1', birdhouse: 'r_garden', birdbath: 'r_garden', gnome: 'r_garden', arch: 'r_garden2',
  stringlights: 'r_lights', stonelantern: 'r_lights', campfire: 'r_canadiana', flag: 'r_canadiana', canoe: 'r_canadiana', hockey: 'r_canadiana',
  moose: 'r_canadiana2', stones: 'r_waterdecor', floatlantern: 'r_waterdecor', decoy: 'r_waterdecor', fountain: 'r_waterdecor2', lighthouse: 'r_waterdecor2',
  franchise: 'day:6',
};
const LEGACY_SPECIES_UNLOCK = {
  crappie: 'start', rockbass: 'start', creekchub: 'day:3', dace: 'day:4', drum: 'day:5', goldeye: 'zone_tower', cisco: 'zone_tower',
  bullhead: 'zone_swamp', catfish: 'zone_swamp', bowfin: 'zone_swamp', gar: 'zone_willow', paddlefish: 'zone_willow', eel: 'zone_willow',
  bulltrout: 'zone_river', cutthroat: 'zone_river', coho: 'zone_river', pinksalmon: 'zone_river', kokanee: 'zone_river', browntrout: 'zone_river',
  goldentrout: 'zone_mush', sabertooth: 'zone_mush',
};

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.renderer = opts.renderer || new PixelRenderer(canvas); // [v26 title] main.js hands over the title screen's renderer (one WebGL context)
    this.rig = new CameraRig();
    this.scene = new THREE.Scene();
    this.audio = audio;
    this.listeners = {};
    this.sky = new Sky(this.scene);
    this.world = new World(this.scene);
    this.world.game = this; // [v26 world] (the see-through for tall stuff looks at villagers' houses and big builds)
    this.grid = this.world.grid;
    this.particles = new Particles(this.scene);
    this.particles.groundAt = (x, z) => this.grid.surfaceY(Math.floor(x), Math.floor(z));
    this.particles.sim = this.world.sim;
    this.legacy = this.loadLegacy();
    this.state = this.freshState();
    this.skipGates = false;
    this.researchBoost = 1; // research speed multiplier (the tutorial speeds research up)
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
    this.bearEvents = new BearEvents(this); // [v18 bear events]
    this.world.sim.blocked = (x, z) => {
      const s = this.structures.structureAtTile(x, z);
      return !!(s && s.built && s.def.blocksFish && !(s.def.gate && s.open));
    };
    this.fox = new Fox(this);
    this.ambient = new Ambient(this);
    this.livestock = new Livestock(this);
    this.tanks = new Tanks(this);
    this.zones = new ZoneSystem(this);
    this.homes = new HomeMode(this); // [v20 npc homes] before the villagers: their houses hook in on reveal
    this.villagers = new Villagers(this);
    this.landAnimals = new LandAnimals(this);
    this.land = new Land(this);
    this.cutscene = new Cutscene(this);
    this.quests = new Quests(this);
    this.matchmaking = new Matchmaking(this);
    this.workshop = new Workshop(this);
    this.pipVisit = new PipVisit(this);
    this.npcScenes = new NpcScenes(this); // [npc cutscenes]
    this.forage = new Forage(this); // forest finds (state.forage saves with the state)
    this.terraform = new Terraform(this); // Terraform tool: reshape / paint land, dig & name ponds
    this.res = new Resources(this); // [F&S mining]
    this.mining = new Mining(this); // [F&S mining]
    this.industry = new Industry(this); // [F&S industry]
    this.installExt(); // [v26] src/game/ext/*.js systems
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
    this.rig.setBounds({ minX: 5, maxX: WORLD_W - 5, minZ: 9, maxZ: WORLD_H - 4 }); // [v20 map] a bit closer to the edge: the valley shows past it
    // [v20 map] the valley ring (world/outerRing.js) reaches ~100 tiles out: the camera never
    // centres past the map edge (not even in cutscenes) and the widest zoom stays inside it
    this.rig.hardBounds = { minX: -2, maxX: WORLD_W + 2, minZ: -2, maxZ: WORLD_H + 2 };
    this.rig.viewHalfMax = 62;
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
      inventory: {}, landmarks: [], zones: [], villagers: {}, gatesV14: true, researchV17: true, researchJobs: [], wood: 0, birdsSpotted: [], beaverLevel: 1, unlocked: [], bossesSeen: [], shopDay: 0, shop: [],
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
  // [v26] every src/game/ext/<name>.js exports install(game) -> a system object, set as
  // game.<name>. Optional hooks: update(simDt, dt) (every frame unless game over),
  // render(dt), onNewGame(), onLoad(). Save data lives in game.state.<name> (saved as is).
  installExt() {
    this.extSystems = [];
    for (const [p, m] of Object.entries(EXT_SYSTEMS)) {
      const name = p.match(/([^/]+)\.js$/)[1];
      if (name in this) { console.error('[ext] name taken:', name); continue; }
      try { const sys = m.install?.(this); if (sys) { this[name] = sys; sys.extName = name; this.extSystems.push(sys); } } catch (e) { console.error('[ext]', name, e); }
    }
  }

  extCall(hook, ...args) {
    for (const s of this.extSystems || []) {
      if (typeof s[hook] !== 'function') continue;
      try { s[hook](...args); } catch (e) { if (!s['_err_' + hook]) { s['_err_' + hook] = 1; console.error('[ext]', s.extName, hook, e); } }
    }
  }

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
    this.land.load([]);
    this.zones.onLoad();
    this.villagers.onLoad();
    this.refreshMods();
    this.quests?.onLoad();
    this.extCall('onNewGame'); // [v26]
    this.mining?.onLoad(); // [F&S mining]
    this.industry?.onLoad(); // [F&S industry]
    this.extCall('onLoad'); // [v26]
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

  // perks from the villagers you've befriended (zones.js `mods`)
  zoneMods() {
    const open = this.state?.zones || [];
    // + facilities: placed upgrades (each kind counts once)
    return [...ZONES.filter((Z) => open.includes(Z.id)).map((Z) => Z.mods), ...this.facilityTypes().map((t) => STRUCTURES[t].facility.mods)];
  }
  facilityTypes() {
    const out = new Set();
    for (const s of this.structures?.list || []) if (s.built && !s.removed && s.def.facility) out.add(s.type);
    return [...out].sort();
  }
  refreshMods() {
    this.mods = computeMods(this.state.research, this.legacy.tails, this.zoneMods());
    this.beavers?.refreshCounts?.();
    if (this.foodBag) this.foodBag.max = Math.round(12 * this.mods.bagBonus);
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
    const r = RESEARCH_BY_ID[rid];
    if (!r) return 'Research';
    if (!this.sectionOpen(r.branch)) return `Decrypt the ${RESEARCH_BRANCH_BY_ID[r.branch]?.name || 'research'} section in the Lab, then research ${r.name}`; // [v18 research]
    if (r.zone && !this.zoneOpen(r.zone)) return `Meet ${ZONE_INFO[r.zone]?.npcName || 'a neighbour'}, then research ${r.name}`;
    return `Research in the Lab: ${r.name}`;
  }
  zoneOpen(zid) { return !zid || (this.state.zones || []).includes(zid); }
  // the research node that unlocks a build (null: always available)
  buildNode(type) { const id = UNLOCKS_BUILD[type] || STRUCTURES[type]?.unlock; return RESEARCH_BY_ID[id] || null; }
  // the neighbour still standing between you and a build's research (or null)
  buildGate(type) {
    const r = this.buildNode(type);
    if (!r || !r.zone || this.state.research.includes(r.id)) return null;
    return r.zone;
  }
  gateOpen(type) { const z = this.buildGate(type); return !z || this.skipGates || this.zoneOpen(z); }
  isStructureUnlocked(type) {
    const d = STRUCTURES[type];
    if (!d || d.retired) return false;
    const r = this.buildNode(type);
    if (r ? !this.state.research.includes(r.id) : !this.isUnlocked(d.unlock)) return false;
    if (d.craft) return true; // crafted at Chip's: placed from the inventory
    return !d.landmark || this.state.landmarks.includes(d.landmark);
  }
  // { reason, icon } for a locked build (e-Buy, build menu), null when buildable
  structureLock(type) {
    const d = STRUCTURES[type];
    if (!d) return { reason: 'Coming soon', icon: 'lock' };
    if (d.retired) return { reason: 'Retired', icon: 'lock' };
    const r = this.buildNode(type);
    if (r && !this.state.research.includes(r.id)) return { reason: this.lockReason(r.id), icon: 'flask' };
    if (!r && !this.isUnlocked(d.unlock)) return { reason: this.lockReason(d.unlock) || 'Coming soon', icon: 'map' };
    if (d.landmark && !this.state.landmarks.includes(d.landmark)) return { reason: 'Find the ' + (LANDMARKS.find((x) => x.id === d.landmark)?.name || 'landmark'), icon: 'map' };
    return null;
  }
  speciesUnlocked(id) {
    const sp = SPECIES_BY_ID[id];
    if (!sp) return false;
    if (sp.unlock === 'hybrid') return this.state.discovered.includes(id);
    const rid = UNLOCKS_SPECIES[id];
    if (rid) return this.state.research.includes(rid);
    return this.isUnlocked(sp.unlock);
  }
  speciesLock(id) {
    if (this.speciesUnlocked(id)) return null;
    const sp = SPECIES_BY_ID[id];
    const rid = UNLOCKS_SPECIES[id] || sp?.unlock;
    return { reason: this.lockReason(rid) || 'Coming soon', icon: RESEARCH_BY_ID[rid] ? 'flask' : 'map' };
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
      let pool = this.availableSpecies();
      { const inSeason = pool.filter((id) => this.seasons?.fishMod?.(id)?.available !== false); if (inSeason.length) pool = inSeason; } // [v26 seasons] some eggs are only sold in season
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
      const inSeason = !!this.seasons?.fishMod?.(e.species)?.inSeason; // [v26 seasons] spawning season: cheaper, a badge
      const price = Math.max(8, Math.round(sp.price * (0.8 + rarity * 0.45) * (mu ? Math.sqrt(mu.value) : 1) * (inSeason ? 0.85 : 1)));
      L.push({ id: e.id, cat: 'eggs', kind: 'egg', species: e.species, genes: e.g, title: e.title, sub: sp.name, price, oldPrice: Math.round(price * (e.off || 3)), rarity: RARITIES[rarity].id, mutation: mu ? { id: e.g.mut, name: mu.name, color: mu.color, mult: mu.value } : null, badges: [inSeason ? 'inseason' : null, rarity >= 2 ? 'hot' : null, e.last ? 'last' : null, mu ? 'new' : null].filter(Boolean), seller: { name: pickSeller(e.id), stars: 4 + (e.sold0 % 10) / 10, sold: e.sold0 || 100 }, eta: 'Moose Express' });
    }
    for (const it of SHOP_ITEMS) {
      const def = STRUCTURES[it.type];
      const locked = def ? this.structureLock(it.type) : it.unlock && !this.isUnlocked(it.unlock) ? { reason: this.lockReason(it.unlock), icon: 'flask' } : null;
      if (it.once && (st.inventory[it.type] || this.structures.countBuilt(it.type))) continue;
      L.push({ id: 'item_' + it.type, cat: it.cat, kind: 'item', type: it.type, qty: it.qty || 1, title: it.title, sub: def?.name || it.sub, price: it.price, oldPrice: it.oldPrice, badges: it.badges || [], seller: it.seller, locked, eta: 'Moose Express' });
    }
    // live fish: a ready-to-breed pair in a bag of pond water
    for (const sp of LIVE_PAIRS) {
      const S = SPECIES_BY_ID[sp];
      if (!S) continue;
      const locked = this.speciesLock(sp);
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
      if (!cat || handmade.has(type) || type === 'lodge' || def.retired) continue;
      const locked = this.structureLock(type);
      const price = Math.max(5, Math.round(def.cost * 1.15));
      L.push({ id: 'item_' + type, cat, kind: 'item', type, qty: 1, title: autoTitle(type, def), sub: def.name, price, oldPrice: Math.round(price * (2.5 + (type.length % 5))), badges: def.beauty >= 3 ? ['hot'] : [], seller: { name: pickSeller(type), stars: 4 + (type.length % 10) / 10, sold: 50 + type.length * 37 }, locked, eta: 'Moose Express' });
    }
    // fish you haven't unlocked yet: a teaser of what the lab can get you
    const pool = new Set(this.availableSpecies());
    let teasers = 0;
    for (const sp of SPECIES) {
      if (pool.has(sp.id) || sp.unlock === 'hybrid' || teasers >= 8) continue;
      teasers++;
      L.push({ id: 'lockegg_' + sp.id, cat: 'eggs', kind: 'egg', species: sp.id, genes: { morph: 'normal', stars: 1 + Math.min(4, sp.tier || 0), traits: [], size: 1 }, title: `${sp.name} egg ??? (coming soon)`, sub: sp.name, price: sp.price, rarity: RARITIES[Math.min(4, sp.tier || 0)].id, badges: ['new'], seller: { name: pickSeller(sp.id), stars: 4.8, sold: 0 }, locked: this.speciesLock(sp.id), eta: 'Moose Express' });
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
    this.bearEvents?.onDayStart(st.day); // [v18 bear events] warnings + morning patch-up
    this.ui?.onDayStart(this.wave);
    this.save();
  }

  startRush() {
    const st = this.state;
    st.hour = RUSH_HOUR;
    if (this.bearEvents?.startRush()) return; // [v18 bear events] the blood moon takes the 5 PM slot
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
    if (this.feast?.holdEvening?.()) return; // [v26 feast] a close-up is playing: the feast calls back when it ends
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
    add('Bear Resort (tickets, spa, tub...)', inc.resort, 'rs_tab', 'income'); // [v26 resort] per facility: game.resort.dayIncome
    add('Fish eggs bought', -exp.eggs, 'egg', 'expense');
    add('Construction', -exp.builds, 'hammer', 'expense');
    add('Research & development', -exp.research, 'flask', 'expense');
    add('Digging the pond', -exp.digging, 'shovel', 'expense');
    add('Land clearing', -exp.clearing, 'trash', 'expense');
    // [v26 evening] every other income / expense key too (staff wages, rescues, power, ...), labelled if known
    const EXTRA_LABEL = { wages: ['Staff wages', 'beaver'], rescue: ['Rescues', 'beaver'], gifts: ['Gifts', 'heart'], shop: ['e-Buy shopping', 'coin'], clearing: ['Land clearing', 'trash'], power: ['Power bill', 'pw_bolt'], food: ['Fish food', 'food'], repairs: ['Repairs', 'hammer'] };
    const OLD_IN = ['bills', 'snacks', 'tips', 'trophies', 'refunds', 'resort'], OLD_OUT = ['eggs', 'builds', 'research', 'digging', 'clearing'];
    const extraLine = (k, v, kind) => { const [label, icon] = EXTRA_LABEL[k] || [k.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), 'coin']; add(label, kind === 'income' ? v : -v, icon, kind); };
    for (const [k, v] of Object.entries(inc)) if (!OLD_IN.includes(k) && +v > 0) extraLine(k, +v, 'income');
    for (const [k, v] of Object.entries(exp)) if (!OLD_OUT.includes(k) && +v > 0) extraLine(k, +v, 'expense');
    const sumOf = (o) => Object.values(o).reduce((a, v) => a + (+v > 0 ? +v : 0), 0);
    const income = sumOf(inc); // [v26 evening] was the six old categories only
    const expense = sumOf(exp);
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
    try { this.homePC?.record?.(report); } catch (e) { console.warn('[homePC] record', e); } // [v26 evening] the books
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
    // [v26 evening] he's already home at his desk (homePC): straight into the bedtime cutscene
    if (this.homePC?.handover) { this.fox.bed = { stage: 'asleep', t: 0 }; this.fox.asleep = true; this.fox.rig.root.visible = false; this.ui?.onBedtime?.(); this.startNight(); return; }
    this.fox.goToBed?.();
    this.ui?.onBedtime?.();
  }

  // lights out: the bedtime cutscene (teeth, pajamas, Zzz...), black, then a
  // moonlit tour of everything that happened at the pond overnight, then sunrise
  startNight() {
    const st = this.state;
    if (st.phase !== 'bedtime') return;
    st.phase = 'night';
    this.overnight = { produced: {}, hatched: [], grew: 0, t: 0, events: [] };
    this.transition = null;
    this.audio.play('sleep', { volume: 0.4 });
    this.runNight().catch((e) => {
      console.warn('night', e);
      if (this.state.phase === 'night') { this.transition = { kind: 'night', from: 2, to: 24 + 6, t: 0, dur: 3 }; this.overnight.simulated ||= false; }
    });
  }

  async runNight() {
    const st = this.state;
    let bed = null;
    if (Bedtime && !this.skipBedtime) {
      try { bed = this.bedtime ||= new Bedtime(this); await bed.play(); } catch (e) { console.warn('bedtime', e); bed = null; }
    }
    st.hour = 1.5; // deep night: moon, fireflies, the office lights far away
    this.fox.rig.root.visible = false;
    // [v19 overnight] plan the night, then let the camera watch it happen (skippable;
    // no tour at all when nothing happened). No autosave mid-tour: held-back changes.
    const tour = (this.nightTour ||= new NightTour(this));
    this.saveT = -120;
    this.simulateOvernight(120, { tour: true });
    this.overnight.simulated = true;
    const reveal = bed?.reveal?.({ dur: tour.events.length ? 1.4 : 0.6 });
    this.sky.moonlit = 1;
    try { await tour.play(); } finally { this.sky.moonlit = 0; this.saveT = 0; }
    await reveal;
    st.hour = 5.8;
    this.startDawn();
  }

  // skip the rest of the night quickly (tap)
  hurryNight() {
    if (this.transition && this.transition.kind === 'night') this.transition.dur = Math.min(this.transition.dur, this.transition.t + 1.2);
  }

  // the pond keeps living while Reynard sleeps (~2 minutes of pond time)
  // [v19 overnight] see NightTour.js; { tour: true } holds back what the camera will show
  simulateOvernight(T = 120, opts = {}) {
    return (this.nightTour ||= new NightTour(this)).simulate(T, opts);
  }

  startDawn() {
    const st = this.state;
    st.phase = 'dawn';
    st.day++;
    // [v26 evening] the morning plays in Reynard's room first (sunrise over the valley, the alarm, coffee)
    const bed = this.bedtime;
    if (bed?.wake && !this.skipBedtime) {
      st.hour = 6.2;
      bed.wake().catch((e) => console.warn('wake', e)).finally(() => { if (this.state.phase !== 'dawn') return; this.dawnBreak(true); bed.reveal({ dur: 0.7 }); });
      return;
    }
    this.dawnBreak(false);
  }

  dawnBreak(short = false) { // [v26 evening] (was the body of startDawn)
    this.transition = { kind: 'dawn', from: short ? 7.6 : 6, to: 9, t: 0, dur: short ? 1.4 : 3.2 };
    if (!short) this.audio.play('sunrise', { volume: 0.5 });
    this.fox.rig.root.visible = true;
    this.fox.wakeUp?.();
    this.nightTour?.showTally(); // [v19 overnight] "3 eggs hatched · 2 crops ripe", fades by itself
  }

  // [v19 overnight] no summary card: the night tour already showed it; a short
  // morning beat (corp clock clocks in on morning -> day), then the day starts
  finishDawn() {
    this.state.phase = 'morning';
    setTimeout(() => { if (this.state.phase === 'morning') this.startDay(); }, 500);
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
    const bq = this.bearEvents?.morningQuote(); if (bq) return bq; // [v18 bear events]
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
    this.terraform?.onTopologyChanged(); // pond names follow the water
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
    if (!st.tips.rampage) { st.tips.rampage = 1; this.ui?.foxSay('RAMPAGE! Hungry bears smash things. Keep enough fish around, and plant berries as side dishes!', 'shocked'); }
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
    if (!st.tips.egg) { st.tips.egg = 1; this.ui?.foxSay('An <b>egg</b>! It warms up in the <b>egg tray</b>. When it\'s ready, <b>tap it to hatch</b>.', 'wink'); }
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
    this.emit('fishTagged', f);
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
    if (def?.craft && !free) { this.notify(`Craft a ${def.name} at Chip's workshop first!`, 'no'); this.audio.play('error', { volume: 0.4 }); return false; }
    if (!def || (!free && !this.isStructureUnlocked(type))) return false;
    if (def.builder === 'beaver' && !this.structures.list.some((s) => s.type === 'lodge' && s.built)) {
      this.notify('Need beavers first!', 'no');
      this.audio.play('error', { volume: 0.4 });
      return false;
    }
    const chk = this.structures.canPlace(type, x, z);
    if (!chk.ok) { this.notify(chk.reason, 'no'); this.audio.play('error', { volume: 0.4 }); return false; }
    const parts = !free && def.res && this.res ? def.res : null; // [F&S industry] crafted-part / ore costs (def.res), paid from game.res
    if (parts && !this.res.hasAll(parts)) { this.notify(`${def.name} needs ${this.res.billText(parts)}`, 'no'); this.audio.play('error', { volume: 0.4 }); return false; }
    if (free) { inv[type]--; if (inv[type] <= 0) { delete inv[type]; if (this.tool?.free) this.setTool({ kind: 'feed' }); } this.emit('inventory', inv); }
    else if (!this.spend(def.cost, 'builds')) return false;
    const s = this.structures.place(type, x, z, { free });
    if (!s) { if (free) inv[type] = (inv[type] || 0) + 1; else this.state.coins += def.cost; return false; }
    if (parts) this.res.takeAll(parts, x + 0.5, z + 0.5); // [F&S industry] [v26 power] from the storages nearest the site
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
    else if (r.reason === 'barrier') this.notify(`${r.barrier.name}: ${r.barrier.hint}`, 'no'); // [v26 world]
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

  // ------------------------------------------------------------ research (v17)
  // Research is free but takes game time on a lab bench. One job per bench;
  // `state.researchJobs` = [[id, t]] (t = seconds of work done so far).
  labSlots() { return Math.max(1, 1 + Math.floor(this.mods?.labSlots || 0)); }
  researchSpeed() { return Math.max(0.1, (this.mods?.researchSpeed || 1) * (this.researchBoost || 1)); }
  researchJobs() {
    const sp = this.researchSpeed();
    return (this.state.researchJobs || []).filter(([id]) => RESEARCH_BY_ID[id]).map(([id, t]) => {
      const r = RESEARCH_BY_ID[id];
      const time = Math.max(0.01, r.time || 1);
      return { id, r, t, time, k: Math.min(1, t / time), left: Math.max(0, (time - t) / sp) };
    });
  }
  isResearching(id) { return (this.state.researchJobs || []).some((j) => j[0] === id); }
  canResearch(id) {
    const r = RESEARCH_BY_ID[id];
    const st = this.state;
    if (!r) return { ok: false, reason: 'Unknown' };
    if (st.research.includes(id)) return { ok: false, reason: 'Already researched' };
    if (this.isResearching(id)) return { ok: false, reason: 'Researching...' };
    if (!this.sectionOpen(r.branch)) return { ok: false, reason: `Decrypt the ${RESEARCH_BRANCH_BY_ID[r.branch]?.name || 'research'} section first` }; // [v18 research]
    if (!r.req.every((q) => st.research.includes(q))) return { ok: false, reason: 'Research the prerequisites first' };
    if (r.zone && !this.zoneOpen(r.zone)) return { ok: false, reason: `Meet ${ZONE_INFO[r.zone]?.npcName || 'a neighbour'} first` };
    if ((st.researchJobs || []).length >= this.labSlots()) return { ok: false, reason: 'Lab bench busy' };
    return { ok: true };
  }
  startResearch(id) {
    const c = this.canResearch(id);
    if (!c.ok) return false;
    const r = RESEARCH_BY_ID[id];
    (this.state.researchJobs ||= []).push([id, 0]);
    this.audio.play('research', { volume: 0.45 });
    this.emit('researchStart', { id, r, time: r.time / this.researchSpeed() });
    this.save();
    return true;
  }
  // finish a running job right now (tutorial, debug)
  rushResearch(id) {
    if (!this.isResearching(id)) return false;
    this.finishResearch(id);
    return true;
  }
  // ------------------------------------------------------------ [v18 research] paid rushes + sections
  // Pay coins to speed up a running job: mode 'half' = -50% of the time left,
  // 'now' = finish it right away. Price: researchRushPrice (data/research.js).
  rushResearchPrice(id, mode = 'now') {
    const j = this.researchJobs().find((x) => x.id === id);
    return j ? researchRushPrice(j.r, j.left, mode === 'half' ? 'half' : 'now') : null;
  }
  rushResearchPaid(id, mode = 'now') {
    mode = mode === 'half' ? 'half' : 'now';
    const job = (this.state.researchJobs || []).find((j) => j[0] === id);
    const r = RESEARCH_BY_ID[id];
    if (!job || !r) return { ok: false, msg: 'Not researching that' };
    const price = this.rushResearchPrice(id, mode);
    if (this.state.coins < price) { this.audio.play('error', { volume: 0.4 }); return { ok: false, msg: `Needs ${price} coins`, price }; }
    this.spend(price, 'research');
    this.state.researchSpent = (this.state.researchSpent || 0) + price;
    this.audio.play('coins', { volume: 0.45 });
    this.emit('researchRush', { id, r, mode, price });
    if (mode === 'now') this.finishResearch(id);
    else {
      job[1] += (r.time - job[1]) * 0.5;
      if (job[1] >= r.time - 1e-6) this.finishResearch(id); else this.save();
    }
    return { ok: true, price, mode, msg: mode === 'now' ? `${r.name}: done!` : `${r.name}: -50% time!` };
  }
  // Research SECTIONS (= branches): only STARTER_SECTIONS are open in a new
  // game; the rest are encrypted until unlocked with their section key
  // (BRANCHES[].key: gateway node / neighbour / coins). state.sections = ids.
  ensureSections() {
    const st = this.state;
    if (Array.isArray(st.sections)) return st.sections;
    const open = new Set(STARTER_SECTIONS);
    for (const id of st.research || []) { const b = RESEARCH_BY_ID[id]?.branch; if (b) open.add(b); }
    for (const j of st.researchJobs || []) { const b = RESEARCH_BY_ID[j?.[0]]?.branch; if (b) open.add(b); }
    st.sections = [...open];
    return st.sections;
  }
  sectionOpen(b) { return !b || !RESEARCH_BRANCH_BY_ID[b] || this.ensureSections().includes(b); }
  sectionKey(b) {
    const B = RESEARCH_BRANCH_BY_ID[b];
    if (!B) return null;
    const k = B.key || {};
    const needs = [];
    if (k.node) needs.push({ kind: 'node', id: k.node, ok: this.state.research.includes(k.node), text: `Research ${RESEARCH_BY_ID[k.node]?.name || k.node}` });
    if (k.zone) needs.push({ kind: 'zone', id: k.zone, ok: this.zoneOpen(k.zone), text: `Meet ${ZONE_INFO[k.zone]?.npcName || 'a neighbour'}` });
    const coins = Math.max(0, Math.round(k.coins || 0));
    if (coins) needs.push({ kind: 'coins', ok: this.state.coins >= coins, text: `Pay ${coins} coins`, coins });
    const open = this.sectionOpen(b);
    const ready = needs.every((n) => n.kind === 'coins' || n.ok);
    return { id: b, name: B.name, open, coins, needs, ready, canUnlock: !open && ready && this.state.coins >= coins, nodes: RESEARCH.filter((r) => r.branch === b).length };
  }
  unlockSection(b, { free = false } = {}) {
    const key = this.sectionKey(b);
    if (!key) return { ok: false, msg: 'Unknown section' };
    if (key.open) return { ok: false, msg: 'Already decrypted' };
    if (!free) {
      const miss = key.needs.find((n) => n.kind !== 'coins' && !n.ok);
      if (miss) return { ok: false, msg: `Section key: ${miss.text} first` };
      if (key.coins && this.state.coins < key.coins) { this.audio.play('error', { volume: 0.4 }); return { ok: false, msg: `Needs ${key.coins} coins` }; }
      if (key.coins) this.spend(key.coins, 'research');
    }
    this.ensureSections().push(b);
    this.emit('sectionUnlock', { id: b, name: key.name, coins: free ? 0 : key.coins });
    this.save();
    return { ok: true, msg: `${key.name} decrypted!` };
  }
  researchSections() { return RESEARCH_BRANCHES.map((B) => this.sectionKey(B.id)); }
  tickResearch(dt) {
    const jobs = this.state.researchJobs;
    if (!jobs?.length || !(dt > 0)) return;
    const step = dt * this.researchSpeed();
    const done = [];
    for (const j of jobs) {
      const r = RESEARCH_BY_ID[j[0]];
      if (!r) { done.push(j[0]); continue; }
      j[1] += step;
      if (j[1] >= r.time) done.push(j[0]);
    }
    for (const id of done) this.finishResearch(id);
  }
  finishResearch(id) {
    const st = this.state;
    st.researchJobs = (st.researchJobs || []).filter((j) => j[0] !== id);
    const r = RESEARCH_BY_ID[id];
    if (!r) return;
    if (this.research(id)) {
      const keys = this.state.tutorialDone ? RESEARCH_BRANCHES.filter((B) => B.key?.node === id && !this.sectionOpen(B.id)).map((B) => B.name) : []; // [v18 research] section keys
      this.notify(`Research done: <b>${r.name}</b>!${keys.length ? ` Section key found: decrypt <b>${keys.join('</b> + <b>')}</b> in the Lab!` : ''}`, 'excited', { dur: keys.length ? 5 : 3.5 });
      this.ui?.onResearched?.(r);
    }
  }
  // grant a node instantly (tutorial, saves, debug): no time, no prerequisites
  research(id) {
    const r = RESEARCH_BY_ID[id];
    const st = this.state;
    if (!r || st.research.includes(id)) return false;
    if (st.researchJobs?.length) st.researchJobs = st.researchJobs.filter((j) => j[0] !== id);
    st.research.push(id);
    if (!this.sectionOpen(r.branch)) this.ensureSections().push(r.branch); // [v18 research] granted nodes open their section
    this.mods = computeMods(st.research, this.legacy.tails, this.zoneMods());
    if (r.species && !st.discovered.includes(r.species)) st.discovered.push(r.species);
    if (r.mods?.beaverBonus) this.beavers.refreshCounts();
    if (r.mods?.bagBonus) this.foodBag.max = Math.round(12 * this.mods.bagBonus);
    this.audio.play('research', { volume: 0.6 });
    this.emit('research', r);
    this.save();
    return true;
  }
  // pre-v17 saves: grant the nodes for everything the old rules let you build
  migrateResearchV17(skipGates) {
    const st = this.state;
    if (st.researchV17) return [];
    const had = new Set(st.research);
    const zones = st.zones || [];
    const oldUnlocked = (rid) => {
      if (!rid || rid === 'start') return true;
      if (rid.startsWith('day:')) return st.day >= +rid.slice(4);
      if (rid.startsWith('zone_')) return zones.includes(rid.slice(5));
      return had.has(rid);
    };
    const oldGate = (type, d) => {
      if (LEGACY_TUTORIAL_BUILDS.has(type)) return null;
      if (d.crop && type !== 'carrot') return 'patch';
      return LEGACY_TYPE_GATE[type] || LEGACY_CATEGORY_GATE[d.category] || null;
    };
    const grant = new Set();
    for (const [type, d] of Object.entries(STRUCTURES)) {
      if (d.retired || !UNLOCKS_BUILD[type]) continue;
      const g = oldGate(type, d);
      if (g && !skipGates && !zones.includes(g)) continue;
      if (!d.craft && !oldUnlocked(LEGACY_UNLOCK[type])) continue;
      if (d.landmark && !(st.landmarks || []).includes(d.landmark)) continue;
      grant.add(UNLOCKS_BUILD[type]);
    }
    for (const sp of SPECIES) {
      const rid = UNLOCKS_SPECIES[sp.id];
      if (!rid) continue;
      const old = LEGACY_SPECIES_UNLOCK[sp.id] || rid;
      const early = ZONES.some((Z) => Z.early?.includes(sp.id) && zones.includes(Z.id));
      if (early || oldUnlocked(old) || st.discovered.includes(sp.id)) grant.add(rid);
    }
    const added = [...grant].filter((id) => !had.has(id) && RESEARCH_BY_ID[id]);
    st.research.push(...added);
    st.researchV17 = true;
    return added;
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
    if (this.bearEvents?.tapStructure(s)) return true; // [v18 bear events] tap a damaged defense to repair it
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
      this.bearEvents?.update(simDt, dt); // [v18 bear events]
      this.delivery.update(calm ? dt : simDt || 0);
      this.updateEggs(calm ? simPhase : simDt);
    }
    this.fox.update(dt);
    this.ambient.update(dt);
    if (st.phase !== 'gameover') this.landAnimals.update(simDt || dt * 0.3);
    this.land.update();
    // research ticks on game time (also while you watch it in the lab)
    if (st.phase !== 'gameover') this.tickResearch((this.lab?.active || this.ui?.labPaused) && st.paused ? dt * ts : simDt);
    this.quests.update(realDt || dt);
    // placed facilities change the mods: re-check now and then
    this.facT = (this.facT || 0) - dt;
    if (this.facT <= 0) {
      this.facT = 1;
      const sig = this.facilityTypes().join(',');
      if (sig !== this.facSig) { const first = this.facSig != null; this.facSig = sig; this.refreshMods(); if (first) this.emit('facilities', sig); }
    }
    this.matchmaking.update(dt);
    this.workshop.update(realDt || dt);
    this.pipVisit.update(realDt || dt);
    this.npcScenes?.update(realDt || dt); // [npc cutscenes]
    this.forage.update(dt);
    this.terraform.update(realDt || dt);
    this.zones.update(dt);
    this.villagers.update(dt);
    this.cine?.update(realDt);
    this.tutorial?.update(realDt);
    this.lab?.update(realDt);
    this.homes?.update(realDt); // [v20 npc homes]
    if (st.phase !== 'gameover') this.mining?.update(simDt, dt); // [F&S mining]
    if (st.phase !== 'gameover') this.industry?.update(simDt, dt); // [F&S industry]
    if (st.phase !== 'gameover') this.extCall('update', simDt, dt); // [v26]
    this.classroom?.update(realDt);
    this.particles.update(simDt || dt * 0.5);
    try { updateWakes(this, simDt || dt * 0.5); } catch (e) { console.warn('wakes', e); } // [v20 water] fish/bear/bird/beaver wakes
    this.world.wind = this.wind; // [v20 water]
    this.world.sim.update(simDt || dt * 0.5, this.wind);
    this.audio.setAmbience({ hour: st.hour, night: this.sky.state.night });
    this.audio.update(dt);
    this.achT = (this.achT || 0) + realDt;
    if (this.achT > 1 && this.started && st.phase !== 'gameover') { this.achT = 0; this.checkAchievements(); }
    this.saveT += realDt;
    if (this.saveT > 25 && st.phase !== 'gameover') { this.saveT = 0; this.save(); }
  }

  render(realDt) {
    // the lab computer covers the whole screen: don't draw the world behind it
    if (document.body.classList.contains('lt-pc')) return;
    const rig = this.rig;
    rig.update(realDt, this.renderer);
    this.sky.update(this.state.hour, this.time, rig.target, rig.yaw);
    this.sky.setShadowExtent(this.renderer.rtW * rig.wupp * 0.75);
    this.world.update(this.time, this.sky, rig.camera);
    this.world.ring?.update(this.time, this.sky, rig); // [v20 map] valley haze, deer, birds, edge mist
    this.fish.render();
    this.structures.renderSprites();
    this.food.render();
    this.bears.render(realDt);
    this.beavers.render(realDt);
    this.extCall('render', realDt); // [v26]
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
      fish: this.fish.serialize(), food: this.food.serialize(), bugs: this.bugs.serialize(), livestock: this.livestock?.serialize(), landAnimals: this.landAnimals.serialize(), plots: this.land.serialize(), terraform: this.terraform.serialize(), cam: [this.rig.goal.x, this.rig.goal.z, this.rig.wuppGoal, this.rig.yawGoal],
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
    this.terraform.load(data.terraform); // Terraform heights, paint, pond names (before the rebuild)
    this.world.rebuildTerrain();
    this.world.buildDecos();
    for (const c of this.world.clutter) if (g.kind[Math.floor(c.z) * g.w + Math.floor(c.x)] === KIND.WATER) c.removed = true;
    this.world.buildClutter();
    this.state = { ...this.freshState(), ...data.state };
    // saves from before the neighbour gates keep everything they already had
    this.skipGates = !data.state?.gatesV14;
    // saves from before v17 (research = unlocks) keep what they could build
    if (!data.state?.researchV17) { this.state.researchV17 = false; this.migrateResearchV17(this.skipGates); }
    this.state.researchJobs = (this.state.researchJobs || []).filter((j) => Array.isArray(j) && RESEARCH_BY_ID[j[0]] && !this.state.research.includes(j[0]));
    { const had = Array.isArray(this.state.sections) ? this.state.sections : []; this.state.sections = null; this.state.sections = [...new Set([...had, ...this.ensureSections()])]; } // [v18 research] old saves: open sections with researched nodes
    for (const e of this.state.eggTray) eggUid = Math.max(eggUid, e.uid + 1);
    this.stats = { ...this.freshStats(), ...data.stats };
    this.mods = computeMods(this.state.research, this.legacy.tails, this.zoneMods());
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
    this.landAnimals.load(data.landAnimals);
    this.land.load(data.plots);
    this.zones.onLoad();
    this.villagers.onLoad();
    this.refreshMods();
    this.quests?.onLoad();
    this.mining?.onLoad(); // [F&S mining]
    this.industry?.onLoad(); // [F&S industry]
    this.extCall('onLoad'); // [v26] (also called at the end of newGame: state is ready)
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
  { type: 'beehive', cat: 'plants', title: 'Beehive w/ REAL bees (honey!!)', price: 70, oldPrice: 300, seller: { name: 'Buzzwell', stars: 4.7, sold: 230 } },
  { type: 'gnome', cat: 'decor', title: 'Garden gnome (cursed? no refunds)', price: 22, oldPrice: 66, badges: ['sale'], seller: { name: 'GnomeDepot', stars: 3.9, sold: 666 } },
  { type: 'pinwheel', cat: 'decor', title: 'Spinny pinwheel - bears go wow', price: 15, oldPrice: 40, seller: { name: 'WindyCity', stars: 4.5, sold: 1200 } },
  { type: 'stonelantern', cat: 'decor', title: 'Stone lantern (glows at night!)', price: 35, oldPrice: 120, seller: { name: 'Zen Den', stars: 4.8, sold: 340 } },
  { type: 'floatlantern', cat: 'decor', title: 'Floating lanterns x3 MAGICAL', price: 40, oldPrice: 160, seller: { name: 'Zen Den', stars: 4.8, sold: 290 } },
  { type: 'moose', cat: 'decor', title: 'Life-size moose statue (not my cousin)', price: 90, oldPrice: 400, badges: ['hot'], seller: { name: 'Moose Express', stars: 5, sold: 77 } },
  { type: 'hatchery', cat: 'gear', title: 'Egg incubator - hatch faster', price: 80, oldPrice: 250, seller: { name: 'EggCellent', stars: 4.7, sold: 150 } },
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
  const t = [`${n} (bears LOVE this)`, `${n} - limited edition!!`, `BRAND NEW ${n}!!`, `${n}, slightly used by a moose`, `${n} - 5 stars, would build again`];
  let h = 0; for (const c of type) h = (h * 31 + c.charCodeAt(0)) | 0;
  return t[Math.abs(h) % t.length];
}
function eggTitle(sp, g, rarity, mu) {
  const n = sp.name.toUpperCase();
  if (mu && rarity >= 3) return `!!! ${mu.name.toUpperCase()} ${n} EGG !!! (not clickbait)`;
  if (mu) return `${mu.name} ${sp.name} egg?!? u won't believe it`;
  if (rarity >= 3) return `RARE?! ${sp.name} egg - LAST ONE`;
  if (rarity >= 2) return `${sp.name} egg (shiny vibes)`;
  return [`${sp.name} egg, fresh, no questions`, `Totally normal ${sp.name} egg`, `${sp.name} egg - mom says it's special`][Math.floor(Math.random() * 3)];
}

export { RESEARCH, SPECIES, STRUCTURES };
