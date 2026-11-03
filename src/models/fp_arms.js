// First-person arms: the chosen forger's chibi gloves and sleeves, seen from behind their own eyes.
// Parent `arms.group` to the camera (camera space: -Z forward, +Y up, +X right). Each arm is a
// short two-bone chain from a fixed shoulder below the view to the hand; animations place the
// hands (position + rotation in camera space) and the elbows follow by IK, so poses read like
// key-framed FP animation: a wind-up, a fast smear through the strike, a hold, a recovery.
//
//   const arms = buildFPArms('bran'); camera.add(arms.group);
//   arms.hold('weapon', buildWeaponMesh(w))   // 'weapon' | 'pickaxe' | 'map' | 'torch' | 'pet' | 'none'
//   arms.play('swing')                        // see ANIMS; one-shots return to the idle/walk/run loop
//   arms.update(dt, { speed })                // speed in m/s picks idle / walk / run
//   arms.impactTime('swing'), arms.handWorld('R', v3), arms.tipWorld(v3), arms.setMapTexture(tex)
// Voxels are 0.008 m: fine enough to read stitching and rivets this close to the lens.
import * as THREE from 'three';
import { VPart, voxToon, voxGlow, hash } from './vox_char_kit.js';
import { buildWeaponMesh } from './weapons3d.js';
import { buildPet } from './pet.js';

export const FP_VS = 0.008;
const VS = FP_VS;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
const inQ = (t) => t * t;
const outQ = (t) => 1 - (1 - t) * (1 - t);
const outBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const G = (c) => ({ glow: true, c });

// ------------------------------------------------------------------ palettes (match the chibi crew)
const PAL = {
  bran: {
    shirt: ['#1a2436', '#24344c', '#30476a', '#45628a'], skin: ['#7a4a30', '#a0663e', '#c08050', '#dca070'],
    leather: ['#28150b', '#3c2313', '#56341c', '#74492a'], iron: ['#181a20', '#272b33', '#3d434c', '#6c7480'],
    brass: ['#6a4412', '#a8761e', '#dca838', '#ffe48a'], coal: ['#c83a08', '#ff7a14', '#ffb83a', '#fff0b0'],
  },
  elio: {
    robe: ['#22163c', '#302058', '#442e78', '#5c429c'], lining: ['#0c2e40', '#124660', '#1a6282', '#2c84a8'],
    trim: ['#7a4a10', '#b8801e', '#f0bc40', '#ffe89a'], glove: ['#120e16', '#1c1622', '#282030', '#382e42'], rune: '#78f0ff',
  },
  durgan: {
    mail: ['#262a32', '#3a404a', '#56606c', '#828c9a'], leather: ['#28170b', '#3c2513', '#56371d', '#74502c'],
    bronze: ['#56300e', '#8c5420', '#c88634', '#f2c066'], fur: ['#28190c', '#3c2a16', '#584024', '#785a36'], ore: '#de88ff',
  },
  clover: {
    shirt: ['#86806a', '#aea68a', '#d2caa8', '#ece4cc'], vest: ['#381e0c', '#563216', '#764822', '#966232'],
    gold: ['#7a5010', '#b8841e', '#f0c03a', '#fff0a0'], fur: ['#a49484', '#c8bcac', '#e6ded2', '#ffffff'], pad: ['#c46a7a', '#e88a9a', '#ffb0bc'],
  },
};
const clothT = (R, n = 7) => (x, y, z) => { const f = Math.sin(Math.atan2(x + 0.5, z + 0.5) * n + y * 0.12); return f > 0.82 ? R[1] : f < -0.9 ? R[3] : R[2]; };
const hideT = (R, s = 1) => (x, y, z) => (hash(x, y, z, s + 7) > 0.975 ? R[3] : hash(x >> 2, y >> 2, z >> 2, s) > 0.84 ? R[1] : R[2]);
const mailT = (R) => (x, y, z) => (((x + y) & 1) ^ ((z + y) & 1) ? R[1] : R[3]);
const furT = (R, s = 4) => (x, y, z) => R[1 + Math.floor(hash(x, y >> 1, z, s) * 3)];
const metalT = (R, s = 2) => (x, y, z) => ((y + (x >> 2) + (z >> 3) + 99) % 9 === 0 ? R[3] : hash(x >> 1, y >> 1, z >> 1, s) > 0.92 ? R[1] : R[2]);
/** Recolour the surface where test holds. */
const skin = (P, test, col) => P.paint((x, y, z, c) => (test(x, y, z) && P.surface(x, y, z) ? (typeof col === 'function' ? col(x, y, z, c) : col) : undefined));
/** A ring of studs around a part lying along Y at height y. */
function studRing(P, y, n, col, r0 = 16) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, sx = Math.sin(a), cz = Math.cos(a);
    for (let r = r0; r >= 0; r -= 0.5) { const x = Math.floor(sx * r), z = Math.floor(cz * r); if (P.has(x, y, z)) { P.set(Math.floor(sx * (r + 1)), y, Math.floor(cz * (r + 1)), col); break; } }
  }
}

// ------------------------------------------------------------------ the arm parts, per hero (voxel units)
// Segments are painted along -Y from their joint; hands sit at the wrist with the knuckles toward -Z.
const L1 = 0.21, L2 = 0.2; // upper arm and forearm (m): longer than the chibi's, so the hands reach into view
const nU = Math.round(L1 / VS), nF = Math.round(L2 / VS);

