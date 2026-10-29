// 2D sprites rendered from voxel models: materials and backpack items (models/ore_voxel.js), forged
// weapons (models/weapons3d.js), map-node medallions and the FORGLITE logo. Everything goes through
// gfx/voxsprite.js, so the flat art is the 3D art seen through a pixel-perfect orthographic camera.
import * as THREE from 'three';
import { makeCanvas } from './pixel.js';
import { hueRamp } from './weapon_art.js';
import { MATERIALS } from '../data/materials.js';
import { SHAPES, cellsSize, rotateCells } from '../data/shapes.js';
import { NODE_TYPES } from '../data/regions.js';
import { icon } from '../ui/icons.js';
import { voxSprite } from '../gfx/voxsprite.js';
import { meshVoxels } from '../gfx/voxel.js';
import { buildOreModel, flatVoxelMaterial } from '../models/ore_voxel.js';
import { buildWeaponMesh } from '../models/weapons3d.js';
import { Sculpt, ramp, tone, lit, metal, spec, glow, cyl, torus, box, cap, sphere, rotB } from '../models/vox_sculpt.js';
import { hash2 } from '../core/math.js';

const cache = new Map();
const memo = (key, fn) => { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; };

// ------------------------------------------------------------------ palette helpers
/** 6 tones dark→light (index 5 is a near-white specular), hue-shifted like hand-picked pixel ramps. */
export function tones(hex) { let t = toneCache.get(hex); if (!t) { t = hueRamp(hex, 6); toneCache.set(hex, t); } return t; }
const toneCache = new Map();

/** Voxels across a material's design span for a sprite of `px` pixels (≈1.6 px per voxel). */
const resFor = (px) => Math.max(10, Math.min(64, Math.round(px * 0.62)));
const FLAT = { flat: true, glow: 1 };

/** Mark cached geometry so the sprite renderer leaves it alive for the 3D scenes that share it. */
function keepGeometry(obj) { obj.traverse((o) => { if (o.geometry) o.geometry.userData.shared = true; }); return obj; }

// ------------------------------------------------------------------ PUBLIC: materials & items
/** A material as a square voxel render (3/4 view, lit from the upper left). */
export function materialSprite(id, size = 32) {
  return voxSprite(`mat|${id}|${size}`, () => buildOreModel(id, { ...FLAT, res: resFor(size) }), { w: size, h: size, yaw: -0.5, pitch: 0.42, pad: size >= 28 ? 2 : 1 });
}

/**
 * A backpack item filling its polyomino footprint (cell px per cell). The model is sculpted to the
 * shape (long things lie along it); rotation turns the model itself, so the light stays upper-left.
 */
export function itemSprite(id, cell = 32, rot = 0) {
  return memo(`item|${id}|${cell}|${rot}`, () => {
    const m = MATERIALS[id];
    const shapeId = (m && m.shape) || 'o1';
    const cells = rotateCells(SHAPES[shapeId] || SHAPES.o1, rot);
    const { w, h } = cellsSize(cells);
    const W = w * cell, H = h * cell;
    const base = cellsSize(SHAPES[shapeId] || SHAPES.o1);
    const pad = Math.max(2, Math.round(cell * 0.07));
    let spr;
    if (shapeId === 'pick') {
      spr = weaponSprite({ bp: 'pickaxe', ids: [id], el: {}, grade: 1 }, Math.min(W, H));
    } else {
      spr = voxSprite(`item|${id}|${cell}|${rot}`, () => {
        const g = new THREE.Group();
        const mdl = buildOreModel(id, { ...FLAT, res: resFor(Math.min(base.w, base.h) * cell), roll: rot });
        mdl.rotation.z = -rot * (Math.PI / 2);
        g.add(mdl);
        return g;
      }, { w: W, h: H, yaw: -0.32, pitch: 0.36, pad });
    }
    // mask to occupied cells (rectangles are untouched)
    const occ = new Set(cells.map(([x, y]) => x + ',' + y));
    if (occ.size === w * h && spr.width === W && spr.height === H) return spr;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(spr, Math.round((W - spr.width) / 2), Math.round((H - spr.height) / 2));
    if (occ.size !== w * h) {
      g.globalCompositeOperation = 'destination-in';
      for (const k of occ) { const [x, y] = k.split(',').map(Number); g.fillRect(x * cell, y * cell, cell, cell); }
      g.globalCompositeOperation = 'source-over';
    }
    return c;
  });
}

