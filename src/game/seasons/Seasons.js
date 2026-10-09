// [v26 seasons] game.seasons: the year (spring -> summer -> autumn -> winter,
// 7 days each, day 1 = spring), the weather of every day, temperature, and what
// it all does to fish, crops and bears. Installed by src/game/ext/seasons.js.
//
// Contract (other systems code against these names):
//   game.seasons.season        'spring' | 'summer' | 'autumn' | 'winter'
//   game.seasons.weather       'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'heat' | 'wind'
//   game.seasons.temp          deg C right now (smoothed)
//   game.seasons.forecast(n)   [{ day, weekday, season, weather, label, icon, seasonIcon, hi, lo, today }]
//   game.seasons.fishMod(sp)   { appetite, breed, speed, depth, available, inSeason, mood, pref }
//   game.seasons.cropMod(type, s?) growth multiplier (0 = dormant)
//   game.seasons.warmSpots()   built structures whose def has `warm` (lit fuel burners only)
//   game.seasons.set(season, weather)   force both (tests); set() clears
//   events: 'season' { season, prev, day }, 'weather' { weather, prev, day, label }
// Also: snow (0..1 ground cover), ice, wet, intensity (precipitation 0..1),
//   icon(weather), seasonIcon(season), coolSpots(), dryZones(), warmthAt(x, z),
//   isSheltered(x, z), onReview(...) (BearSystem), cropTint(s) (StructureSystem).
import {
  SEASONS, WEATHER_INFO, SEASON_INFO, seasonOf, dayInSeason, rollWeather, tempAt, dayRange, weatherLabel, snowShare,
  daysToNextSeason, nextSeason, rand01, yearOf,
} from './calendar.js';
import { fishModFor, cropModFor, TENDER, cropSeasonWord } from './mods.js';
import { BearWeather } from './bearsWx.js';
import { Teacher } from './teach.js';
import { WeatherFx } from '../../world/weatherFx.js';
import { WEEKDAYS } from '../../data/bears.js';

