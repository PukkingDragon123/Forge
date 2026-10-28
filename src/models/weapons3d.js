// Forged weapons, carved rather than stacked: blades are lofted forged cross-sections (bevelled
// edges, fullers, tapering points), guards are swept quillons, grips are ridged leather wraps,
// heads are chamfered octagons and flared bits, staves are gnarled sweeps with root claws —
// each painted with pixel textures (honed edges, wood grain, wrap turns, worn fittings). The
// look still comes from the ingredients: blade metal/gem/bone colour, trim, gem inlays, wrap,
// element rune inlays, fangs, cores, masterwork glints. Plus curse cracks and shatter shards.
import * as THREE from 'three';
import { TOON4 } from '../gfx/materials.js';
import { LAYER_FX } from '../gfx/renderer.js';
import { MATERIALS } from '../data/materials.js';
import { hash2 } from '../core/math.js';
import { sweep, curve, Tex, woodTex, shade } from './char_geo.js';

const ELEMENT_GLOW = { fire: '#ff7a2a', ice: '#7fe3ff', shock: '#ffe74a', poison: '#8fe04a', curse: '#c86bff', holy: '#fff3b0', bleed: '#ff4f6a' };
const METAL_TINT = {
  iron: '#b8bec8', copper: '#d8844a', tin: '#c8ccd4', silver: '#e8eef8', gold: '#ffd04a', mithril: '#bff4ff', stariron: '#4a4a7a',
  magmasteel: '#ff7a3a', bronze_ancient: '#c8963a', lodestone: '#5a5a6e', cursedore: '#8a4ac0', obsidian: '#2e2240', junk: '#8a7a6a',
};
const WRAP = { spider_silk: '#f0f0ff', bat_wing: '#5a3a5a', rat_tail: '#c88a8a', toad_tongue: '#c86a7a', mimic_tongue: '#ff6a9a', feather: '#c8b8a0', moth_dust: '#e0d0ff' };

const m3 = (id) => MATERIALS[id] || null;
const tagged = (id, t) => !!(m3(id) && m3(id).tags.includes(t));

/** Derive colours & decorations from a weapon description. */
export function weaponLook(w) {
  const ids = w.ids || [];
  const solids = ids.filter((id) => tagged(id, 'solid'));
  const metals = ids.filter((id) => tagged(id, 'metal')).sort((a, b) => m3(b).value - m3(a).value);
  const gems = ids.filter((id) => tagged(id, 'gem'));
  const bones = ids.filter((id) => tagged(id, 'bone'));
  let blade = '#9aa0aa', bladeKind = 'metal';
  if (metals.length) {
    blade = METAL_TINT[metals[0]] || m3(metals[0]).color;
    if (metals[0] === 'iron' && ids.includes('coal')) blade = '#cfd6e2'; // steel
    if (ids.includes('gold') && ids.includes('silver')) blade = '#f4e6a8'; // electrum
  } else if (gems.length) { blade = m3(gems[0]).color; bladeKind = 'crystal'; }
  else if (bones.length) { blade = '#efe6d0'; bladeKind = 'bone'; }
  else if (solids.length) blade = m3(solids[0]).color;
  const second = metals.find((id) => id !== metals[0]) || solids.find((id) => id !== metals[0]);
  let trim = second ? (METAL_TINT[second] || m3(second).color) : '#8a6a3a';
  if (w.grade >= 4) trim = '#ffcf4a';
  const gem = gems.length ? m3(gems[0]).color : ids.includes('golem_core') ? '#ffb84a' : null;
  const wrapId = ids.find((id) => WRAP[id]);
  const wrap = wrapId ? WRAP[wrapId] : bones.length && bladeKind !== 'bone' ? '#efe6d0' : '#5a3a24';
  const el = w.el || {};
  const els = Object.keys(ELEMENT_GLOW).filter((e) => (el[e] || 0) > 0).sort((a, b) => el[b] - el[a]);
  return {
    blade, bladeDark: new THREE.Color(blade).multiplyScalar(0.6).getStyle(), bladeKind, trim, gem, wrap,
    glow: els.length ? ELEMENT_GLOW[els[0]] : null, glow2: els.length > 1 ? ELEMENT_GLOW[els[1]] : null,
    fangs: ids.filter((id) => tagged(id, 'fang')).length, core: ids.includes('golem_core') || ids.includes('lava_core'),
    masterwork: w.grade >= 4, star: ids.includes('stariron'), magma: ids.includes('magmasteel'),
  };
}

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ carving tools
/**
 * Loft a cross-section along +Y: stations [{y, x?, z?, ...}] and section(st) → [[x, z]...] ordered by
 * increasing angle from +X toward +Z (same count for every station). Faceted, UV u = around, v = along.
 */
