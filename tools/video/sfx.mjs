// Renders a shot's game audio (tools/video/render.mjs -> <dir>/audio.json) with the game's
// own procedural synth, offline, into <dir>/game.wav (stereo float32, 44.1 kHz).
//   node tools/video/sfx.mjs <frames-dir> [<frames-dir> ...]
// Skips UI noise (clicks, hovers, quest pages). External cues (kind 'ext') are left to build.py.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(process.env.PW || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const URL0 = process.env.VIDEO_URL || 'http://127.0.0.1:5245';
const SKIP = new Set(['click', 'hover', 'page', 'open', 'close', 'paper', 'pen']);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => console.log('[page]', String(e).slice(0, 300)));
await page.goto(URL0 + '/tools/video/sfx.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const cache = new Map();
function wavF32(file, data, sr) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.byteLength, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34);
  h.write('data', 36); h.writeUInt32LE(data.byteLength, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(data.buffer, data.byteOffset, data.byteLength)]));
}
for (const dir of process.argv.slice(2)) {
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'audio.json'), 'utf8'));
  const SR = 44100, dur = (log.frames || 0) / 30 + 4;
  const mix = new Float32Array(Math.ceil(dur * SR) * 2);
  let n = 0, skipped = 0;
  for (const ev of log.audio) {
    if (ev.kind === 'ext') continue;
    if (ev.kind === 'sfx' && SKIP.has(ev.name)) { skipped++; continue; }
    const key = JSON.stringify([ev.kind, ev.name, ev.voice, ev.text, ev.vol, ev.kind === 'sfx' ? +ev.pitch.toFixed(3) : ev.pitch, ev.pan, ev.cps]);
    let r = cache.get(key);
    if (!r) {
      try { r = await page.evaluate((e) => window.renderEv(e), ev); } catch (e) { console.log('render failed', ev.kind, ev.name || ev.voice, String(e).slice(0, 120)); continue; }
      r.f = new Float32Array(Buffer.from(r.data, 'base64').buffer.slice(0));
      cache.set(key, r);
    }
    const off = Math.round(Math.max(0, ev.t + (ev.delay || 0)) * SR) * 2;
    const f = r.f;
    for (let i = 0; i < f.length && off + i < mix.length; i++) mix[off + i] += f[i];
    n++;
  }
  let peak = 0;
  for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  wavF32(path.join(dir, 'game.wav'), mix, SR);
  console.log(`${path.basename(dir)}: ${n} events rendered (${skipped} skipped), peak ${(20 * Math.log10(peak + 1e-9)).toFixed(1)} dBFS`);
}
await browser.close();
