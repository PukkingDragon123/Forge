// Preview build for the combat scene. Missing / unfinished art modules fall back to tools/stubs.
//   node tools/preview/combat_build.mjs out.png "monster=rustrat&auto" [waitMs] [actions.json]
//   env STUB=characters,forgeui  → force those modules to stubs
import * as esbuild from 'esbuild';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const [out = 'c.png', query = '', wait = '3000', actions = ''] = process.argv.slice(2);
const force = (process.env.STUB || '').split(',').filter(Boolean);
const STUBS = { 'src/art/sprites.js': 'tools/stubs/sprites.js', 'src/ui/cards.js': 'tools/stubs/cards.js', 'src/models/characters.js': 'tools/stubs/characters.js', 'src/models/weapons3d.js': 'tools/stubs/weapons3d.js', 'src/models/monsters.js': 'tools/stubs/monsters.js', 'src/models/props.js': 'tools/stubs/props.js', 'src/models/environments.js': 'tools/stubs/environments.js', 'src/scenes/forgeui.js': 'tools/preview/combat_stubs/forgeui.js', 'src/audio/audio.js': 'tools/stubs/audio.js' };
const unfinished = (p) => !existsSync(p) || /throw new Error\('todo'\)/.test(readFileSync(p, 'utf8'));
const plugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /(sprites|cards|characters|weapons3d|monsters|props|environments|forgeui|audio)\.js$/ }, (args) => {
      if (args.importer.includes('/stubs/') || args.importer.includes('combat_stubs')) {
        const real = resolve(dirname(args.importer), args.path);
        const rel0 = real.slice(process.cwd().length + 1);
        if (STUBS[rel0] && !unfinished(real) && !force.some((f) => rel0.includes(f))) return { path: real };
      }
      const abs = resolve(args.resolveDir, args.path);
      const rel = abs.slice(process.cwd().length + 1);
      if (!STUBS[rel]) return undefined;
      if (unfinished(abs) || force.some((f) => rel.includes(f))) return { path: resolve(STUBS[rel]) };
      return undefined;
    });
  },
};
const dir = dirname(resolve(out));
mkdirSync(dir, { recursive: true });
const res = await esbuild.build({ entryPoints: ['tools/preview/combat.entry.js'], bundle: true, format: 'iife', write: false, plugins: [plugin], define: { DEV: 'true' }, logLevel: 'error' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = resolve(dir, 'combat.html');
writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#07060b;overflow:hidden}#stage{position:fixed;left:0;top:0}#stage canvas{position:absolute;left:0;top:0;image-rendering:pixelated}</style></head><body><div id="stage"></div><script>${js}</script></body></html>`);
execFileSync('node', ['tools/shot.mjs', query, out, wait, '1920', '1080', actions].filter((x) => x !== ''), { stdio: 'inherit', env: { ...process.env, PAGE: page } });
