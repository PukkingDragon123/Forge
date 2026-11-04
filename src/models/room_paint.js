// Voxel painters for the top-down rooms (room_vox.js): floors, walls with doorways, obstacles,
// floor & wall dressing, door gates and the coarse Hades-style backdrops. Every painter writes into
// a VWorld in voxel ints (0.04 m) — or, for backdrops, in coarse units (ctx.BS) — and clamps its
// loops to the world's clip box, so a tile bake only pays for what lies inside the tile.
// Room space: centred on the origin, floor surface at y = 0 (top floor voxel y = -1), x → east,
// z → south (toward the camera).
import { S, C, glowC, mixC, tone, h3, ell, cyl, seg } from './stage_vox_kit.js';
import * as PR from './stage_vox_props.js';
import { ACT_STYLES, MAT, floorColor, wallColor, fern, tufts, crystalCluster, statue as statueFig, rubble, ashTree, roots as hangRoots, oreVein } from './stage_vox_layout.js';
import { noise2, hexToRgb } from '../core/math.js';

const pal = (a) => a.map(C);
const clampi = (v, a, b) => (v < a ? a : v > b ? b : v);
const pm = (i, n) => (((Math.round(i) % n) + n) % n);
/** Cap palette + gill colour for an index (any integer). */
const capOf = (A, i) => { const caps = A.caps || SHROOM.caps, gills = A.gills || SHROOM.gills; return [caps[pm(i, caps.length)], gills[pm(i, gills.length)]]; };
const shadeHex = (hex, f, add = 0) => { const [r, g, b] = hexToRgb(hex); return '#' + [r, g, b].map((q) => Math.max(0, Math.min(255, Math.round(q * f + add))).toString(16).padStart(2, '0')).join(''); };

// ---------------------------------------------------------------------------- stage styles
const SHROOM = {
  ...ACT_STYLES[0], id: 'shroom',
  brick: pal(['#1c2628', '#283836', '#384c46', '#4c6258', '#667c6c', '#8a9e86']), mortar: C('#121a1a'),
  rock: pal(['#18201f', '#24302c', '#32423a', '#46574a', '#606f5c']),
  flag: pal(['#1e2a28', '#2a3a34', '#3a4c42', '#4e6252', '#6a7c66']), joint: C('#121a18'),
  dirt: pal(['#2a2420', '#3c3226', '#524430', '#6c5a3e']),
  moss: pal(['#1c4a30', '#2a6e36', '#40963c', '#6cc046', '#acea64']),
  leaf: pal(['#18482f', '#266c38', '#3a9442', '#66c052', '#a6ea74']),
  root: pal(['#22150e', '#3a2516', '#583a22', '#785432', '#987246']),
  flowers: ['#ff8ad0', '#ffd45e', '#9ae8ff', '#ffffff'],
  water: '#4ad8c8', waterDeep: '#0e3a36',
  lamp: '#ffb05a', lamp2: '#7affd8', glow: '#7affd8', crystal: '#9ae8ff',
  amb: '#3c3e7c', sky: '#86c0d0', key: '#ffe8c8', keyI: 0.16,
  fog: '#0c1c1c', bg: '#071012', fogD: 0.02,
  ore: ['#e08a4a', '#d8d8e8', '#ffd27a'], oreGlow: '#fff0b0', marble: false, wallMix: 0.3,
  caps: [pal(['#5a1e3e', '#8e2e5a', '#c8487a', '#f07aa4', '#ffb4cc']), pal(['#5a2a12', '#9a4a1a', '#d8762a', '#f8a84a', '#ffd88a']), pal(['#12404a', '#1e6a6e', '#2e9a92', '#5ad0b8', '#a8f4dc']), pal(['#2e1e5a', '#48308e', '#6a4ac0', '#9a7ae4', '#cab4ff'])],
  gills: ['#ff9ae8', '#ffd27a', '#7affd8', '#c8a8ff'],
  stem: pal(['#6a5e52', '#968a78', '#c4b8a0', '#e8dec6', '#fff8e8']),
  backdrop: 'mushrooms', ambient: ['spores', 'fireflies', 'motes'],
};
export const ROOM_STYLES = [
  SHROOM,
  { ...ACT_STYLES[1], fogD: 0.02, caps: [pal(['#1e2a5a', '#2e4490', '#4a6ac8', '#7aa4f0', '#b8d8ff'])], gills: ['#9af0ff', '#ff8ae0'], stem: SHROOM.stem, backdrop: 'crystals', ambient: ['glints', 'motes'] },
  { ...ACT_STYLES[2], fogD: 0.018, caps: [pal(['#4a1a10', '#8a2e14', '#d8541a', '#ff8a2a', '#ffc85a'])], gills: ['#ffc85a', '#ff6a1a'], stem: pal(['#2a1a1a', '#3e2622', '#54342c', '#6e4436', '#8a5a44']), backdrop: 'lava', ambient: ['embers', 'motes'] },
  { ...ACT_STYLES[3], fogD: 0.018, caps: [pal(['#3a1e4a', '#5e3080', '#8a4ab0', '#b47ad8', '#e0b8ff'])], gills: ['#7affc8', '#ffb4d8'], stem: SHROOM.stem, backdrop: 'ruins', ambient: ['petals', 'fireflies', 'motes'] },
];

// ---------------------------------------------------------------------------- loop helpers (clip-aware)
/** Iterate voxel columns of a metre box that fall inside the world's clip: fn(X, Z, x, z). */
function cols(w, x0, x1, z0, z1, fn) {
  const [xa, xb] = w.rx(Math.floor(x0 / S), Math.ceil(x1 / S));
  const [za, zb] = w.rz(Math.floor(z0 / S), Math.ceil(z1 / S));
  for (let Z = za; Z < zb; Z++) for (let X = xa; X < xb; X++) fn(X, Z, (X + 0.5) * S, (Z + 0.5) * S);
}
const touches = (w, x0, x1, z0, z1, pad = 0) => {
  const c = w.clip; if (!c) return true;
  return Math.ceil(x1 / S) + pad > c.x0 && Math.floor(x0 / S) - pad < c.x1 && Math.ceil(z1 / S) + pad > c.z0 && Math.floor(z0 / S) - pad < c.z1;
};

