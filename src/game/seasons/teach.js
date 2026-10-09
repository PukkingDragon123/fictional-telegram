// [v26 seasons] Reynard teaches the seasons as they happen: a line when the
// season or the weather turns, a warning before winter, first-time notes the
// first time bears shiver / melt / get soaked, frost, the salmon run...
// Every tip shows once per save (state.seasons.tips); lines wait for a quiet
// moment in the day (never over the report, the night or a cutscene).
import { SEASON_INFO, WEATHER_INFO, nextSeason, daysToNextSeason, dayInSeason, seasonOf } from './calendar.js';

const SEASON_LINES = {
  spring: ['Spring! Blossoms, mud and fish in love. Breeding season, partner.', 'Spring again. The fish are frisky. Feed them, then let nature do the rest.'],
  summer: ['Summer! Fish are lively, bears are sweaty. Watch out for heat waves.', 'Summer. Long days, hot fur, happy bass.'],
  autumn: ['Autumn! The fish eat like bears now. And the salmon are coming.', 'Leaves are turning. Fish are feasting. Winter is plotting.'],
  winter: ['Winter. Snow. Cold butts. Heaters and fire pits, NOW.', 'Winter is here. The bears shiver, the fish sulk, the trout throw a party.'],
};
const WEATHER_FIRST = {
  rain: 'Rain today. Wet fur, grumpy bears. A Rain Shelter would sell like hot fish.',
  storm: 'Storm coming! Thunder spooks the customers. Keep them dry, keep them paying.',
  snow: 'SNOW. Pretty. Freezing. The bears will shiver all evening.',
  fog: 'Fog. Can\'t see a thing. The bears can still smell fish, sadly for the fish.',
  heat: 'HEAT WAVE. Bears melt, trout sulk. Misting fans, shade, the pond.',
  wind: 'Windy! Leaves everywhere. Hold on to your hats. And your fish.',
};
const WEATHER_AGAIN = {
  rain: ['Rain again. Umbrellas out.', 'Wet one today. Shelters, partner.', 'Drizzle. The fish don\'t mind. The bears do.'],
  storm: ['Another storm. Batten down the fish.', 'Thunder today. Bears will jump.'],
  snow: ['More snow. Fire up the heaters.', 'Snow day. Wood for the fire pits?'],
  fog: ['Foggy morning. Spooky. Profitable.', 'Fog again. Mind the bears you can\'t see.'],
  heat: ['Heat wave. Fans on, bears in the pond.', 'Scorcher today. Shade sells.'],
  wind: ['Windy again.', 'Gusty. The leaves are escaping.'],
};

export class Teacher {
  constructor(game, seasons) {
    this.game = game;
    this.S = seasons;
    this.queue = [];
    this.cool = 0;
    this.dayT = 0;
  }

  get tips() { return this.S.st.tips; }
  once(key) { if (this.tips[key]) return false; this.tips[key] = 1; return true; }

  // queue a line; it plays in a quiet moment of the day
  say(text, mood = 'info', { key = null, delay = 0, prio = 0 } = {}) {
    if (key && !this.once(key)) return;
    this.queue.push({ text, mood, at: delay, prio });
    this.queue.sort((a, b) => b.prio - a.prio);
  }

  quiet() {
    const g = this.game;
    const ph = g.state.phase;
    if (ph !== 'day' && ph !== 'rush') return false;
    if (g.cutscene?.active || g.npcScenes?.busy || g.tutorial?.active || g.lab?.active || g.homes?.active || g.titleMode) return false;
    if (!g.ui || g.ui.foxTalking?.()) return false;
    return true;
  }

  update(dt) {
    this.cool -= dt;
    if (this.game.state.phase === 'day') this.dayT += dt;
    if (!this.queue.length || this.cool > 0 || !this.quiet()) return;
    const q = this.queue[0];
    if (q.at > this.dayT && this.game.state.phase === 'day') return;
    this.queue.shift();
    this.game.notify(q.text, q.mood, { dur: Math.min(6, 2.6 + q.text.length * 0.045) });
    this.cool = 5.5;
  }

