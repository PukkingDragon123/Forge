// Icons as tiny voxel models: coins, hearts, weapons, elements, map nodes… each sculpted in 3D, baked at
// about one voxel per pixel and rendered through the sprite camera (gfx/voxsprite.js), so inline text
// icons and HUD glyphs are the same little objects as the 3D world. icon(name) → 16 px; 'name:s' → 9 px.
import { Painter, makeCanvas } from '../art/pixel.js';
import { voxSprite } from '../gfx/voxsprite.js';
import { meshVoxels } from '../gfx/voxel.js';
import { flatVoxelMaterial } from '../models/ore_voxel.js';
import {
  Sculpt, ramp, tone, lit, metal, spec, glow, C, norm, dot, add3, rng, vu, light, setLight,
  sphere, ell, box, cap, cyl, torus, tube, curve, poly, rockPlanes, prismPlanes, gemPlanes, slab, d2poly, d2seg, d2union, d2circle,
} from '../models/vox_sculpt.js';

/** Legacy flat palette (still used for UI text colours). */
export const PAL = {
  k: '#140c10', K: '#2a1d22', w: '#fff6e0', W: '#ffffff',
  y: '#ffd25e', Y: '#fff0a8', o: '#d9902b', O: '#9a5a1a',
  r: '#e83b3b', R: '#ff8a7a', m: '#9a1f2e',
  b: '#4fa6ff', B: '#a8dcff', n: '#2a5fb0',
  g: '#5fd17a', G: '#b8f5a8', e: '#2e8a4a',
  p: '#b06bff', P: '#e0b8ff', v: '#6a2fb0',
  s: '#9aa3b2', S: '#dfe6ee', d: '#5b6170',
  c: '#7fe3ff', C: '#e6fbff', u: '#3a8fc0',
  f: '#ff7b2e', F: '#ffe08a', l: '#ffe74a', L: '#fffbd0',
  h: '#8a5a33', H: '#c48a52', j: '#5a3820',
  t: '#e8d3a3', T: '#b89a68', q: '#8a6a40',
  x: '#6b6058', X: '#a39787', z: '#3d3530',
  i: '#ff4f6a', I: '#ffb3c0',
};

