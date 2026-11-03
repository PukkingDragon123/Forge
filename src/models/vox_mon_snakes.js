// Medusa's brood (v4): RPG serpents on a jointed voxel spine. Same authoring conventions as the other archetype
// files (metres at in-game size, feet at y = 0, head toward −X, "F" side at −Z; monsters.js turns the finished rig
// to face +Z). A serpent is a coil of tail segments resting on the ground and a neck chain rising out of it in an
// S-curve, so the head looks straight at whoever stands in front; every segment is its own bone, which makes the
// sway, the pull-back before a strike and the lunge read as one muscular wave. Heads, hoods, crests, spines,
// leaves and glowing markings are dressed per species from one config. Also: the naga, the brood nest, the
// basilisk and Medusa's three Heralds (Thornscale, Glasscoil, two-headed Cinderfang).
import { hornPath } from './monster_kit.js';
import { shadeHex as shade } from '../core/math.js';
import { glowMat } from './vox_mon_rpg.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const SIDES = [-1, 1];
const lerp = (a, b, t) => a + (b - a) * t;
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [0, 1, 2].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]); };
const outCubic = (t) => 1 - Math.pow(1 - t, 3);

// ============================================================================ the spine
/**
 * Build a jointed serpent. o: { girth, rise, lean, coilR, turns, nNeck, nTail, neckTaper, tailTip, baseX,
 * body, belly, back (mats), marks (glow mat or null), markEvery, heads (1|2), fork (0..1 along the neck), spread }
 * Returns { necks: [[bone names]], tail: [names], heads: [{ bone, at (root-space position), dir }], top }
 */
function spine(m, o) {
  const g = o.girth, R = o.rise;
  const B = [o.baseX ?? 0.05, g * 0.92, 0];
  const nN = o.nNeck ?? 7, nT = o.nTail ?? 9;
  const necks = [], heads = [];
  const lean = o.lean ?? 0.3;
  // --- neck chains (one, or a trunk that forks into two)
  // lateral S: from the front the raised neck weaves left then right instead of standing like a post
  const sway = (o.sway ?? 0.16) * R;
  const neckPts = (z = 0, from = B, frac = 0) => {
    const p0 = from, p3 = [B[0] - lean * R, R, z];
    const p1 = [p0[0] + 0.04 * R, lerp(p0[1], R, 0.45), lerp(p0[2], z, 0.6)], p2 = [B[0] + 0.1 * R, R * 0.97, z];
    const n = Math.max(2, Math.round(nN * (1 - frac)));
    return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, p = bez(p0, p1, p2, p3, t); p[2] += sin(t * PI * 1.6) * sway * (1 - t * 0.6); return p; });
  };
  const rNeck = (k) => g * lerp(1, o.neckTaper ?? 0.78, k);
  const segChain = (pts, prefix, parent, r0k, r1k, mats, side) => {
    const names = [];
    let prev = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const nm = prefix + i;
      m.bone(nm, prev ? vsub(pts[i], pts[i - 1]) : pts[i], prev || parent);
      const a = [0, 0, 0], b = vsub(pts[i + 1], pts[i]);
      const k0 = lerp(r0k, r1k, i / (pts.length - 1)), k1 = lerp(r0k, r1k, (i + 1) / (pts.length - 1));
      const ra = rNeck(k0), rb = rNeck(k1);
      m.cap(nm, a, b, ra, rb, mats.body, { k: Math.min(ra, rb) * 0.35 });
      // belly plates on the side facing forward/down, back markings on the other side
      const t = vnorm(b), n = vnorm(side === 'down' ? [0, -1, 0] : cross([0, 0, 1], t));
      const mid = vmul(b, 0.5);
      m.ell(nm, vadd(mid, vmul(n, ra * 0.5)), [Math.max(0.03, vlen(b) * 0.6), ra * 0.62, ra * 0.78], mats.belly, { op: 'paint' });
      if (mats.back) m.ell(nm, vadd(mid, vmul(n, -ra * 0.55)), [Math.max(0.03, vlen(b) * 0.6), ra * 0.55, ra * 0.7], mats.back, { op: 'paint' });
      if (mats.marks && i % (o.markEvery ?? 2) === 0) mark(m, nm, mid, n, ra, mats.marks, o.markStyle);
      names.push(nm);
      prev = nm;
    }
    return names;
  };
  const mats = { body: o.body, belly: o.belly, back: o.back, marks: o.marks };
  if ((o.heads ?? 1) === 1) {
    const pts = neckPts();
    const names = segChain(pts, 'n', 'root', 0, 1, mats);
    necks.push(names);
    const last = pts[pts.length - 1], dir = vnorm(vsub(last, pts[pts.length - 2]));
    m.bone('head', vsub(last, pts[pts.length - 2]), names[names.length - 1], { rot: [0, 0, o.pitch ?? 0.38] });
    heads.push({ bone: 'head', at: last, dir });
  } else {
    // trunk up to the fork, then two necks splaying out to ±z
    const fork = o.fork ?? 0.45, spread = (o.spread ?? 0.6) * R;
    const all = neckPts();
    const cut = Math.max(2, Math.round((all.length - 1) * fork));
    const trunkPts = all.slice(0, cut + 1);
    const trunk = segChain(trunkPts, 'n', 'root', 0, fork, mats);
    necks.push(trunk);
    const F = trunkPts[trunkPts.length - 1];
    SIDES.forEach((s, hi) => {
      const p0 = F, p3 = [B[0] - lean * R, R * (hi ? 0.92 : 1.04), s * spread];
      const p1 = [F[0] + 0.02 * R, lerp(F[1], R, 0.4), s * spread * 0.55], p2 = [B[0] + 0.06 * R, R * 0.98, s * spread];
      const n = Math.max(3, nN - cut + 1);
      const pts = Array.from({ length: n + 1 }, (_, i) => bez(p0, p1, p2, p3, i / n));
      // the first segment hangs off the trunk's top bone
      const pre = hi ? 'b' : 'a';
      const names = [];
      let prev = trunk[trunk.length - 1];
      let prevPt = trunkPts[trunkPts.length - 2];
      for (let i = 0; i < pts.length - 1; i++) {
        const nm = pre + i;
        m.bone(nm, vsub(pts[i], prevPt), prev);
        const b = vsub(pts[i + 1], pts[i]);
        const ra = rNeck(lerp(fork, 1, i / (pts.length - 1))), rb = rNeck(lerp(fork, 1, (i + 1) / (pts.length - 1)));
        m.cap(nm, [0, 0, 0], b, ra, rb, mats.body, { k: Math.min(ra, rb) * 0.35 });
        const t = vnorm(b), nn = vnorm(cross([0, 0, 1], t)), mid = vmul(b, 0.5);
        m.ell(nm, vadd(mid, vmul(nn, ra * 0.5)), [Math.max(0.03, vlen(b) * 0.6), ra * 0.62, ra * 0.78], mats.belly, { op: 'paint' });
        if (mats.marks && i % (o.markEvery ?? 2) === 0) mark(m, nm, mid, nn, ra, mats.marks, o.markStyle);
        names.push(nm); prev = nm; prevPt = pts[i];
      }
      necks.push(names);
      const last = pts[pts.length - 1], dir = vnorm(vsub(last, pts[pts.length - 2]));
      const hb = 'head' + (hi ? 'B' : 'A');
      m.bone(hb, vsub(last, pts[pts.length - 2]), names[names.length - 1], { rot: [s * 0.25, 0, o.pitch ?? 0.38] });
      heads.push({ bone: hb, at: last, dir, side: s });
    });
  }
  // --- ground coil: the tail winds outward around the base of the raised neck (cobra pose), the inner turn
  // riding on top of the outer one, so from the front the coils frame the body on both sides
  const Rc = o.coilR ?? R * 0.6, turns = o.turns ?? 1.4;
  const C = [B[0] + Rc * 0.28, 0, 0];
  const tail = [];
  const tp = [];
  const r0 = g * 2.2;
  for (let j = 0; j <= nT; j++) {
    const u = j / nT, th = u * turns * 2 * PI;
    const r = lerp(r0, Rc, Math.min(1, u * 1.15));
    const y = g * 0.92 + (u < 0.4 ? g * 1.5 * (1 - u / 0.4) : 0);
    // start at the base heading back (+x), then sweep around through ±z and in front
    tp.push(j === 0 ? B.slice() : [C[0] + r * cos(th), y, r * sin(th)]);
  }
  let prev = null;
  for (let j = 0; j < nT; j++) {
    const nm = 'c' + j;
    m.bone(nm, prev ? vsub(tp[j], tp[j - 1]) : tp[j], prev || 'root');
    const k0 = j / nT, k1 = (j + 1) / nT;
    const tip = o.tailTip ?? 0.16;
    const ra = g * lerp(1, tip, k0 * k0 * 0.6 + k0 * 0.4), rb = g * lerp(1, tip, k1 * k1 * 0.6 + k1 * 0.4);
    const b = vsub(tp[j + 1], tp[j]);
    m.cap(nm, [0, 0, 0], b, ra, rb, o.body, { k: Math.min(ra, rb) * 0.35 });
    const mid = vmul(b, 0.5);
    if (o.back) m.ell(nm, vadd(mid, [0, ra * 0.5, 0]), [Math.max(0.03, vlen(b) * 0.6), ra * 0.5, ra * 0.7], o.back, { op: 'paint' });
    if (o.marks && j % (o.markEvery ?? 2) === 1) mark(m, nm, mid, [0, -1, 0], ra, o.marks, o.markStyle);
    tail.push(nm);
    prev = nm;
  }
  return { necks, tail, heads, B, tp };
}

