// Super-detailed voxel stages (0.05 m voxels) — the mine as a lived-in diorama: every wall carries
// boulders, strata, ore specks and moss; floors have flagstones, pebbles and puddles; and the rooms
// are crowded with hand-placed things (signs, posters, pipes, lanterns, bunting, crates, crystals…).
// Light is baked into the voxels in a warm-pastel / lavender-shadow palette, with real-time lights
// only for the actors, sprite flames, light shafts and plenty of 2D pixel particles.
// Same interface as stage2d.js (drop-in for buildSet), plus 'crossroads'.
//   const st = buildStage('arena', region); st.attach(scene); each frame st.update(dt, t)
import * as THREE from 'three';
import { REGIONS } from '../data/regions.js';
import { buildProp, tickProps } from './props.js';
import { ParticleSystem } from '../gfx/particles.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { noise2, clamp, smoothstep, hexToRgb } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import { S, VWorld, vx, C, glowC, mixC, ramp, bayer, box, ell, cyl, cylX, seg, sag, makeLightRig, meshWorld, worldMeshes, h3, NOAO } from './stage_vox_kit.js';
import * as PR from './stage_vox_props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pal = (a) => a.map(C);

// ---------------------------------------------------------------------------- colour stories
const REG = [
  { // 0 Hollowdeep: warm iron workings — salmon/peach rock, mustard timber, lavender shadows
    rock: pal(['#3a2a3a', '#5a3c48', '#7e5258', '#a86e66', '#d49a80']), strata: pal(['#c8784e', '#8a6a9a', '#d8a86a']),
    stone: pal(['#4e3c46', '#6e5458', '#94706a', '#bc9480']), dirt: pal(['#3e2c32', '#5a4040', '#7a5850']),
    moss: pal(['#4a6a4e', '#6a9058', '#9ab86a']), ore: ['#e08a4a', '#c8c8d8', '#ffd27a'], oreGlow: false,
    lamp: '#ffb36a', lamp2: '#ffd27a', amb: '#5a4a86', sky: '#8a90d0', key: '#ffd8b0', keyI: 0.26,
    fog: '#22182c', bg: '#140e1a', cloth: ['salmon', 'mustard', 'teal'], ambient: ['dust', 'motes'], drip: '#9ad0e0',
  },
  { // 1 Prism Hollows: lavender rock, cyan & pink crystal light
    rock: pal(['#241f42', '#383062', '#534888', '#7a6ab2', '#ae9ede']), strata: pal(['#6a8ad8', '#c08ae0', '#8ad0e8']),
    stone: pal(['#2e2a50', '#443e70', '#5e5690', '#8278b4']), dirt: pal(['#2a2646', '#3e3862', '#564e80']),
    moss: pal(['#3a6a8a', '#5a9ac0', '#9ad8f0']), ore: ['#6ae8ff', '#ff8ae0', '#c0a8ff'], oreGlow: true,
    lamp: '#9ae8ff', lamp2: '#ff9ae0', amb: '#46467e', sky: '#a0a8ff', key: '#e8e0ff', keyI: 0.24,
    fog: '#160f30', bg: '#0c0a20', cloth: ['lavender', 'teal', 'salmon'], ambient: ['dust', 'glints'], drip: '#9ae8ff',
  },
  { // 2 Sporewood: teal-green caves, salmon & mustard mushrooms, glowing gills, fireflies
    rock: pal(['#162628', '#203c3a', '#2c564c', '#46765c', '#78a06e']), strata: pal(['#3a8a6a', '#8a9a4a', '#5aa0a0']),
    stone: pal(['#1e3030', '#2c4440', '#3e5c4e', '#5a7a5e']), dirt: pal(['#1c2a24', '#2a3e32', '#3c5440']),
    moss: pal(['#2e6a4a', '#4a9a5a', '#8ac86a']), ore: ['#5af0c8', '#d8ff8a', '#ffc85a'], oreGlow: true,
    lamp: '#9affc8', lamp2: '#ffc070', amb: '#2e4e66', sky: '#7ac8b8', key: '#e0ffd8', keyI: 0.22,
    fog: '#0e1e1c', bg: '#08120f', cloth: ['teal', 'mustard', 'salmon'], ambient: ['dust', 'spores', 'fireflies'], drip: '#8ae8c8',
  },
  { // 3 Sunken Halls: sandstone ruins, turquoise water, gold
    rock: pal(['#40302a', '#644a36', '#8c6a42', '#b48e56', '#dcb878']), strata: pal(['#d8a058', '#a07858', '#e8c890']),
    stone: pal(['#5a4434', '#7e6044', '#a48256', '#ccaa72']), dirt: pal(['#4a382c', '#66503a', '#86684a']),
    moss: pal(['#4a6a4a', '#6a8a58', '#9aaa6a']), ore: ['#ffd25e', '#3ac8c0', '#e8e0c8'], oreGlow: false,
    lamp: '#ffd27a', lamp2: '#5ae8d8', amb: '#4e4478', sky: '#a8a0dc', key: '#fff0c8', keyI: 0.3,
    fog: '#1c1418', bg: '#120c10', cloth: ['teal', 'plum', 'mustard'], ambient: ['dust', 'gold'], drip: '#5ae8d8',
  },
  { // 4 Emberdeep: plum basalt split by lava, embers and ash
    rock: pal(['#1c0e16', '#301822', '#48242e', '#683236', '#904640']), strata: pal(['#a83a2a', '#5a2a4a', '#c86a3a']),
    stone: pal(['#2a141c', '#401e24', '#5a2a2e', '#7a3a38']), dirt: pal(['#241016', '#381a1e', '#4e2626']),
    moss: pal(['#5a2a2a', '#8a3a2a', '#c8582a']), ore: ['#ff8a2a', '#ffd25e', '#ff5a1a'], oreGlow: true,
    lamp: '#ff8a3a', lamp2: '#ffc85a', amb: '#5e2c50', sky: '#8a5a90', key: '#ffc8a0', keyI: 0.24,
    fog: '#220c12', bg: '#14080a', cloth: ['plum', 'salmon', 'mustard'], ambient: ['embers', 'ash'], drip: null, lava: true,
  },
  { // 5 Forbidden Tomb: indigo stone, bone, cursed violet fire, green wisps
    rock: pal(['#16122a', '#241e40', '#352c5e', '#4c4282', '#7064aa']), strata: pal(['#5a3a8a', '#3a5a7a', '#8a6aa8']),
    stone: pal(['#1e1a32', '#2c2648', '#3e3660', '#564c80']), dirt: pal(['#1a1628', '#28223c', '#383050']),
    moss: pal(['#2a4a4a', '#3a6a5a', '#5aaa7a']), ore: ['#c86bff', '#7affb0', '#e8dcc0'], oreGlow: true,
    lamp: '#c86bff', lamp2: '#7affb0', amb: '#3e3270', sky: '#7a6ab8', key: '#e8d8ff', keyI: 0.22,
    fog: '#100c1e', bg: '#08060f', cloth: ['plum', 'lavender', 'teal'], ambient: ['wisps', 'dust'], drip: null,
  },
];
const CAMP = { ...REG[0], rock: pal(['#3e2a34', '#64404a', '#8e5c5a', '#b87c6a', '#e0a888']), stone: pal(['#5a4246', '#7e5e5c', '#a47e70', '#cca088']), amb: '#5a4888', keyI: 0.25, fog: '#1c1220' };

export const CAM = {
  arena: { pos: [0, 1.5, 7.4], look: [0, 1.15, 0], fov: 38 },
  tomb: { pos: [0, 2.2, 8], look: [0, 1.3, -0.5], fov: 40 },
  room: { pos: [0, 2.0, 6.2], look: [0, 0.9, -0.5], fov: 38 },
  corridor: { pos: [0, 1.7, 6.6], look: [0, 0.9, 0], fov: 36 },
  wall: { pos: [0, 1.62, 4.6], look: [0, 1.5, -1], fov: 42 },
  campfire: { pos: [0, 3.15, 6.3], look: [0, 0.55, -0.35], fov: 38 },
  crossroads: { pos: [0, 2.05, 7.2], look: [0, 1.15, -1.2], fov: 40 },
};

// ---------------------------------------------------------------------------- plan (deferred painting)
class Plan {
  constructor(R, seed) { this.R = R; this.seed = seed; this.ops = []; this.lamps = []; this.flames = []; this.shafts = []; this.eyes = []; }
  /** Register a painter covering world x-range [x0,x1] (for corridor streaming). */
  op(x0, x1, fn) { this.ops.push({ x0: Math.floor(x0 / S) - 2, x1: Math.ceil(x1 / S) + 2, fn }); }
  lamp(x, y, z, c, r = 3.2, i = 1.1) { this.lamps.push({ x, y, z, c, r, i }); }
  flame(x, y, z, scale = 1, palette = 'fire', light = true) { this.flames.push({ x, y, z, scale, palette, light }); }
}
const rngOf = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

