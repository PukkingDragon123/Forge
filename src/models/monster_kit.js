// Monster sculpting kit: every creature is ONE continuous organic mesh.
//  1. Sculpt: signed-distance primitives (ellipsoids, round cones, rounded boxes, tori, extruded plates) combined with
//     smooth-min unions, smooth subtractions (eye sockets, mouths, gills) and paint regions (colour only).
//  2. Mesh: naive surface nets over a ~64–96 cell grid → flat-shaded faceted low-poly surface.
//  3. Texture: per-face palette colours + a triplanar pixel-art pattern atlas (fur, scales, cracks, facets, spots…)
//     sampled in bind-pose space so detail sticks to the skin while it animates; glow masks feed emissive (bloom).
//  4. Rig: THREE.Skeleton + SkinnedMesh, weights from distance to each bone's primitives (smooth falloff, top 4).
import * as THREE from 'three';
import { hash2, hash3, clamp, fbm2 } from '../core/math.js';

const TAU = Math.PI * 2;
export const ADD = 0, SUB = 1, PAINT = 2, BIND = 3;

// ============================================================================ smooth ops + noise
const smin = (a, b, k) => { if (k <= 0) return a < b ? a : b; const h = Math.max(k - Math.abs(a - b), 0) / k; return (a < b ? a : b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
// value noise from a precomputed 32³ lattice (hashing per sample is far too slow for field splats)
const NL = 32, NOISE = new Float32Array(NL * NL * NL);
for (let i = 0; i < NOISE.length; i++) NOISE[i] = hash3(i % NL, (i / NL) & (NL - 1), (i / (NL * NL)) | 0, 17);
function vnoise(x, y, z) {
  const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
  let fx = x - xf, fy = y - yf, fz = z - zf;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const x0 = xf & 31, y0 = (yf & 31) * NL, z0 = (zf & 31) * NL * NL, x1 = (xf + 1) & 31, y1 = ((yf + 1) & 31) * NL, z1 = ((zf + 1) & 31) * NL * NL;
  const a = NOISE[x0 + y0 + z0], b = NOISE[x1 + y0 + z0], c = NOISE[x0 + y1 + z0], d = NOISE[x1 + y1 + z0];
  const e = NOISE[x0 + y0 + z1], f = NOISE[x1 + y0 + z1], g = NOISE[x0 + y1 + z1], h = NOISE[x1 + y1 + z1];
  const p0 = a + (b - a) * fx, p1 = c + (d - c) * fx, p2 = e + (f - e) * fx, p3 = g + (h - g) * fx;
  const q0 = p0 + (p1 - p0) * fy, q1 = p2 + (p3 - p2) * fy;
  return q0 + (q1 - q0) * fz;
}

// ============================================================================ primitives (root-space SDF closures)
const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
function affine(M) { const e = M.elements; return [e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]]; }
function polyD(px, py, P) {
  let d = Infinity, s = 1;
  for (let i = 0, j = P.length - 1; i < P.length; j = i, i++) {
    const vix = P[i][0], viy = P[i][1], ex = P[j][0] - vix, ey = P[j][1] - viy, wx = px - vix, wy = py - viy;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= viy, c2 = py < P[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
function finish(sdf, corners) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of corners) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]); }
  return { sdf, lo, hi };
}
/** Oriented primitive. frame: Matrix4 (prim-local → root). Returns {sdf(x,y,z) root-space distance, lo, hi}. */
export function makePrim(kind, frame, q) {
  const ds = Math.cbrt(Math.abs(frame.determinant())) || 1;
  const [a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3] = affine(_m.copy(frame).invert());
  let sdf, bx0, bx1, by0, by1, bz0, bz1;
  if (kind === 'ell') {
    const [rx, ry, rz] = q.r;
    sdf = (x, y, z) => {
      const lx = a0 * x + a1 * y + a2 * z + a3, ly = b0 * x + b1 * y + b2 * z + b3, lz = c0 * x + c1 * y + c2 * z + c3;
      const qx = lx / rx, qy = ly / ry, qz = lz / rz;
      const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz), k1 = Math.sqrt((qx / rx) ** 2 + (qy / ry) ** 2 + (qz / rz) ** 2);
      return (k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz)) * ds;
    };
    [bx0, bx1, by0, by1, bz0, bz1] = [-rx, rx, -ry, ry, -rz, rz];
  } else if (kind === 'box') {
    const [hx, hy, hz] = q.h, r = Math.min(q.round, hx, hy, hz);
    sdf = (x, y, z) => {
      const lx = a0 * x + a1 * y + a2 * z + a3, ly = b0 * x + b1 * y + b2 * z + b3, lz = c0 * x + c1 * y + c2 * z + c3;
      const qx = Math.abs(lx) - hx + r, qy = Math.abs(ly) - hy + r, qz = Math.abs(lz) - hz + r;
      const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
      return (Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r) * ds;
    };
    [bx0, bx1, by0, by1, bz0, bz1] = [-hx, hx, -hy, hy, -hz, hz];
  } else if (kind === 'tor') {
    const R = q.R, r = q.r;
    sdf = (x, y, z) => {
      const lx = a0 * x + a1 * y + a2 * z + a3, ly = b0 * x + b1 * y + b2 * z + b3, lz = c0 * x + c1 * y + c2 * z + c3;
      const qx = Math.sqrt(lx * lx + lz * lz) - R;
      return (Math.sqrt(qx * qx + ly * ly) - r) * ds;
    };
    [bx0, bx1, by0, by1, bz0, bz1] = [-R - r, R + r, -r, r, -R - r, R + r];
  } else if (kind === 'plate') {
    // 2D polygon in local XY, extruded ±h along Z, rounded by r
    const P = q.poly, h = q.h, r = q.round;
    sdf = (x, y, z) => {
      const lx = a0 * x + a1 * y + a2 * z + a3, ly = b0 * x + b1 * y + b2 * z + b3, lz = c0 * x + c1 * y + c2 * z + c3;
      const wx = polyD(lx, ly, P) + r, wy = Math.abs(lz) - h;
      const mx = Math.max(wx, 0), my = Math.max(wy, 0);
      return (Math.min(Math.max(wx, wy), 0) + Math.sqrt(mx * mx + my * my) - r) * ds;
    };
    bx0 = Math.min(...P.map((p) => p[0])); bx1 = Math.max(...P.map((p) => p[0]));
    by0 = Math.min(...P.map((p) => p[1])); by1 = Math.max(...P.map((p) => p[1]));
    bz0 = -h - r; bz1 = h + r;
  } else if (kind === 'cry') {
    // hexagonal crystal shard along +Y from the origin, faceted pyramid tip
    const r = q.r, L = q.len, tl = q.tip ?? r * 1.8, KX = -0.866025404, KZ = 0.5, KK = 0.577350269;
    sdf = (x, y, z) => {
      const lx = a0 * x + a1 * y + a2 * z + a3, ly = b0 * x + b1 * y + b2 * z + b3, lz = c0 * x + c1 * y + c2 * z + c3;
      const rr = r * clamp((L - ly) / tl, 0, 1);
      let px = Math.abs(lx), pz = Math.abs(lz);
      const dd = 2 * Math.min(KX * px + KZ * pz, 0); px -= dd * KX; pz -= dd * KZ;
      px -= clamp(px, -KK * rr, KK * rr); pz -= rr;
      const dh = Math.hypot(px, pz) * Math.sign(pz);
      return Math.max(dh * 0.8, -ly, ly - L) * ds;
    };
    [bx0, bx1, by0, by1, bz0, bz1] = [-r, r, 0, L, -r, r];
  }
  const corners = [];
  for (const X of [bx0, bx1]) for (const Y of [by0, by1]) for (const Z of [bz0, bz1]) corners.push(_v.set(X, Y, Z).applyMatrix4(frame).toArray());
  return finish(sdf, corners);
}
/** Round cone between root-space points a, b with radii ra, rb (IQ). */
export function roundCone(a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const lo = [0, 1, 2].map((i) => Math.min(a[i] - ra, b[i] - rb)), hi = [0, 1, 2].map((i) => Math.max(a[i] + ra, b[i] + rb));
  if (l2 < 1e-10 || Math.abs(ra - rb) >= Math.sqrt(l2)) { const r = Math.max(ra, rb), c = ra >= rb ? a : b; return { sdf: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, lo, hi }; }
  const rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const sdf = (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
  };
  return { sdf, lo, hi };
}

