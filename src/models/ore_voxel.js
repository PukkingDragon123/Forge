// Every material as a hand-sculpted voxel model: faceted boulders studded with ore, crystal clusters of
// angled hex prisms, fat nugget piles, cast ingots with bevels and stamps, cut gems and eggs, and monster
// parts as proper 3D shapes (fangs, shells, wings, sacs, cores…). Saturated hue-shifted ramps; crystals,
// magma and magic glow. The same sculpts render the 2D sprites (art/sprites.js via gfx/voxsprite.js).
import * as THREE from 'three';
import { meshVoxels } from '../gfx/voxel.js';
import { MATERIALS } from '../data/materials.js';
import { noise3, hash3 } from '../core/math.js';
import {
  Sculpt, rng, norm, dot, add3, basis, rotB, clamp01, lit, spec, vu, setLight, light, C, glow, mixC, ramp, tone, metal,
  sphere, ell, box, cap, cyl, torus, tube, curve, poly, rockPlanes, prismPlanes, gemPlanes, slab, d2poly, d2seg, d2union, d2circle, noisy,
} from './vox_sculpt.js';

/** World size of one voxel (game-wide standard). */
export const ORE_VS = 0.04;
/** Design units across a typical material (the bake resolution maps this many units to `res` voxels). */
const SPAN = 28;

// ------------------------------------------------------------------ shared painters
const ROCK = { default: '#6a7888', junk: '#7a6250', lodestone: '#4a4c66', magmasteel: '#3a2a2e', cursedore: '#4e4466', iron: '#56627a', copper: '#6e6458', stariron: '#2a2c52', geode: '#8a7666', fossil: '#d8c8a8', runestone: '#5a6a8a' };
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
  const M = ramp(m.id === 'iron' ? '#a8b4c8' : m.color, 7, 1.2), M2 = ramp(m.color2 || m.color, 7, 1.15);
  const id = m.id;
  if (id === 'copper') {
    // native copper blobs bursting from the rock + malachite crust
    for (const [x, y, z, s] of [[3, 15, 7, 4.6], [-5, 13, 8, 3.8], [7, 10, 9, 3.4], [-1, 18.5, 3, 3.4], [-8, 8, 9, 2.8], [9, 15, 2, 2.6]]) nugget(S, [x, y, z], [s, s * 0.85, s], x * 7 + y, (x2, y2, z2, n, h) => metal(M, n, h, { bias: 1 }));
    S.parts[0].paint = (() => { const base = rockPaint(R, main); return (x, y, z, n, h) => { const v = n3(x, y, z, 0.2, 5); if (v > 0.6) return tone(M2, Math.sin(v * 60) * 0.6 + lit(n) * 0.6, 1, 5, h); return base(x, y, z, n, h); }; })();
  } else if (id === 'iron' || id === 'junk') {
    // cubic metal crystals (pyrite-like) wedged in the rock, rust stains
    const cubes = id === 'iron' ? [[2, 16, 6, 4.2, 0.5, 0.7], [-6, 13, 7, 3.3, 0.9, 0.2], [7, 11, 7, 2.8, 0.2, 1.1], [-2, 19, 0, 3.0, 1.2, 0.4], [-9, 9, 3, 2.2, 0.3, 0.8]] : [[3, 15, 6, 2.6, 0.4, 0.9], [-6, 12, 7, 2.0, 1.1, 0.3]];
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
    // iron filings bristling along the field lines between two glowing poles
    const Fi = ramp('#9aa4b8', 7, 1.1), P = [[-9, 13, 4], [9, 14, 1]];
    const rr = rng(7);
    for (let i = 0; i < 26; i++) {
      const t = (i + 0.5) / 26, side = i % 2 ? 1 : -1, arc = 0.15 + rr() * 0.7;
      const x0 = -9 + 18 * t, y0 = 16 + Math.sin(t * Math.PI) * 3.5 + rr() * 1.5, z0 = (rr() - 0.5) * 9;
      const dir = norm([-(t - 0.5) * 1.6 * side * 0.3 + (rr() - 0.5) * 0.5, 1, (rr() - 0.5) * 0.4]);
      const L = 2.2 + arc * 3.4;
      S.add(cap([x0, y0 - 1.5, z0], add3([x0, y0, z0], dir, L), 0.62, 0.16), (x, y, z, n, h) => (spec(n, 10) > 0.5 ? Fi[6] : tone(Fi, lit(n) * 0.9, 1, 5, h)));
    }
    for (const p of P) S.add(sphere(p, 2.4), (x, y, z, n, h) => glow(tone(M2, lit(n) * 0.5 + 0.4, 3, 6, h)));
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
/** 9-tone gem ramp: deep shadows, saturated body (3-5), pale glints (7-8). */
const gemRamp = (hex) => ramp(hex, 9, 1.35);
function gemPaint(R, F, up) {
  return (x, y, z, n, h) => {
    const f = F.facet(x, y, z);
    const L = lit(f.n), ny = dot(f.n, up);
    const alt = ((f.i * 7) % 5) / 4 - 0.5;
    let c;
    const ny2 = dot(f.n2, up);
    if (f.gap < vu() * 0.55 && f.i !== 0 && (f.i2 === 0 || (ny > 0.15) !== (ny2 > 0.15))) c = R[L > 0 ? 7 : 4]; // table rim & girdle line
    else if (f.i === 0) {
      // the table: bright window, a diagonal reflection band and a hot corner
      const g = (f.q[0] - f.q[2]) / 9;
      c = g < -0.62 ? R[8] : Math.abs(g - 0.1) < 0.13 ? R[4] : R[g > 0.45 ? 5 : 6];
    } else if (ny > 0.15) c = tone(R, L * 0.7 + alt * 0.9, 2, 5, h, 0.04); // crown
    else if (ny > -0.2) c = R[2]; // girdle
    else c = spec(f.n, 5) > 0.55 ? R[6] : tone(R, L * 0.6 + alt * 1.2, 1, 5, h, 0.04); // pavilion: deep, with refractions
    return glow(c);
  };
}
STYLES.gem = (S, m) => {
  const cut = GEM_CUT[m.id] || 'oval';
  const R = ['oval', 'pear', 'step', 'kite', 'brilliant'].includes(cut) ? gemRamp(m.id === 'diamond' ? '#b8e8ff' : m.color) : ramp(m.color, 7, 1.3);
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
      // a trapped beetle seen through the resin: shell, head, six legs
      const fv = dot(n, [0.5, 0.45, 0.74]);
      if (fv > 0.45) {
        const u = x * 0.85 - z * 0.5 + 1.5, v = y - 10.5;
        const body = (u * u) / 7 + (v * v) / 3.2 < 1, head = (u - 3.4) ** 2 + v * v < 1.4;
        const leg = [-1.4, 0, 1.4].some((k) => Math.abs(u - k) < 0.45 && Math.abs(v) > 1.4 && Math.abs(v) < 3.2);
        if (body || head || leg) return glow(body && Math.abs(v) < 0.3 ? D[3] : D[2]);
      }
      return glow(tone(R, lit(n) * 0.6 - (1 - clamp01(fv)) * 0.5, 1, 5, h));
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
  S.add(F, gemPaint(R, F, B[1]));
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
    const Br = ramp('#c87a1a', 7, 1.1);
    pile.forEach(([x, y, z, a, b, c], i) => {
      const F = poly([x, y, z], rockPlanes(10, rng(i + 11), 0.2, 0.55), [a, b, c], null, 0.3, 0.5, i);
      S.add(F, (x2, y2, z2, n, h) => { const f = F.facet(x2, y2, z2); if (f.gap < vu() * 0.8 && lit(f.n) > 0) return M[5]; if (n3(x2, y2, z2, 0.5, 2) > 0.66) return tone(Br, lit(f.n), 1, 4, h); return tone(M, lit(f.n) * 0.95, 1, 5, h, 0.1); });
    });
    const rr = rng(9);
    for (let i = 0; i < 9; i++) { const p = pile[i % pile.length]; const d = norm([rr() - 0.5, 0.8, rr() - 0.3]); prism(S, add3([p[0], p[1], p[2]], d, p[3] * 0.6), d, 0.9, 2.6 + rr() * 2, M, { sides: 4, glow: false, streak: false }); }
    return;
  }
  const Mx = id === 'silver' ? ramp('#a8b8d0', 7, 1.2) : id === 'tin' ? ramp('#9aa2ae', 7, 1.0) : id === 'gold' ? ramp('#f8b830', 7, 1.25) : M;
  pile.forEach(([x, y, z, a, b, c], i) => {
    const f = noisy(ell([x, y, z], [a * 0.92, b * 0.92, c * 0.92]), Math.min(a, b) * 0.13, 0.36, i * 13 + id.length);
    S.add(f, (x2, y2, z2, n, h) => (n3(x2, y2, z2, 0.55, 4) > 0.75 ? Mx[1] : metal(Mx, n, h, { p: 14, st: 0.5 })));
  });
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
    if (o.patina && n3(x, y, z, 0.6, 6) > 0.66) return tone(o.patina, lit(f.n), 2, 5, h);
    return metal(M, f.n, h, { st: 0.62, bias: o.bias ?? 1 });
  });
  // the maker's stamp, sunk into the top face
  const top = add3(c, B[1], hy);
  const stamp = (u, v) => Math.max(Math.abs(u) - 2.6, Math.abs(v) - 1.3);
  S.cut(slab(top, [B[0], B[2], B[1]], o.mark || stamp, 0.6, 0, 6), (x, y, z, n, h) => (o.markGlow ? glow(M[4]) : M[2]));
  return F;
}
STYLES.ingot = (S, m) => {
  const M = ramp(m.id === 'mithril' ? '#3a98d8' : m.color, 7, 1.2);
  const patina = m.id === 'bronze_ancient' ? ramp(m.color2, 7, 1.1) : null;
  const rune = (u, v) => Math.min(Math.hypot(u, v) - 1.5 > 0 ? Math.abs(Math.hypot(u, v) - 1.6) - 0.45 : 9, Math.max(Math.abs(u) - 0.45, Math.abs(v) - 1.6));
  const o = { patina, mark: m.id === 'mithril' ? rune : null, markGlow: m.id === 'mithril', edge: m.id === 'mithril' ? glow(M[5]) : undefined, bias: m.id === 'mithril' ? 0 : 1 };
  ingot(S, [-0.4, 2.6, -4.8], rotB(0, 0.04, 0), M, o);
  ingot(S, [0.6, 2.6, 4.8], rotB(0, -0.03, 0), M, o);
  ingot(S, [0, 7.9, 0.2], rotB(0, 0.08, 0), M, o);
};

// ---- meteorite star-iron: pitted, scorched, with trapped stars and burning seams
STYLES.meteor = (S, m) => {
  const R = ramp(ROCK.stariron, 7, 1.25), G = ramp(m.color2, 7, 1.1), V = ramp('#8a6aff', 7, 1.25);
  const c = [0, 12, 0];
  const F = boulder(S, c, [12.5, 12, 11.5], 77, R, { n: 20, rough: 0.08, amp: 0.7, base: 0.8 });
  const base = rockPaint(R, F, { crack: false });
  S.parts[S.parts.length - 1].paint = (x, y, z, n, h) => {
    const v = Math.abs(n3(x, y, z, 0.13, 12) - 0.5);
    if (v < 0.018) return glow(G[4]);
    if (v < 0.034) return glow(V[3]);
    if (h > 0.975) return glow(h > 0.992 ? G[6] : V[5]);
    return base(x, y, z, n, h);
  };
  // impact craters
  for (const [d, r] of [[[0.45, 0.6, 0.66], 3.6], [[-0.55, 0.35, 0.75], 2.8], [[0.8, -0.1, 0.55], 2.4], [[-0.1, 0.95, 0.2], 2.6], [[0.1, 0.1, 1], 2.0]]) {
    const dir = norm(d);
    S.cut(sphere(add3(c, dir, 11.6), r), (x, y, z, n, h) => (h > 0.93 ? glow(V[4]) : tone(R, lit(n) * 0.7 - 0.35, 0, 3, h)));
  }
};

