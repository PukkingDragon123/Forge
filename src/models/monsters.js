// Animated voxel monsters & bosses. buildMonster(id) → Monster (see class docs below).
// Models face −X (toward the player on the left), feet at y = 0, 1 unit ≈ 1 m.
import * as THREE from 'three';
import { MONSTERS } from '../data/monsters.js';
import { meshVoxels } from '../gfx/voxel.js';
import { ParticleSystem } from '../gfx/particles.js';
import { clamp, damp, ease } from '../core/math.js';
import { NORMAL_ARCHES } from './monster_normals.js';
import { BOSS_ARCHES } from './monster_bosses.js';

const ARCH = { ...NORMAL_ARCHES, ...BOSS_ARCHES };

// state → duration (seconds). States missing here hold until the next play().
const DUR = { attack: 0.45, multi: 0.9, special: 0.9, hurt: 0.3, die: 1.2, intro: 0.9, roar: 1.4 };
const HOLD = new Set(['idle', 'windup', 'stun', 'die', 'disguise']);

let SEED = 1;

/**
 * Monster
 *  .group             THREE.Group to add to the scene (position/rotate this)
 *  .update(dt)        advance animation
 *  .play(state, {onDone, hits})  idle|windup|attack|multi|special|hurt|stun|die|intro|roar|disguise
 *  .flash(color, t)   hit flash
 *  .setPhase(n)       boss phase visuals (1, 2, 3)
 *  .height            standing height (m)
 *  .hitPoint          local Vector3 (group space) — crit target
 *  .cutPoints         local Vector3[] — harvest slice spots
 *  .mouthPoint        local Vector3 — breath/projectile origin
 *  .dispose()
 */
