// Scene sets: campfire camp, combat arenas, travel corridors, rooms, mining wall, final tomb.
// buildSet(kind, regionIdx, opts) → EnvSet. Call set.attach(scene) once and set.update(dt, t) every frame.
// set.P = { add, alpha } particle systems you can reuse for scene effects.
import * as THREE from 'three';
import { REGIONS } from '../data/regions.js';
import { buildProp, tickProps, surfaceMat } from './props.js';
import { shellChunk, rockPainter, cnoise } from './env_terrain.js';
import { ParticleSystem } from '../gfx/particles.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { GLOW } from '../gfx/voxel.js';
import { toon } from '../gfx/materials.js';
import { hash2, noise2, mixHex, clamp, lerp, smoothstep } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class EnvSet {
  constructor(kind, regionIdx) {
    this.kind = kind;
    this.region = REGIONS[regionIdx] || REGIONS[0];
    this.regionIdx = regionIdx;
    const pal = this.region.pal;
    this.group = new THREE.Group();
    this.group.name = 'set:' + kind;
    this.lights = [];
    this.anchors = {};
    this.camera = { pos: [0, 2, 7], look: [0, 1, 0], fov: 38 };
    this.floorY = 0;
    this.fog = new THREE.FogExp2(new THREE.Color(pal.fog), 0.05);
    this.background = new THREE.Color(pal.sky);
    this.P = { add: new ParticleSystem(1600, { additive: true }), alpha: new ParticleSystem(900) };
    this.group.add(this.P.add.object, this.P.alpha.object);
    this.emitters = [];
    this.updaters = [];
    this.focus = V(0, 1, 0);
    this.spread = V(7, 2.5, 4);
    this.t = 0;
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
  attach(scene) {
    scene.add(this.group);
    scene.fog = this.fog;
    scene.background = this.background;
    return this;
  }
  /** Focus point for ambient particles / carried lantern (corridors call this with the walker's x). */
  follow(x, y) {
    this.focus.x = x;
    if (y !== undefined) this.focus.y = y;
    if (this.walkerLight) this.walkerLight.position.set(x + 0.3, (y ?? this.focus.y) + 1.1, 0.9);
  }
  update(dt, t) {
    this.t = t ?? this.t + dt;
    tickProps(this.group, dt, this.t, this.P);
    for (const e of this.emitters) e(dt, this.t);
    for (const u of this.updaters) u(dt, this.t);
    this.P.add.update(dt);
    this.P.alpha.update(dt);
  }
}

/** Quantized voxel ground: returns the exact top surface of the floor voxel column under (x, z). */
function ground(F, S, ox = 0, oz = 0) {
  return (x, z) => {
    const cx = ox + (Math.floor((x - ox) / S + 1e-6) + 0.5) * S;
    const cz = oz + (Math.floor((z - oz) / S + 1e-6) + 0.5) * S;
    const h = F(cx, cz);
    if (h === null || h === undefined) return null;
    return (Math.floor(h / S + 1e-6) + 1) * S;
  };
}
/** Smooth walk height along x at z (ramps between voxel steps). */
function walker(G, S, ox, z = 0) {
  return (x) => {
    const i = Math.floor((x - ox) / S - 0.5);
    const c0 = ox + (i + 0.5) * S, t = clamp((x - c0) / S);
    const a = G(c0, z), b = G(c0 + S, z);
    if (a === null) return b; if (b === null) return a;
    return lerp(a, b, t);
  };
}

// ---------------------------------------------------------------- ambient life
function ambient(set, kinds) {
  const P = set.P, f = set.focus, s = set.spread;
  const rp = () => [f.x + rnd.float(-s.x, s.x), f.y + rnd.float(-s.y * 0.6, s.y), f.z + rnd.float(-s.z, s.z * 0.5)];
  const E = {
    dust: (dt) => { if (rnd.chance(dt * 9)) P.alpha.emit({ pos: rp(), vel: [rnd.float(-0.05, 0.05), 0.015, 0], spread: 0.03, life: [4, 7], size: 1, color: '#d8c8b0', alpha: 0.45, fadeIn: 1.2 }); },
    fireflies: (dt) => { if (rnd.chance(dt * 1.6)) P.add.emit({ pos: rp(), vel: [0, 0.03, 0], spread: 0.18, life: [3, 6], size: 1, color: ['#d8ff6a', '#ffe08a'], glow: 2.6, fadeIn: 0.8, flicker: 0.35, swirl: 0.8 }); },
    sparkle: (dt) => { if (rnd.chance(dt * 2.5)) P.add.emit({ pos: rp(), vel: [0, 0.02, 0], spread: 0.04, life: [0.8, 2], size: 1, color: ['#9ae8ff', '#ff9af0', '#e0d0ff'], glow: 3, fadeIn: 0.3, flicker: 0.5 }); },
    spores: (dt) => { if (rnd.chance(dt * 7)) P.add.emit({ pos: rp(), vel: [0.03, 0.08, 0], spread: 0.05, life: [4, 8], size: 1, color: ['#5af0c8', '#e0f08a', '#9affc8'], glow: 2, fadeIn: 1, flicker: 0.2, swirl: 0.4 }); },
    gold: (dt) => { if (rnd.chance(dt * 4)) P.add.emit({ pos: rp(), vel: [0.02, 0.01, 0], spread: 0.03, life: [3, 6], size: 1, color: ['#ffe08a', '#fff4c0'], glow: 1.8, fadeIn: 1, alpha: 0.7 }); },
    embers: (dt) => { if (rnd.chance(dt * 12)) P.add.emit({ pos: [f.x + rnd.float(-s.x, s.x), f.y - 1, f.z + rnd.float(-s.z, 0)], vel: [rnd.float(-0.1, 0.1), 0.6, 0], spread: 0.2, life: [2, 4], size: 1, color: ['#ffb04a', '#ff6a1a', '#ffe08a'], glow: 3, flicker: 0.3, swirl: 0.7 }); },
    ash: (dt) => { if (rnd.chance(dt * 6)) P.alpha.emit({ pos: [f.x + rnd.float(-s.x, s.x), f.y + s.y, f.z + rnd.float(-s.z, 0)], vel: [0.05, -0.18, 0], spread: 0.05, life: [5, 8], size: 1, color: '#6a5a5a', alpha: 0.6, fadeIn: 1 }); },
    wisps: (dt) => { if (rnd.chance(dt * 2.2)) P.add.emit({ pos: rp(), vel: [0, 0.06, 0], spread: 0.12, life: [3, 6], size: [1, 2], color: ['#c86bff', '#9affc8', '#ff8af0'], glow: 2.5, fadeIn: 1, flicker: 0.25, swirl: 0.6 }); },
  };
  for (const k of kinds) if (E[k]) set.emitters.push(E[k]);
}

/** Water drips from a ceiling height that splash on the floor. */
function drips(set, xs, y0, floorAt, color = '#9ad8ff') {
  set.emitters.push((dt) => {
    if (!rnd.chance(dt * 1.2 * xs.length)) return;
    const x = rnd.pick(xs) + rnd.float(-0.3, 0.3);
    const z = rnd.float(-2.5, -0.5);
    const fy = floorAt(x, z);
    set.P.alpha.emit({ pos: [x, y0, z], vel: [0, -0.2, 0], gravity: 9, life: [1.2, 1.4], size: 1, color, alpha: 0.9, floor: fy + 0.02, bounce: 0.25 });
  });
}

/** Little flapping bats that cross the background now and then. */
function bats(set, n, area, color = '#2a2230') {
  const mat = toon(color);
  const bodyG = new THREE.SphereGeometry(0.05, 5, 4);
  const wingG = new THREE.BufferGeometry();
  wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.16, 0.03, -0.04, 0.12, -0.02, 0.06], 3));
  wingG.computeVertexNormals();
  const flock = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(bodyG, mat));
    const wl = new THREE.Mesh(wingG, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    const wr = wl.clone(); wr.scale.x = -1;
    b.add(wl, wr);
    b.userData = { wl, wr, ph: rnd.float(0, 10), sp: rnd.float(0.5, 0.9), dir: rnd.sign() };
    b.visible = false;
    set.group.add(b);
    flock.push(b);
  }
  let timer = rnd.float(2, 5);
  set.updaters.push((dt, t) => {
    timer -= dt;
    if (timer < 0) {
      timer = rnd.float(6, 12);
      const dir = rnd.sign();
      flock.forEach((b, i) => {
        b.visible = true;
        b.userData.dir = dir;
        b.userData.x = (dir > 0 ? area.x0 : area.x1) - dir * i * 0.4 + set.focus.x * (area.follow ? 1 : 0);
        b.userData.y = rnd.float(area.y0, area.y1);
        b.userData.z = rnd.float(area.z0, area.z1);
        b.userData.life = 0;
      });
    }
    for (const b of flock) {
      if (!b.visible) continue;
      const u = b.userData;
      u.life += dt;
      u.x += u.dir * dt * 3.2 * u.sp;
      const fl = Math.sin(t * 24 + u.ph);
      u.wl.rotation.z = fl * 0.9; u.wr.rotation.z = -fl * 0.9;
      b.position.set(u.x, u.y + Math.sin(t * 3 + u.ph) * 0.25, u.z);
      b.rotation.y = u.dir > 0 ? 0 : Math.PI;
      if (u.life > 12) b.visible = false;
    }
  });
}

