// The four explorers, digitally sculpted: each body is ONE continuous organic mesh grown from a
// signed-distance sculpt (smooth-blended anatomy, carved faces, sculpted hair clumps, clothing
// shells), meshed with surface nets, faceted for the low-poly look, painted with hand-made pixel
// textures and skinned to a real THREE.Skeleton. Pose blending, painted expressions, blinking and
// spring bones (apron, cape, hood tip, ears, scarf, beard, tail) drive it.
import * as THREE from 'three';
import { LAYER_FX } from '../gfx/renderer.js';
import { CHARACTERS } from '../data/characters.js';
import { loft, blob, slab, Tex, fabricTex, leatherTex, furTex, mailTex, metalTex, woodTex, quiltTex, hairTex } from './char_geo.js';
import { FacePainter, FACE_SPECS } from './char_faces.js';
import { Sculpt, ell, cone, box, cyl, torus, shell, buildSculpt } from './char_sdf.js';
import { W, WR, humanoid, sculptHead, faceLayout, lockOn } from './char_body.js';
import { buildWeaponMesh } from './weapons3d.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
const outQ = (t) => 1 - (1 - t) * (1 - t);
const inQ = (t) => t * t;
const outBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const hash = (i, s = 1) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/** Meshed sculpts per explorer (deterministic), so later builds of the same character are instant. */
const SCULPT_CACHE = new Map();
/** Arms are sculpted and bound in a relaxed A-pose so no limb is buried in the torso. */
const BIND_AB = 0.5, BIND_HAB = 0.05;

