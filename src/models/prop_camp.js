// Voxel props for camps, workshops and the mine workings (0.04 m grid, see prop_vox.js).
// Each painter keeps the footprint, anchor and hooks of the prop it replaces.
import * as THREE from 'three';
import { FlickerLight } from '../gfx/camera.js';
import { fx as rnd } from '../core/rng.js';
import {
  PV, u, ui, C, glowC, mixC, tone, box, ell, cyl, cylX, cylZ, seg, h3, NOAO, text, WOOD, WOOD_PALE, IRON, RUST, BRASS, BONE, CLOTH,
  palOf, STONE, GOLD, COPPER, MOSS, CHAR, PAPER, voxModel, rock, woodC, planks, lathe, vessel, torus, rope, makeFlame, addLight, worldOf,
} from './prop_vox.js';

const BARK = ['#2a1a1e', '#3e2a26', '#5a3a2e', '#7a5038', '#9a6a48'].map(C);
const ENDGRAIN = [C('#c89a64'), C('#e0b882'), C('#a87a4a')];
const STEEL = ['#3a3a4e', '#5a5a72', '#8a8aa2', '#b8b8cc', '#e8e8f4'].map(C);
const BRICK = ['#5a2a2a', '#8a3e34', '#b05a44', '#d07a58', '#e8a07a'].map(C);
const bark = (px, py, pz, seed = 1) => tone(BARK, 0.38 + ((px * 3 + pz * 5) % 4 === 0 ? -0.18 : 0) + (h3(px, py >> 2, pz, seed) - 0.5) * 0.2);
/** A log between two points: bark with grooves, sawn ring ends. */
function log(w, a, b, r, seed = 1, o = {}) {
  seg(w, ...a, ...b, r, (px, py, pz, t, d) => {
    if ((t < 0.02 || t > 0.98) && o.ends !== false) return ENDGRAIN[Math.round(Math.sqrt(d ?? 0) * 3) % 3];
    if (o.char && t > o.char) return h3(px, py, pz, seed) > 0.72 ? glowC(h3(px, pz, 1, seed) > 0.5 ? '#ff6a1a' : '#ffb040') : CHAR[1 + (h3(px, py, pz, 2) > 0.5 ? 1 : 0)];
    return bark(px, py, pz, seed);
  });
}

// ------------------------------------------------------------------ fire & cooking
export function campfire(o) {
  const grp = new THREE.Group();
  grp.add(voxModel('campfire', (w) => {
    // ring of warm, chipped stones
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + h3(i, 1, 2, 2) * 0.2, s = 0.85 + h3(i, 2, 2, 2) * 0.35;
      rock(w, Math.cos(a) * 10.8, 1.2 * s, Math.sin(a) * 10.8, 2.7 * s, 2 * s, 2.3 * s, STONE, i + 3, { floor: 0, cuts: 5 });
    }
    // ash bed with glowing coals
    ell(w, 0, 0, 0, 8.5, 1.3, 8.5, (px, py, pz, d) => (h3(px, py, pz, 7) > 0.62 ? glowC(h3(px, pz, 1, 8) > 0.55 ? '#ff7a2a' : '#ffc85a') : tone(CHAR, 0.35 + (h3(px, pz, 3, 3) > 0.7 ? 0.25 : 0) + (1 - d) * 0.1)));
    // a teepee of split logs, charred where the fire licks them
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      log(w, [Math.cos(a) * 7.5, 1, Math.sin(a) * 7.5], [Math.cos(a) * 1.2, 8.5, Math.sin(a) * 1.2], 1.1, i + 2, { char: 0.55, ends: false });
    }
    // spare logs beside the ring
    log(w, [12, 1.3, 9], [21, 1.3, 3], 1.3, 7);
    log(w, [14.5, 1.2, 0], [22, 1.2, -3], 1.15, 8);
    log(w, [16, 3.4, 5], [22, 3.4, 0], 1.1, 9);
  }));
  const flame = makeFlame(o.scale ?? 1.25, o.palette || 'fire');
  flame.position.y = 0.1;
  grp.add(flame);
  const light = addLight(grp, new FlickerLight(0xff8a3a, o.intensity ?? 7, o.distance ?? 10, { amount: 0.28, jitter: 0.06 }), [0, 0.7, 0]);
  if (o.shadow) { light.castShadow = true; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.004; light.shadow.camera.near = 0.2; }
  grp.userData.update = (dt, t) => { flame.userData.flame(t); light.tick(t); };
  grp.userData.emit = (P, dt) => {
    if (rnd.chance(dt * 26)) P.add.emit({ pos: worldOf(grp, 0, 0.35, 0), posSpread: 0.12, vel: [0, 1.3, 0], spread: 0.3, life: [0.7, 1.6], size: 1, color: ['#ffd27a', '#ff8a3a', '#fff0b0'], colorEnd: '#ff3a1a', glow: 3, drag: 0.5, flicker: 0.3, swirl: 1.5 });
    if (rnd.chance(dt * 4)) P.alpha.emit({ pos: worldOf(grp, 0, 0.9, 0), posSpread: 0.1, vel: [0.05, 0.45, 0], spread: 0.08, life: [2, 3.5], size: [1, 2], sizeEnd: 3, color: '#4a4040', alpha: 0.35, fadeIn: 0.5 });
  };
  return grp;
}

export function cookpot(o) {
  const grp = new THREE.Group();
  grp.add(voxModel('cookpot', (w) => {
    const top = [0, 24.5, 0];
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.4; seg(w, Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5, -Math.cos(a) * 1.2, top[1] + 1.5, -Math.sin(a) * 1.2, 0.65, (px, py, pz) => bark(px, py, pz, i)); }
    torus(w, 0, 23.5, 0, 1.2, 0.6, 'y', (px, py) => (py & 1 ? C('#c8a870') : C('#8a6a40')));
    for (let y = 12; y < 23; y++) w.set(0, y, 0, y % 2 ? IRON[3] : IRON[1]);
    // pot: a round-bellied iron cauldron, rim, lugs, bail handle
    vessel(w, 0, 0, 6, 12, (t) => 2.4 + Math.sin(Math.min(1, t * 1.25) * Math.PI) * 2.3 + (t > 0.85 ? 0.4 : 0), (px, py, pz, d, t) => tone(IRON, 0.25 + (t > 0.85 ? 0.35 : 0) + (px < 0 ? 0.12 : 0) + (h3(px, py, pz, 4) > 0.93 ? -0.15 : 0)), 1.2, 0.9);
    cyl(w, 0, 0, 10, 11, 3.6, 3.6, (px, py, pz) => (h3(px, py, pz, 2) > 0.82 ? glowC('#ffb060') : h3(px, py, pz, 3) > 0.75 ? C('#9ac860') : C('#c86a3a')));
    for (const sx of [-1, 1]) box(w, sx * 5, 10, -1, sx * 5 + 1, 12, 1, IRON[2]);
    for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI; w.set(Math.round(Math.cos(a) * 5), Math.round(11 + Math.sin(a) * 4.5), 0, IRON[3]); }
    seg(w, 1.5, 11, 1.2, 4.5, 16.5, 3.2, 0.5, WOOD_PALE[3]);
    ell(w, 4.6, 16.8, 3.3, 1, 0.8, 1, WOOD_PALE[2]);
  }));
  grp.userData.emit = (P, dt) => {
    if (rnd.chance(dt * 6)) P.alpha.emit({ pos: worldOf(grp, 0, 0.55, 0), posSpread: 0.08, vel: [0.02, 0.35, 0], spread: 0.05, life: [1.5, 2.8], size: [1, 2], sizeEnd: 3, color: '#e8e0d8', alpha: 0.28, fadeIn: 0.4 });
  };
  return grp;
}

