#!/usr/bin/env node
// Audio verification for src/audio/audio.js, driven by Playwright's Chromium.
//
//   node tools/audio-check.mjs [--url <audio-test.html url>] [--json <out.json>] [--no-live]
//
// 1. OFFLINE  every SFX (rendered through the full master chain into an OfflineAudioContext), every
//             music mood (8 s) and the ambience beds/events: non-silent, no NaN, no clipping,
//             finished tail, no DC offset, sensible level relationships.
// 2. LIVE     the real singleton in a real AudioContext: unlock, play() incl. voice caps + garbage
//             input, mute/volume persistence, music crossfade, cheap setAmbience(), tab-hidden
//             pausing, voice-leak accounting.
// 3. STORAGE  blocked localStorage, persisted values, corrupt JSON.
//
// Needs a Vite dev server serving the repo root. If http://localhost:5173 is not reachable, one is
// started on :5199 for the duration of the run. Exit code 1 if any assertion fails.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const NO_LIVE = argv.includes('--no-live');
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* ------------------------------------------------------------------ server */

const reachable = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch (e) {
    return false;
  }
};

let server = null;
async function resolveUrl() {
  const given = opt('--url');
  if (given) return given;
  const main = 'http://localhost:5173/tools/audio-test.html';
  if (await reachable(main)) return main;
  const own = 'http://localhost:5199/tools/audio-test.html';
  if (await reachable(own)) return own;
  console.log('dev server not reachable on :5173 - starting vite on :5199');
  server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    if (await reachable(own)) return own;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('could not start a vite dev server');
}
function stopServer() {
  if (server) {
    try {
      process.kill(-server.pid);
    } catch (e) {
      /* already gone */
    }
  }
}

/* --------------------------------------------------------------- reporting */

const results = [];
let failures = 0;
function check(group, name, ok, detail = '') {
  results.push({ group, name, ok: !!ok, detail: String(detail) });
  if (!ok) failures++;
}
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

/** deals with the shared dev server hot-reloading the page mid-run */
async function withRetry(label, fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!/context was destroyed|navigation|Target closed/i.test(String(e && e.message))) throw e;
      console.log(`  (${label}: page reloaded during evaluation, retrying ${i + 1}/${tries})`);
    }
  }
  throw last;
}

/* -------------------------------------------------------------------- main */

