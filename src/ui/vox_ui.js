// Voxel UI kit: every 2D object the UI shows (panels, tags, plaques, slates, signs, bubbles, the
// forge bench, the backpack…) is built as a real voxel model and rendered through voxSprite.
//
// Two builders:
//  • voxRelief(key, src, opts): turns a hand-made design canvas into a voxel relief — one voxel
//    column per V×V block, coloured from the design, raised by its light/dark structure (rims,
//    nails, bosses up; grooves and ink down) — and renders it face-on with a slight downward tilt,
//    so every raised piece shows its lit top edge and casts ambient occlusion. Layout is preserved
//    exactly (the front surface maps 1:1 onto the requested w×h; `.inner` rects carry over).
//  • VoxGrid / voxObject(key, build, opts): free-form voxel models (medallions, lanterns, rock
//    chunks, scales, signposts) with all six faces and per-vertex AO.
// Shading is baked into vertex colours (warm lit tops, cool shadowed sides) so the colours stay
// exactly as designed regardless of the scene's lights.
import * as THREE from 'three';
import { voxSprite } from '../gfx/voxsprite.js';

const PITCH = 0.45, COS = Math.cos(PITCH), SIN = Math.sin(PITCH);
const U = 0.05; // world units per pixel: keeps big panels well inside the sprite camera's depth range
const LIN = new Float32Array(256);
// voxSprite's target is sRGB-encoded on write, so vertex colours are linearised here to read back
// exactly as designed
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// face tints in sRGB space: [mul, tintR, tintG, tintB, tintAmount]
const FACES = {
  front: [1.0, 0, 0, 0, 0],
  top: [1.16, 255, 236, 200, 0.12],    // catches the warm key light
  left: [0.9, 255, 214, 170, 0.05],
  right: [0.66, 70, 56, 120, 0.2],     // falls into lavender shadow
  bottom: [0.5, 40, 34, 80, 0.25],
  back: [0.55, 50, 40, 90, 0.2],
};
function shade(r, g, b, face, ao, jit) {
  const f = FACES[face];
  const m = f[0] * (1 - ao * 0.14) * jit;
  const k = f[4];
  return [
    LIN[clamp255(Math.round((r * (1 - k) + f[1] * k) * m)) | 0],
    LIN[clamp255(Math.round((g * (1 - k) + f[2] * k) * m)) | 0],
    LIN[clamp255(Math.round((b * (1 - k) + f[3] * k) * m)) | 0],
  ];
}

class MeshBuf {
  constructor() { this.pos = []; this.col = []; this.idx = []; this.n = 0; }
  quad(a, b, c, d, cols) {
    // a b c d counter-clockwise as seen from the face's outside
    this.pos.push(...a, ...b, ...c, ...d);
    for (const c4 of cols) this.col.push(c4[0], c4[1], c4[2]);
    const n = this.n;
    // flip the diagonal when AO differs, to avoid the classic anisotropy artefact
    if (cols[0][3] + cols[2][3] > cols[1][3] + cols[3][3]) this.idx.push(n + 1, n + 2, n + 3, n + 1, n + 3, n);
    else this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  mesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n * 1.5 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
  }
}
const aoOf = (s1, s2, c) => (s1 && s2 ? 3 : s1 + s2 + c);

// ------------------------------------------------------------------ relief (design → voxel columns)
/**
 * Voxel relief of a design canvas, rendered back to a canvas of the same size.
 * opts: { V (px per voxel, auto by size), relief: 'emboss'|'flat'|'deep', base (layers) }
 */
