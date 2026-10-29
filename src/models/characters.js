// The four explorers as detailed voxel figures. Every limb is a finely voxelised part (about
// 1/50 of a body) with baked ambient occlusion, a soft bevel and per-voxel colour variation,
// hung on a skeleton of joints. Faces are never shown: Bran hides behind a leather forge mask and
// goggles, Elio's deep hood holds only darkness and two faint glints, Durgan's horned helm is
// closed, Clover's hood and scarf leave nothing but shadow. Animation is pose-blended with
// anticipation and follow-through, body-language "expressions", breathing, squash and spring
// bones (apron, robe, hood tip, braids, ears, scarf, tail, the held weapon).
import * as THREE from 'three';
import { LAYER_FX } from '../gfx/renderer.js';
import { CHARACTERS } from '../data/characters.js';
import { VPart, rgb, mix, mul, hash, ramp, voxToon, voxGlow, meshPart } from './vox_char_kit.js';
import { buildWeaponMesh } from './weapons3d.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
const outQ = (t) => 1 - (1 - t) * (1 - t);
const inQ = (t) => t * t;
const outBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** World size of one character voxel (a grown explorer is ~50 voxels tall). */
export const VS = 0.034;

// ------------------------------------------------------------------ surface recipes (voxel space)
const fabric = (cols, s = 1) => (x, y, z) => ramp(cols, 0.55 + (hash(x >> 2, y >> 2, z >> 2, s) - 0.5) * 0.1, x, y, z, s);
const leather = (cols, s = 2) => (x, y, z) => {
  const scuff = hash(x + y * 3, z - y * 2, x, s) > 0.975;
  return ramp(cols, scuff ? 0.8 : 0.5 + (hash(x >> 2, y >> 2, z >> 2, s) - 0.5) * 0.12, x, y, z, s);
};
const metal = (cols, s = 3) => (x, y, z) => ramp(cols, 0.5 + (((y + (x >> 1)) & 3) === 0 ? 0.18 : 0) + (hash(x, y, z, s) - 0.5) * 0.1, x, y, z, s);
const fur = (cols, s = 4) => (x, y, z) => ramp(cols, 0.4 + hash(x >> 1, y >> 1, z >> 1, s) * 0.3, x, y, z, s);
const mail = (cols, s = 5) => (x, y, z) => ramp(cols, ((x + y) & 1) ^ (z & 1) ? 0.72 : 0.28, x, y, z, s);
const flat = (c) => () => c;

// ------------------------------------------------------------------ springs for secondary motion
class Spring {
  constructor(k = 90, d = 9) { this.x = 0; this.v = 0; this.k = k; this.d = d; }
  step(target, dt) {
    const a = (target - this.x) * this.k - this.v * this.d;
    this.v += a * dt;
    this.x += this.v * dt;
    if (!isFinite(this.x)) { this.x = 0; this.v = 0; }
    return this.x;
  }
}

/** Mesh cache: voxel geometry per explorer part, shared between builds of the same explorer. */
const GEO_CACHE = new Map();

// ------------------------------------------------------------------ Kindle, Elio's elemental buddy
const KINDLE_COLORS = {
  fire: ['#ff5a1a', '#ffb43a', '#fff0a0', 0xff8a3a],
  ice: ['#2a9ad8', '#7fe3ff', '#e6fbff', 0x7fe3ff],
  shock: ['#d8a010', '#ffe74a', '#fffbd8', 0xffe74a],
  poison: ['#3a9a2a', '#8fe04a', '#e6ffc0', 0x8fe04a],
};
const KVS = 0.0135;
function kindleGeo(el) {
  const key = 'kindle|' + el;
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key);
  const [a, b, c] = KINDLE_COLORS[el];
  const P = new VPart();
  // a voxel flame: fat round belly, three licking tongues on top
  P.loft(0, 9, (y) => { const r = 3.6 * Math.sin(Math.PI * (y + 1.5) / 11) + 0.4; return [r, r * 0.92]; }, (x, y, z, { d }) => ({ glow: true, c: d < 0.35 ? c : d < 0.7 ? b : a }));
  for (const [tx, h, tz] of [[0, 7, 0], [-2.2, 4, 0.6], [2.1, 5, -0.4]]) P.cap([tx, 7.5, tz], [tx * 1.2, 7.5 + h, tz - 0.6], 1.6, 0.35, () => ({ glow: true, c: b }));
  P.cap([0, 8.5, 0], [0, 12, -0.5], 0.9, 0.3, () => ({ glow: true, c }));
  const g = P.geometry(KVS, [0, 4, 0], { glowIntensity: 2.1 });
  // eyes: two ember-dark voxels
  const E = new VPart();
  E.set(-2, 4, 3, '#2a0c10'); E.set(1, 4, 3, '#2a0c10'); E.set(-2, 5, 3, '#3a1418'); E.set(1, 5, 3, '#3a1418');
  const e = E.geometry(KVS, [0, 4, 0]);
  const out = { glow: g.glow, eyes: e.solid };
  GEO_CACHE.set(key, out);
  return out;
}
/** A little voxel flame with ember eyes that bobs beside Elio and changes element. */
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
      const g = kindleGeo(el);
      const m = new THREE.Mesh(g.glow, this.mat);
      m.visible = el === 'fire';
      this.body.add(m);
      this.meshes[el] = m;
    }
    this.eyes = new THREE.Mesh(kindleGeo('fire').eyes, this.eyeMat);
    this.body.add(this.eyes);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(0.6), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.layers.set(LAYER_FX);
    this.halo = halo;
    this.body.add(halo);
    this.light = new THREE.PointLight(KINDLE_COLORS.fire[3], 0.35, 1.6, 2);
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
    this.halo.material.color.set(KINDLE_COLORS[e][0]).multiplyScalar(0.6);
    this.light.color.setHex(KINDLE_COLORS[e][3]);
    this.excite = 1;
  }
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.excite = Math.max(0, this.excite - dt * 1.5);
    this.body.position.y = Math.sin(t * 2.6) * 0.03;
    this.body.rotation.z = Math.sin(t * 1.7) * 0.12;
    this.body.rotation.y = Math.sin(t * 0.9) * 0.35;
    const m = this.meshes[this.element];
    const pulse = 1 + Math.sin(t * 7) * 0.05 + this.excite * 0.25;
    m.scale.set(pulse * (1 - Math.sin(t * 13) * 0.04), pulse * (1 + Math.sin(t * 13) * 0.08), pulse);
    this.halo.scale.setScalar(1 + Math.sin(t * 5) * 0.1 + this.excite * 0.4);
    this.blink -= dt;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
    this.eyes.scale.y = this.blink < 0.1 ? 0.2 : this.excite > 0.3 ? 0.6 : 1;
    this.light.intensity = (0.32 + Math.sin(t * 9) * 0.05 + this.excite * 0.5) * this.lightScale;
  }
}

// ------------------------------------------------------------------ animation library
// Pose channels (radians / metres). Arms: sh=forward swing, ab=abduct, tw=twist, el=elbow bend.
// Legs: hip=forward, hab=abduct, kn=knee bend, ft=toe point. Spine: lean/twist/side. Head: nod/turn/tilt.
const CH = ['dy', 'bx', 'by', 'bz', 'hrx', 'hry', 'hrz', 'lean', 'twist', 'side', 'nod', 'turn', 'tilt',
  'lSh', 'lAb', 'lTw', 'lEl', 'rSh', 'rAb', 'rTw', 'rEl', 'lHip', 'lHab', 'lKn', 'lFt', 'rHip', 'rHab', 'rKn', 'rFt', 'ears', 'squash'];
const REST = { lAb: 0.14, rAb: 0.14, lEl: 0.18, rEl: 0.18 };

/** Seated leg pose (merged when character.seated is true). */
function sitLegs(c) {
  const d = c.dims, drop = c.seatH - d.hipH, hip = 1.45;
  const reach = c.seatH - d.footH;
  const phi = reach < d.legLo ? Math.acos(Math.max(0, reach) / d.legLo) : 0; // shin angles forward so the feet stay planted
  return { dy: drop, lHip: hip, rHip: hip, lKn: hip - phi, rKn: hip - phi, lHab: 0.12, rHab: 0.12, lFt: phi, rFt: phi };
}

