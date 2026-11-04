// Animated monsters & bosses as DETAILED VOXEL models. Each archetype authors a sculpt (SDF primitives on a bone
// rig); vox_mon.js voxelizes it at ~1/40 of the creature's height, paints every voxel (hue-shifted palettes, pixel
// patterns, emissive eyes/runes/crystals) and meshes one rigid voxel part per bone, so the rig animates it like a
// voxel puppet. Hits knock voxel chunks loose; deaths burst into them. buildMonster(id) → Monster (see class docs).
// FACING: archetypes are authored with the head toward −X, but every Monster wraps its rig in a `facing` group
// turned so that at `group.rotation.y = 0` the creature FACES +Z (toward a first-person camera placed on +Z) and
// its attacks lunge toward +Z. Feet at y = 0, 1 unit ≈ 1 m. bounds / hitPoint / mouthPoint / cutPoints are in
// group space with that facing (front = bounds.max.z).
// PETRIFY (Medusa's stone, v4): setStone(k) 0..1 sweeps stone up the body (frozen at 1), stoneCracks() → world
// points for glowing tap targets, crackAt(i) opens one (chips fly), shatter() → { pieces, update(dt), done,
// dispose() } bursts the statue into rubble + glinting ore chunks (call its update every frame yourself).
import * as THREE from 'three';
import { MONSTERS } from '../data/monsters.js';
import { ParticleSystem } from '../gfx/particles.js';
import { clamp, damp, ease } from '../core/math.js';
import { Sculpt, makePrim, roundCone, ADD, SUB, PAINT, BIND } from './monster_kit.js';
import { voxelizeMonster } from './vox_mon.js';
import { VoxelBurst, stoneUniforms, petrifyMaterial, StatueShatter } from './vox_mon_fx.js';
import * as MEDUSA from './medusa.js';
import { NORMAL_ARCHES } from './monster_normals.js';
import { BOSS_ARCHES } from './monster_bosses.js';
import { RPG_ARCHES } from './vox_mon_rpg.js';
import { RPG_ARCHES2 } from './vox_mon_rpg2.js';

import { SNAKE_ARCHES } from './vox_mon_snakes.js';
import { SHROOM_ARCHES } from './vox_mon_shroom.js';

const ARCH = { ...NORMAL_ARCHES, ...BOSS_ARCHES, ...RPG_ARCHES, ...RPG_ARCHES2, ...SNAKE_ARCHES, ...SHROOM_ARCHES };
/** Locomotion style per archetype for setMove() (archetypes may also carry `gait` themselves). */
const GAIT = {
  slime: 'hop', mushroom: 'hop', toad: 'hop', bloatcap: 'hop', mimic: 'hop',
  glowwisp: 'float', sprite: 'float', prismwisp: 'float', wraith: 'float', lanternwing: 'float', flameskull: 'float', gargoyle: 'float',
  adder: 'slither', vine_viper: 'slither', glass_adder: 'slither', ember_asp: 'slither', gorgon_snake: 'slither', naga: 'slither',
  coilbrood: 'slither', basilisk: 'slither', thornscale: 'slither', glasscoil: 'slither', cinderfang: 'slither',
  pebblegolem: 'roll',
};
/** Authored −X front → +Z front (see FACING above). */
export const FACE_YAW = Math.PI / 2;

// state → duration (seconds). States missing here hold until the next play().
const DUR = { attack: 0.45, multi: 0.9, special: 0.9, hurt: 0.3, die: 1.2, intro: 0.9, roar: 1.4 };
const HOLD = new Set(['idle', 'windup', 'stun', 'die', 'disguise']);
const OPS = { add: ADD, sub: SUB, paint: PAINT, bind: BIND };
const _Y = new THREE.Vector3(0, 1, 0), _D = new THREE.Vector3();
/** Voxel parts per monster id (voxelizing is the expensive part; rigs/materials are rebuilt per instance). */
const GEO_CACHE = new Map();
const GLOW_I = 1.9;
/** One voxel size for every creature, in world metres at in-game scale (shared with characters/environments). */
export const VOXEL = 0.04;
export const MONSTER_STATS = { builds: 0, meshed: 0, ms: 0 };

let SEED = 1;
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3(1, 1, 1);