/** Soft additive light shaft (Octopath-style god ray). */
const shaftMats = new Map();
function lightShaft(set, x, z, color, h = 5, r = 0.7, tilt = 0.25) {
  let m = shaftMats.get(color);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Color(color) }, time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 c; uniform float time; varying vec2 vUv; varying vec3 vN; void main(){ float edge = pow(abs(vN.z), 3.0); float a = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * edge * (0.85 + 0.15 * sin(time * 0.7 + vUv.x * 12.0)); gl_FragColor = vec4(c * a * 0.14, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    m.userData.keep = true;
    shaftMats.set(color, m);
  }
  const geo = new THREE.CylinderGeometry(r * 0.45, r, h, 10, 1, true);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, h / 2 - 0.1, z);
  mesh.rotation.z = tilt;
  mesh.layers.set(LAYER_FX);
  mesh.renderOrder = 20;
  set.group.add(mesh);
  set.updaters.push((dt, t) => { m.uniforms.time.value = t; });
  return mesh;
}

function hemi(set, pal, light, k = 1) {
  const h = new THREE.HemisphereLight(new THREE.Color(light.fill), new THREE.Color(light.ambient), (light.fillI + 0.25) * k);
  set.group.add(h);
  return h;
}

function keySpot(set, color, intensity, pos, target, shadow = true) {
  const s = new THREE.SpotLight(new THREE.Color(color), intensity, 30, 0.7, 0.6, 1.2);
  s.position.set(...pos);
  s.target.position.set(...target);
  set.group.add(s, s.target);
  if (shadow) {
    s.castShadow = true;
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.bias = -0.0015;
    s.shadow.camera.near = 1; s.shadow.camera.far = 30;
  }
  set.lights.push(s);
  return s;
}

const SPECKS = [
  ['#a8743a', '#5f9f8a', '#8a5a3a', '#c8b060'],
  ['#9ae8ff', '#ff9af0', '#c0a0ff'],
  ['#e0d0a0', '#5af0c8', '#c08a4a'],
  ['#ffd25e', '#4affe0', '#c8a040'],
  ['#ff8a2a', '#2a1e3a', '#ffd04a'],
  ['#c86bff', '#e0d8c8', '#9affc8'],
];
function painter(ri, extra = {}) {
  const pal = REGIONS[ri].pal;
  return rockPainter(pal, {
    seed: 11 + ri, speck: SPECKS[ri],
    moss: [0.25, 0.1, 0.55, 0.3, 0, 0.1][ri],
    glowVeins: ri === 4 ? '#ff6a1a' : ri === 5 ? '#9a4ad8' : null,
    strata: ri === 3 ? 2.2 : 1,
    ...extra,
  });
}

// ---------------------------------------------------------------- region dressing (shared by arena/room/corridor)
/** Place region props along a backdrop band. xs: candidate x positions; floorAt(x,z). zBack: back band z. */
function dressRegion(set, ri, xs, floorAt, zBack, opts = {}) {
  const pal = REGIONS[ri].pal;
  const P = (name, o, x, z, rot = 0, s = 1, dy = 0) => set.prop(name, o, x, floorAt(x, z) + dy, z, rot, s);
  const lightBudget = { n: opts.lights ?? 6 };
  const lit = () => (lightBudget.n-- > 0);
  xs.forEach((x, i) => {
    const h = hash2(i, ri, 77);
    const z = zBack + (h - 0.5) * 0.6;
    switch (ri) {
      case 0: {
        if (i % 2 === 0) {
          const sup = P('support', {}, x, zBack - 0.15);
          if (lit()) { const l = buildProp('lantern', { hang: 0.35, intensity: 2.2, distance: 5.5 }); set.add(l, x + 0.55, floorAt(x, zBack) + 2.35, zBack + 0.15); }
        } else if (h < 0.4) { P('crate', {}, x, z); P('crate', { size: 8 }, x + 0.5, z + 0.25, 0.4); P('barrel', {}, x - 0.55, z + 0.35); }
        else if (h < 0.7) { P('minecart', { ore: rnd.pick(['#8e8a92', '#c8743a', '#ffc83a']) }, x, z + 0.2, 0.1); }
        else { P('barrel', { content: 'ore' }, x, z); P('pickaxe', {}, x + 0.45, z + 0.3, 0.2); P('sack', { ore: '#c8743a' }, x - 0.4, z + 0.4); }
        break;
      }
      case 1: {
        const cols = [['#6ad8ff', '#9ae8ff'], ['#ff8af0', '#c08aff'], ['#b08aff', '#6ad8ff']][i % 3];
        P('crystalcluster', { color: cols[0], color2: cols[1], size: 1.2 + h * 1.3, count: 5 + (i % 3), light: lit() ? 2.6 : 0 }, x, z, h * 6);
        if (h > 0.6) P('crystal', { color: cols[1], size: 0.8 }, x + 0.7, z + 0.6, h * 3);
        if (i % 3 === 1) P('rock', { size: 0.8, tone: pal.rock.slice(1) }, x - 0.6, z + 0.5);
        break;
      }
      case 2: {
        if (i % 2 === 0 && !opts.low) {
          const g = P('mushroom', { giant: true, height: 18 + Math.floor(h * 14), radius: 8 + Math.floor(h * 6), color: ['#d04a3a', '#3ab08a', '#d04a8a', '#e0a04a'][i % 4], glow: ['#5af0c8', '#ffe08a', '#9affc8'][i % 3], light: lit() ? 2.6 : 0 }, x, z - 0.4, h * 6);
        } else {
          P('mushroom', { glow: '#5af0c8', color: '#3ab08a' }, x, z + 0.6, h * 5, 1.4);
          P('mushroom', { color: '#d04a3a' }, x + 0.4, z + 0.8, h, 1.1);
          P('roots', { color: '#4a3a2a', length: 16 }, x - 0.6, zBack - 0.5);
        }
        break;
      }
      case 3: {
        if (i % 3 === 1 && opts.statue !== false) {
          P('statue', {}, x, zBack - 0.2, 0, 1);
          if (lit()) { P('torch', {}, x - 0.9, z + 0.2); }
        } else {
          const broken = h > 0.55;
          P('pillar', { broken, height: 30 + Math.floor(h * 10), rune: h > 0.8 ? '#4affe0' : null }, x, zBack - 0.1);
          if (!broken && lit()) { const t = buildProp('torch', {}); t.rotation.z = -0.15; set.add(t, x + 0.55, floorAt(x, zBack) + 1.4, zBack + 0.35); }
          if (h < 0.3) { P('urn', {}, x + 0.6, z + 0.4); P('goldpile', {}, x - 0.6, z + 0.5); }
        }
        break;
      }
      case 4: {
        if (i % 2 === 0) P('lavapool', { radius: 0.9 + h * 0.8, light: lit() ? 3.5 : 0 }, x, zBack + 0.6);
        else { P('vent', {}, x, z + 0.3); P('crystalcluster', { color: '#5a2a8a', color2: '#2a1e3a', size: 1.2, light: 0, rock: pal.rock.slice(1) }, x + 0.7, z, h * 4); }
        break;
      }
      case 5: {
        if (i % 3 === 0) { P('brazier', { palette: 'purple', intensity: lit() ? 3.5 : 0.01 }, x, z + 0.3); }
        else if (i % 3 === 1) { P('sarcophagus', {}, x, zBack, Math.PI / 2 + (h - 0.5) * 0.3); P('bones', {}, x + 0.8, z + 0.6, h * 5); }
        else { P('pillar', { tone: ['#3a3448', '#4a425a', '#2c2436', '#52496a'], height: 34, broken: h > 0.6, rune: '#c86bff' }, x, zBack - 0.1); P('banner', {}, x + 0.75, floorAt(x, zBack) + 3.0, zBack + 0.1); }
        break;
      }
      default: break;
    }
  });
}

