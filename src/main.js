// FORGLITE entry point.
import { Game } from './core/game.js';
import { Audio } from './audio/audio.js';
import { save } from './core/save.js';
import { registerScenes } from './scenes/index.js';
import { Run } from './systems/run.js';
import { CameraRig } from './gfx/camera.js';
import { icon, iconNames } from './ui/icons.js';
import { materialSprite } from './art/sprites.js';
import { CHARACTERS } from './data/characters.js';

save.load();
const stage = document.getElementById('stage');
const audio = new Audio();
const game = new Game(stage, audio);
const st = save.data.settings;
CameraRig.shakeSetting = st.shake ? 1 : 0;
if (st.pixelScale) game.renderer.setScaleBias(st.pixelScale === 1 ? 1 : -1);
audio.setVolumes({ master: st.master, music: st.music, sfx: st.sfx });
window.FORGLITE = game; // handy for debugging & automated tests
// phones: the first tap goes fullscreen and asks for landscape (silently skipped where not allowed)
const firstGesture = game.input.onFirstGesture;
game.input.onFirstGesture = () => { firstGesture && firstGesture(); if (game.input.touch && st.fullscreen !== 0) enterFullscreen(); };
export function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } };
    if (p && p.then) p.then(lock).catch(() => {}); else lock();
  } catch (e) { /* not allowed in this frame */ }
}
game.enterFullscreen = enterFullscreen;
registerScenes(game);
const params = new URLSearchParams(location.search);
// dev shortcut: ?scene=map&char=bran&region=2 starts a throwaway run
if (params.get('char')) {
  game.run = new Run(params.get('char'), params.get('seed') || 'dev');
  const r = +(params.get('region') || 0);
  for (let i = 0; i < r; i++) game.run.nextRegion();
}
const boot = document.getElementById('boot');
if (boot) boot.remove();
game.go(params.get('scene') || 'title', Object.fromEntries(params.entries()), { transition: 'none' });
game.start();

// Every 2D sprite is rendered from a voxel model on first use. Warm the common ones in idle time
// (one per idle slice) so the first bag, card or icon never stutters.
const warm = [
  ...iconNames().flatMap((n) => [() => icon(n), () => icon(n + ':s')]),
  ...[...new Set(Object.values(CHARACTERS).flatMap((c) => c.start || []))].flatMap((id) => [() => materialSprite(id, 32), () => materialSprite(id, 48)]),
];
const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 60));
const pump = (d) => {
  while (warm.length && d.timeRemaining() > 4) { try { warm.shift()(); } catch (e) { /* skip */ } }
  if (warm.length) idle(pump);
};
setTimeout(() => idle(pump), 2500);
