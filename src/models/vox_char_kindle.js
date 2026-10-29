// Kindle, Elio's elemental familiar: a little faceted flame cut like a gem, on the party's fine
// voxel grid. Each facet holds one flat tone so it reads as cut crystal fire; two ember-dark eyes
// sit in its front. It bobs, wobbles, blinks, and changes element.
import * as THREE from 'three';
import { LAYER_FX } from '../gfx/renderer.js';
import { VPart, VOX_PARTY, voxToon, voxGlow } from './vox_char_kit.js';

export const KINDLE_COLORS = {
  fire: ['#e8461a', '#ff8a2a', '#ffc04a', '#fff2b0', 0xff8a3a],
  ice: ['#2a7ad8', '#4ab8f0', '#8fe8ff', '#eafcff', 0x7fe3ff],
  shock: ['#c88a10', '#f0c020', '#ffe74a', '#fffbe0', 0xffe74a],
  poison: ['#2a8a2a', '#5ac83a', '#9af05a', '#eaffc8', 0x8fe04a],
};
const CACHE = new Map();

function kindleGeo(el) {
  if (CACHE.has(el)) return CACHE.get(el);
  const [deep, mid, light, hot] = KINDLE_COLORS[el];
  const P = new VPart();
  // a teardrop: round belly, drawn up into a leaning point
  P.loft(0, 17, (y) => {
    const t = y / 17, r = t < 0.42 ? 5.2 * Math.sin(Math.PI * (0.18 + t / 0.42 * 0.32)) : 5.2 * Math.pow(1 - (t - 0.42) / 0.58, 1.25);
    return r < 0.45 ? null : [r, r * 0.92, -Math.pow(Math.max(0, t - 0.45), 2) * 6, -Math.pow(Math.max(0, t - 0.5), 2) * 4];
  }, (x, y, z, { u }) => {
    // facets: bands of direction around the body and up it, each one flat tone
    const band = Math.floor(((u / (Math.PI * 2)) + 1.0625) * 8) % 8, tier = y < 4 ? 0 : y < 9 ? 1 : 2;
    const lit = [3, 2, 1, 0, 0, 1, 2, 3][band] + (tier === 2 ? 1 : 0) - (tier === 0 ? 1 : 0);
    return { glow: true, c: [deep, mid, light, hot, hot][Math.max(0, Math.min(4, lit))] };
  });
  // two little licks of flame on its shoulders
  for (const sx of [-1, 1]) P.cap([sx * 4, 8, 0], [sx * 6.5, 12.5, -1], 1.6, 0.5, () => ({ glow: true, c: mid }));
  // eyes: ember-dark, set into the front facet
  const E = new VPart();
  for (const ex of [-3, 1]) for (let y = 7; y <= 9; y++) for (let x = ex; x <= ex + 1; x++) {
    let z = 9;
    while (z > 0 && !P.has(x, y, z)) z--;
    P.set(x, y, z, null); E.set(x, y, z, y === 9 && x === ex ? '#6a2a1a' : '#1e0a0c');
  }
  const out = { glow: P.geometry(VOX_PARTY, [0, 6, 0], { glowIntensity: 2.0 }).glow, eyes: E.geometry(VOX_PARTY, [0, 6, 0]).solid };
  CACHE.set(el, out);
  return out;
}

/** A little faceted flame with ember eyes that bobs beside Elio and changes element. */
export class Kindle {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'kindle';
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.mat = voxGlow();
    this.eyeMat = voxToon();
    this.meshes = {};
    for (const el of Object.keys(KINDLE_COLORS)) {
      const m = new THREE.Mesh(kindleGeo(el).glow, this.mat);
      m.visible = el === 'fire';
      this.body.add(m);
      this.meshes[el] = m;
    }
    this.eyes = new THREE.Mesh(kindleGeo('fire').eyes, this.eyeMat);
    this.body.add(this.eyes);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(0.6), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.layers.set(LAYER_FX);
    this.halo = halo;
    this.body.add(halo);
    this.light = new THREE.PointLight(KINDLE_COLORS.fire[4], 0.35, 1.6, 2);
    this.group.add(this.light);
    this.element = 'fire';
    this.t = Math.random() * 10;
    this.blink = 2;
    this.excite = 0;
    this.lightScale = 1;
  }
  setElement(e) {
    if (!KINDLE_COLORS[e]) return;
    this.element = e;
    for (const k in this.meshes) this.meshes[k].visible = k === e;
    this.halo.material.color.set(KINDLE_COLORS[e][1]).multiplyScalar(0.6);
    this.light.color.setHex(KINDLE_COLORS[e][4]);
    this.excite = 1;
  }
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.excite = Math.max(0, this.excite - dt * 1.5);
    this.body.position.y = Math.sin(t * 2.6) * 0.025;
    this.body.rotation.z = Math.sin(t * 1.7) * 0.14;
    this.body.rotation.y = Math.sin(t * 0.9) * 0.35;
    const m = this.meshes[this.element];
    // a springy flicker: stretch up as it squeezes in, with a pop when excited
    const pulse = 1 + Math.sin(t * 7) * 0.05 + this.excite * 0.25, fl = Math.sin(t * 13);
    m.scale.set(pulse * (1 - fl * 0.05), pulse * (1 + fl * 0.09), pulse * (1 - fl * 0.05));
    this.eyes.scale.copy(m.scale);
    this.halo.scale.setScalar(1 + Math.sin(t * 5) * 0.1 + this.excite * 0.4);
    this.blink -= dt;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
    // eyes close by catching the flame's colour (they sit in the flame, so they cannot squash)
    const shut = this.blink < 0.1 ? 1 : this.excite > 0.3 ? 0.45 : 0;
    this.eyeMat.emissive.set(KINDLE_COLORS[this.element][2]).multiplyScalar(shut * 0.9);
    this.light.intensity = (0.32 + Math.sin(t * 9) * 0.05 + this.excite * 0.5) * this.lightScale;
  }
}
