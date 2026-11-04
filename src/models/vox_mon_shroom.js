// Mushroom-dungeon archetypes for the v5 action game: Grand Puffcap (the fat mushroom king, stage 0 boss),
// Morel (the friendly mushroom guy of the tutorial), Rootling (a burrowing knot of roots) and the Cap Archer
// (a bracket-cap blowpipe shooter). Same conventions as the other archetype files: metres before md.scale,
// head toward −X, up +Y, "F" limbs at −Z. Read from the top-down Hades camera first: big bold caps, glowing
// spots and gills, chunky limbs (≥ 2 voxels), faces that read from 12 m away.
import { shadeHex as shade } from '../core/math.js';

const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const SIDES = [-1, 1];
const glowMat = (m, col, gk = 2.4, tile = 'crystal') => m.mat(tile, col, { glow: col, gk, full: true });
/** Glossy cartoon eye: dark bead + white catchlight, on its own (solo) bone so it can blink. */
function cuteEye(m, bone, at, parent, r, col = '#1a1210') {
  m.bone(bone, at, parent, { solo: true });
  m.sph(bone, [0, 0, 0], r, m.mat('smooth', col));
  m.sph(bone, [-r * 0.62, r * 0.38, r * 0.28], r * 0.32, m.mat('smooth', '#ffffff'), { k: r * 0.05 });
}

