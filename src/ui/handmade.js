// Hand-made pixel primitives shared by frames and cards: hand-cut silhouettes with wobbly edges and
// unequal corners, ink outlines with line-weight variation, individually forged nails, twine and rope,
// wax, chalk and paper textures. Warm, firelit palette (Dungeon Meshi tones).
import { hash2, fbm2, clamp, mixHex, shadeHex } from '../core/math.js';

export const INK = '#1c100c';
export const HM = {
  paper: ['#4a2e18', '#7a5430', '#a67c4c', '#c9a06a', '#dfbe88', '#eed6a8', '#f8ead0'],
  manila: ['#4e3218', '#7e5a2e', '#a88044', '#c8a05e', '#dcba7a', '#ead29e', '#f6e6c4'],
  slate: ['#101416', '#181e20', '#20282a', '#283234', '#323e3f', '#43504f', '#5e6a66'],
  chalk: ['#8c8a80', '#b4b0a4', '#d8d4c8', '#f0ecdf'],
  twine: ['#3e2a16', '#6a4c2a', '#94723e', '#bc9a62', '#dcc08a'],
  rope: ['#2e1e0e', '#54381c', '#7c5a30', '#a47e4a', '#c8a46a', '#e2c690'],
  brass: ['#2a1606', '#5a360e', '#8a5a1a', '#b4822a', '#d4a63e', '#ecc862', '#fbe9a4'],
  nail: ['#120e0e', '#262020', '#3e3634', '#5e5450', '#857a72', '#ada298', '#d4cabc'],
  rust: ['#2e140a', '#552612', '#7a3a1a', '#9a5226', '#b86e38'],
  plank: ['#24130a', '#3a2010', '#522e18', '#6a3e22', '#84522e', '#a06a3c', '#bc8650', '#d4a068'],
  plankDark: ['#160c07', '#22130b', '#301b10', '#3e2416', '#4e2e1c', '#623a24', '#7a4c30', '#94603e'],
  leather: ['#26130a', '#3a1e10', '#4e2a16', '#62361e', '#784428', '#905634', '#ac6e44'],
  thread: ['#8a6a44', '#c8a470', '#ecd29c'],
};
export const WAX = {
  red: ['#220406', '#46090c', '#6e1414', '#96221c', '#b8342a', '#d4523c', '#ec8462'],
  green: ['#0a1a0c', '#122e16', '#1c4420', '#285a2a', '#367436', '#4c8e44', '#78b064'],
  purple: ['#1a0a22', '#2c1238', '#401c50', '#562866', '#6e3880', '#8a52a0', '#b07ec4'],
  blue: ['#08121e', '#0e2034', '#16304c', '#204466', '#2c5a84', '#4276a2', '#6c9ec4'],
  gold: ['#2a1606', '#5a360e', '#8a5a1a', '#b4822a', '#d4a63e', '#ecc862', '#fbe9a4'],
  black: ['#0a0808', '#141010', '#1e1818', '#2a2222', '#382e2c', '#4a3e3a', '#66584e'],
};

export const hexOf = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
const pick = (pal, t) => pal[clamp(Math.floor(t * pal.length), 0, pal.length - 1)];

// ------------------------------------------------------------------ hand-cut silhouettes
/**
 * A hand-cut rectangle mask: each edge wobbles by up to `amp` px, corners get different radii
 * (and an occasional chip). Returns {w,h,m:Uint8Array,inside(x,y)}.
 */
