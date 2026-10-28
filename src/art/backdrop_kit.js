// Low-level pixel painter for backdrops: packed-RGBA image buffers, ramps, fast noise,
// ordered dither, polygons, and light maps. Everything is integer-pixel, no anti-aliasing.
import { hexToRgb, shadeHex, mixHex } from '../core/math.js';

// ---------------------------------------------------------------------------- colors
// packed little-endian ABGR for Uint32 ImageData access
export const pk = (r, g, b, a = 255) => (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
export const hp = (hex, a = 255) => { const [r, g, b] = hexToRgb(hex); return pk(r, g, b, a); };
export const R = (c) => c & 255, G = (c) => (c >>> 8) & 255, B = (c) => (c >>> 16) & 255, A = (c) => c >>> 24;
export function mixp(c1, c2, t) {
  const u = 1 - t;
  return pk(R(c1) * u + R(c2) * t, G(c1) * u + G(c2) * t, B(c1) * u + B(c2) * t, A(c1) * u + A(c2) * t);
}
export const CLEAR = 0;

/** n-step hue-shifted ramp (dark→light) from a list of anchor hexes, as packed colors. */
export function ramp(anchors, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (anchors.length - 1);
    const k = Math.min(anchors.length - 2, Math.floor(t));
    out.push(hp(mixHex(anchors[k], anchors[k + 1], t - k)));
  }
  return out;
}
/** Extend a region tone list with a deep outline shade and a lit highlight. */
export function extRamp(tones, light = '#fff0d0') {
  const dark = mixHex(shadeHex(tones[0], -0.55), '#0a0612', 0.45);
  const hi = mixHex(tones[tones.length - 1], light, 0.35);
  return [dark, ...tones, hi];
}

// ---------------------------------------------------------------------------- dither
const B4 = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
export const bayer = (x, y) => B4[(x & 3) | ((y & 3) << 2)];
/** Quantize continuous tone t (0..n-1) to an index, dithering only near band edges. */
export function qt(t, x, y, n, soft = 0.22) {
  if (t <= 0) return 0;
  if (t >= n - 1) return n - 1;
  const i = Math.floor(t), f = t - i;
  if (f < 0.5 - soft) return i;
  if (f > 0.5 + soft) return i + 1;
  return (f - (0.5 - soft)) / (2 * soft) > bayer(x, y) ? i + 1 : i;
}