function carve(stations, section, o = {}) {
  const rings = stations.map((st) => section(st).map(([x, z]) => [x + (st.x || 0), st.y, z + (st.z || 0)]));
  const n = rings[0].length, P = [], UV = [];
  const y0 = stations[0].y, y1 = stations[stations.length - 1].y, span = (y1 - y0) || 1, vs = o.vScale ?? 1;
  const tri = (a, b, c, ua, ub, uc) => { P.push(...a, ...b, ...c); UV.push(...ua, ...ub, ...uc); };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], va = ((stations[i].y - y0) / span) * vs, vb = ((stations[i + 1].y - y0) / span) * vs;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, ua = k / n, ub = (k + 1) / n;
      tri(A[k], B[k1], A[k1], [ua, va], [ub, vb], [ub, va]);
      tri(A[k], B[k], B[k1], [ua, va], [ua, vb], [ub, vb]);
    }
  }
  const cap = (R, flip, v) => {
    const c = R.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; if (flip) tri(c, R[k1], R[k], [0.5, v], [k1 / n, v], [k / n, v]); else tri(c, R[k], R[k1], [0.5, v], [k / n, v], [k1 / n, v]); }
  };
  if (o.capBottom !== false) cap(rings[0], false, 0);
  if (o.capTop !== false) cap(rings[rings.length - 1], true, vs);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.computeVertexNormals();
  return g;
}
/** Forged blade section: cutting edges at ±w, bevels, a raised spine or a fuller groove. */
const bladeSection = (st) => {
  const w = st.w, t = st.t, f = st.fuller || 0, e = st.edge ?? 0.55;
  return [[w, 0], [w * e, t * 0.8], [w * 0.22, t], [0, t * (1 - f)], [-w * 0.22, t], [-w * e, t * 0.8], [-w, 0], [-w * e, -t * 0.8], [-w * 0.22, -t], [0, -t * (1 - f)], [w * 0.22, -t], [w * e, -t * 0.8]];
};
/** Single-edged section (knives): thick spine on -X, honed edge on +X. */
const knifeSection = (st) => {
  const w = st.w, t = st.t;
  return [[w, 0], [w * 0.35, t * 0.75], [-w * 0.6, t], [-w, t * 0.8], [-w, -t * 0.8], [-w * 0.6, -t], [w * 0.35, -t * 0.75]];
};
/** Chamfered octagon (hammer heads, eyes, sockets, collars): half sizes a (x), b (z), chamfer c. */
const octSection = (st) => {
  const a = st.a, b = st.b ?? st.a, c = st.c ?? Math.min(a, b) * 0.35;
  return [[a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c], [-a + c, -b], [a - c, -b]];
};
const ringSection = (n) => (st) => Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU + (st.phase || 0); return [Math.cos(a) * st.r * (st.sx ?? 1), Math.sin(a) * st.r * (st.sz ?? 1)]; });

/** Faceted brilliant-cut gem (pavilion, girdle, crown, table). */
const gemGeo = (r) => carve([{ y: -r * 1.1, r: 0.0005 }, { y: 0, r }, { y: r * 0.18, r }, { y: r * 0.45, r: r * 0.6 }], ringSection(8));
/** Wrapped grip: ridged where each turn of leather overlaps. */
function gripGeo(y0, y1, r, turns) {
  const st = [];
  for (let i = 0; i <= turns * 2; i++) st.push({ y: y0 + (y1 - y0) * (i / (turns * 2)), r: r * (i % 2 ? 1.1 : 0.96), phase: i * 0.12 });
  return carve(st, ringSection(7), { vScale: turns / 2 });
}
/** Hand-hewn haft: gently bowed, slightly irregular octagon, swelling at the butt. */
function haftGeo(y0, y1, r0, r1, bow = 0.01, n = 7) {
  const st = [];
  for (let i = 0; i <= n; i++) { const t = i / n; st.push({ y: y0 + (y1 - y0) * t, x: Math.sin(t * Math.PI) * bow, r: r0 + (r1 - r0) * t + (i === 0 ? r0 * 0.25 : 0), phase: 0.2 * i }); }
  return carve(st, ringSection(7), { vScale: (y1 - y0) * 3 });
}
/** Curved fang / spike / horn: tapered sweep. */
function fangGeo(len, r, curl = 0.3) {
  return sweep(curve([0, 0, 0], [len * curl * 0.5, len * 0.5, 0], [len * curl, len, 0], null, 5), (t) => r * (1 - t) + 0.001, { n: 5 });
}
/** Raised rune strokes (a small glyph) for element glow inlays. */
function runeGeo(s, seed) {
  const pts = [];
  let x = 0, y = 0;
  for (let i = 0; i < 4; i++) { pts.push([x, y, 0]); x = (hash2(i, seed, 2) - 0.5) * s; y += s * (0.3 + hash2(i, seed, 5) * 0.4); }
  pts.push([x, y, 0]);
  return sweep(pts, s * 0.09, { n: 4, aspect: 1, capStart: true });
}