export function cutMask(w, h, seed = 1, o = {}) {
  const amp = o.amp ?? 1, r = o.r ?? 3, f = o.freq ?? 0.08;
  const off = (t, k) => Math.round((clamp((fbm2(t * f, k * 3.7 + 1, 2, seed) - 0.5) * 2.6, -1, 1) + 1) * amp * 0.5 + (o.inset || 0));
  const top = [], bot = [], lef = [], rig = [];
  for (let x = 0; x < w; x++) { top[x] = off(x, 0); bot[x] = h - 1 - off(x, 1); }
  for (let y = 0; y < h; y++) { lef[y] = off(y, 2); rig[y] = w - 1 - off(y, 3); }
  const rr = [0, 1, 2, 3].map((i) => (o.corners ? o.corners[i] : Math.max(1, Math.round(r * (0.55 + hash2(i, 9, seed) * 0.9)))));
  const chip = o.chip ?? true;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y < top[x] || y > bot[x] || x < lef[y] || x > rig[y]) continue;
    let ok = true;
    const cs = [[lef[y] + rr[0], top[x] + rr[0], -1, -1, 0], [rig[y] - rr[1], top[x] + rr[1], 1, -1, 1], [lef[y] + rr[2], bot[x] - rr[2], -1, 1, 2], [rig[y] - rr[3], bot[x] - rr[3], 1, 1, 3]];
    for (const [cx, cy, sx, sy, i] of cs) {
      const dx = (x - cx) * sx, dy = (y - cy) * sy;
      if (dx > 0 && dy > 0) {
        const rad = rr[i] + 0.35;
        if (dx * dx + dy * dy > rad * rad) ok = false;
        // chipped corner: a little bite out of one corner
        if (chip && i === Math.floor(hash2(3, 3, seed) * 4) && dx + dy > rr[i] * 1.1) ok = false;
      }
    }
    if (ok) m[x + y * w] = 1;
  }
  return { w, h, m, inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[x + y * w] === 1 };
}

/** Deckled / torn paper mask (irregular fibrous edge, optional torn corner). */
export function tornMask(w, h, seed = 1, o = {}) {
  const depth = o.depth ?? 3;
  const m = new Uint8Array(w * h);
  const tornCorner = o.tornCorner ?? Math.floor(hash2(7, 7, seed) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = Math.min(x, y, w - 1 - x, h - 1 - y);
    const n = fbm2(x * 0.18, y * 0.18, 2, seed) * depth + hash2(x, y, seed + 3) * 1.1 + fbm2(x * 0.6, y * 0.6, 1, seed + 5) * 0.9;
    if (e + 0.5 < n * 0.62) continue;
    if (tornCorner >= 0 && tornCorner < 4) {
      const cx = tornCorner & 1 ? w - 1 - x : x, cy = tornCorner & 2 ? h - 1 - y : y;
      const cut = (o.cornerSize ?? Math.min(w, h) * 0.16) + (hash2(x + y, 2, seed) - 0.5) * 2.2;
      if (cx + cy < cut) continue;
    }
    m[x + y * w] = 1;
  }
  return { w, h, m, inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[x + y * w] === 1 };
}

/** Build a mask from a predicate. */
export function makeMask(w, h, fn) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fn(x, y)) m[x + y * w] = 1;
  return { w, h, m, inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[x + y * w] === 1 };
}

/** Fill mask pixels via fn(x, y, edgeDist) → colour|null. edgeDist = distance (≤4) to the cut edge. */
export function fillMask(p, mask, fn, ox = 0, oy = 0) {
  const { w, h, inside } = mask;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    let e = 5;
    for (let d = 1; d <= 4 && e === 5; d++) if (!inside(x - d, y) || !inside(x + d, y) || !inside(x, y - d) || !inside(x, y + d)) e = d;
    const c = fn(x, y, e);
    if (c) p.set(ox + x, oy + y, c);
  }
}

/**
 * Hand-inked outline on the mask's own border pixels: full-weight dark ink on the shadow side
 * (bottom/right, doubled to 2px), thinner warm ink on the lit side (top/left) with an occasional
 * lighter skip, like a brush line.
 */