/** Glowing markings on the far side of a segment (n = belly normal): diamonds, bands or veins. */
function mark(m, bone, mid, n, r, mat, style = 'diamond') {
  const back = vmul(n, -r * 0.82);
  if (style === 'band') m.ell(bone, vadd(mid, back), [r * 0.45, r * 0.95, r * 1.02], mat, { op: 'paint' });
  else if (style === 'vein') { for (const s of SIDES) m.ell(bone, vadd(mid, [0, 0, s * r * 0.86]), [r * 0.5, r * 0.18, r * 0.2], mat, { op: 'paint' }); }
  else { m.ell(bone, vadd(mid, back), [r * 0.32, r * 0.32, r * 0.32], mat, { op: 'paint' }); for (const s of SIDES) m.ell(bone, vadd(mid, [0, 0, s * r * 0.9]), [r * 0.22, r * 0.22, r * 0.22], mat, { op: 'paint' }); }
}

// ============================================================================ heads
/** Viper-style head on bone hb, pointing −X; s = head scale (≈ skull half-height). o: mats + options. */
function viperHead(m, hb, s, o) {
  const { body, belly, eye, horn, gum, tooth, tongue } = o;
  m.ell(hb, [-s * 0.95, s * 0.02, 0], [s * 1.25, s * 0.55, s * 0.9], body, { k: s * 0.3 });
  m.ell(hb, [-s * 2.0, -s * 0.06, 0], [s * 0.72, s * 0.38, s * 0.5], body, { k: s * 0.4 });
  for (const z of SIDES) m.ell(hb, [-s * 0.4, -s * 0.18, z * s * 0.68], [s * 0.66, s * 0.4, s * 0.4], body, { k: s * 0.3 });
  m.ell(hb, [-s * 1.2, s * 0.5, 0], [s * 1.1, s * 0.12, s * 0.62], body, { k: s * 0.2 });
  m.ell(hb, [-s * 1.25, -s * 0.42, 0], [s * 1.2, s * 0.24, s * 0.6], belly, { op: 'paint' });
  // brow ridges and sunken glowing eyes
  for (const z of SIDES) {
    m.ell(hb, [-s * 1.15, s * 0.45, z * s * 0.46], [s * 0.6, s * 0.17, s * 0.24], horn || body, { k: s * 0.08 });
    m.sph(hb, [-s * 1.3, s * 0.24, z * s * 0.66], s * 0.27, null, { op: 'sub', k: s * 0.06 });
    m.ell(hb, [-s * 1.3, s * 0.24, z * s * 0.62], [s * 0.2, s * 0.17, s * 0.15], eye, { k: s * 0.02 });
    m.sph(hb, [-s * 2.6, s * 0.06, z * s * 0.2], s * 0.07, null, { op: 'sub', k: s * 0.02 });
  }
  // mouth seam, upper fangs
  m.ell(hb, [-s * 1.7, -s * 0.24, 0], [s * 1.0, s * 0.06, s * 0.5], gum, { k: s * 0.02 });
  for (const z of SIDES) m.cap(hb, [-s * 2.25, -s * 0.24, z * s * 0.24], [-s * 2.3, -s * 0.62, z * s * 0.21], s * 0.08, s * 0.03, tooth, { k: s * 0.02 });
  // hinged jaw + forked tongue
  m.bone('jaw' + o.suf, [-s * 0.25, -s * 0.3, 0], hb);
  m.cap('jaw' + o.suf, [0, 0, 0], [-s * 1.95, -s * 0.06, 0], s * 0.36, s * 0.24, body, { k: s * 0.1 });
  m.ell('jaw' + o.suf, [-s * 1.0, s * 0.12, 0], [s * 0.9, s * 0.08, s * 0.32], gum, { k: s * 0.02 });
  m.ell('jaw' + o.suf, [-s * 1.0, -s * 0.18, 0], [s * 1.0, s * 0.14, s * 0.3], belly, { op: 'paint' });
  m.ell('jaw' + o.suf, [-s * 1.0, -s * 0.05, 0], [s * 1.4, s * 0.45, s * 0.5], null, { op: 'bind' });
  m.bone('tongue' + o.suf, [-s * 2.25, -s * 0.28, 0], hb);
  m.cap('tongue' + o.suf, [0, 0, 0], [-s * 0.7, -s * 0.05, 0], s * 0.07, s * 0.06, tongue, { k: s * 0.02 });
  for (const z of SIDES) m.cap('tongue' + o.suf, [-s * 0.7, -s * 0.05, 0], [-s * 1.05, -s * 0.12, z * s * 0.18], s * 0.06, s * 0.035, tongue, { k: s * 0.01 });
  if (o.horns) for (const z of SIDES) m.tube(hb, hornPath([-s * 0.7, s * 0.5, z * s * 0.44], [1, 0.42, z * 0.42], [0, 1, 0], s * (o.horns > 1 ? 1.6 : 0.95), 0.75, 4), (t) => s * 0.2 * (1 - t) + 0.014, horn, { k: s * 0.06 });
  if (o.eye3) { m.sph(hb, [-s * 1.45, s * 0.6, 0], s * 0.2, null, { op: 'sub', k: s * 0.04 }); m.ell(hb, [-s * 1.45, s * 0.56, 0], [s * 0.16, s * 0.2, s * 0.12], o.eye3, { k: s * 0.02 }); }
}