// ------------------------------------------------------------------ painted textures
const texCache = new Map();
function cachedTex(key, make) { if (!texCache.has(key)) texCache.set(key, make()); return texCache.get(key); }
/** Blade steel: hammer-worked body, bright honed edges (u = 0, 0.5), a dark fuller line, forge scale. */
function bladeTex(color) {
  return cachedTex('blade' + color, () => {
    const T = new Tex(24, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 24; x++) {
      const u = (x + 0.5) / 24, d = Math.min(u, Math.abs(u - 0.5), 1 - u);
      let f = d < 0.045 ? 0.4 : d < 0.09 ? 0.18 : Math.abs(u - 0.25) < 0.03 || Math.abs(u - 0.75) < 0.03 ? -0.14 : 0;
      f += (hash2(x >> 1, y >> 2, 3) - 0.5) * 0.08;
      if (hash2(x, y, 9) > 0.985) f -= 0.22;
      T.set(x, y, shade(color, f));
    }
    const t = T.texture(); t.wrapS = THREE.RepeatWrapping; return t;
  });
}
function woodHaftTex(color) {
  return cachedTex('wood' + color, () => { const t = woodTex(color, { w: 16, h: 64 }).texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
}
/** Leather / cord wrap: diagonal turns with a highlight ridge. */
function wrapTex(color) {
  return cachedTex('wrap' + color, () => {
    const T = new Tex(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = (x + y * 2) % 8; T.set(x, y, shade(color, k < 1 ? -0.32 : k < 3 ? 0.16 : (hash2(x, y, 6) - 0.5) * 0.06)); }
    const t = T.texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  });
}
/** Fittings: worn brass/steel with a bright top bevel, dark lower lip and punched dots. */
function trimTex(color) {
  return cachedTex('trim' + color, () => {
    const T = new Tex(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) T.set(x, y, shade(color, (y < 2 ? 0.3 : y > 13 ? -0.25 : 0) + (hash2(x, y, 4) - 0.5) * 0.06));
    for (let x = 2; x < 16; x += 5) { T.set(x, 7, shade(color, 0.45)); T.set(x, 8, shade(color, -0.35)); }
    const t = T.texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  });
}
function toonM(color, o = {}) {
  return new THREE.MeshToonMaterial({ color: new THREE.Color(o.map ? '#ffffff' : color), map: o.map || null, gradientMap: TOON4, emissive: new THREE.Color(o.emissive || 0), emissiveIntensity: o.ei ?? 1, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1 });
}
function glowM(color, i = 2.2) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(i), fog: false }); }
function mk(geo, mat, parent, p = [0, 0, 0], r = [0, 0, 0], s = null) {
  if (geo.index) { geo = geo.toNonIndexed(); geo.computeVertexNormals(); }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r);
  if (s) m.scale.set(...s);
  m.castShadow = true; m.receiveShadow = false;
  parent.add(m);
  return m;
}
const M = {
  blade: (L) => { const m = L.bladeKind === 'crystal' ? toonM(L.blade, { emissive: L.blade, ei: 0.35, opacity: 0.92 }) : toonM(L.blade, { map: bladeTex(L.bladeKind === 'bone' ? '#efe6d0' : L.blade), emissive: L.magma ? '#ff4a1a' : 0, ei: L.magma ? 0.6 : 1 });  return m; },
  trim: (L) => toonM(L.trim, { map: trimTex(L.trim) }),
  wrap: (L) => toonM(L.wrap, { map: wrapTex(L.wrap) }),
  wood: (L, c = '#7a4a2a') => toonM(c, { map: woodHaftTex(L.bladeKind === 'bone' ? '#d8ccb0' : c) }),
};

