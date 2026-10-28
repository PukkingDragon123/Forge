// Heightfield "shell" terrain: floors, back walls, side walls and ceilings are filled only a few voxels
// deep from their visible surface, then meshed with faces that point away from the camera culled.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, GLOW } from '../gfx/voxel.js';
import { fbm2, hash3, noise2, clamp, shadeHex, mixHex } from '../core/math.js';

const K_FLOOR = 1, K_BACK = 2, K_LEFT = 3, K_RIGHT = 4, K_CEIL = 5, K_FRONT = 6;
export const KIND = { floor: K_FLOOR, back: K_BACK, left: K_LEFT, right: K_RIGHT, ceil: K_CEIL, front: K_FRONT };
const KNAME = [null, 'floor', 'back', 'left', 'right', 'ceil', 'front'];
// faces: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z  → face to cull for each shell kind (points into the rock)
const CULL = { [K_FLOOR]: 3, [K_BACK]: 5, [K_LEFT]: 1, [K_RIGHT]: 0, [K_CEIL]: 2, [K_FRONT]: 4 };

/**
 * Build one terrain chunk.
 * o: { S, x0,x1,y0,y1,z0,z1 (world bounds), floor(x,z)→y, back(x,y)→z, left(z,y)→x, right(z,y)→x, ceil(x,z)→y,
 *      front(x,y)→z (solid in front of it, for foreground cliffs), color(x,y,z,kind,depth)→hex|number|null, thick, seed,
 *      floorZ:[za,zb] (limit floor fill), cullBack (default true) }
 */
export function shellChunk(o) {
  const S = o.S;
  const nx = Math.ceil((o.x1 - o.x0) / S), ny = Math.ceil((o.y1 - o.y0) / S), nz = Math.ceil((o.z1 - o.z0) / S);
  const g = new VoxelGrid(nx, ny, nz);
  const kind = new Uint8Array(nx * ny * nz);
  const thick = o.thick ?? 2;
  const wx = (i) => o.x0 + (i + 0.5) * S, wy = (j) => o.y0 + (j + 0.5) * S, wz = (k) => o.z0 + (k + 0.5) * S;
  const put = (i, j, k, kd, depth) => {
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return;
    const idx = i + nx * (j + ny * k);
    if (g.data[idx] && kind[idx] !== kd && depth > 0) return; // keep surface voxels of other shells
    const c = o.color(wx(i), wy(j), wz(k), KNAME[kd], depth);
    if (c === null || c === undefined) return;
    g.set(i, j, k, c);
    kind[idx] = kd;
  };
  if (o.floor) {
    const fz0 = o.floorZ ? Math.max(0, Math.floor((o.floorZ[0] - o.z0) / S)) : 0;
    const fz1 = o.floorZ ? Math.min(nz, Math.ceil((o.floorZ[1] - o.z0) / S)) : nz;
    for (let i = 0; i < nx; i++) for (let k = fz0; k < fz1; k++) {
      const h = o.floor(wx(i), wz(k));
      if (h === null || h === undefined) continue;
      const top = Math.floor((h - o.y0) / S);
      for (let d = 0; d < thick + 1; d++) put(i, top - d, k, K_FLOOR, d);
    }
  }
  if (o.back) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const zs = o.back(wx(i), wy(j));
    if (zs === null || zs === undefined) continue;
    const kk = Math.floor((zs - o.z0) / S);
    for (let d = 0; d < thick; d++) put(i, j, kk - d, K_BACK, d);
  }
  if (o.ceil) for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const c = o.ceil(wx(i), wz(k));
    if (c === null || c === undefined) continue;
    const jj = Math.ceil((c - o.y0) / S);
    for (let d = 0; d < thick; d++) put(i, jj + d, k, K_CEIL, d);
  }
  if (o.left) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const xs = o.left(wz(k), wy(j));
    if (xs === null || xs === undefined) continue;
    const ii = Math.floor((xs - o.x0) / S);
    for (let d = 0; d < thick; d++) put(ii - d, j, k, K_LEFT, d);
  }
  if (o.right) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const xs = o.right(wz(k), wy(j));
    if (xs === null || xs === undefined) continue;
    const ii = Math.ceil((xs - o.x0) / S);
    for (let d = 0; d < thick; d++) put(ii + d, j, k, K_RIGHT, d);
  }
  if (o.front) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const zs = o.front(wx(i), wy(j));
    if (zs === null || zs === undefined) continue;
    const kk = Math.ceil((zs - o.z0) / S);
    for (let d = 0; d < thick; d++) put(i, j, kk + d, K_FRONT, d);
  }
  if (o.extra) o.extra(g, { S, wx, wy, wz, nx, ny, nz, toI: (x) => Math.floor((x - o.x0) / S), toJ: (y) => Math.floor((y - o.y0) / S), toK: (z) => Math.floor((z - o.z0) / S) });
  const cullBack = o.cullBack !== false;
  const mesh = meshVoxels(g, {
    size: S, origin: [0, 0, 0], jitter: o.jitter ?? 0.07, seed: o.seed ?? 7, glowIntensity: o.glowIntensity ?? 2.2,
    cull: (x, y, z, f) => {
      const kd = kind[x + nx * (y + ny * z)];
      if (kd && CULL[kd] === f) return true;
      if (cullBack && f === 5 && kd !== K_FRONT) return true;
      return false;
    },
    castShadow: o.castShadow ?? false,
  });
  mesh.position.set(o.x0, o.y0, o.z0);
  return mesh;
}