// ---------------------------------------------------------------------------- floor
/** Is (x, z) within 0.12 m of an edge its tile shares with a pit tile? */
function pitNear(grid, tx, tz, x, z) {
  const t = grid.tile, x0 = (tx - grid.w / 2) * t, z0 = (tz - grid.h / 2) * t;
  return (x - x0 < 0.12 && grid.get(tx - 1, tz) === 3) || (x0 + t - x < 0.12 && grid.get(tx + 1, tz) === 3)
    || (z - z0 < 0.12 && grid.get(tx, tz - 1) === 3) || (z0 + t - z < 0.12 && grid.get(tx, tz + 1) === 3);
}
/** Floor slab (4 voxels) with flagstones, moss and dirt, holes for pits, a glowing mycelium web. */
export function paintFloor(w, ctx) {
  const { A, grid, HW, HD, stage } = ctx;
  const t = grid.tile;
  cols(w, -HW, HW, -HD, HD, (X, Z, x, z) => {
    const [tx, tz] = grid.toTile(x, z);
    const v = grid.get(tx, tz);
    if (v === 3) return;
    // distance to the room edge (voxels) feeds the moss creeping in from the walls
    const nw = Math.min(HW - Math.abs(x), HD - Math.abs(z)) / S;
    const mat = ctx.matAt ? ctx.matAt(x, z) : MAT.STONE;
    for (let y = -4; y <= -1; y++) {
      let c = floorColor(A, X, y, Z, -1 - y, mat, nw);
      if (y === -1 && stage === 0) {
        // mycelium threads: thin glowing filaments wandering between the stones
        const m = noise2(X * 0.045 + 13, Z * 0.045) ;
        if (Math.abs(m - 0.5) < 0.012 && noise2(X * 0.02, Z * 0.02 + 5) > 0.55) c = glowC(h3(X, Z, 1, 4) > 0.5 ? '#7affd8' : '#c8fff0');
        else if (Math.abs(m - 0.5) < 0.03 && noise2(X * 0.02, Z * 0.02 + 5) > 0.5) c = mixC(c, C('#d8e8c8'), 0.35);
      }
      w.set(X, y, Z, c);
    }
    // pit rims: darker broken flagstones along an edge shared with a pit tile
    if (pitNear(grid, tx, tz, x, z)) w.set(X, -1, Z, tone(A.rock, 0.12 + h3(X, Z, 3, 3) * 0.1));
  });
  // pit walls going down into the dark, with roots and a few glowing caps clinging on
  for (const p of ctx.pitEdges || []) {
    if (!touches(w, p.x0, p.x1, p.z0, p.z1, 2)) continue;
    cols(w, p.x0, p.x1, p.z0, p.z1, (X, Z) => {
      for (let y = -40; y < -4; y++) {
        const k = (y + 40) / 36;
        let c = tone(A.rock, 0.06 + k * 0.22 + h3(X, y, Z, 7) * 0.06);
        if (noise2(X * 0.2, y * 0.15 + Z * 0.2) > 0.78) c = tone(A.root, 0.2 + k * 0.3);
        if (h3(X, y, Z, 9) > 0.996 && stage === 0) c = glowC(SHROOM.gills[(X + y) & 3]);
        w.set(X, y, Z, c);
      }
    });
  }
}

