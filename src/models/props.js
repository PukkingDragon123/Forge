// Handcrafted props: voxel models (AO-baked, cached geometry) + low-poly toon parts + glowing bits.
// buildProp(name, opts) → THREE.Group. Dynamic props expose userData.update(dt, t),
// userData.emit(P, dt) (P = { add: ParticleSystem, alpha: ParticleSystem }) and userData.lights.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, GLOW, NOAO } from '../gfx/voxel.js';
import { toon, glow, pixelTexture } from '../gfx/materials.js';
import { FlickerLight } from '../gfx/camera.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { hash3, hash2, fbm3, noise2, mixHex, shadeHex } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

// ------------------------------------------------------------------ voxel cache
const vcache = new Map();
/** Build (or reuse) a voxel model. paint(g) fills the grid. Returns a fresh Group sharing geometry. */
export function vox(key, nx, ny, nz, size, paint, opts = {}) {
  let proto = vcache.get(key);
  if (!proto) {
    const g = new VoxelGrid(nx, ny, nz);
    paint(g);
    const m = meshVoxels(g, { size, origin: opts.origin ?? [nx / 2, 0, nz / 2], jitter: opts.jitter ?? 0.07, seed: opts.seed ?? 3, glowIntensity: opts.glowIntensity ?? 2.4 });
    proto = m.children.map((c) => { c.geometry.userData.keep = true; return { geo: c.geometry, mat: c.material, name: c.name }; });
    vcache.set(key, proto);
  }
  const grp = new THREE.Group();
  for (const p of proto) {
    const mesh = new THREE.Mesh(p.geo, p.mat);
    mesh.name = p.name;
    mesh.castShadow = p.name === 'solid' && opts.shadow !== false;
    mesh.receiveShadow = p.name === 'solid';
    grp.add(mesh);
  }
  return grp;
}

const pick = (arr, x, y, z, s = 1) => arr[Math.floor(hash3(x, y, z, s) * arr.length) % arr.length];
const WOOD = ['#6a4426', '#7a4e2c', '#835634', '#8e5e38'];
const WOOD_D = ['#4a2e1a', '#55351e', '#5e3b22'];
const IRON = ['#4a4e58', '#565a66', '#62666f'];
const ROCKS = ['#4a443e', '#55504a', '#5e5852', '#686058'];
const woodAt = (x, y, z, along = 'y', seed = 1) => {
  const a = along === 'y' ? y : along === 'x' ? x : z;
  const b = along === 'y' ? x + z * 3 : along === 'x' ? y + z * 3 : x + y * 3;
  const grain = Math.sin(a * 0.6 + b * 2.1 + hash3(b, 0, 0, seed) * 6);
  return grain > 0.65 ? WOOD_D[(b + seed) % 3] : WOOD[Math.floor(hash3(x, y, z, seed) * 4)];
};

// ------------------------------------------------------------------ flames
const FLAME_PALETTES = {
  fire: ['#ff4a12', '#ff9a2a', '#ffe08a'],
  purple: ['#7a2aff', '#c86bff', '#ffc8ff'],
  green: ['#1aa86a', '#5af0c8', '#d8fff0'],
  blue: ['#1a5aff', '#6ad8ff', '#e0f8ff'],
};
/** Stylized layered flame. Returns group with userData.update(t). */
export function makeFlame(scale = 1, palette = 'fire') {
  const pal = FLAME_PALETTES[palette] || palette;
  const g = new THREE.Group();
  const tongues = [];
  const layers = [
    { c: pal[0], i: 2.2, n: 5, r: 0.11, h: 0.42, spread: 0.07 },
    { c: pal[1], i: 2.8, n: 4, r: 0.08, h: 0.32, spread: 0.05 },
    { c: pal[2], i: 3.4, n: 2, r: 0.05, h: 0.2, spread: 0.02 },
  ];
  layers.forEach((L, li) => {
    for (let k = 0; k < L.n; k++) {
      const geo = new THREE.ConeGeometry(L.r, L.h, 5, 1);
      geo.translate(0, L.h / 2, 0);
      const m = new THREE.Mesh(geo, glow(L.c, L.i, { additive: true }));
      const a = (k / L.n) * Math.PI * 2 + li;
      m.position.set(Math.cos(a) * L.spread, 0, Math.sin(a) * L.spread);
      m.layers.set(LAYER_FX);
      m.renderOrder = 5 + li;
      m.userData.base = { h: 0.7 + hash2(k, li, 3) * 0.5, ph: hash2(k, li, 9) * 10, x: m.position.x, z: m.position.z };
      g.add(m);
      tongues.push(m);
    }
  });
  g.scale.setScalar(scale);
  g.userData.flame = (t) => {
    for (const m of tongues) {
      const b = m.userData.base;
      const n = noise2(t * 7 + b.ph, b.ph);
      m.scale.set(0.85 + n * 0.3, b.h * (0.75 + n * 0.55), 0.85 + n * 0.3);
      m.position.x = b.x + (noise2(t * 3 + b.ph, 4) - 0.5) * 0.03;
      m.rotation.y = t * 0.6 + b.ph;
      m.rotation.z = (noise2(t * 4, b.ph + 2) - 0.5) * 0.25;
    }
  };
  return g;
}

function addLight(grp, light, pos) {
  light.position.set(...pos);
  grp.add(light);
  (grp.userData.lights = grp.userData.lights || []).push(light);
  return light;
}
function chain(updates) {
  return (dt, t) => { for (const u of updates) u(dt, t); };
}
const wpos = new THREE.Vector3();
function worldOf(obj, x, y, z) { return obj.localToWorld(wpos.set(x, y, z)).toArray(); }

