// Backpack overlay: your open leather backpack lies on the cave floor in the lantern light. Its
// 5×5 stitched pockets hold the items; new loot waits on a burlap cloth beside it; junk goes down
// the crack in the floor. Drag to arrange, R / right-click / wheel rotates.
import { Scene } from '../core/game.js';
import { itemSprite } from '../art/sprites.js';
import { matOf, itemTooltip, cellsOf } from '../systems/items.js';
import { RARITY } from '../data/materials.js';
import { RECIPES } from '../data/blueprints.js';
import { COLORS } from '../ui/font.js';
import { engrave } from './forgeui.js';
import { tag, scrap } from '../ui/frames.js';
import { glowCanvas, lanternCanvas } from '../art/handpaint.js';
import { backpackCanvas, clothCanvas, pitCanvas, floorCanvas, plaqueCanvas } from '../art/forge_art.js';
import { ease, clamp } from '../core/math.js';

const CELL = 32;
const INK = '#3a2214';

export class BagOverlay extends Scene {
  get freezesBelow() { return true; }
  enter(params = {}) {
    this.params = params;
    this.title = params.title || 'Backpack';
    this.drag = null;
    this.confirm = false;
    this.game.audio && this.game.audio.play('bag_open');
    this.t = 0;
    this.open = 0;
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
    const bag = this.game.run.bag;
    const pack = backpackCanvas(bag.w, bag.h, CELL);
    const k = ease.outBack(clamp(this.open, 0, 1));
    const bagX = Math.round(72 - (1 - k) * 60), bagY = Math.round(ui.h / 2 - pack.height / 2 + 10 + (1 - k) * 40);
    return {
      pack, bagX, bagY, gx: bagX + pack.grid.x, gy: bagY + pack.grid.y,
      cloth: { x: 452, y: 150, w: 330, h: 250 },
      pit: { x: 800, y: 426, w: 92, h: 44 },
      done: { x: 790, y: 52, w: 120, h: 40 },
    };
  }

  update(dt) { this.t += dt; this.open = Math.min(1, this.open + dt * 2.6); }

  trayPositions(L, items) {
    // items lie on the cloth, packed in loose rows
    let x = L.cloth.x + 26, y = L.cloth.y + 26, rowH = 0;
    const out = new Map();
    for (const it of items) {
      const cells = cellsOf(it);
      const w = (Math.max(...cells.map((c) => c[0])) + 1) * CELL, h = (Math.max(...cells.map((c) => c[1])) + 1) * CELL;
      if (x + w > L.cloth.x + L.cloth.w - 20) { x = L.cloth.x + 26; y += rowH + 6; rowH = 0; }
      out.set(it, { x, y, w, h });
      x += w + 8; rowH = Math.max(rowH, h);
    }
    return out;
  }

  drawTag(ui, x, y, text, opts = {}) {
    const w = Math.max(60, ui.measure(text) + 22);
    const c = tag(w, 30, { seed: opts.seed || 1, tone: opts.tone, string: opts.string ?? 12 });
    ui.img(c, Math.round(x - w / 2), y);
    ui.text(text, Math.round(x), y + c.inner.y + Math.round((c.inner.h - 7) / 2), { align: 'center', color: opts.color || INK });
    return { x: Math.round(x - w / 2), y, w, h: c.height };
  }

