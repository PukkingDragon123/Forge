// Cutscene set pieces, built for the real-time 3D cinematics in scenes/cutscene.js:
// the old lift shaft through the glowing layers, the tomb's sealed wall and door, volumetric light
// beams, glow sprites, the curse shockwave, and the stone-creep shader that turns actors to statues.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, GLOW } from '../gfx/voxel.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { buildProp } from '../models/props.js';
import { fbm3, hash3, clamp, mixHex, shadeHex } from '../core/math.js';

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

// ------------------------------------------------------------------ the lift shaft
/**
 * A round shaft dropping through the layers, top at y=0. bands: [{pal, glow, lamp, h}] top → bottom;
 * each boundary is a seam of glowing ore. Returns {group, depth, seams:[{y,col}], lamps:[{pos,col}]}.
 */
export function buildShaft(bands, o = {}) {
  const VS = o.voxel || 0.13, R = o.radius || 3.3, T = 3;
  const RC = Math.round(R / VS);
  const H = bands.reduce((a, b) => a + b.h, 0);
  const NY = Math.round(H / VS) + 2;
  const N = (RC + T + 4) * 2;
  const g = new VoxelGrid(N, NY, N);
  const seed = o.seed || 3;
  const edges = []; let acc = 0;
  for (const b of bands) { edges.push(acc); acc += b.h; }
  const bandAt = (depth) => { let i = 0; while (i + 1 < bands.length && depth >= edges[i + 1]) i++; return i; };
  const cx = N / 2, cz = N / 2;
  for (let y = 0; y < NY; y++) {
    const depth = (NY - 1 - y) * VS; // 0 at the top
    const bi = bandAt(depth), B = bands[bi], pal = B.pal;
    const toNext = bi + 1 < bands.length ? edges[bi + 1] - depth : 99;
    const seam = (toNext >= 0 && toNext < VS * 2.2) || (bi > 0 && depth - edges[bi] < VS * 1.2);
    const seamCol = toNext < VS * 2.2 ? bands[bi + 1].glow : B.glow;
    const timber = depth % 4.6 < VS * 2.2 && depth > 0.6;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz, d = Math.hypot(dx, dz);
      if (d < RC - 4 || d > RC + T + 3) continue;
      const wall = RC + (fbm3(x * 0.13, y * 0.09, z * 0.13, 3, seed) - 0.5) * 5.5;
      if (d < wall || d > wall + T) {
        // cribbing: rings of old timber hugging the rock every few metres
        if (timber && d >= wall - 1.2 && d < wall && hash3(Math.floor(Math.atan2(dz, dx) * 6), y, 1, seed) > 0.25) g.set(x, y, z, mixHex(o.wood || '#7a5030', '#2a1a10', hash3(x, y, z, 2) * 0.4));
        continue;
      }
      if (seam && hash3(x >> 1, y, z >> 1, seed + 9) > 0.18) { g.set(x, y, z, mixHex(seamCol, '#ffffff', hash3(x, y, z, 4) * 0.35), GLOW); continue; }
      // strata: wavy horizontal beds, ore specks, moss
      const bed = Math.floor((depth + fbm3(x * 0.05, 0, z * 0.05, 2, seed + 3) * 1.4) / 0.62);
      const rock = pal.rock;
      let v = hash3(bed, 0, 0, seed + 5) * 0.55 + fbm3(x * 0.3, y * 0.3, z * 0.3, 2, seed + 7) * 0.45;
      if (d > wall + 0.7) v *= 0.7;
      let col = rock[clamp(Math.floor(v * rock.length), 0, rock.length - 1)];
      if (hash3(x, y, z, seed + 11) > 0.988) { g.set(x, y, z, B.glow, GLOW); continue; }
      if (pal.moss && fbm3(x * 0.2, y * 0.5, z * 0.2, 2, seed + 13) > 0.68) col = mixHex(col, pal.moss, 0.5);
      g.set(x, y, z, col);
    }
  }
  const mesh = meshVoxels(g, { size: VS, origin: [N / 2, NY - 1, N / 2], castShadow: false, receiveShadow: false, glowIntensity: 2.6, jitter: 0.08 });
  const group = new THREE.Group();
  group.add(mesh);
  // lanterns on the cribbing and crystal clusters on the seams
  const lamps = [], seams = [];
  for (let k = 1; k < bands.length; k++) seams.push({ y: -edges[k], col: bands[k].glow });
  for (let dpt = 2.2, i = 0; dpt < H - 1; dpt += 4.6, i++) {
    const a = i * 2.39 + 0.6, r = R - 0.55;
    const pos = new THREE.Vector3(Math.cos(a) * r, -dpt, Math.sin(a) * r);
    const band = bands[bandAt(dpt)];
    const col = band.lamp || '#ffc070';
    try {
      const lan = buildProp('lantern', { glow: col, light: false });
      lan.position.copy(pos); lan.rotation.y = -a - Math.PI / 2;
      group.add(lan);
    } catch (e) { /* optional dressing */ }
    const gl = glowSprite(col, 1.2, 1.2);
    gl.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
    group.add(gl);
    lamps.push({ pos: pos.clone().add(new THREE.Vector3(0, 0.3, 0)), col });
  }
  for (const s of seams) for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + s.y, r = R - 0.3;
    try {
      const cc = buildProp('crystalcluster', { color: s.col, color2: shadeHex(s.col, 1.3), size: 0.7 + (i % 3) * 0.25, light: 0 });
      cc.position.set(Math.cos(a) * r, s.y - 0.15, Math.sin(a) * r);
      cc.rotation.set(0, -a, (Math.PI / 2) * 0.8 * (i % 2 ? 1 : -1));
      group.add(cc);
    } catch (e) { /* optional dressing */ }
  }
  // the deep end glows
  const deep = glowSprite(o.deep || bands[bands.length - 1].glow, R * 3.4, 1.1, 1.6);
  deep.position.set(0, -H - 1.4, 0);
  group.add(deep);
  return { group, depth: H, seams, lamps, radius: R };
}

