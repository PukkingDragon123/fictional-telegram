// Scripted play-test: node tools/play.mjs <steps.json|inline-json> [w] [h]
// steps: [{click:"css"}, {wait:ms}, {eval:"js"}, {shot:"name"}, {tapWorld:[x,z]}, {key:"q"}]
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const [stepsArg, w = '1280', h = '720', url = 'http://localhost:5173/'] = process.argv.slice(2);
const steps = JSON.parse(fs.existsSync(stepsArg) ? fs.readFileSync(stepsArg, 'utf8') : stepsArg);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: false });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+(process.env.WAIT || 7000));
for (const s of steps) {
  try {
    if (s.click) await page.click(s.click, { timeout: 8000, force: true });
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval:', typeof r === 'string' ? r : JSON.stringify(r)); }
    if (s.mouse) { await page.mouse.click(s.mouse[0], s.mouse[1]); }
    if (s.key) await page.keyboard.press(s.key);
    if (s.shot) await page.screenshot({ path: `tools/shots/${s.shot}.png` });
  } catch (e) { logs.push(`[step error] ${JSON.stringify(s)}: ${e.message.split('\n')[0]}`); }
}
console.log(logs.filter((l) => !l.includes('ERR_CERT_AUTHORITY_INVALID') && !l.includes('404')).slice(0, 30).join('\n'));
await browser.close();
