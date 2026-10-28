// Hand-painted art for the mining chamber. The rock face is a wall of chiselled stones cut by
// wobbly cracks (no grid squares). Around it: timber shoring, lanterns, a minecart for the haul,
// a crate of tools, a chalk slate for swings, a pinned note and a little anvil.
// Light is painted per surface, Dungeon-Meshi style: warm lantern pools, rich browns,
// deep teal shadows, ink outlines that thicken on the shadow side. Every canvas is cached.
import { Painter, dither } from '../art/pixel.js';
import { materialSprite } from '../art/sprites.js';
import { hash2, fbm2, mixHex, shadeHex, hexToRgb, clamp } from '../core/math.js';
import { MATERIALS } from '../data/materials.js';
import { MINE_W, MINE_H } from '../systems/mining.js';

export const SCREEN_W = 960, SCREEN_H = 540, FLOOR_Y = 488;
export const PITCH = 52, MARGIN = 10;
export const BOARD = { x: 296, y: 34, w: MINE_W * PITCH + MARGIN * 2, h: MINE_H * PITCH + MARGIN * 2 };
export const LANTERNS = [{ x: 298, y: 74 }, { x: 702, y: 74 }];
/** Screen positions (top-left) of the interactive props. */
export const PROPS = { anvil: { x: 330, y: 432 }, crate: { x: 552, y: 430 }, cart: { x: 776, y: 418 }, slate: { x: 812, y: 44 }, note: { x: 734, y: 150 } };
const WARM = '#ffb35a', TEAL = '#10303a', INK = [22, 12, 10];
const AURA = {
  rime: '#dff8ff', sapphire: '#cfefff', ember: '#ff8a3a', magmasteel: '#ff6a2a', ruby: '#ff4a5a',
  storm: '#ffe74a', topaz: '#ffe060', venomite: '#8fe04a', emerald: '#5aff8a', cursedore: '#c86bff',
  voidcrystal: '#a05aff', glowcap: '#5af0c8', soulstone: '#5affd0',
};

const cache = new Map();
const memo = (k, f) => { let c = cache.get(k); if (!c) { c = f(); cache.set(k, c); if (cache.size > 900) cache.delete(cache.keys().next().value); } return c; };

// ------------------------------------------------------------------ light model
/** Lantern light at a screen pixel, 0..1, plus direction toward the strongest lantern. */
export function lightAt(x, y) {
  let L = 0, dx = 0, dy = -1, best = -1;
  for (const l of LANTERNS) {
    const ex = l.x - x, ey = (l.y - y) * 1.12;
    const d = Math.hypot(ex, ey);
    const v = Math.pow(Math.max(0, 1 - d / 440), 1.35);
    L += v;
    if (v > best) { best = v; const n = Math.max(1, d); dx = ex / n; dy = ey / n; }
  }
  return { L: clamp(L * 1.05, 0, 1), dx, dy };
}
/** 9-step ramp: teal shadow → base tones → warm lamp-lit highlight. */
function ramp9(base, warm = WARM, teal = TEAL) {
  return [mixHex(base[0], teal, 0.62), mixHex(base[0], teal, 0.36), base[0], base[1], base[2], base[3], base[4], mixHex(shadeHex(base[4], 0.12), warm, 0.38), mixHex(shadeHex(base[4], 0.35), warm, 0.58)].map(hexToRgb);
}
function pick(rmp, v, x, y) {
  v = clamp(v, 0, 0.9999) * (rmp.length - 1);
  const i = Math.floor(v);
  return dither(x, y, v - i) ? rmp[Math.min(i + 1, rmp.length - 1)] : rmp[i];
}
const inkAt = (L) => [Math.round(INK[0] * (0.6 + L * 0.5)), Math.round(INK[1] * (0.7 + L * 0.3)), Math.round(INK[2] + (1 - L) * 10)];

/** Wobbly hand-inked polyline: thickness swells on the shadow side. */
function ink(p, pts, seed, opts = {}) {
  const col = opts.col, thick = opts.thick ?? 1.6, sx = opts.ox || 0, sy = opts.oy || 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      const L = lightAt(x + sx, y + sy).L;
      const c = col || inkAt(L);
      p.set(x, y, c);
      const w = thick * (0.6 + hash2(x >> 2, y >> 2, seed) * 0.8) * (1.25 - L * 0.6);
      if (w > 1.1) p.set(x + 1, y, c);
      if (w > 1.5) p.set(x, y + 1, c);
      if (w > 2.1) p.set(x + 1, y + 1, c);
    }
  }
}
/** Subdivide a segment into a wobbling line (shared between neighbours: deterministic per seed). */
function wobble(a, b, seed, amp = 2.4, step = 7) {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const o = k === 0 || k === n ? 0 : (hash2(k, seed, 77) - 0.5) * 2 * amp * Math.sin(t * Math.PI) ** 0.5;
    out.push([a[0] + (b[0] - a[0]) * t + (nx / nl) * o, a[1] + (b[1] - a[1]) * t + (ny / nl) * o]);
  }
  return out;
}

// ------------------------------------------------------------------ rock face geometry
/** Irregular stones: jittered corner lattice, wobbly shared edges, per-pixel edge distance. */
export function rockFace(seed) {
  return memo('geom|' + seed, () => {
    const C = [];
    for (let j = 0; j <= MINE_H; j++) {
      C.push([]);
      for (let i = 0; i <= MINE_W; i++) {
        const inner = i > 0 && j > 0 && i < MINE_W && j < MINE_H;
        const J = inner ? 15 : 4;
        C[j].push([MARGIN + i * PITCH + (hash2(i, j, seed) - 0.5) * 2 * J, MARGIN + j * PITCH + (hash2(j, i, seed + 1) - 0.5) * 2 * J]);
      }
    }
    const H = {}, V = {};
    for (let j = 0; j <= MINE_H; j++) for (let i = 0; i < MINE_W; i++) H[i + ',' + j] = wobble(C[j][i], C[j][i + 1], seed * 31 + i * 7 + j * 131, 4.2, 6);
    for (let j = 0; j < MINE_H; j++) for (let i = 0; i <= MINE_W; i++) V[i + ',' + j] = wobble(C[j][i], C[j + 1][i], seed * 37 + i * 11 + j * 173, 4.2, 6);
    const cells = [];
    for (let y = 0; y < MINE_H; y++) {
      cells.push([]);
      for (let x = 0; x < MINE_W; x++) {
        const pts = [...H[x + ',' + y], ...V[(x + 1) + ',' + y].slice(1), ...[...H[x + ',' + (y + 1)]].reverse().slice(1), ...[...V[x + ',' + y]].reverse().slice(1, -1)];
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, cx = 0, cy = 0;
        for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); cx += px; cy += py; }
        cx /= pts.length; cy /= pts.length;
        const bx = Math.floor(x0) - 1, by = Math.floor(y0) - 1, bw = Math.ceil(x1) - bx + 2, bh = Math.ceil(y1) - by + 2;
        // per-pixel inside mask, distance to edge and outward normal of the nearest edge
        const dist = new Float32Array(bw * bh).fill(-1), nx = new Float32Array(bw * bh), ny = new Float32Array(bw * bh);
        const segs = pts.map((a, k) => [a, pts[(k + 1) % pts.length]]);
        for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
          const px = bx + xx + 0.5, py = by + yy + 0.5;
          let inside = false, best = 1e9, bnx = 0, bny = 0;
          for (const [[ax, ay], [qx, qy]] of segs) {
            if ((ay > py) !== (qy > py) && px < ax + ((py - ay) / (qy - ay)) * (qx - ax)) inside = !inside;
            const ex = qx - ax, ey = qy - ay, l2 = ex * ex + ey * ey || 1;
            const t = clamp(((px - ax) * ex + (py - ay) * ey) / l2, 0, 1);
            const dx = px - (ax + ex * t), dy = py - (ay + ey * t);
            const d = dx * dx + dy * dy;
            if (d < best) { best = d; bnx = -dx; bny = -dy; }
          }
          if (!inside) continue;
          const d = Math.sqrt(best), k = yy * bw + xx;
          dist[k] = d; nx[k] = bnx / (d || 1); ny[k] = bny / (d || 1);
        }
        let maxD = 1;
        for (let k = 0; k < dist.length; k++) if (dist[k] > maxD) maxD = dist[k];
        // a few chisel facets per stone
        const facets = [];
        const nf = 3 + Math.floor(hash2(x, y, seed + 5) * 3);
        for (let f = 0; f < nf; f++) facets.push({ x: x0 + (x1 - x0) * (0.15 + hash2(f, x * 9 + y, seed + 6) * 0.7), y: y0 + (y1 - y0) * (0.15 + hash2(f, y * 9 + x, seed + 7) * 0.7), tx: hash2(f, 1, seed + x * 3 + y) - 0.5, ty: hash2(f, 2, seed + x + y * 3) - 0.5 });
        cells[y].push({ pts, bx, by, bw, bh, cx, cy, dist, nx, ny, facets, maxD });
      }
    }
    return { cells, seed };
  });
}
/** Point-in-stone lookup for hover/click (board-local coordinates). */
export function cellAt(geom, lx, ly) {
  const gx = Math.floor((lx - MARGIN) / PITCH), gy = Math.floor((ly - MARGIN) / PITCH);
  for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) {
    const c = geom.cells[y] && geom.cells[y][x];
    if (!c) continue;
    const xx = Math.floor(lx) - c.bx, yy = Math.floor(ly) - c.by;
    if (xx >= 0 && yy >= 0 && xx < c.bw && yy < c.bh && c.dist[yy * c.bw + xx] >= 0) return { x, y };
  }
  return null;
}

