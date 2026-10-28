// Digital sculpting for the explorers: bodies are signed-distance fields (ellipsoids, round cones,
// rounded boxes, tori) blended with smooth-min into continuous organic forms, carved with
// smooth-subtract (eye sockets, hood openings) and clipped into clothing shells. The field is
// meshed with narrow-band surface nets (fine grid for heads, coarser for bodies), faceted, painted
// with per-material pixel textures (planar face paint on the head) and skinned to a real
// THREE.Skeleton with smooth distance-based bone weights.
import * as THREE from 'three';

// ------------------------------------------------------------------ field ops
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
const smax = (a, b, k) => -smin(-a, -b, k);

/** Inverse rotation (world → local) from an euler triple. */
function invRot(rot) {
  if (!rot) return null;
  const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], rot[3] || 'XYZ')).elements;
  return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
}

// ------------------------------------------------------------------ primitives → { f, c, r }
/** Ellipsoid at pos with radii [rx, ry, rz] (optionally rotated). */
export function ell(pos, rad, rot) {
  const [px, py, pz] = pos, [ax, ay, az] = rad, R = invRot(rot);
  const ix = 1 / ax, iy = 1 / ay, iz = 1 / az, ix2 = ix * ix, iy2 = iy * iy, iz2 = iz * iz, rmin = Math.min(ax, ay, az);
  return {
    c: pos, r: Math.max(ax, ay, az),
    f(x, y, z) {
      let dx = x - px, dy = y - py, dz = z - pz;
      if (R) { const lx = R[0] * dx + R[1] * dy + R[2] * dz, ly = R[3] * dx + R[4] * dy + R[5] * dz, lz = R[6] * dx + R[7] * dy + R[8] * dz; dx = lx; dy = ly; dz = lz; }
      const k0 = Math.sqrt(dx * dx * ix2 + dy * dy * iy2 + dz * dz * iz2);
      if (k0 < 1e-6) return -rmin;
      const k1 = Math.sqrt(dx * dx * ix2 * ix2 + dy * dy * iy2 * iy2 + dz * dz * iz2 * iz2);
      return (k0 * (k0 - 1)) / k1;
    },
  };
}
/** Round cone (capsule when r1 = r2) from a to b. */
export function cone(a, b, r1, r2 = r1) {
  if (r2 > r1) return cone(b, a, r2, r1);
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const len = Math.sqrt(l2);
  return {
    c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: len / 2 + r1,
    f(x, y, z) {
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  };
}
/** Rounded box with half extents [hx, hy, hz]. */
export function box(pos, half, round = 0.004, rot) {
  const [px, py, pz] = pos, R = invRot(rot);
  const bx = half[0] - round, by = half[1] - round, bz = half[2] - round;
  return {
    c: pos, r: Math.hypot(...half) + round,
    f(x, y, z) {
      let dx = x - px, dy = y - py, dz = z - pz;
      if (R) { const lx = R[0] * dx + R[1] * dy + R[2] * dz, ly = R[3] * dx + R[4] * dy + R[5] * dz, lz = R[6] * dx + R[7] * dy + R[8] * dz; dx = lx; dy = ly; dz = lz; }
      const qx = Math.abs(dx) - bx, qy = Math.abs(dy) - by, qz = Math.abs(dz) - bz;
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - round;
    },
  };
}
/** Rounded cylinder along local Y. */
export function cyl(pos, r, hh, round = 0.003, rot) {
  const [px, py, pz] = pos, R = invRot(rot);
  return {
    c: pos, r: Math.hypot(r, hh) + round,
    f(x, y, z) {
      let dx = x - px, dy = y - py, dz = z - pz;
      if (R) { const lx = R[0] * dx + R[1] * dy + R[2] * dz, ly = R[3] * dx + R[4] * dy + R[5] * dz, lz = R[6] * dx + R[7] * dy + R[8] * dz; dx = lx; dy = ly; dz = lz; }
      const ax = Math.sqrt(dx * dx + dz * dz) - r + round, ay = Math.abs(dy) - hh + round;
      const ox = ax > 0 ? ax : 0, oy = ay > 0 ? ay : 0;
      return Math.min(Math.max(ax, ay), 0) + Math.sqrt(ox * ox + oy * oy) - round;
    },
  };
}
/** Torus around local Y (ring radius R, tube r); sz squashes the ring into an oval. */
export function torus(pos, Rr, r, rot, sz = 1) {
  const [px, py, pz] = pos, Rm = invRot(rot);
  return {
    c: pos, r: Rr * Math.max(1, sz) + r,
    f(x, y, z) {
      let dx = x - px, dy = y - py, dz = z - pz;
      if (Rm) { const lx = Rm[0] * dx + Rm[1] * dy + Rm[2] * dz, ly = Rm[3] * dx + Rm[4] * dy + Rm[5] * dz, lz = Rm[6] * dx + Rm[7] * dy + Rm[8] * dz; dx = lx; dy = ly; dz = lz; }
      const q = Math.sqrt(dx * dx + (dz / sz) * (dz / sz)) - Rr;
      return Math.sqrt(q * q + dy * dy) - r;
    },
  };
}
/** Hollow sheet of thickness 2t along a primitive's surface (cloth, hoods, plates). */
export function shell(prim, t) { return { c: prim.c, r: prim.r + t, thin: true, f: (x, y, z) => Math.abs(prim.f(x, y, z)) - t }; }
/** Bezier sample helper for locks, horns and tails. */
export function bez(p0, p1, p2, p3, n = 6) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(p3 ? [0, 1, 2].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k])
      : [0, 1, 2].map((k) => u * u * p0[k] + 2 * u * t * p1[k] + t * t * p2[k]));
  }
  return out;
}

