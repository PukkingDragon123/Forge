// 2D painted stages: layered pixel-art planes (far → mid → wall → ground → foreground) with 3D actors
// standing inside. Same interface as environments.js EnvSet, so scenes can swap buildSet → buildStage.
//   const st = buildStage('arena', region); st.attach(scene); each frame st.update(dt, t)
// Planes are unlit, fogless and depth-free (painter's order, LAYER_FX) so the post outline/edge passes
// only touch the 3D actors; actor lighting mirrors the painting: warm key pools, teal fill and rim.
import * as THREE from 'three';
import { REGIONS } from '../data/regions.js';
import { paintStage, stageStyle } from '../art/backdrops.js';
import { paintBridge, paintElevator, paintStairs, paintWater, paintForeground } from '../art/backdrop_parts.js';
import { CAM, VH, ppuAt, flatGeo } from '../art/backdrop_geo.js';
import { Img, hp, hash, qt, wob, mixHex } from '../art/backdrop_kit.js';
import { buildProp, tickProps } from './props.js';
import { ParticleSystem } from '../gfx/particles.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { toon } from '../gfx/materials.js';
import { noise2, clamp, smoothstep } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MAX_TEX = 2048; // split wide paintings into tiles every GPU accepts

// ---------------------------------------------------------------------------- textures/planes
function tex(canvas, { mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mips ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter;
  t.generateMipmaps = mips;
  t.anisotropy = 1;
  return t;
}
function basicMat(map, o = {}) {
  return new THREE.MeshBasicMaterial({
    map, transparent: !!o.transparent || !!o.additive, alphaTest: o.alphaTest ?? 0, depthTest: o.depthTest ?? false, depthWrite: false,
    fog: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, color: new THREE.Color(0xffffff).multiplyScalar(o.gain ?? 1),
    opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
  });
}
function fxify(m, order) { m.renderOrder = order; m.layers.set(LAYER_FX); m.frustumCulled = false; return m; }
const toCanvas = (c) => (c && c.getContext ? c : c && c.toCanvas ? c.toCanvas() : c);
/** Horizontal tiles of a canvas: [{canvas, f0, f1}] with f = fraction of the full width. */
function tiles(canvas) {
  const W = canvas.width;
  if (W <= MAX_TEX) return [{ canvas, f0: 0, f1: 1 }];
  const n = Math.ceil(W / MAX_TEX), out = [];
  for (let i = 0; i < n; i++) {
    const x0 = Math.round((i * W) / n), x1 = Math.round(((i + 1) * W) / n);
    const c = document.createElement('canvas');
    c.width = x1 - x0; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, -x0, 0);
    out.push({ canvas: c, f0: x0 / W, f1: x1 / W });
  }
  return out;
}
/** Vertical painted plane(s) covering world rect g = {x0,x1,y0,y1,z}. */
function vplanes(group, canvas, g, order, o = {}) {
  const out = [];
  for (const t of tiles(toCanvas(canvas))) {
    const xa = g.x0 + (g.x1 - g.x0) * t.f0, xb = g.x0 + (g.x1 - g.x0) * t.f1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa, g.y1 - g.y0), basicMat(tex(t.canvas, o), o));
    m.position.set((xa + xb) / 2, (g.y0 + g.y1) / 2, g.z + (o.dz || 0));
    group.add(fxify(m, order));
    out.push(m);
  }
  return out;
}
/** Ground strips: segments [{xa,xb,ya,yb}] across z0..z1, textured by x over the full ground canvas. */
function groundPlanes(group, canvas, g, segs, order, o = {}) {
  const out = [];
  for (const t of tiles(toCanvas(canvas))) {
    const tx0 = g.x0 + (g.x1 - g.x0) * t.f0, tx1 = g.x0 + (g.x1 - g.x0) * t.f1;
    const pos = [], uv = [], idx = [];
    const ZN = 6;
    for (const s of segs) {
      const xa = Math.max(s.xa, tx0), xb = Math.min(s.xb, tx1);
      if (xb <= xa) continue;
      const yAt = (x) => s.ya + (s.yb - s.ya) * ((x - s.xa) / (s.xb - s.xa || 1));
      const base = pos.length / 3;
      for (let k = 0; k <= ZN; k++) {
        const z = g.z0 + ((g.z1 - g.z0) * k) / ZN, v = 1 - k / ZN;
        pos.push(xa, yAt(xa), z, xb, yAt(xb), z);
        uv.push((xa - tx0) / (tx1 - tx0), v, (xb - tx0) / (tx1 - tx0), v);
      }
      for (let k = 0; k < ZN; k++) { const a = base + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, basicMat(tex(t.canvas, o), o));
    group.add(fxify(m, order));
    out.push(m);
  }
  return out;
}
/** Cylindrical backdrop for orbiting cameras: canvas x = arc length (centre column faces -z). */
function cyclorama(group, canvas, radius, y0, y1, order, o = {}) {
  const geo = new THREE.CylinderGeometry(radius, radius, y1 - y0, 128, 1, true);
  const m = new THREE.Mesh(geo, basicMat(tex(toCanvas(canvas), o), { ...o, side: THREE.DoubleSide }));
  m.position.y = (y0 + y1) / 2;
  m.scale.x = -1; // read left→right from inside
  group.add(fxify(m, order));
  return m;
}

// ---------------------------------------------------------------------------- animated flames
const flameCache = new Map();
/** 6-frame hand-drawn flame: licking tongues with a dark-red rim, orange body, yellow-white core. */
function flameStrip(palette) {
  if (flameCache.has(palette)) return flameCache.get(palette);
  const pals = {
    fire: ['#5a1004', '#c8380a', '#ff7a1a', '#ffc040', '#fff4c0'],
    purple: ['#2a0650', '#7a2aff', '#c86bff', '#f0c8ff', '#ffffff'],
    green: ['#063a22', '#1aa86a', '#5af0c8', '#d8fff0', '#ffffff'],
    blue: ['#06204a', '#1a5aff', '#6ad8ff', '#e0f8ff', '#ffffff'],
  };
  const c = (pals[palette] || pals.fire).map((h) => hp(h));
  const N = 6, W = 16, H = 26;
  const img = new Img(W * N, H);
  for (let f = 0; f < N; f++) {
    const ph = (f / N) * Math.PI * 2;
    for (let y = 0; y < H; y++) {
      const t = 1 - y / H; // 0 at the base, 1 at the tip
      const sway = Math.sin(ph + t * 3.2) * t * 2.4;
      const half = W * 0.4 * Math.sin(Math.min(1, (1 - t) * 1.3) * Math.PI * 0.6) * (1 - t * 0.3);
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - (W / 2 + sway);
        // tongues: the edge breaks into licks that rise with the frame
        const lick = (wob(t * 6 - f * 0.9 + (dx > 0 ? 3 : 0), 11) - 0.5) * 3.2 * t;
        const e = half + lick;
        if (Math.abs(dx) > e || e <= 0.3) continue;
        const core = 1 - Math.abs(dx) / Math.max(0.6, e);
        const v = core * 2.4 + (1 - t) * 1.9 - 0.4;
        img.set(f * W + x, y, Math.abs(dx) > e - 1 ? c[0] : c[qt(v, x, y, 5)]);
      }
    }
    // a stray spark above the tongue
    img.set(f * W + 6 + (f % 3) * 2, 3 + (f * 3) % 7, c[3]);
  }
  const out = { canvas: img.toCanvas(), N, W, H };
  flameCache.set(palette, out);
  return out;
}

