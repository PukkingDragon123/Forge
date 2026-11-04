// Zoom-in tool mining (docs/REDESIGN.md §7). Walk up to an ore vein or a petrified foe, the camera
// zooms in on a rock face: a grid of rock hiding ores, gems, hazards and pockets. You dig in from the
// edges with your TOOLS (items in the bag, some with limited uses) on a strike budget.
//
//   startMine(run, { source: 'vein'|'statue', monster?: def|id, stage?, quality?: ±n, seed? }) → MineSession
//   MineSession {
//     w, h, tiles[y][x] = { x, y, t: rock|hard|ore|gem|hazard|pocket|void, mat, q, hits, broken, revealed,
//                          glint (0–4, rare things sparkle through the rock), crack (a hazard is next door),
//                          veins: { up|down|left|right: colour } (ore colour bleeding into this tile) }
//     source, strikes, maxStrikes, haul [items], hpLoss, done, log []
//     tools() → [{ kind, name, item|null, uses (Infinity|n), power, free, strikeCost }]
//     exposed(x, y) — on the border or next to a broken tile
//     canUse(kind, x, y) → true | reason
//     use(kind, x, y) → { ok, reason?, events: [{ type, x, y, item?, dmg?, q? }] }
//        event types: break, crack (hard rock took a hit), ore, gem, cracked (gem lost quality), shatter
//        (gem destroyed), hazard (gas|cavein|critter, dmg), pocket, reveal, blast, empty
//     finish() → { items: haul, hpLoss }   (the scene adds items to the bag / opens it)
//   }
// Tools: pickaxe (1 cell; power 2 breaks hard rock) · hammer (row of 3, smashes hard rock, gems crack −1
// quality) · chisel (1 cell, +1 quality, not hard rock) · bomb (3×3 anywhere, free, ores −1, gems may
// shatter) · lantern (reveal 3×3, free). No pickaxe in the bag → bare hands (2 strikes per rock).
import { MATERIALS, RARITY } from '../data/materials.js';
import { MONSTERS } from '../data/monsters.js';
import { STAGES } from '../data/regions.js';
import { RNG } from '../core/rng.js';
import { makeItem } from './items.js';
import { statueOre } from './loot.js';
import { computeLoadout } from './loadout.js';

