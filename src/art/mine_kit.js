// Paint kit for the mining chamber: Eastward-style pastel pixel art. Warm lantern light in peach and
// mustard, soft lavender/purple shadows (never black), a cool teal bounce from below, daylight
// spilling through a crack in the ceiling. Ramps run purple shadow → base → peach highlight.
import { Painter, dither } from './pixel.js';
import { hash2, fbm2, hexToRgb, mixHex, clamp } from '../core/math.js';

export const SHADOW = '#2a1e3e', SHADE = '#4a3a66', PEACH = '#ffd9a8', CREAM = '#fff2d6';
export const OUTLINE = [33, 22, 42]; // ink is a deep plum, not black

/** Rock strata per region, top of the face → deepest row (pastel, depth reads as colour). */
export const STRATA = [
  ['#f0b884', '#e8946a', '#d27262', '#b45a6e', '#905486', '#6a5290', '#4a4c8a'], // Hollowdeep: sand → salmon → mauve → slate
  ['#d8c0ec', '#b8a8ea', '#98a0e2', '#7a96d6', '#5e88c4', '#4c6cac', '#3e5290'], // Prism: lilac → periwinkle → blue
  ['#c8cc8a', '#a8bc7a', '#86aa78', '#6a987c', '#568880', '#46727a', '#3a5a6e'], // Sporewood: olive → sage → teal
  ['#f4cc84', '#e6aa62', '#d08a56', '#b86c54', '#9a585e', '#7c4a68', '#5e406c'], // Sunken: sandstone → terracotta → plum
  ['#d8a0a0', '#c47a76', '#ac5e5e', '#904a56', '#743e52', '#5a344c', '#442c44'], // Emberdeep: ash rose → brick → maroon
  ['#e0d4c4', '#c8b0bc', '#ac90b0', '#9076a8', '#76609c', '#5e4e8c', '#483e78'], // Tomb: bone → mauve → violet
];
export const MOSS = ['#4a6a3a', '#6a9048', '#8ab45a', '#b4d878'].map(hexToRgb);
export const WOOD = ['#3a2430', '#5a3a34', '#80583e', '#a8784a', '#cc9a5c', '#e6bc78', '#f6dca0'];

/** 7-step pastel ramp around a base colour (index 3 is the base). */
export function pramp(base) {
  return [mixHex(base, SHADOW, 0.72), mixHex(base, SHADOW, 0.48), mixHex(base, SHADE, 0.24), base, mixHex(base, PEACH, 0.32), mixHex(base, PEACH, 0.6), mixHex(base, CREAM, 0.82)].map(hexToRgb);
}
const rampCache = new Map();
export function rampOf(base) { let r = rampCache.get(base); if (!r) { r = pramp(base); rampCache.set(base, r); } return r; }

/** Pick a ramp step with ordered dithering between steps; v in 0..1. */
export function pk(rmp, v, x, y) {
  v = clamp(v, 0, 0.9999) * (rmp.length - 1);
  const i = Math.floor(v);
  return dither(x, y, v - i) ? rmp[Math.min(i + 1, rmp.length - 1)] : rmp[i];
}

// ------------------------------------------------------------------ light model (screen space)
export const MINE_LIGHTS = [
  { x: 298, y: 74, r: 340, k: 1, warm: 1 }, // lantern on the left post
  { x: 702, y: 74, r: 340, k: 1, warm: 1 }, // lantern on the right post
  { x: 110, y: -10, r: 300, k: 0.55, warm: 0.4 }, // daylight through the crack in the ceiling
  { x: 870, y: 300, r: 210, k: 0.65, warm: 1 }, // the lamp over the shelves
  { x: 150, y: 330, r: 150, k: 0.5, warm: 1 }, // the platform lamp
];
/** Light at a screen pixel: L (0..1), direction toward the strongest source, and how cool the spot is. */
export function light(x, y) {
  let L = 0, dx = 0, dy = -1, best = -1, warm = 0;
  for (const l of MINE_LIGHTS) {
    const ex = l.x - x, ey = (l.y - y) * 1.1;
    const d = Math.hypot(ex, ey);
    const v = Math.pow(Math.max(0, 1 - d / l.r), 1.4) * l.k;
    L += v; warm += v * l.warm;
    if (v > best) { best = v; const n = Math.max(1, d); dx = ex / n; dy = ey / n; }
  }
  L = clamp(L, 0, 1);
  // cool bounce rises from the lower right, warmth falls from the lamps
  const cool = clamp(0.35 + (y / 540) * 0.35 + (x / 960) * 0.2 - L * 0.7, 0, 1);
  return { L, dx, dy, warm: clamp(warm, 0, 1), cool };
}
/** Colour grade a ramp colour: warm lamp tint where lit, lavender-teal where it's cool. */
export function grade(c, L, cool) {
  const w = L * 0.16, k = cool * 0.14;
  return [
    clamp(c[0] + (255 - c[0]) * w * 0.9 - c[0] * k * 0.35, 0, 255),
    clamp(c[1] + (214 - c[1]) * w * 0.7 - c[1] * k * 0.12, 0, 255),
    clamp(c[2] + (160 - c[2]) * w * 0.4 + (170 - c[2]) * k * 0.4, 0, 255),
  ];
}