function rockRamp(pal, hard) {
  const r = pal.rock;
  return hard ? ramp9([shadeHex(r[0], -0.3), r[0], r[1], mixHex(r[2], '#5a6478', 0.25), mixHex(r[3], '#8a96aa', 0.25)], '#ffc890', '#0c2430')
    : ramp9([r[1], r[2], r[3], r[4], shadeHex(r[4], 0.22)]);
}

/** A stone of the rock face (canvas covers the cell bbox). flags: {exposed, dim, flare, hover} */
export function stoneCanvas(geom, tile, pal, flags = {}) {
  const key = ['s', geom.seed, tile.x, tile.y, tile.t, tile.mat, tile.hits, tile.crack, JSON.stringify(tile.veins), tile.glint, tile.revealed, tile.marked, pal.rock[2], flags.exposed ? 1 : 0, flags.dim ? 1 : 0, flags.flare ? 1 : 0, flags.hover ? 1 : 0].join('|');
  return memo(key, () => {
    const c = geom.cells[tile.y][tile.x];
    const p = new Painter(c.bw, c.bh);
    const hard = tile.t === 'hard';
    const rmp = rockRamp(pal, hard);
    const s = geom.seed * 7 + tile.x * 31 + tile.y * 17;
    const ox = BOARD.x + c.bx, oy = BOARD.y + c.by;
    const dim = flags.dim ? 0.13 : 0;
    for (let yy = 0; yy < c.bh; yy++) for (let xx = 0; xx < c.bw; xx++) {
      const k = yy * c.bw + xx, d = c.dist[k];
      if (d < 0) continue;
      const gx = c.bx + xx, gy = c.by + yy;
      const { L, dx, dy } = lightAt(ox + xx, oy + yy);
      if (d < 1.15) { p.set(xx, yy, inkAt(L)); continue; }
      // nearest facet → flat chisel plane
      let bf = c.facets[0], bd = 1e9;
      for (const f of c.facets) { const e = (gx - f.x) ** 2 + (gy - f.y) ** 2; if (e < bd) { bd = e; bf = f; } }
      let v = 0.42 + (bf.tx * dx + bf.ty * dy) * 0.32 + Math.sqrt(d / c.maxD) * 0.16;
      // bevel toward the cracks: rims facing the lamp catch light, the rest falls into shadow
      if (d < 6) { const b = 1 - d / 6; v += (c.nx[k] * dx + c.ny[k] * dy) * b * 0.55 - b * 0.08; }
      v += (fbm2(gx * 0.09, gy * 0.09, 2, s) - 0.5) * 0.3 + (fbm2(gx * 0.025, gy * 0.03, 2, 9) - 0.5) * 0.25 + (hash2(gx, gy, s) - 0.5) * 0.1;
      if (hard) v += Math.sin((gx + gy * 0.4) * 0.35 + fbm2(gx * 0.05, gy * 0.05, 2, s) * 6) * 0.05;
      v = v * 0.62 + Math.min(L, 0.8) * 0.5 - 0.12 - dim + (flags.hover ? 0.1 : 0);
      p.set(xx, yy, pick(rmp, v, gx, gy));
    }
    const inside = (x, y) => { const k = y * c.bw + x; return x >= 0 && y >= 0 && x < c.bw && y < c.bh && c.dist[k] > 1.6; };
    const lcx = c.cx - c.bx, lcy = c.cy - c.by;
    // pits and grit
    for (let k = 0; k < 16; k++) {
      const x = Math.floor(hash2(k, 5, s) * c.bw), y = Math.floor(hash2(k, 6, s) * c.bh);
      if (!inside(x, y) || !inside(x + 1, y + 1)) continue;
      if (k % 3 === 0) { p.set(x, y, rmp[1]); p.set(x + 1, y, rmp[2]); p.set(x + 1, y + 1, rmp[6]); } // chip
      else p.set(x, y, k % 2 ? rmp[2] : rmp[6]); // grit
    }
    // short chisel scratches catching the lamp
    for (let k = 0; k < 3; k++) {
      const x = c.bw * (0.2 + hash2(k, 15, s) * 0.6), y = c.bh * (0.2 + hash2(k, 16, s) * 0.6), a = hash2(k, 17, s) * Math.PI;
      for (let t = -3; t <= 3; t++) { const xx = Math.round(x + Math.cos(a) * t), yy = Math.round(y + Math.sin(a) * t); if (inside(xx, yy)) p.set(xx, yy, t < 0 ? rmp[2] : rmp[6]); }
    }
    if (hard) {
      // pale quartz seams: hard rock reads at a glance
      for (let q = 0; q < 2; q++) {
        const pts = [];
        let x = c.bw * (0.2 + hash2(q, 11, s) * 0.6), y = 3;
        while (y < c.bh - 3) { pts.push([x, y]); y += 4; x += (hash2(Math.round(y), q, s) - 0.5) * 6; }
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          for (let t = 0; t <= 4; t++) { const xx = Math.round(x0 + (x1 - x0) * t / 4), yy = Math.round(y0 + (y1 - y0) * t / 4); if (inside(xx, yy)) { p.set(xx, yy, '#d8e2ea'); if (inside(xx + 1, yy)) p.set(xx + 1, yy, rmp[3]); } }
        }
      }
    }
    if (tile.hits) {
      // a big fresh fracture across the stone
      const pts = [];
      let y = c.bh * (0.35 + hash2(3, 4, s) * 0.3);
      for (let x = 2; x < c.bw - 2; x += 3) { pts.push([x, y]); y += (hash2(x, 7, s) - 0.5) * 7; }
      for (const [x, y2] of pts) { const yy = Math.round(y2); if (inside(x, yy - 1)) p.set(x, yy - 1, rmp[8]); }
      ink(p, pts, s, { thick: 2.6, ox, oy });
    }
    // mineral veins point toward hidden ore
    for (const [dir, col] of Object.entries(tile.veins || {})) {
      const [tx, ty] = dir === 'up' ? [lcx, 0] : dir === 'down' ? [lcx, c.bh] : dir === 'left' ? [0, lcy] : [c.bw, lcy];
      const hi = hexToRgb(shadeHex(col, 0.55)), mid = hexToRgb(col), lo = hexToRgb(shadeHex(col, -0.45));
      for (let strand = 0; strand < 1 + (hash2(9, 9, s) > 0.6 ? 1 : 0); strand++) {
        let x = lcx + (hash2(strand, 31, s) - 0.5) * 12, y = lcy + (hash2(strand, 32, s) - 0.5) * 12;
        for (let i = 0; i < 60; i++) {
          const ddx = tx - x, ddy = ty - y, dl = Math.hypot(ddx, ddy);
          if (dl < 3) break;
          x += ddx / dl + (hash2(i, strand, s) - 0.5) * 1.3; y += ddy / dl + (hash2(strand, i, s) - 0.5) * 1.3;
          const xx = Math.round(x), yy = Math.round(y);
          if (!inside(xx, yy) || hash2(i, strand, s + 3) < 0.28) continue;
          p.set(xx, yy, i % 6 === 0 ? hi : mid);
          if (strand === 0 && inside(xx + 1, yy + 1)) p.set(xx + 1, yy + 1, lo);
          if (i % 9 === 4 && inside(xx - 1, yy - 1)) { p.set(xx - 1, yy - 1, hi); p.set(xx, yy - 1, mid); }
        }
      }
    }
    // hazard warning: rust-red hairline fractures
    if (tile.crack) for (let q = 0; q < 2; q++) {
      const pts = [];
      let x = c.bw * (0.25 + hash2(q, 41, s) * 0.5), y = c.bh * (0.2 + hash2(q, 42, s) * 0.2);
      for (let i = 0; i < 9; i++) { pts.push([x, y]); x += (hash2(i, q, s) - 0.5) * 9; y += 2.5 + hash2(q, i, s) * 2; }
      ink(p, pts, s + q, { col: [120, 28, 22], thick: 1 });
      for (const [px, py] of pts) if (inside(Math.round(px) + 1, Math.round(py))) p.set(Math.round(px) + 1, Math.round(py), [214, 84, 58]);
    }
    if (tile.t === 'ore' && AURA[tile.mat]) {
      const a = hexToRgb(AURA[tile.mat]);
      for (let yy = 0; yy < c.bh; yy++) for (let xx = 0; xx < c.bw; xx++) { const d = c.dist[yy * c.bw + xx]; if (d > 3 && hash2(xx, yy, s) > 0.988) p.set(xx, yy, a); }
    }
    if ((tile.revealed || flags.flare) && tile.t === 'hazard') {
      const pts = [];
      for (let k = 0; k < 8; k++) pts.push([lcx - 14 + k * 4, lcy + (k % 2 ? 4 : -4)]);
      ink(p, pts, s, { col: [255, 93, 93], thick: 2 });
    }
    if ((tile.revealed || flags.exposed) && tile.t === 'ore' && MATERIALS[tile.mat]) {
      // the ore bulges out of a chipped socket
      const r = 15;
      const sock = [];
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const rr = r * (0.8 + hash2(k, 81, s) * 0.35); sock.push([lcx + Math.cos(a) * rr, lcy + Math.sin(a) * rr * 0.9]); }
      p.poly(sock, (x, y) => (inside(x, y) ? (y < lcy - 4 ? [20, 14, 12] : [34, 24, 20]) : null));
      ink(p, [...sock, sock[0]], s, { thick: 1.2, ox, oy });
      const spr = Painter.fromCanvas(materialSprite(tile.mat, 32));
      const sx0 = Math.round(lcx - 16), sy0 = Math.round(lcy - 16);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const col = spr.get(x, y);
        if (!col || col[3] < 128 || !inside(sx0 + x, sy0 + y)) continue;
        if (tile.revealed && !flags.exposed && !dither(x, y, 0.6)) continue;
        p.set(sx0 + x, sy0 + y, [col[0], col[1], col[2]]);
      }
      // rock lip over the bottom of the ore
      for (let k = 0; k < 12; k++) { const a = 0.4 + (k / 11) * 2.3; const x = Math.round(lcx + Math.cos(a) * r * 0.95), y = Math.round(lcy + Math.sin(a) * r * 0.82); if (inside(x, y)) { p.set(x, y, rmp[5]); if (inside(x, y + 1)) p.set(x, y + 1, rmp[3]); } }
    }
    if (tile.glint) for (let k = 0; k < 1 + tile.glint; k++) {
      const x = Math.round(lcx + (hash2(k, 61, s) - 0.5) * c.bw * 0.6), y = Math.round(lcy + (hash2(k, 62, s) - 0.5) * c.bh * 0.6);
      if (!inside(x, y)) continue;
      const big = k === 0 && tile.glint >= 3;
      p.set(x, y, '#ffffff');
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { p.set(x + ddx, y + ddy, '#fff2b0'); if (big) p.set(x + ddx * 2, y + ddy * 2, '#ffd27a'); }
    }
    if (tile.marked) {
      // chalk ring scrawled by the radar
      const pts = [];
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2.1; pts.push([lcx + Math.cos(a) * (17 + hash2(k, 3, s) * 2), lcy + Math.sin(a) * (15 + hash2(k, 4, s) * 2)]); }
      ink(p, pts, s, { col: [190, 255, 200], thick: 1.4 });
    }
    return p.toCanvas();
  });
}

