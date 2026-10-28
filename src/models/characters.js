// The four explorers as low-poly chibi/anime models: procedural rig, pose blending with
// per-anim snappiness, painted pixel faces with blinking, and spring-driven secondary motion
// (Clover's ears & scarf, Elio's hat & robe, Durgan's beard, Bran's apron).
import * as THREE from 'three';
import { TOON4, pixelTexture } from '../gfx/materials.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { CHARACTERS } from '../data/characters.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
const outQ = (t) => 1 - (1 - t) * (1 - t);
const inQ = (t) => t * t;
const outBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// ------------------------------------------------------------------ materials & geometry helpers
class Mats {
  constructor() { this.all = []; }
  toon(color, o = {}) {
    const m = new THREE.MeshToonMaterial({
      color: new THREE.Color(color), gradientMap: TOON4,
      map: o.map || null, side: o.side || THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1,
    });
    m.userData.flat = o.flat !== false;
    this.all.push(m);
    return m;
  }
  glow(color, i = 2.2, o = {}) {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(i), transparent: !!o.additive || !!o.transparent, opacity: o.opacity ?? 1,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.additive, fog: false,
    });
    return m;
  }
  basic(color) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }); }
}

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s),
  sph: (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h),
  cap: (r, w = 10, h = 5, arc = 0.5) => new THREE.SphereGeometry(r, w, h, 0, TAU, 0, Math.PI * arc),
  cone: (r, h, s = 7) => new THREE.ConeGeometry(r, h, s),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
};

/** Faceted normals (MeshToonMaterial has no flatShading switch). */
function flatten(geo) {
  if (geo.userData.flat) return geo;
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  g.userData.flat = true;
  return g;
}
function mk(geo, mat, parent, p = [0, 0, 0], r = [0, 0, 0], s = null) {
  if (mat.userData && mat.userData.flat) geo = flatten(geo);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  m.rotation.set(r[0], r[1], r[2]);
  if (s) m.scale.set(s[0], s[1], s[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
/** A limb segment hanging down from its joint. */
function limb(parent, rt, rb, len, mat, s = 7, zs = 1) {
  return mk(G.cyl(rt, rb, len, s), mat, parent, [0, -len / 2, 0], [0, 0, 0], [1, 1, zs]);
}
/** Bangs: wedge strands hugging the front of a head sphere of radius r. */
function fringe(parent, mat, r, strands) {
  for (const [a, len, w, tilt] of strands) {
    const y = r * 0.66;
    const R = Math.sqrt(Math.max(0.0001, r * r - y * y)) + 0.01;
    const g = joint(parent, Math.sin(a) * R, y, Math.cos(a) * R);
    g.rotation.set(-0.35 + (tilt || 0), a, 0);
    mk(G.box(w, len, 0.035), mat, g, [0, -len / 2 + 0.035, 0], [0, 0, a * 0.3]);
  }
}
/** Anime hair cap: covers top/sides/back, rim rises at the front so the face stays clear. */
function hairCap(parent, mat, r, o = {}) {
  const cap = mk(new THREE.SphereGeometry(r, 12, 8, 0, TAU, 0, Math.PI * (o.arc ?? 0.56)), mat, parent, [0, o.y ?? 0.01, o.z ?? -0.01], [-(o.tilt ?? 0.62), 0, 0]);
  mk(G.sph(r * 0.82, 9, 6), mat, parent, [0, -r * 0.25, -r * 0.42]); // back volume
  return cap;
}
/** Little 5-point star mesh (flat). */
function starGeo(r = 0.03) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: r * 0.3, bevelEnabled: false });
  g.translate(0, 0, -r * 0.15);
  return g;
}

// ------------------------------------------------------------------ painted anime faces
const FACE = 32;
const FACE_SPECS = {
  bran: { skin: '#e8a878', shade: '#c9846a', iris: ['#2a1608', '#6a4224', '#b08a54'], brow: '#3a1a10', eye: 'soft', stubble: true, blush: '#e8806e', mouth: '#5a1e16', tongue: '#e8707a' },
  elio: { skin: '#f4cca8', shade: '#dca888', iris: ['#10205a', '#3a6aff', '#a8d0ff'], brow: '#a8a0d0', eye: 'soft', glasses: '#d8b040', blush: '#ff9a9a', mouth: '#6a2a2a', tongue: '#ff7a8a' },
  durgan: { skin: '#eab48a', shade: '#cc9070', iris: ['#100808', '#3a2414', '#7a5a34'], brow: null, eye: 'small', blush: '#e88a7a', mouth: '#5a1e16', tongue: '#e8707a' },
  clover: { skin: '#fff1ea', shade: '#f0d4cc', iris: ['#4a0820', '#d03a6a', '#ffb0d0'], brow: '#d8cccc', eye: 'big', lashes: true, blush: '#ffa8bc', blushAlways: true, mouth: '#7a2a3a', tongue: '#ff8aa0' },
};
const EYE_LAYOUT = {
  big: { w: 5, h: 7, lx: 8, rx: 19, y: 13 },
  soft: { w: 5, h: 6, lx: 8, rx: 19, y: 14 },
  small: { w: 3, h: 4, lx: 10, rx: 19, y: 14 },
};