// ---------------------------------------------------------------------------- shells
/** Rock wall facing +z at depth z: boulders, cracks, strata, ore specks, moss, damp streaks. */
function rockWall(B, x0, x1, z, y0, y1, o = {}) {
  const R = B.R, seed = (o.seed || 1) + B.seed;
  const amp = o.amp ?? 7, cell = o.cell ?? 24, th = o.thick ?? 4;
  const site = (i, j) => [i * cell + h3(i, j, seed, 1) * cell, j * cell * 0.75 + h3(i, j, seed, 2) * cell * 0.75, h3(i, j, seed, 3)];
  // face: 'z+' (default, a back wall facing the camera), 'z-', 'x+' (left wall facing right), 'x-'.
  // x0..x1 run along the wall (z for side walls); z is the wall's plane.
  const face = o.face || 'z+', side = face[0] === 'x', sgnF = face[1] === '+' ? 1 : -1;
  const reach = (th + amp + 3) * S;
  const ox0 = side ? (sgnF > 0 ? z - reach : z - amp * S) : x0, ox1 = side ? (sgnF > 0 ? z + amp * S + S * 3 : z + reach) : x1;
  B.op(ox0, ox1, (w) => {
    const X0 = vx(x0), X1 = vx(x1), Y0 = vx(y0), Y1 = vx(y1), Z = vx(z);
    const [xa, xb] = side ? [X0, X1] : w.rx(X0, X1);
    const put = side ? (u, y, k, c) => w.set(Z + sgnF * k, y, u, c) : sgnF > 0 ? (u, y, k, c) => w.set(u, y, Z + k, c) : (u, y, k, c) => w.set(u, y, Z - k, c);
    for (let x = xa; x < xb; x++) for (let y = Y0; y < Y1; y++) {
      const gi = Math.floor(x / cell), gj = Math.floor(y / (cell * 0.75));
      let d1 = 1e9, d2 = 1e9, s1 = null;
      for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
        const s = site(i, j), d = Math.hypot(x - s[0], (y - s[1]) * 1.2);
        if (d < d1) { d2 = d1; d1 = d; s1 = s; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      const bulge = clamp(1 - d1 / (cell * 0.8));
      let relief = amp * (0.25 + 0.75 * Math.sqrt(bulge)) + (noise2(x * 0.15, y * 0.15) - 0.5) * 2;
      if (edge < 1.8) relief -= amp * 0.55 * (1 - edge / 1.8);
      if (o.dent) relief += o.dent(x * S, y * S) / S;
      const dz = Math.round(relief);
      if (o.hole && o.hole(x * S, y * S)) continue;
      const band = Math.floor((y + noise2(x * 0.02, y * 0.04) * 10) / 16);
      const tint = R.strata[((band % 3) + 3) % 3];
      const wet = noise2(x * 0.18, y * 0.012 + seed) > 0.72;
      // solid down to a flat back plane at -th (the room cull drops that plane's faces)
      for (let k = -th; k <= dz; k++) {
        const surf = k === dz;
        let v = 0.3 + bulge * 0.42 + (s1[2] - 0.5) * 0.22 + (h3(x, y, k, seed) - 0.5) * 0.06 - Math.max(0, y * S - 2.6) * 0.09;
        if (edge < 1.8) v -= 0.25;
        if (wet) v -= 0.12;
        if (!surf) v -= 0.1;
        let c = ramp(R.rock, v, x + k, y);
        if (band % 2 === 0) c = mixC(c, tint, 0.16);
        if (surf && h3(x, y, 7, seed) > 0.993) c = R.oreGlow && h3(x, y, 8, seed) > 0.4 ? glowC(R.ore[Math.abs(x + y) % R.ore.length]) : C(R.ore[Math.abs(x + y) % R.ore.length]);
        else if (surf && o.moss !== false && y - s1[1] > cell * 0.12 + (1 - bulge) * cell * 0.3 && noise2(x * 0.09 + seed, y * 0.11) > 0.5 && y < Y0 + 80) c = ramp(R.moss, 0.25 + bulge * 0.5 + h3(x, y, 2, seed) * 0.25, x, y);
        put(x, y, k, c);
      }
    }
  });
}
/** Floor heightfield: flagstones with dirt joints, pebbles, cracks. y(xu) gives the base height. */
function floorField(B, x0, x1, z0, z1, yFn = () => 0, o = {}) {
  const R = B.R, seed = (o.seed || 3) + B.seed, cw = o.cell ?? 16;
  const site = (i, j) => [i * cw + h3(i, j, seed, 4) * cw, j * cw * 0.7 + h3(i, j, seed, 5) * cw * 0.7, h3(i, j, seed, 6)];
  B.op(x0, x1, (w) => {
    const [xa, xb] = w.rx(vx(x0), vx(x1));
    const Z0 = vx(z0), Z1 = vx(z1);
    for (let x = xa; x < xb; x++) {
      const base = yFn(x * S);
      if (base === null) continue;
      const Yb = vx(base);
      for (let z = Z0; z < Z1; z++) {
        if (o.skip && o.skip(x * S, z * S)) continue;
        const gi = Math.floor(x / cw), gj = Math.floor(z / (cw * 0.7));
        let d1 = 1e9, d2 = 1e9, s1 = null;
        for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) { const s = site(i, j), d = Math.hypot(x - s[0], (z - s[1]) * 1.3); if (d < d1) { d2 = d1; d1 = d; s1 = s; } else if (d < d2) d2 = d; }
        const joint = d2 - d1 < 1.3;
        const raised = !joint && s1[2] > 0.55 ? 1 : 0;
        const top = Yb + raised;
        const pebble = !joint && h3(x, z, 9, seed) > 0.985;
        for (let y = top - 2; y <= top + (pebble ? 1 : 0); y++) {
          let c;
          if (joint) c = ramp(R.dirt, 0.3 + h3(x, z, y, seed) * 0.5, x, z);
          else c = ramp(R.stone, 0.34 + s1[2] * 0.34 + (h3(x, z, 1, seed) - 0.5) * 0.06 + (y === top + 1 ? 0.25 : 0) - Math.max(0, z * S - 1.6) * 0.1, x, z);
          if (!joint && Math.abs(noise2(x * 0.09 + seed, z * 0.09) - 0.5) < 0.012) c = R.dirt[0];
          w.set(x, y, z, c);
        }
      }
    }
  });
}
/** Rock ceiling slab along the top with a ragged underside and stalactites. */
function ceiling(B, x0, x1, z0, z1, y, o = {}) {
  const R = B.R, seed = (o.seed || 5) + B.seed;
  B.op(x0, x1, (w) => {
    const [xa, xb] = w.rx(vx(x0), vx(x1));
    const Y = vx(y), Z0 = vx(z0), Z1 = vx(z1);
    for (let x = xa; x < xb; x++) for (let z = Z0; z < Z1; z++) {
      const sagv = Math.round((noise2(x * 0.06, z * 0.08 + seed) - 0.3) * 8);
      for (let yy = Y - sagv; yy < Y + 8; yy++) w.set(x, yy, z, ramp(R.rock, 0.18 + (yy - Y + sagv) * 0.03 + h3(x, yy, z, seed) * 0.12, x, z));
    }
  });
  const r = rngOf(seed * 7);
  for (let x = x0 + 0.3; x < x1; x += 0.35 + r() * 0.9) {
    const z = z0 + 0.2 + r() * (z1 - z0 - 0.4), len = 6 + r() * (o.long ? 34 : 20);
    const X = vx(x), Z = vx(z);
    B.op(x - 0.4, x + 0.4, (w) => PR.stalactite(w, X, vx(y) - 2, Z, Math.round(len), R.rock, X, R.drip && r() > 0.7 ? R.drip : null));
  }
}
/** Chunky boulder heap (framing rocks near the camera, rubble in corners). */
function boulders(B, x, y, z, rx, ry, rz, o = {}) {
  const R = B.R, seed = (o.seed || 9) + B.seed;
  B.op(x - rx - 0.3, x + rx + 0.3, (w) => {
    const r = rngOf(seed);
    for (let k = 0; k < (o.n || 5); k++) {
      const cx = vx(x + (r() - 0.5) * rx * 1.6), cy = vx(y + r() * ry * 0.5), cz = vx(z + (r() - 0.5) * rz);
      const sx = vx(rx * (0.35 + r() * 0.5)), sy = vx(ry * (0.4 + r() * 0.6)), sz = vx(rz * (0.4 + r() * 0.5));
      ell(w, cx, cy, cz, sx, sy, sz, (px, py, pz, d) => {
        const up = (py - cy) / sy;
        let c = ramp(R.rock, 0.22 + up * 0.25 - d * 0.15 + h3(px, py, pz, seed) * 0.15 + (o.dark ? -0.15 : 0), px, py);
        if (up > 0.55 && noise2(px * 0.1, pz * 0.1 + seed) > 0.55) c = ramp(R.moss, 0.4 + h3(px, py, pz, 2) * 0.5, px, pz);
        return c;
      });
    }
  });
}

// ---------------------------------------------------------------------------- dressing helpers (world units)
const flameCache = new Map();
function flameCanvas(palette) {
  if (flameCache.has(palette)) return flameCache.get(palette);
  const pals = {
    fire: ['#5a1004', '#c8380a', '#ff7a1a', '#ffc040', '#fff4c0'], purple: ['#2a0650', '#7a2aff', '#c86bff', '#f0c8ff', '#ffffff'],
    green: ['#063a22', '#1aa86a', '#5af0c8', '#d8fff0', '#ffffff'], blue: ['#06204a', '#1a5aff', '#6ad8ff', '#e0f8ff', '#ffffff'],
  };
  const cols = (pals[palette] || pals.fire);
  const N = 6, W = 16, H = 26;
  const c = document.createElement('canvas'); c.width = W * N; c.height = H;
  const g = c.getContext('2d');
  for (let f = 0; f < N; f++) {
    const ph = (f / N) * Math.PI * 2;
    for (let y = 0; y < H; y++) {
      const t = 1 - y / H, sway = Math.sin(ph + t * 3.2) * t * 2.4;
      const half = W * 0.4 * Math.sin(Math.min(1, (1 - t) * 1.3) * Math.PI * 0.6) * (1 - t * 0.3);
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - (W / 2 + sway);
        const lick = (noise2(t * 6 - f * 0.9 + (dx > 0 ? 3 : 0), 11) - 0.5) * 3.2 * t;
        const e = half + lick;
        if (Math.abs(dx) > e || e <= 0.3) continue;
        const core = 1 - Math.abs(dx) / Math.max(0.6, e);
        const v = clamp(core * 2.4 + (1 - t) * 1.9 - 0.4 + (bayer(x, y) - 0.5) * 0.6, 0, 4.99);
        g.fillStyle = Math.abs(dx) > e - 1 ? cols[0] : cols[Math.floor(v)];
        g.fillRect(f * W + x, y, 1, 1);
      }
    }
  }
  const out = { canvas: c, N, W, H };
  flameCache.set(palette, out);
  return out;
}
function gradTex(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, gg, b, a] = fn(x, y); const i = (y * w + x) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = a; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const fxify = (m, order) => { m.renderOrder = order; m.layers.set(LAYER_FX); m.frustumCulled = false; return m; };

// ---------------------------------------------------------------------------- Stage
export class Stage {
  constructor(kind, ri, R) {
    this.kind = kind;
    this.regionIdx = ri;
    this.region = REGIONS[ri] || REGIONS[0];
    this.R = R;
    this.style = { fog: R.fog, key: R.lamp, acc: R.lamp2, shadow: [R.bg, R.fog, R.fog, R.amb], sky: [R.bg] };
    this.group = new THREE.Group();
    this.group.name = 'vox:' + kind;
    this.lights = [];
    this.anchors = {};
    this.camera = { ...(CAM[kind] || CAM.arena) };
    this.floorY = 0;
    this.fogDensity = 0.022;
    this.fog = new THREE.FogExp2(new THREE.Color(R.fog), this.fogDensity);
    this.background = new THREE.Color(R.bg);
    this.P = { add: new ParticleSystem(1800, { additive: true }), alpha: new ParticleSystem(1000) };
    this.group.add(this.P.add.object, this.P.alpha.object);
    this.emitters = [];
    this.updaters = [];
    this.focus = V(0, 1.2, 0);
    this.spread = V(7, 2.5, 3);
    this.t = 0;
    this.flames = [];
    this.pool = [];
    this.sources = [];
    this.isVoxel = true;
    this.env = new THREE.Group();
    this.group.add(this.env);
  }
  add(obj, x = 0, y = 0, z = 0, rotY = 0, scale = 1) {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    if (scale !== 1) obj.scale.setScalar(scale);
    this.group.add(obj);
    if (obj.userData.lights) this.lights.push(...obj.userData.lights);
    return obj;
  }
  prop(name, opts, x, y, z, rotY, scale) { return this.add(buildProp(name, opts || {}), x, y, z, rotY, scale); }
  light(l, x, y, z) { l.position.set(x, y, z); this.group.add(l); this.lights.push(l); return l; }
  attach(scene) { scene.add(this.group); scene.fog = this.fog; scene.background = this.background; return this; }
  follow(x, y) {
    this.focus.x = x;
    if (y !== undefined) this.focus.y = y;
    const fy = this.pathY ? this.pathY(x) : 0;
    if (this.walkerLight) this.walkerLight.position.set(x + 0.45, fy + 1.3, 0.9);
    if (this.key && this.kind === 'corridor') { this.key.position.set(x - 3, fy + 6, 6); this.key.target.position.set(x + 1, fy, 0); }
    if (this.stream) this.stream.want(x);
  }
  floorAt(x) { return this.pathY ? this.pathY(x) : 0; }
  update(dt, t) {
    this.t = t ?? this.t + dt;
    tickProps(this.group, dt, this.t, this.P);
    for (const f of this.flames) {
      f.acc += dt * (9 + f.speed);
      f.mesh.material.map.offset.x = (Math.floor(f.acc) % f.N) / f.N;
      const n = noise2(this.t * 7, f.seed);
      f.mesh.scale.set(f.sx * (0.92 + n * 0.16), f.sy * (0.88 + n * 0.24), 1);
      if (f.light) f.light.intensity = f.base * (0.75 + n * 0.5);
      if (f.billboard && this._cam) f.mesh.quaternion.copy(this._cam.quaternion);
    }
    if (this.pool.length && this.sources.length) {
      const fx = this.focus.x;
      const near = this.sources.slice().sort((a, b) => Math.abs(a.x - fx) - Math.abs(b.x - fx)).slice(0, this.pool.length);
      near.forEach((s, i) => { const l = this.pool[i]; l.position.set(s.x, s.y, s.z); l.color.set(s.c); l.distance = s.r; l.intensity = s.i * (0.85 + 0.15 * noise2(this.t * 5, i)); });
    }
    if (this.stream) this.stream.step();
    for (const e of this.emitters) e(dt, this.t);
    for (const u of this.updaters) u(dt, this.t);
    this.P.add.update(dt);
    this.P.alpha.update(dt);
  }
  /** Let billboarded sprites (flames) face this camera. */
  setCamera(cam) { this._cam = cam; }

