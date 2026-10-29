// Preview: 2D sprites rendered from voxel models (ores, weapons) through gfx/voxsprite.js.
import { Game, Scene } from '../../src/core/game.js';
import { voxSprite } from '../../src/gfx/voxsprite.js';
import { buildOreModel } from '../../src/models/ore_voxel.js';
import { buildWeaponMesh } from '../../src/models/weapons3d.js';
import { MATERIALS } from '../../src/data/materials.js';
class P extends Scene {
  draw(ui) {
    ui.rect(0, 0, ui.w, ui.h, '#3a4a5a');
    const ids = Object.keys(MATERIALS).slice(0, 40);
    ids.forEach((id, i) => {
      const c = voxSprite('ore|' + id + '|64', () => buildOreModel(id, { res: 28 }), { w: 64, h: 64 });
      ui.img(c, 10 + (i % 13) * 72, 10 + Math.floor(i / 13) * 72);
    });
    ['sword', 'axe', 'hammer', 'spear'].forEach((bp, i) => {
      const c = voxSprite('w|' + bp, () => buildWeaponMesh({ bp, ids: ['iron', 'ruby', 'oak'], el: { fire: 2 }, grade: 3 }), { w: 128, h: 128, yaw: 0, pitch: 0, roll: -0.785 });
      ui.img(c, 10 + i * 140, 300);
    });
  }
}
const g = new Game(document.getElementById('stage'), null);
g.register('p', P);
g.go('p', {}, { transition: 'none' });
g.start();
window.FORGLITE = g;
