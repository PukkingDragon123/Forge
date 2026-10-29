// Pixel art for the mining chamber, Eastward-style: a pastel rock face of chiselled stones whose
// strata change colour with depth (sand → salmon → mauve → slate), fossils, moss, wet sheen and
// crisp rim light; ore that bursts out of the stone like a classic ore sheet; a densely detailed
// workshop around it (see art/mine_room.js); and the props you touch: minecart, crate, anvil, slate.
// Lighting is baked per surface: warm lamps, lavender shadow, a cool bounce from below.
import { Painter, dither } from '../art/pixel.js';
import { withLights, wobble } from '../art/handpaint.js';
import { STRATA, WOOD, MOSS, OUTLINE, rampOf, pk, light, grade, inkLine, fossil, mossTuft, shards } from '../art/mine_kit.js';
import { oreArt } from '../art/mine_ore.js';
import { paintRoom } from '../art/mine_room.js';
import { hash2, fbm2, mixHex, hexToRgb, clamp } from '../core/math.js';
import { MATERIALS } from '../data/materials.js';
import { MINE_W, MINE_H } from '../systems/mining.js';

export const SCREEN_W = 960, SCREEN_H = 540, FLOOR_Y = 488;
export const PITCH = 52, MARGIN = 10;
export const BOARD = { x: 296, y: 34, w: MINE_W * PITCH + MARGIN * 2, h: MINE_H * PITCH + MARGIN * 2 };
export const LANTERNS = [{ x: 298, y: 74 }, { x: 702, y: 74 }];
/** Screen positions (top-left) of the interactive props. */
export const PROPS = { anvil: { x: 330, y: 432 }, crate: { x: 552, y: 430 }, cart: { x: 776, y: 418 }, slate: { x: 812, y: 44 }, note: { x: 734, y: 150 } };
/** Where water drips from (stalactites over the face and the room). */
export const DRIPS = [[312, 30], [468, 32], [604, 31], [36, 18], [812, 22], [930, 26]];
const ACCENTS = ['#ff9ab0', '#7ad8c8', '#ffd27a', '#b89aff', '#ff8a6a', '#c8a0ff'];

const cache = new Map();
const memo = (k, f) => { let c = cache.get(k); if (!c) { c = withLights(LANTERNS, f); cache.set(k, c); if (cache.size > 900) cache.delete(cache.keys().next().value); } return c; };
export { oreArt };
export { chunkCanvas, lanternCanvas, glowCanvas, noteCanvas, tagCanvas } from '../art/handpaint.js';

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
    for (let j = 0; j <= MINE_H; j++) for (let i = 0; i < MINE_W; i++) H[i + ',' + j] = wobble(C[j][i], C[j][i + 1], seed * 31 + i * 7 + j * 131, j === 0 || j === MINE_H ? 2.5 : 4.2, j === 0 || j === MINE_H ? 13 : 6);
    for (let j = 0; j < MINE_H; j++) for (let i = 0; i <= MINE_W; i++) V[i + ',' + j] = wobble(C[j][i], C[j + 1][i], seed * 37 + i * 11 + j * 173, i === 0 || i === MINE_W ? 2.5 : 4.2, i === 0 || i === MINE_W ? 13 : 6);
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

/** Strata colour of the face at a board-local pixel: one band per row, wavering across stones. */
function faceBand(region, gx, gy, seed) {
  const S = STRATA[region] || STRATA[0];
  const t = clamp((gy - MARGIN + (fbm2(gx * 0.02, gy * 0.01, 2, seed) - 0.5) * 34 + Math.sin(gx * 0.03 + seed) * 6) / (MINE_H * PITCH), 0, 0.999);
  return S[Math.floor(t * S.length)];
}