// ---------------------------------------------------------------------------- walls
const ARCH = (u, hw, h) => { const a = Math.abs(u) / hw; return a >= 1 ? -1 : h - hw * 0.55 * (1 - Math.sqrt(Math.max(0, 1 - a * a))); };
/** Wall height profile (metres) along each side. */
export function wallHeights(ctx) {
  const { HD, D, kind } = ctx;
  const north = kind === 'chase' ? 2.4 : 2.3;
  return {
    north,
    side: (z) => 2.0 - 1.45 * clampi((z + HD) / D, 0, 1),   // tall at the back, low near the camera
    south: 0.5,
  };
}
/** The four walls with their doorways (openings only; gates are separate meshes), corner towers, capstones, moss. */
export function paintWalls(w, ctx) {
  const { A, HW, HD, doors } = ctx;
  const WT = 0.5, H = wallHeights(ctx);
  const DW = 1.0; // doorway half-width (m) — 4 tiles
  const open = (d) => doors[d] && doors[d] !== false;
  const yv = (m) => Math.round(m / S);
  const cap = (X, y, Z, along) => (h3(Math.floor(along / 9), 0, 3, 7) > 0.5 ? tone(A.brick, 0.62 + h3(X, Z, y, 2) * 0.12) : tone(A.brick, 0.5 + h3(X, Z, y, 3) * 0.1));
  const mossTop = (X, Z, y, c) => (noise2(X * 0.08 + 2, Z * 0.08) > 0.38 ? tone(A.moss, 0.3 + noise2(X * 0.4, Z * 0.4) * 0.55 + (h3(X, y, Z, 5) > 0.8 ? 0.15 : 0)) : c);
  // ---- north wall (the face the camera looks at): bricks, an arched doorway, a deep passage behind it
  if (touches(w, -HW - WT, HW + WT, -HD - 1.6, -HD)) {
    const top = yv(H.north);
    cols(w, -HW - WT, HW + WT, -HD - WT - 0.3, -HD, (X, Z, x, z) => {
      const u = x, inDoor = open('n') && Math.abs(u) < DW + 0.25;
      const archTop = inDoor ? ARCH(u, DW, 2.0) : -1;
      const jag = Math.round(noise2(X * 0.05, 9) * 3 + noise2(X * 0.21, 3) * 2);
      const yTop = top + jag;
      for (let y = -4; y <= yTop; y++) {
        const m = (y + 0.5) * S;
        if (archTop > 0 && m < archTop && Math.abs(u) < DW) continue; // the opening
        let c;
        if (y >= yTop - 1) c = mossTop(X, Z, y, cap(X, y, Z, X));
        else c = wallColor(A, X, y, Z, X, 0, -1);
        // voussoirs: lighter stones framing the arch
        if (archTop > 0 && Math.abs(u) >= DW - 0.04 && Math.abs(u) < DW + 0.25 && m < archTop + 0.25) c = tone(A.brick, 0.66 + h3(Math.floor(y / 6), X > 0 ? 1 : 0, 2, 3) * 0.14);
        if (archTop > 0 && Math.abs(u) < DW && m >= archTop && m < archTop + 0.25) c = (Math.abs(u) < 0.14 ? (ctx.doors.n === 'boss' ? glowC('#ff5ab4') : tone(A.brick, 0.86)) : tone(A.brick, 0.62 + h3(Math.floor(X / 5), 1, 3, 3) * 0.16));
        w.set(X, y, Z, c);
      }
    });
    // the passage beyond the arch: floor and side walls fading into the dark
    if (open('n')) cols(w, -DW - 0.3, DW + 0.3, -HD - 1.8, -HD - WT - 0.3, (X, Z, x, z) => {
      const d = (-HD - WT - 0.3 - z) / 1.5;
      if (Math.abs(x) < DW) { for (let y = -4; y <= -1; y++) w.set(X, y, Z, mixC(floorColor(A, X, y, Z, -1 - y, MAT.STONE, 3), C('#05080a'), Math.min(0.9, d * 0.8))); }
      else for (let y = -4; y < yv(2.2); y++) w.set(X, y, Z, mixC(wallColor(A, X, y, Z, Z, 0, -1), C('#05080a'), Math.min(0.9, d * 0.7)));
    });
  }
  // ---- side walls (east, west): height falls toward the camera; doorways get a raised stone gatehouse
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -HW - WT : HW, x1 = side < 0 ? -HW : HW + WT, key = side < 0 ? 'w' : 'e';
    if (!touches(w, x0, x1, -HD - WT, HD + WT)) continue;
    cols(w, x0, x1, -HD - WT - 0.3, HD + WT, (X, Z, x, z) => {
      const inDoor = open(key) && Math.abs(z) < DW + 0.3;
      const hM = H.side(z) + (inDoor ? 0.75 : 0);
      const archTop = inDoor ? ARCH(z, DW, Math.max(1.5, H.side(0) + 0.1)) : -1;
      const yTop = yv(hM) + Math.round(noise2(Z * 0.06, side * 5) * 2);
      for (let y = -4; y <= yTop; y++) {
        const m = (y + 0.5) * S;
        if (archTop > 0 && m < archTop && Math.abs(z) < DW) continue;
        let c = y >= yTop - 1 ? mossTop(X, Z, y, cap(X, y, Z, Z)) : wallColor(A, X, y, Z, Z, 0, -1);
        if (inDoor && Math.abs(z) >= DW - 0.04) c = y >= yTop - 2 ? tone(A.brick, 0.8) : tone(A.brick, 0.6 + h3(Math.floor(y / 6), Z > 0 ? 1 : 0, 5, 2) * 0.16);
        w.set(X, y, Z, c);
      }
    });
    // outside the side door: a short passage floor
    if (open(key)) {
      const ox0 = side < 0 ? -HW - 2.2 : HW + WT, ox1 = side < 0 ? -HW - WT : HW + 2.2;
      cols(w, ox0, ox1, -DW, DW, (X, Z, x) => { const d = (Math.abs(x) - HW - WT) / 1.7; for (let y = -4; y <= -1; y++) w.set(X, y, Z, mixC(floorColor(A, X, y, Z, -1 - y, MAT.STONE, 4), C('#05080a'), Math.min(0.85, d * 0.8))); });
    }
  }
  // ---- south parapet (low, near the camera) with a gap and steps going down for the south door
  if (touches(w, -HW - WT, HW + WT, HD, HD + WT + 1.6)) {
    cols(w, -HW - WT, HW + WT, HD, HD + WT, (X, Z, x) => {
      if (open('s') && Math.abs(x) < DW) return;
      const yTop = yv(H.south) + (Math.abs(x) % 2.5 < 0.18 ? 3 : 0) + Math.round(noise2(X * 0.1, 4) * 1.5);
      for (let y = -4; y <= yTop; y++) w.set(X, y, Z, y >= yTop - 1 ? mossTop(X, Z, y, cap(X, y, Z, X)) : wallColor(A, X, y, Z, X, 0, -1));
    });
    if (open('s')) cols(w, -DW, DW, HD, HD + 1.8, (X, Z, x, z) => {
      const step = Math.floor((z - HD) / 0.3), yTop = -1 - step * 3;
      for (let y = yTop - 4; y <= yTop; y++) w.set(X, y, Z, Math.abs(x) > DW - 0.1 ? tone(A.brick, 0.5) : mixC(floorColor(A, X, y, Z, yTop - y, MAT.STONE, 5), C('#05080a'), Math.min(0.7, step * 0.12)));
    });
  }
  // ---- the platform's edge seen below the south parapet: a cliff of rock and roots dropping into the dark
  if (touches(w, -HW - WT - 1, HW + WT + 1, HD + WT, HD + WT + 0.4)) cols(w, -HW - WT - 0.6, HW + WT + 0.6, HD + WT, HD + WT + 0.16, (X, Z, x) => {
    if (open('s') && Math.abs(x) < DW + 0.1) return;
    const depth = 30 + Math.round(noise2(X * 0.05, 2) * 14);
    for (let y = -depth; y < -4; y++) {
      let c = tone(A.rock, 0.1 + ((y + depth) / depth) * 0.25 + h3(X, y, Z, 3) * 0.06);
      if (noise2(X * 0.25, y * 0.12) > 0.74) c = tone(A.root, 0.25 + h3(X, y, 1, 2) * 0.2);
      if (noise2(X * 0.1 + 3, y * 0.1) > 0.7) c = tone(A.moss, 0.2 + h3(X, y, 2, 2) * 0.25);
      w.set(X, y, Z, c);
    }
  });
  // ---- corner towers: square stone piers with a mossy crown
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (HW + WT * 0.5), cz = sz * (HD + WT * 0.5), r = 0.42;
    if (!touches(w, cx - r, cx + r, cz - r, cz + r)) continue;
    const hTop = sz < 0 ? H.north + 0.55 : H.south + 0.75;
    cols(w, cx - r, cx + r, cz - r, cz + r, (X, Z, x, z) => {
      const edge = Math.abs(x - cx) > r - 0.06 || Math.abs(z - cz) > r - 0.06;
      const yTop = yv(hTop) + (edge ? 0 : 2);
      for (let y = -6; y <= yTop; y++) {
        const ring = ((y + 60) % 14) < 2;
        let c = ring ? tone(A.brick, 0.75) : wallColor(A, X, y, Z, Math.abs(x - cx) > Math.abs(z - cz) ? Z : X, 0, -1);
        if (y >= yTop - 1) c = mossTop(X, Z, y, tone(A.brick, 0.7));
        w.set(X, y, Z, c);
      }
    });
  }
}

