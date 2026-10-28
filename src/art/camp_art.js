// Hand-painted campsite for the main menu: a cave camp seen from a little above, lit by one
// campfire with a stew pot on a tripod. Cracked flagstones, logs to sit on, bedrolls, packs,
// Bran's anvil, Elio's books and the dark mouth of the mine they are about to go back into.
import { Painter, dither } from './pixel.js';
import { hash2, fbm2, mixHex, shadeHex, hexToRgb, clamp } from '../core/math.js';
import { withLights, lightAt, ramp9, pick, ink, caveRock, plank, nail, barrel, ropeCoil, sack, siteGrid, nearest2 } from './handpaint.js';
import { paintMouth } from './crossroads_art.js';

export const FIRE = { x: 480, y: 384 };
export const SEATS = {
  elio: { x: 372, y: 338, back: true },
  durgan: { x: 604, y: 336, back: true },
  clover: { x: 312, y: 456 },
  bran: { x: 660, y: 452 },
};
export const ANVIL = { x: 694, y: 438 };
export const TUNNEL = { x: 214, y: 292, w: 112, h: 150 };
export const OBJECTS = {
  codex: { x: 410, y: 326, w: 34, h: 22 },
  prologue: { x: 548, y: 474, w: 40, h: 18 },
  settings: { x: 852, y: 118, w: 26, h: 44 },
  slate: { x: 786, y: 304, w: 62, h: 46 },
};
const LIGHTS = [{ x: FIRE.x, y: FIRE.y - 20, r: 560, k: 1.15 }, { x: TUNNEL.x + 70, y: 190, r: 180, k: 0.35 }, { x: 865, y: 150, r: 160, k: 0.4 }];
const HORIZON = 296;
let cached = null;

function flagstones(p, pal, seed) {
  // perspective flagstones: cells widen toward the viewer, dirt in the gaps
  const stone = ramp9([shadeHex(pal.rock[1], -0.1), pal.rock[2], pal.rock[3], pal.rock[4], shadeHex(pal.rock[4], 0.2)]);
  const dirt = ramp9([shadeHex(pal.dirt[0], -0.35), shadeHex(pal.dirt[0], -0.2), pal.dirt[0], pal.dirt[1], pal.dirt[2]]);
  const site = siteGrid(66, 30, seed);
  for (let y = HORIZON; y < 540; y++) {
    const t = (y - HORIZON) / (540 - HORIZON);
    const sx = 0.5 + t * 0.7, v0 = Math.pow(t, 0.85) * 240;
    for (let x = 0; x < 960; x++) {
      const u = 480 + (x - 480) / sx;
      const S = nearest2(site, 66, 30, u + (fbm2(u * 0.02, v0 * 0.03, 2, seed) - 0.5) * 16, v0, 1);
      const e = (S.d2 - S.d1) * 0.5 * sx;
      const { L, dx, dy } = lightAt(x, y);
      if (e < 1.4 + (1 - t) * 0.4) { p.set(x, y, pick(dirt, 0.25 + L * 0.5 + (hash2(x, y, seed) - 0.5) * 0.2, x, y)); continue; }
      let v = 0.42 + (S.s1[2] * dx + S.s1[3] * dy) * 0.3;
      if (e < 5) { const b = 1 - e / 5; v += -b * 0.16 + (dy < 0 ? b * 0.1 : 0); }
      v += (fbm2(x * 0.07, y * 0.12, 2, seed + 3) - 0.5) * 0.24 + (hash2(x, y, seed) - 0.5) * 0.06;
      // a few hairline cracks run through the slabs
      if (Math.abs(fbm2(u * 0.05, v0 * 0.05, 2, seed + 7) - 0.5) < 0.01) v -= 0.25;
      p.set(x, y, pick(stone, v * 0.42 + L * 0.82 - 0.22, x, y));
    }
  }
}

