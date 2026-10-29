// The mining chamber backdrop, painted densely in the spirit of Eastward: a pastel cave of coloured
// strata around the rock face, a scaffold with a ladder and stacked crates, a tool rack, a hanging
// mine sign, a safety poster, copper pipes with a valve and a gauge, shelves of jars and plants,
// vines and roots, a crack of daylight in the ceiling, plank walkways, puddles that hold the lamplight
// and the minecart rails. All lighting is baked per surface with warm lamps and cool purple shadow.
import { Painter, dither } from './pixel.js';
import { hash2, fbm2, mixHex, hexToRgb, clamp } from '../core/math.js';
import { siteGrid, nearest2, lanternCanvas } from './handpaint.js';
import { STRATA, WOOD, MOSS, OUTLINE, rampOf, pk, light, grade, inkLine, fossil, shards } from './mine_kit.js';

const W = 960, H = 540;

/** Fill a polygon with a lit pastel ramp; fv(x,y) gives the form value (0..1) before light. */
function fill(p, pts, base, fv, opts = {}) {
  const rmp = typeof base === 'string' ? rampOf(base) : base;
  p.poly(pts, (x, y) => {
    const { L, cool } = light(x, y);
    const v = fv(x, y) * (opts.form ?? 0.62) + L * (opts.lit ?? 0.48) - 0.08 + (opts.bias || 0);
    return grade(pk(rmp, v, x, y), L, cool);
  });
  if (opts.outline !== false) inkLine(p, [...pts, pts[0]], OUTLINE, opts.thick || 1);
}
function px(p, x, y, base, v) { const { L, cool } = light(x, y); p.set(x, y, grade(pk(rampOf(base), v + L * 0.4 - 0.08, x, y), L, cool)); }

// ------------------------------------------------------------------ rock
function strataAt(region, y, x, seed) {
  const S = STRATA[region] || STRATA[0];
  const t = clamp((y + (fbm2(x * 0.01, y * 0.004, 2, seed) - 0.5) * 70) / 470, 0, 0.999);
  return S[Math.floor(t * S.length)];
}
function rockWall(p, region, seed) {
  const BW = 112, BH = 74, SW = 40, SH = 26;
  const big = siteGrid(BW, BH, seed), small = siteGrid(SW, SH, seed + 50);
  for (let y = 0; y < 496; y++) for (let x = 0; x < W; x++) {
    const wx = x + (fbm2(x * 0.012, y * 0.014, 3, seed + 20) - 0.5) * 60;
    const wy = y + (fbm2(x * 0.014 + 7, y * 0.012, 3, seed + 21) - 0.5) * 40;
    const B = nearest2(big, BW, BH, wx, wy, 0.85), S = nearest2(small, SW, SH, wx, wy);
    const eB = (B.d2 - B.d1) * 0.5, eS = (S.d2 - S.d1) * 0.5;
    const { L, dx, dy, cool } = light(x, y);
    const jit = Math.floor(B.s1[2] * 3 + 1.5) - 1; // each boulder leans to a neighbouring band
    const base = mixHex(strataAt(region, y + jit * 60, x, seed), '#6a5a8a', 0.1); // back wall sits a little hazier than the face
    const rmp = rampOf(base);
    if (eB < 0.9 + hash2(x >> 3, y >> 3, seed) * 0.5) { p.set(x, y, grade(rmp[0], L * 0.5, cool)); continue; }
    let v = 0.46 + (B.s1[2] * dx + B.s1[3] * dy) * 0.32 + (S.s1[2] * dx + S.s1[3] * dy) * 0.1;
    if (eB < 8) { const b = 1 - eB / 8; const nx = (wx - B.s1[0]) / (B.d1 || 1), ny = (wy - B.s1[1]) / (B.d1 || 1); v += (nx * dx + ny * dy) * b * 0.42 - b * 0.12; }
    const pairOn = hash2(Math.min(S.s1[4], S.s2[4]), Math.max(S.s1[4], S.s2[4]), seed) > 0.6;
    if (pairOn && eS < 0.8) v -= 0.22;
    // sediment lines and grit
    const sed = Math.sin((y + fbm2(x * 0.02, 0, 2, seed) * 30) * 0.42);
    if (sed > 0.94) v += 0.08;
    v += (fbm2(x * 0.08, y * 0.08, 2, seed) - 0.5) * 0.14 + (hash2(x, y, seed) - 0.5) * 0.05;
    const wet = fbm2(x * 0.16, y * 0.006, 2, seed + 30);
    if (wet > 0.72) v -= (wet - 0.72) * 0.7;
    if (eB < 2.2 && (((wx - B.s1[0]) * dx + (wy - B.s1[1]) * dy) / (B.d1 || 1)) > 0.3) v += 0.35; // rim light on lamp-facing boulder edges
    v = v * 0.78 + L * 0.38 - 0.1;
    p.set(x, y, grade(pk(rmp, v, x, y), L, cool));
  }
  // fossils and pebbles pressed into the wall
  for (let k = 0; k < 26; k++) {
    const x = Math.round(hash2(k, 1, seed) * W), y = Math.round(40 + hash2(k, 2, seed) * 420);
    if (x > 250 && x < 720 && y < 440) continue;
    fossil(p, x, y, k % 4, strataAt(region, y, x, seed));
  }
}

