// Voxel props for caves, ruins and the tomb: rocks, crystals, fungi, carved stone, liquids,
// hanging growth (0.04 m grid, see prop_vox.js).
import * as THREE from 'three';
import { FlickerLight } from '../gfx/camera.js';
import { fx as rnd } from '../core/rng.js';
import {
  PV, u, ui, C, glowC, mixC, tone, box, ell, cyl, cylX, seg, h3, NOAO, IRON, BONE, CLOTH, WOOD,
  palOf, STONE, GOLD, MOSS, CHAR, voxModel, rock, woodC, lathe, vessel, torus, spire, makeFlame, addLight, worldOf,
} from './prop_vox.js';

const avg = (tone0, fallback = '#8a827a') => (Array.isArray(tone0) ? tone0[Math.min(1, tone0.length - 1)] : tone0 || fallback);
/** Region tones are dark; lift and warm them so stone never reads as flat grey. */
const stoneTint = (c) => mixC(mixC(C(c), C('#ffffff'), 0.32), C('#e8c098'), 0.16);
const stonePal = (t) => palOf(stoneTint(avg(t)));

// ------------------------------------------------------------------ rocks & crystals
export function rockProp(o) {
  const s = o.size || 1, seed = o.seed ?? 1;
  const tint = avg(o.tone || ['#4a443e', '#55504a', '#5e5852', '#686058']);
  return voxModel('rock' + Math.round(s * 100) + seed + tint + (o.moss || ''), (w) => {
    const rx = u(0.3 * s + 0.1), ry = u(0.26 * s + 0.05), rz = u(0.27 * s + 0.09), P = stonePal(tint), M = o.moss ? palOf(o.moss) : null;
    rock(w, 0, ry * 0.8, 0, rx, ry, rz, P, seed, { floor: 0, moss: M });
    if (s > 0.4) rock(w, rx * 0.9, ry * 0.35, rz * 0.4, rx * 0.42, ry * 0.45, rz * 0.4, palOf(mixC(stoneTint(tint), C('#1c1428'), 0.12)), seed + 9, { floor: 0, moss: M });
    for (let i = 0; i < 4; i++) { const a = h3(i, 1, seed, 2) * 6.28; rock(w, Math.cos(a) * rx * 1.2, 0.5, Math.sin(a) * rz * 1.2, 1.2, 1, 1.1, P, seed + 20 + i, { floor: 0, cuts: 2 }); }
  });
}

export function crystal(o) {
  const col = o.color || '#6ad8ff', s = o.size || 1, seed = (o.seed || 0) + Math.round(s * 37);
  const grp = new THREE.Group();
  grp.add(voxModel('crystal' + col + Math.round(s * 100) + (o.seed || 0), (w) => {
    const h = u(0.5 * s), r = Math.max(1, u(0.09 * s)), lean = (h3(seed, 1, 1, 3) - 0.5) * 0.35;
    spire(w, 0, 0, 0, lean, 1, lean * 0.5, h, r, col, seed);
    spire(w, r * 1.2, 0, r * 0.4, 0.45, 1, 0.15, h * 0.38, r * 0.55, col, seed + 2);
    ell(w, 0, 0, 0, r * 1.4, 0.8, r * 1.3, (px, py) => (py < 0 ? undefined : tone(STONE, 0.3)));
  }));
  if (o.light) addLight(grp, new THREE.PointLight(new THREE.Color(col), o.light, 3.5 * s, 1.6), [0, 0.4 * s, 0.15]);
  return grp;
}

