// Top-down voxel rooms for the action game (Isaac floors seen through a Hades camera). A room is a
// mossy stone platform with walls and doorways, obstacles written into a collision grid that matches
// the voxels, ore veins, special-room furniture and a deep, detailed backdrop (giant mushrooms, roots,
// spires, ruins and chasms) so the view never ends in a flat void.
//
//   const room = buildRoom(stage, room, { seed, type, doors: { n:'open', e:false, s:'locked', w:'boss' }, size })
//   room.attach(scene); room.setCamera(cam); every frame room.update(dt, t)
//   room.grid.get(tx, tz) → 0 floor | 1 wall | 2 obstacle | 3 pit     (tile 0.5 m, centred on the origin)
//   room.doors.n.setOpen(k)   room.veins[i].setMined(k)   room.openHole(k)   releaseRoom(room) / room.dispose()
//   prebuildRoom(stage, room, opts)   — bake a neighbour in idle time; a later buildRoom() returns it ready
//
// Room space: origin at the room centre, floor surface y = 0, x → east, z → south (toward the camera).
// The camera looks from the south, high up (≈52° pitch); faces that can only be seen from the north or
// from below are never meshed. The core (floor, walls, obstacles) is baked before the first frame; the
// dressing and the backdrop stream in over the next frames (or in idle time when prebuilt).
import * as THREE from 'three';
import { Stage } from './stage_vox.js';
import { S, VWorld, C, glowC, tone, h3, makeLightRig, meshWorld, worldMeshes } from './stage_vox_kit.js';
import { MAT } from './stage_vox_layout.js';
import * as RP from './room_paint.js';
import { fx as rnd } from '../core/rng.js';
import { noise2 } from '../core/math.js';
import { LAYER_FX } from '../gfx/renderer.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TILE = 0.5;
const BIG = 1 << 20;
const BS = S * 3; // backdrop voxel size (0.12 m)
export const ROOM_STYLES = RP.ROOM_STYLES;
export const ROOM_SIZES = { normal: [15, 9], large: [22, 13], boss: [24, 15], chase: [44, 9] };
const rngOf = (seed) => { let s = (Math.abs(Math.floor(seed * 9973)) % 233280) * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

// ---------------------------------------------------------------------------- the collision grid
/** Room collision grid: tile 0.5 m, centred on the origin. 0 floor | 1 wall | 2 obstacle | 3 pit. Off-grid reads 1. */
export class RoomGrid {
  constructor(w, h, tile = TILE) { this.w = w; this.h = h; this.tile = tile; this.cells = new Uint8Array(w * h); }
  get(tx, tz) { return tx < 0 || tz < 0 || tx >= this.w || tz >= this.h ? 1 : this.cells[tz * this.w + tx]; }
  set(tx, tz, v) { if (tx >= 0 && tz >= 0 && tx < this.w && tz < this.h) this.cells[tz * this.w + tx] = v; }
  toTile(x, z) { return [Math.floor(x / this.tile + this.w / 2), Math.floor(z / this.tile + this.h / 2)]; }
  toWorld(tx, tz) { return [(tx + 0.5 - this.w / 2) * this.tile, (tz + 0.5 - this.h / 2) * this.tile]; }
  /** Cell value under a world point. */
  at(x, z) { const [tx, tz] = this.toTile(x, z); return this.get(tx, tz); }
  walkable(tx, tz) { return this.get(tx, tz) === 0; }
  /** World-metre box of a tile. */
  box(tx, tz) { const t = this.tile; return { x0: (tx - this.w / 2) * t, x1: (tx + 1 - this.w / 2) * t, z0: (tz - this.h / 2) * t, z1: (tz + 1 - this.h / 2) * t }; }
}

// ---------------------------------------------------------------------------- layout planning
const KINDS = [
  [['rock', 0.3], ['shroom', 0.36], ['pillar', 0.14], ['roots', 0.12], ['statue', 0.08]],
  [['crystal', 0.38], ['rock', 0.32], ['pillar', 0.3]],
  [['basalt', 0.5], ['rock', 0.2], ['pillar', 0.3]],
  [['hedge', 0.35], ['statue', 0.25], ['pillar', 0.25], ['rock', 0.15]],
];
const PATTERNS = ['scatter', 'quads', 'pillars', 'center', 'lines', 'corners', 'pitPair', 'pitCenter', 'pitRows', 'empty', 'quads', 'scatter'];

function pickW(r, list) { let t = r() * list.reduce((a, b) => a + b[1], 0); for (const [k, w] of list) if ((t -= w) <= 0) return k; return list[0][0]; }

/** Plan a room: grid, obstacles, pits, doors, spawns, veins, anchors (no voxels yet). */
function planRoom(stage, type, size, doors, seed) {
  const r = rngOf(seed + stage * 101 + type.length * 7);
  const [W, D] = ROOM_SIZES[size] || ROOM_SIZES.normal;
  const nx = Math.round(W / TILE), nz = Math.round(D / TILE);
  const grid = new RoomGrid(nx + 2, nz + 2);
  const HW = W / 2, HD = D / 2;
  const iset = (ix, iz, v) => grid.set(ix + 1, iz + 1, v);
  const iget = (ix, iz) => grid.get(ix + 1, iz + 1);
  // the wall ring
  for (let tz = 0; tz < grid.h; tz++) for (let tx = 0; tx < grid.w; tx++) if (tx === 0 || tz === 0 || tx === grid.w - 1 || tz === grid.h - 1) grid.set(tx, tz, 1);
  // door tiles in the ring (4 tiles = 2 m wide)
  const doorTiles = {
    n: [-2, -1, 0, 1].map((d) => [grid.w / 2 + d, 0]), s: [-2, -1, 0, 1].map((d) => [grid.w / 2 + d, grid.h - 1]),
    w: [-2, -1, 0, 1].map((d) => [0, grid.h / 2 + d]), e: [-2, -1, 0, 1].map((d) => [grid.w - 1, grid.h / 2 + d]),
  };
  // keep-clear zones (interior tile rects): in front of each door
  const zones = [];
  const cxT = nx / 2, czT = nz / 2;
  if (doors.n) zones.push({ ix: cxT - 3, iz: 0, tw: 6, th: 3 });
  if (doors.s) zones.push({ ix: cxT - 3, iz: nz - 3, tw: 6, th: 3 });
  if (doors.w) zones.push({ ix: 0, iz: czT - 3, tw: 3, th: 6 });
  if (doors.e) zones.push({ ix: nx - 3, iz: czT - 3, tw: 3, th: 6 });
  const reserve = [];
  if (['start', 'treasure', 'craft', 'shrine', 'secret'].includes(type)) reserve.push({ ix: cxT - 4, iz: czT - 3, tw: 8, th: 6 });
  const hits = (a, b) => a.ix < b.ix + b.tw && a.ix + a.tw > b.ix && a.iz < b.iz + b.th && a.iz + a.th > b.iz;
  const inside = (a) => a.ix >= 0 && a.iz >= 0 && a.ix + a.tw <= nx && a.iz + a.th <= nz;
  const kinds = KINDS[stage] || KINDS[0];
  const kindFor = (tw, th) => {
    for (let k = 0; k < 8; k++) {
      const kd = pickW(r, kinds);
      if (kd === 'statue' && (tw < 2 || th < 2)) continue;
      if (kd === 'roots' && tw < 2 && th < 2) continue;
      if (kd === 'hedge' && tw * th < 2) continue;
      return kd;
    }
    return 'rock';
  };
  let obs = [];
  const add = (ix, iz, tw, th, kind) => { const o = { ix: Math.round(ix), iz: Math.round(iz), tw, th, kind: kind || kindFor(tw, th) }; if (inside(o)) obs.push(o); return o; };
  const mir = (o, mx = true, mz = false) => { const c = { ...o }; if (mx) c.ix = nx - o.ix - o.tw; if (mz) c.iz = nz - o.iz - o.th; if (inside(c)) obs.push(c); };
  let pits = [];
  const pit = (ix, iz, tw, th) => { const p = { ix: Math.round(ix), iz: Math.round(iz), tw, th }; if (inside(p)) pits.push(p); return p; };
  // ---- obstacle pattern
  const scale = nx / 30;
  let pattern = type === 'fight' || type === 'vein' ? PATTERNS[Math.floor(r() * PATTERNS.length)] : type === 'start' ? 'empty' : type === 'boss' ? 'arena' : type === 'chase' ? 'chase' : 'scatter';
  if (stage === 2 && pattern.startsWith('pit') && r() < 0.5) pattern = 'quads';
  if (pattern === 'scatter') {
    const n = Math.round((type === 'fight' ? 5 : 3) * scale + r() * 3);
    for (let k = 0; k < n; k++) { const big = r() < 0.45; const o = add(2 + r() * (nx / 2 - 5), 2 + r() * (nz - 6), big ? 2 : 1, big ? 2 : 1); if (r() < 0.6) mir(o, true, r() < 0.3); }
  } else if (pattern === 'quads') {
    const tw = 2 + (r() < 0.4 ? 1 : 0), th = 2;
    const o = add(nx * (0.2 + r() * 0.08), nz * (0.22 + r() * 0.06), tw, th); mir(o); mir(o, false, true); mir(o, true, true);
  } else if (pattern === 'pillars') {
    const k = r() < 0.5 ? 1 : 2;
    for (let ix = 5; ix < nx / 2 - 2; ix += Math.round(5 + r() * 2)) { const a = add(ix, Math.round(nz * 0.28), k, k, 'pillar'); mir(a); const b = add(ix, Math.round(nz * 0.72 - k), k, k, 'pillar'); mir(b); }
  } else if (pattern === 'center') {
    const tw = 2 + Math.floor(r() * 3), th = 2 + Math.floor(r() * 2);
    add(cxT - tw / 2, czT - th / 2, tw, th);
    const o = add(nx * 0.18, czT - 1, 2, 2); mir(o);
  } else if (pattern === 'lines') {
    const len = Math.round(5 + r() * 4 * scale);
    add(nx * 0.18, Math.round(nz * 0.34), len, 1); add(nx * 0.82 - len, Math.round(nz * 0.66), len, 1);
    if (r() < 0.5) { add(nx * 0.82 - len, Math.round(nz * 0.34), len, 1); add(nx * 0.18, Math.round(nz * 0.66), len, 1); }
  } else if (pattern === 'corners') {
    const a = add(2, 2, 3, 1); mir(a); mir(a, false, true); mir(a, true, true);
    const b = add(2, 3, 1, 2); mir(b); mir(b, false, true); mir(b, true, true);
  } else if (pattern === 'pitPair') {
    const p = pit(nx * 0.18, czT - 2, 4 + Math.floor(r() * 2), 4); pits.push({ ...p, ix: nx - p.ix - p.tw });
  } else if (pattern === 'pitCenter') {
    const tw = Math.round(nx * 0.3), th = Math.round(nz * 0.36);
    const a = pit(cxT - tw / 2, czT - th / 2, tw / 2 - 1, th); pit(cxT + 1, czT - th / 2, tw / 2 - 1, th); // a 2-tile bridge down the middle
    void a;
  } else if (pattern === 'pitRows') {
    const p = pit(nx * 0.22, Math.round(nz * 0.3), Math.round(nx * 0.18), 1); pits.push({ ...p, ix: nx - p.ix - p.tw });
    const q = pit(nx * 0.22, Math.round(nz * 0.7), Math.round(nx * 0.18), 1); pits.push({ ...q, ix: nx - q.ix - q.tw });
  } else if (pattern === 'empty') {
    const o = add(2, 2, 2, 2); if (r() < 0.6) mir(o, true, true);
  }
  // ---- special furniture & veins
  const special = [];
  const veins = [];
  const centre = (tw, th, dz = 0) => ({ ix: cxT - tw / 2, iz: Math.round(czT - th / 2 + dz), tw, th });
  if (type === 'treasure') special.push({ ...centre(2, 2), kind: 'pedestal' });
  if (type === 'craft') special.push({ ...centre(4, 2, -1), kind: 'bench' });
  if (type === 'shrine') special.push({ ...centre(2, 2, -2), kind: 'shrine' });
  if (type === 'secret') special.push({ ...centre(2, 1, 0), kind: 'chest' });
  const veinCount = type === 'vein' ? 2 + (r() < 0.5 ? 1 : 0) : type === 'fight' && r() < 0.3 ? 1 : 0;
  // obstacles must stay out of door zones and reserved areas
  const blockers = [...zones, ...reserve, ...special];
  obs = obs.filter((o) => !blockers.some((z) => hits(o, z)));
  pits = pits.filter((p) => !blockers.some((z) => hits(p, z)));
  for (let k = 0, tries = 0; k < veinCount && tries < 60; tries++) {
    const nearWall = type === 'fight' || r() < 0.5;
    const ix = nearWall ? (r() < 0.5 ? 1 + Math.floor(r() * 3) : nx - 3 - Math.floor(r() * 3)) : 3 + Math.floor(r() * (nx - 8));
    const iz = 1 + Math.floor(r() * (nz - 3));
    const v = { ix, iz, tw: 2, th: 2, kind: 'ore' };
    if (!inside(v) || [...blockers, ...obs, ...pits, ...veins].some((z) => hits({ ix: v.ix - 1, iz: v.iz - 1, tw: 4, th: 4 }, z))) continue;
    veins.push(v); k++;
  }
  // ---- boss arena: an oval of floor; the corners are a thicket of giant stalks and roots
  const thicket = [];
  if (type === 'boss') {
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const dx = (ix + 0.5 - cxT) / (nx * 0.5), dz = (iz + 0.5 - czT) / (nz * 0.5);
      const doorClear = zones.some((z) => hits({ ix, iz, tw: 1, th: 1 }, z));
      if (dx * dx + dz * dz > 1.02 && !doorClear) thicket.push([ix, iz]);
    }
    obs = [];
  }
  // ---- the tutorial chase strip (a long room running east)
  const tut = {};
  if (type === 'chase') {
    obs = []; pits = [];
    const X = (x) => Math.round(x / TILE + nx / 2), Zi = (z) => Math.round(z / TILE + nz / 2);
    pits.push({ ix: X(-8.5), iz: 0, tw: 3, th: nz });                 // the gap to dash across
    obs.push({ ix: X(-15), iz: Zi(-3.5), tw: 2, th: 2, kind: 'shroom' }, { ix: X(-13), iz: Zi(2.5), tw: 2, th: 1, kind: 'rock' });
    obs.push({ ix: X(-3), iz: 0, tw: 2, th: 1, kind: 'rock' }, { ix: X(3), iz: nz - 1, tw: 2, th: 1, kind: 'roots' }, { ix: X(8), iz: 0, tw: 1, th: 1, kind: 'pillar' });
    obs.push({ ix: X(15.5), iz: 0, tw: 2, th: 1, kind: 'shroom' }, { ix: X(18), iz: nz - 2, tw: 2, th: 2, kind: 'rock' });
    veins.push({ ix: X(5), iz: Zi(-3), tw: 2, th: 2, kind: 'ore' });
    special.push({ ix: X(11), iz: Zi(-3), tw: 4, th: 2, kind: 'bench' });
    tut.start = V(-20.5, 0, 0); tut.ring = V(-14, 0, 0); tut.morel = V(-13.2, 0, -0.9);
    tut.gap = { x0: -8.5, x1: -7, z0: -4.5, z1: 4.5 };
    tut.dummies = [V(-1, 0, -1.4), V(1.6, 0, 1.3)];
    tut.wave = V(17, 0, 0); tut.hole = V(20.8, 0, 0); tut.stoneSpot = V(19.6, 0, 1.2);
  }
  // ---- write the grid
  for (const p of pits) for (let iz = p.iz; iz < p.iz + p.th; iz++) for (let ix = p.ix; ix < p.ix + p.tw; ix++) iset(ix, iz, 3);
  for (const o of [...obs, ...special, ...veins]) for (let iz = o.iz; iz < o.iz + o.th; iz++) for (let ix = o.ix; ix < o.ix + o.tw; ix++) iset(ix, iz, 2);
  for (const [ix, iz] of thicket) iset(ix, iz, 2);
  // ---- connectivity: every door and the centre must be reachable; drop obstacles until they are
  const reach = () => {
    const seen = new Uint8Array(nx * nz), q = [];
    const startT = [Math.floor(cxT), Math.floor(czT)];
    let s0 = iget(startT[0], startT[1]) === 0 ? startT : null;
    if (!s0) for (let k = 0; k < nx * nz && !s0; k++) { const ix = k % nx, iz = (k / nx) | 0; if (iget(ix, iz) === 0) s0 = [ix, iz]; }
    if (!s0) return { ok: false, seen };
    q.push(s0); seen[s0[1] * nx + s0[0]] = 1;
    while (q.length) { const [ix, iz] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = ix + dx, b = iz + dz; if (a < 0 || b < 0 || a >= nx || b >= nz || seen[b * nx + a] || iget(a, b) !== 0) continue; seen[b * nx + a] = 1; q.push([a, b]); } }
    const doorIn = { n: [cxT, 0], s: [cxT, nz - 1], w: [0, czT], e: [nx - 1, czT] };
    let ok = true;
    for (const d of ['n', 's', 'e', 'w']) if (doors[d]) { const [a, b] = doorIn[d]; if (!seen[b * nx + a] && !seen[b * nx + a - (d === 'n' || d === 's' ? 1 : 0)]) ok = false; }
    let free = 0, got = 0;
    for (let k = 0; k < nx * nz; k++) { if (iget(k % nx, (k / nx) | 0) === 0) { free++; if (seen[k]) got++; } }
    if (got < free * 0.92) ok = false;
    return { ok, seen };
  };
  if (type !== 'chase') for (let guard = 0; guard < 20; guard++) {
    const R = reach();
    if (R.ok) break;
    if (pits.length && (guard & 1)) { const p = pits.splice(Math.floor(r() * pits.length), 1)[0]; for (let iz = p.iz; iz < p.iz + p.th; iz++) for (let ix = p.ix; ix < p.ix + p.tw; ix++) iset(ix, iz, 0); }
    else if (obs.length) { const o = obs.splice(Math.floor(r() * obs.length), 1)[0]; for (let iz = o.iz; iz < o.iz + o.th; iz++) for (let ix = o.ix; ix < o.ix + o.tw; ix++) iset(ix, iz, 0); }
    else break;
  }
  // ---- spawn points: reachable floor away from doors, spread out (farthest-point sampling)
  const R = reach();
  const cand = [];
  for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
    if (iget(ix, iz) !== 0 || (type !== 'chase' && !R.seen[iz * nx + ix])) continue;
    if (zones.some((z) => hits({ ix: ix - 1, iz: iz - 1, tw: 3, th: 3 }, z))) continue;
    cand.push([ix, iz]);
  }
  const spawns = [];
  if (cand.length) {
    spawns.push(cand[Math.floor(r() * cand.length)]);
    while (spawns.length < Math.min(24, cand.length)) {
      let best = null, bd = -1;
      for (let k = 0; k < cand.length; k += 1) { const c = cand[k]; let d = 1e9; for (const s of spawns) d = Math.min(d, (c[0] - s[0]) ** 2 + (c[1] - s[1]) ** 2); d += r() * 2; if (d > bd) { bd = d; best = c; } }
      if (!best || bd < 4) break;
      spawns.push(best);
    }
  }
  const toBox = (o) => ({ x0: (o.ix - nx / 2) * TILE, x1: (o.ix + o.tw - nx / 2) * TILE, z0: (o.iz - nz / 2) * TILE, z1: (o.iz + o.th - nz / 2) * TILE });
  return {
    W, D, HW, HD, nx, nz, grid, doorTiles, zones, obs: obs.map((o) => ({ ...o, b: toBox(o) })), special: special.map((o) => ({ ...o, b: toBox(o) })),
    veins: veins.map((o) => ({ ...o, b: toBox(o) })), pits: pits.map((o) => ({ ...o, b: toBox(o) })), thicket, tut,
    spawns: spawns.map(([ix, iz]) => { const [x, z] = grid.toWorld(ix + 1, iz + 1); return { x, z }; }), pattern, r,
  };
}

