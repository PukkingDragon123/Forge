// Bundle an isolated preview entry and screenshot it (for working on one module without the full game).
//   node tools/preview.mjs tools/preview/monsters.entry.js out.png [query] [waitMs]
import * as esbuild from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const [entry, out = 'preview.png', query = '', wait = '2500'] = process.argv.slice(2);
const dir = resolve(dirname(out));
mkdirSync(dir, { recursive: true });
const name = basename(entry).replace(/\.js$/, '');
const res = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', write: false, define: { DEV: 'true' }, logLevel: 'error' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#07060b;overflow:hidden}#stage{position:fixed;left:0;top:0}#stage canvas{position:absolute;left:0;top:0;image-rendering:pixelated}</style></head><body><div id="stage"></div><script>${js}</script></body></html>`;
const page = resolve(dir, name + '.html');
writeFileSync(page, html);
execFileSync('node', ['tools/shot.mjs', query, out, wait], { stdio: 'inherit', env: { ...process.env, PAGE: page } });
