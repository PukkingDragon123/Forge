// The little folk of the mine as voxel figures: Mossbottom the merchant mole (waistcoat, tiny
// spectacles, an enormous pack), a trapped miner waving from a rockfall, and Gravel the ore snail.
import * as THREE from 'three';
import {
  C, glowC, mixC, tone, box, ell, cyl, cylX, seg, h3, NOAO, IRON, WOOD, CLOTH,
  palOf, STONE, GOLD, COPPER, FUR, PINK, voxModel, rock, torus, vessel, spire, addLight,
} from './prop_vox.js';

export function mole(o, B) {
  const grp = new THREE.Group();
  const body = voxModel('mole', (w) => {
    const VEST = palOf('#4a7a3a'), BELLY = palOf('#d8b49a'), PACK = palOf('#7a5230'), STRAP = palOf('#4a2e1a'), HAT = palOf('#5a8a44');
    const furC = (px, py, pz, d) => tone(FUR, 0.4 + (1 - d) * 0.15 + (px < 0 ? 0.12 : 0) + (py > 16 ? 0.06 : 0) + (h3(px, py, pz, 3) > 0.9 ? -0.12 : 0));
    // plump pear-shaped body and round head
    ell(w, 0, 9.5, 0.5, 7.4, 8.4, 6.6, furC);
    ell(w, 0, 4.6, 0.75, 7.7, 4.4, 6.9, (px, py, pz, d) => (py < 0 ? undefined : furC(px, py, pz, d)));
    // the waistcoat: green over the chest with a V opening, brass buttons, a watch chain
    ell(w, 0, 9.6, 0.6, 7.9, 8.6, 7.1, (px, py, pz) => {
      if (py < 6 || py > 15) return undefined;
      if (pz > 1 && Math.abs(px + 0.5) < 1.2 + (py - 6) * 0.35) return undefined;
      return tone(VEST, 0.42 + (px < 0 ? 0.12 : 0) + (py === 6 ? -0.12 : 0) + ((px + 40) % 5 === 0 ? -0.05 : 0));
    });
    ell(w, 0, 8, 3.8, 4.4, 5.5, 3.6, (px, py, pz, d) => (pz < 5 ? undefined : tone(BELLY, 0.55 + (1 - d) * 0.2)));
    for (const y of [8, 10, 12]) { const x = -Math.round(2 + (y - 6) * 0.35); w.set(x, y, 7, GOLD[3]); }
    for (let k = 0; k < 5; k++) w.set(3 + (k >> 1), 9 + (k === 2 ? -1 : 0), 7, GOLD[k & 1 ? 2 : 3]);
    box(w, -2, 15, 4, 3, 16, 6, (px) => tone(CLOTH.cream, 0.75));
    // head, pink snout, nose, ears
    ell(w, 0, 19, 2, 5, 4.6, 5, furC);
    seg(w, 0, 18.4, 5.6, 0, 17.6, 10, 1.6, (px, py, pz, t) => tone(PINK, 0.55 + t * 0.15 + (px < 0 ? 0.1 : 0)));
    ell(w, 0.5, 17.8, 10.8, 1.2, 1.1, 1.1, glowC('#ff6a8a'));
    for (const sx of [-1, 1]) ell(w, sx * 3.8 + 0.5, 22, 1.8, 1.1, 0.9, 0.6, tone(PINK, 0.6));
    // tiny spectacles over bead eyes
    for (const sx of [-1, 1]) {
      w.set(sx * 2, 20, 6, C('#140c10'));
      torus(w, sx * 2 + 0.5, 20.5, 7, 1.15, 0.45, 'z', GOLD[3]);
      w.set(sx * 2, 20, 7, (NOAO | C('#d8f4ff')) >>> 0);
      w.set(sx * 4, 21, 6, GOLD[2]); w.set(sx * 4, 21, 5, GOLD[2]);
    }
    w.set(0, 20, 7, GOLD[3]);
    // arms with pink, clawed digging hands; pink feet
    for (const sx of [-1, 1]) {
      seg(w, sx * 5.6, 14, 1.3, sx * 8, 10.5, 3, 1.9, furC);
      seg(w, sx * 8, 10.5, 3, sx * 8.2, 7.3, 5, 1.5, furC);
      ell(w, sx * 8.4 + 0.5, 6.3, 6, 1.9, 1.3, 1.8, tone(PINK, 0.6));
      for (let k = -1; k <= 1; k++) w.set(Math.round(sx * 8.4) + k, 5, 8, C('#f4ecd8'));
      ell(w, sx * 3.6 + 0.5, 1, 4.2, 2.3, 1.2, 3.2, (px, py) => (py < 0 ? undefined : tone(PINK, 0.55)));
      for (let k = -1; k <= 1; k++) w.set(Math.round(sx * 3.6) + k, 0, 7, C('#f4ecd8'));
    }
    // floppy felt hat with a red band and a cream feather
    cyl(w, 0.5, 2.5, 23, 24, 7.6, 7.6, (px, py, pz, d) => tone(HAT, 0.45 + (d > 0.8 ? -0.12 : 0) + (px < 0 ? 0.1 : 0)));
    cyl(w, 0.5, 2, 24, 30, 4.2, 3.2, (px, py) => (py === 24 || py === 25 ? tone(palOf('#c83a3a'), 0.5) : tone(HAT, 0.55 + (px < 0 ? 0.1 : 0) + (py === 29 ? 0.1 : 0))));
    seg(w, 3.8, 25, 1.5, 6, 31, -1.5, 0.6, (px, py, pz, t) => tone(CLOTH.cream, 0.6 + t * 0.2));
    // the enormous pack: belted, a bedroll on top, kettle and pan hanging, potions in side loops
    box(w, -7, 7, -13, 8, 28, -5, (px, py, pz) => {
      if ([10, 17, 24].includes(py)) return tone(STRAP, 0.45 + (px === 0 ? 0.3 : 0));
      const c = (px === -7 || px === 7) && (pz === -13 || pz === -6);
      if (c && (py === 7 || py === 27)) return undefined;
      return tone(PACK, 0.42 + (px < 0 ? 0.1 : 0) + ((py + pz) % 6 === 0 ? -0.08 : 0));
    });
    for (const y of [10, 17, 24]) w.set(0, y, -5, GOLD[3]);
    for (const sx of [-1, 1]) { seg(w, sx * 4, 16.5, -5.5, sx * 4, 17, 2, 0.7, tone(STRAP, 0.45)); seg(w, sx * 4, 17, 2, sx * 4.5, 11, 6.5, 0.7, tone(STRAP, 0.45)); }
    cylX(w, -9, 9, 30.5, -9, 2.6, (px, py, pz, d) => (px === -9 || px === 8 ? tone(palOf('#c85a4a'), 0.7 - d * 0.3) : tone(palOf('#9a3a3a'), 0.6 - d * 0.3 + ((px + 40) % 4 === 0 ? -0.1 : 0))));
    for (const sx of [-5, 4]) box(w, sx, 27, -12, sx + 1, 34, -6, tone(STRAP, 0.4));
    vessel(w, -3.5, -7.5, 33, 37, (t) => 2.8 - t * 1.2, (px, py) => tone(COPPER, 0.5 + (px < -3.5 ? 0.15 : 0)));
    w.set(-1, 36, -8, COPPER[3]); w.set(0, 37, -8, COPPER[3]);
    cyl(w, 10.5, -8, 12, 13, 3, 3, (px, py, pz) => tone(IRON, 0.3 + (px < 10 ? 0.1 : 0)));
    seg(w, 10.5, 12.5, -5, 10.5, 12.5, -1.5, 0.5, WOOD[1]);
    for (const [x, y, c] of [[-9, 23, '#9ae8ff'], [-9, 18, '#ffc83a'], [9, 23, '#c08aff']]) {
      box(w, x, y, -8, x + 1, y + 3, -6, glowC(c)); w.set(x, y + 3, -7, WOOD[2]);
    }
  });
  grp.add(body);
  const lan = B.lantern({ hang: 0.12, intensity: 1.6, distance: 4 });
  lan.position.set(0.48, 1.05, 0.2);
  grp.add(lan);
  grp.userData.update = (dt, t) => { body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.012; body.rotation.z = Math.sin(t * 1.1) * 0.03; lan.userData.update && lan.userData.update(dt, t); };
  return grp;
}

