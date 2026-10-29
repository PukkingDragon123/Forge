// Preview: voxel UI objects (frames, forge art, bag art, room props, medallions, lantern, chunks).
import { Game, Scene } from '../../src/core/game.js';
import * as F from '../../src/ui/frames.js';
import * as FA from '../../src/art/forge_art.js';
import { rugCanvas, arrowSign, scalesCanvas } from '../../src/art/room_art.js';
import { lanternCanvas, chunkCanvas, tagCanvas, noteCanvas } from '../../src/art/handpaint.js';
import { medallion } from '../../src/ui/touch.js';
import * as VU from '../../src/ui/vox_ui.js';
class P extends Scene {
  enter(p) { this.page = +(p.page || 1); }
  draw(ui) {
    if (this.page === 2) { ui.img(FA.floorCanvas(960, 540), 0, 0); ui.img(FA.backpackCanvas(5, 5, 32), 300, 60); ui.img(FA.clothCanvas(220, 150), 30, 300); ui.img(FA.pitCanvas(false), 700, 380); return; }
    if (this.page === 3) { ui.img(FA.benchCanvas(), 0, 372); ui.img(FA.bookCanvas(), 20, 20); ui.img(FA.anvilFaceCanvas(1), 520, 40); ui.img(FA.moldCanvas(4), 560, 300); return; }
    ui.rect(0, 0, ui.w, ui.h, '#3a3040');
    ui.img(rugCanvas(420, 104, '#7a2e22', 5), 20, 20);
    ui.img(arrowSign(), 470, 20);
    ui.img(scalesCanvas(0), 580, 20); ui.img(scalesCanvas(1), 660, 20);
    ['brass', 'iron', 'ember', 'rune', 'jade'].forEach((s, i) => ui.img(medallion(30, s, i === 1), 20 + i * 76, 160));
    ui.img(medallion(40, 'brass'), 420, 150); ui.img(medallion(12, 'iron'), 520, 160);
    for (let f = 0; f < 4; f++) ui.img(lanternCanvas(f), 600 + f * 30, 160, { scale: 2 });
    for (let k = 0; k < 8; k++) ui.img(chunkCanvas(['#6e5a46', '#9ab0ff', '#c86bff', '#5a4838'][k % 4], k + 1, 5 + k), 20 + k * 22, 260);
    ui.img(tagCanvas(90), 220, 250); ui.img(noteCanvas(120, 90, 7), 360, 240);
    ui.img(F.hangSign(170, 40), 520, 260); ui.img(F.seal(40), 720, 260); ui.img(F.chain(80), 780, 240);
  }
}
const g = new Game(document.getElementById('stage'), null);
g.register('p', P);
g.go('p', Object.fromEntries(new URLSearchParams(location.search)), { transition: 'none' });
g.start();
window.FORGLITE = g; window.FA = FA; window.F = F; window.VU = VU;
