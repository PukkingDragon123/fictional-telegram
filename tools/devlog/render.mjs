// Renders devlog days to vertical MP4s (1080x1920, 30 fps) for TikTok / Reels:
//   node tools/devlog/render.mjs day01 [day02 ...] [--frames-only] [--audio-only] [--every N] [--from N --to M]
// 1. director.html?day=<day> under virtual time, one screenshot per frame -> tools/devlog/out/<day>/
// 2. the sound log (director cues + the clips' own sounds) -> tools/video/mix.html -> a music bed and
//    a sound-effects bed (out/<day>-music.wav, out/<day>-sfx.wav)
// 3. the voice-over (vo/<day>.wav, made by vo.py) on top: each layer levelled by loudness, the beds
//    dipped under the voice while it talks, the whole thing at -14 LUFS (what TikTok / Reels play at).
//    With the day's song (D.song, tools/devlog/music/) a second mix uses it instead of the synth music.
// 4. ffmpeg (two-pass H.264 + AAC) -> promo/devlog/day-NN.mp4 (+ promo/devlog/with-music/day-NN.mp4)
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
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
const { DAYS, FPS, voHelper } = await import(pathToFileURL(path.join(HERE, 'days.js')).href + '?t=' + Date.now());

// ---------------------------------------------------------------- audio helpers (48 kHz stereo float)
const SR = 48000;
const RAW = ['-f', 'f32le', '-ar', String(SR), '-ac', '2'];
const readRaw = (f) => { const b = fs.readFileSync(f); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
// integrated loudness (EBU R128) and true peak, via ffmpeg's loudnorm analysis
function measure(input) {
  const m = spawnSync('ffmpeg', ['-hide_banner', ...input, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return JSON.parse(m.slice(m.lastIndexOf('{'), m.lastIndexOf('}') + 1));
}
const dbGain = (target, measured) => (Number.isFinite(+measured) && +measured > -70 ? 10 ** ((target - +measured) / 20) : 0);
// 0..1 "the voice is talking" envelope at 100 Hz from the word timings: words closer than 0.3 s
// merge into one phrase; the dip starts just before a phrase and lets go slowly after it
function talkEnvelope(vo, seconds) {
  const words = vo.order.flatMap((id) => vo.lines[id].words.map(([, t0, t1]) => [t0, t1])).sort((a, b) => a[0] - b[0]);
  const spans = [];
  for (const [t0, t1] of words) {
    const l = spans[spans.length - 1];
    if (l && t0 - l[1] < 0.3) l[1] = Math.max(l[1], t1); else spans.push([t0, t1]);
  }
  const n = Math.ceil(seconds * 100) + 1, on = new Float32Array(n), env = new Float32Array(n);
  for (const [t0, t1] of spans) for (let k = Math.max(0, Math.floor((t0 - 0.12) * 100)); k < Math.min(n, Math.ceil((t1 + 0.15) * 100)); k++) on[k] = 1;
  let e = 0;
  for (let k = 0; k < n; k++) { e += (on[k] - e) * (on[k] > e ? 0.35 : 0.045); env[k] = e; }
  return env;
}
const R = await recorder({ w: 1080, h: 1920, fps: FPS, quality: 94 });

for (const day of days) {
  if (!DAYS[day]) { console.log('no day', day); continue; }
  const VO = JSON.parse(fs.readFileSync(path.join(HERE, 'vo', `${day}.json`), 'utf8'));
  const D = DAYS[day](voHelper(VO));
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
  const bed = {};
  for (const [k, ev] of [['music', clean.filter((e) => e.kind === 'music')], ['sfx', clean.filter((e) => e.kind !== 'music')]]) {
    const res = await mp.evaluate(([ev, sec]) => window.__mix(ev, sec), [ev, D.length]);
    bed[k] = path.join(HERE, 'out', `${day}-${k}.wav`);
    fs.writeFileSync(bed[k], Buffer.from(res.wav, 'base64'));
  }
  await ctx.close();

  // ---- the mixes. Voice on top (-16 LUFS, cleaned up: low cut, compressed, a little presence);
  // music up in the pauses and dipped while the voice talks; sound effects a little under the
  // voice. Two versions when the day has a song (D.song, tools/devlog/music/<file>.mp3, your own
  // files, not in git): with the song -> promo/devlog/with-music/, and with the game's own synth
  // music -> promo/devlog/ (the copy that is safe to commit and to post with an in-app sound).
  // the script's `pitch` (vo/script.json) turns the voice into a cartoon character, timing unchanged
  const SCRIPT = JSON.parse(fs.readFileSync(path.join(HERE, 'vo', 'script.json'), 'utf8'));
  const PITCH = VO.voice === 'own' ? 1 : SCRIPT.pitch || 1;
  const VOICE_FX = (PITCH !== 1 ? `rubberband=pitch=${PITCH},` : '') + 'highpass=f=85,acompressor=threshold=0.08:ratio=4:attack=6:release=90:makeup=2.5,equalizer=f=3200:t=q:w=1.3:g=3,equalizer=f=180:t=q:w=1:g=1.5';
  const songFile = D.song && path.join(HERE, 'music', `${D.song.file}.mp3`);
  const withSong = songFile && fs.existsSync(songFile);
  if (withSong) {
    bed.song = path.join(HERE, 'out', `${day}-song.wav`);
    const from = Math.max(0, D.song.from || 0), fo = Math.max(0.5, D.length - 1.4);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', from.toFixed(3), '-t', (D.length + 0.5).toFixed(3), '-i', songFile,
      '-af', `afade=t=in:d=0.25,afade=t=out:st=${fo.toFixed(3)}:d=1.3`, '-ar', String(SR), '-ac', '2', bed.song]);
  }
  const layer = (k, src, target, af) => {
    const raw = path.join(HERE, 'out', `${day}-${k}.f32`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, ...(af ? ['-af', af] : []), ...RAW, raw]);
    const m = measure([...RAW, '-i', raw]);
    console.log(day, k, m.input_i, 'LUFS ->', target);
    return { pcm: readRaw(raw), gain: dbGain(target, m.input_i) };
  };
  const env = talkEnvelope(VO, D.length + 1);
  function mixDown(name, music, lv) {
    const NS = Math.ceil(D.length * SR), mix = new Float32Array(NS * 2);
    const dM = 10 ** (-lv.duckMusic / 20), dS = 10 ** (-lv.duckSfx / 20);
    let peak = 0;
    for (let i = 0; i < NS; i++) {
      const k = i / (SR / 100), k0 = Math.floor(k), e = env[k0] + (env[Math.min(env.length - 1, k0 + 1)] - env[k0]) * (k - k0);
      const gm = music.gain * (1 + (dM - 1) * e), gs = sfxL.gain * (1 + (dS - 1) * e), gv = voiceL.gain;
      for (let c = 0; c < 2; c++) {
        const j = i * 2 + c;
        const v = (voiceL.pcm[j] || 0) * gv + (music.pcm[j] || 0) * gm + (sfxL.pcm[j] || 0) * gs;
        mix[j] = v;
        peak = Math.max(peak, Math.abs(v));
      }
    }
    if (peak > 0.95) for (let j = 0; j < mix.length; j++) mix[j] *= 0.95 / peak;
    const raw = path.join(HERE, 'out', `${day}-mix-${name}.f32`);
    fs.writeFileSync(raw, Buffer.from(mix.buffer));
    // the series at one loudness (-14 LUFS): two-pass linear loudnorm, applied when encoding
    const L = measure([...RAW, '-i', raw]);
    console.log(day, 'mix', name, L.input_i, 'LUFS, peak', peak.toFixed(2));
    return { raw, af: `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${L.input_i}:measured_TP=${L.input_tp}:measured_LRA=${L.input_lra}:measured_thresh=${L.input_thresh}:offset=${L.target_offset}:linear=true` };
  }
  const base = { voice: -16, music: -20, sfx: -19, duckMusic: 10, duckSfx: 4, ...(D.levels || {}) };
  const voiceL = layer('voice', path.join(HERE, 'vo', `${day}.wav`), base.voice, VOICE_FX);
  const sfxL = layer('sfx', bed.sfx, base.sfx);
  const gameMix = mixDown('game', layer('music', bed.music, base.music), base);
  let songMix = null;
  if (withSong) {
    const lv = { ...base, music: -21, ...(D.song.levels || {}) };
    songMix = mixDown('song', layer('song', bed.song, lv.music), lv);
  }

  const name = `${D.file || day.replace(/^day(\d+)$/, 'day-$1')}.mp4`;
  const dest = path.join(ROOT, 'promo', 'devlog', name);
  const destSong = path.join(ROOT, 'promo', 'devlog', 'with-music', name);
  fs.mkdirSync(path.dirname(destSong), { recursive: true });
  // two-pass at a fixed bitrate: crisp pixels and text, and every file stays well under 30 MB
  const kbps = D.videoKbps || Math.min(6500, Math.floor(200000 / D.length)), logf = path.join(HERE, 'out', `${day}-x264`);
  // -frames:v: only this render's frames (an older, longer render may have left more in OUT)
  const enc = (pass, out, extra = []) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, 'f%05d.jpg'), ...extra, '-frames:v', String(N),
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', kbps + 'k', '-maxrate', Math.round(kbps * 1.6) + 'k', '-bufsize', kbps * 2 + 'k',
    '-pass', String(pass), '-passlogfile', logf, '-pix_fmt', 'yuv420p', ...out], { stdio: 'inherit' });
  const AAC = ['-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart'];
  enc(1, ['-an', '-f', 'mp4', '/dev/null']);
  enc(2, ['-af', gameMix.af, ...AAC, dest], [...RAW, '-i', gameMix.raw]);
  console.log('wrote', dest, (fs.statSync(dest).size / 1048576).toFixed(1) + ' MiB');
  if (songMix) {
    // same picture, the song mix as the sound
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', dest, ...RAW, '-i', songMix.raw, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', songMix.af, ...AAC, destSong], { stdio: 'inherit' });
    console.log('wrote', destSong, (fs.statSync(destSong).size / 1048576).toFixed(1) + ' MiB');
  }
}
await R.close();