class Face {
  constructor(spec) {
    this.spec = spec;
    this.canvas = document.createElement('canvas');
    this.canvas.width = FACE; this.canvas.height = FACE;
    this.ctx = this.canvas.getContext('2d');
    this.tex = pixelTexture(this.canvas);
    this.key = '';
  }
  px(x, y, c) { if (!c) return; this.ctx.fillStyle = c; this.ctx.fillRect(x, y, 1, 1); }
  draw(expr, blink) {
    const key = expr + (blink ? 'b' : '');
    if (key === this.key) return;
    this.key = key;
    const s = this.spec, g = this.ctx;
    g.clearRect(0, 0, FACE, FACE);
    g.fillStyle = s.skin; g.fillRect(0, 0, FACE, FACE);
    // soft under-chin shade so the face reads as a volume
    for (let x = 0; x < FACE; x++) for (let y = 27; y < FACE; y++) if ((x + y) % 2 === 0 || y > 28) this.px(x, y, s.shade);
    const L = EYE_LAYOUT[s.eye];
    const D = s.iris[0], M = s.iris[1], Li = s.iris[2], P = '#120a14', W = '#ffffff', ink = '#1c1018';
    if (s.stubble) {
      for (let y = 21; y < 29; y++) for (let x = 7; x < 25; x++) {
        const dx = (x - 15.5) / 9, dy = (y - 22) / 7;
        if (dx * dx + dy * dy < 1 && y > 25 && (x + y) % 2 === 0) this.px(x, y, s.shade);
      }
    }
    // nose hint
    if (s.eye !== 'small') this.px(16, 21, s.shade);
    // glasses rings behind eyes
    if (s.glasses) {
      for (const cx of [L.lx + L.w / 2, L.rx + L.w / 2]) {
        const cy = L.y + L.h / 2;
        for (let y = 0; y < FACE; y++) for (let x = 0; x < FACE; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > 3.55 && d < 4.55) this.px(x, y, s.glasses);
        }
        this.px(Math.floor(cx) - 3, L.y, '#fffbe0');
      }
      this.px(15, L.y + 1, s.glasses); this.px(16, L.y + 1, s.glasses);
    }
    const eyeState = blink && ['neutral', 'surprised', 'sad', 'determined', 'angry', 'smug'].includes(expr) ? 'closed' : {
      neutral: 'open', happy: 'happy', angry: 'angry', surprised: 'wide', sad: 'sad', smug: 'half', determined: 'narrow', hurt: 'hurt', sleepy: 'closed',
    }[expr] || 'open';
    const drawEye = (x, left) => {
      const y = L.y, w = L.w, h = L.h;
      const outer = left ? x - 1 : x + w;
      const inner = left ? x + w - 1 : x;
      const K = ink;
      // anime eye: ink ring, dark upper iris, pupil, light lower iris, big highlight
      const open = (opts = {}) => {
        if (w === 3) {
          const rows = ['.K.', 'KWK', 'KKK', '.K.'];
          rows.forEach((r, j) => [...r].forEach((ch, i) => this.px(x + i, y + j, ch === 'K' ? K : ch === 'W' ? W : null)));
          return;
        }
        const top = opts.top || 0;
        for (let j = top; j < h; j++) for (let i = 0; i < w; i++) {
          const corner = (j === top || j === h - 1) && (i === 0 || i === w - 1);
          if (corner) continue;
          let c;
          if (j === top || i === 0 || i === w - 1 || j === h - 1) c = K;
          else if (j <= top + 1) c = D;
          else if (j === h - 2) c = Li;
          else c = M;
          this.px(x + i, y + j, c);
        }
        // pupil
        const pc = Math.floor(w / 2);
        for (let j = Math.max(top + 1, 2); j < h - 2; j++) this.px(x + pc, y + j, opts.smallPupil ? M : P);
        if (!opts.smallPupil && w > 4) for (let j = Math.max(top + 1, 2); j < h - 2; j++) this.px(x + pc - (left ? 0 : 0), y + j, P);
        // highlights (always upper-left for a consistent light)
        if (top < 2) { this.px(x + 1, y + Math.max(1, top + 1), W); if (h >= 6) this.px(x + 1, y + Math.max(2, top + 2), W); }
        this.px(x + w - 2, y + h - 2, opts.smallPupil ? W : Li);
        if (s.lashes) { this.px(outer, y + top, K); this.px(left ? x - 1 : x + w, y + top + 1, K); this.px(left ? x - 2 : x + w + 1, y + top, K); }
        // thick upper lash
        for (let i = 1; i < w - 1; i++) this.px(x + i, y + top - 1 >= 0 ? y + top : y, K);
      };
      switch (eyeState) {
        case 'open': open(); break;
        case 'wide': open({ smallPupil: true }); this.px(x + Math.floor(w / 2), y + Math.floor(h / 2), P); break;
        case 'half': open({ top: 2 }); for (let i = 0; i < w; i++) this.px(x + i, y + 2, K); break;
        case 'narrow':
          open({ top: 1 });
          for (let i = 0; i < w; i++) this.px(x + i, y + 1, K);
          this.px(inner, y + 2, K);
          break;
        case 'angry':
          open({ top: 1 });
          for (let i = 0; i < w; i++) this.px(x + i, y + 1, K);
          this.px(inner, y + 2, K); this.px(left ? inner - 1 : inner + 1, y + 2, K);
          break;
        case 'sad':
          open();
          this.px(outer === x - 1 ? x : x + w - 1, y, s.skin);
          this.px(left ? x : x + w - 1, y + h, '#9ad8ff'); this.px(left ? x : x + w - 1, y + h + 1, '#5ab0f0');
          break;
        case 'happy':
          for (let i = 1; i < w - 1; i++) this.px(x + i, y + 2, K);
          this.px(x, y + 3, K); this.px(x + w - 1, y + 3, K);
          if (s.lashes) this.px(outer, y + 2, K);
          break;
        case 'closed':
          for (let i = 0; i < w; i++) this.px(x + i, y + h - 2, K);
          this.px(left ? x : x + w - 1, y + h - 3, null);
          if (s.lashes) this.px(outer, y + h - 3, K);
          break;
        case 'hurt': {
          const o = Math.floor((h - 3) / 2);
          if (left) { this.px(x, y + o, K); this.px(x + 1, y + o + 1, K); this.px(x + 2, y + o + 1, K); this.px(x, y + o + 2, K); }
          else { this.px(x + w - 1, y + o, K); this.px(x + w - 2, y + o + 1, K); this.px(x + w - 3, y + o + 1, K); this.px(x + w - 1, y + o + 2, K); }
          break;
        }
        default: open();
      }
    };
    drawEye(L.lx, true);
    drawEye(L.rx, false);
    // brows
    if (s.brow) {
      const by = L.y - 2;
      const browRow = (x0, left) => {
        for (let i = 0; i < L.w; i++) {
          const towardInner = left ? i : L.w - 1 - i; // 0 outer … w-1 inner
          let dy = 0;
          if (expr === 'angry' || expr === 'determined') dy = towardInner >= L.w - 2 ? 1 : 0;
          else if (expr === 'sad' || expr === 'hurt') dy = towardInner >= L.w - 2 ? -1 : 0;
          else if (expr === 'surprised') dy = -1;
          else if (expr === 'smug' && !left) dy = -1;
          this.px(x0 + i, by + dy, s.brow);
        }
      };
      browRow(L.lx, true);
      browRow(L.rx, false);
    }
    // blush
    if (s.blushAlways || ['happy', 'smug', 'surprised', 'hurt'].includes(expr)) {
      const by = L.y + L.h + 1;
      for (const bx of [L.lx - 1, L.rx + L.w - 1]) { this.px(bx, by, s.blush); this.px(bx + 1, by, s.blush); }
    }
    // mouth
    const mc = s.mouth, my = 24;
    const m = {
      neutral: [[15, my], [16, my]],
      happy: [[14, my - 1], [15, my - 1], [16, my - 1], [17, my - 1], [15, my, s.tongue], [16, my, s.tongue]],
      angry: [[14, my - 1], [15, my - 1, '#ffffff'], [16, my - 1, '#ffffff'], [17, my - 1], [14, my], [15, my], [16, my], [17, my]],
      surprised: [[15, my - 1], [16, my - 1], [15, my], [16, my]],
      sad: [[15, my - 1], [16, my - 1], [14, my], [17, my]],
      smug: [[14, my], [15, my], [16, my], [17, my - 1]],
      determined: [[14, my], [15, my], [16, my], [17, my]],
      hurt: [[14, my], [15, my - 1], [16, my], [17, my - 1]],
      sleepy: [[16, my, s.shade], [15, my, s.shade]],
    }[expr] || [[15, my], [16, my]];
    for (const [x, y, c] of m) this.px(x, y, c || mc);
    if (expr === 'hurt' || expr === 'surprised') { this.px(26, 11, '#bfe8ff'); this.px(26, 12, '#7fc8ff'); this.px(25, 12, '#bfe8ff'); }
    this.tex.needsUpdate = true;
  }
}