export function torch(o) {
  const grp = new THREE.Group();
  grp.add(voxModel('torch', (w) => {
    for (let y = 0; y < 8; y++) box(w, 0, y, 0, 1, y + 1, 1, (px, py) => tone(WOOD, 0.3 + (py % 3 === 0 ? -0.1 : 0.05)));
    for (let y = 6; y < 8; y++) box(w, -1, y, -1, 2, y + 1, 2, (px, py, pz) => tone(CLOTH.cream, 0.3 + ((px + pz + py) & 1) * 0.15));
    box(w, -1, 8, -1, 2, 9, 2, IRON[2]);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.set(x, 9, z, IRON[3]);
    box(w, -1, 3, -1, 2, 4, 2, IRON[1]);
    box(w, 0, 2, -3, 1, 5, -1, IRON[2]);
    w.set(0, 3, -3, IRON[4]);
  }));
  const f = makeFlame(0.45, o.palette || 'fire');
  f.position.y = 0.34;
  grp.add(f);
  const col = o.palette === 'purple' ? 0xc86bff : o.palette === 'green' ? 0x5af0c8 : 0xff9a4a;
  const L = addLight(grp, new FlickerLight(col, o.intensity ?? 2.4, o.distance ?? 6, { amount: 0.3 }), [0, 0.5, 0.15]);
  grp.userData.update = (dt, t) => { f.userData.flame(t); L.tick(t); };
  grp.userData.emit = (P, dt) => { if (rnd.chance(dt * 6)) P.add.emit({ pos: worldOf(grp, 0, 0.5, 0), vel: [0, 0.8, 0], spread: 0.15, life: [0.4, 0.9], size: 1, color: o.palette === 'purple' ? ['#e0a0ff', '#c86bff'] : ['#ffd27a', '#ff8a3a'], glow: 3 }); };
  return grp;
}

export function brazier(o) {
  const pal = o.palette || 'fire';
  const grp = new THREE.Group();
  const coal = pal === 'purple' ? ['#8a3aff', '#e0a0ff'] : pal === 'green' ? ['#2ac88a', '#b0ffe0'] : pal === 'blue' ? ['#3a8aff', '#c0f0ff'] : ['#ff7a2a', '#ffd27a'];
  grp.add(voxModel('brazier' + (o.tone || 'iron') + pal, (w) => {
    const rim = o.tone === 'gold' ? GOLD : IRON;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, P = (r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
      seg(w, ...P(7.5, 0), ...P(6, 5), 0.6, IRON[2]); seg(w, ...P(6, 5), ...P(3, 10.5), 0.6, IRON[2]); seg(w, ...P(3, 10.5), ...P(4.2, 14.5), 0.6, IRON[3]);
      box(w, Math.round(Math.cos(a) * 7.5) - 1, 0, Math.round(Math.sin(a) * 7.5) - 1, Math.round(Math.cos(a) * 7.5) + 1, 1, Math.round(Math.sin(a) * 7.5) + 1, IRON[1]);
    }
    vessel(w, 0, 0, 13, 19, (t) => 2.5 + t * 5.6, (px, py, pz, d, t) => (t > 0.86 ? tone(rim, 0.6 + ((px + pz) & 1) * 0.12) : tone(IRON, 0.25 + (px < 0 ? 0.12 : 0) + ((py & 1) ? 0 : 0.06))), 1.2, 0.95);
    cyl(w, 0, 0, 17, 18, 6.4, 6.4, (px, py, pz) => (h3(px, py, pz, 3) > 0.45 ? glowC(h3(px, pz, 2, 1) > 0.6 ? coal[1] : coal[0]) : CHAR[1]));
  }));
  const f = makeFlame(0.9, pal);
  f.position.y = 0.74;
  grp.add(f);
  const col = pal === 'purple' ? 0xc86bff : pal === 'green' ? 0x5af0c8 : pal === 'blue' ? 0x6ad8ff : 0xff8a3a;
  const L = addLight(grp, new FlickerLight(col, o.intensity ?? 4, o.distance ?? 7, { amount: 0.3 }), [0, 1.1, 0.1]);
  grp.userData.update = (dt, t) => { f.userData.flame(t); L.tick(t); };
  grp.userData.emit = (P, dt) => { if (rnd.chance(dt * 12)) P.add.emit({ pos: worldOf(grp, 0, 0.95, 0), posSpread: 0.1, vel: [0, 1.1, 0], spread: 0.25, life: [0.5, 1.2], size: 1, color: pal === 'purple' ? ['#e0a0ff', '#c86bff', '#ff8af0'] : ['#ffd27a', '#ff8a3a'], glow: 3, drag: 0.5 }); };
  return grp;
}

export function lantern(o) {
  const grp = new THREE.Group();
  const col = o.glow || '#ffc060';
  const lan = voxModel('lantern' + col, (w) => {
    box(w, -2, 0, -2, 3, 1, 3, IRON[1]);
    box(w, -1, 0, -1, 2, 1, 2, IRON[2]);
    box(w, -1, 1, -1, 2, 6, 2, (px, py, pz) => glowC(py === 3 && (px === 0 || pz === 0) ? '#fff6d0' : col));
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) box(w, x, 1, z, x + 1, 6, z + 1, IRON[3]);
    for (const [x, z] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) { w.set(x, 1, z, IRON[2]); w.set(x, 5, z, IRON[2]); }
    box(w, -2, 6, -2, 3, 7, 3, IRON[2]);
    box(w, -1, 7, -1, 2, 8, 2, IRON[3]);
    w.set(0, 8, 0, IRON[2]);
    for (const [x, y] of [[-1, 9], [1, 9], [0, 10]]) w.set(x, y, 0, IRON[3]);
  }, { shadow: false });
  lan.position.y = o.hang ? -(o.hang + 0.37) : 0;
  grp.add(lan);
  if (o.hang) {
    const n = Math.max(1, Math.round(o.hang / PV));
    grp.add(voxModel('lanchain' + n, (w) => { for (let i = 0; i < n; i++) { const y = -i - 1; if (i % 3 === 1) { w.set(-1, y, 0, IRON[2]); w.set(1, y, 0, IRON[2]); } else w.set(0, y, 0, i % 3 ? IRON[3] : IRON[1]); } }, { shadow: false, hanging: true }));
  }
  if (o.light !== false) {
    const L = addLight(grp, new FlickerLight(new THREE.Color(col), o.intensity ?? 1.8, o.distance ?? 4.5, { amount: 0.12, speed: 5, jitter: 0.01 }), [0, lan.position.y + 0.16, 0]);
    grp.userData.update = (dt, t) => { L.tick(t); if (o.hang) grp.rotation.z = Math.sin(t * 1.3 + grp.id) * 0.04; };
  }
  return grp;
}

