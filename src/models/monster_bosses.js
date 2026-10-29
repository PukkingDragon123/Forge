// Boss archetypes: big (3–5 m) single-mesh SDF sculpts on skeletons, with custom intros and phase visuals.
// Same conventions as monster_normals.js: metres, front toward −X, "F" limbs at −Z (mirrored to the camera side).
import { hornPath } from './monster_kit.js';
import { clamp, ease, shadeHex as shade } from '../core/math.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const SIDES = [-1, 1];
const glowMat = (m, col, gk = 2.4, tile = 'crystal') => m.mat(tile, col, { glow: col, gk, full: true });
function beady(m, bone, c, r, glowCol, gk = 1.4) {
  const eye = m.mat('eye', '#120a0e', glowCol ? { glow: glowCol, gk, full: true } : {});
  m.sph(bone, c, r * 1.35, null, { op: 'sub', k: r * 0.5 });
  m.sph(bone, c, r, eye, { k: r * 0.25 });
}
/** Spoked wheel on an axle along z: flat disc, iron tyre, hub. */
function wheel(m, bone, c, r, w, mat, hubMat, o = {}) {
  m.ell(bone, c, [r * 0.92, r * 0.92, w * 0.35], mat, { k: o.k ?? 0.01 });
  m.tor(bone, c, r * 0.86, w * 0.4, mat, { rot: [PI / 2, 0, 0], k: 0.005 });
  m.sph(bone, [c[0], c[1], c[2] + Math.sign(c[2] || 1) * w * 0.3], r * 0.3, hubMat, { k: 0.01 });
}