// structures that are warm / cool / dry without a seasons def flag (older builds)
const LEGACY_WARM = { campfire: 2.2, hangout: 2.8, bbq: 1.3 };
const LEGACY_DRY = { umbrellatable: 1.0, hammock: 0.6 };
const LEGACY_COOL = { umbrellatable: 1.1, beercooler: 0.9 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export class Seasons {
  constructor(game) {
    this.game = game;
    this.forced = null; // { season, weather } (tests)
    this._temp = null;
    this._fm = new Map();
    this._fmKey = '';
    this.intensity = 0; // precipitation / fog / heat strength right now 0..1
    this.wind = 1;
    this.flash = 0;
    this.bears = new BearWeather(game, this);
    this.teach = new Teacher(game, this);
    try { this.fx = new WeatherFx(game, this); } catch (e) { console.error('[seasons] fx', e); this.fx = null; }
    game.on('day', (d) => this.onDay(d?.day ?? game.state.day));
    game.on('rush', () => this.onRush());
    game.on('built', (s) => {
      this.teach.onBuilt?.(s);
      // a burner built on a cold evening lights up right away (if there is fuel)
      if (s?.def?.fuel && this.fuelDay === this.day) this.lightOne(s, this.coldDay());
    });
  }

  // ---------------------------------------------------------------- state
  get st() {
    const g = this.game.state;
    let s = g.seasons;
    if (!s || typeof s !== 'object') s = g.seasons = {};
    if (!s.seed) s.seed = (Math.random() * 1e9) | 0 || 7;
    if (s.snow == null) s.snow = 0;
    if (s.ice == null) s.ice = 0;
    if (s.wet == null) s.wet = 0;
    s.tips ||= {};
    return s;
  }
  onNewGame() { this.game.state.seasons = { seed: (Math.random() * 1e9) | 0 || 7, snow: 0, ice: 0, wet: 0, tips: {} }; this._temp = null; this.forced = null; }
  onLoad() {
    const s = this.st;
    this._temp = null;
    this.lastSeason = this.season;
    this.lastWeather = this.weather;
    // an old save that starts in winter: snow on the ground already
    if (this.season === 'winter' && s.snow < 0.5 && !s.loadedV) s.snow = 0.8;
    s.loadedV = 1;
    this.fx?.snap?.();
  }

  get day() { return this.game.state?.day || 1; }
  get hour() { return this.game.state?.hour ?? 12; }
  get season() { return this.forced?.season || seasonOf(this.day); }
  get dayInSeason() { return this.forced ? 3 : dayInSeason(this.day); }
  get year() { return yearOf(this.day); }
  weatherOn(day) { return rollWeather(day, this.st.seed); }
  get weather() { return this.forced?.weather || this.weatherOn(this.day); }
  get label() { return weatherLabel(this.weather, this.temp); }
  get info() { return WEATHER_INFO[this.weather] || WEATHER_INFO.clear; }
  get snow() { return this.st.snow; }
  get ice() { return this.st.ice; }
  get wet() { return this.st.wet; }
  // the "true" temperature of the hour (forced seasons use a mid-season day)
  rawTemp(hour = this.hour) {
    const day = this.forced ? this.forcedDay() : this.day;
    return tempAt(day, hour, this.weather, this.st.seed);
  }
  forcedDay() {
    const i = SEASONS.indexOf(this.forced.season);
    return i * 7 + 4 + (Math.max(0, this.year - 1) * 28);
  }
  get temp() { return this._temp ?? this.rawTemp(); }
  // how much of the falling stuff is snow right now (0 rain .. 1 snow)
  get snowShare() { return snowShare(this.weather, this.temp); }
  icon(weather = this.weather) { return WEATHER_INFO[weather]?.icon || 'wx_clear'; }
  seasonIcon(season = this.season) { return SEASON_INFO[season]?.icon || 'season_spring'; }
  seasonName(season = this.season) { return SEASON_INFO[season]?.name || 'Spring'; }
  get cold() { return this.temp < 6; }
  get hot() { return this.temp > 27; }

  // ---------------------------------------------------------------- forecast
  // today + the next n-1 days. The Weather Radio research shows 3 days, else 2.
  forecastDays() { return this.game.state.research?.includes('w_radio') ? 3 : 2; }
  forecast(n = this.forecastDays()) {
    const out = [];
    const seed = this.st.seed;
    for (let k = 0; k < n; k++) {
      const day = this.day + k;
      const forced = k === 0 && this.forced;
      const weather = forced ? this.forced.weather : this.weatherOn(day);
      const season = forced ? this.forced.season : seasonOf(day);
      const r = dayRange(forced ? this.forcedDay() : day, weather, seed);
      out.push({
        day, weekday: WEEKDAYS[(day - 1) % 7], season, weather, label: weatherLabel(weather, (r.hi + r.lo) / 2),
        icon: WEATHER_INFO[weather]?.icon || 'wx_clear', seasonIcon: SEASON_INFO[season]?.icon, hi: r.hi, lo: r.lo, today: k === 0,
        seasonDay: forced ? 4 : dayInSeason(day) + 1,
      });
    }
    return out;
  }
  // "Winter in 2 days" for UI and Reynard
  nextSeasonIn() { return { season: nextSeason(this.season), days: daysToNextSeason(this.day) }; }

  // ---------------------------------------------------------------- tests
  set(season = null, weather = null, { snow = null } = {}) {
    if (!season && !weather) { this.forced = null; this._fmKey = ''; this.fx?.snap?.(); this.emitChange(); return this; }
    const prevS = this.season, prevW = this.weather;
    this.forced = { season: season || this.season, weather: weather || this.weather };
    const s = this.st;
    // snap the slow state so screenshots show it right away
    s.snow = snow ?? (this.forced.season === 'winter' ? (this.forced.weather === 'snow' ? 0.95 : 0.85) : this.forced.weather === 'snow' ? 0.5 : 0);
    s.ice = this.forced.season === 'winter' ? 0.85 : 0;
    s.wet = WEATHER_INFO[this.forced.weather]?.wet || 0;
    this._temp = this.rawTemp();
    this.intensity = this.intensityAt(this.hour);
    this._fmKey = '';
    this.fx?.snap?.();
    if (prevS !== this.season) this.game.emit('season', { season: this.season, prev: prevS, day: this.day, forced: true });
    if (prevW !== this.weather) this.game.emit('weather', { weather: this.weather, prev: prevW, day: this.day, label: this.label, forced: true });
    return this;
  }
  emitChange() {
    if (this.lastSeason !== this.season) this.game.emit('season', { season: this.season, prev: this.lastSeason, day: this.day });
    if (this.lastWeather !== this.weather) this.game.emit('weather', { weather: this.weather, prev: this.lastWeather, day: this.day, label: this.label });
    this.lastSeason = this.season;
    this.lastWeather = this.weather;
  }

  // ---------------------------------------------------------------- day events
  onDay(day) {
    const prevS = this.lastSeason, prevW = this.lastWeather;
    this._fmKey = '';
    this.lastSeason = this.season;
    this.lastWeather = this.weather;
    this.fuelDay = -1; // burners light again tonight
    if (prevS && prevS !== this.season) this.game.emit('season', { season: this.season, prev: prevS, day });
    if (prevW !== this.weather) this.game.emit('weather', { weather: this.weather, prev: prevW, day, label: this.label });
    try { this.frostMorning(); } catch (e) { console.warn('[seasons] frost', e); }
    try { this.salmonRun(); } catch (e) { console.warn('[seasons] salmon', e); }
    this.teach.onDay(day, prevS);
  }

  onRush() {
    this.lightBurners();
    this.teach.onRush();
  }

  // ---------------------------------------------------------------- update
  update(simDt, dt) {
    const game = this.game;
    const st = game.state;
    if (!st || !game.started) return;
    const s = this.st;
    const live = simDt > 0 ? simDt : dt * 0.5;
    // temperature: smooth towards the hour's value
    const want = this.rawTemp();
    this._temp = this._temp == null ? want : lerp(this._temp, want, Math.min(1, dt * 0.8));
    const temp = this._temp;
    // weather strength through the day (rain showers come and go, fog lifts by noon)
    const inten = this.intensityAt(this.hour);
    this.intensity = lerp(this.intensity, inten, Math.min(1, dt * 0.6));
    const W = this.info;
    const precip = W.precip ? this.intensity : 0;
    const sn = this.snowShare;
    // ground: snow piles up while it snows below ~1C, melts above it
    if (precip > 0.05 && sn > 0.4) s.snow = Math.min(1, s.snow + live * 0.006 * precip * sn);
    else if (temp > 1) s.snow = Math.max(0, s.snow - live * 0.0009 * (temp - 0.5) * (W.precip && sn < 0.4 ? 2.5 : 1));
    // ice grows on the shallows below 0C, thaws above it
    const iceWant = clamp(-temp / 9, 0, 1) * (this.season === 'winter' ? 1 : 0.6);
    s.ice = s.ice < iceWant ? Math.min(iceWant, s.ice + live * 0.004) : Math.max(iceWant, s.ice - live * 0.003);
    // wet ground: rain soaks it, sun dries it
    const wetWant = W.precip && sn < 0.6 ? precip : W.wet * 0.4 * this.intensity;
    s.wet = s.wet < wetWant ? Math.min(wetWant, s.wet + live * 0.05) : Math.max(wetWant, s.wet - live * (temp > 20 ? 0.012 : 0.006));
    // wind: gusts on windy days
    const gust = 0.5 + 0.5 * Math.sin(game.time * 0.7) * Math.sin(game.time * 0.23 + 1.1);
    const windWant = 1 + (W.wind - 1) * (0.6 + 0.4 * this.intensity) * (0.75 + 0.5 * gust);
    this.wind = lerp(this.wind, windWant, Math.min(1, dt * 0.8));
    if (!game.titleMode) game.wind = this.wind;
    try { this.bears.update(simDt, dt); } catch (e) { if (!this._eb) { this._eb = 1; console.error('[seasons] bears', e); } }
    try { this.teach.update(dt); } catch (e) { if (!this._et) { this._et = 1; console.error('[seasons] teach', e); } }
    try { this.fx?.update(simDt, dt); } catch (e) { if (!this._ef) { this._ef = 1; console.error('[seasons] fx', e); } }
    // burners light up in the morning of a cold day (1 wood or coal each); out-of-fuel ones
    // catch again as soon as there is wood in the garage
    if ((st.phase === 'day' || st.phase === 'rush') && this.fuelDay !== this.day) this.lightBurners();
    this._relT = (this._relT || 0) - dt;
    if (this._relT <= 0) { this._relT = 4; for (const s of game.structures?.list || []) if (s.built && !s.removed && s.def?.fuel && s.lit === false && ((st.wood || 0) >= 1 || game.res?.has?.('coal', 1))) this.lightOne(s, true); }
    try { this.burnerFx(dt); } catch (e) { if (!this._eu) { this._eu = 1; console.error('[seasons] burners', e); } }
  }

  render(dt) { try { this.fx?.render(dt); } catch (e) { if (!this._er) { this._er = 1; console.error('[seasons] fx render', e); } } }

  // 0..1 strength of today's weather at an hour (stable per day)
  intensityAt(hour) {
    const w = this.weather;
    const seed = this.st.seed, day = this.forced ? 0 : this.day;
    const ph = rand01(seed, day * 17 + 3) * 6.28;
    const wob = 0.5 + 0.5 * Math.sin(hour * 0.9 + ph) * Math.sin(hour * 0.37 + ph * 1.7);
    switch (w) {
      case 'rain': return 0.45 + 0.55 * wob;
      case 'storm': return 0.75 + 0.25 * wob;
      case 'snow': return 0.5 + 0.5 * wob;
      case 'fog': { const m = hour < 6 || hour > 20 ? 1 : hour < 11 ? 1 - (hour - 6) * 0.08 : hour < 16 ? 0.6 : 0.6 + (hour - 16) * 0.1; return clamp(m * (0.8 + 0.2 * wob), 0.35, 1); }
      case 'heat': return clamp(0.35 + 0.65 * Math.max(0, Math.sin(((hour - 8) / 14) * Math.PI)), 0.3, 1);
      case 'wind': return 0.55 + 0.45 * wob;
      default: return 0;
    }
  }

  // ---------------------------------------------------------------- fish / crops
  fishMod(species) {
    const id = typeof species === 'string' ? species : species?.id;
    const key = `${this.season}|${this.weather}|${Math.round(this.temp / 3)}`;
    if (key !== this._fmKey) { this._fm.clear(); this._fmKey = key; }
    let m = this._fm.get(id);
    if (!m) { m = fishModFor(id, this.season, this.weather, this.temp); this._fm.set(id, m); }
    return m;
  }
  inGreenhouse(s) {
    for (const o of this.game.structures?.list || []) {
      const G = o.def?.greenhouse;
      if (!G || !o.built || o.removed) continue;
      const [w, d] = o.def.size || [1, 1];
      if (Math.hypot(s.x + 0.5 - (o.x + w / 2), s.z + 0.5 - (o.z + d / 2)) <= G.radius) return true;
    }
    return false;
  }
  cropMod(type, s = null) {
    const t = typeof type === 'string' ? type : type?.type;
    let gh = false;
    if (s && this.season === 'winter') {
      // the greenhouse test walks every structure: cache it per plant for a couple of seconds
      const now = this.game.time || 0;
      if (!s._seaGh || now - s._seaGh.t > 2) s._seaGh = { t: now, v: this.inGreenhouse(s) };
      gh = s._seaGh.v;
    }
    return cropModFor(t, this.season, this.weather, { greenhouse: gh });
  }
  cropWord(type) { return cropSeasonWord(type, this.season); }
  // frosty sprite tint for dormant / frozen crops (StructureSystem.renderSprites)
  cropTint(s) {
    if (!s?.crop || s.crop.stage >= 3) return null;
    if (this.season !== 'winter' && this.temp > 0) return null;
    if (this.cropMod(s.type, s) > 0.05) return null;
    return [0.8, 0.9, 1.18];
  }
  // a hard frost on a winter morning kills tender crops that are still growing
  frostMorning() {
    if (this.season !== 'winter') return;
    const lo = dayRange(this.day, this.weather, this.st.seed).lo;
    if (lo > -2) return;
    const game = this.game;
    const killed = [];
    for (const s of game.structures?.list || []) {
      if (!s.built || s.removed || !s.crop || !TENDER.has(s.type)) continue;
      if (s.crop.stage >= 3 || (s.crop.stage === 0 && s.crop.t < 1)) continue;
      if (this.inGreenhouse(s)) continue;
      s.crop.stage = 0; s.crop.t = 0; s.crop.first = true; s.crop.batch = null; s.stock = 0;
      game.structures.updateVisual?.(s);
      killed.push(s);
    }
    if (killed.length) {
      game.structures.spritesDirty = true;
      this.frostKilled = killed.map((s) => s.type);
      this.teach.onFrost(killed);
    }
  }

  // ---------------------------------------------------------------- the autumn salmon run
  // On the second autumn morning a few wild salmon swim up the creek into the pond:
  // free dinner (all of one sex, so you still need the research to breed them).
  salmonRun() {
    const s = this.st;
    if (this.season !== 'autumn' || this.forced || dayInSeason(this.day) !== 1) return;
    const key = 'run' + this.year;
    if (s[key]) return;
    s[key] = 1;
    const game = this.game;
    const fish = game.fish;
    if (!fish || !fish.list) return;
    const pool = ['pinksalmon', 'coho', 'sockeye', 'chinook'].filter((id) => game.speciesById?.(id));
    const unlocked = pool.filter((id) => game.speciesUnlocked?.(id));
    const sp = (unlocked.length ? unlocked : ['pinksalmon'])[Math.floor(Math.random() * (unlocked.length || 1))];
    if (!game.speciesById?.(sp)) return;
    const n = 3 + Math.floor(Math.random() * 2);
    const sex = Math.random() < 0.5 ? 'M' : 'F';
    const born = [];
    for (let i = 0; i < n; i++) {
      if (fish.population() >= fish.capacity()) break;
      const p = fish.randomWaterPoint();
      if (!p) break;
      const f = fish.spawn(sp, p.x, p.z, { adult: true, splash: true, hunger: 0.5 });
      if (f) { f.g.sex = sex; f.wild = true; born.push(f); }
    }
    if (!born.length) return;
    if (!game.state.discovered.includes(sp)) game.state.discovered.push(sp);
    this.salmon = { sp, n: born.length, t: 0 };
    this.teach.onSalmon(sp, born);
  }

  // ---------------------------------------------------------------- warm / cool / dry
  warmRadius(s) {
    const r = s.def?.warm ?? LEGACY_WARM[s.type];
    return r || 0;
  }
  isLit(s) {
    if (!s.def?.fuel) return true;
    if (this.game.power?.powered?.(s)) return true;
    return !!s.lit;
  }
  warmSpots() {
    const out = [];
    for (const s of this.game.structures?.list || []) {
      if (!s.built || s.removed) continue;
      if (!this.warmRadius(s)) continue;
      if (!this.isLit(s)) continue;
      out.push(s);
    }
    return out;
  }
  coolSpots() {
    const out = [];
    for (const s of this.game.structures?.list || []) {
      if (!s.built || s.removed) continue;
      if (s.def?.cool || LEGACY_COOL[s.type]) out.push(s);
    }
    return out;
  }
  dryZones() {
    const out = [];
    for (const s of this.game.structures?.list || []) {
      if (!s.built || s.removed) continue;
      if (s.def?.dry || LEGACY_DRY[s.type]) out.push(s);
    }
    return out;
  }
  center(s) { const [w, d] = s.def?.size || [1, 1]; return { x: s.x + w / 2, z: s.z + d / 2 }; }
  // 0..1 how warm a spot is (1 = right next to a lit heater)
  warmthAt(x, z) {
    let best = 0;
    for (const s of this.warmSpots()) {
      const r = this.warmRadius(s), c = this.center(s);
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < r) best = Math.max(best, 1 - (d / r) * 0.6);
    }
    return best;
  }
  coolAt(x, z) {
    let best = 0;
    for (const s of this.coolSpots()) {
      const r = s.def?.cool || LEGACY_COOL[s.type], c = this.center(s);
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < r) best = Math.max(best, 1 - (d / r) * 0.5);
    }
    return best;
  }
  isSheltered(x, z) {
    for (const s of this.dryZones()) {
      const r = s.def?.dry || LEGACY_DRY[s.type], c = this.center(s);
      if (Math.hypot(x - c.x, z - c.z) < r) return true;
    }
    return false;
  }

  // fuel burners (fire pit, patio heater): light them for a cold evening, 1 wood or coal each
  lightBurners() {
    const game = this.game;
    if (this.fuelDay === this.day) return;
    this.fuelDay = this.day;
    const cold = this.coldDay();
    let unlit = 0, lit = 0;
    for (const s of game.structures?.list || []) {
      if (!s.built || s.removed || !s.def?.fuel) continue;
      if (this.lightOne(s, cold, true)) lit++; else unlit++;
    }
    if (lit && cold) game.audio.play('fire_crackle', { volume: 0.4 });
    if (unlit) this.teach.onNoFuel(unlit);
  }
  coldDay() { return this.season === 'winter' || this.rawTemp(12) < 10 || this.rawTemp(17.5) < 8; }
  // light one burner: 1 wood (or coal) on a cold day, free on a mild one / with power
  lightOne(s, cold, quiet = false) {
    const game = this.game;
    if (game.power?.powered?.(s)) s.lit = true;
    else if (!cold) s.lit = true;
    else if ((game.state.wood || 0) >= 1) { game.state.wood -= 1; game.emit('wood', game.state.wood); s.lit = true; s.fuelUsed = 'wood'; }
    else if (game.res?.take?.('coal', 1)) { s.lit = true; s.fuelUsed = 'coal'; }
    else s.lit = false;
    if (s.lit && !quiet) game.audio.play('fire_crackle', { volume: 0.35 });
    return s.lit;
  }
  // a tap on an unlit burner tries again (after the player fetched wood)
  relight(s) {
    if (!s?.def?.fuel || s.lit) return false;
    return this.lightOne(s, true);
  }
  // flames on the models, smoke and sparks from lit fires, mist from the fans
  burnerFx(dt) {
    const game = this.game;
    this._bfT = (this._bfT || 0) - dt;
    const tick = this._bfT <= 0;
    if (tick) this._bfT = 0.4;
    const t = game.rig?.target;
    const hot = this.temp > 22 || this.weather === 'heat';
    for (const s of game.structures?.list || []) {
      if (!s.built || s.removed) continue;
      const d = s.def;
      if (d?.fuel) {
        const on = this.isLit(s);
        if (tick) for (const fl of s.extraModel?.userData?.flames || []) fl.visible = on;
        if (!on || !t || Math.abs(s.x - t.x) > 30 || Math.abs(s.z - t.z) > 24) continue;
        const y = game.structures.baseY(s);
        if (s.type === 'firepit' && Math.random() < dt * 2.2) game.particles.smoke(s.x + 0.5, y + 0.9, s.z + 0.5);
        if (Math.random() < dt * 1.6) game.particles.glow.spawn(s.x + 0.5 + (Math.random() - 0.5) * 0.3, y + (s.type === 'firepit' ? 0.5 : 1.9), s.z + 0.5 + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, 0.9, 0.035, Math.random() < 0.5 ? 0xffb030 : 0xff7a20, -0.2, 0.6, 32);
      } else if (d?.cool && hot && t && Math.abs(s.x - t.x) < 30 && Math.abs(s.z - t.z) < 24) {
        // the misting fan sprays a fine mist forward
        if (Math.random() < dt * 9) {
          const y = game.structures.baseY(s);
          game.particles.fx.spawn('dust', s.x + 0.5 + (Math.random() - 0.5) * 0.6, y + 1.45 + (Math.random() - 0.5) * 0.5, s.z + 0.75, { vx: (Math.random() - 0.5) * 0.4, vy: -0.1, vz: 0.9 + Math.random() * 0.5, drag: 1.2, life: 0.9, size: 0.1, fps: 5, flags: 16 | 1024, tint: [1.3, 1.45, 1.6], bright: true });
        }
        if (tick && Math.random() < 0.04) game.audio.play('mist_hiss', { volume: 0.12 });
      }
    }
  }

  // ---------------------------------------------------------------- reviews
  // BearSystem.finishReview: cold / wet / hot visits change the stars and the words
  onReview(b, stars, text) {
    return this.bears.reviewMod(b, stars, text);
  }

  // what Reynard says in the morning about the day's weather (Game.morningQuote)
  morningLine() { return this.teach.morningLine(); }
}