/** Cobra hood fanned behind the head (plate in the lateral/vertical plane), front markings glowing. */
function hood(m, parent, at, s, o) {
  m.bone('hood', at, parent);
  const W = s * (o.w ?? 2.1), H = s * (o.h ?? 2.7);
  const poly = [];
  for (let i = 0; i <= 14; i++) { const a = PI * 0.12 + (i / 14) * PI * 1.76; poly.push([cos(a) * W * (0.75 + 0.25 * sin(a * 2 + 1)), -sin(a) * H * 0.62 - H * 0.12]); }
  m.plate('hood', [s * 0.18, 0, 0], poly, s * 0.13, s * 0.06, o.body, { rot: [0, PI / 2, 0], k: s * 0.12 });
  m.plate('hood', [s * 0.1, 0, 0], poly.map(([u, v]) => [u * 0.22, v * 0.92]), s * 0.08, s * 0.04, o.belly, { rot: [0, PI / 2, 0], op: 'paint' });
  if (o.marks) {
    for (const z of SIDES) {
      m.ell('hood', [-s * 0.02, -H * 0.38, z * W * 0.42], [s * 0.2, s * 0.42, s * 0.34], o.marks, { op: 'paint' });
      m.ell('hood', [-s * 0.02, -H * 0.72, z * W * 0.28], [s * 0.2, s * 0.28, s * 0.22], o.marks, { op: 'paint' });
    }
    m.ell('hood', [-s * 0.02, -H * 0.9, 0], [s * 0.2, s * 0.3, s * 0.24], o.marks, { op: 'paint' });
  }
  if (o.ribs) for (let i = 0; i < 7; i++) { const a = PI * 0.22 + (i / 6) * PI * 0.56; m.cap('hood', [s * 0.25, -H * 0.15, 0], [s * 0.25, -sin(a) * H * 0.55 - H * 0.15, cos(a) * W * 0.85], s * 0.07, s * 0.04, o.ribs, { k: s * 0.03 }); }
}

/** A ring of spikes behind the skull: leaves, crystals, gold or molten horns. */
function crest(m, hb, s, kind, mat, mat2) {
  const n = kind === 'gold' ? 7 : 6;
  for (let i = 0; i < n; i++) {
    const a = -PI * 0.55 + (i / (n - 1)) * PI * 1.1;
    const base = [-s * 0.45, s * 0.35 + cos(a) * s * 0.2, sin(a) * s * 0.6];
    const dir = [0.75, 0.55 + cos(a) * 0.6, sin(a) * 0.95];
    const len = s * (kind === 'leaf' ? 1.25 : 1.1) * (1 - Math.abs(a) * 0.25);
    if (kind === 'crystal') m.cry(hb, base, len * 1.2, s * 0.18, mat, { dir });
    else if (kind === 'leaf') {
      m.plate(hb, base, [[0, 0], [len * 0.4, len * 0.22], [len, 0], [len * 0.4, -len * 0.18]], s * 0.05, s * 0.03, mat, { rot: [sin(a) * 0.9, 0, 0.6 + cos(a) * 0.5], k: s * 0.03 });
    } else m.tube(hb, hornPath(base, dir, [0, 1, 0], len, kind === 'molten' ? 0.7 : 0.3, 3), (t) => s * 0.14 * (1 - t) + 0.012, i % 2 && mat2 ? mat2 : mat, { k: s * 0.04 });
  }
}