/** The hollow left behind a broken stone: recessed, inner shadow from the lit rim. */
export function cavityCanvas(geom, x, y, pal) {
  return memo('cav|' + geom.seed + '|' + x + ',' + y + pal.rock[0], () => {
    const c = geom.cells[y][x];
    const p = new Painter(c.bw, c.bh);
    const back = ramp9([shadeHex(pal.rock[0], -0.55), shadeHex(pal.rock[0], -0.45), shadeHex(pal.rock[0], -0.3), shadeHex(pal.rock[0], -0.15), pal.rock[0]], '#a8603a', '#06141a');
    const s = geom.seed + x * 13 + y * 7;
    for (let yy = 0; yy < c.bh; yy++) for (let xx = 0; xx < c.bw; xx++) {
      const k = yy * c.bw + xx, d = c.dist[k];
      if (d < 0) continue;
      const { L, dx, dy } = lightAt(BOARD.x + c.bx + xx, BOARD.y + c.by + yy);
      // walls of the hole: the side facing away from the lamp is lit (we see its inner face)
      let v = 0.18 + fbm2((c.bx + xx) * 0.12, (c.by + yy) * 0.12, 2, s) * 0.25;
      if (d < 7) { const b = 1 - d / 7; v += -(c.nx[k] * dx + c.ny[k] * dy) * b * 0.55 + b * 0.05; }
      v = v * 0.7 + L * 0.3 - 0.05;
      p.set(xx, yy, pick(back, v, c.bx + xx, c.by + yy));
    }
    for (let k = 0; k < 6; k++) { const xx = Math.floor(hash2(k, 9, s) * c.bw), yy = Math.floor(c.bh * 0.55 + hash2(k, 8, s) * c.bh * 0.4); const d = c.dist[yy * c.bw + xx]; if (d > 3) { p.set(xx, yy, back[4]); p.set(xx + 1, yy, back[2]); } }
    return p.toCanvas();
  });
}

