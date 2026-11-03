// The Forglite crew's camp in an old dungeon hall (main menu, intro and ending), and the small
// rest nooks of the delve. Built with the layout kit: vaulted masonry hall with columns, a waterfall
// alcove under a crack of moonlight, the iron gate the hero flees through, roots, ferns, moss and
// glowing mushrooms — and the camp itself: the fire and the stew pot, log seats, bedrolls, sacks of
// ore and a glittering diamond crate, the anvil, the scary old chest, Pip's basket, the old map.
// The core around the fire is baked before the first frame; the rest of the hall streams in over
// the next frames out of the dark (tiles fade up as they arrive).
import * as THREE from 'three';
import { S, C, glowC, tone, h3, box, ell, cyl, cylX, cylZ, seg, VWorld, meshWorld, worldMeshes } from './stage_vox_kit.js';
import * as PR from './stage_vox_props.js';
import { Layout, Piece, ACT_STYLES, CAMP_STYLE, MAT, vx, roots, fern, tufts, crystalCluster, banner, cobweb, rubble, lilyPads, floorColor } from './stage_vox_layout.js';
import { noise2 } from '../core/math.js';
import { fx as rnd } from '../core/rng.js';
import { LAYER_FX } from '../gfx/renderer.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pal = (a) => a.map(C);
const WOOD_DARK = pal(['#1e1210', '#2e1c16', '#42281c', '#5a3824', '#74482c']);
const IRON = pal(['#1e1c26', '#33303e', '#4e4a5e', '#706c86', '#a09cb4']);

// ---------------------------------------------------------------------------- camp layout (metres)
export const CAMPMENU = {
  fire: [0, 0],
  seats: {
    bran: { x: -1.62, z: 0.2, h: 0.18, log: 'z' },
    elio: { x: -0.86, z: -1.3, h: 0.18, log: 'x' },
    durgan: { x: 0.62, z: -0.82, h: 0, log: null },   // stands at the pot with the ladle
    clover: { x: 1.68, z: 0.05, h: 0.17, log: 'crate' },
  },
  petBed: [0.98, 1.02], chest: [1.5, -2.3], mapCrate: [-2.35, 1.35], sacks: [[-2.85, -0.55], [-2.55, -1.45], [-3.2, -1.05]],
  crate: [2.8, -1.05], anvil: [2.75, 1.45], books: [-1.55, -2.05], bowls: [[-0.62, 0.7], [0.42, 0.82], [-0.75, -0.55]],
  crack: [[0.35, 2.05], [2.55, 2.75]],
  gate: [3.5, -4.1], fall: [-4.15, -5.5],
};

function logZ(w, x, y, z, len, r, seed) {
  cylZ(w, x + 0.5, y + r, z - (len >> 1), z + (len >> 1), r, (px, py, pz, d) => (pz === z - (len >> 1) || pz === z + (len >> 1) - 1 ? (Math.round(Math.sqrt(d) * 4) % 2 ? C('#d8a870') : C('#a87a4a')) : tone(PR.WOOD, 0.3 + (py - y) / (2 * r) * 0.4 + h3(px, py, pz >> 1, seed) * 0.15)));
  for (let k = 0; k < 6; k++) w.set(x + (k % 2), Math.round(y + r * 2), z - 6 + k * 2, C(k % 3 ? '#6a9a4a' : '#9ac86a'));
}
/** The old chest from the deep: black oak, rusted iron bands, a horned skull lock, green light leaking out. */
function scaryChest(w, x, y, z) {
  const W = 13, D = 8, H = 9;
  box(w, x - W, y, z - D, x + W + 1, y + H, z + D + 1, (px, py, pz) => {
    const band = Math.abs(px - x) % 9 === 0 || py === y || py === y + H - 1;
    return band ? tone(IRON, 0.3 + h3(px, py, pz, 2) * 0.3) : tone(WOOD_DARK, 0.3 + ((pz + 40) % 3 === 0 ? -0.15 : 0) + h3(px, py, pz, 1) * 0.2);
  });
  // a curved lid with a glowing seam under it
  for (let px = x - W; px <= x + W; px++) for (let pz = z - D; pz <= z + D; pz++) { const k = Math.cos(((pz - z) / (D + 1)) * Math.PI / 2); const top = y + H + 1 + Math.round(k * 4); for (let py = y + H + 1; py <= top; py++) w.set(px, py, pz, Math.abs(px - x) % 9 === 0 ? tone(IRON, 0.4) : tone(WOOD_DARK, 0.25 + (py === top ? 0.2 : 0) + h3(px, py, pz, 3) * 0.15)); }
  for (let px = x - W + 1; px < x + W; px++) w.set(px, y + H, z + D + 1, h3(px, 1, 1, 7) > 0.35 ? glowC('#7affb0') : C('#0a140e'));
  // skull lock with horns
  ell(w, x, y + H - 2, z + D + 2, 2.6, 2.6, 1.6, (px, py) => (py === y + H - 2 && (px === x - 1 || px === x + 1) ? glowC('#9affc8') : C('#d8d0b8')));
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) w.set(x + s * (3 + k), y + H - 1 + Math.round(k * 0.7), z + D + 2, C('#b8b098'));
  // chains draped across
  PR.chain(w, x - W, y + H + 4, z + D + 1, x + W, y + H + 4, z + D + 1, 6);
  // claw-foot corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ell(w, x + sx * W, y + 1, z + sz * D, 2, 1.6, 2, tone(IRON, 0.5));
}
/** A woven basket with a cushion (Pip's bed). */
function petBasket(w, x, y, z) {
  for (let py = 0; py < 5; py++) for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2, r = 9 + py * 0.25; w.set(Math.round(x + Math.cos(a) * r), y + py, Math.round(z + Math.sin(a) * r * 0.8), ((k + py) & 1) ? C('#b88a4a') : C('#8a5e2e')); }
  ell(w, x, y + 1.5, z, 8, 2.2, 6.4, (px, py, pz) => (h3(px, py, pz, 3) > 0.85 ? C('#f0c8b0') : C((Math.floor(px / 3) + Math.floor(pz / 3)) & 1 ? '#c05a6e' : '#e88a8a')));
  // a little bone toy
  for (let k = -3; k <= 3; k++) w.set(x + 10 + k, y, z + 6, C('#efe6d0'));
  for (const s of [-4, 4]) { w.set(x + 10 + s, y, z + 5, C('#efe6d0')); w.set(x + 10 + s, y, z + 7, C('#efe6d0')); }
}
/** Crate of diamonds: an open crate heaped with glittering cut stones, some spilled at its foot. */
function diamondCrate(w, x, y, z) {
  PR.crate(w, x, y, z, 14, 10, 11, { seed: 9 });
  const gem = (cx, cy, cz, r, col) => { for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) * 1.3 + Math.abs(dz) <= r) w.set(cx + dx, cy + dy, cz + dz, dx - dz > 0 || dy > 0 ? glowC(col) : C(col)); };
  const cols = ['#e8fbff', '#bff4ff', '#ffffff', '#ff9af0', '#9af0ff'];
  for (let k = 0; k < 14; k++) gem(x - 9 + (k % 5) * 4 + (k > 9 ? 2 : 0), y + 11 + Math.floor(k / 5) * 2, z - 4 + ((k * 3) % 9), 2, cols[k % cols.length]);
  for (let k = 0; k < 5; k++) gem(x - 12 + k * 5, y + 2, z + 14 + (k % 2) * 3, 2, cols[(k + 2) % cols.length]);
}
/** An open sack of ore with chunks spilling out. */
function oreSack(w, x, y, z, ore, seed) {
  PR.sack(w, x, y, z, 1.15, PR.CLOTH.cream, ore.map(C));
  for (let k = 0; k < 9; k++) { const a = h3(k, seed, 1, 1) * Math.PI, r = 9 + h3(k, seed, 2, 2) * 8; ell(w, x + Math.cos(a) * r, y + 1, z + Math.sin(a) * r * 0.7 + 4, 1.8, 1.4, 1.8, (px, py, pz) => (h3(px, py, pz, k) > 0.7 ? glowC(ore[k % ore.length]) : C(ore[k % ore.length]))); }
}
/** The old map pinned to a crate: parchment with ink paths, a red X and a pin. */
function mapCrate(w, x, y, z) {
  PR.crate(w, x, y, z, 12, 9, 10, { seed: 4 });
  for (let pz = -7; pz <= 7; pz++) for (let px = -10; px <= 10; px++) {
    const edge = Math.abs(px) === 10 || Math.abs(pz) === 7;
    const ink = Math.abs(Math.sin(px * 0.35) * 4 - pz) < 0.6 || (Math.abs(px + pz * 0.5) < 0.6 && px < 2) || ((px - 5) ** 2 + (pz + 2) ** 2 < 2);
    w.set(x + px, y + 10, z + pz, edge ? C('#a88a5a') : ink ? C('#5a3a24') : ((px === 6 && pz === -3) || (px === 7 && pz === -2) || (px === 5 && pz === -2) || (px === 7 && pz === -4) || (px === 5 && pz === -4)) ? C('#c0303a') : tone(PR.CLOTH.cream, 0.5 + h3(px, pz, 1, 2) * 0.3));
  }
  w.set(x - 9, y + 11, z - 6, C('#c0303a')); w.set(x - 9, y + 12, z - 6, C('#ff6a6a'));
}

