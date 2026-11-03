// Medusa's stone, for the fight: a petrify shader that sweeps grey stone along an axis (up a
// monster from its feet, up a blade from the grip) with a pale glowing front, plus fallbacks for
// monsters that do not (yet) implement setStone / stoneCracks / crackAt / shatter themselves.
import * as THREE from 'three';
import { fx as rnd } from '../../core/rng.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Inject the stone sweep into a (Lambert / Basic / Standard) material. Returns its uniform set. */
export function stoneify(mat) {
  if (mat.userData.stoneU) return mat.userData.stoneU;
  const U = {
    uStoneAxis: { value: V3(0, 1, 0) }, uStoneLevel: { value: -1e4 }, uStoneMix: { value: 1 }, uStoneAll: { value: 0 },
    uStoneBand: { value: new THREE.Color(0.55, 1, 0.85) },
  };
  mat.userData.stoneU = U;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = 'varying vec3 vStoneP;\n' + shader.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  vStoneP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 vStoneP;\nuniform vec3 uStoneAxis; uniform float uStoneLevel; uniform float uStoneMix; uniform float uStoneAll; uniform vec3 uStoneBand;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    float sd = dot(vStoneP, uStoneAxis) - uStoneLevel;
    float s = uStoneAll > 0.5 ? 1.0 : 1.0 - smoothstep(-0.012, 0.012, sd);
    float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 grey = vec3(0.06, 0.065, 0.075) + vec3(l) * vec3(0.78, 0.82, 0.88) * 0.9;
    diffuseColor.rgb = mix(diffuseColor.rgb, min(grey, vec3(0.95)), s * uStoneMix);
    float band = (1.0 - smoothstep(0.0, 0.03, abs(sd))) * uStoneMix * (1.0 - uStoneAll);
    diffuseColor.rgb += uStoneBand * band * 0.9;
  }`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key() + '|stone';
  mat.needsUpdate = true;
  return U;
}

function eachMat(root, fn) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    if (Array.isArray(o.material)) o.material.forEach((m, i) => fn(o, m, i));
    else if (o.material) fn(o, o.material, -1);
  });
}

// ------------------------------------------------------------------ the blade
/** Stone creeping up a held weapon from the grip to the tip. */
export class BladeStone {
  constructor(weaponGroup) {
    this.g = weaponGroup;
    this.U = [];
    eachMat(weaponGroup, (o, m) => { this.U.push(stoneify(m)); });
    const box = new THREE.Box3();
    weaponGroup.updateMatrixWorld(true);
    // local extent along the blade (+Y)
    let y0 = Infinity, y1 = -Infinity;
    weaponGroup.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox);
      y0 = Math.min(y0, box.min.y); y1 = Math.max(y1, box.max.y);
    });
    this.y0 = isFinite(y0) ? y0 : -0.1;
    this.y1 = isFinite(y1) ? y1 : weaponGroup.userData.tip || 0.6;
    this.k = 0;
    this._a = V3(); this._p = V3(); this._q = new THREE.Quaternion();
  }
  set(k) { this.k = Math.max(0, Math.min(1, k)); }
  /** Call every frame (the blade moves with the hands). */
  update() {
    const g = this.g;
    if (!g.parent) return;
    g.updateWorldMatrix(true, false);
    g.getWorldQuaternion(this._q);
    this._a.set(0, 1, 0).applyQuaternion(this._q).normalize();
    const ly = this.k <= 0 ? this.y0 - 0.2 : this.y0 + (this.y1 - this.y0 + 0.02) * this.k;
    this._p.set(0, ly, 0).applyMatrix4(g.matrixWorld);
    const lvl = this._p.dot(this._a);
    for (const U of this.U) { U.uStoneAxis.value.copy(this._a); U.uStoneLevel.value = lvl; U.uStoneAll.value = this.k >= 1 ? 1 : 0; }
  }
  /** Where the stone front is, in world space (for a dusting of particles). */
  frontWorld(out = V3()) { return out.set(0, this.y0 + (this.y1 - this.y0) * this.k, 0).applyMatrix4(this.g.matrixWorld); }
  tipWorld(out = V3()) { return out.set(0, this.y1, 0).applyMatrix4(this.g.matrixWorld); }
}

// ------------------------------------------------------------------ monsters (fallbacks)
/** Petrify amount 0..1 on a monster. Uses monster.setStone when it exists. */
export function setMonsterStone(mon, k) {
  if (typeof mon.setStone === 'function') { mon.setStone(k); return; }
  if (!mon._stoneU) {
    mon._stoneU = [];
    eachMat(mon.group, (o, m, i) => {
      const c = m.clone();
      if (i >= 0) o.material[i] = c; else o.material = c;
      mon._stoneU.push(stoneify(c));
    });
    const b = new THREE.Box3().setFromObject(mon.group);
    mon._stoneY = [b.min.y, b.max.y];
  }
  const [y0, y1] = mon._stoneY;
  for (const U of mon._stoneU) {
    U.uStoneLevel.value = k <= 0 ? y0 - 1 : y0 - 0.02 + (y1 - y0 + 0.08) * k;
    U.uStoneAll.value = k >= 1 ? 1 : 0;
  }
}

/** 3–6 world points on the statue where cracks glow (tap targets). */
export function statueCracks(mon, n = 4) {
  if (typeof mon.stoneCracks === 'function') {
    const pts = mon.stoneCracks();
    if (pts && pts.length) return pts.map((p) => (p.isVector3 ? p.clone() : V3(...p)));
  }
  mon.group.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(mon.group);
  const c = b.getCenter(V3()), s = b.getSize(V3());
  const local = (mon.cutPoints || []).slice(0, n).map((p) => mon.group.localToWorld(p.clone()));
  const out = [...local];
  const hp = mon.hitPoint ? mon.group.localToWorld(mon.hitPoint.clone()) : c.clone();
  const spots = [[0, 0.15], [-0.28, -0.05], [0.26, 0.1], [-0.12, -0.3], [0.18, -0.24], [0, 0.35]];
  for (const [ox, oy] of spots) {
    if (out.length >= n) break;
    out.push(V3(hp.x + ox * s.x, Math.max(b.min.y + s.y * 0.12, hp.y + oy * s.y), hp.z + (rnd.next() - 0.5) * 0.05));
  }
  return out.slice(0, n);
}

/** Visible jolt + chips when a crack is struck (monster.crackAt when it exists). */
export function crackStatue(mon, i, at, debris, sparks) {
  if (typeof mon.crackAt === 'function') { try { mon.crackAt(i); } catch (e) { /* model without that crack */ } }
  if (debris) debris.spawn({ pos: [at.x, at.y, at.z], count: 7, colors: ['#8e8a84', '#6e6a66', '#b0aca4'], speed: 1.8, up: 2.2, floor: 0.02, life: 1.1, scale: [0.4, 0.9] });
  if (sparks) sparks.emit({ pos: [at.x, at.y, at.z], radial: [1, 3], count: 22, life: [0.2, 0.6], size: 1, color: ['#ffffff', '#c8fff0', '#7affd8'], glow: 3, gravity: 6, drag: 2 });
}

/**
 * Burst the statue. Returns { update(dt) } for the flying chunks (monster.shatter when it exists),
 * otherwise hides the model and throws stone + ore-coloured voxel chunks with the debris system.
 */
export function shatterStatue(mon, debris, oreColors = []) {
  if (typeof mon.shatter === 'function') {
    try {
      const r = mon.shatter();
      if (r) return { update: (dt) => r.update && r.update(dt), dispose: () => r.dispose && r.dispose() };
    } catch (e) { /* fall back below */ }
  }
  const b = new THREE.Box3().setFromObject(mon.group);
  const c = b.getCenter(V3()), s = b.getSize(V3());
  mon.group.visible = false;
  const n = Math.round(20 + Math.min(60, s.x * s.y * 30));
  if (debris) {
    for (let i = 0; i < 4; i++) {
      debris.spawn({ pos: [c.x, b.min.y + s.y * (0.2 + i * 0.2), c.z], spread: Math.max(0.1, s.x * 0.35), count: Math.round(n / 4), colors: ['#8e8a84', '#6e6a66', '#a8a49c', '#5a5652'], speed: 2.6, up: 3, floor: 0.02, life: 1.8, scale: [0.6, 1.6] });
    }
    if (oreColors.length) debris.spawn({ pos: [c.x, c.y, c.z], spread: s.x * 0.2, count: 10, colors: oreColors, speed: 2.2, up: 3.5, floor: 0.02, life: 2.2, scale: [0.8, 1.4] });
  }
  return { update() {} };
}