// ---------------------------------------------------------------------------- dressing plan
function planDressing(pl, stage, type, doors) {
  const { r, HW, HD, grid } = pl;
  const foot = [], floor = [], face = [], drapes = [], tops = [], torches = [], lamps = [];
  const nearDoorN = (x) => doors.n && Math.abs(x) < 1.5, nearDoorS = (x) => doors.s && Math.abs(x) < 1.5, nearDoorEW = (z, side) => doors[side] && Math.abs(z) < 1.5;
  // wall foot (inside, along the north and side walls)
  for (let x = -HW + 0.4; x < HW - 0.3; x += 0.55 + r() * 0.7) if (!nearDoorN(x) && r() < 0.7) foot.push({ x, z: -HD + 0.22, k: r(), k2: r() });
  for (const side of [-1, 1]) for (let z = -HD + 0.5; z < HD - 0.4; z += 0.6 + r() * 0.8) if (!nearDoorEW(z, side < 0 ? 'w' : 'e') && r() < 0.6) foot.push({ x: side * (HW - 0.22), z, k: r(), k2: r() });
  for (let x = -HW + 0.4; x < HW - 0.3; x += 1 + r() * 1.4) if (!nearDoorS(x) && r() < 0.35) foot.push({ x, z: HD - 0.2, k: 0.5 + r() * 0.3, k2: r() });
  const free = (x, z) => { const v = grid.at(x, z); return v === 0; };
  // open floor
  const kinds = stage === 0 ? [['spores', 0.3], ['shrooms', 0.28], ['roots', 0.16], ['pebbles', 0.12], ['puddle', 0.1], ['crack', 0.04]]
    : stage === 1 ? [['puddle', 0.35], ['pebbles', 0.3], ['crack', 0.15], ['shrooms', 0.2]]
      : stage === 2 ? [['crack', 0.45], ['pebbles', 0.4], ['spores', 0.15]] : [['pebbles', 0.3], ['shrooms', 0.2], ['roots', 0.2], ['puddle', 0.3]];
  const nFloor = Math.round(pl.W * pl.D / (stage === 0 ? 5 : 7));
  for (let k = 0; k < nFloor; k++) { const x = (r() - 0.5) * (pl.W - 1.2), z = (r() - 0.5) * (pl.D - 1.2); if (free(x, z)) floor.push({ x, z, kind: pickW(r, kinds) }); }
  // north wall face: shelf fungi (stage 0/3), torches flanking the doorway, drapes from the top
  const yTop = 2.3;
  for (let x = -HW + 0.6; x < HW - 0.5; x += 1.4 + r() * 1.8) {
    if (nearDoorN(x) || Math.abs(x) < 1.4) continue;
    if (stage === 0 || stage === 3 ? r() < 0.55 : r() < 0.25) { const y = 0.6 + r() * 1.2, ci = Math.floor(r() * 4); face.push({ kind: 'fungus', x, y, ci, rr: 5 + Math.floor(r() * 4) }); lamps.push({ x, y: y + 0.1, z: -HD + 0.3, c: (RP.ROOM_STYLES[stage].gills || ['#7affd8'])[ci % (RP.ROOM_STYLES[stage].gills || [1]).length], r: 2.2, i: 0.9 }); }
  }
  const tx = doors.n ? [-1.7, 1.7] : [-HW * 0.45, HW * 0.45];
  for (const x of tx) torches.push({ x, y: 1.45, z: -HD + 0.08, nx: 0, nz: 1 });
  if (pl.W > 16) for (const x of [-HW * 0.72, HW * 0.72]) torches.push({ x, y: 1.45, z: -HD + 0.08, nx: 0, nz: 1 });
  for (let x = -HW + 0.3; x < HW; x += 0.5 + r() * 1.3) if (!(doors.n && Math.abs(x) < 1.3) && r() < 0.55) drapes.push({ x, len: 10 + Math.floor(r() * 30), glow: stage === 0 && r() < 0.25 ? '#7affd8' : null });
  // wall tops: big mushrooms (stage 0/3) or crystals growing on the north wall crown and towers
  for (let x = -HW + 1; x < HW - 0.8; x += 2.2 + r() * 2.5) if (!(doors.n && Math.abs(x) < 1.6) && r() < 0.6) tops.push({ x, z: -HD - 0.25, y: yTop, h: 10 + Math.floor(r() * 14), cap: 8 + Math.floor(r() * 8), ci: Math.floor(r() * 4) });
  for (const sx of [-1, 1]) tops.push({ x: sx * (HW + 0.25), z: -HD - 0.25, y: yTop + 0.6, h: 18 + Math.floor(r() * 10), cap: 14 + Math.floor(r() * 6), ci: Math.floor(r() * 4) });
  return { foot, floor, face, drapes, tops, torches, lamps };
}

