// [v26 seasons] The calendar: seasons, the weather of every day and the
// temperature. Pure functions (no game references) so the forecast, tests and
// the night tour all agree on what tomorrow brings.
//
//   year = 4 seasons x 7 days: day 1-7 spring, 8-14 summer, 15-21 autumn,
//   22-28 winter, then spring again (day 29).
//   Weather is rolled per day from a per-save seed, so the forecast never lies.
//   A few "firsts" are scripted so the player meets every weather early, in a
//   sensible order (rain on day 3, the first heat wave in summer, the first
//   snow on the first winter morning...).

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_LEN = 7;
export const WEATHERS = ['clear', 'rain', 'storm', 'snow', 'fog', 'heat', 'wind'];

export const SEASON_INFO = {
  spring: { name: 'Spring', icon: 'season_spring', color: '#f08ac0' },
  summer: { name: 'Summer', icon: 'season_summer', color: '#ffcc34' },
  autumn: { name: 'Autumn', icon: 'season_autumn', color: '#ee7e2a' },
  winter: { name: 'Winter', icon: 'season_winter', color: '#7cc2ee' },
};

// dt: temperature offset (C), amp: day/night swing, wind: game.wind, over: overcast 0..1,
// wet: ground wetness it brings, precip: rain | snow | null
export const WEATHER_INFO = {
  clear: { name: 'Clear', icon: 'wx_clear', dt: 1, amp: 6, wind: 1, over: 0, wet: 0, precip: null },
  rain: { name: 'Rain', icon: 'wx_rain', dt: -3, amp: 3, wind: 1.35, over: 0.62, wet: 1, precip: 'rain' },
  storm: { name: 'Storm', icon: 'wx_storm', dt: -4, amp: 2.5, wind: 2.4, over: 0.9, wet: 1, precip: 'rain' },
  snow: { name: 'Snow', icon: 'wx_snow', dt: -3, amp: 2.5, wind: 1.3, over: 0.55, wet: 0, precip: 'snow' },
  fog: { name: 'Fog', icon: 'wx_fog', dt: -1, amp: 2, wind: 0.55, over: 0.45, wet: 0.25, precip: null },
  heat: { name: 'Heat Wave', icon: 'wx_heat', dt: 8, amp: 7, wind: 0.7, over: 0, wet: 0, precip: null },
  wind: { name: 'Windy', icon: 'wx_wind', dt: -3, amp: 4, wind: 2.1, over: 0.2, wet: 0, precip: null },
};

// mean daily temperature by day of the season (C)
const BASE = {
  spring: [4, 7, 9, 11, 13, 15, 16],
  summer: [18, 21, 23, 25, 26, 25, 23],
  autumn: [19, 16, 13, 10, 7, 4, 1],
  winter: [-3, -6, -9, -10, -8, -5, -1],
};

// weather odds per season (early / late days shift a little, see rollWeather)
const ODDS = {
  spring: { clear: 34, rain: 30, fog: 14, wind: 12, storm: 8 },
  summer: { clear: 46, heat: 18, storm: 14, rain: 10, wind: 7, fog: 5 },
  autumn: { clear: 28, rain: 24, wind: 20, fog: 18, storm: 6, snow: 4 },
  winter: { snow: 42, clear: 30, wind: 14, fog: 10, storm: 4 },
};

export function seasonIndex(day) { return Math.floor((Math.max(1, day) - 1) / SEASON_LEN) % 4; }
export function seasonOf(day) { return SEASONS[seasonIndex(day)]; }
export function dayInSeason(day) { return (Math.max(1, day) - 1) % SEASON_LEN; }
export function yearOf(day) { return Math.floor((Math.max(1, day) - 1) / (SEASON_LEN * 4)) + 1; }
// days until the next season starts (1 = tomorrow)
export function daysToNextSeason(day) { return SEASON_LEN - dayInSeason(day); }
export function nextSeason(season) { return SEASONS[(SEASONS.indexOf(season) + 1) % 4]; }

