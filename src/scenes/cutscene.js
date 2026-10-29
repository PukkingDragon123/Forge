// Cutscenes: real-time 3D cinematics staged with the game's own voxel sets, explorers and monsters.
// A cutscene is a list of shots. Each shot has a duration, a camera move (Catmull-Rom paths for the
// position and the look target, eased FOV and roll, handheld sway, trauma shake) and timed cues that
// drive actors (anims, walks, monster intros and roars, weapon shatters, stone creep), lights
// (colour and intensity ramps, flashes, flicker), the grade (exposure, saturation, lift/gain,
// vignette, bloom) and particles. Captions are sparse narration in the letterbox: nobody gives
// speeches. Use as an overlay (game.pushOverlay('cutscene', {id, onDone})) or a scene (game.go), or
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
import { glowSprite, beam, aimBeam, waveRing, waveWall, shockSphere, stoneify, buildShaft, buildSealWall } from '../art/cutscene_art.js';
import { tagCanvas } from '../art/handpaint.js';
import { REGIONS } from '../data/regions.js';
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
  if (!m) return [id || 'prologue', null];
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
    const script = SCRIPTS[kind] || SCRIPTS.prologue;
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
  /** The old lift shaft through the layers, with the lift, its lantern and passing lamps. */
  shaftSet(name, bands, o = {}) {
    const sh = buildShaft(bands, o);
    const group = new THREE.Group();
    group.add(sh.group);
    this.scene.add(group);
    const lift = buildProp('elevator');
    lift.position.set(0, o.y0 ?? -0.6, 0);
    group.add(lift);
    const lan = buildProp('lantern', { light: false });
    lan.position.set(0.62, 1.62, 0.5);
    lift.add(lan);
    const hemi = new THREE.HemisphereLight(new THREE.Color(o.sky || '#5a5a8a'), new THREE.Color(o.ground || '#3a2214'), 0.55);
    group.add(hemi);
    const key = this.light(lift, 'point', o.lamp || '#ffc070', 4.2, V(0.62, 1.55, 0.6), { dist: 7, decay: 1.4, fl: 0.12 });
    const pool = [0, 1, 2].map(() => this.light(group, 'point', '#ffc070', 0, V(), { dist: 5.5, decay: 1.5 }));
    const rimL = this.light(group, 'point', bands[bands.length - 1].glow, 0, V(0, -sh.depth, 0), { dist: 18, decay: 1.1 });
    const s = {
      name, group, shaft: sh, lift, lantern: lan, hemi, key, pool, rim: rimL, lightK: 1,
      fog: new THREE.FogExp2(new THREE.Color(o.fog || '#0c0812'), o.fogD ?? 0.035), background: new THREE.Color(o.bg || '#05040a'),
      update: (dt, t) => {
        const y = lift.position.y;
        const near = sh.lamps.slice().sort((a, b) => Math.abs(a.pos.y - y - 1) - Math.abs(b.pos.y - y - 1)).slice(0, 3);
        near.forEach((L, i) => { const l = pool[i]; l.position.copy(L.pos); l.color.set(L.col); l.userData.k = 3.2 * (0.85 + 0.15 * noise2(t * 6, i)); });
        rimL.position.set(0, Math.max(-sh.depth, y - 9), 0);
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
    this.t += sdt;
    const S = this.shot;
    if (S) {
      this.st += sdt;
      if (!this.finishing) this.fireCues();
      S.tick && S.tick(this, clamp(this.st / S.dur), this.st, sdt);
      if (this.st >= S.dur && !this.held && !this.finishing) this.next();
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (tw.dead) { this.tweens.splice(i, 1); continue; }
      tw.t += sdt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.e(k), tw.a);
      if (k >= 1) { this.tweens.splice(i, 1); tw.done && tw.done(); }
    }
    for (const a of this.actors) if (!a.frozen && a.obj.group.parent && this.visibleIn(a.obj.group)) a.obj.update(sdt);
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
    if (this.finishing || this.held || this.p.noSkip) return;
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
    for (const h of this.loops) h && h.stop && h.stop(0.4);
    this.env.solid.color.copy(this.envSave.solid);
    this.env.glow.color.copy(this.envSave.glow);
    for (const a of this.actors) if (a.mon && a.obj.dispose) { try { a.obj.dispose(); } catch (e) { /* already gone */ } }
    disposeTree(this.scene);
  }
}

/**
 * Warm the voxel stage cache for a cutscene ahead of time (stages take seconds to bake the first
 * time; cached ones come back fast). Call it while a menu is idle, e.g. before the prologue.
 */
export function prepareCutscene(id) {
  const [kind, arg] = parseId(id);
  const need = {
    prologue: [['tomb', 5]], dive: [['campfire', 0]], victory: [['tomb', 5], ['campfire', 0]],
    descend: [[arg >= REGIONS.length - 1 ? 'tomb' : 'arena', arg | 0]],
    boss: [[arg === 'cursed_lord' ? 'tomb' : 'arena', MONSTERS[arg] ? MONSTERS[arg].region : 0]],
  }[kind] || [];
  for (const [k, r] of need) { try { buildStage(k, r); } catch (e) { /* built on demand instead */ } }
}

// ================================================================== the scene wrapper
export class CutsceneScene extends Scene {
  get freezesBelow() { return true; }
  enter(p = {}) {
    this.p = p;
    this.cine = new Cine(this.game, p.id || 'prologue', p);
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
      else if (!isOverlay) g.go(g.run ? 'map' : 'title', {}, { transition: 'fade' });
    }
  }
  draw(ui) { this.cine.input(); this.cine.draw(ui); }
  exit() { this.cine.dispose(); }
}

// ================================================================== scripts
const SCRIPTS = {};
const SWORD = { bp: 'sword', ids: ['iron', 'coal', 'gold'], grade: 3 };

/** The six layers stacked: every boundary is a seam of that layer's light. */
function layerBands(from = 0, to = 5, h = 5) {
  const out = [];
  for (let i = from; i <= to; i++) { const R = REGIONS[i]; out.push({ pal: R.pal, glow: R.pal.glow, lamp: R.pal.glow2 || R.pal.glow, h: i === from ? h + 1 : h }); }
  return out;
}

