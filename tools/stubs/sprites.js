// STUB (used only until src/art/sprites.js exists)
import { Painter, withOutline } from '../../src/art/pixel.js';
import { MATERIALS } from '../../src/data/materials.js';
import { SHAPES, rotateCells, cellsSize } from '../../src/data/shapes.js';
import { bigText } from '../../src/ui/font.js';
import { icon } from '../../src/ui/icons.js';
export function materialSprite(id, size = 24) { const m = MATERIALS[id]; const p = new Painter(size, size); p.ellipse(size / 2, size / 2, size / 2 - 3, size / 2 - 4, m.color || '#888'); p.outline('#140c10'); return p.toCanvas(); }
export function itemSprite(id, cell = 20, rot = 0) { const m = MATERIALS[id]; const cells = rotateCells(SHAPES[m.shape || 'o1'], rot); const { w, h } = cellsSize(cells); const p = new Painter(w * cell, h * cell); for (const [x, y] of cells) p.rect(x * cell + 2, y * cell + 2, cell - 4, cell - 4, m.color || '#888'); p.outline('#140c10'); return p.toCanvas(); }
export function weaponSprite(w, size = 48) { const p = new Painter(size, size); p.line(6, size - 6, size - 6, 6, '#c0c8d0'); p.line(7, size - 6, size - 5, 6, '#808890'); p.outline('#140c10'); return p.toCanvas(); }
export function portrait(id, expr, size = 32) { const p = new Painter(size, size); p.circle(size / 2, size / 2, size / 2 - 2, '#e0b090'); p.outline('#140c10'); return p.toCanvas(); }
export function logo() { return bigText('FORGLITE', { scale: 4 }); }
export function nodeBadge(type, size = 17) { const ic = icon({ start: 'start', monster: 'monster', elite: 'elite', boss: 'boss', mining: 'mining', treasure: 'treasure', merchant: 'merchant', event: 'event', camp: 'camp' }[type] || 'question'); return ic.canvas; }