// ------------------------------------------------------------------ camp gear
export function tent(o) {
  const c = o.color || '#c8a46a', patch = o.patch || '#8a5a8a';
  const P = palOf(c), PP = palOf(patch);
  return voxModel('tent' + c + patch, (w) => {
    const H = 36, HW = 27, D = 20;
    let prev = HW;
    for (let y = 0; y <= H; y++) {
      const half = Math.round(HW * (1 - y / H));
      for (let z = -D; z <= D; z++) {
        for (const sx of [-1, 1]) for (let x = half; x <= Math.max(half, prev); x++) {
          const isPatch = sx < 0 && y > 10 && y < 22 && z > -9 && z < 4;
          let col = isPatch ? tone(PP, 0.5 + ((x + z) % 4 === 0 ? 0.12 : 0)) : tone(P, (sx < 0 ? 0.62 : 0.42) + ((z + 60) % 7 === 0 ? -0.14 : 0) + (y === 0 ? -0.15 : 0));
          if (isPatch && (z === -8 || z === 3 || y === 11 || y === 21) && (x + y + z) % 2) col = C('#f4e6c0');
          w.set(sx > 0 ? x : -x - 1, y, z, col);
        }
      }
      // back wall
      for (let x = -half; x < half; x++) w.set(x, y, -D - 1, tone(P, 0.32 + ((x + 60) % 7 === 0 ? -0.1 : 0)));
      // front: a strip of canvas at the top, the doorway below
      if (y > H * 0.62) for (let x = -half; x < half; x++) w.set(x, y, D + 1, tone(P, 0.5));
      prev = half;
    }
    // rolled-up door flaps tied with rope
    for (const sx of [-1, 1]) {
      seg(w, sx * 2, H - 4, D + 2, sx * HW * 0.85, 2, D + 2, 1.2, (px, py) => tone(P, 0.35 + (py & 1 ? 0.08 : 0)));
      for (const k of [0.35, 0.7]) { const x = sx * (2 + (HW * 0.85 - 2) * k), y = H - 4 - (H - 6) * k; w.set(Math.round(x), Math.round(y), D + 3, C('#c8a870')); w.set(Math.round(x), Math.round(y) + 1, D + 3, C('#8a6a40')); }
    }
    // ground cloth, a bedroll peeking out, poles, ridge, guy ropes and stakes
    box(w, -24, 0, -20, 24, 1, 20, (px, py, pz) => tone(palOf('#5a4a3a'), 0.4 + ((px + 60) % 9 === 0 ? -0.1 : 0)));
    cylX(w, -6, 6, 2.6, 15.5, 2.2, (px, py, pz, d) => (px === -6 || px === 5 ? tone(CLOTH.salmon, 0.75 - d * 0.4) : tone(CLOTH.salmon, 0.5 + ((px + 40) % 3 === 0 ? -0.12 : 0) - d * 0.2)));
    for (const z of [-D - 2, D + 2]) box(w, 0, 0, z, 1, H + 3, z + 1, (px, py) => tone(WOOD, 0.35 + (py % 5 === 0 ? -0.08 : 0)));
    box(w, 0, H + 1, -D - 3, 1, H + 2, D + 3, WOOD[2]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const st = [sx * 35, 0, sz * 27];
      rope(w, [[sx * 13, 20, sz * (D + 1)], [sx * 28, 10, sz * (D + 4)], [st[0], 2, st[2]]]);
      box(w, st[0], 0, st[2], st[0] + 1, 4, st[2] + 1, WOOD_PALE[2]);
    }
  });
}

export function sleepingbag(o) {
  const c = o.color || '#b04a3a', P = palOf(c);
  return voxModel('bag' + c, (w) => {
    box(w, -7, 0, -15, 8, 4, 20, (px, py, pz) => {
      const edge = px === -7 || px === 7 || pz === 19;
      if (edge && py === 3) return undefined;
      return tone(P, 0.45 + (py === 3 ? 0.12 : 0) + ((pz + 40) % 4 === 0 ? -0.14 : 0) + (edge ? -0.06 : 0));
    });
    box(w, -7, 4, -14, 8, 5, -8, (px, py, pz) => tone(palOf(mixC(C(c), C('#fff4e0'), 0.45)), 0.5 + ((px + pz) % 5 === 0 ? 0.1 : 0)));
    ell(w, 0.5, 4.2, -17, 5.5, 2.4, 2.8, (px, py, pz, d) => tone(CLOTH.cream, 0.75 - d * 0.3));
    for (let z = -8; z < 19; z += 2) w.set(8, 2, z, GOLD[3]);
  });
}

export function backpack(o) {
  const c = o.color || '#7a5a2a', P = palOf(c), S = palOf(mixC(C(c), C('#1c1428'), 0.4));
  return voxModel('pack' + c, (w) => {
    box(w, -6, 0, -4, 6, 17, 4, (px, py, pz) => {
      const corner = (px === -6 || px === 5) && (pz === -4 || pz === 3);
      if (corner && (py === 0 || py === 16)) return undefined;
      return tone(P, 0.42 + (px < -3 ? -0.08 : 0) + ((py + 40) % 6 === 0 ? -0.1 : 0));
    });
    box(w, -6, 11, 4, 6, 17, 5, (px, py) => tone(P, 0.62 + (py === 11 ? -0.15 : 0)));
    box(w, -4, 2, 4, 4, 8, 6, (px, py) => tone(P, 0.5 + (py === 7 ? -0.12 : 0)));
    box(w, -7, 3, -2, -6, 9, 2, tone(P, 0.35));
    for (const sx of [-3, 2]) box(w, sx, 4, 5, sx + 1, 17, 6, tone(S, 0.4));
    for (const sx of [-5, 4]) box(w, sx, 17, -3, sx + 1, 22, 3, tone(S, 0.45));
    cylX(w, -8, 8, 19.5, 0.5, 2.3, (px, py, pz, d) => tone(palOf('#3a6a8a'), 0.7 - d * 0.35 + ((px + 40) % 4 === 0 ? -0.12 : 0)));
    box(w, -1, 10, 5, 1, 12, 6, BRASS[3]); w.set(0, 11, 6, BRASS[1]);
    box(w, -1, 4, 6, 1, 6, 7, BRASS[2]);
    cyl(w, 7.5, 1, 6, 9, 1.5, 1.5, (px, py) => tone(STEEL, 0.5 + (py === 8 ? 0.2 : 0)));
    w.set(9, 7, 1, STEEL[2]); w.set(9, 8, 1, STEEL[2]);
  });
}

export function map() {
  return voxModel('map', (w) => {
    box(w, -9, 0, -6, 9, 1, 6, (px, py, pz) => {
      const trail = Math.abs(pz - Math.round(Math.sin(px * 0.35) * 3)) < 1 && (px & 1);
      if (trail) return C('#c05a4e');
      if ((px === 5 || px === 6) && (pz === 3 || pz === 4) && (px + pz) % 2 === 1) return C('#a83a3a');
      if (px > -7 && px < -2 && pz < -2 && pz > -5 && Math.abs(px + 4.5) <= (pz + 5)) return C('#7a6a5a');
      return tone(PAPER, 0.55 + (h3(px, pz, 1, 3) > 0.9 ? -0.15 : 0) + (Math.abs(px) > 7 ? -0.12 : 0));
    });
    for (const sx of [-1, 1]) cylZ(w, sx * 9.6, 1, -6, 6, 1.1, (px, py, pz, d) => tone(PAPER, 0.7 - d * 0.4));
    rock(w, -6.5, 1, -4.5, 1.3, 0.9, 1.1, STONE, 12, { floor: 0, cuts: 3 });
    rock(w, 6, 1, 4.2, 1.2, 0.8, 1, STONE, 13, { floor: 0, cuts: 3 });
  });
}

export function pickaxe() {
  return voxModel('pickaxe', (w) => {
    for (let y = 0; y < 18; y++) { const bow = Math.round(Math.sin((y / 18) * Math.PI) * 0.4); w.set(bow, y, 0, y < 4 ? tone(palOf('#5a3a2a'), 0.4 + (y & 1) * 0.15) : woodC(WOOD_PALE, 0, y, 3, 0.5)); }
    box(w, -1, 17, -1, 2, 20, 1, IRON[1]);
    for (let x = -8; x <= 8; x++) {
      if (x >= -1 && x <= 1) continue;
      const t = Math.abs(x) / 8, y = 18 - Math.round(t * t * 2.2) + (x < 0 ? 0 : 0), th = t > 0.75 ? 1 : 2;
      for (let k = 0; k < th; k++) w.set(x, y - k, 0, x < 0 ? tone(STEEL, 0.5 + (k === 0 ? 0.2 : -0.1)) : tone(STEEL, 0.55 + (k === 0 ? 0.25 : -0.05)));
      if (t < 0.6) w.set(x, y, 1, STEEL[1]);
    }
    w.set(-8, 15, 0, STEEL[4]); w.set(8, 16, 0, STEEL[4]);
  });
}