const ANIMS = {
  idle: {
    loop: true, f: (t, c) => {
      const b = Math.sin(t * 2.1);
      const p = { dy: b * 0.006, lean: 0.02, lAb: 0.15 + b * 0.02, rAb: 0.15 + b * 0.02, lEl: 0.2, rEl: 0.2, nod: Math.sin(t * 0.7) * 0.04, turn: Math.sin(t * 0.37) * 0.15, tilt: Math.sin(t * 0.5) * 0.04 };
      if (c.id === 'bran') Object.assign(p, { lAb: 0.72, rAb: 0.72, lEl: 1.75, rEl: 1.75, lTw: -2.0, rTw: -2.0, lean: -0.05, nod: -0.04 + Math.sin(t * 0.7) * 0.03 }); // hands on hips, proud
      if (c.id === 'elio') Object.assign(p, { lSh: 0.3, rSh: 0.3, lEl: 0.55, rEl: 0.55, lAb: -0.02, rAb: -0.02, lTw: 0.3, rTw: 0.3, nod: 0.05 + Math.sin(t * 0.7) * 0.04, tilt: Math.sin(t * 0.5) * 0.08 }); // sleeves together
      if (c.id === 'durgan') Object.assign(p, { lSh: 0.7, rSh: 0.62, lEl: 1.95, rEl: 1.95, lAb: 0.1, rAb: 0.1, lTw: -1.35, rTw: -1.35, lean: -0.08, lHab: 0.14, rHab: 0.14, nod: -0.05 }); // arms crossed
      if (c.id === 'clover') {
        const hop = Math.max(0, Math.sin(t * 3.4));
        Object.assign(p, { dy: hop * 0.015, lHip: Math.sin(t * 1.7) * 0.06, rHip: -Math.sin(t * 1.7) * 0.06, side: Math.sin(t * 1.7) * 0.05, rAb: 0.62, rEl: 1.75, rTw: -2.0, tilt: 0.12 + Math.sin(t * 0.8) * 0.05, ears: Math.sin(t * 5) > 0.95 ? 1 : 0 });
      }
      return p;
    },
  },
  idleCombat: {
    loop: true, expr: 'determined', f: (t, c) => {
      const b = Math.sin(t * (c.id === 'clover' ? 7 : 4));
      return { dy: -0.04 + b * 0.01, lean: 0.12, twist: 0.25, lHip: 0.25, rHip: -0.2, lKn: 0.35, rKn: 0.25, lHab: 0.08, rHab: 0.1, rSh: 0.75, rEl: 0.8, rAb: 0.25, lSh: 0.6, lEl: 1.3, lAb: 0.15, nod: 0.05, turn: -0.15 };
    },
  },
  sit: { loop: true, f: (t, c) => ({ ...sitLegs(c), lean: 0.08, lSh: 0.45, rSh: 0.45, lEl: 0.7, rEl: 0.7, lAb: 0.05, rAb: 0.05, nod: Math.sin(t * 0.6) * 0.05, dy: sitLegs(c).dy + Math.sin(t * 2) * 0.004, turn: Math.sin(t * 0.3) * 0.2 }) },
  sitTalk: {
    loop: true, f: (t, c) => {
      const g = Math.sin(t * 2.7), g2 = Math.sin(t * 1.3);
      return { ...sitLegs(c), lean: 0.06 + g2 * 0.04, twist: g2 * 0.12, lSh: 0.45, lEl: 0.7, rSh: 0.9 + g * 0.35, rEl: 1.1 + g * 0.3, rAb: 0.2 + Math.max(0, g) * 0.3, rTw: g * 0.3, nod: Math.sin(t * 5.4) * 0.07, tilt: g2 * 0.1, turn: g2 * 0.2 };
    },
  },
  walk: {
    loop: true, f: (t, c) => {
      const per = c.id === 'durgan' ? 0.42 : c.id === 'bran' ? 0.6 : 0.52;
      const p = (t / per) * Math.PI;
      const s = Math.sin(p), co = Math.cos(p);
      const amp = c.id === 'durgan' ? 0.7 : 0.55;
      const r = {
        dy: -Math.abs(s) * 0.03 + 0.012, lean: 0.07, lHip: s * amp, rHip: -s * amp,
        lKn: 0.12 + Math.max(0, co) * 0.85, rKn: 0.12 + Math.max(0, -co) * 0.85,
        lSh: -s * 0.5, rSh: s * 0.5, lEl: 0.35, rEl: 0.35, lAb: 0.15, rAb: 0.15, hry: s * 0.08, twist: -s * 0.1, nod: 0.02, side: s * 0.03,
      };
      if (c.id === 'durgan') { r.side = s * 0.09; r.hrz = s * 0.06; } // waddle
      if (c.id === 'clover') { r.dy += Math.abs(s) * 0.02; r.rAb = 0.5; r.rEl = 1.5; r.rSh = 0.2; }
      if (c.id === 'elio') { r.lSh = 0.5 - s * 0.2; r.rSh = 0.5 + s * 0.2; r.lEl = 1.0; r.rEl = 1.0; r.lAb = -0.1; r.rAb = -0.1; }
      return r;
    },
  },
  run: {
    loop: true, lambda: 22, f: (t, c) => {
      const per = c.id === 'durgan' ? 0.26 : 0.32;
      const p = (t / per) * Math.PI;
      const s = Math.sin(p), co = Math.cos(p);
      return {
        dy: Math.abs(co) * 0.05 - 0.02, lean: 0.3, lHip: s * 0.9, rHip: -s * 0.9,
        lKn: 0.3 + Math.max(0, co) * 1.4, rKn: 0.3 + Math.max(0, -co) * 1.4,
        lSh: -s * 0.95, rSh: s * 0.95, lEl: 1.3, rEl: 1.3, lAb: 0.2, rAb: 0.2, nod: -0.1, twist: -s * 0.15,
      };
    },
  },
  jump: {
    dur: 0.9, lambda: 26, expr: 'surprised', f: (t, c, k) => {
      const crouch = seg(k, 0, 0.22) * (1 - seg(k, 0.22, 0.32));
      const air = seg(k, 0.25, 0.8);
      const h = Math.sin(air * Math.PI) * 0.5;
      const land = seg(k, 0.8, 0.88) * (1 - seg(k, 0.88, 1));
      return { squash: crouch * 0.9 + land * 1.2 - (air > 0 && air < 0.5 ? 0.5 : 0), by: h, dy: -crouch * 0.14 - land * 0.1, lKn: crouch * 1.3 + (air > 0 && air < 1 ? 0.9 : 0) + land, rKn: crouch * 1.3 + (air > 0 && air < 1 ? 0.6 : 0) + land, lHip: crouch * 0.8 + air * 0.4, rHip: crouch * 0.8 + air * 0.2, lSh: air > 0 && air < 1 ? 2.6 : -crouch * 0.6, rSh: air > 0 && air < 1 ? 2.6 : -crouch * 0.6, lAb: 0.4, rAb: 0.4, lean: crouch * 0.4 - air * 0.1, nod: -air * 0.2 };
    },
  },
  fall: {
    loop: true, lambda: 20, expr: 'surprised', f: (t) => {
      const w = Math.sin(t * 18), w2 = Math.cos(t * 15);
      return { lSh: 2.6 + w * 0.4, rSh: 2.6 - w * 0.4, lAb: 0.6 + w2 * 0.3, rAb: 0.6 - w2 * 0.3, lEl: 0.5, rEl: 0.5, lHip: 0.6 + w * 0.5, rHip: 0.6 - w * 0.5, lKn: 0.9, rKn: 0.9, lean: -0.2, nod: -0.3 };
    },
  },
  hammer: {
    loop: true, lambda: 30, period: 1.05, impact: 0.66, f: (t, c) => {
      const k = (t % 1.05) / 1.05;
      const up = sm(seg(k, 0.02, 0.55));
      const down = inQ(seg(k, 0.55, 0.66));
      const v = up * (1 - down);
      const bounce = Math.sin(seg(k, 0.66, 0.85) * Math.PI) * 0.12;
      return {
        rSh: 0.95 + v * 1.95 + bounce, rEl: 0.35 + v * 0.9, rAb: 0.15, lSh: 0.95, lEl: 0.75, lAb: -0.05,
        lean: 0.22 - v * 0.28 + down * 0.05, twist: -0.15 + v * 0.1, nod: 0.3 - v * 0.2, dy: -0.02 - (1 - v) * 0.02, lHip: 0.2, rHip: -0.15, lKn: 0.2, rKn: 0.15,
      };
    },
  },
  mine: {
    loop: true, lambda: 30, period: 1.1, impact: 0.62, f: (t) => {
      const k = (t % 1.1) / 1.1;
      const up = sm(seg(k, 0.02, 0.5));
      const down = inQ(seg(k, 0.5, 0.62));
      const v = up * (1 - down);
      return {
        rSh: 0.6 + v * 2.3, lSh: 0.5 + v * 2.2, rEl: 0.3 + v * 0.7, lEl: 0.5 + v * 0.7, rAb: -0.1, lAb: -0.25,
        lean: 0.28 - v * 0.38, dy: -0.04 + v * 0.02, lHip: 0.3, rHip: -0.2, lKn: 0.35, rKn: 0.25, nod: 0.2 - v * 0.25,
      };
    },
  },
  read: {
    loop: true, prop: 'book', f: (t, c) => {
      const flip = Math.max(0, Math.sin(t * 0.9)) > 0.97 ? 1 : 0;
      return { lean: 0.12, lSh: 1.05, rSh: 1.0, lEl: 1.25, rEl: 1.2 + flip * 0.3, lAb: -0.2, rAb: -0.2 + flip * 0.3, nod: 0.4 + Math.sin(t * 0.6) * 0.04, turn: Math.sin(t * 0.8) * 0.12, tilt: 0.08 };
    },
  },
  argue: {
    loop: true, lambda: 22, expr: 'angry', f: (t, c) => {
      const g = Math.sin(t * 7), h = Math.sin(t * 3.5);
      if (c.id === 'clover') return { lean: -0.05 + h * 0.03, tilt: 0.2, lAb: 0.62, rAb: 0.62, lEl: 1.75, rEl: 1.75, lTw: -2.0, rTw: -2.0, nod: -0.1 + g * 0.05, dy: Math.max(0, g) * 0.02, turn: 0.2 };
      return { lean: 0.22 + h * 0.06, rSh: 1.3 + g * 0.35, rEl: 0.9 + g * 0.4, rAb: 0.1, lAb: 0.65, lEl: 1.75, lTw: -2.0, nod: 0.05 + Math.sin(t * 9) * 0.08, dy: Math.max(0, g) * 0.01, turn: -0.1 };
    },
  },
  cheer: {
    loop: true, lambda: 22, expr: 'happy', f: (t) => {
      const g = Math.sin(t * 9);
      return { by: Math.max(0, Math.sin(t * 9)) * 0.12, lSh: 2.8 + g * 0.2, rSh: 2.8 - g * 0.2, lAb: 0.35, rAb: 0.35, lEl: 0.25, rEl: 0.25, lean: -0.1, nod: -0.2, lKn: Math.max(0, -g) * 0.4, rKn: Math.max(0, -g) * 0.4 };
    },
  },
  wave: {
    loop: true, expr: 'happy', f: (t) => {
      const g = Math.sin(t * 9);
      return { rSh: 2.4, rAb: 0.5, rEl: 0.6 + g * 0.45, rTw: g * 0.2, tilt: 0.15, side: -0.05 };
    },
  },
  point: { loop: true, f: (t) => ({ rSh: 1.55, rAb: 0.05, rEl: 0.05, lean: 0.08, nod: -0.05, lAb: 0.2, dy: Math.sin(t * 2) * 0.004 }) },
  laugh: {
    loop: true, lambda: 24, expr: 'happy', f: (t) => {
      const g = Math.sin(t * 22);
      return { lean: -0.18 + g * 0.02, nod: -0.25, dy: g * 0.008, lSh: 0.7, lEl: 1.5, lAb: -0.2, rSh: 0.3, rAb: 0.3, rEl: 0.6, tilt: Math.sin(t * 3) * 0.1 };
    },
  },
  shrug: { loop: true, expr: 'smug', f: (t) => ({ lAb: 0.45, rAb: 0.45, lEl: 1.5, rEl: 1.5, lTw: 1.4, rTw: 1.4, dy: 0.012, tilt: 0.2, nod: -0.05 }) },
  sleep: {
    loop: true, expr: 'sleepy', f: (t) => {
      const br = Math.sin(t * 1.2);
      return { lean: 0.32 + br * 0.02, nod: 0.55 + br * 0.03, tilt: 0.25, lSh: 0.25, rSh: 0.25, lEl: 0.5, rEl: 0.5, lAb: 0.05, rAb: 0.05, dy: br * 0.004 };
    },
  },
  slash: {
    dur: 0.55, impact: 0.42, lambda: 34, expr: 'determined', f: (t, c, k) => {
      const wind = sm(seg(k, 0, 0.32));
      const hit = outQ(seg(k, 0.32, 0.45));
      const rec = seg(k, 0.6, 1);
      const a = wind * (1 - hit), b = hit * (1 - rec);
      return {
        rSh: 0.7 + a * 1.9 + b * 0.2, rAb: 0.3 + a * 0.7 - b * 0.9, rEl: 0.8 - a * 0.2 - b * 0.6, rTw: -b * 0.6,
        twist: -a * 0.45 + b * 0.55, lean: 0.1 + b * 0.25, lSh: 0.5, lEl: 1.2, lAb: 0.3, dy: -0.03 - b * 0.04,
        lHip: 0.3 + b * 0.25, rHip: -0.25, lKn: 0.35 + b * 0.25, rKn: 0.25, nod: 0.05, turn: -0.15,
      };
    },
  },
  stab: {
    dur: 0.45, impact: 0.38, lambda: 36, expr: 'determined', f: (t, c, k) => {
      const wind = sm(seg(k, 0, 0.28));
      const hit = outQ(seg(k, 0.28, 0.4));
      const rec = seg(k, 0.55, 1);
      const a = wind * (1 - hit), b = hit * (1 - rec);
      return {
        rSh: 0.6 - a * 0.7 + b * 1.0, rEl: 0.9 + a * 0.9 - b * 0.9, rAb: 0.2, twist: -a * 0.3 + b * 0.35, lean: 0.1 - a * 0.05 + b * 0.35,
        bz: b * 0.12, lHip: 0.3 + b * 0.5, lKn: 0.3 + b * 0.4, rHip: -0.3, rKn: 0.2, lSh: 0.3, lAb: 0.4, lEl: 0.8, dy: -0.03 - b * 0.06,
      };
    },
  },
  chop: {
    dur: 0.65, impact: 0.52, lambda: 32, expr: 'angry', f: (t, c, k) => {
      const wind = sm(seg(k, 0, 0.4));
      const hit = inQ(seg(k, 0.4, 0.52));
      const rec = seg(k, 0.68, 1);
      const a = wind * (1 - hit), b = hit * (1 - rec);
      return {
        rSh: 0.7 + a * 2.2 - b * 0.1, lSh: 0.6 + a * 2.1, rEl: 0.6 + a * 0.6 - b * 0.4, lEl: 0.8 + a * 0.5, rAb: -0.05, lAb: -0.25,
        lean: 0.1 - a * 0.3 + b * 0.45, dy: -0.03 + a * 0.02 - b * 0.07, lHip: 0.3, rHip: -0.25, lKn: 0.3 + b * 0.4, rKn: 0.2 + b * 0.3, nod: -a * 0.2 + b * 0.25,
      };
    },
  },
  smash: {
    dur: 0.8, impact: 0.6, lambda: 30, expr: 'angry', f: (t, c, k) => {
      const wind = sm(seg(k, 0, 0.48));
      const hit = inQ(seg(k, 0.48, 0.6));
      const rec = seg(k, 0.75, 1);
      const a = wind * (1 - hit), b = hit * (1 - rec);
      return {
        by: a * 0.08, rSh: 0.6 + a * 2.6 - b * 0.2, lSh: 0.6 + a * 2.5 - b * 0.2, rEl: 0.5 + a * 0.9 - b * 0.4, lEl: 0.6 + a * 0.9, rAb: -0.1, lAb: -0.2,
        lean: -a * 0.35 + b * 0.6, dy: -b * 0.14, lHip: 0.3 + b * 0.4, rHip: -0.3, lKn: 0.4 + b * 0.8, rKn: 0.3 + b * 0.6, nod: -a * 0.3 + b * 0.3, squash: b,
      };
    },
  },
  cast: {
    dur: 0.7, impact: 0.5, lambda: 26, expr: 'determined', f: (t, c, k) => {
      const ch = sm(seg(k, 0, 0.42));
      const rel = outQ(seg(k, 0.42, 0.55));
      const rec = seg(k, 0.7, 1);
      const a = ch * (1 - rel), b = rel * (1 - rec);
      return {
        lSh: 0.6 - a * 0.4 + b * 1.1, rSh: 0.6 - a * 0.4 + b * 1.1, lEl: 1.4 * a + 0.3 * (1 - a), rEl: 1.4 * a + 0.3 * (1 - a), lAb: 0.5 * a + 0.25 * b, rAb: 0.5 * a + 0.25 * b,
        lean: -a * 0.15 + b * 0.25, nod: -a * 0.2, by: a * 0.03, lHip: 0.2, lKn: 0.2,
      };
    },
  },
  block: {
    loop: true, lambda: 40, expr: 'determined', f: (t) => ({ rSh: 1.35, rEl: 1.3, rAb: -0.45, rTw: 0.3, lSh: 1.25, lEl: 1.4, lAb: -0.25, lean: 0.05, dy: -0.06, lHip: 0.35, rHip: -0.3, lKn: 0.45, rKn: 0.35, nod: 0.12 }),
  },
  parry: {
    dur: 0.35, lambda: 44, expr: 'determined', f: (t, c, k) => {
      const a = outBack(seg(k, 0, 0.35)) * (1 - seg(k, 0.6, 1));
      return { rSh: 1.2 + a * 0.6, rAb: -0.5 + a * 1.2, rEl: 0.8 - a * 0.5, twist: 0.3 - a * 0.6, lean: -0.05, dy: -0.04, lHip: 0.3, lKn: 0.35, rKn: 0.25, lSh: 0.5, lEl: 1.2 };
    },
  },
  hurt: {
    dur: 0.42, lambda: 40, expr: 'hurt', f: (t, c, k) => {
      const a = outQ(seg(k, 0, 0.2)) * (1 - seg(k, 0.4, 1));
      return { squash: a * 0.7, bz: -a * 0.12, lean: -a * 0.45, nod: -a * 0.35, tilt: a * 0.2, lSh: a * 0.9, rSh: a * 0.7, lAb: 0.3 + a * 0.4, rAb: 0.3 + a * 0.5, lEl: 0.6, rEl: 0.6, dy: -a * 0.03, lKn: a * 0.2, rKn: a * 0.3 };
    },
  },
  dodge: {
    dur: 0.5, lambda: 36, expr: 'surprised', f: (t, c, k) => {
      const a = Math.sin(seg(k, 0, 1) * Math.PI);
      return { squash: a * 0.5, bz: -a * 0.45, by: a * 0.12, lean: a * 0.3, lKn: a * 0.9, rKn: a * 1.1, lHip: a * 0.6, rHip: a * 0.3, lSh: -a * 0.4, rSh: -a * 0.4, lAb: 0.5, rAb: 0.5, nod: a * 0.1 };
    },
  },
  victory: {
    loop: true, lambda: 18, expr: 'happy', f: (t, c) => {
      const b = Math.sin(t * 3);
      const p = { rSh: 2.85, rEl: 0.15, rAb: 0.2, lAb: 0.68, lEl: 1.75, lTw: -2.0, lean: -0.12, nod: -0.15, dy: b * 0.008 };
      if (c.id === 'clover') Object.assign(p, { by: Math.max(0, Math.sin(t * 6)) * 0.08, lSh: 2.6, lAb: 0.4, lEl: 0.3, lTw: 0 });
      if (c.id === 'elio') Object.assign(p, { lSh: 2.7, lEl: 0.2, lAb: 0.3, lTw: 0 });
      return p;
    },
  },
  defeat: {
    loop: true, lambda: 8, expr: 'sad', f: (t, c) => {
      const br = Math.sin(t * 1.4);
      return { dy: -c.dims.hipH * 0.45, lHip: 1.3, lKn: 2.2, rHip: 0.4, rKn: 2.4, rFt: 0.6, lean: 0.4 + br * 0.02, nod: 0.5, lSh: 0.2, rSh: 0.2, lEl: 0.3, rEl: 0.3, lAb: 0.1, rAb: 0.1 };
    },
  },
  harvest: {
    loop: true, lambda: 28, expr: 'determined', period: 0.7, impact: 0.5, f: (t, c) => {
      const k = (t % 0.7) / 0.7;
      const s = Math.sin(k * TAU);
      return { dy: -c.dims.hipH * 0.3, lHip: 1.0, lKn: 1.5, rHip: 0.5, rKn: 1.6, lean: 0.45, rSh: 1.0 + s * 0.35, rEl: 0.7 - s * 0.4, rAb: 0.1 + s * 0.15, lSh: 1.1, lEl: 0.6, lAb: -0.1, nod: 0.45 };
    },
  },
  forge: {
    loop: true, lambda: 22, period: 0.9, f: (t) => {
      const k = (t % 0.9) / 0.9;
      const push = Math.sin(k * TAU) * 0.5 + 0.5;
      return { lean: 0.25 + push * 0.1, lSh: 1.1 - push * 0.3, rSh: 1.1 - push * 0.3, lEl: 0.9 - push * 0.6, rEl: 0.9 - push * 0.6, lAb: -0.1, rAb: -0.1, dy: -0.03 - push * 0.03, lKn: 0.3 + push * 0.15, rKn: 0.3 + push * 0.15, lHip: 0.3, rHip: 0.2, nod: 0.2 };
    },
  },
};
export const ANIM_INFO = Object.fromEntries(Object.entries(ANIMS).map(([k, v]) => [k, { dur: v.dur || v.period || 0, impact: v.impact ?? 0.5, loop: !!v.loop }]));
export const ANIM_NAMES = Object.keys(ANIMS);
const SEATED_OK = new Set(['sit', 'sitTalk', 'read', 'argue', 'laugh', 'sleep', 'idle', 'wave', 'point', 'shrug', 'cheer', 'hammer']);