// ---------------------------------------------------------------------------- Stage
export class Stage {
  constructor(kind, ri) {
    this.kind = kind;
    this.regionIdx = ri;
    this.region = REGIONS[ri] || REGIONS[0];
    this.style = stageStyle(ri);
    this.group = new THREE.Group();
    this.group.name = 'stage:' + kind;
    this.lights = [];
    this.anchors = {};
    this.camera = { ...CAM.arena };
    this.floorY = 0;
    this.fog = new THREE.FogExp2(new THREE.Color(this.style.fog), 0.018);
    this.fogDensity = 0.018;
    this.background = new THREE.Color(this.style.sky[0]);
    this.P = { add: new ParticleSystem(1600, { additive: true }), alpha: new ParticleSystem(900) };
    this.group.add(this.P.add.object, this.P.alpha.object);
    this.emitters = [];
    this.updaters = [];
    this.focus = V(0, 1.2, 0);
    this.spread = V(7, 2.5, 3);
    this.t = 0;
    this.flames = [];
    this.pool = [];
    this.sources = [];
    this.is2D = true;
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
  follow(x, y) {
    this.focus.x = x;
    if (y !== undefined) this.focus.y = y;
    const fy = this.pathY ? this.pathY(x) : 0;
    if (this.walkerLight) this.walkerLight.position.set(x + 0.45, fy + 1.3, 0.9);
    if (this.key && this.kind === 'corridor') { this.key.position.set(x - 3, fy + 6, 6); this.key.target.position.set(x + 1, fy, 0); }
    if (this.poolPlanes) for (const p of this.poolPlanes) { p.position.x = x + 0.3; if (p.userData.onFloor) p.position.y = fy + 0.006; else p.position.y = fy + 1.2; }
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
    }
    // corridor light pool: pooled point lights jump to the painted sources nearest the walker
    if (this.pool.length && this.sources.length) {
      const fx = this.focus.x;
      const near = this.sources.slice().sort((a, b) => Math.abs(a.x - fx) - Math.abs(b.x - fx)).slice(0, this.pool.length);
      near.forEach((s, i) => { const l = this.pool[i]; l.position.set(s.x, s.y, s.z); l.color.set(s.c); l.distance = s.r; l.intensity = s.i * (0.85 + 0.15 * noise2(this.t * 5, i)); });
    }
    for (const e of this.emitters) e(dt, this.t);
    for (const u of this.updaters) u(dt, this.t);
    this.P.add.update(dt);
    this.P.alpha.update(dt);
  }