// ------------------------------------------------------------------ props
const BUILDERS = {
  campfire(o) {
    const grp = new THREE.Group();
    // stone ring + ash bed + logs (voxel, 0.05)
    grp.add(vox('campfire', 22, 8, 22, 0.05, (g) => {
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const cx = 11 + Math.cos(a) * 8.5, cz = 11 + Math.sin(a) * 8.5;
        g.ellipsoid(cx, 1, cz, 1.9 + hash2(i, 1, 2) * 0.6, 1.6 + hash2(i, 2, 2) * 0.7, 1.8, (x, y, z) => (y >= 2 && hash3(x, y, z, 4) > 0.6 ? '#5a6a3a' : pick(['#6a645e', '#78716a', '#5a554f', '#837b72'], x, y, z, i)));
      }
      g.ellipsoid(11, 0, 11, 7, 1.2, 7, (x, y, z) => (hash3(x, y, z, 7) > 0.82 ? GLOW | 0xff6a1a : pick(['#2a2422', '#3a3330', '#1e1a19'], x, y, z)));
      // three logs in a teepee-ish cross
      const logs = [[4, 1.5, 11, 18, 4.5, 11], [11, 1.5, 4, 11, 4.5, 18], [6, 1.5, 6, 16, 4, 16]];
      logs.forEach(([x0, y0, z0, x1, y1, z1], li) => g.line(x0, y0, z0, x1, y1, z1, 1.3, (x, y, z, t) => {
        const end = t < 0.12 || t > 0.88;
        const mid = t > 0.35 && t < 0.65;
        if (mid && hash3(x, y, z, li) > 0.5) return GLOW | 0xff7a2a;
        if (end) return hash3(x, y, z, 2) > 0.5 ? '#c8a070' : '#a8804e';
        return hash3(x, y, z, li + 3) > 0.7 ? '#2a1a12' : pick(['#5a3a22', '#4a2e1a', '#6a4426'], x, y, z);
      }));
    }, { jitter: 0.09 }));
    const flame = makeFlame(o.scale ?? 1.25, o.palette || 'fire');
    flame.position.y = 0.12;
    grp.add(flame);
    const light = addLight(grp, new FlickerLight(0xff8a3a, o.intensity ?? 7, o.distance ?? 10, { amount: 0.28, jitter: 0.06 }), [0, 0.7, 0]);
    if (o.shadow) { light.castShadow = true; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.004; light.shadow.camera.near = 0.2; }
    grp.userData.update = (dt, t) => { flame.userData.flame(t); light.tick(t); };
    grp.userData.emit = (P, dt) => {
      if (rnd.chance(dt * 26)) P.add.emit({ pos: worldOf(grp, 0, 0.35, 0), posSpread: 0.12, vel: [0, 1.3, 0], spread: 0.3, life: [0.7, 1.6], size: 1, color: ['#ffd27a', '#ff8a3a', '#fff0b0'], colorEnd: '#ff3a1a', glow: 3, drag: 0.5, flicker: 0.3, swirl: 1.5 });
      if (rnd.chance(dt * 4)) P.alpha.emit({ pos: worldOf(grp, 0, 0.9, 0), posSpread: 0.1, vel: [0.05, 0.45, 0], spread: 0.08, life: [2, 3.5], size: [1, 2], sizeEnd: 3, color: '#4a4040', alpha: 0.35, fadeIn: 0.5 });
    };
    return grp;
  },

  tent(o) {
    const c = o.color || '#c8a46a';
    const c2 = shadeHex(c, -0.25), c3 = shadeHex(c, 0.15);
    const patch = o.patch || '#8a5a8a';
    return vox('tent' + c, 30, 20, 22, 0.075, (g) => {
      for (let z = 1; z < 21; z++) for (let y = 0; y < 18; y++) {
        const half = Math.round((18 - y) * 0.78);
        for (let x = 15 - half; x <= 15 + half; x++) {
          const edge = Math.abs(x - 15) >= half - 1;
          const front = z === 20 || z === 1;
          if (!edge && !front) continue;
          if (z === 20 && Math.abs(x - 15) < half - 1 && y < 13 && Math.abs(x - 15) < 5 - y * 0.25) { g.set(x, y, z, '#1a120e'); continue; } // opening
          let col = x < 15 ? c : c2;
          if (Math.abs(x - 15) === half - 1 && edge) col = x < 15 ? c3 : c;
          if (z % 6 === 0 && edge) col = shadeHex(col, -0.12); // seams
          if (x < 15 && y > 5 && y < 10 && z > 8 && z < 13 && edge) col = patch;
          g.set(x, y, z, col);
        }
      }
      // interior back + bedroll peeking
      g.box(11, 0, 2, 19, 1, 19, '#3a2a20');
      g.box(13, 1, 12, 17, 2, 19, '#9a3a3a');
      // poles + ridge
      for (const z of [0, 21]) g.box(15, 0, z, 16, 19, z + 1, '#5a3a22');
      g.box(15, 18, 0, 16, 19, 22, '#6a4426');
      // stakes + ropes
      for (const [sx, sz] of [[1, 0], [28, 0], [1, 21], [28, 21]]) { g.box(sx, 0, sz, sx + 1, 2, sz + 1, '#4a2e1a'); }
    }, { jitter: 0.05 });
  },

  sleepingbag(o) {
    const c = o.color || '#b04a3a';
    const k = 'bag' + c;
    return vox(k, 12, 4, 30, 0.055, (g) => {
      g.box(1, 0, 0, 11, 1, 30, shadeHex(c, -0.35));
      for (let z = 0; z < 30; z++) for (let x = 1; x < 11; x++) {
        const h = 2 + (Math.sin((x - 1) / 9 * Math.PI) > 0.4 ? 1 : 0);
        for (let y = 1; y < h; y++) g.set(x, y, z, z % 5 === 0 ? shadeHex(c, -0.15) : c);
      }
      g.box(1, 1, 0, 11, 3, 6, shadeHex(c, 0.25)); // folded top
      g.box(3, 2, 1, 9, 4, 5, '#e8dcc0'); // pillow
      g.box(10, 1, 6, 11, 3, 28, '#d8b060'); // zipper
    }, { jitter: 0.05 });
  },

  backpack(o) {
    const c = o.color || '#7a5a2a';
    return vox('pack' + c, 14, 20, 11, 0.04, (g) => {
      g.ellipsoid(7, 7, 5.5, 6, 7.5, 4.6, (x, y, z) => (hash3(x, y, z, 2) > 0.85 ? shadeHex(c, -0.15) : c));
      g.box(1, 0, 1, 13, 4, 10, (x, y, z) => (y === 3 ? shadeHex(c, -0.3) : shadeHex(c, -0.1)));
      // flap + buckle
      g.box(2, 9, 8, 12, 15, 11, shadeHex(c, 0.12));
      g.box(6, 9, 10, 8, 11, 11, '#e0b85a');
      // straps
      g.box(3, 2, 10, 4, 14, 11, '#4a2e1a'); g.box(10, 2, 10, 11, 14, 11, '#4a2e1a');
      // bedroll on top
      g.line(0, 16, 5, 13, 16, 5, 2.2, (x, y, z) => (x % 4 === 0 ? '#5a3a22' : '#3a6a8a'));
      // side pocket + cup
      g.box(0, 4, 3, 2, 9, 8, shadeHex(c, -0.2));
      g.cylinderY(13, 3, 3, 7, 1.6, 1.6, (x, y) => (y === 6 ? '#c8c8c8' : '#9aa0aa'));
    }, { jitter: 0.06 });
  },

  lantern(o) {
    const grp = new THREE.Group();
    const col = o.glow || '#ffc060';
    const lan = vox('lantern' + col, 9, 13, 9, 0.028, (g) => {
      g.box(1, 0, 1, 8, 2, 8, '#3a3434');
      g.box(1, 9, 1, 8, 10, 8, '#3a3434');
      g.box(2, 10, 2, 7, 11, 7, '#4a4444');
      g.box(3, 11, 3, 6, 12, 6, '#2a2626');
      g.box(4, 12, 4, 5, 13, 5, '#5a5050');
      for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7]]) g.box(x, 2, z, x + 1, 9, z + 1, '#2e2a2a');
      g.box(2, 2, 2, 7, 9, 7, (x, y) => GLOW | parseInt((y > 6 ? '#fff0c0' : col).slice(1), 16));
    }, { jitter: 0.03, shadow: false });
    // origin = hook point when hanging (chain goes down), else the lantern sits on the ground
    lan.position.y = o.hang ? -(o.hang + 0.37) : 0;
    grp.add(lan);
    if (o.hang) {
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, o.hang, 4), toon('#2a2626'));
      ch.position.y = -o.hang / 2;
      grp.add(ch);
    }
    if (o.light !== false) {
      const L = addLight(grp, new FlickerLight(new THREE.Color(col), o.intensity ?? 1.8, o.distance ?? 4.5, { amount: 0.12, speed: 5, jitter: 0.01 }), [0, lan.position.y + 0.16, 0]);
      grp.userData.update = (dt, t) => { L.tick(t); if (o.hang) grp.rotation.z = Math.sin(t * 1.3 + grp.id) * 0.04; };
    }
    return grp;
  },

  cookpot(o) {
    const grp = new THREE.Group();
    const top = new THREE.Vector3(0, 0.95, 0), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const foot = new THREE.Vector3(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
      const dir = top.clone().sub(foot);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, dir.length() + 0.08, 5), toon('#5a3a22'));
      m.position.copy(foot).add(top).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(up, dir.normalize());
      m.castShadow = true;
      grp.add(m);
    }
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 3), toon('#2a2626'));
    hook.position.y = 0.76;
    grp.add(hook);
    const pot = vox('cookpot', 12, 9, 12, 0.03, (g) => {
      g.ellipsoid(6, 4.5, 6, 5.6, 4.6, 5.6, (x, y, z) => (y > 7 ? null : pick(['#2a2a2e', '#323238', '#26262a'], x, y, z)));
      g.ellipsoid(6, 7, 6, 4.4, 1, 4.4, (x, y, z) => (hash3(x, y, z, 5) > 0.7 ? '#e0a050' : '#b8642a'));
      g.box(5, 8, 0, 7, 9, 12, '#3a3a40');
    }, { jitter: 0.05 });
    pot.position.set(0, 0.34, 0);
    grp.add(pot);
    grp.userData.emit = (P, dt) => {
      if (rnd.chance(dt * 6)) P.alpha.emit({ pos: worldOf(grp, 0, 0.55, 0), posSpread: 0.08, vel: [0.02, 0.35, 0], spread: 0.05, life: [1.5, 2.8], size: [1, 2], sizeEnd: 3, color: '#e8e0d8', alpha: 0.28, fadeIn: 0.4 });
    };
    return grp;
  },

  map(o) {
    const c = document.createElement('canvas');
    c.width = 48; c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = '#e8d3a3'; x.fillRect(0, 0, 48, 32);
    for (let i = 0; i < 90; i++) { x.fillStyle = hash2(i, 1, 3) > 0.5 ? '#d9bd85' : '#efdcae'; x.fillRect(hash2(i, 2, 3) * 48 | 0, hash2(i, 3, 3) * 32 | 0, 2, 1); }
    x.fillStyle = '#7a4f26';
    for (let i = 0; i < 48; i++) { x.fillRect(i, 0, 1, 1); x.fillRect(i, 31, 1, 1); }
    // tunnels
    x.fillStyle = '#4a3220';
    let px = 4, py = 6;
    for (let i = 0; i < 40; i++) { x.fillRect(px, py, 1, 1); px += 1; py += Math.round(Math.sin(i * 0.5) * 0.8 + 0.25); if (py > 28) py = 28; }
    for (let i = 0; i < 18; i++) x.fillRect(20 + Math.round(Math.sin(i * 0.4) * 2), 8 + i, 1, 1);
    x.fillStyle = '#c03a2a'; x.fillRect(38, 22, 3, 1); x.fillRect(39, 21, 1, 3);
    x.fillStyle = '#3a6a8a'; x.fillRect(10, 18, 5, 3);
    const tex = pixelTexture(c);
    const grp = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.012, 0.48), [toon('#d9bd85'), toon('#d9bd85'), new THREE.MeshLambertMaterial({ map: tex }), toon('#d9bd85'), toon('#d9bd85'), toon('#d9bd85')]);
    m.position.y = 0.01; m.receiveShadow = true;
    grp.add(m);
    for (const [sx, sz] of [[-0.33, -0.21], [0.33, 0.21]]) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0), toon('#6a645e', { steps: 3 }));
      r.position.set(sx, 0.04, sz); r.castShadow = true;
      grp.add(r);
    }
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.48, 6), toon('#d9bd85'));
    roll.rotation.x = Math.PI / 2; roll.position.set(0.38, 0.03, 0);
    grp.add(roll);
    return grp;
  },

  pickaxe() {
    return vox('pickaxe', 18, 26, 4, 0.03, (g) => {
      g.line(9, 0, 2, 9, 22, 2, 0.5, (x, y) => (y < 4 ? '#3a2416' : woodAt(x, y, 2, 'y')));
      for (let i = -8; i <= 8; i++) {
        const y = 22 + Math.round(2.4 - (i * i) / 22);
        const c = Math.abs(i) > 6 ? '#c8ccd4' : '#7a7e88';
        g.box(9 + i, y, 1, 10 + i, y + 2, 3, Math.abs(i) < 2 ? '#4a4e58' : c);
      }
    }, { jitter: 0.05, origin: [9, 0, 2] });
  },

  shovel() {
    return vox('shovel', 8, 28, 4, 0.03, (g) => {
      g.line(4, 8, 2, 4, 27, 2, 0.5, (x, y) => woodAt(x, y, 2, 'y'));
      g.box(2, 26, 1, 7, 27, 3, '#5a3a22');
      for (let y = 0; y < 9; y++) { const w = y < 2 ? 1 + y : 3; g.box(4 - w, y, 1, 5 + w, y + 1, 3, y < 3 ? '#a8acb4' : '#7a7e88'); }
    }, { jitter: 0.05, origin: [4, 0, 2] });
  },

  crate(o) {
    const s = o.size || 10;
    return vox('crate' + s + (o.label || ''), s, s, s, 0.06, (g) => {
      g.box(0, 0, 0, s, s, s, (x, y, z) => {
        const edge = (x === 0 || x === s - 1) + (y === 0 || y === s - 1) + (z === 0 || z === s - 1);
        if (edge >= 2) return '#4a2e1a';
        const diag = (x === y || x === s - 1 - y) && (z === 0 || z === s - 1);
        if (diag) return '#5e3b22';
        if (y % 3 === 0 && (x === 0 || z === 0 || x === s - 1 || z === s - 1)) return '#3a2414';
        return woodAt(x, y, z, 'x', 5);
      });
      if (o.label) g.box(3, 3, s - 1, s - 3, s - 3, s, '#c8a060');
      for (const [x, y] of [[1, 1], [s - 2, 1], [1, s - 2], [s - 2, s - 2]]) g.set(x, y, s - 1, '#9aa0aa');
    }, { jitter: 0.06 });
  },

  barrel(o) {
    const lid = o.content || 'wood';
    return vox('barrel' + lid, 12, 15, 12, 0.055, (g) => {
      g.cylinderY(6, 6, 0, 15, 5.2, 5.2, (x, y, z) => {
        const bulge = Math.sin((y / 14) * Math.PI);
        const r = Math.hypot(x + 0.5 - 6, z + 0.5 - 6);
        if (r > 4.6 + bulge * 1.1) return null;
        if (y === 2 || y === 12) return IRON[(x + z) % 3];
        const ang = Math.atan2(z - 6, x - 6);
        return Math.floor((ang + 4) * 3) % 2 ? '#7a4e2c' : '#6a4426';
      });
      g.cylinderY(6, 6, 14, 15, 4.2, 4.2, lid === 'water' ? GLOW | 0x3a8ac0 : lid === 'ore' ? '#8e8a92' : '#5e3b22');
    }, { jitter: 0.05 });
  },

  minecart(o) {
    const ore = o.ore || '#8e8a92';
    const k = 'cart' + ore + (o.empty ? 'e' : '');
    return vox(k, 22, 15, 14, 0.055, (g) => {
      for (let y = 3; y < 13; y++) {
        const inset = Math.floor((13 - y) * 0.25);
        g.box(1 + inset, y, 1 + inset * 0.5, 21 - inset, y + 1, 13 - inset * 0.5, (x, yy, z) => {
          const wall = x <= 1 + inset || x >= 20 - inset || z <= 1 + inset * 0.5 || z >= 12 - inset * 0.5;
          if (!wall && y > 3) return null;
          if (y === 12 || y === 3) return '#3a3a40';
          if ((x - 1) % 5 === 0) return '#2e2e34';
          return hash3(x, yy, z, 9) > 0.8 ? '#8a4a2a' : pick(['#5a5a62', '#62626a', '#6a5a52'], x, yy, z);
        });
      }
      for (const [x, z] of [[4, 1], [17, 1], [4, 12], [17, 12]]) {
        g.ellipsoid(x + 0.5, 2.2, z + 0.5, 2.2, 2.2, 0.8, (xx, y, zz) => (Math.hypot(xx + 0.5 - x - 0.5, y + 0.5 - 2.2) < 1 ? '#8a8a92' : '#26262a'));
      }
      if (!o.empty) g.ellipsoid(11, 11.5, 7, 8.5, 3.5, 5, (x, y, z) => (y < 11 ? null : hash3(x, y, z, 3) > 0.86 ? GLOW | parseInt(shadeHex(ore, 0.3).slice(1), 16) : pick([ore, shadeHex(ore, -0.2), '#4a443e'], x, y, z)));
    }, { jitter: 0.07 });
  },

  rails(o) {
    const L = o.length || 6;
    const grp = new THREE.Group();
    const slp = new THREE.BoxGeometry(0.12, 0.05, 0.56);
    const n = Math.max(1, Math.floor(L / 0.42));
    const inst = new THREE.InstancedMesh(slp, toon('#5a3a22'), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeRotationY((hash2(i, 1, 7) - 0.5) * 0.18);
      m.setPosition(-L / 2 + (i + 0.5) * (L / n), 0.025, (hash2(i, 2, 7) - 0.5) * 0.04);
      inst.setMatrixAt(i, m);
    }
    inst.receiveShadow = true; inst.castShadow = true;
    grp.add(inst);
    for (const z of [-0.18, 0.18]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.04), toon('#7a7a84'));
      r.position.set(0, 0.075, z); r.castShadow = true;
      grp.add(r);
      const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.012, 0.02), toon('#c8ccd4'));
      top.position.set(0, 0.102, z);
      grp.add(top);
    }
    return grp;
  },

  support(o) {
    const w = o.width || 22, h = o.height || 30;
    return vox('support' + w + 'x' + h + (o.lamp ? 'l' : ''), w + 2, h + 2, 4, 0.08, (g) => {
      g.box(1, 0, 1, 3, h, 3, (x, y, z) => woodAt(x, y, z, 'y', 2));
      g.box(w - 1, 0, 1, w + 1, h, 3, (x, y, z) => woodAt(x, y, z, 'y', 3));
      g.box(0, h - 2, 0, w + 2, h + 1, 4, (x, y, z) => woodAt(x, y, z, 'x', 4));
      // braces
      g.line(3, h - 7, 2, 8, h - 2, 2, 0.6, (x, y, z) => woodAt(x, y, z, 'x', 6));
      g.line(w - 1, h - 7, 2, w - 6, h - 2, 2, 0.6, (x, y, z) => woodAt(x, y, z, 'x', 7));
      // iron brackets
      for (const x of [1, w - 1]) g.box(x, h - 3, 0, x + 2, h - 2, 4, '#3a3a40');
      g.box(1, 0, 0, 3, 1, 4, '#3a3a40'); g.box(w - 1, 0, 0, w + 1, 1, 4, '#3a3a40');
    }, { jitter: 0.06, origin: [(w + 2) / 2, 0, 2] });
  },

  crystal(o) {
    const col = o.color || '#6ad8ff';
    const s = o.size || 1;
    const grp = new THREE.Group();
    const h = 0.5 * s, r = 0.09 * s;
    const mat = crystalMat(col);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 6, 1), mat);
    body.position.y = h / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.2, 6, 1), mat);
    tip.position.y = h + r * 1.1;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, h * 0.9, 6), glow(shadeHex(col, 0.5), 3));
    core.position.y = h * 0.5;
    grp.add(body, tip, core);
    body.castShadow = tip.castShadow = true;
    if (o.light) addLight(grp, new THREE.PointLight(new THREE.Color(col), o.light, 3.5 * s, 1.6), [0, h * 0.8, 0.15]);
    return grp;
  },

  crystalcluster(o) {
    const col = o.color || '#6ad8ff';
    const col2 = o.color2 || col;
    const s = o.size || 1;
    const grp = new THREE.Group();
    grp.add(BUILDERS.rock({ size: 0.7 * s, tone: o.rock }));
    const n = o.count || 5;
    for (let i = 0; i < n; i++) {
      const c = BUILDERS.crystal({ color: i % 2 ? col2 : col, size: s * (0.5 + hash2(i, n, 3) * 0.8) });
      const a = (i / n) * Math.PI * 2 + hash2(i, 2, 3);
      c.position.set(Math.cos(a) * 0.14 * s, 0.05 * s, Math.sin(a) * 0.12 * s);
      c.rotation.set(Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5);
      grp.add(c);
    }
    if (o.light !== 0) addLight(grp, new THREE.PointLight(new THREE.Color(col), o.light ?? 2.2, 4 * s, 1.5), [0, 0.5 * s, 0.25 * s]);
    return grp;
  },

  rock(o) {
    const s = o.size || 1;
    const tone = o.tone || ROCKS;
    const seed = o.seed ?? 1;
    const n = Math.round(10 * s) + 2;
    const key = 'rock' + n + seed + tone.join('') + (o.moss || '');
    return vox(key, n + 2, n, n + 2, 0.06, (g) => {
      const c = (n + 2) / 2;
      g.ellipsoid(c, n * 0.36, c, n * 0.5, n * 0.42, n * 0.45, (x, y, z) => {
        const d = fbm3(x * 0.25, y * 0.25, z * 0.25, 2, seed) ;
        if (d < 0.3) return null;
        if (o.moss && y > n * 0.5 && hash3(x, y, z, 2) > 0.4) return o.moss;
        return pick(tone, x, y, z, seed);
      });
    }, { jitter: 0.08 });
  },

  stalactite(o) {
    const h = o.length || 14;
    const tone = o.tone || ROCKS;
    const tipc = o.tip;
    return vox('stal' + h + tone[0] + (tipc || ''), 7, h, 7, 0.07, (g) => {
      for (let y = 0; y < h; y++) {
        const r = 3.2 * (1 - y / h) + 0.4;
        g.ellipsoid(3.5, h - y - 0.5, 3.5, r, 0.6, r, (x, yy, z) => (tipc && y > h - 4 ? GLOW | parseInt(tipc.slice(1), 16) : pick(tone, x, yy, z, 4)));
      }
    }, { jitter: 0.08, origin: [3.5, h, 3.5] });
  },

  mushroom(o) {
    const giant = !!o.giant;
    const cap = o.color || '#d04a3a';
    const glowc = o.glow || null;
    const grp = new THREE.Group();
    if (giant) {
      const H = o.height || 26, R = o.radius || 12;
      grp.add(vox('gmush' + cap + (glowc || '') + H + R, R * 2 + 2, H + 8, R * 2 + 2, 0.11, (g) => {
        const c = R + 1;
        g.cylinderY(c, c, 0, H, 2.6, 1.8, (x, y, z) => (hash3(x, y, z, 1) > 0.8 ? '#c8b898' : '#e0d4b8'));
        g.cylinderY(c, c, 0, 3, 4, 2.8, '#bfae8e');
        g.cylinderY(c, c, H - 6, H - 4, 2.6, 3.4, '#f0e8d8'); // ring skirt
        // cap dome
        g.ellipsoid(c, H + 1, c, R, 5.5, R, (x, y, z) => {
          if (y < H) return null;
          const spot = fbm3(x * 0.45, y * 0.45, z * 0.45, 1, 7) > 0.7;
          if (spot) return glowc ? GLOW | parseInt(shadeHex(glowc, 0.4).slice(1), 16) : '#f0e8d8';
          return y > H + 3 ? shadeHex(cap, 0.12) : cap;
        });
        // gills underside
        g.ellipsoid(c, H, c, R - 1, 1, R - 1, (x, y, z) => (Math.hypot(x - c, z - c) < 2.5 ? null : glowc ? GLOW | parseInt(glowc.slice(1), 16) : shadeHex(cap, -0.35)));
      }, { jitter: 0.06 }));
      if (glowc) addLight(grp, new THREE.PointLight(new THREE.Color(glowc), o.light ?? 2.5, R * 0.35, 1.4), [0, (H - 1) * 0.11, 0]);
    } else {
      grp.add(vox('smush' + cap + (glowc || ''), 9, 8, 9, 0.03, (g) => {
        const defs = [[4.5, 4.5, 6, 2.6], [2, 6.5, 4, 1.8], [7, 2.5, 3, 1.4]];
        for (const [x, z, h, r] of defs) {
          g.cylinderY(x, z, 0, h, 0.7, 0.6, '#e8dcc0');
          g.ellipsoid(x, h, z, r, 1.3, r, (xx, y) => (y < h ? null : glowc ? GLOW | parseInt(glowc.slice(1), 16) : cap));
        }
      }, { jitter: 0.04, shadow: false }));
    }
    return grp;
  },

  anvil() {
    return vox('anvil', 22, 16, 10, 0.04, (g) => {
      // stump
      g.cylinderY(11, 5, 0, 7, 4.6, 4.2, (x, y, z) => (y === 6 ? (Math.hypot(x - 11, z - 5) % 2 < 1 ? '#a8804e' : '#c8a070') : woodAt(x, y, z, 'y')));
      g.box(7, 7, 3, 15, 9, 7, '#2a2a30');
      g.box(9, 9, 3.5, 13, 11, 6.5, '#33333a');
      g.box(4, 11, 2, 18, 14, 8, (x, y) => (y === 13 ? '#7a7e8a' : '#3a3a42'));
      for (let i = 0; i < 4; i++) g.box(18 + i, 12 + Math.floor(i / 3), 3 + i * 0.4, 19 + i, 14 - Math.floor(i / 2), 7 - i * 0.4, y => '#3a3a42');
      g.box(2, 12, 3, 4, 14, 7, '#33333a');
    }, { jitter: 0.04 });
  },

  forge(o) {
    const grp = new THREE.Group();
    grp.add(vox('forge', 24, 22, 16, 0.05, (g) => {
      // brick body
      g.box(1, 0, 1, 23, 10, 15, (x, y, z) => {
        const brick = (y % 3 === 0) || ((x + (Math.floor(y / 3) % 2) * 2) % 4 === 0 && (z === 1 || z === 14 || x === 1 || x === 22));
        return brick ? '#3a2a24' : pick(['#8a4a32', '#9a5638', '#7a4230'], x, y, z, 2);
      });
      // coal bed (glowing)
      g.box(3, 10, 3, 21, 11, 13, (x, y, z) => (hash3(x, y, z, 4) > 0.45 ? GLOW | (hash3(x, y, z, 5) > 0.6 ? 0xffb040 : 0xff5a1a) : '#2a2222'));
      g.box(1, 10, 1, 23, 12, 3, '#6a3a28'); g.box(1, 10, 13, 23, 12, 15, '#6a3a28');
      // hood + chimney
      g.box(3, 16, 4, 21, 17, 12, '#3a3a42');
      g.box(9, 17, 6, 15, 22, 10, (x, y) => (y === 21 ? '#26262a' : '#4a4a52'));
      for (const x of [3, 20]) g.box(x, 11, 4, x + 1, 16, 5, '#2a2a30');
      // bellows
      g.box(0, 3, 4, 1, 7, 12, '#5a3420');
    }, { jitter: 0.06 }));
    const L = addLight(grp, new FlickerLight(0xff7a2a, o.intensity ?? 4, 6, { amount: 0.22 }), [0, 0.75, 0.3]);
    grp.userData.update = (dt, t) => L.tick(t);
    grp.userData.emit = (P, dt) => {
      if (rnd.chance(dt * 10)) P.add.emit({ pos: worldOf(grp, rnd.float(-0.4, 0.4), 0.58, rnd.float(-0.2, 0.2)), vel: [0, 0.9, 0], spread: 0.35, life: [0.5, 1.1], size: 1, color: ['#ffd27a', '#ff8a3a'], glow: 3, drag: 0.4 });
      if (rnd.chance(dt * 3)) P.alpha.emit({ pos: worldOf(grp, 0, 1.15, 0), posSpread: 0.05, vel: [0.04, 0.5, 0], spread: 0.05, life: [2, 3], size: [1, 2], sizeEnd: 3, color: '#3a3434', alpha: 0.4 });
    };
    return grp;
  },

  chest(o) {
    const kind = o.kind || 'wood';
    const P = {
      wood: { body: WOOD, band: '#3a3a40', trim: '#c8a040', inside: 0xffd060 },
      iron: { body: ['#4a4e58', '#565a66', '#5e626c'], band: '#2a2a30', trim: '#9aa3b2', inside: 0xffd060 },
      crystal: { body: ['#2a3a6a', '#324478', '#3a4e88'], band: '#6ad8ff', trim: '#e0f8ff', inside: 0x9ae8ff, glowBand: true },
      bone: { body: ['#d8d0c0', '#c8c0b0', '#e0d8c8'], band: '#5a3a6a', trim: '#c86bff', inside: 0xc86bff, glowTrim: true },
      gold: { body: ['#7a3a2a', '#8a4430', '#6a3022'], band: '#e0b040', trim: '#fff0a0', inside: 0xffe08a },
    }[kind];
    const grp = new THREE.Group();
    const bodyCol = (x, y, z) => pick(P.body, x, y, z, 6);
    const base = vox('chestB' + kind, 18, 10, 12, 0.05, (g) => {
      g.box(0, 0, 0, 18, 9, 12, (x, y, z) => {
        if (x === 0 || x === 17 || z === 0 || z === 11) { if (x % 6 === 2 || y === 0) return P.glowBand ? GLOW | parseInt(P.band.slice(1), 16) : P.band; }
        return bodyCol(x, y, z);
      });
      g.box(1, 4, 1, 17, 9, 11, (x, y, z) => (y === 8 ? GLOW | P.inside : '#1a120e')); // interior (lid hides it)
      g.box(8, 4, 11, 10, 7, 12, P.glowTrim ? GLOW | parseInt(P.trim.slice(1), 16) : P.trim); // lock plate
      g.set(9, 5, 12, '#140c10');
      if (kind === 'bone') { g.ellipsoid(3, 4, 11.5, 1.6, 1.6, 0.8, '#efe6d0'); g.ellipsoid(15, 4, 11.5, 1.6, 1.6, 0.8, '#efe6d0'); }
      if (kind === 'crystal') for (const x of [2, 15]) g.box(x, 9, 2, x + 2, 11, 4, GLOW | 0x9ae8ff);
      if (kind === 'gold') for (const x of [4, 13]) g.box(x, 6, 11, x + 1, 7, 12, GLOW | 0xff4a6a);
    }, { jitter: 0.05 });
    grp.add(base);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.45, -0.3);
    const lid = vox('chestL' + kind, 18, 6, 12, 0.05, (g) => {
      for (let z = 0; z < 12; z++) for (let x = 0; x < 18; x++) {
        const h = 2 + Math.round(Math.sin((z / 11) * Math.PI) * 3);
        for (let y = 0; y < h; y++) {
          const band = x % 6 === 2 || x === 0 || x === 17;
          g.set(x, y, z, band ? (P.glowBand ? GLOW | parseInt(P.band.slice(1), 16) : P.band) : bodyCol(x, y, z));
        }
      }
      g.box(8, 0, 11, 10, 2, 12, P.trim);
    }, { jitter: 0.05, origin: [9, 0, 0] });
    lidPivot.add(lid);
    grp.add(lidPivot);
    const inner = new THREE.PointLight(P.inside, 0, 1.6, 2);
    inner.position.set(0, 0.6, 0);
    grp.add(inner);
    grp.userData.lights = [inner];
    grp.userData.lid = lidPivot;
    grp.userData.open = (t) => { lidPivot.rotation.x = -t * 1.9; inner.intensity = t * 1.2; };
    return grp;
  },

  torch(o) {
    const grp = new THREE.Group();
    grp.add(vox('torch', 6, 14, 6, 0.03, (g) => {
      g.box(2, 0, 2, 4, 10, 4, (x, y, z) => woodAt(x, y, z, 'y'));
      g.box(1, 9, 1, 5, 12, 5, '#3a3a40');
      g.box(1, 4, 0, 5, 5, 2, '#3a3a40');
    }, { jitter: 0.05, origin: [3, 0, 3] }));
    const f = makeFlame(0.45, o.palette || 'fire');
    f.position.y = 0.36;
    grp.add(f);
    const col = o.palette === 'purple' ? 0xc86bff : o.palette === 'green' ? 0x5af0c8 : 0xff9a4a;
    const L = addLight(grp, new FlickerLight(col, o.intensity ?? 2.4, o.distance ?? 6, { amount: 0.3 }), [0, 0.5, 0.15]);
    grp.userData.update = (dt, t) => { f.userData.flame(t); L.tick(t); };
    grp.userData.emit = (P, dt) => { if (rnd.chance(dt * 6)) P.add.emit({ pos: worldOf(grp, 0, 0.5, 0), vel: [0, 0.8, 0], spread: 0.15, life: [0.4, 0.9], size: 1, color: o.palette === 'purple' ? ['#e0a0ff', '#c86bff'] : ['#ffd27a', '#ff8a3a'], glow: 3 }); };
    return grp;
  },

  brazier(o) {
    const pal = o.palette || 'fire';
    const grp = new THREE.Group();
    grp.add(vox('brazier' + (o.tone || 'iron'), 12, 16, 12, 0.05, (g) => {
      for (const [x, z] of [[2, 2], [9, 2], [2, 9], [9, 9]]) g.line(x, 0, z, 6 + (x - 6) * 0.4, 10, 6 + (z - 6) * 0.4, 0.6, '#2e2a30');
      g.cylinderY(6, 6, 10, 15, 3.2, 5.6, (x, y, z) => (y === 14 ? '#6a6070' : y === 11 ? (o.tone === 'gold' ? '#d8a840' : '#5a5260') : '#3a343e'));
      g.cylinderY(6, 6, 14, 15, 4.4, 4.4, (x, y, z) => (hash3(x, y, z, 3) > 0.5 ? GLOW | (pal === 'purple' ? 0xc86bff : 0xff6a1a) : '#1a1418'));
    }, { jitter: 0.05 }));
    const f = makeFlame(0.9, pal);
    f.position.y = 0.76;
    grp.add(f);
    const col = pal === 'purple' ? 0xc86bff : pal === 'green' ? 0x5af0c8 : pal === 'blue' ? 0x6ad8ff : 0xff8a3a;
    const L = addLight(grp, new FlickerLight(col, o.intensity ?? 4, o.distance ?? 7, { amount: 0.3 }), [0, 1.1, 0.1]);
    grp.userData.update = (dt, t) => { f.userData.flame(t); L.tick(t); };
    grp.userData.emit = (P, dt) => { if (rnd.chance(dt * 12)) P.add.emit({ pos: worldOf(grp, 0, 0.95, 0), posSpread: 0.1, vel: [0, 1.1, 0], spread: 0.25, life: [0.5, 1.2], size: 1, color: pal === 'purple' ? ['#e0a0ff', '#c86bff', '#ff8af0'] : ['#ffd27a', '#ff8a3a'], glow: 3, drag: 0.5 }); };
    return grp;
  },

  pillar(o) {
    const h = o.height || 32;
    const tone = o.tone || ['#7a6a52', '#8a7a5e', '#6e5e48', '#94846a'];
    const broken = !!o.broken;
    return vox('pillar' + h + tone[0] + broken + (o.rune || ''), 12, h + 1, 12, 0.1, (g) => {
      g.box(0, 0, 0, 12, 3, 12, (x, y, z) => (y === 2 ? tone[3] : pick(tone, x, y, z, 2)));
      const top = broken ? Math.floor(h * 0.62) : h - 3;
      for (let y = 3; y < top; y++) {
        g.cylinderY(6, 6, y, y + 1, 4.3, 4.3, (x, yy, z) => {
          const a = Math.atan2(z - 6, x - 6);
          const flute = Math.floor((a + Math.PI) / (Math.PI / 6)) % 2 === 0;
          if (o.rune && y % 7 === 3 && flute) return GLOW | parseInt(o.rune.slice(1), 16);
          return flute ? tone[1] : tone[2];
        });
      }
      if (broken) {
        for (let x = 1; x < 11; x++) for (let z = 1; z < 11; z++) { const t = top + Math.floor(hash2(x, z, 3) * 3); for (let y = top; y < t; y++) if (Math.hypot(x - 6, z - 6) < 4.3) g.set(x, y, z, tone[2]); }
      } else {
        g.box(1, h - 3, 1, 11, h - 1, 11, tone[1]);
        g.box(0, h - 1, 0, 12, h + 1, 12, (x, y, z) => (y === h ? tone[3] : tone[0]));
      }
    }, { jitter: 0.06 });
  },

  statue(o) {
    const tone = o.tone || ['#8a7a5e', '#7a6a52', '#9a8a6e'];
    const eye = o.eye || '#4affe0';
    return vox('statue' + tone[0] + eye, 16, 34, 12, 0.08, (g) => {
      g.box(1, 0, 1, 15, 4, 11, (x, y, z) => (y === 3 ? tone[2] : tone[1]));
      // robed figure
      for (let y = 4; y < 22; y++) { const r = 5.5 - (y - 4) * 0.12; g.ellipsoid(8, y + 0.5, 6, r, 0.6, r * 0.75, (x, yy, z) => pick(tone, x, yy, z, 4)); }
      g.ellipsoid(8, 22, 6, 4.6, 2.2, 3.4, tone[0]); // shoulders
      g.ellipsoid(8, 26, 6, 3, 3.2, 3, tone[2]); // head
      g.box(5, 28, 4, 11, 30, 8, tone[1]); // hood/crown
      g.set(7, 26, 9, GLOW | parseInt(eye.slice(1), 16)); g.set(9, 26, 9, GLOW | parseInt(eye.slice(1), 16));
      // arms holding a sword downward
      g.box(4, 14, 7, 12, 17, 9, tone[0]);
      g.box(7.5, 5, 8, 8.5, 15, 9, '#6a6a72');
      g.box(6, 15, 8, 10, 16, 9, '#c8a040');
      // cracks & moss
      for (let i = 0; i < 20; i++) { const x = Math.floor(hash2(i, 1, 8) * 16), y = Math.floor(hash2(i, 2, 8) * 30); if (g.solid(x, y, 9)) g.set(x, y, 9, '#4a5a2a'); }
    }, { jitter: 0.06 });
  },

  sarcophagus(o) {
    const rune = o.rune || '#c86bff';
    return vox('sarc' + rune, 14, 10, 30, 0.07, (g) => {
      g.box(0, 0, 0, 14, 6, 30, (x, y, z) => (y === 0 ? '#2a2436' : x === 0 || x === 13 ? ((z % 5 === 2 && y === 3) ? GLOW | parseInt(rune.slice(1), 16) : '#4a425a') : '#3a3448'));
      g.box(1, 6, 1, 13, 8, 29, '#52496a');
      // carved figure on lid
      g.ellipsoid(7, 8, 22, 3, 1.5, 3.2, '#5e5478');
      g.box(5, 8, 6, 9, 9, 19, '#5a5072');
      g.box(4, 8, 13, 10, 9, 15, '#5e5478');
      g.set(6, 9, 24, GLOW | parseInt(rune.slice(1), 16)); g.set(8, 9, 24, GLOW | parseInt(rune.slice(1), 16));
      g.box(1, 8, 26, 13, 9, 29, (x) => (x % 3 === 0 ? GLOW | parseInt(rune.slice(1), 16) : '#463e58'));
    }, { jitter: 0.05 });
  },

  chains(o) {
    const L = o.length || 2;
    const grp = new THREE.Group();
    const link = new THREE.TorusGeometry(0.045, 0.014, 4, 6);
    const n = Math.floor(L / 0.07);
    const inst = new THREE.InstancedMesh(link, toon(o.color || '#5a5260'), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      q.setFromEuler(e.set(0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2));
      m.compose(p.set(0, -i * 0.07, 0), q, s);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = true;
    grp.add(inst);
    grp.userData.update = (dt, t) => { grp.rotation.z = Math.sin(t * 0.8 + grp.id) * 0.03; };
    return grp;
  },

  bones() {
    return vox('bones', 20, 7, 16, 0.04, (g) => {
      const B = ['#efe6d0', '#e0d6bc', '#d4c8aa'];
      const bone = (x0, z0, x1, z1, y) => { g.line(x0, y, z0, x1, y, z1, 0.6, (x, yy, z) => pick(B, x, yy, z)); g.sphere(x0, y, z0, 1.2, B[0]); g.sphere(x1, y, z1, 1.2, B[1]); };
      bone(2, 3, 12, 6, 1); bone(6, 12, 15, 4, 1.5); bone(3, 10, 9, 14, 1); bone(10, 9, 18, 13, 2.2);
      g.ellipsoid(14, 3, 9, 3, 2.6, 2.6, (x, y, z) => (z > 10 && y === 3 && (x === 13 || x === 15) ? '#1a1418' : B[0]));
      g.box(13, 1, 10, 16, 2, 12, '#d4c8aa');
    }, { jitter: 0.05 });
  },

  lavapool(o) {
    const r = o.radius || 1.2;
    const grp = new THREE.Group();
    const mat = surfaceMat('lava', o);
    const geo = new THREE.CircleGeometry(r, 12);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.02;
    grp.add(m);
    const n = Math.round(r * 9);
    grp.add(vox('lavarim' + n, n * 2 + 4, 3, n * 2 + 4, 0.11, (g) => {
      const c = n + 2;
      for (let x = 0; x < n * 2 + 4; x++) for (let z = 0; z < n * 2 + 4; z++) {
        const d = Math.hypot(x + 0.5 - c, z + 0.5 - c) / (n + 0.5) + (hash2(x, z, 3) - 0.5) * 0.25;
        if (d > 0.92 && d < 1.25) { g.set(x, 0, z, d < 1 ? GLOW | 0xff8a2a : '#2a2020'); if (d > 1.05 && hash2(x, z, 5) > 0.5) g.set(x, 1, z, '#3a2e2c'); }
      }
    }, { jitter: 0.08 }));
    if (o.light !== 0) addLight(grp, new FlickerLight(0xff5a1a, o.light ?? 4, r * 4, { amount: 0.2, speed: 2 }), [0, 0.5, 0]);
    grp.userData.update = (dt, t) => { mat.uniforms.time.value = t; for (const L of grp.userData.lights || []) L.tick && L.tick(t); };
    grp.userData.emit = (P, dt) => {
      if (rnd.chance(dt * 3 * r)) P.add.emit({ pos: worldOf(grp, rnd.float(-r, r) * 0.7, 0.05, rnd.float(-r, r) * 0.7), vel: [0, 1.2, 0], spread: 0.4, life: [0.6, 1.2], size: [1, 2], color: ['#ffd04a', '#ff6a1a'], gravity: 2, glow: 3 });
    };
    return grp;
  },

  waterpool(o) {
    const r = o.radius || 1.2;
    const grp = new THREE.Group();
    const mat = surfaceMat('water', o);
    const geo = new THREE.CircleGeometry(r, 14);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.015;
    grp.add(m);
    const n = Math.round(r * 9);
    grp.add(vox('waterrim' + n + (o.rim || ''), n * 2 + 4, 2, n * 2 + 4, 0.11, (g) => {
      const c = n + 2;
      for (let x = 0; x < n * 2 + 4; x++) for (let z = 0; z < n * 2 + 4; z++) {
        const d = Math.hypot(x + 0.5 - c, z + 0.5 - c) / (n + 0.5) + (hash2(x, z, 3) - 0.5) * 0.3;
        if (d > 0.95 && d < 1.2) g.set(x, 0, z, pick(o.rim ? [o.rim, shadeHex(o.rim, 0.1)] : ROCKS, x, 0, z));
      }
    }, { jitter: 0.08 }));
    grp.userData.update = (dt, t) => { mat.uniforms.time.value = t; };
    return grp;
  },

  ladder(o) {
    const h = o.height || 30;
    return vox('ladder' + h, 10, h, 2, 0.06, (g) => {
      g.box(0, 0, 0, 2, h, 2, (x, y, z) => woodAt(x, y, z, 'y'));
      g.box(8, 0, 0, 10, h, 2, (x, y, z) => woodAt(x, y, z, 'y', 2));
      for (let y = 3; y < h; y += 5) g.box(2, y, 0, 8, y + 1, 2, (x, yy, z) => woodAt(x, yy, z, 'x', 3));
    }, { jitter: 0.05, origin: [5, 0, 1] });
  },

  elevator(o) {
    const grp = new THREE.Group();
    grp.add(vox('elevator', 26, 30, 22, 0.06, (g) => {
      g.box(0, 0, 0, 26, 2, 22, (x, y, z) => (x % 5 === 0 ? '#4a2e1a' : woodAt(x, y, z, 'z', 8)));
      for (const [x, z] of [[0, 0], [24, 0], [0, 20], [24, 20]]) g.box(x, 2, z, x + 2, 30, z + 2, (xx, y, zz) => woodAt(xx, y, zz, 'y', 4));
      g.box(0, 28, 0, 26, 30, 2, '#5a3a22'); g.box(0, 28, 20, 26, 30, 22, '#5a3a22');
      g.box(0, 10, 0, 26, 11, 1, '#6a4426'); g.box(0, 10, 21, 26, 11, 22, '#6a4426');
      g.box(25, 10, 0, 26, 11, 22, '#6a4426');
      g.box(11, 2, 3, 15, 6, 7, '#3a3a40'); // lever box
      g.box(12, 6, 4, 13, 10, 5, '#7a7e88');
    }, { jitter: 0.06 }));
    for (const x of [-0.6, 0.6]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 14, 4), toon('#b8986a'));
      rope.position.set(x, 1.8 + 7, 0);
      grp.add(rope);
    }
    return grp;
  },

  ropebridge(o) {
    const L = o.length || 8;
    const sag = o.sag ?? 0.35;
    const grp = new THREE.Group();
    const n = Math.floor(L / 0.2);
    const plank = new THREE.BoxGeometry(0.16, 0.04, 0.72);
    const inst = new THREE.InstancedMesh(plank, toon('#7a4e2c'), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const yAt = (x) => -sag * (1 - Math.pow((2 * x) / L, 2));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * (L / n);
      if (o.broken && Math.abs(x - (o.gap ?? 0)) < 0.5) continue;
      q.setFromEuler(e.set((hash2(i, 1, 4) - 0.5) * 0.08, (hash2(i, 2, 4) - 0.5) * 0.12, 0));
      s.set(1, 1, 0.85 + hash2(i, 3, 4) * 0.2);
      m.compose(p.set(x, yAt(x), 0), q, s);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = true; inst.receiveShadow = true;
    grp.add(inst);
    for (const z of [-0.36, 0.36]) for (const hgt of [0.02, 0.62]) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const x = -L / 2 + (i / 16) * L; pts.push(new THREE.Vector3(x, yAt(x) * (hgt > 0.1 ? 0.75 : 1) + hgt, z)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, hgt > 0.1 ? 0.018 : 0.022, 4), toon('#b8986a'));
      grp.add(tube);
    }
    for (let i = 0; i <= Math.floor(L / 0.8); i++) for (const z of [-0.36, 0.36]) {
      const x = -L / 2 + i * 0.8;
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 3), toon('#a08458'));
      v.position.set(x, yAt(x) + 0.32, z);
      grp.add(v);
    }
    grp.userData.yAt = yAt;
    return grp;
  },

  door(o) {
    const rune = o.rune || '#c86bff';
    const tone = o.tone || ['#3a3448', '#4a425a', '#2c2436'];
    return vox('door' + rune + tone[0], 24, 34, 6, 0.08, (g) => {
      for (let x = 0; x < 24; x++) for (let y = 0; y < 34; y++) {
        const dx = x + 0.5 - 12, inArch = y < 22 || Math.hypot(dx, y - 22) < 10;
        const outer = y < 24 || Math.hypot(dx, y - 22) < 12;
        if (!outer) continue;
        if (inArch && Math.abs(dx) < 10) {
          const seam = Math.abs(dx) < 0.6;
          const runeLine = (Math.abs(dx) === 5.5 && y > 4 && y < 26) || (y === 14 && Math.abs(dx) < 8) || Math.abs(Math.hypot(dx, y - 16) - 4) < 0.5;
          g.box(x, y, 1, x + 1, y + 1, 3, seam ? '#14101c' : runeLine ? GLOW | parseInt(rune.slice(1), 16) : pick(tone, x, y, 1, 3));
        } else g.box(x, y, 0, x + 1, y + 1, 6, pick(['#5a5268', '#4e4660', '#625a72'], x, y, 0, 2));
      }
    }, { jitter: 0.05, origin: [12, 0, 3] });
  },

  signpost(o) {
    return vox('signpost', 20, 30, 4, 0.04, (g) => {
      g.box(9, 0, 1, 11, 28, 3, (x, y, z) => woodAt(x, y, z, 'y'));
      for (let x = 11; x < 19; x++) g.box(x, 22, 1, x + 1, x > 16 ? 25 - (x - 16) : 26, 3, (xx, y, z) => (y === 23 ? '#3a2416' : woodAt(xx, y, z, 'x', 3)));
      for (let x = 1; x < 9; x++) g.box(x, 15, 1, x + 1, x < 3 ? 18 - (3 - x) : 19, 3, (xx, y, z) => (y === 17 ? '#3a2416' : woodAt(xx, y, z, 'x', 5)));
    }, { jitter: 0.05 });
  },

  books() {
    return vox('books', 12, 10, 8, 0.03, (g) => {
      const C = ['#8a2a2a', '#2a4a8a', '#2a6a3a', '#6a3a8a', '#8a6a2a'];
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const h = 2 + (i % 2), w = 10 - i, ox = (i % 2) * 1;
        g.box(1 + ox, y, 1, 1 + ox + w, y + h, 7, (x, yy, z) => (z === 6 || x === 1 + ox + w - 1 ? '#e8dcc0' : C[i % 5]));
        g.box(1 + ox, y, 1, 2 + ox, y + h, 7, shadeHex(C[i % 5], -0.3));
        y += h;
      }
    }, { jitter: 0.04 });
  },

  sack(o) {
    const c = o.color || '#b8986a';
    return vox('sack' + c, 10, 12, 10, 0.04, (g) => {
      g.ellipsoid(5, 4.5, 5, 4.6, 4.6, 4.2, (x, y, z) => (hash3(x, y, z, 2) > 0.85 ? shadeHex(c, -0.12) : c));
      g.cylinderY(5, 5, 8, 11, 1.4, 2.2, shadeHex(c, -0.1));
      g.box(3, 8, 3, 7, 9, 7, '#6a4426');
      if (o.ore) g.ellipsoid(5, 11, 5, 2, 1, 2, o.ore);
    }, { jitter: 0.05 });
  },

  banner(o) {
    const c = o.color || '#5a2a7a';
    const sym = o.symbol || '#c86bff';
    return vox('banner' + c, 12, 28, 2, 0.05, (g) => {
      g.box(0, 26, 0, 12, 28, 2, '#3a2a20');
      for (let y = 0; y < 26; y++) for (let x = 1; x < 11; x++) {
        if (y < 4 && Math.abs(x - 5.5) < 4 - y) continue;
        const s = Math.hypot(x - 5.5, y - 15) < 3 && Math.hypot(x - 5.5, y - 15) > 1.8;
        g.set(x, y, 0, s ? GLOW | parseInt(sym.slice(1), 16) : x === 1 || x === 10 ? shadeHex(c, 0.2) : c);
      }
    }, { jitter: 0.04, origin: [6, 28, 1] });
  },

  urn(o) {
    const c = o.color || '#9a5a3a';
    return vox('urn' + c, 9, 12, 9, 0.04, (g) => {
      for (let y = 0; y < 12; y++) {
        const r = y < 2 ? 2.4 + y : y < 8 ? 4 - Math.abs(y - 5) * 0.25 : y < 10 ? 2.2 : 2.8;
        g.cylinderY(4.5, 4.5, y, y + 1, r, r, (x, yy, z) => (yy === 6 ? '#e0c080' : yy === 5 && (x + z) % 3 === 0 ? '#2a1a14' : c));
      }
    }, { jitter: 0.05 });
  },

  web(o) {
    const s = o.size || 1;
    const grp = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0xd8d8e8, transparent: true, opacity: 0.55 });
    const pts = [];
    const rings = 4, spokes = 8;
    for (let k = 0; k < spokes; k++) { const a = (k / spokes) * Math.PI * 2; pts.push(0, 0, 0, Math.cos(a) * s, Math.sin(a) * s, 0); }
    for (let r = 1; r <= rings; r++) for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * Math.PI * 2, a1 = ((k + 1) / spokes) * Math.PI * 2, rr = (r / rings) * s;
      pts.push(Math.cos(a0) * rr, Math.sin(a0) * rr, 0, Math.cos(a1) * rr * 0.92, Math.sin(a1) * rr * 0.92, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(geo, mat);
    l.layers.set(LAYER_FX);
    grp.add(l);
    return grp;
  },

  vent(o) {
    const grp = new THREE.Group();
    grp.add(vox('vent', 12, 6, 12, 0.06, (g) => {
      g.cylinderY(6, 6, 0, 6, 5.5, 2.2, (x, y, z) => (Math.hypot(x + 0.5 - 6, z + 0.5 - 6) < 1.6 ? (y > 3 ? GLOW | 0xff6a1a : '#140c0a') : pick(['#2a2224', '#3a2e2c', '#221a1a'], x, y, z)));
    }, { jitter: 0.08 }));
    grp.userData.emit = (P, dt) => {
      if (rnd.chance(dt * 5)) P.alpha.emit({ pos: worldOf(grp, 0, 0.4, 0), vel: [0, 0.8, 0], spread: 0.1, life: [1.5, 2.6], size: [1, 2], sizeEnd: 4, color: '#3a2a2a', alpha: 0.45 });
      if (rnd.chance(dt * 8)) P.add.emit({ pos: worldOf(grp, 0, 0.35, 0), vel: [0, 1.6, 0], spread: 0.4, life: [0.5, 1.2], size: 1, color: ['#ffd04a', '#ff6a1a'], glow: 3, gravity: 1.2 });
    };
    return grp;
  },

  merchantcart(o) {
    const grp = new THREE.Group();
    grp.add(vox('mcart', 40, 42, 22, 0.06, (g) => {
      // cart body
      g.box(2, 7, 2, 38, 9, 20, (x, y, z) => woodAt(x, y, z, 'x', 2));
      g.box(2, 9, 2, 38, 16, 3, (x, y, z) => (x % 6 === 0 ? '#4a2e1a' : woodAt(x, y, z, 'x', 3)));
      g.box(2, 9, 19, 38, 14, 20, (x, y, z) => (x % 6 === 0 ? '#4a2e1a' : woodAt(x, y, z, 'x', 4)));
      g.box(2, 9, 2, 3, 16, 20, '#5e3b22'); g.box(37, 9, 2, 38, 16, 20, '#5e3b22');
      // wheels
      for (const [x, z] of [[9, 1], [31, 1], [9, 20], [31, 20]]) for (let a = 0; a < 40; a++) {
        const r = 5.5, ang = (a / 40) * Math.PI * 2;
        g.box(x + Math.cos(ang) * r, 5.5 + Math.sin(ang) * r, z, x + Math.cos(ang) * r + 1, 6.5 + Math.sin(ang) * r, z + 1, '#4a2e1a');
        if (a % 10 === 0) g.line(x, 5.5, z, x + Math.cos(ang) * r, 5.5 + Math.sin(ang) * r, z, 0.4, '#6a4426');
      }
      // canopy posts + striped awning
      for (const [x, z] of [[3, 3], [36, 3], [3, 18], [36, 18]]) g.box(x, 9, z, x + 1, 32, z + 1, '#5a3a22');
      for (let x = 1; x < 39; x++) for (let z = 1; z < 21; z++) {
        const y = 32 + Math.round(Math.sin((z / 20) * Math.PI) * 4);
        g.set(x, y, z, Math.floor(x / 4) % 2 ? '#c83a3a' : '#f0e0c0');
        if (z === 1 || z === 20) for (let k = 1; k < (x % 4 === 1 ? 3 : 2); k++) g.set(x, y - k, z, Math.floor(x / 4) % 2 ? '#a82a2a' : '#d8c8a8');
      }
      // goods: ore sacks, gem crate, pots
      g.ellipsoid(10, 18, 8, 4, 3.5, 3.5, '#b8986a'); g.ellipsoid(10, 21, 8, 2, 1, 2, '#c8743a');
      g.ellipsoid(19, 18, 9, 4, 3.5, 3.5, '#a8885a'); g.ellipsoid(19, 21, 9, 2, 1, 2, '#9aa3b2');
      g.box(25, 16, 5, 33, 21, 13, (x, y, z) => woodAt(x, y, z, 'x', 6));
      g.box(26, 21, 6, 32, 22, 12, (x, y, z) => (hash3(x, y, z, 2) > 0.5 ? GLOW | 0xb06bff : GLOW | 0x6ad8ff));
      // hanging stuff
      for (const [x, c] of [[8, '#c8743a'], [14, '#9aa0aa'], [22, '#e0c060'], [28, '#5a8a3a'], [33, '#9a3a5a']]) {
        g.box(x, 27, 18, x + 1, 31, 19, '#b8986a');
        g.ellipsoid(x + 0.5, 25.5, 18.5, 1.4, 1.8, 1.4, c);
      }
      // sign board
      g.box(12, 34, 20, 28, 39, 21, (x, y) => (y === 34 || y === 38 ? '#3a2416' : '#c8a060'));
      g.box(14, 36, 21, 26, 37, 22, '#5a3a22');
    }, { jitter: 0.06 }));
    const lan = BUILDERS.lantern({ hang: 0.15, intensity: 2.2, distance: 5 });
    lan.position.set(1.0, 1.85, 0.62);
    grp.add(lan);
    grp.userData.lights = lan.userData.lights;
    return grp;
  },

  roots(o) {
    const c = o.color || '#5a4030';
    const L = o.length || 20;
    return vox('roots' + c + L, L, 10, 6, 0.08, (g) => {
      for (let k = 0; k < 4; k++) {
        let y = 8 - k * 1.5, z = 1 + k;
        for (let x = 0; x < L; x++) { y += Math.sin(x * 0.4 + k) * 0.5; g.sphere(x, Math.max(0.5, Math.min(9, y)), z, 0.9 + (k === 0 ? 0.4 : 0), (xx, yy, zz) => pick([c, shadeHex(c, -0.15), shadeHex(c, 0.1)], xx, yy, zz)); }
      }
    }, { jitter: 0.06, origin: [0, 0, 3] });
  },

  vines(o) {
    const c = o.color || '#3a7a3a';
    const L = o.length || 18;
    const glowc = o.glow;
    return vox('vines' + c + L + (glowc || ''), 12, L, 3, 0.05, (g) => {
      for (let k = 0; k < 5; k++) {
        const x0 = 1 + k * 2.3, len = Math.floor(L * (0.5 + hash2(k, 1, 6) * 0.5));
        for (let y = 0; y < len; y++) {
          const x = x0 + Math.sin(y * 0.35 + k) * 0.8;
          g.set(x, L - 1 - y, 1, y === len - 1 && glowc ? GLOW | parseInt(glowc.slice(1), 16) : pick([c, shadeHex(c, 0.15), shadeHex(c, -0.15)], k, y, 1));
          if (y % 4 === 2) g.set(x + 1, L - 1 - y, 1, shadeHex(c, 0.25));
        }
      }
    }, { jitter: 0.04, origin: [6, L, 1.5], shadow: false });
  },

  mole(o) {
    // the wandering merchant: a plump mole with spectacles, a floppy hat and an enormous pack
    const grp = new THREE.Group();
    const body = vox('mole', 30, 40, 26, 0.035, (g) => {
      const F = ['#5a4a4a', '#665454', '#4e4040'];
      g.ellipsoid(15, 10, 13, 9, 10, 8, (x, y, z) => (z > 18 && y < 12 && Math.abs(x - 15) < 5 ? '#c8a888' : pick(F, x, y, z, 2))); // body + belly
      g.ellipsoid(15, 21, 15, 7, 6.5, 6.5, (x, y, z) => pick(F, x, y, z, 3)); // head
      g.ellipsoid(15, 19.5, 21.5, 2.6, 2.2, 2.4, '#e88a9a'); // snout
      g.ellipsoid(15, 20, 23.5, 1.2, 1, 1, '#ff5a7a'); // nose
      for (const ex of [12, 18]) { g.ellipsoid(ex, 22.5, 20.2, 1.9, 1.9, 0.6, '#c8a040'); g.set(ex, 22, 20.8, '#140c10'); g.set(ex, 23, 21, GLOW | 0xfff0c0); } // spectacles
      g.box(13, 22, 20, 17, 23, 21, '#c8a040');
      // hat
      g.ellipsoid(15, 27, 15, 9.5, 1.2, 9, '#4a6a3a');
      g.cylinderY(15, 15, 27, 33, 5.5, 4, (x, y) => (y === 28 ? '#c83a3a' : '#5a7a44'));
      g.box(18, 31, 13, 20, 37, 14, '#e8dcc0'); // feather
      // apron + paws
      g.box(10, 2, 19, 20, 13, 21, (x, y) => (y === 9 ? '#5a3a22' : '#b8986a'));
      g.box(12, 6, 21, 15, 9, 22, '#7a5a3a');
      for (const px of [5, 25]) g.ellipsoid(px, 9, 16, 2.2, 3, 2.2, '#e88a9a');
      for (const px of [10, 20]) g.ellipsoid(px, 1, 15, 3, 1.5, 3.5, '#e88a9a');
      // the enormous pack behind
      g.box(5, 6, 0, 25, 34, 7, (x, y, z) => (y % 7 === 0 ? '#4a2e1a' : x === 5 || x === 24 ? '#5a3a22' : '#7a5230'));
      g.cylinderY(9, 3, 34, 38, 2.5, 2.5, '#c8743a'); // copper pot on top
      g.ellipsoid(20, 36, 3, 3.5, 2.5, 3, '#b8986a'); // bedroll
      g.box(25, 12, 1, 27, 20, 5, '#3a3a40'); // hanging pan
      for (const [x, y, c] of [[3, 24, '#9ae8ff'], [3, 18, '#ffc83a'], [27, 26, '#c08aff']]) g.ellipsoid(x, y, 4, 1.3, 1.6, 1.3, GLOW | parseInt(c.slice(1), 16));
    }, { jitter: 0.05 });
    grp.add(body);
    const lan = BUILDERS.lantern({ hang: 0.12, intensity: 1.6, distance: 4 });
    lan.position.set(0.48, 1.05, 0.2);
    grp.add(lan);
    grp.userData.update = (dt, t) => { body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.012; body.rotation.z = Math.sin(t * 1.1) * 0.03; };
    return grp;
  },

  miner(o) {
    // a trapped miner: rubble pile with a beam, a helmet lamp and a waving arm
    const grp = new THREE.Group();
    grp.add(vox('rubble', 40, 18, 26, 0.045, (g) => {
      for (let i = 0; i < 26; i++) {
        const x = 4 + hash2(i, 1, 6) * 32, z = 3 + hash2(i, 2, 6) * 20, r = 2.5 + hash2(i, 3, 6) * 3.5;
        g.ellipsoid(x, r * 0.6 + hash2(i, 4, 6) * 4, z, r, r * 0.8, r, (xx, y, zz) => pick(ROCKS, xx, y, zz, i));
      }
      g.line(0, 12, 6, 40, 4, 18, 1.4, (x, y, z) => woodAt(x, y, z, 'x', 3)); // fallen beam
    }, { jitter: 0.08 }));
    const head = vox('minerhead', 12, 12, 12, 0.035, (g) => {
      g.ellipsoid(6, 4.5, 6, 4.2, 4.2, 4.2, '#e8b088'); // face
      g.ellipsoid(6, 7, 6, 5, 3, 5, (x, y) => (y < 7 ? null : '#e0b040')); // helmet
      g.box(5, 8, 10, 7, 10, 11, GLOW | 0xfff0b0); // lamp
      g.set(4, 5, 10, '#140c10'); g.set(8, 5, 10, '#140c10');
      g.box(3, 1, 9, 9, 3, 11, '#8a5a3a'); // beard
    }, { jitter: 0.04 });
    head.position.set(-0.35, 0.42, 0.55);
    head.rotation.z = 0.3;
    grp.add(head);
    const arm = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), toon('#4a6a8a'));
    a.position.y = 0.16; arm.add(a);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), toon('#e8b088'));
    hand.position.y = 0.36; arm.add(hand);
    arm.position.set(0.1, 0.5, 0.6);
    grp.add(arm);
    addLight(grp, new THREE.PointLight(0xfff0b0, 1.2, 3, 1.6), [-0.35, 0.8, 0.95]);
    grp.userData.update = (dt, t) => { arm.rotation.z = Math.sin(t * 6) * 0.5 + 0.2; };
    return grp;
  },

  snail(o) {
    // Gravel, the ore-eating rock snail
    const grp = new THREE.Group();
    const body = vox('snail', 26, 20, 12, 0.04, (g) => {
      for (let x = 2; x < 24; x++) g.ellipsoid(x, 2, 6, 1.5, 2.2 - (x < 6 ? (6 - x) * 0.3 : 0), 3, '#a8c880');
      g.ellipsoid(21, 6, 6, 3, 4.5, 3, '#a8c880'); // head
      for (const z of [4, 8]) { g.line(21, 9, z, 22, 15, z, 0.5, '#98b870'); g.sphere(22, 15.5, z, 1.4, '#f0f0e0'); g.set(23, 15, z, '#140c10'); }
      g.ellipsoid(10, 9, 6, 7.5, 7.5, 5, (x, y, z) => { const a = Math.atan2(y - 9, x - 10), r = Math.hypot(x - 10, y - 9); return (Math.floor(r + a * 1.4) % 3 === 0) ? '#6a645e' : pick(['#8a8278', '#958c80', '#7a7268'], x, y, z); });
      g.ellipsoid(10, 15.5, 6, 2, 2, 1.6, GLOW | 0xb06bff); // gem on shell
      g.set(23, 5, 9, '#ff8aa0'); // blush
    }, { jitter: 0.05 });
    grp.add(body);
    grp.userData.update = (dt, t) => { body.scale.x = 1 + Math.sin(t * 2) * 0.03; };
    return grp;
  },

  shrine(o) {
    const col = o.color || '#ff8a3a';
    const grp = new THREE.Group();
    grp.add(vox('shrine' + col, 22, 22, 16, 0.06, (g) => {
      g.box(1, 0, 1, 21, 3, 15, (x, y, z) => (y === 2 ? '#7a7268' : pick(ROCKS, x, y, z, 2)));
      g.box(5, 3, 4, 17, 11, 12, (x, y, z) => ((x === 5 || x === 16) && y % 3 === 1 ? GLOW | parseInt(col.slice(1), 16) : pick(['#5a5450', '#66605a', '#4e4844'], x, y, z, 3)));
      g.box(2, 11, 3, 20, 14, 13, (x, y) => (y === 13 ? '#8a8278' : '#5e5852'));
      g.cylinderY(11, 8, 14, 15, 5, 5, (x, y, z) => (hash3(x, y, z, 2) > 0.4 ? GLOW | parseInt(col.slice(1), 16) : '#2a2222'));
      for (const x of [1, 19]) g.box(x, 3, 1, x + 2, 20, 3, (xx, y, z) => (y > 17 ? '#8a8278' : pick(ROCKS, xx, y, z, 5)));
    }, { jitter: 0.06 }));
    const f = makeFlame(0.7, col === '#ff8a3a' ? 'fire' : 'blue');
    f.position.y = 0.92;
    grp.add(f);
    const L = addLight(grp, new FlickerLight(new THREE.Color(col), 3, 6, { amount: 0.25 }), [0, 1.3, 0.3]);
    grp.userData.update = (dt, t) => { f.userData.flame(t); L.tick(t); f.position.y = 0.95 + Math.sin(t * 2) * 0.04; };
    grp.userData.emit = (P, dt) => { if (rnd.chance(dt * 10)) P.add.emit({ pos: worldOf(grp, 0, 1.0, 0), posSpread: 0.25, vel: [0, 0.4, 0], spread: 0.15, life: [0.8, 1.6], size: 1, color: [col, '#fff0c0'], glow: 3, swirl: 2 }); };
    return grp;
  },

  goldpile() {
    return vox('goldpile', 14, 6, 12, 0.04, (g) => {
      g.ellipsoid(7, 0, 6, 6, 4, 5, (x, y, z) => (hash3(x, y, z, 2) > 0.9 ? GLOW | 0xfff0a0 : hash3(x, y, z, 3) > 0.92 ? '#ff4a6a' : pick(['#e0b040', '#c8902a', '#f0c860'], x, y, z)));
    }, { jitter: 0.06 });
  },
};