// Body language stands in for faces: each mood leans, tilts and settles the figure a little.
const EXPR_POSE = {
  neutral: {},
  happy: { nod: -0.1, lean: -0.05, dy: 0.006, ears: 0.4 },
  angry: { lean: 0.12, nod: 0.1, lAb: 0.22, rAb: 0.22, ears: -0.6 },
  surprised: { lean: -0.12, nod: -0.16, lAb: 0.3, rAb: 0.3, dy: 0.008, ears: 1 },
  sad: { nod: 0.3, lean: 0.14, dy: -0.012, lAb: -0.05, rAb: -0.05, ears: -1 },
  smug: { tilt: 0.16, nod: -0.07, lean: -0.04 },
  determined: { lean: 0.07, nod: 0.07 },
  hurt: { lean: 0.1, nod: 0.2, tilt: -0.12, ears: -0.8 },
  sleepy: { nod: 0.34, tilt: 0.15, ears: -0.5 },
};

// ------------------------------------------------------------------ Character
export class Character {
  constructor(id) {
    this.id = id;
    this.def = CHARACTERS[id];
    this.group = new THREE.Group();
    this.group.name = 'char_' + id;
    this.mat = voxToon();
    this.glowMat = voxGlow();
    this.mats = { all: [this.mat] };
    this.rig = {};
    this.pose = {};
    for (const k of CH) this.pose[k] = REST[k] || 0;
    this.exprPose = {};
    this.time = Math.random() * 10;
    this.animT = 0;
    this.anim = 'idle';
    this.loopAnim = 'idle';
    this.animOpts = {};
    this.seated = false;
    this.seatH = 0.36;
    this.expr = 'neutral';
    this.exprLock = 0;
    this.springs = [];
    this.props = {};
    this.held = { right: null, left: null };
    this.look = null;
    this.lookYaw = 0; this.lookPitch = 0;
    this.kindle = null;
    this.flashT = 0;
    this.partN = 0;
    this._wp = new THREE.Vector3(); this._prevWp = null; this.vel = new THREE.Vector3(); this.velLocal = new THREE.Vector3();
    this._prevSh = 0; this.swing = new Spring(60, 9);
    BUILD[id](this);
    this.applyPose(this.pose);
    this.group.traverse((o) => { o.userData.character = this; });
  }

