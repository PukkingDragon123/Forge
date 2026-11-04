// Crafting overlay: the camera's room fades behind a close-up of the workbench. Ingredients go into
// the mould IN ORDER (click them on the cloth, or drag them to a slot; click a slot to take one
// back); the open recipe book on the right shows the order for recipes you know (tap one you can
// make to lay it out) and "?" for the ones you don't. A live hint tells you what the current order
// would do ("2 in place, 1 misplaced"). CRAFT hammers, fires or stirs it (by station) and the result
// is revealed. Tabs switch between the workbench, the forge and the cauldron.
// Params: { station: 'workbench'|'forge'|'cauldron', onClose }.
import { Scene } from '../core/game.js';
import * as Crafting from '../systems/crafting.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import { materialSprite } from '../art/sprites.js';
import { benchCanvas, moldCanvas, bookCanvas, BOOK, BENCH_H } from '../art/forge_art.js';
import { tag } from '../ui/frames.js';
import { clamp, ease } from '../core/math.js';
import { shortTip } from './bag.js';

const INK = '#3a2214', DARK = '#140c10';
const SLOTS = 5, S = 44, G = 8;
const STATIONS = [
  { id: 'workbench', name: 'Workbench', icon: 'tool', fx: ['#c8a070', '#8a6a4a', '#f0d8a8'], sound: 'anvil_ring' },
  { id: 'forge', name: 'Forge', icon: 'forge', fx: ['#ffd27a', '#ff8a3a', '#ffffff'], sound: 'anvil_ring' },
  { id: 'cauldron', name: 'Cauldron', icon: 'poison', fx: ['#9affb0', '#5af0c8', '#e8fff0'], sound: 'stew_bubble' },
];

