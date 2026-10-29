// Fine-voxel toolkit for the stage environments: a sparse chunked voxel world (0.05 m voxels),
// painting primitives, and a greedy mesher with ambient occlusion and *baked* lighting
// (warm lamp pools, a soft key, lavender/indigo ambient, ordered-dither light bands).
// Environments are unlit at runtime (MeshBasic with baked vertex colours) so hundreds of thousands
// of faces stay cheap; actors get matching real-time lights from the stage.
import * as THREE from 'three';
import { hash3, hexToRgb } from '../core/math.js';

export const S = 0.04;            // voxel size in world units (matches characters & monsters)
export const GLOW = 1 << 24;      // emissive voxel: unlit, separate bloom mesh
export const NOAO = 1 << 25;      // skip AO darkening (thin things: rope, glass)
const CS = 32, CM = 31;           // chunk size (voxels)

// ------------------------------------------------------------------ colours
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const colCache = new Map();
/** '#rrggbb' → packed 0xRRGGBB (never 0). */
export function C(hex) {
  let v = colCache.get(hex);
  if (v === undefined) { const [r, g, b] = hexToRgb(hex); v = ((r << 16) | (g << 8) | b) >>> 0 || 0x010101; colCache.set(hex, v); }
  return v;
}
export const glowC = (hex) => (C(hex) | GLOW) >>> 0;
export const mixC = (a, b, t) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (((r | 0) << 16) | ((g | 0) << 8) | (bl | 0)) >>> 0 || 0x010101;
};
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (a, b) => B4[(a & 3) + ((b & 3) << 2)] / 16;
/** Pick from a palette (array of packed colours, dark→light) at v∈[0,1] with ordered dither. */
export function ramp(pal, v, a, b) {
  const t = Math.max(0, Math.min(0.9999, v)) * (pal.length - 1);
  const i = Math.floor(t);
  // dither only in a narrow band around each palette step: flat colour regions with crisp seams
  return t - i > 0.5 + (bayer(a, b) - 0.5) * 0.4 ? pal[Math.min(i + 1, pal.length - 1)] : pal[i];
}
export const P = (arr) => arr.map(C);
const toneCache = new Map();
/** Flat (undithered) pick at v∈[0,1] with half-steps mixed between palette entries: big calm colour areas. */
export function tone(pal, v) {
  let t = toneCache.get(pal);
  if (!t) { t = []; for (let i = 0; i < pal.length; i++) { t.push(pal[i]); if (i < pal.length - 1) t.push(mixC(pal[i], pal[i + 1], 0.5)); } toneCache.set(pal, t); }
  return t[Math.max(0, Math.min(t.length - 1, Math.round(v * (t.length - 1))))];
}

// ------------------------------------------------------------------ the world
export class VWorld {
  /** clip (voxel ints, optional): only cells inside are written (segment building). */
  constructor(clip = null) { this.chunks = new Map(); this.clip = clip; }
  static key(cx, cy, cz) { return ((cx + 2048) * 4096 + (cy + 2048)) * 4096 + (cz + 2048); }
  set(x, y, z, c) {
    const cl = this.clip;
    if (cl && (x < cl.x0 || x >= cl.x1 || y < cl.y0 || y >= cl.y1 || z < cl.z0 || z >= cl.z1)) return;
    const k = VWorld.key(x >> 5, y >> 5, z >> 5);
    let ch = this.chunks.get(k);
    if (!ch) { if (!c) return; ch = new Uint32Array(CS * CS * CS); this.chunks.set(k, ch); }
    ch[(x & CM) | ((y & CM) << 5) | ((z & CM) << 10)] = c;
  }
  get(x, y, z) {
    const ch = this.chunks.get(VWorld.key(x >> 5, y >> 5, z >> 5));
    return ch ? ch[(x & CM) | ((y & CM) << 5) | ((z & CM) << 10)] : 0;
  }
  /** Range [a0,a1) on an axis intersected with the clip box. */
  rx(a0, a1) { const c = this.clip; return c ? [Math.max(a0, c.x0), Math.min(a1, c.x1)] : [a0, a1]; }
  ry(a0, a1) { const c = this.clip; return c ? [Math.max(a0, c.y0), Math.min(a1, c.y1)] : [a0, a1]; }
  rz(a0, a1) { const c = this.clip; return c ? [Math.max(a0, c.z0), Math.min(a1, c.z1)] : [a0, a1]; }
}
export const vx = (u) => Math.round(u / S);

