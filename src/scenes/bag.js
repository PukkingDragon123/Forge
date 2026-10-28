// Backpack overlay: hand-stitched leather bag with a 5×5 grid. Drag, rotate, arrange, discard.
import { Scene } from '../core/game.js';
import { Painter } from '../art/pixel.js';
import { itemSprite } from '../art/sprites.js';
import { matOf, itemTooltip, cellsOf } from '../systems/items.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { RECIPES } from '../data/blueprints.js';
import { COLORS } from '../ui/font.js';
import { slot } from '../ui/frames.js';
import { dim } from './common.js';
import { hash2, fbm2, clamp } from '../core/math.js';

const CELL = 22;
let bagArt = null;

function makeBagArt() {
  const W = 168, H = 186;
  const p = new Painter(W, H);
  const T = ['#3a1f12', '#4f2b19', '#5f3520', '#6e3f27', '#80502f', '#9c6640', '#b97f52'];
  const shade = (x, y) => {
    const n = fbm2(x * 0.08, y * 0.08, 3, 5) * 0.65 + hash2(x, y, 9) * 0.35;
    return T[1 + Math.floor(clamp(n, 0, 0.999) * 4)];
  };
  // side pockets
  for (const sx of [0, W - 18]) p.poly([[sx + 2, 70], [sx + 16, 66], [sx + 16, 150], [sx + 2, 146]], (x, y) => shade(x + 40, y));
  // main body (rounded)
  p.poly([[12, 30], [W - 12, 30], [W - 8, 40], [W - 8, H - 10], [W - 14, H - 4], [14, H - 4], [8, H - 10], [8, 40]], (x, y) => shade(x, y));
  // bottom shading
  for (let y = H - 30; y < H - 4; y++) for (let x = 8; x < W - 8; x++) if (p.alpha(x, y) && ((x + y) % 2 === 0 || y > H - 14)) p.set(x, y, T[1]);
  // flap
  p.poly([[16, 6], [W - 16, 6], [W - 10, 16], [W - 12, 40], [W / 2 + 18, 48], [W / 2 - 18, 48], [12, 40], [10, 16]], (x, y) => (y < 9 ? T[6] : shade(x + 17, y + 3)));
  for (let x = 16; x < W - 16; x++) p.set(x, 7, T[6]);
  // flap stitching
  for (let x = 18; x < W - 18; x += 3) { p.set(x, 11, '#e6c08a'); p.set(x, 12, T[0]); }
  // buckle on flap
  const bx = W / 2 - 7, by = 34;
  p.rect(bx, by, 14, 11, '#3a2a10'); p.rect(bx + 1, by + 1, 12, 9, '#c8902a'); p.rect(bx + 3, by + 3, 8, 5, T[2]);
  p.rect(bx + 1, by + 1, 12, 1, '#ffe08a'); p.rect(bx + 6, by + 2, 2, 7, '#e8c070');
  // straps
  for (const sx of [34, W - 40]) {
    p.rect(sx, 44, 6, H - 50, T[1]);
    p.rect(sx + 1, 44, 1, H - 50, T[5]);
    p.rect(sx, H - 30, 6, 4, '#a0742a'); p.rect(sx + 1, H - 29, 4, 2, '#3a2a10');
  }
  p.outline('#140c10');
  // rings/hooks
  p.rect(4, 22, 4, 6, '#9aa3b2'); p.rect(W - 8, 22, 4, 6, '#9aa3b2');
  return p.toCanvas();
}

export class BagOverlay extends Scene {
  get freezesBelow() { return true; }
  enter(params = {}) {
    this.params = params;
    this.title = params.title || 'Backpack';
    this.drag = null;
    this.confirm = false;
    this.flash = {};
    this.game.audio && this.game.audio.play('bag_open');
    if (!bagArt) bagArt = makeBagArt();
    this.t = 0;
  }
  exit() { this.game.audio && this.game.audio.play('bag_close'); }

  close(force = false) {
    const bag = this.game.run.bag;
    if (bag.overflow.length && !force) { this.confirm = true; return; }
    if (force) bag.overflow.length = 0;
    this.game.popOverlay(this);
    this.params.onClose && this.params.onClose();
  }

  layout(ui) {
    const W = 168 + 16 + 210;
    const x0 = Math.round(ui.w / 2 - W / 2), y0 = Math.round(ui.h / 2 - 100);
    return { bagX: x0, bagY: y0 + 4, gx: x0 + 29, gy: y0 + 4 + 56, trayX: x0 + 168 + 16, trayY: y0 + 14, trayW: 210, trayH: 150 };
  }

  update(dt) { this.t += dt; }

  trayPositions(L, items) {
    // simple shelf packing in the tray
    let x = L.trayX + 8, y = L.trayY + 22, rowH = 0;
    const out = new Map();
    for (const it of items) {
      const cells = cellsOf(it);
      const w = (Math.max(...cells.map((c) => c[0])) + 1) * CELL, h = (Math.max(...cells.map((c) => c[1])) + 1) * CELL;
      if (x + w > L.trayX + L.trayW - 8) { x = L.trayX + 8; y += rowH + 4; rowH = 0; }
      out.set(it, { x, y, w, h });
      x += w + 4; rowH = Math.max(rowH, h);
    }
    return out;
  }

