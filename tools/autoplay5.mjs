// Plays the v5 dungeon headless with a simple in-page bot (fight the nearest foe, then walk to an
// unexplored door; overlays are advanced or closed) and screenshots every room.
//   node tools/autoplay5.mjs <outDir> [seconds] [query] [W] [H] [mobile]
// Default query skips the intro + tutorial (marks them seen) and starts on the title.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const [out = 'play5', secs = '300', query = 'scene=title', W = '1280', H = '720', mobile = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: +W, height: +H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: +W, height: +H } });
const page = await ctx.newPage();
const log = [];
page.on('pageerror', (e) => log.push('[pageerror] ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') log.push('[console] ' + m.text().slice(0, 240)); });
// skip the first-run story unless asked for it
if (!process.env.STORY) await page.addInitScript(() => { try { const k = 'forglite.save.v1'; const d = JSON.parse(localStorage.getItem(k) || '{}'); d.seen = Object.assign(d.seen || {}, { intro: true, tutorial: true, v5intro: true, v5tutorial: true }); localStorage.setItem(k, JSON.stringify(d)); } catch (e) {} });
await page.goto('file://' + resolve(process.env.PAGE || 'dist/index.html') + '?' + query, { waitUntil: 'commit' });
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const g = window.FORGLITE;
  const B = (window.__bot = { t: 0, log: [], lastRoom: null, target: null, tapQ: [] });
  const key = (code, on) => { const has = g.input.keys.has(code); if (on && !has) g.input._queue.push('k+' + code); else if (!on && has) g.input._queue.push('k-' + code); };
  const tap = (code) => { g.input._queue.push('k+' + code); B.tapQ.push(code); };
  const move = (dx, dz) => { const d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d; key('KeyA', ux < -0.35); key('KeyD', ux > 0.35); key('KeyW', uz < -0.35); key('KeyS', uz > 0.35); };
  const stop = () => move(0, 0);
  setInterval(() => {
    try {
      for (const c of B.tapQ.splice(0)) g.input._queue.push('k-' + c);
      B.t++;
      g.timeScale = 2;
      const s = g.scene, ov = g.overlays[g.overlays.length - 1];
      if (ov) {
        stop(); ov._bt = (ov._bt || 0) + 1;
        if (ov.name === 'cutscene' && ov._bt > 40 && ov.cine) ov.cine.done = true;
        else if (ov.name === 'dialogue' && ov._bt % 12 === 0) tap('Space');
        else if (ov.name === 'reveal' && ov._bt % 15 === 0) tap('Space');
        else if (['bag', 'craft', 'minezoom', 'oldmap', 'pause'].includes(ov.name) && ov._bt > 30) { tap('Escape'); if (ov._bt > 60) g.popOverlay(ov); }
        return;
      }
      if (!s) return;
      if (s.name === 'title') { if (B.t === 20 && s.pick) s.pick('durgan'); if (B.t === 50 && s.choose) s.choose(); return; }
      if (s.name === 'cutscene') { if (s.cine && (s._bt = (s._bt || 0) + 1) > 40) s.cine.done = true; return; }
      if (s.name !== 'dungeon' || !s.aw || !s.player) return;
      const aw = s.aw, p = s.player;
      if (s.curRoom && s.curRoom.id !== B.lastRoom) { B.lastRoom = s.curRoom.id; B.log.push({ t: B.t, room: s.curRoom.id, type: s.curRoom.type, hp: Math.round(p.hp) }); B.target = null; }
      const foes = aw.enemies.filter((e) => !e.dead && !e.untargetable);
      if (foes.length) {
        let best = null, bd = 1e9;
        for (const e of foes) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
        const r = (best.radius || 0.5) + 1.1;
        if (bd > r) move(best.x - p.x, best.z - p.z); else { stop(); if (B.t % 3 === 0) tap('KeyJ'); }
        if (B.t % 47 === 0) tap('Space');
        if (B.t % 90 === 0) tap('KeyQ');
        return;
      }
      // room clear: take the hole if open, else walk to an unexplored (or any) open door
      const fl = s.floor, room = s.curRoom, built = s.built;
      if (s.holeOpen && built && built.anchors && built.anchors.hole) { const h = built.anchors.hole; if (Math.hypot(h.x - p.x, h.z - p.z) > 0.6) move(h.x - p.x, h.z - p.z); else { stop(); tap('KeyF'); } return; }
      if (!B.target || B.target.room !== room.id) {
        const dirs = ['n', 'e', 's', 'w'].filter((d) => room.doors && room.doors[d] != null && built && built.doors && built.doors[d] && (!built.doors[d].isOpen || built.doors[d].isOpen()));
        const roomOf = (id) => (fl.rooms.get ? fl.rooms.get(id) : fl.rooms[id]);
        const fresh = dirs.filter((d) => { const nr = roomOf(room.doors[d]); return nr && !nr.visited; });
        const pick = (fresh.length ? fresh : dirs)[Math.floor(Math.random() * (fresh.length || dirs.length))];
        B.target = pick ? { room: room.id, dir: pick } : null;
      }
      if (B.target) { const d = built.doors[B.target.dir]; const tx = d.mouth ? d.mouth.x : d.x, tz = d.mouth ? d.mouth.z : d.z; move(tx - p.x + (d.x - tx) * 2, tz - p.z + (d.z - tz) * 2); }
    } catch (e) { (window.__bot.err || (window.__bot.err = [])).push(String(e && e.message)); }
  }, 50);
});
const t0 = Date.now();
let last = '', n = 0, lastShot = 0;
const shot = async (tag) => { n++; await page.screenshot({ path: `${out}/${String(n).padStart(3, '0')}_${tag}.png`, timeout: 90000 }).catch(() => {}); };
while ((Date.now() - t0) / 1000 < +secs) {
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => {
    const g = window.FORGLITE; if (!g || !g.scene) return null;
    const s = g.scene, ov = g.overlays[g.overlays.length - 1];
    const p = s.player, room = s.curRoom;
    return { tag: (ov ? ov.name + '@' : '') + s.name + (room ? ':' + room.type + room.id : ''), hp: p ? Math.round(p.hp) : null, foes: s.aw ? s.aw.enemies.filter((e) => !e.dead).length : null, stage: g.run ? g.run.stage : null, err: window.__bot && window.__bot.err && window.__bot.err.slice(-2) };
  }).catch((e) => ({ tag: 'eval-failed', err: [String(e).slice(0, 100)] }));
  if (!st) continue;
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  if (st.tag !== last) { log.push(`${el}s ${st.tag} hp=${st.hp} foes=${st.foes} stage=${st.stage}`); last = st.tag; await shot(st.tag.replace(/[@:]/g, '-')); lastShot = Date.now(); }
  else if (Date.now() - lastShot > 15000) { lastShot = Date.now(); await shot(st.tag.replace(/[@:]/g, '-')); }
  if (st.err && st.err.length) log.push(`${el}s bot: ${st.err.join(' | ')}`);
}
const rooms = await page.evaluate(() => window.__bot && window.__bot.log).catch(() => null);
log.push('rooms: ' + JSON.stringify(rooms));
writeFileSync(`${out}/log.txt`, log.join('\n'));
console.log(log.join('\n'));
await browser.close();