const DESIGN = {
  bran: {
    upper(P) { P.cap([0, 2, 0], [0, -nU, 0], 7.2, 6.6, clothT(PAL.bran.shirt, 7)); },
    fore(P, side) {
      const C = PAL.bran;
      if (side === 'R') {
        // a rolled sleeve, a bare forearm, a studded leather bracer
        P.cap([0, 1, 0], [0, -nF + 2, 0], 5.6, 5, (x, y, z) => (hash(x, y, z, 5) > 0.93 ? C.skin[1] : C.skin[2]));
        P.cap([0, 2, 0], [0, -3, 0], 7.4, 7.2, (x, y) => (y === -1 ? C.shirt[1] : C.shirt[3]), false, { flat: true });
        P.cap([0, -9, 0], [0, -nF + 1, 0], 6.2, 5.9, hideT(C.leather, 6), false, { flat: true });
        skin(P, (x, y) => y === -11 || y === -16, C.leather[0]);
        studRing(P, -13, 6, C.brass[3]);
      } else {
        // the forge-gauntlet: riveted iron plates, brass bands, coals glowing through the vents
        P.cap([0, 2, 0], [0, -nF + 1, 0], 7.4, 8, metalT(C.iron, 8));
        skin(P, (x, y) => y >= 0 || y <= -nF + 3, C.brass[2]);
        studRing(P, 1, 10, C.brass[3]); studRing(P, -nF + 2, 10, C.brass[3]);
        for (const vy of [-5, -9, -13]) P.paint((x, y, z) => {
          if (y < vy - 1 || y > vy) return undefined;
          const a = Math.atan2(x + 0.5, z + 0.5), d = Math.hypot(x + 0.5, z + 0.5), r = 7.4 + 0.6 * clamp(-y / nF, 0, 1);
          if (a < -0.4 || a > 2.6) return undefined;
          return d > r - 1.8 ? null : d > r - 3 ? G(C.coal[1 + Math.floor(hash(x, y, z, 77) * 3)]) : undefined;
        });
      }
    },
    hand(P, side, open) {
      const C = PAL.bran, M = side === 'L' ? metalT(C.iron, 9) : hideT(C.leather, 7);
      glove(P, side, open, M, { r: 1.05 });
      if (side === 'L') {
        for (let x = -3; x <= 3; x += 2) stud(P, x, 3, -7, C.brass[3]);
        skin(P, (x, y, z) => y === 1 && z < -6 && (x & 1), G(C.coal[2]));
      } else skin(P, (x, y, z) => y === -1 && z > -1 && z < 2, C.leather[3]);
    },
    glowMat: 'coal',
  },
  elio: {
    upper(P) { P.cap([0, 2, 0], [0, -nU, 0], 7, 6.8, clothT(PAL.elio.robe, 8)); },
    fore(P) {
      const C = PAL.elio;
      // a bell sleeve flaring to the wrist: gold trim, teal lining, a cuff of glowing marks
      P.loft(-nF, 2, (y) => { const t = clamp(-y / nF, 0, 1); return [6.2 + t * t * 3.4, 6.2 + t * t * 3.4]; }, clothT(C.robe, 9), { shell: 1.6 });
      P.paint((x, y, z) => {
        const t = clamp(-y / nF, 0, 1), r = 6.2 + t * t * 3.4, d = Math.hypot(x + 0.5, z + 0.5);
        if (y <= -nF + 1) return C.trim[(x + z) & 1 ? 2 : 3];
        if (y <= -nF + 3 && d > r - 0.9) return C.trim[2];
        if (d < r - 1) return C.lining[2];
        if (y === -nF + 5 && ((x + z + 40) % 3 === 0)) return G(C.rune);
        return undefined;
      });
      // the slim forearm inside the sleeve
      P.cap([0, 0, 0], [0, -nF + 1, 0], 3.6, 3.4, C.glove[1]);
    },
    hand(P, side, open) {
      const C = PAL.elio;
      glove(P, side, open, (x, y, z) => C.glove[hash(x, y, z, 3) > 0.9 ? 1 : 2], { r: 0.88, slim: true });
      // a glowing mark on the back of the hand
      for (const [x, y, z] of [[0, 3, -5], [-1, 3, -6], [1, 3, -6], [0, 3, -7]]) { const p = top(P, x, z); if (p) P.set(x, p + 1, z, G(C.rune)); }
    },
    glowMat: 'rune',
  },
  durgan: {
    upper(P) { P.cap([0, 2, 0], [0, -nU, 0], 7.6, 7.2, mailT(PAL.durgan.mail)); },
    fore(P) {
      const C = PAL.durgan;
      P.cap([0, 2, 0], [0, -nF + 1, 0], 7.2, 7.8, hideT(C.leather, 94));
      skin(P, (x, y) => (y >= -1 && y <= 1) || (y <= -nF + 4 && y >= -nF + 2), C.bronze[2]);
      studRing(P, -8, 8, C.bronze[3]);
      // a fur cuff at the wrist
      P.loft(-nF - 1, -nF + 2, () => [9, 9], furT(C.fur, 99), { shell: 2 });
    },
    hand(P, side, open) {
      const C = PAL.durgan;
      glove(P, side, open, hideT(C.leather, 95), { r: 1.18 });
      skin(P, (x, y, z) => y === -2 && z > -2, C.leather[3]);
      stud(P, 0, 4, -6, C.bronze[3]);
    },
  },
  clover: {
    upper(P) { P.cap([0, 2, 0], [0, -nU, 0], 6, 5.6, clothT(PAL.clover.shirt, 6)); },
    fore(P) {
      const C = PAL.clover;
      P.cap([0, 1, 0], [0, -nF + 1, 0], 5.2, 5, clothT(C.shirt, 6));
      P.cap([0, -6, 0], [0, -nF + 1, 0], 6, 5.8, hideT(C.vest, 41), false, { flat: true });
      skin(P, (x, y) => y === -9 || y === -15, C.gold[2]);
      // fluff at the wrist
      P.loft(-nF - 1, -nF + 2, () => [6.8, 6.8], furT(C.fur, 42), { shell: 1.8 });
    },
    hand(P, side, open) {
      const C = PAL.clover;
      glove(P, side, open, furT(C.fur, 43), { r: 0.92, paw: C.pad });
    },
  },
};
/** Highest filled y in column (x,z), or null. */
function top(P, x, z) { for (let y = 12; y > -12; y--) if (P.has(x, y, z)) return y; return null; }
/** A stud on the upper surface of a hand. */
function stud(P, x, y0, z, col) { const y = top(P, x, z); if (y !== null) P.set(x, y + 1, z, col); }
/**
 * A chibi glove: a big rounded fist (knuckles forward, thumb wrapped over the grip) or an open
 * hand (a flat palm and four stubby fingers). Wrist at the origin, the hand toward -Z.
 */