/** A stone of the rock face (canvas covers the cell bbox). flags: {exposed, dim, flare, hover} */
export function stoneCanvas(geom, tile, pal, flags = {}, region = 0) {
  const key = ['s', geom.seed, region, tile.x, tile.y, tile.t, tile.mat, tile.hits, tile.crack, JSON.stringify(tile.veins), tile.glint, tile.revealed, tile.marked, flags.exposed ? 1 : 0, flags.dim ? 1 : 0, flags.flare ? 1 : 0, flags.hover ? 1 : 0].join('|');
  return memo(key, () => {
    const c = geom.cells[tile.y][tile.x];
    const p = new Painter(c.bw, c.bh);
    const hard = tile.t === 'hard';
    const s = geom.seed * 7 + tile.x * 31 + tile.y * 17;
    const ox = BOARD.x + c.bx, oy = BOARD.y + c.by;
    const dim = flags.dim ? 0.16 : 0;
    const wet = hash2(tile.x, 77, geom.seed) > 0.86;
    for (let yy = 0; yy < c.bh; yy++) for (let xx = 0; xx < c.bw; xx++) {
      const k = yy * c.bw + xx, d = c.dist[k];
      if (d < 0) continue;
      const gx = c.bx + xx, gy = c.by + yy;
      const { L, dx, dy, cool } = light(ox + xx, oy + yy);
      if (d < 1.15) { p.set(xx, yy, OUTLINE); continue; }
      let base = faceBand(region, gx, gy, geom.seed);
      if (hard) base = mixHex(base, '#6a7aa8', 0.45);
      if (flags.dim) base = mixHex(base, '#5a4a7a', 0.25);
      const rmp = rampOf(base);
      // crisp rim light on the edges that face the lamp; deeper shade on the far side
      // key light: the lamp direction leaned toward a fixed top-left sun, so every stone reads as a pillow
      const kx = dx * 0.55 - 0.3, ky = dy * 0.55 - 0.75, kl = Math.hypot(kx, ky) || 1;
      const facing = c.nx[k] * dx + c.ny[k] * dy, key = (c.nx[k] * kx + c.ny[k] * ky) / kl;
      if (d < 2.2 && facing > 0.25 && key > 0 && !flags.dim) { p.set(xx, yy, grade(rmp[L > 0.45 ? 6 : 5], L, cool)); continue; }
      if (d < 2.6 && c.ny[k] > 0.55) { p.set(xx, yy, grade(rmp[0], L * 0.4, cool)); continue; } // under-lip shadow
      let bf = c.facets[0], bd = 1e9;
      for (const f of c.facets) { const e = (gx - f.x) ** 2 + (gy - f.y) ** 2; if (e < bd) { bd = e; bf = f; } }
      let v = 0.5 + ((bf.tx * kx + bf.ty * ky) / kl) * 0.34 + Math.sqrt(d / c.maxD) * 0.12 - 0.06;
      if (d < 8) { const b = 1 - d / 8; v += key * b * 0.6 - b * 0.08; }
      v += (fbm2(gx * 0.1, gy * 0.1, 2, s) - 0.5) * 0.22 + (hash2(gx, gy, s) - 0.5) * 0.06;
      if (hard) v += Math.sin((gx + gy * 0.4) * 0.35 + fbm2(gx * 0.05, gy * 0.05, 2, s) * 6) * 0.05;
      if (wet) v -= 0.06;
      v = v * 0.92 + (Math.min(L, 0.9) - 0.45) * 0.3 + 0.02 - dim + (flags.hover ? 0.12 : 0);
      p.set(xx, yy, grade(pk(rmp, v, gx, gy), L, cool));
    }
    const inside = (x, y) => { const k = y * c.bw + x; return x >= 0 && y >= 0 && x < c.bw && y < c.bh && c.dist[k] > 1.6; };
    const lcx = c.cx - c.bx, lcy = c.cy - c.by;
    const band = faceBand(region, c.cx, c.cy, geom.seed);
    const rmp = rampOf(hard ? mixHex(band, '#6a7aa8', 0.45) : band);
    // grit, chips and chisel scratches
    for (let k = 0; k < 9; k++) {
      const x = Math.floor(hash2(k, 5, s) * c.bw), y = Math.floor(hash2(k, 6, s) * c.bh);
      if (!inside(x, y) || !inside(x + 1, y + 1)) continue;
      if (k % 3 === 0) { p.set(x, y, rmp[1]); p.set(x + 1, y, rmp[2]); p.set(x + 1, y + 1, rmp[5]); }
      else p.set(x, y, k % 2 ? rmp[2] : rmp[4]);
    }
    for (let k = 0; k < 1; k++) {
      const x = c.bw * (0.2 + hash2(k, 15, s) * 0.6), y = c.bh * (0.2 + hash2(k, 16, s) * 0.6), a = hash2(k, 17, s) * Math.PI;
      for (let t = -3; t <= 3; t++) { const xx = Math.round(x + Math.cos(a) * t), yy = Math.round(y + Math.sin(a) * t); if (inside(xx, yy)) p.set(xx, yy, t < 0 ? rmp[1] : rmp[6]); }
    }
    const isOre = tile.t === 'ore' && MATERIALS[tile.mat];
    const showOre = isOre && (tile.revealed || flags.exposed);
    // fossils, decorative crystals, moss, wet streaks: the face is full of little things
    if (!showOre && hash2(tile.x, tile.y, geom.seed + 9) > 0.84) fossil(p, Math.round(lcx + (hash2(1, s, 2) - 0.5) * 14), Math.round(lcy + (hash2(2, s, 2) - 0.5) * 12), Math.floor(hash2(3, s, 2) * 4), band, inside);
    if (!showOre && hash2(tile.x, tile.y, geom.seed + 10) > 0.9) shards(p, Math.round(lcx + (hash2(4, s, 2) - 0.5) * 16), Math.round(c.bh - 6), ACCENTS[(region + tile.x) % ACCENTS.length], 3, s, inside);
    if (tile.y === 0 || (tile.y < 3 && hash2(tile.x, tile.y, geom.seed + 11) > 0.8)) {
      for (let xx = 2; xx < c.bw - 2; xx++) {
        let top = -1;
        for (let yy = 0; yy < c.bh; yy++) if (inside(xx, yy)) { top = yy; break; }
        if (top >= 0 && (tile.y === 0 || hash2(xx >> 3, tile.y, s) > 0.5)) mossTuft(p, xx, top, 1, s + xx, inside);
      }
    }
    if (wet) for (let k = 0; k < 1; k++) {
      const x = Math.round(c.bw * (0.25 + hash2(k, 41, s) * 0.5)), y0 = Math.round(c.bh * (0.15 + hash2(k, 42, s) * 0.4)), len = 4 + Math.floor(hash2(k, 43, s) * 7);
      for (let j = 0; j < len; j++) if (inside(x, y0 + j)) { p.set(x, y0 + j, j === 0 ? [240, 246, 255] : rmp[Math.max(1, 4 - (j >> 1))]); if (inside(x + 1, y0 + j)) p.set(x + 1, y0 + j, rmp[1]); }
    }
    if (hard) {
      // pale quartz seams: hard rock reads at a glance
      for (let q = 0; q < 2; q++) {
        const pts = [];
        let x = c.bw * (0.2 + hash2(q, 11, s) * 0.6), y = 3;
        while (y < c.bh - 3) { pts.push([x, y]); y += 4; x += (hash2(Math.round(y), q, s) - 0.5) * 6; }
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          for (let t = 0; t <= 4; t++) { const xx = Math.round(x0 + (x1 - x0) * t / 4), yy = Math.round(y0 + (y1 - y0) * t / 4); if (inside(xx, yy)) { p.set(xx, yy, t % 2 ? rmp[6] : [222, 226, 250]); if (inside(xx + 1, yy)) p.set(xx + 1, yy, rmp[2]); } }
        }
      }
    }
    if (tile.hits) {
      const pts = [];
      let y = c.bh * (0.35 + hash2(3, 4, s) * 0.3);
      for (let x = 2; x < c.bw - 2; x += 3) { pts.push([x, y]); y += (hash2(x, 7, s) - 0.5) * 7; }
      for (const [x, y2] of pts) { const yy = Math.round(y2); if (inside(x, yy - 1)) p.set(x, yy - 1, [255, 236, 200]); }
      inkLine(p, pts, OUTLINE, 2);
    }
    // mineral veins point toward hidden ore: bright, beaded, with a dark seam
    for (const [dir, col] of Object.entries(tile.veins || {})) {
      const [tx, ty] = dir === 'up' ? [lcx, 0] : dir === 'down' ? [lcx, c.bh] : dir === 'left' ? [0, lcy] : [c.bw, lcy];
      const vr = rampOf(col);
      let x = lcx + (hash2(1, 31, s) - 0.5) * 10, y = lcy + (hash2(1, 32, s) - 0.5) * 10;
      for (let i = 0; i < 70; i++) {
        const ddx = tx - x, ddy = ty - y, dl = Math.hypot(ddx, ddy);
        if (dl < 3) break;
        x += ddx / dl + (hash2(i, 1, s) - 0.5) * 1.4; y += ddy / dl + (hash2(1, i, s) - 0.5) * 1.4;
        const xx = Math.round(x), yy = Math.round(y);
        if (!inside(xx, yy)) continue;
        p.set(xx, yy, i % 5 === 0 ? vr[6] : vr[4]);
        if (inside(xx + 1, yy + 1)) p.set(xx + 1, yy + 1, vr[1]);
        if (i % 7 === 3 && inside(xx - 1, yy - 1)) { p.set(xx - 1, yy - 1, vr[5]); p.set(xx, yy - 1, vr[5]); p.set(xx - 1, yy, vr[3]); }
      }
    }
    if (tile.crack) for (let q = 0; q < 2; q++) {
      const pts = [];
      let x = c.bw * (0.25 + hash2(q, 41, s) * 0.5), y = c.bh * (0.2 + hash2(q, 42, s) * 0.2);
      for (let i = 0; i < 9; i++) { pts.push([x, y]); x += (hash2(i, q, s) - 0.5) * 9; y += 2.5 + hash2(q, i, s) * 2; }
      inkLine(p, pts, [150, 34, 50]);
      for (const [qx, qy] of pts) if (inside(Math.round(qx) + 1, Math.round(qy))) p.set(Math.round(qx) + 1, Math.round(qy), [255, 120, 96]);
    }
    if ((tile.revealed || flags.flare) && tile.t === 'hazard') {
      const pts = [];
      for (let k = 0; k < 8; k++) pts.push([lcx - 14 + k * 4, lcy + (k % 2 ? 4 : -4)]);
      inkLine(p, pts, [255, 96, 96], 2);
    }
    if (showOre) {
      // a chipped socket, then the ore itself bursting out of the stone
      const r = 17;
      const sock = [];
      for (let k = 0; k < 13; k++) { const a = (k / 13) * Math.PI * 2; const rr = r * (0.8 + hash2(k, 81, s) * 0.32); sock.push([lcx + Math.cos(a) * rr, lcy + Math.sin(a) * rr * 0.88]); }
      p.poly(sock, (x, y) => (inside(x, y) ? (y < lcy - 3 ? [36, 24, 50] : [56, 40, 72]) : null));
      inkLine(p, [...sock, sock[0]], OUTLINE);
      const art = Painter.fromCanvas(oreArt(tile.mat, 34));
      const sx0 = Math.round(lcx - 17), sy0 = Math.round(lcy - 18);
      for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) {
        const col = art.get(x, y);
        if (!col || col[3] < 128 || !inside(sx0 + x, sy0 + y)) continue;
        if (tile.revealed && !flags.exposed && !dither(x, y, 0.55)) continue;
        p.set(sx0 + x, sy0 + y, [col[0], col[1], col[2]]);
      }
      for (let k = 0; k < 12; k++) { const a = 0.45 + (k / 11) * 2.25; const x = Math.round(lcx + Math.cos(a) * r * 0.95), y = Math.round(lcy + Math.sin(a) * r * 0.84); if (inside(x, y)) { p.set(x, y, rmp[5]); if (inside(x, y + 1)) p.set(x, y + 1, rmp[2]); } }
    } else if (isOre) {
      // a hint of colour where ore hides: a few tinted grains
      const vr = rampOf(MATERIALS[tile.mat].color);
      for (let k = 0; k < 5; k++) { const x = Math.round(lcx + (hash2(k, 91, s) - 0.5) * 22), y = Math.round(lcy + (hash2(k, 92, s) - 0.5) * 20); if (inside(x, y) && hash2(k, 93, s) > 0.4) p.set(x, y, vr[3]); }
    }
    if (tile.glint) for (let k = 0; k < 1 + tile.glint; k++) {
      const x = Math.round(lcx + (hash2(k, 61, s) - 0.5) * c.bw * 0.6), y = Math.round(lcy + (hash2(k, 62, s) - 0.5) * c.bh * 0.6);
      if (!inside(x, y)) continue;
      const big = k === 0 && tile.glint >= 3;
      p.set(x, y, [255, 255, 255]);
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { p.set(x + ddx, y + ddy, [255, 244, 200]); if (big) p.set(x + ddx * 2, y + ddy * 2, [255, 214, 140]); }
    }
    if (tile.marked) {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2.1; pts.push([lcx + Math.cos(a) * (18 + hash2(k, 3, s) * 2), lcy + Math.sin(a) * (16 + hash2(k, 4, s) * 2)]); }
      inkLine(p, pts, [190, 255, 210], 2);
    }
    return p.toCanvas();
  });
}