  // ---------------------------------------------------------- skeleton & parts
  joint(parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
  /** Skeleton from proportions in voxels. */
  rigFrom(v) {
    const d = {};
    for (const k in v) d[k] = v[k] * VS;
    d.hipH = (v.footH + v.legLo + v.legUp) * VS;
    this.dims = d;
    const R = this.rig, J = (p, x, y, z) => this.joint(p, x, y, z);
    R.body = J(this.group);
    R.hips = J(R.body, 0, d.hipH, 0);
    R.spine = J(R.hips, 0, VS, 0);
    R.neck = J(R.spine, 0, d.torsoH, 0);
    R.head = J(R.neck, 0, d.neckH, 0);
    R.shL = J(R.spine, d.shX, d.shY, 0);
    R.shR = J(R.spine, -d.shX, d.shY, 0);
    R.shL.rotation.order = 'XZY'; R.shR.rotation.order = 'XZY';
    R.elL = J(R.shL, 0, -d.armUp, 0);
    R.elR = J(R.shR, 0, -d.armUp, 0);
    R.handL = J(R.elL, 0, -d.armLo, 0);
    R.handR = J(R.elR, 0, -d.armLo, 0);
    R.hipL = J(R.hips, d.hipX, 0, 0);
    R.hipR = J(R.hips, -d.hipX, 0, 0);
    R.knL = J(R.hipL, 0, -d.legUp, 0);
    R.knR = J(R.hipR, 0, -d.legUp, 0);
    R.ftL = J(R.knL, 0, -d.legLo, 0);
    R.ftR = J(R.knR, 0, -d.legLo, 0);
    for (const side of ['L', 'R']) {
      const m = J(R['hand' + side], 0, -VS * 1.6, VS * 0.4);
      m.rotation.set(Math.PI / 2 - 0.55, 0, 0);
      R['mount' + side] = m;
    }
  }
  /** Paint a voxel part (voxel units around the joint) and hang it on the joint. Cached per explorer. */
  part(joint, paint, o = {}) {
    const key = this.id + '|' + this.partN++;
    let g = GEO_CACHE.get(key);
    if (!g) {
      const P = new VPart();
      paint(P);
      g = P.geometry(VS, o.offset || [0, 0, 0], { glowIntensity: o.glow ?? 2.6 });
      GEO_CACHE.set(key, g);
    }
    const grp = new THREE.Group();
    if (g.solid) { const m = new THREE.Mesh(g.solid, this.mat); m.castShadow = true; m.receiveShadow = false; grp.add(m); } // no self-shadow acne on voxel faces
    if (g.glow) { const m = new THREE.Mesh(g.glow, this.glowMat); m.castShadow = false; grp.add(m); }
    joint.add(grp);
    return grp;
  }
  /** Voxel → world helper for joint offsets. */
  v(x, y, z) { return [x * VS, y * VS, z * VS]; }
  addSpring(obj, axis, opts) {
    const s = { obj, axis, base: opts.base ?? obj.rotation[axis], gain: opts.gain ?? 0.6, src: opts.src || 'vz', sp: new Spring(opts.k ?? 80, opts.d ?? 8), wobble: opts.wobble || 0, phase: opts.phase || 0, min: opts.min ?? -2, max: opts.max ?? 2, extra: opts.extra };
    s.sp.x = s.base;
    this.springs.push(s);
    return s;
  }
  backWeapon(parent, w, p, r, s = 1) {
    const j = this.joint(parent, ...p);
    j.rotation.set(...r);
    const m = buildWeaponMesh(w);
    m.scale.setScalar(s);
    j.add(m);
    return j;
  }

  // ---------------------------------------------------------- API
  play(name, opts = {}) {
    const a = ANIMS[name];
    if (!a) return;
    if (a.loop) this.loopAnim = name;
    if (this.anim === name && a.loop && !opts.restart) { this.animOpts = { ...this.animOpts, ...opts }; return; }
    this.anim = name;
    this.animT = 0;
    this.animOpts = opts;
    if (a.expr && opts.expr !== false && this.exprLock <= 0) this.setExpression(a.expr, { auto: true });
    if (!a.expr && opts.expr === undefined && this._autoExpr) this.setExpression('neutral', { auto: true });
    for (const k in this.props) this.props[k].visible = a.prop === k;
  }
  /** Seconds from start of a one-shot anim until its impact frame. */
  impactTime(name) { const a = ANIMS[name]; return a ? (a.dur || a.period || 0.5) * (a.impact ?? 0.5) / (this.animOpts.speed || 1) : 0; }
  /** No faces: a mood becomes posture (and Elio's glints, Clover's ears). */
  setExpression(e, opts = {}) {
    this.expr = EXPR_POSE[e] ? e : 'neutral';
    this._autoExpr = !!opts.auto;
    if (opts.hold) this.exprLock = opts.hold;
    this.onExpression && this.onExpression(this.expr);
  }
  setSeated(b, seatH) { this.seated = b; if (seatH !== undefined) this.seatH = seatH; }
  hold(mesh, hand = 'right') {
    const mount = hand === 'left' ? this.rig.mountL : this.rig.mountR;
    const prev = this.held[hand];
    if (prev && prev.parent === mount) mount.remove(prev);
    this.held[hand] = mesh || null;
    if (mesh) { mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mount.add(mesh); }
    return prev;
  }
  showBackItem(b) { if (this.backItem) this.backItem.visible = b; }
  lookAt(v) { this.look = v ? v.clone() : null; }
  headPos(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld(true);
    this.rig.head.getWorldPosition(out);
    out.y += this.headTop || 0.35;
    return out;
  }
  setVisible(b) { this.group.visible = b; }
  flash(color = '#ffffff', t = 0.12) {
    this.flashT = t; this.flashDur = t;
    this.flashColor = new THREE.Color(color);
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.animT += dt * (this.animOpts.speed || 1);
    const a = ANIMS[this.anim];
    let target;
    if (a.dur) {
      const k = this.animT / a.dur;
      if (k >= 1) {
        const cb = this.animOpts.onDone;
        const next = this.animOpts.then || this.loopAnim;
        this.play(next === this.anim ? 'idle' : next);
        cb && cb();
        return this.update(0);
      }
      target = a.f(this.animT, this, k);
    } else target = a.f(this.animT, this, 0);
    const T = {};
    for (const k of CH) T[k] = REST[k] || 0;
    Object.assign(T, target);
    if (this.seated && SEATED_OK.has(this.anim)) { const sl = sitLegs(this); Object.assign(T, sl, { dy: sl.dy + (target.dy || 0) * 0.3 }); }
    // mood as posture, eased in and out
    const ex = EXPR_POSE[this.expr] || {};
    const ef = 1 - Math.exp(-6 * dt);
    for (const k of ['nod', 'lean', 'tilt', 'dy', 'lAb', 'rAb', 'ears']) {
      this.exprPose[k] = lerp(this.exprPose[k] || 0, ex[k] || 0, ef);
      T[k] += this.exprPose[k] * (k === 'lAb' || k === 'rAb' ? (target[k] === undefined ? 1 : 0.3) : 1);
    }
    if (this.look) {
      this.group.updateMatrixWorld(true);
      const hp = this.rig.neck.getWorldPosition(this._wp);
      const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
      const lp = this.look.clone().applyMatrix4(inv), hl = hp.clone().applyMatrix4(inv);
      const dx = lp.x - hl.x, dy = lp.y - hl.y, dz = lp.z - hl.z;
      this.lookYaw = lerp(this.lookYaw, clamp(Math.atan2(dx, dz), -1.1, 1.1), 1 - Math.exp(-8 * dt));
      this.lookPitch = lerp(this.lookPitch, clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.5), 1 - Math.exp(-8 * dt));
    } else {
      this.lookYaw = lerp(this.lookYaw, 0, 1 - Math.exp(-6 * dt));
      this.lookPitch = lerp(this.lookPitch, 0, 1 - Math.exp(-6 * dt));
    }
    T.turn += this.lookYaw * 0.75; T.twist += this.lookYaw * 0.2; T.nod += this.lookPitch * 0.8;
    const lam = a.lambda || 14;
    const f = 1 - Math.exp(-lam * dt);
    for (const k of CH) this.pose[k] += (T[k] - this.pose[k]) * f;
    this.applyPose(this.pose);
    if (this.exprLock > 0) this.exprLock -= dt;

    // follow-through: the held weapon trails the swing a beat, then snaps past
    if (dt > 0) {
      const w = (this.pose.rSh - this._prevSh) / dt;
      this._prevSh = this.pose.rSh;
      const lag = this.swing.step(clamp(-w * 0.035, -0.5, 0.5), dt);
      if (this.rig.mountR) this.rig.mountR.rotation.x = Math.PI / 2 - 0.55 + lag;
    }

    this.group.updateMatrixWorld(true);
    this.rig.neck.getWorldPosition(this._wp);
    if (this._prevWp && dt > 0) {
      const v = this._wp.clone().sub(this._prevWp).divideScalar(dt);
      this.vel.lerp(v, 1 - Math.exp(-14 * dt));
    }
    this._prevWp = this._wp.clone();
    const q = new THREE.Quaternion();
    this.group.getWorldQuaternion(q);
    this.velLocal.copy(this.vel).applyQuaternion(q.invert());
    for (const s of this.springs) {
      const src = s.src === 'vz' ? this.velLocal.z : s.src === 'vy' ? this.velLocal.y : s.src === 'vx' ? this.velLocal.x : 0;
      let tgt = s.base + clamp(src * s.gain, -1.5, 1.5);
      if (s.extra) tgt += s.extra(this);
      if (s.wobble) tgt += Math.sin(this.time * 2.3 + s.phase) * s.wobble;
      s.obj.rotation[s.axis] = clamp(s.sp.step(tgt, dt), s.base + s.min, s.base + s.max);
    }
    this.extraUpdate && this.extraUpdate(dt);
    if (this.kindle) this.kindle.update(dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / this.flashDur);
      this.mat.emissive.copy(this.flashColor).multiplyScalar(k * 1.2);
      if (this.flashT <= 0) this.mat.emissive.setRGB(0, 0, 0);
    }
  }

  applyPose(p) {
    const R = this.rig, d = this.dims;
    R.body.position.set(p.bx, p.by, p.bz);
    // squash on impacts and landings, a stretch in the air
    const sq = p.squash || 0;
    R.body.scale.set(1 + sq * 0.05, 1 - sq * 0.07, 1 + sq * 0.05);
    R.hips.position.y = d.hipH + p.dy;
    R.hips.rotation.set(p.hrx, p.hry, p.hrz);
    R.spine.rotation.set(p.lean, p.twist, p.side);
    // breathing: the chest swells and settles
    const br = Math.sin(this.time * 2.1) * 0.012;
    R.spine.scale.set(1 + sq * 0.04 - br * 0.4, 1 - sq * 0.05 + br, 1 + sq * 0.04 + br * 0.6);
    R.head.rotation.set(p.nod, p.turn, p.tilt);
    R.shL.rotation.set(-p.lSh, p.lTw, p.lAb);
    R.shR.rotation.set(-p.rSh, -p.rTw, -p.rAb);
    R.elL.rotation.x = -p.lEl;
    R.elR.rotation.x = -p.rEl;
    R.hipL.rotation.set(-p.lHip, 0, p.lHab);
    R.hipR.rotation.set(-p.rHip, 0, -p.rHab);
    R.knL.rotation.x = p.lKn;
    R.knR.rotation.x = p.rKn;
    R.ftL.rotation.x = p.lFt;
    R.ftR.rotation.x = p.rFt;
  }
}