// ------------------------------------------------------------------ wood, metal, paper
function beam(p, pts, seed, horiz) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const across = horiz ? y1 - y0 : x1 - x0;
  fill(p, pts, WOOD[4], (x, y) => {
    const a = horiz ? (y - y0) / across : (x - x0) / across, along = horiz ? x : y;
    const grain = Math.sin(along * 0.07 + a * 8 + Math.sin(along * 0.02 + seed) * 2) * 0.08 + (hash2(Math.floor(along / 4), Math.floor(a * 10), seed) - 0.5) * 0.12;
    return 0.42 + Math.cos((a - 0.5) * Math.PI) * 0.3 + grain + (a < 0.15 ? 0.12 : 0);
  }, { thick: 1 });
  // knots and nail heads
  for (let k = 0; k < 2; k++) {
    const t = hash2(k, 5, seed);
    const kx = horiz ? x0 + 8 + t * (x1 - x0 - 16) : x0 + across / 2, ky = horiz ? y0 + across / 2 : y0 + 8 + t * (y1 - y0 - 16);
    p.set(Math.round(kx), Math.round(ky), hexToRgb(WOOD[1])); p.set(Math.round(kx) + 1, Math.round(ky), hexToRgb(WOOD[2]));
  }
}
function nail(p, x, y) { p.set(x, y, [236, 228, 220]); p.set(x + 1, y + 1, [96, 84, 104]); }
function crate(p, x, y, w, h, seed) {
  beam(p, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, true);
  for (let k = 1; k < 3; k++) inkLine(p, [[x + 1, y + (h * k) / 3], [x + w - 1, y + (h * k) / 3]], hexToRgb(WOOD[1]));
  inkLine(p, [[x + 3, y + 3], [x + w - 3, y + h - 3]], hexToRgb(WOOD[2]), 2);
  inkLine(p, [[x + w - 3, y + 3], [x + 3, y + h - 3]], hexToRgb(WOOD[2]), 2);
  for (const [nx, ny] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]) nail(p, nx, ny);
}
function pipeH(p, x0, x1, y, r, col = '#d08a5a') {
  for (let x = x0; x <= x1; x++) for (let j = -r; j <= r; j++) px(p, x, y + j, col, 0.62 - (j / r) * 0.34 + (j === -r + 1 ? 0.22 : 0));
  inkLine(p, [[x0, y - r - 1], [x1, y - r - 1]]); inkLine(p, [[x0, y + r + 1], [x1, y + r + 1]]);
  for (let x = x0 + 20; x < x1 - 6; x += 56) {
    for (let j = -r - 2; j <= r + 2; j++) for (let i = 0; i < 4; i++) px(p, x + i, y + j, '#a86a48', 0.56 - (j / r) * 0.3 + (i === 0 ? 0.2 : 0));
    inkLine(p, [[x - 1, y - r - 3], [x - 1, y + r + 3]]); inkLine(p, [[x + 4, y - r - 3], [x + 4, y + r + 3]]);
    nail(p, x + 1, y - r - 1); nail(p, x + 1, y + r);
  }
}
function pipeV(p, x, y0, y1, r, col = '#d08a5a') {
  for (let y = y0; y <= y1; y++) for (let i = -r; i <= r; i++) px(p, x + i, y, col, 0.62 - (i / r) * 0.34 + (i === -r + 1 ? 0.22 : 0));
  inkLine(p, [[x - r - 1, y0], [x - r - 1, y1]]); inkLine(p, [[x + r + 1, y0], [x + r + 1, y1]]);
}
function valve(p, x, y) {
  p.ellipse(x, y, 7, 7, (qx, qy, nx, ny) => { const d = Math.hypot(nx, ny); if (d < 0.62 && Math.abs(nx) > 0.18 && Math.abs(ny) > 0.18) return null; return hexToRgb(d > 0.8 ? '#7a2a3a' : ny < 0 ? '#ff7a7a' : '#d04a5a'); });
  p.ellipse(x, y, 2, 2, [250, 210, 200]);
  inkLine(p, Array.from({ length: 17 }, (_, k) => [x + Math.cos((k / 16) * 6.28) * 7.5, y + Math.sin((k / 16) * 6.28) * 7.5]));
}
function gauge(p, x, y) {
  p.ellipse(x, y, 10, 10, (qx, qy, nx, ny) => hexToRgb(Math.hypot(nx, ny) > 0.78 ? (ny < 0 ? '#ffd9a0' : '#b07a48') : '#fff4e0'));
  for (let k = 0; k < 9; k++) { const a = Math.PI * (0.8 + k * 0.175); p.set(Math.round(x + Math.cos(a) * 6.5), Math.round(y + Math.sin(a) * 6.5), [90, 70, 90]); }
  inkLine(p, [[x, y], [x + 5, y - 3]], [200, 50, 60]);
  p.set(x, y, OUTLINE);
  inkLine(p, Array.from({ length: 21 }, (_, k) => [x + Math.cos((k / 20) * 6.28) * 10.5, y + Math.sin((k / 20) * 6.28) * 10.5]));
}
function jar(p, x, y, h, col, seed) {
  const w = 5 + (seed % 3);
  fill(p, [[x - w, y - h + 3], [x + w, y - h + 3], [x + w, y], [x - w, y]], col, (qx) => 0.5 - (qx - x) / w * 0.25, { lit: 0.4 });
  fill(p, [[x - w + 2, y - h], [x + w - 2, y - h], [x + w - 2, y - h + 3], [x - w + 2, y - h + 3]], '#b08a6a', () => 0.5);
  p.set(x - w + 2, y - h + 5, [255, 255, 255]); p.set(x - w + 2, y - h + 6, [240, 240, 255]);
}
function shelf(p, x, y, w, seed) {
  beam(p, [[x, y], [x + w, y], [x + w, y + 5], [x, y + 5]], seed, true);
  for (const bx of [x + 6, x + w - 9]) beam(p, [[bx, y + 5], [bx + 3, y + 5], [bx + 1, y + 14]], seed + bx);
}
function sign(p, x, y, w, h, seed, pict) {
  inkLine(p, [[x + 6, y - 14], [x + 6, y]], [150, 130, 120]); inkLine(p, [[x + w - 6, y - 14], [x + w - 6, y]], [150, 130, 120]);
  beam(p, [[x, y], [x + w, y + 1], [x + w - 1, y + h], [x + 1, y + h - 1]], seed, true);
  nail(p, x + 5, y + 2); nail(p, x + w - 6, y + 2);
  pict(p, x + w / 2, y + h / 2);
}
function poster(p, x, y, w, h, seed) {
  const paper = '#f2dcc0';
  fill(p, [[x, y + 1], [x + w, y], [x + w - 1, y + h], [x + 1, y + h + 1]], paper, (qx, qy) => 0.62 + (fbm2(qx * 0.1, qy * 0.1, 2, seed) - 0.5) * 0.25, { lit: 0.3 });
  // a canary in a cage: the old miners' gas alarm
  const cx = x + w / 2, cy = y + h * 0.45;
  for (let k = -6; k <= 6; k += 3) inkLine(p, [[cx + k, cy - 8], [cx + k, cy + 7]], [120, 90, 100]);
  inkLine(p, [[cx - 7, cy + 7], [cx + 7, cy + 7]], [120, 90, 100]);
  p.ellipse(cx, cy - 8, 7, 3, (qx, qy, nx, ny) => (ny < 0 ? [120, 90, 100] : null));
  p.ellipse(cx, cy + 1, 3, 2.6, [255, 214, 70]); p.set(cx + 3, cy, [255, 150, 60]); p.set(cx - 1, cy, OUTLINE);
  for (let k = 0; k < 3; k++) inkLine(p, [[x + 5, y + h - 9 + k * 3], [x + w - 5 - (k % 2) * 6, y + h - 9 + k * 3]], [170, 100, 110]);
  for (const [tx, ty] of [[x + 1, y + 1], [x + w - 4, y]]) for (let i = 0; i < 4; i++) p.set(tx + i, ty + (i % 2), [220, 220, 200]);
  inkLine(p, [[x, y + 1], [x + w, y], [x + w - 1, y + h], [x + 1, y + h + 1], [x, y + 1]]);
}
function ladder(p, x, y0, y1, seed) {
  beam(p, [[x, y0], [x + 4, y0], [x + 4, y1], [x, y1]], seed);
  beam(p, [[x + 18, y0], [x + 22, y0], [x + 22, y1], [x + 18, y1]], seed + 1);
  for (let y = y0 + 8; y < y1 - 2; y += 13) beam(p, [[x + 4, y], [x + 18, y], [x + 18, y + 3], [x + 4, y + 3]], seed + y, true);
}