// ------------------------------------------------------------------ voxel icon sculpts
// Each icon is a tiny voxel model (~28 design units across, facing the viewer), baked at about one
// voxel per pixel and rendered through the same sprite camera as the items, so a {@coin} in a line of
// text is a little gold coin you could pick up in the 3D world.
const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const rz = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2] || 0];
const Bz = (a) => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const matte = (hex, b = 0, lo = 1, hi = 5) => { const R = ramp(hex, 7, 1.2); return (x, y, z, n, h) => tone(R, lit(n) * 0.85 + b, lo, hi, h, 0.04); };
const shiny = (hex, b = 1) => { const R = ramp(hex, 7, 1.2); return (x, y, z, n, h) => (spec(n, 12) > 0.6 ? R[6] : metal(R, n, h, { bias: b })); };
const gloss = (hex, b = 0) => { const R = ramp(hex, 7, 1.25); return (x, y, z, n, h) => (spec(n, 10) > 0.55 ? R[6] : tone(R, lit(n) * 0.85 + b, 1, 5, h, 0.04)); };
const glowP = (hex, b = 0.3, lo = 3, hi = 6) => { const R = ramp(hex, 7, 1.25); return (x, y, z, n, h) => glow(tone(R, lit(n) * 0.5 + b, lo, hi, h, 0.03)); };
const ext = (S, f2, t, paint, o = {}) => S.add(slab(o.c || [0, 0, 0], o.B || I, typeof f2 === 'function' ? f2 : d2poly(f2), t, o.e ?? Math.min(1.4, t * 0.6), 34), paint, o);
const starPts = (n, R, r, rot = Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => { const a = rot + (i / (n * 2)) * Math.PI * 2, k = i % 2 ? r : R; return [Math.cos(a) * k, Math.sin(a) * k]; });
const drop2 = (cx, cy, s) => d2union(d2circle(cx, cy - 2.6 * s, 6.6 * s), d2poly([[cx - 5.9 * s, cy - 0.4 * s], [cx, cy + 10.5 * s], [cx + 5.9 * s, cy - 0.4 * s]]));
const heart3 = (c, s, zs = 0.6) => {
  const parts = [sphere([c[0] - 4.3 * s, c[1] + 3.4 * s, 0], 6.2 * s), sphere([c[0] + 4.3 * s, c[1] + 3.4 * s, 0], 6.2 * s), cap([c[0], c[1] + 1.5 * s, 0], [c[0], c[1] - 9.5 * s, 0], 6.4 * s, 0.6 * s)];
  return Object.assign((x, y, z) => { let d = 1e9; for (const p of parts) d = Math.min(d, p(x, y, z / zs)); return d * zs; }, { bb: [c[0] - 12 * s, c[1] - 11 * s, -8 * s, c[0] + 12 * s, c[1] + 11 * s, 8 * s] });
};
function chip(S, hex, mark, markPaint) {
  const R = ramp(hex, 7, 1.25), W = ramp('#f4f0e8', 7, 0.6);
  S.add(cyl([0, 0, 0], norm([0.25, 0.1, 1]), 12, 2.6, 0.9), (x, y, z, n, h) => {
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    if (dot(n, norm([0.25, 0.1, 1])) < 0.6) return Math.sin(a * 8) > 0.3 ? W[4] : R[2]; // striped edge
    if (r > 10.2) return Math.sin(a * 8) > 0.3 ? W[5] : R[3];
    if (Math.abs(r - 7.8) < 0.8) return W[4];
    return tone(R, lit(n) * 0.6 - (r / 12) * 0.4 + 0.2, 2, 5, h);
  });
  if (mark) ext(S, mark, 0.7, markPaint, { c: [0.6, 0.25, 2.6], e: 0.3 });
}
function blade(S, len, wid, steel = '#c8d0dc', a = -Math.PI / 4, o = {}) {
  // a weapon laid along the diagonal: grip at the lower left, tip to the upper right
  const B = Bz(a + Math.PI / 2), u0 = o.at ?? -13;
  const P = (u, v = 0, w = 0) => add3(add3([0, 0, w], B[1], u), B[0], v);
  const St = ramp(steel, 7, 1.1), Wd = ramp(o.grip || '#7a4a2a', 7, 1.1), Au = ramp(o.trim || '#ffc840', 7, 1.2);
  const gl = u0 + 9;
  ext(S, [[-wid, 0], [wid, 0], [wid, len - wid * 2.2], [0, len], [-wid, len - wid * 2.2]].map(([v, u]) => [v, u]), 1.0, (x, y, z, n, h) => {
    const q = [x, y, z], v = dot(q, B[0]);
    if (spec(n, 12) > 0.6) return St[6];
    return Math.abs(v) < wid * 0.28 ? St[2] : v < 0 ? St[5] : St[4]; // fuller, lit and shadow bevels
  }, { c: P(gl + 1), B: [B[0], B[1], [0, 0, 1]], e: 0.6 });
  S.add(box(P(gl, 0, 0), [1.1, wid + 3.4, 1.4], 0.5, [B[1], B[0], [0, 0, 1]]), (x, y, z, n, h) => metal(Au, n, h, { bias: 1 }));
  S.add(cap(P(u0 + 2.2), P(gl - 1), 1.3, 1.3), (x, y, z, n, h) => (Math.sin(dot([x, y, z], B[1]) * 2.6) > 0.4 ? Wd[2] : Wd[4]));
  S.add(sphere(P(u0 + 1.4), 2.1), (x, y, z, n, h) => metal(Au, n, h, { bias: 1 }));
}
function haft(S, a, b, r = 1.3, hex = '#8a5a33') { const W = ramp(hex, 7, 1.1); S.add(cap(a, b, r, r), (x, y, z, n, h) => tone(W, lit(n) * 0.9 + (Math.sin((x + y) * 1.6) > 0.7 ? -0.3 : 0), 1, 5, h)); }
function skullHead(S, bone, eyes, o = {}) {
  const R = ramp(bone, 7, 0.95);
  S.add(ell([0, 2, 0], [10, 9.5, 8]), (x, y, z, n, h) => tone(R, lit(n) * 0.85, 1, 5, h));
  S.add(box([0, -6, 2], [6.2, 3.4, 5], 2.2), (x, y, z, n, h) => tone(R, lit(n) * 0.85, 1, 5, h), { k: 2 });
  const E = eyes ? ramp(eyes, 7, 1.3) : null;
  for (const s of [-1, 1]) S.cut(ell([s * 4, 0.5, 7], [3, 3.2, 3.4]), eyes ? glow(E[5]) : C('#1a1018'));
  S.cut(ell([0, -3.6, 8.2], [1.3, 1.8, 2]), C('#1a1018'));
  for (let i = -2; i <= 2; i++) S.cut(box([i * 2.1, -7.4, 6.8], [0.35, 1.6, 1.6]), C('#2a1a1a'));
}
function rock(S, c, s, seed, hex = '#7a8494') {
  const R = ramp(hex, 7, 1.0);
  const F = poly(c, rockPlanes(12, rng(seed), 0.12, 0.6), s, null, 0.2, 0.4, seed);
  S.add(F, (x, y, z, n, h) => { const f = F.facet(x, y, z); return f.gap < vu() * 0.8 && lit(f.n) > 0.1 ? R[5] : tone(R, lit(f.n), 1, 4, h, 0.05); });
}
const flame = (S, c, s, o = {}) => {
  const F = ramp('#ff7a1e', 7, 1.25), Y = ramp('#ffd84a', 7, 1.2);
  const outer = d2union(d2circle(c[0], c[1] - 3 * s, 7.2 * s), d2poly([[c[0] - 6.8 * s, c[1] - 1.5 * s], [c[0] - 1 * s, c[1] + 12 * s], [c[0] + 2.4 * s, c[1] + 5 * s], [c[0] + 4.2 * s, c[1] + 9 * s], [c[0] + 6.8 * s, c[1] - 1.5 * s]]));
  const inner = d2union(d2circle(c[0] + 0.5 * s, c[1] - 4 * s, 4.4 * s), d2poly([[c[0] - 3.9 * s, c[1] - 3 * s], [c[0] + 0.5 * s, c[1] + 5.5 * s], [c[0] + 4.9 * s, c[1] - 3 * s]]));
  ext(S, outer, 2.6 * s, (x, y, z, n, h) => glow(F[(y - c[1]) / s > 6 ? 3 : 4]), { e: 1.6 * s });
  ext(S, inner, 1.6 * s, (x, y, z, n, h) => glow(Y[(y - c[1]) / s > 1 ? 4 : 5]), { c: [0, 0, 2.2 * s], e: 1 * s });
  S.add(ell([c[0] + 0.4 * s, c[1] - 4.5 * s, 3.6 * s], [2.2 * s, 2.6 * s, 1.2 * s]), glow(C('#fff8e0')));
};
/** 2D arc of radius R around (cx, cy) from angle a0 to a1 (radians, ccw), half-width w. */
const d2arc = (cx, cy, R, a0, a1, w) => (u, v) => {
  let a = Math.atan2(v - cy, u - cx);
  while (a < a0) a += Math.PI * 2;
  if (a <= a1) return Math.abs(Math.hypot(u - cx, v - cy) - R) - w;
  return Math.min(Math.hypot(u - cx - Math.cos(a0) * R, v - cy - Math.sin(a0) * R), Math.hypot(u - cx - Math.cos(a1) * R, v - cy - Math.sin(a1) * R)) - w;
};
const QMARK = d2union(d2arc(0, 5, 6, -Math.PI * 0.4, Math.PI * 1.05, 2), d2seg(3.7, 0.2, 0.3, -3.5, 2), d2seg(0.3, -3.5, 0.3, -4.5, 2), d2circle(0.3, -10.4, 2.3));
/** Orthonormal frame whose local +Y is `up`. */
const frame = (up) => { const y = norm(up); const x = norm(add3([1, 0, 0], y, -y[0])); return [x, y, [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]]; };
const ICON3D = {
  coin: (S) => {
    const ax = norm([0.3, 0.12, 1]), R = ramp('#ffc23a', 7, 1.25);
    S.add(cyl([0, 0, 0], ax, 12, 2.3, 0.8), (x, y, z, n, h) => {
      const a = Math.atan2(y, x), r = Math.hypot(x, y);
      if (dot(n, ax) < 0.6) return Math.sin(a * 24) > 0 ? R[2] : R[3]; // reeded edge
      if (Math.abs(r - 10.4) < 0.6) return R[3];
      return spec(n, 10) > 0.7 ? R[6] : tone(R, 0.55 - (x - y) * 0.035, 3, 5, h);
    });
    ext(S, starPts(5, 6.2, 2.7), 0.9, (x, y, z, n, h) => (n[2] < 0.8 ? R[3] : R[6]), { c: add3([0, 0, 0], ax, 2.4), e: 0.3 });
  },
  heart: (S) => S.add(heart3([0, 1, 0], 1.05), gloss('#e83848')),
  hp: (S) => S.add(heart3([0, 1, 0], 1.05), gloss('#e83848')),
  chips: (S) => chip(S, '#3a88f0', d2union(d2seg(-4, 0, 4, 0, 1.2), d2seg(0, -4, 0, 4, 1.2)), glow(C('#e8f6ff'))),
  mult: (S) => chip(S, '#e8383a', d2union(d2seg(-3.6, -3.6, 3.6, 3.6, 1.2), d2seg(-3.6, 3.6, 3.6, -3.6, 1.2)), glow(C('#fff0e8'))),
  xmult: (S) => chip(S, '#3a3440', d2union(d2seg(-4.4, -4.4, 4.4, 4.4, 1.5), d2seg(-4.4, 4.4, 4.4, -4.4, 1.5)), glow(ramp('#ff8a2a', 7, 1.2)[4])),
  fire: (S) => flame(S, [0, -1], 1.15),
  ice: (S) => {
    const R = ramp('#7fe3ff', 7, 1.2);
    for (const [x, a, r, L] of [[0, 0, 3.4, 22], [-6, 0.55, 2.4, 13], [6, -0.5, 2.4, 14]]) {
      const F = poly([x, -11, 0], prismPlanes(6, L / r, 1.1, 0.4), [r, r, r], Bz(a));
      S.add(F, (x2, y, z, n, h) => { const f = F.facet(x2, y, z); return glow(f.gap < vu() * 0.7 ? R[6] : tone(R, lit(f.n) * 0.9 + (f.i % 2 ? 0.2 : -0.1), 1, 5, h, 0.03)); });
    }
  },
  shock: (S) => {
    const pts = [[4, 14], [-7, 1], [-1, 1], [-5, -14], [8, 3], [2, 3], [7, 14]];
    ext(S, pts, 2.2, (x, y, z, n, h) => glow(n[2] > 0.8 ? ramp('#ffe74a', 7, 1.2)[4] : ramp('#ffb020', 7, 1.2)[3]), { e: 1.1 });
    ext(S, d2seg(1, 10, -2, 3, 0.9), 0.8, glow(C('#fffbe0')), { c: [0, 0, 2], e: 0.3 });
  },
  poison: (S) => { ext(S, drop2(0, -1.5, 1.15), 4.2, gloss('#5fd14a'), { e: 3.2 }); S.cut(sphere([-1.5, -4, 4.4], 1.8), glow(C('#d8ffb0'))); S.cut(sphere([2.4, -6.5, 4.2], 1.2), glow(C('#d8ffb0'))); },
  bleed: (S) => { ext(S, drop2(-1.5, -1.5, 1.1), 4.2, gloss('#d82848'), { e: 3.2 }); S.add(ell([8.5, -9, 0], [2.2, 2.8, 2]), gloss('#d82848')); },
  curse: (S) => {
    const P = ramp('#b06bff', 7, 1.3);
    S.add(torus([0, 0, 0], [0, 0, 1], 9.6, 2.2), shiny('#5a3a7a', 0));
    S.add(sphere([0, 0, 0], 8.2), (x, y, z, n, h) => {
      if (Math.abs(x + y * 0.08) < 1.1 && Math.abs(y) < 5.5 && n[2] > 0.5) return C('#140a18');
      return glow(tone(P, lit(n) * 0.6 + (n[2] > 0.7 ? 0.4 : -0.2), 1, 5, h));
    });
  },
  holy: (S) => {
    const G = ramp('#ffc83a', 7, 1.3);
    S.add(torus([0, 0, -2], [0, 0, 1], 9.5, 1.6), (x, y, z, n, h) => glow(G[3]));
    ext(S, starPts(4, 13.5, 4.2), 2.4, (x, y, z, n, h) => glow(n[2] > 0.9 ? (Math.hypot(x, y) < 3.5 ? C('#fffbe8') : G[5]) : G[4]), { e: 1.4 });
  },
  sword: (S) => blade(S, 18, 2.4),
  dagger: (S) => blade(S, 12, 2.6, '#d8dce8', -Math.PI / 4, { at: -10, trim: '#c8a050' }),
  axe: (S) => {
    haft(S, [-10, -11, 0], [7, 10, 0], 1.3);
    const B = Bz(-Math.PI / 4);
    ext(S, [[-1, -1], [7, -6], [9.5, -1], [9.5, 5], [7, 9], [-1, 4]], 1.2, (x, y, z, n, h) => { const v = dot([x - 4, y - 7, 0], B[0]); return v > 6.5 ? ramp('#e8eef8', 7, 1)[5] : shiny('#a8b0bc', 1)(x, y, z, n, h); }, { c: [4.5, 6.5, 0], B: [[Math.cos(-0.7), Math.sin(-0.7), 0], [-Math.sin(-0.7), Math.cos(-0.7), 0], [0, 0, 1]], e: 0.6 });
  },
  hammer: (S) => {
    haft(S, [-9, -12, 0], [5, 7, 0], 1.4);
    S.add(box([6, 8.5, 0], [8.5, 4.4, 4.2], 1.0, Bz(-0.64)), shiny('#9aa3b2', 1));
    S.add(box([6, 8.5, 0], [2.4, 4.8, 4.6], 0.5, Bz(-0.64)), shiny('#c8963a', 1));
  },
  spear: (S) => {
    haft(S, [-13, -13, 0], [6, 6, 0], 1.1);
    ext(S, [[0, -2], [3, 3], [0, 12], [-3, 3]], 1.0, shiny('#c8d0dc', 1), { c: [7, 7, 0], B: Bz(-Math.PI / 4), e: 0.5 });
    S.add(torus([5.5, 5.5, 0], norm([1, 1, 0]), 1.6, 0.8), shiny('#d84a3a', 0));
  },
  staff: (S) => {
    haft(S, [-8, -14, 0], [3, 7, 0], 1.3, '#6a4a2a');
    for (const a of [-0.9, 0, 0.9]) S.add(tube([[3, 7, 0], [3 + Math.sin(a) * 4.5, 10 + Math.cos(a) * 2, 0], [3 + Math.sin(a) * 3.2, 14, 0]], [0.9, 0.8, 0.5]), shiny('#c8963a', 1));
    S.add(sphere([3.5, 12, 0.6], 4.4), glowP('#b06bff', 0.2, 2, 6));
  },
  shield: (S) => {
    const sh = d2poly([[-11, 12], [11, 12], [11, 2], [6, -8], [0, -13], [-6, -8], [-11, 2]]);
    ext(S, sh, 2.6, (x, y, z, n, h) => (-sh(x, y) < 2 ? shiny('#c8d0dc', 1)(x, y, z, n, h) : n[2] > 0.8 && x < 0 === y > 0 ? ramp('#3a7ae0', 7, 1.2)[4] : tone(ramp('#3a7ae0', 7, 1.2), lit(n) * 0.6, 2, 4, h)), { e: 1.2 });
    S.add(sphere([0, 1.5, 2.6], 3), shiny('#ffc840', 1));
  },
  pickaxe: (S) => {
    haft(S, [-8, -13, 0], [3, 8, 0], 1.3);
    S.add(tube(curve((t) => [-11 + t * 22, 8 + Math.sin(t * Math.PI) * 5.5, 0], 10), [0.4, 1.4, 1.9, 2.2, 2.4, 2.4, 2.2, 1.9, 1.4, 0.9, 0.3]), shiny('#a8b0bc', 1));
  },
  key: (S) => {
    const R = '#ffc23a', B = Bz(0.55);
    const P = (u, v) => [u * B[0][0] + v * B[1][0], u * B[0][1] + v * B[1][1], 0];
    S.add(torus(P(-8, 0), [0, 0, 1], 4.4, 1.8), shiny(R));
    S.add(cap(P(-3.5, 0), P(13, 0), 1.5), shiny(R));
    S.add(box(P(10, -3), [0.9, 2.4, 1.2], 0.3, B), shiny(R));
    S.add(box(P(12.5, -2.4), [0.9, 1.8, 1.2], 0.3, B), shiny(R));
  },
  scroll: (S) => {
    const P = ramp('#ecd9a8', 7, 1.0);
    ext(S, [[-8, -10], [8, -10], [8, 10], [-8, 10]], 0.8, (x, y, z, n, h) => (Math.abs(((y + 30) % 3.4) - 1.7) < 0.45 && Math.abs(x) < 5.5 && y < 7 && y > -7 ? C('#6a4a3a') : tone(P, lit(n) * 0.5 + 0.3, 2, 5, h)), { e: 0.4 });
    for (const y of [11, -11]) { S.add(cyl([0, y, 0.5], [1, 0, 0], 2.4, 9.5, 0.5), matte('#8a5a33')); for (const s of [-1, 1]) S.add(sphere([s * 10.8, y, 0.5], 2.2), shiny('#ffc23a')); }
  },
  chest: (S) => {
    const W = ramp('#9a5a2a', 7, 1.15), Au = '#ffc23a';
    S.add(box([0, -4, 0], [12, 6.5, 7], 0.8), (x, y, z, n, h) => (Math.abs(((x + 30) % 6) - 3) < 0.3 ? W[1] : tone(W, lit(n) * 0.8, 1, 4, h)));
    S.add(Object.assign((x, y, z) => Math.max(Math.hypot(y - 2.5, z) - 7.2, Math.abs(x) - 12, 2.5 - y), { bb: [-13, 2, -8, 13, 10, 8] }), (x, y, z, n, h) => tone(W, lit(n) * 0.9, 2, 5, h));
    for (const x of [-8, 8]) S.add(box([x, -1, 0], [1.3, 9.6, 7.4], 0.4), shiny(Au));
    S.add(box([0, 1.8, 7.2], [2.4, 3, 0.8], 0.4), shiny(Au));
    S.cut(box([0, 1.2, 8], [0.5, 1, 0.6]), C('#2a1a0a'));
  },
  treasure: (S) => {
    ICON3D.chest(S);
    for (const [x, y, z, r] of [[-5, 9.5, 2, 2.4], [0, 10.8, 1, 2.8], [5, 9.6, 2.5, 2.3], [-2, 12.5, 3, 2]]) S.add(sphere([x, y, z], r), shiny('#ffd23a'));
    S.add(sphere([3, 13, 3], 1.8), glowP('#ff3a5a', 0.3));
  },
  skull: (S) => skullHead(S, '#efe6d0'),
  elite: (S) => { skullHead(S, '#d8d0e0', '#d06bff'); for (const s of [-1, 1]) S.add(tube([[s * 7, 8, 0], [s * 12, 12, 0], [s * 12.5, 16, 0]], [2, 1.4, 0.4]), matte('#e8d8c0')); },
  boss: (S) => {
    skullHead(S, '#efe6d0', '#ff3a2a');
    ext(S, [[-9, 9], [9, 9], [10, 17], [5, 13], [0, 18], [-5, 13], [-10, 17]], 2, shiny('#ffc23a'), { c: [0, 0, 1], e: 0.8 });
    S.add(sphere([0, 13, 3], 1.5), glowP('#ff3a5a', 0.3));
  },
  monster: (S) => {
    const R = ramp('#e8483a', 7, 1.2);
    S.add(ell([0, -1, 0], [11, 10, 8]), (x, y, z, n, h) => tone(R, lit(n) * 0.85, 1, 5, h));
    for (const s of [-1, 1]) {
      S.add(tube([[s * 7, 6, 0], [s * 12, 10, 0], [s * 11.5, 15, 0]], [2.4, 1.6, 0.4]), matte('#f0e0c0'));
      S.add(ell([s * 4, 1, 6.6], [2.6, 2, 1.6]), glow(C('#ffe04a')));
      S.add(ell([s * 4 + 0.6, 1, 7.9], [0.8, 1.5, 0.6]), C('#1a0a0a'));
    }
    S.cut(box([0, -5.5, 7], [6.5, 1.8, 3]), C('#3a0a10'));
    for (const x of [-4, -1.3, 1.3, 4]) S.add(cap([x, -4, 7.4], [x, -6.4, 7.8], 0.9, 0.2), matte('#fff6e0'));
  },
  crown: (S) => {
    ext(S, [[-12, -7], [12, -7], [12, 2], [13, 9], [7, 4], [3.5, 12], [0, 5], [-3.5, 12], [-7, 4], [-13, 9], [-12, 2]], 2.4, shiny('#ffc23a'), { e: 1 });
    for (const [x, c] of [[-6, '#ff3a5a'], [0, '#3a8aff'], [6, '#3aff8a']]) S.add(sphere([x, -2.5, 2.4], 1.9), glowP(c, 0.3));
    for (const [x, y] of [[-13, 9], [-3.5, 12], [3.5, 12], [13, 9]]) S.add(sphere([x, y, 0], 1.6), shiny('#fff0a0'));
  },
  question: (S) => ext(S, QMARK, 2.3, shiny('#ffc23a'), { e: 1.2 }),
  event: (S) => ext(S, QMARK, 2.3, glowP('#c08aff', 0.1, 2, 5), { e: 1.2 }),
  bag: (S) => {
    S.add(ell([0, -3, 0], [11, 9.5, 7.5]), matte('#9a6a3a'));
    S.add(cap([0, 4, 0], [0, 9, 0], 4.6, 3), matte('#9a6a3a'), { k: 2.5 });
    S.add(ell([0, 10.5, 0], [5.5, 2.4, 4]), matte('#b88a4a', 0.2));
    S.add(torus([0, 6.5, 0], [0, 1, 0.15], 3.8, 1), shiny('#ffc23a'));
    S.add(cyl([0, -3, 7.2], [0, 0, 1], 4, 0.8, 0.4), shiny('#ffd23a'));
  },
  merchant: (S) => {
    ICON3D.bag(S);
    for (const [x, y] of [[9, -9], [12, -6]]) S.add(cyl([x, y, 5], norm([0.3, 0.5, 1]), 3.4, 0.9, 0.4), shiny('#ffd23a'));
  },
  campfire: (S) => {
    for (const [a, b] of [[[-11, -10, 3], [9, -6, -3]], [[11, -10, 3], [-9, -6, -3]]]) haft(S, a, b, 2.2, '#7a4a2a');
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; S.add(sphere([Math.cos(a) * 11, -11.5, Math.sin(a) * 6], 2.2), matte('#7a7a88')); }
    flame(S, [0, -1.5], 0.95);
  },
  star: (S) => ext(S, starPts(5, 13.5, 5.6), 3.2, (x, y, z, n, h) => { const R = ramp('#ffc23a', 7, 1.25); return n[2] > 0.92 ? R[5] : tone(R, lit(n) * 0.9, 2, 5, h); }, { e: 2.6 }),
  speed: (S) => { for (const dx of [-5, 4]) ext(S, [[dx - 4, -11], [dx + 1, -11], [dx + 9, 0], [dx + 1, 11], [dx - 4, 11], [dx + 4, 0]], 2, gloss('#5fd17a', 0.2), { e: 1 }); },
  crit: (S) => { ext(S, starPts(8, 13.5, 6, 0.2), 2.2, glowP('#ff4a3a', 0.2, 2, 5), { e: 1 }); S.add(sphere([0, 0, 1.6], 4.4), glow(C('#fff4e0'))); },
  gem: (S) => {
    const R = ramp('#5ac8ff', 9, 1.3), up = norm([0.05, 0.42, 1]);
    const F = poly([0, 0, 0], gemPlanes(8, { table: 0.42 }), [12, 7, 12], frame(up));
    S.add(F, (x, y, z, n, h) => {
      const f = F.facet(x, y, z), L = lit(f.n), ny = dot(f.n, up);
      if (f.i === 0) return glow((f.q[0] - f.q[2]) < -8 ? R[8] : R[6]);
      if (f.gap < vu() * 0.5 && f.i2 === 0) return glow(R[7]);
      return glow(tone(R, L * 0.7 + (((f.i * 7) % 5) / 4 - 0.5) * 0.9 + (ny > 0 ? 0.2 : -0.2), 1, 6, h, 0.03));
    });
  },
  ore: (S) => {
    rock(S, [0, -1, 0], [12, 10, 9], 5);
    for (const [x, y, z, r] of [[-4, 3, 6.5, 3.4], [4, -3, 7, 3], [5, 6, 4.5, 2.4]]) S.add(sphere([x, y, z], r), (x2, y2, z2, n, h) => (spec(n, 10) > 0.5 ? C('#fff6c0') : tone(ramp('#ffc23a', 7, 1.3), lit(n) * 0.8 + 0.2, 2, 5, h)));
    S.add(poly([-2, -5, 6], prismPlanes(6, 3, 1, 0.3), [1.6, 1.6, 1.6], Bz(0.3)), glowP('#7fe3ff', 0.3));
  },
  bone: (S) => {
    const R = ramp('#efe6d0', 7, 0.95), p = (x, y, z, n, h) => tone(R, lit(n) * 0.9, 1, 5, h);
    S.add(cap([-8, -8, 0], [8, 8, 0], 2.6), p);
    for (const [x, y] of [[-11.5, -7.5], [-7.5, -11.5], [11.5, 7.5], [7.5, 11.5]]) S.add(sphere([x, y, 0], 3.6), p, { k: 2 });
  },
  fang: (S) => {
    const pts = curve((t) => [-4 + t * 6 + Math.sin(t * 2) * 3, 12 - t * 25, 0], 8);
    S.add(tube(pts, pts.map((_, i) => 5 * Math.pow(1 - i / 8, 0.8) + 0.3)), gloss('#f4ecd8'));
    S.add(ell([-4, 12.5, 0], [6, 3, 4.5]), matte('#d86a7a'));
  },
  part: (S) => {
    const pts = curve((t) => { const a = t * 2.2; return [-8 + Math.sin(a) * 15, -11 + (1 - Math.cos(a)) * 11, 0]; }, 10);
    S.add(tube(pts, pts.map((_, i) => 4.2 * Math.pow(1 - i / 10, 0.7) + 0.3)), (x, y, z, n, h) => tone(ramp(y > 2 ? '#f0e0c0' : '#8a5a3a', 7, 1.1), lit(n) * 0.9, 1, 5, h));
  },
  lock: (S) => {
    S.add(torus([0, 4, 0], [0, 0, 1], 6, 1.9), shiny('#b8c0cc'));
    S.add(box([0, -4, 0], [10, 8, 4], 2), shiny('#ffc23a'));
    S.cut(sphere([0, -2.5, 4.5], 1.7), C('#2a1a0a'));
    S.cut(box([0, -6, 4.5], [0.7, 2.5, 1]), C('#2a1a0a'));
  },
  eye: (S) => {
    const Wt = ramp('#f4ecf0', 7, 0.8), Ir = ramp('#3a8aff', 7, 1.3);
    S.add(ell([0, 0, 0], [13, 8.5, 7]), (x, y, z, n, h) => {
      const r = Math.hypot(x - 1, y);
      if (r < 2.4 && n[2] > 0.5) return C('#100818');
      if (r < 5.8 && n[2] > 0.5) return glow(Math.hypot(x + 1, y - 2) < 1.2 ? C('#ffffff') : tone(Ir, 0.4 - r / 6, 1, 5, h));
      return tone(Wt, lit(n) * 0.8, 1, 5, h);
    });
  },
  sparkle: (S) => { ext(S, starPts(4, 13, 2.6), 1.8, glow(C('#fff8d0')), { e: 1.2 }); for (const [x, y, r] of [[8, 9, 1.8], [-9, -8, 1.4]]) S.add(sphere([x, y, 0], r), glow(C('#ffe08a'))); },
  block: (S) => {
    ext(S, (u, v) => Math.max(Math.abs(u) - 10.5, Math.abs(v) - 13) , 2.6, (x, y, z, n, h) => (Math.max(Math.abs(x) - 8.5, Math.abs(y) - 11) > 0 ? shiny('#c8d0dc')(x, y, z, n, h) : tone(ramp('#6a7486', 7, 1.1), lit(n) * 0.7, 1, 4, h)), { e: 1.4 });
    for (const [x, y] of [[-7, 9.5], [7, 9.5], [-7, -9.5], [7, -9.5]]) S.add(sphere([x, y, 2.6], 1.2), shiny('#e8eef8'));
    S.add(sphere([0, 0, 2.2], 3.4), shiny('#9aa3b2'));
  },
  lifesteal: (S) => { ext(S, drop2(0, -3, 1.05), 4, gloss('#d82848'), { e: 3 }); for (const s of [-1, 1]) S.add(cap([s * 3.5, 11, 3], [s * 2.6, 5, 4], 1.8, 0.2), gloss('#f4ecd8')); },
  clock: (S) => {
    for (const y of [12, -12]) S.add(cyl([0, y, 0], [0, 1, 0], 9, 1.4, 0.5), shiny('#c8963a'));
    for (const x of [-8, 8]) haft(S, [x, -11, 0], [x, 11, 0], 0.9, '#8a5a33');
    S.add(Object.assign((x, y, z) => Math.hypot(x, z) - (1 + Math.abs(y) * 0.55), { bb: [-7, -11, -7, 7, 11, 7] }), (x, y, z, n, h) => (y < -3 - Math.hypot(x, z) * 0.2 || (y > 0.5 && y < 4 && Math.hypot(x, z) < 2) ? ramp('#ffd060', 7, 1.2)[4] : ramp('#bfe8ff', 7, 0.7)[lit(n) > 0.3 ? 5 : 4]));
  },
  arrowR: (S) => ext(S, [[-12, -3.4], [2, -3.4], [2, -9.5], [13, 0], [2, 9.5], [2, 3.4], [-12, 3.4]], 2.4, gloss('#f0d8a0', 0.2), { e: 1.2 }),
  arrowL: (S) => ext(S, [[12, -3.4], [-2, -3.4], [-2, -9.5], [-13, 0], [-2, 9.5], [-2, 3.4], [12, 3.4]], 2.4, gloss('#f0d8a0', 0.2), { e: 1.2 }),
  arrowU: (S) => ext(S, [[-3.4, -12], [-3.4, 2], [-9.5, 2], [0, 13], [9.5, 2], [3.4, 2], [3.4, -12]], 2.4, gloss('#f0d8a0', 0.2), { e: 1.2 }),
  arrowD: (S) => ext(S, [[-3.4, 12], [-3.4, -2], [-9.5, -2], [0, -13], [9.5, -2], [3.4, -2], [3.4, 12]], 2.4, gloss('#f0d8a0', 0.2), { e: 1.2 }),
  check: (S) => ext(S, d2union(d2seg(-10, 0, -3.5, -7.5, 2.8), d2seg(-3.5, -7.5, 11, 9, 2.8)), 2.4, gloss('#4ad86a', 0.2), { e: 1.2 }),
  cross: (S) => ext(S, d2union(d2seg(-9, -9, 9, 9, 2.8), d2seg(-9, 9, 9, -9, 2.8)), 2.4, gloss('#e83a3a', 0.2), { e: 1.2 }),
  dot: (S) => S.add(sphere([0, 0, 0], 7), gloss('#f0e0b0', 0.2)),
  mouseL: (S) => mouse(S, -1),
  mouseR: (S) => mouse(S, 1),
  mining: (S) => {
    rock(S, [0, -6, 0], [13, 7, 8], 9);
    for (const [x, y, z] of [[-6, -4, 6.5], [5, -7, 6.5]]) S.add(sphere([x, y, z], 1.8), glowP('#7fe3ff', 0.3));
    haft(S, [-6, -2, 2], [6, 12, 2], 1.2);
    S.add(tube(curve((t) => [-3 + t * 17, 13 - Math.sin(t * Math.PI) * -3.5 - t * 6, 2], 8), [0.4, 1.3, 1.7, 1.9, 1.9, 1.7, 1.3, 0.9, 0.3]), shiny('#a8b0bc'));
  },
  camp: (S) => {
    const T = ramp('#c89a5a', 7, 1.1);
    S.add(Object.assign((x, y, z) => Math.max(Math.abs(x) * 0.95 + y - 9, -y - 10, Math.abs(z) - 9), { bb: [-21, -10, -9, 21, 10, 9] }), (x, y, z, n, h) => (Math.abs(x) < 3.8 - (y + 10) * 0.18 && y < 1 && z > 8.4 ? glow(ramp('#ffb040', 7, 1.2)[4]) : tone(T, lit(n) * 0.8 + (Math.sin(z * 1.2) > 0.6 ? -0.25 : 0), 1, 5, h)));
    haft(S, [0, 9, 0], [0, 13, 0], 0.7, '#6a4a2a');
  },
  start: (S) => {
    haft(S, [-8, -14, 0], [-8, 13, 0], 1.1, '#7a5a3a');
    S.add(slab([2, 7, 0], I, d2poly([[-9, -5.5], [10, -4], [7, 1], [10, 6], [-9, 5.5]]), 0.8, 0.3, 14), (x, y, z, n, h) => tone(ramp('#e83a3a', 7, 1.2), lit(n) * 0.6 + Math.sin(x * 0.6) * 0.3, 1, 5, h));
    S.add(sphere([-8, 14, 0], 1.8), shiny('#ffc23a'));
  },
  forge: (S) => {
    const A = '#6a7080';
    S.add(box([0, -5, 0], [9, 2.6, 5], 0.6), shiny(A, 0));
    S.add(cap([-9, -4, 0], [-14, -3.2, 0], 2, 0.4), shiny(A, 0));
    S.add(box([0, -9.5, 0], [4, 2.4, 3.6], 0.5), shiny(A, 0));
    S.add(box([0, -13, 0], [7.5, 1.4, 5], 0.4), shiny(A, 0));
    flame(S, [1, 3], 0.72);
  },
  rune: (S) => {
    const R = ramp('#6a7a9a', 7, 1.05);
    const F = poly([0, 0, 0], [...rockPlanes(10, rng(3), 0.06, 0), { n: [0, 0, 1], o: 0.4 }, { n: [0, 0, -1], o: 0.4 }], [9, 13, 9]);
    S.add(F, (x, y, z, n, h) => {
      const f = F.facet(x, y, z);
      if (f.n[2] > 0.9 && d2union(d2seg(0, -7, 0, 7, 1.1), d2seg(0, 2.5, 4, 6, 1), d2seg(0, 2.5, -4, 6, 1), d2seg(0, -2, 4, -5.5, 1))(x, y) < 0) return glow(ramp('#7affe8', 7, 1.25)[4]);
      return f.gap < vu() * 0.8 && lit(f.n) > 0 ? R[5] : tone(R, lit(f.n), 1, 4, h);
    });
  },
  tool: (S) => {
    const B = Bz(-Math.PI / 4);
    S.add(box([-3, -3, 0], [2, 9, 1.3], 0.8, B), shiny('#a8b0bc'));
    const jaw = (u, v) => { const q = rz([u - 7.5, v - 7.5, 0], Math.PI / 4); return Math.max(Math.hypot(u - 5, v - 5) - 5.8, -Math.max(Math.abs(q[0]) - 2.1, Math.abs(q[1]) - 6)); };
    ext(S, jaw, 1.6, shiny('#a8b0bc'), { e: 0.7 });
    S.add(box([-8.5, -8.5, 0], [2.6, 4, 1.8], 1, B), matte('#d84a3a'));
  },
  bomb: (S) => {
    S.add(sphere([-1, -2, 0], 10.5), (x, y, z, n, h) => (spec(n, 12) > 0.55 ? C('#c8d0e0') : tone(ramp('#3a3c4a', 7, 1.1), lit(n) * 0.9, 1, 5, h)));
    S.add(cyl([4.5, 7.5, 0], norm([0.45, 0.9, 0]), 2.6, 1.6, 0.4), shiny('#a89a8a'));
    S.add(tube(curve((t) => [6 + t * 4, 9.5 + Math.sin(t * 3) * 2 + t * 2, 0], 5), [0.7, 0.7, 0.7, 0.6, 0.6, 0.5]), matte('#d8b070'));
    S.add(sphere([10.5, 13, 0], 2.2), glow(C('#fff4c0')));
    for (const [x, y, r] of [[13, 15, 1], [12, 10.5, 0.9], [8.5, 15.5, 0.8]]) S.add(sphere([x, y, 0], r), glow(ramp('#ff7a2a', 7, 1.2)[4]));
  },
  drill: (S) => {
    S.add(Object.assign((x, y, z) => { const q = rz([x, y, z], Math.PI / 4); const t = Math.max(0, Math.min(1, (q[1] + 2) / 13)); return Math.max(Math.hypot(q[0], z) - (3.8 * (1 - t) + 0.3), -q[1] - 2, q[1] - 11); }, { bb: [-12, -6, -5, 6, 12, 5] }), (x, y, z, n, h) => { const q = rz([x, y, z], Math.PI / 4); return Math.sin(Math.atan2(z, q[0]) * 2 + q[1] * 1.3) > 0.4 ? ramp('#e8eef8', 7, 1)[5] : shiny('#8a92a2', 0)(x, y, z, n, h); });
    const P = (u) => rz([0, u, 0], -Math.PI / 4);
    S.add(cyl(P(-6), rz([0, 1, 0], -Math.PI / 4), 4.4, 4, 1), shiny('#b8c0cc', 0));
    S.add(torus(P(-3), rz([0, 1, 0], -Math.PI / 4), 4.5, 0.9), shiny('#ffc23a'));
    S.add(torus(P(-9), rz([0, 1, 0], -Math.PI / 4), 4.5, 0.9), shiny('#ffc23a'));
  },
  radar: (S) => {
    S.add(box([0, -11, 0], [9, 1.6, 6], 0.6), matte('#2a6a4a'));
    haft(S, [0, -10, 0], [0, -3, 0], 1, '#8a92a2');
    const ax = norm([-0.5, 0.65, 0.6]);
    S.add(Object.assign((x, y, z) => { const q = [x, y - 2, z], a = dot(q, ax), r = Math.hypot(...add3(q, ax, -a)); return Math.max(Math.abs(a + 2.5 - r * r * 0.07) - 0.9, r - 10); }, { bb: [-12, -9, -12, 12, 13, 12] }), (x, y, z, n, h) => (spec(n, 10) > 0.5 ? C('#ffffff') : shiny('#c8d0dc', 1)(x, y, z, n, h)));
    S.add(sphere(add3([0, 2, 0], ax, 3), 1.8), glowP('#7aff8a', 0.4));
  },
  scanner: (S) => {
    S.add(box([0, 0, 0], [13, 8, 3], 2.2), gloss('#3a8a6a'));
    S.cut(box([-2.5, 0.5, 3], [8, 5.5, 0.9], 0.6), (x, y, z, n, h) => glow(Math.abs(Math.hypot(x + 2.5, y - 0.5) - 3) < 0.6 || Math.abs(x + 2.5) < 0.4 || Math.abs(y - 0.5) < 0.4 ? ramp('#7affc8', 7, 1.2)[4] : ramp('#7affc8', 7, 1.2)[1]));
    for (const [y, c] of [[3.5, '#ff5a4a'], [-0.5, '#ffd84a'], [-4.5, '#5aff8a']]) S.add(sphere([9.5, y, 3], 1.4), glowP(c, 0.3));
  },
  flare: (S) => {
    S.add(cap([-11, -11, 0], [4, 4, 0], 2.8), (x, y, z, n, h) => (Math.abs(((x + y + 40) % 9) - 4.5) < 0.8 ? C('#f0e6d0') : tone(ramp('#e83a2a', 7, 1.2), lit(n) * 0.9, 1, 5, h)));
    flame(S, [6.5, 5], 0.62);
  },
  harvest: (S) => {
    haft(S, [-10, -13, 0], [-3, 1, 0], 1.3);
    S.add(tube(curve((t) => { const a = Math.PI * (0.9 - t * 1.05); return [Math.cos(a) * 10.5 + 4, Math.sin(a) * 10.5 + 1, 0]; }, 12), Array.from({ length: 13 }, (_, i) => 0.3 + Math.sin((i / 12) * Math.PI) * 1.9)), (x, y, z, n, h) => (spec(n, 10) > 0.5 ? C('#ffffff') : shiny('#c8d0dc')(x, y, z, n, h)));
  },
  quality: (S) => {
    for (const s of [-1, 1]) S.add(slab([s * 3.5, -8, -1], I, d2poly([[-2.6, 5], [2.6, 5], [2.6, -6], [0, -3.5], [-2.6, -6]]), 0.6, 0.2, 8), matte(s < 0 ? '#3a7ae0' : '#e83a3a'));
    S.add(cyl([0, 3, 0], [0, 0, 1], 8.5, 1.8, 0.6), shiny('#ffc23a'));
    ext(S, starPts(5, 5.4, 2.3), 0.7, glow(C('#fff4c0')), { c: [0, 3, 1.9], e: 0.3 });
  },
  recipe: (S) => {
    S.add(box([0, 0, -1], [10.5, 13, 3], 1), (x, y, z, n, h) => (x > 9.6 && Math.abs(z + 1) < 2.2 ? ramp('#f0e0b8')[4] : tone(ramp('#b82a3a', 7, 1.2), lit(n) * 0.8, 1, 5, h)));
    for (const [x, y] of [[-9, 11.5], [9, 11.5], [-9, -11.5], [9, -11.5]]) S.add(box([x, y, 2], [2, 2, 0.6], 0.3), shiny('#ffc23a'));
    S.add(Object.assign((x, y, z) => Math.max(Math.abs(Math.hypot(x, y) - 4.5) - 0.9, Math.abs(z - 2.1) - 0.5), { bb: [-6, -6, 1, 6, 6, 3] }), shiny('#ffc23a'));
    S.add(sphere([0, 0, 2.2], 1.6), glowP('#ffd25e', 0.4));
  },
  flee: (S) => {
    const L = ramp('#8a5a33', 7, 1.15);
    S.add(cap([-2, 12, 0], [-1, -4, 0], 4.4, 4), (x, y, z, n, h) => tone(L, lit(n) * 0.85, 1, 5, h));
    S.add(ell([4, -8, 0], [9, 4, 4.6]), (x, y, z, n, h) => (y < -10.5 ? L[1] : tone(L, lit(n) * 0.85, 1, 5, h)), { k: 2.5 });
    S.add(torus([-1.6, 11.5, 0], [0, 1, 0], 4.4, 1), shiny('#c8963a'));
    for (const [y, l] of [[6, 7], [1, 9], [-4, 6]]) S.add(cap([-8 - l, y, 0], [-8, y, 0], 0.6, 0.9), matte('#e0f0ff', 0.3));
  },
  bridge: (S) => {
    for (let i = 0; i < 7; i++) { const x = -12 + i * 4, y = -4 - Math.sin((i / 6) * Math.PI) * 4; S.add(box([x, y, 0], [1.6, 0.9, 6], 0.3), matte('#9a6a3a')); }
    for (const z of [-6, 6]) S.add(tube(curve((t) => [-14 + t * 28, 3 - Math.sin(t * Math.PI) * 4.5, z], 8), Array(9).fill(0.6)), matte('#d8b878'));
    for (const x of [-14, 14]) for (const z of [-6, 6]) haft(S, [x, -6, z], [x, 6, z], 1.1, '#7a4a2a');
  },
  minecart: (S) => {
    S.add(poly([0, 0, 0], [{ n: [1, -0.25, 0], o: 10 }, { n: [-1, -0.25, 0], o: 10 }, { n: [0, 1, 0], o: 5 }, { n: [0, -1, 0], o: 5 }, { n: [0, 0, 1], o: 7 }, { n: [0, 0, -1], o: 7 }]), (x, y, z, n, h) => (Math.abs(y - 3.5) < 1 ? shiny('#9aa3b2')(x, y, z, n, h) : tone(ramp('#8a5a33', 7, 1.1), lit(n) * 0.8, 1, 4, h)));
    for (const x of [-7, 7]) S.add(cyl([x, -7, 7.2], [0, 0, 1], 3.4, 1, 0.4), shiny('#5a5e6a', 0));
    for (const [x, y, c] of [[-5, 6.5, '#ffc23a'], [0, 7.5, '#7fe3ff'], [5, 6.5, '#b06bff'], [-1, 5.5, '#8a8a92']]) S.add(sphere([x, y, 1], 3), c === '#8a8a92' ? matte(c) : glowP(c, 0.2));
  },
  elevator: (S) => {
    for (const x of [-9, 9]) for (const z of [-5, 5]) haft(S, [x, -12, z], [x, 6, z], 0.9, '#7a4a2a');
    S.add(box([0, -12, 0], [10, 1.2, 6], 0.4), matte('#9a6a3a'));
    S.add(box([0, 6, 0], [10.5, 1.2, 6.4], 0.4), matte('#9a6a3a'));
    S.add(cap([0, 7, 0], [0, 14, 0], 0.7), matte('#d8b878'));
    S.add(torus([0, 12.5, 0], [0, 0, 1], 2.4, 0.8), shiny('#9aa3b2'));
  },
};
function mouse(S, side) {
  const G = ramp('#c8ccd8', 7, 0.9);
  S.add(ell([0, -1, 0], [9, 13, 6]), (x, y, z, n, h) => {
    if (y > 1 && Math.abs(x) < 0.6) return G[1];
    if (y > 1 && Math.sign(x) === side) return glow(ramp('#ffc23a', 7, 1.2)[4]);
    return tone(G, lit(n) * 0.85, 1, 5, h);
  });
}