export function crystalcluster(o) {
  const col = o.color || '#6ad8ff', col2 = o.color2 || col, s = o.size || 1, n = o.count || 5;
  const grp = new THREE.Group();
  grp.add(voxModel('ccl' + col + col2 + Math.round(s * 100) + n + avg(o.rock || '#5a5060'), (w) => {
    const P = stonePal(o.rock || '#5a5060');
    rock(w, 0, u(0.12 * s), 0, u(0.3 * s), u(0.18 * s), u(0.26 * s), P, 11, { floor: 0 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + h3(i, 2, 3, 1), ss = s * (0.5 + h3(i, n, 3, 1) * 0.8);
      const bx = Math.cos(a) * u(0.12 * s), bz = Math.sin(a) * u(0.1 * s);
      spire(w, bx, u(0.08 * s), bz, Math.cos(a) * 0.55, 1, Math.sin(a) * 0.45, u(0.5 * ss), Math.max(1, u(0.085 * ss)), i % 2 ? col2 : col, i);
    }
    spire(w, 0, u(0.2 * s), 0, 0.05, 1, 0, u(0.6 * s), Math.max(1.2, u(0.1 * s)), col, 99);
  }));
  if (o.light !== 0) addLight(grp, new THREE.PointLight(new THREE.Color(col), o.light ?? 2.2, 4 * s, 1.5), [0, 0.5 * s, 0.25 * s]);
  return grp;
}

export function stalactite(o) {
  const h = o.length || 14, tint = avg(o.tone || ['#4a443e', '#55504a', '#5e5852', '#686058']), tipc = o.tip;
  return voxModel('stal' + h + tint + (tipc || ''), (w) => {
    const L = u(h * 0.07), P = stonePal(tint);
    let dx = 0, dz = 0;
    for (let y = 0; y < L; y++) {
      const t = y / L, r = u(0.24) * Math.pow(1 - t, 0.85) * (1 + (h3(y >> 2, 5, h, 1) - 0.5) * 0.3) + 0.5;
      dx += (h3(y, 1, h, 2) - 0.5) * 0.25; dz += (h3(y, 2, h, 2) - 0.5) * 0.25;
      cyl(w, dx, dz, -y - 1, -y, r, r, (px, py, pz, d) => {
        const ring = (y % 9) < 1;
        if (tipc && t > 0.9) return glowC(tipc);
        return tone(P, 0.32 + (1 - d) * 0.25 + (px - dx < 0 ? 0.1 : 0) + (ring ? -0.12 : 0) - t * 0.08);
      });
    }
    // side drips running off the spike
    for (let k = 0; k < 3; k++) { const y0 = Math.floor(L * (0.2 + h3(k, 3, h, 3) * 0.5)), a = h3(k, 4, h, 3) * 6.28, r0 = u(0.24) * (1 - y0 / L); seg(w, Math.cos(a) * r0 * 0.6, -y0, Math.sin(a) * r0 * 0.6, Math.cos(a) * r0 * 0.9, -y0 - Math.min(12, L * 0.2), Math.sin(a) * r0 * 0.9, Math.max(0.6, r0 * 0.35), (px, py) => tone(P, 0.4)); }
    if (tipc) for (let k = 0; k < 3; k++) w.set(Math.round(dx), -Math.ceil(L) - k, Math.round(dz), glowC(k ? tipc : mixC(C(tipc), C('#ffffff'), 0.5)));
  }, { hanging: true });
}

export function mushroom(o) {
  const cap = o.color || '#d04a3a', glowc = o.glow || null, CP = palOf(cap), STEM = palOf('#ece2cc');
  const grp = new THREE.Group();
  if (o.giant) {
    const H = u((o.height || 26) * 0.11), R = u((o.radius || 12) * 0.11);
    grp.add(voxModel('gmush' + cap + (glowc || '') + Math.round(H) + Math.round(R), (w) => {
      // stem: gently curved, root flares, a frilled ring
      for (let y = 0; y < H; y++) {
        const t = y / H, bend = Math.sin(t * Math.PI) * R * 0.08, r = R * (0.3 - t * 0.12) + (t < 0.12 ? (0.12 - t) * R * 1.4 : 0);
        cyl(w, bend, 0, y, y + 1, r, r, (px, py, pz, d) => tone(STEM, 0.5 + (px - bend < 0 ? 0.15 : -0.05) + ((Math.atan2(pz, px - bend) * 4 + 40) % 2 < 0.4 ? -0.08 : 0)));
      }
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.3; seg(w, Math.cos(a) * R * 0.5, 0.5, Math.sin(a) * R * 0.5, Math.cos(a) * R * 0.15, H * 0.15, Math.sin(a) * R * 0.15, R * 0.08, (px, py) => tone(STEM, 0.4)); }
      torus(w, R * 0.03, H * 0.72, 0, R * 0.24, R * 0.05, 'y', (px, py) => tone(STEM, 0.7));
      // cap: a dome with soft spots, gills underneath, glowing studs
      ell(w, 0, H, 0, R, R * 0.72, R, (px, py, pz, d) => {
        if (py < H) return undefined;
        const spot = h3(px >> 2, py >> 2, pz >> 2, 5) > 0.82;
        if (glowc && spot && d > 0.7) return glowC(mixC(C(glowc), C('#ffffff'), 0.3));
        return spot ? tone(CP, 0.85) : tone(CP, 0.35 + (py - H) / (R * 0.72) * 0.4 + (px < 0 ? 0.1 : 0));
      });
      for (let z = -Math.ceil(R); z <= R; z++) for (let x = -Math.ceil(R); x <= R; x++) {
        const d = Math.hypot(x + 0.5, z + 0.5) / R;
        if (d > 0.96) continue;
        w.set(x, Math.floor(H - 1), z, glowc ? (d > 0.35 && ((Math.round(Math.atan2(z, x) * 9) & 1)) ? glowC(glowc) : tone(palOf(glowc), 0.3)) : tone(CP, (Math.round(Math.atan2(z, x) * 9) & 1) ? 0.15 : 0.3));
      }
    }));
    if (glowc && o.light !== 0) addLight(grp, new THREE.PointLight(new THREE.Color(glowc), o.light ?? 2.5, R * PV * 3.2, 1.4), [0, H * PV - 0.1, 0]);
  } else {
    grp.add(voxModel('smush' + cap + (glowc || ''), (w) => {
      for (const [x, z, h, r, i] of [[0, 0, 7, 3, 0], [-3, 2, 5, 2.2, 1], [3, -2, 4, 1.8, 2]]) {
        const lean = (i - 1) * 0.6;
        for (let y = 0; y < h; y++) w.set(Math.round(x + lean * (y / h)), y, z, tone(STEM, 0.55 + (y === 0 ? -0.2 : 0)));
        ell(w, x + lean + 0.5, h, z + 0.5, r, r * 0.7, r, (px, py, pz, d) => (py < h ? undefined : glowc ? (d > 0.5 ? glowC(glowc) : glowC(mixC(C(glowc), C('#ffffff'), 0.4))) : (h3(px, py, pz, i) > 0.8 ? tone(CP, 0.9) : tone(CP, 0.45 + (py - h) * 0.15))));
      }
    }, { shadow: false }));
  }
  return grp;
}

