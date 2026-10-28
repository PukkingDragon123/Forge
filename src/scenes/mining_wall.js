// 2D pixel-art painters for the mining board: rock tiles with clues, exposed ore, hollow holes,
// the carved stone board frame and the painted cave backdrop. All return canvases (cached).
import { Painter, dither } from '../art/pixel.js';
import { materialSprite } from '../art/sprites.js';
import { hash2, fbm2, mixHex, shadeHex, clamp } from '../core/math.js';
import { MATERIALS } from '../data/materials.js';

const OUT = '#100a0a';
const AURA = {
  rime: '#dff8ff', sapphire: '#cfefff', ember: '#ff8a3a', magmasteel: '#ff6a2a', ruby: '#ff4a5a',
  storm: '#ffe74a', topaz: '#ffe060', venomite: '#8fe04a', emerald: '#5aff8a', cursedore: '#c86bff',
  voidcrystal: '#a05aff', glowcap: '#5af0c8', soulstone: '#5affd0',
};
const ICY = ['rime', 'sapphire'];
const cache = new Map();
const memo = (k, f) => { let c = cache.get(k); if (!c) { c = f(); cache.set(k, c); if (cache.size > 600) cache.delete(cache.keys().next().value); } return c; };

function shader(rock, s) {
  return (x, y, f) => {
    const n = fbm2(x * 0.14, y * 0.14, 2, s) * 0.3 + hash2(x, y, s) * 0.12 - 0.2;
    const v = clamp(f + n, 0, 0.999) * (rock.length - 1);
    const i = Math.floor(v);
    return dither(x, y, v - i) ? rock[Math.min(i + 1, rock.length - 1)] : rock[i];
  };
}

