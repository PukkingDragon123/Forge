// Hand-painting kit shared by the 2D scenes: per-surface light (warm lamp pools, teal shadow),
// 9-step ramps, wobbly ink lines that thicken in shadow, organic cave rock, hewn timber and
// clutter (barrels, rope, sacks…). Painters read the light list set with withLights().
import { Painter, dither } from './pixel.js';
import { hash2, fbm2, mixHex, shadeHex, hexToRgb, clamp } from '../core/math.js';
import { voxify, voxObject, VoxGrid, rgb as hexRgb, mixRgb } from '../ui/vox_ui.js';

export const WARM = '#ffb35a', TEAL = '#10303a';
const INK = [22, 12, 10];
let LIGHTS = [];
/** Run fn with the given light sources [{x, y, r?}] (screen pixels). */
export function withLights(lights, fn) { const prev = LIGHTS; LIGHTS = lights; try { return fn(); } finally { LIGHTS = prev; } }
const cache = new Map();
const memo = (k, f) => { let c = cache.get(k); if (!c) { c = f(); cache.set(k, c); if (cache.size > 400) cache.delete(cache.keys().next().value); } return c; };

/** Lantern light at a screen pixel, 0..1, plus direction toward the strongest lantern. */
export function lightAt(x, y) {
  let L = 0, dx = 0, dy = -1, best = -1;
  for (const l of LIGHTS) {
    const ex = l.x - x, ey = (l.y - y) * 1.12;
    const d = Math.hypot(ex, ey);
    const v = Math.pow(Math.max(0, 1 - d / (l.r || 440)), 1.35) * (l.k ?? 1);
    L += v;
    if (v > best) { best = v; const n = Math.max(1, d); dx = ex / n; dy = ey / n; }
  }
  return { L: clamp(L * 1.05, 0, 1), dx, dy };
}

/** 9-step ramp: teal shadow → base tones → warm lamp-lit highlight. */
export function ramp9(base, warm = WARM, teal = TEAL) {
  return [mixHex(base[0], teal, 0.62), mixHex(base[0], teal, 0.36), base[0], base[1], base[2], base[3], base[4], mixHex(shadeHex(base[4], 0.12), warm, 0.38), mixHex(shadeHex(base[4], 0.35), warm, 0.58)].map(hexToRgb);
}

export function pick(rmp, v, x, y) {
  v = clamp(v, 0, 0.9999) * (rmp.length - 1);
  const i = Math.floor(v);
  return dither(x, y, v - i) ? rmp[Math.min(i + 1, rmp.length - 1)] : rmp[i];
}

export const inkAt = (L) => [Math.round(INK[0] * (0.6 + L * 0.5)), Math.round(INK[1] * (0.7 + L * 0.3)), Math.round(INK[2] + (1 - L) * 10)];

/** Wobbly hand-inked polyline: thickness swells on the shadow side. */
export function ink(p, pts, seed, opts = {}) {
  const col = opts.col, thick = opts.thick ?? 1.6, sx = opts.ox || 0, sy = opts.oy || 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      const L = lightAt(x + sx, y + sy).L;
      const c = col || inkAt(L);
      p.set(x, y, c);
      const w = thick * (0.6 + hash2(x >> 2, y >> 2, seed) * 0.8) * (1.25 - L * 0.6);
      if (w > 1.1) p.set(x + 1, y, c);
      if (w > 1.5) p.set(x, y + 1, c);
      if (w > 2.1) p.set(x + 1, y + 1, c);
    }
  }
}

/** Subdivide a segment into a wobbling line (shared between neighbours: deterministic per seed). */
export function wobble(a, b, seed, amp = 2.4, step = 7) {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const o = k === 0 || k === n ? 0 : (hash2(k, seed, 77) - 0.5) * 2 * amp * Math.sin(t * Math.PI) ** 0.5;
    out.push([a[0] + (b[0] - a[0]) * t + (nx / nl) * o, a[1] + (b[1] - a[1]) * t + (ny / nl) * o]);
  }
  return out;
}