// ---------------------------------------------------------------------------- obstacles (voxel ints; footprint in metres)
/** Mossy boulder filling a footprint box. */
export function rockObstacle(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 4)) return;
  const cx = (b.x0 + b.x1) / 2 / S, cz = (b.z0 + b.z1) / 2 / S, rx = (b.x1 - b.x0) / 2 / S * 0.98, rz = (b.z1 - b.z0) / 2 / S * 0.98;
  const ry = Math.min(rx, rz) * (0.75 + h3(seed, 1, 2, 3) * 0.5);
  ell(w, cx, -1, cz, rx, ry + 1, rz, (px, py, pz, d) => {
    const top = py > -1 + ry * 0.55 - noise2(px * 0.2, pz * 0.2) * 3;
    if (d > 0.92 && h3(px, py, pz, seed) > 0.6) return undefined; // chipped silhouette
    const strata = ((py + Math.round(noise2(px * 0.1, pz * 0.1) * 4)) >> 2) & 1;
    let c = tone(A.rock, 0.22 + (py + 1) / (ry + 1) * 0.42 + strata * 0.06 + h3(px, py, pz, seed + 1) * 0.07);
    if (top && noise2(px * 0.15 + seed, pz * 0.15) > 0.3) c = tone(A.moss, 0.3 + noise2(px * 0.5, pz * 0.5) * 0.55);
    if (h3(px, py, pz, seed + 7) > 0.997) c = glowC(A.oreGlow || '#fff0b0');
    return c;
  });
}
/** Mushroom clump: a mossy mound with 1–3 big glowing-gilled mushrooms (stems inside the footprint). */
export function shroomObstacle(w, A, b, seed) {
  if (!touches(w, b.x0 - 0.5, b.x1 + 0.5, b.z0 - 0.5, b.z1 + 0.5, 4)) return;
  const cx = (b.x0 + b.x1) / 2 / S, cz = (b.z0 + b.z1) / 2 / S, rx = (b.x1 - b.x0) / 2 / S, rz = (b.z1 - b.z0) / 2 / S;
  ell(w, cx, -1, cz, rx * 0.95, 5, rz * 0.95, (px, py, pz) => tone(A.moss, 0.2 + (py + 1) / 5 * 0.4 + noise2(px * 0.4, pz * 0.4) * 0.3));
  const n = rx > 9 ? 2 + Math.floor(h3(seed, 2, 3, 1) * 2) : 1;
  for (let k = 0; k < n; k++) {
    const a = k * 2.4 + seed, rr = n > 1 ? Math.min(rx, rz) * 0.42 : 0;
    const mx = Math.round(cx + Math.cos(a) * rr), mz = Math.round(cz + Math.sin(a) * rr);
    const h = Math.round((n > 1 ? 14 : 20) + h3(seed, k, 5, 2) * (n > 1 ? 18 : 16)), capR = Math.min(Math.max(rx, rz) * (n > 1 ? 0.75 : 1.1), 9 + h * 0.4);
    bigMushroom(w, A, mx, 3, mz, h, capR, (seed + k) % (A.caps ? A.caps.length : 1), seed * 7 + k);
  }
}
/** A big mushroom (fine voxels): curved stem with a ring, domed spotted cap, glowing rim and gills. */
export function bigMushroom(w, A, x, y, z, h, capR, capIdx = 0, seed = 1) {
  const [capPal, gill] = capOf(A, capIdx);
  const stem = A.stem || SHROOM.stem;
  const bend = (h3(seed, 1, 2, 5) - 0.5) * h * 0.35, bendZ = (h3(seed, 3, 2, 5) - 0.5) * h * 0.25;
  const r0 = Math.max(1.6, h * 0.11);
  for (let s = 0; s < h; s++) {
    const t = s / h, cx = x + bend * t * t, cz = z + bendZ * t * t, r = r0 * (1.25 - t * 0.35) + (s < 3 ? 1.2 : 0);
    cyl(w, cx + 0.5, cz + 0.5, y + s, y + s + 1, r, r, (px, py, pz, d) => {
      const lit = (px - cx) * -0.5 + (pz - cz) * 0.6 > 0;
      let c = tone(stem, 0.42 + (lit ? 0.2 : 0) + h3(px, py, pz, seed) * 0.08 - (1 - t) * 0.1);
      if (Math.abs(t - 0.66) < 0.04) c = tone(stem, 0.85); // the ring
      return c;
    });
  }
  const cx = x + bend + 0.5, cz = z + bendZ + 0.5, cy = y + h, ry = capR * 0.55;
  ell(w, cx, cy, cz, capR, ry, capR, (px, py, pz, d) => {
    if (py < cy - 1) return undefined;
    const rim = py <= cy;
    if (rim) return d > 0.62 ? glowC(gill) : glowC(shadeHex(gill, 0.75));
    const spot = noise2(px * 0.32 + seed, pz * 0.32) > 0.74 && py > cy + 1;
    const k = 0.35 + (py - cy) / ry * 0.55 - d * 0.15 + ((px - cx) * -0.02 + (pz - cz) * 0.02);
    if (spot) return h3(px, py, pz, seed) > 0.75 ? glowC('#fff4e0') : tone(stem, 0.95);
    return tone(capPal, k);
  });
}
/** Broken stone column (square drums, a crown of moss, maybe a mushroom on top). */
export function pillarObstacle(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 4)) return;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, hw = (b.x1 - b.x0) / 2 * 0.96, hd = (b.z1 - b.z0) / 2 * 0.96;
  const hTop = 0.6 + h3(seed, 1, 1, 1) * 1.4;
  cols(w, cx - hw, cx + hw, cz - hd, cz + hd, (X, Z, x, z) => {
    const inner = Math.abs(x - cx) < hw - 0.06 && Math.abs(z - cz) < hd - 0.06;
    const broken = Math.round((noise2(X * 0.2, Z * 0.2 + seed) - 0.5) * 8);
    const yTop = Math.round(hTop / S) + (inner ? broken : broken - 2);
    for (let y = -1; y <= yTop; y++) {
      const base = y < 4 || (y > 3 && y < 6 && !inner);
      let c = base ? tone(A.brick, 0.7) : ((y % 12) === 0 ? tone(A.brick, 0.72) : tone(A.brick, 0.42 + (x - cx) * -0.2 + (z - cz) * 0.25 + h3(X, y, Z, seed) * 0.12));
      if (y >= yTop - 1 && noise2(X * 0.2, Z * 0.2) > 0.35) c = tone(A.moss, 0.35 + h3(X, Z, y, 1) * 0.5);
      if (noise2(X * 0.12 + seed, y * 0.08) > 0.8) c = tone(A.moss, 0.25 + h3(X, y, 2, 2) * 0.3);
      w.set(X, y, Z, c);
    }
  });
  if (A.caps && h3(seed, 9, 9, 9) > 0.5) bigMushroom(w, A, Math.round(cx / S), Math.round(hTop / S) - 2, Math.round(cz / S), 8 + Math.floor(h3(seed, 4, 4, 4) * 6), 7, seed % A.caps.length, seed);
}
/** Thick gnarled roots arching out of the floor across the footprint. */
export function rootObstacle(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 6)) return;
  const along = b.x1 - b.x0 >= b.z1 - b.z0;
  const L = (along ? b.x1 - b.x0 : b.z1 - b.z0) / S, cx = (b.x0 + b.x1) / 2 / S, cz = (b.z0 + b.z1) / 2 / S, wid = (along ? b.z1 - b.z0 : b.x1 - b.x0) / S;
  for (let k = 0; k < 3; k++) {
    const off = (k - 1) * wid * 0.28, ph = h3(seed, k, 1, 2) * 6;
    for (let s = 0; s <= L; s += 1) {
      const t = s / L, u = -L / 2 + s, arc = Math.sin(t * Math.PI) * (wid * 0.55 + k * 2) + 1, v = off + Math.sin(t * 5 + ph) * 2;
      const px = along ? cx + u : cx + v, pz = along ? cz + v : cz + u;
      ell(w, px, arc, pz, 3.2 - k * 0.5, 3, 3.2 - k * 0.5, (qx, qy, qz) => (noise2(qx * 0.3, qz * 0.3 + qy * 0.2) > 0.72 ? tone(A.moss, 0.4) : tone(A.root, 0.3 + (qy / (wid * 0.7 + 4)) * 0.4 + h3(qx, qy, qz, seed) * 0.1)));
      ell(w, px, 0, pz, 3.6, 2, 3.6, (qx, qy, qz) => tone(A.root, 0.25 + h3(qx, qy, qz, 2) * 0.1));
    }
  }
}
/** Petrified adventurer on a plinth (Medusa's old victims). */
export function statueObstacle(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 6)) return;
  statueFig(w, A, Math.round((b.x0 + b.x1) / 2 / S), -1, Math.round((b.z0 + b.z1) / 2 / S), seed, Math.PI + (h3(seed, 2, 2, 2) - 0.5) * 0.8, seed % 3);
}
/** Crystal cluster on a rock base (stage 1). */
export function crystalObstacle(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 6)) return;
  const cx = Math.round((b.x0 + b.x1) / 2 / S), cz = Math.round((b.z0 + b.z1) / 2 / S), r = (b.x1 - b.x0) / 2 / S;
  ell(w, cx, -1, cz, r * 0.9, 4, r * 0.9, (px, py, pz) => tone(A.rock, 0.25 + h3(px, py, pz, 2) * 0.2));
  crystalCluster(w, cx, 2, cz, Math.round(r * 2.2), h3(seed, 1, 1, 1) > 0.5 ? A.crystal : (A.crystal2 || A.crystal), seed, 5);
}
/** Basalt block with lava cracks (stage 2). */
export function basaltObstacle(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 4)) return;
  const hTop = Math.round((0.5 + h3(seed, 2, 2, 2) * 0.7) / S);
  cols(w, b.x0 + 0.02, b.x1 - 0.02, b.z0 + 0.02, b.z1 - 0.02, (X, Z) => {
    const yTop = hTop + Math.round(noise2(X * 0.15, Z * 0.15 + seed) * 4) - 2;
    for (let y = -1; y <= yTop; y++) {
      const crack = Math.abs(noise2(X * 0.09 + seed, y * 0.09 + Z * 0.05) - 0.5) < 0.025;
      w.set(X, y, Z, crack ? glowC(h3(X, y, Z, 1) > 0.5 ? '#ff6a1a' : '#ffc85a') : tone(A.rock, 0.2 + (y / hTop) * 0.3 + (((X + y) >> 3) & 1) * 0.05));
    }
  });
}
/** Overgrown hedge of vines and flowers on a marble kerb (stage 3). */
export function hedgeObstacle(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 4)) return;
  cols(w, b.x0 + 0.02, b.x1 - 0.02, b.z0 + 0.02, b.z1 - 0.02, (X, Z, x, z) => {
    const edge = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z) < 0.06;
    const yTop = edge ? 3 : 10 + Math.round(noise2(X * 0.2, Z * 0.2 + seed) * 8);
    for (let y = -1; y <= yTop; y++) {
      if (y <= 2 || edge) { w.set(X, y, Z, tone(A.brick, 0.75 + h3(X, y, Z, 1) * 0.1)); continue; }
      if (h3(X, y, Z, seed) > 0.8 && y > yTop - 3) w.set(X, y, Z, C(A.flowers[(X + Z) & 3]));
      else w.set(X, y, Z, tone(A.leaf, 0.25 + (y / yTop) * 0.55 + h3(X, y, Z, 2) * 0.1));
    }
  });
}
/** Stone pedestal with a glowing rune ring (treasure rooms). Top at ~0.7 m. */
export function pedestal(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 4)) return;
  const cx = (b.x0 + b.x1) / 2 / S, cz = (b.z0 + b.z1) / 2 / S, r = (b.x1 - b.x0) / 2 / S;
  for (let y = -1; y < 18; y++) {
    const rr = y < 3 ? r * 0.95 : y < 6 ? r * 0.8 : y < 14 ? r * 0.5 : r * 0.72;
    cyl(w, cx, cz, y, y + 1, rr, rr, (px, py, pz, d) => {
      if (y === 4 && d > 0.85 && (Math.floor(Math.atan2(pz - cz, px - cx) * 6) & 1)) return glowC(A.glow);
      if (y >= 16 && d < 0.5) return glowC(A.glow);
      return tone(A.brick, 0.5 + (y < 6 ? 0.2 : 0) + (y >= 14 ? 0.25 : 0) + (px - cx) * -0.01 + h3(px, py, pz, 3) * 0.08);
    });
  }
  tufts(w, A, Math.round(cx - r * 0.7), 0, Math.round(cz + r * 0.6), 6, seed, 8);
}
/** Tree-stump workbench with tools, jars and a mortar (craft rooms). Top at ~0.8 m. */
export function workbench(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 6)) return;
  const cx = (b.x0 + b.x1) / 2 / S, cz = (b.z0 + b.z1) / 2 / S, rx = (b.x1 - b.x0) / 2 / S, rz = (b.z1 - b.z0) / 2 / S;
  const bark = A.root, wood = pal(['#5a3a24', '#7e5634', '#a87848', '#d0a060', '#f0c888']);
  // the stump: bark sides, flat ringed top
  for (let y = -1; y < 19; y++) ell(w, cx, y + 0.5, cz, rx * (y < 3 ? 0.98 : 0.9), 0.6, rz * (y < 3 ? 0.98 : 0.9), (px, py, pz, d) => {
    if (y === 18) { const rr = Math.hypot((px - cx) / rx, (pz - cz) / rz); return Math.floor(rr * 9) % 2 ? tone(wood, 0.6) : tone(wood, 0.8); }
    return d > 0.7 ? tone(bark, 0.3 + h3(px, py, pz, 3) * 0.3 + ((px + py) % 4 === 0 ? -0.1 : 0)) : tone(wood, 0.5);
  });
  // roots splaying out at the base
  for (let k = 0; k < 5; k++) { const a = k * 1.3 + seed; seg(w, cx + Math.cos(a) * rx * 0.8, 3, cz + Math.sin(a) * rz * 0.8, cx + Math.cos(a) * rx * 1.05, 0, cz + Math.sin(a) * rz * 1.05, 1.6, (px, py, pz) => tone(bark, 0.35 + h3(px, py, pz, 4) * 0.2)); }
  const Y = 19;
  // hammer, a mortar & pestle, jars of glowing goop, a recipe sheet
  seg(w, cx - rx * 0.5, Y + 1, cz, cx - rx * 0.1, Y + 1, cz + 3, 0.6, tone(wood, 0.7));
  ell(w, cx - rx * 0.1, Y + 1.5, cz + 3.5, 2.2, 1.5, 1.4, tone(PR.IRON, 0.6));
  cyl(w, cx + rx * 0.35, cz - rz * 0.2, Y, Y + 4, 3, 3.6, (px, py, pz, d) => (d < 0.4 && py === Y + 3 ? glowC('#7affd8') : tone(A.brick, 0.6)));
  for (let k = 0; k < 3; k++) {
    const jx = cx + rx * 0.55 - k * 4, jz = cz + rz * 0.45, g = ['#7affd8', '#ff9ae8', '#ffd27a'][k];
    cyl(w, jx, jz, Y, Y + 5, 1.6, 1.6, (px, py) => (py < Y + 4 ? glowC(shadeHex(g, 0.8)) : C('#c8b090')));
  }
  for (let px = -6; px <= 2; px++) for (let pz = -3; pz <= 3; pz++) w.set(Math.round(cx + px - rx * 0.2), Y, Math.round(cz - rz * 0.4 + pz), (px + pz) % 3 ? C('#e8d8b0') : C('#8a6a4a'));
}
/** Mushroom shrine: a carved altar with a glowing idol cap and offering bowl. */
export function shrine(w, A, b, seed) {
  if (!touches(w, b.x0 - 0.4, b.x1 + 0.4, b.z0 - 0.4, b.z1 + 0.4, 6)) return;
  const cx = (b.x0 + b.x1) / 2 / S, cz = (b.z0 + b.z1) / 2 / S, r = (b.x1 - b.x0) / 2 / S;
  for (let y = -1; y < 8; y++) cyl(w, cx, cz, y, y + 1, r * (0.98 - y * 0.03), r * (0.98 - y * 0.03), (px, py, pz, d) => (d > 0.9 && y === 6 ? glowC(A.glow) : tone(A.brick, 0.55 + (y > 5 ? 0.15 : 0) + h3(px, py, pz, 2) * 0.1)));
  bigMushroom(w, A, Math.round(cx), 8, Math.round(cz - 2), 16, 13, (seed + 1) % ((A.caps || []).length || 1), seed);
  ell(w, cx, 9, cz + r * 0.55, 3, 1.4, 2.4, (px, py) => (py > 9 ? glowC('#ffd27a') : tone(PR.BRASS, 0.5)));
  for (let k = 0; k < 6; k++) { const a = k * 1.05; w.set(Math.round(cx + Math.cos(a) * r * 1.15), 0, Math.round(cz + Math.sin(a) * r * 1.15), glowC(A.flowers[k % 4])); }
}
/** Old iron-bound chest (secret rooms) + a spill of gold & gems. */
export function oldChest(w, A, b, seed) {
  if (!touches(w, b.x0, b.x1, b.z0, b.z1, 6)) return;
  const cx = Math.round((b.x0 + b.x1) / 2 / S), cz = Math.round((b.z0 + b.z1) / 2 / S);
  PR.crate(w, cx, 0, cz, Math.round((b.x1 - b.x0) / S * 0.8), 12, Math.round((b.z1 - b.z0) / S * 0.7), { seed });
  PR.goldPile(w, cx + 8, 0, cz + 8, 6, seed);
}
/** Ore boulder base (the nuggets are a separate mesh so they can be mined away). */
export function oreBoulderBase(w, A, b, seed) { rockObstacle(w, A, b, seed); }
/** Ore nuggets + glints on a boulder (separate world): kind 'ore' | 'gem' | 'crystal'. */
export function oreNuggets(w, A, b, seed, kind = 'ore') {
  const cx = (b.x0 + b.x1) / 2 / S, cz = (b.z0 + b.z1) / 2 / S, rx = (b.x1 - b.x0) / 2 / S * 0.98, rz = (b.z1 - b.z0) / 2 / S * 0.98;
  const ry = Math.min(rx, rz) * (0.75 + h3(seed, 1, 2, 3) * 0.5);
  const cols3 = kind === 'gem' ? ['#ff5a8a', '#5ad8ff', '#7aff9a'] : kind === 'crystal' ? [A.crystal, A.crystal2 || '#ff8ae0', '#ffffff'] : A.ore;
  const n = 7 + Math.floor(h3(seed, 3, 3, 3) * 5);
  for (let k = 0; k < n; k++) {
    const a = h3(k, seed, 1, 1) * Math.PI * 2, el = 0.25 + h3(k, seed, 2, 2) * 0.9;
    const px = cx + Math.cos(a) * rx * Math.cos(el) * 0.92, pz = cz + Math.sin(a) * rz * Math.cos(el) * 0.92, py = -1 + (ry + 1) * Math.sin(el) * 0.95;
    const rr = 1.8 + h3(k, seed, 3, 3) * 2.2, col = cols3[k % cols3.length];
    ell(w, px, py, pz, rr, rr * 0.9, rr, (qx, qy, qz, d) => {
      const facet = (qx - px) - (qy - py) + (qz - pz) * 0.5 > 0;
      if (h3(qx, qy, qz, k + seed) > 0.8) return glowC('#ffffff');
      return facet ? glowC(shadeHex(col, 1.1, 20)) : C(shadeHex(col, 0.7));
    });
  }
}
/** Grand Puffcap's throne: a giant squat toadstool seat with spore vents around it. */
export function bossThrone(w, A, b, seed) {
  if (!touches(w, b.x0 - 1.5, b.x1 + 1.5, b.z0 - 1.5, b.z1 + 1.5, 6)) return;
  const cx = Math.round((b.x0 + b.x1) / 2 / S), cz = Math.round((b.z0 + b.z1) / 2 / S);
  bigMushroom(w, A, cx, -1, cz, 22, 36, 0, seed);
  for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3, r = 44 + (k % 2) * 8; bigMushroom(w, A, Math.round(cx + Math.cos(a) * r), -1, Math.round(cz + Math.sin(a) * r * 0.6), 8 + (k % 3) * 4, 6 + (k % 3) * 2, (k + 1) % 4, seed + k); }
}

