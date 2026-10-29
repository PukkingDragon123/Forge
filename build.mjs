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
  #turn { display: none; position: fixed; inset: 0; z-index: 9; background: #07060b; color: #e8d8b8;
          flex-direction: column; align-items: center; justify-content: center; gap: 18px;
          font: 15px/1.4 monospace; letter-spacing: 1px; text-align: center; padding: 24px; }
  #turn svg { width: 92px; height: 92px; animation: tilt 2.4s ease-in-out infinite; }
  @keyframes tilt { 0%, 35% { transform: rotate(0deg); } 60%, 100% { transform: rotate(-90deg); } }
  @media (orientation: portrait) and (pointer: coarse) { #turn { display: flex; } }
  #stage { position: fixed; left: 0; top: 0; image-rendering: pixelated; image-rendering: crisp-edges; }
  #stage canvas { position: absolute; left: 0; top: 0; image-rendering: pixelated; image-rendering: crisp-edges; }
  #boot { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
          color: #c9a36a; font: 14px monospace; letter-spacing: 2px; }
</style>
</head>
<body>
<div id="boot">KINDLING THE FORGE…</div>
<div id="turn"><svg viewBox="0 0 64 64" fill="none" stroke="#e8b86a" stroke-width="3" stroke-linejoin="round"><rect x="20" y="6" width="24" height="44" rx="4"/><path d="M28 44h8"/><path d="M50 30c6 6 6 16 0 22M54 48l-4 4-4-4" stroke="#c9a36a"/></svg><div>Turn your phone sideways<br><span style="color:#9a8a72">the mine is wider than it is tall</span></div></div>
<div id="stage"></div>
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
  const result = await esbuild.build({ ...common, write: false, minify: true, outfile: 'dist/game.js', define: { DEV: 'false' } });
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
