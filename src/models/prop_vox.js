// Voxel prop kit. Props are painted into a sparse voxel world on the shared 0.04 m grid (the same
// grid as the stages, characters and monsters), greedy-meshed with baked AO and lit in real time
// (Lambert, like the explorers) so they sit in any scene's lighting. Glowing voxels get their own
// unlit mesh that blooms. Coordinates are voxel ints: x/z centred on the prop, y = 0 at its base.
import * as THREE from 'three';
import { VWorld, meshWorld, makeLightRig, C, glowC, mixC, tone, ramp, bayer, box, ell, cyl, cylX, cylZ, seg, sag, h3, NOAO, text } from './stage_vox_kit.js';
import { WOOD, WOOD_PALE, IRON, RUST, BRASS, BONE, CLOTH } from './stage_vox_props.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { noise2 } from '../core/math.js';

export const PV = 0.04;
/** metres → voxels (float / rounded) */
export const u = (m) => m / PV;
export const ui = (m) => Math.round(m / PV);
export { C, glowC, mixC, tone, ramp, bayer, box, ell, cyl, cylX, cylZ, seg, sag, h3, NOAO, text, WOOD, WOOD_PALE, IRON, RUST, BRASS, BONE, CLOTH };

// ------------------------------------------------------------------ palettes (warm pastel, lavender shadows)
const SHADE = C('#1c1428'), LIT = C('#fff4e0');
/** A five-step ramp around one colour: lavender-indigo shadows, cream highlights. */
export function palOf(hex) {
  const c = typeof hex === 'number' ? hex : C(hex);
  return [mixC(c, SHADE, 0.62), mixC(c, SHADE, 0.32), c, mixC(c, LIT, 0.3), mixC(c, LIT, 0.6)];
}
const pal = (a) => a.map(C);
export const STONE = pal(['#3a3040', '#5a4a5a', '#7e6a72', '#a8908e', '#d0b8a8']);
export const SAND = pal(['#4a3a34', '#7a6250', '#a68a6a', '#ccb08a', '#ecd8b0']);
export const GOLD = pal(['#7a4a1a', '#b8862a', '#e8b84a', '#ffd25e', '#fff6c8']);
export const COPPER = pal(['#5a2a20', '#8a4a30', '#c87a46', '#e8a066', '#ffd0a0']);
export const MOSS = pal(['#2a4a3a', '#3e6a48', '#5a9058', '#86b46a', '#c0dc8a']);
export const FUR = pal(['#2a2030', '#46383e', '#665252', '#8a706a', '#b09486']);
export const PINK = pal(['#8a4058', '#c06a7a', '#f09aa6', '#ffc0c4', '#fff0f0']);
export const CHAR = pal(['#140c10', '#2a1a1a', '#3e2a24', '#5a3a2a', '#7a5038']);
export const PAPER = pal(['#8a7660', '#b8a07a', '#e0cc9e', '#f4e6c0', '#fffaea']);

// ------------------------------------------------------------------ meshing & materials
const RIG = makeLightRig({ amb: '#ffffff', ambI: 1, sky: '#000000', skyI: 0, key: '#000000', keyI: 0, bands: 48 });
// near-uniform face shading: real-time light does the directional work, this just keeps undersides grounded
const TINT = { '0,1': 0.93, '0,-1': 0.93, '1,1': 1, '1,-1': 0.72, '2,1': 0.97, '2,-1': 0.97 };
let SOLID = null;
export function solidMat() {
  if (!SOLID) { SOLID = new THREE.MeshLambertMaterial({ vertexColors: true }); SOLID.userData.keep = true; }
  return SOLID;
}
const GLOWS = new Map();
export function glowMat(k = 2.2) {
  let m = GLOWS.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(k, k, k), fog: false, toneMapped: false }); m.userData.keep = true; GLOWS.set(k, m); }
  return m;
}
const MODELS = new Map();
/**
 * Paint (once per key) and mesh a voxel model; returns a fresh Group sharing the cached geometry.
 * o: { shadow (cast, default true), glow (bloom strength), hanging (keep undersides below y=0), fx (FX layer) }
 */