// ------------------------------------------------------------------ shared limb painters
/** Gloved/booted limbs etc. are capsules in voxel units hanging down -Y from the joint. */
const limb = (P, len, r0, r1, col, o = {}) => P.cap([0, o.top ?? 0.6, 0], [0, -len, 0], r0, r1, col, false, o);
/** A band of colour on an existing limb between y0 and y1 (surface only). */
const band = (P, y0, y1, col) => P.paint((x, y, z) => (y >= y0 && y < y1 ? (typeof col === 'function' ? col(x, y, z) : col) : undefined));
/** Paint the outward surface voxels matching test with col. */
const skin = (P, test, col) => P.paint((x, y, z, c) => (test(x, y, z) && P.surface(x, y, z) ? (typeof col === 'function' ? col(x, y, z, c) : col) : undefined));
/** Ring of studs/rivets around a y level at radius r. */
function rivets(P, y, r, n, col, rz = r) {
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; P.set(Math.floor(Math.sin(a) * r), y, Math.floor(Math.cos(a) * rz), col); }
}
/** Boot on the foot joint: ankle at origin, sole on y = -footH, toes toward +Z. */
function boot(P, cols, sole, o = {}) {
  const w = o.w || 2.2, len = o.len || 3.6;
  P.ell(0, -0.6, 1.0, w, 1.7, len, leather(cols, 9), false);
  P.carve((x, y) => y < -2);
  P.paint((x, y, z) => (y === -2 ? sole : undefined));
  P.box(-w + 0.4, -2, -1.5, w - 0.4, 1.5, 1, leather(cols, 9));
  if (o.toe) P.ell(0, -1.1, 3.2, w * 0.9, 1.1, 1.3, o.toe);
  if (o.laces) for (let y = -1; y <= 1; y++) P.set(0, y, 1.6 + (y < 0 ? 0.6 : 0), o.laces);
}

// ------------------------------------------------------------------ palettes (warm, saturated, a bit pastel)
const PAL = {
  bran: {
    shirt: ['#2e405a', '#3c587c', '#5276a2', '#7498c2'], pants: ['#2e2628', '#3e3434', '#544644'], apron: ['#4a2614', '#6a3a20', '#8a522e', '#a86c3c'],
    glove: ['#4e2a14', '#70421e', '#93602c'], boot: ['#22160e', '#342216', '#4a3220'], hood: ['#3a2216', '#563420', '#73482a', '#8e5c34'],
    brass: ['#6a4412', '#a8761e', '#e2ae3a', '#ffe98a'], lens: ['#a84a08', '#ff8a1a', '#ffc65a', '#fff2c8'], hair: ['#5a1e0c', '#82301a', '#ae4a24', '#d26a34'],
    kerchief: ['#7a1e1a', '#b0342a', '#e05a40', '#ff8a64'], skin: ['#b87a5a', '#d29870', '#e8b48c'], sole: '#140c08',
  },
  elio: {
    robe: ['#1c1a3e', '#2a2862', '#3c3a88', '#5654b0'], trim: ['#7a4a10', '#bc8424', '#f0c050', '#fff0a8'], lining: ['#123c3c', '#1e5a56', '#2e7e74', '#46a296'],
    stole: ['#4a1224', '#6e1e34', '#962c48', '#bc4860'], glove: ['#18141e', '#241e2c', '#322a3c'], slipper: ['#2a1e2e', '#3c2c40', '#54405a'],
    void: '#050308', glint: '#9af0ff',
  },
  durgan: {
    mail: ['#3e424c', '#5e6470', '#8a92a0', '#b8c0cc'], steel: ['#2e333c', '#555d6a', '#8a94a4', '#c2ccd8', '#eef4fa'], bronze: ['#5a3412', '#925a22', '#cc8a3a', '#f2c070'],
    horn: ['#7a6a4c', '#b09c74', '#dccfac', '#fff4dc'], beard: ['#6a2410', '#9a3a18', '#cc5826', '#f0864a'], fur: ['#32200f', '#4e341b', '#6e4c2c', '#8e6842'],
    tunic: ['#22401e', '#30602c', '#43823c'], leather: ['#33200f', '#4e321a', '#6c4a28'], boot: ['#1e1610', '#30241a', '#463424'], sole: '#100a06', slit: '#060406',
  },
  clover: {
    hood: ['#163e46', '#225e64', '#307e80', '#4aa09c'], lining: ['#a89474', '#cab896', '#e8dcc0'], scarf: ['#7a2222', '#b43c34', '#e2604a', '#ff9474'],
    vest: ['#422412', '#623a1e', '#835430', '#a46e42'], shirt: ['#a89878', '#cabea0', '#e8e0c8'], shorts: ['#2e2836', '#3e3648', '#524a5e'],
    stockA: ['#b47c1e', '#dca03a', '#f6c45a'], stockB: ['#3e2618', '#54361e'], boot: ['#241a12', '#38281a', '#4e3a26'], sole: '#120c08',
    ear: ['#b4a494', '#d8ccc0', '#f4ece4'], inner: ['#d48a92', '#eaa8ae'], tail: ['#d8d2cc', '#efeae6', '#ffffff'], shadow: '#0a080e', strap: ['#3a2212', '#58361c'],
  },
};

