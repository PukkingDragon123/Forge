// Mine-themed RPG monster archetypes (Hollowdeep + Prism Caverns), authored for the shared 0.04 m voxel grid.
// Same conventions as monster_normals.js: metres at in-game size (model.scale 1), feet at y = 0, head toward −X,
// "F"/"l" limbs at −Z (mirrored to the camera side at runtime). Every feature that must read (eyes, teeth, rivets,
// weapon edges) is at least one voxel thick; silhouettes carry the design, patterns and glow carry the detail.
import { hornPath } from './monster_kit.js';
import { shadeHex as shade, mixHex as mix } from '../core/math.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const SIDES = [-1, 1];
const walk = (m, names, speed, amp, phase = PI) => names.forEach((n, i) => { const p = m.P(n); if (p) p.rotation.z += sin(m.t * speed + i * phase) * amp; });
export const glowMat = (m, col, gk = 2.4, tile = 'crystal') => m.mat(tile, col, { glow: col, gk, full: true });
/** Lantern eye: socket, iron rim facing −X, bright glowing bulb. */
export function lampEye(m, bone, c, r, col, rimMat) {
  m.sph(bone, c, r * 1.15, null, { op: 'sub', k: r * 0.25 });
  if (rimMat) m.tor(bone, [c[0] - r * 0.15, c[1], c[2]], r * 1.05, r * 0.32, rimMat, { rot: [0, 0, PI / 2], k: 0.004 });
  m.sph(bone, [c[0] + r * 0.15, c[1], c[2]], r, glowMat(m, col, 3, 'eye'), { k: 0.004 });
}
/** Lumpy ore nugget half-buried in a surface (noise breaks up the ellipsoid into a chunky rock). */
export function nugget(m, bone, c, r, mat, o = {}) {
  m.ell(bone, c, [r, r * 0.82, r * 0.92], mat, { k: 0.006, noise: r * 0.22, nf: 1.2 / r, rot: o.rot || [c[0] * 3, c[1] * 5, c[2] * 7] });
}
/** Hanging chain of alternating links from `a` downward. */
export function chain(m, bone, a, n, mat, link = 0.04) {
  for (let i = 0; i < n; i++) m.tor(bone, [a[0], a[1] - i * link * 1.45, a[2]], link * 0.62, link * 0.26, mat, { rot: [PI / 2, i % 2 ? PI / 2 : 0, 0], k: 0.002 });
}
const ORE = (m) => ({
  cu: m.mat('metal', '#d27a3a', { acc: '#ffc08a' }),
  fe: m.mat('metal', '#7c7e8e', { acc: '#e4e8f4' }),
  au: m.mat('metal', '#f2c23e', { acc: '#fff4b4' }),
  coal: m.mat('stone', '#2a2630', { acc: '#4a4658' }),
});

