// Voxel sculpting for small precious things (ores, gems, monster parts, icons): compose signed distance
// fields in "design units" (an object is ~28 units across), each part carrying its own colour function,
// then bake to a VoxelGrid at any resolution. Facet-aware primitives (polytopes, crystal prisms, cut
// gems) hand their facet normal to the painter so faces read as hard, hand-shaded planes.
import { VoxelGrid, GLOW, NOAO } from '../gfx/voxel.js';
import { hueRamp } from '../art/weapon_art.js';
import { hash3, noise3, hexToRgb } from '../core/math.js';

export { GLOW, NOAO };

// ------------------------------------------------------------------ vectors
export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Orthonormal basis whose first axis is `dir`. */
export function basis(dir, up = [0, 1, 0]) {
  const u = norm(dir);
  const a = Math.abs(dot(u, norm(up))) > 0.95 ? [1, 0, 0] : up;
  const v = norm(cross(a, u));
  return [u, v, cross(u, v)];
}
/** Rotation helpers (radians) → basis rows. */
export function rotB(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz·Ry·Rx (columns are the local axes in model space); rows of the inverse = local axes
  const m = [
    [cy * cz, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [cy * sz, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
  return [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
}
const loc = (x, y, z, c, B) => {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  return B ? [px * B[0][0] + py * B[0][1] + pz * B[0][2], px * B[1][0] + py * B[1][1] + pz * B[1][2], px * B[2][0] + py * B[2][1] + pz * B[2][2]] : [px, py, pz];
};
const toWorld = (v, B) => (B ? [v[0] * B[0][0] + v[1] * B[1][0] + v[2] * B[2][0], v[0] * B[0][1] + v[1] * B[1][1] + v[2] * B[2][1], v[0] * B[0][2] + v[1] * B[1][2] + v[2] * B[2][2]] : v);

// ------------------------------------------------------------------ light + palette
// Model-space key light and view as the sprite camera sees them (upper left, slightly in front).
export const VIEW = norm([0.5, 0.45, 0.74]);
let LT = norm([-0.3, 0.85, 0.45]);
let HV = norm(add3(LT, VIEW));
export const light = () => LT;
let VU = 1;
/** Size of one voxel in design units for the bake in progress (for 1-voxel rims and seams). */
export const vu = () => VU;
export function setLight(v) { LT = norm(v); HV = norm(add3(LT, VIEW)); }
export const lit = (n) => dot(n, LT);
export const spec = (n, p = 24) => Math.pow(Math.max(0, dot(n, HV)), p);

const PK = new Map();
/** Packed 0xRRGGBB for a hex colour. */
export function C(hex) {
  let v = PK.get(hex);
  if (v === undefined) { const [r, g, b] = hexToRgb(hex); v = ((r << 16) | (g << 8) | b) >>> 0 || 0x010101; PK.set(hex, v); }
  return v;
}
export const glow = (c) => ((typeof c === 'string' ? C(c) : c) | GLOW) >>> 0;
export const noao = (c) => ((typeof c === 'string' ? C(c) : c) | NOAO) >>> 0;
export function mixC(a, b, t) {
  a = typeof a === 'string' ? C(a) : a & 0xffffff; b = typeof b === 'string' ? C(b) : b & 0xffffff;
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return ((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)) >>> 0 || 0x010101;
}
const RAMPS = new Map();
/** n-tone hue-shifted ramp (cool shadows, warm lights, tinted specular) as packed ints. */
export function ramp(hex, n = 7, sat = 1.15) {
  const k = hex + n + sat;
  let r = RAMPS.get(k);
  if (!r) { r = hueRamp(hex, n, { sat }).map(C); RAMPS.set(k, r); }
  return r;
}
/** Pick a ramp tone from a light term: t in [-1, 1] → index lo..hi, with a little dither. */
export function tone(R, t, lo = 0, hi = R.length - 2, h = 0.5, dither = 0.18) {
  const u = clamp01(t * 0.5 + 0.5 + (h - 0.5) * dither);
  return R[Math.min(hi, lo + Math.floor(u * (hi - lo + 1)))];
}
/** Polished-metal look: sky above bright, horizon band dark, ground bounce warm, with a hot spec. */
export function metal(R, n, h = 0.5, o = {}) {
  const s = spec(n, o.p ?? 30);
  if (s > (o.st ?? 0.55)) return R[R.length - 1];
  // chrome-style banding: bright sky, a dark horizon line, warm ground bounce underneath
  const t = lit(n) * 0.75 + n[1] * 0.35 + (h - 0.5) * 0.12;
  const band = t > 0.62 ? 5 : t > 0.35 ? 4 : t > 0.08 ? 3 : t > -0.14 ? 1 : 2;
  return R[Math.max(0, Math.min(R.length - 2, band + (o.bias || 0)))];
}

// ------------------------------------------------------------------ primitives (distance in design units)
const bbOf = (c, r) => [c[0] - r[0], c[1] - r[1], c[2] - r[2], c[0] + r[0], c[1] + r[1], c[2] + r[2]];
const BB = (f, bb) => { f.bb = bb; return f; };
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

export const sphere = (c, r) => BB((x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, bbOf(c, [r, r, r]));
export function ell(c, r, B = null) {
  const m = Math.max(r[0], r[1], r[2]);
  return BB((x, y, z) => {
    const q = loc(x, y, z, c, B);
    const px = q[0] / r[0], py = q[1] / r[1], pz = q[2] / r[2];
    const k0 = Math.hypot(px, py, pz), k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
  }, B ? bbOf(c, [m, m, m]) : bbOf(c, r));
}
/** Rounded box: half extents h, rounding r, optional basis B. */
export function box(c, h, r = 0, B = null) {
  const m = Math.hypot(h[0], h[1], h[2]);
  return BB((x, y, z) => {
    const q = loc(x, y, z, c, B);
    const dx = Math.abs(q[0]) - h[0] + r, dy = Math.abs(q[1]) - h[1] + r, dz = Math.abs(q[2]) - h[2] + r;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - r;
  }, B ? bbOf(c, [m, m, m]) : bbOf(c, h));
}
/** Tapered capsule a→b with radii ra→rb. */
export function cap(a, b, ra, rb = ra) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = dot(ab, ab) || 1e-6, rm = Math.max(ra, rb);
  return BB((x, y, z) => {
    const ap = [x - a[0], y - a[1], z - a[2]];
    const t = clamp01(dot(ap, ab) / L2);
    return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) - (ra + (rb - ra) * t);
  }, [Math.min(a[0], b[0]) - rm, Math.min(a[1], b[1]) - rm, Math.min(a[2], b[2]) - rm, Math.max(a[0], b[0]) + rm, Math.max(a[1], b[1]) + rm, Math.max(a[2], b[2]) + rm]);
}
/** Capped cylinder centred at c along axis (unit), radius r, half length h, edge rounding e. */
export function cyl(c, axis, r, h, e = 0) {
  const B = basis(axis), m = Math.hypot(r, h);
  return BB((x, y, z) => {
    const q = loc(x, y, z, c, B);
    const dr = Math.hypot(q[1], q[2]) - r + e, dh = Math.abs(q[0]) - h + e;
    return Math.min(Math.max(dr, dh), 0) + Math.hypot(Math.max(dr, 0), Math.max(dh, 0)) - e;
  }, bbOf(c, [m, m, m]));
}
/** Torus around `axis` through c. */
export function torus(c, axis, R, r) {
  const B = basis(axis), m = R + r;
  return BB((x, y, z) => { const q = loc(x, y, z, c, B); return Math.hypot(Math.hypot(q[1], q[2]) - R, q[0]) - r; }, bbOf(c, [m, m, m]));
}
/** Union of tapered capsules along a polyline (horns, fangs, tails, filaments). */
export function tube(pts, radii) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push(cap(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  const f = (x, y, z) => { let d = 1e9; for (const s of segs) { if (bbDist(s.bb, x, y, z) > d) continue; const v = s(x, y, z); if (v < d) d = v; } return d; };
  f.segs = segs;
  /** param along the tube 0..1 at the nearest segment */
  f.param = (x, y, z) => {
    let d = 1e9, best = 0;
    segs.forEach((s, i) => { const v = s(x, y, z); if (v < d) { d = v; best = i; } });
    const a = pts[best], b = pts[best + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    return (best + clamp01(dot([x - a[0], y - a[1], z - a[2]], ab) / (dot(ab, ab) || 1))) / segs.length;
  };
  return BB(f, merge(segs.map((s) => s.bb)));
}
/** Sample a curve fn(t)→[x,y,z] into points. */
export const curve = (fn, n = 12) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));

/**
 * Convex polytope: planes [{n:[x,y,z], o}] in local unit space, scaled by s=[sx,sy,sz], rotated by B, at c.
 * f.facet(x,y,z) → { i, n (model-space normal), i2/n2 (next-nearest face), gap (distance to it = edge proximity) }.
 */
export function poly(c, planes, s = [1, 1, 1], B = null, amp = 0, freq = 0.3, seed = 0) {
  const P = planes.map((p) => ({ n: norm(p.n), o: p.o }));
  const sm = Math.min(s[0], s[1], s[2]);
  const W = P.map((p) => norm(toWorld([p.n[0] / s[0], p.n[1] / s[1], p.n[2] / s[2]], B)));
  let rmax = 0; for (const p of P) rmax = Math.max(rmax, p.o);
  const m = Math.max(s[0], s[1], s[2]) * rmax * 1.8 + amp;
  const f = (x, y, z) => {
    const q = loc(x, y, z, c, B);
    const qx = q[0] / s[0], qy = q[1] / s[1], qz = q[2] / s[2];
    let d = -1e9;
    for (let i = 0; i < P.length; i++) { const v = P[i].n[0] * qx + P[i].n[1] * qy + P[i].n[2] * qz - P[i].o; if (v > d) d = v; }
    d *= sm;
    return amp ? d + (noise3(x * freq + 31, y * freq, z * freq, seed) - 0.5) * 2 * amp : d;
  };
  f.facet = (x, y, z) => {
    const q = loc(x, y, z, c, B);
    const qx = q[0] / s[0], qy = q[1] / s[1], qz = q[2] / s[2];
    let a = -1e9, b = -1e9, ia = 0, ib = 0;
    for (let i = 0; i < P.length; i++) { const v = P[i].n[0] * qx + P[i].n[1] * qy + P[i].n[2] * qz - P[i].o; if (v > a) { b = a; ib = ia; a = v; ia = i; } else if (v > b) { b = v; ib = i; } }
    return { i: ia, i2: ib, n: W[ia], n2: W[ib], gap: (a - b) * sm, q };
  };
  return BB(f, bbOf(c, [m, m, m]));
}
/** Random faceted boulder planes. */
export function rockPlanes(n, rnd, rough = 0.12, flatBase = 0.62) {
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), a = i * ga + rnd() * 0.9;
    out.push({ n: [Math.cos(a) * r + (rnd() - 0.5) * 0.3, y + (rnd() - 0.5) * 0.3, Math.sin(a) * r + (rnd() - 0.5) * 0.3], o: 1 - rnd() * rough });
  }
  if (flatBase) out.push({ n: [0, -1, 0], o: flatBase });
  return out;
}
/** Crystal prism planes: `sides` faces of radius 1 around +Y, length L (in radius units), pointed tip. */
export function prismPlanes(sides = 6, L = 3, tip = 0.9, rot = 0, base = true) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const n = [Math.cos(a), 0, Math.sin(a)];
    out.push({ n, o: 1 });
    // pyramid face: normal tilted toward +Y; passes through apex (0, L, 0)
    const t = norm([n[0], tip, n[2]]);
    out.push({ n: t, o: t[1] * L });
  }
  if (base) out.push({ n: [0, -1, 0], o: 0 });
  return out;
}
/** Cut-gem planes around +Y: table, crown, girdle, pavilion (unit radius). */
export function gemPlanes(sides = 8, o = {}) {
  const out = [{ n: [0, 1, 0], o: o.table ?? 0.42 }];
  const crown = o.crown ?? 0.9, pav = o.pav ?? 1.15, rot = o.rot ?? 0;
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2, a2 = a + Math.PI / sides;
    const n = [Math.cos(a), 0, Math.sin(a)], n2 = [Math.cos(a2), 0, Math.sin(a2)];
    out.push({ n, o: 1 }); // girdle
    const c1 = norm([n[0], crown, n[2]]); out.push({ n: c1, o: c1[0] * n[0] + c1[2] * n[2] + 0.08 * c1[1] });
    const c2 = norm([n2[0], crown * 1.8, n2[2]]); out.push({ n: c2, o: (c2[0] * n2[0] + c2[2] * n2[2]) * 0.93 + 0.2 * c2[1] });
    const p1 = norm([n[0], -pav, n[2]]); out.push({ n: p1, o: p1[0] * n[0] + p1[2] * n[2] - 0.06 * p1[1] });
    const p2 = norm([n2[0], -pav * 0.8, n2[2]]); out.push({ n: p2, o: (p2[0] * n2[0] + p2[2] * n2[2]) * 0.97 });
  }
  return out;
}
/** Extrude a 2D distance fn(u, v) along local Z by half thickness t (rounded by e), placed with basis B. */
export function slab(c, B, sdf2, t, e = 0, R = 30) {
  return BB((x, y, z) => {
    const q = loc(x, y, z, c, B);
    const d2 = sdf2(q[0], q[1]) + e, dz = Math.abs(q[2]) - t + e;
    return Math.min(Math.max(d2, dz), 0) + Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) - e;
  }, bbOf(c, [R, R, R]));
}
// 2D distance helpers for slabs
export const d2circle = (cx, cy, r) => (u, v) => Math.hypot(u - cx, v - cy) - r;
export function d2poly(pts) {
  return (u, v) => {
    let d = 1e9, s = 1;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j], [bx, by] = pts[i];
      const ex = bx - ax, ey = by - ay, wx = u - ax, wy = v - ay;
      const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey || 1));
      d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
      if ((ay > v) !== (by > v) && u < ((bx - ax) * (v - ay)) / (by - ay || 1e-9) + ax) s = -s;
    }
    return s * d;
  };
}
export const d2seg = (ax, ay, bx, by, r) => (u, v) => {
  const ex = bx - ax, ey = by - ay, t = clamp01(((u - ax) * ex + (v - ay) * ey) / (ex * ex + ey * ey || 1));
  return Math.hypot(u - ax - ex * t, v - ay - ey * t) - r;
};
export const d2union = (...fs) => (u, v) => { let d = 1e9; for (const f of fs) d = Math.min(d, f(u, v)); return d; };
export const d2sub = (a, ...bs) => (u, v) => { let d = a(u, v); for (const b of bs) d = Math.max(d, -b(u, v)); return d; };
/** Displace a field with value noise. */
export const noisy = (f, amp, freq, seed = 0) => BB((x, y, z) => f(x, y, z) + (noise3(x * freq + 7, y * freq, z * freq, seed) - 0.5) * 2 * amp, pad(f.bb, amp));
export const inter = (a, b) => BB((x, y, z) => Math.max(a(x, y, z), b(x, y, z)), a.bb);
export const minus = (a, b) => BB((x, y, z) => Math.max(a(x, y, z), -b(x, y, z)), a.bb);
export const halfspace = (n, o) => { n = norm(n); return BB((x, y, z) => n[0] * x + n[1] * y + n[2] * z - o, [-1e4, -1e4, -1e4, 1e4, 1e4, 1e4]); };

