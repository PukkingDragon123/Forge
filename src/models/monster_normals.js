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
/** Wing-plane point: (chord x, span y) → bone space for a membrane tilted up by `lift`, spanning ±z by side s. */
const wp = (x, y, s, lift = 0.25) => [x, y * Math.sin(lift), s * y * Math.cos(lift)];

// ============================================================================ RAT (rustrat)
const rat = {
  reach: 0.32,
  build(m, md) {
    const fur = m.mat('fur', md.body, { acc: md.accent });
    const belly = m.mat('fur', md.belly, { j: 0.04 });
    const pink = m.mat('wart', '#c88a88', { acc: '#a86a6a' });
    const tailM = m.mat('scale', '#a8807a', { ts: 2.2 });
    const tooth = m.mat('smooth', '#e8c870');
    const rust = m.mat('rust', '#5a4a46', { acc: '#a8643a' });
    const gum = m.mat('flesh', '#5a1a24');
    m.bone('body', [0.05, 0.3, 0]);
    // pear-shaped body: heavy rump, narrower shoulders, mangy lumps
    m.ell('body', [0.15, 0.02, 0], [0.28, 0.23, 0.22], fur, { noise: 0.008, nf: 16 });
    m.ell('body', [-0.12, 0.01, 0], [0.22, 0.19, 0.17], fur, { k: 0.1, noise: 0.008, nf: 16 });
    m.ell('body', [-0.01, 0.1, 0], [0.22, 0.13, 0.15], fur, { k: 0.08 });
    m.ell('body', [0.02, -0.15, 0], [0.34, 0.11, 0.19], belly, { op: 'paint' });
    // chewed scrap plates grown into the hide (it's a RUSTrat)
    m.box('body', [0.1, 0.21, 0.03], [0.12, 0.04, 0.1], 0.02, rust, { rot: [0.15, 0.2, -0.2], k: 0.012 });
    m.box('body', [-0.09, 0.18, -0.04], [0.08, 0.035, 0.08], 0.018, rust, { rot: [-0.2, -0.3, 0.15], k: 0.012 });
    // head: skull + tapering snout, round ears, beady eyes, yellow incisors
    m.bone('head', [-0.3, 0.07, 0], 'body');
    m.ell('head', [-0.06, 0.03, 0], [0.13, 0.11, 0.115], fur, { k: 0.07 });
    m.ell('head', [-0.12, -0.02, 0], [0.09, 0.07, 0.1], fur, { k: 0.05 }); // cheeks
    m.cap('head', [-0.1, 0.02, 0], [-0.29, -0.015, 0], 0.08, 0.034, fur, { k: 0.05 });
    m.sph('head', [-0.31, -0.008, 0], 0.03, pink, { k: 0.012 });
    m.ell('head', [-0.24, -0.052, 0], [0.065, 0.014, 0.05], gum, { op: 'sub', k: 0.01 });
    for (const s of SIDES) {
      m.box('head', [-0.282, -0.068, s * 0.011], [0.01, 0.03, 0.009], 0.004, tooth, { k: 0.004 });
      const ear = [[-0.06, 0], [0.0, -0.01], [0.06, 0.02], [0.07, 0.08], [0.03, 0.13], [-0.03, 0.12], [-0.07, 0.06]];
      m.plate('head', [0.0, 0.11, s * 0.07], ear, 0.006, 0.008, fur, { rot: [s * 0.45, s * 0.5, 0.1], k: 0.025 });
      m.ell('head', [-0.02, 0.17, s * 0.085], [0.035, 0.05, 0.035], pink, { op: 'paint' });
      beady(m, 'head', [-0.175, 0.065, s * 0.06], 0.021, md.eye);
    }
    // tail: long, ringed, tapering
    m.bone('tail', [0.4, -0.04, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.15, -0.07, 0], [0.32, -0.1, 0.03], [0.48, -0.06, 0.05], [0.6, 0.04, 0.04], [0.65, 0.17, 0]], (t) => 0.045 * (1 - t) + 0.016, tailM, { k: 0.04 });
    // legs: shoulder/haunch muscle → shin → long pink paw with toes
    const leg = (name, at, hind) => {
      m.bone(name, at, 'body');
      if (hind) {
        m.ell(name, [0.02, -0.02, 0], [0.11, 0.12, 0.07], fur, { k: 0.06 });
        m.tube(name, [[0.04, -0.06, 0], [0.06, -0.15, 0], [0.0, -0.205, 0]], [0.04, 0.03, 0.022], fur, { k: 0.03 });
        m.ell(name, [-0.04, -0.215, 0], [0.065, 0.018, 0.032], pink, { k: 0.015 });
      } else {
        m.ell(name, [0, -0.01, 0], [0.07, 0.09, 0.06], fur, { k: 0.05 });
        m.tube(name, [[0, -0.04, 0], [0.02, -0.13, 0], [-0.01, -0.2, 0]], [0.036, 0.028, 0.022], fur, { k: 0.03 });
        m.ell(name, [-0.035, -0.213, 0], [0.045, 0.017, 0.034], pink, { k: 0.015 });
      }
    };
    leg('lf', [-0.2, -0.08, -0.12], false); leg('lb', [0.24, -0.06, -0.13], true);
    leg('rf', [-0.2, -0.08, 0.12], false); leg('rb', [0.24, -0.06, 0.13], true);
    m.points({ hit: [-0.2, 0.42, 0], mouth: [-0.6, 0.35, 0], cuts: [[-0.45, 0.45, 0], [0, 0.55, 0], [0.25, 0.45, 0], [0.55, 0.3, 0], [-0.1, 0.25, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    walk(m, ['lf', 'rb', 'rf', 'lb'], 18, 0.25 * (0.4 + e.strike + e.multi));
    m.P('head').rotation.z += sin(t * 9) * 0.05 + e.strike * 0.35 - e.wind * 0.3;
    m.P('head').rotation.y += sin(t * 1.7) * 0.15;
    m.P('tail').rotation.y += sin(t * 5) * 0.4;
    m.P('tail').rotation.z += sin(t * 3) * 0.15 + e.wind * 0.4;
    m.P('body').position.y += Math.abs(sin(t * 18)) * 0.015 * (1 + e.multi * 3);
  },
};

// ============================================================================ BAT (cave / shard / cinder)
const bat = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 0.95; m.res = 84;
    const fur = m.mat('fur', md.body, { acc: md.accent, ts: 1.6 });
    const chest = m.mat('fur', md.belly, { ts: 1.6 });
    const mem = m.mat('membrane', shade(md.body, 0.05), { acc: shade(md.body, -0.3), glow: md.glow ? '#ffb04a' : null, gk: 2.6 });
    const skin = m.mat('wart', mix(md.body, '#c88a9a', 0.5));
    const claw = m.mat('smooth', '#1a1418');
    const tooth = m.mat('smooth', '#f4ecd8');
    m.bone('body', [0, 0, 0]);
    // compact furry torso with a shaggy ruff
    m.ell('body', [0.03, -0.01, 0], [0.13, 0.1, 0.095], fur, { noise: 0.008, nf: 22 });
    m.ell('body', [-0.07, 0.02, 0], [0.08, 0.09, 0.1], fur, { k: 0.05, noise: 0.012, nf: 22 });
    m.ell('body', [-0.04, -0.06, 0], [0.09, 0.05, 0.07], chest, { op: 'paint' });
    // head: pug face, leaf nose, tall ears, little fangs
    m.ell('body', [-0.14, 0.05, 0], [0.075, 0.068, 0.07], fur, { k: 0.04 });
    m.cap('body', [-0.17, 0.04, 0], [-0.21, 0.025, 0], 0.042, 0.03, skin, { k: 0.02 });
    m.plate('body', [-0.222, 0.05, 0], [[-0.022, 0], [0.022, 0], [0.004, 0.05], [-0.004, 0.05]], 0.003, 0.004, skin, { rot: [0, PI / 2, 0], k: 0.008 });
    m.ell('body', [-0.205, 0.0, 0], [0.03, 0.011, 0.026], m.mat('flesh', '#4a1420'), { op: 'sub', k: 0.008 });
    for (const s of SIDES) {
      m.cap('body', [-0.205, 0.008, s * 0.015], [-0.206, -0.03, s * 0.012], 0.01, 0.005, tooth, { k: 0.003 });
      const ear = [[-0.034, 0], [0.03, 0.005], [0.014, 0.08], [-0.004, 0.14], [-0.022, 0.09]];
      m.plate('body', [-0.115, 0.1, s * 0.045], ear, 0.004, 0.006, fur, { rot: [s * 0.35, PI / 2, 0], k: 0.02 });
      m.ell('body', [-0.13, 0.16, s * 0.05], [0.015, 0.045, 0.02], skin, { op: 'paint' });
      beady(m, 'body', [-0.19, 0.07, s * 0.038], 0.014, md.eye, 1.4);
      // little hind feet with hooked claws
      m.cap('body', [0.1, -0.06, s * 0.04], [0.14, -0.12, s * 0.05], 0.015, 0.011, fur, { k: 0.02 });
      m.cap('body', [0.14, -0.12, s * 0.05], [0.12, -0.15, s * 0.05], 0.009, 0.005, claw, { k: 0.005 });
    }
    if (md.crystals) {
      const cry = glowMat(m, md.crystals, 1.8);
      for (const [c, d, l] of [[[0.04, 0.08, 0], [0.3, 1, 0], 0.14], [[0.1, 0.05, 0.04], [0.6, 0.8, 0.3], 0.1], [[0.08, 0.07, -0.05], [0.5, 0.9, -0.4], 0.09]]) m.cry('body', c, l, 0.03, cry, { dir: d });
    }
    if (md.glow) m.ell('body', [-0.03, -0.06, 0], [0.07, 0.05, 0.06], glowMat(m, '#ff8a2a', 2.2, 'lava'), { op: 'paint' });
    // wings: arm + finger bones under a scalloped membrane
    const tips = [[-0.02, 0.5], [0.11, 0.44], [0.2, 0.3], [0.24, 0.12]];
    const W = [[-0.07, 0.0], [-0.1, 0.18], [-0.07, 0.34], tips[0], [0.04, 0.36], tips[1], [0.12, 0.3], tips[2], [0.18, 0.16], tips[3], [0.12, 0.02]];
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [0.0, 0.04, s * 0.075], 'body');
      m.plate(n, [0, 0, 0], W, 0.005, 0.006, mem, { rot: [s * (PI / 2 - 0.25), 0, 0], k: 0.012 });
      m.cap(n, [-0.03, 0, 0], wp(-0.1, 0.18, s), 0.02, 0.014, fur, { k: 0.02 });
      for (const [x, y] of tips) m.cap(n, wp(-0.1, 0.18, s), wp(x, y, s), 0.011, 0.006, skin, { k: 0.006 });
      m.cap(n, wp(-0.1, 0.18, s), wp(-0.14, 0.2, s), 0.01, 0.005, claw, { k: 0.004 });
      if (md.crystals) for (const [x, y] of tips.slice(0, 3)) m.cry(n, wp(x, y, s), 0.06, 0.016, glowMat(m, md.crystals, 1.8), { dir: [0.2, 1, s * 0.5] });
    }
    if (md.glow) m.emitter({ pos: [0.05, -0.1, 0], rate: 10, vel: [0.1, -0.4, 0], spread: 0.3, life: [0.4, 0.9], size: 1, color: ['#ffb04a', '#ff6a1a'], gravity: 1, glow: 2.5 });
    if (md.crystals) m.emitter({ pos: [0.1, 0.2, 0], rate: 3, vel: [0, -0.2, 0], spread: 0.2, life: [0.6, 1.2], size: 1, color: md.crystals, glow: 2.5 });
    m.points({ hit: [-0.05, 0.03, 0], mouth: [-0.22, 0.02, 0], cuts: [[-0.15, 0.06, 0], [0.08, 0, 0], [0, 0.12, 0.3], [0, 0.12, -0.3], [0.05, -0.08, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const sp = 13 + e.strike * 10 + e.multi * 12;
    const flap = sin(t * sp);
    const a = flap * 0.75 + 0.1 + e.wind * 0.7;
    m.P('wingL').rotation.x += -a; m.P('wingR').rotation.x += a;
    m.P('wingL').rotation.y += flap * 0.18; m.P('wingR').rotation.y -= flap * 0.18;
    m.root.position.y += -flap * 0.05 + sin(t * 1.3) * 0.08 - e.strike * 0.25;
    m.root.position.x += sin(t * 0.9) * 0.08;
    m.P('body').rotation.z += e.strike * 0.5 - e.wind * 0.2;
  },
};

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
    // a dull little face — eyes are just dark beads suspended in the jelly
    for (const s of SIDES) beady(m, 'body', [-0.41, 0.38, s * 0.12], 0.026, null);
    m.ell('body', [-0.47, 0.25, 0], [0.04, 0.022, 0.07], mouthM, { op: 'sub', k: 0.015 });
    if (md.inside === 'copper') {
      const cu = m.mat('rust', '#c8743a', { acc: '#3a9a7a' });
      const sunk = m.mat('slime', mix(md.body, '#c8743a', 0.55), { acc: md.accent });
      for (const [p, r] of [[[0.3, 0.46, 0.25], 0.075], [[-0.12, 0.6, -0.2], 0.06], [[0.36, 0.22, -0.32], 0.07], [[0.04, 0.35, 0.42], 0.065]]) m.ell('body', p, [r, r * 0.85, r], cu, { k: 0.012, noise: 0.018, nf: 20 });
      for (const p of [[-0.2, 0.3, 0.38], [0.2, 0.55, -0.12], [-0.3, 0.15, -0.36]]) m.sph('body', p, 0.09, sunk, { op: 'paint' });
    }
    if (md.inside === 'gem') {
      const pink = glowMat(m, '#ff9af0', 1.7), cyan = glowMat(m, '#9ae8ff', 1.7);
      m.cry('body', [0.18, 0.45, 0.18], 0.24, 0.05, pink, { dir: [0.4, 1, 0.4] });
      m.cry('body', [0.2, 0.3, -0.25], 0.18, 0.045, cyan, { dir: [0.6, 0.6, -0.6] });
      m.cry('body', [-0.12, 0.55, -0.1], 0.15, 0.04, pink, { dir: [-0.3, 1, -0.4] });
      m.cry('body', [0.3, 0.1, 0.3], 0.14, 0.04, cyan, { dir: [0.7, 0.3, 0.6] });
      for (const p of [[-0.25, 0.3, 0.35], [0.1, 0.6, 0.15]]) m.sph('body', p, 0.08, m.mat('slime', mix(md.body, '#ff9af0', 0.5)), { op: 'paint' });
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

// ============================================================================ BEETLE (rock beetle)
const beetle = {
  reach: 0.35, die: 'flatten',
  build(m, md) {
    const shell = m.mat('chitin', md.body, { acc: md.accent });
    const rock = m.mat('stone', mix(md.body, '#7a7068', 0.5), { acc: md.accent });
    const under = m.mat('chitin', md.belly, { acc: shade(md.belly, 0.25) });
    m.bone('body', [0, 0, 0]);
    m.ell('body', [0.08, 0.2, 0], [0.38, 0.12, 0.27], under);
    m.ell('body', [0.08, 0.34, 0], [0.42, 0.22, 0.32], shell, { k: 0.04 });
    m.box('body', [0.12, 0.56, 0], [0.36, 0.012, 0.009], 0.004, null, { op: 'sub', k: 0.01 });
    // rocky crust grown on the wing cases
    for (const [p, r] of [[[0.18, 0.5, 0.13], [0.11, 0.06, 0.1]], [[-0.02, 0.52, -0.12], [0.1, 0.06, 0.09]], [[0.32, 0.44, -0.06], [0.09, 0.05, 0.1]], [[0.05, 0.47, 0.22], [0.07, 0.04, 0.06]]]) m.ell('body', p, r, rock, { k: 0.03, noise: 0.018, nf: 16 });
    // pronotum, head, curved horn, mandibles
    m.ell('body', [-0.27, 0.32, 0], [0.16, 0.14, 0.22], shell, { k: 0.03 });
    m.ell('body', [-0.4, 0.26, 0], [0.09, 0.08, 0.11], under, { k: 0.03 });
    m.tube('body', hornPath([-0.43, 0.29, 0], [-1, 0.25, 0], [0, 1, 0], 0.32, 1.1, 5), (t) => 0.05 * (1 - t) + 0.012, shell, { k: 0.03 });
    m.tube('body', hornPath([-0.3, 0.43, 0], [-1, 0.5, 0], [0, -1, 0], 0.18, 0.6, 3), (t) => 0.035 * (1 - t) + 0.01, shell, { k: 0.03 });
    for (const s of SIDES) {
      m.tube('body', [[-0.45, 0.2, s * 0.05], [-0.52, 0.18, s * 0.07], [-0.56, 0.18, s * 0.03]], [0.019, 0.015, 0.01], under, { k: 0.01 });
      beady(m, 'body', [-0.44, 0.29, s * 0.082], 0.02, md.eye, 1.4);
    }
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
      const n = (s > 0 ? 'l' : 'r') + i;
      m.bone(n, [-0.22 + i * 0.22, 0.22, s * 0.2], 'body');
      m.tube(n, [[0, 0, 0], [-0.02, 0.07, s * 0.14], [-0.05, -0.12, s * 0.24], [-0.07, -0.21, s * 0.27]], [0.028, 0.024, 0.018, 0.012], under, { k: 0.02 });
      m.cap(n, [-0.035, -0.02, s * 0.2], [-0.06, -0.02, s * 0.23], 0.01, 0.005, under, { k: 0.004 });
    }
    m.points({ hit: [-0.1, 0.5, 0], mouth: [-0.6, 0.3, 0], cuts: [[-0.45, 0.4, 0], [0, 0.6, 0], [0.4, 0.5, 0], [-0.1, 0.35, 0.3], [0.2, 0.3, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    walk(m, ['l0', 'r1', 'l2', 'r0', 'l1', 'r2'], 16, 0.25 * (0.3 + e.strike + e.multi), 2.1);
    if (e.multi > 0.05) m.root.rotation.y += m.st * 22 * e.multi;
    m.P('body').position.y += e.wind * -0.04;
  },
};

// ============================================================================ MOLE (burrow brute)
const mole = {
  reach: 0.5,
  build(m, md) {
    const fur = m.mat('fur', md.body, { acc: shade(md.body, 0.25), ts: 1.3 });
    const pink = m.mat('wart', md.belly, { acc: shade(md.belly, -0.2) });
    const clawM = m.mat('bone', md.accent);
    m.bone('body', [0, 0, 0]);
    m.ell('body', [0.06, 0.52, 0], [0.44, 0.46, 0.42], fur, { noise: 0.012, nf: 9 });
    m.ell('body', [0.1, 0.26, 0], [0.47, 0.26, 0.43], fur, { k: 0.15 });
    m.ell('body', [-0.2, 0.66, 0], [0.25, 0.21, 0.26], fur, { k: 0.15 });
    m.box('body', [0, -0.25, 0], [1, 0.25, 1], 0.01, null, { op: 'sub', k: 0.02 });
    // snout ending in the star nose: a ring of fleshy feelers
    m.cap('body', [-0.3, 0.63, 0], [-0.58, 0.61, 0], 0.15, 0.07, fur, { k: 0.08 });
    m.sph('body', [-0.62, 0.61, 0], 0.035, pink, { k: 0.02 });
    for (let i = 0; i < 11; i++) { const a = (i / 11) * PI * 2; m.cap('body', [-0.6, 0.61 + sin(a) * 0.035, cos(a) * 0.035], [-0.66, 0.61 + sin(a) * 0.085, cos(a) * 0.085], 0.019, 0.011, pink, { k: 0.008 }); }
    m.ell('body', [-0.5, 0.53, 0], [0.06, 0.016, 0.06], m.mat('flesh', '#4a1a20'), { op: 'sub', k: 0.01 });
    for (const s of SIDES) beady(m, 'body', [-0.43, 0.74, s * 0.13], 0.015, null);
    m.ell('body', [-0.15, 0.3, 0], [0.3, 0.22, 0.3], m.mat('fur', mix(md.body, md.belly, 0.35)), { op: 'paint' });
    // huge spade hands with four curved claws
    for (const s of SIDES) {
      const n = s < 0 ? 'clawF' : 'clawB';
      m.bone(n, [-0.36, 0.5, s * 0.34], 'body');
      m.cap(n, [0.08, 0.06, 0], [-0.02, -0.08, 0], 0.11, 0.09, fur, { k: 0.08 });
      m.ell(n, [-0.04, -0.18, 0], [0.15, 0.17, 0.07], fur, { k: 0.04 });
      m.ell(n, [-0.06, -0.2, -s * 0.04], [0.12, 0.13, 0.03], pink, { op: 'paint' });
      for (let i = 0; i < 4; i++) m.tube(n, hornPath([-0.07, -0.29, -0.075 + i * 0.05], [-0.3, -1, 0], [1, 0, 0], 0.2, 0.9, 4), (t) => 0.03 * (1 - t) + 0.009, clawM, { k: 0.015 });
    }
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.18, 0.18, s * 0.26], 'body');
      m.ell(n, [0, -0.06, 0], [0.1, 0.1, 0.08], fur, { k: 0.06 });
      m.ell(n, [-0.06, -0.15, 0], [0.12, 0.03, 0.07], pink, { k: 0.03 });
    }
    m.points({ hit: [-0.25, 0.75, 0], mouth: [-0.66, 0.6, 0], cuts: [[-0.4, 0.6, 0], [0, 0.95, 0], [0.35, 0.6, 0], [-0.55, 0.45, -0.3], [0.1, 0.3, 0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('clawF').rotation.z += -e.wind * 1.6 + e.strike * 1.9 + sin(t * 2) * 0.1 + e.multi * sin(t * 18) * 0.9;
    m.P('clawB').rotation.z += -e.wind * 1.3 + e.strike * 1.4 + sin(t * 2 + 1) * 0.1;
    m.P('body').rotation.z += sin(t * 1.6) * 0.03;
    walk(m, ['legF', 'legB'], 6, 0.12);
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
    const N = { noise: 0.03, nf: 5 };
    m.bone('torso', [0, 0.42, 0]);
    m.ell('torso', [0.06, 0.44, 0], [0.42, 0.42, 0.36], rock, { ...N, rot: [0, 0, 0.15] });
    for (const s of SIDES) m.ell('torso', [0.0, 0.82, s * 0.36], [0.22, 0.2, 0.2], rock, { k: 0.08, ...N });
    m.ell('torso', [0.14, 0.88, 0], [0.3, 0.17, 0.32], rock, { k: 0.1, ...N });
    m.ell('torso', [0.12, 0.08, 0], [0.25, 0.16, 0.28], dark, { k: 0.08, ...N });
    // sunken boulder head with a glowing visor slit
    m.bone('head', [-0.24, 0.86, 0], 'torso');
    m.ell('head', [0, 0.1, 0], [0.18, 0.16, 0.18], rock, { k: 0.06, noise: 0.022, nf: 7 });
    m.box('head', [-0.12, 0.17, 0], [0.07, 0.045, 0.16], 0.03, rock, { k: 0.03, rot: [0, 0, -0.3] });
    m.box('head', [-0.17, 0.1, 0], [0.07, 0.024, 0.13], 0.01, dark, { op: 'sub', k: 0.01 });
    for (const s of SIDES) m.sph('head', [-0.13, 0.1, s * 0.06], 0.03, eyeG, { k: 0.004 });
    // arms: boulder shoulder → forearm → giant fist
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.06, 0.78, s * 0.54], 'torso');
      m.ell(n, [0, 0, 0], [0.16, 0.16, 0.16], rock, { k: 0.06, ...N });
      m.cap(n, [0, -0.05, 0], [0.02, -0.35, 0], 0.11, 0.1, rock, { k: 0.05, noise: 0.015, nf: 8 });
      m.cap(n, [0.02, -0.35, 0], [-0.02, -0.58, 0], 0.12, 0.13, rock, { k: 0.05, noise: 0.015, nf: 8 });
      m.ell(n, [-0.03, -0.68, 0], [0.19, 0.2, 0.18], rock, { k: 0.05, ...N });
      for (let f = -1; f <= 1; f++) m.ell(n, [-0.19, -0.7, f * 0.08], [0.06, 0.07, 0.055], rock, { k: 0.04, noise: 0.012, nf: 10 });
    }
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0.02, 0.1, s * 0.22], 'torso');
      m.cap(n, [0, -0.05, 0], [0, -0.36, 0], 0.15, 0.12, dark, { k: 0.06, noise: 0.015, nf: 8 });
      m.ell(n, [-0.05, -0.44, 0], [0.21, 0.085, 0.16], dark, { k: 0.05, noise: 0.012, nf: 9 });
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

// ============================================================================ CRAB (crystal crab)
const crab = {
  reach: 0.35, die: 'flatten',
  build(m, md) {
    const shell = m.mat('chitin', md.body, { acc: md.accent });
    const under = m.mat('plate', md.belly, { acc: md.body, ts: 1.5 });
    const geo = m.mat('stone', '#7a6a5a', { acc: '#a89880' });
    const cry = glowMat(m, md.crystals || md.accent, 1.8);
    const cry2 = glowMat(m, '#9ae8ff', 1.6);
    m.bone('body', [0, 0, 0]);
    m.ell('body', [0, 0.3, 0], [0.36, 0.16, 0.44], shell, { noise: 0.006, nf: 12 });
    m.ell('body', [0.02, 0.21, 0], [0.3, 0.08, 0.36], under, { k: 0.06 });
    for (let i = -3; i <= 3; i++) m.cap('body', [-0.28, 0.3, i * 0.1], [-0.36, 0.31, i * 0.115], 0.03, 0.012, shell, { k: 0.02 });
    // a geode grown on its back, cracked open, crystals inside
    m.ell('body', [0.04, 0.45, 0], [0.24, 0.15, 0.24], geo, { k: 0.06, noise: 0.02, nf: 9 });
    m.ell('body', [0.04, 0.58, 0], [0.17, 0.1, 0.17], m.mat('crystal', shade(md.crystals || md.accent, -0.3)), { op: 'sub', k: 0.02 });
    for (const [c, d, l, r, mm] of [[[0.04, 0.48, 0], [0, 1, 0], 0.28, 0.055, cry], [[-0.04, 0.48, 0.07], [-0.4, 1, 0.4], 0.2, 0.045, cry], [[0.12, 0.48, -0.06], [0.5, 1, -0.4], 0.22, 0.045, cry2], [[0.1, 0.48, 0.08], [0.4, 1, 0.5], 0.16, 0.04, cry], [[-0.04, 0.48, -0.09], [-0.3, 1, -0.6], 0.15, 0.035, cry2]]) m.cry('body', c, l, r, mm, { dir: d });
    for (const s of SIDES) {
      m.cap('body', [-0.26, 0.36, s * 0.1], [-0.32, 0.5, s * 0.12], 0.022, 0.017, shell, { k: 0.02 });
      m.sph('body', [-0.325, 0.53, s * 0.12], 0.028, m.mat('eye', '#120a0e'), { k: 0.006 });
    }
    m.ell('body', [-0.3, 0.24, 0], [0.05, 0.04, 0.1], under, { k: 0.02 });
    // claws: arm → swollen palm → fixed + hinged fingers
    for (const s of SIDES) {
      const n = s < 0 ? 'clawF' : 'clawB';
      m.bone(n, s < 0 ? [-0.32, 0.28, -0.36] : [-0.28, 0.28, 0.42], 'body', { rot: [0, 0, -0.3], scale: s < 0 ? 1 : 0.75 });
      m.cap(n, [0.08, 0, 0], [-0.06, 0.02, 0], 0.06, 0.055, shell, { k: 0.04 });
      m.ell(n, [-0.15, 0.02, 0], [0.14, 0.1, 0.08], shell, { k: 0.04 });
      m.cap(n, [-0.24, -0.02, 0], [-0.4, 0.02, 0], 0.055, 0.014, shell, { k: 0.03 });
      m.cap(n, [-0.22, 0.08, 0], [-0.38, 0.1, 0], 0.045, 0.013, shell, { k: 0.02 });
      m.cry(n, [-0.12, 0.1, 0], 0.09, 0.03, cry, { dir: [0.2, 1, 0] });
    }
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
      const n = (s > 0 ? 'l' : 'r') + i;
      m.bone(n, [-0.1 + i * 0.18, 0.22, s * 0.32], 'body');
      m.tube(n, [[0, 0, 0], [0.0, 0.1, s * 0.16], [-0.02, -0.08, s * 0.26], [-0.03, -0.22, s * 0.3]], [0.03, 0.026, 0.019, 0.01], shell, { k: 0.02 });
    }
    m.points({ hit: [0, 0.45, 0], mouth: [-0.4, 0.3, 0], cuts: [[-0.3, 0.35, 0], [0.1, 0.55, 0], [-0.55, 0.3, -0.35], [0.3, 0.3, 0.3], [0.05, 0.25, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('clawF').rotation.z += -e.wind * 0.9 + e.strike * 0.9 + sin(t * 3) * 0.08;
    m.P('clawF').rotation.y += e.strike * -0.4;
    m.P('clawB').rotation.z += sin(t * 2.5 + 1) * 0.12 + e.strike * 0.5;
    walk(m, ['l0', 'r1', 'l2', 'r0', 'l1', 'r2'], 12, 0.2, 2.1);
    m.root.position.z += sin(t * 1.2) * 0.04;
  },
};

// ============================================================================ WISP (prism wisp)
const wisp = {
  reach: 0.4, die: 'fade',
  build(m, md) {
    m.fly = 0.85;
    const flame = glowMat(m, md.body, 2.0);
    const flame2 = glowMat(m, md.accent, 2.0);
    const coreM = glowMat(m, md.belly, 2.6);
    const ink = m.mat('smooth', '#1a2a4a');
    m.bone('core', [0, 0, 0]);
    m.ell('core', [0, 0, 0], [0.24, 0.24, 0.24], flame, { noise: 0.03, nf: 8 });
    m.ell('core', [-0.05, -0.02, 0], [0.2, 0.2, 0.22], coreM, { op: 'paint' });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; m.cap('core', [cos(a) * 0.12, 0.1, sin(a) * 0.12], [cos(a) * 0.17, 0.4 + (i % 3) * 0.08, sin(a) * 0.17], 0.09, 0.012, i % 2 ? flame2 : flame, { k: 0.06 }); }
    for (const s of SIDES) m.ell('core', [-0.22, 0.03, s * 0.075], [0.03, 0.045, 0.028], ink, { op: 'sub', k: 0.01 });
    m.ell('core', [-0.235, -0.06, 0], [0.02, 0.012, 0.03], ink, { op: 'sub', k: 0.01 });
    for (let i = 0; i < 3; i++) {
      const a = (i * PI * 2) / 3;
      m.bone('orb' + i, [cos(a) * 0.55, 0.05, sin(a) * 0.55], 'core');
      m.cry('orb' + i, [0, -0.07, 0], 0.15, 0.04, i % 2 ? flame : flame2, { k: 0.002 });
    }
    m.emitter({ pos: [0, 0.2, 0], rate: 14, vel: [0.1, 0.5, 0], spread: 0.3, posSpread: 0.15, life: [0.5, 1.1], size: [1, 2], color: [md.body, md.accent, '#ffffff'], glow: 2.5, drag: 1 });
    m.points({ hit: [0, 0.05, 0], mouth: [-0.3, 0.05, 0], cuts: [[-0.15, 0.1, 0], [0.1, -0.1, 0], [0, 0.3, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const c = m.P('core');
    const fl = 1 + sin(t * 23) * 0.04 + sin(t * 37) * 0.03;
    c.scale.set(fl, fl * (1 + e.wind * 0.25), fl);
    c.rotation.y += t * 0.6;
    m.root.position.y += sin(t * 2) * 0.1;
    for (let i = 0; i < 3; i++) {
      const a = t * (2.5 + e.wind * 6) + (i * PI * 2) / 3;
      const p = m.P('orb' + i);
      p.position.set(cos(a) * 0.55, sin(a * 1.3) * 0.15 + 0.05, sin(a) * 0.55);
      p.rotation.set(a, a * 0.5, 0.4);
    }
  },
};

// ============================================================================ SPIDER (silk spider)
const spider = {
  reach: 0.4, die: 'flatten',
  build(m, md) {
    m.res = 80;
    const fur = m.mat('fur', md.body, { acc: md.belly, ts: 1.4 });
    const chit = m.mat('chitin', md.body, { acc: md.belly });
    const fang = m.mat('smooth', '#140c10');
    const sig = glowMat(m, md.accent, 2.4, 'smooth');
    m.bone('body', [0, 0, 0]);
    m.ell('body', [0.42, 0.47, 0], [0.36, 0.3, 0.3], fur, { rot: [0, 0, -0.25], noise: 0.01, nf: 14 });
    m.ell('body', [-0.07, 0.37, 0], [0.22, 0.16, 0.2], chit, { k: 0.06 });
    m.cap('body', [0.72, 0.36, 0], [0.8, 0.31, 0], 0.045, 0.022, chit, { k: 0.03 });
    m.plate('body', [0.45, 0.78, 0], [[-0.08, 0.11], [0.08, 0.11], [0.018, 0], [0.08, -0.11], [-0.08, -0.11], [-0.018, 0]], 0.12, 0.004, sig, { op: 'paint', rot: [PI / 2, 0, -0.25] });
    // eight beady eyes clustered on the brow
    for (const [y, z, r] of [[0.45, -0.045, 0.026], [0.45, 0.045, 0.026], [0.48, -0.1, 0.019], [0.48, 0.1, 0.019], [0.41, -0.11, 0.017], [0.41, 0.11, 0.017], [0.5, -0.03, 0.015], [0.5, 0.03, 0.015]]) {
      const dy = (y - 0.37) / 0.16, dz = z / 0.2;
      beady(m, 'body', [-0.07 - 0.22 * Math.sqrt(Math.max(0, 1 - dy * dy - dz * dz)) + r * 0.4, y, z], r, md.eye, 1.6);
    }
    for (const s of SIDES) {
      m.ell('body', [-0.27, 0.3, s * 0.045], [0.05, 0.06, 0.04], chit, { k: 0.02 });
      m.tube('body', [[-0.29, 0.26, s * 0.045], [-0.31, 0.2, s * 0.03], [-0.28, 0.16, s * 0.012]], [0.022, 0.016, 0.008], fang, { k: 0.008 });
    }
    const angles = [-0.75, -0.25, 0.25, 0.7];
    angles.forEach((a, i) => {
      for (const s of [1, -1]) {
        const n = (s > 0 ? 'l' : 'r') + i;
        m.bone(n, [-0.15 + i * 0.07, 0.38, s * 0.12], 'body', { rot: [0, s * a, 0] });
        m.tube(n, [[0, 0, 0], [0.02, 0.22, s * 0.2], [0.04, 0.12, s * 0.34], [0.05, -0.38, s * 0.5]], [0.034, 0.03, 0.024, 0.012], fur, { k: 0.03, kj: 0.012 });
        m.sph(n, [0.02, 0.22, s * 0.2], 0.036, chit, { k: 0.015 });
      }
    });
    m.points({ hit: [-0.15, 0.45, 0], mouth: [-0.32, 0.3, 0], cuts: [[-0.2, 0.45, 0], [0.3, 0.75, 0], [0.55, 0.55, 0], [-0.4, 0.3, 0.4], [0, 0.35, -0.45]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    for (let i = 0; i < 4; i++) {
      const ph = t * 10 + i * 1.6;
      m.P('l' + i).rotation.x += sin(ph) * 0.12 - e.wind * (i < 2 ? 0.5 : 0);
      m.P('r' + i).rotation.x += -sin(ph + 1) * 0.12 + e.wind * (i < 2 ? 0.5 : 0);
    }
    m.P('l0').rotation.z += e.wind * 0.8 + e.strike * -0.6;
    m.P('r0').rotation.z += e.wind * 0.8 + e.strike * -0.6;
    m.P('body').position.y += sin(t * 3) * 0.02 + e.wind * 0.06;
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

// ============================================================================ SNAIL (moss snail)
const snail = {
  reach: 0.3, die: 'flatten',
  build(m, md) {
    const skin = m.mat('slime', md.body, { acc: md.belly });
    const shellM = m.mat('chitin', md.accent, { acc: shade(md.accent, 0.35) });
    const moss = m.mat('moss', '#4a7a2a', { acc: '#9ac05a' });
    m.bone('body', [0, 0, 0]);
    for (const [x, y, ry, rz] of [[0.55, 0.06, 0.06, 0.12], [0.3, 0.08, 0.08, 0.16], [0.0, 0.1, 0.1, 0.18], [-0.3, 0.12, 0.11, 0.17], [-0.5, 0.18, 0.12, 0.15]]) m.ell('body', [x, y, 0], [0.22, ry, rz], skin, { k: 0.1 });
    m.ell('body', [-0.62, 0.27, 0], [0.13, 0.13, 0.12], skin, { k: 0.1 });
    m.box('body', [0, -0.25, 0], [1, 0.25, 1], 0.01, null, { op: 'sub', k: 0.02 });
    m.ell('body', [-0.72, 0.2, 0], [0.04, 0.015, 0.05], m.mat('flesh', '#3a2a1a'), { op: 'sub', k: 0.01 });
    for (const s of SIDES) m.cap('body', [-0.7, 0.24, s * 0.05], [-0.78, 0.2, s * 0.08], 0.022, 0.014, skin, { k: 0.015 });
    m.bone('shell', [0.12, 0.42, 0], 'body');
    const pts = [], rad = [], N = 26;
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * 2.6 * PI * 2, rr = 0.3 * Math.pow(0.66, th / (PI * 2));
      pts.push([cos(th + PI * 0.8) * rr, sin(th + PI * 0.8) * rr, (k / N) * 0.05]);
      rad.push(0.17 * Math.pow(0.68, th / (PI * 2)) + 0.016);
    }
    m.tube('shell', pts, rad, shellM, { k: 0.03, kj: 0.01 });
    for (const [p, r] of [[[0.05, 0.3, 0.06], [0.09, 0.05, 0.09]], [[-0.2, 0.24, -0.04], [0.07, 0.04, 0.07]], [[0.22, 0.18, 0.05], [0.06, 0.04, 0.06]]]) m.ell('shell', p, r, moss, { k: 0.02, noise: 0.02, nf: 22 });
    for (const s of SIDES) {
      const n = s < 0 ? 'eyeF' : 'eyeB';
      m.bone(n, [-0.66, 0.36, s * 0.05], 'body', { rot: [s * 0.2, 0, 0.3] });
      m.cap(n, [0, -0.02, 0], [0, 0.3, 0], 0.022, 0.016, skin, { k: 0.02 });
      m.sph(n, [0, 0.32, 0], 0.03, m.mat('eye', '#120a0e'), { k: 0.008 });
    }
    m.points({ hit: [-0.1, 0.55, 0], mouth: [-0.75, 0.22, 0], cuts: [[-0.55, 0.25, 0], [0.1, 0.8, 0], [0.35, 0.55, 0], [0.5, 0.15, 0], [-0.2, 0.15, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('eyeF').rotation.z += sin(t * 2) * 0.2 - e.hurt * 1.2; m.P('eyeB').rotation.z += sin(t * 2 + 1) * 0.2 - e.hurt * 1.2;
    m.P('eyeF').scale.y *= 1 - e.hurt * 0.6; m.P('eyeB').scale.y *= 1 - e.hurt * 0.6;
    m.P('body').scale.x *= 1 + sin(t * 1.5) * 0.04 + e.strike * 0.15;
    m.P('shell').rotation.z += -e.wind * 0.5 + e.strike * 0.7 + sin(t * 1.5) * 0.04;
  },
};

// ============================================================================ MOTH (lantern moth)
const moth = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 1.0; m.res = 84;
    const fuzz = m.mat('fur', md.body, { acc: md.belly, ts: 1.6 });
    const fore = m.mat('membrane', md.body, { acc: shade(md.body, -0.35), glow: md.accent, gk: 2.0 });
    const hind = m.mat('membrane', md.belly, { acc: shade(md.belly, -0.3), glow: md.accent, gk: 1.8 });
    const ring = m.mat('smooth', '#2a1a14');
    const spot = glowMat(m, md.accent, 2.4, 'smooth');
    m.bone('body', [0, 0, 0]);
    m.ell('body', [-0.03, 0, 0], [0.13, 0.11, 0.11], fuzz, { noise: 0.012, nf: 20 });
    m.cap('body', [0.06, -0.02, 0], [0.32, -0.1, 0], 0.09, 0.035, fuzz, { k: 0.05 });
    m.ell('body', [-0.12, 0.02, 0], [0.08, 0.09, 0.12], fuzz, { k: 0.04, noise: 0.018, nf: 24 });
    m.ell('body', [-0.17, 0.02, 0], [0.065, 0.065, 0.065], fuzz, { k: 0.03 });
    for (const s of SIDES) {
      beady(m, 'body', [-0.215, 0.035, s * 0.04], 0.022, md.eye, 1.2);
      m.tube('body', [[-0.2, 0.07, s * 0.03], [-0.26, 0.18, s * 0.08], [-0.25, 0.3, s * 0.13]], [0.012, 0.01, 0.008], fuzz, { k: 0.01 });
      m.plate('body', [-0.245, 0.2, s * 0.095], [[0, -0.1], [0.03, 0], [0, 0.1], [-0.03, 0]], 0.003, 0.004, fuzz, { rot: [s * 0.45, 0, 0.3], k: 0.006 });
      for (let k = 0; k < 3; k++) m.cap('body', [-0.08 + k * 0.06, -0.08, s * 0.04], [-0.1 + k * 0.07, -0.16, s * 0.07], 0.01, 0.007, fuzz, { k: 0.008 });
    }
    const F = [[-0.06, 0], [-0.12, 0.2], [-0.1, 0.42], [0.0, 0.5], [0.1, 0.42], [0.12, 0.22], [0.06, 0.04]];
    const H = [[0.02, 0], [0.0, 0.14], [0.06, 0.3], [0.2, 0.3], [0.26, 0.16], [0.16, 0.02]];
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [0.0, 0.06, s * 0.09], 'body');
      m.plate(n, [0, 0, 0], F, 0.005, 0.006, fore, { rot: [s * (PI / 2 - 0.2), 0, 0], k: 0.012 });
      m.plate(n, [0.02, -0.01, 0], H, 0.005, 0.006, hind, { rot: [s * (PI / 2 - 0.05), 0, 0], k: 0.012 });
      m.sph(n, wp(0.0, 0.32, s, 0.2), 0.065, ring, { op: 'paint' });
      m.sph(n, wp(0.0, 0.32, s, 0.2), 0.045, spot, { op: 'paint' });
    }
    m.emitter({ pos: [0.1, 0, 0], rate: 6, vel: [0, -0.3, 0], spread: 0.4, posSpread: [0.4, 0.1, 0.5], life: [0.8, 1.6], size: 1, color: [md.accent, '#fff0c0'], glow: 1.8 });
    m.points({ hit: [-0.05, 0, 0], mouth: [-0.25, 0.02, 0], cuts: [[-0.15, 0.05, 0], [0.2, 0, 0], [0, 0.15, 0.35], [0, 0.15, -0.35]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const sp = 8 + e.multi * 10 + e.strike * 6;
    const flap = sin(t * sp);
    const a = flap * 0.6 + 0.25 + e.wind * 0.6 + e.special * 0.4;
    m.P('wingL').rotation.x += -a; m.P('wingR').rotation.x += a;
    m.P('wingL').rotation.y += flap * 0.12; m.P('wingR').rotation.y -= flap * 0.12;
    m.root.position.y += -flap * 0.04 + sin(t * 1.1) * 0.12;
    m.root.position.z += sin(t * 0.7) * 0.1;
  },
};

// ============================================================================ TOAD (bloat toad)
const toad = {
  reach: 0.4,
  build(m, md) {
    const skin = m.mat('wart', md.body, { acc: md.accent });
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
    m.tube('tongue', [[0.06, 0, 0], [-0.1, 0.01, 0], [-0.24, 0.01, 0]], [0.035, 0.04, 0.055], m.mat('flesh', md.accent), { k: 0.01 });
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
    m.tube('torso', [[0.03, 0.04, 0], [0.06, 0.2, 0], [0.05, 0.42, 0], [0.02, 0.58, 0]], 0.026, bone, { k: 0.02 });
    for (let k = 0; k < 4; k++) {
      const y = 0.3 + k * 0.07, w = 0.13 - Math.abs(k - 1.5) * 0.015;
      for (const s of SIDES) m.tube('torso', [[0.05, y, 0], [0.0, y - 0.02, s * w], [-0.1, y - 0.05, s * w * 0.75], [-0.14, y - 0.06, s * 0.02]], 0.019, bone, { k: 0.01 });
    }
    m.cap('torso', [-0.14, 0.27, 0], [-0.13, 0.5, 0], 0.022, 0.022, bone, { k: 0.01 });
    m.ell('torso', [0.01, 0.0, 0], [0.11, 0.08, 0.14], rag, { k: 0.02, noise: 0.012, nf: 18 });
    m.sph('torso', [-0.03, 0.38, 0], 0.045, eyeG, { k: 0.006 });
    m.bone('head', [0, 0.6, 0], 'torso');
    m.ell('head', [0, 0.13, 0], [0.12, 0.12, 0.11], bone);
    m.ell('head', [-0.06, 0.06, 0], [0.08, 0.06, 0.08], bone, { k: 0.04 });
    for (const s of SIDES) { m.sph('head', [-0.1, 0.12, s * 0.045], 0.034, voidM, { op: 'sub', k: 0.01 }); m.sph('head', [-0.088, 0.12, s * 0.045], 0.016, eyeG, { k: 0.003 }); }
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
      m.sph(n, [0, 0, 0], 0.035, bone, { k: 0.02 });
      m.cap(n, [0, 0, 0], [0.01, -0.22, 0], 0.024, 0.022, bone, { k: 0.01 });
      m.sph(n, [0.01, -0.22, 0], 0.03, bone, { k: 0.01 });
      m.cap(n, [0.01, -0.22, 0], [-0.02, -0.44, 0], 0.022, 0.02, bone, { k: 0.01 });
      m.ell(n, [-0.025, -0.47, 0], [0.035, 0.032, 0.025], bone, { k: 0.01 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.04, -0.49, f * 0.014], [-0.06, -0.53, f * 0.016], 0.011, 0.008, bone, { k: 0.004 });
    }
    m.bone('pick', [-0.025, -0.47, 0], 'armF', { rot: [0, 0, 0.6] });
    m.cap('pick', [0, -0.12, 0], [0, 0.6, 0], 0.018, 0.018, m.mat('wood', '#7a5030', { ts: 1.5 }), { k: 0.01 });
    m.tube('pick', [[-0.24, 0.52, 0], [-0.1, 0.6, 0], [0.04, 0.61, 0], [0.18, 0.54, 0]], (t) => 0.026 * (1 - Math.abs(t - 0.45)) + 0.011, m.mat('metal', '#8a92a0', { acc: '#c8d0d8' }), { k: 0.01 });
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0, 0.03, s * 0.08], 'torso');
      m.cap(n, [0, 0, 0], [0.01, -0.26, 0], 0.027, 0.024, bone, { k: 0.02 });
      m.sph(n, [0.01, -0.26, 0], 0.033, bone, { k: 0.01 });
      m.cap(n, [0.01, -0.26, 0], [0, -0.52, 0], 0.024, 0.022, bone, { k: 0.01 });
      m.ell(n, [-0.04, -0.565, 0], [0.07, 0.022, 0.036], bone, { k: 0.015 });
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
    const cloth = m.mat('cloth', md.belly, { acc: cursed ? md.accent : '#c8a040', glow: cursed ? md.accent : null, gk: 1.8 });
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

// ============================================================================ OWL (ruin owl)
const owl = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 0.6;
    const fea = m.mat('feather', md.body, { acc: shade(md.body, -0.25), ts: 1.4 });
    const disk = m.mat('feather', md.belly, { acc: shade(md.belly, -0.2), ts: 2 });
    const chest = m.mat('feather', md.belly, { acc: md.body, ts: 1.4 });
    const beak = m.mat('smooth', md.accent);
    const talon = m.mat('smooth', '#2a2018');
    m.bone('body', [0, 0, 0]);
    m.ell('body', [0.02, 0.38, 0], [0.26, 0.36, 0.25], fea, { rot: [0, 0, 0.12] });
    m.ell('body', [-0.2, 0.33, 0], [0.13, 0.26, 0.19], chest, { op: 'paint' });
    m.ell('body', [-0.04, 0.72, 0], [0.2, 0.17, 0.22], fea, { k: 0.1 });
    m.ell('body', [-0.27, 0.7, 0], [0.1, 0.15, 0.17], disk, { op: 'sub', k: 0.04 });
    for (const s of SIDES) {
      m.cap('body', [-0.04, 0.84, s * 0.12], [0.02, 0.98, s * 0.16], 0.04, 0.012, fea, { k: 0.03 });
      beady(m, 'body', [-0.21, 0.74, s * 0.075], 0.03, md.eye, 1.3);
      m.ell('body', [-0.04, 0.04, s * 0.08], [0.06, 0.04, 0.045], fea, { k: 0.04 });
      for (let f = -1; f <= 1; f++) m.tube('body', [[-0.08, 0.03, s * 0.08 + f * 0.025], [-0.13, 0.01, s * 0.08 + f * 0.035], [-0.14, -0.03, s * 0.08 + f * 0.04]], [0.013, 0.01, 0.006], talon, { k: 0.005 });
    }
    m.tube('body', [[-0.23, 0.69, 0], [-0.28, 0.65, 0], [-0.27, 0.6, 0]], [0.026, 0.016, 0.006], beak, { k: 0.01 });
    m.plate('body', [0.22, 0.12, 0], [[0, -0.08], [0.18, -0.12], [0.22, 0], [0.18, 0.12], [0, 0.08]], 0.012, 0.01, fea, { rot: [PI / 2, 0, 0.35], k: 0.02 });
    const W = [[-0.08, 0], [0.1, 0.02], [0.2, -0.12], [0.26, -0.36], [0.22, -0.5], [0.14, -0.42], [0.06, -0.5], [0.0, -0.3]];
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [0.06, 0.62, s * 0.24], 'body');
      m.plate(n, [0, 0, 0], W, 0.02, 0.014, fea, { k: 0.02 });
      m.ell(n, [0.17, -0.44, 0], [0.09, 0.09, 0.04], m.mat('feather', shade(md.body, -0.3), { acc: md.belly, ts: 1.4 }), { op: 'paint' });
    }
    m.points({ hit: [-0.2, 0.55, 0], mouth: [-0.3, 0.62, 0], cuts: [[-0.25, 0.45, 0], [0, 0.75, 0], [0.1, 0.4, 0.3], [0.1, 0.35, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const sp = 7 + e.strike * 10 + e.multi * 8;
    const flap = (sin(t * sp) * 0.5 + 0.5) * (0.6 + e.strike) + e.wind * 1.2;
    m.P('wingL').rotation.x += -flap; m.P('wingR').rotation.x += flap;
    m.root.position.y += sin(t * sp) * 0.04;
    m.P('body').rotation.y += sin(t * 0.4) * 0.3 * (1 - e.wind);
    m.P('body').rotation.z += e.strike * 0.4;
  },
};

// ============================================================================ SALAMANDER (lava salamander)
const salamander = {
  reach: 0.35,
  build(m, md) {
    const scl = m.mat('scale', md.body, { acc: md.belly, glow: '#ff8a2a', gk: 1.4, ts: 1.4 });
    const belly = m.mat('plate', md.belly, { acc: md.body, ts: 1.6 });
    const spine = glowMat(m, '#ffb04a', 2.2);
    const mouthM = glowMat(m, '#ff6a3a', 2, 'lava');
    const claw = m.mat('smooth', md.accent);
    m.bone('body', [0, 0.18, 0]);
    m.ell('body', [0.25, 0.02, 0], [0.3, 0.12, 0.15], scl);
    m.ell('body', [-0.12, 0.03, 0], [0.3, 0.12, 0.15], scl, { k: 0.1 });
    m.ell('body', [-0.38, 0.03, 0], [0.14, 0.1, 0.13], scl, { k: 0.08 });
    m.ell('body', [0, -0.1, 0], [0.6, 0.08, 0.14], belly, { op: 'paint' });
    for (let i = 0; i < 7; i++) m.cry('body', [-0.35 + i * 0.12, 0.11, 0], 0.08 + (i % 2) * 0.05, 0.025, spine, { dir: [0.35, 1, 0] });
    m.bone('head', [-0.5, 0.06, 0], 'body');
    m.ell('head', [-0.08, 0.02, 0], [0.15, 0.07, 0.12], scl, { k: 0.05 });
    m.cap('head', [-0.12, 0.0, 0], [-0.25, -0.01, 0], 0.07, 0.045, scl, { k: 0.04 });
    m.ell('head', [-0.17, -0.025, 0], [0.11, 0.012, 0.08], mouthM, { op: 'sub', k: 0.008 });
    for (const s of SIDES) beady(m, 'head', [-0.11, 0.07, s * 0.065], 0.02, md.eye, 1.4);
    m.bone('jaw', [0.02, -0.02, 0], 'head');
    m.ell('jaw', [-0.11, -0.025, 0], [0.15, 0.03, 0.1], scl, { k: 0.02 });
    m.ell('jaw', [-0.12, -0.03, 0], [0.17, 0.04, 0.12], null, { op: 'bind' });
    m.bone('tail0', [0.48, 0, 0], 'body');
    m.cap('tail0', [0, 0, 0], [0.3, 0, 0], 0.1, 0.085, scl, { k: 0.04 });
    m.bone('tail1', [0.3, 0, 0], 'tail0', { scale: 0.7 });
    m.cap('tail1', [0, 0, 0], [0.3, 0, 0], 0.12, 0.1, scl, { k: 0.03 });
    m.bone('tail2', [0.3, 0, 0], 'tail1');
    m.cap('tail2', [0, 0, 0], [0.26, 0, 0], 0.1, 0.03, scl, { k: 0.03 });
    m.cry('tail2', [0.2, 0, 0], 0.18, 0.04, spine, { dir: [1, 0.15, 0] });
    for (const [n, x, s] of [['lf', -0.3, -1], ['lb', 0.3, -1], ['rf', -0.3, 1], ['rb', 0.3, 1]]) {
      m.bone(n, [x, 0.0, s * 0.12], 'body', { rot: [-s * 0.5, 0, 0] });
      m.cap(n, [0, 0, 0], [-0.02, -0.1, 0], 0.045, 0.035, scl, { k: 0.04 });
      m.cap(n, [-0.02, -0.1, 0], [-0.04, -0.18, 0], 0.035, 0.03, scl, { k: 0.02 });
      m.ell(n, [-0.08, -0.19, 0], [0.07, 0.02, 0.05], scl, { k: 0.02 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.12, -0.195, f * 0.025], [-0.15, -0.2, f * 0.035], 0.01, 0.006, claw, { k: 0.004 });
    }
    m.emitter({ pos: [0, 0.4, 0], rate: 8, vel: [0, 0.6, 0], spread: 0.2, posSpread: [0.45, 0, 0.05], life: [0.3, 0.8], size: 1, color: ['#ffd04a', '#ff6a1a'], glow: 3 });
    m.points({ hit: [-0.2, 0.25, 0], mouth: [-0.85, 0.22, 0], cuts: [[-0.6, 0.3, 0], [-0.2, 0.32, 0], [0.25, 0.3, 0], [0.7, 0.22, 0], [0, 0.15, 0.2]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('body').rotation.y += sin(t * 3) * 0.06;
    m.P('head').rotation.y += -sin(t * 3) * 0.1;
    m.P('head').rotation.z += -e.wind * 0.3 + e.strike * 0.2;
    m.P('jaw').rotation.z += -(e.strike + e.multi * Math.abs(sin(t * 14)) + e.roar) * 0.6 - e.wind * 0.2;
    m.P('tail0').rotation.y += sin(t * 3 + 1) * 0.35; m.P('tail1').rotation.y += sin(t * 3 + 2) * 0.45; m.P('tail2').rotation.y += sin(t * 3 + 3) * 0.5;
    walk(m, ['lf', 'rb', 'rf', 'lb'], 9, 0.2 * (0.4 + e.strike));
  },
};

// ============================================================================ WYRM (lava wyrmling)
const wyrm = {
  reach: 0.5,
  build(m, md) {
    const crust = m.mat('crust', md.body, { glow: '#ff6a1a', gk: 2.4 });
    const belly = m.mat('plate', md.belly, { acc: shade(md.belly, -0.3), glow: '#ff8a2a', gk: 1.6, ts: 1.4 });
    const horn = m.mat('bone', '#4a2a20', { acc: '#2a1410' });
    const mouthM = glowMat(m, '#ff6a1a', 2.4, 'lava');
    const radii = [0.27, 0.25, 0.23, 0.2, 0.17, 0.13];
    const offs = [[0, 1.02, 0], [0.21, -0.3, 0], [0.24, -0.3, 0], [0.3, -0.18, 0], [0.27, -0.03, 0], [0.24, 0.03, 0]];
    let parent = 'root';
    radii.forEach((r, i) => {
      const n = 's' + i;
      m.bone(n, offs[i], parent);
      m.ell(n, [0, 0, 0], [r, r * 0.95, r * 0.85], crust, { k: 0.06 });
      if (i < 5) m.cap(n, [0, 0, 0], offs[i + 1], r * 0.86, radii[i + 1] * 0.86, crust, { k: 0.05 });
      else m.cap(n, [0, 0, 0], [0.28, 0.05, 0], r * 0.86, 0.025, crust, { k: 0.04 });
      m.ell(n, [-0.02, -r * 0.6, 0], [r * 0.9, r * 0.5, r * 0.7], belly, { op: 'paint' });
      if (i < 5) m.cap(n, [0.02, r * 0.75, 0], [0.12, r * 1.5, 0], r * 0.22, 0.012, horn, { k: 0.02 });
      parent = n;
    });
    m.bone('head', [-0.18, 0.18, 0], 's0');
    m.ell('head', [-0.06, 0.04, 0], [0.2, 0.15, 0.15], crust, { k: 0.06 });
    m.cap('head', [-0.15, 0.02, 0], [-0.37, -0.02, 0], 0.12, 0.07, crust, { k: 0.05 });
    for (const s of SIDES) {
      m.cap('head', [-0.02, 0.13, s * 0.1], [-0.2, 0.11, s * 0.09], 0.04, 0.025, crust, { k: 0.03 });
      m.tube('head', hornPath([0.05, 0.12, s * 0.1], [1, 0.5, s * 0.5], [0, 1, 0], 0.3, 1.1, 5), (t) => 0.05 * (1 - t) + 0.012, horn, { k: 0.02 });
      beady(m, 'head', [-0.18, 0.085, s * 0.095], 0.024, md.eye, 1.8);
      m.sph('head', [-0.37, 0.02, s * 0.03], 0.012, mouthM, { k: 0.004 });
    }
    m.ell('head', [-0.24, -0.06, 0], [0.16, 0.018, 0.09], mouthM, { op: 'sub', k: 0.01 });
    m.bone('jaw', [0.05, -0.06, 0], 'head');
    m.ell('jaw', [-0.2, -0.04, 0], [0.2, 0.04, 0.1], crust, { k: 0.02 });
    m.ell('jaw', [-0.2, -0.05, 0], [0.24, 0.06, 0.13], null, { op: 'bind' });
    const fin = [[0, 0], [0.32, 0.04], [0.26, 0.14], [0.3, 0.24], [0.08, 0.2]];
    const finM = m.mat('membrane', md.body, { acc: md.belly, glow: '#ff6a1a', gk: 2.4 });
    m.bone('finL', [0, 0.18, 0.18], 's1', { rot: [-0.6, 0, 0.2] });
    m.plate('finL', [0, 0, 0], fin, 0.006, 0.007, finM, { k: 0.02 });
    m.bone('finR', [0, 0.18, -0.18], 's1', { rot: [0.6, 0, 0.2] });
    m.plate('finR', [0, 0, 0], fin, 0.006, 0.007, finM, { k: 0.02 });
    if (md.glow) m.emitter({ pos: [0.2, 0.4, 0], rate: 10, vel: [0, 0.8, 0], spread: 0.3, posSpread: [0.5, 0.3, 0.2], life: [0.4, 1], size: 1, color: ['#ffd04a', '#ff6a1a'], glow: 3 });
    m.points({ hit: [-0.2, 0.95, 0], mouth: [-0.72, 1.12, 0], cuts: [[-0.3, 0.9, 0], [0.2, 0.6, 0], [0.6, 0.35, 0], [1.0, 0.3, 0], [0, 0.95, 0.2]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    for (let i = 0; i < 6; i++) {
      const p = m.P('s' + i);
      p.rotation.z += sin(t * 2.4 - i * 0.8) * 0.12 + (i === 0 ? -e.wind * 0.4 + e.strike * 0.5 : 0);
      p.rotation.y += sin(t * 1.7 - i * 0.6) * 0.08;
    }
    m.P('head').rotation.z += -e.wind * 0.4 + e.strike * 0.4;
    m.P('jaw').rotation.z += -(e.strike * 0.7 + e.multi * Math.abs(sin(t * 12)) * 0.7 + e.roar * 0.9 + e.wind * 0.2);
    m.P('finL').rotation.x += -sin(t * 5) * 0.3; m.P('finR').rotation.x += sin(t * 5) * 0.3;
  },
};

// ============================================================================ WRAITH
const wraith = {
  reach: 0.45, die: 'fade',
  build(m, md) {
    m.fly = 0.35;
    const robe = m.mat('cloth', md.body, { acc: md.accent, glow: md.accent, gk: 1.8 });
    const voidM = m.mat('smooth', '#05030a');
    const bone = m.mat('bone', md.belly);
    const chain = m.mat('metal', '#6a6a7a', { acc: '#9a9aaa' });
    const eyeG = glowMat(m, md.eye, 3.4);
    m.bone('cloak', [0, 0, 0]);
    m.cap('cloak', [0, 0.12, 0], [0, 0.9, 0], 0.33, 0.17, robe, { noise: 0.018, nf: 6 });
    m.ell('cloak', [0.02, 1.04, 0], [0.21, 0.22, 0.21], robe, { k: 0.08 });
    m.cap('cloak', [0.12, 1.12, 0], [0.24, 1.0, 0], 0.08, 0.02, robe, { k: 0.06 });
    m.ell('cloak', [-0.17, 1.02, 0], [0.13, 0.15, 0.14], voidM, { op: 'sub', k: 0.04 });
    for (const s of SIDES) m.sph('cloak', [-0.12, 1.05, s * 0.05], 0.022, eyeG, { k: 0.004 });
    m.ell('cloak', [0, -0.16, 0], [0.3, 0.3, 0.3], voidM, { op: 'sub', k: 0.03 });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * PI * 2, L = 0.14 + (i % 3) * 0.07;
      m.cap('cloak', [cos(a) * 0.3, 0.12, sin(a) * 0.3], [cos(a + 0.1) * 0.34, 0.12 - L, sin(a + 0.1) * 0.34], 0.06, 0.012, robe, { k: 0.03 });
    }
    for (let k = 0; k < 8; k++) m.tor('cloak', [-0.24 + k * 0.035, 0.85 - k * 0.07, -0.2 + k * 0.05], 0.035, 0.012, chain, { rot: [(PI / 2) * (k % 2), 0.4, 0.6], k: 0.004 });
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.12, 0.72, s * 0.3], 'cloak');
      m.cap(n, [0.24, 0, 0], [0.02, -0.01, 0], 0.05, 0.075, robe, { k: 0.04 });
      for (let f = 0; f < 3; f++) m.tube(n, [[0.0, 0, (f - 1) * 0.03], [-0.08, -0.02, (f - 1) * 0.04], [-0.15, -0.07, (f - 1) * 0.05]], [0.014, 0.012, 0.008], bone, { k: 0.006 });
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

// ============================================================================ HOUND (bone hound)
const hound = {
  reach: 0.45,
  build(m, md) {
    m.res = 84;
    const bone = m.mat('bone', md.body, { acc: shade(md.body, -0.2) });
    const core = glowMat(m, md.accent, 2.8);
    const eyeG = glowMat(m, md.eye, 3.2);
    const voidM = m.mat('smooth', '#0a0610');
    const sinew = m.mat('flesh', md.belly, { acc: shade(md.belly, -0.3) });
    m.bone('body', [0, 0.52, 0]);
    m.tube('body', [[-0.42, 0.1, 0], [-0.2, 0.15, 0], [0.1, 0.13, 0], [0.42, 0.1, 0]], 0.035, bone, { k: 0.02 });
    for (let k = 0; k < 7; k++) m.cap('body', [-0.36 + k * 0.12, 0.15, 0], [-0.32 + k * 0.12, 0.24 - (k % 2) * 0.03, 0], 0.018, 0.008, bone, { k: 0.01 });
    for (let k = 0; k < 5; k++) {
      const x = -0.3 + k * 0.1;
      for (const s of SIDES) m.tube('body', [[x, 0.13, 0], [x - 0.02, 0.0, s * 0.16], [x - 0.04, -0.14, s * 0.09], [x - 0.04, -0.17, 0]], 0.019, bone, { k: 0.01 });
    }
    m.sph('body', [-0.15, 0.0, 0], 0.075, core, { k: 0.01 });
    m.ell('body', [0.38, 0.06, 0], [0.1, 0.07, 0.13], bone, { k: 0.02 });
    for (const s of SIDES) m.cap('body', [-0.28, 0.12, s * 0.06], [0.2, 0.11, s * 0.05], 0.014, 0.012, sinew, { k: 0.01 });
    m.bone('head', [-0.5, 0.2, 0], 'body');
    m.ell('head', [0.0, 0.04, 0], [0.12, 0.1, 0.1], bone, { k: 0.03 });
    m.cap('head', [-0.06, 0.02, 0], [-0.26, -0.02, 0], 0.07, 0.04, bone, { k: 0.04 });
    for (const s of SIDES) {
      m.sph('head', [-0.08, 0.06, s * 0.055], 0.032, voidM, { op: 'sub', k: 0.01 });
      m.sph('head', [-0.07, 0.06, s * 0.055], 0.016, eyeG, { k: 0.003 });
      m.tube('head', hornPath([0.06, 0.08, s * 0.06], [1, 0.6, s * 0.3], [0, 1, 0], 0.16, 1.2, 4), (t) => 0.025 * (1 - t) + 0.01, bone, { k: 0.015 });
      m.cap('head', [-0.2, -0.03, s * 0.03], [-0.205, -0.075, s * 0.028], 0.012, 0.006, bone, { k: 0.004 });
    }
    m.ell('head', [-0.24, 0.015, 0], [0.02, 0.02, 0.018], voidM, { op: 'sub', k: 0.005 });
    m.bone('jaw', [0.02, -0.04, 0], 'head');
    m.cap('jaw', [0, -0.02, 0], [-0.22, -0.05, 0], 0.035, 0.024, bone, { k: 0.02 });
    for (const s of SIDES) m.cap('jaw', [-0.18, -0.04, s * 0.022], [-0.185, 0.0, s * 0.022], 0.01, 0.005, bone, { k: 0.004 });
    m.cap('jaw', [0, -0.03, 0], [-0.24, -0.06, 0], 0.05, 0.035, null, { op: 'bind' });
    for (const [n, x, s] of [['lf', -0.3, -1], ['lb', 0.32, -1], ['rf', -0.3, 1], ['rb', 0.32, 1]]) {
      m.bone(n, [x, 0.05, s * 0.12], 'body');
      m.tube(n, [[0, 0, 0], [0.03, -0.19, 0], [-0.02, -0.38, 0], [-0.06, -0.5, 0]], 0.022, bone, { k: 0.02 });
      m.sph(n, [0.03, -0.19, 0], 0.03, bone, { k: 0.01 });
      m.ell(n, [-0.08, -0.548, 0], [0.05, 0.02, 0.035], bone, { k: 0.015 });
      for (let f = -1; f <= 1; f++) m.cap(n, [-0.11, -0.55, f * 0.017], [-0.14, -0.56, f * 0.02], 0.009, 0.006, bone, { k: 0.004 });
    }
    m.bone('tail', [0.46, 0.08, 0], 'body');
    m.tube('tail', [[0, 0, 0], [0.12, 0.08, 0], [0.24, 0.2, 0], [0.3, 0.32, 0]], (t) => 0.026 * (1 - t) + 0.01, bone, { k: 0.02 });
    m.emitter({ pos: [0, 0.7, 0], rate: 7, vel: [0, 0.5, 0], spread: 0.15, posSpread: [0.4, 0.1, 0.1], life: [0.4, 0.9], size: 1, color: [md.accent, md.eye], glow: 2.5 });
    m.points({ hit: [-0.15, 0.55, 0], mouth: [-0.78, 0.7, 0], cuts: [[-0.6, 0.75, 0], [-0.15, 0.62, 0], [0.3, 0.62, 0], [0.5, 0.5, 0], [-0.3, 0.35, 0.2]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    walk(m, ['lf', 'rb', 'rf', 'lb'], 10, 0.18 * (0.5 + e.strike * 2 + e.multi * 2));
    m.P('head').rotation.z += sin(t * 2) * 0.06 - e.wind * 0.35 + e.strike * 0.3;
    m.P('jaw').rotation.z += -(e.strike * 0.7 + e.multi * Math.abs(sin(t * 15)) * 0.7 + e.roar * 0.8 + e.wind * 0.3);
    m.P('tail').rotation.z += sin(t * 8) * 0.25;
    m.P('body').position.y += -e.wind * 0.06;
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

export const NORMAL_ARCHES = { rat, bat, slime, kobold, beetle, mole, golem, crab, wisp, spider, mushroom, snail, moth, toad, skeleton, knight, sentinel, owl, salamander, wyrm, wraith, hound, mimic };