// ============================================================================ RUST GREMLIN (rustrat)
const gremlin = {
  reach: 0.42,
  build(m, md) {
    const skin = m.mat('flesh', md.body, { acc: md.accent });
    const belly = m.mat('flesh', md.belly, { acc: md.body });
    const scrap = m.mat('rust', '#8a5a40', { acc: '#e08a40' });
    const steel = m.mat('metal', '#b0b8c4', { acc: '#ffffff' });
    const iron = m.mat('metal', '#3a3644', { acc: '#6a6478' });
    const strap = m.mat('cloth', '#5e3c26', { acc: '#4a2e1c' });
    const tooth = m.mat('smooth', '#fff4cc');
    const gum = m.mat('smooth', '#2a0a12');
    const pink = m.mat('flesh', '#d88a80', { acc: '#c87a74' });
    m.bone('body', [0, 0.34, 0]);
    // small hunched torso, pot belly, one scrap pauldron, belt
    m.ell('body', [0.03, 0.13, 0], [0.15, 0.18, 0.15], skin, { rot: [0, 0, -0.3] });
    m.ell('body', [-0.04, 0.04, 0], [0.13, 0.13, 0.14], belly, { k: 0.06 });
    m.ell('body', [0.0, 0.24, -0.13], [0.11, 0.07, 0.1], scrap, { rot: [0.5, 0, -0.2], k: 0.01 });
    m.sph('body', [-0.02, 0.29, -0.15], 0.026, steel, { k: 0.003 });
    m.tor('body', [0, -0.04, 0], 0.135, 0.026, strap, { k: 0.008 });
    m.box('body', [-0.14, -0.04, 0], [0.024, 0.036, 0.04], 0.01, steel, { k: 0.004 });
    // head: big round cranium, wide toothy grin, hooked nose, lantern eyes
    m.bone('head', [-0.1, 0.3, 0], 'body');
    m.ell('head', [-0.01, 0.1, 0], [0.17, 0.15, 0.16], skin, { k: 0.04 });
    m.ell('head', [-0.1, 0.0, 0], [0.12, 0.09, 0.15], skin, { k: 0.05 });
    m.tube('head', [[-0.15, 0.08, 0], [-0.27, 0.05, 0], [-0.31, -0.02, 0]], [0.05, 0.04, 0.03], skin, { k: 0.03 });
    m.ell('head', [-0.18, -0.035, 0], [0.07, 0.04, 0.13], gum, { op: 'sub', k: 0.008 });
    m.ell('head', [-0.17, -0.035, 0], [0.04, 0.03, 0.11], gum, { k: 0.004 });
    for (let i = -2; i <= 2; i++) {
      const z = i * 0.044, x = -0.215 + (z / 0.14) * (z / 0.14) * 0.07;
      m.box('head', [x, -0.022, z], [0.014, 0.018, 0.012], 0.004, tooth, { k: 0.002 });
      if (i < 2) m.box('head', [x + 0.004, -0.058, z + 0.022], [0.014, 0.016, 0.012], 0.004, tooth, { k: 0.002 });
    }
    for (const s of SIDES) {
      m.cap('head', [-0.17, 0.2, s * 0.02], [-0.14, 0.17, s * 0.15], 0.034, 0.03, skin, { k: 0.03 }); // angry brow
      lampEye(m, 'head', [-0.15, 0.12, s * 0.075], 0.055, md.eye, iron);
    }
    m.cap('head', [0.02, 0.24, 0], [0.04, 0.31, 0], 0.03, 0.022, iron, { k: 0.008 }); // a bolt screwed into its skull
    m.ell('head', [0.04, 0.315, 0], [0.04, 0.016, 0.04], iron, { k: 0.004 });
    // long, wide ears with a brass ring
    for (const s of SIDES) {
      const n = s > 0 ? 'earL' : 'earR';
      m.bone(n, [0.04, 0.1, s * 0.14], 'head', { rot: [s * -(PI / 2 - 0.45), 0, 0] });
      m.plate(n, [0, 0, 0], [[-0.07, -0.04], [0.08, -0.04], [0.18, 0.12], [0.26, 0.3], [0.04, 0.12], [-0.06, 0.06]], 0.018, 0.012, skin, { k: 0.02 });
      m.ell(n, [0.06, 0.07, 0], [0.05, 0.09, 0.04], pink, { op: 'paint' });
      m.tor(n, [0.05, -0.05, 0], 0.03, 0.013, m.mat('metal', '#e8b84a', { acc: '#fff0a0' }), { rot: [PI / 2, 0, 0], k: 0.003 });
    }
    // gangly arms, three-fingered hands
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.03, 0.22, s * 0.16], 'body');
      m.ell(n, [0, 0, 0], [0.06, 0.065, 0.06], skin, { k: 0.03 });
      m.tube(n, [[0, -0.02, 0], [0.02, -0.14, 0], [-0.03, -0.27, 0]], [0.042, 0.038, 0.036], skin, { k: 0.03 });
      m.tor(n, [-0.015, -0.2, 0], 0.042, 0.02, scrap, { k: 0.004, rot: [0, 0, 0.35] });
      m.ell(n, [-0.05, -0.31, 0], [0.062, 0.055, 0.058], skin, { k: 0.02 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.09, -0.33, f * 0.03], [-0.12, -0.37, f * 0.035], 0.02, 0.014, iron, { k: 0.004 });
    }
    // the bent-nail shiv
    m.bone('shiv', [-0.06, -0.31, 0], 'armF', { rot: [0, 0, -0.25] });
    m.cap('shiv', [0.07, 0, 0], [-0.03, 0, 0], 0.03, 0.03, strap, { k: 0.004 });
    m.ell('shiv', [0.09, 0, 0], [0.016, 0.05, 0.05], steel, { k: 0.003 });
    m.cap('shiv', [-0.03, 0, 0], [-0.18, 0.02, 0], 0.026, 0.024, steel, { k: 0.004 });
    m.cap('shiv', [-0.18, 0.02, 0], [-0.34, 0.1, 0], 0.024, 0.01, steel, { k: 0.004 });
    // bowed legs, big feet
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.02, -0.04, s * 0.09], 'body');
      m.ell(n, [0, -0.02, 0], [0.075, 0.085, 0.07], skin, { k: 0.04 });
      m.tube(n, [[0.01, -0.06, 0], [0.05, -0.16, 0], [0.0, -0.26, 0]], [0.055, 0.045, 0.04], skin, { k: 0.03 });
      m.ell(n, [-0.06, -0.275, 0], [0.11, 0.04, 0.065], skin, { k: 0.025 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.15, -0.28, f * 0.03], [-0.19, -0.295, f * 0.035], 0.02, 0.014, iron, { k: 0.004 });
    }
    // wiry tail with a nut threaded on it
    m.bone('tail', [0.15, -0.02, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.13, -0.1, 0], [0.28, -0.08, 0.02], [0.36, 0.04, 0.03], [0.38, 0.16, 0]], (t) => 0.034 * (1 - t) + 0.022, skin, { k: 0.02 });
    m.ell('tail', [0.38, 0.2, 0], [0.05, 0.06, 0.05], skin, { k: 0.02 });
    m.tor('tail', [0.3, -0.04, 0.02], 0.04, 0.018, steel, { rot: [0, 0, 1.1], k: 0.003 });
    m.points({ hit: [-0.12, 0.6, 0], mouth: [-0.36, 0.6, 0], cuts: [[-0.15, 0.72, 0], [0.05, 0.48, 0], [-0.2, 0.32, -0.15], [0.48, 0.38, 0], [0.0, 0.16, 0.1]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const b = m.P('body');
    b.position.y += Math.abs(sin(t * 5)) * 0.022 * (1 - e.wind) - e.wind * 0.05 + e.multi * Math.abs(sin(t * 14)) * 0.05;
    b.rotation.z += -e.wind * 0.3 + e.strike * 0.4 + sin(t * 2.6) * 0.03;
    const h = m.P('head');
    h.rotation.x += sin(t * 1.3) * 0.12 + (sin(t * 0.9) > 0.85 ? 0.22 : 0);
    h.rotation.z += -e.wind * 0.2 + e.strike * 0.25 + sin(t * 5) * 0.03;
    for (const [n, s] of [['earL', 1], ['earR', -1]]) {
      const p = m.P(n);
      p.rotation.z += e.wind * 0.35 + e.hurt * 0.7 + sin(t * 2.1) * 0.06;
      p.rotation.x += s * (sin(t * 11) * 0.12 * (sin(t * 1.7) > 0.5 ? 1 : 0.1));
    }
    m.P('armF').rotation.z += e.wind * 1.5 - e.strike * 1.9 + sin(t * 3) * 0.1;
    m.P('armB').rotation.z += sin(t * 3 + 1) * 0.12 + e.wind * 0.4 - e.strike * 0.4 + e.multi * sin(t * 22 + PI) * 0.9;
    m.P('shiv').rotation.x += sin(t * 2) * 0.15;
    walk(m, ['legF', 'legB'], 10, 0.1 * (0.3 + e.multi + e.strike));
    m.P('tail').rotation.y += sin(t * 4) * 0.35;
    m.P('tail').rotation.z += sin(t * 2.3) * 0.15 + e.wind * 0.3;
  },
};

// ============================================================================ LANTERNWING (cave_bat)
const lanternwing = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 0.95;
    const brass = m.mat('metal', '#c08a3a', { acc: '#ffe08a' });
    const iron = m.mat('metal', '#3a3442', { acc: '#7a7088' });
    const glass = m.mat('crystal', '#ffc46a', { glow: '#ffb04a', gk: 1.5, full: true });
    const skin = m.mat('hide', md.body, { acc: md.accent });
    const mem = m.mat('membrane', md.belly, { acc: shade(md.belly, -0.25) });
    const hornM = m.mat('smooth', '#2a1c22');
    const tooth = m.mat('smooth', '#fff0c8');
    const W = 0.16, HH = 0.18;
    m.bone('body', [0, 0, 0]);
    // lantern cage: brass plates, corner posts, amber glass on three sides, open front showing the heart
    for (const y of [HH + 0.02, -HH - 0.02]) m.box('body', [0, y, 0], [W + 0.035, 0.026, W + 0.035], 0.016, brass, { k: 0.004 });
    for (const x of [-W, W]) for (const z of [-W, W]) m.cap('body', [x, -HH, z], [x, HH, z], 0.024, 0.024, brass, { k: 0.004 });
    m.box('body', [W, 0, 0], [0.012, HH, W], 0.004, glass, { k: 0.002 });
    for (const s of SIDES) m.box('body', [0, 0, s * W], [W, HH, 0.012], 0.004, glass, { k: 0.002 });
    for (const s of SIDES) m.cap('body', [0, -HH, s * W - s * 0.004], [0, HH, s * W - s * 0.004], 0.016, 0.016, iron, { k: 0.002 });
    m.cap('body', [W - 0.004, -HH, 0], [W - 0.004, HH, 0], 0.016, 0.016, iron, { k: 0.002 });
    m.cap('body', [-W, -HH * 0.2, -W], [-W, -HH * 0.2, W], 0.014, 0.014, iron, { k: 0.002 });
    // roof cone with vents, finial below
    m.cap('body', [0, HH + 0.04, 0], [0, HH + 0.15, 0], W + 0.04, 0.05, brass, { k: 0.01 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; m.sph('body', [cos(a) * 0.1, HH + 0.08, sin(a) * 0.1], 0.02, null, { op: 'sub', k: 0.004 }); }
    m.cap('body', [0, -HH - 0.04, 0], [0, -HH - 0.12, 0], 0.06, 0.02, brass, { k: 0.008 });
    // ember heart floating in the cage
    m.bone('heart', [0, 0, 0], 'body');
    m.sph('heart', [0, 0, 0], 0.1, glowMat(m, '#ff7a2a', 2.6, 'lava'), { k: 0.004 });
    m.sph('heart', [-0.05, 0.01, 0], 0.07, glowMat(m, '#fff0a0', 3.2, 'smooth'), { k: 0.01 });
    // imp head on the roof: horns, pointed ears, glowing slit eyes, needle grin
    m.bone('head', [0, HH + 0.27, 0], 'body');
    m.ell('head', [0, 0.05, 0], [0.135, 0.125, 0.13], skin, { k: 0.03 });
    m.ell('head', [-0.1, 0.0, 0], [0.07, 0.065, 0.1], skin, { k: 0.04 });
    m.ell('head', [-0.15, -0.025, 0], [0.04, 0.03, 0.08], m.mat('smooth', '#2a0610'), { op: 'sub', k: 0.008 });
    for (let i = -1; i <= 1; i++) m.box('head', [-0.165 + Math.abs(i) * 0.014, -0.012, i * 0.045], [0.014, 0.018, 0.012], 0.003, tooth, { k: 0.002 });
    for (const s of SIDES) {
      m.sph('head', [-0.12, 0.07, s * 0.06], 0.042, null, { op: 'sub', k: 0.006 });
      m.ell('head', [-0.115, 0.07, s * 0.06], [0.03, 0.032, 0.04], glowMat(m, md.eye, 3, 'eye'), { k: 0.003, rot: [s * 0.4, 0, 0] });
      m.tube('head', hornPath([0.0, 0.14, s * 0.07], [0.2, 1, s * 0.45], [1, 0, 0], 0.22, 1.1, 4), (t) => 0.04 * (1 - t) + 0.016, hornM, { k: 0.01 });
      m.plate('head', [0.01, 0.05, s * 0.12], [[-0.04, -0.03], [0.06, -0.03], [0.18, 0.04], [0.02, 0.07]], 0.014, 0.01, skin, { rot: [s * -(PI / 2 - 0.4), 0, 0], k: 0.012 });
    }
    // little dangling imp legs + hooked tail
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [-0.03, -HH - 0.03, s * 0.07], 'body');
      m.tube(n, [[0, 0, 0], [-0.02, -0.08, 0], [0.01, -0.15, 0]], [0.03, 0.025, 0.022], skin, { k: 0.02 });
      for (let f = -1; f <= 1; f++) m.cap(n, [0.0, -0.16, f * 0.018], [-0.04, -0.19, f * 0.024], 0.012, 0.007, hornM, { k: 0.003 });
    }
    m.bone('tail', [0.05, -HH - 0.08, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.08, -0.08, 0], [0.18, -0.1, 0], [0.24, -0.02, 0]], [0.026, 0.022, 0.018, 0.014], skin, { k: 0.02 });
    m.plate('tail', [0.26, 0.02, 0], [[-0.03, -0.02], [0.04, 0.02], [0.0, 0.08], [-0.05, 0.03]], 0.012, 0.008, hornM, { k: 0.008 });
    // leather wings: arm + finger bones under a scalloped, faintly ember-lit membrane
    const WS = 1.9, LIFT = 0.75;
    const tips = [[-0.02, 0.5], [0.11, 0.44], [0.2, 0.3], [0.24, 0.12]].map(([x, y]) => [x * WS, y * WS]);
    const wrist = [-0.1 * WS, 0.18 * WS];
    const WP = [[-0.07 * WS, 0.0], wrist, [-0.07 * WS, 0.34 * WS], tips[0], [0.04 * WS, 0.36 * WS], tips[1], [0.12 * WS, 0.3 * WS], tips[2], [0.18 * WS, 0.16 * WS], tips[3], [0.12 * WS, 0.02]];
    const wp = (x, y, s) => [x, y * Math.sin(LIFT), s * y * Math.cos(LIFT)];
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [0.04, HH * 0.6, s * (W + 0.03)], 'body');
      m.plate(n, [0, 0, 0], WP, 0.012, 0.008, mem, { rot: [s * (PI / 2 - LIFT), 0, 0], k: 0.01 });
      m.cap(n, [-0.02, 0, 0], wp(...wrist, s), 0.032, 0.026, skin, { k: 0.015 });
      for (const [x, y] of tips) m.cap(n, wp(...wrist, s), wp(x, y, s), 0.022, 0.014, skin, { k: 0.005 });
      m.cap(n, wp(...wrist, s), wp(wrist[0] - 0.06, wrist[1] + 0.04, s), 0.014, 0.006, hornM, { k: 0.004 });
    }
    m.emitter({ pos: [0, 0.3, 0], rate: 7, vel: [0.05, 0.45, 0], spread: 0.35, posSpread: [0.08, 0.02, 0.08], life: [0.4, 0.9], size: 1, color: ['#ffd04a', '#ff7a2a', '#fff0a0'], gravity: -0.4, glow: 2.6 });
    m.points({ hit: [-0.1, 0.02, 0], mouth: [-0.16, 0.4, 0], cuts: [[-0.1, 0.0, 0], [0, 0.42, 0], [0.1, 0.15, 0.4], [0.1, 0.15, -0.4], [0, -0.25, 0]] });
  },
  anim(m, dt) {
    const e = m.env, t = m.t;
    const sp = 10 + e.strike * 8 + e.multi * 8 + e.special * 6;
    const flap = sin(t * sp);
    const a = flap * 0.65 - 0.1 + e.wind * 0.5;
    m.P('wingL').rotation.x += -a; m.P('wingR').rotation.x += a;
    m.P('wingL').rotation.y += flap * 0.15; m.P('wingR').rotation.y -= flap * 0.15;
    m.root.position.y += -flap * 0.04 + sin(t * 1.3) * 0.07 - e.strike * 0.2;
    // hanging-lantern pendulum swing
    const b = m.P('body');
    b.rotation.x += sin(t * 1.6) * 0.07;
    b.rotation.z += sin(t * 1.1) * 0.05 + e.strike * 0.4 - e.wind * 0.25;
    const pulse = Math.pow(Math.max(0, sin(t * 4.5)), 6);
    m.P('heart').scale.setScalar(1 + pulse * 0.16 + e.special * 0.3 + e.wind * 0.12 + e.roar * 0.3);
    m.P('head').rotation.z += -e.special * 0.5 - e.roar * 0.4 + sin(t * 2.2) * 0.06 + e.strike * 0.2;
    m.P('legF').rotation.z += sin(t * 3) * 0.2 + e.wind * 0.4;
    m.P('legB').rotation.z += sin(t * 3 + 1) * 0.2 + e.wind * 0.4;
    m.P('tail').rotation.y += sin(t * 2.4) * 0.4;
  },
};