// ------------------------------------------------------------------ sculpt description
/**
 * A sculpt is a set of groups (hard-unioned with each other); each group smooth-unions its parts,
 * then intersects its clips and smooth-subtracts its cuts. Groups can be shells offset from
 * tagged parts of another group (clothing layers).
 */
export class Sculpt {
  constructor() { this.groups = []; this.paints = []; }
  group(name, o = {}) {
    const g = new Group(name, o);
    this.groups.push(g);
    return g;
  }
  /** Recolour triangles whose centre lies inside a primitive (belts, cuffs, soles, patches). */
  paint(prim, mat, groups = null) { this.paints.push({ ...prim, mat, groups }); }
}
class Group {
  constructor(name, o) {
    this.name = name; this.fine = !!o.fine; this.k = o.k ?? 0.02; this.sigma = o.sigma ?? 0.016;
    this.mat = o.mat || null; this.bone = o.bone || null; this.base = null;
    this.weights = o.weights || null;           // (x,y,z) => [[bone, w], ...] overrides distance weights
    this.innerMat = o.innerMat || null;         // material for faces turned toward innerCenter (hood lining)
    this.innerCenter = o.innerCenter || null;
    this.adds = []; this.subs = []; this.clips = [];
  }
  /** Set defaults for following parts. */
  use(o) { if (o.mat !== undefined) this.mat = o.mat; if (o.bone !== undefined) this.bone = o.bone; if (o.k !== undefined) this.k = o.k; return this; }
  add(prim, o = {}) {
    const p = { ...prim, k: o.k ?? this.k, mat: o.mat ?? this.mat, bone: o.bone ?? this.bone, tag: o.tag || null, sigma: o.sigma ?? this.sigma };
    this.adds.push(p);
    return p;
  }
  sub(prim, o = {}) { this.subs.push({ ...prim, k: o.k ?? 0.006 }); return this; }
  clip(prim, o = {}) { this.clips.push({ ...prim, k: o.k ?? 0.004 }); return this; }
  /** Chain of round cones through points with radii (a lock, horn, tail, braid). */
  chain(pts, radii, o = {}) {
    for (let i = 0; i < pts.length - 1; i++) {
      const r1 = typeof radii === 'function' ? radii(i / (pts.length - 1)) : radii[i];
      const r2 = typeof radii === 'function' ? radii((i + 1) / (pts.length - 1)) : radii[i + 1];
      this.add(cone(pts[i], pts[i + 1], r1, r2), { ...o, k: o.k ?? 0.004 });
    }
    return this;
  }
  /** Clothing shell: tagged parts of another group, inflated by `offset`. */
  shellOf(group, tags, offset) { this.base = { parts: group.adds.filter((p) => tags.includes(p.tag)), offset }; return this; }
}