function glove(P, side, open, col, o = {}) {
  const r = o.r || 1, inner = side === 'R' ? -1 : 1; // thumb side
  if (!open) {
    P.ell(0, 0, -5 * r, 5.6 * r, 5 * r, 6.2 * r, col);
    // knuckles: a row of bumps across the front-top
    for (let i = 0; i < 4; i++) P.ell((-3 + i * 2) * r + 0.5, 2.2 * r, -10.2 * r, 1.5 * r, 1.6 * r, 1.4 * r, col);
    // curled fingers under the fist, the thumb across the front
    P.cap([inner * 5 * r, -0.5, -3 * r], [inner * 1 * r, 1.2 * r, -9.6 * r], 2.1 * r, 1.8 * r, col);
  } else {
    P.ell(0, 0, -4.4 * r, 5.4 * r, 2.8 * r, 5 * r, col);
    for (let i = 0; i < 4; i++) {
      const x = (-3.2 + i * 2.1) * r + 0.5, len = (i === 1 || i === 2 ? 5.4 : 4.6) * r;
      P.cap([x, 0, -8 * r], [x * 1.08, -0.6, -8 * r - len], 1.35 * r, 1.15 * r, col);
    }
    P.cap([inner * 4.6 * r, 0, -3 * r], [inner * 7.6 * r, 0.4, -6.8 * r], 1.7 * r, 1.4 * r, col);
    if (o.paw) { // pink pads on the palm and fingertips
      P.paint((x, y, z) => (y <= -2 && z < -2 && z > -7 * r && Math.abs(x + 0.5) < 3 * r ? o.paw[1] : undefined));
      for (let i = 0; i < 4; i++) { const x = Math.round((-3.2 + i * 2.1) * r); P.set(x, -2, Math.round(-8 * r - 3.5 * r), o.paw[2]); }
    }
  }
  // the cuff where the glove meets the sleeve
  P.loft(-1, 2, () => [5.8 * r, 5.8 * r], (x, y, z) => (typeof col === 'function' ? col(x, y, z) : col), { shell: 1.5 });
}