/** Apply planar front-projection UVs to a head sphere so the face texture sits on the front. */
function faceUV(geo, rx, ry) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u = x / (2 * rx) + 0.5, v = y / (2 * ry) + 0.5;
    if (z < 0) u = x > 0 ? 0.995 : 0.005;
    uv.setXY(i, clamp(u, 0.005, 0.995), clamp(v, 0.005, 0.995));
  }
  uv.needsUpdate = true;
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
  fire: ['#ff7a2a', '#ffe08a', 0xff8a3a],
  ice: ['#5ad8ff', '#e6fbff', 0x7fe3ff],
  shock: ['#ffd23a', '#fffbd0', 0xffe74a],
  poison: ['#6ad04a', '#d8ff9a', 0x8fe04a],
};
export class Kindle {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'kindle';
    this.body = joint(this.group);
    this.mats = {};
    for (const [k, [a, b]] of Object.entries(KINDLE_COLORS)) {
      this.mats[k] = {
        core: new THREE.MeshBasicMaterial({ color: new THREE.Color(a).multiplyScalar(2.2), fog: false }),
        tuft: new THREE.MeshBasicMaterial({ color: new THREE.Color(b).multiplyScalar(2.6), fog: false }),
        aura: new THREE.MeshBasicMaterial({ color: new THREE.Color(a).multiplyScalar(0.9), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      };
    }
    this.core = mk(G.ico(0.07, 1), this.mats.fire.core, this.body, [0, 0, 0], [0, 0, 0], [1, 1.08, 1]);
    this.core.castShadow = false;
    this.aura = mk(G.ico(0.105, 1), this.mats.fire.aura, this.body);
    this.aura.layers.set(LAYER_FX);
    this.aura.castShadow = false;
    this.tufts = [];
    for (let i = 0; i < 3; i++) {
      const t = mk(G.cone(0.04 - i * 0.008, 0.11 - i * 0.02, 5), this.mats.fire.tuft, this.body, [(i - 1) * 0.03, 0.08 + (i === 1 ? 0.02 : 0), 0], [0, 0, (1 - i) * 0.35]);
      t.castShadow = false;
      this.tufts.push(t);
    }
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a0c10 });
    this.eyes = [-0.024, 0.024].map((x) => mk(G.box(0.016, 0.028, 0.01), eyeM, this.body, [x, 0.01, 0.068]));
    this.cheeks = [-0.04, 0.04].map((x) => mk(G.box(0.014, 0.008, 0.008), new THREE.MeshBasicMaterial({ color: 0xff8aa0 }), this.body, [x, -0.016, 0.062]));
    this.hands = [-1, 1].map((sx) => mk(G.ico(0.018, 0), this.mats.fire.tuft, this.body, [sx * 0.085, -0.02, 0.02]));
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
    this.body.rotation.z = Math.sin(t * 1.7) * 0.15;
    this.body.rotation.y = Math.sin(t * 0.9) * 0.3;
    const pulse = 1 + Math.sin(t * 7) * 0.05 + this.excite * 0.25;
    this.core.scale.set(pulse, pulse * 1.08, pulse);
    this.aura.scale.setScalar(1 + Math.sin(t * 5) * 0.08 + this.excite * 0.4);
    this.tufts.forEach((tf, i) => { tf.scale.y = 1 + Math.sin(t * 11 + i * 2) * 0.25; tf.rotation.z = (1 - i) * 0.35 + Math.sin(t * 6 + i) * 0.15; });
    this.hands.forEach((h, i) => { h.position.y = -0.02 + Math.sin(t * 3 + i * Math.PI) * 0.02; });
    this.blink -= dt;
    const closed = this.blink < 0.1;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = closed ? 0.25 : 1;
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
  const drop = c.seatH - c.dims.hipH;
  return { dy: drop, lHip: 1.45, rHip: 1.45, lKn: 1.45, rKn: 1.45, lHab: 0.12, rHab: 0.12, lFt: -0.1, rFt: -0.1 };
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
    this.rig = {};
    this.pose = {};
    for (const k of CH) this.pose[k] = REST[k] || 0;
    this.time = Math.random() * 10;
    this.animT = 0;
    this.anim = 'idle';
    this.loopAnim = 'idle';
    this.animOpts = {};
    this.seated = false;
    this.seatH = 0.32;
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

  // ---------------------------------------------------------- skeleton
  skeleton(d) {
    this.dims = d;
    const R = this.rig;
    R.body = joint(this.group);
    R.hips = joint(R.body, 0, d.hipH, 0);
    R.spine = joint(R.hips, 0, 0.03, 0);
    R.neck = joint(R.spine, 0, d.torsoH, 0);
    R.head = joint(R.neck, 0, d.neckH, 0);
    R.shL = joint(R.spine, d.shX, d.shY, 0);
    R.shR = joint(R.spine, -d.shX, d.shY, 0);
    R.shL.rotation.order = 'XZY'; R.shR.rotation.order = 'XZY';
    R.elL = joint(R.shL, 0, -d.armUp, 0);
    R.elR = joint(R.shR, 0, -d.armUp, 0);
    R.handL = joint(R.elL, 0, -d.armLo, 0);
    R.handR = joint(R.elR, 0, -d.armLo, 0);
    R.hipL = joint(R.hips, d.hipX, 0, 0);
    R.hipR = joint(R.hips, -d.hipX, 0, 0);
    R.knL = joint(R.hipL, 0, -d.legUp, 0);
    R.knR = joint(R.hipR, 0, -d.legUp, 0);
    R.ftL = joint(R.knL, 0, -d.legLo, 0);
    R.ftR = joint(R.knR, 0, -d.legLo, 0);
    // mount points for held items (blade along hand's forward, tilted up)
    for (const side of ['L', 'R']) {
      const m = joint(R['hand' + side], 0, -0.02, 0.0);
      m.rotation.set(Math.PI / 2 - 0.55, 0, 0);
      R['mount' + side] = m;
    }
  }
  /** Head sphere with painted face. */
  makeHead(r, spec, squash = [1, 0.94, 0.96]) {
    this.face = new Face(spec);
    const geo = G.sph(r, 14, 11);
    faceUV(geo, r, r);
    const mat = this.mats.toon('#ffffff', { map: this.face.tex, flat: false });
    const head = mk(geo, mat, this.rig.head, [0, r * 0.92, 0], [0, 0, 0], squash);
    this.headMesh = head;
    this.headR = r;
    return head;
  }
  addSpring(obj, axis, opts) {
    const s = { obj, axis, base: opts.base ?? obj.rotation[axis], gain: opts.gain ?? 0.6, src: opts.src || 'vz', sp: new Spring(opts.k ?? 80, opts.d ?? 8), wobble: opts.wobble || 0, phase: opts.phase || 0, min: opts.min ?? -2, max: opts.max ?? 2, extra: opts.extra };
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
    out.y += this.headTop || this.headR * 2.1;
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
    if (this.seated && SEATED_OK.has(this.anim)) Object.assign(T, sitLegs(this), { dy: sitLegs(this).dy + (target.dy || 0) * 0.3 });
    // look-at offsets
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

    // blinking
    if (this.exprLock > 0) this.exprLock -= dt;
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      if (this.blinkOn <= 0) { this.blinkOn = 0.12; this.face.draw(this.expr, true); }
      this.blinkT = 2 + Math.random() * 3.5;
      if (Math.random() < 0.18) this.blinkT = 0.25; // double blink
    }
    if (this.blinkOn > 0) { this.blinkOn -= dt; if (this.blinkOn <= 0) this.face.draw(this.expr, false); }