  // ---------------------------------------------------------------- the morning
  onDay(day, prevSeason) {
    const S = this.S;
    this.dayT = 0;
    this.queue = this.queue.filter((q) => q.prio >= 5); // yesterday's chatter is stale
    if (day <= 1 && !this.game.skipTutorial && this.game.state.tutorial < 99 && !this.game.state.tutorialDone) return; // the tutorial talks enough on day 1
    const season = S.season, k = dayInSeason(day);
    // the season turned overnight
    if (prevSeason && prevSeason !== season) {
      const lines = SEASON_LINES[season];
      this.say(lines[this.tips['season_' + season] ? 1 : 0], season === 'winter' ? 'warn' : 'excited', { delay: 2, prio: 3 });
      this.tips['season_' + season] = 1;
      if (season === 'autumn' && !this.game.sectionOpen?.('weather')) this.say('Brr, I feel it coming. Decrypt Weather Gear in the Lab before winter. Fire pits! Heaters!', 'warn', { key: 'gear_hint', delay: 9, prio: 2 });
      if (season === 'winter' && !S.warmSpots().length && !this.game.structures.list.some((s) => s.def?.warm)) this.say('No fire pit, no heater. The bears will freeze and the reviews will too.', 'warn', { delay: 10, prio: 2 });
      if (season === 'spring') this.say('Spring fever: fish breed like crazy this week. Feed them up!', 'happy', { key: 'spring_fish', delay: 14, prio: 1 });
      if (season === 'winter') this.say('Fish are sluggish in winter: slow, deep, barely breeding. The trout love it, though.', 'info', { key: 'winter_fish', delay: 16, prio: 1 });
      if (season === 'autumn') this.say('Autumn feeding frenzy: the fish eat twice as much. More food, fatter fish.', 'info', { key: 'autumn_fish', delay: 16, prio: 1 });
    }
    // warn before winter (2 days, then tomorrow)
    const left = daysToNextSeason(day);
    if (season === 'autumn' && left <= 2) {
      const warm = S.warmSpots().length || this.game.structures.list.some((s) => s.def?.warm && s.built);
      if (left === 2) this.say(warm ? 'Winter in 2 days. Stock wood for the fire pits, partner.' : 'Winter in 2 days. Bears hate cold butts. Heaters. Now.', 'warn', { delay: 3, prio: 4 });
      else this.say(warm ? 'Winter tomorrow! Wood. Fire. Money.' : 'Winter TOMORROW. Still no heater? Bold. Stupid, but bold.', 'warn', { delay: 3, prio: 4 });
    } else if (left === 1 && season !== 'autumn') {
      const nx = nextSeason(season);
      const t = { summer: 'Summer tomorrow. Sunscreen for the fish. Kidding. Mostly.', autumn: 'Autumn tomorrow: leaves, salmon, fat hungry fish.', spring: 'Spring tomorrow. Thaw! Love! Mud!' }[nx];
      if (t) this.say(t, 'info', { delay: 6, prio: 1 });
    }
    // today's weather
    const w = S.weather;
    if (w !== 'clear' && WEATHER_FIRST[w]) {
      if (!this.tips['wx_' + w]) { this.tips['wx_' + w] = 1; this.say(WEATHER_FIRST[w], w === 'storm' || w === 'heat' || w === 'snow' ? 'warn' : 'info', { delay: 4, prio: 3 }); }
      else if (Math.random() < 0.45) { const L = WEATHER_AGAIN[w]; this.say(L[Math.floor(Math.random() * L.length)], 'info', { delay: 5, prio: 0 }); }
    } else if (w === 'clear' && season === 'winter' && Math.random() < 0.4) this.say('Clear and freezing. Fire up the heaters tonight.', 'info', { delay: 5, prio: 0 });
    void k; void SEASON_INFO; void WEATHER_INFO; void seasonOf;
  }

