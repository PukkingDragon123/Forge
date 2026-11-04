// Backpack (v5): your build. The room dims behind a leather pack laid open on the floor: the weapon
// in your HAND and two SKILL gems sit on the left with your live stats and set bonuses; the 6×5 bag
// fills the middle (amulets, charms and spare weapons in it buff you; charms link to the neighbours
// they boost with a gold thread); loot that didn't fit lies on the cloth at the right; drop junk in
// the crack. Drag to arrange; R / right-click / wheel rotates what you hold; right-click (or the
// touch READ/USE button) reads a recipe page, eats forage or drinks a potion. Pauses the fight.
// Params: { onClose, title, loot: [items to lay on the cloth] }.
import { Scene } from '../core/game.js';
import { itemArt, iconArt } from './dungeon/itemart.js';
import { matOf, cellsOf } from '../systems/items.js';
import { RARITY, MATERIALS, QUALITY } from '../data/materials.js';
import * as Loadout from '../systems/loadout.js';
import * as Crafting from '../systems/crafting.js';
import * as SkillData from '../data/skills.js';
import { COLORS } from '../ui/font.js';
import { tag, scrap } from '../ui/frames.js';
import { backpackCanvas, clothCanvas, pitCanvas } from '../art/forge_art.js';
import { ease, clamp } from '../core/math.js';

const CELL = 36;
const INK = '#3a2214';
const DARK = '#140c10';
const has = (o, k) => o && typeof o[k] === 'function';

/** Short tooltip: name (rarity colour), one line, the passive in numbers. */
export function shortTip(it) {
  if (!it) return null;
  const m = MATERIALS[it.id];
  if (!m) return { title: it.name || 'Item', body: '' };
  const r = RARITY[m.rarity] || RARITY.common;
  const q = QUALITY[it.q ?? 2];
  const line = m.short || (m.desc ? String(m.desc).split(/(?<=\.)\s/)[0] : '');
  const kind = { weapon: 'Weapon', amulet: 'Amulet', charm: 'Charm', skill: 'Skill gem', tool: 'Tool', ore: 'Ore', gem: 'Gem', crystal: 'Crystal', part: 'Part', forage: 'Forage', recipe: 'Recipe page', potion: 'Potion', mineral: 'Mineral' }[m.kind] || m.kind || '';
  let body = `{${m.rarity}}${kind}{/}${q && q.name !== 'Fine' ? ` · {dim}${q.name}{/}` : ''}`;
  if (line) body += `\n${line}`;
  if (m.wpn) body += `\n{chips}${m.wpn.dmg} dmg{/} · ${m.wpn.type}`;
  if (m.kind === 'skill' && m.skill && SkillData.SKILLS && SkillData.SKILLS[m.skill]) body += `\n{gold}${SkillData.SKILLS[m.skill].desc || ''}{/}`;
  return { title: m.name, body, color: r.color, w: 180 };
}

export class BagOverlay extends Scene {
  get freezesBelow() { return true; }
  enter(params = {}) {
    this.params = params;
    this.title = params.title || 'Backpack';
    this.drag = null;
    this.confirm = false;
    this.t = 0;
    this.open = 0;
    const run = this.game.run;
    if (run && params.loot) for (const it of params.loot) if (it && !run.bag.all().includes(it)) run.bag.toOverflow(it);
    if (run && !run.skills) run.skills = [null, null];
    this.game.audio && this.game.audio.play('bag_open');
  }
  exit() { this.game.audio && this.game.audio.play('bag_close'); }

  close(force = false) {
    const bag = this.game.run.bag;
    if (bag.overflow.length && !force) { this.confirm = true; return; }
    if (force) {
      // what you leave behind stays in the room
      const left = bag.overflow.splice(0);
      this.params.onLeave && this.params.onLeave(left);
    }
    this.game.popOverlay(this);
    this.params.onClose && this.params.onClose();
  }

  layout(ui) {
    const bag = this.game.run.bag;
    const pack = backpackCanvas(bag.w, bag.h, CELL);
    const k = ease.outBack(clamp(this.open, 0, 1));
    const bagX = Math.round(ui.w / 2 - pack.width / 2 + 10), bagY = Math.round(ui.h / 2 - pack.height / 2 + 8 + (1 - k) * 40);
    return {
      pack, bagX, bagY, gx: bagX + pack.grid.x, gy: bagY + pack.grid.y,
      hand: { x: 34, y: 66, s: 64 },
      skills: [{ x: 34, y: 158, s: 48 }, { x: 96, y: 158, s: 48 }],
      stats: { x: 28, y: 224 },
      cloth: { x: 714, y: 110, w: 226, h: 250 },
      pit: { x: 838, y: 404, w: 92, h: 44 },
      done: { x: 840, y: 46, w: 92, h: 30 },
    };
  }

