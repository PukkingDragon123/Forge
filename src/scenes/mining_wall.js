// Voxel tiles for the mining wall: rock blocks with painted clues (veins, cracks, frost/elemental
// auras), hard rock, exposed-ore hints, and the dark cavity behind the grid.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, GLOW } from '../gfx/voxel.js';
import { hash2, hash3, mixHex, shadeHex } from '../core/math.js';
import { MATERIALS } from '../data/materials.js';

export const TILE = 0.32;
export const VOX = 0.04;
const N = 8; // voxels per tile edge

// elemental ores leak a visible aura onto their own tile face
const AURA = {
  rime: { color: '#dff8ff', glow: false }, sapphire: { color: '#cfefff', glow: false },
  ember: { color: '#ff8a3a', glow: true }, magmasteel: { color: '#ff6a2a', glow: true }, ruby: { color: '#ff4a5a', glow: true },
  storm: { color: '#ffe74a', glow: true }, topaz: { color: '#ffe060', glow: true },
  venomite: { color: '#8fe04a', glow: true }, emerald: { color: '#5aff8a', glow: true },
  cursedore: { color: '#c86bff', glow: true }, voidcrystal: { color: '#a05aff', glow: true },
  glowcap: { color: '#5af0c8', glow: true }, soulstone: { color: '#5affd0', glow: true },
};

function pickTone(pal, n) {
  return pal[Math.min(pal.length - 1, Math.max(0, Math.floor(n)))];
}

/**
 * Build one tile. tile: mining tile {t, mat, veins, crack, hits, x, y}. pal: region palette.
 * Returns THREE.Group (front face at local z = depth*VOX, centered on x/y).
 */
export function buildTile(tile, pal, seed = 1) {
  const hard = tile.t === 'hard';
  const D = hard ? 5 : 4;
  const g = new VoxelGrid(N, N, D + 2);
  const rock = pal.rock;
  const s = seed + tile.x * 31 + tile.y * 17;
  const front = Array.from({ length: N }, () => Array(N).fill(D - 1));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
    const corner = (x === 0 || x === N - 1) && (y === 0 || y === N - 1);
    for (let z = 0; z < D; z++) {
      const isFront = z === D - 1;
      if (isFront && corner) continue;
      if (isFront && edge && !hard && hash3(x, y, z, s) < 0.5) continue;
      const n = hash3(x, y, z, s + 5);
      let col;
      if (hard) {
        col = n > 0.9 ? rock[2] : n > 0.55 ? rock[1] : rock[0];
        if (isFront && hash2(x, y, s + 9) > 0.93) col = shadeHex(rock[3], 0.15); // granite speckle
        if (isFront && y === N - 1) col = rock[2];
      } else {
        const lift = (y / N) * 1.3; // lighter toward the top (light from above)
        col = pickTone(rock, 1 + n * 1.6 + lift);
        if (isFront && edge) col = rock[1];
      }
      g.set(x, y, z, col);
    }
  }
  // protruding lumps for organic rock silhouette
  if (!hard) {
    const lumps = 1 + Math.floor(hash2(tile.x, tile.y, s) * 3);
    for (let k = 0; k < lumps; k++) {
      const cx = 2 + Math.floor(hash2(k, 1, s) * 4), cy = 2 + Math.floor(hash2(k, 2, s) * 4);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 1 && hash2(dx + 5, dy + k, s) > 0.5) continue;
        const x = cx + dx, y = cy + dy;
        g.set(x, y, D, pickTone(rock, 2.2 + (y / N) + hash2(x, y, s + 3)));
        front[x][y] = D;
      }
    }
  } else {
    // hard rock: a raised plate with bright top edge
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      g.set(x, y, D, y === N - 2 ? rock[3] : x === 1 ? rock[2] : rock[1]);
      front[x][y] = D;
    }
  }
  const paint = (x, y, col, flags = 0) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const z = front[x][y];
    if (!g.solid(x, y, z)) return;
    g.set(x, y, z, col, flags);
  };
  // veins: streak from the middle toward the edge facing the ore
  for (const dir in tile.veins || {}) {
    const color = tile.veins[dir];
    const dark = mixHex(color, rock[1], 0.25);
    const vs = s + dir.length * 7;
    let px = 3 + Math.floor(hash2(1, 1, vs) * 2), py = 3 + Math.floor(hash2(2, 2, vs) * 2);
    const step = { left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] }[dir];
    for (let i = 0; i < 6; i++) {
      paint(px, py, i % 2 ? dark : color);
      if (hash2(i, 3, vs) > 0.55) paint(px + (step[1] ? (hash2(i, 4, vs) > 0.5 ? 1 : -1) : 0), py + (step[0] ? (hash2(i, 4, vs) > 0.5 ? 1 : -1) : 0), dark);
      px += step[0]; py += step[1];
      if (hash2(i, 5, vs) > 0.6) { if (step[0]) py += hash2(i, 6, vs) > 0.5 ? 1 : -1; else px += hash2(i, 6, vs) > 0.5 ? 1 : -1; }
      py = Math.max(0, Math.min(N - 1, py)); px = Math.max(0, Math.min(N - 1, px));
    }
    // edge speck right at the border
    const ex = step[0] < 0 ? 0 : step[0] > 0 ? N - 1 : px, ey = step[1] > 0 ? N - 1 : step[1] < 0 ? 0 : py;
    paint(ex, ey, color);
  }
  // cracks (hazard nearby): dark hairline zigzag
  if (tile.crack) {
    let x = Math.floor(hash2(7, 7, s) * N), y = N - 1;
    for (let i = 0; i < 9 && y >= 0; i++) {
      paint(x, y, '#0d090b');
      if (hash2(i, 8, s) > 0.5) paint(x + 1, y, '#1d1612');
      y -= 1; x += hash2(i, 9, s) > 0.5 ? 1 : -1;
      x = Math.max(0, Math.min(N - 1, x));
    }
  }
  // own-tile auras for elemental / icy ores and treasure pockets
  const aura = tile.t === 'ore' ? AURA[tile.mat] : tile.t === 'pocket' ? { color: '#ffd25e', glow: true } : null;
  if (aura) {
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(hash2(k, 11, s) * N), y = Math.floor(hash2(k, 12, s) * N);
      paint(x, y, aura.color, aura.glow && k < 2 ? GLOW : 0);
    }
  }
  // first hit on hard rock: big fracture
  if (tile.hits > 0) {
    for (let i = 0; i < N; i++) {
      paint(i, Math.floor(N / 2 + Math.sin(i * 1.7) * 1.5), '#0a0708');
      paint(Math.floor(N / 2 + Math.cos(i * 1.3) * 1.5), i, '#0a0708');
    }
  }
  const m = meshVoxels(g, { size: VOX, origin: [N / 2, N / 2, 0], jitter: 0.05, seed: s, glowIntensity: 1.8 });
  m.userData.depth = D;
  return m;
}

