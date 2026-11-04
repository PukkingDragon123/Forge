// HadesCam: an angled top-down follow camera. The camera sits south of (toward +z from) its focus,
// pitched ~52° down, with a long lens (fov ~32°) so the room reads like a diorama. It leads the
// player's movement and aim a little, clamps to the room so the walls frame the shot, shakes with
// trauma, punches along a direction, and can glide into cinematic close-ups (zoomTo) and back.
import * as THREE from 'three';
import { noise2 } from '../core/math.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class HadesCam {
  static shakeSetting = 1;
  constructor(opts = {}) {
    this.fov = opts.fov ?? 32;
    this.pitch = opts.pitch ?? (52 * Math.PI) / 180;
    this.dist = opts.dist ?? 10.5;
    this.camera = new THREE.PerspectiveCamera(this.fov, 16 / 9, 0.3, 120);
    this.focus = new THREE.Vector3();      // smoothed look point (ground)
    this.goal = new THREE.Vector3();       // where the follow wants to look
    this.target = null;                    // entity with x, z (and optional vx/vz, aimX/aimZ)
    this.bounds = null;                    // { x0, x1, z0, z1 } room floor rectangle
    this.lead = opts.lead ?? 0.22;         // seconds of velocity lead
    this.aimLead = opts.aimLead ?? 0.9;    // metres toward the aim direction
    this.lambda = opts.lambda ?? 7;
    this.trauma = 0;
    this.kick = new THREE.Vector3();       // punch offset (decays)
    this.time = 0;
    this.cine = null;                      // { from, to, t, dur } cinematic override
    this.cineHold = null;                  // { focus, dist, fov, pitch }
    this.cur = { dist: this.dist, fov: this.fov, pitch: this.pitch };
    this.roll = 0;
    this._v = new THREE.Vector3();
    this.apply();
  }
  follow(entity, snap = false) {
    this.target = entity;
    if (snap && entity) { this.goal.set(entity.x, 0, entity.z); this.clampGoal(); this.focus.copy(this.goal); this.apply(); }
  }
  setBounds(b) { this.bounds = b ? { ...b } : null; }
  /** Put the camera somewhere immediately. */
  snap(x, z) { this.goal.set(x, 0, z); this.clampGoal(); this.focus.copy(this.goal); this.apply(); }
  shake(a = 0.3) { this.trauma = Math.min(1, this.trauma + a * (HadesCam.shakeSetting ?? 1)); }
  /** Knock the camera along a ground direction (x, z), metres. */
  punch(dir, a = 0.15) { this.kick.x += (dir.x || 0) * a; this.kick.z += (dir.z || 0) * a; }

  /**
   * Glide into a close-up: target is {x, y?, z} or an entity. o: { fov, dist, pitch, dur, height }.
   * Returns a promise that resolves when the move ends; the camera then holds until release().
   */
  zoomTo(target, o = {}) {
    const tx = target.x ?? 0, tz = target.z ?? 0, ty = o.height ?? target.y ?? 0.6;
    const to = { focus: new THREE.Vector3(tx, ty, tz), dist: o.dist ?? 5.5, fov: o.fov ?? 28, pitch: o.pitch ?? (38 * Math.PI) / 180 };
    const from = this.cineHold ? { ...this.cineHold, focus: this.cineHold.focus.clone() } : { focus: this.focus.clone(), dist: this.cur.dist, fov: this.cur.fov, pitch: this.cur.pitch };
    return new Promise((resolve) => { this.cine = { from, to, t: 0, dur: o.dur ?? 0.7, resolve }; });
  }
  /** Glide back to the gameplay follow. */
  release(dur = 0.6) {
    if (!this.cineHold && !this.cine) return Promise.resolve();
    const from = this.cineHold ? { ...this.cineHold, focus: this.cineHold.focus.clone() } : { ...this.cine.to, focus: this.cine.to.focus.clone() };
    return new Promise((resolve) => { this.cine = { from, to: null, t: 0, dur, resolve }; this.cineHold = null; });
  }
  get cinematic() { return !!(this.cine || this.cineHold); }

  clampGoal() {
    const b = this.bounds;
    if (!b) return;
    // how much ground the view covers around its focus (approx.)
    const halfH = Math.tan((this.cur.fov * Math.PI) / 360) * this.cur.dist;
    const halfW = halfH * (16 / 9);
    const visZ = halfH / Math.sin(this.cur.pitch) * 0.95;
    const mx = Math.max(0, (b.x1 - b.x0) / 2 - halfW + 1.2), mz = Math.max(0, (b.z1 - b.z0) / 2 - visZ + 1.6);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    this.goal.x = clamp(this.goal.x, cx - mx, cx + mx);
    this.goal.z = clamp(this.goal.z, cz - mz + 0.4, cz + mz + 0.4);
  }

  update(dt) {
    this.time += dt;
    const t = this.target;
    if (t) {
      const vx = t.vx || 0, vz = t.vz || 0;
      const ax = t.aimX || 0, az = t.aimZ || 0;
      this.goal.set(t.x + vx * this.lead + ax * this.aimLead, 0, t.z + vz * this.lead + az * this.aimLead);
      this.clampGoal();
    }
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const k = ease(Math.min(1, c.t / c.dur));
      const to = c.to || { focus: this.goal.clone(), dist: this.dist, fov: this.fov, pitch: this.pitch };
      this.focus.lerpVectors(c.from.focus, to.focus, k);
      this.cur.dist = c.from.dist + (to.dist - c.from.dist) * k;
      this.cur.fov = c.from.fov + (to.fov - c.from.fov) * k;
      this.cur.pitch = c.from.pitch + (to.pitch - c.from.pitch) * k;
      if (c.t >= c.dur) {
        this.cine = null;
        if (c.to) this.cineHold = { focus: c.to.focus.clone(), dist: c.to.dist, fov: c.to.fov, pitch: c.to.pitch };
        c.resolve && c.resolve();
      }
    } else if (this.cineHold) {
      const h = this.cineHold;
      this.focus.lerp(h.focus, 1 - Math.exp(-6 * dt));
      this.cur.dist = h.dist; this.cur.fov = h.fov; this.cur.pitch = h.pitch;
    } else {
      this.focus.x = damp(this.focus.x, this.goal.x, this.lambda, dt);
      this.focus.z = damp(this.focus.z, this.goal.z, this.lambda, dt);
      this.focus.y = damp(this.focus.y, 0, this.lambda, dt);
      this.cur.dist = damp(this.cur.dist, this.dist, 5, dt);
      this.cur.fov = damp(this.cur.fov, this.fov, 5, dt);
      this.cur.pitch = damp(this.cur.pitch, this.pitch, 5, dt);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.kick.multiplyScalar(Math.exp(-14 * dt));
    this.apply();
  }

  apply() {
    const cam = this.camera, f = this.focus, p = this.cur.pitch, d = this.cur.dist;
    const s = this.trauma * this.trauma;
    const tt = this.time;
    const sx = (noise2(tt * 26, 1) - 0.5) * 0.5 * s, sz = (noise2(tt * 26, 2) - 0.5) * 0.5 * s, sr = (noise2(tt * 20, 3) - 0.5) * 0.03 * s;
    const fx = f.x + this.kick.x + sx, fz = f.z + this.kick.z + sz;
    cam.position.set(fx, f.y + Math.sin(p) * d, fz + Math.cos(p) * d);
    cam.lookAt(fx, f.y, fz);
    cam.rotateZ(sr + this.roll);
    if (Math.abs(cam.fov - this.cur.fov) > 1e-3) { cam.fov = this.cur.fov; cam.updateProjectionMatrix(); }
  }

  /** Ground point (y = 0) under a virtual-screen pixel (for mouse aim). */
  groundAt(px, py, W = 960, H = 540, out = new THREE.Vector3()) {
    const ndc = this._v.set((px / W) * 2 - 1, -(py / H) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const o = this.camera.position, dir = ndc.sub(o).normalize();
    if (Math.abs(dir.y) < 1e-4) return null;
    const t = -o.y / dir.y;
    return out.set(o.x + dir.x * t, 0, o.z + dir.z * t);
  }
  /** Screen pixel of a world point. */
  project(x, y, z, W = 960, H = 540) {
    const v = this._v.set(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, behind: v.z > 1 };
  }
}
