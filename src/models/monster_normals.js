// Normal + elite monster archetypes, each sculpted as ONE continuous SDF mesh driven by a skeleton.
// Each: { reach?, die?, build(m, md), anim(m, dt), intro? }. Units are metres (before md.scale).
// Axes: head toward −X, up +Y; "F"/"l" limbs at −Z (mirrored to the camera side at runtime), "B"/"r" at +Z.
// Sculpt API (bone-local coordinates): m.ell / m.sph / m.cap / m.tube / m.box / m.tor / m.plate / m.cry,
// options { k: smooth blend, op: 'add'|'sub'|'paint'|'bind', noise, nf, rot, dir }.
import { hornPath } from './monster_kit.js';
import { shadeHex as shade, mixHex as mix } from '../core/math.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const SIDES = [-1, 1];
const walk = (m, names, speed, amp, phase = PI) => names.forEach((n, i) => { const p = m.P(n); if (p) p.rotation.z += sin(m.t * speed + i * phase) * amp; });
/** Small beady eye: socket carve + glossy bead (optional faint glow so it reads in the dark). */
function beady(m, bone, c, r, glowCol, gk = 1.1) {
  const eye = m.mat('eye', '#120a0e', glowCol ? { glow: glowCol, gk, full: true } : {});
  m.sph(bone, c, r * 1.35, null, { op: 'sub', k: r * 0.5 });
  m.sph(bone, c, r, eye, { k: r * 0.25 });
}
const glowMat = (m, col, gk = 2.4, tile = 'crystal') => m.mat(tile, col, { glow: col, gk, full: true });

