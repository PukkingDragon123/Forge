// Medusa, queen of the Garden, and the little totem she was sealed in.
//
// buildMedusa() → a voxel gorgon (~2.2 m) in the crew's chibi style but regal: a big beautiful head
// with closed, lashed eyes (they open and blaze for the gaze), a gold diadem, a cobra-hood fan of
// scales behind her, nine living snakes for hair that writhe and strike, a plum bodice with gold
// and jade jewellery, slender arms with bangles, and a long emerald serpent tail that rises from a
// coil on the ground. Faces +Z at group.rotation.y = 0 (front = bounds.max.z); attacks lunge to +Z.
// It speaks the Monster API (combat) and the cinematic one (intro):
//   play(state, { onDone })  idle | windup | attack | hurt | stun | roar | special | die | intro
//                            crawlOut | rise | talk | gaze | summon | laugh | cover (hands over her eyes)
//   update(dt), height, bounds, hitPoint, mouthPoint, cutPoints, fly, flash(c, t), setPhase(n), dispose()
//   setEyes(0..1)  closed → open and glowing (the gaze anim opens them itself)
//   setStone(k), stoneCracks(), crackAt(i), shatter() → { pieces, update(dt), done, dispose() }
// buildMedusaTotem() → THREE.Group statuette (a girl covering her eyes, wrapped in snakes) with
//   .shatter(parent?) → { pieces, update(dt), done, dispose() } (the trip in the intro).
import * as THREE from 'three';
import { VPart, voxToon, voxGlow, hash, rgb } from './vox_char_kit.js';
import { VoxelBurst, stoneUniforms, petrifyMaterial, StatueShatter } from './vox_mon_fx.js';

const VS = 0.022; // Medusa's voxel (she is big; the crew is 0.016)
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const G = (c) => ({ glow: true, c });
const LINC = (hex) => { const [r, g, b] = rgb(hex); const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return [f(r), f(g), f(b)]; };

const C = {
  skin: ['#4e6e60', '#6e9282', '#92b6a2', '#b8d8c4', '#dcf0e2'],
  scale: ['#0b2e22', '#124432', '#1b6244', '#288458', '#3fae74', '#7ad89c'],
  belly: ['#6a4a12', '#9a6e1a', '#c8961e', '#f0c040', '#ffe890'],
  dress: ['#1e0e2c', '#2e1642', '#43205e', '#5c2e7e', '#7c44a4'],
  gold: ['#6a4410', '#a8761e', '#dca838', '#ffe48a'],
  jade: '#5affb0', eye: '#d8ff6a', eyeHot: '#ffffff', lash: '#16241c', lips: ['#6a1a38', '#9a2a4e', '#c84a6a'], blush: '#e89aa8',
  snakeEye: '#ffd84a', tongue: '#e0304a',
};
const scaleT = (x, y, z, t = 0) => { // emerald scales: a diamond lattice with darker seams and a glint
  const u = Math.floor((x + y * 0.5 + 400) / 2), v = Math.floor((z - y * 0.5 + 400) / 2);
  const seam = ((x + y + 400) % 4 === 0) || ((z - y + 400) % 4 === 0);
  return seam ? C.scale[1] : (u + v) % 3 === 0 ? C.scale[4] : hash(x >> 1, y >> 1, z >> 1, 7) > 0.9 ? C.scale[5] : C.scale[3];
};
const skinT = (x, y, z) => (hash(x, y, z, 3) > 0.94 ? C.skin[2] : C.skin[3]);
const dressT = (x, y, z) => { const f = Math.sin(Math.atan2(x + 0.5, z + 0.5) * 9 + y * 0.2); return f > 0.75 ? C.dress[2] : f < -0.85 ? C.dress[4] : C.dress[3]; };