  // -------------------------------------------------------------- helpers
  addFlame(x, y, z, scale = 1, palette = 'fire', withLight = true, billboard = false) {
    const strip = flameCanvas(palette);
    const t = new THREE.CanvasTexture(strip.canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.repeat.set(1 / strip.N, 1); t.wrapS = THREE.RepeatWrapping;
    const ppu = 64, w = (strip.W / ppu) * scale, h = (strip.H / ppu) * scale;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.8, 1.8, 1.8), fog: false }));
    m.geometry.translate(0, h / 2, 0);
    m.position.set(x, y, z);
    this.group.add(fxify(m, 5));
    const col = { fire: 0xff8a30, purple: 0xc86bff, green: 0x5af0c8, blue: 0x6ad8ff }[palette] || 0xff8a30;
    let light = null;
    if (withLight) { light = new THREE.PointLight(col, 2.4 * scale, 5, 1.6); light.position.set(x, y + h * 0.6, z + 0.6); this.group.add(light); this.lights.push(light); }
    this.flames.push({ mesh: m, N: strip.N, acc: rnd.float(0, 6), speed: rnd.float(0, 3), seed: rnd.float(0, 99), sx: 1, sy: 1, light, base: light ? light.intensity : 0, billboard });
    return m;
  }
  /** Soft god-ray from a ceiling crack: additive pixel gradient quad, gently breathing. */
  addShaft(x, yTop, z, w, h, col = '#ffe0b0', tilt = 0.25, k = 0.5) {
    const [r, g, b] = hexToRgb(col);
    const t = gradTex(24, 64, (px, py) => {
      const u = Math.abs(px + 0.5 - 12) / 12, v = py / 64;
      const a = Math.max(0, (1 - u * u) * (1 - v) ** 1.4) * 255 * (bayer(px, py) * 0.35 + 0.65);
      return [r, g, b, Math.round(a)];
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: k, fog: false }));
    m.geometry.translate(0, -h / 2, 0);
    m.position.set(x, yTop, z);
    m.rotation.z = tilt;
    this.group.add(fxify(m, 6));
    const ph = rnd.float(0, 6);
    this.updaters.push((dt, tt) => { m.material.opacity = k * (0.75 + 0.25 * Math.sin(tt * 0.5 + ph)); });
    // motes drifting in the beam
    this.emitters.push((dt) => {
      if (!rnd.chance(dt * 5)) return;
      const f = rnd.float(0.1, 0.9);
      this.P.add.emit({ pos: [x + Math.sin(tilt) * h * f + rnd.float(-w, w) * 0.3, yTop - h * f, z + rnd.float(-0.3, 0.3)], vel: [0.02, -0.02, 0], spread: 0.02, life: [2, 4], size: 1, color: col, glow: 1.6, fadeIn: 0.8 });
    });
    return m;
  }
  /** Actor lighting matching the bake: lavender sky / warm ground, a soft key, and the nearest lamps. */
  addActorLights(lamps, max = 4, keyX = -3) {
    const R = this.R;
    const hemi = new THREE.HemisphereLight(new THREE.Color(R.sky), new THREE.Color(mixHex(R.lamp, '#2a1408', 0.6)), 1.05);
    this.group.add(hemi);
    const key = new THREE.DirectionalLight(new THREE.Color(R.key), 1.6);
    key.position.set(keyX, 5.5, 6); key.target.position.set(0, 0.5, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 6; sc.bottom = -3; sc.near = 0.5; sc.far = 30;
    key.shadow.bias = -0.0008; key.shadow.normalBias = 0.03;
    this.group.add(key, key.target);
    this.key = key;
    const rim = new THREE.DirectionalLight(new THREE.Color(R.amb).lerp(new THREE.Color('#9ad0ff'), 0.4), 1.0);
    rim.position.set(3.5, 3, -5);
    this.group.add(rim);
    this.lights.push(hemi, key, rim);
    for (const l of lamps.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, max)) {
      const p = new THREE.PointLight(new THREE.Color(l.c), 2.4 * l.i, l.r * 1.3, 1.5);
      p.position.set(l.x, Math.max(0.6, l.y), l.z + 0.3);
      this.group.add(p); this.lights.push(p);
    }
  }
  /** Invisible plane that only shows actors' shadows. */
  shadowCatcher(x0, x1, z0, z1, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: new THREE.Color(this.R.amb).multiplyScalar(0.3), opacity: 0.45, depthWrite: false }));
    m.position.set((x0 + x1) / 2, y + 0.06, (z0 + z1) / 2);
    m.receiveShadow = true; m.renderOrder = 2; m.layers.set(LAYER_FX);
    this.group.add(m);
    return m;
  }
  ambient(kinds) {
    const R = this.R, f = this.focus, sp = this.spread;
    const at = () => [f.x + rnd.float(-sp.x, sp.x), f.y + rnd.float(-sp.y * 0.6, sp.y), rnd.float(-sp.z, sp.z * 0.5)];
    for (const k of kinds) {
      this.emitters.push((dt) => {
        if (k === 'dust' && rnd.chance(dt * 10)) this.P.alpha.emit({ pos: at(), vel: [0.05, 0.02, 0], spread: 0.04, life: [3, 6], size: 1, color: mixHex(R.lamp, '#f0e4d8', 0.6), alpha: 0.55, fadeIn: 1 });
        if (k === 'motes' && rnd.chance(dt * 6)) this.P.add.emit({ pos: at(), vel: [0.03, 0.04, 0], spread: 0.02, life: [3, 5], size: 1, color: ['#ffe0b0', '#ffc8a0'], glow: 1.4, fadeIn: 1, swirl: 0.3 });
        if (k === 'glints' && rnd.chance(dt * 8)) this.P.add.emit({ pos: at(), vel: [0, 0.04, 0], spread: 0.03, life: [0.4, 1.2], size: [1, 2], color: ['#9ae8ff', '#ff9ae0', '#ffffff'], glow: 3, flicker: 0.6 });
        if (k === 'spores' && rnd.chance(dt * 12)) this.P.add.emit({ pos: at(), vel: [0.05, 0.12, 0], spread: 0.06, life: [3, 6], size: 1, color: ['#5af0c8', '#d8ff8a', '#ffe08a'], glow: 2, fadeIn: 0.8, swirl: 0.4 });
        if (k === 'fireflies' && rnd.chance(dt * 4)) this.P.add.emit({ pos: at(), vel: [rnd.float(-0.2, 0.2), rnd.float(-0.05, 0.1), 0], spread: 0.1, life: [3, 5], size: [1, 2], color: ['#e8ff8a', '#9affc8'], glow: 3, flicker: 0.7, swirl: 1, fadeIn: 0.6 });
        if (k === 'gold' && rnd.chance(dt * 5)) this.P.add.emit({ pos: at(), vel: [0.02, -0.03, 0], spread: 0.02, life: [2, 4], size: 1, color: ['#ffe08a', '#fff4c8'], glow: 2.2, flicker: 0.4 });
        if (k === 'embers' && rnd.chance(dt * 16)) this.P.add.emit({ pos: [f.x + rnd.float(-sp.x, sp.x), -0.2, rnd.float(-sp.z, sp.z * 0.5)], vel: [rnd.float(-0.1, 0.2), rnd.float(0.6, 1.2), 0], spread: 0.15, life: [1.5, 3.5], size: 1, color: ['#ffb43a', '#ff6a1a', '#ffe08a'], colorEnd: '#ff2a00', glow: 3, swirl: 0.6 });
        if (k === 'ash' && rnd.chance(dt * 6)) this.P.alpha.emit({ pos: at(), vel: [0.1, -0.08, 0], spread: 0.05, life: [3, 6], size: 1, color: '#3a3438', alpha: 0.7 });
        if (k === 'wisps' && rnd.chance(dt * 4)) this.P.add.emit({ pos: at(), vel: [0, 0.18, 0], spread: 0.08, life: [2, 4], size: [1, 2], color: ['#d070ff', '#9affc8'], glow: 2.5, swirl: 0.8, fadeIn: 0.5 });
      });
    }
  }
  drips(xs, top, color, zr = [-1.6, -0.4]) {
    if (!color) return;
    this.emitters.push((dt) => {
      if (!rnd.chance(dt * 2.4)) return;
      const x = rnd.pick(xs) + (this.kind === 'corridor' ? this.focus.x : 0);
      const fl = this.floorAt(x);
      this.P.alpha.emit({ pos: [x, top, rnd.float(zr[0], zr[1])], vel: [0, -4.2, 0], life: [0.7, 0.95], size: 1, color, alpha: 0.9, floor: fl, bounce: 0.1 });
      // splash ring
      this.updaters.push(function once(dt2, t) { /* handled by bounce */ });
    });
  }
}
function mixHex(a, b, t) { const A = new THREE.Color(a), Bc = new THREE.Color(b); return '#' + A.lerp(Bc, t).getHexString(); }

// ---------------------------------------------------------------------------- baking
const geoCache = new Map(); // key -> {solid, glow, faces}; small LRU of whole stages (title, arenas, rooms)
const BIG = 1e6;
/**
 * Paint the plan into a voxel world and mesh it. o: { bounds (voxel x-range, corridor segments),
 * room (world box: faces looking out of it are culled), skip (Set of 'a,s' dirs), bottomAbove (world y), cache }
 */
function bake(st, plan, key, bounds = null, o = {}) {
  const cacheKey = o.cache !== false && !bounds && key;
  let res = cacheKey && geoCache.get(cacheKey);
  if (res) { geoCache.delete(cacheKey); geoCache.set(cacheKey, res); }
  else {
    const clip = bounds ? { x0: bounds.x0 - 2, x1: bounds.x1 + 2, y0: -BIG, y1: BIG, z0: -BIG, z1: BIG } : null;
    const w = new VWorld(clip);
    for (const op of plan.ops) if (!bounds || (op.x1 >= clip.x0 && op.x0 <= clip.x1)) op.fn(w);
    const rig = makeLightRig({ amb: plan.R.amb, ambI: 1.15, sky: plan.R.sky, skyI: 0.3, key: plan.R.key, keyI: plan.R.keyI, lamps: plan.lamps.map((l) => ({ ...l, i: l.i * 1.35 })), bands: 16 });
    const rm = o.room && { x0: vx(o.room.x0), x1: vx(o.room.x1), y0: vx(o.room.y0), y1: vx(o.room.y1), z0: vx(o.room.z0), z1: vx(o.room.z1) };
    res = meshWorld(w, { light: rig, room: rm, bounds: bounds ? { x0: bounds.x0, x1: bounds.x1, y0: -BIG, y1: BIG, z0: -BIG, z1: BIG } : null, skip: o.skip || new Set(['2,-1']), bottomAbove: vx(o.bottomAbove ?? 1.0) });
    if (cacheKey) {
      for (const g of [res.solid, res.glow]) if (g) g.userData.keep = true;
      geoCache.set(cacheKey, res);
      if (geoCache.size > 8) {
        const [k0, old] = geoCache.entries().next().value;
        geoCache.delete(k0);
        for (const g of [old.solid, old.glow]) if (g) g.dispose();
      }
    }
  }
  const g = worldMeshes(res, 1.6);
  for (const m of g.children) { m.matrixAutoUpdate = false; m.updateMatrix(); }
  st.env.add(g);
  st.faces = (st.faces || 0) + res.faces;
  return g;
}
/** Instantiate flames and lamps (lights for actors) after baking. */
function finish(st, plan, o = {}) {
  for (const f of plan.flames) st.addFlame(f.x, f.y, f.z, f.scale, f.palette, f.light && o.flameLights !== false, !!o.billboard);
  st.sources = plan.lamps.map((l) => ({ x: l.x, y: Math.max(0.7, l.y), z: l.z + 0.3, c: l.c, i: 2.4 * l.i, r: l.r * 1.3 }));
}

// ---------------------------------------------------------------------------- dressing vocabulary
const VY = (u) => vx(u);
function lanternAt(B, x, y, z, col, r = 3.2, i = 1.1) {
  B.op(x - 0.2, x + 0.2, (w) => PR.lantern(w, vx(x), vx(y), vx(z), col));
  B.lamp(x, y + 0.2, z + 0.2, col, r, i);
}
function frameAt(B, x, z, span = 2.0, h = 2.4, lamp = true) {
  B.op(x - span / 2 - 0.3, x + span / 2 + 0.3, (w) => PR.timberFrame(w, vx(x), 0, vx(z), vx(span), vx(h), { seed: Math.round(x * 10) }));
  if (lamp) lanternAt(B, x + span * 0.3, h - 0.5, z + 0.25, B.R.lamp, 4.0, 1.3);
}
function clutter(B, x, z, r, kinds = ['crate', 'barrel', 'sack']) {
  const R = B.R, k = Math.floor(r() * kinds.length), what = kinds[k];
  const X = vx(x), Z = vx(z);
  if (what === 'crate') B.op(x - 0.4, x + 0.6, (w) => { PR.crate(w, X, 0, Z, 10, 9, 9, { seed: X, mark: r() > 0.5 ? R.lamp : null }); if (r() > 0.5) PR.crate(w, X + 2, 9, Z - 1, 8, 7, 8, { seed: X + 1, pale: true }); });
  else if (what === 'barrel') B.op(x - 0.4, x + 0.6, (w) => { PR.barrel(w, X, 0, Z, 5, 12, { seed: X }); if (r() > 0.6) PR.barrel(w, X + 10, 0, Z + 2, 4, 10, { seed: X + 3 }); });
  else if (what === 'sack') B.op(x - 0.4, x + 0.6, (w) => PR.sack(w, X, 0, Z, 0.9 + r() * 0.3, PR.CLOTH.cream, r() > 0.5 ? [C(R.ore[0]), C(R.ore[1])] : null));
  else if (what === 'cart') B.op(x - 0.7, x + 0.7, (w) => PR.minecart(w, X, 0, Z));
  else if (what === 'rack') B.op(x - 0.7, x + 0.7, (w) => PR.toolRack(w, X, 0, Z));
  else if (what === 'bones') B.op(x - 0.5, x + 0.6, (w) => PR.bones(w, X, 0, Z, X, r() > 0.4));
  else if (what === 'crystal') B.op(x - 0.5, x + 0.5, (w) => PR.crystals(w, X, 0, Z, 12 + Math.round(r() * 16), R.ore[Math.floor(r() * 2)], X, 4 + Math.floor(r() * 3)));
  else if (what === 'mush') B.op(x - 0.6, x + 0.6, (w) => { PR.mushroom(w, X, 0, Z, 10 + Math.round(r() * 14), r() > 0.5 ? PR.CLOTH.salmon : PR.CLOTH.mustard, '#5af0c8', X); PR.mushroom(w, X + 8, 0, Z + 3, 6 + Math.round(r() * 6), PR.CLOTH.salmon, '#9affc8', X + 1); });
  else if (what === 'gold') B.op(x - 0.5, x + 0.5, (w) => PR.goldPile(w, X, 0, Z, 6 + Math.round(r() * 5), X));
  else if (what === 'brazier') { B.op(x - 0.3, x + 0.3, (w) => PR.brazier(w, X, 0, Z, R.lava ? '#ff8a3a' : R.lamp)); B.flame(x, 0.62, z + 0.02, 0.9, B.R === REG[5] ? 'purple' : 'fire'); B.lamp(x, 0.9, z, R.lamp, 3, 1); }
}
function regionFlora(B, x0, x1, z0, z1, density, seed) {
  const R = B.R, r = rngOf(seed);
  for (let x = x0; x < x1; x += 0.25 + r() / density) {
    const z = z0 + r() * (z1 - z0), X = vx(x), Z = vx(z);
    const pick = r();
    if (B.R === REG[2] && pick < 0.5) B.op(x - 0.5, x + 0.5, (w) => PR.mushroom(w, X, 0, Z, 6 + Math.round(r() * 14), r() > 0.5 ? PR.CLOTH.salmon : PR.CLOTH.mustard, '#5af0c8', X));
    else if ((B.R === REG[1] || B.R === REG[5]) && pick < 0.45) B.op(x - 0.4, x + 0.4, (w) => PR.crystals(w, X, 0, Z, 8 + Math.round(r() * 14), R.ore[Math.floor(r() * 2)], X, 3 + Math.floor(r() * 3)));
    else if (B.R === REG[4] && pick < 0.4) B.op(x - 0.4, x + 0.4, (w) => { for (let k = 0; k < 10; k++) w.set(X + k - 5, 0, Z + Math.round(Math.sin(k) * 2), glowC(k % 3 ? '#ff6a1a' : '#ffc85a')); });
    else B.op(x - 0.2, x + 0.2, (w) => PR.tuft(w, X, 1, Z, R.moss.concat([C('#d8e8a0')]), 5, 3 + Math.floor(r() * 3), X));
  }
}