// ------------------------------------------------------------------ evaluation
function evalAdds(parts, x, y, z, d) {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], c = p.c;
    const dx = x - c[0], dy = y - c[1], dz = z - c[2], lim = d + p.k + p.r;
    if (lim < 0 || dx * dx + dy * dy + dz * dz > lim * lim) continue;
    d = smin(d, p.f(x, y, z), p.k);
  }
  return d;
}
function evalGroup(g, x, y, z) {
  let d = 1e9;
  if (g.base) d = evalAdds(g.base.parts, x, y, z, 1e9) - g.base.offset;
  d = evalAdds(g.adds, x, y, z, d);
  if (d > 0.25) return d;
  for (const c of g.clips) d = smax(d, c.f(x, y, z), c.k);
  for (const s of g.subs) {
    const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) - s.r > -d + s.k) continue;
    d = smax(d, -s.f(x, y, z), s.k);
  }
  return d;
}
/** Groups restricted to the parts that can matter inside a sphere (centre c, radius rad, band lim). */
function localGroups(groups, cx, cy, cz, rad, lim) {
  const near = (p) => { const dx = cx - p.c[0], dy = cy - p.c[1], dz = cz - p.c[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r - rad < lim + p.k; };
  const out = [];
  for (const g of groups) {
    const adds = g.adds.filter(near), base = g.base ? g.base.parts.filter(near) : [];
    if (!adds.length && !base.length) continue;
    out.push({ src: g, adds, base: base.length ? { parts: base, offset: g.base.offset } : null, subs: g.subs.filter(near), clips: g.clips });
  }
  return out;
}
let LAST_G = 0; // index of the group that won the last field evaluation
const fieldOf = (gs) => (x, y, z) => { let d = 1e9; for (let i = 0; i < gs.length; i++) { const v = evalGroup(gs[i], x, y, z); if (v < d) { d = v; LAST_G = gs[i].src ? gs[i].src._i : gs[i]._i; } } return d; };
function groupBounds(g) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of [...g.adds, ...(g.base ? g.base.parts : [])]) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.c[a] - p.r - (g.base ? g.base.offset : 0)); hi[a] = Math.max(hi[a], p.c[a] + p.r + (g.base ? g.base.offset : 0)); }
  return [lo, hi];
}