// ---------------------------------------------------------------------------- noise
function hashi(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export const hash = hashi;
const tiles = new Map();
/** 256×256 tileable fbm, sampled with wrap — very cheap per pixel. */
export function noiseTile(seed = 1, oct = 4, base = 8) {
  const key = seed + ':' + oct + ':' + base;
  let t = tiles.get(key);
  if (t) return t;
  const N = 256;
  t = new Float32Array(N * N);
  let norm = 0;
  for (let o = 0, amp = 1; o < oct; o++, amp *= 0.5) norm += amp;
  for (let o = 0, amp = 1, f = base; o < oct; o++, amp *= 0.5, f *= 2) {
    const cell = N / f;
    const lat = new Float32Array(f * f);
    for (let i = 0; i < f * f; i++) lat[i] = hashi(i % f, (i / f) | 0, seed * 31 + o);
    for (let y = 0; y < N; y++) {
      const gy = y / cell, iy = Math.floor(gy), fy = gy - iy, sy = fy * fy * (3 - 2 * fy);
      const y0 = (iy % f) * f, y1 = ((iy + 1) % f) * f;
      for (let x = 0; x < N; x++) {
        const gx = x / cell, ix = Math.floor(gx), fx = gx - ix, sx = fx * fx * (3 - 2 * fx);
        const x0 = ix % f, x1 = (ix + 1) % f;
        const a = lat[y0 + x0], b = lat[y0 + x1], c = lat[y1 + x0], d = lat[y1 + x1];
        t[y * N + x] += ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy) * amp;
      }
    }
  }
  for (let i = 0; i < N * N; i++) t[i] /= norm;
  tiles.set(key, t);
  return t;
}
export const ns = (tile, x, y) => tile[((y & 255) << 8) | (x & 255)];
/** bilinear sample of a tile at fractional coords (for scaled noise) */
export function nsf(tile, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = ns(tile, ix, iy), b = ns(tile, ix + 1, iy), c = ns(tile, ix, iy + 1), d = ns(tile, ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// ---------------------------------------------------------------------------- image
const SCR = { d: new Uint32Array(1 << 16), m: new Uint8Array(1 << 16) };
export class Img {
  constructor(w, h, fill = 0) {
    this.w = Math.max(1, w | 0); this.h = Math.max(1, h | 0);
    this.d = new Uint32Array(this.w * this.h);
    if (fill) this.d.fill(fill);
  }
  /** an Img over a shared scratch buffer (cleared); valid until the next scratch() call */
  static scratch(w, h) {
    const n = Math.max(1, w | 0) * Math.max(1, h | 0);
    if (SCR.d.length < n) SCR.d = new Uint32Array(Math.max(n, SCR.d.length * 2));
    const im = Object.create(Img.prototype);
    im.w = Math.max(1, w | 0); im.h = Math.max(1, h | 0);
    im.d = SCR.d.subarray(0, n); im.d.fill(0);
    return im;
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  get(x, y) { x |= 0; y |= 0; return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
  alpha(x, y) { return A(this.get(x, y)); }
  /** alpha-composite c (with alpha a 0..1) over pixel */
  over(x, y, c, a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = y * this.w + x, d = this.d[i];
    if (a >= 1 || A(d) === 0) { this.d[i] = a >= 1 ? c : pk(R(c), G(c), B(c), a * 255); return; }
    this.d[i] = pk(R(d) + (R(c) - R(d)) * a, G(d) + (G(c) - G(d)) * a, B(d) + (B(c) - B(d)) * a, Math.max(A(d), a * 255));
  }
  /** additive light: brighten existing pixel toward color c by amount a */
  add(x, y, c, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = y * this.w + x, d = this.d[i];
    if (!A(d)) return;
    this.d[i] = pk(Math.min(255, R(d) + R(c) * a), Math.min(255, G(d) + G(c) * a), Math.min(255, B(d) + B(c) * a), A(d));
  }
  rect(x, y, w, h, c) { for (let j = Math.max(0, y | 0); j < Math.min(this.h, (y + h) | 0); j++) for (let i = Math.max(0, x | 0); i < Math.min(this.w, (x + w) | 0); i++) this.d[j * this.w + i] = c; }
  hline(x0, x1, y, c) { for (let x = Math.min(x0, x1) | 0; x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = Math.min(y0, y1) | 0; y <= Math.max(y0, y1); y++) this.set(x, y, c); }
  line(x0, y0, x1, y1, c, fn) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let g = 0; g < 8192; g++) {
      if (fn) fn(x0, y0); else this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** filled polygon, fn(x,y) returns packed color (or 0 to skip) */
  poly(pts, fn) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(this.h - 1, Math.ceil(maxY));
    const xs = [];
    for (let y = minY; y <= maxY; y++) {
      xs.length = 0;
      const sy = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k])), xb = Math.min(this.w, Math.round(xs[k + 1]));
        for (let x = xa; x < xb; x++) { const c = typeof fn === 'function' ? fn(x, y) : fn; if (c) this.d[y * this.w + x] = c; }
      }
    }
  }
  ellipse(cx, cy, rx, ry, fn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (y < 0 || y >= this.h) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || x >= this.w) continue;
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
        if (d > 1) continue;
        const c = typeof fn === 'function' ? fn(x, y, nx, ny, d) : fn;
        if (c) this.d[y * this.w + x] = c;
      }
    }
  }
  /** 1px outline around opaque pixels of a region (only writes into transparent pixels). */
  outline(c, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) {
    const add = [];
    for (let y = Math.max(0, y0 - 1); y < Math.min(this.h, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x < Math.min(this.w, x1 + 1); x++) {
      if (A(this.d[y * this.w + x])) continue;
      if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) add.push(y * this.w + x);
    }
    for (const i of add) this.d[i] = c;
  }
  /** copy src image at offset (alpha composite) */
  draw(src, ox, oy, flip = false) {
    for (let y = 0; y < src.h; y++) {
      const ty = y + oy;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const c = src.d[y * src.w + (flip ? src.w - 1 - x : x)];
        const a = A(c);
        if (!a) continue;
        if (a === 255) this.set(x + ox, ty, c);
        else this.over(x + ox, ty, c | 0xff000000, a / 255);
      }
    }
  }
  toCanvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.d);
    g.putImageData(img, 0, 0);
    return c;
  }
}

