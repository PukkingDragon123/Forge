// Bundle the travel preview with stand-ins for art modules that are missing or unfinished, then screenshot.
//   node tools/preview/travel.build.mjs out.png "query" waitMs [actions.json]
import * as esbuild from 'esbuild';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const [out = 'travel.png', query = '', wait = '3000', actions] = process.argv.slice(2);
const ART = ['src/art/sprites.js', 'src/ui/cards.js', 'src/models/characters.js', 'src/models/weapons3d.js', 'src/models/monsters.js', 'src/models/props.js', 'src/models/environments.js'];
const unfinished = (p) => !existsSync(p) || readFileSync(p, 'utf8').length < 300 || process.env.FORCE_STUB?.split(',').includes(basename(p, '.js'));
const plugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /(sprites|cards|characters|weapons3d|monsters|props|environments)\.js$/ }, (args) => {
      const abs = resolve(args.resolveDir, args.path);
      const rel = abs.slice(process.cwd().length + 1);
      if (!ART.includes(rel) || !unfinished(abs)) return undefined;
      return { path: resolve('tools/stubs', basename(abs)) };
    });
  },
};
const res = await esbuild.build({ entryPoints: ['tools/preview/travel.entry.js'], bundle: true, format: 'iife', write: false, plugins: [plugin], logLevel: 'error' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = resolve(dirname(out), 'travel.html');
writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#07060b;overflow:hidden}#stage{position:fixed;left:0;top:0}#stage canvas{position:absolute;left:0;top:0;image-rendering:pixelated}</style></head><body><div id="stage"></div><script>${js}</script></body></html>`);
execFileSync('node', ['tools/shot.mjs', query, out, wait, '1920', '1080', ...(actions ? [actions] : [])], { stdio: 'inherit', env: { ...process.env, PAGE: page } });
