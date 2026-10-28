// Shared materials. Toon ramps give characters crisp pixel-art light bands.
import * as THREE from 'three';

const keep = (m) => { m.userData.keep = true; return m; };

function gradientTex(steps) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255); data[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  t.userData.keep = true;
  return t;
}
export const TOON3 = gradientTex([0.32, 0.62, 1.0]);
export const TOON4 = gradientTex([0.26, 0.5, 0.78, 1.0]);

const toonCache = new Map();
/** Cached toon material. color: hex string/number. opts: emissive, emissiveIntensity, steps(3|4), side, transparent, opacity */
export function toon(color, opts = {}) {
  const key = JSON.stringify([color, opts]);
  let m = toonCache.get(key);
  if (!m) {
    m = keep(new THREE.MeshToonMaterial({
      color: new THREE.Color(color),
      gradientMap: opts.steps === 3 ? TOON3 : TOON4,
      emissive: new THREE.Color(opts.emissive || 0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: opts.side || THREE.FrontSide,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      vertexColors: !!opts.vertexColors,
      map: opts.map || null,
    }));
    toonCache.set(key, m);
  }
  return m;
}

/** Unshared toon material (for things that animate their color / emissive). */
export function toonUnique(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color: new THREE.Color(color), gradientMap: opts.steps === 3 ? TOON3 : TOON4,
    emissive: new THREE.Color(opts.emissive || 0x000000), emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1, map: opts.map || null, side: opts.side || THREE.FrontSide,
  });
}

const glowCache = new Map();
/** Unlit HDR color — bright enough to bloom. */
export function glow(color, intensity = 2, opts = {}) {
  const key = color + '|' + intensity + '|' + (opts.transparent ? 1 : 0) + (opts.additive ? 'a' : '');
  let m = glowCache.get(key);
  if (!m) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    m = keep(new THREE.MeshBasicMaterial({
      color: c, transparent: !!opts.transparent || !!opts.additive, opacity: opts.opacity ?? 1,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !opts.additive, fog: false,
    }));
    glowCache.set(key, m);
  }
  return m;
}

let _vox = null, _voxToon = null;
const _voxGlow = new Map();
export function voxelMaterial() {
  if (!_vox) _vox = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  return _vox;
}
export function voxelToonMaterial() {
  if (!_voxToon) _voxToon = keep(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON4 }));
  return _voxToon;
}
export function voxelGlowMaterial(intensity = 2.2) {
  let m = _voxGlow.get(intensity);
  if (!m) {
    m = keep(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(intensity, intensity, intensity), fog: false }));
    _voxGlow.set(intensity, m);
  }
  return m;
}

/** Canvas → nearest-filtered sRGB texture. */
export function pixelTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
