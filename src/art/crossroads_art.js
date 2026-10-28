// Hand-painted crossroads cavern: the tunnel splits into two or three mouths. Each mouth is dressed
// for its path (timber frame, rails, a bridge over a crevasse, an old lift, carved stairs, flooded
// floor…) and marked by what waits beyond (claw gouges, bones, a trader's sign, scattered coins…).
import { Painter, dither } from './pixel.js';
import { hash2, fbm2, mixHex, shadeHex, hexToRgb, clamp } from '../core/math.js';
import { withLights, lightAt, ramp9, pick, inkAt, ink, caveRock, plank, nail, crystal, mushroom, barrel, sack, WARM, TEAL } from './handpaint.js';

export const CW = 1008, CH = 568, HORIZON = 400;
/** Lamp that lights the junction (bg coordinates). */
const LIGHTS = [{ x: 504, y: 130, r: 520 }, { x: 140, y: 470, r: 260, k: 0.5 }, { x: 868, y: 470, r: 260, k: 0.5 }];
const cache = new Map();
const memo = (k, f) => { let c = cache.get(k); if (!c) { c = withLights(LIGHTS, f); cache.set(k, c); if (cache.size > 24) cache.delete(cache.keys().next().value); } return c; };

/** Mouth centres (bg coords) for n choices; boss mouths are wider. */
export function mouthLayout(n, boss = false) {
  n = Math.max(1, n);
  const span = n === 1 ? 0 : Math.min(760, 280 * (n - 1));
  const w = boss ? 210 : n >= 4 ? 128 : n === 3 ? 150 : 170;
  return Array.from({ length: n }, (_, i) => ({ x: Math.round(504 - span / 2 + (n === 1 ? 0 : (i * span) / (n - 1))), y: HORIZON, w, h: boss ? 250 : n >= 4 ? 180 : 210 }));
}

function boxPts(m, seed, crawl) {
  const w = (crawl ? m.w * 0.72 : m.w) * 0.86, h = (crawl ? m.h * 0.55 : m.h) * 0.86;
  const pts = [];
  const j = (k, a) => (hash2(k, seed, a) - 0.5) * 6;
  for (let k = 0; k <= 6; k++) pts.push([m.x - w / 2 + j(k, 1), m.y - (k / 6) * h]);
  for (let k = 1; k <= 8; k++) pts.push([m.x - w / 2 + (k / 8) * w, m.y - h + j(k, 2) * 0.6]);
  for (let k = 5; k >= 0; k--) pts.push([m.x + w / 2 + j(k, 3), m.y - (k / 6) * h]);
  pts.push([m.x + w / 2 - 4, m.y + 4], [m.x - w / 2 + 4, m.y + 4]);
  return { pts, w, h };
}
function archPts(m, seed, crawl) {
  const w = crawl ? m.w * 0.72 : m.w, h = crawl ? m.h * 0.55 : m.h;
  const pts = [];
  const n = 26;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI - (k / n) * Math.PI;
    const j = (hash2(k, seed, 5) - 0.5) * 10;
    const r = 1 + (hash2(k, seed, 6) - 0.5) * 0.06;
    const x = m.x + Math.cos(a) * (w / 2) * r + j * 0.4;
    // tall arch: sides rise straight-ish, then curve over
    const yy = Math.sin(a);
    const y = m.y - (yy < 0.75 ? yy * 0.55 * h / 0.75 * 1 : 0.55 * h + (yy - 0.75) / 0.25 * 0.45 * h) + j * 0.3;
    pts.push([x, y]);
  }
  pts.push([m.x + w / 2 - 4, m.y + 4], [m.x - w / 2 + 4, m.y + 4]);
  return { pts, w, h };
}

