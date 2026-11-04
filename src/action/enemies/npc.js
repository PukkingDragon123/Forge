// Friendly NPCs (Morel the mushroom guy) for cinematics and the tutorial: a Monster puppet you can walk around,
// point, pose and petrify. Not an enemy (team 'npc', never takes damage). Call npc.update(dt) every frame —
// tickEnemyFx(world, dt) also ticks every NPC spawned into that world, once per frame.
import * as THREE from 'three';
import { buildMonster } from '../../models/monsters.js';
import { manager } from './fx.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class NPC {
  constructor(world, id, x = 0, z = 0, opts = {}) {
    this.world = world; this.id = id; this.team = 'npc';
    this.mon = buildMonster(id);
    this.model = this.mon.group;
    this.x = x; this.z = z; this.facing = opts.face ?? Math.PI; this.faceTo = this.facing;
    this.radius = opts.radius || 0.3; this.speed = opts.speed || 3.2;
    this.path = null; this.anim = 'idle';
    this.model.position.set(x, 0, z);
    this.model.rotation.y = this.facing;
  }
  /** Walk (or run) to a point; onArrive fires once. o: { speed, run, onArrive, then (anim after) } */
  walkTo(x, z, o = {}) {
    this.path = { x, z, speed: o.speed || (o.run ? this.speed * 1.5 : this.speed), onArrive: o.onArrive || null, then: o.then || 'idle' };
    this.play(o.run ? 'run' : 'idle');
    return this;
  }
  stop() { this.path = null; return this; }
  face(target, snap = false) { if (!target) return this; this.faceTo = Math.atan2(target.x - this.x, target.z - this.z); if (snap) this.facing = this.faceTo; return this; }
  /** idle | talk | wave | point | cheer | scared | run | windup | attack | hurt | stun | roar … */
  play(anim, o) { this.anim = anim; this.mon.play(anim, o); return this; }
  petrify(dur = 1.2, onDone) { this.path = null; this.mon.setMove(0); this.mon.petrify ? this.mon.petrify(dur, onDone) : this.mon.setStone(1); return this; }
  /** World position just above the head (dialogue anchor). */
  headPos(out = new THREE.Vector3()) { return out.set(this.x, (this.mon.height || 0.8) + 0.15, this.z); }
  update(dt) {
    const key = this.world.time ?? -1;
    if (this._tick === key && key !== -1) return;
    this._tick = key;
    let speed = 0;
    if (this.path) {
      const P = this.path, dx = P.x - this.x, dz = P.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.06) {
        this.path = null; this.play(P.then);
        if (P.onArrive) P.onArrive(this);
      } else {
        const step = Math.min(d, P.speed * dt);
        const mx = (dx / d) * step, mz = (dz / d) * step;
        const w = this.world;
        if (typeof w.moveCircle === 'function' && !this.ghost) w.moveCircle(this, mx, mz); else { this.x += mx; this.z += mz; }
        this.faceTo = Math.atan2(dx, dz);
        speed = P.speed;
      }
    }
    let dd = this.faceTo - this.facing;
    while (dd > Math.PI) dd -= Math.PI * 2;
    while (dd < -Math.PI) dd += Math.PI * 2;
    this.facing += dd * (1 - Math.exp(-dt * 10));
    this.model.position.set(this.x, 0, this.z);
    this.model.rotation.y = this.facing;
    this.mon.setMove(clamp(speed / 2, 0, 1), speed);
    this.mon.update(dt);
  }
  dispose() { this.mon.dispose(); }
}

/** Spawn a friendly NPC into the world's scene. */
export function spawnNPC(world, id, x, z, opts = {}) {
  const n = new NPC(world, id, x, z, opts);
  if (world.scene && !n.model.parent) world.scene.add(n.model);
  const M = manager(world);
  (M.npcs || (M.npcs = [])).push(n);
  return n;
}
