// FORGLITE entry point.
import { Game } from './core/game.js';
import { Audio } from './audio/audio.js';
import { save } from './core/save.js';
import { registerScenes } from './scenes/index.js';
import { Run } from './systems/run.js';
import { CameraRig } from './gfx/camera.js';

save.load();
const stage = document.getElementById('stage');
const audio = new Audio();
const game = new Game(stage, audio);
const st = save.data.settings;
CameraRig.shakeSetting = st.shake ? 1 : 0;
if (st.pixelScale) game.renderer.setScaleBias(st.pixelScale === 1 ? 1 : -1);
audio.setVolumes({ master: st.master, music: st.music, sfx: st.sfx });
window.FORGLITE = game; // handy for debugging & automated tests
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