// ---------------------------------------------------------------------------- backdrop plan (coarse units)
function planBackdrop(pl, stage, type) {
  const { r, HW, HD } = pl, A = RP.ROOM_STYLES[stage];
  const items = [], lamps = [], u = (m) => Math.round(m / BS);
  const kind = A.backdrop;
  const stemBase = (top, deep) => Math.max(deep, top - 7); // stems vanish into the fog well before their roots
  // north band: tall things rising above the north wall
  for (let x = -HW - 6; x < HW + 6; x += 3.4 + r() * 3.2) {
    const z = -HD - 1.8 - r() * 6.5, top = 3.2 + r() * 5.5;
    if (kind === 'mushrooms' || (kind === 'ruins' && r() < 0.35)) items.push({ t: 'mush', x, z, base: stemBase(top, -9), top, cap: 1.2 + r() * 1.8, ci: Math.floor(r() * 4), seed: Math.floor(r() * 999) });
    else if (kind === 'crystals') items.push({ t: 'spire', x, z, base: stemBase(top, -9), top: top * 0.8, rr: 0.5 + r() * 0.5, glow: r() < 0.6, seed: Math.floor(r() * 999) });
    else if (kind === 'lava') items.push(r() < 0.5 ? { t: 'ash', x, z, base: -2.5, top, seed: Math.floor(r() * 999) } : { t: 'spire', x, z, base: stemBase(top, -9), top: top * 0.7, rr: 0.6 + r() * 0.6, seed: Math.floor(r() * 999) });
    else items.push({ t: 'ruin', x, z, base: stemBase(top, -6), top: top * 0.8, span: 2 + r() * 2.5, seed: Math.floor(r() * 999) });
  }
  // far layer (fogged, coarser voxels): big shapes
  for (let x = -HW - 9; x < HW + 9; x += 6 + r() * 5) {
    const z = -HD - 11 - r() * 7, top = 6 + r() * 6;
    if (kind === 'mushrooms') items.push({ t: 'mush', far: true, x, z, base: top - 8, top, cap: 2.6 + r() * 2.2, ci: Math.floor(r() * 4), seed: Math.floor(r() * 999) });
    else items.push({ t: 'spire', far: true, x, z, base: top - 9, top: top * 0.8, rr: 1 + r() * 0.8, glow: kind === 'crystals', seed: Math.floor(r() * 999) });
  }
  // hanging root curtains / chains high above the back
  for (let x = -HW - 3; x < HW + 3; x += 2.4 + r() * 3) if (r() < 0.55) items.push({ t: kind === 'lava' ? 'chain' : 'roots', x, z: -HD - 2.5 - r() * 5, top: 11 + r() * 3, len: 3 + r() * 4, seed: Math.floor(r() * 999) });
  // sides: deep down in the abyss near the room, rising a little further out (never over the floor)
  for (const side of [-1, 1]) for (let z = -HD - 1; z < HD + 3; z += 2.6 + r() * 2.6) {
    const off = 1.6 + r() * 5.5, x = side * (HW + off), top = -2.6 + (off - 1.6) * 0.7 - (z > 0 ? 1 : 0);
    if (kind === 'mushrooms') items.push({ t: 'mush', x, z, base: stemBase(top, -12), top, cap: 0.9 + r() * 1.3, ci: Math.floor(r() * 4), seed: Math.floor(r() * 999) });
    else items.push({ t: 'spire', x, z, base: stemBase(top, -12), top, rr: 0.5 + r() * 0.5, glow: kind === 'crystals' && r() < 0.5, seed: Math.floor(r() * 999) });
  }
  // the abyss below the south edge: caps glowing far down
  for (let x = -HW - 4; x < HW + 4; x += 2.6 + r() * 2.8) {
    const z = HD + 1.5 + r() * 4.5, top = -2 - r() * 4;
    if (kind === 'mushrooms') items.push({ t: 'mush', x, z, base: stemBase(top, -14), top, cap: 1 + r() * 1.5, ci: Math.floor(r() * 4), seed: Math.floor(r() * 999) });
    else items.push({ t: 'spire', x, z, base: stemBase(top, -14), top, rr: 0.5 + r() * 0.5, glow: kind === 'crystals', seed: Math.floor(r() * 999) });
  }
  for (const it of items) if (it.t === 'mush' && !it.far) lamps.push({ x: it.x, y: it.top, z: it.z, c: (A.gills || ['#7affd8'])[it.ci % (A.gills || [1]).length], r: 3 + it.cap, i: 0.8 });
  return { items, lamps, A, u };
}

