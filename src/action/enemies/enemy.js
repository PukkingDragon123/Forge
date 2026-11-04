// The Enemy entity for the real-time game: a voxel Monster puppet driven by a brain (brains.js) on the engine
// contract (docs/REDESIGN.md §6). It owns locomotion (flow-field steering, separation, knockback), spawn
// entrances, hit reactions (flash, flinch, poise/stagger), status effects and death → petrify into a statue
// that stays in the room (event 'enemyKilled' { enemy, def, id, x, z, monster, statue, elite, boss }).
import * as THREE from 'three';
import * as ENG from '../index.js';
import { MONSTERS } from '../../data/monsters.js';
import { buildMonster } from '../../models/monsters.js';
import { enemyStats } from './stats.js';
import { navField, walkable } from './nav.js';
import { manager, updateEnemyFx, puff, telegraph } from './fx.js';

const Base = typeof ENG.Entity === 'function' ? ENG.Entity : class {};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FLY_GAITS = new Set(['glowwisp', 'sprite', 'prismwisp', 'wraith', 'lanternwing', 'flameskull', 'gargoyle']);

/** Keep the shared enemy effects (telegraphs, clouds, rings, statues) ticking once per world frame. */
export function tickEnemyFx(world, dt) {
  const M = manager(world);
  const key = world.time ?? -1;
  if (M.frame === key && key !== -1) return;
  M.frame = key;
  updateEnemyFx(world, dt);
  // statues of the fallen keep animating (petrify sweep, crack glow) even if the engine dropped them
  if (M.statues) for (const s of M.statues) if (s.mon._tick !== key) { s.mon._tick = key; s.mon.update(dt); }
  if (M.statues) M.statues = M.statues.filter((s) => !s.gone && !(s.mon.stone >= 1 && !s.mon._stoneAnim && s.mon.shattered && s.mon.shattered.done));
}

export class Enemy extends Base {
  constructor(world, id, x, z, opts = {}) {
    super();
    const def = MONSTERS[id];
    if (!def) throw new Error('Unknown enemy ' + id);
    this.world = world; this.id = id; this.def = def; this.team = 'enemy';
    this.boss = def.tier === 'boss';
    this.elite = !!opts.elite || def.tier === 'elite';
    this.eliteVariant = !!opts.elite && def.tier === 'normal';
    const st = enemyStats(def, opts.stage ?? world.stage ?? 0, !!opts.elite);
    this.hp = this.maxHp = st.hp; this.dmg = st.dmg; this.armor = st.armor; this.speed = st.speed;
    this.poiseMax = this.poise = st.poise; this.kbTake = st.kbTake; this.stage = st.stage;
    this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.kx = 0; this.kz = 0;
    this.want = { x: 0, z: 0 };
    this.status = this.status || {};
    this.invuln = 0; this.dead = false; this.lift = 0; this.slowMul = 1;
    // the puppet
    this.mon = buildMonster(id);
    this.model = this.mon.group;
    this.model.userData.entity = this;
    if (this.eliteVariant) this.mon.group.scale.setScalar(1.18);
    const b = this.mon.bounds;
    const half = b ? Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.5 * (this.eliteVariant ? 1.18 : 1) : 0.4;
    this.radius = opts.radius || def.radius || clamp(half * 0.72, 0.28, 2.4);
    this.height = (this.mon.height || 1) * (this.eliteVariant ? 1.18 : 1);
    this.fly = !!(def.ai && def.ai.flies) || FLY_GAITS.has(def.model && def.model.arch) || (this.mon.fly || 0) > 0;
    this.facing = Math.PI; this.faceTo = this.facing;
    if (opts.face !== undefined) this.facing = this.faceTo = opts.face;
    this._lastHp = this.hp;
    // entrance
    this.spawnKind = opts.spawn || def.spawn || 'ground';
    this.spawnDelay = opts.delay || 0;
    this.spawnT = 0; this.spawnDur = this.boss ? 1.6 : this.spawnKind === 'drop' ? 0.9 : 0.65;
    this.spawning = !opts.instant;
    if (this.spawning) { this.invuln = 99; this.model.visible = this.spawnDelay <= 0; }
    // elite aura (gold ring under its feet) — easy to read from the top-down camera
    if (this.elite && !this.boss) this._aura(this.eliteVariant ? '#ffcc4a' : '#c87aff');
    this.brain = null; // set by spawnEnemy (brains.js)
    this.sync(0);
  }
  _aura(col) {
    const g = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.aura = new THREE.Mesh(g, m);
    this.aura.scale.setScalar(this.radius * 1.35 / (this.eliteVariant ? 1.18 : 1));
    this.aura.position.y = 0.04;
    this.model.add(this.aura);
  }

