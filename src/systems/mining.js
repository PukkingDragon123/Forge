// Mining minigame rules: wall generation (veins, hard rock, hazards, pockets, clues) and strikes.
import { MATERIALS, RARITY } from '../data/materials.js';
import { makeItem } from './items.js';
import { unlockedMaterial } from './unlocks.js';

export const MINE_W = 7, MINE_H = 7;
const DIRS = [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']];
const ICE = ['rime', 'sapphire'];

function oreTable(region) {
  return Object.values(MATERIALS).filter((m) => m.regions && m.regions.includes(region) && (m.kind === 'ore' || m.kind === 'gem' || m.kind === 'crystal' || m.kind === 'mineral') && unlockedMaterial(m.id));
}

function pickOre(rng, table, depth, luck) {
  const items = table.map((m) => {
    const aff = Math.exp(-((depth - (m.depth ?? 0.3)) ** 2) / 0.07) + 0.12;
    let w = RARITY[m.rarity].weight * aff;
    if (luck && RARITY[m.rarity].order >= 2) w *= 1 + luck * 0.6;
    return [m.id, w];
  });
  return rng.weighted(items);
}

export function generateMine(rng, region, opts = {}) {
  const luck = opts.luck || 0;
  const table = oreTable(region);
  const tiles = [];
  for (let y = 0; y < MINE_H; y++) {
    tiles.push([]);
    for (let x = 0; x < MINE_W; x++) tiles[y].push({ x, y, t: 'rock', mat: null, q: 2, hits: 0, broken: false, veins: {}, glint: 0, crack: false, revealed: false, marked: false });
  }
  const at = (x, y) => (tiles[y] && tiles[y][x]) || null;
  // ore veins
  const veins = rng.int(7, 9) + (opts.bonusVeins || 0);
  for (let v = 0; v < veins; v++) {
    const y0 = Math.min(MINE_H - 1, Math.floor(Math.pow(rng.next(), 0.8) * MINE_H));
    const x0 = rng.int(0, MINE_W - 1);
    const depth = y0 / (MINE_H - 1);
    const id = pickOre(rng, table, depth, luck);
    const m = MATERIALS[id];
    const size = m.rarity === 'common' ? rng.int(2, 3) : m.rarity === 'uncommon' ? rng.int(1, 2) : 1;
    let cx = x0, cy = y0;
    for (let k = 0; k < size; k++) {
      const t = at(cx, cy);
      if (t && t.t === 'rock') {
        t.t = 'ore'; t.mat = id;
        const dq = depth > 0.7 ? 1 : depth < 0.25 ? -1 : 0;
        t.q = Math.max(0, Math.min(4, 2 + dq + (rng.chance(0.2) ? 1 : 0) - (rng.chance(0.2) ? 1 : 0)));
      }
      const d = rng.pick(DIRS);
      cx = Math.max(0, Math.min(MINE_W - 1, cx + d[0]));
      cy = Math.max(0, Math.min(MINE_H - 1, cy + d[1]));
    }
  }
  // hazards
  const hz = rng.int(1, 3);
  for (let i = 0; i < hz; i++) {
    const t = at(rng.int(0, MINE_W - 1), rng.int(1, MINE_H - 1));
    if (t.t === 'rock') { t.t = 'hazard'; t.hz = rng.pick(['gas', 'cavein', 'critter']); }
  }
  // treasure pocket
  if (rng.chance(0.35 + luck * 0.1)) {
    const t = at(rng.int(0, MINE_W - 1), rng.int(3, MINE_H - 1));
    if (t.t === 'rock') { t.t = 'pocket'; t.loot = rng.pick(['rusty_key', 'rune_haste', 'rune_fury', 'blast', 'scanner', 'crystal_key', 'rune_plenty', 'flare']); }
  }
  // hard rock
  for (const row of tiles) for (const t of row) if (t.t === 'rock' && rng.chance(0.12 + (t.y / MINE_H) * 0.18)) t.t = 'hard';
  // clues: veins leak into neighbours, rare ores glint, hazards crack neighbours
  for (const row of tiles) for (const t of row) {
    if (t.t === 'ore') {
      const m = MATERIALS[t.mat];
      t.glint = RARITY[m.rarity].order >= 2 ? RARITY[m.rarity].order : 0;
      for (const [dx, dy, dir] of DIRS) {
        const n = at(t.x + dx, t.y + dy);
        if (n && n.t !== 'ore') n.veins[opposite(dir)] = m.color;
      }
    } else if (t.t === 'hazard') {
      for (const [dx, dy] of DIRS) { const n = at(t.x + dx, t.y + dy); if (n && n.t !== 'hazard') n.crack = true; }
    } else if (t.t === 'pocket') t.glint = 2;
  }
  return { region, tiles, w: MINE_W, h: MINE_H };
}
const opposite = (d) => ({ up: 'down', down: 'up', left: 'right', right: 'left' }[d]);

/** Live mining session. pick = aggregated pickaxe effects (from forge evaluatePick) or {}. */
export class MiningRun {
  constructor(wall, rng, pick = {}, ctx = {}) {
    this.wall = wall; this.rng = rng; this.pick = pick; this.ctx = ctx;
    this.strikes = 3 + (pick.strikes || 0);
    this.used = 0;
    this.haul = [];
    this.gemDuped = 0;
    this.firstStrike = true;
    this.log = [];
  }
  tile(x, y) { return (this.wall.tiles[y] && this.wall.tiles[y][x]) || null; }
  exposed(x, y) {
    const t = this.tile(x, y);
    if (!t || t.broken) return false;
    if (y === 0) return true;
    return DIRS.some(([dx, dy]) => { const n = this.tile(x + dx, y + dy); return n && n.broken; });
  }
  get done() { return this.strikes <= 0; }

  /** Strike a tile. Returns { ok, events: [...] } */
  strike(x, y) {
    if (this.strikes <= 0 || !this.exposed(x, y)) return { ok: false, events: [] };
    const ev = [];
    this.strikes--; this.used++;
    const p = this.pick;
    const t = this.tile(x, y);
    const targets = new Set();
    const addT = (tt) => { if (tt && !tt.broken) targets.add(tt); };
    if (t.t === 'hard' && !p.hard && t.hits === 0) {
      t.hits = 1;
      ev.push({ type: 'crack', x, y });
    } else addT(t);
    if (p.cursed) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) addT(this.tile(x + dx, y + dy));
    if (p.area) addT(this.tile(x, y + 1));
    if (p.column && this.firstStrike) for (let yy = y; yy < MINE_H; yy++) addT(this.tile(x, yy));
    this.firstStrike = false;
    const broken = this._break([...targets], ev, { cursed: !!p.cursed });
    // magnetic: pull adjacent metal ores
    if (p.magnetic) for (const b of broken) for (const [dx, dy] of DIRS) {
      const n = this.tile(b.x + dx, b.y + dy);
      if (n && !n.broken && n.t === 'ore' && MATERIALS[n.mat].tags.includes('metal')) { this._break([n], ev, { magnet: true }); }
    }
    // chain: connected same ore
    if (p.chain) for (const b of broken.filter((b) => b.t === 'ore')) {
      let budget = 1 + p.chain;
      const q = [b];
      while (q.length && budget > 0) {
        const c = q.shift();
        for (const [dx, dy] of DIRS) {
          const n = this.tile(c.x + dx, c.y + dy);
          if (n && !n.broken && n.t === 'ore' && n.mat === b.mat && budget > 0) { budget--; this._break([n], ev, { chain: true }); q.push(n); }
        }
      }
    }
    return { ok: true, events: ev };
  }

  _break(list, ev, how = {}) {
    const p = this.pick;
    const out = [];
    for (const t of list) {
      if (t.broken) continue;
      t.broken = true;
      out.push(t);
      ev.push({ type: 'break', x: t.x, y: t.y, t: t.t, how });
      if (t.t === 'ore') {
        const m = MATERIALS[t.mat];
        if (p.melt && ICE.includes(t.mat)) { ev.push({ type: 'melt', x: t.x, y: t.y, mat: t.mat }); continue; }
        let q = t.q;
        if ((how.cursed || how.blast) && !p.preserve) q -= 1;
        if (p.smelt && m.tags.includes('metal')) q += 1;
        if (p.quality && m.kind === 'gem') q += 1;
        if (p.archaeo && (t.mat === 'fossil' || t.mat === 'amber')) q += 1;
        let id = t.mat;
        if (id === 'junk' && (p.lucky || this.ctx.char === 'clover') && this.rng.chance(p.lucky ? 0.5 : 0.25)) {
          id = this.rng.pick(['silver', 'gold', 'amethyst', 'ruby', 'topaz', 'moonstone'].filter((x) => MATERIALS[x]));
          ev.push({ type: 'lucky', x: t.x, y: t.y, mat: id });
        }
        const item = makeItem(id, q);
        this.haul.push(item);
        ev.push({ type: 'ore', x: t.x, y: t.y, item });
        if (p.gemDupe && m.kind === 'gem' && this.gemDuped < p.gemDupe) {
          this.gemDuped++;
          const dup = makeItem(id, q);
          this.haul.push(dup);
          ev.push({ type: 'dupe', x: t.x, y: t.y, item: dup });
        }
      } else if (t.t === 'hazard') {
        if (p.freeze) ev.push({ type: 'frozen', x: t.x, y: t.y, hz: t.hz });
        else if (t.hz === 'gas') { this.strikes = Math.max(0, this.strikes - 1); ev.push({ type: 'gas', x: t.x, y: t.y }); }
        else if (t.hz === 'cavein') ev.push({ type: 'cavein', x: t.x, y: t.y, dmg: 6 });
        else { ev.push({ type: 'critter', x: t.x, y: t.y, dmg: 3 }); this.haul.push(makeItem('rat_tail', 2)); }
      } else if (t.t === 'pocket') {
        const item = makeItem(t.loot, 2);
        this.haul.push(item);
        ev.push({ type: 'pocket', x: t.x, y: t.y, item });
        if (p.unlock) { const extra = makeItem(this.rng.pick(['gold', 'silver', 'ruby', 'sapphire', 'golden_key']), 3); this.haul.push(extra); ev.push({ type: 'ore', x: t.x, y: t.y, item: extra }); }
      }
    }
    return out;
  }

  /** Free tool actions. */
  useTool(tool, x, y) {
    const ev = [];
    const T = (xx, yy) => this.tile(xx, yy);
    if (tool === 'blast') {
      const list = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = T(x + dx, y + dy); if (t && !t.broken) list.push(t); }
      ev.push({ type: 'blast', x, y });
      this._break(list, ev, { blast: true });
    } else if (tool === 'drill') {
      const list = [];
      for (let yy = y; yy < Math.min(MINE_H, y + 4); yy++) { const t = T(x, yy); if (t && !t.broken) list.push(t); }
      ev.push({ type: 'drill', x, y });
      this._break(list, ev, {});
    } else if (tool === 'scan') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = T(x + dx, y + dy); if (t) t.revealed = true; }
      ev.push({ type: 'scan', x, y });
    } else if (tool === 'radar') {
      let best = null;
      for (const row of this.wall.tiles) for (const t of row) if (!t.broken && t.t === 'ore' && (!best || MATERIALS[t.mat].value > MATERIALS[best.mat].value)) best = t;
      if (best) { best.marked = true; best.revealed = true; ev.push({ type: 'radar', x: best.x, y: best.y }); }
    } else if (tool === 'flare') {
      this.flare = true;
      ev.push({ type: 'flare' });
    }
    return { ok: true, events: ev };
  }
}
