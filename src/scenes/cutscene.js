// Cutscenes: real-time 3D cinematics staged with the game's own voxel sets, forgers and monsters.
// A cutscene is a list of shots. Each shot has a duration, a camera move (Catmull-Rom paths for the
// position and the look target, eased FOV and roll, handheld sway, trauma shake) and timed cues that
// drive actors (anims, walks, monster intros and roars, weapon shatters, stone creep), lights
// (colour and intensity ramps, flashes, flicker), the grade (exposure, saturation, lift/gain,
// vignette, bloom) and particles. Captions are sparse narration in the letterbox; people speak in
// floating lines over their heads, and c.ask() hands a line to the dialogue overlay so you can
// reply (the timeline waits). Use as an overlay (game.pushOverlay('cutscene', {id, onDone})) or a scene (game.go), or
// embed a Cine in another scene. Skip: tap twice, Esc, or the Skip tag.
// Also exports FX2D: a screen-space particle + light-sting layer other scenes use for cinematics.
import * as THREE from 'three';
import { Scene, disposeTree } from '../core/game.js';
import { buildStage } from '../models/stage_vox.js';
import { envMaterial, envGlowMaterial } from '../models/stage_vox_kit.js';
import { buildCharacter } from '../models/characters.js';
import { buildMonster } from '../models/monsters.js';
import { buildProp } from '../models/props.js';
import { buildWeaponMesh, shatterPieces, updateShards, crackWeapon } from '../models/weapons3d.js';
import { ParticleSystem, Debris } from '../gfx/particles.js';
import { glowSprite, beam, aimBeam, waveRing, waveWall, shockSphere, stoneify, campAnchors, playFirst, buildBowl, buildOldMap, buildCrack, standInSerpent } from '../art/cutscene_art.js';
import { buildRoom } from '../models/room_vox.js';
import { buildPet } from '../models/pet.js';
import { buildMedusa, buildMedusaTotem } from '../models/medusa.js';
import { drawFloat, VOICES } from './dialogue.js';
import * as UNLOCKS from '../systems/unlocks.js';
import * as RUNMOD from '../systems/run.js';
import { buildOreModel } from '../models/ore_voxel.js';
import { tagCanvas } from '../art/handpaint.js';
import { save } from '../core/save.js';
import { MONSTERS } from '../data/monsters.js';
import { CHARACTERS, CHARACTER_ORDER } from '../data/characters.js';
import { clamp, ease, noise2, hexToRgb, lerp, angleLerp, damp } from '../core/math.js';

const BAR = 58;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v3 = (a) => (a.isVector3 ? a.clone() : V(a[0], a[1], a[2]));
const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const rnd = (a, b) => a + Math.random() * (b - a);
const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

function pathOf(s) {
  if (s == null) return { pt: V() };
  if (typeof s === 'function') return { fn: s };
  if (s.isVector3) return { pt: s.clone() };
  if (!Array.isArray(s[0]) && !s[0].isVector3) return { pt: v3(s) };
  if (s.length === 1) return { pt: v3(s[0]) };
  return { curve: new THREE.CatmullRomCurve3(s.map(v3), false, 'centripetal') };
}
function evalPath(P, k, c, out) {
  if (P.fn) return out.copy(P.fn(c, k));
  if (P.pt) return out.copy(P.pt);
  return P.curve.getPoint(k, out);
}
/** Number, [a, b, …] piecewise over k, or fn(k). */
function spec(v, k) {
  if (typeof v === 'number') return v;
  if (typeof v === 'function') return v(k);
  if (v.length === 1) return v[0];
  const f = k * (v.length - 1), i = Math.min(v.length - 2, Math.floor(f));
  return v[i] + (v[i + 1] - v[i]) * (f - i);
}
function parseId(id) {
  const m = /^([a-z]+)_(.+)$/.exec(id || '');
  if (!m) return [id || 'intro', null];
  return [m[1], /^\d+$/.test(m[2]) ? +m[2] : m[2]];
}

