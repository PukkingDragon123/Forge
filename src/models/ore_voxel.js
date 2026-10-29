// Every material as a hand-sculpted voxel model: faceted boulders studded with ore, crystal clusters of
// angled hex prisms, fat nugget piles, cast ingots with bevels and stamps, cut gems and eggs, and monster
// parts as proper 3D shapes (fangs, shells, wings, sacs, cores…). Saturated hue-shifted ramps; crystals,
// magma and magic glow. The same sculpts render the 2D sprites (art/sprites.js via gfx/voxsprite.js).
import * as THREE from 'three';
import { meshVoxels } from '../gfx/voxel.js';
import { MATERIALS } from '../data/materials.js';
import { noise3 } from '../core/math.js';
import {
  Sculpt, rng, norm, dot, add3, basis, rotB, clamp01, lit, spec, vu, setLight, light, C, glow, mixC, ramp, tone, metal,
  sphere, ell, box, cap, cyl, torus, tube, curve, poly, rockPlanes, prismPlanes, gemPlanes, slab, d2poly, d2seg, d2union, d2circle, noisy, minus, halfspace,
} from './vox_sculpt.js';

/** World size of one voxel (game-wide standard). */
export const ORE_VS = 0.04;
/** Design units across a typical material (the bake resolution maps this many units to `res` voxels). */
const SPAN = 28;

// ------------------------------------------------------------------ shared painters
const ROCK = { default: '#8695a2', junk: '#8a7466', lodestone: '#4a4c66', magmasteel: '#3a2a2e', cursedore: '#4e4466', iron: '#7e8896', copper: '#8a98a4', stariron: '#2a2c52', geode: '#8a7666', fossil: '#d8c8a8', runestone: '#5a6a8a' };
const n3 = (x, y, z, f, s) => noise3(x * f + 11.3, y * f + 3.1, z * f + 7.7, s);

/** Faceted stone: flat-shaded facets, lit ridges, cool crevices, speckle and hairline cracks. */
function rockPaint(R, F, o = {}) {
  return (x, y, z, n, h) => {
    const f = F.facet(x, y, z);
    const L = lit(f.n);
    if (f.gap < vu() * 0.9 && L > 0.15) return R[5];
    if (o.crack !== false && Math.abs(n3(x, y, z, 0.16, 9) - 0.5) < 0.022) return R[1];
    const t = L * 1.05 + (n3(x, y, z, 0.3, 3) - 0.5) * 0.3;
    if (h > 0.99) return R[5];
    return tone(R, t, 1, 4, h, 0.12);
  };
}
/** Facet-shaded glowing crystal: lit facets bright, shadow facets deep, edges and tip blaze. */
function crystalPaint(R, F, o = {}) {
  const L0 = o.len || 1;
  return (x, y, z, n, h) => {
    const f = F.facet(x, y, z);
    const L = lit(f.n), along = clamp01(f.q[1] / L0);
    let c;
    if (f.gap < vu() * 0.85) c = L > -0.15 ? (along > 0.8 ? R[6] : R[5]) : R[3];
    else {
      const t = L * 1.1 + (along - 0.5) * (o.grad ?? 0.8) + (f.i % 2 ? 0.15 : -0.1);
      c = tone(R, t, 0, 4, h, 0.1);
      // a bright streak down the face nearest the viewer (inner light)
      if (o.streak !== false && Math.abs(f.q[0] * 0.6 - f.q[2] * 0.8) < 0.22 && along > 0.3 && along < 0.8 && L > -0.1) c = R[5];
    }
    return o.glow === false ? c : glow(c);
  };
}
/** Smooth painted solid with soft gradient shading. */
const smooth = (R, lo = 1, hi = 5, bias = 0) => (x, y, z, n, h) => tone(R, lit(n) * 0.95 + bias, lo, hi, h);

