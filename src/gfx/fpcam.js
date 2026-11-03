// First-person camera rig for the delve (and every first-person encounter): smooth walks along
// curves with a gentle head bob and footstep callbacks, eased turns and look-ats, trauma shake,
// directional punches, drag-to-glance that springs back, a warm hand-torch light, and the chibi
// first-person arms parented to the camera. Yaw 0 looks down -Z (rotation order YXZ).
//
//   const fp = new FPCam({ fov: 62, charId: 'bran' }); fp.attach(scene);
//   fp.place(pos, yaw); await fp.moveAlong(curve, 6, { look: 'tangent' }); fp.lookTo(v, 0.6);
//   per frame: fp.dragLook(game.input); fp.update(dt);
import * as THREE from 'three';
import { noise2 } from '../core/math.js';
import { CameraRig } from './camera.js';
import { ParticleSystem } from './particles.js';
import * as Arms from '../models/fp_arms.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const dampAngle = (a, b, lambda, dt) => a + wrapPi(b - a) * (1 - Math.exp(-lambda * dt));
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/** Trapezoid velocity: eases in over the first `a`, cruises, eases out over the last `a`. */
function walkEase(u, a = 0.14) {
  u = clamp(u, 0, 1);
  const v = 1 / (1 - a);
  if (u < a) return (v * u * u) / (2 * a);
  if (u > 1 - a) return 1 - (v * (1 - u) * (1 - u)) / (2 * a);
  return v * (u - a / 2);
}
const EASES = {
  walk: (u) => walkEase(u),
  run: (u) => walkEase(u, 0.06),
  linear: (u) => clamp(u, 0, 1),
  inOutSine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1)),
  outCubic: (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3),
  inQuad: (u) => clamp(u, 0, 1) ** 2,
};