// ------------------------------------------------------------------ prologue
SCRIPTS.prologue = (c) => {
  const who = c.p.char && CHARACTERS[c.p.char] ? c.p.char : 'bran';
  const T = c.stageSet('tomb', 'tomb', 5);
  c.envTo(0.5, 0.46, 0.68, 0.75, 0);
  T.lightK = 0.48;
  const seal = buildSealWall();
  seal.group.position.set(0, 0, -0.8);
  T.group.add(seal.group);
  // two braziers keep a little warmth by the door
  for (const x of [-3.3, 3.3]) { try { const b = buildProp('brazier', { intensity: 2.6, distance: 5 }); b.position.set(x, 0, -0.35); seal.group.add(b); } catch (e) { /* optional */ } }
  const runeMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2), fog: false });
  seal.group.traverse((o) => { if (o.isMesh && o.name === 'glow') o.material = runeMat; });
  const lord = c.monster('cursed_lord', 'tomb', V(0, 0, -3.6), Math.PI / 2);
  lord.group.scale.setScalar(0.9);
  c.freeze(lord);
  const doorL = c.light('tomb', 'point', '#b050ff', 0, V(0, 2.0, -1.4), { dist: 14, decay: 1.1, fl: 0.15, sp: 5 });
  const throneL = c.light('tomb', 'point', '#c86bff', 0, V(0.4, 4.6, -2.0), { dist: 14, decay: 1.1 });
  const eyes = c.add(glowSprite('#ff6af0', 0.5, 0), 'tomb');
  eyes.position.set(0, 3.95, -2.75);
  const spots = { bran: V(-0.3, 0, 1.25), durgan: V(-1.75, 0, 2.65), elio: V(0.95, 0, 2.3), clover: V(1.95, 0, 2.95) };
  const F = {};
  CHARACTER_ORDER.forEach((id) => { F[id] = c.char(id, 'tomb', spots[id].clone().add(V(0, 0, 1.8)), Math.PI, 'walk'); });
  const lan = buildProp('lantern', { light: false });
  F.durgan.hold(lan, 'left');
  const lanL = c.light(lan, 'point', '#ffc070', 4.2, V(0, 0.15, 0), { dist: 8, decay: 1.2, fl: 0.18 });
  const sword = buildWeaponMesh(SWORD);
  F.bran.hold(sword, 'right');
  F.bran.showBackItem && F.bran.showBackItem(false);
  let swordAt = null;
  const swordShot = (which, k) => {
    if (!swordAt) swordAt = F.bran.group.position.clone();
    const p = swordAt;
    return which ? V(p.x + 0.15, 1.2 + 0.04 * k, p.z + 0.1) : V(p.x - 1.55 + k * 0.25, 1.15, p.z - 1.45 + k * 0.2);
  };
  const stones = {};
  // beams of curse-light pouring out of the opening door
  const beams = [-0.7, 0, 0.7].map((x, i) => { const b = c.add(beam(9, 0.4, 2.6 + i * 0.3, '#b060ff', 0, 1.1), 'tomb'); aimBeam(b, V(x * 0.8, 1.9, -1.2), V(x * 2.6, -0.2, 6)); return b; });
  let wave = null, wallW = null;
  return {
    music: 'tomb',
    shots: [
      { set: 'tomb', dur: 6.4, dip: 1.6,
        cam: { pos: [[0.8, 5.0, 9.4], [0.3, 3.5, 8.1], [-0.2, 1.9, 6.7]], look: [[0, 1.0, 2.0], [0, 1.5, 0.6], [0, 1.75, -0.8]], fov: [48, 40] },
        enter: (c) => { CHARACTER_ORDER.forEach((id, i) => c.walk(F[id], spots[id], 3.8 + i * 0.35)); c.dustFall(-4, 4, -0.6, 3, 7.2, 10); },
        at: [[0.2, (c) => c.sfx('rumble', { vol: 0.35, pitch: 0.55 })]],
        cap: 'Long ago, four friends went looking for treasure in the Forbidden Tomb.', capAt: 1.4 },
      { dur: 4.6,
        cam: { pos: [[-1.75, 2.15, 3.7], [-1.3, 2.2, 3.0]], look: [[0.1, 1.85, -0.8], [0.1, 1.9, -0.8]], fov: [36, 31] },
        enter: (c) => { F.elio.play('read', { loop: true }); c.walk(F.bran, V(-0.2, 0, 0.95), 0.9, { then: 'point' }); },
        at: [
          [0.6, (c) => { c.sfx('curse_hum', { vol: 0.6 }); c.tween(1.6, (k) => runeMat.color.setScalar(2.2 + Math.sin(k * Math.PI * 3) * 1.4), 'linear'); }],
          [3.0, (c) => {
            c.sfx('crack'); c.shake(0.3); runeMat.color.setScalar(5); c.tween(0.8, (k) => runeMat.color.setScalar(5 - k * 2.2), 'outQuad');
            c.tween(0.7, (k) => { seal.bar.position.y = 1.85 - k * 1.8; seal.bar.rotation.z = k * 0.35; }, 'inQuad', () => { c.sfx('rock_break', { vol: 0.7 }); c.shake(0.35); c.debris.spawn({ pos: [0, 0.1, 0], count: 24, colors: seal.colors, speed: 2.2, up: 2, spread: 1.2, floor: 0.03, life: 2 }); seal.bar.visible = false; });
            for (const id of CHARACTER_ORDER) F[id].setExpression('surprised');
          }],
        ],
        cap: 'They found a door that was never meant to open.', capAt: 0.4 },
      { dur: 5.2,
        cam: { pos: [[0.4, 0.32, 5.6], [0.1, 0.5, 4.6]], look: [[0, 2.0, -0.8], [0, 2.4, -0.8]], fov: [40, 45], roll: [0.04, -0.02] },
        enter: (c) => {
          F.bran.play('idle', { loop: true }); F.elio.play('idle', { loop: true });
          c.sfx('door_creak', { pitch: 0.55, vol: 1 }); c.sfx('rumble', { vol: 0.7 });
          c.tween(4.2, (k) => { for (const L of seal.leaves) L.rotation.y = L.userData.side * 1.25 * k; }, 'inOutSine');
          c.lightTo(doorL, 9, 3);
          c.tween(3.2, (k) => beams.forEach((b) => (b.material.uniforms.uOp.value = k * 0.5)), 'inQuad');
          c.envTo(0.62, 0.42, 0.82, 1.2, 3.4);
          c.postTo({ bloom: 1.25, vignette: 0.5 }, 3);
          c.dustFall(-1.2, 1.2, -1.0, -0.6, 3.9, 40, '#a898b8');
          c.tick((dt) => { c.trauma = Math.max(c.trauma, 0.22); });
          c.later(1.2, () => { F.elio.play('block', { loop: true }); F.clover.play('dodge'); });
        } },
      { dur: 5.4,
        cam: { pos: [[0.85, 0.7, -0.4], [0.3, 0.55, -1.2]], look: [[0, 3.0, -3.6], [0, 3.5, -3.6]], fov: [42, 36] },
        enter: (c) => { c.later(0.15, () => { c.freeze(lord, false); lord.play('intro'); c.sfx('boss_intro'); }); c.lightTo(throneL, 7, 2.2); c.tween(2.2, (k) => eyes.material.color.setRGB(1.6 * k, 0.6 * k, 1.6 * k)); c.curseSmoke(V(0, 0.05, -3.2), 1.2, 26); },
        at: [[2.75, (c) => {
          lord.play('roar'); c.sfx('boss_roar'); c.punch = 7; c.haptic(60);
          c.burst(V(0, 3.0, -3.0), '#c86bff', { size: 1.4, r: 8, flash: 0.75, shake: 1.1, n: 160 });
          // the wall bursts outward
          seal.group.visible = false;
          for (let i = 0; i < 9; i++) c.debris.spawn({ pos: [rnd(-4.5, 4.5), rnd(0.5, 6.5), -1.0], count: 26, colors: seal.colors, speed: 2.5, up: 2.2, spread: 0.6, dir: [0, 0, rnd(3, 7)], floor: 0.03, life: 2.6, scale: [0.7, 1.6] });
          for (let i = 0; i < 60; i++) c.P.alpha.emit({ pos: [rnd(-4.5, 4.5), rnd(0.2, 4), -0.8], vel: [rnd(-0.6, 0.6), rnd(0, 0.6), rnd(1, 3)], spread: 0.3, life: [1.5, 3], size: [2, 4], sizeEnd: 6, color: ['#4a3a5a', '#6a5a78'], alpha: 0.55, drag: 1.2 });
          c.envTo(0.9, 0.56, 1.15, 1.5, 0.25, 'outQuad'); c.later(0.3, () => c.envTo(0.52, 0.38, 0.68, 1.15, 1.6));
          beams.forEach((b) => (b.visible = false));
          c.postTo({ bloom: 1.5 }, 0.2); c.later(0.6, () => c.postTo({ bloom: 1.15 }, 1.5));
        }]],
        cap: 'And something old woke up.', capAt: 0.9 },
      { dur: 2.1,
        cam: { pos: [[-3.3, 2.7, 4.6], [-2.9, 2.45, 4.1]], look: [[0.2, 0.5, -0.6], [0.1, 0.65, 0.2]], fov: [44, 41] },
        enter: (c) => {
          wave = c.add(waveRing('#c86bff', 0.14), 'tomb'); wave.position.set(0, 0.03, -3.2);
          wallW = c.add(waveWall('#c86bff'), 'tomb'); wallW.position.copy(wave.position);
          c.tween(4.2, (k) => { const r = 0.8 + k * 7.2; wave.scale.set(r, 1, r); wallW.scale.set(r, 1.3 + k * 1.1, r); wave.material.uniforms.uOp.value = wallW.material.uniforms.uOp.value = k < 0.8 ? 1 : (1 - k) / 0.2; }, 'linear');
          c.tick((dt, t) => {
            wave.material.uniforms.uTime.value = wallW.material.uniforms.uTime.value = t;
            const r = wave.scale.x;
            const op = wave.material.uniforms.uOp.value;
            for (let i = 0; i < 6 * op; i++) { const a = rnd(Math.PI * 0.1, Math.PI * 0.9); c.P.add.emit({ pos: [Math.cos(a) * r, 0.1, -3.2 + Math.sin(a) * r], vel: [Math.cos(a) * 1.4, rnd(0.6, 1.8), Math.sin(a) * 1.4], spread: 0.2, life: [0.3, 0.8], size: [1, 2], color: ['#c86bff', '#ff5af0', '#ffffff'], glow: 3 }); }
            return op > 0.01;
          }, true);
          for (const id of CHARACTER_ORDER) F[id].setExpression('surprised');
          F.bran.play('block', { loop: true }); F.bran.setExpression('determined');
          c.sfx('wind_whoosh', { pitch: 0.6 });
          c.tween(2.0, (k) => crackWeapon(sword, k * 0.5), 'linear');
        } },
      { dur: 2.3,
        cam: { pos: (c, k) => swordShot(0, k), look: (c, k) => swordShot(1, k), fov: [36, 31], roll: [0.05, -0.03] },
        enter: (c) => { c.sfx('crack', { pitch: 0.7 }); c.tween(0.5, (k) => crackWeapon(sword, 0.5 + k * 0.5), 'linear'); },
        at: [
          [0.5, (c) => {
            c.slowmo(0.14, 1.3, 0.04, 0.7);
            const wp = sword.getWorldPosition(V()).add(V(0, 0.35, 0));
            c.shards.push(...shatterPieces(sword, T.group, { force: 1.6 }));
            c.sfx('shatter'); c.flash(0.55, [0.85, 0.55, 1]); c.shake(0.6); c.haptic(50);
            c.P.add.emit({ pos: [wp.x, wp.y, wp.z], radial: [1, 3.6], count: 90, life: [0.6, 1.6], size: [1, 3], color: ['#ffffff', '#e0c8ff', '#c86bff'], glow: 3.4, drag: 1.2 });
            const ring = c.add(waveRing('#e0b0ff', 0.08), 'tomb'); ring.position.copy(wp); ring.rotation.x = Math.PI / 2;
            c.tween(0.5, (k) => { ring.scale.setScalar(0.1 + k * 1.6); ring.material.uniforms.uOp.value = 1 - k; }, 'outCubic', () => (ring.visible = false));
            F.durgan.play('point', { loop: true }); F.elio.play('cast', { loop: true }); F.clover.play('block', { loop: true }); F.bran.play('hurt'); F.bran.setExpression('hurt');
            for (const id of CHARACTER_ORDER) stones[id] = c.stone(F[id], '#d080ff', -0.2);
          }],
        ] },
      { dur: 6.8,
        cam: { pos: [[-2.4, 1.15, -1.5], [0.2, 1.05, -1.3], [2.4, 1.15, -1.1]], look: [[-1.2, 1.0, 2.2], [0.2, 0.95, 2.1], [1.3, 1.0, 2.5]], fov: 40, ease: 'linear' },
        enter: (c) => {
          c.loop('wind', 0.3);
          CHARACTER_ORDER.forEach((id, i) => {
            c.later(0.2 + i * 0.4, () => {
              c.stoneTo(F[id], 2.1, 3.6, 'inOutQuad');
              c.later(0.6, () => c.freeze(F[id]));
              c.sfx('rock_crack', { pitch: rnd(0.7, 1.1), vol: 0.6 });
            });
          });
          c.every(26, () => c.chips(F[CHARACTER_ORDER[(Math.random() * 4) | 0]]));
          c.later(1.9, () => { c.lightTo(lanL, 0.4, 0.4); c.later(0.5, () => c.lightTo(lanL, 0, 0.4)); c.sfx('quench', { vol: 0.5 }); });
          c.postTo({ saturation: 0.42, exposure: 0.88, lift: [0.02, 0.025, 0.06], gain: [0.95, 0.97, 1.05] }, 4.5);
          c.lightTo(throneL, 3.5, 4);
        },
        cap: 'The curse turned them all to stone…', capAt: 1.2 },
      { dur: 7.4,
        cam: { pos: [[0.15, 0.85, 5.8], [0.05, 1.0, 4.6]], look: [[0, 1.5, -1.0], [0, 1.6, -2.4]], fov: [33, 38] },
        enter: (c) => {
          c.envTo(0.22, 0.2, 0.32, 0.8, 2.5);
          c.lightTo(doorL, 1.2, 2.5); c.lightTo(throneL, 2.2, 2.5);
          c.later(1.3, () => {
            c.sfx('rumble', { vol: 0.5, pitch: 1.6 }); c.flash(0.1, [1, 0.85, 0.55]);
            const u = stones[who]; u.uSeamCol.value.set('#ffd27a'); u.uSeam.value = 1.6;
            c.stoneTo(F[who], -0.25, 2.0, 'inQuad');
            c.every(30, () => c.chips(F[who], undefined, true));
            c.sfx('rock_break', { vol: 0.8 });
          });
          c.later(3.4, () => { c.freeze(F[who], false); F[who].setExpression('determined'); c.walk(F[who], V(F[who].group.position.x * 0.4, 0, -1.6), 3.6, { face: true }); });
          c.later(5.6, () => { if (c.game.audio) c.game.audio.stopMusic(2.5); });
        },
        at: [[6.2, (c) => { c.fadeTo = 1; c.fadeRate = 1 / 1.2; }]],
        cap: '…all but one.', capAt: 2.0 },
    ],
  };
};

