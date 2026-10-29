// Voxel painting kit for the explorers and their weapons: a sparse voxel "part" you paint with
// shapes and colour functions in integer voxel units, then mesh into one geometry with baked
// ambient occlusion, a soft bevel (outer edges of every face catch a little light), gentle face
// shading and per-voxel colour variation. Emissive voxels go to a separate unlit mesh so they bloom.
import * as THREE from 'three';

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export const GLOW = 1 << 24;

const rgbCache = new Map();
/** '#rrggbb' → [r,g,b] (0..255). Arrays pass through. */
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = rgbCache.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(c, v); }
  return v;
}
export const mix = (a, b, t) => { a = rgb(a); b = rgb(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
export const mul = (a, f) => { a = rgb(a); return [a[0] * f, a[1] * f, a[2] * f]; };
/** Deterministic hash in [0,1). */
export function hash(x, y, z = 0, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Pick a colour from a ramp [dark..light] at t, with a little per-voxel dither. */
export function ramp(cols, t, x = 0, y = 0, z = 0, s = 0) {
  // blended (not stepped) so neighbouring voxels never flip between two bands
  t = Math.max(0, Math.min(0.999, t + (hash(x, y, z, s) - 0.5) * 0.05)) * (cols.length - 1);
  const i = Math.floor(t);
  return mix(cols[i], cols[Math.min(i + 1, cols.length - 1)], t - i);
}

const pack = (c) => { const [r, g, b] = rgb(c); return ((Math.round(Math.min(255, r)) << 16) | (Math.round(Math.min(255, g)) << 8) | Math.round(Math.min(255, b))) >>> 0 || 0x010101; };
const KEY = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

/** A sparse voxel model in integer voxel coordinates (voxel x spans [x, x+1)). */
export class VPart {
  constructor() { this.m = new Map(); }
  set(x, y, z, c, glow = false) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (c === null || c === 0) { this.m.delete(KEY(x, y, z)); return; }
    if (c && c.glow) { glow = true; c = c.c; }
    this.m.set(KEY(x, y, z), { x, y, z, v: pack(c) | (glow ? GLOW : 0) });
  }
  get(x, y, z) { const e = this.m.get(KEY(x, y, z)); return e ? e.v : 0; }
  has(x, y, z) { return this.m.has(KEY(x, y, z)); }
  del(x, y, z) { this.m.delete(KEY(x, y, z)); }
  _put(x, y, z, c, a, glow) {
    const col = typeof c === 'function' ? c(x, y, z, a) : c;
    if (col === undefined) return;
    if (col === null) { this.del(x, y, z); return; }
    if (col && col.glow) this.set(x, y, z, col.c, true);
    else this.set(x, y, z, col, glow);
  }
  /** Box [x0,x1)×[y0,y1)×[z0,z1). */
  box(x0, y0, z0, x1, y1, z1, c, glow = false) {
    for (let z = Math.floor(z0); z < z1; z++) for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) this._put(x, y, z, c, 0, glow);
    return this;
  }
  /** Ellipsoid; colour fn gets (x,y,z,d) with d = normalised squared radius. */
  ell(cx, cy, cz, rx, ry, rz, c, glow = false) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d <= 1) this._put(x, y, z, c, d, glow);
    }
    return this;
  }
  /** Tapered capsule from a to b (radii ra→rb). Colour fn gets (x,y,z,t) with t along the segment. */
  cap(a, b, ra, rb, c, glow = false, o = {}) {
    const [ax, ay, az] = a, [bx, by, bz] = b;
    const ex = bx - ax, ey = by - ay, ez = bz - az, L2 = ex * ex + ey * ey + ez * ez || 1;
    const R = Math.max(ra, rb);
    const sx = o.sx || 1, sz = o.sz || 1;
    for (let z = Math.floor(Math.min(az, bz) - R * sz); z <= Math.ceil(Math.max(az, bz) + R * sz); z++)
      for (let y = Math.floor(Math.min(ay, by) - R); y <= Math.ceil(Math.max(ay, by) + R); y++)
        for (let x = Math.floor(Math.min(ax, bx) - R * sx); x <= Math.ceil(Math.max(ax, bx) + R * sx); x++) {
          const px = x + 0.5 - ax, py = y + 0.5 - ay, pz = z + 0.5 - az;
          let t = (px * ex + py * ey + pz * ez) / L2;
          if (o.flat && (t < 0 || t > 1)) continue;
          t = Math.max(0, Math.min(1, t));
          const dx = (px - ex * t) / sx, dy = py - ey * t, dz = (pz - ez * t) / sz;
          const r = ra + (rb - ra) * t;
          if (dx * dx + dy * dy + dz * dz <= r * r) this._put(x, y, z, c, t, glow);
        }
    return this;
  }
  /**
   * Stack of elliptical slices from y0 up to y1: f(y) → [rx, rz, cx = 0, cz = 0] or null.
   * o.shell = wall thickness (hollow), o.front = only z ≥ cz (for bibs and plates).
   * Colour fn gets (x,y,z,{u,d}) where u = angle around (0 = front) and d = normalised radius.
   */
  loft(y0, y1, f, c, o = {}) {
    for (let y = Math.floor(y0); y < y1; y++) {
      const s = f(y + 0.5);
      if (!s) continue;
      const [rx, rz, cx = 0, cz = 0] = s;
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dz = (z + 0.5 - cz) / rz;
        const d = dx * dx + dz * dz;
        if (d > 1) continue;
        if (o.shell) { const ix = (x + 0.5 - cx) / Math.max(0.3, rx - o.shell), iz = (z + 0.5 - cz) / Math.max(0.3, rz - o.shell); if (ix * ix + iz * iz < 1) continue; }
        if (o.front && z + 0.5 < cz) continue;
        this._put(x, y, z, c, { u: Math.atan2(x + 0.5 - cx, z + 0.5 - cz), d });
      }
    }
    return this;
  }
  /** Recolour existing voxels: fn(x,y,z,[r,g,b]) → colour | null (delete) | undefined (keep). */
  paint(fn) {
    for (const e of [...this.m.values()]) {
      const v = e.v;
      const col = fn(e.x, e.y, e.z, [(v >> 16) & 255, (v >> 8) & 255, v & 255]);
      if (col === undefined) continue;
      if (col === null) this.m.delete(KEY(e.x, e.y, e.z));
      else if (col && col.glow) this.set(e.x, e.y, e.z, col.c, true);
      else this.set(e.x, e.y, e.z, col, !!(v & GLOW));
    }
    return this;
  }
  /** Delete voxels where test(x,y,z) is true. */
  carve(test) { for (const e of [...this.m.values()]) if (test(e.x, e.y, e.z)) this.m.delete(KEY(e.x, e.y, e.z)); return this; }
  /** True if the voxel is on the outside (has an empty neighbour). */
  surface(x, y, z) { return !this.has(x + 1, y, z) || !this.has(x - 1, y, z) || !this.has(x, y + 1, z) || !this.has(x, y - 1, z) || !this.has(x, y, z + 1) || !this.has(x, y, z - 1); }
  /** Copy the x ≥ 0 half to the mirrored side (voxel x ↦ -x-1). */
  mirrorX() { for (const e of [...this.m.values()]) if (e.x >= 0) this.m.set(KEY(-e.x - 1, e.y, e.z), { x: -e.x - 1, y: e.y, z: e.z, v: e.v }); return this; }
  add(other, dx = 0, dy = 0, dz = 0) { for (const e of other.m.values()) this.m.set(KEY(e.x + dx, e.y + dy, e.z + dz), { x: e.x + dx, y: e.y + dy, z: e.z + dz, v: e.v }); return this; }
  get count() { return this.m.size; }

  /**
   * Mesh into { solid, glow } BufferGeometries (vertex colours, linear). vs: voxel size;
   * offset: [x,y,z] voxel-space point that maps to the local origin.
   */
  geometry(vs, offset = [0, 0, 0], o = {}) {
    const solid = { p: [], n: [], c: [], i: [] }, glow = { p: [], n: [], c: [], i: [] };
    const occ = (x, y, z) => { const e = this.m.get(KEY(x, y, z)); return e && !(e.v & GLOW) ? 1 : 0; };
    const jitter = o.jitter ?? 0.03, gi = o.glowIntensity ?? 2.4;
    for (const e of this.m.values()) {
      const { x, y, z, v } = e;
      const isGlow = (v & GLOW) !== 0;
      const base = [LIN[(v >> 16) & 255], LIN[(v >> 8) & 255], LIN[v & 255]];
      const jit = 1 + (hash(x, y, z, 7) - 0.5) * 2 * jitter;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const ne = this.m.get(KEY(x + F.n[0], y + F.n[1], z + F.n[2]));
        if (ne && !((ne.v & GLOW) && !isGlow)) continue;
        const B = isGlow ? glow : solid;
        const vi = B.p.length / 3;
        const aos = [];
        for (let k = 0; k < 4; k++) {
          const c = F.c[k];
          B.p.push((x + c[0] - offset[0]) * vs, (y + c[1] - offset[1]) * vs, (z + c[2] - offset[2]) * vs);
          B.n.push(F.n[0], F.n[1], F.n[2]);
          let m;
          if (isGlow) m = gi;
          else {
            const [s1, s2, cc, t1, t2] = F.ao[k];
            const a1 = occ(x + s1[0], y + s1[1], z + s1[2]), a2 = occ(x + s2[0], y + s2[1], z + s2[2]), a3 = occ(x + cc[0], y + cc[1], z + cc[2]);
            const ao = a1 && a2 ? 0 : 3 - (a1 + a2 + a3);
            aos.push(ao);
            // soft bevel: a corner on the outer rim of this face (no in-plane neighbour) catches light
            const rim = !this.has(x + t1[0], y + t1[1], z + t1[2]) || !this.has(x + t2[0], y + t2[1], z + t2[2]);
            m = AO[ao] * SHADE[f] * jit * (rim ? (f === 2 ? 1.16 : 1.08) : 1);
          }
          B.c.push(base[0] * m, base[1] * m, base[2] * m);
        }
        if (!isGlow && aos[0] + aos[2] > aos[1] + aos[3]) B.i.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        else B.i.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
      }
    }
    const build = (B) => {
      if (!B.i.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
      g.setIndex(B.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.i, 1) : new THREE.Uint16BufferAttribute(B.i, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    };
    return { solid: build(solid), glow: build(glow) };
  }
}

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
for (const F of FACES) {
  const dims = [0, 1, 2].filter((d) => F.n[d] === 0);
  F.ao = F.c.map((corner) => {
    const a = [0, 0, 0], b = [0, 0, 0];
    a[dims[0]] = corner[dims[0]] ? 1 : -1;
    b[dims[1]] = corner[dims[1]] ? 1 : -1;
    const n = F.n;
    return [[n[0] + a[0], n[1] + a[1], n[2] + a[2]], [n[0] + b[0], n[1] + b[1], n[2] + b[2]], [n[0] + a[0] + b[0], n[1] + a[1] + b[1], n[2] + a[2] + b[2]], a, b];
  });
}
const AO = [0.56, 0.72, 0.87, 1.0];
const SHADE = [0.9, 0.9, 1.0, 0.7, 0.96, 0.82];

/** Vertex-coloured toon material (unique so a character can flash). */
export function voxToon(o = {}) {
  // soft per-face light (no hard toon bands): voxels read clean, the baked AO and bevel do the rest
  return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: new THREE.Color(0, 0, 0), ...o });
}
export function voxGlow() { return new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }); }

/** Mesh a part into a group (solid + glow) under `parent`. */
export function meshPart(part, vs, offset, mat, glowMat, parent, name = 'vox') {
  const { solid, glow } = part.geometry(vs, offset);
  const g = new THREE.Group();
  g.name = name;
  if (solid) { const m = new THREE.Mesh(solid, mat); m.castShadow = true; m.receiveShadow = true; m.name = name + '_solid'; g.add(m); }
  if (glow) { const m = new THREE.Mesh(glow, glowMat); m.castShadow = false; m.name = name + '_glow'; g.add(m); }
  if (parent) parent.add(g);
  return g;
}