function paintRock(p, T, tile, pal, s) {
  const hard = tile.t === 'hard';
  const rock = hard
    ? [shadeHex(pal.rock[0], -0.25), pal.rock[0], pal.rock[1], pal.rock[2], mixHex(pal.rock[2], '#aab3c4', 0.3)]
    : [pal.rock[1], pal.rock[2], pal.rock[3], pal.rock[4], shadeHex(pal.rock[4], 0.22)];
  const sh = shader(rock, s);
  const ch = (k) => Math.floor(hash2(k, 3, s) * (hard ? 6 : 4));
  const i = 1;
  const pts = [[i + ch(1), i], [T - i - ch(2), i], [T - i, i + ch(3)], [T - i, T - i - ch(4)], [T - i - ch(5), T - i], [i + ch(6), T - i], [i, T - i - ch(7)], [i, i + ch(8)]];
  const variant = hard ? 0 : Math.floor(hash2(7, 7, s) * 4);
  if (variant === 1) {
    p.poly(pts, () => rock[0]);
    const q = T / 4;
    [[q, q, q * 0.95, q * 0.85], [q * 3, q * 1.05, q * 0.95, q * 0.9], [q * 1.05, q * 3, q, q * 0.9], [q * 2.95, q * 3, q * 0.9, q * 0.85]].forEach(([sx, sy, rx, ry], k) => {
      p.ellipse(sx + (hash2(k, 71, s) - 0.5) * 4, sy + (hash2(k, 72, s) - 0.5) * 4, rx, ry, (x, y, nx, ny) => (p.alpha(x, y) ? sh(x, y, 0.55 - ny * 0.38 - nx * 0.12) : null));
    });
  } else if (variant === 2) {
    const bands = 3 + Math.floor(hash2(3, 3, s) * 3);
    p.poly(pts, (x, y) => sh(x, y, 0.22 + (Math.floor(((y + Math.sin(x * 0.2 + s) * 2) / T) * bands) % 2) * 0.28 + (1 - y / T) * 0.28));
    for (let b = 1; b < bands; b++) for (let x = 2; x < T - 2; x++) { const y = Math.round((b / bands) * T - Math.sin(x * 0.2 + s) * 2); if (p.alpha(x, y)) { p.set(x, y, rock[0]); p.set(x, y + 1, rock[4]); } }
  } else if (variant === 3) {
    p.poly(pts, () => rock[0]);
    p.ellipse(T / 2, T / 2 + 1, T * 0.44, T * 0.4, (x, y, nx, ny) => sh(x, y, 0.5 - ny * 0.42 - nx * 0.2 + (nx * nx + ny * ny > 0.65 && ny < -0.25 ? 0.25 : 0)));
  } else {
    const cx = T * (0.35 + hash2(1, 1, s) * 0.3), cy = T * (0.32 + hash2(2, 2, s) * 0.3);
    p.poly(pts, (x, y) => {
      const dx = x - cx, dy = y - cy;
      const f = Math.abs(dx) > Math.abs(dy) * 1.1 ? (dx < 0 ? 0.6 : 0.3) : dy < 0 ? 0.78 : 0.16;
      return sh(x, y, f);
    });
    for (const [qx, qy] of [[1, 1], [T - 1, 1], [T - 1, T - 1], [1, T - 1]]) {
      for (let k = 3; k < 30; k++) {
        const x = Math.round(cx + ((qx - cx) * k) / 30), y = Math.round(cy + ((qy - cy) * k) / 30);
        if (p.alpha(x, y)) p.set(x, y, qy < cy ? rock[4] : rock[0]);
      }
    }
  }
  for (let k = 0; k < 10; k++) {
    const x = 4 + Math.floor(hash2(k, 5, s) * (T - 8)), y = 4 + Math.floor(hash2(k, 6, s) * (T - 8));
    if (p.alpha(x, y)) { p.set(x, y, rock[4]); p.set(x + 1, y + 1, rock[0]); }
  }
  if (hard) {
    for (let k = 0; k < 3; k++) {
      let x = 6 + Math.floor(hash2(k, 11, s) * (T - 12)), y = 3;
      while (y < T - 3) { if (p.alpha(x, y)) { p.set(x, y, OUT); p.set(x + 1, y, rock[3]); } y++; x += hash2(x, y, s) > 0.62 ? (hash2(y, x, s) > 0.5 ? 1 : -1) : 0; }
    }
    for (let k = 0; k < 4; k++) { const x = 6 + Math.floor(hash2(k, 21, s) * (T - 12)), y = 6 + Math.floor(hash2(k, 22, s) * (T - 12)); if (p.alpha(x, y)) { p.set(x, y, '#e8eef6'); p.set(x - 1, y, rock[4]); p.set(x, y + 1, rock[3]); } }
  }
  if (tile.hits) {
    let y = Math.floor(T * 0.3 + hash2(3, 4, s) * T * 0.35);
    for (let x = 4; x < T - 4; x++) { y += hash2(x, 7, s) > 0.5 ? 1 : -1; p.set(x, y, OUT); p.set(x, y + 1, OUT); p.set(x, y - 1, rock[4]); }
  }
  return rock;
}

function paintVein(p, T, dir, col, s) {
  const hi = shadeHex(col, 0.5), lo = shadeHex(col, -0.4);
  for (let k = 0; k < 3; k++) {
    let a = Math.floor(T * 0.22 + hash2(k, 31, s) * T * 0.56);
    for (let d = 1; d < T * 0.48 - k * 4; d++) {
      a += hash2(d, k, s) > 0.66 ? 1 : hash2(d, k + 9, s) > 0.66 ? -1 : 0;
      const w = d < T * 0.18 ? 2 : 1;
      for (let o = 0; o < w; o++) {
        const [x, y] = dir === 'up' ? [a + o, d] : dir === 'down' ? [a + o, T - 1 - d] : dir === 'left' ? [d, a + o] : [T - 1 - d, a + o];
        if (!p.alpha(x, y)) continue;
        p.set(x, y, o === 0 ? (d % 5 === 0 ? hi : col) : lo);
      }
    }
  }
}