/** Wrapped grip with a faceted pommel (and a gem set in it). */
function addGrip(g, L, len, r = 0.02) {
  mk(gripGeo(-len / 2, len / 2, r, Math.round(len / 0.03)), M.wrap(L), g);
  const tm = M.trim(L);
  mk(carve([{ y: -len / 2 - r * 1.9, r: r * 0.5 }, { y: -len / 2 - r * 1.6, r: r * 1.45 }, { y: -len / 2 - r * 0.6, r: r * 1.5 }, { y: -len / 2 + r * 0.1, r: r * 0.95 }], ringSection(8)), tm, g);
  if (L.gem) mk(gemGeo(r * 0.7), glowM(L.gem, 1.4), g, [0, -len / 2 - r * 1.1, r * 1.35], [Math.PI / 2, 0, 0]);
}
function addFangs(g, L, y0, y1, x, n) {
  const fm = toonM('#efe4cc');
  const k = Math.min(n * 2, 5);
  for (let i = 0; i < k; i++) { const y = y0 + ((i + 0.5) / k) * (y1 - y0); mk(fangGeo(0.055, 0.013, 0.35), fm, g, [x, y, 0], [0, 0, x > 0 ? -1.75 : 1.75]); }
}
/** Glowing rune inlays on both faces between y0 and y1 at depth z. */
function addRunes(g, L, y0, y1, z, s = 0.03) {
  if (!L.glow) return;
  const n = Math.max(2, Math.floor((y1 - y0) / (s * 1.6)));
  for (let i = 0; i < n; i++) {
    const y = y0 + ((i + 0.2) / n) * (y1 - y0), m = glowM(i % 2 && L.glow2 ? L.glow2 : L.glow, 2.4);
    for (const sz of [-1, 1]) { const r = mk(runeGeo(s, i * 7 + 3), m, g, [0, y, sz * z]); r.castShadow = false; }
  }
}