/** Spikes along a chain's back: crystal, thorn, obsidian or gold. */
function backSpikes(m, names, kind, mat, every = 1, scale = 1, side = 'neck') {
  names.forEach((nm, i) => {
    if (i % every) return;
    const b = m.P(nm);
    const next = names[i + 1] ? m.P(names[i + 1]).position.toArray() : [0, 0.05, 0];
    const t = vnorm(next), n = side === 'down' ? [0, 1, 0] : vnorm(cross(t, [0, 0, 1]));
    const r = 0.06 * scale;
    const base = vadd(vmul(next, 0.5), vmul(n, r * 0.6));
    const dir = vadd(n, vmul(t, -0.35));
    if (kind === 'crystal') m.cry(nm, base, r * (1.6 + (i % 3) * 0.6), r * 0.45, mat, { dir });
    else m.tube(nm, hornPath(base, dir, t, r * (kind === 'thorn' ? 1.3 : 1.6), kind === 'thorn' ? -0.5 : 0.25, 2), (k) => r * 0.42 * (1 - k) + 0.012, mat, { k: r * 0.2 });
    void b;
  });
}

// ============================================================================ generic serpent archetype
/**
 * cfg: { girth, rise, lean, coilR, turns, nNeck, nTail, hs (head scale × girth), horns, hood, crest, spines,
 * leaves, rattle, plates, eye3, heads, markStyle, reach, extra(m, md, ctx) }
 */
function serpentArch(cfg) {
  return {
    reach: cfg.reach ?? 0.32,
    die: 'sink',
    build(m, md) {
      const body = m.mat(cfg.tile || 'scale', md.body, { acc: md.accent2 || shade(md.body, 0.16) });
      const belly = m.mat('plate', md.belly, { acc: shade(md.belly, -0.18) });
      const back = md.back ? m.mat(cfg.backTile || 'scale', md.back, { acc: shade(md.back, 0.14) }) : null;
      const marks = glowMat(m, md.accent, cfg.markGlow ?? 2.4, 'smooth');
      const eye = glowMat(m, md.eye, 3.4, 'eye');
      const horn = m.mat('smooth', md.horn || shade(md.body, -0.45));
      const gum = m.mat('flesh', md.mouth || '#3a0c18');
      const tooth = m.mat('smooth', '#f4ecd8');
      const tongue = m.mat('flesh', md.tongue || '#e0405a');
      const ctx = { girth: cfg.girth, rise: cfg.rise, mats: { body, belly, back, marks, eye, horn, gum, tooth, tongue } };
      const S = spine(m, { girth: cfg.girth, rise: cfg.rise, lean: cfg.lean, coilR: cfg.coilR, turns: cfg.turns, nNeck: cfg.nNeck, nTail: cfg.nTail, neckTaper: cfg.neckTaper, tailTip: cfg.tailTip, body, belly, back, marks, markEvery: cfg.markEvery, markStyle: cfg.markStyle, heads: cfg.heads, fork: cfg.fork, spread: cfg.spread });
      ctx.S = S;
      const s = cfg.girth * (cfg.hs ?? 1.6);
      S.heads.forEach((h, hi) => {
        if (s <= 0) return; // the naga wears a torso instead
        const suf = S.heads.length > 1 ? (hi ? 'B' : 'A') : '';
        viperHead(m, h.bone, s, { body, belly, eye, horn, gum, tooth, tongue, horns: cfg.horns, eye3: cfg.eye3 ? glowMat(m, md.eye3 || md.accent, 3.6, 'eye') : null, suf });
        if (cfg.crest) crest(m, h.bone, s, cfg.crest, cfg.crest === 'crystal' || cfg.crest === 'molten' ? marks : cfg.crest === 'leaf' ? m.mat('moss', md.leaf || '#5a9a3e', { acc: '#9ad86a' }) : m.mat('metal', md.gold || '#e8b840', { acc: '#fff0a0' }), horn);
      });
      if (cfg.hood) {
        const nk = S.necks[0], top = nk[nk.length - 1];
        hood(m, top, [0.02, 0.0, 0], s, { body, belly, marks, ribs: cfg.hood === 'ribbed' ? horn : null, w: cfg.hoodW, h: cfg.hoodH });
      }
      if (cfg.spines) {
        const sm = cfg.spines === 'crystal' ? glowMat(m, md.accent, 2.6, 'crystal') : cfg.spines === 'gold' ? m.mat('metal', md.gold || '#e8b840', { acc: '#fff0a0' }) : cfg.spines === 'thorn' ? m.mat('bark', md.thorn || '#4a3020', { acc: '#7a5030' }) : horn;
        for (const nk of S.necks) backSpikes(m, nk, cfg.spines, sm, cfg.spineEvery ?? 1, cfg.girth / 0.07);
        backSpikes(m, S.tail.slice(0, -2), cfg.spines, sm, (cfg.spineEvery ?? 1) + 1, cfg.girth / 0.07 * 0.8, 'down');
      }
      if (cfg.leaves) {
        const moss = m.mat('moss', md.leaf || '#4a8a3a', { acc: '#9ad86a' });
        const flower = glowMat(m, md.flower || md.accent, 2.0, 'smooth');
        const all = [...S.necks.flat(), ...S.tail];
        all.forEach((nm, i) => {
          const r = cfg.girth;
          if (i % 2 === 0) m.ell(nm, [0, r * 0.75, 0], [r * 1.1, r * 0.4, r * 0.9], moss, { op: 'paint' });
          if (i % 3 === 1) m.plate(nm, [0, r * 0.7, (i % 2 ? 1 : -1) * r * 0.5], [[0, 0], [r * 0.9, r * 0.45], [r * 1.9, 0], [r * 0.9, -r * 0.35]], r * 0.12, r * 0.05, moss, { rot: [(i % 2 ? 1 : -1) * 0.9, i * 0.7, 0.3], k: r * 0.1 });
          if (i % 4 === 2) m.sph(nm, [0, r * 0.95, (i % 2 ? 1 : -1) * r * 0.4], r * 0.22, flower, { k: r * 0.05 });
        });
      }
      if (cfg.rattle) {
        const tb = S.tail[S.tail.length - 1];
        const rm = m.mat('bone', md.rattle || '#d8b878', { acc: '#8a6a3a' });
        const end = vsub(S.tp[S.tp.length - 1], S.tp[S.tp.length - 2]);
        for (let i = 0; i < 4; i++) m.ell(tb, vmul(end, 1 + i * 0.35), [cfg.girth * 0.32, cfg.girth * (0.34 - i * 0.04), cfg.girth * 0.26], rm, { k: cfg.girth * 0.06 });
      }
      if (cfg.plates) {
        const pm = m.mat('plate', md.plate || shade(md.body, -0.3), { acc: md.plateAcc || shade(md.body, 0.1) });
        for (const nk of S.necks) nk.forEach((nm, i) => {
          if (i % 2) return;
          const nx = m.P(nk[i + 1] || nm).position.toArray(), t = vnorm(nx[1] ? nx : [0, 1, 0]), n = vnorm(cross(t, [0, 0, 1]));
          m.ell(nm, vadd(vmul(nx, 0.5), vmul(n, cfg.girth * 0.55)), [cfg.girth * 0.75, cfg.girth * 0.45, cfg.girth * 1.0], pm, { k: cfg.girth * 0.15 });
        });
        S.tail.forEach((nm, i) => { if (i % 2 === 0 && i < S.tail.length - 2) m.ell(nm, [0, cfg.girth * 0.62, 0], [cfg.girth * 0.8, cfg.girth * 0.42, cfg.girth * 0.95], pm, { k: cfg.girth * 0.15 }); });
      }
      m.snake = { necks: S.necks, tail: S.tail, heads: S.heads.map((h) => h.bone), rattle: !!cfg.rattle, hood: !!cfg.hood };
      const h0 = S.heads[0];
      m.points({ hit: [h0.at[0] + cfg.rise * 0.18, cfg.rise * 0.72, 0], mouth: [h0.at[0] - s * 2.4, h0.at[1] - s * 0.2, h0.at[2]], height: cfg.rise + s * 0.9 });
      if (cfg.extra) cfg.extra(m, md, ctx);
      if (cfg.emit) for (const e of cfg.emit(md, S)) m.emitter(e);
    },
    anim(m) { snakeAnim(m); },
    intro(m, k) { const r = m.root; r.position.y -= (1 - outCubic(k)) * m.height * 0.85; r.scale.y *= 0.55 + 0.45 * outCubic(k); },
    phase(m, n) { if (m.snake) m.snake.rage = n - 1; },
  };
}