/** Soft dark rim around the whole rock face so it sits recessed in the wall. */
export function faceRim(geom) {
  return memo('rim|' + geom.seed, () => {
    const p = new Painter(BOARD.w + 16, BOARD.h + 16);
    const inside = (x, y) => {
      const lx = x - 8, ly = y - 8;
      if (lx < 0 || ly < 0 || lx >= BOARD.w || ly >= BOARD.h) return false;
      return !!cellAt(geom, lx, ly);
    };
    const mask = new Uint8Array(p.w * p.h);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) mask[y * p.w + x] = inside(x, y) ? 1 : 0;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (mask[y * p.w + x]) continue;
      let near = 99;
      for (let r = 1; r <= 7 && near === 99; r++) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const xx = Math.round(x + Math.cos(a) * r), yy = Math.round(y + Math.sin(a) * r); if (xx >= 0 && yy >= 0 && xx < p.w && yy < p.h && mask[yy * p.w + xx]) { near = r; break; } }
      if (near <= 2) p.set(x, y, [16, 10, 9]);
      else if (near < 99 && dither(x, y, 1 - (near - 2) / 6)) p.set(x, y, [12, 18, 22], 170);
    }
    return p.toCanvas();
  });
}

/** Rock chunk sprite for 2D debris and rubble (irregular, lit from above). */
export function chunkCanvas(col, seed, size = 6) {
  return memo('c|' + col + seed + size, () => {
    const p = new Painter(size + 3, size + 3);
    const pts = [];
    const n = 5 + (seed % 3);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + hash2(k, seed, 2) * 0.6; const r = (size / 2) * (0.65 + hash2(k, seed, 3) * 0.45); pts.push([1.5 + size / 2 + Math.cos(a) * r, 1.5 + size / 2 + Math.sin(a) * r * 0.85]); }
    const hi = hexToRgb(mixHex(shadeHex(col, 0.3), WARM, 0.25)), mid = hexToRgb(col), lo = hexToRgb(mixHex(shadeHex(col, -0.3), TEAL, 0.3));
    p.poly(pts, (x, y) => (y < size * 0.45 ? (x < size * 0.6 ? hi : mid) : x > size * 0.5 ? lo : mid));
    p.outline('#160c0a');
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ the chamber backdrop
function siteGrid(cw, ch, seed) {
  const m = new Map();
  return (i, j) => { const k = i * 4096 + j; let v = m.get(k); if (!v) { v = [i * cw + hash2(i, j, seed) * cw, j * ch + hash2(j, i, seed + 1) * ch, hash2(i, j, seed + 2) - 0.5, hash2(j, i, seed + 3) - 0.5, k]; m.set(k, v); } return v; };
}
function nearest2(site, cw, ch, x, y, sx = 1) {
  const gi = Math.floor(x / cw), gj = Math.floor(y / ch);
  let d1 = 1e9, d2 = 1e9, s1 = null, s2 = null;
  for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
    const s = site(i, j);
    const d = Math.hypot((x - s[0]) * sx, y - s[1]);
    if (d < d1) { d2 = d1; s2 = s1; d1 = d; s1 = s; } else if (d < d2) { d2 = d; s2 = s; }
  }
  return { d1, d2, s1, s2 };
}
/** Organic cave rock: domain-warped boulders, partial secondary cracks, sediment bands, damp streaks. */
function caveRock(p, x0, y0, w, h, pal, seed, opts = {}) {
  const rmp = ramp9(pal.rock);
  const BW = 128, BH = 92, SW = 44, SH = 30;
  const big = siteGrid(BW, BH, seed), small = siteGrid(SW, SH, seed + 50);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const wx = x + (fbm2(x * 0.011, y * 0.013, 3, seed + 20) - 0.5) * 70;
    const wy = y + (fbm2(x * 0.013 + 7, y * 0.011, 3, seed + 21) - 0.5) * 46;
    const B = nearest2(big, BW, BH, wx, wy, 0.8), S = nearest2(small, SW, SH, wx, wy);
    const eB = (B.d2 - B.d1) * 0.5, eS = (S.d2 - S.d1) * 0.5;
    const { L, dx, dy } = lightAt(x, y);
    if (eB < 0.75 + hash2(x >> 3, y >> 3, seed) * 0.6) { p.set(x, y, inkAt(L * 0.9 + 0.15)); continue; }
    const pairOn = hash2(Math.min(S.s1[4], S.s2[4]), Math.max(S.s1[4], S.s2[4]), seed) > 0.58;
    const strata = fbm2(x * 0.003 + y * 0.01, y * 0.024, 3, seed + 9) - 0.5;
    let v = 0.42 + (B.s1[2] * dx + B.s1[3] * dy) * 0.36 + (S.s1[2] * dx + S.s1[3] * dy) * 0.1 + strata * 0.34;
    if (eB < 9) { const b = 1 - eB / 9; const nx = (wx - B.s1[0]) / (B.d1 || 1), ny = (wy - B.s1[1]) / (B.d1 || 1); v += (nx * dx + ny * dy) * b * 0.5 - b * 0.12; }
    if (pairOn && eS < 0.8) v -= 0.3;
    else if (pairOn && eS < 2.2) v += (eS < 1.5 ? 0.12 : 0) * (dy < 0 ? 1 : -1);
    v += (fbm2(x * 0.09, y * 0.09, 2, seed) - 0.5) * 0.16 + (hash2(x, y, seed) - 0.5) * 0.05;
    // damp streaks running down from cracks
    const streak = fbm2(x * 0.18, y * 0.006, 2, seed + 30);
    if (streak > 0.7) v -= (streak - 0.7) * 0.8;
    v = v * 0.5 + L * 0.74 - 0.2 + (opts.bias || 0);
    p.set(x, y, pick(rmp, v, x, y));
  }
}