  // -------------------------------------------------------------- helpers used by builders
  addFlame(x, y, z, scale = 1, palette = 'fire', withLight = true) {
    const strip = flameStrip(palette);
    const t = tex(strip.canvas, { mips: false });
    t.repeat.set(1 / strip.N, 1);
    t.wrapS = THREE.RepeatWrapping;
    const ppu = 64;
    const w = (strip.W / ppu) * scale, h = (strip.H / ppu) * scale;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basicMat(t, { additive: true, gain: 1.8, depthTest: true }));
    m.geometry.translate(0, h / 2, 0);
    m.position.set(x, y, z);
    this.group.add(fxify(m, 5));
    const col = { fire: 0xff8a30, purple: 0xc86bff, green: 0x5af0c8, blue: 0x6ad8ff }[palette] || 0xff8a30;
    let light = null;
    if (withLight) { light = new THREE.PointLight(col, 2.4 * scale, 5, 1.6); light.position.set(x, y + h * 0.6, z + 0.6); this.group.add(light); this.lights.push(light); }
    this.flames.push({ mesh: m, N: strip.N, acc: rnd.float(0, 6), speed: rnd.float(0, 3), seed: rnd.float(0, 99), sx: 1, sy: 1, light, base: light ? light.intensity : 0 });
    return m;
  }
  /** Actor lighting that matches the painting: teal sky / warm ground hemisphere, warm key, teal rim. */
  addActorLights(sources, wallZ, max = 4, keyX = -3) {
    const S = this.style;
    const hemi = new THREE.HemisphereLight(new THREE.Color(mixHex(S.shadow[3], '#8ad0e0', 0.35)), new THREE.Color(mixHex(S.key, '#2a1408', 0.7)), 1.0);
    this.group.add(hemi);
    const key = new THREE.DirectionalLight(new THREE.Color(mixHex(S.key, '#ffe0b0', 0.45)), 1.9);
    key.position.set(keyX, 5.5, 6);
    key.target.position.set(0, 0.5, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 6; sc.bottom = -3; sc.near = 0.5; sc.far = 30;
    key.shadow.bias = -0.0008; key.shadow.normalBias = 0.03;
    this.group.add(key, key.target);
    this.key = key;
    const rim = new THREE.DirectionalLight(new THREE.Color(mixHex(S.shadow[3], '#6ad0ff', 0.5)), 1.1);
    rim.position.set(3.5, 3, -5);
    this.group.add(rim);
    this.rim = rim;
    this.lights.push(hemi, key, rim);
    const sorted = sources.slice().sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    for (const l of sorted.slice(0, max)) {
      const p = new THREE.PointLight(new THREE.Color(l.c), 2.6 * l.s, l.r * 1.4, 1.5);
      p.position.set(l.x, Math.max(0.6, l.y), wallZ + 1.1);
      this.group.add(p);
      this.lights.push(p);
    }
  }
  shadowCatcher(g, segs) {
    const pos = [], idx = [];
    for (const s of segs) {
      const b = pos.length / 3;
      pos.push(s.xa, s.ya + 0.004, g.z0, s.xb, s.yb + 0.004, g.z0, s.xa, s.ya + 0.004, g.z1, s.xb, s.yb + 0.004, g.z1);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.ShadowMaterial({ color: new THREE.Color(this.style.shadow[0]), opacity: 0.5, depthWrite: false }));
    m.receiveShadow = true;
    m.renderOrder = 2;
    m.layers.set(LAYER_FX);
    this.group.add(m);
  }
  ambient(kinds) {
    const S = this.style;
    const f = this.focus, sp = this.spread;
    const at = () => [f.x + rnd.float(-sp.x, sp.x), f.y + rnd.float(-sp.y * 0.6, sp.y), rnd.float(-sp.z, sp.z * 0.5)];
    for (const k of kinds) {
      this.emitters.push((dt) => {
        if (k === 'dust' && rnd.chance(dt * 9)) this.P.alpha.emit({ pos: at(), vel: [0.05, 0.02, 0], spread: 0.04, life: [3, 6], size: 1, color: mixHex(S.key, '#e8dcc8', 0.6), alpha: 0.5, fadeIn: 1 });
        if (k === 'sparkle' && rnd.chance(dt * 6)) this.P.add.emit({ pos: at(), vel: [0, 0.05, 0], spread: 0.03, life: [0.5, 1.4], size: 1, color: ['#9ae8ff', '#6ad8ff', '#ffffff'], glow: 3, flicker: 0.5 });
        if (k === 'spores' && rnd.chance(dt * 10)) this.P.add.emit({ pos: at(), vel: [0.05, 0.12, 0], spread: 0.06, life: [3, 6], size: 1, color: ['#5af0c8', '#d8ff8a', '#ffe08a'], glow: 2, fadeIn: 0.8, swirl: 0.4 });
        if (k === 'gold' && rnd.chance(dt * 5)) this.P.add.emit({ pos: at(), vel: [0.02, -0.03, 0], spread: 0.02, life: [2, 4], size: 1, color: ['#ffe08a', '#fff4c8'], glow: 2.2, flicker: 0.4 });
        if (k === 'embers' && rnd.chance(dt * 14)) this.P.add.emit({ pos: [f.x + rnd.float(-sp.x, sp.x), -0.2, rnd.float(-sp.z, sp.z * 0.5)], vel: [rnd.float(-0.1, 0.2), rnd.float(0.6, 1.2), 0], spread: 0.15, life: [1.5, 3.5], size: 1, color: ['#ffb43a', '#ff6a1a', '#ffe08a'], colorEnd: '#ff2a00', glow: 3, swirl: 0.6 });
        if (k === 'ash' && rnd.chance(dt * 5)) this.P.alpha.emit({ pos: at(), vel: [0.1, -0.08, 0], spread: 0.05, life: [3, 6], size: 1, color: '#3a3438', alpha: 0.7 });
        if (k === 'wisps' && rnd.chance(dt * 4)) this.P.add.emit({ pos: at(), vel: [0, 0.18, 0], spread: 0.08, life: [2, 4], size: [1, 2], color: ['#d070ff', '#9affc8'], glow: 2.5, swirl: 0.8, fadeIn: 0.5 });
      });
    }
  }
  drips(xs, top, color) {
    this.emitters.push((dt) => {
      if (!rnd.chance(dt * 2.2)) return;
      const x = rnd.pick(xs) + (this.kind === 'corridor' ? this.focus.x : 0);
      this.P.alpha.emit({ pos: [x, top, rnd.float(-1.6, -0.4)], vel: [0, -4.2, 0], life: [0.7, 0.9], size: 1, color, alpha: 0.9, floor: this.floorAt(x), bounce: 0.1 });
    });
  }
}