/** Scatter small floor details (pebbles, tufts, crystals, coins, bones…), keeping a clear stage area. */
function scatter(set, ri, floorAt, n, area, clear = { x: 3.2, z: 1.3 }) {
  const pal = REGIONS[ri].pal;
  for (let i = 0; i < n; i++) {
    const x = area.x0 + hash2(i, 1, 50 + ri) * (area.x1 - area.x0);
    const z = area.z0 + hash2(i, 2, 50 + ri) * (area.z1 - area.z0);
    if (Math.abs(x) < clear.x && Math.abs(z) < clear.z) continue;
    const y = floorAt(x, z);
    if (y === null || y === undefined) continue;
    const h = hash2(i, 3, 50 + ri), rot = h * 6.28;
    if (h < 0.45) set.prop('rock', { size: 0.25 + hash2(i, 4, 1) * 0.35, tone: pal.rock.slice(1), seed: i % 5, moss: ri === 2 || ri === 0 ? pal.moss : null }, x, y - 0.03, z, rot);
    else if (h < 0.75) {
      if (ri === 1) set.prop('crystal', { color: ['#6ad8ff', '#ff8af0', '#b08aff'][i % 3], size: 0.35 + h * 0.3 }, x, y, z, rot);
      else if (ri === 2) set.prop('mushroom', { glow: i % 2 ? '#5af0c8' : null, color: ['#d04a3a', '#3ab08a', '#e0a04a'][i % 3] }, x, y, z, rot, 0.8 + h * 0.6);
      else if (ri === 3) set.prop(i % 2 ? 'goldpile' : 'urn', {}, x, y, z, rot, 0.6);
      else if (ri === 4) set.prop('crystal', { color: '#3a2a5a', size: 0.4 + h * 0.4 }, x, y, z, rot);
      else if (ri === 5) set.prop('bones', {}, x, y, z, rot, 0.7);
      else set.prop(i % 2 ? 'sack' : 'barrel', {}, x, y, z, rot, 0.85);
    } else if (h < 0.9) set.add(tuft(ri), x, y, z, rot);
  }
}
const tuftCache = {};
function tuft(ri) {
  const cols = [['#6a6a3a', '#8a8a4a'], ['#5a7aaa', '#9ac0e0'], ['#3a8a5a', '#7ad09a'], ['#7a8a4a', '#aab06a'], ['#5a3030', '#8a4a3a'], ['#5a4a6a', '#8a7aa0']][ri];
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const b = new THREE.Mesh(tuftCache.geo || (tuftCache.geo = new THREE.ConeGeometry(0.018, 0.16, 3)), toon(cols[k % 2]));
    b.position.set((hash2(k, ri, 1) - 0.5) * 0.12, 0.07, (hash2(k, ri, 2) - 0.5) * 0.12);
    b.rotation.set((hash2(k, 3, ri) - 0.5) * 0.7, 0, (hash2(k, 4, ri) - 0.5) * 0.7);
    g.add(b);
  }
  return g;
}