/** Rock chunk sprite for 2D debris and rubble (irregular, lit from above). */
function paint_chunkCanvas(col, seed, size = 6) {
  return memo('c|' + col + seed + size, () => {
    const p = new Painter(size + 3, size + 3);
    const pts = [];
    const n = 5 + (seed % 3);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + hash2(k, seed, 2) * 0.6; const r = (size / 2) * (0.65 + hash2(k, seed, 3) * 0.45); pts.push([1.5 + size / 2 + Math.cos(a) * r, 1.5 + size / 2 + Math.sin(a) * r * 0.85]); }
    const hi = hexToRgb(mixHex(shadeHex(col, 0.3), WARM, 0.25)), mid = hexToRgb(col), lo = hexToRgb(mixHex(shadeHex(col, -0.3), TEAL, 0.3));
    p.poly(pts, (x, y) => (y < size * 0.45 ? (x < size * 0.6 ? hi : mid) : x > size * 0.5 ? lo : mid));
    p.outline('#160c0a');
    return p.toCanvas();
  });
}

export function siteGrid(cw, ch, seed) {
  const m = new Map();
  return (i, j) => { const k = i * 4096 + j; let v = m.get(k); if (!v) { v = [i * cw + hash2(i, j, seed) * cw, j * ch + hash2(j, i, seed + 1) * ch, hash2(i, j, seed + 2) - 0.5, hash2(j, i, seed + 3) - 0.5, k]; m.set(k, v); } return v; };
}

export function nearest2(site, cw, ch, x, y, sx = 1) {
  const gi = Math.floor(x / cw), gj = Math.floor(y / ch);
  let d1 = 1e9, d2 = 1e9, s1 = null, s2 = null;
  for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
    const s = site(i, j);
    const d = Math.hypot((x - s[0]) * sx, y - s[1]);
    if (d < d1) { d2 = d1; s2 = s1; d1 = d; s1 = s; } else if (d < d2) { d2 = d; s2 = s; }
  }
  return { d1, d2, s1, s2 };
}

/** Organic cave rock: domain-warped boulders, partial secondary cracks, sediment bands, damp streaks. */
export function caveRock(p, x0, y0, w, h, pal, seed, opts = {}) {
  const rmp = ramp9(pal.rock);
  const BW = 128, BH = 92, SW = 44, SH = 30;
  const big = siteGrid(BW, BH, seed), small = siteGrid(SW, SH, seed + 50);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const wx = x + (fbm2(x * 0.011, y * 0.013, 3, seed + 20) - 0.5) * 70;
    const wy = y + (fbm2(x * 0.013 + 7, y * 0.011, 3, seed + 21) - 0.5) * 46;
    const B = nearest2(big, BW, BH, wx, wy, 0.8), S = nearest2(small, SW, SH, wx, wy);
    const eB = (B.d2 - B.d1) * 0.5, eS = (S.d2 - S.d1) * 0.5;
    const { L, dx, dy } = lightAt(x, y);
    if (eB < 0.75 + hash2(x >> 3, y >> 3, seed) * 0.6) { p.set(x, y, inkAt(L * 0.9 + 0.15)); continue; }
    const pairOn = hash2(Math.min(S.s1[4], S.s2[4]), Math.max(S.s1[4], S.s2[4]), seed) > 0.58;
    const strata = fbm2(x * 0.003 + y * 0.01, y * 0.024, 3, seed + 9) - 0.5;
    let v = 0.42 + (B.s1[2] * dx + B.s1[3] * dy) * 0.36 + (S.s1[2] * dx + S.s1[3] * dy) * 0.1 + strata * 0.34;
    if (eB < 9) { const b = 1 - eB / 9; const nx = (wx - B.s1[0]) / (B.d1 || 1), ny = (wy - B.s1[1]) / (B.d1 || 1); v += (nx * dx + ny * dy) * b * 0.5 - b * 0.12; }
    if (pairOn && eS < 0.8) v -= 0.3;
    else if (pairOn && eS < 2.2) v += (eS < 1.5 ? 0.12 : 0) * (dy < 0 ? 1 : -1);
    v += (fbm2(x * 0.09, y * 0.09, 2, seed) - 0.5) * 0.16 + (hash2(x, y, seed) - 0.5) * 0.05;
    // damp streaks running down from cracks
    const streak = fbm2(x * 0.18, y * 0.006, 2, seed + 30);
    if (streak > 0.7) v -= (streak - 0.7) * 0.8;
    v = v * 0.5 + L * 0.74 - 0.2 + (opts.bias || 0);
    p.set(x, y, pick(rmp, v, x, y));
  }
}