export function inkEdge(p, mask, o = {}) {
  const { w, h, inside } = mask;
  const ox = o.ox || 0, oy = o.oy || 0, ink = o.ink || INK, seed = o.seed || 1;
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const up = !inside(x, y - 1), lf = !inside(x - 1, y), dn = !inside(x, y + 1), rt = !inside(x + 1, y);
    if (!(up || lf || dn || rt)) {
      // second pixel of the heavy shadow-side line
      if (o.heavy !== false && (!inside(x, y + 2) || !inside(x + 2, y))) pts.push([x, y, 'shade']);
      continue;
    }
    pts.push([x, y, dn || rt ? 'heavy' : 'lit']);
  }
  for (const [x, y, k] of pts) {
    const c = p.get(ox + x, oy + y);
    const under = c && c[3] ? hexOf(c) : ink;
    if (k === 'heavy') p.set(ox + x, oy + y, ink);
    else if (k === 'shade') p.set(ox + x, oy + y, mixHex(under, ink, 0.45));
    else p.set(ox + x, oy + y, hash2(x, y, seed) > 0.9 ? mixHex(ink, under, 0.55) : mixHex(ink, under, 0.18));
  }
}

/** A wobbly hand-drawn line (ink or engraving) from (x0,y0) to (x1,y1). */
export function wobbleLine(p, x0, y0, x1, y1, col, seed = 1, o = {}) {
  const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
  for (let i = 0; i <= len; i++) {
    const t = i / (len || 1);
    const wob = Math.round((fbm2(i * 0.12, 3, 2, seed) - 0.5) * 2 * (o.amp ?? 0.9));
    const x = Math.round(x0 + (x1 - x0) * t + nx * wob), y = Math.round(y0 + (y1 - y0) * t + ny * wob);
    if (o.skip && hash2(i, 5, seed) < o.skip) continue;
    p.set(x, y, col, o.alpha ?? 255);
  }
}

// ------------------------------------------------------------------ hardware
/** One hand-forged nail head. kind: 'round' | 'square' | 'bent' | 'rivet'; s = 3..5 px. */
export function nail(p, x, y, seed = 1, o = {}) {
  const N = o.pal || HM.nail;
  const kinds = ['round', 'square', 'round', 'bent'];
  const kind = o.kind || kinds[Math.floor(hash2(x, y, seed) * kinds.length)];
  const s = o.s || 4;
  const rusty = o.rust ?? hash2(y, x, seed + 1) > 0.6;
  const put = (i, j, c) => p.set(x + i, y + j, c);
  // dent / shadow in the surface around the head
  if (o.dent !== false) { put(s, s - 1, INK); put(s - 1, s, INK); put(s, s, mixHex(INK, '#000', 0.2)); }
  if (kind === 'square') {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) put(i, j, i === 0 || j === 0 ? N[4] : i === s - 1 || j === s - 1 ? N[1] : N[3]);
    put(0, 0, N[2]); put(1, 1, N[5]);
  } else if (kind === 'bent') {
    // head knocked sideways: a short shank visible
    put(0, 1, N[4]); put(1, 0, N[4]); put(1, 1, N[5]); put(2, 1, N[3]); put(1, 2, N[2]); put(0, 2, N[3]); put(2, 2, N[1]);
    put(3, 2, N[3]); put(4, 3, N[2]); put(3, 3, N[1]);
  } else {
    const rows = s >= 5 ? ['.ab..', 'adeb.', 'beecf', '.ccff', '..ff.'] : s === 4 ? ['.ab.', 'adeb', 'becf', '.cf.'] : ['ab.', 'bdc', '.cf'];
    const map = { a: N[3], b: N[4], d: N[6], e: N[5], c: N[2], f: N[1] };
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') put(i, j, map[ch]); }));
  }
  if (rusty) { put(s - 2, s - 2, HM.rust[2]); if (s > 3) put(1, s - 2, HM.rust[1]); }
}

/** Twisted rope / twine between two points (sags by `sag` px). pal: HM.rope or HM.twine. */
export function rope(p, x0, y0, x1, y1, o = {}) {
  const pal = o.pal || HM.rope;
  const thick = o.thick ?? 2;
  const len = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  const sag = o.sag || 0;
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    const vertical = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
    for (let k = 0; k < thick; k++) {
      const tw = ((i + k * 2) >> 1) % 3; // twist pattern
      const c = k === 0 ? pal[tw === 0 ? pal.length - 2 : pal.length - 3] : k === thick - 1 ? pal[tw === 1 ? 1 : 2] : pal[tw === 2 ? 2 : 3];
      if (vertical) p.set(Math.round(x) + k, Math.round(y), c); else p.set(Math.round(x), Math.round(y) + k, c);
    }
    if (o.outline !== false) {
      if (vertical) { p.set(Math.round(x) - 1, Math.round(y), INK); p.set(Math.round(x) + thick, Math.round(y), INK); }
      else { p.set(Math.round(x), Math.round(y) - 1, INK); p.set(Math.round(x), Math.round(y) + thick, INK); }
    }
  }
}