  // ---------------------------------------------------------------- the feast
  onRush() {
    const S = this.S;
    this.rushT = 0;
    const evening = S.rawTemp(17.5);
    if (evening < 4 && !this.tips.cold_rush) {
      const warm = S.warmSpots().length;
      this.say(warm ? 'Cold one tonight. Watch them huddle round the fire. Warm bears pay.' : 'Cold evening! Bears will shiver. Heaters or a fire pit, partner. Cold bears don\'t tip.', 'warn', { key: 'cold_rush', prio: 4 });
    } else if (evening > 29) this.say('Hot evening. Bears will cool off in the pond. Or in a misting fan, if somebody built one.', 'info', { key: 'hot_rush', prio: 3 });
    else if (S.info.precip && S.snowShare < 0.5) this.say('Rainy feast. Umbrellas and soggy suits. Shelters keep reviews dry.', 'info', { key: 'rain_rush', prio: 3 });
  }

  // called from the bear system the first time something happens
  onBuilt(s) {
    if (!s?.def) return;
    if (s.def.fuel) this.say('A fire needs fuel: 1 wood (or coal) each cold evening. Keep the Wood Garage stocked.', 'info', { key: 'fuel_tip', prio: 2 });
    if (s.def.greenhouse) this.say('Crops near the Greenhouse keep growing all winter. Frost can\'t touch them.', 'happy', { key: 'gh_tip', prio: 2 });
    if (s.def.dry) this.say('Bears in the rain will run for that roof. Dry bears, happy bears.', 'happy', { key: 'dry_tip', prio: 1 });
    if (s.def.cool) this.say('Hot bears love a misting fan. Like a spa, but cheaper. For me.', 'happy', { key: 'cool_tip', prio: 1 });
  }

  // the first time the player sees bears react (called by bearsWx)
  firstBear(kind) {
    if (this.tips['bear_' + kind]) return;
    const L = {
      cold: ['They\'re shivering! Chattering teeth, frosty noses. Get them to a fire pit or a heater.', 'warn'],
      hot: ['They\'re melting! Shade, a misting fan, or a dip in the pond.', 'warn'],
      soak: ['Soggy bears leave soggy reviews. A Rain Shelter keeps them dry.', 'info'],
      warmed: ['Look at them huddle round the fire. Warm bears tip. Cozy is profitable.', 'happy'],
      left: ['That one went home FREEZING. Expect a review. Brr.', 'no'],
    }[kind];
    if (L) this.say(L[0], L[1], { key: 'bear_' + kind, prio: 4 });
  }

  onNoFuel(n) {
    this.say(`${n > 1 ? `${n} fires are` : 'A fire is'} out of fuel! Wood from the Wood Garage, or coal from the mine. Cold bears, cold cash.`, 'warn', { key: 'nofuel_' + this.game.state.day, prio: 5 });
  }

  onFrost(killed) {
    const names = [...new Set(killed.map((s) => s.def?.name || s.type))].slice(0, 2).join(' and ');
    if (!this.tips.frost) { this.tips.frost = 1; this.say(`Frost got the ${names.toLowerCase()}! Tender crops die in winter. A Greenhouse keeps them alive.`, 'warn', { prio: 5, delay: 2 }); }
    else this.say(`Frost again. Lost the ${names.toLowerCase()}.`, 'no', { prio: 3, delay: 2 });
  }

  onSalmon(sp, born) {
    const name = this.game.speciesById?.(sp)?.name || 'salmon';
    this.say(`SALMON RUN! ${born.length} wild ${name} swam up the creek into our pond. Free dinner, partner.`, 'excited', { prio: 6, delay: 3 });
    const f = born[0];
    if (f) this.game.rig?.lookAt?.(f.x, f.z);
  }

  // morning quote override (unused by default: Game.morningQuote has its own)
  morningLine() {
    const S = this.S;
    const w = S.weather;
    if (w === 'clear') return null;
    return WEATHER_AGAIN[w]?.[0] || null;
  }
}