/** The hollow left behind a broken stone: a deep plum recess, lit inner walls, pebbles below. */
export function cavityCanvas(geom, x, y, pal, region = 0) {
  return memo('cav|' + geom.seed + '|' + region + '|' + x + ',' + y, () => {
    const c = geom.cells[y][x];
    const p = new Painter(c.bw, c.bh);
    const back = rampOf(mixHex(faceBand(region, c.cx, c.cy, geom.seed), '#1e1436', 0.7));
    const s = geom.seed + x * 13 + y * 7;
    for (let yy = 0; yy < c.bh; yy++) for (let xx = 0; xx < c.bw; xx++) {
      const k = yy * c.bw + xx, d = c.dist[k];
      if (d < 0) continue;
      const { L, dx, dy, cool } = light(BOARD.x + c.bx + xx, BOARD.y + c.by + yy);
      let v = 0.14 + fbm2((c.bx + xx) * 0.12, (c.by + yy) * 0.12, 2, s) * 0.18;
      if (d < 8) { const b = 1 - d / 8; v += -(c.nx[k] * dx + c.ny[k] * dy) * b * 0.75 + b * 0.1; }
      if (d > 1.3 && d < 2.4 && (c.nx[k] * dx + c.ny[k] * dy) < -0.3) v = 0.9; // the far lip catches the lamp
      if (d < 1.3) v = 0.02;
      v = v * 0.7 + L * 0.3 - 0.04;
      p.set(xx, yy, grade(pk(back, v, c.bx + xx, c.by + yy), L * 0.6, cool));
    }
    for (let k = 0; k < 7; k++) {
      const xx = Math.floor(hash2(k, 9, s) * c.bw), yy = Math.floor(c.bh * 0.6 + hash2(k, 8, s) * c.bh * 0.35);
      const d = c.dist[yy * c.bw + xx];
      if (d > 3) { p.set(xx, yy, back[5]); p.set(xx + 1, yy, back[3]); p.set(xx, yy + 1, back[1]); }
    }
    return p.toCanvas();
  });
}

