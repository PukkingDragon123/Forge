// Rock face layout for the mining spot: the 7×7 grid of irregular stones (jittered corner lattice,
// wobbly shared edges, per-pixel edge distance and normals) in screen space. The voxel stones
// (models/mine_vox.js) are sculpted from these shapes, and hover/click hit-testing uses them directly.
import { wobble } from '../art/handpaint.js';
import { hash2, clamp } from '../core/math.js';
import { MINE_W, MINE_H } from '../systems/mining.js';

export const PITCH = 52, MARGIN = 10;
export const BOARD = { x: 296, y: 34, w: MINE_W * PITCH + MARGIN * 2, h: MINE_H * PITCH + MARGIN * 2 };
/** Screen positions of the two lanterns hung on the face's timber frame. */
export const LANTERNS = [{ x: 298, y: 74 }, { x: 702, y: 74 }];
export { noteCanvas, tagCanvas } from '../art/handpaint.js';

const cache = new Map();

// ------------------------------------------------------------------ rock face geometry
/** Irregular stones: jittered corner lattice, wobbly shared edges, per-pixel edge distance. */
export function rockFace(seed) {
  let g = cache.get(seed);
  if (g) return g;
  g = (() => {
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
  })();
  cache.set(seed, g);
  return g;
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
