// Stand-in foes for the dev arena until agent N's brains exist: a training dummy and a simple
// melee/ranged bot driving a real monster model (models/monsters.js) with telegraphed attacks.
import * as THREE from 'three';
import { Entity } from './entity.js';
import * as Mon from '../models/monsters.js';
import * as MD from '../data/monsters.js';

function dummyModel() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#8a6a44', flatShading: true });
  const sack = new THREE.MeshLambertMaterial({ color: '#c8b088', flatShading: true });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), wood); post.position.y = 0.5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.34), sack); body.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.28), sack); head.position.y = 1.12;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.1), wood); arm.position.y = 0.86;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.08, 8), wood); base.position.y = 0.04;
  for (const m of [post, body, head, arm, base]) { m.castShadow = true; g.add(m); }
  const pivot = new THREE.Group(); pivot.add(g);
  return { group: pivot, wob: 0, flash() { this.wob = 1; }, update(dt) { this.wob = Math.max(0, this.wob - dt * 3); g.rotation.z = Math.sin(this.wob * 18) * this.wob * 0.25; } };
}

export class Dummy extends Entity {
  constructor(x, z, o = {}) {
    super({ x, z, team: 'enemy', radius: 0.38, mass: 99, hp: o.hp ?? 300 });
    this.model = dummyModel();
    this.height = 1.2;
    this.chipColors = ['#c8b088', '#a8906a', '#8a6a44'];
    this.mortal = !!o.mortal;
    this.idleT = 0;
  }
  update(h) { this.idleT += h; if (!this.mortal && this.idleT > 2 && this.hp < this.maxHp) this.hp = this.maxHp; }
  hurt() { this.idleT = 0; if (!this.mortal && this.hp <= 1) this.hp = 1; }
}

/** A monster model with a tiny brain: chase → telegraph → lunge (or shoot) → recover. */
export class Bot extends Entity {
  constructor(id, x, z, o = {}) {
    const def = (MD.MONSTERS && MD.MONSTERS[id]) || null;
    super({ x, z, team: 'enemy', radius: 0.42, mass: def && def.tier === 'boss' ? 8 : def && def.tier === 'elite' ? 3 : 1.2, hp: o.hp ?? (def ? Math.round(20 + (def.hp || 3) * 9) : 40) });
    this.id = id; this.def = def;
    this.ranged = o.ranged ?? /archer|spit|wisp|imp|bat/.test(id);
    this.speed = o.speed ?? (this.ranged ? 2.2 : 2.6);
    this.dmg = o.dmg ?? 9;
    let m = null;
    try { if (typeof Mon.buildMonster === 'function' && def) m = Mon.buildMonster(id); } catch (e) { m = null; }
    this.model = m || dummyModel();
    this.height = (m && m.height) || 1;
    if (m && m.bounds) { const s = new THREE.Vector3(); m.bounds.getSize(s); this.radius = Math.max(0.3, Math.min(1.4, Math.max(s.x, s.z) * 0.4)); }
    this.chipColors = def && def.model ? [def.model.body, def.model.belly || def.model.body, def.model.accent || '#ffffff'].filter(Boolean) : ['#8a8a8a'];
    this.mode = 'intro'; this.t = 0; this.cd = 1 + Math.random();
    this.play('intro');
    this.corpseTime = 0.9;
  }
  play(s) { const m = this.model; if (m && m.play) m.play(s); }
  update(h, w) {
    const P = w.player;
    this.t += h; this.cd -= h;
    if (!P || P.dead) { this.vx = this.vz = 0; return; }
    const dx = P.x - this.x, dz = P.z - this.z, d = Math.hypot(dx, dz) || 1;
    if (this.mode === 'intro') { this.vx = this.vz = 0; if (this.t > 0.7) { this.mode = 'chase'; this.play('idle'); } return; }
    if (this.mode === 'chase') {
      this.facing = Math.atan2(dx, dz);
      const want = this.ranged ? (d > 5.5 ? 1 : d < 3.5 ? -1 : 0) : d > 1.3 ? 1 : 0;
      this.vx = (dx / d) * this.speed * want; this.vz = (dz / d) * this.speed * want;
      if (this.cd <= 0 && (this.ranged ? d < 8 && w.lineOfSight(this.x, this.z, P.x, P.z) : d < 2.6)) {
        this.mode = 'wind'; this.t = 0; this.vx = this.vz = 0;
        this.dir = { x: dx / d, z: dz / d };
        this.play('windup');
        if (this.ranged) this.tele = w.telegraph({ shape: 'line', x: this.x, z: this.z, len: 7, width: 0.5, dir: this.dir, dur: 0.55 });
        else this.tele = w.telegraph({ shape: 'line', x: this.x, z: this.z, len: 3.2, width: this.radius * 2 + 0.3, dir: this.dir, dur: 0.6 });
      }
      return;
    }
    if (this.mode === 'wind') {
      this.vx = this.vz = 0;
      if (this.t >= (this.ranged ? 0.55 : 0.6)) {
        this.mode = 'act'; this.t = 0; this.hitP = false;
        this.play('attack');
        if (this.ranged) {
          w.spawnProjectile({ team: 'enemy', x: this.x + this.dir.x * 0.5, z: this.z + this.dir.z * 0.5, y: 0.6, dir: this.dir, speed: 9, radius: 0.2, dmg: this.dmg, kb: 0.6, color: '#c8ff6a', life: 1.2, source: this });
          const au = w.game && w.game.audio; au && au.play('spit', { vol: 0.5 });
        }
      }
      return;
    }
    if (this.mode === 'act') {
      if (!this.ranged && this.t < 0.28) {
        this.vx = this.dir.x * 11; this.vz = this.dir.z * 11;
        if (!this.hitP && !P.dead && Math.hypot(P.x - this.x, P.z - this.z) < this.radius + P.radius + 0.25) { this.hitP = true; w.damage(P, { dmg: this.dmg, kb: 1.2, dir: this.dir, source: this }); }
      } else { this.vx *= 0.8; this.vz *= 0.8; }
      if (this.t > (this.ranged ? 0.45 : 0.75)) { this.mode = 'chase'; this.cd = 1.4 + Math.random() * 1.2; this.play('idle'); }
    }
  }
  hurt(hit) {
    if (hit.heavy && this.mode === 'wind' && this.mass < 3) { this.mode = 'chase'; this.cd = 0.9; if (this.tele) this.tele.done = true; }
    if (this.mode !== 'act') this.play('hurt');
  }
  die(w) {
    this.play('die');
    if (this.tele) this.tele.done = true;
    w.fx.chipsAt(this.x, 0.4, this.z, this.chipColors, 14, { speed: 2.6, up: 3 });
    w.fx.dust(this.x, this.z, 10);
  }
}
