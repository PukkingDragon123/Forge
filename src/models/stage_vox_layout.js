// Layout kit for walk-through voxel spaces (first-person tunnels, junctions, chambers, the dungeon
// camp). A piece is described as a footprint of walkable columns, each with a floor and a ceiling
// height, a floor material and a wall style. The kit paints the dungeon-and-nature shell around it
// (masonry that gives way to rock, flagstones, vaults, moss, damp, roots…), lets pieces add dressing
// ops, and bakes the result in tiles that stream in around the camera. Faces that can only be seen
// from outside the space are never meshed (meshWorld's `seen`), so walls stay paper-thin in cost.
import * as THREE from 'three';
import { S, VWorld, C, glowC, mixC, tone, h3, makeLightRig, meshWorld, worldMeshes, NOAO, GLOW } from './stage_vox_kit.js';
import { noise2, clamp, hexToRgb } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import { LAYER_FX } from '../gfx/renderer.js';

const pal = (a) => a.map(C);
export const vx = (u) => Math.round(u / S);
const BIG = 1 << 20;

// ---------------------------------------------------------------------------- act styles
// fields used by Stage: fog, bg, lamp, lamp2, amb, sky, key (+ the kit's own below)
export const ACT_STYLES = [
  { // 0 The Mossy Undercroft — warm violet-grey brick, roots, ferns, moss, waterfalls, torches
    id: 'undercroft',
    brick: pal(['#2a2230', '#3e3244', '#56465a', '#725e70', '#957a88', '#b89aa2']), mortar: C('#1a141e'),
    rock: pal(['#241c24', '#382a32', '#4e3c40', '#6a5250', '#8a6e62']),
    flag: pal(['#2e2832', '#443a44', '#5c4e58', '#76646c', '#927e82']), joint: C('#1c161c'),
    dirt: pal(['#2e2220', '#46342a', '#5e4834', '#7a6044']),
    moss: pal(['#24482c', '#356a36', '#4e9440', '#78bc4e', '#b0e06a']),
    leaf: pal(['#1e4430', '#2e6a3c', '#46944a', '#72c25a', '#b2ec7c']),
    root: pal(['#24160e', '#3c2618', '#5a3c24', '#7a5634', '#9a7448']),
    flowers: ['#ff8ab4', '#ffd45e', '#b89aff', '#ffffff'],
    sand: pal(['#3a3434', '#565050', '#746c66']),
    water: '#56cce0', waterDeep: '#123c4a', lava: null,
    lamp: '#ffa24a', lamp2: '#9affc8', glow: '#9affc8', crystal: '#9ae8ff',
    amb: '#4a3e72', sky: '#8a8ed0', key: '#ffd8b0', keyI: 0.12,
    fog: '#120e18', bg: '#09070d', fogD: 0.085,
    ore: ['#e08a4a', '#d8d8e8', '#ffd27a'], oreGlow: '#fff0b0', marble: false,
    wallMix: 0.32, // how much masonry gives way to raw rock
  },
  { // 1 The Crystal Cistern — blue-grey arches in still water, cyan & pink crystal light
    id: 'cistern',
    brick: pal(['#16202e', '#223044', '#304660', '#46607a', '#628098', '#8aa8ba']), mortar: C('#0e141e'),
    rock: pal(['#141a2a', '#1e283e', '#2a3856', '#3c4e72', '#5a6c94']),
    flag: pal(['#1a2232', '#263248', '#36465e', '#4c5e78', '#6a7c94']), joint: C('#10161e'),
    dirt: pal(['#1e2430', '#2c3444', '#3e4858']),
    moss: pal(['#1a3e46', '#245e5e', '#348a7a', '#58b89a', '#9ae0c0']),
    leaf: pal(['#16403a', '#22604e', '#348a62', '#58b47a', '#9ae0a8']),
    root: pal(['#1a1a24', '#2a2a38', '#3e3c4e', '#565470']),
    flowers: ['#ff9ae8', '#9af0ff', '#ffffff', '#c8a8ff'],
    sand: pal(['#2a3a44', '#3e5662', '#58767e']),
    water: '#3ac0d8', waterDeep: '#0a2e40', lava: null,
    lamp: '#8ae8ff', lamp2: '#ff8ae0', glow: '#9af0ff', crystal: '#6ae8ff', crystal2: '#ff8ae0', flame: 'blue',
    amb: '#33427a', sky: '#90a8ff', key: '#e0ecff', keyI: 0.12,
    fog: '#0a1020', bg: '#06080f', fogD: 0.08,
    ore: ['#6ae8ff', '#ff8ae0', '#c0a8ff'], oreGlow: '#e8fbff', marble: false,
    wallMix: 0.22,
  },
  { // 2 The Ember Foundry — basalt dwarf halls, iron, lava channels, ash trees with ember leaves
    id: 'foundry',
    brick: pal(['#1c1216', '#2c1c20', '#40282a', '#5a3632', '#784a40', '#986250']), mortar: C('#120a0c'),
    rock: pal(['#160e12', '#24161a', '#361e22', '#4e2a2a', '#6a3a32']),
    flag: pal(['#1e1416', '#2e1e20', '#42292a', '#5a3836', '#744a42']), joint: C('#100808'),
    dirt: pal(['#221616', '#342220', '#4a302a']),
    moss: pal(['#3a1e18', '#5a2c1e', '#8a4424', '#c4682a', '#ffa040']),
    leaf: pal(['#4a1a10', '#8a2e14', '#d8541a', '#ff8a2a', '#ffc85a']),
    root: pal(['#140c0c', '#22161a', '#342226', '#4a3036']),
    flowers: ['#ffc85a', '#ff8a2a', '#ffe8a0', '#ff5a2a'],
    sand: pal(['#2a1a1a', '#3e2622', '#54342c']),
    water: null, waterDeep: null, lava: ['#a02a0a', '#e8501a', '#ff8a2a', '#ffc85a', '#fff0b0'],
    lamp: '#ff8a3a', lamp2: '#ffc85a', glow: '#ffb04a', crystal: '#ffb04a',
    amb: '#5a2a4a', sky: '#9a6a8a', key: '#ffc8a0', keyI: 0.12,
    fog: '#1c0a0c', bg: '#0e0507', fogD: 0.075,
    ore: ['#ff8a2a', '#ffd25e', '#c8c8d8'], oreGlow: '#fff0b0', marble: false,
    wallMix: 0.26,
  },
  { // 3 Medusa's Garden — pale marble temple overgrown with vines & flowers, statues, jade light
    id: 'garden',
    brick: pal(['#3a3e3a', '#5a605a', '#7e867c', '#a4ac9e', '#c8cec0', '#e4e8dc']), mortar: C('#2a2e2a'),
    rock: pal(['#1e2a26', '#2e3e38', '#40564c', '#5a7466', '#7a9484']),
    flag: pal(['#4a4e48', '#6a7068', '#8e968a', '#b2b8aa', '#d2d6c8']), joint: C('#2e322e'),
    dirt: pal(['#26302a', '#38463a', '#4c5e4a']),
    moss: pal(['#1e4a32', '#2e6e40', '#46984e', '#74c060', '#b4e47e']),
    leaf: pal(['#1a4a30', '#2a6e3e', '#40984c', '#6ac462', '#aaea84']),
    root: pal(['#2a2a1e', '#3e3c2a', '#5a5638', '#7a744a']),
    flowers: ['#ffffff', '#ffb4d8', '#d8b4ff', '#fff2a0'],
    sand: pal(['#3a463e', '#4e5e52', '#667a68']),
    water: '#5ae0c0', waterDeep: '#0e3a32', lava: null,
    lamp: '#fff0c8', lamp2: '#a8ffd8', glow: '#7affc8', crystal: '#7affc8', flame: 'green',
    amb: '#3e4268', sky: '#e8ecd8', key: '#fff4e0', keyI: 0.16,
    fog: '#0c1814', bg: '#060c0a', fogD: 0.07,
    ore: ['#7affc8', '#e8e0c8', '#ffd27a'], oreGlow: '#e8fff4', marble: true,
    wallMix: 0.12,
  },
];
// the dungeon camp (main menu): warm & lavender, a little brighter than act 0
export const CAMP_STYLE = {
  ...ACT_STYLES[0], id: 'camp',
  brick: pal(['#2e2232', '#46344a', '#624c62', '#82667e', '#a8869a', '#ccaab4']),
  flag: pal(['#32283a', '#4a3c4e', '#665462', '#84707a', '#a48e92']),
  amb: '#5a4888', sky: '#9a98e0', fog: '#160f1c', bg: '#0b080f', fogD: 0.03, wallMix: 0.28,
};

