// Procedural pixel-art sprites: materials (ores, gems, parts, keys, scrolls, tools), backpack items,
// forged weapons, character portraits, the FORGLITE logo and map node badges.
// Style rules: top-left light, hue-shifted 6-tone ramps, faceted rocks, selective dark outlines, glints.
import { Painter, makeCanvas, rotate90, scaleCanvas } from './pixel.js';
import { shadeHex, mixHex, hexToRgb, hash2, fbm2, clamp, lerp } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { MATERIALS } from '../data/materials.js';
import { SHAPES, cellsSize } from '../data/shapes.js';
import { CHARACTERS } from '../data/characters.js';
import { NODE_TYPES } from '../data/regions.js';
import { icon } from '../ui/icons.js';

const cache = new Map();
const memo = (key, fn) => { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; };

// ------------------------------------------------------------------ palette helpers
/** 6 tones dark→light (index 5 is a near-white specular). */
export function tones(hex) {
  // very light colours get pulled down so shading + highlights still have room to read
  const l = lumOf(hex);
  const b = l > 0.7 ? shadeHex(hex, -(l - 0.7) * 1.25) : hex;
  return [shadeHex(b, -0.74), shadeHex(b, -0.5), shadeHex(b, -0.26), b, shadeHex(b, 0.34), shadeHex(b, 0.68)];
}
function lumOf(hex) { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
const outlineOf = (hex) => mixHex(shadeHex(hex, -0.86), '#140c10', 0.55);
const L = [-0.5, -0.65, 0.57];

/** Map light intensity (-1..1) to a tone index 0..5 (5 only for strong highlights). */
function toneIdx(i, bias = 0) {
  const t = clamp((i + 0.32 + bias) / 1.25);
  return Math.min(4, Math.floor(t * 5));
}

/** Selective outline: dark outer line, softened where it touches lit (top/left) pixels. */
function finish(p, outHex, opts = {}) {
  const w = p.w, h = p.h;
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (p.alpha(x, y)) continue;
    const nb = [[1, 0], [0, 1], [-1, 0], [0, -1]].filter(([dx, dy]) => p.alpha(x + dx, y + dy) > 0);
    if (!nb.length) continue;
    // lit side = the shape lies right/below this outline pixel (pixel is on the top/left rim)
    const litSide = nb.some(([dx, dy]) => dx === 1 || dy === 1) && !nb.some(([dx, dy]) => dx === -1 || dy === -1);
    let col = outHex;
    if (litSide && opts.selout !== false) {
      const [dx, dy] = nb.find(([a, b]) => a === 1 || b === 1);
      const c = p.get(x + dx, y + dy);
      col = mixHex(outHex, '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join(''), 0.28);
    }
    add.push([x, y, col]);
  }
  for (const [x, y, c] of add) p.set(x, y, c);
}

function sparkle(p, x, y, col = '#ffffff', big = false) {
  p.set(x, y, col);
  p.set(x - 1, y, col, 170); p.set(x + 1, y, col, 170); p.set(x, y - 1, col, 170); p.set(x, y + 1, col, 170);
  if (big) { p.set(x - 2, y, col, 90); p.set(x + 2, y, col, 90); p.set(x, y - 2, col, 90); p.set(x, y + 2, col, 90); }
}

// ------------------------------------------------------------------ shape primitives
function tri(p, a, b, c, col) { p.poly([a, b, c], col); }

/** Faceted dome (rocks, nuggets, gems). Returns facet list for extra detailing. */
function facetDome(p, cx, cy, rx, ry, T, r, o = {}) {
  const n = o.n || 7;
  const h = o.h ?? 0.9;
  const out = [], mid = [];
  const a0 = r.float(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + r.float(-0.18, 0.18);
    const k = r.float(o.jit ? 1 - o.jit : 0.82, 1.0);
    let x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (o.flat && y > cy + ry * o.flat) y = cy + ry * o.flat;
    out.push([x, y, 0]);
    const a2 = a + Math.PI / n;
    const k2 = r.float(0.45, 0.62);
    mid.push([cx + Math.cos(a2) * rx * k2 - rx * 0.08, cy + Math.sin(a2) * ry * k2 - ry * 0.1, h * 0.72]);
  }
  const apex = [cx - rx * 0.12 + r.float(-0.5, 0.5), cy - ry * 0.22 + r.float(-0.5, 0.5), h];
  p.poly(out.map(([x, y]) => [x, y]), T[2]);
  const facets = [];
  const shadeTri = (A, B, C) => {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = (B[2] - A[2]) * rx;
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = (C[2] - A[2]) * rx;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const i = nx * L[0] + ny * L[1] + nz * L[2] + r.float(-0.06, 0.06) + (o.bias || 0);
    const ti = toneIdx(i, o.toneBias || 0);
    facets.push({ pts: [A, B, C], ti });
    tri(p, [A[0], A[1]], [B[0], B[1]], [C[0], C[1]], T[ti]);
  };
  for (let i = 0; i < n; i++) {
    const A = out[i], B = out[(i + 1) % n], M = mid[i], M2 = mid[(i + 1) % n];
    shadeTri(A, B, M);
    shadeTri(M, B, M2);
    shadeTri(M, M2, apex);
  }
  return { out, mid, apex, facets };
}

/** Lumpy rounded pebble with spherical shading + specular glint. */
function lump(p, cx, cy, rx, ry, T, seed, o = {}) {
  const spec = o.spec ?? true;
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const ang = Math.atan2(dy, dx);
      const wob = 1 + (fbm2(Math.cos(ang) * 1.3 + seed, Math.sin(ang) * 1.3, 2, seed | 0) - 0.5) * (o.wobble ?? 0.35);
      const d2 = dx * dx + dy * dy;
      if (d2 > wob * wob) continue;
      const nx = dx / wob, ny = dy / wob;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let i = nx * L[0] + ny * L[1] + nz * L[2];
      if (o.flatTop && ny < -0.2) i += 0.1;
      p.set(x, y, T[toneIdx(i, o.bias || 0)]);
    }
  }
  if (spec) {
    const sx = Math.round(cx - rx * 0.42), sy = Math.round(cy - ry * 0.45);
    p.set(sx, sy, T[5]);
    if (rx > 3) p.set(sx + 1, sy, T[4]);
    if (rx > 4.5) p.set(sx, sy + 1, T[4]);
  }
}

/** A crystal prism (hex column seen from the side) from base (x, by) with height h, width w, lean dx. */
function prism(p, x, by, w, h, T, lean = 0, o = {}) {
  const hw = w / 2, tip = Math.max(2, w * 0.7);
  const bl = [x - hw, by], br = [x + hw, by];
  const tr = [x + hw + lean, by - h + tip], tl = [x - hw + lean, by - h + tip], tp = [x + lean, by - h];
  const ml = [x + lean * 0.5, by]; // ridge bottom
  const mt = [x + lean, by - h + tip * 0.55];
  // left (lit) face, right (shade) face, tip faces
  p.poly([bl, ml, mt, tl], T[3]);
  p.poly([ml, br, tr, mt], T[1]);
  p.poly([tl, mt, tp], T[4]);
  p.poly([mt, tr, tp], T[2]);
  // ridge highlight
  p.line(Math.round(ml[0]), Math.round(by - 1), Math.round(mt[0]), Math.round(mt[1]), T[o.glow ? 5 : 4]);
  if (o.inner) { // inner glow streak
    p.line(Math.round(x - hw * 0.4 + lean * 0.3), Math.round(by - h * 0.25), Math.round(x - hw * 0.3 + lean * 0.7), Math.round(by - h * 0.65), T[5]);
  }
  p.set(Math.round(tp[0]), Math.round(tp[1]) + 1, T[5]);
}

/** Paint along an axis: fn(t∈[0,1], d (signed perp px), len, lit) → color|null */
function axisPaint(p, x0, y0, x1, y1, maxR, fn) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux; // perpendicular
  const litSign = px * L[0] + py * L[1] > 0 ? 1 : -1;
  const minX = Math.floor(Math.min(x0, x1) - maxR - 1), maxX = Math.ceil(Math.max(x0, x1) + maxR + 1);
  const minY = Math.floor(Math.min(y0, y1) - maxR - 1), maxY = Math.ceil(Math.max(y0, y1) + maxR + 1);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const rx = x + 0.5 - x0, ry = y + 0.5 - y0;
    const u = rx * ux + ry * uy, v = rx * px + ry * py;
    const t = u / len;
    if (t < -0.15 || t > 1.15) continue;
    const c = fn(t, v * litSign, len, u);
    if (c) p.set(x, y, c);
  }
}

// ------------------------------------------------------------------ material palettes / special cases
const ROCK = {
  default: '#8a847e', junk: '#8a7462', lodestone: '#4e4c60', magmasteel: '#4a3028', cursedore: '#4a3a5c',
  iron: '#7a5e50', copper: '#86827c', stariron: '#2a2a4a',
};
function seedOf(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

// ------------------------------------------------------------------ STYLES  (p, W, H, m, r)
const STYLES = {};

STYLES.chunk = (p, W, H, m, r) => {
  const rock = tones(ROCK[m.id] || ROCK.default);
  const ore = tones(m.color);
  const cx = W / 2, cy = H * 0.58, rx = W * 0.45, ry = H * 0.38;
  facetDome(p, cx, cy, rx, ry, rock, r, { n: 7, flat: 0.8, h: 0.95, toneBias: 0.12 });
  // speckle texture
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.alpha(x, y) && hash2(x, y, seedOf(m.id)) > 0.9) p.set(x, y, rock[hash2(x, y, 7) > 0.5 ? 1 : 3]);
  const glowing = m.id === 'magmasteel' || m.id === 'cursedore';
  // veins
  const veins = glowing ? 3 : 2;
  for (let v = 0; v < veins; v++) {
    let x = cx + r.float(-rx * 0.6, rx * 0.4), y = cy + r.float(-ry * 0.5, ry * 0.5);
    for (let k = 0; k < W * 0.35; k++) {
      if (p.alpha(x | 0, y | 0)) p.set(x | 0, y | 0, glowing ? ore[4] : ore[1]);
      x += r.float(0.3, 1.1); y += r.float(-0.8, 0.8);
    }
  }
  // embedded nuggets/crystals of the ore
  const count = m.id === 'junk' ? 3 : 3;
  const spots = [[-1.9, 0.62], [-1.2, 0.5], [-0.5, 0.58], [-2.5, 0.3], [-0.9, 0.15]];
  for (let i = 0; i < count; i++) {
    const [a0, d] = spots[(i + seedOf(m.id)) % spots.length];
    const a = a0 + r.float(-0.2, 0.2);
    const nx = cx + Math.cos(a) * rx * d, ny = cy + Math.sin(a) * ry * d - ry * 0.12;
    const s = W * r.float(0.11, 0.15) * (i === 0 ? 1.25 : 1);
    if (m.id === 'junk') lump(p, nx, ny, s, s * 0.8, tones(m.color2), r.next() * 50, { wobble: 0.5 });
    else facetDome(p, nx, ny, s * 1.15, s, ore, r, { n: 5, h: 1.2, toneBias: 0.25 });
  }
  if (m.id === 'lodestone') { // iron filings bristle
    for (let i = 0; i < 6; i++) { const x = Math.round(cx + r.float(-rx * 0.7, rx * 0.7)); const y = Math.round(cy - ry * r.float(0.7, 1.0)); p.set(x, y - 1, '#9aa0b0'); p.set(x, y - 2, '#5a6070'); }
    p.set(Math.round(cx + rx * 0.3), Math.round(cy - ry * 0.2), '#ff6a6a');
  }
  if (m.id === 'iron') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.alpha(x, y) && hash2(x, y, 41) > 0.93) p.set(x, y, m.color2);
  if (glowing) for (let i = 0; i < 3; i++) { const x = Math.round(cx + r.float(-rx * 0.5, rx * 0.5)), y = Math.round(cy + r.float(-ry * 0.4, ry * 0.3)); if (p.alpha(x, y)) p.set(x, y, ore[5]); }
};

STYLES.nuggets = (p, W, H, m, r) => {
  const T = tones(m.color);
  const coal = m.id === 'coal';
  const pts = [[0.36, 0.62, 0.22], [0.64, 0.6, 0.2], [0.5, 0.38, 0.19], [0.24, 0.4, 0.13], [0.74, 0.36, 0.12]];
  const n = m.id === 'silver' || m.id === 'gold' ? 4 : 5;
  // draw back to front (top first)
  const order = pts.slice(0, n).sort((a, b) => a[1] - b[1]);
  for (const [fx, fy, fr] of order) {
    const rr = W * fr * r.float(0.9, 1.1);
    if (coal) facetDome(p, W * fx, H * fy, rr, rr * 0.85, tones('#4a4652'), r, { n: 5, h: 1.1, toneBias: 0.2 });
    else lump(p, W * fx, H * fy, rr, rr * 0.82, T, r.next() * 99, { wobble: 0.4 });
  }
  if (coal) { // bluish sheen glints
    for (let i = 0; i < 4; i++) { const x = Math.round(W * r.float(0.25, 0.7)), y = Math.round(H * r.float(0.3, 0.65)); if (p.alpha(x, y)) p.set(x, y, '#8a90b8'); }
  }
};

STYLES.ingot = (p, W, H, m, r) => {
  const T = tones(m.color);
  // wedge ingot in 3/4 view: top face, front face, right face
  const x0 = W * 0.12, x1 = W * 0.78, y0 = H * 0.4, y1 = H * 0.72, d = W * 0.16;
  const top = [[x0 + d, y0 - d * 0.7], [x1 + d * 0.2, y0 - d * 0.7], [x1, y0], [x0, y0]];
  const front = [[x0, y0], [x1, y0], [x1 - W * 0.04, y1], [x0 + W * 0.04, y1]];
  const side = [[x1, y0], [x1 + d * 0.2, y0 - d * 0.7], [x1 + d * 0.6, y1 - d * 0.6], [x1 - W * 0.04, y1]];
  p.poly(front, T[2]);
  p.poly(top, T[4]);
  p.poly(side, T[1]);
  // bevel lines
  p.hline(Math.round(x0) + 1, Math.round(x1) - 1, Math.round(y0), T[5]);
  p.hline(Math.round(x0) + 2, Math.round(x1) - 2, Math.round(y1) - 1, T[1]);
  // stamp / sheen
  const sx = Math.round(W * 0.3);
  p.line(sx, Math.round(y0) + 2, sx + Math.round(W * 0.12), Math.round(y0) + 2, T[3]);
  p.set(Math.round(x0 + d + 2), Math.round(y0 - d * 0.7 + 1), T[5]);
  if (m.id === 'bronze_ancient') { // verdigris patina specks
    for (let i = 0; i < 7; i++) { const x = Math.round(r.float(x0 + 1, x1)), y = Math.round(r.float(y0 - d * 0.5, y1 - 1)); if (p.alpha(x, y)) p.set(x, y, hash2(x, y, 3) > 0.5 ? '#4a9a7a' : '#6ac09a'); }
  }
  if (m.id === 'mithril') { sparkle(p, Math.round(x0 + d + 4), Math.round(y0 - d * 0.7), '#ffffff'); }
};