export class Monster {
  constructor(id) {
    const def = MONSTERS[id];
    if (!def) throw new Error('Unknown monster ' + id);
    this.id = id; this.def = def;
    this.md = def.model;
    this.arch = ARCH[this.md.arch];
    if (!this.arch) throw new Error('No archetype ' + this.md.arch);
    this.boss = def.tier === 'boss';
    this.seed = SEED++;
    this.group = new THREE.Group();
    this.group.name = 'monster:' + id;
    this.root = new THREE.Group();
    this.group.add(this.root);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glowBase = 2.2;
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2), fog: false });
    this.parts = {};
    this.S = this.arch.S || 0.06;
    this.state = 'idle'; this.st = 0; this.t = (this.seed * 1.7) % 10;
    this.env = { wind: 0, strike: 0, hurt: 0, dead: 0, stun: 0, roar: 0, special: 0, intro: 1, multi: 0, disguise: 0 };
    this.hits = 3;
    this.flashT = 0; this.flashDur = 0.1; this.flashColor = new THREE.Color(1, 1, 1);
    this.phase = 1;
    this.hitPoint = new THREE.Vector3(0, 0.5, 0);
    this.mouthPoint = new THREE.Vector3(-0.3, 0.5, 0);
    this.cutPoints = [];
    this.height = 1;
    this.fly = 0; // hover height in metres (flyers)
    this.reach = this.arch.reach ?? 0.35;
    this.emitters = [];
    this.phaseHooks = [];
    this.onDone = null;
    this.scale = this.boss ? 1 : this.md.scale || 1;
    this.arch.build(this, this.md);
    this.root.scale.setScalar(this.scale);
    if (this.emitters.length) {
      this.fx = new ParticleSystem(260, { additive: true });
      this.group.add(this.fx.object);
    }
    this.play(id === 'mimic' ? 'disguise' : 'idle');
    this.update(0);
    this.group.updateMatrixWorld(true);
    this._finalizePoints();
  }

  // ------------------------------------------------------------ building API (used by archetypes)
  /** Mesh a grid as a part on a pivot. pivot: grid coords of the joint; at: voxel units in parent space. */
  part(name, g, pivot, at = [0, 0, 0], parent = 'root', o = {}) {
    const mesh = meshVoxels(g, { size: o.S || this.S, origin: pivot, material: this.mat, jitter: o.jitter ?? 0.07, seed: this.seed * 7 + Object.keys(this.parts).length });
    if (mesh.userData.glow) mesh.userData.glow.material = this.glowMat;
    const p = new THREE.Group();
    p.name = name;
    p.add(mesh);
    const S = o.S || this.S;
    p.position.set(at[0] * S, at[1] * S, at[2] * S);
    if (o.order) p.rotation.order = o.order;
    if (o.rot) p.rotation.set(...o.rot);
    (parent === 'root' ? this.root : this.parts[parent]).add(p);
    this._rest(p);
    this.parts[name] = p;
    return p;
  }
  /** Duplicate an existing part's meshes (shared geometry) at another spot. */
  twin(name, src, at, parent = null, o = {}) {
    const s = this.parts[src];
    const p = new THREE.Group();
    p.name = name;
    for (const c of s.children) {
      if (!c.isGroup || this._isPart(c)) continue;
      // rebuild the mesh container by hand: Object3D.clone() would JSON-serialise userData (which holds meshes)
      const g = new THREE.Group();
      for (const mesh of c.children) {
        const nm = new THREE.Mesh(mesh.geometry, mesh.material);
        nm.castShadow = mesh.castShadow; nm.receiveShadow = mesh.receiveShadow; nm.name = mesh.name;
        g.add(nm);
      }
      p.add(g);
    }
    const S = o.S || this.S;
    p.position.set(at[0] * S, at[1] * S, at[2] * S);
    if (o.rot) p.rotation.set(...o.rot); else p.rotation.copy(s.rotation);
    (parent ? (parent === 'root' ? this.root : this.parts[parent]) : s.parent).add(p);
    this._rest(p);
    this.parts[name] = p;
    return p;
  }
  _isPart(o) { return Object.values(this.parts).includes(o); }
  _rest(p) { p.userData.rp = p.position.clone(); p.userData.rr = p.rotation.clone(); p.userData.rs = p.scale.clone(); }
  P(name) { return this.parts[name]; }
  /** Points in root space (metres, before monster scale). */
  points(o) {
    if (o.hit) this._hit = o.hit;
    if (o.mouth) this._mouth = o.mouth;
    if (o.cuts) this._cuts = o.cuts;
    if (o.height) this._height = o.height;
  }
  /** Particle emitter in root space: {pos:[x,y,z], rate (per s), ...ParticleSystem.emit opts}. */
  emitter(e) { this.emitters.push({ acc: 0, ...e }); }
  _finalizePoints() {
    const s = this.scale;
    const v = (a) => new THREE.Vector3(a[0] * s, a[1] * s + this.fly, -a[2] * s);
    const box = new THREE.Box3().setFromObject(this.root);
    this.height = this._height ? this._height * this.scale + this.fly : Math.max(0.3, box.max.y);
    this.bounds = box;
    if (this._hit) this.hitPoint = v(this._hit); else this.hitPoint.set((box.min.x + box.max.x) / 2, box.max.y * 0.6, 0);
    if (this._mouth) this.mouthPoint = v(this._mouth); else this.mouthPoint.set(box.min.x, box.max.y * 0.6, 0);
    if (this._cuts) this.cutPoints = this._cuts.map(v);
    else {
      this.cutPoints = [];
      for (let i = 0; i < 5; i++) this.cutPoints.push(new THREE.Vector3(box.min.x + ((i + 0.5) / 5) * (box.max.x - box.min.x), box.min.y + (box.max.y - box.min.y) * (0.35 + 0.3 * ((i * 7) % 3) / 2), 0));
    }
  }

  // ------------------------------------------------------------ runtime API
  play(state, o = {}) {
    if (this.state === 'die' && state !== 'die' && state !== 'intro') return;
    this.state = state; this.st = 0;
    this.onDone = o.onDone || null;
    if (o.hits) this.hits = o.hits;
    if (state === 'intro') { this.env.intro = 0; this.env.dead = 0; }
    if (state === 'disguise') this.env.disguise = 1;
    if (state === 'die' && this.arch.onDie) this.arch.onDie(this);
  }
  flash(color = '#ffffff', t = 0.1) {
    this.flashColor.set(color);
    this.flashT = t; this.flashDur = t;
  }
  setPhase(n) {
    this.phase = n;
    const k = this.glowBase + (n - 1) * 1.3;
    this.glowMat.color.setRGB(k, k, k);
    for (const e of this.emitters) e.boost = 1 + (n - 1) * 0.8;
    if (this.arch.phase) this.arch.phase(this, n);
  }
  get introDur() { return this.boss ? 2.6 : DUR.intro; }

  update(dt) {
    this.t += dt;
    this.st += dt;
    const e = this.env, st = this.st, s = this.state;
    const dur = s === 'intro' ? this.introDur : DUR[s];
    // envelopes
    e.wind = damp(e.wind, s === 'windup' ? 1 : 0, s === 'windup' ? 7 : 14, dt);
    e.stun = damp(e.stun, s === 'stun' ? 1 : 0, 8, dt);
    e.dead = s === 'die' ? Math.min(1, st / DUR.die) : damp(e.dead, 0, 6, dt);
    e.disguise = damp(e.disguise, s === 'disguise' ? 1 : 0, 6, dt);
    let strike = 0;
    if (s === 'attack' || s === 'special') {
      const d = s === 'special' ? DUR.special : DUR.attack;
      const k = st / d;
      strike = k < 0.18 ? ease.outCubic(k / 0.18) : k < 0.4 ? 1 : 1 - ease.inOutQuad(clamp((k - 0.4) / 0.6));
    } else if (s === 'multi') {
      const k = clamp(st / DUR.multi);
      strike = Math.abs(Math.sin(k * Math.PI * this.hits)) * (1 - k * 0.3);
    }
    e.strike = damp(e.strike, strike, 30, dt);
    e.special = damp(e.special, s === 'special' ? 1 : 0, 10, dt);
    e.multi = damp(e.multi, s === 'multi' ? 1 : 0, 10, dt);
    e.hurt = s === 'hurt' ? 1 - st / DUR.hurt : damp(e.hurt, 0, 12, dt);
    e.roar = s === 'roar' ? Math.sin(clamp(st / DUR.roar) * Math.PI) : damp(e.roar, 0, 8, dt);
    e.intro = s === 'intro' ? clamp(st / this.introDur) : 1;

    // reset parts to rest
    for (const p of Object.values(this.parts)) {
      p.position.copy(p.userData.rp); p.rotation.copy(p.userData.rr); p.scale.copy(p.userData.rs);
    }
    const r = this.root;
    r.position.set(0, this.fly, 0); r.rotation.set(0, 0, 0); r.scale.setScalar(this.scale);
    const breathe = Math.sin(this.t * 2.2) * 0.02 * (1 - e.dead);
    // generic body language
    r.position.x += -e.strike * this.reach + e.wind * 0.05 + e.hurt * 0.12;
    r.rotation.z += -e.wind * 0.1 + e.strike * 0.14 - e.hurt * 0.12;
    if (e.wind > 0.05) r.position.x += Math.sin(this.t * 60) * 0.006 * e.wind; // trembling telegraph
    if (e.stun > 0.01) { r.rotation.z += Math.sin(this.t * 7) * 0.08 * e.stun; r.rotation.x += Math.cos(this.t * 5) * 0.05 * e.stun; }
    r.scale.y *= 1 + breathe;
    r.scale.x *= 1 - breathe * 0.5;
    if (e.roar > 0) { r.rotation.z -= e.roar * 0.12; r.scale.multiplyScalar(1 + e.roar * 0.04); }

    if (this.arch.anim) this.arch.anim(this, dt);

    // death
    if (e.dead > 0) {
      const d = ease.outBounce(e.dead);
      const mode = this.arch.die || 'tip';
      if (mode === 'tip') { r.rotation.z = -d * 1.45; r.position.y = this.fly * (1 - d) + d * this.height * 0.12 * this.scale * 0; r.position.x += d * 0.1; }
      else if (mode === 'flatten') { r.scale.y = this.scale * (1 - d * 0.55); r.scale.x = this.scale * (1 + d * 0.25); r.scale.z = this.scale * (1 + d * 0.15); }
      else if (mode === 'fall') { r.position.y = this.fly * (1 - ease.inQuad(clamp(e.dead * 1.4))); r.rotation.z = -d * 1.5; }
      else if (mode === 'sink') { r.position.y = -d * this.height * 0.35; r.rotation.z = -d * 0.25; }
      else if (mode === 'kneel') { r.rotation.z = d * 0.35; r.position.y = -d * this.height * 0.18; }
      else if (mode === 'fade') { r.scale.multiplyScalar(Math.max(0.05, 1 - e.dead * 0.95)); r.position.y = this.fly * (1 - d * 0.7); }
    }
    // intro
    if (e.intro < 1) {
      const k = e.intro;
      if (this.arch.intro) this.arch.intro(this, k);
      else if (this.boss) { r.position.y -= (1 - ease.outCubic(k)) * this.height; r.rotation.z += Math.sin(k * 30) * 0.02 * (1 - k); }
      else { const h = Math.sin(k * Math.PI) * 0.35; r.position.y += h; r.scale.multiplyScalar(0.7 + 0.3 * ease.outBack(k)); }
    }

    // mirror in z so each archetype's "F" (attacking) limb sits on the camera side (+z)
    r.scale.z = -Math.abs(r.scale.z);

    // flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / this.flashDur);
      this.mat.emissive.copy(this.flashColor).multiplyScalar(k * 1.2);
    } else this.mat.emissive.setRGB(0, 0, 0);

    // particles
    if (this.fx) {
      const alive = 1 - e.dead * 0.85;
      for (const em of this.emitters) {
        em.acc += dt * em.rate * alive * (em.boost || 1) * (1 + e.roar * 2 + e.special * 2);
        while (em.acc >= 1) {
          em.acc -= 1;
          const p = em.pos;
          const sc = this.scale;
          this.fx.emit({ ...em, pos: [r.position.x + p[0] * sc, r.position.y + p[1] * sc, r.position.z + p[2] * sc], count: 1 });
        }
      }
      this.fx.update(dt);
    }

    if (dur && !HOLD.has(s) && st >= dur) {
      const cb = this.onDone;
      this.onDone = null;
      this.state = 'idle'; this.st = 0;
      if (cb) cb();
    } else if (s === 'die' && st >= DUR.die && this.onDone) {
      const cb = this.onDone; this.onDone = null; cb();
    }
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.mat.dispose(); this.glowMat.dispose();
    if (this.fx) { this.fx.geo.dispose(); this.fx.mat.dispose(); }
    this.group.removeFromParent();
  }
}

export function buildMonster(id) { return new Monster(id); }
export const MONSTER_ARCHETYPES = Object.keys(ARCH);
