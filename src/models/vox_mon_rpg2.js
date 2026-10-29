// Mine-themed RPG monster archetypes, part 2 (Sporewood, Sunken Halls, Ember Depths, Tomb, and the Geodessa boss).
// Same conventions as vox_mon_rpg.js: metres at in-game size, head toward −X, "F" limbs at −Z; chunky forms
// (≥ 2 voxels for anything that must read at the shared 0.04 m voxel size).
import * as THREE from 'three';
import { hornPath } from './monster_kit.js';
import { ease, shadeHex as shade, mixHex as mix } from '../core/math.js';
import { NORMAL_ARCHES } from './monster_normals.js';
import { glowMat, lampEye, nugget, chain } from './vox_mon_rpg.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const SIDES = [-1, 1];
const walk = (m, names, speed, amp, phase = PI) => names.forEach((n, i) => { const p = m.P(n); if (p) p.rotation.z += sin(m.t * speed + i * phase) * amp; });
/** Point on a wing plane (chord x, span y) lifted by `lift`, spanning ±z by side s. */
const wp = (x, y, s, lift) => [x, y * Math.sin(lift), s * y * Math.cos(lift)];
/** Bat/dragon wing: membrane plate + arm and finger spars (bone placed by the caller). */
function wing(m, n, s, WS, LIFT, mem, spar, claw) {
  const tips = [[-0.02, 0.5], [0.11, 0.44], [0.2, 0.3], [0.24, 0.12]].map(([x, y]) => [x * WS, y * WS]);
  const wrist = [-0.1 * WS, 0.18 * WS];
  const W = [[-0.07 * WS, 0.0], wrist, [-0.07 * WS, 0.34 * WS], tips[0], [0.04 * WS, 0.36 * WS], tips[1], [0.12 * WS, 0.3 * WS], tips[2], [0.18 * WS, 0.16 * WS], tips[3], [0.12 * WS, 0.02]];
  const th = Math.max(0.012, WS * 0.008);
  m.plate(n, [0, 0, 0], W, th, 0.008, mem, { rot: [s * (PI / 2 - LIFT), 0, 0], k: 0.01 });
  m.cap(n, [-0.02, 0, 0], wp(...wrist, s, LIFT), 0.022 * WS, 0.017 * WS, spar, { k: 0.015 });
  for (const [x, y] of tips) m.cap(n, wp(...wrist, s, LIFT), wp(x, y, s, LIFT), 0.013 * WS, 0.008 * WS, spar, { k: 0.005 });
  if (claw) m.cap(n, wp(...wrist, s, LIFT), wp(wrist[0] - 0.035 * WS, wrist[1] + 0.025 * WS, s, LIFT), 0.012 * WS, 0.005 * WS, claw, { k: 0.004 });
}