/** Palette-driven rock colorer. pal = region palette (data/regions.js). */
export function rockPainter(pal, opts = {}) {
  const R = pal.rock, D = pal.dirt;
  const seed = opts.seed ?? 3;
  const speck = opts.speck || [];
  const moss = opts.moss ?? 0;
  const glowVeins = opts.glowVeins || null; // hex color for glowing cracks
  const strata = opts.strata ?? 1;
  const lift = opts.lift ?? 0;
  const mossLo = mixHex(pal.moss, D[1], 0.45), mossHi = mixHex(pal.moss, D[2], 0.2);
  return (x, y, z, kind, depth) => {
    const h = hash3(Math.floor(x * 10), Math.floor(y * 10), Math.floor(z * 10), seed);
    if (kind === 'floor' && depth === 0) {
      if (moss && fbm2(x * 0.4, z * 0.4, 2, seed + 4) > 1 - moss * 0.6 && h > 0.15) return h > 0.9 ? mossHi : mossLo;
      const n = fbm2(x * 0.5, z * 0.5, 2, seed + 1) + (h - 0.5) * 0.35;
      if (h > 0.95) return R[3]; // pebble
      if (h < 0.04) return R[1];
      return n > 0.6 ? D[2] : n > 0.32 ? D[1] : D[0];
    }
    if (kind === 'floor') return D[0];
    let t = 0.5 + (fbm2(x * 0.25 + z * 0.2, y * 0.9 * strata, 2, seed) - 0.5) * 1.1 + (h - 0.5) * 0.3;
    t += lift;
    if (kind === 'ceil') t -= 0.15;
    if (depth > 0) t -= 0.25;
    if (glowVeins && depth === 0) {
      const v = Math.abs(noise2(x * 0.8 + y * 0.2, y * 0.8 - x * 0.1, seed + 9) - 0.5);
      if (v < 0.011 && noise2(x * 0.22 + 7, y * 0.22, seed + 20) > 0.7) return GLOW | parseInt(glowVeins.slice(1), 16);
    }
    if (depth === 0 && kind === 'back' && speck.length && h > 0.991) return speck[Math.floor(hash3(x * 7, y * 7, z * 7, 2) * speck.length)];
    if (moss && kind === 'back' && depth === 0 && fbm2(x * 0.4, y * 0.6, 2, seed + 6) > 1.05 - moss * 0.5 && h > 0.4) return pal.moss;
    return R[clamp(Math.floor(t * 4) + 0, 0, 4)];
  };
}

/** Smooth-ish cave noise helper in metres. */
export const cnoise = (x, y, seed = 1, f = 0.35) => fbm2(x * f, y * f, 3, seed) - 0.5;