  // ------------------------------------------------------------------ helpers for brains
  get world_() { return this.world; }
  get player() { return this.world.player; }
  distTo(o) { return o ? Math.hypot(o.x - this.x, o.z - this.z) : 1e9; }
  dirTo(o) { const dx = o.x - this.x, dz = o.z - this.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; }
  face(o, snap = false) { if (!o) return; this.faceTo = Math.atan2(o.x - this.x, o.z - this.z); if (snap) this.facing = this.faceTo; }
  faceDir(d, snap = false) { this.faceTo = Math.atan2(d.x, d.z); if (snap) this.facing = this.faceTo; }
  get faceVec() { return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }
  /** Desired velocity toward a target along the nav field (falls back to a straight line). */
  steer(target, speed, opts = {}) {
    const w = this.world;
    let d = null;
    if (target === w.player && !opts.direct) { const f = navField(w, this.fly); if (f) d = f.dir(this.x, this.z); }
    if (!d) d = this.dirTo(target);
    // separation from other enemies so packs fan out instead of stacking
    let sx = 0, sz = 0;
    for (const o of w.enemies || []) {
      if (o === this || o.dead || !o.radius) continue;
      const dx = this.x - o.x, dz = this.z - o.z, dd = Math.hypot(dx, dz), r = this.radius + o.radius + 0.15;
      if (dd < r && dd > 1e-4) { sx += (dx / dd) * (r - dd); sz += (dz / dd) * (r - dd); }
    }
    this.want.x = d.x * speed + sx * 2.5;
    this.want.z = d.z * speed + sz * 2.5;
    if (!opts.noFace) this.faceDir(d);
  }
  stop() { this.want.x = 0; this.want.z = 0; }
  hitPlayer(o = {}) {
    const w = this.world, p = w.player;
    if (!p || p.dead || typeof w.damage !== 'function') return 0;
    const d = o.dir || this.dirTo(p);
    return w.damage(p, { dmg: Math.round((o.mul ?? 1) * this.dmg), kb: o.kb ?? 1, dir: d, stun: o.stun, element: o.element, status: o.status, source: this, tag: o.tag });
  }
  tele(o) { const h = telegraph(this.world, o); (this._tele || (this._tele = [])).push(h); return h; }
  clearTele() { if (this._tele) for (const h of this._tele) h.cancel && h.cancel(); this._tele = []; }

