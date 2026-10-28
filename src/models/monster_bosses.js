// Boss archetypes: big, layered voxel builds with custom intros and phase visuals.
import { grid, pk, gl, tone, shadeBody, mirrorZ, spike, crystals, mix } from './monster_kit.js';
import { hash3, clamp, ease } from '../core/math.js';

const sin = Math.sin, cos = Math.cos;

// ============================================================================ OLD RUSTJAW — minecart colossus
const rustjaw = {
  S: 0.09, reach: 0.7, die: 'kneel',
  build(m, md) {
    const rust = (x, y, z) => {
      const n = hash3(x >> 1, y >> 1, z >> 1, 3);
      if (n > 0.86) return tone('#5a3a2a', 0);
      if (n < 0.12) return tone('#b0703a', 0.05);
      return tone(md.body, (y % 4 === 0 ? -0.12 : 0) + (n - 0.5) * 0.1);
    };
    const iron = (x, y, z) => tone(md.belly, (hash3(x, y, z, 5) - 0.5) * 0.12 + (y % 3 === 0 ? -0.08 : 0));
    const rivets = (g, x0, y0, z0, x1, y1, z1) => {
      for (let x = x0; x < x1; x += 3) { g.set(x, y1 - 1, z0, tone('#d8b070', 0)); g.set(x, y1 - 1, z1 - 1, tone('#d8b070', 0)); g.set(x, y0, z0, tone('#d8b070', 0)); }
    };
    // ---- torso: a giant minecart full of ore with a furnace belly
    const t = grid(20, 15, 16);
    t.box(1, 2, 1, 19, 14, 15, rust);
    t.box(0, 12, 0, 20, 15, 16, (x, y, z) => tone(md.body, 0.12)); // rim
    t.box(3, 13, 3, 17, 15, 13, (x, y, z) => (hash3(x, y, z, 9) > 0.7 ? pk('#ffd25e') : hash3(x, y, z, 4) > 0.5 ? tone('#6b6058', 0) : tone('#4a4040', 0))); // ore load
    t.box(2, 0, 3, 18, 2, 13, iron);
    rivets(t, 2, 2, 0, 18, 14, 16);
    // furnace belly
    t.box(0, 4, 4, 1, 10, 12, pk('#2a1a14'));
    for (let y = 5; y < 10; y++) for (let z = 5; z < 11; z++) t.set(0, y, z, (z % 2 === 0) ? tone('#3a3030', 0) : gl(y > 7 ? md.accent : md.eye));
    t.box(0, 3, 3, 1, 4, 13, iron);
    m.part('torso', t, [10, 0, 8], [0, 18, 0]);
    // ---- head: an upturned small cart with headlamp eyes + hinged jaw
    const h = grid(12, 9, 11);
    h.box(0, 2, 0, 12, 9, 11, rust);
    h.box(0, 8, 0, 12, 9, 11, tone(md.body, 0.12));
    h.box(0, 4, 2, 1, 7, 9, pk('#1a100c'));
    for (const z of [3, 7]) { h.box(0, 5, z, 1, 7, z + 2, gl('#fff0b0')); h.set(0, 5, z, gl(md.eye)); }
    h.box(0, 2, 2, 1, 4, 9, gl(md.eye)); // furnace mouth glow
    rivets(h, 1, 2, 0, 12, 9, 11);
    m.part('head', h, [7, 2, 5.5], [-2, 15, 0], 'torso');
    const jaw = grid(12, 3, 11);
    jaw.box(0, 0, 0, 12, 3, 11, rust);
    for (let z = 1; z < 11; z += 2) jaw.set(0, 3, z, pk('#c8c8c8'));
    jaw.box(0, 2, 2, 10, 3, 9, gl(md.eye));
    m.part('jaw', jaw, [11, 2, 5.5], [4, 0, 0], 'head');
    // ---- shoulder gears
    const gear = grid(9, 9, 3);
    gear.ellipsoid(4.5, 4.5, 1.5, 4.6, 4.6, 1.4, (x, y, z) => {
      const a = Math.atan2(y - 4.5, x - 4.5), r = Math.hypot(x - 4.5, y - 4.5);
      if (r > 3.6 && Math.round(a * 4 / Math.PI * 2) % 2) return null;
      if (r < 1.2) return pk('#3a3030');
      return tone(md.accent, r < 2.5 ? 0.1 : -0.1);
    });
    m.part('gearF', gear, [4.5, 4.5, 1.5], [3, 11, -9], 'torso');
    m.twin('gearB', 'gearF', [3, 11, 9]);
    // ---- arms: bent rails + wheel-cluster fists
    const arm = grid(7, 20, 7);
    for (const z of [2, 4]) arm.box(3, 6, z, 4, 20, z + 1, (x, y) => tone('#9aa0a8', y % 2 ? 0 : -0.08));
    for (let y = 7; y < 20; y += 3) arm.box(2, y, 1, 5, y + 1, 6, tone('#6a4a2a', 0));
    arm.ellipsoid(3.5, 3.5, 3.5, 3.6, 3.6, 3.4, (x, y, z) => (Math.hypot(x - 3.5, z - 3.5) > 2.4 ? tone('#5a5a62', 0.02) : tone(md.accent, -0.1)));
    arm.box(1, 2, 0, 6, 5, 7, (x, y, z) => (hash3(x, y, z, 2) > 0.5 ? tone('#6b6058', 0.05) : null));
    m.part('armF', arm, [3.5, 19, 3.5], [-2, 11, -11], 'torso');
    m.twin('armB', 'armF', [-2, 11, 11]);
    // ---- legs: girder thighs on cart-wheel boots
    const leg = grid(8, 18, 8);
    leg.box(2, 8, 2, 6, 18, 6, iron);
    for (let y = 9; y < 18; y += 2) { leg.set(2, y, 2, tone('#d8b070', 0)); leg.set(5, y, 5, tone('#d8b070', 0)); }
    leg.box(0, 2, 0, 8, 9, 8, rust);
    for (const [x, z] of [[1, -0.5], [6, -0.5], [1, 7.5], [6, 7.5]]) leg.ellipsoid(x + 0.5, 2, z + 0.5, 1.8, 1.8, 0.8, tone('#3a3a40', 0));
    leg.box(0, 0, 0, 8, 1, 8, tone('#2a2a30', 0));
    m.part('legF', leg, [4, 18, 4], [0, 2, -5], 'torso');
    m.twin('legB', 'legF', [0, 2, 5]);
    // ---- smokestack
    const stack = grid(5, 9, 5);
    stack.cylinderY(2.5, 2.5, 0, 9, 2.2, 2.6, (x, y) => tone('#3a3a40', y > 7 ? 0.1 : 0));
    stack.box(1, 8, 1, 4, 9, 4, gl(md.accent));
    m.part('stack', stack, [2.5, 0, 2.5], [7, 14, 3], 'torso');
    m.emitter({ pos: [0.6, 3.25, 0.3], rate: 14, vel: [0.25, 1.2, 0], spread: 0.35, life: [0.6, 1.4], size: [1, 2], color: ['#ffb84a', '#ff6a1a', '#ffe08a'], glow: 3, drag: 0.6 });
    m.emitter({ pos: [-0.95, 1.95, 0], rate: 6, vel: [-0.3, 0.2, 0], spread: 0.25, posSpread: [0, 0.2, 0.3], life: [0.3, 0.8], size: 1, color: ['#ff6a1a', '#ffd25e'], glow: 3, gravity: 1.5 });
    m.points({ hit: [-0.9, 2.3, 0], mouth: [-0.9, 3.15, 0], cuts: [[-0.4, 3.3, 0], [-0.9, 2.2, 0], [0, 2.8, -1], [0, 2.8, 1], [0, 1.2, -0.5], [0.4, 2.2, 0]] });
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

// ============================================================================ QUEEN GEODESSA — crystal spider queen
const geodessa = {
  S: 0.09, reach: 0.8, die: 'flatten',
  build(m, md) {
    const cr = md.crystals || md.accent;
    const a = grid(28, 22, 24);
    a.ellipsoid(17, 10, 12, 10.5, 8.6, 9.4, shadeBody(md.body, 10, 8.6, 12, 9.4, { belly: md.belly, bellyY: -0.35, noise: 0.08 }));
    for (let y = 12; y < 18; y++) { const w = Math.abs(y - 15) * 0.8 + 0.6; a.box(17 - w, y, 11, 18 + w, y + 1, 13, gl(md.eye)); }
    m.part('abdomen', a, [12, 0, 12], [4, 4, 0]);
    // crystal armour (shed in phase 2)
    const ar = grid(28, 30, 24);
    crystals(ar, 15, 16, 12, cr, 6, 9, 1); crystals(ar, 21, 15, 8, cr, 4, 7, 2); crystals(ar, 21, 15, 16, cr, 4, 7, 3);
    crystals(ar, 11, 15, 6, '#7affff', 3, 5, 4); crystals(ar, 11, 15, 18, '#7affff', 3, 5, 5); crystals(ar, 25, 11, 12, cr, 3, 6, 6);
    m.part('armor', ar, [12, 0, 12], [4, 4, 0]);
    const c = grid(16, 14, 14);
    c.ellipsoid(8, 6, 7, 7, 5, 6, shadeBody(md.body, 6, 5, 7, 6, { belly: md.belly }));
    for (const [y, z] of [[8, 4], [8, 10], [9, 6], [9, 8], [7, 3], [7, 11], [10, 5], [10, 9]]) { c.set(1, y, z, gl(md.eye)); }
    c.set(1, 9, 6, gl('#ffffff')); c.set(1, 9, 8, gl('#ffffff'));
    // tiara
    for (let i = 0; i < 5; i++) spike(c, 5 + i, 10, 3 + i * 2, 0.1, 1, 0, 2 + (i === 2 ? 3 : i % 2), 0.8, (k) => gl(k > 0.5 ? '#ffffff' : cr));
    m.part('ceph', c, [12, 4, 7], [-13, 4, 0], 'abdomen');
    const fang = grid(4, 7, 3);
    fang.line(2, 6, 1, 1, 0, 1, 0.8, (x, y) => (y < 2 ? gl(cr) : tone(md.body, -0.1)));
    m.part('fangF', fang, [2, 6, 1], [-10, 1, -2], 'ceph');
    m.twin('fangB', 'fangF', [-10, 1, 2]);
    // legs: femur (up/out) + tibia (down) with crystal tips
    const fem = grid(4, 17, 4);
    fem.line(2, 0, 2, 2, 16, 2, 1.3, (x, y) => tone(md.body, y > 13 ? 0.12 : 0));
    for (let y = 3; y < 16; y += 4) fem.set(0, y, 2, gl(cr));
    const tib = grid(4, 27, 4);
    tib.line(2, 26, 2, 2, 3, 2, 1, (x, y) => tone(y % 6 === 0 ? md.belly : md.body, 0.05));
    spike(tib, 2, 3, 2, 0, -1, 0, 3, 1, (k) => gl(k > 0.5 ? '#ffffff' : cr));
    const ang = [-0.9, -0.35, 0.3, 0.85];
    ang.forEach((ay, i) => {
      for (const side of [1, -1]) {
        const n = (side > 0 ? 'l' : 'r') + i;
        m.part(n, fem, [2, 0, 2], [-10 + i * 3.5, 7, side * 5], 'abdomen', { rot: [side * 0.62, side * -ay, 0], order: 'YXZ' });
        m.part(n + 't', tib, [2, 26, 2], [0, 16, 0], n, { rot: [side * -1.55, 0, 0] });
      }
    });
    const thread = grid(1, 40, 1);
    thread.box(0, 0, 0, 1, 40, 1, pk('#e8e8ff'));
    m.part('thread', thread, [0.5, 0, 0.5], [0, 18, 0], 'abdomen');
    m.emitter({ pos: [0.6, 2.4, 0], rate: 8, vel: [0, 0.4, 0], spread: 0.3, posSpread: [0.8, 0.4, 0.8], life: [0.8, 1.6], size: 1, color: [cr, '#7affff', '#ffffff'], glow: 2.6 });
    m.points({ hit: [-0.6, 1.4, 0], mouth: [-1.85, 1.0, 0], cuts: [[-1.2, 1.2, 0], [0.4, 1.8, 0], [1.2, 1.4, 0], [0, 1.0, -1.0], [0.6, 0.9, 1.0], [-0.5, 0.5, 0.8]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    for (let i = 0; i < 4; i++) {
      const ph = t * 3 + i * 1.7;
      m.P('l' + i).rotation.x += sin(ph) * 0.08; m.P('r' + i).rotation.x -= sin(ph + 2) * 0.08;
      if (i < 2) {
        m.P('l' + i).rotation.z += e.wind * 0.9 - e.strike * 0.9 + e.multi * sin(t * 16 + i) * 0.5;
        m.P('r' + i).rotation.z += e.wind * 0.9 - e.strike * 0.9 + e.multi * sin(t * 16 + i + 1) * 0.5;
      }
    }
    m.P('fangF').rotation.z += -(e.strike + e.roar) * 0.6 + sin(t * 4) * 0.1;
    m.P('fangB').rotation.z += -(e.strike + e.roar) * 0.6 + sin(t * 4 + 1) * 0.1;
    m.P('ceph').rotation.z += -e.wind * 0.25 + e.strike * 0.3 - e.roar * 0.3;
    m.P('abdomen').rotation.z += sin(t * 1.4) * 0.03 + e.special * 0.1;
    m.P('abdomen').position.y += sin(t * 1.4) * 0.03;
    m.P('thread').scale.y = Math.max(0.001, 1 - m.env.intro) * 1;
  },
  intro(m, k) { m.root.position.y += (1 - ease.outCubic(k)) * 6; m.root.rotation.y += (1 - k) * 0.8 * sin(k * 6); },
  phase(m, n) { if (n >= 2) { m.P('armor').visible = false; } },
  onDie(m) { m.P('thread').visible = false; },
};

// ============================================================================ MOTHER MYCEL — mushroom titan
const mycel = {
  S: 0.1, reach: 0.6, die: 'sink',
  build(m, md) {
    const trunk = grid(18, 30, 18);
    trunk.cylinderY(9, 9, 0, 30, 8, 6, (x, y, z) => {
      const a = Math.atan2(z - 9, x - 9);
      const fib = Math.round(a * 5) % 2 === 0;
      return tone(md.body, (y - 15) * 0.01 + (fib ? -0.06 : 0.03) + (hash3(x, y, z, 2) > 0.92 ? -0.1 : 0));
    });
    // face: hollow eyes + mouth
    for (const z of [5, 11]) { trunk.ellipsoid(2, 20, z + 1, 1.6, 2, 1.6, pk('#1a120c')); trunk.box(1, 20, z, 2, 22, z + 2, gl(md.eye)); }
    trunk.ellipsoid(1.5, 13, 9, 1.8, 3.2, 3.2, pk('#120a08'));
    trunk.box(1, 12, 8, 2, 14, 10, gl(md.accent));
    // little mushrooms on trunk
    for (const [y, z, c] of [[8, 2, '#e0a04a'], [17, 16, md.accent], [24, 3, md.cap || md.accent], [5, 15, '#5af0c8']]) {
      trunk.ellipsoid(4, y, z, 1.8, 0.9, 1.8, gl(c)); trunk.set(4, y - 1, z, tone(md.belly, 0));
    }
    m.part('trunk', trunk, [9, 0, 9], [0, 3, 0]);
    const cap = grid(36, 14, 36);
    const capCol = md.cap || '#d04a8a';
    cap.ellipsoid(18, 1, 18, 17.6, 12, 17.6, (x, y, z) => {
      if (y < 2) return tone(md.belly, -0.2 + ((x + z) % 3 === 0 ? -0.1 : 0));
      const cell = hash3(Math.floor(x / 4), 0, Math.floor(z / 4), 4);
      if (cell > 0.5 && x % 4 < 2 && z % 4 < 2 && y > 4) return gl(md.accent);
      return tone(capCol, (y - 6) * 0.03 + (hash3(x, y, z, 6) > 0.9 ? -0.08 : 0));
    });
    for (const [x, z, c] of [[9, 10, '#ffe08a'], [26, 24, md.accent], [20, 6, '#ffe08a']]) { cap.cylinderY(x, z, 9, 13, 0.9, 0.9, pk('#e8d8b8')); cap.ellipsoid(x, 13, z, 2.4, 1.2, 2.4, gl(c)); }
    m.part('cap', cap, [18, 0, 18], [0, 29, 0], 'trunk');
    // bloom (phase 2): extra glowing caps
    const bloom = grid(36, 18, 36);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = 9 + (i % 3) * 3;
      const x = 18 + cos(a) * r, z = 18 + sin(a) * r, h = 10 + (i % 4);
      bloom.cylinderY(x, z, 6, h, 0.8, 0.8, pk('#f0e0c0'));
      bloom.ellipsoid(x, h, z, 2.2, 1.1, 2.2, gl(i % 2 ? '#ffe08a' : md.accent));
    }
    m.part('bloom', bloom, [18, 0, 18], [0, 0, 0], 'cap');
    m.P('bloom').visible = false;
    // root arms
    const arm = grid(8, 24, 8);
    arm.line(4, 23, 4, 4, 6, 4, 1.8, (x, y) => tone(md.belly, (y % 5 === 0 ? -0.1 : 0)));
    for (const [dx, dz, c] of [[0, 0, md.accent], [2, -2, '#ffe08a'], [-2, 2, capCol]]) { arm.line(4, 6, 4, 4 + dx, 2, 4 + dz, 0.8, () => tone(md.belly, 0)); arm.ellipsoid(4 + dx, 2, 4 + dz, 2, 1, 2, gl(c)); }
    m.part('armF', arm, [4, 23, 4], [-2, 20, -9], 'trunk', { rot: [0.25, 0, 0] });
    m.part('armB', arm, [4, 23, 4], [-2, 20, 9], 'trunk', { rot: [-0.25, 0, 0] });
    // root feet
    const roots = grid(34, 5, 34);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.3; roots.line(17, 4, 17, 17 + cos(a) * 15, 0, 17 + sin(a) * 15, 1.4 - (i % 2) * 0.4, () => tone(md.belly, -0.1)); }
    m.part('roots', roots, [17, 0, 17], [0, 0, 0]);
    m.emitter({ pos: [0, 3.6, 0], rate: 22, vel: [0, 0.25, 0], spread: 0.35, posSpread: [1.6, 0.3, 1.6], life: [2, 4], size: [1, 2], color: [md.accent, '#ffe08a', '#ffffff'], glow: 1.8, gravity: -0.05, drag: 0.4 });
    m.points({ hit: [-0.8, 2.2, 0], mouth: [-0.85, 1.6, 0], cuts: [[-0.8, 1.4, 0], [-0.8, 2.4, 0.4], [0, 3.3, -1.2], [0, 3.6, 1.2], [-0.6, 0.6, -0.4], [0, 2.0, 1.0]] });
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
  S: 0.1, reach: 0.6, die: 'kneel',
  build(m, md) {
    const goldf = (x, y, z) => tone(md.body, (y - 8) * 0.012 + ((x + y * 2 + z) % 9 === 0 ? 0.12 : 0) + (hash3(x, y, z, 3) > 0.9 ? -0.08 : 0));
    const stone = (x, y, z) => tone('#6a5e4c', (hash3(x >> 1, y, z >> 1, 2) - 0.5) * 0.14);
    // pedestal
    const ped = grid(22, 7, 20);
    ped.box(0, 0, 0, 22, 7, 20, stone);
    ped.box(1, 6, 1, 21, 7, 19, tone('#7a6e5a', 0.08));
    for (let x = 2; x < 20; x += 3) ped.set(x, 3, 0, gl(md.accent));
    ped.box(0, 2, 6, 1, 5, 14, (x, y, z) => ((y + z) % 3 === 0 ? gl(md.accent) : tone('#5a5040', 0)));
    m.part('pedestal', ped, [11, 0, 10], [0, 0, 0]);
    // robe/skirt
    const skirt = grid(18, 12, 16);
    skirt.cylinderY(9, 8, 0, 12, 8.6, 6.4, (x, y, z) => ((x + z) % 4 === 0 ? tone(md.body, -0.12) : goldf(x, y, z)));
    m.part('skirt', skirt, [9, 0, 8], [0, 7, 0]);
    // torso
    const t = grid(20, 16, 14);
    t.box(3, 0, 2, 17, 4, 12, goldf);
    t.box(1, 4, 1, 19, 16, 13, goldf);
    t.box(0, 6, 3, 1, 14, 11, goldf);
    for (let y = 6; y < 14; y += 2) t.box(0, y, 5, 1, y + 1, 9, gl(md.accent));
    t.box(0, 9, 6, 1, 11, 8, gl('#ffffff'));
    t.box(0, 1, 3, 1, 3, 11, tone('#5a3a2a', 0)); t.set(0, 2, 7, gl('#ff4a6a'));
    m.part('torso', t, [10, 0, 7], [0, 11, 0], 'skirt');
    // cracks overlay (phase 2)
    const cr = grid(22, 18, 16);
    const crack = (x0, y0, z0, n, seed) => { let x = x0, y = y0, z = z0; for (let i = 0; i < n; i++) { cr.set(x, y, z, gl(md.eye)); y += hash3(i, seed, 0) > 0.4 ? -1 : 0; z += Math.round(hash3(i, seed, 1) * 2 - 1); } };
    crack(0, 15, 6, 12, 1); crack(0, 12, 10, 9, 2); crack(0, 8, 4, 7, 3);
    m.part('cracks', cr, [11, 0, 8], [-1, 0, 0], 'torso');
    m.P('cracks').visible = false;
    // head with crown + great rune eye
    const h = grid(11, 14, 11);
    h.box(1, 0, 1, 10, 9, 10, goldf);
    h.box(0, 2, 2, 1, 8, 9, pk('#1a120c'));
    h.box(0, 3, 3, 1, 7, 8, gl(md.accent)); h.box(0, 4, 4, 1, 6, 7, gl('#ffffff'));
    h.box(0, 8, 1, 11, 10, 10, tone(md.body, 0.15));
    for (const [x, z, n] of [[1, 1, 3], [5, 1, 5], [9, 1, 3], [1, 9, 3], [5, 9, 5], [9, 9, 3], [1, 5, 4], [9, 5, 4]]) spike(h, x, 10, z, 0, 1, 0, n, 0.7, (k) => (k > 0.7 ? gl('#ffe08a') : tone(md.body, 0.2)));
    h.set(0, 10, 5, gl('#ff4a6a'));
    m.part('head', h, [5.5, 0, 5.5], [-1, 16, 0], 'torso');
    // pauldrons
    const pd = grid(10, 8, 9);
    pd.ellipsoid(5, 4, 4.5, 5, 3.8, 4.4, goldf);
    pd.box(0, 2, 2, 1, 6, 7, gl(md.accent));
    m.part('padF', pd, [5, 4, 4.5], [0, 14, -9], 'torso');
    m.twin('padB', 'padF', [0, 14, 9]);
    // arms
    const arm = grid(7, 18, 7);
    arm.box(1, 4, 1, 6, 18, 6, goldf);
    arm.box(0, 0, 0, 7, 6, 7, goldf);
    for (let y = 8; y < 16; y += 3) arm.box(0, y, 2, 1, y + 1, 5, gl(md.accent));
    m.part('armF', arm, [3.5, 17, 3.5], [0, 12, -11], 'torso');
    m.twin('armB', 'armF', [0, 12, 11]);
    // scepter
    const sc = grid(9, 40, 9);
    sc.box(4, 0, 4, 5, 32, 5, (x, y) => tone(md.body, y % 6 === 0 ? 0.2 : -0.05));
    sc.ellipsoid(4.5, 34, 4.5, 3.4, 3.4, 3.4, (x, y, z, d) => (d < 0.45 ? gl('#ffffff') : gl(md.accent)));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; spike(sc, 4.5 + cos(a) * 3, 31, 4.5 + sin(a) * 3, cos(a) * 0.3, 1, sin(a) * 0.3, 5, 0.6, () => tone(md.body, 0.15)); }
    m.part('scepter', sc, [4.5, 6, 4.5], [0, -2, -1], 'armF', { rot: [0, 0, 0.15] });
    m.emitter({ pos: [-0.55, 5.6, -1.2], rate: 6, vel: [0, 0.4, 0], spread: 0.3, life: [0.6, 1.4], size: 1, color: [md.accent, '#ffffff'], glow: 3 });
    m.emitter({ pos: [0, 0.8, 0], rate: 4, vel: [0, 0.2, 0], spread: 0.15, posSpread: [1.1, 0, 1.0], life: [1, 2], size: 1, color: '#e8d8a8', glow: 1.2 });
    m.points({ height: 4.6, hit: [-0.8, 3.0, 0], mouth: [-0.75, 3.35, 0], cuts: [[-0.8, 2.4, 0], [-0.7, 3.3, 0], [0, 3.2, -1.1], [0, 3.2, 1.1], [-0.6, 1.4, 0.5], [-0.3, 1.9, -0.6]] });
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
    m.root.position.y += 0; // statues don't bob
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
  S: 0.1, reach: 0.8, die: 'sink',
  build(m, md) {
    const crust = (r, c) => (x, y, z) => {
      const nx = x - c, ny = y - c, nz = z - c;
      const plate = hash3(Math.floor((x + 1) / 3), Math.floor((y + 1) / 3), Math.floor((z + 1) / 3), 7);
      const seam = (x + 1) % 3 === 0 || (y + 1) % 3 === 0;
      if (ny < -r * 0.45 && Math.abs(nz) < r * 0.6) return seam && plate > 0.4 ? gl(md.belly) : tone(md.belly, -0.15);
      if (seam && plate > 0.7) return gl(plate > 0.9 ? '#fff0a0' : '#ff8a2a');
      if (seam) return tone(md.accent, -0.1);
      return tone(plate > 0.6 ? md.accent : md.body, (ny / r) * 0.12);
    };
    const radii = [7, 6.6, 6.2, 5.8, 5.4, 5, 4.4];
    const offs = [[0, 0, 0], [1, 7, 0], [-1, 7, 0], [-3, 7, 0], [-3, 6, 0], [-1, 5, 0], [1, 4, 0]];
    let parent = 'root';
    radii.forEach((r, i) => {
      const n = Math.ceil(r * 2 + 2), c = n / 2;
      const g = grid(n, n, n);
      g.ellipsoid(c, c, c, r, r, r * 0.85, crust(r, c));
      if (i > 0) for (let k = 0; k < 3; k++) spike(g, c + 2, c + r - 1, c, 0.4, 1, 0, 3, 0.9, () => tone(md.accent, 0.1));
      m.part('s' + i, g, [c, c, c], i === 0 ? [8, 4, 0] : offs[i], parent);
      parent = 's' + i;
    });
    // head
    const h = grid(24, 14, 14);
    h.ellipsoid(14, 7, 7, 8.6, 5.6, 6, crust(6, 7));
    h.ellipsoid(5, 6, 7, 5.6, 3.6, 4.6, crust(4, 7));
    h.box(0, 6, 5, 1, 7, 6, gl('#fff04a')); h.box(0, 6, 8, 1, 7, 9, gl('#fff04a'));
    for (const z of [3, 11]) { h.box(9, 9, z, 12, 11, z + 1, gl(md.eye)); }
    for (const z of [3, 10]) h.line(15, 11, z + 0.5, 23, 14, z < 7 ? -1 : 15, 1, (x, y) => tone(md.accent, (x - 15) * 0.03));
    m.part('head', h, [16, 5, 7], [-4, 6, 0], 's6');
    const jaw = grid(18, 4, 12);
    jaw.box(0, 0, 0, 18, 3, 12, crust(4, 6));
    for (let x = 1; x < 15; x += 2) { jaw.set(x, 3, 1, pk('#fff6e0')); jaw.set(x, 3, 10, pk('#fff6e0')); }
    jaw.box(1, 2, 3, 15, 3, 9, gl('#ffb04a'));
    m.part('jaw', jaw, [16, 2, 6], [0, 1, 0], 'head');
    // fin-wings
    const wing = grid(16, 14, 2);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 16 - y; x++) if (!(y > 4 && x > 14 - y && (x + y) % 3 === 0)) wing.set(x, y, 0, (x + y) % 5 === 0 ? gl('#ff6a1a') : tone(md.body, -0.15));
    m.part('wingL', wing, [0, 0, 1], [2, 3, 5], 's4', { rot: [-0.7, 0.4, 0.5] });
    m.part('wingR', wing, [0, 0, 1], [2, 3, -5], 's4', { rot: [0.7, -0.4, 0.5] });
    // lava pool skirt
    const pool = grid(40, 2, 30);
    pool.ellipsoid(20, 0, 15, 19, 1.5, 14, (x, y, z) => (y === 0 ? (hash3(x, 0, z, 3) > 0.8 ? gl('#fff0a0') : gl(hash3(x >> 1, 0, z >> 1, 4) > 0.5 ? '#ff6a1a' : '#ff3a10')) : null));
    m.part('pool', pool, [20, 0, 15], [8, 0, 0]);
    m.emitter({ pos: [0.6, 1.5, 0], rate: 26, vel: [0, 1.2, 0], spread: 0.6, posSpread: [1.4, 1.2, 0.8], life: [0.5, 1.4], size: [1, 2], color: ['#ffd04a', '#ff6a1a', '#fff0a0'], glow: 3, drag: 0.5 });
    m.emitter({ pos: [-1.3, 4.0, 0], rate: 5, vel: [-0.2, -0.5, 0], spread: 0.2, life: [0.5, 1], size: 2, color: ['#ffb04a', '#ff6a1a'], glow: 3, gravity: 6 });
    m.points({ height: 4.8, hit: [-0.9, 3.9, 0], mouth: [-2.0, 4.3, 0], cuts: [[-0.6, 4.2, 0], [0.4, 3.0, 0], [0.9, 2.0, 0], [0.8, 1.0, 0.4], [-0.2, 3.6, 0.5], [0.5, 2.6, -0.5]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    for (let i = 0; i < 7; i++) {
      const p = m.P('s' + i);
      p.rotation.z += sin(t * 1.6 - i * 0.7) * 0.07 + (i >= 4 ? -e.wind * 0.12 + e.strike * 0.2 : 0);
      p.rotation.x += sin(t * 1.1 - i * 0.5) * 0.04;
    }
    m.P('head').rotation.z += -e.wind * 0.3 + e.strike * 0.45 - e.roar * 0.4;
    m.P('jaw').rotation.z += -(0.08 + Math.max(0, sin(t * 1.8)) * 0.08 + e.roar * 0.7 + e.strike * 0.4 + e.multi * Math.abs(sin(t * 10)) * 0.6 + e.special * 0.6);
    m.P('wingL').rotation.x += -sin(t * 3) * 0.25 - e.roar * 0.4; m.P('wingR').rotation.x += sin(t * 3) * 0.25 + e.roar * 0.4;
  },
  intro(m, k) { const r = m.root; r.position.y -= (1 - ease.outCubic(k)) * m.height; m.P('pool').position.y += (1 - ease.outCubic(k)) * m.height; },
};

// ============================================================================ THE CURSED LORD
const cursedlord = {
  S: 0.1, reach: 0.7, die: 'kneel',
  build(m, md) {
    const robe = (x, y, z) => tone(md.body, (y - 20) * 0.006 + ((x * 2 + z) % 7 === 0 ? -0.1 : 0) + (hash3(x, y, z, 3) > 0.93 ? 0.08 : 0));
    // cloak: tall flared cone with tattered hem
    const cl = grid(24, 30, 22);
    cl.cylinderY(12, 11, 0, 30, 10.8, 6.5, (x, y, z) => {
      const a = Math.atan2(z - 11, x - 12);
      if (y < 5 && Math.round(a * 4 + y * 0.7) % 3 === 0) return null;
      if (x < 9 && y > 4 && Math.abs(z - 11) < 2) return tone(md.belly, 0);
      return robe(x, y, z);
    });
    for (let y = 6; y < 28; y += 3) cl.set(Math.round(12 - 10.8 + (y / 30) * 4.2), y, 11, gl(md.accent));
    m.part('cloak', cl, [12, 0, 11], [0, 0, 0]);
    // armoured chest
    const ch = grid(16, 12, 14);
    ch.box(1, 0, 1, 15, 12, 13, (x, y, z) => tone(md.belly, (y - 6) * 0.03 + ((x + y) % 4 === 0 ? 0.08 : 0)));
    for (let y = 2; y < 11; y++) ch.set(0, y, 7, gl(md.accent));
    ch.box(0, 5, 4, 1, 6, 11, gl(md.accent));
    ch.ellipsoid(0.5, 7, 7, 1, 1.5, 1.5, gl('#ffffff'));
    m.part('chest', ch, [8, 0, 7], [0, 28, 0], 'cloak');
    // pauldrons with spikes + chains
    const pd = grid(10, 12, 9);
    pd.ellipsoid(5, 4, 4.5, 5, 4, 4.4, (x, y, z) => tone('#3a3448', (y - 4) * 0.05));
    for (let i = 0; i < 3; i++) spike(pd, 3 + i * 2, 7, 4.5, 0.15, 1, 0, 3 + (i % 2) * 2, 0.8, () => tone('#5a5068', 0.1));
    for (let y = 0; y < 4; y++) pd.set(2, -0 + y, 1, tone('#8a8a9a', y % 2 ? -0.2 : 0.1));
    m.part('padF', pd, [5, 4, 4.5], [0, 10, -9], 'chest');
    m.twin('padB', 'padF', [0, 10, 9]);
    const chain = grid(2, 20, 2);
    for (let y = 0; y < 20; y++) chain.set(y % 2, y, y % 2, tone('#7a7a8a', y % 2 ? -0.15 : 0.1));
    m.part('chainF', chain, [1, 20, 1], [-1, 0, -1], 'padF');
    m.part('chainB', chain, [1, 20, 1], [1, 0, 1], 'padB');
    // skull head + crown
    const h = grid(11, 16, 11);
    h.ellipsoid(5.5, 5, 5.5, 4.6, 5, 4.4, (x, y, z) => tone('#d8d0e0', (y - 5) * 0.03));
    h.box(0, 4, 2, 2, 7, 4, pk('#06040a')); h.box(0, 4, 7, 2, 7, 9, pk('#06040a'));
    h.set(0, 5, 3, gl(md.eye)); h.set(0, 5, 8, gl(md.eye)); h.set(0, 6, 3, gl(md.eye)); h.set(0, 6, 8, gl(md.eye));
    h.box(0, 1, 3, 1, 3, 8, (x, y, z) => (z % 2 ? pk('#f0e8f0') : pk('#2a1a2a')));
    h.set(0, 3, 5, pk('#2a1a2a'));
    // crown
    h.box(1, 8, 1, 10, 10, 10, (x, y, z) => tone('#e0b040', y === 9 ? 0.1 : -0.05));
    for (const [x, z, n] of [[1, 1, 4], [5, 1, 3], [9, 1, 4], [1, 9, 4], [5, 9, 3], [9, 9, 4], [1, 5, 5], [9, 5, 3]]) spike(h, x, 10, z, 0, 1, 0, n, 0.6, (k) => (k > 0.8 ? gl(md.accent) : tone('#e0b040', 0.12)));
    for (const z of [3, 7]) h.set(0, 9, z, gl(md.accent));
    h.set(0, 9, 5, gl(md.eye));
    m.part('head', h, [5.5, 0, 5.5], [-1, 12, 0], 'chest');
    // arms
    const arm = grid(6, 18, 6);
    arm.box(1, 3, 1, 5, 18, 5, (x, y, z) => tone('#3a3448', (y % 4 === 0 ? 0.1 : 0)));
    arm.box(0, 0, 0, 6, 4, 6, tone('#d8d0e0', -0.1));
    for (let f = 0; f < 3; f++) arm.line(1 + f * 2, 0, 0, 1 + f * 2, -0.5, -0.5, 0.4, () => tone('#d8d0e0', 0));
    m.part('armF', arm, [3, 17, 3], [0, 9, -10], 'chest');
    m.twin('armB', 'armF', [0, 9, 10]);
    // the Hollow Blade
    const bl = grid(9, 44, 5);
    bl.box(4, 0, 2, 5, 8, 3, tone('#2a1a2a', 0));
    bl.box(0, 8, 1, 9, 10, 4, tone('#e0b040', 0));
    bl.set(4, 9, 0, gl(md.eye));
    for (let y = 10; y < 43; y++) {
      const w = y > 37 ? Math.max(0, 43 - y) * 0.45 : 2.5;
      bl.box(4.5 - w, y, 2, 4.5 + w, y + 1, 3, (x) => ((y % 5 === 0 && Math.abs(x - 4) < 1) ? gl(md.accent) : x === Math.floor(4.5 - w) ? tone('#9a8aaa', 0.15) : tone('#3a3448', 0.05)));
    }
    m.part('blade', bl, [4.5, 4, 2.5], [0, -2, -1], 'armF', { rot: [0, 0, 0.75] });
    m.emitter({ pos: [0, 0.2, 0], rate: 26, vel: [0, 0.9, 0], spread: 0.35, posSpread: [1.1, 0.1, 1.0], life: [0.6, 1.4], size: [1, 2], color: [md.accent, md.eye, '#7a3ab0'], glow: 2.5, drag: 0.6 });
    m.emitter({ pos: [-0.3, 4.6, 0], rate: 6, vel: [0, 0.5, 0], spread: 0.2, posSpread: [0.3, 0.1, 0.3], life: [0.4, 0.9], size: 1, color: [md.eye, md.accent], glow: 3 });
    m.points({ height: 4.9, hit: [-0.75, 3.4, 0], mouth: [-0.6, 4.35, 0], cuts: [[-0.7, 3.2, 0], [-0.55, 4.3, 0], [0, 3.8, -1.0], [0, 3.8, 1.0], [-0.6, 1.6, 0.4], [-0.3, 2.4, -0.6]] });
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

export const BOSS_ARCHES = { rustjaw, geodessa, mycel, warden, pyrrhax, cursedlord };