// ------------------------------------------------------------------ primitives (voxel ints)
const put = (w, x, y, z, col, d) => {
  const c = typeof col === 'function' ? col(x, y, z, d) : col;
  if (c === undefined || c === null) return;
  w.set(x, y, z, c);
};
export function box(w, x0, y0, z0, x1, y1, z1, col) {
  const [xa, xb] = w.rx(Math.floor(x0), Math.ceil(x1)), [ya, yb] = w.ry(Math.floor(y0), Math.ceil(y1)), [za, zb] = w.rz(Math.floor(z0), Math.ceil(z1));
  for (let z = za; z < zb; z++) for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) put(w, x, y, z, col);
}
export function ell(w, cx, cy, cz, rx, ry, rz, col) {
  const [xa, xb] = w.rx(Math.floor(cx - rx), Math.ceil(cx + rx) + 1), [ya, yb] = w.ry(Math.floor(cy - ry), Math.ceil(cy + ry) + 1), [za, zb] = w.rz(Math.floor(cz - rz), Math.ceil(cz + rz) + 1);
  for (let z = za; z < zb; z++) for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d <= 1) put(w, x, y, z, col, d);
  }
}
/** Vertical cylinder (r may taper r0→r1). */
export function cyl(w, cx, cz, y0, y1, r0, r1 = r0, col) {
  const R = Math.max(r0, r1);
  const [xa, xb] = w.rx(Math.floor(cx - R), Math.ceil(cx + R) + 1), [ya, yb] = w.ry(Math.floor(y0), Math.ceil(y1)), [za, zb] = w.rz(Math.floor(cz - R), Math.ceil(cz + R) + 1);
  for (let y = ya; y < yb; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1), r = r0 + (r1 - r0) * t;
    for (let z = za; z < zb; z++) for (let x = xa; x < xb; x++) { const dx = x + 0.5 - cx, dz = z + 0.5 - cz, d = (dx * dx + dz * dz) / (r * r); if (d <= 1) put(w, x, y, z, col, d); }
  }
}
/** Horizontal cylinder along x. */
export function cylX(w, x0, x1, cy, cz, r, col) {
  const [xa, xb] = w.rx(Math.floor(x0), Math.ceil(x1)), [ya, yb] = w.ry(Math.floor(cy - r), Math.ceil(cy + r) + 1), [za, zb] = w.rz(Math.floor(cz - r), Math.ceil(cz + r) + 1);
  for (let z = za; z < zb; z++) for (let y = ya; y < yb; y++) { const dy = y + 0.5 - cy, dz = z + 0.5 - cz, d = (dy * dy + dz * dz) / (r * r); if (d > 1) continue; for (let x = xa; x < xb; x++) put(w, x, y, z, col, d); }
}
/** Horizontal cylinder along z. */
export function cylZ(w, cx, cy, z0, z1, r, col) {
  const [xa, xb] = w.rx(Math.floor(cx - r), Math.ceil(cx + r) + 1), [ya, yb] = w.ry(Math.floor(cy - r), Math.ceil(cy + r) + 1), [za, zb] = w.rz(Math.floor(z0), Math.ceil(z1));
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = (dx * dx + dy * dy) / (r * r); if (d > 1) continue; for (let z = za; z < zb; z++) put(w, x, y, z, col, d); }
}
/** Thick segment between two points (radius r, voxel units). */
export function seg(w, ax, ay, az, bx, by, bz, r, col) {
  const L = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(1, Math.ceil(L / Math.max(0.5, r * 0.7)));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (r <= 0.6) put(w, Math.floor(x), Math.floor(y), Math.floor(z), typeof col === 'function' ? (px, py, pz) => col(px, py, pz, t) : col);
    else ell(w, x, y, z, r, r, r, typeof col === 'function' ? (px, py, pz, d) => col(px, py, pz, t, d) : col);
  }
}
/** Rope/cable hanging between two points (catenary-ish sag in voxels). */
export function sag(w, ax, ay, az, bx, by, bz, droop, col, r = 0.5) {
  const L = Math.hypot(bx - ax, by - ay, bz - az), n = Math.max(2, Math.ceil(L));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t - Math.sin(t * Math.PI) * droop, z = az + (bz - az) * t;
    if (r <= 0.6) w.set(Math.floor(x), Math.floor(y), Math.floor(z), typeof col === 'function' ? col(i) : col);
    else ell(w, x, y, z, r, r, r, typeof col === 'function' ? col(i) : col);
  }
}