// ------------------------------------------------------------------ dive (run start)
SCRIPTS.dive = (c) => {
  const who = c.who;
  const camp = c.stageSet('camp', 'campfire', 0);
  const A = camp.A;
  const seats = A.seats || [];
  CHARACTER_ORDER.forEach((id, i) => {
    if (id === who || !seats[i]) return;
    const s = seats[i];
    const ch = c.char(id, 'camp', V(s.pos.x, 0, s.pos.z), s.rotY, 'sit');
    ch.setSeated(true, s.height);
    c.settle(ch);
    const u = c.stone(ch, '#c86bff', 5); u.uSeam.value = 0;
    c.freeze(ch);
  });
  const si = Math.max(0, CHARACTER_ORDER.indexOf(who)), seat = seats[si] || { pos: V(-1.3, 0.3, -1.05) };
  const start = V(seat.pos.x * 1.32, 0, seat.pos.z * 1.32 + 0.3);
  const fire = A.fire || V();
  const hero = c.char(who, 'camp', start, faceTo(start, fire), 'idle');
  const mouth = (A.mineEntrance || V(-2.6, 1, -3.4)).clone().setY(0);
  // the shaft through every layer
  const S = c.shaftSet('shaft', layerBands(0, 5, 5), { lamp: '#ffc070', fog: '#0c0812', radius: 3.8 });
  const rider = c.char(who, S.lift, V(0.05, 0.12, 0.05), 0.5, 'idle');
  const R0 = REGIONS[0];
  return {
    music: 'map',
    shots: [
      { set: 'camp', dur: 4.2, dip: 1.0,
        cam: { pos: [[3.2, 0.95, 3.6], [2.1, 1.15, 4.2]], look: [[0, 0.75, 0], [-0.5, 0.95, -0.6]], fov: [38, 35] },
        enter: (c) => { c.postTo({ saturation: 0.95 }, 0); c.later(2.3, () => c.walk(hero, mouth.clone().add(V(0.15, 0, 1.0)), 3.4)); },
        cap: 'Three friends turned to stone. One left to break the curse.', capAt: 0.5 },
      { dur: 3.0,
        cam: { pos: [[-2.55, 1.05, -5.2], [-2.6, 1.0, -4.85]], look: [[-2.1, 0.95, -0.8], [-2.4, 1.05, -1.8]], fov: [44, 40] },
        enter: (c) => { hero.group.position.copy(mouth.clone().add(V(0.4, 0, 2.2))); c.walk(hero, mouth.clone().add(V(0.05, 0, -0.25)), 3.0); c.sfx('footstep', { vol: 0.4 }); } },
      { set: 'shaft', dur: 4.2,
        cam: { pos: [[2.5, 2.5, 1.25], [1.45, 2.75, 2.4], [-0.45, 2.45, 2.85]], look: [[0, 0.9, 0], [0, 0.95, 0]], fov: [44, 40], rel: () => S.lift.position.clone().setX(0).setZ(0) },
        enter: (c) => {
          c.sfx('elevator'); c.loop('cave', 0.5);
          c.tween(7.6, (k) => (S.lift.position.y = -0.6 - k * k * 9.5 - k * 2), 'linear');
          c.every(22, () => { const y = S.lift.position.y; c.P.alpha.emit({ pos: [rnd(-1.4, 1.4), y + rnd(3, 5), rnd(-1.4, 1.4)], vel: [0, -rnd(0.3, 1), 0], spread: 0.05, life: [2, 3], size: 1, color: '#c8b8a0', alpha: 0.6 }); });
          c.every(6, () => { const y = S.lift.position.y; c.P.add.emit({ pos: [rnd(-0.6, 0.6), y + 1.95, 0], vel: [rnd(-0.6, 0.6), rnd(0.2, 0.8), rnd(-0.4, 0.4)], spread: 0.3, life: [0.2, 0.5], size: 1, color: ['#ffd27a', '#ffffff'], glow: 3, gravity: 6 }); });
          rider.play('idle', { loop: true });
          c.later(1.6, () => rider.lookAt(V(0, -20, 0)));
        } },
      { dur: 3.6,
        cam: { pos: [[1.5, 3.4, 1.2], [1.2, 2.9, 0.9]], look: [[-0.2, -8, -0.2], [-0.2, -10, -0.2]], fov: [54, 48], roll: [0, 0.4], rel: () => S.lift.position.clone().setX(0).setZ(0) },
        enter: (c) => { c.titleCard(R0.name, R0.sub, { at: 0.7, dur: 2.8 }); c.later(2.6, () => { c.fadeTo = 1; c.fadeRate = 1; }); } },
    ],
  };
};

