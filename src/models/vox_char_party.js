// The four explorers' designs, painted voxel by voxel on the party's fine grid (0.02 world units).
// Heroic, slightly exaggerated proportions (broad shoulders, big hands, chunky boots), bold colour
// blocks with one accent each, oversized signature gear, and real detail: folds, stitching,
// rivets, buckles, pouches, tatters, fur trim, engraved metal, glowing runes. No human faces.
//   Bran   — blacksmith: giant smith's hammer, a forge-gauntlet with coals glowing through its
//            vents, chain-and-leather apron, a welding mask with a glowing slit, scarf tails.
//   Elio   — elemental mage: tall pointed hood with a magical visage in its dark (eyes of arcane
//            light, a brow mark, drifting stars), layered tattered robes, orbiting rune stones, a
//            crystal staff, and Kindle.
//   Durgan — gnome warrior: squat and massive, layered pauldrons, a tower shield made from a
//            minecart door, a horned closed helm, a braided beard, an ore-studded maul.
//   Clover — rabbit rogue: a cute porcelain rabbit mask under a hood with long ears through it, a
//            long trailing scarf, twin daggers, a coin belt and lucky charms, a light springy build.
import * as THREE from 'three';
import { VPart, VOX_PARTY, hash, voxGlow } from './vox_char_kit.js';
import { Kindle } from './vox_char_kindle.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** Angle around the vertical axis: 0 = front (+z), +π/2 = the figure's left (+x). */
const ang = (x, z) => Math.atan2(x + 0.5, z + 0.5);

// ------------------------------------------------------------------ surfaces: a few flat tones each
// Ramps run [deep, shade, base, light]. Tones are flat (no dither) so colour reads in blocks and
// the mesher can merge them; the detail is drawn on purpose.
const cloth = (R, n = 7, ph = 0) => (x, y, z) => { const f = Math.sin(ang(x, z) * n + y * 0.07 + ph); return f > 0.8 ? R[1] : f < -0.88 ? R[3] : R[2]; };
const hide = (R, s = 1) => (x, y, z) => (hash(x, y, z, s + 7) > 0.975 ? R[3] : hash(x >> 2, y >> 2, z >> 2, s) > 0.84 ? R[1] : R[2]);
const metal = (R, s = 2) => (x, y, z) => ((y + (x >> 2) + (z >> 3) + 99) % 11 === 0 ? R[3] : hash(x >> 1, y >> 1, z >> 1, s) > 0.92 ? R[1] : R[2]);
const mail = (R) => (x, y, z) => (((x + y) & 1) ^ ((z + y) & 1) ? R[1] : R[3]);
const fur = (R, s = 4) => (x, y, z) => R[1 + Math.floor(hash(x, y >> 1, z, s) * 3)];
const wood = (R, s = 5) => (x, y, z) => (Math.sin(y * 0.5 + x * 1.7 + z) > 0.7 ? R[1] : hash(x, y >> 2, z, s) > 0.9 ? R[3] : R[2]);
const G = (c) => ({ glow: true, c });

// ------------------------------------------------------------------ detail helpers
/** Recolour the outside of a part wherever test holds. */
const skin = (P, test, col) => P.paint((x, y, z, c) => (test(x, y, z) && P.surface(x, y, z) ? (typeof col === 'function' ? col(x, y, z, c) : col) : undefined));
/** A band of colour on the outside between y0 and y1. */
const band = (P, y0, y1, col) => skin(P, (x, y) => y >= y0 && y < y1, col);
/** Dashed stitching along the outside wherever test holds. */
const stitch = (P, test, col) => skin(P, (x, y, z) => test(x, y, z) && (x + y + z + 300) % 3 !== 0, col);
/** First filled voxel walking in along an axis (0 x, 1 y, 2 z) from the sign side at (x,y,z). */
function surf(P, x, y, z, axis, sign, far = 48) {
  const p = [x, y, z];
  for (let i = far; i > -far; i--) { p[axis] = sign * i; if (P.has(p[0], p[1], p[2])) return p; }
  return null;
}
/** A raised stud (rivet, bolt, gem) on the surface along an axis. */
function stud(P, x, y, z, axis, sign, col, h = 1) {
  const p = surf(P, x, y, z, axis, sign);
  if (!p) return;
  for (let i = 1; i <= h; i++) { p[axis] += sign; P.set(p[0], p[1], p[2], col); }
}
/** Studs around the part at height y, n of them, from angle a0. */
function ring(P, y, n, col, a0 = 0, test = null) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, sx = Math.sin(a), cz = Math.cos(a);
    for (let r = 26; r >= 0; r -= 0.5) {
      const x = Math.floor(sx * r), z = Math.floor(cz * r);
      if (P.has(x, y, z)) { if (!test || test(a)) P.set(Math.floor(sx * (r + 1)), y, Math.floor(cz * (r + 1)), col); break; }
    }
  }
}
/** Ragged hem: columns around the garment end at staggered heights above yb. */
function tatter(P, yb, depth, n, s, test = () => true) {
  P.carve((x, y, z) => {
    if (y >= yb + depth || !test(x, y, z)) return false;
    const u = (ang(x, z) / TAU + 0.5) * n, col = Math.floor(u), f = u - col;
    const cut = yb + Math.floor(hash(col, s) * depth) + (hash(col, s + 1) > 0.5 ? Math.floor(Math.abs(f - 0.5) * 2 * 2.5) : 0);
    return y < cut;
  });
}
/** A pouch with a flap and a button, on a side face (axis normal, sign). */
function pouch(P, c, w, h, d, R, btn) {
  const [cx, cy, cz] = c;
  P.box(cx - w / 2, cy - h, cz - d / 2, cx + w / 2, cy, cz + d / 2, (x, y, z) => (y >= cy - h * 0.38 ? R[3] : R[2]));
  P.box(cx - w / 2, cy - h * 0.38 - 1, cz - d / 2, cx + w / 2, cy - h * 0.38, cz + d / 2, R[1]);
  if (btn) P.set(cx, cy - h * 0.38 - 1, cz + d / 2, btn);
}
/** A rectangular buckle frame (in the x/y plane) at depth z. */
function buckle(P, x0, y0, w, h, z, frame, inner) {
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) {
    const edge = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1;
    P.set(x, y, z, edge ? frame : inner);
    if (edge) P.set(x, y, z + 1, frame);
  }
  for (let y = y0 + 1; y < y0 + h - 1; y++) P.set(x0 + (w >> 1), y, z + 1, frame); // the tongue
}
/**
 * Invented fantasy marks (no real-world runes or symbols): ring-and-dot, crescent, sparkle, drop,
 * eye, waves, ladder, peak; and small 3×3 ones. glyph(i, set) → [[x, y], ...] centred, y up.
 */
const GLYPHS5 = [
  ['.###.', '#...#', '#.#.#', '#...#', '.###.'], ['.###.', '#....', '#....', '#....', '.###.'],
  ['..#..', '..#..', '##.##', '..#..', '..#..'], ['..#..', '.###.', '#####', '#####', '.###.'],
  ['.....', '.###.', '#.#.#', '.###.', '.....'], ['#.#.#', '.#.#.', '.....', '#.#.#', '.#.#.'],
  ['#...#', '#####', '#...#', '#####', '#...#'], ['.....', '..#..', '.#.#.', '#...#', '#####'],
];
const GLYPHS3 = [['###', '#.#', '###'], ['.#.', '###', '.#.'], ['#.#', '.#.', '#.#'], ['.#.', '#.#', '.#.'], ['##.', '#.#', '.##']];
const ANVIL = ['##########', '.#########', '.....####.', '.....###..', '....#####.', '...#######'];
function glyph(i, set = GLYPHS5) {
  const rows = Array.isArray(set[0]) ? set[((i % set.length) + set.length) % set.length] : set;
  const out = [], h = rows.length, w = rows[0].length;
  rows.forEach((r, row) => { for (let x = 0; x < w; x++) if (r[x] === '#') out.push([x - (w >> 1), h - 1 - row - (h >> 1)]); });
  return out;
}