// ============================================================================ GRAND PUFFCAP (stage 0 boss)
const puffcap = {
  reach: 0.55, die: 'flatten', gait: 'walk',
  build(m, md) {
    const flesh = m.mat('flesh', md.body, { acc: shade(md.body, -0.06) });
    const belly = m.mat('smooth', md.belly);
    const capM = m.mat('cap', md.cap, { acc: shade(md.cap, 0.18) });
    const gill = m.mat('gill', '#f0d0b0');
    const spotM = glowMat(m, md.spot || '#fff4e0', 1.3, 'smooth');
    const pore = glowMat(m, md.accent, 2.6, 'smooth');
    const gold = m.mat('metal', md.crown || '#ffd04a', { acc: '#fff4b4' });
    const gem = glowMat(m, '#ff4a6a', 2.4, 'crystal');
    const cheek = m.mat('smooth', '#ff9a9a');
    const mouthM = m.mat('smooth', '#4a1020');
    const tongue = m.mat('smooth', '#ff6a8a');
    const tooth = m.mat('smooth', '#fffaf0');
    // the belly: one big jiggly pear of mushroom flesh, lighter in front
    m.bone('body', [0, 0.78, 0]);
    m.ell('body', [0, 0, 0], [0.74, 0.72, 0.78], flesh, { noise: 0.012, nf: 6 });
    m.ell('body', [-0.18, -0.08, 0], [0.6, 0.58, 0.66], belly, { op: 'paint' });
    m.ell('body', [0.05, 0.55, 0], [0.42, 0.25, 0.44], flesh, { k: 0.2 });
    // frilly skirt (annulus) where the cap meets the stem
    m.tor('body', [0.04, 0.62, 0], 0.46, 0.07, gill, { k: 0.06 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; m.sph('body', [0.04 + cos(a) * 0.5, 0.56, sin(a) * 0.5], 0.06, gill, { k: 0.04 }); }
    // face on the belly: big glossy eyes under heavy brows, rosy cheeks, a wide grumpy mouth
    for (const s of SIDES) {
      cuteEye(m, s < 0 ? 'eyeF' : 'eyeB', [-0.63, 0.26, s * 0.22], 'body', 0.11, md.eye || '#2a1018');
      m.cap('body', [-0.66, 0.42, s * 0.33], [-0.7, 0.4, s * 0.1], 0.06, 0.05, flesh, { k: 0.05 });
      m.ell('body', [-0.62, 0.06, s * 0.38], [0.06, 0.08, 0.12], cheek, { op: 'paint' });
    }
    m.bone('jaw', [-0.6, -0.02, 0], 'body', { solo: true });
    m.ell('jaw', [-0.06, -0.06, 0], [0.09, 0.08, 0.2], mouthM);
    m.ell('jaw', [-0.08, -0.1, 0], [0.06, 0.04, 0.12], tongue, { k: 0.02 });
    for (const s of [-1, 1]) m.cap('jaw', [-0.1, 0.0, s * 0.1], [-0.12, -0.06, s * 0.11], 0.03, 0.018, tooth, { k: 0.006 });
    // spore pores glowing along the flanks
    for (const [x, y, z] of [[0.2, 0.1, 0.72], [-0.1, -0.25, 0.72], [0.35, -0.3, 0.6], [0.2, 0.1, -0.72], [-0.1, -0.25, -0.72], [0.35, -0.3, -0.6], [0.6, 0.0, 0.3], [0.6, 0.0, -0.3]]) m.sph('body', [x, y, z], 0.06, pore, { k: 0.01 });
    // stubby feet
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [-0.08, -0.62, s * 0.38], 'body');
      m.ell(n, [-0.08, -0.1, 0], [0.22, 0.12, 0.18], flesh, { k: 0.06 });
    }
    // stubby arms with round mitts
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.05, 0.12, s * 0.74], 'body');
      m.tube(n, [[0, 0, 0], [-0.08, -0.16, s * 0.12], [-0.14, -0.3, s * 0.14]], [0.11, 0.1, 0.09], flesh, { k: 0.05 });
      m.ell(n, [-0.17, -0.38, s * 0.15], [0.13, 0.12, 0.12], belly, { k: 0.04 });
    }
    // THE CAP: a huge red dome with cream spots, a drooping rim and glowing gills
    m.bone('cap', [0.05, 0.86, 0], 'body');
    m.ell('cap', [0, 0.3, 0], [1.2, 0.55, 1.2], capM, { noise: 0.016, nf: 5 });
    m.ell('cap', [0, 0.08, 0], [1.08, 0.24, 1.08], null, { op: 'sub', k: 0.06 });
    m.ell('cap', [0, 0.12, 0], [1.05, 0.12, 1.05], gill, { op: 'paint' });
    m.tor('cap', [0, 0.1, 0], 1.12, 0.09, capM, { k: 0.08 });
    for (const [x, z, r] of [[0, 0, 0.2], [-0.5, 0.35, 0.17], [0.45, -0.45, 0.19], [0.55, 0.45, 0.14], [-0.4, -0.55, 0.15], [-0.85, -0.1, 0.12], [0.88, 0.05, 0.13], [0.1, 0.85, 0.13], [-0.1, -0.88, 0.12], [-0.65, 0.68, 0.1], [0.7, -0.78, 0.1]]) {
      const y = 0.3 + 0.55 * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / 1.44));
      m.ell('cap', [x, y - 0.02, z], [r, r * 0.42, r], spotM, { k: 0.02 });
    }
    // the tiny crown, a bit askew
    m.bone('crown', [0.05, 0.86, -0.08], 'cap', { rot: [0.1, 0, 0.12] });
    m.cap('crown', [0, 0, 0], [0, 0.1, 0], 0.18, 0.2, gold, { k: 0.02 });
    m.cap('crown', [0, 0.02, 0], [0, 0.08, 0], 0.14, 0.16, null, { op: 'sub' });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; m.cap('crown', [cos(a) * 0.17, 0.08, sin(a) * 0.17], [cos(a) * 0.2, 0.24, sin(a) * 0.2], 0.04, 0.012, gold, { k: 0.01 }); m.sph('crown', [cos(a) * 0.205, 0.26, sin(a) * 0.205], 0.03, gold, { k: 0.005 }); }
    m.sph('crown', [-0.19, 0.06, 0], 0.045, gem, { k: 0.005 });
    m.emitter({ pos: [0.05, 2.2, 0], rate: 7, vel: [0, 0.2, 0], spread: 0.5, posSpread: [1.0, 0.1, 1.0], life: [1.6, 3.2], size: 1, color: [md.accent, '#fff0c0', '#ffffff'], glow: 2, gravity: -0.04, drag: 0.5 });
    m.points({ hit: [-0.55, 0.85, 0], mouth: [-0.75, 0.72, 0], height: 2.5, cuts: [[-0.6, 0.9, 0], [-0.3, 1.9, 0.6], [0.2, 2.05, -0.5], [-0.5, 0.4, 0.5], [-0.5, 0.4, -0.5], [0.3, 1.2, 0.7]] });
  },
  anim(m, dt) {
    const e = m.env, t = m.t;
    const b = m.P('body'), c = m.P('cap');
    // jiggle: the belly wobbles on its own spring, the cap lags behind it
    m._wob = (m._wob || 0) + (m._wobV || 0) * dt;
    m._wobV = (m._wobV || 0) + (-60 * (m._wob || 0) - 4 * (m._wobV || 0) + m.joltV * 2.2) * dt;
    const w = Math.max(-0.4, Math.min(0.4, m._wob || 0));
    b.scale.y *= 1 + w * 0.22 + e.wind * 0.12 + sin(t * 2.2) * 0.02;
    b.scale.x *= 1 - w * 0.14 + e.wind * 0.08;
    b.scale.z *= 1 - w * 0.14 + e.wind * 0.08;
    b.rotation.z += sin(t * 1.6) * 0.03 + e.strike * 0.2;
    c.rotation.z += -w * 0.3 + sin(t * 1.6 - 0.5) * 0.04 - e.wind * 0.15 + e.strike * 0.25;
    c.rotation.x += cos(t * 1.3) * 0.03;
    c.position.y += -w * 0.08 + e.wind * 0.04;
    m.P('crown').rotation.z += -w * 0.6 + sin(t * 3) * 0.04;
    // arms flail when angry, wave on the roar, pound on the slam
    for (const s of SIDES) {
      const a = m.P(s < 0 ? 'armF' : 'armB');
      a.rotation.x += s * (0.3 + e.roar * 1.4 + e.wind * 0.9 + sin(t * 3 + s) * 0.1 + e.special * 0.8);
      a.rotation.z += -e.strike * 1.0 + e.wind * 0.6 + (e.move > 0.2 ? sin(m.gaitT * PI + (s > 0 ? PI : 0)) * 0.5 * e.move : 0);
    }
    for (const s of SIDES) { const l = m.P(s < 0 ? 'legF' : 'legB'); l.rotation.z += e.move * sin(m.gaitT * PI + (s > 0 ? PI : 0)) * 0.5; }
    // mouth opens on roars and slams, grumbles while idle
    const jaw = m.P('jaw');
    jaw.scale.y *= 0.7 + e.roar * 1.6 + e.strike * 0.9 + e.special * 1.2 + Math.max(0, sin(t * 1.1)) * 0.15;
    // blink
    const bl = (t % 3.7) < 0.12 ? 0.12 : 1;
    m.P('eyeF').scale.y *= bl; m.P('eyeB').scale.y *= bl;
    if (m.phase >= 3) { b.position.x += sin(t * 40) * 0.01; }
  },
};

