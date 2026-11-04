// Isaac-style floors (docs/REDESIGN.md §7): a grid of rooms joined by doors. Fights are the most
// common room; dead ends hold the treasure room, the workshop, shrines and the boss (the farthest one);
// a secret room hides in a gap touching two or more rooms.
//
//   generateFloor(rng, stage) → { stage, rooms: Map(id → Room), startId, bossId, grid: Map('gx,gy' → id) }
//   Room = { id, gx, gy, type: start|fight|vein|treasure|craft|shrine|secret|boss, size: normal|large|boss,
//            doors: { n, e, s, w: neighbour id | null }, hidden: { dir: true } (door into the secret room,
//            shown as a crack until found), seed, depth (rooms from start), visited, cleared, known }
//   doorState(floor, room, dir) → null | 'open' | 'locked' (room not cleared) | 'boss' | 'secret' | 'found'
//   revealAround(floor, id) — mark the room and its doorway neighbours known (minimap)
//   encounterFor(run, room) → { waves: [[{ id, n, elite?, boss? }]], boss?: id, reward: 'pickup'|'chest'|null }
//   stageRoster(stage, tier) → monster ids that exist in data/monsters.js
import { MONSTERS, actPool, ACT_BOSS } from '../data/monsters.js';
import { STAGES } from '../data/regions.js';

const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const k = (x, y) => x + ',' + y;

export function generateFloor(rng, stage = 0) {
  const target = 10 + Math.min(3, stage) + rng.int(0, 2);
  let rooms, grid, startId;
  for (let attempt = 0; attempt < 40; attempt++) {
    grid = new Map();
    rooms = new Map();
    const add = (gx, gy) => { const id = rooms.size; rooms.set(id, { id, gx, gy }); grid.set(k(gx, gy), id); return id; };
    startId = add(0, 0);
    const frontier = [startId];
    while (rooms.size < target && frontier.length) {
      const from = rooms.get(frontier[rng.int(0, frontier.length - 1)]);
      const [dx, dy] = rng.pick(Object.values(DIRS));
      const nx = from.gx + dx, ny = from.gy + dy;
      if (grid.has(k(nx, ny)) || Math.abs(nx) > 4 || Math.abs(ny) > 3) continue;
      // Isaac rule: a new room may only touch the one it grows from (keeps corridors and dead ends)
      const touching = Object.values(DIRS).filter(([ax, ay]) => grid.has(k(nx + ax, ny + ay))).length;
      if (touching > 1) continue;
      frontier.push(add(nx, ny));
      if (rng.chance(0.15)) frontier.splice(frontier.indexOf(from.id), 1);
      if (!frontier.length) frontier.push(...rooms.keys());
    }
    const deadEnds = [...rooms.values()].filter((r) => r.id !== startId && neighbours(grid, r).length === 1);
    if (rooms.size >= target - 1 && deadEnds.length >= 3) break;
  }
  // depth from start
  const depth = new Map([[startId, 0]]);
  const q = [startId];
  while (q.length) {
    const r = rooms.get(q.shift());
    for (const nid of neighbours(grid, r)) if (!depth.has(nid)) { depth.set(nid, depth.get(r.id) + 1); q.push(nid); }
  }
  for (const r of rooms.values()) {
    r.depth = depth.get(r.id) || 0;
    r.type = 'fight'; r.size = 'normal'; r.hidden = {};
    r.visited = false; r.cleared = false; r.known = false;
    r.seed = rng.int(1, 2 ** 30);
  }
  const start = rooms.get(startId);
  start.type = 'start'; start.cleared = true; start.visited = true;
  // special rooms in dead ends, boss farthest
  const ends = [...rooms.values()].filter((r) => r.id !== startId && neighbours(grid, r).length === 1).sort((a, b) => b.depth - a.depth);
  const boss = ends.shift() || [...rooms.values()].filter((r) => r.id !== startId).sort((a, b) => b.depth - a.depth)[0];
  boss.type = 'boss'; boss.size = 'boss';
  const take = (pred) => { const i = ends.findIndex(pred); return i >= 0 ? ends.splice(i, 1)[0] : null; };
  const anyFight = () => { const c = [...rooms.values()].filter((r) => r.type === 'fight' && r.depth >= 1); return c.length ? rng.pick(c) : null; };
  const place = (type, r) => { if (r) r.type = type; return r; };
  place('treasure', take(() => true) || anyFight());
  place('craft', take(() => true) || anyFight());
  if (rng.chance(0.75)) place('shrine', take(() => true) || anyFight());
  place('vein', take(() => true) || anyFight());
  place('vein', anyFight());
  if (stage >= 1 && rng.chance(0.5)) place('vein', anyFight());
  // big fight rooms
  for (const r of rooms.values()) if (r.type === 'fight' && r.depth >= 2 && rng.chance(0.22)) r.size = 'large';
  // the room before the boss is always a fight
  // secret room: an empty cell touching ≥ 2 rooms (not the boss)
  const cands = [];
  for (const r of rooms.values()) for (const [dx, dy] of Object.values(DIRS)) {
    const x = r.gx + dx, y = r.gy + dy;
    if (grid.has(k(x, y))) continue;
    const touch = Object.values(DIRS).map(([ax, ay]) => grid.get(k(x + ax, y + ay))).filter((id) => id !== undefined);
    if (touch.length >= 2 && !touch.includes(boss.id)) cands.push([x, y, touch.length]);
  }
  if (cands.length) {
    cands.sort((a, b) => b[2] - a[2]);
    const [x, y] = cands[rng.int(0, Math.min(2, cands.length - 1))];
    const id = rooms.size;
    rooms.set(id, { id, gx: x, gy: y, type: 'secret', size: 'normal', hidden: {}, visited: false, cleared: true, known: false, seed: rng.int(1, 2 ** 30), depth: 99 });
    grid.set(k(x, y), id);
  }
  // doors
  for (const r of rooms.values()) {
    r.doors = {};
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const nid = grid.get(k(r.gx + dx, r.gy + dy));
      r.doors[d] = nid === undefined ? null : nid;
      if (nid !== undefined && rooms.get(nid).type === 'secret' && r.type !== 'secret') r.hidden[d] = true;
    }
  }
  const floor = { stage, rooms, startId, bossId: boss.id, grid };
  revealAround(floor, startId);
  return floor;
}