// ---------------------------------------------------------------------------- kinds
function buildArena(st, B, ri, tomb) {
  const R = B.R, r = rngOf(31 + ri);
  const wallZ = tomb ? -4.5 : -3.0;
  rockWall(B, -9.5, 9.5, wallZ, -0.4, 6.2, { seed: 11, amp: 8 });
  floorField(B, -9.5, 9.5, wallZ, 4.6, () => 0, { seed: 12 });
  ceiling(B, -9.5, 9.5, wallZ - 0.2, wallZ + 2.2, tomb ? 7.6 : 4.9, { seed: 13, long: true });
  // side shoulders of rock close the chamber and frame the shot
  for (const sd of [-1, 1]) {
    boulders(B, sd * 7.6, 0, -1.2, 1.8, 3.4, 3.2, { seed: 20 + sd, n: 7 });
    boulders(B, sd * 5.6, 0, 2.9, 1.1, 1.3, 1.0, { seed: 30 + sd, n: 4, dark: true });
  }
  if (tomb) {
    B.op(-1.6, 1.6, (w) => PR.throne(w, 0, 0, vx(-3.0), R.rock));
    B.op(-1.2, 1.2, (w) => PR.rug(w, 0, 1, vx(-0.6), 34, vx(4.6), PR.CLOTH.plum, 3));
    for (const x of [-5, -2.6, 2.6, 5]) B.op(x - 0.5, x + 0.5, (w) => PR.pillar(w, vx(x), 0, vx(-2.4), 110, R.rock, Math.round(x * 3), Math.abs(x) < 3 ? PR.CLOTH.plum : null));
    for (const x of [-3.8, 3.8]) clutter(B, x, -1.6, () => 0.95, ['brazier']);
    for (const [a, b] of [[-5, -2.6], [2.6, 5]]) B.op(a, b, (w) => PR.chain(w, vx(a), vx(5.2), vx(-2.2), vx(b), vx(5.2), vx(-2.2), 14));
    for (let k = 0; k < 7; k++) clutter(B, -6 + r() * 12, -2.2 + r() * 4, r, ['bones', 'bones', 'crystal']);
    st.addShaft(0.6, 7.4, -3.4, 1.6, 7.2, '#c8a8ff', -0.12, 0.45);
  } else {
    // a worked corner of the mine: timber, a rail spur, crates, lanterns, signs, a poster, pipes
    frameAt(B, -4.6, wallZ + 0.35, 2.2, 2.6);
    frameAt(B, 4.4, wallZ + 0.35, 2.2, 2.6);
    B.op(-8, 8, (w) => PR.rails(w, vx(-8), vx(8), 0, vx(wallZ + 1.0)));
    B.op(-1, 1, (w) => PR.sign(w, 0, vx(2.6), vx(wallZ + 0.35), ['MINE 7', 'PRISM', 'SPORES', 'HALL', 'HOT!', 'BEWARE'][ri], { hang: 6, paint: ['#3a6a6a', '#5a4a8a', '#3a5a3a', '#6a3a3a', '#5a2a2a', '#3a2a4a'][ri], ink: '#ffe8b0' }));
    B.op(2, 3, (w) => PR.poster(w, vx(2.4), vx(1.0), vx(wallZ + 0.4), 12, 16, ['pick', 'gem', 'arrow', 'skull'][ri % 4], ri));
    B.op(-3, -2, (w) => PR.poster(w, vx(-2.6), vx(1.2), vx(wallZ + 0.4), 10, 13, 'skull', ri + 1));
    if (ri === 0 || ri === 3) B.op(-9, 9, (w) => PR.pipe(w, [[vx(-9), vx(3.4), vx(wallZ + 0.5)], [vx(-1.5), vx(3.4), vx(wallZ + 0.5)], [vx(-1.5), vx(4.2), vx(wallZ + 0.5)], [vx(9), vx(4.2), vx(wallZ + 0.5)]], 1.6, PR.IRON, { valve: true }));
    B.op(-6.5, 6.5, (w) => PR.bunting(w, vx(-6.4), vx(3.0), vx(wallZ + 1.2), vx(-2.6), vx(3.1), vx(wallZ + 1.2), ri));
    for (let k = 0; k < 10; k++) { const x = (r() > 0.5 ? 1 : -1) * (3.4 + r() * 3.2); clutter(B, x, wallZ + 0.8 + r() * 1.6, r, ri === 2 ? ['mush', 'sack', 'barrel'] : ri === 1 ? ['crystal', 'crate', 'sack'] : ri === 3 ? ['gold', 'crate', 'barrel'] : ri === 4 ? ['crate', 'barrel', 'brazier'] : ri === 5 ? ['bones', 'crystal', 'brazier'] : ['crate', 'barrel', 'sack', 'rack', 'cart']); }
    st.addShaft(-1.4, 4.9, -2.4, 1.2, 5.4, R.lamp, 0.22, 0.35);
    st.addShaft(2.2, 4.9, -2.0, 0.8, 5.0, R.lamp2, -0.18, 0.25);
  }
  regionFlora(B, -8.5, 8.5, wallZ + 0.3, wallZ + 1.4, 1.2, 40 + ri);
  regionFlora(B, -8, 8, 2.6, 4.2, 0.6, 50 + ri);
  B.lamp(0, 3.8, 0.5, R.lamp, 7, 0.55); // the room's general warm fill
  if (R.lava) for (const x of [-6.5, 6.8]) { B.op(x - 1, x + 1, (w) => { for (let k = 0; k < 40; k++) w.set(vx(x) + Math.round(Math.sin(k * 0.4) * 4), 0, vx(wallZ + 1.4) + k, glowC(k % 3 ? '#ff6a1a' : '#ffc85a')); }); B.lamp(x, 0.3, wallZ + 2.4, '#ff6a1a', 2.6, 1.2); }
  bake(st, B, 'arena|' + ri + '|' + (tomb ? 1 : 0));
  finish(st, B);
  st.addActorLights(B.lamps, 4);
  st.shadowCatcher(-8, 8, wallZ, 4.5);
  st.ambient(R.ambient);
  st.drips([-3, 1.5, 4], tomb ? 7 : 4.6, R.drip);
  const A = st.anchors;
  if (tomb) Object.assign(A, { player: V(-1.8, 0, 0.6), monster: V(2.0, 0, 0), boss: V(2.4, 0, -0.4), throne: V(0, 0, -3.0), forge: V(-3.2, 0, 1.0), center: V(0, 1, 0) });
  else Object.assign(A, { player: V(-1.6, 0, 0.4), monster: V(1.8, 0, 0.2), boss: V(2.6, 0, -0.6), forge: V(-3.1, 0, 0.9), center: V(0, 1, 0) });
  st.camera = { ...(tomb ? CAM.tomb : CAM.arena) };
  st.spread.set(6, 2.5, 3);
}

function buildRoom(st, B, ri, opts) {
  const R = B.R, room = opts.room || 'event', r = rngOf(70 + ri + room.length);
  const wallZ = -3.0;
  rockWall(B, -7.5, 7.5, wallZ, -0.4, 5.8, { seed: 21, amp: 7 });
  floorField(B, -7.5, 7.5, wallZ, 4.2, () => 0, { seed: 22 });
  ceiling(B, -7.5, 7.5, wallZ - 0.2, wallZ + 2.0, 4.7, { seed: 23 });
  for (const sd of [-1, 1]) { boulders(B, sd * 5.8, 0, -1.4, 1.5, 3.2, 3.0, { seed: 24 + sd, n: 6 }); boulders(B, sd * 4.6, 0, 2.6, 0.9, 1.0, 0.8, { seed: 26 + sd, n: 3, dark: true }); }
  const A = st.anchors;
  Object.assign(A, { center: V(0, 0, 0), player: V(-1.9, 0, 0.8) });
  if (room === 'merchant') {
    A.merchant = V(-0.2, 0, -0.5);
    A.cart = V(1.0, 0, -1.5);
    B.op(-2.2, 2.2, (w) => PR.stall(w, vx(-0.2), 0, vx(-2.2), 70, ri + 1));
    B.op(1.4, 3.6, (w) => PR.minecart(w, vx(2.5), 0, vx(-1.6)));
    B.op(-1, 1, (w) => PR.sign(w, vx(-0.2), vx(3.0), vx(-2.05), 'WARES', { hang: 0, paint: '#c05a4e', ink: '#fff0c8' }));
    B.op(-4, -3, (w) => PR.sign(w, vx(-3.4), vx(1.4), vx(wallZ + 0.4), 'NO REFUNDS', { paint: '#3a6a6a', ink: '#ffe8b0' }));
    B.op(3, 4, (w) => PR.poster(w, vx(3.6), vx(1.2), vx(wallZ + 0.4), 12, 16, 'gem', 2));
    for (const x of [-2.6, 2.4]) { B.op(x - 0.2, x + 0.2, (w) => PR.lampPost(w, vx(x), 0, vx(-1.2), 40, '#ffc070')); B.lamp(x + 0.2, 1.6, -1.2, '#ffc070', 3.4, 1.2); }
    for (let k = 0; k < 6; k++) clutter(B, (r() > 0.5 ? 1 : -1) * (3.2 + r() * 2.2), -2.4 + r() * 1.4, r, ['crate', 'barrel', 'sack']);
    B.op(-1.2, 1.2, (w) => PR.rug(w, vx(-0.2), 1, vx(0.3), 40, 22, PR.CLOTH.teal, 4));
    if (opts.npc !== false) { try { A.npc = st.prop('mole', {}, -0.2, 0, -0.5, 0.25); } catch (e) { /* optional */ } }
    st.addShaft(-0.2, 4.7, -2.4, 1.4, 4.8, '#ffe0b0', 0.1, 0.35);
  } else if (room === 'treasure') {
    for (let i = 0; i < 3; i++) A['chest' + i] = V(-1.5 + i * 1.5, 0, -0.6);
    for (const [x, z, s] of [[-2.6, -1.2, 11], [2.5, -1.0, 9], [0.2, -2.3, 7], [-3.8, -2.2, 6], [3.9, -2.3, 7]]) B.op(x - 0.6, x + 0.6, (w) => PR.goldPile(w, vx(x), 0, vx(z), s, Math.round(x * 7)));
    for (const x of [-3.2, 3.2]) B.op(x - 0.5, x + 0.5, (w) => PR.pillar(w, vx(x), 0, vx(-2.4), 70, R.rock, Math.round(x * 3), PR.CLOTH.mustard));
    for (const x of [-1.8, 1.8]) clutter(B, x, -2.5, () => 0.99, ['brazier']);
    B.op(-1, 1, (w) => PR.arch(w, 0, 0, vx(wallZ + 0.4), 32, 44, R.rock, '#ffd25e', 5));
    st.addShaft(0, 4.7, -1.4, 1.8, 5.0, '#ffe8a0', 0.05, 0.45);
    st.ambient(['gold']);
  } else if (room === 'camp') {
    A.fire = V(0, 0, -0.2); A.seat = V(-1.3, 0.32, 0.25); A.anvil = V(1.7, 0, 0.5);
    B.op(-0.8, 0.8, (w) => { PR.firepit(w, 0, 0, vx(-0.2), 12); PR.cookpot(w, 0, 0, vx(-0.2), 30); });
    B.flame(0, 0.12, -0.2, 1.4, 'fire', true);
    B.lamp(0, 0.7, -0.2, '#ffa040', 4.6, 1.6);
    B.op(-2.2, -0.4, (w) => PR.logSeat(w, vx(-1.3), 0, vx(0.25), 22, 3.4, 4));
    B.op(1.2, 2.2, (w) => PR.anvil(w, vx(1.7), 0, vx(0.5)));
    B.op(-4.4, -1.8, (w) => PR.tent(w, vx(-3.0), 0, vx(-1.9), 34, 26, 28, PR.CLOTH[R.cloth[1]]));
    B.op(2.4, 4.4, (w) => PR.bedroll(w, vx(2.6), 0, vx(-1.6), PR.CLOTH[R.cloth[0]], 3));
    B.op(-4, 4, (w) => PR.bunting(w, vx(-3.0), vx(1.4), vx(-1.9), vx(3.6), vx(2.6), vx(wallZ + 0.6), 2));
    for (let k = 0; k < 4; k++) clutter(B, (r() > 0.5 ? 1 : -1) * (3 + r() * 2), -2.3 + r(), r, ['sack', 'barrel', 'crate']);
    st.ambient(['motes']);
  } else {
    A.prop = V(0.6, 0, -0.8);
    B.op(-1.6, 1.6, (w) => PR.arch(w, vx(0.6), 0, vx(wallZ + 0.4), 40, 54, R.rock, R.oreGlow ? R.ore[0] : '#9affc8', 7));
    for (const x of [-0.7, 1.9]) { B.op(x - 0.2, x + 0.2, (w) => { cyl(w, vx(x) + 0.5, vx(-2.2) + 0.5, 0, 6, 1.6, 1.4, PR.CLOTH.cream[2]); w.set(vx(x), 6, vx(-2.2), glowC('#ffd27a')); }); B.flame(x, 0.3, -2.2, 0.35, 'fire', false); }
    for (let k = 0; k < 6; k++) clutter(B, (r() > 0.5 ? 1 : -1) * (2.8 + r() * 2.6), -2.4 + r() * 1.5, r, ri === 5 ? ['bones', 'crystal'] : ['crate', 'sack', 'bones', 'crystal']);
    const spot = new THREE.SpotLight(new THREE.Color(R.lamp2), 14, 12, 0.5, 0.7, 1.4);
    st.light(spot, 0, 5.2, 1.2); spot.target.position.set(0.6, 0, -0.8); st.group.add(spot.target);
    st.addShaft(0.6, 4.7, -2.0, 1.6, 5.0, R.lamp2, 0, 0.45);
  }
  regionFlora(B, -6.5, 6.5, wallZ + 0.3, wallZ + 1.0, 1.0, 80 + ri);
  B.lamp(0, 3.6, 0.6, R.lamp, 6.5, 0.5);
  for (const x of [-4.2, 4.2]) lanternAt(B, x, 2.3, wallZ + 0.5, R.lamp, 3.2, 1.1);
  bake(st, B, 'room|' + ri + '|' + room);
  finish(st, B);
  st.addActorLights(B.lamps, 3);
  st.shadowCatcher(-6, 6, wallZ, 4);
  st.ambient(R.ambient);
  st.drips([-3, 1.5, 4], 4.4, R.drip);
  st.camera = { ...CAM.room };
  st.spread.set(5, 2.2, 2.5);
}