export function shovel() {
  return voxModel('shovel', (w) => {
    for (let y = 6; y < 21; y++) w.set(0, y, 0, woodC(WOOD_PALE, 0, y, 5, 0.5));
    torus(w, 0.5, 21.5, 0, 1.4, 0.6, 'z', WOOD[1]);
    box(w, -1, 5, -1, 2, 7, 1, IRON[1]);
    for (let y = 0; y < 6; y++) for (let x = -3; x <= 3; x++) {
      const hw = y < 2 ? 1 + y * 1.2 : 3;
      if (Math.abs(x) > hw) continue;
      w.set(x, y, Math.abs(x) >= 3 ? 1 : 0, tone(STEEL, 0.45 + (x < 0 ? 0.15 : 0) + (y === 0 ? 0.2 : 0)));
    }
  });
}

export function books() {
  return voxModel('books', (w) => {
    const cols = ['#8a2a2a', '#2a4a8a', '#2a6a3a', '#6a3a8a'];
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const hw = 4 - (i % 2), hd = 3 - (i % 2 ? 0 : 1), off = Math.round((h3(i, 1, 3, 2) - 0.5) * 2), P = palOf(cols[i]);
      box(w, -hw + off, y, -hd, hw + off, y + 2, hd, (px, py, pz) => {
        if (px === -hw + off) return (py === y) ? GOLD[2] : tone(P, 0.5);
        if (pz === hd - 1 || pz === -hd || px === hw + off - 1) return (py === y + 1 && px !== hw + off - 1) || px === hw + off - 1 ? tone(PAPER, 0.7) : tone(P, 0.45);
        return tone(P, 0.55 + (py === y + 1 ? 0.1 : 0));
      });
      y += 2;
    }
    box(w, 0, y, 0, 1, y + 2, 1, C('#f0e8d8'));
    w.set(0, y + 2, 0, glowC('#ffd890'));
  });
}

export function sack(o) {
  const c = o.color || '#b8986a', P = palOf(c);
  return voxModel('sack' + c + (o.ore || ''), (w) => {
    ell(w, 0, 5, 0, 5.5, 5.5, 4.6, (px, py, pz, d) => (py < 0 ? undefined : tone(P, 0.62 - d * 0.3 + (py < 3 ? -0.08 : 0) + ((px + py * 2) % 5 === 0 ? -0.12 : 0))));
    ell(w, 0.5, 10.5, 0.5, 2.5, 2.2, 2.2, (px, py) => tone(P, 0.5 + (py & 1) * 0.08));
    for (let k = -2; k <= 2; k++) w.set(k, 9, 3, C('#8a5a2e'));
    w.set(3, 8, 3, C('#8a5a2e')); w.set(3, 7, 3, C('#8a5a2e'));
    if (o.ore) { const O = palOf(o.ore); for (let i = 0; i < 3; i++) rock(w, (i - 1) * 1.6, 12.4, (i % 2) * 1.2, 1.2, 1, 1.1, O, 30 + i, { cuts: 3 }); }
  });
}

export function goldpile() {
  return voxModel('goldpile', (w) => {
    ell(w, 0, 0, 0, 7, 4.5, 5.8, (px, py, pz, d) => (py < 0 ? undefined : h3(px, py, pz, 4) > 0.94 ? glowC('#fff6c8') : tone(GOLD, 0.45 + (1 - d) * 0.3 + ((px + py + pz) % 3 === 0 ? 0.12 : 0) - (h3(px, py, pz, 5) > 0.8 ? 0.15 : 0))));
    for (let i = 0; i < 12; i++) { const a = h3(i, 1, 3, 1) * Math.PI * 2, r = 7.5 + h3(i, 2, 3, 1) * 3; const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r * 0.85); w.set(x, 0, z, i % 2 ? GOLD[3] : GOLD[2]); if (i % 3 === 0) w.set(x + 1, 0, z, GOLD[3]); }
    for (const [x, y, z, c] of [[2, 4, 1, '#ff4a6a'], [-2, 4, -1, '#4a9aff'], [0, 5, -2, '#5af07a']]) { w.set(x, y, z, glowC(c)); w.set(x, y + 1, z, glowC(mixC(C(c), C('#ffffff'), 0.5))); }
  });
}

export function logProp(o) {
  const len = o.length || 0.9, r = o.radius || 0.13;
  return voxModel('log' + len + r, (w) => {
    const L = ui(len) >> 1, R = u(r);
    cylX(w, -L, L, R, 0, R, (px, py, pz, d) => (px === -L || px === L - 1 ? ENDGRAIN[Math.round(Math.sqrt(d) * 3) % 3] : bark(px, py, pz, 5)));
    for (let k = -3; k <= 3; k++) for (let q = -1; q <= 1; q++) if (h3(k, q, 4, 2) > 0.3) w.set(2 + k, Math.round(R * 2), q, tone(MOSS, 0.5 + h3(k, q, 1, 1) * 0.3));
  });
}

// ------------------------------------------------------------------ storage
export function crate(o) {
  const s = (o.size || 10) * 0.06, S = Math.round(u(s));
  return voxModel('crate' + S + (o.label || ''), (w) => {
    const h = S >> 1, x0 = -h, x1 = S - h;
    // planked faces, darker frame on every edge, a diagonal brace on each side
    box(w, x0, 0, x0, x1, S, x1, (px, py, pz) => {
      const ex = px === x0 || px === x1 - 1, ey = py === 0 || py === S - 1, ez = pz === x0 || pz === x1 - 1;
      const n = (ex ? 1 : 0) + (ey ? 1 : 0) + (ez ? 1 : 0);
      if (n === 0) return undefined;
      if (n >= 2 || ((ex || ez) && (py < 2 || py > S - 3))) return woodC(WOOD, (px + pz) & 1, py, 3, 0.32);
      if (ex || ez) {
        const a = ex ? pz : px, rel = (a - x0) / (S - 1), diag = Math.abs(rel - (py / (S - 1))) < 1.2 / S;
        if (diag && py > 1 && py < S - 2) return woodC(WOOD, 1, py, 4, 0.35);
        if (py % 4 === 0) return WOOD_PALE[0];
        return woodC(WOOD_PALE, Math.floor(py / 4), a, 2, 0.48);
      }
      return (pz - x0) % 4 === 0 ? WOOD_PALE[0] : woodC(WOOD_PALE, Math.floor((pz - x0) / 4), px, 5, 0.55);
    });
    for (const [x, y] of [[x0 + 1, 1], [x1 - 2, 1], [x0 + 1, S - 2], [x1 - 2, S - 2]]) { w.set(x, y, x1, IRON[4]); w.set(x1, y, x, IRON[4]); }
    if (o.label) { const lx = 1, ly = Math.round(S * 0.55); box(w, lx - 2, ly - 1, x1, lx + 3, ly + 2, x1 + 1, (px, py) => (py === ly && (px & 1) ? C('#3a2a2a') : tone(PAPER, 0.7))); }
  });
}