// ---------------------------------------------------------------------------- floor & wall dressing
/** Ferns, tufts, little mushroom clusters, rubble and bones along the wall foot (inside the room). */
export function wallFootDressing(w, ctx, spots) {
  const { A, stage } = ctx;
  for (const s of spots) {
    if (!touches(w, s.x - 0.6, s.x + 0.6, s.z - 0.6, s.z + 0.6, 2)) continue;
    const X = Math.round(s.x / S), Z = Math.round(s.z / S), k = s.k;
    if (stage === 1 && k < 0.4) crystalCluster(w, X, 0, Z, 8 + Math.round(s.k2 * 12), s.k2 > 0.5 ? A.crystal : (A.crystal2 || A.crystal), X ^ Z, 3);
    else if (stage === 2 && k < 0.35) { for (let q = 0; q < 14; q++) w.set(X + Math.round(Math.sin(q * 0.8) * 2), -1, Z + q - 7, glowC(q % 3 ? '#ff6a1a' : '#ffc85a')); }
    else if (k < 0.42) fern(w, A, X, 0, Z, 6 + Math.round(s.k2 * 6), X + Z, stage === 3 ? 3 : s.k2 > 0.6 ? 2 : 0);
    else if (k < 0.62) tufts(w, A, X, 0, Z, 7, X + Z, 14);
    else if (k < 0.84 && A.caps) { const n = 2 + Math.floor(s.k2 * 3); for (let q = 0; q < n; q++) smallMushroom(w, A, X + Math.round((h3(q, X, 1, 1) - 0.5) * 12), 0, Z + Math.round((h3(q, Z, 2, 1) - 0.5) * 10), 4 + Math.round(h3(q, X, Z, 3) * 6), (X + q) % A.caps.length, X + q); }
    else if (k < 0.93) rubble(w, A, X, 0, Z, 5, X ^ Z, 4);
    else PR.bones(w, X, 0, Z, X ^ Z, s.k2 > 0.5);
  }
}
/** Little mushroom (fine voxels, non-blocking floor dressing). */
export function smallMushroom(w, A, x, y, z, h, capIdx = 0, seed = 1) {
  const [capPal, gill] = capOf(A, capIdx);
  for (let s = 0; s < h; s++) w.set(x, y + s, z, tone(A.stem || SHROOM.stem, 0.6 + (s / h) * 0.3));
  const r = Math.max(2, Math.round(h * 0.45));
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const d = (dx * dx + dz * dz) / (r * r); if (d > 1) continue;
    w.set(x + dx, y + h, z + dz, d > 0.7 ? glowC(gill) : tone(capPal, 0.6 + (1 - d) * 0.35));
    if (d < 0.45) w.set(x + dx, y + h + 1, z + dz, h3(dx, dz, seed, 2) > 0.8 ? C('#fff4e0') : tone(capPal, 0.82));
  }
}
/** Scattered floor dressing in open floor spots: pebbles, glowing spore patches, creeping roots, puddles, small shrooms. */
export function floorDressing(w, ctx, spots) {
  const { A, stage } = ctx;
  for (const s of spots) {
    if (!touches(w, s.x - 0.7, s.x + 0.7, s.z - 0.7, s.z + 0.7, 2)) continue;
    const X = Math.round(s.x / S), Z = Math.round(s.z / S);
    if (s.kind === 'pebbles') for (let q = 0; q < 6; q++) { const px = X + Math.round((h3(q, X, 1, 2) - 0.5) * 16), pz = Z + Math.round((h3(q, Z, 2, 2) - 0.5) * 12); w.set(px, 0, pz, tone(A.rock, 0.4 + h3(q, 1, 2, 3) * 0.3)); if (q & 1) w.set(px + 1, 0, pz, tone(A.rock, 0.3)); }
    else if (s.kind === 'spores') for (let q = 0; q < 10; q++) { const px = X + Math.round((h3(q, X, 3, 2) - 0.5) * 18), pz = Z + Math.round((h3(q, Z, 4, 2) - 0.5) * 14); w.set(px, -1, pz, glowC(stage === 2 ? '#ff8a2a' : A.glow)); }
    else if (s.kind === 'roots') {
      const a = h3(X, Z, 5, 5) * Math.PI, L = 30 + Math.round(h3(X, Z, 6, 6) * 30);
      for (let q = 0; q < L; q++) { const px = X + Math.round(Math.cos(a) * q + Math.sin(q * 0.3) * 2), pz = Z + Math.round(Math.sin(a) * q); w.set(px, 0, pz, tone(A.root, 0.4 + h3(q, 1, 1, 4) * 0.2)); if (q % 3 === 0) w.set(px, 1, pz, tone(A.root, 0.55)); }
    } else if (s.kind === 'puddle' && A.water) {
      const rx = 10 + Math.round(h3(X, Z, 7, 7) * 10), rz = 6 + Math.round(h3(X, Z, 8, 8) * 6);
      for (let dz = -rz; dz <= rz; dz++) for (let dx = -rx; dx <= rx; dx++) {
        const d = (dx / rx) ** 2 + (dz / rz) ** 2 + (noise2((X + dx) * 0.2, (Z + dz) * 0.2) - 0.5) * 0.4; if (d > 1) continue;
        w.set(X + dx, -1, Z + dz, h3(X + dx, Z + dz, 9, 9) > 0.985 ? glowC('#e8ffff') : C(shadeHex(A.water, d > 0.7 ? 0.55 : 0.4)));
      }
    } else if (s.kind === 'shrooms' && A.caps) { const n = 3 + Math.floor(h3(X, Z, 3, 3) * 4); for (let q = 0; q < n; q++) smallMushroom(w, A, X + Math.round((h3(q, X, 5, 1) - 0.5) * 16), 0, Z + Math.round((h3(q, Z, 6, 1) - 0.5) * 12), 3 + Math.round(h3(q, X, Z, 4) * 5), (X + q) % A.caps.length, q + X); }
    else if (s.kind === 'crack') { for (let q = 0; q < 40; q++) w.set(X + Math.round(q * 0.8 + Math.sin(q * 0.5) * 3), -1, Z + Math.round(Math.cos(q * 0.3) * 4), stage === 2 ? glowC('#ff6a1a') : C('#0e1414')); }
  }
}
/** Shelf fungus brackets on a wall face (normal +z for the north wall). r in voxels. */
export function shelfFungus(w, A, x, y, z, r, capIdx, seed, nx = 0, nz = 1) {
  const [capPal, gill] = capOf(A, capIdx);
  for (let k = 0; k < 3; k++) {
    const rr = r * (1 - k * 0.25), yy = y - k * Math.round(r * 0.55), ox = Math.round((h3(k, seed, 1, 1) - 0.5) * r);
    for (let du = -Math.ceil(rr); du <= rr; du++) for (let dd = 0; dd <= rr * 0.75; dd++) {
      if (du * du + (dd * 1.35) ** 2 > rr * rr) continue;
      const edge = du * du + (dd * 1.35) ** 2 > (rr - 1.5) ** 2;
      const px = nz ? x + ox + du : x + dd * nx, pz = nz ? z + dd * nz : z + ox + du;
      w.set(px, yy, pz, edge ? glowC(gill) : tone(capPal, 0.45 + (dd / rr) * 0.4));
      if (!edge) w.set(px, yy + 1, pz, tone(capPal, 0.65 + (dd / rr) * 0.3));
    }
  }
}
/** Iron sconce + stub of a torch on a wall face (the flame is a billboard added by the room). */
export function torchSconce(w, x, y, z, nx, nz) {
  const IRON = pal(['#26222e', '#3e3a4c', '#5e5a70', '#8a86a0']);
  for (let k = 0; k < 5; k++) w.set(x - nx * (5 - k), y - 6, z - nz * (5 - k), IRON[1 + (k & 1)]);
  for (let k = -1; k <= 1; k++) for (let q = -1; q <= 1; q++) w.set(x + k, y - 6, z + q, IRON[2]);
  for (let s = 0; s < 6; s++) w.set(x, y - 6 + s, z, s > 3 ? C('#3a2216') : C('#5a3a22'));
  w.set(x, y, z, glowC('#ffd27a'));
}
/** Roots and vines draping over the top of a wall and down its face (north wall: face normal +z at z). */
export function drapes(w, A, x, y, z, len, seed, glow = null) {
  let px = x;
  for (let s = 0; s < len; s++) {
    px += h3(s, seed, 1, 3) > 0.82 ? (h3(s, seed, 2, 3) > 0.5 ? 1 : -1) : 0;
    const c = A.leaf && h3(s, seed, 3, 3) > 0.7 ? tone(A.leaf, 0.35 + h3(s, 1, seed, 4) * 0.5) : tone(A.root, 0.3 + (1 - s / len) * 0.35);
    w.set(px, y - s, z, c);
    if (A.leaf && s % 4 === 1) w.set(px + (s & 4 ? 1 : -1), y - s, z, tone(A.leaf, 0.5));
    if (glow && s === len - 1) w.set(px, y - s - 1, z, glowC(glow));
  }
  // over the wall top
  for (let s = 0; s < 8; s++) w.set(x + Math.round(Math.sin(s + seed) * 1.5), y + 1, z - s, tone(A.root, 0.4));
}