  update(dt) { this.t += dt; this.open = Math.min(1, this.open + dt * 3); }

  trayPositions(L, items) {
    let x = L.cloth.x + 16, y = L.cloth.y + 18, rowH = 0;
    const out = new Map();
    for (const it of items) {
      const cells = cellsOf(it);
      const w = (Math.max(...cells.map((c) => c[0])) + 1) * CELL, h = (Math.max(...cells.map((c) => c[1])) + 1) * CELL;
      if (x + w > L.cloth.x + L.cloth.w - 10) { x = L.cloth.x + 16; y += rowH + 6; rowH = 0; }
      out.set(it, { x, y, w, h });
      x += w + 6; rowH = Math.max(rowH, h);
    }
    return out;
  }

  drawTag(ui, x, y, text, opts = {}) {
    const w = Math.max(56, ui.measure(text) + 22);
    const c = tag(w, 30, { seed: opts.seed || 1, tone: opts.tone, string: opts.string ?? 12 });
    ui.img(c, Math.round(x - w / 2), y);
    ui.text(text, Math.round(x), y + c.inner.y + Math.round((c.inner.h - 7) / 2), { align: 'center', color: opts.color || INK });
    return { x: Math.round(x - w / 2), y, w, h: c.height };
  }

  // ------------------------------------------------------------------ equipment helpers
  handItem() { return this.game.run.hand || null; }
  setHand(it) {
    const run = this.game.run;
    if (has(run, 'equipHand')) return run.equipHand(it);
    const old = run.hand || null; run.hand = it || null; return old;
  }
  setSkill(i, it) {
    const run = this.game.run;
    if (has(run, 'equipSkill')) return run.equipSkill(i, it);
    const old = run.skills[i] || null; run.skills[i] = it || null; return old;
  }
  /** Put an item back somewhere: the bag if it fits, otherwise the cloth. */
  stow(it) { if (!it) return; const bag = this.game.run.bag; if (!bag.add(it)) { /* add() put it on the cloth */ } }

  draw(ui) {
    const game = this.game, run = game.run, bag = run.bag, inp = game.input;
    const ctx = ui.ctx;
    const L = this.layout(ui);
    const lo = (() => { try { return Loadout.computeLoadout(run); } catch (e) { return { stats: {}, synergies: [], links: [] }; } })();
    // ---- the room dims behind the pack
    ctx.globalAlpha = Math.min(0.78, this.open * 1.6);
    ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, ui.w, ui.h);
    ctx.globalAlpha = 1;
    ui.img(clothCanvas(L.cloth.w, L.cloth.h), L.cloth.x, L.cloth.y);
    const dragging = !!this.drag;
    const overPit = dragging && inp.x >= L.pit.x && inp.x < L.pit.x + L.pit.w && inp.y >= L.pit.y && inp.y < L.pit.y + L.pit.h;
    ui.img(pitCanvas(overPit), L.pit.x, L.pit.y);
    ui.text('toss', L.pit.x + L.pit.w / 2, L.pit.y + L.pit.h + 4, { align: 'center', font: 'small', color: '#cbb89a', outline: DARK });

