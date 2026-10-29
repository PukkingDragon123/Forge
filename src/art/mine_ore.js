// Chunky, saturated ore art in the style of a classic pixel ore sheet: ore lumps set in grey rock,
// rounded nuggets, bevelled ingots, crystal clusters on a stone base and big faceted gems. Each has
// a bold tinted outline, a hard top-left highlight and a white glint. Used in the rock face, the
// flying haul and the minecart pile.
import { Painter } from './pixel.js';
import { materialSprite } from './sprites.js';
import { hash2, mixHex, hexToRgb, clamp } from '../core/math.js';
import { MATERIALS } from '../data/materials.js';

const cache = new Map();
const memo = (k, f) => { let c = cache.get(k); if (!c) { c = f(); cache.set(k, c); if (cache.size > 300) cache.delete(cache.keys().next().value); } return c; };
const ROCK = ['#241e30', '#433c54', '#625a74', '#827c96', '#a6a2b8', '#ccc8d8', '#eceaf2'].map(hexToRgb);

function oreRamp(col) {
  return [mixHex(col, '#160c22', 0.8), mixHex(col, '#2a1838', 0.52), mixHex(col, '#3a2850', 0.24), col, mixHex(col, '#fff0d0', 0.34), mixHex(col, '#ffffff', 0.62), '#ffffff'].map(hexToRgb);
}
const shadeAt = (rmp, v) => rmp[clamp(Math.round(v * (rmp.length - 1)), 0, rmp.length - 1)];

/** Filled blob with a lit top-left: (cx,cy) radii, ramp; lumpiness from seed. */
function blob(p, cx, cy, rx, ry, rmp, seed, lift = 0) {
  p.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const wob = (hash2(Math.round(Math.atan2(ny, nx) * 4), 1, seed) - 0.5) * 0.25;
    if (nx * nx + ny * ny > 1 - Math.abs(wob)) return null;
    const lit = -nx * 0.55 - ny * 0.8; // light from the upper left
    let v = 0.45 + lit * 0.42 + lift;
    if (nx < -0.2 && ny < -0.25 && nx * nx + ny * ny > 0.25 && nx * nx + ny * ny < 0.55) v = 0.92; // rim highlight
    return shadeAt(rmp, clamp(v, 0.12, 0.98));
  });
}

function crystalShard(p, bx, by, h, w, lean, rmp) {
  // a hexagonal prism seen side-on: lit left face, mid centre ridge, dark right face, bright tip
  const tipX = bx + lean * h, tipY = by - h;
  for (let j = 0; j <= h; j++) {
    const t = j / h, cx = bx + lean * j, half = w * (t < 0.78 ? 1 : (1 - t) / 0.22);
    for (let i = -Math.ceil(half); i <= Math.ceil(half); i++) {
      if (Math.abs(i) > half) continue;
      const u = i / Math.max(1, half);
      const v = u < -0.35 ? 0.82 : u < 0.15 ? 0.6 : 0.32;
      p.set(Math.round(cx + i), Math.round(by - j), shadeAt(rmp, v + (t > 0.75 ? 0.08 : 0)));
    }
  }
  p.set(Math.round(tipX), Math.round(tipY) + 1, [255, 255, 255]);
  p.set(Math.round(tipX - 1), Math.round(tipY) + 3, rmp[5]);
}