/** Floor materials. */
export const MAT = { STONE: 0, WATER: 1, LAVA: 2, VOID: 3, EARTH: 4, PLANK: 5, MARBLE: 6, RUG: 7 };

// ---------------------------------------------------------------------------- layout
export class Layout {
  /** World-metre bounds of the space (a little padding is added for the walls). */
  constructor(x0, x1, z0, z1, pad = 0.5) {
    this.X0 = Math.floor((x0 - pad) / S); this.X1 = Math.ceil((x1 + pad) / S);
    this.Z0 = Math.floor((z0 - pad) / S); this.Z1 = Math.ceil((z1 + pad) / S);
    this.W = this.X1 - this.X0; this.D = this.Z1 - this.Z0;
    const n = this.W * this.D;
    this.inside = new Uint8Array(n);
    this.floor = new Int16Array(n);   // voxel y of the top floor voxel (air starts one above)
    this.ceil = new Int16Array(n);    // voxel y of the lowest ceiling voxel
    this.mat = new Uint8Array(n);
    this.style = new Uint8Array(n);   // 0 masonry, 1 rock, 2 marble (per act), set by carve
    this.dist = new Uint8Array(n);    // outside: distance to the space; inside: distance to the wall
    this.near = new Int32Array(n);    // nearest cell across the boundary
    this.T = 3;                       // wall thickness (voxels)
  }
  i(X, Z) { X -= this.X0; Z -= this.Z0; return X < 0 || Z < 0 || X >= this.W || Z >= this.D ? -1 : Z * this.W + X; }
  /**
   * Carve every column whose centre passes test(x, z) (metres). floor / ceil: metres or (x, z) → metres.
   * mat: floor material or (x, z) → material.
   */
  carve(x0, x1, z0, z1, test, floor = 0, ceil = 3, mat = MAT.STONE, style = 0) {
    const xa = Math.max(this.X0, Math.floor(x0 / S)), xb = Math.min(this.X1, Math.ceil(x1 / S));
    const za = Math.max(this.Z0, Math.floor(z0 / S)), zb = Math.min(this.Z1, Math.ceil(z1 / S));
    const ff = typeof floor === 'function', cf = typeof ceil === 'function', mf = typeof mat === 'function';
    for (let Z = za; Z < zb; Z++) for (let X = xa; X < xb; X++) {
      const x = (X + 0.5) * S, z = (Z + 0.5) * S;
      if (test && !test(x, z)) continue;
      const i = (Z - this.Z0) * this.W + (X - this.X0);
      this.inside[i] = 1;
      this.floor[i] = Math.round((ff ? floor(x, z) : floor) / S) - 1;
      this.ceil[i] = Math.round((cf ? ceil(x, z) : ceil) / S);
      this.mat[i] = mf ? mat(x, z) : mat;
      this.style[i] = style;
    }
  }
  rect(x0, x1, z0, z1, floor, ceil, mat, style) { this.carve(x0, x1, z0, z1, null, floor, ceil, mat, style); }
  disc(cx, cz, r, floor, ceil, mat, style) { this.carve(cx - r, cx + r, cz - r, cz + r, (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r, floor, ceil, mat, style); }
  /** Set floor / ceiling / material on already-carved columns inside a test. */
  edit(x0, x1, z0, z1, test, o = {}) {
    const xa = Math.max(this.X0, Math.floor(x0 / S)), xb = Math.min(this.X1, Math.ceil(x1 / S));
    const za = Math.max(this.Z0, Math.floor(z0 / S)), zb = Math.min(this.Z1, Math.ceil(z1 / S));
    for (let Z = za; Z < zb; Z++) for (let X = xa; X < xb; X++) {
      const x = (X + 0.5) * S, z = (Z + 0.5) * S;
      if (test && !test(x, z)) continue;
      const i = (Z - this.Z0) * this.W + (X - this.X0);
      if (!this.inside[i]) continue;
      if (o.floor !== undefined) this.floor[i] = Math.round((typeof o.floor === 'function' ? o.floor(x, z, this.floor[i] * S) : o.floor) / S) - 1;
      if (o.ceil !== undefined) this.ceil[i] = Math.round((typeof o.ceil === 'function' ? o.ceil(x, z, this.ceil[i] * S) : o.ceil) / S);
      if (o.mat !== undefined) this.mat[i] = typeof o.mat === 'function' ? o.mat(x, z) : o.mat;
      if (o.style !== undefined) this.style[i] = o.style;
    }
  }
  /** Distance transforms (chamfer 3-4) on both sides of the boundary, with nearest-cell propagation. */
  finish() {
    const { W, D } = this, n = W * D, INF = 60000;
    const dist = new Uint16Array(n), nr = new Int32Array(n), near = new Int32Array(n).fill(-1);
    for (const side of [0, 1]) { // 0: outside cells measure to the space; 1: inside cells measure to the walls
      for (let i = 0; i < n; i++) { const src = side === 0 ? this.inside[i] === 1 : this.inside[i] === 0; dist[i] = src ? 0 : INF; nr[i] = src ? i : -1; }
      const relax = (i, j, w) => { const d = dist[j] + w; if (d < dist[i]) { dist[i] = d; nr[i] = nr[j]; } };
      for (let Z = 0; Z < D; Z++) for (let X = 0; X < W; X++) {
        const i = Z * W + X; if (dist[i] === 0) continue;
        if (X > 0) relax(i, i - 1, 3);
        if (Z > 0) { relax(i, i - W, 3); if (X > 0) relax(i, i - W - 1, 4); if (X < W - 1) relax(i, i - W + 1, 4); }
      }
      for (let Z = D - 1; Z >= 0; Z--) for (let X = W - 1; X >= 0; X--) {
        const i = Z * W + X; if (dist[i] === 0) continue;
        if (X < W - 1) relax(i, i + 1, 3);
        if (Z < D - 1) { relax(i, i + W, 3); if (X < W - 1) relax(i, i + W + 1, 4); if (X > 0) relax(i, i + W - 1, 4); }
      }
      for (let i = 0; i < n; i++) if (side === 0 ? this.inside[i] === 0 : this.inside[i] === 1) { this.dist[i] = Math.min(255, Math.round(dist[i] / 3)); near[i] = nr[i]; }
    }
    this.near = near;
    return this;
  }
  /** Can a viewer ever be in voxel cell (x, y, z)? (air inside the space) */
  seen(x, y, z) {
    const X = x - this.X0, Z = z - this.Z0;
    if (X < 0 || Z < 0 || X >= this.W || Z >= this.D) return false;
    const i = Z * this.W + X;
    return this.inside[i] === 1 && y > this.floor[i] && y < this.ceil[i];
  }
  /** Floor height (metres, the walking surface) at a world point; null outside. */
  floorAt(x, z) { const i = this.i(Math.floor(x / S), Math.floor(z / S)); return i >= 0 && this.inside[i] ? (this.floor[i] + 1) * S : null; }
  ceilAt(x, z) { const i = this.i(Math.floor(x / S), Math.floor(z / S)); return i >= 0 && this.inside[i] ? this.ceil[i] * S : null; }
  isInside(x, z) { const i = this.i(Math.floor(x / S), Math.floor(z / S)); return i >= 0 && this.inside[i] === 1; }
}

// ---------------------------------------------------------------------------- surface colours
const SEED = 17;
/** Masonry brick at (along, y): returns { mortar, id, row } — 7-voxel courses, 13-voxel bricks, staggered. */
function brickAt(u, y) {
  const row = Math.floor(y / 7), off = (row & 1) * 6 + (row % 3 === 2 ? 3 : 0);
  const uu = u + off, col = Math.floor(uu / 13);
  const mortar = ((y % 7) + 7) % 7 === 0 || ((uu % 13) + 13) % 13 === 0;
  return { mortar, id: col, row };
}
/** Wall surface colour (voxel ints) for a wall of style `st` in act style A. along: coordinate along the wall. */
export function wallColor(A, x, y, z, along, st, yFloor = 0) {
  const yr = y - yFloor;
  // raw rock where the masonry has given way (or the whole wall for style 1)
  const rockZone = st === 1 || noise2(along * 0.035 + 3.1, y * 0.045 + x * 0.002) > 1 - A.wallMix;
  let c;
  if (rockZone && st !== 2) {
    const band = Math.floor((y + noise2(along * 0.05, y * 0.02) * 10) / 16);
    c = tone(A.rock, 0.3 + (band % 3) * 0.12 + noise2(along * 0.12, y * 0.15) * 0.25 + (h3(x, y, z, 5) > 0.97 ? 0.12 : 0));
    if (h3(x, y, z, 11) > 0.994) c = h3(x, y, z, 12) > 0.5 ? glowC(A.ore[(x + y) & 1]) : C(A.ore[(((x + z) % 3) + 3) % 3]);
  } else {
    const b = brickAt(along, y);
    if (b.mortar) c = A.mortar;
    else {
      const hb = h3(b.id, b.row, 3, SEED);
      const topRow = ((y % 7) + 7) % 7 === 6;
      c = tone(A.brick, 0.28 + hb * 0.42 + (topRow ? 0.1 : 0) + (h3(x, y, z, 6) > 0.95 ? 0.08 : 0) - (yr < 10 ? 0.1 : 0));
      if (h3(b.id, b.row, 21, SEED) > 0.95 && h3(x, y, z, 22) > 0.7) c = mixC(c, A.mortar, 0.6); // chipped
      if (st === 2 && b.row % 9 === 5) c = mixC(c, C(A.glow), 0.18); // a jade band in the garden marble
    }
  }
  // damp streaks, moss climbing from the floor and hanging from the top
  if (noise2(along * 0.4, 7.7) > 0.76 && noise2(along * 0.4, y * 0.02) > 0.5) c = mixC(c, A.rock[0], 0.18);
  const mossy = noise2(along * 0.07 + 11, y * 0.09) > (yr < 18 ? 0.5 : 0.7);
  if (mossy && (yr < 22 || noise2(along * 0.05, y * 0.05 + 4) > 0.62)) c = tone(A.moss, 0.2 + noise2(along * 0.3, y * 0.3) * 0.5 + (h3(x, y, z, 31) > 0.7 ? 0.18 : 0));
  return c;
}
/** Floor top / body colour at voxel column (x, z), depth below the top (0 = top). */
export function floorColor(A, x, y, z, depth, mat, nearWall) {
  if (mat === MAT.WATER) return depth ? A.sand[0] : tone(A.sand, 0.3 + h3(x, z, 1, 3) * 0.5);
  if (mat === MAT.LAVA) {
    const lv = A.lava || ACT_STYLES[2].lava;
    const crust = noise2(x * 0.11, z * 0.11) > 0.55;
    return depth ? C(lv[0]) : crust ? C('#2a1414') : glowC(lv[Math.min(4, 1 + Math.floor(noise2(x * 0.3, z * 0.3) * 4))]);
  }
  if (mat === MAT.EARTH) {
    if (depth) return A.dirt[0];
    return noise2(x * 0.12, z * 0.12) > 0.45 ? tone(A.moss, 0.25 + noise2(x * 0.5, z * 0.5) * 0.55) : tone(A.dirt, 0.3 + h3(x, z, 2, 2) * 0.5);
  }
  if (mat === MAT.PLANK) {
    const pk = Math.floor(z / 5);
    return depth ? C('#2a1a12') : (z % 5 === 0 ? C('#1e120c') : tone(pal(['#3a2418', '#5a3a26', '#7e5434', '#a0703e']), 0.3 + h3(pk, 1, 2, 9) * 0.5 + (h3(x, z, 3, 4) > 0.9 ? 0.15 : 0)));
  }
  if (mat === MAT.RUG) {
    const edge = (x & 15) === 0 || (z & 15) === 0;
    return depth ? A.flag[0] : edge ? C('#e8b84a') : ((x >> 2) + (z >> 2)) & 1 ? C('#8a2e3e') : C('#6a2234');
  }
  // flagstones (or marble tiles): 12-voxel slabs on offset rows with dark joints
  const row = Math.floor(z / 12), off = (row & 1) * 6, tx = Math.floor((x + off) / 12);
  const joint = ((z % 12) + 12) % 12 === 0 || (((x + off) % 12) + 12) % 12 === 0;
  if (depth) return joint ? A.joint : A.flag[0];
  const marble = mat === MAT.MARBLE || A.marble;
  let c = joint ? A.joint : tone(A.flag, 0.3 + h3(tx, row, 1, SEED) * 0.42 + (h3(x, z, 4, 1) > 0.97 ? 0.1 : 0));
  if (!joint && marble && noise2(x * 0.06 + tx, z * 0.2) > 0.82) c = mixC(c, C(A.glow), 0.25); // veins
  // moss and dirt creep in from the walls and along the joints
  const mn = noise2(x * 0.09 + 5, z * 0.09);
  if ((nearWall < 6 && mn > 0.42) || (joint && mn > 0.55) || mn > 0.8) c = tone(A.moss, 0.18 + noise2(x * 0.4, z * 0.4) * 0.45 + (h3(x, z, 6, 3) > 0.72 ? 0.2 : 0));
  else if (noise2(x * 0.07 + 9, z * 0.07) > 0.78) c = h3(x, z, 5, 2) > 0.35 ? tone(A.dirt, 0.4 + h3(x, z, 7, 2) * 0.3) : c;
  return c;
}

// ---------------------------------------------------------------------------- the shell painter
/**
 * Paint the layout's floors, ceilings and walls into w (clip-aware: only the clip box is painted).
 * o: { A (act style), ceilStyle(i) → 'brick'|'rock', floorDepth }
 */
export function paintShell(L, A, w) {
  const cl = w.clip || { x0: L.X0, x1: L.X1, z0: L.Z0, z1: L.Z1 };
  const xa = Math.max(L.X0, cl.x0), xb = Math.min(L.X1, cl.x1), za = Math.max(L.Z0, cl.z0), zb = Math.min(L.Z1, cl.z1);
  const { W, inside, floor, ceil, mat, dist, near, style } = L, T = L.T;
  const dark = A.rock[0];
  for (let Z = za; Z < zb; Z++) for (let X = xa; X < xb; X++) {
    const i = (Z - L.Z0) * W + (X - L.X0);
    if (inside[i]) {
      // ---- floor (filled down to lower neighbours so steps, ledges and chasm sides close)
      const top = floor[i], m = mat[i];
      let bot = top - 2;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= inside.length) continue;
        if (inside[j]) { if (floor[j] < bot) bot = floor[j]; } else if (top - 3 < bot) bot = top - 3;
      }
      if (m === MAT.VOID) bot = Math.max(bot, top - 2);
      const nw = dist[i];
      for (let y = bot; y <= top; y++) w.set(X, y, Z, m === MAT.VOID ? (y === top ? (h3(X, Z, 1, 2) > 0.985 ? glowC(A.glow) : C('#06050a')) : dark) : top - y > 3 ? tone(A.rock, 0.16 + (((y >> 3) & 1) ? 0.12 : 0) + h3(X, y, Z, 3) * 0.1 + (h3(X, y, Z, 4) > 0.985 ? 0.2 : 0)) : floorColor(A, X, y, Z, top - y, m, nw));
      // ---- ceiling (reaching up to taller neighbours: shafts, holes, vault crowns)
      const c0 = ceil[i];
      let ct = c0 + 2;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < inside.length && inside[j] && ceil[j] > ct) ct = ceil[j];
      const along = Z;
      for (let y = c0; y <= ct; y++) {
        let c;
        if (y > c0 + 1) c = dark;
        else if (style[i] === 2) c = tone(A.brick, 0.45 + h3(X >> 3, Z >> 3, 2, 4) * 0.25);
        else {
          const b = brickAt(X, Z);
          c = b.mortar ? A.mortar : tone(A.brick, 0.18 + h3(b.id, b.row, 9, SEED) * 0.32);
          if (noise2(X * 0.04 + 2, Z * 0.04) > 0.62) c = tone(A.rock, 0.2 + noise2(X * 0.2, Z * 0.2) * 0.3);
          if (noise2(X * 0.08 + 7, along * 0.08) > 0.7) c = tone(A.moss, 0.15 + noise2(X * 0.3, Z * 0.3) * 0.4);
        }
        w.set(X, y, Z, c);
      }
      // ---- bricks that stand proud of the wall face (relief on the inside of the boundary)
      if (nw <= 2 && near[i] >= 0) {
        const j = near[i], jx = (j % W) + L.X0, jz = Math.floor(j / W) + L.Z0;
        const alongW = Math.abs(jx - X) >= Math.abs(jz - Z) ? Z : X;
        for (let y = top + 1; y < c0; y++) {
          const b = brickAt(alongW, y);
          if (b.mortar) continue;
          const hb = h3(b.id, b.row, 13, SEED);
          const proud = style[i] === 1 ? (noise2(alongW * 0.15, y * 0.12) > 0.58 ? 2 : noise2(alongW * 0.15, y * 0.12) > 0.45 ? 1 : 0) : hb > 0.9 ? 2 : hb > 0.74 ? 1 : 0;
          if (proud >= nw) w.set(X, y, Z, wallColor(A, X, y, Z, alongW, style[i], top));
        }
      }
    } else if (dist[i] && dist[i] <= T) {
      // ---- wall column
      const j = near[i];
      if (j < 0 || !inside[j]) continue;
      const lo = floor[j] - 3, hi = ceil[j] + 2;
      const jx = (j % W) + L.X0, jz = Math.floor(j / W) + L.Z0;
      const alongW = Math.abs(jx - X) >= Math.abs(jz - Z) ? Z : X;
      for (let y = lo; y <= hi; y++) w.set(X, y, Z, dist[i] <= 1 ? wallColor(A, X, y, Z, alongW, style[j], floor[j]) : dark);
    }
  }
}