const DIRS = [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']];
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const TOOL_ORDER = ['pickaxe', 'hammer', 'chisel', 'bomb', 'lantern'];

export function startMine(run, opts = {}) {
  const source = opts.source === 'statue' ? 'statue' : 'vein';
  const stage = Math.max(0, Math.min(STAGES.length - 1, opts.stage ?? run.stage ?? run.act ?? 0));
  const rng = new RNG(String(opts.seed ?? (run.seed + ':mine:' + (run.stats ? run.stats.mined || 0 : 0) + ':' + Math.floor(run.rng.next() * 1e9))));
  const lo = run.loadout ? run.loadout() : computeLoadout(run);
  const def = source === 'statue' ? (typeof opts.monster === 'string' ? MONSTERS[opts.monster] : opts.monster) || {} : null;
  const w = source === 'statue' ? 5 : 7, h = 6;
  const table = source === 'statue' ? statueOre(run, def) : STAGES[stage].veins.filter(([id]) => MATERIALS[id]);
  const wall = buildWall(rng, w, h, table, {
    stage, source, def, oreLuck: lo.stats.oreLuck || 0, qBonus: (opts.quality || 0) + (stage >= 2 ? 1 : 0),
    boss: def && def.tier === 'boss', elite: def && def.tier === 'elite',
  });
  return new MineSession(run, wall, rng, lo, { source, stage, def });
}

function buildWall(rng, w, h, table, o) {
  const tiles = [];
  for (let y = 0; y < h; y++) {
    tiles.push([]);
    for (let x = 0; x < w; x++) tiles[y].push({ x, y, t: 'rock', mat: null, q: 2, hits: 0, broken: false, revealed: false, glint: 0, crack: false, veins: {} });
  }
  const at = (x, y) => (tiles[y] && tiles[y][x]) || null;
  const interior = (t) => t.x > 0 && t.y > 0 && t.x < w - 1 && t.y < h - 1;
  // statues: round off the corners so the face reads as a body, not a slab
  if (o.source === 'statue') for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) at(x, y).t = 'void';
  const veins = (o.source === 'statue' ? rng.int(5, 7) : rng.int(6, 8)) + Math.round(o.oreLuck * 4) + (o.elite ? 1 : 0) + (o.boss ? 2 : 0);
  for (let v = 0; v < veins; v++) {
    const id = rng.weighted(table);
    const m = MATERIALS[id];
    if (!m) continue;
    const size = m.rarity === 'common' ? rng.int(1, 3) : m.rarity === 'uncommon' ? rng.int(1, 2) : 1;
    // most riches sit inside, a few peek out at the edge
    let cx = rng.chance(0.75) ? rng.int(1, w - 2) : rng.int(0, w - 1), cy = rng.chance(0.75) ? rng.int(1, h - 2) : rng.int(0, h - 1);
    for (let k = 0; k < size; k++) {
      const t = at(cx, cy);
      if (t && t.t === 'rock') {
        t.t = m.kind === 'gem' ? 'gem' : 'ore'; t.mat = id;
        t.q = Math.max(0, Math.min(4, 2 + o.qBonus + (interior(t) ? 0 : -1) + (rng.chance(0.22) ? 1 : 0) - (rng.chance(0.18) ? 1 : 0)));
      }
      const d = rng.pick(DIRS);
      cx = Math.max(0, Math.min(w - 1, cx + d[0])); cy = Math.max(0, Math.min(h - 1, cy + d[1]));
    }
  }
  // boss statues keep their heart in the core
  if (o.boss && o.def) {
    const core = at(Math.floor(w / 2), Math.floor(h / 2));
    const part = (o.def.ore || []).find((id) => MATERIALS[id] && MATERIALS[id].tags.includes('boss'));
    if (part) { core.t = 'ore'; core.mat = part; core.q = 3; }
  }
  // hazards (veins only: statues are just stone)
  const hz = o.source === 'statue' ? (rng.chance(0.3) ? 1 : 0) : rng.int(1, 2) + (o.stage >= 2 ? 1 : 0);
  for (let i = 0; i < hz; i++) {
    const t = at(rng.int(1, w - 2), rng.int(1, h - 2));
    if (t && t.t === 'rock') { t.t = 'hazard'; t.hz = rng.pick(o.stage === 0 ? ['gas', 'gas', 'critter', 'cavein'] : ['gas', 'cavein', 'critter']); }
  }
  // a hidden pocket
  if (rng.chance(o.source === 'statue' ? 0.25 : 0.4)) {
    const t = at(rng.int(1, w - 2), rng.int(1, h - 2));
    if (t && t.t === 'rock') { t.t = 'pocket'; t.loot = rng.pick(['healing_potion', 'bomb', 'lantern', 'chisel', 'recipe_page', 'glowcap', 'truffle', 'four_leaf']); }
  }
  // hard rock, deeper is harder
  for (const row of tiles) for (const t of row) if (t.t === 'rock' && interior(t) && rng.chance(0.16 + o.stage * 0.04)) t.t = 'hard';
  // clues
  for (const row of tiles) for (const t of row) {
    if (t.t === 'ore' || t.t === 'gem') {
      const m = MATERIALS[t.mat];
      t.glint = RARITY[m.rarity].order >= 2 ? RARITY[m.rarity].order : t.t === 'gem' ? 1 : 0;
      for (const [dx, dy, dir] of DIRS) { const n = at(t.x + dx, t.y + dy); if (n && n.t !== 'ore' && n.t !== 'gem') n.veins[OPP[dir]] = m.color; }
    } else if (t.t === 'hazard') {
      for (const [dx, dy] of DIRS) { const n = at(t.x + dx, t.y + dy); if (n && n.t !== 'hazard') n.crack = true; }
    } else if (t.t === 'pocket') t.glint = 2;
  }
  // the border is plainly visible
  for (const row of tiles) for (const t of row) if (!interior(t)) t.revealed = true;
  return { tiles, w, h };
}