// ---- shards: tall glassy blades of obsidian, prism glass, void crystal
function shardPaint(id, R, E, F, len) {
  return (x, y, z, n, h) => {
    const f = F.facet(x, y, z), L = lit(f.n), along = clamp01(f.q[1] / len);
    if (id === 'prism') {
      const P = ramp(['#ff8ae8', '#7ae8ff', '#fff07a', '#8affa8', '#b89aff'][f.i % 5], 7, 1.35);
      if (f.gap < vu() * 0.85) return glow(P[L > 0 ? 6 : 4]);
      return glow(tone(P, L * 0.9 + along * 0.5 - 0.2, 0, 4, h, 0.08));
    }
    if (id === 'voidcrystal') {
      if (f.gap < vu() * 0.85) return glow(E[L > 0 ? 5 : 3]);
      if (h > 0.975) return glow(E[h > 0.992 ? 6 : 4]);
      return glow(tone(R, L * 0.6 + along * 0.5 - 0.3, 0, 3, h));
    }
    // obsidian: black glass, violet sheen on conchoidal ripples, razor bright edges
    if (f.gap < vu() * 0.85) return L > -0.1 ? E[5] : E[2];
    if (spec(f.n, 10) > 0.55 || (Math.sin((f.q[1] * 1.3 + f.q[0]) * 2.4) > 0.86 && L > 0.1)) return E[3];
    return tone(R, L * 0.9, 0, 4, h, 0.08);
  };
}
STYLES.shard = (S, m) => {
  const id = m.id;
  const R = ramp(m.color, 7, 1.2), E = ramp(m.color2, 7, 1.2);
  boulder(S, [0, 2.5, 0], [9.5, 3.5, 8.5], 61, ramp('#4a4458', 7, 1), { n: 11, base: 0.5 });
  [[0, 1, 0, 0.12, 1, 0.05, 3.8, 27, 4], [-5, 1.5, 3, -0.55, 1, 0.3, 2.7, 16, 5], [5.5, 1.5, 2, 0.6, 1, 0.1, 2.5, 14, 4], [1, 2, 6, 0.1, 0.7, 1, 1.9, 9, 3], [-3, 2, -4, -0.3, 1, -0.6, 1.8, 10, 4]]
    .forEach(([x, y, z, dx, dy, dz, r, L, sides], i) => prism(S, [x, y, z], [dx, dy, dz], r, L, R, { sides, tip: 2.4, rot: i * 1.3, paint: (F) => shardPaint(id, R, E, F, L / r) }));
};

// ---- mushrooms sprouting from a mossy clod
function spots(x, y, z, s, dens, seed, rf = 0.3) {
  const cx = Math.floor(x / s), cy = Math.floor(y / s), cz = Math.floor(z / s);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const a = cx + i, b = cy + j, c = cz + k;
    if (hash3(a, b, c, seed) > dens) continue;
    const px = (a + hash3(a, b, c, seed + 1)) * s, py = (b + hash3(a, b, c, seed + 2)) * s, pz = (c + hash3(a, b, c, seed + 3)) * s;
    const r = s * (rf + 0.15 * hash3(a, b, c, seed + 4));
    if ((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 < r * r) return true;
  }
  return false;
}
STYLES.mushroom = (S, m) => {
  const glowy = m.id === 'glowcap';
  const Cp = ramp(m.color, 7, 1.25), St = ramp(glowy ? '#c8f0e0' : '#f0e2c8', 7, 0.9), Sp = ramp(glowy ? '#e8fff8' : m.color2, 7, 0.9), Gi = ramp(glowy ? m.color2 : '#c8a888', 7, 1);
  const soil = ramp('#6a5040', 7, 1.05), moss = ramp('#5a9a3a', 7, 1.2);
  boulder(S, [0, 2.6, 0], [12, 3.6, 10], 23, soil, { n: 12, base: 0.5, paint: (F) => { const rp = rockPaint(soil, F); return (x, y, z, n, h) => (n[1] > 0.45 && n3(x, y, z, 0.3, 2) > 0.38 ? tone(moss, lit(n) * 0.8 + (h - 0.5) * 0.5, 1, 4, h) : rp(x, y, z, n, h)); } });
  const shrooms = [[0, 0, 7.8, 19, 0.12], [-7.5, 3, 4.8, 11.5, -0.35], [6.5, 4, 3.8, 8.5, 0.4]];
  shrooms.forEach(([x, z, r, hgt, lean], i) => {
    const tx = x + lean * hgt * 0.45;
    const g = (c) => (glowy ? glow(c) : c);
    S.add(tube([[x, 3, z], [x + lean * hgt * 0.2, hgt * 0.5, z], [tx, hgt - r * 0.1, z]], [r * 0.3, r * 0.24, r * 0.21]), (x2, y2, z2, n, h) => g(tone(St, lit(n) * 0.8 + (y2 / hgt - 0.6) * 0.5, 1, 4, h)));
    const E = ell([tx, hgt, z], [r, r * 0.66, r]);
    const y0 = hgt - r * 0.18;
    S.add(Object.assign((x2, y2, z2) => Math.max(E(x2, y2, z2), y0 - y2), { bb: E.bb }), (x2, y2, z2, n, h) => {
      if (n[1] < -0.6) { const a = Math.atan2(z2 - z, x2 - tx); return g(Math.sin(a * 22) > 0.2 ? Gi[2] : Gi[1]); } // gills
      if (spots(x2, y2, z2, r * 0.42, 0.55, 40 + i, 0.24)) return g(tone(Sp, lit(n) * 0.6, 3, 5, h));
      if (n[1] < -0.1) return g(Cp[1]); // rim underside
      return g(tone(Cp, lit(n) * 0.9 + (n[1] - 0.4) * 0.4, 1, 5, h));
    });
  });
};

// ---- fossil: an ammonite in a split slab of sandstone
STYLES.fossil = (S, m) => {
  const R = ramp(m.color, 7, 1.0), D = ramp(m.color2, 7, 1.1);
  const B = rotB(-0.3, 0.2, 0.06);
  const F = poly([0, 12, 0], [...rockPlanes(10, rng(5), 0.1, 0), { n: [0, 0, 1], o: 0.3 }, { n: [0, 0, -1], o: 0.3 }, { n: [0, -1, 0], o: 0.85 }], [13, 12, 12], B, 0.3, 0.4, 2);
  S.add(F, rockPaint(R, F));
  const front = add3([0, 12, 0], B[2], 12 * 0.3 - 0.4);
  const turns = 4.4 * Math.PI, b = Math.log(8.5) / turns;
  const pts = curve((t) => { const a = t * turns, r = 0.9 * Math.exp(b * a); return add3(add3(front, B[0], Math.cos(a) * r), B[1], Math.sin(a) * r); }, 44);
  const T = tube(pts, pts.map((_, i) => 0.45 + (i / 44) * 2.1));
  S.add(T, (x, y, z, n, h) => { const t = T.param(x, y, z); const rib = Math.sin(t * 110) > 0.1; return tone(D, lit(n) * 0.9 + (rib ? 0.3 : -0.35), 1, 5, h); });
};

// ---- runestone: a standing stone with a carved, glowing rune
STYLES.rune = (S, m) => {
  const R = ramp(m.color, 7, 1.05), G = ramp(m.color2, 7, 1.25), Mo = ramp('#6aa04a', 7, 1.1);
  const B = rotB(-0.12, 0.3, 0.05);
  const F = poly([0, 13, 0], [...rockPlanes(12, rng(8), 0.08, 0), { n: [0, -1, 0], o: 1 }, { n: [0, 0, 1], o: 0.45 }, { n: [0, 0, -1], o: 0.45 }], [9, 13, 9], B, 0.25, 0.4, 4);
  const rp = rockPaint(R, F);
  S.add(F, (x, y, z, n, h) => (n[1] > 0.3 && n3(x, y, z, 0.35, 7) > 0.55 ? tone(Mo, lit(n), 1, 4, h) : rp(x, y, z, n, h)));
  const face = add3([0, 13, 0], B[2], 9 * 0.45);
  const glyph = d2union(d2seg(0, -8, 0, 8, 0.75), d2seg(0, 3.5, 3.8, 7, 0.7), d2seg(0, 3.5, -3.8, 7, 0.7), d2seg(0, -1.5, 3.8, -5, 0.7), d2seg(0, -1.5, -3.8, 1.8, 0.7));
  S.cut(slab(face, B, glyph, 1.0, 0, 12), (x, y, z, n, h) => glow(dot(n, B[2]) > 0.5 ? G[4] : G[3]));
};

// ---- geode (2×2): a split stone egg lined with glowing crystal
STYLES.geode = (S, m) => {
  const R = ramp(ROCK.geode, 7, 1.0), A = ramp(m.color2, 7, 1.3), W = ramp('#f0e8f8', 7, 0.7), Ag = ramp('#9a7ab8', 7, 1.1);
  const c = [0, 12, 0], cutDir = norm([0.82, 0.5, 0.28]), P0 = 2.6;
  const shell = noisy(ell(c, [13, 12, 12]), 0.8, 0.3, 3);
  const cav = noisy(ell(c, [8.6, 8, 8]), 0.9, 0.5, 9);
  const body = Object.assign((x, y, z) => Math.max(shell(x, y, z), -cav(x, y, z), dot([x - c[0], y - c[1], z - c[2]], cutDir) - P0), { bb: shell.bb });
  S.add(body, (x, y, z, n, h) => {
    const dp = dot([x - c[0], y - c[1], z - c[2]], cutDir) - P0, dc = cav(x, y, z), ds = shell(x, y, z);
    if (-dc >= dp && -dc >= ds) {
      // crystal lining: little glowing points
      const cell = hash3(Math.floor(x / 1.7), Math.floor(y / 1.7), Math.floor(z / 1.7), 3);
      return glow(tone(A, lit(n) * 0.3 + cell * 1.2 - 0.5, 1, 5, h, 0.05));
    }
    if (dp >= ds) {
      // the cut face: agate bands from the crust in to the cavity
      const depth = -ds, toCav = dc;
      if (depth < 1.4) return tone(R, 0.1, 1, 4, h);
      if (toCav < 1.1) return A[4];
      const band = Math.sin(toCav * 2.4 + n3(x, y, z, 0.4, 2) * 2);
      return band > 0.35 ? W[4] : band > -0.3 ? Ag[3] : W[3];
    }
    return tone(R, lit(n) * 0.8 + (n3(x, y, z, 0.5, 6) - 0.5) * 0.5, 1, 4, h);
  });
  // a few big points reaching out of the hollow
  // a few big points reaching out of the hollow toward the opening
  const back = cutDir.map((v) => -v), [, bu, bw] = basis(back);
  [[0, 0, 1.8, 6], [0.5, 0.3, 1.4, 4.8], [-0.45, 0.35, 1.3, 4.4], [0.3, -0.5, 1.2, 4], [-0.4, -0.45, 1.1, 3.6]].forEach(([a, b, r, L], i) => {
    const dir = norm(add3(add3(back, bu, a), bw, b));
    prism(S, add3(c, dir, 7.4), dir.map((v) => -v), r, L, A, { rot: i, sides: 6 });
  });
};