// ------------------------------------------------------------------ descend_N
SCRIPTS.descend = (c, p) => {
  const N = clamp(p.arg | 0, 1, REGIONS.length - 1), from = REGIONS[N - 1], to = REGIONS[N];
  const S = c.shaftSet('shaft', [{ pal: from.pal, glow: from.pal.glow, lamp: from.pal.glow2, h: 7 }, { pal: to.pal, glow: to.pal.glow, lamp: to.pal.glow2, h: 9 }], { lamp: from.pal.glow2, fog: from.pal.fog, y0: -2.2, radius: 3.6 });
  const rider = c.char(c.who, S.lift, V(0.05, 0.12, 0.05), 0.6, 'idle');
  const L = c.stageSet('land', N === REGIONS.length - 1 ? 'tomb' : 'arena', N);
  const A = L.A;
  const hp = (A.player || V(-1.6, 0, 0.4)).clone();
  const hero = c.char(c.who, 'land', V(-6.2, 0, hp.z + 0.6), Math.PI / 2, 'walk');
  return {
    music: to.music,
    shots: [
      { set: 'shaft', dur: 4.8, dip: 0.8,
        cam: { pos: [[-2.3, 2.1, 1.35], [0.2, 2.6, 2.65], [2.25, 2.9, 1.45]], look: [[0, 0.9, 0], [0, 1.0, 0]], fov: [42, 46], rel: () => S.lift.position.clone().setX(0).setZ(0) },
        enter: (c) => {
          c.sfx('elevator'); c.loop('cave', 0.45);
          c.tween(4.8, (k) => (S.lift.position.y = -2.2 - k * 7.6), 'inOutSine');
          c.colorTo(S.key.color, to.pal.glow2 || to.pal.glow, 4.2);
          c.colorTo(S.hemi.color, to.pal.sky || '#5a5a8a', 4.2);
          c.colorTo(S.fog.color, to.pal.fog, 4.2);
          c.every(18, () => { const y = S.lift.position.y; c.P.alpha.emit({ pos: [rnd(-1.4, 1.4), y + rnd(3, 5), rnd(-1.4, 1.4)], vel: [0, -rnd(0.3, 1), 0], spread: 0.05, life: [2, 3], size: 1, color: '#c8b8a0', alpha: 0.6 }); });
          c.every(9, () => { const y = S.lift.position.y; c.P.add.emit({ pos: [rnd(-3, 3), y + rnd(-1, 3), rnd(-3, 0)], vel: [0, 0.1, 0], spread: 0.05, life: [1, 2], size: [1, 2], color: [to.pal.glow, to.pal.glow2 || '#ffffff'], glow: 2.6, flicker: 0.5 }); });
          c.later(2.4, () => rider.lookAt(V(0, -20, 0)));
        },
        cap: p.note || '', capAt: 1.2 },
      { set: 'land', dur: 6.2, dip: 0.5,
        cam: { pos: [[-5.6, 6.0, 9.4], [-2.6, 3.2, 7.2], [-1.4, 1.45, 5.4]], look: [[1.0, 1.4, -1.6], [0.4, 1.3, -1.0], [-0.8, 1.0, 0]], fov: [46, 38] },
        enter: (c) => {
          c.envTo(0.08, 0.08, 0.1, 0.25, 0); L.lightK = 0.08; L.flameK = 0;
          c.later(0.5, () => { c.envTo(1, 1, 1, 1, 2.6); c.to(L, { lightK: 1, flameK: 1 }, 2.4); c.sfx('fire_whoosh', { vol: 0.6 }); c.flash(0.12, rgb(to.pal.glow)); });
          c.walk(hero, hp, 4.6, { then: 'idle' });
          c.titleCard(to.name, to.sub, { at: 1.6, dur: 3.6, bottom: to.pal.glow, line: to.pal.glow });
          c.later(5.3, () => { c.fadeTo = 1; c.fadeRate = 1.1; });
        } },
    ],
  };
};