// ================================================================== the player
export class Cine {
  /** p: {char, hold (keep the last shot running), noSkip, note, region, …script options} */
  constructor(game, id, p = {}) {
    this.game = game; this.id = id; this.p = p;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#05040a');
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 260);
    this.post = { exposure: 1, saturation: 1.12, contrast: 1.07, vignette: 0.42, bloom: 0.95, threshold: 0.78, outline: 0.5, edge: 0.3, lift: [0.0, 0.02, 0.045], gain: [1.05, 0.99, 0.9] };
    this.world = { scene: this.scene, camera: this.camera, post: this.post };
    this.P = { add: new ParticleSystem(2800, { additive: true }), alpha: new ParticleSystem(1800) };
    this.debris = new Debris(700, 0.07);
    this.scene.add(this.P.add.object, this.P.alpha.object, this.debris.object);
    this.sets = {}; this.set = null;
    this.actors = []; this.tweens = []; this.ticks = []; this.shards = []; this.lights = []; this.loops = []; this.fxObjs = [];
    this.t = 0; this.rt = 0; this.si = -1; this.st = 0; this.speed = 1; this.slow = null;
    this.trauma = 0; this.punch = 0; this.cp = V(); this.cl = V(); this._p = V(); this._l = V();
    this.fade = 1; this.fadeTo = 0; this.fadeRate = 1.2;
    this.bars = 0; this.barsTo = 1;
    this.caps = []; this.card = null;
    this.done = false; this.held = false; this.finishing = 0; this.finT = 0; this.skipArm = 0;
    this.env = { solid: envMaterial(), glow: envGlowMaterial(1.6) };
    this.envSave = { solid: this.env.solid.color.clone(), glow: this.env.glow.color.clone() };
    this.envK = { r: 1, g: 1, b: 1, glow: 1 };
    const run = game.run;
    this.who = CHARACTERS[p.char] ? p.char : run && CHARACTERS[run.char] ? run.char : 'bran';
    const [kind, arg] = parseId(id);
    const script = SCRIPTS[kind] || SCRIPTS.none;
    this.bubbles = [];
    const def = script(this, { ...p, arg });
    this.shots = def.shots;
    this.hold = !!(p.hold || def.hold);
    if (def.music && game.audio) game.audio.music(def.music);
    this.next();
  }

  // -------------------------------------------------------------- sets
  /** A voxel stage from stage_vox (geometry is cached, so a stage the game just built comes back fast). */
  stageSet(name, kind, region = 0, opts = {}) {
    const st = buildStage(kind, region, opts);
    const group = st.group;
    this.scene.add(group);
    st.setCamera && st.setCamera(this.camera);
    const flames = (st.flames || []).filter((f) => f.light).map((f) => f.light);
    const dyn = new Set([...flames, ...(st.pool || [])]);
    const stat = (st.lights || []).filter((l) => !dyn.has(l));
    for (const l of stat) l.userData.cineBase = l.intensity;
    const s = {
      name, group, stage: st, A: st.anchors || {}, fog: st.fog, background: st.background, lightK: 1, flameK: 1,
      update: (dt, t) => {
        st.update && st.update(dt, t);
        for (const l of dyn) l.intensity *= s.lightK;
        for (const l of stat) l.intensity = l.userData.cineBase * s.lightK;
        for (const f of st.flames || []) { f.mesh.visible = s.flameK > 0.02; f.mesh.material.color.setScalar(1.8 * s.flameK); }
      },
    };
    group.visible = false;
    this.sets[name] = s;
    return s;
  }
  useSet(name) {
    const s = this.sets[name];
    if (!s || s === this.set) return;
    for (const k in this.sets) this.sets[k].group.visible = this.sets[k] === s;
    if (this.set) { this.P.add.clear(); this.P.alpha.clear(); this.debris.items.length = 0; }
    this.set = s;
    this.scene.fog = s.fog || null;
    this.scene.background = s.background || new THREE.Color('#05040a');
  }
  setOf(where) { return typeof where === 'string' ? this.sets[where].group : where || this.scene; }

  // -------------------------------------------------------------- actors
  char(id, where, pos, rotY = 0, anim = 'idle') {
    const c = buildCharacter(id);
    c.id = id;
    c.group.position.copy(pos);
    c.group.rotation.y = rotY;
    c.play(anim, { loop: true });
    this.setOf(where).add(c.group);
    c.update(0.016);
    this.actors.push({ obj: c, frozen: false });
    return c;
  }
  monster(id, where, pos, rotY = 0) {
    const m = buildMonster(id);
    m.group.position.copy(pos);
    m.group.rotation.y = rotY;
    this.setOf(where).add(m.group);
    m.update(0.016);
    this.actors.push({ obj: m, frozen: false, mon: true });
    return m;
  }
  actor(o) { return this.actors.find((a) => a.obj === o); }
  freeze(o, b = true) { const a = this.actor(o); if (a) a.frozen = b; }
  /** Let a fresh pose settle (seated statues are frozen right after). */
  settle(o, n = 40) { for (let i = 0; i < n; i++) o.update(1 / 30); }
  walk(c, to, dur, o = {}) {
    const from = c.group.position.clone(), dest = v3(to);
    if (c._walk) c._walk.dead = true;
    if (o.face !== false) c.group.rotation.y = faceTo(from, dest);
    c.play(o.anim || 'walk', { loop: true, speed: o.speed });
    c._walk = this.tween(dur, (k) => c.group.position.lerpVectors(from, dest, k), o.ease || 'linear', () => { c._walk = null; if (o.then !== false) c.play(o.then || 'idle', { loop: true }); });
    return c._walk;
  }
  turn(c, ang, dur = 0.5) { const a0 = c.group.rotation.y; return this.tween(dur, (k) => (c.group.rotation.y = angleLerp(a0, ang, k)), 'inOutSine'); }
  /** Stone over an actor: returns its uniforms; `y` is where the stone line starts. */
  stone(o, seam = '#c86bff', y = -0.2) { const u = stoneify(o.group || o, seam); u.uStone.value = y; o._stone = u; return u; }
  stoneTo(o, y, dur, e = 'inOutSine') { const u = o._stone; return this.tween(dur, (k, a) => (u.uStone.value = lerp(a, y, k)), e, null, () => u.uStone.value); }

  // -------------------------------------------------------------- v4 sets + actors
  /** The crew's dungeon camp ('campmenu'; the older 'campfire' stage until it exists), anchors normalised at s.C. */
  campSet(name) {
    let s;
    try { s = this.stageSet(name, 'campmenu', 0); } catch (e) { s = this.stageSet(name, 'campfire', 0); }
    s.C = campAnchors(s.stage);
    return s;
  }
  /** A top-down room from room_vox (the dungeon rooms the game itself uses). */
  roomSet(name, stage = 0, room = {}, opts = {}) {
    let st;
    try { st = buildRoom(stage, room, opts); if (typeof st.finishCore === 'function') st.finishCore(); } // floor, walls and props before the first shot
    catch (e) {
      // a room the builder can't make yet must not take the cinematic down with it: stage 0's look instead
      console.warn('[cutscene] room', stage, room.type, 'failed:', e && e.message);
      if (!stage) throw e;
      st = buildRoom(0, room, opts); if (typeof st.finishCore === 'function') st.finishCore();
    }
    const group = st.group;
    this.scene.add(group);
    st.setCamera && st.setCamera(this.camera);
    const bg = st.background && st.background.isColor ? st.background : st.bg && st.bg.isColor ? st.bg : null;
    const s = {
      name, group, stage: st, A: st.anchors || {}, fog: st.fog || null, background: bg, lightK: 1, flameK: 1, room: true,
      update: (dt, t) => { st.update && st.update(dt, t); },
    };
    group.visible = false;
    this.sets[name] = s;
    return s;
  }
  /** Pip the mole-dog. */
  pet(where, pos, rotY = 0, anim = 'idle') {
    let p;
    try { p = buildPet(); } catch (e) { return null; }
    p.group.position.copy(pos);
    p.group.rotation.y = rotY;
    p.play(anim);
    this.setOf(where).add(p.group);
    p.update && p.update(0.016);
    this.actors.push({ obj: p, frozen: false });
    return p;
  }
  medusa(where, pos, rotY = 0) {
    const m = buildMedusa();
    m.group.position.copy(pos);
    m.group.rotation.y = rotY;
    this.setOf(where).add(m.group);
    m.update && m.update(0.016);
    this.actors.push({ obj: m, frozen: false, mon: true });
    return m;
  }
  /** A monster by id (or the first of `alts` that exists), else a stand-in serpent. */
  beast(id, where, pos, rotY = 0, alts = [], look = {}) {
    for (const k of [id, ...alts]) {
      if (!MONSTERS[k]) continue;
      try { return this.monster(k, where, pos, rotY); } catch (e) { /* try the next */ }
    }
    const m = standInSerpent(look.col, look.belly, look.eye, look.len, look.r);
    m.group.position.copy(pos);
    m.group.rotation.y = rotY;
    this.setOf(where).add(m.group);
    this.actors.push({ obj: m, frozen: false });
    return m;
  }
  /** Play the first anim of a list the actor knows. */
  act(o, names, opts = {}) { return playFirst(o, names, opts); }
  /** Turn an actor to stone over `dur` (its own setStone, else the stone-creep shader); frozen once done. */
  petrify(o, dur = 1.6, o2 = {}) {
    const go = () => {
      if (!o) return;
      if (o.setStone) this.tween(dur, (k) => o.setStone(k), 'inOutSine', () => { o.setStone(1); if (o2.freeze !== false) this.freeze(o); });
      else {
        const g = o.group || o;
        g.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(g);
        const u = stoneify(g, o2.seam || '#7affc0');
        const y0 = (isFinite(b.min.y) ? b.min.y : 0) - 0.05, y1 = (isFinite(b.max.y) ? b.max.y : 2) + 0.1;
        u.uStone.value = y0;
        o._stone = u;
        this.tween(dur, (k) => (u.uStone.value = lerp(y0, y1, k)), 'inOutSine', () => { if (o2.freeze !== false && o.update) this.freeze(o); });
      }
      if (o2.sound !== false) this.sfx('petrify', { vol: o2.vol ?? 0.6, pitch: o2.pitch ?? 1 });
    };
    if (o2.delay) this.later(o2.delay, go); else go();
  }
  /** Bring an actor back from stone (rescues). */
  unpetrify(o, dur = 0.8) {
    if (!o) return;
    this.freeze(o, false);
    if (o.setStone) { this.tween(dur, (k) => o.setStone(1 - k), 'inQuad', () => o.setStone(0)); return; }
    const u = o._stone;
    if (u) this.tween(dur, (k, a) => (u.uStone.value = lerp(a, -5, k)), 'inQuad', null, () => u.uStone.value);
  }
  /** A floating line over an actor (forgers rarely talk: ≤ 12 words). who: voice id for name/colour. */
  say(o, text, dur = 2.6, delay = 0, who = null) { this.bubbles = this.bubbles.filter((b) => b.o !== o); this.bubbles.push({ o, text, t: -delay, dur, who: who || (o && o.id) || null }); }
  /**
   * A line you answer: the dialogue overlay takes over (floating text + reply tags) and the timeline
   * waits until you pick. lines: dialogue lines (see scenes/dialogue.js); then(result) afterwards.
   */
  ask(lines, then) {
    if (!this.game.scenes.dialogue || this.finishing || this.done) { if (then) then({ choices: {}, picked: [] }); return; }
    this.waiting = true;
    // played as an overlay (a boss intro over the dungeon): keep the fight below frozen while you answer
    const freeze = !(this.game.scene && this.game.scene.cine === this);
    this.askOv = this.game.pushOverlay('dialogue', { lines, cam: null, camera: this.camera, bars: false, sound: false, freeze, onDone: (r) => { this.waiting = false; this.askOv = null; if (then) then(r); } });
  }
  /** The hero's current weapon as a mesh (the forged one if there is a run, else their trade tool). */
  heroWeapon(who) {
    const run = this.game.run;
    const w = run && run.weapon;
    const bp = { bran: 'hammer', elio: 'staff', durgan: 'axe', clover: 'dagger' }[who] || 'sword';
    try { return buildWeaponMesh(w && w.bp ? w : { bp, ids: ['iron', 'iron', 'copper'], grade: 2 }); } catch (e) { return null; }
  }

  // -------------------------------------------------------------- tweens on the cutscene clock
  /** fn(k, from) each frame; init() captures `from` at the start. */
  tween(dur, fn, easeName = 'inOutSine', done = null, init = null) {
    const tw = { t: 0, dur: Math.max(1e-4, dur), fn, e: typeof easeName === 'function' ? easeName : ease[easeName] || ease.linear, done, a: init ? init() : 0 };
    this.tweens.push(tw);
    return tw;
  }
  to(obj, props, dur, easeName = 'inOutSine') {
    const from = {};
    for (const k in props) from[k] = obj[k];
    return this.tween(dur, (k) => { for (const p in props) obj[p] = from[p] + (props[p] - from[p]) * k; }, easeName);
  }
  colorTo(col, hex, dur, easeName = 'inOutSine') { const a = col.clone(), b = new THREE.Color(hex); return this.tween(dur, (k) => col.lerpColors(a, b, k), easeName); }
  arrTo(key, target, dur, easeName = 'inOutSine') { const a = (this.post[key] || [0, 0, 0]).slice(); return this.tween(dur, (k) => (this.post[key] = a.map((v, i) => v + (target[i] - v) * k)), easeName); }
  postTo(props, dur, easeName = 'inOutSine') {
    for (const k in props) if (Array.isArray(props[k])) { this.arrTo(k, props[k], dur, easeName); delete props[k]; }
    return this.to(this.post, props, dur, easeName);
  }
  later(t, fn) { return this.tween(t, () => {}, 'linear', fn); }
  /** Per-frame function on the cutscene clock; shot-scoped unless keep. Return false to stop. */
  tick(fn, keep = false) { const h = { fn, keep }; this.ticks.push(h); return h; }
  every(rate, fn, keep = false) { return this.tick((dt, t) => { let n = rate * dt; while (n > 0) { if (Math.random() < n) fn(t); n -= 1; } }, keep); }

  // -------------------------------------------------------------- lights, grade, env
  light(where, type, col, k, pos, o = {}) {
    let l;
    if (type === 'spot') { l = new THREE.SpotLight(new THREE.Color(col), k, o.dist ?? 16, o.angle ?? 0.55, o.pen ?? 0.6, o.decay ?? 1.2); l.target.position.copy(o.target || V()); this.setOf(where).add(l.target); }
    else if (type === 'dir') { l = new THREE.DirectionalLight(new THREE.Color(col), k); l.target.position.copy(o.target || V()); this.setOf(where).add(l.target); }
    else l = new THREE.PointLight(new THREE.Color(col), k, o.dist ?? 8, o.decay ?? 1.5);
    l.position.copy(pos);
    l.userData.k = k; l.userData.fl = o.fl || 0; l.userData.sp = o.sp || 9; l.userData.seed = Math.random() * 99;
    this.setOf(where).add(l);
    this.lights.push(l);
    return l;
  }
  lightTo(l, k, dur, easeName = 'inOutSine') { return this.to(l.userData, { k }, dur, easeName); }
  /** Tint the baked voxel stages (they are unlit): rgb multiplier and glow strength. */
  envTo(r, g, b, glow = 1, dur = 1, easeName = 'inOutSine') {
    if (dur <= 0) { Object.assign(this.envK, { r, g, b, glow }); return null; }
    return this.to(this.envK, { r, g, b, glow }, dur, easeName);
  }
  flash(amt = 0.5, col = [1, 1, 1]) { this.game.renderer && this.game.renderer.doFlash(amt, typeof col === 'string' ? rgb(col) : col); }
  shake(a = 0.4) { this.trauma = Math.min(1.3, this.trauma + a); }
  slowmo(scale, dur, rin = 0.12, rout = 0.6) { this.slow = { scale, dur, rin, rout, t: 0 }; }
  sfx(name, o) { this.game.audio && this.game.audio.play(name, o); }
  loop(name, vol = 1) { if (!this.game.audio) return null; const h = this.game.audio.loop(name, { vol }); this.loops.push(h); return h; }
  haptic(ms) { this.game.haptic && this.game.haptic(ms); }

  // -------------------------------------------------------------- fx
  add(obj, where) { this.setOf(where).add(obj); this.fxObjs.push(obj); return obj; }
  /** A burst of light: flash, shock bubble, sparks, glow. */
  burst(pos, col = '#c86bff', o = {}) {
    const p = v3(pos), size = o.size ?? 1;
    const sph = this.add(shockSphere(col), o.where);
    sph.position.copy(p); sph.scale.setScalar(0.2 * size);
    this.tween(o.dur ?? 0.9, (k) => { sph.scale.setScalar((0.2 + k * (o.r ?? 7)) * size); sph.material.uniforms.uOp.value = (1 - k) * 1.2; }, 'outCubic', () => { sph.visible = false; });
    const gl = this.add(glowSprite(col, 3 * size, 2.4, 1.4), o.where);
    gl.position.copy(p);
    this.tween(o.dur ?? 0.9, (k) => { gl.scale.setScalar((3 + k * 6) * size); gl.material.opacity = 1 - k; }, 'outQuad', () => { gl.visible = false; });
    this.P.add.emit({ pos: [p.x, p.y, p.z], radial: [1.5 * size, 5 * size], radialUp: 0.8, count: o.n ?? 90, life: [0.5, 1.3], size: [1, 3], color: [col, '#ffffff', o.col2 || col], glow: 3, drag: 1.6, gravity: -0.5 });
    if (o.flash !== false) this.flash(o.flash ?? 0.45, col);
    if (o.shake !== false) this.shake(o.shake ?? 0.5);
  }
  dustFall(x0, x1, z0, z1, top, rate = 24, col = '#c8b8a8') {
    return this.every(rate, () => {
      this.P.alpha.emit({ pos: [rnd(x0, x1), top, rnd(z0, z1)], vel: [rnd(-0.05, 0.05), -rnd(0.4, 1.4), 0], spread: 0.05, life: [1.5, 3], size: [1, 2], color: col, alpha: 0.7, gravity: 0.8 });
      if (Math.random() < 0.12) this.debris.spawn({ pos: [rnd(x0, x1), top, rnd(z0, z1)], count: 1, colors: ['#4a4054', '#6a6070', '#2e2838'], speed: 0.2, up: 0, gravity: 9, floor: 0.03, life: 2, scale: [0.4, 0.9] });
    });
  }
  curseSmoke(pos, spread = 0.6, rate = 20) {
    const p = v3(pos);
    return this.every(rate, () => {
      this.P.alpha.emit({ pos: [p.x + rnd(-spread, spread), p.y + rnd(0, 0.2), p.z + rnd(-spread, spread)], vel: [rnd(-0.1, 0.1), rnd(0.25, 0.6), rnd(-0.1, 0.1)], spread: 0.05, life: [1.6, 3], size: [2, 3], sizeEnd: 5, color: ['#2a1438', '#3a1a4a'], alpha: 0.5, fadeIn: 0.3, swirl: 0.6 });
      this.P.add.emit({ pos: [p.x + rnd(-spread, spread), p.y + rnd(0, 0.4), p.z + rnd(-spread, spread)], vel: [0, rnd(0.3, 0.9), 0], spread: 0.1, life: [0.8, 1.8], size: [1, 2], color: ['#c86bff', '#ff5af0', '#9a5aff'], glow: 2.6, swirl: 1 });
    });
  }
  /** Stone chips and a glint along the stone line of an actor. */
  chips(o, col = ['#8a8696', '#6a6676', '#a8a4b4'], gold = false) {
    const g = o.group || o, u = o._stone;
    const p = g.getWorldPosition(V());
    const y = u ? u.uStone.value : 1;
    this.debris.spawn({ pos: [p.x, y, p.z], count: 2, colors: col, speed: 1.1, up: 1.4, spread: 0.25, gravity: 9, floor: 0.03, life: 1.4, scale: [0.3, 0.8] });
    this.P.add.emit({ pos: [p.x + rnd(-0.25, 0.25), y, p.z + rnd(-0.25, 0.25)], vel: [0, 0.4, 0], spread: 0.3, life: [0.3, 0.8], size: [1, 2], color: gold ? ['#ffe08a', '#fff4c8'] : ['#e0b0ff', '#c86bff'], glow: 3, flicker: 0.5 });
  }

  // -------------------------------------------------------------- timeline
  get shot() { return this.shots[this.si]; }
  next() {
    this.ticks = this.ticks.filter((h) => h.keep);
    if (this.si + 1 >= this.shots.length) { this.end(); return; }
    this.si++;
    const S = this.shots[this.si];
    this.st = 0;
    if (S.set) this.useSet(S.set);
    S._cues = (S.at || []).map(([t, fn]) => ({ t, fn, done: false }));
    if (S.dip) { this.fade = 1; this.fadeTo = 0; this.fadeRate = 1 / S.dip; }
    if (S.cap) this.caption(S.cap, S.capAt ?? 0.6, S.capDur);
    const C = S.cam || {};
    this.cam = { pos: pathOf(C.pos), look: pathOf(C.look), fov: C.fov ?? 40, roll: C.roll ?? 0, ease: ease[C.ease || 'inOutSine'] || ease.inOutSine, rel: C.rel, sway: C.sway ?? 0.014, smooth: C.smooth || 0 };
    this._cut = true;
    S.enter && S.enter(this, S);
    this.fireCues();
    this.camUpdate(0);
  }
  fireCues() { const S = this.shot; for (const c of S._cues) if (!c.done && this.st >= c.t) { c.done = true; c.fn(this, S); } }
  end() { if (this.hold) { this.held = true; this.barsTo = this.p.keepBars ? 1 : 0; return; } this.finish(); }
  finish(fast = false) {
    if (this.finishing) return;
    this.finishing = fast ? 0.4 : 0.9; this.finT = 0;
    this.fadeTo = 1; this.fadeRate = 1 / this.finishing;
    if (fast && this.game.audio) this.game.audio.play('transition', { vol: 0.5 });
  }
  skip() {
    if (this.finishing) return;
    if (!this.hold) { this.finish(true); return; }
    // held cinematics jump to their last shot and stay there
    while (this.si < this.shots.length - 1) this.next();
    this.st = Math.max(this.st, this.shot.dur);
    this.fireCues();
    this.caps = []; this.card = null;
    this.fade = 0; this.fadeTo = 0;
    this.end();
  }
  caption(text, at = 0, dur = null) { this.caps.push({ text, t: -at, dur: dur ?? Math.max(3.2, text.length * 0.065 + 1.8) }); }
  titleCard(title, sub, o = {}) { this.card = { title, sub, t: -(o.at || 0), dur: o.dur ?? 3.4, top: o.top || '#fff6e0', bottom: o.bottom || '#e8a060', line: o.line || '#e8a060' }; }

  update(rdt) {
    if (this.done) return;
    const dt = Math.min(rdt, 0.1) * Math.max(1, this.game.timeScale || 1);
    this.rt += dt;
    // slow motion bends the whole timeline (actors, particles, camera)
    if (this.slow) {
      const s = this.slow; s.t += dt;
      const k = s.t < s.rin ? s.t / s.rin : s.t < s.rin + s.dur ? 1 : 1 - (s.t - s.rin - s.dur) / s.rout;
      this.speed = lerp(1, s.scale, clamp(k));
      if (s.t > s.rin + s.dur + s.rout) { this.slow = null; this.speed = 1; }
    }
    const sdt = dt * this.speed;
    const tl = this.waiting ? 0 : sdt; // the story clock stops while you choose a reply
    this.t += tl;
    const S = this.shot;
    if (S) {
      this.st += tl;
      if (!this.finishing) this.fireCues();
      S.tick && S.tick(this, clamp(this.st / S.dur), this.st, tl);
      if (this.st >= S.dur && !this.held && !this.finishing && !this.waiting) this.next();
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (tw.dead) { this.tweens.splice(i, 1); continue; }
      tw.t += tl;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.e(k), tw.a);
      if (k >= 1) { this.tweens.splice(i, 1); tw.done && tw.done(); }
    }
    for (const a of this.actors) if (!a.frozen && a.obj.group && a.obj.group.parent && this.visibleIn(a.obj.group)) a.obj.update(sdt);
    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter((b) => b.t < b.dur);
    if (this.set) this.set.update(sdt, this.t);
    for (let i = this.ticks.length - 1; i >= 0; i--) if (this.ticks[i].fn(sdt, this.t) === false) this.ticks.splice(i, 1);
    for (const l of this.lights) {
      const u = l.userData;
      l.intensity = u.fl ? u.k * (1 - u.fl + (noise2(this.t * u.sp, u.seed) * 0.7 + noise2(this.t * u.sp * 2.3, u.seed + 3) * 0.3) * u.fl * 2) : u.k;
    }
    this.env.solid.color.setRGB(this.envK.r, this.envK.g, this.envK.b);
    this.env.glow.color.setScalar(1.6 * this.envK.glow);
    this.P.add.update(sdt); this.P.alpha.update(sdt); this.debris.update(sdt);
    if (this.shards.length) updateShards(this.shards, sdt, 0.02, 9.8);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.punch = damp(this.punch, 0, 5, dt);
    this.camUpdate(dt);
    // overlays: real time (captions stay readable through slow motion)
    this.fade = this.fadeTo > this.fade ? Math.min(this.fadeTo, this.fade + dt * this.fadeRate) : Math.max(this.fadeTo, this.fade - dt * this.fadeRate);
    this.bars = damp(this.bars, this.barsTo, 4, dt);
    for (const c of this.caps) c.t += dt;
    this.caps = this.caps.filter((c) => c.t < c.dur);
    if (this.card) { this.card.t += dt; if (this.card.t > this.card.dur) this.card = null; }
    this.skipArm = Math.max(0, this.skipArm - dt);
    if (this.finishing) { this.finT += dt; if (this.finT >= this.finishing) { this.done = true; for (const h of this.loops) h && h.stop && h.stop(0.6); } }
  }
  visibleIn(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

  camUpdate(dt) {
    const S = this.shot, C = this.cam;
    if (!S || !C) return;
    const k = C.ease(clamp(this.st / S.dur));
    evalPath(C.pos, k, this, this._p);
    evalPath(C.look, k, this, this._l);
    if (C.rel) { const r = C.rel(this); this._p.add(r); this._l.add(r); }
    if (this._cut || !C.smooth) { this.cp.copy(this._p); this.cl.copy(this._l); this._cut = false; }
    else { const a = 1 - Math.exp(-C.smooth * dt); this.cp.lerp(this._p, a); this.cl.lerp(this._l, a); }
    const s = this.trauma * this.trauma, t = this.rt, sw = C.sway;
    const sx = (noise2(t * 0.45, 7) - 0.5) * sw * 2 + (noise2(t * 23, 1) - 0.5) * 0.28 * s;
    const sy = (noise2(t * 0.38, 9) - 0.5) * sw * 2 + (noise2(t * 23, 2) - 0.5) * 0.28 * s;
    const cam = this.camera;
    cam.position.set(this.cp.x + sx, this.cp.y + sy, this.cp.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.cl.x + sx * 0.4, this.cl.y + sy * 0.4, this.cl.z);
    cam.rotateZ(spec(C.roll, k) + (noise2(t * 17, 3) - 0.5) * 0.08 * s);
    const f = spec(C.fov, k) + this.punch;
    if (Math.abs(cam.fov - f) > 1e-3) { cam.fov = f; cam.updateProjectionMatrix(); }
  }
  project(v) { const p = v3(v).project(this.camera), ui = this.game.ui; return { x: (p.x * 0.5 + 0.5) * ui.w, y: (-p.y * 0.5 + 0.5) * ui.h, behind: p.z > 1 }; }

  // -------------------------------------------------------------- input + 2D
  input() {
    if (this.finishing || this.held || this.p.noSkip || this.waiting) return;
    const inp = this.game.input;
    if (inp.actionPressed('back')) { this.skip(); return; }
    if (inp.pressed || inp.actionPressed('confirm') || inp.actionPressed('strike')) {
      if (this.skipArm > 0) this.skip(); else this.skipArm = 2.4;
    }
  }
  draw(ui) {
    const ctx = ui.ctx, W = ui.w, H = ui.h;
    // the name card sits in the picture, under the bars
    if (this.card && this.card.t > 0) {
      const c = this.card, k = clamp(c.t / 0.5) * clamp((c.dur - c.t) / 0.7);
      const y = H * 0.5 + 80;
      ctx.globalAlpha = k;
      const spread = ease.outCubic(clamp(c.t / 0.9));
      const lw = Math.round(260 * spread);
      ui.rect(W / 2 - lw, y - 44, lw * 2, 1, c.line, 0.8 * k);
      ui.big(c.title, W / 2, y - 16, { scale: 4, top: c.top, bottom: c.bottom, outline: '#0a0608' });
      if (c.sub) ui.big(c.sub, W / 2, y + 24, { scale: 2, top: '#f0e4d0', bottom: '#c8b8a0', outline: '#0a0608', highlight: false });
      ui.rect(W / 2 - lw, y + 42, lw * 2, 1, c.line, 0.8 * k);
      ctx.globalAlpha = 1;
    }
    for (const b of this.bubbles) {
      if (b.t <= 0 || !b.o) continue;
      const head = b.o.headPos ? b.o.headPos(V()) : (b.o.group || b.o).localToWorld(V(0, b.o.height || 1, 0));
      const p = this.project(head.add(V(0, 0.22, 0)));
      if (p.behind) continue;
      const v = VOICES[b.who] || {};
      const shown = Math.floor(b.t * 42);
      if (shown > (b.blips || 0) * 2 && shown <= b.text.length) { b.blips = (b.blips || 0) + 1; this.sfx(v.whisper ? 'voice_whisper' : 'voice', { pitch: (v.pitch || 1) * (0.94 + Math.random() * 0.12), vol: 0.35 }); }
      drawFloat(ui, p.x, p.y - 2, b.text, { name: v.name, color: v.color, alpha: clamp(b.t / 0.18) * clamp((b.dur - b.t) / 0.3), shown, now: b.t, revealT: (i) => i / 42, maxW: 240, top: Math.round(BAR * clamp(this.bars)) + 4, bottom: Math.round(BAR * clamp(this.bars)) + 4 });
    }
    if (this.fade > 0.002) ui.rect(0, 0, W, H, '#030206', ease.inOutSine(clamp(this.fade)));
    const bh = Math.round(BAR * clamp(this.bars));
    if (bh > 0) { ui.rect(0, 0, W, bh, '#030206'); ui.rect(0, H - bh, W, bh, '#030206'); }
    // narration
    const cap = this.caps[this.caps.length - 1];
    if (cap && cap.t > 0) {
      const a = clamp(cap.t / 0.6) * clamp((cap.dur - cap.t) / 0.7);
      ctx.globalAlpha = a;
      ui.big(cap.text, W / 2, H - BAR / 2, { scale: 2, top: '#f6ead6', bottom: '#d8c4a4', outline: '#030206', highlight: false });
      ctx.globalAlpha = 1;
    }
    // skip: a tag (mouse) or a medallion (touch); a first tap anywhere arms it
    if (!this.p.noSkip && !this.held && !this.finishing) {
      const label = this.skipArm > 0 ? (ui.touch ? 'Tap again to skip' : 'Click again to skip') : 'Skip >>';
      if (ui.touch) {
        ui.touchButton('back', W - 26, 26, 13, { style: 'iron' });
        ui.text('>>', W - 26, 22, { align: 'center', color: '#f4e6c8' });
        if (this.skipArm > 0) ui.text(label, W - 46, 22, { align: 'right', color: '#f4e6c8', outline: '#030206' });
      } else {
        const w = ui.measure(label) + 16, c = tagCanvas(w), x = W - c.width - 12, y = 12;
        const h = ui.hit('cs-skip', x, y, c.width, c.height + 4, { sound: false });
        ctx.globalAlpha = h.hover || this.skipArm > 0 ? 1 : 0.55;
        ui.img(c, x, y);
        ui.text(label, x + 10, y + 11, { color: '#3a2214' });
        ctx.globalAlpha = 1;
        if (h.clicked) this.skip();
      }
    }
  }
  dispose() {
    // a question still open when the scene is torn down (a caller's watchdog) goes with it
    if (this.askOv && this.game.overlays.includes(this.askOv)) this.game.popOverlay(this.askOv);
    this.askOv = null; this.waiting = false;
    for (const h of this.loops) h && h.stop && h.stop(0.4);
    this.env.solid.color.copy(this.envSave.solid);
    this.env.glow.color.copy(this.envSave.glow);
    for (const a of this.actors) if (a.mon && a.obj.dispose) { try { a.obj.dispose(); } catch (e) { /* already gone */ } }
    disposeTree(this.scene);
  }
}