// ------------------------------------------------------------------ building blocks
/** A faceted boulder part. */
function boulder(S, c, s, seed, R, o = {}) {
  const F = poly(c, rockPlanes(o.n || 15, rng(seed), o.rough ?? 0.14, o.base ?? 0.6), s, o.B || null, o.amp ?? 0.35, 0.33, seed);
  S.add(F, o.paint ? o.paint(F) : rockPaint(R, F, o));
  return F;
}
/** A crystal prism rooted at `at`, pointing along dir. */
function prism(S, at, dir, r, len, R, o = {}) {
  const u = norm(dir), [, v, w] = basis(u);
  // local frame: y along the crystal, x/z across
  const B = [v, u, w];
  const sides = o.sides || 6;
  const F = poly(at, prismPlanes(sides, len / r, o.tip ?? 1.1, o.rot ?? 0.3, true), [r, r, r], B);
  S.add(F, o.paint ? o.paint(F) : crystalPaint(R, F, { len: len / r, ...o }));
  return F;
}
/** Lumpy nugget. */
function nugget(S, c, r, seed, paint) {
  const f = noisy(ell(c, r), Math.min(r[0], r[1]) * 0.22, 0.38, seed);
  S.add(f, paint, { k: 0.8 });
  return f;
}
const frameY = (dir, spin = 0) => {
  const y = norm(dir);
  let x = norm([Math.cos(spin), 0, Math.sin(spin)]);
  x = norm(add3(x, y, -dot(x, y)));
  const z = norm([x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]);
  return [x, y, z];
};

// ------------------------------------------------------------------ styles
const STYLES = {};

// ---- ore chunks: boulder + the ore showing through
STYLES.chunk = (S, m, r) => {
  const R = ramp(ROCK[m.id] || ROCK.default, 7, 1.05);
  const main = boulder(S, [0, 9, 0], [12, 9.5, 11], 3 + m.id.length, R);
  boulder(S, [-10, 4.2, 6], [5.8, 4.8, 5.6], 17, R, { n: 11 });
  boulder(S, [9.5, 3.2, 7], [4.5, 3.6, 4.2], 29, R, { n: 10 });
  const M = ramp(m.color, 7, 1.2), M2 = ramp(m.color2 || m.color, 7, 1.15);
  const id = m.id;
  if (id === 'copper') {
    // native copper blobs bursting from the rock + malachite crust
    for (const [x, y, z, s] of [[3, 15, 7, 3.6], [-5, 13, 8, 2.8], [7, 10, 9, 2.6], [-1, 18, 3, 2.4], [-8, 8, 9, 2.0]]) nugget(S, [x, y, z], [s, s * 0.85, s], x * 7 + y, (x2, y2, z2, n, h) => metal(M, n, h, { bias: 1 }));
    S.parts[0].paint = (() => { const base = rockPaint(R, main); return (x, y, z, n, h) => { const v = n3(x, y, z, 0.2, 5); if (v > 0.6) return tone(M2, Math.sin(v * 60) * 0.6 + lit(n) * 0.6, 1, 5, h); return base(x, y, z, n, h); }; })();
  } else if (id === 'iron' || id === 'junk') {
    // cubic metal crystals (pyrite-like) wedged in the rock, rust stains
    const cubes = id === 'iron' ? [[2, 16, 6, 3.4, 0.5, 0.7], [-6, 13, 7, 2.6, 0.9, 0.2], [7, 11, 7, 2.2, 0.2, 1.1], [-2, 19, 0, 2.4, 1.2, 0.4]] : [[3, 15, 6, 2.6, 0.4, 0.9], [-6, 12, 7, 2.0, 1.1, 0.3]];
    for (const [x, y, z, s, a, b] of cubes) {
      const F = poly([x, y, z], [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((nn) => ({ n: nn, o: 1 })), [s, s, s], rotB(a, b, a * 0.7));
      S.add(F, (x2, y2, z2, n, h) => { const f = F.facet(x2, y2, z2); if (f.gap < vu() * 0.9) return M[6]; return metal(M, f.n, h, { st: 0.6 }); });
    }
    if (id === 'junk') {
      // a bent rusty bolt and a broken cog stuck in the rubble
      S.add(tube([[-3, 17, 4], [1, 21, 5], [5, 22, 3]], [1.0, 0.9, 0.8]), (x, y, z, n, h) => tone(M2, lit(n), 1, 5, h));
      S.add(cyl([9, 13, 5], norm([0.6, 0.3, 0.75]), 3.4, 0.9), (x, y, z, n, h) => (h > 0.8 ? M2[2] : metal(ramp('#8a8a92'), n, h)));
    }
    const base = rockPaint(R, main);
    S.parts[0].paint = (x, y, z, n, h) => (n3(x, y, z, 0.22, 8) > 0.64 ? tone(M2, lit(n) * 0.8, 1, 4, h) : base(x, y, z, n, h));
  } else if (id === 'lodestone') {
    // iron filings standing up along the field lines, glowing red poles
    const rr = rng(7);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, rad = 3 + rr() * 6;
      const bx = Math.cos(a) * rad, bz = Math.sin(a) * rad * 0.9, by = 15.5 + rr() * 2.5;
      const tip = [bx * 1.25, by + 3 + rr() * 3.5, bz * 1.25];
      S.add(cap([bx, by - 1, bz], tip, 0.55, 0.12), (x, y, z, n, h) => (y > tip[1] - 1 ? M2[5] : metal(ramp('#5a5c74'), n, h)));
    }
    for (const p of [[-10, 8, 4], [10, 8, -2]]) S.add(sphere(p, 2.2), glow(M2[4]));
  } else if (id === 'magmasteel') {
    // black crust split by glowing magma, a molten pool on top
    const G = ramp('#ff6a2a', 7, 1.2);
    const base = rockPaint(R, main, { crack: false });
    for (const P of S.parts) P.paint = (x, y, z, n, h) => {
      const v = Math.abs(n3(x, y, z, 0.14, 4) - 0.5);
      if (v < 0.045) return glow(v < 0.018 ? G[5] : G[3]);
      if (v < 0.07) return G[1];
      return base(x, y, z, n, h);
    };
    S.cut(ell([1, 18.5, 2], [5.5, 2.2, 5]), (x, y, z, n, h) => glow(h > 0.8 ? G[5] : G[4]));
    nugget(S, [-6, 15, 7], [2.2, 2.6, 2.2], 5, (x, y, z, n, h) => glow(G[lit(n) > 0.3 ? 4 : 3]));
  } else if (id === 'cursedore') {
    const G = ramp(m.color2, 7, 1.2);
    const base = rockPaint(R, main);
    S.parts[0].paint = (x, y, z, n, h) => { const v = Math.abs(n3(x, y, z, 0.18, 6) - 0.5); return v < 0.035 ? glow(G[v < 0.015 ? 6 : 4]) : base(x, y, z, n, h); };
    const P = ramp(m.color, 7, 1.25);
    prism(S, [2, 14, 2], [0.3, 1, 0.4], 2.4, 11, P, { sides: 5 });
    prism(S, [-4, 13, 3], [-0.6, 1, 0.5], 1.7, 7, P, { sides: 5 });
    prism(S, [6, 11, 6], [0.8, 0.7, 0.8], 1.4, 5.5, P, { sides: 5 });
  }
};

