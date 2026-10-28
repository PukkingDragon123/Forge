// Mining scene preview: ?char=bran&region=0&seed=x
import { Game, Scene } from '../../src/core/game.js';
import { Audio } from '../../src/audio/audio.js';
import { Run } from '../../src/systems/run.js';
import { makeItem } from '../../src/systems/items.js';
import { MiningScene } from '../../src/scenes/mining.js';
import { BagOverlay } from '../../src/scenes/bag.js';
import { save } from '../../src/core/save.js';

class DummyMap extends Scene {
  draw(ui) { ui.text('MAP (dummy) — finished mining', ui.w / 2, ui.h / 2, { align: 'center' }); }
}
save.load();
const q = new URLSearchParams(location.search);
if (q.get('tip') !== '1') save.data.seen.tips.mining = true;
const g = new Game(document.getElementById('stage'), new Audio());
g.register('mining', MiningScene);
g.register('bag', BagOverlay);
g.register('map', DummyMap);
g.register('gameover', DummyMap);
const run = new Run(q.get('char') || 'bran', q.get('seed') || 'preview1');
run.region = +(q.get('region') || 0);
for (const id of ['blast', 'scanner', 'radar', 'flare', 'drill', 'lodestone', 'storm']) run.bag.add(makeItem(id, 2));
g.run = run;
window.FORGLITE = g;
g.go('mining', { node: run.map.nodes[1] }, { transition: 'none' });
g.start();