export function barrel(o) {
  const lid = o.content || 'wood';
  return voxModel('barrel' + lid, (w) => {
    const H = 20;
    for (let y = 0; y < H; y++) {
      const t = y / (H - 1), r = 6.4 + Math.sin(t * Math.PI) * 1.25;
      const hoop = y === 1 || y === 6 || y === 13 || y === 18;
      cyl(w, 0, 0, y, y + 1, r, r, (px, py, pz, d) => {
        if (d < 0.6 && y > 0 && y < H - 1) return undefined;
        if (hoop) return h3(px, py, pz, 6) > 0.85 ? RUST[2] : tone(IRON, 0.4 + (px < 0 ? 0.15 : 0));
        const st = Math.floor((Math.atan2(pz, px) + Math.PI) * 2.7);
        return woodC(WOOD, st, py, 2, 0.45 + (px < 0 ? 0.08 : 0));
      });
    }
    if (lid === 'water') cyl(w, 0, 0, H - 2, H - 1, 6, 6, (px, py, pz) => (h3(px, pz, 2, 2) > 0.93 ? glowC('#bff4ff') : (NOAO | C(((px + pz) & 3) === 0 ? '#4a9ac0' : '#2e6a8a')) >>> 0));
    else cyl(w, 0, 0, H - 1, H, 6.2, 6.2, (px, py, pz) => (pz % 3 === 0 ? WOOD[1] : woodC(WOOD, Math.floor(pz / 3), px, 9, 0.5)));
    if (lid === 'ore') for (let i = 0; i < 5; i++) rock(w, Math.cos(i * 1.3) * 3, H + 1, Math.sin(i * 1.3) * 3, 1.8, 1.3, 1.6, palOf('#9a96a0'), 20 + i, { cuts: 3 });
  });
}

// ------------------------------------------------------------------ smithing
export function anvil() {
  return voxModel('anvil', (w) => {
    // stump with root flares and a sawn top
    cyl(w, 0, 0, 0, 8, 5, 4.4, (px, py, pz, d) => (py === 7 ? ENDGRAIN[Math.round(Math.sqrt(d) * 3) % 3] : bark(px, py, pz, 3)));
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.3; seg(w, Math.cos(a) * 7.5, 0.4, Math.sin(a) * 7.5, Math.cos(a) * 3.5, 4, Math.sin(a) * 3.5, 1.1, (px, py, pz) => bark(px, py, pz, i)); }
    box(w, -5, 3, -5, 5, 4, 5, (px, py, pz, d) => (Math.hypot(px + 0.5, pz + 0.5) > 4.6 && Math.hypot(px + 0.5, pz + 0.5) < 5.4 ? IRON[2] : undefined));
    // the anvil: foot, waist, face, heel and a tapering horn toward -x
    box(w, -4, 8, -2, 5, 9, 2, IRON[1]);
    box(w, -3, 9, -2, 4, 10, 2, IRON[1]);
    box(w, -2, 10, -1, 3, 12, 1, IRON[2]);
    box(w, -3, 12, -2, 7, 14, 2, (px, py) => (py === 13 ? tone(STEEL, 0.75 + (px & 1) * 0.08) : tone(IRON, 0.4 + (px > 4 ? 0.1 : 0))));
    for (let x = -4; x >= -10; x--) { const t = (-4 - x) / 6, r = 1.6 * (1 - t) + 0.4; ell(w, x + 0.5, 12.8 - t * 0.6, 0, 0.8, r, r, tone(IRON, 0.45 + (1 - t) * 0.1)); }
    w.set(5, 13, 0, C('#120c10'));
    box(w, 6, 12, -2, 7, 13, 2, IRON[1]);
  });
}

export function forge(o) {
  const grp = new THREE.Group();
  grp.add(voxModel('forge', (w) => {
    // brick hearth with mortar lines and a soot-stained front
    box(w, -14, 0, -9, 14, 13, 9, (px, py, pz) => {
      const row = Math.floor(py / 2), off = row % 2 ? 2 : 0;
      if (py % 2 === 1 && py > 0) return C('#3a2a2e');
      if ((px + off + 40) % 4 === 0) return C('#3a2a2e');
      const soot = pz === 8 && py > 6 && Math.abs(px) < 6;
      return soot ? tone(BRICK, 0.2) : tone(BRICK, 0.45 + (h3(Math.floor((px + off) / 4), row, pz, 2) - 0.5) * 0.25);
    });
    for (const z of [-8, 7]) for (let i = 0; i < 4; i++) rock(w, -10.5 + i * 7, 14, z + 0.5, 3.4, 1.6, 1.4, STONE, 10 + i + z, { cuts: 4 });
    for (const x of [-13, 13]) rock(w, x + 0.5, 14, 0, 1.4, 1.6, 6, STONE, 20 + x, { cuts: 4 });
    box(w, -11, 13, -6, 12, 14, 7, (px, py, pz) => (h3(px, py, pz, 5) > 0.35 ? glowC(h3(px, pz, 2, 4) > 0.6 ? '#ffd25e' : '#ff7a2a') : CHAR[1]));
    // hood on iron legs, chimney with a cap
    for (const x of [-10, 10]) for (const z of [-5, 5]) box(w, x, 14, z, x + 1, 21, z + 1, IRON[2]);
    for (let y = 20; y < 26; y++) { const t = (y - 20) / 5, hx = Math.round(12 - t * 7.5), hz = Math.round(7 - t * 4); box(w, -hx, y, -hz, hx + 1, y + 1, hz + 1, (px, py, pz) => (Math.abs(px) < hx - 1 && Math.abs(pz) < hz - 1 && py < 25 ? undefined : tone(IRON, 0.32 + (px < 0 ? 0.1 : 0) + (py === 20 ? -0.1 : 0)))); }
    cyl(w, 0.5, 0.5, 25, 33, 2.6, 2.4, (px, py) => tone(IRON, 0.35 + (py % 3 === 0 ? 0.12 : 0) + (px < 0 ? 0.1 : 0)));
    cyl(w, 0.5, 0.5, 33, 34, 3.4, 3.4, IRON[3]);
    // bellows on the left: two boards and a pleated leather bag, brass nozzle
    for (const dy of [-2, 2]) for (let x = -24; x <= -16; x++) { const hw = Math.round(2.5 - (x + 24) * 0.22); box(w, x, 8 + dy, -hw, x + 1, 9 + dy, hw + 1, woodC(WOOD, 0, x, 6, 0.4)); }
    for (let x = -24; x <= -17; x++) { const hw = Math.round(2.2 - (x + 24) * 0.2); box(w, x, 7, -hw, x + 1, 10, hw + 1, ((x + 40) % 2 ? tone(palOf('#6a4a32'), 0.4) : tone(palOf('#6a4a32'), 0.55))); }
    box(w, -16, 8, 0, -14, 9, 1, BRASS[3]);
    seg(w, -31, 7.5, 0.5, -24.5, 8.2, 0.5, 0.5, WOOD_PALE[3]);
    // tongs leaning on the side
    seg(w, 14.5, 0, 8, 13, 15.5, 7.5, 0.5, IRON[3]); seg(w, 14.5, 0, 9, 13, 15.5, 8.5, 0.5, IRON[2]);
  }));
  const L = addLight(grp, new FlickerLight(0xff7a2a, o.intensity ?? 4, 6, { amount: 0.22 }), [0, 0.75, 0.3]);
  grp.userData.update = (dt, t) => L.tick(t);
  grp.userData.emit = (P, dt) => {
    if (rnd.chance(dt * 10)) P.add.emit({ pos: worldOf(grp, rnd.float(-0.4, 0.4), 0.58, rnd.float(-0.2, 0.2)), vel: [0, 0.9, 0], spread: 0.35, life: [0.5, 1.1], size: 1, color: ['#ffd27a', '#ff8a3a'], glow: 3, drag: 0.4 });
    if (rnd.chance(dt * 3)) P.alpha.emit({ pos: worldOf(grp, 0, 1.38, 0), posSpread: 0.05, vel: [0.04, 0.5, 0], spread: 0.05, life: [2, 3], size: [1, 2], sizeEnd: 3, color: '#3a3434', alpha: 0.4 });
  };
  return grp;
}

