// Preview bench for 2D pixel art (UI kit, sprites, cards, portraits, logo). ?page=1..6
import { Scene } from '../core/game.js';
import { MATERIALS } from '../data/materials.js';
import { materialSprite, itemSprite, weaponSprite, portrait, logo, nodeBadge } from '../art/sprites.js';
import { materialCard, weaponCard, cardBack, drawCard } from '../ui/cards.js';
import { scaleCanvas } from '../art/pixel.js';
import { NODE_TYPES } from '../data/regions.js';
import { evaluate, finalizeWeapon } from '../systems/forge.js';
import * as F from '../ui/frames.js';
import { iconNames } from '../ui/icons.js';

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
    ui.rect(0, 0, ui.w, ui.h, this.page === 1 ? '#5a3a7a' : '#2a2230');
    const ids = Object.keys(MATERIALS);
    if (this.page === 1) this.kit(ui);
    else if (this.page === 2) {
      ids.forEach((id, i) => ui.img(materialSprite(id), 6 + (i % 26) * 36, 6 + Math.floor(i / 26) * 36));
      ids.slice(0, 13).forEach((id, i) => ui.img(scaleCanvas(materialSprite(id), 2), 6 + i * 70, 150));
      let x = 6;
      for (const id of ['bone', 'beetle_shell', 'golem_core', 'rat_tail', 'bat_wing', 'feather', 'drill', 'scanner', 'mycel_crown', 'rune_echo', 'iron', 'mimic_tongue']) {
        const c = itemSprite(id, 32, 0); ui.rect(x, 230, c.width, c.height, '#3a2d36'); ui.img(c, x, 230);
        const r = itemSprite(id, 32, 1); ui.rect(x, 300, r.width, r.height, '#3a2d36'); ui.img(r, x, 300); x += Math.max(c.width, r.width) + 6;
      }
      Object.keys(NODE_TYPES).forEach((t, i) => ui.img(nodeBadge(t), 6 + i * 34, 380));
      ui.img(scaleCanvas(nodeBadge('boss'), 2), 330, 370);
    } else if (this.page === 3) {
      WEAPONS.forEach(([bp, ing], i) => {
        const res = evaluate(bp, ing.map((id) => ({ id, q: 2, uid: i })), {});
        const w = { bp, ids: ing, el: res.el, grade: i % 5, recipe: res.recipe };
        ui.img(weaponSprite(w), 6 + (i % 8) * 116, 6 + Math.floor(i / 8) * 110);
      });
      ui.img(logo(1), 6, 240);
      ui.img(logo(2), 6, 330);
    } else if (this.page === 4) {
      ['bran', 'elio', 'durgan', 'clover'].forEach((c, j) => ['neutral', 'happy', 'angry', 'surprised', 'sad', 'smug', 'hurt'].forEach((e, i) => ui.img(scaleCanvas(portrait(c, e), 2), 6 + i * 104, 6 + j * 104)));
      ui.img(portrait('elio', 'happy'), 760, 6);
    } else if (this.page === 5) {
      const items = ['iron', 'junk', 'quartz', 'ruby', 'amethyst', 'storm', 'spider_silk', 'golem_core', 'bat_fang', 'golden_key', 'rune_echo', 'blast', 'stariron', 'queen_heart', 'cursedore', 'recipe_scroll'];
      items.forEach((id, i) => drawCard(ui, materialCard({ id, q: i % 5 }, { selected: i === 3, dim: i === 5 }), 8 + (i % 10) * 80, 10 + Math.floor(i / 10) * 112, { hover: i === 2, tilt: i === 4 ? 1 : 0 }));
      WEAPONS.slice(0, 5).forEach(([bp, ing], i) => {
        const res = evaluate(bp, ing.map((id) => ({ id, q: 2, uid: i })), {});
        const w = finalizeWeapon(res, [1, 4, 2, 0, 3][i], {});
        drawCard(ui, weaponCard(w), 8 + i * 112, 240);
      });
      drawCard(ui, cardBack('part'), 600, 240); drawCard(ui, cardBack('ore'), 680, 240); drawCard(ui, cardBack('forge'), 760, 240);
    } else if (this.page === 6) {
      iconNames().forEach((n, i) => { ui.icon(n, 8 + (i % 24) * 22, 8 + Math.floor(i / 24) * 22); ui.icon(n + ':s', 8 + (i % 24) * 22, 120 + Math.floor(i / 24) * 16); });
      ui.text('The quick brown fox jumps over the lazy dog. 0123456789 ×·—●○→★♥…', 8, 200, { font: 'large' });
      ui.text('ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz !?.,:;-+=/\\\'"()[]%*#&<>_$^~|', 8, 220, { font: 'large' });
      ui.text('Body: {chips}+12 Chips{/} {mult}×1.5 Mult{/} {@coin} 30 coins, {@fire} Fire 2', 8, 245);
      ui.text('{gold}Large:{/} {chips}+12 Chips{/} {mult}×1.5{/} {@coin} 30', 8, 260, { font: 'large' });
      ui.text('SMALL FONT: +8 CHIPS ×2 MULT · {@coin} 15', 8, 282, { font: 'small' });
      ui.keycap('SPACE', 8, 300); ui.keycap('E', 60, 300); ui.keycap('SHIFT', 80, 300); ui.keycap('TAB', 130, 300);
    }
  }
  kit(ui) {
    // recreation of the reference UI kit
    ui.img(F.book(380, 250), 20, 20);
    ui.img(F.bar(300, 12, 1, ['#9a5410', '#f2b231', '#ffd863']), 40, 290);
    ui.img(F.plank(330, 34), 30, 320);
    ui.img(F.button(90, 34, 'gold', 'idle'), 430, 30); ui.img(F.button(40, 40, 'gold', 'idle'), 528, 30); ui.img(F.button(40, 40, 'red', 'idle'), 575, 30);
    ui.img(F.button(90, 38, 'red', 'idle'), 430, 80); ui.img(F.button(26, 26, 'gold', 'hover'), 528, 84); ui.img(F.button(26, 26, 'red', 'down'), 560, 84);
    ui.img(F.chain(220), 445, 140);
    ui.img(F.plank(170, 34), 480, 150);
    ui.img(F.steel(52, 52, { glyph: 'x' }), 485, 200); ui.img(F.steel(52, 52), 545, 200); ui.img(F.steel(52, 52, { glyph: 'gear' }), 605, 200);
    ui.img(F.gold(80, 28), 480, 270); ui.img(F.gold(80, 28, { notch: true }), 570, 270);
    ui.img(F.sign(110, 40), 660, 30);
    ui.img(F.leather(220, 120), 680, 90); ui.img(F.wood(220, 100), 680, 220);
    ui.img(F.parchment(160, 90), 480, 320); ui.img(F.stone(120, 60), 660, 330); ui.img(F.dark(150, 60), 790, 330);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) ui.img(F.slot(30, 30), 700 + x * 32, 400 + y * 32);
    ui.img(F.iron(120, 70), 830, 400);
    ui.img(F.ribbon(150, 'red'), 20, 380); ui.img(F.ribbon(150, 'gold'), 180, 380); ui.img(F.ribbon(150, 'blue'), 20, 400); ui.img(F.ribbon(150, 'purple'), 180, 400);
    ui.img(F.divider(200), 20, 430);
    ['wood', 'gold', 'iron', 'stone', 'red', 'green', 'purple'].forEach((s, i) => ['idle', 'hover', 'down', 'off'].forEach((st, j) => ui.img(F.button(64, 22, s, st), 20 + j * 68, 450 + i * 0 + (i * 0)) && 0));
    ['wood', 'gold', 'iron', 'stone', 'red', 'green', 'purple'].forEach((s, i) => ui.button('b' + s, 20 + i * 70, 500, 66, 24, s, { style: s, icon: i % 2 ? 'hammer' : null }));
  }
}
