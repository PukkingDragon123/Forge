// The Enemy entity for the real-time game: a voxel Monster puppet driven by a brain (brains.js), on P's
// engine (src/action: Entity / ActionWorld). The world steps update(h) at 60 Hz (brain + steering → vx/vz;
// the world moves us, adds knockback kbx/kbz and resolves collisions) and calls sync(dt) every rendered frame
// (facing, lift, gait, the puppet's animation). Hits arrive through world.damage → hurt(); world.kill → die()
// petrifies the body into a statue that stays in the room (keepModel). After death `enemy.statue` is the
// Monster to mine (stoneCracks / crackAt / shatter); it keeps animating via the per-world enemy ticker.
import * as THREE from 'three';
import * as ENG from '../index.js';
import { MONSTERS } from '../../data/monsters.js';
import { buildMonster } from '../../models/monsters.js';
import { enemyStats } from './stats.js';
import { navField } from './nav.js';
import { manager, updateEnemyFx, puff, telegraph } from './fx.js';

const Base = typeof ENG.Entity === 'function' ? ENG.Entity : class { constructor() { this.status = {}; this.kbx = 0; this.kbz = 0; this.y = 0; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FLY_GAITS = new Set(['glowwisp', 'sprite', 'prismwisp', 'wraith', 'lanternwing', 'flameskull', 'gargoyle']);

/** One ticker per world (FX layer, every rendered frame): telegraphs, clouds, rings, statues, NPCs. */
export function ensureTicker(world) {
  const M = manager(world);
  if (M.ticker || !world.fx || typeof world.fx.timed !== 'function') return;
  const holder = new THREE.Group();
  let last = 0;
  M.ticker = world.fx.timed(holder, 1e9, (k, it) => { const dt = it.t - last; last = it.t; if (dt > 0) tickEnemyFx(world, dt); });
}
/** Advance the shared enemy effects (safe to call more than once a frame: guarded). */
export function tickEnemyFx(world, dt) {
  const M = manager(world);
  M.frameN = (M.frameN || 0) + 1;
  updateEnemyFx(world, dt);
  // statues of the fallen keep animating (petrify sweep, crack glow, shudder)
  if (M.statues) {
    for (const s of M.statues) s.mon.update(dt);
    M.statues = M.statues.filter((s) => !s.gone && !(s.mon.shattered && s.mon.shattered.done));
  }
  if (M.npcs) for (const n of M.npcs) n.update(dt);
}

export class Enemy extends Base {
  constructor(world, id, x, z, opts = {}) {
    super({ team: 'enemy' });
    const def = MONSTERS[id];
    if (!def) throw new Error('Unknown enemy ' + id);
    this.world = world; this.id = id; this.def = def; this.team = 'enemy';
    this.boss = def.tier === 'boss';
    this.elite = !!opts.elite || def.tier === 'elite';
    this.eliteVariant = !!opts.elite && def.tier === 'normal';
    const st = enemyStats(def, opts.stage ?? world.stage ?? 0, !!opts.elite);
    this.hp = this.maxHp = st.hp; this.dmg = st.dmg; this.armor = st.armor; this.speed = st.speed;
    this.poiseMax = this.poise = st.poise; this.stage = st.stage;
    this.mass = this.boss ? 12 : def.tier === 'elite' ? 3 : this.eliteVariant ? 2 : 1;
    this.x = x; this.z = z; this.vx = 0; this.vz = 0; this.kbx = 0; this.kbz = 0; this.y = 0;
    this.want = { x: 0, z: 0 };
    this.status = this.status || {};
    this.invuln = 0; this.dead = false; this.slowMul = 1; this.staggerT = 0;
    // the puppet (model = the Monster: the engine flashes it and finds its group through .obj)
    this.mon = buildMonster(id);
    this.model = this.mon;
    this.g = this.mon.group;
    this.g.userData.entity = this;
    this.baseScale = this.eliteVariant ? 1.18 : 1;
    if (this.baseScale !== 1) this.g.scale.setScalar(this.baseScale);
    const b = this.mon.bounds;
    const half = b ? Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.5 * this.baseScale : 0.4;
    this.radius = opts.radius || def.radius || clamp(half * 0.72, 0.28, 2.4);
    this.height = (this.mon.height || 1) * this.baseScale;
    this.fly = !!(def.ai && def.ai.flies) || FLY_GAITS.has(def.model && def.model.arch) || (this.mon.fly || 0) > 0;
    this.chipColors = [def.model.body, def.model.accent || def.model.belly, def.model.cap || def.model.body].filter(Boolean);
    this.sparkColor = def.model.accent || '#ffd8a0';
    this.facing = Math.PI; this.faceTo = this.facing;
    if (opts.face !== undefined) this.facing = this.faceTo = opts.face;
    this.keepModel = true; // our statue stays after death
    // entrance
    this.spawnKind = opts.spawn || def.spawn || 'ground';
    this.spawnDelay = opts.delay || 0;
    this.spawnT = 0; this.spawnDur = this.boss ? 1.6 : this.spawnKind === 'drop' ? 0.9 : 0.65;
    this.spawning = !opts.instant;
    if (this.spawning) { this.untargetable = true; this.solid = false; this.g.visible = this.spawnDelay <= 0; }
    if (this.elite && !this.boss) this._aura(this.eliteVariant ? '#ffcc4a' : '#c87aff');
    this.brain = null; // set by spawnEnemy (brains.js)
    this.sync(0);
    ensureTicker(world);
  }
  _aura(col) {
    const g = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.aura = new THREE.Mesh(g, m);
    this.aura.scale.setScalar((this.radius * 1.35) / this.baseScale);
    this.aura.position.y = 0.04;
    this.g.add(this.aura);
  }

  // ------------------------------------------------------------------ helpers for brains
  get player() { return this.world.player; }
  distTo(o) { return o ? Math.hypot(o.x - this.x, o.z - this.z) : 1e9; }
  dirTo(o) { const dx = o.x - this.x, dz = o.z - this.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; }
  face(o, snap = false) { if (!o) return; this.faceTo = Math.atan2(o.x - this.x, o.z - this.z); if (snap) this.facing = this.faceTo; }
  faceDir(d, snap = false) { this.faceTo = Math.atan2(d.x, d.z); if (snap) this.facing = this.faceTo; }
  get faceVec() { return { x: Math.sin(this.faceTo), z: Math.cos(this.faceTo) }; }
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
  /** Move directly this step (dashes, leaps, charges); returns the fraction actually travelled. */
  move(dx, dz) {
    this.vx = 0; this.vz = 0; this.want.x = 0; this.want.z = 0; this._moved = true;
    if (!dx && !dz) return 1;
    const w = this.world, x0 = this.x, z0 = this.z;
    if (typeof w.moveCircle === 'function' && !this.ghost) w.moveCircle(this, dx, dz);
    else { this.x += dx; this.z += dz; }
    const want = Math.hypot(dx, dz), got = Math.hypot(this.x - x0, this.z - z0);
    return want > 1e-6 ? got / want : 1;
  }
  hitPlayer(o = {}) {
    const w = this.world, p = w.player;
    if (!p || p.dead || typeof w.damage !== 'function') return 0;
    const d = o.dir || this.dirTo(p);
    return w.damage(p, { dmg: Math.round((o.mul ?? 1) * this.dmg), kb: o.kb ?? 1, dir: d, stun: o.stun, element: o.element, status: o.status, source: this, tag: o.tag, heavy: (o.mul ?? 1) >= 1.3 });
  }
  tele(o) { const h = telegraph(this.world, o); (this._tele || (this._tele = [])).push(h); return h; }
  clearTele() { if (this._tele) for (const h of this._tele) h.cancel && h.cancel(); this._tele = []; }

  // ------------------------------------------------------------------ simulation step (60 Hz)
  update(h, world = this.world) {
    if (this.dead) return;
    if (!world._enemyFx || !world._enemyFx.ticker) tickEnemyFx(world, h); // no FX layer: tick here
    if (this.spawning) { this.stepSpawn(h); return; }
    if (this.hp <= 0) return;
    this.slowMul = (this.status.slow || 0) > 0 ? 0.5 : 1;
    if (this.staggerT > 0) { this.staggerT -= h; this.stop(); }
    else { this.stop(); if (this.brain) this.brain.update(h * this.slowMul); }
    // smooth toward the brain's desired velocity; the world applies it (× status speed) plus knockback
    const a = 1 - Math.exp(-h * 14);
    if (!this._moved) { this.vx += (this.want.x - this.vx) * a; this.vz += (this.want.z - this.vz) * a; }
    this._moved = false;
  }

  // ------------------------------------------------------------------ rendered frame
  sync(dt) {
    let d = this.faceTo - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * (dt ? 1 - Math.exp(-dt * (this.boss ? 6 : 12)) : 1);
    const g = this.g;
    g.position.set(this.x, this.y, this.z);
    g.rotation.y = this.facing;
    if (this.dead || !dt) return;
    const sp = Math.hypot(this.vx, this.vz);
    this.mon.setMove && this.mon.setMove(clamp(sp / Math.max(0.5, this.speed), 0, 1), sp);
    this.mon.update(dt);
    if (this.aura) { this.aura.rotation.y += dt * 1.5; this.aura.material.opacity = 0.4 + Math.sin((this.world.time || 0) * 4) * 0.15; }
  }

  // ------------------------------------------------------------------ entrances
  stepSpawn(h) {
    const w = this.world;
    if (this.spawnDelay > 0) {
      this.spawnDelay -= h;
      if (this.spawnDelay <= 0) this.g.visible = true; else return;
    }
    if (this.spawnT === 0) this.beginSpawn();
    this.spawnT += h;
    const k = clamp(this.spawnT / this.spawnDur, 0, 1);
    const K = this.spawnKind;
    if (K === 'drop') {
      const fall = clamp((this.spawnT - 0.35) / 0.4, 0, 1);
      this.y = (1 - fall * fall) * 7;
      if (fall >= 1 && !this._landed) { this._landed = true; this.y = 0; puff(w, this.x, this.z, '#d8c8a8', 14); w.shake && w.shake(this.boss ? 0.8 : 0.15); }
    } else if (K === 'ground' || K === 'burrow') {
      this.y = -(1 - Math.sin((k * Math.PI) / 2)) * this.height * 0.9;
    } else if (K === 'spores') {
      const s = Math.min(1, k * 1.3);
      this.g.scale.setScalar(this.baseScale * (0.2 + 0.8 * s) * (1 + Math.sin(s * Math.PI) * 0.15));
    }
    if (k >= 1) {
      this.spawning = false; this.untargetable = false; this.solid = true; this.y = 0;
      this.g.scale.setScalar(this.baseScale);
      if (this.brain && this.brain.onSpawned) this.brain.onSpawned();
    }
  }
  beginSpawn() {
    const w = this.world, p = w.player;
    if (p) this.face(p, true);
    const K = this.spawnKind;
    if (K === 'drop') { this.y = 7; this.tele({ shape: 'circle', x: this.x, z: this.z, r: this.radius * 1.4, dur: 0.75, color: '#ffffff' }); }
    if (K === 'spores') { puff(w, this.x, this.z, '#bfffd8', 16); this.g.scale.setScalar(0.2 * this.baseScale); }
    if (K === 'ground' || K === 'burrow') puff(w, this.x, this.z, '#a08a6a', 14);
    this.mon.play('intro');
    sfx(w, this.boss ? 'boss_roar' : K === 'spores' ? 'spore_pop' : 'dirt_burst', { vol: 0.5 });
  }

  // ------------------------------------------------------------------ getting hit (world.damage → hurt, hp already reduced)
  hurt(hit = {}, world = this.world, dmg = hit.dmg || 0) {
    if (this.dead) return;
    const mon = this.mon;
    if (!world || typeof world.damage !== 'function') mon.flash(hit.crit ? '#ffe08a' : '#ffffff', 0.09);
    if (hit.tag === 'dot') return;
    // light enemies flinch on every hit (cancelling a wind-up); elites and bosses only when poise breaks
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
        if (this.world.fx && this.world.fx.number) this.world.fx.number(this.x, this.height + 0.2, this.z, 'BROKEN', 'status', { color: '#ffe85a' });
      }
    }
    if (this.brain && this.brain.onHurt) this.brain.onHurt(hit, dmg);
  }

  // ------------------------------------------------------------------ death → statue (called by world.kill)
  die() {
    if (this._died) return;
    this._died = true;
    this.dead = true; this.hp = 0;
    const w = this.world, mon = this.mon;
    this.clearTele();
    if (this.brain && this.brain.onDeath) this.brain.onDeath();
    this.vx = this.vz = 0; this.kbx = this.kbz = 0; this.y = 0;
    this.untargetable = false; this.g.visible = true;
    this.g.position.set(this.x, 0, this.z); this.g.rotation.y = this.facing;
    mon.setMove && mon.setMove(0);
    mon.flash('#ffffff', 0.18);
    if (this.aura) this.aura.visible = false;
    const dur = this.boss ? 1.8 : this.elite ? 0.8 : 0.55;
    if (this.boss) { w.shake && w.shake(1.4); w.flash && w.flash('#ffffff', 0.5); }
    if (mon.petrify) mon.petrify(dur); else if (mon.setStone) mon.setStone(1);
    sfx(w, 'petrify', { vol: this.boss ? 1 : 0.6 });
    const M = manager(w);
    (M.statues || (M.statues = [])).push({ mon, enemy: this });
    this.statue = mon;
    // the engine emits 'enemyKilled' right after die(); without it, say so ourselves
    if (typeof w.kill !== 'function' && typeof w.emit === 'function') w.emit('enemyKilled', { enemy: this, def: this.def, id: this.id, x: this.x, z: this.z });
  }
  /** Statue mined away / room left: stop ticking it and drop it from the scene. */
  removeStatue() {
    const M = manager(this.world);
    for (const s of M.statues || []) if (s.enemy === this) s.gone = true;
    this.g.removeFromParent();
  }
  dispose() { this.clearTele(); this.mon.dispose && this.mon.dispose(); }
}

export function sfx(world, name, o) {
  const a = world.game && world.game.audio;
  if (a && a.play) try { a.play(name, o); } catch (e) { /* missing sound */ }
}
