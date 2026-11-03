// PLACEHOLDER (owner: agent P) — action engine. Contract: docs/REDESIGN.md §6. Replace in place.
import * as THREE from 'three';

export class Grid {
  constructor(w = 30, h = 18, tile = 0.5) { this.w = w; this.h = h; this.tile = tile; this.cells = new Uint8Array(w * h); }
  get(tx, tz) { return tx < 0 || tz < 0 || tx >= this.w || tz >= this.h ? 1 : this.cells[tz * this.w + tx]; }
  toTile(x, z) { return [Math.floor(x / this.tile + this.w / 2), Math.floor(z / this.tile + this.h / 2)]; }
  toWorld(tx, tz) { return [(tx + 0.5 - this.w / 2) * this.tile, (tz + 0.5 - this.h / 2) * this.tile]; }
}
export class Entity {
  constructor() { this.x = 0; this.z = 0; this.vx = 0; this.vz = 0; this.radius = 0.4; this.team = 'enemy'; this.hp = 10; this.maxHp = 10; this.dead = false; this.invuln = 0; this.status = {}; this.model = null; this.facing = 0; }
  update() {} hurt() {}
}
export class HadesCam {
  constructor(opts = {}) { this.camera = new THREE.PerspectiveCamera(opts.fov || 32, 16 / 9, 0.1, 200); this.camera.position.set(0, 14, 11); this.camera.lookAt(0, 0, 0); }
  follow() {} setBounds() {} shake() {} punch() {} zoomTo() {} release() {} update() {}
}
export class Player extends Entity { constructor(world, charId) { super(); this.team = 'player'; this.charId = charId; this.dashCharges = 2; this.skillCd = [0, 0]; } }
export class ActionWorld {
  constructor(game, opts = {}) {
    this.game = game; this.room = opts.room || null; this.grid = this.room ? this.room.grid : new Grid();
    this.scene = opts.scene || new THREE.Scene(); this.cam = opts.cam || new HadesCam();
    this.player = null; this.enemies = []; this.projectiles = []; this.pickups = []; this.interactables = []; this.time = 0; this._ev = {};
    this.fx = { slash() {}, spark() {}, ring() {}, number() {}, dust() {}, decal() {} };
  }
  add(e) { (e.team === 'enemy' ? this.enemies : []).push(e); return e; }
  remove(e) { this.enemies = this.enemies.filter((x) => x !== e); }
  update(dt) { this.time += dt; }
  hitStop() {} slowmo() {} shake() {} flash() {}
  moveCircle(e, dx, dz) { e.x += dx; e.z += dz; }
  queryCircle() { return []; } nearestEnemy() { return null; } lineOfSight() { return true; }
  damage(t, hit) { t.hp -= hit.dmg; return hit.dmg; }
  spawnProjectile() { return null; } telegraph() { return null; }
  on(ev, fn) { (this._ev[ev] || (this._ev[ev] = [])).push(fn); } emit(ev, d) { for (const f of this._ev[ev] || []) f(d); }
}