export class MineSession {
  constructor(run, wall, rng, loadout, ctx) {
    this.run = run; this.rng = rng; this.ctx = ctx;
    this.tiles = wall.tiles; this.w = wall.w; this.h = wall.h;
    this.source = ctx.source;
    this.pickPower = Math.max(1, loadout.stats.pickPower || 1);
    this.maxStrikes = (ctx.source === 'statue' ? 6 : 8) + (this.pickPower - 1) * 2 + (run.char === 'bran' ? 1 : 0);
    this.strikes = this.maxStrikes;
    this.haul = []; this.hpLoss = 0; this.log = [];
  }
  tile(x, y) { return (this.tiles[y] && this.tiles[y][x]) || null; }
  get done() { return this.strikes <= 0 || this.tiles.every((r) => r.every((t) => t.broken || t.t === 'void')); }
  exposed(x, y) {
    const t = this.tile(x, y);
    if (!t || t.broken || t.t === 'void') return false;
    if (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1) return true;
    return DIRS.some(([dx, dy]) => { const n = this.tile(x + dx, y + dy); return n && (n.broken || n.t === 'void'); });
  }

  /** Tools you can use right now (from the bag; bare hands if you have no pickaxe). */
  tools() {
    const bag = this.run.bag ? this.run.bag.all() : [];
    const best = {};
    for (const it of bag) {
      const m = MATERIALS[it.id];
      if (!m || !m.tool) continue;
      const left = m.tool.uses ? (it.uses ?? m.tool.uses) : Infinity;
      if (left <= 0) continue;
      const k = m.tool.kind;
      if (!best[k] || m.tool.power > best[k].power || (left !== Infinity && best[k].uses !== Infinity && left > best[k].uses)) {
        best[k] = { kind: k, name: m.name, item: it, uses: left, power: m.tool.power + (k === 'pickaxe' ? this.pickPower - 1 : 0), free: k === 'bomb' || k === 'lantern', strikeCost: k === 'bomb' || k === 'lantern' ? 0 : 1 };
      }
    }
    if (!best.pickaxe) best.pickaxe = { kind: 'pickaxe', name: 'Bare Hands', item: null, uses: Infinity, power: 1, free: false, strikeCost: 2 };
    return TOOL_ORDER.filter((k) => best[k]).map((k) => best[k]);
  }
  toolOf(kind) { return this.tools().find((t) => t.kind === kind) || null; }

  canUse(kind, x, y) {
    const tool = this.toolOf(kind);
    if (!tool) return 'No ' + kind + '.';
    if (this.strikes < tool.strikeCost) return 'Out of strength.';
    const t = this.tile(x, y);
    if (!t || t.t === 'void') return 'Nothing there.';
    if (kind === 'bomb' || kind === 'lantern') return true;
    if (t.broken) return 'Already dug.';
    if (!this.exposed(x, y)) return 'Dig from the edge.';
    if (kind === 'chisel' && t.t === 'hard') return 'Too hard to chisel.';
    return true;
  }

