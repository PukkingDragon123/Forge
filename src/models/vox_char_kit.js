// Voxel painting kit for the explorers and their weapons: a sparse voxel "part" you paint with
// shapes and colour functions in integer voxel units, then mesh into one greedy-merged geometry
// with baked ambient occlusion, a soft bevel (outer edges of every face catch a little light) and
// gentle face shading. Flat, evenly lit runs of one colour merge into single quads; corners keep
// their per-vertex occlusion. Emissive voxels go to a separate unlit mesh so they bloom.
import * as THREE from 'three';

/** World size of one voxel for voxel models at in-game scale (weapons, monsters, props). */
export const VOX = 0.04;
/** The party is drawn twice as fine, on its own grid (as are the weapons they hold). */
export const VOX_PARTY = 0.02;

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
/** Pick a tone from a ramp at t with no dither: flat colour blocks that the mesher can merge. */
export function tone(cols, t) {
  t = Math.max(0, Math.min(0.999, t)) * (cols.length - 1);
  return rgb(cols[Math.floor(t + 0.5)] || cols[cols.length - 1]);
}

const pack = (c) => { const [r, g, b] = rgb(c); return ((Math.round(Math.min(255, Math.max(0, r))) << 16) | (Math.round(Math.min(255, Math.max(0, g))) << 8) | Math.round(Math.min(255, Math.max(0, b)))) >>> 0 || 0x010101; };
const OFF = 512;
const KEY = (x, y, z) => ((x + OFF) * 1024 + (y + OFF)) * 1024 + (z + OFF);
const KX = (k) => Math.floor(k / 1048576) - OFF, KY = (k) => (Math.floor(k / 1024) & 1023) - OFF, KZ = (k) => (k & 1023) - OFF;