// ------------------------------------------------------------------ carved stone
export function pillar(o) {
  const h = o.height || 32, tint = Array.isArray(o.tone) ? o.tone : [o.tone || '#7a6a52', o.tone || '#8a7a5e'], broken = !!o.broken;
  return voxModel('pillar' + h + String(tint) + broken + (o.rune || ''), (w) => {
    const H = Math.round(h * 2.5), P = palOf(stoneTint(tint[1] || tint[0])), PD = palOf(stoneTint(tint[0]));
    const carved = (px, py, pz) => tone(PD, 0.4 + (py % 3 === 0 ? -0.1 : 0) + (px < 0 ? 0.08 : 0) + (h3(px, py, pz, 3) > 0.9 ? -0.12 : 0));
    box(w, -15, 0, -15, 16, 4, 16, carved);
    box(w, -13, 4, -13, 14, 7, 14, (px, py, pz) => tone(P, 0.45 + (py === 6 ? 0.12 : 0)));
    const top = broken ? Math.round(H * 0.6) : H - 8;
    for (let y = 7; y < top; y++) cyl(w, 0.5, 0.5, y, y + 1, 11, 11, (px, py, pz, d) => {
      const flute = Math.floor((Math.atan2(pz, px) + Math.PI) * 3.8) % 2;
      if (o.rune && (py - 22) % 27 === 0 && d > 0.8) return glowC(o.rune);
      const crack = Math.abs(((py * 0.7 + px * 1.3) % 23) - 11) < 0.6 && h3(px, py, pz, h) > 0.6;
      return crack ? P[0] : tone(P, 0.42 + flute * 0.12 + (px < 0 ? 0.08 : -0.04) + (h3(px, py >> 2, pz, 2) - 0.5) * 0.1);
    });
    if (broken) {
      for (let x = -11; x <= 11; x++) for (let z = -11; z <= 11; z++) { if (Math.hypot(x, z) > 11) continue; const jag = Math.round(h3(x >> 1, z >> 1, h, 4) * 7); for (let y = top; y < top + jag; y++) w.set(x, y, z, tone(P, 0.5)); }
      rock(w, 22, 4, 12, 8, 5, 7, P, h + 5, { floor: 0 });
      rock(w, -18, 3, 15, 4.5, 3, 4, P, h + 6, { floor: 0 });
    } else {
      cyl(w, 0.5, 0.5, H - 8, H - 4, 12, 13, (px, py) => tone(P, 0.55 + (py === H - 5 ? 0.12 : 0)));
      box(w, -15, H - 4, -15, 16, H, 16, carved);
    }
  });
}

