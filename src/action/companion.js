// Followers: Pip trots after the player, sniffs at interactables (veins, statues) and barks at foes.
// Not solid, never targeted. Usage: world.add(new PetFollower(world, buildPet()))
import { Entity } from './entity.js';
import { tryPlay } from './player.js';

export class PetFollower extends Entity {
  constructor(world, model, opts = {}) {
    const P = world.player;
    super({ x: P ? P.x - 0.8 : 0, z: P ? P.z + 0.6 : 0, team: 'ally', radius: 0.2, mass: 0.5 });
    this.model = model;
    this.solid = false; this.untargetable = true; this.moveSelf = true;
    this.speed = opts.speed ?? 6.2;
    this.barkT = 0; this.sniffT = 0; this.lockT = 0;
    this.height = 0.4;
  }
  update(h, w) {
    const P = w.player;
    if (!P) return;
    // heel spot: behind and to the left of the player's facing; sniff at a nearby interactable
    let tx = P.x - Math.sin(P.facing) * 0.9 - Math.cos(P.facing) * 0.5, tz = P.z - Math.cos(P.facing) * 0.9 + Math.sin(P.facing) * 0.5;
    const it = P.interactTarget || w.interactables.find((i) => i.enabled !== false && Math.hypot(i.x - P.x, i.z - P.z) < 3.5);
    if (it && !w.enemies.length) { tx = it.x + 0.6; tz = it.z + 0.5; }
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const sp = d > 0.25 ? Math.min(this.speed * (d > 4 ? 1.5 : 1), d * 6) : 0;
    this.vx = d > 0.01 ? (dx / d) * sp : 0; this.vz = d > 0.01 ? (dz / d) * sp : 0;
    this.tx = tx; this.tz = tz;
    if (this.model && this.model.follow) { /* the pet walks itself in sync() */ }
    else if (d > 9) { this.x = P.x - 0.6; this.z = P.z + 0.6; }
    else w.moveCircle(this, this.vx * h, this.vz * h);
    if (sp > 0.3) this.facing = Math.atan2(this.vx, this.vz);
    else if (it && !w.enemies.length) this.facing = Math.atan2(it.x - this.x, it.z - this.z);
    // barks at the nearest foe now and then
    this.barkT -= h;
    const foe = w.nearestEnemy(this.x, this.z, 5);
    if (foe && this.barkT <= 0) {
      this.barkT = 3 + Math.random() * 3;
      this.facing = Math.atan2(foe.x - this.x, foe.z - this.z);
      tryPlay(this.model, ['bark']); this.lockT = 1.0;
      const au = w.game && w.game.audio; au && au.play('pip_bark', { vol: 0.35, pitch: 1 + Math.random() * 0.2 });
    }
    if (this.lockT > 0) this.lockT -= h;
    this.mode = sp > 0.3 ? (sp > 4 ? 'run' : 'walk') : it && !w.enemies.length ? 'sniff' : 'idle';
  }
  sync(dt) {
    const o = this.obj;
    if (!o) return;
    const m0 = this.model;
    if (m0 && m0.follow && this.tx !== undefined) {
      const w = this.world, P = w && w.player;
      if (P && Math.hypot(P.x - o.position.x, P.z - o.position.z) > 9) o.position.set(P.x - 0.6, 0, P.z + 0.6);
      const collide = (x, z) => { const e = { x, z, radius: 0.18, fly: false }; if (w) w.resolve(e); return [e.x, e.z]; };
      if (this.lockT > 0) m0.update(dt);
      else m0.follow(this.tx, this.tz, dt, { stop: 0.35, runAt: 1.4, collide, idle: this.mode === 'sniff' ? 'sniff' : 'idle' });
      this.x = o.position.x; this.z = o.position.z;
      return;
    }
    o.position.set(this.x, 0, this.z);
    o.rotation.y = this.facing;
    const m = this.model;
    if (m && m.play && !(this.lockT > 0)) tryPlay(m, [this.mode, 'idle'], { restart: false });
    if (m && m.update) m.update(dt);
  }
}