// ------------------------------------------------------------------ plants & water
function vine(p, x, y, len, seed) {
  let cx = x;
  for (let j = 0; j < len; j++) {
    cx += Math.sin(j * 0.25 + seed) * 0.5;
    p.set(Math.round(cx), y + j, MOSS[j % 5 === 0 ? 2 : 1]);
    if (j % 6 === 3) { const s = hash2(j, 1, seed) > 0.5 ? 1 : -1; p.set(Math.round(cx) + s, y + j, MOSS[3]); p.set(Math.round(cx) + s * 2, y + j + 1, MOSS[2]); p.set(Math.round(cx) + s, y + j + 1, MOSS[1]); }
  }
  p.set(Math.round(cx), y + len, MOSS[3]);
}
function fern(p, x, y, size, seed) {
  for (let f = 0; f < 5; f++) {
    const a = -Math.PI / 2 + (f - 2) * 0.42 + (hash2(f, 1, seed) - 0.5) * 0.2;
    for (let t = 0; t < size; t++) {
      const bend = t * t * 0.012 * Math.sign(f - 2);
      const qx = Math.round(x + Math.cos(a) * t + bend * 10), qy = Math.round(y + Math.sin(a) * t + t * t * 0.02);
      p.set(qx, qy, MOSS[1]);
      if (t % 2 === 0 && t > 2) { p.set(qx - 1, qy + 1, MOSS[2]); p.set(qx + 1, qy + 1, MOSS[t < size * 0.6 ? 2 : 3]); }
    }
  }
}
function mushrooms(p, x, y, col, seed) {
  for (let k = 0; k < 3; k++) {
    const mx = x + k * 6 - 6, h = 4 + Math.floor(hash2(k, 1, seed) * 6), r = 3 + Math.floor(hash2(k, 2, seed) * 2);
    for (let j = 0; j < h; j++) { p.set(mx, y - j, [240, 228, 212]); p.set(mx + 1, y - j, [200, 180, 190]); }
    p.ellipse(mx, y - h, r, r * 0.6, (qx, qy, nx, ny) => (ny > 0.35 ? null : hexToRgb(ny < -0.3 ? mixHex(col, '#ffffff', 0.4) : col)));
    p.set(mx - 1, y - h - 1, [255, 255, 255]);
  }
}
function puddle(p, x, y, w, seed) {
  p.ellipse(x, y, w, 3.5, (qx, qy, nx, ny) => {
    const { L } = light(qx, qy - 60);
    const streak = Math.abs(qx - 298) < 6 || Math.abs(qx - 702) < 6 ? 0.4 : 0;
    const ripple = Math.sin(qx * 0.6 + qy * 2 + seed) > 0.8 ? 0.2 : 0;
    const v = 0.28 + L * 0.4 + streak + ripple - Math.abs(ny) * 0.15;
    return pk(rampOf('#7a8cc0'), v, qx, qy);
  });
  inkLine(p, Array.from({ length: 21 }, (_, k) => [x + Math.cos((k / 20) * 6.28) * (w + 0.5), y + Math.sin((k / 20) * 6.28) * 4]), [74, 60, 96]);
}