export function statue(o) {
  const tint = Array.isArray(o.tone) ? o.tone : [o.tone || '#8a7a5e', o.tone || '#7a6a52'], eye = o.eye || '#4affe0';
  return voxModel('statue' + tint[0] + eye, (w) => {
    const P = palOf(stoneTint(tint[0])), PD = palOf(stoneTint(tint[1] || tint[0]));
    box(w, -15, 0, -11, 16, 8, 12, (px, py, pz) => tone(PD, 0.4 + (py === 7 ? 0.15 : 0) + (py % 4 === 0 ? -0.08 : 0) + (px < 0 ? 0.06 : 0)));
    // a hooded warden resting both hands on a greatsword, robe falling in folds
    for (let y = 8; y < 38; y++) {
      const t = (y - 8) / 30, rx = 10.5 - t * 3.6, rz = 9 - t * 3.2;
      ell(w, 0.5, y + 0.5, 0.5, rx, 0.6, rz, (px, py, pz) => {
        const fold = Math.floor((Math.atan2(pz, px) + Math.PI) * 4.5) % 2;
        const moss = py < 16 && h3(px >> 1, py >> 1, pz >> 1, 4) > 0.55;
        return moss ? tone(MOSS, 0.45) : tone(P, 0.38 + fold * 0.1 + (px < 0 ? 0.1 : 0) + (pz > 0 ? 0.05 : 0));
      });
    }
    ell(w, 0.5, 39, 0.5, 9.5, 3.8, 6, (px, py, pz) => tone(P, 0.5 + (px < 0 ? 0.1 : 0)));
    ell(w, 0.5, 46.5, 0.5, 5.5, 6.3, 5.5, (px, py, pz) => (pz > 2 && py < 49 && py > 42 && Math.abs(px) < 4 ? C('#14121a') : tone(P, 0.45 + (px < 0 ? 0.1 : 0))));
    seg(w, 0.5, 50, -1, 0.5, 54, -3.5, 2.5, (px, py) => tone(P, 0.5));
    for (const sx of [-1.2, 1.2]) w.set(Math.round(sx), 46, 5, glowC(eye));
    for (const sx of [-1, 1]) { seg(w, sx * 8, 38, 1, sx * 7.5, 32, 4, 2.4, (px, py) => tone(P, 0.45)); seg(w, sx * 7.5, 32, 4, sx * 2, 28, 8, 2, (px, py) => tone(P, 0.5)); ell(w, sx * 1.5, 28, 8.5, 1.6, 1.3, 1.5, tone(P, 0.6)); }
    // the sword: pommel, grip, crossguard and blade down the front
    ell(w, 0.5, 31, 8.5, 1, 1, 1, GOLD[2]);
    for (let y = 26; y < 30; y++) w.set(0, y, 8, C('#5a3a2a'));
    box(w, -4, 25, 8, 5, 26, 9, GOLD[2]);
    for (let y = 8; y < 25; y++) { w.set(0, y, 9, tone(['#5a5a72', '#8a8aa2', '#b8b8cc'].map(C), y < 10 ? 0.3 : 0.6)); w.set(-1, y, 9, ['#5a5a72', '#8a8aa2'].map(C)[y & 1]); }
  });
}

export function sarcophagus(o) {
  const rune = o.rune || '#c86bff';
  return voxModel('sarc' + rune, (w) => {
    const P = palOf('#9a90b0'), L = palOf('#a89ebe');
    box(w, -13, 0, -27, 14, 3, 28, (px, py) => tone(L, 0.45 + (py === 2 ? 0.1 : 0)));
    box(w, -12, 3, -26, 13, 13, 27, (px, py, pz) => {
      const panel = (Math.abs(pz) % 13 < 2) || py === 3 || py === 12;
      if ((px === -12 || px === 12) && !panel && py > 5 && py < 10 && (pz + 40) % 13 === 6) return glowC(rune);
      return tone(P, 0.42 + (panel ? 0.12 : 0) + (px < 0 ? 0.06 : 0) + (h3(px, py, pz, 2) > 0.92 ? -0.12 : 0));
    });
    box(w, -13, 13, -27, 14, 16, 28, (px, py) => tone(L, 0.5 + (py === 15 ? 0.12 : 0)));
    // carved effigy of a knight at rest, sword on the chest, eye slits glowing
    for (let z = -21; z < 15; z++) { const t = (z + 21) / 36, rx = 4 + Math.sin(t * Math.PI) * 2.5; ell(w, 0.5, 16, z + 0.5, rx, 2.2, 0.6, (px, py) => (py < 16 ? undefined : tone(L, 0.55 + (px < 0 ? 0.1 : 0)))); }
    ell(w, 0.5, 17.5, 18.5, 3.2, 3, 3.2, (px, py) => tone(L, 0.6 + (px < 0 ? 0.08 : 0)));
    for (const sx of [-1, 1]) w.set(sx, 18, 21, glowC(rune));
    for (const sx of [-1, 1]) seg(w, sx * 5, 17.5, 9, sx * -1.5, 19, 2, 1.1, tone(L, 0.62));
    for (const sx of [-1.5, 1.5]) ell(w, sx + 0.5, 17.5, -22, 1.3, 2, 1.4, tone(L, 0.55));
    for (let z = -16; z < 6; z++) w.set(0, 19, z, z > 2 ? GOLD[2] : ['#5a5470', '#8a84a0'].map(C)[z & 1]);
    box(w, -2, 19, 4, 3, 20, 5, GOLD[2]);
  });
}