export function voxModel(key, paint, o = {}) {
  let res = MODELS.get(key);
  if (!res) {
    const w = new VWorld();
    paint(w);
    res = meshWorld(w, { light: RIG, skip: new Set(), bottomAbove: o.hanging ? -1e9 : 0, scale: PV, faceTint: TINT });
    for (const g of [res.solid, res.glow]) if (g) g.userData.keep = true;
    MODELS.set(key, res);
  }
  const grp = new THREE.Group();
  if (res.solid) {
    const m = new THREE.Mesh(res.solid, solidMat());
    m.name = 'solid'; m.castShadow = o.shadow !== false; m.receiveShadow = true;
    if (o.fx) m.layers.set(LAYER_FX);
    grp.add(m);
  }
  if (res.glow) {
    const m = new THREE.Mesh(res.glow, glowMat(o.glow ?? 2.2));
    m.name = 'glow';
    if (o.fx) m.layers.set(LAYER_FX);
    grp.add(m);
  }
  return grp;
}

// ------------------------------------------------------------------ painters
/** Faceted boulder: an ellipsoid with seeded planar chips, lit from the upper front-left in flat bands. */
export function rock(w, cx, cy, cz, rx, ry, rz, pl = STONE, seed = 1, o = {}) {
  const cuts = [];
  for (let k = 0; k < (o.cuts ?? 7); k++) {
    const a = h3(k, 1, seed, 3) * Math.PI * 2, b = (h3(k, 2, seed, 3) - 0.35) * 1.6;
    cuts.push([Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b), 0.72 + h3(k, 3, seed, 3) * 0.2]);
  }
  const X0 = Math.floor(cx - rx), X1 = Math.ceil(cx + rx), Y0 = Math.floor(cy - ry), Y1 = Math.ceil(cy + ry), Z0 = Math.floor(cz - rz), Z1 = Math.ceil(cz + rz);
  for (let z = Z0; z <= Z1; z++) for (let y = Math.max(Y0, o.floor ?? -1e9); y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    const d = dx * dx + dy * dy + dz * dz + (h3(x >> 1, y >> 1, z >> 1, seed) - 0.5) * 0.18;
    if (d > 1) continue;
    let cut = -1;
    for (let k = 0; k < cuts.length; k++) { const c = cuts[k]; if (dx * c[0] + dy * c[1] + dz * c[2] > c[3]) { cut = k; break; } }
    if (cut >= 0 && d > 0.45) continue;
    const lit = 0.5 + dy * 0.34 - dx * 0.14 + dz * 0.16;
    let c = tone(pl, 0.22 + Math.round(lit * 4) * 0.12 + (h3(x, y, z, seed) > 0.96 ? 0.1 : 0));
    if (o.moss && dy > 0.35 + h3(x >> 1, 0, z >> 1, seed) * 0.3) c = tone(o.moss, 0.35 + dy * 0.4);
    if (o.tint) c = mixC(c, o.tint, 0.18);
    w.set(x, y, z, c);
  }
}
/** Wood colour with grain along `g`, plank index `p` (alternating tone), occasional knots. */
export function woodC(pl, p, g, seed = 1, base = 0.5) {
  const knot = h3(p, g >> 1, 7, seed) > 0.97;
  return tone(pl, base + (p % 2 ? 0.1 : 0) + (h3(p, g >> 3, 1, seed) - 0.5) * 0.14 + (knot ? -0.22 : 0));
}
/**
 * Box of planks. axis: direction the planks run ('x'|'y'|'z'); across: axis the planks stack along.
 * pw = plank width (voxels). Seams darken, end voxels get nail heads when nails is set.
 */