/** Ore art at a given size (square). Falls back to the item sprite for non-ore things. */
export function oreArt(id, size = 36) {
  return memo(id + '|' + size, () => {
    const m = MATERIALS[id];
    if (!m) return materialSprite(id, size);
    const style = m.sprite;
    const S = size, p = new Painter(S, S);
    const rmp = oreRamp(m.color), alt = oreRamp(m.color2 || m.color);
    const seed = id.length * 31 + id.charCodeAt(0);
    const c = S / 2;
    if (style === 'chunk' || style === 'meteor') {
      // a lump of grey stone with ore bulging out of it
      blob(p, c, c + 2, S * 0.42, S * 0.33, style === 'meteor' ? oreRamp('#4a4068') : ROCK, seed);
      const n = 4 + (seed % 3);
      for (let k = 0; k < n; k++) {
        const a = hash2(k, 1, seed) * Math.PI * 2, r = S * 0.18 * hash2(k, 2, seed);
        blob(p, c + Math.cos(a) * r * 1.4 - 2, c + Math.sin(a) * r, S * (0.09 + hash2(k, 3, seed) * 0.07), S * (0.08 + hash2(k, 4, seed) * 0.06), k % 3 === 2 ? alt : rmp, seed + k, 0.05);
      }
      if (style === 'meteor') for (let k = 0; k < 14; k++) { const x = Math.round(c - S * 0.3 + hash2(k, 5, seed) * S * 0.6), y = Math.round(c - S * 0.15 + hash2(k, 6, seed) * S * 0.35); if (p.alpha(x, y)) { p.set(x, y, alt[5]); p.set(x + 1, y, alt[4]); } }
    } else if (style === 'nuggets') {
      const spots = [[-0.18, 0.12, 0.2, 0.17], [0.16, 0.16, 0.18, 0.15], [0.02, -0.12, 0.17, 0.15], [0.26, -0.12, 0.11, 0.1], [-0.27, -0.08, 0.1, 0.09]];
      spots.forEach(([dx, dy, rx, ry], k) => blob(p, c + dx * S, c + dy * S + 2, rx * S, ry * S, k === 3 ? alt : rmp, seed + k));
    } else if (style === 'ingot') {
      // a bevelled bar seen from above-front: top face, front face, a bright rim between them
      const L = S * 0.13, R = S * 0.87, T = S * 0.3, M = S * 0.5, B = S * 0.72, bev = S * 0.12;
      p.poly([[L + bev, T], [R - bev, T], [R, M], [L, M]], (x, y) => shadeAt(rmp, 0.8 - ((y - T) / (M - T)) * 0.16 + (x < L + bev + 3 ? 0.1 : 0)));
      p.poly([[L, M], [R, M], [R, B], [L, B]], (x, y) => shadeAt(rmp, 0.46 - ((y - M) / (B - M)) * 0.14 + (x < L + 3 ? 0.08 : 0) - (x > R - 4 ? 0.12 : 0)));
      for (let x = Math.round(L + 1); x < R - 1; x++) p.set(x, Math.round(M), rmp[5]);
      for (let x = Math.round(L + bev + 3); x < R - bev - 4; x += 5) p.set(x, Math.round(T + 3), rmp[6]);
      p.set(Math.round(L + bev + 2), Math.round(T + 2), [255, 255, 255]);
    } else if (style === 'gem' || style === 'core') {
      // a big faceted cabochon: table on top, crown facets, a bright window, a glint
      const rx = S * 0.36, ry = S * 0.4;
      p.ellipse(c, c + 1, rx, ry, (x, y, nx, ny) => {
        const r2 = nx * nx + ny * ny;
        const facet = Math.floor((Math.atan2(ny, nx) + Math.PI) / (Math.PI / 4));
        let v = r2 < 0.22 ? 0.66 : 0.38 + ((facet % 2) ? 0.14 : 0) - nx * 0.18 - ny * 0.22;
        if (nx < -0.1 && ny < -0.1 && r2 > 0.3 && r2 < 0.5) v = 0.9;
        if (ny > 0.55) v -= 0.18;
        return shadeAt(rmp, clamp(v, 0.15, 0.97));
      });
      for (let k = -3; k <= 3; k++) p.set(Math.round(c - rx * 0.35 + k * 0.4), Math.round(c - ry * 0.45 + Math.abs(k) * 0.5), rmp[6]);
      p.set(Math.round(c - rx * 0.45), Math.round(c - ry * 0.55), [255, 255, 255]);
      p.set(Math.round(c + rx * 0.35), Math.round(c + ry * 0.3), rmp[5]);
    } else if (style === 'cluster' || style === 'crystal' || style === 'shard' || style === 'geode') {
      // crystals growing out of a stone base
      blob(p, c, S * 0.76, S * 0.4, S * 0.16, ROCK, seed);
      const n = style === 'shard' ? 3 : 5;
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0.5 : k / (n - 1);
        const bx = S * 0.24 + t * S * 0.52, h = S * (0.32 + (1 - Math.abs(t - 0.5) * 1.4) * 0.3 + hash2(k, 1, seed) * 0.08);
        crystalShard(p, bx, S * 0.76, Math.round(h), S * 0.07 + hash2(k, 2, seed) * 1.5, (t - 0.5) * 0.55, k % 2 && style !== 'shard' ? alt : rmp);
      }
    } else {
      const spr = materialSprite(id, S);
      return spr;
    }
    p.outline(mixHex(m.color, '#120a1c', 0.82));
    // a single hard glint pixel cluster
    const gx = Math.round(S * 0.32), gy = Math.round(S * 0.3);
    if (p.alpha(gx, gy)) { p.set(gx, gy, [255, 255, 255]); }
    return p.toCanvas();
  });
}
