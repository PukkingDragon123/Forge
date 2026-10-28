// Normal + elite monster archetypes. Each: { S?, reach?, die?, build(m, md), anim(m, dt), phase?, intro? }
// Grid axes: x = body length (front/head at low x → faces −X), y = up, z = depth.
import { grid, pk, gl, tone, shadeBody, mirrorZ, eye, spike, crystals, mix } from './monster_kit.js';
import { hash3, clamp } from '../core/math.js';

const W = '#fff6e0';
const sin = Math.sin, cos = Math.cos;

/** Vertical limb (pivot at top centre). foot: extra toe voxels toward −x. */
function limb(len, w, d, col, o = {}) {
  const g = grid(w + (o.foot || 0), len + 1, d);
  const f = o.foot || 0;
  g.box(f, 1, 0, f + w, len + 1, d, (x, y, z) => tone(col, (y / len) * 0.12 - 0.04));
  if (o.foot) g.box(0, 0, 0, f + w, 2, d, tone(o.footCol || col, -0.12));
  else g.box(f, 0, 0, f + w, 1, d, tone(o.footCol || col, -0.14));
  if (o.claw) for (let z = 0; z < d; z += 2) g.set(0, 0, z, pk(o.claw));
  g._pivot = [f + w / 2, len + 1, d / 2];
  return g;
}
const legPivot = (g) => g._pivot;

/** Thin bone segment along a polyline (for skeletons, spider legs, fingers). */
function bones(g, pts, col, r = 0.5) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    g.line(a[0], a[1], a[2], b[0], b[1], b[2], r, typeof col === 'function' ? col : () => col);
  }
}

const walk = (m, names, speed, amp, phase = Math.PI) => names.forEach((n, i) => { const p = m.P(n); if (p) p.rotation.z += sin(m.t * speed + i * phase) * amp; });