STYLES.cluster = (p, W, H, m, r) => {
  const rock = tones('#6a6470');
  const T = tones(m.color);
  facetDome(p, W * 0.5, H * 0.78, W * 0.4, H * 0.16, rock, r, { n: 7, h: 0.5, flat: 0.6 });
  const crystals = [[0.5, 0.74, 0.62, 0.22, 0], [0.3, 0.76, 0.42, 0.17, -0.1], [0.7, 0.76, 0.46, 0.17, 0.1], [0.4, 0.8, 0.28, 0.13, -0.18], [0.62, 0.8, 0.3, 0.13, 0.2]];
  for (const [fx, fy, fh, fw, lean] of crystals) prism(p, W * fx, H * fy, W * fw, H * fh, T, W * lean * 0.5);
};

STYLES.crystal = (p, W, H, m, r) => {
  const T = tones(m.color);
  const sets = [[0.5, 0.88, 0.8, 0.3, 0.05], [0.28, 0.88, 0.5, 0.22, -0.16], [0.72, 0.9, 0.46, 0.2, 0.16]];
  for (const [fx, fy, fh, fw, lean] of sets.slice().sort((a, b) => a[2] - b[2])) prism(p, W * fx, H * fy, W * fw, H * fh, T, W * lean * 0.5, { glow: true, inner: true });
  const C2 = m.color2;
  if (m.id === 'storm') { // zig spark
    const x = Math.round(W * 0.5), y = Math.round(H * 0.3);
    [[0, 0], [1, 1], [0, 2], [1, 3], [0, 4]].forEach(([a, b]) => p.set(x + a + 2, y + b, '#fffbd0'));
    p.set(Math.round(W * 0.2), Math.round(H * 0.3), C2); p.set(Math.round(W * 0.82), Math.round(H * 0.45), C2);
  } else if (m.id === 'ember') {
    for (let i = 0; i < 4; i++) p.set(Math.round(W * r.float(0.25, 0.75)), Math.round(H * r.float(0.04, 0.16)), i % 2 ? '#ffe08a' : '#ff9a3a');
  } else if (m.id === 'rime') {
    sparkle(p, Math.round(W * 0.22), Math.round(H * 0.24), '#ffffff');
  } else if (m.id === 'venomite') {
    p.set(Math.round(W * 0.66), Math.round(H * 0.92), T[4]); p.set(Math.round(W * 0.66), Math.round(H * 0.97), T[3]);
  }
};

STYLES.shard = (p, W, H, m, r) => {
  const T = tones(m.color);
  const pts = [[W * 0.18, H * 0.86], [W * 0.38, H * 0.1], [W * 0.56, H * 0.06], [W * 0.82, H * 0.52], [W * 0.62, H * 0.92]];
  p.poly(pts, T[1]);
  p.poly([pts[0], pts[1], [W * 0.46, H * 0.5]], T[3]);
  p.poly([pts[1], pts[2], [W * 0.46, H * 0.5]], T[4]);
  p.poly([pts[2], pts[3], [W * 0.46, H * 0.5]], T[2]);
  p.poly([pts[0], [W * 0.46, H * 0.5], pts[4]], T[2]);
  p.line(Math.round(W * 0.46), Math.round(H * 0.5), Math.round(W * 0.38), Math.round(H * 0.12), T[5]);
  if (m.id === 'prism') {
    const rb = ['#ff7a9a', '#ffd06a', '#9aff9a', '#7ad8ff', '#c08aff'];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.alpha(x, y) && hash2(x, y, 9) > 0.55) {
      const k = Math.floor(((x + y) / (W + H)) * rb.length * 1.6) % rb.length;
      const c = p.get(x, y); if (c[0] + c[1] + c[2] > 300) p.set(x, y, rb[k], 160);
    }
  }
  if (m.id === 'voidcrystal') {
    for (let i = 0; i < 5; i++) { const x = Math.round(W * r.float(0.3, 0.65)), y = Math.round(H * r.float(0.25, 0.8)); if (p.alpha(x, y)) p.set(x, y, i % 2 ? '#ffffff' : m.color2); }
  }
  if (m.id === 'obsidian') p.set(Math.round(W * 0.52), Math.round(H * 0.12), '#e0d0ff');
};

STYLES.gem = (p, W, H, m, r) => {
  const T = tones(m.color);
  const cx = W / 2, cy = H * 0.52;
  const cut = { ruby: 'oval', sapphire: 'pear', emerald: 'step', topaz: 'rhombus', diamond: 'brilliant', moonstone: 'cabochon', amber: 'blob', soulstone: 'pear' }[m.id] || 'oval';
  if (cut === 'oval' || cut === 'cabochon' || cut === 'blob') {
    lump(p, cx, cy, W * 0.36, H * 0.4, T, 3, { wobble: cut === 'blob' ? 0.35 : 0.04, spec: false });
    // inner reflection band
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!p.alpha(x, y)) continue;
      const dx = (x + 0.5 - cx) / (W * 0.36), dy = (y + 0.5 - cy) / (H * 0.4);
      if (dx > 0.15 && dy > 0.15 && dx * dx + dy * dy < 0.62 && dx * dx + dy * dy > 0.3) p.set(x, y, T[4]);
    }
    p.set(Math.round(cx - W * 0.16), Math.round(cy - H * 0.2), T[5]); p.set(Math.round(cx - W * 0.12), Math.round(cy - H * 0.2), T[5]); p.set(Math.round(cx - W * 0.16), Math.round(cy - H * 0.16), T[4]);
    if (cut === 'blob') { // trapped beetle
      const bx = Math.round(cx + 1), by = Math.round(cy + 1);
      p.set(bx, by, '#5a2a0a'); p.set(bx + 1, by, '#5a2a0a'); p.set(bx, by - 1, '#7a3a0a'); p.set(bx - 1, by + 1, '#5a2a0a'); p.set(bx + 2, by + 1, '#5a2a0a');
    }
    if (cut === 'cabochon') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.alpha(x, y) && Math.abs((x - W * 0.35) - (y - H * 0.3) * 0.6) < 1.2 && y < H * 0.7) p.set(x, y, '#b8f0ff');
  } else if (cut === 'pear') {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI * 2; const k = Math.sin(a) < 0 ? 1 - Math.pow(-Math.sin(a), 1.5) * 0.85 : 1; pts.push([cx + Math.cos(a) * W * 0.32 * k, cy + Math.sin(a) * H * 0.4]); }
    p.poly(pts, T[2]);
    // facets: radial wedges
    for (let i = 0; i < 20; i += 2) p.poly([[cx, cy + H * 0.08], pts[i], pts[i + 1]], T[(i / 2) % 3 === 0 ? 3 : (i / 2) % 3 === 1 ? 2 : 4]);
    p.poly([[cx - W * 0.1, cy], [cx + W * 0.1, cy], [cx + W * 0.06, cy + H * 0.16], [cx - W * 0.06, cy + H * 0.16]], T[4]);
    p.set(Math.round(cx - W * 0.12), Math.round(cy - H * 0.06), T[5]);
    if (m.id === 'soulstone') for (let i = 0; i < 8; i++) { const a = i * 0.8; p.set(Math.round(cx + Math.cos(a) * i * 0.6), Math.round(cy + 3 + Math.sin(a) * i * 0.6), '#d8fff0'); }
  } else if (cut === 'step') {
    const a = W * 0.36, b = H * 0.3, c = W * 0.1;
    const oct = [[cx - a + c, cy - b], [cx + a - c, cy - b], [cx + a, cy - b + c], [cx + a, cy + b - c], [cx + a - c, cy + b], [cx - a + c, cy + b], [cx - a, cy + b - c], [cx - a, cy - b + c]];
    p.poly(oct, T[2]);
    const inn = oct.map(([x, y]) => [cx + (x - cx) * 0.6, cy + (y - cy) * 0.6]);
    p.poly([oct[0], oct[1], inn[1], inn[0]], T[4]);
    p.poly([oct[7], oct[0], inn[0], inn[7]], T[4]);
    p.poly([oct[1], oct[2], oct[3], inn[3], inn[2], inn[1]], T[2]);
    p.poly([oct[3], oct[4], oct[5], inn[5], inn[4], inn[3]], T[1]);
    p.poly([oct[5], oct[6], oct[7], inn[7], inn[6], inn[5]], T[3]);
    p.poly(inn, T[3]);
    p.line(Math.round(inn[0][0]), Math.round(inn[0][1]) + 1, Math.round(inn[1][0]) - 1, Math.round(inn[1][1]) + 1, T[5]);
  } else if (cut === 'rhombus') {
    const top = [cx, cy - H * 0.42], rt = [cx + W * 0.36, cy - H * 0.04], bt = [cx, cy + H * 0.42], lt = [cx - W * 0.36, cy - H * 0.04];
    const mid = [cx - W * 0.04, cy - H * 0.06];
    p.poly([top, rt, mid], T[3]); p.poly([top, mid, lt], T[4]); p.poly([lt, mid, bt], T[2]); p.poly([mid, rt, bt], T[1]);
    p.line(Math.round(top[0]), Math.round(top[1]) + 2, Math.round(mid[0]), Math.round(mid[1]), T[5]);
  } else if (cut === 'brilliant') {
    const R = W * 0.38;
    const ring = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 8; ring.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.92]); }
    p.poly(ring, T[3]);
    const inner = ring.map(([x, y]) => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5]);
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; p.poly([ring[i], ring[j], inner[j], inner[i]], T[[4, 5, 4, 3, 2, 1, 2, 3][i]]); }
    p.poly(inner, T[4]);
    sparkle(p, Math.round(cx - R * 0.35), Math.round(cy - R * 0.4), '#ffffff', W > 20);
  }
};

STYLES.meteor = (p, W, H, m, r) => {
  const T = tones(m.color);
  const fire = tones('#ffb84a');
  // comet trail
  axisPaint(p, W * 0.92, H * 0.08, W * 0.55, H * 0.45, W * 0.25, (t, d) => {
    const w = (1 - t) * W * 0.04 + t * W * 0.18;
    if (Math.abs(d) > w) return null;
    if (hash2(Math.round(t * 30), Math.round(d), 5) > 0.55 + t * 0.2) return null;
    return t > 0.7 ? fire[4] : fire[2];
  });
  facetDome(p, W * 0.45, H * 0.58, W * 0.34, H * 0.32, T, r, { n: 7 });
  // glowing star cracks
  let x = W * 0.3, y = H * 0.5;
  for (let k = 0; k < W * 0.5; k++) { if (p.alpha(x | 0, y | 0)) p.set(x | 0, y | 0, fire[4]); x += r.float(0.4, 1); y += r.float(-0.7, 0.9); }
  sparkle(p, Math.round(W * 0.38), Math.round(H * 0.45), '#fff6c8');
  p.set(Math.round(W * 0.58), Math.round(H * 0.66), '#ffe08a');
};

STYLES.geode = (p, W, H, m, r) => {
  const rock = tones(m.color), cr = tones(m.color2);
  const cx = W / 2, cy = H * 0.54, rx = W * 0.42, ry = H * 0.38;
  lump(p, cx, cy, rx, ry, rock, 11, { wobble: 0.22, spec: false });
  // cut face: inner cavity rings
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - cx - 0.5) / (rx * 0.8), dy = (y + 0.5 - cy + 0.5) / (ry * 0.78);
    const d = dx * dx + dy * dy;
    if (d < 1) {
      let c;
      if (d > 0.82) c = '#e8dcc8';
      else if (d > 0.62) c = cr[1];
      else { // crystals pointing inward: checker facets
        const a = Math.atan2(dy, dx);
        const f = Math.floor((a + Math.PI) / (Math.PI / 5)) + Math.floor(d * 6);
        c = cr[[2, 3, 4, 3][f & 3]];
        if (d < 0.12) c = cr[0];
      }
      p.set(x, y, c);
    }
  }
  sparkle(p, Math.round(cx - rx * 0.25), Math.round(cy - ry * 0.25), '#ffffff');
};

STYLES.fossil = (p, W, H, m, r) => {
  const T = tones(m.color), D = tones(m.color2);
  facetDome(p, W / 2, H * 0.55, W * 0.44, H * 0.38, T, r, { n: 7, h: 0.5, flat: 0.75, toneBias: 0.1 });
  // ammonite spiral relief
  const cx = W * 0.48, cy = H * 0.52;
  for (let a = 0; a < Math.PI * 5; a += 0.12) {
    const rr = 0.6 + a * W * 0.022;
    const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr * 0.9);
    if (p.alpha(x, y)) { p.set(x, y, D[1]); if (p.alpha(x - 1, y - 1)) p.set(x - 1, y - 1, T[4]); }
  }
  for (let k = 0; k < 6; k++) { const a = k * 1.05; const x = Math.round(cx + Math.cos(a) * W * 0.24), y = Math.round(cy + Math.sin(a) * W * 0.2); p.line(Math.round(cx), Math.round(cy), x, y, D[2]); }
};

STYLES.rune = (p, W, H, m, r) => {
  const T = tones(m.color), G = tones(m.color2);
  const x0 = W * 0.16, x1 = W * 0.84, y0 = H * 0.1, y1 = H * 0.9;
  for (let y = Math.round(y0); y < y1; y++) for (let x = Math.round(x0); x < x1; x++) {
    const ex = Math.min(x - x0, x1 - 1 - x), ey = Math.min(y - y0, y1 - 1 - y);
    if (ex + ey < 2) continue; // chamfer
    const i = (x < x0 + 2 || y < y0 + 2) ? 4 : (x > x1 - 3 || y > y1 - 3) ? 1 : (hash2(x, y, 2) > 0.85 ? 2 : 3);
    p.set(x, y, T[i]);
  }
  // glowing rune
  const cx = Math.round(W / 2), cy = Math.round(H / 2);
  const s = Math.max(2, Math.round(W * 0.14));
  p.vline(cx, cy - s - 1, cy + s + 1, G[4]);
  p.line(cx, cy - s, cx + s, cy - 1, G[4]);
  p.line(cx, cy, cx - s, cy + s - 1, G[4]);
  p.set(cx, cy - s - 2, G[5]);
};