/** Shared serpent motion: S-wave sway, pull back on the windup, the neck whips forward on a strike. */
function snakeAnim(m) {
  const e = m.env, t = m.t, c = m.snake;
  if (!c) return;
  const rage = c.rage || 0;
  c.necks.forEach((chain, ci) => chain.forEach((nm, i) => {
    const b = m.P(nm); if (!b) return;
    const k = i / Math.max(1, chain.length - 1);
    const ph = ci * 1.7;
    b.rotation.x += sin(t * (1.4 + rage * 0.4) + i * 0.7 + ph) * 0.05 * (0.4 + k);
    b.rotation.y += sin(t * 0.9 + i * 0.5 + ph) * 0.03 * k;
    // strike: the neck whips forward a little (the root lunge carries the rest) while the head stays up, mouth open
    b.rotation.z += sin(t * 1.1 + i * 0.6 + ph) * 0.03 - e.wind * 0.17 * (1 - k * 0.4) + e.strike * 0.1 * k + e.multi * 0.12 * k * sin(t * 18 + ci) - e.hurt * 0.1 + e.roar * -0.08;
  }));
  for (const hb of c.heads) {
    const h = m.P(hb); if (!h) continue;
    h.rotation.z += -e.wind * 0.12 - e.strike * 0.22 - e.multi * 0.15 - e.roar * 0.3 + sin(t * 1.3) * 0.03;
    const suf = hb.slice(4);
    const jaw = m.P('jaw' + suf), tg = m.P('tongue' + suf);
    if (jaw) jaw.rotation.z += 0.06 + Math.max(0, sin(t * 0.7)) * 0.08 + e.strike * 0.75 + e.wind * 0.3 + e.roar * 0.85 + e.multi * 0.55 + e.special * 0.6;
    if (tg) { const ph = (t + (suf === 'B' ? 1.1 : 0)) % 2.7; tg.visible = (ph < 0.42 || e.wind > 0.5) && e.strike < 0.3; tg.scale.x *= 0.6 + 0.5 * Math.abs(sin(t * 26)); }
  }
  const hd = m.P('hood');
  if (hd) { const f = 1 + e.wind * 0.22 + e.roar * 0.3 + e.special * 0.2; hd.scale.z *= f; hd.scale.y *= 1 + (f - 1) * 0.5; }
  c.tail.forEach((nm, j) => {
    const b = m.P(nm); if (!b) return;
    const k = j / c.tail.length;
    b.rotation.y += sin(t * 0.8 + j * 0.7) * 0.025 * k;
    if (c.rattle && j >= c.tail.length - 2) b.rotation.y += sin(t * 46) * 0.16 * (0.3 + e.wind + e.roar);
  });
}

// ============================================================================ species
const adder = serpentArch({ girth: 0.07, rise: 0.56, lean: 0.36, hs: 1.75, horns: 1, rattle: true, markStyle: 'diamond', nNeck: 6, nTail: 8, reach: 0.34,
  emit: (md) => [{ pos: [-0.12, 0.52, 0], rate: 1.2, vel: [0, 0.2, 0], spread: 0.2, posSpread: 0.06, life: [0.6, 1.1], size: 1, color: [md.accent], glow: 1.6, gravity: -0.1 }] });