// ---- monster fangs
function fangTube(S, base, dir, side, len, r0, I, G, o = {}) {
  const pts = curve((t) => add3(add3(base, dir, t * len), side, Math.sin(t * 1.6) * len * (o.curl ?? 0.22)), 10);
  const T = tube(pts, pts.map((_, i) => { const t = i / 10; return r0 * Math.pow(1 - t, o.pow ?? 0.8) + 0.25; }));
  S.add(T, (x, y, z, n, h) => {
    const t = T.param(x, y, z);
    if (spec(n, 18) > 0.5) return I[6];
    if (o.enamel && t > 0.3 && dot(n, o.face) > 0.72) return tone(o.enamel, lit(n), 2, 5, h);
    if (o.tipGlow && t > 0.55 && Math.abs(n3(x, y, z, 0.6, 3) - 0.5) < 0.06) return glow(o.tipGlow[4]);
    return tone(I, lit(n) * 0.9 + (t - 0.4) * 0.5 - (t < 0.12 ? 0.4 : 0), 1, 5, h);
  });
  return pts;
}
STYLES.fang = (S, m) => {
  const id = m.id;
  const I = ramp(m.color, 7, 1.0), G = ramp(id === 'bat_fang' ? '#c84a5a' : id === 'hound_fang' ? '#6a4a7a' : '#d88a8a', 7, 1.1);
  const gum = (x, y, z, n, h) => tone(G, lit(n) * 0.8 + (n3(x, y, z, 0.9, 2) - 0.5) * 0.5, 1, 5, h);
  if (id === 'rat_tooth') {
    // a long curved incisor, orange enamel on the front, chisel tip, pink root
    fangTube(S, [0, 3, 0], norm([0.2, 1, 0.05]), [1, 0, 0], 22, 3.0, I, G, { curl: 0.3, pow: 0.25, enamel: ramp('#ffa030', 7, 1.2), face: norm([0.6, 0.1, 0.8]) });
    S.cut(box([7.5, 25.5, 0], [3, 2, 4], 0, rotB(0, 0, 0.75)), I[5]);
    S.add(noisy(ell([0, 3, 0], [4.6, 3.4, 4]), 0.5, 0.6, 2), gum);
    return;
  }
  if (id === 'bat_fang') {
    // a pair of needle fangs in a scrap of gum, beaded with blood
    S.add(noisy(ell([0, 20, 0], [11, 3.6, 4.4]), 0.5, 0.6, 2), gum);
    for (const s2 of [-1, 1]) fangTube(S, [s2 * 5.5, 18, 0.5], norm([s2 * 0.12, -1, 0.15]), [-s2, 0, 0], 17, 2.5, I, G, { curl: 0.12, pow: 0.9 });
    for (const [x, y, z] of [[-6.4, 7, 2.4], [5.2, 4.5, 2.2]]) S.add(ell([x, y, z], [0.9, 1.4, 0.8]), (x2, y2, z2, n, h) => (spec(n, 10) > 0.5 ? C('#ffd0d8') : ramp('#e0283a', 7, 1.2)[3]));
    for (let i = -2; i <= 2; i++) S.add(cap([i * 1.8, 18, 2.6], [i * 1.8 + 0.3, 15.5, 2.8], 0.8, 0.2), I[4]); // little teeth between
    return;
  }
  // hound fang: a big curved canine with a cursed violet seam
  fangTube(S, [-3, 3, 0], norm([0.25, 1, 0.1]), [1, 0, 0], 26, 4.6, I, G, { curl: 0.28, tipGlow: ramp(m.color2, 7, 1.3) });
  S.add(noisy(ell([-3, 3.2, 0], [5.6, 3.4, 5]), 0.6, 0.6, 2), gum);
  S.add(tube(curve((t) => [-1.5 + t * 7, 7 + t * 14, 3.6 - t * 1.8], 6), [0.7, 0.65, 0.55, 0.45, 0.35, 0.25, 0.2]), glow(ramp(m.color2, 7, 1.3)[4]));
};

// ---- rat tail (2×1): ringed, tapering, with a furry stump
STYLES.tail = (S, m) => {
  const R = ramp(m.color, 7, 1.1), Fur = ramp('#8a7a7a', 7, 0.9);
  const pts = curve((t) => { const a = t * Math.PI * 1.25; return [-22 + t * 40 + (t > 0.75 ? -Math.sin((t - 0.75) * 12) * 3 : 0), 7 + Math.sin(a) * 5 + (t > 0.75 ? (t - 0.75) * 18 : 0), Math.cos(t * 4) * 2]; }, 28);
  const T = tube(pts, pts.map((_, i) => 3.1 * Math.pow(1 - i / 28, 0.9) + 0.35));
  S.add(T, (x, y, z, n, h) => { const t = T.param(x, y, z); const ring = Math.sin(t * 150) > 0.45; return tone(R, lit(n) * 0.9 + (ring ? -0.45 : 0.08), 1, 5, h); });
  S.add(noisy(ell([-23, 7, 0], [4.4, 4.8, 4.6]), 1.3, 0.8, 3), (x, y, z, n, h) => tone(Fur, lit(n) * 0.8 + (n3(x, y, z, 1.4, 2) - 0.5) * 1.2, 1, 5, h), { k: 1.5 });
};

// ---- bat wing (2×1): finger bones and a scalloped membrane
STYLES.wing = (S, m) => {
  const Mb = ramp(m.color, 7, 1.2), Bo = ramp(m.color2, 7, 1.1), Cl = ramp('#ece0cc', 7, 0.9);
  const B = rotB(-0.35, 0.15, 0), O = [0, 10, 0];
  const P3 = (u, v, w = 0) => add3(add3(add3(O, B[0], u), B[1], v), B[2], w);
  const wr = [-6, 12];
  const tips = [[25, 15], [23, 1], [14, -9], [1, -11]];
  const outline = [[-22, 5], wr, ...tips, [-14, -4]];
  const scal = [];
  const ring = [...tips, [-14, -4]];
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
    const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    scal.push(d2circle(mx - dy * 0.62, my + dx * 0.62, l * 0.7)); // bite out between fingers
  }
  const memb = (u, v) => { let d = d2poly(outline)(u, v); for (const f of scal) d = Math.max(d, -f(u, v)); return d; };
  S.add(slab(O, B, memb, 0.6, 0, 32), (x, y, z, n, h) => {
    const q = [x - O[0], y - O[1], z - O[2]], u = dot(q, B[0]), v = dot(q, B[1]);
    const vein = Math.abs(n3(u, v, 0, 0.22, 5) - 0.5) < 0.03;
    const near = Math.min(...tips.map(([tx, ty]) => { const ex = tx - wr[0], ey = ty - wr[1], t = clamp01(((u - wr[0]) * ex + (v - wr[1]) * ey) / (ex * ex + ey * ey)); return Math.hypot(u - wr[0] - ex * t, v - wr[1] - ey * t); }));
    return tone(Mb, lit(n) * 0.5 + (near < 2.5 ? 0.35 : 0) + (vein ? -0.5 : 0) - 0.1, 0, 4, h);
  });
  const bone = (x, y, z, n, h) => tone(Bo, lit(n) * 0.9, 1, 5, h);
  S.add(tube([P3(-22, 5, 0.5), P3(-14, 9, 1), P3(...wr, 1)], [2.2, 1.6, 1.4]), bone);
  for (const [tx, ty] of tips) S.add(tube([P3(...wr, 1), P3(wr[0] + (tx - wr[0]) * 0.5, wr[1] + (ty - wr[1]) * 0.5 + 1, 0.8), P3(tx, ty, 0.3)], [1.2, 0.85, 0.35]), bone);
  S.add(tube([P3(wr[0], wr[1], 1), P3(wr[0] - 1, wr[1] + 4, 1.2), P3(wr[0] + 1.5, wr[1] + 6.5, 1)], [1.1, 0.7, 0.2]), (x, y, z, n, h) => tone(Cl, lit(n), 2, 5, h)); // thumb claw
};

// ---- gel: a glossy jiggling blob (slime) or a ghostly ectoplasm
STYLES.gel = (S, m) => {
  const ecto = m.id === 'ectoplasm';
  const R = ramp(m.color, 7, 1.25), Q = ramp(m.color2, 7, 1.15);
  const g = (c) => (ecto ? glow(c) : c);
  const blob = (x, y, z, n, h) => {
    if (spec(n, 9) > 0.55) return g(R[6]);
    if (spots(x, y, z, 3.4, 0.5, 7, 0.22)) return g(R[5]); // bubbles inside
    const rim = 1 - clamp01(dot(n, [0.5, 0.45, 0.74]));
    if (rim > 0.82 && lit(n) > -0.2) return g(Q[4]); // fresnel rim
    return g(tone(R, lit(n) * 0.7 + 0.1, 1, 4, h));
  };
  const flat = (f) => Object.assign((x, y, z) => Math.max(f(x, y, z), 0.4 - y), { bb: f.bb });
  S.add(flat(ell([0, 6.5, 0], [11, 9, 10])), blob);
  S.add(flat(sphere([-7, 3.4, 5], 4.6)), blob, { k: 3.5 });
  S.add(flat(sphere([7.5, 2.8, 4], 3.8)), blob, { k: 3 });
  S.add(flat(sphere([2, 1.8, 10], 2.6)), blob, { k: 2.5 });
  S.add(sphere([-3, 15, 2], 2.4), blob, { k: 3.5 }); // jiggly top
  if (ecto) for (const [x, z, s] of [[-4, 2, 1], [3, -2, -1]]) S.add(tube(curve((t) => [x + Math.sin(t * 5) * 2 * s, 14 + t * 11, z + Math.cos(t * 4)], 8), [1.6, 1.4, 1.2, 1, 0.8, 0.6, 0.45, 0.3, 0.2]), (x2, y2, z2, n, h) => glow(tone(Q, lit(n) * 0.5 + 0.3, 2, 5, h)));
};

// ---- shells (2×2)
STYLES.shell = (S, m) => {
  const R = ramp(m.color, 7, 1.2), Q = ramp(m.color2, 7, 1.15);
  if (m.id === 'snail_shell') {
    // a fat spiral whorl
    const turns = 3.4 * Math.PI, b = Math.log(9) / turns;
    const rr = (t) => 1.25 * Math.exp(b * t * turns);
    const pts = curve((t) => { const a = t * turns, r = rr(t); return [Math.cos(a) * r, 12 + Math.sin(a) * r, (1 - t) * 6]; }, 48);
    const T = tube(pts, pts.map((_, i) => rr(i / 48) * 0.5 + 0.35));
    S.add(T, (x, y, z, n, h) => {
      const t = T.param(x, y, z);
      if (spec(n, 18) > 0.6) return R[6];
      const band = Math.sin(t * 34) > 0.25, growth = Math.sin(t * 260) > 0.75;
      return tone(band ? Q : R, lit(n) * 0.85 + (growth ? -0.3 : 0), 1, 5, h);
    });
    S.cut(ell(add3(pts[48], [0, 0, 3.5]), [4, 4.6, 3]), (x, y, z, n, h) => tone(ramp('#f0c8b0'), lit(n) * 0.6 - 0.2, 1, 4, h)); // aperture
    return;
  }
  if (m.id === 'crab_shell') {
    const flat = (f) => Object.assign((x, y, z) => Math.max(f(x, y, z), 1 - y), { bb: f.bb });
    S.add(flat(ell([0, 1, 0], [14, 7.5, 10.5])), (x, y, z, n, h) => {
      if (spots(x, y, z, 3.2, 0.45, 11, 0.28) && n[1] > 0.2) return glow(tone(Q, lit(n), 2, 5, h)); // crystal studs
      return tone(R, lit(n) * 0.9 + (spots(x, y, z, 1.6, 0.4, 3, 0.25) ? -0.4 : 0), 1, 5, h);
    });
    for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45, p = [Math.sin(a) * 13.5, 3.2, Math.cos(a) * 9.6]; S.add(cap(p, add3(p, norm([Math.sin(a), 0.4, Math.cos(a)]), 3.4), 1.4, 0.2), (x, y, z, n, h) => tone(R, lit(n), 2, 5, h)); } // rim spikes
    for (const s of [-1, 1]) {
      // big raised pincers and spindly legs
      S.add(tube([[s * 8, 2.5, 8], [s * 13, 6, 12], [s * 13.5, 8, 15]], [1.8, 1.9, 2.2]), smooth(R));
      S.add(ell([s * 13.5, 9, 17.5], [3.4, 3, 4.4]), (x, y, z, n, h) => (spec(n, 14) > 0.5 ? R[6] : tone(R, lit(n) * 0.9, 1, 5, h)));
      S.add(cap([s * 13, 11, 19.5], [s * 11, 13, 24], 1.6, 0.35), smooth(R, 2, 5));
      S.add(cap([s * 14.5, 8.5, 20.5], [s * 13.5, 9.5, 24.5], 1.3, 0.3), smooth(R, 1, 4));
      for (let k = 0; k < 3; k++) S.add(tube([[s * 11, 1.5, 3 - k * 4], [s * 16, 4, 4 - k * 5], [s * 19, 0, 4.5 - k * 6]], [0.9, 0.8, 0.4]), smooth(R, 1, 4));
    }
    for (const s of [-1, 1]) S.add(tube([[s * 3, 6, 8], [s * 3.6, 9, 10]], [0.7, 0.9]), (x, y, z, n, h) => (y > 9.2 ? C('#1a1424') : R[3])); // eye stalks
    return;
  }
  // beetle elytra: an oil-slick dome split down the seam, pronotum and head pointing right
  const flat = (f) => Object.assign((x, y, z) => Math.max(f(x, y, z), 0.6 - y), { bb: f.bb });
  const P2 = ramp('#8a5ad0', 7, 1.2);
  const sheen = (x, y, z, n, h) => {
    if (spec(n, 14) > 0.5) return C('#f0f8ff');
    const t = dot(n, [0.5, 0.45, 0.74]), ridge = Math.abs(((Math.abs(z) * 0.8) % 2) - 1) < 0.22;
    const Rr = t > 0.72 ? Q : t > 0.45 ? R : P2;
    return tone(Rr, lit(n) * 0.7 + (ridge ? -0.45 : 0.1), 1, 5, h);
  };
  S.add(flat(ell([-3, 1, 0], [13.5, 7.5, 10])), sheen);
  S.cut(box([-3, 7, 0], [14, 4, 0.35]), R[0]);
  S.cut(box([-15.5, 6, 0], [1.2, 6, 0.9]), R[0]); // the split at the tail
  S.add(flat(ell([11, 1, 0], [4.6, 5.4, 7.6])), (x, y, z, n, h) => (spec(n, 14) > 0.5 ? C('#f0f8ff') : tone(R, lit(n) * 0.9, 1, 5, h))); // pronotum
  S.add(flat(ell([16, 1, 0], [2.8, 3.2, 3.8])), (x, y, z, n, h) => tone(R, lit(n) * 0.8 - 0.2, 0, 4, h)); // head
  for (const s2 of [-1, 1]) {
    S.add(tube([[17.5, 2.6, s2 * 2.2], [20, 4.5, s2 * 3.6], [22, 5, s2 * 5.5]], [0.5, 0.4, 0.3]), R[1]); // antennae
    for (let k = 0; k < 3; k++) S.add(tube([[6 - k * 7, 1.6, s2 * 8], [7 - k * 7, 1, s2 * 12], [8.5 - k * 7.5, 0.3, s2 * 13.5]], [0.7, 0.6, 0.4]), R[1]); // legs
  }
};