export function door(o) {
  const rune = o.rune || '#c86bff', tint = o.tone || ['#3a3448', '#4a425a', '#2c2436'];
  return voxModel('door' + rune + tint[0], (w) => {
    const F = palOf(mixC(C('#5a5268'), C('#fff4e0'), 0.2)), S = palOf(mixC(C(tint[1]), C('#fff4e0'), 0.15));
    const inArch = (x, y, hw, hr) => Math.abs(x + 0.5) < hw && (y < hr || Math.hypot(x + 0.5, y - hr) < hw);
    for (let y = 0; y < 70; y++) for (let x = -25; x < 25; x++) {
      if (!inArch(x, y, 24, 44.5)) continue;
      const inner = inArch(x, y, 19, 44);
      if (inner) {
        // the sealed slab with its rune-script and a dark seam
        for (let z = -1; z < 2; z++) w.set(x, y, z, x === 0 || x === -1 ? C('#14101c') : tone(S, 0.4 + (x < 0 ? 0.08 : 0) + (h3(x >> 1, y >> 1, 2, 3) > 0.9 ? -0.1 : 0)));
        const glyph = ((x + 40) % 6 < 3 && (y % 7 === 2 || (y % 7 > 2 && (x + 40) % 6 === 1))) && Math.abs(x + 0.5) < 15 && y > 6 && y < 52 && h3(Math.floor((x + 40) / 6), Math.floor(y / 7), 9, 1) > 0.25;
        if (glyph) w.set(x, y, 2, glowC(rune));
        continue;
      }
      const block = (Math.floor((x + 40) / 6) + Math.floor(y / 5)) % 2;
      for (let z = -6; z < 6; z++) w.set(x, y, z, tone(F, 0.4 + block * 0.1 + (x < 0 ? 0.06 : 0) + (z === 5 ? 0.06 : 0)));
    }
    box(w, -4, 64, -6, 4, 72, 6, (px, py) => tone(F, 0.55 + (py === 71 ? 0.1 : 0)));
    w.set(0, 67, 6, glowC(rune)); w.set(-1, 67, 6, glowC(rune)); w.set(0, 68, 6, glowC(mixC(C(rune), C('#ffffff'), 0.5)));
    for (const sx of [-7, 7]) torus(w, sx, 23, 2.5, 1.6, 0.6, 'z', IRON[2]);
  });
}

export function shrine(o) {
  const col = o.color || '#ff8a3a';
  const grp = new THREE.Group();
  grp.add(voxModel('shrine' + col, (w) => {
    const P = palOf('#b0a090'), Q = palOf('#a08e7e');
    box(w, -15, 0, -11, 16, 4, 12, (px, py) => tone(Q, 0.45 + (py === 3 ? 0.12 : 0)));
    box(w, -9, 4, -6, 10, 16, 7, (px, py, pz) => ((px === -9 || px === 9) && (py === 8 || py === 12) && Math.abs(pz) < 4 ? glowC(col) : tone(P, 0.45 + (px < 0 ? 0.08 : 0) + (py % 4 === 0 ? -0.08 : 0))));
    box(w, -13, 16, -7, 14, 20, 8, (px, py) => tone(Q, 0.5 + (py === 19 ? 0.12 : 0)));
    vessel(w, 0.5, 0.5, 20, 23, (t) => 4 + t * 3.4, (px, py) => tone(Q, 0.45 + (px < 0 ? 0.1 : 0)), 1.2, 0.8);
    cyl(w, 0.5, 0.5, 21, 22, 5.6, 5.6, (px, py, pz) => (h3(px, py, pz, 2) > 0.4 ? glowC(h3(px, pz, 1, 2) > 0.6 ? '#ffd25e' : col) : CHAR[1]));
    for (const sx of [-1, 1]) { cyl(w, sx * 14 + 0.5, -8.5, 4, 31, 2.2, 1.8, (px, py) => tone(Q, 0.42 + (px < sx * 14 ? 0.1 : 0) + (py % 6 === 0 ? -0.1 : 0))); rock(w, sx * 14 + 0.5, 32, -8.5, 3, 1.6, 3, P, 6 + sx, { cuts: 4 }); }
  }));
  const f = makeFlame(0.7, col === '#ff8a3a' ? 'fire' : 'blue');
  f.position.y = 0.92;
  grp.add(f);
  const L = addLight(grp, new FlickerLight(new THREE.Color(col), 3, 6, { amount: 0.25 }), [0, 1.3, 0.3]);
  grp.userData.update = (dt, t) => { f.userData.flame(t); L.tick(t); f.position.y = 0.95 + Math.sin(t * 2) * 0.04; };
  grp.userData.emit = (P, dt) => { if (rnd.chance(dt * 10)) P.add.emit({ pos: worldOf(grp, 0, 1.0, 0), posSpread: 0.25, vel: [0, 0.4, 0], spread: 0.15, life: [0.8, 1.6], size: 1, color: [col, '#fff0c0'], glow: 3, swirl: 2 }); };
  return grp;
}

export function urn(o) {
  const c = o.color || '#9a5a3a', P = palOf(c);
  return voxModel('urn' + c, (w) => {
    vessel(w, 0, 0, 0, 12, (t) => (t < 0.08 ? 2.6 : t < 0.7 ? 2.6 + Math.sin(((t - 0.08) / 0.62) * Math.PI) * 2.2 + t * 0.6 : t < 0.88 ? 2 : 2.7), (px, py, pz, d, t) => {
      const band = (t > 0.38 && t < 0.52);
      if (band) return ((px + pz + py * 2 + 40) % 4 < 2) ? tone(palOf('#e8c890'), 0.6) : tone(P, 0.35);
      return tone(P, 0.45 + (px < 0 ? 0.1 : 0) + (t > 0.88 ? 0.12 : 0));
    }, 1.2, 0.86);
    for (const sx of [-1, 1]) torus(w, sx * 4, 8.5, 0.5, 1.4, 0.5, 'z', tone(P, 0.5));
  });
}