// ------------------------------------------------------------------ the whole room
export function paintRoom(region, opts) {
  const { BOARD, FLOOR_Y, LANTERNS } = opts;
  const p = new Painter(W, H);
  const seed = 41 + region * 13;
  const S = STRATA[region] || STRATA[0];
  rockWall(p, region, seed);

  // the worked recess around the face sinks into shadow
  for (let y = BOARD.y - 16; y < BOARD.y + BOARD.h + 12; y++) for (let x = BOARD.x - 16; x < BOARD.x + BOARD.w + 16; x++) {
    const e = Math.min(x - (BOARD.x - 16), BOARD.x + BOARD.w + 16 - x, y - (BOARD.y - 16), BOARD.y + BOARD.h + 12 - y) + fbm2(x * 0.1, y * 0.1, 2, 3) * 8;
    if (e > 3 && dither(x, y, clamp((e - 3) / 10, 0, 0.55))) { const c = p.get(x, y); if (c) p.set(x, y, [c[0] * 0.66, c[1] * 0.62, c[2] * 0.78]); }
  }

  // daylight crack in the ceiling (top left) with a pale halo
  const crack = [[46, 0], [140, 0], [128, 8], [102, 14], [78, 12], [58, 7]];
  p.poly(crack, (x, y) => (y < 4 ? [255, 250, 230] : [255, 236, 196]));
  for (let y = 0; y < 60; y++) for (let x = 20; x < 180; x++) {
    const d = Math.hypot((x - 92) / 90, (y - 4) / 50);
    if (d < 1 && dither(x, y, (1 - d) * 0.45)) { const c = p.get(x, y); if (c && c[0] < 250) p.set(x, y, [Math.min(255, c[0] + 34), Math.min(255, c[1] + 28), Math.min(255, c[2] + 14)]); }
  }
  inkLine(p, [...crack, crack[0]]);

  // floor: packed earth with flat stones
  const dirt = mixHex(S[2], '#8a6a5a', 0.4);
  const edge = [];
  for (let x = 0; x <= W; x += 8) edge.push([x, FLOOR_Y + Math.sin(x * 0.03 + seed) * 2 + (hash2(x, 1, seed) - 0.5) * 3]);
  for (let x = 0; x < W; x++) {
    const e = edge[Math.min(edge.length - 1, Math.floor(x / 8))][1];
    for (let y = Math.floor(e); y < H; y++) {
      const { L, cool } = light(x, y - 50);
      const v = 0.5 - (y - e) * 0.004 + (fbm2(x * 0.05, y * 0.14, 2, seed + 4) - 0.5) * 0.3;
      p.set(x, y, grade(pk(rampOf(dirt), v * 0.55 + L * 0.5, x, y), L, cool));
    }
  }
  inkLine(p, edge, OUTLINE, 2);
  for (let k = 0; k < 120; k++) {
    const x = hash2(k, 7, seed) * W, y = FLOOR_Y + 6 + hash2(k, 8, seed) * (H - FLOOR_Y - 8);
    const r = 1.5 + hash2(k, 9, seed) * 3.5;
    const pts = [];
    for (let q = 0; q < 6; q++) { const a = (q / 6) * Math.PI * 2; pts.push([x + Math.cos(a) * r * (0.7 + hash2(q, k, 3) * 0.5), y + Math.sin(a) * r * 0.6]); }
    fill(p, pts, S[k % 3 + 1], (qx, qy) => (qy < y ? 0.75 : 0.35), { outline: r > 3 });
  }
  // plank walkway in front of the face
  for (let x = 288; x < 704; x += 26) beam(p, [[x, FLOOR_Y + 4], [x + 25, FLOOR_Y + 3], [x + 25, FLOOR_Y + 13], [x, FLOOR_Y + 14]], seed + x, true);
  for (let x = 292; x < 704; x += 26) { nail(p, x, FLOOR_Y + 6); nail(p, x + 19, FLOOR_Y + 6); }
  puddle(p, 250, 518, 24, seed); puddle(p, 640, 526, 30, seed + 1); puddle(p, 62, 530, 18, seed + 2);

  // minecart rails (side view): sleepers, then the rail with a lamp-lit top edge
  for (let x = 724; x < W; x += 17) beam(p, [[x, 504], [x + 11, 503], [x + 12, 510], [x - 1, 511]], x, true);
  for (let x = 712; x < W; x++) { p.set(x, 500, [250, 226, 196]); p.set(x, 501, [170, 160, 180]); p.set(x, 502, [110, 100, 130]); p.set(x, 503, OUTLINE); }

  // ---- spoil heap at the foot of the face: tumbled stones, a leaning plank, moss
  for (let k = 0; k < 46; k++) {
    const t = hash2(k, 61, seed), x = BOARD.x - 6 + t * (BOARD.w + 12), base = FLOOR_Y + 2 - Math.pow(hash2(k, 62, seed), 1.6) * 54;
    const r = 4 + hash2(k, 63, seed) * 9, col = S[2 + (k % 4)];
    const pts = [];
    for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; pts.push([x + Math.cos(a) * r * (0.8 + hash2(q, k, 64) * 0.35), base - r * 0.7 + Math.sin(a) * r * 0.7]); }
    fill(p, pts, col, (qx, qy) => 0.5 + (base - r * 0.7 - qy) / r * 0.3 - (qx - x) / r * 0.15, { form: 0.8, lit: 0.36 });
    if (hash2(k, 65, seed) > 0.7) for (let m = -2; m <= 2; m++) p.set(Math.round(x + m), Math.round(base - r * 1.35), MOSS[2 + (m & 1)]);
  }
  beam(p, [[600, FLOOR_Y - 58], [606, FLOOR_Y - 60], [628, FLOOR_Y + 2], [621, FLOOR_Y + 3]], seed + 66);
  beam(p, [[268, FLOOR_Y - 40], [276, FLOOR_Y - 42], [300, FLOOR_Y + 2], [292, FLOOR_Y + 3]], seed + 67);

  // ---- left: scaffold platform, ladder, crates, tool rack, mine sign, poster
  const PY = 318;
  for (const sx of [14, 112, 230]) beam(p, [[sx, PY + 6], [sx + 8, PY + 6], [sx + 8, FLOOR_Y + 2], [sx, FLOOR_Y + 2]], seed + sx);
  beam(p, [[20, PY + 26], [112, PY + 70], [112, PY + 76], [20, PY + 32]], seed + 3);
  beam(p, [[0, PY], [244, PY - 1], [244, PY + 8], [0, PY + 9]], seed + 4, true);
  ladder(p, 194, PY - 2, FLOOR_Y + 2, seed + 5);
  crate(p, 10, PY - 40, 40, 40, seed + 6); crate(p, 48, PY - 28, 30, 28, seed + 7); crate(p, 18, PY - 66, 26, 26, seed + 8);
  p.blit(lanternCanvas(1), 140, PY - 32);
  for (const [bx, col] of [[92, '#ff9ab0'], [104, '#7ad8c8'], [115, '#ffd27a']]) jar(p, bx, PY - 1, 10, col, bx);
  // tool rack with pegs: pickaxe, shovel, hammer, saw
  beam(p, [[28, 156], [178, 154], [178, 214], [28, 216]], seed + 9, true);
  for (let x = 40; x < 172; x += 30) nail(p, x, 162);
  inkLine(p, [[46, 164], [42, 206]], hexToRgb(WOOD[3]), 2); inkLine(p, [[30, 170], [46, 164], [60, 172]], [200, 200, 220], 2);
  inkLine(p, [[78, 164], [78, 196]], hexToRgb(WOOD[3]), 2); fill(p, [[72, 196], [84, 196], [82, 210], [74, 210]], '#9aa0b8', (x) => 0.5 - (x - 78) * 0.03);
  inkLine(p, [[108, 166], [108, 204]], hexToRgb(WOOD[3]), 2); fill(p, [[100, 164], [116, 164], [116, 172], [100, 172]], '#8a90a8', (x, y) => 0.6 - (y - 164) * 0.04);
  fill(p, [[132, 166], [166, 166], [166, 178], [134, 180]], '#c8ccd8', (x, y) => 0.6 - (y - 166) * 0.02);
  for (let x = 136; x < 166; x += 3) p.set(x, 179, [240, 240, 250]);
  sign(p, 150, 96, 74, 26, seed + 10, (pp, cx, cy) => {
    inkLine(pp, [[cx - 14, cy + 6], [cx + 4, cy - 6]], hexToRgb(WOOD[1]), 2); inkLine(pp, [[cx - 2, cy - 9], [cx + 8, cy - 3]], [210, 210, 230], 2);
    inkLine(pp, [[cx + 14, cy + 6], [cx - 4, cy - 6]], hexToRgb(WOOD[1]), 2); fill(pp, [[cx - 9, cy - 9], [cx - 1, cy - 9], [cx - 1, cy - 4], [cx - 9, cy - 4]], '#8a90a8', () => 0.6);
    for (let k = 0; k < 3; k++) pp.set(cx + 18 + k * 3, cy + 6, [255, 230, 160]);
  });
  poster(p, 40, 232, 40, 52, seed + 11);
  poster(p, 92, 240, 30, 38, seed + 12);

  // ---- right: pipes with valve and gauge, shelves with jars and plants, exit sign
  pipeH(p, 708, W, 232, 4);
  pipeV(p, 944, 236, FLOOR_Y, 4);
  pipeH(p, 708, 900, 216, 2, '#9aa8c0');
  valve(p, 772, 232); gauge(p, 846, 252);
  inkLine(p, [[846, 232], [846, 242]], [140, 110, 90], 2);
  shelf(p, 856, 286, 80, seed + 13); shelf(p, 856, 326, 80, seed + 14);
  for (const [bx, h, col] of [[866, 12, '#ff8aa8'], [880, 16, '#8adcc8'], [893, 10, '#ffd27a'], [906, 14, '#b89aff'], [920, 9, '#ff9a6a']]) jar(p, bx, 285, h, col, bx);
  for (let k = 0; k < 5; k++) fill(p, [[864 + k * 7, 312], [870 + k * 7, 312], [870 + k * 7, 325], [864 + k * 7, 325]], ['#c86a7a', '#6a8ac8', '#d8b85a', '#7ab87a', '#a87ac8'][k], () => 0.55, { lit: 0.35 });
  fern(p, 916, 325, 12, seed + 15);
  p.blit(lanternCanvas(2), 896, 238);
  sign(p, 868, 364, 64, 22, seed + 16, (pp, cx, cy) => {
    const pts = [[cx - 16, cy - 2], [cx + 6, cy - 2], [cx + 6, cy - 7], [cx + 16, cy + 1], [cx + 6, cy + 9], [cx + 6, cy + 4], [cx - 16, cy + 4]];
    pp.poly(pts, [255, 214, 120]); inkLine(pp, [...pts, pts[0]], [120, 60, 50]);
  });

  // ---- timber shoring round the face, with brackets, moss and roots
  const postL = BOARD.x - 26, postR = BOARD.x + BOARD.w + 8;
  beam(p, [[postL, 18], [postL + 17, 20], [postL + 18, FLOOR_Y + 6], [postL - 1, FLOOR_Y + 5]], seed + 1);
  beam(p, [[postR, 20], [postR + 18, 18], [postR + 19, FLOOR_Y + 5], [postR, FLOOR_Y + 6]], seed + 2);
  beam(p, [[postL - 22, 8], [postR + 40, 5], [postR + 41, 27], [postL - 21, 30]], seed + 3, true);
  beam(p, [[postL + 16, 28], [postL + 52, 28], [postL + 18, 64]], seed + 4);
  beam(p, [[postR + 2, 28], [postR - 34, 28], [postR + 1, 64]], seed + 5);
  for (const [x, y] of [[postL + 4, 14], [postL + 12, 15], [postR + 5, 13], [postR + 13, 12], [postL + 6, 120], [postR + 8, 300], [postL + 9, 340], [postR + 6, 150]]) nail(p, x, y);
  for (const [bx, by] of [[postL - 2, 24], [postR - 2, 22]]) { fill(p, [[bx, by], [bx + 22, by], [bx + 22, by + 6], [bx, by + 6]], '#7a7a9a', () => 0.55); nail(p, bx + 3, by + 2); nail(p, bx + 17, by + 2); }
  for (let x = postL - 20; x < postR + 38; x += 3) if (hash2(x, 3, seed) > 0.35) { const h = 1 + Math.floor(hash2(x, 4, seed) * 3); for (let j = 0; j < h; j++) p.set(x, 7 - j, MOSS[j === h - 1 ? 3 : 1]); }
  for (let k = 0; k < 18; k++) { const x = Math.round(postL + hash2(k, 5, seed) * (postR - postL + 30)); vine(p, x, 28, 10 + Math.floor(hash2(k, 6, seed) * 34), seed + k); }
  for (const l of LANTERNS) { inkLine(p, [[l.x, 26], [l.x, l.y - 14]], [80, 70, 90]); p.set(l.x, 26, [220, 210, 230]); }

  // ---- stalactites, roots and vines along the ceiling
  for (let k = 0; k < 20; k++) {
    const x = Math.round(hash2(k, 21, seed) * W), len = 10 + Math.floor(hash2(k, 22, seed) * 26), w = 4 + Math.floor(hash2(k, 23, seed) * 7);
    if (x > postL - 24 && x < postR + 42) continue;
    const pts = [[x - w, 0], [x + w, 0], [x + 1, len], [x - 1, len]];
    fill(p, pts, S[1], (qx) => 0.62 - (qx - x) / w * 0.3);
    p.set(x, len + 2, [180, 220, 255]);
  }
  for (let k = 0; k < 14; k++) { const x = Math.round(hash2(k, 31, seed) * W); if (x > postL - 24 && x < postR + 42) continue; vine(p, x, 0, 20 + Math.floor(hash2(k, 32, seed) * 60), seed + 40 + k); }

  // ---- plants and crystals in the corners, a few glowing mushrooms
  const acc = ['#ff9ab0', '#7ad8c8', '#ffd27a', '#b89aff', '#ff8a6a', '#c8a0ff'];
  fern(p, 8, FLOOR_Y + 2, 16, seed + 50); fern(p, 248, FLOOR_Y + 4, 10, seed + 51); fern(p, 950, FLOOR_Y + 3, 14, seed + 52); fern(p, 720, FLOOR_Y + 2, 9, seed + 53);
  mushrooms(p, 170, FLOOR_Y + 2, acc[region % acc.length], seed + 54);
  mushrooms(p, 700, FLOOR_Y + 1, acc[(region + 2) % acc.length], seed + 55);
  shards(p, 236, 300, acc[(region + 3) % acc.length], 4, seed + 56);
  shards(p, 940, 214, acc[(region + 1) % acc.length], 3, seed + 57);
  shards(p, 720, 140, acc[(region + 4) % acc.length], 3, seed + 58);
  return p.toCanvas();
}