/** Soft plum rim around the whole rock face so it sits recessed in the wall. */
export function faceRim(geom) {
  return memo('rim|' + geom.seed, () => {
    const p = new Painter(BOARD.w + 16, BOARD.h + 16);
    const mask = new Uint8Array(p.w * p.h);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const lx = x - 8, ly = y - 8;
      mask[y * p.w + x] = lx >= 0 && ly >= 0 && lx < BOARD.w && ly < BOARD.h && cellAt(geom, lx, ly) ? 1 : 0;
    }
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (mask[y * p.w + x]) continue;
      let near = 99;
      for (let r = 1; r <= 7 && near === 99; r++) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const xx = Math.round(x + Math.cos(a) * r), yy = Math.round(y + Math.sin(a) * r); if (xx >= 0 && yy >= 0 && xx < p.w && yy < p.h && mask[yy * p.w + xx]) { near = r; break; } }
      if (near <= 2) p.set(x, y, OUTLINE);
      else if (near < 99 && dither(x, y, 1 - (near - 2) / 6)) p.set(x, y, [42, 30, 64], 170);
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ the chamber backdrop
/** Static painted chamber (see art/mine_room.js). */
export function chamberCanvas(region) {
  return memo('chamber|' + region, () => paintRoom(region, { BOARD, FLOOR_Y, LANTERNS }));
}

// ------------------------------------------------------------------ props (UI layer)
function litFill(p, pts, base, fv, ox, oy, outline = true) {
  const rmp = rampOf(base);
  p.poly(pts, (x, y) => { const { L, cool } = light(ox + x, oy + y); return grade(pk(rmp, fv(x, y) * 0.62 + L * 0.45 - 0.06, x, y), L, cool); });
  if (outline) inkLine(p, [...pts, pts[0]]);
}
function plankP(p, pts, ox, oy, seed, horiz = true) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const across = horiz ? y1 - y0 : x1 - x0;
  litFill(p, pts, WOOD[4], (x, y) => {
    const a = horiz ? (y - y0) / across : (x - x0) / across, along = horiz ? x : y;
    return 0.42 + Math.cos((a - 0.5) * Math.PI) * 0.3 + Math.sin(along * 0.08 + a * 7 + seed) * 0.07 + (a < 0.18 ? 0.12 : 0);
  }, ox, oy);
}
const nailP = (p, x, y) => { p.set(x, y, [238, 230, 224]); p.set(x + 1, y + 1, [96, 84, 110]); };