// ============================================================================ PEBBLE GOLEM (rock_beetle)
const pebblegolem = {
  reach: 0.42,
  build(m, md) {
    const rock = m.mat('stone', md.body, { acc: shade(md.body, 0.16) });
    const rock2 = m.mat('stone', md.belly, { acc: md.body });
    const moss = m.mat('moss', '#4a7a3a', { acc: '#9ad04a' });
    const O = ORE(m);
    const gem = glowMat(m, md.accent, 2.2);
    m.bone('body', [0, 0.42, 0]);
    // one big boulder fused from pebbles, seams kept tight so the stones read
    m.ell('body', [0, 0, 0], [0.33, 0.31, 0.3], rock, { noise: 0.03, nf: 5 });
    for (const [p, r] of [[[0.14, 0.2, 0.14], 0.13], [[0.2, 0.05, -0.15], 0.12], [[-0.05, 0.24, -0.12], 0.11], [[0.22, -0.12, 0.1], 0.11], [[0.02, -0.22, 0.14], 0.1], [[0.05, 0.27, 0.08], 0.1]]) m.ell('body', p, [r, r * 0.9, r], rock2, { k: 0.015, noise: 0.012, nf: 14 });
    // face under a heavy brow
    m.box('body', [-0.27, 0.09, 0], [0.08, 0.04, 0.2], 0.035, rock, { k: 0.03, rot: [0, 0, -0.25] });
    for (const s of SIDES) {
      m.sph('body', [-0.3, 0.02, s * 0.1], 0.06, null, { op: 'sub', k: 0.012 });
      m.sph('body', [-0.28, 0.02, s * 0.1], 0.042, glowMat(m, md.eye, 3, 'eye'), { k: 0.004 });
    }
    m.box('body', [-0.31, -0.11, 0], [0.05, 0.016, 0.1], 0.008, rock2, { op: 'sub', k: 0.008 });
    // ore veins: copper, iron and gold nuggets, a few glowing gems
    for (const [p, r, k] of [[[0.12, 0.18, -0.22], 0.07, 'cu'], [[-0.12, -0.08, -0.26], 0.06, 'fe'], [[0.26, -0.02, 0.16], 0.065, 'cu'], [[-0.05, 0.22, 0.2], 0.055, 'au'], [[0.2, -0.18, -0.16], 0.06, 'fe'], [[-0.18, -0.2, 0.2], 0.05, 'coal'], [[0.3, 0.12, -0.02], 0.05, 'au']]) nugget(m, 'body', p, r, O[k]);
    for (const [c, d, l] of [[[0.0, 0.28, -0.06], [0.1, 1, -0.3], 0.16], [[0.08, 0.27, 0.06], [0.4, 1, 0.3], 0.12], [[-0.08, 0.26, 0.02], [-0.4, 1, 0.2], 0.09]]) m.cry('body', c, l, 0.04, gem, { dir: d });
    m.ell('body', [0.08, 0.26, 0.04], [0.24, 0.08, 0.22], moss, { op: 'paint' });
    // stubby pebble arms with knobbly fists
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.04, 0.04, s * 0.3], 'body');
      m.ell(n, [0, 0, 0], [0.085, 0.08, 0.08], rock2, { noise: 0.008, nf: 18 });
      m.ell(n, [-0.03, -0.12, 0], [0.07, 0.07, 0.07], rock, { k: 0.015 });
      m.ell(n, [-0.06, -0.24, 0], [0.1, 0.09, 0.09], rock2, { k: 0.015, noise: 0.012, nf: 14 });
      for (let f = -1; f <= 1; f++) m.sph(n, [-0.14, -0.25, f * 0.05], 0.035, rock, { k: 0.01 });
      nugget(m, n, [-0.06, -0.18, s * 0.06], 0.035, O.cu);
    }
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.02, -0.26, s * 0.15], 'body');
      m.ell(n, [0, -0.04, 0], [0.09, 0.08, 0.085], rock2, { k: 0.02 });
      m.box(n, [-0.03, -0.12, 0], [0.1, 0.04, 0.08], 0.03, rock, { k: 0.015, noise: 0.008, nf: 18 });
    }
    m.emitter({ pos: [0, 0.05, 0], rate: 2.5, vel: [0, -0.15, 0], spread: 0.2, posSpread: [0.25, 0, 0.2], life: [0.6, 1.1], size: 1, color: ['#a89880', '#7a6e62'], glow: 0.8, gravity: 0.6 });
    m.points({ hit: [-0.2, 0.5, 0], mouth: [-0.34, 0.33, 0], cuts: [[-0.3, 0.5, 0], [0.05, 0.78, 0], [0.32, 0.45, 0], [-0.1, 0.28, 0.3], [0.15, 0.3, -0.3]] });
  },
  anim(m, dt) {
    const e = m.env, t = m.t;
    const b = m.P('body');
    m._roll = (m._roll || 0) + dt * 24 * e.multi;
    if (e.multi < 0.02) m._roll *= Math.exp(-dt * 6);
    b.rotation.z += m._roll - e.wind * 0.35 + e.strike * 0.45 + sin(t * 2) * 0.04;
    b.rotation.x += sin(t * 1.6) * 0.05;
    b.position.y += Math.abs(sin(t * 4)) * 0.02 - e.wind * 0.04 + e.multi * Math.abs(sin(t * 12)) * 0.05;
    const tuck = 1 - e.multi * 0.85;
    for (const n of ['armF', 'armB', 'legF', 'legB']) m.P(n).scale.setScalar(Math.max(0.05, tuck));
    m.P('armF').rotation.z += -e.wind * 1.4 + e.strike * 1.2 + sin(t * 3) * 0.08;
    m.P('armB').rotation.z += -e.wind * 0.6 + e.strike * 0.4 + sin(t * 3 + 2) * 0.08;
    walk(m, ['legF', 'legB'], 6, 0.12 * (0.4 + e.strike));
  },
};