function paintCracks(p, T, s) {
  for (let k = 0; k < 2; k++) {
    let x = 5 + Math.floor(hash2(k, 41, s) * (T - 10)), y = 2;
    const len = Math.floor(T * 0.3 + hash2(k, 42, s) * T * 0.35);
    for (let i = 0; i < len; i++) {
      if (p.alpha(x, y)) p.set(x, y, OUT);
      y++; x += hash2(i, k, s) > 0.55 ? 1 : hash2(i, k + 3, s) > 0.55 ? -1 : 0;
      if (i === 6) { let bx = x, by = y; for (let j = 0; j < 6; j++) { bx++; by++; if (p.alpha(bx, by)) p.set(bx, by, OUT); } }
    }
  }
}

/** Unbroken tile. flags: { exposed, reveal, flare } */
export function tileCanvas(tile, pal, seed, T = 48, flags = {}) {
  const key = ['t', tile.x, tile.y, tile.t, tile.mat, tile.hits, tile.crack, JSON.stringify(tile.veins), tile.glint, tile.revealed, tile.marked, seed, T, pal.rock[2], flags.exposed ? 1 : 0, flags.flare ? 1 : 0].join('|');
  return memo(key, () => {
    const p = new Painter(T, T);
    const s = seed + tile.x * 31 + tile.y * 17;
    paintRock(p, T, tile, pal, s);
    for (const [dir, col] of Object.entries(tile.veins || {})) paintVein(p, T, dir, col, s + dir.length);
    if (tile.crack) paintCracks(p, T, s);
    if (tile.t === 'ore' && AURA[tile.mat]) {
      const c = AURA[tile.mat];
      p.innerEdge((x, y) => (hash2(x, y, s) > 0.4 ? c : null));
      if (ICY.includes(tile.mat)) for (let k = 0; k < 12; k++) { const x = 3 + Math.floor(hash2(k, 51, s) * (T - 6)), y = 3 + Math.floor(hash2(k, 52, s) * (T - 6)); if (p.alpha(x, y)) { p.set(x, y, '#ffffff'); p.set(x + 1, y, '#cfefff'); } }
    }
    if ((tile.revealed || flags.flare) && tile.t === 'hazard') {
      for (let k = 0; k < T - 12; k++) { const x = 6 + k, y = T / 2 + Math.round(Math.sin(k * 0.5) * 3); p.set(x, y, '#ff5d5d'); }
    }
    if ((tile.revealed || flags.exposed) && tile.t === 'ore' && MATERIALS[tile.mat]) {
      // ore pokes out of a jagged hole
      const r = T * 0.36, cx = T / 2, cy = T / 2 + 1;
      const pts = [];
      for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2; const rr = r * (0.8 + hash2(k, 81, s) * 0.35); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9]); }
      p.poly(pts, (x, y) => (y < cy - 3 ? '#140e0c' : '#1e1612'));
      const spr = materialSprite(tile.mat, 32);
      const sp = Painter.fromCanvas(spr);
      const sc = (T * 0.62) / 32;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const sx = Math.floor((x - (T - 32 * sc) / 2) / sc), sy = Math.floor((y - (T - 32 * sc) / 2) / sc);
        const c = sp.get(sx, sy);
        if (c && c[3] > 128 && (!tile.revealed || flags.exposed || dither(x, y, 0.55))) p.set(x, y, [c[0], c[1], c[2]]);
      }
    }
    if (tile.glint) for (let k = 0; k < 1 + tile.glint; k++) {
      const x = 8 + Math.floor(hash2(k, 61, s) * (T - 16)), y = 8 + Math.floor(hash2(k, 62, s) * (T - 16));
      p.set(x, y, '#ffffff'); p.set(x - 1, y, '#fff6c8'); p.set(x + 1, y, '#fff6c8'); p.set(x, y - 1, '#fff6c8'); p.set(x, y + 1, '#fff6c8');
    }
    if (tile.marked) for (let x = 2; x < T - 2; x++) if ((x >> 2) % 2 === 0) { p.set(x, 2, '#7aff8a'); p.set(x, T - 3, '#7aff8a'); p.set(2, x, '#7aff8a'); p.set(T - 3, x, '#7aff8a'); }
    p.outline(OUT);
    return p.toCanvas();
  });
}