  draw(ui) {
    const game = this.game, run = game.run, bag = run.bag, inp = game.input;
    dim(ui, 0.62);
    const L = this.layout(ui);
    // bag art + grid
    ui.img(bagArt, L.bagX, L.bagY);
    ui.text(this.title, L.bagX + 84, L.bagY - 10, { align: 'center', color: COLORS.gold, outline: '#140c10', outlineShadow: false });
    const grid = bag.grid();
    const cellSlot = slot(CELL, CELL, { tone: 'leather' });
    for (let y = 0; y < bag.h; y++) for (let x = 0; x < bag.w; x++) ui.img(cellSlot, L.gx + x * CELL, L.gy + y * CELL);
    // stitched border around grid
    ui.rect(L.gx - 2, L.gy - 2, bag.w * CELL + 4, 1, '#e6c08a', 0.5);
    ui.rect(L.gx - 2, L.gy + bag.h * CELL + 1, bag.w * CELL + 4, 1, '#e6c08a', 0.5);

    // tray
    ui.panel('wood', L.trayX, L.trayY, L.trayW, L.trayH, { tone: 'dark' });
    ui.text(bag.overflow.length ? `New loot ({gold}${bag.overflow.length}{/})` : 'Loot tray', L.trayX + 8, L.trayY + 7, { color: COLORS.white, outline: '#140c10', outlineShadow: false });
    if (!bag.overflow.length) ui.text('Drag items here to\nset them aside.', L.trayX + L.trayW / 2, L.trayY + 60, { align: 'center', color: COLORS.dim });
    // trash
    const trash = { x: L.trayX + L.trayW - 46, y: L.trayY + L.trayH + 6, w: 46, h: 30 };
    ui.panel('iron', trash.x, trash.y, trash.w, trash.h, { rivets: false });
    ui.icon('cross', trash.x + 6, trash.y + 10);
    ui.text('Toss', trash.x + 15, trash.y + 11, { color: '#ffb0a0' });

    // bonuses
    const bonus = bag.bonuses();
    const links = bag.links();
    const center = (it) => {
      const cells = bag.cellsAt(it, it.x, it.y);
      const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length, cy = cells.reduce((a, c) => a + c[1], 0) / cells.length;
      return [L.gx + (cx + 0.5) * CELL, L.gy + (cy + 0.5) * CELL];
    };

    // items in grid
    let hoverItem = null;
    for (const it of bag.items) {
      if (this.drag && this.drag.item === it) continue;
      const cells = bag.cellsAt(it, it.x, it.y);
      const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
      const px = L.gx + minX * CELL, py = L.gy + minY * CELL;
      const r = RARITY[matOf(it).rarity];
      for (const [cx, cy] of cells) { ui.rect(L.gx + cx * CELL + 1, L.gy + cy * CELL + 1, CELL - 2, CELL - 2, r.color, 0.12); }
      ui.img(itemSprite(it.id, CELL, it.rot), px, py);
      if (bonus[it.uid]) {
        const [cx, cy] = center(it);
        ui.icon('sparkle', cx + 4, cy - 10, { alpha: 0.6 + Math.sin(this.t * 6) * 0.3 });
      }
      for (const [cx, cy] of cells) {
        const h = ui.hit('bagcell' + it.uid + '_' + cx + '_' + cy, L.gx + cx * CELL, L.gy + cy * CELL, CELL, CELL, { cursor: 'hand', sound: false });
        if (h.hover) hoverItem = it;
        if (h.pressed && !this.drag) this.pick(it, 'bag');
        if (h.rclicked && !this.drag) this.contextAction(it);
      }
    }
    // synergy links
    const ctx = ui.ctx;
    for (const { a, b } of links) {
      const [x1, y1] = center(a), [x2, y2] = center(b);
      const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3);
      for (let i = 0; i <= n; i++) {
        if ((i + Math.floor(this.t * 8)) % 3) continue;
        ctx.fillStyle = '#ffe08a';
        ctx.fillRect(Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n), 1, 1);
      }
    }
    // tray items
    const tp = this.trayPositions(L, bag.overflow.filter((it) => !(this.drag && this.drag.item === it)));
    for (const [it, r] of tp) {
      ui.img(itemSprite(it.id, CELL, it.rot), r.x, r.y);
      const h = ui.hit('tray' + it.uid, r.x, r.y, r.w, r.h, { cursor: 'hand', sound: false });
      if (h.hover) hoverItem = it;
      if (h.pressed && !this.drag) this.pick(it, 'tray');
      if (h.rclicked && !this.drag) this.contextAction(it);
    }

    // dragging
    if (this.drag) {
      const d = this.drag;
      if (inp.actionPressed('rotate') || inp.rpressed || inp.wheel) { d.item.rot = (d.item.rot + (inp.wheel < 0 ? 3 : 1)) % 4; game.audio && game.audio.play('rotate'); }
      const cells = cellsOf(d.item);
      const w = (Math.max(...cells.map((c) => c[0])) + 1) * CELL, h = (Math.max(...cells.map((c) => c[1])) + 1) * CELL;
      const ox = Math.round(inp.x - w / 2), oy = Math.round(inp.y - h / 2);
      const gxCell = Math.round((ox - L.gx) / CELL), gyCell = Math.round((oy - L.gy) / CELL);
      const overGrid = inp.x >= L.gx - CELL && inp.x < L.gx + (bag.w + 1) * CELL && inp.y >= L.gy - CELL && inp.y < L.gy + (bag.h + 1) * CELL;
      if (overGrid) {
        const ok = bag.canPlace(d.item, gxCell, gyCell, d.item.rot);
        for (const [cx, cy] of cells) {
          const X = gxCell + cx, Y = gyCell + cy;
          if (X < 0 || Y < 0 || X >= bag.w || Y >= bag.h) continue;
          ui.rect(L.gx + X * CELL + 1, L.gy + Y * CELL + 1, CELL - 2, CELL - 2, ok ? '#7dff8a' : '#ff5d5d', 0.28);
        }
      }
      ui.img(itemSprite(d.item.id, CELL, d.item.rot), ox, oy - 2, { alpha: 0.92 });
      ui.dragging = true;
      if (inp.released) {
        const overTrash = inp.x >= trash.x && inp.x < trash.x + trash.w && inp.y >= trash.y && inp.y < trash.y + trash.h;
        if (overGrid && bag.canPlace(d.item, gxCell, gyCell, d.item.rot)) {
          if (d.from === 'tray') bag.overflow.splice(bag.overflow.indexOf(d.item), 1);
          bag.place(d.item, gxCell, gyCell, d.item.rot);
          game.audio && game.audio.play('card_place');
        } else if (overTrash) {
          bag.remove(d.item);
          game.audio && game.audio.play('drop');
          ui.burst(inp.x, inp.y, 10, { colors: ['#8a7a6a', '#c9c1b3'], speed: 50 });
        } else if (inp.x > L.trayX && inp.y > L.trayY && inp.x < L.trayX + L.trayW && inp.y < L.trayY + L.trayH) {
          if (d.from === 'bag') bag.toOverflow(d.item);
          game.audio && game.audio.play('drop');
        } else {
          // snap back
          d.item.rot = d.rot0;
          if (d.from === 'bag') bag.place(d.item, d.x0, d.y0, d.rot0) || bag.toOverflow(d.item);
        }
        this.drag = null;
        ui.dragging = false;
      }
    } else ui.dragging = false;

    if (hoverItem && !this.drag) {
      const tt = itemTooltip(hoverItem);
      const b = bonus[hoverItem.uid];
      if (b) tt.body += `\n{gold}Bag bonus:{/} ${b.q ? '+1 quality ' : ''}${b.chips ? `{chips}+${b.chips} chips{/} ` : ''}${b.mult ? `{mult}+${b.mult} mult{/}` : ''} {dim}(${b.from.join(', ')}){/}`;
      if (hoverItem.id === 'recipe_scroll') tt.body += '\n{gold}Right-click to read.{/}';
      ui.tooltip(tt);
    }

    // footer
    const fy = L.trayY + L.trayH + 8;
    ui.text('{dim}Drag to arrange · {/}{gold}R{/}{dim} / right-click rotates{/}', L.trayX, fy + 32, { font: 'body' });
    if (ui.button('bag-done', L.trayX, fy, 90, 22, 'Done', { style: 'gold', icon: 'check' }) || (this.time > 0 && !this.confirm && (inp.actionPressed('bag') || inp.actionPressed('back')))) this.close();

    if (this.confirm) {
      ui.block(5);
      dim(ui, 0.5);
      const w = 220, h = 70, x = ui.w / 2 - w / 2, y = ui.h / 2 - h / 2;
      ui.panel('parchment', x, y, w, h);
      ui.text(`Leave ${bag.overflow.length} item${bag.overflow.length > 1 ? 's' : ''} behind?`, ui.w / 2, y + 12, { align: 'center', color: '#3a2618' });
      if (ui.button('bag-leave', x + 16, y + 38, 90, 20, 'Leave them', { style: 'red' })) { this.confirm = false; this.close(true); }
      if (ui.button('bag-back', x + w - 106, y + 38, 90, 20, 'Go back', { style: 'wood' })) this.confirm = false;
      ui.unblock();
      ui.block(2);
    }
  }

  pick(it, from) {
    this.drag = { item: it, from, x0: it.x, y0: it.y, rot0: it.rot };
    if (from === 'bag') this.game.run.bag.remove(it);
    this.game.audio && this.game.audio.play('card_pick');
  }

  contextAction(it) {
    const run = this.game.run;
    if (it.id === 'recipe_scroll' && it.recipe) {
      run.removeItem(it);
      const fresh = run.learnRecipe(it.recipe);
      this.game.audio && this.game.audio.play('recipe_discover');
      this.game.ui.toast(`${fresh ? 'New recipe' : 'Recipe'}: ${RECIPES[it.recipe].name}`, { icon: 'recipe', color: COLORS.gold });
    }
  }
}