/** Irregular hand stitching along a rectangle inset `i` px from the edges of a w×h region. */
export function stitches(p, x0, y0, w, h, i, seed = 1, o = {}) {
  const T = o.pal || HM.thread, hole = o.hole || INK;
  const run = (len, put) => {
    let s = 0;
    while (s < len) {
      const sl = 2 + (hash2(s, 1, seed) > 0.7 ? 1 : 0), gap = 1 + (hash2(s, 2, seed) > 0.75 ? 1 : 0);
      const wob = hash2(s, 3, seed) > 0.85 ? 1 : 0;
      for (let k = 0; k < sl && s + k < len; k++) put(s + k, wob, k === 0 ? T[2] : k === sl - 1 ? T[0] : T[1]);
      put(s + sl, wob, hole, 150);
      s += sl + gap;
    }
  };
  run(w - i * 2, (k, wb, c, a) => { p.set(x0 + i + k, y0 + i + wb, c, a); });
  run(w - i * 2, (k, wb, c, a) => { p.set(x0 + i + k, y0 + h - 1 - i - wb, c, a); });
  run(h - i * 2 - 2, (k, wb, c, a) => { p.set(x0 + i + wb, y0 + i + 1 + k, c, a); });
  run(h - i * 2 - 2, (k, wb, c, a) => { p.set(x0 + w - 1 - i - wb, y0 + i + 1 + k, c, a); });
}

// ------------------------------------------------------------------ surfaces
/** Paper fill: fibres, mottling, darkened edges, stains. Returns colour for (x, y, edgeDist). */
export function paperTone(P, seed, o = {}) {
  return (x, y, e) => {
    const fib = (fbm2(x * 0.6, y * 0.09, 2, seed + 2) - 0.5) * 0.08;
    let t = 0.68 + (fbm2(x * 0.04, y * 0.04, 3, seed + 5) - 0.5) * 0.28 + fib;
    if (e <= 1) t = o.burnt ? 0.06 : 0.3;
    else if (e === 2) t -= 0.16;
    else if (e === 3) t -= 0.07;
    const st = fbm2(x * 0.05 + 40, y * 0.05, 3, seed + 2);
    if (st > 0.64) t -= (st - 0.64) * 1.2;
    if (Math.abs(st - 0.64) < 0.012) t -= 0.12; // tide-line of the stain
    const v = clamp(t, 0, 0.999) * (P.length - 1), i = Math.floor(v), f = v - i;
    if (f > 0.56) return P[Math.min(i + 1, P.length - 1)];
    return f > 0.44 && (x + y) % 2 ? P[Math.min(i + 1, P.length - 1)] : P[i];
  };
}

/** Wood plank fill (grain runs along x). Warped boundary handled by caller. */
export function grainTone(W, seed, along = 'x') {
  return (x, y, e, ph = 0) => {
    const a = along === 'x' ? x : y, b = along === 'x' ? y : x;
    const g = Math.sin(a * 0.09 + Math.sin(b * 0.55 + ph) * 1.4 + fbm2(a * 0.035, b * 0.2 + ph, 2, seed) * 8);
    let t = 0.55 + g * 0.12 + (fbm2(a * 0.3, b * 0.8, 2, seed + 3) - 0.5) * 0.2;
    if (hash2(a >> 2, b, seed) > 0.95) t -= 0.14;
    return t;
  };
}

