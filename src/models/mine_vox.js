// The mining spot as a real voxel diorama (0.04 voxels, same grain as the characters and stages),
// seen through an oblique "3/4" orthographic camera: front faces land on the screen exactly like a
// 2D painting (so the rock face lines up with its hit-testing grid), while every top face shows as a
// lit lip, so the room reads as a hand-placed pixel diorama that is fully 3D underneath.
//   • buildChamber(region): the workshop around the face (rock wall, strata, timbers, lanterns,
//     scaffold, pipes, shelves, rails…), light baked into vertex colours in the Eastward pastels.
//   • RockFace: 49 sculpted stones (strata, veins, crystals, fossils, moss, glints) that lose cubes
//     when struck and burst into tumbling debris; ore pokes out as voxel crystals and nuggets.
//   • prop builders for the things you touch (anvil, tool crate, minecart, slate, note).
//   • Debris: instanced voxel cubes that bounce and pile up on the floor.
import * as THREE from 'three';
import { S, VWorld, C, glowC, mixC, ramp, bayer, box, ell, cyl, cylZ, seg, sag, h3, GLOW, NOAO } from './stage_vox_kit.js';
import * as PR from './stage_vox_props.js';
import { buildOreModel } from './ore_voxel.js';
import { voxSprite } from '../gfx/voxsprite.js';
import { STRATA } from '../art/mine_kit.js';
import { MATERIALS } from '../data/materials.js';
import { hexToRgb, mixHex, fbm2, clamp } from '../core/math.js';

// ------------------------------------------------------------------ oblique projection
export const OBL = 0.5;            // screen rise per unit of depth: the "3/4" look
export const FLOOR_W = -2.0;       // world y of the floor top
const FY = Math.round(FLOOR_W / S); // first empty voxel row above the floor
const PPU = 100;                   // virtual px per world unit (4 px per voxel)
export const toScreen = (x, y, z = 0) => ({ x: 480 + x * PPU, y: 270 - (y - OBL * z) * PPU });
export const toWorld = (sx, sy, z = 0) => ({ x: (sx - 480) / PPU, y: (270 - sy) / PPU + OBL * z, z });
const U = (sx) => Math.round((sx - 480) / 4);
/** Voxel row whose front face (voxel depth index zi) covers screen y sy. */
const Vy = (sy, zi = 0) => Math.floor((270 - sy) / 4 + OBL * (zi + 1));

/** Orthographic camera with the oblique shear; the renderer keeps it fitted to 960×540. */
export function mineCamera() {
  const cam = new THREE.OrthographicCamera(-4.8, 4.8, 2.7, -2.7, 0.1, 60);
  cam.userData.viewHeight = 5.4;
  cam.position.set(0, 0, 20);
  cam.lookAt(0, 0, 0);
  // camera space: y' = y - OBL·z_world = y_c - OBL·z_c - 20·OBL
  const shear = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, -OBL, -20 * OBL, 0, 0, 1, 0, 0, 0, 0, 1);
  const base = THREE.OrthographicCamera.prototype.updateProjectionMatrix;
  cam.updateProjectionMatrix = function () { base.call(this); this.projectionMatrix.multiply(shear); this.projectionMatrixInverse.copy(this.projectionMatrix).invert(); };
  cam.updateProjectionMatrix();
  return cam;
}
/** Screen-space bounding box of an object (for hit-testing the props). */
export function screenRect(obj, pad = 0) {
  obj.updateWorldMatrix(true, true);
  const b = new THREE.Box3().setFromObject(obj);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const p = toScreen(x, y, z);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x: Math.round(x0 - pad), y: Math.round(y0 - pad), w: Math.round(x1 - x0 + pad * 2), h: Math.round(y1 - y0 + pad * 2) };
}

// ------------------------------------------------------------------ palettes
const ACCENT = ['#ff9ab0', '#7ad8c8', '#ffd27a', '#b89aff', '#ff8a6a', '#c8a0ff'];
const STYLE = [
  { amb: '#9282c0', dirt: ['#3a2a3a', '#584048', '#7a5a58', '#9c7866', '#c09a7e'], moss: ['#3e6448', '#5a8a52', '#8ab866', '#c0dc84'], lamp: '#ffbe70' },
  { amb: '#8a8ad0', dirt: ['#2a2848', '#403c66', '#5a5488', '#7a72a8', '#a49ccc'], moss: ['#3a6a8a', '#5a9ac0', '#8ad0e8', '#c4f0ff'], lamp: '#b8ecff' },
  { amb: '#78a0b0', dirt: ['#1e2c28', '#2e443a', '#46604c', '#647e62', '#8ea47c'], moss: ['#2e6a4a', '#4a9a5a', '#8ac86a', '#c8f08a'], lamp: '#c8ffb0' },
  { amb: '#9a88b8', dirt: ['#3e2e28', '#5e4634', '#806446', '#a4845a', '#ccaa78'], moss: ['#4a6a4a', '#6a8a58', '#9aaa6a', '#c8d088'], lamp: '#ffd27a' },
  { amb: '#a07090', dirt: ['#28121a', '#401e24', '#5a2c30', '#7a3c3a', '#a05448'], moss: ['#6a2a2a', '#9a3a2a', '#d0602a', '#ffa04a'], lamp: '#ff9a4a' },
  { amb: '#8070b0', dirt: ['#1c1830', '#2c2648', '#3e3662', '#564c80', '#786ca4'], moss: ['#2a4a4a', '#3a6a5a', '#5aaa7a', '#9ae8b0'], lamp: '#d08aff' },
];
const SHADOW = '#2a1e3e', PEACH = '#ffd9a8', CREAM = '#fff2dc';
const pal5Cache = new Map();
/** Pastel 5-step ramp from a base colour: lavender shadow → base → peach light. */
function pal5(hex) {
  let p = pal5Cache.get(hex);
  if (!p) { p = [mixHex(hex, SHADOW, 0.5), mixHex(hex, SHADOW, 0.24), hex, mixHex(hex, PEACH, 0.3), mixHex(hex, CREAM, 0.55)].map(C); pal5Cache.set(hex, p); }
  return p;
}
const PAL = (arr) => arr.map(C);