/** Yaw/pitch that look from `from` toward `to` (yaw 0 = -Z). */
export function yawPitchTo(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

export class FPCam {
  /** opts: { fov, near, far, charId (builds FPArms), light: true, lightColor, lightIntensity } */
  constructor(opts = {}) {
    this.camera = new THREE.PerspectiveCamera(opts.fov || 62, 16 / 9, opts.near || 0.04, opts.far || 70);
    this.camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(0, 0.95, 0);
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.tYaw = 0; this.tPitch = 0; this.tRoll = 0;
    this.turnLambda = 6;
    this.fov = this.camera.fov; this.tFov = this.fov;
    this.path = null;
    this.hurry = 1; this.tHurry = 1;
    this.lookAt = null;          // {v, w, tw} — a point the gaze is drawn to while walking
    this.bobAmt = 1;
    this.phase = 0;              // stride phase (π per step)
    this.speed = 0;              // m/s, smoothed (drives bob + arms)
    this.onStep = null;          // (side) => void
    this.breathing = true;
    this.trauma = 0;
    this.shakeScale = CameraRig.shakeSetting ?? 1;
    this.kick = new THREE.Vector3(); this.kickV = new THREE.Vector3();
    this.glance = { yaw: 0, pitch: 0, x: 0, y: 0, on: false };
    this.time = 0;
    this._last = new THREE.Vector3();
    this.arms = null;
    this.pet = null;
    if (opts.charId) {
      try { this.setArms(Arms.buildFPArms(opts.charId)); } catch (e) { /* arms are optional */ }
    }
    if (opts.light !== false) {
      // the hand torch: warm, close, flickering — it is what makes a first-person cave readable
      // above and a little behind the eyes: lights the cave ahead without blowing out the hands
      this.torch = new THREE.PointLight(opts.lightColor ?? 0xffb46a, opts.lightIntensity ?? 2.2, opts.lightDistance ?? 8, 1.25);
      this.torch.position.set(-0.12, 0.42, 0.32);
      this.torchBase = this.torch.intensity;
      this.camera.add(this.torch);
    }
  }

  /** Add the camera (and with it the arms + torch) to a scene. */
  attach(scene) { if (this.camera.parent !== scene) scene.add(this.camera); return this; }
  setArms(arms) {
    if (this.arms && this.arms.group) this.camera.remove(this.arms.group);
    this.arms = arms;
    if (arms && arms.group) this.camera.add(arms.group);
    return arms;
  }
  /** Cut to a place and facing. */
  place(pos, yaw = this.yaw, pitch = 0) {
    this.pos.copy(pos); this._last.copy(pos);
    this.yaw = this.tYaw = yaw; this.pitch = this.tPitch = pitch;
    this.path = null;
    this.apply();
    return this;
  }
  /** Look straight at a point at once. */
  face(v) { const a = yawPitchTo(this.pos, v); this.yaw = this.tYaw = a.yaw; this.pitch = this.tPitch = a.pitch; this.apply(); return this; }

  /**
   * Walk along a curve (THREE.Curve, world space, at eye height) for `dur` seconds.
   * o: { ease: 'walk'|'run'|'linear'|…, look: 'tangent' | Vector3 | null (keep turning freely),
   *      lookWeight (0..1, how much a Vector3 look overrides the tangent), bob, onArrive, from, to }
   * Returns a promise that resolves on arrival.
   */
  moveAlong(curve, dur, o = {}) {
    let resolve;
    const done = new Promise((r) => (resolve = r));
    if (this.path && this.path.resolve) this.path.resolve(false);
    this.path = {
      curve, dur: Math.max(0.01, dur), t: 0, ease: EASES[o.ease || 'walk'] || EASES.walk, look: o.look === undefined ? 'tangent' : o.look,
      lookWeight: o.lookWeight ?? 1, from: o.from ?? 0, to: o.to ?? 1, onArrive: o.onArrive, resolve, lookAhead: o.lookAhead ?? 0.05,
      pitchLook: o.pitchLook ?? false,
    };
    if (o.bob !== undefined) this.bobAmt = o.bob;
    return done;
  }
  /** A short straight walk to `to` (eye height kept), facing the way you go unless `look` is set. */
  walkTo(to, dur, o = {}) {
    const a = this.pos.clone(), b = to.clone();
    const mid = a.clone().lerp(b, 0.5);
    return this.moveAlong(new THREE.CatmullRomCurve3([a, mid, b]), dur, o);
  }
  /** Ease the gaze toward a point over `dur` (while standing or walking). */
  lookTo(v, dur = 0.6) {
    const a = yawPitchTo(this.pos, v);
    this.tYaw = this.yaw + wrapPi(a.yaw - this.yaw); this.tPitch = clamp(a.pitch, -1.1, 1.1);
    this.turnLambda = 4.6 / Math.max(0.08, dur);
    if (this.path) this.lookAt = { v: v.clone(), w: 0, tw: 1 };
    return this;
  }
  /** While walking: draw the gaze toward a point (weight 0..1), e.g. a glint in a side passage. */
  glanceAt(v, w = 0.6) { this.lookAt = v ? { v: v.clone(), w: this.lookAt ? this.lookAt.w : 0, tw: w } : null; return this; }
  turnTo(yaw, dur = 0.6, pitch = this.tPitch) { this.tYaw = this.yaw + wrapPi(yaw - this.yaw); this.tPitch = pitch; this.turnLambda = 4.6 / Math.max(0.08, dur); return this; }
  setFov(f, lambda = 4) { this.tFov = f; this.fovLambda = lambda; return this; }
  shake(a = 0.4) { this.trauma = Math.min(1.3, this.trauma + a); return this; }
  /** Kick the view (camera-local direction, e.g. [0,0,1] = knocked back). */
  punch(dir = [0, 0, 1], amount = 0.08) { this.kickV.x += dir[0] * amount * 30; this.kickV.y += dir[1] * amount * 30; this.kickV.z += dir[2] * amount * 30; return this; }
  bob(k = 1) { this.bobAmt = k; return this; }
  breathe(on = true) { this.breathing = on; return this; }
  /** Speed multiplier for the current walk (smoothed): 1 normal, 3 hurrying. */
  setHurry(k) { this.tHurry = k; return this; }
  get walking() { return !!this.path; }
  /** 0..1 along the current walk's curve (1 when standing). */
  get progress() { return this.path ? this.path.k ?? 0 : 1; }
  /** The curve being walked (null when standing). */
  get curve() { return this.path ? this.path.curve : null; }

  /** Drag (mouse/finger) to glance around a little; it springs back on release. Call before update. */
  dragLook(input, opts = {}) {
    const g = this.glance;
    const maxY = opts.maxYaw ?? 0.42, maxP = opts.maxPitch ?? 0.26;
    if (input.down && !input.consumed && input.x > -500) {
      if (!g.on) { g.on = true; g.x = input.x; g.y = input.y; g.y0 = g.yaw; g.p0 = g.pitch; }
      const k = opts.k ?? 0.0032;
      g.yaw = clamp(g.y0 - (input.x - g.x) * k, -maxY, maxY);
      g.pitch = clamp(g.p0 - (input.y - g.y) * k, -maxP, maxP);
    } else {
      g.on = false;
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.hurry = damp(this.hurry, this.tHurry, 5, dt);
    // ---- path following
    const p = this.path;
    if (p) {
      p.t += dt * this.hurry;
      const u = Math.min(1, p.t / p.dur);
      const k = p.from + (p.to - p.from) * p.ease(u);
      p.k = k;
      p.curve.getPointAt(clamp(k, 0, 1), this.pos);
      if (p.look === 'tangent' || (p.look && p.look.isVector3)) {
        const ahead = p.curve.getPointAt(clamp(k + p.lookAhead, 0, 1));
        let dir = ahead.sub(this.pos);
        if (dir.lengthSq() < 1e-6) dir = p.curve.getTangentAt(clamp(k, 0, 1));
        let yaw = Math.atan2(-dir.x, -dir.z);
        let pitch = p.pitchLook ? Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.5 : 0;
        if (p.look.isVector3) {
          const a = yawPitchTo(this.pos, p.look);
          yaw = yaw + wrapPi(a.yaw - yaw) * p.lookWeight; pitch = pitch + (a.pitch - pitch) * p.lookWeight;
        }
        if (this.lookAt) {
          const L = this.lookAt;
          L.w = damp(L.w, L.tw, 3, dt);
          const a = yawPitchTo(this.pos, L.v);
          yaw = yaw + wrapPi(a.yaw - yaw) * L.w; pitch = pitch + (a.pitch - pitch) * L.w;
        }
        this.tYaw = this.yaw + wrapPi(yaw - this.yaw); this.tPitch = pitch;
        this.turnLambda = 5;
      }
      if (u >= 1) {
        this.path = null;
        this.lookAt = null;
        p.onArrive && p.onArrive();
        p.resolve(true);
      }
    }
    // ---- speed + stride from the distance actually covered
    const moved = this.pos.distanceTo(this._last);
    this._last.copy(this.pos);
    const inst = dt > 0 ? moved / dt : 0;
    this.speed = damp(this.speed, Math.min(inst, 8), 10, dt);
    const stride = this.speed > 2.6 ? 0.78 : 0.56; // metres per step
    const prev = this.phase;
    this.phase += (moved / stride) * Math.PI;
    if (this.onStep && Math.floor(this.phase / Math.PI) !== Math.floor(prev / Math.PI)) this.onStep(Math.floor(this.phase / Math.PI) % 2 ? 'r' : 'l');
    // ---- turning
    this.yaw = dampAngle(this.yaw, this.tYaw, this.turnLambda, dt);
    this.pitch = damp(this.pitch, this.tPitch, this.turnLambda, dt);
    this.roll = damp(this.roll, this.tRoll, 4, dt);
    if (this.fov !== this.tFov) { this.fov = damp(this.fov, this.tFov, this.fovLambda || 4, dt); if (Math.abs(this.fov - this.tFov) < 0.01) this.fov = this.tFov; }
    // ---- glance spring-back
    const g = this.glance;
    if (!g.on) { g.yaw = damp(g.yaw, 0, 5, dt); g.pitch = damp(g.pitch, 0, 5, dt); }
    // ---- kicks (critically-damped spring back to zero)
    const kv = this.kickV, kk = this.kick;
    kv.x += (-kk.x * 160 - kv.x * 18) * dt; kv.y += (-kk.y * 160 - kv.y * 18) * dt; kv.z += (-kk.z * 160 - kv.z * 18) * dt;
    kk.x += kv.x * dt; kk.y += kv.y * dt; kk.z += kv.z * dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    // ---- torch flicker
    if (this.torch) {
      // a held torch brings its own light; the rig's hand light then only fills in softly
      const own = this.arms && this.arms.held === 'torch' && this.arms.torchLight;
      this.torchK = damp(this.torchK ?? 1, own ? 0.3 : 1, 3, dt);
      this.torch.intensity = this.torchBase * this.torchK * (0.86 + noise2(t * 7.3, 3) * 0.2 + noise2(t * 17, 9) * 0.06);
    }
    this.apply();
    if (this.arms && this.arms.update) this.arms.update(dt, { speed: this.speed, hurry: this.hurry });
  }

  apply() {
    const cam = this.camera, t = this.time;
    const mv = clamp(this.speed / 1.6, 0, 1.6) * this.bobAmt;
    // head bob: a soft vertical dip per step, a slower side sway and a whisper of roll
    const bobY = -Math.abs(Math.sin(this.phase)) * 0.028 * mv + 0.014 * mv;
    const swayX = Math.sin(this.phase * 0.5) * 0.012 * mv;
    const rollB = Math.sin(this.phase * 0.5) * 0.007 * mv;
    const br = this.breathing ? Math.sin(t * 1.25) * 0.0045 + noise2(t * 0.3, 11) * 0.004 : 0;
    const s = this.trauma * this.trauma * this.shakeScale;
    const sx = (noise2(t * 24, 1) - 0.5) * 0.16 * s, sy = (noise2(t * 24, 2) - 0.5) * 0.16 * s, sr = (noise2(t * 19, 3) - 0.5) * 0.09 * s;
    const yaw = this.yaw + this.glance.yaw + (noise2(t * 0.25, 5) - 0.5) * 0.01 + sx * 0.6;
    const pitch = this.pitch + this.glance.pitch + br + sy * 0.6;
    cam.rotation.set(pitch, yaw, this.roll + rollB + sr, 'YXZ');
    // sway + kick are camera-local offsets
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    cam.position.copy(this.pos)
      .addScaledVector(right, swayX + this.kick.x + sx * 0.05)
      .addScaledVector(fwd, -this.kick.z)
      .add({ x: 0, y: bobY + this.kick.y + sy * 0.05, z: 0 });
    if (Math.abs(cam.fov - this.fov) > 1e-3) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  /** Unit vector the camera looks along (ignoring shake). */
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  /** World position → virtual screen pixels. */
  project(v, vw = 960, vh = 540) {
    const p = (v.isVector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2])).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * vw, y: (-p.y * 0.5 + 0.5) * vh, behind: p.z > 1 || p.z < -1 };
  }
}