/** Hollow left behind by a broken tile (recessed, inner shadow on top-left). */
export function holeCanvas(pal, seed, T = 48) {
  return memo('h|' + seed + '|' + T + pal.rock[0], () => {
    const p = new Painter(T, T);
    const back = [shadeHex(pal.rock[0], -0.55), shadeHex(pal.rock[0], -0.4), shadeHex(pal.rock[0], -0.25), pal.rock[0]];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const inner = Math.min(x, y) < 5 ? 0 : 0.35 + fbm2(x * 0.1, y * 0.1, 2, seed) * 0.5 + (y / T) * 0.2;
      const v = clamp(inner, 0, 0.999) * (back.length - 1);
      const i = Math.floor(v);
      p.set(x, y, dither(x, y, v - i) ? back[Math.min(i + 1, 3)] : back[i]);
    }
    for (let k = 0; k < 5; k++) { const x = 8 + Math.floor(hash2(k, 9, seed) * (T - 16)), y = 10 + Math.floor(hash2(k, 8, seed) * (T - 16)); p.set(x, y, pal.rock[1]); }
    return p.toCanvas();
  });
}

/** Rock chunk sprites for 2D debris. */
export function chunkCanvas(col, seed, size = 6) {
  return memo('c|' + col + seed + size, () => {
    const p = new Painter(size + 2, size + 2);
    const pts = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const r = size / 2 * (0.7 + hash2(k, seed, 3) * 0.4); pts.push([1 + size / 2 + Math.cos(a) * r, 1 + size / 2 + Math.sin(a) * r]); }
    p.poly(pts, (x, y) => (y < size / 2 ? shadeHex(col, 0.2) : shadeHex(col, -0.2)));
    p.outline(OUT);
    return p.toCanvas();
  });
}

/** Carved stone frame around the board with teal-steel corner brackets and rivets. */
export function boardFrame(pal, w, h) {
  return memo('f|' + w + 'x' + h + pal.rock[2], () => {
    const p = new Painter(w, h);
    const stone = [shadeHex(pal.rock[1], -0.2), pal.rock[2], pal.rock[3], pal.rock[4], shadeHex(pal.rock[4], 0.25)];
    const sh = shader(stone, 13);
    const B = 14;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (e >= B) continue;
      const blockX = Math.floor((x + (Math.floor(y / 12) % 2) * 9) / 18), blockY = Math.floor(y / 12);
      const mortar = (x + (Math.floor(y / 12) % 2) * 9) % 18 === 0 || y % 12 === 0;
      const lit = e < 2 ? 0.85 : e > B - 3 ? 0.1 : 0.5 + (hash2(blockX, blockY, 4) - 0.5) * 0.4;
      p.set(x, y, mortar && e > 1 && e < B - 1 ? stone[0] : sh(x, y, lit - (y / h) * 0.2));
    }
    // inner bevel shadow
    for (let x = B; x < w - B; x++) { p.set(x, B, OUT); p.set(x, B + 1, '#1a1210'); }
    for (let y = B; y < h - B; y++) { p.set(B, y, OUT); p.set(B + 1, y, '#1a1210'); p.set(w - B - 1, y, stone[3]); }
    for (let x = B; x < w - B; x++) p.set(x, h - B - 1, stone[3]);
    // teal-steel corner brackets with rivets
    const steel = ['#1c3a44', '#2a5a66', '#3a7a86', '#5aa8b0', '#9adcd8'];
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) {
      for (let a = 0; a < 26; a++) for (let b = 0; b < 26; b++) {
        if (a > 9 && b > 9) continue;
        const x = cx + sx * a, y = cy + sy * b;
        const edge = a === 0 || b === 0 || a === 25 || b === 25 || (a === 9 && b > 9) || (b === 9 && a > 9);
        p.set(x, y, edge ? OUT : steel[(a < 2 || b < 2) ? 4 : (a > 7 || b > 7) ? 1 : 2]);
      }
      for (const [rx, ry] of [[4, 4], [18, 4], [4, 18]]) { const x = cx + sx * rx, y = cy + sy * ry; p.set(x, y, steel[4]); p.set(x + sx, y, steel[1]); p.set(x, y + sy, steel[1]); p.set(x + sx, y + sy, OUT); }
    }
    p.outline(OUT);
    return p.toCanvas();
  });
}