const cache = new Map();
const SIZE = 16, SMALL = 9;

function iconModel(base, px) {
  const S = new Sculpt();
  ICON3D[base](S);
  const L0 = light();
  setLight([-0.5, 0.62, 0.6]); // icons face the viewer: light them from the front upper left
  const g = S.bake((px - 2) / 28, { dilate: px < 12 ? 0.55 : 0.4, seed: 3 });
  setLight(L0);
  return meshVoxels(g, { size: 0.04, origin: [g.nx / 2, g.ny / 2, g.nz / 2], jitter: 0, glowIntensity: 1, material: flatVoxelMaterial() });
}

/**
 * icon('coin') → 16 px voxel icon; icon('coin:s') → compact 9 px version for inline body/small text.
 * Returns { canvas, w, h } or null for unknown names.
 */
export function icon(name) {
  let c = cache.get(name);
  if (c) return c;
  const small = name.endsWith(':s');
  const base = small ? name.slice(0, -2) : name;
  if (!ICON3D[base]) return null;
  const px = small ? SMALL : SIZE;
  const canvas = voxSprite(`icon|${base}|${px}`, () => iconModel(base, px), { w: px, h: px, yaw: -0.32, pitch: 0.26, pad: 1 });
  c = { canvas, w: canvas.width, h: canvas.height };
  cache.set(name, c);
  return c;
}
export const iconNames = () => Object.keys(ICON3D);