// ---- crystal clusters on a rock base
STYLES.cluster = (S, m) => {
  const R = ramp(ROCK.default, 7, 1.0);
  boulder(S, [0, 3.5, 0], [12, 4.5, 10], 41, R, { n: 13, base: 0.5 });
  const P = ramp(m.color, 7, m.id === 'quartz' ? 1.6 : 1.25);
  const set = [[0, 5, 0, 0.05, 1, 0.1, 3.4, 22], [-6, 5, 2, -0.7, 1, 0.35, 2.6, 15], [6, 5, 1, 0.8, 1, 0.2, 2.4, 14], [-2, 5, 5, -0.25, 1, 0.9, 2.2, 12], [4, 5, 5, 0.5, 0.9, 1, 1.9, 10], [-9, 4, -2, -1, 0.7, -0.3, 1.8, 9], [3, 5, -5, 0.2, 1, -0.8, 2.1, 12]];
  set.forEach(([x, y, z, dx, dy, dz, r, L], i) => prism(S, [x, y - 2, z], [dx, dy, dz], r, L + 2, P, { rot: i * 0.7 }));
};

// ---- elemental crystals: one great prism and its brood
STYLES.crystal = (S, m) => {
  const R = ramp('#5a5470', 7, 1.0);
  boulder(S, [0, 3, 0], [10, 4, 9], 53, R, { n: 12, base: 0.5 });
  const P = ramp(m.color, 7, 1.25), Q = ramp(m.color2 || m.color, 7, 1.2);
  const id = m.id;
  const main = prism(S, [0, 2, 0], [0.15, 1, 0.1], 4.2, 25, P, { sides: 6, tip: 1.3 });
  prism(S, [-5, 3, 3], [-0.6, 1, 0.3], 2.5, 13, P, { rot: 1 });
  prism(S, [5, 3, 2], [0.7, 1, 0.25], 2.2, 11, P, { rot: 2 });
  prism(S, [1, 3, 6], [0.2, 0.8, 1], 1.8, 8, P, { rot: 0.5 });
  if (id === 'storm') {
    // lightning trapped inside: zigzag bolts across the big crystal's faces
    const base = S.parts[1].paint;
    S.parts[1].paint = (x, y, z, n, h) => { const f = main.facet(x, y, z); const zz = Math.abs(((f.q[1] * 0.9) % 2) - 1) * 0.9 - 0.45; return Math.abs(f.q[0] * 0.7 + f.q[2] * 0.7 - zz) < 0.16 && f.q[1] > 1 ? glow(Q[5]) : base(x, y, z, n, h); };
  } else if (id === 'rime') {
    for (const [x, z, a] of [[-8, 2, 0], [8, -1, 1], [-3, -6, 2], [6, 5, 3]]) prism(S, [x, 4, z], [x * 0.1, 1, z * 0.1], 0.9, 4, ramp('#ffffff', 7, 1), { sides: 4, rot: a });
  } else if (id === 'venomite') {
    for (const [x, y, z, r] of [[-2, 1.6, 8, 1.4], [4, 1.2, 8, 1.0], [-7, 1.2, 6, 0.9]]) S.add(ell([x, y, z], [r, r * 1.3, r]), (x2, y2, z2, n, h) => glow(tone(Q.map((c) => mixC(c, P[4], 0.5)), lit(n), 2, 5, h)));
  } else if (id === 'ember') {
    // hot core shows through the tip
    const base = S.parts[1].paint;
    const H = ramp('#ffe08a', 7, 1.1);
    S.parts[1].paint = (x, y, z, n, h) => { const f = main.facet(x, y, z); return f.q[1] > 4.2 && Math.hypot(f.q[0], f.q[2]) < 0.75 ? glow(H[5]) : base(x, y, z, n, h); };
  }
};