export function miner(o) {
  const grp = new THREE.Group();
  grp.add(voxModel('rubble', (w) => {
    const P = palOf('#9a8a7a');
    for (let i = 0; i < 20; i++) {
      const x = -18 + h3(i, 1, 6, 1) * 36, z = -11 + h3(i, 2, 6, 1) * 22, s = 0.7 + h3(i, 3, 6, 1) * 0.9;
      rock(w, x, 2.5 + h3(i, 4, 6, 1) * 4, z, 4 * s, 2.8 * s, 3.5 * s, i % 3 ? P : STONE, 170 + i, { floor: 0 });
    }
    // the fallen beam pinning the pile
    seg(w, -20, 4, 4, 22, 14, -3, 1.9, (px, py, pz) => tone(palOf('#6a4428'), 0.4 + ((px + 40) % 9 === 0 ? -0.12 : 0) + (py > 9 ? 0.08 : 0)));
    // the miner's head poking out: round face, red beard, brass helmet with a lamp
    const hx = -8.75, hy = 7.5, hz = 13.75;
    ell(w, hx + 0.5, hy + 0.5, hz + 0.5, 3, 3, 2.9, (px, py, pz) => tone(palOf('#f0bc94'), 0.5 + (px < hx ? 0.12 : 0)));
    ell(w, hx + 0.5, hy - 1.6, hz + 2.2, 3, 2.2, 1.8, (px, py, pz) => tone(palOf('#8a5a3a'), 0.4 + ((px + py) & 1) * 0.12));
    w.set(Math.round(hx), Math.round(hy), Math.round(hz + 3), tone(palOf('#f0bc94'), 0.7));
    for (const sx of [-1, 1]) w.set(Math.round(hx + sx * 1.1), Math.round(hy + 1), Math.round(hz + 2.8), C('#140c10'));
    ell(w, hx + 0.5, hy + 2.6, hz + 0.3, 3.6, 2.3, 3.5, (px, py, pz) => (py < hy + 2 ? undefined : tone(palOf('#c8902a'), 0.5 + (px < hx ? 0.15 : 0))));
    cyl(w, hx + 0.5, hz + 0.5, hy + 2, hy + 3, 4.2, 4.2, (px, py, pz, d) => (d < 0.7 ? undefined : tone(palOf('#c8902a'), 0.4)));
    box(w, hx - 1, hy + 3, hz + 3, hx + 2, hy + 5, hz + 4, IRON[1]);
    w.set(Math.round(hx), Math.round(hy + 4), Math.round(hz + 4), glowC('#fff0b0'));
  }));
  const arm = new THREE.Group();
  arm.add(voxModel('minerArm', (w) => {
    for (let y = 0; y < 7; y++) box(w, -1, y, -1, 1, y + 1, 1, tone(palOf('#4a6a8a'), 0.45 + (y & 1) * 0.08));
    ell(w, 0, 8, 0, 1.3, 1.4, 1, tone(palOf('#f0bc94'), 0.55));
    w.set(1, 9, 0, tone(palOf('#f0bc94'), 0.6));
  }));
  arm.position.set(0.1, 0.5, 0.6);
  grp.add(arm);
  addLight(grp, new THREE.PointLight(0xfff0b0, 0.7, 3, 1.6), [-0.25, 0.75, 1.3]);
  grp.userData.update = (dt, t) => { arm.rotation.z = Math.sin(t * 6) * 0.5 + 0.2; };
  return grp;
}