// ---------------------------------------------------------------------------- flat (side-view) stages
function buildFlat(st, kind, ri, opts) {
  const cam = CAM[kind];
  const L = opts.length || 34;
  const tun = opts.tunnel || 'tunnel';
  const corridor = kind === 'corridor';
  const geo = flatGeo(kind, ri, opts);
  const gx0 = geo.ground.x0, gx1 = geo.ground.x1;
  // ---- path / ground segments
  let pathY = () => 0, segs, gap = null, shaft = null, stairs = null;
  if (corridor && /bridge$/.test(tun)) {
    gap = [Math.round(L * 0.42), Math.round(L * 0.42) + 6];
    pathY = (x) => (x > gap[0] && x < gap[1] ? -0.22 * Math.sin((Math.PI * (x - gap[0])) / (gap[1] - gap[0])) : 0);
    segs = [{ xa: gx0, xb: gap[0], ya: 0, yb: 0 }, { xa: gap[1], xb: gx1, ya: 0, yb: 0 }];
  } else if (corridor && tun === 'elevator') {
    shaft = [Math.round(L * 0.45), Math.round(L * 0.45) + 2.6];
    const drop = -3.4;
    pathY = (x) => (x < shaft[0] ? 0 : x > shaft[1] ? drop : drop * smoothstep(shaft[0], shaft[1], x));
    segs = [{ xa: gx0, xb: shaft[0] - 0.3, ya: 0, yb: 0 }, { xa: shaft[1] + 0.3, xb: gx1, ya: drop, yb: drop }];
  } else if (corridor && tun === 'stairs') {
    stairs = [Math.round(L * 0.45), Math.round(L * 0.45) + 5];
    const drop = -1.6;
    pathY = (x) => (x < stairs[0] ? 0 : x > stairs[1] ? drop : drop * ((x - stairs[0]) / (stairs[1] - stairs[0])));
    segs = [{ xa: gx0, xb: stairs[0], ya: 0, yb: 0 }, { xa: stairs[0], xb: stairs[1], ya: 0, yb: drop }, { xa: stairs[1], xb: gx1, ya: drop, yb: drop }];
  } else if (corridor && tun === 'flooded') {
    pathY = () => -0.34;
    segs = [{ xa: gx0, xb: gx1, ya: -0.62, yb: -0.62 }];
  } else segs = [{ xa: gx0, xb: gx1, ya: 0, yb: 0 }];

  // mining grid rect projected onto the wall plane so the painted frame hugs the 3D tiles
  let grid = null;
  if (kind === 'wall') {
    const cell = 0.32, n = 7, gw = cell * n, gy0 = 0.42, gx = -gw / 2, gzT = -1.0;
    const k = (cam.pos[2] - geo.wall.z) / (cam.pos[2] - gzT);
    const pj = (x, y) => [cam.pos[0] + (x - cam.pos[0]) * k, cam.pos[1] + (y - cam.pos[1]) * k];
    const [ax, ay] = pj(gx, gy0), [bx, by] = pj(-gx, gy0 + gw);
    grid = { x0: ax, x1: bx, y0: ay, y1: by };
    st.anchors.gridOrigin = V(gx, gy0 + gw, gzT);
    st.anchors.gridCenter = V(0, gy0 + gw / 2, gzT);
    st.anchors.cell = cell;
  }
  const painted = paintStage(kind, ri, geo, { ...opts, length: L, gap, grid, seed: opts.seed || 1 });
  const G = st.group;
  // ---- planes in painter's order (actors draw afterwards with depth)
  if (painted.far) {
    vplanes(G, painted.far.canvas, geo.far, -100);
    if (painted.far.glow) vplanes(G, painted.far.glow, geo.far, -99, { additive: true, gain: 1.2, dz: 0.01 });
  }
  if (painted.mid) {
    vplanes(G, painted.mid.canvas, geo.mid, -90, { alphaTest: 0.5 });
    if (painted.mid.glow) vplanes(G, painted.mid.glow, geo.mid, -89, { additive: true, gain: 1.4, dz: 0.01 });
  }
  for (const s of painted.shafts) {
    const [m] = vplanes(G, s.canvas, { x0: s.x - s.w / 2, x1: s.x + s.w / 2, y0: s.y - s.h, y1: s.y, z: s.z }, -85, { additive: true, gain: 0.5, mips: false });
    st.updaters.push((dt, t) => { m.material.opacity = 0.8 + 0.2 * Math.sin(t * 0.6 + s.x); });
  }
  vplanes(G, painted.wall.canvas, geo.wall, -80, { alphaTest: 0.5 });
  if (painted.wall.glow) {
    const gm = vplanes(G, painted.wall.glow, geo.wall, -79, { additive: true, gain: 1.6, dz: 0.01 });
    st.updaters.push((dt, t) => { const o = 0.84 + 0.16 * noise2(t * 3, 5); for (const m of gm) m.material.opacity = o; });
  }
  groundPlanes(G, painted.ground.canvas, geo.ground, segs, -70, { alphaTest: 0.5 });
  if (painted.ground.glow) groundPlanes(G, painted.ground.glow, geo.ground, segs.map((s) => ({ ...s, ya: s.ya + 0.003, yb: s.yb + 0.003 })), -69, { additive: true, gain: 1.5 });
  st.shadowCatcher(geo.ground, segs);

  // ---- animated flames on painted sconces/braziers
  for (const f of painted.flames) st.addFlame(f.x, f.y + 0.04, geo.wall.z + 0.05, (f.s || 1) * 1.1, f.c, false);

  addForeground(st, kind, ri, cam, L, opts.seed || 1);

  // ---- specials
  if (gap) addBridge(st, tun, gap, pathY, ri);
  if (shaft) addElevator(st, shaft, pathY, ri);
  if (stairs) addStairs(st, stairs, pathY, ri);
  if (corridor && tun === 'flooded') addWater(st, geo, ri);

  // ---- lights for actors
  st.sources = painted.lights.filter((l) => l.z < 1.5).map((l) => ({ x: l.x, y: Math.max(0.7, l.y), z: geo.wall.z + 1.1, c: l.c, i: 2.8 * l.s, r: l.r * 1.4 }));
  if (corridor) {
    st.addActorLights([], geo.wall.z, 0);
    for (let i = 0; i < 3; i++) { const p = new THREE.PointLight(0xffffff, 0, 5, 1.5); G.add(p); st.pool.push(p); st.lights.push(p); }
    st.walkerLight = new THREE.PointLight(new THREE.Color(mixHex(st.style.key, '#ffe0b0', 0.4)), 2.2, 5.5, 1.5);
    G.add(st.walkerLight); st.lights.push(st.walkerLight);
    addLanternPool(st, geo);
  } else st.addActorLights(painted.lights.filter((l) => l.z < 1.5), geo.wall.z, kind === 'room' ? 3 : 4);

  // ---- ambience
  st.ambient({ 0: ['dust'], 1: ['dust', 'sparkle'], 2: ['spores', 'dust'], 3: ['dust', 'gold'], 4: ['embers', 'ash'], 5: ['wisps', 'dust'] }[ri]);
  if (ri === 0 || ri === 1 || ri === 2) st.drips([-3, 1.5, 4], corridor && tun === 'crawl' ? 2.4 : 4.0, ri === 1 ? '#9ae8ff' : '#8ac8d0');

  st.pathY = corridor ? pathY : null;
  st.floorAt = (x) => (corridor ? pathY(x) : 0);
  st.camera = { ...cam };
  st.geo = geo;
  return { pathY, gap, shaft, stairs };
}