// ============================================================================ OLD RUSTJAW — minecart colossus
const rustjaw = {
  reach: 0.7, die: 'kneel',
  build(m, md) {
    m.res = 104;
    const rust = m.mat('rust', md.body, { acc: '#c8743a' });
    const iron = m.mat('metal', md.belly, { acc: '#8a8a94' });
    const brass = m.mat('metal', '#a8783a', { acc: '#e8b860' });
    const wood = m.mat('wood', '#5a3a22', { ts: 1.2 });
    const rock = m.mat('stone', '#6b6058', { acc: '#8a7e70' });
    const tooth = m.mat('bone', '#d8d0c0', { acc: '#a89880' });
    const fire = glowMat(m, md.eye, 2.4, 'lava');
    const lamp = m.mat('eye', '#fff0b0', { glow: '#fff0b0', gk: 3, full: true });
    const gold = glowMat(m, '#ffd25e', 1.8);
    // ---- torso: a giant ore cart (tapered bin) with a furnace belly
    m.bone('torso', [0, 1.55, 0]);
    m.plate('torso', [0, 0, 0], [[-0.78, 0], [0.78, 0], [0.96, 1.3], [-0.96, 1.3]], 0.62, 0.05, rust, { noise: 0.008, nf: 6 });
    m.box('torso', [0, 1.3, 0], [0.86, 0.14, 0.56], 0.04, rock, { op: 'sub', k: 0.02 });
    for (const [x, z, r] of [[-0.45, 0.2, 0.3], [0.1, -0.2, 0.34], [0.5, 0.2, 0.28], [-0.2, -0.3, 0.25], [0.35, -0.38, 0.22], [-0.6, -0.12, 0.2]]) m.ell('torso', [x, 1.2, z], [r, r * 0.7, r], rock, { k: 0.04, noise: 0.04, nf: 7 });
    for (const [c, d, l] of [[[-0.1, 1.35, 0.05], [0.1, 1, 0.1], 0.38], [[0.32, 1.32, 0.25], [0.4, 1, 0.3], 0.28], [[-0.45, 1.3, -0.3], [-0.4, 1, -0.3], 0.26], [[0.2, 1.36, -0.25], [0.2, 1, -0.5], 0.22]]) m.cry('torso', c, l, 0.08, gold, { dir: d });
    for (const s of SIDES) m.box('torso', [0, 1.31, s * 0.63], [0.98, 0.04, 0.035], 0.02, iron, { k: 0.01 });
    for (const x of [-0.95, 0.95]) m.box('torso', [x, 1.31, 0], [0.04, 0.04, 0.66], 0.02, iron, { k: 0.01, rot: [0, 0, x < 0 ? 0.14 : -0.14] });
    for (const y of [0.16, 0.62, 1.02]) m.box('torso', [0, y, 0], [1.2, 0.05, 0.7], 0.01, iron, { op: 'paint' });
    m.box('torso', [-0.86, 0.64, 0], [0.16, 0.3, 0.42], 0.05, null, { op: 'sub', k: 0.03 });
    m.box('torso', [-0.76, 0.64, 0], [0.05, 0.3, 0.4], 0.03, fire, { k: 0.01 });
    for (let i = 0; i < 6; i++) m.cap('torso', [-0.83, 0.36, -0.33 + i * 0.132], [-0.89, 0.92, -0.33 + i * 0.132], 0.032, 0.032, iron, { k: 0.01 });
    for (const x of [-0.5, 0.5]) for (const s of SIDES) wheel(m, 'torso', [x, 0.12, s * 0.72], 0.26, 0.12, iron, brass);
    // ---- head: an upturned small cart, headlamp eyes, iron teeth; jaw tray hinged at the back
    m.bone('head', [-0.2, 1.62, 0], 'torso');
    m.plate('head', [-0.42, 0, 0], [[-0.52, 0], [0.52, 0], [0.44, 0.58], [-0.44, 0.58]], 0.36, 0.04, rust, { k: 0.02 });
    m.box('head', [-0.92, 0.44, 0], [0.08, 0.06, 0.42], 0.03, iron, { k: 0.02, rot: [0, 0, 0.25] });
    for (const s of SIDES) {
      m.tor('head', [-0.93, 0.27, s * 0.2], 0.13, 0.04, iron, { rot: [0, 0, PI / 2], k: 0.01 });
      m.sph('head', [-0.92, 0.27, s * 0.2], 0.12, lamp, { k: 0.01 });
    }
    for (let i = 0; i < 7; i++) m.cap('head', [-0.88, 0.04, -0.3 + i * 0.1], [-0.9, -0.1, -0.3 + i * 0.1], 0.045, 0.012, tooth, { k: 0.01 });
    m.box('head', [-0.42, -0.02, 0], [0.4, 0.06, 0.28], 0.03, fire, { op: 'sub', k: 0.02 });
    m.bone('jaw', [0.38, 0.02, 0], 'head');
    m.plate('jaw', [0, 0, 0], [[-1.28, 0], [0.0, 0], [-0.06, -0.26], [-1.2, -0.24]], 0.33, 0.03, rust, { k: 0.02 });
    m.box('jaw', [-0.66, 0.0, 0], [0.5, 0.06, 0.24], 0.03, null, { op: 'sub', k: 0.02 });
    m.box('jaw', [-0.66, -0.06, 0], [0.48, 0.03, 0.22], 0.02, fire, { k: 0.01 });
    for (let i = 0; i < 6; i++) m.cap('jaw', [-1.22, -0.04, -0.26 + i * 0.105], [-1.22, 0.08, -0.26 + i * 0.105], 0.04, 0.012, tooth, { k: 0.01 });
    m.box('jaw', [-0.64, -0.12, 0], [0.7, 0.18, 0.4], 0.02, null, { op: 'bind' });
    // ---- shoulder gears
    for (const s of SIDES) {
      const n = s < 0 ? 'gearF' : 'gearB';
      m.bone(n, [0.25, 1.0, s * 0.76], 'torso');
      m.ell(n, [0, 0, 0], [0.4, 0.4, 0.06], brass, { k: 0.01 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; m.box(n, [cos(a) * 0.44, sin(a) * 0.44, 0], [0.06, 0.045, 0.055], 0.012, brass, { rot: [0, 0, a], k: 0.006 }); }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2 + 0.3; m.sph(n, [cos(a) * 0.22, sin(a) * 0.22, 0], 0.075, null, { op: 'sub', k: 0.01 }); }
      m.ell(n, [0, 0, 0], [0.13, 0.13, 0.1], iron, { k: 0.02 });
    }
    // ---- arms hang from the shoulder gears: plated pipe upper arm, rail forearm with sleepers, wheel-bound boulder fist
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [0.1, 1.0, s * 0.92], 'torso');
      m.cap(n, [0, 0, 0], [-0.06, -0.62, 0], 0.17, 0.14, iron, { k: 0.04 });
      for (const y of [-0.18, -0.4]) m.tor(n, [-0.03, y, 0], 0.16, 0.035, brass, { k: 0.01 });
      m.ell(n, [-0.07, -0.66, 0], [0.17, 0.15, 0.17], rust, { k: 0.04 });
      for (const z of [-0.09, 0.09]) m.cap(n, [-0.07, -0.66, z], [-0.02, -1.42, z], 0.045, 0.045, iron, { k: 0.02 });
      for (let k = 0; k < 4; k++) m.box(n, [-0.05 + k * 0.012, -0.82 - k * 0.17, 0], [0.065, 0.03, 0.17], 0.015, wood, { k: 0.01 });
      m.ell(n, [-0.03, -1.62, 0], [0.3, 0.3, 0.27], rock, { k: 0.05, noise: 0.045, nf: 6 });
      m.tor(n, [-0.03, -1.62, 0], 0.3, 0.06, iron, { rot: [PI / 2, 0, 0], k: 0.02 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; m.cap(n, [-0.03, -1.62, 0], [-0.03 + cos(a) * 0.28, -1.62 + sin(a) * 0.28, 0], 0.035, 0.035, iron, { k: 0.01 }); }
      m.sph(n, [-0.03, -1.62, s * -0.03], 0.09, brass, { k: 0.01 });
    }
    // ---- legs: riveted girder thighs on little cart boots
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0, 0.16, s * 0.46], 'torso');
      m.box(n, [0, -0.55, 0], [0.12, 0.55, 0.07], 0.02, iron, { k: 0.03 });
      for (const x of [-0.1, 0.1]) m.box(n, [x, -0.55, 0], [0.03, 0.55, 0.13], 0.015, iron, { k: 0.01 });
      m.sph(n, [0, -1.12, 0], 0.17, iron, { k: 0.03 });
      m.plate(n, [-0.04, -1.7, 0], [[-0.3, 0], [0.3, 0], [0.4, 0.44], [-0.4, 0.44]], 0.24, 0.03, rust, { k: 0.03 });
      for (const x of [-0.18, 0.14]) wheel(m, n, [x, -1.6, -s * 0.0 + (s < 0 ? -0.27 : 0.27)], 0.1, 0.06, brass, iron);
    }
    // ---- smokestack
    m.bone('stack', [0.62, 1.2, 0], 'torso');
    m.box('stack', [0, 0.36, 0], [0.13, 0.4, 0.13], 0.1, iron, { k: 0.03 });
    m.tor('stack', [0, 0.3, 0], 0.14, 0.03, brass, { k: 0.01 });
    m.tor('stack', [0, 0.8, 0], 0.17, 0.05, iron, { k: 0.02 });
    m.box('stack', [0, 0.82, 0], [0.11, 0.08, 0.11], 0.04, glowMat(m, md.accent, 3, 'lava'), { op: 'sub', k: 0.01 });
    m.emitter({ pos: [0.62, 3.7, 0], rate: 14, vel: [0.25, 1.2, 0], spread: 0.35, life: [0.6, 1.4], size: [1, 2], color: ['#ffb84a', '#ff6a1a', '#ffe08a'], glow: 3, drag: 0.6 });
    m.emitter({ pos: [-0.85, 2.2, 0], rate: 6, vel: [-0.3, 0.2, 0], spread: 0.25, posSpread: [0, 0.2, 0.3], life: [0.3, 0.8], size: 1, color: ['#ff6a1a', '#ffd25e'], glow: 3, gravity: 1.5 });
    m.points({ hit: [-0.9, 2.25, 0], mouth: [-1.05, 3.15, 0], cuts: [[-0.6, 3.4, 0], [-0.9, 2.2, 0], [0, 2.6, -1], [0, 2.6, 1], [0, 1.0, -0.5], [0.5, 2.0, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('gearF').rotation.z += t * 1.5 * (1 + e.wind * 3); m.P('gearB').rotation.z -= t * 1.5 * (1 + e.wind * 3);
    m.P('armF').rotation.z += -e.wind * 2.3 + e.strike * 2.4 + sin(t * 1.2) * 0.06 + e.multi * sin(t * 12) * 1.1;
    m.P('armB').rotation.z += -e.wind * 1.2 + e.strike * 1.0 + sin(t * 1.2 + 2) * 0.06 - e.roar * 1.2;
    m.P('armF').rotation.x += -e.roar * 0.6; m.P('armB').rotation.x += e.roar * 0.6;
    m.P('jaw').rotation.z += -(Math.max(0, sin(t * 2.2)) * 0.12 + e.roar * 0.7 + e.strike * 0.3 + e.special * 0.5);
    m.P('head').rotation.z += sin(t * 0.9) * 0.05 - e.roar * 0.3;
    m.P('torso').rotation.y += sin(t * 0.6) * 0.05;
    m.P('torso').position.y += Math.abs(sin(t * 1.2)) * 0.03;
    m.P('legF').rotation.z += sin(t * 1.2) * 0.04; m.P('legB').rotation.z -= sin(t * 1.2) * 0.04;
  },
  intro(m, k) {
    // a heap of carts shudders and stands up
    const r = m.root;
    const up = ease.outBack(clamp((k - 0.25) / 0.6));
    r.position.y -= (1 - up) * m.height * 0.55;
    r.rotation.z += (1 - up) * 0.5 + sin(k * 40) * 0.02 * (1 - k);
    m.P('armF').rotation.z += (1 - up) * 1.5; m.P('armB').rotation.z += (1 - up) * 1.5;
  },
};

// ============================================================================ MOTHER MYCEL — mushroom titan
const mycel = {
  reach: 0.6, die: 'sink',
  build(m, md) {
    m.res = 100;
    const capCol = md.cap || '#d04a8a';
    const bark = m.mat('bark', md.body, { acc: md.belly, ts: 0.8 });
    const rootS = m.mat('bark', md.belly, { acc: shade(md.belly, -0.2) });
    const hollow = m.mat('flesh', '#1a120c', { acc: '#2a1a10' });
    const capS = m.mat('cap', capCol, { acc: md.accent, glow: md.accent, gk: 2.2, ts: 0.7 });
    const gill = m.mat('gill', md.belly, { ts: 0.8 });
    const stem = m.mat('bark', '#e8d8b8');
    const glowA = glowMat(m, md.accent, 2.2, 'cap'), glowY = glowMat(m, '#ffe08a', 2.2, 'cap');
    // trunk: fibrous swelling stalk with a sleepy, ancient face
    m.bone('trunk', [0, 0.3, 0]);
    m.cap('trunk', [0, -0.1, 0], [0, 1.4, 0], 0.88, 0.64, bark, { noise: 0.025, nf: 4 });
    m.cap('trunk', [0, 1.4, 0], [0, 3.0, 0], 0.64, 0.72, bark, { k: 0.15, noise: 0.02, nf: 4 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + 0.2; m.tube('trunk', [[sin(a) * 0.86, 0.05, cos(a) * 0.86], [sin(a) * 0.7, 0.9, cos(a) * 0.7], [sin(a) * 0.63, 1.9, cos(a) * 0.63], [sin(a) * 0.72, 2.9, cos(a) * 0.72]], 0.07, bark, { k: 0.05 }); }
    for (const s of SIDES) {
      m.ell('trunk', [-0.6, 2.0, s * 0.25], [0.16, 0.2, 0.14], hollow, { op: 'sub', k: 0.04 });
      m.sph('trunk', [-0.54, 2.0, s * 0.25], 0.07, glowMat(m, md.eye, 2.8, 'eye'), { k: 0.01 });
      m.tube('trunk', [[-0.66, 2.24, s * 0.08], [-0.7, 2.27, s * 0.25], [-0.66, 2.22, s * 0.42]], 0.05, bark, { k: 0.04 });
    }
    m.ell('trunk', [-0.62, 1.32, 0], [0.14, 0.26, 0.26], hollow, { op: 'sub', k: 0.05 });
    m.ell('trunk', [-0.52, 1.3, 0], [0.06, 0.15, 0.16], glowA, { k: 0.02 });
    for (const [y, a, s, g] of [[0.8, 2.2, 1, glowA], [1.7, 0.9, 0.8, glowY], [2.4, 2.6, 0.7, glowA], [0.5, 4.0, 0.9, glowY], [1.2, 3.4, 0.6, glowA]]) {
      const r = 0.82 - y * 0.08, px = sin(a) * r, pz = cos(a) * r;
      m.cap('trunk', [px * 0.95, y, pz * 0.95], [px * 1.18, y + 0.14 * s, pz * 1.18], 0.05 * s, 0.04 * s, stem, { k: 0.03 });
      m.ell('trunk', [px * 1.2, y + 0.18 * s, pz * 1.2], [0.16 * s, 0.07 * s, 0.16 * s], g, { k: 0.02 });
    }
    // cap: huge dome, gills carved underneath, glowing spots, little caps on top
    m.bone('cap', [0, 2.92, 0], 'trunk');
    m.ell('cap', [0, 0.32, 0], [1.86, 0.9, 1.86], capS, { noise: 0.02, nf: 3 });
    m.ell('cap', [0, -0.12, 0], [1.66, 0.42, 1.66], gill, { op: 'sub', k: 0.08 });
    m.cap('cap', [0, -0.6, 0], [0, 0.3, 0], 0.66, 0.5, bark, { k: 0.06 });
    for (const [x, z] of [[-0.6, 0.5], [0.8, 0.7], [0.3, -0.75]]) {
      const y = 1.2 - (x * x + z * z) * 0.25;
      m.cap('cap', [x, y - 0.1, z], [x, y + 0.3, z], 0.07, 0.05, stem, { k: 0.04 });
      m.ell('cap', [x, y + 0.34, z], [0.26, 0.12, 0.26], glowY, { k: 0.02 });
    }
    // bloom (phase 2): ring of extra glowing caps sprouting from the dome
    m.bone('bloom', [0, 0.2, 0], 'cap', { solo: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2, r = 0.9 + (i % 3) * 0.3, h = 0.6 + (i % 4) * 0.15;
      const x = cos(a) * r, z = sin(a) * r, y0 = 0.95 - r * r * 0.2;
      m.cap('bloom', [x, y0 - 0.1, z], [x * 1.1, y0 + h, z * 1.1], 0.06, 0.045, stem, { k: 0.02 });
      m.ell('bloom', [x * 1.12, y0 + h + 0.05, z * 1.12], [0.24, 0.1, 0.24], i % 2 ? glowY : glowA, { k: 0.02 });
    }
    m.P('bloom').visible = false;
    // root arms ending in glowing bulbs
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.2, 2.15, s * 0.82], 'trunk', { rot: [s * -0.25, 0, 0] });
      m.tube(n, [[0, 0, 0], [-0.15, -0.6, 0], [-0.22, -1.3, 0], [-0.18, -1.9, 0]], (t) => 0.22 - t * 0.1, rootS, { k: 0.1, noise: 0.015, nf: 8 });
      for (const [dx, dz, g] of [[0, 0, s < 0 ? glowA : m.mat('cap', capCol, { glow: capCol, gk: 2.2, full: true })], [0.16, -0.18, glowY], [-0.18, 0.15, glowA]]) {
        m.tube(n, [[-0.18, -1.85, 0], [-0.18 + dx * 0.6, -2.05, dz * 0.6], [-0.18 + dx, -2.22, dz]], 0.055, rootS, { k: 0.03 });
        m.ell(n, [-0.18 + dx, -2.27, dz], [0.14, 0.11, 0.14], g, { k: 0.02 });
      }
    }
    // root feet sprawling over the ground
    m.bone('roots', [0, 0, 0]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2 + 0.3, L = 1.4 + (i % 3) * 0.25;
      m.tube('roots', [[cos(a) * 0.6, 0.45, sin(a) * 0.6], [cos(a) * 0.95, 0.15, sin(a) * 0.95], [cos(a + 0.1) * L, 0.05, sin(a + 0.1) * L], [cos(a + 0.2) * (L + 0.3), 0.03, sin(a + 0.2) * (L + 0.3)]], (t) => 0.18 * (1 - t) + 0.035, rootS, { k: 0.08 });
    }
    m.emitter({ pos: [0, 3.6, 0], rate: 22, vel: [0, 0.25, 0], spread: 0.35, posSpread: [1.6, 0.3, 1.6], life: [2, 4], size: [1, 2], color: [md.accent, '#ffe08a', '#ffffff'], glow: 1.8, gravity: -0.05, drag: 0.4 });
    m.points({ height: 4.6, hit: [-0.72, 2.3, 0], mouth: [-0.75, 1.6, 0], cuts: [[-0.75, 1.4, 0], [-0.7, 2.4, 0.4], [0, 3.4, -1.2], [0, 3.7, 1.2], [-0.6, 0.6, -0.4], [0, 2.0, 1.0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const br = sin(t * 0.9);
    m.P('cap').scale.set(1 + br * 0.02 + e.roar * 0.06, 1 - br * 0.02 + e.special * 0.08, 1 + br * 0.02 + e.roar * 0.06);
    m.P('cap').rotation.z += sin(t * 0.7) * 0.03 - e.wind * 0.08 + e.strike * 0.1;
    m.P('trunk').rotation.z += sin(t * 0.7) * 0.02 - e.wind * 0.1 + e.strike * 0.14;
    m.P('armF').rotation.z += -e.wind * 1.6 + e.strike * 2.0 + sin(t * 1.3) * 0.08 + e.multi * sin(t * 12) * 0.9;
    m.P('armB').rotation.z += -e.wind * 0.9 + e.strike * 1.2 + sin(t * 1.3 + 1.5) * 0.08 + e.multi * sin(t * 12 + 2) * 0.9;
    m.P('armF').rotation.x += -e.roar * 0.6; m.P('armB').rotation.x += e.roar * 0.6;
  },
  intro(m, k) { m.root.position.y -= (1 - ease.outCubic(k)) * m.height * 0.9; m.root.scale.y *= 0.8 + 0.2 * ease.outBack(k); },
  phase(m, n) { if (n >= 2) m.P('bloom').visible = true; },
};

// ============================================================================ THE GILDED WARDEN — rune statue
const warden = {
  reach: 0.6, die: 'kneel',
  build(m, md) {
    m.res = 104;
    const gold = m.mat('metal', md.body, { acc: '#ffe8a0' });
    const goldR = m.mat('rune', md.body, { acc: md.accent, glow: md.accent, gk: 2.4 });
    const gold2 = m.mat('metal', shade(md.body, -0.15), { acc: '#ffe8a0' });
    const stone = m.mat('stone', '#6a5e4c', { acc: '#8a7e6a' });
    const runeStone = m.mat('rune', '#6a5e4c', { acc: md.accent, glow: md.accent, gk: 2.4 });
    const sash = m.mat('cloth', md.belly, { acc: md.accent });
    const voidM = m.mat('smooth', '#1a120c');
    const white = glowMat(m, '#ffffff', 2.6, 'smooth');
    const rune = glowMat(m, md.accent, 2.6, 'smooth');
    // pedestal: octagonal plinth with a glowing rune band
    m.bone('pedestal', [0, 0, 0]);
    const oct = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + PI / 8; oct.push([cos(a) * 1.18, sin(a) * 1.05]); }
    m.plate('pedestal', [0, 0.35, 0], oct, 0.3, 0.05, stone, { rot: [PI / 2, 0, 0], noise: 0.01, nf: 8 });
    m.plate('pedestal', [0, 0.38, 0], oct.map(([x, z]) => [x * 1.02, z * 1.02]), 0.05, 0.01, runeStone, { op: 'paint', rot: [PI / 2, 0, 0] });
    // robe/skirt with pleats and a sash
    m.bone('skirt', [0, 0.7, 0]);
    m.cap('skirt', [0, 0.05, 0], [0, 1.15, 0], 0.9, 0.62, gold, { k: 0.04 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; m.cap('skirt', [sin(a) * 0.88, 0.05, cos(a) * 0.88], [sin(a) * 0.62, 1.1, cos(a) * 0.62], 0.05, 0.035, gold2, { k: 0.03 }); }
    m.tor('skirt', [0, 1.02, 0], 0.66, 0.06, sash, { k: 0.02 });
    // torso: broad gilded chest, rune-ladder breastplate, heart gem
    m.bone('torso', [0, 1.1, 0], 'skirt');
    m.ell('torso', [0, 0.78, 0], [0.95, 0.82, 0.68], gold, { k: 0.08 });
    m.box('torso', [-0.84, 0.74, 0], [0.12, 0.5, 0.36], 0.08, goldR, { k: 0.08, rot: [0, 0, -0.06] });
    for (let k = 0; k < 4; k++) m.box('torso', [-0.97 + k * 0.006, 0.45 + k * 0.16, 0], [0.03, 0.035, 0.24 - k * 0.03], 0.012, rune, { k: 0.01, rot: [0, 0, -0.06] });
    m.sph('torso', [-0.95, 1.16, 0], 0.09, white, { k: 0.02 });
    // cracks overlay (phase 2): glowing fissures painted over the front
    m.bone('cracks', [0, 0, 0], 'torso');
    for (const pts of [[[-0.93, 1.4, -0.2], [-0.97, 1.2, -0.12], [-0.98, 1.0, -0.24], [-0.97, 0.8, -0.18], [-0.93, 0.5, -0.3]], [[-0.94, 1.3, 0.25], [-0.98, 1.1, 0.33], [-0.97, 0.9, 0.24], [-0.92, 0.65, 0.36]], [[-0.85, 0.36, -0.05], [-0.86, 0.22, 0.08], [-0.82, 0.08, 0.0]]]) {
      for (let i = 0; i < pts.length - 1; i++) m.cap('cracks', pts[i], pts[i + 1], 0.05, 0.05, glowMat(m, md.eye, 3), { op: 'paint', layer: 'cracks' });
    }
    m.P('cracks').visible = false;
    // head: serene mask-helm, one great rune eye, spiked crown
    m.bone('head', [-0.05, 1.6, 0], 'torso');
    m.ell('head', [0, 0.42, 0], [0.42, 0.44, 0.4], gold, { k: 0.06 });
    m.plate('head', [-0.4, 0.22, 0], [[0, 0], [-0.1, 0], [0, 0.24]], 0.05, 0.02, gold, { k: 0.03 });
    m.tor('head', [-0.4, 0.52, 0], 0.15, 0.035, gold2, { rot: [0, 0, PI / 2], k: 0.01 });
    m.sph('head', [-0.39, 0.52, 0], 0.12, m.mat('eye', '#0a2a24', { glow: md.accent, gk: 3, full: true }), { k: 0.01 });
    m.box('head', [-0.4, 0.08, 0], [0.04, 0.012, 0.12], 0.006, voidM, { op: 'sub', k: 0.006 });
    m.tor('head', [0, 0.78, 0], 0.42, 0.06, gold2, { k: 0.02 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; m.cap('head', [sin(a) * 0.42, 0.82, cos(a) * 0.4], [sin(a) * 0.5, 0.82 + (i % 2 ? 0.25 : 0.42), cos(a) * 0.48], 0.07, 0.015, gold2, { k: 0.02 }); }
    m.sph('head', [-0.46, 0.82, 0], 0.05, glowMat(m, '#ff4a6a', 2.4), { k: 0.01 });
    // pauldrons
    for (const s of SIDES) {
      const n = s < 0 ? 'padF' : 'padB';
      m.bone(n, [0, 1.38, s * 0.86], 'torso', { rot: [s * 0.35, 0, 0] });
      m.ell(n, [0, 0.1, 0], [0.42, 0.24, 0.36], gold, { k: 0.04 });
      m.box(n, [-0.36, 0.08, 0], [0.04, 0.09, 0.16], 0.02, rune, { k: 0.01 });
    }
    // arms with rune bands; gauntlets
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [0, 1.25, s * 1.0], 'torso');
      m.cap(n, [0, 0, 0], [0.03, -0.75, 0], 0.2, 0.18, gold2, { k: 0.05 });
      m.sph(n, [0.03, -0.75, 0], 0.2, gold, { k: 0.03 });
      m.cap(n, [0.03, -0.75, 0], [-0.02, -1.42, 0], 0.18, 0.17, gold2, { k: 0.03 });
      for (const y of [-0.95, -1.15, -1.32]) m.tor(n, [0, y, 0], 0.18, 0.03, rune, { k: 0.01 });
      m.ell(n, [-0.04, -1.58, 0], [0.2, 0.18, 0.18], gold, { k: 0.03 });
    }
    // scepter: tall staff crowned by a rune orb in four prongs
    m.bone('scepter', [-0.04, -1.56, 0], 'armF', { rot: [0, 0, 0.15] });
    m.cap('scepter', [0, -0.6, 0], [0, 3.0, 0], 0.055, 0.055, gold2, { k: 0.02 });
    for (const y of [-0.55, 0.6, 1.6, 2.6]) m.ell('scepter', [0, y, 0], [0.1, 0.07, 0.1], gold, { k: 0.02 });
    for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; m.tube('scepter', [[cos(a) * 0.05, 2.95, sin(a) * 0.05], [cos(a) * 0.22, 3.15, sin(a) * 0.22], [cos(a) * 0.18, 3.38, sin(a) * 0.18], [cos(a) * 0.05, 3.5, sin(a) * 0.05]], 0.035, gold2, { k: 0.01 }); }
    m.sph('scepter', [0, 3.24, 0], 0.17, rune, { k: 0.01 });
    m.emitter({ pos: [-0.55, 4.7, 1.0], rate: 6, vel: [0, 0.4, 0], spread: 0.3, life: [0.6, 1.4], size: 1, color: [md.accent, '#ffffff'], glow: 3 });
    m.emitter({ pos: [0, 0.8, 0], rate: 4, vel: [0, 0.2, 0], spread: 0.15, posSpread: [1.1, 0, 1.0], life: [1, 2], size: 1, color: '#e8d8a8', glow: 1.2 });
    m.points({ height: 4.6, hit: [-0.8, 3.1, 0], mouth: [-0.5, 3.95, 0], cuts: [[-0.8, 2.4, 0], [-0.6, 3.3, 0], [0, 3.2, -1.1], [0, 3.2, 1.1], [-0.6, 1.4, 0.5], [-0.3, 1.9, -0.6]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('armF').rotation.z += -e.wind * 2.0 + e.strike * 2.2 + sin(t * 0.8) * 0.04 + e.multi * sin(t * 10) * 0.6;
    m.P('armB').rotation.z += -e.special * 1.6 - e.roar * 1.4 + sin(t * 0.8 + 1.5) * 0.04;
    m.P('armB').rotation.x += e.roar * 0.4;
    m.P('torso').rotation.z += -e.wind * 0.08 + e.strike * 0.12;
    m.P('torso').rotation.y += sin(t * 0.5) * 0.05;
    m.P('head').rotation.y += sin(t * 0.4) * 0.15 * (1 - e.wind);
    m.P('head').rotation.z += -e.roar * 0.2;
  },
  intro(m, k) {
    // the statue's head turns toward you, then it steps off its pedestal stance
    m.P('head').rotation.y += (1 - ease.inOutCubic(clamp(k * 1.4))) * 1.4;
    m.P('torso').rotation.y += (1 - ease.inOutCubic(clamp(k * 1.2 - 0.2))) * 0.6;
    m.P('armF').rotation.z += (1 - ease.outCubic(k)) * 0.6;
  },
  phase(m, n) { if (n >= 2) m.P('cracks').visible = true; },
};

// ============================================================================ PYRRHAX — molten wyrm
const pyrrhax = {
  reach: 0.8, die: 'sink',
  build(m, md) {
    m.res = 104;
    const crust = m.mat('crust', md.body, { glow: '#ff6a1a', gk: 2.6, ts: 1.4 });
    const belly = m.mat('plate', md.belly, { acc: shade(md.belly, -0.35), glow: '#ff8a2a', gk: 2, ts: 1.2 });
    const horn = m.mat('bone', '#3a2420', { acc: '#1a0e0a' });
    const basalt = m.mat('stone', '#2a2024', { acc: '#3a2a2a', glow: '#ff6a1a', gk: 2.2 });
    const tooth = m.mat('bone', '#fff6e0', { acc: '#c8b890' });
    const lava = glowMat(m, '#ff8a2a', 2.2, 'lava');
    const radii = [0.72, 0.68, 0.63, 0.58, 0.54, 0.49, 0.44];
    const offs = [[0.8, 0.4, 0], [0.1, 0.72, 0], [-0.1, 0.72, 0], [-0.3, 0.7, 0], [-0.3, 0.62, 0], [-0.1, 0.52, 0], [0.1, 0.44, 0]];
    let parent = 'root';
    radii.forEach((r, i) => {
      const n = 's' + i;
      m.bone(n, offs[i], parent);
      m.ell(n, [0, 0, 0], [r, r * 0.92, r * 0.84], crust, { k: 0.1, noise: 0.015, nf: 5 });
      if (i < 6) m.cap(n, [0, 0, 0], offs[i + 1], r * 0.86, radii[i + 1] * 0.86, crust, { k: 0.08 });
      m.ell(n, [-r * 0.5, -r * 0.1, 0], [r * 0.6, r * 0.8, r * 0.66], belly, { op: 'paint' });
      if (i > 0) for (let k = 0; k < 2; k++) m.cap(n, [0.1 + k * 0.18, r * 0.78, 0], [0.32 + k * 0.2, r * 1.45 - k * 0.12, 0], r * 0.16, 0.02, horn, { k: 0.03 });
      parent = n;
    });
    // head: long dragon skull, swept horns, ember eyes, fangs
    m.bone('head', [-0.4, 0.6, 0], 's6');
    m.ell('head', [0.0, 0.05, 0], [0.48, 0.36, 0.4], crust, { k: 0.1 });
    m.cap('head', [-0.2, 0.0, 0], [-0.92, -0.04, 0], 0.32, 0.18, crust, { k: 0.1 });
    for (const s of SIDES) {
      m.tube('head', [[0.15, 0.24, s * 0.2], [-0.15, 0.3, s * 0.26], [-0.45, 0.22, s * 0.2]], [0.11, 0.09, 0.06], crust, { k: 0.05 });
      m.tube('head', hornPath([0.12, 0.25, s * 0.22], [1, 0.5, s * 0.35], [0, 1, 0], 0.95, 1.1, 6), (t) => 0.13 * (1 - t) + 0.02, horn, { k: 0.04 });
      m.tube('head', hornPath([0.3, 0.05, s * 0.3], [1, -0.1, s * 0.6], [0, 1, 0], 0.5, 0.9, 4), (t) => 0.08 * (1 - t) + 0.015, horn, { k: 0.03 });
      beady(m, 'head', [-0.34, 0.2, s * 0.24], 0.06, md.eye, 3);
      m.sph('head', [-0.92, 0.07, s * 0.08], 0.04, lava, { k: 0.01 });
      for (let i = 0; i < 6; i++) m.cap('head', [-0.86 + i * 0.12, -0.15, s * (0.12 + i * 0.03)], [-0.86 + i * 0.12, -0.27, s * (0.12 + i * 0.03)], 0.035, 0.008, tooth, { k: 0.01 });
    }
    for (let k = 0; k < 4; k++) m.cap('head', [0.32 + k * 0.05, 0.12 - k * 0.1, 0], [0.62 + k * 0.03, 0.28 - k * 0.14, 0], 0.07, 0.015, horn, { k: 0.03 });
    m.ell('head', [-0.5, -0.17, 0], [0.42, 0.05, 0.2], lava, { op: 'sub', k: 0.02 });
    m.bone('jaw', [0.25, -0.05, 0], 'head');
    m.cap('jaw', [-0.1, -0.16, 0], [-1.05, -0.2, 0], 0.22, 0.13, crust, { k: 0.05 });
    m.ell('jaw', [-0.6, -0.1, 0], [0.4, 0.05, 0.16], lava, { k: 0.01 });
    for (let i = 0; i < 5; i++) for (const s of SIDES) m.cap('jaw', [-0.95 + i * 0.12, -0.1, s * (0.11 + i * 0.03)], [-0.95 + i * 0.12, 0.0, s * (0.11 + i * 0.03)], 0.03, 0.008, tooth, { k: 0.01 });
    m.cap('jaw', [-0.05, -0.2, 0], [-1.1, -0.24, 0], 0.3, 0.2, null, { op: 'bind' });
    // fin-wings: tattered membrane spread from the upper body
    const W = [[0, 0], [0.4, 0.15], [0.95, 0.2], [1.5, 0.5], [1.25, 0.62], [1.35, 0.85], [0.95, 0.78], [0.95, 1.05], [0.55, 0.85], [0.4, 1.0], [0.1, 0.5]];
    const wm = m.mat('membrane', shade(md.body, -0.25), { acc: '#ff6a1a', glow: '#ffb04a', gk: 2.4 });
    for (const s of SIDES) {
      const n = s > 0 ? 'wingL' : 'wingR';
      m.bone(n, [0.2, 0.3, s * 0.5], 's4', { rot: [-s * 0.7, s * 0.4, 0.5] });
      m.plate(n, [0, 0, 0], W, 0.012, 0.012, wm, { k: 0.03 });
      for (const [x, y] of [[0.4, 0.15], [1.5, 0.5], [1.35, 0.85], [0.95, 1.05], [0.4, 1.0]]) m.cap(n, [0, 0, 0], [x, y, 0], 0.05, 0.018, horn, { k: 0.02 });
    }
    // lava pool skirt with a basalt rim
    m.bone('pool', [0.8, 0, 0]);
    m.ell('pool', [0, 0.02, 0], [1.9, 0.06, 1.42], lava, { k: 0.02 });
    for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2 + 0.2, s = 0.16 + ((i * 7) % 5) * 0.03; m.ell('pool', [cos(a) * 1.92, s * 0.4, sin(a) * 1.42], [s * 1.3, s, s], basalt, { k: 0.06, noise: 0.03, nf: 9 }); }
    m.emitter({ pos: [0.6, 1.5, 0], rate: 26, vel: [0, 1.2, 0], spread: 0.6, posSpread: [1.4, 1.2, 0.8], life: [0.5, 1.4], size: [1, 2], color: ['#ffd04a', '#ff6a1a', '#fff0a0'], glow: 3, drag: 0.5 });
    m.emitter({ pos: [-1.3, 4.0, 0], rate: 5, vel: [-0.2, -0.5, 0], spread: 0.2, life: [0.5, 1], size: 2, color: ['#ffb04a', '#ff6a1a'], glow: 3, gravity: 6 });
    m.points({ height: 4.8, hit: [-0.4, 3.6, 0], mouth: [-1.5, 4.25, 0], cuts: [[-0.6, 4.3, 0], [0.4, 3.0, 0], [0.9, 2.0, 0], [0.8, 1.0, 0.4], [-0.2, 3.6, 0.5], [0.5, 2.6, -0.5]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    for (let i = 0; i < 7; i++) {
      const p = m.P('s' + i);
      p.rotation.z += sin(t * 1.6 - i * 0.7) * 0.05 + (i >= 4 ? -e.wind * 0.12 + e.strike * 0.2 : 0);
      p.rotation.x += sin(t * 1.1 - i * 0.5) * 0.03;
    }
    m.P('head').rotation.z += -e.wind * 0.3 + e.strike * 0.45 - e.roar * 0.4;
    m.P('jaw').rotation.z += -(0.08 + Math.max(0, sin(t * 1.8)) * 0.08 + e.roar * 0.7 + e.strike * 0.4 + e.multi * Math.abs(sin(t * 10)) * 0.6 + e.special * 0.6);
    m.P('wingL').rotation.x += -sin(t * 3) * 0.25 - e.roar * 0.4; m.P('wingR').rotation.x += sin(t * 3) * 0.25 + e.roar * 0.4;
  },
  intro(m, k) { const r = m.root; r.position.y -= (1 - ease.outCubic(k)) * m.height; m.P('pool').position.y += (1 - ease.outCubic(k)) * m.height; },
};

// ============================================================================ THE CURSED LORD
const cursedlord = {
  reach: 0.7, die: 'kneel',
  build(m, md) {
    m.res = 104;
    const robe = m.mat('cloth', md.body, { acc: shade(md.body, -0.2), ts: 0.8 });
    const trim = m.mat('trim', shade(md.body, -0.1), { acc: md.accent, glow: md.accent, gk: 1.4, ts: 1.5 });
    const plate = m.mat('rune', '#3a3448', { acc: md.accent, glow: md.accent, gk: 2.2 });
    const plate2 = m.mat('metal', '#2a2436', { acc: '#5a5068' });
    const bone = m.mat('bone', '#d8d0e0', { acc: '#9a90a8' });
    const gold = m.mat('metal', '#e0b040', { acc: '#fff0a0' });
    const voidM = m.mat('smooth', '#06040a');
    const iron = m.mat('metal', '#7a7a8a', { acc: '#9a9aaa' });
    const runeG = glowMat(m, md.accent, 2.6, 'smooth');
    // cloak: tall flared mantle with a tattered hem and deep folds
    m.bone('cloak', [0, 0, 0]);
    m.cap('cloak', [0, 0.35, 0], [0, 2.8, 0], 1.05, 0.62, robe, { noise: 0.025, nf: 3 });
    m.ell('cloak', [0, 0.05, 0], [0.95, 0.45, 0.95], voidM, { op: 'sub', k: 0.05 });
    for (let i = 0; i < 14; i++) { const a = ((i + 0.5) / 14) * PI * 2, L = 0.3 + (i % 3) * 0.14; m.cap('cloak', [sin(a) * 0.98, 0.42, cos(a) * 0.98], [sin(a + 0.08) * 1.06, 0.42 - L, cos(a + 0.08) * 1.06], 0.15, 0.025, robe, { k: 0.06 }); }
    m.cap('cloak', [0, 0.0, 0], [0, 0.62, 0], 1.25, 1.15, trim, { op: 'paint' });
    m.box('cloak', [-0.66, 1.6, 0], [0.2, 1.3, 0.1], 0.02, trim, { op: 'paint', rot: [0, 0, -0.12] });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2 + 0.3; m.tube('cloak', [[sin(a) * 1.06, 0.3, cos(a) * 1.06], [sin(a) * 0.88, 1.3, cos(a) * 0.88], [sin(a) * 0.66, 2.6, cos(a) * 0.66]], 0.07, robe, { k: 0.06 }); }
    // armoured chest with a glowing rune seam and heart-core
    m.bone('chest', [0, 2.74, 0], 'cloak');
    m.ell('chest', [0, 0.55, 0], [0.82, 0.62, 0.62], plate, { k: 0.08 });
    m.box('chest', [-0.62, 0.55, 0], [0.1, 0.45, 0.3], 0.06, plate2, { k: 0.06, rot: [0, 0, -0.1] });
    m.box('chest', [-0.72, 0.6, 0], [0.04, 0.45, 0.04], 0.02, runeG, { k: 0.01, rot: [0, 0, -0.1] });
    m.box('chest', [-0.74, 0.62, 0], [0.04, 0.04, 0.28], 0.02, runeG, { k: 0.01 });
    m.sph('chest', [-0.76, 0.66, 0], 0.1, glowMat(m, '#ffffff', 2.8, 'smooth'), { k: 0.01 });
    m.tor('chest', [0, 1.12, 0], 0.42, 0.08, plate2, { k: 0.03 });
    // pauldrons with bone spikes
    for (const s of SIDES) {
      const n = s < 0 ? 'padF' : 'padB';
      m.bone(n, [0, 0.98, s * 0.9], 'chest', { rot: [s * 0.35, 0, 0] });
      m.ell(n, [0, 0.12, 0], [0.42, 0.26, 0.36], plate2, { k: 0.04 });
      for (let i = 0; i < 3; i++) m.cap(n, [-0.15 + i * 0.15, 0.3, 0], [-0.2 + i * 0.12, 0.62 + (i % 2) * 0.15, 0], 0.07, 0.012, m.mat('bone', '#5a5068', { acc: '#3a3448' }), { k: 0.03 });
    }
    for (const s of SIDES) {
      const n = s < 0 ? 'chainF' : 'chainB';
      m.bone(n, [s * 0.1 * 0 - 0.1, 0.0, s * 0.18], s < 0 ? 'padF' : 'padB');
      for (let k = 0; k < 9; k++) m.tor(n, [0, -k * 0.13, 0], 0.07, 0.03, iron, { rot: [PI / 2, (k % 2) * PI / 2, 0], k: 0.005 });
    }
    // skull head with a spiked golden crown
    m.bone('head', [-0.1, 1.18, 0], 'chest');
    m.ell('head', [0, 0.42, 0], [0.36, 0.38, 0.34], bone, { k: 0.04 });
    m.ell('head', [-0.12, 0.18, 0], [0.24, 0.16, 0.26], bone, { k: 0.06 });
    for (const s of SIDES) {
      m.sph('head', [-0.31, 0.4, s * 0.13], 0.1, voidM, { op: 'sub', k: 0.02 });
      m.sph('head', [-0.27, 0.4, s * 0.13], 0.045, glowMat(m, md.eye, 3.2, 'eye'), { k: 0.008 });
    }
    m.plate('head', [-0.36, 0.25, 0], [[-0.045, 0], [0.045, 0], [0, 0.1]], 0.05, 0.01, voidM, { op: 'sub', rot: [0, PI / 2, 0] });
    for (let i = 0; i < 6; i++) m.box('head', [-0.33 + Math.abs(i - 2.5) * 0.02, 0.1, -0.12 + i * 0.048], [0.025, 0.04, 0.02], 0.01, bone, { k: 0.005 });
    m.tor('head', [0, 0.62, 0], 0.36, 0.06, gold, { k: 0.02 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; m.cap('head', [sin(a) * 0.36, 0.66, cos(a) * 0.32], [sin(a) * 0.44, 0.66 + (i % 2 ? 0.22 : 0.4), cos(a) * 0.4], 0.06, 0.012, gold, { k: 0.02 }); if (i % 2 === 0) m.sph('head', [sin(a) * 0.4, 0.64, cos(a) * 0.36], 0.04, runeG, { k: 0.005 }); }
    // arms: plated sleeves with skeletal claws
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [0, 0.9, s * 1.0], 'chest');
      m.cap(n, [0, 0, 0], [0.03, -0.75, 0], 0.17, 0.14, plate2, { k: 0.04 });
      m.sph(n, [0.03, -0.75, 0], 0.16, plate, { k: 0.03 });
      m.cap(n, [0.03, -0.75, 0], [-0.02, -1.38, 0], 0.14, 0.13, plate2, { k: 0.03 });
      m.cap(n, [-0.02, -1.2, 0], [-0.02, -1.42, 0], 0.15, 0.2, robe, { k: 0.02 });
      m.ell(n, [-0.03, -1.5, 0], [0.1, 0.09, 0.08], bone, { k: 0.03 });
      for (let f = 0; f < 4; f++) m.tube(n, [[-0.06, -1.52, -0.06 + f * 0.04], [-0.14, -1.62, -0.07 + f * 0.047], [-0.12, -1.76, -0.08 + f * 0.054]], [0.025, 0.02, 0.012], bone, { k: 0.01 });
    }
    // the Hollow Blade
    m.bone('blade', [-0.06, -1.55, 0], 'armF', { rot: [0, 0, 0.75] });
    m.plate('blade', [0, 0, 0], [[-0.12, 0], [0.12, 0], [0.14, 2.6], [0.06, 3.0], [0, 3.15], [-0.08, 2.95], [-0.14, 2.6]], 0.03, 0.02, m.mat('rune', '#3a3448', { acc: md.accent, glow: md.accent, gk: 2.6 }), { k: 0.01 });
    m.box('blade', [0, 1.35, 0], [0.02, 1.15, 0.06], 0.01, runeG, { k: 0.005 });
    m.tube('blade', [[-0.4, 0.1, 0], [-0.16, -0.02, 0], [0.16, -0.02, 0], [0.4, 0.1, 0]], 0.055, gold, { k: 0.01 });
    m.cap('blade', [0, -0.55, 0], [0, -0.05, 0], 0.05, 0.05, m.mat('cloth', '#2a1a2a', { acc: '#4a2a4a' }), { k: 0.01 });
    m.sph('blade', [0, -0.62, 0], 0.08, gold, { k: 0.01 });
    m.sph('blade', [0, -0.02, -0.05], 0.06, glowMat(m, md.eye, 3), { k: 0.005 });
    m.emitter({ pos: [0, 0.2, 0], rate: 26, vel: [0, 0.9, 0], spread: 0.35, posSpread: [1.1, 0.1, 1.0], life: [0.6, 1.4], size: [1, 2], color: [md.accent, md.eye, '#7a3ab0'], glow: 2.5, drag: 0.6 });
    m.emitter({ pos: [-0.3, 4.75, 0], rate: 6, vel: [0, 0.5, 0], spread: 0.2, posSpread: [0.3, 0.1, 0.3], life: [0.4, 0.9], size: 1, color: [md.eye, md.accent], glow: 3 });
    m.points({ height: 4.9, hit: [-0.75, 3.4, 0], mouth: [-0.45, 4.3, 0], cuts: [[-0.7, 3.2, 0], [-0.5, 4.3, 0], [0, 3.8, -1.0], [0, 3.8, 1.0], [-0.6, 1.6, 0.4], [-0.3, 2.4, -0.6]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.root.position.y += sin(t * 0.8) * 0.04;
    m.P('cloak').scale.x *= 1 + sin(t * 2.2) * 0.015;
    m.P('armF').rotation.z += -e.wind * 2.5 + e.strike * 2.6 + sin(t * 0.9) * 0.04 + e.multi * sin(t * 12) * 1.0;
    m.P('armB').rotation.z += -e.special * 1.8 - e.roar * 1.2 + sin(t * 0.9 + 2) * 0.05;
    m.P('armB').rotation.x += e.roar * 0.5 + e.special * 0.3;
    m.P('chest').rotation.z += -e.wind * 0.12 + e.strike * 0.15 - e.roar * 0.1;
    m.P('head').rotation.z += -e.roar * 0.25 + sin(t * 0.6) * 0.03;
    m.P('chainF').rotation.x += sin(t * 1.7) * 0.15; m.P('chainB').rotation.x += sin(t * 1.9 + 1) * 0.15;
  },
  intro(m, k) { m.root.position.y -= (1 - ease.inOutCubic(k)) * m.height * 0.9; m.P('head').rotation.z += (1 - k) * 0.5; },
  phase(m, n) { m.emitters.forEach((em) => { em.boost = 1 + (n - 1); }); },
};

export const BOSS_ARCHES = { rustjaw, mycel, warden, pyrrhax, cursedlord };