// ------------------------------------------------------------------ narrow-band surface nets
const CUBE_EDGES = [0, 1, 0, 2, 0, 4, 1, 3, 1, 5, 2, 3, 2, 6, 3, 7, 4, 5, 4, 6, 5, 7, 6, 7];
function surfaceNets(fn, lo, hi, h, groups) {
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 2, ny = Math.ceil((hi[1] - lo[1]) / h) + 2, nz = Math.ceil((hi[2] - lo[2]) / h) + 2;
  const ox = lo[0] - h * 0.5, oy = lo[1] - h * 0.5, oz = lo[2] - h * 0.5;
  const sx = 1, sy = nx, sz = nx * ny;
  const F = new Float32Array(nx * ny * nz).fill(NaN), G = new Uint8Array(nx * ny * nz);
  // coarse pass: only evaluate fine samples near the surface
  const C = 4, cnx = Math.ceil((nx - 1) / C) + 1, cny = Math.ceil((ny - 1) / C) + 1, cnz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) coarse[i + cnx * (j + cny * k)] = fn(ox + i * C * h, oy + j * C * h, oz + k * C * h);
  const thr = C * h * 2.05;
  const active = [];
  for (let k = 0; k < cnz - 1; k++) for (let j = 0; j < cny - 1; j++) for (let i = 0; i < cnx - 1; i++) {
    let m = 1e9;
    for (let c = 0; c < 8; c++) { const v = Math.abs(coarse[(i + (c & 1)) + cnx * ((j + ((c >> 1) & 1)) + cny * (k + ((c >> 2) & 1)))]); if (v < m) m = v; }
    if (m > thr) continue;
    active.push(i + cnx * (j + cny * k));
    // mid level: 2×2×2 sub-cells of 2h, each refined only if the surface can pass through it
    const cx0 = i * C, cy0 = j * C, cz0 = k * C;
    const rad = C * h * 0.87;
    const lgC = localGroups(groups, ox + (cx0 + C / 2) * h, oy + (cy0 + C / 2) * h, oz + (cz0 + C / 2) * h, rad, thr + 2 * rad);
    const lfC = fieldOf(lgC);
    const get = (ii, jj, kk) => {
      if (ii > nx - 1 || jj > ny - 1 || kk > nz - 1) return 1e9;
      const idx = ii + sy * jj + sz * kk;
      if (F[idx] !== F[idx]) { F[idx] = lfC(ox + ii * h, oy + jj * h, oz + kk * h); G[idx] = LAST_G; }
      return F[idx];
    };
    const thr2 = 2 * h * 1.9, rad2 = 2 * h * 0.87;
    for (let sk = 0; sk < 2; sk++) for (let sj = 0; sj < 2; sj++) for (let si = 0; si < 2; si++) {
      const bx = cx0 + si * 2, by = cy0 + sj * 2, bz = cz0 + sk * 2;
      if (bx > nx - 2 || by > ny - 2 || bz > nz - 2) continue;
      let m2 = 1e9;
      for (let c = 0; c < 8; c++) { const v = Math.abs(get(bx + (c & 1) * 2, by + ((c >> 1) & 1) * 2, bz + ((c >> 2) & 1) * 2)); if (v < m2) m2 = v; }
      if (m2 > thr2) continue;
      const lf = fieldOf(localGroups(lgC.map((g) => g.src), ox + (bx + 1) * h, oy + (by + 1) * h, oz + (bz + 1) * h, rad2, thr2 + 2 * rad2));
      for (let kk = bz; kk <= Math.min(nz - 1, bz + 2); kk++) for (let jj = by; jj <= Math.min(ny - 1, by + 2); jj++) for (let ii = bx; ii <= Math.min(nx - 1, bx + 2); ii++) {
        const idx = ii + sy * jj + sz * kk;
        if (F[idx] !== F[idx]) { F[idx] = lf(ox + ii * h, oy + jj * h, oz + kk * h); G[idx] = LAST_G; }
      }
    }
  }
  // vertices: one per sign-changing cell at the mean of its edge crossings (active coarse cells only)
  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const V = [];
  const val = new Float32Array(8);
  const off = [0, sx, sy, sx + sy, sz, sx + sz, sy + sz, sx + sy + sz];
  const cells = [], tags = [];
  for (const ac of active) {
    const ci = ac % cnx, cj = Math.floor(ac / cnx) % cny, ck = Math.floor(ac / (cnx * cny));
    const i1 = Math.min(nx - 2, ci * C + C - 1), j1 = Math.min(ny - 2, cj * C + C - 1), k1 = Math.min(nz - 2, ck * C + C - 1);
    for (let k = ck * C; k <= k1; k++) for (let j = cj * C; j <= j1; j++) for (let i = ci * C; i <= i1; i++) {
      const base = i + sy * j + sz * k;
      cells.push(base);
      let mask = 0, bad = false;
      for (let c = 0; c < 8; c++) { const v = F[base + off[c]]; if (v !== v) { bad = true; break; } val[c] = v; if (v < 0) mask |= 1 << c; }
      if (bad || mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, n = 0;
      for (let e = 0; e < 24; e += 2) {
        const a = CUBE_EDGES[e], b = CUBE_EDGES[e + 1];
        const va = val[a], vb = val[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        ax += (a & 1) + (((b & 1) - (a & 1)) * t); ay += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); az += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
        n++;
      }
      cell[base] = V.length / 3;
      let bc = 0, bv = 1e9;
      for (let c = 0; c < 8; c++) { const a = Math.abs(val[c]); if (a < bv) { bv = a; bc = c; } }
      tags.push(G[base + off[bc]]);
      V.push(ox + (i + ax / n) * h, oy + (j + ay / n) * h, oz + (k + az / n) * h);
    }
  }
  // quads across every sign-changing grid edge
  const T = [];
  const axes = [sx, sy, sz, sy, sz, sx, sz, sx, sy]; // (a, u, v) cyclic
  for (const p of cells) {
    const v0 = F[p];
    if (v0 !== v0) continue;
    for (let q = 0; q < 9; q += 3) {
      const a = axes[q], u = axes[q + 1], v = axes[q + 2];
      const v1 = F[p + a];
      if (v1 !== v1 || (v0 < 0) === (v1 < 0) || p - u - v < 0) continue;
      const q0 = cell[p - u - v], q1 = cell[p - v], q2 = cell[p], q3 = cell[p - u];
      if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) continue;
      if (v0 < 0) T.push(q0, q1, q2, q0, q2, q3); else T.push(q0, q2, q1, q0, q3, q2);
    }
  }
  return { V: new Float32Array(V), T: new Uint32Array(T), tag: Int32Array.from(tags) };
}

