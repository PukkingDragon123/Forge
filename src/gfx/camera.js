// Cinematic camera rig: smooth damped follow, timed moves, trauma shake, handheld sway, fov punch.
import * as THREE from 'three';
import { damp, ease as E, noise2 } from '../core/math.js';

export class CameraRig {
  constructor(fov = 40, near = 0.1, far = 200) {
    this.camera = new THREE.PerspectiveCamera(fov, 16 / 9, near, far);
    this.pos = new THREE.Vector3(0, 2, 6);
    this.look = new THREE.Vector3(0, 1, 0);
    this.fov = fov;
    this.roll = 0;
    this.tPos = this.pos.clone(); this.tLook = this.look.clone(); this.tFov = fov; this.tRoll = 0;
    this.lambda = 3.5;
    this.trauma = 0;
    this.shakeScale = 1;
    this.sway = 0.02;
    this.punch = 0;
    this.time = 0;
    this.move = null;
    this._v = new THREE.Vector3();
  }
  /** Instant cut. */
  cut(pos, look, fov) {
    this.pos.set(...pos); this.tPos.set(...pos);
    this.look.set(...look); this.tLook.set(...look);
    if (fov) { this.fov = this.tFov = fov; }
    this.move = null;
    this.apply();
  }
  /** Damped follow target. */
  aim(pos, look, fov, lambda) {
    if (pos) this.tPos.set(...pos);
    if (look) this.tLook.set(...look);
    if (fov) this.tFov = fov;
    if (lambda) this.lambda = lambda;
    this.move = null;
  }
  /** Timed eased move; returns a promise. */
  moveTo(pos, look, fov, dur = 1, easing = 'inOutCubic') {
    let resolve;
    const done = new Promise((r) => (resolve = r));
    this.move = {
      p0: this.pos.clone(), l0: this.look.clone(), f0: this.fov,
      p1: new THREE.Vector3(...(pos || this.pos.toArray())), l1: new THREE.Vector3(...(look || this.look.toArray())), f1: fov || this.fov,
      t: 0, dur, ease: typeof easing === 'string' ? E[easing] : easing, resolve,
    };
    return { done };
  }
  shake(amount = 0.4) { this.trauma = Math.min(1.2, this.trauma + amount); }
  fovPunch(amount = -4) { this.punch += amount; }
  update(dt) {
    this.time += dt;
    if (this.move) {
      const m = this.move;
      m.t += dt;
      const k = m.ease(Math.min(1, m.t / m.dur));
      this.pos.lerpVectors(m.p0, m.p1, k);
      this.look.lerpVectors(m.l0, m.l1, k);
      this.fov = m.f0 + (m.f1 - m.f0) * k;
      this.tPos.copy(this.pos); this.tLook.copy(this.look); this.tFov = this.fov;
      if (m.t >= m.dur) { this.move = null; m.resolve(); }
    } else {
      const a = 1 - Math.exp(-this.lambda * dt);
      this.pos.lerp(this.tPos, a);
      this.look.lerp(this.tLook, a);
      this.fov = damp(this.fov, this.tFov, this.lambda, dt);
    }
    this.roll = damp(this.roll, this.tRoll, 4, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.punch = damp(this.punch, 0, 8, dt);
    this.apply();
  }
  apply() {
    const cam = this.camera;
    const s = this.trauma * this.trauma * this.shakeScale;
    const t = this.time;
    const sx = (noise2(t * 22, 1) - 0.5) * 0.35 * s + (noise2(t * 0.4, 7) - 0.5) * this.sway;
    const sy = (noise2(t * 22, 2) - 0.5) * 0.35 * s + (noise2(t * 0.35, 9) - 0.5) * this.sway;
    const sr = (noise2(t * 18, 3) - 0.5) * 0.08 * s;
    cam.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this._v.set(this.look.x + sx * 0.5, this.look.y + sy * 0.5, this.look.z);
    cam.up.set(Math.sin(this.roll + sr), Math.cos(this.roll + sr), 0);
    cam.lookAt(this._v);
    const f = this.fov + this.punch;
    if (Math.abs(cam.fov - f) > 1e-3) { cam.fov = f; cam.updateProjectionMatrix(); }
  }
  /** World position → virtual screen pixel coords. */
  project(v, vw, vh) {
    const p = (v.isVector3 ? v.clone() : new THREE.Vector3(...v)).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * vw, y: (-p.y * 0.5 + 0.5) * vh, behind: p.z > 1 };
  }
}

/** A point light that flickers like fire. */
export class FlickerLight extends THREE.PointLight {
  constructor(color = 0xff9a4a, intensity = 6, distance = 8, opts = {}) {
    super(color, intensity, distance, opts.decay ?? 1.6);
    this.base = intensity;
    this.amount = opts.amount ?? 0.25;
    this.speed = opts.speed ?? 9;
    this.seed = Math.random() * 100;
    this.home = null;
    this.jitter = opts.jitter ?? 0.03;
  }
  tick(t) {
    if (!this.home) this.home = this.position.clone();
    const n = noise2(t * this.speed, this.seed) * 0.7 + noise2(t * this.speed * 2.7, this.seed + 3) * 0.3;
    this.intensity = this.base * (1 - this.amount + n * this.amount * 2);
    this.position.set(
      this.home.x + (noise2(t * 3, this.seed + 5) - 0.5) * this.jitter,
      this.home.y + (noise2(t * 3, this.seed + 6) - 0.5) * this.jitter,
      this.home.z + (noise2(t * 3, this.seed + 7) - 0.5) * this.jitter,
    );
  }
}
