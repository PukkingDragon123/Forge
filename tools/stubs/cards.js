// STUB
import { Painter } from '../../src/art/pixel.js';
import { MATERIALS, RARITY } from '../../src/data/materials.js';
import { drawText } from '../../src/ui/font.js';
import { materialSprite, weaponSprite } from '../../src/art/sprites.js';
const card = (w, h, col) => { const p = new Painter(w, h); p.rect(0, 0, w, h, '#140c10'); p.rect(1, 1, w - 2, h - 2, col); p.rect(3, 3, w - 6, h - 6, '#2a2030'); return p.toCanvas(); };
export function materialCard(item, opts = {}) { const m = MATERIALS[item.id]; const c = card(48, 64, RARITY[m.rarity].color); const g = c.getContext('2d'); g.drawImage(materialSprite(item.id, 24), 12, 10); drawText(g, m.name, 24, 44, { font: 'small', align: 'center', maxW: 44 }); return c; }
export function weaponCard(w) { const c = card(72, 96, '#ffb63d'); const g = c.getContext('2d'); g.drawImage(weaponSprite(w, 48), 12, 8); drawText(g, String(w.dmg), 36, 70, { align: 'center' }); return c; }
export function cardBack() { return card(48, 64, '#5a4a6a'); }
export function drawCard(ui, canvas, x, y, o = {}) { ui.img(canvas, x, y - (o.lift || 0)); }