const url = await resolveUrl();
console.log('page:', url);
const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const IGNORED_CONSOLE = /Failed to load resource|\[vite\]|favicon/i;
async function openPage(initScript, pageUrl = url) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !IGNORED_CONSOLE.test(m.text())) problems.push(`[console.${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  if (initScript) await page.addInitScript(initScript);
  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__audioReady === true, null, { timeout: 20000 });
  return { ctx, page, problems };
}

/* ----------------------------------------------------------- 1. OFFLINE */

// expected max audible length (s, incl. reverb tail); default 1.6 covers the "0.05-1.5 s" SFX brief
const MAX_DUR = { discover: 2.1, whistle: 2.8, loon: 3.2, fanfare: 2.6, gameover: 2.6, day_start: 2.4, day_end: 2.6 };

const offline = await (async () => {
  const { page, problems, ctx } = await openPage();
  const data = await withRetry('offline', () =>
    page.evaluate(async () => {
      const audio = window.audio;
      const analyze = (buf) => {
        const n = buf.length, sr = buf.sampleRate, chs = [];
        for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
        let peak = 0, nan = 0, first = -1, last = -1, dc = 0;
        for (let i = 0; i < n; i++) {
          let m = 0;
          for (const d of chs) {
            const v = d[i];
            if (v !== v || v === Infinity || v === -Infinity) { nan++; continue; }
            const a = v < 0 ? -v : v;
            if (a > m) m = a;
            dc += v;
          }
          if (m > peak) peak = m;
          if (m > 0.0015) { if (first < 0) first = i; last = i; }
        }
        let s2 = 0, cnt = 0;
        if (first >= 0) for (let i = first; i <= last; i++) for (const d of chs) { s2 += d[i] * d[i]; cnt++; }
        let tail = 0;
        for (let i = Math.max(0, n - Math.floor(sr * 0.1)); i < n; i++) for (const d of chs) { const a = Math.abs(d[i]); if (a > tail) tail = a; }
        const q = [];
        for (let k = 0; k < 4; k++) {
          let s = 0, c2 = 0;
          for (let i = Math.floor((n * k) / 4); i < Math.floor((n * (k + 1)) / 4); i++) for (const d of chs) { s += d[i] * d[i]; c2++; }
          q.push(Math.sqrt(s / c2));
        }
        return { peak, rms: cnt ? Math.sqrt(s2 / cnt) : 0, dur: first < 0 ? 0 : (last - first) / sr, tail, nan, dc: dc / (n * chs.length), quarters: q };
      };
      const out = { sfx: {}, music: {}, amb: {}, names: audio.sfxNames.slice(), moods: audio.moods.slice() };
      for (const n of audio.sfxNames) out.sfx[n] = analyze(await audio._debugRenderSfx(n, 4));
      for (const m of audio.moods) out.music[m] = analyze(await audio._debugRenderMusic(m, 8));
      const A = { day: { hour: 11, night: 0 }, dusk: { hour: 19, night: 0.5 }, night: { hour: 23, night: 1 } };
      for (const [k, o] of Object.entries(A)) out.amb[k] = analyze(await audio._debugRenderAmbience(8, o));
      out.beds = analyze(await audio._debugRenderAmbience(8, { hour: 11, night: 0, events: false }));
      // pitch/volume/pan options must survive too
      out.opts = analyze(await audio._debugRenderSfx('coin', 2, { volume: 0.5, pitch: 1.5, pan: -0.7 }));
      try { await audio._debugRenderSfx('nope', 1); out.unknownRejected = false; } catch (e) { out.unknownRejected = true; }
      return out;
    }),
  );
  check('offline', 'no console/page errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
  return data;
})();

const REQUIRED = [
  'click', 'hover', 'open', 'close', 'error', 'buy', 'coin', 'coins', 'plop', 'splash', 'bigsplash', 'bubble', 'chomp', 'nibble',
  'heart', 'hatch', 'discover', 'research', 'levelup', 'place', 'build', 'hammer', 'demolish', 'dig', 'gate', 'whistle', 'bell',
  'footsteps', 'jump', 'growl', 'roar', 'smash', 'review_good', 'review_bad', 'loon', 'honk', 'bees', 'day_start', 'day_end',
  'warning', 'gameover', 'fanfare',
];
check('offline', 'all required SFX names exist', REQUIRED.every((n) => offline.names.includes(n)), REQUIRED.filter((n) => !offline.names.includes(n)).join(','));
check('offline', 'all four music moods exist', ['title', 'day', 'rush', 'night'].every((m) => offline.moods.includes(m)));
check('offline', 'unknown sfx name rejected by debug renderer', offline.unknownRejected === true);

for (const [name, r] of Object.entries(offline.sfx)) {
  const g = 'sfx:' + name;
  check(g, 'non-silent (peak > 0.02)', r.peak > 0.02, r.peak.toFixed(3));
  check(g, 'no NaN/Inf', r.nan === 0, r.nan);
  check(g, 'no clipping (peak < 1.0)', r.peak < 1.0, r.peak.toFixed(3));
  check(g, 'headroom (peak < 0.8)', r.peak < 0.8, r.peak.toFixed(3));
  check(g, 'ends inside the 4 s window', r.tail < 0.002, r.tail.toFixed(4));
  check(g, 'no DC offset', Math.abs(r.dc) < 0.01, r.dc.toFixed(5));
  const max = MAX_DUR[name] || 1.6;
  check(g, `length <= ${max} s`, r.dur <= max, r.dur.toFixed(2));
  check(g, 'length >= 0.005 s', r.dur >= 0.005, r.dur.toFixed(3));
}
const P = (n) => offline.sfx[n].peak;
check('levels', 'UI: hover quieter than click', P('hover') < P('click'), `${P('hover').toFixed(3)} < ${P('click').toFixed(3)}`);
check('levels', 'UI: click is quiet (< 0.2)', P('click') < 0.2, P('click').toFixed(3));
check('levels', 'hammer/footsteps are quiet ticks (< 0.35)', P('hammer') < 0.2 && P('footsteps') < 0.35, `${P('hammer').toFixed(3)} / ${P('footsteps').toFixed(3)}`);
check('levels', 'big moments louder than UI', Math.min(P('bigsplash'), P('roar'), P('fanfare'), P('smash')) > 2 * P('click'));
check('levels', 'options: volume/pitch/pan render non-silent', offline.opts.peak > 0.02 && offline.opts.nan === 0, offline.opts.peak.toFixed(3));

for (const [mood, r] of Object.entries(offline.music)) {
  const g = 'music:' + mood;
  check(g, 'non-silent (peak > 0.02, rms > 0.01)', r.peak > 0.02 && r.rms > 0.01, `peak ${r.peak.toFixed(3)} rms ${r.rms.toFixed(4)}`);
  check(g, 'no NaN/Inf', r.nan === 0, r.nan);
  check(g, 'no clipping (peak < 1.0, headroom < 0.6)', r.peak < 0.6, r.peak.toFixed(3));
  check(g, 'quiet background (rms < 0.12)', r.rms < 0.12, r.rms.toFixed(4));
  check(g, 'no dead quarter (each 2 s rms > 0.004)', r.quarters.every((x) => x > 0.004), r.quarters.map((x) => x.toFixed(4)).join(' '));
  check(g, 'no DC offset', Math.abs(r.dc) < 0.01, r.dc.toFixed(5));
}
for (const [k, r] of Object.entries(offline.amb)) {
  const g = 'ambience:' + k;
  check(g, 'non-silent (peak > 0.02)', r.peak > 0.02, r.peak.toFixed(3));
  check(g, 'no NaN/Inf', r.nan === 0, r.nan);
  check(g, 'gentle (peak < 0.6, rms < 0.1)', r.peak < 0.6 && r.rms < 0.1, `peak ${r.peak.toFixed(3)} rms ${r.rms.toFixed(4)}`);
  check(g, 'no DC offset', Math.abs(r.dc) < 0.01, r.dc.toFixed(5));
}
check('ambience:beds', 'wind + water beds audible but gentle', offline.beds.rms > 0.005 && offline.beds.rms < 0.08 && offline.beds.peak < 0.4, `peak ${offline.beds.peak.toFixed(3)} rms ${offline.beds.rms.toFixed(4)}`);

/* -------------------------------------------------------------- 2. LIVE */

let liveInfo = null;
if (!NO_LIVE) {
  const { page, problems, ctx } = await openPage();
  const timeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + label)), ms))]);

  // --- before any gesture
  const pre = await page.evaluate(() => {
    const a = window.audio, o = {};
    try {
      a.play('coin');
      a.play('nonexistent');
      a.setAmbience({ hour: 12, night: 0 });
      a.update(0.016);
      a.setMusic('day'); // requested before unlock: must start once unlocked
      o.threw = false;
    } catch (e) {
      o.threw = String(e);
    }
    o.state = a._debugState();
    return o;
  });
  check('live', 'calls before unlock() never throw', pre.threw === false, pre.threw);
  check('live', 'no AudioContext before unlock()', pre.state.ctxState === 'none' && pre.state.stats.voices === 0, JSON.stringify(pre.state.stats));

  // --- a real user gesture (the test page unlocks on pointerdown)
  await page.mouse.click(30, 30);

  const live = await timeout(
    page.evaluate(async () => {
      const audio = window.audio;
      const out = [];
      const ok = (name, cond, detail = '') => out.push({ name, ok: !!cond, detail: String(detail) });
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const st = () => audio._debugState();
      const waitFor = async (fn, ms = 3000) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          if (fn()) return true;
          await sleep(25);
        }
        return !!fn();
      };
      const info = {};

      // --- unlock
      await waitFor(() => st().ctxState === 'running');
      ok('unlocked and running after a gesture', audio.isUnlocked() && st().ctxState === 'running', st().ctxState);
      const t1 = st().currentTime;
      await sleep(300);
      ok('audio clock advances', st().currentTime > t1, `${t1.toFixed(3)} -> ${st().currentTime.toFixed(3)}`);
      ok('music requested before unlock starts after unlock', st().mood === 'day' && st().timer, `mood ${st().mood} timer ${st().timer}`);
      for (let i = 0; i < 50; i++) audio.unlock();
      ok('unlock() is safe to call repeatedly', st().ctxState === 'running');
      audio.setMusic(null);
      audio.setVolumes({ ambience: 0 }); // keep ambience events out of the voice accounting below
      await sleep(2300);

      // --- every SFX once, no exceptions, nothing dropped
      const s0 = st().stats;
      for (const n of audio.sfxNames) {
        audio.play(n, { volume: 0.6 });
        await sleep(45);
      }
      const s1 = st().stats;
      ok('every SFX plays (one voice each, none dropped)', s1.voices - s0.voices === audio.sfxNames.length && s1.dropped === s0.dropped, `voices +${s1.voices - s0.voices}/${audio.sfxNames.length}, dropped +${s1.dropped - s0.dropped}`);
      info.peakLive = 0;

      // --- options: pitch / pan / volume / delay
      await waitFor(() => st().liveVoices === 0, 6000);
      const s2 = st().stats;
      audio.play('coin', { volume: 0.5, pitch: 1.4, pan: -1, delay: 0.1 });
      audio.play('bubble', { volume: 2, pitch: 0.5, pan: 1 });
      ok('play() accepts volume/pitch/pan/delay', st().stats.voices - s2.voices === 2);
      audio.play('bell', { volume: 0 });
      ok('volume 0 is skipped', st().stats.voices - s2.voices === 2);

      // --- voice limiting: per name and global
      await waitFor(() => st().liveVoices === 0, 6000);
      const s3 = st().stats;
      for (let i = 0; i < 20; i++) audio.play('coin', { delay: i * 0.02 });
      ok("per-name cap: 20 'coin' requests -> <= 8 sounding", st().liveVoices <= 8 && st().stats.dropped - s3.dropped >= 10, `live ${st().liveVoices}, dropped +${st().stats.dropped - s3.dropped}`);
      await waitFor(() => st().liveVoices === 0, 6000);
      let n = 0;
      for (let round = 0; round < 8; round++) for (const name of audio.sfxNames) audio.play(name, { delay: round * 0.13 + (n++ % 7) * 0.004 });
      ok('global cap: <= 48 sounding voices', st().liveVoices <= 48 && st().liveVoices > 20, `live ${st().liveVoices}`);
      await waitFor(() => st().liveVoices === 0, 9000);
      ok('all SFX voices finish', st().liveVoices === 0, st().liveVoices);
      await sleep(600);
      const s4 = st().stats;
      ok('every created voice was disposed (no node leak)', s4.voices === s4.disposed, `created ${s4.voices}, disposed ${s4.disposed}`);

      // --- mute
      audio.setMuted(true);
      ok('setMuted(true)', audio.isMuted() === true);
      ok("mute persisted in localStorage 'tbme.muted'", localStorage.getItem('tbme.muted') === '1', localStorage.getItem('tbme.muted'));
      const v5 = st().stats.voices;
      audio.play('coin');
      audio.play('whistle');
      ok('play() is a silent no-op while muted', st().stats.voices === v5);
      await sleep(700);
      ok('muted context is suspended (no CPU burn)', st().ctxState === 'suspended', st().ctxState);
      const r = audio.toggleMute();
      ok('toggleMute() returns the new state (false)', r === false && audio.isMuted() === false);
      ok('unmute persisted', localStorage.getItem('tbme.muted') === '0');
      await waitFor(() => st().ctxState === 'running', 2000);
      ok('unmuting resumes the context', st().ctxState === 'running', st().ctxState);
      ok('toggleMute() true again', audio.toggleMute() === true && audio.isMuted());
      audio.setMuted(false);
      await waitFor(() => st().ctxState === 'running', 2000);
      // race: unmute just as the delayed ctx.suspend() (300 ms after muting) is in flight
      let raceFail = null;
      for (const gap of [150, 290, 300, 305, 310, 330, 400]) {
        audio.setMuted(true);
        await sleep(gap);
        audio.setMuted(false);
        await sleep(650);
        if (st().ctxState !== 'running') { raceFail = `gap ${gap} ms -> ${st().ctxState}`; break; }
      }
      ok('mute -> quick unmute never leaves the context suspended', raceFail === null, raceFail);

      // --- volumes
      audio.setVolumes({ master: 0.7, sfx: 0.6, music: 0.3, ambience: 0.2 });
      let v = audio.getVolumes();
      ok('setVolumes/getVolumes round trip', v.master === 0.7 && v.sfx === 0.6 && v.music === 0.3 && v.ambience === 0.2, JSON.stringify(v));
      audio.setVolumes({ music: 0.9 });
      v = audio.getVolumes();
      ok('partial objects only change given keys', v.music === 0.9 && v.master === 0.7 && v.sfx === 0.6, JSON.stringify(v));
      audio.setVolumes({ master: 5, sfx: -2, ambience: NaN, music: 'abc' });
      v = audio.getVolumes();
      ok('volumes clamp to 0..1 and ignore junk', v.master === 1 && v.sfx === 0 && v.ambience === 0.2 && v.music === 0.9, JSON.stringify(v));
      const stored = JSON.parse(localStorage.getItem('tbme.volumes') || 'null');
      ok("volumes persisted in localStorage 'tbme.volumes'", stored && stored.master === 1 && stored.sfx === 0 && stored.music === 0.9, JSON.stringify(stored));
      audio.setVolumes(null);
      audio.setVolumes('x');
      audio.setVolumes({ master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.6 });
      ok('volumes restored to defaults', JSON.stringify(audio.getVolumes()) === JSON.stringify({ master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.6 }));

      // --- music
      audio.setMusic('day');
      await sleep(400);
      audio._debugLevel(); // creates the analyser
      let maxRms = 0;
      for (let i = 0; i < 12; i++) {
        await sleep(200);
        maxRms = Math.max(maxRms, audio._debugLevel().rms);
      }
      ok("setMusic('day') is audible on the live output", st().mood === 'day' && maxRms > 0.002, `rms ${maxRms.toFixed(4)}`);
      const notes0 = st().stats.notes;
      audio.setMusic('day');
      ok('same mood again is a no-op', st().fading === 0 && st().mood === 'day');
      audio.setMusic('rush');
      await sleep(250);
      ok('crossfade: new mood sounding, old one fading', st().mood === 'rush' && st().fading === 1, `mood ${st().mood} fading ${st().fading}`);
      await sleep(2600);
      ok('faded-out mood is disposed after ~1.5 s', st().fading === 0, st().fading);
      ok('scheduler keeps producing notes (rush)', st().stats.notes - notes0 > 40, `+${st().stats.notes - notes0} notes`);
      for (const m of ['title', 'night', 'day']) {
        audio.setMusic(m);
        await sleep(1200);
        ok(`setMusic('${m}')`, st().mood === m, st().mood);
      }
      audio.setMusic('bogus');
      ok('unknown mood behaves like null', st().mood === null && audio.getMusic() === null, st().mood);
      audio.setMusic('night');
      audio.setMusic('title');
      audio.setMusic('rush');
      audio.setMusic('day');
      await sleep(300);
      ok('rapid mood switching stays bounded', st().fading <= 3 && st().mood === 'day', `fading ${st().fading}`);
      audio.setMusic(null);
      await sleep(2200);
      ok('setMusic(null) fades everything out', st().mood === null && st().fading === 0, `mood ${st().mood} fading ${st().fading}`);

      // --- ambience: cheap per-frame call
      audio.setVolumes({ ambience: 0.6 });
      const vBefore = st().stats.voices;
      const t0 = performance.now();
      for (let i = 0; i < 5000; i++) audio.setAmbience({ hour: 23.5, night: 1 });
      const dt = performance.now() - t0;
      info.ambCallMs = dt / 5000;
      ok('setAmbience x5000 is cheap (< 50 ms total)', dt < 50, `${dt.toFixed(2)} ms`);
      ok('setAmbience creates no nodes', st().stats.voices === vBefore);
      audio.setAmbience({ hour: 'x', night: 'y' });
      audio.setAmbience(null);
      audio.setAmbience({});
      audio.setAmbience({ hour: 99, night: 7 });
      audio.setAmbience({ hour: -5, night: -1 });
      await sleep(300);
      // the test page's frame loop feeds window.__amb into setAmbience() every frame, like a game would
      window.__amb.hour = 23;
      window.__amb.night = 1;
      await sleep(200);
      ok('per-frame setAmbience() reaches the engine', st().amb.hour === 23 && st().amb.night === 1, JSON.stringify(st().amb));
      const vNight = st().stats.voices;
      await sleep(3500);
      ok('night ambience fires crickets/owls over time', st().stats.voices - vNight >= 5, `+${st().stats.voices - vNight} events in 3.5 s`);
      window.__amb.hour = 12;
      window.__amb.night = 0;

      // --- tab hidden: scheduler paused, context suspended, then resumed
      audio.setMusic('day');
      await sleep(500);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      await sleep(60);
      ok('hidden tab: music/ambience scheduling paused', st().hidden === true && st().timer === false, `timer ${st().timer}`);
      const vh = st().stats.voices;
      audio.play('coin');
      ok('hidden tab: play() is a no-op', st().stats.voices === vh);
      await sleep(600);
      ok('hidden tab: context suspended', st().ctxState === 'suspended', st().ctxState);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => st().ctxState === 'running' && st().timer, 2500);
      ok('visible again: context running and scheduler resumed', st().ctxState === 'running' && st().timer === true && st().mood === 'day', `${st().ctxState} timer ${st().timer}`);
      const nv = st().stats.notes;
      await sleep(1500);
      ok('music continues after resume', st().stats.notes > nv, `+${st().stats.notes - nv}`);
      audio.setMusic(null);

      // --- garbage in, no exceptions out
      let threw = null;
      try {
        const junk = [undefined, null, 0, 1, '', 'coin', NaN, {}, [], () => {}, true, Symbol('x')];
        for (const j of junk) {
          audio.play(j);
          audio.play('coin', j);
          audio.setMusic(j);
          audio.setAmbience(j);
          audio.setVolumes(j);
        }
        audio.play('coin', { volume: NaN, pitch: -5, pan: 99, delay: 'x' });
        audio.play('coin', { volume: 1e9, pitch: 1e9, pan: -1e9, delay: 1e9 });
        audio.play('click', { volume: Infinity, pitch: Infinity });
        audio.setMuted(undefined);
        audio.setMuted('yes');
        audio.setMuted(false);
        audio.update();
        audio.update('x');
      } catch (e) {
        threw = String(e && e.stack);
      }
      ok('garbage input never throws', threw === null, threw);
      await sleep(400);
      ok('context still healthy afterwards', st().ctxState === 'running' && st().unlocked && !st().muted, JSON.stringify({ s: st().ctxState, m: st().muted }));
      audio.setMusic(null);
      return { out, info };
    }),
    150000,
    'live stage',
  );
  for (const r of live.out) check('live', r.name, r.ok, r.detail);
  liveInfo = live.info;
  check('live', 'no console/page errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------- 2b. self-unlock (no page help) */

if (!NO_LIVE) {
  // ?nounlock: the test page does not call audio.unlock() itself, only the module's own gesture hooks can
  const nounlock = new URL(url);
  nounlock.search = '?nounlock';
  const { page, problems, ctx } = await openPage(null, nounlock.toString());
  const before = await page.evaluate(() => window.audio._debugState().ctxState);
  await page.mouse.click(30, 30);
  await page.waitForFunction(() => window.audio._debugState().ctxState === 'running', null, { timeout: 4000 }).catch(() => {});
  const after = await page.evaluate(() => {
    window.audio.play('coin');
    const s = window.audio._debugState();
    return { state: s.ctxState, unlocked: s.unlocked, voices: s.stats.voices };
  });
  check('live', 'self-unlock: no context before any gesture', before === 'none', before);
  check('live', 'self-unlock: a plain click unlocks audio without the page calling unlock()', after.state === 'running' && after.unlocked && after.voices >= 1, JSON.stringify(after));
  check('live', 'self-unlock: no console/page errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ 3. STORAGE */

{
  // localStorage that throws on access (private mode / blocked cookies)
  const blocked = await openPage(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  const b = await blocked.page.evaluate(() => {
    const a = window.audio, o = {};
    try {
      o.vols = a.getVolumes();
      a.setVolumes({ music: 0.1 });
      a.setMuted(true);
      o.muted = a.isMuted();
      o.toggled = a.toggleMute();
      o.threw = false;
    } catch (e) {
      o.threw = String(e);
    }
    return o;
  });
  check('storage', 'blocked localStorage: loads and works, never throws', b.threw === false && b.vols.master === 0.8 && b.muted === true && b.toggled === false, JSON.stringify(b));
  check('storage', 'blocked localStorage: no console/page errors', blocked.problems.length === 0, blocked.problems.join(' | '));
  await blocked.ctx.close();

  // persisted values are honoured (and sanitised)
  const saved = await openPage(() => {
    localStorage.setItem('tbme.muted', '1');
    localStorage.setItem('tbme.volumes', JSON.stringify({ master: 0.3, sfx: 2, music: 'x', ambience: 0.25, extra: 1 }));
  });
  const s = await saved.page.evaluate(() => ({ muted: window.audio.isMuted(), v: window.audio.getVolumes() }));
  check('storage', 'persisted mute is restored', s.muted === true, s.muted);
  check('storage', 'persisted volumes restored and sanitised', s.v.master === 0.3 && s.v.sfx === 1 && s.v.music === 0.5 && s.v.ambience === 0.25, JSON.stringify(s.v));
  await saved.ctx.close();

  // corrupt JSON falls back to defaults
  const corrupt = await openPage(() => {
    localStorage.setItem('tbme.volumes', '{not json');
    localStorage.setItem('tbme.muted', 'garbage');
  });
  const c = await corrupt.page.evaluate(() => ({ muted: window.audio.isMuted(), v: window.audio.getVolumes() }));
  check('storage', 'corrupt storage falls back to defaults', c.muted === false && c.v.master === 0.8 && c.v.sfx === 0.9 && c.v.music === 0.5 && c.v.ambience === 0.6, JSON.stringify(c));
  await corrupt.ctx.close();
}

await browser.close();
stopServer();

/* ---------------------------------------------------------------- report */

const f2 = (x, d = 3) => x.toFixed(d);
console.log('\nSFX (offline render through master chain, default volumes, 4 s window)');
console.log(pad('name', 13) + rpad('peak', 7) + rpad('rms', 8) + rpad('len(s)', 8) + rpad('tail', 8));
for (const [n, r] of Object.entries(offline.sfx)) console.log(pad(n, 13) + rpad(f2(r.peak), 7) + rpad(f2(r.rms, 4), 8) + rpad(f2(r.dur, 2), 8) + rpad(f2(r.tail, 4), 8));
console.log('\nMUSIC (8 s offline)');
console.log(pad('mood', 13) + rpad('peak', 7) + rpad('rms', 8) + '  2s-quarter rms');
for (const [n, r] of Object.entries(offline.music)) console.log(pad(n, 13) + rpad(f2(r.peak), 7) + rpad(f2(r.rms, 4), 8) + '  ' + r.quarters.map((x) => f2(x, 3)).join(' '));
console.log('\nAMBIENCE (8 s offline, beds + forced events)');
console.log(pad('state', 13) + rpad('peak', 7) + rpad('rms', 8));
for (const [n, r] of Object.entries(offline.amb)) console.log(pad(n, 13) + rpad(f2(r.peak), 7) + rpad(f2(r.rms, 4), 8));
console.log(pad('beds only', 13) + rpad(f2(offline.beds.peak), 7) + rpad(f2(offline.beds.rms, 4), 8));
if (liveInfo) console.log(`\nsetAmbience() cost: ${(liveInfo.ambCallMs * 1000).toFixed(2)} us per call`);

const groups = new Map();
for (const r of results) {
  if (!groups.has(r.group)) groups.set(r.group, { pass: 0, fail: [] });
  const g = groups.get(r.group);
  if (r.ok) g.pass++;
  else g.fail.push(r);
}
console.log('\nASSERTIONS');
for (const [name, g] of groups) {
  if (!g.fail.length) continue;
  for (const f of g.fail) console.log(`  FAIL [${name}] ${f.name}  (${f.detail})`);
}
const live = results.filter((r) => r.group === 'live' || r.group === 'storage');
if (live.length) {
  console.log('\nlive / storage checks:');
  for (const r of live) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail && !r.ok ? '  (' + r.detail + ')' : ''}`);
}
const total = results.length;
console.log(`\n${total - failures}/${total} assertions passed${failures ? `, ${failures} FAILED` : ''}`);

const jsonOut = opt('--json');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ offline, results }, null, 1));
process.exit(failures ? 1 : 0);
