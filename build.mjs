// FORGLITE build script.
//   node build.mjs          -> dist/index.html (single self-contained file, double-click to play)
//   node build.mjs --serve  -> dev server with live reload on http://localhost:8080
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const serve = process.argv.includes('--serve');
const port = Number(process.env.PORT || 8080);

const shell = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#07060b">
<title>FORGLITE</title>
<style>
  html, body { margin: 0; height: 100%; background: #07060b; overflow: hidden; }
  body { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
         -webkit-tap-highlight-color: transparent; overscroll-behavior: none; position: fixed; inset: 0; }
  #stage { position: fixed; left: 0; top: 0; image-rendering: pixelated; image-rendering: crisp-edges; }
  #stage canvas { position: absolute; left: 0; top: 0; image-rendering: pixelated; image-rendering: crisp-edges; }
  /* loading screen: sits above the stage until real frames flow; its sparks animate on the
     compositor, so they keep moving while the first voxel scenes are being built */
  #boot { position: fixed; inset: 0; z-index: 8; background: #07060b; display: flex; align-items: center; justify-content: center; }
  #boot .in { display: flex; flex-direction: column; align-items: center; gap: 14px; color: #c9a36a;
              font: 14px monospace; letter-spacing: 2px; text-align: center; }
  #boot .anvil { position: relative; width: 64px; height: 40px; }
  #boot .anvil i { position: absolute; bottom: 8px; width: 6px; height: 6px; background: #ffd27a;
                   box-shadow: 0 0 8px 2px #ff9a3a; animation: spark 1.1s ease-out infinite; opacity: 0; }
  #boot .anvil i:nth-child(1) { left: 22px; animation-delay: 0s; } #boot .anvil i:nth-child(2) { left: 30px; animation-delay: .36s; }
  #boot .anvil i:nth-child(3) { left: 38px; animation-delay: .72s; }
  #boot .anvil b { position: absolute; left: 10px; right: 10px; bottom: 0; height: 8px; background: #5a4a52; box-shadow: 0 -3px 0 #8a7a82; }
  @keyframes spark { 0% { transform: translate(0, 0); opacity: 1; } 100% { transform: translate(var(--dx, 14px), -30px); opacity: 0; } }
  #boot .anvil i:nth-child(1) { --dx: -16px; } #boot .anvil i:nth-child(3) { --dx: 18px; }
  #boot small { color: #8a7a6a; font-size: 11px; letter-spacing: 1px; }
  #boot .turn { display: none; }
  @media (orientation: portrait) and (pointer: coarse) { #boot .in { transform: rotate(90deg); } #boot .turn { display: block; } }
  #err { display: none; position: fixed; inset: 0; z-index: 9; background: rgba(7, 6, 11, .94); color: #f0d8b0;
         align-items: center; justify-content: center; padding: 24px; white-space: pre-wrap; text-align: center;
         font: 13px/1.5 monospace; }
  #err.toast { inset: auto 8px 8px 8px; padding: 8px 10px; font-size: 11px; border: 1px solid #6a3a2a; background: rgba(20, 8, 8, .9); }
</style>
</head>
<body>
<div id="boot"><div class="in"><div class="anvil"><i></i><i></i><i></i><b></b></div><div>KINDLING THE FORGE…</div><small>carving the caverns, voxel by voxel</small><small class="turn">turn your phone sideways</small></div></div>
<div id="err"></div>
<div id="stage"></div>
<script>
// Problems show on screen instead of a silent black page (before the game starts: full screen;
// afterwards: one small note at the bottom).
(function () {
  var shown = false;
  function fail(msg, fatal) {
    if (shown) return; shown = true;
    var e = document.getElementById('err'); if (!e) return;
    var early = fatal || !window.__forgliteBooted;
    e.className = early ? '' : 'toast';
    e.textContent = (early ? 'FORGLITE could not start on this device.\\n\\n' : 'FORGLITE hit a snag: ') + msg + (early ? '\\n\\nTap to try again.' : '');
    e.style.display = 'flex';
    e.onclick = early ? function () { location.reload(); } : function () { e.style.display = 'none'; };
    if (!early) setTimeout(function () { e.style.display = 'none'; }, 9000);
  }
  window.__forgliteFail = fail;
  window.addEventListener('error', function (ev) { fail((ev.message || 'script error') + (ev.lineno ? ' (line ' + ev.lineno + ')' : '')); });
  window.addEventListener('unhandledrejection', function (ev) { var r = ev.reason; fail(String(r && r.message || r)); });
  try {
    var c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) fail('This browser has no WebGL 2 (needed for the 3D caverns). Updating the browser or OS usually fixes it.', true);
    else { var l = g.getExtension('WEBGL_lose_context'); l && l.loseContext(); }
  } catch (x) { /* checked again when the game starts */ }
})();
</script>
${body}
</body>
</html>
`;

// Until an art module exists, fall back to its stand-in under tools/stubs (lets scenes be built in parallel).
import { existsSync } from 'node:fs';
import { resolve as resolvePath, dirname as dirOf, basename as baseOf } from 'node:path';
const STUBBED = ['src/art/sprites.js', 'src/ui/cards.js', 'src/models/characters.js', 'src/models/weapons3d.js', 'src/models/monsters.js', 'src/models/props.js'];
const stubPlugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /(sprites|cards|characters|weapons3d|monsters|props|audio)\.js$/ }, (args) => {
      if (args.importer.includes('tools/stubs')) {
        const real = resolvePath(dirOf(args.importer), args.path);
        if (existsSync(real)) return { path: real };
      }
      const abs = resolvePath(args.resolveDir, args.path);
      const rel = abs.slice(process.cwd().length + 1);
      if (rel === 'src/audio/audio.js' && process.env.STUB_AUDIO) return { path: resolvePath('tools/stubs/audio.js') };
      if (!STUBBED.includes(rel)) return undefined;
      const forced = (process.env.STUB_ART || '').split(',').some((k) => k && rel.includes(k));
      if (existsSync(abs) && !forced) return undefined;
      return { path: resolvePath('tools/stubs', baseOf(abs)) };
    });
  },
};

const common = {
  plugins: [stubPlugin],
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  logLevel: 'info',
};

if (serve) {
  mkdirSync('dev', { recursive: true });
  writeFileSync('dev/index.html', shell(`<script src="/game.js"></script>
<script>new EventSource('/esbuild').addEventListener('change', () => location.reload());</script>`));
  const ctx = await esbuild.context({ ...common, outfile: 'dev/game.js', sourcemap: 'inline', define: { DEV: 'true' } });
  await ctx.watch();
  const { hosts } = await ctx.serve({ servedir: 'dev', port });
  console.log(`\n  FORGLITE dev server: http://localhost:${port}\n`);
} else {
  mkdirSync('dist', { recursive: true });
  const result = await esbuild.build({ ...common, write: false, minify: !process.env.NOMIN, outfile: 'dist/game.js', define: { DEV: 'false' } });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  writeFileSync('dist/index.html', shell(`<script>${js}</script>`));
  // claude.ai artifact flavour: the host supplies the document skeleton, so only head content + body
  const art = shell(`<script>${js}</script>`)
    .replace(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<\/head>\s*<body>\s*/i, '')
    .replace(/\s*<\/body>\s*<\/html>\s*$/i, '')
    .replace('html, body {', ':root { color-scheme: dark; }\n  html, body {');
  writeFileSync('dist/forglite-artifact.html', art);
  const kb = (readFileSync('dist/index.html').length / 1024).toFixed(0);
  console.log(`dist/index.html written (${kb} KB)`);
}