/** Taubin λ|μ smoothing: removes grid stair-stepping without shrinking the sculpt. */
function relax(mesh, iters = 2) {
  const { V, T } = mesh, n = V.length / 3;
  const acc = new Float32Array(V.length), cnt = new Uint16Array(n);
  for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) cnt[T[t + e]] += 2;
  const pass = (f) => {
    acc.fill(0);
    for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = T[t + e], b = T[t + (e + 1) % 3];
      acc[a * 3] += V[b * 3]; acc[a * 3 + 1] += V[b * 3 + 1]; acc[a * 3 + 2] += V[b * 3 + 2];
      acc[b * 3] += V[a * 3]; acc[b * 3 + 1] += V[a * 3 + 1]; acc[b * 3 + 2] += V[a * 3 + 2];
    }
    for (let i = 0; i < n; i++) {
      if (!cnt[i]) continue;
      for (let k = 0; k < 3; k++) V[i * 3 + k] += f * (acc[i * 3 + k] / cnt[i] - V[i * 3 + k]);
    }
  };
  for (let it = 0; it < iters; it++) { pass(0.5); pass(-0.53); }
}

/**
 * Vertex clustering for the faceted low-poly look: vertices merge per grid cell, but only with
 * vertices of the same sculpt group facing the same way (so thin cloth keeps both sides and
 * creases between layers stay crisp). tag[i] = group index of vertex i.
 */