export function plank(p, pts, seed, horiz = false) {
  // a hewn timber: wobbly edges, grain, knots, chipped ends, lit side warmer
  const rmp = ramp9(['#2a160c', '#45281a', '#64402a', '#86593a', '#a87650'], '#ffc070', '#14262a');
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const mask = new Painter(Math.ceil(x1 - x0) + 2, Math.ceil(y1 - y0) + 2);
  mask.poly(pts.map(([x, y]) => [x - x0 + 1, y - y0 + 1]), '#ffffff');
  const across = horiz ? y1 - y0 : x1 - x0;
  for (let yy = 0; yy < mask.h; yy++) for (let xx = 0; xx < mask.w; xx++) {
    if (!mask.alpha(xx, yy)) continue;
    const x = Math.round(x0 + xx - 1), y = Math.round(y0 + yy - 1);
    const { L, dx, dy } = lightAt(x, y);
    const a = horiz ? (y - y0) / across : (x - x0) / across; // 0..1 across the beam
    const along = horiz ? x : y;
    const roundness = Math.cos((a - 0.5) * Math.PI) * 0.35;
    const side = (horiz ? -dy : -dx) * (a - 0.5) * -0.5;
    const grain = Math.sin(along * 0.05 + a * 9 + Math.sin(along * 0.013 + seed) * 3) * 0.08 + (hash2(Math.floor(along / 3), Math.floor(a * 14), seed) - 0.5) * 0.12;
    let v = 0.3 + roundness + side + grain;
    v = v * 0.55 + L * 0.6 - 0.12;
    p.set(x, y, pick(rmp, v, x, y));
  }
  // grain lines
  for (let g = 0; g < 4; g++) {
    const a = 0.2 + g * 0.2 + (hash2(g, 3, seed) - 0.5) * 0.1;
    const line = [];
    for (let t = horiz ? x0 + 4 : y0 + 4; t < (horiz ? x1 - 4 : y1 - 4); t += 6) {
      const off = Math.sin(t * 0.04 + g + seed) * 1.5;
      line.push(horiz ? [t, y0 + a * across + off] : [x0 + a * across + off, t]);
    }
    for (let i = 0; i + 1 < line.length; i++) if (hash2(i, g, seed) > 0.25) ink(p, [line[i], line[i + 1]], seed + g, { col: [52, 28, 16], thick: 0.5 });
  }
  // knots
  for (let k = 0; k < 2; k++) {
    const t = hash2(k, 5, seed);
    const kx = horiz ? x0 + 10 + t * (x1 - x0 - 20) : x0 + across * (0.3 + hash2(k, 6, seed) * 0.4);
    const ky = horiz ? y0 + across * (0.3 + hash2(k, 6, seed) * 0.4) : y0 + 10 + t * (y1 - y0 - 20);
    p.ellipse(kx, ky, 2.5, 2, [46, 24, 14]);
    p.set(Math.round(kx) - 1, Math.round(ky) - 1, [150, 100, 64]);
  }
  ink(p, [...pts, pts[0]], seed, { thick: 1.8 });
}

export function nail(p, x, y) { p.set(x, y, [210, 214, 220]); p.set(x + 1, y, [120, 124, 132]); p.set(x, y + 1, [90, 92, 100]); p.set(x + 1, y + 1, [40, 40, 46]); }