    // velocity for secondary motion
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

    // hit flash
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
    R.ftL.rotation.x = p.lFt - (p.lKn - p.lHip) * 0.0;
    R.ftR.rotation.x = p.rFt;
  }
}

// ------------------------------------------------------------------ builders
const BUILD = {
  bran(c) {
    const M = c.def.model;
    const mt = c.mats;
    const skin = mt.toon(M.skin, { flat: false }), shirt = mt.toon('#e6d6b4'), pants = mt.toon('#5a3a28');
    const apron = mt.toon('#5a3a22'), apronD = mt.toon('#3e2616'), boot = mt.toon('#33221a'), belt = mt.toon('#2a1a10');
    const brass = mt.toon('#e0a83a'), metal = mt.toon('#9aa3b2'), metalD = mt.toon('#5b6170'), wood = mt.toon('#8a5a33');
    const hair = mt.toon(M.hair), band = mt.toon('#c8402a'), bandD = mt.toon('#8a2a1c');
    c.skeleton({ hipH: 0.56, legUp: 0.26, legLo: 0.25, hipX: 0.12, torsoH: 0.46, shY: 0.4, shX: 0.33, armUp: 0.25, armLo: 0.24, neckH: 0.04 });
    const R = c.rig;
    // hips & torso
    mk(G.cyl(0.2, 0.21, 0.18, 8), pants, R.hips, [0, -0.02, 0], [0, 0, 0], [1, 1, 0.78]);
    mk(G.cyl(0.33, 0.22, 0.44, 8), shirt, R.spine, [0, 0.22, 0], [0, Math.PI / 8, 0], [1, 1, 0.66]);
    mk(G.cyl(0.235, 0.235, 0.06, 8), belt, R.spine, [0, 0.02, 0], [0, 0, 0], [1, 1, 0.75]);
    mk(G.box(0.07, 0.06, 0.03), brass, R.spine, [0, 0.02, 0.18]);
    // shirt collar opening & chest hair hint
    mk(G.box(0.12, 0.1, 0.02), skin, R.spine, [0, 0.38, 0.2], [0.25, 0, 0]);
    // apron (upper on chest, lower flap with spring)
    mk(G.box(0.36, 0.34, 0.03), apron, R.spine, [0, 0.21, 0.205], [0.06, 0, 0]);
    mk(G.box(0.36, 0.025, 0.035), apronD, R.spine, [0, 0.07, 0.212]);
    for (const sx of [-1, 1]) mk(G.box(0.045, 0.32, 0.02), apronD, R.spine, [sx * 0.15, 0.4, 0.06], [-0.35, 0, sx * 0.2]);
    const flap = joint(R.hips, 0, 0.0, 0.17);
    mk(G.box(0.36, 0.36, 0.03), apron, flap, [0, -0.17, 0]);
    mk(G.box(0.12, 0.08, 0.035), apronD, flap, [0.08, -0.2, 0.01]); // pocket
    mk(G.box(0.02, 0.1, 0.02), metal, flap, [0.06, -0.14, 0.02], [0, 0, 0.2]); // tongs in pocket
    c.addSpring(flap, 'x', { base: 0, src: 'vz', gain: -0.15, k: 70, d: 7, extra: (ch) => Math.max(0, ch.pose.lHip, ch.pose.rHip) * -0.75 });
    // arms (rolled sleeves, thick forearms, big fists)
    for (const S of ['L', 'R']) {
      limb(R['sh' + S], 0.085, 0.078, 0.25, shirt);
      mk(G.sph(0.1, 8, 6), shirt, R['sh' + S], [0, -0.02, 0]);
      mk(G.cyl(0.088, 0.088, 0.05, 8), shirt, R['el' + S], [0, -0.01, 0]);
      limb(R['el' + S], 0.078, 0.066, 0.24, skin);
      mk(G.box(0.11, 0.11, 0.1), skin, R['hand' + S], [0, -0.03, 0.005]);
    }
    // legs & boots
    for (const S of ['L', 'R']) {
      limb(R['hip' + S], 0.105, 0.09, 0.26, pants);
      limb(R['kn' + S], 0.09, 0.085, 0.25, boot);
      mk(G.cyl(0.095, 0.095, 0.04, 8), apronD, R['kn' + S], [0, -0.06, 0]);
      mk(G.box(0.13, 0.08, 0.22), boot, R['ft' + S], [0, -0.0, 0.04]);
    }
    // neck & head
    mk(G.cyl(0.08, 0.09, 0.08, 7), skin, R.neck, [0, 0.02, 0]);
    c.makeHead(0.25, FACE_SPECS.bran);
    const hy = 0.25 * 0.92;
    const hg = joint(R.head, 0, hy, 0);
    for (const sx of [-1, 1]) mk(G.sph(0.05, 6, 5), skin, hg, [sx * 0.24, -0.02, 0], [0, 0, 0], [0.6, 1, 0.8]); // ears
    // hair: spikes peeking out under bandana + sideburns
    fringe(hg, hair, 0.25, [[-0.62, 0.1, 0.09], [-0.25, 0.115, 0.1], [0.12, 0.105, 0.1], [0.48, 0.1, 0.09], [0.85, 0.11, 0.08], [-0.98, 0.11, 0.08]]);
    for (const [x, z, rz] of [[0.23, -0.02, -1.0], [-0.23, -0.02, 1.0], [0.18, -0.15, -0.8], [-0.18, -0.15, 0.8]]) mk(G.cone(0.05, 0.13, 4), hair, hg, [x, 0.04, z], [0, 0, rz]);
    for (const sx of [-1, 1]) mk(G.box(0.04, 0.12, 0.06), hair, hg, [sx * 0.22, -0.02, 0.06]);
    mk(G.sph(0.25, 10, 7), hair, hg, [0, 0.0, -0.04], [0, 0, 0], [1.02, 0.96, 1]); // back hair volume
    const bandana = mk(G.cap(0.268, 12, 5, 0.42), band, hg, [0, 0.03, -0.01], [-0.15, 0, 0]);
    mk(G.cyl(0.262, 0.268, 0.04, 12), bandD, hg, [0, 0.07, -0.02], [-0.2, 0, 0]);
    const knot = joint(hg, 0, 0.1, -0.24);
    mk(G.box(0.07, 0.07, 0.05), band, knot, [0, 0, 0]);
    for (const sx of [-1, 1]) {
      const tail = joint(knot, sx * 0.03, -0.02, -0.01);
      mk(G.box(0.05, 0.16, 0.02), band, tail, [0, -0.08, 0], [0, 0, sx * 0.15]);
      c.addSpring(tail, 'x', { base: 0.25, src: 'vz', gain: 0.4, wobble: 0.08, phase: sx, k: 50, d: 5 });
    }
    void bandana;
    // giant hammer on back
    const back = joint(R.spine, 0.02, 0.24, -0.24);
    back.rotation.set(0.1, 0, 0.75);
    mk(G.cyl(0.035, 0.035, 1.0, 6), wood, back, [0, 0, 0]);
    mk(G.box(0.38, 0.2, 0.2), metal, back, [0, 0.52, 0]);
    for (const sx of [-1, 1]) mk(G.box(0.05, 0.22, 0.22), metalD, back, [sx * 0.19, 0.52, 0]);
    mk(G.box(0.06, 0.05, 0.05), brass, back, [0, 0.4, 0]);
    mk(G.cyl(0.045, 0.045, 0.16, 6), mt.toon('#4a2a1a'), back, [0, -0.38, 0]);
    c.backItem = back;
    c.headTop = 0.6;
  },

  elio(c) {
    const M = c.def.model;
    const mt = c.mats;
    const skin = mt.toon(M.skin, { flat: false }), robe = mt.toon('#3a4ab0'), robeD = mt.toon('#26307a'), gold = mt.toon('#ffcf5a');
    const hatM = mt.toon('#2c2c78'), hatD = mt.toon('#1e1e58'), hair = mt.toon(M.hair), shoe = mt.toon('#6a3a7a'), pants = mt.toon('#2a2448');
    const starM = mt.glow('#ffe27a', 2.0);
    const sleeve = mt.toon('#3a4ab0', { side: THREE.DoubleSide }), goldDS = mt.toon('#ffcf5a', { side: THREE.DoubleSide });
    const inside = mt.toon('#221c48', { side: THREE.DoubleSide });
    c.skeleton({ hipH: 0.36, legUp: 0.17, legLo: 0.16, hipX: 0.075, torsoH: 0.3, shY: 0.26, shX: 0.16, armUp: 0.17, armLo: 0.16, neckH: 0.03 });
    const R = c.rig;
    // robe: chest + flared skirt (child of hips, sways)
    mk(G.cyl(0.14, 0.19, 0.32, 8), robe, R.spine, [0, 0.15, 0], [0, Math.PI / 8, 0], [1, 1, 0.85]);
    mk(G.box(0.05, 0.3, 0.03), gold, R.spine, [0, 0.14, 0.155], [-0.12, 0, 0]);
    mk(G.cyl(0.2, 0.2, 0.05, 8), gold, R.spine, [0, 0.0, 0], [0, Math.PI / 8, 0], [1, 1, 0.85]); // sash
    const skirt = joint(R.hips, 0, 0.02, 0);
    mk(G.cyl(0.2, 0.36, 0.38, 9), robe, skirt, [0, -0.19, 0], [0, Math.PI / 9, 0]);
    mk(G.cyl(0.365, 0.37, 0.035, 9), gold, skirt, [0, -0.37, 0], [0, Math.PI / 9, 0]);
    mk(G.cyl(0.22, 0.2, 0.06, 9), robeD, skirt, [0, -0.02, 0]);
    c.addSpring(skirt, 'x', { base: 0, src: 'vz', gain: -0.18, k: 40, d: 5, min: -0.35, max: 0.35 });
    c.addSpring(skirt, 'z', { base: 0, src: 'vx', gain: 0.18, k: 40, d: 5, min: -0.3, max: 0.3 });
    // big collar
    mk(G.cyl(0.11, 0.21, 0.07, 9), robeD, R.neck, [0, -0.02, 0]);
    mk(G.cyl(0.212, 0.215, 0.02, 9), gold, R.neck, [0, -0.055, 0]);
    // sleeves hide hands
    for (const S of ['L', 'R']) {
      limb(R['sh' + S], 0.06, 0.075, 0.17, robe);
      mk(G.sph(0.075, 7, 5), robe, R['sh' + S], [0, -0.01, 0]);
      mk(new THREE.CylinderGeometry(0.075, 0.14, 0.2, 8, 1, true), sleeve, R['el' + S], [0, -0.09, 0]);
      mk(new THREE.CylinderGeometry(0.142, 0.146, 0.03, 8, 1, true), goldDS, R['el' + S], [0, -0.185, 0]);
      mk(new THREE.CircleGeometry(0.128, 8), inside, R['el' + S], [0, -0.165, 0], [Math.PI / 2, 0, 0]);
      mk(G.sph(0.035, 6, 5), skin, R['hand' + S], [0, 0.0, 0.01]);
    }
    for (const S of ['L', 'R']) {
      limb(R['hip' + S], 0.05, 0.045, 0.17, pants);
      limb(R['kn' + S], 0.045, 0.04, 0.16, pants);
      mk(G.box(0.08, 0.05, 0.14), shoe, R['ft' + S], [0, 0.0, 0.03]);
      mk(G.cone(0.03, 0.08, 5), shoe, R['ft' + S], [0, 0.03, 0.12], [-1.0, 0, 0]);
    }
    // head + hair
    c.makeHead(0.23, FACE_SPECS.elio);
    const hy = 0.23 * 0.92;
    const hg = joint(R.head, 0, hy, 0);
    hairCap(hg, hair, 0.245);
    fringe(hg, hair, 0.23, [[-0.8, 0.13, 0.09], [-0.42, 0.11, 0.1], [-0.05, 0.12, 0.1], [0.32, 0.105, 0.1], [0.7, 0.12, 0.09]]);
    for (const sx of [-1, 1]) mk(G.box(0.06, 0.2, 0.08), hair, hg, [sx * 0.21, -0.04, 0.04], [0, 0, sx * 0.08]);
    // the enormous floppy starry hat
    const hat = joint(hg, 0, 0.15, -0.01);
    hat.rotation.set(-0.12, 0, 0.1);
    mk(G.cyl(0.44, 0.46, 0.03, 12), hatM, hat, [0, 0, 0]);
    mk(G.cyl(0.25, 0.27, 0.05, 12), gold, hat, [0, 0.035, 0]);
    mk(G.cyl(0.19, 0.25, 0.24, 10), hatM, hat, [0, 0.16, 0]);
    const h2 = joint(hat, 0, 0.28, 0);
    mk(G.cyl(0.12, 0.19, 0.2, 9), hatM, h2, [0, 0.1, 0]);
    const h3 = joint(h2, 0, 0.2, 0);
    mk(G.cone(0.12, 0.26, 8), hatD, h3, [0, 0.12, 0]);
    const h4 = joint(h3, 0, 0.22, 0);
    mk(G.cone(0.05, 0.1, 6), hatD, h4, [0, 0.05, 0]);
    const tipStar = mk(starGeo(0.045), starM, h4, [0, 0.12, 0]);
    tipStar.castShadow = false;
    h3.rotation.z = -0.55; h4.rotation.z = -0.5;
    c.addSpring(h2, 'z', { base: -0.15, src: 'vx', gain: 0.25, k: 35, d: 4, wobble: 0.04 });
    c.addSpring(h3, 'z', { base: -0.6, src: 'vx', gain: 0.35, k: 30, d: 3.5, wobble: 0.06, phase: 1 });
    c.addSpring(h4, 'z', { base: -0.55, src: 'vx', gain: 0.4, k: 25, d: 3, wobble: 0.08, phase: 2 });
    c.addSpring(h3, 'x', { base: 0, src: 'vz', gain: -0.3, k: 30, d: 3.5 });
    c.addSpring(h4, 'x', { base: 0, src: 'vy', gain: 0.4, k: 25, d: 3 });
    for (const [a, y, r] of [[0.6, 0.12, 0.215], [2.2, 0.2, 0.2], [3.9, 0.08, 0.23], [5.1, 0.24, 0.18]]) {
      const s = mk(starGeo(0.028), starM, hat, [Math.sin(a) * r, y, Math.cos(a) * r], [0, a, 0]);
      s.castShadow = false;
    }
    // book prop for reading
    const book = joint(R.handL, -0.06, -0.04, 0.08);
    book.rotation.set(-0.9, 0.2, 0.1);
    mk(G.box(0.2, 0.02, 0.15), mt.toon('#8a2a3a'), book, [0, 0, 0]);
    mk(G.box(0.19, 0.022, 0.14), mt.toon('#f0e6c8'), book, [0, 0.012, 0]);
    mk(G.box(0.01, 0.026, 0.15), gold, book, [0, 0.012, 0]);
    book.visible = false;
    c.props.book = book;
    // little wand on back
    const back = joint(R.spine, 0.04, 0.2, -0.17);
    back.rotation.set(0.15, 0, -0.6);
    mk(G.cyl(0.018, 0.024, 0.62, 5), mt.toon('#7a4a2a'), back, [0, 0, 0]);
    mk(G.oct(0.045), mt.glow('#7ad8ff', 1.8), back, [0, 0.34, 0]);
    c.backItem = back;
    // Kindle
    const k = new Kindle();
    c.group.add(k.group);
    k.group.position.set(0.38, 1.0, 0.15);
    c.kindle = k;
    c.kindleHome = new THREE.Vector3(0.36, 0.98, 0.12);
    c.extraUpdate = (dt) => {
      const t = c.time;
      const tgt = c.kindleTarget || c.kindleHome;
      const p = k.group.position;
      const ox = Math.sin(t * 0.9) * 0.08, oz = Math.cos(t * 0.7) * 0.06;
      p.x += (tgt.x + ox - p.x) * (1 - Math.exp(-4 * dt));
      p.y += (tgt.y + Math.sin(t * 1.6) * 0.03 - p.y) * (1 - Math.exp(-4 * dt));
      p.z += (tgt.z + oz - p.z) * (1 - Math.exp(-4 * dt));
    };
    c.headTop = 0.95;
  },

  durgan(c) {
    const M = c.def.model;
    const mt = c.mats;
    const skin = mt.toon(M.skin, { flat: false }), beard = mt.toon('#d8743a'), beardD = mt.toon('#a8542a');
    const steel = mt.toon('#8a94a6'), steelD = mt.toon('#5a6272'), gold = mt.toon('#e0b040'), tabard = mt.toon('#3a6a4a');
    const leather = mt.toon('#6a4228'), boot = mt.toon('#3a2618'), mail = mt.toon('#6e7888'), wood = mt.toon('#7a4a2a'), horn = mt.toon('#f0e6d0'), hornD = mt.toon('#b8a888');
    c.skeleton({ hipH: 0.25, legUp: 0.12, legLo: 0.11, hipX: 0.11, torsoH: 0.3, shY: 0.25, shX: 0.25, armUp: 0.15, armLo: 0.15, neckH: 0.0 });
    const R = c.rig;
    mk(G.cyl(0.22, 0.23, 0.14, 8), leather, R.hips, [0, -0.02, 0], [0, 0, 0], [1, 1, 0.85]);
    mk(G.cyl(0.27, 0.25, 0.32, 8), mail, R.spine, [0, 0.15, 0], [0, Math.PI / 8, 0], [1, 1, 0.82]);
    mk(G.box(0.3, 0.3, 0.04), tabard, R.spine, [0, 0.13, 0.2], [0.04, 0, 0]);
    mk(G.box(0.24, 0.16, 0.04), tabard, R.hips, [0, -0.06, 0.18]);
    mk(G.cyl(0.26, 0.26, 0.07, 8), leather, R.spine, [0, 0.02, 0], [0, 0, 0], [1, 1, 0.85]);
    mk(G.box(0.12, 0.09, 0.04), gold, R.spine, [0, 0.02, 0.22]);
    mk(G.box(0.06, 0.04, 0.045), steelD, R.spine, [0, 0.02, 0.225]);
    // pauldrons
    for (const S of ['L', 'R']) {
      const sx = S === 'L' ? 1 : -1;
      const pa = mk(G.cap(0.15, 8, 4, 0.5), steel, R['sh' + S], [sx * 0.02, 0.03, 0], [0, 0, -sx * 0.25]);
      mk(G.cyl(0.152, 0.152, 0.025, 8), gold, R['sh' + S], [sx * 0.02, 0.03, 0], [0, 0, -sx * 0.25]);
      void pa;
      limb(R['sh' + S], 0.075, 0.07, 0.15, mail);
      limb(R['el' + S], 0.07, 0.075, 0.15, leather);
      mk(G.box(0.12, 0.11, 0.11), steelD, R['hand' + S], [0, -0.03, 0.005]);
    }
    for (const S of ['L', 'R']) {
      limb(R['hip' + S], 0.095, 0.09, 0.12, leather);
      limb(R['kn' + S], 0.09, 0.095, 0.11, boot);
      mk(G.box(0.15, 0.1, 0.24), boot, R['ft' + S], [0, 0.0, 0.04]);
      mk(G.box(0.152, 0.03, 0.08), steelD, R['ft' + S], [0, 0.03, 0.12]);
    }
    c.makeHead(0.22, FACE_SPECS.durgan);
    const hy = 0.22 * 0.92;
    const hg = joint(R.head, 0, hy, 0);
    for (const sx of [-1, 1]) mk(G.cone(0.045, 0.1, 4), skin, hg, [sx * 0.22, 0.0, 0], [0, 0, -sx * 1.3]); // pointy gnome ears
    mk(G.sph(0.05, 7, 5), mt.toon('#f0a888', { flat: false }), hg, [0, -0.055, 0.205]); // big nose
    // bushy brows (3D)
    c.brows = [-1, 1].map((sx) => mk(G.box(0.095, 0.034, 0.05), beard, hg, [sx * 0.085, 0.06, 0.19], [0, 0, 0]));
    // helm with horns
    mk(G.cap(0.238, 12, 5, 0.47), steel, hg, [0, 0.07, -0.015]);
    mk(G.cyl(0.241, 0.246, 0.04, 12), gold, hg, [0, 0.09, -0.015]);
    mk(G.box(0.035, 0.05, 0.34), steelD, hg, [0, 0.29, -0.02]);
    for (const sx of [-1, 1]) {
      let p = joint(hg, sx * 0.21, 0.15, 0);
      p.rotation.z = -sx * 1.25;
      const segs = [[0.055, 0.11, horn], [0.042, 0.1, horn], [0.03, 0.09, hornD]];
      segs.forEach(([r, h, m], i) => {
        mk(G.cyl(r * 0.75, r, h, 6), m, p, [0, h / 2, 0]);
        const n = joint(p, 0, h, 0);
        n.rotation.z = sx * 0.55;
        p = n;
        if (i === 2) mk(G.cone(0.022, 0.06, 5), hornD, p, [0, 0.03, 0]);
      });
    }
    // the beard: wide wedge + mustache + braids, springy
    const bj = joint(hg, 0, -0.11, 0.12);
    mk(G.cone(0.21, 0.4, 6), beard, bj, [0, -0.19, 0.0], [Math.PI, 0, 0], [1.05, 1, 0.55]);
    mk(G.box(0.36, 0.1, 0.12), beard, bj, [0, -0.03, -0.02]);
    for (const sx of [-1, 1]) mk(G.box(0.08, 0.16, 0.1), beard, bj, [sx * 0.17, 0.04, -0.05]); // sideburns
    for (const sx of [-1, 1]) mk(G.box(0.14, 0.045, 0.06), beardD, bj, [sx * 0.075, 0.025, 0.075], [0, 0, sx * -0.3]);
    for (const sx of [-1, 1]) {
      const br = joint(bj, sx * 0.07, -0.32, 0.0);
      for (let i = 0; i < 3; i++) mk(G.sph(0.035 - i * 0.004, 6, 4), i % 2 ? beardD : beard, br, [0, -i * 0.05, 0]);
      mk(G.cyl(0.03, 0.03, 0.035, 6), gold, br, [0, -0.16, 0]);
      c.addSpring(br, 'x', { base: 0, src: 'vz', gain: -0.3, k: 45, d: 4, wobble: 0.04, phase: sx });
    }
    c.addSpring(bj, 'x', { base: 0, src: 'vy', gain: 0.25, k: 60, d: 6, min: -0.4, max: 0.4 });
    c.addSpring(bj, 'z', { base: 0, src: 'vx', gain: 0.15, k: 50, d: 6, min: -0.3, max: 0.3 });
    // oversized greataxe on back
    const back = joint(R.spine, -0.04, -0.02, -0.25);
    back.rotation.set(0.15, 0, -0.85);
    mk(G.cyl(0.03, 0.034, 1.25, 6), wood, back, [0, 0.05, 0]);
    for (const y of [-0.3, 0.1]) mk(G.cyl(0.036, 0.036, 0.04, 6), leather, back, [0, y, 0]);
    const axeShape = new THREE.Shape();
    axeShape.moveTo(0, -0.1); axeShape.quadraticCurveTo(0.12, -0.12, 0.26, -0.22); axeShape.quadraticCurveTo(0.3, 0, 0.26, 0.22);
    axeShape.quadraticCurveTo(0.12, 0.12, 0, 0.1); axeShape.lineTo(0, -0.1);
    const ag = new THREE.ExtrudeGeometry(axeShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 1, curveSegments: 4 });
    ag.translate(0, 0, -0.0175);
    for (const sx of [-1, 1]) mk(ag, steel, back, [0, 0.55, 0], [0, sx > 0 ? 0 : Math.PI, 0]);
    mk(G.box(0.08, 0.2, 0.06), steelD, back, [0, 0.55, 0]);
    mk(G.cone(0.04, 0.12, 5), steelD, back, [0, 0.73, 0]);
    c.backItem = back;
    c.extraUpdate = () => {
      // brows follow expression
      const e = c.expr;
      const ang = e === 'angry' || e === 'determined' ? 0.35 : e === 'sad' || e === 'hurt' ? -0.3 : e === 'surprised' ? 0 : 0.05;
      const lift = e === 'surprised' ? 0.03 : e === 'angry' ? -0.012 : 0;
      c.brows[0].rotation.z = -ang; c.brows[1].rotation.z = ang;
      c.brows[0].position.y = 0.045 + lift; c.brows[1].position.y = 0.045 + lift;
    };
    c.headTop = 0.62;
  },

  clover(c) {
    const M = c.def.model;
    const mt = c.mats;
    const skin = mt.toon(M.skin, { flat: false }), hair = mt.toon('#f6eeee'), hairD = mt.toon('#d8cccc');
    const jacket = mt.toon('#5e3a62'), jacketD = mt.toon('#3e2442'), scarf = mt.toon('#e8405e'), scarfD = mt.toon('#a82a44');
    const shorts = mt.toon('#4a3020'), leg = mt.toon('#2e2236'), boot = mt.toon('#7a4a2e'), fur = mt.toon('#fff8f4'), pink = mt.toon('#ffb0c4');
    const gold = mt.toon('#ffcf3a'), steel = mt.toon('#c8d0dc'), leather = mt.toon('#5a3420');
    c.skeleton({ hipH: 0.5, legUp: 0.24, legLo: 0.23, hipX: 0.075, torsoH: 0.32, shY: 0.28, shX: 0.145, armUp: 0.2, armLo: 0.19, neckH: 0.03 });
    const R = c.rig;
    mk(G.cyl(0.14, 0.15, 0.13, 8), shorts, R.hips, [0, -0.03, 0], [0, 0, 0], [1, 1, 0.82]);
    mk(G.cyl(0.15, 0.12, 0.3, 8), jacket, R.spine, [0, 0.15, 0], [0, Math.PI / 8, 0], [1, 1, 0.8]);
    mk(G.box(0.02, 0.26, 0.02), gold, R.spine, [0.03, 0.14, 0.12], [-0.08, 0, 0]);
    mk(G.cyl(0.155, 0.155, 0.045, 8), leather, R.spine, [0, 0.0, 0], [0, 0, 0], [1, 1, 0.85]);
    for (const sx of [-1, 1]) mk(G.box(0.06, 0.07, 0.05), leather, R.hips, [sx * 0.12, 0.0, 0.08], [0, sx * 0.4, 0]);
    // cropped hood/cape
    mk(G.cap(0.19, 9, 4, 0.55), jacketD, R.neck, [0, -0.04, -0.03], [-0.25, 0, 0], [1, 0.8, 1]);
    // scarf around neck + two long tails (spring chain)
    mk(G.cyl(0.11, 0.13, 0.08, 9), scarf, R.neck, [0, 0.0, 0.0]);
    const tails = [];
    for (const [sx, n, w] of [[0.05, 6, 0.1], [-0.05, 4, 0.08]]) {
      let p = joint(R.neck, sx, -0.02, -0.11);
      const chain = [];
      for (let i = 0; i < n; i++) {
        mk(G.box(w, 0.11, 0.05), i % 2 ? scarfD : scarf, p, [0, -0.055, 0], [0, i % 2 ? 0.35 : -0.35, 0]);
        if (i === n - 1) for (const fx of [-1, 0, 1]) mk(G.box(0.012, 0.03, 0.01), scarfD, p, [fx * w * 0.35, -0.12, 0]);
        chain.push(p);
        const nx = joint(p, 0, -0.105, 0);
        p = nx;
      }
      tails.push(chain);
    }
    tails.forEach((chain, ti) => chain.forEach((j, i) => {
      c.addSpring(j, 'x', { base: i === 0 ? 0.35 : 0.08, src: 'vz', gain: 0.35 + i * 0.12, k: 55 - i * 6, d: 5, wobble: 0.06 + i * 0.03, phase: i * 0.9 + ti });
      c.addSpring(j, 'z', { base: 0, src: 'vx', gain: -0.25, k: 45 - i * 4, d: 4, wobble: 0.03 + i * 0.015, phase: i * 1.3 + ti * 2 });
    }));
    for (const S of ['L', 'R']) {
      limb(R['sh' + S], 0.05, 0.045, 0.2, jacket);
      mk(G.sph(0.06, 7, 5), jacket, R['sh' + S], [0, -0.01, 0]);
      limb(R['el' + S], 0.042, 0.036, 0.19, skin);
      mk(G.cyl(0.05, 0.05, 0.05, 7), leather, R['el' + S], [0, -0.15, 0]);
      mk(G.sph(0.045, 7, 5), skin, R['hand' + S], [0, -0.02, 0.0]);
    }
    for (const S of ['L', 'R']) {
      limb(R['hip' + S], 0.06, 0.05, 0.24, leg);
      limb(R['kn' + S], 0.05, 0.055, 0.23, boot);
      mk(G.cyl(0.07, 0.065, 0.06, 8), fur, R['kn' + S], [0, -0.04, 0]);
      mk(G.box(0.1, 0.075, 0.24), boot, R['ft' + S], [0, 0.0, 0.05]);
      mk(G.box(0.1, 0.03, 0.06), fur, R['ft' + S], [0, -0.02, 0.15]);
    }
    // fluffy tail
    const tail = joint(R.hips, 0, -0.02, -0.15);
    mk(G.ico(0.07, 1), fur, tail, [0, 0, 0]);
    mk(G.ico(0.045, 1), fur, tail, [0.04, 0.03, -0.03]);
    mk(G.ico(0.045, 1), fur, tail, [-0.035, 0.035, -0.02]);
    c.addSpring(tail, 'y', { base: 0, src: 'vx', gain: 0.4, wobble: 0.15, k: 60, d: 5 });
    // head, hair bob
    c.makeHead(0.22, FACE_SPECS.clover);
    const hy = 0.22 * 0.92;
    const hg = joint(R.head, 0, hy, 0);
    hairCap(hg, hair, 0.235, { arc: 0.6 });
    fringe(hg, hair, 0.22, [[-0.88, 0.13, 0.08], [-0.52, 0.1, 0.09], [-0.16, 0.115, 0.09], [0.18, 0.1, 0.09], [0.52, 0.11, 0.085], [0.88, 0.13, 0.08]]);
    for (const sx of [-1, 1]) mk(G.box(0.06, 0.24, 0.07), hairD, hg, [sx * 0.2, -0.07, 0.06], [0.05, 0, sx * 0.1]);
    mk(G.box(0.012, 0.05, 0.03), mt.toon('#ff5a7a'), hg, [0.18, 0.12, 0.14], [0, 0, -0.5]); // hair pin
    // ears (left upright, right floppy)
    c.ears = [];
    for (const sx of [1, -1]) {
      const floppy = sx < 0;
      const base = joint(hg, sx * 0.095, 0.16, -0.04);
      base.rotation.set(-0.15, 0, -sx * (floppy ? 0.45 : 0.12));
      mk(G.box(0.1, 0.24, 0.045), hair, base, [0, 0.12, 0], [0, 0, 0], [1, 1, 1]);
      mk(G.box(0.056, 0.2, 0.012), pink, base, [0, 0.12, 0.024]);
      const tip = joint(base, 0, 0.235, 0);
      mk(G.box(0.095, 0.2, 0.042), hair, tip, [0, 0.1, 0]);
      mk(G.box(0.05, 0.16, 0.012), pink, tip, [0, 0.09, 0.023]);
      mk(G.box(0.07, 0.04, 0.036), hair, tip, [0, 0.21, 0]);
      if (floppy) tip.rotation.set(-0.35, 0, 2.1);
      c.addSpring(base, 'x', { base: -0.15, src: 'vy', gain: 0.35, k: 70, d: 6, wobble: 0.02, phase: sx, extra: (ch) => -ch.pose.ears * 0.25 });
      if (floppy) c.addSpring(tip, 'z', { base: 2.1, src: 'vy', gain: -0.7, k: 30, d: 3.5, wobble: 0.08, phase: 2 });
      else c.addSpring(tip, 'x', { base: 0.05, src: 'vy', gain: 0.4, k: 55, d: 4, wobble: 0.03, phase: sx * 2, extra: (ch) => -ch.pose.ears * 0.3 });
      c.addSpring(base, 'z', { base: base.rotation.z, src: 'vx', gain: -0.2, k: 60, d: 6 });
      c.ears.push({ base, tip });
    }
    // twin daggers at hips
    const back = joint(R.hips, 0, 0, 0);
    for (const sx of [-1, 1]) {
      const d = joint(back, sx * 0.16, -0.02, -0.04);
      d.rotation.set(0.5, 0, sx * 0.35);
      mk(G.box(0.045, 0.2, 0.03), leather, d, [0, -0.08, 0]);
      mk(G.box(0.08, 0.02, 0.03), gold, d, [0, 0.03, 0]);
      mk(G.cyl(0.014, 0.014, 0.08, 5), mt.toon('#3a2418'), d, [0, 0.08, 0]);
      mk(G.sph(0.018, 5, 4), steel, d, [0, 0.125, 0]);
    }
    c.backItem = back;
    c.headTop = 0.9;
  },
};

/** Build a playable explorer. */
export function buildCharacter(id) { return new Character(id); }
