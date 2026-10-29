// Hand-painted props for the forge workbench and the backpack: the scorched bench with its tools,
// a cast-iron ingot mould, the open recipe book and its ribbon bookmarks, the brass FORGE plaque,
// a 2D anvil with a glowing billet, and the open leather backpack lying on the cave floor with
// its burlap cloth and the crack you toss junk into. Warm forge light, teal shadows, inked edges.
import { voxify } from '../ui/vox_ui.js';
import { Painter, dither } from './pixel.js';
import { hash2, fbm2, mixHex, shadeHex, hexToRgb, clamp } from '../core/math.js';
import { withLights, lightAt, ramp9, pick, ink, plank, nail } from './handpaint.js';

const cache = new Map();
const memo = (k, lights, f) => { let c = cache.get(k); if (!c) { c = withLights(lights, f); cache.set(k, c); if (cache.size > 120) cache.delete(cache.keys().next().value); } return c; };

const IRON = ['#14131a', '#22212a', '#34323e', '#4c4a58', '#6e6a7c'];
const BRASS = ['#3a2408', '#6a4612', '#9a6e22', '#c8983a', '#f0cc6a'];
const LEATHER = ['#1e100a', '#2e1a10', '#442818', '#5c3822', '#7a4e30'];
const LINING = ['#120c0a', '#1c1410', '#281c16', '#36261c', '#463224'];
const PAPER = ['#8a6a44', '#b08a5a', '#ccaa74', '#e2c896', '#f2e0b8'];
const BURLAP = ['#3a2c1a', '#56422a', '#74603e', '#927c54', '#b09a6c'];
const DIRT = ['#1a120c', '#2a1e14', '#3a2a1c', '#4c3826', '#5e4830'];

function noisyBlob(cx, cy, rx, ry, seed, n = 20, amp = 0.25) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = 1 + (fbm2(Math.cos(a) * 1.7 + seed, Math.sin(a) * 1.7, 2, seed) - 0.5) * amp * 2;
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return pts;
}
function scorch(p, cx, cy, rx, ry, seed) {
  // burnt patch: charred core, singed halo, a faint ember rim
  for (let y = Math.floor(cy - ry * 1.4); y <= cy + ry * 1.4; y++) for (let x = Math.floor(cx - rx * 1.4); x <= cx + rx * 1.4; x++) {
    const n = (fbm2(x * 0.12, y * 0.12, 2, seed) - 0.5) * 0.6;
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + n;
    const c = p.get(x, y);
    if (!c || !c[3]) continue;
    if (d < 0.7) p.set(x, y, dither(x, y, 0.5) ? [24, 14, 10] : [34, 20, 14]);
    else if (d < 1.0) p.set(x, y, [c[0] * 0.55, c[1] * 0.45, c[2] * 0.4]);
    else if (d < 1.15 && dither(x, y, 0.4)) p.set(x, y, [c[0] * 0.75 + 30, c[1] * 0.6 + 6, c[2] * 0.5]);
  }
}