export function crystal(p, x, y, h, col, seed) {
  const n = 3 + (seed % 3);
  for (let k = 0; k < n; k++) {
    const lean = (hash2(k, seed, 1) - 0.5) * 0.9, hh = h * (0.5 + hash2(k, seed, 2) * 0.6), w = 3 + hash2(k, seed, 3) * 4;
    const bx = x + (k - n / 2) * 4;
    const tip = [bx + lean * hh, y - hh];
    const pts = [[bx - w, y], [bx - w * 0.8 + lean * hh * 0.7, y - hh * 0.75], tip, [bx + w * 0.8 + lean * hh * 0.7, y - hh * 0.75], [bx + w, y]];
    const hi = hexToRgb(shadeHex(col, 0.45)), mid = hexToRgb(col), lo = hexToRgb(mixHex(shadeHex(col, -0.4), TEAL, 0.3));
    p.poly(pts, (px) => (px < bx - 1 + lean * 6 ? hi : px < bx + 2 + lean * 6 ? mid : lo));
    ink(p, [...pts], seed + k, { thick: 1.2 });
    p.set(Math.round(tip[0]), Math.round(tip[1]) + 2, '#ffffff');
  }
}

export function mushroom(p, x, y, h, col, seed) {
  const stem = [[x - 2, y], [x - 1.5, y - h], [x + 1.5, y - h], [x + 2, y]];
  p.poly(stem, (px) => (px < x ? [226, 214, 190] : [160, 146, 128]));
  ink(p, [...stem], seed, { thick: 1 });
  const r = h * 0.75;
  p.ellipse(x, y - h, r, r * 0.55, (px, py, nx, ny) => (ny > 0.3 ? null : ny < -0.4 ? hexToRgb(shadeHex(col, 0.4)) : nx > 0.4 ? hexToRgb(shadeHex(col, -0.3)) : hexToRgb(col)));
  for (let k = 0; k < 3; k++) p.set(Math.round(x - r * 0.5 + k * r * 0.5), Math.round(y - h - r * 0.25), '#fff6e0');
}

export function barrel(p, x, y, w, h, seed) {
  // staves bulge at the middle; iron hoops; lid rim catches the lamp
  const wood = ramp9(['#2a160c', '#45281a', '#64402a', '#86593a', '#a87650'], '#ffc070', '#14262a');
  const iron = ramp9(['#16141a', '#24222a', '#3a3842', '#5a5866', '#86849a'], '#ffc890', '#0c2028');
  for (let yy = 0; yy < h; yy++) {
    const t = yy / h, half = (w / 2) * (0.86 + Math.sin(t * Math.PI) * 0.14);
    for (let xx = -Math.round(half); xx <= Math.round(half); xx++) {
      const X = x + w / 2 + xx, Y = y + yy;
      const a = xx / half;
      const { L } = lightAt(X, Y);
      const hoop = Math.abs(t - 0.2) < 0.05 || Math.abs(t - 0.8) < 0.05;
      const stave = Math.abs(((xx + half) % 9) - 0) < 1;
      const v = 0.45 - a * 0.35 + (hoop ? 0.1 : 0) + (hash2(Math.floor((xx + half) / 9), yy >> 2, seed) - 0.5) * 0.12;
      p.set(X, Y, hoop ? pick(iron, v * 0.5 + L * 0.6, X, Y) : stave ? wood[1] : pick(wood, v * 0.5 + L * 0.6 - 0.05, X, Y));
    }
  }
  p.ellipse(x + w / 2, y + 1, w / 2 * 0.86, 3.5, (X, Y, nx, ny) => (Math.hypot(nx, ny) > 0.72 ? wood[6] : wood[2]));
  const out = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12; out.push([x + w / 2 - (w / 2) * (0.86 + Math.sin(t * Math.PI) * 0.14), y + t * h]); }
  for (let k = 12; k >= 0; k--) { const t = k / 12; out.push([x + w / 2 + (w / 2) * (0.86 + Math.sin(t * Math.PI) * 0.14), y + t * h]); }
  ink(p, out, seed, { thick: 1.8 });
}

