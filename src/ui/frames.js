// Hand-made pixel UI kit: everything is cut, nailed, stitched or inked by hand — wobbly edges, unequal
// corners, ink with line-weight variation, individually forged nails, warped planks, deckled paper,
// wax and chalk. Diegetic pieces (paper tags on twine, hanging signs, chalk slates, wax seals, nailed
// scraps) sit beside the classic panel styles. Every result is a cached canvas keyed by style + size.
import { Painter } from '../art/pixel.js';
import { voxify, voxRelief } from './vox_ui.js';
import { hash2, fbm2, clamp, mixHex, shadeHex } from '../core/math.js';
import {
  INK, HM, WAX, cutMask, tornMask, makeMask, fillMask, inkEdge, wobbleLine, nail, rope, stitches, paperTone, grainTone, waxSeal, slateTone, hexOf,
} from './handmade.js';

const cache = new Map();
function cached(key, make) {
  let c = cache.get(key);
  if (!c) {
    c = make();
    cache.set(key, c);
    if (cache.size > 900) cache.delete(cache.keys().next().value);
  }
  return c;
}

// ------------------------------------------------------------------ palettes (dark → light)
export const OUT = INK;
export const PAL = {
  wood: HM.plank.slice(0, 7),
  woodDark: HM.plankDark.slice(0, 7),
  woodLight: HM.plank.slice(1),
  steel: ['#0f171a', '#182529', '#213337', '#2b4245', '#385556', '#4f716e', '#7c9a92'],
  gold: HM.brass,
  ember: ['#3a0e06', '#6a1a0a', '#94300e', '#b84818', '#d86424', '#f08a3a', '#ffb070'],
  parch: HM.paper.slice(1),
  leather: HM.leather,
  leatherDark: ['#170c07', '#22130b', '#2e1a10', '#3a2216', '#482b1c', '#5a3826', '#744c34'],
  leatherRed: ['#280c0a', '#3e1410', '#561c16', '#6c261c', '#843224', '#a04430', '#c06446'],
  leatherGreen: ['#121c10', '#1c2a18', '#263a20', '#304828', '#3c5a32', '#4e7040', '#6a8c56'],
  stone: ['#1a1714', '#2a2622', '#3a342e', '#4a433b', '#5c5348', '#73695b', '#928674'],
  ink: ['#120b0c', '#1a1212', '#221817', '#2b201d', '#372a25', '#4a3a32'],
};
const ACCENT = { gold: HM.brass, purple: WAX.purple, blue: PAL.steel, red: WAX.red, green: WAX.green };
const pick = (pal, t) => pal[clamp(Math.floor(t * pal.length), 0, pal.length - 1)];
const seedOf = (...a) => a.reduce((h, v) => (h * 31 + (typeof v === 'number' ? v : [...String(v)].reduce((q, c) => q * 7 + c.charCodeAt(0), 3))) | 0, 17) >>> 0;

/** Bevel shading by edge distance + side: lit rim on top/left, dark rim bottom/right. */
function rim(mask, x, y, e) {
  if (e > 2) return 0;
  const up = !mask.inside(x, y - e) || !mask.inside(x - e, y);
  const dn = !mask.inside(x, y + e) || !mask.inside(x + e, y);
  if (up && !dn) return e === 1 ? 2 : 1;
  if (dn) return e === 1 ? -2 : -1;
  return 0;
}
/** Irregular hammer dimples: -1 shadowed (upper-left) wall, +1 lit wall, 0 none. */
function hammered(x, y, seed) {
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const cx = Math.floor(x / 6) + ox, cy = Math.floor(y / 5) + oy;
    if (hash2(cx, cy, seed) < 0.55) continue;
    const px = cx * 6 + hash2(cx, cy, seed + 1) * 6, py = cy * 5 + hash2(cx, cy, seed + 2) * 5;
    const r = 1.1 + hash2(cx, cy, seed + 3) * 1.2;
    const dx = x + 0.5 - px, dy = y + 0.5 - py;
    if (dx * dx + dy * dy > r * r) continue;
    return dx + dy < -0.4 ? -1 : dx + dy > 0.4 ? 1 : 0;
  }
  return 0;
}
/** Hand-forged iron corner guard (triangular plate with a nail), size varies per corner. */
function cornerGuard(p, cx, cy, sx, sy, s, seed) {
  const S = PAL.steel;
  for (let j = 0; j < s; j++) for (let i = 0; i < s - j; i++) {
    const wob = hash2(i, j, seed) > 0.9 && i + j > s - 3;
    if (wob) continue;
    const edge = i + j >= s - 2;
    let c = edge ? INK : i === 0 || j === 0 ? S[5] : i + j >= s - 3 ? S[1] : (i + j) % 5 === 0 ? S[3] : S[4];
    if ((sx < 0 && i === 0) || (sy < 0 && j === 0)) c = edge ? INK : S[2];
    p.set(cx + i * sx, cy + j * sy, c);
  }
  const ns = s >= 11 ? 4 : 3;
  nail(p, sx > 0 ? cx + 2 : cx - 2 - ns + 1, sy > 0 ? cy + 2 : cy - 2 - ns + 1, seed, { s: ns, pal: HM.nail, dent: false, kind: 'round' });
}