// ---------------------------------------------------------------- set builders
const BUILD = {
  arena(set, ri, opts) {
    const R = REGIONS[ri], pal = R.pal;
    const W = opts.width ?? 9.5;
    const F = (x, z) => {
      const flat = smoothstep(4.5, 7.5, Math.abs(x)) * 0.5 + smoothstep(-1.5, -4.5, z) * 0.4;
      return Math.max(0, flat) + cnoise(x, z, 5, 0.8) * 0.12 * flat;
    };
    const floorAt = ground(F, 0.1, 0, -7.5);
    const backZ = (x, y) => -4.7 + cnoise(x, y, 9, 0.35) * 1.6 + Math.max(0, y - 3.2) * 0.35 - (Math.abs(x) > 7 ? (Math.abs(x) - 7) * -0.6 : 0);
    const paint = painter(ri);
    for (const [x0, x1] of [[-W - 1, -1], [-1, W + 1]]) {
      set.group.add(shellChunk({
        S: 0.1, x0, x1, y0: -0.6, y1: 6.4, z0: -7.5, z1: 4.5,
        floor: (x, z) => (z < backZ(x, 0.2) + 0.3 ? null : F(x, z)), back: backZ, color: paint, seed: 20 + ri,
      }));
    }
    // stalactites from the unseen ceiling
    for (let i = 0; i < 9; i++) {
      const x = -W + (i + 0.5) * (2 * W / 9) + (hash2(i, 3, ri) - 0.5);
      const st = buildProp('stalactite', { length: 8 + Math.floor(hash2(i, 4, ri) * 14), tone: pal.rock.slice(1), tip: ri === 1 ? '#6ad8ff' : ri === 4 ? '#ff6a1a' : null });
      set.add(st, x, 6.0, -2.6 - hash2(i, 5, ri) * 1.8);
    }
    // dressing
    const xs = [-7.2, -4.8, -2.4, 0.2, 2.6, 5.0, 7.3];
    dressRegion(set, ri, xs, floorAt, -3.6, { lights: 4 });
    scatter(set, ri, floorAt, 26, { x0: -7.5, x1: 7.5, z0: -2.8, z1: 2.6 });
    if (ri === 0) set.prop('rails', { length: 2 * W + 2 }, 0, floorAt(0, -2.3), -2.3);
    if (ri === 1 || ri === 3) set.prop('waterpool', { radius: 1.1, sparkle: ri === 1 ? '#9ae8ff' : '#ffe08a', c2: ri === 1 ? '#2a6aa0' : undefined }, -5.6, floorAt(-5.6, -1.9) + 0.01, -1.9);
    if (ri === 2) for (let i = 0; i < 6; i++) set.prop('vines', { glow: '#5af0c8', length: 14 + i * 2 }, -6 + i * 2.3, 5.4, -2.2 - (i % 2));
    if (ri === 5) for (let i = 0; i < 5; i++) set.prop('chains', { length: 2 + hash2(i, 9, 9) * 2 }, -5 + i * 2.6, 6, -2.4 - (i % 2) * 0.8);
    // foreground framing rocks (dark silhouettes near the lens)
    for (const [x, z, s] of [[-5.6, 3.4, 2.2], [5.9, 3.2, 2.6], [-6.8, 2.2, 1.6]]) set.prop('rock', { size: s, tone: pal.rock.slice(0, 3), seed: Math.round(x) }, x, -0.2, z);
    // lights
    hemi(set, pal, R.light, 1.1);
    keySpot(set, mixHex('#' + R.light.key.toString(16).padStart(6, '0'), '#fff2dc', 0.55), 60, [-2.6, 6.5, 6.5], [0.2, 0.6, 0]);
    const rim = new THREE.PointLight(new THREE.Color(R.light.fill), 3, 10, 1.5);
    set.light(rim, 3.5, 3.0, -2.0);
    ambient(set, { 0: ['dust'], 1: ['dust', 'sparkle'], 2: ['spores', 'fireflies'], 3: ['dust', 'gold'], 4: ['embers', 'ash'], 5: ['wisps', 'dust'] }[ri]);
    if (ri === 0 || ri === 1) drips(set, [-3, 1, 4], 5.2, floorAt, ri === 1 ? '#9ae8ff' : '#8ab8c8');
    if (ri === 0 || ri === 1 || ri === 4) bats(set, 4, { x0: -9, x1: 9, y0: 3, y1: 4.5, z0: -3.5, z1: -2 }, ri === 4 ? '#3a2020' : '#2a2230');
    if (ri === 3) { lightShaft(set, -2.5, -2.4, '#ffe0a0', 6.5, 0.9, 0.22); lightShaft(set, 3.4, -3.0, '#ffe0a0', 6.5, 0.7, 0.18); }
    if (ri === 1) lightShaft(set, 1.5, -2.8, '#9ae8ff', 6.5, 0.8, -0.2);
    set.fog.density = 0.042;
    set.anchors = { player: V(-1.6, floorAt(-1.6, 0.4), 0.4), monster: V(1.8, floorAt(1.8, 0.2), 0.2), boss: V(2.6, floorAt(2.6, -0.6), -0.6), forge: V(-3.1, floorAt(-3.1, 0.9), 0.9), center: V(0, 1, 0) };
    set.floorAt = floorAt;
    set.camera = { pos: [0, 1.5, 7.4], look: [0, 1.15, 0], fov: 38 };
    set.spread.set(6, 2.5, 3);
    set.focus.set(0, 1.4, -0.5);
  },

  tomb(set, ri, opts) {
    ri = 5;
    const R = REGIONS[5], pal = R.pal;
    set.region = R; set.regionIdx = 5;
    set.fog.color.set(pal.fog); set.background.set(pal.sky);
    const F = (x, z) => {
      const dais = Math.abs(x) < 2.6 && z < -2.2 && z > -5.4 ? 0.3 + (z < -3.6 ? 0.3 : 0) : 0;
      return dais + smoothstep(7, 10, Math.abs(x)) * 0.6 - 0.05;
    };
    const floorAt = ground(F, 0.1, 0, -8.5);
    const backZ = (x, y) => -6.2 + cnoise(x, y, 31, 0.3) * 0.6 + (Math.abs(x) < 3.4 && y < 6 ? -0.8 : 0) + Math.max(0, y - 5) * 0.3;
    const base = painter(5);
    const paint = (x, y, z, kind, depth) => {
      if (kind === 'floor' && depth === 0) {
        const tile = (Math.floor(x / 0.8) + Math.floor(z / 0.8)) % 2 === 0;
        const ring = Math.abs(Math.hypot(x - 0, (z + 0.2) * 1.6) - 2.6) < 0.06 || Math.abs(Math.hypot(x, (z + 0.2) * 1.6) - 3.4) < 0.05;
        if (ring) return GLOW | 0xc86bff;
        if (Math.abs(x % 0.8) < 0.05 || Math.abs(z % 0.8) < 0.05) return '#1a1420';
        return tile ? pal.rock[3] : pal.rock[2];
      }
      if (kind === 'back' && depth === 0 && y > 1 && y < 5.5 && Math.abs(((x + 20) % 2.4) - 1.2) < 0.06) return GLOW | 0x9a4ad8;
      return base(x, y, z, kind, depth);
    };
    for (const [x0, x1] of [[-12, -1], [-1, 12]]) set.group.add(shellChunk({ S: 0.1, x0, x1, y0: -0.6, y1: 7.2, z0: -8.5, z1: 4.5, floor: (x, z) => (z < backZ(x, 0.2) + 0.3 ? null : F(x, z)), back: backZ, color: paint, seed: 55 }));
    set.prop('sarcophagus', { rune: '#ff5af0' }, 0, floorAt(0, -4.4), -4.4, Math.PI / 2, 2);
    for (const x of [-4.2, 4.2]) set.prop('brazier', { palette: 'purple', intensity: 5 }, x, floorAt(x, -1.5), -1.5, 0, 1.3);
    for (const x of [-7.5, -2.9, 2.9, 7.5]) set.prop('pillar', { tone: ['#3a3448', '#4a425a', '#2c2436', '#52496a'], height: 46, rune: '#c86bff' }, x, floorAt(x, -4.6), -4.6, 0, 1.15);
    for (const x of [-5.2, 5.2]) set.prop('banner', { color: '#3a1a4a', symbol: '#ff5af0' }, x, 4.6, -5.5, 0, 1.3);
    for (let i = 0; i < 7; i++) set.prop('chains', { length: 2.5 + hash2(i, 1, 5) * 2.5 }, -6 + i * 2, 7, -3 - (i % 3) * 0.7);
    for (const [x, z] of [[-6, -2], [6.4, -2.6], [-3, 1.8]]) set.prop('bones', {}, x, floorAt(x, z), z, x);
    set.prop('door', { rune: '#c86bff' }, 0, floorAt(0, -6.2) + 0.5, -6.3, 0, 1.4);
    for (const [x, z, s] of [[-6.4, 3.4, 2.4], [6.6, 3.3, 2.6]]) set.prop('rock', { size: s, tone: pal.rock.slice(0, 3), seed: 9 }, x, -0.2, z);
    hemi(set, pal, R.light, 1.0);
    keySpot(set, '#e8d8ff', 30, [-2.8, 7, 7], [0.4, 0.6, 0]);
    set.light(new THREE.PointLight(0xff5af0, 4, 7, 1.5), 0, 2.6, -3.6);
    lightShaft(set, 0, -3.8, '#c86bff', 7.5, 1.4, 0);
    ambient(set, ['wisps', 'dust']);
    set.fog.density = 0.038;
    set.anchors = { player: V(-1.8, floorAt(-1.8, 0.6), 0.6), monster: V(2.0, floorAt(2, 0), 0), boss: V(2.4, floorAt(2.4, -0.4), -0.4), throne: V(0, floorAt(0, -4.4), -4.4), forge: V(-3.2, floorAt(-3.2, 1), 1.0), center: V(0, 1, 0) };
    set.floorAt = floorAt;
    set.camera = { pos: [0, 2.2, 8], look: [0, 1.3, -0.5], fov: 40 };
    set.spread.set(7, 3, 3);
    set.focus.set(0, 1.6, -0.5);
  },

  campfire(set, ri, opts) {
    const R = REGIONS[0], pal = { ...R.pal, rock: ['#2e221a', '#3e2e22', '#4e3a2c', '#5e4836', '#735a44'], dirt: ['#3a2a1e', '#4a3626', '#5a4430'] };
    set.fog.color.set('#140d0a'); set.background.set('#0a0605');
    const F = (x, z) => cnoise(x, z, 3, 0.6) * 0.04 + smoothstep(4.0, 6.5, Math.hypot(x, z * 1.2)) * 0.5;
    const floorAt = ground(F, 0.1, 0, -6.6);
    const tunnelX = 2.7;
    const backZ = (x, y) => {
      const inTunnel = Math.abs(x - tunnelX) < 1.05 && y < 2.15 + Math.sqrt(Math.max(0, 1.1 - (x - tunnelX) ** 2)) * 0.45;
      if (inTunnel) return null;
      return -4.4 + 0.045 * x * x + cnoise(x, y, 4, 0.4) * 1.2 + Math.max(0, y - 3.4) * 0.45;
    };
    const sideX = (z, y) => 6.4 - 0.03 * z * z + cnoise(z, y, 6, 0.4) * 1.0 + Math.max(0, y - 3.4) * -0.4;
    const paint = rockPainter(pal, { seed: 4, speck: ['#a8743a', '#c8b060', '#6a8a9a'], moss: 0.3 });
    for (const [x0, x1] of [[-7.6, 0], [0, 7.6]]) set.group.add(shellChunk({
      S: 0.1, x0, x1, y0: -0.6, y1: 5.6, z0: -6.6, z1: 5.5,
      floor: F, back: backZ,
      left: x0 < 0 ? (z, y) => -sideX(z, y) : null, right: x0 >= 0 ? (z, y) => sideX(z, y) : null,
      color: paint, seed: 4,
    }));
    // tunnel into the mine
    set.group.add(shellChunk({
      S: 0.1, x0: tunnelX - 1.6, x1: tunnelX + 1.6, y0: -0.4, y1: 3.2, z0: -16, z1: -3.6,
      floor: (x, z) => -0.02 + cnoise(x, z, 8, 1) * 0.05,
      left: (z, y) => tunnelX - 1.0 + cnoise(z, y, 12, 0.8) * 0.18, right: (z, y) => tunnelX + 1.0 + cnoise(z, y, 13, 0.8) * 0.18,
      ceil: (x, z) => 2.2 + Math.sqrt(Math.max(0, 1 - ((x - tunnelX) / 1.0) ** 2)) * 0.4,
      back: (x, y) => -15.5, color: paint, seed: 9, cullBack: false,
    }));
    for (let k = 0; k < 4; k++) set.prop('support', { width: 22, height: 27 }, tunnelX, 0, -4.2 - k * 2.6, 0, 1);
    set.prop('rails', { length: 15 }, tunnelX, 0.0, -8.5, Math.PI / 2);
    set.prop('rails', { length: 3.2 }, tunnelX - 0.35, 0.0, -1.95, Math.PI / 2 + 0.25);
    set.prop('minecart', { ore: '#c8743a' }, tunnelX - 0.1, 0.05, -3.2, Math.PI / 2 + 0.1);
    const deepLight = new THREE.PointLight(0xffa050, 2.2, 6, 1.6);
    set.light(deepLight, tunnelX, 1.2, -12.5);
    set.prop('lantern', { hang: 0.25, intensity: 1.4, distance: 4 }, tunnelX + 0.75, 2.3, -4.05);
    set.prop('signpost', {}, tunnelX - 1.5, floorAt(tunnelX - 1.5, -3.2), -3.2, 0.3);

    // campfire + seats
    set.prop('campfire', { shadow: true, intensity: 8, distance: 11 }, 0, floorAt(0, 0), 0);
    const R0 = 1.55;
    const angles = [165, 118, 62, 15];
    const seatProps = [['log', 0.32], ['crate', 0.42], ['rock', 0.36], ['log', 0.32]];
    set.anchors.seats = [];
    angles.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const x = Math.cos(a) * R0, z = -Math.sin(a) * R0;
      const face = Math.atan2(-x, -z); // rotation.y so +z faces the fire
      const [kind, hgt] = seatProps[i];
      const gy = floorAt(x, z);
      if (kind === 'log') set.add(seatLog(), x, gy, z, face + Math.PI / 2);
      else if (kind === 'crate') set.prop('crate', { size: 7 }, x, gy, z, face);
      else set.prop('rock', { size: 0.7, tone: ['#5a524a', '#665e55', '#4e4740'], seed: 3 }, x, gy - 0.08, z);
      set.anchors['seat' + i] = V(x, gy + hgt, z);
      set.anchors['face' + i] = face;
      set.anchors.seats.push({ pos: V(x, gy + hgt, z), rotY: face, height: hgt });
    });
    // camp dressing
    set.prop('tent', { color: '#b8945a', patch: '#7a4a6a' }, -3.3, floorAt(-3.3, -2.3), -2.3, 0.55);
    set.prop('sleepingbag', { color: '#a83a3a' }, 1.6, floorAt(1.6, -2.6), -2.6, 1.3);
    set.prop('sleepingbag', { color: '#3a5aa0' }, -1.2, floorAt(-1.2, -2.9), -2.9, 1.7);
    set.prop('backpack', { color: '#7a5a2a' }, -2.25, floorAt(-2.25, -0.2), -0.2, 1.1);
    set.prop('backpack', { color: '#4a6a3a' }, 2.25, floorAt(2.25, -0.8), -0.8, -1.2);
    set.prop('backpack', { color: '#6a3a5a' }, -0.1, floorAt(-0.1, -2.3), -2.3, 0.2, 0.9);
    set.prop('cookpot', {}, 0.95, floorAt(0.95, 0.65), 0.65);
    set.prop('map', {}, -0.75, floorAt(-0.75, 1.05), 1.05, 0.25);
    set.prop('books', {}, -1.95, floorAt(-1.95, 0.75), 0.75, 0.4);
    set.prop('anvil', {}, 3.2, floorAt(3.2, 0.6), 0.6, -0.6);
    const pk = set.prop('pickaxe', {}, -4.0, floorAt(-4, -0.6) + 0.02, -0.6, 0.3); pk.rotation.z = 0.35;
    const sh = set.prop('shovel', {}, -4.35, floorAt(-4.35, -0.75) + 0.02, -0.75, 0.6); sh.rotation.z = 0.28;
    set.prop('crate', {}, 4.4, floorAt(4.4, -1.6), -1.6, 0.3);
    set.prop('crate', { size: 8 }, 4.5, floorAt(4.4, -1.6) + 0.6, -1.55, -0.2);
    set.prop('barrel', { content: 'water' }, 4.9, floorAt(4.9, -0.5), -0.5);
    set.prop('lantern', { intensity: 1.6, distance: 4 }, 4.45, floorAt(4.4, -1.6) + 1.08, -1.6);
    set.prop('sack', { ore: '#e0c060' }, 3.9, floorAt(3.9, -0.9), -0.9);
    set.prop('lantern', { intensity: 1.3, distance: 3.5, glow: '#ffd890' }, -2.6, floorAt(-2.6, 0.9), 0.9);
    // rope line with hanging lanterns across the back
    const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-4.8, 3.3, -2.8), V(-1.5, 2.85, -2.2), V(1.4, 2.9, -2.4), V(4.6, 3.4, -3.1)]), 24, 0.012, 3), toon('#8a6a48'));
    set.group.add(line);
    for (const [x, y, z] of [[-2.6, 3.0, -2.45], [0.2, 2.8, -2.25], [2.9, 3.05, -2.7]]) set.prop('lantern', { hang: 0.18, intensity: 1.5, distance: 4.5 }, x, y, z);
    // glowing crystals embedded in the walls (cool contrast)
    for (const [x, y, z, c, s] of [[-5.6, 0, -1.2, '#6ad8ff', 1.4], [-4.7, 0, -3.2, '#b08aff', 1.1], [5.4, 0, -2.6, '#6ad8ff', 1.2], [-1.6, 2.2, -4.2, '#ff8af0', 0.8]]) {
      const cc = set.prop('crystalcluster', { color: c, color2: mixHex(c, '#ffffff', 0.3), size: s, light: 1.6 }, x, y + floorAt(x, z), z);
      if (y > 0) cc.rotation.x = 0.9;
    }
    for (let i = 0; i < 7; i++) set.prop('stalactite', { length: 8 + Math.floor(hash2(i, 1, 2) * 12), tone: pal.rock.slice(1) }, -4.5 + i * 1.5 + hash2(i, 2, 2), 5.2, -3.3 + hash2(i, 3, 2) * 1.4);
    set.prop('mushroom', { glow: '#5af0c8', color: '#3ab08a' }, -5.0, floorAt(-5, 0.8), 0.8, 0.4, 1.4);
    set.prop('mushroom', { glow: '#ffe08a', color: '#d0903a' }, 5.3, floorAt(5.3, 1.2), 1.2, 1.9, 1.2);
    set.prop('rock', { size: 1.2, tone: pal.rock.slice(1), moss: '#4a5a2a', seed: 4 }, -5.4, floorAt(-5.4, 2.0) - 0.1, 2.0);
    set.prop('rock', { size: 0.9, tone: pal.rock.slice(1), seed: 7 }, 5.6, floorAt(5.6, 2.4) - 0.1, 2.4);
    lightShaft(set, -1.8, -3.2, '#ffd8a0', 5.6, 0.55, 0.12);
    // lights
    const h = new THREE.HemisphereLight(0x5a6ab0, 0x1a1210, 0.75);
    set.group.add(h);
    ambient(set, ['dust', 'fireflies']);
    drips(set, [-3.5, 3.8], 5.0, floorAt);
    bats(set, 3, { x0: -7, x1: 7, y0: 3.6, y1: 4.6, z0: -4, z1: -3 });
    set.fog.density = 0.05;
    set.anchors.fire = V(0, floorAt(0, 0), 0);
    set.anchors.mineEntrance = V(tunnelX, 1.0, -4.4);
    set.anchors.mineDeep = V(tunnelX, 0.9, -13);
    set.anchors.center = V(0, 0.8, -0.4);
    set.floorAt = floorAt;
    set.camera = { pos: [0, 2.3, 5.8], look: [0, 0.75, -0.4], fov: 40, orbit: { center: [0, 0.8, -0.4], radius: 6.0, height: 2.3, arc: 0.7 } };
    set.spread.set(5, 2, 3);
    set.focus.set(0, 1.5, -0.5);
  },

  wall(set, ri, opts) {
    const R = REGIONS[ri], pal = R.pal;
    const cell = 0.32, n = 7, gw = cell * n;
    const gx0 = -gw / 2, gy1 = 0.42 + gw; // top edge of grid
    const F = (x, z) => cnoise(x, z, 3, 0.6) * 0.04 + smoothstep(1.5, 3.5, Math.abs(x)) * 0.25;
    const floorAt = ground(F, 0.08, 0, -2.64);
    const backZ = (x, y) => {
      if (x > gx0 - 0.02 && x < -gx0 + 0.02 && y > 0.4 && y < gy1 + 0.02) return -1.6;
      const rim = Math.max(0, 1 - Math.max(Math.abs(x) - gw / 2, Math.abs(y - (gy1 + 0.42) / 2) - gw / 2) / 0.6);
      return -1.0 + cnoise(x, y, 17, 0.6) * 0.45 + rim * 0.12 + Math.max(0, Math.abs(x) - 3.2) * 0.5;
    };
    const paint = painter(ri);
    set.group.add(shellChunk({ S: 0.08, x0: -6.56, x1: 6.56, y0: -0.4, y1: 5.2, z0: -2.64, z1: 4.0, floor: (x, z) => (z < backZ(x, 0.1) + 0.2 ? null : F(x, z)), back: backZ, color: paint, seed: 40 + ri }));
    // frame around the dig site
    const frameY = 0.4;
    if (ri === 0 || ri === 3) {
      const sup = buildProp('support', { width: 34, height: 37 }, {});
      set.add(sup, 0, frameY - 0.4, -0.95, 0, 1);
    } else if (ri === 1) {
      for (const [x, y, c] of [[-1.5, 0, '#6ad8ff'], [1.55, 0, '#ff8af0'], [-1.3, 2.75, '#b08aff'], [1.4, 2.7, '#6ad8ff']]) {
        const cc = set.prop('crystalcluster', { color: c, color2: mixHex(c, '#fff', 0.3), size: 1.1, light: y < 1 ? 1.8 : 0 }, x, y + floorAt(x, -0.8), -0.85);
        if (y > 1) cc.rotation.z = Math.PI * (x > 0 ? 0.7 : -0.7);
      }
    } else if (ri === 2) {
      set.prop('mushroom', { giant: true, height: 22, radius: 9, color: '#d04a8a', glow: '#5af0c8', light: 2 }, -2.4, floorAt(-2.4, -0.9), -1.0, 0.3);
      set.prop('mushroom', { glow: '#ffe08a', color: '#d0903a' }, 1.7, floorAt(1.7, -0.6), -0.6, 0, 1.5);
      set.prop('vines', { glow: '#5af0c8', length: 18 }, 0.4, 3.6, -1.05);
    } else if (ri === 4) {
      set.prop('lavapool', { radius: 0.8, light: 2.5 }, 2.6, floorAt(2.6, -0.2), -0.2);
      set.prop('vent', {}, -2.4, floorAt(-2.4, -0.5), -0.5);
    } else if (ri === 5) {
      set.prop('brazier', { palette: 'purple', intensity: 2.8 }, -1.9, floorAt(-1.9, -0.6), -0.6);
      set.prop('brazier', { palette: 'purple', intensity: 2.8 }, 1.9, floorAt(1.9, -0.6), -0.6);
      set.prop('chains', { length: 1.6 }, -1.4, 3.2, -0.95); set.prop('chains', { length: 1.2 }, 1.3, 3.2, -0.95);
    }
    if (ri !== 5) {
      set.prop('lantern', { intensity: 1.8, distance: 4.5 }, -1.85, floorAt(-1.85, -0.4), -0.4);
      set.prop('lantern', { intensity: 1.6, distance: 4.5 }, 2.0, floorAt(2.0, -0.3), -0.3);
    }
    set.prop('pickaxe', {}, -2.6, floorAt(-2.6, 0.2) + 0.01, 0.2, 0.4).rotation.z = 1.35;
    set.prop('sack', {}, 2.7, floorAt(2.7, 0.4), 0.4);
    set.prop('rock', { size: 0.6, tone: pal.rock.slice(1), seed: 2 }, -1.1, floorAt(-1.1, 0.5) - 0.05, 0.5);
    set.prop('rock', { size: 0.45, tone: pal.rock.slice(1), seed: 5 }, 1.0, floorAt(1, 0.7) - 0.05, 0.7);
    if (ri === 0) set.prop('minecart', { empty: false, ore: '#8e8a92' }, 3.6, floorAt(3.6, -0.6), -0.6, -0.3);
    hemi(set, pal, R.light, 1.2);
    keySpot(set, mixHex('#' + R.light.key.toString(16).padStart(6, '0'), '#fff4e0', 0.7), 26, [0.5, 4.5, 5], [0, 1.3, -1], true);
    ambient(set, { 0: ['dust'], 1: ['sparkle', 'dust'], 2: ['spores'], 3: ['dust', 'gold'], 4: ['embers', 'ash'], 5: ['wisps'] }[ri]);
    set.fog.density = 0.03;
    set.anchors.gridOrigin = V(gx0, gy1, -1.0);
    set.anchors.gridCenter = V(0, gy1 - gw / 2, -1.0);
    set.anchors.cell = cell;
    set.anchors.player = V(-1.4, floorAt(-1.4, 0.9), 0.9);
    set.floorAt = floorAt;
    set.camera = { pos: [0, 1.62, 4.6], look: [0, 1.5, -1], fov: 42 };
    set.spread.set(3, 1.6, 1.5);
    set.focus.set(0, 1.5, 0);
  },

  room(set, ri, opts) {
    const R = REGIONS[ri], pal = R.pal;
    const room = opts.room || 'event';
    const F = (x, z) => cnoise(x, z, 3, 0.6) * 0.04 + smoothstep(3.5, 6.5, Math.abs(x)) * 0.4;
    const floorAt = ground(F, 0.1, 0, -7);
    const backZ = (x, y) => -3.8 + 0.06 * x * x + cnoise(x, y, 21, 0.4) * 1.0 + Math.max(0, y - 3.4) * 0.35;
    const paint = painter(ri);
    for (const [x0, x1] of [[-7.5, 0], [0, 7.5]]) set.group.add(shellChunk({ S: 0.1, x0, x1, y0: -0.6, y1: 5.8, z0: -7, z1: 4.4, floor: (x, z) => (z < backZ(x, 0.2) + 0.3 ? null : F(x, z)), back: backZ, color: paint, seed: 60 + ri }));
    dressRegion(set, ri, [-5.6, -3.6, 3.7, 5.7], floorAt, -2.9, { lights: 3, statue: room !== 'merchant' });
    scatter(set, ri, floorAt, 16, { x0: -5.5, x1: 5.5, z0: -2.2, z1: 2.4 }, { x: 2.6, z: 1.4 });
    for (let i = 0; i < 6; i++) set.prop('stalactite', { length: 8 + Math.floor(hash2(i, 1, ri) * 10), tone: pal.rock.slice(1), tip: ri === 1 ? '#6ad8ff' : null }, -4 + i * 1.6, 5.4, -2.2 - hash2(i, 2, ri));
    const A = (set.anchors = { center: V(0, floorAt(0, 0), 0), player: V(-1.9, floorAt(-1.9, 0.8), 0.8) });
    if (room === 'treasure') {
      for (let i = 0; i < 3; i++) A['chest' + i] = V(-1.5 + i * 1.5, floorAt(-1.5 + i * 1.5, -0.6), -0.6);
      set.prop('goldpile', {}, -2.6, floorAt(-2.6, -1.2), -1.2, 0.3, 1.4);
      set.prop('goldpile', {}, 2.5, floorAt(2.5, -1.0), -1.0, 1.2);
      lightShaft(set, 0, -0.8, '#ffe8b0', 5.8, 1.6, 0.05);
      set.light(new THREE.PointLight(0xffd890, 3, 6, 1.5), 0, 2.6, 0.6);
      set.emitters.push((dt) => { if (rnd.chance(dt * 6)) set.P.add.emit({ pos: [rnd.float(-2, 2), rnd.float(0.2, 2.5), rnd.float(-1.2, 0)], vel: [0, 0.05, 0], life: [0.6, 1.4], size: 1, color: ['#fff0a0', '#ffffff'], glow: 3, flicker: 0.5 }); });
    } else if (room === 'merchant') {
      set.prop('merchantcart', {}, 1.0, floorAt(1, -1.5), -1.5, -0.12);
      set.prop('crate', {}, -0.9, floorAt(-0.9, -1.2), -1.2, 0.3);
      set.prop('barrel', {}, -0.25, floorAt(-0.25, -1.6), -1.6);
      set.prop('sack', { ore: '#9aa3b2' }, -1.25, floorAt(-1.25, -0.6), -0.6);
      A.merchant = V(-0.2, floorAt(-0.2, -0.5), -0.5);
      if (opts.npc !== false) set.anchors.npc = set.prop('mole', {}, -0.2, floorAt(-0.2, -0.5), -0.5, 0.25);
      A.cart = V(1.0, floorAt(1, -1.5), -1.5);
      set.light(new THREE.PointLight(0xffc070, 2.5, 6, 1.5), 0.2, 2.3, 0.8);
    } else if (room === 'camp') {
      set.prop('campfire', { shadow: true, intensity: 6.5 }, 0, floorAt(0, -0.2), -0.2);
      set.add(seatLog(), -1.3, floorAt(-1.3, 0.25), 0.25, 0.4);
      set.prop('tent', { color: '#8a9a6a' }, 2.6, floorAt(2.6, -1.6), -1.6, -0.6);
      set.prop('sleepingbag', { color: '#6a4a8a' }, -1.9, floorAt(-1.9, -1.2), -1.2, 1.4);
      set.prop('anvil', {}, 1.7, floorAt(1.7, 0.5), 0.5, -0.4);
      A.fire = V(0, floorAt(0, -0.2), -0.2);
      A.seat = V(-1.3, floorAt(-1.3, 0.25) + 0.32, 0.25);
      A.anvil = V(1.7, floorAt(1.7, 0.5), 0.5);
    } else {
      set.light(new THREE.SpotLight(new THREE.Color(R.pal.glow), 18, 12, 0.5, 0.7, 1.4), 0, 5.2, 1.2);
      A.prop = V(0.6, floorAt(0.6, -0.8), -0.8);
    }
    hemi(set, pal, R.light, 1.0);
    keySpot(set, mixHex('#' + R.light.key.toString(16).padStart(6, '0'), '#fff2dc', 0.55), 24, [-2.2, 6, 6], [0, 0.6, -0.3]);
    ambient(set, { 0: ['dust'], 1: ['sparkle', 'dust'], 2: ['spores', 'fireflies'], 3: ['dust', 'gold'], 4: ['embers', 'ash'], 5: ['wisps', 'dust'] }[ri]);
    set.fog.density = 0.045;
    set.floorAt = floorAt;
    set.camera = { pos: [0, 2.0, 6.2], look: [0, 0.9, -0.5], fov: 38 };
    set.spread.set(4.5, 2, 2.5);
    set.focus.set(0, 1.3, -0.5);
  },

  corridor(set, ri, opts) {
    const R = REGIONS[ri], pal = R.pal;
    const L = opts.length ?? 40;
    const tunnel = opts.tunnel || 'tunnel';
    const bridge = /bridge/.test(tunnel);
    const S = 0.14, OX = -42 * S, CW = 64 * S, OZ = -36 * S;
    const gap0 = L * 0.3, gap1 = L * 0.7; // chasm span for bridges
    const elevX0 = L * 0.42, elevX1 = L * 0.5, drop = 4.2;
    const ease = (t) => t * t * (3 - 2 * t);
    const hills = (x) => 0.32 * Math.sin(x * 0.19) + 0.18 * Math.sin(x * 0.47 + 1.3);
    const crawl = tunnel === 'crawl';
    const flooded = tunnel === 'flooded';
    let bridgeObj = null;
    const bridgeY = (x) => (bridgeObj ? bridgeObj.userData.yAt(x - (gap0 + gap1) / 2) : 0);
    // continuous path height (also where the floor voxels are seeded)
    const pathF = (x) => {
      switch (tunnel) {
        case 'stairs': return -Math.floor(ease(clamp((x - L * 0.2) / (L * 0.6))) * 14) * 0.25;
        case 'elevator': return x < elevX0 ? hills(x) * 0.5 : x > elevX1 ? -drop + hills(x) * 0.5 : lerp(hills(elevX0) * 0.5, -drop + hills(elevX1) * 0.5, ease((x - elevX0) / (elevX1 - elevX0)));
        case 'flooded': return -0.62;
        case 'crawl': return hills(x) * 0.6;
        default: return hills(x) * (bridge ? smoothstep(gap0 + 2, gap0 - 3, x) + smoothstep(gap1 - 2, gap1 + 3, x) : 1);
      }
    };
    const inGap = (x) => bridge && x > gap0 + 0.4 && x < gap1 - 0.4;
    const inShaft = (x) => tunnel === 'elevator' && x > elevX0 + 0.3 && x < elevX1 - 0.3;
    // openings in the back wall reveal the deep cavern
    const openings = [];
    for (let i = 0; i < 3; i++) openings.push(L * (0.16 + i * 0.34) + (hash2(i, ri, 3) - 0.5) * 3);
    const openAt = (x, y) => openings.some((ox) => !inGap(ox) && Math.abs(x - ox) < 2.2 - Math.max(0, y - pathF(ox) - 2.4) * 0.7) && y > pathF(x) + 0.45;
    const backZ = (x, y) => {
      if (inGap(x)) return y < 5 ? -7.2 + cnoise(x, y, 23, 0.3) * 1.6 : -3.4;
      if (!crawl && openAt(x, y)) return null;
      return -3.0 + cnoise(x, y, 7 + ri, 0.4) * 1.2 + Math.max(0, y - pathF(x) - 3) * 0.3;
    };
    const F = (x, z) => {
      if (inGap(x) || (inShaft(x) && Math.abs(z) < 1.4)) return null;
      const base = pathF(x);
      return base + (Math.abs(z) > 0.9 ? cnoise(x, z, 3, 0.7) * 0.16 * (Math.abs(z) - 0.9) : 0) + smoothstep(-1.2, -2.6, z) * 0.35;
    };
    const G = ground(F, S, OX, OZ);
    const walkGround = walker(G, S, OX, 0);
    const pathY = (x) => (inGap(x) ? bridgeY(x) + 0.04 : flooded ? -0.62 + S : walkGround(x) ?? pathF(x));
    const paint = painter(ri, { lift: 0.1 });
    const ceilY = (x, z) => pathF(x) + 2.4 + cnoise(x, z, 33, 0.8) * 0.3;
    const x0 = OX, x1 = L + 6;
    for (let cx = x0; cx < x1; cx += CW) {
      const lo = Math.min(pathF(cx), pathF(Math.min(x1, cx + CW)), 0);
      const yb = Math.floor((Math.min(-1, lo - 1.2)) / S) * S;
      set.group.add(shellChunk({
        S, x0: cx, x1: cx + CW, y0: bridge && cx + CW > gap0 && cx < gap1 ? Math.floor(-9 / S) * S : yb, y1: Math.max(pathF(cx), 0) + 6.4, z0: OZ, z1: 3.6,
        floor: (x, z) => (z < -2.9 ? null : F(x, z)), back: backZ, ceil: crawl ? ceilY : null, color: paint, seed: 70 + ri,
      }));
    }
    // deep background cavern seen through the openings: coarse & fogged
    if (!crawl) for (let cx = x0; cx < x1; cx += 12) {
      const lo = Math.min(pathF(cx), pathF(Math.min(x1, cx + 12)));
      set.group.add(shellChunk({
        S: 0.28, x0: cx, x1: Math.min(x1, cx + 12), y0: lo - 4.5, y1: Math.max(pathF(cx), 0) + 6.5, z0: -15, z1: -5,
        floor: (x, z) => (bridge && x > gap0 - 2 && x < gap1 + 2 ? null : pathF(x) - 1.8 + cnoise(x, z, 5, 0.3) * 1.4), back: (x, y) => -12.5 + cnoise(x, y, 19, 0.2) * 2.2, color: paint, seed: 90 + ri,
      }));
    }
    const glowHex = { 0: '#ffb060', 1: '#6ad8ff', 2: '#5af0c8', 3: '#ffc060', 4: '#ff6a1a', 5: '#c86bff' }[ri];
    // chasm: bridge, cliff edges, rising spires and a glowing abyss
    if (bridge) {
      const mid = (gap0 + gap1) / 2, span = gap1 - gap0 + 1.2;
      if (tunnel === 'lavabridge') {
        for (let x = gap0 + 0.8; x < gap1; x += 1.25) set.prop('rock', { size: 0.9, tone: ['#2a2224', '#3a2e2c', '#221a1a'], seed: Math.round(x) }, x, -0.62, (hash2(x | 0, 1, 1) - 0.5) * 0.3);
        bridgeObj = { userData: { yAt: (dx) => -0.05 + Math.abs(Math.sin((dx + mid) * 2.5)) * 0.08 } };
        const lava = new THREE.Mesh(new THREE.PlaneGeometry(span + 4, 10).rotateX(-Math.PI / 2), surfaceMat('lava', {}));
        lava.position.set(mid, -2.2, -2.5);
        set.group.add(lava);
        set.updaters.push((dt, t) => { lava.material.uniforms.time.value = t; });
        for (const x of [gap0 + 3, gap1 - 3]) set.light(new THREE.PointLight(0xff5a1a, 7, 10, 1.4), x, -1.2, -1.5);
      } else {
        bridgeObj = buildProp('ropebridge', { length: span, sag: 0.35 });
        const recolor = { chainbridge: ['#5a5260', '#7a7286'], crystalbridge: ['#7ab0e0', '#c0e8ff'], rootbridge: ['#5a4030', '#7a6040'] }[tunnel];
        if (recolor) bridgeObj.traverse((o) => { if (o.isInstancedMesh) o.material = toon(recolor[0]); else if (o.isMesh) o.material = toon(recolor[1]); });
        set.add(bridgeObj, mid, 0, 0);
        for (const x of [gap0 - 0.3, gap1 + 0.3]) for (const z of [-0.42, 0.42]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 6), toon('#5a3a22'));
          post.position.set(x, pathF(x) + 0.35, z); post.castShadow = true;
          set.group.add(post);
        }
        for (const x of [gap0 - 0.3, gap1 + 0.3]) set.prop('lantern', { hang: 0.12, intensity: 2.2, distance: 6 }, x, pathF(x) + 1.0, -0.42);
        set.prop('lantern', { hang: 0.3, intensity: 1.8, distance: 5, light: true }, mid, 0.45, -0.38);
        if (tunnel === 'crystalbridge') for (let x = gap0; x < gap1; x += 3) set.prop('crystal', { color: '#9ae8ff', size: 0.5 }, x, bridgeY(x) - 0.05, 0.42, x);
      }
      // abyss glow + light
      const glowMat = new THREE.ShaderMaterial({
        uniforms: { c: { value: new THREE.Color(glowHex) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 c; varying vec2 vUv; void main(){ vec2 d = vUv - 0.5; float a = smoothstep(0.5, 0.0, length(d * vec2(1.0, 1.6))); gl_FragColor = vec4(c * a * 0.35, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const abyss = new THREE.Mesh(new THREE.PlaneGeometry(span + 6, 9), glowMat);
      abyss.rotation.x = -Math.PI / 2 + 0.25;
      abyss.position.set(mid, -6.5, -2.5);
      abyss.layers.set(LAYER_FX);
      set.group.add(abyss);
      set.light(new THREE.PointLight(new THREE.Color(glowHex), 9, 14, 1.3), mid, -5, -3);
      // spires rising from the abyss (midground silhouettes)
      for (let i = 0; i < 5; i++) {
        const x = gap0 + 1 + (i + 0.3) * ((gap1 - gap0 - 2) / 5) + (hash2(i, 7, ri) - 0.5);
        const sp = buildProp('stalactite', { length: 70 + Math.floor(hash2(i, 8, ri) * 30), tone: pal.rock.slice(0, 4), tip: ri === 1 ? '#6ad8ff' : ri === 4 ? '#ff6a1a' : ri === 5 ? '#c86bff' : null });
        sp.rotation.x = Math.PI;
        set.add(sp, x, -7.5 + hash2(i, 9, ri) * 1.5, -2.6 - hash2(i, 6, ri) * 2.6);
      }
      // cliff edges
      for (const [ex, dir] of [[gap0, 1], [gap1, -1]]) {
        set.group.add(shellChunk({ S, x0: ex - 1.4, x1: ex + 1.4, y0: -9.1, y1: 0.42, z0: -3.1, z1: 3.5, back: null, floor: null,
          left: dir < 0 ? (z, y) => ex + 0.4 + cnoise(z, y, 41, 0.7) * 0.5 + Math.max(0, -y - 2) * -0.15 : null,
          right: dir > 0 ? (z, y) => ex - 0.4 + cnoise(z, y, 42, 0.7) * 0.5 + Math.max(0, -y - 2) * 0.15 : null,
          color: paint, seed: 44 }));
      }
    }
    if (flooded) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(L + 12, 4.4).rotateX(-Math.PI / 2), surfaceMat('water', { c3: ri === 4 ? '#9ad8ff' : mixHex(pal.water, '#ffffff', 0.5), c2: ri === 4 ? '#3a5a6a' : pal.water }));
      water.position.set(L / 2, -0.12, -0.5);
      set.group.add(water);
      set.updaters.push((dt, t) => { water.material.uniforms.time.value = t; });
    }
    if (tunnel === 'minecart' || (ri === 0 && !flooded && !bridge && tunnel !== 'elevator')) {
      // rails following the ground (short segments so they hug the voxel steps)
      const z = tunnel === 'minecart' ? 0 : -1.25, seg = 1;
      for (let x = -4; x < L + 4; x += seg) {
        const ya = walker(G, S, OX, z)(x) ?? pathF(x), yb = walker(G, S, OX, z)(x + seg) ?? pathF(x + seg);
        const r = set.prop('rails', { length: Math.hypot(seg, yb - ya) + 0.02 }, x + seg / 2, (ya + yb) / 2 - 0.02, z);
        r.rotation.z = Math.atan2(yb - ya, seg);
      }
      if (tunnel === 'minecart') set.anchors.cart = V(0, pathY(0), 0);
    }
    if (tunnel === 'elevator') {
      const plat = buildProp('elevator', {});
      set.add(plat, (elevX0 + elevX1) / 2, 0, -0.2);
      set.anchors.elevatorTop = V(elevX0, pathY(elevX0), 0);
      set.anchors.elevatorBottom = V(elevX1, pathY(elevX1), 0);
      set.elevator = plat;
      set.updaters.push(() => {
        const k = clamp((set.focus.x - elevX0) / (elevX1 - elevX0));
        plat.position.y = lerp(pathF(elevX0), pathF(elevX1), ease(k)) - 0.12;
      });
      for (let y = -drop; y < 3; y += 1.2) set.prop('support', { width: 20, height: 14 }, (elevX0 + elevX1) / 2, y, -1.5);
    }
    const floorAt = (x, z) => G(x, z) ?? pathY(x);
    // midground dressing
    const xs = [];
    for (let x = 2; x < L - 1; x += 4.4 + hash2(x | 0, ri, 9) * 1.4) if (!inGap(x) && !(tunnel === 'elevator' && x > elevX0 - 1.5 && x < elevX1 + 1.5)) xs.push(x);
    dressRegion(set, ri, xs, floorAt, -2.25, { lights: 7, statue: !crawl, low: crawl });
    scatter(set, ri, floorAt, Math.round(L * 0.7), { x0: -2, x1: L + 2, z0: -2.2, z1: 2.6 }, { x: 0, z: 0.75 });
    // foreground silhouettes: low rocks at the bottom of the frame
    for (let x = 3; x < L + 3; x += 7 + hash2(x | 0, 2, ri) * 5) {
      if (inGap(x)) continue;
      const h = hash2(x | 0, 5, ri);
      if (ri === 5 && h < 0.4) set.prop('chains', { length: 2.6 }, x, pathF(x) + 4.4, 2.6);
      else if (ri === 2 && h < 0.4) set.prop('mushroom', { color: '#2a4a3a', glow: '#5af0c8' }, x, pathF(x) - 0.2, 2.9, h, 2.2);
      else set.prop('rock', { size: 1.0 + h * 1.2, tone: pal.rock.slice(0, 3), seed: x | 0 }, x, pathF(x) - 0.75, 3.4 + h * 0.3);
    }
    // stalactites / vines hanging near the path
    for (let x = 0; x < L; x += 2.2 + hash2(x | 0, 8, ri) * 2) {
      const yTop = pathF(x) + (crawl ? 2.4 : 4.2);
      if (ri === 2) set.prop('vines', { glow: '#5af0c8', length: 10 + Math.floor(hash2(x | 0, 9, 1) * 12) }, x, yTop, -1.6);
      else set.prop('stalactite', { length: 6 + Math.floor(hash2(x | 0, 9, ri) * 10), tone: pal.rock.slice(1), tip: ri === 1 ? '#6ad8ff' : ri === 4 ? '#ff6a1a' : null }, x, yTop, -1.4 - hash2(x | 0, 3, 3) * 1.2);
    }
    // distant life seen through openings
    if ((ri === 0 || ri === 4) && !crawl) {
      const cart = buildProp('minecart', { ore: ri === 4 ? '#ff6a2a' : '#c8743a' });
      set.add(cart, 0, -1.6, -10.5, 0, 1.2);
      let cx = -10;
      set.updaters.push((dt) => { cx += dt * 2.2; if (cx > L + 10) cx = -10; cart.position.x = cx; cart.position.y = pathF(cx) - 1.75 + Math.sin(cx * 0.4) * 0.04; });
      const lamp = new THREE.PointLight(ri === 4 ? 0xff7a2a : 0xffb060, 2.5, 5, 1.6);
      cart.add(lamp); lamp.position.set(0, 1.2, 0.4);
    }
    if (!crawl) for (const ox of openings) {
      if (inGap(ox)) continue;
      set.light(new THREE.PointLight(new THREE.Color(glowHex), 5, 10, 1.3), ox, pathF(ox) + 1.4, -8.5);
      if (ri === 2) set.prop('mushroom', { giant: true, height: 30, radius: 12, color: '#d04a8a', glow: '#5af0c8', light: 0 }, ox + 1.5, pathF(ox) - 1.8, -10.5);
      if (ri === 1) set.prop('crystalcluster', { color: '#6ad8ff', color2: '#ff8af0', size: 2.4, light: 0 }, ox, pathF(ox) - 1.6, -10);
      if (ri === 3) set.prop('statue', {}, ox, pathF(ox) - 1.9, -11, 0, 1.6);
      if (ri === 4) set.prop('lavapool', { radius: 2.2, light: 0 }, ox, pathF(ox) - 1.75, -9.5);
      if (ri === 5) set.prop('sarcophagus', {}, ox, pathF(ox) - 1.8, -10, 1.4, 1.5);
      if (ri === 0) set.prop('support', { width: 20, height: 26 }, ox - 1, pathF(ox) - 1.8, -10.6);
    }
    // the explorer carries a lantern; plus soft key & region ambience
    set.walkerLight = new THREE.PointLight(0xffc888, 5, 9, 1.3);
    set.group.add(set.walkerLight);
    hemi(set, pal, R.light, 2.4);
    const key = new THREE.DirectionalLight(new THREE.Color(mixHex('#' + R.light.key.toString(16).padStart(6, '0'), '#ffffff', 0.5)), 1.7);
    key.position.set(-2, 6, 6);
    set.group.add(key);
    ambient(set, { 0: ['dust'], 1: ['dust', 'sparkle'], 2: ['spores', 'fireflies'], 3: ['dust', 'gold'], 4: ['embers', 'ash'], 5: ['wisps', 'dust'] }[ri]);
    if (ri <= 1 || flooded || crawl) set.emitters.push((dt) => {
      if (!rnd.chance(dt * 2.5)) return;
      const x = set.focus.x + rnd.float(-6, 6);
      const fy = flooded ? -0.12 : floorAt(x, -0.6);
      set.P.alpha.emit({ pos: [x, pathF(x) + (crawl ? 2.3 : 4), rnd.float(-1.8, 0.4)], vel: [0, -0.2, 0], gravity: 9, life: [1.1, 1.3], size: 1, color: ri === 1 ? '#9ae8ff' : '#8ab8c8', alpha: 0.9, floor: fy + 0.02, bounce: 0.2 });
    });
    if (ri === 0 || ri === 1 || ri === 4) bats(set, 4, { x0: -10, x1: 10, y0: 2.5, y1: 4, z0: -8, z1: -5, follow: true }, ri === 4 ? '#3a2020' : '#2a2230');
    const haze = new THREE.Color(mixHex(pal.fog, glowHex, 0.1));
    set.fog.color.copy(haze); set.background.copy(haze);
    set.fog.density = 0.042;
    set.pathY = pathY;
    set.floorAt = floorAt;
    set.length = L;
    set.tunnel = tunnel;
    const spots = [0.22, 0.5, 0.78].map((k) => { let x = L * k; if (inGap(x)) x = k < 0.5 ? gap0 - 1.5 : gap1 + 1.5; if (inShaft(x)) x = elevX1 + 2; return V(x, floorAt(x, -0.75), -0.75); });
    Object.assign(set.anchors, { start: V(0, pathY(0), 0), end: V(L, pathY(L), 0), spots });
    set.camera = { pos: [0, pathY(0) + 1.7, 6.6], look: [0, pathY(0) + 0.9, 0], fov: 36, follow: { dy: 1.7, dz: 6.6, lookDy: 0.9 } };
    set.spread.set(7, 2.5, 2.5);
    const baseFollow = set.follow.bind(set);
    set.follow = (x, y) => baseFollow(x, y ?? pathY(x) + 1.2);
    set.follow(0);
  },
};

/** A fallen-log seat. */
function seatLog() {
  const m = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.05, 7), toon('#6a4426'));
  body.rotation.z = Math.PI / 2; body.position.y = 0.17; body.castShadow = true; body.receiveShadow = true;
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.17, 7), toon('#c8a070'));
    cap.position.set(s * 0.526, 0.17, 0); cap.rotation.y = s * Math.PI / 2;
    m.add(cap);
  }
  const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 5), toon('#5a3a22'));
  knot.position.set(0.18, 0.3, 0.1); knot.rotation.x = 0.6;
  const moss = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.2), toon('#4a5a2a'));
  moss.position.set(-0.15, 0.345, 0.02);
  m.add(body, knot, moss);
  return m;
}

/** Build a scene set. kind: campfire | arena | corridor | room | wall | tomb */
export function buildSet(kind, regionIdx = 0, opts = {}) {
  const ri = clamp(regionIdx | 0, 0, 5);
  const set = new EnvSet(kind, kind === 'tomb' ? 5 : ri);
  const b = BUILD[kind];
  if (!b) throw new Error('unknown set kind ' + kind);
  b(set, ri, opts);
  return set;
}

export const SET_KINDS = Object.keys(BUILD);
