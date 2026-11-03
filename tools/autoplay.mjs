// Plays the real flow headless (menu → intro → chase → delve → rooms…), screenshots each scene change.
//   node tools/autoplay.mjs <outDir> [seconds] [char] [W] [H] [mobile]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const [out = 'play', secs = '300', char = 'clover', W = '1280', H = '720', mobile = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: +W, height: +H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: +W, height: +H } });
const page = await ctx.newPage();
const log = [];
page.on('pageerror', (e) => log.push('[pageerror] ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') log.push('[console] ' + m.text()); });
await page.goto('file://' + resolve(process.env.PAGE || 'dist/index.html'), { waitUntil: 'commit' });
const t0 = Date.now();
let last = '', n = 0, lastShot = 0;
const shot = async (tag) => { n++; await page.screenshot({ path: `${out}/${String(n).padStart(3, '0')}_${tag}.png`, timeout: 90000 }).catch(() => {}); };
while ((Date.now() - t0) / 1000 < +secs) {
  await page.waitForTimeout(1500);
  const st = await page.evaluate((char) => {
    const g = window.FORGLITE; if (!g || !g.scene) return null;
    g.timeScale = 3;
    const s = g.scene, ov = g.overlays[g.overlays.length - 1];
    s._ap = (s._ap || 0) + 1;
    const tag = (ov ? ov.name + '@' : '') + s.name + (s.state ? ':' + s.state : '');
    try {
      if (ov) {
        ov._ap = (ov._ap || 0) + 1;
        if (ov.name === 'cutscene' && ov._ap > 4 && ov.cine) ov.cine.done = true;
        else if (ov.name === 'bag' && ov._ap > 2) ov.close(true);
        else if (ov.name === 'oldmap' && ov._ap > 2) { const o = ov.options && ov.options(); if (o && o.length && ov.choose) ov.choose(o[0]); else ov.close(); }
        else if (ov.name === 'reveal' && ov._ap > 2) { g.input._queue.push('k+Space'); setTimeout(() => g.input._queue.push('k-Space'), 60); }
        else if (ov.name === 'pause') g.popOverlay(ov);
      } else if (s.name === 'title') {
        if (s._ap === 3) s.pick(char);
        if (s._ap === 6) s.choose();
      } else if (s.name === 'cutscene') { if (s._ap > 5 && s.cine) s.cine.done = true; }
      else if (s.name === 'delve') { if (s.state === 'choose' && s._ap % 3 === 0 && s.choices && s.choices.length) s.choose(s.choices[(s._ap / 3) % s.choices.length | 0]); }
      else if (s.name === 'combat') { s.auto = true; }
      else if (s.name === 'vein') { if (s.swing) s.swing(); if (s._ap > 14 && s.leave) s.leave(); }
      else if (s.name === 'event') { if (s._ap === 3 && s.ev && s.choose) { const c = s.ev.choices.find((c) => !s.available || s.available(c)); if (c) s.choose(c); } if (s._ap > 9 && s.leave) s.leave(); }
      else if (s.name === 'treasure') { if (s._ap === 3 && s.tryOpen) s.tryOpen(); if (s._ap > 9 && s.leave) s.leave(); }
      else if (s.name === 'camp') { if (s._ap === 3 && s.begin) s.begin('rest'); if (s._ap > 8 && s.leave) s.leave(); }
      else if (s.name === 'gameover' || s.name === 'victory') {}
    } catch (e) { return { tag, err: String(e && e.message || e) }; }
    const run = g.run;
    return { tag, hp: run ? run.hp : null, act: run ? run.act : null, node: run && run.map ? run.map.nodes[run.map.current].type : null, fps: Math.round(g.fps) };
  }, char).catch((e) => ({ tag: 'eval-failed', err: String(e).slice(0, 120) }));
  if (!st) continue;
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  if (st.err) log.push(`${el}s driver: ${st.tag} ${st.err}`);
  const key = st.tag.split(':')[0];
  if (st.tag !== last) { log.push(`${el}s ${st.tag} hp=${st.hp} act=${st.act} node=${st.node}`); last = st.tag; }
  if (key !== (shot.k || '') || Date.now() - lastShot > 20000) { shot.k = key; lastShot = Date.now(); await shot(key.replace(/[@:]/g, '-')); }
}
writeFileSync(`${out}/log.txt`, log.join('\n'));
console.log(log.join('\n'));
await browser.close();
