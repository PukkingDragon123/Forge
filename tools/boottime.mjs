// Mobile boot probe: phone viewport + touch + CPU throttling; logs when frames start and what the GPU holds.
//   node tools/boottime.mjs [query] [throttle] [W] [H]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const [query = '', throttle = '4', W = '844', H = '390'] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
const t0 = Date.now();
await page.goto('file://' + resolve(process.env.PAGE || 'dist/index.html') + (query ? '?' + query : ''), { waitUntil: 'commit' });
let firstFrame = null;
for (let i = 0; i < 240; i++) {
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => {
    const g = window.FORGLITE; if (!g) return null;
    const r = g.renderer && g.renderer.gl;
    const info = r ? r.info : null;
    const boot = !!document.getElementById('boot');
    return { frames: g.frame || g.frames || 0, scene: g.sceneName || (g.scene && g.scene.constructor.name), boot,
      geo: info && info.memory.geometries, tex: info && info.memory.textures, calls: info && info.render.calls, tris: info && info.render.triangles,
      progs: info && info.programs ? info.programs.length : 0, spr: window.__voxSprites && window.__voxSprites.n, sprMs: window.__voxSprites && Math.round(window.__voxSprites.ms), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1 };
  }).catch(() => null);
  if (s && !s.boot && firstFrame === null && s.calls > 0) { firstFrame = (Date.now() - t0) / 1000; console.log('first 3D frame at', firstFrame, 's', JSON.stringify(s)); }
  if (process.env.TRACE && s && i % 4 === 0) console.log(((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(s));
  if (firstFrame !== null && (Date.now() - t0) / 1000 > firstFrame + 6) { console.log('after +6s', JSON.stringify(s)); break; }
}
const lim = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); return c ? { fuv: c.getParameter(c.MAX_FRAGMENT_UNIFORM_VECTORS), vuv: c.getParameter(c.MAX_VERTEX_UNIFORM_VECTORS), tex: c.getParameter(c.MAX_TEXTURE_SIZE) } : null; });
console.log('limits', JSON.stringify(lim));
const lights = await page.evaluate(() => { const g = window.FORGLITE; const sc = g.scene && (g.scene.world ? g.scene.world.scene : g.scene.scene); let n = { point: 0, spot: 0, dir: 0, shadow: 0 }; sc && sc.traverse && sc.traverse((o) => { if (o.isPointLight) n.point++; if (o.isSpotLight) n.spot++; if (o.isDirectionalLight) n.dir++; if (o.isLight && o.castShadow) n.shadow++; }); return n; });
console.log('lights', JSON.stringify(lights));
const longTasks = await page.evaluate(() => performance.getEntriesByType('longtask').length);
console.log('total', (Date.now() - t0) / 1000, 's', errors.slice(0, 8).join('\n'));
await page.screenshot({ path: process.env.OUT || 'boot.png', timeout: 60000 }).catch(() => console.log('screenshot timed out'));
await browser.close();