function cluster(mesh, size, tag, thin) {
  const { V, T } = mesh, n = V.length / 3;
  const N = new Float32Array(V.length);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; }
  }
  const key = new Map(), rep = new Int32Array(n), sum = [];
  for (let i = 0; i < n; i++) {
    const x = V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const dir = ax >= ay && ax >= az ? (nx > 0 ? 0 : 1) : ay >= az ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5);
    const k = (((Math.floor(x / size) + 200) * 400 + (Math.floor(y / size) + 200)) * 400 + (Math.floor(z / size) + 200)) * 256 + (thin[tag[i]] ? dir : 0) * 32 + tag[i];
    let r = key.get(k);
    if (r === undefined) { r = sum.length / 4; key.set(k, r); sum.push(0, 0, 0, 0); }
    rep[i] = r;
    sum[r * 4] += x; sum[r * 4 + 1] += y; sum[r * 4 + 2] += z; sum[r * 4 + 3] += 1;
  }
  const m = sum.length / 4, NV = new Float32Array(m * 3), Ntag = new Int32Array(m);
  for (let r = 0; r < m; r++) { const w = sum[r * 4 + 3]; NV[r * 3] = sum[r * 4] / w; NV[r * 3 + 1] = sum[r * 4 + 1] / w; NV[r * 3 + 2] = sum[r * 4 + 2] / w; }
  for (let i = 0; i < n; i++) Ntag[rep[i]] = tag[i];
  const NT = [], seen = new Set();
  for (let t = 0; t < T.length; t += 3) {
    const a = rep[T[t]], b = rep[T[t + 1]], c = rep[T[t + 2]];
    if (a === b || b === c || a === c) continue;
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), k = lo * 4194304 * 4 + (a + b + c - lo - hi) * 4194304 + hi;
    if (seen.has(k)) continue;
    seen.add(k);
    NT.push(a, b, c);
  }
  return { V: NV, T: new Uint32Array(NT), tag: Ntag };
}

// ------------------------------------------------------------------ build the skinned mesh
const adjacent = (a, b) => a === b || a.parent === b || b.parent === a;

/**
 * Mesh, paint and skin a sculpt.
 * o: { hBody, hFine, clusterBody, clusterFine, bones: [Bone], mats: { name: { material, uv: 'tri'|'face', density, face } } }
 */
