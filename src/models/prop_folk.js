// The little folk of the mine as voxel figures: Mossbottom the merchant mole (waistcoat, tiny
// spectacles, an enormous pack), a trapped miner waving from a rockfall, and Gravel the ore snail.
import * as THREE from 'three';
import {
  C, glowC, mixC, tone, box, ell, cyl, cylX, seg, h3, NOAO, IRON, WOOD, CLOTH,
  palOf, STONE, GOLD, COPPER, FUR, PINK, voxModel, rock, torus, vessel, spire, addLight,
} from './prop_vox.js';



export function snail(o) {
  const grp = new THREE.Group();
  const body = voxModel('snail', (w) => {
    const SK = palOf('#86d0a8'), SH = palOf('#e8c8a0'), SU = palOf('#7a4a36');
    // a soft foot that rises into the neck and a round head
    for (let x = -13; x <= 8; x++) {
      const t = (x + 13) / 21, r = 1 + t * 1.6, y = 1.2 + t * 1.4;
      cylX(w, x, x + 1, y, 0.5, r * 1.15, (px, py, pz, d) => (py < 0 ? undefined : tone(SK, 0.45 + (py > y ? 0.12 : 0) - (py === 0 ? 0.1 : 0))));
    }
    seg(w, 7.5, 2.5, 0.5, 11.5, 6, 0.5, 2.6, (px, py) => tone(SK, 0.5 + (px > 10 ? 0.05 : 0)));
    ell(w, 12.2, 7.6, 0.5, 3.4, 3.6, 3.2, (px, py, pz) => tone(SK, 0.55 + (py > 8 ? 0.1 : 0)));
    for (const sz of [-1, 1]) {
      seg(w, 12.4, 10, 0.5 + sz * 1.2, 13.4, 16.5, 0.5 + sz * 2.8, 0.6, tone(SK, 0.6));
      ell(w, 13.6, 17.2, 0.5 + sz * 2.9, 1.5, 1.5, 1.5, C('#f4f0e0'));
      w.set(15, 17, sz < 0 ? -3 : 3, C('#140c10')); w.set(15, 18, sz < 0 ? -3 : 3, C('#ffffff'));
      w.set(15, 7, sz < 0 ? -2 : 2, C('#ff8aa0'));
    }
    for (const z of [-1, 0, 1]) w.set(15, 6, z, C('#3a5a3a'));
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