/**
 * Warm the voxel stage cache for a cutscene ahead of time (stages take a moment to bake the first
 * time; cached ones come back fast). Call it while a menu is idle.
 */
/** True when a cinematic script exists for this id (boss_<id>, rescue_<id>, intro, …). */
export function hasCutscene(id) {
  const [kind, arg] = parseId(id || '');
  if (!SCRIPTS[kind]) return false;
  if (kind === 'boss') return !!(arg && (HERALDS[arg] || MONSTERS[arg] || BOSS_LOOKS[arg]));
  return true;
}

export function prepareCutscene(id) {
  const [kind] = parseId(id);
  const need = { intro: [['campmenu', 0], ['campfire', 0]], ending: [['campmenu', 0]] }[kind] || [];
  for (const [k, r] of need) { try { buildStage(k, r); return; } catch (e) { /* the next one, or built on demand */ } }
}

// ================================================================== the scene wrapper
export class CutsceneScene extends Scene {
  get freezesBelow() { return true; }
  enter(p = {}) {
    this.p = p;
    this.cine = new Cine(this.game, p.id || 'intro', p);
    this.world = this.cine.world;
    this.keepWorld = true; // the cine disposes its own world
    this.closed = false;
  }
  update(dt, rdt = dt) {
    const c = this.cine;
    c.update(rdt);
    if (c.done && !this.closed) {
      this.closed = true;
      const g = this.game, isOverlay = g.overlays.includes(this);
      if (isOverlay) g.popOverlay(this);
      const fn = this.p.onDone || this.p.next;
      if (fn) fn();
      else if (!isOverlay) g.go(g.run ? 'delve' : 'title', {}, { transition: 'fade' });
    }
  }
  draw(ui) { this.cine.input(); this.cine.draw(ui); }
  exit() { this.cine.dispose(); }
}

// ================================================================== scripts
const SCRIPTS = {};
/** The three Snake Heralds and Medusa: look + a fallback while the real monsters are being built. */
const HERALDS = {
  thornscale: { act: 0, col: '#4a7a36', belly: '#c8e070', eye: '#ffe04a', glow: '#9aff6a', name: 'Thornscale', title: 'Herald of Roots', alts: ['vine_viper', 'adder'], from: 'ceiling', len: 4.2, r: 0.24 },
  glasscoil: { act: 1, col: '#5aa8d8', belly: '#e0f4ff', eye: '#ff8af0', glow: '#9ae8ff', name: 'Glasscoil', title: 'Herald of the Deep Water', alts: ['glass_adder', 'cistern_naga'], from: 'water', len: 4.4, r: 0.24 },
  cinderfang: { act: 2, col: '#b8381a', belly: '#ffc04a', eye: '#fff04a', glow: '#ff8a3a', name: 'Cinderfang', title: 'Herald of Embers', alts: ['ember_asp', 'lava_wyrmling'], from: 'floor', len: 4.6, r: 0.26 },
  medusa: { act: 3, col: '#5a8a6a', belly: '#e0e8c8', eye: '#7affc0', glow: '#7affc0', name: 'Medusa', title: 'The Gorgon Queen', from: 'floor' },
};
const HERALD_ORDER = ['thornscale', 'glasscoil', 'cinderfang'];
const RESCUE_LINE = { bran: 'Took you long enough!', elio: 'Kindle! You found me!', durgan: "Who's minding the stew?", clover: "Knew you'd come~" };
const actOf = (c, fallback = 0) => { const r = c.game.run; return clamp(r ? (r.act ?? r.region ?? fallback) : fallback, 0, 3); };
const nameOf = (id) => (MONSTERS[id] && MONSTERS[id].name) || (HERALDS[id] && HERALDS[id].name) || id;
const titleOf = (id) => (MONSTERS[id] && MONSTERS[id].title) || (HERALDS[id] && HERALDS[id].title) || '';
const headOf = (o) => (o.headPos ? o.headPos(V()) : (o.group || o).localToWorld(V(0, o.height || 1, 0)));
const handOf = (o) => { const m = o.rig && (o.rig.mountR || o.rig.handR); if (m) return m.getWorldPosition(V()); return headOf(o).add(V(0, -0.35, 0)); };
const flat = (v) => V(v.x, 0, v.z);
/** The friends still in stone, in rescue order (the crew minus the hero). */
function statuesOf(c) {
  const run = c.game.run;
  if (run && Array.isArray(run.statues)) return run.statues.slice();
  return CHARACTER_ORDER.filter((id) => id !== c.who);
}