export function bones() {
  return voxModel('bones', (w) => {
    const bone = (x0, z0, x1, z1, y) => {
      seg(w, x0, y, z0, x1, y, z1, 0.55, (px, py, pz) => tone(BONE, 0.55 + (px < 0 ? 0.1 : 0)));
      for (const [x, z] of [[x0, z0], [x1, z1]]) ell(w, x, y, z, 1.1, 0.9, 1.1, tone(BONE, 0.7));
    };
    bone(-8, -5, 1.5, -2, 0.8); bone(-4, 6, 5, -1, 0.8); bone(-7, 3, -1, 6, 0.6); bone(0, 3.5, 8, 6.5, 0.6);
    // skull: cranium, cheeks, jaw; sockets and nose dark
    ell(w, 5, 2.8, 1, 2.6, 2.4, 2.9, (px, py, pz) => tone(BONE, 0.6 + (py > 3 ? 0.12 : 0) + (px < 5 ? 0.06 : 0)));
    box(w, 3, 0, 2, 7, 1, 5, tone(BONE, 0.5));
    for (const sx of [4, 6]) { w.set(sx, 2, 4, C('#1a1418')); w.set(sx, 3, 4, C('#1a1418')); }
    w.set(5, 1, 4, C('#2a2026'));
    for (const x of [3, 4, 5, 6]) w.set(x, 0, 5, x & 1 ? BONE[3] : BONE[1]);
  });
}

export function chains(o) {
  const L = o.length || 2, col = o.color || '#5a5260';
  const grp = new THREE.Group();
  grp.add(voxModel('chains' + L.toFixed(2) + col, (w) => {
    const P = palOf(col), n = Math.round(u(L) / 3);
    for (let i = 0; i < n; i++) {
      const y = -i * 3, c = (k) => tone(P, 0.45 + k * 0.15);
      if (i % 2) { for (const x of [-1, 1]) { w.set(x, y - 1, 0, c(x > 0 ? 0 : 1)); w.set(x, y - 2, 0, c(x > 0 ? 0 : 1)); } w.set(0, y, 0, c(1)); w.set(0, y - 3, 0, c(0)); }
      else { for (const z of [-1, 1]) { w.set(0, y - 1, z, c(z > 0 ? 1 : 0)); w.set(0, y - 2, z, c(z > 0 ? 1 : 0)); } }
    }
  }, { hanging: true }));
  grp.userData.update = (dt, t) => { grp.rotation.z = Math.sin(t * 0.8 + grp.id) * 0.03; };
  return grp;
}

export function web(o) {
  const s = o.size || 1;
  return voxModel('web' + Math.round(s * 100), (w) => {
    const R = u(s), spokes = 9, rings = 5, col = (NOAO | C('#d8d4e8')) >>> 0, dim = (NOAO | C('#a8a4c0')) >>> 0;
    for (let k = 0; k < spokes; k++) { const a = (k / spokes) * Math.PI * 2; for (let r = 0; r <= R; r++) w.set(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 0, col); }
    for (let q = 1; q <= rings; q++) for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * Math.PI * 2, a1 = ((k + 1) / spokes) * Math.PI * 2, rr = (q / rings) * R;
      const p0 = [Math.cos(a0) * rr, Math.sin(a0) * rr], p1 = [Math.cos(a1) * rr * 0.92, Math.sin(a1) * rr * 0.92];
      const n = Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
      for (let i = 0; i <= n; i++) { const t = i / n, sagd = Math.sin(t * Math.PI) * 0.6; w.set(Math.round(p0[0] + (p1[0] - p0[0]) * t - Math.cos((a0 + a1) / 2) * sagd), Math.round(p0[1] + (p1[1] - p0[1]) * t - Math.sin((a0 + a1) / 2) * sagd), 0, q % 2 ? col : dim); }
    }
  }, { shadow: false, hanging: true });
}

