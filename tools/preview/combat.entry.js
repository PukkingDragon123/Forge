// Combat scene preview: ?monster=rustrat&char=durgan&region=0&auto&noforge
import { Game, Scene } from '../../src/core/game.js';
import { Audio } from '../../src/audio/audio.js';
import { save } from '../../src/core/save.js';
import { Run } from '../../src/systems/run.js';
import { makeItem } from '../../src/systems/items.js';
import { CombatScene } from '../../src/scenes/combat.js';
import { BagOverlay } from '../../src/scenes/bag.js';

save.load();
const q = new URLSearchParams(location.search);
const game = new Game(document.getElementById('stage'), new Audio());
class Placeholder extends Scene {
  enter(p) { this.p = p; }
  draw(ui) { ui.text(`SCENE ${this.name} ${JSON.stringify(this.p || {}).slice(0, 60)}`, 20, 40, { outline: '#000' }); }
}
game.register('combat', CombatScene);
game.register('bag', BagOverlay);
for (const n of ['map', 'gameover', 'victory', 'descend', 'title']) game.register(n, Placeholder);
const run = new Run(q.get('char') || 'durgan', 'preview');
run.region = +(q.get('region') || 0);
if (q.has('rich')) for (const id of ['iron', 'iron', 'coal', 'silver']) run.bag.add(makeItem(id, 3));
if (q.has('hp')) run.hp = +q.get('hp');
if (q.has('tips')) save.data.seen.tips.combat = false; else save.data.seen.tips.combat = true;
game.run = run;
window.FORGLITE = game;
game.go('combat', { node: run.map.nodes[1], monster: q.get('monster') || 'rustrat', autoplay: q.has('auto') }, { transition: 'none' });
game.start();
// test hook: ?mhp=0.7 sets the monster to 70% HP once the fight starts (to reach boss phases quickly)
if (q.has('mhp')) { const iv = setInterval(() => { const s = game.scene; if (s && s.sim) { s.sim.m.hp = Math.round(s.sim.m.maxHp * +q.get('mhp')); clearInterval(iv); } }, 200); }