// ------------------------------------------------------------------ palettes
const PAL = {
  bran: {
    shirt: ['#1a2436', '#24344c', '#30476a', '#45628a'], pants: ['#17171b', '#212127', '#2c2b33', '#3a3944'],
    leather: ['#28150b', '#3c2313', '#56341c', '#74492a'], apron: ['#20120a', '#341c0f', '#4a2b17', '#6a4024'],
    iron: ['#181a20', '#272b33', '#3d434c', '#6c7480'], brass: ['#6a4412', '#a8761e', '#dca838', '#ffe48a'],
    scarf: ['#4e0e0e', '#841a16', '#b42a22', '#e24c36'], skin: ['#7a4a30', '#a0663e', '#c08050', '#dca070'],
    hair: ['#5a1e0c', '#82301a', '#ae4a24', '#d26a34'], coal: ['#c83a08', '#ff7a14', '#ffb83a', '#fff0b0'],
    wood: ['#2a170c', '#40261a', '#5c3a24', '#7a5032'], sole: '#110a06',
  },
  elio: {
    robe: ['#22163c', '#302058', '#442e78', '#5c429c'], inner: ['#101230', '#181c42', '#22275a', '#30387a'],
    lining: ['#0c2e40', '#124660', '#1a6282', '#2c84a8'], trim: ['#7a4a10', '#b8801e', '#f0bc40', '#ffe89a'],
    sash: ['#460c20', '#66142e', '#8a203e', '#b03a58'], stone: ['#26243a', '#383650', '#504e6a', '#6e6c8c'],
    glove: ['#120e16', '#1c1622', '#282030', '#382e42'], wood: ['#1e100a', '#341e12', '#4c2e1c', '#664026'],
    crystal: ['#1a5a9a', '#32a0e0', '#7ae0ff', '#e4fbff'], paper: ['#b8a888', '#d8ccae', '#efe6d0'],
    rune: '#78f0ff', void: '#040308', glint: '#c4faff', eye: ['#3ad8ff', '#bdf6ff', '#ffffff', '#c890ff'],
  },
  durgan: {
    steel: ['#20242c', '#363c48', '#56606e', '#94a0b2'], bronze: ['#56300e', '#8c5420', '#c88634', '#f2c066'],
    mail: ['#262a32', '#3a404a', '#56606c', '#828c9a'], tunic: ['#121a32', '#1a2644', '#24345a', '#324878'],
    leather: ['#28170b', '#3c2513', '#56371d', '#74502c'], beard: ['#64220e', '#963816', '#c85624', '#ee8648'],
    horn: ['#625238', '#a08c68', '#d4c6a0', '#f6eed6'], fur: ['#28190c', '#3c2a16', '#584024', '#785a36'],
    rust: ['#2a1c18', '#4a2c20', '#7a4026', '#a85c30'], cart: ['#1c1e22', '#2e3238', '#464c54', '#6a727c'],
    stone: ['#363029', '#4e463c', '#6a6052', '#8c806c'], wood: ['#28160c', '#3e2616', '#58391f', '#74502c'],
    ore: ['#7a26a0', '#b048e0', '#de88ff', '#ffd8ff'], paint: '#d8b440', slit: '#050306',
  },
  clover: {
    hood: ['#0c2a2c', '#143e40', '#1e5858', '#2c7672'], lining: ['#8a7a5a', '#b8a47e', '#d8c8a0', '#f0e6cc'],
    scarf: ['#64121a', '#962028', '#c4323a', '#ec5850'], shirt: ['#86806a', '#aea68a', '#d2caa8', '#ece4cc'],
    vest: ['#381e0c', '#563216', '#764822', '#966232'], shorts: ['#1c1824', '#282232', '#362e44', '#483e58'],
    stockA: ['#946410', '#c48c1c', '#e4ac2e', '#f6cc58'], stockB: ['#36220f', '#4a301c', '#5e3e26', '#765034'],
    boot: ['#28180e', '#3c2616', '#543820', '#6e4c2e'], fur: ['#a49484', '#c8bcac', '#e6ded2', '#ffffff'],
    inner: ['#b4606a', '#d68088', '#eca0a6', '#ffc6cc'], gold: ['#7a5010', '#b8841e', '#f0c03a', '#fff0a0'],
    silver: ['#5a6070', '#8a94a4', '#c0c8d4', '#eef2f8'], clover: ['#1a5a1e', '#2a8a2e', '#46b848', '#8ae88a'],
    shadow: '#07060b', rose: '#a8546a', porcelain: ['#b8aa9c', '#ddd2c6', '#f4eee6', '#ffffff'], paint: '#3a2232', nose: ['#e86a86', '#ffaabb'],
    blush: '#f6a2ae', ribbon: ['#7a1430', '#b42448', '#e04a6c', '#ff8aa4'],
  },
};