// ============================================================================ MOREL (tutorial NPC)
// States beyond the monster set: talk | wave | point | cheer | scared | run (play(name) holds until the next play).
const morel = {
  reach: 0.15, gait: 'walk',
  build(m, md) {
    const flesh = m.mat('flesh', md.body, { acc: shade(md.body, -0.05) });
    const belly = m.mat('smooth', md.belly);
    const capM = m.mat('cap', md.cap, { acc: shade(md.cap, 0.12) });
    const pit = m.mat('smooth', md.capDark || shade(md.cap, -0.35));
    const cheek = m.mat('smooth', '#ff9aa0');
    const mouthM = m.mat('smooth', '#5a1a24');
    const cape = m.mat('moss', md.cape || '#4a8a5a', { acc: shade(md.cape || '#4a8a5a', 0.15) });
    const leather = m.mat('cloth', md.satchel || '#8a5a32', { acc: shade(md.satchel || '#8a5a32', -0.12) });
    const brass = m.mat('metal', '#e8b840', { acc: '#fff0a0' });
    const spore = glowMat(m, md.accent || '#7ad8ff', 2.2, 'smooth');
    m.bone('body', [0, 0.1, 0]);
    m.ell('body', [0, 0.15, 0], [0.15, 0.18, 0.145], flesh, { noise: 0.004, nf: 12 });
    m.ell('body', [-0.06, 0.12, 0], [0.11, 0.13, 0.12], belly, { op: 'paint' });
    for (const s of SIDES) m.ell('body', [-0.12, 0.16, s * 0.085], [0.025, 0.022, 0.03], cheek, { op: 'paint' });
    cuteEye(m, 'eyeF', [-0.13, 0.2, -0.056], 'body', 0.04);
    cuteEye(m, 'eyeB', [-0.13, 0.2, 0.056], 'body', 0.04);
    m.bone('mouth', [-0.148, 0.155, 0], 'body', { solo: true });
    m.ell('mouth', [0, 0, 0], [0.012, 0.014, 0.028], mouthM);
    // leafy moss cape on the back, a satchel with a brass buckle on the hip
    m.ell('body', [0.1, 0.17, 0], [0.06, 0.17, 0.15], cape, { k: 0.02 });
    m.tor('body', [0.0, 0.17, 0], 0.15, 0.012, leather, { rot: [0.7, 0, 0], k: 0.006 });
    m.box('body', [0.0, 0.06, 0.15], [0.06, 0.05, 0.03], 0.015, leather, { k: 0.008 });
    m.sph('body', [-0.02, 0.07, 0.18], 0.014, brass, { k: 0.003 });
    // stubby feet and arms
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [-0.01, 0.02, s * 0.07], 'body');
      m.ell(n, [-0.03, -0.06, 0], [0.065, 0.04, 0.05], flesh, { k: 0.02 });
      const a = s < 0 ? 'armF' : 'armB';
      m.bone(a, [-0.01, 0.2, s * 0.14], 'body');
      m.tube(a, [[0, 0, 0], [-0.02, -0.06, s * 0.03], [-0.01, -0.11, s * 0.02]], [0.03, 0.027, 0.025], flesh, { k: 0.02 });
      m.ell(a, [-0.01, -0.13, s * 0.02], [0.036, 0.034, 0.034], flesh, { k: 0.01 });
    }
    // THE CAP: a tall honeycomb morel cone with dark pits
    m.bone('cap', [0.01, 0.31, 0], 'body');
    m.cap('cap', [0, 0, 0], [0.02, 0.3, 0], 0.17, 0.07, capM, { k: 0.04 });
    m.ell('cap', [0.02, 0.32, 0], [0.075, 0.07, 0.075], capM, { k: 0.04 });
    for (let row = 0; row < 5; row++) {
      const y = 0.04 + row * 0.062, r = 0.17 - row * 0.022 + 0.004;
      const n = 8 - row, off = (row % 2) * 0.5;
      for (let i = 0; i < n; i++) {
        const a = ((i + off) / n) * PI * 2, x = cos(a) * r, z = sin(a) * r;
        m.sph('cap', [x, y, z], 0.03, null, { op: 'sub', k: 0.012 });
        m.sph('cap', [x * 0.92, y, z * 0.92], 0.028, pit, { op: 'paint' });
      }
    }
    m.emitter({ pos: [0.02, 0.78, 0], rate: 1.6, vel: [0, 0.12, 0], spread: 0.3, posSpread: [0.12, 0.05, 0.12], life: [1.2, 2.4], size: 1, color: [md.accent || '#7ad8ff', '#ffffff'], glow: 2, gravity: -0.03, drag: 0.6 });
    void spore;
    m.points({ hit: [-0.1, 0.32, 0], mouth: [-0.16, 0.26, 0], height: 0.8 });
  },
  anim(m, dt) {
    const e = m.env, t = m.t, s = m.state, st = m.st;
    const b = m.P('body'), c = m.P('cap'), aF = m.P('armF'), aB = m.P('armB'), mo = m.P('mouth');
    c.rotation.z += sin(t * 2.4) * 0.04 - e.move * 0.1;
    c.rotation.x += sin(t * 1.7) * 0.03;
    aF.rotation.x += 0.15 + sin(t * 2) * 0.05; aB.rotation.x -= 0.15 + sin(t * 2 + 1) * 0.05;
    if (e.move > 0.05) { aF.rotation.z += sin(m.gaitT * PI) * 0.8 * e.move; aB.rotation.z -= sin(m.gaitT * PI) * 0.8 * e.move; }
    for (const sd of SIDES) { const l = m.P(sd < 0 ? 'legF' : 'legB'); l.rotation.z += e.move * sin(m.gaitT * PI + (sd > 0 ? PI : 0)) * 0.7; }
    let talk = 0;
    if (s === 'talk') {
      talk = 1;
      b.position.y += Math.abs(sin(st * 7)) * 0.012;
      aF.rotation.x += 0.4 + sin(st * 5) * 0.4; aF.rotation.z -= 0.5 + sin(st * 3.3) * 0.3;
      aB.rotation.x -= 0.2 + Math.max(0, sin(st * 4 + 1)) * 0.5;
      c.rotation.z += sin(st * 6) * 0.06;
    } else if (s === 'wave') {
      aF.rotation.x += 2.6; aF.rotation.z += sin(st * 12) * 0.5;
      b.rotation.x += sin(st * 6) * 0.05; talk = 0.4;
    } else if (s === 'point') {
      aF.rotation.z -= 1.55; aF.rotation.x += 0.15; b.rotation.z += 0.08; talk = 0.3;
    } else if (s === 'cheer') {
      const k = Math.abs(sin(st * 6));
      b.position.y += k * 0.09; aF.rotation.x += 2.7; aB.rotation.x -= 2.7;
      aF.rotation.z += sin(st * 12) * 0.3; aB.rotation.z -= sin(st * 12) * 0.3;
      b.scale.y *= 1 + k * 0.08; talk = 0.7;
    } else if (s === 'scared') {
      b.position.x += sin(t * 60) * 0.006; b.position.z += cos(t * 53) * 0.005;
      aF.rotation.x += 2.2; aB.rotation.x -= 2.2; aF.rotation.z -= 0.9; aB.rotation.z -= 0.9;
      b.scale.y *= 0.92; c.rotation.z -= 0.15;
    } else if (s === 'run') {
      b.rotation.z += 0.25;
    }
    mo.scale.y *= talk ? 0.5 + Math.abs(sin(t * 15)) * 1.8 * talk : (s === 'scared' ? 2 : 1);
    mo.scale.z *= s === 'cheer' ? 1.5 : 1;
    // blink, and glance around
    const bl = (t % 3.1) < 0.1 ? 0.12 : 1;
    for (const n of ['eyeF', 'eyeB']) { const ey = m.P(n); ey.scale.y *= s === 'cheer' ? 0.35 : bl; ey.position.z += sin(t * 0.7) * 0.004; }
  },
};

