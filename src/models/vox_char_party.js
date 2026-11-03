// The four forgers as chibi voxel figures (crew grid 0.016 m, ~1 m tall): big heads ~45% of the
// figure, stubby limbs, round fists and chunky boots, bold colour blocks with one accent each,
// oversized signature gear, and real detail: folds, stitching, rivets, buckles, pouches, tatters,
// fur trim, engraved metal, glowing marks. No human faces.
//   Bran   — blacksmith: a welding mask with a glowing visor slit under a leather hood, wild auburn
//            hair, a scorched apron, a forge-gauntlet with coals glowing through its vents, the
//            smith's hammer across his back.
//   Elio   — elemental mage: a deep pointed hood with a magical face of light inside (eyes that
//            blink and change with his mood, a brow mark, drifting stars), robes to the floor,
//            bell sleeves, orbiting rune stones, a crystal staff, and Kindle.
//   Durgan — gnome warrior and the camp cook: short and wide, a horned visored helm with two embers
//            glinting in the slit, a huge braided beard, pauldrons, a minecart-door tower shield,
//            an ore-studded maul.
//   Clover — rabbit rogue: a cute porcelain rabbit mask under a teal hood with long ears through
//            it (one flops), a trailing scarf, a coin belt and charms, twin daggers, rabbit boots.
import * as THREE from 'three';
import { VPart, VOX_CHIBI, hash, voxGlow } from './vox_char_kit.js';
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
export const PAL = {
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
// Chibi proportions, in crew voxels (0.016 m): a head ~26 voxels tall on a ~30-voxel body, so the
// head is ~45% of the figure; stubby limbs, big round fists and boots. Rig numbers are voxels.
export const BUILD = {
  // ================================================================ BRAN, the blacksmith
  bran(c) {
    const C = PAL.bran;
    c.rigFrom({ footH: 4, legLo: 6, legUp: 6, torsoH: 14, neckH: 1, shX: 10.5, shY: 10.5, armUp: 8, armLo: 7, hipX: 4.4, grip: 3.4, chestZ: 9.5 });
    const R = c.rig;
    c.coalMat = voxGlow();
    const coal = (x, y, z) => C.coal[1 + Math.floor(hash(x, y, z, 77) * 3)];

    // pelvis: trousers, a thick belt with a brass buckle, a pouch, tongs at the hip
    c.part(R.hips, (P) => {
      P.loft(-6, 2, (y) => [8.4 + (y + 6) * 0.06, 6.7], cloth(C.pants, 5));
      P.loft(-1, 2, () => [9.2, 7.4], (x, y) => (y === -1 || y === 1 ? C.leather[3] : C.leather[2]));
      buckle(P, -2, -1, 5, 4, 7, C.brass[2], C.leather[1]);
      for (const x of [-7, 6]) stud(P, x, 0, 0, 2, 1, C.brass[3]);
      pouch(P, [8.6, 1, 1.5], 4, 6, 5, C.leather, C.brass[3]);
      for (const dz of [0, 1.6]) P.cap([-9, -0.5, 1.2 + dz], [-10.2, -9, 1.8 + dz], 0.8, 0.6, C.iron[3]);
      P.ell(-9.5, -0.5, 2, 1.3, 1.3, 1.8, C.iron[2]);
    });
    // the apron: scorched leather to the knees, a stitched hem, a pocket of tools
    const ap = c.joint(R.hips, ...c.v(0, -0.5, 7.4));
    c.part(ap, (P) => {
      for (let y = -11; y <= 1; y++) for (let x = -8; x < 8; x++) {
        const bot = -10 + Math.floor(hash(x >> 1, 3, 9) * 1.8);
        if (y < bot || (y < -8 && Math.abs(x + 0.5) > 7.5 - (y + 8) * -0.9)) continue;
        const z0 = -Math.round(((x + 0.5) ** 2) / 26);
        const edge = Math.abs(x + 0.5) > 6.6 || y === bot;
        for (let z = z0 - 1; z <= z0; z++) P.set(x, y, z, edge && (x + y) % 3 !== 0 ? C.apron[3] : hash(x >> 1, y >> 1, 4) > 0.86 ? C.apron[0] : hide(C.apron, 12)(x, y, z));
      }
      for (let y = -6; y <= -1; y++) for (let x = 1; x <= 5; x++) P.set(x, y, 1, y === -1 || x === 1 || x === 5 ? C.apron[3] : C.apron[1]);
      P.cap([2.5, -1, 1.5], [2.5, 2, 2], 0.8, 0.8, C.wood[2]); P.cap([2.5, 2, 2], [2.5, 3.3, 2], 0.6, 0.6, C.iron[3]);
      P.cap([4.2, -1, 1.5], [4.4, 1.5, 1.5], 0.6, 0.6, C.iron[2]);
    });
    c.addSpring(ap, 'x', { base: 0, src: 'vz', gain: 0.15, k: 70, d: 7, wobble: 0.02, min: -1.1, max: 0.12, extra: (ch) => -Math.max(0, ch.pose.lHip, ch.pose.rHip) * 0.6 });

    // torso: a round little chest under a leather-and-mail bib, a red scarf wound at the throat
    const tr = (y) => { const t = y / 14; return [8.4 + Math.sin(Math.PI * clamp(t, 0, 1)) * 1.2 - Math.max(0, t - 0.82) * 20, Math.max(3, 6.6 + Math.sin(Math.PI * clamp(t, 0, 1)) * 1.1 - Math.max(0, t - 0.86) * 14)]; };
    c.part(R.spine, (P) => {
      P.loft(-1, 15, (y) => { const [rx, rz] = tr(y); return rx < 3 ? null : [rx, rz]; }, cloth(C.shirt, 9));
      P.loft(0, 12, (y) => { const [rx, rz] = tr(y); return [rx + 1.2, rz + 1.2]; }, (x, y, z) => {
        const w = 6.4 - Math.max(0, y - 8) * 0.5, ax = Math.abs(x + 0.5);
        if (ax > w) return undefined;
        if (ax > w - 1.1 || y === 0 || y === 11) return (x + y) % 3 ? C.apron[3] : C.apron[2];
        return y >= 7 ? mail(C.iron)(x, y, z) : hide(C.apron, 13)(x, y, z);
      }, { front: true });
      for (const sx of [-1, 1]) P.path([[sx * 5.5, 11, 7.6, 0.9], [sx * 7.5, 15, 1, 0.9], [sx * 6, 11, -6.6, 0.9]], (x, y) => ((y >> 1) & 1 ? C.iron[3] : C.iron[1]));
      P.loft(11, 16, (y) => [8.4 - (y - 11) * 0.3, 7.6 - (y - 11) * 0.25], cloth(C.scarf, 10), { shell: 2.4 });
      P.ell(6.5, 12, 4.5, 2.6, 2.4, 2.4, cloth(C.scarf, 4, 1));
    });
    c.chain(R.spine, c.v(7, 11, 3), 2, 5, (P, i) => P.box(-1.5, -5, -1, 1.5, 0, 1, (x, y) => (i === 1 && y < -3 ? C.scarf[3] : (x + 9) % 3 === 0 ? C.scarf[1] : C.scarf[2])), { rot: [0.35, 0, 0.6], gain: 0.55, k: 55 });

    // the big head: a leather hood, an iron welding mask with a glowing visor slit, wild auburn hair
    c.part(R.head, (P) => {
      const hood = hide(C.leather, 31);
      P.ell(0, 12.5, -0.6, 12.4, 12.6, 12, hood);
      P.loft(-1, 3, (y) => [10 + (3 - y) * 0.6, 9.4 + (3 - y) * 0.5, 0, -0.6], hood);
      stitch(P, (x, y) => (x === -1 || x === 0) && y > 18 && P.surface(x, y, -3), C.leather[3]);
      // the mask: a rounded iron plate standing proud of the hood
      const pw = (y) => (y < 6 ? 6.4 + (y - 2) * 1.1 : y > 17 ? 10.4 - (y - 17) * 1.7 : 10.4);
      for (let y = 2; y <= 21; y++) for (let x = -11; x < 11; x++) {
        const ax = Math.abs(x + 0.5), w = pw(y);
        if (ax > w) continue;
        const z0 = surf(P, x, y, 0, 2, 1);
        const zf = Math.max(z0 ? z0[2] + 1 : 10, Math.round(13.4 - ax * ax / 15 - (y - 11) * (y - 11) / 70));
        const col = ax > w - 1 || y === 2 || y === 21 ? C.iron[3] : ax > w - 2 || y === 3 || y === 20 ? C.iron[0] : metal(C.iron, 33)(x, y, 0);
        for (let z = (z0 ? z0[2] + 1 : 8); z <= zf; z++) P.set(x, y, z, col);
      }
      // the visor slit: cut deep across the eyes, the forge glowing behind the glass
      for (let x = -8; x < 8; x++) for (const y of [11, 12]) {
        const p = surf(P, x, y, 0, 2, 1);
        if (!p) continue;
        P.set(x, y, p[2], null); P.set(x, y, p[2] - 1, null);
        P.set(x, y, p[2] - 2, G(Math.abs(x + 0.5) < 3 ? C.coal[3] : y === 12 ? C.coal[2] : C.coal[1]));
      }
      for (let x = -9; x < 9; x++) stud(P, x, 14, 0, 2, 1, x === -9 || x === 8 ? C.iron[2] : C.iron[3]); // brow ridge
      for (let y = 3; y <= 9; y++) for (const x of [-1, 0]) stud(P, x, y, 0, 2, 1, y === 9 ? C.iron[3] : C.iron[2]); // centre ridge
      for (const [x, y] of [[-8, 18], [7, 18], [-9, 6], [8, 6], [-5, 3], [4, 3]]) stud(P, x, y, 0, 2, 1, C.brass[3]);
      for (const sx of [-1, 1]) { P.ell(sx * 11.2, 12, 3, 1.5, 3, 3, C.brass[2]); P.set(sx > 0 ? 12 : -13, 12, 3, C.brass[0]); }
      // hair bursting from the crown and the nape
      for (let i = 0; i < 9; i++) {
        const x = -6 + i * 1.5, z = -2.5 - (i % 3) * 1.2;
        P.cap([x, 22.5, z], [x + (hash(i, 1) - 0.5) * 6, 28.5 + hash(i, 2) * 3, z - 4], 2, 0.6, (xx, y, zz, t) => C.hair[t > 0.6 ? 3 : t > 0.25 ? 2 : 1]);
      }
      for (let i = 0; i < 5; i++) P.cap([-4 + i * 2, 5, -10.5], [-4.5 + i * 2.2, 1.5, -13], 1.5, 0.5, (x, y, z, t) => C.hair[t > 0.5 ? 2 : 1]);
    }, { glowMat: c.coalMat, glow: 2.2 });
    c.headTop = 27 * VOX_CHIBI;
    c.height = 0.98;

    // arms: rolled sleeves on round shoulders, a bare right forearm, a forge-gauntlet on the left
    for (const side of ['L', 'R']) c.part(R['sh' + side], (P) => {
      P.ell(0, -1, 0, 4.6, 4.4, 4.4, cloth(C.shirt, 6));
      P.cap([0, 0, 0], [0, -8, 0], 3.9, 3.5, cloth(C.shirt, 6));
      P.cap([0, -6, 0], [0, -8.5, 0], 4.3, 4.2, (x, y) => (y === -7 ? C.shirt[1] : C.shirt[3]), false, { flat: true });
    });
    c.part(R.elR, (P) => {
      P.cap([0, 0, 0], [0, -7, 0], 3.2, 3, (x, y, z) => (hash(x, y, z, 5) > 0.93 ? C.skin[1] : C.skin[2]));
      P.cap([0, -2.5, 0], [0, -7.5, 0], 3.6, 3.5, hide(C.leather, 6), false, { flat: true });
      band(P, -4, -3, C.leather[0]);
      stud(P, 0, -5, 0, 0, -1, C.brass[3]);
    });
    c.part(R.handR, (P) => {
      P.ell(0, -3.2, 0.6, 4.2, 4.4, 4, hide(C.leather, 7));
      skin(P, (x, y, z) => y === -6 && z > 1, C.leather[3]);
      P.cap([2.6, -1.6, 2.6], [2.2, -4.4, 4.2], 1.6, 1.4, hide(C.leather, 7));
    });
    c.part(R.elL, (P) => {
      P.cap([0, 1, 0], [0, -7, 0], 4.4, 5, metal(C.iron, 8));
      band(P, 0, 2, C.brass[2]); band(P, -8, -6, C.brass[2]);
      ring(P, 1, 8, C.brass[3], 0.4); ring(P, -7, 8, C.brass[3], 0.4);
      for (const vy of [-2, -4]) P.paint((x, y, z) => {
        if (y !== vy) return undefined;
        const a = ang(x, z), d = Math.hypot(x + 0.5, z + 0.5), r = 4.4 + 0.6 * clamp(-y / 8, 0, 1);
        if (a < -0.2 || a > 2.2) return undefined;
        return d > r - 1.6 ? null : d > r - 2.6 ? G(coal(x, y, z)) : undefined;
      });
    }, { glowMat: c.coalMat });
    c.part(R.handL, (P) => {
      P.ell(0, -3.4, 0.6, 4.8, 4.8, 4.5, metal(C.iron, 9));
      for (const y of [-5, -6]) skin(P, (x, yy, z) => yy === y && z > 0, C.iron[0]);
      for (let x = -3; x <= 2; x += 2) stud(P, x, -2, 0, 2, 1, C.brass[3]);
      skin(P, (x, y, z) => y === -5 && z > 2 && (x & 1), G(C.coal[2]));
      P.cap([-2.8, -1.6, 3], [-2.4, -4.6, 4.6], 1.8, 1.6, metal(C.iron, 9));
    }, { glowMat: c.coalMat });

    // legs: dark trousers with a patched knee, chunky boots with steel toes
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['hip' + side], (P) => {
        P.cap([0, 1, 0], [0, -6, 0], 4.3, 3.9, cloth(C.pants, 5));
        P.ell(0, -5, 3.2, 2.6, 2.4, 1.4, hide(C.leather, 14));
      });
      c.part(R['kn' + side], (P) => {
        P.cap([0, 0, 0], [0, -3, 0], 3.9, 3.8, cloth(C.pants, 5));
        P.cap([0, -2, 0], [0, -6.5, 0], 4.3, 4.2, hide(C.leather, 15), false, { flat: true });
        band(P, -3, -2, C.leather[3]);
      });
      c.part(R['ft' + side], (P) => {
        P.ell(0, -1.2, 2.2, 4.7, 3.4, 6.4, C.leather[2]);
        P.carve((x, y) => y < -4);
        P.paint((x, y, z) => (y <= -3 ? C.sole : z > 4.5 && y > -3 ? metal(C.iron, 17)(x, y, z) : hide(C.leather, 16)(x, y, z)));
        stud(P, 0, 0, 1, 0, sx, C.brass[3]);
      });
    }

    // the smith's hammer across the back: a big chibi head on a stout haft
    const hj = c.joint(R.spine, ...c.v(0, 8, -8.5));
    hj.rotation.set(0.1, 0, 0.72);
    c.part(hj, (P) => {
      P.cap([0, -20, 0], [0, 14, 0], 1.8, 1.8, wood(C.wood));
      for (let y = -18; y < -10; y += 2) band(P, y, y + 1, C.leather[2]);
      P.ell(0, -21, 0, 2.4, 1.9, 2.4, C.iron[2]);
      const hx = 9, y0 = 14, y1 = 24, hz = 6, st = ['#2a2e36', '#454b56', '#666e7c', '#9aa4b4'];
      for (let x = -hx; x < hx; x++) for (let y = y0; y < y1; y++) for (let z = -hz; z < hz; z++) {
        const ex = Math.abs(x + 0.5) > hx - 1.5, ey = y === y0 || y === y1 - 1, ez = Math.abs(z + 0.5) > hz - 1.5;
        if (ex + ey + ez >= 2) continue;
        const ax = Math.abs(x + 0.5);
        P.set(x, y, z, ex ? st[3] : ax > 5 && ax < 6.6 ? (y % 3 ? C.brass[2] : C.brass[3]) : metal(st, 18)(x, y, z));
      }
      for (const z of [-hz, hz - 1]) for (const [gx, gy] of glyph(0, ANVIL)) P.set(gx, 19 + gy, z, G(C.coal[gy > 0 ? 2 : 1]));
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
    c.rigFrom({ footH: 3, legLo: 6, legUp: 6, torsoH: 13, neckH: 1, shX: 9, shY: 9.6, armUp: 8, armLo: 7, hipX: 3.4, grip: 3, chestZ: 8.6 });
    const R = c.rig;
    c.runeMat = voxGlow();
    const robe = cloth(C.robe, 8), inner = cloth(C.inner, 9);

    // sash with a rune-stone clasp, tails on springs
    c.part(R.hips, (P) => {
      P.loft(-3, 3, () => [8.2, 6.8], inner);
      P.loft(-2, 2, () => [8.9, 7.5], cloth(C.sash, 6));
      P.ell(0, 0, 7.8, 2.4, 2.4, 1.4, C.stone[2]);
      for (const [gx, gy] of glyph(0, GLYPHS3)) P.set(gx, gy, 9, G(C.rune));
    }, { glowMat: c.runeMat });
    c.chain(R.hips, c.v(5, -1, 5.5), 2, 5, (P, i) => P.box(-1.5, -5, -1, 1.5, 0, 1, (x, y) => (i === 1 && y < -3 ? C.trim[2] : C.sash[x === -2 ? 1 : 2])), { rot: [0.1, 0, 0.2], gain: 0.5, k: 55 });
    // robes to the floor: an inner robe and an open outer robe, tattered, gold at the edges
    const sk = c.joint(R.hips, 0, -0.01, 0);
    c.part(sk, (P) => {
      const H = 15;
      const I = new VPart();
      I.loft(-H, 1, (y) => { const t = -y / H; return [8 + t * 4.6, 6.6 + t * 4.2]; }, inner, { shell: 2 });
      tatter(I, -H, 3, 26, 11);
      P.add(I);
      const O = new VPart();
      O.loft(-H + 2, 2, (y) => { const t = -y / H; return [9.2 + t * 5, 7.7 + t * 4.6]; }, (x, y, z, { u }) => {
        const t = -y / H, open = 0.32 + t * 0.34;
        if (Math.abs(u) < open) return undefined;
        return Math.abs(u) < open + 0.18 ? C.trim[y % 3 === 0 ? 3 : 2] : robe(x, y, z);
      }, { shell: 1.6 });
      tatter(O, -H + 2, 4, 22, 12);
      O.paint((x, y, z) => (!O.has(x, y - 1, z) && O.surface(x, y, z) ? C.trim[2] : undefined));
      P.add(O);
    });
    c.addSpring(sk, 'x', { base: 0, src: 'vz', gain: 0.35, k: 40, d: 5, wobble: 0.025, min: -0.45, max: 0.45, extra: (ch) => -Math.max(0, ch.pose.lHip, ch.pose.rHip) * 0.3 });
    c.addSpring(sk, 'z', { base: 0, src: 'vx', gain: -0.25, k: 40, d: 5, wobble: 0.02, rate: 1.7, min: -0.4, max: 0.4 });

    // torso: inner robe, a stole of glowing marks, a tattered little mantle, a high gold collar
    c.part(R.spine, (P) => {
      const tr = (y) => { const t = y / 13; return [8 + Math.sin(Math.PI * clamp(t, 0, 1)) * 0.9 - Math.max(0, t - 0.82) * 18, Math.max(3, 6.4 + Math.sin(Math.PI * clamp(t, 0, 1)) * 0.8 - Math.max(0, t - 0.85) * 12)]; };
      P.loft(-1, 14, (y) => { const [rx, rz] = tr(y); return rx < 3 ? null : [rx, rz]; }, inner);
      for (const sx of [-1, 1]) P.loft(0, 11, (y) => { const [rx, rz] = tr(y); return [rx + 0.8, rz + 0.8]; }, (x, y, z) => {
        if (Math.abs(x + 0.5 - sx * 3.2) > 1.7) return undefined;
        const ry = (y + 200) % 5, gl = glyph(Math.floor(y / 5) + sx * 7 + 20, GLYPHS3);
        if (z > 3 && ry > 0 && ry < 4 && gl.some(([gx, gy]) => gx === Math.round(x + 0.5 - sx * 3.2) && gy === ry - 2)) return G(C.rune);
        return Math.abs(x + 0.5 - sx * 3.2) > 1 ? C.trim[2] : C.sash[2];
      }, { front: true });
      const M = new VPart();
      M.loft(6, 13, (y) => { const t = (y - 6) / 7; return [11.6 - t * 3.6, 9 - t * 2]; }, robe, { shell: 1.6 });
      tatter(M, 6, 3, 18, 21);
      M.paint((x, y, z) => (y === 9 && M.surface(x, y, z) ? C.trim[(x + z) % 5 === 0 ? 3 : 2] : undefined));
      P.add(M);
      P.loft(11, 16, (y) => [6.6 + (y - 11) * 0.2, 6], (x, y) => (y === 15 ? C.trim[3] : C.trim[1]), { shell: 1.2 });
    }, { glowMat: c.runeMat });

    // the hood: deep and dark, a magical visage within; its tall point flops back on a spring
    c.part(R.head, (P) => {
      P.ell(0, 12.5, -1, 12.6, 13, 12.8, robe);
      P.loft(-1, 3, (y) => [10.6 + (3 - y) * 0.7, 10 + (3 - y) * 0.6, 0, -1], robe);
      const open = (x, y, z) => z > 2 && Math.abs(x + 0.5) < 8.4 - Math.max(0, y - 15) * 0.8 && y > 2.5 && y < 20.5;
      P.carve(open);
      P.paint((x, y, z) => {
        if (!(open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1))) return undefined;
        return P.has(x, y, z + 1) || z <= 5 ? C.void : C.trim[(y & 3) === 0 ? 3 : 2];
      });
    });
    // the face: no flesh, only eyes of arcane light that blink and change with his mood, a mark
    // on the brow, a line of light for a smile, and star motes drifting in the dark
    c.eyeMat = voxGlow();
    const face = c.joint(R.head, 0, 0, 0);
    const EYES = {
      neutral: ['.ooo.', 'oiwio', 'oiiio', '.ooo.'], wide: ['.ooo.', 'oiwio', 'oiiio', 'oiiio', '.ooo.'], happy: ['.....', '.ooo.', 'o...o', '.....'],
      narrow: ['.....', 'ooooo', 'oiwio', '.....'], angry: ['oo...', '.ooo.', '.oiwo', '..ooo'], sad: ['.....', '...oo', '.ooio', 'oiio.'],
      smug: ['.....', '.....', 'ooooo', '.oiwo'], hurt: ['o....', '.oo..', '..ooo', '.oo..'], blink: ['.....', '.....', 'ooooo', '.....'],
    };
    c.faceParts = {};
    for (const [key, rows] of Object.entries(EYES)) {
      c.faceParts[key] = c.part(face, (P) => {
        rows.forEach((r, row) => { for (let i = 0; i < 5; i++) {
          const ch = r[i];
          if (ch === '.') continue;
          const col = G(ch === 'o' ? C.eye[0] : ch === 'i' ? C.eye[1] : C.eye[2]);
          const y = 13 - row;
          P.set(-7 + i, y, 6, col); P.set(6 - i, y, 6, col);
        } });
      }, { glowMat: c.eyeMat, glow: 2.2 });
      c.faceParts[key].visible = key === 'neutral';
    }
    c.smile = c.part(face, (P) => { for (const [x, y] of [[-4, 7], [-3, 6], [-2, 6], [-1, 5], [0, 5], [1, 6], [2, 6], [3, 7]]) P.set(x, y, 6, G(C.eye[0])); }, { glowMat: c.eyeMat, glow: 1.8 });
    c.smile.visible = false;
    c.part(face, (P) => { for (const [x, y] of [[-1, 18], [0, 18], [-2, 17], [1, 17], [-1, 16], [0, 16], [-1, 19], [0, 19]]) P.set(x, y, 5, G(C.eye[3])); }, { glowMat: c.runeMat, glow: 1.6 });
    const moteGeo = new THREE.BoxGeometry(VOX_CHIBI * 0.6, VOX_CHIBI * 0.6, VOX_CHIBI * 0.6);
    const motes = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(moteGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 3 ? '#9adcff' : '#d8b4ff').multiplyScalar(1.6), toneMapped: false, fog: false }));
      m.castShadow = false;
      face.add(m);
      motes.push({ m, x: (hash(i, 1, 71) - 0.5) * 13 - 0.5, y: 4 + hash(i, 2, 71) * 15, z: 3.5 + hash(i, 3, 71) * 2.5, p: hash(i, 4, 71) * TAU });
    }
    const LINKS = [[0, 2], [2, 4], [4, 1], [1, 5], [5, 3], [3, 6], [6, 7]];
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
      motes.forEach((o) => {
        o.m.position.set((o.x + Math.sin(t * 0.4 + o.p) * 0.9) * VOX_CHIBI, (o.y + Math.sin(t * 0.3 + o.p * 2) * 0.8) * VOX_CHIBI, (o.z + Math.sin(t * 0.5 + o.p) * 0.4) * VOX_CHIBI);
        o.m.scale.setScalar(0.6 + Math.max(0, Math.sin(t * 2.1 + o.p * 3)) * 0.8 + fl * 0.6);
      });
      LINKS.forEach(([a, b], i) => { motes[a].m.position.toArray(pos, i * 6); motes[b].m.position.toArray(pos, i * 6 + 3); });
      lineGeo.attributes.position.needsUpdate = true;
      lines.material.opacity = 0.25 + fl * 0.5 + Math.sin(t * 0.9) * 0.08;
    };
    const tip = c.joint(R.head, ...c.v(0, 22, -4));
    c.part(tip, (P) => {
      P.path([[0, 0, 0, 7.5], [0, 7, -3, 5.2], [0, 12.5, -7.5, 3.2], [0, 16, -12.5, 1.6]], (x, y, z, t) => (t > 0.45 && t < 0.52 ? C.trim[2] : robe(x, y, z)));
      P.ell(0, 16.5, -13.8, 2.2, 2.2, 2.2, C.trim[2]);
      P.cap([0, 15.5, -14.2], [0, 11.5, -15.5], 1, 0.6, C.trim[3]);
    });
    c.addSpring(tip, 'x', { base: 0, src: 'vz', gain: 0.5, k: 38, d: 4, wobble: 0.05, extra: (ch) => -ch.poseVel.lean * 0.05 });
    c.addSpring(tip, 'z', { base: 0, src: 'vx', gain: -0.3, k: 38, d: 4, wobble: 0.03, rate: 1.6 });
    c.headTop = 30 * VOX_CHIBI;
    c.height = 1.08;

    // bell sleeves with teal lining and gold cuffs, tattered at the ends
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => { P.ell(0, -1, 0, 4.2, 4.2, 4.2, robe); P.cap([0, 0, 0], [0, -8, 0], 3.6, 3.9, robe); band(P, -2, -1, C.trim[2]); });
      c.part(R['el' + side], (P) => {
        P.loft(-9, 1, (y) => { const t = -y / 9; return [3.9 + t * t * 4, 3.9 + t * t * 4]; }, robe, { shell: 1.3 });
        tatter(P, -9, 2, 12, 31 + sx);
        P.paint((x, y, z) => (y < -3 && Math.hypot(x + 0.5, z + 0.5) < 3.9 + ((-y / 9) ** 2) * 4 - 0.9 ? C.lining[2] : y >= -7 && y < -6 && P.surface(x, y, z) ? C.trim[2] : undefined));
      });
      c.part(R['hand' + side], (P) => {
        P.ell(0, -2.6, 0.5, 3.2, 3.4, 3, C.glove[2]);
        for (let i = 0; i < 4; i++) P.cap([-1.5 + i * 1.1, -4.4, 1.4], [-1.6 + i * 1.2, -6.4, 2], 0.8, 0.7, C.glove[i & 1 ? 1 : 2]);
        P.cap([-sx * 2.5, -2, 1.8], [-sx * 2.8, -4.2, 3.2], 1.1, 0.9, C.glove[2]);
      });
      c.part(R['hip' + side], (P) => P.cap([0, 1, 0], [0, -6, 0], 3.2, 2.9, C.inner[1]));
      c.part(R['kn' + side], (P) => P.cap([0, 0, 0], [0, -6, 0], 2.9, 2.7, C.inner[1]));
      c.part(R['ft' + side], (P) => {
        P.ell(0, -0.8, 2, 3.2, 2.2, 4.8, robe);
        P.carve((x, y) => y < -3);
        P.cap([0, -1.2, 5.5], [0, 1.4, 7.6], 1.1, 0.5, C.trim[2]); // a curled toe
      });
    }

    // rune stones orbiting at the waist
    const orbit = c.joint(R.hips, 0, 0, 0);
    c.runes = [];
    for (let i = 0; i < 4; i++) {
      c.runes.push(c.part(orbit, (P) => {
        P.ell(0, 0, 0, 2.8, 3.2, 2, (x, y, z) => C.stone[hash(x >> 1, y >> 1, z, i) > 0.7 ? 1 : (y > 1 ? 3 : 2)]);
        for (const zz of [2, -3]) for (const [gx, gy] of glyph(i * 2 + (zz < 0 ? 1 : 0), GLYPHS3)) P.set(gx, gy, zz, G(C.rune));
      }, { glowMat: c.runeMat }));
    }
    // the crystal staff, slung across the back
    const sj = c.joint(R.spine, ...c.v(-2, 3, -8.5));
    sj.rotation.set(0.1, 0, -0.42);
    c.part(sj, (P) => {
      P.path([[0, -24, 0, 1.4], [0.6, -10, 0.3, 1.5], [-0.4, 4, -0.2, 1.5], [0, 14, 0, 1.7]], wood(C.wood, 6));
      for (const y of [-2, 11]) band(P, y, y + 2, C.trim[2]);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        P.path([[ca * 1.3, 13, sa * 1.3, 1], [ca * 3.6, 17, sa * 3.6, 0.9], [ca * 3.2, 22, sa * 3.2, 0.7], [ca * 1.2, 25, sa * 1.2, 0.5]], wood(C.wood, 7));
      }
      P.loft(15, 29, (y) => { const r = y < 24 ? 2.8 : 2.8 * (1 - (y - 24) / 5); return r < 0.4 ? null : [r, r]; }, (x, y, z, { u }) => {
        const f = Math.floor((u / TAU + 1) * 6) % 6;
        return f === 1 || f === 4 ? G(C.crystal[3]) : f % 2 ? C.crystal[2] : C.crystal[1];
      });
    }, { glowMat: c.runeMat });
    c.backItem = sj;

    const k = new Kindle();
    k.group.scale.setScalar(0.8);
    c.group.add(k.group);
    c.kindle = k;
    const kp = new THREE.Vector3();
    c.extraUpdate = (dt) => {
      const t = c.time, fl = clamp(c.pose.flare, 0, 1.5);
      c.runes.forEach((g, i) => {
        const a = t * (0.7 + fl * 2.4) + (i * TAU) / 4, r = 0.3 + fl * 0.14;
        g.position.set(Math.cos(a) * r, 0.18 + Math.sin(t * 1.3 + i * 1.7) * 0.04 + (i & 1) * 0.08 + fl * 0.08, Math.sin(a) * r * 0.85);
        g.rotation.set(Math.sin(t + i) * 0.3, -a + Math.PI / 2, Math.sin(t * 0.7 + i) * 0.25);
      });
      c.runeMat.color.setScalar(0.65 + fl * 1.2 + Math.sin(t * 3) * 0.08);
      c.updateFace(dt, fl);
      if (c.kindleTarget) kp.copy(c.kindleTarget);
      else {
        const a = t * 0.9, hy = c.dims.hipH + c.pose.dy + c.dims.torsoH + 0.3;
        kp.set(Math.cos(a) * 0.36, hy + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.3);
      }
      k.group.position.lerp(kp, 1 - Math.exp(-5 * dt));
    };
    c.onExpression = (e) => { c.faceShape = SHAPE[e] || 'neutral'; if (e === 'surprised' || e === 'happy') k.excite = 1; };
  },

  // ================================================================ DURGAN, the gnome warrior (and camp cook)
  durgan(c) {
    const C = PAL.durgan;
    c.rigFrom({ footH: 4, legLo: 4, legUp: 5, torsoH: 13, neckH: 0, shX: 12, shY: 10, armUp: 7, armLo: 6, hipX: 5, grip: 4, chestZ: 12 });
    const R = c.rig;
    c.oreMat = voxGlow();
    const crystal = (P, x, y, z, dx, dy, dz, n = 3, s = 1) => {
      for (let i = 0; i < n; i++) {
        const j = (k) => (hash(i, k, s) - 0.5) * 1.4;
        P.cap([x, y, z], [x + dx * 2.2 + j(1), y + dy * 2.2 + j(2), z + dz * 2.2 + j(3)], 0.9, 0.3, (xx, yy, zz, t) => G(C.ore[t > 0.6 ? 3 : 2]));
      }
    };

    // pelvis: a navy tunic skirt, a broad belt with an ore-set buckle, studded strips that swing
    c.part(R.hips, (P) => {
      P.loft(-7, 2, (y) => [11.2 + (-y) * 0.12, 9.4 + (-y) * 0.1], cloth(C.tunic, 9));
      P.loft(-1, 2, () => [11.8, 10], (x, y) => (y === -1 || y === 1 ? C.leather[3] : C.leather[2]));
      P.ell(0, 0.5, 10, 3.2, 2.8, 1.5, (x, y) => (Math.hypot(x + 0.5, y - 0.5) < 1.8 ? C.bronze[1] : C.bronze[2]));
      crystal(P, 0, 0.5, 10.8, 0, 0.3, 1, 2, 3);
      ring(P, 0, 12, C.bronze[3], 0.26);
    }, { glowMat: c.oreMat });
    for (const [z, rot, ph] of [[10, 0, 0], [-10, Math.PI, 1]]) {
      const j = c.joint(R.hips, ...c.v(0, -1, z));
      j.rotation.y = rot;
      c.part(j, (P) => {
        for (let i = -2; i <= 2; i++) for (let y = -7; y <= 0; y++) for (let x = i * 4 - 1; x <= i * 4 + 1; x++) P.set(x, y, 0, y === -7 || x === i * 4 + 1 ? C.leather[1] : C.leather[2]);
        for (let i = -2; i <= 2; i++) P.set(i * 4, -3, 1, C.bronze[3]);
      });
      c.addSpring(j, 'x', { base: 0, src: 'vz', gain: rot ? -0.25 : 0.25, k: 60, d: 6, wobble: 0.02, phase: ph, min: -0.9, max: 0.3, extra: (ch) => -Math.max(0, ch.pose.lHip, ch.pose.rHip) * 0.5 });
    }

    // torso: a barrel in mail under a crossed harness, an ore boss, a fur mantle
    c.part(R.spine, (P) => {
      const tr = (y) => { const t = y / 13; return [10.8 + Math.sin(Math.PI * clamp(t * 0.95, 0, 1)) * 2 - Math.max(0, t - 0.82) * 18, Math.max(4, 9 + Math.sin(Math.PI * clamp(t, 0, 1)) * 1.6 - Math.max(0, t - 0.86) * 14)]; };
      P.loft(-1, 14, (y) => { const [rx, rz] = tr(y); return rx < 4 ? null : [rx, rz]; }, mail(C.mail));
      for (const sx of [-1, 1]) P.path([[sx * 9.5, 12, -5, 1.3], [0, 6, -10.6, 1.3], [-sx * 10, 0, -7, 1.3]], C.leather[2]);
      P.ell(0, 3, 10.8, 3, 3, 1.6, (x, y) => (Math.hypot(x + 0.5, y - 3) > 2.2 ? C.bronze[3] : C.bronze[2]));
      crystal(P, 0, 3, 12, 0, 0.2, 1, 3, 5);
      for (let a = 0; a < 26; a++) {
        const t = (a / 26) * TAU, r = 10 + hash(a, 1, 88) * 1.4;
        P.ell(Math.sin(t) * r, 12 + hash(a, 2, 88) * 1.4, Math.cos(t) * (r - 1.8), 2.6, 2.4, 2.6, fur(C.fur, 89));
      }
    }, { glowMat: c.oreMat });

    // the big helm: a dome with a closed visor (two embers glint in the slit), horns, and the beard
    c.part(R.head, (P) => {
      const st = metal(C.steel, 91);
      P.ell(0, 11.5, 0, 11.4, 11.4, 11.2, st);
      P.carve((x, y) => y < 2);
      P.loft(2, 5, () => [11.2, 11], st);
      P.paint((x, y, z) => (y >= 12 && y <= 13 && P.surface(x, y, z) ? ((x + z + y) % 4 === 0 ? C.bronze[1] : C.bronze[2]) : undefined));
      for (let z = -11; z <= 10; z++) { const p = surf(P, -1, 0, z, 1, 1); if (p) for (const x of [-1, 0]) P.set(x, p[1] + 1, z, C.bronze[z % 3 ? 2 : 3]); }
      for (let y = 2; y <= 11; y++) for (let x = -9; x < 9; x++) {
        if (Math.abs(x + 0.5) > 8.6 - (y < 4 ? 4 - y : 0)) continue;
        const p = surf(P, x, y, 0, 2, 1);
        if (p) P.set(x, y, p[2] + 1, Math.abs(x + 0.5) > 7.6 || y === 2 ? C.steel[3] : st(x, y, 0));
      }
      for (let x = -8; x < 8; x++) {
        if (x === -1 || x === 0) continue;
        for (const y of [8, 9]) { const p = surf(P, x, y, 0, 2, 1); if (!p) continue; P.set(x, y, p[2], null); P.set(x, y, p[2] - 1, null); P.set(x, y, p[2] - 2, Math.abs(x + 0.5) === 4.5 && y === 9 ? G('#ffcf6a') : C.slit); }
      }
      for (let y = 3; y <= 12; y++) for (const x of [-1, 0]) stud(P, x, y, 0, 2, 1, y === 12 ? C.bronze[3] : C.bronze[2], y > 5 ? 2 : 1);
      for (const [x, y] of [[-8, 3], [7, 3], [-8, 10], [7, 10], [-5, 3], [4, 3]]) stud(P, x, y, 0, 2, 1, C.bronze[3]);
      for (const x of [-7, 6]) stud(P, x, 12, 0, 2, 1, C.ore[2]);
      for (const sx of [-1, 1]) {
        P.ell(sx * 11, 11, 0, 2.4, 2.6, 2.6, C.bronze[2]);
        P.path([[sx * 11.5, 11.5, 0, 3.2], [sx * 16, 12.8, -1, 2.8], [sx * 19.5, 16.5, -2, 2.1], [sx * 20, 22, -2, 1.4], [sx * 18, 25.5, -1, 0.6]], (x, y, z, t) => C.horn[Math.min(3, Math.floor(t * 3) + (Math.floor(t * 14) % 2))]);
      }
      // the beard: a great bushy fall over the chest, a moustache under the visor
      P.ell(0, 0, 8.6, 10, 5.4, 4.6, fur(C.beard, 99));
      P.ell(0, -5.5, 9, 8.2, 5, 4, fur(C.beard, 100));
      P.ell(0, -10, 9, 5.6, 3.6, 3.2, fur(C.beard, 102));
      for (const sx of [-1, 1]) { P.ell(sx * 7.5, 3, 8.6, 2.6, 2.8, 2.6, fur(C.beard, 101)); P.cap([sx * 1.5, 2, 11], [sx * 6.5, 0.5, 11.5], 1.6, 1.2, fur(C.beard, 103)); }
    }, { glowMat: c.oreMat });
    for (const sx of [-1, 1]) {
      c.chain(R.head, c.v(sx * 3.5 - (sx > 0 ? 1 : 0), -12, 9), 2, 4, (P, i) => {
        P.cap([0, 0, 0], [0, -4.5, 0], 1.6, 1.4, (x, y) => C.beard[(y + 9) % 2 ? 1 : 3]);
        if (i === 1) P.ell(0, -4.5, 0, 2, 1.2, 2, C.bronze[2]);
      }, { gain: 0.25, k: 70, wobble: 0.02, twist: false });
    }
    c.headTop = 23 * VOX_CHIBI;
    c.height = 0.84;

    // arms: big pauldrons, mail, bracers, huge gloves
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => {
        P.cap([0, -1, 0], [0, -7, 0], 4.4, 4, mail(C.mail));
        const L = new VPart();
        L.ell(0, 1, 0, 7.2, 5.8, 6.8, metal(C.steel, 92));
        L.carve((x, y) => y < -1);
        const S = new VPart();
        S.ell(0, -2.4, 0, 7, 3, 6.4, metal(C.steel, 93));
        S.carve((x, y, z) => y < -3.6 || y > -1 || Math.hypot(x + 0.5, z + 0.5) < 5);
        S.paint((x, y) => (y === -4 || y === -3 ? C.bronze[2] : undefined));
        L.add(S);
        L.paint((x, y) => (y === -1 ? C.bronze[2] : undefined));
        P.add(L);
        ring(P, 2, 9, C.bronze[3], 0.3);
        crystal(P, sx * 1.6, 6, 0, 0, 1, 0, 3, 7 + sx);
      }, { glowMat: c.oreMat });
      c.part(R['el' + side], (P) => {
        P.cap([0, 0, 0], [0, -6, 0], 4, 4.4, hide(C.leather, 94));
        band(P, -1, 0, C.bronze[2]); band(P, -6, -5, C.bronze[2]);
        ring(P, -3, 7, C.bronze[3], 0.2);
      });
      c.part(R['hand' + side], (P) => {
        P.ell(0, -3.6, 0.6, 5, 5, 4.7, hide(C.leather, 95));
        skin(P, (x, y, z) => y === -6 && z > 2, C.leather[3]);
        P.cap([-sx * 3, -2, 3], [-sx * 2.6, -5, 4.8], 1.9, 1.6, hide(C.leather, 95));
      });
      c.part(R['hip' + side], (P) => P.cap([0, 1, 0], [0, -5, 0], 5, 4.6, cloth(C.tunic, 5)));
      c.part(R['kn' + side], (P) => {
        P.cap([0, 0, 0], [0, -4, 0], 4.6, 4.4, metal(C.steel, 96));
        P.ell(0, 0, 3, 3, 2.6, 2.2, C.steel[3]);
      });
      c.part(R['ft' + side], (P) => {
        P.ell(0, -1.2, 2.4, 5.6, 3.6, 7.2, hide(C.leather, 97));
        P.carve((x, y) => y < -4);
        P.paint((x, y, z) => (y <= -3 ? C.leather[0] : z > 5.5 && y > -3 ? metal(C.steel, 98)(x, y, z) : undefined));
        P.loft(-1, 2, () => [5.6, 5.6], fur(C.fur, 99), { shell: 1.4 });
      });
    }

    // the tower shield: a minecart door with a faded 7, riveted and rusted
    const shj = c.joint(R.elL, 0, 0, 0);
    c.part(shj, (P) => {
      const X0 = -8, X1 = 11, Y0 = -17, Y1 = 6, Z = 10;
      const seven = (x, y) => { const gx = x - 1, gy = y + 3; return (gy >= 3 && gy <= 4 && gx >= -3 && gx <= 4) || (gx >= 2 - Math.floor((3 - gy) * 0.45) && gx <= 3 - Math.floor((3 - gy) * 0.45) && gy >= -7 && gy < 3); };
      for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++) {
        const fr = x <= X0 + 1 || x >= X1 - 1 || y <= Y0 + 1 || y >= Y1 - 1, rib = y === -11;
        const rust = hash(x >> 1, y >> 2, 3) > 0.74;
        P.set(x, y, Z, rust ? C.rust[hash(x, y, 7) > 0.5 ? 2 : 1] : C.cart[2]);
        P.set(x, y, Z + 1, fr || rib ? C.cart[fr ? 3 : 1] : seven(x, y) && hash(x, y, 9) > 0.15 ? C.paint : rust ? C.rust[hash(x, y, 8) > 0.6 ? 3 : 2] : C.cart[hash(x >> 2, y >> 2, 4) > 0.8 ? 1 : 2]);
        if (fr || rib) P.set(x, y, Z + 2, (fr && (x + y) % 4 === 0) ? C.bronze[3] : C.cart[fr ? 2 : 1]);
      }
      for (const y of [Y0 + 3, Y1 - 4]) P.box(X0 - 2, y, Z, X0, y + 2, Z + 2, C.cart[1]);
      P.cap([1.5, -4, 3], [1.5, -4, Z], 1.1, 1.1, C.cart[2]);
    });
    c.shield = shj;
    c.shieldArm = { lSh: 0.3, lEl: 0.2, lAb: -0.22, lTw: 0 };

    // the ore-studded maul across the back
    const mj = c.joint(R.spine, ...c.v(2, 6, -10.5));
    mj.rotation.set(0.1, 0, -0.6);
    c.part(mj, (P) => {
      P.cap([0, -17, 0], [0, 11, 0], 2, 2, wood(C.wood));
      for (let y = -15; y < -8; y += 2) band(P, y, y + 1, C.leather[3]);
      for (let x = -7; x < 7; x++) for (let y = 10; y < 21; y++) for (let z = -5; z < 5; z++) {
        const e = (Math.abs(x + 0.5) > 5.5) + (y < 11 || y > 19) + (Math.abs(z + 0.5) > 3.5);
        if (e >= 2) continue;
        const ax = Math.abs(x + 0.5);
        P.set(x, y, z, ax > 3 && ax < 4.6 ? C.cart[(y & 1) ? 2 : 3] : C.stone[hash(x >> 1, y >> 1, z >> 1, 21) > 0.7 ? 1 : (y > 17 ? 3 : 2)]);
      }
      for (const [x, y, z, dx, dy, dz] of [[-2, 16, 5, 0, 0.3, 1], [-7, 17, 0, -1, 0.4, 0], [7, 14, 1, 1, 0.2, 0], [0, 21, -1, 0.2, 1, 0]]) crystal(P, x, y, z, dx, dy, dz, 3, x * 7 + y);
    }, { glowMat: c.oreMat });
    c.backItem = mj;

    c.extraUpdate = () => {
      const t = c.time;
      c.oreMat.color.setScalar(0.8 + Math.sin(t * 2.4) * 0.12 + c.pose.flare * 0.8);
    };
  },

  // ================================================================ CLOVER, the rabbit rogue
  clover(c) {
    const C = PAL.clover;
    c.rigFrom({ footH: 4, legLo: 6, legUp: 5, torsoH: 11, neckH: 1, shX: 7.2, shY: 8.4, armUp: 7, armLo: 6, hipX: 3.3, grip: 2.6, chestZ: 7.4 });
    const R = c.rig;
    c.charmMat = voxGlow();

    // pelvis: shorts, a coin belt hung with gold, a fluffy tail, lucky charms
    c.part(R.hips, (P) => {
      P.loft(-5, 2, () => [7.4, 5.8], cloth(C.shorts, 6));
      P.loft(-1, 2, () => [8, 6.4], (x, y) => (y === 1 ? C.vest[3] : C.vest[2]));
      buckle(P, -2, -1, 4, 3, 6, C.gold[2], C.vest[1]);
      for (let i = 0; i < 8; i++) {
        const a = -1.9 + i * 0.54, cx = Math.sin(a) * 8.4, cz = Math.cos(a) * 6.8;
        if (Math.abs(a) < 0.3) continue;
        P.ell(cx, -2.5, cz, 1.4, 1.4, 1, (x, y, z) => (x === Math.floor(cx) && y === -3 ? G(C.gold[3]) : C.gold[2]));
      }
    }, { glowMat: c.charmMat, glow: 1.2 });
    const tail = c.joint(R.hips, ...c.v(0, -2, -6));
    c.part(tail, (P) => P.ell(0, 0, -1.6, 3.6, 3.6, 3.2, fur(C.fur, 7)));
    c.addSpring(tail, 'x', { base: 0, src: 'vy', gain: 0.4, k: 60, d: 4, wobble: 0.06, rate: 3.1 });
    c.addSpring(tail, 'z', { base: 0, src: 'vx', gain: 0.4, k: 60, d: 4, wobble: 0.04, rate: 2.2 });
    const ch = c.joint(R.hips, ...c.v(7.4, -1.5, 2.6));
    c.part(ch, (P) => {
      P.cap([0, 0, 0], [0.5, -3, 0.5], 0.5, 0.5, C.vest[1]);
      for (const [x, y] of [[-2, -4], [-2, -5], [-2, -6], [-1, -7], [0, -7], [1, -7], [2, -6], [2, -5], [2, -4]]) P.set(x + 0.5, y, 0.5, C.gold[y === -7 ? 3 : 2]);
      P.cap([1, -1, 1], [3, -3, 2.5], 0.4, 0.4, C.vest[1]);
      for (const [x, y] of [[2, -4], [4, -4], [3, -3], [3, -5]]) P.ell(x + 0.5, y, 2.5, 1, 1, 0.6, C.clover[y === -3 ? 3 : 2]);
    }, { glowMat: c.charmMat, glow: 1.2 });
    c.addSpring(ch, 'x', { base: 0, src: 'vz', gain: 0.6, k: 45, d: 3.5, wobble: 0.06 });
    c.addSpring(ch, 'z', { base: 0.1, src: 'vx', gain: -0.6, k: 45, d: 3.5, wobble: 0.05, rate: 2.9 });

    // torso: a cream shirt, a quilted vest with gold buttons, a bandolier of throwing knives, a scarf
    c.part(R.spine, (P) => {
      const tr = (y) => { const t = y / 11; return [7 + Math.sin(Math.PI * clamp(t, 0, 1)) * 0.8 - Math.max(0, t - 0.8) * 13, Math.max(3, 5.6 + Math.sin(Math.PI * clamp(t, 0, 1)) * 0.7 - Math.max(0, t - 0.84) * 9)]; };
      P.loft(-1, 12, (y) => { const [rx, rz] = tr(y); return rx < 3 ? null : [rx, rz]; }, cloth(C.shirt, 7));
      P.loft(0, 9, (y) => { const [rx, rz] = tr(y); return [rx + 0.9, rz + 0.9]; }, (x, y, z, { u }) => {
        if (Math.abs(u) < 0.36) return undefined;
        if (Math.abs(u) < 0.5) return C.vest[3];
        return (x + y + 40) % 4 === 0 || (x - y + 40) % 4 === 0 ? C.vest[1] : C.vest[2];
      });
      for (const y of [2, 5]) for (const sx of [-1, 1]) stud(P, sx * 2.6 - (sx < 0 ? 1 : 0), y, 0, 2, 1, C.gold[2]);
      P.path([[-6.6, 10, 3.2, 1.1], [0, 5, 7, 1.1], [7, 0, 4.4, 1.1]], (x, y) => (y % 3 === 0 ? C.vest[0] : C.vest[1]));
      for (let i = 0; i < 3; i++) { const x = -3.6 + i * 2.6, y = 7.6 - i * 2.2; P.cap([x, y, 7.6], [x + 0.6, y + 3, 8.2], 0.6, 0.4, C.silver[i & 1 ? 2 : 3]); }
      P.loft(9, 14, () => [6.4, 5.8], cloth(C.scarf, 8), { shell: 2.2 });
    });
    c.chain(R.spine, c.v(2, 10, -5.5), 4, 5, (P, i) => P.box(-2.2, -5, -1, 2.2, 0, 1, (x, y) => (i === 3 && y < -2 ? (x & 1 ? C.scarf[3] : C.lining[2]) : (y + 60) % 5 === 0 ? C.scarf[1] : C.scarf[2])), { rot: [0.75, 0, 0.25], gain: 0.8, k: 42, d: 5, wobble: 0.07, phase: 0.4 });

    // the big hood: an opening framed in teal; in it a cute porcelain rabbit mask tied with a ribbon
    const hoodC = cloth(C.hood, 7);
    c.part(R.head, (P) => {
      P.ell(0, 11.5, 0, 11.6, 11.8, 11.6, hoodC);
      P.loft(-1, 3, (y) => [9.8 + (3 - y) * 0.5, 9.2 + (3 - y) * 0.4], hoodC);
      const open = (x, y, z) => z > 2 && Math.abs(x + 0.5) < 8.8 && y > 2 && y < 18.5;
      P.carve(open);
      P.paint((x, y, z) => {
        if (!(open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1))) return undefined;
        return P.has(x, y, z + 1) || z <= 5 ? C.shadow : C.hood[3];
      });
      for (const sx of [-1, 1]) for (let z = 1; z <= 6; z++) P.set(sx < 0 ? -10 : 9, 11, z, C.ribbon[2]);
      for (const sx of [-1, 1]) P.ell(sx * 3 - 0.5, 4, -11.4, 2.4, 1.8, 1.2, (x, y) => C.ribbon[y > 4 ? 3 : 2]);
      P.ell(-0.5, 4, -11.8, 1.2, 1.2, 1.2, C.ribbon[1]);
      stitch(P, (x, y) => (x === -1 || x === 0) && y > 18, C.hood[3]);
    });
    c.chain(R.head, c.v(0, 3, -11.8), 2, 4, (P, i) => { P.box(-2, -4, -0.5, 0, 0, 0.5, C.ribbon[i ? 3 : 2]); P.box(0, -4, -0.5, 2, 0, 0.5, C.ribbon[2]); }, { rot: [0.2, 0, 0], gain: 0.5, k: 50, wobble: 0.05, twist: false });
    // the mask: round porcelain cheeks, a pink button nose, blush, a tiny smile, whiskers painted
    // out past its edge; its painted eyes change with the mood and the mask tilts with it
    const MASK = [
      '....sswwwwss....', '..sswwwwwwwwss..', '.swwwwwwwwwwwws.', '.swwwwwwwwwwwws.', 'swweeeewweeeewws', 'swweeeewweeeewws',
      'swweeeewweeeewws', 'swweeeewweeeewws', 'swwbbbwnnwbbbwws', 'kkwbbbwppwbbbwkk', 'swwwwwwmmwwwwwws', 'kkwwwwmwwmwwwwkk',
      '.swwwwwwwwwwwws.', '..sswwwwwwwwss..', '....sswwwwss....',
    ];
    const cell = (x, y) => { const r = MASK[17 - y]; return r ? r[x + 8] || '.' : '.'; };
    const zf = (x, y) => Math.round(13.2 - (x + 0.5) ** 2 / 28 - (y - 10) ** 2 / 64 + (y < 10 && y > 5 && Math.abs(x + 0.5) > 2.5 && Math.abs(x + 0.5) < 6.5 ? 0.6 : 0));
    const mj = c.joint(R.head, ...c.v(0, 10, 8));
    const MO = { offset: [0, 10, 8] };
    c.part(mj, (P) => {
      for (let y = 3; y <= 17; y++) for (let x = -8; x < 8; x++) {
        const ch2 = cell(x, y);
        if (ch2 === '.') continue;
        const z = zf(x, y), base = C.porcelain[y > 13 && Math.abs(x + 0.5) < 4 ? 3 : 2];
        P.set(x, y, z - 1, C.porcelain[1]); P.set(x, y, z - 2, C.porcelain[0]);
        if (ch2 === 'e') continue;
        P.set(x, y, z, ch2 === 's' ? C.porcelain[1] : ch2 === 'k' || ch2 === 'm' ? C.rose : ch2 === 'b' ? C.blush : ch2 === 'p' ? C.nose[0] : ch2 === 'n' ? C.nose[1] : base);
        if (ch2 === 'p' || ch2 === 'n') P.set(x, y, z + 1, ch2 === 'n' ? C.nose[1] : C.nose[0]);
      }
      // whiskers: two fine painted strokes past each cheek
      for (const sx of [-1, 1]) for (const [y, dy] of [[9, 0], [7, -1]]) for (let i = 0; i < 3; i++) {
        const x = sx < 0 ? -9 - i : 8 + i;
        P.set(x, y + (i === 2 ? dy : 0), zf(sx < 0 ? -8 : 7, y) - 1 - i, C.rose);
      }
    }, MO);
    const EYES = {
      neutral: ['....', '.##.', '.##.', '....'], happy: ['....', '.##.', '#..#', '....'], surprised: ['.##.', '#..#', '#..#', '.##.'],
      sad: ['....', '##..', '..##', '....'], angry: ['#...', '.#..', '.##.', '.##.'], sleepy: ['....', '....', '####', '....'],
      determined: ['....', '####', '.##.', '....'], smug: ['....', '####', '....', '....'], hurt: ['#...', '.##.', '.##.', '#...'],
    };
    c.maskEyes = {};
    for (const [key, rows] of Object.entries(EYES)) {
      c.maskEyes[key] = c.part(mj, (P) => {
        rows.forEach((r, row) => { for (let i = 0; i < 4; i++) {
          const y = 13 - row, xl = -6 + i, xr = -xl - 1;
          const col = r[i] === '#' ? C.paint : C.porcelain[2];
          P.set(xl, y, zf(xl, y), col); P.set(xr, y, zf(xr, y), col);
        } });
        if (key === 'neutral') { P.set(-5, 12, zf(-5, 12), C.porcelain[3]); P.set(3, 12, zf(3, 12), C.porcelain[3]); }
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
    c.headTop = 23 * VOX_CHIBI;
    c.height = 1.18;
    // long ears through slits in the hood; the right one flops at the tip
    const earC = (x, y, z) => (z >= 0 && Math.abs(x + 0.5) < 2 && y > 1 && y < 14 ? C.inner[y > 8 ? 2 : 1] : fur(C.fur, 8)(x, y, z));
    c.ears = [];
    for (const sx of [-1, 1]) {
      const ej = c.joint(R.head, ...c.v(sx * 4.4, 20.5, -2));
      const flop = sx < 0;
      ej.rotation.z = -sx * 0.14;
      c.part(ej, (P) => { P.ell(0, 7, 0, 3.6, 7.6, 2, earC); P.ell(0, 0.5, 0, 3, 2, 2.4, hoodC); });
      const tj = c.joint(ej, ...c.v(0, 13, 0));
      tj.rotation.x = flop ? -1.15 : 0;
      c.part(tj, (P) => P.ell(0, 4.4, 0, 3.3, 5.6, 1.8, (x, y, z) => earC(x, y + 6, z)));
      c.addSpring(ej, 'x', { base: -0.15, src: 'vy', gain: 0.3, k: 55, d: 5, wobble: 0.03, phase: sx, extra: (h) => -h.pose.ears * 0.3, min: -1, max: 0.8 });
      c.addSpring(ej, 'z', { base: ej.rotation.z, src: 'vx', gain: -0.2, k: 55, d: 5, extra: (h) => -sx * h.pose.ears * 0.12 });
      c.addSpring(tj, 'x', { base: tj.rotation.x, src: 'vy', gain: 0.6, k: 30, d: 3, wobble: 0.06, phase: 2 + sx, extra: (h) => (flop ? -h.pose.ears * 0.5 : -h.pose.ears * 0.2), min: -1.4, max: 1.2 });
      c.ears.push(ej);
    }

    // slim arms with bracers and fluffy paws
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      c.part(R['sh' + side], (P) => { P.ell(0, -1, 0, 3.4, 3.4, 3.4, cloth(C.shirt, 5)); P.cap([0, 0, 0], [0, -7, 0], 2.9, 2.7, cloth(C.shirt, 5)); });
      c.part(R['el' + side], (P) => {
        P.cap([0, 0, 0], [0, -6, 0], 2.7, 2.6, cloth(C.shirt, 5));
        P.cap([0, -1.5, 0], [0, -6.5, 0], 3.1, 3, hide(C.vest, 41), false, { flat: true });
        band(P, -3, -2, C.gold[1]);
      });
      c.part(R['hand' + side], (P) => {
        P.ell(0, -2.6, 0.4, 3.4, 3.6, 3.2, fur(C.fur, 42));
        P.cap([-sx * 2.2, -1.8, 1.8], [-sx * 2.4, -4, 3.2], 1.2, 1, fur(C.fur, 42));
        skin(P, (x, y, z) => y < -4 && z > 1 && Math.abs(x + 0.5) < 2, C.inner[2]);
      });
      c.part(R['hip' + side], (P) => {
        P.cap([0, 1, 0], [0, -5, 0], 3.8, 3.2, (x, y, z) => (y > -2 ? cloth(C.shorts, 5)(x, y, z) : ((y + 60) % 3 < 2 ? C.stockA[2] : C.stockB[2])));
        band(P, -2, -1, C.shorts[3]);
      });
      c.part(R['kn' + side], (P) => P.cap([0, 0, 0], [0, -6, 0], 3.1, 2.8, (x, y) => ((y + 60) % 3 < 2 ? C.stockA[(x & 3) ? 2 : 1] : C.stockB[2])));
      c.part(R['ft' + side], (P) => {
        P.ell(0, -1.2, 2.6, 4.2, 3.2, 6.6, hide(C.boot, 43));
        P.carve((x, y) => y < -4);
        P.paint((x, y) => (y <= -3 ? C.boot[0] : undefined));
        P.loft(-1, 2, () => [4.4, 4.4], fur(C.fur, 44), { shell: 1.4 });
        for (const z of [3, 5]) stud(P, 0, -0.5 - (z - 3) * 0.3, z, 1, 1, C.lining[3]);
      });
    }

    // twin daggers, sheathed and crossed at the small of the back
    const dj = c.joint(R.hips, ...c.v(0, 1, -7.4));
    c.part(dj, (P) => {
      for (const sx of [-1, 1]) {
        const a = [sx * -5, -6, 0], b = [sx * 4, 3.5, 0], h = [sx * 6.6, 6, 0];
        P.cap(a, b, 1.6, 1.3, (x, y, z, t) => (t < 0.12 ? C.gold[2] : hide(C.vest, 45)(x, y, z)));
        P.cap(b, h, 1, 1, (x, y) => ((x + y) & 1 ? C.vest[0] : C.vest[2]));
        P.ell(b[0], b[1], 0, 2.2, 1, 1.3, C.gold[2]);
        P.ell(h[0] + sx * 0.5, h[1] + 0.5, 0, 1.2, 1.2, 1.2, C.gold[3]);
      }
    });
    c.backItem = dj;

    c.extraUpdate = () => {
      const t = c.time;
      c.charmMat.color.setScalar(0.5 + Math.max(0, Math.sin(t * 1.7)) ** 8 * 1.2 + c.pose.flare * 1.0);
    };
  },
};
