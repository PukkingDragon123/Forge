// 5×5 polyomino backpack with rotation, overflow and adjacency bonuses.
import { cellsOf, matOf } from './items.js';

export class Backpack {
  constructor(w = 5, h = 5) {
    this.w = w; this.h = h;
    this.items = [];     // placed
    this.overflow = [];  // waiting to be placed or discarded
  }
  all() { return [...this.items, ...this.overflow]; }
  cellsAt(it, x, y, rot = it.rot) {
    const save = it.rot; it.rot = rot;
    const c = cellsOf(it).map(([cx, cy]) => [cx + x, cy + y]);
    it.rot = save;
    return c;
  }
  grid(ignore = null) {
    const g = Array.from({ length: this.h }, () => Array(this.w).fill(null));
    for (const it of this.items) if (it !== ignore) for (const [x, y] of this.cellsAt(it, it.x, it.y)) if (g[y] && x >= 0 && x < this.w) g[y][x] = it;
    return g;
  }
  canPlace(it, x, y, rot = it.rot) {
    const g = this.grid(it);
    return this.cellsAt(it, x, y, rot).every(([cx, cy]) => cx >= 0 && cy >= 0 && cx < this.w && cy < this.h && !g[cy][cx]);
  }
  place(it, x, y, rot = it.rot) {
    if (!this.canPlace(it, x, y, rot)) return false;
    this.remove(it);
    it.x = x; it.y = y; it.rot = rot;
    this.items.push(it);
    return true;
  }
  remove(it) {
    let i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    i = this.overflow.indexOf(it);
    if (i >= 0) this.overflow.splice(i, 1);
  }
  findSpot(it) {
    for (let r = 0; r < 4; r++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.canPlace(it, x, y, (it.rot + r) % 4)) return { x, y, rot: (it.rot + r) % 4 };
    return null;
  }
  /** Auto-place if possible, otherwise put in overflow. Returns true if placed. */
  add(it) {
    const s = this.findSpot(it);
    if (s) { this.place(it, s.x, s.y, s.rot); return true; }
    this.remove(it);
    it.x = it.y = -1;
    this.overflow.push(it);
    return false;
  }
  toOverflow(it) { this.remove(it); it.x = it.y = -1; this.overflow.push(it); }
  freeCells() { return this.w * this.h - this.items.reduce((a, it) => a + cellsOf(it).length, 0); }
  count(id) { return this.all().filter((it) => it.id === id).length; }
  find(pred) { return this.all().find(pred); }
  neighbors(it) {
    if (it.x < 0) return [];
    const g = this.grid();
    const out = new Set();
    for (const [x, y] of this.cellsAt(it, it.x, it.y)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = g[y + dy] && g[y + dy][x + dx];
        if (n && n !== it) out.add(n);
      }
    }
    return [...out];
  }
  /** Adjacency bonuses: uid → { q, chips, mult, from:[names] } */
  bonuses() {
    const out = {};
    const add = (it, k, v, src) => {
      const b = out[it.uid] || (out[it.uid] = { q: 0, chips: 0, mult: 0, from: [] });
      b[k] += v;
      if (!b.from.includes(src)) b.from.push(src);
    };
    for (const it of this.items) {
      const m = matOf(it);
      for (const n of this.neighbors(it)) {
        const nm = matOf(n);
        if (m.id === 'coal' && nm.tags.includes('metal')) add(n, 'q', 1, 'Coal');
        if (m.id === 'lodestone' && nm.tags.includes('metal') && nm.id !== 'lodestone') add(n, 'chips', 2, 'Lodestone');
        if (m.id === 'quartz' && nm.tags.includes('gem') && nm.id !== 'quartz') add(n, 'mult', 1, 'Quartz');
        if (m.id === 'amber' && nm.kind === 'part') add(n, 'q', 1, 'Amber');
      }
    }
    for (const k in out) out[k].q = Math.min(1, out[k].q);
    return out;
  }
  /** Links for drawing synergy lines: [{a, b}] */
  links() {
    const res = [];
    for (const it of this.items) {
      const m = matOf(it);
      if (!m.bag) continue;
      for (const n of this.neighbors(it)) {
        const nm = matOf(n);
        const near = m.bag.near;
        if ((near === 'metal' && nm.tags.includes('metal')) || (near === 'gem' && nm.tags.includes('gem')) || (near === 'part' && nm.kind === 'part')) res.push({ a: it, b: n });
      }
    }
    return res;
  }
  serialize() { return { items: this.items.map((i) => ({ ...i })), overflow: this.overflow.map((i) => ({ ...i })) }; }
}