function buildWall(st, B, ri) {
  rockWall(B, -5.5, 5.5, -1.3, -0.6, 4.6, { seed: 41, amp: 6 });
  floorField(B, -5.5, 5.5, -1.3, 2.6, () => 0, { seed: 42 });
  for (const x of [-3.4, 3.4]) frameAt(B, x, -0.9, 1.4, 2.6);
  bake(st, B, 'wall|' + ri);
  finish(st, B);
  st.addActorLights(B.lamps, 3);
  st.shadowCatcher(-5, 5, -1.3, 2.5);
  st.ambient(B.R.ambient);
  const cell = 0.32, n = 7, gw = cell * n, gy0 = 0.42, gx = -gw / 2, gzT = -1.0;
  Object.assign(st.anchors, { player: V(-1.4, 0, 0.9), gridOrigin: V(gx, gy0 + gw, gzT), gridCenter: V(0, gy0 + gw / 2, gzT), cell });
  st.camera = { ...CAM.wall };
  st.spread.set(3, 1.6, 1.5); st.focus.set(0, 1.5, 0);
}

// ---------------------------------------------------------------------------- corridor (streamed)
function buildCorridor(st, B, ri, opts) {
  const R = B.R, L = opts.length || 34, tun = opts.tunnel || 'tunnel', r = rngOf(90 + ri + tun.length);
  const crawl = tun === 'crawl';
  const wallZ = crawl ? -1.7 : -2.3;
  let pathY = () => 0, gap = null, shaft = null, stairs = null;
  if (/bridge$/.test(tun)) { gap = [Math.round(L * 0.42), Math.round(L * 0.42) + 6]; pathY = (x) => (x > gap[0] && x < gap[1] ? -0.22 * Math.sin((Math.PI * (x - gap[0])) / (gap[1] - gap[0])) : 0); }
  else if (tun === 'elevator') { shaft = [Math.round(L * 0.45), Math.round(L * 0.45) + 2.6]; const drop = -3.4; pathY = (x) => (x < shaft[0] ? 0 : x > shaft[1] ? drop : drop * smoothstep(shaft[0], shaft[1], x)); }
  else if (tun === 'stairs') { stairs = [Math.round(L * 0.45), Math.round(L * 0.45) + 5]; const drop = -1.6; pathY = (x) => (x < stairs[0] ? 0 : x > stairs[1] ? drop : drop * ((x - stairs[0]) / (stairs[1] - stairs[0]))); }
  else if (tun === 'flooded') pathY = () => -0.34;
  const X0 = -7, X1 = L + 7;
  // floor height along x (null = no floor here)
  const floorY = (x) => {
    if (gap && x > gap[0] + 0.15 && x < gap[1] - 0.15) return null;
    if (shaft && x > shaft[0] - 0.1 && x < shaft[1] + 0.1) return null;
    if (stairs && x >= stairs[0] && x <= stairs[1]) return Math.round(pathY(x) / 0.2) * 0.2;
    if (shaft && x >= shaft[1]) return -3.4;
    if (tun === 'flooded') return -0.62;
    return 0;
  };
  // the wall follows the floor down where the path drops
  rockWall(B, X0, X1, wallZ, -5.2, crawl ? 2.6 : 4.8, { seed: 51, amp: crawl ? 5 : 7, dent: (x) => 0 });
  floorField(B, X0, X1, wallZ, 2.4, floorY, { seed: 52 });
  ceiling(B, X0, X1, wallZ - 0.2, wallZ + (crawl ? 3.6 : 1.4), crawl ? 2.3 : 4.6, { seed: 53, long: !crawl });
  // chasm / shaft walls going down into the dark, with a glow at the bottom for lava
  if (gap || shaft) {
    const g = gap || shaft;
    for (const xe of [g[0], g[1]]) B.op(xe - 0.6, xe + 0.6, (w) => {
      const X = vx(xe), side = xe === g[0] ? 1 : -1;
      for (let y = vx(-4.8); y < 0; y++) for (let z = vx(wallZ); z < vx(2.4); z++) for (let k = 0; k < 4; k++) w.set(X - side * k + (side < 0 ? 0 : -1), y + (shaft && xe === g[1] ? vx(-3.4) - y + y : 0), z, ramp(R.rock, 0.15 + h3(X, y, z, 3) * 0.15 + (y - vx(-4.8)) * 0.001, z, y));
    });
    if (tun === 'lavabridge' || R.lava) B.op(g[0], g[1], (w) => box(w, vx(g[0]), vx(-3.6), vx(wallZ), vx(g[1]), vx(-3.5), vx(2.4), (px, py, pz) => glowC(h3(px, py, pz, 2) > 0.7 ? '#ffc85a' : h3(px, pz, 1, 3) > 0.4 ? '#ff6a1a' : '#c8380a')));
  }
  // bridge decks
  if (gap) {
    const kind = tun;
    B.op(gap[0] - 0.5, gap[1] + 0.5, (w) => {
      for (let x = vx(gap[0]) - 4; x < vx(gap[1]) + 4; x++) {
        const y = vx(pathY(x * S)) - 1, xi = x - vx(gap[0]);
        if (kind === 'lavabridge') { if (xi % 22 < 12) box(w, x, y - 2, vx(-0.35), x + 1, y + 1, vx(0.35), ramp(R.rock, 0.5, x, y)); continue; }
        if (kind === 'crystalbridge') { box(w, x, y - 1, vx(-0.4), x + 1, y + 1, vx(0.4), (px, py, pz) => (h3(px, py, pz, 2) > 0.6 ? glowC('#9ae8ff') : C('#6ab8e8'))); continue; }
        if (kind === 'rootbridge') { for (let k = 0; k < 3; k++) w.set(x, y + Math.round(Math.sin(x * 0.3 + k * 2)), vx(-0.3 + k * 0.3), ramp(PR.WOOD, 0.35 + k * 0.1, x, k)); continue; }
        if (xi % 4 !== 3) box(w, x, y, vx(-0.45), x + 1, y + 1, vx(0.45), (px, py, pz) => ramp(kind === 'chainbridge' ? PR.IRON : PR.WOOD_PALE, 0.4 + h3(Math.floor(px / 4), 0, pz >> 2, 5) * 0.3, px, pz));
      }
      // hand ropes / chains
      for (const z of [vx(-0.5), vx(0.5)]) {
        const ax = vx(gap[0]) - 4, bx = vx(gap[1]) + 4, ay = vx(0.95);
        if (kind === 'chainbridge') PR.chain(w, ax, ay, z, bx, ay, z, 6);
        else if (kind !== 'lavabridge') sag(w, ax, ay, z, bx, ay, z, 6, kind === 'rootbridge' ? PR.WOOD[2] : C('#c8a870'));
      }
      for (const xe of [gap[0] - 0.2, gap[1] + 0.2]) for (const z of [-0.5, 0.5]) box(w, vx(xe), 0, vx(z), vx(xe) + 2, vx(1.05), vx(z) + 2, PR.WOOD[2]);
    });
    st.anchors.bridgeStart = V(gap[0], 0, 0);
    st.anchors.bridgeMid = V((gap[0] + gap[1]) / 2, pathY((gap[0] + gap[1]) / 2), 0);
    st.anchors.bridgeEnd = V(gap[1], 0, 0);
  }
  if (stairs) st.anchors.stairs = V(stairs[0], 0, 0);
  // rails / water / props along the way
  if (tun === 'minecart') B.op(X0, X1, (w) => PR.rails(w, vx(X0), vx(X1), 0, 0));
  const avoid = (x) => (gap && x > gap[0] - 1.6 && x < gap[1] + 1.6) || (shaft && x > shaft[0] - 1.4 && x < shaft[1] + 1.4) || (stairs && x > stairs[0] - 0.6 && x < stairs[1] + 0.6);
  for (let x = X0 + 2; x < X1 - 1; x += 5.2 + r() * 1.6) if (!avoid(x)) frameAt(B, x, wallZ + 0.35, crawl ? 1.6 : 2.2, crawl ? 1.9 : 2.6);
  const spotsX = [0.22, 0.5, 0.78].map((k) => L * k);
  for (let x = X0 + 1; x < X1 - 1; x += 1.1 + r() * 2.2) {
    if (avoid(x) || spotsX.some((s) => Math.abs(s - x) < 1.1)) continue;
    const z = wallZ + 0.5 + r() * 0.7;
    const kinds = ri === 2 ? ['mush', 'mush', 'sack', 'barrel'] : ri === 1 ? ['crystal', 'crystal', 'crate', 'sack'] : ri === 3 ? ['gold', 'crate', 'barrel', 'bones'] : ri === 4 ? ['crate', 'barrel', 'bones'] : ri === 5 ? ['bones', 'crystal', 'brazier'] : ['crate', 'barrel', 'sack', 'rack', 'cart'];
    clutter(B, x, z, r, kinds);
  }
  for (let x = X0 + 4; x < X1 - 3; x += 7 + r() * 4) {
    if (avoid(x)) continue;
    const pk = r();
    if (pk < 0.35) B.op(x - 0.6, x + 0.6, (w) => PR.sign(w, vx(x), vx(crawl ? 1.2 : 1.8), vx(wallZ + 0.4), ['EXIT >', 'LEVEL 2', 'KEEP OUT', 'OIL', 'SHAFT 3', 'DANGER'][Math.floor(r() * 6)], { paint: ['#3a6a6a', '#6a3a3a', '#5a4a8a'][Math.floor(r() * 3)], ink: '#ffe8b0' }));
    else if (pk < 0.65) B.op(x - 0.4, x + 0.4, (w) => PR.poster(w, vx(x), vx(1.1), vx(wallZ + 0.4), 10, 14, ['pick', 'skull', 'gem', 'arrow'][Math.floor(r() * 4)], Math.floor(r() * 4)));
    else if (ri === 0 || ri === 3) B.op(x - 3, x + 3, (w) => PR.pipe(w, [[vx(x - 3), vx(2.9), vx(wallZ + 0.45)], [vx(x), vx(2.9), vx(wallZ + 0.45)], [vx(x), vx(0.2), vx(wallZ + 0.45)]], 1.5, PR.IRON, { valve: r() > 0.5, drip: true }));
    else B.op(x - 2, x + 2, (w) => PR.vine(w, vx(x), vx(crawl ? 2.2 : 4.4), vx(wallZ + 0.6), 30 + Math.floor(r() * 30), undefined, Math.floor(x), ri === 2 ? '#ff8ae0' : null));
  }
  if (ri === 0 || ri === 3) for (let x = X0 + 3; x < X1 - 4; x += 9) if (!avoid(x) && !avoid(x + 3)) B.op(x, x + 3.4, (w) => PR.bunting(w, vx(x), vx(crawl ? 1.9 : 2.9), vx(wallZ + 0.9), vx(x + 3.4), vx(crawl ? 1.9 : 2.9), vx(wallZ + 0.9), Math.floor(x)));
  regionFlora(B, X0, X1, wallZ + 0.3, wallZ + 1.1, 1.3, 120 + ri);
  regionFlora(B, X0, X1, 1.2, 2.3, 0.5, 130 + ri);
  // foreground: hanging rock fangs and boulders close to the lens
  for (let x = X0; x < X1; x += 2.6 + r() * 2.4) {
    if (r() < 0.45) continue;
    const z = 2.4 + r() * 0.8;
    B.op(x - 0.5, x + 0.5, (w) => PR.stalactite(w, vx(x), vx(crawl ? 2.6 : 4.3), vx(z), 14 + Math.floor(r() * 26), R.rock.map((c) => mixC(c, 0x0a0812, 0.35)), vx(x)));
  }
  // water for flooded halls
  if (tun === 'flooded') {
    const tex = gradTex(64, 32, (px, py) => { const w0 = Math.sin(px * 0.4 + py * 0.9) > 0.86 || Math.sin(px * 0.23 - py * 1.3) > 0.93; const [a, b, c] = hexToRgb(R.drip || '#5ae8d8'); return w0 ? [Math.min(255, a + 80), Math.min(255, b + 60), 255, 200] : [a * 0.35, b * 0.5, c * 0.6, 150]; });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set((X1 - X0) / 2, 2.4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, 4.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }));
    m.position.set((X0 + X1) / 2, -0.33, wallZ + 2.4);
    st.group.add(fxify(m, 8));
    st.updaters.push((dt, t) => { tex.offset.x = t * 0.03; tex.offset.y = Math.sin(t * 0.4) * 0.05; });
    st.emitters.push((dt) => { if (rnd.chance(dt * 4)) st.P.alpha.emit({ pos: [st.focus.x + rnd.float(-5, 5), -0.32, rnd.float(-1.5, 1.5)], vel: [0, 0.3, 0], life: [0.4, 0.8], size: 1, color: '#d8ffff', alpha: 0.8 }); });
  }
  // elevator: a moving voxel platform with ropes
  if (shaft) {
    const P2 = new Plan(R, B.seed + 7);
    const w2 = vx(shaft[1] - shaft[0] + 0.6);
    P2.op(-3, 3, (w) => {
      box(w, -(w2 >> 1), -2, vx(-0.6), w2 >> 1, 0, vx(0.6), (px, py, pz) => ramp(PR.WOOD_PALE, 0.4 + h3(px >> 2, py, pz, 2) * 0.3 + ((px + 40) % 5 === 0 ? -0.25 : 0), px, pz));
      for (const sx of [-(w2 >> 1), (w2 >> 1) - 1]) { box(w, sx, 0, vx(-0.6), sx + 1, vx(1.1), vx(-0.55), PR.IRON[2]); for (let y = vx(1.1); y < vx(9); y++) w.set(sx, y, 0, y % 2 ? C('#c8a870') : C('#8a6a40')); }
      box(w, -(w2 >> 1), vx(1.05), vx(-0.6), w2 >> 1, vx(1.1), vx(-0.55), PR.IRON[3]);
    });
    const pg = new THREE.Group();
    const tmp = new Stage('corridor', ri, R);
    bake(tmp, P2, 'elev|' + ri);
    pg.add(tmp.env);
    pg.position.x = (shaft[0] + shaft[1]) / 2;
    st.group.add(pg);
    st.elevator = pg;
    st.updaters.push(() => { const k = clamp((st.focus.x - shaft[0]) / (shaft[1] - shaft[0])); pg.position.y = pathY(shaft[0] + k * (shaft[1] - shaft[0])); });
    st.anchors.elevatorTop = V(shaft[0], pathY(shaft[0]), 0);
    st.anchors.elevatorBottom = V(shaft[1], pathY(shaft[1]), 0);
  }
  // streaming bake: 6 m segments built around the walker, one per frame
  const SEG = 6, segs = new Map();
  const key = 'cor|' + ri + '|' + tun + '|' + L;
  const want = new Set();
  st.stream = {
    want(x) { for (let s = Math.floor((x - 10) / SEG); s <= Math.floor((x + 16) / SEG); s++) if (s * SEG < X1 && (s + 1) * SEG > X0 && !segs.has(s)) want.add(s); },
    step() { const it = want.values().next(); if (it.done) return; const s = it.value; want.delete(s); if (segs.has(s)) return; segs.set(s, bake(st, B, key, { x0: vx(s * SEG), x1: vx((s + 1) * SEG) })); },
    all() { for (let s = Math.floor(X0 / SEG); s * SEG < X1; s++) if (!segs.has(s)) segs.set(s, bake(st, B, key, { x0: vx(s * SEG), x1: vx((s + 1) * SEG) })); },
  };
  // first view built right away
  for (let s = Math.floor(-10 / SEG); s <= Math.floor(14 / SEG); s++) segs.set(s, bake(st, B, key, { x0: vx(s * SEG), x1: vx((s + 1) * SEG) }));
  finish(st, B, { flameLights: false });
  st.addActorLights([], 0);
  for (let i = 0; i < 3; i++) { const p = new THREE.PointLight(0xffffff, 0, 5, 1.5); st.group.add(p); st.pool.push(p); st.lights.push(p); }
  st.walkerLight = new THREE.PointLight(new THREE.Color(R.lamp), 2.0, 5.5, 1.5);
  st.group.add(st.walkerLight); st.lights.push(st.walkerLight);
  st.shadowCatcher(X0, X1, wallZ, 2.4, tun === 'flooded' ? -0.62 : 0);
  st.ambient(R.ambient);
  st.drips([-3, 1.5, 4], crawl ? 2.2 : 4.4, R.drip);
  for (let x = X0 + 3; x < X1; x += 8 + r() * 6) if (r() > 0.4) st.addShaft(x, crawl ? 2.3 : 4.6, wallZ + 0.8, 0.9, crawl ? 2.4 : 4.6, R.lamp, (r() - 0.5) * 0.5, 0.3);
  const A = st.anchors;
  const spots = [0.22, 0.5, 0.78].map((k) => { let x = L * k; if (avoid(x)) x = k < 0.5 ? (gap || shaft || stairs)[0] - 2 : (gap || shaft || stairs)[1] + 2; return V(x, pathY(x), -0.75); });
  Object.assign(A, { start: V(0, pathY(0), 0), end: V(L, pathY(L), 0), spots });
  if (tun === 'minecart') A.cart = V(0, 0, 0);
  st.length = L;
  st.tunnel = tun;
  st.pathY = pathY;
  st.gapAt = gap || shaft ? (x) => { const g = gap || shaft; return x > g[0] - 1.8 && x < g[1] + 1.8; } : null;
  st.camera = { pos: [0, pathY(0) + 1.7, 6.6], look: [0, pathY(0) + 0.9, 0], fov: 36, follow: { dy: 1.7, dz: 6.6, lookDy: 0.9 } };
  st.spread.set(7, 2.5, 2.5);
  st.follow(0);
}

