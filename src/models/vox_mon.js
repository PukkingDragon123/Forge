// Detailed voxel monsters. The archetypes still author a sculpt (SDF primitives on a bone rig); this module turns
// that sculpt into fine voxels (~1/40 of the creature's height), paints every voxel with a hue-shifted pixel-art
// palette and a per-material 3D pattern (fur tufts, scale rows, chitin bands, cracked stone, rivets, runes, lava
// seams…), and meshes one rigid voxel part per bone with baked AO, bevel highlights and emissive voxels.
//   voxelizeMonster(m, div) → { parts: [{bone, solid, glow, layers}], bbox, samples, cell }
import * as THREE from 'three';
import { hash3, clamp } from '../core/math.js';
import { ADD, SUB, PAINT, BIND, TILE } from './monster_kit.js';

const TN = Object.fromEntries(Object.entries(TILE).map(([k, v]) => [v, k]));

// ============================================================================ colour
const hexRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
function rgb2hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const lerpHue = (a, b, t) => { let d = b - a; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return (a + d * t + 1) % 1; };
/** Hue-shifted ramp: highlights drift warm and bright, shadows drift cool and saturated (pixel-art painting). */
function shadeCol(hsl, s) {
  const d = s - 0.5;
  const h = lerpHue(hsl[0], d > 0 ? 0.13 : 0.7, Math.min(0.4, Math.abs(d) * (d > 0 ? 0.5 : 0.7)));
  const base = hsl[2] < 0.26 ? hsl[2] + (0.26 - hsl[2]) * 0.4 : hsl[2]; // keep dark creatures readable in dim caves
  const l = clamp(base + d * 0.58, 0.04, 0.95);
  const sat = clamp(hsl[1] * 1.22 + (d < 0 ? -d * 0.25 : -d * 0.3) + 0.04, 0, 1);
  return hsl2rgb(h, sat, l);
}
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// ============================================================================ 3D pixel patterns (integer voxel coords)
const H = (x, y, z, k) => hash3(x, y, z, k);
function vn(x, y, z, k) {
  const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
  const fx = x - xf, fy = y - yf, fz = z - zf;
  const a = H(xf, yf, zf, k), b = H(xf + 1, yf, zf, k), c = H(xf, yf + 1, zf, k), d = H(xf + 1, yf + 1, zf, k);
  const e = H(xf, yf, zf + 1, k), f = H(xf + 1, yf, zf + 1, k), g = H(xf, yf + 1, zf + 1, k), h = H(xf + 1, yf + 1, zf + 1, k);
  const p0 = a + (b - a) * fx, p1 = c + (d - c) * fx, p2 = e + (f - e) * fx, p3 = g + (h - g) * fx;
  const q0 = p0 + (p1 - p0) * fy, q1 = p2 + (p3 - p2) * fy;
  return q0 + (q1 - q0) * fz;
}
/** → [shade 0..1 (0.5 = base), accent 0|1, glow mask 0|1] */
function pattern(tile, x, y, z, seed) {
  const h = H(x, y, z, seed);
  const j = (h - 0.5) * 0.045;
  switch (TN[tile]) {
    case 'fur': {
      // soft tufts in clumps, a darker strand every few rows
      const n = vn(x / 3.2, y / 3.2, z / 3.2, seed + 1);
      return [0.5 + (n - 0.5) * 0.34 + ((y + (x >> 2)) % 5 === 0 ? -0.07 : 0) + j, vn(x / 6, y / 6, z / 6, seed) > 0.66 ? 1 : 0, 0];
    }
    case 'feather': return [0.52 + (vn(x / 3, y / 3, z / 3, seed) - 0.5) * 0.2 + (((x + Math.abs(z) + (y >> 1)) % 5) === 0 ? -0.12 : 0) + j, y % 7 === 0 ? 1 : 0, 0];
    case 'scale': { const row = y >> 1, cx = (x + (row & 1)) >> 1; return [(y & 1) ? 0.62 : 0.4 + (H(cx, row, z >> 1, seed) - 0.5) * 0.1, H(cx, row, z >> 1, seed + 2) > 0.82 ? 1 : 0, 0]; }
    case 'chitin': return [0.52 + (x % 6 === 0 ? -0.15 : 0) + (vn(x / 4, y / 4, z / 4, seed) - 0.5) * 0.12 + j, x % 6 === 0 ? 1 : 0, 0];
    case 'stone': {
      const n = vn(x / 3.5, y / 3.5, z / 3.5, seed);
      const crack = Math.abs(n - 0.5) < 0.035;
      return [crack ? 0.18 : 0.5 + (vn(x / 2.2, y / 2.2, z / 2.2, seed + 5) - 0.5) * 0.3 + j, !crack && vn(x / 5, y / 5, z / 5, seed + 9) > 0.7 ? 1 : 0, 0];
    }
    case 'metal': return [0.58 + ((x + y + z) % 9 === 0 ? 0.2 : 0) + (H(x, y >> 2, z, seed) > 0.9 ? -0.15 : 0), x % 6 === 0 && y % 6 === 0 ? 1 : 0, 0];
    case 'rust': return [0.5 + (vn(x / 2.5, y / 2.5, z / 2.5, seed + 3) - 0.5) * 0.3, vn(x / 4, y / 4, z / 4, seed) > 0.56 ? 1 : 0, 0];
    case 'bone': { const n = vn(x / 4, y / 4, z / 4, seed); return [Math.abs(n - 0.5) < 0.03 ? 0.3 : 0.6 + j * 2, 0, 0]; }
    case 'cloth': return [0.5 + ((x + y) & 1 ? 0.06 : -0.06), y % 5 === 0 && x % 2 === 0 ? 1 : 0, 0];
    case 'wood': case 'bark': return [0.46 + ((x + z) % 3 === 0 ? -0.16 : 0.05) + (H(x, y >> 3, z, seed) - 0.5) * 0.12, h > 0.92 ? 1 : 0, 0];
    case 'crystal': { const f = ((x + y * 2 + z) >> 1) % 3; return [0.38 + f * 0.14 + (y % 5 === 0 ? 0.1 : 0), 0, 1]; }
    case 'membrane': return [0.46 + j, ((x + (y >> 1)) % 6 === 0 || (z + y) % 9 === 0) ? 1 : 0, ((x + (y >> 1)) % 6 === 0) ? 1 : 0];
    case 'cap': return [0.56 + j, H(x >> 1, y >> 1, z >> 1, seed) > 0.84 ? 1 : 0, 0];
    case 'slime': return [h > 0.94 ? 0.92 : 0.54 + j, H(x >> 2, y >> 2, z >> 2, seed) > 0.8 ? 1 : 0, 0];
    case 'crust': case 'lava': {
      const n = vn(x / 4.5, y / 5.5, z / 4.5, seed);
      const seam = Math.abs(n - 0.5) < 0.045; // fewer, longer glowing seams between dark crust plates
      return [seam ? 0.75 : 0.32 + (H(x >> 1, y >> 1, z >> 1, seed) - 0.5) * 0.2, seam ? 1 : 0, seam ? 1 : 0];
    }
    case 'flesh': return [0.5 + (h - 0.5) * 0.18, vn(x / 3, y / 3, z / 3, seed) > 0.66 ? 1 : 0, 0];
    case 'wart': { const b = H(x >> 1, y >> 1, z >> 1, seed) > 0.8; return [b ? 0.7 : 0.48 + j, b ? 1 : 0, 0]; }
    case 'smooth': return [0.52 + j * 0.6, 0, 0];
    case 'rune': { const on = (x % 4 === 0 && y % 3 !== 0) || (y % 6 === 0 && x % 4 < 3); return [0.45 + j, on ? 1 : 0, on ? 1 : 0]; }
    case 'moss': return [0.42 + h * 0.3, h > 0.6 ? 1 : 0, 0];
    case 'gill': return [y % 3 === 0 ? 0.3 : 0.55, y % 3 === 0 ? 1 : 0, 0];
    case 'hide': { const n = vn(x / 4, y / 4, z / 4, seed); return [0.5 + (n - 0.5) * 0.32 + j, n > 0.63 ? 1 : 0, 0]; }
    case 'spots': return [0.52 + j, H(x >> 1, y >> 1, z >> 1, seed) > 0.82 ? 1 : 0, 0];
    case 'plate': { const seam = x % 10 === 0 || y % 8 === 0; return [seam ? 0.28 : 0.54 + (y % 8 === 7 ? 0.14 : 0) + (vn(x / 4, y / 4, z / 4, seed) - 0.5) * 0.1, x % 10 === 4 && y % 8 === 4 ? 1 : 0, 0]; }
    case 'eye': return [0.42, 0, 1];
    case 'trim': return [0.6 + ((x + y + z) & 1) * 0.1, 0, 0];
    default: return [0.5 + j, 0, 0];
  }
}