// ---- claws: insect mandible, crystal talon, mole digger
STYLES.claw = (S, m) => {
  const R = ramp(m.color, 7, 1.15), Q = ramp(m.color2, 7, 1.1);
  if (m.id === 'mole_claw') {
    S.add(noisy(ell([-3, 8, 0], [8, 6.5, 5]), 1.2, 0.8, 4), (x, y, z, n, h) => tone(R, lit(n) * 0.7 + (n3(x, y, z, 1.6, 3) - 0.5), 1, 5, h)); // furry palm
    S.add(ell([1, 7, 3.2], [5, 4, 2]), ramp('#e0a0a0', 7, 1)[3]); // pink palm pad
    for (let i = 0; i < 5; i++) {
      const a = -0.75 + i * 0.37, b = [Math.cos(a) * 7.5 + 1, 8 + Math.sin(a) * 7.5, 1.5];
      const pts = curve((t) => [b[0] + Math.cos(a) * t * 10, b[1] + Math.sin(a) * t * 10 - t * t * 4, b[2] + t * 3], 6);
      const T = tube(pts, [1.8, 1.7, 1.5, 1.2, 0.9, 0.5, 0.15]);
      S.add(T, (x, y, z, n, h) => (spec(n, 16) > 0.6 ? Q[6] : tone(Q, lit(n) * 0.9 + T.param(x, y, z) * 0.4 - 0.2, 1, 5, h)));
    }
    return;
  }
  const crystal = m.id === 'crystal_claw';
  const pts = curve((t) => { const a = t * 2.3; return [-10 + Math.sin(a) * 15, 3 + (1 - Math.cos(a)) * 11, 0]; }, 14);
  const T = tube(pts, pts.map((_, i) => 4.2 * Math.pow(1 - i / 14, 0.75) + 0.25));
  S.add(T, (x, y, z, n, h) => {
    const t = T.param(x, y, z);
    if (spec(n, 16) > 0.55) return crystal ? glow(Q[6]) : Q[6];
    const c = tone(t > 0.7 ? Q : R, lit(n) * 0.9 + (Math.sin(t * 40) > 0.85 ? -0.4 : 0), 1, 5, h);
    return crystal ? glow(c) : c;
  });
  if (!crystal) {
    // serrated inner edge
    for (let i = 3; i < 12; i += 2) { const p = pts[i], q = pts[i + 1], d = norm([q[1] - p[1], -(q[0] - p[0]), 0]); S.add(cap(p, add3(p, d, -2.4 - (i % 3)), 0.9, 0.15), (x, y, z, n, h) => tone(Q, lit(n), 2, 5, h)); }
    S.add(sphere([-10, 3, 0], 4.6), (x, y, z, n, h) => tone(R, lit(n) * 0.8 - 0.1, 0, 4, h)); // joint
  } else {
    S.add(noisy(sphere([-10, 3, 0], 4.8), 0.6, 0.6, 3), smooth(ramp('#5a6a8a', 7, 1), 1, 4));
    [[3, 0.25, [0.3, 1, 0.4], 1.6, 6], [6, 0.4, [0.8, 0.8, 0.5], 1.3, 5], [9, 0.55, [1, 0.3, 0.6], 1.1, 4], [5, 0.3, [-0.3, 1, -0.6], 1.2, 4.5]].forEach(([i, , d, r, L], k) => prism(S, pts[i], d, r, L, Q, { rot: k }));
  }
};

// ---- spider silk: a wound cocoon on a twig, loose strands
STYLES.silk = (S, m) => {
  const R = ramp('#f4f0ff', 7, 0.8), Q = ramp('#c8c4e0', 7, 0.9);
  S.add(tube([[-14, 22, -1], [0, 21, 0], [13, 23.5, 1]], [1.4, 1.5, 1.1]), (x, y, z, n, h) => tone(ramp('#7a5a3a', 7, 1), lit(n) + (h - 0.5) * 0.4, 1, 5, h)); // twig
  S.add(noisy(ell([0, 11.5, 0], [8, 10.5, 7.5]), 0.5, 0.6, 2), (x, y, z, n, h) => {
    const a = Math.sin(x * 1.1 + y * 0.8) > 0.6, b = Math.sin(-x * 0.9 + y * 1.2 + z * 0.4) > 0.65;
    if (spec(n, 14) > 0.6) return R[6];
    return tone(a || b ? R : Q, lit(n) * 0.8 + (a && b ? 0.3 : 0), 1, 5, h);
  });
  S.add(tube([[-9, 21.5, -0.5], [-6, 17, 1], [-4, 14, 3]], [0.4, 0.35, 0.3]), R[5]); // a stray strand
  S.add(tube([[2, 1.5, 3], [3, -1.5, 3.5], [2.6, -4, 3]], [0.5, 0.4, 0.3]), R[4]); // dangling thread
};

// ---- sacs and glands: veined skin over glowing fluid
STYLES.sac = (S, m) => {
  const id = m.id;
  const R = ramp(m.color, 7, 1.2), Q = ramp(m.color2, 7, 1.25), V = ramp(m.color, 7, 1.3);
  const body = noisy(ell([0, 9.5, 0], [9, 9.5, 8.5]), 0.5, 0.35, 5);
  S.add(body, (x, y, z, n, h) => {
    const vein = Math.abs(n3(x, y, z, 0.3, 4) - 0.5) < 0.028;
    if (vein) return V[1];
    if (spec(n, 14) > 0.55) return R[6];
    if (id === 'spore_sac' && spots(x, y, z, 2.4, 0.5, 5, 0.22)) return R[1]; // pores
    const level = 8 + Math.sin(x * 0.5) * 0.8;
    if (y < level && id !== 'spore_sac') return glow(tone(Q, lit(n) * 0.5 + (y - level) * 0.05, 2, 5, h)); // glowing fluid behind thin skin
    return tone(R, lit(n) * 0.85, 1, 5, h);
  });
  S.add(tube([[0, 17, 0], [1, 20.5, 0.5], [2.4, 23, 0]], [3.2, 1.9, 1.5]), (x, y, z, n, h) => tone(R, lit(n) * 0.8 - 0.1, 1, 4, h), { k: 2.5 });
  S.add(torus([1.8, 21, 0.2], [0.3, 1, 0.1], 1.9, 0.75), (x, y, z, n, h) => tone(ramp('#8a6a4a'), lit(n), 1, 4, h)); // tied off
  S.add(ell([0.5, 1.4, 6.5], [1.3, 1.7, 1.3]), glow(Q[4])); // a drip
  if (id === 'spore_sac') for (const [x, y, z, r] of [[5, 22, 3, 1.1], [-4, 20, 4, 0.9], [7, 17, 6, 0.8], [-6, 25, 1, 0.7], [2, 26, 4, 0.6]]) S.add(sphere([x, y, z], r), glow(Q[4 + (r > 0.85 ? 1 : 0)]));
  if (id === 'fire_gland') for (const [x, y, z] of [[4, 6, 7], [-5, 9, 7], [1, 12, 8.4]]) S.add(sphere([x, y, z], 1.1), glow(Q[5]));
};

// ---- cores: a rune-cut stone cage around a burning heart (golem), a crusted magma ball (lava)
STYLES.core = (S, m) => {
  const G = ramp(m.id === 'lava_core' ? m.color : m.color, 7, 1.2);
  if (m.id === 'lava_core') {
    const c = [0, 11, 0];
    S.add(noisy(sphere(c, 10.5), 0.9, 0.35, 3), (x, y, z, n, h) => {
      const v = Math.abs(n3(x, y, z, 0.19, 2) - 0.5);
      if (v < 0.05) return glow(v < 0.022 ? G[6] : G[4]);
      return tone(ramp('#4a2a26', 7, 1.1), lit(n) * 0.9 + (v < 0.08 ? 0.5 : 0), 0, 4, h);
    });
    S.add(ell([4, 1.6, 6], [1.3, 2.2, 1.3]), glow(G[5])); // a molten drip
    return;
  }
  const St = ramp(m.color2, 7, 1.05), c = [0, 11, 0];
  const cage = box(c, [9.5, 9.5, 9.5], 1.6, rotB(0.1, 0.55, 0));
  S.add(cage, (x, y, z, n, h) => {
    if (Math.abs(n3(x, y, z, 0.25, 4) - 0.5) < 0.02) return St[1];
    return tone(St, lit(n) * 0.95 + (n3(x, y, z, 0.6, 3) - 0.5) * 0.3, 1, 4, h);
  });
  const Bc = rotB(0.1, 0.55, 0);
  for (const ax of [0, 1, 2]) S.cut(cyl(c, Bc[ax], 5.2, 12), (x, y, z, n, h) => tone(St, lit(n) * 0.6 - 0.3, 0, 3, h));
  // carved glowing runes around the windows
  for (const ax of [0, 1, 2]) for (const sg of [1, -1]) S.cut(torus(add3(c, Bc[ax], sg * 9.6), Bc[ax], 6.8, 0.55), (x, y, z, n, h) => glow(G[4]));
  S.add(sphere(c, 6.4), (x, y, z, n, h) => glow(tone(G, lit(n) * 0.4 + dot(n, [0.5, 0.45, 0.74]) * 0.8 - 0.1, 2, 6, h)), { top: true });
};