STYLES.mushroom = (p, W, H, m, r) => {
  const cap = tones(m.color), stem = tones(m.id === 'glowcap' ? '#c8e8e0' : '#efe2c8');
  // stem
  for (let y = Math.round(H * 0.5); y < H * 0.92; y++) for (let x = Math.round(W * 0.4); x < W * 0.62; x++) p.set(x, y, stem[x < W * 0.48 ? 4 : x > W * 0.56 ? 2 : 3]);
  // gills
  p.hline(Math.round(W * 0.2), Math.round(W * 0.8), Math.round(H * 0.5), cap[0]);
  // cap dome
  lump(p, W * 0.5, H * 0.42, W * 0.4, H * 0.28, cap, 2, { wobble: 0.08, spec: false });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y > H * 0.49 && y < H * 0.56 && x > W * 0.12 && x < W * 0.88) { if (p.alpha(x, y) && p.get(x, y)[0] === hexToRgb(cap[3])[0]) p.clear(x, y); }
  // spots
  const spot = m.id === 'glowcap' ? '#e8fff8' : '#ffffff';
  [[0.38, 0.32], [0.6, 0.28], [0.7, 0.42], [0.3, 0.45]].forEach(([fx, fy], i) => { p.set(Math.round(W * fx), Math.round(H * fy), spot); if (i < 2 && W > 20) p.set(Math.round(W * fx) + 1, Math.round(H * fy), spot); });
  if (m.id === 'glowcap') { sparkle(p, Math.round(W * 0.82), Math.round(H * 0.18), '#9affe8'); p.set(Math.round(W * 0.18), Math.round(H * 0.2), '#9affe8'); }
};

STYLES.fang = (p, W, H, m, r) => {
  const T = tones('#efe6d0'), tip = m.color2 ? tones(m.color2) : T;
  // curved tooth along a bent axis (root bottom-left → tip top-right)
  const cx = W * 0.5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = 1 - (y + 0.5 - H * 0.08) / (H * 0.84); // 0 bottom(root) → 1 tip
    if (t < 0 || t > 1) continue;
    const bend = Math.pow(t, 2) * W * 0.22;
    const half = W * 0.2 * (1 - Math.pow(t, 1.4)) + 0.6;
    const d = x + 0.5 - (cx - W * 0.06 + bend);
    if (Math.abs(d) > half) continue;
    let i = d < -half * 0.3 ? 4 : d > half * 0.4 ? 1 : 3;
    if (t < 0.18) i = Math.max(0, i - 2); // root
    const col = t > 0.8 && m.color2 ? tip[i] : T[i];
    p.set(x, y, col);
  }
  p.set(Math.round(cx - W * 0.1), Math.round(H * 0.45), T[5]);
};

STYLES.tail = (p, W, H, m, r) => {
  const T = tones(m.color);
  const long = W > H * 1.4;
  const x0 = W * 0.08, x1 = W * 0.94;
  for (let i = 0; i < 160; i++) {
    const t = i / 159;
    const x = long ? lerp(x0, x1, t) : lerp(W * 0.15, W * 0.85, t);
    const y = long ? H * 0.5 + Math.sin(t * 7) * H * 0.22 : H * 0.85 - t * H * 0.7 + Math.sin(t * 8) * W * 0.12;
    const rr = lerp(H * (long ? 0.2 : 0.14), 0.6, t);
    for (let dy = -Math.ceil(rr); dy <= Math.ceil(rr); dy++) for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
      if (dx * dx + dy * dy > rr * rr) continue;
      const i2 = dy < -rr * 0.3 ? 4 : dy > rr * 0.3 ? 1 : 3;
      p.set(Math.round(x + dx), Math.round(y + dy), T[(Math.floor(t * 14) % 2 && i2 === 3) ? 2 : i2]);
    }
  }
};

STYLES.wing = (p, W, H, m, r) => {
  const T = tones(m.color), M = tones(m.color2 || m.color);
  const sx = W * 0.1, sy = H * 0.3;
  const tips = [[W * 0.95, H * 0.15], [W * 0.82, H * 0.8], [W * 0.55, H * 0.92], [W * 0.3, H * 0.85]];
  // membrane between finger tips with scalloped edge
  const poly = [[sx, sy], ...tips, [W * 0.12, H * 0.6]];
  p.poly(poly, M[2]);
  for (let i = 0; i < tips.length - 1; i++) { // scallops
    const [ax, ay] = tips[i], [bx, by] = tips[i + 1];
    const mx = (ax + bx) / 2 - (bx - ax) * 0.05, my = (ay + by) / 2 - H * 0.12;
    p.poly([[ax, ay], [mx, my], [bx, by]], null);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = (x - mx), v = (y - my); if (u * u + v * v < (W * 0.05) ** 2) p.clear(x, y); }
  }
  for (const [tx, ty] of tips) p.line(Math.round(sx), Math.round(sy), Math.round(tx), Math.round(ty), T[4]);
  p.line(Math.round(sx), Math.round(sy), Math.round(W * 0.95), Math.round(H * 0.15), T[5]);
  p.set(Math.round(sx), Math.round(sy) - 1, T[4]); p.set(Math.round(sx) - 1, Math.round(sy) - 1, T[3]);
};

STYLES.gel = (p, W, H, m, r) => {
  const T = tones(m.color);
  const cx = W / 2, cy = H * 0.6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - cx) / (W * 0.4), dy = (y + 0.5 - cy) / (H * 0.32);
    const top = dy < 0 ? dy * (1 + Math.sin(dx * 3) * 0.08) : dy * 1.15;
    if (dx * dx + top * top > 1 || y > H * 0.88) continue;
    const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    const i = dx * L[0] + dy * L[1] + nz * L[2];
    p.set(x, y, T[toneIdx(i + 0.1)]);
  }
  // drip + bubbles + shine
  p.vline(Math.round(cx + W * 0.24), Math.round(H * 0.82), Math.round(H * 0.92), T[2]);
  p.set(Math.round(cx - W * 0.18), Math.round(cy - H * 0.14), T[5]); p.set(Math.round(cx - W * 0.14), Math.round(cy - H * 0.18), T[5]); p.set(Math.round(cx - W * 0.22), Math.round(cy - H * 0.1), T[4]);
  p.set(Math.round(cx + W * 0.1), Math.round(cy + 1), T[4]); p.set(Math.round(cx + W * 0.05), Math.round(cy + H * 0.12), T[4]);
};

STYLES.shell = (p, W, H, m, r) => {
  const T = tones(m.color), A = tones(m.color2 || m.color);
  const cx = W / 2, cy = H * 0.52;
  if (m.id === 'snail_shell') {
    lump(p, cx, cy, W * 0.42, H * 0.38, T, 4, { wobble: 0.06, spec: false });
    for (let a = 0; a < Math.PI * 4.5; a += 0.08) {
      const rr = W * 0.38 * (1 - a / (Math.PI * 4.6));
      const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr * 0.92);
      if (p.alpha(x, y)) p.set(x, y, T[1]);
    }
    p.set(Math.round(cx - W * 0.2), Math.round(cy - H * 0.22), T[5]);
    return;
  }
  // beetle / crab carapace: oval with center split and iridescent highlight
  lump(p, cx, cy, W * 0.4, H * 0.42, T, 6, { wobble: 0.05, spec: false });
  p.vline(Math.round(cx), Math.round(cy - H * 0.38), Math.round(cy + H * 0.4), T[0]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!p.alpha(x, y)) continue;
    const dx = (x + 0.5 - cx) / (W * 0.4), dy = (y + 0.5 - cy) / (H * 0.42);
    const band = Math.abs((dx + 0.35) * (dx + 0.35) + (dy + 0.4) * (dy + 0.4) - 0.2);
    if (band < 0.06) p.set(x, y, A[4]);
  }
  p.hline(Math.round(cx - W * 0.3), Math.round(cx + W * 0.3), Math.round(cy - H * 0.3), T[1]); // pronotum line
  if (m.id === 'crab_shell') for (let i = 0; i < 4; i++) prism(p, cx + (i - 1.5) * W * 0.16, cy - H * 0.12 + Math.abs(i - 1.5) * 2, W * 0.1, H * 0.26, tones(m.color2), (i - 1.5) * 0.8, { glow: true });
};

STYLES.claw = (p, W, H, m, r) => {
  const T = tones(lumOf(m.color) < 0.3 ? mixHex(m.color, m.color2 || '#c8a060', 0.5) : m.color), C = tones(m.color2 || m.color);
  // curved hook: inside an outer circle, outside a shifted inner circle → tapering crescent
  const hook = (cx, cy, R, flip) => {
    const icx = cx + R * 0.28 * flip, icy = cy + R * 0.32;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > R * R) continue;
      const ix = x + 0.5 - icx, iy = y + 0.5 - icy;
      if (ix * ix + iy * iy < (R * 0.74) ** 2) continue;
      if (dy > R * 0.45) continue; // open bottom
      const ang = Math.atan2(dy, dx * flip);
      const tip = ang > 0.2 && ang < Math.PI * 0.5; // trailing end
      const lit = dx * L[0] + dy * L[1] < 0 ? 1 : 0;
      const tone = Math.hypot(dx, dy) > R - 1.3 ? (lit ? 4 : 2) : (lit ? 3 : 1);
      p.set(x, y, ((dy > 0 && dx * flip > 0) || tip ? C : T)[tone]);
    }
  };
  if (m.id === 'mandible') { hook(W * 0.62, H * 0.5, W * 0.36, -1); hook(W * 0.38, H * 0.62, W * 0.36, 1); }
  else if (m.id === 'mole_claw') { hook(W * 0.3, H * 0.58, W * 0.26, 1); hook(W * 0.5, H * 0.5, W * 0.3, 1); hook(W * 0.7, H * 0.58, W * 0.26, 1); }
  else hook(W * 0.5, H * 0.56, W * 0.42, 1);
  if (m.id === 'crystal_claw') sparkle(p, Math.round(W * 0.28), Math.round(H * 0.3), '#ffffff');
};

STYLES.silk = (p, W, H, m, r) => {
  const T = tones(m.color);
  lump(p, W / 2, H * 0.55, W * 0.38, H * 0.36, T, 1, { wobble: 0.05, spec: false });
  // wound threads
  for (let k = 0; k < 6; k++) {
    const a = k * 0.55 - 0.6;
    for (let s = -1; s <= 1; s += 0.04) {
      const x = W / 2 + Math.cos(a) * s * W * 0.36 - Math.sin(a) * W * 0.06 * Math.sin(s * 3);
      const y = H * 0.55 + Math.sin(a) * s * H * 0.34 + Math.cos(a) * H * 0.05;
      if (p.alpha(Math.round(x), Math.round(y))) p.set(Math.round(x), Math.round(y), k % 2 ? T[2] : T[4]);
    }
  }
  // loose strand
  p.line(Math.round(W * 0.8), Math.round(H * 0.4), Math.round(W * 0.95), Math.round(H * 0.12), T[4]);
  p.set(Math.round(W * 0.35), Math.round(H * 0.35), T[5]);
};

STYLES.core = (p, W, H, m, r) => {
  const lava = m.id === 'lava_core';
  const shell = tones(lava ? m.color2 : m.color2 || '#5a4a3a'), glow = tones(m.color);
  const cx = W / 2, cy = H / 2;
  if (lava) lump(p, cx, cy, W * 0.4, H * 0.4, shell, 5, { wobble: 0.25, spec: false });
  else facetDome(p, cx, cy + H * 0.04, W * 0.42, H * 0.4, shell, r, { n: 8, h: 0.9 });
  // glowing cracks / core
  for (let k = 0; k < 4; k++) {
    let x = cx, y = cy; const a = k * 1.6 + r.float(-0.3, 0.3);
    for (let s = 0; s < W * 0.4; s++) { x += Math.cos(a) * 0.8 + r.float(-0.5, 0.5); y += Math.sin(a) * 0.8 + r.float(-0.5, 0.5); if (p.alpha(Math.round(x), Math.round(y))) p.set(Math.round(x), Math.round(y), glow[s < W * 0.15 ? 5 : 4]); }
  }
  lump(p, cx, cy, W * 0.12, H * 0.12, glow, 8, { wobble: 0.1, bias: 0.6 });
  p.set(Math.round(cx), Math.round(cy), '#fffbe0');
};

STYLES.essence = (p, W, H, m, r) => {
  const T = tones(m.color);
  const cx = W / 2, cy = H * 0.62;
  // flickering wisp tail
  for (let y = 0; y < cy; y++) for (let x = 0; x < W; x++) {
    const v = 1 - y / cy; // 0 at orb → 1 at top
    const sway = Math.sin(v * 4.2) * W * 0.12 * v;
    const half = W * 0.26 * (1 - v) * (1 - v) + 0.4;
    if (Math.abs(x + 0.5 - cx - sway) > half || v > 0.95) continue;
    p.set(x, y, T[v > 0.6 ? 2 : v > 0.3 ? 3 : 4]);
  }
  lump(p, cx, cy, W * 0.3, H * 0.28, T, 5, { wobble: 0.04, bias: 0.55 });
  lump(p, cx - W * 0.04, cy - H * 0.03, W * 0.12, H * 0.11, tones('#ffffff'), 6, { wobble: 0, bias: 0.6, spec: false });
  sparkle(p, Math.round(W * 0.16), Math.round(H * 0.4), '#ffffff');
  p.set(Math.round(W * 0.84), Math.round(H * 0.3), T[5]);
};