// ------------------------------------------------------------------ workbench
export const BENCH_H = 168;
/** The scorched workbench (960 × 168): planks, a lipped front edge, tongs, file and chisel at the ends. */
function paint_benchCanvas() {
  return memo('bench', [{ x: 480, y: -120, r: 760 }, { x: 480, y: 60, r: 420, k: 0.4 }], () => {
    const W = 960, H = BENCH_H;
    const p = new Painter(W, H);
    // top planks, laid lengthwise with staggered butt joints
    const rows = [[0, 34], [34, 70], [70, 106], [106, 140]];
    rows.forEach(([y0, y1], r) => {
      const joint = 180 + ((r * 337) % 520);
      const segs = [[-4, joint], [joint, W + 4]];
      segs.forEach(([x0, x1], s) => {
        const j = (k) => (hash2(k, r * 7 + s, 41) - 0.5) * 2;
        plank(p, [[x0, y0 + j(1)], [x1, y0 + j(2)], [x1, y1 + j(3)], [x0, y1 + j(4)]], 300 + r * 13 + s, true);
      });
      for (const x of [26, joint - 10, joint + 10, W - 26]) nail(p, Math.round(x), Math.round((y0 + y1) / 2));
    });
    // front lip: the plank edge facing us, in shadow
    const lip = ramp9(['#140a06', '#1e120a', '#2c1a10', '#3c2616', '#4e341e'], '#e09050', '#081418');
    for (let y = 140; y < H; y++) for (let x = 0; x < W; x++) {
      const { L } = lightAt(x, y - 60);
      const v = 0.55 - (y - 140) / 40 + Math.sin(x * 0.05 + Math.sin(x * 0.011) * 3) * 0.05 + (hash2(x >> 2, y, 7) - 0.5) * 0.1;
      p.set(x, y, pick(lip, v * 0.6 + L * 0.4, x, y));
    }
    for (let x = 0; x < W; x++) { p.set(x, 140, [24, 14, 8]); if (x % 3) p.set(x, 139, [176, 120, 72]); }
    for (const x of [40, 300, 640, 920]) nail(p, x, 152);
    // scorch marks and a ring burn where a hot crucible once stood
    [[150, 56, 30, 12], [420, 118, 22, 9], [700, 48, 36, 13], [860, 112, 18, 8], [560, 86, 14, 6]].forEach(([x, y, rx, ry], i) => scorch(p, x, y, rx, ry, 70 + i));
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = Math.round(268 + Math.cos(a) * 22), y = Math.round(92 + Math.sin(a) * 8);
      const c = p.get(x, y);
      if (c && hash2(Math.round(a * 50), 3, 9) > 0.2) p.set(x, y, [c[0] * 0.45, c[1] * 0.38, c[2] * 0.35]);
    }
    // tongs (left end)
    const iron = ramp9(IRON);
    const arm = (pts, seed) => { ink(p, pts, seed, { col: iron[3], thick: 3 }); ink(p, pts.map(([x, y]) => [x, y - 1]), seed, { col: iron[7], thick: 0.6 }); };
    arm([[8, 122], [70, 104], [104, 96]], 1); arm([[10, 132], [70, 108], [106, 104]], 2);
    p.ellipse(70, 106, 3, 3, iron[6]); p.set(69, 105, [240, 230, 220]);
    ink(p, [[104, 96], [114, 90], [118, 96]], 3, { col: iron[2], thick: 2 });
    // file and a cold chisel (right end)
    p.poly([[858, 30], [940, 22], [942, 28], [860, 36]], (x, y) => ((x + y) % 3 ? iron[4] : iron[2]));
    ink(p, [[858, 30], [940, 22], [942, 28], [860, 36], [858, 30]], 4, { thick: 1.2 });
    ink(p, [[830, 36], [858, 32]], 5, { col: [120, 76, 40], thick: 3 });
    p.poly([[880, 120], [930, 108], [934, 114], [884, 126]], (x, y) => pick(iron, 0.6 - (y - 108) * 0.03, x, y));
    ink(p, [[880, 120], [930, 108], [934, 114], [884, 126], [880, 120]], 6, { thick: 1 });
    // metal shavings and a few nails scattered
    for (let k = 0; k < 26; k++) {
      const x = 30 + hash2(k, 1, 77) * 900, y = 8 + hash2(k, 2, 77) * 124;
      if (x > 200 && x < 760 && y > 40) continue; // keep the card area calm
      const a = hash2(k, 3, 77) * 6;
      for (let t = 0; t < 5; t++) p.set(Math.round(x + Math.cos(a + t * 0.9) * (2 + t * 0.4)), Math.round(y + Math.sin(a + t * 0.9) * (1 + t * 0.3)), t % 2 ? [220, 214, 200] : [130, 126, 120]);
    }
    return p.toCanvas();
  });
}

/** Cast-iron ingot mould with n cavities. Returns a canvas with .slots [{x,y,w,h}] (local). */
function paint_moldCanvas(n) {
  return memo('mold|' + n, [{ x: 0, y: -80, r: 520 }], () => {
    const S = 44, G = 8, W = n * S + (n - 1) * G + 24, H = 62;
    const p = new Painter(W, H);
    const iron = ramp9(IRON, '#ffb070', '#081820');
    // a thick cast plate with chamfered, slightly uneven corners and casting flash on the rim
    const j = (k) => (hash2(k, n, 7) - 0.5) * 2;
    const outline = [[6 + j(1), 1], [W - 7 + j(2), 1 + j(3) * 0.5], [W - 1, 7 + j(4)], [W - 2 + j(5) * 0.5, H - 8], [W - 8 + j(6), H - 1], [7 + j(7), H - 1 + j(8) * 0.5], [1, H - 7 + j(9)], [1 + j(10) * 0.5, 6]];
    p.poly(outline, (x, y) => pick(iron, 0.5 - y / H * 0.35 + (fbm2(x * 0.2, y * 0.2, 2, 3) - 0.5) * 0.25 + (hash2(x, y, 5) - 0.5) * 0.08, x, y));
    // the plate's front face (thickness) in shadow
    for (let x = 4; x < W - 4; x++) for (let y = H - 9; y < H - 1; y++) if (p.alpha(x, y)) p.set(x, y, pick(iron, 0.18 - (y - H + 9) * 0.02, x, y));
    for (let x = 4; x < W - 4; x++) if (p.alpha(x, H - 10)) p.set(x, H - 10, iron[6]);
    ink(p, [...outline, outline[0]], 3, { thick: 2 });
    for (let x = 3; x < W - 3; x++) if (p.alpha(x, 3)) p.set(x, 3, iron[7]);
    const slots = [];
    for (let i = 0; i < n; i++) {
      const sx = 12 + i * (S + G), sy = 8;
      const cav = noisyBlob(sx + S / 2, sy + 21, S / 2 - 2, 19, 20 + i, 18, 0.06);
      p.poly(cav, (x, y) => { const t = (y - sy) / 42; return t < 0.3 ? [10, 9, 12] : pick(iron, 0.08 + t * 0.22, x, y); });
      ink(p, [...cav, cav[0]], 30 + i, { thick: 1.2 });
      for (const [x, y] of cav) if (y > sy + 26) p.set(Math.round(x), Math.round(y) + 1, iron[6]);
      slots.push({ x: sx, y: sy, w: S, h: 42 });
    }
    for (const [x, y] of [[5, 6], [W - 8, 6], [5, H - 9], [W - 8, H - 9]]) { p.set(x, y, [200, 196, 190]); p.set(x + 1, y + 1, [40, 38, 46]); p.set(x + 1, y, [120, 118, 126]); }
    const c = p.toCanvas();
    c.slots = slots;
    return c;
  });
}

