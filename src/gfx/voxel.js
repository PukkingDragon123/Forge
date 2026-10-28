// Voxel volumes + mesher with baked ambient occlusion and per-voxel color jitter.
// Colors are stored as 0xRRGGBB (+ flags in the high byte); 0 = empty.
import * as THREE from 'three';
import { hash3, hexToRgb } from '../core/math.js';
import { voxelMaterial, voxelGlowMaterial } from './materials.js';

export const GLOW = 1 << 24;     // emissive voxel (unlit, blooms)
export const NOAO = 1 << 25;     // skip AO darkening
export const NOJIT = 1 << 26;    // skip color jitter

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN[i] = toLinear(i / 255);

export function packColor(hex) {
  const [r, g, b] = typeof hex === 'number' ? [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255] : hexToRgb(hex);
  return ((r << 16) | (g << 8) | b) >>> 0 || 0x010101;
}

export class VoxelGrid {
  constructor(nx, ny, nz) {
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.data = new Uint32Array(nx * ny * nz);
  }
  i(x, y, z) { return x + this.nx * (y + this.ny * z); }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz; }
  get(x, y, z) { return this.in(x, y, z) ? this.data[this.i(x, y, z)] : 0; }
  solid(x, y, z) { return this.in(x, y, z) && this.data[this.i(x, y, z)] !== 0; }
  set(x, y, z, c, flags = 0) {
    x |= 0; y |= 0; z |= 0;
    if (!this.in(x, y, z)) return;
    this.data[this.i(x, y, z)] = c ? (typeof c === 'number' && c > 0xffffff ? c : (packColor(c) | flags)) >>> 0 : 0;
  }
  clear(x, y, z) { if (this.in(x, y, z)) this.data[this.i(x, y, z)] = 0; }
  /** fill box [x0,x1)… with color or fn(x,y,z)->color|null */
  box(x0, y0, z0, x1, y1, z1, c, flags = 0) {
    for (let z = Math.max(0, z0 | 0); z < Math.min(this.nz, z1); z++)
      for (let y = Math.max(0, y0 | 0); y < Math.min(this.ny, y1); y++)
        for (let x = Math.max(0, x0 | 0); x < Math.min(this.nx, x1); x++) {
          const col = typeof c === 'function' ? c(x, y, z) : c;
          if (col === null || col === undefined) continue;
          if (col === 0) this.clear(x, y, z); else this.set(x, y, z, col, flags);
        }
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, c, flags = 0) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          if (d <= 1) {
            const col = typeof c === 'function' ? c(x, y, z, d) : c;
            if (col === null || col === undefined) continue;
            if (col === 0) this.clear(x, y, z); else this.set(x, y, z, col, flags);
          }
        }
  }
  sphere(cx, cy, cz, r, c, flags) { this.ellipsoid(cx, cy, cz, r, r, r, c, flags); }
  cylinderY(cx, cz, y0, y1, r0, r1, c, flags = 0) {
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0 - 1);
      const r = r0 + (r1 - r0) * t;
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
          if (dx * dx + dz * dz <= r * r) {
            const col = typeof c === 'function' ? c(x, y, z, t) : c;
            if (col) this.set(x, y, z, col, flags);
          }
        }
    }
  }
  /** 3D line of radius r */
  line(x0, y0, z0, x1, y1, z1, r, c, flags = 0) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))) * 2 + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
      if (r <= 0.5) { const col = typeof c === 'function' ? c(x | 0, y | 0, z | 0, t) : c; this.set(x, y, z, col, flags); }
      else this.sphere(x, y, z, r, typeof c === 'function' ? (a, b, d) => c(a, b, d, t) : c, flags);
    }
  }
  forEach(fn) {
    for (let z = 0; z < this.nz; z++) for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) {
      const v = this.data[this.i(x, y, z)];
      if (v) fn(x, y, z, v);
    }
  }
}

// face definitions: normal, 4 corners (CCW from outside), AO neighbor axes
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
// precompute AO neighbour offsets per face corner: [side1, side2, corner] each [dx,dy,dz] (incl. normal)
for (const F of FACES) {
  const dims = [0, 1, 2].filter((d) => F.n[d] === 0);
  F.ao = F.c.map((corner) => {
    const a = [0, 0, 0], b = [0, 0, 0];
    a[dims[0]] = corner[dims[0]] ? 1 : -1;
    b[dims[1]] = corner[dims[1]] ? 1 : -1;
    const n = F.n;
    return [
      [n[0] + a[0], n[1] + a[1], n[2] + a[2]],
      [n[0] + b[0], n[1] + b[1], n[2] + b[2]],
      [n[0] + a[0] + b[0], n[1] + a[1] + b[1], n[2] + a[2] + b[2]],
    ];
  });
}
const AO_CURVE = [0.5, 0.68, 0.84, 1.0];
// gentle directional shading baked per face so unlit/ambient areas still read as 3D
const FACE_SHADE = [0.86, 0.86, 1.0, 0.62, 0.94, 0.78];