export function buildSculpt(S, o) {
  const boneIdx = new Map(o.bones.map((b, i) => [b, i]));
  const P = globalThis.SDF_PROF;
  const allTris = [], allV = [], vLocal = [];
  const BK = 0.06, LIM = 0.09;
  for (const fine of [false, true]) {
    const groups = S.groups.filter((g) => g.fine === fine && (g.adds.length || g.base));
    if (!groups.length) continue;
    groups.forEach((g, i) => { g._i = i; });
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const g of groups) { const [a, b] = groupBounds(g); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a[i]); hi[i] = Math.max(hi[i], b[i]); } }
    const fn = fieldOf(groups);
    const h = fine ? o.hFine : o.hBody;
    const t0 = P ? performance.now() : 0;
    let mesh = surfaceNets(fn, lo, hi, h, groups);
    const t1 = P ? performance.now() : 0;
    // spatial buckets → local part lists (relaxation, weights and paint only look at nearby parts)
    const buckets = new Map();
    const localAt = (x, y, z) => {
      const kx = Math.floor(x / BK), ky = Math.floor(y / BK), kz = Math.floor(z / BK), key = (kx + 512) + 1024 * ((ky + 512) + 1024 * (kz + 512));
      let L = buckets.get(key);
      if (!L) { const gs = localGroups(groups, (kx + 0.5) * BK, (ky + 0.5) * BK, (kz + 0.5) * BK, BK * 0.87, LIM); L = { gs, fn: fieldOf(gs) }; buckets.set(key, L); }
      return L;
    };
    relax(mesh, 2);
    const cl = fine ? o.clusterFine : o.clusterBody;
    if (cl) {
      const tag = mesh.tag;
      mesh = cluster(mesh, cl, tag, groups.map((g) => !!g.base || g.adds.some((p) => p.thin)));
    }
    if (P) console.log('  nets', fine ? 'fine' : 'body', (t1 - t0).toFixed(0), 'relax', (performance.now() - t1).toFixed(0), 'verts', mesh.V.length / 3, 'tris', mesh.T.length / 3);
    const base = allV.length / 3;
    for (let i = 0; i < mesh.V.length; i++) allV.push(mesh.V[i]);
    for (let i = 0; i < mesh.T.length; i++) allTris.push(mesh.T[i] + base);
    for (let i = 0; i < mesh.V.length / 3; i++) { const L = localAt(mesh.V[i * 3], mesh.V[i * 3 + 1], mesh.V[i * 3 + 2]); vLocal.push(L.gs.find((g) => g.src === groups[mesh.tag[i]]) || L.gs[0] || null); }
  }
  const nV = allV.length / 3;
  const tw = P ? performance.now() : 0;
  // per-vertex: winning group, bone weights from that group's parts (bones adjacent to the closest part)
  const skinI = new Uint16Array(nV * 4), skinW = new Float32Array(nV * 4), vWin = new Array(nV);
  const acc = new Float32Array(o.bones.length), touched = [], ds = new Float32Array(512);
  for (let i = 0; i < nV; i++) {
    const x = allV[i * 3], y = allV[i * 3 + 1], z = allV[i * 3 + 2];
    const best = vLocal[i];
    if (!best) { vWin[i] = null; skinI[i * 4] = 0; skinW[i * 4] = 1; continue; }
    vWin[i] = best;
    const src = best.src;
    if (src.weights) {
      const ws = src.weights(x, y, z).filter((e) => e[1] > 1e-4).slice(0, 4);
      const tot = ws.reduce((a, e) => a + e[1], 0) || 1;
      ws.forEach(([b, w], j) => { skinI[i * 4 + j] = boneIdx.get(b) ?? 0; skinW[i * 4 + j] = w / tot; });
      continue;
    }
    const off = best.base ? best.base.offset : 0;
    const nb = best.base ? best.base.parts.length : 0, np = nb + best.adds.length;
    let pmin = null, dmin = 1e9;
    for (let j = 0; j < np; j++) {
      const p = j < nb ? best.base.parts[j] : best.adds[j - nb];
      const d = p.f(x, y, z) - (j < nb ? off : 0);
      ds[j] = d;
      if (d < dmin && p.bone) { dmin = d; pmin = p; }
    }
    touched.length = 0;
    if (pmin) for (let j = 0; j < np; j++) {
      const p = j < nb ? best.base.parts[j] : best.adds[j - nb];
      if (!p.bone || ds[j] > dmin + p.sigma * 5 || !adjacent(p.bone, pmin.bone)) continue;
      const bi = boneIdx.get(p.bone);
      if (bi === undefined) continue;
      if (acc[bi] === 0) touched.push(bi);
      acc[bi] += Math.exp(-(ds[j] - dmin) / p.sigma);
    }
    touched.sort((a, b) => acc[b] - acc[a]);
    const n4 = Math.min(4, touched.length);
    let tot = 0;
    for (let j = 0; j < n4; j++) tot += acc[touched[j]];
    for (let j = 0; j < n4; j++) { skinI[i * 4 + j] = touched[j]; skinW[i * 4 + j] = acc[touched[j]] / tot; }
    for (const bi of touched) acc[bi] = 0;
    if (!n4) { skinI[i * 4] = boneIdx.get(src.bone) ?? 0; skinW[i * 4] = 1; }
  }
  if (P) console.log('  weights', (performance.now() - tw).toFixed(0));
  const tm = P ? performance.now() : 0;
  // per-triangle material: nearest part of the winning group at the centroid, then paint regions
  const nT = allTris.length / 3, tMat = new Array(nT);
  for (let t = 0; t < nT; t++) {
    const a = allTris[t * 3], b = allTris[t * 3 + 1], c = allTris[t * 3 + 2];
    const x = (allV[a * 3] + allV[b * 3] + allV[c * 3]) / 3, y = (allV[a * 3 + 1] + allV[b * 3 + 1] + allV[c * 3 + 1]) / 3, z = (allV[a * 3 + 2] + allV[b * 3 + 2] + allV[c * 3 + 2]) / 3;
    let g = vWin[a] || vWin[b] || vWin[c];
    if (vWin[b] && vWin[b] === vWin[c]) g = vWin[b];
    if (!g) { tMat[t] = 'default'; continue; }
    const src = g.src;
    if (src._uni === undefined) { const ms = new Set(src.adds.map((p) => p.mat || src.mat)); src._uni = ms.size === 1 ? [...ms][0] : null; }
    let mat = src.mat, dm = 1e9;
    if (src._uni !== null) mat = src._uni || src.mat;
    else for (const p of g.adds) {
      if (!p.mat) continue;
      const dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r > dm + 0.02) continue;
      const d = p.f(x, y, z);
      if (d < dm) { dm = d; mat = p.mat; }
    }
    if (src.base && src.mat && src._uni === null) mat = dm < 0.003 ? mat : src.mat;
    if (src.innerMat) {
      const ux = allV[b * 3] - allV[a * 3], uy = allV[b * 3 + 1] - allV[a * 3 + 1], uz = allV[b * 3 + 2] - allV[a * 3 + 2];
      const vx = allV[c * 3] - allV[a * 3], vy = allV[c * 3 + 1] - allV[a * 3 + 1], vz = allV[c * 3 + 2] - allV[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, C = src.innerCenter;
      if (nx * (x - C[0]) + ny * (y - C[1]) + nz * (z - C[2]) < 0) mat = src.innerMat;
    }
    for (const pr of S.paints) if ((!pr.groups || pr.groups.includes(src.name)) && pr.f(x, y, z) < 0) mat = pr.mat;
    tMat[t] = mat || 'default';
  }
  if (P) console.log('  mats', (performance.now() - tm).toFixed(0));
  // non-indexed, sorted by material, faceted normals, projected UVs
  const order = [...Array(nT).keys()].sort((p, q) => (tMat[p] < tMat[q] ? -1 : tMat[p] > tMat[q] ? 1 : 0));
  const pos = new Float32Array(nT * 9), uv = new Float32Array(nT * 6), si = new Uint16Array(nT * 12), sw = new Float32Array(nT * 12);
  const geo = new THREE.BufferGeometry();
  const matList = [], matIndex = new Map();
  let start = 0, cur = null;
  order.forEach((t, n) => {
    const name = tMat[t];
    if (name !== cur) {
      if (cur !== null) geo.addGroup(start * 3, (n - start) * 3, matIndex.get(cur));
      cur = name; start = n;
      if (!matIndex.has(name)) { matIndex.set(name, matList.length); matList.push(o.mats[name] ? o.mats[name].material : o.mats.default.material); }
    }
    const ids = [allTris[t * 3], allTris[t * 3 + 1], allTris[t * 3 + 2]];
    const P = ids.map((v) => [allV[v * 3], allV[v * 3 + 1], allV[v * 3 + 2]]);
    const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const M = o.mats[name] || o.mats.default;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (let k = 0; k < 3; k++) {
      const [x, y, z] = P[k];
      pos.set(P[k], n * 9 + k * 3);
      let u, v;
      if (M.uv === 'face') {
        const F = M.face;
        u = (x - F.cx) / F.w + 0.5; v = (y - F.y0) / F.h;
        if (nz / Math.sqrt(nx * nx + ny * ny + nz * nz + 1e-12) < -0.25 || z < F.zMin) u = x > F.cx ? 0.995 : 0.005;
        u = Math.min(0.995, Math.max(0.005, u)); v = Math.min(0.995, Math.max(0.005, v));
      } else {
        const s = M.density || 2;
        if (ax >= ay && ax >= az) { u = z * s; v = y * s; } else if (ay >= az) { u = x * s; v = z * s; } else { u = x * s; v = y * s; }
      }
      uv[n * 6 + k * 2] = u; uv[n * 6 + k * 2 + 1] = v;
      for (let j = 0; j < 4; j++) { si[n * 12 + k * 4 + j] = skinI[ids[k] * 4 + j]; sw[n * 12 + k * 4 + j] = skinW[ids[k] * 4 + j]; }
    }
  });
  if (cur !== null) geo.addGroup(start * 3, (nT - start) * 3, matIndex.get(cur));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, matList);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.userData.tris = nT;
  return mesh;
}