/**
 * Monster
 *  .group             THREE.Group to add to the scene (position/rotate this)
 *  .update(dt)        advance animation
 *  .play(state, {onDone, hits})  idle|windup|attack|multi|special|hurt|stun|die|intro|roar|disguise (+ arch-specific)
 *  .setMove(k, speed) gait blend (walk|hop|float|slither|roll per archetype) on top of any state
 *  .petrify(dur, onDone) animated stone sweep (setStone ramps to 1)
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
    const t0 = performance.now();
    this.id = id; this.def = def;
    this.md = def.model;
    this.arch = ARCH[this.md.arch];
    if (!this.arch) throw new Error('No archetype ' + this.md.arch);
    this.boss = def.tier === 'boss';
    this.seed = SEED++;
    this.group = new THREE.Group();
    this.group.name = 'monster:' + id;
    this.facing = new THREE.Group();
    this.facing.name = 'facing';
    this.facing.rotation.y = FACE_YAW;
    this.group.add(this.facing);
    this.root = new THREE.Group();
    this.facing.add(this.root);
    this.stone = 0; this.cracks = []; this._crackSrc = null; this._shake = 0; this.shattered = null; this._stoneAnim = null;
    // locomotion (v5 action game): setMove(k, speed) blends a gait in on top of any state
    this.moveTarget = 0; this.moveSpeed = 0; this.gaitT = 0; this._gaitHop = 0;
    this.sculpt = new Sculpt();
    this.bones = []; this.boneIdx = {}; this._frames = new Map();
    this.parts = {};
    this.rootBone = new THREE.Bone(); this.rootBone.name = '_root';
    this.root.add(this.rootBone); this.bones.push(this.rootBone); this.boneIdx.root = 0; this._rest(this.rootBone);
    this.state = 'idle'; this.st = 0; this.t = (this.seed * 1.7) % 10;
    this.env = { wind: 0, strike: 0, hurt: 0, dead: 0, stun: 0, roar: 0, special: 0, intro: 1, multi: 0, disguise: 0, move: 0 };
    this.hits = 3;
    this.flashT = 0; this.flashDur = 0.1; this.flashColor = new THREE.Color(1, 1, 1);
    this.phase = 1;
    this.hitPoint = new THREE.Vector3(0, 0.5, 0);
    this.mouthPoint = new THREE.Vector3(-0.3, 0.5, 0);
    this.cutPoints = [];
    this.height = 1;
    this.fly = 0; // hover height in metres (flyers)
    this.reach = this.arch.reach ?? 0.35;
    this.res = this.boss ? 76 : 64; // sculpt grid resolution (cells along the longest axis)
    this.emitters = [];
    this.layers = [];
    this.onDone = null;
    this.scale = this.md.scale || 1; // old bosses were sculpted at full size and carry scale 1 in their data
    this.arch.build(this, this.md);
    this._buildMesh();
    this.root.scale.setScalar(this.scale);
    if (this.emitters.length) {
      this.fx = new ParticleSystem(260, { additive: true });
      this.facing.add(this.fx.object); // emitter positions are authored in root space
    }
    this.play(id === 'mimic' ? 'disguise' : 'idle');
    this.update(0);
    this.group.updateMatrixWorld(true);
    this._finalizePoints();
    MONSTER_STATS.builds++; MONSTER_STATS.ms += performance.now() - t0;
  }

  // ------------------------------------------------------------ sculpting API (used by archetypes)
  /** Palette material for sculpt regions: tile (fur|scale|chitin|stone|…), base hex, o: {acc, glow, gk, full, ts, j}. */
  mat(tile, base, o) { return this.sculpt.mat(tile, base, o); }
  /** Rig bone (pivot) at `at` metres in parent space. o: rot [x,y,z], order, scale, solo (hideable part: owns only its own surface). */
  bone(name, at = [0, 0, 0], parent = 'root', o = {}) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(at[0], at[1], at[2]);
    if (o.order) b.rotation.order = o.order;
    if (o.rot) b.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.scale) b.scale.setScalar(o.scale);
    if (o.solo) (this.solo || (this.solo = [])).push(this.bones.length);
    (parent === 'root' ? this.rootBone : this.parts[parent]).add(b);
    this._rest(b);
    this.parts[name] = b;
    this.boneIdx[name] = this.bones.length;
    this.bones.push(b);
    return b;
  }
  /** bone-local → root (bind pose) matrix */
  frame(name) {
    let f = this._frames.get(name);
    if (f) return f;
    f = new THREE.Matrix4();
    let b = name === 'root' ? this.rootBone : this.parts[name];
    while (b && b !== this.root) { b.updateMatrix(); f.premultiply(b.matrix); b = b.parent; }
    this._frames.set(name, f);
    return f;
  }
  _prim(kind, bone, c, rot, q, mat, o = {}) {
    if (o.dir) _Q.setFromUnitVectors(_Y, _D.set(o.dir[0], o.dir[1], o.dir[2]).normalize());
    else _Q.setFromEuler(_E.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, o.order || 'XYZ'));
    _M.compose(_V.set(c[0], c[1], c[2]), _Q, _S);
    const f = new THREE.Matrix4().multiplyMatrices(this.frame(bone), _M);
    const prim = makePrim(kind, f, q);
    const ds = Math.cbrt(Math.abs(f.determinant())) || 1;
    prim.tmin = ds * (kind === 'ell' ? Math.min(...q.r) : kind === 'box' ? Math.min(...q.h) : kind === 'tor' ? q.r : kind === 'plate' ? q.h + q.round : kind === 'cry' ? q.r : 1);
    return this.sculpt.push(prim, OPS[o.op || 'add'], o.k ?? 0.02, mat, this.boneIdx[bone], o);
  }
  /** Ellipsoid (r number or [rx,ry,rz]) at c in bone space. o: rot, k (blend), op add|sub|paint, noise, nf */
  ell(bone, c, r, mat, o = {}) { return this._prim('ell', bone, c, o.rot, { r: typeof r === 'number' ? [r, r, r] : r }, mat, o); }
  /** Rounded box (half extents h, corner radius). */
  box(bone, c, h, round, mat, o = {}) { return this._prim('box', bone, c, o.rot, { h, round }, mat, o); }
  /** Torus (ring radius R, tube r) around local Y. */
  tor(bone, c, R, r, mat, o = {}) { return this._prim('tor', bone, c, o.rot, { R, r }, mat, o); }
  /** Plate: 2D polygon in local XY extruded ±h along Z, rounded. */
  plate(bone, c, poly, h, round, mat, o = {}) { return this._prim('plate', bone, c, o.rot, { poly, h, round }, mat, o); }
  /** Hexagonal crystal shard from c along local +Y (or o.dir), length len, radius r. */
  cry(bone, c, len, r, mat, o = {}) { return this._prim('cry', bone, c, o.rot, { len, r, tip: o.tip }, mat, { k: 0.004, ...o }); }
  /** Round cone between bone-space points a and b. */
  cap(bone, a, b, ra, rb = ra, mat, o = {}) {
    const f = this.frame(bone), s = Math.cbrt(Math.abs(f.determinant())) || 1;
    const A = _V.set(a[0], a[1], a[2]).applyMatrix4(f).toArray(), B = _V.set(b[0], b[1], b[2]).applyMatrix4(f).toArray();
    const prim = roundCone(A, B, ra * s, rb * s);
    prim.tmin = Math.min(ra, rb) * s;
    return this.sculpt.push(prim, OPS[o.op || 'add'], o.k ?? 0.02, mat, this.boneIdx[bone], o);
  }
  /** Tapered tube through points (radii: number | array | fn(t)). First segment blends with o.k, joints with o.kj. */
  tube(bone, pts, radii, mat, o = {}) {
    const R = (i) => (typeof radii === 'function' ? radii(i / (pts.length - 1)) : Array.isArray(radii) ? radii[i] : radii);
    for (let i = 0; i < pts.length - 1; i++) this.cap(bone, pts[i], pts[i + 1], R(i), R(i + 1), mat, { ...o, k: i === 0 ? o.k ?? 0.02 : o.kj ?? Math.min(R(i), R(i + 1)) * 0.3 });
  }
  /** Sphere shorthand */
  sph(bone, c, r, mat, o = {}) { return this.ell(bone, c, r, mat, o); }
  /** Non-sculpted attachment (silk thread etc.) riding a bone. */
  attach(bone, obj) { (bone === 'root' ? this.rootBone : this.parts[bone]).add(obj); return obj; }
  _buildMesh() {
    let g = GEO_CACHE.get(this.id);
    if (!g) {
      g = voxelizeMonster(this, (this.md.vox || VOXEL) / this.scale); // md.vox: finer voxels for close-up characters (Morel)
      GEO_CACHE.set(this.id, g);
      MONSTER_STATS.meshed++;
    }
    this.geo = g;
    // per-instance materials so hit flashes and phase glows stay on this creature
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(GLOW_I, GLOW_I, GLOW_I), fog: false });
    this.layerMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(GLOW_I * 1.2, GLOW_I * 1.2, GLOW_I * 1.2), fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // Medusa's stone runs through all three materials (shared uniforms)
    this.stoneU = stoneUniforms(VOXEL);
    for (const mm of [this.mat, this.glowMat, this.layerMat]) petrifyMaterial(mm, this.stoneU);
    this.mats = [this.mat, this.glowMat];
    this.layerMeshes = [];
    for (const part of g.parts) {
      const bone = this.bones[part.bone] || this.rootBone;
      if (part.solid) { const ms = new THREE.Mesh(part.solid, this.mat); ms.castShadow = true; ms.receiveShadow = true; ms.frustumCulled = false; bone.add(ms); }
      if (part.glow) { const mg = new THREE.Mesh(part.glow, this.glowMat); mg.frustumCulled = false; bone.add(mg); }
      for (const L of part.layers) {
        if (!L.geo) continue;
        const ml = new THREE.Mesh(L.geo, this.layerMat);
        ml.frustumCulled = false; ml.visible = false; ml.userData.layer = L.name;
        bone.add(ml); this.layerMeshes.push(ml);
      }
    }
    this.mesh = this.root;
    this.layers = this.layerMeshes.map((ml) => ml.userData.layer).filter(Boolean);
    // chunks that pop off: sample voxels kept in bone space so they spawn where the part is right now
    this.burst = new VoxelBurst(this.boss ? 260 : 140, g.cell * 0.95 * this.scale);
    this.group.add(this.burst.mesh);
    this.group.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    this.chunkSrc = g.samples.map((sm) => {
      const b = this.bones[sm.bone] || this.rootBone;
      const toBone = new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld).invert();
      return { bone: b, lp: new THREE.Vector3(...sm.p).applyMatrix4(toBone), c: sm.c, glow: sm.glow };
    });
    this.jolt = 0; this.joltV = 0; this.burstDone = false; this._prevStrike = 0;
  }
  /** Knock n voxel chunks loose (power scales the throw). */
  chunks(n, power = 1, near = null) {
    if (!this.chunkSrc.length) return;
    const w = new THREE.Vector3(), c = this.group.worldToLocal(this.root.localToWorld(new THREE.Vector3(0, this.height * 0.4 / (this.scale || 1), 0)));
    for (let i = 0; i < n; i++) {
      let src = this.chunkSrc[(Math.random() * this.chunkSrc.length) | 0];
      if (near) { for (let tries = 0; tries < 5; tries++) { const s2 = this.chunkSrc[(Math.random() * this.chunkSrc.length) | 0]; s2.bone.localToWorld(w.copy(s2.lp)); this.group.worldToLocal(w); if (w.distanceTo(near) < this.height * 0.35) { src = s2; break; } } }
      src.bone.localToWorld(w.copy(src.lp));
      this.group.worldToLocal(w);
      const dx = w.x - c.x, dz = w.z - c.z;
      const sp = (0.8 + Math.random() * 1.6) * power;
      this.burst.emit(w, src.c, [dx * 2.2 * power + (Math.random() - 0.3) * sp, (1.2 + Math.random() * 2.4) * power, dz * 2.2 * power + (Math.random() - 0.5) * sp], 0.9 + Math.random() * 0.9, src.glow);
    }
  }
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
    // authored root space (z mirrored at runtime) → group space through the facing turn
    const v = (a) => new THREE.Vector3(a[0] * s, a[1] * s + this.fly, -a[2] * s).applyAxisAngle(_Y, FACE_YAW);
    // bind-pose bounds (skinning every vertex on the CPU for an exact box is needlessly slow)
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const box = this.geo.bbox.clone().applyMatrix4(this.root.matrixWorld).applyMatrix4(inv);
    this.height = this._height ? this._height * this.scale + this.fly : Math.max(0.3, box.max.y);
    this.bounds = box;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    if (this._hit) this.hitPoint = v(this._hit); else this.hitPoint.set(cx, box.max.y * 0.6, cz);
    if (this._mouth) this.mouthPoint = v(this._mouth); else this.mouthPoint.set(cx, box.max.y * 0.6, box.max.z);
    if (this._cuts) this.cutPoints = this._cuts.map(v);
    else {
      this.cutPoints = [];
      for (let i = 0; i < 5; i++) this.cutPoints.push(new THREE.Vector3(box.min.x + ((i + 0.5) / 5) * (box.max.x - box.min.x), box.min.y + (box.max.y - box.min.y) * (0.35 + 0.3 * ((i * 7) % 3) / 2), box.max.z * 0.8));
    }
  }

  // ------------------------------------------------------------ petrify (Medusa's stone)
  /** Locomotion: k 0..1 how much it is moving, speed in m/s (drives the gait rate). Works in any state. */
  setMove(k, speed = 1.5) { this.moveTarget = clamp(k, 0, 1); this.moveSpeed = speed; }
  /** Animated petrify: stone sweeps from the current amount to 1 over `dur` s (needs update() calls). */
  petrify(dur = 0.7, onDone = null) { this._stoneAnim = { from: this.stone, t: 0, dur: Math.max(0.01, dur), onDone }; }
  /** 0..1 — stone sweeps up from the feet; animation slows and freezes at 1. */
  setStone(k) {
    this.stone = clamp(k, 0, 1);
    this.stoneU.uStone.value = this.stone;
  }
  /** Front-surface world points (3–6 by size) where the statue can be cracked open. Stable across calls. */
  stoneCracks() {
    if (!this._crackSrc) {
      const n = this.boss ? 6 : this.def.tier === 'elite' ? 5 : this.height < 0.7 ? 3 : 4;
      this.group.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
      const pts = this.chunkSrc.filter((c) => !c.glow).map((c) => ({ c, g: c.bone.localToWorld(c.lp.clone()).applyMatrix4(inv) }));
      const b = this.bounds, H = Math.max(0.2, b.max.y - Math.max(0, b.min.y)), W = Math.max(0.2, b.max.x - b.min.x);
      const cx = (b.min.x + b.max.x) / 2;
      const chosen = [];
      for (let i = 0; i < n; i++) {
        // bands up the body, alternating left/right of centre, always on the side facing +Z
        const y0 = b.min.y + H * (0.14 + (0.72 * i) / Math.max(1, n - 1)) - H * 0.1, y1 = y0 + H * 0.2;
        const side = n > 2 ? (i % 2 ? 1 : -1) * W * 0.16 : 0;
        let best = null, bs = -Infinity;
        for (const p of pts) {
          if (p.g.y < y0 || p.g.y > y1 || chosen.includes(p)) continue;
          const sc = p.g.z * 3 - Math.abs(p.g.x - cx - side) * 1.5;
          if (sc > bs) { bs = sc; best = p; }
        }
        if (best) chosen.push(best);
      }
      // small or wispy bodies: top up to three with the frontmost points left
      while (chosen.length < Math.min(3, pts.length)) {
        let best = null, bs = -Infinity;
        for (const p of pts) { if (chosen.includes(p) || chosen.some((q) => q.g.distanceTo(p.g) < H * 0.12)) continue; if (p.g.z > bs) { bs = p.g.z; best = p; } }
        if (!best) break;
        chosen.push(best);
      }
      if (!chosen.length) chosen.push({ c: null, g: this.hitPoint.clone() });
      this._crackSrc = chosen.map((p) => ({ c: p.c, g: p.g.clone().add(new THREE.Vector3(0, 0, VOXEL * 0.8)) }));
      this.cracks = this._crackSrc.map(() => ({ open: 0, target: 0 }));
    }
    return this._crackSrc.map((p) => this.group.localToWorld(p.g.clone()));
  }
  /** Open crack i: a glowing seam spreads, chips of stone burst toward the camera side. */
  crackAt(i) {
    const pts = this.stoneCracks();
    if (i < 0 || i >= pts.length) return;
    const cr = this.cracks[i];
    cr.target = 1;
    this._shake = Math.min(0.5, this._shake + 0.22);
    const lp = this._crackSrc[i].g;
    for (let k = 0; k < (this.boss ? 18 : 12); k++) {
      const grey = 0.08 + Math.random() * 0.22, ore = Math.random() < 0.2;
      const col = ore ? this._oreRgb() : [grey, grey * 1.02, grey * 1.06];
      this.burst.emit(lp, col, [(Math.random() - 0.5) * 2.4, 1 + Math.random() * 2.4, 0.8 + Math.random() * 2.2], 0.7 + Math.random() * 0.6, ore);
    }
  }
  _oreRgb() {
    const hx = this.md.ore || this.md.accent || this.md.eye || '#ffd25e';
    const c = new THREE.Color(hx);
    return [c.r, c.g, c.b];
  }
  /** Burst the statue: the body vanishes into tumbling rubble and glinting ore chunks. */
  shatter() {
    if (this.shattered) return this.shattered;
    this.group.updateMatrixWorld(true);
    const size = VOXEL * (this.boss ? 2.2 : this.def.tier === 'elite' ? 1.7 : 1.4);
    const S = new StatueShatter(this.group, size, this.boss ? 700 : this.def.tier === 'elite' ? 480 : 300);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const c = new THREE.Vector3((this.bounds.min.x + this.bounds.max.x) / 2, this.height * 0.45, (this.bounds.min.z + this.bounds.max.z) / 2);
    const src = this.chunkSrc;
    const want = Math.min(S.max, Math.round(src.length * 1.4) + 40);
    const ore = this._oreRgb();
    for (let i = 0; i < want; i++) {
      const sm = src[i % src.length];
      const p = sm.bone.localToWorld(sm.lp.clone()).applyMatrix4(inv);
      p.x += (Math.random() - 0.5) * size; p.y += (Math.random() - 0.5) * size; p.z += (Math.random() - 0.5) * size;
      const d = p.clone().sub(c); d.y = Math.max(0, d.y);
      const sp = 0.9 + Math.random() * 1.4;
      const isOre = Math.random() < (this.boss ? 0.16 : 0.12);
      const lum = sm.c[0] * 0.3 + sm.c[1] * 0.59 + sm.c[2] * 0.11, g = 0.06 + Math.min(0.4, lum * 0.8 + 0.06) * (0.8 + Math.random() * 0.4);
      // rubble slumps outward and down; ore chunks pop up a little higher so they catch the eye
      S.add(p, isOre ? ore : [g, g * 1.03, g * 1.1], [d.x * sp * 1.3 + (Math.random() - 0.5) * 0.6, (isOre ? 1.6 : 0.6) + Math.random() * 1.6, d.z * sp * 0.9 + Math.random() * 0.5], isOre, isOre ? 1.2 : 1);
    }
    this.root.visible = false;
    if (this.fx) this.fx.object.visible = false;
    this.shattered = { pieces: S.pieces, update: (dt) => S.update(dt), get done() { return S.done; }, dispose: () => S.dispose(), _s: S };
    return this.shattered;
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
    if (state === 'hurt') { this.joltV += 7; this.chunks(this.boss ? 9 : 6, 0.8, this.hitPoint); }
    if (state === 'die') { this.joltV += 9; this.burstDone = false; }
    if (state === 'intro' || state === 'roar') this.joltV -= 4;
  }
  flash(color = '#ffffff', t = 0.1) {
    this.flashColor.set(color);
    this.flashT = t; this.flashDur = t;
  }
  setPhase(n) {
    this.phase = n;
    this.glowMat.color.setScalar(GLOW_I * (1 + (n - 1) * 0.55));
    for (const e of this.emitters) e.boost = 1 + (n - 1) * 0.8;
    if (this.arch.phase) this.arch.phase(this, n);
  }
  get introDur() { return this.boss ? 2.6 : DUR.intro; }

  update(dt) {
    if (this._stoneAnim) {
      const a = this._stoneAnim;
      a.t += dt;
      const k = clamp(a.t / a.dur);
      this.setStone(a.from + (1 - a.from) * ease.outCubic(k));
      if (k >= 1) { this._stoneAnim = null; if (a.onDone) a.onDone(); }
    }
    // stone: world-space sweep bounds, cracks opening, a small shudder when one is hit
    if (this.stone > 0 || this.cracks.length) {
      this.group.updateMatrixWorld();
      const by = this.group.matrixWorld.elements[13], sy = new THREE.Vector3().setFromMatrixScale(this.group.matrixWorld).y;
      this.stoneU.uStBase.value = by + (this.bounds ? this.bounds.min.y : 0) * sy;
      this.stoneU.uStTop.value = by + this.height * sy;
      this.stoneU.uCrackR.value = Math.max(0.12, Math.min(0.45, this.height * 0.2)) * sy;
      if (this._crackSrc) {
        const pts = this._crackSrc;
        for (let i = 0; i < 6; i++) {
          const v4 = this.stoneU.uCracks.value[i], cr = this.cracks[i];
          if (!cr) { v4.w = 0; continue; }
          cr.open += (cr.target - cr.open) * Math.min(1, dt * 9);
          const w = this.group.localToWorld(pts[i].g.clone());
          v4.set(w.x, w.y, w.z, cr.open);
        }
      }
    }
    if (this._shake > 0) { this._shake = Math.max(0, this._shake - dt * 1.6); this._shT = (this._shT || 0) + dt; this.facing.position.x = Math.sin(this._shT * 90) * 0.02 * this._shake; }
    else this.facing.position.x = 0;
    if (this.stone >= 1) {
      // frozen statue: no breathing, no particles; hit chips still fly
      if (this.fx) this.fx.object.visible = false;
      if (this.burst.active) this.burst.update(dt, 0);
      if (this.flashT > 0) { this.flashT -= dt; const k = Math.max(0, this.flashT / this.flashDur), c = this.flashColor; this.mat.color.setRGB(1 + c.r * k * 2.2, 1 + c.g * k * 2.2, 1 + c.b * k * 2.2); }
      return;
    }
    dt *= 1 - this.stone * 0.9; // the stone slows it down as it spreads
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
    const breathe = Math.sin(this.t * 2.2) * 0.022 * (1 - e.dead);
    // impact spring: squash on hits/landings, stretch on lunges (polished, cartoony follow-through)
    this.joltV += (-70 * this.jolt - 9 * this.joltV) * dt;
    this.jolt += this.joltV * dt;
    if (e.strike > 0.85 && this._prevStrike <= 0.85) this.joltV -= 5;
    this._prevStrike = e.strike;
    const jl = clamp(this.jolt, -0.6, 0.6);
    // generic body language: anticipation crouch on windup, lunge with stretch on attack, recoil on hurt
    r.position.x += -e.strike * this.reach + e.wind * 0.07 + e.hurt * 0.14;
    r.position.y -= e.wind * 0.035 * this.height / (this.scale || 1);
    r.rotation.z += -e.wind * 0.12 + e.strike * 0.16 - e.hurt * 0.14 + Math.sin(this.t * 1.3) * 0.012 * (1 - e.dead);
    r.scale.x *= 1 + e.strike * 0.07 + e.wind * 0.05 - jl * 0.12;
    r.scale.y *= 1 - e.strike * 0.04 - e.wind * 0.07 + jl * 0.16;
    if (e.hurt > 0.01) r.position.x += Math.sin(this.t * 70) * 0.012 * e.hurt;
    if (e.wind > 0.05) r.position.x += Math.sin(this.t * 60) * 0.006 * e.wind; // trembling telegraph
    if (e.stun > 0.01) { r.rotation.z += Math.sin(this.t * 7) * 0.08 * e.stun; r.rotation.x += Math.cos(this.t * 5) * 0.05 * e.stun; }
    r.scale.y *= 1 + breathe;
    r.scale.x *= 1 - breathe * 0.5;
    if (e.roar > 0) { r.rotation.z -= e.roar * 0.12; r.scale.multiplyScalar(1 + e.roar * 0.04); }
    this._gait(dt);

    if (this.arch.anim) this.arch.anim(this, dt);

    // hidden parts collapse into their pivot (bones can't be "invisible"); phase layers toggle glow masks
    for (const b of this.bones) if (!b.visible) b.scale.setScalar(1e-4);
    for (const ml of this.layerMeshes) ml.visible = !!(ml.userData.layer && this.parts[ml.userData.layer] && this.parts[ml.userData.layer].visible);
    // secondary motion: heads/tails/ears lag the body's squash a little
    for (const nm of ['head', 'tail', 'tail1', 'tail2', 'earL', 'earR', 'jaw']) { const b = this.parts[nm]; if (b) b.rotation.z += -jl * 0.25 + e.hurt * 0.08 * Math.sin(this.t * 40); }

    // death: the body breaks into voxel chunks as it goes down
    if (s === 'die' && !this.burstDone && st > 0.22) {
      this.burstDone = true;
      const mode = this.arch.die || 'tip';
      this.chunks(mode === 'fade' ? (this.boss ? 160 : 90) : this.boss ? 110 : 55, mode === 'fade' ? 1.1 : 0.9);
    }
    if (s === 'die' && st > 0.75 && st - dt <= 0.75) { this.joltV += 6; this.chunks(this.boss ? 40 : 16, 0.5); }
    if (this.burst.active) this.burst.update(dt, 0);
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
    if (this.flashT > 0 || this._flashing) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / this.flashDur);
      const c = this.flashColor;
      this.mat.color.setRGB(1 + c.r * k * 2.2, 1 + c.g * k * 2.2, 1 + c.b * k * 2.2);
      this._flashing = k > 0;
    }

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

  /** Gait on top of the pose: walk (bob + waddle), hop (arcs with squash on landing), float, slither, roll. */
  _gait(dt) {
    const e = this.env, r = this.root;
    e.move = damp(e.move, this.moveTarget * (1 - e.dead), 10, dt);
    const g = this.arch.gait || GAIT[this.md.arch] || (this.fly > 0 ? 'float' : 'walk');
    const sp = Math.max(0.3, this.moveSpeed);
    const H = this.height / (this.scale || 1);
    if (g === 'hop') {
      // hops: one arc every ~0.42 s at 2 m/s; landing squash through the jolt spring
      const prev = this.gaitT;
      this.gaitT += dt * e.move * (1.6 + sp * 0.55);
      const k = this.gaitT % 1;
      if (Math.floor(this.gaitT) !== Math.floor(prev) && e.move > 0.3) this.joltV += 5 * e.move;
      r.position.y += Math.sin(k * Math.PI) * Math.min(0.5, 0.16 * H + 0.05) * e.move;
      r.rotation.z += (k < 0.5 ? 0.12 : -0.06) * e.move;
      r.scale.y *= 1 + Math.sin(k * Math.PI) * 0.1 * e.move;
    } else if (g === 'float') {
      this.gaitT += dt * (1 + sp * 0.4);
      r.position.y += Math.sin(this.gaitT * 2.6) * 0.06 * (0.4 + e.move);
      r.rotation.z += 0.18 * e.move;
    } else if (g === 'slither') {
      this.gaitT += dt * e.move * (2 + sp * 1.2);
      r.rotation.x += Math.sin(this.gaitT * 3) * 0.12 * e.move;
      r.position.z += Math.sin(this.gaitT * 3 + 1) * 0.06 * e.move;
      r.rotation.z += 0.05 * e.move;
    } else if (g === 'roll') {
      this.gaitT += dt * e.move * sp * 2.2;
      r.rotation.z += 0.1 * e.move;
      r.position.y += Math.abs(Math.sin(this.gaitT * 2)) * 0.03 * e.move;
    } else {
      // walk: quick bob twice per stride, side-to-side waddle, lean into the run
      this.gaitT += dt * e.move * (2.2 + sp * 0.9);
      const ph = this.gaitT * Math.PI;
      r.position.y += Math.abs(Math.sin(ph)) * Math.min(0.12, 0.05 * H + 0.015) * e.move;
      r.rotation.x += Math.sin(ph) * 0.07 * e.move;
      r.rotation.z += 0.1 * e.move;
    }
  }

  dispose() {
    // voxel geometry is cached per id and shared; only per-instance resources are released
    this.mat.dispose(); this.glowMat.dispose(); this.layerMat.dispose();
    this.burst.dispose();
    if (this.fx) { this.fx.geo.dispose(); this.fx.mat.dispose(); }
    this.group.removeFromParent();
  }
}

export function buildMonster(id) {
  const def = MONSTERS[id];
  // Medusa is a character-style model (models/medusa.js) that speaks the Monster API
  if (def && def.model && def.model.arch === 'medusa' && MEDUSA.buildMedusa) {
    const m = MEDUSA.buildMedusa();
    if (m && !m.def) m.def = def;
    if (m && !m.id) m.id = id;
    return m;
  }
  return new Monster(id);
}
/** Drop cached sculpt meshes (dev/benchmarks). */
export function clearMonsterCache() { GEO_CACHE.clear(); }
export const MONSTER_ARCHETYPES = Object.keys(ARCH);
