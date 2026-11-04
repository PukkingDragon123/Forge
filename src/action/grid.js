// Collision grid for a room: square tiles (0.5 m) centred on the room origin (x → east, z → south).
//   0 floor · 1 wall · 2 obstacle (blocks walking and shots) · 3 pit (blocks walking, not shots or flyers)
export const FLOOR = 0, WALL = 1, OBSTACLE = 2, PIT = 3;

export class Grid {
  constructor(w = 30, h = 18, tile = 0.5) {
    this.w = w; this.h = h; this.tile = tile;
    this.cells = new Uint8Array(w * h);
    this.ox = 0; this.oz = 0; // world position of the grid centre
  }
  get(tx, tz) { return tx < 0 || tz < 0 || tx >= this.w || tz >= this.h ? WALL : this.cells[tz * this.w + tx]; }
  set(tx, tz, v) { if (tx >= 0 && tz >= 0 && tx < this.w && tz < this.h) this.cells[tz * this.w + tx] = v; }
  toTile(x, z) { return [Math.floor((x - this.ox) / this.tile + this.w / 2), Math.floor((z - this.oz) / this.tile + this.h / 2)]; }
  toWorld(tx, tz) { return [(tx + 0.5 - this.w / 2) * this.tile + this.ox, (tz + 0.5 - this.h / 2) * this.tile + this.oz]; }
  /** Cell at a world point. */
  at(x, z) { const [tx, tz] = this.toTile(x, z); return this.get(tx, tz); }
  /** Does this cell stop a walker (or, with fly, only walls and obstacles)? */
  blocks(v, fly = false) { return v === WALL || v === OBSTACLE || (!fly && v === PIT); }
  /** Does it stop a projectile? */
  blocksShot(v) { return v === WALL || v === OBSTACLE; }
  /** A free floor point near (x, z), searching outward (for spawns and knockback recovery). */
  freeNear(x, z, r = 0.4) {
    const [tx, tz] = this.toTile(x, z);
    for (let d = 0; d < 12; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
      if (this.get(tx + dx, tz + dz) === FLOOR) { const [wx, wz] = this.toWorld(tx + dx, tz + dz); if (this.circleFree(wx, wz, r)) return [wx, wz]; }
    }
    return [x, z];
  }
  circleFree(x, z, r, fly = false) {
    const t = this.tile;
    const [a0, b0] = this.toTile(x - r, z - r), [a1, b1] = this.toTile(x + r, z + r);
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      if (!this.blocks(this.get(a, b), fly)) continue;
      const [cx, cz] = this.toWorld(a, b);
      const nx = Math.max(cx - t / 2, Math.min(x, cx + t / 2)), nz = Math.max(cz - t / 2, Math.min(z, cz + t / 2));
      if ((nx - x) ** 2 + (nz - z) ** 2 < r * r) return false;
    }
    return true;
  }
}