// ------------------------------------------------------------------ liquids
const surfVert = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const surfFrag = /* glsl */ `
uniform float time; uniform vec3 c0, c1, c2, c3; uniform float hdr; uniform float speed; uniform float scale; uniform vec3 bands;
varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = floor(vW.xz * 25.0) / 25.0 * scale;
  float t = time * speed;
  float v = n(p * 2.0 + vec2(t, t * 0.6)) * 0.6 + n(p * 4.5 - vec2(t * 0.7, -t)) * 0.4;
  v = floor(v * 5.0) / 5.0;
  vec3 col = v < bands.x ? c0 : v < bands.y ? c1 : v < bands.z ? c2 : c3;
  gl_FragColor = vec4(col * hdr, 1.0);
}`;
/** Pixel-quantized animated liquid surface ('lava' | 'water'); the pattern snaps to the 0.04 voxel grid. */
export function surfaceMat(kind, o) {
  const pal = kind === 'lava'
    ? [o.c0 || '#7a1a06', o.c1 || '#d8400e', o.c2 || '#ff8a1a', o.c3 || '#ffe07a']
    : [o.c0 || '#0e2a36', o.c1 || '#14404e', o.c2 || '#1e5a6a', o.c3 || o.sparkle || '#7fe3ff'];
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, c0: { value: new THREE.Color(pal[0]) }, c1: { value: new THREE.Color(pal[1]) },
      c2: { value: new THREE.Color(pal[2]) }, c3: { value: new THREE.Color(pal[3]) },
      bands: { value: kind === 'lava' ? new THREE.Vector3(0.35, 0.55, 0.75) : new THREE.Vector3(0.4, 0.62, 0.86) },
      hdr: { value: kind === 'lava' ? (o.hdr ?? 2.2) : (o.hdr ?? 0.85) }, speed: { value: kind === 'lava' ? 0.25 : 0.35 }, scale: { value: kind === 'lava' ? 1.2 : 1.6 },
    },
    vertexShader: surfVert, fragmentShader: surfFrag,
  });
}
function pool(kind, o) {
  const r = o.radius || 1.2;
  const grp = new THREE.Group();
  const mat = surfaceMat(kind, o);
  const geo = new THREE.CircleGeometry(r, 18);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = kind === 'lava' ? 0.02 : 0.015;
  grp.add(m);
  const rim = kind === 'lava' ? palOf('#4a3c38') : palOf(o.rim ? mixC(C(o.rim), C('#ffffff'), 0.25) : '#8a827a');
  grp.add(voxModel((kind === 'lava' ? 'lavarim' : 'waterrim') + r.toFixed(2) + (o.rim || ''), (w) => {
    const R = u(r), n = Math.round(r * 13);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + h3(i, 1, 4, 1) * 0.2, s = 0.7 + h3(i, 2, 4, 1) * 0.6;
      rock(w, Math.cos(a) * R * 1.03, 0.6, Math.sin(a) * R * 1.03, 3.6 * s, 2 * s, 2.8 * s, rim, 90 + i, { floor: 0, cuts: 4, moss: kind === 'water' && i % 3 === 0 ? MOSS : null });
    }
    // a crusted, glowing (lava) or wet, reflective (water) lip just inside the stones
    for (let a = 0; a < Math.PI * 2; a += 0.6 / R) { const x = Math.round(Math.cos(a) * R * 0.95), z = Math.round(Math.sin(a) * R * 0.95); w.set(x, 0, z, kind === 'lava' ? glowC(h3(x, z, 1, 1) > 0.5 ? '#ff8a2a' : '#ffc85a') : (NOAO | C(h3(x, z, 1, 1) > 0.7 ? '#bff4ff' : '#3a8ac0')) >>> 0); }
  }));
  return { grp, mat, r };
}
export function lavapool(o) {
  const { grp, mat, r } = pool('lava', o);
  if (o.light !== 0) addLight(grp, new FlickerLight(0xff5a1a, o.light ?? 4, r * 4, { amount: 0.2, speed: 2 }), [0, 0.5, 0]);
  grp.userData.update = (dt, t) => { mat.uniforms.time.value = t; for (const L of grp.userData.lights || []) L.tick && L.tick(t); };
  grp.userData.emit = (P, dt) => {
    if (rnd.chance(dt * 3 * r)) P.add.emit({ pos: worldOf(grp, rnd.float(-r, r) * 0.7, 0.05, rnd.float(-r, r) * 0.7), vel: [0, 1.2, 0], spread: 0.4, life: [0.6, 1.2], size: [1, 2], color: ['#ffd04a', '#ff6a1a'], gravity: 2, glow: 3 });
  };
  return grp;
}
export function waterpool(o) {
  const { grp, mat } = pool('water', o);
  grp.userData.update = (dt, t) => { mat.uniforms.time.value = t; };
  return grp;
}

export function vent(o) {
  const grp = new THREE.Group();
  grp.add(voxModel('vent', (w) => {
    const P = palOf('#5a4038');
    for (let y = 0; y < 9; y++) {
      const t = y / 9, ro = 10.5 * (1 - t * t * 0.6), ri = 3.6 + t * 0.6;
      for (let z = -11; z <= 11; z++) for (let x = -11; x <= 11; x++) {
        const d = Math.hypot(x + 0.5, z + 0.5) + (h3(x >> 1, y, z >> 1, 3) - 0.5) * 1.6;
        if (d > ro || d < ri) continue;
        w.set(x, y, z, tone(P, 0.32 + t * 0.3 + (x < 0 ? 0.08 : 0) + (h3(x, y, z, 5) > 0.92 ? 0.15 : 0)));
      }
    }
    ell(w, 0.5, 5, 0.5, 3.6, 1, 3.6, (px, py, pz) => (h3(px, py, pz, 4) > 0.3 ? glowC(h3(px, pz, 2, 2) > 0.6 ? '#ffd04a' : '#ff6a1a') : CHAR[1]));
    for (let i = 0; i < 6; i++) { const a = i * 1.3; rock(w, Math.cos(a) * 11.5, 0.6, Math.sin(a) * 11.5, 1.8, 1.3, 1.5, palOf('#4a3634'), 150 + i, { floor: 0, cuts: 3 }); }
  }));
  grp.userData.emit = (P, dt) => {
    if (rnd.chance(dt * 5)) P.alpha.emit({ pos: worldOf(grp, 0, 0.4, 0), vel: [0, 0.8, 0], spread: 0.1, life: [1.5, 2.6], size: [1, 2], sizeEnd: 4, color: '#3a2a2a', alpha: 0.45 });
    if (rnd.chance(dt * 8)) P.add.emit({ pos: worldOf(grp, 0, 0.35, 0), vel: [0, 1.6, 0], spread: 0.4, life: [0.5, 1.2], size: 1, color: ['#ffd04a', '#ff6a1a'], glow: 3, gravity: 1.2 });
  };
  return grp;
}