// ------------------------------------------------------------------ 3×5 pixel glyphs for signs
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  '!': '010010010000010', '?': '110001010000010', '-': '000000111000000', '.': '000000000000010', '$': '011110010011110', '+': '000010111010000', '>': '100010001010100', '<': '001010100010001', '*': '101010101000000', ' ': '000000000000000',
};
/** Write text into a vertical plane facing +z, top-left at (x, y), 1 voxel per pixel. Returns width. */
export function text(w, x, y, z, str, col) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') w.set(cx + c, y - r, z, col);
    cx += 4;
  }
  return cx - x - 1;
}
export const textWidth = (str) => str.length * 4 - 1;

// ------------------------------------------------------------------ meshing with baked light
// face dirs: axis a, sign s; u/v axes are the next two (right-handed so u×v = +a)
const DIRS = [];
for (let a = 0; a < 3; a++) for (const s of [1, -1]) DIRS.push({ a, s, u: (a + 1) % 3, v: (a + 2) % 3 });
const AO_CURVE = [0.48, 0.66, 0.83, 1.0];
const FACE_TINT = { '0,1': 0.9, '0,-1': 0.9, '1,1': 1.0, '1,-1': 0.62, '2,1': 0.95, '2,-1': 0.78 };

/**
 * Lighting rig for baking. lamps: [{x,y,z (world), c:'#hex', r, i}], amb/sky/key colours as '#hex'.
 * keyDir points *toward* the light.
 */
export function makeLightRig(o) {
  const lin = (h, k = 1) => { const [r, g, b] = hexToRgb(h); return [LIN[r] * k, LIN[g] * k, LIN[b] * k]; };
  const kd = o.keyDir || [-0.45, 0.8, 0.55], kl = Math.hypot(...kd);
  return {
    amb: lin(o.amb || '#4a4070', o.ambI ?? 1),
    sky: lin(o.sky || '#8a90c0', o.skyI ?? 0.35),
    key: lin(o.key || '#ffe0c0', o.keyI ?? 0.55),
    keyDir: kd.map((v) => v / kl),
    lamps: (o.lamps || []).map((l) => ({ x: l.x, y: l.y, z: l.z, r: l.r, i: l.i ?? 1, c: lin(l.c) })),
    bands: o.bands ?? 14,
    dither: o.dither ?? 0,
    gamma: o.gamma ?? 1,
  };
}