function neighbours(grid, r) {
  return Object.values(DIRS).map(([dx, dy]) => grid.get(k(r.gx + dx, r.gy + dy))).filter((id) => id !== undefined);
}

export function doorState(floor, room, dir) {
  const nid = room.doors[dir];
  if (nid === null || nid === undefined) return null;
  const n = floor.rooms.get(nid);
  if (room.hidden[dir]) return n.visited ? 'found' : 'secret';
  if (room.type === 'secret') return 'open';
  if (!room.cleared) return 'locked';
  if (n.type === 'boss') return 'boss';
  return 'open';
}

/** The secret door was blown open / found. */
export function revealSecret(floor, room, dir) {
  if (room.hidden[dir]) { const n = floor.rooms.get(room.doors[dir]); n.known = true; n.found = true; }
}

export function revealAround(floor, id) {
  const r = floor.rooms.get(id);
  if (!r) return;
  r.known = true;
  for (const [d, nid] of Object.entries(r.doors || {})) if (nid !== null && nid !== undefined && !r.hidden[d]) floor.rooms.get(nid).known = true;
}

export const dirToward = (from, to) => (to.gx > from.gx ? 'e' : to.gx < from.gx ? 'w' : to.gy > from.gy ? 's' : 'n');
export const opposite = (d) => OPP[d];

// ---------------------------------------------------------------- encounters
const NOT_RANDOM = new Set(['mimic', 'morel', 'medusa']);
/** Monster ids for a stage and tier that exist in the roster (the stage's preferred list first). */
export function stageRoster(stage, tier = 'normal') {
  const S = STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))];
  // data/monsters.js decides who lives where (region = stage; −2 = retired); the stage lists only order them
  const pool = (actPool ? actPool(stage, tier) : []).map((m) => (typeof m === 'string' ? m : m.id)).filter((id) => MONSTERS[id] && !NOT_RANDOM.has(id));
  const want = (tier === 'elite' ? S.elites : S.roster).filter((id) => pool.includes(id));
  return [...new Set([...want, ...pool])];
}
export function stageBoss(stage) {
  const S = STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))];
  if (MONSTERS[S.boss]) return S.boss;
  if (ACT_BOSS && MONSTERS[ACT_BOSS[stage]]) return ACT_BOSS[stage];
  return MONSTERS[S.bossFallback] ? S.bossFallback : stageRoster(stage, 'elite')[0];
}
const cost = (id) => { const d = MONSTERS[id]; if (!d) return 1; if (d.tier === 'elite') return 4; return d.hp >= 75 ? 1.6 : d.hp <= 42 ? 0.8 : 1; };

export function encounterFor(run, room) {
  const stage = run ? (run.stage ?? run.act ?? 0) : 0;
  const rng = { next: mulberry(room.seed || 1) };
  const pick = (arr) => arr[Math.floor(rng.next() * arr.length) % arr.length];
  if (room.type === 'boss') { const b = stageBoss(stage); return { waves: [[{ id: b, n: 1, boss: true }]], boss: b, reward: 'chest' }; }
  if (['start', 'treasure', 'craft', 'shrine', 'secret'].includes(room.type)) return { waves: [], reward: room.type === 'secret' ? 'chest' : null };
  const normals = stageRoster(stage, 'normal');
  if (!normals.length) return { waves: [], reward: null };
  if (room.type === 'vein') {
    // a small guard half the time
    if (rng.next() < 0.5) return { waves: [[{ id: pick(normals), n: 1 + (rng.next() < 0.4 ? 1 : 0) }]], reward: null };
    return { waves: [], reward: null };
  }
  let budget = 2.6 + room.depth * 0.55 + stage * 0.9 + (room.size === 'large' ? 2.2 : 0);
  const waves = [];
  const nWaves = room.size === 'large' || (room.depth >= 3 && rng.next() < 0.45) ? 2 : 1;
  const elites = stageRoster(stage, 'elite');
  for (let w = 0; w < nWaves; w++) {
    let b = budget / nWaves + (w ? 0.6 : 0);
    const wave = [];
    if (w === nWaves - 1 && room.depth >= 2 && elites.length && rng.next() < 0.2 + stage * 0.06) { wave.push({ id: pick(elites), n: 1, elite: true }); b -= 4; }
    // 1–3 kinds per wave so rooms feel themed
    const kinds = [pick(normals)];
    if (b > 2.5) kinds.push(pick(normals));
    if (b > 4.5 && rng.next() < 0.5) kinds.push(pick(normals));
    let guard = 0;
    while (b > 0.5 && guard++ < 12) {
      const id = kinds[guard % kinds.length];
      const e = wave.find((x) => x.id === id && !x.elite);
      if (e) e.n++; else wave.push({ id, n: 1 });
      b -= cost(id);
    }
    waves.push(wave);
  }
  return { waves, reward: rng.next() < 0.3 ? 'pickup' : null };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