// ------------------------------------------------------------------ hanging growth & cloth
export function banner(o) {
  const c = o.color || '#5a2a7a', sym = o.symbol || '#c86bff';
  return voxModel('banner' + c + sym, (w) => {
    const P = palOf(c);
    for (let y = 0; y < 33; y++) for (let x = -7; x < 7; x++) {
      const swallow = y > 27 && Math.abs(x + 0.5) < (y - 27) * 1.3;
      if (swallow) continue;
      const z = Math.round(Math.sin(y * 0.3 + x * 0.25) * 0.8);
      const edge = x === -7 || x === 6;
      const ey = Math.abs(y - 14), ex = Math.abs(x + 0.5);
      const emblem = (ex + ey * 0.8 < 5 && ex + ey * 0.8 > 3.4) || (ex < 1 && ey < 2);
      w.set(x, -y - 1, z, emblem ? glowC(sym) : edge ? GOLD[2] : tone(P, 0.42 + (x < 0 ? 0.1 : 0) + (y % 8 === 0 ? -0.08 : 0)));
    }
    for (let x = -9; x <= 9; x++) w.set(x, 0, 0, WOOD[1]);
    for (const sx of [-10, 10]) ell(w, sx + 0.5, 0.5, 0.5, 1, 1, 1, GOLD[3]);
  }, { hanging: true });
}

export function roots(o) {
  const c = o.color || '#5a4030', L = u((o.length || 20) * 0.08);
  return voxModel('roots' + c + Math.round(L), (w) => {
    const P = palOf(c);
    for (let k = 0; k < 4; k++) {
      let y = u(0.66) - k * 3.2, z = (k - 1.5) * 2.3;
      const n = Math.max(4, Math.round(L / 4)), pts = [];
      for (let i = 0; i <= n; i++) { const t = i / n; y += Math.sin(i * 1.3 + k) * 1.1; pts.push([t * L, Math.max(1, Math.min(19, y)), z + Math.sin(i * 0.9 + k) * 1.2, (1.9 - k * 0.28) * (1 - t * 0.75) + 0.4]); }
      for (let i = 0; i < n; i++) seg(w, pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], pts[i][3], (px, py, pz) => tone(P, 0.4 + ((px + pz * 3) % 5 === 0 ? -0.15 : 0) + (py > pts[i][1] ? 0.1 : 0)));
      for (let b = 0; b < 2; b++) { const p = pts[1 + Math.floor(h3(k, b, 7, 1) * (n - 1))]; seg(w, p[0], p[1], p[2], p[0] + 2, p[1] - 4, p[2] + 1.5, 0.6, tone(P, 0.35)); seg(w, p[0] + 2, p[1] - 4, p[2] + 1.5, p[0] + 2.5, p[1] - 7, p[2] + 1, 0.5, tone(P, 0.5)); }
    }
  });
}

export function vines(o) {
  const c = o.color || '#3a7a3a', L = u((o.length || 18) * 0.05), glowc = o.glow;
  return voxModel('vines' + c + Math.round(L) + (glowc || ''), (w) => {
    const P = palOf(c);
    for (let k = 0; k < 5; k++) {
      const x0 = -6 + k * 3, len = L * (0.5 + h3(k, 1, 6, 1) * 0.5);
      let lastX = x0, lastZ = 0;
      for (let y = 0; y < len; y++) {
        const x = Math.round(x0 + Math.sin(y * 0.25 + k) * 1), z = Math.round(Math.sin(y * 0.33 + k) * 0.6);
        w.set(x, -y - 1, z, tone(P, 0.35 + (y & 1) * 0.08));
        if (y % 3 === 1) { const sd = (y >> 1) % 2 ? 1 : -1; w.set(x + sd, -y - 1, z, tone(P, 0.6)); w.set(x + sd, -y, z, tone(P, 0.75)); }
        lastX = x; lastZ = z;
      }
      if (glowc) { w.set(lastX, -Math.ceil(len) - 1, lastZ, glowC(glowc)); w.set(lastX, -Math.ceil(len) - 2, lastZ, glowC(mixC(C(glowc), C('#ffffff'), 0.4))); }
    }
  }, { shadow: false, hanging: true });
}
