// CPU profile of the first N seconds after load; prints the heaviest self-time functions and files.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const [query = '', secs = '20'] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto('file://' + resolve(process.env.PAGE || 'dist/index.html') + (query ? '?' + query : ''), { waitUntil: 'commit' });
let first = null;
while ((Date.now() - t0) / 1000 < +secs) {
  await page.waitForTimeout(250);
  const c = await page.evaluate(() => window.FORGLITE && window.FORGLITE.renderer && window.FORGLITE.renderer.gl.info.render.calls).catch(() => 0);
  if (c > 1 && first === null) { first = (Date.now() - t0) / 1000; console.log('first frame', first); }
}
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(), byFile = new Map();
const dt = profile.timeDeltas; const idx = new Map(profile.nodes.map((n, i) => [n.id, n]));
const count = new Map();
for (const s of profile.samples) count.set(s, (count.get(s) || 0) + 1);
for (const [id, c] of count) {
  const n = idx.get(id); const f = n.callFrame; const k = (f.functionName || '(anon)') + ' @' + (f.url.split('/').pop()) + ':' + f.lineNumber;
  self.set(k, (self.get(k) || 0) + c);
}
const tot = profile.samples.length;
// inclusive time for chosen functions: walk each sample's stack once
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const WANT = /^(enter|go|buildStage|buildCorridor|buildCharacter|buildMonster|buildProp|voxSprite|voxRelief|voxObject|bake|meshWorld|paint|render|readRenderTargetPixels|compile|update|frame|loop|tick|cutsceneOpen|prepareCutscene|stageSet|monster|char)$/;
const incl = new Map();
for (const [id, c] of count) {
  const seen = new Set();
  for (let x = id; x !== undefined; x = parent.get(x)) {
    const f = idx.get(x).callFrame; const nm = f.functionName;
    if (!WANT.test(nm)) continue;
    const k = nm + ' @' + f.lineNumber; if (seen.has(k)) continue; seen.add(k);
    incl.set(k, (incl.get(k) || 0) + c);
  }
}
console.log('--- inclusive');
[...incl].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, c]) => console.log((c / tot * 100).toFixed(1).padStart(5) + '%', k));
console.log('--- self');
console.log('samples', tot);
[...self].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, c]) => console.log((c / tot * 100).toFixed(1).padStart(5) + '%', k));
await browser.close();