// ---------------------------------------------------------------------------- campfire (title)
export const CAMP_LAYOUT = {
  fire: [0, 0, 0],
  seats: [ // back-left, back-right, front-left, front-right
    { x: -1.3, z: -1.05, h: 0.3, log: [-1.42, -1.25, 0.5] },
    { x: 1.35, z: -1.0, h: 0.3, log: [1.48, -1.2, -0.5] },
    { x: -1.6, z: 0.85, h: 0.3, log: [-1.78, 1.0, -0.35] },
    { x: 1.55, z: 0.95, h: 0.3, log: [1.75, 1.1, 0.35] },
  ],
  anvil: [2.55, 0, 1.35], books: [-0.75, 0, -1.55], scroll: [0.55, 0, 1.55], slate: [3.6, 0, -1.6], lantern: [-3.4, 0, -1.2],
  mine: [-2.6, 0, -3.4],
};
function buildCampfire(st, B) {
  const R = B.R, L = CAMP_LAYOUT, r = rngOf(777);
  const wallZ = -3.6;
  rockWall(B, -8, 8, wallZ, -0.4, 6.0, { seed: 61, amp: 9, hole: (x, y) => x > -3.3 && x < -1.9 && y < 2.15 && y > -0.1 });
  floorField(B, -8, 8, wallZ, 4.6, () => 0, { seed: 62, cell: 14 });
  for (const sd of [-1, 1]) boulders(B, sd * 6.2, 0, -1.0, 1.6, 3.4, 3.6, { seed: 63 + sd, n: 8 });
  // the mine entrance at the back: timber set and rails leading into the dark
  B.op(-4, -1.2, (w) => {
    for (let z = vx(wallZ) - 60; z < vx(wallZ); z++) for (let y = 0; y < vx(2.1); y++) for (const x of [vx(-3.32), vx(-1.88)]) w.set(x, y, z, ramp(R.rock, 0.12, x, y));
    for (let z = vx(wallZ) - 60; z < vx(wallZ); z++) for (let x = vx(-3.32); x < vx(-1.88); x++) { w.set(x, -1, z, ramp(R.dirt, 0.2, x, z)); w.set(x, vx(2.12), z, R.rock[0]); }
    for (let k = 0; k < 4; k++) PR.timberFrame(w, vx(-2.6), 0, vx(wallZ) - k * 14, vx(1.4), vx(2.0), { seed: k });
    PR.rails(w, vx(-3.0), vx(-2.2), 0, vx(wallZ + 0.6));
  });
  B.op(-3.2, -2.0, (w) => { for (let z = vx(wallZ) - 60; z < vx(wallZ + 1.4); z++) for (const rz of [vx(-2.78), vx(-2.42)]) { w.set(rz, 1, z, PR.IRON[4]); } for (let z = vx(wallZ) - 58; z < vx(wallZ + 1.4); z += 6) box(w, vx(-2.95), 0, z, vx(-2.25), 1, z + 3, PR.WOOD[1]); });
  B.op(-3.4, -1.8, (w) => PR.sign(w, vx(-2.6), vx(2.25), vx(wallZ + 0.3), 'MINE', { paint: '#5a3a2a', ink: '#ffe0a0' }));
  // the fire, the stew and the logs
  B.op(-1, 1, (w) => { PR.firepit(w, 0, 0, 0, 14); PR.cookpot(w, 0, 0, 0, 32); });
  B.flame(0, 0.1, 0.05, 1.7, 'fire', false);
  B.lamp(0, 0.75, 0, '#ffa040', 6.4, 2.2);
  L.seats.forEach((s, i) => B.op(s.log[0] - 0.8, s.log[0] + 0.8, (w) => {
    const X = vx(s.log[0]), Z = vx(s.log[1]), a = s.log[2];
    // a log turned to face the fire
    for (let k = -11; k <= 11; k++) { const px = X + Math.round(Math.cos(a) * k), pz = Z + Math.round(Math.sin(a) * k); cyl(w, px + 0.5, pz + 0.5, 0, 7, 3.4, 3.4, (qx, qy, qz) => (Math.abs(k) === 11 ? (qy % 2 ? C('#d8a870') : C('#a87a4a')) : ramp(PR.WOOD, 0.3 + qy * 0.05 + h3(qx, qy, qz, i) * 0.12, qx, qz))); }
  }));
  // Bran's anvil and tools, Elio's books, a scroll, the slate, lanterns
  B.op(2, 3.2, (w) => { PR.anvil(w, vx(L.anvil[0]), 0, vx(L.anvil[2])); PR.toolRack(w, vx(3.4), 0, vx(0.2)); });
  B.op(-1.2, -0.3, (w) => { PR.books(w, vx(L.books[0]), 0, vx(L.books[2]), 4, 1); PR.books(w, vx(L.books[0]) + 9, 0, vx(L.books[2]) + 2, 2, 3); });
  B.op(0.2, 0.9, (w) => { box(w, vx(L.scroll[0]) - 4, 0, vx(L.scroll[2]) - 1, vx(L.scroll[0]) + 5, 2, vx(L.scroll[2]) + 1, PR.CLOTH.cream[2]); w.set(vx(L.scroll[0]) - 4, 1, vx(L.scroll[2]), C('#c05a4e')); w.set(vx(L.scroll[0]) + 4, 1, vx(L.scroll[2]), C('#c05a4e')); });
  B.op(3.2, 4.2, (w) => { PR.crate(w, vx(3.6), 0, vx(-1.6), 14, 10, 10, { seed: 3 }); box(w, vx(3.6) - 7, 10, vx(-1.6) - 1, vx(3.6) + 7, 22, vx(-1.6), (px, py) => (px === vx(3.6) - 7 || px === vx(3.6) + 6 || py === 10 || py === 21 ? PR.WOOD[2] : C('#2e363a'))); });
  B.op(-3.6, -3.2, (w) => PR.lampPost(w, vx(L.lantern[0]), 0, vx(L.lantern[2]), 44, '#ffc070'));
  B.lamp(L.lantern[0] + 0.2, 1.8, L.lantern[2], '#ffc070', 3.2, 1.2);
  // the camp: a tent, bedrolls, packs, firewood, bunting and a laundry line
  B.op(2.4, 5.4, (w) => PR.tent(w, vx(3.9), 0, vx(-2.4), 40, 30, 32, PR.CLOTH.mustard));
  B.op(-5, -3, (w) => { PR.bedroll(w, vx(-4.6), 0, vx(-0.6), PR.CLOTH.salmon, 1); PR.bedroll(w, vx(-4.4), 0, vx(0.9), PR.CLOTH.teal, 2); });
  B.op(-4.4, 4.4, (w) => PR.bunting(w, vx(-3.4), vx(2.6), vx(-1.2), vx(2.6), vx(2.3), vx(-2.6), 3));
  B.op(0.6, 2.6, (w) => { for (let k = 0; k < 9; k++) cylX(w, vx(0.7), vx(1.6), 3 + Math.floor(k / 3) * 6, vx(-2.4) + (k % 3) * 6, 3, (px, py, pz, d) => (d < 0.3 ? C('#d8a870') : ramp(PR.WOOD, 0.4 + h3(px, py, pz, k) * 0.2, px, py))); });
  B.op(-2, -1.2, (w) => { PR.sack(w, vx(-1.7), 0, vx(-2.4), 1.1, PR.CLOTH.cream, [C(R.ore[0]), C(R.ore[2])]); PR.barrel(w, vx(-0.9), 0, vx(-2.6), 6, 14, { seed: 3 }); });
  B.op(4.4, 6, (w) => { PR.crate(w, vx(5.2), 0, vx(1.2), 12, 10, 10, { seed: 5, mark: '#c05a4e' }); PR.barrel(w, vx(5.4), 0, vx(-0.2), 5, 12, { seed: 6 }); });
  B.op(-2.4, -1, (w) => PR.rug(w, vx(-1.7), 1, vx(-0.1), 30, 18, PR.CLOTH.plum, 2));
  for (let k = 0; k < 7; k++) { const x = (r() > 0.5 ? 1 : -1) * (2.2 + r() * 4), z = wallZ + 0.4 + r() * 0.8; B.op(x - 0.3, x + 0.3, (w) => (r() > 0.5 ? PR.mushroom(w, vx(x), 0, vx(z), 6 + Math.floor(r() * 8), PR.CLOTH.salmon, '#ffd27a', k) : PR.crystals(w, vx(x), 0, vx(z), 8 + Math.floor(r() * 8), '#ffb36a', k, 3))); }
  regionFlora(B, -7, 7, wallZ + 0.3, wallZ + 1.0, 1.4, 501);
  regionFlora(B, -6, 6, 2.4, 4.2, 0.7, 502);
  bake(st, B, 'campfire');
  finish(st, B, { flameLights: false });
  // actors: the fire is the key light, with a lavender sky fill and a cool rim from the cave
  const hemi = new THREE.HemisphereLight(new THREE.Color('#8a86c8'), new THREE.Color('#5a2a14'), 0.75);
  const fire = new THREE.PointLight(0xffa040, 7.5, 9, 1.1); fire.position.set(0, 0.8, 0.1);
  fire.castShadow = true; fire.shadow.mapSize.set(512, 512); fire.shadow.bias = -0.002;
  const rim = new THREE.DirectionalLight(new THREE.Color('#7a9ad8'), 0.7); rim.position.set(2, 4, -6);
  const lamp = new THREE.PointLight(0xffc070, 2.2, 4, 1.5); lamp.position.set(L.lantern[0] + 0.2, 1.8, L.lantern[2]);
  st.group.add(hemi, fire, rim, lamp);
  st.lights.push(hemi, fire, rim, lamp);
  st.fireLight = fire;
  st.updaters.push((dt, t) => { fire.intensity = 7.5 + noise2(t * 6, 3) * 1.6 - 0.8; });
  st.shadowCatcher(-6, 6, wallZ, 4.2);
  st.ambient(['dust', 'motes']);
  st.emitters.push((dt) => {
    if (rnd.chance(dt * 18)) st.P.add.emit({ pos: [rnd.float(-0.3, 0.3), 0.35, rnd.float(-0.2, 0.2)], vel: [rnd.float(-0.1, 0.1), rnd.float(0.8, 1.5), 0], spread: 0.15, life: [1, 2.4], size: 1, color: ['#ffd27a', '#ff8a3a', '#fff0b0'], colorEnd: '#ff3a00', glow: 3, swirl: 0.8 });
    if (rnd.chance(dt * 3)) st.P.alpha.emit({ pos: [rnd.float(-0.2, 0.2), 1.1, rnd.float(-0.2, 0.2)], vel: [0.05, 0.35, 0], spread: 0.05, life: [2.5, 4], size: [1, 2], sizeEnd: 3, color: '#9a8a90', alpha: 0.35, fadeIn: 0.5 });
    if (rnd.chance(dt * 2.5)) st.P.add.emit({ pos: [rnd.float(-5, 5), rnd.float(0.4, 2.4), rnd.float(-3, 2)], vel: [rnd.float(-0.1, 0.1), 0.05, 0], spread: 0.05, life: [2, 4], size: 1, color: ['#d8ff8a', '#ffe08a'], glow: 2.5, flicker: 0.6, fadeIn: 0.6 });
  });
  st.addShaft(-2.6, 6.0, -3.0, 1.4, 6.0, '#ffd8a8', 0.28, 0.3);
  const A = st.anchors;
  A.seats = [];
  L.seats.forEach((s, i) => {
    const face = Math.atan2(-s.x, -s.z);
    A['seat' + i] = V(s.x, s.h, s.z); A['face' + i] = face;
    A.seats.push({ pos: V(s.x, s.h, s.z), rotY: face, height: s.h });
  });
  Object.assign(A, { fire: V(0, 0, 0), center: V(0, 0.8, -0.4), mineEntrance: V(-2.6, 1.0, wallZ + 0.2), mineDeep: V(-2.6, 0.9, wallZ - 2.6), anvil: V(...L.anvil), books: V(...L.books), scroll: V(...L.scroll), slate: V(L.slate[0], 0.8, L.slate[2]), lantern: V(L.lantern[0], 1.8, L.lantern[2]) });
  st.fireAnchor = A.fire;
  st.camera = { ...CAM.campfire };
  st.spread.set(5, 2, 3); st.focus.set(0, 1.5, -0.5);
  st.fog.density = 0.012; st.fogDensity = 0.012;
}

