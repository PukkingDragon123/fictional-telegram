#!/usr/bin/env node
// [v33 sfx] Level calibration for the recorded SFX (src/audio/sampleMap.js).
//
//   node tools/sfx-calibrate.mjs [--url http://localhost:5173/tools/audio-test.html] [--write]
//
// For every name that plays a sample, renders the old synthesised builder (with its calibrated g) and the sample
// (at g = 1) through the full master chain offline, then picks the trim that matches the synth's short-term
// loudness (loudest 50 ms RMS window, pulled a little toward a common level), limited so the peak stays within
// 1.5x of the synth's (scaled) peak and below 0.9. --write
// rewrites the SAMPLE_GAIN table in sampleMap.js.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const url = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : 'http://localhost:5173/tools/audio-test.html';
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(url + (url.includes('?') ? '&' : '?') + 'nounlock', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.audio, null, { timeout: 60000 });
const res = await page.evaluate(async () => {
  const audio = window.audio;
  const load = await audio._debugLoadSamples();
  const meas = (buf) => {
    const sr = buf.sampleRate, w = Math.round(sr * 0.05), chs = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    let peak = 0, best = 0, acc = 0;
    const sq = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      let s = 0;
      for (const ch of chs) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
        s += ch[i] * ch[i];
      }
      sq[i] = s / chs.length;
    }
    for (let i = 0; i < buf.length; i++) {
      acc += sq[i];
      if (i >= w) acc -= sq[i - w];
      if (i >= w - 1 && acc > best) best = acc;
    }
    return { peak, st: Math.sqrt(best / w) };
  };
  const info = audio.sampleInfo();
  const out = {};
  for (const n of info.sampled) {
    try {
      const a = meas(await audio._debugRenderSfx(n, 7, { synth: true }));
      const b = meas(await audio._debugRenderSfx(n, 7, { raw: true }));
      out[n] = { synthSt: a.st, synthPk: a.peak, smpSt: b.st, smpPk: b.peak };
    } catch (e) {
      out[n] = { err: String(e) };
    }
  }
  return { load, info, out };
});
await browser.close();

const gains = {};
const rows = [];
for (const [n, r] of Object.entries(res.out)) {
  if (r.err || !(r.smpSt > 1e-5)) {
    rows.push(`${n}: ${r.err || 'silent sample'}`);
    continue;
  }
  // target loudness: the synth's, pulled 20% (in log) toward a mid level so the mix sits closer together
  const target = Math.exp(0.8 * Math.log(r.synthSt) + 0.2 * Math.log(0.12));
  const gRms = target / r.smpSt;
  const gPk = Math.min((1.5 * r.synthPk * target) / r.synthSt, 0.9) / r.smpPk;
  const g = Math.max(0.03, Math.min(6, gRms, gPk));
  gains[n] = +g.toFixed(3);
  rows.push(`${n.padEnd(18)} g ${g.toFixed(3)}  synth st ${r.synthSt.toFixed(3)} pk ${r.synthPk.toFixed(3)} | sample st ${r.smpSt.toFixed(3)} pk ${r.smpPk.toFixed(3)}${gPk < gRms ? '  (peak-limited)' : ''}`);
}
console.log(rows.join('\n'));
console.log('decode:', JSON.stringify(res.load), 'synth-only names:', res.info.synth.join(' '));
if (argv.includes('--write')) {
  const f = path.join(ROOT, 'src/audio/sampleMap.js');
  const src = fs.readFileSync(f, 'utf8');
  const body = Object.entries(gains).map(([k, v]) => `  ${k}: ${v},`).join('\n');
  const next = src.replace(/export const SAMPLE_GAIN = \{[\s\S]*?\};/, `export const SAMPLE_GAIN = {\n${body}\n};`);
  fs.writeFileSync(f, next);
  console.log('wrote', Object.keys(gains).length, 'gains to', f);
}