const reliefCache = new Map();
export function voxRelief(key, srcOrFn, opts = {}) {
  const hit = reliefCache.get(key);
  if (hit) return hit;
  const src = typeof srcOrFn === 'function' ? srcOrFn() : srcOrFn;
  const W = src.width, H = src.height;
  if (!W || !H) return src;
  const area = W * H;
  const V = opts.V || (Math.min(W, H) < 30 || area < 2400 ? 1 : area > 250000 ? 4 : 2);
  const cols = Math.ceil(W / V), rows = Math.ceil(H / V);
  const out = voxSprite('relief|' + key + '|' + V, () => {
    const data = src.getContext('2d').getImageData(0, 0, W, H).data;
    // sample each block at its centre (keeps hard pixel-art colour, no blur)
    const R = new Uint8Array(cols * rows), G = new Uint8Array(cols * rows), B = new Uint8Array(cols * rows), A = new Uint8Array(cols * rows);
    let lumSum = 0, lumN = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const sx = Math.min(W - 1, i * V + (V >> 1)), sy = Math.min(H - 1, j * V + (V >> 1));
      let o = (sy * W + sx) * 4;
      if (data[o + 3] < 128) {
        // a block whose centre is empty but which is mostly solid still counts (thin shapes at V>1)
        let best = -1;
        for (let yy = 0; yy < V && best < 0; yy++) for (let xx = 0; xx < V; xx++) { const q = ((Math.min(H - 1, j * V + yy)) * W + Math.min(W - 1, i * V + xx)) * 4; if (data[q + 3] >= 128) { best = q; break; } }
        if (best < 0) continue;
        o = best;
      }
      const k = j * cols + i;
      R[k] = data[o]; G[k] = data[o + 1]; B[k] = data[o + 2]; A[k] = 1;
      const l = (data[o] * 0.3 + data[o + 1] * 0.59 + data[o + 2] * 0.11) / 255;
      lumSum += l; lumN++;
    }
    const mean = lumN ? lumSum / lumN : 0.5;
    const base = opts.base ?? 2;
    const mode = opts.relief || 'emboss';
    const Hh = new Int8Array(cols * rows);
    const solid = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && A[j * cols + i];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (!A[k]) continue;
      const l = (R[k] * 0.3 + G[k] * 0.59 + B[k] * 0.11) / 255;
      const d = l - mean;
      let h = base;
      if (mode === 'flat') h += d > 0.26 ? 1 : d < -0.3 ? -1 : 0;
      else {
        const s = mode === 'deep' ? 1.6 : 1;
        h += Math.round((d > 0.2 ? 2 : d > 0.09 ? 1 : d < -0.24 ? -1 : 0) * s);
      }
      if (l < 0.11) h = Math.min(h, base - 1); // ink lines and gaps sink in
      if (!solid(i - 1, j) || !solid(i + 1, j) || !solid(i, j - 1) || !solid(i, j + 1)) h = Math.max(h, base); // keep the cut edge
      Hh[k] = Math.max(1, Math.min(6, h));
    }
    const hAt = (i, j) => (i >= 0 && j >= 0 && i < cols && j < rows ? Hh[j * cols + i] : 0);
    const buf = new MeshBuf();
    const yS = 1 / COS; // stretch y so the tilted front surface lands exactly on the canvas
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, h = Hh[k];
      if (!h) continue;
      const r = R[k], g = G[k], b = B[k];
      const jit = 1 + (hash(i, j, 7) - 0.5) * 0.07;
      const x0 = i * V * U, x1 = Math.min(W, i * V + V) * U, y0 = -j * V * yS * U, y1 = -Math.min(H, (j + 1) * V) * yS * U, z = h * V * U;
      // front face, AO from taller neighbours around each corner
      const t = (di, dj) => (hAt(i + di, j + dj) > h ? 1 : 0);
      const aTL = aoOf(t(-1, 0), t(0, -1), t(-1, -1)), aTR = aoOf(t(1, 0), t(0, -1), t(1, -1));
      const aBR = aoOf(t(1, 0), t(0, 1), t(1, 1)), aBL = aoOf(t(-1, 0), t(0, 1), t(-1, 1));
      const c = (ao) => { const s = shade(r, g, b, 'front', ao, jit); s[3] = ao; return s; };
      buf.quad([x0, y1, z], [x1, y1, z], [x1, y0, z], [x0, y0, z], [c(aBL), c(aBR), c(aTR), c(aTL)]);
      // top edge where the block above is lower: the lit lip that sells the depth
      const hu = hAt(i, j - 1);
      if (hu < h) {
        const zb = hu * V * U;
        const ct = shade(r, g, b, 'top', 0, jit); ct[3] = 0;
        const cb = shade(r, g, b, 'top', hu > 0 ? 1 : 0, jit); cb[3] = hu > 0 ? 1 : 0;
        buf.quad([x0, y0, z], [x1, y0, z], [x1, y0, zb], [x0, y0, zb], [ct, ct, cb, cb]);
      }
    }
    const group = new THREE.Group();
    if (buf.n) group.add(buf.mesh());
    // invisible anchor: fixes the bounding box so the canvas mapping is exact
    const zMax = 6 * V * U;
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, W * U, -H * yS * U, zMax, 0, -H * yS * U, 0], 3));
    group.add(new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ visible: false })));
    group.userData.zMax = zMax;
    return group;
  }, { w: W, h: H, ppu: 1 / U, pitch: PITCH, yaw: 0, roll: 0, outline: opts.outline ?? [18, 10, 14], oy: SIN * ((opts.base ?? 2) * V - 3 * V) });
  for (const k of Object.keys(src)) if (k !== 'ppu') out[k] = src[k]; // .inner, .slots, .grid… travel with it
  reliefCache.set(key, out);
  if (reliefCache.size > 1200) reliefCache.delete(reliefCache.keys().next().value);
  return out;
}