// ============================================================================ ROOTLING (burrower)
const rootling = {
  reach: 0.35, gait: 'walk',
  build(m, md) {
    const bark = m.mat('bark', md.body, { acc: md.belly });
    const pale = m.mat('bark', md.belly, { acc: shade(md.belly, 0.1) });
    const capM = m.mat('cap', md.cap, { acc: shade(md.cap, 0.15) });
    const leaf = glowMat(m, md.accent, 1.6, 'moss');
    const eye = glowMat(m, md.eye, 3, 'eye');
    const hole = m.mat('smooth', '#140a06');
    m.bone('body', [0, 0.3, 0]);
    m.ell('body', [0, 0, 0], [0.17, 0.15, 0.17], bark, { noise: 0.012, nf: 10 });
    // twisting root strands wound around the bulb
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2, a2 = a + 1.2;
      m.cap('body', [cos(a) * 0.15, -0.12, sin(a) * 0.15], [cos(a2) * 0.12, 0.13, sin(a2) * 0.12], 0.035, 0.022, i % 2 ? pale : bark, { k: 0.03 });
    }
    // the knot-hole face: two hot eyes deep in a dark hollow
    m.ell('body', [-0.15, 0.02, 0], [0.05, 0.06, 0.1], null, { op: 'sub', k: 0.02 });
    m.ell('body', [-0.13, 0.02, 0], [0.03, 0.05, 0.09], hole, { op: 'paint' });
    for (const s of SIDES) m.sph('body', [-0.135, 0.035, s * 0.045], 0.026, eye, { k: 0.003 });
    // a crooked little mushroom and a glowing sprout on top
    m.bone('sprout', [0.02, 0.13, 0], 'body');
    m.cap('sprout', [0, 0, 0], [0.02, 0.12, 0.02], 0.025, 0.02, pale, { k: 0.01 });
    m.ell('sprout', [0.02, 0.14, 0.02], [0.08, 0.04, 0.08], capM, { k: 0.01 });
    m.cap('sprout', [0, 0, -0.04], [-0.06, 0.1, -0.1], 0.012, 0.006, leaf, { k: 0.005 });
    m.ell('sprout', [-0.07, 0.11, -0.11], [0.04, 0.012, 0.025], leaf, { rot: [0.3, 0, 0.4], k: 0.005 });
    // four root legs that splay out and grip the floor
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i / 4) * PI * 2, n = 'leg' + i;
      m.bone(n, [cos(a) * 0.1, -0.1, sin(a) * 0.1], 'body');
      m.tube(n, [[0, 0, 0], [cos(a) * 0.12, -0.08, sin(a) * 0.12], [cos(a) * 0.2, -0.2, sin(a) * 0.2]], [0.04, 0.03, 0.016], bark, { k: 0.02 });
    }
    // two long root claws
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.05, 0.03, s * 0.16], 'body');
      m.tube(n, [[0, 0, 0], [-0.12, 0.04, s * 0.08], [-0.24, -0.06, s * 0.06], [-0.3, -0.16, s * 0.02]], [0.035, 0.03, 0.022, 0.01], bark, { k: 0.02 });
      m.cap(n, [-0.27, -0.12, s * 0.04], [-0.34, -0.2, s * 0.08], 0.014, 0.004, pale, { k: 0.004 });
    }
    m.emitter({ pos: [0, 0.55, 0], rate: 1.2, vel: [0, 0.15, 0], spread: 0.3, posSpread: [0.1, 0.05, 0.1], life: [0.8, 1.6], size: 1, color: [md.accent, '#e0ffb0'], glow: 1.8, gravity: -0.05 });
    m.points({ hit: [-0.1, 0.32, 0], mouth: [-0.18, 0.32, 0], height: 0.62 });
  },
  anim(m) {
    const e = m.env, t = m.t;
    for (let i = 0; i < 4; i++) { const l = m.P('leg' + i); l.rotation.y += sin(t * 5 + i * 1.7) * 0.15 + e.move * sin(m.gaitT * PI * 2 + i * PI / 2) * 0.4; l.rotation.z += e.move * cos(m.gaitT * PI * 2 + i * PI / 2) * 0.3; }
    for (const s of SIDES) {
      const a = m.P(s < 0 ? 'armF' : 'armB');
      a.rotation.z += -e.wind * 1.4 + e.strike * 1.6 + sin(t * 3 + s) * 0.15;
      a.rotation.x += s * (e.wind * 0.5 - e.strike * 0.3 + e.special * 0.8);
    }
    m.P('sprout').rotation.z += sin(t * 3) * 0.12 - e.strike * 0.4;
    m.P('body').rotation.y += sin(t * 2.2) * 0.08;
  },
};