const vine_viper = serpentArch({ girth: 0.075, rise: 0.6, lean: 0.34, hs: 1.7, crest: 'leaf', leaves: true, spines: 'thorn', spineEvery: 2, markStyle: 'band', markEvery: 3, nNeck: 7, nTail: 9 });
const glass_adder = serpentArch({ girth: 0.07, rise: 0.58, lean: 0.35, hs: 1.75, horns: 1, spines: 'crystal', markStyle: 'vein', crest: 'crystal', nNeck: 7, nTail: 8, markGlow: 2.6,
  emit: (md) => [{ pos: [0.05, 0.4, 0], rate: 2, vel: [0, 0.25, 0], spread: 0.3, posSpread: [0.2, 0.2, 0.2], life: [0.5, 1], size: 1, color: [md.accent, '#ffffff'], glow: 2.4, gravity: -0.05 }] });
const ember_asp = serpentArch({ girth: 0.08, rise: 0.62, lean: 0.32, hs: 1.6, hood: 'ribbed', hoodW: 2.1, hoodH: 2.7, plates: true, markStyle: 'band', markEvery: 2, nNeck: 7, nTail: 9, markGlow: 2.8,
  emit: (md) => [{ pos: [-0.2, 0.62, 0], rate: 4, vel: [0, 0.45, 0], spread: 0.3, posSpread: 0.08, life: [0.4, 0.9], size: 1, color: ['#ffd04a', md.accent], glow: 2.6, gravity: -0.3 }] });
const gorgon_snake = serpentArch({ girth: 0.09, rise: 0.78, lean: 0.32, hs: 1.55, crest: 'gold', eye3: true, spines: 'gold', spineEvery: 2, markStyle: 'band', markEvery: 2, nNeck: 7, nTail: 10, hood: true, hoodW: 1.9, hoodH: 2.4 });

// ---------------------------------------------------------------------------- cistern naga (snake body, trident)
const naga = serpentArch({ girth: 0.11, rise: 0.62, lean: 0.12, hs: 0, nNeck: 4, nTail: 9, neckTaper: 0.85, markStyle: 'vein', markEvery: 1, coilR: 0.42, reach: 0.4,
  extra(m, md, ctx) {
    // the snake head is replaced by a finned humanoid torso with a trident
    const { body, belly, marks, eye, horn, gum, tooth } = ctx.mats;
    const hb = ctx.S.heads[0].bone;
    const skin = m.mat('scale', md.skin || shade(md.body, 0.1), { acc: md.belly });
    const fin = m.mat('membrane', md.fin || '#5ad8c8', { acc: shade(md.fin || '#5ad8c8', -0.2), glow: md.accent, gk: 1.4 });
    const steel = m.mat('metal', '#c8d0e0', { acc: '#ffffff' });
    const coral = m.mat('crust', '#e86a5a', { acc: '#ffb08a' });
    // hide the head bone's default viper (hs 0 → nothing was sculpted) and build up from the neck top
    m.bone('torso', [0.0, 0.05, 0], hb);
    m.ell('torso', [0.02, 0.16, 0], [0.13, 0.2, 0.17], skin, { k: 0.06 });
    m.ell('torso', [0.0, 0.04, 0], [0.12, 0.12, 0.15], belly, { op: 'paint' });
    m.ell('torso', [-0.05, 0.22, 0], [0.09, 0.08, 0.15], belly, { op: 'paint' });
    for (const z of SIDES) m.ell('torso', [0.0, 0.3, z * 0.15], [0.08, 0.07, 0.08], coral, { k: 0.02 });
    m.tor('torso', [0.0, 0.03, 0], 0.13, 0.025, m.mat('metal', '#d8b04a', { acc: '#fff0a0' }), { k: 0.01 });
    m.bone('nhead', [-0.02, 0.38, 0], 'torso');
    m.ell('nhead', [-0.02, 0.06, 0], [0.11, 0.1, 0.09], skin, { k: 0.03 });
    m.ell('nhead', [-0.1, 0.03, 0], [0.06, 0.06, 0.07], skin, { k: 0.04 });
    for (const z of SIDES) {
      m.sph('nhead', [-0.09, 0.08, z * 0.05], 0.035, null, { op: 'sub', k: 0.008 });
      m.ell('nhead', [-0.09, 0.08, z * 0.05], [0.03, 0.026, 0.024], eye, { k: 0.004 });
      m.plate('nhead', [0.02, 0.06, z * 0.09], [[0, 0], [0.12, 0.06], [0.16, -0.02], [0.08, -0.08]], 0.008, 0.004, fin, { rot: [z * 0.4, z * 0.5, 0.2], k: 0.01 });
    }
    m.plate('nhead', [0.03, 0.12, 0], [[-0.08, 0], [0.0, 0.12], [0.1, 0.16], [0.18, 0.04], [0.06, -0.02]], 0.012, 0.006, fin, { k: 0.01 });
    m.ell('nhead', [-0.14, -0.02, 0], [0.03, 0.012, 0.04], gum, { k: 0.004 });
    for (const z of SIDES) m.cap('nhead', [-0.15, -0.02, z * 0.02], [-0.155, -0.05, z * 0.02], 0.009, 0.004, tooth, { k: 0.002 });
    // arms: the F arm (−z) holds the trident forward
    for (const [n, z] of [['armF', -1], ['armB', 1]]) {
      m.bone(n, [0.0, 0.28, z * 0.16], 'torso');
      m.cap(n, [0, 0, 0], [-0.1, -0.12, z * 0.06], 0.045, 0.035, skin, { k: 0.02 });
      m.cap(n, [-0.1, -0.12, z * 0.06], [-0.2, -0.04, z * 0.04], 0.035, 0.03, skin, { k: 0.015 });
      m.sph(n, [-0.22, -0.04, z * 0.04], 0.04, skin, { k: 0.01 });
      m.plate(n, [-0.06, -0.08, z * 0.1], [[0, 0], [0.1, 0.03], [0.06, -0.05]], 0.008, 0.004, fin, { rot: [z * 1.2, 0, 0], k: 0.006 });
    }
    m.cap('armF', [-0.22, -0.45, -0.04], [-0.22, 0.42, -0.04], 0.018, 0.018, steel, { k: 0.004 });
    for (const dz of [-0.06, 0, 0.06]) m.cap('armF', [-0.22, 0.42, -0.04 + dz * 0.6], [-0.22, 0.56, -0.04 + dz], 0.016, 0.006, steel, { k: 0.004 });
    m.box('armF', [-0.22, 0.42, -0.04], [0.02, 0.012, 0.07], 0.006, steel, { k: 0.004 });
    m.ell('armF', [-0.22, 0.44, -0.04], [0.02, 0.02, 0.02], marks, { k: 0.004 });
    m.points({ hit: [-0.02, ctx.rise + 0.25, 0], mouth: [-0.25, ctx.rise + 0.45, 0], height: ctx.rise + 0.55 });
    void body; void horn;
  },
});

