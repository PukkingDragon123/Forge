// Preview: travel + event scenes. ?scene=travel|event&tunnel=bridge&sight=shadow&event=workshop&region=0&char=clover
import { Game, Scene } from '../../src/core/game.js';
import { Audio } from '../../src/audio/audio.js';
import { TravelScene } from '../../src/scenes/travel.js';
import { EventScene } from '../../src/scenes/event.js';
import { BagOverlay } from '../../src/scenes/bag.js';
import { Run } from '../../src/systems/run.js';
import { save } from '../../src/core/save.js';
import { generateMap } from '../../src/systems/mapgen.js';

class Dummy extends Scene {
  enter(p) { window.__arrived = this.name; window.__params = p; }
  draw(ui) { ui.text('ARRIVED AT: ' + this.name, 20, 60, { color: '#ffd25e' }); }
}
save.load();
const q = Object.fromEntries(new URLSearchParams(location.search).entries());
const game = new Game(document.getElementById('stage'), new Audio());
window.FORGLITE = game;
game.register('travel', TravelScene);
game.register('event', EventScene);
game.register('bag', BagOverlay);
for (const n of ['map', 'mining', 'combat', 'treasure', 'merchant', 'camp', 'gameover', 'descend', 'victory']) game.register(n, class extends Dummy {});
const run = new Run(q.char || 'clover', 'preview-' + (q.seed || 1));
run.region = +(q.region || 0);
run.map = generateMap(run.rng.fork('m'), run.region);
game.run = run;
const edge = { ...run.map.edges[0], tunnel: q.tunnel || 'tunnel', sight: q.sight || null };
const node = run.map.nodes[edge.b];
if (q.type) node.type = q.type;
if ((q.scene || 'travel') === 'travel') game.go('travel', { edge, node }, { transition: 'none' });
else game.go('event', { node, event: q.event || 'workshop' }, { transition: 'none' });
game.start();

// Headless logic stepper for tests (rendering in swiftshader is too slow to play scenes in real time).
window.__qlog = [];
window.__step = (n = 60, dt = 1 / 30) => {
  const g = window.FORGLITE;
  for (let i = 0; i < n; i++) {
    const s = g.scene;
    if (!s || g.trans) break;
    if (s.qte && !s.qte.resolved) {
      const q = s.qte.q || s.qte.obj;
      if (q && q.t > 0.2 && q.state === 'pending') { window.__qlog.push(q.constructor.name); q.state = window.__qlog.length % 2 ? 'win' : 'lose'; }
    }
    s.tw.update(dt * g.timeScale); s.co.update(dt * g.timeScale); s.update(dt * g.timeScale, dt);
  }
  const s = g.scene;
  return [s.name, s.mode || s.phase, s.x && s.x.toFixed(1), g.run.hp].join(' ');
};