// ------------------------------------------------------------------ chests (with a hinged voxel lid)
const CHESTS = {
  wood: { body: WOOD_PALE, band: IRON, trim: GOLD, loot: ['#ffd25e', '#fff6c8'], inside: 0xffd060 },
  iron: { body: ['#3a3a4e', '#56566e', '#7a7a92', '#a0a0b8', '#c8c8dc'].map(C), band: ['#1a1a24', '#2a2a36', '#3e3e4e', '#5a5a6a', '#7a7a8a'].map(C), trim: STEEL, loot: ['#ffd25e', '#fff6c8'], inside: 0xffd060 },
  crystal: { body: ['#2a2a5a', '#3e4a8a', '#5a6ac0', '#7a90e0', '#a8c0ff'].map(C), band: ['#6ad8ff'], glowBand: true, trim: ['#9ae8ff', '#c0f4ff', '#e0f8ff', '#ffffff', '#ffffff'].map(C), loot: ['#9ae8ff', '#e0fbff'], inside: 0x9ae8ff },
  bone: { body: BONE, band: ['#2a1a3a', '#3e2a4e', '#5a3a6a', '#7a4a8a', '#9a6aaa'].map(C), trim: ['#5a2a8a', '#8a4ac8', '#c86bff', '#e0a8ff', '#f8e0ff'].map(C), loot: ['#c86bff', '#f0c8ff'], inside: 0xc86bff },
  gold: { body: ['#3a1418', '#5a1e22', '#8e3e2c', '#b05a3a', '#d07a4a'].map(C), band: GOLD, trim: GOLD, loot: ['#ffd25e', '#ff4a6a'], inside: 0xffe08a },
};
export function chest(o) {
  const kind = CHESTS[o.kind] ? o.kind : 'wood', K = CHESTS[kind];
  const W = 11, Hh = 11, Z0 = -8, Z1 = 7; // x −11..10, y 0..10, z −8..6 (15 deep)
  const band = (px, py, pz) => (K.glowBand ? glowC(K.band[0]) : tone(K.band, 0.45 + (h3(px, py, pz, 2) > 0.9 ? 0.15 : 0)));
  const grp = new THREE.Group();
  grp.add(voxModel('chestB' + kind, (w) => {
    box(w, -W, 0, Z0, W, Hh, Z1, (px, py, pz) => {
      const shell = px === -W || px === W - 1 || pz === Z0 || pz === Z1 - 1 || py === 0;
      if (!shell) return py >= Hh - 3 ? (h3(px, py, pz, 7) > 0.35 ? glowC(K.loot[h3(px, pz, 1, 2) > 0.7 ? 1 : 0]) : undefined) : undefined;
      const corner = (px === -W || px === W - 1) && (pz === Z0 || pz === Z1 - 1);
      if (corner || ((px === -W || px === W - 1) && (py < 2 || py > Hh - 3)) || ((pz === Z0 || pz === Z1 - 1) && (py < 2 || py > Hh - 3) && Math.abs(px) > W - 4)) return band(px, py, pz);
      if (Math.abs(px + 0.5) > 6 && Math.abs(px + 0.5) < 8.5 && (pz === Z0 || pz === Z1 - 1)) return band(px, py, pz);
      if (kind === 'crystal' || kind === 'iron') return tone(K.body, 0.42 + ((py + 40) % 4 === 0 ? -0.12 : 0) + (px < 0 ? 0.08 : 0));
      return py % 4 === 3 ? K.body[0] : woodC(K.body, Math.floor(py / 4), px + pz, 4, 0.48);
    });
    // lock plate and keyhole
    box(w, -2, 5, Z1, 2, 9, Z1 + 1, (px, py) => tone(K.trim, 0.6 + (py === 8 ? 0.2 : 0)));
    w.set(-1, 6, Z1 + 1, C('#140c10')); w.set(-1, 7, Z1 + 1, C('#140c10'));
    // rivets
    for (const x of [-10, 9]) for (const y of [1, 9]) w.set(x, y, Z1, tone(K.trim, 0.8));
    if (kind === 'bone') for (const sx of [-1, 1]) { ell(w, sx * 9.5, 4, Z1, 1.8, 1.8, 1.4, (px, py, pz) => tone(BONE, 0.7)); w.set(sx * 9.5 - 1, 4, Z1 + 1, glowC('#c86bff')); w.set(sx * 9.5, 4, Z1 + 1, glowC('#c86bff')); }
    if (kind === 'gold') for (const sx of [-1, 1]) { w.set(sx * 4, 7, Z1, glowC('#ff4a6a')); w.set(sx * 4, 8, Z1, glowC('#ff8aa0')); }
  }));
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, Hh * PV, Z0 * PV);
  const D = Z1 - Z0;
  lidPivot.add(voxModel('chestL' + kind, (w) => {
    for (let z = 0; z < D; z++) {
      const t = (z + 0.5) / D, top = Math.round(Math.sin(t * Math.PI) * 4.6);
      for (let y = 0; y <= top; y++) for (let x = -W; x < W; x++) {
        const shell = y >= top - 1 || x === -W || x === W - 1 || z === 0 || z === D - 1;
        if (!shell) continue;
        const strap = Math.abs(x + 0.5) > 6 && Math.abs(x + 0.5) < 8.5 && y >= top - 1;
        if (strap || ((x === -W || x === W - 1) && y >= top - 1)) { w.set(x, y, z, band(x, y, z)); continue; }
        w.set(x, y, z, kind === 'crystal' || kind === 'iron' ? tone(K.body, 0.5 + (z % 3 === 0 ? -0.1 : 0)) : z % 3 === 2 ? K.body[0] : woodC(K.body, Math.floor(z / 3), x, 6, 0.55));
      }
    }
    box(w, -2, -1, D, 2, 2, D + 1, (px, py) => tone(K.trim, 0.7));
    if (kind === 'crystal') for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) w.set(sx * 9, 5 + k, 7 - (k >> 1) * sx, glowC(k > 3 ? '#e0fbff' : '#9ae8ff'));
  }));
  grp.add(lidPivot);
  const inner = new THREE.PointLight(K.inside, 0, 1.6, 2);
  inner.position.set(0, 0.6, 0);
  grp.add(inner);
  grp.userData.lights = [inner];
  grp.userData.lid = lidPivot;
  grp.userData.open = (t) => { lidPivot.rotation.x = -t * 1.9; inner.intensity = t * 1.2; };
  return grp;
}