function plank(p, pts, seed, horiz = false) {
  // a hewn timber: wobbly edges, grain, knots, chipped ends, lit side warmer
  const rmp = ramp9(['#2a160c', '#45281a', '#64402a', '#86593a', '#a87650'], '#ffc070', '#14262a');
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const mask = new Painter(Math.ceil(x1 - x0) + 2, Math.ceil(y1 - y0) + 2);
  mask.poly(pts.map(([x, y]) => [x - x0 + 1, y - y0 + 1]), '#ffffff');
  const across = horiz ? y1 - y0 : x1 - x0;
  for (let yy = 0; yy < mask.h; yy++) for (let xx = 0; xx < mask.w; xx++) {
    if (!mask.alpha(xx, yy)) continue;
    const x = Math.round(x0 + xx - 1), y = Math.round(y0 + yy - 1);
    const { L, dx, dy } = lightAt(x, y);
    const a = horiz ? (y - y0) / across : (x - x0) / across; // 0..1 across the beam
    const along = horiz ? x : y;
    const roundness = Math.cos((a - 0.5) * Math.PI) * 0.35;
    const side = (horiz ? -dy : -dx) * (a - 0.5) * -0.5;
    const grain = Math.sin(along * 0.05 + a * 9 + Math.sin(along * 0.013 + seed) * 3) * 0.08 + (hash2(Math.floor(along / 3), Math.floor(a * 14), seed) - 0.5) * 0.12;
    let v = 0.3 + roundness + side + grain;
    v = v * 0.55 + L * 0.6 - 0.12;
    p.set(x, y, pick(rmp, v, x, y));
  }
  // grain lines
  for (let g = 0; g < 4; g++) {
    const a = 0.2 + g * 0.2 + (hash2(g, 3, seed) - 0.5) * 0.1;
    const line = [];
    for (let t = horiz ? x0 + 4 : y0 + 4; t < (horiz ? x1 - 4 : y1 - 4); t += 6) {
      const off = Math.sin(t * 0.04 + g + seed) * 1.5;
      line.push(horiz ? [t, y0 + a * across + off] : [x0 + a * across + off, t]);
    }
    for (let i = 0; i + 1 < line.length; i++) if (hash2(i, g, seed) > 0.25) ink(p, [line[i], line[i + 1]], seed + g, { col: [52, 28, 16], thick: 0.5 });
  }
  // knots
  for (let k = 0; k < 2; k++) {
    const t = hash2(k, 5, seed);
    const kx = horiz ? x0 + 10 + t * (x1 - x0 - 20) : x0 + across * (0.3 + hash2(k, 6, seed) * 0.4);
    const ky = horiz ? y0 + across * (0.3 + hash2(k, 6, seed) * 0.4) : y0 + 10 + t * (y1 - y0 - 20);
    p.ellipse(kx, ky, 2.5, 2, [46, 24, 14]);
    p.set(Math.round(kx) - 1, Math.round(ky) - 1, [150, 100, 64]);
  }
  ink(p, [...pts, pts[0]], seed, { thick: 1.8 });
}
function nail(p, x, y) { p.set(x, y, [210, 214, 220]); p.set(x + 1, y, [120, 124, 132]); p.set(x, y + 1, [90, 92, 100]); p.set(x + 1, y + 1, [40, 40, 46]); }

function crystal(p, x, y, h, col, seed) {
  const n = 3 + (seed % 3);
  for (let k = 0; k < n; k++) {
    const lean = (hash2(k, seed, 1) - 0.5) * 0.9, hh = h * (0.5 + hash2(k, seed, 2) * 0.6), w = 3 + hash2(k, seed, 3) * 4;
    const bx = x + (k - n / 2) * 4;
    const tip = [bx + lean * hh, y - hh];
    const pts = [[bx - w, y], [bx - w * 0.8 + lean * hh * 0.7, y - hh * 0.75], tip, [bx + w * 0.8 + lean * hh * 0.7, y - hh * 0.75], [bx + w, y]];
    const hi = hexToRgb(shadeHex(col, 0.45)), mid = hexToRgb(col), lo = hexToRgb(mixHex(shadeHex(col, -0.4), TEAL, 0.3));
    p.poly(pts, (px) => (px < bx - 1 + lean * 6 ? hi : px < bx + 2 + lean * 6 ? mid : lo));
    ink(p, [...pts], seed + k, { thick: 1.2 });
    p.set(Math.round(tip[0]), Math.round(tip[1]) + 2, '#ffffff');
  }
}
function mushroom(p, x, y, h, col, seed) {
  const stem = [[x - 2, y], [x - 1.5, y - h], [x + 1.5, y - h], [x + 2, y]];
  p.poly(stem, (px) => (px < x ? [226, 214, 190] : [160, 146, 128]));
  ink(p, [...stem], seed, { thick: 1 });
  const r = h * 0.75;
  p.ellipse(x, y - h, r, r * 0.55, (px, py, nx, ny) => (ny > 0.3 ? null : ny < -0.4 ? hexToRgb(shadeHex(col, 0.4)) : nx > 0.4 ? hexToRgb(shadeHex(col, -0.3)) : hexToRgb(col)));
  for (let k = 0; k < 3; k++) p.set(Math.round(x - r * 0.5 + k * r * 0.5), Math.round(y - h - r * 0.25), '#fff6e0');
}

function barrel(p, x, y, w, h, seed) {
  // staves bulge at the middle; iron hoops; lid rim catches the lamp
  const wood = ramp9(['#2a160c', '#45281a', '#64402a', '#86593a', '#a87650'], '#ffc070', '#14262a');
  const iron = ramp9(['#16141a', '#24222a', '#3a3842', '#5a5866', '#86849a'], '#ffc890', '#0c2028');
  for (let yy = 0; yy < h; yy++) {
    const t = yy / h, half = (w / 2) * (0.86 + Math.sin(t * Math.PI) * 0.14);
    for (let xx = -Math.round(half); xx <= Math.round(half); xx++) {
      const X = x + w / 2 + xx, Y = y + yy;
      const a = xx / half;
      const { L } = lightAt(X, Y);
      const hoop = Math.abs(t - 0.2) < 0.05 || Math.abs(t - 0.8) < 0.05;
      const stave = Math.abs(((xx + half) % 9) - 0) < 1;
      const v = 0.45 - a * 0.35 + (hoop ? 0.1 : 0) + (hash2(Math.floor((xx + half) / 9), yy >> 2, seed) - 0.5) * 0.12;
      p.set(X, Y, hoop ? pick(iron, v * 0.5 + L * 0.6, X, Y) : stave ? wood[1] : pick(wood, v * 0.5 + L * 0.6 - 0.05, X, Y));
    }
  }
  p.ellipse(x + w / 2, y + 1, w / 2 * 0.86, 3.5, (X, Y, nx, ny) => (Math.hypot(nx, ny) > 0.72 ? wood[6] : wood[2]));
  const out = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12; out.push([x + w / 2 - (w / 2) * (0.86 + Math.sin(t * Math.PI) * 0.14), y + t * h]); }
  for (let k = 12; k >= 0; k--) { const t = k / 12; out.push([x + w / 2 + (w / 2) * (0.86 + Math.sin(t * Math.PI) * 0.14), y + t * h]); }
  ink(p, out, seed, { thick: 1.8 });
}
function ropeCoil(p, cx, cy, seed) {
  const rope = ramp9(['#3a2412', '#5a3a1e', '#7a5a30', '#a07a44', '#c8a060'], '#ffd890', '#1a2a2a');
  for (let r = 0; r < 4; r++) {
    const rx = 12 - r * 1.6, ry = 16 - r * 2;
    for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const x = Math.round(cx + Math.cos(a) * rx + r), y = Math.round(cy + Math.sin(a) * ry + r * 0.5);
      const twist = Math.sin(a * 22 + r) > 0.2;
      const { L } = lightAt(x, y);
      p.set(x, y, pick(rope, (twist ? 0.62 : 0.32) - Math.cos(a) * 0.15 + L * 0.3, x, y));
      p.set(x + 1, y, pick(rope, 0.25 + L * 0.3, x, y));
    }
  }
  ink(p, [[cx + 2, cy + 14], [cx + 4, cy + 26], [cx + 1, cy + 34]], seed, { col: [122, 90, 48], thick: 1.6 });
}
function bucket(p, x, y, seed) {
  const wood = ramp9(['#2a160c', '#45281a', '#64402a', '#86593a', '#a87650'], '#ffc070', '#14262a');
  const pts = [[x, y], [x + 26, y], [x + 23, y + 26], [x + 3, y + 26]];
  p.poly(pts, (X, Y) => { const { L } = lightAt(X, Y); return (Y - y) % 9 === 4 ? [70, 66, 72] : pick(wood, 0.5 - (X - x) / 40 + L * 0.5, X, Y); });
  p.ellipse(x + 13, y + 1, 13, 3, (X, Y, nx, ny) => (Math.hypot(nx, ny) > 0.7 ? wood[6] : [40, 70, 84]));
  ink(p, [...pts, pts[0]], seed, { thick: 1.4 });
  ink(p, [[x + 1, y], [x + 13, y - 14], [x + 25, y]], seed + 1, { col: [90, 90, 98], thick: 0.8 });
}
function sack(p, x, y, seed) {
  const cloth = ramp9(['#3a2c1c', '#5a4630', '#7a6444', '#9a825a', '#bca476'], '#ffd890', '#1a2a2a');
  const pts = [[x + 4, y + 40], [x - 2, y + 22], [x + 6, y + 8], [x + 10, y], [x + 18, y + 2], [x + 20, y + 10], [x + 30, y + 22], [x + 26, y + 40]];
  p.poly(pts, (X, Y) => { const { L } = lightAt(X, Y); return pick(cloth, 0.45 - (X - x - 12) / 40 + Math.sin(Y * 0.5 + X * 0.2) * 0.05 + L * 0.5, X, Y); });
  for (let k = 0; k < 4; k++) ink(p, [[x + 6 + k * 5, y + 16], [x + 4 + k * 6, y + 36]], seed + k, { col: [70, 54, 34], thick: 0.6 });
  ink(p, [[x + 7, y + 8], [x + 20, y + 9]], seed + 9, { col: [140, 100, 60], thick: 1.5 });
  ink(p, [...pts, pts[0]], seed, { thick: 1.6 });
}