// ---- cut gems & eggs
const GEM_CUT = { ruby: 'oval', sapphire: 'pear', emerald: 'step', topaz: 'kite', diamond: 'brilliant', moonstone: 'cabochon', amber: 'blob', soulstone: 'egg' };
function gemPaint(R, F, o = {}) {
  return (x, y, z, n, h) => {
    const f = F.facet(x, y, z);
    const L = lit(f.n);
    let c;
    if (f.gap < vu() * 0.8) c = L > 0 ? R[5] : R[2];
    else if (f.i === 0) {
      // the table: a soft diagonal gradient with a hot corner
      const g = (f.q[0] - f.q[2]) / 10;
      c = g < -0.55 ? R[5] : tone(R, -g * 0.9 + 0.1, 1, 4, h, 0.1);
    } else if (spec(f.n, 12) > 0.85) c = R[6];
    else {
      // facets alternate light/dark like real refraction
      const alt = ((f.i * 7) % 5) / 4 - 0.5;
      c = tone(R, L * 0.8 + alt * 0.9 + (o.bias || 0), 0, 4, h, 0.06);
    }
    return glow(c);
  };
}
STYLES.gem = (S, m) => {
  const cut = GEM_CUT[m.id] || 'oval';
  const R = ramp(m.color, 7, 1.3);
  const B = frameY([0.05, 1, 0.22], 0.4);
  if (cut === 'cabochon') {
    const E = ell([0, 2, 0], [12, 10, 9.5], B);
    const f = Object.assign((x, y, z) => Math.max(E(x, y, z), -dot([x, y - 2, z], B[1])), { bb: E.bb });
    const Q = ramp('#7ab8ff', 7, 1.2);
    S.add(f, (x, y, z, n, h) => {
      const s2 = spec(n, 14);
      if (s2 > 0.7) return glow(R[6]);
      const sheen = Math.abs(dot(n, norm([0.6, 0.5, -0.2])) - 0.35) < 0.12; // drifting blue adularescence
      return glow(sheen ? Q[3] : tone(R, lit(n) * 0.9, 1, 4, h));
    });
    S.add(torus([0, 2.4, 0], B[1], 11.4, 1.3), (x, y, z, n, h) => metal(ramp('#c8ccd8'), n, h)); // silver bezel
    return;
  }
  if (cut === 'blob') {
    const f = noisy(ell([0, 10, 0], [11, 9.5, 8.5], B), 1.3, 0.22, 4);
    const D = ramp('#7a3a0a', 7, 1.1);
    S.add(f, (x, y, z, n, h) => {
      if (spec(n, 16) > 0.7) return glow(R[6]);
      // a trapped beetle seen through the resin
      const u = x - 1, v = y - 10;
      const bug = (u * u) / 9 + (v * v) / 4 < 1 || (Math.abs(v) < 2.6 && Math.abs(Math.abs(u) - 4) < 0.6 && ((u * 3 + v * 2) % 2.5) < 1.2);
      if (bug && dot(n, [0.5, 0.45, 0.74]) > 0.3) return glow(D[1]);
      return glow(tone(R, lit(n) * 0.6 - (1 - clamp01(dot(n, [0.5, 0.45, 0.74]))) * 0.4, 1, 5, h));
    });
    return;
  }
  if (cut === 'egg') {
    const planes = [];
    const N = 40, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) { const yy = 1 - ((i + 0.5) / N) * 2, r = Math.sqrt(1 - yy * yy); planes.push({ n: [Math.cos(i * ga) * r, yy, Math.sin(i * ga) * r], o: 1 }); }
    const F = poly([0, 13, 0], planes, [9.5, 13, 9.5], rotB(0.25, 0, -0.2));
    const D = ramp(m.color2, 7, 1.1);
    S.add(F, (x, y, z, n, h) => {
      const f = F.facet(x, y, z);
      if (f.gap < vu() * 0.8 && lit(f.n) > 0) return glow(R[6]);
      // souls swirling under the shell
      const a = Math.atan2(f.q[2], f.q[0]), sw = Math.sin(a * 2 + f.q[1] * 0.45);
      if (Math.abs(sw) < 0.18) return glow(D[2]);
      return glow(tone(R, lit(f.n) * 0.85 + (f.i % 3 === 0 ? 0.25 : 0), 1, 5, h));
    });
    return;
  }
  let planes, s;
  if (cut === 'brilliant') { planes = gemPlanes(8, { table: 0.4 }); s = [11, 8.5, 11]; }
  else if (cut === 'oval') { planes = gemPlanes(8, { table: 0.4, rot: 0.2 }); s = [13, 8.5, 9.5]; }
  else if (cut === 'kite') { planes = gemPlanes(4, { table: 0.38, rot: Math.PI / 4, crown: 0.7 }); s = [9, 8, 13]; }
  else if (cut === 'step') {
    planes = [{ n: [0, 1, 0], o: 0.45 }];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72]]) {
      const n = norm([a, 0, b]), d = Math.abs(a) && Math.abs(b) ? 0.9 : 1;
      planes.push({ n, o: d });
      for (const [k, off] of [[0.5, 0.86], [1.4, 0.72]]) { const c = norm([n[0], k, n[2]]); planes.push({ n: c, o: (c[0] * n[0] + c[2] * n[2]) * d * off + c[1] * 0.25 * k }); }
      for (const [k, off] of [[0.8, 0.95], [1.6, 0.7]]) { const c = norm([n[0], -k, n[2]]); planes.push({ n: c, o: (c[0] * n[0] + c[2] * n[2]) * d * off + c[1] * -0.1 }); }
    }
    s = [13, 8, 9.5];
  } else { planes = gemPlanes(8, { table: 0.42 }); s = [11, 8.5, 11]; }
  let F = poly([0, 9, 0], planes, s, B);
  if (cut === 'pear') {
    // taper one end into a teardrop
    const base = poly([0, 9, 0], gemPlanes(8, { table: 0.4 }), [12, 8.5, 10], B);
    F = Object.assign((x, y, z) => { const q = [x, y - 9, z]; const u = dot(q, B[0]); const k = 1 + Math.max(0, u / 12) * 0.9; return base(x - B[2][0] * dot(q, B[2]) * (1 - 1 / k), y - B[2][1] * dot(q, B[2]) * (1 - 1 / k), z - B[2][2] * dot(q, B[2]) * (1 - 1 / k)); }, { bb: base.bb, facet: (x, y, z) => { const q = [x, y - 9, z]; const u = dot(q, B[0]); const k = 1 + Math.max(0, u / 12) * 0.9; const w = dot(q, B[2]) * (1 - 1 / k); return base.facet(x - B[2][0] * w, y - B[2][1] * w, z - B[2][2] * w); } });
  }
  S.add(F, gemPaint(R, F));
};