// ---------------------------------------------------------------------------- hand-drawn shapes
const TAU = Math.PI * 2;
/** 1D value noise 0..1 (smooth), for wobbling lines and profiles. */
export function wob(t, seed = 0) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return hashi(i, 17, seed) * (1 - u) + hashi(i + 1, 17, seed) * u;
}
/** Irregular closed outline around (cx,cy): angular lumps, never a clean ellipse. */
export function blobPts(cx, cy, rx, ry, seed, o = {}) {
  const n = o.n || Math.max(7, Math.min(22, Math.round((rx + ry) / 7) + 5));
  const rough = o.rough ?? 0.5;
  const a2 = (hashi(seed, 1, 3) - 0.3) * 0.22 * rough, p2 = hashi(seed, 2, 3) * TAU;
  const a3 = hashi(seed, 3, 3) * 0.14 * rough, p3 = hashi(seed, 4, 3) * TAU;
  const rot = o.rot ?? hashi(seed, 5, 3) * TAU;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = rot + (i / n) * TAU + (hashi(i, seed, 7) - 0.5) * (TAU / n) * 0.7;
    const r = 1 + a2 * Math.sin(2 * ang + p2) + a3 * Math.sin(3 * ang + p3) + (hashi(i, seed, 9) - 0.5) * rough * 0.32;
    let x = cx + Math.cos(ang) * rx * r, y = cy + Math.sin(ang) * ry * r;
    if (o.flatBottom != null) y = Math.min(y, cy + ry * o.flatBottom + (hashi(i, seed, 11) - 0.5) * 2);
    if (o.flatTop != null) y = Math.max(y, cy - ry * o.flatTop - (hashi(i, seed, 13) - 0.5) * 2);
    pts.push([x, y]);
  }
  return pts;
}
/** Points along a wobbly line from a to b (for planks, roots, cracks). */
export function wobLine(ax, ay, bx, by, seed, amp = 1.2, step = 6) {
  const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.ceil(len / step));
  const px = -(by - ay) / (len || 1), py = (bx - ax) / (len || 1);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = i === 0 || i === n ? 0 : (wob(t * len * 0.12, seed) - 0.5) * 2 * amp;
    out.push([ax + (bx - ax) * t + px * w, ay + (by - ay) * t + py * w]);
  }
  return out;
}
/** Rasterize a polygon into a local mask (Uint8) over bbox; returns {m,x0,y0,w,h}. */
export function polyMask(pts, pad = 3, pooled = false) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  x0 = Math.floor(x0) - pad; y0 = Math.floor(y0) - pad;
  const w = Math.ceil(x1) - x0 + pad + 1, h = Math.ceil(y1) - y0 + pad + 1;
  let m;
  if (pooled) { if (SCR.m.length < w * h) SCR.m = new Uint8Array(Math.max(w * h, SCR.m.length * 2)); m = SCR.m.subarray(0, w * h); m.fill(0); }
  else m = new Uint8Array(w * h);
  const xs = [];
  for (let y = 0; y < h; y++) {
    xs.length = 0;
    const sy = y + y0 + 0.5;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.round(xs[k] - x0)), xb = Math.min(w, Math.round(xs[k + 1] - x0));
      for (let x = xa; x < xb; x++) m[y * w + x] = 1;
    }
  }
  return { m, x0, y0, w, h };
}
/** Thick/thin brush stamp along a polyline. wfn(i,t) → width px. */
export function stroke(img, pts, c, wfn = () => 1, closed = false) {
  const n = pts.length, segs = closed ? n : n - 1;
  for (let s = 0; s < segs; s++) {
    const a = pts[s], b = pts[(s + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(len / 0.6));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const w = wfn(s, t, x, y);
      if (w <= 0) continue;
      if (w < 1.5) { img.set(Math.round(x), Math.round(y), c); continue; }
      const r = w / 2, r2 = r * r + 0.2;
      for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r2) img.set(xx, yy, c);
    }
  }
}

