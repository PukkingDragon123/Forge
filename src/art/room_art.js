// Props for the rooms' in-world UI, as voxel models: a trader's woven rug to lay goods on, a wooden
// arrow signpost to move on, and brass merchant scales (sell mode).
import { Painter, dither } from './pixel.js';
import { hash2, fbm2, shadeHex, hexToRgb } from '../core/math.js';
import { withLights, ramp9, pick, ink, plank, nail } from './handpaint.js';
import { voxify, voxObject, VoxGrid, rgb, mixRgb, vhash } from '../ui/vox_ui.js';

const cache = new Map();
const memo = (k, f) => { let c = cache.get(k); if (!c) { c = withLights([{ x: 0, y: -200, r: 900, k: 0.7 }], f); cache.set(k, c); } return c; };

/** A woven rug in perspective (wider at the front), with fringe and a border pattern. */
function paint_rugCanvas(w, h, col = '#8a3a2a', seed = 3) {
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

/** The rug is a voxel relief of its woven design. */
export const rugCanvas = voxify('rugCanvas', paint_rugCanvas, { relief: 'flat' });

const WOOD = ['#2a160c', '#45281a', '#64402a', '#86593a', '#a87650', '#c8955e'].map(rgb);
const BRASS = ['#3a2a10', '#6a4a1a', '#9a7030', '#c89a48', '#f0d080'].map(rgb);
const IRON = ['#22202a', '#3e3a46', '#6a6676', '#a09cb0'].map(rgb);

/** Wooden arrow signpost (86×70): a planked arrow board nailed to a stake. */
export function arrowSign() {
  return voxObject('arrowsign', () => {
    const g = new VoxGrid(44, 36, 6);
    // stake (grid y is up): rough square post with bark grooves
    g.box(19, 0, 2, 23, 22, 4, (x, y, z) => WOOD[(x === 19 ? 3 : x === 23 ? 1 : 2) + (vhash(x, y >> 1, 4) > 0.8 ? -1 : 0)]);
    // arrow board: two warped planks with a point, grain and nail heads
    for (let y = 20; y < 34; y++) for (let x = 1; x < 44; x++) {
      const t = x - 33, half = 7;
      if (t > 0 && Math.abs(y - 27) > half * (1 - t / 11)) continue;
      const plankIdx = y < 27 ? 0 : 1;
      const seam = y === 27;
      const grain = Math.sin(x * 0.45 + plankIdx * 2 + Math.sin(x * 0.13) * 2) > 0.75;
      const top = y === 33 || (y === 26 && plankIdx === 0);
      const col = seam ? WOOD[0] : top ? WOOD[5] : grain ? WOOD[2] : WOOD[3 + (vhash(x, y, 9) > 0.85 ? 1 : 0)];
      for (let z = 1; z < (seam ? 3 : 5); z++) g.set(x, y, z, z === (seam ? 2 : 4) ? col : WOOD[1]);
    }
    for (const [x, y] of [[4, 30], [4, 23], [20, 30], [20, 23]]) { g.set(x, y, 5, IRON[3]); g.set(x + 1, y, 5, IRON[2]); }
    return g;
  }, { w: 86, h: 70, yaw: -0.22, pitch: 0.12, pad: 1 });
}

/** Brass merchant scales (64×56); tilt 1 tips the beam toward the selling pan. */
export function scalesCanvas(tilt = 0) {
  return voxObject('scales|' + tilt, () => {
    const g = new VoxGrid(42, 38, 14);
    const cx = 21, cz = 7;
    // base: a stepped round foot
    g.fill((x, y, z) => y <= 2 && Math.hypot(x - cx, z - cz) < 9 - y * 1.5, (x, y, z) => BRASS[y === 2 ? 4 : y === 1 ? 3 : 2]);
    // post with collars
    g.box(cx - 1, 3, cz - 1, cx, 28, cz, (x, y) => BRASS[(y % 7 === 0) ? 4 : x === cx - 1 ? 3 : 1]);
    g.box(cx - 2, 29, cz - 2, cx + 1, 31, cz + 1, BRASS[3]);
    // beam (tilted by the sale)
    const dy = tilt ? 2 : 0;
    for (let x = 3; x < 39; x++) { const y = 31 + Math.round(((x - cx) / 18) * -dy); g.set(x, y, cz, BRASS[x % 6 === 0 ? 4 : 3]); g.set(x, y, cz - 1, BRASS[2]); }
    // chains and pans
    for (const [px, side] of [[4, -1], [38, 1]]) {
      const topY = 31 + Math.round(((px - cx) / 18) * -dy);
      const panY = topY - 16;
      for (let y = panY + 1; y < topY; y++) { g.set(px - 2, y, cz, IRON[(y % 2) + 1]); g.set(px + 2, y, cz, IRON[(y % 2) + 1]); }
      g.fill((x, y, z) => y >= panY - 1 && y <= panY && Math.hypot(x - px, z - cz) < (y === panY ? 6 : 4.5), (x, y) => BRASS[y === panY ? 4 : 2]);
      void side;
    }
    g.set(cx, 33, cz, BRASS[4]); g.set(cx - 1, 33, cz, BRASS[3]);
    return g;
  }, { w: 64, h: 56, yaw: -0.18, pitch: 0.28, pad: 1 });
}
void mixRgb; void dither; void fbm2;