/** Static painted chamber (rock walls, shoring, floor, rails, regional decor). */
export function chamberCanvas(region, pal) {
  return memo('chamber|' + region, () => {
    const W = SCREEN_W, H = SCREEN_H;
    const p = new Painter(W, H);
    const seed = 41 + region * 13;
    caveRock(p, 0, 0, W, FLOOR_Y + 4, pal, seed);
    // darker recess where the rock face is being worked
    for (let y = BOARD.y - 14; y < BOARD.y + BOARD.h + 10; y++) for (let x = BOARD.x - 14; x < BOARD.x + BOARD.w + 14; x++) {
      const ex = Math.min(x - (BOARD.x - 14), BOARD.x + BOARD.w + 14 - x), ey = Math.min(y - (BOARD.y - 14), BOARD.y + BOARD.h + 10 - y);
      const e = Math.min(ex, ey) + fbm2(x * 0.1, y * 0.1, 2, 3) * 8;
      if (e > 4 && dither(x, y, clamp((e - 4) / 12, 0, 0.55))) { const c = p.get(x, y); if (c) p.set(x, y, [c[0] * 0.62, c[1] * 0.66, c[2] * 0.72]); }
    }
    // floor: packed dirt with pebbles, lit in pools
    const dirt = ramp9([shadeHex(pal.dirt[0], -0.2), pal.dirt[0], pal.dirt[1], pal.dirt[2], shadeHex(pal.dirt[2], 0.25)]);
    const edge = [];
    for (let x = 0; x <= W; x += 8) edge.push([x, FLOOR_Y + Math.sin(x * 0.03 + seed) * 2 + (hash2(x, 1, seed) - 0.5) * 3]);
    for (let x = 0; x < W; x++) {
      const e = edge[Math.min(edge.length - 1, Math.floor(x / 8))][1];
      for (let y = Math.floor(e); y < H; y++) {
        const { L } = lightAt(x, y - 40);
        const v = 0.55 - (y - e) * 0.004 + (fbm2(x * 0.05, y * 0.12, 2, seed + 4) - 0.5) * 0.3;
        p.set(x, y, pick(dirt, v * 0.5 + L * 0.6 - 0.1, x, y));
      }
    }
    ink(p, edge, seed, { thick: 2 });
    for (let k = 0; k < 140; k++) {
      const x = hash2(k, 7, seed) * W, y = FLOOR_Y + 6 + hash2(k, 8, seed) * (H - FLOOR_Y - 8);
      const r = 1.5 + hash2(k, 9, seed) * 3.5;
      const { L } = lightAt(x, y - 40);
      const pts = [];
      for (let q = 0; q < 6; q++) { const a = (q / 6) * Math.PI * 2; pts.push([x + Math.cos(a) * r * (0.7 + hash2(q, k, 3) * 0.5), y + Math.sin(a) * r * 0.6]); }
      p.poly(pts, (px, py) => pick(dirt, (py < y ? 0.75 : 0.35) * 0.5 + L * 0.6, px, py));
      if (r > 3) ink(p, pts, k, { thick: 0.8 });
    }
    // rails for the minecart (side view): sleepers, then the rail with a lamp-lit top edge
    for (let x = 724; x < W; x += 17) {
      const pts = [[x, 504], [x + 11, 503], [x + 12, 510], [x - 1, 511]];
      plank(p, pts, x, true);
    }
    for (let x = 712; x < W; x++) {
      const { L } = lightAt(x, 470);
      p.set(x, 500, L > 0.3 ? [240, 214, 170] : [150, 160, 170]);
      p.set(x, 501, [110, 112, 120]); p.set(x, 502, [70, 70, 78]); p.set(x, 503, [30, 26, 30]);
    }
    // timber shoring: two posts, a crossbeam and corner braces
    const postL = BOARD.x - 26, postR = BOARD.x + BOARD.w + 8;
    plank(p, [[postL, 18], [postL + 17, 20], [postL + 18, FLOOR_Y + 6], [postL - 1, FLOOR_Y + 5]], seed + 1);
    plank(p, [[postR, 20], [postR + 18, 18], [postR + 19, FLOOR_Y + 5], [postR, FLOOR_Y + 6]], seed + 2);
    plank(p, [[postL - 22, 10], [postR + 40, 7], [postR + 41, 27], [postL - 21, 30]], seed + 3, true);
    plank(p, [[postL + 16, 28], [postL + 52, 28], [postL + 18, 64]], seed + 4);
    plank(p, [[postR + 2, 28], [postR - 34, 28], [postR + 1, 64]], seed + 5);
    for (const [x, y] of [[postL + 4, 16], [postL + 12, 17], [postR + 5, 15], [postR + 13, 14], [postL + 6, 120], [postR + 8, 300], [postL + 9, 340], [postR + 6, 150]]) nail(p, x, y);
    // lantern hooks
    for (const l of LANTERNS) { p.rect(l.x, 26, 2, l.y - 40, [40, 30, 26]); p.set(l.x, 26, [180, 170, 160]); }
    // the explorers' clutter
    barrel(p, 26, FLOOR_Y - 58, 44, 60, seed + 70);
    barrel(p, 62, FLOOR_Y - 44, 36, 46, seed + 71);
    ropeCoil(p, postL + 8, 172, seed + 72);
    bucket(p, 738, FLOOR_Y - 22, seed + 73);
    sack(p, 918, FLOOR_Y - 42, seed + 74);
    // regional decor in the wings
    const acc = pal.accent;
    const spots = [[120, FLOOR_Y + 2], [236, FLOOR_Y + 4], [890, 300], [60, 200], [40, 330], [720, 260]];
    spots.forEach(([x, y], k) => {
      if (region === 1 || region === 5 || region === 3) crystal(p, x, y, 18 + hash2(k, 1, seed) * 22, acc[k % 2], seed + k);
      else if (region === 2) { mushroom(p, x, y, 10 + hash2(k, 1, seed) * 14, acc[k % 3], seed + k); mushroom(p, x + 9, y, 6 + hash2(k, 2, seed) * 8, acc[(k + 1) % 3], seed + k + 9); }
      else if (region === 4) {
        let xx = x, yy = y - 60;
        const pts = [];
        for (let i = 0; i < 10; i++) { pts.push([xx, yy]); xx += (hash2(i, k, seed) - 0.5) * 10; yy += 6; }
        ink(p, pts, seed + k, { col: [255, 120, 40], thick: 2 });
        for (const [px, py] of pts) p.set(Math.round(px), Math.round(py), [255, 220, 120]);
      } else {
        // dangling roots
        let xx = x, yy = 28;
        const pts = [];
        for (let i = 0; i < 9; i++) { pts.push([xx, yy]); xx += (hash2(i, k, seed) - 0.5) * 6; yy += 5 + hash2(k, i, seed) * 3; }
        if (y > 400) ink(p, pts, seed + k, { col: [74, 48, 30], thick: 1.6 });
      }
    });
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ props (UI layer)
/** Iron lantern with a flame frame (0..3). */
export function lanternCanvas(frame) {
  return memo('lantern|' + frame, () => {
    const p = new Painter(20, 30);
    const iron = [[30, 26, 28], [60, 54, 56], [110, 98, 92]];
    // flame + glass first so the cage overlaps
    p.poly([[5, 9], [15, 9], [16, 24], [4, 24]], [255, 200, 120]);
    const fh = 7 + (frame % 2), fx = 10 + (frame === 2 ? 1 : frame === 3 ? -1 : 0);
    p.ellipse(fx, 19, 3, fh * 0.6, [255, 236, 170]);
    p.ellipse(fx, 20, 1.5, fh * 0.35, [255, 255, 240]);
    for (let y = 9; y < 25; y++) { p.set(5, y, [255, 230, 180]); p.set(14, y, [220, 140, 70]); }
    // cage
    p.poly([[3, 5], [17, 5], [15, 9], [5, 9]], iron[1]);
    p.hline(4, 16, 5, iron[2]);
    for (const x of [3, 9, 16]) for (let y = 9; y < 26; y++) p.set(x + (x === 9 ? 1 : 0), y, x === 3 ? iron[2] : iron[0]);
    p.poly([[2, 25], [18, 25], [17, 28], [3, 28]], iron[1]);
    p.hline(3, 17, 25, iron[2]);
    p.ellipse(10, 2.5, 3, 2.5, (x, y, nx, ny) => (nx * nx + ny * ny > 0.35 ? iron[nx < 0 ? 2 : 0] : null));
    p.outline('#140a08');
    return p.toCanvas();
  });
}
/** Additive warm glow sprite (dithered falloff). */
export function glowCanvas(r, col = WARM) {
  return memo('glow|' + r + col, () => {
    const p = new Painter(r * 2, r * 2);
    const c = hexToRgb(col);
    for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      if (d >= 1) continue;
      const v = (1 - d) ** 2;
      p.set(x, y, c, Math.round(v * 120) + (dither(x, y, (v * 8) % 1) ? 8 : 0));
    }
    return p.toCanvas();
  });
}

/** Minecart, split in back (interior) and front so the haul can pile up inside. */
export function cartCanvas(part) {
  return memo('cart|' + part, () => {
    const W = 132, H = 86;
    const p = new Painter(W, H);
    const iron = ramp9(['#1e1a1e', '#2e2a30', '#46404a', '#686270', '#948c96'], '#ffc890', '#0e222a');
    const wood = ramp9(['#2a160c', '#45281a', '#64402a', '#86593a', '#a87650'], '#ffc070', '#14262a');
    const ox = PROPS.cart.x, oy = PROPS.cart.y;
    if (part === 'back') {
      p.poly([[12, 18], [120, 18], [116, 26], [16, 26]], (x, y) => pick(wood, 0.15 + (y - 18) * 0.02, x, y));
      return p.toCanvas();
    }
    // tub: tapered sides, planked body with iron bands
    const tub = [[8, 22], [124, 22], [114, 66], [18, 66]];
    p.poly(tub, (x, y) => {
      const { L } = lightAt(ox + x, oy + y);
      const band = x % 30 < 5 || y < 26 || y > 61;
      const plankLine = !band && (y - 22) % 10 === 0;
      if (band) return pick(iron, 0.45 - (y - 22) * 0.004 + L * 0.5 - (x / W) * 0.25, x, y);
      if (plankLine) return wood[1];
      return pick(wood, 0.35 + Math.sin(x * 0.2 + y) * 0.05 + L * 0.5 - (x / W) * 0.3 + (hash2(x >> 2, y, 3) - 0.5) * 0.15, x, y);
    });
    for (let x = 8; x < 124; x += 30) for (const y of [24, 40, 56]) { p.set(x + 2, y, [210, 200, 190]); p.set(x + 3, y + 1, [40, 36, 40]); }
    p.hline(8, 124, 22, [230, 200, 160]);
    ink(p, [...tub, tub[0]], 9, { thick: 1.8, ox, oy });
    // handle bar on the right
    ink(p, [[118, 30], [128, 26], [130, 34]], 12, { col: [70, 66, 72], thick: 2.2 });
    // wheels with spokes
    for (const wx of [34, 98]) {
      p.ellipse(wx, 70, 11, 11, (x, y, nx, ny) => {
        const r = Math.hypot(nx, ny);
        if (r > 0.78) return pick(iron, 0.55 - ny * 0.3, x, y);
        if (r < 0.25) return iron[6];
        const a = Math.atan2(ny, nx);
        return Math.abs(Math.sin(a * 3)) < 0.22 ? iron[4] : null;
      });
      ink(p, Array.from({ length: 17 }, (_, k) => [wx + Math.cos((k / 16) * Math.PI * 2) * 11.5, 70 + Math.sin((k / 16) * Math.PI * 2) * 11.5]), wx, { thick: 1.4, ox, oy });
    }
    return p.toCanvas();
  });
}

/** Open wooden crate with straw. Tools are drawn into it at runtime. */
export function crateCanvas(part) {
  return memo('crate|' + part, () => {
    const W = 96, H = 62;
    const p = new Painter(W, H);
    if (part === 'back') {
      plank(p, [[4, 6], [92, 4], [92, 16], [4, 18]], 71, true);
      return p.toCanvas();
    }
    // straw tufts first, then the front slats
    for (let k = 0; k < 70; k++) {
      const x = 6 + hash2(k, 1, 5) * 84, y = 14 + hash2(k, 2, 5) * 10, len = 4 + hash2(k, 3, 5) * 8, a = -1.2 - hash2(k, 4, 5) * 0.8;
      for (let t = 0; t < len; t++) p.set(Math.round(x + Math.cos(a + (k % 2 ? 0.9 : 0)) * t), Math.round(y + Math.sin(a) * t * 0.6), t < 2 ? [150, 110, 40] : [228, 190, 96]);
    }
    for (let i = 0; i < 3; i++) plank(p, [[2, 22 + i * 13], [94, 21 + i * 13 + (i === 1 ? 1 : 0)], [94, 33 + i * 13], [2, 34 + i * 13]], 80 + i, true);
    plank(p, [[1, 20], [10, 20], [10, 61], [1, 61]], 90);
    plank(p, [[86, 20], [95, 20], [95, 61], [86, 61]], 91);
    for (const [x, y] of [[4, 24], [4, 56], [89, 24], [89, 56], [46, 27], [46, 52]]) nail(p, x, y);
    return p.toCanvas();
  });
}

/** Small anvil on a stump, with a hammer leaning on it (opens the pickaxe forge). */
export function anvilCanvas(hot) {
  return memo('anvil|' + (hot ? 1 : 0), () => {
    const p = new Painter(72, 58);
    const iron = ramp9(['#16141a', '#24222a', '#3a3842', '#5a5866', '#86849a'], '#ffc890', '#0c2028');
    const ox = PROPS.anvil.x, oy = PROPS.anvil.y;
    // stump
    const stump = [[16, 30], [54, 30], [57, 56], [13, 56]];
    plank(p, stump, 33);
    p.ellipse(35, 31, 21, 4, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.7 ? [70, 44, 26] : Math.round(Math.hypot(nx, ny * 3) * 6) % 2 ? [160, 118, 72] : [196, 150, 96]));
    // anvil body: horn, face, waist, foot
    const body = [[4, 12], [16, 10], [60, 10], [66, 12], [60, 17], [46, 18], [44, 24], [50, 30], [22, 30], [28, 24], [26, 18], [14, 17]];
    p.poly(body, (x, y) => { const { L } = lightAt(ox + x, oy + y); return pick(iron, (y < 12 ? 0.9 : 0.4 - (y - 12) * 0.02) + L * 0.4 - x * 0.002, x, y); });
    p.hline(16, 60, 10, hot ? [255, 210, 140] : [200, 196, 210]);
    ink(p, [...body, body[0]], 4, { thick: 1.6, ox, oy });
    // hammer leaning on the stump
    ink(p, [[60, 54], [68, 24]], 2, { col: [120, 80, 46], thick: 2.4 });
    p.poly([[62, 18], [72, 22], [70, 28], [60, 24]], (x, y) => pick(iron, 0.6 - (y - 18) * 0.04, x, y));
    ink(p, [[62, 18], [72, 22], [70, 28], [60, 24], [62, 18]], 3, { thick: 1.2, ox, oy });
    return p.toCanvas();
  });
}

/** Chalk slate on a string: tally marks for swings left (used ones are smudged). */
export function slateCanvas(total, left) {
  return memo('slate|' + total + '|' + left, () => {
    const W = 104, H = 72;
    const p = new Painter(W, H);
    // string to the nail
    ink(p, [[30, 12], [52, 2], [74, 12]], 5, { col: [150, 120, 80], thick: 0.6 });
    plank(p, [[6, 12], [98, 11], [99, 70], [5, 71]], 61, true);
    const slate = [[12, 18], [92, 17], [93, 64], [11, 65]];
    p.poly(slate, (x, y) => (hash2(x >> 1, y >> 1, 4) > 0.86 ? [64, 74, 76] : fbm2(x * 0.1, y * 0.1, 2, 3) > 0.55 ? [46, 54, 58] : [36, 44, 48]));
    // tallies in groups of five
    let x = 18, y = 26;
    for (let i = 0; i < total; i++) {
      const g = i % 5;
      const used = i >= left;
      const chalk = used ? [86, 96, 98] : [236, 236, 222];
      if (g === 4) ink(p, [[x - 26, y + 15], [x - 2, y + 2]], 40 + i, { col: chalk, thick: 1.6 });
      else {
        const pts = [[x + (hash2(i, 1, 2) - 0.5) * 2, y], [x + 1 + (hash2(i, 2, 2) - 0.5) * 2, y + 9], [x + (hash2(i, 3, 2) - 0.5) * 2, y + 17]];
        ink(p, pts, 20 + i, { col: chalk, thick: 1.5 });
        x += 7;
      }
      if (g === 4) x += 8;
      if (x > 84) { x = 18; y += 20; }
    }
    return p.toCanvas();
  });
}

/** Parchment scrap (small = pinned on the post; large = readable when hovered). */
export function noteCanvas(w, h, seed = 3) {
  return memo('note|' + w + 'x' + h + seed, () => {
    const p = new Painter(w, h);
    const edge = [];
    const n = 24;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const side = Math.floor(t * 4), f = (t * 4) % 1;
      const j = (hash2(k, seed, 1) - 0.5) * 3;
      const pt = side === 0 ? [2 + f * (w - 4), 2 + j] : side === 1 ? [w - 2 + j, 2 + f * (h - 4)] : side === 2 ? [w - 2 - f * (w - 4), h - 2 + j] : [2 + j, h - 2 - f * (h - 4)];
      edge.push(pt);
    }
    const par = ramp9(['#8a6a44', '#b08a5a', '#ccaa74', '#e0c492', '#f0dcb0'], '#ffe2a8', '#3a3a3a');
    p.poly(edge, (x, y) => pick(par, 0.62 + (fbm2(x * 0.06, y * 0.06, 3, seed) - 0.5) * 0.4 - (Math.min(x, y, w - x, h - y) < 5 ? 0.18 : 0), x, y));
    ink(p, [...edge, edge[0]], seed, { col: [90, 60, 34], thick: 1 });
    // nail at the top
    nail(p, Math.round(w / 2), 5);
    return p.toCanvas();
  });
}