// ---------------------------------------------------------------------------- per-surface lighting
// Material ramps have 9 steps: 0 ink · 1 core shadow · 2 shadow · 3 reflected light (all teal-blue)
// · 4 warm falloff brown · 5 local · 6 lit · 7 highlight · 8 rim.  `acc` is the same ramp lit by the
// region accent light (crystal / spore / curse glow) instead of the warm key.
export function material(local, S, o = {}) {
  const sh = S.shadow, key = S.key || '#ff9a40';
  const lc = o.light ? mixHex(local, o.light, 0.25) : local;
  const make = (k, hi, rim) => [
    mixHex(sh[0], local, 0.1), mixHex(sh[1], local, 0.16 + (o.sat || 0)), mixHex(sh[2], local, 0.22), mixHex(sh[3], local, 0.28),
    mixHex(shadeHex(lc, -0.32), '#4a200c', 0.3), lc, mixHex(shadeHex(lc, 0.22), k, 0.42), mixHex(shadeHex(lc, 0.4), hi, 0.62), mixHex(rim, lc, 0.12),
  ];
  const w = make(key, S.keyHi || '#ffc070', S.rimC || '#ffe2a2');
  const a = make(S.acc || key, mixHex(S.acc || key, '#ffffff', 0.45), mixHex(S.acc || key, '#ffffff', 0.7));
  const fade = o.fade || 0, fog = o.fog || sh[2];
  const pack = (arr) => arr.map((c, i) => hp(fade ? mixHex(c, fog, fade * (i < 4 ? 0.6 : 1)) : c));
  return { w: pack(w), a: pack(a) };
}
const AX = -0.32, AY = -0.62, AZ = 0.72; // ambient/bounce direction (from upper-front-left)
/** Lights in layer pixels: {x,y,z,r,s,acc}. idx() returns a ramp position 0..8 for a surface normal. */
export class Shade {
  constructor(lights, o = {}) {
    this.lights = lights.map((l) => ({ ...l, r2: l.r * l.r }));
    this.ka = 0; this.kw = 0; this.dir = [0, 0, 1]; this.att = 0;
    this.lift = o.lift || 0; // raise shadows (distant layers)
    this.gain = o.gain || 1;
  }
  near(x0, y0, x1, y1) {
    return this.lights.filter((l) => l.x + l.r > x0 && l.x - l.r < x1 && l.y + l.r > y0 && l.y - l.r < y1);
  }
  idx(x, y, nx, ny, nz, ls = this.lights) {
    let kw = 0, ka = 0, term = -2, tw = 0, bx = 0, by = 0;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      const dx = l.x - x, dy = l.y - y, dz = l.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= l.r2) continue;
      const d = Math.sqrt(d2), ndl = (nx * dx + ny * dy + nz * dz) / d;
      let att = 1 - d / l.r; att = att * att * l.s;
      // wrapped diffuse: the pool is shaped by distance, the surface turns it from lit to core shadow
      if (ndl > -0.18) { const c = att * (0.4 + 0.6 * Math.min(1, (ndl + 0.18) / 0.9)); if (l.acc) ka += c; else kw += c; }
      if (att > tw) { tw = att; term = ndl; bx = dx / d; by = dy / d; }
    }
    this.kw = kw; this.ka = ka; this.att = tw; this.dir[0] = bx; this.dir[1] = by;
    const k = (kw + ka) * this.gain;
    if (k >= 0.08) return 4 + Math.min(3.45, (k - 0.08) * 5.2);
    const amb = nx * AX + ny * AY + nz * AZ;
    const sh = tw > 0.08 && term > -0.5 && term <= -0.18 ? 1.05 : 1.55 + Math.max(0, amb) * 1.6; // core shadow past the terminator
    if (k > 0.02) return sh + (4 - sh) * ((k - 0.02) / 0.06); // pool edge: dithered into the teal
    return sh + this.lift;
  }
  /** pick a color from a material for ramp position t at pixel (x,y) */
  col(M, t, x, y) { return (this.ka > this.kw * 1.15 ? M.a : M.w)[qt(t, x, y, 9, 0.24)]; }
}