// ------------------------------------------------------------------ props the hands hold
function mesh(part, offset, mat, glowMat) {
  const { solid, glow } = part.geometry(VS, offset, { glowIntensity: 2.6 });
  const g = new THREE.Group();
  if (solid) { const m = new THREE.Mesh(solid, mat); m.castShadow = false; g.add(m); }
  if (glow) { const m = new THREE.Mesh(glow, glowMat); m.castShadow = false; g.add(m); }
  return g;
}
const PROP_CACHE = new Map();
function propGeo(key, paint) {
  let p = PROP_CACHE.get(key);
  if (!p) { p = new VPart(); paint(p); PROP_CACHE.set(key, p); }
  return p;
}
/** The old map: a parchment sheet between two rolled ends; the centre shows a texture. */
function buildMap(mat) {
  const g = new THREE.Group();
  const W = 0.25, H = 0.165;
  const P = propGeo('map', (P) => {
    const pw = Math.round(W / VS / 2), ph = Math.round(H / VS / 2);
    for (const sx of [-1, 1]) P.cap([sx * pw, -ph - 2, 0], [sx * pw, ph + 2, 0], 2.6, 2.6, (x, y) => (y === ph + 2 || y === -ph - 2 ? '#6a4a2a' : (y + 99) % 5 === 0 ? '#a08860' : '#c8b088'));
    // a torn parchment frame around the drawn area
    for (let x = -pw + 2; x < pw - 1; x++) for (let y = -ph; y <= ph; y++) {
      const edge = Math.abs(y) > ph - 2 || Math.abs(x + 0.5) > pw - 4;
      if (!edge) continue;
      if (Math.abs(y) === ph && hash(x, y, 3) > 0.7) continue;
      P.set(x, y, -1, hash(x >> 1, y >> 1, 5) > 0.8 ? '#a8946c' : '#d8c8a0');
    }
  });
  g.add(mesh(P, [0, 0, 0], mat, mat));
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, H - 0.025), new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }));
  plane.position.z = -0.002; // a PlaneGeometry faces +Z: the drawn side faces the camera
  g.add(plane);
  g.userData.plane = plane;
  return g;
}
/** A torch: a wrapped stick, a pitch-soaked head, a flame of glowing voxels and a light. */
function buildTorch(mat, glowMat) {
  const g = new THREE.Group();
  const P = propGeo('torch', (P) => {
    P.cap([0, -16, 0], [0, 12, 0], 1.8, 2.2, (x, y) => ((y + 40) % 6 < 2 ? '#3a2416' : '#6a4428'));
    P.cap([0, 10, 0], [0, 17, 0], 3.4, 3.2, (x, y, z) => (hash(x, y, z, 2) > 0.6 ? '#2a1a12' : '#4a2e1a'));
    for (let y = 17; y < 34; y++) {
      const t = (y - 17) / 17, r = 3.6 * (1 - t) * (1 - t * 0.3) + 0.3;
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (Math.hypot(x + 0.5, z + 0.5) < r) P.set(x, y, z, G(t < 0.25 ? '#fff0b0' : t < 0.55 ? '#ffb83a' : '#ff6a1a'));
    }
  });
  g.add(mesh(P, [0, 0, 0], mat, glowMat));
  const light = new THREE.PointLight(0xffa050, 2.2, 6, 1.6);
  light.position.set(0, 0.2, 0);
  g.add(light);
  g.userData.light = light;
  return g;
}

// ------------------------------------------------------------------ poses
// A pose: { R: { p: [x,y,z], r: [rx,ry,rz], open }, L: {...} } in camera space (m / radians).
const H = (p, r = [0, 0, 0], open = false) => ({ p, r, open });
const BASE = {
  none: { R: H([0.17, -0.3, -0.31], [0.3, 0, -0.15]), L: H([-0.17, -0.31, -0.3], [0.3, 0, 0.15]) },
  weapon: { R: H([0.16, -0.26, -0.34], [-0.95, 0.15, 0.55]), L: H([-0.17, -0.31, -0.3], [0.3, 0, 0.15]) },
  pickaxe: { R: H([0.12, -0.24, -0.31], [-0.55, 0.15, 0.95]), L: null }, // the left hand rides the haft
  map: { R: H([0.135, -0.16, -0.42], [0.15, -0.2, -0.1], true), L: H([-0.135, -0.16, -0.42], [0.15, 0.2, 0.1], true) },
  torch: { R: H([0.17, -0.3, -0.31], [0.3, 0, -0.15]), L: H([-0.16, -0.24, -0.34], [-0.25, 0, 0.1]) },
  pet: { R: H([0.17, -0.3, -0.31], [0.3, 0, -0.15]), L: H([-0.08, -0.33, -0.3], [0.5, 0.6, 1.2], true) },
};
/** Blend two poses (b may be partial). */
function mixPose(a, b, t) {
  if (!b) return a;
  const out = {};
  for (const s of ['R', 'L']) {
    const A = a[s], B = b[s];
    if (!B || !A) { out[s] = A || B; continue; }
    out[s] = { p: A.p.map((v, i) => v + (B.p[i] - v) * t), r: A.r.map((v, i) => v + (B.r[i] - v) * t), open: t > 0.5 ? B.open : A.open };
  }
  return out;
}
/** Key-pose timeline: K = [[k, pose(partial R/L), ease]], pose fields replace base fields. */
function keyed(base, k, K) {
  let i = 0;
  while (i < K.length - 2 && k >= K[i + 1][0]) i++;
  const [ka, pa] = K[i], [kb, pb, ease = sm] = K[i + 1];
  const t = ease(seg(k, ka, kb));
  const A = { R: (pa && pa.R) || base.R, L: (pa && pa.L) || base.L }, B = { R: (pb && pb.R) || base.R, L: (pb && pb.L) || base.L };
  return mixPose(A, B, t);
}

