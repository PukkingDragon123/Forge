// Phone emulation check: landscape iPhone-sized viewport with touch.
//   node tools/mobile.mjs "scene=map&char=bran" out.png [actions.json]
// actions: {tap:[x,y]} (CSS px), {wait}, {eval}, {shot}, {hold:[x,y,ms]}
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const [query = 'scene=title', out = 'mobile.png', actionsFile, W = '844', H = '390'] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
await page.goto('file://' + resolve(process.env.PAGE || 'dist/index.html') + '?' + query);
await page.waitForTimeout(+(process.env.WAIT0 || 2500));
const touchAt = async (x, y, ms = 60) => {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
if (actionsFile && existsSync(actionsFile)) {
  for (const a of JSON.parse(readFileSync(actionsFile, 'utf8'))) {
    if (a.tap) await touchAt(a.tap[0], a.tap[1]);
    if (a.hold) await touchAt(a.hold[0], a.hold[1], a.hold[2] || 700);
    if (a.wait) await page.waitForTimeout(a.wait);
    if (a.eval) { const r = await page.evaluate(a.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r)); }
    if (a.shot) await page.screenshot({ path: a.shot });
  }
}
await page.screenshot({ path: out });
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