// ============================================================================ pattern atlas (triplanar pixel-art tiles)
// Each 64×64 tile: R = shade position on the palette ramp, G = accent mask, B = glow mask.
export const TILE = { fur: 0, scale: 1, chitin: 2, stone: 3, metal: 4, rust: 5, bone: 6, cloth: 7, wood: 8, crystal: 9, membrane: 10, cap: 11, slime: 12, feather: 13, crust: 14, flesh: 15, wart: 16, smooth: 17, rune: 18, moss: 19, gill: 20, hide: 21, spots: 22, plate: 23, eye: 24, bark: 25, lava: 26, trim: 27 };
const TS = 64, ACOLS = 8, AROWS = 4;
let ATLAS = null;
function paintTiles() {
  const W = TS * ACOLS, H = TS * AROWS;
  const data = new Uint8Array(W * H * 4);
  const tile = (id, fn) => {
    const R = new Float32Array(TS * TS), G = new Float32Array(TS * TS), B = new Float32Array(TS * TS);
    const t = {
      R, G, B,
      i: (x, y) => (((y % TS) + TS) % TS) * TS + (((x % TS) + TS) % TS),
      set(x, y, r, g, b) { const i = this.i(Math.round(x), Math.round(y)); if (r != null) R[i] = r; if (g != null) G[i] = g; if (b != null) B[i] = b; },
      line(x0, y0, x1, y1, r, g, b) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let k = 0; k <= n; k++) this.set(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, r, g, b); },
      disc(cx, cy, rad, r, g, b) { for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) this.set(x, y, r, g, b); },
    };
    fn(t);
    const ox = (id % ACOLS) * TS, oy = Math.floor(id / ACOLS) * TS;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const i = y * TS + x, o = ((oy + y) * W + ox + x) * 4;
      data[o] = clamp(R[i]) * 255; data[o + 1] = clamp(G[i]) * 255; data[o + 2] = clamp(B[i]) * 255; data[o + 3] = 255;
    }
  };
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const q = (v, x, y, steps = 6) => { const s = clamp(v) * (steps - 1); const i = Math.floor(s); return Math.min(1, (i + ((s - i) * 16 > BAY[(x & 3) + (y & 3) * 4] + 0.5 ? 1 : 0)) / (steps - 1)); };
  const per = (x, y, f, s) => { // seamless fbm on the tile (blend of wrapped samples)
    const u = x / TS, v = y / TS;
    const a = fbm2(x * f, y * f, 3, s), b = fbm2((x - TS) * f, y * f, 3, s), c = fbm2(x * f, (y - TS) * f, 3, s), d = fbm2((x - TS) * f, (y - TS) * f, 3, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const vor = (x, y, n, seed) => { // wrapped voronoi: [d1, d2, cell id]
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let k = 0; k < n; k++) {
      const px = hash2(k, 1, seed) * TS, py = hash2(k, 2, seed) * TS;
      for (const ox of [-TS, 0, TS]) for (const oy of [-TS, 0, TS]) {
        const d = Math.hypot(x - px - ox, y - py - oy);
        if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
      }
    }
    return [d1, d2, id];
  };
  const fill = (t, fn) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const r = fn(x, y); const i = y * TS + x; t.R[i] = r[0]; t.G[i] = r[1] || 0; t.B[i] = r[2] || 0; } };

  tile(TILE.fur, (t) => {
    // fur: soft clumps (light top, dark root) with directional strands
    fill(t, (x, y) => { const c = per(x, y, 0.16, 1), ly = (y + Math.floor(hash2(x >> 2, 0, 2) * 6)) % 6; return [q(0.4 + (c - 0.5) * 0.3 + (ly < 2 ? 0.08 : ly > 4 ? -0.08 : 0), x, y)]; });
    for (let i = 0; i < 220; i++) {
      const x = hash2(i, 1, 3) * TS, y = hash2(i, 2, 3) * TS, L = 3 + ((hash2(i, 3, 3) * 3) | 0), dk = hash2(i, 4, 3) > 0.55;
      for (let k = 0; k < L; k++) t.set(x + (k >= L - 1 ? 1 : 0), y + k, dk ? 0.24 : 0.6);
      if (!dk) t.set(x, y - 1, 0.74);
    }
  });
  tile(TILE.scale, (t) => fill(t, (x, y) => {
    const row = Math.floor(y / 7), ox = row % 2 ? 5 : 0, lx = ((x + ox) % 10) - 5, ly = y % 7;
    const d = Math.hypot(lx * 0.8, ly - 0.5);
    if (d > 4.6) return [0.14];
    const hl = ly < 2 && lx < 0 ? 0.25 : 0;
    return [q(0.68 - ly * 0.055 + hl + (hash2(((x + ox) / 10) | 0, row, 4) - 0.5) * 0.15, x, y), 0, ly > 4 ? 0.6 : 0];
  }));
  tile(TILE.chitin, (t) => fill(t, (x, y) => {
    const ly = y % 32, wob = Math.round(Math.sin(x * 0.2) * 1.5);
    const lyw = (ly + wob + 32) % 32;
    if (lyw === 0) return [0.1];
    if (lyw === 1) return [0.62, 1];
    const sheen = Math.exp(-(((lyw - 8) / 3.5) ** 2)) * 0.3 + Math.exp(-((((x % 64) - 20) / 6) ** 2)) * 0.06;
    const growth = (lyw % 6 === 0 && hash2(x >> 2, y, 5) > 0.4) ? -0.08 : 0;
    return [q(0.36 + sheen - lyw * 0.004 + growth + (hash2(x >> 1, y >> 1, 5) > 0.95 ? 0.12 : 0), x, y)];
  }));
  tile(TILE.stone, (t) => fill(t, (x, y) => {
    const [d1, d2, id] = vor(x, y, 11, 6);
    const edge = d2 - d1;
    if (edge < 1.2) return [0.08, 0, 1];
    if (edge < 2.4) return [0.28, 0, 0.4];
    return [q(0.42 + hash2(id, 3, 6) * 0.22 + (per(x, y, 0.2, 7) - 0.5) * 0.25 + (edge < 3.6 && (x + y) % 2 ? 0.12 : 0), x, y)];
  }));
  tile(TILE.metal, (t) => {
    fill(t, (x, y) => {
      const lx = x % 32, ly = y % 32;
      if (lx === 0 || ly === 0) return [0.1];
      if (lx === 1 || ly === 1) return [0.72];
      const riv = [[5, 5], [27, 27]].some(([a, b]) => (lx - a) ** 2 + (ly - b) ** 2 < 3.5);
      if (riv) return [lx < 16 ? 0.72 : 0.5, 0.6];
      return [q(0.45 + (per(x, y, 0.1, 8) - 0.5) * 0.3 - ly * 0.004, x, y)];
    });
    for (let i = 0; i < 14; i++) { const x = hash2(i, 1, 9) * TS, y = hash2(i, 2, 9) * TS; t.line(x, y, x + 4 + hash2(i, 3, 9) * 6, y + hash2(i, 4, 9) * 3, 0.78); }
  });
  tile(TILE.rust, (t) => fill(t, (x, y) => {
    const lx = x % 32, ly = y % 32;
    const r = per(x, y, 0.09, 10);
    if (lx === 0 || ly === 0) return [0.1, r > 0.5 ? 1 : 0];
    const riv = [[5, 5], [27, 5], [5, 27], [27, 27]].some(([a, b]) => (lx - a) ** 2 + (ly - b) ** 2 < 4);
    if (riv) return [0.82, 0];
    return [q(0.4 + (r - 0.5) * 0.5 + (hash2(x, y, 11) > 0.9 ? -0.15 : 0), x, y), r > 0.55 ? 1 : r > 0.5 && (x + y) % 2 ? 1 : 0];
  }));
  tile(TILE.bone, (t) => {
    fill(t, (x, y) => [q(0.6 + Math.sin(y * 0.35 + per(x, y, 0.1, 12) * 4) * 0.06 + (per(x, y, 0.15, 13) - 0.5) * 0.2, x, y)]);
    for (let i = 0; i < 26; i++) t.set(hash2(i, 1, 14) * TS, hash2(i, 2, 14) * TS, 0.22);
    for (let i = 0; i < 4; i++) { let x = hash2(i, 3, 14) * TS, y = hash2(i, 4, 14) * TS; for (let k = 0; k < 9; k++) { t.set(x, y, 0.25); x += hash2(i, k, 15) > 0.5 ? 1 : 0; y += 1; } }
  });
  tile(TILE.cloth, (t) => fill(t, (x, y) => {
    const fold = Math.sin((x / TS) * TAU * 3 + Math.sin((y / TS) * TAU) * 0.6) * 0.16;
    const weave = (x + y) % 2 === 0 ? 0.04 : -0.03;
    const wear = per(x, y, 0.08, 16);
    return [q(0.45 + fold + weave + (wear - 0.5) * 0.14, x, y), wear > 0.66 ? 1 : 0];
  }));
  // embroidered trim: two bordered motif rows (accent) with glowing stitches — painted onto hems/edges
  tile(TILE.trim, (t) => fill(t, (x, y) => {
    const ly = y % 16, weave = (x + y) % 2 === 0 ? 0.05 : 0;
    if (ly === 0 || ly === 15) return [0.15, 1];
    if (ly === 1 || ly === 14) return [0.75, 1];
    const lx = (x + (Math.floor(y / 16) % 2) * 4) % 8, d = Math.abs(lx - 4) + Math.abs(ly - 7.5);
    if (d < 1.5) return [0.9, 1, 1];
    if (d < 3.5) return [0.55 + weave, 1, d < 2.5 ? 0.6 : 0];
    return [q(0.38 + weave, x, y)];
  }));
  tile(TILE.wood, (t) => fill(t, (x, y) => {
    const px = x % 16;
    if (px === 0) return [0.08];
    const knot = Math.hypot(((x + 8) % 32) - 8, ((y + 20) % 64) - 20);
    const g = Math.sin(x * 0.9 + Math.sin(y * 0.12) * 2.2 + (knot < 6 ? knot * 1.4 : 0)) * 0.12;
    return [q(0.45 + g + (px === 1 ? 0.15 : 0) + (hash2(x, y >> 2, 17) - 0.5) * 0.08, x, y)];
  }));
  tile(TILE.crystal, (t) => fill(t, (x, y) => {
    const b = (x + y * 0.6 + 64) % 13;
    if (b < 1) return [0.98, 0, 1];
    const b2 = (x * 0.7 - y + 128) % 17;
    if (b2 < 1) return [0.85, 0, 1];
    return [q(0.5 + (b / 13) * 0.3 + (b2 > 12 ? -0.18 : 0), x, y), 0, 0.7];
  }));
  tile(TILE.membrane, (t) => {
    fill(t, (x, y) => [q(0.5 + Math.sin(y * 0.1) * 0.06 + (per(x, y, 0.08, 18) - 0.5) * 0.18, x, y)]);
    for (let i = 0; i < 5; i++) {
      let x = hash2(i, 1, 19) * TS, y = 0;
      for (let k = 0; k < 64; k++) { t.set(x, y, 0.2, 1); t.set(x + 1, y, 0.62); x += Math.sin(k * 0.3 + i) * 0.7; y += 1; if (k % 16 === 8) { let bx = x, by = y; for (let j = 0; j < 9; j++) { t.set(bx, by, 0.24, 1); bx += 1; by += 0.6; } } }
    }
    for (let i = 0; i < 9; i++) t.disc(hash2(i, 5, 20) * TS, hash2(i, 6, 20) * TS, 1.3, 0.9, 0, 1);
  });
  tile(TILE.cap, (t) => {
    fill(t, (x, y) => [q(0.5 + (per(x, y, 0.1, 21) - 0.5) * 0.3 + ((x * 7) % 11 === 0 ? -0.12 : 0), x, y)]);
    for (let i = 0; i < 9; i++) { const cx = hash2(i, 1, 22) * TS, cy = hash2(i, 2, 22) * TS, r = 2.5 + hash2(i, 3, 22) * 4; t.disc(cx, cy, r + 1, 0.2, 0, 0); t.disc(cx, cy, r, 0.62, 1, 1); t.disc(cx - r * 0.35, cy - r * 0.35, r * 0.4, 0.9, 1, 1); }
  });
  tile(TILE.slime, (t) => {
    fill(t, (x, y) => [q(0.5 + (per(x, y, 0.07, 23) - 0.5) * 0.25, x, y)]);
    for (let i = 0; i < 12; i++) { const cx = hash2(i, 1, 24) * TS, cy = hash2(i, 2, 24) * TS, r = 1.5 + hash2(i, 3, 24) * 3; for (let a = 0; a < 20; a++) t.set(cx + Math.cos((a / 20) * TAU) * r, cy + Math.sin((a / 20) * TAU) * r, a < 7 ? 0.95 : 0.4); }
    for (let i = 0; i < 6; i++) t.disc(hash2(i, 4, 24) * TS, hash2(i, 5, 24) * TS, 2, 0.3, 1);
  });
  tile(TILE.feather, (t) => fill(t, (x, y) => {
    const row = Math.floor(y / 6), ox = row % 2 ? 4 : 0, lx = (x + ox) % 8, ly = y % 6;
    if (ly === 5 || (lx === 0 && ly > 1)) return [0.16];
    if (lx === 4 && ly < 4) return [0.7];
    return [q(0.38 + ly * 0.07 + (hash2((x + ox) >> 3, row, 25) - 0.5) * 0.2, x, y), row % 5 === 2 && lx > 1 ? 1 : 0];
  }));
  tile(TILE.crust, (t) => fill(t, (x, y) => {
    const [d1, d2, id] = vor(x, y, 22, 26);
    const e = d2 - d1, hot = per(x, y, 0.06, 46) > 0.47;
    if (e < 1.1) return hot ? [0.95, 0, 1] : [0.12, 0, 0.15];
    if (e < 2.0) return hot ? [0.55, 0, 0.45] : [0.22];
    return [q(0.2 + hash2(id, 1, 26) * 0.22 + (e > 4 ? 0.1 : 0) + (hash2(x, y, 27) > 0.92 ? 0.12 : 0), x, y)];
  }));
  tile(TILE.flesh, (t) => {
    fill(t, (x, y) => [q(0.42 + (per(x, y, 0.12, 28) - 0.5) * 0.45, x, y)]);
    for (let i = 0; i < 18; i++) { const x = hash2(i, 1, 29) * TS, y = hash2(i, 2, 29) * TS; t.line(x, y, x + 3, y + 1, 0.92); }
    for (let i = 0; i < 5; i++) { let x = hash2(i, 3, 29) * TS, y = hash2(i, 4, 29) * TS; for (let k = 0; k < 14; k++) { t.set(x, y, 0.2, 1); x += 1; y += Math.sin(k + i) > 0 ? 1 : 0; } }
  });
  tile(TILE.wart, (t) => {
    fill(t, (x, y) => { const s = per(x, y, 0.09, 30); return [q(0.45 + (per(x, y, 0.2, 31) - 0.5) * 0.2, x, y), s > 0.64 ? 1 : 0]; });
    for (let i = 0; i < 22; i++) { const cx = hash2(i, 1, 32) * TS, cy = hash2(i, 2, 32) * TS, r = 1 + hash2(i, 3, 32) * 2.2; t.disc(cx, cy + 1, r, 0.15); t.disc(cx, cy, r, 0.7); t.set(cx - r * 0.4, cy - r * 0.4, 0.95); }
  });
  tile(TILE.smooth, (t) => fill(t, (x, y) => [q(0.5 + (per(x, y, 0.1, 33) - 0.5) * 0.16, x, y)]));
  tile(TILE.rune, (t) => {
    fill(t, (x, y) => { const lx = x % 32, ly = y % 32; if (lx === 0 || ly === 0) return [0.12]; return [q(0.44 + (per(x, y, 0.15, 34) - 0.5) * 0.25, x, y)]; });
    const glyphs = [[[0, 0, 0, 8], [0, 0, 5, 3], [0, 8, 5, 5]], [[0, 4, 6, 4], [3, 0, 3, 8], [0, 0, 6, 8]], [[0, 0, 6, 0], [3, 0, 3, 8], [0, 8, 6, 8]], [[0, 8, 3, 0], [3, 0, 6, 8], [1, 5, 5, 5]]];
    for (let g = 0; g < 4; g++) { const ox = 12 + (g % 2) * 32, oy = 12 + Math.floor(g / 2) * 32; for (const [a, b, c, d] of glyphs[g]) t.line(ox + a, oy + b, ox + c, oy + d, 0.9, 1, 1); }
  });
  tile(TILE.moss, (t) => fill(t, (x, y) => { const n = per(x, y, 0.18, 35), m = hash2(x, y, 36); return [q(0.35 + n * 0.5 + (m > 0.9 ? 0.2 : m < 0.08 ? -0.2 : 0), x, y), n > 0.6 ? 1 : 0]; }));
  tile(TILE.gill, (t) => fill(t, (x, y) => [x % 3 === 0 ? 0.15 : x % 3 === 1 ? q(0.58 + Math.sin(y * 0.2) * 0.08, x, y) : 0.42]));
  tile(TILE.hide, (t) => fill(t, (x, y) => { const n = per(x, y, 0.1, 37); const r = Math.abs(Math.sin(n * 18)); return [q(r < 0.18 ? 0.22 : 0.45 + n * 0.25, x, y)]; }));
  tile(TILE.spots, (t) => {
    fill(t, (x, y) => [q(0.45 + (per(x, y, 0.12, 38) - 0.5) * 0.3, x, y)]);
    for (let i = 0; i < 10; i++) { const cx = hash2(i, 1, 39) * TS, cy = hash2(i, 2, 39) * TS, r = 2 + hash2(i, 3, 39) * 3.5; t.disc(cx, cy, r + 0.8, 0.2, 1); t.disc(cx, cy, r, 0.45, 1); }
  });
  tile(TILE.plate, (t) => fill(t, (x, y) => {
    const ly = y % 16, row = Math.floor(y / 16), lx = (x + (row % 2) * 12) % 24;
    if (ly === 0 || lx === 0) return [0.1, 0, 1];
    if (ly === 1 || lx === 1) return [0.78];
    return [q(0.5 - ly * 0.02 + (hash2(((x + (row % 2) * 12) / 24) | 0, row, 40) - 0.5) * 0.2, x, y), ly > 12 ? 1 : 0];
  }));
  tile(TILE.eye, (t) => fill(t, (x, y) => [(x + y) % 23 === 0 ? 0.95 : 0.12 + hash2(x, y, 41) * 0.05]));
  tile(TILE.bark, (t) => fill(t, (x, y) => {
    const v = Math.sin(x * 0.55 + per(x, y, 0.06, 42) * 7);
    if (v > 0.85) return [0.12];
    return [q(0.42 + v * 0.14 + (hash2(x, y >> 2, 43) - 0.5) * 0.1, x, y), per(x, y, 0.15, 44) > 0.62 ? 1 : 0];
  }));
  tile(TILE.lava, (t) => fill(t, (x, y) => { const n = per(x, y, 0.09, 45) + Math.sin(x * 0.2 + y * 0.1) * 0.08; return [q(n * 1.2 - 0.05, x, y), 0, 1]; }));

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace; tex.flipY = false;
  tex.needsUpdate = true; tex.userData.keep = true;
  return tex;
}
export function atlas() { return ATLAS || (ATLAS = paintTiles()); }