// One-shots: dur (s), impact (0..1), f(base, k, arms) → pose (+ flare, smear). Loops: f(base, t, arms).
const ANIMS = {
  idle: { loop: true, f: (b, t) => sway(b, t, 0.004, 1.6) },
  walk: { loop: true, f: (b, t) => bob(b, t, 0.55, 0.012, 0.01) },
  run: { loop: true, f: (b, t) => bob(b, t, 0.3, 0.03, 0.035) },
  swing: {
    dur: 0.46, impact: 0.5, f: (b, k, a) => {
      const back = a.swingN % 2 === 1; // every other swing is a backhand
      const wind = back ? H([-0.2, -0.16, -0.26], [-0.3, -0.6, 1.9]) : H([0.25, -0.1, -0.24], [-0.1, 0.6, -0.7]);
      const hit = back ? H([0.2, -0.3, -0.44], [-1.25, 0.3, -1.0]) : H([-0.1, -0.31, -0.44], [-1.25, -0.4, 1.5]);
      const fol = back ? H([0.24, -0.33, -0.36], [-1.0, 0.4, -0.7]) : H([-0.14, -0.34, -0.36], [-1.0, -0.4, 1.3]);
      return keyed(b, k, [[0, null], [0.36, { R: wind }, sm], [0.5, { R: hit }, inQ], [0.66, { R: fol }, outQ], [1, null, sm]]);
    }, smear: [0.38, 0.52],
  },
  guard: {
    dur: 0.62, hold: true, f: (b, k) => keyed(b, k, [[0, null], [0.25, { R: H([0.04, -0.15, -0.36], [0.05, 0.1, 1.5]), L: H([-0.1, -0.22, -0.33], [0.4, 0, 0.6]) }, outBack], [1, { R: H([0.04, -0.16, -0.36], [0.05, 0.1, 1.5]), L: H([-0.1, -0.23, -0.33], [0.4, 0, 0.6]) }]]),
  },
  parry: {
    dur: 0.34, impact: 0.3, f: (b, k) => keyed(b, k, [[0, { R: H([0.04, -0.16, -0.36], [0.05, 0.1, 1.5]) }], [0.3, { R: H([0.22, -0.12, -0.38], [0.3, 0.5, 0.5]) }, outBack], [1, null, sm]]),
    smear: [0.1, 0.3],
  },
  special: {
    dur: 0.9, impact: 0.62, f: (b, k) => keyed(b, k, [
      [0, null],
      [0.45, { R: H([0.08, 0.02, -0.2], [0.9, 0.1, 0.25]), L: H([-0.05, -0.02, -0.24], [0.6, 0, -0.3]) }, sm],
      [0.54, { R: H([0.08, 0.04, -0.21], [1.0, 0.1, 0.25]), L: H([-0.05, 0.0, -0.25], [0.7, 0, -0.3]) }, lin],
      [0.62, { R: H([0.02, -0.33, -0.46], [-1.55, 0, 0.1]), L: H([-0.08, -0.32, -0.4], [-0.6, 0, 0.3], true) }, inQ],
      [0.8, { R: H([0.03, -0.35, -0.44], [-1.45, 0, 0.1]), L: H([-0.12, -0.33, -0.36], [0, 0, 0.3]) }, outQ],
      [1, null, sm],
    ]),
    smear: [0.55, 0.64], flare: [0.4, 0.95],
  },
  mine: { loop: true, f: (b, t) => sway({ R: H([0.17, -0.2, -0.34], [0.35, 0.25, 0.85]), L: null }, t, 0.004, 2) },
  mineHit: {
    dur: 0.5, impact: 0.42, f: (b, k) => keyed({ R: H([0.17, -0.2, -0.34], [0.35, 0.25, 0.85]), L: null }, k, [
      [0, null], [0.18, { R: H([0.18, -0.15, -0.3], [0.75, 0.25, 0.7]) }, sm], [0.42, { R: H([0.03, -0.26, -0.5], [-1.3, 0, 0.45]) }, inQ],
      [0.58, { R: H([0.04, -0.27, -0.48], [-1.2, 0, 0.45]) }, outQ], [1, null, sm],
    ]), smear: [0.3, 0.44], then: 'mine',
  },
  raiseMap: { dur: 0.6, f: (b, k) => keyed(BASE.map, k, [[0, { R: H([0.18, -0.48, -0.3], [0.9, -0.2, -0.1], true), L: H([-0.18, -0.48, -0.3], [0.9, 0.2, 0.1], true) }], [1, null, outBack]]), then: 'mapHold' },
  mapHold: { loop: true, f: (b, t) => sway(BASE.map, t, 0.003, 1.3) },
  lowerMap: { dur: 0.5, f: (b, k) => keyed(BASE.map, k, [[0, null], [1, { R: H([0.18, -0.5, -0.28], [0.9, -0.2, -0.1], true), L: H([-0.18, -0.5, -0.28], [0.9, 0.2, 0.1], true) }, inQ]]), onEnd: (a) => a.hold('none') },
  hurt: { dur: 0.36, f: (b, k) => keyed(b, k, [[0, null], [0.15, { R: H(add(b.R.p, [0.05, -0.08, 0.06]), add(b.R.r, [0.5, 0, -0.3])), L: b.L && H(add(b.L.p, [-0.05, -0.08, 0.06]), add(b.L.r, [0.5, 0, 0.3]), b.L.open) }, outQ], [1, null, sm]]) },
  reach: { dur: 0.75, impact: 0.45, f: (b, k) => keyed(b, k, [[0, null], [0.4, { R: H([0.07, -0.17, -0.55], [-0.15, 0, -0.1], true) }, outQ], [0.6, { R: H([0.07, -0.18, -0.54], [-0.1, 0, -0.1], true) }], [1, null, sm]]) },
  cast: {
    dur: 0.75, impact: 0.5, f: (b, k) => keyed(b, k, [
      [0, null], [0.35, { L: H([-0.12, -0.24, -0.26], [0.5, 0.3, 0.3], true) }, sm],
      [0.48, { L: H([-0.05, -0.15, -0.52], [-1.45, 0, 0], true) }, inQ], [0.75, { L: H([-0.05, -0.16, -0.5], [-1.4, 0, 0], true) }], [1, null, sm],
    ]), flare: [0.35, 0.85],
  },
};
const lin = (t) => t;
const add = (a, b) => a.map((v, i) => v + b[i]);
function sway(b, t, amp, rate) {
  const o = (s, ph) => s && { p: [s.p[0] + Math.sin(t * rate * 0.7 + ph) * amp * 0.5, s.p[1] + Math.sin(t * rate + ph) * amp, s.p[2]], r: s.r, open: s.open };
  return { R: o(b.R, 0), L: o(b.L, 1.3) };
}
function bob(b, t, per, ampY, ampZ) {
  const p = (t / per) * Math.PI;
  const o = (s, ph) => s && { p: [s.p[0] + Math.sin(p + ph) * ampY * 0.3, s.p[1] - Math.abs(Math.sin(p + ph)) * ampY, s.p[2] + Math.cos(p + ph) * ampZ], r: [s.r[0] + Math.cos(p + ph) * ampZ * 3, s.r[1], s.r[2]], open: s.open };
  return { R: o(b.R, 0), L: o(b.L, Math.PI) };
}