// ------------------------------------------------------------------ baked light + mesher
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const lin = (hex, k = 1) => { const [r, g, b] = hexToRgb(hex); return [LIN[r] * k, LIN[g] * k, LIN[b] * k]; };
const rigs = new Map();
/** The room's light: lavender ambient, a sky term on top faces, warm daylight key, lamp pools. */
export function mineRig(region) {
  let R = rigs.get(region);
  if (R) return R;
  const st = STYLE[region] || STYLE[0];
  const kd = [-0.5, 0.62, 0.62], kl = Math.hypot(...kd);
  const lamps = mineLamps(region).map((l) => ({ ...l, c: lin(l.c) }));
  R = { amb: lin(st.amb, 0.78), sky: lin('#e0d8ff', 0.42), key: lin('#ffe4c4', 0.5), keyDir: kd.map((v) => v / kl), lamps, bands: 12 };
  rigs.set(region, R);
  return R;
}
/** Light sources (world): the two face lanterns, the deck lamp, the shelf lamp, daylight. */
export function mineLamps(region) {
  const st = STYLE[region] || STYLE[0];
  const at = (sx, sy, z) => toWorld(sx, sy, z);
  return [
    { ...at(298, 74, 0.3), c: st.lamp, r: 4.4, i: 1.25 },
    { ...at(702, 74, 0.3), c: st.lamp, r: 4.4, i: 1.25 },
    { ...at(150, 262, 0.1), c: '#ffc27a', r: 2.4, i: 0.9 },
    { ...at(884, 292, 0.1), c: '#ffc27a', r: 2.6, i: 1.0 },
    { ...at(96, 6, -0.3), c: '#fff0cc', r: 3.6, i: 0.85 },
  ];
}
function lightAt(R, px, py, pz, nx, ny, nz, out) {
  let r = R.amb[0], g = R.amb[1], b = R.amb[2];
  if (ny > 0) { r += R.sky[0] * ny; g += R.sky[1] * ny; b += R.sky[2] * ny; }
  const kd = Math.max(0, nx * R.keyDir[0] + ny * R.keyDir[1] + nz * R.keyDir[2]);
  r += R.key[0] * kd; g += R.key[1] * kd; b += R.key[2] * kd;
  for (const l of R.lamps) {
    const dx = l.x - px, dy = l.y - py, dz = l.z - pz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= l.r * l.r) continue;
    const d = Math.sqrt(d2) || 1e-3, fall = 1 - d / l.r;
    const k = fall * fall * (0.35 + 0.65 * Math.max(0, (dx * nx + dy * ny + dz * nz) / d)) * l.i;
    r += l.c[0] * k; g += l.c[1] * k; b += l.c[2] * k;
  }
  out[0] = r; out[1] = g; out[2] = b;
}
const AO = [0.5, 0.68, 0.84, 1.0];
const L3 = [0, 0, 0];

/**
 * Mesh a VWorld for the oblique camera: only front (+z) and top (+y) faces can ever be seen, so only
 * those are emitted. Light (rig), ambient occlusion and ordered-dither light bands are baked in.
 * opts: { material, glowK, tint (face multiplier) }
 */
export function meshVox(w, R, opts = {}) {
  const sol = { p: [], n: [], c: [], i: [] }, glo = { p: [], n: [], c: [], i: [] };
  const occ = (x, y, z) => { const v = w.get(x, y, z); return v && !(v & GLOW) ? 1 : 0; };
  const bands = R.bands;
  const emit = (B, pts, nrm, base, light, aos) => {
    const vi = B.p.length / 3;
    for (let k = 0; k < 4; k++) {
      const a = AO[aos[k]];
      B.p.push(pts[k][0] * S, pts[k][1] * S, pts[k][2] * S);
      B.n.push(nrm[0], nrm[1], nrm[2]);
      B.c.push(base[0] * light[0] * a, base[1] * light[1] * a, base[2] * light[2] * a);
    }
    if (aos[0] + aos[2] > aos[1] + aos[3]) B.i.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    else B.i.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
  };
  const quant = (x, y, tint) => {
    const dth = bayer(x, y) - 0.5;
    return [0, 1, 2].map((q) => Math.max(0, Math.floor(L3[q] * tint * bands + 0.5 + dth * 0.5) / bands));
  };
  const ONE = [1, 1, 1];
  for (const [k, ch] of w.chunks) {
    const cz = (k % 4096) - 2048, cy = (Math.floor(k / 4096) % 4096) - 2048, cx = Math.floor(k / 16777216) - 2048;
    const ox = cx * 32, oy = cy * 32, oz = cz * 32;
    for (let lz = 0; lz < 32; lz++) for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
      const v = ch[lx | (ly << 5) | (lz << 10)];
      if (!v) continue;
      const x = ox + lx, y = oy + ly, z = oz + lz;
      const glow = (v & GLOW) !== 0, noao = (v & NOAO) !== 0;
      const base = [LIN[(v >> 16) & 255], LIN[(v >> 8) & 255], LIN[v & 255]];
      const B = glow ? glo : sol;
      // front face
      const fz = lz < 31 ? ch[lx | (ly << 5) | ((lz + 1) << 10)] : w.get(x, y, z + 1);
      if (!fz || ((fz & GLOW) && !glow)) {
        let light = ONE, aos = [3, 3, 3, 3];
        if (!glow) {
          lightAt(R, (x + 0.5) * S, (y + 0.5) * S, (z + 1) * S, 0, 0, 1, L3);
          light = quant(x, y, 0.94);
          if (!noao) aos = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => { const s1 = occ(x + dx, y, z + 1), s2 = occ(x, y + dy, z + 1); return s1 && s2 ? 0 : 3 - (s1 + s2 + occ(x + dx, y + dy, z + 1)); });
        }
        emit(B, [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]], [0, 0, 1], base, light, aos);
      }
      // top face
      const fy = ly < 31 ? ch[lx | ((ly + 1) << 5) | (lz << 10)] : w.get(x, y + 1, z);
      if (!fy || ((fy & GLOW) && !glow)) {
        let light = ONE, aos = [3, 3, 3, 3];
        if (!glow) {
          lightAt(R, (x + 0.5) * S, (y + 1) * S, (z + 0.5) * S, 0, 1, 0, L3);
          light = quant(x, z, 1.04);
          if (!noao) aos = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([dx, dz]) => { const s1 = occ(x + dx, y + 1, z), s2 = occ(x, y + 1, z + dz); return s1 && s2 ? 0 : 3 - (s1 + s2 + occ(x + dx, y + 1, z + dz)); });
        }
        emit(B, [[x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z], [x, y + 1, z]], [0, 1, 0], base, light, aos);
      }
    }
  }
  const group = new THREE.Group();
  const mk = (B, mat, name) => {
    if (!B.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    g.setIndex(B.i);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    group.add(m);
    return m;
  };
  group.userData.solid = mk(sol, opts.material || new THREE.MeshBasicMaterial({ vertexColors: true }), 'vox');
  group.userData.glow = mk(glo, opts.glowMaterial || new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(opts.glowK ?? 1.7, opts.glowK ?? 1.7, opts.glowK ?? 1.7) }), 'vox-glow');
  return group;
}
export function disposeVox(group) {
  group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose && o.material.dispose(); } });
}

// ------------------------------------------------------------------ the chamber
const n3 = h3;
const chamberCache = new Map();
/** Stalactite / beam drip points (screen) for the 2D water drops. */
export const DRIP_POINTS = [[318, 31], [466, 31], [606, 31], [36, 30], [812, 26], [930, 30]];

/** The whole workshop around the rock face, cached per region. */
export function buildChamber(region, BOARD) {
  let w = chamberCache.get(region);
  if (!w) {
    w = new VWorld();
    paintChamber(w, region, BOARD);
    chamberCache.set(region, w);
  }
  return meshVox(w, mineRig(region), { glowK: 1.8 });
}