/** Minecart, split in back (interior) and front so the haul can pile up inside. */
export function cartCanvas(part) {
  return memo('cart|' + part, () => {
    const W = 132, H = 86;
    const p = new Painter(W, H);
    const ox = PROPS.cart.x, oy = PROPS.cart.y;
    if (part === 'back') { litFill(p, [[12, 18], [120, 18], [116, 26], [16, 26]], WOOD[2], (x, y) => 0.2 + (y - 18) * 0.03, ox, oy, false); return p.toCanvas(); }
    const tub = [[8, 22], [124, 22], [114, 66], [18, 66]];
    const iron = rampOf('#8a86ae'), wood = rampOf(WOOD[4]);
    p.poly(tub, (x, y) => {
      const { L, cool } = light(ox + x, oy + y);
      const band = x % 30 < 5 || y < 26 || y > 61;
      if (band) return grade(pk(iron, 0.5 - (y - 22) * 0.004 + L * 0.42 - (x / W) * 0.2, x, y), L, cool);
      if ((y - 22) % 10 === 0) return grade(wood[1], L, cool);
      return grade(pk(wood, 0.4 + Math.sin(x * 0.2 + y) * 0.05 + L * 0.42 - (x / W) * 0.24 + (hash2(x >> 2, y, 3) - 0.5) * 0.12, x, y), L, cool);
    });
    for (let x = 8; x < 124; x += 30) for (const y of [24, 40, 56]) nailP(p, x + 2, y);
    for (let x = 9; x < 124; x++) p.set(x, 22, [250, 230, 210]);
    inkLine(p, [...tub, tub[0]], OUTLINE, 2);
    inkLine(p, [[118, 30], [128, 26], [130, 34]], [96, 90, 120], 2);
    for (const wx of [34, 98]) {
      p.ellipse(wx, 70, 11, 11, (x, y, nx, ny) => {
        const r = Math.hypot(nx, ny);
        if (r > 0.78) return pk(iron, 0.6 - ny * 0.3, x, y);
        if (r < 0.25) return iron[6];
        return Math.abs(Math.sin(Math.atan2(ny, nx) * 3)) < 0.22 ? iron[4] : null;
      });
      inkLine(p, Array.from({ length: 17 }, (_, k) => [wx + Math.cos((k / 16) * Math.PI * 2) * 11.5, 70 + Math.sin((k / 16) * Math.PI * 2) * 11.5]));
    }
    return p.toCanvas();
  });
}