  // ------------------------------------------------------------------ update
  update(dt, world = this.world) {
    tickEnemyFx(world, dt);
    const mon = this.mon;
    if (this.dead) { if (mon._tick !== world.time) { mon._tick = world.time; mon.update(dt); } return; }
    if (this.spawning) { this.updateSpawn(dt); return; }
    // damage the engine applied without calling hurt() still gets a reaction
    if (this.hp < this._lastHp && !this._hurtFrame) this.react({ dmg: this._lastHp - this.hp }, this._lastHp - this.hp);
    this._lastHp = this.hp; this._hurtFrame = false;
    if (this.hp <= 0) { this.die(); return; }
    if (this.invuln > 0 && this.invuln < 90) this.invuln = Math.max(0, this.invuln - dt);
    // status: frozen / stunned lose their turn, slowed move and act at half pace
    const S = this.status || {};
    const held = (S.freeze > 0) || (S.stun > 0) || this.staggerT > 0;
    this.slowMul = S.slow > 0 || S.freeze > 0 ? 0.5 : 1;
    if (this.staggerT > 0) this.staggerT -= dt;
    this.stop();
    if (!held && this.brain) this.brain.update(dt * this.slowMul);
    else if (held && this.brain && this.brain.onHeld) this.brain.onHeld(dt);
    // integrate: brain's desired velocity (snappy) + knockback (decays fast)
    const a = 1 - Math.exp(-dt * 14);
    this.vx += (this.want.x * this.slowMul - this.vx) * a;
    this.vz += (this.want.z * this.slowMul - this.vz) * a;
    const kd = Math.exp(-dt * 9);
    this.kx *= kd; this.kz *= kd;
    this.move((this.vx + this.kx) * dt, (this.vz + this.kz) * dt);
    this.sync(dt);
    const sp = Math.hypot(this.vx, this.vz);
    mon.setMove(clamp(sp / Math.max(0.5, this.speed), 0, 1), sp);
    if (mon._tick !== world.time) { mon._tick = world.time; mon.update(dt * (S.freeze > 0 ? 0.1 : this.slowMul)); }
    if (this.aura) { this.aura.rotation.y += dt * 1.5; this.aura.material.opacity = 0.4 + Math.sin((world.time || 0) * 4) * 0.15; }
  }
  /** Move with collision (engine grid), returns the fraction actually travelled. */
  move(dx, dz) {
    if (!dx && !dz) return 1;
    const w = this.world, x0 = this.x, z0 = this.z;
    if (typeof w.moveCircle === 'function' && !this.ghost) w.moveCircle(this, dx, dz);
    else { this.x += dx; this.z += dz; }
    if (!this.ghost && !this.fly && !walkable(w, this.x, this.z, false)) { /* engine handles pits; keep as is */ }
    const want = Math.hypot(dx, dz), got = Math.hypot(this.x - x0, this.z - z0);
    return want > 1e-6 ? got / want : 1;
  }
  sync(dt) {
    let d = this.faceTo - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * (dt ? 1 - Math.exp(-dt * (this.boss ? 6 : 12)) : 1);
    const g = this.model;
    g.position.set(this.x, this.lift, this.z);
    g.rotation.y = this.facing;
  }

