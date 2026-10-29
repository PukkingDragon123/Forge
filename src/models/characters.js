// The four explorers: heroic voxel figures on the party's fine grid (0.02 world units, so Bran
// stands about 88 voxels tall), each a bold silhouette with oversized signature gear and one accent
// colour, faces always hidden. Every limb is its own cached, greedy-meshed voxel part hung on a
// skeleton of joints. Animation works like a 2D rig: snappy key poses (wind-up, a fast lunge with a
// smear stretch, an impact hold, a recovery), springs for secondary motion (cloth, scarves, ears,
// braids, charms, the held weapon), breathing, squash, and body language in place of faces.
// The designs themselves live in vox_char_party.js.
import * as THREE from 'three';
import { CHARACTERS } from '../data/characters.js';
import { VPart, VOX_PARTY, voxToon, voxGlow } from './vox_char_kit.js';
import { Kindle } from './vox_char_kindle.js';
import { BUILD } from './vox_char_party.js';

export { Kindle };

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
const outQ = (t) => 1 - (1 - t) * (1 - t);
const outC = (t) => 1 - Math.pow(1 - t, 3);
const inQ = (t) => t * t;
const lin = (t) => t;
const hold = () => 0;
const outBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** World size of one party voxel. */
export const VS = VOX_PARTY;