function log(p, cx, cy, len, r, seed) {
  // a sitting log seen from above-front: bark body, a sawn end with rings
  const pts = [[cx - len / 2, cy - r], [cx + len / 2, cy - r - 1], [cx + len / 2, cy + r], [cx - len / 2, cy + r + 1]];
  plank(p, pts, seed, true);
  for (let k = 0; k < len; k += 5) { const x = cx - len / 2 + k + (hash2(k, 1, seed) - 0.5) * 3; ink(p, [[x, cy - r + 2], [x + 2, cy + r - 2]], seed + k, { col: [40, 22, 12], thick: 0.5 }); }
  const ex = cx + len / 2;
  p.ellipse(ex, cy, r * 0.55, r + 0.5, (x, y, nx, ny) => { const d = Math.hypot(nx, ny); const { L } = lightAt(x, y); return d > 0.82 ? [70, 44, 26] : Math.round(d * 5) % 2 ? [Math.round(150 + L * 60), Math.round(110 + L * 40), 70] : [Math.round(190 + L * 50), Math.round(150 + L * 30), 96]; });
  ink(p, Array.from({ length: 13 }, (_, q) => [ex + Math.cos((q / 12) * 6.28) * r * 0.55, cy + Math.sin((q / 12) * 6.28) * (r + 0.5)]), seed, { thick: 1.2 });
}

function bedroll(p, x, y, col, seed) {
  const c = hexToRgb(col), hi = hexToRgb(shadeHex(col, 0.3)), lo = hexToRgb(mixHex(shadeHex(col, -0.45), '#10303a', 0.3));
  p.ellipse(x, y, 30, 10, (px, py, nx, ny) => { const { L } = lightAt(px, py); return ny < -0.3 && L > 0.3 ? hi : ny > 0.4 ? lo : Math.sin(nx * 9) > 0.7 ? lo : c; });
  ink(p, Array.from({ length: 17 }, (_, q) => [x + Math.cos((q / 16) * 6.28) * 30, y + Math.sin((q / 16) * 6.28) * 10]), seed, { thick: 1.4 });
  for (const s of [-12, 12]) ink(p, [[x + s, y - 9], [x + s + 2, y + 9]], seed + s, { col: [90, 60, 34], thick: 1.6 });
}

function books(p, x, y, seed) {
  const cols = ['#7a2a2a', '#2a4a6a', '#5a6a2a', '#6a4a8a'];
  for (let k = 0; k < 4; k++) {
    const by = y - k * 5, bw = 26 - k * 2 + (hash2(k, 1, seed) - 0.5) * 4, sk = (hash2(k, 2, seed) - 0.5) * 4;
    const pts = [[x - bw / 2 + sk, by - 4], [x + bw / 2 + sk, by - 4], [x + bw / 2, by + 1], [x - bw / 2, by + 1]];
    p.poly(pts, (px, py) => (py < by - 2 ? [236, 222, 190] : hexToRgb(cols[k])));
    ink(p, [...pts, pts[0]], seed + k, { thick: 1 });
  }
}

function campfire(p, seed) {
  const { x, y } = FIRE;
  // ring of stones
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2, sx = x + Math.cos(a) * 46, sy = y + Math.sin(a) * 15, r = 7 + hash2(k, 1, seed) * 3;
    const pts = [];
    for (let q = 0; q < 7; q++) { const b = (q / 7) * Math.PI * 2; pts.push([sx + Math.cos(b) * r * (0.75 + hash2(q, k, seed) * 0.4), sy + Math.sin(b) * r * 0.6]); }
    const toward = sy < y ? 1 : 0.3; // the inner faces glow
    p.poly(pts, (px, py) => [Math.round(90 + toward * 120 * (py > sy ? 1 : 0.6)), Math.round(60 + toward * 60), Math.round(44 + toward * 20)]);
    ink(p, [...pts, pts[0]], seed + k, { thick: 1.3 });
  }
  // embers bed and charred logs
  p.ellipse(x, y, 36, 11, (px, py, nx, ny) => (dither(px, py, 1 - Math.hypot(nx, ny)) ? [255, 150, 50] : [120, 34, 16]));
  ink(p, [[x - 30, y + 4], [x + 22, y - 6]], seed, { col: [40, 20, 12], thick: 4 });
  ink(p, [[x - 20, y - 6], [x + 30, y + 5]], seed + 1, { col: [52, 26, 14], thick: 4 });
  for (let k = 0; k < 14; k++) p.set(Math.round(x - 26 + hash2(k, 3, seed) * 52), Math.round(y - 4 + hash2(k, 4, seed) * 8), [255, 220, 120]);
  // tripod and the stew pot
  for (const [fx, fy] of [[x - 54, y + 8], [x + 52, y + 10], [x + 6, y - 22]]) ink(p, [[fx, fy], [x, y - 92]], seed + fx, { col: [92, 60, 34], thick: 2.2 });

}