function paintChamber(w, region, BOARD) {
  const seed = 101 + region * 17;
  const st = STYLE[region] || STYLE[0];
  const S7 = STRATA[region] || STRATA[0];
  const dirt = PAL(st.dirt), moss = PAL(st.moss);
  const accent = ACCENT[region];
  const bx0 = U(BOARD.x) - 1, bx1 = U(BOARD.x + BOARD.w) + 1;
  const by1 = Vy(BOARD.y, -8) + 2, by0 = Vy(BOARD.y + BOARD.h, -8) - 1;

  // ---- back wall: chunky boulders whose colour follows the strata, mortar cracks between them
  const cell = 19;
  const site = (i, j) => [i * cell + n3(i, j, seed, 1) * cell, j * cell * 0.8 + n3(i, j, seed, 2) * cell * 0.8, n3(i, j, seed, 3), n3(i, j, seed, 4)];
  const bandOf = (u, v) => clamp(Math.floor(((74 - v) + (fbm2(u * 0.04, v * 0.05, 2, seed) - 0.5) * 22) / (126 / 7)), 0, 6);
  for (let u = -122; u <= 122; u++) for (let v = FY - 2; v <= 76; v++) {
    if (u >= bx0 && u < bx1 && v >= by0 && v < by1) continue; // the face's own recess (below)
    if (u > U(50) && u < U(142) && v > Vy(44 - Math.abs(u - U(96)) * 2.8 + fbm2(u * 0.3, 1, 2, seed) * 10, -8)) continue; // the daylight crack
    const gi = Math.floor(u / cell), gj = Math.floor(v / (cell * 0.8));
    let d1 = 1e9, d2 = 1e9, s1 = null;
    for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
      const s = site(i, j), d = Math.hypot(u - s[0], (v - s[1]) * 1.15);
      if (d < d1) { d2 = d1; d1 = d; s1 = s; } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1, r = cell * 0.66;
    const bul = clamp(1 - (d1 / r) ** 2, 0, 1);
    const mortar = edge < 1.4;
    const zf = mortar ? -12 : -11 + Math.round(1 + bul * (2.5 + s1[3] * 3));
    const band = clamp(bandOf(u, v) + (s1[2] > 0.78 ? 1 : s1[2] < 0.16 ? -1 : 0), 0, 6);
    const P = pal5(mixHex(S7[band], '#6a5a8a', 0.12));
    const du = (u - s1[0]) / r, dv = (v - s1[1]) / r;
    let val = 0.5 + (-du * 0.3 + dv * 0.5) * 0.42 + (fbm2(u * 0.18, v * 0.18, 2, seed + 5) - 0.5) * 0.3;
    if (edge < 2.6 && dv > 0.1) val += 0.16;            // lit upper lip of each boulder
    if (Math.sin((v + fbm2(u * 0.03, 0, 2, seed) * 14) * 0.9) > 0.93) val += 0.1; // sediment lines
    const col = mortar ? P[0] : ramp(P, val, u, v);
    for (let z = -14; z <= zf; z++) w.set(u, v, z, z === zf ? col : P[1]);
    // moss on boulder tops and damp dark streaks
    if (!mortar && dv > 0.62 && n3(u >> 1, v, 3, seed) > 0.55 && v > FY + 30) w.set(u, v, zf + 1, moss[1 + (u & 1)]);
  }
  // fossils pressed into the wall
  for (let k = 0; k < 14; k++) {
    const u = Math.round(-118 + n3(k, 1, seed, 5) * 236), v = Math.round(FY + 12 + n3(k, 2, seed, 5) * 90);
    if (u > bx0 - 6 && u < bx1 + 6) continue;
    fossilVox(w, u, v, -7, k);
  }

  // ---- the face's recess: deep plum rock with roots and a few crystals, seen through broken stones
  for (let u = bx0; u < bx1; u++) for (let v = by0; v < by1; v++) {
    const n = fbm2(u * 0.15, v * 0.15, 2, seed + 9);
    const P = PAL(['#1a1028', '#2a1a3a', '#3e2a4e', '#5a3e62', '#7a5476']);
    const z = -9 + (n > 0.62 ? 1 : 0);
    for (let zz = -12; zz <= z; zz++) w.set(u, v, zz, ramp(P, 0.3 + n * 0.5 + (n3(u, v, zz, 2) - 0.5) * 0.15, u, v));
  }
  for (let k = 0; k < 9; k++) { // roots snaking down the recess
    let u = bx0 + 3 + Math.round(n3(k, 3, seed, 6) * (bx1 - bx0 - 6)), v = by1 - 1;
    const len = 20 + Math.round(n3(k, 4, seed, 6) * 60);
    for (let q = 0; q < len && v > by0; q++) { w.set(u, v, -8, ramp(PR.WOOD, 0.35 + (q % 3) * 0.08, u, v)); v--; if (n3(q, k, seed, 7) > 0.7) u += n3(q, k, seed, 8) > 0.5 ? 1 : -1; }
  }
  for (let k = 0; k < 6; k++) {
    const u = bx0 + 4 + Math.round(n3(k, 5, seed, 6) * (bx1 - bx0 - 8)), v = by0 + 4 + Math.round(n3(k, 6, seed, 6) * (by1 - by0 - 8));
    for (let q = 0; q < 3; q++) { w.set(u + q - 1, v, -7, glowC(accent)); if (q === 1) w.set(u, v + 1, -7, glowC(mixHex(accent, '#ffffff', 0.5))); }
  }

  // ---- ceiling: a ragged rock lip with stalactites, a daylight crack top-left
  for (let u = -122; u <= 122; u++) {
    const crack = u > U(46) && u < U(146);
    const lip = 8 + fbm2(u * 0.06, 0, 3, seed + 2) * 16 + (crack ? -40 : 0);
    const v0 = Vy(lip, 0);
    for (let v = v0; v <= 80; v++) for (let z = -12; z <= 1; z++) {
      const P = pal5(mixHex(S7[0], '#5a4a7a', 0.25));
      w.set(u, v, z, ramp(P, 0.35 + (fbm2(u * 0.2, v * 0.2, 2, seed + 3) - 0.5) * 0.4 + (v === v0 ? -0.15 : 0), u, v));
    }
  }
  // the sky beyond the crack (glows) and vines spilling through
  for (let u = U(46); u < U(146); u++) for (let v = Vy(14, -13); v <= 80; v++) w.set(u, v, -13, glowC(mixHex('#fff4d8', '#bfe8ff', clamp((v - 60) / 20, 0, 1))));
  for (let k = 0; k < 7; k++) PR.vine(w, U(40) + k * 4 + Math.round(n3(k, 1, seed, 9) * 3), Vy(20, 0), 2, 8 + Math.round(n3(k, 2, seed, 9) * 18), [moss[0], moss[1], moss[2]], k + seed, k % 3 === 0 ? '#ffb0c8' : null);
  // stalactites (the drips fall from their tips)
  const rockP = pal5(mixHex(S7[1], '#5a4a7a', 0.2));
  for (const [sx, sy] of [[36, 30], [812, 26], [930, 30], [180, 26], [760, 22]]) {
    const top = Vy(14, 2), tip = Vy(sy, 2);
    PR.stalactite(w, U(sx), top, 2, Math.max(3, top - tip), rockP, sx, null);
  }

  // ---- floor: dusty dirt, pebbles, a plank walkway, puddles, rails
  for (let u = -122; u <= 122; u++) for (let z = -14; z <= 40; z++) {
    const n = fbm2(u * 0.09, z * 0.14, 2, seed + 11);
    const col = ramp(dirt, 0.42 + (n - 0.5) * 0.5 + (n3(u, z, 1, seed) - 0.5) * 0.12, u, z);
    w.set(u, FY - 1, z, col); w.set(u, FY - 2, z, dirt[1]); w.set(u, FY - 3, z, dirt[0]);
    if (n3(u, z, 2, seed) > 0.965) w.set(u, FY, z, ramp(pal5(S7[2 + (u & 3)]), 0.5, u, z)); // pebbles
  }
  const wx0 = U(282), wx1 = U(712);
  for (let u = wx0; u < wx1; u++) for (let z = 0; z < 14; z++) {
    const plank = Math.floor(z / 3.5), seam = z % 3.5 < 0.6 || (u - wx0 + plank * 11) % 37 === 0;
    const P = PR.WOOD_PALE;
    w.set(u, FY, z, seam ? P[0] : ramp(P, 0.48 + n3(u >> 3, plank, 1, seed) * 0.22 + Math.sin(u * 0.5 + plank) * 0.04, u, z));
    if (!seam && (u - wx0 + plank * 11) % 37 === 2 && z % 3 === 1) w.set(u, FY, z, PR.IRON[3]);
  }
  for (const [sx, z, rx, rz] of [[230, 24, 9, 3], [470, 30, 7, 2], [640, 22, 6, 2]]) PR.puddle(w, U(sx), FY - 1, z, rx, rz, '#8ac0d8');
  PR.rails(w, U(716), 126, FY, 30);

  // ---- rubble heap at the foot of the face
  for (let k = 0; k < 40; k++) {
    const u = U(BOARD.x - 10) + n3(k, 1, seed, 12) * (U(BOARD.x + BOARD.w + 10) - U(BOARD.x - 10));
    const r = 1.6 + n3(k, 2, seed, 12) * 3.2, z = -8 + n3(k, 3, seed, 12) * 7;
    const P = pal5(S7[3 + (k % 4)]);
    ell(w, u, FY + r * 0.55 + n3(k, 4, seed, 12) * 3, z, r, r * 0.8, r * 0.9, (px, py, pz, d) => ramp(P, 0.62 - d * 0.35 + (py - FY) * 0.03, px, py));
  }
  for (let u = -122; u <= 122; u += 3) if (n3(u, 5, seed, 13) > 0.6) PR.tuft(w, u, FY, -9 + Math.round(n3(u, 6, seed, 13) * 3), moss, 4, 3, u);

  // ---- timber frame around the face, lanterns on its posts
  const W = PR.WOOD;
  const beam = (x0, y0, z0, x1, y1, z1, horiz, s) => box(w, x0, y0, z0, x1, y1, z1, (px, py, pz) => {
    const along = horiz ? px : py, across = horiz ? py - y0 : px - x0, span = horiz ? y1 - y0 : x1 - x0;
    const grain = Math.sin(along * 0.31 + n3(across, 0, s, 4) * 6) * 0.06 + n3(along >> 2, across, pz, s) * 0.16;
    return ramp(W, 0.4 + grain + (across === span - 1 ? 0.2 : across === 0 ? -0.12 : 0) + (pz === z1 - 1 ? 0.04 : 0), px, py);
  });
  const pL = U(BOARD.x - 26), pR = U(BOARD.x + BOARD.w + 8), topV = Vy(8, 4);
  beam(pL, FY, 1, pL + 5, topV, 6, false, 1);
  beam(pR, FY, 1, pR + 5, topV, 6, false, 2);
  beam(U(BOARD.x - 46), Vy(30, 4), 1, U(BOARD.x + BOARD.w + 50), Vy(8, 4) + 1, 7, true, 3);
  for (const px of [pL, pR]) for (const yy of [FY + 8, topV - 12]) box(w, px - 1, yy, 1, px + 6, yy + 2, 7, (a, b) => ramp(PR.IRON, 0.45 + (b === yy + 1 ? 0.2 : 0), a, b));
  for (const sd of [-1, 1]) { const px = sd < 0 ? pL + 5 : pR; seg(w, px, Vy(30, 4) - 8, 4, px - sd * 10, Vy(30, 4) + 1, 4, 1.2, (a, b) => ramp(W, 0.5 + bayer(a, b) * 0.1, a, b)); }
  for (let k = 0; k < 3; k++) w.set(U(318 + k * 144), Vy(31, 6) - 1, 6, glowC('#bfe8ff')); // wet drops on the beam
  for (const sx of [298, 702]) {
    const yb = Vy(88, 7);
    PR.lantern(w, U(sx), yb, 7, mixHex(st.lamp, '#ffffff', 0.15), Math.max(1, Vy(30, 7) - yb - 8));
  }

  // ---- left: scaffold deck, ladder, crates, lamp, tool rack, sign, posters, bunting
  const deckV = Vy(330, 10);
  for (let u = -122; u <= U(248); u++) for (let z = -10; z <= 10; z++) {
    const plank = Math.floor((u + 200) / 6);
    const P = PR.WOOD;
    w.set(u, deckV, z, (u + 200) % 6 === 0 ? P[0] : ramp(P, 0.5 + n3(plank, z >> 2, 2, seed) * 0.25 + (z === 10 ? 0.15 : 0), u, z));
    w.set(u, deckV - 1, z, P[1]);
  }
  for (const sx of [12, 120, 232]) beam(U(sx), FY, 6, U(sx) + 4, deckV - 1, 10, false, sx);
  seg(w, U(30), FY + 6, 8, U(112), deckV - 3, 8, 1.1, (a, b) => ramp(W, 0.45 + bayer(a, b) * 0.1, a, b));
  seg(w, U(130), deckV - 3, 8, U(224), FY + 6, 8, 1.1, (a, b) => ramp(W, 0.45 + bayer(a, b) * 0.1, a, b));
  PR.ladder(w, U(196), FY, 13, deckV - FY + 12);
  PR.crate(w, U(34), deckV + 1, -2, 12, 10, 10, { seed: 1, mark: '#c05a4e' });
  PR.crate(w, U(38), deckV + 11, -3, 9, 8, 8, { seed: 2, pale: true });
  PR.crate(w, U(80), deckV + 1, 1, 9, 7, 8, { seed: 3, pale: true, mark: '#4aa494' });
  PR.barrel(w, U(112), deckV + 1, -2, 4, 10, { seed: 4 });
  PR.sack(w, U(232), deckV + 1, 2, 0.8, PR.CLOTH.cream, [glowC(accent), C('#ffd25e'), C('#c8c8d8')]);
  PR.lampPost(w, U(150), deckV + 1, -4, 16, '#ffd08a');
  for (let k = 0; k < 4; k++) { // jars of glowing stuff
    const u = U(178) + k * 4, col = [accent, '#9affd0', '#ffd27a', '#ff9ab0'][k];
    box(w, u, deckV + 1, 4, u + 3, deckV + 5, 7, (a, b) => (b === deckV + 4 ? PR.IRON[2] : (a + b) % 3 === 0 ? glowC(mixHex(col, '#ffffff', 0.4)) : glowC(col)));
  }
  PR.toolRack(w, U(96), Vy(250, -6), -6);
  PR.sign(w, U(170), Vy(118, -5), -5, region === 0 ? 'HOLLOWDEEP' : 'DIG SITE', { paint: '#2e7470', ink: '#fff0c8', hang: 3 });
  PR.poster(w, U(40), Vy(272, -5), -5, 12, 16, 'pick', 1);
  PR.poster(w, U(232), Vy(280, -5), -5, 10, 13, 'skull', 2);
  PR.bunting(w, U(6), Vy(150, -4), -4, U(250), Vy(152, -4), -4, seed);

  // ---- right: pipes, valve, gauge, shelves of jars, a lamp, the exit sign
  const pz = -4;
  PR.pipe(w, [[U(712), Vy(216, pz), pz], [U(790), Vy(216, pz), pz], [U(980), Vy(216, pz), pz]], 1.8, PR.IRON, { valve: true });
  PR.pipe(w, [[U(712), Vy(236, pz), pz], [U(944), Vy(236, pz), pz], [U(944), FY, pz]], 1.4, PR.BRASS);
  const gU = U(846), gV = Vy(256, -2);
  ell(w, gU + 0.5, gV + 0.5, -2, 4.2, 4.2, 1.2, (px, py) => (Math.hypot(px + 0.5 - gU - 0.5, py + 0.5 - gV - 0.5) > 3.2 ? PR.BRASS[2] : C('#fff4d8')));
  for (let k = 0; k < 3; k++) w.set(gU + k, gV + k, 0, C('#c83a3a'));
  for (const sy of [286, 326]) {
    const v = Vy(sy, 0);
    box(w, U(852), v, -6, U(940), v + 2, 2, (a, b) => ramp(PR.WOOD_PALE, 0.5 + (b === v + 1 ? 0.2 : 0) + n3(a >> 3, b, 1, 3) * 0.1, a, b));
    for (const bu of [U(860), U(930)]) seg(w, bu, v - 5, -4, bu, v, 0, 0.6, PR.IRON[2]);
    for (let k = 0; k < 5; k++) {
      const u = U(860) + k * 4 + (sy & 1), h = 3 + ((k * 7 + sy) % 3);
      const col = [accent, '#9ae8ff', '#ffd27a', '#ff9ab0', '#c8a0ff'][(k + sy) % 5];
      box(w, u, v + 2, -3, u + 3, v + 2 + h, 0, (a, b) => (b === v + 1 + h ? C('#e8dcc8') : (a + b) % 4 === 0 ? glowC(mixHex(col, '#ffffff', 0.45)) : glowC(col)));
    }
  }
  PR.lantern(w, U(884), Vy(300, 2), 2, '#ffd08a', 4);
  box(w, U(878), Vy(300, 2) + 12, -4, U(890), Vy(300, 2) + 13, 2, PR.IRON[2]);
  PR.sign(w, U(890), Vy(380, -3), -3, 'EXIT>', { paint: '#c05a4e', ink: '#fff4d8' });
  PR.bunting(w, U(720), Vy(176, -4), -4, U(956), Vy(180, -4), -4, seed + 1);
  PR.crystals(w, U(948), FY, 4, 10, accent, seed, 4);
  PR.crystals(w, U(250), FY, -4, 7, accent, seed + 1, 3);
  if (region === 2) for (const [sx, z] of [[24, 2], [700, -2], [930, 0]]) PR.mushroom(w, U(sx), FY, z, 9, PR.CLOTH.salmon, '#5af0c8', sx);
  else for (const [sx, z] of [[26, 2], [702, -3]]) PR.mushroom(w, U(sx), FY, z, 6, PR.CLOTH.salmon, accent, sx);
}