// ============================================================================ DRILL TROLL (mole_brute, elite)
const drilltroll = {
  reach: 0.6,
  build(m, md) {
    const skin = m.mat('hide', md.body, { acc: md.accent });
    const belly = m.mat('hide', md.belly, { acc: md.body });
    const ore = m.mat('crystal', '#4c5266', { acc: '#9eb0d0' });
    const hot = glowMat(m, '#ffb04a', 2.2);
    const steel = m.mat('metal', '#9ca4b0', { acc: '#f0f4fa' });
    const dark = m.mat('metal', '#3c3a44', { acc: '#8a8698' });
    const rust = m.mat('rust', '#7a5240', { acc: '#d47a3a' });
    const brass = m.mat('metal', '#c09040', { acc: '#ffe08a' });
    const cloth = m.mat('cloth', '#6a4a30', { acc: '#3a2618' });
    const tusk = m.mat('bone', '#efe2c0', { acc: '#b8a888' });
    m.bone('body', [0.1, 0.78, 0]);
    // huge hunched torso: belly, hump, shoulders
    m.ell('body', [0, 0.06, 0], [0.36, 0.3, 0.34], skin, { noise: 0.012, nf: 6 });
    m.ell('body', [0.06, 0.44, 0], [0.42, 0.34, 0.4], skin, { rot: [0, 0, -0.3], k: 0.1, noise: 0.012, nf: 6 });
    for (const s of SIDES) m.ell('body', [-0.08, 0.56, s * 0.34], [0.2, 0.19, 0.2], skin, { k: 0.08 });
    m.ell('body', [-0.24, 0.16, 0], [0.22, 0.3, 0.3], belly, { op: 'paint' });
    // loincloth + belt with an ore pouch
    m.tor('body', [0, -0.08, 0], 0.34, 0.035, cloth, { k: 0.01 });
    m.box('body', [-0.3, -0.24, 0], [0.04, 0.16, 0.17], 0.02, cloth, { k: 0.01, rot: [0, 0, 0.1] });
    m.box('body', [-0.32, -0.08, 0], [0.03, 0.04, 0.05], 0.012, brass, { k: 0.004 });
    m.ell('body', [-0.12, -0.12, -0.3], [0.08, 0.09, 0.07], cloth, { k: 0.01 });
    // iron ore growing out of its back like a geode crust (+ a couple of hot veins)
    for (const [c, d, l, r, mm] of [[[0.15, 0.72, 0], [0.4, 1, 0], 0.42, 0.1, ore], [[0.28, 0.58, -0.2], [0.8, 0.8, -0.5], 0.32, 0.08, ore], [[0.28, 0.6, 0.2], [0.7, 0.8, 0.6], 0.34, 0.085, ore], [[0.0, 0.76, -0.16], [0, 1, -0.5], 0.28, 0.07, ore], [[0.02, 0.74, 0.18], [0.1, 1, 0.5], 0.24, 0.07, hot], [[0.38, 0.4, 0.06], [1, 0.4, 0.2], 0.26, 0.07, ore], [[-0.1, 0.72, 0.36], [-0.1, 1, 0.6], 0.2, 0.06, ore], [[-0.1, 0.72, -0.36], [-0.2, 1, -0.6], 0.22, 0.065, hot]]) m.cry('body', c, l, r, mm, { dir: d });
    // head: low-slung, underbite with tusks, big nose, beady glowing eyes, strapped-on headlamp
    m.bone('head', [-0.42, 0.62, 0], 'body');
    m.ell('head', [-0.02, 0.03, 0], [0.19, 0.16, 0.18], skin, { k: 0.05 });
    m.ell('head', [-0.1, -0.1, 0], [0.16, 0.1, 0.19], skin, { k: 0.05 });
    m.ell('head', [-0.2, -0.09, 0], [0.04, 0.02, 0.13], m.mat('flesh', '#3a1018'), { op: 'sub', k: 0.01 });
    m.tube('head', [[-0.16, 0.06, 0], [-0.26, 0.02, 0], [-0.28, -0.04, 0]], [0.06, 0.055, 0.045], skin, { k: 0.04 });
    m.box('head', [-0.16, 0.12, 0], [0.05, 0.035, 0.17], 0.03, skin, { k: 0.03, rot: [0, 0, -0.2] });
    for (const s of SIDES) {
      m.cap('head', [-0.21, -0.1, s * 0.1], [-0.25, 0.04, s * 0.14], 0.035, 0.016, tusk, { k: 0.008 });
      m.sph('head', [-0.19, 0.06, s * 0.085], 0.035, null, { op: 'sub', k: 0.008 });
      m.sph('head', [-0.18, 0.06, s * 0.085], 0.026, glowMat(m, md.eye, 3, 'eye'), { k: 0.003 });
      m.cap('head', [0.02, 0.0, s * 0.17], [0.1, -0.08, s * 0.26], 0.05, 0.03, skin, { k: 0.03 });
    }
    m.tor('head', [0.0, 0.12, 0], 0.18, 0.022, cloth, { rot: [0, 0, 0.25], k: 0.006 });
    m.box('head', [-0.17, 0.18, 0], [0.04, 0.045, 0.055], 0.015, dark, { k: 0.008 });
    m.sph('head', [-0.21, 0.18, 0], 0.036, glowMat(m, '#fff0b0', 3.2, 'smooth'), { k: 0.003 });
    // drill arm (F): shoulder → arm → riveted drill housing → spinning fluted bit
    m.bone('armF', [-0.08, 0.5, -0.5], 'body');
    m.ell('armF', [0, 0, 0], [0.18, 0.17, 0.17], skin, { k: 0.04 });
    m.cap('armF', [0, -0.04, 0], [-0.02, -0.3, 0], 0.14, 0.12, skin, { k: 0.04 });
    m.cap('armF', [-0.02, -0.3, 0], [-0.06, -0.62, 0], 0.16, 0.15, rust, { k: 0.02 });
    for (const y of [-0.36, -0.58]) m.tor('armF', [-0.03 - (y + 0.3) * 0.12, y, 0], 0.16, 0.025, brass, { k: 0.004 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; m.sph('armF', [-0.045 + cos(a) * 0.155, -0.47, sin(a) * 0.155], 0.022, steel, { k: 0.003 }); }
    m.cap('armF', [0.08, -0.4, 0.1], [0.14, -0.18, 0.14], 0.03, 0.03, dark, { k: 0.006 });
    m.bone('drill', [-0.07, -0.64, 0], 'armF');
    m.cap('drill', [0, 0, 0], [0, -0.58, 0], 0.15, 0.02, steel, { k: 0.01 });
    const hx = [];
    for (let k = 0; k <= 18; k++) { const u = k / 18, a = u * PI * 5.5, rr = 0.15 * (1 - u) + 0.02; hx.push([cos(a) * rr, -u * 0.56, sin(a) * rr]); }
    m.tube('drill', hx, (u) => 0.035 * (1 - u) + 0.012, dark, { k: 0.004, kj: 0.004 });
    m.tor('drill', [0, -0.02, 0], 0.15, 0.03, brass, { k: 0.004 });
    // fist arm (B): massive knuckled fist with ore studs
    m.bone('armB', [-0.06, 0.52, 0.5], 'body');
    m.ell('armB', [0, 0, 0], [0.18, 0.17, 0.17], skin, { k: 0.04 });
    m.cap('armB', [0, -0.04, 0], [0.0, -0.34, 0], 0.13, 0.12, skin, { k: 0.04 });
    m.cap('armB', [0.0, -0.34, 0], [-0.05, -0.6, 0], 0.12, 0.14, skin, { k: 0.03 });
    m.tor('armB', [-0.035, -0.48, 0], 0.14, 0.03, rust, { k: 0.004 });
    m.ell('armB', [-0.08, -0.74, 0], [0.19, 0.16, 0.17], skin, { k: 0.04 });
    for (let f = -1; f <= 1; f++) m.sph('armB', [-0.24, -0.72, f * 0.08], 0.06, skin, { k: 0.02 });
    for (const [c, d] of [[[-0.12, -0.62, -0.1], [0, 1, -0.6]], [[-0.02, -0.6, 0.12], [0.4, 1, 0.5]]]) m.cry('armB', c, 0.14, 0.045, ore, { dir: d });
    // stumpy legs, splayed feet
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.06, -0.16, s * 0.2], 'body');
      m.ell(n, [0, -0.12, 0], [0.16, 0.18, 0.15], skin, { k: 0.05 });
      m.cap(n, [0, -0.2, 0], [-0.02, -0.5, 0], 0.13, 0.11, skin, { k: 0.04 });
      m.ell(n, [-0.1, -0.55, 0], [0.2, 0.08, 0.14], skin, { k: 0.04 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.26, -0.56, f * 0.06], [-0.32, -0.6, f * 0.07], 0.03, 0.018, tusk, { k: 0.006 });
    }
    m.emitter({ pos: [-0.1, 0.25, -0.5], rate: 3, vel: [0, -0.3, 0], spread: 0.4, posSpread: 0.06, life: [0.3, 0.6], size: 1, color: ['#ffe08a', '#ffffff'], glow: 2.4, gravity: 1.2 });
    m.points({ hit: [-0.3, 1.25, 0], mouth: [-0.75, 1.3, 0], cuts: [[-0.4, 1.35, 0], [0.2, 1.6, 0], [-0.2, 0.9, -0.5], [0.2, 0.9, 0.5], [0.1, 0.4, 0]] });
  },
  anim(m, dt) {
    const e = m.env, t = m.t;
    m._drill = (m._drill || 0) + dt * (5 + e.wind * 28 + e.strike * 34 + e.roar * 20);
    m.P('drill').rotation.y += m._drill;
    const b = m.P('body');
    b.rotation.z += -e.wind * 0.18 + e.strike * 0.22 + sin(t * 1.4) * 0.025;
    b.position.y += sin(t * 2.2) * 0.012 - e.wind * 0.05;
    m.P('armF').rotation.z += -(e.wind * 0.7 + e.strike * 1.45) + sin(t * 1.5) * 0.05;
    m.P('armF').rotation.x += e.wind * 0.2;
    m.P('armB').rotation.z += -e.wind * 1.9 + e.strike * 0.8 + sin(t * 1.5 + 2) * 0.06;
    m.P('head').rotation.z += sin(t * 1.1) * 0.05 - e.roar * 0.4 - e.wind * 0.15;
    m.P('head').rotation.y += sin(t * 0.6) * 0.12;
    walk(m, ['legF', 'legB'], 2.2, 0.04 + e.strike * 0.15);
  },
};

