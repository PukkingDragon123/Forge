// Voxel chunks that pop off monsters when they're hit and burst out when they die (instanced cubes that tumble,
// bounce on the floor and shrink away).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

export class VoxelBurst {
  constructor(max, size) {
    this.max = max;
    this.size = size;
    const geo = new THREE.BoxGeometry(size, size, size);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    this.items = [];
  }
  /** pos: Vector3 (parent space), rgb: linear [r,g,b], vel: [x,y,z] */
  emit(pos, rgb, vel, life = 1.2, glow = false) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ p: pos.clone(), v: new THREE.Vector3(vel[0], vel[1], vel[2]), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), c: glow ? rgb.map((x) => Math.min(1, x * 1.6 + 0.2)) : rgb, t: 0, life, s: 0.75 + Math.random() * 0.6 });
  }
  update(dt, floorY = 0) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const o = it[i];
      o.t += dt;
      if (o.t > o.life) { it.splice(i, 1); continue; }
      o.v.y -= 9.5 * dt;
      o.p.addScaledVector(o.v, dt);
      if (o.p.y < floorY + this.size * 0.5) {
        o.p.y = floorY + this.size * 0.5;
        if (o.v.y < -0.6) { o.v.y *= -0.38; o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.5); }
        else { o.v.set(o.v.x * 0.8, 0, o.v.z * 0.8); o.w.multiplyScalar(0.8); }
      }
      o.r.addScaledVector(o.w, dt);
    }
    for (let i = 0; i < it.length; i++) {
      const o = it[i];
      const k = o.t / o.life, sc = o.s * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      _q.setFromEuler(_e.set(o.r.x, o.r.y, o.r.z));
      _m.compose(o.p, _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setRGB(o.c[0], o.c[1], o.c[2]));
    }
    this.mesh.count = it.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  get active() { return this.items.length > 0; }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}
void _p;

// ============================================================================ petrification
// Medusa's stone: a grey granite front sweeps up the creature in world space (jagged, with a thin jade-glowing
// edge), colours drain to stone, and opened cracks glow along jagged pixel lines. Injected into the monster's
// own per-instance materials, so it works on every archetype without touching their meshes.
const STONE_PARS = /* glsl */ `
varying vec3 vStW;
uniform float uStone;
uniform float uStBase;
uniform float uStTop;
uniform float uStCell;
uniform vec4 uCracks[6];
uniform vec3 uCrackCol;
uniform float uCrackR;
float stH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
`;
const STONE_FRAG = /* glsl */ `
vec3 stGlow = vec3(0.0);
if (uStone > 0.0) {
  vec3 cel = floor(vStW / uStCell);
  float hh = max(0.2, uStTop - uStBase);
  float front = mix(uStBase - 0.08 * hh, uStTop + 0.14 * hh, uStone) + (stH(floor(vStW / (uStCell * 2.0))) - 0.5) * 0.1 * hh;
  float sk = step(vStW.y, front);
  float edge = (1.0 - smoothstep(0.0, uStCell * 2.5, abs(vStW.y - front))) * (1.0 - step(0.999, uStone));
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  float n = stH(cel);
  vec3 stone = mix(vec3(0.15, 0.17, 0.21), vec3(0.5, 0.54, 0.58), clamp(lum * 1.5 + 0.2, 0.0, 1.0)) * (0.84 + 0.26 * n);
  if (stH(cel + 17.0) > 0.94) stone *= 0.6;
  stone += vec3(0.015, 0.05, 0.03) * step(0.86, stH(cel + 5.0));
  float dv = max(diffuse.r, 0.001);
  diffuseColor.rgb = mix(diffuseColor.rgb, stone / dv, sk);
  stGlow += uCrackCol * edge * 1.3;
  for (int i = 0; i < 6; i++) {
    vec4 c = uCracks[i];
    if (c.w <= 0.0) continue;
    vec3 d = vStW - c.xyz;
    float R = uCrackR * c.w;
    if (dot(d, d) > R * R) continue;
    vec3 toC = normalize(cameraPosition - c.xyz);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), toC));
    vec3 up = cross(toC, rt);
    vec2 q = floor(vec2(dot(d, rt), dot(d, up)) / uStCell + 0.5);
    float hit = 0.0;
    for (int j = 0; j < 5; j++) {
      float a = (float(j) + stH(vec3(float(i), float(j), 3.0)) * 0.8) * 1.2566;
      vec2 r = vec2(cos(a), sin(a));
      float al = dot(q, r);
      float L = (R / uStCell) * (0.55 + 0.45 * stH(vec3(float(i), float(j), 7.0)));
      if (al < 0.0 || al > L) continue;
      float pe = q.x * r.y - q.y * r.x;
      float jag = (stH(vec3(floor(al / 2.0), float(j), float(i))) - 0.5) * 2.2;
      if (abs(pe - jag) < 0.75) hit = max(hit, 1.0 - al / (L + 1.0));
    }
    if (dot(q, q) < 1.5) hit = 1.0;
    stGlow += uCrackCol * hit * 1.5 * min(1.0, c.w * 1.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.05) / dv, hit * 0.55);
  }
}
`;
/** Shared uniform set for one creature (pass the same object to all its materials). */
export function stoneUniforms(cell) {
  return {
    uStone: { value: 0 }, uStBase: { value: 0 }, uStTop: { value: 1 }, uStCell: { value: cell },
    uCracks: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uCrackCol: { value: new THREE.Color('#9affc8') }, uCrackR: { value: 0.22 },
  };
}
/** Patch a Lambert/Basic material so it can turn to stone (uniforms U from stoneUniforms). */
export function petrifyMaterial(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvStW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + STONE_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + STONE_FRAG)
      .replace('#include <opaque_fragment>', 'outgoingLight += stGlow;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'forglite-stone-' + mat.type;
  return mat;
}