// ---------------------------------------------------------------------------- gates (separate small worlds, origin at the doorway)
/** Portcullis bars in the plane z = 0 (x = along), height h (m), half width hw (m). style: open|locked|boss|secret */
export function portcullis(w, A, hw, h, style) {
  const IRON = pal(['#1a1820', '#2e2a38', '#4a4658', '#6e6a80', '#9a96ac']);
  const HX = Math.round(hw / S), HY = Math.round(h / S);
  const boss = style === 'boss';
  for (let X = -HX; X <= HX; X++) for (let y = 0; y < HY; y++) {
    const bar = ((X + HX) % 6) < 2, rail = (y % 22) < 2 || y >= HY - 3;
    if (!bar && !rail) continue;
    let c = tone(IRON, 0.3 + (bar ? 0.25 : 0.1) + h3(X, y, 1, 2) * 0.1);
    if (boss && rail) c = glowC(y % 44 < 2 ? '#ff5ab4' : '#c84aff');
    if (bar && y < 3) c = tone(IRON, 0.8); // spikes
    for (let z = -1; z <= 0; z++) w.set(X, y, z, c);
  }
  if (style === 'locked') {
    // a heavy chain across with a padlock in the middle
    for (let X = -HX; X <= HX; X++) w.set(X, Math.round(HY * 0.45 + Math.cos(X * 0.04) * 4), 1, (X & 1) ? tone(IRON, 0.7) : tone(IRON, 0.5));
    for (let dx = -4; dx <= 4; dx++) for (let dy = -5; dy <= 3; dy++) w.set(dx, Math.round(HY * 0.45) + dy, 2, Math.abs(dx) === 4 || dy === -5 || dy === 3 ? tone(PR.BRASS, 0.5) : tone(PR.BRASS, 0.8));
  }
}
/** Rubble wall chunk that hides a secret doorway (plane z = 0, along x). */
export function secretRubble(w, A, hw, h) {
  const HX = Math.round(hw / S), HY = Math.round(h / S);
  for (let X = -HX - 2; X <= HX + 2; X++) for (let y = -2; y < HY; y++) for (let z = -6; z <= 2; z++) {
    const c = wallColor(A, X, y, z, X, 1, -1);
    const crack = Math.abs(noise2(X * 0.12, y * 0.12) - 0.5) < 0.02 && z === 2;
    w.set(X, y, z, crack ? glowC(A.glow) : c);
  }
}