// ------------------------------------------------------------------ boss_<id>
SCRIPTS.boss = (c, p) => {
  const id = MONSTERS[p.arg] ? p.arg : 'rustjaw';
  const def = MONSTERS[id], ri = clamp(def.region ?? 0, 0, REGIONS.length - 1), R = REGIONS[ri];
  const lordFight = id === 'cursed_lord';
  const glow = lordFight ? '#c86bff' : R.pal.glow;
  const set = c.stageSet('arena', lordFight ? 'tomb' : 'arena', ri);
  const A = set.A;
  const hp = (A.player || V(-1.6, 0, 0.4)).clone();
  const mon = c.monster(id, 'arena', V(), 0.3);
  const front = mon.bounds ? mon.bounds.min.x : -1;
  const mp = (A.monster || V(1.8, 0, 0.2)).clone();
  mp.x = Math.max(mp.x, hp.x + 2.3 - front);
  mon.group.position.copy(mp);
  c.freeze(mon);
  const hero = c.char(c.who, 'arena', hp, Math.PI / 2 - 0.4, 'idleCombat');
  const mh = (mon.height || 3) + (mon.fly || 0);
  mon.group.updateMatrixWorld(true);
  const mouth = mon.group.localToWorld((mon.mouthPoint || V(-0.3, mh * 0.7, 0)).clone());
  const rim = c.light('arena', 'point', glow, 9, V(mp.x + 1.4, mh * 0.9, mp.z - 2.2), { dist: 9, decay: 1.2, fl: 0.08 });
  const lamp = c.light('arena', 'point', '#ffc070', 2.2, V(hp.x - 0.2, 1.4, hp.z + 0.6), { dist: 4.5, decay: 1.5, fl: 0.2 });
  const mid = (hp.x + mp.x) / 2;
  return {
    music: lordFight ? 'finalboss' : 'boss',
    shots: [
      { set: 'arena', dur: 3.4, dip: 0.7,
        cam: { pos: [[hp.x - 1.35, 1.55, hp.z + 1.9], [hp.x - 0.9, 1.5, hp.z + 1.5]], look: [[mp.x, mh * 0.55, mp.z], [mp.x, mh * 0.6, mp.z]], fov: [38, 34] },
        enter: (c) => {
          c.envTo(0.06, 0.06, 0.08, 0.3, 0); set.lightK = 0.06; set.flameK = 0;
          c.postTo({ exposure: 0.9, saturation: 1.0 }, 0);
          c.sfx('rumble', { vol: 0.8 }); c.shake(0.35);
          c.dustFall(hp.x - 1, mp.x + 2, -1.5, 1.5, 4.6, 30);
          hero.setExpression('surprised');
        },
        at: [[1.6, (c) => { c.sfx('monster_growl', { pitch: 0.6, vol: 0.7 }); c.shake(0.2); }]] },
      { dur: 3.2,
        cam: { pos: [[mid - 0.6, 1.5, Math.max(6.2, mh * 1.8 + 0.8)], [mid - 0.8, 1.9, Math.max(7.4, mh * 2.2 + 1.0)]], look: [[mid + 0.5, mh * 0.55, 0], [mid + 0.4, mh * 0.58, 0]], fov: [40, 42] },
        enter: (c) => {
          [[0.25, 0.4], [0.95, 0.72], [1.6, 1]].forEach(([t, k]) => c.later(t, () => {
            c.envTo(k, k, k, k, 0.12, 'outQuad'); c.to(set, { lightK: k, flameK: k }, 0.12, 'outQuad');
            c.sfx('fire_whoosh', { vol: 0.55, pitch: 0.8 + k * 0.4 }); c.flash(0.12, rgb(glow)); c.shake(0.15);
          }));
          c.later(0.4, () => { c.freeze(mon, false); mon.play('intro'); c.sfx('boss_intro'); });
          c.lightTo(rim, 4, 2);
          hero.setExpression('determined');
        } },
      { dur: 2.6,
        cam: { pos: [[mouth.x - 3.0, Math.max(0.5, mouth.y - 1.3), mouth.z + 2.7], [mouth.x - 2.5, Math.max(0.5, mouth.y - 1.1), mouth.z + 2.3]], look: [[mouth.x + 0.2, mouth.y + 0.2, mouth.z], [mouth.x + 0.2, mouth.y + 0.3, mouth.z]], fov: [42, 36], roll: [0.06, -0.04] },
        at: [[0.25, (c) => {
          mon.play('roar'); c.sfx('boss_roar'); c.punch = 6; c.haptic(70);
          c.burst(mouth, glow, { size: 0.9, r: 6, flash: 0.32, shake: 1.0, n: 70 });
          for (let i = 0; i < 70; i++) c.P.alpha.emit({ pos: [mouth.x, 0.2, mouth.z], vel: [rnd(-4, -1), rnd(0, 0.6), rnd(-2.5, 2.5)], spread: 0.2, life: [0.8, 1.8], size: [2, 3], sizeEnd: 5, color: ['#6a5a50', '#8a7a68'], alpha: 0.5, drag: 1.5 });
          c.postTo({ bloom: 1.4 }, 0.15); c.later(0.5, () => c.postTo({ bloom: 0.95 }, 1));
        }]] },
      { dur: 3.4,
        cam: { pos: [[mid - 0.3, 1.3, Math.max(7.0, mh * 2.3 + 1.0)], [mid + 0.3, 1.45, Math.max(6.6, mh * 2.2 + 0.8)]], look: [[mid + 0.2, Math.max(1.2, mh * 0.56), 0], [mid + 0.2, Math.max(1.2, mh * 0.56), 0]], fov: 40 },
        enter: (c) => { mon.play('idle'); hero.play('idleCombat', { loop: true }); c.titleCard(def.name, def.title, { at: 0.15, dur: 3.0, bottom: glow, line: glow }); },
        at: [[2.7, (c) => { c.fadeTo = 1; c.fadeRate = 1.4; }]] },
    ],
  };
};