/** Paper tag on a string, for hover labels. Text is drawn on top at runtime. */
export function tagCanvas(w) {
  return memo('tag|' + w, () => {
    const h = 18;
    const p = new Painter(w + 8, h + 10);
    ink(p, [[w / 2 + 4, 0], [w / 2 + 4, 6]], 2, { col: [150, 120, 80], thick: 0.6 });
    const pts = [[8, 6], [w, 6], [w + 6, 6 + h / 2], [w, 6 + h], [8, 6 + h], [4, 6 + h / 2]];
    const par = ramp9(['#8a6a44', '#b08a5a', '#ccaa74', '#e0c492', '#f0dcb0']);
    p.poly(pts, (x, y) => pick(par, 0.7 + (hash2(x >> 1, y >> 1, 5) - 0.5) * 0.25 - (y - 6) * 0.012, x, y));
    ink(p, [...pts, pts[0]], 4, { col: [90, 60, 34], thick: 1 });
    p.ellipse(w + 1, 6 + h / 2, 1.5, 1.5, [60, 40, 24]);
    return p.toCanvas();
  });
}

/** Wide warm light pool on the floor under a lantern (static, drawn with 'lighter'). */
export function floorPool(w) { return glowCanvas(Math.round(w / 2), '#ff9a40'); }