// ------------------------------------------------------------------ intro (3rd person, the camp)
SCRIPTS.intro = (c) => {
  const who = c.who;
  const cook = who === 'durgan' ? 'bran' : 'durgan';
  const S = c.campSet('camp');
  const C = S.C;
  const F = flat(C.fire);
  // the audience side: where the menu camera looks from
  const M = C.cams && C.cams.menu ? v3(C.cams.menu.pos) : C.camera && C.camera.pos ? v3(C.camera.pos) : F.clone().add(V(0, 2.5, 6));
  const aud = V(M.x - F.x, 0, M.z - F.z).normalize();
  const sideV = V(aud.z, 0, -aud.x);
  // the crew in their seats, doing their evening things
  const crew = {};
  const ROUT = { durgan: ['stir', 'sit'], bran: ['polish', 'sit'], elio: ['read', 'sit'], clover: ['count', 'sit'] };
  // whoever cooks stands at the pot: if the hero is Durgan, Bran takes his spot and Durgan takes Bran's log
  const seatOf = Object.fromEntries(CHARACTER_ORDER.map((id) => [id, id]));
  if (who === 'durgan') { seatOf.durgan = 'bran'; seatOf.bran = 'durgan'; }
  for (const id of CHARACTER_ORDER) {
    const st = C.seats[seatOf[id]];
    const ch = c.char(id, 'camp', st.pos.clone(), st.facing, 'idle');
    ch.setSeated && ch.setSeated(st.height > 0.05, st.height);
    c.act(ch, id === who ? ['sit', 'idle'] : id === cook ? ['stir', 'sit'] : ROUT[id], { loop: true });
    c.settle(ch, 20);
    crew[id] = ch;
  }
  const hero = crew[who], K = crew[cook];
  const friendIds = CHARACTER_ORDER.filter((id) => id !== who);
  const friends = friendIds.map((id) => crew[id]);
  const hs = C.seats[seatOf[who]].pos.clone();
  const outH = hs.clone().sub(F).setY(0);
  if (outH.lengthSq() < 1e-4) outH.set(0, 0, 1);
  outH.normalize();
  const sideH = V(outH.z, 0, -outH.x);
  // toward the hero from the audience side (for close-ups)
  const hcam = F.clone().sub(hs).setY(0).normalize().multiplyScalar(0.55).add(aud.clone().multiplyScalar(0.45)).normalize();
  // Pip naps right behind the hero's seat: that's how the trip happens
  const pipPos = hs.clone().addScaledVector(outH, 0.6).addScaledVector(sideH, 0.12);
  const pip = c.pet('camp', pipPos, faceTo(pipPos, F) + 1.4, 'sleep');
  // this week's haul beside the hero, and the hero's own tool leaning on the log
  const haul = new THREE.Group();
  haul.position.copy(hs.clone().addScaledVector(sideH, 0.8).addScaledVector(outH, 0.1));
  try { const sk = buildProp('sack'); sk.scale.setScalar(0.8); haul.add(sk); } catch (e) { /* optional */ }
  [['diamond', 0.24, 0.12], ['gold', -0.22, 0.22], ['iron', 0.04, 0.34], ['ruby', 0.34, -0.1], ['diamond', -0.1, 0.42]].forEach(([id, x, z], i) => {
    try { const o = buildOreModel(id, { res: 16, roll: i }); o.scale.setScalar(0.3); o.position.set(x, 0.07, z); haul.add(o); } catch (e) { /* optional */ }
  });
  c.add(haul, 'camp');
  const tool = c.heroWeapon(who);
  if (tool) {
    tool.position.copy(hs.clone().addScaledVector(sideH, -0.55).addScaledVector(outH, 0.15)).setY(0.04);
    tool.rotation.set(0, faceTo(hs, F) + 1.2, 0.3);
    c.add(tool, 'camp');
  }
  // stew, the totem, the scary old chest
  const bowl = buildBowl(); bowl.visible = false; c.add(bowl, 'camp');
  let totem = null;
  try { totem = buildMedusaTotem(); totem.visible = false; totem.scale.setScalar(1.35); c.add(totem, 'camp'); } catch (e) { totem = null; }
  let totemHeld = false;
  c.tick(() => { if (totem && totemHeld) { totem.position.copy(handOf(hero)).add(V(0, 0.08, 0)); totem.rotation.set(0, c.t * 0.7, 0); } }, true);
  const chest = flat(C.chest);
  const chestGlow = c.add(glowSprite('#7affc0', 1.0, 0), 'camp');
  chestGlow.position.copy(chest).setY(0.45);
  const chestLight = c.light('camp', 'point', '#5affb0', 0, chest.clone().setY(0.6), { dist: 3.5, decay: 1.5, fl: 0.3, sp: 5 });
  // the floor that splits, and Medusa beneath it
  const rise = flat(C.medusaRise);
  const stageCrack = S.stage.crackOpen ? (k) => S.stage.crackOpen(k) : null;
  const myCrack = stageCrack ? null : buildCrack(rise.clone().addScaledVector(sideV, -1.7), rise.clone().addScaledVector(sideV, 1.7), '#7affc0', 5);
  if (myCrack) c.add(myCrack.group, 'camp');
  const crackOpen = (k) => (stageCrack ? stageCrack(k) : myCrack.open(k));
  const crackPts = myCrack ? myCrack.pts : [rise.clone().addScaledVector(sideV, -1.2), rise, rise.clone().addScaledVector(sideV, 1.2)];
  const crackLight = c.light('camp', 'point', '#5affb0', 0, rise.clone().setY(0.3), { dist: 8, decay: 1.15, fl: 0.18, sp: 6 });
  const dirC = flat(rise).sub(F); if (dirC.lengthSq() < 1e-4) dirC.copy(aud); dirC.normalize(); // fire → crack
  const perpC = V(dirC.z, 0, -dirC.x);
  const beams = [-1, -0.3, 0.45, 1].map((k, i) => { const b = c.add(beam(4.2, 0.03, 0.35 + (i % 2) * 0.12, '#7affc0', 0, 1.6), 'camp'); aimBeam(b, rise.clone().addScaledVector(sideV, k * 1.2).setY(-0.1), rise.clone().addScaledVector(sideV, k * 1.7).setY(4.0)); return b; });
  const med = c.medusa('camp', rise.clone(), faceTo(rise, hs));
  med.group.visible = false;
  c.freeze(med);
  // three heralds, one for each friend, and the one that turns on you
  const heralds = friends.map((f, i) => {
    const id = HERALD_ORDER[i], H = HERALDS[id];
    const fp = flat(f.group.position);
    const out = fp.clone().sub(F).setY(0).normalize();
    const pos = fp.clone().addScaledVector(out, 0.95).setY(-3.2);
    const m = c.beast(id, 'camp', pos, faceTo(pos, fp), H.alts, H);
    m.group.scale.multiplyScalar(MONSTERS[id] ? 0.5 : 0.8);
    m.group.visible = false;
    c.freeze(m);
    return m;
  });
  const snakeAt = rise.clone().addScaledVector(sideV, 0.6);
  const snake = c.beast('gorgon_snake', 'camp', snakeAt.clone().setY(-2.5), faceTo(snakeAt, hs), ['vine_viper', 'adder'], { col: '#3a6a44', belly: '#d8e8a0', eye: '#ff4a3a', len: 2.6, r: 0.15 });
  snake.group.visible = false;
  c.freeze(snake);
  const at = (p, dir, dist, h, side = 0) => p.clone().addScaledVector(dir, dist).addScaledVector(sideV, side).setY((p.y || 0) + h);
  const steam = () => { const p = C.pot; c.P.alpha.emit({ pos: [p.x + rnd(-0.1, 0.1), p.y + 0.3, p.z + rnd(-0.1, 0.1)], vel: [0, rnd(0.25, 0.45), 0], spread: 0.04, life: [1.6, 2.6], size: [1, 2], sizeEnd: 4, color: ['#e8dcd0', '#d0c4c8'], alpha: 0.35, fadeIn: 0.4, swirl: 0.4 }); };
  let flight = null;
  return {
    music: 'camp',
    shots: [
      // 1. the camp at night
      { set: 'camp', dur: 5.0, dip: 1.2,
        cam: { pos: [at(F, aud, 5.8, 3.0, 0.9), at(F, aud, 4.4, 2.1, 0.3)], look: [F.clone().setY(0.4), F.clone().setY(0.6)], fov: [42, 36] },
        enter: (c) => { c.loop('campfire', 0.7); c.every(5, steam, true); } },
      // 2. Durgan ladles out the stew
      { dur: 3.2,
        cam: { pos: [at(flat(C.pot), aud, 2.1, 0.8, 0.6), at(flat(C.pot), aud, 1.85, 0.7, 0.45)], look: [C.pot.clone().setY(C.pot.y + 0.1), C.pot.clone().setY(C.pot.y + 0.15)], fov: [34, 32] },
        enter: (c) => { c.act(K, ['stir', 'hammer', 'sit'], { loop: true }); c.sfx('stew_bubble', { vol: 0.6 }); },
        at: [
          [0.9, (c) => { c.sfx('ladle'); bowl.visible = true; bowl.position.copy(C.pot).setY(C.pot.y + 0.35); }],
          [2.0, (c) => {
            const p0 = bowl.position.clone();
            flight = c.tween(1.6, (k) => { const p1 = handOf(hero); bowl.position.lerpVectors(p0, p1, k); bowl.position.y += Math.sin(k * Math.PI) * 0.4; bowl.rotation.y = k * 3; }, 'inOutSine', () => { bowl.visible = false; c.act(hero, ['sitEat', 'drink', 'cheer'], { loop: true }); });
          }],
        ] },
      // 3. the hero drinks: really good
      { dur: 4.2,
        cam: { pos: (c, k) => headOf(hero).addScaledVector(hcam, 1.3 - k * 0.15).add(V(0, 0.08, 0)), look: (c) => headOf(hero).add(V(0, -0.12, 0)), fov: 30 },
        enter: (c) => { c.act(K, ['cheer', 'laugh'], {}); },
        at: [
          [0.6, (c) => { bowl.visible = false; c.act(hero, ['drink', 'sitEat', 'cheer'], { loop: true }); c.sfx('slurp'); }],
          [1.7, (c) => { c.sfx('swallow'); }],
          [2.0, (c) => {
            c.sfx('yum'); hero.setExpression && hero.setExpression('happy');
            const h = headOf(hero);
            c.P.add.emit({ pos: [h.x, h.y + 0.2, h.z], radial: [0.3, 0.8], radialUp: 1, count: 22, life: [0.6, 1.2], size: [1, 2], color: ['#ffd27a', '#ff9ab0', '#fff0c0'], glow: 2.6, gravity: -0.3 });
            c.say(hero, 'Mmm! Best stew yet!', 2.0);
          }],
        ] },
      // 4. "found this in a creepy old chest…"
      { dur: 2.8,
        cam: { pos: [at(hs, hcam, 2.0, 1.1, 0.5), at(hs, hcam, 1.8, 1.05, 0.35)], look: [headOf(hero).add(V(0, -0.25, 0)), headOf(hero).add(V(0, -0.2, 0))], fov: 34 },
        enter: (c) => {
          bowl.position.copy(hs.clone().addScaledVector(hcam, 0.35)).setY(0.02); bowl.rotation.set(0, 0, 0); bowl.visible = true;
          c.act(hero, ['sitTalk', 'sit'], { loop: true });
          c.say(hero, 'Found this in a creepy old chest…', 2.6, 0.2);
          for (const f of friends) f.lookAt && f.lookAt(headOf(hero));
        } },
      // 5. the old chest (insert)
      { dur: 1.8,
        cam: { pos: [chest.clone().addScaledVector(aud, 1.5).add(V(0, 0.7, 0)), chest.clone().addScaledVector(aud, 1.1).add(V(0, 0.55, 0))], look: [chest.clone().setY(0.35), chest.clone().setY(0.3)], fov: [34, 30] },
        enter: (c) => {
          c.sfx('chest_creak', { vol: 0.8 }); c.sfx('medusa_whisper', { vol: 0.35 });
          c.lightTo(chestLight, 3.5, 0.8);
          c.tween(1.8, (k) => (chestGlow.material.opacity = 0.2 + Math.sin(k * Math.PI) * 0.8), 'linear');
          chestGlow.material.color.set('#7affc0').multiplyScalar(1.6);
        } },
      // 6. the hero pulls out the totem
      { dur: 2.6,
        cam: { pos: (c, k) => headOf(hero).addScaledVector(hcam, 1.45 - k * 0.25).add(V(0, 0.02, 0)), look: (c) => headOf(hero).add(V(0, -0.2, 0)), fov: 31 },
        enter: (c) => {
          c.lightTo(chestLight, 0, 0.6);
          c.act(hero, ['present', 'point'], { loop: true });
          if (totem) { totemHeld = true; totem.visible = true; }
          c.sfx('sparkle', { vol: 0.5 }); c.sfx('medusa_whisper', { vol: 0.5 });
          for (const f of friends) f.setExpression && f.setExpression('surprised');
        } },
      // 7. close on the totem: a girl covering her eyes, wrapped in snakes
      { dur: 3.4,
        cam: {
          pos: (c, k) => { const t = totem ? totem.getWorldPosition(V()) : handOf(hero); const a = faceTo(t, t.clone().add(hcam)) - 0.5 + k * 1.0; return V(t.x + Math.sin(a) * 0.5, t.y + 0.1, t.z + Math.cos(a) * 0.5); },
          look: (c) => (totem ? totem.getWorldPosition(V()) : handOf(hero)).add(V(0, 0.06, 0)), fov: [26, 23], smooth: 0,
        },
        enter: (c) => {
          c.postTo({ saturation: 0.95, vignette: 0.6 }, 1.5);
          c.every(18, () => { const t = totem ? totem.getWorldPosition(V()) : handOf(hero); c.P.add.emit({ pos: [t.x + rnd(-0.12, 0.12), t.y + rnd(-0.05, 0.2), t.z + rnd(-0.12, 0.12)], vel: [0, 0.15, 0], spread: 0.05, life: [0.8, 1.6], size: 1, color: ['#7affc0', '#c0ffe0'], glow: 2.4, flicker: 0.5 }); });
          c.sfx('curse_hum', { vol: 0.5 });
        } },
      // 8. up, proud… and over Pip
      { dur: 4.4,
        cam: { pos: [at(hs, aud, 2.8, 1.25, 0.9), at(hs, aud, 2.6, 1.1, 0.6)], look: (c) => { const mid = hs.clone().lerp(pipPos, 0.5).setY(0.55); return totem && totem.visible && flight ? mid.lerp(totem.getWorldPosition(V()), 0.5) : mid; }, fov: 38, smooth: 4 },
        enter: (c) => {
          c.postTo({ saturation: 1.12, vignette: 0.42 }, 0.5);
          hero.setSeated && hero.setSeated(false);
          hero.group.rotation.y = faceTo(hs, F);
          c.act(hero, ['present', 'cheer'], { loop: true });
          flight = null;
        },
        at: [
          [0.8, (c) => { const back = hs.clone().addScaledVector(outH, 0.42); c.walk(hero, back, 0.6, { face: false, anim: 'walk', then: false }); }],
          [1.4, (c) => {
            c.act(hero, ['trip', 'fall', 'hurt'], {}); c.sfx('trip'); c.sfx('pip_yip');
            if (pip) c.act(pip, ['yelp', 'happy'], {});
            c.slowmo(0.35, 0.9, 0.08, 0.4); c.shake(0.15);
            if (totem) {
              totemHeld = false;
              const p0 = totem.getWorldPosition(V());
              totem.position.copy(p0); totem.rotation.set(0, 0, 0);
              const land = hs.clone().lerp(F, 0.45).setY(0.03);
              flight = c.tween(1.0, (k) => { totem.position.lerpVectors(p0, land, k); totem.position.y += Math.sin(k * Math.PI) * 0.55; totem.rotation.x = k * 7; totem.rotation.z = k * 3; }, 'linear', () => {
                c.sfx('statue_break'); c.shake(0.3); c.haptic(40);
                let sh = null;
                try { sh = totem.shatter && totem.shatter(c.setOf('camp'), 0.02); } catch (e) { sh = null; }
                if (sh && sh.update) c.tick((dt) => { sh.update(dt); return !sh.done; }, true);
                else if (Array.isArray(sh) && sh.length) c.shards.push(...sh);
                totem.visible = false;
                c.debris.spawn({ pos: [land.x, 0.1, land.z], count: 18, colors: ['#a8b0a0', '#7a8a78', '#c8d0c0', '#5a8a6a'], speed: 1.6, up: 1.4, spread: 0.2, gravity: 9, floor: 0.02, life: 2, scale: [0.4, 1] });
                c.P.add.emit({ pos: [land.x, 0.12, land.z], radial: [0.4, 1.6], radialUp: 1.4, count: 40, life: [0.4, 1.2], size: [1, 2], color: ['#7affc0', '#e0fff0'], glow: 3, gravity: 1 });
              });
            }
          }],
          [2.8, (c) => { c.act(hero, ['cower', 'hurt', 'idle'], { loop: true }); }],
        ] },
      // 9. silence… then the floor splits
      { dur: 5.0,
        cam: { pos: [F.clone().addScaledVector(dirC, -1.5).addScaledVector(perpC, 0.6).setY(1.95), F.clone().addScaledVector(dirC, -1.3).addScaledVector(perpC, 0.5).setY(1.85)], look: [rise.clone().setY(0.15), rise.clone().setY(0.3)], fov: [42, 44] },
        enter: (c) => {
          c.later(0.5, () => { c.sfx('rumble', { vol: 0.7 }); c.shake(0.25); });
          c.dustFall(F.x - 3, F.x + 3, F.z - 3, F.z + 2, 4.4, 26);
          c.later(1.1, () => {
            c.sfx('ground_split'); c.shake(0.7); c.haptic(60);
            c.tween(2.8, (k) => crackOpen(k), 'outCubic');
            c.lightTo(crackLight, 7, 2.2);
            beams.forEach((b, i) => c.later(0.4 + i * 0.25, () => c.tween(1.6, (k) => (b.material.uniforms.uOp.value = k * 0.22), 'inQuad')));
            c.every(30, () => { const p = crackPts[(Math.random() * crackPts.length) | 0]; c.P.add.emit({ pos: [p.x, 0.05, p.z], vel: [0, rnd(0.6, 1.6), 0], spread: 0.1, life: [0.8, 1.8], size: [1, 2], color: ['#7affc0', '#c0ffe0', '#3affa0'], glow: 2.8 }); }, true);
            for (const id of CHARACTER_ORDER) { const ch = crew[id]; ch.setSeated && ch.setSeated(false); c.act(ch, ['cower', 'block', 'hurt'], { loop: true }); ch.setExpression && ch.setExpression('surprised'); }
            if (pip) { c.act(pip, ['run', 'walk'], { loop: true }); c.walk(pip, hs.clone().addScaledVector(sideH, 0.35).addScaledVector(outH, 0.1), 0.6, { anim: 'run', then: 'idle' }); c.sfx('pip_whine'); }
          });
          c.postTo({ saturation: 1.0, bloom: 1.15 }, 2);
        } },
      // 10. a figure crawls out — Medusa
      { dur: 6.0,
        cam: { pos: [rise.clone().addScaledVector(dirC, -2.3).addScaledVector(perpC, 0.7).setY(0.45), rise.clone().addScaledVector(dirC, -2.1).addScaledVector(perpC, 0.55).setY(0.5)], look: [rise.clone().setY(0.4), rise.clone().setY(1.9)], fov: [38, 44], roll: [0.05, -0.03] },
        enter: (c) => {
          med.group.visible = true; c.freeze(med, false);
          med.setEyes && med.setEyes(0);
          if (!c.act(med, ['crawlOut'], {})) { med.group.position.y = -2.8; c.tween(3.6, (k) => (med.group.position.y = -2.8 + 2.8 * k), 'outCubic'); c.act(med, ['intro', 'idle'], {}); }
          c.sfx('medusa_whisper', { vol: 0.8 }); c.later(1.2, () => c.sfx('hiss', { vol: 0.6 }));
          c.later(3.7, () => { c.act(med, ['rise', 'roar', 'idle'], {}); c.sfx('rumble', { vol: 0.6 }); c.shake(0.3); c.postTo({ bloom: 1.35 }, 0.4); });
          c.every(26, () => c.P.alpha.emit({ pos: [rise.x + rnd(-1, 1), 0.05, rise.z + rnd(-0.4, 0.4)], vel: [0, rnd(0.2, 0.5), 0], spread: 0.1, life: [1.6, 2.8], size: [2, 3], sizeEnd: 5, color: ['#1a3a2a', '#2a4a3a'], alpha: 0.4, fadeIn: 0.3, swirl: 0.6 }));
        } },
      // 11. she thanks you… and you answer
      { dur: 5.2,
        cam: { pos: (c, k) => headOf(hero).addScaledVector(flat(hs).sub(rise).normalize(), 1.0).addScaledVector(sideV, 0.5 - k * 0.1).add(V(0, 0.32, 0)), look: (c) => med.group.position.clone().add(V(0, (med.height || 2.2) * 0.8, 0)), fov: 40 },
        enter: (c) => { c.act(med, ['cover', 'talk', 'idle'], { loop: true }); c.sfx('medusa_whisper', { vol: 0.6 }); },
        at: [
          [0.6, (c) => c.ask([
            { who: 'medusa', at: med, text: 'Free… at last. Thank you, little forger.', replies: [{ text: 'Who… are you?' }, { text: "Uh. You're welcome?" }, { text: 'Stay back!' }], replyAt: hero },
            { who: 'medusa', at: med, text: 'For that, I will spare you.', auto: 1.6 },
          ], () => c.act(med, ['talk', 'cover'], { loop: true }))],
        ] },
      // 12. her eyes open
      { dur: 2.2,
        cam: { pos: (c, k) => med.group.position.clone().add(V(0, (med.height || 2.2) * 0.85, 0)).addScaledVector(flat(hs).sub(rise).normalize(), 1.4 - k * 0.3), look: (c) => med.group.position.clone().add(V(0, (med.height || 2.2) * 0.85, 0)), fov: [30, 26] },
        enter: (c) => {
          const own = c.act(med, ['gaze'], {});
          if (!own) c.act(med, ['special', 'roar'], {});
          c.later(0.5, () => { if (!own) c.tween(0.7, (k) => med.setEyes && med.setEyes(k), 'inQuad'); c.sfx('gaze'); });
          c.later(1.4, () => { c.flash(0.6, '#7affc0'); c.punch = 5; c.haptic(50); });
        } },
      // 13. the gaze rolls over the camp: friends, ore and your weapon turn to stone
      { dur: 4.8,
        cam: { pos: [at(F, aud, 5.0, 3.6, 0.4), at(F, aud, 4.6, 3.3, 0.2)], look: [F.clone().setY(0.3), F.clone().setY(0.4)], fov: 44 },
        enter: (c) => {
          const ring = c.add(waveRing('#7affc0', 0.1), 'camp');
          ring.position.copy(rise).setY(0.04);
          c.tween(1.8, (k) => { ring.scale.set(0.2 + k * 7.5, 1, 0.2 + k * 7.5); ring.material.uniforms.uOp.value = 1 - k * 0.8; ring.material.uniforms.uTime.value = k * 3; }, 'outCubic', () => { ring.visible = false; });
          c.postTo({ saturation: 0.75, exposure: 0.95 }, 2.5);
          friends.forEach((f) => { const d = flat(f.group.position).distanceTo(rise); c.petrify(f, 1.4, { delay: 0.15 + d / 4.2, vol: 0.5 }); c.later(0.15 + d / 4.2, () => c.every(10, () => c.chips(f), false)); });
          c.petrify(haul, 1.2, { delay: 0.2 + flat(haul.position).distanceTo(rise) / 4.2, sound: false, freeze: false });
          if (tool) c.petrify(tool, 1.0, { delay: 0.2 + flat(tool.position).distanceTo(rise) / 4.2, sound: false, freeze: false });
          // the hero is spared: they curl around Pip
          c.act(hero, ['cower', 'block'], { loop: true });
          c.sfx('stone_crack', { vol: 0.5 });
        } },
      // 14. the weapon doesn't break: the curse sinks into the stone blade (it will petrify what it kills)
      { dur: 2.2,
        cam: tool ? { pos: [tool.position.clone().addScaledVector(aud, 1.35).add(V(0, 0.95, 0)), tool.position.clone().addScaledVector(aud, 1.2).add(V(0, 0.85, 0))], look: [tool.position.clone().setY(0.25), tool.position.clone().setY(0.2)], fov: 32 }
          : { pos: [at(hs, hcam, 1.4, 0.8)], look: [headOf(hero)], fov: 34 },
        at: [[1.0, (c) => {
          c.sfx('gaze', { vol: 0.45, pitch: 1.4 }); c.flash(0.18, '#7affc0');
          if (tool) {
            const p = tool.position.clone();
            c.debris.spawn({ pos: [p.x, 0.3, p.z], count: 12, colors: ['#7affc0', '#c8ffe8', '#8a8696'], speed: 0.6, up: 1.4, spread: 0.2, gravity: 2, floor: 0.02, life: 1.8, scale: [0.2, 0.5] });
          }
        }]] },
      // 15. the heralds rise and take the statues down into the dark
      { dur: 5.4,
        cam: { pos: [at(F, aud, 5.4, 1.4, -0.6), at(F, aud, 5.0, 1.6, -0.3)], look: [F.clone().setY(0.9), F.clone().setY(1.0)], fov: [46, 44] },
        enter: (c) => {
          c.act(med, ['summon', 'roar'], {});
          heralds.forEach((m, i) => c.later(0.3 + i * 0.45, () => {
            m.group.visible = true; c.freeze(m, false);
            c.act(m, ['intro', 'roar'], {});
            c.tween(0.9, (k) => (m.group.position.y = -3.2 + 3.2 * k), 'outBack');
            c.sfx('herald_roar', { vol: 0.7, pitch: 0.9 + i * 0.1 }); c.shake(0.3);
            const p = m.group.position;
            c.debris.spawn({ pos: [p.x, 0.1, p.z], count: 14, colors: ['#4a4054', '#6a6070', '#2e2838'], speed: 2, up: 2, spread: 0.3, gravity: 9, floor: 0.02, life: 1.8, scale: [0.4, 1] });
          }));
          heralds.forEach((m, i) => c.later(2.6 + i * 0.25, () => {
            const f = friends[i];
            c.act(m, ['attack', 'special'], {});
            c.sfx('hiss', { vol: 0.6 });
            const f0 = f.group.position.clone(), m0 = m.group.position.clone();
            const dest = crackPts[Math.min(crackPts.length - 1, Math.round(((i + 1) / 4) * (crackPts.length - 1)))].clone();
            c.tween(1.6, (k) => {
              f.group.position.lerpVectors(f0, V(dest.x, -2.6, dest.z), k * k);
              m.group.position.lerpVectors(m0, V(dest.x, -3.4, dest.z), k * k);
            }, 'linear', () => { f.group.visible = false; m.group.visible = false; });
            c.later(1.0, () => c.sfx('rock_break', { vol: 0.5 }));
          }));
        } },
      // 16. she laughs and sinks away; one snake stays for you
      { dur: 4.0,
        cam: { pos: (c, k) => snakeAt.clone().addScaledVector(flat(snakeAt).sub(hs).normalize(), 1.6).add(V(0, 0.9, 0)).addScaledVector(sideV, 0.4), look: (c) => headOf(hero).add(V(0, -0.2, 0)), fov: 38 },
        enter: (c) => {
          c.act(med, ['laugh', 'idle'], {}); c.sfx('medusa_laugh');
          c.later(1.2, () => c.tween(1.8, (k) => (med.group.position.y = -3.2 * k), 'inQuad', () => { med.group.visible = false; }));
          c.later(1.4, () => {
            snake.group.visible = true; c.freeze(snake, false);
            c.tween(0.8, (k) => (snake.group.position.y = -2.5 + 2.5 * k), 'outCubic');
            c.act(snake, ['intro', 'roar', 'idle'], {}); c.sfx('hiss'); c.sfx('snake_rattle', { vol: 0.7 });
          });
          c.later(2.2, () => { if (tool && hero.hold) { tool.rotation.set(0, 0, 0); tool.position.set(0, 0, 0); try { hero.hold(tool, 'right'); } catch (e) { /* the axe stays */ } c.sfx('equip', { vol: 0.6 }); } });
          c.later(2.6, () => {
            c.act(hero, ['carry', 'idle'], { loop: true });
            if (pip) {
              c.act(pip, ['carried', 'idle'], { loop: true });
              if (hero.carryPoint) { hero.carryPoint.add(pip.group); pip.group.position.set(0, 0, 0); pip.group.rotation.set(0, 0, 0); }
              else hero.hold(pip.group, 'left');
            }
            c.sfx('pip_whine', { vol: 0.6 });
          });
          c.postTo({ saturation: 0.9 }, 1);
        } },
      // 17. run
      { dur: 3.6,
        cam: { pos: (c, k) => hero.group.position.clone().addScaledVector(flat(hero.group.position).sub(flat(C.exitTunnel)).normalize(), 1.9 - k * 0.4).add(V(0, 1.35, 0)).addScaledVector(sideV, 0.5), look: (c) => hero.group.position.clone().add(V(0, 0.5, 0)), fov: 44, smooth: 5 },
        enter: (c) => {
          const runA = c.act(hero, ['carryRun', 'run'], { loop: true }) || 'run';
          c.walk(hero, C.exitTunnel, 1.5, { anim: runA, then: false });
          c.later(1.5, () => c.walk(hero, C.exitDeep, 1.2, { anim: runA, then: false }));
          c.later(0.4, () => { c.act(snake, ['attack', 'special'], {}); c.sfx('dodge'); c.sfx('hiss', { vol: 0.7 }); c.shake(0.2); });
          c.every(6, () => c.sfx('footstep_stone', { vol: 0.5 }));
          c.later(2.5, () => { c.fadeTo = 1; c.fadeRate = 1.2; });
        } },
    ],
  };
};
SCRIPTS.dive = SCRIPTS.intro; // older callers asking for the run start get the intro
// No story at boot any more: an old caller asking for 'prologue' (or an unknown id) gets an instant hand-back.
SCRIPTS.prologue = (c) => { c.fade = 1; c.later(0, () => c.finish(true)); return { shots: [{ dur: 0.2, cam: { pos: [[0, 1, 3]], look: [[0, 1, 0]] } }] }; };
SCRIPTS.none = SCRIPTS.prologue;
SCRIPTS.chase = SCRIPTS.prologue; // the chase is played, not watched: scenes/tutorial.js