// ============================================================================ SLIME (ooze / gem / magma)
const slime = {
  reach: 0.38, die: 'flatten',
  build(m, md) {
    const hot = !!md.glow;
    const gel = hot ? m.mat('crust', '#3a120a', { glow: '#ff8a2a', gk: 2.6 }) : m.mat('slime', md.body, { acc: md.accent });
    const sheen = hot ? glowMat(m, md.body, 1.6, 'lava') : m.mat('slime', md.belly, { acc: md.body, j: 0.05 });
    const mouthM = m.mat('flesh', hot ? '#ff8a2a' : shade(md.accent, -0.35));
    m.bone('body', [0, 0, 0]);
    // gelatinous mound: sagging base, rounded crown, droopy peak, puddle lobes
    m.ell('body', [0, 0.24, 0], [0.5, 0.3, 0.46], gel, { noise: 0.016, nf: 6 });
    m.ell('body', [0.04, 0.44, 0], [0.33, 0.22, 0.3], gel, { k: 0.18, noise: 0.012, nf: 9 });
    m.ell('body', [0.12, 0.62, 0.02], [0.12, 0.09, 0.11], gel, { k: 0.12 });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2 + 0.3; m.ell('body', [cos(a) * 0.46, 0.05, sin(a) * 0.42], [0.11, 0.06, 0.1], gel, { k: 0.09 }); }
    m.box('body', [0, -0.25, 0], [1, 0.25, 1], 0.01, null, { op: 'sub', k: 0.03 });
    m.ell('body', [0.05, 0.56, 0], [0.3, 0.13, 0.27], sheen, { op: 'paint' });
    // a dull little face — eyes are beads suspended in the jelly (tar glows through its murk)
    const tar = md.inside === 'nails';
    for (const s of SIDES) beady(m, 'body', [-0.41, 0.38, s * 0.12], tar ? 0.04 : 0.032, tar ? md.eye : null, 2.6);
    m.ell('body', [-0.47, 0.25, 0], [0.04, 0.026, 0.09], mouthM, { op: 'sub', k: 0.015 });
    if (tar) {
      // nails, ore chunks and a lost pickaxe stuck in the tar; drips pooling at the base
      const steel = m.mat('metal', '#9aa2ae', { acc: '#eef2f8' });
      const ore = [m.mat('metal', '#d27a3a', { acc: '#ffc08a' }), m.mat('metal', '#7c7e8e', { acc: '#e4e8f4' }), m.mat('metal', '#f2c23e', { acc: '#fff4b4' })];
      const surf = (a, b, out = 0) => { const ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b); return [[(0.5 + out) * ca * cb, 0.24 + (0.3 + out) * sb, (0.46 + out) * sa * cb], [ca * cb / 0.5, sb / 0.3, sa * cb / 0.46]]; };
      for (const [a, b] of [[0.6, 0.5], [2.2, 0.7], [3.9, 0.35], [5.0, 0.9], [1.4, 1.15], [2.9, 0.2], [4.6, 0.55]]) {
        const [p, n] = surf(a, b), l = Math.hypot(...n), d = n.map((v) => v / l);
        m.cap('body', [p[0] - d[0] * 0.06, p[1] - d[1] * 0.06, p[2] - d[2] * 0.06], [p[0] + d[0] * 0.12, p[1] + d[1] * 0.12, p[2] + d[2] * 0.12], 0.022, 0.018, steel, { k: 0.004 });
        m.ell('body', [p[0] + d[0] * 0.125, p[1] + d[1] * 0.125, p[2] + d[2] * 0.125], [0.04, 0.014, 0.04], steel, { dir: d, k: 0.003 });
      }
      for (const [[a, b], r, i] of [[[1.0, 0.25], 0.075, 0], [[2.6, 0.45], 0.065, 1], [[4.2, 0.8], 0.06, 2], [[5.6, 0.3], 0.07, 0], [[3.3, 1.1], 0.055, 1], [[0.2, 0.9], 0.05, 2]]) {
        const [p] = surf(a, b, -0.02);
        m.ell('body', p, [r, r * 0.8, r * 0.9], ore[i], { k: 0.006, noise: r * 0.25, nf: 1.2 / r, rot: [a, b * 2, a * 0.5] });
      }
      m.bone('pick', [0.08, 0.58, -0.06], 'body', { rot: [0.35, 0, -0.5] });
      m.cap('pick', [0, -0.15, 0], [0, 0.32, 0], 0.024, 0.024, m.mat('wood', '#7a5030', { acc: '#4a2e18' }), { k: 0.005 });
      m.tube('pick', [[-0.2, 0.28, 0], [-0.08, 0.34, 0], [0.04, 0.35, 0], [0.16, 0.3, 0]], (t) => 0.028 * (1 - Math.abs(t - 0.45)) + 0.012, steel, { k: 0.006 });
      for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2 + 0.4; m.ell('body', [cos(a) * 0.56, 0.035, sin(a) * 0.52], [0.06, 0.035, 0.05], gel, { k: 0.04 }); }
    }
    if (md.inside === 'copper') {
      const cu = m.mat('rust', '#c8743a', { acc: '#3a9a7a' });
      const sunk = m.mat('slime', mix(md.body, '#c8743a', 0.55), { acc: md.accent });
      for (const [p, r] of [[[0.3, 0.46, 0.25], 0.075], [[-0.12, 0.6, -0.2], 0.06], [[0.36, 0.22, -0.32], 0.07], [[0.04, 0.35, 0.42], 0.065]]) m.ell('body', p, [r, r * 0.85, r], cu, { k: 0.012, noise: 0.018, nf: 20 });
      for (const p of [[-0.2, 0.3, 0.38], [0.2, 0.55, -0.12], [-0.3, 0.15, -0.36]]) m.sph('body', p, 0.09, sunk, { op: 'paint' });
    }
    if (md.inside === 'gem') {
      // a hoard of gems: big faceted crystals breaking out of the jelly, cut stones suspended inside
      const pink = glowMat(m, '#ff8ae8', 1.8), cyan = glowMat(m, '#8ae8ff', 1.8), gold = glowMat(m, '#ffd860', 1.8);
      for (const [c, d, l, r, mm] of [[[0.12, 0.42, 0.1], [0.3, 1, 0.25], 0.36, 0.075, pink], [[0.22, 0.3, -0.22], [0.6, 0.7, -0.6], 0.3, 0.065, cyan], [[-0.08, 0.5, -0.1], [-0.25, 1, -0.4], 0.24, 0.055, pink], [[0.32, 0.12, 0.28], [0.7, 0.4, 0.6], 0.22, 0.055, cyan], [[0.0, 0.5, 0.18], [0.0, 1, 0.6], 0.2, 0.05, gold], [[0.34, 0.36, 0.0], [1, 0.8, 0], 0.22, 0.05, gold]]) m.cry('body', c, l, r, mm, { dir: d });
      for (const [p, col] of [[[-0.25, 0.3, 0.37], '#ff4a6a'], [[0.05, 0.26, -0.42], '#4aff8a'], [[-0.3, 0.12, -0.3], '#ffd84a'], [[0.3, 0.5, -0.12], '#8a6aff']]) m.ell('body', p, [0.05, 0.04, 0.05], glowMat(m, col, 1.8), { k: 0.004, rot: [p[0] * 4, p[2] * 4, 0.6] });
      for (const p of [[-0.25, 0.3, 0.35], [0.1, 0.6, 0.15]]) m.sph('body', p, 0.09, m.mat('slime', mix(md.body, '#ff9af0', 0.5)), { op: 'paint' });
    }
    if (hot) {
      const bub = glowMat(m, '#ffd04a', 2.2, 'lava');
      for (const [p, r] of [[[0.1, 0.66, 0.08], 0.05], [[-0.1, 0.58, -0.15], 0.04], [[0.25, 0.5, -0.12], 0.035], [[0.0, 0.62, 0.22], 0.03]]) m.sph('body', p, r, bub, { k: 0.02 });
      m.emitter({ pos: [0, 0.75, 0], rate: 7, vel: [0, 0.7, 0], spread: 0.35, life: [0.5, 1.2], size: 1, color: ['#ffd04a', '#ff6a1a', '#fff0a0'], gravity: -0.3, glow: 3 });
    }
    m.points({ hit: [-0.2, 0.45, 0], mouth: [-0.48, 0.28, 0], cuts: [[-0.3, 0.4, 0], [0, 0.66, 0], [0.3, 0.4, 0], [0, 0.2, 0.2], [0.1, 0.5, -0.2]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const b = m.P('body');
    const sq = sin(t * 4.2) * 0.07 * (1 - e.dead);
    b.scale.y *= 1 + sq + e.wind * -0.18 + e.strike * 0.12;
    b.scale.x *= 1 - sq * 0.6 + e.wind * 0.12 + e.strike * 0.3;
    b.scale.z *= 1 - sq * 0.6 + e.wind * 0.12;
    b.position.y += e.strike * 0.12 + e.multi * Math.abs(sin(t * 16)) * 0.15;
  },
};

// ============================================================================ KOBOLD (tunnel miner)
const kobold = {
  reach: 0.3,
  build(m, md) {
    m.res = 80;
    const scl = m.mat('scale', md.body, { acc: md.accent, ts: 1.6 });
    const bellyM = m.mat('plate', md.belly, { acc: shade(md.belly, -0.15), ts: 2 });
    const leather = m.mat('cloth', '#6a4a2a', { acc: '#3a2a1a' });
    const brass = m.mat('metal', '#b08a3a', { acc: '#f0d070' });
    const iron = m.mat('metal', '#8a92a0', { acc: '#c8d0d8' });
    const wood = m.mat('wood', '#7a5030', { ts: 1.5 });
    const tooth = m.mat('smooth', '#f0e6c8');
    const claw = m.mat('smooth', '#2a1a14');
    m.bone('body', [0, 0.36, 0]);
    // pot-bellied, hunched little torso
    m.ell('body', [0.02, 0.17, 0], [0.14, 0.2, 0.13], scl, { rot: [0, 0, -0.18] });
    m.ell('body', [-0.04, 0.07, 0], [0.13, 0.12, 0.12], scl, { k: 0.08 });
    m.ell('body', [-0.08, 0.1, 0], [0.1, 0.13, 0.1], bellyM, { op: 'paint' });
    m.tor('body', [0, 0.03, 0], 0.13, 0.02, leather, { k: 0.01, rot: [0, 0, 0.08] });
    m.box('body', [0.0, 0.02, -0.14], [0.045, 0.045, 0.028], 0.016, leather, { k: 0.01 });
    m.cap('body', [0.1, 0.31, -0.07], [-0.11, 0.02, 0.11], 0.016, 0.016, leather, { k: 0.008 });
    m.box('body', [-0.12, 0.04, 0], [0.012, 0.025, 0.025], 0.008, brass, { k: 0.006 });
    // head: lizard-dog skull, frill ears, mining helmet with lamp
    m.bone('head', [-0.01, 0.37, 0], 'body');
    m.ell('head', [0.0, 0.06, 0], [0.115, 0.1, 0.105], scl, { k: 0.05 });
    m.cap('head', [-0.06, 0.03, 0], [-0.21, 0.0, 0], 0.068, 0.04, scl, { k: 0.04 });
    m.ell('head', [-0.15, -0.035, 0], [0.075, 0.015, 0.048], m.mat('flesh', '#6a1a24'), { op: 'sub', k: 0.01 });
    for (const s of SIDES) {
      m.sph('head', [-0.215, 0.012, s * 0.016], 0.008, null, { op: 'sub', k: 0.003 });
      m.cap('head', [-0.17, -0.04, s * 0.036], [-0.18, -0.005, s * 0.04], 0.011, 0.005, tooth, { k: 0.004 });
      m.plate('head', [0.03, 0.04, s * 0.085], [[0, 0], [0.13, 0.03], [0.1, 0.06], [0.14, 0.1], [0.02, 0.075]], 0.004, 0.006, scl, { rot: [s * 0.6, 0, 0.15], k: 0.02 });
      beady(m, 'head', [-0.09, 0.075, s * 0.062], 0.019, md.eye, 1.3);
    }
    m.ell('head', [0.02, 0.15, 0], [0.155, 0.085, 0.145], brass, { k: 0.01 });
    m.tor('head', [0.02, 0.1, 0], 0.15, 0.012, brass, { k: 0.006 });
    m.cap('head', [-0.11, 0.17, 0], [-0.15, 0.17, 0], 0.032, 0.03, iron, { k: 0.008 });
    m.sph('head', [-0.155, 0.17, 0], 0.024, glowMat(m, '#ffe08a', 3), { k: 0.004 });
    // arms + pickaxe
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.02, 0.3, s * 0.16], 'body');
      m.ell(n, [0, 0, 0], [0.05, 0.055, 0.05], scl, { k: 0.04 });
      m.tube(n, [[0, -0.02, 0], [0.03, -0.12, 0], [-0.03, -0.22, 0]], [0.034, 0.03, 0.026], scl, { k: 0.03 });
      m.ell(n, [-0.045, -0.25, 0], [0.04, 0.035, 0.035], scl, { k: 0.02 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.07, -0.26, f * 0.018], [-0.09, -0.28, f * 0.02], 0.009, 0.005, claw, { k: 0.004 });
    }
    m.bone('pick', [-0.045, -0.25, 0], 'armF', { rot: [0, 0, 0.5] });
    m.cap('pick', [0, -0.12, 0], [0, 0.42, 0], 0.017, 0.017, wood, { k: 0.01 });
    m.tube('pick', [[-0.2, 0.36, 0], [-0.08, 0.42, 0], [0.04, 0.43, 0], [0.15, 0.38, 0]], (t) => 0.024 * (1 - Math.abs(t - 0.45)) + 0.01, iron, { k: 0.01 });
    // digitigrade legs
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [-0.0, 0.0, s * 0.075], 'body');
      m.ell(n, [0, -0.04, 0], [0.06, 0.08, 0.055], scl, { k: 0.05 });
      m.tube(n, [[0, -0.08, 0], [0.05, -0.18, 0], [0.02, -0.32, 0]], [0.04, 0.032, 0.026], scl, { k: 0.03 });
      m.ell(n, [-0.04, -0.338, 0], [0.065, 0.024, 0.04], scl, { k: 0.02 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.09, -0.34, f * 0.02], [-0.12, -0.355, f * 0.024], 0.01, 0.006, claw, { k: 0.004 });
    }
    m.bone('tail', [0.12, 0.05, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.16, -0.1, 0], [0.32, -0.24, 0.03], [0.42, -0.31, 0.02]], (t) => 0.05 * (1 - t) + 0.014, scl, { k: 0.03 });
    m.points({ hit: [0, 0.6, 0], mouth: [-0.25, 0.76, 0], cuts: [[0, 0.95, 0], [0, 0.5, 0], [-0.15, 0.6, -0.2], [0.25, 0.25, 0], [0, 0.15, 0.1]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('armF').rotation.z += -e.wind * 2.2 + e.strike * 1.6 + sin(t * 3) * 0.08 + e.multi * sin(t * 20);
    m.P('armB').rotation.z += sin(t * 3 + 1) * 0.15;
    m.P('head').rotation.z += sin(t * 2.3) * 0.08 - e.wind * 0.2;
    m.P('tail').rotation.y += sin(t * 4) * 0.4;
    walk(m, ['legF', 'legB'], 8, 0.15 * (1 + e.strike * 2));
    m.P('body').position.y += Math.abs(sin(t * 4)) * 0.02;
  },
};

// ============================================================================ GOLEM (crystal / rune / cinder / grave colossus)
const golem = {
  reach: 0.45,
  build(m, md) {
    m.res = 64;
    const rock = md.bones ? m.mat('bone', md.body, { acc: shade(md.body, -0.25) }) : md.glow ? m.mat('crust', md.body, { glow: md.accent, gk: 2.4 }) : m.mat('stone', md.body, { acc: shade(md.body, 0.2) });
    const dark = md.bones ? m.mat('stone', md.belly) : m.mat('stone', md.belly, { acc: md.body });
    const eyeG = glowMat(m, md.eye, 3);
    const N = { noise: 0.04, nf: 4.5 };
    // stacked boulders with tight blends so the seams between rocks stay readable
    m.bone('torso', [0, 0.42, 0]);
    m.ell('torso', [0.08, 0.42, 0], [0.38, 0.38, 0.33], rock, { ...N, rot: [0, 0, 0.15] });
    m.box('torso', [-0.18, 0.5, 0], [0.17, 0.27, 0.28], 0.09, rock, { ...N, k: 0.03, rot: [0, 0, 0.18] });
    for (const s of SIDES) m.ell('torso', [0.02, 0.82, s * 0.34], [0.21, 0.19, 0.2], rock, { k: 0.03, ...N });
    m.ell('torso', [0.16, 0.88, 0], [0.28, 0.17, 0.3], rock, { k: 0.04, ...N });
    m.ell('torso', [0.12, 0.08, 0], [0.25, 0.15, 0.28], dark, { k: 0.04, ...N });
    // sunken boulder head with a glowing visor slit
    m.bone('head', [-0.24, 0.86, 0], 'torso');
    m.box('head', [0, 0.1, 0], [0.15, 0.13, 0.16], 0.08, rock, { k: 0.04, noise: 0.03, nf: 6 });
    m.box('head', [-0.12, 0.18, 0], [0.07, 0.045, 0.17], 0.03, rock, { k: 0.02, rot: [0, 0, -0.3] });
    m.box('head', [-0.17, 0.1, 0], [0.07, 0.024, 0.13], 0.01, dark, { op: 'sub', k: 0.01 });
    for (const s of SIDES) m.sph('head', [-0.13, 0.1, s * 0.06], 0.03, eyeG, { k: 0.004 });
    // arms: boulder shoulder → slab upper arm → slab forearm → giant knuckled fist
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.06, 0.78, s * 0.54], 'torso');
      m.ell(n, [0, 0, 0], [0.17, 0.16, 0.17], rock, { k: 0.03, ...N });
      m.box(n, [0.01, -0.22, 0], [0.11, 0.17, 0.11], 0.05, rock, { k: 0.025, noise: 0.025, nf: 7, rot: [0, 0.3, 0.05] });
      m.box(n, [0.0, -0.5, 0], [0.13, 0.14, 0.13], 0.05, rock, { k: 0.025, noise: 0.025, nf: 7, rot: [0, -0.2, -0.05] });
      m.box(n, [-0.03, -0.71, 0], [0.18, 0.15, 0.17], 0.08, rock, { k: 0.03, ...N });
      for (let f = -1; f <= 1; f++) m.ell(n, [-0.19, -0.74, f * 0.085], [0.065, 0.07, 0.055], rock, { k: 0.02, noise: 0.012, nf: 10 });
    }
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.02, 0.1, s * 0.22], 'torso');
      m.box(n, [0, -0.2, 0], [0.13, 0.17, 0.13], 0.06, dark, { k: 0.03, noise: 0.02, nf: 8 });
      m.box(n, [-0.05, -0.45, 0], [0.2, 0.075, 0.15], 0.05, dark, { k: 0.025, noise: 0.012, nf: 9 });
    }
    if (md.crystals) {
      const cry = glowMat(m, md.crystals, 1.8);
      for (const [c, d, l, r] of [[[-0.05, 0.95, -0.2], [-0.3, 1, -0.4], 0.45, 0.08], [[0.12, 0.98, 0.12], [0.3, 1, 0.3], 0.55, 0.09], [[0.25, 0.85, -0.05], [0.8, 0.8, 0], 0.4, 0.07], [[0.06, 0.92, 0.32], [0.2, 0.8, 0.8], 0.32, 0.06], [[0.14, 0.88, -0.34], [0.3, 0.8, -0.7], 0.3, 0.06]]) m.cry('torso', c, l, r, cry, { dir: d });
      m.cry('head', [0.03, 0.2, 0], 0.22, 0.05, cry, { dir: [0.4, 1, 0] });
      for (const s of SIDES) m.cry(s < 0 ? 'armF' : 'armB', [0.02, 0.1, 0], 0.2, 0.05, cry, { dir: [0.3, 1, s * 0.5] });
    }
    if (md.runes) {
      const rune = m.mat('rune', md.body, { acc: md.runes, glow: md.runes, gk: 2.6 });
      m.box('torso', [-0.35, 0.5, 0], [0.12, 0.28, 0.3], 0.02, rune, { op: 'paint' });
      for (const s of SIDES) m.cap(s < 0 ? 'armF' : 'armB', [0.02, -0.25, 0], [0, -0.55, 0], 0.15, 0.15, rune, { op: 'paint' });
      m.ell('torso', [-0.4, 0.5, 0], [0.08, 0.12, 0.1], null, { op: 'sub', k: 0.02 });
      m.sph('torso', [-0.36, 0.5, 0], 0.08, glowMat(m, md.runes, 2.6), { k: 0.01 });
    }
    if (md.glow) {
      m.ell('torso', [-0.42, 0.48, 0], [0.1, 0.16, 0.13], null, { op: 'sub', k: 0.03 });
      m.ell('torso', [-0.36, 0.48, 0], [0.08, 0.13, 0.11], glowMat(m, '#ffb04a', 2.4, 'lava'), { k: 0.01 });
    }
    if (md.bones) {
      const skull = m.mat('bone', '#e8e0d0', { acc: '#a89880' });
      const voidM = m.mat('smooth', '#0a060c');
      for (const [p, r] of [[[-0.37, 0.56, -0.18], 0.1], [[-0.36, 0.3, 0.2], 0.09], [[-0.22, 0.78, 0.3], 0.085]]) {
        m.ell('torso', p, [r * 0.9, r, r], skull, { k: 0.02 });
        for (const s of SIDES) { m.sph('torso', [p[0] - r * 0.75, p[1] + r * 0.1, p[2] + s * r * 0.38], r * 0.3, voidM, { op: 'sub', k: 0.01 }); m.sph('torso', [p[0] - r * 0.62, p[1] + r * 0.1, p[2] + s * r * 0.38], r * 0.13, eyeG, { k: 0.003 }); }
      }
      for (let k = 0; k < 4; k++) for (const s of SIDES) m.tube('torso', [[-0.1, 0.3 + k * 0.13, s * 0.36], [-0.4, 0.3 + k * 0.13, s * 0.22], [-0.47, 0.28 + k * 0.13, 0]], 0.028, skull, { k: 0.01 });
      for (const [c, r] of [[[0.3, 1.0, -0.15], [0, 0, -0.5]], [[0.36, 0.8, 0.2], [0.3, 0, -0.8]]]) m.box('torso', c, [0.05, 0.2, 0.12], 0.04, m.mat('stone', '#6a6470', { acc: '#8a8090' }), { rot: r, k: 0.02 });
    }
    if (md.glow) m.emitter({ pos: [0, 1.2, 0], rate: 6, vel: [0, 0.6, 0], spread: 0.25, posSpread: [0.3, 0.3, 0.2], life: [0.5, 1.2], size: 1, color: ['#ffb84a', '#ff6a1a'], glow: 2.5 });
    if (md.runes) m.emitter({ pos: [-0.3, 0.9, 0], rate: 3, vel: [0, 0.3, 0], spread: 0.15, posSpread: [0.1, 0.4, 0.3], life: [0.8, 1.6], size: 1, color: md.runes, glow: 2.5 });
    m.points({ hit: [-0.25, 1.0, 0], mouth: [-0.45, 1.36, 0], cuts: [[-0.3, 1.0, 0], [0, 1.35, 0], [-0.3, 0.6, -0.5], [0.2, 0.75, 0.5], [0, 0.35, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('armF').rotation.z += -e.wind * 2.4 + e.strike * 2.2 + sin(t * 1.5) * 0.05 + e.multi * sin(t * 14) * 1.2;
    m.P('armB').rotation.z += -e.wind * 0.6 + e.strike * 0.8 + sin(t * 1.5 + 2) * 0.05;
    m.P('torso').rotation.y += sin(t * 0.8) * 0.06 + e.strike * 0.2;
    m.P('head').rotation.y += sin(t * 0.6) * 0.15;
    walk(m, ['legF', 'legB'], 3, 0.06);
  },
};

// ============================================================================ MUSHROOM (shroomling / myconid brute)
const mushroom = {
  reach: 0.3,
  build(m, md) {
    const big = (md.scale || 1) > 1.2;
    const stalkM = m.mat('bark', md.body, { acc: md.belly });
    const capM = m.mat('cap', md.cap || md.accent, { acc: big ? md.accent : '#fff6e0', glow: big ? md.accent : null, gk: 2.2 });
    const gillM = m.mat('gill', md.belly);
    const ink = m.mat('flesh', '#2a1414');
    m.bone('stalk', [0, 0.1, 0]);
    m.cap('stalk', [0, 0.02, 0], [0, 0.6, 0], 0.2, 0.15, stalkM, { noise: 0.008, nf: 14 });
    m.ell('stalk', [0, 0.06, 0], [0.22, 0.12, 0.21], stalkM, { k: 0.08 });
    m.tor('stalk', [0, 0.5, 0], 0.16, 0.026, stalkM, { k: 0.02 });
    for (const s of SIDES) {
      beady(m, 'stalk', [-0.175, 0.39, s * 0.068], 0.023, null);
      m.cap('stalk', [-0.19, 0.445, s * 0.03], [-0.17, 0.43, s * 0.1], 0.013, 0.011, ink, { k: 0.005 });
    }
    m.ell('stalk', [-0.19, 0.29, 0], [0.03, 0.02, 0.05], ink, { op: 'sub', k: 0.01 });
    m.bone('cap', [0, 0.62, 0], 'stalk');
    m.ell('cap', [0, 0.1, 0], [0.5, 0.28, 0.5], capM, { noise: 0.01, nf: 8 });
    m.ell('cap', [0, -0.04, 0], [0.44, 0.13, 0.44], gillM, { op: 'sub', k: 0.03 });
    m.cap('cap', [0, -0.2, 0], [0, 0.06, 0], 0.155, 0.13, stalkM, { k: 0.02 });
    if (big) {
      const glowCap = glowMat(m, md.accent, 2.2, 'cap');
      for (const [x, z, s] of [[0.15, -0.2, 1], [-0.12, 0.2, 0.8], [0.25, 0.18, 0.7], [-0.25, -0.1, 0.6]]) {
        const y = 0.36 - (x * x + z * z) * 0.9;
        m.cap('cap', [x, y - 0.04, z], [x, y + 0.1 * s, z], 0.03 * s, 0.025 * s, m.mat('bark', '#e8d8b8'), { k: 0.02 });
        m.ell('cap', [x, y + 0.12 * s, z], [0.08 * s, 0.045 * s, 0.08 * s], glowCap, { k: 0.01 });
      }
    }
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [-0.02, 0.04, s * 0.1], 'stalk');
      m.ell(n, [-0.03, -0.08, 0], [0.1, 0.065, 0.085], stalkM, { k: 0.05 });
    }
    const L = big ? 0.42 : 0.2;
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.02, 0.42, s * 0.19], 'stalk');
      m.tube(n, [[0, 0, 0], [-0.03, -L * 0.5, 0], [-0.02, -L, 0]], [0.04, 0.035, 0.03], stalkM, { k: 0.04 });
      if (big) m.ell(n, [-0.03, -L - 0.03, 0], [0.07, 0.06, 0.07], glowMat(m, md.accent, 2.2, 'cap'), { k: 0.02 });
      else m.ell(n, [-0.025, -L - 0.02, 0], [0.04, 0.035, 0.035], stalkM, { k: 0.02 });
    }
    m.emitter({ pos: [0, 1.1, 0], rate: big ? 8 : 2.5, vel: [0, 0.15, 0], spread: 0.25, posSpread: [0.4, 0.1, 0.4], life: [1.5, 3], size: 1, color: big ? [md.accent, '#ffe08a'] : ['#f0e08a', '#ffffff'], glow: 1.6, gravity: -0.05, drag: 0.5 });
    m.points({ hit: [-0.15, 0.5, 0], mouth: [-0.22, 0.4, 0], cuts: [[-0.2, 0.5, 0], [0, 0.95, 0], [0.4, 0.8, 0], [-0.45, 0.8, 0], [0.05, 0.25, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('cap').rotation.z += sin(t * 2) * 0.05 + e.strike * 0.5 - e.wind * 0.3;
    m.P('cap').scale.y *= 1 - e.wind * 0.15 + e.special * 0.1;
    m.P('stalk').scale.y *= 1 - e.wind * 0.1 + e.strike * 0.1;
    m.P('armF').rotation.z += -e.wind * 1.8 + e.strike * 1.8 + sin(t * 4) * 0.2;
    m.P('armB').rotation.z += sin(t * 4 + 2) * 0.2 - e.special;
    walk(m, ['legF', 'legB'], 9, 0.2);
    m.P('stalk').position.y += Math.abs(sin(t * 4.5)) * 0.03;
  },
};

// ============================================================================ TOAD (bloat toad)
const toad = {
  reach: 0.4,
  build(m, md) {
    const skin = m.mat('wart', md.body, { acc: mix(md.body, md.accent, 0.55) });
    const belly = m.mat('hide', md.belly);
    const mouthM = m.mat('flesh', '#7a2a3a');
    m.bone('body', [0, 0, 0]);
    m.ell('body', [0.08, 0.34, 0], [0.42, 0.3, 0.4], skin, { noise: 0.012, nf: 10 });
    m.ell('body', [-0.2, 0.36, 0], [0.26, 0.2, 0.34], skin, { k: 0.14 });
    m.box('body', [0, -0.25, 0], [1, 0.27, 1], 0.01, null, { op: 'sub', k: 0.03 });
    m.ell('body', [-0.14, 0.13, 0], [0.36, 0.14, 0.3], belly, { op: 'paint' });
    for (const s of SIDES) {
      m.ell('body', [-0.24, 0.55, s * 0.17], [0.08, 0.07, 0.08], skin, { k: 0.05 });
      beady(m, 'body', [-0.3, 0.585, s * 0.18], 0.028, md.eye, 0.9);
      m.ell('body', [-0.03, 0.55, s * 0.24], [0.11, 0.05, 0.07], skin, { k: 0.05 });
      m.cap('body', [-0.28, 0.2, s * 0.26], [-0.4, 0.04, s * 0.3], 0.05, 0.04, skin, { k: 0.05 });
      m.ell('body', [-0.43, 0.025, s * 0.31], [0.07, 0.022, 0.06], skin, { k: 0.03 });
    }
    m.ell('body', [-0.34, 0.3, 0], [0.18, 0.026, 0.3], mouthM, { op: 'sub', k: 0.012 });
    m.bone('jaw', [-0.08, 0.29, 0], 'body');
    m.ell('jaw', [-0.18, -0.07, 0], [0.24, 0.1, 0.34], null, { op: 'bind' });
    m.ell('jaw', [-0.18, -0.02, 0], [0.18, 0.03, 0.26], mouthM, { k: 0.01 });
    m.bone('tongue', [-0.12, 0.0, 0], 'jaw');
    m.tube('tongue', [[0.06, 0, 0], [-0.1, 0.01, 0], [-0.24, 0.01, 0]], [0.035, 0.04, 0.055], m.mat('flesh', md.tongue || md.accent), { k: 0.01 });
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.32, 0.16, s * 0.36], 'body');
      m.ell(n, [0, 0, 0], [0.2, 0.14, 0.12], skin, { k: 0.08 });
      m.ell(n, [-0.14, -0.14, 0], [0.13, 0.025, 0.08], skin, { k: 0.04 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.2, -0.145, f * 0.04], [-0.28, -0.15, f * 0.07], 0.018, 0.012, skin, { k: 0.01 });
    }
    m.points({ hit: [-0.1, 0.5, 0], mouth: [-0.55, 0.3, 0], cuts: [[-0.4, 0.35, 0], [0, 0.62, 0], [0.4, 0.45, 0], [0.3, 0.15, -0.4], [-0.1, 0.2, 0.4]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const croak = Math.max(0, sin(t * 2.5)) * 0.08;
    m.P('body').scale.y *= 1 + croak - e.wind * 0.12 + e.special * 0.2;
    m.P('body').scale.z *= 1 + croak * 0.8;
    m.P('jaw').rotation.z += -(e.strike * 0.6 + e.wind * 0.2 + e.roar * 0.5);
    const tg = m.P('tongue');
    tg.scale.x *= e.strike > 0.1 ? 1 + e.strike * 2.4 : 0.05;
    tg.position.x -= e.strike * 0.2;
    m.root.position.y += e.multi * Math.abs(sin(t * 10)) * 0.2 + e.special * 0.15;
    walk(m, ['legF', 'legB'], 3, 0.04 + e.wind * 0.2);
  },
};

// ============================================================================ SKELETON (bonepicker)
const skeleton = {
  reach: 0.3, die: 'kneel',
  build(m, md) {
    m.res = 84;
    const bone = m.mat('bone', md.body, { acc: md.belly });
    const helm = m.mat('rust', '#7a6a4a', { acc: md.accent });
    const voidM = m.mat('smooth', '#0a0608');
    const eyeG = glowMat(m, md.eye, 3);
    const rag = m.mat('cloth', '#5a4a3a', { acc: '#3a2a1a' });
    m.bone('torso', [0, 0.56, 0]);
    m.ell('torso', [0.02, 0.04, 0], [0.08, 0.06, 0.12], bone, { k: 0.02 });
    m.tube('torso', [[0.03, 0.04, 0], [0.06, 0.2, 0], [0.05, 0.42, 0], [0.02, 0.58, 0]], 0.036, bone, { k: 0.02 });
    for (let k = 0; k < 4; k++) {
      const y = 0.3 + k * 0.07, w = 0.13 - Math.abs(k - 1.5) * 0.015;
      for (const s of SIDES) m.tube('torso', [[0.05, y, 0], [0.0, y - 0.02, s * w], [-0.1, y - 0.05, s * w * 0.75], [-0.14, y - 0.06, s * 0.02]], 0.026, bone, { k: 0.01 });
    }
    m.cap('torso', [-0.14, 0.27, 0], [-0.13, 0.5, 0], 0.028, 0.028, bone, { k: 0.01 });
    m.ell('torso', [0.01, 0.0, 0], [0.11, 0.08, 0.14], rag, { k: 0.02, noise: 0.012, nf: 18 });
    m.sph('torso', [-0.03, 0.38, 0], 0.045, eyeG, { k: 0.006 });
    m.bone('head', [0, 0.6, 0], 'torso');
    m.ell('head', [0, 0.13, 0], [0.135, 0.13, 0.125], bone);
    m.ell('head', [-0.06, 0.06, 0], [0.08, 0.06, 0.08], bone, { k: 0.04 });
    for (const s of SIDES) { m.sph('head', [-0.11, 0.12, s * 0.05], 0.042, voidM, { op: 'sub', k: 0.01 }); m.sph('head', [-0.095, 0.12, s * 0.05], 0.024, eyeG, { k: 0.003 }); }
    m.ell('head', [-0.13, 0.07, 0], [0.02, 0.026, 0.016], voidM, { op: 'sub', k: 0.006 });
    m.box('head', [-0.12, 0.025, 0], [0.02, 0.016, 0.05], 0.006, bone, { k: 0.006 });
    m.ell('head', [0.0, 0.2, 0], [0.15, 0.08, 0.14], helm, { k: 0.01 });
    m.tor('head', [0, 0.17, 0], 0.14, 0.013, helm, { k: 0.005 });
    m.cap('head', [-0.12, 0.24, 0], [-0.16, 0.24, 0], 0.03, 0.028, helm, { k: 0.006 });
    m.sph('head', [-0.163, 0.24, 0], 0.022, glowMat(m, '#ffe08a', 3), { k: 0.003 });
    m.bone('jaw', [0.02, 0.04, 0], 'head');
    m.ell('jaw', [-0.07, -0.025, 0], [0.075, 0.026, 0.068], bone, { k: 0.01 });
    m.box('jaw', [-0.13, -0.005, 0], [0.018, 0.014, 0.045], 0.006, bone, { k: 0.005 });
    m.ell('jaw', [-0.08, -0.03, 0], [0.09, 0.04, 0.085], null, { op: 'bind' });
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [0, 0.55, s * 0.16], 'torso');
      m.sph(n, [0, 0, 0], 0.045, bone, { k: 0.02 });
      m.cap(n, [0, 0, 0], [0.01, -0.22, 0], 0.032, 0.03, bone, { k: 0.01 });
      m.sph(n, [0.01, -0.22, 0], 0.04, bone, { k: 0.01 });
      m.cap(n, [0.01, -0.22, 0], [-0.02, -0.44, 0], 0.03, 0.028, bone, { k: 0.01 });
      m.ell(n, [-0.025, -0.47, 0], [0.045, 0.04, 0.035], bone, { k: 0.01 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.045, -0.49, f * 0.02], [-0.065, -0.54, f * 0.022], 0.016, 0.012, bone, { k: 0.004 });
    }
    m.bone('pick', [-0.025, -0.47, 0], 'armF', { rot: [0, 0, 0.6] });
    m.cap('pick', [0, -0.12, 0], [0, 0.6, 0], 0.018, 0.018, m.mat('wood', '#7a5030', { ts: 1.5 }), { k: 0.01 });
    m.tube('pick', [[-0.24, 0.52, 0], [-0.1, 0.6, 0], [0.04, 0.61, 0], [0.18, 0.54, 0]], (t) => 0.026 * (1 - Math.abs(t - 0.45)) + 0.011, m.mat('metal', '#8a92a0', { acc: '#c8d0d8' }), { k: 0.01 });
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0, 0.03, s * 0.08], 'torso');
      m.cap(n, [0, 0, 0], [0.01, -0.26, 0], 0.036, 0.032, bone, { k: 0.02 });
      m.sph(n, [0.01, -0.26, 0], 0.042, bone, { k: 0.01 });
      m.cap(n, [0.01, -0.26, 0], [0, -0.52, 0], 0.032, 0.03, bone, { k: 0.01 });
      m.ell(n, [-0.04, -0.56, 0], [0.075, 0.03, 0.042], bone, { k: 0.015 });
    }
    m.points({ hit: [0, 1.0, 0], mouth: [-0.2, 1.22, 0], cuts: [[0, 1.25, 0], [0, 0.95, 0], [0, 0.6, 0], [0, 0.35, -0.15], [0, 0.95, 0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('armF').rotation.z += -e.wind * 2.5 + e.strike * 2.2 + e.multi * sin(t * 18) * 1.2 + sin(t * 2) * 0.06;
    m.P('armB').rotation.z += sin(t * 2 + 1.5) * 0.12;
    m.P('jaw').rotation.z += -Math.max(0, sin(t * 7)) * 0.25 - e.roar * 0.6;
    m.P('head').rotation.z += sin(t * 1.4) * 0.08;
    m.P('torso').rotation.z += sin(t * 9) * 0.015;
    walk(m, ['legF', 'legB'], 3, 0.08);
  },
};

// ============================================================================ KNIGHT (gilded guard / cursed knight)
const knight = {
  reach: 0.4, die: 'kneel',
  build(m, md) {
    m.res = 76;
    const cursed = m.id === 'cursed_knight';
    const plate = m.mat(cursed ? 'rune' : 'metal', md.body, { acc: cursed ? md.accent : '#ffe8a0', glow: cursed ? md.accent : null, gk: 2.2 });
    const plate2 = m.mat('metal', shade(md.body, -0.15), { acc: cursed ? '#5a4a6a' : '#ffe8a0' });
    const cloth = m.mat('cloth', md.belly, { acc: shade(md.belly, -0.2) });
    const trim = m.mat('trim', md.belly, { acc: cursed ? md.accent : '#c8a040', glow: cursed ? md.accent : null, gk: 2, ts: 1.3 });
    const voidM = m.mat('smooth', '#06040a');
    const eyeG = glowMat(m, md.eye, 3.2);
    m.bone('torso', [0, 0.56, 0]);
    m.ell('torso', [0, 0.32, 0], [0.2, 0.25, 0.26], plate, { rot: [0, 0, 0.05] });
    m.box('torso', [-0.17, 0.3, 0], [0.04, 0.2, 0.014], 0.012, plate, { k: 0.05, rot: [0, 0, -0.1] });
    m.cap('torso', [0, 0.05, 0], [0, 0.2, 0], 0.15, 0.17, plate2, { k: 0.04 });
    m.cap('torso', [0.0, 0.08, 0], [0.0, -0.14, 0], 0.17, 0.24, plate2, { k: 0.02 });
    m.tor('torso', [0, 0.52, 0], 0.1, 0.035, plate2, { k: 0.02 });
    for (const s of SIDES) {
      m.ell('torso', [0.0, 0.48, s * 0.27], [0.15, 0.1, 0.13], plate, { k: 0.03, rot: [s * 0.35, 0, 0] });
      m.tor('torso', [0.0, 0.45, s * 0.27], 0.13, 0.016, plate2, { k: 0.01, rot: [s * 0.35, 0, 0] });
    }
    m.sph('torso', [-0.2, 0.34, 0], 0.035, cursed ? glowMat(m, md.accent, 2.6) : glowMat(m, md.accent, 1.2), { k: 0.008 });
    m.bone('head', [0, 0.55, 0], 'torso');
    m.cap('head', [0, 0.02, 0], [0, 0.2, 0], 0.12, 0.13, plate, { k: 0.02 });
    m.ell('head', [0, 0.21, 0], [0.13, 0.1, 0.13], plate, { k: 0.03 });
    m.box('head', [-0.125, 0.15, 0], [0.04, 0.013, 0.09], 0.004, voidM, { op: 'sub', k: 0.006 });
    for (const s of SIDES) m.sph('head', [-0.1, 0.15, s * 0.04], 0.017, eyeG, { k: 0.003 });
    m.plate('head', [0.0, 0.29, 0], [[-0.12, 0], [0.12, 0], [0.1, 0.035], [-0.1, 0.035]], 0.009, 0.008, plate, { k: 0.01 });
    if (cursed) for (const s of SIDES) m.tube('head', hornPath([0.0, 0.2, s * 0.11], [0, 0.4, s * 1], [0, 1, 0], 0.22, 1.2, 5), (t) => 0.04 * (1 - t) + 0.01, m.mat('bone', '#2a2238', { acc: '#4a3a5a' }), { k: 0.02 });
    else m.tube('head', [[0.02, 0.3, 0], [0.12, 0.42, 0], [0.24, 0.4, 0], [0.32, 0.3, 0]], [0.04, 0.05, 0.04, 0.02], m.mat('feather', md.accent, { acc: shade(md.accent, -0.3) }), { k: 0.02 });
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [0, 0.42, s * 0.34], 'torso');
      m.cap(n, [0, 0, 0], [0.015, -0.24, 0], 0.065, 0.055, plate2, { k: 0.02 });
      m.sph(n, [0.015, -0.24, 0], 0.07, plate, { k: 0.02 });
      m.cap(n, [0.015, -0.24, 0], [-0.01, -0.42, 0], 0.055, 0.062, plate2, { k: 0.02 });
      m.ell(n, [-0.012, -0.48, 0], [0.07, 0.065, 0.065], plate2, { k: 0.02 });
    }
    m.bone('weapon', [-0.012, -0.48, 0], 'armF', { rot: [0, 0, cursed ? 0.9 : 0.25] });
    if (cursed) {
      m.plate('weapon', [0, 0, 0], [[-0.042, 0], [0.042, 0], [0.046, 0.74], [0, 0.88], [-0.046, 0.74]], 0.008, 0.008, m.mat('rune', '#4a425a', { acc: md.accent, glow: md.accent, gk: 2.4 }), { k: 0.01 });
      m.cap('weapon', [-0.12, 0, 0], [0.12, 0, 0], 0.024, 0.024, plate2, { k: 0.008 });
      m.cap('weapon', [0, -0.2, 0], [0, -0.02, 0], 0.02, 0.02, cloth, { k: 0.008 });
      m.sph('weapon', [0, -0.22, 0], 0.03, plate2, { k: 0.006 });
    } else {
      m.cap('weapon', [0, -0.15, 0], [0, 1.25, 0], 0.02, 0.02, m.mat('wood', '#6a4a2a', { ts: 1.5 }), { k: 0.01 });
      m.plate('weapon', [0, 1.0, 0], [[0, 0], [-0.18, -0.08], [-0.24, 0.06], [-0.2, 0.2], [0, 0.12]], 0.008, 0.007, m.mat('metal', '#dfe6ee', { acc: '#ffffff' }), { k: 0.01 });
      m.cap('weapon', [0, 1.25, 0], [0, 1.45, 0], 0.03, 0.009, m.mat('metal', '#dfe6ee'), { k: 0.008 });
      m.bone('shield', [-0.03, -0.3, 0.06], 'armB', { rot: [0, -PI / 2 + 0.3, 0] });
      m.plate('shield', [0, 0, 0], [[-0.17, 0.2], [0.17, 0.2], [0.17, -0.02], [0, -0.25], [-0.17, -0.02]], 0.016, 0.014, plate, { k: 0.01 });
      m.sph('shield', [0, 0.04, 0.04], 0.045, plate2, { k: 0.01 });
      m.plate('shield', [0, 0.02, 0.03], [[0, 0.1], [0.06, 0], [0, -0.1], [-0.06, 0]], 0.05, 0.004, m.mat('metal', md.accent), { op: 'paint' });
    }
    m.bone('cape', [0.12, 0.5, 0], 'torso');
    m.plate('cape', [0, 0, 0], [[-0.25, 0], [0.25, 0], [0.31, -0.74], [0.16, -0.68], [0.03, -0.78], [-0.13, -0.68], [-0.31, -0.75]], 0.007, 0.008, cloth, { rot: [0, PI / 2, 0], k: 0.02 });
    m.box('cape', [0, -0.72, 0], [0.1, 0.08, 0.4], 0.01, trim, { op: 'paint' });
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0, 0.04, s * 0.13], 'torso');
      m.cap(n, [0, 0, 0], [0.02, -0.25, 0], 0.075, 0.065, plate2, { k: 0.02 });
      m.sph(n, [0.02, -0.25, 0], 0.075, plate, { k: 0.02 });
      m.cap(n, [0.02, -0.25, 0], [0, -0.5, 0], 0.065, 0.06, plate2, { k: 0.02 });
      m.ell(n, [-0.05, -0.56, 0], [0.11, 0.045, 0.065], plate, { k: 0.02 });
    }
    if (cursed) m.emitter({ pos: [0.05, 1.3, 0], rate: 6, vel: [0, 0.4, 0], spread: 0.2, posSpread: [0.15, 0.1, 0.15], life: [0.5, 1], size: 1, color: [md.accent, md.eye], glow: 2.5 });
    m.points({ hit: [0, 0.95, 0], mouth: [-0.2, 1.27, 0], cuts: [[0, 1.4, 0], [0, 1.0, 0], [0, 0.7, -0.3], [0, 0.4, 0], [0.1, 0.9, 0.35]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('armF').rotation.z += -e.wind * 2.6 + e.strike * 2.4 + e.multi * sin(t * 16) * 1.2 + sin(t * 1.5) * 0.04;
    if (m.P('shield')) m.P('armB').rotation.z += e.special * 1.2 + sin(t * 1.5 + 1) * 0.04;
    m.P('cape').rotation.z += -0.1 - sin(t * 2) * 0.08 - e.strike * 0.3;
    m.P('head').rotation.y += sin(t * 0.7) * 0.1;
    walk(m, ['legF', 'legB'], 2.5, 0.05 + e.strike * 0.2);
  },
};

// ============================================================================ SENTINEL (floating stone head)
const sentinel = {
  reach: 0.25, die: 'fall',
  build(m, md) {
    m.fly = 0.55;
    const stone = m.mat('stone', md.body, { acc: shade(md.body, 0.15) });
    const stone2 = m.mat('stone', md.belly, { acc: md.body });
    const moss = m.mat('moss', '#4a6a2a', { acc: '#8aa04a' });
    const gold = m.mat('rune', md.accent, { acc: '#fff0a0', glow: md.eye, gk: 2.2 });
    const voidM = m.mat('smooth', '#1a140e');
    const eyeM = m.mat('eye', '#0a1a1a', { glow: md.eye, gk: 3, full: true });
    m.bone('head', [0, 0, 0]);
    m.box('head', [0.04, 0.44, 0], [0.33, 0.4, 0.3], 0.13, stone, { noise: 0.014, nf: 7 });
    m.box('head', [-0.29, 0.58, 0], [0.06, 0.05, 0.27], 0.03, stone, { k: 0.04 });
    m.plate('head', [-0.3, 0.3, 0], [[0, 0], [-0.11, 0], [0, 0.22]], 0.05, 0.02, stone, { k: 0.03 });
    m.box('head', [-0.3, 0.13, 0], [0.06, 0.06, 0.19], 0.03, stone, { k: 0.04 });
    m.box('head', [-0.35, 0.2, 0], [0.03, 0.009, 0.13], 0.004, voidM, { op: 'sub', k: 0.004 });
    for (const s of SIDES) m.box('head', [-0.34, 0.47, s * 0.15], [0.03, 0.009, 0.075], 0.004, voidM, { op: 'sub', k: 0.004, rot: [s * 0.15, 0, 0] });
    m.tor('head', [-0.32, 0.73, 0], 0.08, 0.022, gold, { rot: [0, 0, PI / 2], k: 0.01 });
    m.sph('head', [-0.31, 0.73, 0], 0.062, eyeM, { k: 0.005 });
    m.tor('head', [0.04, 0.8, 0], 0.37, 0.03, gold, { k: 0.01 });
    m.ell('head', [0.1, 0.86, 0.05], [0.28, 0.07, 0.24], moss, { op: 'paint' });
    for (const [p, r] of [[[0.18, 0.84, -0.1], [0.12, 0.04, 0.1]], [[-0.05, 0.85, 0.12], [0.09, 0.03, 0.08]]]) m.ell('head', p, r, moss, { k: 0.02, noise: 0.015, nf: 20 });
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2;
      m.bone('rock' + i, [cos(a) * 0.65, 0.2, sin(a) * 0.65], 'head');
      m.ell('rock' + i, [0, 0, 0], [0.09, 0.08, 0.09], stone2, { noise: 0.02, nf: 12 });
      m.sph('rock' + i, [-0.085, 0.02, 0], 0.02, eyeM, { k: 0.004 });
    }
    m.emitter({ pos: [0, -0.05, 0], rate: 4, vel: [0, -0.25, 0], spread: 0.1, posSpread: [0.3, 0, 0.3], life: [0.6, 1.2], size: 1, color: '#c8b890', glow: 1, gravity: 0.5 });
    m.points({ hit: [-0.35, 0.72, 0], mouth: [-0.38, 0.73, 0], cuts: [[-0.35, 0.5, 0], [-0.2, 0.8, 0.3], [0.1, 0.3, 0], [0, 0.85, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.root.position.y += sin(t * 1.6) * 0.06;
    m.P('head').rotation.y += sin(t * 0.5) * 0.12;
    m.P('head').rotation.z += -e.wind * 0.2 + e.special * 0.1;
    for (let i = 0; i < 4; i++) {
      const a = t * 1.3 + (i * PI) / 2;
      const p = m.P('rock' + i);
      p.position.set(cos(a) * 0.65, 0.2 + sin(a * 2) * 0.12 - e.wind * 0.1, sin(a) * 0.65);
      p.rotation.set(a, a * 0.7, 0);
    }
  },
};

// ============================================================================ WRAITH
const wraith = {
  reach: 0.45, die: 'fade',
  build(m, md) {
    m.fly = 0.35;
    const robe = m.mat('cloth', md.body, { acc: shade(md.body, -0.2) });
    const trim = m.mat('trim', shade(md.body, -0.15), { acc: md.accent, glow: md.accent, gk: 1.5, ts: 1.6 });
    const voidM = m.mat('smooth', '#05030a');
    const bone = m.mat('bone', md.belly);
    const chain = m.mat('metal', '#6a6a7a', { acc: '#9a9aaa' });
    const eyeG = glowMat(m, md.eye, 3.4);
    m.bone('cloak', [0, 0, 0]);
    m.cap('cloak', [0.06, 0.12, 0], [-0.02, 0.84, 0], 0.34, 0.19, robe, { noise: 0.02, nf: 6 });
    m.ell('cloak', [0.0, 0.86, 0], [0.22, 0.13, 0.3], robe, { k: 0.08 });
    m.ell('cloak', [-0.06, 1.02, 0], [0.21, 0.22, 0.2], robe, { k: 0.08 });
    m.cap('cloak', [0.08, 1.12, 0], [0.24, 1.26, 0], 0.09, 0.02, robe, { k: 0.06 });
    m.ell('cloak', [-0.21, 1.0, 0], [0.13, 0.15, 0.13], voidM, { op: 'sub', k: 0.04 });
    for (const s of SIDES) m.sph('cloak', [-0.14, 1.03, s * 0.05], 0.022, eyeG, { k: 0.004 });
    m.ell('cloak', [0.04, -0.16, 0], [0.3, 0.3, 0.3], voidM, { op: 'sub', k: 0.03 });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * PI * 2, L = 0.14 + (i % 3) * 0.07;
      m.cap('cloak', [0.04 + cos(a) * 0.3, 0.12, sin(a) * 0.3], [0.04 + cos(a + 0.1) * 0.34, 0.12 - L, sin(a + 0.1) * 0.34], 0.06, 0.012, robe, { k: 0.03 });
    }
    m.cap('cloak', [0.06, 0.02, 0], [0.06, 0.2, 0], 0.4, 0.37, trim, { op: 'paint' });
    m.tor('cloak', [-0.2, 1.0, 0], 0.13, 0.05, trim, { op: 'paint', rot: [0, 0, PI / 2] });
    for (let k = 0; k < 8; k++) m.tor('cloak', [-0.22 + k * 0.035, 0.8 - k * 0.07, -0.22 + k * 0.05], 0.035, 0.013, chain, { rot: [(PI / 2) * (k % 2), 0.4, 0.6], k: 0.004 });
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.05, 0.82, s * 0.27], 'cloak');
      m.cap(n, [0.04, 0, 0], [-0.26, -0.1, 0], 0.075, 0.1, robe, { k: 0.05 });
      m.ell(n, [-0.27, -0.1, 0], [0.03, 0.09, 0.09], voidM, { op: 'sub', k: 0.02 });
      for (let f = 0; f < 3; f++) m.tube(n, [[-0.24, -0.1, (f - 1) * 0.03], [-0.33, -0.12, (f - 1) * 0.04], [-0.41, -0.18, (f - 1) * 0.05]], [0.015, 0.012, 0.008], bone, { k: 0.006 });
    }
    m.emitter({ pos: [0.1, 0.1, 0], rate: 12, vel: [0.15, -0.2, 0], spread: 0.2, posSpread: [0.3, 0.05, 0.3], life: [0.6, 1.2], size: [1, 2], color: [md.accent, md.body], glow: 1.8, drag: 1 });
    m.points({ hit: [-0.2, 0.9, 0], mouth: [-0.3, 1.05, 0], cuts: [[-0.2, 1.0, 0], [0, 0.6, 0], [0.1, 0.3, 0], [-0.35, 0.7, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.root.position.y += sin(t * 1.8) * 0.08;
    m.P('cloak').rotation.z += sin(t * 1.3) * 0.05 + e.strike * 0.2;
    m.P('cloak').scale.x *= 1 + sin(t * 6) * 0.02;
    m.P('armF').rotation.z += -e.wind * 0.8 + e.strike * 0.6 + sin(t * 2) * 0.1;
    m.P('armB').rotation.z += -e.wind * 0.8 + e.strike * 0.6 + sin(t * 2 + 2) * 0.1;
    m.P('armF').rotation.y += e.roar * 0.6; m.P('armB').rotation.y -= e.roar * 0.6;
  },
};

// ============================================================================ MIMIC
const mimic = {
  reach: 0.35,
  build(m, md) {
    const wood = m.mat('wood', md.body, {});
    const metal = m.mat('metal', md.accent, { acc: '#fff0a0' });
    const flesh = m.mat('flesh', '#6a1a2a', { acc: '#3a0a14' });
    const tooth = m.mat('bone', '#f4ecd8', { acc: '#c8b890' });
    const furM = m.mat('fur', '#3a2a2a', { acc: '#5a3a3a' });
    const W = 0.47, H = 0.46, D = 0.31;
    m.bone('base', [0, 0.02, 0]);
    m.box('base', [0, H / 2, 0], [W, H / 2, D], 0.03, wood);
    m.box('base', [0, H - 0.05, 0], [W - 0.06, 0.2, D - 0.06], 0.05, flesh, { op: 'sub', k: 0.02 });
    for (const x of [-0.3, 0.3]) m.box('base', [x, H / 2, 0], [0.03, H / 2 + 0.005, D + 0.006], 0.01, metal, { k: 0.004 });
    m.box('base', [-W - 0.005, H * 0.7, 0], [0.016, 0.06, 0.05], 0.01, metal, { k: 0.004 });
    for (let i = 0; i < 7; i++) for (const s of SIDES) m.cap('base', [-0.38 + i * 0.125, H - 0.03, s * (D - 0.04)], [-0.38 + i * 0.125, H + 0.05, s * (D - 0.045)], 0.022, 0.009, tooth, { k: 0.006 });
    for (let i = 0; i < 4; i++) m.cap('base', [-(W - 0.04), H - 0.03, -0.18 + i * 0.12], [-(W - 0.045), H + 0.05, -0.18 + i * 0.12], 0.022, 0.009, tooth, { k: 0.006 });
    m.bone('lid', [W, H + 0.02, 0], 'base');
    m.box('lid', [-W, 0.06, 0], [W, 0.06, D], 0.03, wood, { k: 0.01 });
    m.ell('lid', [-W, 0.11, 0], [W, 0.12, D], wood, { k: 0.03 });
    m.box('lid', [-W, -0.01, 0], [W - 0.06, 0.07, D - 0.06], 0.05, flesh, { op: 'sub', k: 0.02 });
    for (const x of [-0.3, 0.3]) m.box('lid', [-W + x, 0.12, 0], [0.034, 0.14, D + 0.02], 0.01, metal, { op: 'paint' });
    for (let i = 0; i < 7; i++) for (const s of SIDES) m.cap('lid', [-W - 0.38 + i * 0.125, 0.0, s * (D - 0.04)], [-W - 0.38 + i * 0.125, -0.08, s * (D - 0.045)], 0.022, 0.009, tooth, { k: 0.006 });
    for (const s of SIDES) m.sph('lid', [-2 * W + 0.1, 0.02, s * 0.12], 0.028, m.mat('eye', '#140c10', { glow: md.eye, gk: 2.2, full: true }), { k: 0.004 });
    m.box('lid', [-W, 0.1, 0], [W + 0.05, 0.14, D + 0.05], 0.02, null, { op: 'bind' });
    m.bone('tongue', [0.1, H - 0.08, 0], 'base');
    m.tube('tongue', [[0, 0, 0], [-0.2, 0.02, 0], [-0.42, 0, 0], [-0.6, 0.04, 0]], (t) => 0.06 - t * 0.02, m.mat('flesh', md.belly, { acc: shade(md.belly, -0.3) }), { k: 0.01 });
    for (const [n, x, s] of [['lf', -0.3, -1], ['lb', 0.3, -1], ['rf', -0.3, 1], ['rb', 0.3, 1]]) {
      m.bone(n, [x, 0.06, s * 0.22], 'base');
      m.tube(n, [[0, 0, 0], [-0.05, -0.06, s * 0.07], [-0.08, -0.19, s * 0.09]], [0.04, 0.032, 0.024], furM, { k: 0.02 });
      m.cap(n, [-0.08, -0.19, s * 0.09], [-0.12, -0.2, s * 0.1], 0.016, 0.008, tooth, { k: 0.005 });
    }
    m.points({ hit: [-0.2, 0.5, 0], mouth: [-0.5, 0.55, 0], cuts: [[-0.3, 0.5, 0], [0.1, 0.75, 0], [0.3, 0.4, 0], [-0.1, 0.3, 0.3], [0.2, 0.6, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const d = e.disguise;
    const open = (1 - d) * (0.55 + sin(t * 5) * 0.12 + e.wind * 0.5 - e.strike * 0.65 + e.multi * Math.abs(sin(t * 14)) * 0.6 + e.roar * 0.5);
    m.P('lid').rotation.z += -Math.max(0, open) * 1.1;
    const tg = m.P('tongue');
    const flick = sin(t * 1.7) > 0.97 ? 0.3 : 0.06;
    tg.scale.x *= Math.max(flick * d, (1 - d) * (0.8 + sin(t * 3) * 0.15 + e.strike * 0.6));
    tg.rotation.z += -0.3 * (1 - d) + sin(t * 4) * 0.1;
    for (const n of ['lf', 'lb', 'rf', 'rb']) m.P(n).scale.y *= Math.max(0.01, 1 - d);
    m.P('base').position.y += (1 - d) * (0.13 + Math.abs(sin(t * 7)) * 0.03) - d * 0.02;
    if (d > 0.5) m.root.scale.y = m.scale * (1 + sin(t * 1.2) * 0.008);
    walk(m, ['lf', 'rb', 'rf', 'lb'], 12, 0.2 * (1 - d));
  },
  intro(m, k) {
    m.root.position.y += Math.sin(k * Math.PI) * 0.4;
    m.root.rotation.z += Math.sin(k * 12) * 0.08 * (1 - k);
  },
};

export const NORMAL_ARCHES = { slime, kobold, golem, mushroom, toad, skeleton, knight, sentinel, wraith, mimic };