/** Open wooden crate with straw. Tools are drawn into it at runtime. */
export function crateCanvas(part) {
  return memo('crate|' + part, () => {
    const W = 96, H = 62;
    const p = new Painter(W, H);
    const ox = PROPS.crate.x, oy = PROPS.crate.y;
    if (part === 'back') { plankP(p, [[4, 6], [92, 4], [92, 16], [4, 18]], ox, oy, 71); return p.toCanvas(); }
    for (let k = 0; k < 80; k++) {
      const x = 6 + hash2(k, 1, 5) * 84, y = 14 + hash2(k, 2, 5) * 10, len = 4 + hash2(k, 3, 5) * 8, a = -1.2 - hash2(k, 4, 5) * 0.8;
      for (let t = 0; t < len; t++) p.set(Math.round(x + Math.cos(a + (k % 2 ? 0.9 : 0)) * t), Math.round(y + Math.sin(a) * t * 0.6), t < 2 ? [190, 130, 70] : t % 3 ? [250, 214, 120] : [255, 236, 170]);
    }
    for (let i = 0; i < 3; i++) plankP(p, [[2, 22 + i * 13], [94, 21 + i * 13 + (i === 1 ? 1 : 0)], [94, 33 + i * 13], [2, 34 + i * 13]], ox, oy, 80 + i);
    plankP(p, [[1, 20], [10, 20], [10, 61], [1, 61]], ox, oy, 90, false);
    plankP(p, [[86, 20], [95, 20], [95, 61], [86, 61]], ox, oy, 91, false);
    for (const [x, y] of [[4, 24], [4, 56], [89, 24], [89, 56], [46, 27], [46, 52]]) nailP(p, x, y);
    // a painted stencil: a little pickaxe mark on the slats
    inkLine(p, [[40, 46], [54, 36]], [130, 70, 60], 2); inkLine(p, [[46, 34], [54, 36], [60, 42]], [130, 70, 60], 2);
    return p.toCanvas();
  });
}