export function snail(o) {
  const grp = new THREE.Group();
  const body = voxModel('snail', (w) => {
    const SK = palOf('#a8c880'), SH = palOf('#d8c0a8'), SU = palOf('#6a4432');
    // a soft foot that rises into the neck and a round head
    for (let x = -13; x <= 8; x++) {
      const t = (x + 13) / 21, r = 1 + t * 1.6, y = 1.2 + t * 1.4;
      cylX(w, x, x + 1, y, 0.5, r * 1.15, (px, py, pz, d) => (py < 0 ? undefined : tone(SK, 0.45 + (py > y ? 0.12 : 0) - (py === 0 ? 0.1 : 0))));
    }
    seg(w, 7.5, 2.5, 0.5, 11, 5.5, 0.5, 2.4, (px, py) => tone(SK, 0.5 + (px > 10 ? 0.05 : 0)));
    ell(w, 11.6, 6.8, 0.5, 2.8, 3.1, 2.6, (px, py, pz) => tone(SK, 0.55 + (py > 7 ? 0.1 : 0)));
    for (const sz of [-1, 1]) {
      seg(w, 11.8, 8.5, 0.5 + sz * 1, 12.6, 14, 0.5 + sz * 2.5, 0.55, tone(SK, 0.55));
      ell(w, 12.8, 14.6, 0.5 + sz * 2.6, 1.1, 1.1, 1.1, C('#f4f0e0'));
      w.set(14, 14, Math.round(0.5 + sz * 2.6) - (sz < 0 ? 1 : 0), C('#140c10'));
      w.set(14, 6, sz < 0 ? -1 : 2, C('#ff8aa0'));
    }
    w.set(14, 5, 0, C('#5a3a2a')); w.set(14, 5, 1, C('#5a3a2a'));
    // spiral shell: cream and caramel bands wound in toward the centre, a dark suture following the curl
    const cx = -2, cy = 9.5, R = 6.5;
    for (let y = 2; y < cy + R + 1; y++) for (let x = Math.floor(cx - R) - 1; x <= cx + R; x++) for (let z = -4; z <= 4; z++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), zr = 3.9 * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
      if (r > R || Math.abs(z + 0.5) > zr) continue;
      const a = Math.atan2(dy, dx), turn = ((r / R) * 2.4 - (a / (Math.PI * 2)) + 10) % 1;
      const suture = turn < 0.12;
      w.set(x, y, z, suture ? tone(SU, 0.45) : tone(SH, 0.4 + turn * 0.4 + (Math.abs(z + 0.5) > zr - 1 ? 0.08 : 0)));
    }
    // ore crystals growing from the shell
    spire(w, -3, 15.5, 0.5, 0.1, 1, 0, 3.5, 1.1, '#b06bff', 1);
    spire(w, 0, 14.8, 1.5, 0.4, 1, 0.3, 2.4, 0.8, '#6ad8ff', 2);
    spire(w, -5.5, 14, -0.5, -0.5, 1, -0.2, 2.2, 0.8, '#b06bff', 3);
  });
  grp.add(body);
  grp.userData.update = (dt, t) => { body.scale.x = 1 + Math.sin(t * 2) * 0.03; };
  return grp;
}