// ------------------------------------------------------------------ WEAPONS
/** A forged weapon rendered from its voxel model, blade raised to the upper right. */
export function weaponSprite(w, size = 128) {
  const key = `wpn|${w.bp}|${(w.ids || []).join(',')}|${JSON.stringify(w.el || {})}|${w.grade ?? 1}|${w.recipe || ''}|${size}`;
  return voxSprite(key, () => keepGeometry(buildWeaponMesh(w)), { w: size, h: size, yaw: 0.42, pitch: 0.22, roll: -0.8, pad: size >= 64 ? 3 : 1, outline2: size >= 64 });
}

// ------------------------------------------------------------------ LOGO
// Stamped letter bitmaps, extruded into bevelled gold voxels over a little anvil.
const LETTERS = {
  F: ['#####', '##...', '##...', '####.', '##...', '##...', '##...'],
  O: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  R: ['####.', '##.##', '##.##', '####.', '##.#.', '##.##', '##.##'],
  G: ['.####', '##...', '##...', '##.##', '##..#', '##..#', '.####'],
  L: ['##...', '##...', '##...', '##...', '##...', '##...', '#####'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..'],
  E: ['#####', '##...', '##...', '####.', '##...', '##...', '#####'],
};
/** Signed 2D distance to a bitmap's filled cells (cell units → design units). */
function bitmapField(rows, cell) {
  const on = (i, j) => j >= 0 && j < rows.length && i >= 0 && i < rows[0].length && rows[j][i] === '#';
  return (lx, ly) => {
    const rx = Math.floor(lx), ry = Math.floor(ly), inside = on(rx, ry);
    let d = 3;
    for (let j = ry - 2; j <= ry + 2; j++) for (let i = rx - 2; i <= rx + 2; i++) {
      if (on(i, j) === inside) continue;
      d = Math.min(d, Math.hypot(Math.max(i - lx, 0, lx - (i + 1)), Math.max(j - ly, 0, ly - (j + 1))));
    }
    return (inside ? -d : d) * cell;
  };
}
function logoSculpt() {
  const S = new Sculpt();
  const word = 'FORGLITE', CELL = 2.2, GAP = 1.6, DEPTH = 1.8, BEV = 0.7, JIT = [0, -0.9, 0.5, -0.4, 0.9, 0, -0.9, 0.5];
  const G = ramp('#ffb83a', 9, 1.25), Cu = ramp('#c86bff', 7, 1.3);
  let x0 = 0;
  const spans = [];
  [...word].forEach((ch, li) => {
    const rows = LETTERS[ch], wd = rows[0].length * CELL, top = 7 * CELL + JIT[li];
    spans.push([x0, wd]);
    const d2 = bitmapField(rows, CELL), ox = x0;
    const f = Object.assign((x, y, z) => {
      const d = d2((x - ox) / CELL, (top - y) / CELL), dz = Math.abs(z) - DEPTH;
      return Math.max(d, dz, (d + dz + BEV) * 0.7071); // chamfered extrusion
    }, { bb: [x0 - 1, JIT[li] - 1, -DEPTH - 1, x0 + wd + 1, top + 1, DEPTH + 1] });
    S.add(f, (x, y, z, n, h) => {
      const t = (top - y) / (7 * CELL);
      if (n[2] < 0.35) return tone(G, lit(n) * 0.8 - 0.4, 1, 4, h); // sides
      if (n[2] < 0.9) return lit(n) > 0.2 ? G[8] : G[2]; // bevel catches the light
      if (hash2(Math.floor(x * 1.5), Math.floor(y * 1.5), li) > 0.96) return G[8]; // hot flecks
      return G[Math.min(7, Math.max(2, Math.round(7.4 - t * 5.5)))];
    });
    x0 += wd + GAP;
  });
  // a curse crack burning through R and G
  const [rx0] = spans[2], [gx0, gw] = spans[3];
  S.cut(Object.assign((x, y, z) => { const t = (x - rx0) / (gx0 + gw - rx0); const cy = 11 - t * 8 + Math.sin(x * 2.1) * 1.1; return Math.max(Math.abs(y - cy) - 0.45, x < rx0 + 1 || x > gx0 + gw - 1 ? 1 : -1, -z + 0.6); }, { bb: [rx0, 0, 0, gx0 + gw, 16, 3] }), glow(Cu[4]));
  // anvil + hammer ornament under the word
  const mid = x0 / 2, ay = -6;
  const A = ramp('#6a7080', 7, 1.1);
  S.add(box([mid, ay + 2.4, 0], [5, 1.1, 2.2], 0.4), (x, y, z, n, h) => metal(A, n, h, { bias: 1 }));
  S.add(cap([mid - 5, ay + 2.6, 0], [mid - 8.5, ay + 2.9, 0], 1.0, 0.3), (x, y, z, n, h) => metal(A, n, h, { bias: 1 }));
  S.add(box([mid, ay, 0], [2.4, 1.5, 1.6], 0.3), (x, y, z, n, h) => metal(A, n, h));
  S.add(box([mid, ay - 2, 0], [4.2, 0.8, 2.2], 0.3), (x, y, z, n, h) => metal(A, n, h));
  for (const s of [-1, 1]) S.add(cap([mid + s * 7, ay + 2.6, 0], [mid + s * (x0 / 2 - 3), ay + 2.6, 0], 0.6, 0.25), (x, y, z, n, h) => metal(ramp('#e0b85a', 7, 1.1), n, h, { bias: 1 }));
  S.add(cap([mid + 6, ay - 2.2, 0.5], [mid + 9, ay + 4.5, 0.5], 0.45), ramp('#8a5a33', 7, 1.1)[3]);
  S.add(box([mid + 9.2, ay + 5.1, 0.5], [1.6, 0.8, 0.8], 0.2, rotB(0, 0, 0.42)), (x, y, z, n, h) => metal(A, n, h, { bias: 1 }));
  return S;
}
export function logo(scale = 1) {
  return memo(`logo|${scale}`, () => {
    const W = 236 * scale, H = 70 * scale;
    return voxSprite(`logo|${scale}`, () => {
      const g = logoSculpt().bake(2.4 * scale, { dilate: 0.2 });
      return meshVoxels(g, { size: 0.04, origin: [g.nx / 2, g.ny / 2, g.nz / 2], jitter: 0.01, glowIntensity: 1, material: flatVoxelMaterial() });
    }, { w: W, h: H, yaw: 0.12, pitch: 0.2, pad: 4 * scale, outline2: true });
  });
}

// ------------------------------------------------------------------ MAP NODE MEDALLIONS
// A cast medallion (gold for the boss, violet for elites, iron otherwise) with the node's voxel icon set
// into its face.
function medallion(type) {
  const S = new Sculpt();
  const nt = NODE_TYPES[type] || NODE_TYPES.monster;
  const ring = ramp(type === 'boss' ? '#e0a83a' : type === 'elite' ? '#9a4a9a' : type === 'start' ? '#8a7a6a' : '#7a746c', 7, 1.15);
  const face = ramp(nt.color, 7, 0.9);
  S.add(cyl([0, 0, 0], [0, 0, 1], 12, 1.6, 0.6), (x, y, z, n, h) => (n[2] > 0.6 ? face[Math.hypot(x - 3, y + 3) < 9 ? 1 : 0] : metal(ring, n, h)));
  S.add(torus([0, 0, 1.4], [0, 0, 1], 12, 1.7), (x, y, z, n, h) => (spec(n, 12) > 0.6 ? ring[6] : metal(ring, n, h, { bias: 1 })));
  if (type === 'boss') for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; S.add(cap([Math.cos(a) * 13, Math.sin(a) * 13, 1], [Math.cos(a) * 16.5, Math.sin(a) * 16.5, 1], 1.4, 0.3), (x, y, z, n, h) => metal(ring, n, h, { bias: 1 })); }
  if (type === 'elite') for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; S.add(sphere([Math.cos(a) * 12, Math.sin(a) * 12, 2.6], 1.5), glow(ramp('#ff5af0', 7, 1.2)[4])); }
  return S;
}
export function nodeBadge(type, size = 28) {
  return memo(`badge|${type}|${size}`, () => {
    const base = voxSprite(`badge|${type}|${size}`, () => {
      const g = medallion(type).bake(size / 26, { dilate: 0.2 });
      return meshVoxels(g, { size: 0.04, origin: [g.nx / 2, g.ny / 2, g.nz / 2], jitter: 0.01, glowIntensity: 1, material: flatVoxelMaterial() });
    }, { w: size, h: size, yaw: 0, pitch: 0, pad: 1 });
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0);
    const nt = NODE_TYPES[type] || NODE_TYPES.monster;
    const ic = icon(size < 20 ? nt.icon + ':s' : nt.icon) || icon(nt.icon);
    if (ic) g.drawImage(ic.canvas, Math.round(size / 2 - ic.w / 2), Math.round(size / 2 - ic.h / 2));
    return c;
  });
}

export function clearSpriteCache() { cache.clear(); }