// ---------------------------------------------------------------------------- dressing (voxel ints unless noted)
/** Hanging root bundle from the ceiling at (x, yTop, z), length in voxels. glow: tip colour or null. */
export function roots(w, A, x, yTop, z, len, seed = 1, glow = null) {
  const n = 2 + Math.floor(h3(x, z, seed, 1) * 3);
  for (let k = 0; k < n; k++) {
    let px = x + (h3(k, x, z, seed) - 0.5) * 6, pz = z + (h3(z, k, x, seed) - 0.5) * 6;
    const L = Math.round(len * (0.55 + h3(k, seed, 3, 2) * 0.45));
    for (let s = 0; s < L; s++) {
      const t = s / L, y = yTop - s;
      px += Math.sin(s * 0.21 + k * 2 + seed) * 0.35; pz += Math.cos(s * 0.17 + k) * 0.3;
      const thick = t < 0.35 && k === 0 ? 1 : 0;
      const col = glow && s >= L - 2 ? glowC(glow) : tone(A.root, 0.25 + (1 - t) * 0.35 + h3(s, k, x, 4) * 0.2);
      w.set(Math.round(px), y, Math.round(pz), col);
      if (thick) w.set(Math.round(px) + 1, y, Math.round(pz), tone(A.root, 0.2 + h3(s, k, 2, 2) * 0.3));
      // rootlets
      if (h3(s, k, x, 9) > 0.86) for (let r = 1; r < 4; r++) w.set(Math.round(px) + (k & 1 ? r : -r), y - r, Math.round(pz), tone(A.root, 0.45));
      if (A.leaf && h3(s, k, z, 7) > 0.93) w.set(Math.round(px), y, Math.round(pz) + 1, tone(A.leaf, 0.4 + h3(s, k, 1, 1) * 0.5));
    }
  }
}
/** Fern / leafy clump on the floor at (x, y = floor top + 1, z). r ~ frond length in voxels. */
export function fern(w, A, x, y, z, r = 9, seed = 1, flowers = 0) {
  const n = 5 + Math.floor(h3(x, z, seed, 2) * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + h3(k, seed, 1, 3) * 0.6, L = r * (0.6 + h3(k, x, z, 4) * 0.5);
    for (let s = 0; s <= L; s++) {
      const t = s / L, px = x + Math.cos(a) * s, pz = z + Math.sin(a) * s, py = y + Math.round(Math.sin(t * Math.PI * 0.85) * L * 0.45);
      w.set(Math.round(px), py, Math.round(pz), tone(A.leaf, 0.25 + t * 0.55 + (h3(s, k, 1, 5) > 0.8 ? 0.15 : 0)));
      if (s % 2 === 0 && t > 0.2 && t < 0.9) { const ox = -Math.sin(a), oz = Math.cos(a); w.set(Math.round(px + ox), py, Math.round(pz + oz), tone(A.leaf, 0.35 + t * 0.4)); w.set(Math.round(px - ox), py, Math.round(pz - oz), tone(A.leaf, 0.3 + t * 0.4)); }
    }
  }
  for (let k = 0; k < flowers; k++) {
    const fx = x + Math.round((h3(k, x, 3, seed) - 0.5) * r * 1.4), fz = z + Math.round((h3(k, z, 4, seed) - 0.5) * r * 1.4), fh = 3 + Math.floor(h3(k, 2, 5, seed) * 5);
    for (let s = 0; s < fh; s++) w.set(fx, y + s, fz, tone(A.leaf, 0.4));
    const fc = A.flowers[(((k + seed) | 0) % A.flowers.length + A.flowers.length) % A.flowers.length];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.set(fx + dx, y + fh, fz + dz, C(fc));
    w.set(fx, y + fh, fz, glowC('#fff2b0'));
  }
}
/** Moss / grass carpet patch on the floor top (raises tufts). */
export function tufts(w, A, x, y, z, r = 10, seed = 1, n = 18) {
  for (let k = 0; k < n; k++) {
    const px = x + Math.round((h3(k, seed, 1, 1) - 0.5) * r * 2), pz = z + Math.round((h3(seed, k, 2, 1) - 0.5) * r * 2), h = 1 + Math.floor(h3(k, 3, seed, 2) * 4);
    for (let s = 0; s < h; s++) w.set(px, y + s, pz, tone(A.moss, 0.3 + (s / h) * 0.6));
  }
}
/** Wall torch in an iron sconce. (x, y, z) = the flame's base (voxels), (nx, nz) = wall normal (into the room). */
export function sconce(w, A, x, y, z, nx, nz) {
  const IRON = [C('#26222e'), C('#3e3a4c'), C('#5e5a70'), C('#8a86a0')];
  // bracket from the wall
  for (let k = 0; k < 6; k++) w.set(x - nx * (6 - k), y - 6, z - nz * (6 - k), IRON[1 + (k & 1)]);
  for (let k = 0; k < 4; k++) w.set(x - nx * 5, y - 6 - k, z - nz * 5, IRON[1]);
  // cup + stick
  for (let k = -1; k <= 1; k++) for (let q = -1; q <= 1; q++) w.set(x + k, y - 6, z + q, IRON[2]);
  for (let s = 0; s < 6; s++) w.set(x, y - 6 + s, z, s > 3 ? C('#3a2216') : tone(pal(['#3a2416', '#5a3a22', '#7e5432']), 0.5));
  w.set(x, y, z, glowC('#ffd27a'));
}
/** Cascade of light bands for a crystal cluster colour. */
export function crystalCluster(w, x, y, z, h, col, seed = 1, n = 5) {
  for (let k = 0; k < n; k++) {
    const a = h3(k, seed, 1, 1) * Math.PI * 2, lean = (k === 0 ? 0.02 : 0.08) + h3(k, seed, 2, 2) * 0.26, L = Math.round(h * (k === 0 ? 1 : 0.4 + h3(k, seed, 3, 3) * 0.45));
    const r0 = Math.max(1, Math.round(1.2 + h3(k, seed, 4, 4) * 2.4));
    for (let s = 0; s < L; s++) {
      const t = s / L, r = Math.max(0.6, r0 * (1 - t * 0.85));
      const cx = x + Math.cos(a) * lean * s, cz = z + Math.sin(a) * lean * s, cy = y + s;
      for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const edge = dx * dx + dz * dz > (r - 1) * (r - 1);
        const [cr, cg, cb] = hexToRgb(col);
        const lit = dx < 0 || dz > 0; // facets: one side catches light, the other falls into shade
        const k2 = t > 0.86 ? 1.2 : edge ? (lit ? 0.95 : 0.6) : 1.1;
        const hex = '#' + [cr, cg, cb].map((v) => Math.min(255, Math.round(v * k2 + (t > 0.86 ? 50 : 0))).toString(16).padStart(2, '0')).join('');
        w.set(Math.round(cx + dx), cy, Math.round(cz + dz), (!edge || t > 0.86 || (s % 7 === k % 7 && lit) ? glowC(hex) : C(hex)) >>> 0);
      }
    }
  }
}
/** Chibi-ish petrified adventurer statue (grey stone, moss, cracks). (x, y = base, z), facing yaw (radians). */
export function statue(w, A, x, y, z, seed = 1, yaw = 0, pose = 0) {
  const stone = pal(['#3a3e3a', '#5a5e58', '#7a7e76', '#9ea29a', '#c4c8be']);
  const col = (px, py, pz, k = 0) => (noise2(px * 0.3 + seed, py * 0.3 + pz * 0.2) > 0.72 ? tone(A.moss, 0.3 + k * 0.3) : tone(stone, 0.35 + k + h3(px, py, pz, seed) * 0.12));
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const P = (lx, ly, lz) => [x + lx * cs - lz * sn, y + ly, z + lx * sn + lz * cs];
  const blob = (lx, ly, lz, rx, ry, rz, k = 0) => {
    const [cx, cy, cz] = P(lx, ly, lz), R = Math.max(rx, rz);
    for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) for (let pz = Math.floor(cz - R); pz <= Math.ceil(cz + R); pz++) for (let px = Math.floor(cx - R); px <= Math.ceil(cx + R); px++) {
      const dx = px + 0.5 - cx, dz = pz + 0.5 - cz, dy = py + 0.5 - cy;
      const ux = dx * cs + dz * sn, uz = -dx * sn + dz * cs;
      if ((ux / rx) ** 2 + (dy / ry) ** 2 + (uz / rz) ** 2 <= 1) w.set(px, py, pz, col(px, py, pz, k));
    }
  };
  // plinth
  for (let py = 0; py < 6; py++) for (let dz = -9; dz <= 9; dz++) for (let dx = -9; dx <= 9; dx++) if (dx * dx + dz * dz < 85 - py * 3) w.set(x + dx, y + py, z + dz, tone(stone, 0.25 + (py === 5 ? 0.2 : 0) + h3(dx, dz, py, 1) * 0.1));
  const by = 6;
  blob(-2.4, by + 5, 0, 2.2, 5, 2.4); blob(2.4, by + 5, 0, 2.2, 5, 2.4);          // legs
  blob(0, by + 14, 0, 5.4, 6, 4.2, 0.05);                                       // body
  blob(0, by + 25, 0, 6.2, 5.8, 5.6, 0.1);                                      // big chibi head
  blob(0, by + 30, -1, 6.6, 2.2, 6.2, 0.15);                                    // helmet / hood brim
  if (pose === 0) { blob(-6.6, by + 18, 0, 1.8, 4.4, 1.8); blob(6, by + 22, 0, 1.8, 4.4, 1.8); for (let k = 0; k < 22; k++) { const [px, py, pz] = P(7, by + 24 + k, 1); w.set(Math.round(px), Math.round(py), Math.round(pz), tone(stone, 0.55)); } }
  else if (pose === 1) { blob(-6, by + 14, 3, 1.8, 4, 2); blob(6, by + 14, 3, 1.8, 4, 2); blob(0, by + 15, 6, 6, 6, 1.4, 0.1); } // shield up
  else { blob(-5, by + 24, 3, 1.8, 3.6, 2); blob(5, by + 24, 3, 1.8, 3.6, 2); }                                                      // hands over face
  // cracks of jade light
  for (let k = 0; k < 6; k++) { const [px, py, pz] = P((h3(k, seed, 1, 1) - 0.5) * 8, by + 8 + k * 4, 3.6); w.set(Math.round(px), Math.round(py), Math.round(pz), glowC(A.glow)); }
}
/** Tattered hanging banner on a wall: (x, yTop, z), width (along u), length, wall normal (nx, nz). */
export function banner(w, x, yTop, z, wd, len, nx, nz, cloth, emblem = '#e8c86a', seed = 1) {
  const ux = Math.abs(nz) > 0.5 ? 1 : 0, uz = 1 - ux;
  for (let u = -wd; u <= wd; u++) for (let s = 0; s < len; s++) {
    const tatter = s > len - 6 && h3(u, s, seed, 2) > 0.55 - (len - s) * 0.08;
    if (tatter) continue;
    const fold = (u & 3) === 0 ? -1 : 0;
    const em = Math.abs(u) < wd * 0.45 && s > len * 0.25 && s < len * 0.6 && ((Math.abs(u) + s) % 5 < 2 || Math.abs(u) < 1);
    const c = em ? C(emblem) : tone(cloth, 0.35 + fold * 0.15 + (s < 2 ? 0.3 : 0) + h3(u, s, 1, seed) * 0.12);
    w.set(x + u * ux + nx, yTop - s, z + u * uz + nz, c);
  }
  for (let u = -wd - 2; u <= wd + 2; u++) w.set(x + u * ux + nx * 2, yTop + 1, z + u * uz + nz * 2, C('#3e3a4c'));
}
/** Cobweb in a wall/ceiling corner (thin NOAO strands). */
export function cobweb(w, x, y, z, r, ax, az, seed = 1) {
  const col = (NOAO | C('#c8c4d8')) >>> 0;
  for (let k = 0; k < 7; k++) { const a = (k / 6) * Math.PI * 0.5; for (let s = 0; s < r; s++) if ((s + k) % 2 === 0 || h3(s, k, seed, 1) > 0.5) w.set(x + Math.round(Math.cos(a) * s * ax), y - Math.round(Math.sin(a) * s), z + Math.round(Math.cos(a) * s * az)); }
  for (let ring = 4; ring < r; ring += 4) for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 0.5; w.set(x + Math.round(Math.cos(a) * ring * ax), y - Math.round(Math.sin(a) * ring), z + Math.round(Math.cos(a) * ring * az), col); }
}
/** Rubble pile (stones in the act's rock & brick colours). */
export function rubble(w, A, x, y, z, r = 8, seed = 1, n = 6) {
  for (let k = 0; k < n; k++) {
    const cx = x + (h3(k, seed, 1, 2) - 0.5) * r * 2, cz = z + (h3(seed, k, 2, 2) - 0.5) * r * 2, rr = 1.6 + h3(k, k, seed, 3) * r * 0.35;
    const brick = h3(k, 5, seed, 1) > 0.5;
    for (let py = 0; py <= rr; py++) for (let pz = Math.floor(cz - rr); pz <= cz + rr; pz++) for (let px = Math.floor(cx - rr); px <= cx + rr; px++) {
      const d = ((px - cx) ** 2 + (pz - cz) ** 2) / (rr * rr) + (py / rr) ** 2;
      if (d <= 1) w.set(px, y + py, pz, brick ? tone(A.brick, 0.3 + (py / rr) * 0.3 + h3(px, py, pz, 1) * 0.1) : tone(A.rock, 0.3 + (py / rr) * 0.35));
    }
  }
}
/** Ash tree with ember leaves (foundry): trunk from (x, y) up to height h, crown of glowing leaves. */
export function ashTree(w, A, x, y, z, h = 70, seed = 1) {
  const bark = pal(['#140c0c', '#22161a', '#342226', '#4a3036']);
  let px = x, pz = z;
  for (let s = 0; s < h; s++) {
    const r = 3.2 * (1 - s / h) + 1.2;
    px += Math.sin(s * 0.08 + seed) * 0.25; pz += Math.cos(s * 0.07 + seed) * 0.2;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dz * dz <= r * r) w.set(Math.round(px + dx), y + s, Math.round(pz + dz), h3(dx, s, dz, seed) > 0.95 ? glowC('#ff6a1a') : tone(bark, 0.3 + h3(dx, s, dz, 2) * 0.4));
    if (s > h * 0.45 && s % 9 === (seed % 9)) {
      const a = h3(s, seed, 1, 1) * Math.PI * 2, L = 10 + h3(s, seed, 2, 2) * 14;
      for (let k = 0; k < L; k++) w.set(Math.round(px + Math.cos(a) * k), y + s + Math.round(k * 0.45), Math.round(pz + Math.sin(a) * k), tone(bark, 0.5));
      leafBall(w, A, px + Math.cos(a) * L, y + s + L * 0.45, pz + Math.sin(a) * L, 5 + h3(s, 1, 1, seed) * 3, seed + s);
    }
  }
  leafBall(w, A, px, y + h, pz, 9, seed);
}
function leafBall(w, A, cx, cy, cz, r, seed) {
  for (let py = Math.floor(cy - r * 0.6); py <= cy + r * 0.7; py++) for (let pz = Math.floor(cz - r); pz <= cz + r; pz++) for (let px = Math.floor(cx - r); px <= cx + r; px++) {
    const d = ((px - cx) / r) ** 2 + ((py - cy) / (r * 0.7)) ** 2 + ((pz - cz) / r) ** 2;
    if (d > 1 || h3(px, py, pz, seed) > 0.72 - (1 - d) * 0.3) continue;
    const k = 0.3 + (py - cy + r) / (2 * r) * 0.6;
    w.set(px, py, pz, h3(px, py, pz, 3) > 0.7 ? (A.leaf[Math.min(4, 2 + Math.floor(k * 3))] | GLOW) >>> 0 : tone(A.leaf, k));
  }
}
/** Lily pads + a flower on the water at voxel y (top of pad). */
export function lilyPads(w, A, x, y, z, r = 30, seed = 1, n = 6) {
  for (let k = 0; k < n; k++) {
    const cx = x + Math.round((h3(k, seed, 1, 1) - 0.5) * r * 2), cz = z + Math.round((h3(seed, k, 2, 1) - 0.5) * r * 2), rr = 3 + h3(k, 3, seed, 2) * 3;
    const notch = h3(k, 4, seed, 3) * Math.PI * 2;
    for (let dz = -Math.ceil(rr); dz <= rr; dz++) for (let dx = -Math.ceil(rr); dx <= rr; dx++) {
      if (dx * dx + dz * dz > rr * rr) continue;
      const a = Math.atan2(dz, dx); if (Math.abs(((a - notch + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.35) continue;
      w.set(cx + dx, y, cz + dz, (NOAO | tone(A.leaf, 0.35 + (dx * dx + dz * dz < rr) * 0.25 + h3(dx, dz, k, 2) * 0.15)) >>> 0);
    }
    if (h3(k, 9, seed, 4) > 0.5) { const fc = A.flowers[k % A.flowers.length]; for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) w.set(cx + dx, y + 1, cz + dz, C(fc)); w.set(cx, y + 2, cz, glowC('#fff2b0')); }
  }
}
/** Ore vein bulging out of a wall: centre (x, y, z), wall normal (nx, nz), half-size (u along wall, v up). */
export function oreVein(w, A, x, y, z, nx, nz, hu = 18, hv = 14, seed = 1) {
  const ux = Math.abs(nz) > 0.5 ? 1 : 0, uz = 1 - ux;
  const dir = h3(seed, 1, 2, 3) > 0.5 ? 1 : -1;
  const put = (u, v, d, c) => w.set(x + u * ux + nx * d, y + v, z + u * uz + nz * d, c);
  // a rough boss of darker rock breaking through the masonry
  for (let v = -hv - 4; v <= hv + 4; v++) for (let u = -hu - 4; u <= hu + 4; u++) {
    const r = (u / hu) ** 2 + (v / hv) ** 2 + (noise2(u * 0.2 + seed, v * 0.2) - 0.5) * 0.5;
    if (r > 1.25) continue;
    const out = Math.round(2.6 * (1 - Math.min(1, r)) + (noise2(u * 0.3, v * 0.3 + seed) - 0.5) * 2);
    for (let d = 0; d <= Math.max(0, out); d++) put(u, v, d, tone(A.rock, 0.18 + (1 - Math.min(1, r)) * 0.3 + (d === out ? 0.08 : 0) + h3(u, v, d, 4) * 0.08));
  }
  // nuggets of ore along a wavy seam, each a little faceted blob with a bright facet and glints
  const n = Math.round((hu * hv) / 14);
  for (let k = 0; k < n; k++) {
    const u0 = (h3(k, seed, 1, 1) - 0.5) * hu * 1.8, v0 = u0 * 0.45 * dir + Math.sin(u0 * 0.25 + seed) * 3 + (h3(k, seed, 2, 2) - 0.5) * 9;
    if ((u0 / hu) ** 2 + (v0 / hv) ** 2 > 0.85) continue;
    const rr = 1.4 + h3(k, seed, 3, 3) * 2.4, oi = Math.floor(h3(k, seed, 4, 4) * A.ore.length);
    const base = A.ore[oi], [br, bg, bb] = hexToRgb(base);
    const shade = (f) => '#' + [br, bg, bb].map((q) => Math.max(0, Math.min(255, Math.round(q * f))).toString(16).padStart(2, '0')).join('');
    const out0 = Math.round(2.6 * (1 - ((u0 / hu) ** 2 + (v0 / hv) ** 2)));
    for (let dv = -Math.ceil(rr); dv <= rr; dv++) for (let du = -Math.ceil(rr); du <= rr; du++) for (let d = 0; d <= Math.ceil(rr * 0.8); d++) {
      if ((du / rr) ** 2 + (dv / rr) ** 2 + (d / (rr * 0.8)) ** 2 > 1) continue;
      const facet = du - dv > 0 ? 1.15 : 0.72;
      const glint = h3(du, dv, d + k, 9) > 0.86;
      put(Math.round(u0 + du), Math.round(v0 + dv), out0 + d, glint ? glowC(A.oreGlow) : d === Math.ceil(rr * 0.8) || facet > 1 ? (h3(du, dv, k, 5) > 0.5 ? glowC(shade(facet)) : C(shade(facet))) : C(shade(facet * 0.8)));
    }
  }
}

// ---------------------------------------------------------------------------- the piece (plan + streaming bake)
/**
 * A walk-through piece under construction: ops with voxel AABBs, lamps baked into the voxels,
 * flames, water/lava planes, waterfalls, light shafts. build() turns it into a Stage (st).
 */
export class Piece {
  constructor(L, A, seed = 1) {
    this.L = L; this.A = A; this.seed = seed;
    this.ops = []; this.lamps = []; this.flames = []; this.waters = []; this.falls = []; this.shafts = []; this.lights = [];
    this.ops.push({ x0: L.X0, x1: L.X1, z0: L.Z0, z1: L.Z1, fn: (w) => paintShell(L, A, w) });
  }
  /** Add a painter covering world-metre box [x0,x1]×[z0,z1]. */
  op(x0, x1, z0, z1, fn) { this.ops.push({ x0: Math.floor(Math.min(x0, x1) / S) - 2, x1: Math.ceil(Math.max(x0, x1) / S) + 2, z0: Math.floor(Math.min(z0, z1) / S) - 2, z1: Math.ceil(Math.max(z0, z1) / S) + 2, fn }); }
  lamp(x, y, z, c, r = 3.2, i = 1) { this.lamps.push({ x, y, z, c, r, i }); }
  flame(x, y, z, scale = 1, palette = 'fire') { this.flames.push({ x, y, z, scale, palette }); }
  /** Torch on a wall at world (x, y, z), wall normal (nx, nz) into the room. */
  torch(x, y, z, nx, nz, col, palette) {
    const X = vx(x), Y = vx(y), Z = vx(z);
    this.op(x - 0.4, x + 0.4, z - 0.4, z + 0.4, (w) => sconce(w, this.A, X, Y, Z, Math.round(nx), Math.round(nz)));
    this.flame(x, y + 0.02, z, 0.7, palette || this.A.flame || 'fire');
    this.lamp(x + nx * 0.25, y + 0.2, z + nz * 0.25, col || this.A.lamp, 4.8, 1.7);
    this.lights.push({ x: x + nx * 0.3, y: y + 0.2, z: z + nz * 0.3, c: col || this.A.lamp, i: 2.6, r: 5 });
  }
  water(x0, x1, z0, z1, y, col) { this.waters.push({ x0, x1, z0, z1, y, col: col || this.A.water, lava: false }); }
  lava(x0, x1, z0, z1, y) { this.waters.push({ x0, x1, z0, z1, y, col: '#ff6a1a', lava: true }); }
  waterfall(x, yTop, yBot, z, wd, nx, nz) { this.falls.push({ x, yTop, yBot, z, wd, nx, nz }); }
  shaft(x, yTop, z, wd, h, col, k = 0.35) { this.shafts.push({ x, yTop, z, wd, h, col, k }); }

  /** Build the Stage. opts: { stream: true (bake around the camera), radius (m), tile (voxels), sync: [x0,x1,z0,z1] metres baked at once } */
  build(StageCls, kind, actIdx, opts = {}) {
    const L = this.L, A = this.A;
    const st = new StageCls(kind, actIdx, A);
    st.layout = L;
    st.fog.density = A.fogD; st.fogDensity = A.fogD;
    const rig = makeLightRig({ amb: A.amb, ambI: opts.ambI ?? 0.62, sky: A.sky, skyI: 0.22, key: A.key, keyI: A.keyI, keyDir: [-0.3, 1, 0.4], lamps: this.lamps.map((l) => ({ ...l, i: l.i * 1.35 })), bands: 22 });
    const seen = (x, y, z) => L.seen(x, y, z);
    st.bakeRig = rig;
    const TS = opts.tile || 64;
    const tiles = new Map();
    const timing = st.timing = { paint: 0, shell: 0, mesh: 0, chunks: 0 };
    const glowK = opts.glowK ?? 1.6;
    const bakeTile = (tx, tz, yTop = BIG) => {
      const b = { x0: tx * TS, x1: tx * TS + TS, z0: tz * TS, z1: tz * TS + TS };
      const clip = { x0: b.x0 - 2, x1: b.x1 + 2, y0: -BIG, y1: yTop === BIG ? BIG : yTop + 2, z0: b.z0 - 2, z1: b.z1 + 2 };
      const w = new VWorld(clip);
      const tp = performance.now();
      for (const op of this.ops) if (op.x1 >= clip.x0 && op.x0 <= clip.x1 && op.z1 >= clip.z0 && op.z0 <= clip.z1) { const t1 = performance.now(); op.fn(w); if (op === this.ops[0]) timing.shell += performance.now() - t1; }
      const tm = performance.now();
      timing.paint += tm - tp;
      const res = meshWorld(w, { light: rig, bounds: { x0: b.x0, x1: b.x1, y0: -BIG, y1: yTop, z0: b.z0, z1: b.z1 }, skip: new Set(), bottomAbove: -1e9, seen });
      timing.mesh += performance.now() - tm; timing.chunks += w.chunks.size;
      const g = worldMeshes(res, glowK);
      for (const m of g.children) { m.matrixAutoUpdate = false; m.updateMatrix(); }
      st.env.add(g);
      st.faces = (st.faces || 0) + res.faces;
      return { g, faces: res.faces };
    };
    const txa = Math.floor(L.X0 / TS), txb = Math.floor((L.X1 - 1) / TS), tza = Math.floor(L.Z0 / TS), tzb = Math.floor((L.Z1 - 1) / TS);
    const all = [];
    for (let tz = tza; tz <= tzb; tz++) for (let tx = txa; tx <= txb; tx++) {
      // skip tiles with nothing of the space in them
      let any = false;
      for (let Z = Math.max(L.Z0, tz * TS - 4); Z < Math.min(L.Z1, tz * TS + TS + 4) && !any; Z += 2) for (let X = Math.max(L.X0, tx * TS - 4); X < Math.min(L.X1, tx * TS + TS + 4); X += 2) { const i = L.i(X, Z); if (i >= 0 && (L.inside[i] || L.dist[i] <= L.T)) { any = true; break; } }
      if (any) all.push({ tx, tz, cx: (tx * TS + TS / 2) * S, cz: (tz * TS + TS / 2) * S });
    }
    const R = opts.radius ?? 1e9;
    st.tiles = { all, tiles, bakeTile, TS };
    // tiles that arrive after the first frame fade up out of the dark instead of popping in
    const fading = [];
    let firstFrameDone = false;
    const ensure = (t, low = false) => {
      const k = t.tx + ',' + t.tz, had = tiles.get(k);
      if (had && !had.partial) return;
      if (had && low) return;
      const tile = bakeTile(t.tx, t.tz, low ? Math.round(opts.syncTop / S) : BIG);
      tile.partial = low;
      if (had) { st.env.remove(had.g); had.g.traverse((o) => o.geometry && o.geometry.dispose()); tiles.set(k, tile); return; } // the rest of a first-frame tile: swap in place
      tiles.set(k, tile);
      if (opts.fadeIn && firstFrameDone) for (const m of tile.g.children) { const orig = m.material, fm = orig.clone(); fm.color = orig.color.clone().multiplyScalar(0); m.material = fm; fading.push({ m, orig, fm, t: 0 }); }
    };
    st.updaters.push((dt) => {
      firstFrameDone = true;
      for (let i = fading.length - 1; i >= 0; i--) {
        const f = fading[i]; f.t += dt;
        const k = Math.min(1, f.t / 0.8);
        if (k >= 1) { f.m.material = f.orig; f.fm.dispose(); fading.splice(i, 1); } else f.fm.color.copy(f.orig.color).multiplyScalar(k * k * (3 - 2 * k));
      }
    });
    // what must exist before the first frame
    const sync = opts.sync;
    for (const t of all) {
      const inSync = sync ? t.cx + TS * S / 2 > sync[0] && t.cx - TS * S / 2 < sync[1] && t.cz + TS * S / 2 > sync[2] && t.cz - TS * S / 2 < sync[3] : !opts.stream;
      if (inSync) ensure(t, !!opts.syncTop);
    }
    // the rest streams in, nearest first, within a frame budget; far tiles of long pieces are freed
    const budget = opts.budgetMs ?? 7;
    const focus = new THREE.Vector3(), fwd = new THREE.Vector3();
    st.stream = {
      want() {},
      pending() { return all.some((t) => { const h = tiles.get(t.tx + ',' + t.tz); return !h || h.partial; }); },
      step() {
        const cam = st._cam;
        if (cam) { cam.getWorldDirection(fwd); cam.getWorldPosition(focus).addScaledVector(fwd, opts.ahead ?? 4); st.group.updateWorldMatrix(true, false); st.group.worldToLocal(focus); } else if (st.focusPos) focus.copy(st.focusPos);
        const Rr = cam || st.focusPos ? R : 1e9; // nobody to stream around: build it all, nearest first
        const t0 = performance.now();
        const need = (t) => { const h = tiles.get(t.tx + ',' + t.tz); return !h || h.partial; };
        const want = all.filter((t) => need(t) && Math.hypot(t.cx - focus.x, t.cz - focus.z) < Rr).sort((a, b) => Math.hypot(a.cx - focus.x, a.cz - focus.z) - Math.hypot(b.cx - focus.x, b.cz - focus.z));
        for (const t of want) { ensure(t); if (performance.now() - t0 > budget) break; }
        if (Rr < 1e8) for (const [k, v] of tiles) {
          const [tx, tz] = k.split(',').map(Number), cx = (tx * TS + TS / 2) * S, cz = (tz * TS + TS / 2) * S;
          if (Math.hypot(cx - focus.x, cz - focus.z) > R + 6) { st.env.remove(v.g); v.g.traverse((o) => o.geometry && o.geometry.dispose()); tiles.delete(k); }
        }
      },
      all() { for (const t of all) ensure(t); },
    };
    if (!opts.stream && !sync) st.stream.all();
    st.firstFrame = { ...timing, faces: st.faces || 0, tiles: tiles.size }; // what the first frame cost
    // flames (billboards), water and lava sheets, waterfalls, light shafts
    for (const f of this.flames) st.addFlame(f.x, f.y, f.z, f.scale, f.palette, false, true);
    for (const wv of this.waters) addSheet(st, wv);
    for (const f of this.falls) addFall(st, f, A);
    for (const s of this.shafts) for (const rot of [0, Math.PI / 2]) { const m = st.addShaft(s.x, s.yTop, s.z, s.wd, s.h, s.col, 0, s.k); m.rotation.y = rot; }
    // actors: a sky/ground fill and a small pool of real lights that follows the camera to the nearest torches
    const hemi = new THREE.HemisphereLight(new THREE.Color(A.sky), new THREE.Color(A.amb), 1.0);
    st.group.add(hemi); st.lights.push(hemi);
    const pool = [];
    for (let k = 0; k < (opts.poolLights ?? 3); k++) { const p = new THREE.PointLight(0xffffff, 0, 5, 1.4); st.group.add(p); pool.push(p); st.lights.push(p); }
    st.lightSources = this.lights;
    const carry = new THREE.PointLight(new THREE.Color(A.lamp), opts.carryLight ?? 1.2, 6, 1.4);
    st.group.add(carry); st.lights.push(carry); st.carryLight = carry;
    const camLocal = new THREE.Vector3();
    st.updaters.push((dt, t) => {
      const cam = st._cam; if (!cam) return;
      // everything here lives in the piece's own frame (pieces are placed end to end and turned)
      st.group.updateWorldMatrix(true, false);
      const p = st.group.worldToLocal(cam.getWorldPosition(camLocal));
      carry.position.set(p.x, p.y - 0.15, p.z);
      const near = this.lights.slice().sort((a, b) => ((a.x - p.x) ** 2 + (a.z - p.z) ** 2) - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2)).slice(0, pool.length);
      pool.forEach((l, i) => { const s = near[i]; if (!s) { l.intensity = 0; return; } l.position.set(s.x, s.y, s.z); l.color.set(s.c); l.distance = s.r; l.intensity = s.i * (0.85 + 0.15 * noise2(t * 5, i)); });
      st.focus.copy(p);
    });
    st.focus.set(0, 1, 0);
    return st;
  }
}

/** Translucent animated water (or glowing lava) sheet. */
function addSheet(st, s) {
  const [r, g, b] = hexToRgb(s.col);
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d'), img = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4, n = noise2(x * 0.15, y * 0.15), gl = h3(x, y, 1, 9);
    if (s.lava) { const k = 0.55 + n * 0.6; img.data[i] = Math.min(255, r * k + 40); img.data[i + 1] = Math.min(255, g * k * 0.9); img.data[i + 2] = b * 0.4; img.data[i + 3] = 235; }
    else { const glint = gl > 0.985 || (gl > 0.96 && (x + y * 3) % 7 === 0); img.data[i] = glint ? 230 : r * (0.3 + n * 0.25); img.data[i + 1] = glint ? 250 : g * (0.42 + n * 0.25); img.data[i + 2] = glint ? 255 : b * (0.55 + n * 0.2); img.data[i + 3] = glint ? 220 : 150; }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set((s.x1 - s.x0) / 1.6, (s.z1 - s.z0) / 1.6);
  const mat = s.lava ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.4, 1.2), fog: true })
    : new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0).rotateX(-Math.PI / 2), mat);
  m.position.set((s.x0 + s.x1) / 2, s.y, (s.z0 + s.z1) / 2);
  m.renderOrder = 4;
  if (!s.lava) m.layers.set(LAYER_FX);
  st.group.add(m);
  const sp = s.lava ? 0.015 : 0.03;
  st.updaters.push((dt, t) => { tex.offset.x = t * sp; tex.offset.y = Math.sin(t * 0.4) * 0.05; });
  if (s.lava) st.emitters.push((dt) => { if (rnd.chance(dt * 10 * (s.x1 - s.x0) * (s.z1 - s.z0) / 8)) st.P.add.emit({ pos: [rnd.float(s.x0, s.x1), s.y + 0.05, rnd.float(s.z0, s.z1)], vel: [rnd.float(-0.1, 0.1), rnd.float(0.6, 1.4), 0], spread: 0.1, life: [1, 2.5], size: 1, color: ['#ffc85a', '#ff8a2a', '#fff0b0'], colorEnd: '#ff2a00', glow: 3, swirl: 0.5 }); });
  else st.emitters.push((dt) => { if (rnd.chance(dt * 2 * (s.x1 - s.x0) * (s.z1 - s.z0) / 6)) st.P.add.emit({ pos: [rnd.float(s.x0, s.x1), s.y + 0.02, rnd.float(s.z0, s.z1)], vel: [0, 0.05, 0], life: [0.3, 0.8], size: 1, color: ['#e8ffff', '#bff4ff'], glow: 2.5, flicker: 0.6 }); });
  return m;
}
/** Waterfall: a scrolling sheet from yTop to yBot with mist and splash. */
function addFall(st, f, A) {
  const [r, g, b] = hexToRgb(A.water || '#56cce0');
  const c = document.createElement('canvas'); c.width = 16; c.height = 64;
  const ctx = c.getContext('2d'), img = ctx.createImageData(16, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4, streak = noise2(x * 0.9, y * 0.06) , edge = Math.min(x, 15 - x) < 2;
    const k = streak > 0.62 ? 1 : streak > 0.45 ? 0.75 : 0.5;
    img.data[i] = Math.min(255, r * k + (k === 1 ? 90 : 20)); img.data[i + 1] = Math.min(255, g * k + (k === 1 ? 70 : 20)); img.data[i + 2] = Math.min(255, b * k + 40); img.data[i + 3] = edge ? 90 : 170 + (k === 1 ? 60 : 0);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, (f.yTop - f.yBot) / 0.8);
  const h = f.yTop - f.yBot;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(f.wd, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1.3, 1.3, 1.35), fog: true, side: THREE.DoubleSide }));
  m.position.set(f.x, f.yBot + h / 2, f.z);
  m.rotation.y = Math.atan2(f.nx, f.nz);
  m.renderOrder = 5; m.layers.set(LAYER_FX);
  st.group.add(m);
  st.updaters.push((dt, t) => { tex.offset.y = t * 1.6; });
  st.emitters.push((dt) => {
    if (rnd.chance(dt * 14)) st.P.alpha.emit({ pos: [f.x + rnd.float(-f.wd / 2, f.wd / 2), f.yBot + 0.05, f.z + f.nz * 0.1], vel: [rnd.float(-0.3, 0.3), rnd.float(0.4, 1.0), rnd.float(0, 0.4)], spread: 0.1, life: [0.4, 0.9], size: 1, gravity: -3, color: '#e8fbff', alpha: 0.85 });
    if (rnd.chance(dt * 3)) st.P.alpha.emit({ pos: [f.x, f.yBot + 0.2, f.z + 0.2], vel: [0, 0.15, 0.1], spread: 0.1, life: [1.5, 3], size: [1, 2], sizeEnd: 3, color: '#cfe8f0', alpha: 0.25 });
  });
  st.lightSources && st.lightSources.push({ x: f.x, y: f.yBot + 0.5, z: f.z, c: A.water, i: 0.8, r: 3 });
}

