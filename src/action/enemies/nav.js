// Shared navigation: a flow field (BFS distance from the player's tile) over the room grid, rebuilt when the
// player changes tile (at most ~4×/s). Walkers path around walls, obstacles and pits; flyers cross pits.
// Grid contract (docs §9.1): get(tx,tz) → 0 floor | 1 wall | 2 obstacle | 3 pit, toTile(x,z), toWorld(tx,tz), w, h.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

class Field {
  constructor(grid, fly) { this.grid = grid; this.fly = fly; this.dist = new Int16Array(grid.w * grid.h); this.key = ''; this.t = -1; }
  pass(tx, tz) { const c = this.grid.get(tx, tz); return c === 0 || (this.fly && (c === 3 || c === 2)); }
  build(px, pz) {
    const g = this.grid, W = g.w, H = g.h, d = this.dist;
    d.fill(-1);
    const [sx, sz] = g.toTile(px, pz);
    if (sx < 0 || sz < 0 || sx >= W || sz >= H) return;
    const q = new Int32Array(W * H);
    let qh = 0, qt = 0;
    d[sz * W + sx] = 0; q[qt++] = sz * W + sx;
    while (qh < qt) {
      const i = q[qh++], x = i % W, z = (i / W) | 0, nd = d[i] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + DIRS[k][0], nz = z + DIRS[k][1];
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const j = nz * W + nx;
        if (d[j] >= 0 || !this.pass(nx, nz)) continue;
        d[j] = nd; q[qt++] = j;
      }
    }
  }
  /** Unit direction toward the player along the field from world point (x, z), or null if unreachable. */
  dir(x, z) {
    const g = this.grid, W = g.w, H = g.h, d = this.dist;
    const [tx, tz] = g.toTile(x, z);
    if (tx < 0 || tz < 0 || tx >= W || tz >= H) return null;
    const here = d[tz * W + tx];
    let best = here < 0 ? 1e9 : here, bx = 0, bz = 0;
    for (const [dx, dz] of DIRS) {
      const nx = tx + dx, nz = tz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const v = d[nz * W + nx];
      if (v < 0) continue;
      // no corner cutting through blocked diagonals
      if (dx && dz && (d[tz * W + nx] < 0 || d[nz * W + tx] < 0)) continue;
      const c = v + (dx && dz ? 0.41 : 0);
      if (c < best) { best = c; bx = dx; bz = dz; }
    }
    if (!bx && !bz) return null;
    const l = Math.hypot(bx, bz);
    return { x: bx / l, z: bz / l };
  }
}

/** Field for this world (walkers or flyers), refreshed for the player's current tile. */
export function navField(world, fly = false) {
  const g = world.grid;
  if (!g || typeof g.get !== 'function' || typeof g.toTile !== 'function' || !g.w) return null;
  const nav = world._enemyNav || (world._enemyNav = {});
  const k = fly ? 'fly' : 'walk';
  let f = nav[k];
  if (!f || f.grid !== g) f = nav[k] = new Field(g, fly);
  const p = world.player;
  if (!p) return f;
  const [tx, tz] = g.toTile(p.x, p.z);
  const key = tx + ',' + tz, now = world.time || 0;
  if (key !== f.key && (now - f.t > 0.25 || f.t < 0)) { f.build(p.x, p.z); f.key = key; f.t = now; }
  return f;
}

/** Is world point walkable for this mover? */
export function walkable(world, x, z, fly = false) {
  const g = world.grid;
  if (!g || typeof g.get !== 'function') return true;
  const [tx, tz] = g.toTile(x, z);
  const c = g.get(tx, tz);
  return c === 0 || (fly && (c === 3 || c === 2));
}