export function ropeCoil(p, cx, cy, seed) {
  const rope = ramp9(['#3a2412', '#5a3a1e', '#7a5a30', '#a07a44', '#c8a060'], '#ffd890', '#1a2a2a');
  for (let r = 0; r < 4; r++) {
    const rx = 12 - r * 1.6, ry = 16 - r * 2;
    for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const x = Math.round(cx + Math.cos(a) * rx + r), y = Math.round(cy + Math.sin(a) * ry + r * 0.5);
      const twist = Math.sin(a * 22 + r) > 0.2;
      const { L } = lightAt(x, y);
      p.set(x, y, pick(rope, (twist ? 0.62 : 0.32) - Math.cos(a) * 0.15 + L * 0.3, x, y));
      p.set(x + 1, y, pick(rope, 0.25 + L * 0.3, x, y));
    }
  }
  ink(p, [[cx + 2, cy + 14], [cx + 4, cy + 26], [cx + 1, cy + 34]], seed, { col: [122, 90, 48], thick: 1.6 });
}

export function bucket(p, x, y, seed) {
  const wood = ramp9(['#2a160c', '#45281a', '#64402a', '#86593a', '#a87650'], '#ffc070', '#14262a');
  const pts = [[x, y], [x + 26, y], [x + 23, y + 26], [x + 3, y + 26]];
  p.poly(pts, (X, Y) => { const { L } = lightAt(X, Y); return (Y - y) % 9 === 4 ? [70, 66, 72] : pick(wood, 0.5 - (X - x) / 40 + L * 0.5, X, Y); });
  p.ellipse(x + 13, y + 1, 13, 3, (X, Y, nx, ny) => (Math.hypot(nx, ny) > 0.7 ? wood[6] : [40, 70, 84]));
  ink(p, [...pts, pts[0]], seed, { thick: 1.4 });
  ink(p, [[x + 1, y], [x + 13, y - 14], [x + 25, y]], seed + 1, { col: [90, 90, 98], thick: 0.8 });
}

export function sack(p, x, y, seed) {
  const cloth = ramp9(['#3a2c1c', '#5a4630', '#7a6444', '#9a825a', '#bca476'], '#ffd890', '#1a2a2a');
  const pts = [[x + 4, y + 40], [x - 2, y + 22], [x + 6, y + 8], [x + 10, y], [x + 18, y + 2], [x + 20, y + 10], [x + 30, y + 22], [x + 26, y + 40]];
  p.poly(pts, (X, Y) => { const { L } = lightAt(X, Y); return pick(cloth, 0.45 - (X - x - 12) / 40 + Math.sin(Y * 0.5 + X * 0.2) * 0.05 + L * 0.5, X, Y); });
  for (let k = 0; k < 4; k++) ink(p, [[x + 6 + k * 5, y + 16], [x + 4 + k * 6, y + 36]], seed + k, { col: [70, 54, 34], thick: 0.6 });
  ink(p, [[x + 7, y + 8], [x + 20, y + 9]], seed + 9, { col: [140, 100, 60], thick: 1.5 });
  ink(p, [...pts, pts[0]], seed, { thick: 1.6 });
}