/**
 * A first-person world: one scene holding the given stages (each already placed), the camera rig,
 * particle pairs for props and ambience. Returns { scene, camera, post, fp, P, sparks, dust, stages, update(dt) }.
 */
export function makeFPWorld(stages, opts = {}) {
  const scene = new THREE.Scene();
  const list = (Array.isArray(stages) ? stages : [stages]).filter(Boolean);
  for (const st of list) {
    if (st.attach) st.attach(scene); else if (st.group) scene.add(st.group);
  }
  if (!scene.background) scene.background = new THREE.Color(opts.background || '#07060b');
  if (!scene.fog) scene.fog = new THREE.FogExp2(new THREE.Color(opts.fog || '#07060b'), opts.fogDensity ?? 0.07);
  const fp = new FPCam({ fov: opts.fov || 62, charId: opts.charId, light: opts.light });
  fp.attach(scene);
  for (const st of list) st.setCamera && st.setCamera(fp.camera);
  const sparks = new ParticleSystem(1200, { additive: true });
  const dust = new ParticleSystem(900);
  scene.add(sparks.object, dust.object);
  const P = { add: sparks, alpha: dust };
  const world = {
    scene, camera: fp.camera, fp, P, sparks, dust, stages: list, time: 0,
    post: { bloom: 0.9, threshold: 0.74, vignette: 0.42, saturation: 1.12, contrast: 1.04, outline: 0.55, edge: 0.3, ...(opts.post || {}) },
    update(dt) {
      this.time += dt;
      // first-person pieces stream around the camera they were given (setCamera) inside update()
      for (const st of this.stages) st.update && st.update(dt, this.time);
      fp.update(dt);
      sparks.update(dt); dust.update(dt);
    },
  };
  return world;
}

/** Local anchor of a placed stage → world space (anchors are authored in the stage's own frame). */
export function stageToWorld(stage, v) {
  if (!v) return null;
  stage.group.updateMatrixWorld(true);
  return stage.group.localToWorld(v.clone());
}
