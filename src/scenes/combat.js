// Combat, first person. You walk into the chamber with Pip at your heels; the foe ambushes from the
// floor, the ceiling, a wall or the water and squares up in front of you. Your hands swing the
// forged blade (or the pickaxe) on their own; when a wind-up glows you may Guard (a perfect Guard
// parries), and a charged Special lands one huge blow. Rescued friends chip in. When the foe falls,
// Medusa's stone in your blade petrifies it — and creeps a little further up the blade. Then you mine
// the statue: tap its glowing cracks, it bursts, and the ore and parts fly into your pack.
// Params: { node, monster, elite, boss, where: 'tunnel', from: 'floor'|'ceiling'|'wall'|'water'|'chest',
//           autoplay, nocut }. Dev: ?scene=combat&char=bran&monster=adder[&wpn=none][&stone=0.9]
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { save } from '../core/save.js';
import { clamp, damp, lerp } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import * as MonData from '../data/monsters.js';
import { MATERIALS, RARITY } from '../data/materials.js';
import * as Sim from '../systems/combat.js';
import * as Petrify from '../systems/petrify.js';
import * as Forge from '../systems/forge.js';
import { makeItem } from '../systems/items.js';
import * as Mon from '../models/monsters.js';
import * as FPW from '../models/fp_world.js';
import * as Arms from '../models/fp_arms.js';
import * as PetM from '../models/pet.js';
import * as W3 from '../models/weapons3d.js';
import { buildProp } from '../models/props.js';
import * as FPC from '../gfx/fpcam.js';
import { CameraRig } from '../gfx/camera.js';
import { ParticleSystem, Debris } from '../gfx/particles.js';
import { materialSprite } from '../art/sprites.js';
import { COLORS } from '../ui/font.js';
import { ribbonTitle } from './common.js';
import * as Flow from './flow.js';
import * as Kit from './fp_kit.js';
import { Fx2, drawCrackTarget } from './combat_fp/fx2.js';
import { BladeStone, setMonsterStone, statueCracks, crackStatue, shatterStatue } from './combat_fp/stone.js';
import { drawHeart, drawMonsterBar, drawBlade, drawSpecial, drawTelegraph, fmt } from './combat_fp/hud.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const MONSTERS = MonData.MONSTERS;
const EYE = 0.95;
const EL_COLOR = { fire: '#ff7b2e', ice: '#7fe3ff', shock: '#ffe74a', poison: '#8fe04a', bleed: '#ff4f6a', curse: '#c86bff', holy: '#fff3b0' };
const EL_GRAD = { fire: ['#fff0b0', '#ff6a1a'], ice: ['#ffffff', '#4fc0ff'], shock: ['#fffbd0', '#ffc81a'], poison: ['#e8ffc0', '#5ab02a'], bleed: ['#ffd0d8', '#d02a4a'], curse: ['#f0d0ff', '#9a3ae0'], holy: ['#ffffff', '#ffd25e'] };
const KINDLE_EL = ['fire', 'ice', 'shock', 'poison'];
const BLADES = ['sword', 'dagger', 'axe', 'hammer', 'spear', 'staff'];
// what a rescued friend does in a fight (the sim runs it and tells us; we show an icon and a beat)
const COMP = {
  elio: { icon: 'fire' },     // Kindle zips in and casts
  clover: { icon: 'dagger' }, // a thrown knife
  durgan: { icon: 'shield' }, // "HOLD!" — takes the first blow on his shield
  bran: { icon: 'hammer' },   // sharpens your blade before the fight
};
// a mild yaw so the foe stands three-quarters on, not dead flat
const THREE_Q = 0.22;

const topElement = (w) => {
  let best = null;
  for (const k of ['fire', 'ice', 'shock', 'poison', 'curse', 'holy', 'bleed']) if ((w.el?.[k] || 0) > 0 && (!best || w.el[k] > w.el[best])) best = k;
  return best;
};
/** Monster model front as a yaw: v4 monsters wrap their rig in a `facing` group and face +Z; older ones face -X. */
const frontYaw = (mon) => (mon && (mon.facing || typeof mon.setStone === 'function') ? 0 : -Math.PI / 2);

function pickWeapon() {
  if (Sim.PICK_WEAPON) return { ...Sim.PICK_WEAPON };
  return { ...Sim.FISTS, name: 'Pickaxe', bp: 'pickaxe', dmg: 4, interval: 0.85, critChance: 0.05 };
}

/** A sword for dev runs that start straight in a fight (?scene=combat&char=…). */
function devWeapon(run) {
  const bp = (run.def && run.def.blueprints && run.def.blueprints.find((b) => BLADES.includes(b))) || 'sword';
  try {
    const items = run.bag.items.filter((it) => MATERIALS[it.id] && MATERIALS[it.id].weapon).slice(0, 4);
    const res = Forge.evaluate(bp, items, { char: run.char });
    if (res && res.valid !== false) {
      if (!res.name && Forge.weaponName) res.name = Forge.weaponName(bp, res.ids, res);
      const w = Forge.finalizeWeapon(res, 2, { char: run.char });
      if (w && w.dmg > 0) return { ...w, stone: 0 };
    }
  } catch (e) { /* fall back below */ }
  return { name: 'Iron Sword', bp: 'sword', ids: ['iron', 'iron', 'copper'], grade: 2, chips: 12, mult: 1, dmg: 14, interval: 0.95, critMult: 2, critChance: 0.08, el: {}, stats: {}, flags: {}, multi: 0, harvest: 2, stun: 0, pierce: false, pierceFlat: 0, firstStrike: false, parryBonus: 1, synergies: [], stone: 0 };
}