/** Dark framing close to the camera: rock fangs and roots along the top, rock shoulders in the bottom corners. */
function addForeground(st, kind, ri, cam, L, seed) {
  const z = cam.pos[2] - 2.4;
  const ppu = Math.round(ppuAt(cam, z));
  const halfH = (cam.pos[2] - z) * Math.tan((cam.fov * Math.PI) / 360);
  const yc = cam.pos[1] + (cam.look[1] - cam.pos[1]) * ((cam.pos[2] - z) / (cam.pos[2] - cam.look[2]));
  const top = yc + halfH * 1.04, bottom = yc - halfH * 1.04;
  const xs = kind === 'corridor' ? Array.from({ length: Math.ceil((L + 10) / 3.1) }, (_, i) => -3 + i * 3.1 + (hash(i, 9, ri) - 0.5)) : [-1.95, 1.8];
  xs.forEach((x, i) => {
    if (kind === 'corridor' && hash(i, 7, ri) < 0.35) return;
    const w = halfH * (0.9 + hash(i, 2, ri) * 0.9), h = halfH * (0.28 + hash(i, 3, ri) * 0.22);
    const { img, glow } = paintForeground(ri, Math.round(w * ppu), Math.round(h * ppu), ppu, 'top', seed * 31 + i);
    const g = { x0: x - w / 2, x1: x + w / 2, y0: top - h, y1: top, z };
    vplanes(st.group, img, g, 200, { transparent: true, alphaTest: 0.5 });
    if (ri === 2) vplanes(st.group, glow, g, 201, { additive: true, gain: 1.3, dz: 0.01 });
  });
  if (kind === 'corridor') return;
  const halfW = halfH * (16 / 9);
  for (const [x, where] of [[-halfW * 0.86, 'left'], [halfW * 0.88, 'right']]) {
    const w = halfW * 0.5, h = halfH * 0.3;
    const { img } = paintForeground(ri, Math.round(w * ppu), Math.round(h * ppu), ppu, where, seed * 17 + (where === 'left' ? 1 : 2));
    vplanes(st.group, img, { x0: x - w / 2, x1: x + w / 2, y0: bottom - 0.02, y1: bottom - 0.02 + h, z }, 200, { transparent: true, alphaTest: 0.5 });
  }
}

/** The walker's lantern lights the painting too: stepped warm rings on the floor and the wall that follow them. */
function addLanternPool(st, geo) {
  const ring = (w, h, sy, col) => {
    const img = new Img(w, h), c = new THREE.Color(col);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), ((y + 0.5 - h / 2) / (h / 2)) * sy);
      const a = Math.floor((1 - Math.min(1, d)) ** 1.5 * 4 + (((x & 3) + (y & 3) * 4) / 16 - 0.5) * 0.5) / 4;
      if (a > 0) img.set(x, y, hp('#' + c.clone().multiplyScalar(a).getHexString()));
    }
    return img;
  };
  const warm = mixHex(st.style.key, '#3a1a06', 0.55);
  const floor = ring(512, 128, 1, warm), wall = ring(384, 384, 1, mixHex(warm, '#000000', 0.25));
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.0).rotateX(-Math.PI / 2), basicMat(tex(floor.toCanvas(), { mips: false }), { additive: true, gain: 1 }));
  fm.position.set(0, 0.006, 0.1);
  fm.userData.onFloor = true;
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), basicMat(tex(wall.toCanvas(), { mips: false }), { additive: true, gain: 1 }));
  wm.position.set(0, 1.2, geo.wall.z + 0.02);
  st.group.add(fxify(fm, -68), fxify(wm, -78));
  st.poolPlanes = [fm, wm];
  st.updaters.push((dt, t) => { const k = 0.9 + 0.1 * noise2(t * 4, 3); fm.material.opacity = k; wm.material.opacity = k; });
}

