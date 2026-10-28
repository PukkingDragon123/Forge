// Shared voxel-painting helpers for monster models.
import { VoxelGrid, packColor, GLOW } from '../gfx/voxel.js';
import { shadeHex, mixHex, hash3, clamp } from '../core/math.js';

const packCache = new Map();
/** Packed voxel color (memoised). */
export function pk(hex) {
  let v = packCache.get(hex);
  if (v === undefined) { v = packColor(hex); packCache.set(hex, v); }
  return v;
}
/** Emissive voxel color. */
export const gl = (hex) => pk(hex) | GLOW;
const toneCache = new Map();
/** Shaded variant (f<0 darker/cooler, f>0 lighter/warmer), quantised so caches stay small. */
export function tone(hex, f) {
  const q = Math.round(clamp(f, -0.6, 0.6) * 25) / 25;
  const k = hex + q;
  let v = toneCache.get(k);
  if (v === undefined) { v = pk(q === 0 ? hex : shadeHex(hex, q)); toneCache.set(k, v); }
  return v;
}
export const mix = (a, b, t) => mixHex(a, b, t);

/**
 * Body shader: vertical light gradient, optional belly patch (underside), spots, and a back stripe.
 * Returns fn(x,y,z) usable with VoxelGrid paint calls.
 */
export function shadeBody(base, cy, ry, cz, rz, o = {}) {
  return (x, y, z) => {
    const ny = (y + 0.5 - cy) / ry, nz = (z + 0.5 - cz) / rz;
    if (o.belly && ny < (o.bellyY ?? -0.3) && Math.abs(nz) < (o.bellyW ?? 0.75)) return tone(o.belly, ny * 0.08);
    let f = ny * (o.grad ?? 0.16);
    if (o.spots && hash3(x, y, z, o.seed || 3) > 1 - o.spots) return tone(o.spotColor || base, f - 0.2);
    if (o.noise) f += (hash3(x >> 1, y >> 1, z >> 1, o.seed || 9) - 0.5) * o.noise;
    return tone(base, f);
  };
}

export function grid(nx, ny, nz) { return new VoxelGrid(nx, ny, nz); }

/** Mirror a grid across z so left/right parts are exact twins. */
export function mirrorZ(g) {
  const o = new VoxelGrid(g.nx, g.ny, g.nz);
  for (let z = 0; z < g.nz; z++) for (let y = 0; y < g.ny; y++) for (let x = 0; x < g.nx; x++) {
    const v = g.data[g.i(x, y, z)];
    if (v) o.data[o.i(x, y, g.nz - 1 - z)] = v;
  }
  return o;
}

/** Simple eye: glowing iris with a dark pupil-less look, or a cute dark eye with highlight. */
export function eye(g, x, y, z, color, o = {}) {
  if (o.cute) {
    g.set(x, y, z, pk('#141018'));
    g.set(x, y + 1, z, pk('#141018'));
    g.set(x, y + 1, z + (o.dz || 0), pk('#ffffff'));
    return;
  }
  g.set(x, y, z, gl(color));
  if (o.big) { g.set(x, y + 1, z, gl(color)); g.set(x, y, z + (o.dz || 1), gl(shadeHex(color, 0.4))); }
}

/** Tapered spike/crystal along a direction. */
export function spike(g, x, y, z, dx, dy, dz, len, r0, col) {
  for (let i = 0; i <= len; i++) {
    const t = i / Math.max(1, len);
    const r = r0 * (1 - t) + 0.35;
    const cx = x + dx * i, cy = y + dy * i, cz = z + dz * i;
    if (r < 0.9) g.set(cx, cy, cz, typeof col === 'function' ? col(t) : col);
    else g.sphere(cx, cy, cz, r, typeof col === 'function' ? col(t) : col);
  }
}

/** Crystal cluster: a few glowing spikes fanning out from a base point. */
export function crystals(g, x, y, z, color, n = 3, len = 4, seed = 1) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash3(i, seed, 0) * 1.5;
    const tilt = 0.25 + hash3(i, seed, 1) * 0.45;
    const L = Math.round(len * (0.6 + hash3(i, seed, 2) * 0.6));
    spike(g, x, y, z, Math.cos(a) * tilt, 1, Math.sin(a) * tilt, L, 1.1, (t) => (t > 0.7 ? gl(shadeHex(color, 0.45)) : gl(t > 0.35 ? color : shadeHex(color, -0.15))));
  }
}