  // ------------------------------------------------------------------ entrances
  updateSpawn(dt) {
    const w = this.world, mon = this.mon;
    if (this.spawnDelay > 0) {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) this.model.visible = true; else return;
    }
    if (this.spawnT === 0) this.beginSpawn();
    this.spawnT += dt;
    const k = clamp(this.spawnT / this.spawnDur, 0, 1);
    const K = this.spawnKind;
    if (K === 'drop') {
      const fall = clamp((this.spawnT - 0.35) / 0.4, 0, 1);
      this.lift = (1 - fall * fall) * 7;
      if (fall >= 1 && !this._landed) { this._landed = true; this.lift = 0; puff(w, this.x, this.z, '#d8c8a8', 14); w.shake && w.shake(this.boss ? 0.8 : 0.15); w.audio && 0; }
    } else if (K === 'ground' || K === 'burrow') {
      this.lift = -(1 - Math.sin(k * Math.PI / 2)) * this.height * 0.9;
    } else if (K === 'spores') {
      this.model.scale.setScalar((this.eliteVariant ? 1.18 : 1) * (0.2 + 0.8 * Math.min(1, k * 1.3)) * (1 + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.15));
    }
    this.sync(dt);
    mon.update(dt);
    if (k >= 1) {
      this.spawning = false; this.invuln = 0; this.lift = 0;
      if (K === 'spores') this.model.scale.setScalar(this.eliteVariant ? 1.18 : 1);
      if (this.brain && this.brain.onSpawned) this.brain.onSpawned();
    }
  }
  beginSpawn() {
    const w = this.world, p = w.player;
    if (p) this.face(p, true);
    this.sync(0);
    const K = this.spawnKind;
    if (K === 'drop') { this.lift = 7; this.tele({ shape: 'circle', x: this.x, z: this.z, r: this.radius * 1.4, dur: 0.75, color: '#ffffff' }); }
    if (K === 'spores') { puff(w, this.x, this.z, '#bfffd8', 16); this.model.scale.setScalar(0.2); }
    if (K === 'ground' || K === 'burrow') { puff(w, this.x, this.z, '#a08a6a', 14); }
    this.mon.play('intro');
    sfx(w, this.boss ? 'boss_roar' : K === 'spores' ? 'spore_pop' : 'dirt_burst', { vol: 0.5 });
  }

  // ------------------------------------------------------------------ getting hit
  /** Engine hook (world.damage → target.hurt): flash, flinch, knockback, poise. */
  hurt(hit = {}, world = this.world) {
    if (this.dead) return;
    this._hurtFrame = true;
    this.react(hit, hit.dmg || 0);
    this._lastHp = this.hp;
  }
  /** Damage multiplier the engine may ask for (shells, burrowed, entrances). */
  damageMul(hit) {
    if (this.spawning || this.invuln > 0) return 0;
    return this.brain && this.brain.damageMul ? this.brain.damageMul(hit) : 1;
  }
  react(hit, dmg) {
    const mon = this.mon;
    mon.flash(hit && hit.crit ? '#ffe08a' : '#ffffff', 0.09);
    if (hit && hit.dir) {
      const kb = (hit.kb ?? 0.8) * this.kbTake;
      this.kx += hit.dir.x * kb * 9; this.kz += hit.dir.z * kb * 9;
    }
    // light enemies flinch on every hit (interrupting a wind-up); elites and bosses only when poise breaks
    if (this.poiseMax <= 0) {
      if (this.brain && this.brain.interrupt) this.brain.interrupt(hit);
      if (mon.state === 'idle' || mon.state === 'windup') mon.play('hurt');
    } else {
      this.poise -= dmg;
      if (this.poise <= 0) {
        this.poise = this.poiseMax;
        this.staggerT = this.boss ? 1.1 : 0.9;
        if (this.brain && this.brain.interrupt) this.brain.interrupt(hit, true);
        mon.play('stun');
        sfx(this.world, 'stagger', { vol: 0.6 });
      }
    }
    if (this.brain && this.brain.onHurt) this.brain.onHurt(hit, dmg);
  }

  // ------------------------------------------------------------------ death → statue
  die() {
    if (this.dead) return;
    this.dead = true; this.hp = 0;
    const w = this.world, mon = this.mon;
    this.clearTele();
    if (this.brain && this.brain.onDeath) this.brain.onDeath();
    this.stop(); this.vx = this.vz = 0; this.lift = 0; this.sync(0);
    mon.setMove(0);
    mon.flash('#ffffff', 0.18);
    if (this.aura) this.aura.visible = false;
    const dur = this.boss ? 1.8 : this.elite ? 0.8 : 0.55;
    if (this.boss) { w.slowmo && w.slowmo(0.3, 1.1); w.shake && w.shake(1.4); w.flash && w.flash('#ffffff', 0.5); }
    if (mon.petrify) mon.petrify(dur); else if (mon.setStone) mon.setStone(1);
    sfx(w, 'petrify', { vol: this.boss ? 1 : 0.6 });
    const M = manager(w);
    (M.statues || (M.statues = [])).push({ mon, enemy: this });
    this.statue = mon;
    if (!this._killEmitted) {
      this._killEmitted = true;
      const ev = { enemy: this, def: this.def, id: this.id, x: this.x, z: this.z, monster: mon, statue: mon, elite: this.elite, boss: this.boss };
      if (typeof w.emit === 'function') w.emit('enemyKilled', ev);
    }
  }
  dispose() { this.clearTele(); this.mon.dispose(); }
}

export function sfx(world, name, o) {
  const a = world.game && world.game.audio;
  if (a && a.play) try { a.play(name, o); } catch (e) { /* missing sound */ }
}