/** Register a generated sprite under an icon name (for rich text {@name}). */
export function registerIcon(name, canvas) { cache.set(name, { canvas, w: canvas.width, h: canvas.height }); }

/** Keycap prompt sprite, e.g. keycap('SPACE'). */
const capCache = new Map();
export function keycap(label, pressed = false) {
  const k = label + pressed;
  if (capCache.has(k)) return capCache.get(k);
  // measure with small font metrics (3px glyphs + 1 spacing; M/W are 5)
  const wide = (ch) => (ch === 'M' || ch === 'W' ? 5 : ch === 'N' ? 4 : ch === ' ' ? 2 : ch === '1' ? 3 : 3);
  const tw = [...label].reduce((a, ch) => a + wide(ch) + 1, -1);
  const w = Math.max(9, tw + 6), h = 11;
  const p = new Painter(w, h);
  const top = pressed ? 2 : 0;
  // parchment key cap on a gold-rimmed base, like the kit's small buttons
  p.rect(1, 1 + top, w - 2, h - 1 - top, '#7a3c0c');
  p.hline(1, w - 2, h - 1, '#4a2206');
  p.rect(1, top, w - 2, h - 3 - (pressed ? 1 : 0), '#dcb67e');
  p.rect(2, top + 1, w - 4, h - 5 - (pressed ? 1 : 0), '#f6e6c0');
  p.hline(2, w - 3, top, '#fff4d8');
  p.hline(2, w - 3, h - 4 - (pressed ? 1 : 0) + 0, '#c49660');
  p.set(1, top, '#ffc848'); p.set(w - 2, top, '#ffc848');
  p.outline('#1c100c');
  const c = p.toCanvas();
  const out = { canvas: c, w: c.width, h: c.height, label, textY: 3 + top, textX: Math.floor((c.width - tw) / 2) };
  capCache.set(k, out);
  return out;
}

/** Element → icon name */
export const ELEMENT_ICON = { fire: 'fire', ice: 'ice', shock: 'shock', poison: 'poison', curse: 'curse', bleed: 'bleed', holy: 'holy' };

export function iconSheet(scale = 4) {
  // debug helper: all icons on one canvas
  const names = iconNames();
  const cols = 12;
  const cell = 16;
  const c = makeCanvas(cols * cell * scale, Math.ceil(names.length / cols) * cell * scale);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#3b2b33'; g.fillRect(0, 0, c.width, c.height);
  names.forEach((n, i) => {
    const ic = icon(n);
    g.drawImage(ic.canvas, (i % cols) * cell * scale, Math.floor(i / cols) * cell * scale, ic.w * scale, ic.h * scale);
  });
  return c;
}