// ------------------------------------------------------------------ mine workings
export function minecart(o) {
  const ore = o.ore || '#8e8a92', O = palOf(ore);
  return voxModel('cart' + ore + (o.empty ? 'e' : ''), (w) => {
    // sloped riveted walls (rusted iron), a wooden chassis, flanged wheels
    for (let y = 5; y < 20; y++) {
      const t = (y - 5) / 14, hx = Math.round(12.5 + t * 2.5), hz = Math.round(7 + t * 2);
      box(w, -hx, y, -hz, hx + 1, y + 1, hz + 1, (px, py, pz) => {
        const wall = Math.abs(px) >= hx - (px > 0 ? -1 : 0) || px === -hx || px === hx || pz === -hz || pz === hz;
        if (!wall && py > 5) return undefined;
        if (py === 19 || py === 18) return tone(IRON, 0.55 + (py === 19 ? 0.15 : 0));
        const strap = (Math.abs(px) % 9 === 4 && (pz === -hz || pz === hz)) || ((px === -hx || px === hx) && Math.abs(pz) === 3);
        if (strap) return (py % 4 === 1) ? IRON[4] : IRON[2];
        return h3(px, py, pz, 4) > 0.75 ? RUST[1] : tone(RUST, 0.45 + (h3(px >> 1, py >> 2, pz, 5) - 0.5) * 0.3 + (px < 0 ? 0.08 : 0));
      });
    }
    box(w, -14, 3, -5, 15, 5, 6, (px, py, pz) => woodC(WOOD, pz >> 2, px, 5, 0.38));
    for (const x of [-8, 8]) {
      box(w, x, 3, -8, x + 1, 4, 9, IRON[2]);
      for (const z of [-8, 8]) for (let dz = 0; dz < 2; dz++) torus(w, x + 0.5, 3.5, z + (z > 0 ? dz : -dz), 2.6, dz ? 0.9 : 0.75, 'z', (px, py, pz) => (dz ? IRON[1] : tone(IRON, 0.35 + ((px + py) & 1) * 0.1)));
      for (const z of [-8, 8]) { w.set(x, 3, z, IRON[4]); w.set(x, 4, z, IRON[3]); }
    }
    for (const sx of [-1, 1]) box(w, sx * 17, 5, -2, sx * 17 + 2, 7, 3, IRON[1]);
    if (!o.empty) {
      for (let i = 0; i < 12; i++) { const x = (h3(i, 1, 6, 1) - 0.5) * 22, z = (h3(i, 2, 6, 1) - 0.5) * 12, s = 0.8 + h3(i, 3, 6, 1) * 0.6; rock(w, x, 18.5 - Math.abs(x) * 0.08, z, 3 * s, 2.4 * s, 2.6 * s, i % 3 ? O : palOf(mixC(C(ore), C('#1c1428'), 0.25)), 60 + i, { cuts: 4 }); }
      for (let i = 0; i < 6; i++) w.set(Math.round((h3(i, 4, 6, 1) - 0.5) * 18), 21 + (i % 2), Math.round((h3(i, 5, 6, 1) - 0.5) * 9), glowC(mixC(C(ore), C('#ffffff'), 0.5)));
    }
  });
}

export function rails(o) {
  const L = o.length || 6, N = ui(L);
  return voxModel('rails' + L.toFixed(2), (w) => {
    const x0 = -(N >> 1), n = Math.max(1, Math.floor(L / 0.42)), step = N / n;
    for (let i = 0; i < n; i++) {
      const cx = Math.round(x0 + (i + 0.5) * step), jz = Math.round((h3(i, 2, 7, 1) - 0.5) * 1.5);
      box(w, cx - 1, 0, -7 + jz, cx + 2, 1, 8 + jz, (px, py, pz) => woodC(WOOD, px, pz, i, 0.36));
    }
    for (const z of [-5, 4]) for (let x = x0; x < x0 + N; x++) {
      w.set(x, 1, z, IRON[1]); w.set(x, 1, z + 1, IRON[1]);
      w.set(x, 2, z, tone(IRON, 0.5)); w.set(x, 2, z + 1, h3(x, 2, z, 4) > 0.88 ? RUST[2] : tone(STEEL, 0.75));
    }
  });
}

export function support(o) {
  const wv = o.width || 22, hv = o.height || 30;
  return voxModel('support' + wv + 'x' + hv, (w) => {
    const W = wv * 2, H = hv * 2, hw = W >> 1;
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -hw - 2 : hw - 2;
      box(w, x0, 0, -2, x0 + 4, H, 2, (px, py, pz) => woodC(WOOD, px, py, sx + 3, 0.4 + (px === x0 ? -0.08 : 0) + (py % 17 === 0 ? -0.15 : 0)));
      rock(w, x0 + 2, 0.5, 0, 4, 1.6, 3.4, STONE, sx + 4, { floor: 0, cuts: 4 });
      seg(w, x0 + 2 - sx * 1, H - 16, 0, x0 + 2 - sx * 13, H - 2, 0, 1.3, (px, py, pz) => woodC(WOOD, 1, px + py, 7, 0.45));
      box(w, x0 - 1, H - 6, 2, x0 + 5, H - 1, 3, IRON[2]);
      for (const y of [H - 5, H - 2]) for (const x of [x0, x0 + 3]) w.set(x, y, 3, IRON[4]);
    }
    box(w, -hw - 6, H, -3, hw + 6, H + 7, 3, (px, py, pz) => woodC(WOOD, py >> 2, px, 9, 0.46 + (py === H + 6 ? 0.12 : 0)));
    box(w, hw - 7, H - 1, -2, hw - 2, H, 2, WOOD_PALE[2]);
    for (let k = 0; k < 4; k++) w.set(7 + (k === 3 ? 1 : 0), H - 2 - k, 3, IRON[3]);
  });
}

export function ladder(o) {
  const h = o.height || 30;
  return voxModel('ladder' + h, (w) => {
    const H = Math.round(h * 1.5);
    for (const x of [-7, 6]) box(w, x, 0, -1, x + 2, H, 1, (px, py) => woodC(WOOD_PALE, px, py, 3, 0.4));
    for (let y = 5; y < H - 1; y += 7) {
      box(w, -5, y, 0, 6, y + 1, 1, (px) => woodC(WOOD_PALE, 2, px, y, 0.55));
      for (const x of [-7, 7]) { w.set(x, y + 1, 1, C('#c8a870')); w.set(x, y, 1, C('#8a6a40')); }
    }
  });
}

export function elevator(o) {
  const grp = new THREE.Group();
  grp.add(voxModel('elevator', (w) => {
    box(w, -19, 1, -16, 20, 3, 17, (px, py, pz) => (py === 1 ? WOOD[1] : (px + 60) % 4 === 0 ? WOOD_PALE[0] : woodC(WOOD_PALE, Math.floor((px + 60) / 4), pz, 5, 0.48)));
    for (const z of [-16, 15]) box(w, -20, 0, z, 21, 2, z + 2, (px, py, pz) => woodC(WOOD, 0, px, 4, 0.35));
    for (const [x, z] of [[-19, -16], [18, -16], [-19, 14], [18, 14]]) box(w, x, 0, z, x + 3, 45, z + 3, (px, py, pz) => woodC(WOOD, px, py, 6, 0.4 + (py % 12 === 0 ? -0.12 : 0)));
    for (const z of [-16, 14]) box(w, -20, 44, z, 22, 47, z + 3, (px, py, pz) => woodC(WOOD, 1, px, 8, 0.45));
    box(w, -1, 45, -16, 2, 48, 17, (px, py, pz) => woodC(WOOD, 2, pz, 9, 0.42));
    for (const z of [-16, 15]) box(w, -19, 16, z, 20, 17, z + 1, (px) => woodC(WOOD_PALE, 3, px, 2, 0.5));
    box(w, 18, 16, -15, 19, 17, 15, WOOD_PALE[2]);
    torus(w, 0.5, 49.5, 0.5, 3, 0.8, 'z', (px, py) => tone(IRON, 0.45 + ((px + py) & 1) * 0.12));
    w.set(0, 49, 0, IRON[4]);
    box(w, -3, 3, -12, 4, 9, -7, (px, py) => tone(IRON, 0.35 + (py === 8 ? 0.15 : 0)));
    seg(w, 0.5, 9, -9.5, 2, 15, -9, 0.5, STEEL[3]);
    w.set(2, 15, -9, glowC('#ff4a3a')); w.set(2, 16, -9, glowC('#ff8a7a'));
  }));
  grp.add(voxModel('elevropes', (w) => { for (const x of [-15, 15]) for (let y = 47; y < 47 + 350; y++) w.set(x, y, 0, (y & 1) ? C('#c8a870') : C('#8a6a40')); }, { shadow: false }));
  return grp;
}