// ---- wisp essence: a stoppered flask of living light
STYLES.essence = (S, m) => {
  const G = ramp(m.color, 7, 1.25), Gl = ramp('#dff8ff', 7, 0.6), Co = ramp('#a07048', 7, 1);
  const c = [0, 9.5, 0];
  S.add(sphere(c, 9), (x, y, z, n, h) => {
    if (dot(n, norm([-0.55, 0.6, 0.6])) > 0.86) return Gl[5]; // glass highlight
    if (Math.abs(dot(n, norm([-0.7, 0.2, 0.68])) - 0.62) < 0.05 && n[1] > -0.2) return Gl[4];
    const sw = Math.sin(Math.atan2(z, x) * 3 + y * 0.6) > 0.7;
    return glow(tone(G, (y - c[1]) / 12 + lit(n) * 0.3 + (sw ? 0.5 : 0), 1, 5, h));
  });
  S.add(cyl([0, 20, 0], [0, 1, 0], 3, 3.2, 0.4), (x, y, z, n, h) => tone(Gl, lit(n) * 0.6, 2, 4, h), { k: 1.5 }); // neck
  S.add(torus([0, 22.6, 0], [0, 1, 0], 3.1, 0.9), Gl[4]); // lip
  S.add(cyl([0, 24.5, 0], [0, 1, 0], 2.6, 2.2, 0.6), (x, y, z, n, h) => tone(Co, lit(n), 1, 5, h)); // cork
};

// ---- moth dust: a cinched pouch spilling glittering powder
STYLES.dust = (S, m) => {
  const R = ramp(m.color2, 7, 1.1), D = ramp(m.color, 7, 1.1);
  const sack = (x, y, z, n, h) => (Math.abs(Math.sin(Math.atan2(z + 1, x + 2) * 6 + y * 0.3)) < 0.14 && y > 3 ? R[1] : tone(R, lit(n) * 0.85 + (n3(x, y, z, 0.5, 4) - 0.5) * 0.4, 1, 5, h));
  S.add(noisy(Object.assign((x, y, z) => Math.max(ell([-2, 6.5, -1], [9.5, 7, 8.5])(x, y, z), 0.3 - y), { bb: [-12, 0, -10, 8, 14, 8] }), 0.6, 0.45, 3), sack);
  S.add(cap([-2, 12, -1], [-1, 15.5, 0], 3.6, 1.8), sack, { k: 2.5 });
  S.add(noisy(ell([1.2, 17, 1.2], [3.6, 2, 3.2]), 0.6, 0.9, 2), (x, y, z, n, h) => tone(R, lit(n), 2, 5, h)); // floppy frilled mouth
  S.add(torus([-1.2, 14.6, -0.2], [0.15, 1, 0.1], 2.2, 0.7), ramp('#d8b06a')[3]); // drawstring
  S.add(tube([[0.6, 14.4, 1.6], [2.6, 12, 3.4], [2.2, 9.5, 4.2]], [0.5, 0.45, 0.4]), ramp('#d8b06a')[3]);
  const pile = Object.assign((x, y, z) => Math.max((Math.hypot(x - 9, z - 8) * 0.75 + y - 4.2) * 0.8, -y), { bb: [2, 0, 1, 16, 6, 15] });
  S.add(pile, (x, y, z, n, h) => (h > 0.88 ? glow(h > 0.96 ? C('#ffffff') : D[5]) : tone(D, lit(n) * 0.6 + 0.2, 2, 5, h)));
};

// ---- scales: a big curved plate over smaller ones
STYLES.scale = (S, m) => {
  const R = ramp(m.color, 7, 1.2), Q = ramp(m.color2, 7, 1.2);
  const one = (c, B, s, front) => {
    const shape = d2poly([[0, 13 * s], [8 * s, 9 * s], [9.5 * s, 2 * s], [6 * s, -7 * s], [0, -12 * s], [-6 * s, -7 * s], [-9.5 * s, 2 * s], [-8 * s, 9 * s]]);
    const f = slab(c, B, shape, 1.4 * s, 0.6 * s, 16 * s);
    const curved = Object.assign((x, y, z) => { const q = [x - c[0], y - c[1], z - c[2]], u = dot(q, B[0]); return f(x - B[2][0] * u * u * 0.03 / s, y - B[2][1] * u * u * 0.03 / s, z - B[2][2] * u * u * 0.03 / s); }, { bb: f.bb });
    S.add(curved, (x, y, z, n, h) => {
      const q = [x - c[0], y - c[1], z - c[2]], u = dot(q, B[0]), v = dot(q, B[1]);
      const e = -shape(u, v);
      if (e < 1.4 * s) return front ? glow(Q[4]) : Q[3]; // bright rim
      if (Math.abs(u) < 0.9 * s && v > -8 * s) return tone(R, lit(n) + 0.3, 2, 5, h); // ridge
      const growth = Math.sin(e * 2.2 / s) > 0.6;
      return tone(R, lit(n) * 0.8 + (growth ? -0.3 : 0.05), 1, 5, h);
    });
  };
  one([-6, 13, -3], rotB(-0.35, 0.3, 0.5), 0.7, false);
  one([6, 12, -2], rotB(-0.35, -0.2, -0.45), 0.75, false);
  one([0, 13, 2], rotB(-0.4, 0.15, 0.05), 1, true);
};

// ---- bone (2×1)
STYLES.bone = (S, m) => {
  const R = ramp(m.color, 7, 0.95);
  const paint = (x, y, z, n, h) => (Math.abs(n3(x, y, z, 0.2, 6) - 0.5) < 0.02 ? R[1] : spec(n, 14) > 0.6 ? R[6] : tone(R, lit(n) * 0.9, 1, 5, h));
  S.add(cap([-17, 8, 0], [17, 10, 0], 2.8, 2.5), paint);
  for (const [x, y] of [[-19.5, 11], [-19, 5.6], [19.5, 13], [19.5, 7.5]]) S.add(sphere([x, y, 0], 3.9), paint, { k: 2.4 });
};

// ---- skull
STYLES.skull = (S, m) => {
  const R = ramp(m.color, 7, 0.95), D = ramp(m.color2, 7, 1);
  const paint = (x, y, z, n, h) => (Math.abs(n3(x, y, z, 0.2, 6) - 0.5) < 0.018 ? R[1] : tone(R, lit(n) * 0.9, 1, 5, h));
  S.add(ell([0, 14, -1], [10, 9.5, 10.5]), paint);
  S.add(box([0, 7.5, 4.5], [6.5, 4, 4.8], 2.4), paint, { k: 2.5 }); // maxilla
  for (const s of [-1, 1]) S.add(ell([s * 7, 9.5, 3], [2.6, 2.4, 4]), paint, { k: 2 }); // cheekbones
  const hole = (x, y, z, n, h) => tone(D, -0.4, 0, 2, h);
  for (const s of [-1, 1]) S.cut(ell([s * 4, 12, 8.2], [3, 3.3, 3.2]), hole); // sockets
  S.cut(ell([0, 8.2, 9.6], [1.3, 2, 1.8]), hole); // nose
  for (let i = -3; i <= 3; i++) S.cut(box([i * 1.7, 4.4, 8.4], [0.25, 1.6, 1.2]), hole); // teeth gaps
  S.cut(box([0, 2.6, 6], [7, 0.7, 5]), hole); // mouth line
};

// ---- tongues (2×1): a glossy, curling tongue
STYLES.tongue = (S, m) => {
  const R = ramp(m.color, 7, 1.2), D = ramp(m.color2, 7, 1.15);
  const pts = curve((t) => { const a = t * 1.5; return t < 0.75 ? [-22 + t * 50, 7 + Math.sin(a * 3) * 2.5, 0] : [15.5 + Math.sin((t - 0.75) * 12) * 5, 7 + (1 - Math.cos((t - 0.75) * 12)) * 5, 0]; }, 30);
  const T0 = tube(pts, pts.map((_, i) => 4.2 - (i / 30) * 1.8));
  const flatT = Object.assign((x, y, z) => T0(x, y, z * 1.6), { bb: T0.bb }); // wide and flat
  S.add(flatT, (x, y, z, n, h) => {
    const t = T0.param(x, y, z * 1.6);
    if (t < 0.12) return tone(D, lit(n) * 0.8, 1, 4, h);
    if (spec(n, 10) > 0.6) return R[6];
    if (Math.abs(z) < 0.6 && n[1] > 0.5) return R[2]; // centre groove
    if (m.id === 'mimic_tongue' && spots(x, y, z, 1.8, 0.5, 4, 0.2)) return R[4]; // papillae
    return tone(R, lit(n) * 0.8, 1, 5, h);
  });
  if (m.id === 'toad_tongue') S.add(sphere(pts[30], 3.2), (x, y, z, n, h) => (spec(n, 10) > 0.5 ? R[6] : tone(R, lit(n), 2, 5, h)), { k: 2 }); // sticky tip
};

// ---- mimic teeth: a gnashing lid lip
STYLES.teeth = (S, m) => {
  const W = ramp(m.color2, 7, 1.1), T = ramp(m.color, 7, 0.9), G = ramp('#b83a4a', 7, 1.15);
  S.add(box([0, 16, 0], [13, 3.4, 4.5], 0.8, rotB(0, 0.25, 0)), (x, y, z, n, h) => (Math.abs(((x + 30) % 4.5) - 2.2) < 0.3 ? W[1] : tone(W, lit(n) * 0.9 + (n3(x, y, z, 0.8, 2) - 0.5) * 0.4, 1, 5, h))); // plank
  S.add(box([0, 18.5, 0.2], [13.4, 0.9, 4.8], 0.3, rotB(0, 0.25, 0)), (x, y, z, n, h) => metal(ramp('#d0a040'), n, h)); // iron band
  S.add(box([0, 11.6, 0], [12.5, 1.4, 4], 1.2, rotB(0, 0.25, 0)), (x, y, z, n, h) => tone(G, lit(n), 1, 4, h)); // gum
  const B = rotB(0, 0.25, 0);
  for (let i = 0; i < 7; i++) {
    const u = -10.5 + i * 3.5, len = 5 + ((i * 7) % 3) * 2.2;
    const base = add3(add3([0, 11, 0], B[0], u), B[2], 1.2);
    S.add(cap(base, add3(base, [Math.sin(i * 2.1) * 1.2, -len, 1]), 1.5, 0.15), (x, y, z, n, h) => (spec(n, 16) > 0.6 ? T[6] : tone(T, lit(n) * 0.9, 1, 5, h)));
  }
};

// ---- cursed plate (2×2): a curved armour plate, riveted, split by a glowing curse
STYLES.plate = (S, m) => {
  const R = ramp(m.color, 7, 1.15), G = ramp(m.color2, 7, 1.3);
  const c = [0, 12, -16];
  const shellF = Object.assign((x, y, z) => { const r = Math.hypot(x - c[0], z - c[2]); return Math.max(Math.abs(r - 17) - 1.4, Math.abs(y - 12) - 11, Math.abs(Math.atan2(x - c[0], z - c[2])) * 17 - 12); }, { bb: [-14, 0, -1, 14, 24, 3] });
  S.add(shellF, (x, y, z, n, h) => (spec(n, 18) > 0.5 ? R[5] : metal(R, n, h)));
  for (const y of [1.3, 22.7]) S.add(tube(curve((t) => { const ang = (-12 + 24 * t) / 17; return [c[0] + Math.sin(ang) * 18, y, c[2] + Math.cos(ang) * 18]; }, 10), Array(11).fill(1.2)), (x, y2, z, n, h) => metal(R, n, h, { bias: 1 }));
  for (let i = 0; i < 6; i++) for (const y of [4, 20]) { const ang = (-10 + i * 4) / 17; S.add(sphere([c[0] + Math.sin(ang) * 18.4, y, c[2] + Math.cos(ang) * 18.4], 0.9), (x, y2, z, n, h) => metal(ramp('#c8b8d8'), n, h)); }
  // the curse: a glowing sigil cut deep and a jagged crack
  const face = [0, 12, 1.4];
  const sig = d2union((u, v) => Math.abs(Math.hypot(u, v) - 4.6) - 0.6, d2seg(0, -6.5, 0, 6.5, 0.6), d2seg(-4.5, 3, 4.5, -3, 0.55), d2seg(-4.5, -3, 4.5, 3, 0.55));
  S.cut(slab(face, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], sig, 1.1, 0, 10), (x, y, z, n, h) => glow(G[4]));
  S.cut(slab(face, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], d2union(d2seg(5, 4, 8, 9, 0.45), d2seg(8, 9, 7, 13, 0.4), d2seg(-5, -4, -9, -7, 0.45)), 1.2, 0, 14), (x, y, z, n, h) => glow(G[3]));
};