// ---- nugget piles
STYLES.nuggets = (S, m) => {
  const id = m.id;
  const M = ramp(m.color, 7, id === 'coal' ? 1 : 1.2);
  const pile = [[-5, 4.5, 2, 6, 4.8, 5.5], [5, 4.2, 1, 5.5, 4.4, 5], [0, 4, 7, 4.8, 4, 4.5], [-1, 10, 2, 5, 4.6, 4.6], [7, 3, 8, 3.2, 3, 3], [-9, 2.8, 7, 3, 2.8, 3]];
  if (id === 'coal') {
    pile.forEach(([x, y, z, a, b, c], i) => {
      const F = poly([x, y, z], rockPlanes(9, rng(i + 3), 0.25, 0.55), [a, b, c], null, 0.15, 0.4, i);
      S.add(F, (x2, y2, z2, n, h) => { const f = F.facet(x2, y2, z2); if (f.gap < vu() * 0.9 && lit(f.n) > 0) return C('#8a8aa8'); if (spec(f.n, 8) > 0.6) return C('#6a6a86'); return tone(M, lit(f.n), 0, 3, h); });
    });
    return;
  }
  if (id === 'brimstone') {
    pile.forEach(([x, y, z, a, b, c], i) => nugget(S, [x, y, z], [a, b, c], i * 5, (x2, y2, z2, n, h) => tone(M, lit(n) + (n3(x2, y2, z2, 0.6, 2) - 0.5) * 0.8, 1, 5, h)));
    const rr = rng(9);
    for (let i = 0; i < 9; i++) { const p = pile[i % pile.length]; const d = norm([rr() - 0.5, 0.8, rr() - 0.3]); prism(S, add3([p[0], p[1], p[2]], d, p[3] * 0.6), d, 0.9, 2.6 + rr() * 2, M, { sides: 4, glow: false, streak: false }); }
    return;
  }
  pile.forEach(([x, y, z, a, b, c], i) => nugget(S, [x, y, z], [a, b, c], i * 13 + id.length, (x2, y2, z2, n, h) => (n3(x2, y2, z2, 0.5, 4) > 0.74 ? M[2] : metal(M, n, h, { bias: 1 }))));
};