/** Light arriving at world point p on a face with normal n → linear rgb multiplier. */
function lightAt(R, lamps, px, py, pz, nx, ny, nz, out) {
  let r = R.amb[0], g = R.amb[1], b = R.amb[2];
  if (ny > 0) { r += R.sky[0] * ny; g += R.sky[1] * ny; b += R.sky[2] * ny; }
  const kd = Math.max(0, nx * R.keyDir[0] + ny * R.keyDir[1] + nz * R.keyDir[2]);
  r += R.key[0] * kd; g += R.key[1] * kd; b += R.key[2] * kd;
  for (const l of lamps) {
    const dx = l.x - px, dy = l.y - py, dz = l.z - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= l.r * l.r) continue;
    const d = Math.sqrt(d2) || 1e-3;
    const fall = 1 - d / l.r;
    const lam = 0.3 + 0.7 * Math.max(0, (dx * nx + dy * ny + dz * nz) / d);
    const k = fall * fall * lam * l.i;
    r += l.c[0] * k; g += l.c[1] * k; b += l.c[2] * k;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

/**
 * Mesh a world (or the cells inside bounds, voxel ints) into { solid, glow } BufferGeometries.
 * opts: bounds, room (array of voxel boxes; faces whose outside cell leaves them all are culled), light (makeLightRig), skip: Set of 'a,s' face dirs never seen (default back faces '2,-1'),
 * bottomAbove: only emit downward faces for voxels above this voxel y (ceilings, overhangs).
 */
export function meshWorld(w, opts = {}) {
  const R = opts.light || makeLightRig({});
  const SC = opts.scale || S; // world size of one voxel (coarse far shells use 2·S)
  const skip = opts.skip || new Set(['2,-1']);
  const bottomAbove = opts.bottomAbove ?? -1e9;
  const bnd = opts.bounds || null;
  const room = opts.room || null; // voxel boxes (union): faces looking out of them (outer shells) are never seen
  const out = { solid: new QuadBuf(), glow: new QuadBuf() };
  const L = [0, 0, 0];
  const N2 = CS * CS;
  const kCol = new Float64Array(N2), kAo = new Int16Array(N2), kGlow = new Uint8Array(N2);
  const cR = new Float32Array(N2), cG = new Float32Array(N2), cB = new Float32Array(N2);
  const bands = R.bands;
  for (const [k, ch] of w.chunks) {
    const cz = (k % 4096) - 2048, cy = (Math.floor(k / 4096) % 4096) - 2048, cx = Math.floor(k / 16777216) - 2048;
    const ox = cx * CS, oy = cy * CS, oz = cz * CS;
    if (bnd && (ox + CS <= bnd.x0 || ox >= bnd.x1 || oy + CS <= bnd.y0 || oy >= bnd.y1 || oz + CS <= bnd.z0 || oz >= bnd.z1)) continue;
    const mx = (ox + 16) * SC, my = (oy + 16) * SC, mz = (oz + 16) * SC, half = 16 * SC * 1.75;
    const lamps = R.lamps.filter((l) => Math.hypot(l.x - mx, l.y - my, l.z - mz) < l.r + half);
    // neighbour fetch: inside this chunk directly, else through the world
    const g = (lx, ly, lz) => (lx >= 0 && ly >= 0 && lz >= 0 && lx < CS && ly < CS && lz < CS ? ch[lx | (ly << 5) | (lz << 10)] : w.get(ox + lx, oy + ly, oz + lz));
    const occ = (lx, ly, lz) => { const v = g(lx, ly, lz); return v && !(v & GLOW) ? 1 : 0; };
    for (const D of DIRS) {
      if (skip.has(D.a + ',' + D.s)) continue;
      const a = D.a, sgn = D.s;
      const nX = a === 0 ? sgn : 0, nY = a === 1 ? sgn : 0, nZ = a === 2 ? sgn : 0;
      // u/v unit steps in xyz for this face orientation
      const uX = a === 2 ? 1 : 0, uY = a === 0 ? 1 : 0, uZ = a === 1 ? 1 : 0;
      const vX = a === 1 ? 1 : 0, vY = a === 2 ? 1 : 0, vZ = a === 0 ? 1 : 0;
      const tint = FACE_TINT[a + ',' + sgn];
      for (let sl = 0; sl < CS; sl++) {
        let any = false;
        for (let vv = 0; vv < CS; vv++) for (let uu = 0; uu < CS; uu++) {
          const mi = uu + vv * CS;
          kCol[mi] = 0;
          const lx = a === 0 ? sl : a === 1 ? vv : uu, ly = a === 1 ? sl : a === 0 ? uu : vv, lz = a === 2 ? sl : a === 1 ? uu : vv;
          const v = ch[lx | (ly << 5) | (lz << 10)];
          if (!v) continue;
          const x = ox + lx, y = oy + ly, z = oz + lz;
          if (bnd && (x < bnd.x0 || x >= bnd.x1 || y < bnd.y0 || y >= bnd.y1 || z < bnd.z0 || z >= bnd.z1)) continue;
          if (a === 1 && sgn < 0 && y <= bottomAbove) continue;
          if (room) {
            const qx = x + nX, qy = y + nY, qz = z + nZ;
            let inside = false;
            for (const b of room) if (qx >= b.x0 && qx < b.x1 && qy >= b.y0 && qy < b.y1 && qz >= b.z0 && qz < b.z1) { inside = true; break; }
            if (!inside) continue;
          }
          const ax = lx + nX, ay = ly + nY, az = lz + nZ;
          const nb = g(ax, ay, az);
          const glow = (v & GLOW) !== 0;
          if (nb && !((nb & GLOW) && !glow)) continue;
          const r8 = (v >> 16) & 255, g8 = (v >> 8) & 255, b8 = v & 255;
          if (glow) { cR[mi] = LIN[r8]; cG[mi] = LIN[g8]; cB[mi] = LIN[b8]; kAo[mi] = 3; kGlow[mi] = 1; }
          else {
            lightAt(R, lamps, (x + 0.5 + nX * 0.5) * SC, (y + 0.5 + nY * 0.5) * SC, (z + 0.5 + nZ * 0.5) * SC, nX, nY, nZ, L);
            const dth = R.dither ? (bayer(a === 0 ? z : x, a === 1 ? z : y) - 0.5) * R.dither : 0;
            const qr = Math.max(0, Math.floor(L[0] * tint * bands + 0.5 + dth * 0.5) / bands);
            const qg = Math.max(0, Math.floor(L[1] * tint * bands + 0.5 + dth * 0.5) / bands);
            const qb = Math.max(0, Math.floor(L[2] * tint * bands + 0.5 + dth * 0.5) / bands);
            cR[mi] = LIN[r8] * qr; cG[mi] = LIN[g8] * qg; cB[mi] = LIN[b8] * qb;
            kGlow[mi] = 0;
            if (v & NOAO) kAo[mi] = 3;
            else {
              // corners c0(u-,v-) c1(u+,v-) c2(u+,v+) c3(u-,v+); neighbours sit one step out along the normal
              let code = 0, uni = true, first = -1;
              for (let c = 0; c < 4; c++) {
                const du = c === 1 || c === 2 ? 1 : -1, dv = c >= 2 ? 1 : -1;
                const o1 = occ(ax + uX * du, ay + uY * du, az + uZ * du);
                const o2 = occ(ax + vX * dv, ay + vY * dv, az + vZ * dv);
                const o3 = occ(ax + uX * du + vX * dv, ay + uY * du + vY * dv, az + uZ * du + vZ * dv);
                const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + o3);
                code |= ao << (c * 2);
                if (first < 0) first = ao; else if (ao !== first) uni = false;
              }
              kAo[mi] = uni ? first : -1 - code; // only uniform-AO faces may merge
            }
          }
          kCol[mi] = 1 + Math.round(cR[mi] * 4095) * 16777216 + Math.round(cG[mi] * 4095) * 4096 + Math.round(cB[mi] * 4095);
          any = true;
        }
        if (!any) continue;
        const plane = sl + (sgn > 0 ? 1 : 0);
        for (let vv = 0; vv < CS; vv++) for (let uu = 0; uu < CS; uu++) {
          const mi = uu + vv * CS, key = kCol[mi];
          if (!key) continue;
          const ka = kAo[mi], kg = kGlow[mi];
          let wd = 1, ht = 1;
          if (ka >= 0) {
            while (uu + wd < CS && kCol[mi + wd] === key && kAo[mi + wd] === ka && kGlow[mi + wd] === kg) wd++;
            outer: for (; vv + ht < CS; ht++) for (let q = 0; q < wd; q++) { const j = mi + q + ht * CS; if (kCol[j] !== key || kAo[j] !== ka || kGlow[j] !== kg) break outer; }
          }
          for (let h2 = 0; h2 < ht; h2++) for (let q = 0; q < wd; q++) kCol[mi + q + h2 * CS] = 0;
          const B = kg ? out.glow : out.solid;
          const base = B.quad();
          for (let c = 0; c < 4; c++) {
            const cu = uu + (c === 1 || c === 2 ? wd : 0), cv = vv + (c >= 2 ? ht : 0);
            const lx = a === 0 ? plane : a === 1 ? cv : cu, ly = a === 1 ? plane : a === 0 ? cu : cv, lz = a === 2 ? plane : a === 1 ? cu : cv;
            const aoK = ka >= 0 ? AO_CURVE[ka] : AO_CURVE[((-1 - ka) >> (c * 2)) & 3];
            B.vert(base + c, (ox + lx) * SC, (oy + ly) * SC, (oz + lz) * SC, nX, nY, nZ, cR[mi] * aoK, cG[mi] * aoK, cB[mi] * aoK);
          }
          B.tri(base, sgn > 0);
        }
      }
    }
  }
  return { solid: out.solid.geometry(), glow: out.glow.geometry(), faces: out.solid.n + out.glow.n };
}