// ============================================================================ CAP ARCHER (spitter)
const caparcher = {
  reach: 0.12, gait: 'walk',
  build(m, md) {
    const flesh = m.mat('flesh', md.body, { acc: shade(md.body, -0.06) });
    const capM = m.mat('cap', md.cap, { acc: shade(md.cap, 0.2) });
    const band = m.mat('smooth', shade(md.cap, 0.32));
    const gill = m.mat('gill', '#f4e0c0');
    const reed = m.mat('wood', '#8aa04a', { acc: '#5a7a2e' });
    const thorn = m.mat('bone', '#e8dcb8');
    const ink = m.mat('smooth', md.eye || '#1a1214');
    const glow = glowMat(m, md.accent || '#ff9a4a', 2.4, 'smooth');
    for (const s of SIDES) {
      const n = s < 0 ? 'legF' : 'legB';
      m.bone(n, [0, 0.08, s * 0.08]);
      m.ell(n, [-0.02, -0.04, 0], [0.07, 0.05, 0.06], flesh, { k: 0.02 });
    }
    m.bone('body', [0, 0.1, 0]);
    m.ell('body', [0, 0.17, 0], [0.14, 0.2, 0.13], flesh, { noise: 0.005, nf: 12 });
    // squinting eyes, a lumpy nose and puffed cheeks around the blowpipe
    for (const s of SIDES) {
      m.ell('body', [-0.135, 0.25, s * 0.05], [0.012, 0.01, 0.03], ink, { rot: [s * 0.25, 0, 0] });
      m.cap('body', [-0.14, 0.29, s * 0.08], [-0.15, 0.28, s * 0.025], 0.012, 0.009, ink, { k: 0.004 });
    }
    m.sph('body', [-0.155, 0.21, 0], 0.03, flesh, { k: 0.02 });
    m.bone('cheeks', [-0.11, 0.15, 0], 'body');
    for (const s of SIDES) m.ell('cheeks', [0, 0, s * 0.06], [0.05, 0.045, 0.045], flesh, { k: 0.02 });
    // the blowpipe: a long hollow reed with a glowing ember dart at the tip
    m.bone('pipe', [-0.15, 0.15, 0], 'body');
    m.cap('pipe', [0, 0, 0], [-0.34, 0.02, 0], 0.022, 0.026, reed, { k: 0.006 });
    m.tor('pipe', [-0.16, 0.01, 0], 0.026, 0.007, band, { rot: [0, 0, PI / 2] });
    m.sph('pipe', [-0.35, 0.02, 0], 0.015, glow);
    for (const s of SIDES) {
      const n = s < 0 ? 'armF' : 'armB';
      m.bone(n, [-0.02, 0.22, s * 0.13], 'body');
      m.tube(n, [[0, 0, 0], [-0.08, -0.04, s * 0.04], [-0.17, -0.07, -s * 0.02]], [0.028, 0.025, 0.022], flesh, { k: 0.015 });
    }
    // a quiver of thorn darts on the back
    m.cap('body', [0.12, 0.08, 0.04], [0.16, 0.3, 0.02], 0.045, 0.04, m.mat('cloth', '#6a4a2a'), { k: 0.01 });
    for (let i = 0; i < 4; i++) m.cap('body', [0.15 + i * 0.008, 0.3, -0.02 + i * 0.015], [0.18 + i * 0.012, 0.4, -0.03 + i * 0.02], 0.008, 0.003, thorn, { k: 0.002 });
    // THE CAP: a wide flat bracket shelf worn like a brim hat, ringed bands, gills underneath
    m.bone('cap', [0.02, 0.36, 0], 'body', { rot: [0, 0, -0.12] });
    m.ell('cap', [0, 0.04, 0], [0.32, 0.075, 0.32], capM, { noise: 0.008, nf: 8 });
    m.ell('cap', [0, -0.01, 0], [0.29, 0.03, 0.29], gill, { op: 'paint' });
    for (const R of [0.14, 0.22, 0.29]) m.tor('cap', [0, 0.07 - R * 0.12, 0], R, 0.012, band, { op: 'paint' });
    m.cap('cap', [0, -0.04, 0], [0, 0.04, 0], 0.08, 0.07, flesh, { k: 0.02 });
    m.points({ hit: [-0.1, 0.32, 0], mouth: [-0.5, 0.27, 0], height: 0.68 });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const ch = m.P('cheeks'), p = m.P('pipe');
    const puff = e.wind * 0.6 + Math.max(0, sin(t * 2)) * 0.05;
    ch.scale.set(1 + puff, 1 + puff * 0.6, 1 + puff);
    p.rotation.z += -e.wind * 0.12 + e.strike * 0.25 + sin(t * 1.7) * 0.03;
    p.position.x += e.strike * 0.04;
    m.P('cap').rotation.z += sin(t * 2.3) * 0.04 + e.strike * 0.15 - e.wind * 0.06;
    for (const s of SIDES) m.P(s < 0 ? 'armF' : 'armB').rotation.z += e.strike * 0.3;
    for (const s of SIDES) { const l = m.P(s < 0 ? 'legF' : 'legB'); l.rotation.z += e.move * sin(m.gaitT * PI + (s > 0 ? PI : 0)) * 0.6; }
  },
};

export const SHROOM_ARCHES = { puffcap, morel, rootling, caparcher };