/** Plum ink line (no light dependency), optional thickness. */
export function inkLine(p, pts, col = OUTLINE, thick = 1) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      p.set(x, y, col);
      if (thick > 1) p.set(x + 1, y, col);
      if (thick > 2) p.set(x, y + 1, col);
    }
  }
}

// ------------------------------------------------------------------ little painted details
/** Ammonite spiral / shell / bone / leaf imprint fossil at (x,y). kind 0..3. */
export function fossil(p, x, y, kind, base, inside = () => true) {
  const rmp = rampOf(base);
  const put = (px, py, c) => { px = Math.round(px); py = Math.round(py); if (inside(px, py)) p.set(px, py, c); };
  if (kind === 0) {
    for (let a = 0; a < 12; a += 0.18) { const r = 1 + a * 0.55; put(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9, a % 1.6 < 0.9 ? rmp[5] : rmp[1]); }
    for (let k = 0; k < 6; k++) { const a = k * 1.9, r = 2 + a * 0.55; put(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9, rmp[1]); }
  } else if (kind === 1) {
    for (let k = -3; k <= 3; k++) for (let j = 0; j < 6 - Math.abs(k); j++) put(x + k, y - j, j === 5 - Math.abs(k) ? rmp[6] : (k + j) % 2 ? rmp[5] : rmp[4]);
    for (let k = -3; k <= 3; k++) put(x + k, y + 1, rmp[1]);
  } else if (kind === 2) {
    for (let k = -4; k <= 4; k++) { put(x + k, y, rmp[6]); put(x + k, y + 1, rmp[2]); }
    for (const s of [-5, 5]) { put(x + s, y - 1, rmp[6]); put(x + s, y + 1, rmp[6]); put(x + s, y + 2, rmp[2]); }
  } else {
    for (let k = 0; k < 7; k++) { put(x + k * 0.7, y - k, rmp[5]); put(x + k * 0.7 + 2, y - k + 1, rmp[2]); put(x + k * 0.7 - 2, y - k + 1, rmp[2]); }
  }
}

/** A tuft of moss clinging to a top edge; cells hang down a few pixels. */
export function mossTuft(p, x, y, w, seed, inside = () => true) {
  for (let k = 0; k < w; k++) {
    const h = 1 + Math.floor(hash2(k, 1, seed) * 3 + Math.sin(k * 0.7 + seed) * 1.2);
    for (let j = 0; j < h; j++) {
      const px = x + k, py = y + j;
      if (!inside(px, py)) continue;
      p.set(px, py, j === 0 ? MOSS[hash2(k, 2, seed) > 0.5 ? 3 : 2] : j === h - 1 ? MOSS[0] : MOSS[1]);
    }
    if (hash2(k, 3, seed) > 0.85 && inside(x + k, y - 1)) p.set(x + k, y - 1, MOSS[3]);
  }
}