export function hash32(a, b = 0) {
  let h = (Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 0x9e3779b9, 1597334677)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
export const rand01 = (a, b = 0) => hash32(a, b) / 4294967296;

// scripted firsts (first year only): meet every kind of weather, in a gentle order
const FIRSTS = { 1: 'clear', 2: 'clear', 3: 'rain', 5: 'fog', 9: 'heat', 12: 'storm', 15: 'clear', 17: 'wind', 19: 'rain', 22: 'snow', 23: 'snow' };

function pickOdds(odds, r) {
  let tot = 0;
  for (const v of Object.values(odds)) tot += v;
  let x = r * tot;
  for (const [k, v] of Object.entries(odds)) { x -= v; if (x <= 0) return k; }
  return 'clear';
}

// weather of a day. Blood-moon days (every 7th) keep a clear sky for the red moon.
export function rollWeather(day, seed = 1) {
  day = Math.max(1, day | 0);
  if (FIRSTS[day]) return FIRSTS[day];
  if (day % 7 === 0) return rand01(seed, day * 31 + 7) < 0.7 ? 'clear' : 'wind';
  const season = seasonOf(day), k = dayInSeason(day);
  const odds = { ...ODDS[season] };
  // shoulder days lean towards the neighbouring season
  if (season === 'autumn' && k >= 5) { odds.snow = (odds.snow || 0) + 12; odds.rain -= 8; }
  if (season === 'spring' && k <= 1) { odds.snow = 6; odds.rain += 4; }
  if (season === 'winter' && k >= 6) { odds.rain = 10; odds.snow -= 10; }
  // no two storms / heat waves in a row (the second day calms down)
  const prev = day > 1 ? rollWeatherShallow(day - 1, seed) : 'clear';
  if (prev === 'storm') odds.storm = 0;
  if (prev === 'heat') odds.heat = Math.round((odds.heat || 0) * 0.5);
  return pickOdds(odds, rand01(seed, day * 7919 + 13));
}
// same roll without the "previous day" smoothing (no recursion)
function rollWeatherShallow(day, seed) {
  if (FIRSTS[day]) return FIRSTS[day];
  if (day % 7 === 0) return 'clear';
  return pickOdds(ODDS[seasonOf(day)], rand01(seed, day * 7919 + 13));
}

// a little per-day warm / cold offset (C), stable for the day
export function dayNoise(day, seed = 1) { return (rand01(seed, day * 1013 + 5) - 0.5) * 3; }

export function baseTemp(day) {
  const s = seasonOf(day), k = dayInSeason(day);
  return BASE[s][k];
}

// temperature at a given hour of a day with a weather (C)
export function tempAt(day, hour, weather = 'clear', seed = 1) {
  const W = WEATHER_INFO[weather] || WEATHER_INFO.clear;
  let t = baseTemp(day) + W.dt + dayNoise(day, seed);
  // warmest around 3 PM, coldest around 4 AM
  t += W.amp * Math.cos(((hour - 15) / 24) * Math.PI * 2) * (hour >= 4 && hour <= 15 ? 1 : 0.9);
  if (weather === 'snow') t = Math.min(t, 0.5);
  return Math.round(t * 10) / 10;
}

// the name to show: a winter storm is a blizzard, cold rain is sleet
export function weatherLabel(weather, temp = 10) {
  if (weather === 'storm' && temp < 0.5) return 'Blizzard';
  if (weather === 'rain' && temp < 0.5) return 'Sleet';
  return WEATHER_INFO[weather]?.name || 'Clear';
}

// daily high / low
export function dayRange(day, weather, seed = 1) {
  return { hi: Math.round(tempAt(day, 15, weather, seed)), lo: Math.round(tempAt(day, 4, weather, seed)) };
}

// how much of the precipitation falls as snow at a temperature (0 rain .. 1 snow)
export function snowShare(weather, temp) {
  const p = WEATHER_INFO[weather]?.precip;
  if (!p) return 0;
  if (p === 'snow') return 1;
  return Math.max(0, Math.min(1, (1.5 - temp) / 2));
}