    // ---- the pack
    ui.img(L.pack, L.bagX, L.bagY);
    this.drawTag(ui, L.bagX + L.pack.width / 2, L.bagY - 22, this.title, { seed: 2, color: '#6a2a10' });
    const linkUids = new Set((lo.links || []).flatMap((l) => [l.a, l.b]));
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
      const m = matOf(it) || {};
      const r = RARITY[m.rarity] || RARITY.common;
      const passive = m.passive || m.adj || m.procs || m.bagPassive;
      if (r.order >= 2 || passive) for (const [cx, cy] of cells) ui.rect(L.gx + cx * CELL + 3, L.gy + cy * CELL + 3, CELL - 6, CELL - 6, passive ? '#ffd27a' : r.color, passive ? 0.12 + Math.sin(this.t * 3) * 0.04 : 0.1);
      ctx.globalAlpha = 0.35; ui.img(itemArt(it, CELL, it.rot), px + 2, py + 3); ctx.globalAlpha = 1;
      ui.img(itemArt(it, CELL, it.rot), px, py);
      if (linkUids.has(it.uid)) { const [cx, cy] = center(it); ui.icon('sparkle', cx + 6, cy - 14, { alpha: 0.6 + Math.sin(this.t * 6) * 0.3 }); }
      for (const [cx, cy] of cells) {
        const h = ui.hit('bagcell' + it.uid + '_' + cx + '_' + cy, L.gx + cx * CELL, L.gy + cy * CELL, CELL, CELL, { cursor: 'hand', sound: false });
        if (h.hover) hoverItem = it;
        if (h.pressed && !this.drag) this.pick(it, 'bag');
        if (h.rclicked && !this.drag) this.contextAction(it);
      }
    }
    // charm links: a gold thread stitched between a charm and the neighbour it boosts
    const byUid = new Map(bag.items.map((i) => [i.uid, i]));
    for (const { a, b } of lo.links || []) {
      const A = byUid.get(a), B = byUid.get(b);
      if (!A || !B || (this.drag && (this.drag.item === A || this.drag.item === B))) continue;
      const [x1, y1] = center(A), [x2, y2] = center(B);
      const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3);
      for (let i = 0; i <= n; i++) {
        if ((i + Math.floor(this.t * 8)) % 3) continue;
        ctx.fillStyle = i % 2 ? '#ffe08a' : '#c8902a';
        ctx.fillRect(Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n + Math.sin(i * 0.8) * 1.5), 1, 1);
      }
    }
    // ---- loot on the cloth
    const tp = this.trayPositions(L, bag.overflow.filter((it) => !(this.drag && this.drag.item === it)));
    for (const [it, r] of tp) {
      const bob = Math.round(Math.sin(this.t * 2 + r.x * 0.1) * 1);
      ctx.globalAlpha = 0.35; ui.img(itemArt(it, CELL, it.rot), r.x + 2, r.y + 4); ctx.globalAlpha = 1;
      ui.img(itemArt(it, CELL, it.rot), r.x, r.y + bob);
      const h = ui.hit('tray' + it.uid, r.x, r.y, r.w, r.h, { cursor: 'hand', sound: false });
      if (h.hover) hoverItem = it;
      if (h.pressed && !this.drag) this.pick(it, 'tray');
      if (h.rclicked && !this.drag) this.contextAction(it);
    }
    this.drawTag(ui, L.cloth.x + L.cloth.w / 2, L.cloth.y - 34, bag.overflow.length ? `Didn't fit (${bag.overflow.length})` : 'Set aside', { seed: 3, color: bag.overflow.length ? '#6a2a10' : INK });

    // ---- equipment + stats (left)
    const hov = this.drawEquipment(ui, L, lo);
    if (hov) hoverItem = hov;

    // ---- dragging
    if (this.drag) this.updateDrag(ui, L, overPit);
    else ui.dragging = false;

    if (hoverItem && !this.drag) {
      const tt = shortTip(hoverItem);
      const m = MATERIALS[hoverItem.id] || {};
      if (m.kind === 'recipe') tt.body += ui.touch ? '\n{gold}Lift it, then tap READ.{/}' : '\n{gold}Right-click to read.{/}';
      else if ((m.cook && m.cook.heal) || m.kind === 'potion') tt.body += ui.touch ? '\n{gold}Lift it, then tap USE.{/}' : '\n{gold}Right-click to use.{/}';
      ui.tooltip(tt);
    }

    // ---- hints + done
    this.drawTag(ui, L.bagX + L.pack.width / 2, L.bagY + L.pack.height + 8, ui.touch ? 'drag to arrange · ROTATE turns what you hold' : 'drag · R rotates · right-click uses', { seed: 5, string: 6 });
    const D = L.done;
    if (ui.button('bag-done', D.x, D.y, D.w, D.h, 'Done', { style: 'gold', key: ui.touch ? undefined : 'TAB' }) || (this.time > 0.1 && !this.confirm && !this.drag && (inp.actionPressed('bag') || inp.actionPressed('back')))) this.close();

    if (this.confirm) {
      ui.block(5);
      ui.rect(0, 0, ui.w, ui.h, '#07060b', 0.5);
      const s = scrap(260, 92, { seed: 7 });
      const x = Math.round(ui.w / 2 - 130), y = Math.round(ui.h / 2 - 46);
      ui.img(s, x, y);
      ui.text(`Leave ${bag.overflow.length} item${bag.overflow.length > 1 ? 's' : ''} on the floor?`, ui.w / 2, y + s.inner.y + 4, { align: 'center', color: INK, maxW: 230 });
      const a = this.drawTag(ui, ui.w / 2 - 62, y + 42, 'Leave them', { seed: 8, color: '#8a2a14', string: 6 });
      const b = this.drawTag(ui, ui.w / 2 + 62, y + 42, 'Go back', { seed: 9, string: 6 });
      if (ui.hit('bag-leave', a.x, a.y, a.w, a.h).clicked) { this.confirm = false; this.close(true); }
      if (ui.hit('bag-back', b.x, b.y, b.w, b.h).clicked) this.confirm = false;
      ui.unblock();
      ui.block(2);
    }
    void COLORS;
  }

  /** Hand + skill slots + stats + set bonuses. Returns the hovered equipped item. */
  drawEquipment(ui, L, lo) {
    const run = this.game.run, ctx = ui.ctx;
    let hovered = null;
    const slot = (id, x, y, s, label, item, accept, kind) => {
      const d = this.drag;
      const can = d && accept(d.item);
      ctx.fillStyle = DARK; ctx.fillRect(x - 2, y - 2, s + 4, s + 4);
      ctx.fillStyle = can ? '#2e3a24' : '#221a20'; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = can ? '#9affb0' : '#a08a5a'; ctx.fillRect(x, y, s, 1); ctx.fillRect(x, y, 1, s);
      if (can) { ctx.globalAlpha = 0.25 + Math.sin(this.t * 6) * 0.15; ctx.fillStyle = '#9affb0'; ctx.fillRect(x, y, s, s); ctx.globalAlpha = 1; }
      if (item && !(d && d.item === item)) {
        const spr = iconArt(item, s >= 48 ? 64 : 32);
        if (spr) { const k = Math.min(1, (s - 6) / Math.max(spr.width, spr.height)); ctx.drawImage(spr, Math.round(x + s / 2 - spr.width * k / 2), Math.round(y + s / 2 - spr.height * k / 2), Math.round(spr.width * k), Math.round(spr.height * k)); }
      } else if (!item) ui.text(kind === 'hand' ? 'fists' : '—', x + s / 2, y + s / 2 - 4, { align: 'center', font: 'small', color: '#6a5a50' });
      ui.text(label, x + s / 2, y + s + 3, { align: 'center', font: 'small', color: '#cbb89a', outline: DARK });
      const h = ui.hit(id, x, y, s, s, { cursor: item ? 'hand' : 'arrow', sound: false });
      if (h.hover && item) hovered = item;
      if (h.pressed && item && !this.drag) this.pickEquipped(item, kind);
      return { x, y, s, over: this.game.input.x >= x && this.game.input.x < x + s && this.game.input.y >= y && this.game.input.y < y + s };
    };
    const isWeapon = (it) => { const m = MATERIALS[it.id]; return !!(m && (m.kind === 'weapon' || m.wpn)); };
    const isSkill = (it) => { const m = MATERIALS[it.id]; return !!(m && (m.kind === 'skill' || m.skill)); };
    ui.text('Hand', L.hand.x, L.hand.y - 14, { color: '#f0dcb0', outline: DARK });
    this.slots = {
      hand: slot('eq-hand', L.hand.x, L.hand.y, L.hand.s, (lo.weapon && lo.weapon.name) || 'Bare fists', run.hand, isWeapon, 'hand'),
      skill0: slot('eq-s0', L.skills[0].x, L.skills[0].y, L.skills[0].s, ui.touch ? 'Skill 1' : 'Q', run.skills[0], isSkill, 'skill0'),
      skill1: slot('eq-s1', L.skills[1].x, L.skills[1].y, L.skills[1].s, ui.touch ? 'Skill 2' : 'E', run.skills[1], isSkill, 'skill1'),
    };
    this.isWeapon = isWeapon; this.isSkill = isSkill;
    // stats
    const S = lo.stats || {};
    const w = lo.weapon || {};
    const rows = [
      ['sword', 'Damage', `${Math.round((w.dmg || 0) * (S.dmg || 1))}`],
      ['speed', 'Attack speed', `×${((w.speed || 1) * (S.atkSpd || 1)).toFixed(2)}`],
      ['crit', 'Crit', `${Math.round((S.crit || 0) * 100)}%`],
      ['heart', 'Max HP', `${lo.maxHp || run.maxHp || 0}`],
      ['shield', 'Armor', `${S.armor || 0}`, !S.armor],
      ['arrowR', 'Dashes', `${S.dashCharges || 2}`],
      ['lifesteal', 'Lifesteal', `${Math.round((S.lifesteal || 0) * 100)}%`, !S.lifesteal],
      ['pickaxe', 'Pick power', `${S.pickPower || 1}`],
      ['ore', 'Ore luck', `+${Math.round((S.oreLuck || 0) * 100)}%`, !S.oreLuck],
      ['gem', 'Loot luck', `+${Math.round((S.lootLuck || 0) * 100)}%`, !S.lootLuck],
    ].filter((r) => !r[3]);
    let y = L.stats.y;
    ctx.fillStyle = 'rgba(20,12,16,0.7)'; ctx.fillRect(L.stats.x - 4, y - 4, 196, rows.length * 13 + 8);
    for (const [ic, name, val] of rows) {
      ui.icon(ic, L.stats.x, y - 1, { alpha: 0.9 });
      ui.text(name, L.stats.x + 14, y, { font: 'small', color: '#cbb89a' });
      ui.text(val, L.stats.x + 184, y, { font: 'small', color: '#f4ead6', align: 'right' });
      y += 13;
    }
    // status chances + element
    const st = Object.entries(S.status || {}).filter(([, v]) => v > 0);
    if (st.length || S.element) {
      y += 4;
      let x = L.stats.x;
      for (const [k, v] of st) { ui.icon(k === 'freeze' ? 'ice' : k === 'burn' ? 'fire' : k === 'slow' ? 'clock' : k === 'stun' ? 'shock' : k, x, y - 1); ui.text(`${Math.round(v * 100)}%`, x + 12, y, { font: 'small', color: '#e8d8b8' }); x += 40; }
      y += 13;
    }
    // set bonuses
    const sets = (lo.synergies || []).filter((s) => s.active);
    for (const s of sets.slice(0, 4)) {
      ui.icon('star', L.stats.x, y - 1);
      const h = ui.hit('set-' + s.id, L.stats.x, y - 2, 190, 12, { sound: false });
      ui.text(s.name, L.stats.x + 14, y, { font: 'small', color: '#ffe08a' });
      if (h.hover) ui.tooltip({ title: s.name, body: s.text });
      y += 12;
    }
    return hovered;
  }

  updateDrag(ui, L, overPit) {
    const game = this.game, run = game.run, bag = run.bag, inp = game.input, ctx = ui.ctx;
    const d = this.drag;
    if (inp.actionPressed('rotate') || (inp.rpressed && !inp.longPress) || inp.wheel) { d.item.rot = ((d.item.rot || 0) + (inp.wheel < 0 ? 3 : 1)) % 4; game.audio && game.audio.play('rotate'); }
    ui.touchButton('rotate', ui.w - 52, ui.h - 132, 30, { icon: 'tool', label: 'ROTATE', style: 'brass' });
    const m = MATERIALS[d.item.id] || {};
    const usable = m.kind === 'recipe' || m.kind === 'potion' || (m.cook && m.cook.heal);
    if (usable) ui.touchButton('read', ui.w - 52, ui.h - 204, 26, { icon: m.kind === 'recipe' ? 'scroll' : 'heart', label: m.kind === 'recipe' ? 'READ' : 'USE', style: 'jade' });
    if (inp.actionPressed('read') && usable) { this.drop('back'); this.contextAction(d.item); return; }
    if (inp.longPress && inp.dragDist < 9) ui.tooltip(shortTip(d.item));
    const iy = inp.y - (ui.touch ? 26 : 0);
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
    ctx.globalAlpha = 0.4; ui.img(itemArt(d.item, CELL, d.item.rot), ox + 6, oy + 10); ctx.globalAlpha = 1;
    ui.img(itemArt(d.item, CELL, d.item.rot), ox, oy - 4, { alpha: 0.95 });
    ui.dragging = true;
    if (!inp.released) return;
    const c = L.cloth, S = this.slots || {};
    if (S.hand && S.hand.over && this.isWeapon(d.item)) { const old = this.setHand(d.item); this.stow(old); game.audio && game.audio.play('equip'); }
    else if (S.skill0 && S.skill0.over && this.isSkill(d.item)) { const old = this.setSkill(0, d.item); this.stow(old === d.item ? null : old); game.audio && game.audio.play('equip'); }
    else if (S.skill1 && S.skill1.over && this.isSkill(d.item)) { const old = this.setSkill(1, d.item); this.stow(old === d.item ? null : old); game.audio && game.audio.play('equip'); }
    else if (overGrid && bag.canPlace(d.item, gxCell, gyCell, d.item.rot)) {
      const oi = bag.overflow.indexOf(d.item); if (oi >= 0) bag.overflow.splice(oi, 1);
      bag.place(d.item, gxCell, gyCell, d.item.rot);
      game.audio && game.audio.play('card_place');
    } else if (overPit) {
      bag.remove(d.item);
      game.audio && game.audio.play('drop');
      ui.burst(inp.x, inp.y, 12, { colors: ['#8a7a6a', '#c9c1b3', '#5a4a3a'], speed: 40, gravity: 160 });
    } else if (inp.x > c.x && inp.y > c.y && inp.x < c.x + c.w && inp.y < c.y + c.h) {
      if (!bag.overflow.includes(d.item)) bag.toOverflow(d.item);
      game.audio && game.audio.play('drop');
    } else this.drop('back');
    this.drag = null;
    ui.dragging = false;
  }
  /** Put the held item back where it came from. */
  drop() {
    const d = this.drag, bag = this.game.run.bag;
    if (!d) return;
    d.item.rot = d.rot0;
    if (d.from === 'bag') { if (!bag.place(d.item, d.x0, d.y0, d.rot0)) bag.toOverflow(d.item); }
    else if (d.from === 'hand') this.setHand(d.item);
    else if (d.from === 'skill0') this.setSkill(0, d.item);
    else if (d.from === 'skill1') this.setSkill(1, d.item);
    this.drag = null;
  }

  pick(it, from) {
    this.drag = { item: it, from, x0: it.x, y0: it.y, rot0: it.rot || 0 };
    if (from === 'bag') this.game.run.bag.remove(it);
    this.game.audio && this.game.audio.play('card_pick');
  }
  pickEquipped(it, kind) {
    if (kind === 'hand') this.setHand(null);
    else this.setSkill(kind === 'skill0' ? 0 : 1, null);
    this.drag = { item: it, from: kind, x0: -1, y0: -1, rot0: it.rot || 0 };
    this.game.audio && this.game.audio.play('card_pick');
  }

  /** Right-click: read a recipe page, eat forage, drink a potion. */
  contextAction(it) {
    const game = this.game, run = game.run;
    const m = MATERIALS[it.id] || {};
    if (has(run, 'useItem')) { const r = run.useItem(it); if (r) { this.feedback(r); return; } }
    if (m.kind === 'recipe' || it.recipe) {
      let r = null;
      try { r = has(Crafting, 'readRecipePage') ? Crafting.readRecipePage(run, it) : null; } catch (e) { r = null; }
      if (r) {
        run.removeItem ? run.removeItem(it) : run.bag.remove(it);
        game.audio && game.audio.play('recipe_discover');
        const rec = Crafting.RECIPES && Crafting.RECIPES[r.id];
        const out = rec && MATERIALS[rec.out];
        game.ui.toast(`${r.new ? 'New recipe' : 'Known recipe'}: ${(out && out.name) || r.id}`, { icon: 'recipe', color: COLORS.gold });
      }
      return;
    }
    const heal = (m.cook && m.cook.heal) || (m.potion && m.potion.heal) || 0;
    if (heal || m.kind === 'potion') {
      run.removeItem ? run.removeItem(it) : run.bag.remove(it);
      const n = run.heal ? run.heal(heal) : heal;
      game.audio && game.audio.play('slurp');
      game.ui.float(`+${n}`, game.input.x, game.input.y - 16, { color: '#7dff9a' });
    }
  }
  feedback(r) {
    const game = this.game;
    if (r.text) game.ui.toast(r.text, { icon: r.icon || 'sparkle', color: COLORS.gold });
    if (r.sound) game.audio && game.audio.play(r.sound);
  }
}