// ============================================================================ SHARD SPRITE (shard_bat)
const sprite = {
  reach: 0.5, die: 'fade',
  build(m, md) {
    m.fly = 1.0;
    const skin = m.mat('smooth', md.body, { acc: md.belly });
    const dress = m.mat('crystal', md.belly, { acc: md.body });
    const cry = glowMat(m, md.crystals, 2.0);
    const cry2 = glowMat(m, md.accent, 2.0);
    const wingM = m.mat('crystal', md.crystals, { glow: md.crystals, gk: 1.6, full: true });
    m.bone('body', [0, 0, 0]);
    // bodice and a long crystal point instead of legs
    m.ell('body', [0, 0.06, 0], [0.065, 0.09, 0.07], skin);
    m.cry('body', [0, 0.04, 0], 0.13, 0.09, dress, { dir: [0, -1, 0], k: 0.02 });
    m.cry('body', [0, -0.08, 0], 0.26, 0.075, cry, { dir: [0.15, -1, 0], k: 0.01 });
    for (const s of SIDES) m.cry('body', [0.0, -0.06, s * 0.05], 0.14, 0.035, cry2, { dir: [0.2, -1, s * 0.5] });
    m.sph('body', [-0.06, 0.06, 0], 0.03, glowMat(m, '#ffffff', 3, 'smooth'), { k: 0.004 });
    // head: big chibi head, shard hair swept back, starry eyes, tiny gem tiara
    m.bone('head', [0, 0.2, 0], 'body');
    m.ell('head', [0, 0.06, 0], [0.11, 0.11, 0.105], skin);
    for (const s of SIDES) {
      m.sph('head', [-0.1, 0.05, s * 0.045], 0.024, null, { op: 'sub', k: 0.004 });
      m.sph('head', [-0.093, 0.05, s * 0.045], 0.022, glowMat(m, md.eye, 3, 'eye'), { k: 0.002 });
      m.ell('head', [-0.09, 0.0, s * 0.07], [0.02, 0.014, 0.02], m.mat('smooth', '#ffb0d8'), { op: 'paint' });
    }
    for (const [c, d, l, r, mm] of [[[0.02, 0.15, 0], [0.6, 1, 0], 0.2, 0.04, cry], [[0.06, 0.12, -0.07], [1, 0.6, -0.5], 0.2, 0.035, cry2], [[0.06, 0.12, 0.07], [1, 0.6, 0.5], 0.2, 0.035, cry], [[0.08, 0.04, -0.08], [1, -0.2, -0.4], 0.17, 0.032, cry], [[0.08, 0.04, 0.08], [1, -0.2, 0.4], 0.17, 0.032, cry2], [[-0.04, 0.15, 0], [-0.3, 1, 0], 0.11, 0.032, cry2], [[0.1, 0.0, 0], [1, -0.6, 0], 0.18, 0.035, cry]]) m.cry('head', c, l, r, mm, { dir: d });
    m.tor('head', [-0.01, 0.12, 0], 0.09, 0.013, m.mat('metal', '#f0d070', { acc: '#fff8c0' }), { rot: [0, 0, -0.3], k: 0.004 });
    m.cry('head', [-0.08, 0.15, 0], 0.07, 0.024, cry2, { dir: [-0.3, 1, 0] });
    // slender arms
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.01, 0.13, s * 0.07], 'body');
      m.tube(n, [[0, 0, 0], [-0.02, -0.08, s * 0.02], [-0.06, -0.15, s * 0.01]], [0.024, 0.022, 0.02], skin, { k: 0.015 });
      m.cry(n, [-0.06, -0.15, s * 0.01], 0.07, 0.024, cry, { dir: [-1, -0.3, 0] });
    }
    // shard wings: two glowing crystal blades per side
    const up = [[0, 0], [0.05, 0.03], [0.12, 0.3], [0.08, 0.42], [0.0, 0.2]];
    const lo = [[0, 0], [0.04, 0.0], [0.16, 0.12], [0.18, 0.24], [0.06, 0.1]];
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [0.05, 0.12, s * 0.05], 'body');
      m.plate(n, [0, 0, 0], up, 0.01, 0.008, wingM, { rot: [s * (PI / 2 - 0.55), 0, 0.2], k: 0.006 });
      m.plate(n, [0.01, -0.03, 0], lo, 0.01, 0.008, wingM, { rot: [s * (PI / 2 + 0.25), 0, -0.4], k: 0.006 });
    }
    // orbiting shards
    for (let i = 0; i < 3; i++) {
      m.bone('orb' + i, [0, 0.05, 0], 'root', { rot: [0, (i / 3) * PI * 2, 0] });
      m.cry('orb' + i, [0.3, -0.05, 0], 0.12, 0.035, i % 2 ? cry2 : cry, { dir: [0.2, 1, 0.1] });
    }
    m.emitter({ pos: [0.05, 0.1, 0], rate: 7, vel: [0, -0.2, 0], spread: 0.35, posSpread: [0.25, 0.15, 0.25], life: [0.6, 1.2], size: 1, color: [md.crystals, md.accent, '#ffffff'], glow: 2.6 });
    m.points({ hit: [-0.02, 0.12, 0], mouth: [-0.12, 0.25, 0], cuts: [[-0.05, 0.25, 0], [0, 0.05, 0], [0.05, 0.2, 0.3], [0.05, 0.2, -0.3], [0.02, -0.2, 0]] });
  },
  anim(m, dt) {
    const e = m.env, t = m.t;
    const fl = sin(t * (20 + e.multi * 10));
    m.P('wingL').rotation.x += -fl * 0.35 - e.wind * 0.3; m.P('wingR').rotation.x += fl * 0.35 + e.wind * 0.3;
    m.root.position.y += sin(t * 2.1) * 0.06 - e.strike * 0.15;
    m.root.position.z += sin(t * 0.8) * 0.05;
    const b = m.P('body');
    b.rotation.z += sin(t * 1.7) * 0.06 + e.strike * 0.7 - e.wind * 0.35;
    b.rotation.x += sin(t * 1.3) * 0.05;
    m.P('head').rotation.z += sin(t * 2.3) * 0.08 - e.multi * 0.25;
    m.P('armF').rotation.z += -e.multi * 2.4 - e.wind * 0.8 + e.strike * 0.6 + sin(t * 2.5) * 0.15;
    m.P('armB').rotation.z += -e.multi * 2.2 + sin(t * 2.5 + 1) * 0.15;
    m._spin = (m._spin || 0) + dt * (1.4 + e.multi * 9 + e.wind * 3);
    for (let i = 0; i < 3; i++) { const p = m.P('orb' + i); p.rotation.y += m._spin; p.position.y += sin(t * 2 + i * 2) * 0.05; }
  },
};