/** The cave around the junction (static per region). */
function cavernBase(region, pal) {
  return memo('base|' + region, () => {
    const p = new Painter(CW, CH);
    const seed = 900 + region * 17;
    caveRock(p, 0, 0, CW, HORIZON + 8, pal, seed, { bias: 0.02 });
    // floor: packed dirt receding to the back wall
    const dirt = ramp9([shadeHex(pal.dirt[0], -0.2), pal.dirt[0], pal.dirt[1], pal.dirt[2], shadeHex(pal.dirt[2], 0.25)]);
    const edge = [];
    for (let x = 0; x <= CW; x += 8) edge.push([x, HORIZON + Math.sin(x * 0.02 + seed) * 3 + (hash2(x, 1, seed) - 0.5) * 4]);
    for (let x = 0; x < CW; x++) {
      const e = edge[Math.min(edge.length - 1, Math.floor(x / 8))][1];
      for (let y = Math.floor(e); y < CH; y++) {
        const { L } = lightAt(x, y - 60);
        const depth = (y - e) / (CH - e);
        const v = 0.35 + depth * 0.25 + (fbm2(x * 0.03, y * 0.09, 2, seed + 4) - 0.5) * 0.3;
        p.set(x, y, pick(dirt, v * 0.5 + L * 0.62 - 0.12, x, y));
      }
    }
    ink(p, edge, seed, { thick: 2 });
    // pebbles grow larger toward the viewer
    for (let k = 0; k < 220; k++) {
      const y = HORIZON + 8 + Math.pow(hash2(k, 8, seed), 0.7) * (CH - HORIZON - 10), x = hash2(k, 7, seed) * CW;
      const r = 1 + ((y - HORIZON) / (CH - HORIZON)) * 5 * (0.5 + hash2(k, 9, seed));
      const { L } = lightAt(x, y - 60);
      const pts = [];
      for (let q = 0; q < 7; q++) { const a = (q / 7) * Math.PI * 2; pts.push([x + Math.cos(a) * r * (0.7 + hash2(q, k, 3) * 0.5), y + Math.sin(a) * r * 0.55]); }
      p.poly(pts, (px, py) => pick(dirt, (py < y ? 0.8 : 0.35) * 0.5 + L * 0.62, px, py));
      if (r > 3) ink(p, [...pts, pts[0]], k, { thick: 0.8 });
    }
    // stalactites: irregular, inked, lit on the lamp side
    const rock = ramp9(pal.rock);
    for (let k = 0; k < 16; k++) {
      const x = 20 + hash2(k, 21, seed) * (CW - 40), len = 30 + hash2(k, 22, seed) * 80, w = 8 + hash2(k, 23, seed) * 18;
      const pts = [];
      for (let q = 0; q <= 8; q++) { const t = q / 8; pts.push([x - w * (1 - t) ** 0.8 + (hash2(q, k, 31) - 0.5) * 4, t * len]); }
      for (let q = 8; q >= 0; q--) { const t = q / 8; pts.push([x + w * (1 - t) ** 0.8 + (hash2(q, k, 32) - 0.5) * 4, t * len - (q === 8 ? 0 : 2)]); }
      p.poly(pts, (px, py) => { const { L, dx } = lightAt(px, py); return pick(rock, 0.45 + (px < x ? -dx : dx) * -0.3 + L * 0.55 - py * 0.002, px, py); });
      ink(p, pts, seed + k, { thick: 1.6 });
      p.set(Math.round(x), Math.round(len) + 2, pal.water || '#6ad8ff');
    }
    // the lamp's chain and hook
    for (let y = 0; y < 96; y += 3) { p.set(504, y, [70, 64, 60]); p.set(505, y + 1, [40, 36, 34]); }
    // regional dressing in the wings
    const acc = pal.accent;
    [[60, HORIZON + 40], [110, HORIZON + 130], [950, HORIZON + 50], [900, HORIZON + 140], [30, 250], [980, 240]].forEach(([x, y], k) => {
      if (region === 1 || region === 3 || region === 5) crystal(p, x, y, 22 + hash2(k, 1, seed) * 30, acc[k % 2], seed + k);
      else if (region === 2) { mushroom(p, x, y, 12 + hash2(k, 1, seed) * 18, acc[k % 3], seed + k); mushroom(p, x + 12, y + 2, 8 + hash2(k, 2, seed) * 8, acc[(k + 1) % 3], seed + k + 9); }
      else if (region === 4 && y > HORIZON) { const pts = []; let xx = x - 30; for (let i = 0; i < 10; i++) { pts.push([xx, y + (hash2(i, k, 4) - 0.5) * 8]); xx += 7; } ink(p, pts, k, { col: [255, 120, 40], thick: 2.2 }); }
      else if (y > HORIZON) { barrel(p, x - 18, y - 46, 36, 48, seed + k); }
    });
    if (region === 0) sack(p, 150, HORIZON + 60, seed + 50);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ mouths
function paintMouth(p, m, choice, pal, seed) {
  const tun = choice.tunnel, type = choice.type;
  const crawl = tun === 'crawl';
  const timber = ['tunnel', 'minecart', 'elevator', 'stairs', 'crawl'].includes(tun);
  const { pts, w, h } = timber ? boxPts(m, seed, crawl) : archPts(m, seed, crawl);
  const rock = ramp9(pal.rock);
  const deep = ramp9(['#0b0d0f', '#121719', '#1b1f1f', mixHex('#2a2824', pal.rock[1], 0.4), mixHex('#3a3229', pal.rock[2], 0.4)], '#b06a3a', '#030a0e');
  const vx = m.x, vy = m.y - h * 0.32; // vanishing point deep inside
  // interior: walls recede into darkness, a floor wedge runs to the vanishing point
  const mask = new Painter(CW, CH);
  mask.poly(pts, '#ffffff');
  let minY = 1e9;
  for (const [, y] of pts) minY = Math.min(minY, y);
  for (let y = Math.floor(minY); y <= m.y + 5; y++) for (let x = Math.floor(m.x - w / 2 - 2); x <= Math.ceil(m.x + w / 2 + 2); x++) {
    if (!mask.alpha(x, y)) continue;
    const ex = Math.abs(x - vx) / (w / 2), ey = (y - vy) / (m.y - vy);
    const floor = y > vy && Math.abs(x - vx) < (y - vy) / (m.y - vy) * (w / 2) * 0.9;
    const ring = Math.max(ex, y < vy ? (vy - y) / (vy - minY) : ey);
    let v = ring * 0.62 + (fbm2(x * 0.08, y * 0.08, 2, seed) - 0.5) * 0.2;
    if (floor) v = 0.2 + ey * 0.5 + (fbm2(x * 0.1, y * 0.2, 2, seed + 1) - 0.5) * 0.15;
    const { L } = lightAt(x, y);
    p.set(x, y, pick(deep, v * (0.55 + L * 0.5), x, y));
  }
  // depth: timber sets or rough rock rings receding toward the vanishing point
  for (let k = 3; k >= 1; k--) {
    const f = Math.pow(0.68, k), cx = vx + (m.x - vx) * f, by = vy + (m.y - vy) * f;
    const fw = w * f * 0.92, fh = (m.y - minY) * f * 0.92;
    const shade = 0.2 + (3 - k) * 0.12;
    if (timber) {
      const wood = ramp9(['#100a08', '#1c120c', '#2a1c12', '#3a2818', '#4a3420'], '#a06a3a', '#030a0e');
      const post = (x0) => { for (let y = Math.round(by - fh); y <= by; y++) for (let x = Math.round(x0); x < x0 + Math.max(2, 6 * f * 2); x++) p.set(x, y, pick(wood, shade + (x - x0) * 0.04, x, y)); };
      post(cx - fw / 2); post(cx + fw / 2 - Math.max(2, 6 * f * 2));
      for (let y = Math.round(by - fh); y < by - fh + Math.max(2, 7 * f * 2); y++) for (let x = Math.round(cx - fw / 2 - 3 * f); x <= cx + fw / 2 + 3 * f; x++) p.set(x, y, pick(wood, shade + 0.1, x, y));
    } else {
      const ring = [];
      for (let q = 0; q <= 18; q++) { const a = Math.PI - (q / 18) * Math.PI; ring.push([cx + Math.cos(a) * fw / 2 * (1 + (hash2(q, k, seed) - 0.5) * 0.12), by - Math.sin(a) * fh * (1 + (hash2(k, q, seed) - 0.5) * 0.1)]); }
      ink(p, ring, seed + k, { col: [Math.round(40 * shade + 10), Math.round(44 * shade + 12), Math.round(44 * shade + 14)], thick: 1.2 + f * 2 });
    }
  }
  // stairs carved down into the dark
  if (tun === 'stairs') for (let k = 0; k < 7; k++) {
    const t = k / 7, y = Math.round(m.y - t * (m.y - vy) * 0.95), half = (1 - t) * w * 0.4;
    for (let x = Math.round(vx - half); x <= vx + half; x++) { p.set(x, y, deep[6 - Math.min(5, k)]); p.set(x, y + 1, deep[1]); }
  }
  // flooded floor: dark water with lamp streaks
  if (tun === 'flooded') {
    for (let y = Math.round(vy + 8); y <= m.y + 30; y++) for (let x = Math.round(m.x - w * 0.6); x <= m.x + w * 0.6; x++) {
      const inside = mask.alpha(x, y) || (y > m.y && Math.abs(x - m.x) < w * 0.6 - (y - m.y) * 0.6);
      if (!inside) continue;
      const ripple = Math.sin(x * 0.3 + y * 1.7 + seed) > 0.85;
      const { L } = lightAt(x, y);
      p.set(x, y, ripple ? [120 + L * 120, 170 + L * 60, 170] : dither(x, y, 0.5) ? [16, 40, 50] : [22, 52, 62]);
    }
  }
  // rails converging into the mouth
  if (tun === 'minecart') {
    for (let k = 0; k < 9; k++) {
      const t = Math.pow(k / 9, 1.4), y = Math.round(CH - 6 - t * (CH - 6 - (m.y - 6))), half = 70 * (1 - t) + 10;
      plank(p, [[m.x - half - 8, y - 2], [m.x + half + 8, y - 2], [m.x + half + 8, y + 3 - t * 2], [m.x - half - 8, y + 3 - t * 2]], seed + k, true);
    }
    for (const side of [-1, 1]) {
      const line = [[m.x + side * 72, CH], [m.x + side * 12, m.y - 6], [vx + side * 3, vy + 10]];
      ink(p, line, seed + side, { col: [150, 156, 166], thick: 2.2 });
      ink(p, line.map(([x, y]) => [x + 1, y - 1]), seed, { col: [236, 214, 170], thick: 0.6 });
    }
  }
  // crevasse and bridge in front of the mouth
  const bridge = { bridge: 'rope', chainbridge: 'chain', crystalbridge: 'crystal', rootbridge: 'root', lavabridge: 'lava' }[tun];
  if (bridge) {
    const y0 = m.y + 24, y1 = m.y + 56;
    for (let y = y0 - 6; y < y1 + 12; y++) for (let x = Math.round(m.x - w * 0.95); x <= m.x + w * 0.95; x++) {
      const u = (x - m.x) / (w * 0.95), taper = Math.sqrt(Math.max(0, 1 - u * u));
      const mid = (y0 + y1) / 2 + Math.sin(x * 0.03 + seed) * 4, half = (y1 - y0) / 2 * taper;
      const top = mid - half + (fbm2(x * 0.15, 1, seed) - 0.5) * 7, bot = mid + half + (fbm2(x * 0.12, 2, seed) - 0.5) * 6;
      if (y < top || y > bot || half < 1) continue;
      const d = (y - top) / (bot - top);
      p.set(x, y, bridge === 'lava' ? (d > 0.6 ? (dither(x, y, 0.5) ? [255, 140, 40] : [255, 90, 20]) : [60 + d * 120, 20, 10]) : d < 0.12 ? rock[5] : [8, 12 + d * 6, 16 + d * 8]);
    }
    if (bridge === 'lava') for (let k = 0; k < 3; k++) { const x = m.x - 30 + k * 30, y = (y0 + y1) / 2; p.ellipse(x, y, 11, 5, (px, py, nx, ny) => (ny < -0.2 ? rock[6] : rock[3])); ink(p, Array.from({ length: 13 }, (_, q) => [x + Math.cos(q / 12 * 6.28) * 11, y + Math.sin(q / 12 * 6.28) * 5]), k, { thick: 1 }); }
    else {
      // planks narrowing toward the mouth
      for (let k = 0; k < 8; k++) {
        const t = k / 7, y = Math.round(y1 + 10 - t * (y1 + 10 - m.y + 4)), half = 34 - t * 12;
        if (bridge === 'crystal') { p.poly([[m.x - half, y - 2], [m.x + half, y - 3], [m.x + half - 2, y + 2], [m.x - half + 2, y + 3]], (x) => (x < m.x ? [150, 230, 255] : [80, 150, 220])); ink(p, [[m.x - half, y - 2], [m.x + half, y - 3]], k, { col: [230, 250, 255], thick: 0.6 }); }
        else if (bridge === 'root') ink(p, [[m.x - half, y], [m.x - half / 2, y - 2], [m.x + half / 2, y + 1], [m.x + half, y - 1]], seed + k, { col: [96, 62, 36], thick: 2.6 });
        else plank(p, [[m.x - half, y - 2], [m.x + half, y - 2 + (k % 2)], [m.x + half, y + 2], [m.x - half, y + 2]], seed + k, true);
      }
      const railCol = bridge === 'chain' ? [140, 140, 150] : bridge === 'crystal' ? [180, 240, 255] : bridge === 'root' ? [110, 72, 40] : [170, 130, 80];
      for (const side of [-1, 1]) {
        const a = [m.x + side * 40, y1 + 6], b = [m.x + side * 22, m.y - 2];
        const sag = [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 8], b];
        ink(p, [[a[0], a[1]], [a[0], a[1] - 30]], seed, { col: [80, 52, 30], thick: 2.6 });
        ink(p, sag.map(([x, y], i) => [x, y - (i === 0 ? 30 : 18)]), seed + side, { col: railCol, thick: bridge === 'chain' ? 2 : 1.4 });
      }
    }
  }
  // the mouth's frame: rough rim stones, or timber for worked tunnels
  if (timber) {
    const top = Math.min(...pts.map(([, y]) => y));
    const lx = m.x - w / 2 - 6, rx = m.x + w / 2 - 8;
    plank(p, [[lx, top + 6], [lx + 15, top + 8], [lx + 16, m.y + 6], [lx - 1, m.y + 5]], seed + 41);
    plank(p, [[rx, top + 8], [rx + 15, top + 6], [rx + 16, m.y + 5], [rx - 1, m.y + 6]], seed + 42);
    plank(p, [[lx - 14, top - 6], [rx + 30, top - 9], [rx + 31, top + 9], [lx - 13, top + 11]], seed + 43, true);
    nail(p, Math.round(lx + 6), Math.round(top + 2)); nail(p, Math.round(rx + 8), Math.round(top));
    if (tun === 'elevator') {
      // pulley wheel and a hanging cage
      const cx = m.x, cy = top - 2;
      p.ellipse(cx, cy, 10, 10, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.7 ? [120, 116, 124] : Math.abs(Math.sin(Math.atan2(ny, nx) * 3)) < 0.25 ? [90, 86, 94] : null));
      ink(p, [[cx + 9, cy], [cx + 9, m.y - h * 0.45]], seed, { col: [150, 120, 80], thick: 1 });
      const cg = [[cx - 30, m.y - h * 0.45], [cx + 30, m.y - h * 0.45], [cx + 30, m.y], [cx - 30, m.y]];
      for (let k = 0; k <= 5; k++) ink(p, [[cx - 30 + k * 12, m.y - h * 0.45], [cx - 30 + k * 12, m.y]], seed + k, { col: [110, 76, 46], thick: 1.6 });
      ink(p, [...cg, cg[0]], seed + 9, { col: [80, 52, 30], thick: 2 });
    }
  } else {
    // rim stones hugging the arch
    for (let k = 0; k < pts.length - 2; k += 2) {
      const [x, y] = pts[k];
      const r = 7 + hash2(k, seed, 7) * 6;
      const sp = [];
      for (let q = 0; q < 7; q++) { const a = (q / 7) * Math.PI * 2; sp.push([x + Math.cos(a) * r * (0.7 + hash2(q, k, seed) * 0.5), y + Math.sin(a) * r * (0.6 + hash2(k, q, seed) * 0.4)]); }
      p.poly(sp, (px, py) => { const { L, dx, dy } = lightAt(px, py); return pick(rock, 0.45 + ((px - x) * dx + (py - y) * dy) / r * 0.35 + L * 0.5, px, py); });
      ink(p, [...sp, sp[0]], seed + k, { thick: 1.4 });
    }
    if (tun === 'crystalbridge') for (let k = 0; k < 4; k++) crystal(p, m.x - w / 2 + k * (w / 3), m.y + 2, 16 + hash2(k, 3, seed) * 14, k % 2 ? '#6ad8ff' : '#b08aff', seed + k);
    if (tun === 'rootbridge') for (let k = 0; k < 5; k++) { const sx = m.x - w / 2 + hash2(k, 5, seed) * w; const line = []; let x = sx, y = minY - 10; for (let i = 0; i < 12; i++) { line.push([x, y]); x += (hash2(i, k, seed) - 0.5) * 9; y += 9; } ink(p, line, seed + k, { col: [86, 56, 32], thick: 2.4 }); }
  }
  ink(p, [...pts.slice(0, -2)], seed, { thick: 2.2 });
  // what waits beyond, painted at the threshold
  paintOmen(p, m, type, pts, pal, seed, w, h);
}

function paintOmen(p, m, type, pts, pal, seed, w, h) {
  const bone = [[236, 226, 200], [190, 176, 150], [120, 104, 86]];
  if (type === 'elite' || type === 'boss') {
    // claw gouges raked through the rim
    for (let c = 0; c < 2; c++) {
      const sx = m.x + (c ? w * 0.3 : -w * 0.42), sy = m.y - h * 0.62;
      for (let k = 0; k < 3; k++) ink(p, [[sx + k * 7, sy], [sx + k * 7 + 10, sy + 34]], seed + k, { col: [24, 14, 12], thick: 2.4 });
      for (let k = 0; k < 3; k++) ink(p, [[sx + k * 7 + 2, sy + 1], [sx + k * 7 + 11, sy + 32]], seed + k, { col: [140, 120, 100], thick: 0.5 });
    }
  }
  if (type === 'boss' || type === 'monster') {
    // gnawed bones and a skull at the threshold
    const n = type === 'boss' ? 6 : 2;
    for (let k = 0; k < n; k++) {
      const x = m.x - w * 0.45 + hash2(k, 1, seed) * w * 0.9, y = m.y + 10 + hash2(k, 2, seed) * 30, a = hash2(k, 3, seed) * 3;
      const dx = Math.cos(a) * 9, dy = Math.sin(a) * 3;
      ink(p, [[x - dx, y - dy], [x + dx, y + dy]], seed + k, { col: bone[1], thick: 2 });
      for (const s of [-1, 1]) { p.ellipse(x + s * dx, y + s * dy, 2.2, 2.2, bone[0]); }
    }
    if (type === 'boss') {
      const sx = m.x + w * 0.32, sy = m.y + 14;
      p.ellipse(sx, sy, 9, 8, (x, y, nx, ny) => (ny > 0.5 ? bone[1] : nx > 0.3 ? bone[1] : bone[0]));
      p.ellipse(sx - 3, sy, 2.4, 2.8, [20, 12, 12]); p.ellipse(sx + 3, sy, 2.4, 2.8, [20, 12, 12]);
      ink(p, Array.from({ length: 13 }, (_, q) => [sx + Math.cos(q / 12 * 6.28) * 9, sy + Math.sin(q / 12 * 6.28) * 8]), seed, { thick: 1.2 });
    }
  }
  if (type === 'merchant') {
    // a little hanging sign: a coin purse painted on a board
    const sx = m.x + w / 2 - 6, sy = m.y - h * 0.62;
    ink(p, [[sx + 6, sy - 14], [sx + 6, sy]], seed, { col: [150, 120, 80], thick: 0.8 });
    ink(p, [[sx + 30, sy - 14], [sx + 30, sy]], seed + 1, { col: [150, 120, 80], thick: 0.8 });
    plank(p, [[sx, sy], [sx + 38, sy - 1], [sx + 37, sy + 24], [sx + 1, sy + 25]], seed + 60, true);
    p.ellipse(sx + 19, sy + 14, 7, 6, (x, y, nx, ny) => (ny < -0.3 ? [240, 200, 90] : nx > 0.3 ? [150, 100, 30] : [210, 160, 50]));
    ink(p, [[sx + 15, sy + 7], [sx + 19, sy + 9], [sx + 23, sy + 7]], seed + 2, { col: [80, 50, 20], thick: 1 });
    p.set(Math.round(sx + 17), Math.round(sy + 12), [255, 250, 200]);
  }
  if (type === 'treasure') {
    for (let k = 0; k < 9; k++) {
      const x = m.x - 26 + hash2(k, 4, seed) * 52, y = m.y + 8 + hash2(k, 5, seed) * 22;
      p.ellipse(x, y, 2.6, 1.5, (px, py, nx, ny) => (ny < 0 ? [255, 226, 120] : [190, 130, 40]));
    }
  }
  if (type === 'mining') {
    // ore glints in the rim and a discarded pick
    for (let k = 0; k < 7; k++) {
      const [x, y] = pts[Math.floor(hash2(k, 6, seed) * (pts.length - 3))];
      p.set(Math.round(x + 4), Math.round(y + 4), [220, 250, 255]); p.set(Math.round(x + 5), Math.round(y + 4), [120, 200, 240]); p.set(Math.round(x + 4), Math.round(y + 5), [90, 150, 200]);
    }
    const px = m.x - w * 0.42, py = m.y + 20;
    ink(p, [[px, py + 10], [px + 26, py - 4]], seed, { col: [120, 80, 46], thick: 2.2 });
    ink(p, [[px + 18, py - 12], [px + 26, py - 4], [px + 36, py - 2]], seed + 1, { col: [150, 150, 160], thick: 2.2 });
  }
  if (type === 'camp') {
    // soot stain above the mouth and a ring of stones
    const top = Math.min(...pts.map(([, y]) => y));
    for (let y = top - 30; y < top + 8; y++) for (let x = m.x - 26; x < m.x + 26; x++) { const d = Math.hypot((x - m.x) / 26, (y - top + 10) / 30); if (d < 1 && dither(x, y, (1 - d) * 0.6)) { const c = p.get(x, y); if (c) p.set(x, y, [c[0] * 0.5, c[1] * 0.5, c[2] * 0.55]); } }
  }
  if (type === 'event') {
    // strange glyphs scratched into the stone (they glow at runtime)
    const gx = m.x - w / 2 - 14, gy = m.y - h * 0.5;
    ink(p, [[gx, gy], [gx + 6, gy + 10], [gx, gy + 20], [gx + 8, gy + 26]], seed, { col: [60, 40, 90], thick: 1.4 });
    ink(p, [[gx + 2, gy + 34], [gx + 10, gy + 34], [gx + 6, gy + 42]], seed + 1, { col: [60, 40, 90], thick: 1.4 });
  }
}

/** Full crossroads backdrop for a set of choices: [{tunnel, type}]. */
export function crossroadsCanvas(region, pal, choices, seed) {
  const key = 'x|' + region + '|' + seed + '|' + choices.map((c) => c.tunnel + ':' + c.type).join(',');
  return memo(key, () => {
    const p = Painter.fromCanvas(cavernBase(region, pal));
    const ms = mouthLayout(choices.length, choices.some((c) => c.type === 'boss'));
    choices.forEach((c, i) => paintMouth(p, ms[i], c, pal, seed + i * 97));
    return p.toCanvas();
  });
}

/** Dark foreground rocks framing the shot (parallax layer, transparent elsewhere). */
export function foregroundCanvas(region, pal) {
  return memo('fg|' + region, () => {
    const p = new Painter(CW + 80, CH + 40);
    const rock = ramp9([shadeHex(pal.rock[0], -0.6), shadeHex(pal.rock[0], -0.5), shadeHex(pal.rock[0], -0.4), shadeHex(pal.rock[0], -0.25), pal.rock[1]], '#ff9a50', '#06121a');
    const blob = (cx, cy, rx, ry, seed) => {
      const pts = [];
      for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; const r = 1 + (fbm2(Math.cos(a) * 2 + seed, Math.sin(a) * 2, 2, seed) - 0.5) * 0.5; pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); }
      p.poly(pts, (x, y) => pick(rock, 0.3 + ((cx - x) / rx) * -0.15 + ((cy - y) / ry) * 0.25 + (hash2(x >> 1, y >> 1, seed) - 0.5) * 0.1, x, y));
      ink(p, [...pts, pts[0]], seed, { col: [6, 6, 8], thick: 2 });
      // rim light from the lamp on the inner edge
      for (const [x, y] of pts) { const ix = Math.round(x + Math.sign(CW / 2 - x)), iy = Math.round(y + 1); if (p.alpha(ix, iy)) p.set(ix, iy, [210, 140, 80]); }
    };
    blob(-10, CH + 20, 130, 90, 3); blob(110, CH + 40, 90, 50, 4);
    blob(CW + 90, CH + 10, 140, 100, 5); blob(CW - 30, CH + 40, 80, 40, 6);
    for (let k = 0; k < 5; k++) { const x = (k / 4) * (CW + 80), len = 30 + hash2(k, 1, 77) * 50; blob(x, -len * 0.3, 20 + hash2(k, 2, 77) * 30, len, 10 + k); }
    return p.toCanvas();
  });
}
void mixHex; void hexToRgb; void clamp; void inkAt; void WARM; void TEAL;
