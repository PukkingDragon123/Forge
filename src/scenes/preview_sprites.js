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
    ui.rect(0, 0, ui.w, ui.h, this.page === 1 || this.page === 7 ? '#2e221c' : '#2a2230');
    const ids = Object.keys(MATERIALS);
    if (this.page === 1) this.kit(ui);
    else if (this.page === 7) this.diegetic(ui);
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
        ui.img(weaponSprite(w), 6 + (i % 8) * 118, 6 + Math.floor(i / 8) * 100);
        ui.img(weaponSprite(w, 48), 6 + i * 52, 210);
        ui.img(weaponSprite(w, 30), 6 + i * 52, 262);
        if (i < 3) ui.img(scaleCanvas(weaponSprite(w), 2), 6 + i * 196, 300);
      });
      ui.img(logo(1), 600, 320);
    } else if (this.page === 4) {
      ['bran', 'elio', 'durgan', 'clover'].forEach((c, j) => ['neutral', 'happy', 'angry', 'surprised', 'sad', 'smug', 'hurt'].forEach((e, i) => ui.img(scaleCanvas(portrait(c, e), 2), 6 + i * 104, 6 + j * 104)));
      ui.img(portrait('elio', 'happy'), 760, 6);
    } else if (this.page === 5) {
      const items = ['iron', 'junk', 'quartz', 'ruby', 'amethyst', 'storm', 'spider_silk', 'golem_core', 'bat_fang', 'golden_key', 'rune_echo', 'blast', 'stariron', 'queen_heart', 'salamander_scale', 'recipe_scroll'];
      items.forEach((id, i) => drawCard(ui, materialCard({ id, q: i % 5 }, { selected: i === 3, dim: i === 5 }), 8 + (i % 12) * 78, 8 + Math.floor(i / 12) * 108, { hover: i === 2, tilt: i === 4 ? 1 : 0 }));
      WEAPONS.slice(0, 5).forEach(([bp, ing], i) => {
        const res = evaluate(bp, ing.map((id) => ({ id, q: 2, uid: i })), {});
        const w = finalizeWeapon(res, [1, 4, 2, 0, 3][i], {});
        drawCard(ui, weaponCard(w), 320 + i * 110, 230);
      });
      drawCard(ui, cardBack('part'), 8, 390); drawCard(ui, cardBack('ore'), 86, 390); drawCard(ui, cardBack('forge'), 164, 390);
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
    ui.img(F.book(300, 190), 10, 10);
    const S = ['wood', 'gold', 'iron', 'stone', 'red', 'green', 'purple'];
    S.forEach((s, i) => ['idle', 'hover', 'down', 'off'].forEach((st, j) => ui.img(F.button(72, 22, s, st), 320 + j * 76, 10 + i * 26)));
    S.forEach((s, i) => ui.button('b' + s, 320 + (i % 4) * 80, 196 + Math.floor(i / 4) * 26, 76, 22, s === 'stone' ? 'Move on' : s === 'red' ? 'Abandon' : s, { style: s, icon: i % 2 ? 'hammer' : null }));
    ['wood', 'gold', 'iron', 'red'].forEach((s, i) => ui.iconButton('ib' + s, 650 + i * 20, 196, 'tool', { style: s }));
    ui.img(F.leather(200, 110), 10, 210); ui.img(F.wood(200, 100), 220, 250);
    ui.img(F.parchment(170, 100), 640, 10); ui.img(F.stone(120, 60), 820, 10);
    ui.img(F.dark(150, 46), 640, 120); ui.img(F.dark(120, 30, { accent: 'purple' }), 800, 120);
    ui.img(F.gold(110, 22), 640, 175); ui.img(F.gold(100, 60, { inner: '#2a1830' }), 760, 160);
    ui.img(F.iron(100, 56), 640, 230); ui.img(F.steel(40, 40, { glyph: 'x' }), 750, 236); ui.img(F.steel(40, 40, { glyph: 'gear' }), 796, 236); ui.img(F.steel(40, 40), 842, 236);
    ui.img(F.plank(230, 30, { inset: true }), 430, 260); ui.img(F.plank(160, 22), 430, 296);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) ui.img(F.slot(28, 28), 640 + x * 30, 300 + y * 30);
    ui.img(F.slot(28, 28, { glow: '#ffd25e' }), 770, 300);
    ui.img(F.ribbon(150, 'red'), 10, 330); ui.img(F.ribbon(150, 'gold'), 10, 350); ui.img(F.ribbon(150, 'blue'), 170, 370); ui.img(F.ribbon(150, 'purple'), 10, 370);
    ui.img(F.divider(200), 10, 395);
    ui.img(F.sign(110, 40), 820, 300); ui.img(F.chain(120), 920, 300);
    ui.img(F.bar(200, 10, 0.7), 10, 410);
    ui.text('Forge the blade', 26, 236, { font: 'large', color: '#f4e2b8', outline: '#1c100c' });
    ui.text('Ink on parchment, nailed up.', 656, 40, { color: '#3a2010' });
    ui.text('A tooltip on charcoal paper.', 650, 130, { color: '#f4e2b8' });
  }
  diegetic(ui) {
    const t1 = F.tag(70, 44); ui.img(t1, 20, 10); ui.text('Iron Ore', 20 + t1.inner.x, 10 + t1.inner.y, { color: '#3a2010' });
    const t2 = F.tag(60, 40, { tone: 'brass', string: 18 }); ui.img(t2, 100, 10); ui.text('30', 100 + t2.inner.x + 20, 10 + t2.inner.y, { color: '#3a1e08' });
    const t3 = F.tag(64, 42, { tone: 'leather', string: 8 }); ui.img(t3, 170, 10); ui.text('Bag', 170 + t3.inner.x + 14, 10 + t3.inner.y, { color: '#f4e2b8', outline: '#1c100c' });
    const h1 = F.hangSign(170, 40); ui.img(h1, 250, 0); ui.text('The Old Mine', 250 + 85, h1.inner.y + 8, { font: 'large', color: '#f4e2b8', outline: '#1c100c', align: 'center' });
    const h2 = F.hangSign(150, 30, { chain: true, tone: 'dark', hang: 20 }); ui.img(h2, 440, 0); ui.text('Descend', 440 + 75, h2.inner.y + 5, { font: 'large', color: '#ffd25e', outline: '#1c100c', align: 'center' });
    const sl = F.slate(200, 110); ui.img(sl, 20, 120); ui.text('Chips  12\nMult   ×3\nTotal  36', 20 + sl.inner.x + 4, 120 + sl.inner.y + 4, { font: 'large', color: F.CHALK });
    const sc = F.scrap(150, 100); ui.img(sc, 240, 90); ui.text('Two thirsty teeth\non a long blade...', 240 + sc.inner.x, 90 + sc.inner.y + 4, { color: '#3a2010' });
    const sc2 = F.scrap(120, 80, { nails: 2, seed: 3, lines: true }); ui.img(sc2, 400, 110);
    ['red', 'green', 'purple', 'blue', 'gold', 'black'].forEach((c, i) => ui.img(F.seal(18, { color: c, glyph: ['anvil', 'check', 'star', 'flame', 'coin', 'skull'][i] }), 540 + i * 28, 80));
    ui.img(F.seal(26, { color: 'red', glyph: 'anvil', ribbon: 'red' }), 540, 120); ui.img(F.seal(22, { color: 'gold', glyph: 'hammer', ribbon: 'blue' }), 580, 120);
    ui.img(F.cord(40), 700, 0); ui.img(F.cord(30, { twine: true }), 712, 0);
    ['wood', 'gold', 'stone', 'red'].forEach((s, i) => ui.button('d' + s, 20 + i * 110, 250, 104, 24, ['Leave', 'Forge!', 'Never mind', 'Abandon run'][i], { style: s }));
    ['wood', 'gold', 'stone', 'red'].forEach((s, i) => ui.img(scaleCanvas(F.button(104, 24, s, 'idle'), 2), 20 + i * 220, 290));
    ui.img(scaleCanvas(F.tag(70, 44), 3), 20, 350); ui.img(scaleCanvas(F.seal(26, { color: 'red', glyph: 'anvil', ribbon: 'red' }), 4), 240, 350);
    ui.img(scaleCanvas(F.hangSign(120, 30), 2), 400, 360);
  }

}