// ------------------------------------------------------------------ materials for crystals & liquid surfaces
const crystalCache = new Map();
function crystalMat(col) {
  let m = crystalCache.get(col);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(col), emissive: new THREE.Color(col), emissiveIntensity: 0.9, flatShading: true });
    m.userData.keep = true;
    crystalCache.set(col, m);
  }
  return m;
}

const surfVert = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const surfFrag = /* glsl */ `
uniform float time; uniform vec3 c0, c1, c2, c3; uniform float hdr; uniform float speed; uniform float scale; uniform vec3 bands;
varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = floor(vW.xz * 16.0) / 16.0 * scale;
  float t = time * speed;
  float v = n(p * 2.0 + vec2(t, t * 0.6)) * 0.6 + n(p * 4.5 - vec2(t * 0.7, -t)) * 0.4;
  v = floor(v * 5.0) / 5.0;
  vec3 col = v < bands.x ? c0 : v < bands.y ? c1 : v < bands.z ? c2 : c3;
  gl_FragColor = vec4(col * hdr, 1.0);
}`;
function surfaceMat(kind, o) {
  const pal = kind === 'lava'
    ? [o.c0 || '#7a1a06', o.c1 || '#d8400e', o.c2 || '#ff8a1a', o.c3 || '#ffe07a']
    : [o.c0 || '#0e2a36', o.c1 || '#14404e', o.c2 || '#1e5a6a', o.c3 || o.sparkle || '#7fe3ff'];
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, c0: { value: new THREE.Color(pal[0]) }, c1: { value: new THREE.Color(pal[1]) },
      c2: { value: new THREE.Color(pal[2]) }, c3: { value: new THREE.Color(pal[3]) },
      bands: { value: kind === 'lava' ? new THREE.Vector3(0.35, 0.55, 0.75) : new THREE.Vector3(0.4, 0.62, 0.86) },
      hdr: { value: kind === 'lava' ? (o.hdr ?? 2.2) : (o.hdr ?? 0.85) }, speed: { value: kind === 'lava' ? 0.25 : 0.35 }, scale: { value: kind === 'lava' ? 1.2 : 1.6 },
    },
    vertexShader: surfVert, fragmentShader: surfFrag,
  });
}
export { surfaceMat };

/** Build a prop by name. Unknown names return an empty group (with a console warning). */
export function buildProp(name, opts = {}) {
  const b = BUILDERS[name];
  if (!b) { console.warn('unknown prop', name); return new THREE.Group(); }
  const g = b(opts);
  g.name = name;
  return g;
}
export const PROP_NAMES = Object.keys(BUILDERS);

/** Run update/emit hooks for every prop under root. P = { add, alpha } particle systems. */
export function tickProps(root, dt, t, P) {
  root.traverse((o) => {
    const u = o.userData;
    if (!u) return;
    if (u.update) u.update(dt, t);
    if (P && u.emit) u.emit(P, dt);
  });
}