// ============================================================================ RAT
const rat = {
  reach: 0.32,
  build(m, md) {
    const b = grid(17, 12, 11);
    const sb = shadeBody(md.body, 5, 4.4, 5.5, 4.2, { belly: md.belly, bellyY: -0.35, spots: 0.1, spotColor: md.accent, seed: 2 });
    b.ellipsoid(8.5, 5, 5.5, 6.4, 3.9, 4, sb);
    b.ellipsoid(11.5, 6, 5.5, 4.4, 4.6, 4.2, sb);
    for (let x = 6; x < 15; x += 2) b.set(x, 10 + (x > 9 && x < 13 ? 1 : 0), 5, tone(md.body, -0.12));
    m.part('body', b, [9, 0, 5.5], [0, 0, 0]);
    const h = grid(12, 12, 9);
    const hs = shadeBody(md.body, 5, 3.4, 4.5, 3.2, { belly: md.belly, bellyY: -0.45 });
    h.ellipsoid(7.5, 5, 4.5, 3.8, 3.4, 3.2, hs);
    h.ellipsoid(4.5, 4.4, 4.5, 2.6, 2.4, 2.4, hs);
    h.ellipsoid(2, 3.8, 4.5, 1.9, 1.6, 1.6, hs);
    h.set(0, 4, 4, pk('#ff7a8a')); h.set(0, 4, 5, pk('#ff7a8a')); h.set(0, 5, 4, pk('#ffb0b8'));
    for (const z of [2, 6]) { h.set(5, 6, z, gl(md.eye)); h.set(5, 6, z + 1, gl(md.eye)); h.set(5, 7, z + (z < 4 ? 1 : 0), tone(md.body, -0.25)); }
    h.box(1, 1, 4, 2, 3, 6, pk('#fff6d0'));
    for (const z of [1, 7]) for (let k = 0; k < 2; k++) h.set(1, 4 + k, z + (z < 4 ? -1 : 1), pk('#f0e6d0'));
    for (const z of [1.5, 7.5]) { h.ellipsoid(9, 9.5, z, 1.7, 2.3, 0.9, (x, y, zz) => (Math.abs(zz + 0.5 - z) < 0.6 && x < 10 ? pk('#ff9aaa') : tone(md.body, 0.05))); }
    m.part('head', h, [9, 3, 4.5], [-6, 5, 0], 'body');
    const t = grid(16, 9, 3);
    for (let i = 0; i <= 15; i++) { const y = 1 + sin(i * 0.35) * 2 + i * 0.25; t.set(i, Math.round(y), 1, pk(mix('#d89a9a', md.accent, i / 30))); if (i < 6) t.set(i, Math.round(y) + 1, 1, pk('#c88a8a')); }
    m.part('tail', t, [0, 1, 1], [7, 4, 0], 'body');
    const leg = limb(3, 2, 2, md.body, { foot: 1, footCol: '#d89a9a' });
    m.part('lf', leg, legPivot(leg), [-4, 3, -3], 'body');
    m.twin('lb', 'lf', [4, 3, -3]);
    m.twin('rf', 'lf', [-4, 3, 3]);
    m.twin('rb', 'lf', [4, 3, 3]);
    m.points({ hit: [-0.25, 0.42, 0], mouth: [-0.75, 0.42, 0], cuts: [[-0.45, 0.5, 0], [0, 0.55, 0], [0.25, 0.45, 0], [0.55, 0.35, 0], [-0.1, 0.25, 0]] });
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

// ============================================================================ BAT
const bat = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 0.95;
    const b = grid(11, 15, 10);
    b.ellipsoid(5.5, 5.5, 5, 4.2, 5, 3.9, shadeBody(md.body, 5.5, 5, 5, 3.9, { belly: md.belly, bellyY: -0.1, bellyW: 0.6, noise: 0.12 }));
    // ears
    for (const z of [2.5, 7.5]) { b.line(5, 9, z, 6, 14, z + (z < 5 ? -0.8 : 0.8), 1.1, () => tone(md.body, 0.05)); b.line(5, 10, z, 5.5, 13, z, 0.4, () => pk(md.accent)); }
    eye(b, 1, 6, 3, md.eye); eye(b, 1, 6, 5, md.eye);
    b.set(1, 3, 3, pk(W)); b.set(1, 3, 5, pk(W)); b.set(1, 2, 3, pk(W));
    b.set(4, 0, 3, tone(md.body, -0.3)); b.set(5, 0, 5, tone(md.body, -0.3));
    if (md.crystals) crystals(b, 7, 9, 4, md.crystals, 3, 3, 4);
    if (md.glow) { for (let y = 3; y < 7; y++) for (let z = 3; z < 6; z++) b.set(1 + (y > 5 ? 1 : 0), y, z, gl(md.belly)); }
    m.part('body', b, [5, 5, 4.5], [0, 0, 0]);
    const w = grid(17, 14, 2);
    const tips = [[1, 13], [6, 13], [11, 11], [16, 7]];
    // membrane: fill between consecutive finger rays with a scalloped edge
    for (let y = 0; y < 14; y++) for (let x = 0; x < 17; x++) {
      const a = Math.atan2(y, x - 3), r = Math.hypot(x - 3, y);
      if (a < 0.35 || a > 1.95) continue;
      const k = (a - 0.35) / 1.6; // 0 (back) .. 1 (front)
      const reach = 11 + 3 * Math.sin(k * Math.PI) - 2.5 * Math.abs(Math.sin(k * Math.PI * 3));
      if (r > reach) continue;
      w.set(x, y, 0, tone(md.body, -0.14 + (r > reach - 1 ? -0.08 : 0)));
    }
    for (const [tx, ty] of tips) w.line(3, 0, 0, tx, ty, 0, 0.4, () => pk(md.accent));
    for (const [tx, ty] of tips) { w.set(tx, ty, 1, tone(md.accent, -0.2)); }
    w.line(3, 0, 1, 1, 13, 1, 0.4, () => tone(md.accent, 0.1));
    if (md.crystals) for (const [tx, ty] of tips) { w.set(tx, ty, 1, gl(md.crystals)); w.set(tx, Math.max(0, ty - 1), 1, gl(md.crystals)); }
    if (md.glow) for (let k = 0; k < 7; k++) w.set(4 + k * 1.5, 3 + (k * 5) % 7, 1, gl('#ffb04a'));
    m.part('wingL', w, [3, 0, 1], [1, 3, 3.5], 'body');
    m.part('wingR', w, [3, 0, 1], [1, 3, -3.5], 'body');
    if (md.glow) m.emitter({ pos: [0.05, -0.1, 0], rate: 10, vel: [0.1, -0.4, 0], spread: 0.3, life: [0.4, 0.9], size: 1, color: ['#ffb04a', '#ff6a1a'], gravity: 1, glow: 2.5 });
    if (md.crystals) m.emitter({ pos: [0.1, 0.3, 0], rate: 3, vel: [0, -0.2, 0], spread: 0.2, life: [0.6, 1.2], size: 1, color: md.crystals, glow: 2.5 });
    m.points({ hit: [0, 0.1, 0], mouth: [-0.3, 0, 0], cuts: [[-0.15, 0.15, 0], [0.1, 0, 0], [0, 0.3, 0.3], [0, 0.3, -0.3], [0.05, -0.2, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const sp = 13 + e.strike * 10 + e.multi * 12;
    const flap = sin(t * sp);
    m.P('wingL').rotation.z += flap * 0.85 - 0.15 - e.wind * 0.5;
    m.P('wingR').rotation.z += sin(t * sp - 0.5) * 0.85 - 0.15 - e.wind * 0.5;
    m.P('wingL').rotation.x += -0.25 - Math.max(0, flap) * 0.3; m.P('wingR').rotation.x += 0.25 + Math.max(0, flap) * 0.3;
    m.root.position.y += sin(t * sp) * 0.05 + sin(t * 1.3) * 0.08 - e.strike * 0.25;
    m.root.position.x += sin(t * 0.9) * 0.08;
    m.P('body').rotation.z += e.strike * 0.5;
  },
};

// ============================================================================ SLIME
const slime = {
  reach: 0.38, die: 'flatten',
  build(m, md) {
    const n = grid(18, 14, 16);
    const cy = 4.2;
    const body = (x, y, z) => {
      const ny = (y + 0.5 - cy) / 7;
      if (y === 0) return tone(md.body, -0.25);
      if (md.glow && hash3(x, y, z, 7) > 0.86) return gl(md.belly);
      return tone(md.body, ny * 0.25 + (hash3(x >> 1, y >> 1, z >> 1, 5) - 0.5) * 0.06);
    };
    n.ellipsoid(9, cy, 8, 8.2, 8.6, 7.2, (x, y, z) => (y >= 0 ? body(x, y, z) : null));
    // drippy rim
    for (let x = 1; x < 17; x += 3) n.set(x, 0, hash3(x, 0, 0, 2) > 0.5 ? 2 : 13, tone(md.body, -0.2));
    // highlight
    n.box(5, 10, 4, 7, 11, 6, pk(md.glow ? '#fff4b0' : mix(md.belly, '#ffffff', 0.6)));
    n.set(4, 9, 4, pk(mix(md.belly, '#ffffff', 0.4)));
    // face
    for (const z of [5, 10]) { n.box(1, 6, z, 2, 9, z + 1, pk('#141018')); n.set(1, 8, z + (z < 8 ? 0 : 0), pk('#ffffff')); }
    n.box(1, 4, 7, 2, 5, 9, pk('#2a0e14'));
    if (md.inside === 'copper') {
      for (const [x, y, z] of [[3, 3, 12], [9, 12, 6], [14, 6, 3], [12, 9, 13], [6, 2, 2]]) n.ellipsoid(x, y, z, 1.4, 1.2, 1.3, (a, b2, c) => tone(hash3(a, b2, c, 1) > 0.6 ? '#5fbf9a' : '#c8743a', 0.05));
    }
    if (md.inside === 'gem') {
      for (const [x, y, z] of [[4, 10, 11], [12, 11, 5], [15, 5, 9], [8, 2, 14]]) crystals(n, x, y, z, hash3(x, y, z, 3) > 0.5 ? '#ff9af0' : '#9ae8ff', 2, 2, x);
    }
    if (md.glow) { n.ellipsoid(9, 12, 8, 3, 1.5, 3, gl('#fff0a0')); }
    m.part('body', n, [9, 0, 8]);
    if (md.glow) m.emitter({ pos: [0, 0.75, 0], rate: 7, vel: [0, 0.7, 0], spread: 0.35, life: [0.5, 1.2], size: 1, color: ['#ffd04a', '#ff6a1a', '#fff0a0'], gravity: -0.3, glow: 3 });
    m.points({ hit: [-0.2, 0.45, 0], mouth: [-0.48, 0.3, 0], cuts: [[-0.3, 0.4, 0], [0, 0.7, 0], [0.3, 0.4, 0], [0, 0.2, 0.2], [0.1, 0.5, -0.2]] });
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

// ============================================================================ KOBOLD
const kobold = {
  reach: 0.3,
  build(m, md) {
    const b = grid(9, 10, 8);
    b.ellipsoid(4.5, 5, 4, 3.6, 4.6, 3.5, shadeBody(md.body, 5, 4.6, 4, 3.5, { belly: md.belly, bellyY: -0.6, bellyW: 0.5 }));
    b.box(1, 4, 1, 3, 9, 7, (x, y, z) => (x === 1 ? tone(md.belly, -0.05) : null));
    b.box(2, 2, 0, 8, 4, 8, pk('#6a4a2a')); // belt
    b.set(1, 3, 4, pk('#ffd24a'));
    m.part('body', b, [4.5, 0, 4], [0, 6, 0]);
    const h = grid(12, 12, 9);
    h.ellipsoid(6, 4, 4.5, 3.6, 3.4, 3.4, shadeBody(md.body, 4, 3.4, 4.5, 3.4, {}));
    h.ellipsoid(2.5, 3, 4.5, 2.6, 1.8, 2, shadeBody(md.body, 3, 1.8, 4.5, 2, { belly: md.belly, bellyY: -0.2 }));
    h.set(0, 3, 4, pk('#2a1a14')); h.set(0, 3, 5, pk('#2a1a14'));
    h.set(1, 1, 3, pk(W)); h.set(1, 1, 6, pk(W));
    eye(h, 3, 5, 2, md.eye); eye(h, 3, 5, 7, md.eye);
    for (const z of [1, 8]) h.line(7, 6, z, 10, 9, z < 4 ? -0.5 : 9.5, 0.7, () => tone(md.body, 0.05));
    // mining helmet with lamp
    h.ellipsoid(6, 6.8, 4.5, 3.9, 2.6, 3.9, (x, y) => (y >= 7 ? tone('#c8a040', (y - 7) * 0.05) : null));
    h.box(2, 7, 0, 10, 8, 9, (x, y, z) => (Math.hypot(x - 6, z - 4.5) < 4.6 ? tone('#a07a30', -0.05) : null));
    h.box(2, 8, 4, 3, 10, 6, gl('#fff0a0'));
    m.part('head', h, [6, 1, 4.5], [0.5, 9, 0], 'body');
    const arm = limb(5, 2, 2, md.body, { footCol: md.belly });
    m.part('armF', arm, legPivot(arm), [-1, 8, -4], 'body');
    m.twin('armB', 'armF', [1, 8, 4]);
    // pickaxe in front hand
    const pick = grid(9, 12, 3);
    pick.box(4, 0, 1, 5, 11, 2, (x, y) => tone('#8a5a33', y * 0.01));
    pick.line(0, 9, 1, 8, 11, 1, 0.5, () => tone('#9aa3b2', 0.1));
    pick.set(0, 8, 1, pk('#dfe6ee')); pick.set(8, 10, 1, pk('#5b6170'));
    m.part('pick', pick, [4.5, 1, 1.5], [-1, -6, -1], 'armF', { rot: [0, 0, 0.5] });
    const leg = limb(4, 2, 2, md.body, { foot: 2, footCol: md.belly, claw: '#2a1a14' });
    m.part('legF', leg, legPivot(leg), [-1, 1, -1.5], 'body');
    m.twin('legB', 'legF', [1, 1, 1.5]);
    const tail = grid(9, 5, 3);
    tail.line(0, 3, 1, 8, 0.5, 1, 0.9, (x) => tone(md.body, -0.05));
    m.part('tail', tail, [0, 3, 1], [3, 2, 0], 'body');
    m.points({ hit: [0, 0.75, 0], mouth: [-0.3, 0.75, 0], cuts: [[0, 0.95, 0], [0, 0.5, 0], [-0.15, 0.6, -0.2], [0.25, 0.25, 0], [0, 0.15, 0.1]] });
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

// ============================================================================ BEETLE
const beetle = {
  reach: 0.35, die: 'flatten',
  build(m, md) {
    const b = grid(20, 12, 15);
    const shell = (x, y, z) => {
      if (Math.abs(z + 0.5 - 7.5) < 0.6 && y > 6) return tone(md.body, -0.3);
      if (y > 7 && Math.abs(z + 0.5 - 5) < 1.2 && x > 6 && x < 14) return pk(md.accent); // glossy shine
      return tone(md.body, (y - 6) * 0.04 + (hash3(x, y, z, 4) > 0.9 ? -0.08 : 0));
    };
    b.ellipsoid(11.5, 5, 7.5, 7.5, 6.2, 6.6, (x, y, z) => (y >= 2 ? shell(x, y, z) : null));
    b.box(5, 2, 2, 18, 4, 13, (x, y, z) => (Math.hypot((x - 11.5) / 7, (z - 7.5) / 6) < 1 ? tone(md.belly, 0) : null));
    // head + horn + mandibles
    b.ellipsoid(4.5, 4.5, 7.5, 2.8, 2.6, 3.2, (x, y, z) => tone(md.body, -0.15));
    b.line(3, 6, 7.5, 0, 10, 7.5, 0.9, (x, y) => tone(md.body, y > 9 ? 0.2 : -0.05));
    for (const z of [5, 10]) { b.line(2, 3, z, 0, 2, z + (z < 7 ? 1 : -1), 0.5, () => tone('#2a2a2a', 0)); }
    eye(b, 2, 5, 5, md.eye); eye(b, 2, 5, 10, md.eye);
    m.part('body', b, [11.5, 0, 7.5], [0, 1, 0]);
    const leg = grid(5, 5, 5);
    bones(leg, [[1, 4, 0], [2, 4, 3], [1, 0, 4]], tone('#2a2a3a', 0.05));
    m.part('l0', leg, [1, 4, 0], [-4, 3, 4], 'body');
    m.twin('l1', 'l0', [0, 3, 4]); m.twin('l2', 'l0', [4, 3, 4]);
    const legR = mirrorZ(leg);
    m.part('r0', legR, [1, 4, 4], [-4, 3, -4], 'body');
    m.twin('r1', 'r0', [0, 3, -4]); m.twin('r2', 'r0', [4, 3, -4]);
    m.points({ hit: [-0.1, 0.55, 0], mouth: [-0.65, 0.3, 0], cuts: [[-0.45, 0.4, 0], [0, 0.75, 0], [0.4, 0.55, 0], [-0.1, 0.35, 0.35], [0.2, 0.3, -0.35]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    walk(m, ['l0', 'r1', 'l2', 'r0', 'l1', 'r2'], 16, 0.25 * (0.3 + e.strike + e.multi), 2.1);
    if (e.multi > 0.05) m.root.rotation.y += m.st * 22 * e.multi;
    m.P('body').position.y += e.wind * -0.04;
  },
};

// ============================================================================ MOLE (Burrow Brute)
const mole = {
  reach: 0.5,
  build(m, md) {
    const b = grid(20, 18, 18);
    b.ellipsoid(10.5, 8, 9, 8.4, 8, 8, shadeBody(md.body, 8, 8, 9, 8, { belly: md.belly, bellyY: -0.15, bellyW: 0.55, noise: 0.12 }));
    // fur tufts
    for (let i = 0; i < 12; i++) { const x = 6 + (i % 4) * 3, z = 4 + Math.floor(i / 4) * 5; b.set(x, 16, z, tone(md.body, 0.08)); }
    // snout + star nose
    b.ellipsoid(2.6, 8, 9, 2.6, 2.4, 2.4, tone(md.body, 0.04));
    for (const [dy, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) b.set(0, 8 + dy, 9 + dz, pk(dy === 0 && dz === 0 ? '#ff7a9a' : '#e08a9a'));
    b.set(3, 10, 6, pk('#1a0a0a')); b.set(3, 10, 12, pk('#1a0a0a'));
    b.set(3, 11, 6, gl('#ff5a3a')); b.set(3, 11, 12, gl('#ff5a3a'));
    m.part('body', b, [10.5, 0, 9], [0, 2, 0]);
    const arm = grid(9, 9, 6);
    arm.ellipsoid(5, 6, 3, 3, 3, 2.6, shadeBody(md.body, 6, 3, 3, 2.6, {}));
    arm.ellipsoid(3, 3, 3, 2.6, 2, 2.6, tone(md.belly, 0));
    for (let c = 0; c < 3; c++) arm.line(2.5, 2, 1 + c * 2, -0.4, 0, 1 + c * 2, 0.6, (x) => pk(x < 1 ? '#fff6e0' : md.accent));
    m.part('clawF', arm, [5, 7, 3], [-6, 8, -6], 'body');
    m.twin('clawB', 'clawF', [-5, 8, 6]);
    const leg = limb(3, 3, 3, md.body, { foot: 1, footCol: md.belly });
    m.part('legF', leg, legPivot(leg), [3, 2, -4], 'body');
    m.twin('legB', 'legF', [3, 2, 4]);
    m.points({ hit: [-0.2, 0.75, 0], mouth: [-0.65, 0.6, 0], cuts: [[-0.4, 0.6, 0], [0, 0.95, 0], [0.35, 0.6, 0], [-0.55, 0.45, -0.3], [0.1, 0.3, 0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('clawF').rotation.z += -e.wind * 1.6 + e.strike * 1.9 + sin(t * 2) * 0.1 + e.multi * sin(t * 18) * 0.9;
    m.P('clawB').rotation.z += -e.wind * 1.3 + e.strike * 1.4 + sin(t * 2 + 1) * 0.1;
    m.P('body').rotation.z += sin(t * 1.6) * 0.03;
    walk(m, ['legF', 'legB'], 6, 0.12);
  },
};

// ============================================================================ GOLEM (crystal / rune / basalt / bones)
const golem = {
  reach: 0.45,
  build(m, md) {
    const stone = (x, y, z) => {
      if (md.bones) {
        if ((y % 3 === 0) && x > 2) return pk('#efe6d0');
        return tone(hash3(x, y, z, 2) > 0.5 ? md.body : '#c8c0b0', -0.05);
      }
      if (md.glow && hash3(x, y, z, 11) > 0.94) return gl(md.accent);
      // masonry: chunky plates with darker seams
      const ox = (y >> 2) % 2 ? 2 : 0;
      const seam = (x + ox) % 4 === 0 || y % 4 === 0;
      const plate = hash3((x + ox) >> 2, y >> 2, z >> 2, 6);
      if (seam) return md.glow && plate > 0.6 ? gl(md.accent) : tone(md.body, -0.2);
      return tone(md.body, (y - 7) * 0.02 + (plate - 0.5) * 0.22 + (hash3(x, y, z, 1) > 0.9 ? 0.06 : 0));
    };
    const t = grid(16, 16, 13);
    // tapered boulder torso: narrow waist, broad shoulders, hunched forward
    t.ellipsoid(8, 9, 6.5, 6.6, 7, 6, stone);
    t.ellipsoid(8.5, 3, 6.5, 4.6, 3.6, 4.4, stone);
    for (const z of [2, 11]) t.ellipsoid(8, 12, z, 4, 3.4, 2.6, (x, y, zz) => tone(md.body, 0.06 + (hash3(x >> 1, y >> 1, zz, 8) - 0.5) * 0.12));
    t.box(3, 0, 3, 13, 2, 10, (x, y, z) => tone(md.belly, -0.05));
    if (md.runes) for (let y = 5; y < 13; y++) { t.set(1 + (y > 9 ? 1 : 0), y, 6 + (y % 3 === 0 ? 1 : 0), gl(md.runes)); if (y % 4 === 0) t.box(1, y, 4, 2, y + 1, 9, gl(md.runes)); }
    if (md.glow) for (let y = 3; y < 14; y++) t.set(1 + Math.round(Math.abs(y - 9) * 0.3), y, 6 + Math.round(sin(y) * 1.5), gl(md.accent));
    if (md.bones) {
      for (let y = 5; y < 13; y += 2) for (let z = 2; z < 11; z++) t.set(1 + Math.round(Math.abs(z - 6.5) * 0.4), y, z, pk('#efe6d0'));
      t.box(1, 4, 5, 3, 13, 8, pk(md.belly));
      for (const [y, z] of [[12, 3], [7, 10]]) { t.ellipsoid(2, y, z, 1.6, 1.6, 1.6, pk('#efe6d0')); t.set(1, y, z - 1, gl(md.eye)); t.set(1, y, z + 1, gl(md.eye)); }
    }
    if (md.crystals) { crystals(t, 6, 14, 3, md.crystals, 3, 6, 1); crystals(t, 10, 15, 9, md.crystals, 4, 7, 2); crystals(t, 13, 11, 6, md.crystals, 3, 5, 3); crystals(t, 9, 14, 6, '#ffffff', 2, 3, 4); }
    m.part('torso', t, [8, 0, 6.5], [0, 7, 0]);
    const h = grid(8, 8, 8);
    h.box(0, 0, 0, 8, 7, 8, stone);
    h.box(0, 4, 0, 1, 6, 8, (x, y, z) => tone(md.body, 0.1));
    h.box(0, 2, 1, 1, 4, 7, pk('#120c10'));
    h.set(0, 3, 2, gl(md.eye)); h.set(0, 3, 5, gl(md.eye)); h.set(0, 2, 2, gl(md.eye)); h.set(0, 2, 5, gl(md.eye));
    if (md.bones) { h.box(0, 0, 0, 8, 7, 8, pk('#efe6d0')); h.box(0, 2, 1, 1, 5, 7, pk('#141018')); h.set(0, 3, 2, gl(md.eye)); h.set(0, 3, 5, gl(md.eye)); h.box(0, 0, 2, 1, 1, 6, pk('#c8c0b0')); }
    if (md.crystals) crystals(h, 4, 6, 4, md.crystals, 3, 4, 9);
    m.part('head', h, [4, 0, 4], [-4, 12, 0], 'torso');
    const arm = grid(9, 17, 9);
    arm.ellipsoid(4.5, 14, 4.5, 3, 3, 3, stone);
    arm.ellipsoid(4.5, 9, 4.5, 2.4, 4, 2.4, stone);
    arm.ellipsoid(4.5, 3.5, 4.5, 4.2, 3.6, 4.2, stone);
    if (md.runes) for (let y = 7; y < 14; y += 3) arm.box(2, y, 3, 3, y + 1, 6, gl(md.runes));
    if (md.glow) for (let y = 2; y < 6; y++) arm.set(1, y, 4, gl(md.accent));
    if (md.crystals) crystals(arm, 4, 16, 4, md.crystals, 2, 4, 4);
    m.part('armF', arm, [4.5, 15, 4.5], [-1, 11, -9], 'torso');
    m.twin('armB', 'armF', [1, 11, 9]);
    const leg = grid(7, 9, 7);
    leg.ellipsoid(3.5, 4.5, 3.5, 3, 4.4, 3, stone);
    leg.box(0, 0, 1, 6, 2, 6, (x, y, z) => tone(md.body, -0.12));
    m.part('legF', leg, [3.5, 9, 3.5], [0, 2, -3.5], 'torso');
    m.twin('legB', 'legF', [0, 2, 3.5]);
    if (md.glow) m.emitter({ pos: [0, 1.2, 0], rate: 6, vel: [0, 0.6, 0], spread: 0.25, posSpread: [0.3, 0.3, 0.2], life: [0.5, 1.2], size: 1, color: ['#ffb84a', '#ff6a1a'], glow: 2.5 });
    if (md.runes) m.emitter({ pos: [-0.3, 0.9, 0], rate: 3, vel: [0, 0.3, 0], spread: 0.15, posSpread: [0.1, 0.4, 0.3], life: [0.8, 1.6], size: 1, color: md.runes, glow: 2.5 });
    m.points({ hit: [-0.1, 1.05, 0], mouth: [-0.4, 1.3, 0], cuts: [[-0.3, 1.0, 0], [0, 1.35, 0], [-0.3, 0.6, -0.5], [0.2, 0.75, 0.5], [0, 0.35, 0]] });
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

// ============================================================================ CRAB
const crab = {
  reach: 0.35, die: 'flatten',
  build(m, md) {
    const b = grid(16, 12, 18);
    b.ellipsoid(8, 4.5, 9, 6.5, 3.6, 8, shadeBody(md.body, 4.5, 3.6, 9, 8, { belly: md.belly, bellyY: -0.4, bellyW: 0.9 }));
    // geode hat
    b.ellipsoid(9, 8.5, 9, 4, 2.6, 4, (x, y, z) => (y > 7 ? tone('#7a6a5a', (y - 8) * 0.05) : null));
    if (md.crystals) { crystals(b, 9, 10, 9, md.crystals, 5, 4, 7); crystals(b, 6, 8, 5, md.crystals, 2, 2, 2); crystals(b, 11, 8, 13, md.crystals, 2, 2, 3); }
    // eye stalks
    for (const z of [6, 12]) { b.line(3, 6, z, 2, 9, z, 0.4, () => tone(md.body, 0)); b.set(2, 10, z, pk('#141018')); b.set(2, 10, z + 1, pk('#ffffff')); }
    m.part('body', b, [8, 0, 9], [0, 1, 0]);
    const claw = grid(10, 9, 6);
    claw.ellipsoid(5.5, 4, 3, 4, 3.4, 2.8, shadeBody(md.body, 4, 3.4, 3, 2.8, { belly: md.belly }));
    claw.line(3, 5, 3, 0, 8, 3, 1.5, () => tone(md.body, 0.08));
    claw.line(3, 3, 3, 0, 1.5, 3, 1.2, () => tone(md.body, -0.05));
    claw.set(0, 7, 3, pk(md.accent)); claw.set(0, 2, 3, pk(md.accent));
    claw.line(9, 4, 3, 7, 4, 3, 0.8, () => tone(md.body, -0.1));
    m.part('clawF', claw, [9, 4, 3], [-6, 4, -6], 'body', { rot: [0, 0, -0.3] });
    m.twin('clawB', 'clawF', [-5, 4, 7], null, {});
    m.P('clawB').scale.setScalar(0.75); m._rest(m.P('clawB'));
    const leg = grid(5, 5, 6);
    bones(leg, [[1, 3, 0], [2, 5, 3], [1, 0, 5]], (x, y) => tone(md.body, y > 3 ? 0.05 : -0.15));
    m.part('l0', leg, [1, 3, 0], [-2, 3, 6], 'body'); m.twin('l1', 'l0', [1, 3, 6]); m.twin('l2', 'l0', [4, 3, 6]);
    const lr = mirrorZ(leg);
    m.part('r0', lr, [1, 3, 5], [-2, 3, -6], 'body'); m.twin('r1', 'r0', [1, 3, -6]); m.twin('r2', 'r0', [4, 3, -6]);
    m.points({ hit: [0, 0.45, 0], mouth: [-0.4, 0.4, 0], cuts: [[-0.3, 0.35, 0], [0.1, 0.55, 0], [-0.55, 0.4, -0.35], [0.3, 0.3, 0.3], [0.05, 0.25, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('clawF').rotation.z += -e.wind * 0.9 + e.strike * 0.9 + sin(t * 3) * 0.08;
    m.P('clawF').rotation.y += e.strike * -0.4;
    m.P('clawB').rotation.z += sin(t * 2.5 + 1) * 0.12 + e.strike * 0.5;
    walk(m, ['l0', 'r1', 'l2', 'r0', 'l1', 'r2'], 12, 0.2, 2.1);
    m.root.position.z += sin(t * 1.2) * 0.04; // sideways scuttle
  },
};

// ============================================================================ WISP
const wisp = {
  reach: 0.4, die: 'fade',
  build(m, md) {
    m.fly = 0.85;
    const g = grid(13, 18, 13);
    g.ellipsoid(6.5, 6, 6.5, 5, 5, 5, (x, y, z, d) => (d < 0.35 ? gl('#ffffff') : d < 0.7 ? gl(md.belly) : gl(md.body)));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      spike(g, 6.5 + cos(a) * 2.5, 9, 6.5 + sin(a) * 2.5, -cos(a) * 0.1, 1, -sin(a) * 0.1, 4 + (i % 3) * 2, 1.4, (t) => gl(t > 0.6 ? md.accent : md.body));
    }
    g.box(1, 6, 4, 2, 8, 5, pk('#1a2a4a')); g.box(1, 6, 8, 2, 8, 9, pk('#1a2a4a'));
    g.set(1, 4, 6, pk('#1a2a4a')); g.set(1, 4, 7, pk('#1a2a4a'));
    m.part('core', g, [6.5, 6, 6.5], [0, 0, 0]);
    const shard = grid(3, 4, 3);
    shard.box(1, 0, 1, 2, 4, 2, gl(md.accent)); shard.set(0, 2, 1, gl(md.accent)); shard.set(2, 1, 1, gl(md.body));
    for (let i = 0; i < 3; i++) m.part('orb' + i, shard, [1.5, 2, 1.5], [0, 0, 0], 'core');
    m.emitter({ pos: [0, 0.2, 0], rate: 14, vel: [0.1, 0.5, 0], spread: 0.3, posSpread: 0.15, life: [0.5, 1.1], size: [1, 2], color: [md.body, md.accent, '#ffffff'], glow: 2.5, drag: 1 });
    m.points({ hit: [0, 0.05, 0], mouth: [-0.3, 0.05, 0], cuts: [[-0.15, 0.1, 0], [0.1, -0.1, 0], [0, 0.3, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const c = m.P('core');
    const fl = 1 + sin(t * 23) * 0.04 + sin(t * 37) * 0.03;
    c.scale.set(fl, fl * (1 + e.wind * 0.25), fl);
    m.root.position.y += sin(t * 2) * 0.1;
    for (let i = 0; i < 3; i++) {
      const a = t * (2.5 + e.wind * 6) + (i * Math.PI * 2) / 3;
      const p = m.P('orb' + i);
      p.position.set(cos(a) * 0.55, sin(a * 1.3) * 0.15 + 0.05, sin(a) * 0.55);
      p.rotation.y = a;
    }
  },
};

// ============================================================================ SPIDER
const spider = {
  reach: 0.4, die: 'flatten',
  build(m, md) {
    const b = grid(24, 14, 14);
    b.ellipsoid(16.5, 7, 7, 6.6, 5.8, 5.8, shadeBody(md.body, 7, 5.8, 7, 5.8, { belly: md.belly, bellyY: -0.4, noise: 0.08 }));
    // hourglass mark
    for (let y = 9; y < 13; y++) { const w = Math.abs(y - 10.5) + 0.5; b.box(16 - w, y, 6, 17 + w, y + 1, 8, gl(md.accent)); }
    b.ellipsoid(7, 5.5, 7, 4.4, 3.6, 4, shadeBody(md.body, 5.5, 3.6, 7, 4, { belly: md.belly }));
    for (const [y, z] of [[7, 5], [7, 9], [8, 6], [8, 8], [6, 4], [6, 10]]) b.set(3, y, z, gl(md.eye));
    for (const z of [6, 8]) b.line(3, 4, z, 2, 1, z, 0.5, () => pk('#1a1014'));
    m.part('body', b, [12, 0, 7], [0, 3, 0]);
    const leg = grid(4, 9, 10);
    bones(leg, [[1, 5, 0], [2, 8, 5], [1, 0, 9]], (x, y, z) => ((z % 3 === 1) ? tone(md.belly, 0.1) : tone(md.body, y > 5 ? 0.1 : -0.04)));
    const angles = [-0.75, -0.25, 0.25, 0.7];
    const lr = mirrorZ(leg);
    angles.forEach((a, i) => {
      m.part('l' + i, leg, [1, 5, 0], [-3 + i * 2, 5, 3], 'body', { rot: [0, a, 0] });
      m.part('r' + i, lr, [1, 5, 9], [-3 + i * 2, 5, -3], 'body', { rot: [0, -a, 0] });
    });
    m.points({ hit: [-0.2, 0.55, 0], mouth: [-0.55, 0.45, 0], cuts: [[-0.3, 0.55, 0], [0.3, 0.75, 0], [0.55, 0.55, 0], [-0.4, 0.3, 0.4], [0, 0.35, -0.45]] });
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
    const s = grid(10, 12, 10);
    s.cylinderY(5, 5, 0, 11, 3.6, 3, (x, y, z) => tone(md.body, (y - 5) * 0.02 + (hash3(x, y, z, 1) > 0.85 ? -0.06 : 0)));
    // angry face
    s.box(1, 6, 3, 2, 8, 4, pk('#1a1414')); s.box(1, 6, 6, 2, 8, 7, pk('#1a1414'));
    s.set(1, 8, 2, pk('#4a3020')); s.set(1, 8, 4, pk('#4a3020')); s.set(1, 9, 3, pk('#4a3020'));
    s.set(1, 8, 7, pk('#4a3020')); s.set(1, 8, 5, pk('#4a3020')); s.set(1, 9, 6, pk('#4a3020'));
    s.box(1, 4, 4, 2, 5, 6, pk('#3a1a14'));
    // gills ring under cap
    s.cylinderY(5, 5, 10, 12, 4.6, 4.6, (x, y, z) => tone(md.belly, -0.12));
    m.part('stalk', s, [5, 0, 5], [0, 2, 0]);
    const capCol = md.cap || md.accent;
    const c = grid(19, 9, 19);
    c.ellipsoid(9.5, 0.5, 9.5, 9, 7.5, 9, (x, y, z) => {
      if (y < 1) return tone(capCol, -0.3);
      const sx = Math.floor((x + 1) / 4), sz = Math.floor((z + 1) / 4);
      if (hash3(sx, 0, sz, 5) > 0.55 && (x + 1) % 4 < 2 && (z + 1) % 4 < 2 && y > 2) return big ? gl(md.accent) : pk('#fff6e0');
      return tone(capCol, (y - 3) * 0.05);
    });
    if (big) { crystals; for (const [x, z] of [[4, 6], [14, 12], [10, 3]]) { c.cylinderY(x, z, 5, 8, 0.8, 0.8, pk('#e8d8b8')); c.ellipsoid(x, 8, z, 2, 1.2, 2, gl(md.accent)); } }
    m.part('cap', c, [9.5, 0, 9.5], [0, 11, 0], 'stalk');
    const leg = limb(2, 3, 3, md.belly, { foot: 1 });
    m.part('legF', leg, legPivot(leg), [-1, 1, -2], 'stalk');
    m.twin('legB', 'legF', [1, 1, 2]);
    const arm = limb(big ? 6 : 3, 2, 2, md.body);
    if (big) arm.ellipsoid(1, 0.5, 1, 2, 1.5, 2, gl(md.accent));
    m.part('armF', arm, legPivot(arm), [-1, 7, -5], 'stalk');
    m.twin('armB', 'armF', [1, 7, 5]);
    m.emitter({ pos: [0, 1.1, 0], rate: big ? 8 : 2.5, vel: [0, 0.15, 0], spread: 0.25, posSpread: [0.4, 0.1, 0.4], life: [1.5, 3], size: 1, color: big ? [md.accent, '#ffe08a'] : ['#f0e08a', '#ffffff'], glow: 1.6, gravity: -0.05, drag: 0.5 });
    m.points({ hit: [-0.15, 0.55, 0], mouth: [-0.3, 0.45, 0], cuts: [[-0.2, 0.5, 0], [0, 0.95, 0], [0.4, 0.85, 0], [-0.45, 0.85, 0], [0.05, 0.25, 0]] });
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

// ============================================================================ SNAIL
const snail = {
  reach: 0.3, die: 'flatten',
  build(m, md) {
    const b = grid(24, 7, 9);
    b.ellipsoid(12, 2.5, 4.5, 11.5, 2.6, 3.8, (x, y, z) => (y >= 0 ? tone(md.body, (y - 2) * 0.08 + (hash3(x, y, z, 2) > 0.85 ? -0.1 : 0)) : null));
    b.ellipsoid(2.5, 4, 4.5, 2.6, 2.6, 2.8, shadeBody(md.body, 4, 2.6, 4.5, 2.8, { belly: md.belly }));
    b.box(0, 3, 3, 1, 4, 6, pk('#2a3a1a'));
    m.part('body', b, [12, 0, 4.5], [0, 0, 0]);
    const shell = grid(16, 16, 11);
    shell.ellipsoid(8, 8, 5.5, 7.6, 7.6, 5.4, (x, y, z) => {
      const a = Math.atan2(y - 8, x - 8), r = Math.hypot(x - 8, y - 8);
      const sp = (r * 0.9 - a * 1.6) % 4.2;
      if (md.belly && y > 12 && hash3(x, y, z, 7) > 0.55) return tone('#5a8a3a', 0);
      return tone(md.accent, (sp < 1.2 ? -0.25 : 0.05) + (y - 8) * 0.02);
    });
    m.part('shell', shell, [8, 0, 5.5], [3, 3, 0], 'body');
    const stalk = grid(3, 7, 3);
    stalk.box(1, 0, 1, 2, 6, 2, tone(md.body, 0.05));
    stalk.ellipsoid(1.5, 6.5, 1.5, 1.2, 1.2, 1.2, pk('#141418')); stalk.set(1, 7, 1, pk('#ffffff'));
    m.part('eyeF', stalk, [1.5, 0, 1.5], [-10, 5, -1.5], 'body', { rot: [0.2, 0, 0.3] });
    m.twin('eyeB', 'eyeF', [-10, 5, 1.5], null, { rot: [-0.2, 0, 0.3] });
    m.points({ hit: [-0.1, 0.55, 0], mouth: [-0.7, 0.25, 0], cuts: [[-0.55, 0.25, 0], [0.1, 0.8, 0], [0.35, 0.55, 0], [0.5, 0.15, 0], [-0.2, 0.15, 0]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('eyeF').rotation.z += sin(t * 2) * 0.2 - e.hurt * 1.2; m.P('eyeB').rotation.z += sin(t * 2 + 1) * 0.2 - e.hurt * 1.2;
    m.P('eyeF').scale.y *= 1 - e.hurt * 0.6; m.P('eyeB').scale.y *= 1 - e.hurt * 0.6;
    m.P('body').scale.x *= 1 + sin(t * 1.5) * 0.04 + e.strike * 0.15;
    m.P('shell').rotation.z += -e.wind * 0.5 + e.strike * 0.7 + sin(t * 1.5) * 0.04;
  },
};

// ============================================================================ MOTH
const moth = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 1.0;
    const b = grid(13, 9, 8);
    b.ellipsoid(7, 4.5, 4, 5.6, 3.6, 3.2, (x, y, z) => tone(x % 3 === 0 ? md.body : mix(md.body, md.belly, 0.5), (y - 4) * 0.05 + (hash3(x, y, z, 2) > 0.7 ? 0.08 : 0)));
    b.ellipsoid(2, 5, 4, 1.8, 2, 2.6, pk(md.belly));
    eye(b, 0, 5, 2, md.eye, { big: true }); eye(b, 0, 5, 5, md.eye, { big: true });
    for (const z of [3, 5]) b.line(1, 7, z, -1 + 0, 9, z + (z < 4 ? -2 : 2), 0.5, () => pk(md.belly));
    m.part('body', b, [7, 4.5, 4], [0, 0, 0]);
    const w = grid(16, 15, 2);
    for (let y = 0; y < 15; y++) for (let x = 0; x < 16; x++) {
      const fore = Math.hypot((x - 5) / 6.5, (y - 8.5) / 6.5) < 1; // forewing up-front
      const hind = Math.hypot((x - 11) / 4.6, (y - 4) / 4.4) < 1; // hindwing back-low
      if (!fore && !hind) continue;
      const ex = fore ? x - 5 : x - 11, ey = fore ? y - 9 : y - 4;
      const r = Math.hypot(ex, ey);
      let col = tone(fore ? md.body : md.belly, (x + y) % 4 === 0 ? -0.1 : 0.02);
      if (fore && r < 1.5) col = gl('#ffffff'); else if (fore && r < 2.6) col = gl(md.accent); else if (fore && r < 3.4) col = pk('#2a1a14');
      if (hind && !fore && r < 1.6) col = gl(md.accent);
      if (Math.abs(Math.hypot((x - 5) / 6.5, (y - 8.5) / 6.5) - 0.95) < 0.07 && fore) col = tone(md.body, -0.25);
      w.set(x, y, 0, col);
    }
    m.part('wingL', w, [4, 2, 1], [1, 3, 3], 'body');
    m.part('wingR', w, [4, 2, 1], [1, 3, -3], 'body');
    m.emitter({ pos: [0.1, 0, 0], rate: 6, vel: [0, -0.3, 0], spread: 0.4, posSpread: [0.4, 0.1, 0.5], life: [0.8, 1.6], size: 1, color: [md.accent, '#fff0c0'], glow: 1.8 });
    m.points({ hit: [0, 0, 0], mouth: [-0.35, 0, 0], cuts: [[-0.2, 0.05, 0], [0.2, 0, 0], [0, 0.2, 0.4], [0, 0.2, -0.4]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const sp = 8 + e.multi * 10 + e.strike * 6;
    const flap = sin(t * sp);
    m.P('wingL').rotation.z += flap * 0.6 + 0.15 - e.wind * 0.4 - e.special * 0.5;
    m.P('wingR').rotation.z += sin(t * sp - 0.4) * 0.6 + 0.15 - e.wind * 0.4 - e.special * 0.5;
    m.P('wingL').rotation.x += -0.35 - Math.max(0, -flap) * 0.4; m.P('wingR').rotation.x += 0.35 + Math.max(0, -flap) * 0.4;
    m.root.position.y += sin(t * sp) * 0.04 + sin(t * 1.1) * 0.12;
    m.root.position.z += sin(t * 0.7) * 0.1;
  },
};

// ============================================================================ TOAD
const toad = {
  reach: 0.4,
  build(m, md) {
    const b = grid(18, 12, 16);
    b.ellipsoid(10, 5, 8, 8, 5.4, 7.4, shadeBody(md.body, 5, 5.4, 8, 7.4, { belly: md.belly, bellyY: -0.15, bellyW: 0.75, spots: 0.1, spotColor: md.accent, seed: 4 }));
    // bulging eyes on top
    for (const z of [4, 12]) { b.ellipsoid(5, 9.5, z, 1.8, 1.6, 1.8, tone(md.body, 0.1)); b.set(4, 10, z, gl(md.eye)); b.set(3, 10, z, gl(md.eye)); b.set(3, 10, z + (z < 8 ? -1 : 1) * 0, pk('#1a1a1a')); }
    b.box(2, 4, 3, 3, 5, 13, pk('#3a1a1a')); // mouth line upper lip
    m.part('body', b, [10, 0, 8], [0, 1, 0]);
    const jaw = grid(10, 4, 14);
    jaw.ellipsoid(6, 2, 7, 5.6, 2, 6.4, (x, y) => tone(y < 2 ? md.belly : md.body, 0));
    jaw.box(1, 3, 3, 8, 4, 11, pk('#7a2a3a'));
    m.part('jaw', jaw, [9, 2, 7], [-1, 3, 0], 'body');
    const tongue = grid(12, 2, 3);
    tongue.box(0, 0, 0, 12, 2, 3, pk(md.accent)); tongue.box(0, 0, 0, 2, 2, 3, tone(md.accent, 0.2));
    m.part('tongue', tongue, [11, 1, 1.5], [-2, 2, 0], 'jaw');
    const leg = grid(7, 6, 4);
    leg.ellipsoid(4, 3, 2, 3.2, 2.6, 1.9, tone(md.body, -0.05));
    leg.box(0, 0, 0, 3, 1, 4, tone(md.belly, -0.1));
    m.part('legF', leg, [4, 3, 2], [5, 2, -7], 'body');
    m.twin('legB', 'legF', [5, 2, 7]);
    m.points({ hit: [-0.1, 0.5, 0], mouth: [-0.6, 0.3, 0], cuts: [[-0.4, 0.35, 0], [0, 0.65, 0], [0.4, 0.45, 0], [0.3, 0.15, -0.4], [-0.1, 0.2, 0.4]] });
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

// ============================================================================ SKELETON (Bonepicker)
const skeleton = {
  reach: 0.3, die: 'kneel',
  build(m, md) {
    const bone = md.body;
    const t = grid(9, 15, 9);
    bones(t, [[6, 0, 4], [6, 14, 4]], (x, y) => tone(bone, y % 2 ? -0.12 : 0));
    for (let y = 6; y < 14; y += 2) {
      const rx = 2.6 + (y > 9 ? 0.6 : 0) - (y > 12 ? 0.8 : 0), rz = 3.2 - (y > 12 ? 0.6 : 0);
      for (let a = -2.6; a <= 2.6; a += 0.18) { const x = Math.round(4 + Math.cos(Math.PI - a) * rx * -1 * -1), z = Math.round(4 + Math.sin(a) * rz); t.set(Math.round(4 - Math.cos(a) * rx * 0 + (Math.cos(a) > 0 ? -Math.cos(a) * rx : -Math.cos(a) * rx * 0.6)), y, z, tone(bone, 0.02)); }
    }
    t.box(1, 7, 4, 2, 14, 5, tone(bone, 0.05));
    t.box(3, 0, 1, 8, 2, 8, tone(bone, -0.05)); t.box(4, 2, 3, 7, 3, 6, tone(bone, -0.1));
    t.ellipsoid(4, 10, 4, 1, 1.2, 1, gl(md.eye));
    m.part('torso', t, [5, 0, 4.5], [0, 9, 0]);
    const h = grid(8, 9, 8);
    h.ellipsoid(4, 4.5, 4, 3.6, 3.6, 3.4, tone(bone, 0.05));
    h.box(0, 3, 2, 2, 6, 3, pk('#141018')); h.box(0, 3, 5, 2, 6, 6, pk('#141018'));
    h.set(0, 4, 2, gl(md.eye)); h.set(0, 4, 5, gl(md.eye));
    h.set(0, 2, 3, pk('#2a1a14')); h.set(0, 2, 4, pk('#2a1a14'));
    // miner helmet
    h.ellipsoid(4, 6.5, 4, 4, 2.4, 4, (x, y) => (y >= 7 ? tone(md.accent, -0.05) : null));
    h.box(0, 7, 3, 1, 9, 5, gl('#ffe08a'));
    m.part('head', h, [4, 1, 4], [0, 14, 0], 'torso');
    const jaw = grid(6, 2, 6);
    jaw.box(0, 0, 0, 5, 2, 6, tone(bone, -0.05));
    for (let z = 1; z < 6; z += 2) jaw.set(0, 1, z, pk('#ffffff'));
    m.part('jaw', jaw, [4, 1, 3], [0, 0, 0], 'head');
    const arm = grid(3, 12, 3);
    bones(arm, [[1, 11, 1], [1, 5, 1], [1, 0, 1]], tone(bone, 0));
    arm.set(1, 5, 1, tone(bone, 0.15));
    m.part('armF', arm, [1, 11, 1], [0, 12, -5], 'torso');
    m.twin('armB', 'armF', [0, 12, 5]);
    const pick = grid(11, 16, 3);
    pick.box(5, 0, 1, 6, 15, 2, (x, y) => tone('#8a5a33', y * 0.01));
    pick.line(0, 13, 1, 10, 15, 1, 0.6, () => tone('#9aa3b2', 0.05));
    m.part('pick', pick, [5.5, 2, 1.5], [0, 0, -1], 'armF', { rot: [0, 0, 0.6] });
    const leg = grid(3, 10, 3);
    bones(leg, [[1, 9, 1], [1, 4, 1], [1, 0, 1]], tone(bone, -0.03));
    leg.box(0, 0, 0, 3, 1, 3, tone(bone, -0.1));
    m.part('legF', leg, [1, 9, 1], [0, 1, -2], 'torso');
    m.twin('legB', 'legF', [0, 1, 2]);
    m.points({ hit: [0, 1.0, 0], mouth: [-0.25, 1.15, 0], cuts: [[0, 1.2, 0], [0, 0.85, 0], [0, 0.55, 0], [0, 0.35, -0.15], [0, 0.95, 0.3]] });
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

// ============================================================================ KNIGHT (gilded / cursed)
const knight = {
  reach: 0.4, die: 'kneel',
  build(m, md) {
    const cursed = m.id === 'cursed_knight';
    const plate = (x, y, z) => tone(md.body, (y - 6) * 0.03 + ((x + y) % 5 === 0 ? 0.1 : 0) + (hash3(x, y, z, 1) > 0.9 ? -0.08 : 0));
    const t = grid(10, 12, 10);
    t.box(1, 0, 1, 9, 12, 9, plate);
    t.box(0, 4, 2, 1, 11, 8, plate);
    t.box(0, 0, 2, 3, 3, 8, tone(md.belly, 0));
    t.box(0, 7, 4, 1, 9, 6, cursed ? gl(md.accent) : pk(md.accent));
    // pauldrons
    for (const z of [0, 7]) t.box(2, 9, z, 8, 12, z + 3, (x, y) => tone(md.body, 0.08));
    m.part('torso', t, [5, 0, 5], [0, 10, 0]);
    const h = grid(8, 10, 8);
    h.box(1, 0, 1, 7, 7, 7, plate);
    h.box(0, 2, 2, 1, 6, 6, plate);
    h.box(0, 3, 2, 1, 4, 6, pk('#0a080c'));
    h.set(0, 3, 3, gl(md.eye)); h.set(0, 3, 5, gl(md.eye));
    if (cursed) { for (const z of [1, 6]) h.line(4, 6, z, 6, 10, z < 4 ? -1 : 8, 0.6, () => tone('#2a2238', 0.1)); }
    else for (let x = 2; x < 8; x++) h.set(x, 7 + (x < 5 ? 1 : 0), 4, pk(md.accent));
    m.part('head', h, [4, 0, 4], [0, 12, 0], 'torso');
    const arm = limb(9, 3, 3, md.body, { footCol: md.belly });
    m.part('armF', arm, legPivot(arm), [0, 11, -6], 'torso');
    m.twin('armB', 'armF', [0, 11, 6]);
    // weapon
    const wpn = grid(5, 26, 3);
    if (cursed) {
      wpn.box(2, 0, 1, 3, 5, 2, tone('#2a1a2a', 0));
      wpn.box(0, 5, 1, 5, 6, 2, tone(md.body, 0.1));
      for (let y = 6; y < 22; y++) wpn.box(1, y, 1, 4 - (y > 18 ? 1 : 0), y + 1, 2, y % 4 === 0 ? gl(md.accent) : tone('#4a425a', 0.1));
    } else {
      wpn.box(2, 0, 1, 3, 22, 2, (x, y) => tone('#6a4a2a', 0));
      wpn.ellipsoid(1, 21, 1.5, 2.2, 3, 0.8, tone('#dfe6ee', 0));
      wpn.line(2, 22, 1, 2, 25, 1, 0.5, () => pk('#dfe6ee'));
    }
    m.part('weapon', wpn, [2.5, 3, 1.5], [0, -8, -1], 'armF', { rot: [0, 0, cursed ? 0.9 : 0.25] });
    // shield (gilded) or cape (cursed)
    if (!cursed) {
      const sh = grid(3, 11, 9);
      sh.box(0, 0, 0, 2, 11, 9, (x, y, z) => (Math.abs(z - 4) + Math.max(0, 4 - y) > 6 ? null : tone(md.body, x === 0 ? 0.1 : -0.1)));
      sh.box(0, 4, 3, 1, 8, 6, pk(md.accent));
      m.part('shield', sh, [1, 5, 4.5], [-3, -5, 1], 'armB');
    }
    const cape = grid(4, 14, 10);
    cape.box(0, 0, 0, 2, 14, 10, (x, y, z) => (y < 2 && (z + y) % 3 === 0 ? null : tone(md.belly, (y - 7) * 0.02)));
    m.part('cape', cape, [1, 13, 5], [5, 11, 0], 'torso');
    const leg = limb(9, 3, 3, md.body, { foot: 1, footCol: md.belly });
    m.part('legF', leg, legPivot(leg), [0, 1, -2.5], 'torso');
    m.twin('legB', 'legF', [0, 1, 2.5]);
    if (cursed) m.emitter({ pos: [0.05, 1.25, 0], rate: 6, vel: [0, 0.4, 0], spread: 0.2, posSpread: [0.15, 0.1, 0.15], life: [0.5, 1], size: 1, color: [md.accent, md.eye], glow: 2.5 });
    m.points({ hit: [0, 1.0, 0], mouth: [-0.3, 1.35, 0], cuts: [[0, 1.4, 0], [0, 1.0, 0], [0, 0.7, -0.3], [0, 0.4, 0], [0.1, 0.9, 0.35]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.P('armF').rotation.z += -e.wind * 2.6 + e.strike * 2.4 + e.multi * sin(t * 16) * 1.2 + sin(t * 1.5) * 0.04;
    if (m.P('shield')) m.P('armB').rotation.z += e.special * 1.2 + e.strike * (m.state === 'attack' ? 0 : 0) + sin(t * 1.5 + 1) * 0.04;
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
    const h = grid(14, 15, 12);
    h.box(1, 0, 0, 14, 15, 12, (x, y, z) => tone(md.body, (y - 7) * 0.025 + (hash3(x >> 1, y >> 1, z, 3) - 0.5) * 0.12));
    h.box(0, 3, 2, 1, 12, 10, (x, y, z) => tone(md.body, 0.05));
    // brow, nose, mouth
    h.box(0, 9, 1, 1, 10, 11, tone(md.body, 0.15)); h.box(-0, 5, 5, 1, 9, 7, tone(md.body, 0.1));
    h.box(0, 3, 3, 1, 4, 9, pk('#1a140e'));
    // closed side eyes + great eye on forehead
    h.box(0, 7, 2, 1, 8, 4, pk('#1a140e')); h.box(0, 7, 8, 1, 8, 10, pk('#1a140e'));
    h.box(0, 10, 4, 1, 14, 8, pk(md.accent));
    h.box(0, 11, 5, 1, 13, 7, gl(md.eye)); h.set(0, 11, 6, gl('#ffffff'));
    // gold band + runes
    h.box(0, 13, 0, 14, 15, 12, (x, y, z) => ((x + z) % 3 === 0 ? gl(md.eye) : tone(md.accent, -0.05)));
    for (let y = 2; y < 10; y += 3) h.set(13, y, 6, gl(md.eye));
    h.box(3, 0, 2, 12, 1, 10, (x, z) => (hash3(x, 0, z, 2) > 0.5 ? null : tone(md.belly, -0.1)));
    m.part('head', h, [7, 0, 6], [0, 0, 0]);
    const rock = grid(4, 4, 4);
    rock.ellipsoid(2, 2, 2, 1.8, 1.6, 1.8, (x, y, z) => tone(md.belly, y * 0.04));
    rock.set(2, 3, 2, gl(md.eye));
    for (let i = 0; i < 4; i++) m.part('rock' + i, rock, [2, 2, 2], [0, 0, 0], 'head');
    m.emitter({ pos: [0, -0.05, 0], rate: 4, vel: [0, -0.25, 0], spread: 0.1, posSpread: [0.3, 0, 0.3], life: [0.6, 1.2], size: 1, color: '#c8b890', glow: 1, gravity: 0.5 });
    m.points({ hit: [-0.4, 0.75, 0], mouth: [-0.45, 0.72, 0], cuts: [[-0.4, 0.5, 0], [-0.2, 0.8, 0.3], [0.1, 0.3, 0], [0, 0.85, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    m.root.position.y += sin(t * 1.6) * 0.06;
    m.P('head').rotation.y += sin(t * 0.5) * 0.12;
    m.P('head').rotation.z += -e.wind * 0.2 + e.special * 0.1;
    for (let i = 0; i < 4; i++) {
      const a = t * 1.3 + (i * Math.PI) / 2;
      const p = m.P('rock' + i);
      p.position.set(cos(a) * 0.65 + 0.4 * 0, 0.2 + sin(a * 2) * 0.12 - e.wind * 0.1, sin(a) * 0.65);
      p.rotation.set(a, a * 0.7, 0);
    }
  },
};

// ============================================================================ OWL
const owl = {
  reach: 0.45, die: 'fall',
  build(m, md) {
    m.fly = 0.6;
    const b = grid(12, 15, 11);
    b.ellipsoid(6, 7, 5.5, 5.4, 7, 5, (x, y, z) => {
      if (x < 4 && y < 9 && Math.abs(z - 5.5) < 3.5) return (y + Math.abs(z - 5.5)) % 3 === 0 ? tone(md.body, -0.05) : tone(md.belly, 0);
      return tone(md.body, (y - 7) * 0.03 + ((x * 3 + y) % 4 === 0 ? -0.08 : 0));
    });
    // face disk + eyes
    b.box(0, 9, 2, 2, 13, 9, (x) => tone(md.belly, 0.05));
    for (const z of [3, 7]) { b.box(0, 10, z, 1, 12, z + 2, gl(md.eye)); b.set(0, 11, z + (z < 5 ? 1 : 0), pk('#1a0a0a')); }
    b.set(0, 9, 5, pk(md.accent)); b.set(0, 8, 5, tone(md.accent, -0.2));
    for (const z of [2, 8]) { b.set(2, 14, z, tone(md.body, 0.05)); b.set(2, 15, z, tone(md.body, 0.05)); b.set(1, 14, z, tone(md.body, -0.1)); }
    for (const z of [3, 7]) b.box(2, 0, z, 5, 1, z + 2, pk(md.accent));
    m.part('body', b, [6, 0, 5.5], [0, 0, 0]);
    const w = grid(9, 11, 3);
    w.box(0, 0, 0, 8, 11, 2, (x, y) => (y < 3 && x > 5 - y ? null : tone(md.body, (y - 5) * 0.03 + (x % 2 ? -0.06 : 0.02))));
    m.part('wingL', w, [4, 10, 1], [1, 11, 5], 'body');
    m.twin('wingR', 'wingL', [1, 11, -6]);
    m.points({ hit: [-0.2, 0.55, 0], mouth: [-0.35, 0.55, 0], cuts: [[-0.25, 0.45, 0], [0, 0.75, 0], [0.1, 0.4, 0.3], [0.1, 0.35, -0.3]] });
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

// ============================================================================ SALAMANDER
const salamander = {
  reach: 0.35,
  build(m, md) {
    const b = grid(18, 8, 11);
    b.ellipsoid(9, 4, 5.5, 8.6, 3.2, 4.4, shadeBody(md.body, 4, 3.2, 5.5, 4.4, { belly: md.belly, bellyY: -0.25, spots: 0.12, spotColor: md.accent, seed: 8 }));
    for (let x = 2; x < 17; x += 2) { b.set(x, 7, 5, gl(x % 4 ? '#ffd04a' : '#ff6a1a')); if (x % 4 === 0) b.set(x, 8, 5, gl('#ff8a2a')); }
    m.part('body', b, [9, 0, 5.5], [0, 2, 0]);
    const h = grid(10, 7, 9);
    h.ellipsoid(5.5, 3.5, 4.5, 4.6, 2.8, 3.6, shadeBody(md.body, 3.5, 2.8, 4.5, 3.6, { belly: md.belly }));
    eye(h, 3, 5, 1, md.eye); eye(h, 3, 5, 7, md.eye);
    h.set(0, 4, 3, pk('#1a0a0a')); h.set(0, 4, 5, pk('#1a0a0a'));
    m.part('head', h, [8, 3, 4.5], [-8, 4, 0], 'body');
    const jaw = grid(8, 2, 7);
    jaw.box(0, 0, 0, 8, 2, 7, tone(md.belly, 0)); jaw.box(0, 1, 2, 6, 2, 5, pk('#ff6a3a'));
    m.part('jaw', jaw, [7, 1, 3.5], [0, 1, 0], 'head');
    const tl = grid(9, 4, 5);
    tl.ellipsoid(4.5, 2, 2.5, 4.6, 1.6, 2, shadeBody(md.body, 2, 1.6, 2.5, 2, { belly: md.belly }));
    m.part('tail0', tl, [0, 2, 2.5], [8, 4, 0], 'body');
    m.part('tail1', tl, [0, 2, 2.5], [8, 0, 0], 'tail0', {});
    m.P('tail1').scale.setScalar(0.75); m._rest(m.P('tail1'));
    const tip = grid(5, 5, 3); tip.line(0, 2, 1, 4, 4, 1, 0.8, (x, y) => gl(y > 3 ? '#fff0a0' : '#ff8a2a'));
    m.part('tail2', tip, [0, 2, 1], [8, 0, 0], 'tail1');
    const leg = limb(2, 2, 2, md.body, { foot: 2, footCol: md.belly, claw: '#3a1a1a' });
    m.part('lf', leg, legPivot(leg), [-5, 2, -4], 'body', { rot: [0.5, 0, 0] });
    m.part('lb', leg, legPivot(leg), [5, 2, -4], 'body', { rot: [0.5, 0, 0] });
    m.part('rf', leg, legPivot(leg), [-5, 2, 4], 'body', { rot: [-0.5, 0, 0] });
    m.part('rb', leg, legPivot(leg), [5, 2, 4], 'body', { rot: [-0.5, 0, 0] });
    m.emitter({ pos: [0, 0.55, 0], rate: 8, vel: [0, 0.6, 0], spread: 0.2, posSpread: [0.45, 0, 0.05], life: [0.3, 0.8], size: 1, color: ['#ffd04a', '#ff6a1a'], glow: 3 });
    m.points({ hit: [-0.2, 0.35, 0], mouth: [-0.95, 0.4, 0], cuts: [[-0.6, 0.35, 0], [-0.2, 0.4, 0], [0.25, 0.35, 0], [0.7, 0.3, 0], [0, 0.2, 0.25]] });
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

// ============================================================================ WYRM (wyrmling — segmented serpent)
const wyrm = {
  reach: 0.5,
  build(m, md) {
    const seg = (r) => {
      const n = Math.ceil(r * 2 + 2);
      const g = grid(n, n, n);
      const c = n / 2;
      g.ellipsoid(c, c, c, r, r, r * 0.9, (x, y, z) => {
        if (y < c - r * 0.4 && Math.abs(z + 0.5 - c) < r * 0.6) return md.glow && (x + y) % 3 === 0 ? gl(md.belly) : tone(md.belly, 0);
        if (y > c + r * 0.7 && Math.abs(z + 0.5 - c) < 1) return tone(md.accent, 0.1);
        return tone(md.body, (y - c) / r * 0.15 + (hash3(x, y, z, 3) > 0.88 ? -0.15 : 0));
      });
      g._c = [c, c, c];
      return g;
    };
    const radii = [4.6, 4.2, 3.8, 3.3, 2.8, 2.2];
    let parent = 'root';
    radii.forEach((r, i) => {
      const g = seg(r);
      if (i === 0) for (let k = 0; k < 4; k++) g.set(Math.round(g._c[0] + 1 + k * 0.5), Math.round(g._c[1] + r) + k, Math.round(g._c[2]), tone(md.accent, 0.1));
      const offs = [[0, 17, 0], [3.5, -5, 0], [4, -5, 0], [5, -3, 0], [4.5, -0.5, 0], [4, 0.5, 0]];
      m.part('s' + i, g, g._c, offs[i], parent);
      parent = 's' + i;
    });
    const h = grid(13, 10, 10);
    h.ellipsoid(7, 5, 5, 5.4, 4, 4.4, shadeBody(md.body, 5, 4, 5, 4.4, { belly: md.belly, bellyY: -0.5 }));
    h.ellipsoid(2.5, 4, 5, 3, 2.4, 3, tone(md.body, 0.04));
    eye(h, 4, 7, 2, md.eye); eye(h, 4, 7, 8, md.eye);
    for (const z of [2, 8]) h.line(8, 8, z, 12, 10, z + (z < 5 ? -1 : 1), 0.6, () => tone(md.accent, 0.2));
    h.set(0, 5, 4, gl('#ffd04a')); h.set(0, 5, 6, gl('#ffd04a'));
    m.part('head', h, [9, 4, 5], [-3, 3, 0], 's0');
    const jaw = grid(9, 3, 8);
    jaw.box(0, 0, 0, 9, 3, 8, tone(md.belly, -0.05));
    for (let z = 1; z < 8; z += 2) jaw.set(0, 3, z, pk('#fff6e0'));
    jaw.box(1, 2, 2, 7, 3, 6, gl('#ff6a1a'));
    m.part('jaw', jaw, [8, 2, 4], [0, 1, 0], 'head');
    const fin = grid(7, 7, 2);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7 - y; x++) fin.set(x, y, 0, tone(x + y > 5 ? md.accent : md.body, -0.05));
    m.part('finL', fin, [0, 0, 1], [0, 3, 3], 's1', { rot: [-0.6, 0, 0.2] });
    m.part('finR', fin, [0, 0, 1], [0, 3, -3], 's1', { rot: [0.6, 0, 0.2] });
    if (md.glow) m.emitter({ pos: [0.2, 0.4, 0], rate: 10, vel: [0, 0.8, 0], spread: 0.3, posSpread: [0.5, 0.3, 0.2], life: [0.4, 1], size: 1, color: ['#ffd04a', '#ff6a1a'], glow: 3 });
    m.points({ hit: [-0.25, 0.8, 0], mouth: [-0.75, 0.85, 0], cuts: [[-0.3, 0.8, 0], [0.2, 0.6, 0], [0.6, 0.5, 0], [1.0, 0.45, 0], [0, 0.95, 0.2]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    for (let i = 0; i < 6; i++) {
      const p = m.P('s' + i);
      p.rotation.z += sin(t * 2.4 - i * 0.8) * 0.18 + (i === 0 ? -e.wind * 0.4 + e.strike * 0.5 : 0);
      p.rotation.y += sin(t * 1.7 - i * 0.6) * 0.12;
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
    const c = grid(14, 22, 14);
    c.cylinderY(7, 7, 0, 18, 6.2, 3.4, (x, y, z, k) => {
      const ang = Math.atan2(z - 7, x - 7);
      if (y < 4 && (Math.round(ang * 3 + y) % 3 === 0)) return null; // tattered hem
      return tone(md.body, (y - 9) * 0.02 + ((x + z) % 4 === 0 ? -0.08 : 0));
    });
    c.ellipsoid(6, 18, 7, 4.6, 4, 4.6, (x, y, z) => tone(md.body, 0.05));
    c.ellipsoid(4, 17.5, 7, 3, 2.8, 3, (x, y, z) => (x < 5 ? pk('#06040a') : null));
    c.set(2, 18, 5, gl(md.eye)); c.set(2, 18, 9, gl(md.eye)); c.set(2, 18, 6, gl(md.eye)); c.set(2, 18, 8, gl(md.eye));
    c.line(8, 13, 2, 8, 6, 1, 0.5, () => tone('#7a7a8a', 0.1)); // chain
    m.part('cloak', c, [7, 0, 7], [0, 0, 0]);
    const arm = grid(10, 4, 4);
    arm.line(9, 2, 2, 2, 2, 2, 1, () => tone(md.body, -0.05));
    for (let f = 0; f < 3; f++) arm.line(2, 2, 1 + f, 0, 1 + f, 1 + f, 0.4, () => pk(md.belly));
    m.part('armF', arm, [9, 2, 2], [-2, 12, -5], 'cloak');
    m.twin('armB', 'armF', [-2, 12, 5]);
    m.emitter({ pos: [0.1, 0.1, 0], rate: 12, vel: [0.15, -0.2, 0], spread: 0.2, posSpread: [0.3, 0.05, 0.3], life: [0.6, 1.2], size: [1, 2], color: [md.accent, md.body], glow: 1.8, drag: 1 });
    m.points({ hit: [-0.2, 0.95, 0], mouth: [-0.35, 1.05, 0], cuts: [[-0.2, 1.0, 0], [0, 0.6, 0], [0.1, 0.3, 0], [-0.35, 0.7, -0.3]] });
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
    const bone = md.body;
    const b = grid(18, 10, 10);
    bones(b, [[2, 7, 5], [16, 7, 5]], tone(bone, 0));
    for (let x = 4; x < 14; x += 2) for (let a = 0; a < 7; a++) { const ang = (a / 6) * Math.PI; b.set(x, Math.round(7 - sin(ang) * 3.6), Math.round(5 + cos(ang) * 3.8), tone(bone, -0.04)); }
    b.ellipsoid(8, 5, 5, 2.4, 1.8, 1.6, gl(md.accent));
    b.ellipsoid(15, 6, 5, 2.2, 1.6, 3.2, tone(bone, -0.06));
    m.part('body', b, [9, 0, 5], [0, 6, 0]);
    const h = grid(12, 8, 8);
    h.ellipsoid(7, 4.5, 4, 3.6, 3.2, 3.2, tone(bone, 0.05));
    h.box(1, 2, 2, 6, 5, 6, tone(bone, 0.02));
    h.box(3, 5, 2, 5, 6, 3, pk('#141018')); h.box(3, 5, 5, 5, 6, 6, pk('#141018'));
    h.set(3, 5, 2, gl(md.eye)); h.set(3, 5, 5, gl(md.eye));
    for (const z of [2, 5]) h.line(9, 7, z + 0.5, 11, 8, z + 0.5, 0.5, () => tone(bone, 0));
    for (let x = 1; x < 6; x += 2) h.set(x, 1, 2, pk('#ffffff')), h.set(x, 1, 5, pk('#ffffff'));
    m.part('head', h, [9, 3, 4], [-7, 8, 0], 'body');
    const jaw = grid(7, 2, 5);
    jaw.box(0, 0, 0, 7, 2, 5, tone(bone, -0.06));
    for (let x = 0; x < 6; x += 2) jaw.set(x, 2, 1, pk('#ffffff')), jaw.set(x, 2, 3, pk('#ffffff'));
    m.part('jaw', jaw, [6, 1, 2.5], [-2, 0, 0], 'head');
    const leg = grid(4, 8, 3);
    bones(leg, [[2, 7, 1], [1, 3, 1], [2, 0, 1]], tone(bone, -0.02));
    leg.box(0, 0, 0, 3, 1, 3, tone(bone, -0.1));
    m.part('lf', leg, [2, 7, 1], [-5, 1, -3], 'body'); m.twin('lb', 'lf', [5, 1, -3]); m.twin('rf', 'lf', [-5, 1, 3]); m.twin('rb', 'lf', [5, 1, 3]);
    const tail = grid(7, 6, 3); bones(tail, [[0, 1, 1], [3, 3, 1], [6, 5, 1]], tone(bone, 0));
    m.part('tail', tail, [0, 1, 1], [8, 7, 0], 'body');
    m.emitter({ pos: [0, 0.7, 0], rate: 7, vel: [0, 0.5, 0], spread: 0.15, posSpread: [0.4, 0.1, 0.1], life: [0.4, 0.9], size: 1, color: [md.accent, md.eye], glow: 2.5 });
    m.points({ hit: [-0.15, 0.7, 0], mouth: [-0.85, 0.85, 0], cuts: [[-0.6, 0.85, 0], [-0.15, 0.7, 0], [0.3, 0.7, 0], [0.5, 0.5, 0], [-0.3, 0.35, 0.2]] });
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
    const wood = (x, y, z) => ((y % 3 === 0) ? tone(md.body, -0.18) : tone(md.body, (hash3(x, y >> 1, z, 4) - 0.5) * 0.12));
    const band = (x, y, z) => tone(md.accent, y * 0.01);
    const base = grid(16, 9, 12);
    base.box(0, 0, 0, 16, 9, 12, wood);
    base.box(1, 2, 1, 15, 9, 11, pk('#3a0a14'));
    for (const x of [1, 14]) base.box(x, 0, 0, x + 1, 9, 12, band);
    base.box(0, 0, 0, 16, 1, 12, tone(md.body, -0.2));
    base.box(0, 5, 5, 1, 8, 7, band); base.set(0, 6, 6, pk('#1a1014'));
    for (let x = 2; x < 14; x += 2) { base.set(x, 9 - 1, 1, pk('#fff6e0')); base.set(x, 9 - 1, 10, pk('#fff6e0')); }
    for (let z = 2; z < 11; z += 2) base.set(1, 8, z, pk('#fff6e0'));
    m.part('base', base, [8, 0, 6], [0, 1, 0]);
    const lid = grid(16, 6, 12);
    lid.box(0, 0, 0, 16, 4, 12, wood);
    lid.box(0, 4, 1, 16, 6, 11, (x, y, z) => tone(md.body, 0.05));
    for (const x of [1, 14]) lid.box(x, 0, 0, x + 1, 6, 12, band);
    lid.box(1, 0, 1, 15, 1, 11, pk('#5a1a24'));
    for (let x = 2; x < 14; x += 2) { lid.set(x, 0, 1, pk('#fff6e0')); lid.set(x, 0, 10, pk('#fff6e0')); }
    for (let z = 2; z < 11; z += 2) lid.set(1, 0, z, pk('#fff6e0'));
    lid.set(6, 0, 4, gl(md.eye)); lid.set(6, 0, 7, gl(md.eye)); lid.set(7, 0, 4, pk('#1a1014')); lid.set(7, 0, 7, pk('#1a1014'));
    m.part('lid', lid, [16, 0, 6], [8, 8, 0], 'base');
    const tongue = grid(14, 2, 4);
    tongue.box(0, 0, 0, 14, 2, 4, (x) => tone(md.belly, x < 3 ? 0.15 : 0)); tongue.box(0, 1, 1, 14, 2, 3, tone(md.belly, -0.12));
    m.part('tongue', tongue, [13, 1, 2], [4, 3, 0], 'base');
    const leg = limb(2, 2, 2, md.body, { foot: 1, footCol: '#5a3820' });
    m.part('lf', leg, legPivot(leg), [-5, 1, -4], 'base'); m.twin('lb', 'lf', [5, 1, -4]); m.twin('rf', 'lf', [-5, 1, 4]); m.twin('rb', 'lf', [5, 1, 4]);
    m.points({ hit: [-0.2, 0.55, 0], mouth: [-0.5, 0.55, 0], cuts: [[-0.3, 0.5, 0], [0.1, 0.75, 0], [0.3, 0.4, 0], [-0.1, 0.3, 0.3], [0.2, 0.6, -0.3]] });
  },
  anim(m) {
    const e = m.env, t = m.t;
    const d = e.disguise;
    const open = (1 - d) * (0.55 + sin(t * 5) * 0.12 + e.wind * 0.5 - e.strike * 0.65 + e.multi * Math.abs(sin(t * 14)) * 0.6 + e.roar * 0.5);
    m.P('lid').rotation.z += -Math.max(0, open) * 1.1;
    const tg = m.P('tongue');
    const flick = sin(t * 1.7) > 0.97 ? 0.3 : 0.06; // a cheeky tongue-tip tell while disguised
    tg.scale.x *= Math.max(flick * d, (1 - d) * (0.8 + sin(t * 3) * 0.15 + e.strike * 0.6));
    tg.rotation.z += -0.3 * (1 - d) + sin(t * 4) * 0.1;
    for (const n of ['lf', 'lb', 'rf', 'rb']) m.P(n).scale.y *= Math.max(0.01, 1 - d);
    m.P('base').position.y += (1 - d) * Math.abs(sin(t * 7)) * 0.03 - d * 0.1;
    if (d > 0.5) m.root.scale.y = m.scale * (1 + sin(t * 1.2) * 0.008); // subtle breathing tell
    walk(m, ['lf', 'rb', 'rf', 'lb'], 12, 0.2 * (1 - d));
  },
  intro(m, k) {
    m.root.position.y += Math.sin(k * Math.PI) * 0.4;
    m.root.rotation.z += Math.sin(k * 12) * 0.08 * (1 - k);
  },
};

export const NORMAL_ARCHES = { rat, bat, slime, kobold, beetle, mole, golem, crab, wisp, spider, mushroom, snail, moth, toad, skeleton, knight, sentinel, owl, salamander, wyrm, wraith, hound, mimic };