/** The camp backdrop (960×540). */
export function campCanvas(pal) {
  if (cached) return cached;
  cached = withLights(LIGHTS, () => {
    const p = new Painter(960, 540);
    const seed = 404;
    caveRock(p, 0, 0, 960, HORIZON + 6, pal, seed, { bias: 0.04 });
    flagstones(p, pal, seed);
    const edge = [];
    for (let x = 0; x <= 960; x += 8) edge.push([x, HORIZON + Math.sin(x * 0.02) * 3 + (hash2(x, 1, seed) - 0.5) * 3]);
    ink(p, edge, seed, { thick: 2 });
    // the way back down: the mine mouth at the back of the camp
    paintMouth(p, { x: TUNNEL.x + TUNNEL.w / 2, y: HORIZON + 4, w: TUNNEL.w, h: TUNNEL.h }, { tunnel: 'tunnel', type: 'start' }, pal, seed);
    // clutter along the back wall
    bedroll(p, 120, HORIZON + 22, '#6a3a2a', seed + 1);
    bedroll(p, 820, HORIZON + 26, '#3a5a6a', seed + 2);
    barrel(p, 870, HORIZON - 40, 40, 54, seed + 3);
    sack(p, 916, HORIZON - 20, seed + 4);
    sack(p, 40, HORIZON - 14, seed + 5);
    ropeCoil(p, 90, HORIZON - 70, seed + 6);
    for (const [x0, lean] of [[150, 0.4], [168, 0.25]]) { ink(p, [[x0, HORIZON + 2], [x0 + lean * 70, HORIZON - 70]], x0, { col: [120, 80, 46], thick: 2 }); ink(p, [[x0 + lean * 70 - 12, HORIZON - 76], [x0 + lean * 70, HORIZON - 70], [x0 + lean * 70 + 14, HORIZON - 64]], x0 + 1, { col: [150, 150, 160], thick: 2 }); }
    // seats around the fire
    log(p, SEATS.elio.x - 6, SEATS.elio.y + 2, 74, 8, seed + 10);
    log(p, SEATS.durgan.x + 4, SEATS.durgan.y + 2, 70, 8, seed + 11);
    log(p, SEATS.clover.x - 4, SEATS.clover.y + 4, 90, 11, seed + 12);
    log(p, SEATS.bran.x + 8, SEATS.bran.y + 4, 84, 11, seed + 13);
    books(p, OBJECTS.codex.x + 16, OBJECTS.codex.y + 18, seed + 14);
    campfire(p, seed + 20);
    // the slate with run tallies leans on a crate
    plank(p, [[OBJECTS.slate.x - 6, OBJECTS.slate.y + 30], [OBJECTS.slate.x + 70, OBJECTS.slate.y + 30], [OBJECTS.slate.x + 70, OBJECTS.slate.y + 62], [OBJECTS.slate.x - 6, OBJECTS.slate.y + 62]], seed + 30, true);
    // peg for the lantern
    nail(p, OBJECTS.settings.x + 12, OBJECTS.settings.y - 2);
    // darkness pooling at the edges of the firelight
    for (let y = 0; y < 540; y++) for (let x = 0; x < 960; x++) {
      const d = Math.hypot((x - FIRE.x) / 560, (y - FIRE.y) / 360);
      if (d > 0.75 && dither(x, y, clamp((d - 0.75) * 1.6, 0, 0.7))) { const c = p.get(x, y); p.set(x, y, [c[0] * 0.55, c[1] * 0.62, c[2] * 0.7]); }
    }
    return p.toCanvas();
  });
  return cached;
}