// ------------------------------------------------------------------ the recipe book
export const BOOK = { w: 330, h: 214 };
/** Open leather-bound recipe book: two bulging pages, gutter shadow, stacked page edges. */
function paint_bookCanvas() {
  return memo('book', [{ x: 260, y: -60, r: 520 }], () => {
    const { w: W, h: H } = BOOK;
    const p = new Painter(W, H);
    const cover = ramp9(['#1c0806', '#2e0e0a', '#461812', '#5e241a', '#7a3424'], '#e8905a', '#100a14');
    const coverPts = [[2, 10], [W / 2, 4], [W - 2, 10], [W - 4, H - 4], [W / 2, H - 1], [4, H - 4]];
    p.poly(coverPts, (x, y) => pick(cover, 0.45 + (fbm2(x * 0.06, y * 0.06, 3, 11) - 0.5) * 0.4 - Math.abs(x - W / 2) / W * 0.2, x, y));
    ink(p, [...coverPts, coverPts[0]], 11, { thick: 2 });
    // stitched cover edge
    for (let k = 0; k < coverPts.length; k++) {
      const [ax, ay] = coverPts[k], [bx, by] = coverPts[(k + 1) % coverPts.length];
      const n = Math.hypot(bx - ax, by - ay) / 5;
      for (let i = 1; i < n; i++) { const t = i / n; const x = ax + (bx - ax) * t + (W / 2 - ax) * 0.02, y = ay + (by - ay) * t + (H / 2 - ay) * 0.03; if (i % 2) p.set(Math.round(x), Math.round(y), [220, 180, 120]); }
    }
    const paper = ramp9(PAPER, '#ffe2a8', '#2a3a3a');
    // stacked page edges (thickness) under each page
    for (let s = 3; s >= 1; s--) {
      for (const side of [-1, 1]) {
        const pts = pagePts(side, W, H, s * 2);
        p.poly(pts, (x, y) => (s % 2 ? paper[3] : paper[2]));
        ink(p, pts, 20 + s, { col: [120, 92, 60], thick: 0.5 });
      }
    }
    for (const side of [-1, 1]) {
      const pts = pagePts(side, W, H, 0);
      p.poly(pts, (x, y) => {
        const g = Math.abs(x - W / 2) / (W / 2 - 12);
        const gutter = g < 0.12 ? (0.12 - g) * 4 : 0;
        const v = 0.78 + (fbm2(x * 0.05, y * 0.05, 3, side + 4) - 0.5) * 0.22 - gutter - (y > H - 24 ? 0.06 : 0);
        return pick(paper, v, x, y);
      });
      ink(p, [...pts, pts[0]], 30 + side, { col: [96, 66, 40], thick: 1 });
    }
    // spine crease
    for (let y = 12; y < H - 8; y++) { p.set(W / 2, y, [92, 64, 40]); p.set(W / 2 + 1, y, [150, 116, 76]); }
    return p.toCanvas();
  });
}
function pagePts(side, W, H, drop) {
  // one page, bulging up near the spine and curling at the outer corner
  const pts = [];
  const x0 = W / 2, x1 = W / 2 + side * (W / 2 - 10);
  const n = 14;
  for (let k = 0; k <= n; k++) { const t = k / n; pts.push([x0 + (x1 - x0) * t, 14 - Math.sin(t * Math.PI) * 4 + t * t * 3 + drop * 0.5]); }
  for (let k = n; k >= 0; k--) { const t = k / n; pts.push([x0 + (x1 - x0) * t + (k === n ? side * -2 : 0), H - 10 - Math.sin(t * Math.PI) * 3 + drop]); }
  return pts;
}
/** One page turning: a parchment leaf squashed to width w (for the flip animation). */
function paint_leafCanvas(w, h) {
  w = Math.max(2, Math.round(w));
  return memo('leaf|' + w + 'x' + h, [{ x: w / 2, y: -40, r: 400 }], () => {
    const p = new Painter(w, h);
    const paper = ramp9(PAPER);
    p.poly([[0, 4], [w, 0], [w, h - 2], [0, h]], (x, y) => pick(paper, 0.6 + (x / w) * 0.25, x, y));
    ink(p, [[0, 4], [w, 0], [w, h - 2], [0, h], [0, 4]], 3, { col: [96, 66, 40], thick: 0.8 });
    return p.toCanvas();
  });
}
/** Satin ribbon bookmark with a forked tail. */
function paint_ribbonCanvas(color, len) {
  return memo('rib|' + color + len, [], () => {
    const W = 14, p = new Painter(W, len);
    const c = [shadeHex(color, -0.5), shadeHex(color, -0.25), color, shadeHex(color, 0.25), shadeHex(color, 0.5)].map(hexToRgb);
    const pts = [[1, 0], [W - 2, 0], [W - 2, len - 1], [W / 2, len - 6], [1, len - 1]];
    p.poly(pts, (x, y) => (x < 3 ? c[3] : x > W - 5 ? c[1] : Math.sin(y * 0.15) > 0.6 && x < 7 ? c[4] : c[2]));
    ink(p, [...pts, pts[0]], len, { col: [26, 10, 10], thick: 0.8 });
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ the FORGE plaque (big button)
/** Brass plaque nailed to a heavy board, with a hammer crossed behind. state: idle|hover|down|off */
function paint_plaqueCanvas(w, h, state = 'idle') {
  return memo(`plaque|${w}x${h}|${state}`, [{ x: w * 0.3, y: -40, r: 300 }], () => {
    const p = new Painter(w + 20, h + 20);
    const iron = ramp9(IRON);
    // hammer behind the board
    ink(p, [[8, h + 14], [w + 8, 6]], 2, { col: [110, 72, 40], thick: 4 });
    p.poly([[w - 8, 0], [w + 16, 10], [w + 12, 20], [w - 12, 10]], (x, y) => pick(iron, 0.7 - (y / 20) * 0.5, x, y));
    ink(p, [[w - 8, 0], [w + 16, 10], [w + 12, 20], [w - 12, 10], [w - 8, 0]], 3, { thick: 1.2 });
    // board
    const bx = 6, by = 8;
    plank(p, [[bx, by + 2], [bx + w, by], [bx + w + 1, by + h], [bx - 1, by + h + 1]], 77, true);
    // brass plate
    const br = ramp9(state === 'off' ? ['#2a2620', '#3a342c', '#4a4238', '#5a5246', '#6a6254'] : BRASS, state === 'hover' ? '#fff0b0' : '#ffd890', '#2a2010');
    const plate = [[bx + 8, by + 7], [bx + w - 8, by + 6], [bx + w - 7, by + h - 7], [bx + 7, by + h - 6]];
    const lift = state === 'down' ? -0.15 : state === 'hover' ? 0.12 : 0;
    p.poly(plate, (x, y) => pick(br, 0.62 + lift - (y - by) / h * 0.4 + (hash2(x >> 1, y >> 1, 9) - 0.5) * 0.12 + (x - bx < 14 ? 0.1 : 0), x, y));
    ink(p, [...plate, plate[0]], 8, { thick: 1.4 });
    for (const [x, y] of [[bx + 12, by + 10], [bx + w - 13, by + 10], [bx + 12, by + h - 11], [bx + w - 13, by + h - 11]]) { p.set(x, y, br[8]); p.set(x + 1, y + 1, br[1]); p.set(x + 1, y, br[4]); }
    const c = p.toCanvas();
    c.inner = { x: bx + 10, y: by + 8, w: w - 20, h: h - 16 };
    return c;
  });
}

// ------------------------------------------------------------------ 2D anvil (when no 3D anvil exists)
/** A big anvil with a glowing billet across its face; heat 0..1 tints the metal. */
function paint_anvilFaceCanvas(heat = 1) {
  const hq = Math.round(clamp(heat, 0, 1) * 4);
  return memo('anvil|' + hq, [{ x: 160, y: -80, r: 420 }, { x: 160, y: 40, r: 140, k: 0.5 * hq / 4 }], () => {
    const W = 320, H = 190;
    const p = new Painter(W, H);
    const iron = ramp9(IRON, '#ffb070', '#081820');
    // stump
    plank(p, [[96, 120], [224, 118], [234, 188], [86, 189]], 55);
    // body: horn left, heel right, waist, feet
    const body = [[14, 52], [60, 40], [278, 38], [306, 46], [300, 66], [244, 74], [226, 82], [218, 102], [246, 122], [80, 122], [104, 102], [98, 82], [76, 74], [40, 66]];
    p.poly(body, (x, y) => { const { L } = lightAt(x, y); return pick(iron, (y < 46 ? 0.95 : 0.45 - (y - 46) * 0.008) + L * 0.3 - (x > 240 ? 0.12 : 0) + (hash2(x >> 1, y >> 1, 3) - 0.5) * 0.08, x, y); });
    for (let x = 60; x < 278; x++) p.set(x, 39, iron[8]);
    ink(p, [...body, body[0]], 4, { thick: 2.2 });
    // hardy hole
    p.rect(250, 40, 6, 3, [10, 10, 14]);
    // the billet, glowing
    const hot = [[120, 30, 10], [200, 60, 10], [255, 120, 30], [255, 190, 80], [255, 240, 190]];
    const cold = [[40, 40, 48], [60, 58, 66], [86, 82, 92], [110, 104, 116], [140, 134, 146]];
    const pal = hot.map((c, i) => c.map((v, k) => Math.round(cold[i][k] + (v - cold[i][k]) * (hq / 4))));
    const bil = [[110, 26], [214, 22], [220, 34], [112, 38]];
    p.poly(bil, (x, y) => pal[clamp(Math.floor(4.4 - (y - 22) / 4 + (hash2(x >> 1, y, 5) - 0.5) * 1.2), 0, 4)]);
    ink(p, [...bil, bil[0]], 6, { col: [40, 14, 8], thick: 1 });
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ backpack
/** Open leather backpack seen from above: the flap thrown back (suede underside up), bulging side
 *  pockets with buckles, a rolled blanket strapped below, and a grid of stitched pockets inside. */
function paint_backpackCanvas(gw, gh, cell) {
  return memo(`pack|${gw}x${gh}|${cell}`, [{ x: 150, y: -60, r: 560 }], () => {
    const GW = gw * cell, GH = gh * cell, PAD = 18;
    const W = GW + PAD * 2 + 64, H = GH + PAD * 2 + 120;
    const p = new Painter(W, H);
    const lea = ramp9(LEATHER, '#f0a060', '#0a1418');
    const suede = ramp9(['#3a2418', '#54362a', '#6e4a38', '#8a634c', '#a67e62'], '#f0b080', '#101a1c');
    const lin = ramp9(LINING, '#b07040', '#060c10');
    const gx = 32 + PAD, gy = 70 + PAD;
    const bx0 = gx - PAD, by0 = gy - PAD, bx1 = gx + GW + PAD, by1 = gy + GH + PAD + 10;
    const rr = (x0, y0, x1, y1, r, seed, n = 6) => {
      // rounded rectangle with a hand-cut wobble
      const pts = [];
      const corners = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
      corners.forEach(([cx, cy, a0], ci) => { for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * (Math.PI / 2); const j = (hash2(ci * 10 + k, seed, 3) - 0.5) * 2.2; pts.push([cx + Math.cos(a) * (r + j), cy + Math.sin(a) * (r + j)]); } });
      return pts;
    };
    // flap thrown back: hinged at the top edge, suede side up, buckle strap at its end
    const flap = [[bx0 + 8, by0 + 14], [bx0 + 14, 22], [bx0 + 34, 8], [bx1 - 34, 8], [bx1 - 14, 22], [bx1 - 8, by0 + 14]];
    p.poly(flap, (x, y) => pick(suede, 0.5 + (fbm2(x * 0.08, y * 0.08, 3, 2) - 0.5) * 0.3 + (y - 8) / (by0 + 14) * 0.15 - Math.abs(x - W / 2) / W * 0.3, x, y));
    ink(p, [...flap], 2, { thick: 2 });
    for (let k = 1; k < 40; k++) { const t = k / 40; const [ax, ay] = [bx0 + 34 + (bx1 - bx0 - 68) * t, 13]; if (k % 2) p.set(Math.round(ax), ay, [214, 172, 120]); }
    // strap and buckle tongue hanging over the flap's edge
    const sx = Math.round(W / 2 - 7);
    for (let y = 0; y < 30; y++) for (let x = sx; x < sx + 14; x++) p.set(x, y, pick(lea, 0.55 + (x - sx < 3 ? 0.15 : x - sx > 10 ? -0.15 : 0) - y * 0.004, x, y));
    ink(p, [[sx, 0], [sx, 30], [sx + 14, 30], [sx + 14, 0]], 3, { thick: 1.2 });
    for (let y = 4; y < 28; y += 7) { p.set(sx + 7, y, [20, 12, 8]); p.set(sx + 7, y + 1, [90, 60, 40]); }
    // side pockets bulging out
    for (const side of [-1, 1]) {
      const cx = side < 0 ? bx0 + 2 : bx1 - 2, cy = gy + GH * 0.55;
      const pts = [];
      for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + (k / 16) * Math.PI; pts.push([cx + side * Math.cos(a) * 24 * (1 + (hash2(k, side, 4) - 0.5) * 0.08), cy + Math.sin(a) * 46]); }
      p.poly(pts, (x, y) => pick(lea, 0.45 + ((x - cx) * side) / 24 * -0.25 + (cy - y) / 46 * 0.2 + (fbm2(x * 0.1, y * 0.1, 2, 5) - 0.5) * 0.25, x, y));
      ink(p, pts, 4 + side, { thick: 1.8 });
      // pocket flap with a little brass buckle
      const fy = cy - 30;
      p.poly([[cx, fy], [cx + side * 22, fy + 4], [cx + side * 20, fy + 20], [cx, fy + 22]], (x, y) => pick(lea, 0.6 - (y - fy) * 0.01, x, y));
      ink(p, [[cx, fy], [cx + side * 22, fy + 4], [cx + side * 20, fy + 20], [cx, fy + 22]], 9 + side, { thick: 1.2 });
      const bx = Math.round(cx + side * 12 - 3), byy = fy + 16;
      p.rect(bx, byy, 7, 6, [150, 108, 36]); p.rect(bx + 2, byy + 2, 3, 2, lea[2]); p.set(bx, byy, [255, 226, 130]);
    }
    // bedroll strapped under the bag
    const ry0 = by1 + 2, ry1 = ry0 + 26;
    for (let y = ry0; y < ry1; y++) for (let x = bx0 + 6; x < bx1 - 6; x++) {
      const t = (y - ry0) / (ry1 - ry0);
      const stripe = Math.floor((x - bx0) / 9) % 4 === 0;
      const v = 0.75 - Math.abs(t - 0.35) * 1.1 + (stripe ? -0.12 : 0);
      p.set(x, y, pick(ramp9(['#2a2a3a', '#3a3a52', '#4e4e6a', '#6a6a86', '#8a8aa4'], '#ffc890', '#081018'), v, x, y));
    }
    ink(p, [[bx0 + 6, ry0], [bx1 - 6, ry0], [bx1 - 3, (ry0 + ry1) / 2], [bx1 - 6, ry1], [bx0 + 6, ry1], [bx0 + 3, (ry0 + ry1) / 2], [bx0 + 6, ry0]], 6, { thick: 1.6 });
    for (const x of [bx0 + 36, bx1 - 44]) { p.rect(x, ry0 - 4, 9, ry1 - ry0 + 8, lea[3]); p.rect(x + 1, ry0 - 4, 2, ry1 - ry0 + 8, lea[6]); p.rect(x - 1, ry0 + 9, 11, 6, [140, 100, 34]); }
    // body: a soft rounded sack, darker where it curves away
    const body = rr(bx0, by0, bx1, by1, 24, 9);
    p.poly(body, (x, y) => {
      const ex = Math.min(x - bx0, bx1 - x) / 30, ey = Math.min(y - by0, by1 - y) / 30;
      const curve = Math.min(1, Math.min(ex, ey));
      const { L } = lightAt(x, y);
      return pick(lea, 0.25 + curve * 0.35 + (fbm2(x * 0.06, y * 0.06, 3, 4) - 0.5) * 0.3 + (hash2(x >> 1, y >> 1, 4) - 0.5) * 0.06 + L * 0.15, x, y);
    });
    ink(p, [...body, body[0]], 4, { thick: 2.4 });
    // seam stitched just inside the edge
    const seam = rr(bx0 + 5, by0 + 5, bx1 - 5, by1 - 5, 20, 9);
    seam.forEach(([x, y], k) => { const [x2, y2] = seam[(k + 1) % seam.length]; for (let t = 0; t < 1; t += 0.2) if (Math.round((k + t) * 5) % 2) p.set(Math.round(x + (x2 - x) * t), Math.round(y + (y2 - y) * t), [210, 166, 108]); });
    // rolled leather lip around the opening
    const lip = rr(gx - 9, gy - 9, gx + GW + 9, gy + GH + 9, 10, 5, 4);
    p.poly(lip, (x, y) => pick(lea, 0.85 - (y - gy + 9) / (GH + 18) * 0.35, x, y));
    ink(p, [...lip, lip[0]], 5, { thick: 1.6 });
    // lining and the grid of stitched pockets
    const open = rr(gx - 4, gy - 4, gx + GW + 4, gy + GH + 4, 6, 6, 3);
    p.poly(open, lin[1]);
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      const x0 = gx + cx * cell, y0 = gy + cy * cell;
      for (let y = y0; y < y0 + cell; y++) for (let x = x0; x < x0 + cell; x++) {
        const u = (x - x0) / cell, v = (y - y0) / cell;
        const sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
        p.set(x, y, pick(lin, 0.35 + sag * 0.35 - v * 0.15 + (hash2(x >> 1, y >> 1, cx * 7 + cy) - 0.5) * 0.12, x, y));
      }
      for (let i = 0; i < cell; i++) {
        p.set(x0 + i, y0, lin[0]); p.set(x0, y0 + i, lin[0]);
        if (i % 4 < 2) { p.set(x0 + i, y0 + 2, [178, 140, 92]); p.set(x0 + 2, y0 + i, [150, 116, 76]); }
      }
    }
    ink(p, [...open, open[0]], 6, { thick: 1.4 });
    const c = p.toCanvas();
    c.grid = { x: gx, y: gy };
    return c;
  });
}
/** Burlap cloth spread on the ground for loose loot. */
function paint_clothCanvas(w, h) {
  return memo(`cloth|${w}x${h}`, [{ x: w * 0.4, y: -80, r: 520 }], () => {
    const p = new Painter(w, h);
    const bur = ramp9(BURLAP, '#ffd090', '#0e1a1a');
    const pts = [[6, 10], [w * 0.5, 2], [w - 4, 14], [w - 10, h * 0.55], [w - 2, h - 8], [w * 0.45, h - 2], [4, h - 12], [12, h * 0.5]];
    p.poly(pts, (x, y) => {
      const fold = Math.sin((x * 0.6 + y) * 0.06) * 0.12 + Math.sin(x * 0.03 - y * 0.05) * 0.1;
      const weave = (x % 2 === 0) !== (y % 2 === 0) ? 0.05 : -0.05;
      return pick(bur, 0.55 + fold + weave + (hash2(x >> 2, y >> 2, 3) - 0.5) * 0.08, x, y);
    });
    // hem stitched a few pixels in from the edge, and two soft fold creases
    pts.forEach(([x, y], k) => { const [x2, y2] = pts[(k + 1) % pts.length]; const n = Math.hypot(x2 - x, y2 - y) / 3; for (let i = 0; i < n; i++) { const t = i / n; const hx = x + (x2 - x) * t + (w / 2 - x) * 0.04, hy = y + (y2 - y) * t + (h / 2 - y) * 0.05; if (i % 2) p.set(Math.round(hx), Math.round(hy), bur[2]); } });
    ink(p, [[w * 0.18, h * 0.3], [w * 0.4, h * 0.42], [w * 0.62, h * 0.4], [w * 0.86, h * 0.52]], 31, { col: [86, 66, 42], thick: 0.8 });
    ink(p, [[w * 0.3, h * 0.78], [w * 0.5, h * 0.66], [w * 0.72, h * 0.7]], 32, { col: [86, 66, 42], thick: 0.8 });
    ink(p, [...pts, pts[0]], 9, { thick: 1.4 });
    // frayed edge threads
    pts.forEach(([x, y], k) => { for (let i = 0; i < 6; i++) { const t = i / 6; const [x2, y2] = pts[(k + 1) % pts.length]; const fx = x + (x2 - x) * t, fy = y + (y2 - y) * t; p.set(Math.round(fx + (hash2(i, k, 1) - 0.5) * 4), Math.round(fy + (hash2(k, i, 2) - 0.5) * 4), bur[6]); } });
    return p.toCanvas();
  });
}
/** A jagged crack in the floor to toss junk into (glows hot when something is held over it). */
function paint_pitCanvas(hot = false) {
  return memo('pit|' + (hot ? 1 : 0), [{ x: 40, y: -60, r: 260 }], () => {
    const W = 96, H = 48;
    const p = new Painter(W, H);
    // a lens-shaped gash with ragged lips
    const top = [], bot = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16, x = 6 + t * (W - 12), open = Math.sin(t * Math.PI) ** 0.8 * 14;
      top.push([x, H / 2 - open * (0.7 + hash2(k, 1, 17) * 0.5)]);
      bot.push([x, H / 2 + open * (0.4 + hash2(k, 2, 17) * 0.4)]);
    }
    const pts = [...top, ...bot.reverse()];
    p.poly(pts, (x, y) => (y < H / 2 - 4 ? (hot ? [120, 50, 30] : [40, 30, 26]) : dither(x, y, 0.5) ? [6, 5, 7] : [12, 9, 11]));
    // lit far lip, dark near lip
    for (const [x, y] of top) { p.set(Math.round(x), Math.round(y) - 1, hot ? [255, 150, 90] : [130, 104, 80]); }
    ink(p, [...pts, pts[0]], 17, { thick: 2 });
    // hairline cracks running out from the ends
    for (const [sx, dir] of [[6, -1], [W - 6, 1]]) { const line = [[sx, H / 2]]; let x = sx, y = H / 2; for (let i = 0; i < 4; i++) { x += dir * 3; y += (hash2(i, sx, 5) - 0.5) * 6; line.push([x, y]); } ink(p, line, sx, { thick: 1 }); }
    for (const [sx, sy] of [[30, H / 2 + 10], [64, H / 2 - 10]]) { const line = [[sx, sy]]; let x = sx, y = sy; for (let i = 0; i < 3; i++) { x += (hash2(i, sx, 6) - 0.5) * 6; y += sy > H / 2 ? 3 : -3; line.push([x, y]); } ink(p, line, sy, { thick: 0.8 }); }
    return p.toCanvas();
  });
}
/** Little paper index tab sticking out of the book. */
function paint_indexTabCanvas(w, h, on) {
  return memo(`itab|${w}x${h}|${on ? 1 : 0}`, [{ x: w / 2, y: -40, r: 300 }], () => {
    const p = new Painter(w, h);
    const paper = ramp9(on ? ['#9a7a52', '#c09a68', '#d8b682', '#ecd2a4', '#f8e6c4'] : ['#7a6040', '#9a7a52', '#b4946a', '#c8aa80', '#d8bc92'], '#ffe2a8', '#2a3a3a');
    const pts = [[1, h], [2, 5], [6, 1], [w - 7, 1], [w - 2, 5], [w - 1, h]];
    p.poly(pts, (x, y) => pick(paper, 0.72 - y / h * 0.3 + (hash2(x >> 1, y >> 1, w) - 0.5) * 0.1, x, y));
    ink(p, pts, w + h, { col: [96, 66, 40], thick: 1 });
    return p.toCanvas();
  });
}
/** Cave floor under the bag: packed dirt and pebbles in a pool of lantern light. */
function paint_floorCanvas(W = 960, H = 540) {
  return memo(`floor|${W}x${H}`, [{ x: W * 0.42, y: H * 0.35, r: 560 }], () => {
    const p = new Painter(W, H);
    const dirt = ramp9(DIRT, '#ffb060', '#06121a');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const { L } = lightAt(x, y);
      const v = 0.35 + (fbm2(x * 0.02, y * 0.02, 3, 5) - 0.5) * 0.4 + (hash2(x >> 1, y >> 1, 3) - 0.5) * 0.1;
      p.set(x, y, pick(dirt, v * 0.45 + L * 0.75 - 0.08, x, y));
    }
    for (let k = 0; k < 260; k++) {
      const x = hash2(k, 1, 31) * W, y = hash2(k, 2, 31) * H, r = 1.5 + hash2(k, 3, 31) * 4;
      const { L } = lightAt(x, y);
      const pts = noisyBlob(x, y, r, r * 0.7, k, 7, 0.2);
      p.poly(pts, (px, py) => pick(dirt, (py < y ? 0.85 : 0.4) * 0.5 + L * 0.65, px, py));
      if (r > 3.5) ink(p, [...pts, pts[0]], k, { thick: 0.6 });
    }
    // roots creeping in at the corners
    for (let k = 0; k < 4; k++) {
      const line = [];
      let x = k % 2 ? W : 0, y = 40 + hash2(k, 5, 9) * (H - 80);
      for (let i = 0; i < 16; i++) { line.push([x, y]); x += (k % 2 ? -1 : 1) * (8 + hash2(i, k, 2) * 6); y += (hash2(k, i, 3) - 0.5) * 12; }
      ink(p, line, k, { col: [60, 40, 26], thick: 2.4 });
    }
    return p.toCanvas();
  });
}
void mixHex;

// ------------------------------------------------------------------ voxel versions
// The painters above are the designs; the game draws their voxel reliefs (ui/vox_ui.js).
export const benchCanvas = voxify('benchCanvas', paint_benchCanvas, { relief: 'emboss' });
export const moldCanvas = voxify('moldCanvas', paint_moldCanvas, { relief: 'emboss' });
export const bookCanvas = voxify('bookCanvas', paint_bookCanvas, { relief: 'flat' });
/** Book leaf mid page-turn: width snaps to 4 px steps so the flip reuses a handful of renders. */
const leafVox = voxify('leafCanvas', paint_leafCanvas, { relief: 'flat' });
export function leafCanvas(w, h) { return leafVox(Math.max(4, Math.round(w / 4) * 4), Math.round(h)); }
const ribbonVox = voxify('ribbonCanvas', paint_ribbonCanvas, { relief: 'emboss' });
export function ribbonCanvas(color, len) { return ribbonVox(color, Math.round(len)); }
export const plaqueCanvas = voxify('plaqueCanvas', paint_plaqueCanvas, { relief: 'emboss' });
const anvilVox = voxify('anvilFaceCanvas', paint_anvilFaceCanvas, { relief: 'deep' });
/** Heat glows in 5 steps, so the hammering reuses five renders. */
export function anvilFaceCanvas(heat = 1) { return anvilVox(Math.round(clamp(heat, 0, 1) * 4) / 4); }
export const backpackCanvas = voxify('backpackCanvas', paint_backpackCanvas, { relief: 'emboss' });
export const clothCanvas = voxify('clothCanvas', paint_clothCanvas, { relief: 'flat' });
export const pitCanvas = voxify('pitCanvas', paint_pitCanvas, { relief: 'emboss' });
export const indexTabCanvas = voxify('indexTabCanvas', paint_indexTabCanvas, { relief: 'flat' });
export const floorCanvas = voxify('floorCanvas', paint_floorCanvas, { relief: 'emboss' });