// ------------------------------------------------------------------ springs for secondary motion
export class Spring {
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

// ------------------------------------------------------------------ animation library
// Pose channels (radians / metres). Arms: sh=forward swing, ab=abduct, tw=twist, el=elbow bend.
// Legs: hip=forward, hab=abduct, kn=knee bend, ft=toe point. Spine: lean/twist/side. Head: nod/turn/tilt.
// squash: impact squash (negative stretches), smear: the fast-swing stretch along the strike,
// flare: signature glow (runes, gauntlet coals, ore studs, charms).
const CH = ['dy', 'bx', 'by', 'bz', 'hrx', 'hry', 'hrz', 'lean', 'twist', 'side', 'nod', 'turn', 'tilt',
  'lSh', 'lAb', 'lTw', 'lEl', 'rSh', 'rAb', 'rTw', 'rEl', 'lHip', 'lHab', 'lKn', 'lFt', 'rHip', 'rHab', 'rKn', 'rFt', 'ears', 'squash', 'smear', 'flare'];
const REST = { lAb: 0.14, rAb: 0.14, lEl: 0.18, rEl: 0.18 };

/**
 * Key poses, like a 2D rig's timeline: K = [[k, pose, ease], ...] with k in 0..1. The ease on a key
 * shapes the move INTO it. Channels a pose leaves out sit at rest.
 */
function keys(k, K) {
  let i = 0;
  while (i < K.length - 2 && k >= K[i + 1][0]) i++;
  const [ka, pa] = K[i], [kb, pb, ease = sm] = K[i + 1];
  const t = ease(seg(k, ka, kb));
  const out = {};
  for (const n in pa) out[n] = pa[n] + ((pb[n] ?? REST[n] ?? 0) - pa[n]) * t;
  for (const n in pb) if (!(n in pa)) out[n] = (REST[n] ?? 0) + (pb[n] - (REST[n] ?? 0)) * t;
  return out;
}
const over = (base, o) => Object.assign({}, base, o);

/** Seated leg pose (merged when character.seated is true). */
function sitLegs(c) {
  const d = c.dims, drop = c.seatH - d.hipH, hip = 1.45;
  const reach = c.seatH - d.footH;
  const phi = reach < d.legLo ? Math.acos(Math.max(0, reach) / d.legLo) : 0; // shin angles forward so the feet stay planted
  return { dy: drop, lHip: hip, rHip: hip, lKn: hip - phi, rKn: hip - phi, lHab: 0.12, rHab: 0.12, lFt: phi, rFt: phi };
}

/** Fighting stance, the base every swing starts from and returns to. */
function stance(c) {
  const s = { dy: -0.05, lean: 0.14, twist: 0.25, lHip: 0.3, rHip: -0.25, lKn: 0.45, rKn: 0.3, lHab: 0.1, rHab: 0.12, rSh: 0.8, rEl: 0.95, rAb: 0.28, lSh: 0.6, lEl: 1.3, lAb: 0.22, nod: 0.06, turn: -0.15 };
  if (c.id === 'durgan') Object.assign(s, { dy: -0.05, lean: 0.2, lSh: 0.3, lEl: 0.2, lAb: -0.22, lTw: 0, rSh: 0.7, rEl: 1.1, lHab: 0.2, rHab: 0.2 }); // the tower shield set before him
  if (c.id === 'clover') Object.assign(s, { dy: -0.09, lean: 0.3, lKn: 0.8, rKn: 0.6, lHip: 0.5, rHip: -0.1, lSh: 0.9, lEl: 1.5, rSh: 0.5, rEl: 1.2, nod: 0.1 }); // low and coiled
  if (c.id === 'elio') Object.assign(s, { lean: 0.06, lSh: 1.2, lEl: 0.7, lAb: 0.3, lTw: 0.5, rSh: 0.5, rEl: 1.0, flare: 0.25 }); // a hand open, ready to cast
  return s;
}

const ANIMS = {
  idle: {
    // a breathing loop with personality: weight shifts, shoulders rise with each breath
    loop: true, lambda: 10, f: (t, c) => {
      const b = Math.sin(t * 2.2), w = Math.sin(t * 0.8);
      const p = { dy: b * 0.006, lean: 0.02, lAb: 0.15 + b * 0.025, rAb: 0.15 + b * 0.025, lEl: 0.22, rEl: 0.22, nod: Math.sin(t * 0.7) * 0.04 - b * 0.015, turn: Math.sin(t * 0.37) * 0.15, tilt: Math.sin(t * 0.5) * 0.04, side: w * 0.02, hrz: -w * 0.03 };
      if (c.id === 'bran') Object.assign(p, { lAb: 0.74 + b * 0.02, rAb: 0.74 + b * 0.02, lEl: 1.75, rEl: 1.75, lTw: -2.0, rTw: -2.0, lean: -0.07, nod: -0.06 + Math.sin(t * 0.7) * 0.03, lHab: 0.08, rHab: 0.08 }); // fists on hips, chest out
      if (c.id === 'elio') Object.assign(p, { lSh: 1.05 + b * 0.04, lEl: 1.25, lAb: 0.15, lTw: 0.7, rSh: 0.25, rEl: 0.6, rAb: 0.05, nod: 0.06 + Math.sin(t * 0.7) * 0.04, tilt: Math.sin(t * 0.5) * 0.08, flare: 0.15 + Math.max(0, Math.sin(t * 1.3)) * 0.1 }); // a palm up, conjuring
      if (c.id === 'durgan') Object.assign(p, { lSh: 0.08, lAb: 0.12, lEl: 0.3, rAb: 0.62, rEl: 1.65, rTw: -1.9, lean: -0.06, lHab: 0.16, rHab: 0.16, nod: -0.05 + Math.sin(t * 0.7) * 0.03 }); // shield grounded, fist on belt
      if (c.id === 'clover') {
        const hop = Math.max(0, Math.sin(t * 4.2));
        Object.assign(p, { dy: hop * hop * 0.016, squash: (1 - hop) > 0.92 ? 0.25 : 0, lHip: Math.sin(t * 2.1) * 0.06, rHip: -Math.sin(t * 2.1) * 0.06, lKn: 0.1, rKn: 0.1, side: Math.sin(t * 2.1) * 0.05, rAb: 0.62, rEl: 1.75, rTw: -2.0, lSh: 0.85, lEl: 1.7, lAb: 0.1, tilt: 0.12 + Math.sin(t * 0.8) * 0.05, ears: Math.sin(t * 5) > 0.95 ? 1 : 0 }); // springing on the toes, flipping a coin
      }
      return p;
    },
  },
  idleCombat: {
    loop: true, lambda: 18, expr: 'determined', f: (t, c) => {
      const b = Math.sin(t * (c.id === 'clover' ? 7 : 4));
      const s = stance(c);
      return over(s, { dy: s.dy + b * 0.01, rSh: s.rSh + b * 0.04, lSh: s.lSh - b * 0.03, squash: c.id === 'clover' ? Math.max(0, -b) * 0.15 : 0 });
    },
  },
  sit: { loop: true, exact: true, f: (t, c) => ({ ...sitLegs(c), lean: 0.08, lSh: 0.45, rSh: 0.45, lEl: 0.7, rEl: 0.7, lAb: 0.05, rAb: 0.05, nod: Math.sin(t * 0.6) * 0.05, dy: sitLegs(c).dy + Math.sin(t * 2) * 0.004, turn: Math.sin(t * 0.3) * 0.2 }) },
  sitTalk: {
    loop: true, exact: true, f: (t, c) => {
      const g = Math.sin(t * 2.7), g2 = Math.sin(t * 1.3);
      return { ...sitLegs(c), lean: 0.06 + g2 * 0.04, twist: g2 * 0.12, lSh: 0.45, lEl: 0.7, rSh: 0.9 + g * 0.35, rEl: 1.1 + g * 0.3, rAb: 0.2 + Math.max(0, g) * 0.3, rTw: g * 0.3, nod: Math.sin(t * 5.4) * 0.07, tilt: g2 * 0.1, turn: g2 * 0.2 };
    },
  },
  walk: {
    // bouncy and characterful: high on the passing pose, a squash on each contact, arms trailing
    loop: true, lambda: 20, f: (t, c) => {
      const id = c.id, per = { bran: 0.52, elio: 0.58, durgan: 0.36, clover: 0.4 }[id] || 0.5;
      const p = (t / per) * Math.PI, s = Math.sin(p), co = Math.cos(p), ac = Math.abs(co);
      const B = { bran: 0.024, elio: 0.012, durgan: 0.026, clover: 0.05 }[id] || 0.02;
      const amp = { durgan: 0.62, clover: 0.62, elio: 0.42 }[id] || 0.55;
      const r = {
        dy: (ac - 0.5) * B, squash: Math.pow(1 - ac, 6) * 0.35, lean: 0.07, lHip: s * amp, rHip: -s * amp,
        lKn: 0.12 + Math.max(0, co) * 0.9, rKn: 0.12 + Math.max(0, -co) * 0.9, lFt: Math.max(0, -s) * 0.3, rFt: Math.max(0, s) * 0.3,
        lSh: -s * 0.55, rSh: s * 0.55, lEl: 0.35 + Math.max(0, s) * 0.35, rEl: 0.35 + Math.max(0, -s) * 0.35, lAb: 0.15, rAb: 0.15,
        hry: s * 0.12, twist: -s * 0.15, nod: 0.02 - (ac - 0.5) * 0.06, side: s * 0.03,
      };
      if (id === 'bran') Object.assign(r, { twist: -s * 0.2, lAb: 0.22, rAb: 0.22 }); // shoulders rolling
      if (id === 'durgan') Object.assign(r, { side: s * 0.12, hrz: s * 0.09, lSh: 0.15 - s * 0.15, lEl: 0.3, lAb: 0.1, rAb: 0.3 }); // stomping waddle behind the shield
      if (id === 'clover') Object.assign(r, { dy: ac * ac * B - 0.01, rAb: 0.5, rEl: 1.4, rSh: 0.25 - s * 0.2, tilt: s * 0.06 }); // a springy skip
      if (id === 'elio') Object.assign(r, { lSh: 0.5 - s * 0.15, rSh: 0.5 + s * 0.15, lEl: 1.05, rEl: 1.05, lAb: -0.05, rAb: -0.05 }); // gliding, hands in sleeves
      return r;
    },
  },
  run: {
    loop: true, lambda: 24, f: (t, c) => {
      const per = c.id === 'durgan' ? 0.24 : c.id === 'clover' ? 0.27 : 0.3;
      const p = (t / per) * Math.PI;
      const s = Math.sin(p), co = Math.cos(p), ac = Math.abs(co);
      const r = {
        dy: ac * 0.06 - 0.025, squash: Math.pow(1 - ac, 6) * 0.45, lean: 0.32, lHip: s * 0.95, rHip: -s * 0.95,
        lKn: 0.3 + Math.max(0, co) * 1.5, rKn: 0.3 + Math.max(0, -co) * 1.5, lFt: Math.max(0, -s) * 0.4, rFt: Math.max(0, s) * 0.4,
        lSh: -s * 1.0, rSh: s * 1.0, lEl: 1.35, rEl: 1.35, lAb: 0.22, rAb: 0.22, nod: -0.1, twist: -s * 0.18,
      };
      if (c.id === 'clover') Object.assign(r, { lean: 0.48, dy: ac * 0.08 - 0.04 });
      if (c.id === 'durgan') Object.assign(r, { lSh: 0.35, lEl: 0.15, lAb: -0.3, lTw: 0, side: s * 0.08, lean: 0.38 }); // shield charge
      return r;
    },
  },
  jump: {
    dur: 0.9, lambda: 30, expr: 'surprised', f: (t, c, k) => keys(k, [
      [0, {}],
      [0.22, { squash: 0.9, dy: -0.14, lKn: 1.3, rKn: 1.3, lHip: 0.8, rHip: 0.8, lSh: -0.6, rSh: -0.6, lAb: 0.4, rAb: 0.4, lean: 0.4 }],
      [0.32, { squash: -0.6, by: 0.18, lKn: 0.4, rKn: 0.3, lHip: 0.3, rHip: 0.1, lSh: 2.6, rSh: 2.6, lAb: 0.4, rAb: 0.4, lean: -0.1, nod: -0.2 }, outQ],
      [0.55, { squash: -0.2, by: 0.5, lKn: 0.9, rKn: 0.6, lHip: 0.5, rHip: 0.3, lSh: 2.5, rSh: 2.5, lAb: 0.5, rAb: 0.5, nod: -0.2 }, outQ],
      [0.8, { squash: -0.1, by: 0.02, lKn: 0.5, rKn: 0.4, lHip: 0.4, rHip: 0.3, lSh: 1.2, rSh: 1.2, lAb: 0.6, rAb: 0.6 }, inQ],
      [0.88, { squash: 1.2, dy: -0.1, lKn: 1.0, rKn: 1.0, lHip: 0.7, rHip: 0.7, lAb: 0.5, rAb: 0.5, lean: 0.3 }, outQ],
      [1, {}],
    ]),
  },
  fall: {
    loop: true, lambda: 20, expr: 'surprised', f: (t) => {
      const w = Math.sin(t * 18), w2 = Math.cos(t * 15);
      return { lSh: 2.6 + w * 0.4, rSh: 2.6 - w * 0.4, lAb: 0.6 + w2 * 0.3, rAb: 0.6 - w2 * 0.3, lEl: 0.5, rEl: 0.5, lHip: 0.6 + w * 0.5, rHip: 0.6 - w * 0.5, lKn: 0.9, rKn: 0.9, lean: -0.2, nod: -0.3, squash: -0.3 };
    },
  },
  hammer: {
    loop: true, lambda: 32, period: 1.05, impact: 0.66, swing: true, f: (t, c) => {
      const k = (t % 1.05) / 1.05;
      const up = sm(seg(k, 0.02, 0.55));
      const down = inQ(seg(k, 0.55, 0.66));
      const v = up * (1 - down);
      const bounce = Math.sin(seg(k, 0.66, 0.85) * Math.PI) * 0.12;
      return {
        rSh: 0.95 + v * 1.95 + bounce, rEl: 0.35 + v * 0.9, rAb: 0.15, lSh: 0.95, lEl: 0.75, lAb: -0.05,
        lean: 0.22 - v * 0.28 + down * 0.05, twist: -0.15 + v * 0.1, nod: 0.3 - v * 0.2, dy: -0.02 - (1 - v) * 0.02, lHip: 0.2, rHip: -0.15, lKn: 0.2, rKn: 0.15,
        squash: k > 0.66 && k < 0.74 ? 0.35 : 0, smear: k > 0.58 && k < 0.66 ? 1 : 0, flare: k > 0.64 && k < 0.8 ? 1 : 0.2,
      };
    },
  },
  mine: {
    loop: true, lambda: 32, period: 1.1, impact: 0.62, swing: true, f: (t) => {
      const k = (t % 1.1) / 1.1;
      const up = sm(seg(k, 0.02, 0.5));
      const down = inQ(seg(k, 0.5, 0.62));
      const v = up * (1 - down);
      return {
        rSh: 0.6 + v * 2.3, lSh: 0.5 + v * 2.2, rEl: 0.3 + v * 0.7, lEl: 0.5 + v * 0.7, rAb: -0.1, lAb: -0.25,
        lean: 0.28 - v * 0.38, dy: -0.04 + v * 0.02, lHip: 0.3, rHip: -0.2, lKn: 0.35, rKn: 0.25, nod: 0.2 - v * 0.25,
        squash: k > 0.62 && k < 0.7 ? 0.3 : -v * 0.15, smear: k > 0.54 && k < 0.62 ? 0.8 : 0,
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
    loop: true, lambda: 24, expr: 'happy', f: (t) => {
      const g = Math.sin(t * 9), up = Math.max(0, g);
      return { by: up * 0.12, squash: g < -0.8 ? 0.5 : -up * 0.25, lSh: 2.8 + g * 0.2, rSh: 2.8 - g * 0.2, lAb: 0.35, rAb: 0.35, lEl: 0.25, rEl: 0.25, lean: -0.1, nod: -0.2, lKn: Math.max(0, -g) * 0.4, rKn: Math.max(0, -g) * 0.4, flare: 0.6 };
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
      return { lean: -0.18 + g * 0.02, nod: -0.25, dy: g * 0.008, lSh: 0.7, lEl: 1.5, lAb: -0.2, rSh: 0.3, rAb: 0.3, rEl: 0.6, tilt: Math.sin(t * 3) * 0.1, squash: g * 0.08 };
    },
  },
  shrug: { loop: true, expr: 'smug', f: (t) => ({ lAb: 0.45, rAb: 0.45, lEl: 1.5, rEl: 1.5, lTw: 1.4, rTw: 1.4, dy: 0.012, tilt: 0.2, nod: -0.05 }) },
  sleep: {
    loop: true, expr: 'sleepy', f: (t) => {
      const br = Math.sin(t * 1.2);
      return { lean: 0.32 + br * 0.02, nod: 0.55 + br * 0.03, tilt: 0.25, lSh: 0.25, rSh: 0.25, lEl: 0.5, rEl: 0.5, lAb: 0.05, rAb: 0.05, dy: br * 0.004 };
    },
  },
  // ---- attacks: wind-up, a fast smear into the strike, an impact hold, recovery
  slash: {
    dur: 0.62, impact: 0.44, lambda: 60, expr: 'determined', swing: true, f: (t, c, k) => {
      const s = stance(c);
      const strike = { rSh: 0.35, rAb: -0.7, rEl: 0.15, rTw: -0.5, twist: 0.75, lean: 0.42, bz: 0.24, dy: -0.09, lHip: 0.7, lKn: 0.7, rHip: -0.45, rKn: 0.35, lSh: 0.4, lAb: 0.5, lEl: 0.9, nod: 0.1, turn: -0.2 };
      return keys(k, [
        [0, s],
        [0.3, over(s, { rSh: 2.5, rAb: 0.9, rEl: 0.6, rTw: 0.3, twist: -0.55, lean: -0.06, bz: -0.04, dy: -0.07, squash: 0.3, lSh: 0.9, lAb: 0.5, lEl: 1.0, nod: -0.05, lKn: 0.55 }), sm],
        [0.38, over(strike, { rSh: 1.5, rAb: 0.15, twist: 0.25, lean: 0.25, bz: 0.15, smear: 1, squash: -0.25 }), inQ],
        [0.44, over(strike, { smear: 0.3, squash: 0.45 }), outQ],
        [0.6, over(strike, { squash: 0.25 }), lin],
        [1, s, sm],
      ]);
    },
  },
  stab: {
    dur: 0.5, impact: 0.4, lambda: 60, expr: 'determined', swing: true, f: (t, c, k) => {
      const s = stance(c);
      const thrust = { rSh: 1.5, rEl: 0.0, rAb: 0.15, rTw: 0.2, twist: 0.45, lean: 0.45, bz: 0.32, dy: -0.1, lHip: 0.8, lKn: 0.7, rHip: -0.45, rKn: 0.25, lSh: 0.2, lAb: 0.6, lEl: 0.7, nod: 0.12 };
      return keys(k, [
        [0, s],
        [0.28, over(s, { rSh: 0.3, rEl: 1.9, rAb: 0.35, twist: -0.4, lean: 0.05, bz: -0.06, squash: 0.3, lKn: 0.6, rKn: 0.45 }), sm],
        [0.35, over(thrust, { rSh: 1.2, rEl: 0.5, bz: 0.2, smear: 1, squash: -0.3 }), inQ],
        [0.4, over(thrust, { smear: 0.25, squash: 0.35 }), outQ],
        [0.56, over(thrust, { squash: 0.15 }), lin],
        [1, s, sm],
      ]);
    },
  },
  chop: {
    dur: 0.66, impact: 0.5, lambda: 60, expr: 'angry', swing: true, f: (t, c, k) => {
      const s = stance(c);
      const down = { rSh: 0.45, lSh: 0.5, rEl: 0.3, lEl: 0.5, rAb: -0.05, lAb: -0.25, lean: 0.55, bz: 0.18, dy: -0.11, lHip: 0.5, rHip: -0.3, lKn: 0.75, rKn: 0.5, nod: 0.3 };
      return keys(k, [
        [0, s],
        [0.36, over(s, { rSh: 2.85, lSh: 2.75, rEl: 0.7, lEl: 0.9, rAb: 0.05, lAb: -0.15, lean: -0.3, by: 0.03, dy: -0.02, squash: -0.25, nod: -0.25, twist: 0 }), sm],
        [0.44, over(down, { rSh: 1.7, lSh: 1.7, lean: 0.15, smear: 1, squash: -0.2 }), inQ],
        [0.5, over(down, { smear: 0.3, squash: 0.65 }), outQ],
        [0.66, over(down, { squash: 0.3 }), lin],
        [1, s, sm],
      ]);
    },
  },
  smash: {
    dur: 0.82, impact: 0.6, lambda: 60, expr: 'angry', swing: true, f: (t, c, k) => {
      const s = stance(c);
      const slam = { rSh: 0.25, lSh: 0.3, rEl: 0.35, lEl: 0.5, rAb: -0.1, lAb: -0.2, lean: 0.62, bz: 0.2, dy: -0.15, lHip: 0.6, rHip: -0.3, lKn: 0.95, rKn: 0.7, nod: 0.3 };
      return keys(k, [
        [0, s],
        [0.22, over(s, { squash: 0.65, dy: -0.12, lKn: 1.1, rKn: 0.9, lHip: 0.7, lean: 0.35, rSh: 0.4, lSh: 0.4, rEl: 0.9 }), sm],
        [0.42, over(s, { by: 0.2, squash: -0.4, rSh: 3.0, lSh: 2.9, rEl: 0.6, lEl: 0.8, lean: -0.32, nod: -0.3, lKn: 0.5, rKn: 0.7, rAb: 0.05, lAb: -0.1 }), outQ],
        [0.54, over(slam, { by: 0.06, rSh: 1.5, lSh: 1.5, lean: 0.2, smear: 1, squash: -0.3 }), inQ],
        [0.6, over(slam, { smear: 0.3, squash: 0.95 }), outQ],
        [0.76, over(slam, { squash: 0.45 }), lin],
        [1, s, sm],
      ]);
    },
  },
  cast: {
    // gather the power low, then thrust both hands out; the signature glow flares on release
    dur: 0.78, impact: 0.5, lambda: 50, expr: 'determined', swing: true, f: (t, c, k) => {
      const s = stance(c);
      const rel = { lSh: 1.65, rSh: 1.55, lEl: 0.1, rEl: 0.15, lAb: 0.3, rAb: 0.3, lTw: 0.4, rTw: 0.4, lean: 0.28, bz: 0.1, dy: -0.06, lHip: 0.5, lKn: 0.5, rHip: -0.3, rKn: 0.3, nod: 0.05, flare: 1 };
      return keys(k, [
        [0, s],
        [0.4, over(s, { lSh: -0.2, rSh: -0.2, lEl: 1.6, rEl: 1.6, lAb: 0.55, rAb: 0.55, lTw: -0.8, rTw: -0.8, lean: -0.15, by: 0.03, squash: 0.35, nod: -0.25, flare: 0.5, bz: -0.03 }), sm],
        [0.46, over(rel, { smear: 0.8, squash: -0.3, flare: 0.8 }), inQ],
        [0.5, over(rel, { smear: 0.2, squash: 0.3 }), outQ],
        [0.72, over(rel, { flare: 0.9 }), lin],
        [1, s, sm],
      ]);
    },
  },
  block: {
    // brace: crouch behind the guard, a tremble of strain
    loop: true, lambda: 40, expr: 'determined', f: (t, c) => {
      const q = Math.sin(t * 31) * 0.008;
      const p = { rSh: 1.35, rEl: 1.4, rAb: -0.45, rTw: 0.3, lSh: 1.25, lEl: 1.45, lAb: -0.25, lean: 0.22 + q, dy: -0.08, lHip: 0.45, rHip: -0.35, lKn: 0.65, rKn: 0.5, nod: 0.18, squash: 0.25 };
      if (c.id === 'durgan') Object.assign(p, { lSh: 0.4, lEl: 0.15, lAb: -0.42, lTw: 0, rSh: 0.55, rEl: 1.4, rAb: 0.1, lean: 0.36 + q, dy: -0.09, twist: -0.25 }); // shoulder into the planted shield
      return p;
    },
  },
  parry: {
    dur: 0.35, lambda: 50, expr: 'determined', swing: true, f: (t, c, k) => {
      const a = outBack(seg(k, 0, 0.35)) * (1 - seg(k, 0.6, 1));
      return { rSh: 1.2 + a * 0.6, rAb: -0.5 + a * 1.2, rEl: 0.8 - a * 0.5, twist: 0.3 - a * 0.6, lean: -0.05, dy: -0.04, lHip: 0.3, lKn: 0.35, rKn: 0.25, lSh: 0.5, lEl: 1.2, smear: a > 0.6 && k < 0.2 ? 0.7 : 0 };
    },
  },
  hurt: {
    // knocked back: a snap of the head, a stagger, then settling into the stance again
    dur: 0.5, lambda: 55, expr: 'hurt', f: (t, c, k) => keys(k, [
      [0, {}],
      [0.1, { bz: -0.2, lean: -0.5, nod: -0.4, tilt: 0.22, twist: -0.2, lSh: 0.9, rSh: 0.7, lAb: 0.6, rAb: 0.7, lEl: 0.5, rEl: 0.5, squash: 0.65, dy: -0.04, lKn: 0.3, rKn: 0.45, lHip: -0.2 }, outC],
      [0.3, { bz: -0.24, lean: -0.32, nod: -0.15, tilt: 0.12, lSh: 0.5, rSh: 0.4, lAb: 0.4, rAb: 0.45, lEl: 0.6, rEl: 0.6, squash: 0.15, dy: -0.05, lKn: 0.35, rKn: 0.5 }, sm],
      [1, { dy: -0.02 }, sm],
    ]),
  },
  dodge: {
    dur: 0.5, lambda: 50, expr: 'surprised', f: (t, c, k) => keys(k, [
      [0, {}],
      [0.15, { squash: 0.6, dy: -0.08, lKn: 0.9, rKn: 1.0, lHip: 0.5, rHip: 0.4, lean: 0.3, lSh: -0.3, rSh: -0.3, lAb: 0.4, rAb: 0.4 }, sm],
      [0.45, { squash: -0.35, bz: -0.45, by: 0.14, lean: 0.2, lKn: 0.9, rKn: 1.1, lHip: 0.6, rHip: 0.3, lSh: -0.5, rSh: -0.4, lAb: 0.6, rAb: 0.6, nod: 0.1 }, outQ],
      [0.7, { squash: 0.55, bz: -0.42, dy: -0.06, lKn: 0.7, rKn: 0.8, lHip: 0.4, rHip: 0.3, lean: 0.25, lAb: 0.5, rAb: 0.5 }, inQ],
      [1, {}, sm],
    ]),
  },
  victory: {
    // a pop into the air, then the proud pose, breathing
    loop: true, lambda: 26, expr: 'happy', f: (t, c) => {
      const b = Math.sin(t * 3);
      const pr = { rSh: 2.85, rEl: 0.15, rAb: 0.2, lAb: 0.7, lEl: 1.75, lTw: -2.0, lean: -0.14, nod: -0.18, dy: b * 0.008, flare: 0.7 };
      if (c.id === 'clover') Object.assign(pr, { by: Math.max(0, Math.sin(t * 6)) * 0.08, lSh: 2.6, lAb: 0.4, lEl: 0.3, lTw: 0, rSh: 2.9, ears: 1 });
      if (c.id === 'elio') Object.assign(pr, { lSh: 2.5, rSh: 2.5, lAb: 0.85, rAb: 0.85, lEl: 0.25, rEl: 0.25, lTw: 0, flare: 1, nod: -0.25 });
      if (c.id === 'durgan') Object.assign(pr, { lSh: 0.1, lAb: 0.15, lEl: 0.3, lTw: 0, rSh: 0.4, rAb: 1.45, rEl: 2.1, rTw: 0.3, lean: -0.2, nod: -0.32, lHab: 0.2, rHab: 0.2 }); // shield planted, a flexed arm, a roar
      if (t < 0.6) {
        const k = t / 0.6;
        return keys(k, [[0, { squash: 0.6, dy: -0.08, lKn: 0.9, rKn: 0.9, lHip: 0.6, rHip: 0.6 }], [0.35, over(pr, { by: 0.16, squash: -0.4 }), outQ], [0.75, over(pr, { by: 0, squash: 0.6, dy: -0.04 }), inQ], [1, pr, sm]]);
      }
      return pr;
    },
  },
  defeat: {
    loop: true, exact: true, lambda: 8, expr: 'sad', f: (t, c) => {
      const br = Math.sin(t * 1.4);
      return { dy: -c.dims.hipH * 0.45, lHip: 1.3, lKn: 2.2, rHip: 0.4, rKn: 2.4, rFt: 0.6, lean: 0.4 + br * 0.02, nod: 0.5, lSh: 0.2, rSh: 0.2, lEl: 0.3, rEl: 0.3, lAb: 0.1, rAb: 0.1 };
    },
  },
  harvest: {
    loop: true, exact: true, lambda: 28, expr: 'determined', period: 0.7, impact: 0.5, f: (t, c) => {
      const k = (t % 0.7) / 0.7;
      const s = Math.sin(k * TAU);
      return { dy: -c.dims.hipH * 0.3, lHip: 1.0, lKn: 1.5, rHip: 0.5, rKn: 1.6, lean: 0.45, rSh: 1.0 + s * 0.35, rEl: 0.7 - s * 0.4, rAb: 0.1 + s * 0.15, lSh: 1.1, lEl: 0.6, lAb: -0.1, nod: 0.45 };
    },
  },
  forge: {
    loop: true, lambda: 22, period: 0.9, f: (t) => {
      const k = (t % 0.9) / 0.9;
      const push = Math.sin(k * TAU) * 0.5 + 0.5;
      return { lean: 0.25 + push * 0.1, lSh: 1.1 - push * 0.3, rSh: 1.1 - push * 0.3, lEl: 0.9 - push * 0.6, rEl: 0.9 - push * 0.6, lAb: -0.1, rAb: -0.1, dy: -0.03 - push * 0.03, lKn: 0.3 + push * 0.15, rKn: 0.3 + push * 0.15, lHip: 0.3, rHip: 0.2, nod: 0.2, flare: push };
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
  surprised: { lean: -0.12, nod: -0.16, lAb: 0.3, rAb: 0.3, dy: 0.008, ears: 1, flare: 0.5 },
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
    this._prevPose = { lean: 0, twist: 0, dy: 0 }; this.poseVel = { lean: 0, twist: 0, dy: 0 };
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
      // the grip sits in the fist
      const m = J(R['hand' + side], 0, -(v.grip ?? 4) * VS, 0.5 * VS);
      m.rotation.set(Math.PI / 2 - 0.55, 0, 0);
      R['mount' + side] = m;
    }
  }
  /**
   * Paint a voxel part (voxel units around its parent; a paint function or a ready VPart) and hang
   * it on the parent. The greedy-meshed
   * geometry is cached per explorer. o.offset shifts the origin, o.glow sets the emissive strength,
   * o.glowMat gives the part's glowing voxels their own material (to pulse or flare them).
   */
  part(joint, paint, o = {}) {
    const key = this.id + '|' + this.partN++;
    let g = GEO_CACHE.get(key);
    if (!g) {
      let P = paint;
      if (!(paint instanceof VPart)) { P = new VPart(); paint(P); }
      g = P.geometry(VS, o.offset || [0, 0, 0], { glowIntensity: o.glow ?? 2.4 });
      GEO_CACHE.set(key, g);
    }
    const grp = new THREE.Group();
    if (g.solid) { const m = new THREE.Mesh(g.solid, o.mat || this.mat); m.castShadow = true; m.receiveShadow = false; grp.add(m); } // no self-shadow acne on voxel faces
    if (g.glow) { const m = new THREE.Mesh(g.glow, o.glowMat || this.glowMat); m.castShadow = false; grp.add(m); }
    if (joint) joint.add(grp);
    return grp;
  }
  /** Voxel → world helper for joint offsets. */
  v(x, y, z) { return [x * VS, y * VS, z * VS]; }
  /**
   * Secondary motion: obj.rotation[axis] springs toward base + gain × source, where source is the
   * figure's local velocity ('vx' | 'vy' | 'vz') or how fast the spine leans / twists / drops
   * ('lean' | 'twist' | 'dy'); extra(ch) adds a driven offset, wobble a gentle sway.
   */
  addSpring(obj, axis, opts) {
    const s = { obj, axis, base: opts.base ?? obj.rotation[axis], gain: opts.gain ?? 0.6, src: opts.src || 'vz', sp: new Spring(opts.k ?? 80, opts.d ?? 8), wobble: opts.wobble || 0, rate: opts.rate || 2.3, phase: opts.phase || 0, min: opts.min ?? -2, max: opts.max ?? 2, extra: opts.extra };
    s.sp.x = s.base;
    this.springs.push(s);
    return s;
  }
  /** A chain of joints hanging from parent (scarf tails, braids), each lagging the one before. */
  chain(parent, at, n, seg, paint, o = {}) {
    const out = [];
    let p = this.joint(parent, ...at);
    for (let i = 0; i < n; i++) {
      if (i) p = this.joint(out[i - 1], 0, -seg * VS, 0);
      if (o.rot) p.rotation.set(...(i ? [0, 0, 0] : o.rot));
      this.part(p, (P) => paint(P, i));
      const lag = 1 + i * 0.6;
      this.addSpring(p, 'x', { base: p.rotation.x, src: 'vz', gain: (o.gain ?? 0.5) * lag, k: (o.k ?? 60) / lag, d: (o.d ?? 6) / Math.sqrt(lag), wobble: (o.wobble ?? 0.04) * lag, phase: i * 0.7 + (o.phase || 0), extra: o.extraX ? (ch) => o.extraX(ch, i) : undefined });
      this.addSpring(p, 'z', { base: p.rotation.z, src: 'vx', gain: -(o.gain ?? 0.5) * 0.6 * lag, k: (o.k ?? 60) / lag, d: (o.d ?? 6) / Math.sqrt(lag), wobble: (o.wobble ?? 0.04) * 0.6 * lag, rate: 1.7, phase: i * 0.9 + 1 + (o.phase || 0) });
      if (o.twist !== false) this.addSpring(p, 'y', { base: p.rotation.y, src: 'twist', gain: -0.15 * lag, k: 40, d: 5 });
      out.push(p);
    }
    return out;
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
    if (name === 'hurt') this.flash('#ff9a82', 0.22);
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
    // body offsets are authored for Bran's size; smaller explorers crouch and lunge in proportion
    if (!a.exact) { const z = this.dims.hipH / 0.8; target = { ...target }; for (const k of ['dy', 'by', 'bz']) if (target[k]) target[k] *= z; }
    const T = {};
    for (const k of CH) T[k] = REST[k] || 0;
    Object.assign(T, target);
    if (this.shieldArm && a.swing) Object.assign(T, this.shieldArm);
    if (this.seated && SEATED_OK.has(this.anim)) { const sl = sitLegs(this); Object.assign(T, sl, { dy: sl.dy + (target.dy || 0) * 0.3 }); }
    // mood as posture, eased in and out
    const ex = EXPR_POSE[this.expr] || {};
    const ef = 1 - Math.exp(-6 * dt);
    for (const k of ['nod', 'lean', 'tilt', 'dy', 'lAb', 'rAb', 'ears', 'flare']) {
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
      for (const k in this._prevPose) { this.poseVel[k] = lerp(this.poseVel[k], (this.pose[k] - this._prevPose[k]) / dt, 1 - Math.exp(-20 * dt)); this._prevPose[k] = this.pose[k]; }
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
      const src = s.src === 'vz' ? this.velLocal.z : s.src === 'vy' ? this.velLocal.y : s.src === 'vx' ? this.velLocal.x : this.poseVel[s.src] ?? 0;
      let tgt = s.base + clamp(src * s.gain, -1.5, 1.5);
      if (s.extra) tgt += s.extra(this);
      if (s.wobble) tgt += Math.sin(this.time * s.rate + s.phase) * s.wobble;
      s.obj.rotation[s.axis] = clamp(s.sp.step(tgt, dt), s.base + s.min, s.base + s.max);
    }
    this.extraUpdate && this.extraUpdate(dt);
    if (this.kindle) this.kindle.update(dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / this.flashDur);
      this.mat.emissive.copy(this.flashColor).multiplyScalar(k * k * 0.55);
      if (this.flashT <= 0) this.mat.emissive.setRGB(0, 0, 0);
    }
  }

  applyPose(p) {
    const R = this.rig, d = this.dims;
    R.body.position.set(p.bx, p.by, p.bz);
    // squash on impacts and landings (negative stretches), and the smear: a stretch along the strike
    const sq = p.squash || 0, smr = p.smear || 0;
    R.body.scale.set(1 + sq * 0.06 - smr * 0.03, 1 - sq * 0.08 - smr * 0.04, 1 + sq * 0.06 + smr * 0.16);
    R.hips.position.y = d.hipH + p.dy;
    R.hips.rotation.set(p.hrx, p.hry, p.hrz);
    R.spine.rotation.set(p.lean, p.twist, p.side);
    // breathing: the chest swells and settles
    const br = Math.sin(this.time * 2.2) * 0.016;
    R.spine.scale.set(1 + sq * 0.04 - br * 0.3, 1 - sq * 0.05 + br, 1 + sq * 0.04 + br * 0.7);
    R.head.rotation.set(p.nod, p.turn, p.tilt);
    R.shL.rotation.set(-p.lSh, p.lTw, p.lAb);
    R.shR.rotation.set(-p.rSh, -p.rTw, -p.rAb);
    R.elL.rotation.x = -p.lEl;
    R.elR.rotation.x = -p.rEl;
    R.elR.scale.y = 1 + smr * 0.2;
    if (R.mountR) R.mountR.scale.set(1, 1 + smr * 0.5, 1);
    R.hipL.rotation.set(-p.lHip, 0, p.lHab);
    R.hipR.rotation.set(-p.rHip, 0, -p.rHab);
    R.knL.rotation.x = p.lKn;
    R.knR.rotation.x = p.rKn;
    R.ftL.rotation.x = p.lFt;
    R.ftR.rotation.x = p.rFt;
  }
}

/** Build an explorer: 'bran' | 'elio' | 'durgan' | 'clover'. */
export function buildCharacter(id) { return new Character(id); }
