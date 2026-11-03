// Cutscene set pieces for the real-time 3D cinematics in scenes/cutscene.js (and the camp menu):
// volumetric light beams, glow sprites, the gaze shockwave, the stone-creep shader that turns actors
// to statues, a bowl of stew, the old map, the floor crack Medusa crawls out of, a stand-in serpent,
// and the camp's normalised anchors.
import * as THREE from 'three';
import { voxelModel, GLOW } from '../gfx/voxel.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { hash3, clamp } from '../core/math.js';
import { CHARACTER_ORDER } from '../data/characters.js';

/** Effects live on the FX layer: no outlines, no normals pass, drawn after the solids. */
export function fxify(o, order = 6) {
  o.traverse((m) => { m.layers.set(LAYER_FX); m.renderOrder = order; m.frustumCulled = false; });
  return o;
}

// ------------------------------------------------------------------ glow sprites
const glowTexCache = new Map();
function glowTex(soft = 1) {
  let t = glowTexCache.get(soft);
  if (t) return t;
  const n = 64, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(clamp(0.18 * soft, 0.05, 0.45), 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  t = new THREE.CanvasTexture(c);
  t.userData.keep = true;
  glowTexCache.set(soft, t);
  return t;
}
/** A soft additive light blob (lamps, eyes, the heart of a burst). */
export function glowSprite(col, size = 1, k = 1.6, soft = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTex(soft), color: new THREE.Color(col).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.userData.base = k;
  return fxify(s, 7);
}

// ------------------------------------------------------------------ volumetric beams
const BEAM_VS = `varying vec3 vN; varying vec3 vV; varying float vY; uniform float uLen;
void main() { vY = clamp(-position.y / uLen, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = `uniform vec3 uCol; uniform float uOp; uniform float uTime; uniform float uFall; varying vec3 vN; varying vec3 vV; varying float vY;
void main() { float f = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(f, 1.8);
  float along = pow(1.0 - vY, uFall) * smoothstep(0.0, 0.06, vY);
  float n = 0.78 + 0.22 * sin(vY * 17.0 - uTime * 1.4 + f * 5.0) * sin(vY * 5.0 + uTime * 0.6);
  gl_FragColor = vec4(uCol * edge * along * n * uOp, 1.0); }`;
/** An open cone of light, from its tip (origin) down -y for len metres. Aim it with aimBeam. */
export function beam(len, r0, r1, col, op = 0.5, fall = 1.3) {
  const geo = new THREE.CylinderGeometry(r0, r1, len, 28, 1, true);
  geo.translate(0, -len / 2, 0);
  const u = { uCol: { value: new THREE.Color(col) }, uOp: { value: op }, uTime: { value: 0 }, uLen: { value: len }, uFall: { value: fall } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(geo, mat);
  m.userData.u = u;
  return fxify(m, 6);
}
const _down = new THREE.Vector3(0, -1, 0);
export function aimBeam(m, from, to) {
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(_down, to.clone().sub(from).normalize());
  return m;
}

// ------------------------------------------------------------------ the curse shockwave
const RING_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RING_FS = `uniform vec3 uCol; uniform float uOp; uniform float uTime; uniform float uW; varying vec2 vUv;
void main() { vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
  float flame = 0.6 + 0.4 * sin(a * 23.0 + uTime * 7.0) * sin(a * 9.0 - uTime * 3.0);
  float band = 1.0 - smoothstep(0.0, uW * flame, abs(r - (1.0 - uW)));
  float fill = (1.0 - smoothstep(0.0, 1.0 - uW, r)) * 0.12;
  float hot = 1.0 - smoothstep(0.0, uW * 0.35, abs(r - (1.0 - uW)));
  gl_FragColor = vec4((uCol * (band + fill) + vec3(1.0) * hot * 0.6) * uOp * step(r, 1.0), 1.0); }`;
/** A ring of curse-fire lying on the floor. Scale it (x/z) to grow it. */
export function waveRing(col = '#c86bff', w = 0.12) {
  const u = { uCol: { value: new THREE.Color(col).multiplyScalar(2.2) }, uOp: { value: 1 }, uTime: { value: 0 }, uW: { value: w } };
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  m.userData.u = u;
  return fxify(m, 6);
}
const WALL_VS = `varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
void main() { vY = position.y; vA = atan(position.z, position.x); vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const WALL_FS = `uniform vec3 uCol; uniform float uOp; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
void main() { float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float tongue = 0.55 + 0.45 * sin(vA * 17.0 + uTime * 6.0 + vY * 3.0) * sin(vA * 6.0 - uTime * 2.3);
  float h = pow(clamp(1.0 - vY, 0.0, 1.0), 2.2) * smoothstep(0.0, 0.05, vY) * tongue;
  gl_FragColor = vec4(uCol * (0.35 + f * 0.9) * h * uOp, 1.0); }`;
/** The rolling wall of the wave: an open cylinder (radius 1, height 1, base on y=0). */
export function waveWall(col = '#c86bff') {
  const u = { uCol: { value: new THREE.Color(col).multiplyScalar(1.6) }, uOp: { value: 1 }, uTime: { value: 0 } };
  const geo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  m.userData.u = u;
  return fxify(m, 6);
}
const SPH_FS = `uniform vec3 uCol; uniform float uOp; varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
void main() { float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uCol * pow(f, 2.5) * uOp, 1.0); }`;
/** A bright-rimmed bubble for bursts. Scale it up and fade uOp. */
export function shockSphere(col = '#e0a0ff') {
  const u = { uCol: { value: new THREE.Color(col).multiplyScalar(2) }, uOp: { value: 1 } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ uniforms: u, vertexShader: WALL_VS, fragmentShader: SPH_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.userData.u = u;
  return fxify(m, 7);
}

// ------------------------------------------------------------------ stone creep
/**
 * Turn an actor (character, monster, weapon) into a statue from the feet up. Returns uniforms:
 * uStone (world y of the stone line; everything below is stone), uStoneK (0..1 overall),
 * uSeam (glow at the front line) and uSeamCol. Idempotent per material.
 */
export function stoneify(root, seamCol = '#c86bff') {
  const u = { uStone: { value: -1 }, uStoneK: { value: 1 }, uSeam: { value: 1 }, uSeamCol: { value: new THREE.Color(seamCol) } };
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.isShaderMaterial || m.isSpriteMaterial || m.userData.cineStone) continue;
      m.userData.cineStone = u;
      const lit = !!(m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = 'varying vec3 vCineW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCineW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        let fs = 'varying vec3 vCineW;\nuniform float uStone;\nuniform float uStoneK;\nuniform float uSeam;\nuniform vec3 uSeamCol;\n' + sh.fragmentShader;
        fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
  float cH = fract(sin(dot(floor(vCineW * 26.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float cLine = uStone + (cH - 0.5) * 0.08;
  float cS = step(vCineW.y, cLine) * uStoneK;
  float cL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 cStone = vec3(0.43, 0.41, 0.47) * (0.5 + min(cL, 1.0) * 0.8) * (0.82 + cH * 0.32);
  diffuseColor.rgb = mix(diffuseColor.rgb, cStone, cS);
  float cSeam = (1.0 - smoothstep(0.0, 0.045, abs(vCineW.y - cLine))) * uStoneK * uSeam;
  ${lit ? '' : 'diffuseColor.rgb += uSeamCol * cSeam * 2.5;'}`);
        if (lit) fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance = totalEmissiveRadiance * (1.0 - cS) + uSeamCol * cSeam * 2.2;');
        sh.fragmentShader = fs;
      };
      m.customProgramCacheKey = () => 'cineStone' + (lit ? 'L' : 'B');
      m.needsUpdate = true;
    }
  });
  return u;
}

// ------------------------------------------------------------------ the camp: anchors + anim helper
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v3 = (a) => (!a ? null : a.isVector3 ? a.clone() : Array.isArray(a) ? V(a[0], a[1], a[2]) : V(a.x || 0, a.y || 0, a.z || 0));
const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const SEAT_OF = { elio: 0, clover: 1, durgan: 2, bran: 3 }; // the old campfire stage's seat order

/** Normalised camp anchors: works with the 'campmenu' stage and the older 'campfire' one. */
export function campAnchors(st) {
  const A = st.anchors || {};
  const fire = v3(A.fire) || V();
  const seats = {};
  for (const id of CHARACTER_ORDER) {
    let s = A.seats && !Array.isArray(A.seats) ? A.seats[id] : null;
    if (!s && Array.isArray(A.seats)) s = A.seats[SEAT_OF[id]];
    const ang = (SEAT_OF[id] / 4) * Math.PI * 2 + 0.6;
    const pos = s ? v3(s.pos || s) : V(Math.cos(ang) * 1.6, 0.3, Math.sin(ang) * 1.6);
    let facing = s ? (s.facing ?? s.rotY) : undefined;
    if (facing && typeof facing === 'object') { const f = v3(facing); facing = f.length() <= 1.01 ? Math.atan2(f.x, f.z) : faceTo(pos, f); }
    if (typeof facing !== 'number') facing = faceTo(pos, fire);
    seats[id] = { pos: V(pos.x, 0, pos.z), facing, height: s ? (s.height ?? s.h ?? pos.y ?? 0.3) : 0.3 };
  }
  const near = (id, dx, dz) => { const s = seats[id].pos; return V(s.x + dx, 0, s.z + dz); };
  const ex = A.exitTunnel && A.exitTunnel.pos ? A.exitTunnel : null; // campmenu: { pos, mouth, deep, path }
  const exit = (ex ? v3(ex.pos) : v3(A.exitTunnel)) || v3(A.mineEntrance) || V(-2.6, 0, -3.4);
  return {
    fire, seats,
    pot: v3(A.pot) || fire.clone().setY(0.45),
    chest: v3(A.chest) || V(-2.4, 0, -1.6),
    petBed: v3(A.petBed) || fire.clone().add(V(0.9, 0, 1.35)),
    medusaRise: v3(A.medusaRise) || (A.crack && A.crack.center ? v3(A.crack.center) : null) || fire.clone().add(V(0, 0, -2.0)),
    exitTunnel: V(exit.x, 0, exit.z),
    exitDeep: ex && ex.deep ? V(ex.deep.x, 0, ex.deep.z) : v3(A.mineDeep) ? V(A.mineDeep.x, 0, A.mineDeep.z) : V(exit.x, 0, exit.z - 2.4),
    exitPath: ex && ex.path ? ex.path : null,
    sacks: (A.sacks && (Array.isArray(A.sacks) ? A.sacks : [A.sacks]).map(v3)) || [V(-1.7, 0, -2.4)],
    crate: v3(A.crate) || V(3.6, 0, -1.6),
    lantern: v3(A.lantern) || null,
    mapCrate: v3(A.mapCrate) || null,
    books: v3(A.books) || near('elio', 0.5, -0.4),
    crack: A.crack || null,
    cams: A.cams || st.cams || null,
    camera: st.camera || null,
  };
}

/** Play the first anim from a list that the model knows (unknown names are no-ops on the rigs). */
export function playFirst(c, names, opts = {}) {
  if (!c) return null;
  for (const n of [].concat(names)) { c.play(n, opts); if (c.anim === n || c.state === n) return n; }
  return null;
}

// ------------------------------------------------------------------ small props
/** A wooden bowl of Durgan's stew (about 16 cm across), with a steaming surface. */
export function buildBowl() {
  const g = voxelModel(9, 5, 9, (v) => {
    for (let y = 0; y < 5; y++) for (let z = 0; z < 9; z++) for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x - 4, z - 4), r = 2.4 + y * 0.45;
      if (d > r) continue;
      const rim = d > r - 1.1;
      if (y === 0 && d < 3) v.set(x, y, z, '#6a3e22');
      else if (rim) v.set(x, y, z, y === 4 ? '#c8935a' : hash3(x, y, z, 2) > 0.7 ? '#8a5430' : '#a8683a');
      else if (y === 3) v.set(x, y, z, hash3(x, z, 4, 1) > 0.82 ? '#e8c04a' : hash3(x, z, 3, 7) > 0.75 ? '#7aa04a' : '#c86a32');
    }
  }, { size: 0.018, origin: [4.5, 0, 4.5] });
  g.name = 'bowl';
  return g;
}

/** The crew's old map: a creased parchment with inked paths, room marks and a red X. */
export function buildOldMap() {
  const W = 26, H = 18;
  const g = voxelModel(W, H, 1, (v) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (edge && hash3(x, y, 1, 3) > 0.7) continue; // torn edges
      const crease = x === 13 || y === 9;
      const stain = hash3(x >> 2, y >> 2, 5, 9) > 0.8;
      v.set(x, y, 0, crease ? '#cdb48a' : stain ? '#d8c08e' : edge ? '#d8c39a' : '#eadbb4');
    }
    // inked paths between room marks, bottom to top
    const nodes = [[13, 2], [6, 6], [18, 6], [9, 10], [17, 11], [13, 15]];
    const links = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [1, 4]];
    for (const [a, b] of links) {
      const [x0, y0] = nodes[a], [x1, y1] = nodes[b], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i += 2) v.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 0, '#5a3a24');
    }
    for (const [x, y] of nodes) { v.set(x, y, 0, '#3a2214'); v.set(x + 1, y, 0, '#3a2214'); }
    for (const [dx, dy] of [[-1, -1], [0, 0], [1, 1], [1, -1], [-1, 1]]) v.set(13 + dx, 15 + dy, 0, '#c0302a', 0);
  }, { size: 0.016, origin: [W / 2, H / 2, 0.5] });
  g.name = 'oldmap';
  return g;
}

/**
 * The floor splitting open: a jagged glowing crack from a to b (world points on the floor).
 * Returns { group, open(k) } — k 0..1 grows the crack outward from its middle and widens it.
 */
export function buildCrack(a, b, col = '#7affc0', seed = 3) {
  const group = new THREE.Group();
  const A = a.clone(), B = b.clone();
  const len = A.distanceTo(B), n = Math.max(6, Math.round(len / 0.12));
  const dir = B.clone().sub(A).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, j = i === 0 || i === n ? 0 : (hash3(i, seed, 1, 5) - 0.5) * 0.32;
    pts.push(A.clone().lerp(B, t).addScaledVector(side, j).setY(0.012));
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2), fog: false });
  const darkMat = new THREE.MeshBasicMaterial({ color: '#050208' });
  const segs = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1], L = p.distanceTo(q);
    const seg = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, L + 0.02), glowMat);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, L + 0.03), darkMat);
    lip.position.y = -0.004;
    seg.add(lip, core);
    seg.position.copy(p).lerp(q, 0.5);
    seg.lookAt(q.x, seg.position.y, q.z);
    seg.userData.t = Math.abs(i / (n - 1) - 0.5) * 2; // 0 at the middle, 1 at the ends
    seg.scale.set(0.001, 1, 1);
    group.add(seg);
    segs.push(seg);
  }
  fxify(group, 5);
  const open = (k) => {
    for (const s of segs) {
      const kk = clamp((k * 1.25 - s.userData.t * 0.6) / 0.4);
      s.visible = kk > 0.01;
      s.scale.set(Math.max(0.001, kk * (1 + k * 3.5)), 1, kk);
    }
  };
  open(0);
  return { group, open, pts };
}

/**
 * A stand-in serpent (used only until the real snakes and heralds exist): a voxel-ish coiled body
 * with a horned head and glowing eyes. Monster-like API: group, play, update, flash, height, bounds.
 */
export function standInSerpent(col = '#4a8a5a', belly = '#c8d890', eye = '#ffe04a', len = 3.2, r = 0.16) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const N = 18, segs = [];
  const skin = new THREE.MeshLambertMaterial({ color: col }), under = new THREE.MeshLambertMaterial({ color: belly });
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), rr = r * (1 - t * 0.7);
    const m = new THREE.Mesh(new THREE.BoxGeometry(rr * 2, rr * 2, (len / N) * 1.3), i % 3 === 0 ? under : skin);
    body.add(m); segs.push(m);
  }
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, r * 1.6, r * 3.2), skin);
  head.add(skull);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.4, r * 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(eye).multiplyScalar(2) }));
    e.position.set(s * r * 0.9, r * 0.35, r * 1.2); head.add(e);
    const horn = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 1.4, r * 0.3), under);
    horn.position.set(s * r * 0.8, r * 1.1, -r * 0.6); horn.rotation.x = -0.6; head.add(horn);
  }
  body.add(head);
  const o = {
    group, height: 1.4, fly: 0, state: 'idle', t: 0, hitPoint: new THREE.Vector3(0, 1.1, 0.4), cutPoints: [],
    bounds: new THREE.Box3(new THREE.Vector3(-0.6, 0, -1.6), new THREE.Vector3(0.6, 1.6, 0.8)),
    play(s) { this.state = s; this.st = 0; }, flash() {}, setPhase() {}, dispose() {},
    update(dt) {
      this.t += dt; this.st = (this.st || 0) + dt;
      const lunge = this.state === 'attack' ? Math.sin(Math.min(1, this.st / 0.5) * Math.PI) : 0;
      const rear = this.state === 'roar' || this.state === 'intro' ? 0.4 : 0.15;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const z = -t * len * 0.75 + lunge * 0.8 * (1 - t);
        const x = Math.sin(this.t * 3 + t * 7) * 0.25 * t;
        const y = r + (1 - t) ** 3 * (1.0 + rear) ;
        segs[i].position.set(x, y, z);
      }
      head.position.copy(segs[0].position).add(new THREE.Vector3(0, r * 0.6, r * 1.2 + lunge * 0.5));
      head.rotation.x = -0.2 - lunge * 0.3 + (this.state === 'roar' ? -0.5 : 0);
    },
  };
  o.update(0);
  return o;
}