/** Painted cave backdrop for the mining screen (static; animation is layered on top). */
export function caveBackdrop(region, pal, w, h) {
  return memo('bd|' + region + '|' + w + 'x' + h, () => {
    const p = new Painter(w, h);
    const sky = [shadeHex(pal.rock[0], -0.6), shadeHex(pal.rock[0], -0.45), shadeHex(pal.rock[0], -0.3), pal.rock[0], pal.rock[1]];
    const s = 31 + region * 7;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // vignette pool of light in the middle, rock texture everywhere
      const dx = (x - w * 0.5) / (w * 0.6), dy = (y - h * 0.45) / (h * 0.7);
      const light = clamp(1 - Math.sqrt(dx * dx + dy * dy), 0, 1);
      const n = fbm2(x * 0.02, y * 0.03, 4, s) * 0.55 + fbm2(x * 0.15, y * 0.15, 2, s + 4) * 0.15;
      const v = clamp(n * 0.6 + light * 0.55 - 0.1, 0, 0.999) * (sky.length - 1);
      const i = Math.floor(v);
      p.set(x, y, dither(x, y, v - i) ? sky[Math.min(i + 1, sky.length - 1)] : sky[i]);
    }
    // stalactites along the top, rubble along the bottom
    for (let k = 0; k < w / 18; k++) {
      const x = Math.floor(hash2(k, 1, s) * w), len = 10 + Math.floor(hash2(k, 2, s) * 40), wd = 3 + Math.floor(hash2(k, 3, s) * 7);
      for (let y = 0; y < len; y++) { const ww = Math.round(wd * (1 - y / len)); for (let i = -ww; i <= ww; i++) p.set(x + i, y, i < 0 ? sky[3] : i === 0 ? sky[4] : sky[1]); }
    }
    for (let k = 0; k < w / 10; k++) {
      const x = Math.floor(hash2(k, 4, s) * w), r = 3 + hash2(k, 5, s) * 9, y = h - 2 - hash2(k, 6, s) * 14;
      p.ellipse(x, y, r * 1.4, r, (px, py, nx, ny) => (ny < -0.3 ? sky[4] : ny > 0.4 ? sky[0] : sky[2]));
    }
    // timber supports on both sides
    const wood = ['#2a160c', '#4a2a16', '#6a4022', '#8a5a33', '#b07a45'];
    for (const bx of [Math.floor(w * 0.06), Math.floor(w * 0.94) - 16]) {
      for (let y = 0; y < h; y++) for (let x = 0; x < 16; x++) {
        const g = Math.sin(y * 0.12 + x * 0.6) * 0.15 + hash2(x, y, 7) * 0.2;
        p.set(bx + x, y, x === 0 || x === 15 ? wood[0] : wood[1 + Math.floor(clamp(0.45 + g - (x > 10 ? 0.25 : 0) + (x < 4 ? 0.2 : 0), 0, 0.99) * 4)]);
      }
      for (let y = 40; y < h; y += 90) { p.rect(bx + 5, y, 3, 3, '#9aa3b2'); p.set(bx + 5, y, '#e8eef6'); }
    }
    // crystals / mushrooms / lava by region
    const accent = pal.accent;
    for (let k = 0; k < 14; k++) {
      const x = Math.floor(hash2(k, 9, s) * w), y = Math.floor(h * 0.15 + hash2(k, 10, s) * h * 0.75);
      if (Math.abs(x - w / 2) < w * 0.25) continue;
      const col = accent[k % 2];
      const hh = 6 + Math.floor(hash2(k, 11, s) * 12);
      for (let j = 0; j < hh; j++) { const ww = Math.max(0, Math.round((1 - j / hh) * 3)); for (let i = -ww; i <= ww; i++) p.set(x + i, y - j, i < 0 ? shadeHex(col, 0.3) : shadeHex(col, -0.25)); }
      p.set(x, y - hh, '#ffffff');
    }
    return p.toCanvas();
  });
}