/** Small anvil on a stump, with a hammer leaning on it (opens the pickaxe forge). */
export function anvilCanvas(hot) {
  return memo('anvil|' + (hot ? 1 : 0), () => {
    const p = new Painter(72, 58);
    const ox = PROPS.anvil.x, oy = PROPS.anvil.y;
    plankP(p, [[16, 30], [54, 30], [57, 56], [13, 56]], ox, oy, 33, false);
    p.ellipse(35, 31, 21, 4, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.7 ? hexToRgb(WOOD[2]) : Math.round(Math.hypot(nx, ny * 3) * 6) % 2 ? hexToRgb(WOOD[4]) : hexToRgb(WOOD[5])));
    const body = [[4, 12], [16, 10], [60, 10], [66, 12], [60, 17], [46, 18], [44, 24], [50, 30], [22, 30], [28, 24], [26, 18], [14, 17]];
    litFill(p, body, '#6e6a96', (x, y) => (y < 12 ? 0.95 : 0.45 - (y - 12) * 0.02), ox, oy);
    for (let x = 16; x <= 60; x++) p.set(x, 10, hot ? [255, 214, 150] : [228, 226, 246]);
    if (hot) for (let x = 20; x < 56; x += 3) p.set(x, 11, [255, 170, 90]);
    inkLine(p, [[60, 54], [68, 24]], hexToRgb(WOOD[3]), 2);
    litFill(p, [[62, 18], [72, 22], [70, 28], [60, 24]], '#8a86ae', (x, y) => 0.6 - (y - 18) * 0.04, ox, oy);
    return p.toCanvas();
  });
}

/** Chalk slate on a string: tally marks for swings left (used ones are smudged). */
export function slateCanvas(total, left) {
  return memo('slate|' + total + '|' + left, () => {
    const W = 104, H = 72;
    const p = new Painter(W, H);
    const ox = PROPS.slate.x, oy = PROPS.slate.y;
    inkLine(p, [[30, 12], [52, 2], [74, 12]], [190, 160, 120]);
    plankP(p, [[6, 12], [98, 11], [99, 70], [5, 71]], ox, oy, 61);
    const slate = [[12, 18], [92, 17], [93, 64], [11, 65]];
    p.poly(slate, (x, y) => (hash2(x >> 1, y >> 1, 4) > 0.86 ? [78, 86, 112] : fbm2(x * 0.1, y * 0.1, 2, 3) > 0.55 ? [58, 64, 90] : [46, 50, 74]));
    inkLine(p, [...slate, slate[0]]);
    let x = 18, y = 26;
    for (let i = 0; i < total; i++) {
      const g = i % 5;
      const chalk = i >= left ? [104, 110, 140] : [246, 244, 232];
      if (g === 4) inkLine(p, [[x - 26, y + 15], [x - 2, y + 2]], chalk, 2);
      else { inkLine(p, [[x + (hash2(i, 1, 2) - 0.5) * 2, y], [x + 1 + (hash2(i, 2, 2) - 0.5) * 2, y + 9], [x + (hash2(i, 3, 2) - 0.5) * 2, y + 17]], chalk, 2); x += 7; }
      if (g === 4) x += 8;
      if (x > 84) { x = 18; y += 20; }
    }
    return p.toCanvas();
  });
}
void MOSS;