/** Wrap a design-canvas function so it returns the voxel relief of its result (cached per args). */
export function voxify(name, paint, opts = {}) {
  return (...args) => {
    const key = name + '|' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join('|');
    const relief = typeof opts.relief === 'function' ? opts.relief(...args) : opts.relief;
    return voxRelief(key, () => paint(...args), { ...opts, relief });
  };
}

// ------------------------------------------------------------------ free-form voxel models
export class VoxGrid {
  constructor(nx, ny, nz) { this.nx = nx; this.ny = ny; this.nz = nz; this.c = new Int32Array(nx * ny * nz).fill(-1); }
  i(x, y, z) { return (z * this.ny + y) * this.nx + x; }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz; }
  set(x, y, z, rgb) { x |= 0; y |= 0; z |= 0; if (this.in(x, y, z)) this.c[this.i(x, y, z)] = typeof rgb === 'number' ? rgb : (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]; }
  get(x, y, z) { return this.in(x, y, z) ? this.c[this.i(x, y, z)] : -1; }
  solid(x, y, z) { return this.get(x, y, z) >= 0; }
  clear(x, y, z) { if (this.in(x, y, z)) this.c[this.i(x, y, z)] = -1; }
  box(x0, y0, z0, x1, y1, z1, col) { for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col); }
  /** Filled shape by predicate over the whole grid. */
  fill(pred, col) { for (let z = 0; z < this.nz; z++) for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) if (pred(x, y, z)) this.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col); }
  /** Mesh with baked face shading and AO. Grid y is up, z toward the viewer. */
  mesh(scale = 1) {
    const buf = new MeshBuf();
    const S = (x, y, z) => (this.solid(x, y, z) ? 1 : 0);
    const faces = [
      // dir, face name, 4 corners (offsets) CCW from outside, and the two in-plane axes for AO
      [[0, 0, 1], 'front', [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], 'back', [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], [1, 0, 0], [0, 1, 0]],
      [[0, 1, 0], 'top', [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [1, 0, 0], [0, 0, 1]],
      [[0, -1, 0], 'bottom', [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [1, 0, 0], [0, 0, 1]],
      [[1, 0, 0], 'right', [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], [0, 0, 1], [0, 1, 0]],
      [[-1, 0, 0], 'left', [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], [0, 0, 1], [0, 1, 0]],
    ];
    for (let z = 0; z < this.nz; z++) for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) {
      const v = this.get(x, y, z);
      if (v < 0) continue;
      const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
      const jit = 1 + (hash(x + z * 31, y, 3) - 0.5) * 0.08;
      for (const [d, name, corners, ua, va] of faces) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (S(nx, ny, nz)) continue;
        const cols = corners.map((o) => {
          // AO: the three voxels around this corner on the outside layer
          const su = o[ua.indexOf(1)] ? 1 : -1, sv = o[va.indexOf(1)] ? 1 : -1;
          const du = ua.map((q) => q * su), dv = va.map((q) => q * sv);
          const s1 = S(nx + du[0], ny + du[1], nz + du[2]), s2 = S(nx + dv[0], ny + dv[1], nz + dv[2]);
          const cc = S(nx + du[0] + dv[0], ny + du[1] + dv[1], nz + du[2] + dv[2]);
          const ao = aoOf(s1, s2, cc);
          const s = shade(r, g, b, name, ao, jit); s[3] = ao;
          return s;
        });
        const p = corners.map((o) => [(x + o[0]) * scale, (y + o[1]) * scale, (z + o[2]) * scale]);
        buf.quad(p[0], p[1], p[2], p[3], cols);
      }
    }
    return buf.mesh();
  }
}

/** Render a free-form voxel model (built by `build(): VoxGrid`) to a canvas. */
export function voxObject(key, build, opts = {}) {
  return voxSprite('obj|' + key, () => { const g = build(); const m = g.mesh(); m.position.set(-g.nx / 2, -g.ny / 2, -g.nz / 2); const grp = new THREE.Group(); grp.add(m); return grp; }, {
    w: opts.w || 64, h: opts.h || opts.w || 64, yaw: opts.yaw ?? -0.5, pitch: opts.pitch ?? 0.35, roll: opts.roll ?? 0, pad: opts.pad ?? 2, ppu: opts.ppu, outline: opts.outline, ox: opts.ox, oy: opts.oy,
  });
}

export const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const mixRgb = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
export const vhash = hash;