/** Build the camp. Stage: the Stage class (passed in to keep modules acyclic). */
export function buildCampMenu(Stage, opts = {}) {
  const A = CAMP_STYLE, LY = CAMPMENU;
  const L = new Layout(-7.8, 6.6, -9.8, 6.8);
  const XW = 6.2, ZB = -4.2, ZF = 6.6;
  const hallCeil = (x, z) => { let c = 3.9 + 1.5 * Math.sqrt(Math.max(0, 1 - (x / 6.5) ** 2)); if (Math.abs(((z % 2.7) + 2.7) % 2.7 - 1.35) < 0.13) c -= 0.24; return c; };
  L.rect(-XW, XW, ZB, ZF, 0, hallCeil, MAT.STONE, 0);
  // waterfall alcove (back left) under a crack of moonlight; gate tunnel (back right); bedroll niche (left)
  L.rect(-5.4, -2.9, -6.0, ZB + 0.2, 0, (x, z) => 4.4 + (Math.hypot(x + 4.15, z + 5.4) < 0.9 ? 3 : 0), MAT.STONE, 1);
  L.edit(-5.25, -3.05, -5.85, -4.35, null, { floor: -0.32, mat: MAT.WATER });
  L.rect(2.75, 4.25, -9.6, ZB + 0.2, 0, (x) => 2.45 + 0.6 * Math.sqrt(Math.max(0, 1 - ((x - 3.5) / 0.9) ** 2)), MAT.STONE, 0);
  L.rect(-7.6, -XW + 0.1, -1.3, 1.7, 0, 2.7, MAT.STONE, 0);
  // the moonlit hole in the vault above the fire's back-left
  L.edit(-2.6, -1.4, -3.4, -2.2, (x, z) => Math.hypot(x + 2.0, z + 2.8) < 0.55, { ceil: 8.5 });
  // floor dressing: earth around the fire, a rug by Elio's books
  L.edit(-1.2, 1.2, -1.2, 1.2, (x, z) => Math.hypot(x, z * 1.1) < 1.0 + noise2(x * 2, z * 2) * 0.25, { mat: MAT.EARTH });
  L.edit(-2.2, -0.3, -2.5, -1.7, null, { mat: MAT.RUG });
  // the pit under the crack where Medusa climbs out (covered by loose flagstones until crackOpen)
  const crackLens = lensOf(LY.crack[0], LY.crack[1]);
  L.edit(crackLens.x0, crackLens.x1, crackLens.z0, crackLens.z1, crackLens.test, { floor: -2.4, mat: MAT.VOID });
  // columns (left out of the space: the shell paints them as masonry)
  const cols = [[-4.6, -2.3], [4.65, -2.3], [-4.6, 2.2], [4.65, 2.2]];
  for (const [cx, cz] of cols) for (let Z = vx(cz - 0.45); Z <= vx(cz + 0.45); Z++) for (let X = vx(cx - 0.45); X <= vx(cx + 0.45); X++) if (Math.hypot((X + 0.5) * S - cx, (Z + 0.5) * S - cz) < 0.4) { const i = L.i(X, Z); if (i >= 0) L.inside[i] = 0; }
  L.finish();
  const P = new Piece(L, A, 4242);
  const r = (() => { let s = 777; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
  // ---- the camp
  P.op(-1, 1, -1, 1, (w) => { PR.firepit(w, 0, 0, 0, 15); PR.cookpot(w, 0, 0, 0, 34); });
  P.flame(0, 0.06, 0.06, 1.7, 'fire');
  P.lamp(0, 0.75, 0, '#ffa040', 7.2, 1.9);
  P.lamp(0, 2.4, 2.8, '#ff9a50', 7.5, 0.4);
  const SEAT = LY.seats;
  P.op(-2.4, -1, -0.8, 1.2, (w) => logZ(w, vx(SEAT.bran.x - 0.04), 0, vx(SEAT.bran.z), 22, 2.25, 1));
  P.op(-1.8, 0, -2, -0.8, (w) => PR.logSeat(w, vx(SEAT.elio.x), 0, vx(SEAT.elio.z - 0.03), 22, 2.25, 2));
  P.op(1.2, 2.2, -0.5, 0.6, (w) => PR.crate(w, vx(SEAT.clover.x + 0.03), 0, vx(SEAT.clover.z), 8, 4, 8, { seed: 6, mark: '#c05a4e' }));
  P.op(0.4, 1.6, 0.4, 1.6, (w) => petBasket(w, vx(LY.petBed[0]), 0, vx(LY.petBed[1])));
  for (const [bx, bz] of LY.bowls) P.op(bx - 0.2, bx + 0.2, bz - 0.2, bz + 0.2, (w) => { const X = vx(bx), Z = vx(bz); for (let py = 0; py < 3; py++) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, rr = 2.2 + py * 0.5; w.set(Math.round(X + Math.cos(a) * rr), py, Math.round(Z + Math.sin(a) * rr), tone(PR.WOOD, 0.45 + py * 0.1)); } w.set(X, 1, Z, glowC('#e8823a')); w.set(X + 1, 1, Z, C('#c86a3a')); });
  const ores = [['#e08a4a', '#c86a3a', '#ffd27a'], ['#c8c8d8', '#9a9aa8', '#ffffff'], ['#ffd25e', '#e8b84a', '#fff0b0']];
  LY.sacks.forEach(([sx, sz], k) => P.op(sx - 0.8, sx + 0.8, sz - 0.8, sz + 0.8, (w) => oreSack(w, vx(sx), 0, vx(sz), ores[k], k + 3)));
  P.op(LY.crate[0] - 1, LY.crate[0] + 1, LY.crate[1] - 0.8, LY.crate[1] + 1.2, (w) => diamondCrate(w, vx(LY.crate[0]), 0, vx(LY.crate[1])));
  P.lamp(LY.crate[0], 0.7, LY.crate[1] + 0.3, '#bff4ff', 2.2, 1.1);
  P.op(LY.anvil[0] - 0.8, LY.anvil[0] + 0.8, LY.anvil[1] - 0.6, LY.anvil[1] + 0.6, (w) => PR.anvil(w, vx(LY.anvil[0]), 0, vx(LY.anvil[1])));
  P.op(4.3, 5.2, 1.6, 2.9, (w) => PR.toolRack(w, vx(4.65), 0, vx(2.75)));
  P.op(LY.chest[0] - 0.8, LY.chest[0] + 0.8, LY.chest[1] - 0.6, LY.chest[1] + 0.8, (w) => scaryChest(w, vx(LY.chest[0]), 0, vx(LY.chest[1])));
  P.lamp(LY.chest[0], 0.5, LY.chest[1] + 0.45, '#7affb0', 1.9, 1.0);
  P.op(LY.mapCrate[0] - 0.6, LY.mapCrate[0] + 0.6, LY.mapCrate[1] - 0.5, LY.mapCrate[1] + 0.5, (w) => mapCrate(w, vx(LY.mapCrate[0]), 0, vx(LY.mapCrate[1])));
  P.op(LY.books[0] - 0.5, LY.books[0] + 0.5, LY.books[1] - 0.4, LY.books[1] + 0.4, (w) => { PR.books(w, vx(LY.books[0]), 0, vx(LY.books[1]), 5, 1); PR.books(w, vx(LY.books[0]) + 9, 0, vx(LY.books[1]) + 3, 2, 3); w.set(vx(LY.books[0]) - 4, 11, vx(LY.books[1]), glowC('#ffd27a')); });
  // bedrolls in the niche, a pile of firewood, lanterns on the columns
  P.op(-7.6, -6, -1.3, 1.7, (w) => { PR.bedroll(w, vx(-7.2), 0, vx(-0.8), PR.CLOTH.salmon, 1); PR.bedroll(w, vx(-7.2), 0, vx(0.2), PR.CLOTH.teal, 2); PR.bedroll(w, vx(-7.2), 0, vx(1.2), PR.CLOTH.mustard, 3); });
  P.torch(-7.0, 1.5, -1.25, 0, 1, '#ffb060');
  P.op(-4.3, -2.9, -3.6, -2.6, (w) => { for (let k = 0; k < 9; k++) cylX(w, vx(-4.0), vx(-3.0), 3 + Math.floor(k / 3) * 6, vx(-3.3) + (k % 3) * 6, 3, (px, py, pz, d) => (d < 0.3 ? C('#d8a870') : tone(PR.WOOD, 0.4 + h3(px, py, pz, k) * 0.2))); });
  for (const [cx, cz] of cols) {
    const fz = cz + (cz < 0 ? 0.5 : -0.5), nz = cz < 0 ? 1 : -1;
    P.op(cx - 0.6, cx + 0.6, fz - 0.6, fz + 0.6, (w) => { PR.lantern(w, vx(cx), vx(2.15), vx(fz) + nz * 2, '#ffc070', 8); for (let y = vx(2.4); y < vx(2.75); y++) w.set(vx(cx), y, vx(fz), IRON[2]); });
    P.flame(cx, 1.98, fz + nz * 0.08, 0.35, 'fire');
    P.lamp(cx, 2.0, fz + nz * 0.3, '#ffc070', 3.6, 1.2);
    P.lights.push({ x: cx, y: 2, z: fz + nz * 0.3, c: '#ffc070', i: 1.4, r: 4 });
    P.op(cx - 0.7, cx + 0.7, cz - 0.7, cz + 0.7, (w) => PR.vine(w, vx(cx) + (cx < 0 ? 11 : -11), vx(4.6), vx(cz), 70, A.leaf.slice(1, 4), Math.round(cx * 3), A.flowers[Math.abs(Math.round(cz)) % 4]));
  }
  // the gate: an arch with a raised portcullis, braziers either side, darkness beyond
  const [gx, gz] = LY.gate;
  P.op(gx - 1.2, gx + 1.2, gz - 0.6, gz + 0.6, (w) => {
    for (let x = vx(gx - 0.72); x <= vx(gx + 0.72); x += 3) for (let y = vx(2.0); y < vx(3.0); y++) w.set(x, y, vx(gz) - 2, IRON[1 + (y & 1)]);
    for (let y = vx(2.0); y < vx(3.0); y += 5) for (let x = vx(gx - 0.72); x <= vx(gx + 0.72); x++) w.set(x, y, vx(gz) - 2, IRON[2]);
    for (let x = vx(gx - 0.72); x <= vx(gx + 0.72); x += 3) for (let k = 0; k < 4; k++) w.set(x, vx(2.0) - k, vx(gz) - 2, IRON[3 - (k >> 1)]);
  });
  for (const s of [-1, 1]) { const bx = gx + s * 1.15, bz = gz + 0.5; P.op(bx - 0.4, bx + 0.4, bz - 0.4, bz + 0.4, (w) => PR.brazier(w, vx(bx), 0, vx(bz), '#ff8a3a')); P.flame(bx, 0.62, bz, 0.9, 'fire'); P.lamp(bx, 0.95, bz + 0.2, '#ffa040', 3.6, 1.3); P.lights.push({ x: bx, y: 1, z: bz + 0.2, c: '#ffa040', i: 2, r: 4 }); }
  P.lamp(gx, 1.0, -8.5, '#5a6aa8', 3.0, 0.5);
  // the waterfall alcove under the moon
  const [fx, fzz] = LY.fall;
  P.waterfall(fx, 4.3, -0.28, fzz - 0.2, 0.7, 0, 1);
  P.water(-5.25, -3.05, -5.85, -4.35, -0.06);
  P.op(-5.4, -2.9, -6.0, -4.2, (w) => { lilyPads(w, A, vx(-4.2), -2, vx(-5.1), 20, 3, 5); for (let k = 0; k < 6; k++) roots(w, A, vx(fx - 0.6 + k * 0.25), vx(4.35), vx(fzz + 0.1), 30 + k * 7, k, k === 2 ? A.glow : null); fern(w, A, vx(-5.0), 0, vx(-4.3), 9, 1, 3); fern(w, A, vx(-3.2), 0, vx(-4.35), 8, 2, 3); });
  P.lamp(fx, 0.4, fzz + 0.6, '#5ad8f0', 3.2, 1.3);
  P.lights.push({ x: fx, y: 0.6, z: fzz + 0.8, c: '#5ad8f0', i: 1.2, r: 4 });
  P.shaft(-4.15, 7, -5.2, 1.0, 7.3, '#c8d8ff', 0.32);
  P.shaft(-2.0, 8.2, -2.8, 1.0, 8.2, '#b8c8ff', 0.28);
  P.lamp(-2.0, 1.2, -2.6, '#9aa8e8', 3.4, 0.7);
  P.op(-2.6, -1.4, -3.4, -2.2, (w) => { for (let k = 0; k < 5; k++) roots(w, A, vx(-2.0) + (k - 2) * 4, vx(8.3), vx(-2.8) + ((k * 3) % 5) - 2, 90 + k * 10, k + 9, k === 1 ? A.glow : null); });
  // the crew's banners on the back wall, glowing mushrooms and crystals in the corners
  for (const [bx, cloth, em] of [[-1.5, PR.CLOTH.salmon, '#ffd27a'], [1.2, PR.CLOTH.teal, '#ffd27a']]) P.op(bx - 0.4, bx + 0.4, ZB - 0.2, ZB + 0.3, (w) => banner(w, vx(bx), vx(3.6), vx(ZB), 7, 40, 0, 1, cloth, em, Math.round(bx * 5)));
  for (const [mx, mz, h, cap] of [[-5.6, -3.6, 18, PR.CLOTH.lavender], [-5.3, -3.2, 11, PR.CLOTH.plum], [5.6, -3.7, 15, PR.CLOTH.salmon], [5.2, 4.8, 13, PR.CLOTH.lavender], [-5.7, 4.5, 16, PR.CLOTH.plum]]) {
    P.op(mx - 0.5, mx + 0.5, mz - 0.5, mz + 0.5, (w) => { PR.mushroom(w, vx(mx), 0, vx(mz), h, cap, '#c89aff', Math.round(mx * 10)); PR.mushroom(w, vx(mx) + 5, 0, vx(mz) + 4, Math.round(h * 0.55), cap, '#9af0ff', Math.round(mz * 10)); });
    P.lamp(mx, 0.4, mz, '#b89aff', 2.4, 0.9);
  }
  P.op(5.4, 6.2, -4.2, -3.2, (w) => crystalCluster(w, vx(5.85), 0, vx(-3.9), 30, '#9ae8ff', 3, 5));
  P.lamp(5.6, 0.6, -3.6, '#9ae8ff', 2.4, 1);
  // the pit's depths: glowing seams in the rock and a baked glow low enough to stay off the floor above
  const cc = [(LY.crack[0][0] + LY.crack[1][0]) / 2, (LY.crack[0][1] + LY.crack[1][1]) / 2];
  P.op(crackLens.x0, crackLens.x1, crackLens.z0, crackLens.z1, (w) => {
    for (let Z = Math.floor(crackLens.z0 / S); Z < crackLens.z1 / S; Z++) for (let X = Math.floor(crackLens.x0 / S); X < crackLens.x1 / S; X++) {
      const x = (X + 0.5) * S, z = (Z + 0.5) * S; if (!crackLens.test(x, z)) continue;
      if (h3(X, Z, 3, 1) > 0.7) w.set(X, vx(-2.4), Z, glowC(h3(X, Z, 4, 2) > 0.5 ? A.glow : '#c8a0ff'));
    }
  });
  P.lamp(cc[0], -2.05, cc[1], A.glow, 1.85, 2.4);
  // dressing everywhere else: torches, ferns & flowers at the wall foot, roots, cobwebs, rubble
  const campClear = [{ x: 0, z: 0, r: 2.4 }, { x: 0, z: 3.6, r: 2.0 }, { x: LY.crate[0], z: LY.crate[1], r: 0.9 }, { x: LY.chest[0], z: LY.chest[1], r: 1.0 }, { x: gx, z: gz, r: 1.4 }, { x: fx, z: fzz, r: 1.3 }, { x: LY.anvil[0], z: LY.anvil[1], r: 0.8 }];
  decorateCamp(P, A, r, campClear);
  // pool of mood: the fire is the key light for the crew, with moon and waterfall rims
  const st = P.build(Stage, 'campmenu', 0, { stream: true, tile: 32, sync: [-2.3, 2.3, -2.0, 1.7], syncTop: 2.4, radius: 1e9, poolLights: 0, carryLight: 0, ambI: 0.7, budgetMs: 6, fadeIn: true });
  const hemi = st.lights.find((l) => l.isHemisphereLight);
  if (hemi) { hemi.color.set('#9a90d8'); hemi.groundColor.set('#6a3420'); hemi.intensity = 0.95; }
  const fire = new THREE.PointLight(0xffa040, 7.5, 9, 1.1); fire.position.set(0, 0.85, 0.1);
  fire.castShadow = true; fire.shadow.mapSize.set(512, 512); fire.shadow.bias = -0.002;
  const moon = new THREE.DirectionalLight(new THREE.Color('#8aa8ff'), 0.55); moon.position.set(-2, 7, -3);
  const fill = new THREE.DirectionalLight(new THREE.Color('#e8b8a8'), 0.7); fill.position.set(0.5, 3.5, 7);
  const chestL = new THREE.PointLight(0x7affb0, 0.8, 2.4, 1.6); chestL.position.set(LY.chest[0], 0.6, LY.chest[1] + 0.6);
  st.group.add(fire, moon, fill, chestL); st.lights.push(fire, moon, fill, chestL);
  st.fireLight = fire; st.chestLight = chestL;
  st.updaters.push((dt, t) => { fire.intensity = 7.5 + noise2(t * 6, 3) * 1.6 - 0.8; });
  st.shadowCatcher(-6, 6, ZB, 5.5);
  // fire sparks, pot steam, fireflies, dust motes, drips
  st.emitters.push((dt) => {
    if (rnd.chance(dt * 18)) st.P.add.emit({ pos: [rnd.float(-0.3, 0.3), 0.35, rnd.float(-0.2, 0.2)], vel: [rnd.float(-0.1, 0.1), rnd.float(0.8, 1.5), 0], spread: 0.15, life: [1, 2.4], size: 1, color: ['#ffd27a', '#ff8a3a', '#fff0b0'], colorEnd: '#ff3a00', glow: 3, swirl: 0.8 });
    if (rnd.chance(dt * 4)) st.P.alpha.emit({ pos: [rnd.float(-0.15, 0.15), 0.85, rnd.float(-0.15, 0.15)], vel: [0.04, 0.32, 0], spread: 0.05, life: [2.5, 4], size: [1, 2], sizeEnd: 4, color: '#e8dcd8', alpha: 0.4, fadeIn: 0.5 });
    if (rnd.chance(dt * 3)) st.P.add.emit({ pos: [rnd.float(-5, 5), rnd.float(0.4, 3), rnd.float(-4, 3)], vel: [rnd.float(-0.1, 0.1), 0.05, 0], spread: 0.05, life: [2, 4], size: 1, color: ['#d8ff8a', '#ffe08a', '#9affc8'], glow: 2.5, flicker: 0.6, fadeIn: 0.6, swirl: 0.8 });
    if (rnd.chance(dt * 1.5)) st.P.add.emit({ pos: [LY.chest[0] + rnd.float(-0.4, 0.4), 0.45, LY.chest[1] + 0.4], vel: [0, 0.25, 0.05], spread: 0.04, life: [1.5, 2.5], size: 1, color: ['#7affb0', '#c8ffe0'], glow: 2.6, swirl: 0.5, fadeIn: 0.3 });
    if (rnd.chance(dt * 2)) st.P.add.emit({ pos: [LY.crate[0] + rnd.float(-0.3, 0.3), 0.5, LY.crate[1] + rnd.float(-0.2, 0.3)], vel: [0, 0.03, 0], life: [0.3, 0.8], size: [1, 2], color: ['#ffffff', '#bff4ff', '#ff9af0'], glow: 3, flicker: 0.7 });
  });
  st.ambient(['dust', 'motes']);
  st.focus.set(0, 1.5, -0.5); st.spread.set(5, 2, 3);
  st.fog.density = A.fogD; st.fogDensity = A.fogD;
  // ---- anchors, cameras
  const At = st.anchors;
  At.seats = {};
  for (const id of Object.keys(SEAT)) { const s = SEAT[id]; At.seats[id] = { pos: V(s.x, s.h, s.z), rotY: Math.atan2(-s.x, -s.z), height: s.h, facing: Math.atan2(-s.x, -s.z), standing: s.h === 0 }; }
  At.seatList = ['bran', 'elio', 'durgan', 'clover'].map((id) => At.seats[id]);
  Object.assign(At, {
    fire: V(0, 0, 0), pot: V(0, 0.62, 0), potTop: V(0, 0.82, 0), chest: V(LY.chest[0], 0, LY.chest[1]), chestLid: V(LY.chest[0], 0.5, LY.chest[1] + 0.3),
    petBed: V(LY.petBed[0], 0.06, LY.petBed[1]), mapCrate: V(LY.mapCrate[0], 0.4, LY.mapCrate[1]), books: V(LY.books[0], 0, LY.books[1]),
    anvil: V(LY.anvil[0], 0.68, LY.anvil[1]), crate: V(LY.crate[0], 0.44, LY.crate[1]), sacks: LY.sacks.map(([x, z]) => V(x, 0, z)), bowls: LY.bowls.map(([x, z]) => V(x, 0.05, z)),
    exitTunnel: { pos: V(gx, 0, gz), mouth: V(gx, 0.95, gz - 0.3), deep: V(gx, 0.95, -9.0), yaw: 0, path: new THREE.CatmullRomCurve3([V(0.4, 0.95, 1.2), V(1.6, 0.95, -1.6), V(gx, 0.95, gz + 0.6), V(gx, 0.95, gz - 1.5), V(gx, 0.95, -9.0)]) },
    waterfall: V(fx, 0, fzz), moonHole: V(-2.0, 0, -2.8), center: V(0, 0.8, -0.4),
  });
  const [ca, cb] = LY.crack;
  At.crack = { a: V(ca[0], 0, ca[1]), b: V(cb[0], 0, cb[1]), center: V((ca[0] + cb[0]) / 2, 0, (ca[1] + cb[1]) / 2) };
  At.medusaRise = At.crack.center.clone();
  const menu = { pos: [0.25, 2.05, 5.2], look: [0, 0.48, -0.65], fov: 42 };
  const zoom = {};
  for (const id of Object.keys(At.seats)) {
    const s = At.seats[id].pos, toCam = new THREE.Vector3(menu.pos[0] - s.x, 0, menu.pos[2] - s.z).normalize();
    // chibi heights (A): Bran 0.98, Elio 1.08, Durgan 0.84 (standing), Clover 1.18 with ears; seated heads sit ~0.5 m above the seat
    const head = id === 'durgan' ? 0.66 : s.y + ({ bran: 0.52, elio: 0.56, clover: 0.55 }[id] || 0.54);
    const p = s.clone().addScaledVector(toCam, 1.35).add(V(toCam.z * 0.3, 0, -toCam.x * 0.3));
    zoom[id] = { pos: [p.x, head + 0.26, p.z], look: [s.x, head - 0.1, s.z], fov: 34 };
  }
  st.cams = { menu, zoom, wide: { pos: [0, 3.6, 6.3], look: [0, 0.8, -1.2], fov: 50 }, gate: { pos: [1.2, 1.4, -0.6], look: [gx, 1.0, gz - 2], fov: 44 } };
  st.camera = { ...menu };
  // ---- the floor splitting open (intro): a jagged glowing fissure, broken slabs tipping, a dark mouth
  buildCrack(st, At.crack, A, crackLens);
  return st;
}

function decorateCamp(P, A, r, clear) {
  const L = P.L;
  const isClear = (x, z, pad = 0) => clear.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + pad);
  // walls: torches every few metres, ferns & tufts & flowers at the foot, cobwebs up high
  const walls = [];
  for (let Z = L.Z0; Z < L.Z1; Z += 2) for (let X = L.X0; X < L.X1; X += 2) { const i = L.i(X, Z); if (i >= 0 && L.inside[i] && L.dist[i] === 1 && L.near[i] >= 0) { const j = L.near[i], jx = (j % L.W) + L.X0, jz = Math.floor(j / L.W) + L.Z0; let nx = X - jx, nz = Z - jz; const n = Math.hypot(nx, nz) || 1; walls.push({ x: (X + 0.5) * S, z: (Z + 0.5) * S, nx: nx / n, nz: nz / n, fl: (L.floor[i] + 1) * S, ce: L.ceil[i] * S }); } }
  const picked = [];
  for (let k = 0; k < 400 && picked.length < 9; k++) { const w = walls[Math.floor(r() * walls.length)]; if (w.ce - w.fl < 2.6 || isClear(w.x, w.z, 0.3) || picked.some((p) => Math.hypot(p.x - w.x, p.z - w.z) < 3.4)) continue; picked.push(w); }
  for (const w of picked) { const ax = Math.abs(w.nx) >= Math.abs(w.nz); P.torch(w.x, w.fl + 1.55, w.z, ax ? Math.sign(w.nx) : 0, ax ? 0 : Math.sign(w.nz), A.lamp); }
  const foot = [];
  for (let k = 0; k < 900 && foot.length < 46; k++) { const w = walls[Math.floor(r() * walls.length)]; if (isClear(w.x, w.z, 0.3) || foot.some((p) => Math.hypot(p.x - w.x, p.z - w.z) < 0.6)) continue; foot.push(w); }
  foot.forEach((w, k) => {
    const X = vx(w.x + w.nx * 0.2), Y = vx(w.fl), Z = vx(w.z + w.nz * 0.2), q = r();
    if (q < 0.45) P.op(w.x - 0.6, w.x + 0.6, w.z - 0.6, w.z + 0.6, (wd) => fern(wd, A, X, Y, Z, 8 + Math.round(r() * 6), k + 1, r() < 0.5 ? 3 : 1));
    else if (q < 0.7) P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => tufts(wd, A, X, Y, Z, 10, k, 22));
    else if (q < 0.85) P.op(w.x - 0.6, w.x + 0.6, w.z - 0.6, w.z + 0.6, (wd) => rubble(wd, A, X, Y, Z, 8, k, 5));
    else P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => PR.mushroom(wd, X, Y, Z, 8 + Math.round(r() * 6), PR.CLOTH.salmon, '#ffd27a', k));
  });
  for (let k = 0; k < 8; k++) { const w = walls[Math.floor(r() * walls.length)]; const ax = Math.abs(w.nx) >= Math.abs(w.nz); const X = vx(w.x), Y = vx(w.ce) - 1, Z = vx(w.z); P.op(w.x - 0.5, w.x + 0.5, w.z - 0.5, w.z + 0.5, (wd) => cobweb(wd, X, Y, Z, 12, ax ? Math.sign(w.nx) : 1, ax ? 1 : Math.sign(w.nz), k)); }
  // roots through the vault
  for (let k = 0; k < 16; k++) {
    const x = (r() - 0.5) * 11, z = -3.8 + r() * 9;
    if (isClear(x, z, -1) || !L.isInside(x, z)) continue;
    const ce = L.ceilAt(x, z);
    P.op(x - 0.6, x + 0.6, z - 0.6, z + 0.6, (wd) => roots(wd, A, vx(x), vx(ce) - 1, vx(z), Math.round((ce - 2.3) / S), k + 20, k % 4 === 0 ? A.glow : null));
  }
}
/** The lens of floor that splits: between a and b (metres), widest in the middle, jagged lips. */
function lensOf(a, b) {
  const [ax, az] = a, [bx, bz] = b, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const hw = (t) => 0.1 + 0.5 * Math.sin(Math.PI * t) ** 0.8 + (noise2(t * 18, 3) - 0.5) * 0.12;
  const test = (x, z) => { const t = ((x - ax) * ux + (z - az) * uz) / L, d = (x - ax) * -uz + (z - az) * ux; return t > 0 && t < 1 && Math.abs(d) < hw(t); };
  const pad = 0.7;
  return { test, hw, a, b, L, ux, uz, x0: Math.min(ax, bx) - pad, x1: Math.max(ax, bx) + pad, z0: Math.min(az, bz) - pad, z1: Math.max(az, bz) + pad };
}
// the floor splitting open: loose flagstone pieces over a real pit — crack lines glow, the slabs tip and
// tumble in, light and spores well up from below. st.crackOpen(k), k 0 → 1.
function buildCrack(st, crack, A, lens) {
  const g = new THREE.Group();
  st.group.add(g);
  const NB = 5, pieces = [];
  for (let k = 0; k < NB * 2; k++) pieces.push({ w: new VWorld(), n: 0, sx: 0, sz: 0 });
  const X0 = Math.floor(lens.x0 / S), X1 = Math.ceil(lens.x1 / S), Z0 = Math.floor(lens.z0 / S), Z1 = Math.ceil(lens.z1 / S);
  for (let Z = Z0; Z < Z1; Z++) for (let X = X0; X < X1; X++) {
    const x = (X + 0.5) * S, z = (Z + 0.5) * S;
    if (!lens.test(x, z)) continue;
    const t = ((x - lens.a[0]) * lens.ux + (z - lens.a[1]) * lens.uz) / lens.L, d = (x - lens.a[0]) * -lens.uz + (z - lens.a[1]) * lens.ux;
    const bin = Math.max(0, Math.min(NB - 1, Math.floor((t + (noise2(d * 9, t * 4) - 0.5) * 0.08) * NB))), side = d < (noise2(t * 12, 7) - 0.5) * 0.1 ? 0 : 1;
    const pc = pieces[bin * 2 + side];
    for (let y = -3; y <= -1; y++) pc.w.set(X, y, Z, floorColor(A, X, y, Z, -1 - y, MAT.STONE, 10));
    pc.n++; pc.sx += x; pc.sz += z;
  }
  const rig = st.bakeRig;
  pieces.forEach((pc, k) => {
    if (!pc.n) return;
    const res = meshWorld(pc.w, { light: rig, skip: new Set(), bottomAbove: -1e9 });
    const m = worldMeshes(res, 1.6);
    const cx = pc.sx / pc.n, cz = pc.sz / pc.n;
    for (const c of m.children) c.geometry.translate(-cx, 0, -cz);
    m.position.set(cx, 0, cz);
    const t = ((cx - lens.a[0]) * lens.ux + (cz - lens.a[1]) * lens.uz) / lens.L;
    m.userData = { home: V(cx, 0, cz), side: k & 1 ? 1 : -1, t, spin: ((k * 13) % 7 - 3) * 0.12, fall: Math.abs(t - 0.5) < 0.32 ? 1 : 0.25 };
    g.add(m); pc.mesh = m;
  });
  const slabs = pieces.filter((p) => p.mesh).map((p) => p.mesh);
  const nrm = V(-lens.uz, 0, lens.ux), a = crack.a, b = crack.b;
  // glowing crack lines across the slabs (before they part)
  const N = 26, pos = [], idx = [];
  for (let i = 0; i <= N; i++) { const t = i / N, j = (Math.sin(t * 23.1) + Math.sin(t * 11.7)) * 0.05; const p = a.clone().lerp(b, t).addScaledVector(nrm, j); pos.push(p.x, 0.014, p.z, p.x, 0.014, p.z); }
  for (let i = 0; i < N; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const base = pos.slice();
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(A.glow).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const gash = new THREE.Mesh(geo, glowM); gash.renderOrder = 6; gash.layers.set(LAYER_FX); gash.visible = false; g.add(gash);
  // light from the depths (for the figure climbing out) and on the slabs' undersides
  const light = new THREE.PointLight(new THREE.Color(A.glow), 0, 5, 1.2); light.position.copy(crack.center).setY(-1.0); g.add(light);
  const lip = new THREE.PointLight(new THREE.Color(A.glow), 0, 3.2, 1.4); lip.position.copy(crack.center).setY(0.35); g.add(lip);
  st.lights.push(light, lip);
  st.crackK = 0;
  st.crackOpen = (k) => {
    k = Math.max(0, Math.min(1, k));
    st.crackK = k;
    // 0 → 0.35: hairline cracks glow and widen, slabs shiver
    const k1 = Math.min(1, k / 0.35), k2 = Math.max(0, (k - 0.35) / 0.65);
    gash.visible = k > 0 && k < 0.85;
    const wd = 0.004 + k1 * 0.045, p = geo.attributes.position;
    for (let i = 0; i <= N; i++) { const t = i / N, taper = Math.sin(t * Math.PI) ** 0.6, jw = wd * taper * (0.7 + 0.3 * Math.sin(t * 37)); p.setXYZ(i * 2, base[i * 6] + nrm.x * jw, 0.014, base[i * 6 + 2] + nrm.z * jw); p.setXYZ(i * 2 + 1, base[i * 6 + 3] - nrm.x * jw, 0.014, base[i * 6 + 5] - nrm.z * jw); }
    p.needsUpdate = true;
    glowM.opacity = Math.min(1, k1 * 1.5) * (1 - Math.max(0, (k - 0.6) / 0.25));
    // 0.35 → 1: the slabs part along the lips, the middle ones tumble into the pit
    for (const m of slabs) {
      const u = m.userData, e = Math.max(0, Math.min(1, k2 * 1.4 - Math.abs(u.t - 0.5) * 0.6));
      const shiver = k1 < 1 && k > 0 ? (Math.sin(performance.now() * 0.05 + u.t * 40) * 0.004) : 0;
      m.position.copy(u.home).addScaledVector(nrm, u.side * e * 0.22);
      m.position.y = shiver + (e > 0 ? -(e * e) * 2.3 * u.fall + e * 0.04 : 0);
      m.rotation.set(u.spin * e * 2, 0, 0);
      m.rotateOnWorldAxis(V(lens.ux, 0, lens.uz), u.side * e * (1.1 + u.fall * 0.8));
      m.visible = m.position.y > -2.3;
    }
    light.intensity = k * 4.5; lip.intensity = k1 * 1.6;
    if (k > 0.02 && k < 1 && rnd.chance(0.6)) {
      const t = rnd.float(0.1, 0.9), q = a.clone().lerp(b, t);
      st.P.alpha.emit({ pos: [q.x, 0.04, q.z], vel: [rnd.float(-0.3, 0.3), rnd.float(0.4, 1.2), rnd.float(-0.3, 0.3)], spread: 0.1, life: [0.6, 1.2], size: [1, 2], gravity: -6, color: ['#665462', '#84707a', '#3a3036'], alpha: 0.95 });
      st.P.add.emit({ pos: [q.x, k2 > 0 ? -0.4 : 0.04, q.z], vel: [0, rnd.float(0.5, 1.3), 0], spread: 0.15, life: [0.8, 1.8], size: [1, 2], color: [A.glow, '#e0fff0', '#c8a0ff'], glow: 3, swirl: 0.6 });
    }
  };
  st.crackOpen(0);
}

/** Rest nook of the delve (third-person camp scene): fire, pot, anvil, seats for the hero + 3 friends + Pip. */
export function buildCampsite(Stage, act = 0) {
  const A = { ...ACT_STYLES[Math.max(0, Math.min(3, act | 0))] };
  A.fogD = 0.04;
  const L = new Layout(-4.6, 4.6, -3.6, 4.2);
  const ceil = (x, z) => { let c = 3.0 + 1.1 * Math.sqrt(Math.max(0, 1 - (x / 4.6) ** 2)); if (Math.abs(((z % 2.6) + 2.6) % 2.6 - 1.3) < 0.12) c -= 0.2; return c; };
  L.carve(-4.3, 4.3, -3.3, 4.2, (x, z) => (x / 4.3) ** 2 + ((z - 0.4) / 3.8) ** 2 < 1 || z > 1.5, 0, ceil, MAT.STONE, act === 3 ? 2 : 0);
  L.edit(-1, 1, -1, 1, (x, z) => Math.hypot(x, z) < 0.9, { mat: MAT.EARTH });
  if (act === 1) L.edit(-4.3, -2.6, -2.8, -1.0, (x, z) => ((x + 3.4) / 0.9) ** 2 + ((z + 1.9) / 0.8) ** 2 < 1, { floor: -0.3, mat: MAT.WATER });
  if (act === 2) L.edit(2.6, 4.3, -2.6, -0.8, (x, z) => ((x - 3.4) / 0.8) ** 2 + ((z + 1.7) / 0.8) ** 2 < 1, { floor: -0.14, mat: MAT.LAVA });
  L.finish();
  const P = new Piece(L, A, 900 + act);
  const r = (() => { let s = 300 + act; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
  P.op(-1, 1, -1, 1, (w) => { PR.firepit(w, 0, 0, 0, 13); PR.cookpot(w, 0, 0, 0, 30); });
  P.flame(0, 0.06, 0.05, 1.5, 'fire');
  P.lamp(0, 0.75, 0, '#ffa040', 6, 1.8);
  // seats: hero (front-left), three friends around the back, Pip by the fire
  const seats = [[-1.45, 0.45, 'z'], [-0.95, -1.2, 'x'], [0.95, -1.2, 'x'], [1.5, 0.45, 'z']];
  seats.forEach(([sx, sz, ax], k) => P.op(sx - 0.8, sx + 0.8, sz - 0.8, sz + 0.8, (w) => (ax === 'z' ? logZ(w, vx(sx), 0, vx(sz), 22, 2.25, k) : PR.logSeat(w, vx(sx), 0, vx(sz), 22, 2.25, k))));
  P.op(1.8, 3.4, 1.0, 2.2, (w) => PR.anvil(w, vx(2.6), 0, vx(1.6)));
  P.op(-3.4, -1.8, 1.0, 2.6, (w) => { PR.bedroll(w, vx(-2.9), 0, vx(1.5), PR.CLOTH.salmon, 1); PR.sack(w, vx(-2.2), 0, vx(2.4), 1, PR.CLOTH.cream, [C(A.ore[0]), C(A.ore[1])]); });
  if (act === 1) { P.water(-4.3, -2.5, -2.8, -1.0, -0.06); P.op(-4.3, -2.5, -2.8, -1, (w) => crystalCluster(w, vx(-3.6), -6, vx(-2.1), 26, A.crystal, 4, 5)); P.lamp(-3.4, 0.5, -1.9, A.crystal, 3, 1.2); }
  if (act === 2) { P.lava(2.5, 4.3, -2.6, -0.8, -0.1); P.lamp(3.4, 0.3, -1.7, '#ff6a1a', 3, 1.3); }
  if (act === 3) P.op(2.6, 4.2, -3.2, -1.6, (w) => PR.vine(w, vx(3.4), vx(3.6), vx(-2.4), 60, A.leaf.slice(1, 4), 3, A.flowers[1]));
  decorateCamp(P, A, r, [{ x: 0, z: 0, r: 2.1 }, { x: 0, z: 3, r: 1.6 }, { x: 2.6, z: 1.6, r: 0.8 }]);
  const st = P.build(Stage, 'campsite', act, { stream: false, poolLights: 0, carryLight: 0, ambI: 0.7 });
  const fire = new THREE.PointLight(0xffa040, 6.5, 8, 1.1); fire.position.set(0, 0.8, 0.1);
  fire.castShadow = true; fire.shadow.mapSize.set(512, 512); fire.shadow.bias = -0.002;
  const fill = new THREE.DirectionalLight(new THREE.Color('#e8b8a8'), 0.6); fill.position.set(0.5, 3.5, 6);
  st.group.add(fire, fill); st.lights.push(fire, fill); st.fireLight = fire;
  st.updaters.push((dt, t) => { fire.intensity = 6.5 + noise2(t * 6, 5) * 1.4 - 0.7; });
  st.shadowCatcher(-4, 4, -3, 3.6);
  st.emitters.push((dt) => {
    if (rnd.chance(dt * 16)) st.P.add.emit({ pos: [rnd.float(-0.25, 0.25), 0.35, rnd.float(-0.2, 0.2)], vel: [rnd.float(-0.1, 0.1), rnd.float(0.8, 1.4), 0], spread: 0.15, life: [1, 2.2], size: 1, color: ['#ffd27a', '#ff8a3a', '#fff0b0'], colorEnd: '#ff3a00', glow: 3, swirl: 0.8 });
    if (rnd.chance(dt * 3)) st.P.alpha.emit({ pos: [rnd.float(-0.12, 0.12), 0.8, rnd.float(-0.12, 0.12)], vel: [0.04, 0.3, 0], spread: 0.05, life: [2.5, 4], size: [1, 2], sizeEnd: 4, color: '#e8dcd8', alpha: 0.35, fadeIn: 0.5 });
  });
  st.ambient(['dust', 'motes']);
  st.focus.set(0, 1.2, -0.4); st.spread.set(3.5, 1.6, 2.5);
  const At = st.anchors;
  At.seats = seats.map(([sx, sz]) => ({ pos: V(sx, 0.18, sz), rotY: Math.atan2(-sx, -sz), height: 0.18 }));
  Object.assign(At, { fire: V(0, 0, 0), pot: V(0, 0.55, 0), anvil: V(2.6, 0.68, 1.6), pet: V(0.55, 0, 0.95), hero: At.seats[0], center: V(0, 0.6, -0.3) });
  st.cams = { main: { pos: [0.2, 1.9, 4.2], look: [0, 0.45, -0.5], fov: 44 }, pot: { pos: [0.9, 1.2, 1.3], look: [0, 0.55, 0], fov: 40 }, anvil: { pos: [1.4, 1.3, 3.0], look: [2.6, 0.7, 1.6], fov: 40 } };
  st.camera = { ...st.cams.main };
  return st;
}

void cyl; void seg;