STYLES.sac = (p, W, H, m, r) => {
  const T = tones(m.color), V = tones(m.color2 || m.color);
  lump(p, W * 0.5, H * 0.58, W * 0.36, H * 0.32, T, 7, { wobble: 0.2 });
  // stalk + veins
  p.vline(Math.round(W * 0.52), Math.round(H * 0.12), Math.round(H * 0.3), T[1]); p.set(Math.round(W * 0.53), Math.round(H * 0.12), T[2]);
  for (let k = 0; k < 3; k++) { let x = W * 0.5, y = H * 0.38; for (let s = 0; s < 8; s++) { x += (k - 1) * 0.9 + r.float(-0.4, 0.4); y += 0.7; if (p.alpha(Math.round(x), Math.round(y))) p.set(Math.round(x), Math.round(y), T[1]); } }
  // glowing liquid drop
  p.set(Math.round(W * 0.64), Math.round(H * 0.94), V[4]); p.set(Math.round(W * 0.64), Math.round(H * 0.97), V[3]);
  p.set(Math.round(W * 0.4), Math.round(H * 0.62), V[4]); p.set(Math.round(W * 0.42), Math.round(H * 0.66), V[3]);
};

STYLES.dust = (p, W, H, m, r) => {
  const T = tones(m.color), S = tones(m.color2 || m.color);
  // tiny cloth pouch with dust spilling out
  lump(p, W * 0.42, H * 0.6, W * 0.26, H * 0.26, tones('#8a6a8a'), 3, { wobble: 0.15 });
  p.hline(Math.round(W * 0.3), Math.round(W * 0.54), Math.round(H * 0.38), '#4a2a4a');
  p.set(Math.round(W * 0.42), Math.round(H * 0.33), '#c0a0c0'); p.set(Math.round(W * 0.38), Math.round(H * 0.32), '#c0a0c0');
  for (let i = 0; i < 26; i++) {
    const x = Math.round(W * (0.55 + r.float(0, 0.35))), y = Math.round(H * (0.62 + r.float(-0.08, 0.3)));
    p.set(x, y, (i % 3 ? T : S)[r.int(3, 5)]);
  }
  sparkle(p, Math.round(W * 0.78), Math.round(H * 0.32), '#ffffff');
  p.set(Math.round(W * 0.66), Math.round(H * 0.18), T[5]);
};

STYLES.scale = (p, W, H, m, r) => {
  const T = tones(m.color), A = tones(m.color2 || m.color);
  // one big leaf-shaped scale (a fan of three for the wyrm's larger plate)
  const leaf = (cx, top, w, h, ridge) => {
    for (let y = Math.floor(top); y < top + h; y++) for (let x = Math.floor(cx - w / 2) - 1; x <= cx + w / 2 + 1; x++) {
      const v = (y + 0.5 - top) / h; // 0 top → 1 tip
      const half = (v < 0.35 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.35 - v) / 0.35, 2))) : 1 - Math.pow((v - 0.35) / 0.65, 1.3)) * w / 2;
      const d = x + 0.5 - cx;
      if (Math.abs(d) > half) continue;
      const u = d / Math.max(0.5, half);
      let i = u < -0.45 ? 4 : u > 0.5 ? 1 : 3;
      if (v < 0.12) i = Math.min(5, i + 1);
      if (Math.abs(d - ridge * (0.5 - v)) < 0.6 && v > 0.08 && v < 0.85) i = 5;
      const growth = Math.abs((v * h) % 5 - 4.2) < 0.5 && v > 0.2 && v < 0.8 && i !== 5;
      p.set(x, y, growth ? T[Math.max(1, i - 1)] : (i === 5 ? A[4] : T[i]));
    }
  };
  if (m.id === 'wyrm_scale') {
    leaf(W * 0.22, H * 0.02, W * 0.4, H * 0.66, 1);
    leaf(W * 0.78, H * 0.02, W * 0.4, H * 0.66, -1);
    leaf(W * 0.5, H * 0.22, W * 0.52, H * 0.78, 0);
  } else leaf(W * 0.5, H * 0.06, W * 0.7, H * 0.9, 0);
  sparkle(p, Math.round(W * 0.38), Math.round(H * 0.24), T[5]);
};

STYLES.bone = (p, W, H, m, r) => {
  const T = tones(m.color);
  const long = W > H * 1.4;
  const [x0, y0, x1, y1] = long ? [W * 0.16, H * 0.5, W * 0.84, H * 0.5] : [W * 0.2, H * 0.8, W * 0.8, H * 0.2];
  const kr = long ? H * 0.2 : W * 0.13;
  axisPaint(p, x0, y0, x1, y1, kr * 2, (t, d) => (Math.abs(d) < kr * 0.55 && t > 0 && t < 1 ? T[d < -kr * 0.15 ? 4 : d > kr * 0.25 ? 2 : 3] : null));
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), px = -dy / len, py = dx / len;
  for (const [ex, ey] of [[x0, y0], [x1, y1]]) for (const s of [-1, 1]) {
    lump(p, ex + px * s * kr * 0.75, ey + py * s * kr * 0.75, kr, kr, T, s * 3 + ex, { wobble: 0.05, spec: s < 0 });
  }
};

STYLES.skull = (p, W, H, m, r) => {
  const T = tones(m.color);
  lump(p, W * 0.5, H * 0.42, W * 0.38, H * 0.34, T, 2, { wobble: 0.04, spec: false });
  // jaw
  for (let y = Math.round(H * 0.62); y < H * 0.9; y++) for (let x = Math.round(W * 0.3); x < W * 0.7; x++) p.set(x, y, T[x < W * 0.4 ? 3 : 2]);
  // eye sockets
  const eye = (cx) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x + 0.5 - cx) / (W * 0.11), dy = (y + 0.5 - H * 0.46) / (H * 0.11); if (dx * dx + dy * dy < 1) p.set(x, y, '#241818'); } };
  eye(W * 0.36); eye(W * 0.64);
  p.set(Math.round(W * 0.5), Math.round(H * 0.6), '#241818'); p.set(Math.round(W * 0.5) - 1, Math.round(H * 0.62), '#241818');
  for (let x = Math.round(W * 0.34); x < W * 0.68; x += 2) p.vline(x, Math.round(H * 0.72), Math.round(H * 0.82), T[1]);
  p.set(Math.round(W * 0.3), Math.round(H * 0.2), T[5]); p.set(Math.round(W * 0.34), Math.round(H * 0.17), T[5]);
};

STYLES.tongue = (p, W, H, m, r) => {
  const T = tones(m.color);
  const long = W > H * 1.4;
  for (let i = 0; i < 140; i++) {
    const t = i / 139;
    const x = long ? lerp(W * 0.06, W * 0.86, t) : lerp(W * 0.2, W * 0.75, t);
    const y = long ? H * 0.5 + Math.sin(t * 5 + 0.5) * H * 0.18 : H * 0.8 - t * H * 0.55 + Math.sin(t * 6) * W * 0.08;
    const rr = (long ? H * 0.26 : W * 0.15) * (t < 0.85 ? 1 : 1 - (t - 0.85) * 4);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= rr * rr) p.set(Math.round(x + dx), Math.round(y + dy), T[dy < -rr * 0.35 ? 4 : dy > rr * 0.4 ? 1 : 3]);
  }
  // center groove + fork tip
  for (let i = 0; i < 100; i++) { const t = i / 99; const x = long ? lerp(W * 0.1, W * 0.8, t) : lerp(W * 0.22, W * 0.7, t); const y = long ? H * 0.5 + Math.sin(t * 5 + 0.5) * H * 0.18 : H * 0.8 - t * H * 0.55 + Math.sin(t * 6) * W * 0.08; if (i % 3 !== 0) p.set(Math.round(x), Math.round(y), T[2]); }
};

STYLES.teeth = (p, W, H, m, r) => {
  const G = tones('#c84a6a'), T = tones(m.color);
  // gum arc
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / (W * 0.44), dy = (y + 0.5 - H * 0.3) / (H * 0.5);
    const d = dx * dx + dy * dy;
    if (d < 1 && d > 0.45 && y > H * 0.2) p.set(x, y, G[dy < 0.6 ? 3 : 2]);
  }
  // teeth along arc
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (0.12 + k * 0.127);
    const bx = W / 2 + Math.cos(a) * W * 0.36, by = H * 0.3 + Math.sin(a) * H * 0.38;
    const tl = H * (k === 0 || k === 6 ? 0.26 : 0.2);
    for (let s = 0; s < tl; s++) { const w2 = Math.max(0, 1.5 - s * 0.35); for (let o = -Math.ceil(w2); o <= Math.ceil(w2); o++) p.set(Math.round(bx + o), Math.round(by - s), T[o < 0 ? 4 : o > 0 ? 2 : 3]); }
  }
};

STYLES.plate = (p, W, H, m, r) => {
  const T = tones(m.color), G = tones(m.color2);
  const x0 = W * 0.12, x1 = W * 0.88;
  for (let y = Math.round(H * 0.12); y < H * 0.9; y++) for (let x = Math.round(x0); x < x1; x++) {
    const ny = (y - H * 0.12) / (H * 0.78);
    const curve = Math.sin(((x - x0) / (x1 - x0)) * Math.PI);
    if (ny > 0.75 && Math.abs(x - W / 2) > W * 0.38 * (1 - (ny - 0.75) * 2.5)) continue;
    const i = x < x0 + 2 || y < H * 0.12 + 2 ? 4 : curve > 0.9 ? 3 : curve > 0.5 ? 2 : 1;
    p.set(x, y, T[i]);
  }
  for (const [fx, fy] of [[0.22, 0.22], [0.78, 0.22], [0.22, 0.7], [0.78, 0.7]]) { p.set(Math.round(W * fx), Math.round(H * fy), T[5]); p.set(Math.round(W * fx) + 1, Math.round(H * fy) + 1, T[0]); }
  // curse rune
  const cx = Math.round(W / 2), cy = Math.round(H * 0.46);
  p.vline(cx, cy - 3, cy + 3, G[4]); p.hline(cx - 2, cx + 2, cy - 1, G[4]); p.set(cx - 2, cy + 2, G[3]); p.set(cx + 2, cy + 2, G[3]);
};

STYLES.eye = (p, W, H, m, r) => {
  const iris = tones(m.color), sc = tones(m.id === 'warden_eye' ? '#c8a040' : '#5a6a6a');
  if (m.id === 'warden_eye') { // golden setting
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x + 0.5 - W / 2) / (W * 0.46), dy = (y + 0.5 - H / 2) / (H * 0.4); const d = dx * dx + dy * dy; if (d < 1 && d > 0.62) p.set(x, y, sc[dy < 0 ? 4 : 2]); }
  } else lump(p, W / 2, H / 2, W * 0.42, H * 0.38, sc, 4, { wobble: 0.15, spec: false });
  lump(p, W / 2, H / 2, W * 0.3, H * 0.28, tones('#f0f0e8'), 5, { wobble: 0.02, spec: false });
  lump(p, W / 2 + W * 0.03, H / 2, W * 0.17, H * 0.19, iris, 6, { wobble: 0.02, spec: false, bias: 0.3 });
  p.vline(Math.round(W / 2 + W * 0.03), Math.round(H / 2 - H * 0.12), Math.round(H / 2 + H * 0.12), '#141010');
  p.set(Math.round(W / 2 - W * 0.06), Math.round(H / 2 - H * 0.08), '#ffffff');
};

STYLES.lantern = (p, W, H, m, r) => {
  const G = tones(m.color), F = tones('#5a3a2a');
  const x0 = Math.round(W * 0.28), x1 = Math.round(W * 0.72), y0 = Math.round(H * 0.3), y1 = Math.round(H * 0.84);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) p.set(x, y, G[Math.max(2, 5 - Math.round(Math.hypot(x - W / 2, y - H * 0.58) / (W * 0.08)))]);
  for (let y = y0; y < y1; y++) { p.set(x0, y, F[2]); p.set(x1 - 1, y, F[1]); p.set(Math.round(W / 2), y, F[2]); }
  p.hline(x0 - 1, x1, y0 - 1, F[3]); p.hline(x0 - 1, x1, y1, F[1]); p.hline(x0, x1 - 1, y0 - 2, F[2]);
  // handle
  for (let a = 0; a <= Math.PI; a += 0.15) p.set(Math.round(W / 2 + Math.cos(a) * W * 0.16), Math.round(y0 - 3 - Math.sin(a) * H * 0.14), F[3]);
  p.set(Math.round(W / 2), Math.round(H * 0.6), '#fffbe0');
};

STYLES.feather = (p, W, H, m, r) => {
  const T = tones(m.color), D = tones(m.color2 || m.color);
  const tall = H >= W;
  const [x0, y0, x1, y1] = tall ? [W * 0.5, H * 0.95, W * 0.5, H * 0.05] : W > H * 1.4 ? [W * 0.05, H * 0.5, W * 0.95, H * 0.5] : [W * 0.15, H * 0.88, W * 0.85, H * 0.12];
  axisPaint(p, x0, y0, x1, y1, Math.max(W, H) * 0.3, (t, d, len) => {
    if (t < 0.12) return Math.abs(d) < 0.8 ? T[1] : null;
    const width = Math.sin(((t - 0.12) / 0.88) * Math.PI * 0.95) * (tall ? W : Math.min(W, H)) * 0.32;
    if (Math.abs(d) > width) return null;
    if (Math.abs(d) < 0.6) return T[5];
    const barb = Math.floor((t * len + Math.abs(d) * 0.8) / 2) % 3 === 0;
    const band = Math.floor(t * 6) % 2 === 1;
    return (band ? D : T)[d < 0 ? (barb ? 3 : 4) : (barb ? 1 : 2)];
  });
};

STYLES.gear = (p, W, H, m, r) => {
  const T = tones(m.color), cx = W / 2, cy = H / 2, R = W * 0.4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const tooth = Math.cos(a * 8) > 0.2 ? R : R * 0.8;
    if (d > tooth || d < R * 0.25) continue;
    const nx = dx / R, ny = dy / R;
    let i = toneIdx(nx * L[0] + ny * L[1] + 0.5);
    if (d > R * 0.72 && d < R * 0.8) i = 1;
    p.set(x, y, T[i]);
  }
  // spokes holes + glowing hub
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; lump(p, cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, R * 0.12, R * 0.12, tones('#2a1a14'), k, { spec: false, wobble: 0 }); }
  lump(p, cx, cy, R * 0.2, R * 0.2, tones(m.color2), 3, { wobble: 0, bias: 0.4 });
};

