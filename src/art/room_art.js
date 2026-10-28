// Small hand-painted props for the rooms' in-world UI: a trader's rug to lay goods on, a wooden
// arrow sign to move on, and brass merchant scales (sell mode).
import { Painter, dither } from './pixel.js';
import { hash2, fbm2, shadeHex, hexToRgb } from '../core/math.js';
import { withLights, ramp9, pick, ink, plank, nail } from './handpaint.js';

const cache = new Map();
const memo = (k, f) => { let c = cache.get(k); if (!c) { c = withLights([{ x: 0, y: -200, r: 900, k: 0.7 }], f); cache.set(k, c); } return c; };

/** A woven rug in perspective (wider at the front), with fringe and a border pattern. */
export function rugCanvas(w, h, col = '#8a3a2a', seed = 3) {
  return memo('rug|' + w + 'x' + h + col + seed, () => {
    const p = new Painter(w + 8, h + 8);
    const inset = Math.round(w * 0.08);
    const pts = [[4 + inset, 4], [w + 4 - inset, 4], [w + 4, h + 2], [4, h + 2]];
    const base = hexToRgb(col), dark = hexToRgb(shadeHex(col, -0.4)), light = hexToRgb(shadeHex(col, 0.3)), gold = [214, 170, 90];
    p.poly(pts, (x, y) => {
      const t = (y - 4) / h, lx = (x - 4 - inset * (1 - t)) / (w - 2 * inset * (1 - t));
      const bx = Math.min(lx, 1 - lx), by = Math.min(t, 1 - t);
      if (bx < 0.06 || by < 0.1) return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 ? dark : gold;
      if (bx < 0.09 || by < 0.15) return light;
      const motif = Math.abs(((lx * 8) % 1) - 0.5) + Math.abs(((t * 4) % 1) - 0.5) < 0.22;
      const weave = (x + y) % 2 === 0 && hash2(x, y, seed) > 0.7;
      return motif ? gold : weave ? dark : dither(x, y, 0.15 + t * 0.2) ? light : base;
    });
    for (let x = 6; x < w + 2; x += 3) { p.set(x, h + 3, [220, 200, 150]); p.set(x, h + 4, [180, 160, 110]); if (hash2(x, 1, seed) > 0.4) p.set(x, h + 5, [160, 140, 100]); }
    ink(p, [...pts, pts[0]], seed, { col: [40, 18, 12], thick: 1.2 });
    return p.toCanvas();
  });
}

/** Wooden arrow sign on a stake: "move on". */
export function arrowSign() {
  return memo('arrow', () => {
    const p = new Painter(86, 70);
    plank(p, [[38, 26], [46, 26], [47, 70], [37, 70]], 5);
    plank(p, [[4, 8], [66, 6], [82, 18], [66, 32], [5, 30]], 9, true);
    nail(p, 41, 18);
    ink(p, [[14, 19], [58, 18]], 3, { col: [70, 40, 20], thick: 0.6 });
    return p.toCanvas();
  });
}

/** Brass merchant scales (click to sell). */
export function scalesCanvas(tilt = 0) {
  return memo('scales|' + tilt, () => {
    const p = new Painter(64, 56);
    const brass = ramp9(['#3a2a10', '#6a4a1a', '#9a7030', '#c89a48', '#f0d080'], '#ffe0a0', '#1a2a2a');
    ink(p, [[32, 54], [32, 12]], 1, { col: [120, 90, 40], thick: 2.4 });
    p.ellipse(32, 53, 14, 3, (x, y, nx) => pick(brass, 0.5 - nx * 0.3, x, y));
    const dy = tilt * 6;
    ink(p, [[8, 14 + dy], [56, 14 - dy]], 2, { col: [150, 110, 50], thick: 1.6 });
    for (const [x, y] of [[10, 14 + dy], [54, 14 - dy]]) {
      ink(p, [[x, y], [x - 7, y + 16]], 3, { col: [110, 90, 60], thick: 0.5 });
      ink(p, [[x, y], [x + 7, y + 16]], 4, { col: [110, 90, 60], thick: 0.5 });
      p.ellipse(x, y + 17, 9, 3, (px, py, nx, ny) => pick(brass, 0.6 - ny * 0.3 - nx * 0.2, px, py));
    }
    p.ellipse(32, 10, 3, 3, brass[7]);
    return p.toCanvas();
  });
}
void fbm2;
