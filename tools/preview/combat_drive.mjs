// Drive the combat preview headlessly: skips most 3D renders so game logic runs fast, logs state live.
//   node tools/preview/combat_drive.mjs <html> "query" <seconds> <shotPrefix> [shotEvery]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const [html, query, secs = '40', prefix = 'shot', every = '3', keys = ''] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto('file://' + html + '?' + query);
await page.waitForTimeout(1500);
await page.evaluate(() => { const r = window.FORGLITE.renderer; const o = r.render.bind(r); let n = 0; window.__renderEvery = 20; r.render = (w, dt) => { if ((n++ % window.__renderEvery) === 0) o(w, dt); }; });
const state = () => page.evaluate(() => { const g = window.FORGLITE, s = g.scene; return `${s.name}:${s.phase} t=${s.time.toFixed(1)} ts=${g.timeScale} mhp=${s.sim ? Math.round(s.sim.m.hp) : '-'} php=${g.run.hp} ov=[${g.overlays.map((o) => o.name)}] harvest=${s.harvest ? s.harvest.left : '-'} loot=${g.run.bag.overflow.length}`; });
const keyList = keys ? keys.split(',') : [];
for (let i = 0; i < +secs; i++) {
  await page.waitForTimeout(1000);
  for (const k of keyList) { const [at, key] = k.split(':'); if (+at === i) await page.keyboard.press(key); }
  for (const e of (process.env.EVALS || '').split(';;').filter(Boolean)) { const j = e.indexOf(':'); if (+e.slice(0, j) === i) await page.evaluate(e.slice(j + 1)); }
  console.log(i, await state());
  if (i % +every === every - 1) {
    await page.evaluate(() => { window.__renderEvery = 1; });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${prefix}${String(i).padStart(2, '0')}.png`, timeout: 120000 });
    await page.evaluate(() => { window.__renderEvery = 20; });
  }
}
await browser.close();