STYLES.heart = (p, W, H, m, r) => {
  const T = tones(m.color), G = tones(m.color2);
  const cx = W / 2, cy = H * 0.5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = (x + 0.5 - cx) / (W * 0.42), Y = -(y + 0.5 - cy) / (H * 0.42) + 0.25;
    const v = Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y;
    if (v > 0) continue;
    // facet shading by quadrant
    const f = X < 0 ? (Y > 0.2 ? 4 : 3) : (Y > 0.2 ? 2 : 1);
    p.set(x, y, T[f]);
  }
  lump(p, cx, cy + H * 0.04, W * 0.13, H * 0.13, G, 9, { wobble: 0.05, bias: 0.5 });
  sparkle(p, Math.round(cx - W * 0.2), Math.round(cy - H * 0.2), '#ffffff');
};

STYLES.crown = (p, W, H, m, r) => {
  const T = tones(m.color), M = tones(m.color2);
  const wide = W > H * 1.4;
  const n = wide ? 5 : 3;
  // curved band
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W;
    const curve = Math.sin(u * Math.PI) * H * 0.08;
    const top = H * 0.58 + curve, bot = H * 0.84 + curve;
    if (x < W * 0.08 || x > W * 0.92 || y < top || y > bot) continue;
    p.set(x, y, T[y < top + 1.5 ? 4 : y > bot - 1.5 ? 1 : u < 0.35 ? 3 : 2]);
  }
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const x = W * 0.08 + u * W * 0.84;
    const base = H * 0.6 + Math.sin(u * Math.PI) * H * 0.08;
    const tall = (k === (n - 1) / 2 ? 0.42 : 0.3) * H;
    for (let y = Math.round(base - tall); y < base; y++) { p.set(Math.round(x), y, '#efe2c8'); p.set(Math.round(x) + 1, y, '#c8b898'); }
    lump(p, x + 0.5, base - tall, W * (wide ? 0.07 : 0.12), H * 0.1, M, k * 3, { wobble: 0.05 });
    p.set(Math.round(x - 1), Math.round(base - tall - 1), '#ffffff');
  }
  for (let k = 0; k < n * 2; k++) { const u = (k + 0.5) / (n * 2); p.set(Math.round(W * 0.08 + u * W * 0.84), Math.round(H * 0.71 + Math.sin(u * Math.PI) * H * 0.08), k % 2 ? M[4] : '#ffe08a'); }
};

STYLES.key = (p, W, H, m, r) => {
  const T = tones(m.color);
  // ring bow (top-left) + shaft diagonal + bit
  const bx = W * 0.3, by = H * 0.32, br = W * 0.2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
    if (d < br && d > br * 0.45) { const a = Math.atan2(y - by, x - bx); p.set(x, y, T[a < -0.5 && a > -2.8 ? 4 : a > 0.6 && a < 2.6 ? 2 : 3]); }
  }
  axisPaint(p, bx + br * 0.6, by + br * 0.6, W * 0.86, H * 0.86, 3, (t, d) => (Math.abs(d) < 1.4 && t > 0 && t < 1 ? T[d < 0 ? 4 : 2] : null));
  // bit teeth
  const tx = W * 0.72, ty = H * 0.72;
  for (let k = 0; k < 2; k++) { const ox = tx + k * W * 0.08, oy = ty + k * H * 0.08; p.set(Math.round(ox + 2), Math.round(oy - 1), T[3]); p.set(Math.round(ox + 3), Math.round(oy - 2), T[2]); p.set(Math.round(ox + 2), Math.round(oy - 2), T[3]); }
  if (m.id === 'crystal_key') sparkle(p, Math.round(bx - br * 0.5), Math.round(by - br * 0.6), '#ffffff');
  if (m.id === 'bone_key') p.set(Math.round(bx), Math.round(by), m.color2);
  if (m.id === 'golden_key') { p.set(Math.round(bx - br * 0.55), Math.round(by - br * 0.3), '#ffffff'); }
  if (m.id === 'rusty_key') for (let i = 0; i < 6; i++) { const x = Math.round(r.float(W * 0.15, W * 0.85)), y = Math.round(r.float(H * 0.15, H * 0.85)); if (p.alpha(x, y)) p.set(x, y, m.color2); }
};

function scrollArt(p, W, H, m, r, recipe) {
  const P = tones('#ecd8a8'), C = tones(m.color);
  const tall = H > W * 1.2;
  // draw horizontally (rolls left & right) in a box, rotate the result for tall shapes
  const bw = tall ? H : W, bh = tall ? W : H;
  const q = new Painter(bw, bh);
  const y0 = Math.round(bh * 0.26), y1 = Math.round(bh * 0.76);
  const rollW = Math.max(4, Math.round(bw * 0.2));
  const x0 = Math.round(bw * 0.08) + rollW, x1 = Math.round(bw * 0.92) - rollW;
  // sheet
  for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0; x < x1; x++) q.set(x, y, P[y === y0 + 1 ? 4 : y > y1 - 3 ? 2 : hash2(x, y, 6) > 0.88 ? 2 : 3]);
  // ink lines
  for (let y = y0 + 3, n = 0; y < y1 - 3 && n < 3; y += 3, n++) q.hline(x0 + 2, Math.round(x1 - 3 - hash2(y, 1, 2) * (bw * 0.18)), y, P[2]);
  // rolls (cylinders) at both ends, taller than the sheet
  for (const [rx0, flip] of [[x0 - rollW, 0], [x1, 1]]) {
    for (let y = y0 - 2; y <= y1 + 1; y++) for (let x = 0; x < rollW; x++) {
      const t = x / (rollW - 1);
      let i = t < 0.25 ? 4 : t < 0.6 ? 3 : t < 0.85 ? 2 : 1;
      if (y === y0 - 2 || y === y1 + 1) i = Math.max(0, i - 1);
      if ((x === 0 || x === rollW - 1) && (y === y0 - 2 || y === y1 + 1)) continue;
      q.set(rx0 + x, y, P[i]);
    }
    // spiral end caps
    q.set(rx0 + Math.floor(rollW / 2), y0 - 2, P[0]); q.set(rx0 + Math.floor(rollW / 2), y1 + 1, P[0]);
    // shadow cast by the roll onto the sheet
    const sx = flip ? rx0 - 1 : rx0 + rollW;
    for (let y = y0 + 1; y < y1 - 1; y++) q.set(sx, y, P[1]);
  }
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
  if (recipe) {
    // hammer stamp + red ribbon tied around
    q.vline(x1 - 3, y0, y1 - 1, '#c83a3a'); q.vline(x1 - 2, y0, y1 - 1, '#9a1f2e');
    q.set(x1 - 4, y1, '#c83a3a'); q.set(x1 - 1, y1 + 1, '#9a1f2e');
    q.rect(cx - 3, cy - 2, 6, 2, '#5b6170'); q.hline(cx - 3, cx + 2, cy - 2, '#9aa3b2'); q.vline(cx, cy, cy + 3, '#8a5a33');
  } else {
    // glowing rune + wax seal in the rune's colour
    q.vline(cx - 2, cy - 2, cy + 2, C[4]); q.line(cx - 2, cy - 2, cx, cy, C[4]); q.line(cx, cy, cx + 2, cy - 2, C[4]); q.vline(cx + 2, cy - 2, cy + 2, C[4]);
    q.set(cx, cy - 3, C[5]);
    lump(q, x1 - 1, y1 - 1, Math.max(2, bh * 0.12), Math.max(2, bh * 0.12), C, 4, { wobble: 0.1, bias: 0.2 });
  }
  const c = tall ? rotate90(q.toCanvas(), 1) : q.toCanvas();
  p.blit(c, 0, 0);
}
STYLES.scroll = (p, W, H, m, r) => scrollArt(p, W, H, m, r, false);
STYLES.recipe = (p, W, H, m, r) => scrollArt(p, W, H, m, r, true);

STYLES.bomb = (p, W, H, m, r) => {
  const T = tones('#3a3a40');
  lump(p, W * 0.46, H * 0.6, W * 0.32, H * 0.32, T, 2, { wobble: 0.03 });
  p.rect(Math.round(W * 0.56), Math.round(H * 0.24), Math.round(W * 0.12), Math.round(H * 0.1), '#7a7a84');
  // fuse + spark
  p.line(Math.round(W * 0.62), Math.round(H * 0.22), Math.round(W * 0.74), Math.round(H * 0.1), '#c8a060');
  sparkle(p, Math.round(W * 0.78), Math.round(H * 0.08), '#ffe08a');
  p.set(Math.round(W * 0.78), Math.round(H * 0.08), '#ff4a2a');
  // warning band
  for (let x = Math.round(W * 0.2); x < W * 0.72; x++) { const y = Math.round(H * 0.62); if (p.alpha(x, y)) p.set(x, y, '#c83a2a'); }
};

STYLES.drill = (p, W, H, m, r) => {
  const B = tones(m.color), Y = tones(m.color2);
  const tall = H > W * 1.2;
  if (!tall) {
    axisPaint(p, W * 0.12, H * 0.82, W * 0.9, H * 0.12, W * 0.3, (t, d) => {
      if (t < 0.45) return Math.abs(d) < W * 0.16 ? Y[d < -1 ? 4 : d > 2 ? 1 : 3] : null;
      const w = (1 - t) * W * 0.3;
      if (Math.abs(d) > w) return null;
      return B[(Math.floor(t * 30 + d * 0.8) % 3 === 0) ? 1 : d < 0 ? 4 : 2];
    });
    return;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = y / H;
    if (t < 0.45) { if (Math.abs(x + 0.5 - W / 2) < W * 0.3) p.set(x, y, Y[x < W * 0.4 ? 4 : x > W * 0.62 ? 1 : 3]); continue; }
    const w = (1 - t) * W * 0.6;
    if (Math.abs(x + 0.5 - W / 2) > w) continue;
    p.set(x, y, B[(Math.floor(y * 0.7 + (x - W / 2) * 0.6) % 3 === 0) ? 1 : x < W / 2 ? 4 : 2]);
  }
  p.rect(Math.round(W * 0.3), Math.round(H * 0.08), Math.round(W * 0.4), 2, '#2a2a2a');
};

STYLES.scanner = (p, W, H, m, r) => {
  const B = tones(m.color), S = tones(m.color2);
  const x0 = W * 0.08, x1 = W * 0.92, y0 = H * 0.18, y1 = H * 0.82;
  for (let y = Math.round(y0); y < y1; y++) for (let x = Math.round(x0); x < x1; x++) p.set(x, y, B[y < y0 + 2 ? 4 : y > y1 - 2 ? 1 : 3]);
  const sx0 = Math.round(x0 + 3), sx1 = Math.round(x0 + (x1 - x0) * 0.6), sy0 = Math.round(y0 + 3), sy1 = Math.round(y1 - 3);
  p.rect(sx0, sy0, sx1 - sx0, sy1 - sy0, S[1]);
  for (let x = sx0; x < sx1; x++) p.set(x, Math.round((sy0 + sy1) / 2 + Math.sin(x * 1.3) * 1.5), S[4]);
  p.set(sx1 - 2, sy0 + 1, S[5]);
  // buttons
  p.set(Math.round(x1 - 4), Math.round(y0 + 4), '#ff4a4a'); p.set(Math.round(x1 - 4), Math.round(y0 + 7), '#ffd23a');
};

STYLES.radar = (p, W, H, m, r) => {
  const B = tones(m.color), G = tones(m.color2);
  lump(p, W / 2, H / 2, W * 0.4, H * 0.4, B, 3, { wobble: 0, spec: false });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2);
    if (d < W * 0.32) p.set(x, y, Math.abs(d - W * 0.16) < 0.6 || Math.abs(d - W * 0.28) < 0.5 ? G[2] : G[0]);
  }
  p.line(Math.round(W / 2), Math.round(H / 2), Math.round(W * 0.74), Math.round(H * 0.28), G[5]);
  p.set(Math.round(W * 0.38), Math.round(H * 0.62), '#ffffff'); p.set(Math.round(W * 0.38) + 1, Math.round(H * 0.62), G[4]);
};

STYLES.flare = (p, W, H, m, r) => {
  const R = tones(m.color);
  axisPaint(p, W * 0.28, H * 0.86, W * 0.62, H * 0.28, W * 0.2, (t, d) => (Math.abs(d) < W * 0.11 && t > 0 && t < 1 ? R[d < -1 ? 4 : d > 1 ? 1 : 3] : null));
  for (let i = 0; i < 3; i++) { const t = 0.3 + i * 0.22; p.set(Math.round(lerp(W * 0.28, W * 0.62, t)), Math.round(lerp(H * 0.86, H * 0.28, t)), '#fff6e0'); }
  lump(p, W * 0.68, H * 0.2, W * 0.12, H * 0.12, tones('#ffe08a'), 1, { bias: 0.5, wobble: 0.3 });
  sparkle(p, Math.round(W * 0.7), Math.round(H * 0.18), '#ffffff', true);
};

// fallbacks for any style not listed
const FALLBACK = (p, W, H, m, r) => STYLES.chunk(p, W, H, m, r);

/** Draw a material's art in a W×H box (margins handled by caller). */
function paintMaterial(m, W, H) {
  const p = new Painter(W, H);
  const r = new RNG('spr:' + m.id);
  (STYLES[m.sprite] || FALLBACK)(p, W, H, m, r);
  finish(p, outlineOf(m.sprite === 'gem' || m.sprite === 'crystal' ? shadeHex(m.color, -0.3) : m.color));
  // rarity glints
  const ro = { rare: 1, epic: 2, legendary: 3 }[m.rarity] || 0;
  if (ro && W >= 18 && m.kind !== 'tool') {
    const r2 = new RNG('glint:' + m.id);
    for (let i = 0; i < ro; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = r2.int(2, W - 3), y = r2.int(2, Math.floor(H * 0.6));
        if (p.alpha(x, y) && p.alpha(x, y - 2) && p.alpha(x - 1, y)) { sparkle(p, x, y, m.rarity === 'legendary' ? '#fff6c8' : '#ffffff'); break; }
      }
    }
  }
  return p;
}

// ------------------------------------------------------------------ PUBLIC: materials & items
export function materialSprite(id, size = 24) {
  return memo(`mat|${id}|${size}`, () => {
    const m = MATERIALS[id];
    if (!m) return makeCanvas(size, size);
    const pad = 1;
    const art = paintMaterial(m, size - pad * 2, size - pad * 2);
    const p = new Painter(size, size);
    p.blit(art, pad, pad);
    return p.toCanvas();
  });
}