// ------------------------------------------------------------------ the parts (voxel units, joint-local)
function paintCoil(P) {
  // a coil on the ground, behind and around where she rises; the tail tip curls out to the side
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const s = i / 40, a = -0.6 + s * TAU * 1.45, r = 6 + s * 12;
    pts.push([Math.sin(a) * r, 5.2 - (1 - s) * 2.2, Math.cos(a) * r * 0.86 - 9, 1.6 + s * 5.4]);
  }
  pts.push([0, 7, 2, 7.2]);
  P.path(pts, (x, y, z) => (y < 3.2 ? C.belly[(x + z + 400) % 3 === 0 ? 2 : 3] : scaleT(x, y, z)));
  P.carve((x, y) => y < 0);
}
function paintTailSeg(P, i) {
  const r0 = 7.2 - i * 0.3, r1 = 6.9 - i * 0.35, L = 12;
  P.cap([0, 0, 0], [0, L, 0], r0, r1, (x, y, z) => {
    // a gold belly of plates down the front, scales elsewhere
    if (z > 2.5 && Math.abs(x + 0.5) < 4) return (y + 40) % 3 === 0 ? C.belly[1] : C.belly[3];
    return scaleT(x, y + i * 12, z);
  });
}
function paintHips(P) {
  // where scales meet the dress: a gold girdle with a jade clasp and a skirt of petal panels
  P.loft(-2, 4, () => [6.6, 5.8], dressT);
  P.loft(2, 4, () => [7.1, 6.3], (x, y) => C.gold[y === 3 ? 3 : 2]);
  P.ell(0, 3, 6.6, 1.8, 1.8, 1, G(C.jade));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU, sa = Math.sin(a), ca = Math.cos(a);
    P.cap([sa * 6.6, 2, ca * 5.8], [sa * 9.5, -8, ca * 8.6], 2.4, 1.6, (x, y) => (y < -6 ? C.gold[2] : (k & 1 ? C.dress[3] : C.dress[2])));
  }
}
function paintTorso(P) {
  const tr = (y) => { const t = y / 19; return [5.4 + Math.sin(Math.PI * clamp(t * 0.9, 0, 1)) * 2.6 - Math.max(0, t - 0.86) * 18, Math.max(2.5, 4.4 + Math.sin(Math.PI * clamp(t, 0, 1)) * 1.6 - Math.max(0, t - 0.88) * 12)]; };
  P.loft(0, 20, (y) => { const [rx, rz] = tr(y); return rx < 2.5 ? null : [rx, rz]; }, (x, y, z) => (y > 13 ? skinT(x, y, z) : dressT(x, y, z)));
  // the bodice neckline in gold, a jade-and-gold collar, jewels at the heart
  P.paint((x, y, z) => (y === 13 && P.surface(x, y, z) ? C.gold[3] : y === 12 && P.surface(x, y, z) ? C.gold[1] : undefined));
  for (let k = 0; k < 13; k++) {
    const a = -1.4 + (k / 12) * 2.8, sa = Math.sin(a), ca = Math.cos(a);
    P.ell(sa * 5.6, 16.5 - Math.abs(Math.sin(a)) * 1.2, ca * 4.8 + 0.4, 1, 1, 0.8, k % 3 === 1 ? G(C.jade) : C.gold[2]);
  }
  P.ell(0, 15, 5.6, 1.4, 1.8, 1, G(C.jade));
  P.ell(0, 9, 6.6, 1.6, 1.6, 0.9, C.gold[2]); P.set(0, 9, 7, G(C.jade)); P.set(-1, 9, 7, G(C.jade));
}
function paintHood(P) {
  // a cobra's hood: a fan of scale behind the head, gold-edged, with two eye-spots
  for (let y = 0; y <= 30; y++) for (let x = -17; x <= 16; x++) {
    const t = y / 30, w = Math.sin(Math.PI * clamp(t * 1.05, 0, 1)) * 16 + 2;
    const ax = Math.abs(x + 0.5);
    if (ax > w) continue;
    const z = -Math.round((ax * ax) / 40);
    const edge = ax > w - 1.4 || y === 30;
    const spot = Math.hypot(ax - 8, y - 18) < 2.6;
    const ring = Math.hypot(ax - 8, y - 18) < 3.8;
    P.set(x, y, z, edge ? C.gold[(x + y) % 3 ? 2 : 3] : spot ? G(C.jade) : ring ? C.gold[1] : scaleT(x, y, z));
    P.set(x, y, z - 1, C.scale[1]);
  }
}
function paintHead(P) {
  // a big oval face, scaled hair-cap behind, a gold diadem, small rose lips, soft blush
  P.ell(0, 11, 0.5, 9.8, 11.2, 9.2, skinT);
  P.ell(0, 13.2, -2, 10.6, 11, 9.6, (x, y, z) => (z > 3 && y < 17 ? undefined : scaleT(x, y, z)));
  P.ell(0, 3.5, 4, 5.5, 3, 4.6, skinT); // chin & cheeks
  for (let x = -10; x < 10; x++) for (const y of [16, 17]) {
    let z = 12; while (z > -4 && !P.has(x, y, z)) z--;
    if (z > -4) P.set(x, y, z + 1, C.gold[y === 17 ? 3 : 2]);
  }
  for (let k = 0; k < 5; k++) { const x = -4 + k * 2; let z = 12; while (z > -4 && !P.has(x, 18, z)) z--; P.cap([x, 18, z], [x * 1.1, 21 + (k === 2 ? 3 : k % 2), z - 0.5], 0.8, 0.4, C.gold[3]); }
  P.ell(0, 18.5, 9.4, 1.2, 1.4, 0.8, G(C.jade));
  // lips and blush on the face surface
  const onFace = (x, y) => { let z = 13; while (z > 0 && !P.has(x, y, z)) z--; return z; };
  for (const [x, y, c] of [[-2, 5, C.lips[1]], [-1, 5, C.lips[2]], [0, 5, C.lips[2]], [1, 5, C.lips[1]], [-1, 4, C.lips[0]], [0, 4, C.lips[0]]]) P.set(x, y, onFace(x, y), c);
  for (const sx of [-1, 1]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) { const x = sx < 0 ? -7 + dx : 5 + dx; P.set(x, 8 + dy, onFace(x, 8 + dy), C.blush); }
  // earrings: gold drops at the jaw
  for (const sx of [-1, 1]) P.cap([sx * 9.4, 8, 1], [sx * 9.6, 4, 1.5], 0.7, 0.9, C.gold[2]);
}
/** Eyes: closed (dark lash arcs) or open (glowing slits). Drawn just proud of the face. */
function paintEyes(P, open) {
  const face = (x, y) => Math.round(9.6 - (x + 0.5) * (x + 0.5) / 26 - (y - 11) * (y - 11) / 60);
  for (const sx of [-1, 1]) {
    const cx = sx * 4.2;
    if (!open) {
      for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [2.6, 0.8]]) { const x = Math.round(cx + dx * sx * (sx < 0 ? -1 : 1)), y = 11 + dy; P.set(x, y, face(x, y), C.lash); }
    } else {
      for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {
        const x = Math.round(cx + dx), y = 11 + dy;
        if (Math.abs(dx) === 2 && dy !== 0) continue;
        P.set(x, y, face(x, y) + 1, G(dx === 0 ? C.eyeHot : C.eye));
      }
      P.set(Math.round(cx), 13, face(Math.round(cx), 13), C.lash);
    }
  }
}
function paintArmUp(P) { P.ell(0, -0.5, 0, 3.2, 3.2, 3.2, skinT); P.cap([0, 0, 0], [0, -9, 0], 2.7, 2.4, skinT); P.loft(-4, -2, () => [2.9, 2.9], C.gold[2]); }
function paintArmLo(P) { P.cap([0, 0, 0], [0, -8, 0], 2.4, 2, skinT); for (const y of [-6, -7.5]) P.loft(y, y + 1, () => [2.5, 2.5], C.gold[y === -6 ? 3 : 2]); }
function paintHand(P, side) {
  P.ell(0, -2, 0.4, 2.1, 2.6, 1.6, skinT);
  for (let i = 0; i < 4; i++) { const x = -1.5 + i; P.cap([x, -3.5, 0.6], [x * 1.1, -6.8 - (i === 1 || i === 2 ? 0.8 : 0), 1], 0.65, 0.55, (xx, y) => (y < -6 ? C.scale[2] : C.skin[3])); }
  P.cap([-side * 1.8, -2, 1.2], [-side * 2.6, -4.2, 2.4], 0.8, 0.6, C.skin[3]);
}
function paintSnakeSeg(P, i, n) {
  const r = 2.5 - i * 0.25;
  P.cap([0, 0, 0], [0, 4, 0], r, r - 0.1, (x, y, z) => ((y + i * 4 + 40) % 3 === 0 ? C.scale[1] : z > 0.5 ? C.belly[3] : C.scale[3 + (i & 1)]));
}
function paintSnakeHead(P) {
  // a little viper: a broad head with a gold-banded crown, glowing eyes, a flicking forked tongue
  P.ell(0, 2, 0.6, 2.6, 2.9, 2.8, (x, y, z) => (y > 3.2 ? C.scale[4] : z > 1.5 && y < 1.6 ? C.belly[3] : C.scale[3]));
  P.cap([0, 1.8, 2], [0, 1.5, 4.6], 1.9, 1.2, (x, y) => (y > 2 ? C.scale[4] : C.scale[3]));
  for (const sx of [-1, 1]) { P.set(sx < 0 ? -3 : 2, 3, 1.8, G(C.snakeEye)); P.set(sx < 0 ? -3 : 2, 3, 2.8, G(C.snakeEye)); }
  P.set(0, 4.6, 0, C.gold[2]); P.set(-1, 4.6, 0, C.gold[2]);
  P.cap([0, 1, 5], [0, 0.6, 6.6], 0.45, 0.3, C.tongue);
  P.set(1, 0, 7, C.tongue); P.set(-1, 0, 7, C.tongue);
}

