// Preview bench for 2D pixel art (sprites, cards, portraits, logo). ?page=1..4
import { Scene } from '../core/game.js';
import { MATERIALS } from '../data/materials.js';
import { materialSprite, itemSprite, weaponSprite, portrait, logo, nodeBadge } from '../art/sprites.js';
import { materialCard, weaponCard, cardBack, drawCard } from '../ui/cards.js';
import { scaleCanvas } from '../art/pixel.js';
import { NODE_TYPES } from '../data/regions.js';
import { evaluate, finalizeWeapon } from '../systems/forge.js';

const WEAPONS = [
  ['sword', ['iron', 'iron', 'coal']], ['sword', ['gold', 'silver', 'ruby']], ['dagger', ['silver', 'spider_silk', 'spider_silk']],
  ['axe', ['junk', 'junk', 'junk', 'junk']], ['hammer', ['golem_core', 'iron', 'iron', 'coal']], ['spear', ['storm', 'copper', 'copper', 'topaz']],
  ['staff', ['ember', 'rime', 'storm', 'quartz']], ['sword', ['mithril', 'sapphire', 'bat_fang']], ['dagger', ['obsidian', 'venom_sac', 'bat_fang']],
  ['axe', ['magmasteel', 'fire_gland']], ['sword', ['cursedore', 'skull', 'iron']], ['hammer', ['stariron', 'diamond', 'iron']],
  ['pickaxe', ['iron', 'lodestone']], ['staff', ['moonstone', 'silver', 'wisp_essence']], ['spear', ['bone', 'bone', 'feather']], ['sword', ['copper', 'tin', 'rime']],
];

export class SpritePreview extends Scene {
  enter(p) { this.page = +(p.page || 1); }
  draw(ui) {
    ui.rect(0, 0, ui.w, ui.h, '#2a2230');
    const ids = Object.keys(MATERIALS);
    if (this.page === 1) {
      ids.forEach((id, i) => ui.img(materialSprite(id, 24), 4 + (i % 25) * 25, 4 + Math.floor(i / 25) * 25));
      ids.slice(0, 26).forEach((id, i) => ui.img(scaleCanvas(materialSprite(id, 24), 2), 4 + (i % 13) * 49, 112 + Math.floor(i / 13) * 49));
      ids.slice(26, 52).forEach((id, i) => ui.img(materialSprite(id, 32), 4 + (i % 18) * 34, 214 + Math.floor(i / 18) * 34));
    } else if (this.page === 2) {
      ids.slice(26).forEach((id, i) => ui.img(scaleCanvas(materialSprite(id, 24), 2), 4 + (i % 13) * 49, 4 + Math.floor(i / 13) * 49));
    } else if (this.page === 3) {
      let x = 4;
      for (const id of ['bone', 'beetle_shell', 'golem_core', 'rat_tail', 'bat_wing', 'feather', 'drill', 'scanner', 'mycel_crown', 'rune_echo', 'iron', 'mimic_tongue']) {
        const c = itemSprite(id, 20, 0); ui.rect(x, 4, c.width, c.height, '#3a2d36'); ui.img(c, x, 4);
        const r = itemSprite(id, 20, 1); ui.rect(x, 50, r.width, r.height, '#3a2d36'); ui.img(r, x, 50); x += Math.max(c.width, r.width) + 4;
      }
      WEAPONS.forEach(([bp, ing], i) => {
        const res = evaluate(bp, ing.map((id) => ({ id, q: 2, uid: i })), {});
        const w = { bp, ids: ing, el: res.el, grade: i % 5, recipe: res.recipe };
        ui.img(weaponSprite(w, 48), 4 + (i % 8) * 50, 96 + Math.floor(i / 8) * 50);
      });
      ui.img(logo(1), 410, 96);
      ui.img(logo(2), 4, 200);
      Object.keys(NODE_TYPES).forEach((t, i) => ui.img(scaleCanvas(nodeBadge(t, 17), 2), 410 + (i % 5) * 38, 160 + Math.floor(i / 5) * 38));
    } else if (this.page === 4) {
      ['bran', 'elio', 'durgan', 'clover'].forEach((c, j) => ['neutral', 'happy', 'angry', 'surprised', 'sad', 'smug', 'hurt'].forEach((e, i) => ui.img(scaleCanvas(portrait(c, e), 2), 4 + i * 66, 4 + j * 66)));
      ui.img(portrait('clover', 'happy', 64), 470, 4);
    } else if (this.page === 5) {
      const items = ['iron', 'junk', 'quartz', 'ruby', 'amethyst', 'storm', 'spider_silk', 'golem_core', 'bat_fang', 'golden_key', 'rune_echo', 'blast', 'stariron', 'queen_heart', 'cursedore', 'recipe_scroll'];
      items.forEach((id, i) => drawCard(ui, materialCard({ id, q: i % 5 }, { selected: i === 3, dim: i === 5 }), 6 + (i % 8) * 52, 8 + Math.floor(i / 8) * 72 + (i === 2 ? 0 : 0), { hover: i === 2, tilt: i === 4 ? 1 : 0 }));
      WEAPONS.slice(0, 5).forEach(([bp, ing], i) => {
        const res = evaluate(bp, ing.map((id) => ({ id, q: 2, uid: i })), {});
        const w = finalizeWeapon(res, [1, 4, 2, 0, 3][i], {});
        drawCard(ui, weaponCard(w), 6 + i * 78, 156);
      });
      drawCard(ui, cardBack('part'), 400, 156); drawCard(ui, cardBack('ore'), 452, 156); drawCard(ui, cardBack('forge'), 504, 156);
    }
  }
}