/** Item art sized to its polyomino (rot 0 base, then rotated). Transparent outside occupied cells. */
export function itemSprite(id, cell = 20, rot = 0) {
  return memo(`item|${id}|${cell}|${rot}`, () => {
    const m = MATERIALS[id];
    const shapeId = (m && m.shape) || 'o1';
    const cells = SHAPES[shapeId] || SHAPES.o1;
    const { w, h } = cellsSize(cells);
    const W = w * cell, H = h * cell;
    const p = new Painter(W, H);
    if (shapeId === 'pick') {
      p.blit(weaponSprite({ bp: 'pickaxe', ids: [id], el: {}, grade: 1 }, Math.min(W, H)), Math.round((W - Math.min(W, H)) / 2), 0);
    } else {
      const inset = Math.max(1, Math.round(cell * 0.06));
      const art = paintMaterial(m, W - inset * 2, H - inset * 2);
      p.blit(art, inset, inset);
    }
    // mask to occupied cells (rectangles are untouched)
    const occ = new Set(cells.map(([x, y]) => x + ',' + y));
    if (occ.size !== w * h) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!occ.has(Math.floor(x / cell) + ',' + Math.floor(y / cell))) p.clear(x, y);
    const c = p.toCanvas();
    return rot ? rotate90(c, rot) : c;
  });
}

// ------------------------------------------------------------------ WEAPONS
const METAL_PRIORITY = ['stariron', 'mithril', 'magmasteel', 'cursedore', 'gold', 'silver', 'bronze_ancient', 'obsidian', 'iron', 'lodestone', 'copper', 'tin', 'junk'];
const BLADE_COLOR = {
  stariron: '#4a4a8a', mithril: '#9ae8ff', magmasteel: '#ff7a3a', cursedore: '#8a4ac0', gold: '#ffd04a', silver: '#e8eef8',
  bronze_ancient: '#c89a4a', obsidian: '#3a2a4a', iron: '#a8acb4', lodestone: '#5a5a6a', copper: '#d88a4a', tin: '#c4c8d0', junk: '#8a7a6a',
  steel: '#c8d2de', bronze: '#d0a050', electrum: '#f0e08a',
};
const EL_COLOR = { fire: '#ff7a2a', ice: '#9af0ff', shock: '#ffe74a', poison: '#8fe04a', curse: '#c86bff', holy: '#fff3b0', bleed: '#ff4f6a' };

function weaponLook(w) {
  const ids = w.ids || [];
  const has = (id) => ids.includes(id);
  let blade = null;
  if (has('iron') && has('coal')) blade = 'steel';
  else if (has('gold') && has('silver')) blade = 'electrum';
  else if ((has('copper') && has('tin'))) blade = 'bronze';
  if (!blade) blade = METAL_PRIORITY.find(has) || null;
  let bladeHex = blade ? BLADE_COLOR[blade] : null;
  const gem = ids.find((id) => MATERIALS[id] && MATERIALS[id].kind === 'gem');
  const crystal = ids.find((id) => MATERIALS[id] && MATERIALS[id].kind === 'crystal');
  const boneish = ids.find((id) => MATERIALS[id] && MATERIALS[id].tags.includes('bone'));
  if (!bladeHex) bladeHex = gem ? MATERIALS[gem].color : crystal ? MATERIALS[crystal].color : boneish ? '#e8dcc0' : ids[0] && MATERIALS[ids[0]] ? MATERIALS[ids[0]].color : '#a8acb4';
  let grip = '#6a3a22';
  if (has('spider_silk')) grip = '#f0f0ff';
  else if (has('rat_tail') || has('mimic_tongue') || has('toad_tongue')) grip = '#c86a8a';
  else if (has('bat_wing')) grip = '#3a2a3a';
  else if (has('salamander_scale') || has('wyrm_scale')) grip = '#a83a2a';
  else if (boneish) grip = '#d8cca8';
  const fangs = ids.filter((id) => MATERIALS[id] && MATERIALS[id].tags.includes('fang')).length;
  const els = Object.entries(w.el || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return {
    blade: bladeHex, metalId: blade, gem: gem ? MATERIALS[gem].color : crystal ? MATERIALS[crystal].color : null,
    guard: has('gold') || (w.grade ?? 0) >= 4 ? '#ffd04a' : blade === 'copper' || blade === 'bronze' ? '#b06a3a' : '#7a7a86',
    grip, fangs, els, feather: has('feather'), core: has('golem_core') || has('lava_core'), stars: blade === 'stariron', glow: blade === 'magmasteel' || blade === 'cursedore',
    bone: !!boneish && !blade, junk: blade === 'junk',
  };
}

/** Forged weapon sprite. w = {bp, ids, el, grade, recipe?} */
export function weaponSprite(w, size = 48) {
  const key = `wpn|${w.bp}|${(w.ids || []).join(',')}|${JSON.stringify(w.el || {})}|${w.grade ?? 1}|${w.recipe || ''}|${size}`;
  return memo(key, () => {
    const S = size;
    const p = new Painter(S, S);
    const look = weaponLook(w);
    const BT = tones(look.blade), GT = tones(look.guard), HT = tones(look.grip), WD = tones('#8a5a33');
    const k = S / 48;
    const r = new RNG(key);
    // axis from butt (bottom-left) to tip (top-right)
    const bx = 5 * k, by = S - 5 * k, tx = S - 4 * k, ty = 4 * k;
    const bp = w.bp;
    const AX = (t) => [lerp(bx, tx, t), lerp(by, ty, t)];
    const elSide = [];
    // --- grips / shafts
    const shaft = (t0, t1, rad, T, wrapEvery = 0) => {
      const [x0, y0] = AX(t0), [x1, y1] = AX(t1);
      axisPaint(p, x0, y0, x1, y1, rad + 1, (t, d, len, u) => {
        if (t < 0 || t > 1 || Math.abs(d) > rad) return null;
        if (wrapEvery && Math.floor(u / (wrapEvery * k)) % 2 === 0 && Math.abs(d) < rad) return T[d < -rad * 0.2 ? 4 : 2];
        return T[d < -rad * 0.3 ? 4 : d > rad * 0.4 ? 1 : 3];
      });
    };
    const pommel = (t, rad, T) => { const [x, y] = AX(t); lump(p, x, y, rad, rad, T, 3, { wobble: 0 }); };
    const crossGuard = (t, half, thick, T) => {
      const [cx, cy] = AX(t);
      // perpendicular to axis: direction (1,1)/√2
      axisPaint(p, cx - half * 0.707, cy - half * 0.707, cx + half * 0.707, cy + half * 0.707, thick + 1, (tt, d) => (tt >= 0 && tt <= 1 && Math.abs(d) <= thick ? T[d < 0 ? 4 : 2] : null));
      if (look.gem) lump(p, cx, cy, Math.max(1.4, 2 * k), Math.max(1.4, 2 * k), tones(look.gem), 2, { wobble: 0, bias: 0.3 });
    };
    // --- blades
    const blade = (t0, t1, width, curve = 0, o = {}) => {
      const [x0, y0] = AX(t0), [x1, y1] = AX(t1);
      axisPaint(p, x0, y0, x1, y1, width * 2 + 2, (t, d, len) => {
        if (t < 0 || t > 1) return null;
        const taper = o.leaf ? Math.sin(Math.min(1, t * 1.15) * Math.PI) * 1.1 + 0.15 : t > 0.82 ? (1 - t) / 0.18 : 1;
        const wv = width * taper;
        const dd = d - curve * Math.sin(t * Math.PI) * width;
        if (dd < -wv || dd > wv) return null;
        if (look.fangs && dd > wv - 1.2 && Math.floor(t * len / (3 * k)) % 2 === 0 && t > 0.15 && t < 0.85) return null; // serrated back
        let i = dd < -wv * 0.35 ? 4 : dd > wv * 0.45 ? 1 : 3;
        if (Math.abs(dd) < 0.6 && o.fuller !== false && t < 0.75) i = 2; // fuller groove
        if (dd < -wv + 0.8) i = 5; // lit edge
        if (look.junk && hash2(Math.round(t * 40), Math.round(d), 3) > 0.8) i = Math.max(0, i - 2);
        return BT[i];
      });
      elSide.push([t0, t1, width]);
    };

    if (bp === 'sword' || bp === 'dagger') {
      const isD = bp === 'dagger';
      const g = isD ? 0.36 : 0.26;
      shaft(0.06, g - 0.03, 1.6 * k, HT, 2);
      pommel(0.06, 2.4 * k, GT);
      blade(g + 0.02, isD ? 0.82 : 1.0, (isD ? 3 : 3.2) * k);
      crossGuard(g, (isD ? 6 : 8) * k, 1.6 * k, GT);
    } else if (bp === 'axe') {
      shaft(0.05, 0.92, 1.5 * k, WD, 0);
      shaft(0.08, 0.3, 1.7 * k, HT, 2);
      // bearded axe head: polygon in local coords (a = along shaft toward tip, q = perpendicular, +q = lower-right)
      const [hx, hy] = AX(0.8);
      const toXY = (a, q) => [hx + a * 0.707 + q * 0.707, hy - a * 0.707 + q * 0.707];
      const poly = [[4, 0], [6, 7], [5, 11], [0, 12], [-6, 10], [-9, 6], [-3, 4], [-3, 0]].map(([a, q]) => toXY(a * k, q * k));
      p.poly(poly, BT[3]);
      // shade: edge band bright, inner cheek darker
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!p.alpha(x, y)) continue;
        const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
        const a = (dx - dy) * 0.707 / k, q = (dx + dy) * 0.707 / k;
        if (q < -0.5 || q > 13 || a < -10 || a > 7) continue;
        const c = p.get(x, y);
        if (c[0] !== hexToRgb(BT[3])[0] || c[1] !== hexToRgb(BT[3])[1]) continue;
        if (q > 9) p.set(x, y, BT[5]);
        else if (q > 7.5) p.set(x, y, BT[4]);
        else if (a < -5) p.set(x, y, BT[2]);
        else if (q < 2) p.set(x, y, BT[1]);
        if (look.fangs && q > 9.5 && Math.floor(a / 2) % 2 === 0) p.clear(x, y);
      }
      // back spike
      const [sx, sy] = AX(0.84);
      p.line(Math.round(sx), Math.round(sy), Math.round(sx - 4 * k), Math.round(sy - 4 * k), BT[2]);
      elSide.push([0.62, 0.95, 6 * k]);
    } else if (bp === 'hammer') {
      shaft(0.05, 0.78, 1.6 * k, WD, 0);
      shaft(0.06, 0.28, 1.8 * k, HT, 2);
      const [hx, hy] = AX(0.82);
      // big block head perpendicular to the shaft
      const hw = 11 * k, hh = 6.5 * k;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
        const along = (dx - dy) * 0.707, perp = (dx + dy) * 0.707;
        if (Math.abs(perp) > hw || Math.abs(along) > hh) continue;
        const corner = Math.abs(perp) > hw - 1.2 && Math.abs(along) > hh - 1.2;
        if (corner) continue;
        let i = along > hh - 1.6 ? 5 : along < -hh + 1.6 ? 1 : perp < -hw + 1.6 ? 4 : 3;
        if (Math.abs(perp) < 1.2) i = Math.max(0, i - 1);
        p.set(x, y, BT[i]);
      }
      if (look.core) lump(p, hx, hy, 2.6 * k, 2.6 * k, tones('#ffb84a'), 4, { wobble: 0, bias: 0.5 });
      else if (look.gem) lump(p, hx, hy, 2 * k, 2 * k, tones(look.gem), 4, { wobble: 0, bias: 0.3 });
      elSide.push([0.7, 0.95, 8 * k]);
    } else if (bp === 'spear') {
      shaft(0.02, 0.74, 1.2 * k, WD, 0);
      shaft(0.3, 0.42, 1.5 * k, HT, 2);
      blade(0.72, 1.0, 3.6 * k, 0, { leaf: true, fuller: false });
      const [cx, cy] = AX(0.72);
      lump(p, cx, cy, 1.8 * k, 1.8 * k, GT, 1, { wobble: 0 });
    } else if (bp === 'staff') {
      shaft(0.02, 0.8, 1.3 * k, WD, 0);
      shaft(0.4, 0.5, 1.6 * k, HT, 2);
      const [ox, oy] = AX(0.88);
      // claw prongs holding an orb
      for (const s of [-1, 1]) p.line(Math.round(ox - 4 * k * 0.707 + s * 4 * k * 0.707), Math.round(oy + 4 * k * 0.707 + s * 4 * k * 0.707), Math.round(ox + s * 5 * k * 0.707), Math.round(oy + s * 5 * k * 0.707 - 3 * k), WD[4]);
      const orbHex = look.gem || (look.els[0] ? EL_COLOR[look.els[0]] : look.blade);
      lump(p, ox, oy, 4.4 * k, 4.4 * k, tones(orbHex), 7, { wobble: 0.05, bias: 0.25 });
      elSide.push([0.8, 0.98, 5 * k]);
    } else if (bp === 'pickaxe') {
      shaft(0.04, 0.84, 1.5 * k, WD, 0);
      shaft(0.06, 0.3, 1.7 * k, HT, 2);
      const [hx, hy] = AX(0.84);
      // curved pick head (perpendicular arc)
      for (let i = 0; i < 120; i++) {
        const t = i / 119 * 2 - 1; // -1..1 across
        const perp = t * 13 * k, along = -(1 - t * t) * 4 * k + 2 * k;
        const x = hx + (perp + along) * 0.707, y = hy + (perp - along) * 0.707;
        const rad = (1 - Math.abs(t) * 0.75) * 2.3 * k;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= rad * rad) p.set(Math.round(x + dx), Math.round(y + dy), BT[dx + dy < -rad * 0.4 ? 4 : dx + dy > rad * 0.5 ? 1 : 3]);
      }
      elSide.push([0.75, 0.95, 6 * k]);
    }
    // --- feather tuft at the pommel
    if (look.feather) { const [x, y] = AX(0.02); p.line(Math.round(x), Math.round(y), Math.round(x - 3 * k), Math.round(y + 4 * k), '#c8b8a0'); p.line(Math.round(x + 1), Math.round(y), Math.round(x - 1 * k), Math.round(y + 5 * k), '#8a7a6a'); }
    // --- star-iron specks / glow veins
    if (look.stars || look.glow) {
      const col = look.stars ? '#ffe08a' : look.blade === BLADE_COLOR.cursedore ? '#ff9aff' : '#ffe08a';
      for (let i = 0; i < 6 * k; i++) { const t = r.float(0.4, 0.92); const [x, y] = AX(t); const o = r.float(-1.5, 1.5) * k; if (p.alpha(Math.round(x + o), Math.round(y + o))) p.set(Math.round(x + o), Math.round(y + o), col); }
    }
    finish(p, '#140c10');
    // --- element overlays (after outline so they sit on top / outside)
    const [et0, et1, ew] = elSide[0] || [0.5, 0.95, 4 * k];
    look.els.slice(0, 3).forEach((el, n) => {
      const C = EL_COLOR[el];
      const T = tones(C);
      const cnt = Math.round((5 + Math.min(6, (w.el || {})[el] || 1)) * k);
      for (let i = 0; i < cnt; i++) {
        const t = lerp(et0 + 0.05, et1 - 0.04, (i + n * 0.33) / cnt);
        const [x, y] = AX(t);
        // above-left side of the blade = (-1,-1) direction
        const side = (i + n) % 2 ? 1 : -1;
        const off = ew + 1.5 * k;
        const ox = Math.round(x + side * off * 0.707), oy = Math.round(y + side * off * 0.707);
        if (el === 'fire') { p.set(ox, oy, T[3]); p.set(ox, oy - 1, T[4]); if (i % 2) p.set(ox + 1, oy - 2, T[5]); }
        else if (el === 'ice') { p.set(ox, oy, T[4]); if (i % 2) { p.set(ox - 1, oy, T[3]); p.set(ox, oy - 1, '#ffffff'); } }
        else if (el === 'shock') { if (i % 2) { p.set(ox, oy, T[5]); p.set(ox + 1, oy + 1, T[4]); p.set(ox, oy + 2, T[3]); } }
        else if (el === 'poison') { if (side > 0) { p.set(ox, oy + 1, T[4]); p.set(ox, oy + 2, T[3]); } else p.set(ox, oy, T[2]); }
        else if (el === 'curse') { if (i % 2) { const [bx2, by2] = AX(t); p.set(Math.round(bx2), Math.round(by2), T[4]); } else p.set(ox, oy, T[3]); }
        else if (el === 'holy') { if (i % 3 === 0) sparkle(p, ox, oy, '#fff6c8'); }
        else if (el === 'bleed') { if (side > 0 && i % 2) { p.set(ox, oy, T[3]); p.set(ox, oy + 1, T[2]); } }
      }
    });
    // --- grade: masterwork sparkle, crude chips
    if ((w.grade ?? 1) >= 4) { const [x, y] = AX(0.9); sparkle(p, Math.round(x - 3 * k), Math.round(y - 3 * k), '#fff6c8', true); }
    if ((w.grade ?? 1) <= 0) { for (let i = 0; i < 3; i++) { const [x, y] = AX(0.5 + i * 0.12); p.clear(Math.round(x + 2 * k), Math.round(y + 2 * k)); } }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ PORTRAITS