/** Growable quad buffers: float positions & linear colours, byte normals, 16/32-bit indices. */
class QuadBuf {
  constructor() { this.n = 0; this.cap = 0; this.grow(4096); }
  grow(cap) {
    const p = new Float32Array(cap * 12), c = new Float32Array(cap * 12), nn = new Int8Array(cap * 12), f = new Uint8Array(cap);
    if (this.p) { p.set(this.p); c.set(this.c); nn.set(this.nn); f.set(this.f); }
    this.p = p; this.c = c; this.nn = nn; this.f = f; this.cap = cap;
  }
  quad() { if (this.n >= this.cap) this.grow(this.cap * 2); return this.n++ * 4; }
  vert(i, x, y, z, nx, ny, nz, r, g, b) {
    const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.nn[k] = nx * 127; this.nn[k + 1] = ny * 127; this.nn[k + 2] = nz * 127;
    this.c[k] = r; this.c[k + 1] = g; this.c[k + 2] = b;
  }
  tri(base, front) { this.f[base >> 2] = front ? 0 : 1; }
  geometry() {
    if (!this.n) return null;
    const nv = this.n * 4, idx = nv > 65535 ? new Uint32Array(this.n * 6) : new Uint16Array(this.n * 6);
    for (let q = 0; q < this.n; q++) {
      const b = q * 4, o = q * 6;
      if (!this.f[q]) { idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3; }
      else { idx[o] = b; idx[o + 1] = b + 2; idx[o + 2] = b + 1; idx[o + 3] = b; idx[o + 4] = b + 3; idx[o + 5] = b + 2; }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(this.p.slice(0, nv * 3), 3));
    gg.setAttribute('normal', new THREE.BufferAttribute(this.nn.slice(0, nv * 3), 3, true));
    gg.setAttribute('color', new THREE.BufferAttribute(this.c.slice(0, nv * 3), 3));
    gg.setIndex(new THREE.BufferAttribute(idx, 1));
    gg.computeBoundingSphere();
    return gg;
  }
}

let envMat = null;
const glowMats = new Map();
export function envMaterial() {
  if (!envMat) { envMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }); envMat.userData.keep = true; }
  return envMat;
}
export function envGlowMaterial(k = 2.4) {
  let m = glowMats.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(k, k, k), fog: false }); m.userData.keep = true; glowMats.set(k, m); }
  return m;
}
/** Meshes for a meshed world → THREE.Group. */
export function worldMeshes(res, glowK = 2.4) {
  const g = new THREE.Group();
  if (res.solid) { const m = new THREE.Mesh(res.solid, envMaterial()); m.name = 'vox-solid'; g.add(m); }
  if (res.glow) { const m = new THREE.Mesh(res.glow, envGlowMaterial(glowK)); m.name = 'vox-glow'; g.add(m); g.userData.glow = m; }
  return g;
}
export const h3 = hash3;