function addBridge(st, tun, gap, pathY, ri) {
  const ppu = 96;
  const x0 = gap[0] - 0.5, x1 = gap[1] + 0.5, top = 1.0, bot = -0.55;
  const w = Math.round((x1 - x0) * ppu), h = Math.round((top - bot) * ppu);
  const deckY = (px) => (top - pathY(x0 + px / ppu)) * ppu;
  const { back, front, glow } = paintBridge(tun, ri, w, h, ppu, deckY, 5 + ri);
  const g = { x0, x1, y0: bot, y1: top, z: 0 };
  vplanes(st.group, back, g, -60, { alphaTest: 0.5 });
  vplanes(st.group, glow, g, -59, { additive: true, gain: 1.3, dz: 0.01 });
  vplanes(st.group, front, { ...g, z: 0.4 }, 150, { transparent: true, alphaTest: 0.5 });
  for (const x of gap) { try { st.prop('support', { width: 8, height: 16 }, x, 0, -0.3, 0, 0.6); } catch (e) { /* optional 3D post */ } }
  st.anchors.bridgeStart = V(gap[0], 0, 0);
  st.anchors.bridgeMid = V((gap[0] + gap[1]) / 2, pathY((gap[0] + gap[1]) / 2), 0);
  st.anchors.bridgeEnd = V(gap[1], 0, 0);
  if (ri === 4 || tun === 'lavabridge') st.emitters.push((dt) => { if (rnd.chance(dt * 12)) st.P.add.emit({ pos: [rnd.float(gap[0], gap[1]), -2.5, rnd.float(-1, 0.5)], vel: [0, rnd.float(1, 2), 0], spread: 0.2, life: [1, 2], size: 1, color: ['#ffb43a', '#ff6a1a'], glow: 3 }); });
}

function addElevator(st, shaft, pathY, ri) {
  const ppu = 96;
  const w = shaft[1] - shaft[0] + 0.6, h = 1.25;
  const { img, glow } = paintElevator(ri, Math.round(w * ppu), Math.round(h * ppu), ppu);
  const holder = new THREE.Group();
  vplanes(holder, img, { x0: -w / 2, x1: w / 2, y0: -0.12, y1: h - 0.12, z: 0 }, -55, { alphaTest: 0.5 });
  vplanes(holder, glow, { x0: -w / 2, x1: w / 2, y0: -0.12, y1: h - 0.12, z: 0 }, -54, { additive: true, gain: 1.3, dz: 0.01 });
  // hoist ropes running up into the dark
  const rope = new Img(4, 9 * ppu);
  for (let y = 0; y < rope.h; y++) { rope.set(1, y, hp((y >> 2) & 1 ? '#b89a68' : '#8a6a40')); rope.set(2, y, hp('#3a2a1a')); }
  for (const dx of [-w / 2 + 0.06, w / 2 - 0.06]) vplanes(holder, rope, { x0: dx - 0.02, x1: dx + 0.02, y0: h - 0.12, y1: h + 9, z: -0.01 }, -56, { alphaTest: 0.5 });
  holder.position.x = (shaft[0] + shaft[1]) / 2;
  st.group.add(holder);
  st.elevator = holder;
  st.updaters.push(() => {
    const k = clamp((st.focus.x - shaft[0]) / (shaft[1] - shaft[0]));
    holder.position.y = pathY(shaft[0] + k * (shaft[1] - shaft[0]));
  });
  st.anchors.elevatorTop = V(shaft[0], pathY(shaft[0]), 0);
  st.anchors.elevatorBottom = V(shaft[1], pathY(shaft[1]), 0);
}

function addStairs(st, stairs, pathY, ri) {
  const ppu = 96;
  const w = stairs[1] - stairs[0] + 0.5, top = 0.35, bot = pathY(stairs[1]) - 0.7;
  const { img } = paintStairs(ri, Math.round(w * ppu), Math.round((top - bot) * ppu), 10, ppu);
  vplanes(st.group, img, { x0: stairs[0] - 0.25, x1: stairs[0] - 0.25 + w, y0: bot, y1: top, z: -0.9 }, -58, { alphaTest: 0.5 });
}