// non-adaptive ramp for skin / fur / hair (white fur must stay white)
function ptones(hex) { return [shadeHex(hex, -0.5), shadeHex(hex, -0.32), shadeHex(hex, -0.14), hex, shadeHex(hex, 0.2), shadeHex(hex, 0.45)]; }
export function portrait(charId, expr = 'neutral', size = 32) {
  return memo(`por|${charId}|${expr}|${size}`, () => {
    const base = drawPortrait(charId, expr);
    if (size === 32) return base;
    return scaleCanvas(base, Math.max(1, Math.round(size / 32)));
  });
}

// face row half-widths (from face top), centred at x=16 (pixel columns 16-hw .. 15+hw)
const FACE_ROWS = [5, 7, 8, 8.5, 9, 9, 9, 9, 9, 9, 8.5, 8, 7, 6, 4.5, 3];

function face(p, top, SK, o = {}) {
  FACE_ROWS.forEach((hw, i) => {
    const y = top + i;
    const x0 = Math.round(16 - hw), x1 = Math.round(16 + hw) - 1;
    for (let x = x0; x <= x1; x++) {
      let t = 3;
      if (x <= x0 + 1) t = 4;
      if (x >= x1 - 1) t = 2;
      if (i >= FACE_ROWS.length - 3 && x > 16) t = 2;
      if (i === FACE_ROWS.length - 1) t = 2;
      p.set(x, y, SK[t]);
    }
  });
}

function eyes(p, y, expr, E, o) {
  const w = o.w || 3, h = o.h || 4, lx = 16 - o.gap / 2 - w, rx = 16 + o.gap / 2;
  const lash = o.lash || '#1a1012';
  for (const [side, x0] of [[-1, lx], [1, rx]]) {
    if (expr === 'happy') { // closed smiling arcs ^ ^
      p.set(x0, y + 2, lash); for (let x = 1; x < w; x++) p.set(x0 + x, y + 1, lash); p.set(x0 + w, y + 2, lash);
      continue;
    }
    if (expr === 'hurt' && side < 0) { p.set(x0, y, lash); p.set(x0 + 1, y + 1, lash); p.set(x0 + 2, y + 2, lash); p.set(x0 + 1, y + 3, lash); p.set(x0, y + 4 > y + h ? y + 3 : y + 3, lash); continue; }
    let top = y, hh = h;
    if (expr === 'smug') { top = y + Math.ceil(h / 2); hh = h - Math.ceil(h / 2); }
    if (expr === 'angry') { top = y + 1; hh = h - 1; }
    if (expr === 'surprised') { top = y - 1; hh = h + 1; }
    // lash line (extends outward one pixel)
    for (let x = -1; x <= w; x++) { if ((x === -1 && side > 0) || (x === w && side < 0)) continue; p.set(x0 + x, top, lash); }
    for (let yy = 1; yy < hh; yy++) for (let x = 0; x < w; x++) {
      let c = yy === 1 ? E[1] : yy >= hh - 1 ? E[4] : E[2];
      if (expr === 'surprised') c = (x === Math.floor(w / 2) && yy > 1 && yy < hh - 1) ? '#1a1012' : '#f4f0f0';
      p.set(x0 + x, top + yy, c);
    }
    if (expr !== 'surprised' && hh > 2) p.set(side < 0 ? x0 : x0, top + 1, '#ffffff');
    if (hh > 3 && expr !== 'surprised') p.set(x0 + w - 1, top + hh - 2, E[5]);
    if (expr === 'sad') p.set(x0 + (side < 0 ? 0 : w - 1), top + hh, '#9ad8ff');
  }
  // brows
  const by = y - 2 - (expr === 'surprised' ? 1 : 0);
  const bc = o.brow;
  if (o.noBrows && !['angry', 'sad', 'surprised', 'smug'].includes(expr)) return;
  if (expr === 'angry' || expr === 'hurt') { p.line(lx - 1, by, lx + w - 1, by + 2, bc); p.line(rx + w, by, rx, by + 2, bc); }
  else if (expr === 'sad') { p.line(lx, by + 2, lx + w, by, bc); p.line(rx - 1, by, rx + w - 1, by + 2, bc); }
  else { for (let x = 0; x < w + (o.thick ? 1 : 0); x++) { p.set(lx + x - (o.thick ? 1 : 0), by, bc); p.set(rx + x, by - (expr === 'smug' && x > 0 ? 1 : 0), bc); } }
}

function mouth(p, y, expr, o = {}) {
  const d = '#5a1a20', t = '#e8707a';
  const x = 16;
  if (expr === 'happy') { p.hline(x - 2, x + 1, y, d); p.hline(x - 1, x, y + 1, t); p.set(x - 2, y + 1, d); p.set(x + 1, y + 1, d); if (o.fang) p.set(x, y, '#ffffff'); }
  else if (expr === 'angry') { p.hline(x - 2, x + 1, y + 1, d); p.set(x - 2, y, d); p.set(x + 1, y, d); }
  else if (expr === 'surprised') { p.set(x - 1, y, d); p.set(x, y, d); p.set(x - 1, y + 1, d); p.set(x, y + 1, t); }
  else if (expr === 'sad') { p.hline(x - 1, x, y, d); p.set(x - 2, y + 1, d); p.set(x + 1, y + 1, d); }
  else if (expr === 'smug') { p.hline(x - 1, x + 1, y + 1, d); p.set(x + 2, y, d); if (o.fang) p.set(x + 1, y + 2, '#ffffff'); }
  else if (expr === 'hurt') { p.hline(x - 2, x + 1, y, d); p.hline(x - 2, x + 1, y + 1, '#f4f0f0'); p.set(x - 1, y + 1, d); p.set(x + 1, y + 1, d); }
  else { p.hline(x - 1, x, y, d); if (o.fang) p.set(x, y + 1, '#ffffff'); }
}

function blush(p, y, gap) { for (const x of [16 - gap / 2 - 4, 16 + gap / 2 + 2]) { p.set(x, y, '#ff8a8a', 150); p.set(x + 1, y, '#ff8a8a', 150); } }

function bust(p, y0, CL, w) {
  for (let y = y0; y < 32; y++) {
    const k = y - y0;
    const hw = Math.min(w / 2, 5 + k * 3.2);
    for (let x = Math.round(16 - hw); x < Math.round(16 + hw); x++) p.set(x, y, CL[x < 11 ? 4 : x > 21 ? 2 : 3]);
  }
}