// ------------------------------------------------------------------ the model
const GEO = new Map();
function partGeo(key, paint) {
  let g = GEO.get(key);
  if (!g) {
    const P = new VPart(); paint(P);
    // a sample of surface voxels for cracks and the shatter (centre in joint space, linear colour)
    const samp = [];
    for (const e of P.entries()) if (P.surface(e.x, e.y, e.z) && hash(e.x, e.y, e.z, 99) < 0.12) samp.push({ p: [(e.x + 0.5) * VS, (e.y + 0.5) * VS, (e.z + 0.5) * VS], v: e.v });
    g = { ...P.geometry(VS, [0, 0, 0], { glowIntensity: 2.4 }), samp };
    GEO.set(key, g);
  }
  return g;
}
const DUR = { attack: 0.6, hurt: 0.35, roar: 1.4, special: 1.1, die: 1.8, intro: 1.6, crawlOut: 3.4, rise: 1.8, gaze: 1.9, summon: 1.8, laugh: 1.6 };
const HOLD = new Set(['idle', 'windup', 'stun', 'die', 'talk', 'cover']);
const H = 2.15;

export class MedusaModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'monster:medusa';
    this.root = new THREE.Group();
    this.group.add(this.root);
    this.mat = voxToon();
    this.glowMat = voxGlow();
    this.eyeMat = voxGlow();
    this.stoneU = stoneUniforms(VS);
    for (const m of [this.mat, this.glowMat, this.eyeMat]) petrifyMaterial(m, this.stoneU);
    this.boss = true;
    this.state = 'idle'; this.st = 0; this.t = Math.random() * 10; this.onDone = null;
    this.phase = 1; this.eyes = 0; this.eyesTarget = 0;
    this.flashT = 0; this.flashDur = 0.1; this.flashColor = new THREE.Color(1, 1, 1);
    this.stone = 0; this.cracks = []; this._crackSrc = null; this._shake = 0; this.shattered = null;
    this.fly = 0; this.height = H; this.reach = 0.6;
    this.chunkSrc = [];
    this.p = { lean: 0, sway: 0, twist: 0, nod: 0, tilt: 0, turn: 0, sink: 0, lSh: 0.2, lAb: 0.25, lEl: 0.4, rSh: 0.2, rAb: 0.25, rEl: 0.4, flare: 0, glow: 0, snakes: 0, hood: 0, coilBack: 0, rise: 1 };
    this.burst = new VoxelBurst(260, VS * 0.95);
    this.group.add(this.burst.mesh);
    this._build();
    this.update(0);
    this.group.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(this.root);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    this.bounds.applyMatrix4(inv);
    this.hitPoint = new THREE.Vector3(0, 1.3, 0.25);
    this.mouthPoint = new THREE.Vector3(0, 1.75, 0.3);
    this.cutPoints = [0.55, 0.9, 1.2, 1.45, 1.8].map((y, i) => new THREE.Vector3((i % 2 ? 0.12 : -0.12), y, 0.3));
  }

  _j(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x * VS, y * VS, z * VS); parent.add(g); return g; }
  _part(joint, key, paint, glowMat) {
    const g = partGeo(key, paint);
    if (g.solid) { const m = new THREE.Mesh(g.solid, this.mat); m.castShadow = true; joint.add(m); }
    if (g.glow) { const m = new THREE.Mesh(g.glow, glowMat || this.glowMat); joint.add(m); }
    for (const s of g.samp) {
      const v = s.v, glow = (v & (1 << 24)) !== 0;
      this.chunkSrc.push({ bone: joint, lp: new THREE.Vector3(...s.p), c: [LINC('#' + ((v & 0xffffff) >>> 0).toString(16).padStart(6, '0'))].flat(), glow });
    }
    return joint;
  }
  _build() {
    const R = (this.rig = {});
    R.body = this._j(this.root, 0, 0, 0);
    this._part(this._j(R.body, 0, 0, 0), 'coil', paintCoil);
    R.t1 = this._j(R.body, 0, 6, 2);
    this._part(R.t1, 'tail0', (P) => paintTailSeg(P, 0));
    R.t2 = this._j(R.t1, 0, 12, 0); this._part(R.t2, 'tail1', (P) => paintTailSeg(P, 1));
    R.t3 = this._j(R.t2, 0, 12, 0); this._part(R.t3, 'tail2', (P) => paintTailSeg(P, 2));
    R.hips = this._j(R.t3, 0, 12, 0); this._part(R.hips, 'hips', paintHips);
    R.spine = this._j(R.hips, 0, 4, 0); this._part(R.spine, 'torso', paintTorso);
    R.hood = this._j(R.spine, 0, 14, -4); this._part(R.hood, 'hood', paintHood);
    R.neck = this._j(R.spine, 0, 19, 0);
    R.head = this._j(R.neck, 0, 2, 0); this._part(R.head, 'head', paintHead);
    R.eyesClosed = this._part(this._j(R.head, 0, 0, 0), 'eyes0', (P) => paintEyes(P, false));
    R.eyesOpen = this._part(this._j(R.head, 0, 0, 0), 'eyes1', (P) => paintEyes(P, true), this.eyeMat);
    R.eyesOpen.visible = false;
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      R['sh' + s] = this._j(R.spine, sx * 7.6, 15.5, 0);
      R['sh' + s].rotation.order = 'XZY';
      this._part(R['sh' + s], 'armUp', paintArmUp);
      R['el' + s] = this._j(R['sh' + s], 0, -9, 0); this._part(R['el' + s], 'armLo', paintArmLo);
      R['hand' + s] = this._j(R['el' + s], 0, -8, 0); this._part(R['hand' + s], 'hand' + s, (P) => paintHand(P, sx));
    }
    // nine snakes for hair, each a chain of four segments and a head
    this.snakes = [];
    const roots = [[0, 21, -2, 0], [-5, 20, -3, -0.5], [5, 20, -3, 0.5], [-8.5, 16, -2, -1.1], [8.5, 16, -2, 1.1], [-4, 17, -8, -0.4], [4, 17, -8, 0.4], [-9, 11, -5, -1.4], [9, 11, -5, 1.4]];
    roots.forEach(([x, y, z, yaw], i) => {
      const segs = [];
      let p = this._j(R.head, x, y, z);
      p.rotation.set(-0.5 - (z < -5 ? 0.6 : 0), yaw, 0);
      for (let k = 0; k < 4; k++) {
        if (k) p = this._j(segs[k - 1], 0, 4, 0);
        this._part(p, 'snake' + k, (P) => paintSnakeSeg(P, k, 4));
        segs.push(p);
      }
      const hd = this._j(segs[3], 0, 4, 0);
      this._part(hd, 'snakeHead', paintSnakeHead);
      this.snakes.push({ segs, hd, base: segs[0].rotation.clone(), ph: i * 1.7, yaw });
    });
  }

  // -------------------------------------------------------------- API
  play(state, o = {}) {
    if (this.state === 'die' && state !== 'die' && state !== 'intro' && state !== 'rise' && state !== 'crawlOut') return;
    this.state = state; this.st = 0;
    this.onDone = o.onDone || null;
    if (state === 'gaze') this.eyesTarget = 1;
    if (state === 'hurt') { this.flash('#ffffff', 0.12); this._shake = Math.min(0.5, this._shake + 0.25); }
  }
  setEyes(k) { this.eyesTarget = clamp(k, 0, 1); }
  flash(color = '#ffffff', t = 0.1) { this.flashT = t; this.flashDur = t; this.flashColor = new THREE.Color(color); }
  setPhase(n) { this.phase = n; }
  impactTime(state) { return (DUR[state] || 0.5) * (state === 'attack' ? 0.45 : state === 'special' ? 0.6 : 0.5); }

  /** Target pose for the current state (k = 0..1 progress for timed states). */
  _pose(s, k, t) {
    const br = Math.sin(t * 1.6);
    const P = { lean: 0.02 + br * 0.015, sway: Math.sin(t * 0.7) * 0.06, twist: Math.sin(t * 0.5) * 0.08, nod: 0.06 + Math.sin(t * 0.9) * 0.03, tilt: Math.sin(t * 0.6) * 0.07, turn: Math.sin(t * 0.4) * 0.12,
      sink: 0, lSh: 0.25, lAb: 0.35, lEl: 0.55, rSh: -0.1, rAb: 0.7, rEl: 1.9, flare: 0, glow: 0.2, snakes: 0, hood: 0, rise: 1, coilBack: 0, strike: 0 };
    // right hand rests at the hip, the left hangs elegantly
    if (s === 'idle' || s === 'talk') {
      if (s === 'talk') { const g = Math.sin(t * 2.6); Object.assign(P, { lSh: 0.9 + g * 0.25, lAb: 0.5 + g * 0.1, lEl: 1.2 + g * 0.3, nod: 0.08 + Math.sin(t * 5) * 0.05, tilt: Math.sin(t * 1.3) * 0.12 }); }
      return P;
    }
    if (s === 'cover') return Object.assign(P, { lSh: 2.2, lAb: -0.5, lEl: 2.1, rSh: 2.2, rAb: -0.5, rEl: 2.1, nod: 0.15, lean: 0.06, hood: -0.3 });
    if (s === 'windup') return Object.assign(P, { lean: -0.22, twist: -0.25, rSh: 2.4, rAb: 0.6, rEl: 0.6, lSh: 0.8, lAb: 0.6, lEl: 0.8, nod: -0.15, snakes: 0.8, hood: 0.7, glow: 0.8, flare: 0.5 });
    if (s === 'attack') {
      // a lunge toward +Z: the tail drives her forward, a raking slash, the snakes strike
      const a = sm(k / 0.4), r = sm((k - 0.55) / 0.45);
      const lunge = a * (1 - r);
      return Object.assign(P, { lean: -0.2 + lunge * 0.75, twist: -0.25 + lunge * 0.6, rSh: 2.4 - lunge * 1.6, rAb: 0.6 - lunge * 0.4, rEl: 0.6 - lunge * 0.4, lSh: 0.8 + lunge * 0.4, lAb: 0.6, snakes: 0.8 + lunge * 0.2, strike: lunge, hood: 0.7, glow: 0.8 });
    }
    if (s === 'hurt') { const h = Math.sin(clamp(k, 0, 1) * Math.PI); return Object.assign(P, { lean: -0.3 * h, nod: -0.3 * h, tilt: 0.2 * h, lAb: 0.6 * h + 0.3, rAb: 0.8, snakes: 0.4 * h }); }
    if (s === 'stun') return Object.assign(P, { lean: 0.15 + Math.sin(t * 5) * 0.08, sway: Math.sin(t * 3) * 0.18, nod: 0.3, tilt: Math.sin(t * 4) * 0.2, lSh: 0.1, rSh: 0.1, lAb: 0.4, rAb: 0.4, lEl: 0.2, rEl: 0.2, snakes: -0.5 });
    if (s === 'roar' || s === 'summon' || s === 'special') {
      // arms flung wide and up, the hood flares, every snake rears; summon ends reaching forward
      const up = sm(k / 0.3) * (1 - sm((k - 0.8) / 0.2) * (s === 'summon' ? 0 : 1));
      return Object.assign(P, { lean: -0.25 * up, nod: -0.35 * up, lSh: 0.3 + up * 2.2, lAb: 0.4 + up * 0.9, lEl: 0.3, rSh: 0.3 + up * 2.2, rAb: 0.4 + up * 0.9, rEl: 0.3, snakes: up, hood: up, glow: 0.5 + up, flare: up });
    }
    if (s === 'gaze') {
      // she lowers her hands from her eyes and looks — the eyes blaze
      const open = sm((k - 0.25) / 0.25);
      return Object.assign(P, { lSh: 2.2 - open * 1.6, lAb: -0.5 + open * 1.2, lEl: 2.1 - open * 1.5, rSh: 2.2 - open * 1.6, rAb: -0.5 + open * 1.2, rEl: 2.1 - open * 1.5, lean: 0.12 * open, nod: 0.12 - open * 0.08, snakes: open * 0.9, hood: open, glow: open * 1.5, flare: open });
    }
    if (s === 'laugh') { const g = Math.sin(t * 16); return Object.assign(P, { lean: -0.22 + g * 0.03, nod: -0.4, lSh: 1.6, lAb: -0.2, lEl: 2.2, rAb: 0.7, snakes: 0.5 + g * 0.2, hood: 0.4 }); }
    if (s === 'die') { const d = sm(k); return Object.assign(P, { lean: -0.5 * d, sway: 0.3 * d, nod: -0.4 * d, tilt: 0.4 * d, sink: d * 0.3, lSh: 0.4, rSh: 0.4, lAb: 1.2 * d, rAb: 1.2 * d, snakes: -1 * d, hood: -0.5 * d, rise: 1 - d * 0.6 }); }
    if (s === 'crawlOut') {
      // up out of the split floor: hands grip the edges, she hauls herself up and straightens
      const climb = sm(k / 0.75);
      return Object.assign(P, { sink: (1 - climb) * 2.1, lean: 0.9 * (1 - sm((k - 0.6) / 0.4)), lSh: 2.1 - climb * 1.5, lAb: 0.7, lEl: 0.6 + Math.sin(k * 14) * 0.2 * (1 - climb), rSh: 2.1 - climb * 1.5, rAb: 0.7, rEl: 0.6 + Math.cos(k * 14) * 0.2 * (1 - climb), nod: 0.5 * (1 - climb), rise: 0.35 + climb * 0.65, snakes: 0.3 });
    }
    if (s === 'rise' || s === 'intro') {
      // coiled low, then the tail lifts her to full height; hands over her eyes for the rise
      const up = sm(k), cover = s === 'rise' ? 1 : 0;
      return Object.assign(P, { rise: 0.35 + up * 0.65, lean: 0.35 * (1 - up), nod: 0.3 * (1 - up), lSh: cover ? 2.2 : 0.3 + up * 0.5, lAb: cover ? -0.5 : 0.4, lEl: cover ? 2.1 : 0.5, rSh: cover ? 2.2 : 0.3, rAb: cover ? -0.5 : 0.6, rEl: cover ? 2.1 : 1.2, snakes: up * 0.6, hood: up * 0.6 });
    }
    return P;
  }

  update(dt) {
    dt = Math.min(dt || 0, 0.1);
    // stone: world-space sweep bounds, cracks opening, a shudder when one is hit (as monsters.js)
    if (this.stone > 0 || this.cracks.length) {
      this.group.updateMatrixWorld();
      const by = this.group.matrixWorld.elements[13], sy = new THREE.Vector3().setFromMatrixScale(this.group.matrixWorld).y;
      this.stoneU.uStBase.value = by;
      this.stoneU.uStTop.value = by + this.height * sy;
      this.stoneU.uCrackR.value = 0.4 * sy;
      if (this._crackSrc) for (let i = 0; i < 6; i++) {
        const v4 = this.stoneU.uCracks.value[i], cr = this.cracks[i];
        if (!cr) { v4.w = 0; continue; }
        cr.open += (cr.target - cr.open) * Math.min(1, dt * 9);
        const w = this.group.localToWorld(this._crackSrc[i].g.clone());
        v4.set(w.x, w.y, w.z, cr.open);
      }
    }
    if (this._shake > 0) { this._shake = Math.max(0, this._shake - dt * 1.6); this._shT = (this._shT || 0) + dt; this.root.position.x = Math.sin(this._shT * 90) * 0.025 * this._shake; }
    else this.root.position.x = 0;
    if (this.burst.items && this.burst.items.length) this.burst.update(dt, 0);
    if (this.stone >= 1) return;
    dt *= 1 - this.stone * 0.85;
    this.t += dt; this.st += dt;
    const s = this.state, D = DUR[s];
    let k = 0;
    if (D) {
      k = this.st / D;
      if (k >= 1) {
        const cb = this.onDone; this.onDone = null;
        if (s === 'die') { this.st = D; k = 1; } // she stays down
        else if (!HOLD.has(s)) { this.state = 'idle'; this.st = 0; k = 0; }
        cb && cb();
      }
      k = Math.min(1, k);
    }
    const T = this._pose(this.state, k, this.t);
    const f = this._snap === undefined ? 1 : 1 - Math.exp(-(this.state === 'attack' ? 22 : 10) * dt);
    this._snap = 0;
    for (const n in T) this.p[n] = lerp(this.p[n] ?? T[n], T[n], f);
    const p = this.p, R = this.rig;
    // the tail lifts her (rise) and leans her; the body sinks into the floor for the crawl
    R.body.position.y = -p.sink;
    const rr = p.rise;
    // a graceful S rising from the coil: back, forward, upright; it sways like a charmed snake
    const sw = Math.sin(this.t * 0.9) * 0.05;
    R.t1.rotation.set(0.22 - 0.35 * (1 - rr) + p.lean * 0.35 + (p.strike || 0) * 0.25, p.twist * 0.3, p.sway * 0.5 + sw);
    R.t2.rotation.set(-0.38 - 0.5 * (1 - rr) + p.lean * 0.3 + (p.strike || 0) * 0.3, p.twist * 0.3, -p.sway * 0.4 - sw * 1.4);
    R.t3.rotation.set(0.18 + 0.85 * (1 - rr) + p.lean * 0.2 - (p.strike || 0) * 0.1, 0, p.sway * 0.3 + sw);
    R.hips.rotation.set(p.lean * 0.3, p.twist * 0.4, 0);
    R.spine.rotation.set(p.lean * 0.4, p.twist * 0.5, -p.sway * 0.4);
    const brth = Math.sin(this.t * 1.6) * 0.012;
    R.spine.scale.set(1 - brth * 0.3, 1 + brth, 1 + brth * 0.6);
    R.head.rotation.set(p.nod, p.turn, p.tilt);
    R.hood.rotation.x = -0.25 - p.hood * 0.35;
    R.hood.scale.set(1 + p.hood * 0.12, 1 + p.hood * 0.08, 1);
    R.shL.rotation.set(-p.lSh, 0, p.lAb); R.shR.rotation.set(-p.rSh, 0, -p.rAb);
    R.elL.rotation.x = -p.lEl; R.elR.rotation.x = -p.rEl;
    // snakes: a slow writhe at rest; rearing (snakes > 0) points them forward and up, strikes snap out
    const st = p.strike || 0;
    for (const sn of this.snakes) {
      sn.segs.forEach((g, i) => {
        const w = Math.sin(this.t * (2.2 + this.phase * 0.6) + sn.ph + i * 0.9) * (0.28 + Math.max(0, -p.snakes) * 0.2);
        const rear = p.snakes > 0 ? p.snakes * (i === 0 ? -0.35 : i === 3 ? 0.6 : 0.15) : p.snakes * (i === 0 ? 0.5 : 0.2);
        g.rotation.x = (i === 0 ? sn.base.x : 0.15) + rear + st * (i === 3 ? 0.4 : 0);
        g.rotation.z = w;
        if (i === 0) g.rotation.y = sn.yaw;
      });
      sn.hd.rotation.x = -0.4 - p.snakes * 0.5 + Math.sin(this.t * 3 + sn.ph) * 0.15;
    }
    // eyes open for the gaze, blazing; the jade jewels breathe
    this.eyes = lerp(this.eyes, this.eyesTarget, 1 - Math.exp(-6 * dt));
    if (this.state === 'gaze' && k > 0.25) this.eyesTarget = 1;
    R.eyesOpen.visible = this.eyes > 0.5; R.eyesClosed.visible = this.eyes <= 0.5;
    this.eyeMat.color.setScalar(0.9 + p.glow * 1.6 + Math.sin(this.t * 7) * 0.08);
    this.glowMat.color.setScalar(0.7 + p.glow * 0.8 + Math.sin(this.t * 2) * 0.08 + (this.phase > 1 ? 0.3 : 0));
    if (this.flashT > 0) {
      this.flashT -= dt;
      const kk = Math.max(0, this.flashT / this.flashDur);
      this.mat.emissive.copy(this.flashColor).multiplyScalar(kk * kk * 0.6);
      if (this.flashT <= 0) this.mat.emissive.setRGB(0, 0, 0);
    }
  }

  // -------------------------------------------------------------- petrify (her own stone, turned on her)
  setStone(k) { this.stone = clamp(k, 0, 1); this.stoneU.uStone.value = this.stone; if (this.stone > 0) this.update(0); }
  stoneCracks() {
    if (!this._crackSrc) {
      this.group.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
      const pts = this.chunkSrc.filter((c) => !c.glow).map((c) => ({ c, g: c.bone.localToWorld(c.lp.clone()).applyMatrix4(inv) }));
      // bands up whatever pose the stone caught her in (standing, lunging or slumped), front side only
      let lo = Infinity, hi = -Infinity;
      for (const p of pts) if (p.g.y > 0.02) { lo = Math.min(lo, p.g.y); hi = Math.max(hi, p.g.y); }
      const span = Math.max(0.3, hi - lo), frontZ = pts.reduce((m, p) => Math.max(m, p.g.z), -Infinity);
      const chosen = [];
      for (let i = 0; i < 6; i++) {
        const y0 = lo + span * (0.12 + i * 0.13), y1 = y0 + span * 0.12, side = (i % 2 ? 1 : -1) * 0.12;
        let best = null, bs = -Infinity;
        for (const p of pts) {
          if (p.g.y < y0 || p.g.y > y1 || chosen.includes(p)) continue;
          const sc = p.g.z * 3 - Math.abs(p.g.x - side) * 1.5;
          if (sc > bs && p.g.z > frontZ - 0.6) { bs = sc; best = p; }
        }
        if (best) chosen.push(best);
      }
      while (chosen.length < 3) {
        let best = null, bs = -Infinity;
        for (const p of pts) { if (chosen.includes(p) || chosen.some((q) => q.g.distanceTo(p.g) < 0.25)) continue; if (p.g.z > bs) { bs = p.g.z; best = p; } }
        if (!best) break;
        chosen.push(best);
      }
      if (!chosen.length) chosen.push({ c: null, g: this.hitPoint.clone() });
      this._crackSrc = chosen.map((p) => ({ c: p.c, g: p.g.clone().add(new THREE.Vector3(0, 0, VS)) }));
      this.cracks = this._crackSrc.map(() => ({ open: 0, target: 0 }));
    }
    return this._crackSrc.map((p) => this.group.localToWorld(p.g.clone()));
  }
  crackAt(i) {
    const pts = this.stoneCracks();
    if (i < 0 || i >= pts.length) return;
    this.cracks[i].target = 1;
    this._shake = Math.min(0.5, this._shake + 0.22);
    const lp = this._crackSrc[i].g;
    for (let k = 0; k < 18; k++) {
      const grey = 0.08 + Math.random() * 0.22, ore = Math.random() < 0.22;
      this.burst.emit(lp, ore ? LINC(C.jade) : [grey, grey * 1.04, grey * 1.02], [(Math.random() - 0.5) * 2.4, 1 + Math.random() * 2.4, 0.8 + Math.random() * 2.2], 0.7 + Math.random() * 0.6, ore);
    }
  }
  shatter() {
    if (this.shattered) return this.shattered;
    this.group.updateMatrixWorld(true);
    const S = new StatueShatter(this.group, VS * 2.2, 760);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const c = new THREE.Vector3(0, this.height * 0.45, 0);
    const src = this.chunkSrc, want = Math.min(S.max, Math.round(src.length * 0.9) + 60), ore = LINC(C.jade);
    for (let i = 0; i < want; i++) {
      const s = src[Math.floor(Math.random() * src.length)];
      const p = s.bone.localToWorld(s.lp.clone()).applyMatrix4(inv);
      const d = p.clone().sub(c); d.y = Math.max(0, d.y);
      const sp = 0.9 + Math.random() * 1.4, isOre = Math.random() < 0.16;
      const lum = s.c[0] * 0.3 + s.c[1] * 0.59 + s.c[2] * 0.11, g = 0.06 + Math.min(0.4, lum * 0.8 + 0.06) * (0.8 + Math.random() * 0.4);
      S.add(p, isOre ? ore : [g, g * 1.04, g * 1.02], [d.x * sp * 1.3 + (Math.random() - 0.5) * 0.6, (isOre ? 1.6 : 0.6) + Math.random() * 1.6, d.z * sp * 0.9 + Math.random() * 0.5], isOre, isOre ? 1.2 : 1);
    }
    this.root.visible = false;
    this.shattered = { pieces: S.pieces, update: (dt) => S.update(dt), get done() { return S.done; }, dispose: () => S.dispose(), _s: S };
    return this.shattered;
  }
  dispose() {
    for (const m of [this.mat, this.glowMat, this.eyeMat]) m.dispose();
    if (this.burst.mesh) { this.burst.mesh.geometry.dispose(); this.burst.mat && this.burst.mat.dispose(); }
    if (this.shattered) this.shattered.dispose();
    this.group.removeFromParent();
  }
}