// ---------------------------------------------------------------------------- baking
export const BAKE_STATS = { paint: 0, mesh: 0, chunks: 0 };
function bakeUnit(ops, box, scale, rig, glowK, skip) {
  // box: { x0, x1, z0, z1 } in voxel units of `scale`
  const t0 = performance.now();
  const w = new VWorld({ x0: box.x0 - 2, x1: box.x1 + 2, y0: -BIG, y1: BIG, z0: box.z0 - 2, z1: box.z1 + 2 });
  for (const op of ops) if (op.x1 >= box.x0 - 2 && op.x0 <= box.x1 + 2 && op.z1 >= box.z0 - 2 && op.z0 <= box.z1 + 2) op.fn(w);
  const t1 = performance.now(); BAKE_STATS.paint += t1 - t0; BAKE_STATS.chunks += w.chunks.size;
  if (!w.chunks.size) return null;
  const res = meshWorld(w, { light: rig, scale, bounds: { x0: box.x0, x1: box.x1, y0: -BIG, y1: BIG, z0: box.z0, z1: box.z1 }, skip, bottomAbove: -1e9 });
  BAKE_STATS.mesh += performance.now() - t1;
  if (!res.faces) return null;
  const g = worldMeshes(res, glowK);
  for (const m of g.children) { m.matrixAutoUpdate = false; m.updateMatrix(); }
  return { g, faces: res.faces };
}
/** A small separately-meshed voxel model (gates, ore nuggets, holes) painted around its own origin. */
function bakeModel(fn, rig, glowK = 1.6) {
  const w = new VWorld();
  fn(w);
  const res = meshWorld(w, { light: rig, skip: new Set(['2,-1', '1,-1']), bottomAbove: -1e9 });
  const g = worldMeshes(res, glowK);
  g.userData.faces = res.faces;
  return g;
}
const SKIP = new Set(['2,-1', '1,-1']); // never seen from a camera high in the south

// ---------------------------------------------------------------------------- build
const cache = new Map(); // key → Room (prebuilt or released for a revisit)
const CACHE_MAX = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 3 : 8;
const sig = (doors) => ['n', 'e', 's', 'w'].map((d) => doors[d] || '-').join(',');
/** Normalise buildRoom's arguments. */
function norm(stage, room = {}, opts = {}) {
  const type = opts.type || room.type || 'fight';
  const size = opts.size || (type === 'boss' ? 'boss' : type === 'chase' ? 'chase' : 'normal');
  let doors = opts.doors;
  if (!doors) { doors = {}; for (const d of ['n', 'e', 's', 'w']) doors[d] = room.doors && room.doors[d] != null ? 'open' : false; }
  if (type === 'chase' && !opts.doors) doors = { n: false, e: false, s: false, w: 'open' };
  const seed = opts.seed ?? room.seed ?? 1;
  stage = Math.max(0, Math.min(3, stage | 0));
  return { stage, type, size, doors, seed, key: `${stage}|${type}|${size}|${seed}|${sig(doors)}`, opts };
}
export function roomKey(stage, room, opts) { return norm(stage, room, opts).key; }