/** The ore poking out of an exposed tile. */
export function buildOreHint(tile, seed = 1) {
  const m = MATERIALS[tile.mat];
  const g = new VoxelGrid(N, N, 4);
  const s = seed + tile.x * 13 + tile.y * 7;
  const gemmy = m.kind === 'gem' || m.kind === 'crystal';
  const c1 = m.color, c2 = m.color2 || shadeHex(m.color, 0.3), c0 = shadeHex(m.color, -0.35);
  const clusters = gemmy ? 2 : 3;
  for (let k = 0; k < clusters; k++) {
    const cx = 2 + Math.floor(hash2(k, 1, s) * 4), cy = 1 + Math.floor(hash2(k, 2, s) * 5);
    if (gemmy) {
      const h = 2 + Math.floor(hash2(k, 3, s) * 2);
      for (let z = 0; z < h; z++) {
        g.set(cx, cy, z, z === h - 1 ? c2 : c1, z === h - 1 ? GLOW : 0);
        if (z < h - 1) g.set(cx + 1, cy, z, c0);
        if (z === 0) g.set(cx, cy + 1, z, c1);
      }
    } else {
      g.set(cx, cy, 0, c1); g.set(cx + 1, cy, 0, c0); g.set(cx, cy + 1, 0, c2);
      g.set(cx, cy, 1, hash2(k, 4, s) > 0.5 ? c2 : c1);
    }
  }
  const mesh = meshVoxels(g, { size: VOX, origin: [N / 2, N / 2, 0], jitter: 0.04, seed: s, glowIntensity: 1.6 });
  return mesh;
}

/** Dark cavity slab behind the grid (shows through broken tiles). */
export function buildBacking(pal, cols, rows) {
  const W = cols * N + 4, H = rows * N + 4;
  const g = new VoxelGrid(W, H, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = hash2(x, y, 99);
    g.set(x, y, 0, n > 0.8 ? '#1a1412' : '#0f0b0a');
    if (n > 0.93) g.set(x, y, 1, '#221a16');
  }
  return meshVoxels(g, { size: VOX, origin: [W / 2, H / 2, 0], jitter: 0.08, castShadow: false });
}

/** Screen-space tile rectangle helper. */
export function tileCorners(origin, tx, ty, z) {
  const x0 = origin.x + tx * TILE, y0 = origin.y - ty * TILE;
  return [new THREE.Vector3(x0, y0, z), new THREE.Vector3(x0 + TILE, y0 - TILE, z)];
}