// ---------------------------------------------------------------------------- crossroads
const OMEN_LIGHT = { monster: '#ff3a2a', elite: '#ff6a1a', boss: '#c03aff', mining: '#6ad8ff', treasure: '#ffcf4a', merchant: '#ffb35a', camp: '#ff7a2a', event: '#a08aff' };
export function crossroadsMouths(n, boss) {
  n = Math.max(1, n);
  const span = n === 1 ? 0 : Math.min(8.6, 3.2 * (n - 1));
  const w = boss ? 2.3 : n >= 4 ? 1.5 : 1.8, h = boss ? 2.8 : n >= 4 ? 2.0 : 2.3;
  return Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 0 : -span / 2 + (i * span) / (n - 1), w, h }));
}
function buildCrossroads(st, B, ri, opts) {
  const R = B.R, choices = opts.choices || [{ tunnel: 'tunnel', type: 'monster' }], r = rngOf(300 + ri + (opts.seed || 0));
  const boss = choices.some((c) => c.type === 'boss');
  const mouths = crossroadsMouths(choices.length, boss);
  const wallZ = -3.2, depth = 5.4;
  const inMouth = (x, y) => mouths.some((m, i) => {
    const crawl = choices[i].tunnel === 'crawl', hw = (crawl ? m.w * 0.75 : m.w) / 2, hh = crawl ? m.h * 0.6 : m.h;
    const dx = (x - m.x) / hw;
    return Math.abs(dx) < 1 && y > -0.1 && y < hh * (Math.abs(dx) < 0.55 ? 1 : 1 - (Math.abs(dx) - 0.55) * 0.55);
  });
  rockWall(B, -9.5, 9.5, wallZ, -0.4, 6.4, { seed: 71, amp: 8, hole: inMouth });
  floorField(B, -9.5, 9.5, wallZ, 4.4, () => 0, { seed: 72 });
  ceiling(B, -9.5, 9.5, wallZ - 0.2, wallZ + 2.0, 5.4, { seed: 73, long: true });
  for (const sd of [-1, 1]) { boulders(B, sd * 7.8, 0, -1.4, 1.9, 3.8, 3.6, { seed: 74 + sd, n: 8 }); boulders(B, sd * 5.4, 0, 3.0, 1.2, 1.4, 1.0, { seed: 76 + sd, n: 4, dark: true }); }
  st.anchors.mouths = [];
  mouths.forEach((m, i) => {
    const c = choices[i], tun = c.tunnel, type = c.type, crawl = tun === 'crawl';
    const hw = (crawl ? m.w * 0.75 : m.w) / 2, hh = crawl ? m.h * 0.6 : m.h;
    const timber = ['tunnel', 'minecart', 'elevator', 'stairs', 'crawl'].includes(tun);
    // the tunnel itself: rock tube receding into the dark
    B.op(m.x - hw - 0.6, m.x + hw + 0.6, (w) => {
      const X0 = vx(m.x - hw) - 2, X1 = vx(m.x + hw) + 2, ZB = vx(wallZ - depth), ZF = vx(wallZ) + 1;
      for (let z = ZB; z < ZF; z++) {
        const t = (ZF - z) / (ZF - ZB); // 0 at mouth → 1 deep
        for (let x = X0; x < X1; x++) for (let y = -2; y < vx(hh) + 4; y++) {
          const inside = inMouth(x * S, y * S);
          const shell = !inside && (inMouth((x + 1) * S, y * S) || inMouth((x - 1) * S, y * S) || inMouth(x * S, (y - 2) * S) || y < 0);
          if (!shell) continue;
          w.set(x, y, z, ramp(R.rock, 0.3 - t * 0.25 + h3(x, y, z, i) * 0.12, x + z, y));
        }
      }
      if (timber) for (let k = 0; k < 5; k++) PR.timberFrame(w, vx(m.x), 0, vx(wallZ) - 6 - k * 22, vx(hw * 2) - 4, vx(hh) - 3, { seed: i * 9 + k });
      if (tun === 'minecart') PR.rails(w, vx(m.x) - 1, vx(m.x) + 1, 0, vx(wallZ)); // stub; rails run in z below
      if (tun === 'minecart') for (let z = ZB; z < vx(1.5); z++) { for (const rz of [vx(m.x) - 4, vx(m.x) + 4]) w.set(rz, 1, z, PR.IRON[4]); if ((z + 400) % 6 < 3) box(w, vx(m.x) - 6, 0, z, vx(m.x) + 7, 1, z + 1, PR.WOOD[1]); }
      if (tun === 'stairs') for (let k = 0; k < 9; k++) box(w, vx(m.x - hw) + 2, -k * 3, ZF - 6 - k * 6, vx(m.x + hw) - 2, -k * 3 + 1, ZF - k * 6, ramp(R.stone, 0.4 - k * 0.04, k, 0));
      if (tun === 'flooded') box(w, vx(m.x - hw) - 6, 0, vx(wallZ - 3), vx(m.x + hw) + 6, 1, vx(wallZ + 1.2), (px, py, pz) => ((NOAO | (h3(px, py, pz, 4) > 0.9 ? C('#bff4ff') : C(R.drip || '#3ab0c0'))) >>> 0));
      if (tun === 'elevator') { for (let y = vx(hh) - 6; y > 0; y--) { w.set(vx(m.x) - 8, y, vx(wallZ) - 10, C('#c8a870')); w.set(vx(m.x) + 8, y, vx(wallZ) - 10, C('#c8a870')); } box(w, vx(m.x) - 12, 0, vx(wallZ) - 16, vx(m.x) + 12, 2, vx(wallZ) - 4, PR.WOOD_PALE[2]); for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; w.set(vx(m.x) + Math.round(Math.cos(a) * 4), vx(hh) + 4 + Math.round(Math.sin(a) * 4), vx(wallZ) + 2, PR.IRON[3]); } }
      if (/bridge$/.test(tun)) {
        // a crevasse in front of the mouth and its bridge
        for (let x = vx(m.x - hw) - 14; x < vx(m.x + hw) + 14; x++) for (let z = vx(wallZ + 0.5); z < vx(wallZ + 1.3); z++) for (let y = -60; y < 1; y++) w.set(x, y, z, 0);
        for (let z = vx(wallZ + 0.4); z < vx(wallZ + 1.4); z++) {
          for (let x = vx(m.x) - 7; x <= vx(m.x) + 7; x++) {
            const glowB = tun === 'crystalbridge';
            if (tun === 'lavabridge') { if ((z + 400) % 10 < 5 && Math.abs(x - vx(m.x)) < 4) w.set(x, 0, z, ramp(R.rock, 0.5, x, z)); continue; }
            if ((z + 400) % 4 !== 3) w.set(x, 0, z, glowB ? glowC('#9ae8ff') : tun === 'chainbridge' ? ramp(PR.IRON, 0.5, x, z) : tun === 'rootbridge' ? ramp(PR.WOOD, 0.35, x, z) : ramp(PR.WOOD_PALE, 0.5 + h3(x >> 2, 0, z, 3) * 0.2, x, z));
          }
        }
        for (const sx of [vx(m.x) - 8, vx(m.x) + 8]) sag(w, sx, vx(0.9), vx(wallZ + 0.4), sx, vx(0.9), vx(wallZ + 1.4), 3, tun === 'chainbridge' ? PR.IRON[3] : C('#c8a870'));
        if (tun === 'lavabridge') box(w, vx(m.x - hw) - 12, -40, vx(wallZ + 0.5), vx(m.x + hw) + 12, -39, vx(wallZ + 1.3), (px, py, pz) => glowC(h3(px, py, pz, 1) > 0.6 ? '#ffc85a' : '#ff6a1a'));
        if (tun === 'crystalbridge') PR.crystals(w, vx(m.x - hw) - 4, 0, vx(wallZ + 0.3), 16, '#9ae8ff', i, 5);
      }
      // the mouth's frame: timber lintel or rim stones
      if (timber) PR.timberFrame(w, vx(m.x), 0, vx(wallZ) + 2, vx(hw * 2) + 6, vx(hh) + 2, { seed: 40 + i });
      else for (let k = 0; k <= 16; k++) { const a = Math.PI - (k / 16) * Math.PI, px = vx(m.x) + Math.round(Math.cos(a) * (vx(hw) + 3)), py = Math.round(Math.sin(a) * vx(hh) * 0.95 + (k === 0 || k === 16 ? 0 : 0)); ell(w, px, py + 2, vx(wallZ) + 2, 3.6, 3, 3, (qx, qy, qz) => ramp(R.rock, 0.5 + h3(qx, qy, qz, k) * 0.25, qx, qy)); }
      if (tun === 'rootbridge') for (let k = 0; k < 5; k++) PR.vine(w, vx(m.x - hw) + k * 8, vx(hh) + 6, vx(wallZ) + 3, 30, PR.WOOD.slice(1, 4), k);
      // omens at the threshold
      const tz = vx(wallZ) + 6;
      if (type === 'monster' || type === 'boss' || type === 'elite') PR.bones(w, vx(m.x) - 6, 0, tz, i, type !== 'monster');
      if (type === 'elite' || type === 'boss') for (let k = 0; k < 3; k++) for (let q = 0; q < 12; q++) w.set(vx(m.x + hw) + 3 + k * 2 + (q >> 2), vx(hh * 0.6) - q, vx(wallZ) + 3, C('#140a10'));
      if (type === 'merchant') PR.sign(w, vx(m.x + hw) + 8, vx(hh * 0.62), vx(wallZ) + 3, '$', { hang: 4, paint: '#c08c36', ink: '#3a2a10' });
      if (type === 'treasure') PR.goldPile(w, vx(m.x) + 4, 0, tz + 2, 6, i);
      if (type === 'mining') { for (let k = 0; k < 10; k++) w.set(vx(m.x - hw) + Math.floor(h3(k, i, 1, 2) * vx(hw * 2)), Math.floor(h3(k, i, 2, 2) * vx(hh)), vx(wallZ) + 2, glowC(k % 2 ? '#9ae8ff' : '#ffffff')); PR.toolRack(w, vx(m.x - hw) - 12, 0, vx(wallZ) + 3); }
      if (type === 'event') for (let k = 0; k < 6; k++) w.set(vx(m.x - hw) - 4, vx(0.6) + k * 4, vx(wallZ) + 3, glowC('#a08aff'));
      if (type === 'camp') PR.sign(w, vx(m.x - hw) - 10, vx(0.7), vx(wallZ) + 3, 'REST', { paint: '#3a5a3a', ink: '#ffe0a0' });
    });
    // the glow of what waits inside (a light deep in the tunnel) + lanterns at timber mouths
    const deep = V(m.x, Math.min(hh * 0.45, 1.0), wallZ - depth * 0.55);
    B.lamp(deep.x, deep.y, deep.z, OMEN_LIGHT[type] || R.lamp, 2.6, type === 'monster' ? 0.4 : 1.0);
    if (timber) lanternAt(B, m.x + hw * 0.7, hh - 0.4, wallZ + 0.35, R.lamp, 2.8, 1.0);
    if (type === 'camp') B.flame(m.x, 0, wallZ - depth * 0.6, 0.9, 'fire', false);
    st.anchors.mouths.push({ x: m.x, z: wallZ, w: hw * 2, h: hh, deep, type, tunnel: tun });
  });
  // a hanging lamp in the middle of the junction and bits of life around it
  B.op(-0.4, 0.4, (w) => { for (let y = vx(3.2); y < vx(5.4); y++) w.set(0, y, vx(-0.6), y % 2 ? PR.IRON[2] : PR.IRON[3]); PR.lantern(w, 0, vx(2.6), vx(-0.6), '#ffc070', 4); });
  B.lamp(0, 2.8, -0.4, '#ffc070', 6.5, 1.4);
  for (let k = 0; k < 9; k++) { const x = (r() > 0.5 ? 1 : -1) * (4.6 + r() * 3.2); clutter(B, x, wallZ + 0.8 + r() * 2, r, ri === 2 ? ['mush', 'sack'] : ri === 1 ? ['crystal', 'crate'] : ri === 5 ? ['bones', 'crystal'] : ['crate', 'barrel', 'sack', 'cart']); }
  B.op(-9, 9, (w) => PR.bunting(w, vx(-7.5), vx(3.6), vx(wallZ + 1.0), vx(-4.8), vx(3.4), vx(wallZ + 1.0), 1));
  regionFlora(B, -8.5, 8.5, wallZ + 0.3, wallZ + 1.2, 1.1, 600 + ri);
  regionFlora(B, -8, 8, 2.4, 4.2, 0.6, 610 + ri);
  bake(st, B, 'xr|' + ri + '|' + choices.map((c) => c.tunnel + ':' + c.type).join(','));
  finish(st, B);
  st.addActorLights(B.lamps.filter((l) => l.z > -1.5), 3);
  st.shadowCatcher(-8, 8, wallZ, 4.2);
  st.ambient(R.ambient);
  st.drips([-3, 1.5, 4], 5.2, R.drip);
  st.addShaft(0.4, 5.4, -2.6, 1.4, 5.6, R.lamp, 0.15, 0.35);
  // omens that move: blinking eyes, wisps, smoke, glints
  st.anchors.mouths.forEach((m, i) => {
    const p = m.deep;
    if (m.type === 'monster' || m.type === 'elite' || m.type === 'boss') {
      const big = m.type === 'boss' ? 2.2 : m.type === 'elite' ? 1.5 : 1;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(m.type === 'boss' ? '#ff2a6a' : '#ff3a2a').multiplyScalar(3), fog: false });
      const eyes = new THREE.Group();
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.07 * big, 0.035 * big, 0.02), mat); e.position.x = s * 0.09 * big; eyes.add(e); }
      eyes.position.set(p.x, 0.55 + (big - 1) * 0.3, p.z + 0.4);
      st.group.add(fxify(eyes, 7));
      const ph = i * 1.7;
      st.updaters.push((dt, t) => { eyes.visible = (t * 0.7 + ph) % 3.5 > 0.12; eyes.position.x = p.x + Math.sin(t * 0.4 + ph) * 0.12; });
    }
    if (m.type === 'event') st.emitters.push((dt) => { if (rnd.chance(dt * 3)) st.P.add.emit({ pos: [p.x + rnd.float(-0.4, 0.4), rnd.float(0.4, 1.4), p.z + 1.2], vel: [rnd.float(-0.1, 0.1), 0.1, 0.15], spread: 0.05, life: [2, 3.5], size: [1, 2], color: ['#a08aff', '#d0c0ff'], glow: 3, swirl: 1, fadeIn: 0.5 }); });
    if (m.type === 'camp') st.emitters.push((dt) => { if (rnd.chance(dt * 2)) st.P.alpha.emit({ pos: [p.x, 1.2, p.z + 1], vel: [0, 0.3, 0.25], spread: 0.05, life: [3, 5], size: [1, 2], sizeEnd: 3, color: '#8a8078', alpha: 0.35 }); });
    if (m.type === 'mining' || m.type === 'treasure') st.emitters.push((dt) => { if (rnd.chance(dt * 4)) st.P.add.emit({ pos: [p.x + rnd.float(-0.6, 0.6), rnd.float(0.2, 1.6), m.z + rnd.float(-1, 0.3)], vel: [0, 0.02, 0], life: [0.4, 1], size: 1, color: m.type === 'mining' ? ['#bff4ff', '#ffffff'] : ['#fff4c8', '#ffd25e'], glow: 3, flicker: 0.6 }); });
    if (m.type === 'boss') st.emitters.push((dt) => { if (rnd.chance(dt * 6)) st.P.add.emit({ pos: [p.x + rnd.float(-0.8, 0.8), rnd.float(0, 0.5), m.z + 0.3], vel: [0, 0.3, 0.2], spread: 0.1, life: [2, 3], size: [1, 2], color: ['#c03aff', '#ff3a8a'], glow: 2.5, swirl: 0.6 }); });
  });
  st.anchors.heroStart = V(-6.4, 0, 1.6);
  st.anchors.heroCenter = V(0, 0, 1.4);
  st.camera = { ...CAM.crossroads };
  st.spread.set(6, 2.5, 3);
}

