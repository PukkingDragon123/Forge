// SDF sculpting for organic props: compose signed distance fields (metres), mesh them with naive
// surface nets on a coarse grid, then facet → hand-carved low-poly look. Each part carries a material
// key; triangles take the material of the nearest part, so one smooth-unioned surface can be fur
// on the body and pink on the snout with no seams or intersecting shells.
import * as THREE from 'three';
import { noise3, hash3 } from '../core/math.js';

// Every field carries an axis-aligned bound f.bb = [x0, y0, z0, x1, y1, z1]. Unions skip children whose
// box is already farther than the running minimum, and sculpt() only samples each part inside its box,
// so many-part sculpts (a mole with buttons and claws) stay cheap.
const B = (f, bb) => { f.bb = bb; return f; };
const pad = (bb, p) => (bb ? [bb[0] - p, bb[1] - p, bb[2] - p, bb[3] + p, bb[4] + p, bb[5] + p] : undefined);
const merge = (bbs) => (bbs.every(Boolean) ? bbs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])]) : undefined);
const boxDist = (b, x, y, z) => Math.hypot(Math.max(b[0] - x, 0, x - b[3]), Math.max(b[1] - y, 0, y - b[4]), Math.max(b[2] - z, 0, z - b[5]));

export const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);

// ------------------------------------------------------------------ primitives → f(x, y, z)
export const sphere = (c, r) => B((x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r]);
export function ellipsoid(c, r) {
  return B((x, y, z) => {
    const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
    const k0 = Math.hypot(px, py, pz), k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
  }, [c[0] - r[0], c[1] - r[1], c[2] - r[2], c[0] + r[0], c[1] + r[1], c[2] + r[2]]);
}
/** Tapered capsule from a (radius ra) to b (radius rb). */
export function capsule(a, b, ra, rb = ra) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz || 1e-9;
  const r = Math.max(ra, rb);
  return B((x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / l2));
    return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
  }, [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r]);
}
/** Smooth chain of tapered capsules through points with radii (roots, tails, drips). */
export function chain(pts, radii, k = 0.02) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push(capsule(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  return union(k, ...segs);
}
/** The individual segments of a chain (pass as separate sculpt parts for the sparse sampler). */
export function chainParts(pts, radii) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push(capsule(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  return segs;
}
/** Rounded box, half extents h, corner radius r, optional yaw. */
export function box(c, h, r = 0, yaw = 0) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const ex = Math.abs(h[0] * cs) + Math.abs(h[2] * sn), ez = Math.abs(h[0] * sn) + Math.abs(h[2] * cs);
  return B((x, y, z) => {
    let px = x - c[0], pz = z - c[2];
    const py = y - c[1];
    const rx = px * cs - pz * sn; pz = px * sn + pz * cs; px = rx;
    const qx = Math.abs(px) - h[0] + r, qy = Math.abs(py) - h[1] + r, qz = Math.abs(pz) - h[2] + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }, [c[0] - ex, c[1] - h[1], c[2] - ez, c[0] + ex, c[1] + h[1], c[2] + ez]);
}
/** Torus around the y axis (ring radius R, tube r). */
export const torus = (c, R, r) => B((x, y, z) => Math.hypot(Math.hypot(x - c[0], z - c[2]) - R, y - c[1]) - r, [c[0] - R - r, c[1] - r, c[2] - R - r, c[0] + R + r, c[1] + r, c[2] + R + r]);
/** Half-space: positive on the side n points to (use as a cutting plane). */
export function plane(c, n) {
  const l = Math.hypot(...n), nx = n[0] / l, ny = n[1] / l, nz = n[2] / l;
  return (x, y, z) => (x - c[0]) * nx + (y - c[1]) * ny + (z - c[2]) * nz;
}

// ------------------------------------------------------------------ operators
export function union(k, ...fs) {
  if (fs.length === 1) return fs[0];
  const n = fs.length, bbs = fs.map((f) => f.bb);
  return B((x, y, z) => {
    let d = Infinity;
    for (let i = 0; i < n; i++) {
      const b = bbs[i];
      if (b && d < Infinity && boxDist(b, x, y, z) > d + k) continue;
      const v = fs[i](x, y, z);
      d = d === Infinity ? v : smin(d, v, k);
    }
    return d;
  }, pad(merge(bbs), k * 0.25));
}
export const subtract = (k, a, ...bs) => B((x, y, z) => { let d = a(x, y, z); for (const b of bs) d = smax(d, -b(x, y, z), k); return d; }, a.bb);
export const intersect = (k, a, b) => B((x, y, z) => smax(a(x, y, z), b(x, y, z), k), a.bb || b.bb);
/** Clip everything below y0 (props sit flat on the ground). */
export const floor = (f, y0 = 0) => B((x, y, z) => Math.max(f(x, y, z), y0 - y), f.bb);
/** Wrap a custom field and keep the bound of `src` (padded). */
export const keep = (f, src, p = 0) => B(f, pad(src.bb, p));
/** Lumpy surface: value-noise displacement (amp in metres, freq in 1/m). */
export const noisy = (f, amp, freq, seed = 1) => B((x, y, z) => f(x, y, z) + (noise3(x * freq + 17, y * freq, z * freq, seed) - 0.5) * 2 * amp, pad(f.bb, amp));
/** Chip off n random flat facets (hand-cut stone). */
export function chipped(f, center, radius, n = 6, depth = 0.25, seed = 1) {
  const cuts = [];
  for (let i = 0; i < n; i++) {
    const u = hash3(i, 1, seed, 3), v = hash3(i, 2, seed, 3);
    const th = u * Math.PI * 2, ph = Math.acos(1 - v * 1.6); // biased to upper / side facets
    const nrm = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    const d = radius * (1 - depth * (0.5 + hash3(i, 3, seed, 3) * 0.6));
    cuts.push(plane([center[0] + nrm[0] * d, center[1] + nrm[1] * d, center[2] + nrm[2] * d], nrm));
  }
  return B((x, y, z) => { let d = f(x, y, z); for (const c of cuts) d = Math.max(d, c(x, y, z)); return d; }, f.bb);
}

// ------------------------------------------------------------------ surface nets
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const FAR = 1e9;
/**
 * Mesh parts = [{ f, m }] (m = material key) inside bounds [min, max] at grid `cell`.
 * opts: k (smooth blend between parts), jitter (carve wobble, fraction of cell), seed,
 *       paint(x, y, z, m) → m to recolour triangles (painted sutures, stripes).
 * Returns Map(m → non-indexed BufferGeometry).
 */
export function sculpt(parts, min, max, cell, opts = {}) {
  const k = opts.k ?? 0.03;
  const ox = min[0] - cell, oy = min[1] - cell, oz = min[2] - cell;
  const nx = Math.ceil((max[0] - min[0]) / cell) + 3, ny = Math.ceil((max[1] - min[1]) / cell) + 3, nz = Math.ceil((max[2] - min[2]) / cell) + 3;
  const V = new Float32Array(nx * ny * nz).fill(FAR);
  const id = (i, j, kk) => i + nx * (j + ny * kk);
  // sample each part only inside its own (padded) bounding box, smooth-min into the grid
  const margin = k + cell * 2;
  for (const p of parts) {
    const b = p.f.bb;
    const i0 = b ? Math.max(0, Math.floor((b[0] - margin - ox) / cell)) : 0, i1 = b ? Math.min(nx - 1, Math.ceil((b[3] + margin - ox) / cell)) : nx - 1;
    const j0 = b ? Math.max(0, Math.floor((b[1] - margin - oy) / cell)) : 0, j1 = b ? Math.min(ny - 1, Math.ceil((b[4] + margin - oy) / cell)) : ny - 1;
    const k0 = b ? Math.max(0, Math.floor((b[2] - margin - oz) / cell)) : 0, k1 = b ? Math.min(nz - 1, Math.ceil((b[5] + margin - oz) / cell)) : nz - 1;
    for (let kk = k0; kk <= k1; kk++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = p.f(ox + i * cell, oy + j * cell, oz + kk * cell);
      const n = id(i, j, kk), o = V[n];
      V[n] = o === FAR ? v : smin(o, v, k);
    }
  }
  // one vertex per sign-changing cell, at the mean of its edge crossings
  const C = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, kk) => i + (nx - 1) * (j + (ny - 1) * kk);
  const verts = [];
  const cv = new Float32Array(8), cp = [];
  for (let c = 0; c < 8; c++) cp.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  const jit = (opts.jitter ?? 0.12) * cell, seed = opts.seed ?? 1;
  for (let kk = 0; kk < nz - 1; kk++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = V[id(i + cp[c][0], j + cp[c][1], kk + cp[c][2])]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += cp[a][0] + (cp[b][0] - cp[a][0]) * t; sy += cp[a][1] + (cp[b][1] - cp[a][1]) * t; sz += cp[a][2] + (cp[b][2] - cp[a][2]) * t;
      n++;
    }
    C[cid(i, j, kk)] = verts.length;
    verts.push([
      ox + (i + sx / n) * cell + (hash3(i, j, kk, seed) - 0.5) * jit,
      oy + (j + sy / n) * cell + (hash3(i, j, kk, seed + 1) - 0.5) * jit,
      oz + (kk + sz / n) * cell + (hash3(i, j, kk, seed + 2) - 0.5) * jit,
    ]);
  }
  // quads across every sign-changing grid edge; triangle material = nearest part
  const out = new Map();
  const push = (a, b, c) => {
    const A = verts[a], Bv = verts[b], Cc = verts[c];
    const mx = (A[0] + Bv[0] + Cc[0]) / 3, my = (A[1] + Bv[1] + Cc[1]) / 3, mz = (A[2] + Bv[2] + Cc[2]) / 3;
    let m = parts[0].m;
    if (parts.length > 1) {
      let best = Infinity;
      for (const p of parts) {
        if (p.f.bb && boxDist(p.f.bb, mx, my, mz) > best) continue;
        const d = p.f(mx, my, mz);
        if (d < best) { best = d; m = p.m; }
      }
    }
    if (opts.paint) m = opts.paint(mx, my, mz, m);
    let arr = out.get(m);
    if (!arr) { arr = []; out.set(m, arr); }
    arr.push(A[0], A[1], A[2], Bv[0], Bv[1], Bv[2], Cc[0], Cc[1], Cc[2]);
  };
  const dims = [nx, ny, nz];
  const g = [0, 0, 0], q = [0, 0, 0], quad = [0, 0, 0, 0];
  const OFF = [[-1, -1], [0, -1], [0, 0], [-1, 0]];
  for (let kk = 0; kk < nz; kk++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = V[id(i, j, kk)];
    g[0] = i; g[1] = j; g[2] = kk;
    for (let ax = 0; ax < 3; ax++) {
      if (g[ax] + 1 >= dims[ax]) continue;
      const u = (ax + 1) % 3, w = (ax + 2) % 3;
      if (g[u] < 1 || g[w] < 1 || g[u] >= dims[u] - 1 || g[w] >= dims[w] - 1) continue;
      q[0] = g[0]; q[1] = g[1]; q[2] = g[2]; q[ax]++;
      const v1 = V[id(q[0], q[1], q[2])];
      if ((v0 < 0) === (v1 < 0)) continue;
      let ok = true;
      for (let o = 0; o < 4; o++) {
        q[0] = g[0]; q[1] = g[1]; q[2] = g[2]; q[u] += OFF[o][0]; q[w] += OFF[o][1];
        quad[o] = C[cid(q[0], q[1], q[2])];
        if (quad[o] < 0) ok = false;
      }
      if (!ok) continue;
      let [a, b, c, d] = quad;
      if (!(v0 < 0)) { const t = b; b = d; d = t; }
      // split along the shorter diagonal
      if (dist2(verts[a], verts[c]) <= dist2(verts[b], verts[d])) { push(a, b, c); push(a, c, d); } else { push(a, b, d); push(b, c, d); }
    }
  }
  const res = new Map();
  for (const [m, arr] of out) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    res.set(m, geo);
  }
  return res;
}
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Sculpt and add every material bucket to a Kit. mats: { key: material }; o: Kit.add options (o.per[key] overrides). */
export function addSculpt(kit, parts, min, max, cell, mats, o = {}, sopts = {}) {
  for (const [m, geo] of sculpt(parts, min, max, cell, sopts)) kit.add(geo, mats[m] || m, { ...o, ...(o.per && o.per[m]) });
}