/** Build (or fetch a prebuilt) room. The core is ready on return; dressing and backdrop stream in update(). */
export function buildRoom(stage = 0, room = {}, opts = {}) {
  const n = norm(stage, room, opts);
  let R = cache.get(n.key);
  if (R && !R.disposed) { cache.delete(n.key); R.finishCore(); R.active = true; return R; }
  R = makeRoom(n);
  R.finishCore();
  R.active = true;
  return R;
}
/** Start baking a room in idle time (neighbours); buildRoom with the same arguments returns it. */
export function prebuildRoom(stage = 0, room = {}, opts = {}) {
  const n = norm(stage, room, opts);
  if (cache.has(n.key)) return cache.get(n.key);
  const R = makeRoom(n);
  remember(n.key, R);
  pump();
  return R;
}
/** Hand a room back after leaving it: it stays cached (geometry kept) for a quick revisit. */
export function releaseRoom(R) {
  if (!R || R.disposed) return;
  R.active = false;
  R.group.parent && R.group.parent.remove(R.group);
  remember(R.key, R);
}
function remember(key, R) {
  cache.set(key, R);
  while (cache.size > CACHE_MAX) {
    const [k, old] = cache.entries().next().value;
    cache.delete(k);
    if (!old.active) old.dispose();
  }
}
// idle-time baking of prebuilt rooms
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (f) => setTimeout(() => { const end = performance.now() + 6; f({ timeRemaining: () => Math.max(0, end - performance.now()) }); }, 40);
  const step = (dl) => {
    const pending = [...cache.values()].filter((R) => !R.disposed && !R.active && !R.done());
    if (!pending.length) { pumping = false; return; }
    for (const R of pending) { while (dl.timeRemaining() > 3 && !R.done()) R.bakeNext(); if (dl.timeRemaining() <= 3) break; }
    idle(step);
  };
  idle(step);
}