// ============================================================================ MOSS GOLEM (moss_snail)
const mossgolem = {
  reach: 0.45,
  build(m, md) {
    const rock = m.mat('stone', md.body, { acc: shade(md.body, 0.12) });
    const moss = m.mat('moss', md.accent, { acc: md.belly });
    const bark = m.mat('bark', '#6e4c30', { acc: '#4a3020' });
    const leaf = m.mat('moss', '#3e8e3e', { acc: '#8ad050' });
    const shroom = m.mat('cap', '#e8903a', { acc: '#fff0c0' });
    const stem = m.mat('smooth', '#efe4c8');
    const glowS = glowMat(m, '#7affd0', 2.4, 'cap');
    m.bone('body', [0, 0.5, 0]);
    // squat boulder body under a thick moss mantle
    m.ell('body', [0.04, 0.08, 0], [0.36, 0.36, 0.34], rock, { noise: 0.02, nf: 5 });
    m.ell('body', [-0.1, -0.1, 0], [0.26, 0.24, 0.28], rock, { k: 0.08 });
    m.ell('body', [0.1, 0.3, 0], [0.38, 0.24, 0.38], moss, { k: 0.05, noise: 0.025, nf: 7 });
    for (const a of [-1.2, -0.85, 0.85, 1.2, 1.6, -1.6]) m.cap('body', [0.1 - 0.37 * cos(a), 0.2, 0.37 * sin(a)], [0.1 - 0.36 * cos(a), 0.0 - Math.abs(a) * 0.05, 0.36 * sin(a)], 0.045, 0.025, moss, { k: 0.02 });
    // face sunk under the mantle: glowing eyes, a dark mouth crack
    for (const s of SIDES) {
      m.sph('body', [-0.33, 0.07, s * 0.12], 0.065, null, { op: 'sub', k: 0.012 });
      m.sph('body', [-0.3, 0.07, s * 0.12], 0.048, glowMat(m, md.eye, 3, 'eye'), { k: 0.004 });
    }
    m.box('body', [-0.34, -0.1, 0], [0.05, 0.022, 0.12], 0.01, null, { op: 'sub', k: 0.01, rot: [0, 0, 0.1] });
    // a sapling growing out of its back, mushrooms in the moss
    m.bone('tree', [0.14, 0.48, 0.02], 'body');
    m.cap('tree', [0, -0.08, 0], [0.04, 0.32, 0], 0.06, 0.04, bark, { k: 0.02 });
    m.cap('tree', [0.02, 0.18, 0], [0.16, 0.32, 0.05], 0.03, 0.022, bark, { k: 0.01 });
    m.cap('tree', [0.03, 0.22, 0], [-0.1, 0.36, -0.05], 0.028, 0.02, bark, { k: 0.01 });
    for (const [p, r] of [[[0.04, 0.42, 0], 0.15], [[0.17, 0.36, 0.06], 0.11], [[-0.1, 0.39, -0.06], 0.11], [[0.02, 0.36, 0.13], 0.1], [[0.06, 0.38, -0.13], 0.1]]) m.ell('tree', p, [r, r * 0.8, r], leaf, { k: 0.03, noise: 0.02, nf: 14 });
    for (const [p, r] of [[[0.3, 0.32, -0.18], 0.07], [[0.36, 0.22, 0.12], 0.055], [[-0.08, 0.44, 0.24], 0.05]]) {
      m.cap('body', [p[0], p[1] - 0.06, p[2]], [p[0], p[1] + 0.02, p[2]], r * 0.4, r * 0.35, stem, { k: 0.01 });
      m.ell('body', [p[0], p[1] + 0.04, p[2]], [r, r * 0.55, r], shroom, { k: 0.008 });
    }
    for (const p of [[-0.12, 0.42, -0.22], [-0.05, 0.45, -0.28], [0.32, 0.12, 0.28]]) { m.cap('body', [p[0], p[1] - 0.05, p[2]], p, 0.016, 0.014, stem, { k: 0.006 }); m.sph('body', p, 0.035, glowS, { k: 0.004 }); }
    // arms: rock shoulder → log forearm → stone fist trailing roots
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.06, 0.14, s * 0.38], 'body');
      m.ell(n, [0, 0, 0], [0.14, 0.13, 0.13], rock, { k: 0.03, noise: 0.012, nf: 10 });
      m.ell(n, [0.02, 0.08, 0], [0.13, 0.06, 0.13], moss, { op: 'paint' });
      m.cap(n, [0, -0.08, 0], [-0.04, -0.34, 0], 0.085, 0.075, bark, { k: 0.02 });
      m.ell(n, [-0.06, -0.44, 0], [0.13, 0.11, 0.12], rock, { k: 0.03, noise: 0.01, nf: 12 });
      for (let f = -1; f <= 1; f++) m.sph(n, [-0.17, -0.44, f * 0.065], 0.05, rock, { k: 0.015 });
      for (const z of [-0.05, 0.05]) m.cap(n, [0.0, -0.5, z], [0.04, -0.62, z * 1.6], 0.022, 0.012, bark, { k: 0.008 });
    }
    // stump legs with root toes
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.04, -0.3, s * 0.18], 'body');
      m.cap(n, [0, 0.04, 0], [0, -0.12, 0], 0.11, 0.1, bark, { k: 0.03 });
      m.ell(n, [-0.04, -0.16, 0], [0.15, 0.05, 0.12], rock, { k: 0.02 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.12, -0.17, f * 0.06], [-0.22, -0.19, f * 0.1], 0.026, 0.014, bark, { k: 0.006 });
    }
    m.emitter({ pos: [0.05, 0.95, 0], rate: 2.5, vel: [0, 0.12, 0], spread: 0.3, posSpread: [0.3, 0.1, 0.3], life: [1.5, 3], size: 1, color: ['#7affd0', '#e8ffb0'], glow: 1.8, gravity: -0.05, drag: 0.5 });
    m.points({ hit: [-0.2, 0.62, 0], mouth: [-0.38, 0.42, 0], cuts: [[-0.3, 0.62, 0], [0.1, 0.95, 0], [0.4, 0.6, 0], [-0.1, 0.35, 0.4], [0.2, 0.4, -0.4]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const b = m.P('body');
    b.rotation.z += sin(t * 1.1) * 0.03 - e.wind * 0.25 + e.strike * 0.3;
    b.position.y += sin(t * 2.2) * 0.012 - e.wind * 0.05;
    m.P('tree').rotation.z += sin(t * 1.7 + 0.6) * 0.06 + e.wind * 0.25 - e.strike * 0.35;
    m.P('tree').rotation.x += sin(t * 1.3) * 0.05;
    const slam = -e.wind * 2.4 + e.strike * 1.0;
    m.P('armF').rotation.z += slam + sin(t * 1.4) * 0.05;
    m.P('armB').rotation.z += slam * 0.85 + sin(t * 1.4 + 1.5) * 0.05;
    walk(m, ['legF', 'legB'], 2.2, 0.05 + e.strike * 0.12);
  },
};

// ============================================================================ GLOWCAP WISP (lantern_moth)
const glowwisp = {
  reach: 0.45, die: 'fade',
  build(m, md) {
    m.fly = 0.85;
    const ghost = m.mat('slime', md.body, { acc: md.belly, glow: md.body, gk: 1.1, full: true });
    const capM = m.mat('cap', md.cap, { acc: shade(md.cap, 0.18) });
    const gill = glowMat(m, md.accent, 2.2, 'gill');
    const spot = glowMat(m, md.accent, 2.8, 'smooth');
    const ink = m.mat('smooth', '#141a2e');
    m.bone('body', [0, 0, 0]);
    // teardrop ghost with a big-eyed face
    m.ell('body', [0, 0.0, 0], [0.16, 0.18, 0.16], ghost);
    for (const s of SIDES) {
      m.ell('body', [-0.15, 0.03, s * 0.065], [0.03, 0.055, 0.04], null, { op: 'sub', k: 0.006 });
      m.ell('body', [-0.13, 0.03, s * 0.065], [0.03, 0.05, 0.036], ink, { k: 0.003 });
      m.sph('body', [-0.155, 0.055, s * 0.06], 0.014, glowMat(m, '#ffffff', 3, 'smooth'), { k: 0.002 });
    }
    m.ell('body', [-0.155, -0.06, 0], [0.03, 0.026, 0.03], ink, { op: 'sub', k: 0.005 });
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.02, -0.02, s * 0.14], 'body');
      m.cap(n, [0, 0, 0], [-0.06, -0.08, s * 0.05], 0.045, 0.035, ghost, { k: 0.02 });
    }
    // wispy tail curling down and back
    m.bone('tail', [0.04, -0.14, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.08, -0.12, 0], [0.2, -0.2, 0.04]], [0.11, 0.08, 0.05], ghost, { k: 0.04 });
    m.bone('tail1', [0.2, -0.2, 0.04], 'tail');
    m.tube('tail1', [[0, 0, 0], [0.1, -0.02, 0], [0.16, 0.06, -0.02]], [0.05, 0.035, 0.022], ghost, { k: 0.02 });
    // the glowing mushroom cap it wears like a hood
    m.bone('cap', [0.02, 0.14, 0], 'body');
    m.ell('cap', [0, 0.07, 0], [0.28, 0.14, 0.28], capM, { noise: 0.008, nf: 9 });
    m.ell('cap', [0, -0.02, 0], [0.25, 0.07, 0.25], null, { op: 'sub', k: 0.02 });
    m.ell('cap', [0, -0.0, 0], [0.24, 0.05, 0.24], gill, { op: 'paint' });
    for (const [x, z, r] of [[-0.12, 0.08, 0.04], [0.05, -0.14, 0.045], [0.14, 0.1, 0.035], [-0.04, 0.0, 0.05], [0.12, -0.04, 0.03], [-0.12, -0.12, 0.035]]) {
      const y = 0.07 + 0.14 * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / 0.078));
      m.sph('cap', [x, y, z], r, spot, { k: 0.004 });
    }
    m.cap('cap', [0.12, 0.17, 0], [0.2, 0.26, 0.02], 0.03, 0.012, capM, { k: 0.03 });
    m.emitter({ pos: [0, 0.05, 0], rate: 8, vel: [0, -0.25, 0], spread: 0.4, posSpread: [0.25, 0.02, 0.25], life: [1.0, 2.0], size: 1, color: [md.accent, '#ffffff', '#c8ffe8'], glow: 2.2, gravity: 0.05, drag: 0.6 });
    m.points({ hit: [-0.05, 0.05, 0], mouth: [-0.18, -0.02, 0], cuts: [[-0.12, 0.05, 0], [0, 0.25, 0], [0.15, -0.2, 0], [0, 0.2, 0.25], [0, 0.2, -0.25]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.root.position.y += sin(t * 1.8) * 0.08 - e.strike * 0.12;
    m.root.position.z += sin(t * 0.7) * 0.06;
    const b = m.P('body');
    b.rotation.z += sin(t * 1.3) * 0.08 + e.strike * 0.5 - e.wind * 0.35;
    b.scale.y *= 1 + sin(t * 3.1) * 0.04 + e.strike * 0.12;
    const c = m.P('cap');
    c.rotation.z += sin(t * 1.3 - 0.7) * 0.1 - e.special * 0.3 + e.strike * 0.2;
    c.rotation.x += sin(t * 1.1) * 0.06;
    c.scale.setScalar(1 + e.special * 0.22 + e.wind * 0.08);
    m.P('tail').rotation.y += sin(t * 2.2) * 0.35;
    m.P('tail1').rotation.y += sin(t * 2.2 - 0.8) * 0.5;
    m.P('armF').rotation.z += sin(t * 2.6) * 0.3 - e.special * 1.2 - e.strike * 0.6;
    m.P('armB').rotation.z += sin(t * 2.6 + 1.2) * 0.3 - e.special * 1.2;
  },
};

// ============================================================================ BLOATCAP (bloat_toad) — toad/mushroom hybrid
const bloatcap = {
  reach: 0.4,
  build(m, md) {
    NORMAL_ARCHES.toad.build(m, md);
    const capM = m.mat('cap', md.cap, { acc: '#fff0d4' });
    const stem = m.mat('flesh', '#eadcc0', { acc: '#d8c8a8' });
    const gill = m.mat('gill', '#e8c8a0');
    const pore = glowMat(m, md.spore || md.accent, 2.6, 'smooth');
    // a huge spotted cap bursting from its back, gills glowing faintly
    m.bone('cap', [0.12, 0.58, 0], 'body');
    m.cap('cap', [0, -0.12, 0], [0, 0.08, 0], 0.15, 0.12, stem, { k: 0.04 });
    m.ell('cap', [0, 0.14, 0], [0.4, 0.2, 0.38], capM, { noise: 0.01, nf: 8 });
    m.ell('cap', [0, 0.04, 0], [0.36, 0.08, 0.34], null, { op: 'sub', k: 0.02 });
    m.ell('cap', [0, 0.06, 0], [0.35, 0.05, 0.33], gill, { op: 'paint' });
    for (const [x, z, r] of [[-0.18, 0.12, 0.07], [0.08, -0.22, 0.08], [0.22, 0.14, 0.06], [-0.05, 0.02, 0.08], [0.2, -0.06, 0.05], [-0.2, -0.16, 0.06], [0.0, 0.26, 0.05]]) {
      const y = 0.14 + 0.2 * Math.sqrt(Math.max(0, 1 - (x * x) / 0.16 - (z * z) / 0.144));
      m.ell('cap', [x, y - 0.01, z], [r, r * 0.45, r], m.mat('smooth', '#fff4dc'), { k: 0.004 });
    }
    // little mushrooms sprouting on the head + glowing spore pores along the flanks
    for (const [p, r] of [[[-0.18, 0.62, -0.1], 0.05], [[-0.12, 0.64, 0.12], 0.04], [[0.38, 0.5, 0.2], 0.045]]) {
      m.cap('body', [p[0], p[1] - 0.06, p[2]], [p[0], p[1], p[2]], r * 0.45, r * 0.4, stem, { k: 0.01 });
      m.ell('body', [p[0], p[1] + 0.02, p[2]], [r, r * 0.6, r], capM, { k: 0.006 });
    }
    for (const [p, r] of [[[0.2, 0.42, 0.36], 0.035], [[0.0, 0.38, 0.4], 0.03], [[0.32, 0.3, 0.34], 0.03], [[0.2, 0.42, -0.36], 0.035], [[0.0, 0.38, -0.4], 0.03]]) m.sph('body', p, r, pore, { k: 0.006 });
    m.emitter({ pos: [0.12, 0.95, 0], rate: 5, vel: [0, 0.2, 0], spread: 0.4, posSpread: [0.3, 0.05, 0.3], life: [1.2, 2.4], size: 1, color: [md.spore || md.accent, '#fff0c0'], glow: 2, gravity: -0.05, drag: 0.5 });
    m.points({ hit: [-0.15, 0.55, 0], mouth: [-0.55, 0.3, 0], cuts: [[-0.4, 0.35, 0], [0.1, 0.9, 0], [0.4, 0.45, 0], [0.3, 0.15, -0.4], [-0.1, 0.2, 0.4]] });
  },
  anim(m, dt) {
    NORMAL_ARCHES.toad.anim(m, dt);
    const e = m.env, t = m.t;
    const c = m.P('cap');
    c.rotation.z += sin(t * 2.5 - 0.6) * 0.05 + e.strike * 0.25 - e.wind * 0.2;
    c.scale.y *= 1 + e.special * 0.25 - e.wind * 0.1 + Math.max(0, sin(t * 2.5)) * 0.05;
    c.scale.x *= 1 + e.multi * Math.abs(sin(t * 10)) * 0.1;
  },
};

// ============================================================================ SPORE GOBLIN (silk_spider) — mushroom shaman
const sporegoblin = {
  reach: 0.4,
  build(m, md) {
    const skin = m.mat('flesh', md.body, { acc: shade(md.body, -0.05) });
    const cloak = m.mat('moss', '#4e6a3a', { acc: '#6e8a44' });
    const rag = m.mat('cloth', '#5e4632', { acc: '#46342a' });
    const capM = m.mat('cap', md.cap, { acc: shade(md.cap, 0.15) });
    const gill = m.mat('gill', '#e8d2b0');
    const wood = m.mat('wood', '#6e4a2a', { acc: '#4a3018' });
    const boneM = m.mat('bone', '#efe4c8', { acc: '#c8b898' });
    const bulb = glowMat(m, md.accent, 2.6, 'cap');
    const spot = glowMat(m, md.accent, 2.8, 'smooth');
    const tooth = m.mat('smooth', '#fff4d0');
    m.bone('body', [0, 0.32, 0]);
    m.ell('body', [0.02, 0.12, 0], [0.12, 0.15, 0.12], skin, { rot: [0, 0, -0.25] });
    // mossy poncho with a ragged hem, bone-tooth necklace
    m.cap('body', [0.01, 0.27, 0], [0.03, -0.03, 0], 0.11, 0.2, cloak, { k: 0.02 });
    for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; m.sph('body', [0.03 + cos(a) * 0.2, -0.07, sin(a) * 0.2], 0.05, null, { op: 'sub', k: 0.01 }); }
    for (let i = -2; i <= 2; i++) m.cap('body', [-0.1 + Math.abs(i) * 0.02, 0.23, i * 0.045], [-0.13 + Math.abs(i) * 0.02, 0.17, i * 0.05], 0.018, 0.01, boneM, { k: 0.003 });
    m.tor('body', [-0.01, 0.25, 0], 0.11, 0.012, rag, { rot: [0, 0, 0.3], k: 0.004 });
    // head: long nose, wide fanged grin, glowing eyes, mushroom-cap hat
    m.bone('head', [-0.06, 0.34, 0], 'body');
    m.ell('head', [-0.01, 0.06, 0], [0.13, 0.12, 0.13], skin, { k: 0.03 });
    m.tube('head', [[-0.12, 0.05, 0], [-0.22, 0.02, 0], [-0.27, -0.03, 0]], [0.04, 0.032, 0.024], skin, { k: 0.03 });
    m.ell('head', [-0.12, -0.04, 0], [0.04, 0.025, 0.09], m.mat('smooth', '#2a0a14'), { op: 'sub', k: 0.006 });
    for (const s of SIDES) {
      m.cap('head', [-0.14, -0.04, s * 0.05], [-0.15, -0.0, s * 0.055], 0.016, 0.008, tooth, { k: 0.002 });
      m.sph('head', [-0.115, 0.08, s * 0.06], 0.036, null, { op: 'sub', k: 0.006 });
      m.sph('head', [-0.105, 0.08, s * 0.06], 0.03, glowMat(m, md.eye, 3, 'eye'), { k: 0.003 });
    }
    for (const s of SIDES) {
      const n = s > 0 ? 'earL' : 'earR';
      m.bone(n, [0.03, 0.05, s * 0.12], 'head', { rot: [s * (PI / 2 - 0.3), 0, 0] });
      m.plate(n, [0, 0, 0], [[-0.05, -0.03], [0.06, -0.03], [0.24, 0.16], [0.03, 0.08]], 0.016, 0.01, skin, { k: 0.015 });
    }
    m.cap('head', [0.01, 0.1, 0], [0.01, 0.16, 0], 0.07, 0.06, gill, { k: 0.02 });
    m.ell('head', [0.02, 0.2, 0], [0.22, 0.1, 0.22], capM, { k: 0.01 });
    m.ell('head', [0.02, 0.14, 0], [0.2, 0.04, 0.2], gill, { op: 'paint' });
    for (const [x, z, r] of [[-0.1, 0.08, 0.035], [0.06, -0.12, 0.04], [0.12, 0.08, 0.03], [-0.02, -0.02, 0.04]]) m.sph('head', [0.02 + x, 0.2 + 0.1 * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / 0.048)), z], r, spot, { k: 0.003 });
    // arms; the F hand holds a gnarled staff topped with a glowing spore bulb
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.02, 0.22, s * 0.14], 'body');
      m.tube(n, [[0, 0, 0], [0.01, -0.12, 0], [-0.04, -0.23, 0]], [0.04, 0.034, 0.032], skin, { k: 0.02 });
      m.ell(n, [-0.05, -0.26, 0], [0.05, 0.045, 0.048], skin, { k: 0.015 });
    }
    m.bone('staff', [-0.05, -0.26, 0], 'armF', { rot: [0, 0, 0.1] });
    m.tube('staff', [[0.01, -0.32, 0], [-0.01, -0.05, 0], [0.02, 0.25, 0], [-0.02, 0.5, 0], [0.01, 0.62, 0]], 0.026, wood, { k: 0.008 });
    for (const a of [0, 2.1, 4.2]) m.cap('staff', [0.01, 0.58, 0], [cos(a) * 0.08, 0.72, sin(a) * 0.08], 0.018, 0.012, wood, { k: 0.004 });
    m.bone('bulb', [0.0, 0.74, 0], 'staff');
    m.sph('bulb', [0, 0, 0], 0.085, bulb, { k: 0.004 });
    for (const z of [-0.06, 0.06]) { m.cap('staff', [0, 0.6, z], [0.0, 0.48, z * 1.2], 0.008, 0.008, rag, { k: 0.002 }); m.cap('staff', [0, 0.48, z * 1.2], [0, 0.42, z * 1.2], 0.018, 0.01, boneM, { k: 0.002 }); }
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.02, -0.02, s * 0.075], 'body');
      m.tube(n, [[0, 0, 0], [0.04, -0.14, 0], [0.0, -0.27, 0]], [0.045, 0.038, 0.034], skin, { k: 0.02 });
      m.ell(n, [-0.06, -0.29, 0], [0.1, 0.035, 0.055], rag, { k: 0.02 });
    }
    m.emitter({ pos: [-0.12, 0.96, -0.14], rate: 6, vel: [0, 0.2, 0], spread: 0.5, posSpread: 0.05, life: [0.8, 1.6], size: 1, color: [md.accent, '#ffffff'], glow: 2.4, gravity: -0.1, drag: 0.6 });
    m.points({ hit: [-0.08, 0.5, 0], mouth: [-0.3, 0.64, 0], cuts: [[-0.1, 0.72, 0], [0.0, 0.88, 0], [-0.1, 0.4, -0.15], [0.1, 0.4, 0.15], [0.0, 0.18, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const b = m.P('body');
    b.position.y += Math.abs(sin(t * 3.2)) * 0.02 - e.wind * 0.04;
    b.rotation.z += sin(t * 1.6) * 0.04 - e.wind * 0.2 + e.strike * 0.3;
    m.P('head').rotation.z += sin(t * 2.1) * 0.06 - e.special * 0.3 + e.strike * 0.2;
    m.P('head').rotation.x += sin(t * 1.3) * 0.08;
    m.P('earL').rotation.z += sin(t * 2.7) * 0.08 + e.hurt * 0.6; m.P('earR').rotation.z += sin(t * 2.7 + 1) * 0.08 + e.hurt * 0.6;
    m.P('armF').rotation.z += -e.wind * 1.2 + e.strike * 1.6 - e.special * 1.0 + sin(t * 1.8) * 0.08;
    m.P('armB').rotation.z += sin(t * 2.4) * 0.15 - e.special * 1.6 - e.wind * 0.5;
    const pulse = 1 + Math.pow(Math.max(0, sin(t * 3)), 4) * 0.15 + e.special * 0.45 + e.wind * 0.2;
    m.P('bulb').scale.setScalar(pulse);
    walk(m, ['legF', 'legB'], 6, 0.08 * (0.5 + e.strike));
  },
};

// ============================================================================ GARGOYLE (ruin_owl)
const gargoyle = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 0.45;
    const stone = m.mat('stone', md.body, { acc: shade(md.body, 0.12) });
    const stone2 = m.mat('stone', md.belly, { acc: md.body });
    const rune = m.mat('rune', md.body, { acc: md.accent, glow: md.accent, gk: 2.2 });
    const wingS = m.mat('membrane', shade(md.body, -0.18), { acc: shade(md.body, -0.34) });
    const dark = m.mat('smooth', '#2a2428');
    const gold = m.mat('metal', md.accent, { acc: '#fff4c0' });
    m.bone('body', [0, 0.34, 0]);
    // crouched, broad-shouldered torso, gold-inlaid rune band
    m.ell('body', [0.02, 0.15, 0], [0.16, 0.21, 0.17], stone, { rot: [0, 0, -0.55] });
    for (const s of SIDES) m.ell('body', [-0.08, 0.24, s * 0.1], [0.11, 0.1, 0.1], stone, { k: 0.04 });
    m.ell('body', [-0.13, 0.05, 0], [0.1, 0.16, 0.14], stone2, { op: 'paint' });
    m.box('body', [-0.02, 0.2, 0], [0.2, 0.03, 0.2], 0.01, rune, { op: 'paint', rot: [0, 0, -0.55] });
    // head: horned, snarling, glowing eyes
    m.bone('head', [-0.2, 0.32, 0], 'body');
    m.ell('head', [-0.01, 0.05, 0], [0.13, 0.12, 0.12], stone, { k: 0.03 });
    m.ell('head', [-0.12, -0.01, 0], [0.09, 0.07, 0.09], stone, { k: 0.04 });
    m.box('head', [-0.12, 0.09, 0], [0.04, 0.03, 0.12], 0.02, stone, { k: 0.02, rot: [0, 0, -0.3] });
    m.ell('head', [-0.17, -0.04, 0], [0.05, 0.02, 0.07], m.mat('smooth', '#1a0e10'), { op: 'sub', k: 0.006 });
    for (const s of SIDES) {
      m.cap('head', [-0.18, -0.025, s * 0.045], [-0.19, -0.075, s * 0.05], 0.018, 0.008, m.mat('smooth', '#efe4d0'), { k: 0.002 });
      m.sph('head', [-0.13, 0.06, s * 0.055], 0.036, null, { op: 'sub', k: 0.006 });
      m.sph('head', [-0.12, 0.06, s * 0.055], 0.03, glowMat(m, md.eye, 3, 'eye'), { k: 0.003 });
      m.tube('head', hornPath([0.02, 0.13, s * 0.08], [0.6, 0.7, s * 0.4], [1, 0, 0], 0.24, 1.6, 5), (t) => 0.045 * (1 - t) + 0.014, dark, { k: 0.01 });
      m.plate('head', [0.04, 0.04, s * 0.12], [[-0.03, -0.02], [0.06, -0.02], [0.16, 0.08], [0.02, 0.05]], 0.014, 0.01, stone, { rot: [s * (PI / 2 - 0.5), 0, 0], k: 0.01 });
    }
    m.tor('head', [-0.01, 0.0, 0], 0.13, 0.018, gold, { rot: [0, 0, 0.25], k: 0.004 });
    // stone wings raised high
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [0.1, 0.3, s * 0.13], 'body');
      wing(m, n, s, 1.6, 0.95, wingS, stone, dark);
    }
    // arms with three-clawed hands
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.1, 0.24, s * 0.2], 'body');
      m.ell(n, [0, 0, 0], [0.075, 0.08, 0.075], stone, { k: 0.03 });
      m.tube(n, [[0, -0.02, 0], [0.02, -0.14, 0], [-0.04, -0.26, 0]], [0.055, 0.048, 0.045], stone, { k: 0.02 });
      m.box(n, [-0.01, -0.19, 0], [0.05, 0.03, 0.055], 0.012, rune, { op: 'paint', rot: [0, 0, 0.4] });
      m.ell(n, [-0.06, -0.3, 0], [0.065, 0.055, 0.06], stone, { k: 0.015 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.1, -0.31, f * 0.03], [-0.15, -0.37, f * 0.035], 0.02, 0.008, dark, { k: 0.004 });
    }
    // crouched digitigrade legs with talons
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.08, -0.02, s * 0.12], 'body');
      m.ell(n, [-0.04, -0.02, 0], [0.12, 0.09, 0.08], stone, { k: 0.03 });
      m.tube(n, [[-0.1, -0.04, 0], [0.04, -0.14, 0], [-0.0, -0.26, 0]], [0.05, 0.042, 0.036], stone, { k: 0.02 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.02, -0.27, f * 0.03], [-0.1, -0.3, f * 0.04], 0.022, 0.01, dark, { k: 0.004 });
    }
    m.bone('tail', [0.16, -0.02, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.16, -0.12, 0], [0.32, -0.12, 0.02], [0.42, -0.02, 0]], [0.045, 0.036, 0.028, 0.022], stone, { k: 0.02 });
    m.plate('tail', [0.44, 0.0, 0], [[-0.04, -0.03], [0.05, 0.03], [0.0, 0.1], [-0.06, 0.04]], 0.014, 0.008, dark, { k: 0.008 });
    m.emitter({ pos: [0, -0.05, 0], rate: 3, vel: [0, -0.25, 0], spread: 0.15, posSpread: [0.2, 0, 0.2], life: [0.6, 1.2], size: 1, color: ['#c8b890', '#8a8070'], glow: 1, gravity: 0.6 });
    m.points({ hit: [-0.15, 0.55, 0], mouth: [-0.38, 0.66, 0], cuts: [[-0.25, 0.65, 0], [0.05, 0.5, 0], [0.1, 0.9, 0.4], [0.1, 0.9, -0.4], [0.3, 0.3, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const sp = 6 + e.strike * 8 + e.multi * 8;
    const flap = sin(t * sp);
    const a = flap * 0.45 + e.wind * 0.4;
    m.P('wingL').rotation.x += -a; m.P('wingR').rotation.x += a;
    m.root.position.y += -flap * 0.035 + sin(t * 1.2) * 0.05 - e.strike * 0.2;
    m.P('body').rotation.z += sin(t * 1.4) * 0.03 - e.wind * 0.25 + e.strike * 0.4;
    m.P('head').rotation.z += sin(t * 0.9) * 0.08 - e.roar * 0.4;
    m.P('head').rotation.y += sin(t * 0.5) * 0.15;
    m.P('armF').rotation.z += e.wind * 1.2 - e.strike * 1.7 + sin(t * 2) * 0.06 + e.multi * sin(t * 18) * 0.6;
    m.P('armB').rotation.z += e.wind * 0.8 - e.strike * 1.0 + sin(t * 2 + 1) * 0.06;
    m.P('legF').rotation.z += sin(t * 1.5) * 0.08; m.P('legB').rotation.z += sin(t * 1.5 + 1) * 0.08;
    m.P('tail').rotation.y += sin(t * 1.8) * 0.3;
  },
};

// ============================================================================ MAGMA IMP (salamander)
const magmaimp = {
  reach: 0.4,
  build(m, md) {
    const crust = m.mat('crust', md.body, { glow: md.accent, gk: 2.4 });
    const belly = glowMat(m, md.belly, 2.0, 'lava');
    const horn = m.mat('smooth', '#22161a');
    const flameO = glowMat(m, '#ff6a1a', 2.6, 'smooth');
    const flameI = glowMat(m, '#ffe04a', 3, 'smooth');
    const mem = m.mat('membrane', '#4a2626', { acc: '#2a1416' });
    m.bone('body', [0, 0.32, 0]);
    m.ell('body', [0.02, 0.12, 0], [0.15, 0.17, 0.15], crust, { rot: [0, 0, -0.2] });
    m.ell('body', [-0.06, 0.05, 0], [0.1, 0.12, 0.12], belly, { op: 'paint' });
    // head: round, horns like a ram's, wide molten grin, flame hair
    m.bone('head', [-0.06, 0.3, 0], 'body');
    m.ell('head', [-0.01, 0.07, 0], [0.15, 0.13, 0.14], crust, { k: 0.03 });
    m.ell('head', [-0.13, 0.0, 0], [0.04, 0.035, 0.1], null, { op: 'sub', k: 0.008 });
    m.ell('head', [-0.11, 0.0, 0], [0.03, 0.03, 0.09], flameI, { k: 0.004 });
    for (const s of SIDES) {
      m.cap('head', [-0.14, 0.03, s * 0.045], [-0.15, -0.01, s * 0.05], 0.016, 0.008, m.mat('smooth', '#fff0c8'), { k: 0.002 });
      m.sph('head', [-0.125, 0.1, s * 0.06], 0.036, null, { op: 'sub', k: 0.006 });
      m.ell('head', [-0.115, 0.1, s * 0.06], [0.026, 0.024, 0.032], glowMat(m, md.eye, 3.2, 'eye'), { k: 0.003, rot: [s * 0.5, 0, 0] });
      m.tube('head', hornPath([-0.02, 0.15, s * 0.1], [-0.3, 0.6, s * 1], [0, 1, 0], 0.22, 2.4, 6), (t) => 0.04 * (1 - t) + 0.014, horn, { k: 0.01 });
    }
    m.bone('hair', [0.04, 0.17, 0], 'head');
    for (const [a, l, z] of [[0.2, 0.26, 0], [0.7, 0.22, -0.07], [0.7, 0.22, 0.07], [1.1, 0.18, -0.03], [1.1, 0.18, 0.05], [-0.2, 0.16, 0]]) {
      const tip = [sin(a) * l, cos(a) * l, z * 1.4];
      m.cap('hair', [0, 0, z], tip, 0.06, 0.012, flameO, { k: 0.02 });
      m.cap('hair', [0, 0.0, z], [tip[0] * 0.6, tip[1] * 0.6, z * 1.2], 0.035, 0.01, flameI, { k: 0.01 });
    }
    // little bat wings, clawed arms, hoofed legs, a flame-tipped tail
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [0.12, 0.22, s * 0.1], 'body');
      wing(m, n, s, 0.9, 0.6, mem, horn, null);
    }
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.03, 0.2, s * 0.16], 'body');
      m.tube(n, [[0, 0, 0], [0.01, -0.12, 0], [-0.04, -0.22, 0]], [0.045, 0.04, 0.038], crust, { k: 0.02 });
      m.ell(n, [-0.06, -0.25, 0], [0.055, 0.05, 0.05], crust, { k: 0.015 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.1, -0.26, f * 0.025], [-0.15, -0.3, f * 0.03], 0.018, 0.008, horn, { k: 0.003 });
    }
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.02, -0.02, s * 0.08], 'body');
      m.ell(n, [0, -0.04, 0], [0.07, 0.08, 0.065], crust, { k: 0.03 });
      m.tube(n, [[0.0, -0.08, 0], [0.06, -0.18, 0], [0.01, -0.28, 0]], [0.05, 0.04, 0.034], crust, { k: 0.02 });
      m.ell(n, [-0.02, -0.295, 0], [0.05, 0.03, 0.045], horn, { k: 0.01 });
    }
    m.bone('tail', [0.14, 0.0, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.12, -0.1, 0], [0.26, -0.06, 0], [0.32, 0.06, 0]], [0.04, 0.032, 0.026, 0.02], crust, { k: 0.02 });
    m.cap('tail', [0.32, 0.06, 0], [0.36, 0.2, 0], 0.045, 0.01, flameO, { k: 0.01 });
    m.sph('tail', [0.33, 0.09, 0], 0.025, flameI, { k: 0.004 });
    m.emitter({ pos: [-0.02, 0.92, 0], rate: 9, vel: [0, 0.6, 0], spread: 0.35, posSpread: [0.08, 0.02, 0.08], life: [0.4, 0.9], size: 1, color: ['#ffe04a', '#ff6a1a', '#fff0a0'], gravity: -0.4, glow: 3 });
    m.points({ hit: [-0.08, 0.48, 0], mouth: [-0.2, 0.62, 0], cuts: [[-0.1, 0.68, 0], [0.0, 0.42, 0], [-0.1, 0.3, -0.18], [0.4, 0.4, 0], [0.0, 0.15, 0.1]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const b = m.P('body');
    b.position.y += Math.abs(sin(t * 4.5)) * 0.03 - e.wind * 0.04;
    b.rotation.z += sin(t * 2.2) * 0.04 - e.wind * 0.25 + e.strike * 0.35;
    b.scale.x *= 1 + e.wind * 0.08; b.scale.z *= 1 + e.wind * 0.08;
    const h = m.P('head');
    h.rotation.z += -e.wind * 0.3 + e.strike * 0.3 + e.multi * sin(t * 18) * 0.25;
    h.rotation.x += sin(t * 1.4) * 0.08;
    const hair = m.P('hair');
    hair.scale.y *= 1 + sin(t * 13) * 0.08 + sin(t * 7.3) * 0.06 + e.wind * 0.25 + e.roar * 0.3;
    hair.rotation.z += sin(t * 5) * 0.06;
    const fl = sin(t * 9);
    m.P('wingL').rotation.x += -fl * 0.4; m.P('wingR').rotation.x += fl * 0.4;
    m.P('armF').rotation.z += e.wind * 1.3 - e.strike * 1.8 + sin(t * 3) * 0.1;
    m.P('armB').rotation.z += e.wind * 0.6 - e.strike * 0.6 + sin(t * 3 + 1.5) * 0.1;
    walk(m, ['legF', 'legB'], 9, 0.1 * (0.4 + e.strike));
    m.P('tail').rotation.y += sin(t * 3.5) * 0.4;
  },
};

// ============================================================================ FLAME SKULL (cinder_bat)
const flameskull = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 1.0;
    const boneM = m.mat('bone', md.body, { acc: shade(md.body, -0.15) });
    const iron = m.mat('rust', '#4e3a34', { acc: '#b0683a' });
    const voidM = m.mat('smooth', '#140808');
    const tooth = m.mat('smooth', '#fff4dc');
    const flameO = glowMat(m, '#ff5a14', 2.6, 'smooth');
    const flameM = glowMat(m, '#ff9a2a', 2.8, 'smooth');
    const flameI = glowMat(m, '#ffe85a', 3.2, 'smooth');
    m.bone('skull', [0, 0, 0]);
    m.ell('skull', [0.03, 0.06, 0], [0.18, 0.17, 0.16], boneM);
    m.ell('skull', [-0.1, -0.02, 0], [0.1, 0.1, 0.13], boneM, { k: 0.05 });
    for (const s of SIDES) {
      m.sph('skull', [-0.15, 0.04, s * 0.07], 0.06, voidM, { op: 'sub', k: 0.01 });
      m.sph('skull', [-0.13, 0.04, s * 0.07], 0.04, voidM, { k: 0.004 });
      m.sph('skull', [-0.15, 0.04, s * 0.07], 0.03, glowMat(m, md.eye, 3.4, 'eye'), { k: 0.003 });
      m.ell('skull', [-0.11, -0.04, s * 0.11], [0.05, 0.04, 0.03], boneM, { k: 0.02 });
    }
    m.ell('skull', [-0.2, -0.04, 0], [0.03, 0.035, 0.022], voidM, { op: 'sub', k: 0.006 });
    m.box('skull', [-0.16, 0.2, 0.05], [0.06, 0.012, 0.012], 0.004, voidM, { op: 'sub', k: 0.004, rot: [0.3, 0.5, 0.6] });
    for (let i = -2; i <= 2; i++) m.box('skull', [-0.19 + Math.abs(i) * 0.012, -0.1, i * 0.035], [0.014, 0.02, 0.013], 0.004, tooth, { k: 0.002 });
    // rusted iron circlet with spikes
    m.tor('skull', [0.03, 0.12, 0], 0.17, 0.025, iron, { rot: [0, 0, 0.2], k: 0.004 });
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.5; m.cap('skull', [-0.1 + Math.abs(i - 2) * 0.05, 0.15 + Math.abs(i - 2) * 0.02, sin(a) * 0.15], [-0.11 + Math.abs(i - 2) * 0.05, 0.25 + (i === 2 ? 0.05 : 0), sin(a) * 0.17], 0.024, 0.008, iron, { k: 0.004 }); }
    // hinged jaw
    m.bone('jaw', [-0.02, -0.1, 0], 'skull');
    m.ell('jaw', [-0.08, -0.03, 0], [0.11, 0.045, 0.12], boneM, { k: 0.01 });
    m.ell('jaw', [-0.06, -0.0, 0], [0.09, 0.03, 0.09], null, { op: 'sub', k: 0.006 });
    for (let i = -2; i <= 2; i++) m.box('jaw', [-0.17 + Math.abs(i) * 0.014, 0.0, i * 0.035], [0.013, 0.018, 0.012], 0.004, tooth, { k: 0.002 });
    m.ell('jaw', [-0.1, -0.03, 0], [0.13, 0.07, 0.14], null, { op: 'bind' });
    // the fire it wears like hair
    m.bone('flame', [0.08, 0.12, 0], 'skull');
    for (const [dx, dy, z, l, r] of [[0.32, 0.36, 0, 1, 0.1], [0.36, 0.2, -0.1, 0.85, 0.08], [0.36, 0.22, 0.1, 0.85, 0.08], [0.18, 0.4, -0.12, 0.75, 0.07], [0.18, 0.4, 0.12, 0.75, 0.07], [0.42, 0.04, 0, 0.7, 0.07], [0.04, 0.34, 0, 0.6, 0.06]]) {
      m.cap('flame', [0, 0, z * 0.6], [dx * l, dy * l, z], r, 0.014, flameO, { k: 0.03 });
      m.cap('flame', [0, 0, z * 0.6], [dx * l * 0.72, dy * l * 0.72, z * 0.9], r * 0.7, 0.012, flameM, { k: 0.02 });
      m.cap('flame', [0, 0, z * 0.6], [dx * l * 0.42, dy * l * 0.42, z * 0.8], r * 0.45, 0.01, flameI, { k: 0.01 });
    }
    // a broken chain still hanging from the jaw
    m.bone('chain', [0.02, -0.16, 0.05], 'skull');
    chain(m, 'chain', [0, 0, 0], 4, iron, 0.05);
    m.emitter({ pos: [0.2, 0.25, 0], rate: 14, vel: [0.2, 0.7, 0], spread: 0.35, posSpread: [0.1, 0.05, 0.1], life: [0.35, 0.8], size: [1, 2], color: ['#ffe85a', '#ff9a2a', '#ff5a14'], gravity: -0.6, glow: 3 });
    m.points({ hit: [-0.05, 0.05, 0], mouth: [-0.2, -0.08, 0], cuts: [[-0.12, 0.1, 0], [0.05, 0.2, 0], [0.1, -0.05, 0.15], [0.1, -0.05, -0.15]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.root.position.y += sin(t * 1.9) * 0.07 - e.strike * 0.18;
    m.root.position.z += sin(t * 0.8) * 0.06;
    const s = m.P('skull');
    s.rotation.z += sin(t * 1.4) * 0.08 + e.strike * 0.45 - e.wind * 0.35 - e.special * 0.2;
    s.rotation.x += sin(t * 1.1) * 0.08;
    s.rotation.y += sin(t * 0.7) * 0.12;
    m.P('jaw').rotation.z += Math.max(0, sin(t * 6)) * 0.12 * (1 - e.wind) + e.strike * 0.6 + e.special * 0.7 + e.roar * 0.6 + e.multi * Math.abs(sin(t * 16)) * 0.5;
    const f = m.P('flame');
    f.scale.setScalar(1 + sin(t * 11) * 0.06 + sin(t * 17.3) * 0.04 + e.wind * 0.2 + e.special * 0.4 + e.roar * 0.3);
    f.rotation.z += sin(t * 6.5) * 0.06 - e.strike * 0.3;
    const c = m.P('chain');
    c.rotation.z += sin(t * 1.9 - 0.8) * 0.25 + e.strike * 0.5;
    c.rotation.x += sin(t * 1.4 - 0.6) * 0.2;
  },
};

// ============================================================================ LAVA DRAKE (lava_wyrmling, elite)
const lavadrake = {
  reach: 0.6,
  build(m, md) {
    const scl = m.mat('scale', md.body, { acc: shade(md.body, 0.15) });
    const crust = m.mat('crust', '#3a2220', { glow: '#ff8a2a', gk: 2.4 });
    const belly = m.mat('plate', md.belly, { acc: shade(md.belly, -0.15) });
    const horn = m.mat('smooth', '#261a1c');
    const mem = m.mat('membrane', shade(md.body, -0.2), { acc: '#3a1410', glow: '#ff7a1a', gk: 2.0 });
    const mouthG = glowMat(m, '#ffb04a', 2.6, 'lava');
    const tooth = m.mat('smooth', '#fff0d0');
    m.bone('body', [0.15, 0.78, 0]);
    // torso + deep chest, lava-cracked back plates, obsidian spines
    m.ell('body', [0.05, 0, 0], [0.55, 0.3, 0.3], scl);
    m.ell('body', [-0.35, 0.04, 0], [0.32, 0.31, 0.29], scl, { k: 0.12 });
    m.ell('body', [-0.15, -0.16, 0], [0.5, 0.16, 0.24], belly, { op: 'paint' });
    m.ell('body', [0.0, 0.2, 0], [0.55, 0.14, 0.2], crust, { op: 'paint' });
    for (let i = 0; i < 6; i++) m.cry('body', [-0.4 + i * 0.17, 0.26 - Math.abs(i - 2) * 0.012, 0], 0.22 - i * 0.022, 0.05, horn, { dir: [0.45, 1, 0] });
    // neck rising to a horned head with a hinged jaw
    m.bone('neck', [-0.55, 0.16, 0], 'body');
    m.tube('neck', [[0, 0, 0], [-0.18, 0.32, 0], [-0.26, 0.56, 0]], [0.18, 0.14, 0.12], scl, { k: 0.08 });
    m.ell('neck', [-0.13, 0.22, 0], [0.12, 0.2, 0.12], belly, { op: 'paint' });
    for (let i = 0; i < 3; i++) m.cry('neck', [-0.06 - i * 0.07, 0.18 + i * 0.16, 0], 0.13, 0.04, horn, { dir: [0.8, 0.6, 0] });
    m.bone('head', [-0.27, 0.6, 0], 'neck');
    m.ell('head', [-0.04, 0.04, 0], [0.18, 0.13, 0.14], scl, { k: 0.05 });
    m.cap('head', [-0.12, 0.02, 0], [-0.38, 0.0, 0], 0.11, 0.075, scl, { k: 0.05 });
    m.box('head', [-0.14, 0.12, 0], [0.06, 0.03, 0.13], 0.02, scl, { k: 0.02, rot: [0, 0, -0.2] });
    for (const s of SIDES) {
      m.sph('head', [-0.13, 0.09, s * 0.085], 0.04, null, { op: 'sub', k: 0.008 });
      m.ell('head', [-0.12, 0.09, s * 0.085], [0.03, 0.026, 0.034], glowMat(m, md.eye, 3.2, 'eye'), { k: 0.003, rot: [s * 0.5, 0, 0] });
      m.tube('head', hornPath([0.04, 0.12, s * 0.08], [1, 0.5, s * 0.3], [0, 1, 0], 0.42, 0.9, 6), (t) => 0.055 * (1 - t) + 0.014, horn, { k: 0.015 });
      m.tube('head', hornPath([-0.02, -0.02, s * 0.12], [1, -0.2, s * 0.6], [0, 1, 0], 0.18, 0.5, 3), (t) => 0.035 * (1 - t) + 0.012, horn, { k: 0.01 });
      m.sph('head', [-0.38, 0.04, s * 0.04], 0.018, glowMat(m, '#ffd04a', 3, 'smooth'), { k: 0.003 });
      for (const x of [-0.34, -0.26, -0.18]) m.cap('head', [x, -0.05, s * 0.07], [x - 0.01, -0.09, s * 0.07], 0.016, 0.007, tooth, { k: 0.002 });
    }
    m.ell('head', [-0.24, -0.06, 0], [0.14, 0.03, 0.08], mouthG, { k: 0.004 });
    m.bone('jaw', [-0.08, -0.07, 0], 'head');
    m.cap('jaw', [0, 0, 0], [-0.28, -0.02, 0], 0.08, 0.055, scl, { k: 0.02 });
    m.ell('jaw', [-0.14, 0.03, 0], [0.12, 0.025, 0.06], mouthG, { k: 0.004 });
    m.ell('jaw', [-0.14, -0.01, 0], [0.18, 0.08, 0.1], null, { op: 'bind' });
    // wings: half-folded, glowing seams
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [-0.2, 0.24, s * 0.22], 'body', { rot: [0, s * 0.2, 0] });
      wing(m, n, s, 2.4, 0.95, mem, scl, horn);
    }
    // four legs: thick thighs, clawed feet planted on the ground
    for (const [n, x, s, fr] of [['lf', -0.42, -1, true], ['rf', -0.42, 1, true], ['lb', 0.38, -1, false], ['rb', 0.38, 1, false]]) {
      m.bone(n, [x, -0.1, s * 0.24], 'body');
      m.ell(n, [0.02, -0.04, 0], fr ? [0.13, 0.17, 0.1] : [0.17, 0.2, 0.12], scl, { k: 0.05 });
      m.tube(n, fr ? [[0, -0.12, 0], [-0.04, -0.4, 0], [-0.02, -0.62, 0]] : [[0.04, -0.12, 0], [0.12, -0.36, 0], [0.02, -0.62, 0]], [0.08, 0.065, 0.055], scl, { k: 0.03 });
      m.ell(n, [-0.06, -0.65, 0], [0.12, 0.045, 0.08], scl, { k: 0.02 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.14, -0.66, f * 0.04], [-0.2, -0.68, f * 0.05], 0.024, 0.01, horn, { k: 0.004 });
    }
    // tail in two segments with a glowing spade
    m.bone('tail', [0.55, -0.02, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.32, -0.16, 0], [0.62, -0.26, 0.05]], [0.2, 0.15, 0.11], scl, { k: 0.06 });
    m.ell('tail', [0.3, -0.04, 0], [0.32, 0.06, 0.1], crust, { op: 'paint' });
    for (let i = 0; i < 3; i++) m.cry('tail', [0.12 + i * 0.2, 0.12 - i * 0.1, 0], 0.13 - i * 0.02, 0.04, horn, { dir: [0.6, 1, 0] });
    m.bone('tail1', [0.62, -0.26, 0.05], 'tail');
    m.tube('tail1', [[0, 0, 0], [0.3, -0.04, 0], [0.5, 0.06, -0.02]], [0.11, 0.07, 0.04], scl, { k: 0.03 });
    m.plate('tail1', [0.55, 0.08, -0.02], [[-0.06, -0.06], [0.1, 0.0], [0.0, 0.14], [-0.08, 0.06]], 0.02, 0.01, mouthG, { k: 0.01 });
    m.emitter({ pos: [-0.85, 1.42, 0], rate: 5, vel: [-0.1, 0.5, 0], spread: 0.3, posSpread: 0.04, life: [0.5, 1.1], size: 1, color: ['#8a7a70', '#ffb04a'], glow: 1.4, gravity: -0.3 });
    m.emitter({ pos: [0.2, 1.1, 0], rate: 5, vel: [0, 0.5, 0], spread: 0.3, posSpread: [0.5, 0.05, 0.15], life: [0.4, 0.9], size: 1, color: ['#ffd04a', '#ff6a1a'], glow: 2.8, gravity: -0.4 });
    m.points({ hit: [-0.35, 0.95, 0], mouth: [-1.05, 1.32, 0], cuts: [[-0.75, 1.3, 0], [-0.2, 1.1, 0], [0.4, 0.95, 0], [0.1, 1.4, 0.6], [1.2, 0.5, 0], [0.0, 0.55, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const b = m.P('body');
    b.scale.y *= 1 + sin(t * 1.8) * 0.025;
    b.rotation.z += -e.wind * 0.22 + e.strike * 0.18 + sin(t * 1.8) * 0.015;
    b.position.y += e.wind * 0.04;
    const nk = m.P('neck');
    nk.rotation.z += sin(t * 1.3) * 0.06 - e.wind * 0.35 + e.strike * 0.5 + e.multi * 0.35;
    nk.rotation.y += sin(t * 0.6) * 0.1;
    m.P('head').rotation.z += sin(t * 1.3 + 0.5) * 0.05 - e.wind * 0.2 + e.strike * 0.2 + e.multi * (0.2 + sin(t * 20) * 0.05);
    m.P('jaw').rotation.z += Math.max(0, sin(t * 0.9)) * 0.1 + e.strike * 0.55 + e.multi * 0.6 + e.roar * 0.6 + e.wind * 0.15;
    const fl = sin(t * 1.8);
    m.P('wingL').rotation.x += -fl * 0.12 - e.wind * 0.5 - e.roar * 0.5; m.P('wingR').rotation.x += fl * 0.12 + e.wind * 0.5 + e.roar * 0.5;
    m.P('tail').rotation.y += sin(t * 1.2) * 0.22;
    m.P('tail1').rotation.y += sin(t * 1.2 - 0.9) * 0.35;
    m.P('tail').rotation.z += -e.strike * 0.2 + sin(t * 1.8) * 0.04;
    m.P('lf').rotation.z += -e.wind * 0.3 + e.strike * 0.4; m.P('rf').rotation.z += -e.wind * 0.3 + e.strike * 0.4;
    walk(m, ['lb', 'rb'], 1.8, 0.03);
  },
};

// ============================================================================ GRAVE GHOUL (bone_hound)
const ghoul = {
  reach: 0.5,
  build(m, md) {
    const skin = m.mat('flesh', md.body, { acc: shade(md.body, -0.08) });
    const rib = m.mat('bone', '#e4dcc4', { acc: '#b0a488' });
    const shroud = m.mat('cloth', md.belly, { acc: shade(md.belly, -0.2) });
    const claw = m.mat('bone', '#efe6cc', { acc: '#a89878' });
    const hair = m.mat('cloth', '#2a2430', { acc: '#3e3646' });
    const iron = m.mat('metal', '#5a5468', { acc: '#9a94a8' });
    const tooth = m.mat('smooth', '#f4ecd4');
    m.bone('body', [0.05, 0.52, 0]);
    // gaunt torso bent nearly double, ribs and spine showing
    m.ell('body', [0.0, 0.14, 0], [0.15, 0.22, 0.15], skin, { rot: [0, 0, -0.85] });
    m.ell('body', [0.08, -0.04, 0], [0.12, 0.1, 0.13], skin, { k: 0.05 });
    for (let i = 0; i < 4; i++) for (const s of SIDES) m.cap('body', [0.02 - i * 0.06, 0.2 + i * 0.03, s * 0.08], [-0.06 - i * 0.06, 0.1 + i * 0.03, s * 0.15], 0.018, 0.016, rib, { k: 0.006 });
    for (let i = 0; i < 5; i++) m.sph('body', [0.1 - i * 0.07, 0.24 + i * 0.045, 0], 0.03, rib, { k: 0.008 });
    // tattered burial shroud over the back, a grave lantern at the hip
    m.bone('shroud', [0.06, 0.3, 0], 'body');
    m.plate('shroud', [0, 0, 0], [[-0.16, 0.06], [0.12, 0.04], [0.2, -0.26], [0.12, -0.2], [0.06, -0.34], [-0.04, -0.24], [-0.12, -0.3], [-0.2, -0.18]], 0.13, 0.02, shroud, { rot: [0, 0, -0.5], k: 0.03 });
    m.ell('shroud', [0.0, -0.05, 0], [0.13, 0.2, 0.12], null, { op: 'sub', k: 0.02 });
    m.bone('lantern', [-0.02, -0.08, 0.17], 'body');
    m.cap('lantern', [0, 0.06, 0], [0, 0.0, 0], 0.008, 0.008, iron, { k: 0.002 });
    m.box('lantern', [0, -0.05, 0], [0.04, 0.055, 0.04], 0.01, iron, { k: 0.004 });
    m.sph('lantern', [0, -0.05, 0], 0.04, glowMat(m, md.accent, 2.8, 'smooth'), { k: 0.004 });
    // head thrust forward: sunken eyes, gaping maw, stringy hair
    m.bone('head', [-0.24, 0.3, 0], 'body');
    m.ell('head', [-0.02, 0.04, 0], [0.12, 0.11, 0.11], skin, { k: 0.03 });
    m.ell('head', [-0.1, -0.03, 0], [0.08, 0.07, 0.09], skin, { k: 0.04 });
    m.ell('head', [-0.15, -0.05, 0], [0.05, 0.035, 0.07], m.mat('smooth', '#1a0a12'), { op: 'sub', k: 0.006 });
    for (const s of SIDES) {
      for (const x of [-0.17, -0.13]) { m.cap('head', [x, -0.02, s * 0.04], [x - 0.005, -0.05, s * 0.04], 0.014, 0.006, tooth, { k: 0.002 }); m.cap('head', [x + 0.01, -0.09, s * 0.035], [x + 0.005, -0.06, s * 0.035], 0.012, 0.005, tooth, { k: 0.002 }); }
      m.sph('head', [-0.1, 0.06, s * 0.05], 0.04, m.mat('smooth', '#140a14'), { op: 'sub', k: 0.008 });
      m.sph('head', [-0.09, 0.06, s * 0.05], 0.026, glowMat(m, md.eye, 3.2, 'eye'), { k: 0.003 });
    }
    for (const [z, l] of [[-0.06, 0.2], [0.0, 0.24], [0.06, 0.18], [0.09, 0.14], [-0.09, 0.16]]) m.tube('head', [[0.02, 0.12, z], [0.1, 0.06, z * 1.3], [0.12, 0.12 - l, z * 1.5]], [0.022, 0.018, 0.012], hair, { k: 0.01 });
    // long arms with long claws; a broken shackle on one wrist
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.14, 0.26, s * 0.17], 'body');
      m.sph(n, [0, 0, 0], 0.05, skin, { k: 0.02 });
      m.tube(n, [[0, 0, 0], [0.03, -0.2, 0], [-0.04, -0.4, 0]], [0.04, 0.034, 0.03], skin, { k: 0.02 });
      m.sph(n, [0.03, -0.2, 0], 0.042, rib, { k: 0.01 });
      m.ell(n, [-0.06, -0.44, 0], [0.055, 0.045, 0.05], skin, { k: 0.015 });
      for (let f = -1; f <= 1; f++) m.tube(n, [[-0.09, -0.45, f * 0.028], [-0.16, -0.5, f * 0.034], [-0.2, -0.57, f * 0.036]], [0.02, 0.016, 0.01], claw, { k: 0.004 });
    }
    m.tor('armB', [-0.03, -0.36, 0], 0.045, 0.018, iron, { rot: [0, 0, 0.4], k: 0.004 });
    chain(m, 'armB', [0.0, -0.41, 0.03], 3, iron, 0.04);
    // crouched, bony legs
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.1, -0.08, s * 0.1], 'body');
      m.ell(n, [-0.04, -0.04, 0], [0.1, 0.07, 0.065], skin, { k: 0.02 });
      m.tube(n, [[-0.1, -0.06, 0], [0.04, -0.22, 0], [0.0, -0.42, 0]], [0.042, 0.034, 0.03], skin, { k: 0.02 });
      m.ell(n, [-0.05, -0.43, 0], [0.09, 0.025, 0.045], skin, { k: 0.01 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.12, -0.44, f * 0.025], [-0.17, -0.45, f * 0.03], 0.016, 0.008, claw, { k: 0.003 });
    }
    m.emitter({ pos: [-0.04, 0.32, 0.2], rate: 3, vel: [0, 0.25, 0], spread: 0.3, posSpread: 0.03, life: [0.6, 1.2], size: 1, color: [md.accent, md.eye], glow: 2.6 });
    m.points({ hit: [-0.12, 0.72, 0], mouth: [-0.36, 0.78, 0], cuts: [[-0.25, 0.85, 0], [0.05, 0.82, 0], [-0.1, 0.5, -0.2], [0.15, 0.45, 0.2], [0.1, 0.15, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const b = m.P('body');
    b.position.y += sin(t * 2.6) * 0.015 - e.wind * 0.06;
    b.rotation.z += sin(t * 1.3) * 0.04 - e.wind * 0.2 + e.strike * 0.35;
    const h = m.P('head');
    h.rotation.x += (sin(t * 0.7) > 0.8 ? 0.3 : 0) + sin(t * 9) * 0.02;
    h.rotation.z += -e.roar * 0.5 + e.strike * 0.2 + sin(t * 1.9) * 0.05;
    m.P('armF').rotation.z += e.wind * 1.8 - e.strike * 2.2 + sin(t * 1.6) * 0.08 + e.multi * sin(t * 20) * 0.8;
    m.P('armB').rotation.z += e.wind * 1.2 - e.strike * 0.8 + sin(t * 1.6 + 1) * 0.08 + e.multi * sin(t * 20 + PI) * 0.8;
    m.P('shroud').rotation.z += sin(t * 1.7) * 0.05 + e.strike * 0.2;
    m.P('lantern').rotation.x += sin(t * 2.1) * 0.25;
    m.P('lantern').rotation.z += sin(t * 1.6) * 0.2 + e.strike * 0.4;
    walk(m, ['legF', 'legB'], 3, 0.05 + e.multi * 0.15);
  },
};

// ============================================================================ QUEEN GEODESSA (boss) — crystal arachne
const geodessa = {
  reach: 0.8, die: 'flatten',
  build(m, md) {
    const cr = md.crystals || md.accent;
    const rock = m.mat('stone', md.belly, { acc: md.body });
    const shell = m.mat('chitin', md.body, { acc: cr });
    const skin = m.mat('smooth', '#c8b0f0', { acc: '#e8d8ff' });
    const bodice = m.mat('crystal', shade(md.body, 0.15), { acc: md.body });
    const hairM = m.mat('crystal', '#6a4ab0', { acc: '#9a7ae0' });
    const gold = m.mat('metal', '#e0b050', { acc: '#fff0a8' });
    const crys = glowMat(m, cr, 1.8);
    const ice = glowMat(m, '#7affff', 1.8);
    const pinkC = glowMat(m, '#ff7ad8', 2.0);
    const sigil = glowMat(m, md.eye, 2.6, 'smooth');
    // abdomen: a cracked-open geode, amethyst blooming from the split, a glowing hourglass on the rear
    m.bone('abdomen', [0.9, 1.25, 0]);
    m.ell('abdomen', [0.55, 0.3, 0], [0.98, 0.82, 0.82], rock, { rot: [0, 0, -0.25], noise: 0.025, nf: 4 });
    m.ell('abdomen', [0.5, 0.92, 0], [0.62, 0.32, 0.46], null, { op: 'sub', k: 0.06 });
    for (const [c, d, l, r, mm] of [[[0.5, 0.6, 0], [0.1, 1, 0], 0.55, 0.13, crys], [[0.25, 0.62, -0.18], [-0.3, 1, -0.4], 0.42, 0.1, crys], [[0.75, 0.6, 0.15], [0.4, 1, 0.3], 0.44, 0.11, pinkC], [[0.4, 0.62, 0.22], [0, 1, 0.5], 0.36, 0.09, crys], [[0.7, 0.62, -0.2], [0.3, 1, -0.5], 0.38, 0.1, ice], [[0.1, 0.6, 0.05], [-0.6, 1, 0.1], 0.32, 0.09, pinkC]]) m.cry('abdomen', c, l, r, mm, { dir: d });
    m.plate('abdomen', [1.32, 0.18, 0], [[-0.2, 0.26], [0.2, 0.26], [0.05, 0], [0.2, -0.26], [-0.2, -0.26], [-0.05, 0]], 0.25, 0.01, sigil, { op: 'paint', rot: [0, PI / 2, -0.35] });
    m.cap('abdomen', [1.45, -0.05, 0], [1.62, -0.16, 0], 0.12, 0.06, shell, { k: 0.04 });
    // crystal armour plates on the abdomen (shed in phase 2)
    m.bone('armor', [0.5, 0.6, 0], 'abdomen', { solo: true });
    for (const [c, d, l, r, mm] of [[[0.45, 0.2, -0.55], [0.2, 0.6, -1], 0.5, 0.13, crys], [[0.45, 0.2, 0.55], [0.2, 0.6, 1], 0.5, 0.13, crys], [[0.85, 0.05, -0.5], [0.6, 0.6, -1], 0.4, 0.11, ice], [[0.85, 0.05, 0.5], [0.6, 0.6, 1], 0.4, 0.11, ice], [[0.0, 0.25, -0.5], [-0.2, 0.7, -1], 0.42, 0.11, pinkC], [[0.0, 0.25, 0.5], [-0.2, 0.7, 1], 0.42, 0.11, pinkC], [[1.05, -0.1, 0], [1, 0.6, 0], 0.48, 0.13, crys]]) m.cry('armor', c, l, r, mm, { dir: d });
    // cephalothorax the legs grow from
    m.bone('ceph', [-0.95, -0.2, 0], 'abdomen');
    m.ell('ceph', [0, 0, 0], [0.58, 0.38, 0.52], shell, { k: 0.08 });
    m.ell('ceph', [0.6, 0.05, 0], [0.3, 0.26, 0.3], shell, { k: 0.15 });
    for (let i = 0; i < 3; i++) m.cry('ceph', [0.1 - i * 0.22, 0.32, 0], 0.18, 0.06, crys, { dir: [0.3, 1, 0] });
    // the queen: crystal-skinned torso rising from the spider's front
    m.bone('torso', [-0.4, 0.26, 0], 'ceph', { scale: 1.45 });
    m.cap('torso', [0, 0, 0], [0, 0.48, 0], 0.22, 0.16, skin, { k: 0.08 });
    m.ell('torso', [-0.02, 0.62, 0], [0.19, 0.2, 0.26], bodice, { k: 0.06 });
    m.ell('torso', [-0.06, 0.22, 0], [0.18, 0.18, 0.22], bodice, { op: 'paint' });
    m.tor('torso', [0, 0.78, 0], 0.13, 0.03, gold, { k: 0.006 });
    m.cry('torso', [-0.18, 0.52, 0], 0.14, 0.06, sigil, { dir: [-1, 0.3, 0] });
    for (const s of SIDES) for (const [c, d, l] of [[[0.0, 0.78, s * 0.25], [0.2, 1, s * 0.6], 0.24], [[0.06, 0.74, s * 0.31], [0.4, 0.6, s * 1], 0.18]]) m.cry('torso', c, l, 0.06, crys, { dir: d });
    // head: four glowing eyes, long crystal hair, a crown of gems
    m.bone('head', [-0.02, 0.86, 0], 'torso');
    m.cap('head', [0, -0.04, 0], [0, 0.06, 0], 0.07, 0.07, skin, { k: 0.02 });
    m.ell('head', [0, 0.17, 0], [0.15, 0.17, 0.14], skin, { k: 0.03 });
    m.ell('head', [-0.09, 0.08, 0], [0.08, 0.08, 0.1], skin, { k: 0.04 });
    for (const s of SIDES) {
      m.ell('head', [-0.14, 0.17, s * 0.055], [0.02, 0.022, 0.036], null, { op: 'sub', k: 0.004 });
      m.ell('head', [-0.13, 0.17, s * 0.055], [0.018, 0.02, 0.034], glowMat(m, md.eye, 3.2, 'eye'), { k: 0.002, rot: [s * 0.35, 0, 0] });
      m.sph('head', [-0.12, 0.23, s * 0.035], 0.017, glowMat(m, md.eye, 3.2, 'eye'), { k: 0.002 });
    }
    m.ell('head', [-0.16, 0.06, 0], [0.012, 0.01, 0.03], m.mat('smooth', '#5a2a6a'), { op: 'sub', k: 0.003 });
    for (const [c, d, l, r] of [[[0.08, 0.24, 0], [1, 0.1, 0], 0.5, 0.08], [[0.08, 0.2, -0.1], [1, -0.4, -0.35], 0.6, 0.075], [[0.08, 0.2, 0.1], [1, -0.4, 0.35], 0.6, 0.075], [[0.06, 0.12, -0.12], [0.6, -1, -0.3], 0.62, 0.07], [[0.06, 0.12, 0.12], [0.6, -1, 0.3], 0.62, 0.07], [[0.1, 0.1, 0], [0.5, -1, 0], 0.66, 0.08], [[0.0, 0.3, 0], [0.6, 0.6, 0], 0.32, 0.07]]) m.cry('head', c, l, r, hairM, { dir: d });
    m.tor('head', [0.0, 0.3, 0], 0.13, 0.026, gold, { rot: [0, 0, -0.2], k: 0.006 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2 + PI, mm = [crys, ice, pinkC][i % 3];
      m.cry('head', [cos(a) * 0.12, 0.31 - cos(a) * 0.03, sin(a) * 0.12], i === 0 ? 0.3 : 0.17 + (i % 2) * 0.05, 0.035, mm, { dir: [cos(a) * 0.25, 1, sin(a) * 0.25] });
    }
    // arms ending in long crystal talons
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [0.0, 0.7, s * 0.3], 'torso');
      m.sph(n, [0, 0, 0], 0.08, skin, { k: 0.03 });
      m.cap(n, [0, 0, 0], [0.04, -0.36, 0], 0.07, 0.06, skin, { k: 0.03 });
      m.cap(n, [0.04, -0.36, 0], [-0.12, -0.66, 0], 0.06, 0.05, skin, { k: 0.02 });
      m.cry(n, [0.0, -0.46, 0], 0.18, 0.06, crys, { dir: [0.4, 1, 0] });
      m.tor(n, [-0.08, -0.6, 0], 0.06, 0.018, gold, { rot: [0, 0, -0.5], k: 0.004 });
      m.ell(n, [-0.14, -0.7, 0], [0.06, 0.055, 0.05], skin, { k: 0.01 });
      for (let f = -1; f <= 1; f++) m.cry(n, [-0.17, -0.72, f * 0.035], 0.26, 0.026, f ? crys : pinkC, { dir: [-1, -0.8, f * 0.25] });
    }
    // eight legs: femur up-and-out, tibia down to the ground; crystal studs + tips
    const LF = 1.6, LT = 2.45;
    [-0.9, -0.35, 0.3, 0.85].forEach((ay, i) => {
      for (const side of [1, -1]) {
        const n = (side > 0 ? 'l' : 'r') + i;
        m.bone(n, [-0.35 + i * 0.2, 0.0, side * 0.3], 'ceph', { rot: [side * 0.75, side * -ay, 0], order: 'YXZ' });
        m.cap(n, [0, 0, 0], [0, LF, 0], 0.1, 0.075, shell, { k: 0.05 });
        m.sph(n, [0, LF, 0], 0.1, rock, { k: 0.03 });
        for (const y of [0.45, 0.95]) m.cry(n, [0, y, side * -0.07], 0.2, 0.05, crys, { dir: [0, 0.4, -side] });
        m.bone(n + 't', [0, LF, 0], n, { rot: [side * -1.25, 0, 0] });
        m.cap(n + 't', [0, 0, 0], [0, -LT * 0.55, 0], 0.08, 0.065, shell, { k: 0.03 });
        m.cap(n + 't', [0, -LT * 0.55, 0], [0, -LT + 0.25, 0], 0.065, 0.04, shell, { k: 0.02 });
        m.cry(n + 't', [0, -LT + 0.27, 0], 0.36, 0.06, i % 2 ? ice : crys, { dir: [0, -1, 0] });
      }
    });
    m.bone('thread', [0.55, 1.15, 0], 'abdomen');
    const thread = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 9, 0)]), new THREE.LineBasicMaterial({ color: new THREE.Color('#e8e8ff').multiplyScalar(1.6), transparent: true, opacity: 0.8 }));
    m.attach('thread', thread);
    m.emitter({ pos: [1.2, 2.3, 0], rate: 8, vel: [0, 0.4, 0], spread: 0.3, posSpread: [0.6, 0.3, 0.5], life: [0.8, 1.6], size: 1, color: [cr, '#7affff', '#ffffff'], glow: 2.6 });
    m.emitter({ pos: [-0.6, 2.75, 0], rate: 4, vel: [0, 0.3, 0], spread: 0.2, posSpread: [0.12, 0.05, 0.12], life: [0.6, 1.2], size: 1, color: ['#ff7ad8', '#7affff', '#ffffff'], glow: 2.8 });
    m.points({ height: 3.5, hit: [-0.75, 2.2, 0], mouth: [-0.7, 2.75, 0], cuts: [[-0.6, 2.3, 0], [-0.6, 1.7, 0], [0.9, 2.0, 0], [1.6, 1.4, 0], [0, 0.9, -1.0], [0.6, 0.9, 1.0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    for (let i = 0; i < 4; i++) {
      const ph = t * 3 + i * 1.7;
      m.P('l' + i).rotation.x += sin(ph) * 0.06; m.P('r' + i).rotation.x -= sin(ph + 2) * 0.06;
      if (i < 2) {
        m.P('l' + i).rotation.z += e.wind * 0.6 - e.strike * 0.5 + e.multi * sin(t * 16 + i) * 0.5;
        m.P('r' + i).rotation.z += e.wind * 0.6 - e.strike * 0.5 + e.multi * sin(t * 16 + i + 1) * 0.5;
      }
    }
    const tr = m.P('torso');
    tr.rotation.z += sin(t * 1.2) * 0.04 + e.wind * 0.3 - e.strike * 0.45 - e.special * 0.25 + e.roar * 0.15;
    tr.rotation.y += sin(t * 0.7) * 0.1;
    tr.scale.y *= 1 + sin(t * 2.2) * 0.012;
    m.P('head').rotation.z += sin(t * 1.5) * 0.05 + e.roar * 0.35 - e.special * 0.15;
    m.P('head').rotation.x += sin(t * 0.9) * 0.06;
    const raise = e.wind * 1.6 + e.roar * 1.4;
    m.P('armF').rotation.z += -raise - e.strike * 1.0 - e.special * 1.3 + sin(t * 1.6) * 0.08 + e.multi * sin(t * 14) * 0.4;
    m.P('armB').rotation.z += -raise * 0.8 - e.strike * 0.4 - e.special * 1.1 + sin(t * 1.6 + 1.2) * 0.08;
    m.P('armF').rotation.x += -e.roar * 0.6; m.P('armB').rotation.x += e.roar * 0.6;
    m.P('ceph').rotation.z += -e.wind * 0.1 + e.strike * 0.12;
    m.P('abdomen').rotation.z += sin(t * 1.4) * 0.025 + e.special * 0.06;
    m.P('abdomen').position.y += sin(t * 1.4) * 0.03;
    m.P('thread').scale.y = Math.max(0.001, 1 - m.env.intro);
  },
  intro(m, k) { m.root.position.y += (1 - ease.outCubic(k)) * 6; m.root.rotation.y += (1 - k) * 0.8 * sin(k * 6); },
  phase(m, n) { if (n >= 2) m.P('armor').visible = false; },
  onDie(m) { m.P('thread').visible = false; },
};

export const RPG_ARCHES2 = { mossgolem, glowwisp, bloatcap, sporegoblin, gargoyle, magmaimp, flameskull, lavadrake, ghoul, geodessa };