// ---------------------------------------------------------------------------- coil brood (a nest of snakes)
const coilbrood = {
  reach: 0.3,
  die: 'sink',
  build(m, md) {
    const body = m.mat('scale', md.body, { acc: shade(md.body, 0.16) });
    const belly = m.mat('plate', md.belly, { acc: shade(md.belly, -0.18) });
    const marks = glowMat(m, md.accent, 2.4, 'smooth');
    const eye = glowMat(m, md.eye, 3.4, 'eye');
    const horn = m.mat('smooth', md.horn || '#2a1e14');
    const gum = m.mat('flesh', '#3a0c18'), tooth = m.mat('smooth', '#f4ecd8'), tongue = m.mat('flesh', '#e0405a');
    const moss = m.mat('moss', '#4a7a3a', { acc: '#8ac86a' });
    const stone = m.mat('stone', '#6a6458', { acc: '#8a8478' });
    const egg = m.mat('spots', '#e8dcc0', { acc: '#9ab07a' });
    // the nest: a broken ring of mossy stones and roots full of eggs
    m.bone('nest', [0.05, 0.0, 0]);
    m.ell('nest', [0, 0.12, 0], [0.55, 0.16, 0.5], stone, { k: 0.06, noise: 0.03, nf: 9 });
    m.ell('nest', [0, 0.22, 0], [0.46, 0.08, 0.42], null, { op: 'sub', k: 0.05 });
    m.ell('nest', [0, 0.24, 0], [0.56, 0.06, 0.52], moss, { op: 'paint' });
    for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.3; m.ell('nest', [cos(a) * 0.3, 0.24, sin(a) * 0.28], [0.06, 0.08, 0.06], egg, { k: 0.01, rot: [0.3, a, 0.2] }); }
    // four snakes rising out of it at different heights
    const snakes = [[-0.18, 0.0, 0.7, 0.0], [0.04, -0.27, 0.56, 0.6], [0.04, 0.27, 0.54, -0.6], [0.26, 0.04, 0.46, 0.2]];
    const necks = [], heads = [];
    snakes.forEach(([x, z, rise, tw], si) => {
      const g = 0.07 - si * 0.004;
      const p0 = [x, 0.2, z], p3 = [x - rise * 0.32, rise, z * 1.2 + tw * 0.08];
      const pts = Array.from({ length: 6 }, (_, i) => bez(p0, [x + 0.03, rise * 0.4, z], [x + 0.05, rise * 0.95, z * 1.1], p3, i / 5));
      const names = [];
      let prev = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const nm = 's' + si + '_' + i;
        m.bone(nm, prev ? vsub(pts[i], pts[i - 1]) : pts[i], prev || 'nest');
        const b = vsub(pts[i + 1], pts[i]), ra = g * (1 - i * 0.04), rb = g * (1 - (i + 1) * 0.04);
        m.cap(nm, [0, 0, 0], b, ra, rb, body, { k: ra * 0.35 });
        const n = vnorm(cross([0, 0, 1], vnorm(b)));
        m.ell(nm, vadd(vmul(b, 0.5), vmul(n, ra * 0.5)), [vlen(b) * 0.6, ra * 0.6, ra * 0.78], belly, { op: 'paint' });
        if (i % 2) mark(m, nm, vmul(b, 0.5), n, ra, marks, 'diamond');
        names.push(nm); prev = nm;
      }
      const hb = 'head' + si;
      m.bone(hb, vsub(pts[5], pts[4]), prev);
      viperHead(m, hb, g * 1.7, { body, belly, eye, horn, gum, tooth, tongue, horns: si === 0 ? 2 : 1, suf: String(si) });
      necks.push(names); heads.push(hb);
    });
    // a big roots arch over the nest
    m.tube('nest', [[0.42, 0.08, -0.5], [0.5, 0.3, -0.15], [0.48, 0.34, 0.2], [0.4, 0.08, 0.52]], [0.05, 0.045, 0.045, 0.05], m.mat('bark', '#4a3424', { acc: '#7a5a3a' }), { k: 0.03 });
    m.snake = { necks, tail: [], heads, rattle: false, hood: false };
    m.points({ hit: [-0.05, 0.42, 0], mouth: [-0.4, 0.6, 0], height: 0.74 });
  },
  anim(m) { snakeAnim(m); },
  intro(m, k) { m.root.scale.y *= 0.4 + 0.6 * outCubic(k); },
};

// ---------------------------------------------------------------------------- basilisk (serpent king with forelegs)
const basilisk = serpentArch({ girth: 0.15, rise: 0.92, lean: 0.24, hs: 1.3, crest: 'gold', eye3: true, plates: true, spines: 'gold', spineEvery: 2, markStyle: 'band', nNeck: 7, nTail: 10, coilR: 0.62, reach: 0.5, markGlow: 2.6,
  extra(m, md, ctx) {
    const { body, horn, marks } = ctx.mats;
    const nk = ctx.S.necks[0];
    const chest = nk[2];
    for (const [n, z] of [['legF', -1], ['legB', 1]]) {
      m.bone(n, [-0.08, 0.0, z * 0.13], chest);
      m.ell(n, [0, -0.02, 0], [0.09, 0.12, 0.08], body, { k: 0.04 });
      m.tube(n, [[0, -0.08, 0], [-0.1, -0.24, z * 0.05], [-0.16, -0.4, z * 0.06]], [0.06, 0.05, 0.045], body, { k: 0.03 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.16, -0.42, z * 0.06 + f * 0.035], [-0.26, -0.46, z * 0.06 + f * 0.05], 0.022, 0.008, horn, { k: 0.004 });
    }
    // gaze: the basilisk's eyes leak light
    m.emitter({ pos: [-0.62, 1.0, 0], rate: 3, vel: [-0.3, 0.1, 0], spread: 0.25, posSpread: 0.05, life: [0.5, 1], size: 1, color: [md.eye, '#ffffff'], glow: 2.6, gravity: -0.05 });
    void marks;
  },
});

