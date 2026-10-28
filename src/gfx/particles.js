// Pixel particles (square points measured in virtual pixels) + voxel debris with simple physics.
import * as THREE from 'three';
import { LAYER_FX } from './renderer.js';
import { fx as rnd } from '../core/rng.js';

const vert = /* glsl */ `
attribute float size;
attribute vec4 pcolor;
varying vec4 vColor;
uniform float pxScale;
void main() {
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = size;
  if (pxScale > 0.0) s = size * pxScale / max(0.5, -mv.z);
  gl_PointSize = max(1.0, floor(s + 0.5));
}`;
const frag = /* glsl */ `
varying vec4 vColor;
void main() {
  if (vColor.a <= 0.01) discard;
  gl_FragColor = vColor;
}`;

/**
 * ParticleSystem: pool-based. emit(opts) with
 *   pos [x,y,z], vel [x,y,z], spread (velocity randomness), count, life [min,max], size [min,max] (px),
 *   color hex or [hex...], colorEnd hex, gravity, drag, glow (HDR multiplier), floor (y), bounce, fadeIn
 */
export class ParticleSystem {
  constructor(max = 2000, opts = {}) {
    this.max = max;
    this.additive = !!opts.additive;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.siz = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { pxScale: { value: opts.perspective ? opts.perspective : 0 } },
      vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, depthTest: true,
      blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.layers.set(LAYER_FX);
    this.points.renderOrder = 10;
    this.p = [];
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.alive = [];
  }
  get object() { return this.points; }
  emit(o) {
    const n = o.count ?? 1;
    const cols = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff'];
    for (let k = 0; k < n; k++) {
      const i = this.free.pop();
      if (i === undefined) return;
      const c = new THREE.Color(cols[(rnd.next() * cols.length) | 0]);
      const ce = o.colorEnd ? new THREE.Color(o.colorEnd) : null;
      const sp = o.spread ?? 0;
      const ps = o.posSpread ?? 0;
      const life = Array.isArray(o.life) ? rnd.float(o.life[0], o.life[1]) : o.life ?? 1;
      const size = Array.isArray(o.size) ? rnd.float(o.size[0], o.size[1]) : o.size ?? 1;
      const psv = Array.isArray(ps) ? ps : [ps, ps, ps];
      const part = {
        i,
        x: o.pos[0] + rnd.float(-psv[0], psv[0]), y: o.pos[1] + rnd.float(-psv[1], psv[1]), z: o.pos[2] + rnd.float(-psv[2], psv[2]),
        vx: (o.vel ? o.vel[0] : 0) + rnd.float(-sp, sp), vy: (o.vel ? o.vel[1] : 0) + rnd.float(-sp, sp), vz: (o.vel ? o.vel[2] : 0) + rnd.float(-sp, sp),
        g: o.gravity ?? 0, drag: o.drag ?? 0, t: 0, life,
        r: c.r, gg: c.g, b: c.b, re: ce ? ce.r : c.r, ge: ce ? ce.g : c.g, be: ce ? ce.b : c.b,
        glow: o.glow ?? (this.additive ? 2 : 1), size, sizeEnd: o.sizeEnd ?? size,
        floor: o.floor, bounce: o.bounce ?? 0.3, fadeIn: o.fadeIn ?? 0, flicker: o.flicker ?? 0,
        swirl: o.swirl ?? 0, alpha: o.alpha ?? 1,
      };
      if (o.radial) {
        // radial burst: random direction * radial speed
        const th = rnd.float(0, Math.PI * 2), ph = Math.acos(rnd.float(-1, 1));
        const s = Array.isArray(o.radial) ? rnd.float(o.radial[0], o.radial[1]) : o.radial;
        part.vx += Math.sin(ph) * Math.cos(th) * s; part.vy += Math.abs(Math.cos(ph)) * s * (o.radialUp ?? 1); part.vz += Math.sin(ph) * Math.sin(th) * s;
      }
      this.alive.push(part);
    }
  }
  update(dt) {
    const pos = this.pos, col = this.col, siz = this.siz;
    for (let k = this.alive.length - 1; k >= 0; k--) {
      const p = this.alive[k];
      p.t += dt;
      if (p.t >= p.life) {
        col[p.i * 4 + 3] = 0; siz[p.i] = 0;
        this.free.push(p.i);
        this.alive[k] = this.alive[this.alive.length - 1];
        this.alive.pop();
        continue;
      }
      p.vy -= p.g * dt;
      const d = 1 - p.drag * dt;
      p.vx *= d; p.vy *= d; p.vz *= d;
      if (p.swirl) { const a = p.swirl * dt; const vx = p.vx; p.vx = vx * Math.cos(a) - p.vz * Math.sin(a); p.vz = vx * Math.sin(a) + p.vz * Math.cos(a); }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; }
      const u = p.t / p.life;
      let a = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      if (p.fadeIn && p.t < p.fadeIn) a *= p.t / p.fadeIn;
      if (p.flicker) a *= 1 - p.flicker * rnd.next();
      a *= p.alpha;
      const gl = p.glow;
      pos[p.i * 3] = p.x; pos[p.i * 3 + 1] = p.y; pos[p.i * 3 + 2] = p.z;
      const r = (p.r + (p.re - p.r) * u) * gl, g = (p.gg + (p.ge - p.gg) * u) * gl, b = (p.b + (p.be - p.b) * u) * gl;
      if (this.additive) { col[p.i * 4] = r * a; col[p.i * 4 + 1] = g * a; col[p.i * 4 + 2] = b * a; col[p.i * 4 + 3] = 1; }
      else { col[p.i * 4] = r; col[p.i * 4 + 1] = g; col[p.i * 4 + 2] = b; col[p.i * 4 + 3] = a; }
      siz[p.i] = p.size + (p.sizeEnd - p.size) * u;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
  clear() {
    for (const p of this.alive) { this.col[p.i * 4 + 3] = 0; this.siz[p.i] = 0; this.free.push(p.i); }
    this.alive.length = 0;
  }
}

/** Voxel debris chunks: instanced cubes with gravity, bounce, spin and shrink-out. */
export class Debris {
  constructor(max = 400, size = 0.06) {
    this.max = max;
    const geo = new THREE.BoxGeometry(size, size, size);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.items = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.color = new THREE.Color();
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.color.set(0xffffff));
  }
  get object() { return this.mesh; }
  /** opts: pos, count, colors[], speed, up, life, floor, scale [min,max], spread */
  spawn(o) {
    const cols = Array.isArray(o.colors) ? o.colors : [o.colors || '#888'];
    for (let k = 0; k < (o.count ?? 8); k++) {
      if (this.items.length >= this.max) this.items.shift();
      const a = rnd.float(0, Math.PI * 2);
      const sp = rnd.float(0.3, 1) * (o.speed ?? 2);
      const dir = o.dir || [0, 0, 0];
      this.items.push({
        x: o.pos[0] + rnd.float(-1, 1) * (o.spread ?? 0.05), y: o.pos[1] + rnd.float(-1, 1) * (o.spread ?? 0.05), z: o.pos[2] + rnd.float(-1, 1) * (o.spread ?? 0.05),
        vx: Math.cos(a) * sp + dir[0], vy: rnd.float(0.4, 1) * (o.up ?? 2.5) + dir[1], vz: Math.sin(a) * sp * (o.depth ?? 1) + dir[2],
        rx: rnd.float(0, 6), ry: rnd.float(0, 6), wx: rnd.float(-12, 12), wy: rnd.float(-12, 12),
        t: 0, life: rnd.float(0.8, 1.2) * (o.life ?? 1.6), floor: o.floor ?? 0, scale: rnd.float(...(o.scale || [0.6, 1.4])),
        color: cols[(rnd.next() * cols.length) | 0], g: o.gravity ?? 9.8,
      });
    }
  }
  update(dt) {
    let n = 0;
    for (let k = this.items.length - 1; k >= 0; k--) {
      const d = this.items[k];
      d.t += dt;
      if (d.t > d.life) { this.items.splice(k, 1); continue; }
      d.vy -= d.g * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < d.floor) { d.y = d.floor; d.vy = -d.vy * 0.35; d.vx *= 0.55; d.vz *= 0.55; d.wx *= 0.5; d.wy *= 0.5; }
      d.rx += d.wx * dt; d.ry += d.wy * dt;
    }
    for (const d of this.items) {
      const u = d.t / d.life;
      const sc = d.scale * (u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1);
      this.q.setFromEuler(this.e.set(d.rx, d.ry, 0));
      this.m.compose(this.v.set(d.x, d.y, d.z), this.q, this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.color.set(d.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