  draw(ui) {
    const game = this.game, run = game.run, bag = run.bag, inp = game.input;
    const ctx = ui.ctx;
    const L = this.layout(ui);
    // the floor, the lantern, the cloth and the crack
    ctx.globalAlpha = Math.min(1, this.open * 2);
    ui.img(floorCanvas(ui.w, ui.h), 0, 0);
    ctx.globalAlpha = 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 + Math.sin(this.t * 7.3) * 0.03;
    ctx.drawImage(glowCanvas(120), 418 - 120, 96 - 80);
    ctx.restore();
    ui.img(clothCanvas(L.cloth.w, L.cloth.h), L.cloth.x, L.cloth.y);
    const dragging = !!this.drag;
    const overPit = dragging && inp.x >= L.pit.x && inp.x < L.pit.x + L.pit.w && inp.y >= L.pit.y && inp.y < L.pit.y + L.pit.h;
    ui.img(pitCanvas(overPit), L.pit.x, L.pit.y);
    ui.text('toss', L.pit.x + L.pit.w / 2, L.pit.y + L.pit.h + 4, { align: 'center', font: 'small', color: '#cbb89a', outline: '#140c10' });
    ui.img(lanternCanvas(Math.floor(this.t * 9) % 4), 418 - 20, 70, { scale: 2 });

    // the backpack and its stitched pockets
    ui.img(L.pack, L.bagX, L.bagY);
    this.drawTag(ui, L.bagX + L.pack.width / 2 + 70, L.bagY - 18, this.title, { seed: 2, color: '#6a2a10' });

    const bonus = bag.bonuses();
    const links = bag.links();
    const center = (it) => {
      const cells = bag.cellsAt(it, it.x, it.y);
      const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length, cy = cells.reduce((a, c) => a + c[1], 0) / cells.length;
      return [L.gx + (cx + 0.5) * CELL, L.gy + (cy + 0.5) * CELL];
    };

    let hoverItem = null;
    for (const it of bag.items) {
      if (this.drag && this.drag.item === it) continue;
      const cells = bag.cellsAt(it, it.x, it.y);
      const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
      const px = L.gx + minX * CELL, py = L.gy + minY * CELL;
      const r = RARITY[matOf(it).rarity];
      if (r.order >= 2) for (const [cx, cy] of cells) ui.rect(L.gx + cx * CELL + 3, L.gy + cy * CELL + 3, CELL - 6, CELL - 6, r.color, 0.1);
      // soft shadow so the item sits inside the pocket
      ctx.globalAlpha = 0.35;
      ui.img(itemSprite(it.id, CELL, it.rot), px + 2, py + 3);
      ctx.globalAlpha = 1;
      ui.img(itemSprite(it.id, CELL, it.rot), px, py);
      if (bonus[it.uid]) {
        const [cx, cy] = center(it);
        ui.icon('sparkle', cx + 6, cy - 14, { alpha: 0.6 + Math.sin(this.t * 6) * 0.3 });
      }
      for (const [cx, cy] of cells) {
        const h = ui.hit('bagcell' + it.uid + '_' + cx + '_' + cy, L.gx + cx * CELL, L.gy + cy * CELL, CELL, CELL, { cursor: 'hand', sound: false });
        if (h.hover) hoverItem = it;
        if (h.pressed && !this.drag) this.pick(it, 'bag');
        if (h.rclicked && !this.drag) this.contextAction(it);
      }
    }
    // synergy links: gold thread stitched between neighbours that help each other
    for (const { a, b } of links) {
      const [x1, y1] = center(a), [x2, y2] = center(b);
      const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3);
      for (let i = 0; i <= n; i++) {
        if ((i + Math.floor(this.t * 8)) % 3) continue;
        ctx.fillStyle = i % 2 ? '#ffe08a' : '#c8902a';
        ctx.fillRect(Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n + Math.sin(i * 0.8) * 1.5), 1, 1);
      }
    }
    // loot lying on the cloth
    const tp = this.trayPositions(L, bag.overflow.filter((it) => !(this.drag && this.drag.item === it)));
    for (const [it, r] of tp) {
      const bob = Math.round(Math.sin(this.t * 2 + r.x * 0.1) * 1);
      ctx.globalAlpha = 0.35; ui.img(itemSprite(it.id, CELL, it.rot), r.x + 2, r.y + 4); ctx.globalAlpha = 1;
      ui.img(itemSprite(it.id, CELL, it.rot), r.x, r.y + bob);
      const h = ui.hit('tray' + it.uid, r.x, r.y, r.w, r.h, { cursor: 'hand', sound: false });
      if (h.hover) hoverItem = it;
      if (h.pressed && !this.drag) this.pick(it, 'tray');
      if (h.rclicked && !this.drag) this.contextAction(it);
    }
    this.drawTag(ui, L.cloth.x + L.cloth.w / 2, L.cloth.y - 40, bag.overflow.length ? `New loot (${bag.overflow.length})` : 'Set things aside here', { seed: 3, color: bag.overflow.length ? '#6a2a10' : INK });

    // dragging
    if (this.drag) {
      const d = this.drag;
      if (inp.actionPressed('rotate') || (inp.rpressed && !inp.longPress) || inp.wheel) { d.item.rot = (d.item.rot + (inp.wheel < 0 ? 3 : 1)) % 4; game.audio && game.audio.play('rotate'); }
      // touch: a second finger turns or reads what the first one holds
      ui.touchButton('rotate', ui.w - 52, ui.h - 132, 30, { icon: 'tool', label: 'ROTATE', style: 'brass' });
      if (d.item.id === 'recipe_scroll' && d.item.recipe) ui.touchButton('read', ui.w - 52, ui.h - 204, 26, { icon: 'scroll', label: 'READ', style: 'jade' });
      if (inp.actionPressed('read') && d.item.id === 'recipe_scroll') {
        d.item.rot = d.rot0;
        if (d.from === 'bag') bag.place(d.item, d.x0, d.y0, d.rot0) || bag.toOverflow(d.item);
        this.drag = null; ui.dragging = false;
        this.contextAction(d.item);
        return;
      }
      if (inp.longPress && inp.dragDist < 9) ui.tooltip(itemTooltip(d.item));
      const iy = inp.y - (ui.touch ? 26 : 0); // keep the item visible above the finger
      const cells = cellsOf(d.item);
      const w = (Math.max(...cells.map((c) => c[0])) + 1) * CELL, h = (Math.max(...cells.map((c) => c[1])) + 1) * CELL;
      const ox = Math.round(inp.x - w / 2), oy = Math.round(iy - h / 2);
      const gxCell = Math.round((ox - L.gx) / CELL), gyCell = Math.round((oy - L.gy) / CELL);
      const overGrid = inp.x >= L.gx - CELL && inp.x < L.gx + (bag.w + 1) * CELL && iy >= L.gy - CELL && iy < L.gy + (bag.h + 1) * CELL;
      if (overGrid) {
        const ok = bag.canPlace(d.item, gxCell, gyCell, d.item.rot);
        for (const [cx, cy] of cells) {
          const X = gxCell + cx, Y = gyCell + cy;
          if (X < 0 || Y < 0 || X >= bag.w || Y >= bag.h) continue;
          ui.rect(L.gx + X * CELL + 2, L.gy + Y * CELL + 2, CELL - 4, CELL - 4, ok ? '#9affb0' : '#ff6a5a', 0.25);
        }
      }
      ctx.globalAlpha = 0.4; ui.img(itemSprite(d.item.id, CELL, d.item.rot), ox + 6, oy + 10); ctx.globalAlpha = 1;
      ui.img(itemSprite(d.item.id, CELL, d.item.rot), ox, oy - 4, { alpha: 0.95 });
      ui.dragging = true;
      if (inp.released) {
        const c = L.cloth;
        if (overGrid && bag.canPlace(d.item, gxCell, gyCell, d.item.rot)) {
          if (d.from === 'tray') bag.overflow.splice(bag.overflow.indexOf(d.item), 1);
          bag.place(d.item, gxCell, gyCell, d.item.rot);
          game.audio && game.audio.play('card_place');
        } else if (overPit) {
          bag.remove(d.item);
          game.audio && game.audio.play('drop');
          ui.burst(inp.x, inp.y, 12, { colors: ['#8a7a6a', '#c9c1b3', '#5a4a3a'], speed: 40, gravity: 160 });
        } else if (inp.x > c.x && inp.y > c.y && inp.x < c.x + c.w && inp.y < c.y + c.h) {
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
      if (hoverItem.id === 'recipe_scroll') tt.body += ui.touch ? '\n{gold}Lift it, then tap READ.{/}' : '\n{gold}Right-click to read.{/}';
      ui.tooltip(tt);
    }

    // hints on a tag; the brass "done" plaque
    this.drawTag(ui, L.cloth.x + L.cloth.w / 2, L.cloth.y + L.cloth.h + 10, ui.touch ? 'drag to arrange · ROTATE turns what you hold' : 'drag to arrange · R or right-click rotates', { seed: 5, string: 6 });
    const D = L.done;
    const dh = ui.hit('bag-done', D.x, D.y, D.w + 20, D.h + 20);
    const pc = plaqueCanvas(D.w, D.h, dh.down ? 'down' : dh.hover ? 'hover' : 'idle');
    ui.img(pc, D.x, D.y);
    engrave(ui, 'Done', D.x + pc.inner.x + pc.inner.w / 2, D.y + pc.inner.y + pc.inner.h / 2);
    if (dh.clicked) game.audio && game.audio.play('click');
    if (dh.clicked || (this.time > 0 && !this.confirm && (inp.actionPressed('bag') || inp.actionPressed('back')))) this.close();

    if (this.confirm) {
      ui.block(5);
      ui.rect(0, 0, ui.w, ui.h, '#07060b', 0.5);
      const s = scrap(260, 92, { seed: 7 });
      const x = Math.round(ui.w / 2 - 130), y = Math.round(ui.h / 2 - 46);
      ui.img(s, x, y);
      ui.text(`Leave ${bag.overflow.length} item${bag.overflow.length > 1 ? 's' : ''} behind on the cloth?`, ui.w / 2, y + s.inner.y + 4, { align: 'center', color: INK, maxW: 230 });
      const a = this.drawTag(ui, ui.w / 2 - 62, y + 42, 'Leave them', { seed: 8, color: '#8a2a14', string: 6 });
      const b = this.drawTag(ui, ui.w / 2 + 62, y + 42, 'Go back', { seed: 9, string: 6 });
      if (ui.hit('bag-leave', a.x, a.y, a.w, a.h).clicked) { this.confirm = false; this.close(true); }
      if (ui.hit('bag-back', b.x, b.y, b.w, b.h).clicked) this.confirm = false;
      ui.unblock();
      ui.block(2);
    }
    void COLORS;
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