const BUILD = {
  sword(g, L, s = 1) {
    const bm = M.blade(L); g.userData.bladeMats.push(bm);
    addGrip(g, L, 0.17 * s);
    // crossguard: quillons curving toward the blade, a langet block at the centre
    const tm = M.trim(L);
    mk(sweep(curve([-0.13 * s, 0.13, 0], [-0.06 * s, 0.098, 0], [0.06 * s, 0.098, 0], [0.13 * s, 0.13, 0], 8), (t) => 0.013 + Math.sin(t * Math.PI) * 0.006, { n: 6, aspect: 1.5, capStart: true }), tm, g);
    mk(carve([{ y: 0.086, a: 0.026, b: 0.02 }, { y: 0.104, a: 0.034, b: 0.024 }, { y: 0.124, a: 0.03, b: 0.02 }], octSection), tm, g);
    for (const sx of [-1, 1]) mk(gemGeo(0.012), tm, g, [sx * 0.132 * s, 0.132, 0], [0, 0, sx * 0.6]);
    if (L.gem) for (const sz of [-1, 1]) mk(gemGeo(0.016), glowM(L.gem, 1.6), g, [0, 0.106, sz * 0.022], [sz * Math.PI / 2, 0, 0]);
    const y0 = 0.12 * s, len = 0.68 * s;
    const blade = mk(carve([
      { y: y0, w: 0.032 * s, t: 0.011 }, { y: y0 + 0.04 * s, w: 0.046 * s, t: 0.011, fuller: 0.35 }, { y: y0 + len * 0.45, w: 0.044 * s, t: 0.01, fuller: 0.35 },
      { y: y0 + len * 0.72, w: 0.037 * s, t: 0.009, fuller: 0.1 }, { y: y0 + len * 0.9, w: 0.022 * s, t: 0.007 }, { y: y0 + len, w: 0.0008, t: 0.0008 },
    ], bladeSection), bm, g);
    blade.userData.breakable = true; blade.userData.len = len;
    addRunes(g, L, y0 + len * 0.1, y0 + len * 0.6, 0.0075, 0.032 * s);
    if (L.fangs) addFangs(g, L, y0 + len * 0.2, y0 + len * 0.7, -0.044 * s, L.fangs);
    g.userData.tip = y0 + len;
  },
  dagger(g, L) {
    const bm = M.blade(L); g.userData.bladeMats.push(bm);
    addGrip(g, L, 0.105, 0.017);
    const tm = M.trim(L);
    mk(sweep(curve([-0.06, 0.075, 0], [-0.02, 0.06, 0], [0.03, 0.06, 0], [0.065, 0.045, 0], 6), (t) => 0.01 + Math.sin(t * Math.PI) * 0.004, { n: 6, aspect: 1.4, capStart: true }), tm, g);
    if (L.gem) mk(gemGeo(0.012), glowM(L.gem, 1.6), g, [0, 0.064, 0.016], [Math.PI / 2, 0, 0]);
    const len = 0.3;
    const blade = mk(carve([
      { y: 0.068, w: 0.03, t: 0.009, x: -0.004 }, { y: 0.1, w: 0.036, t: 0.009, x: -0.002 }, { y: 0.068 + len * 0.55, w: 0.03, t: 0.008, x: 0.006 },
      { y: 0.068 + len * 0.85, w: 0.016, t: 0.006, x: 0.012 }, { y: 0.068 + len, w: 0.0008, t: 0.0008, x: 0.02 },
    ], knifeSection), bm, g);
    blade.userData.breakable = true;
    addRunes(g, L, 0.1, 0.068 + len * 0.6, 0.0065, 0.024);
    if (L.fangs) addFangs(g, L, 0.12, 0.3, -0.03, 1);
    g.userData.tip = 0.068 + len;
  },
  axe(g, L) {
    const bm = M.blade(L); g.userData.bladeMats.push(bm);
    mk(haftGeo(-0.3, 0.68, 0.026, 0.021, 0.012), M.wood(L), g);
    mk(gripGeo(-0.1, 0.08, 0.027, 6), M.wrap(L), g);
    const tm = M.trim(L);
    // bearded bit: lofted outward from the eye, thinning to the edge and dropping into a beard
    const head = new THREE.Group(); head.position.set(0.012, 0.56, 0); head.rotation.z = -Math.PI / 2; g.add(head);
    const bit = mk(carve([
      { y: 0.0, w: 0.05, t: 0.028, x: 0 }, { y: 0.05, w: 0.044, t: 0.022, x: 0.004 }, { y: 0.11, w: 0.075, t: 0.015, x: 0.02 },
      { y: 0.18, w: 0.13, t: 0.009, x: 0.04 }, { y: 0.235, w: 0.16, t: 0.004, x: 0.05 }, { y: 0.255, w: 0.15, t: 0.0012, x: 0.052 },
    ], bladeSection), bm, head);
    bit.userData.breakable = true;
    // eye socket around the haft and a short back spike
    mk(carve([{ y: 0.5, a: 0.036, b: 0.03 }, { y: 0.52, a: 0.04, b: 0.034 }, { y: 0.6, a: 0.04, b: 0.034 }, { y: 0.62, a: 0.034, b: 0.028 }], octSection), tm, g);
    const spike = new THREE.Group(); spike.position.set(-0.03, 0.56, 0); spike.rotation.z = Math.PI / 2; g.add(spike);
    mk(carve([{ y: 0, r: 0.026 }, { y: 0.05, r: 0.018 }, { y: 0.1, r: 0.002 }], ringSection(5)), M.blade(L), spike);
    if (L.gem) mk(gemGeo(0.018), glowM(L.gem, 1.6), g, [0, 0.56, 0.036], [Math.PI / 2, 0, 0]);
    if (L.glow) { const e = mk(sweep(curve([0.25, 0.495, 0], [0.275, 0.56, 0], [0.25, 0.64, 0], null, 6).map(([x, y, z]) => [x + 0.012, y - 0.05, z]), 0.005, { n: 4, capStart: true }), glowM(L.glow, 2.4), g); e.castShadow = false; }
    if (L.fangs) addFangs(g, L, 0.5, 0.62, -0.1, 1);
    g.userData.tip = 0.66;
  },
  hammer(g, L) {
    const bm = M.blade(L); g.userData.bladeMats.push(bm);
    mk(haftGeo(-0.28, 0.6, 0.028, 0.024, 0.006), M.wood(L, '#6a4226'), g);
    mk(gripGeo(-0.12, 0.06, 0.03, 6), M.wrap(L), g);
    const tm = M.trim(L);
    // octagonal head, flared striking faces, waisted middle
    const hg = new THREE.Group(); hg.position.set(0, 0.6, 0); hg.rotation.z = -Math.PI / 2; g.add(hg);
    const head = mk(carve([
      { y: -0.165, a: 0.064, b: 0.064, c: 0.026 }, { y: -0.15, a: 0.082, b: 0.082, c: 0.028 }, { y: -0.11, a: 0.075, b: 0.075 }, { y: 0, a: 0.068, b: 0.068 },
      { y: 0.11, a: 0.075, b: 0.075 }, { y: 0.15, a: 0.082, b: 0.082, c: 0.028 }, { y: 0.165, a: 0.064, b: 0.064, c: 0.026 },
    ], octSection), bm, hg);
    head.userData.breakable = true;
    for (const sy of [-1, 1]) mk(carve([{ y: sy * 0.118 - 0.009, a: 0.08, b: 0.08 }, { y: sy * 0.118 + 0.009, a: 0.08, b: 0.08 }], octSection), tm, hg);
    for (const sz of [-1, 1]) mk(carve([{ y: 0.42, a: 0.012, b: 0.004 }, { y: 0.53, a: 0.014, b: 0.005 }], octSection), tm, g, [0, 0, sz * 0.03]); // langets
    if (L.core) mk(new THREE.IcosahedronGeometry(0.045, 0), glowM('#ffb84a', 2.2), g, [0, 0.6, 0.07]);
    else if (L.gem) mk(gemGeo(0.026), glowM(L.gem, 1.6), g, [0, 0.6, 0.07], [Math.PI / 2, 0, 0]);
    if (L.glow) for (const sx of [-1, 1]) { const e = mk(carve([{ y: -0.004, a: 0.05, b: 0.05 }, { y: 0.004, a: 0.05, b: 0.05 }], octSection), glowM(L.glow, 2.4), g, [sx * 0.168, 0.6, 0], [0, 0, Math.PI / 2]); e.castShadow = false; }
    if (L.fangs) for (let i = 0; i < 3; i++) mk(fangGeo(0.06, 0.016, 0.2), toonM('#efe4cc'), g, [-0.08 + i * 0.08, 0.66, 0]);
    g.userData.tip = 0.68;
  },
  spear(g, L) {
    const bm = M.blade(L); g.userData.bladeMats.push(bm);
    mk(haftGeo(-0.42, 0.86, 0.019, 0.017, 0.008), M.wood(L, '#8a5a33'), g);
    mk(gripGeo(-0.08, 0.08, 0.021, 5), M.wrap(L), g);
    const tm = M.trim(L);
    mk(carve([{ y: 0.82, r: 0.02 }, { y: 0.84, r: 0.026 }, { y: 0.9, r: 0.022 }, { y: 0.93, r: 0.012 }], ringSection(8)), tm, g);
    const tip = mk(carve([
      { y: 0.92, w: 0.012, t: 0.009 }, { y: 0.97, w: 0.042, t: 0.009 }, { y: 1.03, w: 0.044, t: 0.008 }, { y: 1.1, w: 0.024, t: 0.006 }, { y: 1.16, w: 0.0008, t: 0.0008 },
    ], bladeSection), bm, g);
    tip.userData.breakable = true;
    addRunes(g, L, 0.96, 1.08, 0.0065, 0.022);
    if (L.gem) mk(gemGeo(0.014), glowM(L.gem, 1.6), g, [0, 0.87, 0.024], [Math.PI / 2, 0, 0]);
    const tas = toonM(L.glow || '#c8402a');
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; mk(sweep(curve([Math.cos(a) * 0.02, 0.83, Math.sin(a) * 0.02], [Math.cos(a) * 0.035, 0.78, Math.sin(a) * 0.035], [Math.cos(a) * 0.03, 0.71, Math.sin(a) * 0.03], null, 4), (t) => 0.007 * (1 - t * 0.5), { n: 4 }), tas, g); }
    g.userData.tip = 1.15;
  },
  staff(g, L) {
    const wood = M.wood(L, '#6a4226');
    // gnarled shaft: a wandering path with knots
    const path = [], R = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; path.push([Math.sin(t * 5.1) * 0.018 + t * 0.02, -0.42 + t * 1.02, Math.cos(t * 4.3) * 0.01]); R.push(0.022 + (i % 3 === 1 ? 0.005 : 0) + t * 0.004); }
    mk(sweep(path, R, { n: 6, capStart: true }), wood, g);
    mk(gripGeo(-0.06, 0.08, 0.026, 5), M.wrap(L), g);
    const top = path[path.length - 1], x = top[0], y = top[1];
    mk(carve([{ y: y - 0.02, r: 0.03 }, { y: y + 0.005, r: 0.034 }, { y: y + 0.02, r: 0.028 }], ringSection(8)), M.trim(L), g, [x, 0, top[2]]);
    // three roots curling up around a cut crystal
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      mk(sweep(curve([x + Math.cos(a) * 0.02, y, top[2] + Math.sin(a) * 0.02], [x + Math.cos(a) * 0.07, y + 0.05, top[2] + Math.sin(a) * 0.07], [x + Math.cos(a) * 0.05, y + 0.14, top[2] + Math.sin(a) * 0.05], [x + Math.cos(a + 0.6) * 0.015, y + 0.19, top[2] + Math.sin(a + 0.6) * 0.015], 7), (t) => 0.013 * (1 - t) + 0.002, { n: 5 }), wood, g);
    }
    const orbC = L.glow || L.gem || L.blade;
    const orb = mk(carve([{ y: -0.06, r: 0.004 }, { y: -0.02, r: 0.042 }, { y: 0.045, r: 0.036 }, { y: 0.085, r: 0.002 }], ringSection(6)), glowM(orbC, 2.0), g, [x, y + 0.095, top[2]], [0, 0.3, 0.12]);
    orb.userData.breakable = true; orb.castShadow = false;
    const bm = M.blade(L); g.userData.bladeMats.push(bm);
    g.userData.tip = y + 0.19;
    g.userData.orb = orb;
  },
  pickaxe(g, L) {
    const bm = M.blade(L); g.userData.bladeMats.push(bm);
    mk(haftGeo(-0.24, 0.48, 0.023, 0.02, 0.01), M.wood(L), g);
    mk(gripGeo(-0.12, 0.04, 0.025, 5), M.wrap(L), g);
    const tm = M.trim(L);
    mk(carve([{ y: 0.42, a: 0.034, b: 0.028 }, { y: 0.44, a: 0.038, b: 0.032 }, { y: 0.5, a: 0.038, b: 0.032 }, { y: 0.52, a: 0.032, b: 0.026 }], octSection), tm, g);
    for (const sx of [-1, 1]) { // curved picks, square-ish in section, drawn to a point
      const p = mk(sweep(curve([0, 0.47, 0], [sx * 0.12, 0.48, 0], [sx * 0.24, 0.42, 0], [sx * 0.29, 0.36, 0], 8), (t) => 0.028 * (1 - t) + 0.002, { n: 4, aspect: 1.25, phase: Math.PI / 4 }), bm, g);
      p.userData.breakable = true;
      if (L.glow) { const e = mk(gemGeo(0.012), glowM(L.glow, 2.4), g, [sx * 0.285, 0.365, 0], [0, 0, sx * 2.3]); e.castShadow = false; }
    }
    if (L.gem) mk(gemGeo(0.016), glowM(L.gem, 1.6), g, [0, 0.47, 0.034], [Math.PI / 2, 0, 0]);
    g.userData.tip = 0.5;
  },
};