// ---- cast ingots, stacked, bevelled and stamped
function ingot(S, c, B, M, o = {}) {
  const hx = 8.5, hy = 2.6, hz = 4.3, k = 0.22, bev = 0.9;
  const planes = [{ n: [0, -1, 0], o: hy }, { n: [0, 1, 0], o: hy }];
  for (const [ax, h] of [[0, hx], [2, hz]]) for (const sg of [1, -1]) {
    const n = [0, k, 0]; n[ax] = sg; const nn = norm(n);
    planes.push({ n: nn, o: nn[ax] * sg * h }); // sloped side through the mid-height edge
    const xt = h - k * hy; // side position at the top
    const b = [0, 1.25, 0]; b[ax] = sg; const bn = norm(b);
    const pt = [0, hy, 0]; pt[ax] = sg * (xt - bev);
    planes.push({ n: bn, o: dot(bn, pt) });
  }
  const F = poly(c, planes, [1, 1, 1], B);
  S.add(F, (x, y, z, n, h) => {
    const f = F.facet(x, y, z);
    if (f.gap < vu() * 0.85 && lit(f.n) > -0.2) return o.edge ?? M[6];
    if (o.patina && n3(x, y, z, 0.35, 6) > 0.6) return tone(o.patina, lit(f.n), 1, 4, h);
    return metal(M, f.n, h, { st: 0.62, bias: 1 });
  });
  // the maker's stamp, sunk into the top face
  const top = add3(c, B[1], hy);
  const stamp = (u, v) => Math.max(Math.abs(u) - 2.6, Math.abs(v) - 1.3);
  S.cut(slab(top, [B[0], B[2], B[1]], o.mark || stamp, 0.6, 0, 6), (x, y, z, n, h) => (o.markGlow ? glow(M[4]) : M[2]));
  return F;
}
STYLES.ingot = (S, m) => {
  const M = ramp(m.color, 7, 1.15);
  const patina = m.id === 'bronze_ancient' ? ramp(m.color2, 7, 1.1) : null;
  const rune = (u, v) => Math.min(Math.hypot(u, v) - 1.5 > 0 ? Math.abs(Math.hypot(u, v) - 1.6) - 0.45 : 9, Math.max(Math.abs(u) - 0.45, Math.abs(v) - 1.6));
  const o = { patina, mark: m.id === 'mithril' ? rune : null, markGlow: m.id === 'mithril', edge: m.id === 'mithril' ? glow(M[6]) : undefined };
  ingot(S, [0, 2.6, -4.7], rotB(0, 0.05, 0), M, o);
  ingot(S, [0.5, 2.6, 4.7], rotB(0, -0.04, 0), M, o);
  ingot(S, [0, 7.9, 0], rotB(0, Math.PI / 2 + 0.12, 0), M, o);
};