  use(kind, x, y) {
    const ok = this.canUse(kind, x, y);
    if (ok !== true) return { ok: false, reason: ok, events: [] };
    const tool = this.toolOf(kind);
    const ev = [];
    this.strikes -= tool.strikeCost;
    this._spend(tool);
    const T = (xx, yy) => this.tile(xx, yy);
    if (kind === 'pickaxe') {
      const t = T(x, y);
      if (t.t === 'hard' && tool.power < 2 && t.hits === 0) { t.hits = 1; ev.push({ type: 'crack', x, y }); }
      else this._break([t], ev, {});
    } else if (kind === 'chisel') {
      this._break([T(x, y)], ev, { chisel: true });
    } else if (kind === 'hammer') {
      const list = [T(x - 1, y), T(x, y), T(x + 1, y)].filter((t) => t && !t.broken && t.t !== 'void');
      ev.push({ type: 'smash', x, y });
      this._break(list, ev, { hammer: true });
    } else if (kind === 'bomb') {
      const list = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = T(x + dx, y + dy); if (t && !t.broken && t.t !== 'void') list.push(t); }
      ev.push({ type: 'blast', x, y });
      this._break(list, ev, { blast: true });
    } else if (kind === 'lantern') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = T(x + dx, y + dy); if (t && !t.revealed) { t.revealed = true; ev.push({ type: 'reveal', x: t.x, y: t.y, t: t.t, mat: t.mat }); } }
    }
    this.log.push(...ev);
    return { ok: true, events: ev };
  }

  _spend(tool) {
    if (!tool.item || tool.uses === Infinity) return;
    tool.item.uses = (tool.item.uses ?? tool.uses) - 1;
    if (tool.item.uses <= 0 && this.run.removeItem) this.run.removeItem(tool.item);
  }

  _break(list, ev, how) {
    for (const t of list) {
      if (!t || t.broken || t.t === 'void') continue;
      t.broken = true; t.revealed = true;
      ev.push({ type: 'break', x: t.x, y: t.y, t: t.t });
      if (t.t === 'ore' || t.t === 'gem') {
        const m = MATERIALS[t.mat];
        let q = t.q;
        if (how.chisel) q += 1;
        if (how.blast && t.t === 'ore') q -= 1;
        if (t.t === 'gem' && (how.hammer || how.blast)) {
          if (how.blast && this.rng.chance(0.5)) { ev.push({ type: 'shatter', x: t.x, y: t.y, mat: t.mat }); continue; }
          q -= 1; ev.push({ type: 'cracked', x: t.x, y: t.y, mat: t.mat });
        }
        const item = makeItem(t.mat, Math.max(0, Math.min(4, q)));
        this.haul.push(item);
        ev.push({ type: t.t, x: t.x, y: t.y, item, q: item.q, rarity: m.rarity });
      } else if (t.t === 'hazard') {
        const dmg = t.hz === 'cavein' ? 8 : t.hz === 'gas' ? 4 : 3;
        if (t.hz === 'gas') this.strikes = Math.max(0, this.strikes - 1);
        this.hpLoss += dmg;
        ev.push({ type: 'hazard', x: t.x, y: t.y, hz: t.hz, dmg });
        if (t.hz === 'critter' && MATERIALS.root_fiber) this.haul.push(makeItem('root_fiber', 2));
      } else if (t.t === 'pocket') {
        const item = t.loot === 'recipe_page' ? makeItem('recipe_page', 2) : makeItem(t.loot, 2);
        if (MATERIALS[t.loot] && MATERIALS[t.loot].tool && MATERIALS[t.loot].tool.uses) item.uses = MATERIALS[t.loot].tool.uses;
        this.haul.push(item);
        ev.push({ type: 'pocket', x: t.x, y: t.y, item });
      } else ev.push({ type: 'empty', x: t.x, y: t.y });
    }
  }

  finish() {
    if (this.run.stats) { this.run.stats.mined = (this.run.stats.mined || 0) + 1; this.run.stats.ores = (this.run.stats.ores || 0) + this.haul.length; }
    return { items: this.haul.slice(), hpLoss: this.hpLoss };
  }
}

// legacy names (the grid miner of the first design)
export const generateMine = (rng, stage = 0) => buildWall(rng, 7, 6, STAGES[stage].veins.filter(([id]) => MATERIALS[id]), { stage, source: 'vein', oreLuck: 0, qBonus: 0 });
export const MiningRun = MineSession;