// ------------------------------------------------------------------ builders
const BUILD = {
  // ================================================================ BRAN: young blacksmith behind a forge mask
  bran(c) {
    const C = PAL.bran;
    c.rigFrom({ footH: 2, legLo: 11, legUp: 12, torsoH: 15, neckH: 1.5, shX: 6.2, shY: 13, armUp: 8, armLo: 7, hipX: 2.7 });
    const R = c.rig;
    const rx = (y) => 4.3 + sm(y / 13) * 1.6 - Math.max(0, y - 13) * 0.7, rz = (y) => 2.9 + Math.sin(Math.PI * clamp(y / 15, 0, 1)) * 0.85;
    // pelvis, belt with a brass buckle, tool pouch and hanging tongs
    c.part(R.hips, (P) => {
      P.ell(0, -1, 0, 4.7, 3.4, 3.3, fabric(C.pants, 11));
      P.loft(-1, 2, () => [5.1, 3.7], leather(C.apron, 12));
      P.box(-1.5, -1, 3, 1.5, 2, 4.5, metal(C.brass, 13));
      P.box(-0.5, 0, 4, 0.5, 1, 4.8, C.brass[3]);
      P.box(4, -4, -1.5, 6, 0.5, 2, leather(C.glove, 14));
      P.box(4.2, -0.5, -1.3, 5.8, 0.5, 1.8, C.brass[1]);
      P.cap([-4.6, 0, -1], [-5.2, -7, 0.5], 0.5, 0.45, metal(['#3a3e48', '#6a707e', '#a8b0bc'], 15));
      P.cap([-5.4, 0, -1], [-6.0, -6.5, 0], 0.5, 0.45, metal(['#3a3e48', '#6a707e', '#a8b0bc'], 15));
    });
    // heavy apron skirt on a spring
    const flap = c.joint(R.hips, ...c.v(0, -0.5, 3.6));
    c.part(flap, (P) => {
      const L = leather(C.apron, 16);
      for (let y = -13; y < 1; y++) for (let x = -6; x < 6; x++) {
        const w = 4.8 + Math.max(0, -y - 5) * 0.14;
        if (x + 0.5 < -w || x + 0.5 > w) continue;
        if (y <= -12 && hash(x, y, 1) > 0.55) continue; // scorched, ragged hem
        const z = -Math.floor(((x + 0.5) ** 2) / 24);
        const edge = Math.abs(x + 0.5) > w - 1.2 || y === -12 || y === 0;
        const col = edge && (x + y) & 1 ? mix(C.apron[3], '#e8c89a', 0.4) : L(x, y, z);
        P.set(x, y, z, col); P.set(x, y, z - 1, mul(C.apron[1], 0.9));
      }
      // pocket with tools poking out, scorch marks, rivets
      for (let y = -8; y < -4; y++) for (let x = -3; x < 2; x++) P.set(x, y, 1 - Math.floor(((x + 0.5) ** 2) / 24), y === -5 || x === -3 || x === 1 ? C.apron[0] : C.apron[3]);
      P.cap([-2, -5, 1], [-2.6, -1.5, 1.2], 0.5, 0.5, '#7a8290'); P.cap([0, -5, 1], [0.4, -2, 1.3], 0.5, 0.5, '#8a5a32');
      for (const [x, y] of [[-4, -1], [3, -1]]) P.set(x, y, 1, C.brass[3]);
      for (let k = 0; k < 6; k++) { const x = Math.floor(hash(k, 3, 9) * 9) - 4, y = -2 - Math.floor(hash(k, 4, 9) * 9); P.set(x, y, 1 - Math.floor(((x + 0.5) ** 2) / 24), '#2a1a12'); }
    });
    c.addSpring(flap, 'x', { base: 0, src: 'vz', gain: -0.12, k: 70, d: 7, extra: (ch) => Math.max(0, ch.pose.lHip, ch.pose.rHip) * -0.8, min: -1.4, max: 0.4 });
    // torso: slate shirt, leather bib with straps, red neckerchief
    c.part(R.spine, (P) => {
      P.loft(-1, 15.5, (y) => [rx(y), rz(y)], fabric(C.shirt, 21));
      P.loft(1, 12.5, (y) => [3.7, rz(y) + 1], leather(C.apron, 22), { front: true });
      skin(P, (x, y, z) => z > 0 && Math.abs(x + 0.5) <= 3.7 && (y === 1 || y === 12 || Math.abs(x + 0.5) > 2.9) && y >= 1 && y <= 12 && (x + y) & 1, mix(C.apron[3], '#e8c89a', 0.45));
      for (const sx of [-1, 1]) {
        P.cap([sx * 3, 12, rz(12) - 0.3], [sx * 3.5, 15.3, 0], 0.75, 0.75, leather(C.apron, 23));
        P.cap([sx * 3.5, 15.3, 0], [sx * 2.2, 2, -rz(2) + 0.2], 0.75, 0.75, leather(C.apron, 23));
        P.set(sx > 0 ? 2 : -3, 12, Math.round(rz(12)) + 1, C.brass[3]);
      }
      P.ell(0, 14.8, 0.3, 3.2, 1.4, 2.7, fabric(C.kerchief, 24));
      P.ell(1.6, 13.6, 3.1, 1.1, 1.1, 0.9, C.kerchief[2]);
      P.cap([1.6, 13.1, 3.4], [2.5, 10.6, 3.9], 0.8, 0.5, fabric(C.kerchief, 25));
      P.cap([1.4, 13.1, 3.2], [0.6, 10.9, 3.8], 0.7, 0.45, fabric(C.kerchief, 26));
    });
    // head: leather forge hood, a riveted iron welding mask with one amber window — no face
    c.part(R.head, (P) => {
      P.ell(0, 4.6, -0.2, 4.6, 5.3, 4.6, leather(C.hood, 31));
      P.loft(-1.5, 1.5, () => [3.4, 3.2, 0, 0.1], leather(C.hood, 32));
      skin(P, (x, y, z) => (x === 0 || x === -1) && y > 6 && z < 2 && (y & 1), mix(C.hood[0], '#d8b080', 0.3));
      // the mask: a curved iron plate from chin to brow
      const iron = metal(['#24262c', '#3a3e48', '#5a606c', '#8a92a0'], 33);
      P.loft(0.5, 8.6, (y) => [4.1 - Math.max(0, y - 6.5) * 0.4 - Math.max(0, 2 - y) * 0.5, 4.9 + Math.sin(Math.PI * clamp((y - 0.5) / 8, 0, 1)) * 0.5], iron, { front: true });
      for (let x = -3; x < 3; x++) for (let y = 4; y < 6; y++) { P.set(x, y, 5, ramp(C.lens, y === 5 ? 0.75 : 0.45, x, y, 5, 34)); P.set(x, y, 6, null); }
      P.set(-3, 5, 5, C.lens[3]);
      for (let x = -4; x <= 3; x++) { P.set(x, 6, 6, ramp(['#3a3e48', '#5a606c', '#8a92a0'], 0.8, x, 6, 6, 35)); P.set(x, 3, 6, ramp(['#3a3e48', '#5a606c'], 0.6, x, 3, 6, 35)); }
      for (const [x, y] of [[-4, 7], [3, 7], [-4, 1], [3, 1], [-1, 8]]) P.set(x, y, 5, C.brass[2]);
      // hinge bolts at the temples, a soot smudge
      for (const sx of [-1, 1]) P.ell(sx * 4.4, 5, 0.6, 1.1, 1.1, 1.1, metal(C.brass, 36));
      for (let k = 0; k < 5; k++) P.set(Math.floor(hash(k, 1, 39) * 6) - 3, 1 + Math.floor(hash(k, 2, 39) * 2), 5, '#1a1612');
      // auburn hair bursting out of the hood top and back
      for (let x = -3; x < 3; x++) for (let z = -3; z < 2; z++) {
        const h = 1 + Math.floor(hash(x, z, 37) * 3) + (z < 0 ? 1 : 0);
        for (let k = 0; k < h; k++) P.set(x + (k > 1 ? Math.round(hash(x, k, z) - 0.5) : 0), 9 + k, z - (k > 1 ? 1 : 0), ramp(C.hair, 0.3 + k * 0.22, x, k, z, 38));
      }
    });
    const sleeve = fabric(C.shirt, 41);
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => {
        P.ell(0, -0.6, 0, 2.5, 2.4, 2.4, sleeve);
        limb(P, 6.5, 2.1, 1.9, sleeve);
        P.cap([0, -5.3, 0], [0, -7.2, 0], 2.45, 2.45, fabric(['#5476a2', '#7498c2', '#9ab8d8'], 42));
        P.cap([0, -7, 0], [0, -8.6, 0], 1.7, 1.6, fabric(C.skin, 43));
      });
      c.part(R['el' + side], (P) => {
        limb(P, 4, 1.7, 1.55, fabric(C.skin, 44));
        P.cap([0, -3.4, 0], [0, -7, 0], 2.05, 2.25, leather(C.glove, 45));
        band(P, -4.2, -3.2, leather(['#2e1a0c', '#4a2c14'], 46));
        P.set(sx > 0 ? 1 : -2, -5, 1, C.brass[2]);
      });
      c.part(R['hand' + side], (P) => {
        P.ell(0, -1.6, 0.3, 1.9, 2.0, 1.75, leather(C.glove, 47));
        P.ell(sx * 1.2, -1.0, 1.4, 0.8, 1.0, 0.8, leather(C.glove, 47));
      });
      c.part(R['hip' + side], (P) => {
        limb(P, 12, 2.6, 2.15, fabric(C.pants, 51));
        P.ell(0, -11, 1.2, 1.9, 1.6, 1.0, fabric(['#4a3e3a', '#5e504a'], 52));
      });
      c.part(R['kn' + side], (P) => {
        limb(P, 4, 2.15, 2.0, fabric(C.pants, 53));
        P.cap([0, -3.4, 0], [0, -11, 0], 2.35, 2.15, leather(C.boot, 54));
        band(P, -4.2, -3.2, leather(['#4a3220', '#634630'], 55));
        for (let y = -10; y < -4; y += 2) P.set(sx > 0 ? 0 : -1, y, 2, '#c8a06a');
      });
      c.part(R['ft' + side], (P) => boot(P, C.boot, C.sole, { toe: metal(['#3a3e48', '#6a707e', '#9aa2ae'], 56), laces: '#c8a06a' }));
    }
    c.backItem = c.backWeapon(R.spine, { bp: 'hammer', ids: ['iron', 'iron', 'coal'], grade: 2 }, c.v(3.5, 3, -4.5), [0.12, 0, 0.62], 1.15);
    c.headTop = 11 * VS;
  },

  // ================================================================ ELIO: hooded elemental mage
  elio(c) {
    const C = PAL.elio;
    c.rigFrom({ footH: 2, legLo: 10, legUp: 11, torsoH: 14, neckH: 1, shX: 5.4, shY: 12, armUp: 7.5, armLo: 7, hipX: 2.3 });
    const R = c.rig, hv = 23;
    const robe = fabric(C.robe, 61), trim = (s) => metal(C.trim, s);
    c.part(R.hips, (P) => {
      P.ell(0, -1, 0, 4.2, 3, 3, robe);
      P.loft(-1, 2, () => [4.6, 3.5], fabric(C.stole, 62));
      P.ell(2.4, 0.5, 3.2, 1.4, 1.4, 1, trim(63));
      P.cap([2.4, -0.5, 3.4], [2.9, -6, 3.9], 0.8, 0.5, fabric(C.stole, 64));
      P.cap([1.9, -0.5, 3.4], [1.6, -5, 4.0], 0.7, 0.45, fabric(C.stole, 64));
      P.set(2, -6, 4, C.trim[2]); P.set(1, -5, 4, C.trim[2]);
    });
    // long robe skirt swaying on a spring; gold hem and an open front showing teal lining
    const skirt = c.joint(R.hips, 0, 0, 0);
    c.part(skirt, (P) => {
      P.loft(-hv + 0.6, 0.5, (y) => { const t = clamp(-y / hv, 0, 1); return [4.5 + t * 2.9, 3.4 + t * 2.4, 0, -t * 0.4]; }, (x, y, z, { u }) => {
        const t = -y / hv, front = Math.abs(u) < 0.16 + t * 0.12 && y < -6;
        if (front) return null;
        if (y < -hv + 2.6) return ramp(C.trim, 0.5 + (((x + z) & 1) ? 0.25 : 0), x, y, z, 65);
        if (Math.abs(u) < 0.3 + t * 0.12 && y < -5) return ramp(C.trim, 0.6, x, y, z, 66);
        return robe(x, y, z);
      }, { shell: 1.4 });
      P.loft(-hv + 0.6, -5, (y) => { const t = clamp(-y / hv, 0, 1); return [3.8 + t * 2.6, 2.8 + t * 2.2, 0, -t * 0.4]; }, fabric(C.lining, 67), { shell: 1, front: true });
      for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + 0.4; P.set(Math.round(Math.sin(a) * 7), -hv + 3, Math.round(Math.cos(a) * 5.5 - 0.4), C.trim[3]); }
    });
    c.addSpring(skirt, 'x', { base: 0, src: 'vz', gain: -0.1, k: 40, d: 5, min: -0.3, max: 0.3, extra: (ch) => Math.max(0, ch.pose.lHip, ch.pose.rHip) * -0.3 });
    c.addSpring(skirt, 'z', { base: 0, src: 'vx', gain: 0.12, k: 40, d: 5, min: -0.25, max: 0.25 });
    c.part(R.spine, (P) => {
      P.loft(-1, 14.5, (y) => [3.9 + sm(y / 12) * 1.0 - Math.max(0, y - 12) * 0.6, 2.8 + Math.sin(Math.PI * clamp(y / 14, 0, 1)) * 0.6], robe);
      // stole: two maroon bands with gold stitching down the front
      for (const sx of [-1, 1]) P.loft(1, 14.5, () => [1.1, 3.6, sx * 2.1, 0.2], (x, y, z) => (z > 1 ? ((y % 3 === 0 && x === (sx > 0 ? 2 : -3)) ? C.trim[2] : fabric(C.stole, 68)(x, y, z)) : undefined), { front: true });
      P.loft(12.5, 15.5, (y) => [3.6 - (y - 12.5) * 0.3, 3.2], fabric(C.robe, 69));
      P.ell(0, 1.5, 3.3, 1.3, 1.3, 0.8, trim(70));
    });
    // the hood: deep, gold-edged, nothing inside but dark and two faint glints
    c.part(R.head, (P) => {
      P.ell(0, 4.8, -0.4, 5.3, 6.1, 5.5, (x, y, z) => robe(x, y, z));
      const open = (x, y, z) => z > 0.5 && Math.abs(x + 0.5) < 3.3 - Math.max(0, y - 6) * 0.45 && y > 0 && y < 8.5;
      P.carve(open);
      P.paint((x, y, z) => (open(x, y, z - 1) || open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) ? ramp(C.trim, 0.65, x, y, z, 71) : undefined));
      P.ell(0, 4.3, 0, 3.6, 4.3, 2.6, C.void);
      P.carve((x, y, z) => z > 1.6 && open(x, y, z));
      P.set(-2, 4, 2, { glow: true, c: C.glint }); P.set(1, 4, 2, { glow: true, c: C.glint });
      P.ell(0, -0.5, 0.6, 4.6, 1.8, 4.2, fabric(C.robe, 72));
    }, { glow: 1.3 });
    const tip = c.joint(R.head, ...c.v(0, 9.2, -3.6));
    c.part(tip, (P) => {
      P.cap([0, 0, 0], [0, 2.6, -3.6], 2.0, 0.7, robe);
      P.ell(0, 2.6, -4.2, 0.9, 0.9, 0.9, trim(73));
      P.cap([0, 2, -4.4], [0, -0.5, -5], 0.35, 0.35, C.trim[2]);
    });
    c.addSpring(tip, 'x', { base: 0, src: 'vz', gain: 0.4, k: 40, d: 4, wobble: 0.05 });
    c.glints = [];
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => { P.ell(0, -0.4, 0, 2.3, 2.3, 2.3, robe); limb(P, 7, 2.0, 2.3, robe); });
      c.part(R['el' + side], (P) => {
        P.cap([0, 0.5, 0], [0, -6, 0.6], 2.3, 3.5, robe, false);
        P.carve((x, y, z) => y < -3 && Math.hypot(x + 0.5, z + 0.5 - 0.5) < 2.4 + (-y - 3) * 0.32);
        P.paint((x, y, z) => (y <= -5 ? ramp(C.trim, 0.6, x, y, z, 74) : undefined));
        P.cap([0, -3, 0.4], [0, -5.8, 0.6], 1.6, 1.5, fabric(C.lining, 75));
      });
      c.part(R['hand' + side], (P) => P.ell(0, -1.0, 0.4, 1.5, 1.7, 1.4, fabric(C.glove, 76)));
      c.part(R['hip' + side], (P) => limb(P, 11, 2.2, 1.9, fabric(C.robe, 77)));
      c.part(R['kn' + side], (P) => limb(P, 10, 1.9, 1.7, fabric(C.glove, 78)));
      c.part(R['ft' + side], (P) => { boot(P, C.slipper, '#120c14', { w: 1.9, len: 3.4 }); P.ell(0, 0.4, 3.6, 0.8, 0.8, 0.8, C.trim[2]); });
      void sx;
    }
    c.backItem = c.backWeapon(R.spine, { bp: 'staff', ids: ['quartz', 'iron'], el: { ice: 1 }, grade: 2 }, c.v(-2.4, -2.4, -4.4), [0.12, 0, -0.45], 1.05);
    // book prop for reading
    const book = c.joint(R.handL, ...c.v(-2.4, -1.6, 2));
    c.part(book, (P) => {
      P.box(-3, -0.5, -2, 3, 0.5, 2, fabric(['#c8bca0', '#efe6cc'], 79));
      P.box(-3.4, -1, -2.4, 3.4, -0.5, 2.4, leather(['#5a1a2a', '#7a2438', '#a0344a'], 80));
      P.box(-0.5, -0.5, -2.4, 0.5, 0.8, 2.4, leather(['#5a1a2a', '#7a2438'], 80));
    });
    book.rotation.set(0.9, 0.3, 0.2);
    book.visible = false;
    c.props.book = book;
    const k = new Kindle();
    c.group.add(k.group);
    c.kindle = k;
    c.kindleHome = new THREE.Vector3(0.36, 1.22, 0.12);
    k.group.position.copy(c.kindleHome);
    c.extraUpdate = (dt) => {
      const tgt = c.kindleTarget || c.kindleHome;
      k.group.position.lerp(tgt, 1 - Math.exp(-3 * dt));
      // the hood's glints blink, and dim when tired or sad
      c.blinkT = (c.blinkT ?? 2) - dt;
      if (c.blinkT < -0.12) c.blinkT = 2 + Math.random() * 3;
      const dim = c.blinkT < 0 || c.expr === 'sleepy' || c.expr === 'sad';
      c.glowMat.color.setScalar(dim ? 0.15 : c.expr === 'angry' || c.expr === 'determined' ? 1.4 : 1);
    };
    c.headTop = 12 * VS;
  },

  // ================================================================ DURGAN: stocky gnome warrior, visor closed
  durgan(c) {
    const C = PAL.durgan;
    c.rigFrom({ footH: 2, legLo: 5, legUp: 6, torsoH: 11, neckH: 1, shX: 7.2, shY: 9.5, armUp: 6, armLo: 5.5, hipX: 3.2 });
    const R = c.rig;
    const rx = (y) => 5.9 + Math.sin(Math.PI * clamp(y / 11, 0, 1)) * 0.9 - Math.max(0, y - 9.5) * 0.8, rz = (y) => 4.3 + Math.sin(Math.PI * clamp(y / 11, 0, 1)) * 0.8;
    c.part(R.hips, (P) => {
      P.ell(0, -1, 0, 5.8, 3.2, 4.4, fabric(C.tunic, 81));
      // studded leather skirt plates
      P.loft(-4.5, 1, (y) => [6.1 + (-y) * 0.15, 4.7 + (-y) * 0.1], (x, y, z, { u }) => (Math.floor((u + 3.2) * 2.2) % 2 ? leather(C.leather, 82)(x, y, z) : mul(C.leather[1], 0.85)), { shell: 1 });
      P.loft(0, 2.5, () => [6.4, 4.9], leather(C.leather, 83));
      P.ell(0, 1.2, 4.9, 2, 2, 1, metal(C.bronze, 84));
      P.set(0, 1, 6, C.bronze[3]); P.set(-1, 1, 6, C.bronze[3]);
      rivets(P, -3, 6.3, 14, C.bronze[2], 4.9);
    });
    c.part(R.spine, (P) => {
      P.loft(-1, 11.5, (y) => [rx(y), rz(y)], mail(C.mail, 85));
      // leather harness crossing the chest
      for (const sx of [-1, 1]) P.cap([sx * 4.5, 10, rz(10) - 0.5], [-sx * 4.2, 1, rz(1)], 0.9, 0.9, leather(C.leather, 86));
      P.ell(0, 5.5, rz(5.5) + 0.4, 1.4, 1.4, 0.8, metal(C.bronze, 87));
      // fur mantle around the shoulders
      for (let a = 0; a < 26; a++) {
        const t = (a / 26) * TAU, r = 6.6 + hash(a, 1, 88) * 1.2;
        P.ell(Math.sin(t) * (r - 1), 10.2 + hash(a, 2, 88) * 1.2, Math.cos(t) * (r - 2.1), 2.0, 1.8, 1.9, fur(C.fur, 89));
      }
    });
    // helm: closed visor with an eye slit, brow band, crest and great curling horns
    c.part(R.head, (P) => {
      P.ell(0, 5.6, 0, 5.3, 5.8, 5.3, metal(C.steel, 91));
      P.carve((x, y) => y < 1.4);
      P.loft(1.4, 3, () => [5.4, 5.4], metal(C.steel, 92));
      P.paint((x, y, z) => (y >= 7 && y <= 8 ? ramp(C.bronze, 0.6 + ((x + z) & 1) * 0.2, x, y, z, 93) : undefined));
      P.paint((x, y, z) => (Math.abs(x + 0.5) < 1 && y > 7 && z > -4 ? ramp(C.bronze, 0.75, x, y, z, 94) : undefined));
      // visor: raised plate, a dark slit and breathing holes
      P.loft(1.5, 7, (y) => [3.9, 5.6 - Math.max(0, y - 5) * 0.3], metal(C.steel, 95), { front: true });
      for (let x = -4; x < 4; x++) { P.set(x, 5, 6, null); P.set(x, 5, 5, C.slit); P.set(x, 5, 4, C.slit); }
      for (let y = 1; y < 5; y++) { P.set(-1, y, 6, ramp(C.bronze, 0.7, -1, y, 6, 90)); P.set(0, y, 6, ramp(C.bronze, 0.55, 0, y, 6, 90)); } // nose guard
      rivets(P, 6, 5.4, 18, C.bronze[3], 5.4);
      for (const sx of [-1, 1]) {
        P.cap([sx * 4.6, 6.4, 0], [sx * 7.6, 8.8, -0.4], 1.7, 1.2, (x, y, z, t) => ramp(C.horn, 0.35 + t * 0.4 + (Math.floor(t * 6) % 2 ? 0.12 : 0), x, y, z, 96));
        P.cap([sx * 7.6, 8.8, -0.4], [sx * 8.0, 12.8, -1.6], 1.2, 0.35, (x, y, z, t) => ramp(C.horn, 0.6 + t * 0.35 + (Math.floor(t * 5) % 2 ? 0.1 : 0), x, y, z, 97));
        P.ell(sx * 4.8, 6.4, 0, 1.6, 1.6, 1.6, metal(C.bronze, 98));
      }
      // beard spilling out from under the visor
      P.ell(0, 0.6, 3.4, 4.6, 2.8, 2.2, fur(C.beard, 99));
      P.ell(0, -1.4, 4.0, 3.4, 2.2, 1.7, fur(C.beard, 100));
      for (const sx of [-1, 1]) P.ell(sx * 4.2, 2.3, 3.6, 1.3, 1.6, 1.4, fur(C.beard, 101));
    });
    c.braids = [];
    for (const sx of [-1, 1]) {
      const bj = c.joint(R.head, ...c.v(sx * 1.8, -2.4, 4.4));
      c.part(bj, (P) => {
        P.cap([0, 0, 0], [sx * -0.4, -6.2, 0.4], 1.35, 0.9, (x, y, z, t) => ramp(C.beard, 0.4 + ((y & 1) ? 0.3 : 0), x, y, z, 102));
        for (const t of [0.35, 0.8]) P.ell(sx * -0.4 * t, -6.2 * t, 0.4 * t, 1.6, 0.8, 1.6, metal(C.bronze, 103));
      });
      c.addSpring(bj, 'x', { base: 0, src: 'vy', gain: 0.22, k: 60, d: 6, min: -0.4, max: 0.4 });
      c.addSpring(bj, 'z', { base: 0, src: 'vx', gain: 0.14, k: 50, d: 6, min: -0.3, max: 0.3 });
    }
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => {
        limb(P, 6, 2.6, 2.3, mail(C.mail, 104));
        // steel pauldron with a bronze rim and rivets
        P.ell(sx * 0.6, 0.6, 0, 3.5, 2.8, 3.3, metal(C.steel, 105));
        P.carve((x, y) => y < -0.6);
        P.paint((x, y, z) => (y === -1 || y === 0 ? (P.surface(x, y, z) ? ramp(C.bronze, 0.6, x, y, z, 106) : undefined) : undefined));
        rivets(P, 1, 3.2, 8, C.bronze[3], 3.0);
      });
      c.part(R['el' + side], (P) => {
        limb(P, 5.5, 2.3, 2.4, leather(C.leather, 107));
        for (const y of [-1, -4]) band(P, y, y + 1, metal(C.bronze, 108));
      });
      c.part(R['hand' + side], (P) => { P.ell(0, -1.6, 0.3, 2.3, 2.2, 2.1, leather(C.leather, 109)); P.ell(sx * 1.5, -1, 1.5, 1, 1.1, 1, leather(C.leather, 109)); });
      c.part(R['hip' + side], (P) => limb(P, 6, 3.0, 2.7, leather(C.leather, 110)));
      c.part(R['kn' + side], (P) => { limb(P, 5, 2.7, 2.6, leather(C.boot, 111)); band(P, -1, 0, leather(C.fur, 112)); });
      c.part(R['ft' + side], (P) => boot(P, C.boot, C.sole, { w: 2.7, len: 3.8, toe: metal(C.steel, 113) }));
    }
    c.backItem = c.backWeapon(R.spine, { bp: 'axe', ids: ['iron', 'iron', 'coal', 'bat_fang'], grade: 2 }, c.v(-3.5, 0, -5.8), [0.15, 0, -0.8], 1.1);
    c.extraUpdate = () => {
      // the helm settles a touch after each bob (a heavy head)
      c.rig.head.rotation.x += Math.sin(c.time * 2.1) * 0.01;
    };
    c.headTop = 13 * VS;
  },

  // ================================================================ CLOVER: rabbit scout, hood and scarf
  clover(c) {
    const C = PAL.clover;
    c.rigFrom({ footH: 2, legLo: 9, legUp: 9, torsoH: 11, neckH: 1, shX: 4.6, shY: 9.6, armUp: 6.5, armLo: 6, hipX: 2.1 });
    const R = c.rig;
    const rx = (y) => 3.5 + sm(y / 10) * 0.7 - Math.max(0, y - 9.5) * 0.6, rz = (y) => 2.5 + Math.sin(Math.PI * clamp(y / 11, 0, 1)) * 0.5;
    c.part(R.hips, (P) => {
      P.ell(0, -1.2, 0, 3.9, 3.0, 2.9, fabric(C.shorts, 121));
      P.loft(-0.5, 1.5, () => [4.2, 3.2], leather(C.strap, 122));
      P.box(-0.5, -0.5, 3, 1.5, 1.5, 3.8, metal(['#7a5418', '#c89a3a', '#f0d070'], 123));
      // dagger sheath on the left hip
      P.cap([3.8, 0, 0.5], [4.6, -6, 1.6], 0.8, 0.6, leather(C.strap, 124));
    });
    const tail = c.joint(R.hips, ...c.v(0, -1, -3));
    c.part(tail, (P) => P.ell(0, 0, -1.2, 2.0, 1.9, 1.8, fur(C.tail, 125)));
    c.addSpring(tail, 'y', { base: 0, src: 'vx', gain: 0.4, wobble: 0.15, k: 60, d: 5 });
    c.part(R.spine, (P) => {
      P.loft(-1, 11.5, (y) => [rx(y), rz(y)], fabric(C.shirt, 126));
      // quilted vest, open at the front
      P.loft(0, 10, (y) => [rx(y) + 0.7, rz(y) + 0.7], (x, y, z, { u }) => {
        if (Math.abs(u) < 0.22) return undefined;
        return (x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? mul(C.vest[1], 0.85) : ramp(C.vest, 0.6, x, y, z, 127);
      }, { shell: 0.9 });
      // satchel strap from the right shoulder to the left hip, a buckle
      P.cap([-3.6, 10.5, 1.5], [3.4, 0, rz(0) + 0.6], 0.8, 0.8, leather(C.strap, 128));
      P.cap([-3.6, 10.5, -1.5], [3.4, 0, -rz(0) - 0.6], 0.8, 0.8, leather(C.strap, 128));
      P.set(0, 5, Math.round(rz(5)) + 1, '#e0b84a');
      // thick scarf wound round the neck, its knot on the front
      P.ell(0, 11.6, 0.2, 3.6, 1.9, 3.2, fabric(C.scarf, 129));
      P.ell(-1.2, 10.4, 2.8, 1.4, 1.4, 1, fabric(C.scarf, 130));
    });
    const tails = c.joint(R.spine, ...c.v(-1.2, 11, -2.6));
    c.part(tails, (P) => {
      P.cap([0, 0, 0], [-0.8, -2, -5], 1.2, 0.8, fabric(C.scarf, 131));
      P.cap([0.8, 0, 0], [1.6, -3.5, -4.4], 1.1, 0.7, fabric(C.scarf, 132));
      for (const [x, y, z] of [[-1, -2, -6], [1, -4, -5]]) { P.set(x, y, z, C.scarf[3]); P.set(x, y - 1, z, C.scarf[2]); }
    });
    c.addSpring(tails, 'x', { base: 0, src: 'vz', gain: 0.5, k: 35, d: 4, wobble: 0.06, min: -0.4, max: 1.2 });
    c.addSpring(tails, 'z', { base: 0, src: 'vx', gain: -0.3, k: 35, d: 4, min: -0.5, max: 0.5 });
    // hood with the scarf pulled up over the face: only shadow shows
    c.part(R.head, (P) => {
      P.ell(0, 4.3, 0, 4.5, 4.9, 4.6, fabric(C.hood, 133));
      const open = (x, y, z) => z > 1 && Math.abs(x + 0.5) < 2.7 && y > 1 && y < 6.8;
      P.carve(open);
      P.paint((x, y, z) => (open(x, y, z - 1) || open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) ? ramp(C.lining, 0.6, x, y, z, 134) : undefined));
      P.ell(0, 4.2, 0.2, 3.1, 3.3, 2.6, C.shadow);
      P.carve((x, y, z) => z > 1.8 && open(x, y, z));
      // scarf up to the nose
      P.ell(0, 1.6, 1.2, 3.9, 1.9, 3.5, fabric(C.scarf, 135));
      P.paint((x, y, z) => (y === 2 && P.surface(x, y, z) && z > 0 && (x & 1) ? C.scarf[3] : undefined));
    });
    const earJ = [];
    const earCol = (x, y, z) => (z > -0.2 && Math.abs(x + 0.5) < 1.1 && y > 0.5 ? ramp(C.inner, 0.5, x, y, z, 136) : fur(C.ear, 137)(x, y, z));
    for (const sx of [-1, 1]) {
      const ej = c.joint(R.head, ...c.v(sx * 1.8, 8.0, -0.6));
      const floppy = sx < 0;
      c.part(ej, (P) => {
        P.ell(0, floppy ? 2.2 : 4.2, 0, 1.9, floppy ? 2.6 : 4.6, 0.95, earCol);
        P.ell(0, 0.4, 0, 1.8, 1.3, 1.5, fabric(C.hood, 138));
      });
      ej.rotation.z = floppy ? 0.35 : -0.12;
      earJ.push(ej);
      c.addSpring(ej, 'x', { base: -0.12, src: 'vy', gain: 0.35, k: 70, d: 6, wobble: 0.02, phase: sx, extra: (ch) => -ch.pose.ears * 0.25 });
      c.addSpring(ej, 'z', { base: ej.rotation.z, src: 'vx', gain: -0.2, k: 60, d: 6, extra: (ch) => ch.pose.ears * (floppy ? -0.15 : 0.1) });
      if (floppy) {
        // the tip flops over and bounces
        const tip = c.joint(ej, ...c.v(0, 4.4, 0));
        c.part(tip, (P) => P.ell(0, 2.2, 0, 1.7, 2.6, 0.9, earCol));
        tip.rotation.z = 1.7;
        c.addSpring(tip, 'z', { base: 1.7, src: 'vy', gain: -0.7, k: 30, d: 3.5, wobble: 0.08, phase: 2, extra: (ch) => -ch.pose.ears * 0.6 });
      }
    }
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => { P.ell(0, -0.8, 0, 2.2, 2.4, 2.2, fabric(C.shirt, 141)); limb(P, 6.5, 1.8, 1.55, fabric(C.shirt, 141)); });
      c.part(R['el' + side], (P) => { limb(P, 6, 1.6, 1.45, leather(C.strap, 142)); band(P, -5.5, -4.5, fabric(C.scarf, 143)); });
      c.part(R['hand' + side], (P) => { P.ell(0, -1.2, 0.3, 1.5, 1.7, 1.4, fur(C.ear, 144)); P.ell(sx * 1, -0.8, 1.2, 0.7, 0.8, 0.7, fur(C.ear, 144)); });
      c.part(R['hip' + side], (P) => {
        limb(P, 9, 2.0, 1.7, (x, y, z) => (y > -3 ? fabric(C.shorts, 145)(x, y, z) : ((y >> 1) & 1 ? ramp(C.stockA, 0.6, x, y, z, 146) : ramp(C.stockB, 0.5, x, y, z, 147))));
      });
      c.part(R['kn' + side], (P) => {
        limb(P, 4, 1.7, 1.6, (x, y, z) => ((y >> 1) & 1 ? ramp(C.stockA, 0.6, x, y, z, 146) : ramp(C.stockB, 0.5, x, y, z, 147)));
        P.cap([0, -3.4, 0], [0, -9, 0], 2.0, 1.85, leather(C.boot, 148));
        P.cap([0, -3.4, 0], [0, -4.6, 0], 2.35, 2.35, leather(['#54402a', '#6a5236'], 149));
      });
      c.part(R['ft' + side], (P) => boot(P, C.boot, C.sole, { w: 1.9, len: 3.3 }));
    }
    c.backItem = c.backWeapon(R.hips, { bp: 'dagger', ids: ['silver', 'spider_silk'], grade: 2 }, c.v(-4.2, 0.5, -1), [0.4, 0, 0.35], 0.95);
    c.ears = earJ;
    c.headTop = 16 * VS;
  },
};

export function buildCharacter(id) { return new Character(id); }