/** Ammonite spiral in bone colours, raised one voxel. */
function fossilVox(w, u, v, z, s) {
  const B = PR.BONE;
  for (let k = 0; k < 26; k++) {
    const a = k * 0.55, r = 0.6 + k * 0.17;
    w.set(Math.round(u + Math.cos(a) * r), Math.round(v + Math.sin(a) * r), z, B[k % 3 === 0 ? 1 : 2 + (k & 1)]);
  }
}

// ------------------------------------------------------------------ the rock face
const VOID = 0;
/**
 * The 7×7 face of sculpted stones. Each stone is its own small voxel mesh, rebuilt whenever its clue
 * state changes; chips knocked off by strikes are remembered so the stone keeps its scars.
 */
export class RockFace {
  constructor(geom, region, BOARD, parent) {
    this.geom = geom; this.region = region; this.BOARD = BOARD;
    this.rig = mineRig(region);
    this.group = new THREE.Group();
    parent.add(this.group);
    this.stones = new Map(); // 'x,y' → { key, group, w, chips:Set, ore }
  }
  center(x, y) { const c = this.geom.cells[y][x]; return { x: this.BOARD.x + c.cx, y: this.BOARD.y + c.cy }; }
  /** Rebuild stones whose look changed. flagsOf(tile) → { exposed, flare } */
  sync(tiles, flagsOf) {
    for (const row of tiles) for (const t of row) {
      const id = t.x + ',' + t.y;
      let s = this.stones.get(id);
      if (t.broken) { if (s) { this.drop(s); this.stones.delete(id); } continue; }
      const f = flagsOf(t);
      const key = [t.t, t.mat, t.hits, t.crack, JSON.stringify(t.veins || {}), t.glint, t.revealed ? 1 : 0, t.marked ? 1 : 0, f.exposed ? 1 : 0, f.flare ? 1 : 0, s ? s.chips.size : 0].join('|');
      if (s && s.key === key) continue;
      const chips = s ? s.chips : new Set();
      if (s) this.drop(s);
      s = this.build(t, f, chips);
      s.key = key;
      this.stones.set(id, s);
    }
  }
  drop(s) { this.group.remove(s.group); disposeVox(s.mesh); if (s.ore) s.ore.traverse((o) => o.isMesh && o.geometry.dispose()); }
  /** Material tint for dim / hover / flash, and a little shake offset. */
  look(x, y, mul, dx = 0) {
    const s = this.stones.get(x + ',' + y);
    if (!s) return;
    const sol = s.mesh.userData.solid;
    if (sol) sol.material.color.setRGB(mul[0], mul[1], mul[2]);
    s.group.position.x = dx * S * 0.5;
  }
  build(t, f, chips) {
    const c = this.geom.cells[t.y][t.x], B = this.BOARD, seed = this.geom.seed * 7 + t.x * 31 + t.y * 17;
    const S7 = STRATA[this.region] || STRATA[0];
    const w = new VWorld();
    const u0 = Math.floor((B.x + c.bx - 480) / 4) - 1, u1 = Math.ceil((B.x + c.bx + c.bw - 480) / 4) + 1;
    const v0 = Math.floor((270 - (B.y + c.by + c.bh)) / 4) - 1, v1 = Math.ceil((270 - (B.y + c.by)) / 4) + 1;
    const hard = t.t === 'hard';
    const isOre = t.t === 'ore' && MATERIALS[t.mat];
    const showOre = isOre && (t.revealed || f.exposed);
    const lu = (u) => 480 + u * 4 + 2 - B.x - c.bx, lv = (v) => 270 - v * 4 - 2 - B.y - c.by;
    const distAt = (u, v) => { const lx = Math.floor(lu(u)), ly = Math.floor(lv(v)); return lx < 0 || ly < 0 || lx >= c.bw || ly >= c.bh ? -1 : c.dist[ly * c.bw + lx]; };
    const nrmAt = (u, v) => { const lx = Math.floor(lu(u)), ly = Math.floor(lv(v)); const k = ly * c.bw + lx; return [c.nx[k] || 0, c.ny[k] || 0]; };
    const front = new Map(); // 'u,v' → front z
    const cu = (B.x + c.cx - 480) / 4, cv = (270 - B.y - c.cy) / 4;
    const bandHex = (v) => { const gy = 270 - v * 4 - B.y; const k = clamp(Math.floor(((gy + (fbm2(cu * 0.1, gy * 0.02, 2, this.geom.seed) - 0.5) * 30) / B.h) * 7), 0, 6); return S7[k]; };
    const baseHex = hard ? mixHex(bandHex(Math.round(cv)), '#7a8ab8', 0.45) : null;
    for (let u = u0; u < u1; u++) for (let v = v0; v < v1; v++) {
      const d = distAt(u, v);
      if (d < 2.1) continue;
      // bevelled pillow: the core sits proud, two rings step back toward the edge
      let zf = d > 8 ? -1 : d > 4.6 ? -2 : -3;
      let bf = c.facets[0], bd = 1e9;
      const gx = lu(u) + c.bx, gy = lv(v) + c.by;
      for (const fc of c.facets) { const e = (gx - fc.x) ** 2 + (gy - fc.y) ** 2; if (e < bd) { bd = e; bf = fc; } }
      if (zf === -1 && (bf.tx * -0.6 + bf.ty * -0.8) > 0.12) zf = 0; // facets tilted to the light bulge out
      const P = pal5(baseHex || bandHex(v));
      const [nx, ny] = nrmAt(u, v);
      let val = 0.5 + (bf.tx * -0.6 + bf.ty * -0.8) * 0.5 + (fbm2(u * 0.3, v * 0.3, 2, seed) - 0.5) * 0.24 + (n3(u, v, 1, seed) - 0.5) * 0.08;
      if (d < 8 && (nx * -0.55 + ny * -0.83) > 0.3) val += 0.24; // lamp-facing rim
      if (d < 6 && ny > 0.5) val -= 0.22;
      for (let z = -6; z <= zf; z++) {
        if (chips.has(u + ',' + v + ',' + z)) continue;
        w.set(u, v, z, z === zf ? ramp(P, val, u, v) : ramp(P, 0.25 + (z - zf + 6) * 0.03, u, v));
      }
      front.set(u + ',' + v, zf);
    }
    const fz = (u, v) => { const k = u + ',' + v; if (!front.has(k)) return null; let z = front.get(k); while (z >= -6 && chips.has(u + ',' + v + ',' + z)) z--; return z < -6 ? null : z; };
    const paint = (u, v, col, dz = 0) => { const z = fz(u, v); if (z === null) return; w.set(u, v, z + dz, col); };
    const carve = (u, v, col) => { const z = fz(u, v); if (z === null || z <= -5) return; w.set(u, v, z, VOID); w.set(u, v, z - 1, col); };
    const rnd = (k) => n3(k, t.x, t.y, this.geom.seed + 77);
    const icu = Math.round(cu), icv = Math.round(cv);
    // hard rock: pale quartz seams running top to bottom
    if (hard) for (let q = 0; q < 2; q++) {
      let u = icu - 4 + Math.round(rnd(q) * 8);
      for (let v = v1; v >= v0; v--) { paint(u, v, n3(u, v, q, seed) > 0.5 ? C('#eef0ff') : C('#c8d0f0')); if (rnd(v + q * 50) > 0.7) u += rnd(v + 9) > 0.5 ? 1 : -1; }
    }
    // hits on hard rock: a dark split across the stone
    if (t.hits) { let v = icv + Math.round((rnd(5) - 0.5) * 4); for (let u = u0; u < u1; u++) { carve(u, v, C('#1c1028')); if (rnd(u + 20) > 0.65) v += rnd(u + 40) > 0.5 ? 1 : -1; } }
    // red hairline cracks: a hazard is next door
    if (t.crack) for (let q = 0; q < 2; q++) {
      let u = icu - 3 + Math.round(rnd(q + 3) * 6), v = icv + 4;
      for (let k = 0; k < 9; k++) { carve(u, v, k % 3 === 1 ? glowC('#ff5a4a') : C('#8a1e2e')); v--; u += rnd(k * 3 + q) > 0.55 ? 1 : rnd(k * 5 + q) > 0.5 ? -1 : 0; }
    }
    if ((t.revealed || f.flare) && t.t === 'hazard') for (let k = 0; k < 9; k++) paint(icu - 4 + k, icv + (k % 2 ? 1 : -1), glowC('#ff5a5a'), 1);
    // mineral veins toward hidden ore: beaded, raised, in the ore's colour
    for (const [dir, col] of Object.entries(t.veins || {})) {
      const P = pal5(col);
      const [tu, tv] = dir === 'up' ? [icu, v1] : dir === 'down' ? [icu, v0] : dir === 'left' ? [u0, icv] : [u1, icv];
      let u = icu + Math.round((rnd(1) - 0.5) * 3), v = icv + Math.round((rnd(2) - 0.5) * 3);
      for (let i = 0; i < 30; i++) {
        const du = Math.sign(tu - u), dv = Math.sign(tv - v);
        if (Math.abs(tu - u) + Math.abs(tv - v) < 2) break;
        if (Math.abs(tu - u) > Math.abs(tv - v) || rnd(i + 60) > 0.75) u += du || (rnd(i) > 0.5 ? 1 : -1); else v += dv;
        paint(u, v, i % 4 === 0 ? glowC(mixHex(col, '#ffffff', 0.35)) : P[3], 1);
      }
    }
    // ore: a chipped socket with the voxel ore bursting out; hidden ore leaves tinted grains
    let ore = null;
    if (showOre) {
      for (let u = icu - 5; u <= icu + 5; u++) for (let v = icv - 5; v <= icv + 5; v++) {
        const r = Math.hypot(u - cu, (v - cv) * 1.1);
        if (r < 4.2) { const z = fz(u, v); if (z !== null) for (let zz = z; zz > -4; zz--) w.set(u, v, zz, VOID); w.set(u, v, -4, r < 2.5 ? C('#1e1430') : C('#34264a')); }
        else if (r < 5.2) paint(u, v, pal5(bandHex(v))[v > cv ? 4 : 1]);
      }
      ore = oreModel(t.mat, f.exposed ? 0.42 : 0.32, 18);
      const p = toWorld(B.x + c.cx, B.y + c.cy + 2, 0.02);
      ore.position.set(p.x, p.y, -0.04);
      ore.rotation.set(0.25, -0.5 + rnd(3) * 0.4, (rnd(4) - 0.5) * 0.5);
    } else if (isOre) {
      const col = C(MATERIALS[t.mat].color);
      for (let k = 0; k < 5; k++) if (rnd(k + 90) > 0.35) paint(icu + Math.round((rnd(k + 91) - 0.5) * 6), icv + Math.round((rnd(k + 92) - 0.5) * 6), col);
    }
    // glints: the face winks where something precious hides
    if (t.glint) for (let k = 0; k < 1 + Math.min(3, t.glint); k++) {
      const u = icu + Math.round((rnd(k + 30) - 0.5) * 8), v = icv + Math.round((rnd(k + 31) - 0.5) * 8);
      const big = t.glint >= 3 && k === 0, col = big ? '#ffd27a' : '#ffffff';
      paint(u, v, glowC(col), 1);
      if (big) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) paint(u + a, v + b, glowC('#fff0c0'), 1);
    }
    // a little life in the stone: fossils, crystal sprigs, moss along the top row, a wet sheen
    if (!showOre && rnd(40) > 0.84) fossilStone(paint, icu + Math.round((rnd(41) - 0.5) * 4), icv + Math.round((rnd(42) - 0.5) * 4), rnd(43));
    if (!showOre && rnd(44) > 0.9) { const ac = ACCENT[(this.region + t.x) % ACCENT.length]; for (let q = 0; q < 3; q++) { const u = icu - 2 + q * 2; for (let h = 0; h < 2 + q % 2; h++) paint(u, v0 + 3 + h, h === 1 + q % 2 ? glowC(ac) : C(mixHex(ac, '#2a1e3e', 0.3)), 1); } }
    if (t.y === 0 || rnd(45) > 0.85) {
      const st = STYLE[this.region] || STYLE[0];
      for (let u = u0; u < u1; u++) {
        let top = null;
        for (let v = v1; v >= v0; v--) if (front.has(u + ',' + v)) { top = v; break; }
        if (top === null || (t.y > 0 && n3(u >> 2, t.y, 1, seed) < 0.5)) continue;
        const z = fz(u, top);
        if (z === null) continue;
        w.set(u, top + 1, z, C(st.moss[1 + (u & 1)]));
        if (n3(u, top, 2, seed) > 0.6) w.set(u, top + 2, z, C(st.moss[3]));
        w.set(u, top, z, C(st.moss[2]));
      }
    }
    if (t.marked) for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; paint(Math.round(cu + Math.cos(a) * 4.6), Math.round(cv + Math.sin(a) * 4.2), glowC('#bfffd2'), 1); }
    const mesh = meshVox(w, this.rig, { glowK: 1.9 });
    const group = new THREE.Group();
    group.add(mesh);
    if (ore) group.add(ore);
    this.group.add(group);
    return { group, mesh, w, chips, ore, front, cu, cv };
  }
  /** Knock n cubes off the stone near screen point (sx, sy); returns them as debris seeds. */
  chip(x, y, sx, sy, n) {
    const s = this.stones.get(x + ',' + y);
    if (!s) return [];
    const iu = (sx - 480) / 4, iv = (270 - sy) / 4;
    const cand = [];
    for (const [k] of s.front) {
      const [u, v] = k.split(',').map(Number);
      const d = Math.hypot(u - iu, v - iv);
      if (d > 3.2) continue;
      for (let z = 1; z >= -6; z--) { const c = s.w.get(u, v, z); if (c) { cand.push({ u, v, z, c, d }); break; } }
    }
    cand.sort((a, b) => a.d - b.d);
    const out = [];
    for (const q of cand.slice(0, n)) { s.chips.add(q.u + ',' + q.v + ',' + q.z); out.push(q); }
    return out;
  }
  /** Every visible voxel of a stone (for the break burst), sampled. */
  voxels(x, y, keep = 0.45) {
    const s = this.stones.get(x + ',' + y);
    if (!s) return [];
    const out = [];
    for (const [k, zf] of s.front) {
      const [u, v] = k.split(',').map(Number);
      for (let z = zf + 1; z >= zf - 2; z--) {
        const c = s.w.get(u, v, z);
        if (c && n3(u, v, z, 5) < (z >= zf ? keep : keep * 0.4)) out.push({ u, v, z, c });
      }
    }
    return out;
  }
}
function fossilStone(paint, u, v, r) {
  const B = PR.BONE;
  for (let k = 0; k < 16; k++) { const a = k * 0.62 + r * 6, rr = 0.5 + k * 0.2; paint(Math.round(u + Math.cos(a) * rr), Math.round(v + Math.sin(a) * rr), B[k % 3 === 0 ? 1 : 2 + (k & 1)], 1); }
}