/**
 * Build a weapon. w = { bp, ids, el?, grade?, recipe? }. Grip at origin, blade along +Y.
 * Returns THREE.Group (userData: look, tip, bladeMats).
 */
export function buildWeaponMesh(w = {}) {
  const g = new THREE.Group();
  g.name = 'weapon_' + (w.bp || 'sword');
  const L = weaponLook(w);
  g.userData.look = L;
  g.userData.bladeMats = [];
  (BUILD[w.bp] || BUILD.sword)(g, L);
  if (L.masterwork) {
    const halo = mk(gemGeo(0.018), glowM('#ffe08a', 2.5), g, [0, (g.userData.tip || 0.6) * 0.98, 0.02]);
    halo.castShadow = false;
    g.userData.sparkle = halo;
  }
  if (L.star) {
    const sm = glowM('#ffe08a', 2.4);
    for (let i = 0; i < 5; i++) { const s = mk(gemGeo(0.008), sm, g, [((i * 37) % 7 - 3) * 0.008, 0.2 + i * 0.09, 0.012], [Math.PI / 2, 0, 0]); s.castShadow = false; }
  }
  return g;
}

// ------------------------------------------------------------------ the curse: cracks & shatter
function rngFrom(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0) / 4294967296; }

/** Spread glowing purple cracks over the weapon (amount 0..1). Idempotent; call every frame if you like. */
export function crackWeapon(group, amount = 0.5) {
  const ud = group.userData;
  if (!ud.cracks) {
    const r = rngFrom(group.id * 7919 + 13);
    const tip = ud.tip || 0.6;
    const breakables = [];
    group.traverse((o) => { if (o.isMesh && o.userData.breakable) breakables.push(o); });
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color('#d070ff').multiplyScalar(2.6), transparent: true, depthWrite: false, fog: false });
    ud.cracks = [];
    for (let i = 0; i < 12; i++) {
      const host = breakables[i % Math.max(1, breakables.length)];
      const box = new THREE.Box3();
      if (host) { host.geometry.computeBoundingBox(); box.copy(host.geometry.boundingBox); }
      else box.set(new THREE.Vector3(-0.03, 0.1, -0.01), new THREE.Vector3(0.03, tip, 0.01));
      const pts = [];
      let x = box.min.x + r() * (box.max.x - box.min.x), y = box.min.y + r() * (box.max.y - box.min.y);
      const z = (r() < 0.5 ? box.max.z : box.min.z) + (r() < 0.5 ? 0.004 : -0.004);
      const steps = 3 + Math.floor(r() * 4);
      for (let k = 0; k < steps; k++) {
        const nx = x + (r() - 0.5) * 0.06, ny = y + (r() - 0.35) * 0.08;
        pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(nx, ny, z));
        x = Math.max(box.min.x, Math.min(box.max.x, nx)); y = Math.max(box.min.y, Math.min(box.max.y, ny));
      }
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
      line.layers.set(LAYER_FX);
      if (host) { host.add(line); } else group.add(line);
      line.visible = false;
      ud.cracks.push(line);
    }
  }
  const n = Math.round(Math.max(0, Math.min(1, amount)) * ud.cracks.length);
  ud.cracks.forEach((l, i) => { l.visible = i < n; });
  for (const m of ud.bladeMats || []) {
    if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
    m.color.copy(m.userData.baseColor).lerp(new THREE.Color('#6a3a8a'), amount * 0.35);
    m.emissive.setRGB(0.5 * amount * amount, 0.15 * amount * amount, 0.7 * amount * amount);
  }
}