// ------------------------------------------------------------------ LEATHER (dialogs, plates)
function paint_leather(w, h, opts = {}) {
  const tone = opts.tone || 'brown';
  const key = `leather|${w}|${h}|${tone}|${opts.stitch !== false}|${opts.rivets !== false}|${opts.seed || 0}`;
  return cached(key, () => {
    const T = { brown: PAL.leather, dark: PAL.leatherDark, red: PAL.leatherRed, green: PAL.leatherGreen, leather: PAL.leather }[tone] || PAL.leather;
    const seed = opts.seed || seedOf('lea', w, h);
    const p = new Painter(w, h);
    const mask = cutMask(w, h, seed, { amp: 1, r: h > 20 ? 4 : 2 });
    fillMask(p, mask, (x, y, e) => {
      let t = 0.45 + (fbm2(x * 0.06, y * 0.06, 3, seed) - 0.5) * 0.4 + (hash2(x, y, seed) - 0.5) * 0.12;
      if (hash2(x, y >> 1, seed + 4) > 0.95) t -= 0.12; // pores
      const worn = fbm2(x * 0.04 + 9, y * 0.04, 2, seed + 9);
      if (worn > 0.62 && (x + y) % 2) t += 0.18; // worn lighter patches
      t += rim(mask, x, y, e) * 0.14;
      if (e === 3) t -= 0.05;
      return pick(T, clamp(t));
    });
    if (opts.stitch !== false && w > 18 && h > 14) stitches(p, 0, 0, w, h, h > 30 && w > 30 ? 5 : 4, seed);
    inkEdge(p, mask, { seed });
    if (opts.rivets !== false && w > 30 && h > 26) {
      const base = clamp(Math.round(Math.min(w, h) * 0.2), 8, 16);
      const patch = w >= 70 && h >= 60 ? Math.floor(hash2(1, 2, seed) * 4) : -1;
      [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]].forEach(([x, y, sx, sy], i) => {
        if (i === patch) {
          // stitched leather patch instead of iron
          const ps = base + 2, P = T.map((c) => shadeHex(c, 0.12));
          for (let j = 1; j < ps; j++) for (let k = 1; k < ps - j * 0.4; k++) p.set(x + k * sx, y + j * sy, P[k === 1 || j === 1 ? 5 : 3 + ((k + j) % 3 === 0 ? -1 : 0)]);
          for (let k = 2; k < ps - 2; k += 2) p.set(x + k * sx, y + (ps - 2) * sy, HM.thread[1]);
          return;
        }
        cornerGuard(p, x, y, sx, sy, base + Math.round((hash2(i, 5, seed) - 0.5) * 4), seed + i);
      });
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ WOOD (warped plank board, individual nails)
function paint_wood(w, h, opts = {}) {
  const key = `wood|${w}|${h}|${opts.tone || 'oak'}|${opts.vertical ? 1 : 0}|${opts.nails !== false}`;
  return cached(key, () => {
    const W = opts.tone === 'dark' ? HM.plankDark : HM.plank;
    const seed = seedOf('wood', w, h, opts.tone || '');
    const p = new Painter(w, h);
    const vert = !!opts.vertical;
    const span = vert ? w : h, len = vert ? h : w;
    // plank boundaries: uneven widths, gently warped
    const bounds = [0];
    while (bounds[bounds.length - 1] < span) bounds.push(bounds[bounds.length - 1] + clamp(Math.round(span / Math.max(1, Math.round(span / 13))) + Math.round((hash2(bounds.length, 1, seed) - 0.5) * 5), 7, 22));
    bounds[bounds.length - 1] = span + 2;
    const warp = (a, k) => Math.round(Math.sin(a * 0.025 + k * 1.7) * 1.1 + (fbm2(a * 0.05, k, 2, seed) - 0.5) * 1.4);
    const plankAt = (a, b) => { for (let k = 1; k < bounds.length; k++) if (b < bounds[k] + (k < bounds.length - 1 ? warp(a, k) : 0)) return k - 1; return bounds.length - 2; };
    const mask = cutMask(w, h, seed, { amp: 1, r: 3 });
    const gt = grainTone(W, seed);
    fillMask(p, mask, (x, y, e) => {
      const a = vert ? y : x, b = vert ? x : y;
      const k = plankAt(a, b);
      const top = bounds[k] + (k > 0 ? warp(a, k) : 0), bot = bounds[k + 1] + (k + 1 < bounds.length - 1 ? warp(a, k + 1) : 0);
      const inP = b - top, pw = bot - top;
      if (k > 0 && inP === 0) return INK; // gap
      let t = gt(vert ? b : a, vert ? a : b, e, k * 2.3) + (hash2(k, 3, seed) - 0.5) * 0.16;
      if (inP === 1) t += 0.16; else if (inP === pw - 1) t -= 0.18;
      // knot
      const kx = Math.floor(hash2(k, 7, seed) * len), kd = Math.hypot((a - kx) * 0.5, inP - pw / 2);
      if (hash2(k, 11, seed) > 0.5 && kd < 2.4) t = kd < 1 ? 0.08 : t - 0.2;
      t += rim(mask, x, y, e) * 0.12;
      return W[clamp(Math.floor(clamp(t) * W.length), 0, W.length - 1)];
    });
    inkEdge(p, mask, { seed });
    if (opts.nails !== false && w > 24 && h > 24) {
      for (let k = 0; k < bounds.length - 1; k++) {
        const mid = Math.round((bounds[k] + Math.min(span, bounds[k + 1])) / 2) - 2;
        if (mid + 4 >= span) continue;
        for (const end of [4, len - 8]) {
          if (hash2(k, end, seed) > 0.88) continue; // a missing nail
          const jit = Math.round((hash2(k, end + 1, seed) - 0.5) * 3);
          const x = vert ? mid + jit : end + jit, y = vert ? end + jit : mid + jit;
          nail(p, x, y, seed + k * 13 + end, { s: hash2(k, end + 2, seed) > 0.7 ? 3 : 4 });
        }
      }
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ PLANK (bar with forged iron end straps)
function paint_plank(w, h, opts = {}) {
  const key = `plank|${w}|${h}|${opts.inset ? 1 : 0}|${opts.tone || ''}`;
  return cached(key, () => {
    const p = new Painter(w, h);
    const seed = seedOf('plank', w, h);
    const W = opts.tone === 'light' ? HM.plank.slice(1) : HM.plank;
    const mask = cutMask(w, h, seed, { amp: 1, r: 2 });
    const gt = grainTone(W, seed);
    fillMask(p, mask, (x, y, e) => W[clamp(Math.floor(clamp(gt(x, y, e) + rim(mask, x, y, e) * 0.14) * W.length), 0, W.length - 1)]);
    if (opts.inset && h > 10) {
      const ix = Math.round(h * 0.6) + 3, iy = Math.round(h * 0.28), iw = w - ix * 2, ih = h - iy * 2;
      const im = cutMask(iw, ih, seed + 3, { amp: 1, r: 1, chip: false });
      fillMask(p, im, (x, y, e) => (e === 1 && (!im.inside(x, y - 1) || !im.inside(x - 1, y)) ? '#0c0706' : hash2(x, y, 3) > 0.92 ? '#2a1812' : '#1a0f0b'), ix, iy);
      for (let x = 0; x < iw; x++) if (im.inside(x, ih - 1)) p.set(ix + x, iy + ih, W[5]);
    }
    // forged iron straps wrapping both ends
    const sw = clamp(Math.round(h * 0.38), 4, 9), S = PAL.steel;
    for (const [x0, dir] of [[3, 1], [w - 3 - sw, -1]]) {
      for (let y = 0; y < h; y++) for (let i = 0; i < sw; i++) {
        const x = x0 + i;
        if (!mask.inside(x, y)) continue;
        const wob = Math.round((fbm2(y * 0.3, x0, 1, seed) - 0.5) * 1.6);
        if (i === 0 + Math.max(0, wob) || i === sw - 1 + Math.min(0, wob)) { p.set(x, y, INK); continue; }
        let c = i === 1 ? S[5] : i === sw - 2 ? S[1] : S[3];
        if (y <= 1) c = S[6]; else if (y >= h - 2) c = S[0];
        const hm = hammered(x, y, seed);
        if (hm) c = hm < 0 ? S[4] : S[2];
        p.set(x, y, c);
      }
      nail(p, x0 + Math.floor((sw - 3) / 2), Math.floor(h / 2) - 1, seed + dir, { s: 3, dent: false });
    }
    inkEdge(p, mask, { seed });
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ IRON / STEEL (hand-forged plate)
function forgedPlate(w, h, opts = {}) {
  const S = opts.dark ? PAL.steel.map((c) => shadeHex(c, -0.22)) : PAL.steel;
  const seed = seedOf('iron', w, h, opts.glyph || '');
  const p = new Painter(w, h);
  const mask = cutMask(w, h, seed, { amp: 1, r: Math.min(w, h) > 20 ? 3 : 2 });
  fillMask(p, mask, (x, y, e) => {
    let t = 0.62 - (y / h) * 0.3 + (fbm2(x * 0.04, y * 0.06, 2, seed) - 0.5) * 0.18;
    const hm = hammered(x, y, seed);
    t += hm * 0.1 + rim(mask, x, y, e) * 0.16;
    if (e === 3 && (!mask.inside(x, y + 3) || !mask.inside(x + 3, y))) t += 0.06;
    return pick(S.slice(1), clamp(t));
  });
  inkEdge(p, mask, { seed });
  if (opts.rivets !== false && w > 14 && h > 14) {
    const rs = Math.min(w, h) >= 40 ? 4 : 3, o = Math.min(w, h) >= 30 ? 4 : 3;
    [[o, o], [w - o - rs, o], [o, h - o - rs], [w - o - rs, h - o - rs]].forEach(([x, y], i) => nail(p, x + Math.round((hash2(i, 1, seed) - 0.5) * 2), y, seed + i, { s: rs, kind: 'round', dent: false, rust: false }));
  }
  const m = Math.round(Math.min(w, h) * 0.27), th = Math.max(2, Math.round(Math.min(w, h) * 0.1));
  if (opts.glyph === 'x') {
    for (let k = 0; k < th; k++) {
      wobbleLine(p, m + k, m, w - m - th + k, h - m - 1, k === 0 ? S[0] : k === th - 1 ? S[4] : S[1], seed, { amp: 0.6 });
      wobbleLine(p, w - m - 1 - k, m, m + th - 1 - k, h - m - 1, k === 0 ? S[0] : k === th - 1 ? S[4] : S[1], seed + 1, { amp: 0.6 });
    }
  } else if (opts.glyph === 'gear') {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const teeth = Math.cos(a * 8) > 0.3 ? R * 1.05 : R * 0.82;
      if (d > teeth || d < R * 0.32) continue;
      p.set(x, y, d > teeth - 1.2 ? (dx + dy < 0 ? S[0] : S[4]) : d < R * 0.32 + 1.2 ? (dx + dy < 0 ? S[4] : S[0]) : S[1]);
    }
  }
  return p.toCanvas();
}
function paint_iron(w, h, opts = {}) {
  return cached(`iron|${w}|${h}|${opts.tone || ''}|${opts.rivets !== false}`, () => forgedPlate(w, h, { dark: opts.tone === 'dark', rivets: opts.rivets }));
}
function paint_steel(w, h, opts = {}) {
  return cached(`steel|${w}|${h}|${opts.glyph || ''}|${opts.dark ? 1 : 0}`, () => forgedPlate(w, h, opts));
}

// ------------------------------------------------------------------ PARCHMENT (deckled, nailed)
function paint_parchment(w, h, opts = {}) {
  const key = `parch|${w}|${h}|${opts.seed || 1}|${opts.burnt ?? 1}|${opts.lines ? 1 : 0}|${opts.nails ?? 'auto'}`;
  return cached(key, () => {
    const seed = (opts.seed || 1) * 977 + w * 3 + h;
    const p = new Painter(w, h);
    const mask = tornMask(w, h, seed, { depth: clamp(Math.min(w, h) * 0.05, 2, 4.5), tornCorner: w > 60 && h > 50 ? undefined : -1 });
    const tone = paperTone(HM.paper, seed, { burnt: opts.burnt ?? 1 });
    fillMask(p, mask, (x, y, e) => tone(x, y, e));
    // a fold crease
    if (w > 90 && h > 50) {
      const fx = Math.round(w * (0.3 + hash2(1, 1, seed) * 0.4));
      for (let y = 0; y < h; y++) {
        const x = fx + Math.round((fbm2(y * 0.05, 1, 2, seed) - 0.5) * 3);
        if (mask.inside(x, y) && mask.inside(x + 1, y)) { p.set(x, y, HM.paper[3], 140); p.set(x + 1, y, HM.paper[6], 120); }
      }
    }
    if (opts.lines) for (let y = 16; y < h - 10; y += 12) wobbleLine(p, 10, y, w - 11, y, HM.paper[3], seed + y, { amp: 0.5, skip: 0.12, alpha: 170 });
    p.outline('#3a2010');
    const nails = opts.nails ?? (w >= 50 && h >= 40 ? 2 : 0);
    if (nails) {
      const spots = nails === 1 ? [[Math.round(w / 2) - 2, 3]] : [[5, 4], [w - 9, 3 + Math.round(hash2(2, 2, seed) * 2)]];
      for (const [x, y] of spots) {
        // a small tear where the nail went through
        p.set(x + 4, y + 4, HM.paper[2]); p.set(x - 1, y + 3, HM.paper[3]);
        nail(p, x, y, seed + x, { s: 4 });
      }
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ OPEN BOOK
function paint_book(w, h, opts = {}) {
  return cached(`book|${w}|${h}|${opts.ribbon !== false}`, () => {
    const p = new Painter(w, h);
    const seed = seedOf('book', w, h);
    const C = PAL.leather, P = HM.paper;
    const cv = Math.max(6, Math.round(Math.min(w, h) * 0.028));
    const cover = cutMask(w, h - 2, seed, { amp: 1, r: 4 });
    fillMask(p, cover, (x, y, e) => pick(C, clamp(0.45 + (fbm2(x * 0.07, y * 0.07, 2, 3) - 0.5) * 0.5 + rim(cover, x, y, e) * 0.14)), 0, 2);
    stitches(p, 0, 2, w, h - 2, 3, seed);
    const mid = Math.floor(w / 2);
    for (let k = 0; k < 4; k++) {
      const c = k % 2 ? P[3] : P[4];
      for (let x = cv + k; x < mid - 2; x++) if (hash2(x, k, seed) > 0.08) p.set(x, h - cv - 3 + k, c);
      for (let x = mid + 2; x < w - cv - k; x++) if (hash2(x, k + 9, seed) > 0.08) p.set(x, h - cv - 3 + k, c);
    }
    for (let side = 0; side < 2; side++) {
      const x0 = side ? mid + 1 : cv, x1 = side ? w - cv - 1 : mid - 1;
      for (let x = x0; x <= x1; x++) {
        const u = side ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0);
        const top = cv + Math.round(Math.sin(u * Math.PI * 0.5) * -2 + 2 + (1 - u) * 2) + (hash2(x, 1, seed) > 0.93 ? 1 : 0);
        const bot = h - cv - 4 - Math.round((1 - u) * 2);
        for (let y = top; y <= bot; y++) {
          let t = 0.66 + (fbm2(x * 0.03 + side * 50, y * 0.03, 3, 11) - 0.5) * 0.2;
          const near = 1 - u;
          t -= Math.pow(near, 8) * 0.55 + Math.pow(near, 3) * 0.08;
          if (u > 0.96) t -= 0.16;
          const vy = Math.min(y - top, bot - y);
          if (vy < 3) t -= (3 - vy) * 0.06;
          if (y === top) t = 0.92;
          const st = fbm2(x * 0.04 + 40, y * 0.04, 3, seed);
          if (st > 0.67) t -= (st - 0.67) * 1.2;
          p.set(x, y, pick(P, clamp(t)));
        }
        p.set(x, top - 1, INK);
      }
    }
    for (let y = cv; y < h - cv - 2; y++) { p.set(mid, y, '#3a2010'); p.set(mid - 1, y, P[2]); p.set(mid + 1, y, P[2]); }
    for (let y = cv + 4; y < h - cv - 6; y += 5 + (y % 3)) p.set(mid, y, HM.thread[2]);
    inkEdge(p, { ...cover, inside: (x, y) => cover.inside(x, y - 2), w, h }, { seed });
    const cl = Math.max(10, Math.round(w * 0.05));
    const clasp = cutMask(cl * 2, 7, seed + 2, { amp: 1, r: 2 });
    fillMask(p, clasp, (x, y, e) => pick(C, 0.55 + rim(clasp, x, y, e) * 0.2), mid - cl, h - 7);
    inkEdge(p, clasp, { ox: mid - cl, oy: h - 7 });
    nail(p, mid - 2, h - 6, seed, { s: 4, kind: 'round', pal: HM.brass, dent: false, rust: false });
    const g = clamp(Math.round(Math.min(w, h) * 0.12), 9, 22);
    [[0, 2, 1, 1], [w - 1, 2, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]].forEach(([x, y, sx, sy], i) => cornerGuard(p, x, y, sx, sy, g + Math.round((hash2(i, 4, seed) - 0.5) * 4), seed + i));
    if (opts.ribbon !== false) {
      const rx = Math.round(w * 0.12), L = Math.round(h * 0.3);
      for (let y = 0; y < L; y++) {
        const sway = Math.round(Math.sin(y * 0.15) * 0.8);
        for (let i = 0; i < 6; i++) p.set(rx + i + sway, y, i === 0 || i === 5 ? INK : i === 1 ? '#d8584a' : i === 4 ? '#6e1a1a' : '#a8302a');
      }
      const sway = Math.round(Math.sin(L * 0.15) * 0.8);
      for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3) p.set(rx + i + sway, L, INK);
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ STONE TABLET
function paint_stone(w, h, opts = {}) {
  const key = `stone|${w}|${h}|${opts.tone || 'gray'}|${opts.seed || 3}`;
  return cached(key, () => {
    const seed = (opts.seed || 3) * 131 + w + h;
    const T = {
      gray: PAL.stone,
      blue: ['#121820', '#1e2834', '#283646', '#334458', '#40546a', '#566c84', '#7e94ae'],
      purple: ['#18101e', '#271a30', '#33223e', '#3f2c4c', '#4e385c', '#634a74', '#856a98'],
      ember: ['#1a100e', '#2e1c16', '#3e261c', '#4e3022', '#603c2a', '#7a4e36', '#9e6a48'],
    }[opts.tone || 'gray'] || PAL.stone;
    const p = new Painter(w, h);
    const mask = cutMask(w, h, seed, { amp: 2, r: 4, freq: 0.12 });
    fillMask(p, mask, (x, y, e) => {
      let t = 0.45 + (fbm2(x * 0.09, y * 0.09, 3, seed) - 0.5) * 0.42 + (hash2(x, y, seed) - 0.5) * 0.1;
      t += rim(mask, x, y, e) * 0.16;
      // chisel facets along the rim
      if (e <= 3 && hash2(Math.floor(x / 4), Math.floor(y / 4), seed) > 0.6) t += 0.06;
      return pick(T, clamp(t));
    });
    for (let c = 0; c < Math.max(1, Math.floor((w + h) / 60)); c++) {
      let x = Math.floor(hash2(c, 0, seed) * w), y = hash2(c, 1, seed) > 0.5 ? 2 : h - 3;
      const dy = y < 3 ? 1 : -1;
      for (let i = 0; i < 5 + hash2(c, 2, seed) * 10; i++) { if (mask.inside(x, y)) { p.set(x, y, T[0]); p.set(x + 1, y, T[5], 160); } y += dy; x += Math.floor(hash2(c, i, 99) * 3) - 1; }
    }
    inkEdge(p, mask, { seed });
    for (let x = 4; x < w - 4; x++) if (fbm2(x * 0.2, 1, 2, seed + 30) > 0.62) {
      let y = 0; while (y < 4 && !mask.inside(x, y)) y++;
      p.set(x, y, '#5a7a3a'); if (hash2(x, 2, 4) > 0.5) p.set(x, y + 1, '#3e5a2a');
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ DARK (tooltips, toasts): charcoal card
function paint_dark(w, h, opts = {}) {
  const key = `dark|${w}|${h}|${opts.accent || 'gold'}`;
  return cached(key, () => {
    const p = new Painter(w, h);
    const seed = seedOf('dark', w, h);
    const acc = ACCENT[opts.accent || 'gold'] || HM.brass;
    const I = PAL.ink;
    const mask = cutMask(w, h, seed, { amp: 1, r: 2 });
    fillMask(p, mask, (x, y, e) => {
      const n = (fbm2(x * 0.07, y * 0.07, 2, seed) - 0.5) * 0.5 + (hash2(x, y, seed) - 0.5) * 0.15;
      return I[clamp(Math.floor((0.5 + n - (y / h) * 0.25) * 4) + 1, 1, 4)];
    });
    // hand-inked accent line, one corner left open
    if (w > 12 && h > 10) {
      const open = Math.floor(hash2(4, 4, seed) * 4);
      const L = [[2, 2, w - 3, 2, acc[3]], [w - 3, 2, w - 3, h - 3, acc[2]], [w - 3, h - 3, 2, h - 3, acc[2]], [2, h - 3, 2, 2, acc[3]]];
      L.forEach(([x0, y0, x1, y1, c], i) => {
        const shrink = i === open ? 5 : 0;
        const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
        wobbleLine(p, x0, y0, x1 - sx * shrink, y1 - sy * shrink, c, seed + i, { amp: 0.4, skip: 0.05 });
      });
      if (w > 60) { const m = w >> 1; p.set(m, 1, acc[5]); p.set(m - 1, 2, acc[4]); p.set(m + 1, 2, acc[4]); p.set(m, 3, acc[3]); p.set(m, 2, acc[6]); }
    }
    inkEdge(p, mask, { seed, heavy: false });
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ GOLD (brass bars, ornate brass frames)
function paint_gold(w, h, opts = {}) {
  const key = `gold|${w}|${h}|${opts.inner || ''}|${opts.notch ? 1 : 0}`;
  return cached(key, () => {
    const G = HM.brass;
    const seed = seedOf('gold', w, h);
    const p = new Painter(w, h);
    if (h <= 40 && !opts.inner) {
      const mask = cutMask(w, h, seed, { amp: 1, r: Math.min(4, h >> 2) });
      fillMask(p, mask, (x, y, e) => {
        let t = 0.82 - (y / h) * 0.45 + hammered(x, y, seed) * 0.1 + rim(mask, x, y, e) * 0.12;
        return pick(G.slice(1), clamp(t));
      });
      if (opts.notch) { const m = w >> 1; for (let j = 0; j < Math.min(5, h >> 2); j++) for (let i = -3 + j; i <= 3 - j; i++) p.clear(m + i, j); }
      inkEdge(p, mask, { seed, ink: G[0] });
      return p.toCanvas();
    }
    const inner = opts.inner || '#2a1830';
    const mask = cutMask(w, h, seed, { amp: 1, r: 3 });
    const B = 5;
    fillMask(p, mask, (x, y, e) => {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (d >= B) return hash2(x, y, 6) > 0.85 ? shadeHex(inner, 0.06) : d === B ? '#120a0c' : inner;
      let t = 0.7 - (y / h) * 0.3 + hammered(x, y, seed) * 0.12 + rim(mask, x, y, e) * 0.14;
      if (d === B - 1) t -= 0.25;
      return pick(G.slice(1), clamp(t));
    });
    // wobbly engraved line in the brass
    wobbleLine(p, 3, 2, w - 4, 2, G[2], seed, { amp: 0.4 }); wobbleLine(p, 2, 3, 2, h - 4, G[2], seed + 1, { amp: 0.4 });
    for (const [x, y] of [[1, 1], [w - 5, 1], [1, h - 5], [w - 5, h - 5]]) nail(p, x, y, seed + x + y, { s: 3, kind: 'round', pal: G, dent: false, rust: false });
    if (w > 40) { const mx = w >> 1; p.set(mx - 1, 1, '#d8483a'); p.set(mx, 1, '#ffb3a0'); p.set(mx - 1, 2, '#8a1f20'); p.set(mx, 2, '#d8483a'); }
    inkEdge(p, mask, { seed });
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ SLOT (carved hollow)
function paint_slot(w, h, opts = {}) {
  const key = `slot|${w}|${h}|${opts.tone || 'leather'}|${opts.glow || ''}`;
  return cached(key, () => {
    const T = {
      leather: ['#140a06', '#1e110b', '#28170f', '#311d13', '#5a3520'],
      stone: ['#0e0c0c', '#191615', '#211d1c', '#2a2523', '#3e3633'],
      dark: ['#0a0709', '#120d11', '#181217', '#1e171d', '#33262f'],
    }[opts.tone || 'leather'] || ['#140a06', '#1e110b', '#28170f', '#311d13', '#5a3520'];
    const seed = seedOf('slot', w, h);
    const p = new Painter(w, h);
    const mask = cutMask(w, h, seed, { amp: 1, r: 2, chip: false });
    fillMask(p, mask, (x, y, e) => {
      const n = fbm2(x * 0.15, y * 0.15, 2, 31) * 0.6 + hash2(x, y, 31) * 0.4;
      const up = !mask.inside(x, y - e) || !mask.inside(x - e, y), dn = !mask.inside(x, y + e) || !mask.inside(x + e, y);
      if (e === 1) return dn && !up ? T[4] : T[0];
      if (e === 2 && up) return T[0];
      return T[1 + Math.floor(n * 2.6)];
    });
    if (opts.glow) fillMask(p, mask, (x, y, e) => (e <= 3 ? [null, opts.glow, opts.glow, opts.glow][e] : null));
    if (opts.glow) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask.inside(x, y)) { const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e === 2) p.set(x, y, '#000000', 90); }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ BUTTONS (objects you touch)
/**
 * style: 'gold' (brass plaque) | 'wood' (nailed plank) | 'iron' (forged plate) | 'stone' (chalk slate)
 *        | 'red' | 'green' | 'purple' (wax slab with an embossed seal).
 * state: 'idle' | 'hover' | 'down' | 'off'.  Face is h-3 tall; the bottom 3 px are its thickness.
 */
function paint_button(w, h, style = 'wood', state = 'idle') {
  const key = `btn|${w}|${h}|${style}|${state}`;
  return cached(key, () => {
    const p = new Painter(w, h);
    const fh = h - 3, fy = state === 'down' ? 2 : 0;
    const seed = seedOf('btn', w, h, style);
    const hover = state === 'hover', off = state === 'off';
    const lift = (pal) => (hover ? pal.map((c, i) => (i === 0 ? c : shadeHex(c, 0.1))) : off ? pal.map((c) => mixHex(c, '#3a3436', 0.62)) : pal);
    const wax = style === 'red' || style === 'green' || style === 'purple';
    const mask = cutMask(w, fh, seed, { amp: 1, r: wax ? Math.min(5, fh >> 1) : style === 'gold' ? 3 : 2, freq: wax ? 0.14 : 0.08 });
    // thickness: the same silhouette, 3 px lower, in the object's dark side colour
    const side = { gold: HM.brass[1], wood: HM.plank[1], iron: PAL.steel[0], stone: HM.plank[0], red: WAX.red[1], green: WAX.green[1], purple: WAX.purple[1] }[style] || HM.plank[1];
    for (let y = 0; y < fh; y++) for (let x = 0; x < w; x++) if (mask.inside(x, y)) { p.set(x, y + 3, INK); if (mask.inside(x, y - 1) && y + 2 < h) p.set(x, y + 2, off ? mixHex(side, '#3a3436', 0.6) : side); }
    const face = new Painter(w, fh);
    if (style === 'gold') {
      const G = lift(HM.brass);
      fillMask(face, mask, (x, y, e) => {
        let t = 0.86 - (y / fh) * 0.5 + hammered(x, y, seed) * 0.09 + rim(mask, x, y, e) * 0.13;
        return pick(G.slice(1), clamp(t));
      });
      const r = clamp(Math.round(Math.min(w, fh) * 0.16), 2, 4);
      wobbleLine(face, r + 1, r, w - r - 2, r, G[2], seed, { amp: 0.4, alpha: 190 });
      wobbleLine(face, r + 1, fh - r - 1, w - r - 2, fh - r - 1, G[6], seed + 1, { amp: 0.4, alpha: 160 });
      if (w >= 34 && fh >= 11) { nail(face, 2, Math.floor(fh / 2) - 1, seed, { s: 3, kind: 'round', pal: G, dent: false, rust: false }); nail(face, w - 5, Math.floor(fh / 2) - 1, seed + 1, { s: 3, kind: 'round', pal: G, dent: false, rust: false }); }
    } else if (style === 'iron') {
      const S = lift(PAL.steel);
      fillMask(face, mask, (x, y, e) => pick(S.slice(1), clamp(0.72 - (y / fh) * 0.4 + hammered(x, y, seed) * 0.1 + rim(mask, x, y, e) * 0.15)));
      if (w >= 24 && fh >= 12) [[2, 2], [w - 5, 2], [2, fh - 5], [w - 5, fh - 5]].forEach(([x, y], i) => nail(face, x, y, seed + i, { s: 3, kind: 'round', dent: false, rust: false }));
    } else if (style === 'stone') {
      // chalk slate in a thin nailed frame
      const W = lift(HM.plank), sl = slateTone(seed);
      fillMask(face, mask, (x, y, e) => {
        const d = Math.min(x, y, w - 1 - x, fh - 1 - y);
        if (d < 3) return W[clamp(4 + rim(mask, x, y, e) + (d === 2 ? -2 : 0) + (hash2(x >> 2, y, seed) > 0.8 ? -1 : 0), 0, 7)];
        let c = sl(x, y, e);
        if (y === fh - 4 && hash2(x, 1, seed) > 0.86) c = HM.chalk[0]; // a little chalk dust
        return off ? mixHex(c, '#3a3436', 0.4) : hover ? shadeHex(c, 0.08) : c;
      });
      face.set(1, 1, HM.nail[4]); face.set(w - 2, fh - 2, HM.nail[2]);
    } else if (wax) {
      const X = lift(WAX[style]);
      fillMask(face, mask, (x, y, e) => {
        let t = 0.62 - (y / fh) * 0.35 + (fbm2(x * 0.12, y * 0.2, 2, seed) - 0.5) * 0.14 + rim(mask, x, y, e) * 0.16;
        if (e === 3) t -= (!mask.inside(x, y - 3) || !mask.inside(x - 3, y)) ? 0.16 : -0.1; // pressed groove
        return pick(X, clamp(t));
      });
      if (w >= 56 && fh >= 13) waxSeal(face, 2, Math.floor((fh - 11) / 2), 11, X, seed, style === 'red' ? 'skull' : style === 'green' ? 'check' : 'star');
    } else {
      // wood: a nailed, warped plank
      const W = lift(HM.plank);
      const gt = grainTone(W, seed);
      fillMask(face, mask, (x, y, e) => W[clamp(Math.floor(clamp(gt(x, y, e) + 0.12 + rim(mask, x, y, e) * 0.14) * W.length), 0, W.length - 1)]);
      if (w >= 30 && fh >= 11) { nail(face, 3, Math.floor(fh / 2) - 2, seed, { s: 4 }); nail(face, w - 7, Math.floor(fh / 2) - 1 - (seed & 1), seed + 5, { s: hash2(1, 1, seed) > 0.5 ? 3 : 4 }); }
    }
    inkEdge(face, mask, { seed });
    p.blit(face, 0, fy);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ RIBBON BANNER (15 px tall cloth)
function paint_ribbon(w, color = 'red') {
  const key = `ribbon|${w}|${color}`;
  return cached(key, () => {
    const pal = {
      red: ['#2a0808', '#561414', '#821e1e', '#aa2e2a', '#c8463a', '#e47460'],
      blue: ['#081430', '#12285a', '#1c3e84', '#2a58aa', '#3e76cc', '#7aaef0'],
      green: ['#08200c', '#12401a', '#1e602a', '#2c803a', '#3ea04c', '#86d886'],
      purple: ['#16082a', '#2e1452', '#4a2278', '#64329e', '#8048c0', '#c08af0'],
      gold: ['#3a1c06', '#7a420e', '#b06a1a', '#d89026', '#f2b434', '#ffe08a'],
      brown: ['#22120a', '#4a2a14', '#6a3e22', '#8a5530', '#a86c40', '#d09a66'],
    }[color] || ['#2a0808', '#561414', '#821e1e', '#aa2e2a', '#c8463a', '#e47460'];
    const h = 15, seed = seedOf('rib', w, color);
    const p = new Painter(w, h);
    const tail = 9;
    for (const side of [0, 1]) {
      for (let y = 4; y < h; y++) for (let i = 0; i < tail; i++) {
        const x = side ? w - 1 - i : i;
        if (i < 4 && Math.abs(y - 10) < (4 - i) * 0.9) continue; // fork notch
        if (i === 0 && hash2(y, side, seed) > 0.6) continue; // frayed
        p.set(x, y, i > tail - 3 ? pal[0] : y === 4 ? pal[2] : pal[1]);
      }
    }
    for (let x = tail - 3; x < w - tail + 3; x++) {
      const wt = Math.round((fbm2(x * 0.08, 1, 2, seed) - 0.5) * 1.6), wb = Math.round((fbm2(x * 0.08, 5, 2, seed) - 0.5) * 1.6);
      for (let y = Math.max(0, wt); y < h - 4 + Math.min(0, wb); y++) {
        const wave = Math.sin(x * 0.18) * 0.5;
        const v = y <= Math.max(0, wt) ? 5 : y === Math.max(0, wt) + 1 ? 4 : y < 6 + wave ? 3 : y > h - 7 ? 1 : 2;
        p.set(x, y, pal[v]);
      }
    }
    for (let x = tail - 2; x < w - tail + 2; x++) if ((x + (hash2(x, 1, seed) > 0.8 ? 1 : 0)) % 3 === 0) { p.set(x, 2, '#e8c070', 200); p.set(x, h - 7, '#b88a40', 220); }
    p.outline(INK);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ BARS (HP, progress)
function paint_bar(w, h, fill, colors = ['#7a1a22', '#d03a3a', '#ff8a7a'], back = '#1a0d10') {
  const p = new Painter(w, h);
  p.rect(0, 0, w, h, INK);
  p.rect(1, 1, w - 2, h - 2, back);
  for (let x = 1; x < w - 1; x++) p.set(x, 1, '#000000', 90);
  const fw = Math.round((w - 2) * clamp(fill, 0, 1));
  if (fw > 0) {
    for (let y = 1; y < h - 1; y++) {
      const v = (y - 1) / Math.max(1, h - 3);
      const c = v < 0.3 ? colors[2] : v < 0.75 ? colors[1] : colors[0];
      for (let x = 1; x <= fw; x++) p.set(x, y, c);
    }
    if (w > 30) for (let x = 6; x <= fw; x += 6) for (let y = 2; y < h - 1; y++) p.set(x, y, colors[0], 110);
    if (h >= 6) for (let x = 2; x < fw; x += 1) if ((x >> 1) % 5 === 0) p.set(x, 2, '#ffffff', 150);
    if (fw < w - 2) for (let y = 1; y < h - 1; y++) p.set(fw + 1, y, colors[2], 150);
  }
  p.clear(0, 0); p.clear(w - 1, 0); p.clear(0, h - 1); p.clear(w - 1, h - 1);
  return p.toCanvas();
}

// ------------------------------------------------------------------ DIVIDER (hand-inked flourish)
function paint_divider(w, color = 'gold') {
  const key = `div|${w}|${color}`;
  return cached(key, () => {
    const c = color === 'gold' ? [HM.brass[1], HM.brass[4], HM.brass[6]] : ['#3a2a1a', '#8a6a4a', '#c8ac88'];
    const seed = seedOf('div', w, color);
    const p = new Painter(w, 7);
    const m = w >> 1;
    for (let x = 7; x < w - 7; x++) {
      const taper = Math.min(x - 7, w - 8 - x) / (w * 0.5);
      const wob = Math.round((fbm2(x * 0.06, 2, 2, seed) - 0.5) * 1.2);
      p.set(x, 3 + wob, c[1]);
      if (taper > 0.25) p.set(x, 4 + wob, c[0]);
    }
    for (const sx of [1, -1]) {
      const x0 = sx > 0 ? 6 : w - 7;
      p.set(x0, 2, c[1]); p.set(x0 + sx, 1, c[1]); p.set(x0 + 2 * sx, 1, c[2]); p.set(x0 + 3 * sx, 2, c[1]); p.set(x0 + 2 * sx, 3, c[0]);
      p.set(x0 - sx, 3, c[2]); p.set(x0 - 2 * sx, 4, c[1]); p.set(x0 - 3 * sx, 4, c[0]);
    }
    for (let j = -3; j <= 3; j++) for (let i = -(3 - Math.abs(j)); i <= 3 - Math.abs(j); i++) p.set(m + i, 3 + j, j < 0 || i < 0 ? c[2] : c[1]);
    p.set(m, 3, '#fff6d8');
    p.outline(INK);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ CHAIN (vertical blue-steel links)
function paint_chain(len, opts = {}) {
  return cached(`chain|${len}|${opts.width || 11}`, () => {
    const W = opts.width || 11;
    const p = new Painter(W, len);
    const S = PAL.steel;
    const L = 12, step = 9;
    for (let y0 = -2, k = 0; y0 < len; y0 += step, k++) {
      if (k % 2 === 0) {
        for (let j = 0; j < L; j++) for (let i = 0; i < W; i++) {
          const dx = (i + 0.5 - W / 2) / (W / 2), dy = (j + 0.5 - L / 2) / (L / 2);
          const d = dx * dx + dy * dy;
          if (d > 1 || d < 0.28) continue;
          let c = S[3];
          if (dx < -0.25 && dy < 0.3) c = S[5];
          if (dx < -0.55 && dy < -0.1) c = S[6];
          if (dx > 0.35 || dy > 0.55) c = S[1];
          if (d < 0.42) c = S[2];
          if (hash2(i, y0 + j, 3) > 0.93) c = HM.rust[2];
          p.set(i, y0 + j, c);
        }
      } else {
        const cx = Math.floor(W / 2) - 2;
        for (let j = -2; j < L + 2; j++) { p.set(cx, y0 + j, S[2]); p.set(cx + 1, y0 + j, S[5]); p.set(cx + 2, y0 + j, S[4]); p.set(cx + 3, y0 + j, S[1]); }
      }
    }
    p.outline(INK);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ SIGN (arrow signpost)
function paint_sign(w, h, opts = {}) {
  return cached(`sign|${w}|${h}|${opts.dir || 'right'}`, () => {
    const p = new Painter(w, h);
    const seed = seedOf('sign', w, h);
    const W = HM.plank;
    const bh = Math.round(h * 0.62), tip = Math.round(bh * 0.6);
    // post
    const px0 = Math.round(w * 0.32);
    const post = makeMask(6, h - bh + 4, (x, y) => x > (y > h - bh ? (hash2(y, 1, seed) > 0.7 ? 1 : 0) : 0));
    const gp = grainTone(HM.plankDark, seed, 'y');
    fillMask(p, post, (x, y, e) => HM.plankDark[clamp(Math.floor(clamp(gp(x, y, e) + rim(post, x, y, e) * 0.15) * 7), 0, 6)], px0, bh - 2);
    inkEdge(p, post, { ox: px0, oy: bh - 2 });
    const board = cutMask(w, bh, seed, { amp: 1, r: 2 });
    const arrow = makeMask(w, bh, (x, y) => { const t = x - (w - tip); return board.inside(x, y) && !(t > 0 && Math.abs(y + 0.5 - bh / 2) > (bh / 2) * (1 - t / tip)); });
    const gt = grainTone(W, seed);
    fillMask(p, arrow, (x, y, e) => W[clamp(Math.floor(clamp(gt(x, y, e) + 0.1 + rim(arrow, x, y, e) * 0.14) * 8), 0, 7)]);
    inkEdge(p, arrow, { seed });
    nail(p, 4, Math.round(bh / 2) - 2, seed, { s: 3 });
    nail(p, px0 + 1, Math.round(bh / 2) - 2, seed + 1, { s: 4 });
    if (opts.dir === 'left') { const q = new Painter(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = p.get(w - 1 - x, y); if (v && v[3]) q.set(x, y, [v[0], v[1], v[2]], v[3]); } return q.toCanvas(); }
    return p.toCanvas();
  });
}

// ================================================================== DIEGETIC PIECES
// Each returns a canvas with an `inner` rect {x, y, w, h} for laying out text/content on it.

/**
 * Paper tag on a twine string (luggage tag). Canvas is w × (h + string); the tag body starts at y = string.
 * opts: { tone: 'manila'|'paper'|'brass'|'leather', string = 12, seed }
 */
function paint_tag(w, h, opts = {}) {
  const str = opts.string ?? 12, tone = opts.tone || 'manila';
  return cached(`tag|${w}|${h}|${tone}|${str}|${opts.seed || 0}`, () => {
    const seed = seedOf('tag', w, h, tone, opts.seed || 0);
    const p = new Painter(w, h + str);
    const clip = Math.min(Math.round(w * 0.26), 12);
    const cut = cutMask(w, h, seed, { amp: 1, r: 2 });
    const mask = makeMask(w, h, (x, y) => cut.inside(x, y) && x + y >= clip && (w - 1 - x) + y >= clip);
    const P = tone === 'brass' ? HM.brass : tone === 'leather' ? PAL.leather : tone === 'paper' ? HM.paper : HM.manila;
    const pt = paperTone(P, seed);
    const hx = Math.round(w / 2), hy = Math.max(4, Math.round(clip * 0.7) + 1);
    fillMask(p, mask, (x, y, e) => {
      if (tone === 'brass') return pick(P.slice(1), clamp(0.8 - (y / h) * 0.4 + hammered(x, y, seed) * 0.1 + rim(mask, x, y, e) * 0.13));
      if (tone === 'leather') return pick(P, clamp(0.5 + (fbm2(x * 0.08, y * 0.08, 2, seed) - 0.5) * 0.4 + rim(mask, x, y, e) * 0.14));
      const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy);
      if (d < 4.6 && d > 3.6) return P[3]; // reinforcement ring
      return pt(x, y, e);
    }, 0, str);
    if (tone === 'leather') stitches(p, 0, str, w, h, 3, seed);
    inkEdge(p, { ...mask, inside: (x, y) => mask.inside(x, y - str), w, h: h + str }, { seed });
    // twine loop: two strands from the top converge into the eyelet
    for (let y = 0; y < str + hy - 1; y++) {
      const t = y / (str + hy - 2), spread = Math.round((1 - t) * 1.5 + t * 2.5);
      for (const s of [-1, 1]) {
        const x = hx + s * spread - (s > 0 ? 1 : 0);
        p.set(x, y, (y + (s > 0 ? 1 : 0)) % 3 ? HM.twine[3] : HM.twine[1]);
        p.set(x + s, y, INK, 150);
      }
    }
    // brass eyelet with the twine passing through the hole
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const d = Math.hypot(i, j);
      if (d > 2.8) continue;
      if (d < 1.4) p.set(hx + i, str + hy + j, j > 0 ? HM.twine[1] : '#0c0806');
      else p.set(hx + i, str + hy + j, HM.brass[i + j < 0 ? 5 : i + j > 1 ? 2 : 4]);
    }
    const c = p.toCanvas();
    c.inner = { x: 3, y: str + hy + 4, w: w - 6, h: h - hy - 7 };
    return c;
  });
}

/**
 * Wooden board hanging from two ropes (or chains). Canvas is w × (h + hang).
 * opts: { hang = 14, chain = false, planks = auto, tone: 'oak'|'dark', seed }
 */
function paint_hangSign(w, h, opts = {}) {
  const hang = opts.hang ?? 14;
  return cached(`hang|${w}|${h}|${hang}|${opts.chain ? 1 : 0}|${opts.tone || ''}|${opts.seed || 0}`, () => {
    const seed = seedOf('hang', w, h, opts.seed || 0);
    const p = new Painter(w, h + hang);
    const W = opts.tone === 'dark' ? HM.plankDark : HM.plank;
    const ax = [Math.round(w * 0.16), Math.round(w * 0.84) - 2];
    // ropes / chains behind the board
    for (const [i, x] of ax.entries()) {
      const top = i ? x - 3 : x + 3;
      if (opts.chain) { const c = paint_chain(hang + 6, { width: 7 }); p.blit(c, x - 3, -2); }
      else rope(p, top, 0, x, hang + 4, { pal: HM.rope, thick: 2 });
    }
    const mask = cutMask(w, h, seed, { amp: 1, r: 3 });
    const n = opts.planks || (h >= 26 ? 2 : 1);
    const gt = grainTone(W, seed);
    const seam = (x) => Math.round(h / n + Math.sin(x * 0.04 + seed) * 1.1);
    fillMask(p, mask, (x, y, e) => {
      const k = n > 1 && y >= seam(x) ? 1 : 0;
      if (n > 1 && y === seam(x)) return INK;
      let t = gt(x, y, e, k * 3) + 0.06 + (k ? -0.06 : 0.04) + rim(mask, x, y, e) * 0.14;
      if (n > 1 && y === seam(x) + 1) t += 0.14; else if (n > 1 && y === seam(x) - 1) t -= 0.16;
      return W[clamp(Math.floor(clamp(t) * W.length), 0, W.length - 1)];
    }, 0, hang);
    inkEdge(p, { ...mask, inside: (x, y) => mask.inside(x, y - hang), w, h: h + hang }, { seed });
    // rope eyes: nails where the ropes are tied, plus a lower nail per plank end
    for (const [i, x] of ax.entries()) {
      nail(p, x - 1, hang + 2, seed + i, { s: 4, kind: 'round' });
      if (!opts.chain) { p.set(x - 2, hang + 1, HM.rope[3]); p.set(x + 2, hang + 1, HM.rope[2]); p.set(x - 2, hang + 2, HM.rope[2]); }
    }
    if (n > 1) for (const [i, x] of [[0, 4], [1, w - 8]]) nail(p, x, hang + seam(x) + 3, seed + 7 + i, { s: 3 });
    const c = p.toCanvas();
    c.inner = { x: 6, y: hang + 4, w: w - 12, h: h - 8 };
    return c;
  });
}

/** Chalk slate in a thin nailed wooden frame. opts: { chalk = true (stub on the ledge), seed } */
function paint_slate(w, h, opts = {}) {
  return cached(`slate|${w}|${h}|${opts.chalk !== false}|${opts.seed || 0}`, () => {
    const seed = seedOf('slate', w, h, opts.seed || 0);
    const p = new Painter(w, h);
    const f = clamp(Math.round(Math.min(w, h) * 0.07), 3, 6);
    const mask = cutMask(w, h, seed, { amp: 1, r: 2 });
    const W = HM.plank, gx = grainTone(W, seed), gy = grainTone(W, seed + 1, 'y'), sl = slateTone(seed);
    fillMask(p, mask, (x, y, e) => {
      const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
      if (dx < f || dy < f) {
        const horiz = dy < f && (dy <= dx || dx >= f);
        // mitred corner joint
        if (Math.abs(dx - dy) < 0.5 && dx < f) return W[1];
        let t = (horiz ? gx(x, y, e) : gy(x, y, e)) + 0.1 + rim(mask, x, y, e) * 0.14;
        if ((horiz && (dy === f - 1)) || (!horiz && dx === f - 1)) t = 0.08; // inner lip shadow
        return W[clamp(Math.floor(clamp(t) * W.length), 0, W.length - 1)];
      }
      let c = sl(x, y, e);
      if (y === f || x === f) c = HM.slate[0];
      if (y >= h - f - 2 && hash2(x, y, seed) > 0.5) c = HM.chalk[y === h - f - 1 ? 1 : 0]; // chalk dust
      return c;
    });
    inkEdge(p, mask, { seed });
    [[1, 1], [w - 5, 1], [1, h - 5], [w - 5, h - 5]].forEach(([x, y], i) => { if (hash2(i, 3, seed) < 0.8) nail(p, x + (f > 4 ? 1 : 0), y + (f > 4 ? 1 : 0), seed + i, { s: 3, dent: false }); });
    if (opts.chalk !== false && w >= 60) {
      const cx = w - f - 14, cy = h - f + 1;
      for (let i = 0; i < 7; i++) { p.set(cx + i, cy - 1, i ? HM.chalk[3] : HM.chalk[2]); p.set(cx + i, cy, i === 6 ? HM.chalk[1] : HM.chalk[2]); }
      p.set(cx - 1, cy, INK); p.set(cx + 7, cy - 1, INK); for (let i = 0; i < 7; i++) p.set(cx + i, cy + 1, INK);
    }
    const c = p.toCanvas();
    c.inner = { x: f + 3, y: f + 3, w: w - f * 2 - 6, h: h - f * 2 - 6 };
    return c;
  });
}
export const CHALK = HM.chalk[3];

/** Wax seal. d = diameter (≥ 9). opts: { color: 'red'|'green'|'purple'|'blue'|'gold'|'black', glyph, ribbon } */
function paint_seal(d, opts = {}) {
  const color = opts.color || 'red', glyph = opts.glyph || 'anvil';
  return cached(`seal|${d}|${color}|${glyph}|${opts.ribbon || ''}`, () => {
    const seed = seedOf('seal', d, color, glyph);
    const W = d + (opts.ribbon ? 12 : 6), H = d + (opts.ribbon ? 11 : 7);
    const p = new Painter(W, H);
    if (opts.ribbon) {
      const R = WAX[opts.ribbon] || WAX.red;
      const y0 = Math.round(d * 0.55), L = H - y0, rw = Math.max(4, Math.round(d * 0.22));
      for (const s of [-1, 1]) for (let j = 0; j < L; j++) for (let i = 0; i < rw; i++) {
        const x = Math.round(W / 2 + s * (1 + j * 0.42) + (s < 0 ? -i : i));
        if (j >= L - 2 && Math.abs(i - (rw - 1) / 2) < (j - L + 3) * 0.9) continue; // swallow-tail notch
        p.set(x, y0 + j, i === 0 ? R[s < 0 ? 4 : 3] : i === rw - 1 ? R[1] : (j + i) % 5 === 0 ? R[2] : R[3]);
      }
    }
    waxSeal(p, Math.round((W - d) / 2), 2, d, WAX[color] || WAX.red, seed, glyph);
    p.outline(INK);
    return p.toCanvas();
  });
}

/** Torn parchment scrap held by nails. opts: { nails: 1|2, seed, lines } */
function paint_scrap(w, h, opts = {}) {
  return cached(`scrap|${w}|${h}|${opts.nails ?? 1}|${opts.seed || 0}|${opts.lines ? 1 : 0}`, () => {
    const seed = seedOf('scrap', w, h, opts.seed || 0);
    const p = new Painter(w, h);
    const mask = tornMask(w, h, seed, { depth: clamp(Math.min(w, h) * 0.08, 2.5, 5), cornerSize: Math.min(w, h) * 0.22 });
    // slight skew so the scrap hangs a little askew from its nail
    const sk = (hash2(1, 9, seed) - 0.5) * 0.06;
    const skewed = makeMask(w, h, (x, y) => mask.inside(x - Math.round((y - h / 2) * sk), y));
    const tone = paperTone(HM.paper, seed, { burnt: false });
    fillMask(p, skewed, (x, y, e) => tone(x, y, e));
    if (opts.lines) for (let y = 14; y < h - 8; y += 10) wobbleLine(p, 8, y, w - 9, y, HM.paper[3], seed + y, { amp: 0.6, skip: 0.15, alpha: 160 });
    p.outline('#3a2010');
    const nails = opts.nails ?? 1;
    const spots = nails === 2 ? [[6, 4], [w - 10, 5]] : [[Math.round(w / 2) - 2, 3]];
    for (const [x, y] of spots) {
      // paper puckers around the nail
      p.set(x - 1, y + 4, HM.paper[3]); p.set(x + 4, y + 5, HM.paper[2]); p.set(x + 1, y + 5, HM.paper[3]);
      nail(p, x, y, seed + x, { s: 4 });
    }
    const c = p.toCanvas();
    c.inner = { x: 6, y: 9, w: w - 12, h: h - 15 };
    return c;
  });
}

/** Vertical hanging cord (rope or twine) canvas of length len. */
function paint_cord(len, opts = {}) {
  return cached(`cord|${len}|${opts.twine ? 1 : 0}`, () => {
    const p = new Painter(4, len);
    rope(p, 1, 0, 1, len - 1, { pal: opts.twine ? HM.twine : HM.rope, thick: 2 });
    return p.toCanvas();
  });
}

export function clearFrameCache() { cache.clear(); }

// ------------------------------------------------------------------ voxel versions
// Every piece above is the design; what the game draws is its voxel relief (see ui/vox_ui.js).
export const leather = voxify('leather', paint_leather, { relief: 'emboss' });
export const wood = voxify('wood', paint_wood, { relief: 'emboss' });
export const plank = voxify('plank', paint_plank, { relief: 'emboss' });
export const iron = voxify('iron', paint_iron, { relief: 'emboss' });
export const steel = voxify('steel', paint_steel, { relief: 'emboss' });
export const parchment = voxify('parchment', paint_parchment, { relief: 'flat' });
export const book = voxify('book', paint_book, { relief: 'flat' });
export const stone = voxify('stone', paint_stone, { relief: 'emboss' });
export const dark = voxify('dark', paint_dark, { relief: 'flat' });
export const gold = voxify('gold', paint_gold, { relief: 'emboss' });
export const slot = voxify('slot', paint_slot, { relief: 'emboss' });
export const button = voxify('button', paint_button, { relief: 'emboss' });
export const ribbon = voxify('ribbon', paint_ribbon, { relief: 'emboss' });
export const divider = voxify('divider', paint_divider, { relief: 'emboss' });
export const chain = voxify('chain', paint_chain, { relief: 'emboss' });
export const sign = voxify('sign', paint_sign, { relief: 'emboss' });
export const tag = voxify('tag', paint_tag, { relief: 'flat' });
export const hangSign = voxify('hangSign', paint_hangSign, { relief: 'emboss' });
export const slate = voxify('slate', paint_slate, { relief: 'flat' });
export const seal = voxify('seal', paint_seal, { relief: 'emboss' });
export const scrap = voxify('scrap', paint_scrap, { relief: 'flat' });
export const cord = voxify('cord', paint_cord, { relief: 'emboss' });
/** Meter: the empty and full bars are voxel reliefs, composited at the current fill (no rebuild per value). */
const barScratch = new Map();
export function bar(w, h, fill, colors = ['#7a1a22', '#d03a3a', '#ff8a7a'], back = '#1a0d10') {
  const k = w + '|' + h + '|' + colors.join(',') + '|' + back;
  const empty = voxRelief('bar0|' + k, () => paint_bar(w, h, 0, colors, back), { V: 1 });
  const full = voxRelief('bar1|' + k, () => paint_bar(w, h, 1, colors, back), { V: 1 });
  let c = barScratch.get(k);
  if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; barScratch.set(k, c); }
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(empty, 0, 0);
  const fw = Math.round(Math.max(0, Math.min(1, fill)) * w);
  if (fw > 0) ctx.drawImage(full, 0, 0, fw, h, 0, 0, fw, h);
  return c;
}