export function buildMedusa() { return new MedusaModel(); }

// ================================================================== the totem
// A palm-sized statuette (~0.22 m): on a round jade plinth, a girl in a long dress covers her eyes
// with both hands while snakes coil around her and rise from her hair. Ivory stone with gold.
const TVS = 0.006;
let TOTEM = null;
function totemGeo() {
  if (TOTEM) return TOTEM;
  const P = new VPart();
  const ivory = ['#8a8270', '#b8ae96', '#ddd4bc', '#f4ecd8'], jade = ['#1a5a44', '#2a7a5c', '#3e9a74', '#6ac898'], gold = ['#8a6418', '#c8961e', '#f0c040'];
  const iv = (x, y, z) => ivory[2 + (hash(x, y, z, 5) > 0.85 ? 1 : 0) - (hash(x >> 1, y >> 1, z >> 1, 6) > 0.88 ? 1 : 0)];
  // plinth
  P.loft(0, 6, (y) => [11 - (y === 5 ? 1 : 0), 11 - (y === 5 ? 1 : 0)], (x, y) => (y === 0 || y === 5 ? gold[1] : jade[(x + y + 40) % 4 === 0 ? 3 : 2]));
  // the dress: a bell to the plinth, folds
  P.loft(6, 22, (y) => { const t = (y - 6) / 16; return [8 - t * 4.2, 6.6 - t * 3.4]; }, (x, y, z) => (Math.sin(Math.atan2(x + 0.5, z + 0.5) * 8) > 0.7 ? ivory[1] : iv(x, y, z)));
  P.loft(22, 28, (y) => [3.6 + (y - 22) * 0.25, 2.8 + (y - 22) * 0.15], iv); // bodice & shoulders
  P.ell(0, 33, 0.5, 4, 4.4, 3.8, iv); // head
  // both forearms up, hands over the eyes
  for (const sx of [-1, 1]) {
    P.cap([sx * 4.6, 27, 0], [sx * 3.2, 30, 3.4], 1.3, 1.1, iv);
    P.cap([sx * 3.2, 30, 3.4], [sx * 1.4, 33, 4.2], 1.1, 1, iv);
    P.ell(sx * 1.4, 33.4, 4.4, 1.5, 1.4, 0.9, ivory[3]);
  }
  // hair snakes rising, and two snakes coiling around the body
  for (let k = 0; k < 7; k++) {
    const a = -1.4 + k * 0.47, sa = Math.sin(a), ca = Math.cos(a);
    const pts = [[sa * 3.6, 35.5, ca * 2.6 - 1.4, 0.9], [sa * 5.2, 38.5, ca * 3.4 - 2.2, 0.8], [sa * 4.6, 41.5, ca * 3 - 2.6, 0.7], [sa * 5.6, 43, ca * 3.8 - 2, 0.9]];
    P.path(pts, (x, y) => (y > 42 ? jade[3] : jade[2]));
    P.set(Math.round(sa * 5.6), 43, Math.round(ca * 3.8 - 2) + 1, { glow: true, c: '#9affc8' });
  }
  for (const [ph, col] of [[0, jade[2]], [Math.PI, jade[1]]]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const s = i / 24, a = ph + s * TAU * 1.6, y = 7 + s * 19, r = 8.4 - s * 4.4; pts.push([Math.sin(a) * r, y, Math.cos(a) * r * 0.85, 1.2]); }
    P.path(pts, (x, y, z, t) => (t > 0.97 ? jade[3] : col));
    const e = pts[pts.length - 1]; P.set(Math.round(e[0]), Math.round(e[1]) + 1, Math.round(e[2]), { glow: true, c: '#9affc8' });
  }
  // a gold band on the brow
  for (let x = -4; x < 4; x++) { let z = 6; while (z > -2 && !P.has(x, 36, z)) z--; if (z > -2) P.set(x, 36, z + 1, gold[2]); }
  const samp = [];
  for (const e of P.entries()) if (P.surface(e.x, e.y, e.z)) samp.push({ p: [(e.x + 0.5) * TVS, (e.y + 0.5) * TVS, (e.z + 0.5) * TVS], v: e.v });
  TOTEM = { ...P.geometry(TVS, [0, 0, 0], { glowIntensity: 2 }), samp };
  return TOTEM;
}
export function buildMedusaTotem() {
  const g = new THREE.Group();
  g.name = 'medusa_totem';
  const geo = totemGeo();
  const mat = voxToon(), glowMat = voxGlow();
  if (geo.solid) { const m = new THREE.Mesh(geo.solid, mat); m.castShadow = true; g.add(m); }
  if (geo.glow) g.add(new THREE.Mesh(geo.glow, glowMat));
  /** Break it: chips of ivory and jade (glinting) burst out in `parent`'s space, settling at floorY there. Call update(dt) each frame. */
  g.shatter = (parent = g.parent, floorY = 0) => {
    if (g.userData.shattered) return g.userData.shattered;
    const host = parent || g;
    g.updateMatrixWorld(true); host.updateMatrixWorld(true);
    const S = new StatueShatter(host, TVS * 2.4, 160);
    S.floorY = floorY;
    const toHost = new THREE.Matrix4().copy(host.matrixWorld).invert().multiply(g.matrixWorld);
    const c = new THREE.Vector3(0, 0.1, 0).applyMatrix4(toHost);
    for (let i = 0; i < 150; i++) {
      const s = geo.samp[Math.floor(Math.random() * geo.samp.length)];
      const p = new THREE.Vector3(...s.p).applyMatrix4(toHost);
      const d = p.clone().sub(c);
      const glow = (s.v & (1 << 24)) !== 0, ore = glow || Math.random() < 0.1;
      const col = LINC('#' + ((s.v & 0xffffff) >>> 0).toString(16).padStart(6, '0'));
      S.add(p, ore ? LINC('#7affc0') : col, [d.x * 9 + (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 1.6, d.z * 9 + (Math.random() - 0.5) * 0.8], ore, 1);
    }
    for (const ch of g.children) ch.visible = false;
    g.userData.shattered = { pieces: S.pieces, update: (dt) => S.update(dt), get done() { return S.done; }, dispose: () => { S.dispose(); mat.dispose(); glowMat.dispose(); } };
    return g.userData.shattered;
  };
  return g;
}