/** Ambient particles around the camera for first-person spaces. kinds: dust motes fireflies spores embers glints drips petals */
export function fpAmbient(st, kinds, A) {
  const L = st.layout;
  const around = (dy = 0) => { const p = st.focus; return [p.x + rnd.float(-3.5, 3.5), p.y + dy + rnd.float(-0.6, 1.4), p.z + rnd.float(-5, 1.5)]; };
  const ok = (p) => !L || L.isInside(p[0], p[2]);
  st.emitters.push((dt) => {
    for (const k of kinds) {
      let p;
      if (k === 'dust' && rnd.chance(dt * 9) && ok(p = around())) st.P.alpha.emit({ pos: p, vel: [0.04, 0.015, 0], spread: 0.03, life: [3, 6], size: 1, color: '#e8dcd0', alpha: 0.4, fadeIn: 1 });
      if (k === 'motes' && rnd.chance(dt * 5) && ok(p = around())) st.P.add.emit({ pos: p, vel: [0.02, 0.03, 0], spread: 0.02, life: [3, 5], size: 1, color: ['#ffe0b0', '#ffc8a0'], glow: 1.4, fadeIn: 1, swirl: 0.3 });
      if (k === 'fireflies' && rnd.chance(dt * 3) && ok(p = around())) st.P.add.emit({ pos: p, vel: [rnd.float(-0.15, 0.15), rnd.float(-0.05, 0.1), rnd.float(-0.15, 0.15)], spread: 0.1, life: [3, 5], size: [1, 2], color: ['#e8ff8a', '#9affc8'], glow: 3, flicker: 0.7, swirl: 1, fadeIn: 0.6 });
      if (k === 'spores' && rnd.chance(dt * 8) && ok(p = around())) st.P.add.emit({ pos: p, vel: [0.04, 0.08, 0], spread: 0.05, life: [3, 6], size: 1, color: [A.glow, '#d8ff8a'], glow: 2, fadeIn: 0.8, swirl: 0.4 });
      if (k === 'embers' && rnd.chance(dt * 12) && ok(p = around(-0.8))) st.P.add.emit({ pos: p, vel: [rnd.float(-0.1, 0.2), rnd.float(0.4, 1.0), 0], spread: 0.12, life: [1.5, 3.5], size: 1, color: ['#ffb43a', '#ff6a1a', '#ffe08a'], colorEnd: '#ff2a00', glow: 3, swirl: 0.6 });
      if (k === 'glints' && rnd.chance(dt * 7) && ok(p = around())) st.P.add.emit({ pos: p, vel: [0, 0.03, 0], spread: 0.03, life: [0.4, 1.2], size: [1, 2], color: [A.crystal, A.crystal2 || '#ffffff', '#ffffff'], glow: 3, flicker: 0.6 });
      if (k === 'petals' && rnd.chance(dt * 3) && ok(p = around(1))) st.P.alpha.emit({ pos: p, vel: [0.1, -0.12, 0.05], spread: 0.06, life: [3, 6], size: 1, color: A.flowers.slice(0, 3), alpha: 0.85, swirl: 0.8 });
      if (k === 'drips' && rnd.chance(dt * 1.6)) {
        const q = around(); if (!L || !L.isInside(q[0], q[2])) continue;
        const top = L.ceilAt(q[0], q[2]), fl = L.floorAt(q[0], q[2]);
        if (top !== null && fl !== null) st.P.alpha.emit({ pos: [q[0], top - 0.05, q[2]], vel: [0, -4, 0], life: [0.9, 1.2], size: 1, color: A.water || '#c8d8e0', alpha: 0.9, floor: fl, bounce: 0.1 });
      }
    }
  });
}
export { NOAO, GLOW };