/** Wax blob seal (diameter d) with pressed rim, embossed glyph and drips; drawn into p at (x, y). */
export function waxSeal(p, x, y, d, pal = WAX.red, seed = 1, glyph = 'anvil') {
  const r = d / 2, cx = x + r, cy = y + r;
  // blob outline: wobbly radius
  for (let j = -2; j < d + 3; j++) for (let i = -2; i < d + 3; i++) {
    const dx = x + i + 0.5 - cx, dy = y + j + 0.5 - cy;
    const a = Math.atan2(dy, dx);
    const rad = r * (0.9 + fbm2(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4, 2, seed) * 0.22);
    const dist = Math.hypot(dx, dy);
    if (dist > rad) continue;
    const nx = dx / rad, ny = dy / rad;
    let t = 0.55 - (nx + ny) * 0.22;
    const ring = dist / rad;
    if (ring > 0.62 && ring < 0.74) t = 0.55 + (nx + ny) * 0.28; // pressed groove: inverted light
    if (ring > 0.9) t -= 0.18;
    if (hash2(i, j, seed) > 0.94) t += 0.08;
    p.set(x + i, y + j, pick(pal, clamp(t)));
  }
  // drips
  const nd = 1 + Math.floor(hash2(1, 1, seed) * 2);
  for (let k = 0; k < nd; k++) {
    const a = Math.PI * (0.25 + hash2(k, 4, seed) * 0.6);
    const px = cx + Math.cos(a) * r * 0.95, py = cy + Math.sin(a) * r * 0.95;
    const L = 2 + Math.floor(hash2(k, 5, seed) * 3);
    for (let s = 0; s < L; s++) { p.set(Math.round(px), Math.round(py + s), pal[s === L - 1 ? 2 : 3]); p.set(Math.round(px) + 1, Math.round(py + s), pal[2]); }
  }
  // embossed glyph
  if (glyph === 'none') return;
  const G = SEAL_GLYPHS[glyph] || SEAL_GLYPHS.anvil;
  const gh = G.length, gw = G[0].length;
  const gx = Math.round(cx - gw / 2), gy = Math.round(cy - gh / 2);
  G.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== 'x') return;
    p.set(gx + i, gy + j, pal[4]);
    if (G[j + 1]?.[i] !== 'x') p.set(gx + i, gy + j + 1, pal[1]);
    if (row[i + 1] !== 'x') p.set(gx + i + 1, gy + j, pal[2]);
    if ((G[j - 1]?.[i] ?? '.') !== 'x' || (row[i - 1] ?? '.') !== 'x') p.set(gx + i, gy + j, pal[5]);
  }));
}
const SEAL_GLYPHS = {
  anvil: ['xxxxxxxx.', '.xxxxxxxx', '...xxxx..', '...xxx...', '..xxxxx..', '.xxxxxxx.'],
  hammer: ['xxxx', 'xxxx', '.x..', '.x..', '.x..'],
  star: ['..x..', '.xxx.', 'xxxxx', '.xxx.', '.x.x.'],
  skull: ['.xxx.', 'x.x.x', 'xxxxx', '.x.x.'],
  flame: ['..x.', '.xx.', '.xxx', 'xxxx', '.xx.'],
  check: ['....x', '...x.', 'x.x..', '.x...'],
  cross: ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'],
  coin: ['.xxx.', 'xx.xx', 'x.x.x', 'xx.xx', '.xxx.'],
  F: ['xxxx', 'x...', 'xxx.', 'x...', 'x...'],
};

/** Slate with erased-chalk haze. */
export function slateTone(seed) {
  const S = HM.slate;
  return (x, y, e) => {
    let t = 0.45 + (fbm2(x * 0.05, y * 0.05, 3, seed) - 0.5) * 0.3 + (hash2(x, y, seed) - 0.5) * 0.06;
    const smear = fbm2(x * 0.03 + 9, y * 0.12, 3, seed + 4);
    if (smear > 0.6) t += (smear - 0.6) * 1.1; // wiped chalk haze
    if (e <= 1) t -= 0.25;
    return S[clamp(Math.floor(t * S.length), 0, S.length - 1)];
  };
}
export { shadeHex, mixHex };