export function ropebridge(o) {
  const L = o.length || 8, sag = o.sag ?? 0.35;
  const yAt = (x) => -sag * (1 - Math.pow((2 * x) / L, 2));
  const grp = new THREE.Group();
  grp.add(voxModel('bridge' + L.toFixed(2) + sag + (o.broken ? 'b' + (o.gap ?? 0) : ''), (w) => {
    const N = ui(L), x0 = -(N >> 1), n = Math.floor(L / 0.2), step = N / n;
    const pals = [WOOD_PALE, WOOD, palOf('#8a6a4a')];
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * step, xm = cx * PV;
      if (o.broken && Math.abs(xm - (o.gap ?? 0)) < 0.5) continue;
      const y = Math.round(u(yAt(xm))), hz = Math.round(8 + h3(i, 3, 4, 1) * 2), jz = Math.round((h3(i, 5, 4, 1) - 0.5) * 2);
      box(w, Math.round(cx) - 2, y - 1, -hz + jz, Math.round(cx) + 2, y, hz + jz, (px, py, pz) => woodC(pals[i % 3], i, pz, i, 0.45 + (h3(i, 7, 1, 1) > 0.8 ? -0.12 : 0)));
    }
    for (const z of [-9, 9]) for (const hgt of [0, 15.5]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const x = x0 + (i / 24) * N; pts.push([x, u(yAt(x * PV)) * (hgt > 1 ? 0.75 : 1) + hgt, z]); }
      rope(w, pts);
    }
    for (let i = 0; i <= Math.floor(L / 0.8); i++) for (const z of [-9, 9]) { const x = x0 + i * 20, y = u(yAt(x * PV)); for (let k = 0; k < 15; k++) w.set(Math.round(x), Math.round(y + k), z, (k & 1) ? C('#c8a870') : C('#8a6a40')); }
  }));
  grp.userData.yAt = yAt;
  return grp;
}

export function signpost() {
  return voxModel('signpost', (w) => {
    box(w, -1, 0, -1, 1, 30, 1, (px, py) => woodC(WOOD, px, py, 5, 0.4 + (py === 29 ? 0.1 : 0)));
    rock(w, 0, 0.5, 0, 3, 1.5, 2.5, STONE, 5, { floor: 0, cuts: 4 });
    const arrow = (y, dir, z) => {
      for (let i = 0; i < 11; i++) {
        const x = dir > 0 ? 1 + i : -2 - i, hh = i > 8 ? 10 - i : 2;
        for (let k = -hh; k <= hh; k++) w.set(x, y + k, z, (k === 0 && i > 1 && i < 8 && (i & 1)) ? C('#3a2a2a') : woodC(WOOD_PALE, k + 2, x, 2, 0.5 + (Math.abs(k) === hh ? -0.12 : 0)));
      }
      w.set(dir > 0 ? 2 : -3, y, z + 1, IRON[4]);
    };
    arrow(24, 1, 1); arrow(18, -1, 1);
  });
}

// ------------------------------------------------------------------ the travelling merchant's cart
export function merchantcart(o, B) {
  const grp = new THREE.Group();
  grp.add(voxModel('mcart', (w) => {
    const RED = ['#3a1418', '#5a1e22', '#8e3e2c', '#b05a3a', '#d07a4a'].map(C);
    box(w, -27, 12, -15, 28, 14, 16, (px, py, pz) => ((pz + 40) % 5 === 0 ? RED[0] : woodC(RED, Math.floor((pz + 40) / 5), px, 11, 0.48)));
    for (const z of [-15, 15]) box(w, -27, 14, z, 28, 23, z + 1, (px, py) => (py % 3 === 2 ? RED[0] : woodC(RED, Math.floor(py / 3), px, 12, 0.5)));
    for (const x of [-27, 27]) box(w, x, 14, -15, x + 1, 23, 16, (px, py, pz) => (py % 3 === 2 ? RED[0] : woodC(RED, Math.floor(py / 3), pz, 13, 0.45)));
    for (const z of [-15, 15]) box(w, -28, 23, z, 29, 24, z + 1, WOOD[1]);
    for (const x of [-16, 16]) for (const z of [-17, 16]) {
      torus(w, x + 0.5, 8.5, z, 7.2, 0.9, 'z', (px, py) => tone(WOOD, 0.3 + ((px + py) & 1) * 0.1));
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; seg(w, x + 0.5, 8.5, z + 0.5, x + 0.5 + Math.cos(a) * 6.5, 8.5 + Math.sin(a) * 6.5, z + 0.5, 0.5, WOOD_PALE[2]); }
      box(w, x - 1, 7, z, x + 2, 10, z + 1, IRON[2]);
    }
    box(w, -17, 7, -2, 18, 9, 2, WOOD[1]);
    box(w, -1, 8, -17, 2, 9, 18, IRON[2]);
    for (const [x, z] of [[-26, -14], [26, -14], [-26, 14], [26, 14]]) box(w, x, 14, z, x + 1, 50, z + 1, (px, py) => woodC(WOOD, 0, py, x, 0.4));
    // striped canopy with a scalloped valance
    for (let x = -30; x <= 30; x++) for (let z = -17; z <= 17; z++) {
      const y = Math.round(50 + Math.cos((z / 17) * (Math.PI / 2)) * 5.5);
      const stripe = Math.floor((x + 60) / 5) % 2;
      w.set(x, y, z, stripe ? tone(CLOTH.salmon, 0.6 + (z === 0 ? 0.1 : 0)) : tone(CLOTH.cream, 0.7));
    }
    for (const z of [-18, 18]) for (let x = -30; x <= 30; x++) { const k = (x + 60) % 5; const stripe = Math.floor((x + 60) / 5) % 2; for (let d = 0; d < (k === 2 ? 3 : k === 1 || k === 3 ? 2 : 1); d++) w.set(x, 50 - d, z, stripe ? CLOTH.salmon[1] : CLOTH.cream[2]); }
    // goods: ore sacks, a crate of glowing gems, hanging copper pots
    for (const [x, z, c] of [[-15, -4, '#c8743a'], [-4, -6, '#9aa3b2']]) {
      ell(w, x, 18, z, 4.5, 4.5, 3.8, (px, py, pz, d) => (py < 14 ? undefined : tone(CLOTH.cream, 0.6 - d * 0.3 + ((px + py) % 5 === 0 ? -0.1 : 0))));
      for (let i = 0; i < 3; i++) rock(w, x + (i - 1) * 1.6, 22.5, z + (i % 2), 1.2, 1, 1.1, palOf(c), 160 + i, { cuts: 3 });
    }
    box(w, 8, 14, -7, 20, 21, 3, (px, py, pz) => (py === 20 && px > 8 && px < 19 && pz > -7 && pz < 2 ? (h3(px, pz, 1, 2) > 0.45 ? glowC(h3(px, pz, 2, 2) > 0.5 ? '#b06bff' : '#6ad8ff') : CHAR[1]) : woodC(WOOD_PALE, py >> 1, px + pz, 9, 0.48)));
    for (const [x, c] of [[-20, '#c8743a'], [-10, '#9aa0aa'], [0, '#e0c060'], [10, '#5a8a3a'], [20, '#9a3a5a']]) {
      for (let y = 42; y < 47; y++) w.set(x, y, 15, C('#8a6a40'));
      vessel(w, x + 0.5, 15.5, 38, 42, (t) => 1.2 + Math.sin(t * Math.PI) * 1.3, (px, py) => tone(palOf(c), 0.5 + (px < x ? 0.12 : 0)));
    }
    // painted sign on the canopy front
    box(w, -13, 56, 17, 14, 62, 18, (px, py) => (py === 56 || py === 61 || px === -13 || px === 13 ? WOOD[1] : C('#c05a4e')));
    text(w, -9, 60, 18, 'WARES', C('#fff0c8'));
  }));
  const lan = B.lantern({ hang: 0.15, intensity: 2.2, distance: 5 });
  lan.position.set(1.0, 1.85, 0.62);
  grp.add(lan);
  grp.userData.lights = lan.userData.lights;
  return grp;
}