/** Little crystal shards poking out (decorative, not ore). */
export function shards(p, x, y, col, n, seed, inside = () => true) {
  const rmp = rampOf(col);
  for (let k = 0; k < n; k++) {
    const lean = (hash2(k, 1, seed) - 0.5) * 1.4, h = 4 + Math.floor(hash2(k, 2, seed) * 5), bx = x + (k - n / 2) * 3;
    for (let j = 0; j < h; j++) {
      const w = Math.max(0, Math.round((1 - j / h) * 1.6));
      for (let i = -w; i <= w; i++) {
        const px = Math.round(bx + i + lean * j * 0.5), py = y - j;
        if (!inside(px, py)) continue;
        p.set(px, py, i < 0 ? rmp[6] : i === 0 ? rmp[4] : rmp[2]);
      }
    }
    if (inside(Math.round(bx + lean * h * 0.5), y - h)) p.set(Math.round(bx + lean * h * 0.5), y - h, [255, 255, 255]);
  }
}

// ------------------------------------------------------------------ sprites for runtime effects
const fxCache = new Map();
const memoFx = (k, f) => { let c = fxCache.get(k); if (!c) { c = f(); fxCache.set(k, c); } return c; };

/** Soft dithered dust puff (radius r) in a colour. */
export function puffCanvas(r, col) {
  return memoFx('puff|' + r + col, () => {
    const p = new Painter(r * 2 + 2, r * 2 + 2);
    const c = hexToRgb(col), hi = hexToRgb(mixHex(col, CREAM, 0.35));
    for (let y = 0; y < r * 2 + 2; y++) for (let x = 0; x < r * 2 + 2; x++) {
      const dx = x - r - 0.5, dy = y - r - 0.5, d = Math.hypot(dx, dy) / r + (fbm2(x * 0.35, y * 0.35, 2, r) - 0.5) * 0.5;
      if (d >= 1) continue;
      if (dither(x, y, (1 - d) * 1.4)) p.set(x, y, dy < -r * 0.2 && dx < 0 ? hi : c);
    }
    return p.toCanvas();
  });
}

/** Additive light shaft (a soft dithered wedge), w at the top widening to w2 at the bottom. */
export function shaftCanvas(w, w2, h, col = '#fff0c8') {
  return memoFx('shaft|' + w + '|' + w2 + '|' + h + col, () => {
    const W = Math.max(w, w2) + 2;
    const p = new Painter(W, h);
    const c = hexToRgb(col);
    for (let y = 0; y < h; y++) {
      const t = y / h, half = (w + (w2 - w) * t) / 2;
      for (let x = 0; x < W; x++) {
        const u = Math.abs(x - W / 2) / half;
        if (u >= 1) continue;
        const a = (1 - u * u) * (1 - t) ** 1.2 * (0.6 + 0.4 * Math.sin(x * 0.7 + y * 0.05) ** 2);
        if (a > 0.02) p.set(x, y, c, Math.round(a * 175));
      }
    }
    return p.toCanvas();
  });
}

/** Big lens flare: cross star with rays (additive), r = arm length. */
export function flareCanvas(r, col) {
  return memoFx('flare|' + r + col, () => {
    const s = r * 2 + 1;
    const p = new Painter(s, s);
    const c = hexToRgb(col), w = [255, 255, 255];
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x - r, dy = y - r, d = Math.hypot(dx, dy);
      const arm = Math.max(Math.max(0, 1 - Math.abs(dy) / 1.6) * (1 - Math.abs(dx) / r), Math.max(0, 1 - Math.abs(dx) / 1.6) * (1 - Math.abs(dy) / r));
      const diag = Math.max(0, 1 - Math.abs(Math.abs(dx) - Math.abs(dy)) / 1.2) * Math.max(0, 1 - d / (r * 0.55));
      const core = Math.max(0, 1 - d / (r * 0.28));
      const a = Math.max(arm, diag * 0.7, core);
      if (a <= 0.03) continue;
      p.set(x, y, a > 0.75 ? w : c, Math.round(Math.min(1, a) * 230));
    }
    return p.toCanvas();
  });
}

/** Soft additive glow (dithered falloff) in any colour. */
export function glow(r, col) {
  return memoFx('glow|' + r + col, () => {
    const p = new Painter(r * 2, r * 2);
    const c = hexToRgb(col);
    for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
      const d = Math.hypot(x - r + 0.5, y - r + 0.5) / r;
      if (d >= 1) continue;
      const v = (1 - d) ** 2;
      p.set(x, y, c, Math.round(v * 140) + (dither(x, y, (v * 6) % 1) ? 10 : 0));
    }
    return p.toCanvas();
  });
}