// ------------------------------------------------------------------ the props you touch
/** Small voxel prop meshed with the room's light. paintFn(w) paints in room voxel coordinates. */
function propMesh(region, paintFn) {
  const w = new VWorld();
  paintFn(w);
  const g = new THREE.Group();
  g.add(meshVox(w, mineRig(region), { glowK: 1.8 }));
  return g;
}
export const PROP_AT = {
  anvil: { sx: 368, z: 8 },
  crate: { sx: 604, z: 6 },
  cart: { sx: 846, z: 30 },
  slate: { sx: 864, sy: 44 },
  note: { sx: 758, sy: 150 },
};
export function anvilProp(region) {
  return propMesh(region, (w) => {
    PR.anvil(w, U(PROP_AT.anvil.sx), FY, PROP_AT.anvil.z);
    // tongs, a hammer and a cooling ingot on the stump
    seg(w, U(PROP_AT.anvil.sx) + 6, FY, PROP_AT.anvil.z + 6, U(PROP_AT.anvil.sx) + 12, FY + 9, PROP_AT.anvil.z + 6, 0.6, PR.IRON[2]);
    box(w, U(PROP_AT.anvil.sx) - 3, FY + 17, PROP_AT.anvil.z - 1, U(PROP_AT.anvil.sx) + 1, FY + 18, PROP_AT.anvil.z + 2, glowC('#ff9a4a'));
  });
}
/** The open tool crate (tools themselves are separate ore-style models). */
export function crateProp(region) {
  return propMesh(region, (w) => {
    const cx = U(PROP_AT.crate.sx), z = PROP_AT.crate.z, x0 = cx - 12, x1 = cx + 12, h = 12;
    const P = PR.WOOD_PALE;
    box(w, x0, FY, z - 6, x1, FY + h, z + 7, (px, py, pz) => {
      const wall = px === x0 || px === x1 - 1 || pz === z - 6 || pz === z + 6 || py === FY;
      if (!wall) return py < FY + h - 4 ? C('#c8a048') : undefined;
      const plank = Math.floor((py - FY) / 4), seam = (py - FY) % 4 === 0 && py !== FY;
      if ((px === x0 || px === x1 - 1) && (pz === z - 6 || pz === z + 6)) return ramp(PR.WOOD, 0.35, px, py);
      return seam ? P[0] : ramp(P, 0.45 + n3(px >> 2, plank, pz, 7) * 0.25, px, py);
    });
    for (let px = x0 + 1; px < x1 - 1; px++) for (let pz = z - 5; pz < z + 6; pz++) if (n3(px, pz, 1, 3) > 0.35) w.set(px, FY + h - 4 + (n3(px, pz, 2, 3) > 0.7 ? 1 : 0), pz, C(n3(px, pz, 3, 3) > 0.5 ? '#f0d078' : '#c8a048'));
    for (const [nx, ny] of [[x0 + 1, FY + 2], [x1 - 2, FY + 2], [x0 + 1, FY + h - 2], [x1 - 2, FY + h - 2]]) w.set(nx, ny, z + 7, PR.IRON[3]);
    for (let k = -2; k <= 2; k++) w.set(cx + k, FY + 6 + (Math.abs(k) === 2 ? 0 : 1), z + 7, C('#c05a4e'));
  });
}
export function cartProp(region) {
  return propMesh(region, (w) => {
    const cx = U(PROP_AT.cart.sx), z = PROP_AT.cart.z, x0 = cx - 16, x1 = cx + 16, y0 = FY + 4, y1 = FY + 19;
    box(w, x0, y0, z - 7, x1, y1, z + 8, (px, py, pz) => {
      const inner = px > x0 && px < x1 - 1 && pz > z - 7 && pz < z + 7 && py > y0 + 1;
      if (inner) return undefined;
      const band = py === y0 + 2 || py === y1 - 2 || px === x0 || px === x1 - 1;
      if (py === y1 - 1) return ramp(PR.IRON, 0.75, px, pz);
      return band ? ramp(PR.IRON, 0.55 + (py === y1 - 2 ? 0.15 : 0), px, py) : ramp(PR.RUST, 0.35 + n3(px, py, pz, 4) * 0.45 + (py - y0) * 0.012, px, py);
    });
    for (const k of [-10, -3, 4, 11]) for (const py of [y0 + 2, y1 - 2]) w.set(cx + k, py, z + 8, PR.IRON[4]);
    for (const wx of [cx - 9, cx + 9]) cylZ(w, wx, FY + 3.5, z + 8, z + 10, 3.6, (px, py, pz, d) => (d < 0.15 ? PR.IRON[4] : d > 0.65 ? PR.IRON[1] : (px + py) % 3 === 0 ? PR.IRON[3] : PR.IRON[2]));
    box(w, x1, y0 + 6, z - 1, x1 + 4, y0 + 8, z + 2, PR.IRON[2]); // tow hitch
  });
}
/** Where ore lands in the cart (world), slot i. */
export function cartSlot(i) {
  const row = Math.floor(i / 5), col = i % 5;
  return { x: (U(PROP_AT.cart.sx) - 11 + col * 5.5 + (row % 2) * 2) * S, y: (FY + 9 + row * 3) * S, z: (PROP_AT.cart.z - 3 + ((i * 3) % 6)) * S };
}
export function slateProp(region, total, left) {
  return propMesh(region, (w) => {
    const x0 = U(PROP_AT.slate.sx - 52), x1 = U(PROP_AT.slate.sx + 52), z = -3;
    const yT = Vy(PROP_AT.slate.sy, z), yB = Vy(PROP_AT.slate.sy + 62, z);
    box(w, x0, yB, z - 1, x1, yT, z + 1, (px, py) => {
      const frame = px < x0 + 2 || px >= x1 - 2 || py < yB + 2 || py >= yT - 2;
      return frame ? ramp(PR.WOOD, 0.45 + n3(px >> 2, py >> 1, 1, 2) * 0.25 + (py >= yT - 1 ? 0.2 : 0), px, py) : ramp(PAL(['#1e2a2e', '#283a3e', '#34484a', '#46605e']), 0.4 + n3(px, py, 3, 4) * 0.25, px, py);
    });
    for (const sx of [x0 + 4, x1 - 5]) for (let k = 0; k < 5; k++) w.set(sx, yT + k, z, k % 2 ? PR.IRON[2] : PR.IRON[3]);
    // chalk tally: bright strokes for swings left, faint smudges for swings spent
    const chalk = C('#f4f0e4'), faint = C('#6a7c7a');
    for (let i = 0; i < total; i++) {
      const g = Math.floor(i / 5), k = i % 5, u = x0 + 4 + g * 12 + k * 2, top = yT - 4;
      const used = i >= left;
      if (k === 4) for (let q = 0; q < 8; q++) w.set(u - 7 + q, top - 1 - q * 0.75 | 0, z + 1, used ? faint : chalk);
      else for (let q = 0; q < 7; q++) w.set(u, top - q, z + 1, used ? faint : chalk);
    }
  });
}
export function noteProp(region) {
  return propMesh(region, (w) => {
    const x0 = U(PROP_AT.note.sx - 24), x1 = U(PROP_AT.note.sx + 24), z = -2;
    const yT = Vy(PROP_AT.note.sy, z), yB = Vy(PROP_AT.note.sy + 40, z);
    box(w, x0, yB, z, x1, yT, z + 1, (px, py) => (px === x1 - 1 && py === yB ? undefined : ramp(PR.CLOTH.cream, 0.62 + n3(px, py, 1, 2) * 0.3 - (py - yB) * -0.01, px, py)));
    for (let r = 0; r < 3; r++) for (let q = 1; q < 9 - (r % 2) * 2; q++) w.set(x0 + 1 + q, yT - 3 - r * 2, z + 1, C('#8a6a4a'));
    w.set(x0 + 6, yT - 1, z + 1, glowC('#ff5a5a'));
  });
}