// ---------------------------------------------------------------------------- public
/**
 * Build a voxel stage. kind: arena | tomb | corridor | room | wall | campfire | crossroads.
 * opts: { tunnel, room, length, seed, npc:false, choices (crossroads) }
 */
export function buildStage(kind, regionIdx = 0, opts = {}) {
  const ri = kind === 'tomb' ? 5 : clamp(regionIdx | 0, 0, 5);
  const R = kind === 'campfire' ? CAMP : REG[ri];
  const st = new Stage(kind, ri, R);
  const B = new Plan(R, ri * 13 + 7);
  const t0 = performance.now();
  if (kind === 'arena' || kind === 'tomb') buildArena(st, B, ri, kind === 'tomb');
  else if (kind === 'room') buildRoom(st, B, ri, opts);
  else if (kind === 'wall') buildWall(st, B, ri);
  else if (kind === 'corridor') buildCorridor(st, B, ri, opts);
  else if (kind === 'campfire') buildCampfire(st, B);
  else if (kind === 'crossroads') buildCrossroads(st, B, ri, opts);
  else throw new Error('unknown stage kind ' + kind);
  st.buildMs = performance.now() - t0;
  return st;
}
export const STAGE_KINDS = ['arena', 'tomb', 'corridor', 'room', 'wall', 'campfire', 'crossroads'];
export { REG as STAGE_PALETTES };