function addWater(st, geo, ri) {
  const t = tex(paintWater(ri).toCanvas(), { mips: false });
  t.wrapS = THREE.RepeatWrapping;
  const W = geo.ground.x1 - geo.ground.x0, D = geo.ground.z1 - geo.ground.z0;
  t.repeat.set(W / 5.3, 1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  m.position.set((geo.ground.x0 + geo.ground.x1) / 2, -0.06, (geo.ground.z0 + geo.ground.z1) / 2);
  m.renderOrder = 120;
  m.layers.set(LAYER_FX);
  st.group.add(m);
  st.updaters.push((dt, t2) => { t.offset.x = t2 * 0.02; });
}

// ---------------------------------------------------------------------------- campfire cyclorama
function buildCampfire(st, ri, opts) {
  const cam = CAM.campfire;
  const Rw = 8.6, Rm = 15, Rf = 24;
  const tanH = Math.tan((cam.fov * Math.PI) / 360);
  const ppuR = (R) => Math.round(VH / (2 * (R + 5.6) * tanH));
  const arc = (R) => Math.PI * R;
  const mineAz = Math.atan2(3.6, 4.4);
  const geo = {
    wall: { x0: -arc(Rw), x1: arc(Rw), y0: -0.4, y1: 7.0, z: -Rw, ppu: Math.round(ppuR(Rw) * 1.05) },
    mid: { x0: -arc(Rm), x1: arc(Rm), y0: -3, y1: 10, z: -Rm, ppu: ppuR(Rm) },
    far: { x0: -arc(Rf), x1: arc(Rf), y0: -6, y1: 14, z: -Rf, ppu: ppuR(Rf) },
    ground: { x0: -9.2, x1: 9.2, z0: -9.2, z1: 9.2, y: 0, ppuX: 52, ppuZ: 52 },
  };
  const painted = paintStage('campfire', ri, geo, { ...opts, mineX: mineAz * Rw, seed: opts.seed || 3 });
  const G = st.group;
  cyclorama(G, painted.far.canvas, Rf, geo.far.y0, geo.far.y1, -100);
  if (painted.far.glow) cyclorama(G, painted.far.glow, Rf - 0.02, geo.far.y0, geo.far.y1, -99, { additive: true, gain: 1.2 });
  cyclorama(G, painted.mid.canvas, Rm, geo.mid.y0, geo.mid.y1, -90, { alphaTest: 0.5 });
  if (painted.mid.glow) cyclorama(G, painted.mid.glow, Rm - 0.02, geo.mid.y0, geo.mid.y1, -89, { additive: true, gain: 1.4 });
  cyclorama(G, painted.wall.canvas, Rw, geo.wall.y0, geo.wall.y1, -80, { alphaTest: 0.5 });
  if (painted.wall.glow) cyclorama(G, painted.wall.glow, Rw - 0.02, geo.wall.y0, geo.wall.y1, -79, { additive: true, gain: 1.6 });
  const disc = (canvas, order, o) => G.add(fxify(new THREE.Mesh(new THREE.CircleGeometry(Rw + 0.1, 64).rotateX(-Math.PI / 2), basicMat(tex(toCanvas(canvas)), o)), order));
  disc(painted.ground.canvas, -70, {});
  if (painted.ground.glow) disc(painted.ground.glow, -69, { additive: true, gain: 1.5 });
  const sc = new THREE.Mesh(new THREE.CircleGeometry(Rw, 48).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: new THREE.Color(st.style.shadow[0]), opacity: 0.45, depthWrite: false }));
  sc.position.y = 0.004; sc.receiveShadow = true; sc.renderOrder = 2; sc.layers.set(LAYER_FX);
  G.add(sc);
  // the 3D campfire with log seats, as in the voxel camp (title scene seats explorers on them)
  st.prop('campfire', { shadow: true, intensity: 8, distance: 11 }, 0, 0, 0);
  const R0 = 1.55, angles = [165, 118, 62, 15], seatH = [0.32, 0.42, 0.36, 0.32];
  st.anchors.seats = [];
  angles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.cos(a) * R0, z = -Math.sin(a) * R0;
    const face = Math.atan2(-x, -z);
    st.add(seatLog(i === 1 ? '#5a4a3a' : '#6a4426'), x, 0, z, face + Math.PI / 2);
    st.anchors['seat' + i] = V(x, seatH[i], z);
    st.anchors['face' + i] = face;
    st.anchors.seats.push({ pos: V(x, seatH[i], z), rotY: face, height: seatH[i] });
  });
  for (const [name, o, x, z, ry] of [['cookpot', {}, 0.95, 0.65, 0], ['map', {}, -0.75, 1.05, 0.25], ['backpack', { color: '#7a5a2a' }, -2.25, -0.2, 1.1], ['backpack', { color: '#4a6a3a' }, 2.25, -0.8, -1.2], ['sleepingbag', { color: '#a83a3a' }, 1.7, -2.5, 1.3], ['sleepingbag', { color: '#3a5aa0' }, -1.3, -2.8, 1.7], ['lantern', { intensity: 1.4, distance: 4 }, -1.85, -0.4, 0]]) {
    try { st.prop(name, o, x, 0, z, ry); } catch (e) { /* prop not in this build */ }
  }
  st.fireAnchor = V(0, 0, 0);
  st.anchors.fire = V(0, 0, 0);
  st.anchors.center = V(0, 0.8, -0.4);
  st.anchors.anvil = V(3.0, 0, 0.7);
  const mr = Rw - 0.4;
  st.anchors.mineEntrance = V(Math.sin(mineAz) * mr, 1.0, -Math.cos(mineAz) * mr);
  st.anchors.mineDeep = V(Math.sin(mineAz) * (Rw + 6), 0.9, -Math.cos(mineAz) * (Rw + 6));
  const S = st.style;
  G.add(new THREE.HemisphereLight(new THREE.Color(mixHex(S.shadow[3], '#8ad0e0', 0.3)), new THREE.Color('#3a1c0a'), 0.75));
  const rim = new THREE.DirectionalLight(new THREE.Color(mixHex(S.shadow[3], '#6ad0ff', 0.5)), 0.9); rim.position.set(2, 4, -6); G.add(rim);
  st.lights.push(rim);
  st.ambient(['dust']);
  st.emitters.push((dt) => { if (rnd.chance(dt * 3)) st.P.add.emit({ pos: [rnd.float(-5, 5), rnd.float(0.4, 2.6), rnd.float(-5, 2)], vel: [rnd.float(-0.1, 0.1), 0.05, 0], spread: 0.05, life: [2, 4], size: 1, color: ['#d8ff8a', '#ffe08a'], glow: 2.5, flicker: 0.6, fadeIn: 0.6 }); });
  st.camera = { ...cam, orbit: { center: [0, 0.8, -0.4], radius: 6.0, height: 2.3, arc: Math.PI } };
  st.spread.set(5, 2, 3);
  st.focus.set(0, 1.5, -0.5);
  st.fog.density = 0.01; st.fogDensity = 0.01;
}