/** The same seed the other first-person scenes use for a room (so an ambush cuts to the same room). */
function seedOf(...parts) {
  if (Kit.seedOf) return Kit.seedOf(...parts);
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

function actOf(run) { return clamp((run.act ?? run.region ?? 0) | 0, 0, 3); }

function resolveMonster(p, act) {
  if (p.monster && MONSTERS[p.monster]) return p.monster;
  const tier = p.boss ? 'boss' : p.elite ? 'elite' : 'normal';
  let pool = [];
  try { pool = MonData.actPool ? MonData.actPool(act, tier) : MonData.regionPool ? MonData.regionPool(act, tier) : []; } catch (e) { pool = []; }
  const ids = (pool || []).map((m) => (typeof m === 'string' ? m : m && m.id)).filter((id) => MONSTERS[id]);
  if (ids.length) return rnd.pick(ids);
  const any = Object.keys(MONSTERS).filter((id) => MONSTERS[id].tier === tier);
  return any.length ? rnd.pick(any) : Object.keys(MONSTERS)[0];
}

export class CombatScene extends Scene {
  enter(p = {}) {
    const game = this.game;
    this.p = p;
    const run = (this.run = game.run);
    if (!run) { game.go('title', {}, { transition: 'none' }); return; }
    this.act = actOf(run);
    this.mid = resolveMonster(p, this.act);
    this.def = MONSTERS[this.mid];
    this.boss = this.def.tier === 'boss' || !!p.boss;
    this.elite = !this.boss && (this.def.tier === 'elite' || !!p.elite);
    this.auto = !!p.autoplay && p.autoplay !== '0';
    // dev runs start with a sword unless asked for the pickaxe
    if (!p.node && !run.weapon && p.wpn !== 'none') run.weapon = devWeapon(run);
    if (run.weapon && p.stone !== undefined) run.weapon.stone = clamp(+p.stone || 0, 0, 0.99);
    if (run.weapon && run.weapon.stone === undefined) run.weapon.stone = 0;

    // ---- world: a chamber — or, when it jumped you, the very room (or tunnel) you were in
    const nodeType = p.node && p.node.type;
    this.ambushed = !!p.ambush;
    let fpKind = 'chamber', kind = this.boss ? 'boss' : this.elite ? 'elite' : 'monster';
    let seed = p.node ? seedOf(run.seed, this.act, p.node.id, 'fight') : Math.floor(rnd.next() * 1e5);
    if (p.where === 'tunnel' || (p.ambush && (!nodeType || nodeType === 'monster') && p.node)) { fpKind = 'tunnel'; seed = seedOf(run.seed, this.act, p.node ? p.node.id : 0, 'ambush'); }
    else if (p.ambush && nodeType === 'treasure') { kind = 'treasure'; seed = seedOf(run.seed, this.act, p.node.id, 'chest'); this.fromChest = true; }
    else if (p.ambush && nodeType === 'event') { const evs = (run.flags && run.flags.events) || []; kind = 'event'; seed = seedOf(run.seed, this.act, evs[evs.length - 1], 'event'); }
    this.stage = FPW.buildFP(fpKind, this.act, { seed, kind, length: 12, bend: 0, exits: [0] });
    const scene = new THREE.Scene();
    this.stage.attach ? this.stage.attach(scene) : scene.add(this.stage.group);
    if (!scene.background) scene.background = new THREE.Color('#0a0808');
    if (!scene.fog) scene.fog = new THREE.FogExp2(0x0a0808, 0.06);
    this.scene = scene;

    // ---- camera: the first-person rig's camera, driven by a cinematic rig (moves, shake, punch)
    this.fpcam = FPC.FPCam ? new FPC.FPCam({ fov: 62 }) : null;
    this.rig = new CameraRig(62, 0.04, 90);
    if (this.fpcam && this.fpcam.camera) this.rig.camera = this.fpcam.camera;
    const cam = (this.cam = this.rig.camera);
    cam.near = 0.04; cam.far = 90; cam.fov = 62; cam.updateProjectionMatrix();
    this.rig.sway = 0.012;
    scene.add(cam);
    this.stage.setCamera && this.stage.setCamera(cam);
    // a warm glow you carry, so the hands and the floor at your feet always read
    // the hand torch: a touch dimmer and higher in a fight, so a held blade does not blow out
    this.torch = this.fpcam && this.fpcam.torch;
    if (this.torch) { this.torch.intensity *= 0.72; this.torch.position.y += 0.18; this.torchCol = this.torch.color.clone(); }
    if (!this.torch) {
      const carry = new THREE.PointLight(0xffd8a8, 0.9, 6, 1.4);
      carry.position.set(-0.12, 0.42, 0.32);
      cam.add(carry);
    }

    this.world = { scene, camera: cam, post: { bloom: 0.8, threshold: 0.8, vignette: 0.42, outline: 0.55, edge: 0.4, saturation: 1.12, contrast: 1.04, exposure: 1 } };
    this.sparks = new ParticleSystem(1600, { additive: true });
    this.dust = new ParticleSystem(700);
    this.debris = new Debris(320, 0.045);
    scene.add(this.sparks.object, this.dust.object, this.debris.object);
    this.fx2 = new Fx2();
    if (game.renderer && game.renderer.gl) game.renderer.gl.localClippingEnabled = true;

    // ---- geometry of the encounter: where you stand, where it stands
    const A = this.stage.anchors || {};
    const stand = (A.stand ? A.stand.clone() : V3(0, EYE, -3));
    if (stand.y < 0.5) stand.y += EYE;
    this.floorY = stand.y - EYE;
    const look = A.look ? A.look.clone() : stand.clone().add(V3(0, -0.05, -4));
    const fwd = look.clone().sub(stand); fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    this.fwd = fwd;
    this.left = V3(fwd.z, 0, -fwd.x); // 90° to the left of forward
    this.stand = stand;
    if (this.fromChest && A.chest) {
      // you were bent over the chest when it burst open
      const ch = A.chest.clone();
      const back = stand.clone().sub(ch); back.y = 0; back.normalize();
      stand.copy(ch).addScaledVector(back, 1.9); stand.y = this.floorY + EYE;
      fwd.set(ch.x - stand.x, 0, ch.z - stand.z).normalize();
      this.left.set(fwd.z, 0, -fwd.x);
    }
    const enter = A.enter ? A.enter.clone() : stand.clone().addScaledVector(fwd, -2.4);
    if (enter.y < 0.5) enter.y += EYE;
    this.enterPos = enter;

    // ---- the foe
    this.mon = Mon.buildMonster(this.mid);
    this.mon.group.visible = false;
    scene.add(this.mon.group);
    const b = this.mon.bounds || new THREE.Box3().setFromObject(this.mon.group);
    const sz = b.getSize(V3());
    this.mh = Math.max(0.4, this.mon.height || sz.y || 1);
    this.mw = Math.max(sz.x, sz.z, 0.5);
    // where it squares up: the boss mark, else in front of you — never past the burrow it came from
    const burrow = (A.spawns || []).find((x) => x && x.from === 'floor');
    const maxD = burrow ? Math.max(2.2, Math.hypot(burrow.pos.x - stand.x, burrow.pos.z - stand.z)) : 6.5;
    const dist = clamp(0.95 + this.mh * 0.6 + this.mw * 0.22 + (this.boss ? 0.6 : 0), 1.45, maxD);
    if (this.boss && A.boss) this.monHome = A.boss.clone();
    else if (this.fromChest && A.chest) this.monHome = A.chest.clone().addScaledVector(fwd, -0.35);
    else this.monHome = stand.clone().addScaledVector(fwd, dist);
    this.monHome.y = this.floorY + (this.mon.fly || 0);
    this.frozen = false;

    if (this.fromChest && A.chest && this.mid !== 'mimic') {
      try {
        const chest = buildProp('chest', { kind: 'iron' });
        if (chest.userData.open) chest.userData.open(1);
        chest.position.copy(A.chest);
        chest.rotation.y = Math.atan2(-fwd.x, -fwd.z);
        scene.add(chest);
        this.chestProp = chest;
      } catch (e) { /* no chest prop */ }
    }

    // ---- your hands
    this.armsRoot = new THREE.Group();
    cam.add(this.armsRoot);
    this.arms = Arms.buildFPArms ? Arms.buildFPArms(run.char) : null;
    if (this.arms && this.arms.group) this.armsRoot.add(this.arms.group);
    this.pose = { x: 0, y: -0.35, z: 0, rx: 0, ry: 0, rz: 0 }; // starts lowered, comes up on the walk-in
    this.poseT = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    this.kick = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    this.weapon = run.weapon || null;
    this.equip(this.weapon);

    // ---- Pip, at your feet, barking at it
    this.pet = null;
    if (PetM.buildPet) {
      try {
        this.pet = PetM.buildPet();
        const pp = stand.clone().addScaledVector(fwd, 1.25).addScaledVector(this.left, 0.55);
        pp.y = this.floorY;
        this.pet.group.position.copy(pp);
        this.pet.group.rotation.y = Math.atan2(fwd.x, fwd.z);
        scene.add(this.pet.group);
        this.pet.play('idle');
      } catch (e) { this.pet = null; }
    }

    // ---- friends you have rescued, stews you ate
    const comps = (run.companions || []).filter((id) => id !== run.char && COMP[id]);
    this.comp = comps.map((id) => ({ id, ...COMP[id], used: false, pop: 0 }));
    this.buffs = (run.buffs || []).filter((x) => x && (x.fights === undefined || x.fights > 0));

    // ---- state
    this.phase = 'intro';
    this.sim = null; this.tele = null; this.hpTrail = 1; this.heartKick = 0;
    this.letter = 1; this.letterTarget = 1;
    this.titleCard = null; this.bigs = [];
    this.guardCd = 0; this.guardPose = 0; this.showGuardHint = (run.stats.kills || 0) < 3;
    this.usingPick = !this.weapon || !BLADES.includes(this.weapon.bp);
    this.stoneShown = this.weapon ? this.weapon.stone || 0 : 0;
    this.cracks = null; this.mine = null; this.loot = []; this.bagBounce = 0;
    this.chunks = null; this.walkBob = 0; this.bobAmp = 0;
    this.simHold = 0; this.slowUntil = 0; this.defeatK = 0;
    this.rig.cut(enter.toArray(), enter.clone().addScaledVector(fwd, 3).setY(enter.y - 0.1).toArray(), 62);
    game.audio && game.audio.music(this.mid === 'medusa' ? 'medusa' : this.boss ? 'boss' : 'combat');
    this.co.start(this.introSeq.bind(this));
  }

  exit() {
    if (this.slowUntil) this.game.timeScale = this.baseTS || 1;
    try { this.mon && this.mon.dispose && this.mon.dispose(); } catch (e) { /* already gone */ }
    try { this.stage && this.stage.dispose && this.stage.dispose(); } catch (e) { /* already gone */ }
    try { this.chunks && this.chunks.dispose && this.chunks.dispose(); } catch (e) { /* already gone */ }
  }

  // =============================================================== helpers
  sfx(name, o) { this.game.audio && this.game.audio.play(name, o); }
  screen(v) { return this.rig.project(v, this.game.ui.w, this.game.ui.h); }
  hitWorld() {
    const m = this.mon;
    if (m.hitPoint) return m.group.localToWorld(m.hitPoint.clone());
    return this.monHome.clone().add(V3(0, this.mh * 0.55, 0));
  }
  monCenter() { return this.monHome.clone().add(V3(0, this.mh * 0.5, 0)); }
  /** A point a little in front of your face where blows meet your guard. */
  contact() { return this.stand.clone().addScaledVector(this.fwd, 0.7).add(V3(0, -0.12, 0)); }
  slowmo(scale, dur) {
    if (!this.slowUntil) this.baseTS = this.game.timeScale; // restore whatever pace was set (dev/test speed-ups)
    this.game.timeScale = Math.min(this.game.timeScale, scale);
    this.slowUntil = Math.max(this.slowUntil, performance.now() / 1000 + dur);
  }
  faceMonster(extra = 0) {
    const g = this.mon.group;
    const d = this.stand.clone().sub(g.position);
    g.rotation.y = Math.atan2(d.x, d.z) - frontYaw(this.mon) + extra;
  }
  /** Where the camera looks during the fight: the foe's chest, tilted for big ones. */
  fightLook() {
    const h = this.hitWorld();
    const y = lerp(this.stand.y - 0.08, h.y, this.mh > 1.6 ? 0.75 : 0.55);
    return [h.x, y, h.z];
  }
  aimFight(lambda = 4) { this.rig.aim(this.stand.toArray(), this.fightLook(), 62, lambda); }
  armsPlay(name, o) { if (this.arms && this.arms.play) { try { this.arms.play(name, o || {}); } catch (e) { /* unknown anim */ } } }
  petPlay(name) { if (this.pet && this.pet.play) { try { this.pet.play(name); } catch (e) { /* unknown anim */ } } }
  big(text, dur = 1, o = {}) { this.bigs.push({ text, dur, t: 0, ...o }); }

  /** Put a weapon (or the pickaxe when w is null / not a blade) in your hands. */
  equip(w) {
    if (this.wmesh) { this.wmesh.parent && this.wmesh.parent.remove(this.wmesh); this.wmesh = null; }
    this.blade = null;
    const blade = w && BLADES.includes(w.bp);
    let mesh = null;
    try { mesh = blade ? W3.buildWeaponMesh(w) : W3.buildWeaponMesh({ bp: 'pickaxe', ids: ['iron', 'iron', 'copper'], grade: 1 }); } catch (e) { mesh = null; }
    if (!mesh) return;
    if (this.arms && this.arms.hold) { try { this.arms.hold(blade ? 'weapon' : 'pickaxe', mesh); } catch (e) { /* placeholder arms */ } }
    // arms that do not take the mesh yet: hold it in the right hand ourselves
    this.realArms = !!mesh.parent;
    if (!mesh.parent) {
      this.armsRoot.add(mesh);
      mesh.position.set(0.24, -0.27, -0.5);
      mesh.rotation.set(-0.55, 0.15, 0.38);
      mesh.scale.setScalar(0.62);
    }
    this.wmesh = mesh;
    if (blade) { this.blade = new BladeStone(mesh); this.blade.set(w.stone || 0); }
  }

  // =============================================================== intro
  *introSeq() {
    const rig = this.rig, game = this.game;
    if (this.ambushed && !this.boss) {
      // it jumped you: no walk-in, eyes already on it
      rig.cut(this.stand.toArray(), this.stand.clone().addScaledVector(this.fwd, 3).setY(this.stand.y - 0.15).toArray(), 62);
      this.poseT.y = 0; this.pose.y = -0.12;
      this.letterTarget = 0.4;
      yield 0.12;
      yield* this.ambush();
      this.startFight();
      return;
    }
    // walk in: a few steps, hands come up, Pip trots ahead
    const lookIn = this.stand.clone().addScaledVector(this.fwd, 4).setY(this.stand.y - 0.12).toArray();
    this.bobAmp = 1;
    this.poseT.y = 0;
    this.armsPlay('walk');
    this.petPlay('walk');
    rig.moveTo(this.stand.toArray(), lookIn, 62, this.boss ? 2.2 : 1.5, 'inOutSine');
    yield this.boss ? 2.2 : 1.5;
    this.bobAmp = 0;
    this.armsPlay('idle');
    this.petPlay('sniff');
    this.letterTarget = 0.6;
    if (this.boss) { yield* this.bossIntro(); return; }
    yield 0.35;
    yield* this.ambush();
    this.startFight();
  }

  /** The foe shows itself from its spawn: floor, ceiling, wall, water — or bursts out of the chest. */
  *ambush() {
    const A = this.stage.anchors || {};
    const spawns = (A.spawns || []).filter(Boolean);
    let from = this.p.from || (this.mid === 'mimic' || this.fromChest ? 'chest' : null);
    let sp = null;
    if (!from) {
      sp = spawns.length ? rnd.pick(spawns) : null;
      from = (sp && sp.from) || rnd.pick(['floor', 'ceiling', 'wall']);
      if ((this.mon.fly || 0) > 0.2 && from === 'floor') from = 'ceiling';
    }
    const g = this.mon.group, home = this.monHome;
    const mh = this.mh;
    this.faceMonster(THREE_Q);
    g.visible = true;
    this.mon.play('intro');
    const rig = this.rig;
    // whip toward where it comes from, then back onto it
    let start = home.clone();
    if (from === 'ceiling') start.y = sp && sp.pos ? Math.max(sp.pos.y, this.floorY + 3) : this.floorY + Math.max(3.2, mh + 2.2);
    else if (from === 'floor') start.y = this.floorY - mh * 1.15;
    else if (from === 'water') { if (sp && sp.pos) start.set(sp.pos.x, sp.pos.y - mh, sp.pos.z); else start.y = this.floorY - mh * 1.15; }
    else if (from === 'wall') {
      const side = sp && sp.pos ? sp.pos.clone() : home.clone().addScaledVector(this.left, rnd.chance(0.5) ? 2.4 : -2.4);
      side.y = home.y;
      start = side;
    } else if (from === 'chest') { g.scale.setScalar(0.35); }
    g.position.copy(start);
    const glance = from === 'ceiling' ? home.clone().setY(Math.min(start.y * 0.7, this.floorY + 4)) : from === 'wall' || from === 'water' ? start.clone().setY(this.stand.y - 0.2) : home.clone().setY(this.floorY + 0.2);
    this.sfx(from === 'water' ? 'splash' : 'monster_growl', { vol: 0.8 });
    this.sfx('hiss', { vol: this.def.name.toLowerCase().includes('snake') || /adder|viper|naga|asp|basilisk|coil|scale|fang/.test(this.mid) ? 0.8 : 0 });
    rig.moveTo(this.stand.toArray(), glance.toArray(), 58, 0.28, 'outCubic');
    this.petPlay('bark');
    this.sfx('pip_bark', { vol: 0.6 });
    yield 0.18;
    if (from === 'ceiling') {
      const fall = clamp(0.25 + Math.sqrt(Math.max(0, start.y - home.y)) * 0.12, 0.35, 0.7);
      this.dust.emit({ pos: [home.x, start.y - 0.2, home.z], posSpread: [0.6, 0.1, 0.4], vel: [0, -1.5, 0], spread: 0.4, count: 30, life: [0.6, 1.2], size: [1, 2], color: ['#c8b8a0', '#8a7a6a'], alpha: 0.7, gravity: 3 });
      rig.moveTo(this.stand.toArray(), home.clone().setY(this.floorY + mh * 0.6).toArray(), 60, fall + 0.1, 'inQuad');
      this.tw.to(g.position, { y: home.y }, fall, { ease: 'inQuad' });
      yield fall;
      this.landDust(1.2);
    } else if (from === 'water') {
      this.sparks.emit({ pos: [start.x, start.y + mh, start.z], radial: [1, 3], radialUp: 2, count: 70, life: [0.4, 0.9], size: [1, 2], color: ['#ffffff', '#9ae8ff', '#5ac8e0'], glow: 1.6, gravity: 7 });
      this.sfx('splash', { vol: 0.8 });
      this.tw.to(g.position, { y: start.y + mh }, 0.4, { ease: 'outBack' });
      yield 0.4;
      this.tw.to(g.position, { x: home.x, y: home.y, z: home.z }, 0.6, { ease: 'inOutCubic' });
      yield 0.6;
    } else if (from === 'floor') {
      const water = from === 'water';
      this.debris.spawn({ pos: [home.x, this.floorY + 0.05, home.z], count: water ? 0 : 18, colors: ['#5a4a3e', '#3a2d25', '#7a6a5a'], speed: 2, up: 3.2, floor: this.floorY + 0.02, life: 1.4 });
      this.sparks.emit({ pos: [home.x, this.floorY + 0.05, home.z], radial: [1, 3], radialUp: 2, count: water ? 60 : 10, life: [0.4, 0.9], size: [1, 2], color: water ? ['#ffffff', '#9ae8ff', '#5ac8e0'] : ['#ffd8a0'], glow: water ? 1.6 : 2, gravity: 7 });
      this.tw.to(g.position, { y: home.y }, 0.55, { ease: 'outBack' });
      this.sfx(water ? 'splash' : 'rock_break', { vol: 0.7 });
      rig.shake(0.35);
      yield 0.5;
    } else if (from === 'wall') {
      this.debris.spawn({ pos: [start.x, this.floorY + mh * 0.5, start.z], count: 22, colors: ['#5a4a3e', '#3a2d25', '#7a6a5a'], speed: 2.4, up: 2, floor: this.floorY + 0.02, life: 1.4 });
      this.sfx('rock_break', { vol: 0.8 });
      rig.shake(0.4);
      this.tw.to(g.position, { x: home.x, z: home.z }, 0.5, { ease: 'outCubic' });
      yield 0.5;
    } else if (from === 'chest') {
      this.sfx('mimic_reveal');
      this.tw.to(g.scale, { x: 1, y: 1, z: 1 }, 0.35, { ease: 'outBack' });
      rig.shake(0.5);
      this.game.renderer.doFlash(0.2, [1, 0.8, 0.8]);
      yield 0.35;
    }
    g.position.copy(home);
    this.faceMonster(THREE_Q);
    this.mon.play('roar', { onDone: () => this.mon.play('idle') });
    this.sfx('monster_growl', { vol: 0.6, pitch: 0.85 });
    rig.moveTo(this.stand.toArray(), this.fightLook(), 62, 0.45, 'inOutCubic');
    this.titleCard = { name: this.def.name, sub: this.elite ? 'elite' : null, t: 0, dur: 1.9 };
    this.letterTarget = 0;
    yield 0.6;
  }

  landDust(k = 1) {
    const h = this.monHome;
    this.dust.emit({ pos: [h.x, this.floorY + 0.05, h.z], posSpread: [this.mw * 0.4, 0.02, this.mw * 0.3], vel: [0, 0.5, 0], spread: 0.9, count: Math.round(40 * k), life: [0.6, 1.4], size: [2, 3], sizeEnd: 5, color: ['#b8a890', '#8a7a6a'], alpha: 0.55, drag: 1.5 });
    this.rig.shake(0.45 * k);
    this.sfx('heavy_hit', { vol: 0.6, pitch: 0.7 });
    this.petPlay('yelp');
  }

  *bossIntro() {
    const g = this.mon.group;
    g.position.copy(this.monHome);
    this.faceMonster(0);
    g.visible = false;
    let shown = !!this.p.nocut || !this.game.scenes.cutscene;
    if (!shown) {
      try {
        this.game.pushOverlay('cutscene', { id: 'boss_' + this.mid, char: this.run.char, onDone: () => (shown = true) });
      } catch (e) { shown = true; }
    }
    yield () => shown;
    // out of the reveal: it rises in front of you and roars
    g.visible = true;
    this.mon.play('intro');
    const top = this.monHome.clone().setY(this.floorY + this.mh * 0.85);
    this.rig.cut(this.stand.toArray(), top.toArray(), 54);
    this.world.post.exposure = 1.25;
    this.tw.to(this.world.post, { exposure: 1 }, 0.9, { ease: 'outCubic' });
    yield 0.4;
    this.mon.play('roar', { onDone: () => this.mon.play('idle') });
    this.sfx(this.mid === 'medusa' ? 'medusa_laugh' : 'herald_roar', { vol: 0.9 });
    this.sfx('boss_roar', { vol: 0.5 });
    this.rig.shake(0.8); this.rig.fovPunch(5);
    this.petPlay('yelp');
    this.titleCard = { name: this.def.name, sub: this.def.title || null, t: 0, dur: 2.4, boss: true };
    yield 1.1;
    this.rig.moveTo(this.stand.toArray(), this.fightLook(), 62, 0.9, 'inOutCubic');
    this.letterTarget = 0;
    yield 0.9;
    this.startFight();
  }

  // =============================================================== fight
  startFight() {
    const run = this.run;
    const base = this.weapon && BLADES.includes(this.weapon.bp) ? this.weapon : pickWeapon();
    this.simWeapon = base;
    // stews (buff totals) and rescued friends are handled by the sim; it reports them as events
    let buffs = {};
    try { buffs = run.buffTotals ? run.buffTotals() : {}; } catch (e) { buffs = {}; }
    this.sim = new Sim.CombatSim(run, base, this.mid, this.act, { buffs, companions: (run.companions || []).filter((id) => id !== run.char) });
    this.phase = 'fight';
    this.aimFight(5);
    this.poseT.y = 0;
    this.armsPlay('idle');
    this.petPlay('bark');
  }

  sharpenBeat() {
    this.co.start(function* (s) {
      yield 0.15;
      if (!s.wmesh) return;
      const tip = s.blade ? s.blade.tipWorld() : s.contact();
      for (let i = 0; i < 6; i++) {
        s.sparks.emit({ pos: [tip.x, tip.y, tip.z], radial: [0.5, 1.6], count: 6, life: [0.2, 0.5], size: 1, color: ['#ffffff', '#ffd25e'], glow: 3, gravity: 4, drag: 2 });
        s.sfx('anvil_ring', { vol: 0.25, pitch: 1.4 + i * 0.05 });
        yield 0.08;
      }
    }, this);
  }

  update(dt, rdt = dt) {
    if (!this.run) return;
    const now = performance.now() / 1000;
    if (this.slowUntil && now > this.slowUntil) { this.game.timeScale = this.baseTS || 1; this.slowUntil = 0; }
    this.letter = damp(this.letter, this.letterTarget, 5, rdt);
    try { this.stage.update && this.stage.update(dt, this.time); } catch (e) { /* stage without updaters */ }
    // real statues keep updating (their cracks open, rubble flies); stand-ins freeze
    if (this.mon.group.visible && (!this.frozen || typeof this.mon.setStone === 'function')) this.mon.update(dt);
    if (this.pet && this.pet.update) this.pet.update(dt);
    if (this.arms && this.arms.update) this.arms.update(dt, { speed: this.bobAmp });
    this.sparks.update(dt); this.dust.update(dt); this.debris.update(dt);
    if (this.chunks) this.chunks.update(dt);
    this.fx2.update(rdt);
    this.rig.update(dt);
    this.updateArms(dt, rdt);
    if (this.blade) this.blade.update();
    for (const c of this.comp) c.pop = Math.max(0, c.pop - rdt * 2.5);
    this.heartKick = Math.max(0, this.heartKick - rdt * 3);
    this.bagBounce = Math.max(0, this.bagBounce - rdt * 4);
    for (const b of this.bigs) b.t += rdt;
    this.bigs = this.bigs.filter((b) => b.t < b.dur);
    if (this.titleCard) { this.titleCard.t += rdt; if (this.titleCard.t > this.titleCard.dur) this.titleCard = null; }
    if (this.tele && this.tele.res) { this.tele.rt += rdt; if (this.tele.rt > 0.4) this.tele = null; }
    if (this.sim) this.hpTrail = damp(this.hpTrail, this.sim.m.hp / this.sim.m.maxHp, this.hpTrail > this.sim.m.hp / this.sim.m.maxHp + 0.002 ? 3 : 30, rdt);
    if (this.phase === 'fight') this.updateFight(dt, rdt);
    else if (this.phase === 'mine') this.updateMine(dt, rdt);
    if (this.loot.length) this.updateLoot(rdt);
    if (this.phase === 'defeat') this.defeatK = Math.min(1, this.defeatK + rdt * 0.45);
  }

  /** Hands: a damped pose (idle sway, wind-up, strike, guard) plus kicks, on top of the arm rig. */
  updateArms(dt, rdt) {
    const P = this.pose, T = this.poseT, K = this.kick, t = this.time;
    const breathe = this.phase === 'fight' ? 1 : 0.6;
    const walk = this.bobAmp;
    const tgt = {
      x: T.x + Math.sin(t * 1.3) * 0.004 * breathe + Math.sin(t * 7) * 0.012 * walk,
      y: T.y + Math.sin(t * 1.7) * 0.006 * breathe - Math.abs(Math.sin(t * 7)) * 0.018 * walk,
      z: T.z, rx: T.rx + Math.sin(t * 1.1) * 0.01 * breathe, ry: T.ry, rz: T.rz,
    };
    // the real arm rig poses its own guard; placeholder hands get a simple raise
    if (this.guardPose > 0) { this.guardPose -= rdt; if (!this.realArms) { tgt.y += 0.07; tgt.x -= 0.05; tgt.rz += 0.95; tgt.rx += 0.25; } }
    // keep the blade a little off the middle of the view so the foe reads
    if (this.realArms && this.phase === 'fight') { tgt.x += 0.025; tgt.rz -= 0.08; }
    for (const k in P) {
      P[k] = damp(P[k], tgt[k], 16, rdt);
      K[k] = damp(K[k], 0, 10, rdt);
    }
    const s = this.realArms ? 0.45 : 1;
    const r = this.armsRoot;
    r.position.set((P.x + K.x) * s, P.y + K.y * s, (P.z + K.z) * s);
    r.rotation.set((P.rx + K.rx) * s, (P.ry + K.ry) * s, (P.rz + K.rz) * s);
    // walking bob on the camera itself
    if (walk > 0.01) {
      this.walkBob += rdt * 7;
      this.cam.position.y += Math.abs(Math.sin(this.walkBob)) * 0.022 * walk;
      this.cam.position.addScaledVector(this.left, Math.sin(this.walkBob) * 0.01 * walk);
      if (Math.sin(this.walkBob) * Math.sin(this.walkBob - rdt * 7) < 0) this.sfx('footstep_stone', { vol: 0.25 });
    }
  }

  updateFight(dt, rdt) {
    const sim = this.sim, inp = this.game.input, ui = this.game.ui;
    this.guardCd = Math.max(0, this.guardCd - rdt);
    const free = inp.pressed && !ui.overUI() && !inp.consumed;
    if ((inp.actionPressed('block') || inp.actionPressed('strike') || free) && this.guardCd <= 0) this.guard();
    if (inp.actionPressed('special')) this.trySpecial();
    if (this.auto) this.autoInputs();
    const a = sim.m.attack;
    if (a && !a.animStarted && !a.resolved && sim.t >= a.impact - 0.16) { a.animStarted = true; this.monsterStrike(a); }
    if (this.simHold > 0) { this.simHold -= dt; return; }
    // the foe keeps turning to face you
    if (!this.frozen) { const g = this.mon.group; const want = Math.atan2(this.stand.x - g.position.x, this.stand.z - g.position.z) - frontYaw(this.mon) + THREE_Q * Math.sin(this.time * 0.4); g.rotation.y = damp(g.rotation.y, want, 3, dt); }
    sim.update(dt);
    for (const e of sim.drain()) { this.onEvent(e); if (this.phase !== 'fight') break; }
  }

  guard() {
    const sim = this.sim;
    if (!sim || sim.over) return;
    this.guardCd = 0.45;
    sim.pressGuard();
    this.guardPose = 0.32;
    this.armsPlay('guard');
    this.sfx('guard', { vol: 0.5 });
  }

  autoInputs() {
    const sim = this.sim;
    const a = sim.m.attack;
    if (a && !a.resolved && sim.t >= a.impact - 0.04 && sim.guardAt < a.start) this.guard();
    if (sim.special >= 1 && !this.specialRunning) this.trySpecial();
  }

  /** A friend's help, reported by the sim: an icon pop and a little beat on screen. */
  onCompanion(e) {
    const c = this.comp.find((x) => x.id === e.id);
    if (c) c.pop = 1;
    if (e.kind === 'sharpen') { this.sharpenBeat(); return; }
    if (e.kind === 'knife') { this.knifeBeat(); return; }
    if (e.kind === 'kindle') { this.kindleBeat(e.element); return; }
    if (e.kind === 'shield') {
      if (c) c.used = true;
      const p = this.screen(this.contact());
      this.game.ui.float('HOLD!', p.x - 70, p.y - 34, { big: true, scale: 2, top: '#ffffff', bottom: '#8ac0ff', life: 0.9 });
      this.sfx('shield_bash', { vol: 0.7 });
      this.fx2.ring(p.x - 70, p.y - 20, '#8ac0ff', { r1: 90, w: 3, life: 0.4 });
    }
  }

  kindleBeat(el = 'fire') {
    const from = this.stand.clone().addScaledVector(this.left, 0.7).add(V3(0, 0.25, 0)).addScaledVector(this.fwd, 0.3);
    const to = this.hitWorld();
    const col = EL_COLOR[el] || EL_COLOR.fire;
    this.co.start(function* (s) {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        s.sparks.emit({ pos: [from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * 0.35, from.z + (to.z - from.z) * t], spread: 0.12, count: 5, life: [0.15, 0.4], size: [1, 2], color: ['#ffffff', col], glow: 3.5, drag: 2 });
        yield null;
      }
      s.sparks.emit({ pos: to.toArray(), radial: [1, 3], count: 30, life: [0.2, 0.5], size: [1, 2], color: ['#ffffff', col], glow: 3, drag: 2 });
    }, this);
    this.sfx('kindle_cast', { vol: 0.7 });
  }

  knifeBeat() {
    const from = this.stand.clone().addScaledVector(this.left, -0.5).add(V3(0, -0.35, 0));
    const to = this.hitWorld();
    const knife = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.16), new THREE.MeshBasicMaterial({ color: 0xd8e0e8 }));
    knife.position.copy(from);
    knife.lookAt(to);
    this.scene.add(knife);
    this.sfx('knife_throw', { vol: 0.6 });
    this.tw.to(knife.position, { x: to.x, y: to.y, z: to.z }, 0.16, { ease: 'linear', onDone: () => {
      knife.parent && knife.parent.remove(knife);
      knife.geometry.dispose(); knife.material.dispose();
      this.sparks.emit({ pos: to.toArray(), radial: [1, 2.5], count: 14, life: [0.15, 0.4], size: 1, color: ['#ffffff', '#d8e0e8'], glow: 2, gravity: 5, drag: 2 });
    } });
  }

  monsterStrike(a) {
    const kind = a.def.kind, mon = this.mon;
    mon.play(kind === 'multi' ? 'multi' : kind === 'special' ? 'special' : 'attack', { hits: a.hits, onDone: () => this.phase === 'fight' && mon.play('idle') });
    // lunge at the camera, then back
    const g = mon.group.position;
    const gap = g.distanceTo(this.stand.clone().setY(g.y));
    const reach = (mon.reach ?? 0.35) + 0.75;
    const lunge = clamp(gap - reach, 0, this.boss ? 0.6 : 1.1);
    if (lunge > 0.03) {
      const to = this.monHome.clone().addScaledVector(this.fwd, -lunge);
      this.tw.to(g, { x: to.x, z: to.z }, 0.13, { ease: 'outQuad' });
      this.co.start(function* (s) { yield 0.34; s.tw.to(g, { x: s.monHome.x, z: s.monHome.z }, 0.42, { ease: 'outCubic' }); }, this);
    }
    if (a.def.effect === 'burn' || a.def.effect === 'poison') {
      const m = mon.mouthPoint ? mon.group.localToWorld(mon.mouthPoint.clone()) : this.hitWorld();
      const c = this.contact();
      const col = a.def.effect === 'burn' ? ['#ffd27a', '#ff6a1a'] : ['#c0ff8a', '#5ab02a'];
      this.sparks.emit({ pos: [m.x, m.y, m.z], vel: [(c.x - m.x) * 2.4, (c.y - m.y) * 2.4, (c.z - m.z) * 2.4], spread: 0.5, count: 50, life: [0.3, 0.6], size: [1, 2], color: col, glow: 3, drag: 1 });
    }
  }

  onEvent(e) {
    const ui = this.game.ui, sim = this.sim, rig = this.rig;
    switch (e.type) {
      case 'swing': return this.onSwing(e);
      case 'firstStrike': { const p = this.screen(this.hitWorld()); ui.float('FIRST!', p.x, p.y - 30, { color: COLORS.gold, life: 1 }); return; }
      case 'miss': { const p = this.screen(this.hitWorld()); ui.float('miss', p.x, p.y - 16, { color: '#c9c1b3', vy: -16 }); this.sfx('dodge'); this.hopMonster(); return; }
      case 'mhit': return this.onMonsterHit(e);
      case 'stun': { if (!sim.m.attack) this.mon.play('stun', { onDone: () => this.mon.play('idle') }); const p = this.screen(this.hitWorld()); ui.float('stun', p.x, p.y - 34, { color: COLORS.shock, vy: -14 }); return; }
      case 'freeze': {
        this.sfx('ice_crack'); this.mon.flash && this.mon.flash('#bff4ff', 0.6);
        const w = this.hitWorld();
        this.sparks.emit({ pos: [w.x, w.y, w.z], radial: [1, 3], count: 40, life: [0.4, 1], size: [1, 2], color: ['#ffffff', '#9ae8ff'], glow: 2, gravity: 3, drag: 1.5 });
        const p = this.screen(w);
        ui.float('FROZEN', p.x, p.y - 30, { big: true, scale: 2, top: '#ffffff', bottom: '#4fc0ff' });
        return;
      }
      case 'interrupt': this.endTele('interrupt'); this.mon.play('stun', { onDone: () => this.mon.play('idle') }); return;
      case 'reaction': { const p = this.screen(this.hitWorld()); ui.float(e.name, p.x, p.y - 30, { big: true, scale: 2, top: '#ffffff', bottom: '#c08aff', life: 1.1 }); this.sfx('synergy'); return; }
      case 'telegraph': {
        this.tele = { start: sim.t, impact: sim.t + e.windup, windup: e.windup, kind: e.kind, res: null, rt: 0 };
        this.mon.play('windup');
        const col = e.kind === 'unblockable' ? '#ff4a4a' : e.kind === 'heavy' ? '#ff9a3a' : '#ffe08a';
        this.co.start(function* (s) {
          const T = s.tele;
          while (s.tele === T && !T.res && s.phase === 'fight') { s.mon.flash && s.mon.flash(col, 0.07); yield 0.16; }
        }, this);
        this.sfx(e.kind === 'unblockable' ? 'qte_prompt' : 'monster_growl', { vol: 0.5 });
        return;
      }
      case 'guard': return;
      case 'parry': {
        this.endTele('parry');
        const c = this.contact();
        this.sparks.emit({ pos: c.toArray(), radial: [2, 6], count: 70, life: [0.2, 0.7], size: [1, 2], color: ['#ffffff', '#fff0b0', '#ffd25e'], glow: 4, gravity: 5, drag: 2 });
        const p = this.screen(c);
        this.fx2.ring(p.x, p.y, '#ffe08a', { r1: 150, w: 4, life: 0.4 });
        this.fx2.rays(p.x, p.y, '#fff0c0', { n: 12, len: 360, a: 0.3, life: 0.5 });
        this.sfx('parry');
        this.armsPlay('parry');
        this.kick.rz = -0.6; this.kick.z = -0.06;
        this.mon.play('hurt', { onDone: () => this.mon.play('idle') });
        this.game.hitStop(0.12); this.slowmo(0.35, 0.3);
        rig.shake(0.3); rig.fovPunch(-4);
        this.game.renderer.doFlash(0.18, [1, 0.95, 0.8]);
        return;
      }
      case 'block': {
        this.endTele('block');
        const c = this.contact();
        this.sparks.emit({ pos: c.toArray(), radial: [1, 3], count: 28, life: [0.2, 0.5], size: 1, color: ['#ffffff', '#a9c2d9'], glow: 2, gravity: 6, drag: 2 });
        this.sfx('block');
        this.kick.z = 0.05; this.kick.rx = -0.15;
        rig.shake(0.18);
        return;
      }
      case 'phit': return this.onHeroHit(e);
      case 'pmiss': { this.endTele('miss'); this.sfx('dodge'); this.kick.x = 0.08; return; }
      case 'pheal': { ui.float(`+${e.amount}`, 34, 22, { color: COLORS.heal, vy: -14, life: 0.8 }); return; }
      case 'mheal': { const p = this.screen(this.hitWorld()); ui.float(`+${fmt(e.amount)}`, p.x, p.y - 20, { color: COLORS.heal, vy: -16 }); this.sfx('heal', { vol: 0.5 }); return; }
      case 'status': {
        if (e.st === 'cracked') this.sfx('crack');
        this.fx2.edge(e.st === 'poison' ? '#5ab02a' : e.st === 'burn' ? '#ff6a1a' : '#7a6aa0', 0.35, 0.6);
        return;
      }
      case 'phase': return this.onPhase(e);
      case 'companion': return this.onCompanion(e);
      case 'victory': this.phase = 'victory'; this.tele = null; this.co.start(this.victorySeq.bind(this)); return;
      case 'defeat': this.phase = 'defeat'; this.tele = null; this.co.start(this.defeatSeq.bind(this)); return;
      default: return;
    }
  }

  endTele(res) { if (this.tele) { this.tele.res = res; this.tele.rt = 0; } }
  hopMonster() {
    const g = this.mon.group.position;
    const side = this.monHome.clone().addScaledVector(this.left, rnd.chance(0.5) ? 0.35 : -0.35);
    this.tw.to(g, { x: side.x, z: side.z }, 0.12, { ease: 'outQuad' });
    this.co.start(function* (s) { yield 0.2; s.tw.to(g, { x: s.monHome.x, z: s.monHome.z }, 0.3); }, this);
  }

  onSwing(e) {
    const wind = e.windup;
    // the arm rig plays its own swing, started so its impact lands with the sim's
    const imp = this.arms && this.arms.impactTime ? this.arms.impactTime('swing') : 0.23;
    const k = this.kick;
    this.co.start(function* (s) {
      if (wind - imp > 0.02) yield wind - imp;
      s.armsPlay('swing');
    }, this);
    this.co.start(function* (s) {
      k.rz = -0.35; k.x = 0.05; k.rx = 0.18;
      yield wind * 0.72;
      s.sfx('sword_swing', { vol: 0.55, pitch: 0.9 + rnd.next() * 0.2 });
      k.rz = 0.75; k.x = -0.12; k.z = -0.1; k.rx = -0.25;
    }, this);
  }

  onMonsterHit(e) {
    const ui = this.game.ui, rig = this.rig;
    const hw = this.hitWorld();
    const p = this.screen(hw);
    p.y = Math.max(p.y, 60);
    const jx = rnd.float(-14, 14);
    if (e.dot) {
      const col = EL_COLOR[e.element] || COLORS.text;
      ui.float(fmt(e.dmg), p.x + jx, p.y + 4, { color: col, vy: -18, life: 0.8 });
      this.sparks.emit({ pos: [hw.x, hw.y, hw.z], posSpread: 0.2, vel: [0, e.element === 'bleed' ? -1.2 : 0.8, 0], spread: 0.3, count: 8, life: [0.4, 0.8], size: 1, color: [col], glow: 2, drag: 1 });
      return;
    }
    const crit = !!e.crit, special = !!e.special;
    const grad = crit || special ? ['#fff6c8', '#ff8a1a'] : e.element && EL_GRAD[e.element] ? EL_GRAD[e.element] : e.extra ? ['#e8e0ff', '#a090d0'] : ['#ffffff', '#ffd0a0'];
    ui.float(fmt(e.dmg), p.x + jx, p.y - 12, { big: true, scale: special ? 4 : crit ? 3 : e.extra || e.arc ? 1 : 2, top: grad[0], bottom: grad[1], vy: crit ? -40 : -28, life: crit || special ? 1.2 : 0.85 });
    const el = topElement(this.simWeapon || {});
    const cols = crit ? ['#ffffff', '#fff0b0', '#ffd25e', '#ff8a3a'] : el ? ['#ffffff', EL_COLOR[el]] : ['#ffffff', '#ffe0b0', '#ffb070'];
    this.sparks.emit({ pos: [hw.x, hw.y, hw.z], radial: [1.5, crit || special ? 5.5 : 3], count: special ? 90 : crit ? 50 : e.extra ? 8 : 22, life: [0.2, 0.6], size: 1, color: cols, glow: 3, gravity: 6, drag: 2 });
    if (e.source === 'kindle' || e.arc) { this.sfx(e.arc ? 'zap' : 'kindle_hit', { vol: 0.6 }); this.mon.flash && this.mon.flash(EL_COLOR[e.element] || '#ffffff', 0.06); return; }
    if (e.extra) { this.mon.flash && this.mon.flash('#ffffff', 0.05); return; }
    // a slash streak across the foe, angled with the swing
    const L = 70 + (crit ? 40 : 0);
    const ang = -0.6 + rnd.float(-0.2, 0.2);
    this.fx2.slash(p.x + Math.cos(ang) * L / 2, p.y + Math.sin(ang) * L / 2, p.x - Math.cos(ang) * L / 2, p.y - Math.sin(ang) * L / 2, { w: crit ? 4 : 3, glow: el ? EL_COLOR[el] : '#ffe8a8' });
    this.mon.flash && this.mon.flash(crit ? '#fff0c0' : '#ffffff', crit ? 0.12 : 0.08);
    if (!this.sim.m.attack && this.sim.m.st.stun <= 0) this.mon.play('hurt', { onDone: () => this.phase === 'fight' && this.mon.play('idle') });
    const heavy = this.simWeapon && ['hammer', 'axe'].includes(this.simWeapon.bp);
    this.sfx(special ? 'special_fire' : crit ? 'crit' : heavy ? 'heavy_hit' : this.usingPick ? 'pick_hit' : 'hit', { pitch: 0.95 + rnd.next() * 0.1 });
    if (heavy || crit) {
      const m = this.def.model || {};
      this.debris.spawn({ pos: [hw.x, hw.y, hw.z], count: crit ? 8 : 4, colors: [m.body || '#8a7a6a', m.belly || m.body || '#6a5a4a'], speed: 2, up: 2.5, floor: this.floorY + 0.02, life: 1.2 });
    }
    // knock it back a touch
    const g = this.mon.group.position;
    const back = this.monHome.clone().addScaledVector(this.fwd, crit ? 0.14 : 0.07);
    this.tw.to(g, { x: back.x, z: back.z }, 0.06, { ease: 'outQuad', onDone: () => this.tw.to(g, { x: this.monHome.x, z: this.monHome.z }, 0.25) });
    this.game.hitStop(special ? 0.18 : crit ? 0.09 : 0.035);
    rig.shake(special ? 1.0 : crit ? 0.35 : heavy ? 0.2 : 0.1);
    if (crit && !special) {
      this.slowmo(0.35, 0.22);
      this.game.renderer.doFlash(0.15, [1, 0.95, 0.8]);
      rig.fovPunch(-3);
    }
  }

  onHeroHit(e) {
    const ui = this.game.ui;
    if (e.dot || e.self) { ui.float(`-${e.dmg}`, 36 + rnd.float(-4, 4), 24, { color: e.dot === 'fire' ? COLORS.fire : e.dot ? COLORS.poison : COLORS.curse, vy: -12, life: 0.7 }); return; }
    if (!e.blocked) this.endTele('hit');
    this.heartKick = 1;
    ui.float(`-${e.dmg}`, 40, 26, { big: true, scale: e.dmg >= 15 ? 3 : 2, top: '#ffd0c0', bottom: '#e03a3a', vy: -16 });
    if (e.blocked) return;
    this.armsPlay('hurt');
    this.kick.z = 0.12; this.kick.y = -0.06; this.kick.rx = -0.3;
    this.sfx('hurt');
    this.rig.shake(Math.min(0.9, 0.25 + e.dmg / 40));
    this.rig.fovPunch(4);
    const big = e.dmg >= this.run.maxHp * 0.12;
    this.fx2.edge('#d02a2a', big ? 0.75 : 0.5, 0.7);
    const c = this.screen(this.contact());
    const eff = e.attack && e.attack.effect;
    if (eff === 'burn') this.fx2.wash('#ff6a1a', 0.18, 0.4);
    else if (eff === 'poison') this.fx2.wash('#5ab02a', 0.18, 0.4);
    else this.fx2.claw(c.x + rnd.float(-40, 40), c.y - 10, '#ff8a7a');
    if (big) this.game.renderer.doFlash(0.2, [1, 0.25, 0.2]);
    this.petPlay('yelp');
  }

  onPhase(e) {
    this.mon.setPhase && this.mon.setPhase(e.phase + 1);
    if (e.text) this.titleCard = { name: e.text, t: 0, dur: 2.2, boss: true, small: true };
    this.mon.play('roar', { onDone: () => this.mon.play('idle') });
    this.sfx(this.mid === 'medusa' ? 'medusa_laugh' : 'herald_roar', { vol: 0.8 });
    this.sfx('boss_roar', { vol: 0.4 });
    this.rig.shake(0.8); this.rig.fovPunch(5);
    this.game.renderer.doFlash(0.3, [1, 0.6, 0.9]);
    this.simHold = 1.2;
    this.tele = null;
    if (e.event === 'shatter' && this.sim.rearm) this.sim.rearm(this.simWeapon);
  }

  // =============================================================== special
  trySpecial() {
    const sim = this.sim;
    if (!sim || this.phase !== 'fight' || sim.special < 1 || this.specialRunning || sim.over) return;
    this.specialRunning = true;
    this.co.start(this.specialSeq.bind(this));
  }

  *specialSeq() {
    const rig = this.rig, ui = this.game.ui, sim = this.sim;
    this.sfx('special_charge');
    this.armsPlay('special');
    this.letterTarget = 0.5;
    const k = this.kick;
    k.rz = -0.5; k.y = 0.06; k.rx = 0.35;
    const hw = this.hitWorld();
    const dash = this.stand.clone().lerp(this.monHome.clone().setY(this.stand.y), 0.42);
    this.slowmo(0.4, 0.45);
    rig.moveTo(dash.toArray(), hw.toArray(), 54, 0.28, 'inCubic');
    const el = topElement(this.simWeapon);
    const col = el ? EL_COLOR[el] : '#ffd25e';
    for (let i = 0; i < 8; i++) {
      const tip = this.blade ? this.blade.tipWorld() : this.contact();
      this.sparks.emit({ pos: tip.toArray(), radial: [0.3, 1.2], count: 6, life: [0.2, 0.5], size: [1, 2], color: ['#ffffff', col], glow: 4, drag: 2 });
      yield 0.035;
    }
    k.rz = 1.1; k.x = -0.18; k.z = -0.16; k.rx = -0.4;
    if (sim.over || this.phase !== 'fight') { this.specialRunning = false; return; }
    sim.useSpecial(0.85);
    const p = this.screen(hw);
    this.fx2.rays(p.x, p.y, '#fff0c0', { n: 18, len: 520, a: 0.36, life: 0.9 });
    this.fx2.ring(p.x, p.y, col, { r1: 260, w: 6, life: 0.5 });
    this.sparks.emit({ pos: hw.toArray(), radial: [2, 8], count: 160, life: [0.3, 1.1], size: [1, 2], color: ['#ffffff', col, '#ffd25e'], glow: 4, gravity: 4, drag: 1.5 });
    this.game.renderer.doFlash(0.5, [1, 0.95, 0.85]);
    for (const e of sim.drain()) this.onEvent(e);
    ui.float('!!', p.x, p.y - 60, { big: true, scale: 3, top: '#ffffff', bottom: '#ffd25e', life: 0.7 });
    yield 0.45;
    this.letterTarget = 0;
    if (this.phase === 'fight') rig.moveTo(this.stand.toArray(), this.fightLook(), 62, 0.45, 'outCubic');
    yield 0.45;
    if (this.phase === 'fight') this.aimFight(5);
    this.specialRunning = false;
  }

  // =============================================================== victory: petrify → blade → mine → loot
  *victorySeq() {
    const rig = this.rig, run = this.run, ui = this.game.ui;
    this.tele = null;
    run.stats.kills = (run.stats.kills || 0) + 1;
    if (this.elite) run.stats.elites = (run.stats.elites || 0) + 1;
    save.data.stats.monsters = (save.data.stats.monsters || 0) + 1;
    save.learn && save.learn('discovered.monsters', this.mid);
    this.slowmo(0.25, 0.6);
    this.game.renderer.doFlash(0.3, [1, 1, 1]);
    rig.shake(0.5);
    const hw = this.hitWorld();
    const petrifies = !!this.blade; // the stone lives in a blade, not in a pickaxe
    this.mon.play('hurt');
    rig.moveTo(this.stand.clone().lerp(this.monHome.clone().setY(this.stand.y), 0.18).toArray(), this.monCenter().toArray(), 56, 0.6, 'outCubic');
    this.letterTarget = 0.7;
    if (!petrifies) { yield* this.plainDeath(); return; }
    yield 0.32;
    // ---- the stone takes it, from the feet up (and the warm light drains to cold)
    this.phase = 'petrify';
    if (this.torch) this.tw.to(this.torch.color, { r: 0.78, g: 0.86, b: 1 }, 0.9, { ease: 'inOutSine' });
    this.sfx('petrify');
    this.petPlay('bark');
    const t0 = this.time, dur = this.boss ? 2.2 : 1.35;
    let k = 0, crackTick = 0;
    while (k < 1) {
      k = clamp((this.time - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 2);
      setMonsterStone(this.mon, e);
      const y = this.floorY + this.mh * e;
      if (rnd.chance(0.7)) {
        const c = this.monCenter();
        this.dust.emit({ pos: [c.x, y, c.z], posSpread: [this.mw * 0.4, 0.04, this.mw * 0.3], vel: [0, 0.35, 0], spread: 0.25, count: 2, life: [0.5, 1], size: [1, 2], color: ['#c8c4bc', '#9a968e'], alpha: 0.6 });
        this.sparks.emit({ pos: [c.x, y, c.z], posSpread: [this.mw * 0.4, 0.03, this.mw * 0.3], vel: [0, 0.6, 0], spread: 0.2, count: 1, life: [0.3, 0.6], size: 1, color: ['#c8fff0', '#7affd8'], glow: 3 });
      }
      if (k > crackTick) { this.sfx('stone_crack', { vol: 0.35, pitch: 0.8 + crackTick }); crackTick += 0.34; }
      if (k > 0.82) this.frozen = true; // the pose sets hard
      yield null;
    }
    setMonsterStone(this.mon, 1);
    this.frozen = true;
    this.game.renderer.doFlash(0.18, [0.85, 1, 0.95]);
    rig.shake(0.25);
    this.sfx('stone_crack', { vol: 0.8, pitch: 0.6 });
    const cp = this.screen(this.monCenter());
    this.fx2.ring(cp.x, cp.y, '#c8fff0', { r1: 200, w: 3, life: 0.6 });
    yield 0.4;
    // ---- …and creeps up your blade
    yield* this.bladeCreep();
    // ---- mine it
    yield* this.mineSeq();
    // ---- the blade gives out?
    if (this.weapon && (this.weapon.stone || 0) >= 1) yield* this.crumbleSeq();
    yield* this.wrapUp();
  }

  /** Killed with the pickaxe: no stone, it just falls — and leaves only its parts. */
  *plainDeath() {
    this.mon.play('die');
    this.sfx('monster_die');
    const hw = this.hitWorld();
    this.sparks.emit({ pos: hw.toArray(), radial: [2, 5], count: 80, life: [0.4, 1], size: [1, 2], color: ['#ffffff', '#ffd25e', '#ff8a3a'], glow: 3, gravity: 4, drag: 1.5 });
    yield 1.4;
    const items = [];
    for (const d of this.def.drops || []) if (MATERIALS[d.id] && rnd.chance(Math.min(1, d.chance * 0.7))) { items.push(makeItem(d.id, 1)); break; }
    this.poseT.y = 0;
    yield* this.lootSeq(items, hw);
    yield* this.wrapUp();
  }

  *bladeCreep() {
    const w = this.weapon;
    if (!w || !this.blade) return;
    this.phase = 'blade';
    const s0 = w.stone || 0;
    let s1, cost;
    if (Petrify.addStone && this.run.weapon === w) { const r = Petrify.addStone(this.run, this.def); s1 = r.stone; cost = r.cost; }
    else { cost = this.stoneCost(); s1 = Math.min(1, s0 + cost); }
    if (cost <= 0) return;
    // bring the blade up into view
    const T = this.poseT;
    const lift = this.realArms ? 0.55 : 1; // the real rig already holds the blade high
    T.x = -0.12 * lift; T.y = 0.1 * lift; T.z = 0.06 * lift; T.rz = 0.55 * lift; T.rx = 0.3 * lift;
    this.armsPlay('idle');
    this.rig.moveTo(this.stand.toArray(), this.stand.clone().addScaledVector(this.fwd, 2).add(V3(0, -0.35, 0)).toArray(), 56, 0.5, 'inOutCubic');
    yield 0.55;
    this.sfx('stone_crack', { vol: 0.5, pitch: 1.2 });
    const t0 = this.time, dur = 0.9 + cost * 2;
    let k = 0;
    while (k < 1) {
      k = clamp((this.time - t0) / dur, 0, 1);
      const v = lerp(s0, s1, 1 - Math.pow(1 - k, 2));
      this.blade.set(v);
      this.stoneShown = v;
      if (rnd.chance(0.6)) {
        const f = this.blade.frontWorld();
        this.sparks.emit({ pos: f.toArray(), posSpread: 0.015, vel: [0, 0.25, 0], spread: 0.15, count: 1, life: [0.25, 0.5], size: 1, color: ['#c8fff0', '#ffffff'], glow: 3 });
        this.dust.emit({ pos: f.toArray(), posSpread: 0.02, vel: [0, -0.15, 0], spread: 0.05, count: 1, life: [0.4, 0.8], size: 1, color: ['#a8a49c'], alpha: 0.7, gravity: 1.5 });
      }
      yield null;
    }
    w.stone = s1;
    this.stoneShown = s1;
    if (this.run.weapon === w) this.run.weapon.stone = s1;
    yield 0.35;
    T.x = 0; T.y = 0; T.z = 0; T.rz = 0; T.rx = 0;
  }

  stoneCost() {
    try { return clamp(Petrify.stoneCost ? Petrify.stoneCost(this.def, this.weapon, this.run) : 0.12, 0, 1); } catch (e) { return 0.12; }
  }

  *mineSeq() {
    this.phase = 'mine';
    const run = this.run;
    // swap the blade for the pickaxe
    this.poseT.y = -0.3;
    yield 0.18;
    this.heldBlade = this.wmesh; this.heldBladeStone = this.blade;
    if (this.wmesh) this.wmesh.visible = false;
    let pick = null;
    try { pick = W3.buildWeaponMesh({ bp: 'pickaxe', ids: ['iron', 'iron', 'copper'], grade: 1 }); } catch (e) { pick = null; }
    if (pick) {
      if (this.arms && this.arms.hold) { try { this.arms.hold('pickaxe', pick); } catch (e) { /* placeholder */ } }
      if (!pick.parent) { this.armsRoot.add(pick); pick.position.set(0.24, -0.27, -0.5); pick.rotation.set(-0.55, 0.15, 0.38); pick.scale.setScalar(0.62); }
    }
    this.pickMesh = pick;
    this.armsPlay('mine');
    this.poseT.y = 0;
    this.sfx('equip', { vol: 0.5 });
    const n = this.boss ? 6 : this.elite ? 5 : 4;
    const pts = statueCracks(this.mon, n);
    this.cracks = pts.map((w, i) => ({ w, i, hit: false, t: 0, seed: i * 3.7 + 1 }));
    this.mine = { t: 0, dur: (this.boss ? 5.5 : 4.2) + n * 0.15, hits: 0, autoT: 0.35 };
    this.rig.moveTo(this.stand.clone().lerp(this.monHome.clone().setY(this.stand.y), 0.25).toArray(), this.monCenter().toArray(), 56, 0.5, 'inOutCubic');
    this.letterTarget = 0.35;
    this.petPlay('dig');
    this.sfx('vein_glint', { vol: 0.6 });
    yield () => this.mine.done;
    // ---- burst
    const hits = this.mine.hits;
    const total = this.cracks ? this.cracks.length : hits;
    this.cracks = null;
    const items = this.statueItems(hits, total);
    const oreCols = items.map((it) => MATERIALS[it.id] && MATERIALS[it.id].color).filter(Boolean);
    this.sfx('stone_shatter');
    this.sfx('rock_break', { vol: 0.7 });
    this.game.renderer.doFlash(0.35, [1, 0.98, 0.9]);
    this.game.hitStop(0.08);
    this.rig.shake(0.9);
    const c = this.monCenter();
    const p = this.screen(c);
    this.fx2.rays(p.x, p.y, '#fff0c0', { n: 16, len: 480, a: 0.3, life: 0.9 });
    this.fx2.ring(p.x, p.y, '#ffffff', { r1: 240, w: 5, life: 0.5 });
    this.chunks = shatterStatue(this.mon, this.debris, oreCols);
    if (this.torch && this.torchCol) this.tw.to(this.torch.color, { r: this.torchCol.r, g: this.torchCol.g, b: this.torchCol.b }, 1.2, { ease: 'inOutSine' });
    this.dust.emit({ pos: [c.x, this.floorY + 0.2, c.z], posSpread: [this.mw * 0.5, 0.1, this.mw * 0.4], vel: [0, 0.6, 0], spread: 1, count: 70, life: [0.8, 1.8], size: [2, 3], sizeEnd: 6, color: ['#c8c4bc', '#9a968e', '#6e6a66'], alpha: 0.6, drag: 1.4 });
    this.sparks.emit({ pos: c.toArray(), radial: [2, 6], count: 90, life: [0.3, 1.0], size: [1, 2], color: ['#ffffff', '#c8fff0', ...oreCols.slice(0, 3)], glow: 3, gravity: 5, drag: 1.5 });
    this.petPlay('happy');
    this.sfx('pip_yip', { vol: 0.6 });
    this.letterTarget = 0;
    yield 0.55;
    yield* this.lootSeq(items, c);
    // the pickaxe away, the blade back
    if (this.pickMesh) { this.pickMesh.parent && this.pickMesh.parent.remove(this.pickMesh); this.pickMesh = null; }
    if (this.heldBlade) {
      this.heldBlade.visible = true;
      if (this.arms && this.arms.hold) { try { this.arms.hold('weapon', this.heldBlade); } catch (e) { /* placeholder */ } }
      if (!this.heldBlade.parent) this.armsRoot.add(this.heldBlade);
    }
    this.armsPlay('idle');
  }

  statueItems(hits, total) {
    const run = this.run;
    let items = [];
    try {
      if (Petrify.statueLoot && Petrify.statueLoot.length > 0) items = Petrify.statueLoot(run, this.def, hits, total) || [];
    } catch (e) { items = []; }
    if (!items.length) {
      run.stats.statues = (run.stats.statues || 0) + 1;
      // until the real loot tables land: the foe's parts plus an ore by depth
      for (const d of this.def.drops || []) if (MATERIALS[d.id] && rnd.chance(d.chance)) items.push(makeItem(d.id, 2));
      const ores = [['copper', 'iron', 'tin'], ['iron', 'silver', 'quartz'], ['silver', 'gold', 'ruby'], ['gold', 'mithril', 'emerald']][this.act];
      for (let i = 0; i < 1 + (hits >= 3 ? 1 : 0); i++) { const id = rnd.pick(ores); if (MATERIALS[id]) items.push(makeItem(id, clamp(1 + Math.floor(hits / 2), 0, 4))); }
      if (MATERIALS.petrite) items.push(makeItem('petrite', 2));
    }
    return items.slice(0, 8);
  }

  updateMine(dt, rdt) {
    const M = this.mine, inp = this.game.input;
    if (!M || M.done) return;
    M.t += rdt;
    for (const c of this.cracks) c.t += rdt;
    let target = null;
    if (inp.pressed && !inp.consumed) {
      let best = 40;
      for (const c of this.cracks) {
        if (c.hit) continue;
        const p = this.screen(c.w);
        const d = Math.hypot(p.x - inp.x, p.y - inp.y);
        if (d < best) { best = d; target = c; }
      }
      if (!target) {
        // a swing at bare stone: a jolt and a dull clank, nothing more
        this.kick.rz = 0.5; this.kick.z = -0.06;
        this.sfx('pick_miss', { vol: 0.4 });
      }
    }
    if (!target && inp.actionPressed('strike')) target = this.cracks.find((c) => !c.hit) || null;
    if (!target && this.auto) { M.autoT -= rdt; if (M.autoT <= 0) { M.autoT = 0.45; target = this.cracks.find((c) => !c.hit) || null; } }
    if (target) this.strikeCrack(target);
    const left = this.cracks.filter((c) => !c.hit).length;
    if (!left || M.t >= M.dur) M.done = true;
  }

  strikeCrack(c) {
    const M = this.mine;
    c.hit = true;
    M.hits++;
    this.armsPlay('mineHit');
    this.kick.rz = 0.7; this.kick.z = -0.1; this.kick.rx = -0.3; this.kick.x = -0.08;
    crackStatue(this.mon, c.i, c.w, this.debris, this.sparks);
    const p = this.screen(c.w);
    this.fx2.slash(p.x + 22, p.y - 22, p.x - 22, p.y + 22, { w: 3, glow: '#c8fff0' });
    this.fx2.ring(p.x, p.y, '#c8fff0', { r1: 60, w: 2, life: 0.3 });
    this.game.ui.burst(p.x, p.y, 10, { colors: ['#c8c4bc', '#ffffff', '#7affd8'], speed: 110, up: 50, gravity: 260 });
    this.sfx('pick_hit', { pitch: 0.9 + M.hits * 0.06 });
    this.sfx('stone_crack', { vol: 0.5, pitch: 0.9 + M.hits * 0.08 });
    this.game.hitStop(0.045);
    this.rig.shake(0.18);
    // the statue jolts
    const g = this.mon.group.position;
    const j = this.monHome.clone().addScaledVector(this.fwd, 0.05);
    this.tw.to(g, { x: j.x, z: j.z }, 0.04, { onDone: () => this.tw.to(g, { x: this.monHome.x, z: this.monHome.z }, 0.15) });
  }

  // =============================================================== loot flies into the pack
  *lootSeq(items, fromWorld) {
    if (!items || !items.length) return;
    this.phase = 'loot';
    const run = this.run, game = this.game;
    const p0 = this.screen(fromWorld || this.monCenter());
    let i = 0;
    for (const it of items) {
      const m = MATERIALS[it.id];
      const rare = m && RARITY[m.rarity] && RARITY[m.rarity].order >= 2;
      if (rare && game.scenes.reveal) {
        let done = false;
        try { game.pushOverlay('reveal', { item: it, onDone: () => { done = true; } }); } catch (e) { done = true; }
        yield () => done;
      }
      const a = -Math.PI / 2 + (i - (items.length - 1) / 2) * 0.5 + rnd.float(-0.15, 0.15);
      this.loot.push({ it, x0: p0.x, y0: p0.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 160 - 60, t: -i * 0.09, dur: 0.95, sprite: null });
      i++;
    }
    yield () => !this.loot.length;
    yield 0.25;
    void run;
  }

  updateLoot(rdt) {
    const ui = this.game.ui, run = this.run;
    const bx = 22, by = ui.h - 46;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      L.t += rdt;
      if (L.t < 0) continue;
      if (!L.sprite) { try { L.sprite = materialSprite(L.it.id, 24); } catch (e) { L.sprite = null; } this.sfx('pickup', { vol: 0.4, pitch: 0.9 + i * 0.05 }); }
      const k = L.t / L.dur;
      if (k >= 1) {
        let placed = false;
        try { placed = run.addItem ? run.addItem(L.it) : run.bag.add(L.it); } catch (e) { placed = false; }
        this.bagBounce = 1;
        this.sfx(placed ? 'item_place' : 'deny', { vol: 0.5 });
        ui.burst(bx + 8, by + 8, 6, { colors: ['#ffe08a', '#ffffff'], speed: 60, up: 30 });
        this.loot.splice(i, 1);
        continue;
      }
      // pop out, hang a moment, then swoop into the pack
      const pop = Math.min(1, k / 0.35);
      const px = L.x0 + L.vx * 0.35 * pop, py = L.y0 + (L.vy * 0.35 + 140 * 0.35 * 0.35) * pop;
      const s = Math.max(0, (k - 0.35) / 0.65), e = s * s * (3 - 2 * s);
      L.x = lerp(px, bx + 8, e);
      L.y = lerp(py, by + 8, e) - Math.sin(e * Math.PI) * 40;
      L.scale = 1 + (1 - e) * 0.6;
    }
  }

  // =============================================================== a stone blade crumbles
  *crumbleSeq() {
    const run = this.run, w = this.weapon;
    if (!w || !this.wmesh) { run.weapon = null; return; }
    this.phase = 'crumble';
    const T = this.poseT;
    T.x = -0.14; T.y = 0.1; T.z = 0.08; T.rz = 0.55; T.rx = 0.3;
    this.rig.moveTo(this.stand.toArray(), this.stand.clone().addScaledVector(this.fwd, 2).add(V3(0, -0.4, 0)).toArray(), 54, 0.5, 'inOutCubic');
    this.letterTarget = 0.8;
    yield 0.7;
    for (let i = 0; i < 3; i++) {
      this.sfx('stone_crack', { pitch: 1 + i * 0.12, vol: 0.6 });
      this.kick.x = (i % 2 ? 1 : -1) * 0.02; this.kick.rz = (i % 2 ? 1 : -1) * 0.06;
      const f = this.blade ? this.blade.tipWorld() : this.contact();
      this.dust.emit({ pos: f.toArray(), posSpread: 0.04, vel: [0, -0.4, 0], spread: 0.1, count: 6, life: [0.5, 1], size: [1, 2], color: ['#a8a49c', '#8e8a84'], alpha: 0.8, gravity: 2 });
      yield 0.32;
    }
    this.wmesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.wmesh);
    const c = box.getCenter(V3()), s = box.getSize(V3());
    for (let i = 0; i < 5; i++) {
      const at = c.clone().add(V3((rnd.next() - 0.5) * s.x, (rnd.next() - 0.5) * s.y, (rnd.next() - 0.5) * s.z));
      this.debris.spawn({ pos: at.toArray(), count: 5, colors: ['#a8a49c', '#8e8a84', '#6e6a66'], speed: 0.8, up: 0.6, floor: this.floorY + 0.02, life: 1.8, scale: [0.3, 0.7] });
    }
    this.wmesh.parent && this.wmesh.parent.remove(this.wmesh);
    this.wmesh = null; this.blade = null; this.heldBlade = null;
    this.sfx('stone_shatter', { pitch: 0.75 });
    this.game.hitStop(0.06);
    this.slowmo(0.3, 0.6);
    this.rig.shake(0.35);
    this.tw.to(this.world.post, { saturation: 0.6 }, 0.3);
    this.big('crumbled', 1.6, { scale: 2, top: '#e8e4dc', bottom: '#8e8a84' });
    if (Petrify.crumbleWeapon && run.weapon === w) Petrify.crumbleWeapon(run);
    else { run.weapon = null; run.stats.crumbled = (run.stats.crumbled || 0) + 1; }
    this.weapon = null;
    this.usingPick = true;
    T.x = 0; T.y = -0.3; T.z = 0; T.rz = 0; T.rx = 0;
    yield 1.4;
    this.tw.to(this.world.post, { saturation: 1.12 }, 1.0);
  }

  // =============================================================== leaving
  *wrapUp() {
    const game = this.game, run = this.run;
    this.phase = 'done';
    // stews last a number of fights
    if (Array.isArray(run.buffs)) {
      if (typeof run.tickBuffs === 'function') { try { run.tickBuffs(); } catch (e) { /* run without buffs */ } }
      else { for (const b of run.buffs) if (typeof b.fights === 'number') b.fights--; run.buffs = run.buffs.filter((b) => typeof b.fights !== 'number' || b.fights > 0); }
    }
    save.write && save.write();
    this.petPlay('happy');
    yield 0.3;
    const finish = Flow.finishNode || Flow.finish;
    const over = run.bag && run.bag.overflow && run.bag.overflow.length;
    if (over && Flow.openBag) {
      const o = Flow.openBag(game, { title: 'Spoils', onClose: () => finish(game) });
      if (!o) finish(game);
    } else finish(game);
  }

  *defeatSeq() {
    this.phase = 'defeat';
    this.slowmo(0.3, 1.0);
    this.armsPlay('hurt');
    this.poseT.y = -0.4;
    this.petPlay('whine');
    this.sfx('defeat_sting');
    this.game.audio && this.game.audio.stopMusic && this.game.audio.stopMusic(1.5);
    const down = this.stand.clone().setY(this.floorY + 0.28).addScaledVector(this.fwd, 0.25);
    this.rig.tRoll = 0.9;
    this.rig.moveTo(down.toArray(), this.monCenter().toArray(), 66, 1.4, 'inCubic');
    this.tw.to(this.world.post, { saturation: 0.3, exposure: 0.75, vignette: 0.8 }, 2.4, { ease: 'inOutSine' });
    for (let i = 0; i < 6; i++) { this.fx2.edge('#8e8a84', 0.6, 0.9); yield 0.35; }
    const go = Flow.gameOver;
    if (go) go(this.game, this.def.name);
  }

  // =============================================================== drawing
  draw(ui) {
    if (!this.run || !this.fx2) return;
    const sim = this.sim;
    const fighting = this.phase === 'fight';
    this.fx2.draw(ui);
    if (fighting && sim) drawTelegraph(ui, this);
    if (this.phase === 'mine' && this.cracks) this.drawMine(ui);
    // letterbox
    if (this.letter > 0.01) {
      const bh = Math.round(34 * this.letter);
      ui.rect(0, 0, ui.w, bh, '#000000');
      ui.rect(0, ui.h - bh, ui.w, bh, '#000000');
    }
    if (['fight', 'victory', 'petrify', 'blade', 'mine', 'loot', 'crumble'].includes(this.phase)) {
      drawHeart(ui, this);
      if (fighting) drawMonsterBar(ui, this);
      drawBlade(ui, this);
      if (fighting) drawSpecial(ui, this);
    }
    if (this.loot.length || this.phase === 'loot' || this.bagBounce > 0) this.drawLoot(ui);
    this.drawTitleCard(ui);
    for (const b of this.bigs) {
      const k = b.t / b.dur;
      const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.8 : 1;
      ui.big(b.text, ui.w / 2, b.y ?? ui.h / 2 - 30, { scale: b.scale || 3, top: b.top, bottom: b.bottom, pop: Math.round(pop * 4) / 4, alpha: k > 0.8 ? (1 - k) / 0.2 : 1 });
    }
    // touch: one big Guard medallion, Special above it when charged
    if (fighting && sim && !sim.over) {
      const T = this.tele;
      const hot = T && !T.res;
      ui.touchButton('block', ui.w - 62, ui.h - 64, 38, { icon: 'shield', label: 'GUARD', style: hot ? 'brass' : 'iron', glow: hot, glowColor: '#ffe08a' });
      if (sim.special >= 1) ui.touchButton('special', ui.w - 150, ui.h - 120, 28, { icon: 'star', label: 'SPECIAL', style: 'rune', glow: true, glowColor: '#c08aff' });
    }
    if (this.phase === 'defeat' && this.defeatK > 0) ui.rect(0, 0, ui.w, ui.h, '#07060b', this.defeatK * 0.7);
  }

  drawTitleCard(ui) {
    const tc = this.titleCard;
    if (!tc) return;
    const k = tc.t / tc.dur;
    const a = k < 0.12 ? k / 0.12 : k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1;
    if (tc.boss) {
      ui.ctx.globalAlpha = a;
      ui.big(tc.small ? tc.name : tc.name.toUpperCase(), ui.w / 2, ui.h - 70, { scale: tc.small ? 2 : 3, top: '#fff6c8', bottom: this.mid === 'medusa' ? '#7affb0' : '#ff8a3a' });
      if (tc.sub) ui.text(tc.sub, ui.w / 2, ui.h - 50, { align: 'center', color: '#e8d8c0', outline: '#140c10', outlineShadow: false });
      ui.ctx.globalAlpha = 1;
    } else {
      ribbonTitle(ui, tc.name, ui.w / 2, ui.h - 64, this.elite ? 'purple' : 'red', a);
    }
  }

  drawMine(ui) {
    const M = this.mine;
    for (const c of this.cracks) {
      const p = this.screen(c.w);
      drawCrackTarget(ui, p.x, p.y, this.time, { seed: c.seed, hit: c.hit });
    }
    // a thin timer under the statue
    const left = clamp(1 - M.t / M.dur, 0, 1);
    const w = 120, x = Math.round(ui.w / 2 - w / 2), y = ui.h - 56;
    ui.rect(x - 1, y - 1, w + 2, 4, '#140c10');
    ui.rect(x, y, Math.round(w * left), 2, left < 0.3 ? '#ff8a7a' : '#c8fff0');
    if (!ui.touch) ui.icon('mouseL', x + w + 6, y - 4);
  }

  drawLoot(ui) {
    const bx = 22, by = ui.h - 46;
    const s = 2 + this.bagBounce * 0.6;
    const ctx = ui.ctx;
    ctx.save();
    ctx.translate(bx + 8, by + 8); ctx.scale(s, s);
    ui.icon('bag', -5, -5);
    ctx.restore();
    for (const L of this.loot) {
      if (L.t < 0 || !L.sprite || L.x === undefined) continue;
      const w = Math.round(L.sprite.width * (L.scale || 1)), h = Math.round(L.sprite.height * (L.scale || 1));
      ctx.drawImage(L.sprite, Math.round(L.x - w / 2), Math.round(L.y - h / 2), w, h);
    }
  }
}