// ------------------------------------------------------------------ victory
SCRIPTS.victory = (c) => {
  const who = c.who;
  const T = c.stageSet('tomb', 'tomb', 5);
  const A = T.A;
  const lord = c.monster('cursed_lord', 'tomb', (A.monster || V(2, 0, 0)).clone().setX(2.6), 0.3);
  const hero = c.char(who, 'tomb', (A.player || V(-1.8, 0, 0.6)).clone(), Math.PI / 2 - 0.4, 'idleCombat');
  lord.group.updateWorldMatrix(true, false);
  const chest = lord.group.localToWorld((lord.hitPoint || V(0, 3, 0)).clone());
  const S = c.shaftSet('shaft', layerBands(0, 5, 5), { lamp: '#ffd890', fog: '#0c0812', y0: -6 });
  S.lift.visible = false;
  const rush = c.add(glowSprite('#ffe08a', 5, 2.4, 1.3), S.group);
  const rushL = c.light(S.group, 'point', '#ffd27a', 9, V(0, -32, 0), { dist: 11, decay: 1.2 });
  const rushBeam = c.add(beam(14, 0.3, 1.6, '#ffd27a', 0.7, 0.8), S.group);
  const camp = c.stageSet('camp', 'campfire', 0);
  const CA = camp.A, seats = CA.seats || [];
  const friends = [];
  CHARACTER_ORDER.forEach((id, i) => {
    if (id === who || !seats[i]) return;
    const s = seats[i];
    const ch = c.char(id, 'camp', V(s.pos.x, 0, s.pos.z), s.rotY, 'sit');
    ch.setSeated(true, s.height);
    c.settle(ch);
    const u = c.stone(ch, '#ffd27a', 5); u.uSeam.value = 0;
    c.freeze(ch);
    friends.push(ch);
  });
  const fire = CA.fire || V();
  const ws = seats[Math.max(0, CHARACTER_ORDER.indexOf(who))] || { pos: V(1.55, 0.3, 0.95) };
  const stand = V(ws.pos.x * 1.3, 0, ws.pos.z * 1.3 + 0.45);
  const back = c.char(who, 'camp', stand, faceTo(stand, fire), 'idle');
  const dawn = c.light('camp', 'dir', '#ffcf9a', 0, V(-4, 6, 3), { target: V(0, 0, 0) });
  const shaftB = c.add(beam(9, 0.5, 2.4, '#ffe0b0', 0, 1.2), 'camp');
  aimBeam(shaftB, V(-2.4, 6.2, -2.6), V(-0.4, 0, 0.4));
  const cheers = ['cheer', 'laugh', 'wave'];
  return {
    music: 'ending',
    shots: [
      { set: 'tomb', dur: 5.4, dip: 1.0,
        cam: { pos: [[-3.5, 0.72, 2.7], [-3.0, 0.82, 2.25]], look: [[2.4, 2.6, 0], [2.4, 3.0, 0]], fov: [38, 43] },
        enter: (c) => { lord.play('stun'); hero.play('victory', { loop: true }); c.envTo(0.7, 0.6, 0.85, 1, 0); c.curseSmoke(V(2.6, 0.1, 0), 1.0, 16); },
        at: [
          [0.9, (c) => {
            c.sfx('crack'); lord.flash('#ffe08a', 0.25); c.shake(0.2);
            c.stone(lord, '#ffd27a', -0.2); c.stoneTo(lord, 5.4, 1.8, 'inQuad');
            c.every(40, () => { const lp = lord.group.position, y = lord._stone.uStone.value; c.P.add.emit({ pos: [lp.x + rnd(-1.1, 1.1), y, lp.z + rnd(-1.1, 1.1)], vel: [0, 0.6, 0], spread: 0.4, life: [0.3, 0.9], size: [1, 2], color: ['#ffe08a', '#fff4c8'], glow: 3, flicker: 0.5 }); });
          }],
          [1.9, (c) => { c.sfx('crack', { pitch: 1.2 }); c.shake(0.25); c.freeze(lord); }],
          [2.75, (c) => {
            const lp = lord.group.position;
            lord.group.visible = false;
            for (let i = 0; i < 12; i++) c.debris.spawn({ pos: [lp.x + rnd(-1, 1), rnd(0.4, 4.6), lp.z + rnd(-0.8, 0.8)], count: 22, colors: ['#8a8696', '#6a6676', '#a8a4b4', '#4a4656'], speed: 3, up: 3, spread: 0.4, gravity: 9, floor: 0.03, life: 2.8, scale: [0.8, 2.0] });
            for (let i = 0; i < 70; i++) c.P.alpha.emit({ pos: [lp.x + rnd(-1.5, 1.5), rnd(0.1, 1.5), lp.z + rnd(-1, 1)], vel: [rnd(-1.5, 1.5), rnd(0, 0.8), rnd(-1.5, 1.5)], spread: 0.3, life: [1.5, 3], size: [2, 4], sizeEnd: 6, color: ['#8a8090', '#a8a0b0'], alpha: 0.5, drag: 1.4 });
            c.sfx('shatter'); c.sfx('rock_break'); c.sfx('victory_sting');
            c.burst(chest, '#ffe08a', { size: 1.5, r: 9, flash: 0.85, shake: 0.9, n: 180, col2: '#fff4c8' });
            for (let i = 0; i < 90; i++) c.P.alpha.emit({ pos: [chest.x + rnd(-1, 1), chest.y + rnd(-1.5, 1), chest.z + rnd(-1, 1)], vel: [rnd(-0.5, 0.5), rnd(1.5, 4), rnd(-0.5, 0.5)], spread: 0.3, life: [1.5, 3], size: [2, 4], sizeEnd: 6, color: ['#3a1a4a', '#5a2a6a'], alpha: 0.55, swirl: 1.2 });
            c.envTo(1.25, 1.1, 0.9, 1.4, 0.3, 'outQuad'); c.later(0.5, () => c.envTo(1, 0.95, 0.9, 1.1, 2));
            c.postTo({ saturation: 1.25, gain: [1.12, 1.02, 0.88] }, 2);
          }],
        ],
        cap: 'The crown cracked, and the curse let go.', capAt: 0.6 },
      { set: 'shaft', dur: 3.8,
        cam: { pos: [[0.5, -29.5, 0.7], [0.3, -27.5, 0.5]], look: [[0, 0, 0], [0, 0, 0]], fov: [56, 50], roll: [0, -0.5] },
        enter: (c) => {
          c.tween(3.0, (k) => { const y = -32 + k * 34; rush.position.set(0, y, 0); rushL.position.set(0, y, 0); aimBeam(rushBeam, V(0, y + 0.5, 0), V(0, y - 14, 0)); }, 'inQuad');
          c.every(60, () => { const y = rush.position.y; c.P.add.emit({ pos: [rnd(-0.8, 0.8), y - rnd(0, 2), rnd(-0.8, 0.8)], vel: [rnd(-0.4, 0.4), rnd(4, 9), rnd(-0.4, 0.4)], spread: 0.2, life: [0.4, 1.0], size: [1, 2], color: ['#ffe08a', '#fff4c8', '#ffffff'], glow: 3 }); });
          c.sfx('wind_whoosh', { pitch: 1.3 });
        },
        cap: 'Far above, the light found its way home.', capAt: 0.4 },
      { set: 'camp', dur: 7.6, dip: 0.6,
        cam: { pos: [[-1.0, 1.5, 4.6], [-0.6, 1.25, 3.5]], look: [[0.1, 0.72, -0.2], [0.1, 0.78, -0.3]], fov: [36, 34] },
        enter: (c) => {
          c.postTo({ saturation: 0.55, exposure: 0.88, gain: [1.0, 0.98, 0.96] }, 0);
          c.postTo({ saturation: 1.22, exposure: 1.12, gain: [1.12, 1.02, 0.86], bloom: 1.15 }, 6.5);
          c.lightTo(dawn, 1.6, 6); c.tween(6, (k) => (shaftB.material.uniforms.uOp.value = k * 0.45));
          c.colorTo(camp.fog.color, '#5a3a3a', 6);
          friends.forEach((f, i) => {
            c.later(0.6 + i * 0.2, () => { c.tween(0.8, (k) => (f._stone.uSeam.value = k * 1.6)); c.sfx('crack', { pitch: 1 + i * 0.15, vol: 0.6 }); });
            c.later(1.8 + i * 0.6, () => {
              f._stone.uStone.value = 1.9;
              c.stoneTo(f, -0.25, 1.5, 'inQuad');
              c.sfx('rock_break', { vol: 0.7, pitch: 1 + i * 0.1 });
              const h = c.every(40, () => c.chips(f, undefined, true));
              c.later(1.5, () => { h.fn = () => false; });
              c.later(0.9, () => { c.freeze(f, false); f.setSeated(false); f.play(cheers[i % 3], { loop: true }); f.setExpression('happy'); });
            });
          });
          c.later(4.6, () => { back.play('cheer', { loop: true }); back.setExpression('happy'); c.sfx('sparkle'); });
          c.every(5, () => c.P.add.emit({ pos: [rnd(-4, 4), rnd(0.4, 2.4), rnd(-3, 2)], vel: [rnd(-0.1, 0.1), 0.05, 0], spread: 0.05, life: [2, 4], size: 1, color: ['#d8ff8a', '#ffe08a'], glow: 2.5, flicker: 0.6, fadeIn: 0.6 }));
        } },
      { dur: 6.4,
        cam: { pos: [[0.1, 1.5, 3.9], [0.55, 2.5, 5.5], [0.9, 3.2, 6.9]], look: [[0, 0.85, 0], [0, 0.95, -0.5]], fov: [37, 40] },
        enter: (c) => {
          c.every(14, () => c.P.add.emit({ pos: [rnd(-3, 3), rnd(2.6, 4), rnd(-2, 2)], vel: [rnd(-0.2, 0.2), -0.4, 0], spread: 0.3, life: [1.5, 3], size: [1, 2], color: ['#ffe08a', '#ff8ab0', '#7fe3ff', '#fff4c8'], glow: 2.4, flicker: 0.4 }), true);
        },
        cap: 'Every weapon you forged is gone. The friends you forged them for are not.', capAt: 0.8, capDur: 6.5 },
    ],
  };
};