// ---------------------------------------------------------------------------- backdrop (coarse units: 1 unit = ctx.BS metres)
/** Giant mushroom in coarse units: stem rising from far below, huge cap, glowing rim. */
export function giantMushroom(w, A, x, yBase, z, h, capR, capIdx, seed) {
  const [capPal, gill] = capOf(A, capIdx);
  const stem = A.stem || SHROOM.stem;
  const bend = (h3(seed, 1, 2, 5) - 0.5) * h * 0.25;
  const r0 = Math.max(2, capR * 0.22);
  for (let s = 0; s < h; s++) {
    const t = s / h, cx = x + bend * t * t, r = r0 * (1.15 - t * 0.25);
    cyl(w, cx + 0.5, z + 0.5, yBase + s, yBase + s + 1, r, r, (px, py, pz) => tone(stem, 0.25 + t * 0.4 + ((px - cx) * -0.2 > 0 ? 0.12 : 0) + h3(px, py, pz, seed) * 0.06));
  }
  const cx = x + bend + 0.5, cy = yBase + h, ry = capR * 0.5;
  ell(w, cx, cy, z + 0.5, capR, ry, capR, (px, py, pz, d) => {
    if (py < cy - 1) return undefined;
    if (py <= cy) return glowC(d > 0.55 ? gill : shadeHex(gill, 0.7));
    if (noise2(px * 0.4 + seed, pz * 0.4) > 0.76) return h3(px, py, pz, seed) > 0.6 ? glowC('#fff4e0') : tone(stem, 0.9);
    return tone(capPal, 0.3 + (py - cy) / ry * 0.55 - d * 0.1);
  });
}
/** Curtain of hanging roots (coarse), from yTop down len units, spread along x. */
export function rootCurtain(w, A, x, yTop, z, spread, len, seed, glow) {
  for (let k = 0; k < spread; k += 2) {
    let px = x + k - spread / 2, pz = z + Math.round((h3(k, seed, 1, 1) - 0.5) * 4);
    const L = Math.round(len * (0.4 + h3(k, seed, 2, 2) * 0.6));
    for (let s = 0; s < L; s++) {
      px += Math.sin(s * 0.3 + k) * 0.25;
      w.set(Math.round(px), yTop - s, pz, glow && s === L - 1 ? glowC(glow) : tone(A.root, 0.15 + (1 - s / L) * 0.3));
      if (A.leaf && h3(s, k, seed, 3) > 0.86) w.set(Math.round(px) + 1, yTop - s, pz, tone(A.leaf, 0.3));
    }
  }
}
/** Ruined arch / broken pillars (coarse). */
export function ruinArch(w, A, x, yBase, z, span, h, seed) {
  for (const sx of [-1, 1]) {
    const px = x + sx * span / 2, hh = h * (sx > 0 ? 1 : 0.55 + h3(seed, 1, 1, 1) * 0.4);
    for (let y = 0; y < hh; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) w.set(Math.round(px + dx), yBase + y, z + dz, (y % 6) === 0 ? tone(A.brick, 0.5) : tone(A.brick, 0.22 + h3(dx, y, dz, seed) * 0.15));
  }
  for (let u = -span / 2; u <= span / 2; u++) { const a = Math.sqrt(Math.max(0, 1 - (u / (span / 2)) ** 2)); for (let t = 0; t < 3; t++) if (u > -span * 0.2 || h3(seed, 5, 5, 5) > 0.5) w.set(Math.round(x + u), yBase + h + Math.round(a * span * 0.4) + t, z, tone(A.brick, 0.3 + t * 0.08)); }
}
/** Rock spire / cliff column rising out of the abyss (coarse). */
export function spire(w, A, x, yBase, z, h, r, seed, topMoss = true) {
  for (let y = 0; y < h; y++) {
    const t = y / h, rr = r * (1 - t * 0.45) + Math.sin(y * 0.4 + seed) * 0.6;
    cyl(w, x + 0.5, z + 0.5, yBase + y, yBase + y + 1, rr, rr, (px, py, pz) => (t > 0.92 && topMoss ? tone(A.moss, 0.3 + h3(px, py, pz, 1) * 0.4) : tone(A.rock, 0.12 + t * 0.3 + ((px - x) * -0.1 > 0 ? 0.08 : 0) + h3(px, py, pz, seed) * 0.05)));
  }
}
