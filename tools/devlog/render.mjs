// Renders devlog days to vertical MP4s (1080x1920, 30 fps) for TikTok / Reels:
//   node tools/devlog/render.mjs day01 [day02 ...] [--frames-only] [--audio-only] [--every N] [--from N --to M]
// 1. director.html?day=<day> under virtual time, one screenshot per frame -> tools/devlog/out/<day>/
// 2. the sound log (director cues + the clips' own sounds) -> tools/video/mix.html -> out/<day>.wav
// 3. ffmpeg (two-pass H.264 + AAC) -> promo/devlog/<file>.mp4
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { recorder } from '../video/rec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CLIPS = path.join(ROOT, 'tools/video/clips');
const URL0 = process.env.VIDEO_TB || 'http://127.0.0.1:5281';
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const days = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const { DAYS, FPS } = await import(pathToFileURL(path.join(HERE, 'days.js')).href + '?t=' + Date.now());
const R = await recorder({ w: 1080, h: 1920, fps: FPS, quality: 94 });

for (const day of days) {
  const D = DAYS[day];
  if (!D) { console.log('no day', day); continue; }
  const OUT = path.join(HERE, 'out', day);
  const N = Math.round(D.length * FPS);
  let log = null;
  if (!flag('--audio-only')) {
    fs.mkdirSync(OUT, { recursive: true });
    const page = await R.open(`${URL0}/tools/devlog/director.html?day=${day}`, { viewport: [1080, 1920] });
    await R.until(page, () => window.__ready === true && window.__dir);
    const from = num('--from', 0), to = Math.min(N, num('--to', N));
    const t0 = Date.now();
    for (let i = 0; i < to; i++) {
      await page.evaluate((i) => window.__dir.frame(i), i);
      if (i >= from && i % num('--every', 1) === 0) await R.shot(page, path.join(OUT, `f${String(i).padStart(5, '0')}.jpg`));
      if (i % 150 === 0) console.log(day, 'frame', i, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    log = await page.evaluate(() => window.__audioLog);
    fs.writeFileSync(path.join(HERE, 'out', `${day}-director-audio.json`), JSON.stringify(log));
    const errs = await page.evaluate(() => window.__vt.errors.slice(0, 5));
    if (errs.length) console.log('page errors:', errs);
    await page.context().close();
    console.log(day, 'frames done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  if (flag('--frames-only')) continue;

  log ||= JSON.parse(fs.readFileSync(path.join(HERE, 'out', `${day}-director-audio.json`), 'utf8'));
  const events = [...log];
  // the clips' own sounds (splashes, chomps, coins...), re-timed to where each shot sits
  for (const s of D.shots) {
    if (!s.sound || !s.clip) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(CLIPS, s.clip, 'meta.json'), 'utf8'));
    const c0 = (s.from || 0) / FPS, sp = s.speed ?? 1;
    for (const a of meta.audio) {
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
    if (p != null && e.t - p < 0.07) return false;
    last.set(e.name, e.t);
    return true;
  });
  console.log(day, 'sound events', clean.length);
  const ctx = await R.browser.newContext();
  const mp = await ctx.newPage();
  mp.on('console', (m) => { if (m.type() !== 'log') console.log('[mix]', m.text().slice(0, 200)); });
  await mp.goto(`${URL0}/tools/video/mix.html`, { waitUntil: 'load' });
  await mp.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const res = await mp.evaluate(([ev, sec, o]) => window.__mix(ev, sec, o), [clean, D.length, D.mix || { music: 1, sfx: 1 }]);
  const wav = path.join(HERE, 'out', `${day}.wav`);
  fs.writeFileSync(wav, Buffer.from(res.wav, 'base64'));
  console.log(day, 'mix peak', res.peak.toFixed(3), 'gain', res.gain.toFixed(2));
  await ctx.close();
  const dest = path.join(ROOT, 'promo', 'devlog', `${D.file || day}.mp4`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // two-pass at a fixed bitrate: crisp text, and every file stays well under 30 MB
  const kbps = D.videoKbps || 6500, logf = path.join(HERE, 'out', `${day}-x264`);
  const enc = (pass, out, extra = []) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, 'f%05d.jpg'), ...extra,
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', kbps + 'k', '-maxrate', Math.round(kbps * 1.6) + 'k', '-bufsize', kbps * 2 + 'k',
    '-pass', String(pass), '-passlogfile', logf, '-pix_fmt', 'yuv420p', ...out], { stdio: 'inherit' });
  enc(1, ['-an', '-f', 'mp4', '/dev/null']);
  enc(2, ['-movflags', '+faststart', '-c:a', 'aac', '-b:a', '160k', '-shortest', dest], ['-i', wav]);
  console.log('wrote', dest, (fs.statSync(dest).size / 1048576).toFixed(1) + ' MiB');
}
await R.close();