// ------------------------------------------------------------------ fallen (game over)
SCRIPTS.fallen = (c, p) => {
  const ri = clamp(p.region ?? (c.game.run ? c.game.run.region : 0), 0, REGIONS.length - 1);
  const L = c.stageSet('fall', ri === REGIONS.length - 1 ? 'tomb' : 'arena', ri);
  const a = (L.A.player || V(-1.6, 0, 0.4)).clone();
  const hero = c.char(c.who, 'fall', a, 0.5, 'defeat');
  hero.setExpression('hurt');
  const under = c.light('fall', 'point', '#b050ff', 0, V(a.x, 0.3, a.z + 0.3), { dist: 5, decay: 1.3, fl: 0.2, sp: 4 });
  return {
    music: 'defeat',
    shots: [
      { set: 'fall', dur: 4.2, dip: 0.6,
        cam: { pos: [[a.x + 1.1, 0.55, a.z + 1.9], [a.x + 1.5, 0.85, a.z + 2.5]], look: [[a.x, 0.55, a.z], [a.x, 0.5, a.z]], fov: [34, 37] },
        enter: (c) => {
          c.envTo(0.55, 0.48, 0.66, 0.7, 1.5); L.lightK = 0.6;
          c.sfx('defeat_sting');
          c.lightTo(under, 4, 1.5);
          c.curseSmoke(V(a.x, 0.05, a.z), 0.5, 26);
          c.stone(hero, '#c86bff', -0.2);
          c.later(0.9, () => { c.stoneTo(hero, 1.7, 3.2, 'inOutQuad'); c.sfx('rock_crack', { vol: 0.6 }); });
          c.later(1.6, () => c.freeze(hero));
          c.every(18, () => c.chips(hero));
          c.postTo({ saturation: 0.5, exposure: 0.85, vignette: 0.6 }, 3.5);
        },
        cap: 'The curse takes hold…', capAt: 0.7 },
      { dur: 6.5,
        cam: { pos: [[a.x + 1.5, 0.85, a.z + 2.5], [a.x + 2.6, 2.6, a.z + 5.2], [a.x + 3.0, 3.8, a.z + 6.8]], look: [[a.x, 0.5, a.z], [a.x, 0.35, a.z]], fov: [37, 44] },
        enter: (c) => { c.postTo({ saturation: 0.32, exposure: 0.72, vignette: 0.75 }, 5); c.envTo(0.32, 0.28, 0.42, 0.5, 5); c.curseSmoke(V(a.x, 0.05, a.z), 0.7, 14); } },
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
