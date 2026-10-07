// Frame recorder: headless Chromium (SwiftShader WebGL) with virtual time (vtime.js).
//   const R = await recorder({ w: 1280, h: 720 });
//   const page = await R.open(url);            // page with virtual clock installed
//   await R.pump(page, ms)                     // advance time quickly (loading, warm-up)
//   await R.frame(page, file)                  // step 1/fps and save a JPEG of the viewport
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PW || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const VT = fs.readFileSync(path.join(HERE, 'vtime.js'), 'utf8');
const VITE_STUB = `export function updateStyle(id, css) { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; }
export function removeStyle(id) { document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove(); }
export function createHotContext() { return { accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}`;

export async function recorder({ w = 1280, h = 720, fps = 30, quality = 92 } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const R = {
    browser, fps,
    async open(url, { init = [], viewport = [w, h] } = {}) {
      const ctx = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.addInitScript(VT);
      for (const s of init) await page.addInitScript(s);
      await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: VITE_STUB }));
      page.on('pageerror', (e) => console.log('[pageerror]', e.message));
      page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
      page.__cdp = await ctx.newCDPSession(page);
      await page.goto(url, { waitUntil: 'load', timeout: 240000 });
      return page;
    },
    // advance virtual time by ms in steps of `dt` (frames run, nothing captured)
    async pump(page, ms, dt = 1000 / fps) {
      await page.evaluate(([ms, dt]) => { for (let t = 0; t < ms; t += dt) window.__vt.step(dt); }, [ms, dt]);
    },
    // wait (real time) until fn() is truthy in the page, pumping virtual time meanwhile
    async until(page, fn, { timeout = 120000, dt = 1000 / fps, chunk = 10 } = {}) {
      const t0 = Date.now();
      for (;;) {
        const ok = await page.evaluate(`!!(${fn})()`).catch(() => false);
        if (ok) return ok;
        if (Date.now() - t0 > timeout) throw new Error('until: timeout ' + fn);
        await page.evaluate(([dt, n]) => { for (let i = 0; i < n; i++) window.__vt.step(dt); }, [dt, chunk]);
        await new Promise((r) => setTimeout(r, 30));
      }
    },
    async shot(page, file) {
      const r = await page.__cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    // one video frame: optional per-frame hook, step the clock, capture
    async frame(page, file, hook = null, arg = null) {
      await page.evaluate(([dt, hook, arg]) => { if (hook) (0, eval)(hook)(arg); window.__vt.step(dt); }, [1000 / fps, hook, arg]);
      await R.shot(page, file);
    },
    close: () => browser.close(),
  };
  return R;
}