// ------------------------------------------------------------------ the rig
// every pose is authored low; the whole rig sits OFF higher so the hands frame the bottom of the view.
// SC shrinks the arms and what they hold; SPREAD pushes the hands out toward the sides and DROP lowers
// them, so at rest they frame the lower corners and the weapon tip sits in the lower-right third.
const OFF = new THREE.Vector3(0, 0.125, 0);
const SC = 0.8, SPREAD = 1.14, DROP = 0.03;
const SHOULDER = { R: new THREE.Vector3(0.21, -0.3, 0.0), L: new THREE.Vector3(-0.21, -0.3, 0.0) };
const POLE = { R: new THREE.Vector3(0.9, -0.7, 0.25), L: new THREE.Vector3(-0.9, -0.7, 0.25) };
const DOWN = new THREE.Vector3(0, -1, 0);
const GEO = new Map(); // per hero: { upper, fore:{L,R}, fist:{L,R}, open:{L,R} }

function heroGeo(id) {
  let g = GEO.get(id);
  if (g) return g;
  const D = DESIGN[id] || DESIGN.bran;
  const build = (paint) => { const P = new VPart(); paint(P); return P.geometry(VS, [0, 0, 0], { glowIntensity: 2.4 }); };
  g = { upper: build((P) => D.upper(P)), fore: {}, fist: {}, open: {} };
  for (const s of ['L', 'R']) {
    g.fore[s] = build((P) => D.fore(P, s));
    g.fist[s] = build((P) => D.hand(P, s, false));
    g.open[s] = build((P) => D.hand(P, s, true));
  }
  GEO.set(id, g);
  return g;
}

export class FPArms {
  constructor(charId = 'bran') {
    this.charId = DESIGN[charId] ? charId : 'bran';
    this.group = new THREE.Group();
    this.group.name = 'fp_arms_' + this.charId;
    this.root = new THREE.Group(); // sways with the camera's turns
    this.group.add(this.root);
    this.mat = voxToon();
    this.mat.color.setScalar(0.8); // this close to the camera every torch hits them: sit a touch darker
    this.glowMat = voxGlow();
    const geo = heroGeo(this.charId);
    const add = (geoPair, parent) => {
      const g = new THREE.Group();
      if (geoPair.solid) { const m = new THREE.Mesh(geoPair.solid, this.mat); m.castShadow = false; m.frustumCulled = false; g.add(m); }
      if (geoPair.glow) { const m = new THREE.Mesh(geoPair.glow, this.glowMat); m.castShadow = false; m.frustumCulled = false; g.add(m); }
      parent.add(g);
      g.scale.setScalar(SC);
      return g;
    };
    this.side = {};
    for (const s of ['L', 'R']) {
      const upper = add(geo.upper, this.root), fore = add(geo.fore[s], this.root);
      const hand = new THREE.Group(); hand.rotation.order = 'YXZ';
      hand.scale.setScalar(SC);
      this.root.add(hand);
      const fist = add(geo.fist[s], hand), open = add(geo.open[s], hand);
      fist.scale.setScalar(1); open.scale.setScalar(1); // the hand group already carries SC
      open.visible = false;
      const mount = new THREE.Group(); mount.position.set(-0.5 * VS, 0, -5 * VS * (this.charId === 'durgan' ? 1.18 : 1));
      hand.add(mount);
      this.side[s] = { upper, fore, hand, fist, open, mount, p: new THREE.Vector3(), q: new THREE.Quaternion(), openNow: false };
    }
    this.held = 'none';
    this.item = null;
    this.weapon = null;
    this.pet = null;
    this.mapMesh = null;
    this.torch = null;
    this.loop = 'idle';
    this.anim = 'idle';
    this.animT = 0;
    this.swingN = 0;
    this.t = 0;
    this.flare = 0; this.smear = 0;
    this._prevQ = null; this._sway = new THREE.Vector2(); this._swayV = new THREE.Vector2();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    // a faint warm fill so the hands read in the darkest tunnel (reaches only the arms)
    this.fill = new THREE.PointLight(0xffd0a0, 0.003, 0.6, 2);
    this.fill.position.set(0, -0.02, -0.12);
    this.root.add(this.fill);
    this.snap = true;
    this.update(0);
  }