export function planks(w, x0, y0, z0, x1, y1, z1, o = {}) {
  const pl = o.pal || WOOD, pw = o.pw || 3, seed = o.seed || 1, ax = o.axis || 'x', ac = o.across || 'y';
  const c3 = (x, y, z, a) => (a === 'x' ? x : a === 'y' ? y : z);
  const lo = c3(x0, y0, z0, ac), lo2 = c3(x0, y0, z0, ax), hi2 = c3(x1, y1, z1, ax);
  box(w, x0, y0, z0, x1, y1, z1, (x, y, z) => {
    const a = c3(x, y, z, ac) - lo, g = c3(x, y, z, ax);
    const p = Math.floor(a / pw);
    if (a % pw === pw - 1 && o.seams !== false) return pl[0];
    if (o.nails && (g === lo2 + 1 || g === hi2 - 2) && a % pw === (pw >> 1)) return IRON[3];
    return woodC(pl, p + (o.pOff || 0), g, seed, o.base ?? 0.5);
  });
}
/** Solid of revolution around a vertical axis: r(t) gives the radius at height fraction t. */
export function lathe(w, cx, cz, y0, y1, rOf, col) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1), r = rOf(t, y);
    if (r <= 0) continue;
    cyl(w, cx, cz, y, y + 1, r, r, typeof col === 'function' ? (px, py, pz, d) => col(px, py, pz, d, t) : col);
  }
}
/** Hollow vessel (pot/urn/bowl): only the shell of thickness th voxels, open above `open` (fraction). */
export function vessel(w, cx, cz, y0, y1, rOf, col, th = 1.4, open = 1) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1), r = rOf(t, y);
    if (r <= 0) continue;
    const rin = t <= 0.02 || t > open ? 0 : Math.max(0, r - th);
    const R = Math.ceil(r) + 1;
    for (let z = Math.floor(cz - R); z <= cz + R; z++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d > r || (rin && d < rin)) continue;
      const c = typeof col === 'function' ? col(x, y, z, d / r, t) : col;
      if (c) w.set(x, y, z, c);
    }
  }
}
/** Torus around an axis ('x'|'y'|'z') — wheels, rings, hoops, spectacles. */
export function torus(w, cx, cy, cz, R, r, axis, col) {
  const E = Math.ceil(R + r) + 1;
  for (let a = -E; a <= E; a++) for (let b = -E; b <= E; b++) for (let c = -Math.ceil(r) - 1; c <= Math.ceil(r) + 1; c++) {
    const q = Math.hypot(a + 0.5, b + 0.5) - R, d = q * q + (c + 0.5) * (c + 0.5);
    if (d > r * r) continue;
    const [x, y, z] = axis === 'y' ? [a, c, b] : axis === 'x' ? [c, a, b] : [a, b, c];
    const v = typeof col === 'function' ? col(Math.floor(cx) + x, Math.floor(cy) + y, Math.floor(cz) + z, Math.atan2(b + 0.5, a + 0.5)) : col;
    if (v) w.set(Math.floor(cx) + x, Math.floor(cy) + y, Math.floor(cz) + z, v);
  }
}
/** Rope through points (1-voxel twisted strand, alternating tones). */
export function rope(w, pts, col = pal(['#8a6a40', '#c8a870'])) {
  for (let i = 0; i + 1 < pts.length; i++) seg(w, ...pts[i], ...pts[i + 1], 0.5, (px, py, pz) => col[(px + py + pz) & 1]);
}
/** Faceted crystal spire from a base point along a direction, glowing core and tip. */
export function spire(w, bx, by, bz, dx, dy, dz, len, r, col, seed = 1) {
  const c = typeof col === 'number' ? col : C(col), hi = mixC(c, LIT, 0.55), lo = mixC(c, SHADE, 0.4);
  const n = Math.max(2, Math.ceil(len));
  for (let i = 0; i <= n; i++) {
    const t = i / n, rr = r * (t < 0.72 ? 1 - t * 0.12 : (1 - t) * 3.1);
    if (rr < 0.35 && i < n) continue;
    const x = bx + dx * len * t, y = by + dy * len * t, z = bz + dz * len * t;
    ell(w, x, y, z, Math.max(0.5, rr), Math.max(0.5, rr), Math.max(0.5, rr), (px, py, pz, d) => {
      if (t > 0.86) return glowC(hi);
      const face = Math.floor(Math.atan2(pz - z, px - x) * 1.6 + seed) & 1;
      if (d < 0.3) return glowC(c);
      return face ? (t > 0.5 ? hi : c) : lo;
    });
  }
}
/** A strap/band of metal around a box face, rivets every 3. */
export function rivets(w, pts, col = IRON[4]) { for (const [x, y, z] of pts) w.set(x, y, z, col); }