/** Iron lantern with a flame frame (0..3). */
function paint_lanternCanvas(frame) {
  return memo('lantern|' + frame, () => {
    const p = new Painter(20, 30);
    const iron = [[30, 26, 28], [60, 54, 56], [110, 98, 92]];
    // flame + glass first so the cage overlaps
    p.poly([[5, 9], [15, 9], [16, 24], [4, 24]], [255, 200, 120]);
    const fh = 7 + (frame % 2), fx = 10 + (frame === 2 ? 1 : frame === 3 ? -1 : 0);
    p.ellipse(fx, 19, 3, fh * 0.6, [255, 236, 170]);
    p.ellipse(fx, 20, 1.5, fh * 0.35, [255, 255, 240]);
    for (let y = 9; y < 25; y++) { p.set(5, y, [255, 230, 180]); p.set(14, y, [220, 140, 70]); }
    // cage
    p.poly([[3, 5], [17, 5], [15, 9], [5, 9]], iron[1]);
    p.hline(4, 16, 5, iron[2]);
    for (const x of [3, 9, 16]) for (let y = 9; y < 26; y++) p.set(x + (x === 9 ? 1 : 0), y, x === 3 ? iron[2] : iron[0]);
    p.poly([[2, 25], [18, 25], [17, 28], [3, 28]], iron[1]);
    p.hline(3, 17, 25, iron[2]);
    p.ellipse(10, 2.5, 3, 2.5, (x, y, nx, ny) => (nx * nx + ny * ny > 0.35 ? iron[nx < 0 ? 2 : 0] : null));
    p.outline('#140a08');
    return p.toCanvas();
  });
}

/** Additive warm glow sprite (dithered falloff). */
export function glowCanvas(r, col = WARM) {
  return memo('glow|' + r + col, () => {
    const p = new Painter(r * 2, r * 2);
    const c = hexToRgb(col);
    for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      if (d >= 1) continue;
      const v = (1 - d) ** 2;
      p.set(x, y, c, Math.round(v * 120) + (dither(x, y, (v * 8) % 1) ? 8 : 0));
    }
    return p.toCanvas();
  });
}

/** Parchment scrap (small = pinned on the post; large = readable when hovered). */
function paint_noteCanvas(w, h, seed = 3) {
  return memo('note|' + w + 'x' + h + seed, () => {
    const p = new Painter(w, h);
    const edge = [];
    const n = 24;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const side = Math.floor(t * 4), f = (t * 4) % 1;
      const j = (hash2(k, seed, 1) - 0.5) * 3;
      const pt = side === 0 ? [2 + f * (w - 4), 2 + j] : side === 1 ? [w - 2 + j, 2 + f * (h - 4)] : side === 2 ? [w - 2 - f * (w - 4), h - 2 + j] : [2 + j, h - 2 - f * (h - 4)];
      edge.push(pt);
    }
    const par = ramp9(['#8a6a44', '#b08a5a', '#ccaa74', '#e0c492', '#f0dcb0'], '#ffe2a8', '#3a3a3a');
    p.poly(edge, (x, y) => pick(par, 0.62 + (fbm2(x * 0.06, y * 0.06, 3, seed) - 0.5) * 0.4 - (Math.min(x, y, w - x, h - y) < 5 ? 0.18 : 0), x, y));
    ink(p, [...edge, edge[0]], seed, { col: [90, 60, 34], thick: 1 });
    // nail at the top
    nail(p, Math.round(w / 2), 5);
    return p.toCanvas();
  });
}

