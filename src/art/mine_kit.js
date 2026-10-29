// Mine palette + 2D effect sprites: the pastel strata the voxel rock face is coloured by (top → deepest
// row), and the additive light/particle sprites drawn over the voxel room (dust puffs, light shafts,
// lens flares, soft glows), all dithered pixel art in virtual pixels.
import { Painter, dither } from './pixel.js';
import { fbm2, hexToRgb, mixHex } from '../core/math.js';

const CREAM = '#fff2d6';

/** Rock strata per region, top of the face → deepest row (pastel, depth reads as colour). */
export const STRATA = [
  ['#f0b884', '#e8946a', '#d27262', '#b45a6e', '#905486', '#6a5290', '#4a4c8a'], // Hollowdeep: sand → salmon → mauve → slate
  ['#d8c0ec', '#b8a8ea', '#98a0e2', '#7a96d6', '#5e88c4', '#4c6cac', '#3e5290'], // Prism: lilac → periwinkle → blue
  ['#c8cc8a', '#a8bc7a', '#86aa78', '#6a987c', '#568880', '#46727a', '#3a5a6e'], // Sporewood: olive → sage → teal
  ['#f4cc84', '#e6aa62', '#d08a56', '#b86c54', '#9a585e', '#7c4a68', '#5e406c'], // Sunken: sandstone → terracotta → plum
  ['#d8a0a0', '#c47a76', '#ac5e5e', '#904a56', '#743e52', '#5a344c', '#442c44'], // Emberdeep: ash rose → brick → maroon
  ['#e0d4c4', '#c8b0bc', '#ac90b0', '#9076a8', '#76609c', '#5e4e8c', '#483e78'], // Tomb: bone → mauve → violet
];
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