// ------------------------------------------------------------------ shared: top-down staging in the game's rooms
/** Bosses that aren't Heralds: how they look while their real model is on its way, and their card. */
const BOSS_LOOKS = {
  grand_puffcap: { stage: 0, name: 'Grand Puffcap', title: 'King of the Rot', glow: '#ff8a9a', col: '#e8b8a0', belly: '#f8e0c8', eye: '#ffe04a', alts: ['myconid_brute', 'bloatcap', 'shroomling'], standIn: 2.4, from: 'floor', spores: ['#ff9ab8', '#c8ff8a', '#ffe0f0'],
    line: 'MORE… SPORES… FOR… THE QUEEN!', replies: [{ text: 'Not today, mushroom.' }, { text: 'Let Bran go!' }, { text: 'You smell… damp.' }] },
};
const BOSS_LINES = {
  thornscale: { line: 'The queen wants you back, forger.', replies: [{ text: 'She can come get me.' }, { text: 'Where are my friends?' }] },
  glasscoil: { line: 'Your reflection will be your grave.', replies: [{ text: 'Mirror, mirror… no.' }, { text: 'Give back Elio!' }] },
  cinderfang: { line: 'Two heads. One meal.', replies: [{ text: 'Two heads, one axe.' }, { text: 'Let Clover go!' }] },
  medusa: { line: 'You came back, little forger.', replies: [{ text: 'I came for my friends.' }, { text: 'Your snakes are gone.' }] },
};
/** A Hades-style camera over a floor point: high, three-quarters, a little telephoto. */
const hadesAt = (P, dist = 1, side = 0) => ({ pos: V(P.x + side, P.y + 11.5 * dist, P.z + 8.6 * dist), look: V(P.x, P.y, P.z) });
/** Where the boss room's south door, centre and boss mark are (room_vox anchors, sane fallbacks). */
function arenaMarks(R) {
  const st = R.stage, A = R.A || {};
  const B = st.bounds || { x0: -12, x1: 12, z0: -7.5, z1: 7.5 };
  const d = st.doors && st.doors.s;
  const door = d ? V(d.x, 0, d.z) : V(0, 0, B.z1);
  const center = A.center ? flat(v3(A.center)) : V((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);
  const boss = A.boss ? flat(v3(A.boss)) : V(center.x, 0, B.z0 + (B.z1 - B.z0) * 0.3);
  const pedestal = A.pedestal ? flat(v3(A.pedestal)) : boss.clone().add(V((B.x1 - B.x0) * 0.24, 0, -0.6));
  return { B, door, center, boss, pedestal };
}
/** Free a friend for good: playable from now on (the systems decide how; a save fallback otherwise). */
function unlockFriend(c, fid) {
  for (const mod of [UNLOCKS, RUNMOD]) {
    for (const n of ['unlockHero', 'unlockCharacter']) { const f = mod && mod[n]; if (typeof f === 'function') { try { f(fid); return; } catch (e) { /* next */ } } }
  }
  const run = c.game.run;
  if (run && typeof run.rescue === 'function') { try { run.rescue(fid); } catch (e) { /* save fallback below */ } }
  const u = save.data.unlocks || (save.data.unlocks = {});
  const list = u.heroes || (u.heroes = ['durgan']);
  if (!list.includes(fid)) { list.push(fid); save.write(); }
}
/** The stage a boss lives on. */
const stageOfBoss = (id, c) => clamp((BOSS_LOOKS[id] && BOSS_LOOKS[id].stage) ?? (HERALDS[id] && HERALDS[id].act) ?? (MONSTERS[id] && MONSTERS[id].region) ?? actOf(c), 0, 3);
/** The friend a boss keeps in stone (Puffcap keeps Bran; the Heralds the rest; Medusa nobody). */
function heldFriend(id, c) {
  if (id === 'medusa') return null;
  const order = { grand_puffcap: 'bran', glasscoil: 'elio', cinderfang: 'clover', thornscale: 'bran' };
  const f = order[id];
  if (f && f !== c.who) return f;
  return statuesOf(c)[0] || null;
}

// ------------------------------------------------------------------ boss_<id> (top-down: the arena wakes up)
SCRIPTS.boss = (c, p) => {
  const id = p.arg && (BOSS_LOOKS[p.arg] || HERALDS[p.arg] || MONSTERS[p.arg]) ? p.arg : 'grand_puffcap';
  const L = BOSS_LOOKS[id] || HERALDS[id] || { col: '#6a8a5a', belly: '#c8d890', eye: '#ffe04a', glow: '#9aff6a', alts: [], from: 'floor' };
  const stage = stageOfBoss(id, c);
  const R = c.roomSet('arena', stage, { type: 'boss', seed: 70 + stage }, { type: 'boss', size: 'boss', seed: 70 + stage, doors: { s: 'open' } });
  const M = arenaMarks(R);
  const isMedusa = id === 'medusa';
  const glow = L.glow || '#9aff6a';
  // Durgan (and Pip) walk in from the south door, facing north
  const north = Math.PI;
  const h0 = M.door.clone().add(V(0, 0, -0.5)), h1 = M.door.clone().add(V(0, 0, -3.4));
  const hero = c.char(c.who, 'arena', h0, north, 'walk');
  const wpn = c.heroWeapon(c.who);
  if (wpn && hero.hold) { try { hero.hold(wpn, 'right'); } catch (e) { /* bare hands */ } }
  const pip = c.pet('arena', h0.clone().add(V(0.55, 0, 0.3)), north, 'walk');
  // the friend it keeps, in stone on a plinth
  const fid = heldFriend(id, c);
  let friend = null;
  if (fid && CHARACTERS[fid]) {
    friend = c.char(fid, 'arena', M.pedestal.clone(), faceTo(M.pedestal, h1), 'cower');
    c.act(friend, ['cower', 'block'], { loop: true }); c.settle(friend, 20);
    if (friend.setStone) friend.setStone(1); else c.petrify(friend, 0.01, { sound: false });
    c.freeze(friend);
  }
  // the boss: sitting in its spot (Puffcap snoozes), or rising for the Heralds and Medusa
  const def = MONSTERS[id];
  const bossPos = M.boss.clone();
  const start = isMedusa ? bossPos.clone().add(V(0, -2.4, 0)) : L.from === 'ceiling' ? bossPos.clone().setY(6) : L.from === 'water' || L.from === 'floor' && id !== 'grand_puffcap' ? bossPos.clone().setY(-3) : bossPos.clone();
  const mon = isMedusa ? c.medusa('arena', start, faceTo(bossPos, h1)) : c.beast(id, 'arena', start, faceTo(bossPos, h1), L.alts || [], L);
  if (!def && L.standIn) mon.group.scale.multiplyScalar(L.standIn);
  const sleeping = id === 'grand_puffcap';
  if (!sleeping) mon.group.visible = false;
  c.act(mon, sleeping ? ['sleep', 'idle'] : ['idle'], { loop: true });
  const mh = (mon.height || 2.2) * (!def && L.standIn ? L.standIn * 0.6 : 1) + (mon.fly || 0);
  const rim = c.light('arena', 'point', glow, 0, bossPos.clone().add(V(0, mh * 0.9, 1.4)), { dist: 10, decay: 1.2, fl: 0.1 });
  const key = c.light('arena', 'point', '#ffd8b0', 1.2, h1.clone().lerp(bossPos, 0.5).add(V(1.2, 3.2, 1)), { dist: 12, decay: 1.1, fl: 0.05 });
  const statueL = friend ? c.light('arena', 'spot', '#9ad8ff', 0, M.pedestal.clone().add(V(0.4, 4.2, 1.2)), { target: M.pedestal.clone().setY(0.6), dist: 9, angle: 0.35, pen: 0.7 }) : null;
  const spores = L.spores || null;
  const sporeTick = () => { if (!spores) return; const q = bossPos.clone().add(V(rnd(-1.6, 1.6), rnd(0.4, mh), rnd(-1, 1))); c.P.add.emit({ pos: [q.x, q.y, q.z], vel: [rnd(-0.2, 0.2), rnd(0.15, 0.5), rnd(-0.2, 0.2)], spread: 0.1, life: [1.4, 2.6], size: [1, 3], color: spores, glow: 1.6, swirl: 0.8 }); };
  const lines = BOSS_LINES[id] || L;
  return {
    music: isMedusa ? 'medusa' : id === 'grand_puffcap' ? 'puffcap' : 'boss',
    shots: [
      // 1. high and wide: the arena, and Durgan walking in
      { set: 'arena', dur: 3.4, dip: 0.9,
        cam: { pos: [hadesAt(h1.clone().lerp(bossPos, 0.3), 1.0, -1.0).pos, hadesAt(h1.clone().lerp(bossPos, 0.5), 0.92, -0.5).pos], look: [h1.clone().lerp(bossPos, 0.3), h1.clone().lerp(bossPos, 0.5)], fov: [36, 34] },
        enter: (c) => {
          c.walk(hero, h1, 2.4, { anim: 'walk', then: 'idleCombat' });
          if (pip) c.walk(pip, h1.clone().add(V(0.6, 0, 0.4)), 2.4, { anim: 'walk', then: 'sniff' });
          c.every(4, () => c.sfx('footstep_stone', { vol: 0.35 }));
          c.every(10, sporeTick, true);
          if (statueL) c.later(1.4, () => { c.lightTo(statueL, 5, 1.0); c.sfx('pip_whine', { vol: 0.4 }); });
        } },
      // 2. over the shoulder toward the boss
      { dur: 2.8,
        cam: { pos: [h1.clone().add(V(-0.9, 1.6, 1.8)), h1.clone().add(V(-0.7, 1.35, 1.2))], look: [bossPos.clone().setY(mh * 0.45), bossPos.clone().setY(mh * 0.55)], fov: [42, 36], smooth: 4 },
        enter: (c) => {
          c.sfx('rumble', { vol: 0.5 }); c.shake(0.12);
          if (sleeping) c.later(0.8, () => c.sfx('puffcap_snore', { vol: 0.7 }));
          else c.later(0.6, () => {
            mon.group.visible = true;
            c.act(mon, isMedusa ? ['rise', 'intro', 'idle'] : ['intro', 'idle'], {});
            c.tween(L.from === 'ceiling' ? 1.0 : 1.6, (k) => mon.group.position.lerpVectors(start, bossPos, k), L.from === 'ceiling' ? 'inQuad' : 'outCubic', () => { if (L.from === 'ceiling') { c.shake(0.6); c.sfx('drop'); } });
            c.sfx(isMedusa ? 'medusa_whisper' : 'boss_intro', { vol: 0.8 }); if (L.from === 'water') c.sfx('splash');
          });
          c.lightTo(rim, 4, 1.6);
        } },
      // 3. it wakes: the roar
      { dur: 2.6,
        cam: { pos: [bossPos.clone().add(V(1.4, mh * 0.3, 2.9)), bossPos.clone().add(V(1.1, mh * 0.25, 2.4))], look: [bossPos.clone().setY(mh * 0.65)], fov: [44, 38], roll: [0.05, -0.03] },
        at: [[0.35, (c) => {
          c.act(mon, isMedusa ? ['laugh', 'roar'] : sleeping ? ['wake', 'roar', 'special'] : ['roar', 'special'], {});
          c.sfx(isMedusa ? 'medusa_laugh' : sleeping ? 'puffcap_roar' : 'herald_roar'); c.punch = 6; c.haptic(60);
          c.burst(bossPos.clone().setY(mh * 0.7), glow, { size: 0.4, r: 3, flash: 0.25, shake: 0.9, n: 60 });
          if (spores) c.P.alpha.emit({ pos: [bossPos.x, mh * 0.6, bossPos.z], radial: [1, 3], radialUp: 0.6, count: 60, life: [1.4, 2.6], size: [3, 5], sizeEnd: 8, color: spores, alpha: 0.5, fadeIn: 0.2, swirl: 1 });
          if (pip) c.act(pip, ['bark', 'idle'], {});
        }]] },
      // 4. the name, and a word (you answer)
      { dur: 3.4,
        cam: { pos: [h1.clone().lerp(bossPos, 0.35).add(V(-1.6, 2.4, 3.2))], look: [h1.clone().lerp(bossPos, 0.6).setY(mh * 0.45)], fov: 40 },
        enter: (c) => {
          c.act(mon, ['idle'], { loop: true });
          c.titleCard(L.name || nameOf(id), L.title || titleOf(id), { at: 0.1, dur: 2.8, bottom: glow, line: glow });
        },
        at: [[1.6, (c) => { if (lines && lines.line) c.ask([{ who: id, at: mon, text: lines.line, replies: lines.replies, replyAt: hero, maxW: 300 }]); }]] },
      // 5. pull back to the fighting view
      { dur: 1.6,
        cam: { pos: [hadesAt(h1.clone().lerp(bossPos, 0.35), 0.95).pos], look: [h1.clone().lerp(bossPos, 0.35)], fov: 32, smooth: 3 },
        enter: (c) => { c.act(hero, ['idleCombat', 'idle'], { loop: true }); },
        at: [[1.0, (c) => { c.fadeTo = 1; c.fadeRate = 2; }]] },
    ],
  };
};

// ------------------------------------------------------------------ rescue_<friend> (top-down: the statue cracks)
const RESCUE_REPLY = { bran: [{ text: 'Missed you, smith.' }, { text: 'Stew is waiting.' }], elio: [{ text: 'Kindle missed you.' }, { text: 'You okay?' }], clover: [{ text: 'Knew you would.' }, { text: 'Stay close.' }], durgan: [{ text: 'Hold on, friend.' }] };
SCRIPTS.rescue = (c, p) => {
  const fid = CHARACTERS[p.arg] ? p.arg : statuesOf(c)[0] || CHARACTER_ORDER.find((x) => x !== c.who);
  const stage = clamp(p.stage ?? p.act ?? actOf(c), 0, 3);
  const R = c.roomSet('arena', stage, { type: 'boss', seed: 70 + stage }, { type: 'boss', size: 'boss', seed: 70 + stage, doors: { s: 'open' } });
  const M = arenaMarks(R);
  const fpos = M.pedestal.clone();
  const hpos = fpos.clone().add(V(-0.4, 0, 2.1));
  const hero = c.char(c.who, 'arena', hpos, faceTo(hpos, fpos), 'idle');
  const friend = c.char(fid, 'arena', fpos, faceTo(fpos, hpos), 'cower');
  c.act(friend, ['cower', 'block'], { loop: true }); c.settle(friend, 20);
  if (friend.setStone) friend.setStone(1); else c.petrify(friend, 0.01, { sound: false });
  c.freeze(friend);
  const pip = c.pet('arena', hpos.clone().add(V(0.5, 0, 0.2)), faceTo(hpos, fpos), 'idle');
  if (pip) c.act(pip, ['sniff', 'idle'], { loop: true });
  const toF = flat(fpos).sub(hpos).normalize();
  const side = V(toF.z, 0, -toF.x);
  const glowL = c.light('arena', 'point', '#fff0c0', 0, fpos.clone().setY(0.8).addScaledVector(toF, -0.4), { dist: 6, decay: 1.3, fl: 0.2 });
  const fh = () => headOf(friend);
  const F = CHARACTERS[fid] || { name: fid, color: '#e8a060' };
  return {
    music: 'ending',
    shots: [
      // the statue starts to crack
      { set: 'arena', dur: 3.6, dip: 0.8,
        cam: { pos: [hadesAt(hpos.clone().lerp(fpos, 0.5), 0.55, 1.2).pos, hadesAt(hpos.clone().lerp(fpos, 0.5), 0.42, 0.9).pos], look: [fpos.clone().setY(0.6)], fov: 34 },
        enter: (c) => {
          [0.5, 1.4, 2.3, 3.0].forEach((t, i) => c.later(t, () => {
            c.sfx('stone_crack', { vol: 0.6 + i * 0.1 });
            const h = fh(), q = V(h.x + rnd(-0.18, 0.18), rnd(0.2, h.y), h.z + rnd(-0.18, 0.18));
            c.P.add.emit({ pos: [q.x, q.y, q.z], radial: [0.2, 0.8], count: 12, life: [0.3, 0.8], size: [1, 2], color: ['#fff0c0', '#ffd27a'], glow: 3 });
            c.debris.spawn({ pos: [q.x, q.y, q.z], count: 3, colors: ['#8a8696', '#a8a4b4'], speed: 0.8, up: 0.8, spread: 0.1, gravity: 9, floor: 0.02, life: 1.4, scale: [0.3, 0.7] });
            c.lightTo(glowL, 1 + i * 1.2, 0.3);
          }));
        } },
      // the stone bursts: your friend steps out
      { dur: 3.0,
        cam: { pos: [flat(fpos).addScaledVector(toF, -2.4).addScaledVector(side, 1.3).setY(1.3), flat(fpos).addScaledVector(toF, -2.1).addScaledVector(side, 1.0).setY(1.15)], look: [fpos.clone().setY(0.65)], fov: 36 },
        enter: (c) => {
          c.flash(0.5, '#fff0c0'); c.shake(0.35); c.sfx('stone_shatter'); c.sfx('rescue'); c.haptic(50);
          c.unpetrify(friend, 0.6);
          c.debris.spawn({ pos: [fpos.x, 0.5, fpos.z], count: 40, colors: ['#8a8696', '#6a6676', '#a8a4b4'], speed: 2, up: 1.6, spread: 0.3, gravity: 9, floor: 0.02, life: 2.2, scale: [0.4, 1] });
          c.P.add.emit({ pos: [fpos.x, 0.6, fpos.z], radial: [0.8, 2.4], radialUp: 1, count: 70, life: [0.5, 1.4], size: [1, 3], color: ['#fff0c0', '#ffd27a', '#ffffff'], glow: 3.2, drag: 1.4 });
          c.act(friend, ['stepOut', 'victory', 'cheer'], {});
          c.lightTo(glowL, 0.8, 1.5);
          c.postTo({ saturation: 1.18, bloom: 1.2 }, 0.6);
          unlockFriend(c, fid);
        } },
      // they run to you: hug; Pip loses his mind
      { dur: 3.6,
        cam: { pos: [hadesAt(hpos.clone().lerp(fpos, 0.5), 0.36, 1.5).pos], look: [hpos.clone().lerp(fpos, 0.5).setY(0.5)], fov: 34 },
        enter: (c) => {
          // they meet just in front of you (you take a step too): close enough to hug
          c.walk(friend, hpos.clone().lerp(flat(fpos), 0.46), 0.8, { anim: 'run', then: false });
          c.later(0.2, () => c.walk(hero, hpos.clone().lerp(flat(fpos), 0.17), 0.5, { anim: 'walk', then: false }));
          c.later(0.7, () => { c.act(friend, ['hug', 'cheer'], { loop: true }); c.act(hero, ['hug', 'cheer'], { loop: true }); c.sfx('hug'); hero.setExpression && hero.setExpression('happy'); friend.setExpression && friend.setExpression('happy'); });
          if (pip) { c.later(0.5, () => { c.act(pip, ['happy', 'bark', 'run'], { loop: true }); c.sfx('pip_bark'); }); c.later(1.5, () => c.sfx('pip_yip')); }
          c.later(1.1, () => { const m = hpos.clone().lerp(fpos, 0.55); c.P.add.emit({ pos: [m.x, 1.0, m.z], radial: [0.4, 1.2], radialUp: 1.2, count: 30, life: [0.8, 1.6], size: [1, 2], color: ['#ff9ab0', '#ffd27a', '#ffffff'], glow: 2.6, gravity: -0.2 }); });
        } },
      // a word (you answer), and they're free for good
      { dur: 3.6,
        cam: { pos: (c) => fh().addScaledVector(toF, -1.8).addScaledVector(side, 1.15).add(V(0, 0.4, 0)), look: (c) => fh().add(V(0, -0.3, 0)), fov: 34 },
        enter: (c) => { c.act(friend, ['cheer', 'idle'], {}); },
        at: [
          [0.3, (c) => c.ask([{ who: fid, at: friend, text: RESCUE_LINE[fid] || 'Thank you!', replies: RESCUE_REPLY[fid], replyAt: hero }])],
          [0.9, (c) => c.titleCard(`${F.name} is free!`, 'Playable at camp from now on', { dur: 2.4, bottom: F.color || '#e8a060', line: F.color || '#e8a060' })],
          [3.0, (c) => { c.fadeTo = 1; c.fadeRate = 1.6; }],
        ] },
    ],
  };
};

// ------------------------------------------------------------------ ending (the gorgon falls; home for stew)
SCRIPTS.ending = (c) => {
  const G = c.roomSet('garden', 3, { type: 'boss', seed: 73 }, { type: 'boss', size: 'boss', seed: 73 });
  const M = arenaMarks(G);
  const mpos = M.boss.clone();
  const med = c.medusa('garden', mpos, faceTo(mpos, M.center));
  c.act(med, ['hurt', 'idle'], {}); c.settle(med, 10);
  if (med.setStone) med.setStone(1); else c.petrify(med, 0.01, { sound: false });
  c.freeze(med);
  const stand = mpos.clone().lerp(M.door, 0.55);
  const crewG = CHARACTER_ORDER.map((id, i) => { const pos = stand.clone().add(V((i - 1.5) * 0.75, 0, 0)); return c.char(id, 'garden', pos, faceTo(pos, mpos), 'idle'); });
  const pipG = c.pet('garden', stand.clone().add(V(0, 0, 0.7)), faceTo(stand, mpos), 'idle');
  const S = c.campSet('camp');
  const C = S.C;
  const F = flat(C.fire);
  const Mc = C.cams && C.cams.menu ? v3(C.cams.menu.pos) : C.camera && C.camera.pos ? v3(C.camera.pos) : F.clone().add(V(0, 2.5, 6));
  const aud = V(Mc.x - F.x, 0, Mc.z - F.z).normalize();
  CHARACTER_ORDER.forEach((id) => { const st = C.seats[id]; const ch = c.char(id, 'camp', st.pos.clone(), st.facing, 'idle'); ch.setSeated && ch.setSeated(st.height > 0.05, st.height); c.act(ch, id === 'durgan' ? ['stir', 'sit'] : ['drink', 'sitEat', 'sit'], { loop: true }); });
  const pipC = c.pet('camp', C.petBed.clone(), faceTo(C.petBed, F), 'happy');
  if (pipC) c.act(pipC, ['happy', 'idle'], { loop: true });
  return {
    music: 'ending', hold: true,
    shots: [
      { set: 'garden', dur: 4.4, dip: 0.8,
        cam: { pos: [hadesAt(mpos.clone().lerp(stand, 0.4), 0.6, 1.2).pos, hadesAt(mpos.clone().lerp(stand, 0.4), 0.5, 0.9).pos], look: [mpos.clone().setY(1.1)], fov: 36 },
        enter: (c) => {
          c.later(1.2, () => {
            c.sfx('stone_shatter'); c.sfx('rumble', { vol: 0.6 }); c.shake(0.5);
            let sh = null;
            try { sh = med.shatter && med.shatter(); } catch (e) { sh = null; }
            if (sh && sh.update) c.tick((dt) => { sh.update(dt); return !sh.done; }, true);
            else med.group.visible = false;
            c.debris.spawn({ pos: [mpos.x, 1.0, mpos.z], count: 60, colors: ['#8a8696', '#6a6676', '#a8a4b4', '#5a8a6a'], speed: 2.4, up: 2, spread: 0.6, gravity: 9, floor: 0.02, life: 2.6, scale: [0.5, 1.2] });
            c.P.add.emit({ pos: [mpos.x, 1.2, mpos.z], radial: [0.8, 3], radialUp: 1.5, count: 90, life: [0.8, 2], size: [1, 3], color: ['#7affc0', '#e0fff0', '#ffffff'], glow: 3, drag: 1.2 });
            c.flash(0.4, '#e0fff0');
          });
        } },
      { dur: 4.0,
        cam: { pos: [stand.clone().add(V(0.6, 1.4, -2.6)), stand.clone().add(V(0.4, 1.2, -2.2))], look: [stand.clone().setY(0.6)], fov: 40 },
        enter: (c) => {
          crewG.forEach((ch, i) => c.later(i * 0.15, () => { c.act(ch, ['cheer', 'victory'], { loop: true }); ch.setExpression && ch.setExpression('happy'); }));
          if (pipG) { c.act(pipG, ['happy', 'bark'], { loop: true }); c.sfx('pip_bark'); }
          c.sfx('victory_sting'); c.sfx('rescue', { vol: 0.6 });
          c.say(crewG[CHARACTER_ORDER.indexOf('durgan')], 'Who wants stew?', 2.4, 1.2, 'durgan');
          c.every(30, () => { const q = stand.clone().add(V(rnd(-1.5, 1.5), 2.2, rnd(-0.5, 0.5))); c.P.add.emit({ pos: [q.x, q.y, q.z], vel: [rnd(-0.3, 0.3), rnd(-0.6, -0.2), 0], spread: 0.1, life: [1.2, 2.4], size: 2, color: ['#ffd25e', '#ff8ab0', '#7fe3ff', '#fff0a8'], glow: 2.2, gravity: 0.6 }); });
        } },
      { set: 'camp', dur: 6.5, dip: 1.0,
        cam: { pos: [F.clone().addScaledVector(aud, 3.0).add(V(0, 1.4, 0)), F.clone().addScaledVector(aud, 2.6).add(V(0, 1.2, 0))], look: [F.clone().setY(0.6)], fov: [36, 34] },
        enter: (c) => { c.loop('campfire', 0.7); c.later(1.0, () => c.sfx('slurp', { vol: 0.5 })); c.later(2.4, () => c.sfx('yum', { vol: 0.6 })); c.later(3.2, () => c.sfx('stew_bubble', { vol: 0.5 })); } },
      { dur: 8.0,
        cam: { pos: [F.clone().addScaledVector(aud, 2.6).add(V(0, 1.2, 0)), F.clone().addScaledVector(aud, 6.5).add(V(0, 4.2, 0))], look: [F.clone().setY(0.6), F.clone().setY(0.3)], fov: [34, 44] },
        enter: (c) => { c.every(4, () => { const q = F.clone().add(V(rnd(-4, 4), rnd(0.6, 3), rnd(-3, 2))); c.P.add.emit({ pos: [q.x, q.y, q.z], vel: [0, 0.05, 0], spread: 0.05, life: [2, 4], size: 1, color: ['#d8ff8a', '#ffe08a'], glow: 2.6, flicker: 0.6, fadeIn: 0.6 }); }, true); } },
    ],
  };
};
SCRIPTS.victory = SCRIPTS.ending;

// ------------------------------------------------------------------ fallen (top-down: the curse takes you)
SCRIPTS.fallen = (c, p) => {
  const stage = clamp(p.stage ?? p.act ?? p.region ?? actOf(c), 0, 3);
  const R = c.roomSet('fall', stage, { type: 'fight', seed: 51 + stage }, { type: 'fight', size: 'normal', seed: 51 + stage });
  const M = arenaMarks(R);
  const at = M.center.clone();
  const hero = c.char(c.who, 'fall', at, 0.35, 'hurt');
  c.act(hero, ['defeat', 'hurt', 'cower'], {});
  const pip = c.pet('fall', at.clone().add(V(0.6, 0, 0.5)), faceTo(at.clone().add(V(0.6, 0, 0.5)), at), 'idle');
  return {
    music: 'defeat', hold: true,
    shots: [
      { set: 'fall', dur: 3.2, dip: 0.5,
        cam: { pos: [at.clone().add(V(1.0, 0.9, 2.0)), at.clone().add(V(0.8, 0.8, 1.7))], look: [at.clone().setY(0.45)], fov: 36, roll: [0, 0.06] },
        enter: (c) => {
          c.sfx('defeat_sting'); c.sfx('heartbeat'); c.later(1.4, () => c.sfx('heartbeat', { vol: 0.8 }));
          c.postTo({ saturation: 0.6, vignette: 0.7, exposure: 0.9 }, 2.5);
          if (pip) { c.act(pip, ['sniff', 'idle'], { loop: true }); c.later(0.8, () => c.sfx('pip_whine')); }
        } },
      { dur: 4.6,
        cam: { pos: [at.clone().add(V(0.8, 1.0, 1.9)), hadesAt(at, 0.55, 0.6).pos], look: [at.clone().setY(0.4), at.clone().setY(0.2)], fov: [36, 32], smooth: 2 },
        enter: (c) => {
          c.petrify(hero, 3.2, { vol: 0.8 });
          c.every(12, () => c.chips(hero), false);
          c.later(2.2, () => c.sfx('medusa_laugh', { vol: 0.45 }));
          c.postTo({ saturation: 0.15, vignette: 0.85, exposure: 0.78 }, 4);
          if (pip) c.later(1.8, () => c.act(pip, ['yelp', 'idle'], {}));
        } },
      { dur: 4.0,
        cam: { pos: [hadesAt(at, 0.8, 0.6).pos, hadesAt(at, 1.1, 0.4).pos], look: [at.clone()], fov: 32 },
        enter: (c) => { c.sfx('stone_crack', { vol: 0.5 }); c.envTo(0.5, 0.5, 0.55, 0.5, 3); c.caption('The curse takes you.', 0.6, 3.0); } },
    ],
  };
};

// ------------------------------------------------------------------ FX2D: screen-space cinematic stings
const KIND = {
  dust: { col: ['#f0e0c8', '#d8c8e8', '#ffe8c8'], add: false },
  ember: { col: ['#ffd27a', '#ff9a3a', '#ff6a2a', '#fff0b0'], add: true },
  curse: { col: ['#c86bff', '#ff5af0', '#e0b0ff'], add: true },
  ash: { col: ['#a8a0b0', '#7a7288', '#c8c0d0'], add: false },
  sparkle: { col: ['#ffffff', '#fff0c0'], add: true },
  spore: { col: ['#5af0c8', '#b0ffe0'], add: true },
  drip: { col: ['#bfe8ff', '#ffffff'], add: true },
  rock: { col: ['#4a3a40', '#6a5a5a', '#2a2026'], add: false },
  shard: { col: ['#ffffff', '#e8eef8', '#ff9af0', '#c0d0ff'], add: true },
  spark: { col: ['#ffffff', '#fff0a8', '#ffd25e'], add: true },
  stone: { col: ['#8a8a96', '#a8a8b4', '#6a6a76'], add: false },
  petal: { col: ['#ffb8c8', '#ffd8b0', '#fff0e0'], add: false },
  confetti: { col: ['#ffd25e', '#fff0a8', '#ff8ab0', '#7fe3ff'], add: true },
};
const pickOf = (arr) => arr[(Math.random() * arr.length) | 0];
function spawn(list, kind, x, y, o = {}) {
  const K = KIND[kind] || KIND.dust;
  const c = o.col && Math.random() < 0.6 ? o.col : pickOf(K.col);
  const p = { kind, x, y, vx: 0, vy: 0, g: 0, t: 0, life: 3, size: 1, col: c, add: K.add, rot: 0, vr: 0, ph: Math.random() * 6.28 };
  const s = o.scale || 1;
  switch (kind) {
    case 'dust': Object.assign(p, o.fast ? { vx: rnd(-3, 3), vy: rnd(-120, -60) * (o.up ? 1 : -1), life: rnd(1, 2) } : { vx: rnd(-4, 4), vy: rnd(-3, 2), life: rnd(4, 7) }); break;
    case 'ember': Object.assign(p, { vx: rnd(-6, 6), vy: rnd(-34, -14), life: rnd(1.4, 3) }); break;
    case 'curse': Object.assign(p, { vx: rnd(-5, 5), vy: rnd(-22, -8), life: rnd(1.8, 3.2), size: Math.random() < 0.3 ? 2 : 1 }); break;
    case 'ash': Object.assign(p, { vx: rnd(-6, 2), vy: rnd(5, 13), life: rnd(5, 8) }); break;
    case 'sparkle': Object.assign(p, { life: rnd(0.5, 1.2), size: 2 }); break;
    case 'spore': Object.assign(p, { vx: rnd(-3, 3), vy: rnd(-8, -2), life: rnd(4, 7), size: Math.random() < 0.3 ? 2 : 1 }); break;
    case 'drip': Object.assign(p, { vy: rnd(90, 140), life: 3 }); break;
    case 'rock': Object.assign(p, { vx: rnd(-8, 8), vy: rnd(10, 40), g: 260, life: 3, size: Math.random() < 0.5 ? 2 : 3, vr: rnd(-6, 6) }); break;
    case 'shard': { const a = rnd(0, 6.28), sp = rnd(50, 170) * s; Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * s, g: 120 * s, life: rnd(0.9, 1.8), size: Math.random() < 0.4 ? 3 : 2, vr: rnd(-14, 14) }); break; }
    case 'spark': { const a = rnd(0, 6.28), sp = rnd(70, 230) * s; Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 80 * s, life: rnd(0.3, 0.9) }); break; }
    case 'stone': { const a = rnd(-3.0, -0.1), sp = rnd(30, 110) * s; Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 200 * s, life: rnd(1, 2), size: Math.random() < 0.5 ? 2 : 3, vr: rnd(-8, 8) }); break; }
    case 'petal': Object.assign(p, { vx: rnd(-10, -2), vy: rnd(8, 16), life: rnd(5, 8), size: 2, vr: rnd(-3, 3) }); break;
    case 'confetti': { const a = rnd(-2.6, -0.5), sp = rnd(80, 200) * s; Object.assign(p, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 140 * s, life: rnd(1.2, 2.2), size: 2, vr: rnd(-10, 10) }); break; }
    default: break;
  }
  if (o.up && kind !== 'dust') p.vy = -Math.abs(p.vy);
  if (o.life) p.life = o.life;
  list.push(p);
}
function stepParticles(list, dt, h) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.t += dt;
    if (p.t >= p.life || p.y > h + 20) { list.splice(i, 1); continue; }
    p.vy += p.g * dt;
    let sway = 0;
    if (p.kind === 'curse' || p.kind === 'spore' || p.kind === 'ash' || p.kind === 'petal') sway = Math.sin(p.t * 2 + p.ph) * 10;
    p.x += (p.vx + sway) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.kind === 'spark' || p.kind === 'shard') p.vx *= 1 - dt * 1.2;
  }
}
function hexA(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; }
function drawParticles(ctx, list, scale = 1) {
  for (const add of [false, true]) {
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    for (const p of list) {
      if (p.add !== add) continue;
      const k = p.t / p.life;
      let a = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
      if (p.kind === 'sparkle' || p.kind === 'ember') a *= 0.65 + 0.35 * Math.sin(p.t * 18 + p.ph);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = p.col;
      const x = Math.round(p.x), y = Math.round(p.y), s = p.size * scale;
      if (p.kind === 'sparkle') { ctx.fillRect(x - s, y, s * 2 + scale, scale); ctx.fillRect(x, y - s, scale, s * 2 + scale); }
      else if (p.kind === 'shard' || p.kind === 'rock' || p.kind === 'stone' || p.kind === 'confetti' || p.kind === 'petal') {
        const flat = Math.abs(Math.cos(p.rot));
        ctx.fillRect(x, y, Math.max(scale, Math.round(s * (0.4 + flat))), s);
        if (p.kind === 'shard' && Math.sin(p.rot * 2) > 0.6) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, scale, scale); }
      } else if (p.kind === 'spark') { ctx.fillRect(x, y, s, s); ctx.globalAlpha *= 0.5; ctx.fillRect(Math.round(x - p.vx * 0.02), Math.round(y - p.vy * 0.02), s, s); }
      else if (p.kind === 'drip') ctx.fillRect(x, y, scale, 3 * scale);
      else ctx.fillRect(x, y, s, s);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
/**
 * A 2D effects layer drawn over a 3D scene: shards, sparks, embers, confetti, expanding rings,
 * radial light bursts and colour washes. Coordinates are UI pixels (960×540).
 */
export class FX2D {
  constructor() { this.parts = []; this.rings = []; this.fans = []; this.washes = []; this.amb = []; }
  burst(kind, x, y, n, o = {}) { for (let i = 0; i < n; i++) spawn(this.parts, kind, x + rnd(-2, 2), y + rnd(-2, 2), { scale: 1.6, ...o }); }
  ring(x, y, col = '#ffffff', o = {}) { this.rings.push({ x, y, col, t: 0, life: o.life || 0.55, r0: o.r0 || 6, r1: o.r1 || 120, w: o.w || 3 }); }
  rays(x, y, col = '#fff0c0', o = {}) { this.fans.push({ x, y, col, t: 0, life: o.life || 1.2, n: o.n || 14, len: o.len || 420, a: o.a || 0.35, spin: o.spin ?? 0.25 }); }
  wash(col, a = 0.35, life = 0.5) { this.washes.push({ col, a, t: 0, life }); }
  /** Continuous ambient emitter: {kind, rate, area:[x,y,w,h], col, up} */
  ambient(list) { this.amb = list; }
  update(dt, w = 960, h = 540) {
    for (const e of this.amb) {
      let n = (e.rate || 0) * dt;
      while (n > 0) {
        if (Math.random() < n) {
          const [ax, ay, aw, ah] = e.area || [0, 0, w, h];
          const top = e.kind === 'drip' || e.kind === 'ash' || e.kind === 'rock' || e.kind === 'petal';
          spawn(this.parts, e.kind, ax + Math.random() * aw, top ? ay - 4 : ay + Math.random() * ah, { scale: 1.4, ...e });
        }
        n -= 1;
      }
    }
    stepParticles(this.parts, dt, h);
    if (this.parts.length > 1400) this.parts.splice(0, this.parts.length - 1400);
    for (const arr of [this.rings, this.fans, this.washes]) for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t >= arr[i].life) arr.splice(i, 1); }
  }
  draw(ui) {
    const ctx = ui.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.fans) {
      const k = r.t / r.life, a = r.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      ctx.fillStyle = hexA(r.col, a);
      for (let i = 0; i < r.n; i++) {
        const ang = (i / r.n) * Math.PI * 2 + r.t * r.spin + (i % 2) * 0.05, wa = 0.05 + (i % 3) * 0.02;
        const L = r.len * (0.6 + (i % 4) * 0.12) * ease.outCubic(Math.min(1, k * 3));
        ctx.beginPath(); ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + Math.cos(ang - wa) * L, r.y + Math.sin(ang - wa) * L);
        ctx.lineTo(r.x + Math.cos(ang + wa) * L, r.y + Math.sin(ang + wa) * L);
        ctx.fill();
      }
    }
    for (const r of this.rings) {
      const k = ease.outCubic(r.t / r.life), rad = r.r0 + (r.r1 - r.r0) * k;
      ctx.globalAlpha = 1 - r.t / r.life;
      ctx.strokeStyle = r.col; ctx.lineWidth = Math.max(1, r.w * (1 - k));
      ctx.beginPath(); ctx.arc(Math.round(r.x), Math.round(r.y), rad, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const wsh of this.washes) { ctx.globalAlpha = wsh.a * (1 - wsh.t / wsh.life); ctx.fillStyle = wsh.col; ctx.fillRect(0, 0, ui.w, ui.h); }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawParticles(ctx, this.parts, 1);
  }
}
export { faceTo };