/** Paper tag on a string, for hover labels. Text is drawn on top at runtime. */
function paint_tagCanvas(w) {
  return memo('tag|' + w, () => {
    const h = 18;
    const p = new Painter(w + 8, h + 10);
    ink(p, [[w / 2 + 4, 0], [w / 2 + 4, 6]], 2, { col: [150, 120, 80], thick: 0.6 });
    const pts = [[8, 6], [w, 6], [w + 6, 6 + h / 2], [w, 6 + h], [8, 6 + h], [4, 6 + h / 2]];
    const par = ramp9(['#8a6a44', '#b08a5a', '#ccaa74', '#e0c492', '#f0dcb0']);
    p.poly(pts, (x, y) => pick(par, 0.7 + (hash2(x >> 1, y >> 1, 5) - 0.5) * 0.25 - (y - 6) * 0.012, x, y));
    ink(p, [...pts, pts[0]], 4, { col: [90, 60, 34], thick: 1 });
    p.ellipse(w + 1, 6 + h / 2, 1.5, 1.5, [60, 40, 24]);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ voxel versions
// The game draws voxel models of these little objects (ui/vox_ui.js); the painters above stay as designs.
export const noteCanvas = voxify('noteCanvas', paint_noteCanvas, { relief: 'flat' });
export const tagCanvas = voxify('tagCanvas', paint_tagCanvas, { relief: 'flat' });

/** Iron lantern (voxel model): cage, glass, a flame that breathes through 4 frames. */
export function lanternCanvas(frame) {
  return voxObject('lantern|' + (frame & 3), () => {
    const g = new VoxGrid(13, 21, 13);
    const iron = [[34, 28, 34], [62, 54, 60], [104, 92, 96], [150, 132, 120]];
    const glass = [[255, 196, 110], [255, 168, 80], [236, 128, 60]];
    const fh = [7, 8, 7, 9][frame & 3], sway = [0, 1, 0, -1][frame & 3];
    // glass box with a breathing flame inside (bright core voxels show through the panes)
    g.fill((x, y, z) => x >= 3 && x <= 9 && z >= 3 && z <= 9 && y >= 4 && y <= 14, (x, y, z) => {
      const dx = x - 6 - sway * (y - 4) / 10, dz = z - 6, dy = y - 6;
      const core = dx * dx + dz * dz < (1 - dy / fh) * 6 && dy >= 0 && dy < fh;
      return core ? (dy < fh * 0.4 ? [255, 252, 230] : [255, 226, 150]) : glass[(x + y + z) % 3 === 0 ? 2 : (y > 11 ? 1 : 0)];
    });
    // corner posts, top and bottom plates, cap, handle ring
    for (const [x, z] of [[2, 2], [10, 2], [2, 10], [10, 10]]) g.box(x, 3, z, x, 15, z, iron[1]);
    g.box(2, 2, 2, 10, 3, 10, (x, y, z) => (y === 3 ? iron[2] : iron[1]));
    g.box(1, 1, 1, 11, 1, 11, iron[0]);
    g.box(2, 15, 2, 10, 15, 10, iron[2]);
    g.box(3, 16, 3, 9, 16, 9, iron[1]);
    g.box(4, 17, 4, 8, 17, 8, iron[3]);
    for (let a = 0; a < 16; a++) { const t = (a / 15) * Math.PI; g.set(6 + Math.round(Math.cos(t) * 3), 18 + Math.round(Math.sin(t) * 2), 6, iron[a % 2 ? 1 : 2]); }
    // window bars across the glass
    for (const y of [9]) g.box(2, y, 2, 10, y, 2, iron[0]), g.box(2, y, 10, 10, y, 10, iron[0]);
    return g;
  }, { w: 20, h: 30, yaw: -0.55, pitch: 0.18, pad: 1 });
}

/** Rock chunk (voxel model) for debris and rubble. */
export function chunkCanvas(col, seed, size = 6) {
  return voxObject('chunk|' + col + '|' + seed + '|' + size, () => {
    // ~2px voxels so the faceted faces read at debris size
    const n = Math.max(3, Math.round(size * 0.6));
    const g = new VoxGrid(n + 2, n + 2, n + 2);
    const base = hexRgb(col.startsWith('#') ? col : '#7a6a5a');
    const hi = mixRgb(base, [255, 228, 190], 0.28), lo = mixRgb(base, [40, 36, 70], 0.35);
    const c = (n + 2) / 2;
    g.fill((x, y, z) => {
      const dx = (x + 0.5 - c) / (n / 2), dy = (y + 0.5 - c) / (n / 2 * 0.8), dz = (z + 0.5 - c) / (n / 2);
      const r = 1.15 - hash2(x * 7 + z, y, seed) * 0.3;
      return dx * dx + dy * dy + dz * dz < r;
    }, (x, y, z) => (hash2(x, y + z * 9, seed + 1) > 0.8 ? hi : hash2(z, x + y * 5, seed + 2) > 0.85 ? lo : base));
    return g;
  }, { w: size + 3, h: size + 3, yaw: (seed % 7) * 0.5, pitch: 0.4 + (seed % 3) * 0.2, pad: 0 });
}