/**
 * Ink a sprite's silhouette like a hand-drawn line: the edge pixel turns to ink (dark teal-black, warm
 * brown where lit), doubling to 2px on the shadow side; where the light is strongest the line is "lost"
 * and becomes a rim highlight; light-facing edges get a rim pixel just inside.
 */
const INK = { i: new Int32Array(1 << 14), c: new Uint32Array(1 << 14) };
export function inkSprite(s, sh, ls, ox, oy, o = {}) {
  const W = s.w, H = s.h, d = s.d, N = W * H;
  const inkC = o.ink ?? hp('#071016'), warmInk = o.warmInk ?? hp('#2a1208');
  const rimC = o.rim ?? hp('#ffe2a2');
  const seed = o.seed || 3;
  let n = 0;
  const push = (i, c) => {
    if (n >= INK.i.length) { const ni = new Int32Array(INK.i.length * 2), nc = new Uint32Array(INK.c.length * 2); ni.set(INK.i); nc.set(INK.c); INK.i = ni; INK.c = nc; }
    INK.i[n] = i; INK.c[n++] = c;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!(d[i] >>> 24)) continue;
    let ex = 0, ey = 0;
    if (!(x > 0 && d[i - 1] >>> 24)) ex -= 1;
    if (!(x < W - 1 && d[i + 1] >>> 24)) ex += 1;
    if (!(y > 0 && d[i - W] >>> 24)) ey -= 1;
    if (!(y < H - 1 && d[i + W] >>> 24)) ey += 1;
    if (!ex && !ey) continue;
    const wx = x + ox, wy = y + oy;
    sh.idx(wx, wy, ex * 0.6, ey * 0.6, 0.55, ls);
    const dir = sh.dir, facing = ex * dir[0] + ey * dir[1];
    const lit = sh.att * (facing > 0 ? facing : 0) * sh.gain;
    const nn = wob((wx * 0.7 + wy) * 0.11, seed);
    const ix = x - (Math.abs(ex) >= Math.abs(ey) ? Math.sign(ex) : 0), iy = y - (Math.abs(ey) > Math.abs(ex) ? Math.sign(ey) : 0);
    const j = iy * W + ix;
    if (lit > 0.2 && nn > 0.6) { push(i, mixp(d[i], rimC, 0.7)); continue; } // lost edge
    push(i, lit > 0.1 ? warmInk : inkC);
    if (j < 0 || j >= N || !(d[j] >>> 24)) continue;
    if (lit > 0.05) push(j, mixp(d[j], rimC, Math.min(0.75, 0.3 + lit * 1.5)));
    else if (facing < -0.25 || nn < 0.22) push(j, inkC);
  }
  const I = INK.i, Cc = INK.c;
  for (let k = 0; k < n; k++) d[I[k]] = Cc[k];
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export { mixHex, shadeHex, hexToRgb };