/**
 * Mesh a grid. opts: size (voxel world size), origin [x,y,z] (grid-space center offset), jitter (0..1),
 * seed, glowIntensity, cull(x,y,z,face) to skip faces (e.g. hidden back faces), shade (bool)
 * Returns THREE.Group with a solid mesh and (if any) a glow mesh.
 */
export function meshVoxels(grid, opts = {}) {
  const size = opts.size ?? 0.1;
  const origin = opts.origin ?? [grid.nx / 2, 0, grid.nz / 2];
  const jitter = opts.jitter ?? 0.06;
  const seed = opts.seed ?? 1;
  const shade = opts.shade !== false;
  const buckets = { solid: { p: [], n: [], c: [], idx: [] }, glow: { p: [], n: [], c: [], idx: [] } };
  const { nx, ny, nz, data } = grid;
  const at = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz ? data[x + nx * (y + ny * z)] : 0);
  const occ = (x, y, z) => { const v = at(x, y, z); return v !== 0 && !(v & GLOW) ? 1 : 0; };

  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const v = data[x + nx * (y + ny * z)];
    if (!v) continue;
    const glow = (v & GLOW) !== 0;
    const r8 = (v >> 16) & 255, g8 = (v >> 8) & 255, b8 = v & 255;
    const jit = v & NOJIT ? 0 : (hash3(x, y, z, seed) - 0.5) * 2 * jitter;
    const base = [LIN[r8], LIN[g8], LIN[b8]];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const [fx, fy, fz] = F.n;
      const nb = at(x + fx, y + fy, z + fz);
      if (nb && !(nb & GLOW && !glow)) continue; // hidden face (glass-like glow voxels let solid faces show)
      if (opts.cull && opts.cull(x, y, z, f)) continue;
      const B = glow ? buckets.glow : buckets.solid;
      const vi = B.p.length / 3;
      const aos = [];
      for (let k = 0; k < 4; k++) {
        const [cx, cy, cz] = F.c[k];
        B.p.push((x + cx - origin[0]) * size, (y + cy - origin[1]) * size, (z + cz - origin[2]) * size);
        B.n.push(fx, fy, fz);
        let ao = 3;
        if (!glow && !(v & NOAO)) {
          const [s1, s2, cc] = F.ao[k];
          const side1 = occ(x + s1[0], y + s1[1], z + s1[2]);
          const side2 = occ(x + s2[0], y + s2[1], z + s2[2]);
          const corner = occ(x + cc[0], y + cc[1], z + cc[2]);
          ao = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
        }
        aos.push(ao);
        const fs = glow || !shade ? 1 : FACE_SHADE[f];
        const a = glow ? 1 : AO_CURVE[ao];
        const m = (1 + jit) * fs * a;
        B.c.push(base[0] * m, base[1] * m, base[2] * m);
      }
      // flip quad diagonal to avoid AO anisotropy
      if (aos[0] + aos[2] > aos[1] + aos[3]) B.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      else B.idx.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
    }
  }
  const group = new THREE.Group();
  const build = (B, mat, name) => {
    if (!B.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    geo.setIndex(B.idx.length > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  const solid = build(buckets.solid, opts.material || voxelMaterial(), 'solid');
  if (solid) { solid.castShadow = opts.castShadow ?? true; solid.receiveShadow = opts.receiveShadow ?? true; }
  const glowMesh = build(buckets.glow, voxelGlowMaterial(opts.glowIntensity ?? 2.2), 'glow');
  if (glowMesh) { glowMesh.castShadow = false; glowMesh.receiveShadow = false; }
  group.userData.solid = solid; group.userData.glow = glowMesh;
  return group;
}

/** Convenience: build a model by painting into a fresh grid. */
export function voxelModel(nx, ny, nz, paint, opts = {}) {
  const g = new VoxelGrid(nx, ny, nz);
  paint(g);
  const m = meshVoxels(g, opts);
  m.userData.grid = g;
  return m;
}