function seatLog(col) {
  const m = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.05, 8), toon(col));
  body.rotation.z = Math.PI / 2; body.position.y = 0.17; body.castShadow = true; body.receiveShadow = true;
  m.add(body);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.17, 8), toon('#c8a070'));
    cap.position.set(s * 0.526, 0.17, 0); cap.rotation.y = (s * Math.PI) / 2;
    m.add(cap);
  }
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), toon('#4a6a2a'));
  moss.scale.set(1.6, 0.4, 0.9); moss.position.set(-0.15, 0.33, 0.02);
  m.add(moss);
  return m;
}

// ---------------------------------------------------------------------------- public
/**
 * Build a painted 2D stage. kind: arena | tomb | corridor | room | wall | campfire.
 * opts: { tunnel (corridor), room, length, seed, npc:false (merchant without the mole prop) }
 */
export function buildStage(kind, regionIdx = 0, opts = {}) {
  const ri = kind === 'tomb' ? 5 : clamp(regionIdx | 0, 0, 5);
  const st = new Stage(kind, ri);
  const t0 = performance.now();
  if (kind === 'campfire') { buildCampfire(st, 0, opts); st.buildMs = performance.now() - t0; return st; }
  if (!CAM[kind]) throw new Error('unknown stage kind ' + kind);
  const { pathY, gap, shaft } = buildFlat(st, kind, ri, opts);
  const A = st.anchors;
  if (kind === 'arena') Object.assign(A, { player: V(-1.6, 0, 0.4), monster: V(1.8, 0, 0.2), boss: V(2.6, 0, -0.6), forge: V(-3.1, 0, 0.9), center: V(0, 1, 0) });
  else if (kind === 'tomb') Object.assign(A, { player: V(-1.8, 0, 0.6), monster: V(2.0, 0, 0), boss: V(2.4, 0, -0.4), throne: V(0, 0, -3.0), forge: V(-3.2, 0, 1.0), center: V(0, 1, 0) });
  else if (kind === 'room') {
    Object.assign(A, { center: V(0, 0, 0), player: V(-1.9, 0, 0.8) });
    const room = opts.room || 'event';
    if (room === 'treasure') for (let i = 0; i < 3; i++) A['chest' + i] = V(-1.5 + i * 1.5, 0, -0.6);
    else if (room === 'merchant') {
      A.merchant = V(-0.2, 0, -0.5); // the mole stands here, in front of the painted stall
      A.cart = V(1.0, 0, -1.5);
      if (opts.npc !== false) { try { A.npc = st.prop('mole', {}, -0.2, 0, -0.5, 0.25); } catch (e) { /* no mole prop */ } }
    } else if (room === 'camp') {
      st.prop('campfire', { shadow: true, intensity: 6.5 }, 0, 0, -0.2);
      st.add(seatLog('#6a4426'), -1.3, 0, 0.25, 0.4);
      try { st.prop('anvil', {}, 1.7, 0, 0.5, -0.4); } catch (e) { /* optional */ }
      A.fire = V(0, 0, -0.2);
      A.seat = V(-1.3, 0.32, 0.25);
      A.anvil = V(1.7, 0, 0.5);
    } else A.prop = V(0.6, 0, -0.8);
  } else if (kind === 'wall') {
    A.player = V(-1.4, 0, 0.9);
    st.spread.set(3, 1.6, 1.5);
    st.focus.set(0, 1.5, 0);
  } else if (kind === 'corridor') {
    const L = opts.length || 34;
    const avoid = (x) => (gap && x > gap[0] - 1.2 && x < gap[1] + 1.2) || (shaft && x > shaft[0] - 1 && x < shaft[1] + 1);
    const spots = [0.22, 0.5, 0.78].map((k) => { let x = L * k; if (avoid(x)) x = k < 0.5 ? (gap || shaft)[0] - 2 : (gap || shaft)[1] + 2; return V(x, pathY(x), -0.75); });
    Object.assign(A, { start: V(0, pathY(0), 0), end: V(L, pathY(L), 0), spots });
    if ((opts.tunnel || 'tunnel') === 'minecart') A.cart = V(0, 0, 0);
    st.length = L;
    st.tunnel = opts.tunnel || 'tunnel';
    st.camera = { pos: [0, pathY(0) + 1.7, 6.6], look: [0, pathY(0) + 0.9, 0], fov: 36, follow: { dy: 1.7, dz: 6.6, lookDy: 0.9 } };
    st.spread.set(7, 2.5, 2.5);
    st.follow(0);
  }
  st.buildMs = performance.now() - t0;
  return st;
}

export const STAGE_KINDS = ['arena', 'tomb', 'corridor', 'room', 'wall', 'campfire'];