// ============================================================================ voxelizer
const smin = (a, b, k) => { if (k <= 0) return a < b ? a : b; const h = Math.max(k - Math.abs(a - b), 0) / k; return (a < b ? a : b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// faces: normal, corners, AO + bevel neighbour offsets
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
for (const F of FACES) {
  const dims = [0, 1, 2].filter((d) => F.n[d] === 0);
  F.ao = F.c.map((corner) => {
    const a = [0, 0, 0], b = [0, 0, 0];
    a[dims[0]] = corner[dims[0]] ? 1 : -1;
    b[dims[1]] = corner[dims[1]] ? 1 : -1;
    const n = F.n;
    return { s1: [n[0] + a[0], n[1] + a[1], n[2] + a[2]], s2: [n[0] + b[0], n[1] + b[1], n[2] + b[2]], cc: [n[0] + a[0] + b[0], n[1] + a[1] + b[1], n[2] + a[2] + b[2]], e1: a, e2: b };
  });
}
const AO = [0.46, 0.66, 0.84, 1.0];
const FACE_SHADE = [0.9, 0.9, 1.0, 0.68, 0.96, 0.82];

/**
 * Voxelize a Monster's sculpt. div: voxels per creature height. Returns cached geometry data per bone
 * (bone-local positions, so each part rides its bone rigidly).
 */
export function voxelizeMonster(m, div = 40) {
  const sc = m.sculpt;
  const P = sc.prims.filter((p) => p.op !== BIND), binds = sc.prims.filter((p) => p.op === BIND);
  const adds = P.filter((p) => p.op === ADD);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of adds) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.lo[i] - p.noise); hi[i] = Math.max(hi[i], p.hi[i] + p.noise); }
  const height = Math.max(0.2, hi[1] - Math.max(lo[1], 0));
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const cell = Math.max(height / div, ext / 230);
  for (let i = 0; i < 3; i++) { lo[i] -= cell * 2; hi[i] += cell * 2; }
  const nx = Math.ceil((hi[0] - lo[0]) / cell), ny = Math.ceil((hi[1] - lo[1]) / cell), nz = Math.ceil((hi[2] - lo[2]) / cell);
  const sxy = nx * ny, NC = sxy * nz, f0 = cell * 3;
  const F = new Float32Array(NC).fill(f0);
  const cx = (i) => lo[0] + (i + 0.5) * cell, cy = (j) => lo[1] + (j + 0.5) * cell, cz = (k) => lo[2] + (k + 0.5) * cell;
  // thin parts (membranes, whiskers, claws) are thickened to at least ~one voxel so they never vanish
  for (const p of P) p.dil = p.op === ADD ? Math.max(0, cell * 0.62 - (p.tmin ?? 1)) : 0;
  const dist = (p, x, y, z) => p.sdf(x, y, z) - p.dil;
  for (const p of [...P, ...binds]) {
    const mg = (p.op === ADD ? p.k + cell * 2 : p.k + cell * 2) + p.noise + (p.dil || 0);
    p.elo = [p.lo[0] - mg, p.lo[1] - mg, p.lo[2] - mg]; p.ehi = [p.hi[0] + mg, p.hi[1] + mg, p.hi[2] + mg];
  }
  // ---- splat the field at voxel centres (authoring order: smooth unions, carves)
  for (const p of P) {
    if (p.op === PAINT) continue;
    const i0 = Math.max(0, Math.floor((p.elo[0] - lo[0]) / cell)), i1 = Math.min(nx - 1, Math.ceil((p.ehi[0] - lo[0]) / cell));
    const j0 = Math.max(0, Math.floor((p.elo[1] - lo[1]) / cell)), j1 = Math.min(ny - 1, Math.ceil((p.ehi[1] - lo[1]) / cell));
    const k0 = Math.max(0, Math.floor((p.elo[2] - lo[2]) / cell)), k1 = Math.min(nz - 1, Math.ceil((p.ehi[2] - lo[2]) / cell));
    const add = p.op === ADD, kk = p.k, na = p.noise * 2, nf = p.nf, dil = p.dil;
    for (let k = k0; k <= k1; k++) {
      const z = cz(k);
      for (let j = j0; j <= j1; j++) {
        const y = cy(j);
        let idx = k * sxy + j * nx + i0;
        for (let i = i0; i <= i1; i++, idx++) {
          const x = cx(i);
          let d = p.sdf(x, y, z) - dil;
          if (na) d += (vn(x * nf, y * nf, z * nf, 17) - 0.5) * na;
          const f = F[idx];
          if (add) { if (d < f + kk) F[idx] = smin(f, d, kk); }
          else if (-d > f - kk) { const v = smax(f, -d, kk); F[idx] = v < f0 ? v : f0; }
        }
      }
    }
  }
  const thr = cell * 0.08;
  const solid = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && F[k * sxy + j * nx + i] < thr;
  // ---- ownership: bone (rigid part) + palette material per solid voxel
  const BN = 12, bsx = (hi[0] - lo[0]) / BN, bsy = (hi[1] - lo[1]) / BN, bsz = (hi[2] - lo[2]) / BN;
  const binOf = (x, y, z) => Math.min(BN - 1, Math.max(0, ((x - lo[0]) / bsx) | 0)) + Math.min(BN - 1, Math.max(0, ((y - lo[1]) / bsy) | 0)) * BN + Math.min(BN - 1, Math.max(0, ((z - lo[2]) / bsz) | 0)) * BN * BN;
  const binLists = (list) => {
    const B = Array.from({ length: BN * BN * BN }, () => []);
    for (const p of list) {
      const i0 = Math.max(0, Math.floor((p.elo[0] - lo[0]) / bsx)), i1 = Math.min(BN - 1, Math.floor((p.ehi[0] - lo[0]) / bsx));
      const j0 = Math.max(0, Math.floor((p.elo[1] - lo[1]) / bsy)), j1 = Math.min(BN - 1, Math.floor((p.ehi[1] - lo[1]) / bsy));
      const k0 = Math.max(0, Math.floor((p.elo[2] - lo[2]) / bsz)), k1 = Math.min(BN - 1, Math.floor((p.ehi[2] - lo[2]) / bsz));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) B[i + j * BN + k * BN * BN].push(p);
    }
    return B;
  };
  const near = (p, x, y, z) => x >= p.elo[0] && x <= p.ehi[0] && y >= p.elo[1] && y <= p.ehi[1] && z >= p.elo[2] && z <= p.ehi[2];
  const subs = P.filter((p) => p.op === SUB && p.mat != null), paints = P.filter((p) => p.op === PAINT);
  const bAdds = binLists(adds), bSubs = binLists(subs), bPaints = binLists(paints), bBinds = binLists(binds);
  const BONE = new Int16Array(NC).fill(-1), MAT = new Int16Array(NC), LAY = new Int16Array(NC).fill(-1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = k * sxy + j * nx + i;
    if (F[idx] >= thr) continue;
    const x = cx(i), y = cy(j), z = cz(k), bi = binOf(x, y, z);
    let dIn = 1e9, bone = 0, best = 1e9, mat = 0;
    for (const p of bAdds[bi]) {
      if (!near(p, x, y, z)) continue;
      const d = dist(p, x, y, z), ad = d < 0 ? -d : d;
      if (d < dIn) { dIn = d; bone = p.bone; }
      if (ad < best) { best = ad; mat = p.mat; }
    }
    for (const p of bSubs[bi]) { if (!near(p, x, y, z)) continue; const d = p.sdf(x, y, z), ad = d < 0 ? -d : d; if (ad < best) { best = ad; mat = p.mat; } }
    for (const p of bPaints[bi]) if (near(p, x, y, z) && p.sdf(x, y, z) < cell * 0.3) { if (p.layer) LAY[idx] = p.mat; else mat = p.mat; }
    for (const p of bBinds[bi]) if (near(p, x, y, z) && p.sdf(x, y, z) < 0) bone = p.bone;
    BONE[idx] = bone; MAT[idx] = mat;
  }
  // ---- paint + mesh one rigid part per bone
  const mats = sc.mats.map((mm) => ({
    ...mm,
    bH: rgb2hsl(hexRgb(mm.hex || '#888888')), aH: rgb2hsl(hexRgb(mm.accHex || mm.hex || '#888888')),
    gRgb: mm.glowHex ? hexRgb(mm.glowHex) : mm.tile === TILE.eye ? [1, 0.86, 0.55] : null,
  }));
  const seed = m.seed * 7 + 3;
  const colorOf = (idx, i, j, k, matIdx) => {
    const mm = mats[matIdx];
    const [s0, acc, gm] = pattern(mm.tile, i, j, k, seed + matIdx);
    let s = s0 + mm.j * 1.4;
    if (!solid(i, j + 1, k)) s += 0.13; // lit tops
    if (!solid(i, j - 1, k)) s -= 0.1; // shadowed undersides
    if (!solid(i - 1, j, k) && !solid(i, j + 1, k)) s += 0.05; // upper-left rim toward the lamp
    const rgb = shadeCol(acc ? mm.aH : mm.bH, clamp(s, 0, 1));
    let glow = false;
    if (mm.gRgb && (mm.full || gm || mm.tile === TILE.eye)) {
      glow = true;
      const t = mm.tile === TILE.eye ? 0.85 : 0.55;
      for (let q = 0; q < 3; q++) rgb[q] = rgb[q] * (1 - t) + mm.gRgb[q] * t * (0.75 + s * 0.5);
    }
    return { rgb, glow };
  };
  // bind frames: root-space → bone-local
  m.group.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(m.root.matrixWorld).invert();
  const inv = m.bones.map((b) => new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld).invert().elements.slice());
  const buckets = new Map(); // bone → {solid, glow, layers: Map(layerMat→bucket)}
  const bucket = () => ({ p: [], n: [], c: [], idx: [] });
  const samples = [];
  const bbox = new THREE.Box3();
  const _v = new THREE.Vector3();
  const occ = (i, j, k) => (solid(i, j, k) ? 1 : 0);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = k * sxy + j * nx + i;
    const bone = BONE[idx];
    if (bone < 0) continue;
    let col = null;
    for (let f = 0; f < 6; f++) {
      const Fc = FACES[f], [fx, fy, fz] = Fc.n;
      const ni = i + fx, nj = j + fy, nk = k + fz;
      const nIn = ni >= 0 && nj >= 0 && nk >= 0 && ni < nx && nj < ny && nk < nz;
      const nIdx = nIn ? nk * sxy + nj * nx + ni : -1;
      if (nIn && BONE[nIdx] === bone) continue; // same part, hidden face (faces between parts stay, so joints never gap)
      if (!col) {
        col = colorOf(idx, i, j, k, MAT[idx]);
        let bk = buckets.get(bone);
        if (!bk) { bk = { solid: bucket(), glow: bucket(), layers: new Map() }; buckets.set(bone, bk); }
        col.bk = bk;
        bbox.expandByPoint(_v.set(cx(i), cy(j), cz(k)));
        if (samples.length < 600 && H(i, j, k, 91) < 0.18) samples.push({ p: [cx(i), cy(j), cz(k)], c: col.rgb.map(toLin), bone, glow: col.glow });
      }
      const exposed = !nIn || BONE[nIdx] < 0;
      const targets = [col.glow ? col.bk.glow : col.bk.solid];
      if (LAY[idx] >= 0 && exposed) {
        const lm = LAY[idx];
        let lb = col.bk.layers.get(lm);
        if (!lb) { lb = bucket(); col.bk.layers.set(lm, lb); }
        targets.push(lb);
      }
      const E = inv[bone];
      for (const B of targets) {
        const isLayer = B !== col.bk.solid && B !== col.bk.glow;
        const vi = B.p.length / 3;
        const aos = [];
        for (let q = 0; q < 4; q++) {
          const c = Fc.c[q];
          const X = lo[0] + (i + c[0]) * cell, Y = lo[1] + (j + c[1]) * cell, Z = lo[2] + (k + c[2]) * cell;
          B.p.push(E[0] * X + E[4] * Y + E[8] * Z + E[12], E[1] * X + E[5] * Y + E[9] * Z + E[13], E[2] * X + E[6] * Y + E[10] * Z + E[14]);
          let ao = 3, bev = 1;
          if (!col.glow && exposed) {
            const A = Fc.ao[q];
            const s1 = occ(i + A.s1[0], j + A.s1[1], k + A.s1[2]), s2 = occ(i + A.s2[0], j + A.s2[1], k + A.s2[2]), cc = occ(i + A.cc[0], j + A.cc[1], k + A.cc[2]);
            ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
            // bevel: corners on an outer edge catch a little extra light
            const e1 = !occ(i + A.e1[0], j + A.e1[1], k + A.e1[2]), e2 = !occ(i + A.e2[0], j + A.e2[1], k + A.e2[2]);
            bev = 1 + (e1 ? 0.09 : 0) + (e2 ? 0.09 : 0);
          }
          aos.push(ao);
          const shade = isLayer ? 1 : col.glow ? 1 : FACE_SHADE[f] * AO[ao] * bev;
          let rgb = col.rgb;
          if (isLayer) { const lm = mats[LAY[idx]]; rgb = lm.gRgb || [1, 0.6, 0.3]; }
          B.c.push(toLin(Math.min(1, rgb[0] * shade)), toLin(Math.min(1, rgb[1] * shade)), toLin(Math.min(1, rgb[2] * shade)));
        }
        // face normal in bone space
        const nxv = E[0] * fx + E[4] * fy + E[8] * fz, nyv = E[1] * fx + E[5] * fy + E[9] * fz, nzv = E[2] * fx + E[6] * fy + E[10] * fz;
        const nl = Math.hypot(nxv, nyv, nzv) || 1;
        for (let q = 0; q < 4; q++) B.n.push(nxv / nl, nyv / nl, nzv / nl);
        if (aos[0] + aos[2] > aos[1] + aos[3]) B.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        else B.idx.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
      }
    }
  }
  const geo = (B) => {
    if (!B.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    const nv = B.p.length / 3;
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
    g.computeBoundingSphere();
    return g;
  };
  const parts = [];
  let tris = 0;
  for (const [bone, bk] of buckets) {
    const layers = [];
    for (const [lm, lb] of bk.layers) { const prim = paints.find((p) => p.mat === lm && p.layer); layers.push({ name: prim ? prim.layer : null, geo: geo(lb) }); }
    const part = { bone, solid: geo(bk.solid), glow: geo(bk.glow), layers };
    tris += (bk.solid.idx.length + bk.glow.idx.length) / 3;
    parts.push(part);
  }
  if (bbox.isEmpty()) bbox.set(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.6, 0.3));
  bbox.expandByScalar(cell * 0.5);
  return { parts, bbox, samples, cell, stats: { grid: [nx, ny, nz], tris } };
}
