// Handcrafted props: sculpted flat-shaded low-poly geometry with hand-painted pixel-art textures
// (constant texel density, see prop_kit.js) + glowing bits that bloom.
// buildProp(name, opts) → THREE.Group. Dynamic props expose userData.update(dt, t),
// userData.emit(P, dt) (P = { add: ParticleSystem, alpha: ParticleSystem }) and userData.lights.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels } from '../gfx/voxel.js';
import { glow } from '../gfx/materials.js';
import { FlickerLight } from '../gfx/camera.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { hash2, noise2, noise3, mixHex, shadeHex } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import {
  Kit, TEX, texMat, glowTexMat, flatMat, glowMat, paintTex, cached, between, pfbm,
  hull, chamferBox, chippedBlock, plank, rockGeo, prism, lathe, tube, beam, logGeo, shape, extrude, wobble,
} from './prop_kit.js';
import { addSculpt, sphere, ellipsoid, capsule, chain, chainParts, box as sbox, torus, union, subtract, noisy, chipped, floor, keep } from './prop_sdf.js';

// ------------------------------------------------------------------ legacy voxel helper (kept for compatibility)
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

// ------------------------------------------------------------------ palette & material shortcuts
const W_OAK = '#8a5a33', W_DARK = '#5e3b22', W_PINE = '#a8784a', W_OLD = '#7a5a40', W_RED = '#8e3e2c';
const IRON = '#565a66', IRON_D = '#3a3c44', STEEL = '#9aa2ae', BRASS = '#c8963a', GOLD = '#e8b440';
const M = {
  wood: (b = W_OAK, s = 1) => texMat(TEX.wood(b, s)),
  planks: (b = W_OAK, p = 16, s = 2) => texMat(TEX.planks(b, p, s)),
  bark: (b = '#5a3a22') => texMat(TEX.bark(b)),
  end: (b = '#c8a070', bark = '#4a2e1a') => texMat(TEX.endgrain(b, bark)),
  metal: (b = IRON, rust = 0, s = 4) => texMat(TEX.metal(b, s, rust)),
  stone: (tint = '#a09890', s = 5) => texMat(TEX.stone(s), tint),
  carved: (tint = '#a09890') => texMat(TEX.carved(), tint),
  cloth: (tint) => texMat(TEX.cloth(), tint),
  quilt: (tint) => texMat(TEX.quilt(), tint),
  leather: (tint) => texMat(TEX.leather(), tint),
  bone: () => texMat(TEX.bone()),
  rope: () => texMat(TEX.rope()),
  fur: (b) => texMat(TEX.fur(b)),
  brick: () => texMat(TEX.brick()),
  gold: () => texMat(TEX.gold()),
  parch: () => texMat(TEX.parchment()),
};
const DS = { side: THREE.DoubleSide };

function addLight(grp, light, pos) {
  light.position.set(...pos);
  grp.add(light);
  (grp.userData.lights = grp.userData.lights || []).push(light);
  return light;
}
const wpos = new THREE.Vector3();
function worldOf(obj, x, y, z) { return obj.localToWorld(wpos.set(x, y, z)).toArray(); }
const avgTone = (tone, fallback = '#8a827a') => (Array.isArray(tone) ? tone[Math.min(1, tone.length - 1)] : tone || fallback);
const brighten = (c) => mixHex(c, '#ffffff', 0.25);
/** lift dark region tones and push them warm so stone never reads as flat grey */
const stoneTint = (c) => mixHex(mixHex(c, '#ffffff', 0.32), '#e8c098', 0.16);

/** Sculpted burlap sack (drawstring neck, ruffled top, sagging folds) at pos, scaled by s. */
function sackSculpt(kit, mat, pos, s = 1, seed = 7) {
  const P = (x, y, z) => [pos[0] + x * s, pos[1] + y * s, pos[2] + z * s];
  const belly = union(0.08 * s, ellipsoid(P(0, 0.17, 0), [0.2 * s, 0.17 * s, 0.19 * s]), ellipsoid(P(0.01, 0.075, 0.01), [0.235 * s, 0.075 * s, 0.215 * s]));
  // slumped body with folds converging up toward the drawstring
  const body = keep((x, y, z) => {
    const yy = (y - pos[1]) / s, a = Math.atan2(z - pos[2], x - pos[0]);
    return belly(x, y, z) - Math.max(0, Math.sin(a * 5 + yy * 6 + seed)) * 0.032 * s * Math.min(1, Math.max(0, (yy - 0.08) / 0.2));
  }, belly, 0.035 * s);
  const fs = [body, capsule(P(0, 0.22, 0), P(0, 0.38, 0), 0.125 * s, 0.05 * s)];
  for (let i = 0; i < 7; i++) { // gathered cloth flaring above the tie
    const a = (i / 7) * Math.PI * 2 + hash2(i, seed, 3) * 0.5, h = 0.46 + hash2(i, seed, 4) * 0.05;
    fs.push(capsule(P(Math.cos(a) * 0.025, 0.38, Math.sin(a) * 0.025), P(Math.cos(a) * 0.075, h, Math.sin(a) * 0.075), 0.03 * s, 0.016 * s));
  }
  const f = floor(noisy(union(0.045 * s, ...fs), 0.008 * s, 16 / s, seed), pos[1]);
  addSculpt(kit, [{ f, m: 'c' }], P(-0.27, -0.01, -0.27), P(0.27, 0.53, 0.27), 0.022 * s, { c: mat }, {}, { jitter: 0.14, seed });
  kit.add(new THREE.TorusGeometry(0.06 * s, 0.015 * s, 4, 9), M.rope(), { pos: P(0, 0.36, 0), rot: [Math.PI / 2, 0, 0], uv: 'keep' });
  kit.add(tube([P(0.05, 0.36, 0.035), P(0.1, 0.3, 0.1), P(0.1, 0.21, 0.16)], 0.008 * s, 6, 3), M.rope(), { uv: 'raw' });
}

/** Rivet / nail head: tiny faceted dome. */
function rivet(kit, pos, r = 0.012, mat = flatMat(STEEL)) {
  kit.add(hull([[r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r], [r * 0.6, r * 0.5, r * 0.6], [-r * 0.6, r * 0.5, -r * 0.6], [r * 0.6, r * 0.5, -r * 0.6], [-r * 0.6, r * 0.5, r * 0.6], [0, r * 0.8, 0]]), mat, { pos, uv: 'raw', rot: pos.rot || [0, 0, 0] });
}
/** A stick / branch between two points (tapered, faceted). */
function stick(kit, a, b, r, mat, sides = 6, taper = 0.75, seed = 1) {
  const { pos, quat, len } = between(a, b);
  kit.add(prism(sides, r, len, { taper, jitter: 0.15, seed }), mat, { pos, quat });
}
/**
 * Wall of hand-sawn boards: n boards of length w stacked over height h (gap between), thickness t.
 * Built in panel space (x along boards, y up, facing +z) then placed with o.pos / o.rot.
 * Nails at both ends of every board unless o.nails === false.
 */
function boards(kit, mat, w, h, n, o = {}) {
  const t = o.t ?? 0.022, gap = o.gap ?? 0.008, seed = o.seed ?? 1;
  const bh = (h - gap * (n - 1)) / n;
  const nail = flatMat(o.nail || '#9aa0aa');
  for (let i = 0; i < n; i++) {
    const y = -h / 2 + bh / 2 + i * (bh + gap);
    const len = w - (o.inset ?? 0) * hash2(i, seed, 7);
    const g = plank(len, bh, t, seed * 13 + i, o.bow ?? 0.01, o.twist ?? 0.03);
    g.translate((hash2(i, seed, 8) - 0.5) * (o.slide ?? 0.01), y, 0);
    kit.add(g, mat, { pos: o.pos, rot: o.rot, order: o.order });
    if (o.nails !== false) for (const sx of [-1, 1]) {
      const r = 0.008;
      const ng = hull([[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [r * 0.6, r * 0.6, r * 0.5], [-r * 0.6, -r * 0.6, r * 0.5], [r * 0.6, -r * 0.6, r * 0.5], [-r * 0.6, r * 0.6, r * 0.5], [0, 0, r * 0.7]]);
      ng.translate(sx * (len / 2 - (o.nailIn ?? 0.035)), y, t / 2);
      kit.add(ng, nail, { pos: o.pos, rot: o.rot, order: o.order, uv: 'raw' });
    }
  }
}

/** Log with bark + end grain caps. */
function addLog(kit, len, r, o = {}) {
  const { side, caps } = logGeo(len, r, o.seed ?? 1, o.sides ?? 7);
  const opt = { pos: o.pos, rot: o.rot, quat: o.quat };
  kit.add(side, o.bark || M.bark(), opt);
  for (const c of caps) kit.add(c, o.end || M.end(), { ...opt, uv: 'keep' });
}

// ------------------------------------------------------------------ flames
const FLAME_PALETTES = {
  fire: ['#ff4a12', '#ff9a2a', '#ffe08a'],
  purple: ['#7a2aff', '#c86bff', '#ffc8ff'],
  green: ['#1aa86a', '#5af0c8', '#d8fff0'],
  blue: ['#1a5aff', '#6ad8ff', '#e0f8ff'],
};
/** Stylized layered flame: twisted faceted tongues in three heat layers. Returns group with userData.flame(t). */
export function makeFlame(scale = 1, palette = 'fire') {
  const pal = FLAME_PALETTES[palette] || palette;
  const g = new THREE.Group();
  const tongues = [];
  const layers = [
    { c: pal[0], i: 2.2, n: 6, r: 0.1, h: 0.44, spread: 0.08 },
    { c: pal[1], i: 2.8, n: 5, r: 0.075, h: 0.34, spread: 0.055 },
    { c: pal[2], i: 3.6, n: 3, r: 0.045, h: 0.22, spread: 0.025 },
  ];
  layers.forEach((L, li) => {
    for (let k = 0; k < L.n; k++) {
      // a twisted 4-sided tongue: wide base, offset curling tip
      const pts = [];
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + k; pts.push([Math.cos(a) * L.r, 0, Math.sin(a) * L.r]); }
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + k + 0.6; pts.push([Math.cos(a) * L.r * 0.55 + L.r * 0.2, L.h * 0.45, Math.sin(a) * L.r * 0.55]); }
      pts.push([L.r * 0.35 * (hash2(k, li, 2) - 0.5), L.h, L.r * 0.3 * (hash2(k, li, 5) - 0.5)]);
      const geo = hull(pts);
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
      m.rotation.y = t * 0.8 + b.ph;
      m.rotation.z = (noise2(t * 4, b.ph + 2) - 0.5) * 0.3;
    }
  };
  return g;
}

// ------------------------------------------------------------------ custom painted textures
const TX = {
  mapSheet() {
    return paintTex('mapSheet', 96, 64, (p, W, H) => {
      const R = ['#c8a870', '#d9bd85', '#e6cf9c', '#efdcae', '#f6e8c4'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const e = Math.min(x, y, W - 1 - x, H - 1 - y);
        let v = 0.65 + (pfbm(x / W, y / H, 4, 3, 3, 3) - 0.5) * 0.5 - (e < 3 ? (3 - e) * 0.15 : 0);
        p.set(x, y, R[Math.max(0, Math.min(4, Math.floor(v * 5)))]);
      }
      const ink = '#4a3220';
      // tunnels, stairs and rooms drawn in ink
      let px = 6, py = 10;
      for (let i = 0; i < 70; i++) { p.set(px, py, ink); if (i % 9 === 4) p.set(px, py + 1, ink); px += 1; py += Math.round(Math.sin(i * 0.35) * 0.9 + 0.3); if (py > 52) py = 52; }
      for (let i = 0; i < 30; i++) p.set(34 + Math.round(Math.sin(i * 0.4) * 3), 12 + i, ink);
      for (const [cx, cy, r] of [[34, 11, 4], [60, 30, 5], [20, 44, 4], [80, 48, 3]]) for (let a = 0; a < 40; a++) p.set(Math.round(cx + Math.cos(a / 40 * 6.28) * r), Math.round(cy + Math.sin(a / 40 * 6.28) * r * 0.7), ink);
      // mountains
      for (let k = 0; k < 4; k++) { const bx = 52 + k * 9, by = 12; for (let i = 0; i < 5; i++) { p.set(bx + i, by - i, ink); p.set(bx + 9 - i, by - i, ink); } }
      // compass rose
      const cx = 84, cy = 14;
      for (let i = -5; i <= 5; i++) { p.set(cx + i, cy, ink); p.set(cx, cy + i, ink); }
      p.set(cx, cy - 6, '#a02a1a'); p.set(cx - 1, cy - 5, '#a02a1a'); p.set(cx + 1, cy - 5, '#a02a1a');
      // red X marks the spot + coffee ring
      for (let i = -2; i <= 2; i++) { p.set(79 + i, 47 + i, '#b0281a'); p.set(79 + i, 47 - i, '#b0281a'); }
      for (let a = 0; a < 50; a++) p.set(Math.round(18 + Math.cos(a / 50 * 6.28) * 7), Math.round(22 + Math.sin(a / 50 * 6.28) * 6), '#b08a58');
      p.set(10, 18, '#3a6a8a'); p.set(11, 18, '#3a6a8a'); p.set(10, 19, '#3a6a8a'); p.set(12, 19, '#3a6a8a');
    }, { clamp: true });
  },
  staves(base = W_OAK) {
    return paintTex('staves' + base, 32, 64, (p, W, H) => {
      const R = ['#3a2414', shadeHex(base, -0.35), shadeHex(base, -0.15), base, shadeHex(base, 0.15), shadeHex(base, 0.3)];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const st = Math.floor(x / 8), ix = x % 8;
        let v = 0.5 + (pfbm(x / W, y / H, 4, 1, 3, st + 3) - 0.5) * 0.6 + (hash2(st, 1, 4) - 0.5) * 0.25;
        if (Math.sin((x * 2 + pfbm(x / W, y / H, 2, 2, 2, st) * 8) * 1.3) > 0.9) v -= 0.25;
        if (ix === 0) v = 0; else if (ix === 1) v += 0.25; else if (ix === 7) v -= 0.2;
        p.set(x, y, R[Math.max(0, Math.min(5, Math.floor(v * 6)))]);
      }
    });
  },
  stew() {
    return paintTex('stew', 32, 32, (p, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const n = pfbm(x / W, y / H, 3, 3, 2, 8);
        p.set(x, y, n > 0.62 ? '#f0b050' : n > 0.45 ? '#d8803a' : '#b05a26');
      }
      for (let k = 0; k < 22; k++) { const x = Math.floor(hash2(k, 1, 4) * W), y = Math.floor(hash2(k, 2, 4) * H); const c = ['#6aa040', '#e8d070', '#c83a2a', '#f0e8d0'][k % 4]; p.rect(x, y, 2, 2, c); p.set(x, y, mixHex(c, '#ffffff', 0.4)); }
    });
  },
  pages() {
    return paintTex('pages', 16, 16, (p, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, y % 2 ? '#e8dcc0' : '#d8c8a8');
    });
  },
  pottery(base = '#9a5a3a') {
    return paintTex('pottery' + base, 32, 32, (p, W, H) => {
      const R = [shadeHex(base, -0.3), shadeHex(base, -0.12), base, shadeHex(base, 0.12)];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = R[Math.min(3, Math.floor((0.5 + (pfbm(x / W, y / H, 2, 2, 2, 5) - 0.5) * 0.6) * 4))];
        if (y >= 12 && y <= 19) c = y === 12 || y === 19 ? '#3a2014' : '#e8c890';
        if (y >= 14 && y <= 17 && ((x + (y - 14) * 2) % 8 < 2 || (x - (y - 14) * 2 + 32) % 8 < 2)) c = '#2a1a14';
        p.set(x, y, c);
      }
    });
  },
  banner(color, symbol) {
    return paintTex('banner' + color + symbol, 32, 64, (p, W, H) => {
      const R = [shadeHex(color, -0.35), shadeHex(color, -0.15), color, shadeHex(color, 0.15)];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = R[Math.min(3, Math.floor((0.55 + (pfbm(x / W, y / H, 2, 4, 2, 7) - 0.5) * 0.4 + (x % 6 === 0 ? -0.1 : 0)) * 4))];
        if (x < 2 || x > W - 3) c = GOLD;
        if (y < 3) c = shadeHex(GOLD, -0.2);
        p.set(x, y, c);
      }
      // the Lord's eye sigil
      const cx = W / 2, cy = 30;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot((x + 0.5 - cx) * 0.9, y + 0.5 - cy);
        if (Math.abs(d - 9) < 1 || (Math.abs(y + 0.5 - cy) < 1 && Math.abs(x + 0.5 - cx) < 12) || d < 3) p.set(x, y, symbol);
        if (y > 42 && y < 54 && Math.abs(x + 0.5 - cx) < (54 - y) * 0.5 && Math.abs(x + 0.5 - cx) > (54 - y) * 0.5 - 1.2) p.set(x, y, symbol);
      }
    });
  },
  runes(color) {
    return paintTex('runes' + color, 48, 64, (p, W, H) => {
      const glyph = (x0, y0, k) => {
        const segs = [[0, 0, 0, 6], [0, 0, 4, 0], [4, 0, 4, 6], [0, 3, 4, 3], [0, 6, 4, 6], [0, 0, 4, 6], [4, 0, 0, 6], [2, 0, 2, 6]];
        for (let i = 0; i < 3; i++) {
          const s = segs[Math.floor(hash2(k, i, 9) * segs.length)];
          p.line(x0 + s[0], y0 + s[1], x0 + s[2], y0 + s[3], color);
        }
      };
      let k = 0;
      for (let y = 6; y < H - 8; y += 10) for (const x of [8, 18, 28, 36]) if (hash2(x, y, 3) > 0.25) glyph(x, y, k++);
      for (let a = 0; a < 80; a++) p.set(Math.round(24 + Math.cos(a / 80 * 6.28) * 10), Math.round(26 + Math.sin(a / 80 * 6.28) * 10), color);
    }, { clamp: true });
  },
  shell() {
    return paintTex('snailshell', 32, 32, (p, W, H) => {
      const R = ['#5a3a2a', '#7a5238', '#9a6e48', '#b88c5e', '#d4ae7c', '#ecd0a0'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const band = Math.sin((x + y * 0.5 + pfbm(x / W, y / H, 2, 2, 2, 4) * 10) * 0.8);
        let v = 0.5 + band * 0.08 + (pfbm(x / W, y / H, 3, 3, 3, 9) - 0.5) * 0.6;
        if (band > 0.97) v -= 0.18;
        if (hash2(x, y, 3) > 0.97) v += 0.2;
        p.set(x, y, R[Math.max(0, Math.min(5, Math.floor(v * 6)))]);
      }
    });
  },
  sign() {
    return paintTex('signboard', 64, 16, (p, W, H) => {
      const base = TEX.wood('#c8a060', 4).image.getContext('2d').getImageData(0, 0, 64, 64).data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * 64 + x) * 4; p.set(x, y, [base[i], base[i + 1], base[i + 2]]); }
      for (let x = 0; x < W; x++) { p.set(x, 0, '#3a2416'); p.set(x, H - 1, '#3a2416'); }
      // painted coin + scribbled lettering
      for (let y = 3; y < 13; y++) for (let x = 4; x < 14; x++) { const d = Math.hypot(x - 8.5, y - 7.5); if (d < 4.6) p.set(x, y, d > 3.6 ? '#8a5a14' : (x + y < 15 ? '#fff0a0' : '#e0b040')); }
      for (let i = 0; i < 6; i++) { const x0 = 18 + i * 7; p.rect(x0, 5, 1, 6, '#3a2416'); p.rect(x0, 5, 4, 1, '#3a2416'); if (i % 2) p.rect(x0, 8, 3, 1, '#3a2416'); else p.rect(x0 + 3, 5, 1, 6, '#3a2416'); }
    }, { clamp: true });
  },
};