/** The stew pot hanging from the tripod (UI layer, so the flames can lick up behind it). */
let potC = null;
export function potCanvas() {
  if (potC) return potC;
  potC = withLights(LIGHTS, () => {
    const p = new Painter(80, 100);
    const x = 40, y = 96, seed = 424;
    ink(p, [[x, y - 92], [x, y - 66]], seed, { col: [120, 116, 124], thick: 1 });
    const px = x, py = y - 40;
    // pot body
    p.ellipse(px, py, 32, 22, (qx, qy, nx, ny) => { if (ny < -0.55) return null; if (ny > 0.62) return dither(qx, qy, (ny - 0.62) * 3) ? [220, 96, 40] : [120, 46, 24]; return nx < -0.45 ? [96, 70, 62] : nx > 0.6 ? [22, 20, 24] : dither(qx, qy, 0.5 + nx * 0.4) ? [30, 28, 32] : [52, 44, 46]; });
    // rim and the stew (we can see in from above)
    p.ellipse(px, py - 12, 31, 8, (qx, qy, nx, ny) => { const d = Math.hypot(nx, ny); if (d > 0.82) return [140, 136, 140]; const h = hash2(qx >> 1, qy, seed); return h > 0.86 ? [120, 200, 90] : h > 0.76 ? [255, 120, 70] : h > 0.68 ? [250, 220, 140] : [196, 112, 52]; });
    ink(p, Array.from({ length: 21 }, (_, q) => [px + Math.cos((q / 20) * 6.28) * 31, py - 12 + Math.sin((q / 20) * 6.28) * 8]), seed, { col: [14, 10, 10], thick: 1.4 });
    ink(p, [[px - 32, py - 10], [px - 28, py + 8], [px - 14, py + 20], [px + 14, py + 20], [px + 28, py + 8], [px + 32, py - 10]], seed + 2, { col: [14, 10, 10], thick: 1.8 });
    // handle
    ink(p, [[px - 30, py - 14], [px - 18, py - 40], [px, py - 46], [px + 18, py - 40], [px + 30, py - 14]], seed + 3, { col: [80, 76, 84], thick: 1 });
    return p.toCanvas();
  });
  return potC;
}

/** Hand-drawn flame frames for the campfire (UI layer, animated). */
const flames = new Map();
export function flameCanvas(frame) {
  let c = flames.get(frame);
  if (c) return c;
  const W = 76, H = 70, p = new Painter(W, H);
  const layers = [
    { n: 5, h: 1.0, w: 9, col: [[196, 52, 20], [240, 96, 30]] },
    { n: 5, h: 0.78, w: 7, col: [[250, 140, 40], [255, 186, 70]] },
    { n: 3, h: 0.5, w: 6, col: [[255, 226, 130], [255, 248, 210]] },
  ];
  layers.forEach((L, li) => {
    for (let k = 0; k < L.n; k++) {
      const t = L.n === 1 ? 0.5 : k / (L.n - 1);
      const bx = W / 2 + (t - 0.5) * (52 - li * 14);
      const hh = (34 + Math.sin(k * 2.3 + frame * 1.1 + li) * 9 + hash2(k + li * 7, frame, 3) * 10) * L.h * (1 - Math.abs(t - 0.5) * 0.6);
      const sway = Math.sin(frame * 0.8 + k * 1.3 + li) * 5;
      const pts = [];
      for (let q = 0; q <= 10; q++) { const u = q / 10, yy = H - 4 - u * hh, ww = L.w * Math.sin((1 - u) * Math.PI * 0.5) * (1 - u * 0.2); pts.push([bx - ww + sway * u * u, yy]); }
      for (let q = 10; q >= 0; q--) { const u = q / 10, yy = H - 4 - u * hh, ww = L.w * Math.sin((1 - u) * Math.PI * 0.5) * (1 - u * 0.2); pts.push([bx + ww + sway * u * u + Math.sin(u * 7 + frame) * 1.2, yy]); }
      p.poly(pts, (x, y) => (dither(x, y, (H - y) / (hh + 4)) ? L.col[0] : L.col[1]));
    }
  });
  // stray licks of flame breaking free
  for (let k = 0; k < 3; k++) { const x = 18 + hash2(k, frame, 9) * 40, y = 10 + hash2(frame, k, 9) * 20; p.ellipse(x, y, 1.6, 2.6, [255, 170, 60]); }
  c = p.toCanvas();
  flames.set(frame, c);
  return c;
}