export class CraftOverlay extends Scene {
  get freezesBelow() { return true; }
  enter(params = {}) {
    this.params = params;
    this.station = STATIONS.find((s) => s.id === params.station) || STATIONS[0];
    this.slots = Array(SLOTS).fill(null);
    this.t = 0; this.open = 0;
    this.page = 0;
    this.anim = null;
    this.shakeT = 0;
    this.drag = null;
    this.game.audio && this.game.audio.play('bag_open');
  }
  exit() { this.game.audio && this.game.audio.play('bag_close'); }
  close() {
    this.game.popOverlay(this);
    this.params.onClose && this.params.onClose();
  }
  ordered() { return this.slots.filter(Boolean); }
  /** Bag items not already in the mould. */
  pantry() {
    const run = this.game.run;
    const used = new Set(this.slots.filter(Boolean));
    return run.bag.all().filter((it) => !used.has(it) && MATERIALS[it.id]);
  }
  add(it, at = -1) {
    if (this.anim) return;
    const i = at >= 0 ? at : this.slots.indexOf(null);
    if (i < 0) { this.game.audio && this.game.audio.play('deny'); return; }
    const prev = this.slots.indexOf(it);
    if (prev >= 0) this.slots[prev] = null;
    this.slots[i] = it;
    this.compact();
    this.game.audio && this.game.audio.play('card_place');
  }
  remove(i) { if (this.anim) return; this.slots[i] = null; this.compact(); this.game.audio && this.game.audio.play('card_pick'); }
  compact() { const f = this.slots.filter(Boolean); this.slots = [...f, ...Array(SLOTS - f.length).fill(null)]; }
  /** Lay out a known recipe from the bag (best quality first). */
  layout(entry) {
    const run = this.game.run;
    const pool = run.bag.all().slice().sort((a, b) => (b.q ?? 2) - (a.q ?? 2));
    const picked = [];
    for (const id of entry.recipe.ings) {
      const it = pool.find((x) => x.id === id && !picked.includes(x));
      if (!it) { this.game.audio && this.game.audio.play('deny'); return; }
      picked.push(it);
    }
    this.slots = [...picked, ...Array(Math.max(0, SLOTS - picked.length)).fill(null)].slice(0, SLOTS);
    if (entry.recipe.station !== this.station.id) this.station = STATIONS.find((s) => s.id === entry.recipe.station) || this.station;
    this.game.audio && this.game.audio.play('card_place');
  }
  doCraft() {
    const run = this.game.run;
    const ord = this.ordered();
    let res = null;
    try { res = Crafting.craft(run, ord, this.station.id); } catch (e) { res = null; }
    if (!res || !res.ok) {
      this.shakeT = 0.4;
      this.result = { text: (res && res.hint) || 'Nothing happens.', t: 0, bad: true };
      this.game.audio && this.game.audio.play('deny');
      return;
    }
    this.slots = Array(SLOTS).fill(null);
    this.anim = { t: 0, res };
    this.game.audio && this.game.audio.play(this.station.sound || 'anvil_ring');
  }
  update(dt) {
    this.t += dt; this.open = Math.min(1, this.open + dt * 3);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.result) { this.result.t += dt; if (this.result.t > 3) this.result = null; }
    const A = this.anim;
    if (A) {
      const before = A.t;
      A.t += dt;
      for (const k of [0.25, 0.55, 0.85]) if (before < k && A.t >= k) {
        this.game.audio && this.game.audio.play(this.station.id === 'cauldron' ? 'stew_bubble' : 'anvil_ring', { pitch: 0.9 + k * 0.3, vol: 0.6 });
        this.game.ui.burst(480, 400, 22, { colors: this.station.fx, speed: 120, gravity: 220, up: 60, kind: 'star', life: 0.8 });
      }
      if (A.t > 1.15) {
        this.anim = null;
        const out = A.res.out;
        const m = MATERIALS[out.id];
        this.result = { text: `${A.res.newRecipe ? 'New! ' : ''}${(m && m.name) || out.id}${A.res.placed ? '' : ' (bag full: set aside)'}`, t: 0 };
        if (this.game.scenes.reveal) this.game.pushOverlay('reveal', { item: out });
      }
    }
  }

  draw(ui) {
    const game = this.game, run = game.run, ctx = ui.ctx, inp = game.input;
    const k = ease.outCubic(clamp(this.open));
    ctx.globalAlpha = 0.8 * k; ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, ui.w, ui.h); ctx.globalAlpha = 1;
    // ---- the bench
    const benchY = Math.round(ui.h - BENCH_H + (1 - k) * 60);
    ui.img(benchCanvas(), 0, benchY);
    // ---- station tabs
    let tx = 24;
    for (const s of STATIONS) {
      const on = s === this.station;
      const w = ui.measure(s.name) + 34;
      const c = tag(w, 30, { seed: s.id.length, tone: on ? 'gold' : undefined, string: 8 });
      const y = 18 + (on ? 0 : 4);
      ui.img(c, tx, y, { alpha: on ? 1 : 0.75 });
      ui.icon(s.icon, tx + 10, y + c.inner.y + 2);
      ui.text(s.name, tx + 24, y + c.inner.y + Math.round((c.inner.h - 7) / 2), { color: on ? '#6a2a10' : INK });
      if (ui.hit('st-' + s.id, tx, y, w, 30).clicked && !this.anim) { this.station = s; game.audio && game.audio.play('click'); }
      tx += w + 8;
    }
    // ---- the mould (ordered slots) on the bench
    const mold = moldCanvas(SLOTS);
    const shake = this.shakeT > 0 ? Math.round(Math.sin(this.t * 60) * 4 * this.shakeT / 0.4) : 0;
    const mx = Math.round(ui.w / 2 - mold.width / 2) + shake, my = benchY + 20;
    ui.img(mold, mx, my);
    const sx0 = mx + 12, sy0 = my + 9;
    const slotAt = (i) => ({ x: sx0 + i * (S + G), y: sy0 });
    for (let i = 0; i < SLOTS; i++) {
      const p = slotAt(i);
      ui.text(String(i + 1), p.x + 3, p.y + 2, { font: 'small', color: '#8a6a4a' });
      const it = this.slots[i];
      const h = ui.hit('slot' + i, p.x, p.y, S, S, { sound: false });
      if (it) {
        const bob = this.anim ? Math.round(Math.sin(this.anim.t * 30 + i) * 2) : 0;
        ui.img(materialSprite(it.id, 32), p.x + 6, p.y + 6 + bob);
        if (h.hover) ui.tooltip(shortTip(it));
        if (h.clicked) this.remove(i);
      }
      if (i < SLOTS - 1) ui.text('›', p.x + S + 1, p.y + S / 2 - 4, { color: '#c8a070', outline: DARK });
      if (this.drag && inp.released && h.hover) { this.add(this.drag.item, Math.min(i, this.ordered().length)); this.drag = null; }
    }
    // ---- preview + craft plaque
    const ord = this.ordered();
    let prev = null;
    try { prev = ord.length ? Crafting.craftPreview(run, ord, this.station.id) : null; } catch (e) { prev = null; }
    const px = mx + mold.width + 18, py = my + 6;
    const can = !!(prev && prev.ok) && !this.anim;
    if (ui.button('craft-go', px, py, 96, 30, 'CRAFT', { style: can ? 'gold' : 'iron', disabled: ord.length < 2 || !!this.anim, key: ui.touch ? undefined : 'ENTER' }) || (inp.actionPressed('confirm') && ord.length >= 2 && !this.anim)) this.doCraft();
    let hint = prev ? prev.hint : 'Put ingredients in order.';
    if (prev && prev.ok && prev.out && MATERIALS[prev.out]) hint = prev.newRecipe ? 'Something new…' : `Makes ${MATERIALS[prev.out].name}`;
    ui.text(hint, ui.w / 2, my - 16, { align: 'center', color: prev && prev.ok ? '#9affb0' : prev && prev.partial && prev.partial.correct ? '#ffe08a' : '#e8d8c0', outline: DARK });
    if (this.result) {
      const a = this.result.t < 2.4 ? 1 : 1 - (this.result.t - 2.4) / 0.6;
      ctx.globalAlpha = clamp(a);
      ui.big(this.result.text, ui.w / 2, my - 40, { scale: 2, top: this.result.bad ? '#ffb8a8' : '#fff4c8', bottom: this.result.bad ? '#a83a2a' : '#c8902a' });
      ctx.globalAlpha = 1;
    }
    // crafting animation: the station's tool over the mould
    if (this.anim) {
      const t = this.anim.t;
      const ic = this.station.id === 'cauldron' ? 'poison' : 'hammer';
      const hit = Math.abs(Math.sin(t * Math.PI * 3.4));
      ui.icon(ic, ui.w / 2 - 12, my - 40 - Math.round(hit * 26), { scale: 2 });
      ctx.globalAlpha = 0.25 + hit * 0.25; ctx.fillStyle = this.station.fx[0]; ctx.fillRect(mx, my, mold.width, mold.height); ctx.globalAlpha = 1;
    }

    // ---- the cloth of ingredients (your bag)
    const items = this.pantry();
    const cw = 40, cols = 13;
    const ox = 24, oy = 92;
    ctx.fillStyle = 'rgba(30,20,16,0.82)'; ctx.fillRect(ox - 8, oy - 22, cols * cw + 16, Math.max(2, Math.ceil(items.length / cols)) * cw + 30);
    ui.text(items.length ? 'Your bag — click in order' : 'Your bag is empty', ox, oy - 16, { color: '#f0dcb0', outline: DARK });
    items.forEach((it, i) => {
      const x = ox + (i % cols) * cw, y = oy + Math.floor(i / cols) * cw;
      const m = MATERIALS[it.id];
      const used = Crafting.usedIn ? Crafting.usedIn(it.id).length > 0 : true;
      const h = ui.hit('pan' + it.uid, x, y, cw - 4, cw - 4, { sound: false });
      ctx.fillStyle = h.hover ? '#5a4030' : '#2e2018'; ctx.fillRect(x, y, cw - 4, cw - 4);
      const r = RARITY[m && m.rarity] || RARITY.common;
      ctx.fillStyle = r.color; ctx.globalAlpha = 0.5; ctx.fillRect(x, y + cw - 6, cw - 4, 2); ctx.globalAlpha = 1;
      ui.img(materialSprite(it.id, 32), x + 2, y + 2 - (h.hover ? 1 : 0), { alpha: used ? 1 : 0.45 });
      if (h.hover) ui.tooltip(shortTip(it));
      if (h.clicked) this.add(it);
      if (h.pressed && !this.drag) this.drag = { item: it, x0: inp.x, y0: inp.y };
    });
    if (this.drag) {
      if (inp.down) ui.img(materialSprite(this.drag.item.id, 32), inp.x - 16, inp.y - 16 - (ui.touch ? 24 : 0), { alpha: 0.85 });
      else this.drag = null;
    }

    // ---- recipe book (right)
    const B = bookCanvas();
    const bx = ui.w - B.width - 18, by = 52;
    ui.img(B, bx, by);
    let book = [];
    try { book = Crafting.recipeBook ? Crafting.recipeBook(run, this.station.id) : []; } catch (e) { book = []; }
    const per = 6;
    const pages = Math.max(1, Math.ceil(book.length / per));
    this.page = Math.min(this.page, pages - 1);
    ui.text(`${this.station.name} recipes`, bx + BOOK.w / 2, by + 14, { align: 'center', color: INK });
    book.slice(this.page * per, this.page * per + per).forEach((e, i) => {
      const x = bx + 26, y = by + 32 + i * 27;
      const h = ui.hit('rec' + e.id, x - 4, y - 3, BOOK.w - 44, 25, { sound: false });
      if (h.hover && e.known) { ctx.fillStyle = 'rgba(200,150,80,0.18)'; ctx.fillRect(x - 4, y - 3, BOOK.w - 44, 25); }
      // result
      const out = e.out;
      if (e.known && out) {
        ui.img(materialSprite(e.recipe.out, 32), x - 2, y - 6, { scale: 0.7 });
        ui.text(out.name, x + 22, y, { color: e.have ? INK : '#8a6a4a', maxW: 110 });
        // ingredients in order
        e.recipe.ings.forEach((id, j) => {
          const ix = x + 140 + j * 30;
          ui.img(materialSprite(id, 32), ix, y - 6, { scale: 0.7, alpha: e.missing.includes(id) ? 0.4 : 1 });
          if (j < e.recipe.ings.length - 1) ui.text('›', ix + 23, y + 2, { font: 'small', color: '#8a6a4a' });
        });
        if (h.hover) ui.tooltip({ title: out.name, body: (out.short || (out.desc ? String(out.desc).split('. ')[0] : '')) + (e.have ? '\n{good}Click to lay it out{/}' : `\n{bad}Missing ${e.missing.length}{/}`) });
        if (h.clicked && e.have) this.layout(e);
      } else {
        ui.text('? ? ?', x + 22, y, { color: '#a08a6a' });
        for (let j = 0; j < e.recipe.ings.length; j++) ui.text('?', x + 146 + j * 30, y, { color: '#b8a080' });
        if (h.hover) ui.tooltip({ title: 'Unknown recipe', body: `${e.recipe.ings.length} ingredients. Find a Recipe Page — or guess.` });
      }
    });
    if (pages > 1) {
      if (ui.button('rec-prev', bx + 20, by + B.height - 24, 22, 16, '<', { style: 'wood', disabled: this.page === 0 })) this.page--;
      ui.text(`${this.page + 1}/${pages}`, bx + BOOK.w / 2, by + B.height - 20, { align: 'center', font: 'small', color: INK });
      if (ui.button('rec-next', bx + BOOK.w - 42, by + B.height - 24, 22, 16, '>', { style: 'wood', disabled: this.page >= pages - 1 })) this.page++;
    }
    // ---- done
    if (ui.button('craft-done', ui.w - 112, 14, 96, 26, 'Done', { style: 'wood', key: ui.touch ? undefined : 'ESC' }) || (this.time > 0.1 && !this.anim && inp.actionPressed('back'))) this.close();
  }
}