function merge(bbs) { return bbs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])]); }
function pad(bb, p) { return [bb[0] - p, bb[1] - p, bb[2] - p, bb[3] + p, bb[4] + p, bb[5] + p]; }
function bbDist(b, x, y, z) { return Math.hypot(Math.max(b[0] - x, 0, x - b[3]), Math.max(b[1] - y, 0, y - b[4]), Math.max(b[2] - z, 0, z - b[5])); }

// ------------------------------------------------------------------ sculpt + bake
/**
 * A sculpt is a list of solid parts (field + painter) and cuts (subtracted fields, optionally painting
 * the faces they expose). Painters get (x, y, z, n, h): design-space point, surface normal, voxel hash.
 */
export class Sculpt {
  constructor() { this.parts = []; this.cuts = []; this.tops = []; this.own = -1; this.cutOwn = -1; }
  /** o: { k: smooth-union radius with earlier parts, top: unaffected by cuts (a gem in a hollow setting) } */
  add(f, paint, o = {}) { (o.top ? this.tops : this.parts).push({ f, paint: typeof paint === 'function' ? paint : () => paint, k: o.k || 0, bb: o.k ? pad(f.bb, o.k) : f.bb }); return this; }
  cut(f, paint = null) { this.cuts.push({ f, paint: paint && (typeof paint === 'function' ? paint : () => paint), bb: f.bb }); return this; }
  field(x, y, z) {
    let d = 1e9, o = -1;
    for (let i = 0; i < this.parts.length; i++) {
      const P = this.parts[i];
      if (bbDist(P.bb, x, y, z) > d + P.k) continue;
      const v = P.f(x, y, z);
      if (P.k && d < 1e8) { if (v < d) o = i; d = smin(d, v, P.k); } else if (v < d) { d = v; o = i; }
    }
    this.own = o; this.cutOwn = -1;
    if (d <= 2) for (let j = 0; j < this.cuts.length; j++) {
      const K = this.cuts[j];
      if (bbDist(K.bb, x, y, z) > Math.max(0, -d) + 0.6) continue;
      const v = -K.f(x, y, z);
      if (v > d) { d = v; this.cutOwn = j; }
    }
    for (let i = 0; i < this.tops.length; i++) {
      const P = this.tops[i];
      if (bbDist(P.bb, x, y, z) > d) continue;
      const v = P.f(x, y, z);
      if (v < d) { d = v; this.own = this.parts.length + i; this.cutOwn = -1; }
    }
    return d;
  }
  bounds() { return pad(merge([...this.parts, ...this.tops].map((p) => p.bb)), 0.5); }
  /**
   * Bake at `k` voxels per design unit. Returns a VoxelGrid (with .k, .origin = design-space min corner).
   * o.dilate: grow by a fraction of a voxel so hairline features survive low resolutions.
   */
  bake(k, o = {}) {
    let bb = this.bounds();
    // tighten the bounds to the actual solid (parts' boxes are generous)
    const th = (o.dilate ?? 0.3) / k;
    const nx0 = Math.ceil((bb[3] - bb[0]) * k), ny0 = Math.ceil((bb[4] - bb[1]) * k), nz0 = Math.ceil((bb[5] - bb[2]) * k);
    const occ = new Int16Array(nx0 * ny0 * nz0).fill(-32768);
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1, mxy = -1, mxz = -1;
    const mark = (x, y, z, w) => {
      occ[x + nx0 * (y + ny0 * z)] = w;
      if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
      if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
    };
    const ownerHere = () => (this.cutOwn >= 0 && this.cuts[this.cutOwn].paint ? -2 - this.cutOwn : this.own);
    // coarse blocks first: the fields are distance bounds, so a block whose centre is farther than its
    // half-diagonal from the surface is all air (or all solid)
    const BS = 4, rB = (BS * 0.5 * Math.sqrt(3)) / k;
    for (let bz = 0; bz < nz0; bz += BS) for (let by = 0; by < ny0; by += BS) for (let bx = 0; bx < nx0; bx += BS) {
      const ex = Math.min(nx0, bx + BS), ey = Math.min(ny0, by + BS), ez = Math.min(nz0, bz + BS);
      const dc = this.field(bb[0] + (bx + ex) * 0.5 / k, bb[1] + (by + ey) * 0.5 / k, bb[2] + (bz + ez) * 0.5 / k);
      if (dc > rB + th) continue;
      if (dc < -rB - 0.5) { const w = ownerHere(); for (let z = bz; z < ez; z++) for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) mark(x, y, z, w); continue; }
      for (let z = bz; z < ez; z++) {
        const pz = bb[2] + (z + 0.5) / k;
        for (let y = by; y < ey; y++) {
          const py = bb[1] + (y + 0.5) / k;
          for (let x = bx; x < ex; x++) {
            if (this.field(bb[0] + (x + 0.5) / k, py, pz) <= th) mark(x, y, z, ownerHere());
          }
        }
      }
    }
    if (mxx < 0) { const g = new VoxelGrid(1, 1, 1); g.set(0, 0, 0, 0x808080); g.k = k; g.origin = [0, 0, 0]; return g; }
    const nx = mxx - mnx + 1, ny = mxy - mny + 1, nz = mxz - mnz + 1;
    const g = new VoxelGrid(nx, ny, nz);
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= nx0 || y >= ny0 || z >= nz0 ? -32768 : occ[x + nx0 * (y + ny0 * z)]);
    const e = 0.5 / k, seed = o.seed || 0;
    VU = 1 / k;
    for (let z = mnz; z <= mxz; z++) for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) {
      const w = at(x, y, z);
      if (w === -32768) continue;
      const surf = at(x + 1, y, z) === -32768 || at(x - 1, y, z) === -32768 || at(x, y + 1, z) === -32768 || at(x, y - 1, z) === -32768 || at(x, y, z + 1) === -32768 || at(x, y, z - 1) === -32768;
      if (!surf) { g.set(x - mnx, y - mny, z - mnz, 0x302830); continue; }
      const px = bb[0] + (x + 0.5) / k, py = bb[1] + (y + 0.5) / k, pz = bb[2] + (z + 0.5) / k;
      const n = norm([this.field(px + e, py, pz) - this.field(px - e, py, pz), this.field(px, py + e, pz) - this.field(px, py - e, pz), this.field(px, py, pz + e) - this.field(px, py, pz - e)]);
      const h = hash3(x, y, z, seed);
      const P = w <= -2 ? this.cuts[-2 - w] : w >= this.parts.length ? this.tops[w - this.parts.length] : this.parts[w];
      let col = P.paint(px, py, pz, n, h);
      if (col == null || col === 0) col = 0x302830;
      g.set(x - mnx, y - mny, z - mnz, typeof col === 'string' ? C(col) : col);
    }
    g.k = k;
    g.origin = [bb[0] + mnx / k, bb[1] + mny / k, bb[2] + mnz / k];
    return g;
  }
}

/** Small seeded RNG. */
export function rng(seed) {
  let s = (typeof seed === 'string' ? [...seed].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261) : seed) >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0) / 4294967296;
}