/** A sparse voxel model in integer voxel coordinates (voxel x spans [x, x+1)). */
export class VPart {
  constructor() { this.m = new Map(); }
  set(x, y, z, c, glow = false) {
    if (c === undefined) return;
    const k = KEY(Math.floor(x), Math.floor(y), Math.floor(z));
    if (c === null || c === 0) { this.m.delete(k); return; }
    if (c.glow) { glow = true; c = c.c; }
    this.m.set(k, pack(c) + (glow ? GLOW : 0));
  }
  get(x, y, z) { return this.m.get(KEY(x, y, z)) || 0; }
  has(x, y, z) { return this.m.has(KEY(x, y, z)); }
  del(x, y, z) { this.m.delete(KEY(x, y, z)); }
  _put(x, y, z, c, a, glow) {
    const col = typeof c === 'function' ? c(x, y, z, a) : c;
    if (col === undefined) return;
    if (col === null) { this.del(x, y, z); return; }
    this.set(x, y, z, col, glow);
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
  /** A chain of capsules through points [[x,y,z,r],...]; colour fn gets (x,y,z,t) with t along the whole chain. */
  path(pts, c, glow = false, o = {}) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = pts.length - 1;
      this.cap(a, b, a[3], b[3], typeof c === 'function' ? (x, y, z, t) => c(x, y, z, (i + t) / n) : c, glow, o);
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
      if (rx <= 0 || rz <= 0) continue;
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dz = (z + 0.5 - cz) / rz;
        const d = dx * dx + dz * dz;
        if (d > 1) continue;
        if (o.shell) { const ix = (x + 0.5 - cx) / Math.max(0.3, rx - o.shell), iz = (z + 0.5 - cz) / Math.max(0.3, rz - o.shell); if (ix * ix + iz * iz < 1) continue; }
        if (o.front && z + 0.5 < cz) continue;
        this._put(x, y, z, c, { u: Math.atan2(x + 0.5 - cx, z + 0.5 - cz), d }, o.glow);
      }
    }
    return this;
  }
  /** Each voxel as {x, y, z, v} (a snapshot, safe to edit the part while iterating). */
  entries() { const out = []; for (const [k, v] of this.m) out.push({ x: KX(k), y: KY(k), z: KZ(k), v }); return out; }
  /** Recolour existing voxels: fn(x,y,z,[r,g,b]) → colour | null (delete) | undefined (keep). */
  paint(fn) {
    for (const e of this.entries()) {
      const v = e.v;
      const col = fn(e.x, e.y, e.z, [(v >> 16) & 255, (v >> 8) & 255, v & 255]);
      if (col === undefined) continue;
      if (col === null) this.del(e.x, e.y, e.z);
      else if (col && col.glow) this.set(e.x, e.y, e.z, col.c, true);
      else this.set(e.x, e.y, e.z, col, (v & GLOW) !== 0);
    }
    return this;
  }
  /** Delete voxels where test(x,y,z) is true. */
  carve(test) { for (const e of this.entries()) if (test(e.x, e.y, e.z)) this.del(e.x, e.y, e.z); return this; }
  /** True if the voxel is on the outside (has an empty neighbour). */
  surface(x, y, z) { return !this.has(x + 1, y, z) || !this.has(x - 1, y, z) || !this.has(x, y + 1, z) || !this.has(x, y - 1, z) || !this.has(x, y, z + 1) || !this.has(x, y, z - 1); }
  /** Copy the x ≥ 0 half to the mirrored side (voxel x ↦ -x-1). */
  mirrorX() { for (const e of this.entries()) if (e.x >= 0) this.m.set(KEY(-e.x - 1, e.y, e.z), e.v); return this; }
  add(other, dx = 0, dy = 0, dz = 0) { for (const e of other.entries()) this.m.set(KEY(e.x + dx, e.y + dy, e.z + dz), e.v); return this; }
  get count() { return this.m.size; }
  /**
   * Re-voxelise onto a coarser grid (k output voxels per voxel, k < 1). Every voxel maps to the
   * output cell holding its centre; where several share a cell the one that matters most wins:
   * glowing, then exposed, then one that stands out sharply from its neighbours (seams, slits,
   * rivets survive the downsample), then the one nearest the cell centre.
   */
  resample(k) {
    if (k === 1) return this;
    const best = new Map();
    const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const e of this.entries()) {
      const ox = Math.floor((e.x + 0.5) * k), oy = Math.floor((e.y + 0.5) * k), oz = Math.floor((e.z + 0.5) * k);
      const key = KEY(ox, oy, oz);
      let s = e.v & GLOW ? 1e6 : 0, open = false, diff = 0;
      for (const n of N) {
        const nv = this.m.get(KEY(e.x + n[0], e.y + n[1], e.z + n[2]));
        if (nv === undefined) { open = true; continue; }
        diff += Math.abs(((e.v >> 16) & 255) - ((nv >> 16) & 255)) + Math.abs(((e.v >> 8) & 255) - ((nv >> 8) & 255)) + Math.abs((e.v & 255) - (nv & 255));
      }
      const fx = (e.x + 0.5) * k - ox - 0.5, fy = (e.y + 0.5) * k - oy - 0.5, fz = (e.z + 0.5) * k - oz - 0.5;
      s += (open ? 1e4 : 0) + (diff / 6 > 60 ? 100 + diff / 6 : 0) + (1 - (fx * fx + fy * fy + fz * fz)) * 20;
      const b = best.get(key);
      if (!b || s > b.s) best.set(key, { s, v: e.v });
    }
    const out = new VPart();
    for (const [key, b] of best) out.m.set(key, b.v);
    return out;
  }

  /**
   * Mesh into { solid, glow } BufferGeometries (vertex colours, linear). vs: voxel size;
   * offset: [x,y,z] voxel-space point that maps to the local origin. Greedy: runs of faces with the
   * same colour and the same, even lighting at all four corners merge into one quad.
   */
  geometry(vs, offset = [0, 0, 0], o = {}) {
    const jitter = o.jitter ?? 0, gi = o.glowIntensity ?? 2.4;
    if (!this.m.size) return { solid: null, glow: null };
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const k of this.m.keys()) {
      const x = KX(k), y = KY(k), z = KZ(k);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    // dense grid with a one-cell empty border
    const NX = x1 - x0 + 3, NY = y1 - y0 + 3, NZ = z1 - z0 + 3, SY = NX, SZ = NX * NY;
    const G = new Uint32Array(NX * NY * NZ);
    for (const [k, v] of this.m) G[(KX(k) - x0 + 1) + (KY(k) - y0 + 1) * SY + (KZ(k) - z0 + 1) * SZ] = v;
    const N3 = [NX, NY, NZ], ST = [1, SY, SZ], O3 = [x0 - 1, y0 - 1, z0 - 1];
    const solid = { p: [], c: [], n: [], i: [] }, glow = { p: [], c: [], n: [], i: [] };
    const occ = (i) => { const v = G[i]; return v && !(v & GLOW) ? 1 : 0; };
    const hasV = (i) => (G[i] ? 1 : 0);
    const emit = (B, d, s, slice, a0, b0, a1, b1, cols, nrm) => {
      const u = (d + 1) % 3, w = (d + 2) % 3;
      const vi = B.p.length / 3;
      const corners = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
      for (const [a, b] of corners) {
        const q = [0, 0, 0];
        q[d] = slice; q[u] = a; q[w] = b;
        B.p.push((q[0] + O3[0] - offset[0]) * vs, (q[1] + O3[1] - offset[1]) * vs, (q[2] + O3[2] - offset[2]) * vs);
        B.n.push(nrm[0], nrm[1], nrm[2]);
      }
      for (let k = 0; k < 4; k++) B.c.push(cols[k * 3], cols[k * 3 + 1], cols[k * 3 + 2]);
      // flip the diagonal so occlusion gradients don't crease
      const ao = cols.ao;
      const flip = ao && ao[0] + ao[2] < ao[1] + ao[3];
      if (s > 0) { if (flip) B.i.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi); else B.i.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); }
      else if (flip) B.i.push(vi + 1, vi + 3, vi + 2, vi + 1, vi, vi + 3); else B.i.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
    };
    const SHADEF = [[0.9, 0.9], [1.0, 0.7], [0.96, 0.82]]; // [axis][+,-]
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, w = (d + 2) % 3, NU = N3[u], NW = N3[w], sd = ST[d], su = ST[u], sw = ST[w];
      for (const s of [1, -1]) {
        const nrm = [0, 0, 0]; nrm[d] = s;
        const shade = SHADEF[d][s > 0 ? 0 : 1], top = d === 1 && s > 0;
        const keys = new Float64Array(NU * NW);
        for (let sl = 1; sl < N3[d] - 1; sl++) {
          keys.fill(0);
          const pending = [];
          for (let b = 1; b < NW - 1; b++) for (let a = 1; a < NU - 1; a++) {
            const i = sl * sd + a * su + b * sw, v = G[i];
            if (!v) continue;
            const ni = i + s * sd, nv = G[ni];
            const isGlow = (v & GLOW) !== 0;
            if (nv && !((nv & GLOW) && !isGlow)) continue;
            if (isGlow) { keys[a + b * NU] = v + 1e9; continue; }
            // per-corner occlusion and bevel
            const code = [];
            for (let k = 0; k < 4; k++) {
              const cu = k === 1 || k === 2 ? 1 : -1, cw = k >= 2 ? 1 : -1;
              const s1 = occ(ni + cu * su), s2 = occ(ni + cw * sw), c3 = occ(ni + cu * su + cw * sw);
              const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + c3);
              const rim = !hasV(i + cu * su) || !hasV(i + cw * sw) ? 1 : 0;
              code.push(ao * 2 + rim);
            }
            if (code[0] === code[1] && code[1] === code[2] && code[2] === code[3] && !jitter) keys[a + b * NU] = v * 8 + code[0] + 1;
            else pending.push([a, b, v, code]);
          }
          const slice = s > 0 ? sl + 1 : sl;
          const colOf = (v, codes, a, b) => {
            const base = [LIN[(v >> 16) & 255], LIN[(v >> 8) & 255], LIN[v & 255]];
            const jit = jitter ? 1 + (hash(a, b, sl, d * 2 + (s > 0 ? 1 : 0)) - 0.5) * 2 * jitter : 1;
            const out = []; out.ao = [];
            for (let k = 0; k < 4; k++) {
              const ao = codes[k] >> 1, rim = codes[k] & 1;
              const m = AO[ao] * shade * jit * (rim ? (top ? 1.16 : 1.08) : 1);
              out.push(base[0] * m, base[1] * m, base[2] * m);
              out.ao.push(ao);
            }
            return out;
          };
          for (const [a, b, v, code] of pending) emit(solid, d, s, slice, a, b, a + 1, b + 1, colOf(v, code, a, b), nrm);
          // greedy merge of the evenly lit faces
          for (let b = 1; b < NW - 1; b++) for (let a = 1; a < NU - 1;) {
            const k0 = keys[a + b * NU];
            if (!k0) { a++; continue; }
            let wa = 1;
            while (a + wa < NU - 1 && keys[a + wa + b * NU] === k0) wa++;
            let hb = 1;
            outer: while (b + hb < NW - 1) { for (let t = 0; t < wa; t++) if (keys[a + t + (b + hb) * NU] !== k0) break outer; hb++; }
            for (let tb = 0; tb < hb; tb++) for (let t = 0; t < wa; t++) keys[a + t + (b + tb) * NU] = 0;
            if (k0 >= 1e9) {
              const v = k0 - 1e9, c = [LIN[(v >> 16) & 255] * gi, LIN[(v >> 8) & 255] * gi, LIN[v & 255] * gi];
              emit(glow, d, s, slice, a, b, a + wa, b + hb, [...c, ...c, ...c, ...c], nrm);
            } else {
              const v = Math.floor((k0 - 1) / 8), code = (k0 - 1) % 8;
              emit(solid, d, s, slice, a, b, a + wa, b + hb, colOf(v, [code, code, code, code], a, b), nrm);
            }
            a += wa;
          }
        }
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

const AO = [0.56, 0.72, 0.87, 1.0];

/** Vertex-coloured material (unique so a character can flash). */
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