// ------------------------------------------------------------------ the tomb's sealed wall
const TOMB = { stone: ['#1e1a32', '#2c2648', '#3e3660', '#564c80', '#6e64a0'], mortar: '#0e0a18', rune: '#c86bff', iron: '#3a3650' };
const SKULL = [
  '..#.#.#.#..',
  '.#########.',
  '###########',
  '##..###..##',
  '##..###..##',
  '###########',
  '.####.####.',
  '..#######..',
  '..#.#.#.#..',
];
/**
 * A carved wall closing the throne room, with a rune-sealed double door. Front face at z=0, centred
 * on x, base on y=0. Returns {group, wall, leaves:[left,right], bar, door:{w,h}, colors}.
 */
export function buildSealWall(o = {}) {
  const VS = 0.1, W = o.w || 11.6, Hm = o.h || 7.8;
  const NX = Math.round(W / VS), NY = Math.round(Hm / VS), NZ = 6;
  const DW = 24, DH = 38; // the door opening, in cells
  const x0 = NX / 2 - DW / 2, x1 = NX / 2 + DW / 2;
  const S = TOMB.stone;
  const g = new VoxelGrid(NX, NY, NZ + 3);
  const put = (x, y, k, col, flag = 0) => g.set(x, y, NZ + 2 - k, col, flag); // k = 0 is the front face
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    if (x >= x0 && x < x1 && y < DH) continue;
    const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
    const mortar = y % 4 === 0 || (x + off) % 9 === 0;
    const tone = hash3(Math.floor((x + off) / 9), row, 3, 7);
    // a carved frame around the door, an arch above it, a frieze band near the top
    const fx = Math.min(Math.abs(x - (x0 - 1)), Math.abs(x - x1));
    const frame = x >= x0 - 5 && x < x1 + 5 && y < DH + 5;
    const archR = Math.hypot(x + 0.5 - NX / 2, y - DH), arch = y >= DH && archR < DW / 2 + 5 && archR > DW / 2 - 1;
    const frieze = y > NY - 12 && y < NY - 7;
    for (let k = 2; k < NZ + 2; k++) {
      let col = mortar ? TOMB.mortar : S[1 + Math.floor(tone * 2.99)];
      if (k > 2) col = shadeHex(col, 0.8);
      if (frame || arch) col = S[2 + ((x + y) % 7 === 0 ? 1 : 0)];
      if (frieze) col = x % 6 < 3 ? S[3] : S[2];
      put(x, y, k, col);
    }
    if (frame || arch) { put(x, y, 1, S[3]); if (fx < 1 || (arch && archR > DW / 2 + 3.5)) put(x, y, 0, S[4]); }
    if (frieze && x % 6 === 1) put(x, y, 1, TOMB.rune, GLOW);
    if (frame && fx === 3 && y % 5 !== 0) put(x, y, 0, TOMB.rune, GLOW); // rune channels up the frame
  }
  // the crowned skull over the door, eyes lit
  const sx = Math.floor(NX / 2 - 5.5), sy = DH + 6;
  SKULL.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') { put(sx + i, sy + (SKULL.length - 1 - j), 0, S[4]); put(sx + i, sy + (SKULL.length - 1 - j), 1, S[3]); } }));
  for (const [ex, ey] of [[2, 4], [7, 4]]) { put(sx + ex, sy + ey, 0, TOMB.rune, GLOW); put(sx + ex + 1, sy + ey, 0, TOMB.rune, GLOW); }
  const wall = meshVoxels(g, { size: VS, origin: [NX / 2, 0, NZ + 2], glowIntensity: 2.4 });
  const group = new THREE.Group();
  group.add(wall);
  // the two leaves, hinged on their outer edges, each carrying half the seal
  const leaves = [];
  for (const side of [-1, 1]) {
    const L = new VoxelGrid(DW / 2, DH, 4);
    const putL = (x, y, k, col, flag = 0) => L.set(x, y, 3 - k, col, flag);
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW / 2; x++) {
      const gx = side < 0 ? x : DW / 2 - 1 - x; // 0 at the hinge
      const panel = gx > 1 && gx < DW / 2 - 2 && ((y > 3 && y < 16) || (y > 22 && y < DH - 3));
      for (let k = 0; k < 4; k++) {
        if (k === 0 && panel) continue;
        let col = S[2 - (hash3(x, y, k, 5) > 0.7 ? 1 : 0)];
        if (k === 0 && (gx === 0 || gx === DW / 2 - 1)) col = TOMB.iron;
        putL(x, y, k, col);
      }
      if ((y === 6 || y === 32) && gx > 0 && gx < DW / 2 - 1) putL(x, y, 0, TOMB.iron);
      // the sigil: a ring of runes centred on the seam, half on each leaf
      const ddx = DW / 2 - gx - 0.5, ddy = y - 19, dr = Math.hypot(ddx, ddy);
      if (Math.abs(dr - 8) < 0.7 || (dr < 5.5 && (Math.abs(ddy) < 0.6 || Math.abs(ddx - 2.5) < 0.6))) putL(x, y, 0, TOMB.rune, GLOW);
    }
    const leaf = meshVoxels(L, { size: VS, origin: side < 0 ? [0, 0, 3] : [DW / 2, 0, 3], glowIntensity: 2.4 });
    const pivot = new THREE.Group();
    pivot.position.set(side * (DW / 2) * VS, 0, -0.2);
    pivot.add(leaf);
    pivot.userData.side = side;
    group.add(pivot);
    leaves.push(pivot);
  }
  // a stone seal bar across both leaves
  const bar = new VoxelGrid(DW + 6, 3, 2);
  bar.box(0, 0, 0, DW + 6, 3, 2, S[3]);
  for (let x = 2; x < DW + 4; x += 3) bar.set(x, 1, 1, TOMB.rune, GLOW);
  const barMesh = meshVoxels(bar, { size: VS, origin: [(DW + 6) / 2, 0, 1], glowIntensity: 2.6 });
  barMesh.position.set(0, 1.85, 0.08);
  group.add(barMesh);
  return { group, wall, leaves, bar: barMesh, door: { w: DW * VS, h: DH * VS }, colors: [...S, TOMB.mortar] };
}
