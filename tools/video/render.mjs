// Renders the finished gig video from the recorded clips:
//   node tools/video/render.mjs [timeline=main] [--frames-only] [--audio-only] [--from N --to M]
// 1. director.html?tl=<timeline> under virtual time, one screenshot per frame -> out/<tl>/fNNNNN.jpg
// 2. the sound log (director cues + the clips' own game sounds) -> mix.html -> out/<tl>.wav
// 3. ffmpeg -> promo/fiverr/<tl>.mp4 (H.264 + AAC, 1280x720, 30 fps)
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { recorder } from './rec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const URL0 = process.env.VIDEO_TB || 'http://127.0.0.1:5281';
const args = process.argv.slice(2);
const tl = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || 'main';
const flag = (k) => args.includes(k);
const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const { TIMELINES, FPS } = await import(pathToFileURL(path.join(HERE, 'timeline.js')).href + '?t=' + Date.now());
const TL = TIMELINES[tl];
const OUT = path.join(HERE, 'out', tl);
const N = Math.round(TL.length * FPS);
const R = await recorder({ w: 1280, h: 720, fps: FPS });

let log = null;
if (!flag('--audio-only')) {
  fs.mkdirSync(OUT, { recursive: true });
  const page = await R.open(`${URL0}/tools/video/director.html?tl=${tl}`);
  await R.until(page, () => window.__ready === true && window.__dir);
  const from = num('--from', 0), to = num('--to', N);
  const t0 = Date.now();
  for (let i = 0; i < to; i++) {
    await page.evaluate((i) => window.__dir.frame(i), i);
    if (i >= from && i % num('--every', 1) === 0) await R.shot(page, path.join(OUT, `f${String(i).padStart(5, '0')}.jpg`));
    if (i % 150 === 0) console.log('frame', i, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  log = await page.evaluate(() => window.__audioLog);
  fs.writeFileSync(path.join(HERE, 'out', `${tl}-director-audio.json`), JSON.stringify(log));
  const errs = await page.evaluate(() => window.__vt.errors.slice(0, 5));
  if (errs.length) console.log('page errors:', errs);
  await page.context().close();
  console.log('frames done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}

if (!flag('--frames-only')) {
  log ||= JSON.parse(fs.readFileSync(path.join(HERE, 'out', `${tl}-director-audio.json`), 'utf8'));
  const events = [];
  // director: music cues, UI sounds, babble lines (one per line: the bubble and the fox both ask)
  const said = new Map();
  for (const e of log) {
    if (e.kind === 'babble') { const k = e.text; if (said.has(k) && e.t - said.get(k) < 1) continue; said.set(k, e.t); }
    events.push(e);
  }
  // the clips' own game sounds, re-timed to where each shot sits in the video
  for (const s of TL.shots) {
    if (!s.sound || !s.clip) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(HERE, 'clips', s.clip, 'meta.json'), 'utf8'));
    const c0 = (s.from || 0) / FPS, sp = s.speed ?? 1;
    for (const a of meta.audio) {
      if (a.m === 'babble' && s.babble) {
        const tv = s.at + (a.t - c0) / sp;
        if (tv >= s.at && tv < s.at + s.dur) events.push({ t: tv, kind: 'babble', voice: a.args[0], text: String(a.args[1]).replace(/\*\*/g, ''), cps: a.args[2]?.cps || 16, pitch: a.args[2]?.pitch || 1, volume: 0.5 });
        continue;
      }
      if (a.m !== 'play') continue;
      const name = a.args[0], o = a.args[1] || {};
      if (s.skip?.includes(name)) continue;
      const tv = s.at + (a.t - c0) / sp;
      if (tv < s.at || tv >= s.at + s.dur) continue;
      events.push({ t: tv, kind: 'sfx', name, volume: (o.volume ?? 0.5) * (s.sound === true ? 1 : s.sound), pitch: o.pitch ?? 1 });
    }
  }
  // no machine-gun repeats of one sound
  events.sort((a, b) => a.t - b.t);
  const last = new Map();
  const clean = events.filter((e) => {
    if (e.kind !== 'sfx') return true;
    const p = last.get(e.name);
    if (p != null && e.t - p < 0.09) return false;
    last.set(e.name, e.t);
    return true;
  });
  console.log('sound events', clean.length);
  const ctx = await R.browser.newContext();
  const mp = await ctx.newPage();
  mp.on('console', (m) => { if (m.type() !== 'log') console.log('[mix]', m.text().slice(0, 200)); });
  await mp.goto(`${URL0}/tools/video/mix.html`, { waitUntil: 'load' });
  await mp.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const res = await mp.evaluate(([ev, sec, o]) => window.__mix(ev, sec, o), [clean, TL.length, TL.mix || {}]);
  const wav = path.join(HERE, 'out', `${tl}.wav`);
  fs.writeFileSync(wav, Buffer.from(res.wav, 'base64'));
  console.log('mix peak', res.peak.toFixed(3), 'gain', res.gain.toFixed(2));
  await ctx.close();
  const dest = path.join(ROOT, 'promo', 'fiverr', `${TL.file || tl}.mp4`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // two-pass at a fixed bitrate: Fiverr takes videos up to 50 MB
  const kbps = TL.videoKbps || 4300, logf = path.join(HERE, 'out', `${tl}-x264`);
  const enc = (pass, out, extra = []) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, 'f%05d.jpg'), ...extra,
    '-c:v', 'libx264', '-preset', 'slow', '-b:v', kbps + 'k', '-pass', String(pass), '-passlogfile', logf, '-pix_fmt', 'yuv420p', ...out], { stdio: 'inherit' });
  enc(1, ['-an', '-f', 'mp4', '/dev/null']);
  enc(2, ['-movflags', '+faststart', '-c:a', 'aac', '-b:a', '160k', '-shortest', dest], ['-i', wav]);
  console.log('wrote', dest);
}
await R.close();