// ------------------------------------------------------------------ builders
const BUILDERS = {
  campfire(o) {
    const grp = new THREE.Group();
    grp.add(cached('campfire', () => {
      const kit = new Kit();
      const stoneTints = ['#a08a78', '#ac9884', '#8e7c6c', '#b4a08c'];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + hash2(i, 1, 2) * 0.2;
        const s = 0.85 + hash2(i, 2, 2) * 0.35;
        kit.add(rockGeo(0.1 * s, 0.07 * s, 0.085 * s, i + 3, 16), M.stone(stoneTints[i % 4]), { pos: [Math.cos(a) * 0.43, -0.01, Math.sin(a) * 0.43], rot: [0, -a, 0] });
      }
      // ash bed with glowing coals
      const ash = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const r = 0.33 + hash2(i, 5, 2) * 0.04; ash.push([Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r * 0.7, 0.035, Math.sin(a) * r * 0.7]); }
      kit.add(hull(ash), M.stone('#4a4440', 9));
      for (let i = 0; i < 9; i++) {
        const a = hash2(i, 7, 3) * Math.PI * 2, r = 0.08 + hash2(i, 8, 3) * 0.18;
        kit.add(rockGeo(0.035, 0.025, 0.03, 40 + i, 10), glowTexMat(TEX.coals(), '#ffffff', 2.2), { pos: [Math.cos(a) * r, 0.025, Math.sin(a) * r] });
      }
      // teepee of split logs, charred tops
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const out = [Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3], top = [Math.cos(a) * 0.05, 0.34, Math.sin(a) * 0.05];
        const { pos, quat, len } = between(out, top);
        const { side } = logGeo(len, 0.04, i + 2, 6);
        side.rotateZ(Math.PI / 2); side.translate(0, len / 2, 0); // now along +y from 0..len
        kit.add(side, i % 2 ? M.bark('#4a3020') : M.bark('#3a2a1e'), { pos, quat });
      }
      // a couple of spare logs beside the ring
      addLog(kit, 0.6, 0.05, { pos: [0.62, 0.05, 0.25], rot: [0, 0.6, 0], seed: 7 });
      addLog(kit, 0.5, 0.045, { pos: [0.7, 0.05, 0.05], rot: [0, 0.3, 0], seed: 8 });
      return kit.build();
    }));
    const flame = makeFlame(o.scale ?? 1.25, o.palette || 'fire');
    flame.position.y = 0.1;
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
    const patch = o.patch || '#8a5a8a';
    return cached('tent' + c + patch, () => {
      const kit = new Kit();
      const canvas = texMat(TEX.cloth(), c, DS), canvasD = texMat(TEX.cloth(), shadeHex(c, -0.18), DS);
      const H = 1.45, HW = 1.08, D = 0.82;
      // sagging canvas panel: grid from ridge (x=0,y=H) to eave (x=±HW,y=0) along z
      const panel = (sx) => {
        const nu = 4, nv = 6, pos = [];
        const P = (iu, iv) => {
          const u = iu / nu, v = iv / nv;
          const z = -D + v * 2 * D;
          const sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.06 + (iv === 0 || iv === nv ? 0 : 0.015);
          return [sx * (u * HW - sag * 0.6), H * (1 - u) - sag, z + (hash2(iu, iv, 3) - 0.5) * 0.02];
        };
        for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) {
          const a = P(iu, iv), b = P(iu + 1, iv), cc = P(iu + 1, iv + 1), d = P(iu, iv + 1);
          if (sx > 0) pos.push(...a, ...b, ...cc, ...a, ...cc, ...d); else pos.push(...a, ...cc, ...b, ...a, ...d, ...cc);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        return g;
      };
      kit.add(panel(-1), canvas);
      kit.add(panel(1), canvasD);
      // back wall
      const back = new THREE.BufferGeometry();
      back.setAttribute('position', new THREE.Float32BufferAttribute([-HW, 0, -D, 0, H, -D, HW, 0, -D], 3));
      kit.add(back, canvasD);
      // door flaps rolled up along the front edges and tied
      for (const sx of [-1, 1]) {
        const a = [sx * 0.05, H - 0.08, D + 0.04], b = [sx * HW * 0.9, 0.08, D + 0.04];
        const { pos, quat, len } = between(a, b);
        kit.add(wobble(prism(7, 0.034, len, { taper: 0.7, seed: sx + 4 }), 0.008, 3), texMat(TEX.cloth(), shadeHex(c, -0.06)), { pos, quat });
        for (const k of [0.3, 0.7]) kit.add(new THREE.TorusGeometry(0.05, 0.01, 4, 8), M.rope(), { pos: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, D + 0.04], rot: [0, Math.PI / 2, Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2], order: 'YZX', uv: 'keep' });
      }
      // patch on the left panel
      kit.add(chamferBox(0.36, 0.01, 0.3, 0.004), texMat(TEX.quilt(), patch), { pos: [-HW * 0.55 - 0.02, H * 0.45 + 0.02, -0.1], rot: [0, 0, Math.atan2(H, HW)] });
      // ground cloth + bedroll peeking out
      kit.add(chamferBox(1.9, 0.02, 1.6, 0.01), M.cloth('#4a3a2a'), { pos: [0, 0.01, 0] });
      addLog(kit, 0.5, 0.09, { pos: [0.1, 0.1, 0.55], rot: [0, 1.4, 0], bark: M.quilt('#9a3a3a'), end: M.quilt('#c85a4a'), seed: 3 });
      // poles, ridge, guy ropes and stakes
      for (const z of [-D - 0.02, D + 0.02]) stick(kit, [0, 0, z], [0, H + 0.12, z], 0.025, M.wood(W_DARK), 6, 0.85, z > 0 ? 2 : 3);
      stick(kit, [0, H + 0.02, -D - 0.1], [0, H + 0.02, D + 0.1], 0.022, M.wood(W_DARK), 6, 1, 4);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const stake = [sx * (HW + 0.32), 0, sz * (D + 0.25)];
        kit.add(tube([[sx * HW * 0.45, H * 0.55, sz * (D + 0.01)], [sx * (HW + 0.02), 0.45, sz * (D + 0.14)], stake], 0.006, 8, 3), M.rope(), { uv: 'scale', uLen: 1.2, vLen: 0.04 });
        stick(kit, [stake[0], -0.02, stake[2]], [stake[0] - sx * 0.03, 0.14, stake[2]], 0.014, M.wood(W_PINE), 4, 0.6, 5);
      }
      return kit.build();
    });
  },

  sleepingbag(o) {
    const c = o.color || '#b04a3a';
    return cached('bag' + c, () => {
      const kit = new Kit();
      const shell = sbox([0, 0.085, 0.1], [0.29, 0.08, 0.68], 0.075);
      // quilted channels: soft ridges across the bag
      const bag = keep((x, y, z) => shell(x, y, z) - Math.max(0, Math.sin(z * 40)) * 0.007 * Math.min(1, Math.max(0, (y - 0.04) / 0.1)), shell);
      const flat = floor;
      addSculpt(kit, [
        { f: flat(noisy(bag, 0.006, 9, 2)), m: 'bag' },
        { f: noisy(sbox([0, 0.17, -0.44], [0.305, 0.028, 0.15], 0.025), 0.005, 12, 3), m: 'lining' },
        { f: noisy(sbox([0, 0.21, -0.6], [0.2, 0.055, 0.1], 0.05), 0.012, 14, 4), m: 'pillow' },
      ], [-0.34, -0.01, -0.8], [0.34, 0.3, 0.82], 0.04, { bag: M.cloth(c), lining: M.quilt(brighten(c)), pillow: M.cloth('#ece2cc') }, {}, { k: 0.015 });
      kit.add(tube([[0.3, 0.09, 0.72], [0.31, 0.11, 0.2], [0.3, 0.12, -0.3]], 0.008, 8, 4), flatMat('#d8b060'), { uv: 'raw' });
      return kit.build();
    });
  },

  backpack(o) {
    const c = o.color || '#7a5a2a';
    return cached('pack' + c, () => {
      const kit = new Kit();
      const body = sbox([0, 0.33, 0], [0.235, 0.32, 0.165], 0.11);
      const flap = keep((x, y, z) => Math.max(body(x, y, z) - 0.014, 0.44 - y - Math.max(0, z) * 0.6), body, 0.02);
      const parts = [
        { f: noisy(body, 0.01, 13, 4), m: 'pack' },
        { f: noisy(flap, 0.004, 20, 5), m: 'flap' },
        { f: noisy(sbox([0, 0.16, 0.165], [0.16, 0.1, 0.06], 0.045), 0.006, 20, 5), m: 'pocket' },
        { f: sbox([-0.245, 0.24, 0], [0.05, 0.11, 0.1], 0.035), m: 'pocket' },
        { f: capsule([-0.3, 0.75, 0], [0.3, 0.75, 0], 0.085), m: 'roll' },
      ];
      for (const sx of [-0.1, 0.1]) parts.push({ f: sbox([sx, 0.42, 0.172], [0.018, 0.22, 0.012], 0.008), m: 'strap' });
      for (const sx of [-0.18, 0.18]) parts.push({ f: sbox([sx, 0.75, 0], [0.016, 0.094, 0.094], 0.014), m: 'strap' });
      addSculpt(kit, parts.map((p) => ({ ...p, f: floor(p.f) })), [-0.4, -0.01, -0.22], [0.4, 0.86, 0.27], 0.034,
        { pack: M.leather(c), flap: M.leather(brighten(c)), pocket: M.leather(shadeHex(c, -0.2)), strap: M.leather(shadeHex(c, -0.4)), roll: M.quilt('#3a6a8a') }, {}, { k: 0.012 });
      kit.add(chamferBox(0.075, 0.065, 0.025, 0.008), flatMat(BRASS), { pos: [0, 0.43, 0.2] });
      kit.add(chamferBox(0.03, 0.025, 0.03, 0.004), flatMat('#2a1a10'), { pos: [0, 0.43, 0.21] });
      kit.add(chamferBox(0.05, 0.04, 0.02, 0.006), flatMat(BRASS), { pos: [0, 0.2, 0.23] });
      kit.add(wobble(lathe([[0.05, 0], [0.055, 0.1], [0.05, 0.1], [0.045, 0.01]], 8), 0.004, 2), M.metal(STEEL), { pos: [0.3, 0.27, 0.04], uv: 'box' });
      kit.add(new THREE.TorusGeometry(0.025, 0.006, 4, 6, Math.PI), M.metal(STEEL), { pos: [0.35, 0.32, 0.04], rot: [0, 0, -Math.PI / 2], uv: 'keep' });
      return kit.build();
    });
  },

  lantern(o) {
    const grp = new THREE.Group();
    const col = o.glow || '#ffc060';
    const lan = cached('lantern' + col, () => {
      const kit = new Kit();
      const iron = M.metal(IRON_D, 0.2);
      kit.add(lathe([[0, 0], [0.1, 0], [0.11, 0.015], [0.1, 0.035], [0.085, 0.045], [0, 0.045]], 6), iron, { uv: 'box' });
      kit.add(prism(6, 0.072, 0.2, { taper: 1, rot: Math.PI / 6 }), glowMat(col, 2.3), { pos: [0, 0.045, 0], uv: 'raw' });
      kit.add(prism(6, 0.045, 0.14, { taper: 0.8 }), glowMat('#fff6d0', 3.2), { pos: [0, 0.07, 0], uv: 'raw' });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; kit.add(chamferBox(0.014, 0.2, 0.014, 0.003), iron, { pos: [Math.cos(a) * 0.08, 0.145, Math.sin(a) * 0.08], rot: [0, -a, 0] }); }
      kit.add(lathe([[0.1, 0.24], [0.105, 0.25], [0.07, 0.29], [0.035, 0.31], [0.03, 0.335], [0, 0.335]], 6), iron, { uv: 'box' });
      kit.add(new THREE.TorusGeometry(0.04, 0.008, 4, 8), iron, { pos: [0, 0.37, 0], uv: 'keep' });
      return kit.build({ shadow: false });
    });
    lan.position.y = o.hang ? -(o.hang + 0.37) : 0;
    grp.add(lan);
    if (o.hang) {
      const kit = new Kit();
      const n = Math.max(1, Math.round(o.hang / 0.05));
      for (let i = 0; i < n; i++) kit.add(new THREE.TorusGeometry(0.018, 0.005, 3, 6), M.metal(IRON_D), { pos: [0, -i * (o.hang / n) - 0.012, 0], rot: [0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2], uv: 'keep' });
      grp.add(kit.build({ shadow: false }));
    }
    if (o.light !== false) {
      const L = addLight(grp, new FlickerLight(new THREE.Color(col), o.intensity ?? 1.8, o.distance ?? 4.5, { amount: 0.12, speed: 5, jitter: 0.01 }), [0, lan.position.y + 0.16, 0]);
      grp.userData.update = (dt, t) => { L.tick(t); if (o.hang) grp.rotation.z = Math.sin(t * 1.3 + grp.id) * 0.04; };
    }
    return grp;
  },

  cookpot(o) {
    const grp = new THREE.Group();
    grp.add(cached('cookpot', () => {
      const kit = new Kit();
      const top = [0, 0.97, 0];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        stick(kit, [Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38], [Math.cos(a) * -0.05 + top[0], top[1] + 0.06, Math.sin(a) * -0.05], 0.022, M.bark('#5a3a22'), 6, 0.7, i + 1);
      }
      kit.add(new THREE.TorusGeometry(0.045, 0.014, 4, 8), M.rope(), { pos: [0, 0.93, 0], rot: [Math.PI / 2, 0, 0], uv: 'keep' });
      for (let i = 0; i < 6; i++) kit.add(new THREE.TorusGeometry(0.016, 0.005, 3, 6), M.metal(IRON_D), { pos: [0, 0.89 - i * 0.055, 0], rot: [0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2], uv: 'keep' });
      const pot = M.metal('#3a3a42', 0.15);
      kit.add(lathe([[0, 0.24], [0.08, 0.24], [0.15, 0.27], [0.18, 0.33], [0.175, 0.4], [0.155, 0.44], [0.165, 0.455], [0.15, 0.462], [0.14, 0.45]], 10), pot, { uv: 'box' });
      kit.add(lathe([[0, 0.438], [0.145, 0.438]], 10), texMat(TX.stew()), { uv: 'box' });
      for (const sx of [-1, 1]) kit.add(chamferBox(0.04, 0.025, 0.03, 0.006), pot, { pos: [sx * 0.175, 0.43, 0] });
      kit.add(tube([[-0.17, 0.44, 0], [-0.12, 0.6, 0], [0, 0.66, 0], [0.12, 0.6, 0], [0.17, 0.44, 0]], 0.007, 10, 3), M.metal(IRON_D), { uv: 'scale', uLen: 0.6, vLen: 0.04 });
      // ladle resting in the pot
      stick(kit, [0.06, 0.44, 0.05], [0.18, 0.66, 0.13], 0.01, M.wood(W_PINE), 5, 1, 9);
      return kit.build();
    }));
    grp.userData.emit = (P, dt) => {
      if (rnd.chance(dt * 6)) P.alpha.emit({ pos: worldOf(grp, 0, 0.55, 0), posSpread: 0.08, vel: [0.02, 0.35, 0], spread: 0.05, life: [1.5, 2.8], size: [1, 2], sizeEnd: 3, color: '#e8e0d8', alpha: 0.28, fadeIn: 0.4 });
    };
    return grp;
  },

  map() {
    return cached('map', () => {
      const kit = new Kit();
      const g = new THREE.PlaneGeometry(0.72, 0.48, 8, 4);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const e = Math.max(0, Math.abs(x) - 0.28) / 0.08;
        pos.setY(i, 0.012 + e * e * 0.035 + (hash2(Math.round(x * 50), Math.round(z * 50), 3) - 0.5) * 0.004);
      }
      kit.add(g, texMat(TX.mapSheet(), '#ffffff', DS), { uv: 'raw' });
      for (const sx of [-1, 1]) { const t = new THREE.CylinderGeometry(0.028, 0.028, 0.47, 7); t.rotateX(Math.PI / 2); kit.add(t, M.parch(), { pos: [sx * 0.385, 0.05, 0] }); }
      kit.add(rockGeo(0.045, 0.03, 0.04, 12, 10), M.stone('#8a827a'), { pos: [-0.25, 0.01, -0.17] });
      kit.add(rockGeo(0.04, 0.028, 0.035, 13, 10), M.stone('#7a736c'), { pos: [0.24, 0.01, 0.16] });
      return kit.build();
    });
  },

  pickaxe() {
    return cached('pickaxe', () => {
      const kit = new Kit();
      // slightly bowed ash handle
      const h = prism(8, 0.024, 0.74, { taper: 0.82, seed: 3 });
      const hp = h.attributes.position;
      for (let i = 0; i < hp.count; i++) { const y = hp.getY(i); hp.setX(i, hp.getX(i) + Math.sin((y / 0.74) * Math.PI) * 0.015); }
      kit.add(h, M.wood(W_PINE, 3));
      kit.add(prism(8, 0.03, 0.13, { taper: 0.95 }), M.leather('#5a3a2a'), { pos: [0, 0.05, 0] });
      // crescent head: pick spike + flat adze, tapered toward the tips
      const sh = shape([[-0.3, -0.05], [-0.2, -0.0], [-0.06, 0.03], [0.06, 0.03], [0.2, 0.0], [0.29, -0.03], [0.3, -0.07], [0.19, -0.03], [0.06, -0.02], [-0.06, -0.02], [-0.2, -0.045]]);
      const head = extrude(sh, 0.045, 0.006);
      const p = head.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) * (1 - Math.min(1, Math.abs(x) / 0.31) * 0.65)); }
      kit.add(head, M.metal('#7e8592', 0.1, 7), { pos: [0, 0.72, 0] });
      kit.add(chamferBox(0.075, 0.085, 0.06, 0.012), M.metal(IRON_D, 0.3), { pos: [0, 0.72, 0] });
      rivet(kit, [0, 0.74, 0.031], 0.01);
      return kit.build();
    });
  },

  shovel() {
    return cached('shovel', () => {
      const kit = new Kit();
      kit.add(prism(8, 0.02, 0.56, { taper: 0.9 }), M.wood(W_PINE, 5), { pos: [0, 0.24, 0] });
      // D-grip
      kit.add(new THREE.TorusGeometry(0.05, 0.013, 4, 8, Math.PI), M.wood(W_DARK), { pos: [0, 0.8, 0], uv: 'keep' });
      kit.add(chamferBox(0.1, 0.022, 0.022, 0.005), M.wood(W_DARK), { pos: [0, 0.85, 0] });
      // socket + spade blade with a cupped curve
      kit.add(prism(6, 0.026, 0.1, { taper: 0.7 }), M.metal(IRON_D), { pos: [0, 0.2, 0] });
      const blade = extrude(shape([[-0.11, 0.25], [0.11, 0.25], [0.12, 0.1], [0.08, 0.03], [0, 0], [-0.08, 0.03], [-0.12, 0.1]]), 0.012, 0.003);
      const bp = blade.attributes.position;
      for (let i = 0; i < bp.count; i++) { const x = bp.getX(i); bp.setZ(i, bp.getZ(i) - x * x * 1.6); }
      kit.add(blade, M.metal('#8a909c', 0.25, 6));
      return kit.build();
    });
  },

  crate(o) {
    const s = (o.size || 10) * 0.06;
    return cached('crate' + s + (o.label || ''), () => {
      const kit = new Kit();
      const wood = M.wood(W_OAK, 3), frame = M.wood('#6a4428', 6);
      const t = 0.024, fw = s * 0.13, off = s / 2 - t / 2, fo = off + t * 0.9;
      kit.add(chamferBox(s - 2 * t, s - 2 * t, s - 2 * t, 0.01), flatMat('#22140c'), { pos: [0, s / 2, 0], uv: 'raw' });
      const rotY = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
      for (let side = 0; side < 4; side++) {
        const a = (side * Math.PI) / 2;
        boards(kit, wood, s - 0.012, s - 0.012, 3, { pos: [Math.sin(a) * off, s / 2, Math.cos(a) * off], rot: [0, a, 0], t, seed: side + 1, nails: false });
        for (const y of [fw / 2, s - fw / 2]) kit.add(plank(s + 0.012, fw, t, side * 7 + (y > 0.1 ? 1 : 2), 0.004, 0.02), frame, { pos: [Math.sin(a) * fo, y, Math.cos(a) * fo], rot: [0, a, 0] });
        const dl = Math.SQRT2 * (s - 2 * fw) - fw * 0.3;
        kit.add(plank(dl, fw * 0.85, t, side * 7 + 3, 0.004, 0.02), frame, { pos: [Math.sin(a) * fo, s / 2, Math.cos(a) * fo], rot: [0, a, ((side % 2 ? 1 : -1) * Math.PI) / 4], order: 'YXZ' });
        for (const x of [-1, 1]) for (const y of [fw / 2, s - fw / 2]) {
          const [wx, wz] = rotY(x * (s / 2 - fw * 0.45), fo + t / 2, a);
          rivet(kit, [wx, y, wz], 0.009, flatMat('#b8bec8'));
        }
      }
      boards(kit, wood, s - 0.012, s - 0.012, 3, { pos: [0, s - t / 2, 0], rot: [-Math.PI / 2, 0, 0], t, seed: 9, nailIn: 0.03 });
      if (o.label) kit.add(wobble(new THREE.PlaneGeometry(s * 0.4, s * 0.25, 2, 2), 0.006, 3), M.parch(), { pos: [s * 0.16, s * 0.64, fo + t / 2 + 0.004], rot: [0, 0, 0.06], uv: 'box' });
      return kit.build();
    });
  },

  barrel(o) {
    const lid = o.content || 'wood';
    return cached('barrel' + lid, () => {
      const kit = new Kit();
      const prof = [];
      for (let i = 0; i <= 8; i++) { const y = (i / 8) * 0.8; prof.push([0.255 + Math.sin((i / 8) * Math.PI) * 0.05, y]); }
      kit.add(wobble(lathe(prof, 12), 0.01, 3), texMat(TX.staves(W_OAK)), { uv: 'scale', uLen: 1.8, vLen: 0.8 });
      for (const y of [0.06, 0.24, 0.56, 0.74]) {
        const r = 0.255 + Math.sin((y / 0.8) * Math.PI) * 0.05 + 0.008;
        kit.add(lathe([[r, y - 0.022], [r + 0.006, y - 0.015], [r + 0.006, y + 0.015], [r, y + 0.022]], 12), M.metal(IRON_D, 0.4), { uv: 'box' });
      }
      if (lid === 'water') kit.add(lathe([[0, 0.74], [0.25, 0.74]], 12), glowMat('#3a8ac0', 1.1), { uv: 'raw' });
      else kit.add(lathe([[0, 0.775], [0.25, 0.775]], 12), M.planks(W_DARK, 8), { uv: 'box' });
      if (lid === 'ore') for (let i = 0; i < 5; i++) kit.add(rockGeo(0.07, 0.05, 0.06, 20 + i, 10), M.stone('#9a96a0'), { pos: [Math.cos(i * 1.3) * 0.12, 0.76, Math.sin(i * 1.3) * 0.12] });
      return kit.build();
    });
  },

  minecart(o) {
    const ore = o.ore || '#8e8a92';
    return cached('cart' + ore + (o.empty ? 'e' : ''), () => {
      const kit = new Kit();
      const body = M.metal('#6a625a', 0.2, 9), dark = M.metal(IRON_D, 0.15);
      const bot = [0.5, 0.29], top = [0.6, 0.37], y0 = 0.2, y1 = 0.78, t = 0.035;
      const slab = (pts) => hull(pts);
      // four sloped walls + floor
      for (const sz of [-1, 1]) kit.add(slab([[-bot[0], y0, sz * bot[1]], [bot[0], y0, sz * bot[1]], [-top[0], y1, sz * top[1]], [top[0], y1, sz * top[1]], [-bot[0], y0, sz * (bot[1] - t)], [bot[0], y0, sz * (bot[1] - t)], [-top[0], y1, sz * (top[1] - t)], [top[0], y1, sz * (top[1] - t)]]), body);
      for (const sx of [-1, 1]) kit.add(slab([[sx * bot[0], y0, -bot[1]], [sx * bot[0], y0, bot[1]], [sx * top[0], y1, -top[1]], [sx * top[0], y1, top[1]], [sx * (bot[0] - t), y0, -bot[1]], [sx * (bot[0] - t), y0, bot[1]], [sx * (top[0] - t), y1, -top[1]], [sx * (top[0] - t), y1, top[1]]]), body);
      kit.add(chamferBox(1.0, 0.04, 0.58, 0.01), dark, { pos: [0, y0, 0] });
      // rim + straps + rivets
      for (const sz of [-1, 1]) kit.add(beam(1.24, 0.05, 0.05, 2), dark, { pos: [0, y1, sz * top[1]] });
      for (const sx of [-1, 1]) kit.add(beam(0.78, 0.05, 0.05, 3), dark, { pos: [sx * top[0], y1, 0], rot: [0, Math.PI / 2, 0] });
      for (const sz of [-1, 1]) for (const x of [-0.36, 0, 0.36]) {
        const xb = x * (bot[0] / 0.5), xt = x * (top[0] / 0.5) * 1.02;
        stick(kit, [xb, y0, sz * (bot[1] + 0.005)], [xt, y1, sz * (top[1] + 0.005)], 0.022, dark, 4, 1, 4);
        for (const k of [0.25, 0.75]) rivet(kit, [xb + (xt - xb) * k, y0 + (y1 - y0) * k, sz * (bot[1] + (top[1] - bot[1]) * k + 0.02)], 0.011, flatMat('#a0a6b0'));
      }
      // chassis, axles and flanged wheels
      kit.add(beam(1.1, 0.4, 0.07, 5), M.wood(W_DARK), { pos: [0, 0.16, 0] });
      for (const x of [-0.32, 0.32]) {
        const ax = new THREE.CylinderGeometry(0.02, 0.02, 0.66, 6); ax.rotateX(Math.PI / 2);
        kit.add(ax, dark, { pos: [x, 0.13, 0] });
        for (const z of [-0.31, 0.31]) {
          const wh = lathe([[0.035, -0.035], [0.12, -0.035], [0.145, -0.028], [0.145, -0.018], [0.122, -0.012], [0.122, 0.03], [0.05, 0.035], [0.035, 0.035]], 12);
          wh.rotateX(Math.PI / 2);
          kit.add(wh, M.metal('#3a3a40', 0.5), { pos: [x, 0.13, z * (z > 0 ? 1 : 1)], rot: [z > 0 ? Math.PI : 0, 0, 0], uv: 'box' });
        }
      }
      kit.add(chamferBox(0.08, 0.06, 0.12, 0.01), dark, { pos: [0.68, 0.24, 0] });
      kit.add(chamferBox(0.08, 0.06, 0.12, 0.01), dark, { pos: [-0.68, 0.24, 0] });
      if (!o.empty) {
        for (let i = 0; i < 9; i++) {
          const x = (hash2(i, 1, 6) - 0.5) * 0.85, z = (hash2(i, 2, 6) - 0.5) * 0.45;
          const s = 0.85 + hash2(i, 3, 6) * 0.5;
          kit.add(rockGeo(0.12 * s, 0.09 * s, 0.1 * s, 60 + i, 12), M.stone(i % 3 ? ore : shadeHex(ore, -0.2)), { pos: [x, 0.62 + (0.12 - Math.abs(x) * 0.1), z] });
        }
        for (let i = 0; i < 6; i++) kit.add(prism(5, 0.018, 0.04, { tip: 0.03, seed: i }), glowMat(shadeHex(ore, 0.45), 2.2), { pos: [(hash2(i, 4, 6) - 0.5) * 0.7, 0.8, (hash2(i, 5, 6) - 0.5) * 0.35], rot: [hash2(i, 6, 6), 0, hash2(i, 7, 6) - 0.5], uv: 'raw' });
      }
      return kit.build();
    });
  },

  rails(o) {
    const L = o.length || 6;
    return cached('rails' + L.toFixed(2), () => {
      const kit = new Kit();
      const n = Math.max(1, Math.floor(L / 0.42));
      const sl = M.wood('#5a3a22', 8);
      for (let i = 0; i < n; i++) kit.add(beam(0.13, 0.58, 0.055, i + 1, 0.01), sl, { pos: [-L / 2 + (i + 0.5) * (L / n), 0.027, (hash2(i, 2, 7) - 0.5) * 0.04], rot: [0, (hash2(i, 1, 7) - 0.5) * 0.16, 0] });
      // I-profile rails
      const prof = shape([[-0.028, 0], [0.028, 0], [0.028, 0.008], [0.008, 0.014], [0.008, 0.04], [0.016, 0.045], [0.016, 0.06], [-0.016, 0.06], [-0.016, 0.045], [-0.008, 0.04], [-0.008, 0.014], [-0.028, 0.008]]);
      for (const z of [-0.18, 0.18]) {
        const r = extrude(prof, L, 0);
        r.rotateY(Math.PI / 2);
        kit.add(r, M.metal('#7a7e88', 0.35, 10), { pos: [0, 0.055, z] });
        kit.add(chamferBox(L, 0.006, 0.026, 0.002), flatMat('#c8ccd4'), { pos: [0, 0.117, z] });
        for (let i = 0; i < n; i++) kit.add(prism(4, 0.05, 0.012, { rot: Math.PI / 4 }), flatMat('#4a4e58'), { pos: [-L / 2 + (i + 0.5) * (L / n), 0.054, z], uv: 'raw' });
      }
      return kit.build();
    });
  },

  support(o) {
    const w = o.width || 22, h = o.height || 30;
    return cached('support' + w + 'x' + h, () => {
      const kit = new Kit();
      const W = w * 0.08, H = h * 0.08;
      const post = M.wood('#7a5232', 11), plate = M.metal(IRON_D, 0.5);
      for (const sx of [-1, 1]) {
        kit.add(beam(H, 0.17, 0.17, sx > 0 ? 2 : 3, 0.018), post, { pos: [sx * W / 2, H / 2, 0], rot: [0, 0, Math.PI / 2] });
        kit.add(rockGeo(0.16, 0.06, 0.14, sx > 0 ? 4 : 5, 12), M.stone('#7a736c'), { pos: [sx * W / 2, -0.03, 0] });
        // angled brace
        stick(kit, [sx * (W / 2 - 0.05), H - 0.65, 0], [sx * (W / 2 - 0.55), H - 0.08, 0], 0.055, post, 4, 1, sx > 0 ? 6 : 7);
        // iron bracket plates + rivets
        kit.add(chamferBox(0.2, 0.26, 0.01, 0.004), plate, { pos: [sx * W / 2, H - 0.14, 0.09] });
        for (const dy of [-0.08, 0.04]) rivet(kit, [sx * W / 2, H - 0.14 + dy, 0.098], 0.012, flatMat('#a0a6b0'));
      }
      kit.add(beam(W + 0.32, 0.3, 0.24, 9, 0.022), post, { pos: [0, H + 0.08, 0] });
      // a wedge shim and a hanging hook
      kit.add(hull([[-0.1, 0, -0.1], [0.1, 0, -0.1], [-0.1, 0, 0.1], [0.1, 0, 0.1], [-0.1, 0.04, -0.1], [-0.1, 0.04, 0.1]]), post, { pos: [W / 2 - 0.2, H - 0.06, 0] });
      kit.add(new THREE.TorusGeometry(0.03, 0.006, 3, 8, Math.PI * 1.4), plate, { pos: [0.3, H - 0.1, 0.13], uv: 'keep' });
      return kit.build();
    });
  },

  crystal(o) {
    const col = o.color || '#6ad8ff';
    const s = o.size || 1;
    const grp = new THREE.Group();
    grp.add(cached('crystal' + col + Math.round(s * 100) + (o.seed || 0), () => {
      const kit = new Kit();
      const h = 0.5 * s, r = 0.09 * s, seed = (o.seed || 0) + Math.round(s * 37);
      kit.add(prism(6, r, h, { taper: 0.88, tip: r * 2.4, jitter: 0.25, seed, rot: hash2(seed, 1, 1) }), crystalMat(col), { ppm: 96 });
      kit.add(prism(5, r * 0.4, h * 0.95, { taper: 0.7, tip: r, seed: seed + 2 }), glowMat(shadeHex(col, 0.55), 3), { pos: [0, 0.01, 0], uv: 'raw' });
      // a tiny sibling at the base
      kit.add(prism(5, r * 0.45, h * 0.35, { taper: 0.9, tip: r * 0.9, seed: seed + 5 }), crystalMat(col), { pos: [r * 1.05, 0, r * 0.3], rot: [0.2, 0, -0.45] });
      return kit.build();
    }));
    if (o.light) addLight(grp, new THREE.PointLight(new THREE.Color(col), o.light, 3.5 * s, 1.6), [0, 0.4 * s, 0.15]);
    return grp;
  },

  crystalcluster(o) {
    const col = o.color || '#6ad8ff';
    const col2 = o.color2 || col;
    const s = o.size || 1;
    const grp = new THREE.Group();
    grp.add(BUILDERS.rock({ size: 0.7 * s, tone: o.rock, seed: 11 }));
    const n = o.count || 5;
    for (let i = 0; i < n; i++) {
      const c = BUILDERS.crystal({ color: i % 2 ? col2 : col, size: s * (0.5 + hash2(i, n, 3) * 0.8), seed: i });
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
    const tone = o.tone || ['#4a443e', '#55504a', '#5e5852', '#686058'];
    const seed = o.seed ?? 1;
    return cached('rock' + Math.round(s * 100) + seed + avgTone(tone) + (o.moss || ''), () => {
      const kit = new Kit();
      const rx = 0.3 * s + 0.1, ry = 0.26 * s + 0.05, rz = 0.27 * s + 0.09;
      const R = (rx + ry + rz) / 3;
      const tint = stoneTint(avgTone(tone));
      const boulder = (c, r, sd) => chipped(noisy(ellipsoid(c, r), R * 0.08, 2.4 / R, sd), c, (r[0] + r[1] + r[2]) / 3, 7, 0.34, sd);
      const ground = (f) => floor(f, -0.01);
      const main = ground(boulder([0, ry * 0.8, 0], [rx, ry, rz], seed));
      const parts = [{ f: main, m: 'stone' }];
      if (s > 0.4) parts.push({ f: ground(boulder([rx * 0.9, ry * 0.35, rz * 0.4], [rx * 0.42, ry * 0.45, rz * 0.4], seed + 9)), m: 'stone2' });
      if (o.moss) parts.push({ f: keep((x, y, z) => Math.max(main(x, y, z) - R * 0.05, ry * 1.25 - y + (noise3(x * 9, y * 9, z * 9, seed) - 0.5) * ry * 0.9), main, R * 0.05), m: 'moss' });
      addSculpt(kit, parts, [-rx * 1.25, -0.02, -rz * 1.25], [rx * 1.5, ry * 2.05, rz * 1.25], R / 6.5,
        { stone: M.stone(tint, 5 + (seed % 3)), stone2: M.stone(shadeHex(tint, -0.08), 6), moss: M.cloth(o.moss) }, {}, { k: R * 0.12, seed, jitter: 0.2 });
      return kit.build();
    });
  },

  stalactite(o) {
    const h = o.length || 14;
    const tone = o.tone || ['#4a443e', '#55504a', '#5e5852', '#686058'];
    const tipc = o.tip;
    return cached('stal' + h + avgTone(tone) + (tipc || ''), () => {
      const kit = new Kit();
      const L = h * 0.07;
      const n = Math.max(3, Math.round(L / 0.22));
      const pts = [], radii = [];
      let dx = 0, dz = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([dx, -t * L, dz]);
        radii.push(0.24 * Math.pow(1 - t, 0.85) * (1 + (hash2(i, 5, h) - 0.5) * 0.3) + 0.012);
        dx += (hash2(i, 1, h) - 0.5) * 0.05; dz += (hash2(i, 2, h) - 0.5) * 0.05;
      }
      const fs = [chain(pts, radii, 0.08)];
      for (let k = 0; k < Math.min(3, n - 1); k++) { // side drips running off the main spike
        const i = 1 + Math.floor(hash2(k, 3, h) * (n - 2)), a = hash2(k, 4, h) * 6.28, r0 = radii[i], p0 = pts[i];
        fs.push(capsule([p0[0] + Math.cos(a) * r0 * 0.5, p0[1], p0[2] + Math.sin(a) * r0 * 0.5], [p0[0] + Math.cos(a) * r0 * 1.05, p0[1] - Math.min(0.5, L * 0.2), p0[2] + Math.sin(a) * r0 * 1.05], r0 * 0.42, 0.014));
      }
      const f = noisy(union(0.05, ...fs), 0.022, 8, h);
      const cell = L > 3 ? 0.08 : 0.06;
      addSculpt(kit, [{ f: (x, y, z) => Math.max(f(x, y, z), y), m: 'stone' }], [-0.5, -L - 0.08, -0.5], [0.5, 0.04, 0.5], cell,
        { stone: M.stone(stoneTint(avgTone(tone)), 6) }, {}, { seed: h, jitter: 0.18 });
      if (tipc) kit.add(prism(5, 0.03, 0.14, { taper: 0.4, seed: h }), glowMat(tipc, 2.6), { pos: [pts[n][0], -L - 0.06, pts[n][2]], uv: 'raw' });
      return kit.build();
    });
  },

  mushroom(o) {
    const giant = !!o.giant;
    const cap = o.color || '#d04a3a';
    const glowc = o.glow || null;
    const grp = new THREE.Group();
    if (giant) {
      const H = (o.height || 26) * 0.11, R = (o.radius || 12) * 0.11;
      grp.add(cached('gmush' + cap + (glowc || '') + H.toFixed(2) + R.toFixed(2), () => {
        const kit = new Kit();
        const stem = [chain([[0, 0, 0], [0, H * 0.18, 0], [R * 0.06, H * 0.55, 0.02], [0, H, 0]], [R * 0.32, R * 0.21, R * 0.165, R * 0.19], R * 0.12)];
        for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.3; stem.push(capsule([Math.cos(a) * R * 0.48, 0, Math.sin(a) * R * 0.48], [Math.cos(a) * R * 0.1, H * 0.16, Math.sin(a) * R * 0.1], R * 0.07, R * 0.13)); }
        stem.push(torus([0, H * 0.74, 0], R * 0.21, R * 0.03));
        const capE = ellipsoid([0, H, 0], [R, R * 0.8, R]);
        const capF = noisy(keep((x, y, z) => Math.max(capE(x, y, z), H + R * 0.02 - y), capE), R * 0.035, 2.2 / R, 5);
        const gill = ellipsoid([0, H + R * 0.035, 0], [R * 0.93, R * 0.07, R * 0.93]);
        const parts = [{ f: noisy(union(R * 0.06, ...stem), R * 0.02, 3 / R, 3), m: 'stem' }, { f: capF, m: 'cap' }, { f: gill, m: 'gill' }];
        addSculpt(kit, parts.map((p) => ({ ...p, f: floor(p.f) })), [-R * 1.1, -0.02, -R * 1.1], [R * 1.1, H + R * 0.9, R * 1.1], Math.min(R / 10, H / 22),
          { stem: texMat(TEX.bone(), '#ece2cc'), cap: texMat(TEX.cap(cap, glowc ? mixHex(glowc, '#ffffff', 0.5) : '#f4ecd8')), gill: glowc ? glowMat(glowc, 1.6) : M.cloth(shadeHex(cap, -0.3)) },
          { per: { cap: { ppm: 64 }, gill: { uv: 'raw' } } }, { k: R * 0.04, jitter: 0.15 });
        if (glowc) for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.4, rr = R * (0.3 + hash2(i, 3, 5) * 0.45);
          const yy = H + R * 0.8 * Math.sqrt(Math.max(0, 1 - (rr / R) ** 2)) - 0.01;
          kit.add(rockGeo(R * 0.07, R * 0.03, R * 0.07, i + 70, 8, 0.5), glowMat(glowc, 2.6), { pos: [Math.cos(a) * rr, yy, Math.sin(a) * rr], uv: 'raw' });
        }
        return kit.build();
      }));
      if (glowc && o.light !== 0) addLight(grp, new THREE.PointLight(new THREE.Color(glowc), o.light ?? 2.5, R * 3.2, 1.4), [0, H - 0.1, 0]);
    } else {
      grp.add(cached('smush' + cap + (glowc || ''), () => {
        const kit = new Kit();
        const defs = [[0, 0, 0.2, 0.08, 0], [-0.08, 0.06, 0.13, 0.055, 1], [0.075, -0.05, 0.1, 0.045, 2]];
        const parts = [];
        for (const [x, z, h, r, i] of defs) {
          const lean = (i - 1) * 0.04;
          parts.push({ f: capsule([x, 0, z], [x + lean, h, z + lean * 0.5], r * 0.32, r * 0.24), m: 'stem' });
          const ce = ellipsoid([x + lean, h, z + lean * 0.5], [r, r * 0.75, r]);
          parts.push({ f: noisy(keep((px, py, pz) => Math.max(ce(px, py, pz), h - py), ce), r * 0.06, 30, i), m: 'cap' });
        }
        addSculpt(kit, parts.map((p) => ({ ...p, f: floor(p.f) })), [-0.16, -0.01, -0.12], [0.16, 0.28, 0.14], 0.014,
          { stem: texMat(TEX.bone(), '#ece2cc'), cap: glowc ? glowMat(glowc, 2.4) : texMat(TEX.cap(cap)) }, { per: { cap: glowc ? { uv: 'raw' } : { ppm: 160 } } }, { k: 0.01, jitter: 0.1 });
        return kit.build({ shadow: false });
      }));
    }
    return grp;
  },

  anvil() {
    return cached('anvil', () => {
      const kit = new Kit();
      // tree-stump base: sculpted trunk with root flares gripping the floor, flat sawn top
      const trunk = [capsule([0, 0, 0], [0, 0.3, 0], 0.2, 0.175)];
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.3; trunk.push(capsule([Math.cos(a) * 0.3, 0.01, Math.sin(a) * 0.3], [Math.cos(a) * 0.14, 0.16, Math.sin(a) * 0.14], 0.035, 0.07)); }
      const stumpF = noisy(union(0.06, ...trunk), 0.012, 14, 4);
      addSculpt(kit, [{ f: floor(keep((x, y, z) => Math.max(stumpF(x, y, z), y - 0.3), stumpF)), m: 'bark' }], [-0.36, -0.01, -0.36], [0.36, 0.31, 0.36], 0.028, { bark: M.bark('#5a3a22') }, {}, { jitter: 0.14 });
      const top = new THREE.CircleGeometry(0.17, 9); top.rotateX(-Math.PI / 2);
      kit.add(top, M.end(), { pos: [0, 0.302, 0], uv: 'keep' });
      // the anvil silhouette: horn, waist, heel
      const sil = shape([[-0.17, 0], [0.17, 0], [0.15, 0.035], [0.09, 0.055], [0.075, 0.14], [0.17, 0.175], [0.25, 0.2], [0.25, 0.255], [-0.12, 0.26], [-0.2, 0.245], [-0.36, 0.215], [-0.2, 0.18], [-0.09, 0.15], [-0.075, 0.055], [-0.15, 0.035]]);
      const body = extrude(sil, 0.16, 0.008);
      const bp = body.attributes.position;
      for (let i = 0; i < bp.count; i++) { const x = bp.getX(i); if (x < -0.12) bp.setZ(i, bp.getZ(i) * (1 - Math.min(0.85, (-0.12 - x) / 0.28))); }
      kit.add(body, M.metal('#4a4e58', 0.04, 12), { pos: [0, 0.3, 0] });
      kit.add(chamferBox(0.37, 0.012, 0.15, 0.004), M.metal('#a8b0bc', 0, 13), { pos: [0.065, 0.56, 0] });
      kit.add(chamferBox(0.03, 0.006, 0.03, 0.001), flatMat('#1a1a1e'), { pos: [0.18, 0.567, 0] });
      for (const sx of [-1, 1]) kit.add(chamferBox(0.03, 0.12, 0.2, 0.004), M.metal(IRON_D, 0.6), { pos: [sx * 0.11, 0.3, 0] });
      return kit.build();
    });
  },

  forge(o) {
    const grp = new THREE.Group();
    grp.add(cached('forge', () => {
      const kit = new Kit();
      kit.add(chippedBlock(1.1, 0.5, 0.72, 2, 0.035), M.brick(), { pos: [0, 0.25, 0] });
      const rim = M.stone('#a89484', 7);
      for (const z of [-1, 1]) for (let i = 0; i < 4; i++) kit.add(chippedBlock(0.28, 0.11, 0.1, 10 + i + z * 5, 0.03), rim, { pos: [-0.435 + i * 0.29, 0.54, z * 0.31], rot: [0, (hash2(i, z, 3) - 0.5) * 0.08, 0] });
      for (const x of [-1, 1]) kit.add(chippedBlock(0.1, 0.11, 0.5, 20 + x, 0.03), rim, { pos: [x * 0.52, 0.54, 0] });
      kit.add(chamferBox(0.92, 0.03, 0.5, 0.01), glowTexMat(TEX.coals(3), '#ffffff', 2.4), { pos: [0, 0.52, 0], ppm: 96 });
      for (let i = 0; i < 8; i++) kit.add(rockGeo(0.05, 0.035, 0.045, 80 + i, 9), glowTexMat(TEX.coals(), '#ffffff', 1.6), { pos: [(hash2(i, 1, 9) - 0.5) * 0.8, 0.55, (hash2(i, 2, 9) - 0.5) * 0.36] });
      // hood on four iron legs + chimney
      const iron = M.metal(IRON_D, 0.5, 14);
      for (const x of [-0.42, 0.42]) for (const z of [-0.22, 0.22]) stick(kit, [x, 0.56, z], [x * 0.95, 0.83, z * 0.95], 0.016, iron, 4, 1, 3);
      kit.add(hull([[-0.48, 0.82, -0.28], [0.48, 0.82, -0.28], [-0.48, 0.82, 0.28], [0.48, 0.82, 0.28], [-0.18, 1.02, -0.12], [0.18, 1.02, -0.12], [-0.18, 1.02, 0.12], [0.18, 1.02, 0.12]]), iron);
      kit.add(prism(6, 0.1, 0.32, { taper: 0.9 }), iron, { pos: [0, 1.0, 0] });
      kit.add(lathe([[0.12, 1.3], [0.13, 1.32], [0.12, 1.34], [0.09, 1.34]], 6), iron, { uv: 'box' });
      // bellows on the left
      const board = extrude(shape([[0, -0.1], [0.32, -0.04], [0.36, 0], [0.32, 0.04], [0, 0.1], [-0.04, 0]]), 0.02, 0.004);
      for (const dy of [-0.07, 0.07]) kit.add(board, M.wood(W_DARK), { pos: [-0.94, 0.32 + dy, 0], rot: [Math.PI / 2, 0, dy * 2] });
      kit.add(hull([[-0.94, 0.25, -0.09], [-0.94, 0.39, -0.09], [-0.94, 0.25, 0.09], [-0.94, 0.39, 0.09], [-0.64, 0.29, -0.03], [-0.64, 0.35, -0.03], [-0.64, 0.29, 0.03], [-0.64, 0.35, 0.03], [-0.8, 0.22, 0], [-0.8, 0.42, 0]]), M.leather('#6a4a32'));
      stick(kit, [-0.6, 0.32, 0], [-0.52, 0.34, 0], 0.025, M.metal(BRASS), 5, 0.6, 2);
      stick(kit, [-1.26, 0.3, 0], [-0.98, 0.33, 0], 0.016, M.wood(W_PINE), 5, 1, 4);
      // tongs leaning on the side
      for (const dz of [-0.012, 0.012]) stick(kit, [0.58, 0.02, 0.32 + dz], [0.52, 0.62, 0.3 + dz * 3], 0.008, iron, 4, 1, 6);
      return kit.build();
    }));
    const L = addLight(grp, new FlickerLight(0xff7a2a, o.intensity ?? 4, 6, { amount: 0.22 }), [0, 0.75, 0.3]);
    grp.userData.update = (dt, t) => L.tick(t);
    grp.userData.emit = (P, dt) => {
      if (rnd.chance(dt * 10)) P.add.emit({ pos: worldOf(grp, rnd.float(-0.4, 0.4), 0.58, rnd.float(-0.2, 0.2)), vel: [0, 0.9, 0], spread: 0.35, life: [0.5, 1.1], size: 1, color: ['#ffd27a', '#ff8a3a'], glow: 3, drag: 0.4 });
      if (rnd.chance(dt * 3)) P.alpha.emit({ pos: worldOf(grp, 0, 1.38, 0), posSpread: 0.05, vel: [0.04, 0.5, 0], spread: 0.05, life: [2, 3], size: [1, 2], sizeEnd: 3, color: '#3a3434', alpha: 0.4 });
    };
    return grp;
  },

  chest(o) {
    const kind = o.kind || 'wood';
    const P = {
      wood: { body: () => M.wood(W_OAK, 4), band: () => M.metal(IRON_D, 0.4), trim: GOLD, inside: 0xffd060, nails: true },
      iron: { body: () => M.metal('#5a5e68', 0.25, 15), band: () => M.metal('#2a2a30', 0.3), trim: '#c8ced8', inside: 0xffd060, nails: true },
      crystal: { body: () => texMat(TEX.stone(3), '#6a88d8'), band: () => glowMat('#6ad8ff', 1.8), trim: '#e0f8ff', inside: 0x9ae8ff, spikes: '#9ae8ff' },
      bone: { body: () => M.bone(), band: () => M.metal('#5a3a6a', 0.1), trim: '#c86bff', inside: 0xc86bff, skulls: true },
      gold: { body: () => M.wood(W_RED, 5), band: () => flatMat(GOLD), trim: '#fff0a0', inside: 0xffe08a, gems: '#ff4a6a', nails: true },
    }[kind];
    const grp = new THREE.Group();
    const W = 0.9, H = 0.45, D = 0.6, t = 0.03;
    grp.add(cached('chestB' + kind, () => {
      const kit = new Kit();
      const body = P.body(), band = P.band();
      kit.add(chamferBox(W - 2 * t, H - 0.02, D - 2 * t, 0.01), flatMat('#1e120c'), { pos: [0, H / 2, 0], uv: 'raw' });
      for (const sz of [-1, 1]) boards(kit, body, W - 0.01, H - 0.01, 3, { pos: [0, H / 2, sz * (D / 2 - t / 2)], rot: [0, sz > 0 ? 0 : Math.PI, 0], t, seed: sz + 3, nails: !!P.nails, nailIn: 0.05 });
      for (const sx of [-1, 1]) boards(kit, body, D - 0.01, H - 0.01, 3, { pos: [sx * (W / 2 - t / 2), H / 2, 0], rot: [0, (sx * Math.PI) / 2, 0], t, seed: sx + 7, nails: false });
      // straps down front and back, angle-iron guards on every corner
      for (const x of [-0.29, 0.29]) for (const sz of [-1, 1]) kit.add(plank(H + 0.012, 0.065, 0.012, Math.round(x * 10) + sz + 20, 0.002, 0.01), band, { pos: [x, H / 2, sz * (D / 2 + 0.006)], rot: [0, sz > 0 ? 0 : Math.PI, Math.PI / 2], order: 'YXZ' });
      const L = shape([[0, 0], [0.085, 0], [0.085, 0.016], [0.016, 0.016], [0.016, 0.085], [0, 0.085]]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.05, H - 0.05]) {
        const g = extrude(L, 0.1, 0.003);
        g.rotateX(-Math.PI / 2);
        kit.add(g, band, { pos: [sx * (W / 2 + 0.016), y, sz * (D / 2 + 0.016)], scale: [-sx, 1, sz] });
        if (P.nails) rivet(kit, [sx * (W / 2 - 0.03), y, sz * (D / 2 + 0.017)], 0.009, flatMat('#d8dee6'));
      }
      kit.add(chamferBox(0.14, 0.14, 0.025, 0.014), flatMat(P.trim), { pos: [0, H - 0.08, D / 2 + 0.014] });
      kit.add(chamferBox(0.025, 0.05, 0.01, 0.003), flatMat('#140c10'), { pos: [0, H - 0.09, D / 2 + 0.03] });
      kit.add(chamferBox(W - 0.08, 0.01, D - 0.08, 0.002), glowMat(new THREE.Color(P.inside).getStyle(), 1.4), { pos: [0, H - 0.05, 0], uv: 'raw' });
      if (P.skulls) for (const sx of [-1, 1]) {
        kit.add(rockGeo(0.05, 0.05, 0.045, 30 + sx, 10, 0.4), M.bone(), { pos: [sx * 0.39, 0.15, D / 2] });
        for (const e of [-0.016, 0.016]) kit.add(chamferBox(0.02, 0.02, 0.01, 0.003), glowMat(P.trim, 2.4), { pos: [sx * 0.39 + e, 0.2, D / 2 + 0.042], uv: 'raw' });
      }
      if (P.gems) for (const sx of [-1, 1]) kit.add(prism(6, 0.02, 0.01, { tip: 0.015, rot: 0.3 }), glowMat(P.gems, 2.4), { pos: [sx * 0.16, 0.3, D / 2 + 0.01], rot: [Math.PI / 2, 0, 0], uv: 'raw' });
      return kit.build();
    }));
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, H, -D / 2);
    lidPivot.add(cached('chestL' + kind, () => {
      const kit = new Kit();
      const body = P.body(), band = P.band(), n = 5, ky = 0.66;
      const arc = (a, dr = 0) => [D / 2 + Math.cos(a) * (D / 2 + dr), Math.sin(a) * ((D / 2) * ky + dr)];
      for (let i = 0; i < n; i++) { // curved lid from five bevelled boards
        const p0 = arc((i / n) * Math.PI), p1 = arc(((i + 1) / n) * Math.PI);
        const dz = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dz, dy);
        const phi = Math.atan2(dz, dy), nz = dy / len, ny = -dz / len;
        kit.add(plank(W - 0.012, len - 0.005, t, 40 + i, 0.004, 0.02), body, { pos: [0, (p0[1] + p1[1]) / 2 - ny * t / 2, (p0[0] + p1[0]) / 2 - nz * t / 2], rot: [phi, 0, 0] });
        if (P.nails) for (const sx of [-1, 1]) rivet(kit, [sx * (W / 2 - 0.05), (p0[1] + p1[1]) / 2 + ny * 0.004, (p0[0] + p1[0]) / 2 + nz * 0.004], 0.009, flatMat('#d8dee6'));
      }
      const arcPts = (dr) => { const a = []; for (let i = 0; i <= 10; i++) a.push(arc((i / 10) * Math.PI, dr)); return a; };
      const capG = extrude(shape(arcPts(-t * 0.6)), t, 0.004); capG.rotateY(-Math.PI / 2);
      for (const sx of [-1, 1]) kit.add(capG, body, { pos: [sx * (W / 2 - t / 2 - 0.006), 0, 0] });
      const bandG = extrude(shape([...arcPts(0.012), ...arcPts(-0.004).reverse()]), 0.065, 0.003); bandG.rotateY(-Math.PI / 2);
      for (const x of [-0.29, 0.29]) kit.add(bandG, band, { pos: [x, 0, 0] });
      kit.add(chamferBox(0.1, 0.075, 0.022, 0.01), flatMat(P.trim), { pos: [0, 0.02, D + 0.014] });
      if (P.spikes) for (const sx of [-1, 1]) kit.add(prism(5, 0.04, 0.12, { tip: 0.08, seed: sx + 3 }), glowMat(P.spikes, 2), { pos: [sx * 0.36, 0.12, D / 2], rot: [0, 0, -sx * 0.4], uv: 'raw' });
      return kit.build();
    }));
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
    grp.add(cached('torch', () => {
      const kit = new Kit();
      kit.add(prism(6, 0.024, 0.3, { taper: 1.25, seed: 2 }), M.wood(W_DARK, 7));
      kit.add(lathe([[0.03, 0.27], [0.055, 0.3], [0.06, 0.35], [0.052, 0.355], [0.045, 0.31], [0.028, 0.29]], 6), M.metal(IRON_D, 0.4), { uv: 'box' });
      for (const y of [0.29, 0.32]) kit.add(new THREE.TorusGeometry(0.04, 0.008, 3, 7), M.cloth('#7a5a3a'), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], uv: 'keep' });
      kit.add(new THREE.TorusGeometry(0.035, 0.01, 4, 8), M.metal(IRON_D, 0.4), { pos: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0], uv: 'keep' });
      kit.add(chamferBox(0.03, 0.03, 0.08, 0.006), M.metal(IRON_D, 0.4), { pos: [0, 0.12, -0.06] });
      return kit.build();
    }));
    const f = makeFlame(0.45, o.palette || 'fire');
    f.position.y = 0.34;
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
    grp.add(cached('brazier' + (o.tone || 'iron') + pal, () => {
      const kit = new Kit();
      const iron = M.metal('#3a343e', 0.3, 16);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        kit.add(tube([[Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.24, 0.2, Math.sin(a) * 0.24], [Math.cos(a) * 0.12, 0.42, Math.sin(a) * 0.12], [Math.cos(a) * 0.16, 0.6, Math.sin(a) * 0.16]], 0.022, 8, 4), iron, { uv: 'scale', uLen: 0.7, vLen: 0.14 });
        kit.add(chamferBox(0.08, 0.025, 0.08, 0.008), iron, { pos: [Math.cos(a) * 0.3, 0.012, Math.sin(a) * 0.3] });
      }
      kit.add(lathe([[0.1, 0.52], [0.26, 0.6], [0.31, 0.7], [0.32, 0.74], [0.29, 0.75], [0.25, 0.7]], 9), iron, { uv: 'box' });
      kit.add(lathe([[0.315, 0.71], [0.33, 0.72], [0.33, 0.735], [0.315, 0.745]], 9), o.tone === 'gold' ? flatMat(GOLD) : M.metal('#6a6070', 0.1), { uv: 'box' });
      kit.add(lathe([[0, 0.72], [0.27, 0.72]], 9), glowTexMat(TEX.coals(pal === 'purple' ? 21 : 10), pal === 'purple' ? '#d8a0ff' : '#ffffff', 2.3), { uv: 'box', ppm: 96 });
      return kit.build();
    }));
    const f = makeFlame(0.9, pal);
    f.position.y = 0.74;
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
    return cached('pillar' + h + String(tone) + broken + (o.rune || ''), () => {
      const kit = new Kit();
      const H = h * 0.1;
      const t0 = Array.isArray(tone) ? tone[0] : tone, t1 = Array.isArray(tone) ? tone[1] || t0 : tone;
      const mat = M.stone(stoneTint(t1), 3), matD = M.carved(stoneTint(t0));
      kit.add(chippedBlock(1.22, 0.16, 1.22, 2, 0.07), matD, { pos: [0, 0.08, 0] });
      kit.add(chippedBlock(1.04, 0.14, 1.04, 3, 0.05), mat, { pos: [0, 0.23, 0] });
      // fluted shaft
      const fl = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const r = i % 2 ? 0.4 : 0.44; fl.push([Math.cos(a) * r, Math.sin(a) * r]); }
      const top = broken ? H * 0.6 : H - 0.32;
      const shaft = extrude(shape(fl), top - 0.3, 0);
      shaft.rotateX(-Math.PI / 2);
      shaft.translate(0, (top - 0.3) / 2, 0);
      kit.add(wobble(shaft, 0.012, 4), mat, { pos: [0, 0.3, 0] });
      if (broken) {
        const pts = [];
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push([Math.cos(a) * 0.44, 0, Math.sin(a) * 0.44], [Math.cos(a) * 0.36, 0.1 + hash2(i, 3, h) * 0.32, Math.sin(a) * 0.36]); }
        kit.add(hull(pts), mat, { pos: [0, top, 0] });
        kit.add(rockGeo(0.32, 0.22, 0.28, h + 5, 14), mat, { pos: [0.9, 0, 0.5] });
        kit.add(rockGeo(0.18, 0.12, 0.16, h + 6, 10), mat, { pos: [-0.75, 0, 0.6] });
      } else {
        kit.add(lathe([[0.44, H - 0.32], [0.5, H - 0.24], [0.52, H - 0.2], [0.44, H - 0.16]], 12), mat, { uv: 'box' });
        kit.add(chippedBlock(1.2, 0.18, 1.2, 5, 0.07), matD, { pos: [0, H - 0.07, 0] });
      }
      if (o.rune) for (let y = 0.9; y < top - 0.2; y += 1.1) kit.add(lathe([[0.448, y], [0.448, y + 0.05]], 24), glowMat(o.rune, 2.3), { uv: 'raw' });
      return kit.build();
    });
  },

  statue(o) {
    const tone = o.tone || ['#8a7a5e', '#7a6a52', '#9a8a6e'];
    const eye = o.eye || '#4affe0';
    return cached('statue' + tone[0] + eye, () => {
      const kit = new Kit();
      const t0 = Array.isArray(tone) ? tone[0] : tone, t1 = Array.isArray(tone) ? tone[1] || t0 : tone;
      kit.add(chippedBlock(1.2, 0.32, 0.9, 3, 0.06), M.carved(stoneTint(t1)), { pos: [0, 0.16, 0] });
      // robed, hooded warden resting both hands on a greatsword
      const robe = chain([[0, 0.32, 0], [0, 0.8, 0.01], [0, 1.28, 0], [0, 1.5, -0.01]], [0.44, 0.36, 0.27, 0.25], 0.12);
      const folded = keep((x, y, z) => robe(x, y, z) - (y < 1.3 ? Math.max(0, Math.sin(Math.atan2(z, x) * 9 + y * 2)) * 0.022 * (1.3 - y) : 0), robe, 0.03);
      const shoulders = ellipsoid([0, 1.56, 0], [0.38, 0.15, 0.24]);
      const hood = subtract(0.03, union(0.06, ellipsoid([0, 1.86, 0], [0.22, 0.25, 0.22]), capsule([0, 1.95, -0.04], [0, 2.16, -0.1], 0.13, 0.03)), ellipsoid([0, 1.83, 0.15], [0.13, 0.17, 0.12]));
      const parts = [{ f: noisy(union(0.08, folded, shoulders, hood), 0.012, 9, 4), m: 'stone' }];
      for (const sx of [-1, 1]) {
        parts.push({ f: chain([[sx * 0.32, 1.55, 0.02], [sx * 0.3, 1.3, 0.16], [sx * 0.08, 1.12, 0.3]], [0.1, 0.085, 0.07], 0.04), m: 'stone' });
        parts.push({ f: ellipsoid([sx * 0.055, 1.1, 0.33], [0.06, 0.05, 0.055]), m: 'stone' });
      }
      parts.push({ f: ellipsoid([0, 1.8, 0.07], [0.12, 0.14, 0.1]), m: 'shadow' });
      parts.push({ f: keep((x, y, z) => Math.max(folded(x, y, z) - 0.016, y - 0.62 - (noise3(x * 8, y * 8, z * 8, 4) - 0.5) * 0.4), folded, 0.02), m: 'moss' });
      addSculpt(kit, parts, [-0.52, 0.3, -0.4], [0.52, 2.2, 0.45], 0.045, { stone: M.stone(stoneTint(t0), 4), shadow: flatMat('#14121a'), moss: M.cloth('#5a7a3a') }, { per: { shadow: { uv: 'raw' } } }, { k: 0.02, jitter: 0.15 });
      for (const sx of [-0.045, 0.045]) kit.add(chamferBox(0.035, 0.018, 0.02, 0.004), glowMat(eye, 2.6), { pos: [sx, 1.84, 0.175], uv: 'raw' });
      kit.add(lathe([[0.001, 1.22], [0.035, 1.21], [0.035, 1.17], [0.001, 1.16]], 6), flatMat('#c8a040'), { pos: [0, 0, 0.34], uv: 'raw' });
      stick(kit, [0, 1.04, 0.34], [0, 1.17, 0.34], 0.018, M.leather('#5a3a2a'), 6, 1, 3);
      kit.add(wobble(extrude(shape([[-0.14, 0], [-0.1, 0.03], [0.1, 0.03], [0.14, 0], [0.1, -0.02], [-0.1, -0.02]]), 0.05, 0.006), 0.004, 2), flatMat('#c8a040'), { pos: [0, 1.03, 0.34] });
      kit.add(extrude(shape([[-0.045, 0], [0.045, 0], [0.038, -0.62], [0, -0.72], [-0.038, -0.62]]), 0.022, 0.006), M.metal('#7a7e88', 0.4), { pos: [0, 1.01, 0.36] });
      return kit.build();
    });
  },

  sarcophagus(o) {
    const rune = o.rune || '#c86bff';
    return cached('sarc' + rune, () => {
      const kit = new Kit();
      const body = M.carved('#9a90b0'), lid = M.stone('#a89ebe', 4);
      kit.add(chippedBlock(1.06, 0.12, 2.2, 2, 0.05), lid, { pos: [0, 0.06, 0] });
      kit.add(chippedBlock(0.98, 0.42, 2.1, 3, 0.04), body, { pos: [0, 0.33, 0] });
      kit.add(chippedBlock(1.02, 0.1, 2.14, 4, 0.05), lid, { pos: [0, 0.59, 0] });
      // carved effigy of a knight at rest
      const torsoC = chain([[0, 0.64, -0.82], [0, 0.66, -0.25], [0, 0.66, 0.38]], [0.15, 0.24, 0.23], 0.08);
      const fig = union(0.06,
        keep((x, y, z) => torsoC(x, 0.64 + (y - 0.64) * 2.2, z), torsoC),
        sphere([0, 0.7, 0.72], 0.13), ellipsoid([0, 0.72, 0.5], [0.27, 0.06, 0.12]),
        capsule([-0.2, 0.74, 0.44], [0.08, 0.79, 0.14], 0.055, 0.045), capsule([0.2, 0.74, 0.44], [-0.08, 0.79, 0.14], 0.055, 0.045),
        ellipsoid([-0.08, 0.68, -0.9], [0.06, 0.09, 0.05]), ellipsoid([0.08, 0.68, -0.9], [0.06, 0.09, 0.05]));
      addSculpt(kit, [{ f: floor(noisy(fig, 0.008, 14, 2), 0.635), m: 'lid' }], [-0.32, 0.62, -1.0], [0.32, 0.9, 0.9], 0.032, { lid }, {}, { jitter: 0.12 });
      kit.add(extrude(shape([[-0.035, 0], [0.035, 0], [0.025, -0.8], [0, -0.88], [-0.025, -0.8]]), 0.02, 0.004), M.metal('#5a5470', 0.2), { pos: [0, 0.79, 0.16], rot: [Math.PI / 2, 0, 0] });
      for (const sx of [-0.045, 0.045]) kit.add(chamferBox(0.03, 0.012, 0.02, 0.003), glowMat(rune, 2.6), { pos: [sx, 0.76, 0.84], rot: [-0.6, 0, 0], uv: 'raw' });
      for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) kit.add(chamferBox(0.01, 0.05, 0.32, 0.004), glowMat(rune, 2.2), { pos: [sx * 0.493, 0.33, -0.75 + k * 0.5], uv: 'raw' });
      return kit.build();
    });
  },

  chains(o) {
    const L = o.length || 2;
    const grp = new THREE.Group();
    const link = new THREE.TorusGeometry(0.045, 0.014, 4, 6);
    const n = Math.floor(L / 0.07);
    const inst = new THREE.InstancedMesh(link, M.metal(o.color || '#5a5260', 0.3), n);
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
    return cached('bones', () => {
      const kit = new Kit();
      const fs = [];
      const bone = (x0, z0, x1, z1, y, r = 0.022) => {
        fs.push(capsule([x0, y, z0], [x1, y + 0.01, z1], r * 0.8, r * 0.7));
        const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), px = -dz / l, pz = dx / l, ux = dx / l, uz = dz / l;
        for (const [x, z, s] of [[x0, z0, -1], [x1, z1, 1]]) for (const d of [-1, 1]) fs.push(sphere([x + px * d * r * 0.75 + ux * s * r * 0.4, y, z + pz * d * r * 0.75 + uz * s * r * 0.4], r * 1.05));
      };
      bone(-0.32, -0.2, 0.06, -0.08, 0.03); bone(-0.16, 0.24, 0.2, -0.04, 0.05); bone(-0.28, 0.12, -0.04, 0.24, 0.03, 0.018); bone(0.0, 0.14, 0.32, 0.26, 0.05, 0.02);
      // skull: cranium, cheek-bones, jaw — sockets and nose carved out
      const sx = 0.2, sz = 0.04;
      const skull = subtract(0.012,
        union(0.03, ellipsoid([sx, 0.11, sz], [0.1, 0.095, 0.115]), ellipsoid([sx, 0.07, sz + 0.075], [0.078, 0.06, 0.06]), sbox([sx, 0.028, sz + 0.09], [0.052, 0.024, 0.04], 0.016)),
        sphere([sx - 0.037, 0.09, sz + 0.14], 0.029), sphere([sx + 0.037, 0.09, sz + 0.14], 0.029), sphere([sx, 0.058, sz + 0.145], 0.014), sbox([sx, 0.045, sz + 0.14], [0.05, 0.004, 0.03], 0.002));
      const ground = floor;
      addSculpt(kit, [
        ...fs.map((f) => ({ f: ground(f), m: 'bone' })), { f: ground(skull), m: 'bone' },
        { f: sphere([sx - 0.035, 0.088, sz + 0.12], 0.02), m: 'dark' }, { f: sphere([sx + 0.035, 0.088, sz + 0.12], 0.02), m: 'dark' },
      ], [-0.36, -0.01, -0.26], [0.4, 0.22, 0.3], 0.014, { bone: M.bone(), dark: flatMat('#1a1418') }, { per: { dark: { uv: 'raw' } } }, { k: 0.006, jitter: 0.1 });
      return kit.build();
    });
  },

  lavapool(o) {
    const r = o.radius || 1.2;
    const grp = new THREE.Group();
    const mat = surfaceMat('lava', o);
    const geo = new THREE.CircleGeometry(r, 14);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.02;
    grp.add(m);
    grp.add(cached('lavarim' + r.toFixed(2), () => {
      const kit = new Kit();
      const n = Math.round(r * 11);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash2(i, 1, 4) * 0.2;
        const s = 0.8 + hash2(i, 2, 4) * 0.6;
        kit.add(rockGeo(0.16 * s, 0.09 * s, 0.13 * s, 90 + i, 10), M.stone('#4a3c38', 8), { pos: [Math.cos(a) * r * 1.03, -0.02, Math.sin(a) * r * 1.03], rot: [0, -a, 0] });
      }
      kit.add(lathe([[r * 0.93, 0.025], [r * 1.0, 0.03]], 18), glowMat('#ff8a2a', 2.2), { uv: 'raw' });
      return kit.build();
    }));
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
    const geo = new THREE.CircleGeometry(r, 16);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.015;
    grp.add(m);
    grp.add(cached('waterrim' + r.toFixed(2) + (o.rim || ''), () => {
      const kit = new Kit();
      const n = Math.round(r * 12);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash2(i, 1, 6) * 0.2;
        const s = 0.7 + hash2(i, 2, 6) * 0.6;
        kit.add(rockGeo(0.14 * s, 0.07 * s, 0.11 * s, 110 + i, 10), M.stone(o.rim ? brighten(o.rim) : '#8a827a', 6), { pos: [Math.cos(a) * r * 1.02, -0.02, Math.sin(a) * r * 1.02], rot: [0, -a, 0] });
        if (i % 4 === 0) kit.add(rockGeo(0.06, 0.02, 0.05, 140 + i, 8, 0.5), M.cloth('#4a6a3a'), { pos: [Math.cos(a) * r * 1.02, 0.08 * s, Math.sin(a) * r * 1.02] });
      }
      return kit.build();
    }));
    grp.userData.update = (dt, t) => { mat.uniforms.time.value = t; };
    return grp;
  },

  ladder(o) {
    const h = o.height || 30;
    return cached('ladder' + h, () => {
      const kit = new Kit();
      const H = h * 0.06;
      for (const sx of [-1, 1]) kit.add(beam(H, 0.07, 0.06, sx + 3, 0.01), M.wood(W_OLD, 2), { pos: [sx * 0.26, H / 2, 0], rot: [0, 0, Math.PI / 2] });
      for (let y = 0.2; y < H - 0.05; y += 0.3) {
        stick(kit, [-0.27, y, 0], [0.27, y + 0.01, 0], 0.018, M.wood(W_PINE, 3), 6, 1, Math.round(y * 10));
        for (const sx of [-1, 1]) kit.add(new THREE.TorusGeometry(0.035, 0.008, 3, 7), M.rope(), { pos: [sx * 0.26, y, 0], rot: [0, Math.PI / 2, 0], uv: 'keep' });
      }
      return kit.build();
    });
  },

  elevator(o) {
    const grp = new THREE.Group();
    grp.add(cached('elevator', () => {
      const kit = new Kit();
      const deck = M.wood(W_OLD, 7), wood = M.wood('#6a4428', 9);
      boards(kit, deck, 1.56, 1.32, 7, { pos: [0, 0.09, 0], rot: [-Math.PI / 2, 0, 0], t: 0.04, seed: 5, nailIn: 0.06 });
      for (const sz of [-1, 1]) kit.add(beam(1.6, 0.1, 0.08, sz + 4), wood, { pos: [0, 0.02, sz * 0.62] });
      for (const [x, z] of [[-0.74, -0.6], [0.74, -0.6], [-0.74, 0.6], [0.74, 0.6]]) kit.add(beam(1.72, 0.11, 0.11, Math.round(x * 10 + z), 0.012), wood, { pos: [x, 0.94, z], rot: [0, 0, Math.PI / 2] });
      for (const sz of [-1, 1]) kit.add(beam(1.62, 0.12, 0.12, sz + 9), wood, { pos: [0, 1.8, sz * 0.6] });
      kit.add(beam(1.36, 0.12, 0.12, 11), wood, { pos: [0, 1.86, 0], rot: [0, Math.PI / 2, 0] });
      // railings
      for (const sz of [-1, 1]) kit.add(beam(1.5, 0.05, 0.05, sz + 12), wood, { pos: [0, 0.66, sz * 0.62] });
      kit.add(beam(1.24, 0.05, 0.05, 14), wood, { pos: [0.74, 0.66, 0], rot: [0, Math.PI / 2, 0] });
      // pulley + lever box
      const wh = lathe([[0.03, -0.03], [0.14, -0.03], [0.14, -0.012], [0.11, 0], [0.14, 0.012], [0.14, 0.03], [0.03, 0.03]], 10);
      wh.rotateX(Math.PI / 2);
      kit.add(wh, M.metal(IRON, 0.3), { pos: [0, 1.98, 0], uv: 'box' });
      kit.add(chamferBox(0.26, 0.24, 0.2, 0.02), M.metal(IRON_D, 0.5), { pos: [0, 0.23, -0.4] });
      stick(kit, [0, 0.33, -0.4], [0.06, 0.62, -0.36], 0.016, M.metal(STEEL), 5, 1, 2);
      kit.add(rockGeo(0.03, 0.03, 0.03, 4, 8, 0.1), glowMat('#ff4a3a', 1.8), { pos: [0.065, 0.6, -0.355], uv: 'raw' });
      return kit.build();
    }));
    const ropes = new Kit();
    for (const x of [-0.6, 0.6]) ropes.add(new THREE.CylinderGeometry(0.014, 0.014, 14, 5, 1), M.rope(), { pos: [x, 1.8 + 7, 0], uv: 'box', ppm: 96 });
    grp.add(ropes.build({ shadow: false }));
    return grp;
  },

  ropebridge(o) {
    const L = o.length || 8;
    const sag = o.sag ?? 0.35;
    const grp = new THREE.Group();
    const yAt = (x) => -sag * (1 - Math.pow((2 * x) / L, 2));
    grp.add(cached('bridge' + L.toFixed(2) + sag + (o.broken ? 'b' + (o.gap ?? 0) : ''), () => {
      const kit = new Kit();
      const n = Math.floor(L / 0.2);
      const planks = [M.wood(W_OLD, 12), M.wood('#6e5038', 13), M.wood('#8a6a4a', 14)];
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * (L / n);
        if (o.broken && Math.abs(x - (o.gap ?? 0)) < 0.5) continue;
        const slope = Math.atan2(yAt(x + 0.05) - yAt(x - 0.05), 0.1);
        kit.add(beam(0.16, 0.72 * (0.85 + hash2(i, 3, 4) * 0.2), 0.04, i + 1, 0.008), planks[i % 3], { pos: [x, yAt(x), (hash2(i, 5, 4) - 0.5) * 0.04], rot: [(hash2(i, 1, 4) - 0.5) * 0.08, (hash2(i, 2, 4) - 0.5) * 0.12, slope] });
      }
      for (const z of [-0.36, 0.36]) for (const hgt of [0.02, 0.62]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const x = -L / 2 + (i / 16) * L; pts.push([x, yAt(x) * (hgt > 0.1 ? 0.75 : 1) + hgt, z]); }
        kit.add(tube(pts, hgt > 0.1 ? 0.018 : 0.022, 24, 4), M.rope(), { uv: 'scale', uLen: L, vLen: 0.12 });
      }
      for (let i = 0; i <= Math.floor(L / 0.8); i++) for (const z of [-0.36, 0.36]) {
        const x = -L / 2 + i * 0.8;
        kit.add(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 3), M.rope(), { pos: [x, yAt(x) + 0.32, z], uv: 'box' });
      }
      return kit.build();
    }));
    grp.userData.yAt = yAt;
    return grp;
  },

  door(o) {
    const rune = o.rune || '#c86bff';
    const tone = o.tone || ['#3a3448', '#4a425a', '#2c2436'];
    const grp = new THREE.Group();
    grp.add(cached('door' + rune + tone[0], () => {
      const kit = new Kit();
      const arch = (w, hRect, segs = 10) => { const pts = [[-w, 0], [w, 0], [w, hRect]]; for (let i = 1; i < segs; i++) { const a = (i / segs) * Math.PI; pts.push([Math.cos(a) * w, hRect + Math.sin(a) * w]); } pts.push([-w, hRect]); return pts; };
      const frame = shape(arch(0.96, 1.78));
      const hole = new THREE.Path(); arch(0.76, 1.76).forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y))); hole.closePath();
      frame.holes.push(hole);
      kit.add(extrude(frame, 0.46, 0.02), M.carved(brighten('#5a5268')));
      kit.add(extrude(shape(arch(0.76, 1.76)), 0.12, 0.01), M.stone(brighten(tone[1]), 9), { pos: [0, 0, 0.04] });
      kit.add(chamferBox(0.02, 2.5, 0.02, 0.004), flatMat('#14101c'), { pos: [0, 1.25, 0.13] });
      kit.add(chippedBlock(0.28, 0.32, 0.5, 3, 0.05), M.carved(brighten('#6a6278')), { pos: [0, 2.68, 0] });
      kit.add(prism(6, 0.07, 0.03, { tip: 0.04 }), glowMat(rune, 2.6), { pos: [0, 2.7, 0.26], rot: [Math.PI / 2, 0, 0], uv: 'raw' });
      for (const sx of [-1, 1]) kit.add(chamferBox(0.06, 0.06, 0.06, 0.012), M.metal(IRON_D, 0.3), { pos: [sx * 0.3, 0.95, 0.14] });
      return kit.build();
    }));
    const runes = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9), glowTexMat(TX.runes(rune), '#ffffff', 2.2, { transparent: true, alphaTest: 0.3 }));
    runes.position.set(0, 1.25, 0.125);
    grp.add(runes);
    return grp;
  },

  signpost() {
    return cached('signpost', () => {
      const kit = new Kit();
      kit.add(prism(6, 0.04, 1.18, { taper: 0.85, jitter: 0.1, seed: 4 }), M.wood(W_OLD, 5));
      kit.add(rockGeo(0.12, 0.06, 0.1, 5, 10), M.stone('#7a736c'), { pos: [0, -0.02, 0] });
      const arrow = (dir) => extrude(shape(dir > 0 ? [[0, -0.07], [0.32, -0.07], [0.4, 0], [0.32, 0.07], [0, 0.07]] : [[0, -0.07], [-0.32, -0.07], [-0.4, 0], [-0.32, 0.07], [0, 0.07]]), 0.025, 0.004);
      kit.add(arrow(1), texMat(TX.sign()), { pos: [0.02, 0.98, 0.04], rot: [0, 0, 0.05], uv: 'box', ppm: 160 });
      kit.add(arrow(-1), texMat(TX.sign()), { pos: [-0.02, 0.74, 0.04], rot: [0, 0.3, -0.06], uv: 'box', ppm: 160 });
      for (const y of [0.98, 0.74]) rivet(kit, [0, y, 0.06], 0.012, flatMat('#a0a6b0'));
      return kit.build();
    });
  },

  books() {
    return cached('books', () => {
      const kit = new Kit();
      const C = ['#8a2a2a', '#2a4a8a', '#2a6a3a', '#6a3a8a', '#8a6a2a'];
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const h = 0.06 + (i % 2) * 0.025, w = 0.3 - i * 0.025, d = 0.22 - (i % 2) * 0.02;
        const rot = [0, (hash2(i, 1, 3) - 0.5) * 0.5, 0];
        kit.add(chamferBox(w, h, d, 0.006), M.leather(C[i % 5]), { pos: [0, y + h / 2, 0], rot });
        kit.add(chamferBox(w - 0.02, h - 0.016, d - 0.01, 0.002), texMat(TX.pages()), { pos: [0.012, y + h / 2, 0.006], rot, ppm: 256 });
        kit.add(chamferBox(0.008, h + 0.002, d * 0.9, 0.002), flatMat(GOLD), { pos: [-w / 2 + 0.03, y + h / 2, 0], rot });
        y += h;
      }
      // a candle stub on top
      kit.add(lathe([[0.025, y], [0.025, y + 0.06], [0.02, y + 0.065]], 6), texMat(TEX.bone(), '#f0e8d8'), { uv: 'box' });
      kit.add(prism(4, 0.008, 0.03, { tip: 0.015 }), glowMat('#ffd890', 2.8), { pos: [0, y + 0.065, 0], uv: 'raw' });
      return kit.build();
    });
  },

  sack(o) {
    const c = o.color || '#b8986a';
    return cached('sack' + c + (o.ore || ''), () => {
      const kit = new Kit();
      sackSculpt(kit, M.cloth(c), [0, 0, 0], 1);
      if (o.ore) for (let i = 0; i < 3; i++) kit.add(rockGeo(0.045, 0.035, 0.04, 30 + i, 9), M.stone(brighten(o.ore)), { pos: [(i - 1) * 0.04, 0.45, (i % 2) * 0.03] });
      return kit.build();
    });
  },

  banner(o) {
    const c = o.color || '#5a2a7a';
    const sym = o.symbol || '#c86bff';
    return cached('banner' + c + sym, () => {
      const kit = new Kit();
      const cloth = new THREE.ShapeGeometry(shape([[-0.28, 0], [0.28, 0], [0.28, -1.32], [0, -1.12], [-0.28, -1.32]]), 1);
      const tri = cloth.toNonIndexed();
      // subdivide by displacing: gentle wave along y
      const pos = tri.attributes.position, uv = tri.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        uv.setXY(i, (x + 0.28) / 0.56, 1 + y / 1.4);
        pos.setZ(i, Math.sin(y * 4 + x * 2) * 0.03);
      }
      const symMask = paintTex('banmask' + sym, 32, 64, (p, W, H) => {
        const src = TX.banner('#000000', '#ffffff').image.getContext('2d').getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (src[i] > 200 && src[i + 1] > 200 && src[i + 2] > 200) p.set(x, y, sym); else p.set(x, y, '#000000'); }
      }, { clamp: true });
      kit.add(tri, texMat(TX.banner(c, sym), '#ffffff', { side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: symMask, emissiveIntensity: 1.6 }), { uv: 'raw' });
      kit.add(prism(6, 0.018, 0.72, { seed: 2 }), M.wood(W_DARK), { rot: [0, 0, Math.PI / 2], pos: [0.36, 0.0, 0] });
      for (const sx of [-1, 1]) kit.add(rockGeo(0.03, 0.03, 0.03, 4 + sx, 8, 0.1), flatMat(GOLD), { pos: [sx * 0.37, -0.03, 0], uv: 'raw' });
      return kit.build();
    });
  },

  urn(o) {
    const c = o.color || '#9a5a3a';
    return cached('urn' + c, () => {
      const kit = new Kit();
      kit.add(wobble(lathe([[0.001, 0], [0.1, 0], [0.12, 0.02], [0.17, 0.11], [0.185, 0.21], [0.15, 0.31], [0.09, 0.37], [0.075, 0.42], [0.11, 0.46], [0.1, 0.48], [0.07, 0.47]], 11), 0.012, 5), texMat(TX.pottery(c)), { uv: 'scale', uLen: 1.1, vLen: 0.48 });
      for (const sx of [-1, 1]) kit.add(new THREE.TorusGeometry(0.06, 0.014, 4, 8, Math.PI), texMat(TX.pottery(c)), { pos: [sx * 0.13, 0.36, 0], rot: [0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2], uv: 'keep' });
      return kit.build();
    });
  },

  web(o) {
    const s = o.size || 1;
    const grp = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0xd8d8e8, transparent: true, opacity: 0.55 });
    const pts = [];
    const rings = 5, spokes = 9;
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
    grp.add(cached('vent', () => {
      const kit = new Kit();
      const mound = subtract(0.05, noisy(ellipsoid([0, 0, 0], [0.42, 0.36, 0.42]), 0.035, 7, 3), ellipsoid([0, 0.37, 0], [0.15, 0.17, 0.15]));
      addSculpt(kit, [
        { f: floor(mound), m: 'rock' },
        { f: noisy(ellipsoid([0, 0.205, 0], [0.12, 0.04, 0.12]), 0.01, 20, 4), m: 'glow' },
      ], [-0.5, -0.02, -0.5], [0.5, 0.42, 0.5], 0.036, { rock: M.stone('#5a4038', 8), glow: glowTexMat(TEX.coals(), '#ffffff', 2.4) }, { per: { glow: { ppm: 96 } } }, { k: 0.02, jitter: 0.2 });
      for (let i = 0; i < 5; i++) { const a = i * 1.3; kit.add(rockGeo(0.07, 0.05, 0.06, 150 + i, 9), M.stone('#4a3634', 7), { pos: [Math.cos(a) * 0.44, 0, Math.sin(a) * 0.44] }); }
      return kit.build();
    }));
    grp.userData.emit = (P, dt) => {
      if (rnd.chance(dt * 5)) P.alpha.emit({ pos: worldOf(grp, 0, 0.4, 0), vel: [0, 0.8, 0], spread: 0.1, life: [1.5, 2.6], size: [1, 2], sizeEnd: 4, color: '#3a2a2a', alpha: 0.45 });
      if (rnd.chance(dt * 8)) P.add.emit({ pos: worldOf(grp, 0, 0.35, 0), vel: [0, 1.6, 0], spread: 0.4, life: [0.5, 1.2], size: 1, color: ['#ffd04a', '#ff6a1a'], glow: 3, gravity: 1.2 });
    };
    return grp;
  },

  merchantcart(o) {
    const grp = new THREE.Group();
    grp.add(cached('mcart', () => {
      const kit = new Kit();
      const deck = M.wood(W_RED, 8), wood = M.wood('#6a4428', 15), dark = M.wood(W_DARK, 16);
      boards(kit, deck, 2.2, 1.2, 6, { pos: [0, 0.52, 0], rot: [-Math.PI / 2, 0, 0], t: 0.05, seed: 11, nailIn: 0.08 });
      for (const sz of [-1, 1]) boards(kit, deck, 2.2, 0.36, 3, { pos: [0, 0.74, sz * 0.58], rot: [0, sz > 0 ? 0 : Math.PI, 0], t: 0.05, seed: 12 + sz, nailIn: 0.06 });
      for (const sx of [-1, 1]) boards(kit, deck, 1.1, 0.36, 3, { pos: [sx * 1.08, 0.74, 0], rot: [0, (sx * Math.PI) / 2, 0], t: 0.05, seed: 15 + sx, nails: false });
      for (const sz of [-1, 1]) kit.add(beam(2.26, 0.06, 0.06, sz + 2), dark, { pos: [0, 0.93, sz * 0.6] });
      // spoked wheels
      for (const x of [-0.66, 0.66]) for (const z of [-0.66, 0.66]) {
        const rim = new THREE.TorusGeometry(0.31, 0.035, 4, 14);
        kit.add(rim, dark, { pos: [x, 0.33, z], uv: 'keep' });
        const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8); hub.rotateX(Math.PI / 2);
        kit.add(hub, M.metal(IRON_D, 0.3), { pos: [x, 0.33, z] });
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; stick(kit, [x, 0.33, z], [x + Math.cos(a) * 0.29, 0.33 + Math.sin(a) * 0.29, z], 0.014, wood, 4, 0.8, k); }
      }
      kit.add(beam(1.6, 0.1, 0.08, 7), dark, { pos: [0, 0.33, 0], rot: [0, Math.PI / 2, 0] });
      // awning posts + striped canvas canopy with scalloped valance
      for (const [x, z] of [[-1.05, -0.55], [1.05, -0.55], [-1.05, 0.55], [1.05, 0.55]]) kit.add(prism(6, 0.035, 1.5, { taper: 0.9, seed: Math.round(x * 3 + z) }), wood, { pos: [x, 0.5, z] });
      const can = new THREE.PlaneGeometry(2.4, 1.4, 6, 4);
      can.rotateX(-Math.PI / 2);
      const cp = can.attributes.position;
      for (let i = 0; i < cp.count; i++) { const z = cp.getZ(i); cp.setY(i, 2.0 + Math.cos((z / 0.7) * Math.PI / 2) * 0.22); }
      kit.add(can, texMat(TEX.stripes('#c83a3a', '#f0e0c0'), '#ffffff', DS), { uv: 'box', ppm: 48 });
      for (const sz of [-1, 1]) for (let k = 0; k < 12; k++) {
        const x = -1.1 + k * 0.2;
        const f = new THREE.BufferGeometry();
        f.setAttribute('position', new THREE.Float32BufferAttribute([x, 2.0, sz * 0.7, x + 0.2, 2.0, sz * 0.7, x + 0.1, 1.86, sz * 0.72], 3));
        kit.add(f, flatMat(k % 2 ? '#a82a2a' : '#d8c8a8', DS), { uv: 'raw' });
      }
      // goods: sacks of ore, a crate of glowing gems, hanging pots
      for (const [x, z, ore] of [[-0.62, -0.18, '#c8743a'], [-0.18, -0.25, '#9aa3b2']]) {
        sackSculpt(kit, M.cloth('#b8986a'), [x, 0.545, z], 0.9, x > -0.5 ? 9 : 8);
        for (let i = 0; i < 3; i++) kit.add(rockGeo(0.05, 0.04, 0.045, 160 + i, 9), M.stone(brighten(ore)), { pos: [x + (i - 1) * 0.05, 0.94, z + (i % 2) * 0.03] });
      }
      kit.add(chamferBox(0.5, 0.3, 0.4, 0.02), M.planks(W_OAK, 8, 9), { pos: [0.55, 0.71, -0.1] });
      for (let i = 0; i < 7; i++) kit.add(prism(5, 0.035, 0.05, { tip: 0.04, seed: i }), glowMat(i % 2 ? '#b06bff' : '#6ad8ff', 2.4), { pos: [0.4 + (i % 4) * 0.09, 0.86, -0.22 + Math.floor(i / 4) * 0.16], rot: [hash2(i, 1, 2) * 0.6, 0, hash2(i, 2, 2) * 0.6 - 0.3], uv: 'raw' });
      for (const [x, c] of [[-0.8, '#c8743a'], [-0.4, '#9aa0aa'], [0.0, '#e0c060'], [0.4, '#5a8a3a'], [0.8, '#9a3a5a']]) {
        kit.add(new THREE.CylinderGeometry(0.005, 0.005, 0.22, 3), M.rope(), { pos: [x, 1.86, 0.62], uv: 'box' });
        kit.add(wobble(lathe([[0.001, 1.58], [0.06, 1.6], [0.08, 1.66], [0.07, 1.72], [0.05, 1.74]], 7), 0.006, 2), M.metal(c, 0.1), { pos: [x, 0, 0.62], uv: 'box' });
      }
      // painted sign on the canopy front
      kit.add(chamferBox(1.0, 0.24, 0.04, 0.01), texMat(TX.sign()), { pos: [0, 2.32, 0.72], uv: 'box', ppm: 64 });
      return kit.build();
    }));
    const lan = BUILDERS.lantern({ hang: 0.15, intensity: 2.2, distance: 5 });
    lan.position.set(1.0, 1.85, 0.62);
    grp.add(lan);
    grp.userData.lights = lan.userData.lights;
    return grp;
  },

  roots(o) {
    const c = o.color || '#5a4030';
    const L = (o.length || 20) * 0.08;
    return cached('roots' + c + L.toFixed(2), () => {
      const kit = new Kit();
      const fs = [];
      for (let k = 0; k < 4; k++) {
        const pts = [], radii = [];
        let y = 0.66 - k * 0.13;
        const n = Math.max(4, Math.round(L / 0.18));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          y += Math.sin(i * 1.3 + k) * 0.045;
          pts.push([t * L, Math.max(0.05, Math.min(0.78, y)), (k - 1.5) * 0.09 + Math.sin(i * 0.9 + k) * 0.05]);
          radii.push((0.075 - k * 0.011) * (1 - t * 0.75) + 0.012);
        }
        fs.push(...chainParts(pts, radii));
        for (let b = 0; b < 2; b++) { // rootlets dangling off
          const i = 1 + Math.floor(hash2(k, b, 7) * (n - 1)), p = pts[i];
          fs.push(...chainParts([p, [p[0] + 0.08, p[1] - 0.14, p[2] + 0.06], [p[0] + 0.1, p[1] - 0.26, p[2] + 0.04]], [radii[i] * 0.5, radii[i] * 0.3, 0.008]));
        }
      }
      addSculpt(kit, fs.map((f) => ({ f: noisy(f, 0.008, 16, 4), m: 'bark' })), [-0.1, -0.25, -0.35], [L + 0.12, 0.9, 0.35], 0.03, { bark: M.bark(c) }, {}, { jitter: 0.15, k: 0.03 });
      return kit.build();
    });
  },

  vines(o) {
    const c = o.color || '#3a7a3a';
    const L = (o.length || 18) * 0.05;
    const glowc = o.glow;
    return cached('vines' + c + L.toFixed(2) + (glowc || ''), () => {
      const kit = new Kit();
      const leaf = extrude(shape([[0, 0], [0.03, 0.025], [0.06, 0], [0.03, -0.012]]), 0.004, 0);
      for (let k = 0; k < 5; k++) {
        const x0 = -0.25 + k * 0.12, len = L * (0.5 + hash2(k, 1, 6) * 0.5);
        const pts = [];
        for (let i = 0; i <= 6; i++) pts.push([x0 + Math.sin(i * 0.9 + k) * 0.04, -(i / 6) * len, Math.sin(i * 1.3 + k) * 0.02]);
        kit.add(tube(pts, 0.008, 10, 3), M.cloth(c), { uv: 'box' });
        for (let i = 1; i < 6; i++) kit.add(leaf, M.cloth(i % 2 ? brighten(c) : c), { pos: [pts[i][0], pts[i][1], pts[i][2]], rot: [0, (hash2(k, i, 4) - 0.5) * 2, (i % 2 ? 1 : -1) * 0.8] });
        if (glowc) kit.add(rockGeo(0.018, 0.022, 0.018, k + 5, 8, 0.1), glowMat(glowc, 2.6), { pos: [pts[6][0], pts[6][1] - 0.02, pts[6][2]], uv: 'raw' });
      }
      return kit.build({ shadow: false });
    });
  },

  mole(o) {
    // the wandering merchant: a plump mole in a waistcoat, spectacles and floppy hat, hauling an enormous pack
    const grp = new THREE.Group();
    const body = cached('mole', () => {
      const kit = new Kit();
      const torso = union(0.09, ellipsoid([0, 0.35, 0.02], [0.29, 0.32, 0.26]), ellipsoid([0, 0.18, 0.03], [0.3, 0.17, 0.27]));
      const fur = [torso, ellipsoid([0, 0.75, 0.08], [0.19, 0.18, 0.19]), sphere([0, 0.12, -0.26], 0.05)];
      const parts = [], fine = [];
      for (const sx of [-1, 1]) {
        fur.push(chain([[sx * 0.22, 0.56, 0.05], [sx * 0.32, 0.42, 0.12], [sx * 0.33, 0.29, 0.2]], [0.08, 0.062, 0.052], 0.03));
        parts.push({ f: ellipsoid([sx * 0.335, 0.25, 0.24], [0.072, 0.048, 0.07]), m: 'pink' });
        parts.push({ f: ellipsoid([sx * 0.14, 0.035, 0.16], [0.09, 0.048, 0.13]), m: 'pink' });
        fine.push({ f: ellipsoid([sx * 0.15, 0.885, 0.07], [0.042, 0.036, 0.022]), m: 'pink' });
        for (let k = -1; k <= 1; k++) fine.push({ f: capsule([sx * 0.335 + k * 0.03, 0.235, 0.285], [sx * 0.335 + k * 0.036, 0.205, 0.34], 0.013, 0.004), m: 'claw' });
        fine.push({ f: sphere([sx * 0.075, 0.8, 0.25], 0.02), m: 'eye' });
      }
      parts.push({ f: noisy(union(0.08, ...fur), 0.01, 22, 2), m: 'fur' });
      parts.push({ f: capsule([0, 0.735, 0.22], [0, 0.7, 0.41], 0.075, 0.045), m: 'pink' });
      fine.push({ f: sphere([0, 0.705, 0.44], 0.042), m: 'nose' });
      parts.push({ f: ellipsoid([0, 0.31, 0.15], [0.19, 0.21, 0.14]), m: 'belly' });
      // waistcoat: a raised shell over the torso with a V-shaped opening at the front
      parts.push({ f: keep((x, y, z) => { let d = Math.max(torso(x, y, z) - 0.022, y - 0.61, 0.25 - y); if (z > 0) d = Math.max(d, 0.04 + (y - 0.25) * 0.28 - Math.abs(x)); return d; }, torso, 0.025), m: 'vest' });
      for (const y of [0.33, 0.42, 0.51]) { const x = 0.04 + (y - 0.25) * 0.28 + 0.024; const z = 0.02 + 0.26 * Math.sqrt(Math.max(0, 1 - (x / 0.29) ** 2 - ((y - 0.35) / 0.32) ** 2)) + 0.018; fine.push({ f: sphere([-x, y, z], 0.017), m: 'gold' }); }
      // the enormous pack, belted, with a bedroll on top and straps over the shoulders
      parts.push({ f: noisy(sbox([0, 0.7, -0.37], [0.3, 0.42, 0.15], 0.09), 0.015, 9, 5), m: 'pack' });
      for (const y of [0.42, 0.66, 0.9]) parts.push({ f: sbox([0, y, -0.37], [0.315, 0.03, 0.165], 0.014), m: 'strap' });
      for (const sx of [-1, 1]) parts.push({ f: chain([[sx * 0.15, 0.66, -0.22], [sx * 0.16, 0.67, 0.08], [sx * 0.18, 0.44, 0.26]], [0.03, 0.03, 0.028], 0.01), m: 'strap' });
      parts.push({ f: capsule([-0.33, 1.2, -0.35], [0.33, 1.2, -0.35], 0.1), m: 'roll' });
      for (const sx of [-0.19, 0.19]) parts.push({ f: sbox([sx, 1.2, -0.35], [0.024, 0.114, 0.114], 0.016), m: 'strap' });
      const moleMats = {
        fur: M.fur('#5e4c4c'), pink: M.leather('#f0a0ac'), claw: flatMat('#f4ecd8'), eye: flatMat('#140c10'), nose: flatMat('#ff5a7a'),
        belly: M.leather('#d8b49a'), vest: M.cloth('#4a7a3a'), gold: flatMat(GOLD), pack: M.leather('#7a5230'), strap: M.leather('#4a2e1a'), roll: M.quilt('#9a3a3a'),
      };
      const rawUV = { per: { claw: { uv: 'raw' }, eye: { uv: 'raw' }, nose: { uv: 'raw' }, gold: { uv: 'raw' } } };
      addSculpt(kit, parts, [-0.47, -0.01, -0.55], [0.47, 1.32, 0.5], 0.04, moleMats, rawUV, { k: 0.014, jitter: 0.14 });
      addSculpt(kit, fine, [-0.4, 0.18, 0.12], [0.4, 0.93, 0.5], 0.012, moleMats, rawUV, { k: 0.004, jitter: 0.08 });
      for (const sx of [-1, 1]) {
        kit.add(new THREE.TorusGeometry(0.042, 0.007, 4, 10), flatMat(GOLD), { pos: [sx * 0.076, 0.805, 0.272], uv: 'keep' });
        kit.add(new THREE.CircleGeometry(0.038, 10), glowMat('#e8fbff', 0.6, { transparent: true, opacity: 0.35 }), { pos: [sx * 0.076, 0.805, 0.274], uv: 'raw' });
      }
      kit.add(chamferBox(0.06, 0.008, 0.008, 0.002), flatMat(GOLD), { pos: [0, 0.81, 0.272] });
      // floppy felt hat with red band and feather
      const hat = { pos: [0, 0, 0.06], rot: [0.12, 0, 0.05] };
      kit.add(wobble(lathe([[0.001, 0.94], [0.3, 0.93], [0.33, 0.9], [0.31, 0.945], [0.001, 0.97]], 12), 0.012, 3), texMat(TEX.cloth(), '#5a8a44'), { ...hat, uv: 'box' });
      kit.add(wobble(lathe([[0.155, 0.95], [0.16, 1.03], [0.14, 1.13], [0.08, 1.18], [0.001, 1.185]], 10), 0.01, 4), texMat(TEX.cloth(), '#6a9a4e'), { ...hat, uv: 'box' });
      kit.add(lathe([[0.158, 0.975], [0.162, 1.02]], 10), flatMat('#c83a3a'), { ...hat, uv: 'raw' });
      kit.add(extrude(shape([[0, 0], [0.04, 0.12], [0.03, 0.26], [0.0, 0.3], [-0.02, 0.16]]), 0.008, 0), M.cloth('#f4ecd8'), { pos: [0.14, 0.98, 0.02], rot: [0, 0.5, -0.5] });
      // kettle + frying pan hanging off the pack, potions in side loops
      kit.add(wobble(lathe([[0.001, 1.3], [0.11, 1.31], [0.12, 1.4], [0.09, 1.44], [0.03, 1.46]], 9), 0.006, 2), M.metal('#c87a46', 0.05), { pos: [-0.12, 0, -0.32], uv: 'box' });
      kit.add(lathe([[0.001, 0], [0.12, 0.0], [0.13, 0.03]], 9), M.metal(IRON_D, 0.2), { pos: [0.4, 0.62, -0.32], rot: [0, 0, Math.PI / 2], uv: 'box' });
      stick(kit, [0.4, 0.62, -0.32], [0.4, 0.62, -0.08], 0.012, M.wood(W_DARK), 4, 1, 3);
      for (const [x, y, c] of [[-0.36, 0.96, '#9ae8ff'], [-0.36, 0.74, '#ffc83a'], [0.37, 0.96, '#c08aff']]) {
        kit.add(lathe([[0.001, 0], [0.04, 0.005], [0.045, 0.05], [0.02, 0.08], [0.018, 0.1]], 7), glowMat(c, 2.2), { pos: [x, y, -0.3], uv: 'raw' });
        kit.add(prism(6, 0.02, 0.025, { taper: 0.8 }), M.wood(W_DARK), { pos: [x, y + 0.1, -0.3] });
      }
      return kit.build();
    });
    grp.add(body);
    const lan = BUILDERS.lantern({ hang: 0.12, intensity: 1.6, distance: 4 });
    lan.position.set(0.48, 1.05, 0.2);
    grp.add(lan);
    grp.userData.update = (dt, t) => { body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.012; body.rotation.z = Math.sin(t * 1.1) * 0.03; };
    return grp;
  },

  miner(o) {
    // a trapped miner: rubble pile with a fallen beam, a helmet lamp and a waving arm
    const grp = new THREE.Group();
    grp.add(cached('rubble', () => {
      const kit = new Kit();
      for (let i = 0; i < 18; i++) {
        const x = -0.75 + hash2(i, 1, 6) * 1.5, z = -0.45 + hash2(i, 2, 6) * 0.9, s = 0.7 + hash2(i, 3, 6) * 0.9;
        kit.add(rockGeo(0.16 * s, 0.11 * s, 0.14 * s, 170 + i, 12), M.stone(['#9a8a7a', '#8a7c6e', '#a69584'][i % 3]), { pos: [x, hash2(i, 4, 6) * 0.2, z], rot: [0, hash2(i, 5, 6) * 3, 0] });
      }
      kit.add(beam(1.9, 0.15, 0.15, 9, 0.02), M.wood('#6a4428', 11), { pos: [0.05, 0.4, 0.05], rot: [0, -0.3, -0.25] });
      const head = [-0.35, 0.3, 0.55];
      const P = (x, y, z) => [head[0] + x, head[1] + y, head[2] + z];
      addSculpt(kit, [
        { f: ellipsoid(P(0, 0, 0), [0.12, 0.12, 0.115]), m: 'skin' }, { f: sphere(P(0.005, -0.01, 0.12), 0.034), m: 'skin' },
        { f: noisy(ellipsoid(P(0, -0.085, 0.07), [0.12, 0.09, 0.07]), 0.012, 30, 3), m: 'beard' },
        { f: sphere(P(-0.042, 0.03, 0.1), 0.014), m: 'eye' }, { f: sphere(P(0.042, 0.03, 0.1), 0.014), m: 'eye' },
        { f: capsule(P(-0.07, 0.07, 0.095), P(-0.015, 0.06, 0.11), 0.012), m: 'beard' }, { f: capsule(P(0.07, 0.07, 0.095), P(0.015, 0.06, 0.11), 0.012), m: 'beard' },
      ], P(-0.16, -0.2, -0.14), P(0.16, 0.15, 0.2), 0.016, { skin: M.leather('#f0bc94'), beard: M.fur('#8a5a3a'), eye: flatMat('#140c10') }, { per: { eye: { uv: 'raw' } } }, { k: 0.012, jitter: 0.1 });
      const hat = { pos: P(0, 0.03, 0), rot: [0.3, 0, 0.3] };
      kit.add(wobble(lathe([[0.001, 0.07], [0.16, 0.065], [0.175, 0.05], [0.165, 0.04], [0.13, 0.05], [0.13, 0.14], [0.08, 0.19], [0.001, 0.2]], 10), 0.006, 2), M.metal('#c8902a', 0.15), { ...hat, uv: 'box' });
      kit.add(lathe([[0.001, 0], [0.04, 0], [0.045, 0.03], [0.001, 0.035]], 8), M.metal(IRON_D), { pos: P(0.03, 0.17, 0.15), rot: [1.6, 0, 0.3], uv: 'box' });
      kit.add(new THREE.CircleGeometry(0.032, 8), glowMat('#fff0b0', 3), { pos: P(0.035, 0.175, 0.19), rot: [0, 0.25, 0], uv: 'raw' });
      return kit.build();
    }));
    const arm = new THREE.Group();
    arm.add(cached('minerArm', () => {
      const ak = new Kit();
      addSculpt(ak, [
        { f: noisy(capsule([0, 0, 0], [0, 0.26, 0], 0.05, 0.042), 0.006, 30, 2), m: 'sleeve' },
        { f: ellipsoid([0, 0.31, 0], [0.045, 0.05, 0.03]), m: 'skin' },
        { f: capsule([0.03, 0.3, 0], [0.06, 0.36, 0], 0.013, 0.011), m: 'skin' },
      ], [-0.07, -0.06, -0.06], [0.09, 0.38, 0.06], 0.012, { sleeve: M.cloth('#4a6a8a'), skin: M.leather('#f0bc94') }, {}, { k: 0.015 });
      return ak.build();
    }));
    arm.position.set(0.1, 0.5, 0.6);
    grp.add(arm);
    addLight(grp, new THREE.PointLight(0xfff0b0, 0.7, 3, 1.6), [-0.25, 0.75, 1.3]);
    grp.userData.update = (dt, t) => { arm.rotation.z = Math.sin(t * 6) * 0.5 + 0.2; };
    return grp;
  },

  snail(o) {
    // Gravel, the ore-eating rock snail
    const grp = new THREE.Group();
    const body = cached('snail', () => {
      const kit = new Kit();
      const foot = chain([[-0.5, 0.035, 0], [-0.25, 0.055, 0], [0.05, 0.075, 0], [0.3, 0.1, 0]], [0.035, 0.07, 0.09, 0.095], 0.04);
      const skin = union(0.06, keep((x, y, z) => foot(x, y, z * 0.78), foot, 0.06), capsule([0.3, 0.1, 0], [0.43, 0.22, 0], 0.095, 0.1), ellipsoid([0.46, 0.27, 0], [0.11, 0.125, 0.105]));
      const parts = [{ f: floor(noisy(skin, 0.006, 24, 3)), m: 'skin' }];
      const eyes = [];
      for (const sz of [-1, 1]) {
        eyes.push({ f: capsule([0.47, 0.34, sz * 0.04], [0.5, 0.57, sz * 0.1], 0.018, 0.013), m: 'skin' });
        eyes.push({ f: sphere([0.5, 0.6, sz * 0.105], 0.036), m: 'eyeW' });
        eyes.push({ f: sphere([0.53, 0.607, sz * 0.112], 0.017), m: 'eye' });
        eyes.push({ f: ellipsoid([0.54, 0.25, sz * 0.07], [0.014, 0.012, 0.016]), m: 'blush' });
      }
      // spiral shell: a train of shrinking spheres winding inward, with growth ridges
      const SC = [-0.08, 0.37, 0], SR = 0.25, ST = 0.15;
      const disc = ellipsoid(SC, [SR, SR, ST]);
      const groove = [];
      for (let side = -1; side <= 1; side += 2) {
        const pts = [], radii = [];
        for (let th = 0.5; th <= Math.PI * 4.6; th += 0.3) {
          const r = 0.02 + (th / (Math.PI * 4.6)) * (SR - 0.035), a = -th + 1.2;
          const zs = ST * Math.sqrt(Math.max(0, 1 - (r / SR) ** 2));
          pts.push([SC[0] + Math.cos(a) * r, SC[1] + Math.sin(a) * r, SC[2] + side * (zs + 0.004)]);
          radii.push(0.014 + (r / SR) * 0.016);
        }
        groove.push(...chainParts(pts, radii));
      }
      const grooves = union(0.004, ...groove);
      const shellF = noisy(subtract(0.008, disc, grooves), 0.004, 26, 5);
      const snailMats = { skin: M.leather('#a8c880'), eyeW: flatMat('#f4f0e0'), eye: flatMat('#140c10'), blush: flatMat('#ff8aa0'), shell: texMat(TX.shell(), '#d8c0a8'), suture: M.leather('#6a4432') };
      const rawUV = { per: { eyeW: { uv: 'raw' }, eye: { uv: 'raw' }, blush: { uv: 'raw' } } };
      addSculpt(kit, parts, [-0.55, -0.02, -0.24], [0.6, 0.72, 0.24], 0.026, snailMats, rawUV, { k: 0.01, jitter: 0.12 });
      addSculpt(kit, eyes, [0.42, 0.22, -0.16], [0.58, 0.66, 0.16], 0.011, snailMats, rawUV, { k: 0.006, jitter: 0.08 });
      addSculpt(kit, [{ f: floor(shellF), m: 'shell' }], [SC[0] - SR - 0.02, 0, -ST - 0.02], [SC[0] + SR + 0.02, SC[1] + SR + 0.02, ST + 0.02], 0.014, snailMats, {},
        { jitter: 0.1, paint: (x, y, z, m) => (grooves(x, y, z) < 0.003 ? 'suture' : m) });
      kit.add(prism(6, 0.04, 0.05, { tip: 0.05 }), glowMat('#b06bff', 2.6), { pos: [-0.12, 0.6, 0.0], uv: 'raw' });
      kit.add(prism(5, 0.025, 0.03, { tip: 0.03, seed: 3 }), glowMat('#6ad8ff', 2.4), { pos: [-0.01, 0.585, 0.04], rot: [0.3, 0, -0.5], uv: 'raw' });
      kit.add(prism(5, 0.02, 0.025, { tip: 0.025, seed: 5 }), glowMat('#b06bff', 2.4), { pos: [-0.22, 0.56, -0.03], rot: [-0.2, 0, 0.6], uv: 'raw' });
      return kit.build();
    });
    grp.add(body);
    grp.userData.update = (dt, t) => { body.scale.x = 1 + Math.sin(t * 2) * 0.03; };
    return grp;
  },

  shrine(o) {
    const col = o.color || '#ff8a3a';
    const grp = new THREE.Group();
    grp.add(cached('shrine' + col, () => {
      const kit = new Kit();
      const st = M.carved('#b0a090'), st2 = M.stone('#a08e7e', 3);
      kit.add(chippedBlock(1.24, 0.18, 0.92, 2, 0.06), st2, { pos: [0, 0.09, 0] });
      kit.add(chippedBlock(0.72, 0.48, 0.48, 3, 0.05), st, { pos: [0, 0.42, 0] });
      kit.add(chippedBlock(1.08, 0.16, 0.6, 4, 0.06), st2, { pos: [0, 0.74, 0] });
      for (const sx of [-1, 1]) for (const y of [0.3, 0.48]) kit.add(chamferBox(0.01, 0.05, 0.3, 0.003), glowMat(col, 2.2), { pos: [sx * 0.362, y, 0], uv: 'raw' });
      kit.add(lathe([[0.001, 0.82], [0.24, 0.83], [0.3, 0.88], [0.28, 0.9], [0.22, 0.86]], 10), st2, { uv: 'box' });
      kit.add(lathe([[0.001, 0.87], [0.22, 0.87]], 10), glowTexMat(TEX.coals(), '#ffffff', 2.4), { uv: 'box', ppm: 96 });
      for (const sx of [-1, 1]) {
        kit.add(prism(6, 0.08, 1.05, { taper: 0.85, jitter: 0.1, seed: sx + 5 }), st2, { pos: [sx * 0.56, 0.18, -0.36] });
        kit.add(chippedBlock(0.22, 0.1, 0.22, 6 + sx, 0.04), st, { pos: [sx * 0.56, 1.25, -0.36] });
      }
      return kit.build();
    }));
    const f = makeFlame(0.7, col === '#ff8a3a' ? 'fire' : 'blue');
    f.position.y = 0.92;
    grp.add(f);
    const L = addLight(grp, new FlickerLight(new THREE.Color(col), 3, 6, { amount: 0.25 }), [0, 1.3, 0.3]);
    grp.userData.update = (dt, t) => { f.userData.flame(t); L.tick(t); f.position.y = 0.95 + Math.sin(t * 2) * 0.04; };
    grp.userData.emit = (P, dt) => { if (rnd.chance(dt * 10)) P.add.emit({ pos: worldOf(grp, 0, 1.0, 0), posSpread: 0.25, vel: [0, 0.4, 0], spread: 0.15, life: [0.8, 1.6], size: 1, color: [col, '#fff0c0'], glow: 3, swirl: 2 }); };
    return grp;
  },

  goldpile() {
    return cached('goldpile', () => {
      const kit = new Kit();
      const lumps = [ellipsoid([0, 0, 0], [0.28, 0.17, 0.23])];
      for (let i = 0; i < 14; i++) { const a = hash2(i, 1, 4) * Math.PI * 2, r = hash2(i, 2, 4) * 0.2; lumps.push(sphere([Math.cos(a) * r, 0.17 * Math.sqrt(Math.max(0, 1 - (r / 0.26) ** 2)) - 0.01, Math.sin(a) * r * 0.85], 0.035)); }
      addSculpt(kit, [{ f: floor(noisy(union(0.015, ...lumps), 0.006, 40, 3)), m: 'gold' }], [-0.32, -0.01, -0.27], [0.32, 0.22, 0.27], 0.022, { gold: M.gold() }, { ppm: 96 }, { jitter: 0.1 });
      for (let i = 0; i < 9; i++) {
        const a = hash2(i, 1, 3) * Math.PI * 2, r = 0.22 + hash2(i, 2, 3) * 0.12;
        kit.add(lathe([[0.001, 0], [0.032, 0], [0.032, 0.008], [0.001, 0.008]], 8), flatMat(i % 2 ? GOLD : '#f4cc5a'), { pos: [Math.cos(a) * r, 0.005 + hash2(i, 4, 3) * 0.02, Math.sin(a) * r], rot: [hash2(i, 5, 3) * 0.5, 0, hash2(i, 6, 3) * 0.5], uv: 'raw' });
      }
      for (const [x, z, c] of [[0.08, 0.05, '#ff4a6a'], [-0.1, -0.02, '#4a9aff'], [0.02, -0.1, '#5af07a']]) kit.add(prism(6, 0.025, 0.02, { tip: 0.02, seed: Math.round(x * 100) }), glowMat(c, 2.2), { pos: [x, 0.14, z], uv: 'raw' });
      return kit.build();
    });
  },

  log(o) {
    const len = o.length || 0.9, r = o.radius || 0.13;
    return cached('log' + len + r, () => {
      const kit = new Kit();
      addLog(kit, len, r, { pos: [0, r * 0.95, 0], seed: 5 });
      kit.add(rockGeo(0.12, 0.025, 0.08, 4, 8, 0.5), M.cloth('#5a7a3a'), { pos: [0.1, r * 1.85, 0.02] });
      return kit.build();
    });
  },
};

// ------------------------------------------------------------------ materials for crystals & liquid surfaces
const crystalCache = new Map();
function crystalMat(col) {
  let m = crystalCache.get(col);
  if (!m) {
    m = texMat(TEX.facets(), col, { emissive: col, emissiveIntensity: 0.55 });
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
  vec2 p = floor(vW.xz * 32.0) / 32.0 * scale;
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

