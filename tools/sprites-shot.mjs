// Validate the UI sprite set and screenshot tools/sprites-preview.html.
//
// Usage:
//   node tools/sprites-shot.mjs                      -> tools/shots/sprites.png (full sheet)
//   node tools/sprites-shot.mjs "zoom=fox_smug,coin&s=12" zoom.png
//   node tools/sprites-shot.mjs --validate           -> validation only
//
// Uses the Vite dev server at http://localhost:5173 if it is up, otherwise
// starts its own on port 5198 and stops it afterwards.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tools', 'shots');

const REQUIRED = ['coin', 'coins', 'star', 'star_empty', 'star_half', 'heart', 'heart_broken', 'fish', 'fish_gold', 'egg', 'honey', 'syrup', 'berry', 'seaweed', 'bug', 'flower', 'clock', 'calendar', 'hourglass', 'hammer', 'flask', 'shovel', 'trash', 'hand', 'food', 'beaver', 'bear', 'bear_angry', 'bear_happy', 'briefcase', 'necktie', 'tophat', 'gear', 'book', 'speaker_on', 'speaker_off', 'music', 'play', 'pause', 'fast', 'faster', 'bell', 'lock', 'check', 'cross', 'arrow_up', 'arrow_down', 'plus', 'minus', 'sparkle', 'bolt', 'dam', 'fence', 'platform', 'gate', 'feeder', 'lilypad', 'cattail', 'willow', 'hive', 'maple', 'tree', 'lodge', 'aerator', 'bughotel', 'camera', 'rotate_left', 'rotate_right', 'zoom_in', 'zoom_out', 'menu', 'trophy', 'save', 'home', 'warning', 'info', 'newspaper', 'chart', 'pond', 'eye', 'fox'];
const BEARS = ['bear_office', 'bear_intern', 'bear_janitor', 'bear_accountant', 'bear_construction', 'bear_boss', 'bear_ceo', 'bear_cub', 'bear_tourist', 'bear_critic', 'bear_lumberjack'];
const EXPRS = ['smug', 'greedy', 'shocked', 'laugh', 'wink', 'angry', 'worried', 'sleepy'];

// ---- 1. validate in node (importing must not touch the DOM) --------------
const mod = await import(path.join(ROOT, 'src/ui/sprites.js'));
const { SPRITES, FOX_EXPRESSIONS, hasSprite } = mod;
const errs = [];
for (const fn of ['spriteCanvas', 'spriteURL', 'spriteImg', 'foxPortraitURL', 'hasSprite']) if (typeof mod[fn] !== 'function') errs.push(`missing export ${fn}()`);
for (const [name, s] of Object.entries(SPRITES)) {
  if (!Array.isArray(s.rows) || s.rows.length !== s.h) errs.push(`${name}: ${s.rows?.length} rows != h ${s.h}`);
  s.rows.forEach((r, i) => {
    if (r.length !== s.w) errs.push(`${name}: row ${i} has length ${r.length}, w is ${s.w}`);
    for (const ch of r) if (ch !== '.' && !/^#[0-9a-f]{6}$/i.test(s.pal[ch] || '')) errs.push(`${name}: row ${i} uses '${ch}' which is not in its palette`);
  });
}
for (const n of [...REQUIRED, ...BEARS]) if (!hasSprite(n)) errs.push(`missing sprite: ${n}`);
if (JSON.stringify(FOX_EXPRESSIONS) !== JSON.stringify(EXPRS)) errs.push(`FOX_EXPRESSIONS is ${JSON.stringify(FOX_EXPRESSIONS)}`);
for (const e of EXPRS) {
  const s = SPRITES['fox_' + e];
  if (!s) errs.push(`missing portrait fox_${e}`);
  else if (s.w !== 32 || s.h !== 32) errs.push(`fox_${e} is ${s.w}x${s.h}, want 32x32`);
}
for (const n of ['fox', ...BEARS]) if (SPRITES[n] && (SPRITES[n].w !== 16 || SPRITES[n].h !== 16)) errs.push(`${n} should be 16x16`);
if (hasSprite('__nope__')) errs.push('hasSprite() true for unknown name');
const names = Object.keys(SPRITES);
console.log(`sprites: ${names.length} (${REQUIRED.length + BEARS.length} required + ${EXPRS.length} portraits + extras)`);
if (errs.length) console.log('VALIDATION ERRORS:\n  ' + errs.join('\n  '));
else console.log('validation OK');
if (process.argv.includes('--validate')) process.exit(errs.length ? 1 : 0);

// ---- 2. screenshot ---------------------------------------------------------
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const query = args[0] || '';
const out = path.join(SHOTS, args[1] || (query ? 'sprites-zoom.png' : 'sprites.png'));
fs.mkdirSync(SHOTS, { recursive: true });

async function up(url) {
  try { const r = await fetch(url); return r.ok; } catch { return false; }
}
let base = 'http://localhost:5173';
let server = null;
if (!(await up(base + '/tools/sprites-preview.html'))) {
  base = 'http://localhost:5198';
  server = spawn('npx', ['vite', '--port', '5198', '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60 && !(await up(base + '/tools/sprites-preview.html')); i++) await new Promise((r) => setTimeout(r, 500));
}

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1400), height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}/tools/sprites-preview.html${query ? '?' + query : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);
  const pageErrs = await page.evaluate(() => window.__spriteErrors || []);
  if (pageErrs.length) console.log('page validation:', pageErrs);
  await page.screenshot({ path: out, fullPage: true });
  if (logs.length) console.log(logs.slice(0, 30).join('\n'));
  console.log('wrote', path.relative(ROOT, out));
} finally {
  await browser.close();
  if (server) try { process.kill(-server.pid); } catch {}
}