// ------------------------------------------------------------------ flames: a voxel flip-book
const FLAME = {
  fire: ['#b83a10', '#ff7a1a', '#ffc040', '#fff4c0'],
  purple: ['#5a1aa8', '#9a4aff', '#d89aff', '#fff0ff'],
  green: ['#0e7a4a', '#2ac88a', '#8affd8', '#f0fff8'],
  blue: ['#1a3ac8', '#3a8aff', '#9ae0ff', '#f0faff'],
};
/** Two crossed 1-voxel sheets (x and z) of flame shape: from every angle you see the hot core. */
function paintFlame(w, H, R, cols, f) {
  const ph = (f / 6) * Math.PI * 2;
  for (const sheet of [0, 1]) for (let y = 0; y < H + 2; y++) {
    const t = y / H;
    const c = Math.sin(ph + t * 3.4 + sheet) * t * R * 0.5;
    const r = R * Math.pow(Math.max(0, 1 - t), 0.7) * (1 + 0.22 * Math.sin(ph * 2 + t * 7 + sheet * 2)) * (t < 0.12 ? 0.75 + t * 2 : 1);
    for (let s = -Math.ceil(R) - 2; s <= Math.ceil(R) + 2; s++) {
      const d = Math.abs(s + 0.5 - c) / Math.max(0.55, r) + (h3(s, y, sheet, f) - 0.5) * 0.4;
      const lick = y >= H && h3(s, y, f, 5) > 0.75 && Math.abs(s - c) < R * 0.4;
      if (d > 1 && !lick) continue;
      const heat = (1 - Math.min(1, d)) * 0.9 + (1 - t) * 0.65;
      const col = cols[lick ? 1 : heat > 1.05 ? 3 : heat > 0.72 ? 2 : heat > 0.38 ? 1 : 0];
      if (sheet) w.set(0, y, s, glowC(col)); else w.set(s, y, 0, glowC(col));
    }
  }
}
/** Animated voxel flame (6 frames); scale 1 ≈ 0.45 m tall. userData.flame(t) advances it. */
export function makeFlame(scale = 1, palette = 'fire') {
  const cols = Array.isArray(palette) ? palette : FLAME[palette] || FLAME.fire;
  const H = Math.max(4, Math.round(11 * scale)), R = Math.max(1.4, 2.7 * scale);
  const g = new THREE.Group();
  const frames = [];
  for (let f = 0; f < 6; f++) { const m = voxModel('flame|' + cols.join() + '|' + H + '|' + f, (w) => paintFlame(w, H, R, cols, f), { shadow: false, glow: 2.4, fx: true }); m.visible = f === 0; g.add(m); frames.push(m); }
  const seed = Math.random() * 10;
  g.userData.flame = (t) => {
    const i = Math.floor(t * 11 + seed) % frames.length;
    for (let k = 0; k < frames.length; k++) frames[k].visible = k === i;
    const n = noise2(t * 6, seed);
    g.scale.set(0.92 + n * 0.16, 0.85 + n * 0.3, 0.92 + n * 0.16);
  };
  return g;
}

// ------------------------------------------------------------------ lights & helpers
export function addLight(grp, light, pos) {
  light.position.set(...pos);
  grp.add(light);
  (grp.userData.lights = grp.userData.lights || []).push(light);
  return light;
}
const wpos = new THREE.Vector3();
export function worldOf(obj, x, y, z) { return obj.localToWorld(wpos.set(x, y, z)).toArray(); }