// ------------------------------------------------------------------ builders
export const BUILD = {
  // ================================================================ BRAN, the blacksmith
  bran(c) {
    const C = PAL.bran;
    c.rigFrom({ footH: 5, legLo: 17, legUp: 18, torsoH: 26, neckH: 2, shX: 14, shY: 22, armUp: 15, armLo: 14, hipX: 6, grip: 4.5 });
    const R = c.rig;
    c.coalMat = voxGlow();
    const coal = (x, y, z) => C.coal[1 + Math.floor(hash(x, y, z, 77) * 3)];

    // pelvis: trousers, a thick belt with a big brass buckle, pouches, tongs on a loop
    c.part(R.hips, (P) => {
      P.loft(-8, 2, (y) => [9.6 + (y + 8) * 0.05, 6.9], cloth(C.pants, 5));
      P.loft(-1, 3, () => [10.5, 7.8], (x, y) => (y === -1 || y === 2 ? C.leather[3] : C.leather[2]));
      buckle(P, -3, -2, 6, 6, 8, C.brass[2], C.leather[1]);
      for (const x of [-9, -6, 5, 8]) stud(P, x, 0, 0, 2, 1, C.brass[3]);
      pouch(P, [10.5, 0, 1], 4, 8, 6, C.leather, C.brass[3]);
      pouch(P, [8.5, -1, -5], 4, 6, 4, C.apron, C.brass[2]);
      for (const dz of [0, 2]) P.cap([-10.5, -1, 2 + dz], [-11.5, -13, 3 + dz], 0.9, 0.7, C.iron[3]);
      P.ell(-11, -1, 3, 1.4, 1.4, 2, C.iron[2]);
    });
    // the apron skirt: scorched leather to the knees, a stitched hem, a pocket of tools
    const ap = c.joint(R.hips, ...c.v(0, -1, 8));
    c.part(ap, (P) => {
      for (let y = -25; y <= 0; y++) for (let x = -9; x < 9; x++) {
        const bot = -24 + Math.floor(hash(x >> 1, 3, 9) * 2.4);
        if (y < bot || (y < -21 && Math.abs(x + 0.5) > 8.5 - (y + 21) * -0.9)) continue;
        const z0 = -Math.round(((x + 0.5) ** 2) / 34);
        const scorch = hash(x >> 1, y >> 1, 4) > 0.86;
        const edge = Math.abs(x + 0.5) > 7.6 || y === bot;
        for (let z = z0 - 1; z <= z0; z++) P.set(x, y, z, edge && (x + y) % 3 !== 0 ? C.apron[3] : scorch ? C.apron[0] : hide(C.apron, 12)(x, y, z));
      }
      // pocket with a chisel and a file poking out
      for (let y = -12; y <= -5; y++) for (let x = 1; x <= 6; x++) P.set(x, y, 1, y === -5 || x === 1 || x === 6 ? C.apron[3] : C.apron[1]);
      P.cap([2.5, -5, 1.5], [2.5, -1, 2], 0.9, 0.9, C.wood[2]); P.cap([2.5, -1, 2], [2.5, 0.5, 2], 0.6, 0.6, C.iron[3]);
      P.cap([4.8, -5, 1.5], [5, -2, 1.5], 0.6, 0.6, C.iron[2]);
      for (const x of [-8, 7]) P.set(x, -1, 1, C.brass[3]);
    });
    c.addSpring(ap, 'x', { base: 0, src: 'vz', gain: 0.15, k: 70, d: 7, wobble: 0.02, min: -1.1, max: 0.12, extra: (ch) => -Math.max(0, ch.pose.lHip, ch.pose.rHip) * 0.55 });

    // torso: a V of a chest under a chain-and-leather bib, chains over the shoulders
    const torso = (y) => { const t = y / 26; return [9.6 + sm(t / 0.62) * 4.2 - Math.max(0, t - 0.8) * 30, Math.max(3, 6.6 + Math.sin(Math.PI * clamp(t * 1.15, 0, 1)) * 1.8 - Math.max(0, t - 0.84) * 12)]; };
    c.part(R.spine, (P) => {
      P.loft(-1, 27, (y) => { const [rx, rz] = torso(y); return rx < 3 ? null : [rx, rz]; }, cloth(C.shirt, 9));
      const bw = (y) => 8.6 - Math.max(0, y - 15) * 0.55;
      P.loft(0, 22, (y) => { const [rx, rz] = torso(y); return [rx + 1.3, rz + 1.3]; }, (x, y, z) => {
        const w = bw(y), ax = Math.abs(x + 0.5);
        if (ax > w) return undefined;
        if (ax > w - 1.2 || y === 0 || y === 21) return (x + y) % 3 ? C.apron[3] : C.apron[2];
        return y >= 13 ? mail(C.iron)(x, y, z) : hide(C.apron, 13)(x, y, z);
      }, { front: true });
      for (const sx of [-1, 1]) {
        // chains over the shoulders and down the back
        P.path([[sx * 7, 21, 8.2, 1.1], [sx * 9.5, 26.5, 1, 1.1], [sx * 7.5, 21, -7.4, 1.1], [sx * 3, 9, -8, 1.1]], (x, y) => ((y >> 1) & 1 ? C.iron[3] : C.iron[1]));
        stud(P, sx * 7 - (sx < 0 ? 1 : 0), 20, 0, 2, 1, C.brass[3]);
      }
      P.ell(0, 9, -8.5, 2, 2, 1.2, C.brass[2]);
      // scarf wound at the throat, knotted at the side
      P.loft(21, 28, (y) => [9.2 - (y - 21) * 0.25, 8 - (y - 21) * 0.2], cloth(C.scarf, 10), { shell: 2.8 });
      P.ell(7, 22.5, 4, 3.2, 3, 3, cloth(C.scarf, 4, 1));
    });
    c.chain(R.spine, c.v(8, 21, 3), 3, 6, (P, i) => P.box(-2, -6, -1, 2, 0, 1, (x, y) => (i === 2 && y < -4 ? C.scarf[3] : (x + 9) % 4 === 0 ? C.scarf[1] : C.scarf[2])), { rot: [0.35, 0, 0.55], gain: 0.55, k: 55 });

    // head: a leather hood, an iron welding mask with a glowing slit
    c.part(R.head, (P) => {
      const hood = hide(C.leather, 31);
      P.ell(0, 9, -0.5, 8.6, 9.6, 8.8, hood);
      P.loft(-3, 3, (y) => [7.6 + (3 - y) * 0.5, 7 + (3 - y) * 0.4, 0, -0.5], hood);
      stitch(P, (x, y) => (x === -1 || x === 0) && y > 12, C.leather[3]);
      const pw = (y) => (y < 3 ? 4.6 + y * 0.8 : y > 14 ? 7.2 - (y - 14) * 1.3 : 7.2);
      for (let y = 1; y <= 16; y++) for (let x = -8; x < 8; x++) {
        const ax = Math.abs(x + 0.5), w = pw(y);
        if (ax > w) continue;
        const z0 = surf(P, x, y, 0, 2, 1);
        const zf = Math.max(z0 ? z0[2] + 1 : 8, Math.round(9.6 - ax * ax / 15));
        const col = ax > w - 1 || y === 1 || y === 16 ? C.iron[3] : ax > w - 2 || y === 2 || y === 15 ? C.iron[0] : metal(C.iron, 33)(x, y, 0);
        for (let z = (z0 ? z0[2] + 1 : 6); z <= zf; z++) P.set(x, y, z, col);
      }
      // the slit: two rows cut deep, glowing with the forge behind the glass
      for (let x = -6; x < 6; x++) for (const y of [9, 10]) {
        const p = surf(P, x, y, 0, 2, 1);
        if (!p) continue;
        P.set(x, y, p[2], null); P.set(x, y, p[2] - 1, null);
        P.set(x, y, p[2] - 2, G(Math.abs(x + 0.5) < 2.5 ? C.coal[3] : y === 10 ? C.coal[2] : C.coal[1]));
      }
      for (let x = -7; x < 7; x++) stud(P, x, 11, 0, 2, 1, x === -7 || x === 6 ? C.iron[2] : C.iron[3]); // brow ridge
      for (let y = 2; y <= 7; y++) for (const x of [-1, 0]) stud(P, x, y, 0, 2, 1, y === 7 ? C.iron[3] : C.iron[2]); // centre ridge
      for (const [x, y] of [[-6, 14], [5, 14], [-7, 4], [6, 4], [-4, 1], [3, 1]]) stud(P, x, y, 0, 2, 1, C.brass[3]);
      for (const sx of [-1, 1]) { P.ell(sx * 8.6, 10, 2.5, 1.2, 2.4, 2.4, C.brass[2]); P.set(sx > 0 ? 9 : -10, 10, 2, C.brass[0]); }
      // auburn hair bursting from the crown and the nape
      for (let i = 0; i < 7; i++) {
        const x = -4 + i * 1.4, z = -3 - (i % 3);
        P.cap([x, 15.5, z], [x + (hash(i, 1) - 0.5) * 5, 20.5 + hash(i, 2) * 2, z - 3], 1.6, 0.5, (xx, y, zz, t) => C.hair[t > 0.6 ? 3 : t > 0.25 ? 2 : 1]);
      }
      for (let i = 0; i < 4; i++) P.cap([-3 + i * 2, 4, -8], [-3.5 + i * 2.2, 1, -10.5], 1.3, 0.5, (x, y, z, t) => C.hair[t > 0.5 ? 2 : 1]);
    }, { glowMat: c.coalMat, glow: 2.2 });
    c.headTop = 19 * 0.02;

    // arms: rolled sleeves on big shoulders; a bare right forearm, a forge-gauntlet on the left
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => {
        P.ell(0, -1, 0, 5.8, 5.6, 5.6, cloth(C.shirt, 6));
        P.cap([0, 0, 0], [0, -13, 0], 5.1, 4.5, cloth(C.shirt, 6));
        P.cap([0, -10.5, 0], [0, -14.5, 0], 5.6, 5.4, (x, y) => (y === -12 ? C.shirt[1] : C.shirt[3]), false, { flat: true });
      });
    }
    c.part(R.elR, (P) => {
      P.cap([0, 0, 0], [0, -13, 0], 4.2, 3.7, (x, y, z) => (hash(x, y, z, 5) > 0.93 ? C.skin[1] : C.skin[2]));
      P.cap([0, -6.5, 0], [0, -13.5, 0], 4.6, 4.3, hide(C.leather, 6), false, { flat: true });
      band(P, -9, -8, C.leather[0]); band(P, -12, -11, C.leather[0]);
      for (const y of [-9, -12]) stud(P, 0, y, 0, 0, -1, C.brass[3]);
    });
    c.part(R.handR, (P) => {
      P.ell(0, -3.8, 0.6, 4.3, 4.8, 4.1, hide(C.leather, 7));
      skin(P, (x, y, z) => y === -7 && z > 1, C.leather[3]);
      P.cap([2.5, -2, 3], [2, -5, 4.5], 1.6, 1.4, hide(C.leather, 7));
    });
    c.part(R.elL, (P) => {
      P.cap([0, 1, 0], [0, -13, 0], 5.7, 6.4, metal(C.iron, 8));
      band(P, -1, 2, C.brass[2]); band(P, -14, -11, C.brass[2]);
      ring(P, 0, 8, C.brass[3], 0.4); ring(P, -12, 8, C.brass[3], 0.4);
      // vents across the outer face: the coals glow through
      for (const vy of [-3, -6, -9]) P.paint((x, y, z) => {
        if (y < vy - 1 || y > vy) return undefined;
        const a = ang(x, z), d = Math.hypot(x + 0.5, z + 0.5), r = 5.7 + (6.4 - 5.7) * clamp(-y / 13, 0, 1);
        if (a < -0.2 || a > 2.2) return undefined;
        return d > r - 1.8 ? null : d > r - 2.9 ? G(coal(x, y, z)) : undefined;
      });
    }, { glowMat: c.coalMat });
    c.part(R.handL, (P) => {
      P.ell(0, -4, 0.6, 5.2, 5.4, 5, metal(C.iron, 9));
      for (const y of [-6, -8]) skin(P, (x, yy, z) => yy === y && z > 0, C.iron[0]);
      for (let x = -3; x <= 2; x += 2) stud(P, x, -3, 0, 2, 1, C.brass[3]);
      skin(P, (x, y, z) => y === -7 && z > 2 && (x & 1), G(C.coal[2]));
      P.cap([-3, -2, 3], [-2.5, -5.5, 5], 2, 1.7, metal(C.iron, 9));
    }, { glowMat: c.coalMat });

    // legs: dark trousers with a patched knee, chunky boots with steel toes
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['hip' + side], (P) => {
        P.cap([0, 1, 0], [0, -18, 0], 5.7, 4.7, cloth(C.pants, 5));
        P.ell(0, -16, 3.8, 3.6, 3.4, 1.8, hide(C.leather, 14));
        stitch(P, (x, y, z) => z > 4 && Math.hypot(x + 0.5, (y + 16) * 1.05) > 2.6 && Math.hypot(x + 0.5, y + 16) < 3.8, C.leather[3]);
      });
      c.part(R['kn' + side], (P) => {
        P.cap([0, 0, 0], [0, -10, 0], 4.7, 4.3, cloth(C.pants, 5));
        P.cap([0, -8, 0], [0, -17.5, 0], 5, 4.8, hide(C.leather, 15), false, { flat: true });
        P.cap([0, -7.5, 0], [0, -10.5, 0], 5.7, 5.6, (x, y) => (y === -10 ? C.leather[1] : C.leather[3]), false, { flat: true });
      });
      c.part(R['ft' + side], (P) => {
        P.ell(0, -1.6, 2.6, 5.2, 3.8, 7.6, hide(C.leather, 16));
        P.carve((x, y) => y < -5);
        P.paint((x, y, z) => (y <= -4 ? C.sole : z > 5.5 && y > -4 ? metal(C.iron, 17)(x, y, z) : undefined));
        band(P, -1, 1, (x, y, z) => (z > 0 && z < 3 ? C.leather[0] : undefined));
        stud(P, 0, 0, 1, 0, sx, C.brass[3]);
      });
    }

    // the giant smith's hammer across the back
    const hj = c.joint(R.spine, ...c.v(0, 13, -10));
    hj.rotation.set(0.12, 0, 0.75);
    c.part(hj, (P) => {
      P.cap([0, -34, 0], [0, 27, 0], 2.2, 2.2, wood(C.wood));
      for (let y = -32; y < -18; y += 2) band(P, y, y + 1, C.leather[2]);
      P.ell(0, -35, 0, 3, 2.4, 3, C.iron[2]);
      const hx = 12, y0 = 27, y1 = 40, hz = 7; const st = ['#2a2e36', '#454b56', '#666e7c', '#9aa4b4'];
      for (let x = -hx; x < hx; x++) for (let y = y0; y < y1; y++) for (let z = -hz; z < hz; z++) {
        const ex = Math.abs(x + 0.5) > hx - 1.5, ey = y === y0 || y === y1 - 1, ez = Math.abs(z + 0.5) > hz - 1.5;
        if (ex + ey + ez >= 2) continue;
        const ax = Math.abs(x + 0.5);
        P.set(x, y, z, ex ? st[3] : ax > 6.5 && ax < 8.5 ? (y % 3 ? C.brass[2] : C.brass[3]) : metal(st, 18)(x, y, z));
      }
      for (const z of [-hz, hz - 1]) for (const [gx, gy] of glyph(0, ANVIL)) P.set(gx, 33 + gy, z, G(C.coal[gy > 0 ? 2 : 1]));
      for (const x of [-8, 7]) for (const y of [y0 + 1, y1 - 2]) { P.set(x, y, hz, C.brass[3]); P.set(x, y, -hz - 1, C.brass[3]); }
    }, { glowMat: c.coalMat });
    c.backItem = hj;

    c.extraUpdate = () => {
      const t = c.time;
      c.coalMat.color.setScalar(0.72 + Math.sin(t * 11) * 0.1 + Math.sin(t * 23.7) * 0.06 + c.pose.flare * 0.9);
    };
  },

  // ================================================================ ELIO, the elemental mage
  elio(c) {
    const C = PAL.elio;
    c.rigFrom({ footH: 3, legLo: 16, legUp: 16, torsoH: 23, neckH: 1, shX: 10, shY: 19, armUp: 14, armLo: 13, hipX: 4, grip: 3.5 });
    const R = c.rig;
    c.runeMat = voxGlow();
    const robe = cloth(C.robe, 8), inner = cloth(C.inner, 9);

    // sash with a rune-stone clasp, tails on springs
    c.part(R.hips, (P) => {
      P.loft(-4, 3, () => [9, 7.4], inner);
      P.loft(-2, 2, () => [9.9, 8.3], cloth(C.sash, 6));
      P.ell(0, 0, 8.6, 2.6, 2.6, 1.5, C.stone[2]);
      for (const [gx, gy] of glyph(0, GLYPHS3)) P.set(gx, gy, 10, G(C.rune));
    }, { glowMat: c.runeMat });
    c.chain(R.hips, c.v(6, -1, 6), 3, 6, (P, i) => P.box(-1.5, -6, -1, 1.5, 0, 1, (x, y) => (i === 2 && y < -4 ? C.trim[2] : C.sash[x === -2 ? 1 : 2])), { rot: [0.1, 0, 0.2], gain: 0.5, k: 55 });
    // the robes: an inner robe to the floor and an open outer robe, both tattered, gold at the edges
    const sk = c.joint(R.hips, 0, -0.02, 0);
    c.part(sk, (P) => {
      const H = 33;
      const I = new VPart();
      I.loft(-H, 1, (y) => { const t = -y / H; return [8.8 + t * 6, 7 + t * 5.4]; }, inner, { shell: 2.2 });
      tatter(I, -H, 4, 30, 11);
      P.add(I);
      const O = new VPart();
      O.loft(-H + 4, 2, (y) => { const t = -y / H; return [10 + t * 6.6, 8.2 + t * 6]; }, (x, y, z, { u }) => {
        const t = -y / H, open = 0.34 + t * 0.32;
        if (Math.abs(u) < open) return undefined;
        return Math.abs(u) < open + 0.16 ? C.trim[y % 4 === 0 ? 3 : 2] : robe(x, y, z);
      }, { shell: 1.7 });
      tatter(O, -H + 4, 7, 26, 12);
      O.paint((x, y, z) => (!O.has(x, y - 1, z) && O.surface(x, y, z) ? C.trim[2] : undefined));
      P.add(O);
    });
    c.addSpring(sk, 'x', { base: 0, src: 'vz', gain: 0.4, k: 40, d: 5, wobble: 0.025, min: -0.5, max: 0.5, extra: (ch) => -Math.max(0, ch.pose.lHip, ch.pose.rHip) * 0.25 });
    c.addSpring(sk, 'z', { base: 0, src: 'vx', gain: -0.25, k: 40, d: 5, wobble: 0.02, rate: 1.7, min: -0.4, max: 0.4 });

    // torso: inner robe, a stole of glowing runes, a tattered mantle, a high gold collar
    const stoleGlyph = (k) => glyph(k, GLYPHS3);
    c.part(R.spine, (P) => {
      const tr = (y) => { const t = y / 23; return [8.7 + sm(t / 0.7) * 2.6 - Math.max(0, t - 0.82) * 22, Math.max(3, 6.6 + Math.sin(Math.PI * clamp(t, 0, 1)) * 1.1 - Math.max(0, t - 0.85) * 9)]; };
      P.loft(-1, 24, (y) => { const [rx, rz] = tr(y); return rx < 3 ? null : [rx, rz]; }, inner);
      for (const sx of [-1, 1]) P.loft(0, 19, (y) => { const [rx, rz] = tr(y); return [rx + 0.8, rz + 0.8]; }, (x, y, z) => {
        if (Math.abs(x + 0.5 - sx * 3.6) > 1.8) return undefined;
        const ry = (y + 200) % 6, gl = stoleGlyph(Math.floor(y / 6) + sx * 7 + 20);
        if (z > 3 && ry > 0 && ry < 4 && gl.some(([gx, gy]) => gx === Math.round(x + 0.5 - sx * 3.6) && gy === ry - 2)) return G(C.rune);
        return Math.abs(x + 0.5 - sx * 3.6) > 1.1 ? C.trim[2] : C.sash[2];
      }, { front: true });
      const M = new VPart();
      M.loft(9, 23, (y) => { const t = (y - 9) / 14; return [13.6 - t * 5.4, 9.6 - t * 2.8]; }, robe, { shell: 1.8 });
      tatter(M, 9, 5, 22, 21);
      M.paint((x, y, z) => (y === 15 || y === 16 ? (M.surface(x, y, z) ? C.trim[(x + z) % 5 === 0 ? 3 : 2] : undefined) : undefined));
      P.add(M);
      P.loft(21, 27, (y) => [6.8 + (y - 21) * 0.1, 6.2], (x, y) => (y === 26 ? C.trim[3] : C.trim[1]), { shell: 1.2 });
    }, { glowMat: c.runeMat });

    // hood: deep and dark, a magical visage within; its tall point flops back on a spring
    c.part(R.head, (P) => {
      P.ell(0, 9, -1, 8.6, 9.8, 9.4, robe);
      P.loft(-3, 3, (y) => [8.6 + (3 - y) * 0.7, 8 + (3 - y) * 0.6, 0, -1], robe);
      const open = (x, y, z) => z > 1 && Math.abs(x + 0.5) < 5.6 - Math.max(0, y - 11) * 0.7 && y > 1.5 && y < 15;
      P.carve(open);
      P.paint((x, y, z) => {
        if (!(open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1))) return undefined;
        return P.has(x, y, z + 1) || z <= 4 ? C.void : C.trim[(y & 3) === 0 ? 3 : 2];
      });
    });
    // the face: no flesh, only eyes of arcane light that blink and change with his mood, a mark
    // on the brow, a line of light for a smile, and star motes drifting in the dark
    c.eyeMat = voxGlow();
    const face = c.joint(R.head, 0, 0, 0);
    const EYES = {
      neutral: ['....', '.oo.', 'oiwo', '.oo.'], wide: ['.oo.', 'oiwo', 'oiio', '.oo.'], happy: ['....', '.oo.', 'o..o', '....'],
      narrow: ['....', '....', 'oiwo', '....'], angry: ['o...', '.oo.', '.iwo', '....'], sad: ['....', '....', '.oo.', 'oiio'],
      smug: ['....', 'oooo', 'oiwo', '....'], hurt: ['o...', '.oo.', '.oo.', 'o...'], blink: ['....', '....', 'oooo', '....'],
    };
    c.faceParts = {};
    for (const [key, rows] of Object.entries(EYES)) {
      c.faceParts[key] = c.part(face, (P) => {
        rows.forEach((r, row) => { for (let i = 0; i < 4; i++) {
          const ch = r[i];
          if (ch === '.') continue;
          const col = G(ch === 'o' ? C.eye[0] : ch === 'i' ? C.eye[1] : C.eye[2]);
          P.set(-5 + i, 10 - row, 5, col); P.set(4 - i, 10 - row, 5, col);
        } });
      }, { glowMat: c.eyeMat, glow: 2.2 });
      c.faceParts[key].visible = key === 'neutral';
    }
    c.smile = c.part(face, (P) => { for (const [x, y] of [[-3, 5], [-2, 4], [-1, 4], [0, 4], [1, 4], [2, 5]]) P.set(x, y, 5, G(C.eye[0])); }, { glowMat: c.eyeMat, glow: 1.8 });
    c.smile.visible = false;
    c.part(face, (P) => { for (const [x, y] of [[-1, 14], [0, 14], [-2, 13], [1, 13], [-1, 12], [0, 12]]) P.set(x, y, 4, G(C.eye[3])); }, { glowMat: c.runeMat, glow: 1.6 });
    // star motes and a faint constellation strung between them
    const moteGeo = new THREE.BoxGeometry(VOX_PARTY * 0.55, VOX_PARTY * 0.55, VOX_PARTY * 0.55);
    const motes = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(moteGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 3 ? '#9adcff' : '#d8b4ff').multiplyScalar(1.6), toneMapped: false, fog: false }));
      m.castShadow = false;
      face.add(m);
      motes.push({ m, x: (hash(i, 1, 71) - 0.5) * 8.5 - 0.5, y: 3.5 + hash(i, 2, 71) * 9.5, z: 2.5 + hash(i, 3, 71) * 2, p: hash(i, 4, 71) * TAU });
    }
    const LINKS = [[0, 2], [2, 4], [4, 1], [1, 5], [5, 3], [3, 6]];
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(LINKS.length * 6), 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: new THREE.Color('#8a7aff').multiplyScalar(0.8), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    lines.frustumCulled = false;
    face.add(lines);
    const SHAPE = { neutral: 'neutral', happy: 'happy', angry: 'angry', surprised: 'wide', sad: 'sad', smug: 'smug', determined: 'narrow', hurt: 'hurt', sleepy: 'blink' };
    c.faceShape = 'neutral'; c.blinkT = 2;
    c.updateFace = (dt, fl) => {
      const t = c.time;
      c.blinkT -= dt;
      if (c.blinkT < -0.12) c.blinkT = 2.2 + hash(Math.floor(t * 10), 9) * 3;
      const shape = fl > 0.65 ? 'wide' : c.blinkT < 0 ? 'blink' : c.faceShape;
      for (const key in c.faceParts) c.faceParts[key].visible = key === shape;
      c.smile.visible = c.faceShape === 'happy' || (fl > 0.65 && c.faceShape !== 'hurt');
      c.eyeMat.color.setScalar((c.faceShape === 'blink' ? 0.45 : 1) + fl * 1.5 + Math.sin(t * 2.3) * 0.06);
      const pos = lineGeo.attributes.position.array;
      motes.forEach((o, i) => {
        o.m.position.set((o.x + Math.sin(t * 0.4 + o.p) * 0.8) * VOX_PARTY, (o.y + Math.sin(t * 0.3 + o.p * 2) * 0.7) * VOX_PARTY, (o.z + Math.sin(t * 0.5 + o.p) * 0.4) * VOX_PARTY);
        o.m.scale.setScalar(0.6 + Math.max(0, Math.sin(t * 2.1 + o.p * 3)) * 0.8 + fl * 0.6);
      });
      LINKS.forEach(([a, b], i) => { motes[a].m.position.toArray(pos, i * 6); motes[b].m.position.toArray(pos, i * 6 + 3); });
      lineGeo.attributes.position.needsUpdate = true;
      lines.material.opacity = 0.25 + fl * 0.5 + Math.sin(t * 0.9) * 0.08;
    };
    const tip = c.joint(R.head, ...c.v(0, 16, -3));
    c.part(tip, (P) => {
      P.path([[0, 0, 0, 6.2], [0, 6, -2.5, 4.3], [0, 11, -6, 2.5], [0, 15, -10.5, 1.2]], (x, y, z, t) => (t > 0.5 && t < 0.56 ? C.trim[2] : robe(x, y, z)));
      P.ell(0, 15.5, -11.6, 1.7, 1.7, 1.7, C.trim[2]);
      P.cap([0, 14.5, -12], [0, 10.5, -13.5], 0.9, 0.6, C.trim[3]);
    });
    c.addSpring(tip, 'x', { base: 0, src: 'vz', gain: 0.5, k: 38, d: 4, wobble: 0.05, extra: (ch) => -ch.poseVel.lean * 0.05 });
    c.addSpring(tip, 'z', { base: 0, src: 'vx', gain: -0.3, k: 38, d: 4, wobble: 0.03, rate: 1.6 });
    c.headTop = 18 * 0.02;

    // bell sleeves with teal lining and gold cuffs, tattered at the ends
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => {
        P.ell(0, -1, 0, 5, 5, 5, robe);
        P.cap([0, 0, 0], [0, -14, 0], 4.4, 4.7, robe);
        band(P, -3, -2, C.trim[2]);
      });
      c.part(R['el' + side], (P) => {
        P.loft(-16, 1, (y) => { const t = -y / 16; return [4.6 + t * t * 4.8, 4.6 + t * t * 4.8]; }, robe, { shell: 1.4 });
        tatter(P, -16, 3, 14, 31 + sx);
        P.paint((x, y, z) => (y < -6 && Math.hypot(x + 0.5, z + 0.5) < 4.6 + ((-y / 16) ** 2) * 4.8 - 0.9 ? C.lining[2] : y >= -12 && y < -10 && P.surface(x, y, z) ? C.trim[2] : undefined));
      });
      c.part(R['hand' + side], (P) => {
        P.ell(0, -3, 0.5, 3.2, 3.8, 2.9, C.glove[2]);
        for (let i = 0; i < 4; i++) P.cap([-1.5 + i * 1.1, -5, 1.5], [-1.6 + i * 1.2, -8, 2.2], 0.8, 0.7, C.glove[i & 1 ? 1 : 2]);
        P.cap([-sx * 2.5, -2.5, 2], [-sx * 2.8, -5, 3.5], 1.1, 0.9, C.glove[2]);
      });
      c.part(R['hip' + side], (P) => P.cap([0, 1, 0], [0, -16, 0], 3.6, 3.2, C.inner[1]));
      c.part(R['kn' + side], (P) => P.cap([0, 0, 0], [0, -16, 0], 3.2, 2.9, C.inner[1]));
      c.part(R['ft' + side], (P) => {
        P.ell(0, -1.2, 2, 3.4, 2.2, 5.4, robe);
        P.carve((x, y) => y < -3);
        P.cap([0, -1.5, 6], [0, 1.5, 8.5], 1.2, 0.5, C.trim[2]);
      });
    }

    // rune stones orbiting at the waist
    const orbit = c.joint(R.hips, 0, 0, 0);
    c.runes = [];
    for (let i = 0; i < 4; i++) {
      c.runes.push(c.part(orbit, (P) => {
        P.ell(0, 0, 0, 3.4, 4, 2.4, (x, y, z) => C.stone[hash(x >> 1, y >> 1, z, i) > 0.7 ? 1 : (y > 1 ? 3 : 2)]);
        P.carve((x, y, z) => hash(x, y, z, 50 + i) > 0.9 && !P.has(x, y + 1, z));
        for (const zz of [3, -4]) for (const [gx, gy] of glyph(i * 2 + (zz < 0 ? 1 : 0))) { P.set(gx, gy, zz, G(C.rune)); P.set(gx, gy, zz > 0 ? zz - 1 : zz + 1, G(C.rune)); }
      }, { glowMat: c.runeMat }));
    }
    // the crystal staff, slung across the back
    const sj = c.joint(R.spine, ...c.v(-3, 4, -9.5));
    sj.rotation.set(0.1, 0, -0.42);
    c.part(sj, (P) => {
      P.path([[0, -40, 0, 1.7], [0.8, -20, 0.4, 1.8], [-0.5, 0, -0.3, 1.8], [0.6, 18, 0.2, 1.9], [0, 28, 0, 2.2]], wood(C.wood, 6));
      for (const y of [-6, 20]) band(P, y, y + 2, C.trim[2]);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        P.path([[ca * 1.5, 27, sa * 1.5, 1.2], [ca * 4.5, 32, sa * 4.5, 1], [ca * 4, 38, sa * 4, 0.8], [ca * 1.5, 42, sa * 1.5, 0.5]], wood(C.wood, 7));
      }
      P.loft(29, 47, (y) => { const r = y < 41 ? 3.3 : 3.3 * (1 - (y - 41) / 6); return r < 0.4 ? null : [r, r]; }, (x, y, z, { u }) => {
        const f = Math.floor((u / TAU + 1) * 6) % 6;
        return f === 1 || f === 4 ? G(C.crystal[3]) : f % 2 ? C.crystal[2] : C.crystal[1];
      });
      for (const [a, h] of [[0.8, 7], [2.9, 5], [4.6, 6]]) P.cap([Math.sin(a) * 2, 31, Math.cos(a) * 2], [Math.sin(a) * 5, 31 + h, Math.cos(a) * 5], 1.4, 0.3, (x, y, z, t) => (t > 0.6 ? G(C.crystal[3]) : C.crystal[2]));
    }, { glowMat: c.runeMat });
    c.backItem = sj;
    // a book for reading
    const book = c.joint(R.handL, ...c.v(-2, -5, 4));
    book.rotation.set(-0.6, 0.3, 0);
    c.part(book, (P) => {
      P.box(-6, -1, -4, 6, 1, 5, (x, y) => (y > 0 ? C.paper[2] : C.paper[1]));
      P.box(-6.5, -2, -4.5, 6.5, -1, 5.5, C.sash[2]);
      for (const [x, z] of [[-7, -5], [6, -5], [-7, 5], [6, 5]]) P.set(x, -2, z, C.trim[2]);
    });
    book.visible = false;
    c.props.book = book;

    const k = new Kindle();
    c.group.add(k.group);
    c.kindle = k;
    c.kindleHome = new THREE.Vector3(0.36, 1.3, 0.12);
    k.group.position.copy(c.kindleHome);
    const kp = new THREE.Vector3();
    c.extraUpdate = (dt) => {
      const t = c.time, fl = clamp(c.pose.flare, 0, 1.5);
      // rune stones orbit the waist, spreading and spinning faster when the power flares
      c.runes.forEach((g, i) => {
        const a = t * (0.7 + fl * 2.4) + (i * TAU) / 4, r = 0.4 + fl * 0.2;
        g.position.set(Math.cos(a) * r, 0.3 + Math.sin(t * 1.3 + i * 1.7) * 0.05 + (i & 1) * 0.12 + fl * 0.1, Math.sin(a) * r * 0.85);
        g.rotation.set(Math.sin(t + i) * 0.3, -a + Math.PI / 2, Math.sin(t * 0.7 + i) * 0.25);
      });
      c.runeMat.color.setScalar(0.65 + fl * 1.2 + Math.sin(t * 3) * 0.08);
      c.updateFace(dt, fl);
      // Kindle circles the hood unless sent somewhere
      if (c.kindleTarget) kp.copy(c.kindleTarget);
      else {
        const a = t * 0.9, hy = c.dims.hipH + c.pose.dy + 0.02 + c.dims.torsoH + 0.22;
        kp.set(Math.cos(a) * 0.42, hy + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.36);
      }
      k.group.position.lerp(kp, 1 - Math.exp(-5 * dt));
    };
    c.onExpression = (e) => { c.faceShape = SHAPE[e] || 'neutral'; if (e === 'surprised' || e === 'happy') k.excite = 1; };
  },

  // ================================================================ DURGAN, the gnome warrior
  durgan(c) {
    const C = PAL.durgan;
    c.rigFrom({ footH: 5, legLo: 7, legUp: 8, torsoH: 20, neckH: 1, shX: 16, shY: 15, armUp: 11, armLo: 10, hipX: 6, grip: 5 });
    const R = c.rig;
    c.oreMat = voxGlow();
    const ore = (x, y, z) => G(C.ore[1 + Math.floor(hash(x, y, z, 91) * 3)]);
    /** A glowing ore crystal cluster jutting from a surface. */
    const crystal = (P, x, y, z, dx, dy, dz, n = 3, s = 1) => {
      for (let i = 0; i < n; i++) {
        const j = (k) => (hash(i, k, s) - 0.5) * 1.6;
        P.cap([x, y, z], [x + dx * 2.6 + j(1), y + dy * 2.6 + j(2), z + dz * 2.6 + j(3)], 1.1, 0.35, (xx, yy, zz, t) => G(C.ore[t > 0.6 ? 3 : 2]));
      }
    };

    // pelvis: a navy tunic skirt, a broad belt with an ore-set buckle
    c.part(R.hips, (P) => {
      P.loft(-9, 2, (y) => [13.2 + (-y) * 0.12, 11 + (-y) * 0.1], cloth(C.tunic, 9));
      P.loft(-1, 3, () => [13.8, 11.6], (x, y) => (y === -1 || y === 2 ? C.leather[3] : C.leather[2]));
      P.ell(0, 0.5, 11.6, 3.6, 3.2, 1.6, (x, y) => (Math.hypot(x + 0.5, y - 0.5) < 2 ? C.bronze[1] : C.bronze[2]));
      crystal(P, 0, 0.5, 12.5, 0, 0.3, 1, 2, 3);
      ring(P, 0, 12, C.bronze[3], 0.26);
    }, { glowMat: c.oreMat });
    // studded leather strips, front and back, swinging
    for (const [z, rot, ph] of [[11.6, 0, 0], [-11.6, Math.PI, 1]]) {
      const j = c.joint(R.hips, ...c.v(0, -1, z));
      j.rotation.y = rot;
      c.part(j, (P) => {
        for (let i = -2; i <= 2; i++) for (let y = -10; y <= 0; y++) for (let x = i * 4 - 1; x <= i * 4 + 1; x++) P.set(x, y, 0, y === -10 || x === i * 4 + 1 ? C.leather[1] : C.leather[2]);
        for (let i = -2; i <= 2; i++) for (const y of [-3, -7]) P.set(i * 4, y, 1, C.bronze[3]);
      });
      c.addSpring(j, 'x', { base: 0, src: 'vz', gain: rot ? -0.25 : 0.25, k: 60, d: 6, wobble: 0.02, phase: ph, min: -0.9, max: 0.3, extra: (ch) => -Math.max(0, ch.pose.lHip, ch.pose.rHip) * 0.5 });
    }

    // torso: a barrel in mail under a crossed harness, an ore boss, a fur mantle
    c.part(R.spine, (P) => {
      const tr = (y) => { const t = y / 20; return [12.6 + Math.sin(Math.PI * clamp(t * 0.95, 0, 1)) * 2.6 - Math.max(0, t - 0.8) * 22, Math.max(4, 10.4 + Math.sin(Math.PI * clamp(t, 0, 1)) * 1.8 - Math.max(0, t - 0.85) * 16)]; };
      P.loft(-1, 22, (y) => { const [rx, rz] = tr(y); return rx < 4 ? null : [rx, rz]; }, mail(C.mail));
      for (const sx of [-1, 1]) {
        P.path([[sx * 11, 19, 6, 1.6], [0, 9, 13, 1.6], [-sx * 12, 0, 8, 1.6]], (x, y) => (y % 4 === 0 ? C.leather[3] : C.leather[2]));
        P.path([[sx * 11, 19, -6, 1.6], [0, 9, -12.6, 1.6], [-sx * 12, 0, -8, 1.6]], C.leather[2]);
      }
      P.ell(0, 9, 13, 3.8, 3.8, 2, (x, y) => (Math.hypot(x + 0.5, y - 9) > 2.8 ? C.bronze[3] : C.bronze[2]));
      crystal(P, 0, 9, 14.5, 0, 0.2, 1, 3, 5);
      for (let a = 0; a < 30; a++) {
        const t = (a / 30) * TAU, r = 11.5 + hash(a, 1, 88) * 1.6;
        P.ell(Math.sin(t) * r, 18.5 + hash(a, 2, 88) * 1.8, Math.cos(t) * (r - 2.2), 3, 2.8, 3, fur(C.fur, 89));
      }
    }, { glowMat: c.oreMat });

    // helm: a dome with a closed visor, a slit split by a bronze nose guard, an ore-studded brow
    c.part(R.head, (P) => {
      const st = metal(C.steel, 91);
      P.ell(0, 9.5, 0, 9.6, 9.8, 9.6, st);
      P.carve((x, y) => y < 1);
      P.loft(1, 4, () => [9.4, 9.4], st);
      P.paint((x, y, z) => (y >= 9 && y <= 11 && P.surface(x, y, z) ? ((x + z + y) % 4 === 0 ? C.bronze[1] : C.bronze[2]) : undefined));
      for (let z = -9; z <= 8; z++) { const p = surf(P, -1, 0, z, 1, 1); if (p) for (const x of [-1, 0]) P.set(x, p[1] + 1, z, C.bronze[z % 3 ? 2 : 3]); }
      // visor
      for (let y = 1; y <= 9; y++) for (let x = -8; x < 8; x++) {
        if (Math.abs(x + 0.5) > 7.5 - (y < 3 ? 3 - y : 0)) continue;
        const p = surf(P, x, y, 0, 2, 1);
        if (p) P.set(x, y, p[2] + 1, Math.abs(x + 0.5) > 6.6 || y === 1 ? C.steel[3] : st(x, y, 0));
      }
      for (let x = -7; x < 7; x++) {
        if (x === -1 || x === 0) continue;
        for (const y of [6, 7]) { const p = surf(P, x, y, 0, 2, 1); if (!p) continue; P.set(x, y, p[2], null); P.set(x, y, p[2] - 1, null); P.set(x, y, p[2] - 2, C.slit); }
      }
      for (let y = 2; y <= 10; y++) for (const x of [-1, 0]) stud(P, x, y, 0, 2, 1, y === 10 ? C.bronze[3] : C.bronze[2], y > 4 ? 2 : 1);
      for (const [x, y] of [[-7, 2], [6, 2], [-7, 8], [6, 8], [-4, 2], [3, 2]]) stud(P, x, y, 0, 2, 1, C.bronze[3]);
      for (const x of [-6, 5]) stud(P, x, 10, 0, 2, 1, C.ore[2]);
      // horns sweeping out and up from bronze bosses
      for (const sx of [-1, 1]) {
        P.ell(sx * 9, 9, 0, 2.6, 2.8, 2.8, C.bronze[2]);
        P.path([[sx * 9.5, 9.5, 0, 3.4], [sx * 14, 10.5, -1, 3], [sx * 18, 14, -2, 2.3], [sx * 19, 20, -2, 1.5], [sx * 17, 24.5, -1, 0.6]], (x, y, z, t) => C.horn[Math.min(3, Math.floor(t * 3) + (Math.floor(t * 14) % 2))]);
      }
      // the beard spilling out beneath
      P.ell(0, -1, 7, 8.4, 5, 4.2, fur(C.beard, 99));
      P.ell(0, -5, 7.5, 6.2, 4, 3.2, fur(C.beard, 100));
      for (const sx of [-1, 1]) P.ell(sx * 6.5, 2.5, 7, 2.4, 2.8, 2.6, fur(C.beard, 101));
    }, { glowMat: c.oreMat });
    for (const sx of [-1, 1]) {
      c.chain(R.head, c.v(sx * 3.5 - (sx > 0 ? 1 : 0), -7, 8), 2, 5, (P, i) => {
        P.cap([0, 0, 0], [0, -5.5, 0], 1.8, 1.5, (x, y) => C.beard[(y + 9) % 2 ? 1 : 3]);
        if (i === 1) P.ell(0, -5.5, 0, 2.2, 1.3, 2.2, C.bronze[2]);
      }, { gain: 0.25, k: 70, wobble: 0.02, twist: false });
    }
    c.headTop = 20 * 0.02;

    // arms: massive layered pauldrons, mail, bracers, huge gloves
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => {
        P.cap([0, -1, 0], [0, -11, 0], 5.2, 4.8, mail(C.mail));
        const L = new VPart();
        L.ell(0, 1, 0, 8.8, 6.8, 8.2, metal(C.steel, 92));
        L.carve((x, y) => y < -1);
        for (const [cy, ry, rr] of [[-2.5, 3.6, 8.4], [-5.5, 3.4, 7.9]]) {
          const S = new VPart();
          S.ell(0, cy, 0, rr, ry, rr - 0.5, metal(C.steel, 93));
          S.carve((x, y, z) => y < cy - 1.6 || y > cy + 1.4 || Math.hypot(x + 0.5, z + 0.5) < rr - 2.2);
          S.paint((x, y) => (y === Math.ceil(cy - 1.6) ? C.bronze[2] : undefined));
          L.add(S);
        }
        L.paint((x, y) => (y === -1 ? C.bronze[2] : undefined));
        P.add(L);
        ring(P, 2, 10, C.bronze[3], 0.3);
        stud(P, sx * 3, 7, 0, 1, 1, C.ore[2]);
        crystal(P, sx * 2, 7, 0, 0, 1, 0, 3, 7 + sx);
      }, { glowMat: c.oreMat });
      c.part(R['el' + side], (P) => {
        P.cap([0, 0, 0], [0, -10, 0], 5, 5.4, hide(C.leather, 94));
        band(P, -2, 0, C.bronze[2]); band(P, -10, -8, C.bronze[2]);
        ring(P, -5, 8, C.bronze[3], 0.2);
      });
      c.part(R['hand' + side], (P) => {
        P.ell(0, -4.5, 0.6, 5.8, 5.8, 5.4, hide(C.leather, 95));
        skin(P, (x, y, z) => y === -7 && z > 2, C.leather[3]);
        P.cap([-sx * 3.5, -2.5, 3.5], [-sx * 3, -6, 5.5], 2.2, 1.9, hide(C.leather, 95));
      });
      c.part(R['hip' + side], (P) => P.cap([0, 1, 0], [0, -8, 0], 6.4, 5.8, cloth(C.tunic, 5)));
      c.part(R['kn' + side], (P) => {
        P.cap([0, 0, 0], [0, -7, 0], 5.8, 5.4, metal(C.steel, 96));
        P.ell(0, 0, 3.6, 3.6, 3.2, 2.6, C.steel[3]);
        band(P, -7, -6, C.bronze[2]);
      });
      c.part(R['ft' + side], (P) => {
        P.ell(0, -1.4, 3, 6.4, 3.9, 8.8, hide(C.leather, 97));
        P.carve((x, y) => y < -5);
        P.paint((x, y, z) => (y <= -4 ? C.leather[0] : z > 6.5 && y > -4 ? metal(C.steel, 98)(x, y, z) : undefined));
        P.loft(-1, 3, () => [6.6, 6.6], fur(C.fur, 99), { shell: 1.6 });
      });
    }

    // the tower shield: a minecart door, riveted, rusted, a faded number painted on
    const shj = c.joint(R.elL, 0, 0, 0);
    c.part(shj, (P) => {
      const X0 = -10, X1 = 15, Y0 = -26, Y1 = 8, Z = 13;
      const seven = (x, y) => { const gx = x - 1, gy = y + 1; return (gy >= 4 && gy <= 5 && gx >= -3 && gx <= 5) || (gx >= 3 - Math.floor((4 - gy) * 0.45) && gx <= 4 - Math.floor((4 - gy) * 0.45) && gy >= -8 && gy < 4); };
      for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++) {
        const fr = x <= X0 + 1 || x >= X1 - 1 || y <= Y0 + 1 || y >= Y1 - 1, rib = y === -18 || y === -10;
        const rust = hash(x >> 1, y >> 2, 3) > 0.72 || (hash(x, 1, 5) > 0.82 && hash(x, y >> 3, 6) > 0.4);
        P.set(x, y, Z, rust ? C.rust[hash(x, y, 7) > 0.5 ? 2 : 1] : C.cart[2]);
        P.set(x, y, Z + 1, fr || rib ? C.cart[fr ? 3 : 1] : seven(x, y) && hash(x, y, 9) > 0.18 ? C.paint : rust ? C.rust[hash(x, y, 8) > 0.6 ? 3 : 2] : C.cart[hash(x >> 2, y >> 2, 4) > 0.8 ? 1 : 2]);
        if (fr || rib) P.set(x, y, Z + 2, (fr && (x + y) % 4 === 0) ? C.bronze[3] : C.cart[fr ? 2 : 1]);
      }
      // hinges on the back edge, a latch on the front edge
      for (const y of [Y0 + 4, Y1 - 5]) P.box(X0 - 2, y, Z, X0, y + 3, Z + 2, C.cart[1]);
      P.box(X1 - 1, -10, Z + 3, X1 + 1, -6, Z + 4, C.bronze[2]);
      // the strap and bar the gnome holds it by
      P.cap([2, -5, 4], [2, -5, Z], 1.3, 1.3, C.cart[2]);
      P.cap([2, -1, 4], [2, -1, Z], 0.8, 0.8, C.leather[2]);
    });
    c.shield = shj;
    c.shieldArm = { lSh: 0.3, lEl: 0.2, lAb: -0.22, lTw: 0 }; // swings are one-handed; the shield stays set

    // the ore-studded maul across the back
    const mj = c.joint(R.spine, ...c.v(2, 10, -12));
    mj.rotation.set(0.1, 0, -0.6);
    c.part(mj, (P) => {
      P.cap([0, -26, 0], [0, 17, 0], 2.5, 2.5, wood(C.wood));
      for (let y = -24; y < -12; y += 2) band(P, y, y + 1, C.leather[3]);
      P.ell(0, -27, 0, 3.2, 2.4, 3.2, C.cart[2]);
      for (let x = -9; x < 9; x++) for (let y = 16; y < 31; y++) for (let z = -7; z < 7; z++) {
        const e = (Math.abs(x + 0.5) > 7.5) + (y < 17 || y > 29) + (Math.abs(z + 0.5) > 5.5);
        if (e >= 2 || hash(x, y, z, 20) > 0.94 && e) continue;
        const ax = Math.abs(x + 0.5);
        P.set(x, y, z, ax > 4 && ax < 6 ? C.cart[(y & 1) ? 2 : 3] : C.stone[hash(x >> 1, y >> 1, z >> 1, 21) > 0.7 ? 1 : (y > 26 ? 3 : 2)]);
      }
      for (const [x, y, z, dx, dy, dz] of [[-2, 23, 7, 0, 0.3, 1], [2, 19, -7, 0.2, 0, -1], [-9, 24, 0, -1, 0.4, 0], [9, 21, 1, 1, 0.2, 0], [0, 31, -2, 0.2, 1, 0], [-5, 27, 7, -0.3, 0.4, 1]]) crystal(P, x, y, z, dx, dy, dz, 3, x * 7 + y);
    }, { glowMat: c.oreMat });
    c.backItem = mj;

    c.extraUpdate = () => {
      const t = c.time;
      c.oreMat.color.setScalar(0.8 + Math.sin(t * 2.4) * 0.12 + c.pose.flare * 0.8);
      // a heavy head that settles a beat after each step
      c.rig.head.position.y = c.dims.neckH + Math.max(0, -c.pose.squash) * 0.004;
    };
  },

  // ================================================================ CLOVER, the rabbit rogue
  clover(c) {
    const C = PAL.clover;
    c.rigFrom({ footH: 5, legLo: 14, legUp: 13, torsoH: 16, neckH: 2, shX: 8, shY: 13.5, armUp: 12, armLo: 11, hipX: 3.8, grip: 3 });
    const R = c.rig;
    c.charmMat = voxGlow();

    // pelvis: shorts, a coin belt hung with gold, a fluffy tail
    c.part(R.hips, (P) => {
      P.loft(-6, 2, (y) => [8.2, 6.4], cloth(C.shorts, 6));
      P.loft(-1, 2, () => [8.9, 7.1], (x, y) => (y === 1 ? C.vest[3] : C.vest[2]));
      buckle(P, -2, -1, 4, 3, 7, C.gold[2], C.vest[1]);
      for (let i = 0; i < 9; i++) {
        const a = -1.9 + i * 0.47, cx = Math.sin(a) * 9.4, cz = Math.cos(a) * 7.6;
        if (Math.abs(a) < 0.3) continue;
        P.ell(cx, -3, cz, 1.6, 1.6, 1.1, (x, y, z) => (x === Math.floor(cx) && y === -3 ? G(C.gold[3]) : C.gold[2]));
        P.set(Math.floor(cx), -1, Math.floor(cz), C.gold[1]);
      }
    }, { glowMat: c.charmMat, glow: 1.2 });
    const tail = c.joint(R.hips, ...c.v(0, -2, -7));
    c.part(tail, (P) => P.ell(0, 0, -1.5, 3.4, 3.4, 3, fur(C.fur, 7)));
    c.addSpring(tail, 'x', { base: 0, src: 'vy', gain: 0.4, k: 60, d: 4, wobble: 0.06, rate: 3.1 });
    c.addSpring(tail, 'z', { base: 0, src: 'vx', gain: 0.4, k: 60, d: 4, wobble: 0.04, rate: 2.2 });
    // lucky charms on a short cord: a horseshoe, a four-leaf clover, a little bell
    const ch = c.joint(R.hips, ...c.v(8, -2, 3));
    c.part(ch, (P) => {
      P.cap([0, 0, 0], [0.5, -4, 0.5], 0.5, 0.5, C.vest[1]);
      for (const [x, y] of [[-2, -5], [-2, -6], [-2, -7], [-1, -8], [0, -8], [1, -8], [2, -7], [2, -6], [2, -5]]) P.set(x + 0.5, y, 0.5, C.gold[y === -8 ? 3 : 2]);
      P.cap([1, -1, 1], [3, -4, 2.5], 0.4, 0.4, C.vest[1]);
      for (const [x, y] of [[2, -5], [4, -5], [3, -4], [3, -6]]) P.ell(x + 0.5, y, 2.5, 1, 1, 0.6, C.clover[y === -4 ? 3 : 2]);
      P.cap([-1, -1, -0.5], [-3, -3, -1], 0.4, 0.4, C.vest[1]);
      P.ell(-3, -4.5, -1, 1.4, 1.5, 1.4, (x, y) => (y === -6 ? G(C.gold[3]) : C.gold[2]));
    }, { glowMat: c.charmMat, glow: 1.2 });
    c.addSpring(ch, 'x', { base: 0, src: 'vz', gain: 0.6, k: 45, d: 3.5, wobble: 0.06 });
    c.addSpring(ch, 'z', { base: 0.1, src: 'vx', gain: -0.6, k: 45, d: 3.5, wobble: 0.05, rate: 2.9 });

    // torso: a cream shirt, a quilted leather vest with gold buttons, a bandolier of throwing knives
    c.part(R.spine, (P) => {
      const tr = (y) => { const t = y / 16; return [7.6 + sm(t / 0.7) * 1.6 - Math.max(0, t - 0.82) * 14, Math.max(3, 5.8 + Math.sin(Math.PI * clamp(t, 0, 1)) * 0.9 - Math.max(0, t - 0.85) * 7)]; };
      P.loft(-1, 17, (y) => { const [rx, rz] = tr(y); return rx < 3 ? null : [rx, rz]; }, cloth(C.shirt, 7));
      P.loft(0, 14, (y) => { const [rx, rz] = tr(y); return [rx + 1, rz + 1]; }, (x, y, z, { u }) => {
        if (Math.abs(u) < 0.36) return undefined;
        if (Math.abs(u) < 0.5) return C.vest[3];
        return (x + y + 40) % 5 === 0 || (x - y + 40) % 5 === 0 ? C.vest[1] : C.vest[2];
      });
      for (const y of [3, 6, 9]) for (const sx of [-1, 1]) stud(P, sx * 3 - (sx < 0 ? 1 : 0), y, 0, 2, 1, C.gold[2]);
      P.path([[-7.5, 15, 3.6, 1.2], [0, 8, 7.8, 1.2], [8, 0, 5, 1.2]], (x, y) => (y % 3 === 0 ? C.vest[0] : C.vest[1]));
      for (let i = 0; i < 4; i++) { const x = -4.5 + i * 2.6, y = 12.3 - i * 2.4; P.cap([x, y, 8.6], [x + 0.6, y + 3.5, 9.2], 0.6, 0.4, C.silver[i & 1 ? 2 : 3]); }
      // scarf wrapped at the throat
      P.loft(13, 19, (y) => [6.8, 6.2], cloth(C.scarf, 8), { shell: 2.4 });
    });
    // the long scarf, trailing behind
    c.chain(R.spine, c.v(2, 15, -6), 5, 6, (P, i) => P.box(-2.5, -6, -1, 2.5, 0, 1, (x, y) => (i === 4 && y < -3 ? (x & 1 ? C.scarf[3] : C.lining[2]) : (y + 60) % 6 === 0 ? C.scarf[1] : C.scarf[2])), { rot: [0.75, 0, 0.25], gain: 0.8, k: 42, d: 5, wobble: 0.07, phase: 0.4 });

    // hood: an opening framed in teal, and in it a little porcelain rabbit mask tied on with a ribbon
    const hoodC = cloth(C.hood, 7);
    c.part(R.head, (P) => {
      P.ell(0, 7.5, 0, 7.6, 8, 7.8, hoodC);
      P.loft(-2, 3, (y) => [7 + (3 - y) * 0.4, 6.6 + (3 - y) * 0.3], hoodC);
      const open = (x, y, z) => z > 1 && Math.abs(x + 0.5) < 6.2 && y > 0.5 && y < 12.6;
      P.carve(open);
      P.paint((x, y, z) => {
        if (!(open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1))) return undefined;
        return P.has(x, y, z + 1) || z <= 4 ? C.shadow : C.hood[3];
      });
      // the ribbon runs from the mask back under the hood, tied in a bow at the nape
      for (const sx of [-1, 1]) for (let z = 1; z <= 4; z++) P.set(sx < 0 ? -7 : 6, 8, z, C.ribbon[2]);
      for (const sx of [-1, 1]) P.ell(sx * 2.4 - 0.5, 0, -8.6, 2, 1.5, 1, (x, y) => C.ribbon[y > 0 ? 3 : 2]);
      P.ell(-0.5, 0, -9, 1, 1, 1, C.ribbon[1]);
      stitch(P, (x, y) => (x === -1 || x === 0) && y > 12, C.hood[3]);
    });
    c.chain(R.head, c.v(0, -1, -9), 2, 4, (P, i) => { P.box(-2, -4, -0.5, 0, 0, 0.5, C.ribbon[i ? 3 : 2]); P.box(0, -4, -0.5, 2, 0, 0.5, C.ribbon[2]); }, { rot: [0.2, 0, 0], gain: 0.5, k: 50, wobble: 0.05, twist: false });
    // the mask: rounded cheeks, a button nose, painted whiskers, blush, a tiny smile; its painted
    // eyes change with the mood (and the whole mask tilts)
    const MASK = [
      '...swwwws...', '..swwwwwws..', '.swwwwwwwws.', 'seeeewweeees', 'seeeewweeees', 'seeeewweeees',
      'swbbwnnwbbws', 'kwbbwppwbbwk', 'kwwwwmmwwwwk', 'swwwmwwmwwws', '.swwwwwwwws.', '..sswwwwss..',
    ];
    const cell = (x, y) => { const r = MASK[12 - y]; return r ? r[x + 6] || '.' : '.'; };
    const zf = (x, y) => Math.round(8.4 - (x + 0.5) ** 2 / 18 - (y - 7) ** 2 / 40 + (y < 5.5 && Math.abs(x + 0.5) > 2.5 && Math.abs(x + 0.5) < 5.5 ? 0.6 : 0));
    const mj = c.joint(R.head, ...c.v(0, 6, 6));
    const MO = { offset: [0, 6, 6] };
    c.part(mj, (P) => {
      for (let y = 1; y <= 12; y++) for (let x = -6; x < 6; x++) {
        const ch = cell(x, y);
        if (ch === '.') continue;
        const z = zf(x, y), base = C.porcelain[y > 9 && Math.abs(x + 0.5) < 3 ? 3 : 2];
        P.set(x, y, z - 1, C.porcelain[1]);
        if (ch === 'e') continue; // the painted eyes are their own pieces
        P.set(x, y, z, ch === 's' ? C.porcelain[1] : ch === 'k' || ch === 'm' ? C.rose : ch === 'b' ? C.blush : ch === 'p' ? C.nose[0] : ch === 'n' ? C.nose[1] : base);
        if (ch === 'p' || ch === 'n') P.set(x, y, z + 1, ch === 'n' ? C.nose[1] : C.nose[0]); // a little button nose
      }
    }, MO);
    // painted eyes, outer edge first: little shiny dots, ^ ^ when happy, O O surprised, > < hurt
    const EYES = {
      neutral: ['....', '.##.', '.##.'], happy: ['....', '.##.', '#..#'], surprised: ['.##.', '#..#', '.##.'],
      sad: ['.##.', '#..#', '....'], angry: ['#...', '.##.', '.##.'], sleepy: ['....', '....', '####'],
      determined: ['....', '####', '.##.'], smug: ['....', '####', '....'], hurt: ['#...', '.##.', '#...'],
    };
    c.maskEyes = {};
    for (const [key, rows] of Object.entries(EYES)) {
      c.maskEyes[key] = c.part(mj, (P) => {
        rows.forEach((r, row) => { for (let i = 0; i < 4; i++) {
          const ch = r[i], y = 9 - row, col = ch === '#' ? C.paint : C.porcelain[2];
          P.set(-5 + i, y, zf(-5 + i, y), col); P.set(4 - i, y, zf(4 - i, y), col);
          // a highlight catches the top-left of each round painted eye
          if (key === 'neutral' && row === 1 && i === 1) { P.set(-4, y, zf(-4, y), C.porcelain[3]); P.set(2, y, zf(2, y), C.porcelain[3]); }
        } });
      }, MO);
      c.maskEyes[key].visible = key === 'neutral';
    }
    const TILT = { happy: [0.16, -0.06], surprised: [0, -0.12], sad: [-0.1, 0.14], angry: [0, 0.08], smug: [0.2, 0], hurt: [-0.18, 0.1], sleepy: [0.22, 0.12] };
    c.maskTilt = [0, 0];
    c.addSpring(mj, 'z', { base: 0, src: 'vx', gain: -0.06, k: 70, d: 6, wobble: 0.015, extra: (h) => h.maskTilt[0] });
    c.addSpring(mj, 'x', { base: 0, src: 'vy', gain: 0.05, k: 70, d: 6, extra: (h) => h.maskTilt[1] });
    c.onExpression = (e) => {
      const key = c.maskEyes[e] ? e : 'neutral';
      for (const k in c.maskEyes) c.maskEyes[k].visible = k === key;
      c.maskTilt = TILT[e] || [0, 0];
    };
    c.headTop = 15 * 0.02;
    // the long ears, through slits in the hood; the right one flops at the tip
    const earC = (x, y, z) => (z >= 0 && Math.abs(x + 0.5) < 1.9 && y > 1 && y < 12 ? C.inner[y > 7 ? 2 : 1] : fur(C.fur, 8)(x, y, z));
    c.ears = [];
    for (const sx of [-1, 1]) {
      const ej = c.joint(R.head, ...c.v(sx * 3.6, 12.5, -1.5));
      const flop = sx < 0;
      ej.rotation.z = -sx * 0.12;
      c.part(ej, (P) => { P.ell(0, 6.2, 0, 3.4, 6.8, 1.8, earC); P.ell(0, 0.5, 0, 2.8, 1.8, 2.2, hoodC); });
      const tj = c.joint(ej, ...c.v(0, 11.5, 0));
      tj.rotation.x = flop ? -1.1 : 0;
      c.part(tj, (P) => P.ell(0, 4, 0, 3.1, 5.2, 1.6, (x, y, z) => earC(x, y + 5, z)));
      c.addSpring(ej, 'x', { base: -0.15, src: 'vy', gain: 0.3, k: 55, d: 5, wobble: 0.03, phase: sx, extra: (h) => -h.pose.ears * 0.3, min: -1, max: 0.8 });
      c.addSpring(ej, 'z', { base: ej.rotation.z, src: 'vx', gain: -0.2, k: 55, d: 5, extra: (h) => -sx * h.pose.ears * 0.12 });
      c.addSpring(tj, 'x', { base: tj.rotation.x, src: 'vy', gain: 0.6, k: 30, d: 3, wobble: 0.06, phase: 2 + sx, extra: (h) => (flop ? -h.pose.ears * 0.5 : -h.pose.ears * 0.2), min: -1.4, max: 1.2 });
      c.ears.push(ej);
    }

    // slim arms with bracers and furry hands
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => { P.ell(0, -1, 0, 3.8, 3.8, 3.8, cloth(C.shirt, 5)); P.cap([0, 0, 0], [0, -12, 0], 3.3, 3, cloth(C.shirt, 5)); });
      c.part(R['el' + side], (P) => {
        P.cap([0, 0, 0], [0, -11, 0], 3, 2.8, cloth(C.shirt, 5));
        P.cap([0, -4, 0], [0, -11.5, 0], 3.4, 3.2, hide(C.vest, 41), false, { flat: true });
        band(P, -6, -5, C.gold[1]); band(P, -10, -9, C.gold[1]);
      });
      c.part(R['hand' + side], (P) => {
        P.ell(0, -2.8, 0.4, 3.2, 3.6, 3, fur(C.fur, 42));
        P.cap([-sx * 2, -2, 2], [-sx * 2.2, -4.5, 3.4], 1.1, 0.9, fur(C.fur, 42));
      });
      // shorts over striped stockings, big rabbit boots with fur cuffs
      c.part(R['hip' + side], (P) => {
        P.cap([0, 1, 0], [0, -13, 0], 4.3, 3.5, (x, y, z) => (y > -6 ? cloth(C.shorts, 5)(x, y, z) : ((y + 60) % 4 < 2 ? C.stockA[2] : C.stockB[2])));
        band(P, -6, -5, C.shorts[3]);
      });
      c.part(R['kn' + side], (P) => P.cap([0, 0, 0], [0, -14, 0], 3.5, 3, (x, y) => ((y + 60) % 4 < 2 ? C.stockA[(x & 3) ? 2 : 1] : C.stockB[2])));
      c.part(R['ft' + side], (P) => {
        P.ell(0, -1.6, 3.6, 4.2, 3.4, 8.4, hide(C.boot, 43));
        P.carve((x, y) => y < -5);
        P.paint((x, y) => (y <= -4 ? C.boot[0] : undefined));
        P.loft(-1, 3, () => [4.6, 4.6], fur(C.fur, 44), { shell: 1.5 });
        for (const z of [3, 5, 7]) stud(P, 0, -0.5 - (z - 3) * 0.3, z, 1, 1, C.lining[3]);
      });
    }

    // twin daggers, sheathed and crossed at the small of the back
    const dj = c.joint(R.hips, ...c.v(0, 1, -8.5));
    c.part(dj, (P) => {
      for (const sx of [-1, 1]) {
        const a = [sx * -6, -8, 0], b = [sx * 5, 4, 0], h = [sx * 8.2, 7.4, 0];
        P.cap(a, b, 1.8, 1.5, (x, y, z, t) => (t < 0.12 ? C.gold[2] : hide(C.vest, 45)(x, y, z)));
        P.cap(b, h, 1.1, 1.1, (x, y) => ((x + y) & 1 ? C.vest[0] : C.vest[2]));
        P.ell(b[0], b[1], 0, 2.6, 1, 1.4, C.gold[2]);
        P.ell(h[0] + sx * 0.6, h[1] + 0.6, 0, 1.3, 1.3, 1.3, C.gold[3]);
      }
    });
    c.backItem = dj;

    c.extraUpdate = () => {
      const t = c.time;
      // coins and charms catch the light now and then (and blaze on a flare)
      c.charmMat.color.setScalar(0.5 + Math.max(0, Math.sin(t * 1.7)) ** 8 * 1.2 + c.pose.flare * 1.0);
    };
  },
};