// ---- eyes: a socketed sentinel eye (1×1) or the warden's sun-eye (2×2)
STYLES.eye = (S, m) => {
  const warden = m.id === 'warden_eye';
  const Ir = ramp(warden ? m.color2 : m.color, 7, 1.3), Rg = ramp(warden ? m.color : m.color2, 7, 1.15), W = ramp('#f4ecf0', 7, 0.8);
  const c = [0, 12, 0], look = norm([0.45, 0.35, 0.82]);
  S.add(sphere(c, 8.5), (x, y, z, n, h) => {
    const d = dot(n, look);
    if (d > 0.93) { const sl = Math.abs(dot(n, norm([0.9, 0, -0.5]))) < 0.09; return sl ? C('#140a14') : glow(tone(Ir, 1, 5, 6, h)); } // slit pupil
    if (d > 0.78) { const a = Math.atan2(dot(n, [0, 1, 0]), dot(n, [1, 0, 0])); return glow(tone(Ir, Math.sin(a * 14) * 0.5 + (d - 0.8) * 4 - 0.3, 1, 5, h, 0.05)); } // striated iris
    if (d > 0.74) return C('#1a1018');
    if (Math.abs(n3(x, y, z, 0.5, 9) - 0.5) < 0.025 && d < 0.6) return C('#c83a4a'); // veins
    return tone(W, lit(n) * 0.8, 1, 5, h);
  });
  S.add(torus(add3(c, look, 4.2), look, 8.4, warden ? 2.2 : 1.8), (x, y, z, n, h) => (spec(n, 16) > 0.55 ? Rg[6] : metal(Rg, n, h)));
  const Bl = basis(look);
  if (warden) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, d = add3(Bl[1].map((v) => v * Math.cos(a)), Bl[2], Math.sin(a));
      const p = add3(add3(c, look, 3.6), d, 9.8);
      S.add(cap(p, add3(p, d, i % 2 ? 4 : 6.5), 1.7, 0.2), (x, y, z, n, h) => metal(Rg, n, h, { bias: 1 }));
    }
  } else {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; const d = add3(Bl[1].map((v) => v * Math.cos(a)), Bl[2], Math.sin(a)); S.add(sphere(add3(add3(c, look, 5.5), d, 8.4), 1.2), (x, y, z, n, h) => metal(ramp('#c0c8d0'), n, h)); }
  }
};

// ---- kobold lantern: barred cage, living flame, a filthy rag wrapped round the handle
STYLES.lantern = (S, m) => {
  const F = ramp(m.color, 7, 1.25), Rg = ramp(m.color2, 7, 1.05), Ir = ramp('#5a5050', 7, 1.0);
  const iron = (x, y, z, n, h) => (spec(n, 16) > 0.6 ? Ir[5] : metal(Ir, n, h));
  S.add(cyl([0, 2, 0], [0, 1, 0], 6.8, 1.6, 0.5), iron);
  S.add(cyl([0, 17, 0], [0, 1, 0], 6, 1.2, 0.4), iron);
  S.add(cap([0, 18, 0], [0, 21.5, 0], 4.6, 1.2), iron);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; S.add(cap([Math.cos(a) * 5.6, 3, Math.sin(a) * 5.6], [Math.cos(a) * 5.2, 16, Math.sin(a) * 5.2], 0.75), iron); }
  S.add(torus([0, 24.5, 0], [0, 0, 1], 3.2, 0.7), iron); // handle
  // flame in layers: white core, yellow, orange
  S.add(Object.assign((x, y, z) => Math.hypot(x, (y - 7.8) * (y > 7.8 ? 0.55 : 1), z) - 3.4, { bb: [-4, 4, -4, 4, 15, 4] }), (x, y, z, n, h) => glow(F[y > 12 ? 3 : y > 9.5 ? 4 : 5]));
  S.add(sphere([0, 3.8, 0], 1.6), glow(F[2])); // wick glow
  // rag
  S.add(noisy(torus([0, 21, 0], [0.15, 1, 0.1], 3.4, 1.3), 0.5, 0.8, 4), (x, y, z, n, h) => tone(Rg, lit(n) * 0.8 + (h - 0.5) * 0.5, 1, 4, h));
  S.add(slab([3.6, 16.5, 2.5], rotB(0, -0.6, 0.25), d2poly([[-1.4, 4], [1.4, 4], [1.7, -2], [0.5, -4.5], [-0.4, -2.5], [-1.5, -4]]), 0.4, 0, 6), (x, y, z, n, h) => tone(Rg, lit(n) * 0.6, 1, 4, h));
};

// ---- feather (1×2)
STYLES.feather = (S, m) => {
  const R = ramp(m.color, 7, 1.1), D = ramp(m.color2, 7, 1.1), Q = ramp('#f4ece0', 7, 0.8);
  const B = rotB(-0.25, 0.2, -0.12);
  const P3 = (u, v, w = 0) => add3(add3(add3([0, 27, 0], B[0], u), B[1], v), B[2], w);
  const vane = d2poly([[0, 26], [3.6, 22], [6.4, 12], [7.2, 2], [6, -8], [3.5, -15], [0.6, -18], [-0.6, -18], [-4.5, -14], [-6.6, -5], [-6.8, 5], [-5.6, 14], [-3, 22]]);
  const notches = [d2seg(7.5, 4, 4.5, 2.5, 0.45), d2seg(-7, -3, -4.2, -4.8, 0.45), d2seg(6.5, -6, 4, -7.6, 0.4)];
  const shape = (u, v) => { let d = vane(u, v); for (const f of notches) d = Math.max(d, -f(u, v)); return d; };
  S.add(slab(P3(0, 0), B, shape, 0.55, 0, 30), (x, y, z, n, h) => {
    const q = [x, y - 27, z], u = dot(q, B[0]), v = dot(q, B[1]);
    const barb = Math.sin((v - Math.abs(u) * 0.9) * 2.6) > 0.2;
    const bar = Math.sin(v * 0.42 + 1) > 0.55;
    return tone(bar ? D : R, lit(n) * 0.5 + (barb ? 0.25 : -0.15) + (v > 18 ? -0.2 : 0), 1, 5, h);
  });
  S.add(tube([P3(0, -27, 0.5), P3(0, -18, 0.6), P3(0, 0, 0.6), P3(0, 25, 0.4)], [1.3, 1.1, 0.8, 0.3]), (x, y, z, n, h) => tone(Q, lit(n) * 0.8, 2, 5, h));
  S.add(slab(P3(0, -21.5), B, d2poly([[-1.5, 3], [1.8, 3], [2.5, -1], [1, -3], [-2, -1.5]]), 0.5, 0, 5), (x, y, z, n, h) => tone(Q, lit(n) * 0.5 + 0.2, 2, 5, h)); // downy base
};

// ---- rustjaw gear (2×2): a toothed wheel with fanged teeth, spokes and a hub
STYLES.gear = (S, m) => {
  const R = ramp(m.color, 7, 1.2), G = ramp(m.color2, 7, 1.15);
  const ax = norm([0.25, 0.4, 0.88]), c = [0, 13, 0], Bx = basis(ax);
  const rust = (x, y, z, n, h) => { if (spec(n, 14) > 0.5) return G[5]; const pit = spots(x, y, z, 1.8, 0.4, 2, 0.22); return tone(R, lit(n) * 0.9 + (pit ? -0.5 : 0) + (n3(x, y, z, 0.5, 3) - 0.5) * 0.4, 1, 5, h); };
  S.add(cyl(c, ax, 11, 2.2, 0.5), rust);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, d = add3(Bx[1].map((v) => v * Math.cos(a)), Bx[2], Math.sin(a)), t = add3(Bx[1].map((v) => v * -Math.sin(a)), Bx[2], Math.cos(a));
    const base = add3(c, d, 10.4);
    S.add(cap(base, add3(add3(base, d, 4.6), t, 1.4), 2.2, 0.35), (x, y, z, n, h) => (spec(n, 12) > 0.45 ? G[6] : tone(G, lit(n) * 0.8, 1, 5, h))); // worn bright fangs
  }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3, d = add3(Bx[1].map((v) => v * Math.cos(a)), Bx[2], Math.sin(a)); S.cut(cyl(add3(c, d, 6.4), ax, 2.6, 4), (x, y, z, n, h) => tone(R, lit(n) * 0.5 - 0.3, 0, 3, h)); }
  S.add(cyl(add3(c, ax, 1.2), ax, 3.6, 2, 0.6), (x, y, z, n, h) => metal(G, n, h));
  S.cut(cyl(add3(c, ax, 3), ax, 1.4, 1.5), C('#1a1014'));
};

// ---- hearts (2×2): a faceted crystal heart (queen) or a living dragon heart (wyrm)
const heartF = (c, s) => {
  const parts = [sphere([c[0] - 4.2 * s, c[1] + 4 * s, c[2]], 6.4 * s), sphere([c[0] + 4.2 * s, c[1] + 4 * s, c[2]], 6.4 * s), cap([c[0], c[1] + 2 * s, c[2]], [c[0], c[1] - 9 * s, c[2]], 6.6 * s, 0.6 * s)];
  return Object.assign((x, y, z) => { let d = 1e9; for (const p of parts) d = Math.min(d, p(x, y, z)); return d; }, { bb: [c[0] - 12 * s, c[1] - 11 * s, c[2] - 7 * s, c[0] + 12 * s, c[1] + 11 * s, c[2] + 7 * s] });
};
STYLES.heart = (S, m) => {
  const R = ramp(m.color, 7, 1.3), Q = ramp(m.color2, 7, 1.25);
  if (m.id === 'queen_heart') {
    // three cut-crystal lobes: two rounded tops and a long faceted point
    const fib = (N) => { const out = [], ga = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < N; i++) { const y = 1 - ((i + 0.5) / N) * 2, r = Math.sqrt(1 - y * y); out.push({ n: [Math.cos(i * ga) * r, y, Math.sin(i * ga) * r], o: 1 }); } return out; };
    const B = rotB(0.15, 0.25, 0);
    const lobes = [poly([-4.4, 16, 0], fib(22), [6.6, 6.6, 6], B), poly([4.4, 16, 0], fib(22), [6.6, 6.6, 6], B)];
    const point = poly([0, 15.5, 0], prismPlanes(8, 2.3, 0.62, 0.2, true), [7.4, 6.4, 6], rotB(Math.PI + 0.15, 0.25, 0));
    for (const F of [...lobes, point]) S.add(F, (x, y, z, n, h) => {
      const f = F.facet(x, y, z), L = lit(f.n);
      if (f.gap < vu() * 0.6 && L > 0.1) return glow(Q[4]);
      if (spec(f.n, 10) > 0.75) return glow(Q[5]);
      return glow(tone(R, L * 0.6 + ((f.i * 7) % 4) * 0.33 - 0.5, 0, 5, h, 0.03));
    });
    S.add(sphere([0, 13, 3.5], 2), glow(Q[5]), { top: true });
    return;
  }
  const D = ramp('#6a1a1e', 7, 1.2);
  S.add(noisy(heartF([0, 11, 0], 1), 0.8, 0.35, 6), (x, y, z, n, h) => {
    const v = Math.abs(n3(x, y, z, 0.22, 5) - 0.5);
    if (v < 0.03) return glow(v < 0.012 ? Q[6] : Q[4]); // fire running in the veins
    return tone(v < 0.06 ? R : D, lit(n) * 0.9 + 0.2, 1, 5, h);
  });
  for (const [a, b, r] of [[[-3, 19, -1], [-5, 25, -2], 2.4], [[1, 20, 0], [2, 26, 1], 2.8], [[5, 18, -2], [9, 22, -3], 2]]) S.add(tube([a, add3(a, [(b[0] - a[0]) * 0.5 - 1, (b[1] - a[1]) * 0.6, 0]), b], [r, r * 0.9, r * 0.8]), (x, y, z, n, h) => tone(D, lit(n) * 0.9 + 0.1, 1, 5, h), { k: 1.2 });
  for (const b of [[-5, 25, -2], [2, 26, 1], [9, 22, -3]]) S.cut(sphere(add3(b, [0, 0.8, 0]), 1.3), glow(Q[5]));
};