// ============================================================================ statue shatter
const _w = new THREE.Vector3();
/**
 * A petrified creature bursting into voxel chunks: stone rubble that tumbles, bounces and settles, plus ore
 * chunks that glint (lit cubes + a bright core). pieces: [{ pos (world Vector3, live), ore, color }].
 */
export class StatueShatter {
  constructor(parent, size, max = 420) {
    this.parent = parent; // Object3D whose local space the chunks live in (the monster group)
    this.size = size;
    const geo = new THREE.BoxGeometry(size, size, size);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.glow = new THREE.InstancedMesh(geo, this.glowMat, Math.ceil(max / 3));
    for (const m of [this.mesh, this.glow]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, _c.setRGB(1, 1, 1)); }
    this.mesh.castShadow = true;
    parent.add(this.mesh); parent.add(this.glow);
    this.max = max;
    this.items = [];
    this.pieces = [];
    this.t = 0;
    this.floorY = 0;
  }
  /** pos (parent space), rgb linear, vel [x,y,z]; ore chunks glint and live a little longer */
  add(pos, rgb, vel, ore = false, scale = 1) {
    if (this.items.length >= this.max) return;
    const it = { p: pos.clone(), v: new THREE.Vector3(...vel), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16), c: rgb, ore, s: (0.7 + Math.random() * 0.55) * scale, life: ore ? 4.2 + Math.random() : 2.6 + Math.random() * 1.6, t: 0, rest: false };
    this.items.push(it);
    if (ore) { it.piece = { pos: new THREE.Vector3(), ore: true, color: rgb, alive: true }; this.pieces.push(it.piece); }
  }
  get done() { return this.items.length === 0; }
  update(dt) {
    this.t += dt;
    const it = this.items, F = this.floorY + this.size * 0.5;
    for (let i = it.length - 1; i >= 0; i--) {
      const o = it[i];
      o.t += dt;
      if (o.t > o.life) { if (o.piece) o.piece.alive = false; it.splice(i, 1); continue; }
      if (!o.rest) {
        o.v.y -= 9.8 * dt;
        o.p.addScaledVector(o.v, dt);
        if (o.p.y < F) {
          o.p.y = F;
          if (o.v.y < -0.8) { o.v.y *= -0.32; o.v.x *= 0.55; o.v.z *= 0.55; o.w.multiplyScalar(0.45); }
          else { o.v.set(0, 0, 0); o.w.set(0, 0, 0); o.rest = true; }
        }
        o.r.addScaledVector(o.w, dt);
      }
      if (o.piece) o.piece.pos.copy(this.parent.localToWorld(_w.copy(o.p)));
    }
    let n = 0, g = 0;
    for (const o of it) {
      const k = o.t / o.life, sc = o.s * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1);
      _q.setFromEuler(_e.set(o.r.x, o.r.y, o.r.z));
      _m.compose(o.p, _q, _s.set(sc, sc, sc));
      if (!o.ore) {
        this.mesh.setMatrixAt(n, _m);
        this.mesh.setColorAt(n, _c.setRGB(o.c[0], o.c[1], o.c[2]));
        n++;
      } else if (g < this.glow.instanceMatrix.count) {
        // ore nuggets: emissive cubes that twinkle so they read as loot among the rubble
        const tw = 0.55 + 0.45 * Math.sin(this.t * 9 + o.s * 40);
        this.glow.setMatrixAt(g, _m);
        this.glow.setColorAt(g, _c.setRGB(Math.min(4, o.c[0] * 2.2 * tw + 0.5), Math.min(4, o.c[1] * 2.2 * tw + 0.5), Math.min(4, o.c[2] * 2.2 * tw + 0.4)));
        g++;
      }
    }
    this.mesh.count = n; this.glow.count = g;
    for (const m of [this.mesh, this.glow]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  dispose() {
    this.mesh.geometry.dispose(); this.mat.dispose(); this.glowMat.dispose();
    this.mesh.removeFromParent(); this.glow.removeFromParent();
  }
}
