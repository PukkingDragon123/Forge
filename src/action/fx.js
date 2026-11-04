// Combat FX for the action engine: pixel particles, voxel chips, slash arcs, ground telegraphs,
// shock rings, lightning, floor decals, pooled flash lights, and world-anchored damage numbers +
// impact stars drawn on the UI canvas. Everything additive lives on the FX layer (no outlines).
import * as THREE from 'three';
import { ParticleSystem, Debris } from '../gfx/particles.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { bigText, drawText } from '../ui/font.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ shaders
const ARC_VS = /* glsl */ `
attribute vec2 uvw;
varying vec2 vU;
void main() { vU = uvw; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FS = /* glsl */ `
uniform vec3 uColor; uniform vec3 uCore; uniform float uHead; uniform float uTail; uniform float uFade;
varying vec2 vU;
void main() {
  float u = vU.x, v = vU.y;
  if (u > uHead || u < uHead - uTail) discard;
  float t = clamp((u - (uHead - uTail)) / max(1e-3, uTail), 0.0, 1.0); // 0 = tail end, 1 = head
  // a crescent: full width at the head, only the outer rim at the tail
  if (v < 1.0 - (0.22 + 0.78 * t)) discard;
  float body = t * sqrt(t);
  float inner = smoothstep(1.0 - (0.22 + 0.78 * t), 1.0, v);
  float rim = smoothstep(0.78, 0.95, v) * (1.0 - smoothstep(0.97, 1.0, v));
  float a = body * (inner * inner * 0.7 + rim) * uFade;
  a = floor(a * 6.0 + 0.5) / 6.0; // chunky pixel steps
  if (a <= 0.0) discard;
  vec3 c = mix(uColor, uCore, rim * (0.4 + 0.6 * t));
  gl_FragColor = vec4(c * a * 1.55, 1.0);
}`;
const GROUND_VS = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// shape 0: radial (circle/cone/ring: progress grows outward), 1: linear along +z (line)
const TELE_FS = /* glsl */ `
uniform vec3 uColor; uniform float uProg; uniform float uAlpha; uniform float uShape; uniform float uR; uniform float uR0; uniform float uTime;
varying vec2 vP;
void main() {
  float d = uShape < 0.5 ? length(vP) : vP.y;
  float k = uShape < 0.5 ? (d - uR0) / max(1e-3, uR - uR0) : d / max(1e-3, uR);
  float border = uShape < 0.5 ? smoothstep(0.86, 0.99, (d) / uR) : 0.0;
  float fill = step(k, uProg);
  float rim = smoothstep(uProg - 0.06, uProg, k) * fill;
  float a = 0.07 + 0.16 * fill + 0.5 * rim + 0.7 * border;
  a *= 0.88 + 0.12 * sin(uTime * 30.0);
  a = floor(a * 5.0 + 0.5) / 5.0;
  gl_FragColor = vec4(uColor, a * uAlpha);
}`;
const SOFT_FS = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; uniform float uR; uniform float uInner;
varying vec2 vP;
void main() {
  float d = length(vP) / uR;
  if (d > 1.0 || (uInner > 0.0 && d < uInner)) discard;
  // a faint fill that thins toward the middle and a bright rim (reads as an area, not a pancake)
  float rim = smoothstep(0.8, 0.96, d) * (1.0 - smoothstep(0.96, 1.0, d));
  float fill = 0.16 + 0.14 * d;
  float a = (fill + rim * 0.9) * uAlpha;
  a = floor(a * 10.0 + 0.5) / 10.0;
  if (a <= 0.01) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const DECAL_FS = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha; uniform float uR; uniform float uSeed;
varying vec2 vP;
float h(vec2 p) { return fract(sin(dot(floor(p * 9.0), vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
void main() {
  float d = length(vP) / uR + (h(vP) - 0.5) * 0.35;
  float a = (1.0 - smoothstep(0.5, 1.0, d)) * uAlpha;
  a = floor(a * 4.0 + 0.5) / 4.0;
  if (a <= 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function fxify(o, order = 8) {
  o.traverse((m) => { m.layers.set(LAYER_FX); m.renderOrder = order; m.frustumCulled = false; });
  return o;
}

/** Arc ribbon geometry: angles a0→a1 (radians, around +Y, 0 = +Z), radii r0..r1. */
function arcGeo(r0, r1, a0, a1, seg = 18) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = lerp(a0, a1, u), s = Math.sin(a), c = Math.cos(a);
    pos.push(s * r0, 0, c * r0, s * r1, 0, c * r1);
    uv.push(u, 0, u, 1);
    if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uvw', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function sectorGeo(r, angle, r0 = 0, seg = 36) {
  if (angle >= TAU - 1e-3 && r0 > 0) return new THREE.RingGeometry(r0, r, seg, 1).rotateX(-Math.PI / 2);
  if (angle >= TAU - 1e-3) return new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
  // a fan centred on +Z after rotation: CircleGeometry's theta 0 = +X, so centre the wedge on +Y then rotate X
  return new THREE.CircleGeometry(r, seg, Math.PI / 2 - angle / 2, angle).rotateX(-Math.PI / 2).rotateY(Math.PI);
}
const col3 = (c) => new THREE.Color(c);

/** Per-world FX manager. */
export class FX {
  constructor(world) {
    this.world = world;
    this.root = new THREE.Group();
    this.root.name = 'action-fx';
    this.add = new ParticleSystem(2400, { additive: true, perspective: 14 });
    this.alpha = new ParticleSystem(1600, { perspective: 14 });
    this.chips = new Debris(500, 0.055);
    this.root.add(this.add.object, this.alpha.object, this.chips.object);
    fxify(this.add.object, 12); fxify(this.alpha.object, 11);
    this.items = [];      // timed meshes: { mesh, t, life, update(k, it) }
    this.numbers = [];    // world-anchored numbers
    this.impacts = [];    // 2D impact stars on the UI
    // pooled flash lights: a fixed count so shader programs never recompile
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffffff, 0, 6, 1.6); l.position.set(0, -50, 0); this.root.add(l); this.lights.push({ l, t: 0, life: 1, i0: 0 }); }
    this._v = new THREE.Vector3();
  }

  // ---------------------------------------------------------------- pooled light flash
  light(x, y, z, color, intensity = 4, dist = 6, life = 0.25) {
    const s = this.lights.reduce((a, b) => (a.l.intensity <= b.l.intensity ? a : b));
    s.l.position.set(x, y, z); s.l.color.set(color); s.l.distance = dist; s.t = 0; s.life = life; s.i0 = intensity; s.l.intensity = intensity;
  }

  // ---------------------------------------------------------------- particles
  spark(x, y, z, color = '#ffe8a0', n = 10, o = {}) {
    this.add.emit({ pos: [x, y, z], count: n, radial: o.speed ?? [2, 6], radialUp: o.up ?? 0.6, spread: 0.3, life: o.life ?? [0.15, 0.4], size: o.size ?? [1, 2.5], sizeEnd: 0.5, color, colorEnd: o.colorEnd ?? '#ff6a2a', glow: o.glow ?? 3, gravity: o.gravity ?? -6, drag: 2.5, floor: 0.02, bounce: 0.3 });
  }
  dust(x, z, n = 8, o = {}) {
    this.alpha.emit({ pos: [x, 0.08, z], posSpread: [o.spread ?? 0.25, 0.04, o.spread ?? 0.25], count: n, radial: o.speed ?? [0.4, 1.4], radialUp: 0.25, life: o.life ?? [0.35, 0.8], size: o.size ?? [2, 4], sizeEnd: o.sizeEnd ?? 5, color: o.color ?? ['#a8987e', '#8a7a64', '#c8b89a'], alpha: o.alpha ?? 0.55, drag: 3, gravity: -0.3 });
  }
  smoke(x, y, z, color = '#6a8a5a', n = 6, o = {}) {
    this.alpha.emit({ pos: [x, y, z], posSpread: [o.spread ?? 0.4, 0.15, o.spread ?? 0.4], count: n, vel: [0, o.rise ?? 0.5, 0], spread: o.drift ?? 0.4, life: o.life ?? [0.8, 1.6], size: o.size ?? [4, 7], sizeEnd: o.sizeEnd ?? 10, color, alpha: o.alpha ?? 0.4, drag: 1.2, fadeIn: 0.15 });
  }
  glow(x, y, z, color, n = 6, o = {}) {
    this.add.emit({ pos: [x, y, z], posSpread: [o.spread ?? 0.3, o.ySpread ?? 0.2, o.spread ?? 0.3], count: n, vel: o.vel ?? [0, 0.6, 0], spread: o.drift ?? 0.4, life: o.life ?? [0.4, 0.9], size: o.size ?? [1, 2.5], sizeEnd: 0.5, color, glow: o.glowK ?? 2.6, flicker: o.flicker ?? 0.3 });
  }
  chipsAt(x, y, z, colors, n = 8, o = {}) {
    this.chips.spawn({ pos: [x, y, z], count: n, colors, speed: o.speed ?? 2.4, up: o.up ?? 2.4, spread: 0.12, life: o.life ?? 0.9, floor: 0.02, scale: o.scale ?? [0.5, 1.3], dir: o.dir || [0, 0, 0] });
  }

  // ---------------------------------------------------------------- slash arcs
  /** A sweeping crescent. angle = facing (rad), arc = width (rad), dir = +1 sweeps clockwise from the left. */
  slash(x, z, angle, arc = 2.4, r = 1.6, o = {}) {
    const dir = o.dir ?? 1, w = (o.width ?? 0.55) * 0.85;
    r *= o.visual ?? 0.82; // drawn a little inside the hit reach so it hugs the hero
    const a0 = angle + (dir > 0 ? arc / 2 : -arc / 2), a1 = angle - (dir > 0 ? arc / 2 : -arc / 2);
    const geo = arcGeo(Math.max(0.05, r - w), r, a0, a1, Math.max(8, Math.round(arc * 9)));
    const mat = new THREE.ShaderMaterial({
      vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: col3(o.color || '#ffb85a') }, uCore: { value: col3(o.core || '#fff6d8') }, uHead: { value: 0 }, uTail: { value: o.tail ?? 0.85 }, uFade: { value: 1 } },
    });
    const m = fxify(new THREE.Mesh(geo, mat), 13);
    m.position.set(x, o.y ?? 0.55, z);
    if (o.tilt) m.rotation.x = o.tilt;
    this.root.add(m);
    const sweep = o.sweep ?? 0.09, life = sweep + (o.hold ?? 0.12);
    this.items.push({ mesh: m, t: 0, life, update: (k, it) => {
      const tt = it.t;
      mat.uniforms.uHead.value = Math.min(1.08, tt / sweep);
      mat.uniforms.uFade.value = tt < sweep ? 1 : 1 - (tt - sweep) / (life - sweep);
    } });
    return m;
  }
  /** A thrust streak (spear/sword dash): a long thin arc pointing along `angle`. */
  thrust(x, z, angle, len = 2.4, o = {}) {
    const g = new THREE.PlaneGeometry(o.width ?? 0.28, len).rotateX(-Math.PI / 2).translate(0, 0, len / 2);
    const uv = [];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.push(p.getZ(i) / len, p.getX(i) > 0 ? 1 : 0.4);
    g.setAttribute('uvw', new THREE.Float32BufferAttribute(uv, 2));
    const mat = new THREE.ShaderMaterial({
      vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: col3(o.color || '#ffb85a') }, uCore: { value: col3('#ffffff') }, uHead: { value: 0 }, uTail: { value: 0.9 }, uFade: { value: 1 } },
    });
    const m = fxify(new THREE.Mesh(g, mat), 13);
    m.position.set(x, o.y ?? 0.55, z); m.rotation.y = angle;
    this.root.add(m);
    const sweep = o.sweep ?? 0.07, life = sweep + 0.14;
    this.items.push({ mesh: m, t: 0, life, update: (k, it) => { mat.uniforms.uHead.value = Math.min(1.1, it.t / sweep); mat.uniforms.uFade.value = it.t < sweep ? 1 : 1 - (it.t - sweep) / (life - sweep); } });
  }

  // ---------------------------------------------------------------- rings, discs, decals
  /** Expanding shock ring on the ground. */
  ring(x, z, r = 2, color = '#ffe0a0', o = {}) {
    const geo = new THREE.RingGeometry(0.82, 1, 48, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = fxify(new THREE.Mesh(geo, mat), 9);
    m.position.set(x, o.y ?? 0.05, z);
    this.root.add(m);
    const life = o.life ?? 0.35, r0 = o.r0 ?? r * 0.15;
    this.items.push({ mesh: m, t: 0, life, update: (k) => { const e = 1 - (1 - k) ** 3; const s = lerp(r0, r, e); m.scale.set(s, 1, s); mat.opacity = (1 - k) * (o.alpha ?? 1); } });
    return m;
  }
  /** Soft glowing disc (auras, clouds, fire patches). Returns an item you can kill early with .done = true. */
  disc(x, z, r, color, o = {}) {
    const geo = new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({ vertexShader: GROUND_VS, fragmentShader: SOFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: col3(color) }, uAlpha: { value: 0 }, uR: { value: r }, uInner: { value: o.inner ?? 0 } } });
    const m = fxify(new THREE.Mesh(geo, mat), 8);
    m.position.set(x, o.y ?? 0.04, z);
    this.root.add(m);
    const life = o.life ?? 1, a = o.alpha ?? 0.6;
    const it = { mesh: m, t: 0, life, update: (k) => { const f = Math.min(1, k * life / 0.15) * (k > 0.8 ? (1 - k) / 0.2 : 1); mat.uniforms.uAlpha.value = a * f * (o.pulse ? 0.8 + 0.2 * Math.sin(it.t * 8) : 1); } };
    this.items.push(it);
    return it;
  }
  /** Splat that stays on the floor and fades (spores, scorch, ichor). */
  decal(x, z, r, color = '#2a3a1a', o = {}) {
    const geo = new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({ vertexShader: GROUND_VS, fragmentShader: DECAL_FS, transparent: true, depthWrite: false, uniforms: { uColor: { value: col3(color) }, uAlpha: { value: o.alpha ?? 0.6 }, uR: { value: r }, uSeed: { value: Math.random() * 100 } } });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 2;
    m.position.set(x, 0.02 + Math.random() * 0.005, z);
    m.rotation.y = Math.random() * TAU;
    this.root.add(m);
    const life = o.life ?? 6, a = o.alpha ?? 0.6;
    this.items.push({ mesh: m, t: 0, life, update: (k) => { mat.uniforms.uAlpha.value = a * (k > 0.7 ? (1 - k) / 0.3 : 1); } });
  }

  // ---------------------------------------------------------------- telegraphs
  /** Ground warning: shape circle|cone|line|ring. Fills over dur, then onDone(). */
  telegraph(o) {
    const shape = o.shape || 'circle';
    let geo;
    const r = o.r ?? o.len ?? 2;
    if (shape === 'line') geo = new THREE.PlaneGeometry(o.width ?? 1, o.len ?? 4).rotateX(-Math.PI / 2).translate(0, 0, (o.len ?? 4) / 2);
    else if (shape === 'cone') geo = sectorGeo(r, o.angle ?? 1.2);
    else if (shape === 'ring') geo = sectorGeo(r, TAU, o.r0 ?? r * 0.6);
    else geo = sectorGeo(r, TAU);
    const mat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VS, fragmentShader: TELE_FS, transparent: true, depthWrite: false,
      uniforms: { uColor: { value: col3(o.color || '#ff3a24') }, uProg: { value: 0 }, uAlpha: { value: 1 }, uShape: { value: shape === 'line' ? 1 : 0 }, uR: { value: r }, uR0: { value: shape === 'ring' ? o.r0 ?? r * 0.6 : 0 }, uTime: { value: 0 } },
    });
    const m = fxify(new THREE.Mesh(geo, mat), 7);
    m.position.set(o.x ?? 0, 0.035, o.z ?? 0);
    const d = o.dir;
    if (d && (shape === 'line' || shape === 'cone')) m.rotation.y = Math.atan2(d.x, d.z);
    else if (o.facing !== undefined) m.rotation.y = o.facing;
    this.root.add(m);
    const dur = o.dur ?? 0.8;
    const tel = { mesh: m, t: 0, life: dur + 0.12, shape, o, done: false, fired: false, update: (k, it) => {
      mat.uniforms.uTime.value = it.t;
      mat.uniforms.uProg.value = clamp01(it.t / dur);
      if (it.t >= dur && !it.fired) { it.fired = true; mat.uniforms.uAlpha.value = 1.4; if (o.onDone) o.onDone(it); }
      if (it.t > dur) mat.uniforms.uAlpha.value = 1 - (it.t - dur) / 0.12;
      if (o.follow) { const p = o.follow(); if (p) { m.position.x = p.x; m.position.z = p.z; if (p.dir) m.rotation.y = Math.atan2(p.dir.x, p.dir.z); } }
    } };
    this.items.push(tel);
    return tel;
  }

  // ---------------------------------------------------------------- lightning & ghosts
  bolt(points, color = '#9ae8ff', o = {}) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      // jag each segment into 3 pieces
      let p0 = a;
      for (let k = 1; k <= 3; k++) {
        const t = k / 3;
        const p1 = k === 3 ? b : new THREE.Vector3(lerp(a.x, b.x, t) + (Math.random() - 0.5) * 0.45, lerp(a.y, b.y, t) + (Math.random() - 0.5) * 0.3, lerp(a.z, b.z, t) + (Math.random() - 0.5) * 0.45);
        const len = p0.distanceTo(p1);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(o.width ?? 0.07, o.width ?? 0.07, len), mat);
        seg.position.copy(p0).lerp(p1, 0.5);
        seg.lookAt(p1);
        g.add(seg);
        p0 = p1;
      }
    }
    fxify(g, 14);
    this.root.add(g);
    const life = o.life ?? 0.22;
    this.items.push({ mesh: g, t: 0, life, update: (k, it) => { mat.opacity = (1 - k) * (0.6 + 0.4 * (Math.floor(it.t * 40) % 2)); } });
  }
  /** Dash after-image: a tinted capsule ghost that fades. */
  ghost(x, z, facing, color = '#ffd27a', o = {}) {
    const geo = new THREE.CapsuleGeometry(o.r ?? 0.24, o.h ?? 0.42, 3, 8).translate(0, (o.h ?? 0.42) / 2 + (o.r ?? 0.24), 0);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22 });
    const m = fxify(new THREE.Mesh(geo, mat), 6);
    m.position.set(x, 0.02, z); m.rotation.y = facing; m.scale.set(0.85, 1, 0.55);
    this.root.add(m);
    this.items.push({ mesh: m, t: 0, life: o.life ?? 0.18, update: (k) => { mat.opacity = 0.22 * (1 - k) * (1 - k); m.scale.set(0.85 - k * 0.2, 1 - k * 0.25, 0.55); } });
  }
  /** Generic timed mesh (skills build their own and hand them here). update(k, it). */
  timed(mesh, life, update, layerFx = false) {
    if (layerFx) fxify(mesh, 9);
    this.root.add(mesh);
    const it = { mesh, t: 0, life, update };
    this.items.push(it);
    return it;
  }

  // ---------------------------------------------------------------- numbers & impacts (UI)
  /** style: 'hit' | 'crit' | 'heavy' | 'hurt' | 'heal' | 'status' | 'text' | 'loot' */
  number(x, y, z, text, style = 'hit', o = {}) {
    // stack: nudge numbers that land on the same spot
    const recent = this.numbers.filter((n) => n.t < 0.12 && Math.abs(n.x - x) < 0.6 && Math.abs(n.z - z) < 0.6).length;
    this.numbers.push({ x: x + (Math.random() - 0.5) * 0.25, y: y + recent * 0.28, z, text: String(text), style, t: 0, life: o.life ?? (style === 'crit' ? 0.95 : style === 'status' ? 0.9 : 0.7), color: o.color, vx: (Math.random() - 0.5) * 18 });
  }
  impact(x, y, z, o = {}) { this.impacts.push({ x, y, z, t: 0, life: o.life ?? 0.09, size: o.size ?? 14, color: o.color || '#ffffff', angle: Math.random() * Math.PI }); }

  // ---------------------------------------------------------------- update / draw
  update(dt, realDt = dt) {
    this.add.update(dt); this.alpha.update(dt); this.chips.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.life > 0 ? Math.min(1, it.t / it.life) : 1;
      if (it.update) it.update(k, it);
      if (it.t >= it.life || it.done) {
        this.items.splice(i, 1);
        it.mesh.parent && it.mesh.parent.remove(it.mesh);
        it.mesh.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material && !m.material.userData.shared) m.material.dispose(); });
      }
    }
    for (const s of this.lights) {
      if (s.l.intensity <= 0) continue;
      s.t += dt;
      s.l.intensity = s.t >= s.life ? 0 : s.i0 * (1 - s.t / s.life) ** 2;
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) { const n = this.numbers[i]; n.t += realDt; if (n.t >= n.life) this.numbers.splice(i, 1); }
    for (let i = this.impacts.length - 1; i >= 0; i--) { const n = this.impacts[i]; n.t += realDt; if (n.t >= n.life) this.impacts.splice(i, 1); }
  }
  project(camera, x, y, z, W, H) {
    const v = this._v.set(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, behind: v.z > 1 };
  }
  drawUI(ui, camera) {
    const ctx = ui.ctx, W = ui.w, H = ui.h;
    for (const im of this.impacts) {
      const p = this.project(camera, im.x, im.y, im.z, W, H);
      if (p.behind) continue;
      const k = im.t / im.life, s = im.size * (0.6 + k * 0.8);
      ctx.save();
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.fillStyle = im.color;
      ctx.translate(Math.round(p.x), Math.round(p.y));
      for (let i = 0; i < 4; i++) {
        const a = im.angle + (i * Math.PI) / 4;
        const len = i % 2 ? s * 0.6 : s;
        ctx.save(); ctx.rotate(a); ctx.fillRect(-len, -1, len * 2, 2); ctx.restore();
      }
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
    for (const n of this.numbers) {
      const p = this.project(camera, n.x, n.y, n.z, W, H);
      if (p.behind) continue;
      const k = n.t / n.life;
      const rise = (1 - (1 - Math.min(1, k * 1.6)) ** 3) * (n.style === 'crit' ? 30 : 22);
      const x = Math.round(p.x + n.vx * k), y = Math.round(p.y - rise);
      const alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.globalAlpha = alpha;
      if (n.style === 'crit' || n.style === 'heavy') {
        const pop = k < 0.1 ? 1.6 - k * 6 : 1;
        const img = bigText(n.text, { scale: n.style === 'crit' ? 3 : 2, top: n.style === 'crit' ? '#fff6b0' : '#ffffff', bottom: n.style === 'crit' ? '#ffb020' : '#ffd8a0' });
        ctx.save(); ctx.translate(x, y); const s = Math.round(pop * 4) / 4; ctx.scale(s, s); ctx.drawImage(img, Math.round(-img.width / 2), Math.round(-img.height / 2)); ctx.restore();
      } else if (n.style === 'hurt') {
        const img = bigText(n.text, { scale: 2, top: '#ffb0a0', bottom: '#ff3a2a' });
        ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
      } else if (n.style === 'hit' || n.style === 'heal') {
        const pop = k < 0.08 ? 1.3 - k * 3.75 : 1;
        const img = bigText(n.text, { scale: 2, top: n.style === 'heal' ? '#d8ffe0' : '#ffffff', bottom: n.style === 'heal' ? '#4adf6a' : '#e8d8c0' });
        ctx.save(); ctx.translate(x, y); const s = Math.round(pop * 4) / 4; ctx.scale(s, s); ctx.drawImage(img, Math.round(-img.width / 2), Math.round(-img.height / 2)); ctx.restore();
      } else {
        const color = n.color || (n.style === 'status' ? '#c8f0ff' : n.style === 'loot' ? '#ffe08a' : '#ffffff');
        drawText(ctx, n.text, x, y - 4, { align: 'center', color, outline: '#140c10', font: n.style === 'status' ? 'small' : 'body' });
      }
      ctx.globalAlpha = 1;
    }
  }
  dispose() {
    for (const it of this.items) it.mesh.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    this.items = [];
    this.root.parent && this.root.parent.remove(this.root);
  }
}