// ---- mycel crown (2×1): a gold band sprouting glowing caps
STYLES.crown = (S, m) => {
  const G = ramp(m.color, 7, 1.15), Cp = ramp(m.color2, 7, 1.25), W = ramp('#f0f0e0', 7, 0.6);
  const ax = 14, az = 8.5, y0 = 3, y1 = 10;
  const ringD = (x, z) => Math.hypot(x / ax, z / az) * Math.min(ax, az) - Math.min(ax, az);
  const band = Object.assign((x, y, z) => Math.max(Math.abs(ringD(x, z)) - 1.3, Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2), { bb: [-16, y0 - 1, -11, 16, y1 + 1, 11] });
  S.add(band, (x, y, z, n, h) => (Math.abs(n3(x, y, z, 0.35, 7) - 0.5) < 0.028 ? W[4] : spec(n, 14) > 0.55 ? G[6] : metal(G, n, h, { bias: 1 })));
  for (const yy of [y0, y1]) S.add(Object.assign((x, y, z) => Math.hypot(ringD(x, z), y - yy) - 1.1, { bb: [-16, yy - 2, -11, 16, yy + 2, 11] }), (x, y, z, n, h) => metal(G, n, h, { bias: 1 }));
  // spikes all round the band, each sprouting a glowing cap
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.PI / 2, bx = Math.cos(a) * ax, bz = Math.sin(a) * az;
    const tall = 9 + ((i * 5) % 3) * 2.5, t = [bx * 1.08, y1 + tall, bz * 1.08];
    S.add(cap([bx, y1, bz], t, 1.9, 0.6), (x, y, z, n, h) => metal(G, n, h, { bias: 1 }));
    const r = 2.4 + (tall > 12 ? 0.8 : 0);
    S.add(Object.assign((x, y, z) => Math.max(Math.hypot(x - t[0], (y - t[1] - 0.6) * 1.5, z - t[2]) - r, t[1] - 0.4 - y), { bb: [t[0] - r, t[1] - 1, t[2] - r, t[0] + r, t[1] + r, t[2] + r] }), (x, y, z, n, h) => glow(spots(x, y, z, 1.1, 0.4, i, 0.25) ? W[5] : tone(Cp, lit(n) * 0.6 + 0.2, 2, 5, h)));
  }
  for (const a of [Math.PI / 2, Math.PI / 2 - 0.6, Math.PI / 2 + 0.6]) S.add(ell([Math.cos(a) * (ax + 1.1), (y0 + y1) / 2, Math.sin(a) * (az + 1.1)], [1.5, 1.9, 1.1]), (x, y, z, n, h) => glow(tone(Cp, lit(n), 3, 6, h)));
};

// ---- keys
STYLES.key = (S, m) => {
  const id = m.id;
  const R = ramp(m.color, 7, 1.15), Q = ramp(m.color2, 7, 1.15);
  const B = rotB(0, 0.1, 0.62);
  const P3 = (u, v, w = 0) => add3(add3(add3([0, 13, 0], B[0], u), B[1], v), B[2], w);
  const metalP = id === 'crystal_key' ? (x, y, z, n, h) => glow(tone(R, lit(n) * 0.8 + 0.1, 1, 5, h)) : id === 'bone_key' ? (x, y, z, n, h) => tone(R, lit(n) * 0.9, 1, 5, h) : (x, y, z, n, h) => {
    if (id === 'rusty_key' && spots(x, y, z, 1.6, 0.5, 4, 0.3)) return tone(Q, lit(n) * 0.8, 1, 4, h);
    return spec(n, 16) > 0.55 ? R[6] : metal(R, n, h, { bias: 1 });
  };
  S.add(torus(P3(-10, 0), B[2], 5.2, 1.7), metalP); // bow
  S.add(cap(P3(-5, 0), P3(14, 0), 1.5), metalP); // shaft
  S.add(torus(P3(-4.3, 0), B[0], 1.6, 0.7), metalP); // collar
  S.add(box(P3(10.5, -3), [1.0, 2.6, 0.9], 0.2, B), metalP); // bit
  S.add(box(P3(13, -2.4), [0.9, 2.0, 0.9], 0.2, B), metalP);
  S.add(box(P3(11.8, -5.3), [2.2, 0.8, 0.9], 0.2, B), metalP);
  if (id === 'golden_key' || id === 'crystal_key') S.add(sphere(P3(-10, 0, 0.4), 2.4), (x, y, z, n, h) => glow(tone(id === 'golden_key' ? ramp('#ff3a5a', 7, 1.3) : Q, lit(n) * 0.7 + 0.2, 1, 5, h))); // jewel in the bow
  if (id === 'bone_key') { S.cut(sphere(P3(-11.6, 1, 2), 1.1), C('#1a1018')); S.cut(sphere(P3(-8.4, 1, 2), 1.1), C('#1a1018')); S.add(sphere(P3(-10, 0, 0), 3.6), (x, y, z, n, h) => tone(R, lit(n) * 0.9, 1, 5, h)); S.cut(sphere(P3(-11.2, 0.6, 3.2), 1.1), glow(Q[4])); S.cut(sphere(P3(-8.8, 0.6, 3.2), 1.1), glow(Q[4])); }
};

// ---- rune scrolls (1×2): a hanging scroll with a glowing glyph
const GLYPH = {
  rune_haste: d2union(d2seg(-5, 6, 1, 0, 0.9), d2seg(1, 0, -5, -6, 0.9), d2seg(0, 6, 6, 0, 0.9), d2seg(6, 0, 0, -6, 0.9)),
  rune_echo: d2union((u, v) => Math.hypot(u + 2, v) - 1.8, (u, v) => Math.max(Math.abs(Math.hypot(u + 2, v) - 4.6) - 0.95, -u - 1), (u, v) => Math.max(Math.abs(Math.hypot(u + 2, v) - 8) - 0.95, -u - 2)),
  rune_mastery: (u, v) => { let d = 1e9; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI * 2, b = -Math.PI / 2 + (((i + 2) % 5) / 5) * Math.PI * 2; d = Math.min(d, d2seg(Math.cos(a) * 7, -Math.sin(a) * 7, Math.cos(b) * 7, -Math.sin(b) * 7, 0.9)(u, v)); } return d; },
  rune_fury: d2union(d2seg(-3, 8, 1.5, 1, 0.95), d2seg(1.5, 1, -2, 0, 0.95), d2seg(-2, 0, 3, -8, 0.95), d2seg(4, 7, 5.5, 3, 0.75), d2seg(-5.5, -3, -4, -7, 0.75)),
  rune_plenty: d2union((u, v) => Math.abs(Math.hypot(u, v) - 6) - 0.95, d2seg(0, -3.6, 0, 3.6, 0.9), d2seg(-2.6, 1.6, 2.6, 1.6, 0.85), d2seg(-2.6, -1.6, 2.6, -1.6, 0.85)),
};
function hangingScroll(S, R, sheetPaint, cut) {
  const P = ramp('#e8d3a3', 7, 1.0), W = ramp('#8a5a33', 7, 1.1), Kn = ramp('#d8a040', 7, 1.15);
  const B = rotB(-0.08, 0.25, 0);
  const P3 = (u, v, w = 0) => add3(add3(add3([0, 0, 0], B[0], u), B[1], v), B[2], w);
  const sheet = Object.assign((x, y, z) => { const q = [x, y, z], u = dot(q, B[0]), v = dot(q, B[1]), w = dot(q, B[2]) - Math.sin(v * 0.3) * 0.35; return Math.max(Math.abs(u) - 9.5, Math.abs(v - 27) - 19, Math.abs(w) - 0.55); }, { bb: [-12, 6, -6, 12, 48, 6] });
  S.add(sheet, (x, y, z, n, h) => {
    const q = [x, y, z], u = dot(q, B[0]), v = dot(q, B[1]);
    if (Math.abs(u) > 8.4) return P[2];
    if (n3(x, y, z, 0.3, 4) > 0.68) return P[3]; // foxing stains
    if (Math.abs(Math.abs(u) - 7) < 0.35 && v > 10 && v < 44) return R ? R[2] : P[1]; // ruled border
    if (cut) { const g = cut(u, v - 27); if (g < 0) return glow(R[g < -0.45 ? 5 : 4]); if (g < 0.55) return P[1]; } // glowing inlaid glyph, scorched halo
    return sheetPaint ? sheetPaint(u, v - 27, n, h) : tone(P, lit(n) * 0.5 + 0.3, 2, 5, h);
  });
  for (const v of [47, 7.5]) {
    S.add(cyl(P3(0, v, 0.3), B[0], 2.1, 11.5, 0.5), (x, y, z, n, h) => tone(W, lit(n) * 0.9, 1, 5, h));
    for (const s of [-1, 1]) S.add(sphere(P3(s * 12.8, v, 0.3), 2.2), (x, y, z, n, h) => (spec(n, 14) > 0.55 ? Kn[6] : metal(Kn, n, h, { bias: 1 })));
  }
  S.add(tube([P3(-6, 49, 0), P3(0, 53.5, 0.2), P3(6, 49, 0)], [0.5, 0.5, 0.5]), C('#7a3a2a')); // hanging cord
}
STYLES.scroll = (S, m) => {
  const R = ramp(m.color, 7, 1.3);
  hangingScroll(S, R, null, GLYPH[m.id] || GLYPH.rune_plenty);
};
STYLES.recipe = (S, m) => {
  const Ink = ramp('#3a2a3a', 7, 1), P = ramp('#e8d3a3', 7, 1), Wx = ramp('#c8283a', 7, 1.2);
  // inked sword diagram + notes on the sheet
  const sword = d2union(d2poly([[0, 13], [1.4, 9], [1.4, -4], [-1.4, -4], [-1.4, 9]]), d2seg(-4.5, -4.5, 4.5, -4.5, 0.6), d2seg(0, -5, 0, -9, 0.6), d2circle(0, -10, 1.1));
  hangingScroll(S, null, (u, v, n, h) => {
    const s = sword(u + 2.5, v);
    if (Math.abs(s) < 0.42) return Ink[1];
    if (u > 2.5 && Math.abs(((v + 40) % 3.2) - 1.6) < 0.32 && u < 6.5 - ((v * 7) % 3)) return Ink[2]; // writing
    return tone(P, lit(n) * 0.5 + 0.3, 2, 5, h);
  });
  const B = rotB(-0.08, 0.25, 0);
  const seal = add3(add3([0, 0, 0], B[1], 12), B[2], 1.2);
  S.add(cyl(add3(seal, B[0], 4), B[2], 3, 0.8, 0.5), (x, y, z, n, h) => (spec(n, 12) > 0.5 ? Wx[5] : tone(Wx, lit(n), 1, 4, h)));
  for (const s of [-1, 1]) S.add(slab(add3(add3(seal, B[0], 4 + s * 1.5), B[1], -4), B, d2poly([[-1, 3], [1, 3], [1.2, -3], [0, -2], [-1.1, -3.2]]), 0.3, 0, 5), Wx[2]);
};