// ============================================================================ the Heralds
// Thornscale — the moss & thorn serpent of the Undercroft. A living hillside: moss-carpeted back, ferns, flowers,
// thorn spines and a leafy hood around an ancient stone brow.
const thornscale = serpentArch({ girth: 0.17, rise: 1.15, lean: 0.3, hs: 1.3, hood: true, hoodW: 2.7, hoodH: 3.0, crest: 'leaf', horns: 2, leaves: true, spines: 'thorn', spineEvery: 1, markStyle: 'band', markEvery: 2, nNeck: 9, nTail: 12, coilR: 0.78, turns: 1.5, reach: 0.55,
  extra(m, md, ctx) {
    const hb = ctx.S.heads[0].bone, s = ctx.girth * 1.3;
    const stone = m.mat('stone', '#8a8478', { acc: '#b8b0a0' });
    const rune = glowMat(m, md.accent, 2.4, 'rune');
    // an ancient carved stone brow-plate, cracked, with a glowing rune
    m.box(hb, [-s * 1.0, s * 0.62, 0], [s * 0.7, s * 0.14, s * 0.62], s * 0.08, stone, { k: s * 0.06, rot: [0, 0, -0.15] });
    m.ell(hb, [-s * 1.25, s * 0.74, 0], [s * 0.16, s * 0.08, s * 0.16], rune, { k: s * 0.02 });
    // hanging moss beards under the jaw
    const moss = m.mat('moss', md.leaf || '#4a8a3a', { acc: '#9ad86a' });
    for (const z of [-0.5, 0, 0.5]) m.tube(hb, [[-s * 1.2, -s * 0.4, z * s], [-s * 1.25, -s * 0.9, z * s * 1.1], [-s * 1.15, -s * 1.3, z * s * 1.2]], [s * 0.12, s * 0.09, s * 0.05], moss, { k: s * 0.06 });
  },
  emit: (md) => [
    { pos: [0.2, 1.0, 0], rate: 6, vel: [0, -0.15, 0], spread: 0.4, posSpread: [0.6, 0.4, 0.6], life: [1.2, 2.2], size: 1, color: ['#c8f08a', md.flower || '#ff8ac8'], glow: 1.4, gravity: 0.15 },
    { pos: [-0.3, 1.2, 0], rate: 2, vel: [0, 0.1, 0], spread: 0.3, posSpread: 0.3, life: [1, 2], size: 1, color: [md.accent], glow: 2.2, gravity: -0.05 },
  ],
});

// Glasscoil — the crystal serpent of the Cistern: violet scales armoured in crystal plates, a fan of shards for a
// hood, glowing veins under translucent skin.
const glasscoil = serpentArch({ girth: 0.16, rise: 1.2, lean: 0.3, hs: 1.3, hood: true, hoodW: 2.4, hoodH: 2.9, crest: 'crystal', horns: 1, spines: 'crystal', spineEvery: 1, markStyle: 'vein', markEvery: 1, nNeck: 9, nTail: 12, coilR: 0.8, turns: 1.5, reach: 0.55, plates: true, markGlow: 2.8,
  extra(m, md, ctx) {
    // the hood is fringed with long crystal shards
    const cm = glowMat(m, md.crystal || md.accent, 2.8, 'crystal');
    const s = ctx.girth * 1.3;
    for (let i = 0; i < 9; i++) { const a = PI * 0.16 + (i / 8) * PI * 0.68; m.cry('hood', [s * 0.25, -s * 0.6, 0], s * (1.4 + (i % 2) * 0.6), s * 0.16, cm, { dir: [0.15, sin(a) * 0.55, cos(a)] }); }
  },
  emit: (md) => [{ pos: [0.1, 0.9, 0], rate: 7, vel: [0, 0.3, 0], spread: 0.4, posSpread: [0.6, 0.5, 0.6], life: [0.6, 1.4], size: 1, color: [md.accent, '#ffffff', md.eye], glow: 2.6, gravity: -0.05 }],
});

// Cinderfang — the two-headed fire serpent of the Foundry: obsidian armour, a lava belly, molten crests, ember
// breath leaking from both mouths.
const cinderfang = serpentArch({ girth: 0.18, rise: 1.15, lean: 0.28, hs: 1.25, heads: 2, fork: 0.45, spread: 0.42, crest: 'molten', horns: 2, plates: true, spines: 'obsidian', spineEvery: 1, markStyle: 'band', markEvery: 1, nNeck: 9, nTail: 12, coilR: 0.8, turns: 1.45, reach: 0.55, markGlow: 3,
  tile: 'scale', backTile: 'crust',
  emit: (md, S) => [
    ...S.heads.map((h) => ({ pos: [h.at[0] - 0.3, h.at[1] - 0.05, -h.at[2]], rate: 7, vel: [-0.3, 0.4, 0], spread: 0.35, posSpread: 0.06, life: [0.4, 0.9], size: 1, color: ['#ffd04a', md.accent], glow: 2.8, gravity: -0.35 })),
    { pos: [0.4, 0.4, 0], rate: 6, vel: [0, 0.5, 0], spread: 0.4, posSpread: [0.6, 0.2, 0.6], life: [0.5, 1.1], size: 1, color: ['#ffb04a', '#ff6a1a'], glow: 2.6, gravity: -0.4 },
  ],
});

export const SNAKE_ARCHES = { adder, vine_viper, glass_adder, ember_asp, gorgon_snake, naga, coilbrood, basilisk, thornscale, glasscoil, cinderfang };
