// Headless screenshot helper for visual checks.
//   node tools/shot.mjs "scene=test" out.png [waitMs] [width] [height] [actions.json]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const [query = 'scene=test', out = 'shot.png', wait = '2500', W = '1920', H = '1080', actionsFile] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto('file://' + resolve(process.env.PAGE || 'dist/index.html') + '?' + query);
await page.waitForTimeout(+wait);
if (actionsFile && existsSync(actionsFile)) {
  const actions = JSON.parse(readFileSync(actionsFile, 'utf8'));
  for (const a of actions) {
    if (a.click) { await page.mouse.click(a.click[0], a.click[1], { button: a.button || 'left' }); }
    if (a.move) { await page.mouse.move(a.move[0], a.move[1]); }
    if (a.key) { await page.keyboard.press(a.key); }
    if (a.eval) { await page.evaluate(a.eval); }
    if (a.wait) { await page.waitForTimeout(a.wait); }
    if (a.shot) { await page.screenshot({ path: a.shot }); }
  }
}
await page.screenshot({ path: out });
const fps = await page.evaluate(() => (window.FORGLITE ? window.FORGLITE.fps.toFixed(1) : 'n/a'));
console.log('fps', fps);
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
await browser.close();