// ---- bomb: iron sphere, banded, sputtering fuse
STYLES.bomb = (S, m) => {
  const R = ramp('#3a3c48', 7, 1.1), F = ramp(m.color2, 7, 1.2), Y = ramp('#ffe08a', 7, 1.1);
  const c = [0, 10, 0];
  S.add(sphere(c, 9.6), (x, y, z, n, h) => (spec(n, 14) > 0.55 ? R[6] : tone(R, lit(n) * 0.95, 1, 5, h)));
  S.add(torus(c, norm([0.3, 1, 0.2]), 9.6, 1.0), (x, y, z, n, h) => metal(ramp('#8a7a6a'), n, h));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const b = basis(norm([0.3, 1, 0.2])); S.add(sphere(add3(c, add3(b[1].map((v) => v * Math.cos(a)), b[2], Math.sin(a)), 10.4), 0.7), R[4]); }
  S.add(cyl([1.5, 19.6, 0.5], norm([0.15, 1, 0.05]), 3, 1.6, 0.4), (x, y, z, n, h) => metal(ramp('#b0a090'), n, h));
  S.add(tube(curve((t) => [2 + Math.sin(t * 3) * 3 + t * 3, 21 + t * 6, 0.5 + t], 6), [0.75, 0.7, 0.7, 0.65, 0.6, 0.55, 0.5]), (x, y, z, n, h) => tone(ramp('#c8a870'), lit(n), 1, 4, h));
  const tip = [2 + Math.sin(3) * 3 + 3, 27, 1.5];
  S.add(sphere(tip, 1.6), glow(Y[6]));
  for (const [dx, dy, dz, r] of [[1.6, 1.4, 0.5, 0.8], [-1.4, 1.8, 0.3, 0.7], [0.4, 2.6, -0.4, 0.6], [2.4, -0.4, 0.8, 0.6], [-2, 0.2, 0.6, 0.5]]) S.add(sphere(add3(tip, [dx, dy, dz]), r), glow(F[4]));
};

// ---- drill (1×2): geared body, spiral bit
STYLES.drill = (S, m) => {
  const M = ramp(m.color, 7, 1.0), G = ramp(m.color2, 7, 1.15);
  const st = (x, y, z, n, h) => (spec(n, 16) > 0.55 ? M[6] : metal(M, n, h));
  S.add(cyl([0, 42, 0], [0, 1, 0], 4.6, 6, 1), st);
  for (const y of [37, 47]) S.add(torus([0, y, 0], [0, 1, 0], 4.7, 0.9), (x, y2, z, n, h) => metal(G, n, h, { bias: 1 }));
  S.add(cyl([0, 49.5, 0], [0, 1, 0], 2.4, 1.6, 0.5), st);
  S.add(tube([[0, 42, 4.3], [0, 42, 8.5], [5, 42.5, 8.5]], [0.8, 0.8, 0.8]), st); // crank
  S.add(cyl([5.8, 42.5, 8.5], [1, 0, 0], 1.3, 1.6, 0.4), (x, y, z, n, h) => tone(ramp('#8a3a2a', 7, 1.1), lit(n), 1, 4, h));
  S.add(cyl([0, 34, 0], [0, 1, 0], 3.2, 2.4, 0.6), (x, y, z, n, h) => metal(G, n, h));
  // bit: a cone with a deep helical flute
  const bit = Object.assign((x, y, z) => { const t = clamp01((32 - y) / 30); const r = 3.4 * (1 - t) + 0.25; return Math.max(Math.hypot(x, z) - r, y - 32, -y + 1.5); }, { bb: [-4, 1, -4, 4, 32, 4] });
  S.add(bit, (x, y, z, n, h) => { const a = Math.atan2(z, x), sp = Math.sin(a * 2 + y * 0.9); return sp > 0.55 ? M[5] : sp < -0.4 ? M[1] : tone(M, lit(n) * 0.8, 2, 4, h); });
  S.cut(Object.assign((x, y, z) => { const a = Math.atan2(z, x); const ph = (((a * 2 + y * 0.9) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); return Math.max(Math.abs(ph - Math.PI) - 0.7, Math.hypot(x, z) - 4, y - 31); }, { bb: [-4, 0, -4, 4, 32, 4] }), M[1]);
};

// ---- scanner (2×1): handheld with a glowing screen
STYLES.scanner = (S, m) => {
  const R = ramp(m.color, 7, 1.15), G = ramp(m.color2, 7, 1.25), K = ramp('#2a3038', 7, 1);
  const B = rotB(-0.2, 0.15, 0);
  const P3 = (u, v, w = 0) => add3(add3(add3([0, 9, 0], B[0], u), B[1], v), B[2], w);
  S.add(box(P3(0, 0), [14, 7.5, 2.8], 2.2, B), (x, y, z, n, h) => (spec(n, 16) > 0.6 ? R[6] : tone(R, lit(n) * 0.9, 1, 5, h)));
  S.cut(box(P3(-3, 0.5, 2.8), [8, 5, 0.8], 0.6, B), (x, y, z, n, h) => {
    const q = [x, y - 9, z], u = dot(q, B[0]) + 3, v = dot(q, B[1]) - 0.5;
    if (Math.abs(Math.hypot(u, v) - 3.4) < 0.4 || Math.abs(u) < 0.25 || Math.abs(v) < 0.25) return glow(G[3]);
    if (Math.hypot(u - 1.6, v - 1.4) < 0.9) return glow(G[6]); // the blip
    if (((u + 20) % 2) < 0.25 || ((v + 20) % 2) < 0.25) return glow(G[1]);
    return glow(G[0]);
  });
  for (const [u, v, c] of [[9, 3, '#ff5a4a'], [9, -1, '#ffd84a'], [9, -4.5, '#5aff8a']]) S.add(sphere(P3(u, v, 2.8), 1.3), (x, y, z, n, h) => glow(ramp(c, 7, 1.2)[lit(n) > 0.2 ? 5 : 4]));
  S.add(cap(P3(10, 7), P3(13, 15, 0), 0.6), K[3]);
  S.add(sphere(P3(13, 15.5, 0), 1.4), glow(G[5]));
  for (let i = 0; i < 4; i++) S.cut(box(P3(-12, -5 + i * 2.5, 0), [3, 0.4, 3.2], 0, B), K[1]); // grip ridges
};

// ---- radar chip: a green board, gold pins and traces, a tiny dish
STYLES.radar = (S, m) => {
  const R = ramp(m.color, 7, 1.2), G = ramp(m.color2, 7, 1.25), Au = ramp('#f0c040', 7, 1.15), K = ramp('#2a2a30', 7, 1);
  S.add(box([0, 3, 0], [10, 1.6, 10], 0.6), (x, y, z, n, h) => {
    if (n[1] > 0.6 && (Math.abs(((x + 20) % 4) - 2) < 0.35 && z > -6 || Math.abs(((z + 20) % 5) - 2.5) < 0.3 && x < 5)) return Au[4]; // traces
    return tone(R, lit(n) * 0.9, 1, 5, h);
  });
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { S.add(box([-7.5 + i * 3, 2.4, s * 11], [0.7, 0.5, 1.4], 0.1), (x, y, z, n, h) => metal(Au, n, h, { bias: 1 })); S.add(box([s * 11, 2.4, -7.5 + i * 3], [1.4, 0.5, 0.7], 0.1), (x, y, z, n, h) => metal(Au, n, h, { bias: 1 })); }
  S.add(box([-4, 6, -3], [4, 1.6, 4], 0.6), (x, y, z, n, h) => tone(K, lit(n), 1, 4, h)); // the chip
  // dish on a little mast
  S.add(cap([4, 4.5, 3], [4, 10, 3], 0.9), (x, y, z, n, h) => metal(ramp('#c0c8d0'), n, h));
  const ax = norm([-0.3, 1, 0.6]);
  const dish = Object.assign((x, y, z) => { const q = [x - 4, y - 13.5, z - 3]; const a = dot(q, ax), r = Math.hypot(...add3(q, ax, -a)); return Math.max(Math.abs(a + 3 - r * r * 0.09) - 0.6, r - 6); }, { bb: [-3, 6, -4, 11, 20, 10] });
  S.add(dish, (x, y, z, n, h) => (spec(n, 12) > 0.5 ? C('#ffffff') : metal(ramp('#d0d8e0'), n, h)));
  S.add(cap(add3([4, 13.5, 3], ax, -2.4), add3([4, 13.5, 3], ax, 2), 0.4), K[4]);
  S.add(sphere(add3([4, 13.5, 3], ax, 2.4), 1.0), glow(G[5]));
  S.add(sphere([7, 5.4, -6], 1.2), glow(G[5])); // LED
};

// ---- flare: a red paper tube burning white-hot
STYLES.flare = (S, m) => {
  const R = ramp(m.color, 7, 1.2), F = ramp(m.color2, 7, 1.15), O = ramp('#ff8a2a', 7, 1.2);
  const a = [-9, 3, 0], b = [6, 18, 2];
  S.add(cap(a, b, 2.6), (x, y, z, n, h) => { const t = dot([x - a[0], y - a[1], z - a[2]], norm([15, 15, 2])) / 21.3; return Math.abs(t - 0.25) < 0.04 || Math.abs(t - 0.62) < 0.04 ? C('#f0e6d0') : tone(R, lit(n) * 0.9, 1, 5, h); });
  S.add(cyl(add3(a, norm([15, 15, 2]), -0.5), norm([15, 15, 2]), 2.9, 1.6, 0.4), (x, y, z, n, h) => metal(ramp('#8a8a92'), n, h));
  // the burn: a white-hot head, a licking flame and flying sparks
  S.add(sphere([6.6, 18.8, 2.1], 3), glow(C('#fff8e8')));
  const flame = Object.assign((x, y, z) => { const q = [x - 7.4 - (y - 19) * 0.15, y - 21, z - 2.2]; const k = q[1] > 0 ? 1 - q[1] / 11 : 1; return Math.hypot(q[0], q[2]) - 3.6 * Math.max(0.05, k) + (q[1] < 0 ? -q[1] * 0.2 : 0) + (q[1] < -2 ? 9 : 0); }, { bb: [1, 16, -3, 14, 33, 7] });
  S.add(flame, (x, y, z, n, h) => { const k = (y - 19) / 11; return glow(k > 0.75 ? O[2] : k > 0.45 ? O[4] : k > 0.15 ? F[4] : F[6]); });
  for (const [x, y, z, r] of [[12, 24, 3, 0.8], [3, 26, 4, 0.7], [11, 29, 0, 0.6], [5, 31, 2, 0.5], [13, 19, 4, 0.6], [2, 21, 1, 0.5]]) S.add(sphere([x, y, z], r), glow(F[5]));
};

// ------------------------------------------------------------------ build + cache
const grids = new Map();
function sculptFor(id) {
  const m = MATERIALS[id] || { id, color: '#a0a0a0', sprite: 'chunk' };
  const style = STYLES[m.sprite] ? m.sprite : 'chunk';
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

// Sprite renders use the painted light only (plus the mesher's per-face shade and AO), so every
// pixel keeps its hand-picked ramp colour instead of washing out under the 3D key light.
let FLAT = null;
export function flatVoxelMaterial() {
  if (!FLAT) { FLAT = new THREE.MeshBasicMaterial({ vertexColors: true }); FLAT.userData.shared = true; }
  return FLAT;
}

/**
 * A voxel model of material `id`, centred on the origin, 0.04 world units per voxel.
 * opts: { res (voxels across, default 30), glow (emissive intensity), spinSpeed, roll, flat (unlit,
 * for sprite renders) }. userData.spin(dt) turns it slowly for showcases.
 */
export function buildOreModel(id, opts = {}) {
  const g = oreGrid(id, opts.res || 30, opts.roll || 0);
  const mesh = meshVoxels(g, { size: opts.vs ?? ORE_VS, origin: [g.nx / 2, g.ny / 2, g.nz / 2], jitter: opts.flat ? 0.012 : 0.025, seed: 5, glowIntensity: opts.glow ?? 1.5, material: opts.flat ? flatVoxelMaterial() : undefined });
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.grid = g;
  group.userData.spin = (dt) => { group.rotation.y += dt * (opts.spinSpeed ?? 0.9); };
  return group;
}