// ============================================================================ PRISM KNIGHT (crystal_crab) — hollow animated crystal armour
const prismknight = {
  reach: 0.5, die: 'kneel',
  build(m, md) {
    const plate = m.mat('plate', md.body, { acc: md.belly });
    const plate2 = m.mat('plate', shade(md.body, -0.18), { acc: md.body });
    const gold = m.mat('metal', '#d8b050', { acc: '#fff0a0' });
    const cry = glowMat(m, md.crystals, 1.9);
    const cry2 = glowMat(m, md.accent, 1.9);
    const core = glowMat(m, md.eye, 2.8, 'smooth');
    const voidM = m.mat('smooth', '#120c22');
    // cuirass: empty inside, a light burning in the neck hole
    m.bone('body', [0, 0.8, 0]);
    m.box('body', [0, 0.12, 0], [0.15, 0.18, 0.2], 0.09, plate);
    m.box('body', [-0.02, -0.08, 0], [0.13, 0.05, 0.17], 0.04, plate2, { k: 0.01 });
    m.box('body', [-0.01, -0.15, 0], [0.12, 0.035, 0.155], 0.03, plate, { k: 0.008 });
    m.cry('body', [-0.155, -0.04, 0], 0.32, 0.045, cry, { dir: [0, 1, 0] });
    m.tor('body', [0, 0.29, 0], 0.11, 0.025, gold, { k: 0.006 });
    m.ell('body', [0, 0.32, 0], [0.09, 0.06, 0.09], null, { op: 'sub', k: 0.01 });
    m.sph('body', [0, 0.26, 0], 0.075, core, { k: 0.005 });
    // tassets
    m.bone('skirt', [0, -0.18, 0], 'body');
    for (const [z, ry] of [[-0.13, -0.25], [0, 0], [0.13, 0.25]]) m.box('skirt', [-0.1, -0.08, z], [0.022, 0.09, 0.065], 0.015, plate2, { rot: [0, ry, 0.12], k: 0.004 });
    for (const s of SIDES) m.box('skirt', [0.02, -0.08, s * 0.16], [0.08, 0.09, 0.022], 0.015, plate2, { rot: [s * 0.2, 0, 0], k: 0.004 });
    // floating great-helm: T visor, two lights inside, crystal crest
    m.bone('head', [-0.01, 0.43, 0], 'body');
    m.box('head', [0, 0.1, 0], [0.11, 0.13, 0.11], 0.07, plate);
    m.box('head', [-0.11, 0.11, 0], [0.04, 0.016, 0.085], 0.006, voidM, { op: 'sub', k: 0.004 });
    m.box('head', [-0.11, 0.05, 0], [0.04, 0.06, 0.016], 0.006, voidM, { op: 'sub', k: 0.004 });
    for (const s of SIDES) m.sph('head', [-0.085, 0.11, s * 0.045], 0.026, glowMat(m, md.eye, 3.2, 'eye'), { k: 0.002 });
    m.tor('head', [0, 0.0, 0], 0.11, 0.018, gold, { k: 0.004 });
    for (const [c, d, l, mm] of [[[0.0, 0.2, 0], [0.4, 1, 0], 0.28, cry], [[0.06, 0.18, 0], [1, 0.8, 0], 0.22, cry2], [[0.1, 0.13, 0], [1, 0.3, 0], 0.16, cry]]) m.cry('head', c, l, 0.045, mm, { dir: d });
    // floating pauldrons + gauntlets (no arms between them)
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [0, 0.22, s * 0.27], 'body');
      m.ell(n, [0, 0.04, 0], [0.13, 0.1, 0.12], plate, { k: 0.02 });
      m.tor(n, [0, 0.0, 0], 0.12, 0.016, gold, { k: 0.004 });
      for (const [c, d, l] of [[[0.02, 0.12, s * 0.04], [0.2, 1, s * 0.6], 0.16], [[-0.06, 0.1, s * 0.07], [-0.2, 1, s * 0.6], 0.11]]) m.cry(n, c, l, 0.04, cry, { dir: d });
      m.cap(n, [0, -0.2, 0], [-0.02, -0.34, 0], 0.06, 0.068, plate2, { k: 0.01 });
      m.ell(n, [-0.03, -0.41, 0], [0.07, 0.065, 0.065], plate, { k: 0.01 });
      m.sph(n, [-0.01, -0.12, 0], 0.035, core, { k: 0.002 });
    }
    // prism greatsword
    m.bone('sword', [-0.03, -0.41, 0], 'armF', { rot: [0, 0, 1.25] });
    m.cap('sword', [0, -0.14, 0], [0, 0.04, 0], 0.024, 0.024, m.mat('cloth', '#3a2a5a', { acc: '#5a4a8a' }), { k: 0.004 });
    m.sph('sword', [0, -0.17, 0], 0.035, cry2, { k: 0.003 });
    m.box('sword', [0, 0.06, 0], [0.035, 0.025, 0.14], 0.012, gold, { k: 0.004 });
    m.cry('sword', [0, 0.06, 0], 0.82, 0.055, cry, { k: 0.004 });
    // kite shield with a prism boss, held in front of the body
    m.bone('shield', [-0.12, -0.32, -0.12], 'armB', { rot: [0, 0.35, 0] });
    m.plate('shield', [0, 0, 0], [[-0.17, 0.16], [0.17, 0.16], [0.18, 0.0], [0, -0.32], [-0.18, 0.0]], 0.022, 0.012, plate, { rot: [0, PI / 2, 0], k: 0.006 });
    m.plate('shield', [0.012, 0, 0], [[-0.2, 0.19], [0.2, 0.19], [0.21, 0.0], [0, -0.36], [-0.21, 0.0]], 0.012, 0.008, gold, { rot: [0, PI / 2, 0], k: 0.004 });
    m.cry('shield', [-0.02, 0.0, 0], 0.09, 0.07, cry2, { dir: [-1, 0, 0] });
    // floating greaves + sabatons
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.0, -0.4, s * 0.11], 'body');
      m.ell(n, [-0.01, -0.02, 0], [0.07, 0.06, 0.07], plate, { k: 0.01 });
      m.cry(n, [-0.06, -0.01, 0], 0.08, 0.026, cry, { dir: [-1, 0.6, 0] });
      m.cap(n, [0, -0.08, 0], [0, -0.28, 0], 0.07, 0.06, plate2, { k: 0.01 });
      m.box(n, [-0.05, -0.355, 0], [0.11, 0.035, 0.065], 0.03, plate, { k: 0.01 });
    }
    m.emitter({ pos: [0, 1.15, 0], rate: 5, vel: [0, 0.35, 0], spread: 0.2, posSpread: [0.08, 0.02, 0.08], life: [0.5, 1.0], size: 1, color: [md.eye, md.crystals, '#ffffff'], glow: 2.6 });
    m.points({ hit: [-0.1, 0.95, 0], mouth: [-0.15, 1.33, 0], cuts: [[-0.1, 1.35, 0], [-0.1, 1.0, 0], [0, 0.7, -0.3], [0, 0.3, 0.1], [0.05, 1.0, 0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const flo = (n, ph, a = 0.014) => { const p = m.P(n); p.position.y += sin(t * 2 + ph) * a * (1 - e.dead); };
    flo('head', 0, 0.018); flo('armF', 1.3); flo('armB', 2.1); flo('legF', 0.7, 0.006); flo('legB', 2.6, 0.006);
    // pieces scatter a little on hits and collapse on death
    m.P('head').position.y += e.hurt * 0.05 + e.roar * 0.05 - e.dead * 0.4;
    m.P('head').rotation.z += e.dead * 0.9 + sin(t * 1.1) * 0.05;
    m.P('armF').position.z -= e.hurt * 0.04; m.P('armB').position.z += e.hurt * 0.04;
    m.P('armF').position.y -= e.dead * 0.3; m.P('armB').position.y -= e.dead * 0.3;
    m.P('armF').rotation.z += -e.wind * 2.3 - e.strike * 1.3 + sin(t * 1.5) * 0.04 + e.multi * sin(t * 16) * 0.9;
    m.P('armB').rotation.z += -e.special * 0.6 + sin(t * 1.5 + 1) * 0.04 - e.strike * 0.2;
    m.P('armB').position.x -= e.strike * 0.06;
    m.P('body').rotation.y += sin(t * 0.7) * 0.06 + e.strike * 0.15;
    walk(m, ['legF', 'legB'], 2.5, 0.04 + e.strike * 0.15);
  },
};

// ============================================================================ PRISM WISP — a faceted light-spirit in a ring of orbiting prisms
const prismwisp = {
  reach: 0.4, die: 'fade',
  build(m, md) {
    m.fly = 0.85;
    const shell = m.mat('crystal', md.body, { acc: md.belly, glow: md.body, gk: 1.5, full: true });
    const shell2 = m.mat('crystal', md.accent, { glow: md.accent, gk: 1.7, full: true });
    const coreM = glowMat(m, md.belly, 3.0, 'smooth');
    const ink = m.mat('smooth', md.eye);
    const gold = m.mat('metal', '#e8c060', { acc: '#fff4b0' });
    m.bone('core', [0, 0, 0]);
    // octahedral prism body (two crystal points), a band of gold, a calm little face
    m.cry('core', [0, -0.02, 0], 0.26, 0.17, shell, { dir: [0, 1, 0], tip: 0.26, k: 0.004 });
    m.cry('core', [0, 0.0, 0], 0.24, 0.17, shell2, { dir: [0, -1, 0], tip: 0.24, k: 0.004 });
    m.tor('core', [0, 0.0, 0], 0.17, 0.02, gold, { k: 0.004 });
    m.sph('core', [-0.02, 0.0, 0], 0.11, coreM, { op: 'paint' });
    for (const s of SIDES) m.ell('core', [-0.15, 0.05, s * 0.05], [0.03, 0.04, 0.022], ink, { op: 'sub', k: 0.004 });
    m.ell('core', [-0.15, -0.03, 0], [0.03, 0.012, 0.03], ink, { op: 'sub', k: 0.004 });
    // halo + orbiting prisms
    m.bone('halo', [0, 0.32, 0], 'core', { rot: [0.2, 0, 0.15] });
    m.tor('halo', [0, 0, 0], 0.14, 0.018, gold, { k: 0.004 });
    for (let i = 0; i < 4; i++) {
      m.bone('orb' + i, [0, 0.0, 0], 'root', { rot: [0, (i / 4) * PI * 2, 0] });
      m.cry('orb' + i, [0.42, -0.06, 0], 0.15, 0.045, i % 2 ? shell2 : shell, { dir: [0, 1, 0], tip: 0.15 });
      m.cry('orb' + i, [0.42, -0.06, 0], 0.1, 0.045, i % 2 ? shell : shell2, { dir: [0, -1, 0], tip: 0.1 });
    }
    m.emitter({ pos: [0, 0.1, 0], rate: 12, vel: [0.1, 0.4, 0], spread: 0.35, posSpread: 0.15, life: [0.5, 1.1], size: [1, 2], color: [md.body, md.accent, '#ffffff'], glow: 2.5, drag: 1 });
    m.points({ hit: [0, 0.05, 0], mouth: [-0.2, 0.0, 0], cuts: [[-0.12, 0.1, 0], [0.1, -0.1, 0], [0, 0.25, 0]] });
  },
  anim(m, dt) {
    const e = m.env, t = m.t;
    const c = m.P('core');
    const fl = 1 + sin(t * 9) * 0.03;
    c.scale.set(fl, fl * (1 + e.wind * 0.2 + e.special * 0.15), fl);
    c.rotation.y += sin(t * 0.8) * 0.3;
    c.rotation.z += -e.wind * 0.2 + e.strike * 0.3;
    m.P('halo').rotation.y += t * 1.5;
    m.P('halo').position.y += sin(t * 2.4) * 0.02;
    m.root.position.y += sin(t * 2) * 0.08;
    m._spin = (m._spin || 0) + dt * (1.6 + e.wind * 6 + e.multi * 8 + e.special * 6);
    for (let i = 0; i < 4; i++) {
      const p = m.P('orb' + i);
      p.rotation.y += m._spin;
      p.rotation.x += sin(t * 1.3 + i) * 0.25;
      p.scale.setScalar(1 - e.wind * 0.25);
    }
  },
};

export const RPG_ARCHES = { gremlin, lanternwing, pebblegolem, drilltroll, sprite, prismknight, prismwisp };
export { SIDES, walk, mix };