function makeRoom(n) {
  const { stage, type, size, doors, seed } = n;
  const t0 = performance.now();
  const A = RP.ROOM_STYLES[stage];
  const pl = planRoom(stage, type, size, doors, seed);
  const dr = planDressing(pl, stage, type, doors);
  const bd = planBackdrop(pl, stage, type);
  const { HW, HD, grid } = pl;
  const st = new Stage('room', stage, A);
  st.fog.density = A.fogD; st.fogDensity = A.fogD;
  st.background = new THREE.Color(A.bg);
  st.fog.color = new THREE.Color(A.fog);
  // ---- light rig for the bake: shelf fungi, mushroom clumps, torches, the backdrop's glowing caps
  const lamps = [...dr.lamps];
  for (const t of dr.torches) lamps.push({ x: t.x, y: t.y + 0.2, z: t.z + 0.3, c: A.lamp, r: 4.6, i: 1.6 });
  for (const o of pl.obs) if (o.kind === 'shroom' || o.kind === 'crystal') lamps.push({ x: (o.b.x0 + o.b.x1) / 2, y: 0.9, z: (o.b.z0 + o.b.z1) / 2 + 0.2, c: (A.gills || [A.glow])[(seed + o.ix) % (A.gills || [1]).length], r: 2.4, i: 0.85 });
  for (const s of pl.special) lamps.push({ x: (s.b.x0 + s.b.x1) / 2, y: 1, z: (s.b.z0 + s.b.z1) / 2 + 0.3, c: s.kind === 'bench' ? '#ffd27a' : A.glow, r: 3, i: 1 });
  for (const v of pl.veins) lamps.push({ x: (v.b.x0 + v.b.x1) / 2, y: 0.8, z: (v.b.z0 + v.b.z1) / 2 + 0.3, c: A.oreGlow || '#fff0b0', r: 1.8, i: 0.7 });
  if (type === 'boss') lamps.push({ x: 0, y: 1.2, z: 0, c: A.glow, r: 6, i: 0.8 });
  const rig = makeLightRig({ amb: A.amb, ambI: 0.56, sky: A.sky, skyI: 0.24, key: A.key, keyI: 0.26, keyDir: [-0.35, 1, 0.45], lamps: lamps.map((l) => ({ ...l, i: l.i * 1.7, r: l.r * 1.15 })), bands: 22 });
  const rigBack = makeLightRig({ amb: A.amb, ambI: 0.55, sky: A.sky, skyI: 0.25, key: A.key, keyI: 0.15, keyDir: [-0.35, 1, 0.45], lamps: bd.lamps, bands: 18 });
  // ---- paint ops (voxel AABBs). core: floor, walls, obstacles; dressing; backdrop (coarse)
  const vb = (x0, x1, z0, z1, sc = S) => ({ x0: Math.floor(x0 / sc) - 2, x1: Math.ceil(x1 / sc) + 2, z0: Math.floor(z0 / sc) - 2, z1: Math.ceil(z1 / sc) + 2 });
  // pit side walls: thin strips inside pit tiles along edges with floor
  const pitEdges = [];
  for (let tz = 0; tz < grid.h; tz++) for (let tx = 0; tx < grid.w; tx++) {
    if (grid.get(tx, tz) !== 3) continue;
    const b = grid.box(tx, tz), e = 0.08;
    if (grid.get(tx, tz - 1) !== 3) pitEdges.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z0 + e });
    if (grid.get(tx, tz + 1) !== 3) pitEdges.push({ x0: b.x0, x1: b.x1, z0: b.z1 - e, z1: b.z1 });
    if (grid.get(tx - 1, tz) !== 3) pitEdges.push({ x0: b.x0, x1: b.x0 + e, z0: b.z0, z1: b.z1 });
    if (grid.get(tx + 1, tz) !== 3) pitEdges.push({ x0: b.x1 - e, x1: b.x1, z0: b.z0, z1: b.z1 });
  }
  const ctx = { A, stage, grid, HW, HD, W: pl.W, D: pl.D, doors, kind: type, pitEdges, matAt: stage === 1 ? null : null };
  const core = [], dress = [], back = [];
  core.push({ ...vb(-HW, HW, -HD, HD), fn: (w) => RP.paintFloor(w, ctx) });
  core.push({ ...vb(-HW - 2.4, HW + 2.4, -HD - 2, HD + 2), fn: (w) => RP.paintWalls(w, ctx) });
  const OB = { rock: RP.rockObstacle, shroom: RP.shroomObstacle, pillar: RP.pillarObstacle, roots: RP.rootObstacle, statue: RP.statueObstacle, crystal: RP.crystalObstacle, basalt: RP.basaltObstacle, hedge: RP.hedgeObstacle, pedestal: RP.pedestal, bench: RP.workbench, shrine: RP.shrine, chest: RP.oldChest, ore: RP.oreBoulderBase };
  let k = 0;
  for (const o of [...pl.obs, ...pl.special, ...pl.veins]) { const sd = seed * 31 + (k++) * 7; const pad = o.kind === 'shroom' || o.kind === 'shrine' ? 0.9 : 0.3; core.push({ ...vb(o.b.x0 - pad, o.b.x1 + pad, o.b.z0 - pad, o.b.z1 + pad), fn: (w) => (OB[o.kind] || RP.rockObstacle)(w, A, o.b, sd) }); }
  // boss-arena thicket: dense stalks & roots on every thicket tile, giant mushrooms rising out of it
  if (pl.thicket.length) {
    const tiles = pl.thicket.map(([ix, iz]) => grid.box(ix + 1, iz + 1));
    core.push({ ...vb(-HW, HW, -HD, HD), fn: (w) => { for (const b of tiles) thicketTile(w, A, b, seed); } });
    for (let q = 0; q < 14; q++) { const b = tiles[Math.floor(rngOf(seed + q)() * tiles.length)]; const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2; core.push({ ...vb(x - 1.4, x + 1.4, z - 1.4, z + 1.4), fn: (w) => RP.bigMushroom(w, A, Math.round(x / S), 6, Math.round(z / S), 22 + (q % 4) * 9, 18 + (q % 3) * 6, q % 4, seed + q) }); }
    core.push({ ...vb(-2, 2, -HD + 0.2, -HD + 3), fn: (w) => RP.bossThrone(w, A, { x0: -0.9, x1: 0.9, z0: -HD + 0.6, z1: -HD + 2.2 }, seed) });
  }
  // tutorial strip: Morel's ring of little glowing caps
  if (type === 'chase' && pl.tut.ring) {
    const c = pl.tut.ring;
    dress.push({ ...vb(c.x - 1.6, c.x + 1.6, c.z - 1.6, c.z + 1.6), fn: (w) => { for (let q = 0; q < 14; q++) { const a = q / 14 * Math.PI * 2; RP.smallMushroom(w, A, Math.round((c.x + Math.cos(a) * 1.25) / S), 0, Math.round((c.z + Math.sin(a) * 1.25) / S), 5 + (q % 3) * 2, q % 4, q); } } });
  }
  // boss arena: a fairy ring around the middle
  if (type === 'boss') dress.push({ ...vb(-5, 5, -4, 4), fn: (w) => { for (let q = 0; q < 26; q++) { const a = q / 26 * Math.PI * 2; RP.smallMushroom(w, A, Math.round(Math.cos(a) * 4.2 / S), 0, Math.round(Math.sin(a) * 2.8 / S), 4 + (q % 3) * 2, q % 4, q); } } });
  dress.push({ ...vb(-HW, HW, -HD, HD), fn: (w) => RP.wallFootDressing(w, ctx, dr.foot) });
  dress.push({ ...vb(-HW, HW, -HD, HD), fn: (w) => RP.floorDressing(w, ctx, dr.floor) });
  dress.push({ ...vb(-HW, HW, -HD - 0.6, -HD + 0.6), fn: (w) => {
    for (const f of dr.face) RP.shelfFungus(w, A, Math.round(f.x / S), Math.round(f.y / S), Math.round(-HD / S), f.rr, f.ci, Math.round(f.x * 13));
    for (const t of dr.torches) RP.torchSconce(w, Math.round(t.x / S), Math.round(t.y / S), Math.round(t.z / S) + 1, t.nx, t.nz);
    for (const d of dr.drapes) RP.drapes(w, A, Math.round(d.x / S), Math.round(2.3 / S), Math.round(-HD / S), d.len, Math.round(d.x * 17), d.glow);
  } });
  for (const t of dr.tops) dress.push({ ...vb(t.x - 1, t.x + 1, t.z - 1, t.z + 1), fn: (w) => (stage === 1 ? null : RP.bigMushroom(w, A, Math.round(t.x / S), Math.round(t.y / S), Math.round(t.z / S), t.h, t.cap, t.ci, Math.round(t.x * 7))) });
  // backdrop (coarse units)
  for (const it of bd.items) {
    const sc = it.far ? BS * 2 : BS, u = (m) => Math.round(m / sc);
    const x = u(it.x), z = u(it.z);
    const box = { x0: x - 40, x1: x + 40, z0: z - 40, z1: z + 40, far: it.far };
    if (it.t === 'mush') back.push({ ...box, fn: (w) => RP.giantMushroom(w, A, x, u(it.base), z, u(it.top - it.base), u(it.cap), it.ci, it.seed) });
    else if (it.t === 'spire') back.push({ ...box, fn: (w) => { RP.spire(w, A, x, u(it.base), z, u(it.top - it.base), u(it.rr), it.seed, stage !== 1); if (it.glow) for (let q = 0; q < 3; q++) glowShard(w, x + q * 2 - 2, u(it.top) - q * 3, z, u(it.rr) * 0.6, A.crystal); } });
    else if (it.t === 'ash') back.push({ ...box, fn: (w) => ashTreeCoarse(w, A, x, u(it.base), z, u(it.top - it.base), it.seed) });
    else if (it.t === 'ruin') back.push({ ...box, fn: (w) => RP.ruinArch(w, A, x, u(it.base), z, u(it.span), u(it.top - it.base), it.seed) });
    else if (it.t === 'roots') back.push({ ...box, fn: (w) => RP.rootCurtain(w, A, x, u(it.top), z, 12, u(it.len), it.seed, stage === 0 && it.seed % 3 === 0 ? '#7affd8' : null) });
    else if (it.t === 'chain') back.push({ ...box, fn: (w) => { for (let s = 0; s < u(it.len); s++) w.set(x, u(it.top) - s, z, s % 2 ? C('#3e3a4c') : C('#5e5a70')); } });
  }
  // ---- bake scheduling: units of 64 voxels (fine) / 64 coarse units (backdrop)
  const TS = 64;
  const units = (ops, scale, tag) => {
    if (!ops.length) return [];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const o of ops) { x0 = Math.min(x0, o.x0); x1 = Math.max(x1, o.x1); z0 = Math.min(z0, o.z0); z1 = Math.max(z1, o.z1); }
    const out = [];
    for (let tz = Math.floor(z0 / TS); tz <= Math.floor(z1 / TS); tz++) for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) {
      const box = { x0: tx * TS, x1: tx * TS + TS, z0: tz * TS, z1: tz * TS + TS };
      const mine = ops.filter((o) => o.x1 >= box.x0 - 2 && o.x0 <= box.x1 + 2 && o.z1 >= box.z0 - 2 && o.z0 <= box.z1 + 2);
      if (mine.length) out.push({ box, ops: mine, scale, tag, cx: (tx + 0.5) * TS * scale, cz: (tz + 0.5) * TS * scale });
    }
    return out;
  };
  const coreU = units(core, S, 'core'), dressU = units(dress, S, 'dress'), backU = [...units(back.filter((o) => !o.far), BS, 'back'), ...units(back.filter((o) => o.far), BS * 2, 'back')];
  const queue = [...coreU, ...dressU, ...backU];
  const backGroup = new THREE.Group(); backGroup.name = 'backdrop';
  st.group.add(backGroup);
  let faces = 0, firstFrameDone = false;
  const fading = [];
  const timing = { plan: performance.now() - t0, core: 0, dress: 0, back: 0 };
  const bakeNext = () => {
    const u0 = queue.shift(); if (!u0) return false;
    const tb = performance.now();
    const res = bakeUnit(u0.ops, u0.box, u0.scale, u0.tag === 'back' ? rigBack : rig, u0.tag === 'back' ? 1.4 : 1.6, SKIP);
    timing[u0.tag] += performance.now() - tb;
    if (!res) return true;
    faces += res.faces; timing['f_' + u0.tag] = (timing['f_' + u0.tag] || 0) + res.faces;
    (u0.tag === 'back' ? backGroup : st.env).add(res.g);
    if (firstFrameDone && u0.tag !== 'core') for (const m of res.g.children) { const orig = m.material, fm = orig.clone(); fm.color = orig.color.clone().multiplyScalar(0); m.material = fm; fading.push({ m, orig, fm, t: 0 }); }
    return true;
  };
  // ---- separate meshes: gates, secret rubble, ore nuggets, the hole
  const doorsOut = {};
  const DW = 1.0, H = RP.wallHeights(ctx);
  for (const d of ['n', 'e', 's', 'w']) {
    const state = doors[d];
    const ring = pl.doorTiles[d];
    const pos = d === 'n' ? V(0, 0, -HD - 0.25) : d === 's' ? V(0, 0, HD + 0.25) : d === 'w' ? V(-HW - 0.25, 0, 0) : V(HW + 0.25, 0, 0);
    const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[d];
    const door = { dir: d, state, x: pos.x, z: pos.z, out: { x: out[0], z: out[1] }, mouth: { x: pos.x + out[0] * 0.9, z: pos.z + out[1] * 0.9 }, tiles: state ? ring : [], k: 0, gate: null };
    if (!state) { door.setOpen = () => {}; door.isOpen = () => false; doorsOut[d] = door; continue; }
    const gh = d === 's' ? 0.9 : d === 'n' ? 2.05 : 1.65;
    let gate = null;
    if (state === 'secret') gate = bakeModel((w) => RP.secretRubble(w, A, DW, d === 'n' ? H.north : d === 's' ? H.south + 0.1 : H.side(0) + 0.75), rig);
    else if (!(type === 'chase')) gate = bakeModel((w) => RP.portcullis(w, A, DW, gh, state), rig);
    if (gate) {
      gate.position.set(pos.x, 0, pos.z + (d === 'n' ? -0.05 : d === 's' ? 0.05 : 0));
      if (d === 'e' || d === 'w') gate.rotation.y = Math.PI / 2;
      st.group.add(gate);
      door.gate = gate;
    }
    door.setOpen = (kk) => {
      door.k = Math.max(0, Math.min(1, kk));
      const open = door.k >= 0.5;
      for (const [tx, tz] of ring) grid.set(tx, tz, open ? 0 : 1);
      if (!gate) return;
      if (state === 'secret') { gate.visible = door.k < 0.98; gate.scale.set(1, 1 - door.k * 0.9, 1); if (door.k > 0 && !door._burst) { door._burst = true; burst(st, pos, A); } }
      else { gate.position.y = door.k * (gh + 0.1); gate.visible = door.k < 0.99; }
    };
    door.isOpen = () => door.k >= 0.5;
    door.setOpen(state === 'locked' || state === 'secret' ? 0 : 1);
    doorsOut[d] = door;
  }
  // ore veins: rock base is in the core bake; nuggets are their own mesh so mining can take them away
  const veinsOut = pl.veins.map((v, i) => {
    const kind = type === 'vein' && i === 1 && stage !== 2 ? (stage === 1 ? 'crystal' : 'gem') : 'ore';
    const ore = bakeModel((w) => RP.oreNuggets(w, A, { x0: v.b.x0 - (v.b.x0 + v.b.x1) / 2, x1: v.b.x1 - (v.b.x0 + v.b.x1) / 2, z0: v.b.z0 - (v.b.z0 + v.b.z1) / 2, z1: v.b.z1 - (v.b.z0 + v.b.z1) / 2 }, seed * 31 + 999 + i, kind), rig, 2.2);
    const cx = (v.b.x0 + v.b.x1) / 2, cz = (v.b.z0 + v.b.z1) / 2;
    ore.position.set(cx, 0, cz);
    st.group.add(ore);
    const tiles = [];
    for (let iz = v.iz; iz < v.iz + v.th; iz++) for (let ix = v.ix; ix < v.ix + v.tw; ix++) tiles.push([ix + 1, iz + 1]);
    const vein = { x: cx, z: cz, kind, stage, tiles, box: v.b, mined: 0, mesh: ore,
      setMined(kk) { vein.mined = Math.max(0, Math.min(1, kk)); ore.visible = vein.mined < 0.999; ore.scale.setScalar(1 - vein.mined * 0.6); } };
    st.emitters.push((dt) => { if (vein.mined < 1 && rnd.chance(dt * 2.5)) st.P.add.emit({ pos: [cx + rnd.float(-0.45, 0.45), rnd.float(0.2, 0.8), cz + rnd.float(-0.1, 0.5)], vel: [0, 0.05, 0], spread: 0.02, life: [0.4, 1], size: [1, 2], color: ['#ffffff', A.oreGlow || '#fff0b0'], glow: 3, flicker: 0.6 }); });
    return vein;
  });
  // the hole to the next floor (boss rooms) / the tutorial's drop
  let hole = null;
  const holeAt = type === 'boss' ? V(0, 0, 1.2) : type === 'chase' ? pl.tut.hole : null;
  if (holeAt) {
    hole = new THREE.Group();
    const rim = bakeModel((w) => { for (let a = 0; a < 40; a++) { const ang = a / 40 * Math.PI * 2; for (let q = 0; q < 3; q++) { const r = 20 + q * 2 + Math.round(h3(a, q, 1, 1) * 3); w.set(Math.round(Math.cos(ang) * r), q === 2 ? 0 : -1, Math.round(Math.sin(ang) * r * 0.85), tone(A.rock, 0.2 + q * 0.1 + h3(a, q, 2, 2) * 0.1)); } } }, rig);
    const tex = holeTexture(A);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    disc.position.y = 0.012; disc.scale.set(1, 1, 0.85); disc.renderOrder = 3;
    hole.add(disc, rim);
    hole.position.copy(holeAt);
    hole.visible = false;
    st.group.add(hole);
    st.emitters.push((dt) => { if (hole.visible && rnd.chance(dt * 10)) st.P.add.emit({ pos: [holeAt.x + rnd.float(-0.6, 0.6), 0.05, holeAt.z + rnd.float(-0.5, 0.5)], vel: [0, rnd.float(0.4, 1.2), 0], spread: 0.1, life: [1, 2], size: [1, 2], color: [A.glow, '#ffffff'], glow: 3, swirl: 0.8 }); });
  }
  // ---- the depths of each pit: a dark floor far below speckled with glowing caps, spores drifting up
  if (pl.pits.length) {
    const ptex = pitTexture(A, seed);
    for (const p of pl.pits) {
      const wd = p.b.x1 - p.b.x0, dp = p.b.z1 - p.b.z0;
      const t2 = ptex.clone(); t2.needsUpdate = true; t2.repeat.set(wd / 2, dp / 2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, dp).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t2, fog: false }));
      m.position.set((p.b.x0 + p.b.x1) / 2, -1.55, (p.b.z0 + p.b.z1) / 2);
      st.group.add(m);
      st.emitters.push((dt) => { if (rnd.chance(dt * wd * dp * 0.8)) st.P.add.emit({ pos: [rnd.float(p.b.x0, p.b.x1), -1.2, rnd.float(p.b.z0, p.b.z1)], vel: [0, rnd.float(0.25, 0.6), 0], spread: 0.05, life: [2, 3.5], size: 1, color: [A.glow, '#ffffff'], glow: 2.5, swirl: 0.4, fadeIn: 0.5 }); });
    }
  }
  // ---- flames, light shafts, particles, real-time lights for the actors
  for (const t of dr.torches) st.addFlame(t.x, t.y + 0.04, t.z + 0.12, 0.7, A.flame || 'fire', false, true);
  const shR = rngOf(seed + 5);
  const nShafts = stage === 2 ? 0 : 1 + (shR() < 0.5 ? 1 : 0);
  for (let q = 0; q < nShafts; q++) st.addShaft((shR() - 0.5) * pl.W * 0.7, 7.5, (shR() - 0.6) * pl.D * 0.6, 1.4 + shR(), 8, stage === 0 ? '#c8ffe8' : stage === 3 ? '#fff4d8' : '#c8e8ff', -0.3 + shR() * 0.2, 0.18);
  ambient(st, A, pl);
  const hemi = new THREE.HemisphereLight(new THREE.Color(A.sky), new THREE.Color(A.amb), 1.15);
  const key = new THREE.DirectionalLight(new THREE.Color(A.key), 1.25);
  key.position.set(-4, 10, 7); key.target.position.set(0, 0, 0);
  st.group.add(hemi, key, key.target);
  const lightsOut = [hemi, key];
  const pts = lamps.slice().sort((a, b) => b.i * b.r - a.i * a.r).slice(0, 4);
  for (const l of pts) { const p = new THREE.PointLight(new THREE.Color(l.c), 2.2 * l.i, l.r * 1.5, 1.5); p.position.set(l.x, Math.max(0.8, l.y), l.z); st.group.add(p); lightsOut.push(p); }
  // ---- anchors
  const anchors = { center: V(0, 0, 0) };
  const spCentre = (s) => V((s.b.x0 + s.b.x1) / 2, 0, (s.b.z0 + s.b.z1) / 2);
  for (const s of pl.special) {
    const c = spCentre(s);
    if (s.kind === 'pedestal') { anchors.pedestal = c.clone().setY(0.72); anchors.pedestalFront = c.clone().setZ(s.b.z1 + 0.5); }
    if (s.kind === 'bench') { anchors.bench = c.clone().setY(0.8); anchors.benchFront = c.clone().setZ(s.b.z1 + 0.55); }
    if (s.kind === 'shrine') { anchors.shrine = c.clone(); anchors.shrineFront = c.clone().setZ(s.b.z1 + 0.6); }
    if (s.kind === 'chest') { anchors.chest = c.clone(); anchors.chestFront = c.clone().setZ(s.b.z1 + 0.5); }
  }
  if (type === 'boss') { anchors.boss = V(0, 0, -HD * 0.42); anchors.throne = V(0, 0, -HD + 1.4); }
  if (holeAt) anchors.hole = holeAt.clone();
  if (type === 'chase') Object.assign(anchors, pl.tut);
  for (const d of ['n', 'e', 's', 'w']) if (doorsOut[d].state) anchors['door_' + d] = V(doorsOut[d].x - doorsOut[d].out.x * 0.9, 0, doorsOut[d].z - doorsOut[d].out.z * 0.9);
  // ---- the room object
  const R = {
    key: n.key, stage, type, size, seed, grid, group: st.group, stage3d: st,
    bounds: { x0: -HW, x1: HW, z0: -HD, z1: HD }, width: pl.W, depth: pl.D,
    doors: doorsOut, spawns: pl.spawns, veins: veinsOut, anchors, background: backGroup, lights: lightsOut,
    fog: st.fog, bg: st.background, pattern: pl.pattern, timing, active: false, disposed: false,
    get faces() { return faces; },
    attach(scene) { scene.add(st.group); scene.fog = st.fog; scene.background = st.background; return R; },
    setCamera(cam) { st.setCamera(cam); R._cam = cam; },
    /** Bake everything gameplay needs before the first frame (floor, walls, obstacles). */
    finishCore() { const tc = performance.now(); while (queue.length && queue[0].tag === 'core') bakeNext(); timing.firstFrame = (timing.firstFrame || 0) + performance.now() - tc; },
    bakeNext,
    done: () => queue.length === 0,
    progress: () => 1 - queue.length / Math.max(1, coreU.length + dressU.length + backU.length),
    /** Finish all streaming now (tests, screenshots). */
    bakeAll() { while (queue.length) bakeNext(); },
    openHole(kk) { if (!hole) return; hole.visible = kk > 0.01; hole.scale.setScalar(Math.max(0.01, kk)); },
    update(dt, t) {
      firstFrameDone = true;
      // stream the dressing & backdrop within a small frame budget, nearest to the camera's focus first
      if (queue.length) {
        const tb = performance.now();
        if (R._cam) sortQueue(queue, R._cam);
        while (queue.length && performance.now() - tb < (R.budgetMs ?? 5)) bakeNext();
      }
      for (let i = fading.length - 1; i >= 0; i--) {
        const f = fading[i]; f.t += dt;
        const kk = Math.min(1, f.t / 0.5);
        if (kk >= 1) { f.m.material = f.orig; f.fm.dispose(); fading.splice(i, 1); } else f.fm.color.copy(f.orig.color).multiplyScalar(kk * kk * (3 - 2 * kk));
      }
      st.update(dt, t);
    },
    dispose() {
      if (R.disposed) return;
      R.disposed = true;
      cache.delete(R.key);
      st.group.parent && st.group.parent.remove(st.group);
      st.group.traverse((m) => {
        if (m.geometry && !(m.geometry.userData && m.geometry.userData.keep)) m.geometry.dispose();
        const mt = m.material;
        if (mt && !(mt.userData && mt.userData.keep)) { if (mt.map) mt.map.dispose(); mt.dispose(); }
      });
    },
  };
  timing.planned = performance.now() - t0;
  return R;
}
let _sortT = 0;
function sortQueue(queue, cam) {
  const now = performance.now(); if (now - _sortT < 200) return; _sortT = now;
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  cam.getWorldPosition(p); cam.getWorldDirection(d);
  const t = d.y < -0.05 ? -p.y / d.y : 10, fx = p.x + d.x * t, fz = p.z + d.z * t;
  const pri = (u) => (u.tag === 'core' ? 0 : u.tag === 'dress' ? 1 : 2) * 1000 + Math.hypot(u.cx - fx, u.cz - fz);
  queue.sort((a, b) => pri(a) - pri(b));
}