// ------------------------------------------------------------------ debris: voxel cubes that bounce and pile
const cubeGeo = (() => {
  const g = new THREE.BoxGeometry(S, S, S);
  const n = g.attributes.normal, col = [];
  for (let i = 0; i < n.count; i++) { const ny = n.getY(i), nz = n.getZ(i); const k = ny > 0.5 ? 1.12 : ny < -0.5 ? 0.5 : nz > 0.5 ? 0.92 : 0.7; col.push(k, k, k); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
})();
export class Debris {
  constructor(max = 1600) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(cubeGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.items = [];
    this.pile = new Map();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3();
  }
  /** c: packed colour (voxel value), light: 0..1.4 multiplier baked into the instance colour. */
  spawn(x, y, z, c, vx, vy, vz, light = 1) {
    let it;
    if (this.items.length < this.max) { it = { i: this.items.length }; this.items.push(it); this.mesh.count = this.items.length; }
    else { // recycle the oldest settled cube
      let best = null;
      for (const q of this.items) if (q.rest && (!best || q.born < best.born)) best = q;
      if (!best) return;
      it = best;
      const k = it.key; if (k && this.pile.get(k) > 0) this.pile.set(k, this.pile.get(k) - 1);
    }
    Object.assign(it, { x, y, z, vx, vy, vz, rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 18, wy: (Math.random() - 0.5) * 18, rest: false, born: performance.now(), key: null, s: 1, bounces: 0 });
    const r = LIN[(c >> 16) & 255] * light, g = LIN[(c >> 8) & 255] * light, b = LIN[c & 255] * light;
    this.mesh.instanceColor.setXYZ(it.i, r, g, b);
    this.mesh.instanceColor.needsUpdate = true;
    this.write(it);
  }
  write(it) {
    this.e.set(it.rest ? 0 : it.rx, it.rest ? 0 : it.ry, 0);
    this.q.setFromEuler(this.e);
    this.v.set(it.x, it.y, it.z);
    this.sc.setScalar(it.s);
    this.m4.compose(this.v, this.q, this.sc);
    this.mesh.setMatrixAt(it.i, this.m4);
  }
  update(dt) {
    let dirty = false;
    const floor = FLOOR_W + S * 0.5;
    for (const it of this.items) {
      if (it.rest) continue;
      dirty = true;
      it.vy -= 13 * dt;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      it.rx += it.wx * dt; it.ry += it.wy * dt;
      if (it.z > 1.4) { it.z = 1.4; it.vz *= -0.3; }
      if (it.y < floor && it.vy < 0) {
        if (it.vy < -1.2 && it.bounces < 3) { it.y = floor; it.vy *= -0.34; it.vx *= 0.55; it.vz *= 0.55; it.wx *= 0.5; it.wy *= 0.5; it.bounces++; }
        else {
          // settle onto the pile: snap to the voxel grid and stack
          const iu = Math.round(it.x / S - 0.5), iz = Math.round(it.z / S - 0.5), key = iu + ',' + iz;
          const h = this.pile.get(key) || 0;
          this.pile.set(key, Math.min(h + 1, 6));
          it.key = key; it.rest = true;
          it.x = (iu + 0.5) * S; it.z = (iz + 0.5) * S; it.y = FLOOR_W + (Math.min(h, 5) + 0.5) * S;
        }
      }
      this.write(it);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ voxel renders for 2D bits
/** The ore's voxel model rendered to a sprite (for ore flying to the cart, the reveal fallback). */
export function oreSprite(id, px) {
  return voxSprite('mine-ore|' + id + '|' + px, () => buildOreModel(id, { res: 26, glow: 1.4 }), { w: px, h: px, yaw: -0.55, pitch: 0.38, light: 'warm', pad: 2 });
}
/** A 3D ore model about `size` world units across (cart, tool crate, ore in the stone). */
export function oreModel(id, size, res = 16) { return buildOreModel(id, { res, vs: size / res, glow: 1.5 }); }
export { FY as FLOOR_VOXEL, S as VOXEL };
void sag; void cyl; void mixC; void NOAO;