/**
 * Break the weapon into shards in world space. Hides the original group.
 * If `parent` is given the shards are added to it (assumed to be in world space, e.g. the scene).
 * Returns [{ mesh, velocity: Vector3, spin: Vector3, life }].
 */
export function shatterPieces(group, parent = null, opts = {}) {
  group.updateMatrixWorld(true);
  const r = rngFrom(group.id * 31 + 7);
  const pieces = [];
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(group).getCenter(center);
  const curseM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c86bff').multiplyScalar(2.4), fog: false });
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const size = new THREE.Vector3(); bb.getSize(size);
    const vol = Math.max(size.x * size.y, size.y * size.z, size.x * size.z);
    const n = o.userData.breakable ? 7 + Math.floor(r() * 4) : Math.max(1, Math.min(3, Math.round(vol * 120)));
    for (let i = 0; i < n; i++) {
      const s = (o.userData.breakable ? 0.025 : 0.018) + r() * 0.03;
      const geo = r() < 0.5 ? new THREE.TetrahedronGeometry(s, 0) : new THREE.BoxGeometry(s * 1.3, s * 0.5, s * 0.25);
      const mat = r() < 0.18 ? curseM : o.material;
      const mesh = new THREE.Mesh(geo, mat);
      const lp = new THREE.Vector3(bb.min.x + r() * size.x, bb.min.y + r() * size.y, bb.min.z + r() * size.z);
      mesh.position.copy(lp.applyMatrix4(o.matrixWorld));
      mesh.quaternion.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
      mesh.castShadow = true;
      const dir = mesh.position.clone().sub(center);
      if (dir.lengthSq() < 1e-6) dir.set(r() - 0.5, r(), r() - 0.5);
      dir.normalize();
      const sp = (opts.force ?? 2.2) * (0.5 + r());
      const vel = dir.multiplyScalar(sp).add(new THREE.Vector3((r() - 0.5) * 1.2, 1.2 + r() * 1.8, (r() - 0.5) * 1.2));
      pieces.push({ mesh, velocity: vel, spin: new THREE.Vector3((r() - 0.5) * 18, (r() - 0.5) * 18, (r() - 0.5) * 18), life: 1.4 + r() * 0.8 });
      if (parent) parent.add(mesh);
    }
  });
  group.visible = false;
  return pieces;
}

/** Simple physics step for shards; returns remaining pieces (removes dead ones from their parent). */
export function updateShards(pieces, dt, floorY = 0, gravity = 9.8) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    p.life -= dt;
    p.velocity.y -= gravity * dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    if (p.mesh.position.y < floorY) { p.mesh.position.y = floorY; p.velocity.y *= -0.3; p.velocity.x *= 0.6; p.velocity.z *= 0.6; p.spin.multiplyScalar(0.6); }
    p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
    if (p.life < 0.3) p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.3));
    if (p.life <= 0) { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); p.mesh.geometry.dispose(); pieces.splice(i, 1); }
  }
  return pieces;
}