// ---- monster fangs
STYLES.fang = (S, m) => {
  const I = ramp(m.color, 7, 1.0), Rt = ramp(m.color2 || '#c88a6a', 7, 1.15);
  const id = m.id;
  const len = id === 'rat_tooth' ? 18 : 24;
  const pts = curve((t) => [-6 + t * 12 + Math.sin(t * 2.2) * 3, 2 + t * len, Math.sin(t * 3) * 1.2], 10);
  const radii = pts.map((_, i) => { const t = i / (pts.length - 1); return id === 'rat_tooth' ? 3.4 * (1 - t * 0.55) : 4.2 * Math.pow(1 - t, 0.8) + 0.25; });
  const T = tube(pts, radii);
  S.add(T, (x, y, z, n, h) => {
    const t = T.param(x, y, z);
    if (t < 0.22) return tone(Rt, lit(n) * 0.8, 1, 5, h); // gum / root
    if (spec(n, 18) > 0.6) return I[6];
    const stain = id === 'rat_tooth' && t > 0.6 ? ramp('#ffb040', 7, 1.1) : I;
    return tone(stain, lit(n) * 0.9 + (t - 0.5) * 0.3, 1, 5, h);
  });
  // forked root
  for (const s of [-1, 1]) S.add(tube([[-6 + s * 1.5, 3, 0], [-6 + s * 2.4, -1.5, s * 0.6]], [2.2, 1]), (x, y, z, n, h) => tone(Rt, lit(n) * 0.8, 1, 4, h));
  if (id === 'hound_fang') S.add(tube(curve((t) => [-5 + t * 8, 6 + t * 12, 3.2 - t * 1.4], 6), [0.7, 0.6, 0.6, 0.5, 0.4, 0.3, 0.2]), (x, y, z, n, h) => glow(Rt[5]));
};

const STYLE_ALIAS = { meteor: 'chunk', shard: 'crystal', geode: 'chunk', fossil: 'chunk', rune: 'chunk', mushroom: 'chunk' };

// ------------------------------------------------------------------ build + cache
const grids = new Map();
function sculptFor(id) {
  const m = MATERIALS[id] || { id, color: '#a0a0a0', sprite: 'chunk' };
  const style = STYLES[m.sprite] ? m.sprite : STYLES[STYLE_ALIAS[m.sprite]] ? STYLE_ALIAS[m.sprite] : 'chunk';
  const S = new Sculpt();
  STYLES[style](S, m);
  return S;
}
/**
 * Voxel grid for a material at `res` voxels across its design span. roll (quarter turns, for backpack
 * rotation) only re-aims the baked light so painted shading stays lit from the upper left.
 */
export function oreGrid(id, res = 30, roll = 0) {
  const key = id + '|' + res + '|' + (roll & 3);
  let g = grids.get(key);
  if (g) return g;
  const L0 = light();
  if (roll & 3) { const a = (roll & 3) * (Math.PI / 2); setLight([L0[0] * Math.cos(a) - L0[1] * Math.sin(a), L0[0] * Math.sin(a) + L0[1] * Math.cos(a), L0[2]]); }
  g = sculptFor(id).bake(res / SPAN, { seed: id.length });
  setLight(L0);
  grids.set(key, g);
  if (grids.size > 400) grids.delete(grids.keys().next().value);
  return g;
}

/**
 * A voxel model of material `id`, centred on the origin, 0.04 world units per voxel.
 * opts: { res (voxels across, default 30), glow (emissive intensity), spinSpeed, roll }.
 * userData.spin(dt) turns it slowly for showcases.
 */
export function buildOreModel(id, opts = {}) {
  const g = oreGrid(id, opts.res || 30, opts.roll || 0);
  const mesh = meshVoxels(g, { size: opts.vs ?? ORE_VS, origin: [g.nx / 2, g.ny / 2, g.nz / 2], jitter: 0.025, seed: 5, glowIntensity: opts.glow ?? 1.5 });
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.grid = g;
  group.userData.spin = (dt) => { group.rotation.y += dt * (opts.spinSpeed ?? 0.9); };
  return group;
}