  // -------------------------------------------------------------- holding things
  hold(kind = 'none', obj = null) {
    if (this.item && this.item.parent) this.item.parent.remove(this.item);
    if (this.mapMesh && this.mapMesh.parent) this.mapMesh.parent.remove(this.mapMesh);
    if (this.pet && this.pet.group.parent && kind !== 'pet') this.pet.group.parent.remove(this.pet.group);
    this.item = null; this.weapon = null;
    this.held = BASE[kind] ? kind : 'none';
    if (kind === 'weapon' || kind === 'pickaxe') {
      const m = obj || buildWeaponMesh(kind === 'pickaxe' ? { bp: 'pickaxe', ids: ['iron'], grade: 1 } : { bp: 'sword', ids: ['iron'], grade: 1 });
      m.scale.setScalar(kind === 'pickaxe' ? 0.33 : 0.46);
      m.position.set(0, kind === 'pickaxe' ? -0.07 : 0, 0);
      m.rotation.set(0, 0, 0);
      this.side.R.mount.add(m);
      m.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
      for (const bm of m.userData.bladeMats || []) if (bm.color) bm.color.setScalar(0.82);
      this.item = m;
      if (kind === 'weapon') this.weapon = m;
    } else if (kind === 'map') {
      if (!this._map) this._map = buildMap(this.mat);
      this.mapMesh = this._map;
      this.mapMesh.scale.setScalar(SC * 1.1);
      this.root.add(this.mapMesh);
      if (obj && obj.isTexture) this.setMapTexture(obj);
    } else if (kind === 'torch') {
      if (!this.torch) this.torch = buildTorch(this.mat, this.glowMat);
      this.item = obj || this.torch;
      this.item.rotation.set(0, 0, 0);
      this.side.L.mount.add(this.item);
    } else if (kind === 'pet') {
      if (!this.pet) this.pet = obj && obj.group ? obj : buildPet();
      // Pip rides in the crook of the left arm looking ahead (his back and ears to us, the snout in profile)
      this.pet.group.scale.setScalar(0.46);
      this.pet.group.position.set(-0.15, -0.33 + OFF.y, -0.37);
      this.pet.group.rotation.set(0.1, Math.PI - 0.55, 0);
      this.root.add(this.pet.group);
      this.pet.play && this.pet.play('carried');
    }
    return this;
  }
  /** Show a drawn texture (the run's map) on the held old map. */
  setMapTexture(tex) {
    if (!this._map) this._map = buildMap(this.mat);
    const pl = this._map.userData.plane;
    pl.material.map = tex; pl.material.color.set(0xffffff); pl.material.needsUpdate = true;
  }
  get torchLight() { return this.torch ? this.torch.userData.light : null; }

  // -------------------------------------------------------------- animation
  play(name, opts = {}) {
    const a = ANIMS[name];
    if (!a) return;
    if (name === 'swing') this.swingN++;
    if (a.loop) { this.loop = name; if (this.anim !== name && ANIMS[this.anim] && ANIMS[this.anim].loop) { this.anim = name; this.animT = 0; } return; }
    this.anim = name; this.animT = 0; this.opts = opts;
  }
  impactTime(name) { const a = ANIMS[name]; return a && a.dur ? a.dur * (a.impact ?? 0.5) : 0; }
  get busy() { const a = ANIMS[this.anim]; return !!(a && a.dur && this.animT < a.dur); }

  /** World position of a hand (side 'L' | 'R'). */
  handWorld(side = 'R', out = new THREE.Vector3()) { this.side[side].mount.updateWorldMatrix(true, false); return this.side[side].mount.getWorldPosition(out); }
  /** World position of the held weapon's tip (or the right hand). */
  tipWorld(out = new THREE.Vector3()) {
    if (!this.item || !this.item.userData.tip) return this.handWorld('R', out);
    this.item.updateWorldMatrix(true, false);
    return out.set(0, this.item.userData.tip, 0).applyMatrix4(this.item.matrixWorld);
  }