// ---------------------------------------------------------------------------- small painters used only here
function thicketTile(w, A, b, seed) {
  const X0 = Math.floor(b.x0 / S), X1 = Math.ceil(b.x1 / S), Z0 = Math.floor(b.z0 / S), Z1 = Math.ceil(b.z1 / S);
  const [xa, xb] = w.rx(X0, X1), [za, zb] = w.rz(Z0, Z1);
  for (let Z = za; Z < zb; Z++) for (let X = xa; X < xb; X++) {
    const hTop = 6 + Math.round(noise2(X * 0.08, Z * 0.08 + seed) * 22);
    for (let y = -1; y <= hTop; y++) {
      const n = noise2(X * 0.18, y * 0.1 + Z * 0.18);
      w.set(X, y, Z, y > hTop - 2 ? tone(A.moss, 0.3 + h3(X, Z, y, 1) * 0.5) : n > 0.6 ? tone(A.root, 0.25 + (y / hTop) * 0.35) : tone(A.stem || A.root, 0.25 + (y / hTop) * 0.3 + h3(X, y, Z, 2) * 0.08));
    }
  }
}
function glowShard(w, x, y, z, r, col) {
  for (let s = 0; s < r * 4; s++) { const rr = Math.max(0.6, r * (1 - s / (r * 4))); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx * dx + dz * dz <= rr * rr) w.set(Math.round(x + dx), y + s, Math.round(z + dz), glowC(col)); }
}
function ashTreeCoarse(w, A, x, y, z, h, seed) {
  for (let s = 0; s < h; s++) { const r = 1.6 * (1 - s / h) + 0.6; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= r * r) w.set(x + dx, y + s, z + dz, h3(dx, s, dz, seed) > 0.96 ? glowC('#ff6a1a') : tone(A.root, 0.15 + h3(dx, s, dz, 2) * 0.25)); }
  for (let k = 0; k < 18; k++) { const a = h3(k, seed, 1, 1) * Math.PI * 2, rr = 2 + h3(k, seed, 2, 2) * 5, yy = y + h - 2 + Math.round(h3(k, seed, 3, 3) * 5); w.set(Math.round(x + Math.cos(a) * rr), yy, Math.round(z + Math.sin(a) * rr), h3(k, seed, 4, 4) > 0.4 ? glowC(A.leaf[3 + (k & 1)]) : tone(A.leaf, 0.5)); }
}
function pitTexture(A, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#030607'; g.fillRect(0, 0, 64, 64);
  const gl = A.gills || [A.glow];
  for (let k = 0; k < 26; k++) {
    const x = Math.floor(h3(k, seed, 1, 1) * 64), y = Math.floor(h3(k, seed, 2, 2) * 64), r = 1 + Math.floor(h3(k, seed, 3, 3) * 3);
    g.fillStyle = gl[k % gl.length]; g.globalAlpha = 0.35 + h3(k, seed, 4, 4) * 0.5;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function holeTexture(A) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, '#000000'); grd.addColorStop(0.6, '#020604'); grd.addColorStop(0.86, A.glow); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function burst(st, pos, A) {
  for (let i = 0; i < 40; i++) st.P.alpha.emit({ pos: [pos.x + rnd.float(-1, 1), rnd.float(0.2, 1.8), pos.z], vel: [rnd.float(-1, 1), rnd.float(0.5, 2.5), rnd.float(-0.5, 1.5)], spread: 0.2, life: [0.6, 1.4], size: [1, 3], gravity: -9, color: '#6a6458', alpha: 0.9 });
}
/** Falling spores, fireflies by the walls, motes in the shafts, embers, glints, petals. */
function ambient(st, A, pl) {
  const { HW, HD } = pl;
  const kinds = A.ambient || ['motes'];
  st.emitters.push((dt) => {
    for (const k of kinds) {
      const p = [rnd.float(-HW - 2, HW + 2), rnd.float(0.2, 4), rnd.float(-HD - 2, HD + 1)];
      if (k === 'spores' && rnd.chance(dt * 14)) st.P.add.emit({ pos: [p[0], rnd.float(2, 6), p[2]], vel: [0.05, -0.18, 0.02], spread: 0.06, life: [5, 9], size: 1, color: [A.glow, '#d8ff8a', '#ffd8f0'], glow: 2, fadeIn: 0.8, swirl: 0.5 });
      if (k === 'fireflies' && rnd.chance(dt * 4)) st.P.add.emit({ pos: [rnd.float(-HW, HW), rnd.float(0.3, 1.6), rnd.chance(0.5) ? -HD + 0.4 : rnd.float(-HD, HD)], vel: [rnd.float(-0.2, 0.2), rnd.float(-0.05, 0.1), rnd.float(-0.2, 0.2)], spread: 0.1, life: [3, 5], size: [1, 2], color: ['#e8ff8a', '#9affc8'], glow: 3, flicker: 0.7, swirl: 1, fadeIn: 0.6 });
      if (k === 'motes' && rnd.chance(dt * 6)) st.P.add.emit({ pos: p, vel: [0.03, 0.03, 0], spread: 0.02, life: [3, 5], size: 1, color: ['#ffe0b0', '#ffc8a0'], glow: 1.4, fadeIn: 1, swirl: 0.3 });
      if (k === 'embers' && rnd.chance(dt * 16)) st.P.add.emit({ pos: [p[0], -0.2, p[2]], vel: [rnd.float(-0.1, 0.2), rnd.float(0.6, 1.3), 0], spread: 0.15, life: [1.5, 3.5], size: 1, color: ['#ffb43a', '#ff6a1a', '#ffe08a'], colorEnd: '#ff2a00', glow: 3, swirl: 0.6 });
      if (k === 'glints' && rnd.chance(dt * 8)) st.P.add.emit({ pos: p, vel: [0, 0.03, 0], spread: 0.03, life: [0.4, 1.2], size: [1, 2], color: [A.crystal, A.crystal2 || '#ffffff', '#ffffff'], glow: 3, flicker: 0.6 });
      if (k === 'petals' && rnd.chance(dt * 5)) st.P.alpha.emit({ pos: [p[0], rnd.float(2, 5), p[2]], vel: [0.12, -0.15, 0.05], spread: 0.06, life: [4, 7], size: 1, color: A.flowers.slice(0, 3), alpha: 0.85, swirl: 0.8 });
    }
  });
}
void MAT; void LAYER_FX;