function drawPortrait(id, expr) {
  const c = CHARACTERS[id];
  const md = c ? c.model : { skin: '#e8b088', hair: '#5a3a2a', cloth: '#5a5a7a', apron: '#3a3a4a', accent: '#c8a040', eyes: '#3a2a1a' };
  const p = new Painter(32, 32);
  const SK = ptones(md.skin), HR = ptones(md.hair), CL = tones(md.cloth), AP = tones(md.apron), AC = tones(md.accent), EY = tones(md.eyes);
  if (id === 'bran') {
    bust(p, 25, CL, 30);
    p.rect(13, 22, 6, 3, SK[2]); // neck
    for (let y = 26; y < 32; y++) for (let x = 11; x < 21; x++) p.set(x, y, AP[x < 13 ? 4 : x > 18 ? 2 : 3]); // apron bib
    for (const sx of [10, 21]) for (let y = 25; y < 32; y++) p.set(sx + (y < 27 ? (sx < 16 ? -1 : 1) : 0), y, AP[1]);
    p.set(12, 28, '#d8b060'); p.set(19, 28, '#d8b060');
    // back hair (short, spiky at sides)
    for (const [x, y] of [[6, 11], [7, 10], [25, 11], [24, 10], [6, 13], [25, 13]]) { p.set(x, y, HR[2]); p.set(x, y + 1, HR[1]); }
    face(p, 8, SK);
    // sideburns + stubble
    for (let y = 14; y < 20; y++) { p.set(7, y, HR[2]); p.set(24, y, HR[1]); }
    const stub = mixHex(md.skin, md.hair, 0.42);
    for (let y = 19; y < 24; y++) for (let x = 8; x < 24; x++) if (p.alpha(x, y) && (y > 20 || x < 10 || x > 21) && ((x + y) & 1)) p.set(x, y, stub);
    // bandana
    for (let y = 5; y < 12; y++) for (let x = 6; x < 26; x++) {
      const dx = (x + 0.5 - 16) / 10, dy = (y - 11.5) / 7;
      if (dx * dx + dy * dy > 1) continue;
      p.set(x, y, AC[y < 7 ? 4 : y > 10 ? 1 : x < 11 ? 3 : 2]);
    }
    p.hline(7, 24, 11, AC[1]);
    for (const [x, y] of [[11, 7], [16, 6], [20, 8], [14, 9]]) p.set(x, y, '#fff0d0'); // polka dots
    p.set(25, 10, AC[3]); p.set(26, 11, AC[2]); p.set(27, 12, AC[1]); p.set(26, 9, AC[2]); p.set(27, 9, AC[1]); // knot tails
    eyes(p, 14, expr, EY, { w: 3, h: 3, gap: 6, brow: HR[0], thick: true });
    p.set(16, 18, SK[1]); p.set(15, 18, SK[2]); // nose
    mouth(p, 21, expr);
    if (expr !== 'angry') blush(p, 19, 6);
  } else if (id === 'elio') {
    bust(p, 25, CL, 26);
    p.hline(10, 21, 25, AC[3]); p.set(16, 27, AC[4]); p.set(16, 28, AC[2]); // collar trim + clasp
    p.rect(14, 23, 4, 2, SK[2]);
    // side locks behind face
    for (let y = 12; y < 24; y++) { p.set(6, y, HR[2]); p.set(7, y, HR[3]); p.set(24, y, HR[2]); p.set(25, y, HR[1]); if (y > 20) { p.set(5, y, HR[1]); p.set(26, y, HR[1]); } }
    face(p, 9, SK);
    // bangs under the brim
    for (let x = 7; x < 25; x++) { const h = 2 + ((x * 7) % 3 === 0 ? 2 : (x % 2)); for (let y = 10; y < 10 + h; y++) p.set(x, y, HR[y === 10 ? 4 : 3]); }
    // oversized droopy hat
    for (let y = 0; y < 11; y++) {
      const t = y / 10, half = 1.5 + t * 8, lean = (1 - t) * 7;
      for (let x = Math.round(16 - half + lean); x <= Math.round(16 + half + lean); x++) p.set(x, y, CL[x < 16 + lean - half * 0.35 ? 4 : x > 16 + lean + half * 0.45 ? 2 : 3]);
    }
    p.set(25, 0, CL[3]); p.set(26, 1, CL[2]); // drooping tip
    for (let x = 2; x < 30; x++) for (let y = 9; y < 12; y++) { const e = Math.abs(x + 0.5 - 16) / 14; if ((y === 11 && e > 0.8) || (y === 9 && e > 0.9)) continue; p.set(x, y, CL[y === 9 ? 4 : y === 11 ? 1 : 2]); }
    p.hline(7, 24, 8, AC[3]); p.hline(8, 23, 7, AC[1]);
    for (const [x, y, k] of [[20, 3, 5], [14, 5, 4], [23, 1, 4]]) p.set(x, y, AC[k]);
    eyes(p, 15, expr, EY, { w: 3, h: 5, gap: 4, brow: HR[0], noBrows: true });
    mouth(p, 22, expr);
    if (expr !== 'angry') blush(p, 20, 4);
    // Kindle, the little flame buddy
    lump(p, 27, 25, 2.4, 2.6, tones('#ff9a3a'), 1, { wobble: 0, bias: 0.4 });
    p.set(27, 21, '#ffe08a'); p.set(26, 22, '#ffb84a'); p.set(28, 22, '#ff9a3a');
    p.set(26, 25, '#2a1a1a'); p.set(28, 25, '#2a1a1a');
  } else if (id === 'durgan') {
    bust(p, 24, CL, 32);
    lump(p, 5, 27, 5, 4, tones('#7a8a9a'), 2, { wobble: 0 }); lump(p, 27, 27, 5, 4, tones('#7a8a9a'), 3, { wobble: 0 });
    face(p, 9, SK);
    // huge braided beard
    for (let y = 17; y < 32; y++) for (let x = 5; x < 27; x++) {
      const t = (y - 17) / 15, half = 10.5 - t * 6.5;
      if (Math.abs(x + 0.5 - 16) > half) continue;
      const strand = (Math.floor((x - y * 0.6) / 2) & 1);
      p.set(x, y, HR[x < 12 ? (strand ? 4 : 3) : x > 20 ? (strand ? 2 : 1) : strand ? 3 : 2]);
    }
    for (const y of [26, 29]) { p.hline(13, 18, y, AC[4]); p.hline(13, 18, y + 1, AC[1]); }
    // mustache + mouth gap
    p.hline(10, 21, 19, HR[4]); p.hline(9, 22, 20, HR[3]); p.set(8, 21, HR[2]); p.set(23, 21, HR[2]);
    if (['happy', 'surprised', 'hurt', 'angry'].includes(expr)) { p.hline(14, 17, 21, '#5a1a20'); if (expr === 'happy') p.hline(15, 16, 22, '#e8707a'); if (expr === 'hurt') p.hline(14, 17, 22, '#f4f0f0'); }
    // big nose
    lump(p, 16, 17, 2.4, 2, SK, 4, { wobble: 0 });
    // horned helm
    const ST = tones('#8a98a8');
    for (let y = 2; y < 13; y++) for (let x = 6; x < 26; x++) {
      const dx = (x + 0.5 - 16) / 10, dy = (y - 12.5) / 10;
      if (dx * dx + dy * dy > 1) continue;
      p.set(x, y, ST[y < 5 ? 4 : x < 11 ? 3 : x > 21 ? 1 : 2]);
    }
    p.hline(6, 25, 12, AC[1]); p.hline(6, 25, 11, AC[4]); p.hline(6, 25, 10, AC[3]);
    p.vline(16, 3, 15, ST[0]); p.vline(15, 4, 13, ST[4]);
    for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
      const x = 16 + s * (9 + i * 0.75), y = 8 - i * 1.0 + (i > 5 ? (i - 5) * 0.8 : 0);
      p.set(Math.round(x), Math.round(y), i > 5 ? '#fff6e0' : '#e8dcc0'); p.set(Math.round(x), Math.round(y) + 1, '#b8a888'); if (i < 4) p.set(Math.round(x) - s, Math.round(y) + 1, '#d8ccb0');
    }
    eyes(p, 14, expr, EY, { w: 2, h: 2, gap: 6, brow: HR[1], thick: true });
  } else if (id === 'clover') {
    const FUR = ptones(md.hair);
    // ears: left upright, right floppy
    for (let y = 0; y < 12; y++) for (let x = 0; x < 4; x++) p.set(9 + x, y, x > 0 && x < 3 && y > 1 && y < 10 ? (y < 4 ? '#ffc8d8' : '#ffb0c8') : FUR[x === 0 ? 4 : x === 3 ? 2 : 3]);
    for (let i = 0; i < 14; i++) {
      const x = 19 + i * 0.75, y = 4 + Math.pow(i / 13, 1.5) * 10;
      for (let k = -1; k <= 2; k++) p.set(Math.round(x), Math.round(y) + k, (k === 0 || k === 1) && i > 1 && i < 12 ? '#ffb0c8' : FUR[k < 0 ? 4 : 2]);
    }
    bust(p, 25, CL, 24);
    p.rect(14, 23, 4, 2, SK[2]);
    // hair: soft white bob behind face
    for (let y = 9; y < 24; y++) for (let x = 6; x < 26; x++) { const dx = (x + 0.5 - 16) / 10, dy = (y - 15) / 9; if (dx * dx + dy * dy < 1) p.set(x, y, FUR[x < 11 ? 4 : x > 21 ? 2 : 3]); }
    face(p, 9, SK);
    for (let x = 7; x < 25; x++) { const h = 3 + ((x >> 1) & 1) + (x === 15 || x === 16 ? 1 : 0); for (let y = 8; y < 8 + h; y++) p.set(x, y, FUR[y === 8 ? 5 : x < 12 ? 4 : 3]); if (x > 8 && x < 23) p.set(x, 8 + h, SK[1]); }
    // flowing pink scarf
    for (let y = 22; y < 27; y++) for (let x = 7; x < 26; x++) { const t = Math.abs((x - 16) / 9); if (y - 22 > 4 - t * 2) continue; p.set(x, y, AP[y === 22 ? 4 : y > 25 ? 1 : x < 12 ? 3 : 2]); }
    for (let y = 26; y < 32; y++) for (let k = 0; k < 4; k++) p.set(22 + k + Math.floor((y - 26) / 2), y, AP[k === 0 ? 4 : k === 3 ? 1 : 2]);
    p.set(10, 24, '#ffd23a'); // scarf pin
    eyes(p, 14, expr, EY, { w: 3, h: 4, gap: 4, brow: FUR[0], noBrows: true });
    p.set(16, 19, '#e898a8'); // nose
    mouth(p, 21, expr, { fang: true });
    if (expr !== 'angry') blush(p, 19, 4);
  }
  if (expr === 'hurt') { p.set(25, 12, '#9ad8ff'); p.set(25, 13, '#9ad8ff'); p.set(26, 13, '#d8f4ff'); }
  finish(p, '#140c10', { selout: false });
  return p.toCanvas();
}

// ------------------------------------------------------------------ LOGO
const LETTERS = {
  F: ['#####', '##...', '##...', '####.', '##...', '##...', '##...'],
  O: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  R: ['####.', '##.##', '##.##', '####.', '##.#.', '##.##', '##.##'],
  G: ['.####', '##...', '##...', '##.##', '##..#', '##..#', '.####'],
  L: ['##...', '##...', '##...', '##...', '##...', '##...', '#####'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..'],
  E: ['#####', '##...', '##...', '####.', '##...', '##...', '#####'],
};
export function logo(scale = 1) {
  return memo(`logo|${scale}`, () => {
    const C = 4; // cell px
    const word = 'FORGLITE';
    const gap = 3;
    let totalW = 0;
    for (const ch of word) totalW += LETTERS[ch][0].length * C + gap;
    totalW -= gap;
    const W = totalW + 12, H = 56;
    const ox = 6, oy = 6;
    const mask = new Painter(W, H); // letter coverage
    const letterOf = new Int16Array(W * H).fill(-1);
    let cx = ox;
    const starts = [];
    [...word].forEach((ch, li) => {
      const rows = LETTERS[ch];
      starts.push(cx);
      rows.forEach((row, ry) => [...row].forEach((v, rx) => {
        if (v !== '#') return;
        for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
          const px = cx + rx * C + x, py = oy + ry * C + y;
          // chamfer convex corners
          const up = ry > 0 && rows[ry - 1][rx] === '#', dn = ry < 6 && rows[ry + 1][rx] === '#';
          const lf = rx > 0 && row[rx - 1] === '#', rt = rx < row.length - 1 && row[rx + 1] === '#';
          if (!up && !lf && x + y < 2) continue;
          if (!up && !rt && (C - 1 - x) + y < 2) continue;
          if (!dn && !lf && x + (C - 1 - y) < 1) continue;
          if (!dn && !rt && (C - 1 - x) + (C - 1 - y) < 1) continue;
          mask.set(px, py, '#ffffff');
          letterOf[py * W + px] = li;
        }
      }));
      cx += rows[0].length * C + gap;
    });
    const out = new Painter(W, H);
    const grad = ['#fff7d8', '#ffe9a0', '#ffd060', '#ffb040', '#ff8a2a', '#e8601e', '#b83c18', '#7a2412'];
    const inL = (x, y) => mask.alpha(x, y) > 0;
    // shadow + thick outline
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (inL(x, y)) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && inL(x + dx, y + dy)) { near = true; break; }
      if (near) out.set(x, y, '#1a0a08');
      else if (inL(x - 1, y - 4) || inL(x, y - 4) || inL(x - 2, y - 3)) out.set(x, y, '#3a1410', 180);
    }
    const letterTop = oy, letterH = 7 * C;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inL(x, y)) continue;
      const li = letterOf[y * W + x];
      const t = (y - letterTop) / letterH;
      let col = grad[Math.min(grad.length - 1, Math.floor(t * grad.length))];
      // bevel: lit top/left edges, dark bottom/right
      if (!inL(x, y - 1)) col = '#fffbe8';
      else if (!inL(x - 1, y)) col = mixHex(col, '#ffffff', 0.35);
      else if (!inL(x, y + 1)) col = mixHex(col, '#2a0a06', 0.55);
      else if (!inL(x + 1, y)) col = mixHex(col, '#3a0a06', 0.35);
      // hot streaks
      if (hash2(x >> 1, y, 7) > 0.93) col = mixHex(col, '#ffffff', 0.4);
      out.set(x, y, col);
    }
    // rivets in letter corners
    [0, 2, 4, 7].forEach((li) => { const x = starts[li] + 2, y = oy + 2 + (li % 2) * 20; if (inL(x, y) && inL(x + 1, y + 1)) { out.set(x, y, '#fff6e0'); out.set(x + 1, y, '#a05a20'); out.set(x, y + 1, '#a05a20'); out.set(x + 1, y + 1, '#5a2a10'); } });
    // curse crack through R and G
    let kx = starts[2] + 2, ky = oy + 3;
    const crack = [];
    for (let g = 0; g < 200 && kx < starts[4] - 2 && ky < oy + letterH - 2; g++) { crack.push([kx, ky]); if (hash2(kx, ky, 1) > 0.45) kx++; else ky++; if (hash2(kx, ky, 3) > 0.7) ky++; }
    for (const [x, y] of crack) {
      if (inL(x, y)) out.set(x, y, '#3a0a3a');
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inL(x + dx, y + dy) && hash2(x, y, dx + 5) > 0.35) out.set(x + dx, y + dy, '#c86bff');
      if (hash2(x, y, 9) > 0.8) out.set(x + 1, y - 1, '#ff9aff');
    }
    // anvil ornament below
    const ay = oy + letterH + 6, amid = Math.round(W / 2);
    for (let x = 10; x < W - 10; x++) { const d = Math.abs(x - amid); if (d < 14) continue; out.set(x, ay + 4, d % 4 === 0 ? '#e0b85a' : '#a0782a'); out.set(x, ay + 5, '#5a3c14'); }
    for (const s of [-1, 1]) { out.set(amid + s * 14, ay + 3, '#e0b85a'); out.set(amid + s * 16, ay + 4, '#fff0b0'); }
    const A = tones('#5b6170');
    const anv = ['.#########...', '##########...', '.#########...', '...#####.....', '..#######....', '.#########...'];
    anv.forEach((row, y) => [...row].forEach((v, x) => { if (v === '#') out.set(amid - 5 + x, ay + y, A[y === 0 ? 5 : y < 2 ? 4 : x < 3 ? 3 : 2]); }));
    out.set(amid - 6, ay + 1, A[3]); out.set(amid - 7, ay + 1, A[2]);
    // little hammer leaning on the anvil
    const WD2 = tones('#8a5a33'), ST2 = tones('#9aa3b2');
    for (let i = 0; i < 7; i++) out.set(amid + 9 + Math.floor(i / 2), ay + 6 - i, WD2[i & 1 ? 2 : 3]);
    [[amid + 11, ay - 2], [amid + 12, ay - 2], [amid + 13, ay - 1], [amid + 10, ay - 1], [amid + 11, ay - 1], [amid + 12, ay - 1], [amid + 12, ay], [amid + 13, ay]].forEach(([x, y], i) => out.set(x, y, ST2[i < 2 ? 5 : i < 6 ? 3 : 1]));
    // sparks/embers
    const r = new RNG('logo-embers');
    for (let i = 0; i < 22; i++) {
      const x = r.int(4, W - 5), y = r.int(0, oy + 4);
      if (out.alpha(x, y)) continue;
      out.set(x, y, r.pick(['#ffe08a', '#ff9a3a', '#fff6c8', '#ff6a2a']));
    }
    for (let i = 0; i < 6; i++) { const x = amid + r.int(-12, 12), y = ay - r.int(1, 4); if (!out.alpha(x, y)) out.set(x, y, r.pick(['#ffe08a', '#fff6c8'])); }
    const c = out.toCanvas();
    return scale > 1 ? scaleCanvas(c, scale) : c;
  });
}

// ------------------------------------------------------------------ MAP NODE BADGES
export function nodeBadge(type, size = 17) {
  return memo(`badge|${type}|${size}`, () => {
    const nt = NODE_TYPES[type] || NODE_TYPES.monster;
    const p = new Painter(size, size);
    const c = (size - 1) / 2;
    const ring = type === 'boss' ? tones('#e0a83a') : type === 'elite' ? tones('#8a3a8a') : type === 'start' ? tones('#8a7a6a') : tones('#7a746c');
    const inner = tones(mixHex(nt.color, '#1a1418', 0.72));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d > c + 0.3) continue;
      if (d > c - 2.2) { const i = dx + dy < -2 ? 4 : dx + dy > 3 ? 1 : 3; p.set(x, y, ring[i]); }
      else p.set(x, y, inner[d < c - 4 ? 3 : 2]);
    }
    if (type === 'boss') for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; p.set(Math.round(c + Math.cos(a) * (c + 1)), Math.round(c + Math.sin(a) * (c + 1)), ring[4]); }
    finish(p, '#140c10', { selout: false });
    const ic = icon(nt.icon);
    if (ic) p.blit(ic.canvas, Math.round(c - ic.w / 2 + 0.5), Math.round(c - ic.h / 2 + 0.5));
    return p.toCanvas();
  });
}

export function clearSpriteCache() { cache.clear(); }