  update(dt, o = {}) {
    dt = Math.min(dt || 0, 0.1);
    this.t += dt;
    const speed = o.speed ?? this.speed ?? 0;
    // the base loop follows the pace unless a held pose loop (mine, map) is set
    if (['idle', 'walk', 'run'].includes(this.loop)) this.loop = speed > 2 ? 'run' : speed > 0.3 ? 'walk' : 'idle';
    let base = BASE[this.held] || BASE.none;
    let a = ANIMS[this.anim];
    if (a.loop && this.anim !== this.loop) { this.anim = this.loop; a = ANIMS[this.anim]; }
    this.animT += dt;
    let pose, k = 0;
    if (a.dur) {
      k = this.animT / a.dur;
      if (k >= 1 && !a.hold) {
        const next = (this.opts && this.opts.then) || a.then || this.loop;
        a.onEnd && a.onEnd(this);
        const cb = this.opts && this.opts.onDone;
        this.anim = next; this.animT = 0; this.opts = null;
        if (ANIMS[next] && ANIMS[next].loop) this.loop = next;
        cb && cb();
        return this.update(0, o);
      }
      pose = a.f(base, Math.min(1, k), this);
    } else pose = a.f(base, this.t, this);
    if (this.anim === 'mine' || this.anim === 'mineHit') base = pose;
    this.flare += ((a.flare && k >= a.flare[0] && k <= a.flare[1] ? 1 : 0) - this.flare) * (1 - Math.exp(-14 * dt));
    this.smear = a.smear && k >= a.smear[0] && k <= a.smear[1] ? 1 : 0;

    // camera-turn inertia: the arms lag a little behind fast turns and settle back
    const pq = this.group.parent ? this.group.parent.getWorldQuaternion(new THREE.Quaternion()) : null;
    if (pq && this._prevQ && dt > 0) {
      const dq = this._prevQ.clone().invert().multiply(pq);
      this._e.setFromQuaternion(dq, 'YXZ');
      const tx = clamp(-this._e.y / dt * 0.012, -0.05, 0.05), ty = clamp(this._e.x / dt * 0.012, -0.04, 0.04);
      this._swayV.x += ((tx - this._sway.x) * 120 - this._swayV.x * 14) * dt;
      this._swayV.y += ((ty - this._sway.y) * 120 - this._swayV.y * 14) * dt;
      this._sway.x += this._swayV.x * dt; this._sway.y += this._swayV.y * dt;
    }
    if (pq) this._prevQ = pq;
    this.root.position.set(this._sway.x, this._sway.y, 0);

    // place hands (snappy for one-shots, eased for loops), then the arms by IK
    const lam = this.snap ? 1 : 1 - Math.exp(-(a.dur ? 40 : 16) * dt);
    this.snap = false;
    for (const s of ['R', 'L']) {
      let tgt = pose[s];
      if (!tgt && s === 'L' && (this.held === 'pickaxe')) tgt = this._pickLeft(pose.R);
      if (!tgt) tgt = (BASE.none)[s];
      const S = this.side[s];
      S.p.lerp(new THREE.Vector3(tgt.p[0] * SPREAD, tgt.p[1] - DROP, tgt.p[2]).add(OFF), lam);
      const qt = new THREE.Quaternion().setFromEuler(new THREE.Euler(tgt.r[0], tgt.r[1] * (s === 'L' ? 1 : 1), tgt.r[2], 'YXZ'));
      S.q.slerp(qt, lam);
      const open = !!tgt.open && !(s === 'R' && (this.held === 'weapon' || this.held === 'pickaxe')) && !(s === 'L' && this.held === 'torch');
      S.fist.visible = !open; S.open.visible = open;
      this._ik(s);
    }
    if (this.item && this.item.userData.bladeMats && this.smear) this.item.scale.y = this.item.scale.x * 1.25;
    else if (this.item) this.item.scale.y = this.item.scale.x;
    // the map rides between the hands
    if (this.mapMesh) {
      const R = this.side.R.p, L = this.side.L.p;
      this.mapMesh.position.set((R.x + L.x) / 2, (R.y + L.y) / 2 + 0.035, (R.z + L.z) / 2 - 0.01);
      this.mapMesh.rotation.set(-0.25 + (this.side.R.p.y - OFF.y + 0.14) * -1.2, 0, Math.atan2(R.y - L.y, R.x - L.x));
    }
    if (this.pet) { this.pet.update && this.pet.update(dt); }
    if (this.torch && this.held === 'torch') {
      const l = this.torch.userData.light;
      l.intensity = 2.0 + Math.sin(this.t * 13) * 0.25 + Math.sin(this.t * 31.7) * 0.15;
    }
    // signature glow: coals, runes, ore all breathe and blaze on a flare
    this.glowMat.color.setScalar(0.75 + Math.sin(this.t * 3.1) * 0.08 + Math.sin(this.t * 11) * (this.charId === 'bran' ? 0.06 : 0) + this.flare * 1.4);
  }
  /** Where the left hand holds the pickaxe haft (below the right hand along the handle). */
  _pickLeft(R) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R.r[0], R.r[1], R.r[2], 'YXZ'));
    const d = new THREE.Vector3(0, -0.11 * SC, 0).applyQuaternion(q);
    return { p: [R.p[0] + d.x - 0.01, R.p[1] + d.y, R.p[2] + d.z], r: [R.r[0], R.r[1], R.r[2] + 0.2], open: false };
  }
  _ik(s) {
    const S = this.side[s], sh = SHOULDER[s];
    const W = S.p.clone();
    const toW = W.clone().sub(sh);
    let d = toW.length();
    const dir = toW.clone().divideScalar(d || 1);
    const l1 = L1 * SC, l2 = L2 * SC;
    d = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002);
    W.copy(sh).addScaledVector(dir, d);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pole = POLE[s].clone().addScaledVector(dir, -POLE[s].dot(dir)).normalize();
    const E = sh.clone().addScaledVector(dir, a).addScaledVector(pole, h);
    S.upper.position.copy(sh);
    S.upper.quaternion.setFromUnitVectors(DOWN, E.clone().sub(sh).normalize());
    S.fore.position.copy(E);
    S.fore.quaternion.setFromUnitVectors(DOWN, W.clone().sub(E).normalize());
    S.hand.position.copy(W);
    S.hand.quaternion.copy(S.q);
  }
  dispose() {
    this.group.traverse((o) => { if (o.material && o.material !== this.mat && o.material !== this.glowMat && o.material.dispose && !o.material.userData.keep) o.material.dispose(); });
    this.mat.dispose(); this.glowMat.dispose();
  }
}

/** Build first-person arms for 'bran' | 'elio' | 'durgan' | 'clover'. */
export function buildFPArms(charId = 'bran') { return new FPArms(charId); }
export const FP_ANIMS = Object.keys(ANIMS);