// ============================================================================ material (Lambert + skinning + triplanar palette)
export function sculptMaterial() {
  const u = { uAtlas: { value: atlas() }, uTexScale: { value: 2 }, uGlowMul: { value: 1 }, uLayer: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aBase; attribute vec3 aAcc; attribute vec3 aGlow; attribute vec3 aGlow2; attribute vec4 aTile;
uniform float uLayer;
flat varying vec3 vBase; flat varying vec3 vAcc; flat varying vec3 vGlow; flat varying vec3 vGlow2; flat varying vec4 vTile; flat varying vec3 vRestN; varying vec3 vRest;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vBase = aBase; vAcc = aAcc; vGlow = aGlow * 4.0; vGlow2 = aGlow2 * uLayer * 4.0; vTile = vec4(aTile.x, aTile.y / 40.0, aTile.z / 255.0, aTile.w / 255.0 - 0.5); vRest = position; vRestN = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uAtlas; uniform float uTexScale; uniform float uGlowMul;
flat varying vec3 vBase; flat varying vec3 vAcc; flat varying vec3 vGlow; flat varying vec3 vGlow2; flat varying vec4 vTile; flat varying vec3 vRestN; varying vec3 vRest;
vec3 rampC(vec3 c, float s) {
  vec3 dk = c * vec3(0.30, 0.27, 0.40) + vec3(0.012, 0.004, 0.03);
  vec3 lt = min(c * 1.45 + vec3(0.09, 0.07, 0.02), vec3(1.0));
  return s < 0.5 ? mix(dk, c, s * 2.0) : mix(c, lt, (s - 0.5) * 2.0);
}
vec4 sculptTex() {
  vec3 an = abs(vRestN);
  vec2 tuv = (an.x > an.y && an.x > an.z) ? vRest.zy : ((an.y > an.z) ? vRest.xz : vRest.xy);
  tuv *= uTexScale * vTile.y;
  vec2 c = (floor(fract(tuv) * ${TS}.0) + 0.5) / ${TS}.0;
  vec2 o = vec2(mod(vTile.x, ${ACOLS}.0), floor(vTile.x / ${ACOLS}.0));
  return texture2D(uAtlas, (o + c) / vec2(${ACOLS}.0, ${AROWS}.0));
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec4 sTex = sculptTex();
float sS = clamp(sTex.r + vTile.w, 0.0, 1.0);
vec3 sAlb = mix(rampC(vBase, sS), rampC(vAcc, sS), sTex.g);
diffuseColor.rgb *= sAlb;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += (vGlow * (vTile.z > 0.5 ? (0.55 + 0.6 * sTex.r) : sTex.b) + vGlow2 * (0.6 + 0.5 * sTex.r)) * uGlowMul;`);
  };
  mat.customProgramCacheKey = () => 'forglite-sculpt-v3';
  return mat;
}

// ============================================================================ sculpt → skinned geometry
const _c = new THREE.Color();
const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };

/** Collects primitives (already in root space) + palette materials, and meshes them into one skinned geometry. */
export class Sculpt {
  constructor() { this.prims = []; this.mats = []; }
  /** palette material: tile name, base hex, o: { acc, glow, gk (glow intensity), full (fully emissive), ts (texture scale), j (shade bias) } */
  mat(tile, base, o = {}) {
    this.mats.push({ tile: typeof tile === 'number' ? tile : TILE[tile], base: lin(base), acc: lin(o.acc || base), glow: o.glow ? lin(o.glow).map((v) => v * (o.gk ?? 2.2)) : [0, 0, 0], full: !!o.full, ts: o.ts || 1, j: o.j ?? 0 });
    return this.mats.length - 1;
  }
  push(prim, op, k, mat, bone, o = {}) {
    Object.assign(prim, { op, k, mat, bone, noise: o.noise || 0, nf: o.nf || 8, layer: o.layer || null });
    this.prims.push(prim);
    return prim;
  }
  /**
   * Mesh the sculpt. o: res (cells along the longest axis), bones (count), fall (weight falloff, m).
   * Returns indexed BufferGeometry: position, normal, aBase/aAcc (u8 palette), aGlow/aGlow2 (u8, ×4 in shader),
   * aTile (u8: tile, scale×40, full, jitter), skinIndex/skinWeight (u8). Palette varyings are `flat`, so each face
   * takes its provoking (last) vertex's colour — triangles are rotated so that vertex holds the majority material.
   */
  mesh(o = {}) {
    const TT = [performance.now()];
    const P = this.prims.filter((p) => p.op !== BIND), binds = this.prims.filter((p) => p.op === BIND);
    const adds = P.filter((p) => p.op === ADD);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of adds) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.lo[i] - p.k - p.noise); hi[i] = Math.max(hi[i], p.hi[i] + p.k + p.noise); }
    const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    const cell = ext / (o.res || 64);
    const f0 = cell * 2;
    for (let i = 0; i < 3; i++) { lo[i] -= cell * 2; hi[i] += cell * 2; }
    const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1, ny = Math.ceil((hi[1] - lo[1]) / cell) + 1, nz = Math.ceil((hi[2] - lo[2]) / cell) + 1;
    const sxy = nx * ny, NC = sxy * nz;
    const F = pool('F', Float32Array, NC); F.fill(f0, 0, NC);
    for (const p of [...P, ...binds]) {
      const m = (p.op === ADD ? f0 + p.k : p.k + cell * 2) + p.noise;
      p.elo = [p.lo[0] - m, p.lo[1] - m, p.lo[2] - m]; p.ehi = [p.hi[0] + m, p.hi[1] + m, p.hi[2] + m];
    }
    const dist = (p, x, y, z) => { const d = p.sdf(x, y, z); return p.noise ? d + (vnoise(x * p.nf, y * p.nf, z * p.nf) - 0.5) * 2 * p.noise : d; };
    // ---- splat each primitive into the field (authoring order)
    for (const p of P) {
      if (p.op === PAINT) continue;
      const i0 = Math.max(0, Math.floor((p.elo[0] - lo[0]) / cell)), i1 = Math.min(nx - 1, Math.ceil((p.ehi[0] - lo[0]) / cell));
      const j0 = Math.max(0, Math.floor((p.elo[1] - lo[1]) / cell)), j1 = Math.min(ny - 1, Math.ceil((p.ehi[1] - lo[1]) / cell));
      const k0 = Math.max(0, Math.floor((p.elo[2] - lo[2]) / cell)), k1 = Math.min(nz - 1, Math.ceil((p.ehi[2] - lo[2]) / cell));
      const add = p.op === ADD, kk = p.k, sdf = p.sdf, na = p.noise * 2, nf = p.nf;
      for (let k = k0; k <= k1; k++) {
        const z = lo[2] + k * cell;
        for (let j = j0; j <= j1; j++) {
          const y = lo[1] + j * cell;
          let idx = k * sxy + j * nx + i0;
          for (let i = i0; i <= i1; i++, idx++) {
            const x = lo[0] + i * cell;
            let d = sdf(x, y, z);
            if (na) d += (vnoise(x * nf, y * nf, z * nf) - 0.5) * na;
            const f = F[idx];
            if (add) { if (d < f + kk) F[idx] = smin(f, d, kk); }
            else if (-d > f - kk) { const v = smax(f, -d, kk); F[idx] = v < f0 ? v : f0; }
          }
        }
      }
    }
    TT.push(performance.now());
    // ---- surface nets: one vertex per sign-changing cell (sign bytes keep the scan cheap)
    const SG = pool('SG', Uint8Array, NC);
    for (let i = 0; i < NC; i++) SG[i] = F[i] < 0 ? 1 : 0;
    const cid = pool('cid', Int32Array, NC); cid.fill(-1, 0, NC);
    let VX = pool('VX', Float32Array, 30000), ACT = pool('ACT', Int32Array, 10000), nv = 0;
    const off = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
    const cxo = [0, 1, 0, 1, 0, 1, 0, 1], cyo = [0, 0, 1, 1, 0, 0, 1, 1], czo = [0, 0, 0, 0, 1, 1, 1, 1];
    const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
    const cv = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) {
      let base = k * sxy + j * nx;
      for (let i = 0; i < nx - 1; i++, base++) {
        const n8 = SG[base] + SG[base + 1] + SG[base + nx] + SG[base + nx + 1] + SG[base + sxy] + SG[base + sxy + 1] + SG[base + sxy + nx] + SG[base + sxy + nx + 1];
        if (n8 === 0 || n8 === 8) continue;
        for (let c = 0; c < 8; c++) cv[c] = F[base + off[c]];
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const ea = EA[e], eb = EB[e], va = cv[ea], vb = cv[eb];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += cxo[ea] + (cxo[eb] - cxo[ea]) * t; sy += cyo[ea] + (cyo[eb] - cyo[ea]) * t; sz += czo[ea] + (czo[eb] - czo[ea]) * t; n++;
        }
        if (nv * 3 + 3 > VX.length) VX = grow('VX', VX);
        if (nv + 1 > ACT.length) ACT = grow('ACT', ACT);
        cid[base] = nv; ACT[nv] = base;
        VX[nv * 3] = lo[0] + (i + sx / n) * cell; VX[nv * 3 + 1] = lo[1] + (j + sy / n) * cell; VX[nv * 3 + 2] = lo[2] + (k + sz / n) * cell;
        nv++;
      }
    }
    // ---- quads across sign-changing grid edges (every such edge starts at an active cell's min corner)
    let Q = pool('Q', Int32Array, 40000), nq = 0;
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (nq + 4 > Q.length) Q = grow('Q', Q);
      if (flip) { Q[nq] = a; Q[nq + 1] = d; Q[nq + 2] = c; Q[nq + 3] = b; } else { Q[nq] = a; Q[nq + 1] = b; Q[nq + 2] = c; Q[nq + 3] = d; }
      nq += 4;
    };
    for (let q = 0; q < nv; q++) {
      const p = ACT[q], inside = SG[p];
      if (inside !== SG[p + 1]) quad(cid[p - nx - sxy], cid[p - sxy], cid[p], cid[p - nx], !inside);
      if (inside !== SG[p + nx]) quad(cid[p - 1 - sxy], cid[p - 1], cid[p], cid[p - sxy], !inside);
      if (inside !== SG[p + sxy]) quad(cid[p - 1 - nx], cid[p - nx], cid[p], cid[p - 1], !inside);
    }
    TT.push(performance.now());
    // ---- per vertex: palette owner + skin weights (distance to each bone's primitives, bind volumes)
    const nV = nv, nB = o.bones || 1;
    const fall = o.fall || cell * 3.5;
    const SI = new Uint8Array(nV * 4), SW = new Uint8Array(nV * 4);
    const bd = new Float32Array(nB);
    const near = (p, x, y, z) => x >= p.elo[0] && x <= p.ehi[0] && y >= p.elo[1] && y <= p.ehi[1] && z >= p.elo[2] && z <= p.ehi[2];
    const subs = P.filter((p) => p.op === SUB && p.mat != null), paints = P.filter((p) => p.op === PAINT);
    // coarse spatial bins → per-vertex primitive lists (authoring order preserved)
    const BN = 10, bsx = (hi[0] - lo[0]) / BN, bsy = (hi[1] - lo[1]) / BN, bsz = (hi[2] - lo[2]) / BN;
    const binOf = (x, y, z) => Math.min(BN - 1, Math.max(0, ((x - lo[0]) / bsx) | 0)) + Math.min(BN - 1, Math.max(0, ((y - lo[1]) / bsy) | 0)) * BN + Math.min(BN - 1, Math.max(0, ((z - lo[2]) / bsz) | 0)) * BN * BN;
    const binLists = (list) => {
      const B = Array.from({ length: BN * BN * BN }, () => []);
      for (const p of list) {
        const i0 = Math.max(0, Math.floor((p.elo[0] - lo[0]) / bsx)), i1 = Math.min(BN - 1, Math.floor((p.ehi[0] - lo[0]) / bsx));
        const j0 = Math.max(0, Math.floor((p.elo[1] - lo[1]) / bsy)), j1 = Math.min(BN - 1, Math.floor((p.ehi[1] - lo[1]) / bsy));
        const k0 = Math.max(0, Math.floor((p.elo[2] - lo[2]) / bsz)), k1 = Math.min(BN - 1, Math.floor((p.ehi[2] - lo[2]) / bsz));
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) B[i + j * BN + k * BN * BN].push(p);
      }
      return B;
    };
    const bAdds = binLists(adds), bSubs = binLists(subs), bPaints = binLists(paints), bBinds = binLists(binds);
    const VM = new Int16Array(nV), VL = new Int16Array(nV).fill(-1);
    const pairs = [];
    const solo = new Uint8Array(nB);
    for (const b of o.solo || []) solo[b] = 1;
    const anySolo = (o.solo || []).length > 0;
    for (let v = 0; v < nV; v++) {
      const x = VX[v * 3], y = VX[v * 3 + 1], z = VX[v * 3 + 2];
      bd.fill(1e9);
      let dmin = 1e9, best = 1e9, mat = 0;
      const bi = binOf(x, y, z);
      for (const p of bAdds[bi]) {
        if (!near(p, x, y, z)) continue;
        const dr = dist(p, x, y, z), d = dr > 0 ? dr : 0, ad = dr < 0 ? -dr : dr;
        if (ad < best) { best = ad; mat = p.mat; }
        if (d < bd[p.bone]) bd[p.bone] = d;
        if (d < dmin) dmin = d;
      }
      for (const p of bSubs[bi]) { if (!near(p, x, y, z)) continue; const dr = dist(p, x, y, z), ad = dr < 0 ? -dr : dr; if (ad < best) { best = ad; mat = p.mat; } }
      for (const p of bPaints[bi]) if (near(p, x, y, z) && dist(p, x, y, z) < 0) { if (p.layer) VL[v] = p.mat; else mat = p.mat; }
      VM[v] = mat;
      pairs.length = 0;
      // solo bones (parts that can be hidden) never claim vertices that sit on another bone's surface
      let dns = 1e9;
      if (anySolo) for (let b = 0; b < nB; b++) if (!solo[b] && bd[b] < dns) dns = bd[b];
      const blockSolo = anySolo && dns <= cell * 1.6, ref = blockSolo ? dns : dmin;
      for (let b = 0; b < nB; b++) { if (blockSolo && solo[b]) continue; const w = 1 - (bd[b] - ref) / fall; if (w > 0) pairs.push([b, w * w]); }
      for (const p of bBinds[bi]) {
        if (!near(p, x, y, z)) continue;
        const wb = clamp(0.5 - dist(p, x, y, z) / fall, 0, 1);
        if (wb <= 0) continue;
        let tot = 0;
        for (const q of pairs) tot += q[1];
        for (const q of pairs) q[1] = (tot > 0 ? q[1] / tot : 0) * (1 - wb);
        const own = pairs.find((q) => q[0] === p.bone);
        if (own) own[1] += wb; else pairs.push([p.bone, wb]);
      }
      if (pairs.length > 1) pairs.sort((a, b) => b[1] - a[1]);
      let sum = 0;
      const nk = Math.min(4, pairs.length);
      for (let s = 0; s < nk; s++) sum += pairs[s][1];
      if (!nk || sum <= 0) { SW[v * 4] = 255; continue; }
      let acc = 0;
      for (let s = 0; s < nk; s++) {
        const q = s === nk - 1 ? 255 - acc : Math.round((pairs[s][1] / sum) * 255);
        SI[v * 4 + s] = pairs[s][0]; SW[v * 4 + s] = q; acc += q;
      }
    }
    TT.push(performance.now());
    // ---- triangles (shorter diagonal), provoking vertex = majority material; smooth normals for triplanar axes
    const nT = (nq / 4) * 2;
    const idx = nV < 65536 ? new Uint16Array(nT * 3) : new Uint32Array(nT * 3);
    const nor = new Float32Array(nV * 3);
    let t3 = 0;
    const tri = (a, b, c) => {
      const ux = VX[b * 3] - VX[a * 3], uy = VX[b * 3 + 1] - VX[a * 3 + 1], uz = VX[b * 3 + 2] - VX[a * 3 + 2];
      const vx = VX[c * 3] - VX[a * 3], vy = VX[c * 3 + 1] - VX[a * 3 + 1], vz = VX[c * 3 + 2] - VX[a * 3 + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { nor[q * 3] += fx; nor[q * 3 + 1] += fy; nor[q * 3 + 2] += fz; }
      const ma = VM[a], mb = VM[b], mc = VM[c];
      const maj = ma === mb || ma === mc ? ma : mb === mc ? mb : mc;
      if (mc === maj) { idx[t3] = a; idx[t3 + 1] = b; idx[t3 + 2] = c; }
      else if (ma === maj) { idx[t3] = b; idx[t3 + 1] = c; idx[t3 + 2] = a; }
      else { idx[t3] = c; idx[t3 + 1] = a; idx[t3 + 2] = b; }
      t3 += 3;
    };
    for (let f = 0; f < nq; f += 4) {
      const a = Q[f], b = Q[f + 1], c = Q[f + 2], d = Q[f + 3];
      const dac = (VX[a * 3] - VX[c * 3]) ** 2 + (VX[a * 3 + 1] - VX[c * 3 + 1]) ** 2 + (VX[a * 3 + 2] - VX[c * 3 + 2]) ** 2;
      const dbd = (VX[b * 3] - VX[d * 3]) ** 2 + (VX[b * 3 + 1] - VX[d * 3 + 1]) ** 2 + (VX[b * 3 + 2] - VX[d * 3 + 2]) ** 2;
      if (dac <= dbd) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
    }
    // ---- packed per-vertex palette
    const M = this.mats;
    const aBase = new Uint8Array(nV * 3), aAcc = new Uint8Array(nV * 3), aGlow = new Uint8Array(nV * 3), aGlow2 = new Uint8Array(nV * 3), aTile = new Uint8Array(nV * 4);
    const pos = new Float32Array(nV * 3);
    const u8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
    for (let v = 0; v < nV; v++) {
      const mm = M[VM[v]], lm = VL[v] >= 0 ? M[VL[v]] : null;
      const x = VX[v * 3], y = VX[v * 3 + 1], z = VX[v * 3 + 2];
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      const nl = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1;
      nor[v * 3] /= nl; nor[v * 3 + 1] /= nl; nor[v * 3 + 2] /= nl;
      for (let q = 0; q < 3; q++) { aBase[v * 3 + q] = u8(mm.base[q]); aAcc[v * 3 + q] = u8(mm.acc[q]); aGlow[v * 3 + q] = u8(mm.glow[q] / 4); aGlow2[v * 3 + q] = lm ? u8(lm.glow[q] / 4) : 0; }
      const jit = (hash3(Math.round(x * 300), Math.round(y * 300), Math.round(z * 300), 5) - 0.5) * 0.08 + mm.j;
      aTile[v * 4] = mm.tile; aTile[v * 4 + 1] = Math.min(255, Math.round(mm.ts * 40)); aTile[v * 4 + 2] = mm.full ? 255 : 0; aTile[v * 4 + 3] = u8(jit + 0.5);
    }
    TT.push(performance.now());
    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aBase', new THREE.BufferAttribute(aBase, 3, true));
    g.setAttribute('aAcc', new THREE.BufferAttribute(aAcc, 3, true));
    g.setAttribute('aGlow', new THREE.BufferAttribute(aGlow, 3, true));
    g.setAttribute('aGlow2', new THREE.BufferAttribute(aGlow2, 3, true));
    g.setAttribute('aTile', new THREE.BufferAttribute(aTile, 4));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4, true));
    g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.stats = { grid: [nx, ny, nz], tris: nT, verts: nV, cell, t: TT.slice(1).map((t, i) => Math.round(t - TT[i])) };
    return g;
  }
}
// scratch buffers reused across meshing jobs (avoids GC churn when the whole roster is built)
const POOL = {};
function pool(name, Ctor, n) { let a = POOL[name]; if (!a || a.length < n) a = POOL[name] = new Ctor(Math.ceil(n * 1.25)); return a; }
function grow(name, a) { const b = new a.constructor(a.length * 2); b.set(a); POOL[name] = b; return b; }

// ============================================================================ authoring helpers
/** Points along a bowed path from a to b (bend = offset at the middle). */
export function arc(a, b, bend = [0, 0, 0], n = 5) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(t * Math.PI);
    pts.push([a[0] + (b[0] - a[0]) * t + bend[0] * s, a[1] + (b[1] - a[1]) * t + bend[1] * s, a[2] + (b[2] - a[2]) * t + bend[2] * s]);
  }
  return pts;
}
/** Curling horn path from base along dir, curling toward `up` by `curl` radians over its length. */
export function hornPath(base, dir, up, len, curl, n = 6) {
  const d = new THREE.Vector3(...dir).normalize(), u = new THREE.Vector3(...up).normalize();
  const axis = new THREE.Vector3().crossVectors(d, u).normalize();
  const pts = [base.slice()];
  const p = new THREE.Vector3(...base), step = len / n;
  for (let i = 0; i < n; i++) { d.applyAxisAngle(axis, curl / n); p.addScaledVector(d, step); pts.push(p.toArray()); }
  return pts;
}
export { hash2, hash3, clamp };