// ------------------------------------------------------------------ materials
class Mats {
  constructor() { this.all = []; this.cache = new Map(); }
  /** Cel material; pass a texture as map (colour multiplies it). */
  toon(color, o = {}) {
    const key = color + '|' + (o.map ? o.map.uuid : '') + '|' + (o.side || 0) + (o.transparent ? 't' : '');
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshToonMaterial({
      color: new THREE.Color(color), gradientMap: CEL_RAMP, map: o.map || null,
      side: o.side || THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1,
    });
    this.all.push(m);
    this.cache.set(key, m);
    return m;
  }
  tex(t, o = {}) { return this.toon('#ffffff', { ...o, map: t }); }
  glow(color, i = 2.2, o = {}) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(i), transparent: !!o.additive || !!o.transparent, opacity: o.opacity ?? 1,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.additive, fog: false,
    });
  }
}
/** Three-band cel ramp with a warm lit band (skin and cloth read soft, not plastic). */
const CEL_RAMP = (() => {
  const steps = [0.46, 0.7, 0.88, 1.0];
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255); d[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(d, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; t.userData.keep = true;
  return t;
})();

function mk(geo, mat, parent, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

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

// ------------------------------------------------------------------ Kindle, Elio's elemental buddy
const KINDLE_COLORS = {
  fire: ['#ff7a2a', '#ffd27a', 0xff8a3a],
  ice: ['#5ad8ff', '#d6f6ff', 0x7fe3ff],
  shock: ['#ffd23a', '#fff6c0', 0xffe74a],
  poison: ['#6ad04a', '#d0f89a', 0x8fe04a],
};
/** A simple faceted elemental: a crystal-cut flame with a flickering crown and two ember eyes. */
export class Kindle {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'kindle';
    this.body = joint(this.group);
    this.mats = {};
    for (const [k, [a, b]] of Object.entries(KINDLE_COLORS)) {
      this.mats[k] = {
        core: new THREE.MeshBasicMaterial({ color: new THREE.Color(a).multiplyScalar(1.7), fog: false }),
        tuft: new THREE.MeshBasicMaterial({ color: new THREE.Color(b).multiplyScalar(2.1), fog: false }),
        aura: new THREE.MeshBasicMaterial({ color: new THREE.Color(a).multiplyScalar(0.7), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      };
    }
    // one faceted flame: five-sided cut, widest low, twisting up into a point
    const bodyGeo = loft([
      { y: -0.075, rx: 0.012 }, { y: -0.06, rx: 0.052 }, { y: -0.02, rx: 0.066 }, { y: 0.03, rx: 0.05, x: 0.006 }, { y: 0.08, rx: 0.026, x: 0.018 }, { y: 0.13, rx: 0.003, x: 0.03 },
    ], { n: 5, capBottom: true, capTop: true, phase: 0.3 });
    this.core = mk(bodyGeo, this.mats.fire.core, this.body);
    this.core.castShadow = false;
    const crown = loft([{ y: -0.04, rx: 0.036 }, { y: 0.0, rx: 0.04 }, { y: 0.05, rx: 0.02, x: 0.01 }, { y: 0.09, rx: 0.002, x: 0.02 }], { n: 5, capBottom: true, capTop: true, phase: 0.9 });
    this.tufts = [mk(crown, this.mats.fire.tuft, this.body, [0, 0.0, 0.012])];
    this.tufts[0].castShadow = false;
    this.aura = mk(blob(0.1, 0.12, 0.1, 6, 4), this.mats.fire.aura, this.body, [0, 0.01, 0]);
    this.aura.layers.set(LAYER_FX); this.aura.castShadow = false;
    const eyeM = new THREE.MeshBasicMaterial({ color: '#2a0c10', fog: false });
    this.eyes = [-1, 1].map((sx) => { const e = mk(blob(0.008, 0.011, 0.005, 5, 3), eyeM, this.body, [sx * 0.019, -0.02, 0.058]); e.castShadow = false; return e; });
    this.hands = [-1, 1].map((sx) => { const h = mk(blob(0.014, 0.018, 0.014, 5, 3), this.mats.fire.tuft, this.body, [sx * 0.07, -0.03, 0.02]); h.castShadow = false; return h; });
    this.light = new THREE.PointLight(KINDLE_COLORS.fire[2], 0.35, 1.6, 2);
    this.group.add(this.light);
    this.element = 'fire';
    this.t = Math.random() * 10;
    this.blink = 0;
    this.excite = 0;
    this.lightScale = 1;
  }
  setElement(e) {
    if (!KINDLE_COLORS[e]) return;
    this.element = e;
    const m = this.mats[e];
    this.core.material = m.core; this.aura.material = m.aura;
    for (const t of this.tufts) t.material = m.tuft;
    for (const h of this.hands) h.material = m.tuft;
    this.light.color.setHex(KINDLE_COLORS[e][2]);
    this.excite = 1;
  }
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.excite = Math.max(0, this.excite - dt * 1.5);
    this.body.position.y = Math.sin(t * 2.6) * 0.03;
    this.body.rotation.z = Math.sin(t * 1.7) * 0.12;
    this.body.rotation.y = Math.sin(t * 0.9) * 0.25;
    const pulse = 1 + Math.sin(t * 7) * 0.05 + this.excite * 0.25;
    this.core.scale.set(pulse, pulse * (1 + Math.sin(t * 13) * 0.06), pulse);
    this.core.rotation.y = t * 1.3;
    this.aura.scale.setScalar(1 + Math.sin(t * 5) * 0.08 + this.excite * 0.4);
    this.tufts.forEach((tf, i) => { tf.scale.y = 1 + Math.sin(t * 11 + i * 2) * 0.22; tf.rotation.y = -t * 2.1; });
    this.hands.forEach((h, i) => { h.position.y = -0.03 + Math.sin(t * 3 + i * Math.PI) * 0.02; });
    this.blink -= dt;
    const closed = this.blink < 0.1;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
    const happy = this.excite > 0.3;
    for (const e of this.eyes) e.scale.y = closed ? 0.15 : happy ? 0.45 : 1;
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
      return { by: h, dy: -crouch * 0.14 - land * 0.1, lKn: crouch * 1.3 + (air > 0 && air < 1 ? 0.9 : 0) + land, rKn: crouch * 1.3 + (air > 0 && air < 1 ? 0.6 : 0) + land, lHip: crouch * 0.8 + air * 0.4, rHip: crouch * 0.8 + air * 0.2, lSh: air > 0 && air < 1 ? 2.6 : -crouch * 0.6, rSh: air > 0 && air < 1 ? 2.6 : -crouch * 0.6, lAb: 0.4, rAb: 0.4, lean: crouch * 0.4 - air * 0.1, nod: -air * 0.2 };
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
      return { bz: -a * 0.12, lean: -a * 0.45, nod: -a * 0.35, tilt: a * 0.2, lSh: a * 0.9, rSh: a * 0.7, lAb: 0.3 + a * 0.4, rAb: 0.3 + a * 0.5, lEl: 0.6, rEl: 0.6, dy: -a * 0.03, lKn: a * 0.2, rKn: a * 0.3 };
    },
  },
  dodge: {
    dur: 0.5, lambda: 36, expr: 'surprised', f: (t, c, k) => {
      const a = Math.sin(seg(k, 0, 1) * Math.PI);
      return { bz: -a * 0.45, by: a * 0.12, lean: a * 0.3, lKn: a * 0.9, rKn: a * 1.1, lHip: a * 0.6, rHip: a * 0.3, lSh: -a * 0.4, rSh: -a * 0.4, lAb: 0.5, rAb: 0.5, nod: a * 0.1 };
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


// ------------------------------------------------------------------ Character
export class Character {
  constructor(id) {
    this.id = id;
    this.def = CHARACTERS[id];
    this.group = new THREE.Group();
    this.group.name = 'char_' + id;
    this.mats = new Mats();
    this.matDefs = {};
    this.rig = {};
    this.bones = [];
    this.pose = {};
    for (const k of CH) this.pose[k] = REST[k] || 0;
    this.time = Math.random() * 10;
    this.animT = 0;
    this.anim = 'idle';
    this.loopAnim = 'idle';
    this.animOpts = {};
    this.seated = false;
    this.seatH = 0.36;
    this.expr = 'neutral';
    this.exprLock = 0;
    this.blinkT = 1 + Math.random() * 2;
    this.blinkOn = 0;
    this.springs = [];
    this.props = {};
    this.held = { right: null, left: null };
    this.look = null;
    this.lookYaw = 0; this.lookPitch = 0;
    this.kindle = null;
    this.flashT = 0;
    this._wp = new THREE.Vector3(); this._prevWp = null; this.vel = new THREE.Vector3(); this.velLocal = new THREE.Vector3();
    BUILD[id](this);
    this.face.draw('neutral', false);
    this.applyPose(this.pose);
    this.group.traverse((o) => { o.userData.character = this; });
  }

  // ---------------------------------------------------------- skeleton & sculpt
  bone(parent, x = 0, y = 0, z = 0) {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    parent.add(b);
    this.bones.push(b);
    b.updateMatrixWorld(true);
    return b;
  }
  skeleton(d) {
    this.dims = { footH: 0.07, ...d };
    const R = this.rig;
    R.body = this.bone(this.group);
    R.hips = this.bone(R.body, 0, d.hipH, 0);
    R.spine = this.bone(R.hips, 0, 0.03, 0);
    R.neck = this.bone(R.spine, 0, d.torsoH, 0);
    R.head = this.bone(R.neck, 0, d.neckH, 0);
    R.shL = this.bone(R.spine, d.shX, d.shY, 0);
    R.shR = this.bone(R.spine, -d.shX, d.shY, 0);
    R.shL.rotation.order = 'XZY'; R.shR.rotation.order = 'XZY';
    R.elL = this.bone(R.shL, 0, -d.armUp, 0);
    R.elR = this.bone(R.shR, 0, -d.armUp, 0);
    R.handL = this.bone(R.elL, 0, -d.armLo, 0);
    R.handR = this.bone(R.elR, 0, -d.armLo, 0);
    R.hipL = this.bone(R.hips, d.hipX, 0, 0);
    R.hipR = this.bone(R.hips, -d.hipX, 0, 0);
    R.knL = this.bone(R.hipL, 0, -d.legUp, 0);
    R.knR = this.bone(R.hipR, 0, -d.legUp, 0);
    R.ftL = this.bone(R.knL, 0, -d.legLo, 0);
    R.ftR = this.bone(R.knR, 0, -d.legLo, 0);
    // bind pose: relaxed A-pose, feet a touch apart
    R.shL.rotation.z = BIND_AB; R.shR.rotation.z = -BIND_AB;
    R.hipL.rotation.z = BIND_HAB; R.hipR.rotation.z = -BIND_HAB;
    this.group.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      const m = joint(R['hand' + side], 0, -(d.handLen || 0.09) * 0.55, 0.0);
      m.rotation.set(Math.PI / 2 - 0.55, 0, 0);
      R['mount' + side] = m;
    }
  }
  /** Register a painted material. tex: a Tex (repeat-wrapped) or null for a flat colour. */
  material(name, color, tex = null, o = {}) {
    const material = tex ? this.mats.toon(o.tint || '#ffffff', { map: tex.texture(true), side: o.side }) : this.mats.toon(color, { side: o.side });
    this.matDefs[name] = { material, uv: 'tri', density: tex ? (o.tpm ?? 150) / tex.w : 1 }; // ~150 texels per metre
    return material;
  }
  /** Painted face projected onto the sculpted head. */
  makeFace(spec, hd) {
    const L = faceLayout(spec, hd);
    this.face = new FacePainter(L);
    const hw = W(hd.hb, 0, hd.yc, 0);
    this.matDefs.face = { material: this.mats.toon('#ffffff', { map: this.face.tex }), uv: 'face', face: { cx: hw[0], y0: hw[1], w: L.uv.w, h: L.uv.h, zMin: hw[2] - hd.R * 0.15 } };
    this.headR = hd.R; this.headH = hd.H;
  }
  /** Mesh + paint + skin the sculpt, bind it to the skeleton in the current (bind) pose. */
  finish(S, o = {}) {
    if (!this.matDefs.default) this.matDefs.default = this.matDefs.skin;
    this.group.updateMatrixWorld(true);
    let mesh;
    const cached = SCULPT_CACHE.get(this.id);
    if (cached) { // same sculpt, same bone order: share the meshed geometry, fresh materials and skeleton
      mesh = new THREE.SkinnedMesh(cached.geometry, cached.mats.map((n) => (this.matDefs[n] || this.matDefs.default).material));
      mesh.frustumCulled = false; mesh.castShadow = true; mesh.userData.tris = cached.geometry.attributes.position.count / 3;
    } else {
      mesh = buildSculpt(S, { hBody: o.hBody ?? 0.022, hFine: o.hFine ?? 0.0078, clusterBody: o.clusterBody ?? 0.032, clusterFine: o.clusterFine ?? 0.012, bones: this.bones, mats: this.matDefs });
      const names = new Map(Object.entries(this.matDefs).map(([n, d]) => [d.material, n]));
      SCULPT_CACHE.set(this.id, { geometry: mesh.geometry, mats: mesh.material.map((m) => names.get(m) || 'default') });
    }
    mesh.name = 'body_' + this.id;
    this.group.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    this.bodyMesh = mesh;
  }
  addSpring(obj, axis, opts) {
    const s = { obj, axis, base: opts.base ?? obj.rotation[axis], gain: opts.gain ?? 0.6, src: opts.src || 'vz', sp: new Spring(opts.k ?? 80, opts.d ?? 8), wobble: opts.wobble || 0, phase: opts.phase || 0, min: opts.min ?? -2, max: opts.max ?? 2, extra: opts.extra };
    s.sp.x = s.base;
    this.springs.push(s);
    return s;
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
  setExpression(e, opts = {}) {
    this.expr = e;
    this._autoExpr = !!opts.auto;
    if (opts.hold) this.exprLock = opts.hold;
    this.face.draw(e, false);
    this.onExpression && this.onExpression(e);
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
    out.y += this.headTop || this.headH * 1.1;
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
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      if (this.blinkOn <= 0) { this.blinkOn = 0.12; this.face.draw(this.expr, true); }
      this.blinkT = 2 + Math.random() * 3.5;
      if (Math.random() < 0.18) this.blinkT = 0.25;
    }
    if (this.blinkOn > 0) { this.blinkOn -= dt; if (this.blinkOn <= 0) this.face.draw(this.expr, false); }

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
      for (const m of this.mats.all) m.emissive.copy(this.flashColor).multiplyScalar(k * 1.2);
      if (this.flashT <= 0) for (const m of this.mats.all) m.emissive.setRGB(0, 0, 0);
    }
  }

  applyPose(p) {
    const R = this.rig, d = this.dims;
    R.body.position.set(p.bx, p.by, p.bz);
    R.hips.position.y = d.hipH + p.dy;
    R.hips.rotation.set(p.hrx, p.hry, p.hrz);
    R.spine.rotation.set(p.lean, p.twist, p.side);
    const sq = p.squash || 0;
    R.spine.scale.set(1 + sq * 0.06, 1 - sq * 0.08, 1 + sq * 0.06);
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

// ------------------------------------------------------------------ shared sculpt bits
/** Weight a group by height between two bones (cloth that hangs from a body bone onto a spring bone). */
const hangWeights = (top, bottom, y0, y1) => (x, y) => { const t = sm((y0 - y) / (y0 - y1)); return [[top, 1 - t], [bottom, t]]; };
/** Tousled hair: locks fanned around a head from a list of [root, ctrl, tip, radius]. */
function hairLocks(G, hd, list, o = {}) {
  for (const [a, b, cc, r] of list) lockOn(G, [hd.P(...a), hd.P(...b), hd.P(...cc)], r, o.tipR ?? 0.0025, { k: o.k ?? 0.012, n: 4, pow: o.pow ?? 0.8 });
}
/** Back-slung weapon on a joint. */
function backWeapon(c, parent, w, p, r, s = 1) {
  const j = joint(parent, ...p);
  j.rotation.set(...r);
  const m = buildWeaponMesh(w);
  m.scale.setScalar(s);
  j.add(m);
  return j;
}

// ------------------------------------------------------------------ builders
const BUILD = {
  // ================================================================ BRAN — young blacksmith
  bran(c) {
    c.skeleton({ hipH: 0.89, legUp: 0.42, legLo: 0.4, footH: 0.07, hipX: 0.09, torsoH: 0.5, shY: 0.44, shX: 0.19, armUp: 0.29, armLo: 0.26, neckH: 0.05, handLen: 0.085 });
    const R = c.rig, d = c.dims, T = d.torsoH;
    c.material('skin', '#f0c09a');
    c.material('shirt', '#8fa3b5', fabricTex('#8fa3b5', { w: 64, h: 64, seamsX: [31], stitchY: [60] }));
    c.material('pants', '#4a3a34', fabricTex('#4a3a34', { w: 64, h: 64, seamsX: [20] }));
    c.material('apron', '#5a3a24', leatherTex('#5a3a24', { w: 64, h: 64, stitchEdge: true, scratches: 9, stitchY: [30] }));
    c.material('boot', '#3a2618', leatherTex('#3a2618', { w: 64, h: 64, stitchY: [12, 50], scratches: 5 }));
    c.material('belt', '#2c1a10', leatherTex('#2c1a10', { w: 32, h: 32, stitchY: [4, 27], scratches: 2 }));
    c.material('strap', '#4a2c18', leatherTex('#4a2c18', { w: 32, h: 32, stitchX: [3, 28], scratches: 1 }));
    c.material('hair', '#7a3a1e', hairTex('#7a3a1e', { w: 32, h: 32 }));
    c.material('brass', '#d8a040', metalTex('#d8a040', { w: 32, h: 32 }));
    c.material('glass', '#e8a04a');
    c.material('kerchief', '#b8402a', fabricTex('#b8402a', { w: 32, h: 32, bands: [{ y0: 26, y1: 28, color: '#e8d0b0' }] }));
    c.material('sole', '#24160e');
    const S = new Sculpt();
    const body = humanoid(c, S, {
      mats: { pelvis: 'pants', torso: 'shirt', upper: 'shirt', fore: 'skin', hand: 'skin', thigh: 'pants', shin: 'pants', foot: 'boot' },
      waist: [0.13, 0.098], chest: [0.172, 0.118], hipW: 0.138, hipD: 0.1, neckR: 0.047, delt: 0.06, trap: 0.046,
      arm: [0.052, 0.043, 0.034], leg: [0.074, 0.05, 0.04], hand: { len: 0.085, w: 0.044, t: 0.02 }, foot: { len: 0.25, w: 0.1, h: 0.085 },
    });
    for (const side of ['L', 'R']) {
      const el = R['el' + side], kn = R['kn' + side], ft = R['ft' + side], sh = R['sh' + side];
      body.add(torus(W(el, 0, 0.045, 0), 0.05, 0.016, WR(el)), { bone: sh, mat: 'shirt', k: 0.012 });                 // rolled sleeve
      body.add(cone(W(kn, 0, -d.legLo * 0.4, 0), W(ft, 0, -0.01, -0.005), 0.054, 0.05), { bone: kn, mat: 'boot', k: 0.01 }); // boot shaft
      body.add(torus(W(kn, 0, -d.legLo * 0.4, 0), 0.052, 0.012, WR(kn)), { bone: kn, mat: 'boot', k: 0.008 });          // boot cuff
    }
    body.add(torus(W(R.spine, 0, -0.01, 0.004), 0.128, 0.017, [0, 0, 0], 0.76), { bone: R.spine, mat: 'belt', k: 0.006, sigma: 0.025 });
    body.add(box(W(R.spine, 0, -0.01, 0.1), [0.026, 0.024, 0.012], 0.005), { bone: R.spine, mat: 'brass', k: 0.004 });
    S.paint(box([0, 0.006, 0], [1, 0.016, 1], 0.001), 'sole', ['body']);
    // heavy leather apron: bib following the chest, skirt hanging to the knees on a spring bone
    const bib = S.group('bib', { k: 0.01, mat: 'apron', bone: R.spine });
    bib.add(shell(ell(W(R.spine, 0, T * 0.5, -0.03), [0.2, T * 0.6, 0.165]), 0.0108));
    bib.clip(box(W(R.spine, 0, T * 0.44, 0.2), [0.115, T * 0.34, 0.13], 0.01, [0.0, 0, 0]));
    const flap = c.bone(R.hips, 0, -0.03, 0.11);
    const hy = W(R.hips)[1];
    const skirt = S.group('apron', { k: 0.01, mat: 'apron', bone: R.hips, weights: hangWeights(R.hips, flap, hy - 0.02, hy - 0.2) });
    skirt.add(shell(ell(W(R.hips, 0, -0.2, -0.16), [0.24, 0.55, 0.3]), 0.0108));
    skirt.clip(box(W(R.hips, 0, -0.21, 0.16), [0.16, 0.27, 0.12], 0.012));
    skirt.add(box(W(R.hips, 0.065, -0.2, 0.152), [0.045, 0.05, 0.012], 0.006, [0.08, 0.15, 0]), { mat: 'belt', k: 0.006 }); // tool pocket
    c.addSpring(flap, 'x', { base: 0, src: 'vz', gain: -0.12, k: 70, d: 7, extra: (ch) => Math.max(0, ch.pose.lHip, ch.pose.rHip) * -0.8, min: -1.4, max: 0.4 });
    // neck strap of the apron, red neckerchief with a knot and two tails
    const kf = S.group('kerchief', { fine: true, k: 0.008, mat: 'kerchief', bone: R.neck });
    kf.add(torus(W(R.neck, 0, 0.01, 0.004), 0.052, 0.013, [0.3, 0, 0], 0.9));
    kf.add(ell(W(R.neck, 0.026, -0.012, 0.055), [0.017, 0.015, 0.012]));
    const tl = c.bone(R.neck, 0.026, -0.02, 0.058);
    kf.add(cone(W(tl, 0, 0, 0), W(tl, -0.012, -0.06, 0.012), 0.012, 0.004), { bone: tl });
    kf.add(cone(W(tl, 0, 0, 0), W(tl, 0.016, -0.05, 0.01), 0.011, 0.004), { bone: tl });
    c.addSpring(tl, 'x', { base: 0, src: 'vz', gain: 0.35, wobble: 0.05, k: 55, d: 5 });
    const st = S.group('straps', { fine: true, k: 0.006, mat: 'strap', bone: R.spine });
    for (const sx of [-1, 1]) lockOn(st, [W(R.spine, sx * 0.1, T * 0.78, 0.13), W(R.spine, sx * 0.085, T * 1.02, 0.07), W(R.neck, sx * 0.03, 0.03, -0.05)], 0.008, 0.007, { k: 0.004, n: 6 });
    // head: strong jaw, defined nose, small determined eyes
    const hd = sculptHead(c, S, { R: 0.083, H: 0.222, jaw: 0.95, chin: 1.15, brow: 1.35, jawAngle: true, nose: { len: 1.0, r: 1, tip: 1 } });
    c.makeFace(FACE_SPECS.bran, hd);
    // short tousled auburn hair: a close cap carved back from the face under swept, lifted clumps
    const hair = S.group('hair', { fine: true, k: 0.012, mat: 'hair', bone: R.head });
    const { R: hr, H, yc } = hd;
    hair.add(ell(hd.P(0, yc + H * 0.7, -hr * 0.12), [hr * 1.03, H * 0.32, hr * 1.1]));
    hair.sub(ell(hd.P(0, yc + H * 0.36, hr * 0.92), [hr * 1.2, H * 0.44, hr * 0.95]), { k: 0.016 });
    hair.sub(ell(hd.P(0, yc + H * 0.12, -hr * 0.2), [hr * 1.5, H * 0.32, hr * 1.5]), { k: 0.02 });
    const locks = [];
    for (let i = 0; i < 6; i++) { // crown: clumps radiating from the whorl, tips lifted and kicked out
      const a = -2.6 + i * 1.04 + (hash(i, 3) - 0.5) * 0.3, len = 0.075 + hash(i, 4) * 0.025;
      const ca = Math.sin(a), sa = Math.cos(a);
      locks.push([[ca * hr * 0.15, yc + H * 1.02, -hr * 0.15 + sa * hr * 0.15], [ca * len * 0.6, yc + H * 1.08, -hr * 0.15 + sa * len * 0.6], [ca * len * 1.15, yc + H * (0.98 + hash(i, 5) * 0.06), -hr * 0.15 + sa * len * 1.15], 0.03]);
    }
    const fringe = [[-0.5, -0.9, 0.7], [-0.2, -0.6, 0.66], [0.1, -0.4, 0.74], [0.38, 0.2, 0.7], [0.62, 0.55, 0.78]];
    for (const [x, sweep, end] of fringe) { // fringe: falls forward over the brow, swept toward his right
      locks.push([[x * hr, yc + H * 0.98, hr * 0.35], [x * hr + sweep * 0.012, yc + H * 0.98, hr * 1.02], [x * hr + sweep * 0.03, yc + H * end, hr * 1.12], 0.026]);
    }
    for (const sx of [-1, 1]) { // sides: swept back over the ears; nape: short tufts
      locks.push([[sx * hr * 0.75, yc + H * 0.92, hr * 0.3], [sx * hr * 1.14, yc + H * 0.8, -hr * 0.1], [sx * hr * 1.12, yc + H * 0.66, -hr * 0.62], 0.026]);
      locks.push([[sx * hr * 0.85, yc + H * 0.8, -hr * 0.5], [sx * hr * 1.1, yc + H * 0.62, -hr * 0.8], [sx * hr * 0.95, yc + H * 0.48, -hr * 1.05], 0.024]);
      locks.push([[sx * hr * 0.35, yc + H * 0.78, -hr * 1.0], [sx * hr * 0.45, yc + H * 0.6, -hr * 1.18], [sx * hr * 0.55, yc + H * 0.42, -hr * 1.12], 0.024]);
    }
    hairLocks(hair, hd, locks, { k: 0.005, pow: 0.75 });
    c.finish(S);
    // the big forge hammer slung across his back
    c.backItem = backWeapon(c, R.spine, { bp: 'hammer', ids: ['iron', 'iron', 'coal'], grade: 2 }, [0.12, 0.02, -0.16], [0.12, 0, 0.62], 1.25);
    c.headTop = 0.2;
  },

  // ================================================================ ELIO — hooded elemental mage
  elio(c) {
    c.skeleton({ hipH: 0.71, legUp: 0.33, legLo: 0.32, footH: 0.06, hipX: 0.07, torsoH: 0.38, shY: 0.33, shX: 0.14, armUp: 0.24, armLo: 0.21, neckH: 0.04, handLen: 0.07 });
    const R = c.rig, d = c.dims, T = d.torsoH;
    c.material('skin', '#e8c4a8');
    c.material('robe', '#3e6a78', fabricTex('#3e6a78', { w: 64, h: 64, seamsX: [31], bands: [{ y0: 56, y1: 60, color: '#c8a050', pattern: 'zig', color2: '#5a3a20' }] }));
    c.material('cloak', '#2e3666', fabricTex('#2e3666', { w: 64, h: 64, patchesN: 3, seamsX: [12, 44] }));
    c.material('dark', '#120e1c');
    c.material('legs', '#3a3040', fabricTex('#3a3040', { w: 32, h: 32 }));
    c.material('shoe', '#5a3a2a', leatherTex('#5a3a2a', { w: 32, h: 32, stitchY: [8] }));
    c.material('belt', '#6a4a2a', leatherTex('#6a4a2a', { w: 32, h: 32, stitchY: [3, 28] }));
    c.material('hair', '#dcd4f0', hairTex('#dcd4f0', { w: 32, h: 32 }));
    c.material('bronze', '#c08a40', metalTex('#c08a40', { w: 32, h: 32 }));
    const S = new Sculpt();
    const body = humanoid(c, S, {
      mats: { pelvis: 'robe', torso: 'robe', upper: 'robe', fore: 'robe', hand: 'skin', thigh: 'legs', shin: 'legs', foot: 'shoe' },
      waist: [0.096, 0.078], chest: [0.118, 0.088], hipW: 0.105, hipD: 0.082, neckR: 0.034, delt: 0.044, trap: 0.034,
      arm: [0.04, 0.034, 0.028], leg: [0.056, 0.04, 0.032], hand: { len: 0.07, w: 0.036, t: 0.016 }, foot: { len: 0.2, w: 0.078, h: 0.07 },
    });
    for (const side of ['L', 'R']) { // wide sleeves flaring past the wrist
      const el = R['el' + side], hd0 = R['hand' + side];
      body.add(cone(W(el, 0, -0.03, 0.003), W(hd0, 0, 0.012, 0.008), 0.04, 0.062), { bone: el, mat: 'robe', k: 0.02 });
    }
    body.add(torus(W(R.spine, 0, 0.0, 0.0), 0.098, 0.014, [0, 0, 0], 0.82), { bone: R.spine, mat: 'belt', k: 0.006 });
    // long robe skirt (hollow, swings on a spring bone)
    const skB = c.bone(R.hips, 0, -0.06, 0);
    const hy = W(R.hips)[1];
    const robe = S.group('robe', { k: 0.01, mat: 'robe', bone: R.hips, weights: hangWeights(R.hips, skB, hy, hy - 0.35) });
    robe.add(shell(cone(W(R.hips, 0, 0.06, 0), W(R.hips, 0, -0.66, -0.01), 0.112, 0.22), 0.0108));
    robe.clip(box([0, (0.075 + hy + 0.05) / 2, 0], [0.5, (hy + 0.05 - 0.075) / 2, 0.5], 0.004));
    c.addSpring(skB, 'x', { base: 0, src: 'vz', gain: -0.14, k: 40, d: 5, min: -0.35, max: 0.35, extra: (ch) => Math.max(0, ch.pose.lHip, ch.pose.rHip) * -0.35 });
    c.addSpring(skB, 'z', { base: 0, src: 'vx', gain: 0.14, k: 40, d: 5, min: -0.3, max: 0.3 });
    // travelling cloak: shoulder mantle + long back cape with patched hem
    const mantle = S.group('mantle', { k: 0.012, mat: 'cloak', bone: R.spine });
    mantle.add(shell(ell(W(R.spine, 0, T * 0.82, -0.012), [d.shX + 0.05, T * 0.3, 0.125]), 0.0108));
    mantle.clip(box(W(R.spine, 0, T * 0.97, 0), [0.4, T * 0.36, 0.4], 0.004));
    const capeB = c.bone(R.spine, 0, T * 0.3, -0.12);
    const cy = W(R.spine, 0, T * 0.6)[1];
    const cape = S.group('cape', { k: 0.012, mat: 'cloak', bone: R.spine, innerMat: 'dark', innerCenter: W(R.hips, 0, -0.1, 0.06), weights: hangWeights(R.spine, capeB, cy, cy - 0.7) });
    cape.add(shell(cone(W(R.spine, 0, T * 0.88, -0.025), W(R.hips, 0, -0.6, -0.1), 0.16, 0.26), 0.0108));
    cape.clip(box(W(R.spine, 0, -0.15, -0.22), [0.4, 0.75, 0.2], 0.004));
    cape.clip(box([0, 0.55, 0], [0.6, 0.47, 0.6], 0.004));
    c.addSpring(capeB, 'x', { base: 0, src: 'vz', gain: 0.25, k: 35, d: 4, wobble: 0.03, min: -0.2, max: 1.2 });
    c.addSpring(capeB, 'z', { base: 0, src: 'vx', gain: -0.2, k: 35, d: 4, min: -0.4, max: 0.4 });
    // head deep inside a peaked hood; the face is lost in shadow, eyes glow
    const hd = sculptHead(c, S, { R: 0.085, H: 0.2, jaw: 0.95, chin: 0.9, brow: 0.8, nose: { len: 0.8, r: 0.9, tip: 0.9 }, ears: false });
    c.makeFace(FACE_SPECS.elio, hd);
    const { R: hr, H, yc } = hd;
    const tip = c.bone(R.head, 0, yc + H * 0.95, -hr * 0.8);
    const hood = S.group('hood', { fine: true, k: 0.012, mat: 'cloak', bone: R.head, innerMat: 'dark', innerCenter: hd.P(0, yc + H * 0.5, -hr * 0.1) });
    hood.add(shell(ell(hd.P(0, yc + H * 0.62, -hr * 0.18), [hr * 1.42, H * 0.66, hr * 1.5]), 0.0065));
    hood.add(cone(hd.P(0, yc + H * 1.1, -hr * 0.55), W(tip, 0, -0.01, -0.08), 0.036, 0.006), { bone: tip, k: 0.03 });
    hood.sub(ell(hd.P(0, yc + H * 0.42, hr * 1.3), [hr * 0.94, H * 0.52, hr * 0.78]), { k: 0.012 });
    hood.clip(box(hd.P(0, yc + H * 0.4 + 0.25, 0), [0.4, 0.25 + H * 0.4 + 0.04, 0.4], 0.004));
    c.addSpring(tip, 'x', { base: 0, src: 'vz', gain: 0.4, k: 40, d: 4, wobble: 0.04 });
    const hair = S.group('hair', { fine: true, k: 0.01, mat: 'hair', bone: R.head });
    hairLocks(hair, hd, [
      [[-hr * 0.4, yc + H * 0.9, hr * 0.55], [-hr * 0.5, yc + H * 0.78, hr * 0.98], [-hr * 0.62, yc + H * 0.6, hr * 0.98], 0.018],
      [[-hr * 0.05, yc + H * 0.92, hr * 0.6], [-hr * 0.1, yc + H * 0.8, hr * 1.02], [-hr * 0.22, yc + H * 0.64, hr * 1.02], 0.018],
      [[hr * 0.35, yc + H * 0.9, hr * 0.55], [hr * 0.45, yc + H * 0.78, hr * 0.98], [hr * 0.6, yc + H * 0.62, hr * 0.98], 0.017],
    ]);
    hair.add(ell(hd.P(0, yc + H * 0.72, -hr * 0.1), [hr * 1.05, H * 0.32, hr * 1.12]));
    // clasp
    body.add(ell(W(R.spine, 0, T * 0.9, 0.095), [0.018, 0.018, 0.01]), { bone: R.spine, mat: 'bronze', k: 0.003 });
    c.finish(S);
    // eyes: two cold sparks in the hood's dark
    const eyeM = c.mats.glow('#9ae6ff', 1.8);
    c.eyes = [-1, 1].map((sx) => { const e = mk(blob(0.0075, 0.0055, 0.004, 5, 3), eyeM, R.head, [sx * hd.ex, hd.eyeY, hr * 0.93]); e.castShadow = false; return e; });
    // spellbook prop for reading
    const book = joint(R.handL, -0.05, -0.05, 0.07);
    book.rotation.set(-0.9, 0.2, 0.1);
    const coverT = leatherTex('#7a2a32', { w: 32, h: 32, stitchEdge: true }); for (let i = 10; i < 22; i++) { coverT.set(i, 16, '#d8b060'); coverT.set(16, i, '#d8b060'); }
    mk(slab([[-0.09, -0.07], [0.09, -0.07], [0.09, 0.07], [-0.09, 0.07]], 0.018, 0.004), c.mats.tex(coverT.texture()), book, [0, 0, 0], [Math.PI / 2, 0, 0]);
    const pagesT = new Tex(32, 16); pagesT.fill('#efe2c4'); for (let y = 3; y < 14; y += 2) { pagesT.hline(3, 13, y, '#7a6a5a'); pagesT.hline(18, 28, y, '#7a6a5a'); }
    mk(new THREE.PlaneGeometry(0.17, 0.13), c.mats.tex(pagesT.texture()), book, [0, 0.0105, 0], [-Math.PI / 2, 0, 0]);
    book.visible = false;
    c.props.book = book;
    c.backItem = backWeapon(c, R.spine, { bp: 'staff', ids: ['quartz', 'iron'], el: { ice: 1 }, grade: 2 }, [-0.08, -0.08, -0.15], [0.12, 0, -0.45], 1.15);
    // Kindle
    const k = new Kindle();
    c.group.add(k.group);
    k.group.position.set(0.38, 1.25, 0.15);
    c.kindle = k;
    c.kindleHome = new THREE.Vector3(0.36, 1.22, 0.12);
    c.extraUpdate = (dt) => {
      const t = c.time;
      const tgt = c.kindleTarget || c.kindleHome;
      const p = k.group.position;
      const ox = Math.sin(t * 0.9) * 0.08, oz = Math.cos(t * 0.7) * 0.06;
      p.x += (tgt.x + ox - p.x) * (1 - Math.exp(-4 * dt));
      p.y += (tgt.y + Math.sin(t * 1.6) * 0.03 - p.y) * (1 - Math.exp(-4 * dt));
      p.z += (tgt.z + oz - p.z) * (1 - Math.exp(-4 * dt));
      const key = c.face.key, e = c.expr;
      const sy = key.endsWith('_b') || e === 'sleepy' || e === 'hurt' ? 0.15 : e === 'happy' ? 0.4 : e === 'angry' || e === 'determined' ? 0.6 : e === 'surprised' ? 1.4 : 1;
      for (const ey of c.eyes) ey.scale.y = sy;
    };
    c.headTop = 0.3;
  },

  // ================================================================ DURGAN — dwarf warrior
  durgan(c) {
    c.skeleton({ hipH: 0.42, legUp: 0.19, legLo: 0.17, footH: 0.06, hipX: 0.1, torsoH: 0.37, shY: 0.31, shX: 0.21, armUp: 0.21, armLo: 0.19, neckH: 0.02, handLen: 0.09 });
    const R = c.rig, d = c.dims, T = d.torsoH;
    c.material('skin', '#e6a882');
    c.material('gambeson', '#7a6a50', quiltTex('#7a6a50', { w: 32, h: 32, cell: 8 }));
    c.material('mail', '#8a94a2', mailTex('#8a94a2', { w: 32, h: 32 }), { tpm: 320 });
    c.material('leather', '#5a3a24', leatherTex('#5a3a24', { w: 64, h: 64, stitchY: [10, 54], scratches: 7 }));
    c.material('glove', '#4a3020', leatherTex('#4a3020', { w: 32, h: 32 }));
    c.material('trousers', '#4a4a3a', fabricTex('#4a4a3a', { w: 32, h: 32, patchesN: 1 }));
    c.material('boot', '#3a2618', leatherTex('#3a2618', { w: 64, h: 64, stitchY: [14] }));
    c.material('fur', '#8a6a4a', furTex('#8a6a4a', { w: 32, h: 32 }));
    c.material('steel', '#9aa2ae', metalTex('#9aa2ae', { w: 32, h: 32, rivetsY: [4, 27], rivetStep: 6 }));
    c.material('gold', '#d8a840', metalTex('#d8a840', { w: 16, h: 16 }));
    c.material('horn', '#e2d4b4', fabricTex('#e2d4b4', { w: 16, h: 16, weave: false }));
    c.material('beard', '#c8743a', hairTex('#c8743a', { w: 32, h: 32 }));
    c.material('beardL', '#e0904a', hairTex('#e0904a', { w: 32, h: 32, seed: 4 }));
    c.material('sole', '#24160e');
    const S = new Sculpt();
    const body = humanoid(c, S, {
      mats: { pelvis: 'trousers', torso: 'gambeson', upper: 'gambeson', fore: 'leather', hand: 'glove', thigh: 'trousers', shin: 'boot', foot: 'boot' },
      waist: [0.19, 0.165], chest: [0.205, 0.165], hipW: 0.18, hipD: 0.145, neckR: 0.06, delt: 0.074, trap: 0.06, belly: 0.03,
      arm: [0.066, 0.056, 0.048], leg: [0.084, 0.068, 0.058], hand: { len: 0.09, w: 0.056, t: 0.028 }, foot: { len: 0.23, w: 0.12, h: 0.095 },
    });
    body.add(torus(W(R.spine, 0, 0.01, 0.01), 0.19, 0.024, [0, 0, 0], 0.88), { bone: R.spine, mat: 'leather', k: 0.008, sigma: 0.025 });
    body.add(box(W(R.spine, 0, 0.01, 0.17), [0.045, 0.036, 0.014], 0.008), { bone: R.spine, mat: 'gold', k: 0.004 });
    for (const side of ['L', 'R']) {
      const kn = R['kn' + side], el = R['el' + side];
      body.add(torus(W(kn, 0, -0.035, 0), 0.075, 0.026, WR(kn)), { bone: kn, mat: 'fur', k: 0.012 });   // fur boot cuffs
      body.add(torus(W(el, 0, -0.06, 0), 0.06, 0.012, WR(el)), { bone: el, mat: 'steel', k: 0.006 }); // bracer bands
    }
    S.paint(box([0, 0.006, 0], [1, 0.016, 1], 0.001), 'sole', ['body']);
    // mail skirt below the gambeson
    const ms = S.group('mailskirt', { k: 0.01, mat: 'mail', bone: R.hips });
    ms.add(shell(cone(W(R.hips, 0, 0.04, 0.0), W(R.hips, 0, -0.15, 0.0), 0.2, 0.235), 0.0108));
    ms.clip(box(W(R.hips, 0, -0.06, 0), [0.4, 0.1, 0.4], 0.003));
    // fur mantle and steel pauldrons
    const fur = S.group('fur', { k: 0.03, mat: 'fur', bone: R.spine });
    fur.add(torus(W(R.spine, 0, T * 0.9, -0.012), 0.15, 0.058, [0.12, 0, 0], 0.85));
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; fur.add(ell(W(R.spine, Math.cos(a) * 0.17, T * 0.86 + Math.sin(i * 2.1) * 0.012, Math.sin(a) * 0.14 - 0.012), [0.05, 0.045, 0.05]), { k: 0.03 }); }
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1, sh = R['sh' + side];
      const pg = S.group('paul' + side, { k: 0.008, mat: 'steel', bone: sh });
      pg.add(shell(ell(W(sh, sx * 0.012, -0.01, 0), [0.1, 0.09, 0.095], WR(sh)), 0.0108));
      pg.add(shell(ell(W(sh, sx * 0.02, -0.05, 0), [0.096, 0.08, 0.092], WR(sh)), 0.0108));
      pg.clip(box(W(sh, sx * 0.01, 0.03, 0), [0.14, 0.08, 0.14], 0.004, WR(sh)));
    }
    // head: bulbous nose, ruddy cheeks, iron horned helm, enormous beard, bushy brows on bones
    const hd = sculptHead(c, S, { R: 0.11, H: 0.23, jaw: 1.15, chin: 1.0, brow: 1.7, jawAngle: true, nose: { len: 1.15, r: 1.7, tip: 1.9 }, noseV: 0.36, lips: false });
    c.makeFace(FACE_SPECS.durgan, hd);
    const { R: hr, H, yc } = hd;
    const helm = S.group('helm', { fine: true, k: 0.006, mat: 'steel', bone: R.head });
    helm.add(shell(ell(hd.P(0, yc + H * 0.66, -hr * 0.1), [hr * 1.16, H * 0.44, hr * 1.22]), 0.0075));
    helm.clip(box(hd.P(0, yc + H * 0.73 + 0.15, 0), [0.3, 0.15, 0.3], 0.004));
    helm.add(torus(hd.P(0, yc + H * 0.745, -hr * 0.1), hr * 1.17, 0.012, [0, 0, 0], 1.04), { k: 0.004 });
    helm.add(torus(hd.P(0, yc + H * 0.66, -hr * 0.1), H * 0.44 + 0.007, 0.008, [0, 0, Math.PI / 2], (hr * 1.22 + 0.007) / (H * 0.44 + 0.007)), { k: 0.004 }); // crest band
    helm.add(box(hd.P(0, yc + H * 0.62, hr * 1.1), [0.012, H * 0.13, 0.008], 0.004, [-0.12, 0, 0]), { k: 0.004 });   // nasal guard
    for (const sx of [-1, 1]) lockOn(helm, [hd.P(sx * hr * 1.0, yc + H * 0.86, -hr * 0.05), hd.P(sx * hr * 1.75, yc + H * 0.95, 0.0), hd.P(sx * hr * 1.95, yc + H * 1.38, hr * 0.15)], 0.03, 0.005, { k: 0.008, n: 7, pow: 1.1, mat: 'horn' });
    const bb = c.bone(R.head, 0, yc + H * 0.05, hr * 0.5);
    const beard = S.group('beard', { fine: true, k: 0.02, mat: 'beard', bone: R.head, sigma: 0.03 });
    beard.add(ell(hd.P(0, yc + H * 0.2, hr * 0.45), [hr * 1.0, H * 0.26, hr * 0.62]));
    beard.add(ell(W(bb, 0, -0.08, 0.035), [hr * 0.98, 0.11, hr * 0.55]), { bone: bb });
    beard.add(ell(W(bb, 0, -0.2, 0.06), [hr * 0.78, 0.09, hr * 0.42]), { bone: bb });
    beard.add(ell(W(bb, 0, -0.29, 0.065), [hr * 0.45, 0.06, hr * 0.3]), { bone: bb });
    for (const sx of [-1, 1]) {
      beard.add(ell(hd.P(sx * hr * 0.88, yc + H * 0.44, -hr * 0.05), [hr * 0.18, H * 0.2, hr * 0.32]));                                   // sideburns
      lockOn(beard, [hd.P(sx * 0.008, hd.noseY - 0.008, hr * 1.04), hd.P(sx * hr * 0.55, hd.noseY - 0.02, hr * 1.02), hd.P(sx * hr * 0.95, hd.noseY - 0.07, hr * 0.7)], 0.017, 0.005, { mat: 'beardL', k: 0.008 }); // mustache
      lockOn(beard, [W(bb, sx * 0.07, -0.22, 0.06), W(bb, sx * 0.08, -0.3, 0.07), W(bb, sx * 0.065, -0.39, 0.06)], 0.022, 0.009, { bone: bb, k: 0.006 }); // braids
      beard.add(cyl(W(bb, sx * 0.067, -0.37, 0.062), 0.015, 0.01, 0.003), { bone: bb, mat: 'gold', k: 0.002 });
    }
    for (let i = 0; i < 7; i++) { const x = (i - 3) * 0.03; lockOn(beard, [W(bb, x, -0.06, 0.08), W(bb, x * 1.15, -0.2, 0.1), W(bb, x * 0.85, -0.34 + Math.abs(x) * 0.9, 0.08)], 0.024, 0.004, { bone: bb, k: 0.012, mat: i % 2 ? 'beardL' : 'beard' }); }
    c.addSpring(bb, 'x', { base: 0, src: 'vy', gain: 0.22, k: 60, d: 6, min: -0.4, max: 0.4 });
    c.addSpring(bb, 'z', { base: 0, src: 'vx', gain: 0.14, k: 50, d: 6, min: -0.3, max: 0.3 });
    const browY = hd.eyeY + H * 0.085;
    c.brows = [-1, 1].map((sx) => c.bone(R.head, sx * hr * 0.4, browY, hr * 0.92));
    const brows = S.group('brows', { fine: true, k: 0.008, mat: 'beardL', bone: R.head });
    c.brows.forEach((b, i) => { const sx = i ? 1 : -1; lockOn(brows, [W(b, -sx * 0.03, -0.004, 0), W(b, sx * 0.0, 0.01, 0.01), W(b, sx * 0.045, -0.006, -0.004)], 0.014, 0.006, { bone: b, k: 0.006 }); });
    c.finish(S);
    c.backItem = backWeapon(c, R.spine, { bp: 'axe', ids: ['iron', 'iron', 'coal', 'bat_fang'], grade: 2 }, [-0.12, -0.02, -0.22], [0.15, 0, -0.8], 1.5);
    c.extraUpdate = () => {
      const e = c.expr;
      const ang = e === 'angry' || e === 'determined' ? 0.4 : e === 'sad' || e === 'hurt' ? -0.35 : e === 'surprised' ? -0.1 : 0.05;
      const lift = e === 'surprised' ? 0.016 : e === 'angry' ? -0.007 : 0;
      c.brows[0].rotation.z = ang; c.brows[1].rotation.z = -ang;
      c.brows[0].position.y = browY + lift; c.brows[1].position.y = browY + lift;
    };
    c.headTop = 0.32;
  },

  // ================================================================ CLOVER — rabbit scout
  clover(c) {
    c.skeleton({ hipH: 0.65, legUp: 0.3, legLo: 0.29, footH: 0.06, hipX: 0.065, torsoH: 0.35, shY: 0.3, shX: 0.125, armUp: 0.22, armLo: 0.19, neckH: 0.04, handLen: 0.065 });
    const R = c.rig, d = c.dims, T = d.torsoH;
    c.material('skin', '#f4dccc');
    c.material('tunic', '#3e3446', fabricTex('#3e3446', { w: 64, h: 64, seamsX: [31] }));
    c.material('vest', '#6a4a3a', quiltTex('#6a4a3a', { w: 32, h: 32, cell: 6 }));
    c.material('scarf', '#b8384a', fabricTex('#b8384a', { w: 32, h: 32, bands: [{ y0: 6, y1: 8, color: '#e8c8b0' }, { y0: 22, y1: 24, color: '#e8c8b0' }] }));
    c.material('trousers', '#5a4632', fabricTex('#5a4632', { w: 32, h: 32, patchesN: 1 }));
    c.material('boot', '#7a4a2a', leatherTex('#7a4a2a', { w: 64, h: 64, stitchY: [16] }));
    c.material('glove', '#4a3428', leatherTex('#4a3428', { w: 32, h: 32 }));
    c.material('belt', '#3a2214', leatherTex('#3a2214', { w: 32, h: 32, stitchY: [4, 27] }));
    c.material('fur', '#f4ece6', furTex('#f4ece6', { w: 32, h: 32, seed: 9 }));
    c.material('earIn', '#e8a8b0');
    c.material('hair', '#f2eae6', hairTex('#f2eae6', { w: 32, h: 32 }));
    c.material('brass', '#c89a40', metalTex('#c89a40', { w: 16, h: 16 }));
    c.material('sole', '#24160e');
    const S = new Sculpt();
    const body = humanoid(c, S, {
      mats: { pelvis: 'trousers', torso: 'tunic', upper: 'tunic', fore: 'tunic', hand: 'glove', thigh: 'trousers', shin: 'boot', foot: 'boot' },
      waist: [0.086, 0.07], chest: [0.104, 0.08], hipW: 0.104, hipD: 0.084, neckR: 0.031, delt: 0.04, trap: 0.03,
      arm: [0.036, 0.031, 0.026], leg: [0.055, 0.04, 0.032], hand: { len: 0.065, w: 0.034, t: 0.015 }, foot: { len: 0.19, w: 0.076, h: 0.07 },
    });
    for (const side of ['L', 'R']) {
      const kn = R['kn' + side], el = R['el' + side];
      body.add(torus(W(kn, 0, -0.02, 0), 0.048, 0.016, WR(kn)), { bone: kn, mat: 'boot', k: 0.01 }); // folded boot tops
      body.add(torus(W(el, 0, -d.armLo * 0.72, 0), 0.03, 0.009, WR(el)), { bone: el, mat: 'glove', k: 0.006 });
    }
    body.add(torus(W(R.hips, 0, 0.025, 0.004), 0.1, 0.013, [0, 0, 0.08], 0.85), { bone: R.hips, mat: 'belt', k: 0.005, sigma: 0.025 });
    body.add(ell(W(R.hips, -0.085, -0.01, 0.06), [0.03, 0.034, 0.022]), { bone: R.hips, mat: 'belt', k: 0.006 }); // pouch
    S.paint(box([0, 0.006, 0], [1, 0.015, 1], 0.001), 'sole', ['body']);
    // padded scout vest: a quilted shell over the torso, open at the front
    const vest = S.group('vest', { k: 0.01, mat: 'vest', bone: R.spine });
    vest.shellOf(body, ['torso'], 0.013);
    vest.clip(box(W(R.spine, 0, T * 0.42, 0), [0.3, T * 0.44, 0.3], 0.004));
    vest.sub(box(W(R.spine, 0, T * 0.45, 0.13), [0.012, T * 0.5, 0.06], 0.004), { k: 0.004 });
    // scarf with two tails on spring bones
    const sc = S.group('scarf', { fine: true, k: 0.012, mat: 'scarf', bone: R.neck });
    sc.add(torus(W(R.neck, 0, -0.005, 0.004), 0.045, 0.022, [0.3, 0, 0], 0.95));
    sc.add(torus(W(R.neck, 0, 0.025, -0.002), 0.04, 0.018, [0.12, 0, 0.1], 0.95));
    sc.add(ell(W(R.neck, 0.03, -0.03, 0.055), [0.028, 0.03, 0.02]));
    const tails = [c.bone(R.neck, 0.025, -0.01, -0.035), c.bone(R.neck, -0.012, -0.012, -0.04)];
    tails.forEach((tb, i) => {
      tb.rotation.x = 0.35;
      tb.updateMatrixWorld(true);
      sc.add(cone(W(tb, 0, 0, 0), W(tb, 0.004, -0.11 + i * 0.03, -0.01), 0.016, 0.012), { bone: tb, k: 0.008 });
      sc.add(cone(W(tb, 0.004, -0.11 + i * 0.03, -0.01), W(tb, 0.01, -0.2 + i * 0.05, -0.012), 0.012, 0.008), { bone: tb, k: 0.008 });
      c.addSpring(tb, 'x', { base: 0.35, src: 'vz', gain: 0.4, k: 45, d: 4.5, wobble: 0.05, phase: i * 2 });
      c.addSpring(tb, 'z', { base: 0, src: 'vx', gain: -0.25, k: 45, d: 4.5, wobble: 0.03, phase: i });
    });
    // fluffy tail
    const tb = c.bone(R.hips, 0, -0.03, -0.09);
    const tail = S.group('tail', { k: 0.02, mat: 'fur', bone: tb });
    tail.add(ell(W(tb, 0, 0, -0.025), [0.045, 0.042, 0.04]));
    for (const [x, y] of [[0.025, 0.02], [-0.025, 0.018], [0, -0.025]]) tail.add(ell(W(tb, x, y, -0.04), [0.026, 0.025, 0.024]));
    c.addSpring(tb, 'y', { base: 0, src: 'vx', gain: 0.4, wobble: 0.15, k: 60, d: 5 });
    // head: sharp watchful face, white bob, long ears (one floppy) on spring bones
    const hd = sculptHead(c, S, { R: 0.082, H: 0.195, jaw: 0.92, chin: 0.85, brow: 0.9, nose: { len: 0.85, r: 0.85, tip: 0.85 }, ears: false });
    c.makeFace(FACE_SPECS.clover, hd);
    const { R: hr, H, yc } = hd;
    const hair = S.group('hair', { fine: true, k: 0.012, mat: 'hair', bone: R.head });
    hair.add(ell(hd.P(0, yc + H * 0.66, -hr * 0.1), [hr * 1.12, H * 0.38, hr * 1.2]));
    hair.sub(ell(hd.P(0, yc + H * 0.32, hr * 0.95), [hr * 1.2, H * 0.42, hr * 0.95]), { k: 0.016 });
    hair.sub(ell(hd.P(0, yc - H * 0.05, -hr * 0.2), [hr * 1.6, H * 0.3, hr * 1.6]), { k: 0.02 });
    const locks = [];
    for (let i = 0; i < 5; i++) { const x = -hr * 0.6 + i * hr * 0.3; locks.push([[x, yc + H * 0.93, hr * 0.5], [x * 1.05, yc + H * 0.86, hr * 1.06], [x * 1.12 + (i % 2 ? 0.006 : -0.004), yc + H * (0.66 + hash(i, 8) * 0.06), hr * 1.04], 0.019]); }
    for (let i = 0; i < 7; i++) { const a = -1.4 + i * 0.47; locks.push([[Math.sin(a) * hr * 0.85, yc + H * 0.7, -Math.cos(a) * hr * 0.75], [Math.sin(a) * hr * 1.2, yc + H * 0.5, -Math.cos(a) * hr * 1.05], [Math.sin(a) * hr * 1.12, yc + H * 0.24, -Math.cos(a) * hr * 1.0], 0.026]); }
    hairLocks(hair, hd, locks);
    const ears = S.group('ears', { fine: true, k: 0.012, mat: 'fur', bone: R.head, sigma: 0.025 });
    c.ears = [];
    for (const sx of [1, -1]) {
      const floppy = sx < 0;
      const base = c.bone(R.head, sx * hr * 0.42, yc + H * 0.93, -hr * 0.12);
      base.rotation.set(-0.12, 0, -sx * (floppy ? 0.5 : 0.16));
      base.updateMatrixWorld(true);
      const tip = c.bone(base, 0, 0.15, 0);
      if (floppy) tip.rotation.set(-0.2, 0, 2.1);
      tip.updateMatrixWorld(true);
      ears.add(ell(W(base, 0, 0.075, 0), [0.03, 0.085, 0.015], WR(base)), { bone: base });
      ears.add(ell(W(tip, 0, 0.06, 0), [0.027, 0.075, 0.013], WR(tip)), { bone: tip });
      ears.sub(ell(W(base, 0, 0.09, 0.013), [0.017, 0.07, 0.006], WR(base)), { k: 0.005 });
      ears.sub(ell(W(tip, 0, 0.055, 0.012), [0.015, 0.055, 0.0055], WR(tip)), { k: 0.005 });
      S.paint(ell(W(base, 0, 0.09, 0.012), [0.016, 0.075, 0.009], WR(base)), 'earIn', ['ears']);
      S.paint(ell(W(tip, 0, 0.055, 0.011), [0.014, 0.06, 0.008], WR(tip)), 'earIn', ['ears']);
      c.addSpring(base, 'x', { base: -0.12, src: 'vy', gain: 0.35, k: 70, d: 6, wobble: 0.02, phase: sx, extra: (ch) => -ch.pose.ears * 0.25 });
      if (floppy) c.addSpring(tip, 'z', { base: 2.1, src: 'vy', gain: -0.7, k: 30, d: 3.5, wobble: 0.08, phase: 2 });
      else c.addSpring(tip, 'x', { base: 0, src: 'vy', gain: 0.4, k: 55, d: 4, wobble: 0.03, phase: sx * 2, extra: (ch) => -ch.pose.ears * 0.3 });
      c.addSpring(base, 'z', { base: base.rotation.z, src: 'vx', gain: -0.2, k: 60, d: 6 });
      c.ears.push({ base, tip });
    }
    c.finish(S);
    // twin daggers at the small of the back
    const back = joint(R.hips, 0, 0, 0);
    for (const sx of [-1, 1]) backWeapon(c, back, { bp: 'dagger', ids: ['iron', 'iron'], grade: 1 }, [sx * 0.09, 0.04, -0.08], [Math.PI + 0.5, 0, sx * 0.4], 1.0);
    c.backItem = back;
    c.headTop = 0.42;
  },
};

/** Build a playable explorer. */
export function buildCharacter(id) { return new Character(id); }
