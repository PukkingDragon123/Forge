// Forged weapons as voxel models on the party's fine grid (0.02 world units, the same as the
// explorers who hold them), built like ornate pixel-art swords: a honed bright edge and a bevel
// beside a dark etched fuller, runes in the fuller that glow with the weapon's element, guards that
// widen and curl with the grade, gem-set pommels, spiral-wrapped grips, and on masterworks gold
// wings, langets and filigree. Bone blades are notched, crystal ones faceted, star-iron holds stars,
// magmasteel runs with molten seams. The look comes from the ingredients.
// Plus the curse: glowing cracks, and a shatter into voxel shards.
import * as THREE from 'three';
import { LAYER_FX } from '../gfx/renderer.js';
import { MATERIALS } from '../data/materials.js';
import { VPart, VOX_PARTY, rgb, mix, mul, hash, voxToon, voxGlow } from './vox_char_kit.js';

/** World size of one weapon voxel: the party's grid, so a held weapon matches its explorer. */
const WVS = VOX_PARTY;
const ELEMENT_GLOW = { fire: '#ff7a2a', ice: '#7fe3ff', shock: '#ffe74a', poison: '#8fe04a', curse: '#c86bff', holy: '#fff3b0', bleed: '#ff4f6a' };
const METAL_TINT = {
  iron: '#b8bec8', copper: '#d8844a', tin: '#c8ccd4', silver: '#e8eef8', gold: '#ffd04a', mithril: '#bff4ff', stariron: '#4a4a7a',
  magmasteel: '#ff7a3a', bronze_ancient: '#c8963a', lodestone: '#5a5a6e', cursedore: '#8a4ac0', obsidian: '#2e2240', junk: '#8a7a6a',
};
const WRAP = { spider_silk: '#f0f0ff', bat_wing: '#5a3a5a', rat_tail: '#c88a8a', toad_tongue: '#c86a7a', mimic_tongue: '#ff6a9a', feather: '#c8b8a0', moth_dust: '#e0d0ff' };

const m3 = (id) => MATERIALS[id] || null;
const tagged = (id, t) => !!(m3(id) && m3(id).tags.includes(t));

/** Derive colours & decorations from a weapon description. */
export function weaponLook(w) {
  const ids = w.ids || [];
  const solids = ids.filter((id) => tagged(id, 'solid'));
  const metals = ids.filter((id) => tagged(id, 'metal')).sort((a, b) => m3(b).value - m3(a).value);
  const gems = ids.filter((id) => tagged(id, 'gem'));
  const bones = ids.filter((id) => tagged(id, 'bone'));
  let blade = '#9aa0aa', bladeKind = 'metal';
  if (metals.length) {
    blade = METAL_TINT[metals[0]] || m3(metals[0]).color;
    if (metals[0] === 'iron' && ids.includes('coal')) blade = '#cfd6e2'; // steel
    if (ids.includes('gold') && ids.includes('silver')) blade = '#f4e6a8'; // electrum
  } else if (gems.length) { blade = m3(gems[0]).color; bladeKind = 'crystal'; }
  else if (bones.length) { blade = '#efe6d0'; bladeKind = 'bone'; }
  else if (solids.length) blade = m3(solids[0]).color;
  const second = metals.find((id) => id !== metals[0]) || solids.find((id) => id !== metals[0]);
  let trim = second ? (METAL_TINT[second] || m3(second).color) : '#8a6a3a';
  if (w.grade >= 4) trim = '#ffcf4a';
  const gem = gems.length ? m3(gems[0]).color : ids.includes('golem_core') ? '#ffb84a' : null;
  const wrapId = ids.find((id) => WRAP[id]);
  const wrap = wrapId ? WRAP[wrapId] : bones.length && bladeKind !== 'bone' ? '#efe6d0' : '#5a3a24';
  const el = w.el || {};
  const els = Object.keys(ELEMENT_GLOW).filter((e) => (el[e] || 0) > 0).sort((a, b) => el[b] - el[a]);
  return {
    blade, bladeDark: new THREE.Color(blade).multiplyScalar(0.6).getStyle(), bladeKind, trim, gem, wrap,
    glow: els.length ? ELEMENT_GLOW[els[0]] : null, glow2: els.length > 1 ? ELEMENT_GLOW[els[1]] : null,
    power: els.length ? el[els[0]] : 0,
    fangs: ids.filter((id) => tagged(id, 'fang')).length, core: ids.includes('golem_core') || ids.includes('lava_core'),
    masterwork: w.grade >= 4, grade: w.grade || 0, star: ids.includes('stariron'), magma: ids.includes('magmasteel'),
  };
}

// ------------------------------------------------------------------ palettes from the look
// Ramps run [deep, shade, base, light, gleam]; tones are flat so the mesher can merge them.
const rampOf = (c) => [mul(c, 0.36), mul(c, 0.6), rgb(c), mix(c, '#ffffff', 0.42), mix(c, '#ffffff', 0.78)];
const pick = (R, t) => R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1))))];
function pal(L) {
  return {
    blade: rampOf(L.blade), trim: rampOf(L.trim), wrap: rampOf(L.wrap),
    wood: [rgb('#2e1a0e'), rgb('#4a2e1a'), rgb('#6a4428'), rgb('#8a5c36'), rgb('#aa7a4c')],
    gem: L.gem ? rampOf(L.gem) : null,
    bone: [rgb('#8a7a5a'), rgb('#c0b088'), rgb('#e2d6b8'), rgb('#f4ecda'), rgb('#ffffff')],
  };
}
const glowOf = (c) => ({ glow: true, c });
/** The inscription down a fuller: an irregular run of glyph marks, offset between the two columns. */
const RUNE = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1];
const runeAt = (row, col) => RUNE[(row + col * 5 + 120) % RUNE.length];

// ------------------------------------------------------------------ shared pieces (weapon voxel units; the grip runs up x,z ∈ [-1,0])
/** A spiral-wrapped grip from y0 to y1, two voxels square with rounded binding. */
function grip(H, Q, y0, y1) {
  for (let y = y0; y < y1; y++) for (let x = -2; x < 2; x++) for (let z = -2; z < 2; z++) {
    const ex = x === -2 || x === 1, ez = z === -2 || z === 1;
    if (ex && ez) continue;
    const turn = ((y + (x + z + 4) * 0.5) | 0) % 3 === 0;
    H.set(x, y, z, pick(Q.wrap, turn ? 0.25 : ex || ez ? 0.5 : 0.6));
  }
}
/** Wooden haft with grain, from y0 to y1. */
function haft(H, Q, y0, y1, r = 1.6) { H.cap([0, y0, 0], [0, y1, 0], r, r, (x, y, z) => pick(Q.wood, hash(x, y >> 2, z, 9) > 0.8 ? 0.25 : (y * 3 + x) % 7 === 0 ? 0.35 : 0.5)); }
/** A ring of trim around the shaft between y0 and y1. */
function collar(H, Q, y0, y1, r = 2.6) { H.cap([0, y0, 0], [0, y1, 0], r, r, (x, y) => pick(Q.trim, y === Math.ceil(y1) - 1 ? 0.75 : 0.5), false, { flat: true }); }
/** A pommel: a gem held in trim claws, or a faceted knob. */
function pommel(H, Q, L, y) {
  H.ell(0, y, 0, 2.6, 2.4, 2.6, (x, yy) => pick(Q.trim, yy > y - 0.5 ? 0.7 : 0.45));
  if (Q.gem) { H.ell(0, y - 0.5, 0, 1.8, 1.8, 2.8, (x, yy, z, d) => glowOf(pick(Q.gem, d < 0.4 ? 0.9 : 0.6))); }
  H.cap([0, y - 2, 0], [0, y - 4, 0], 1.6, 0.7, () => pick(Q.trim, L.masterwork ? 0.9 : 0.6));
}
/**
 * A blade along +Y from y0, len rows, half-width w(k) (k = 0..1 along it), two voxels thick. Columns:
 * honed edge, bevel, body, etched fuller (runes when elemental), body, bevel, back edge.
 */
function blade(B, L, Q, y0, len, w, o = {}) {
  const cx = o.cx || (() => 0);
  for (let i = 0; i < len; i++) {
    const y = y0 + i, k = i / len, hw = w(k), c = cx(k);
    if (hw <= 0.2) continue;
    for (let x = Math.floor(c - hw); x < Math.ceil(c + hw); x++) {
      const dx = x + 0.5 - c;
      if (Math.abs(dx) > hw) continue;
      const fromL = dx + hw, fromR = hw - dx;
      const role = fromL < 1.05 ? 'edge' : fromR < 1.05 ? 'back' : fromL < 2.05 || fromR < 2.05 ? 'bevel' : Math.abs(dx) < 1.01 && k > 0.06 && k < (o.fuller ?? 0.72) ? 'fuller' : 'body';
      if (L.bladeKind === 'bone' && role === 'edge' && i % 4 === 3) continue; // a notched bone edge
      let col;
      if (L.bladeKind === 'crystal') col = pick(Q.blade, role === 'edge' ? 1 : ((x + y + 30) % 5 < 2 ? 0.75 : 0.5) + (role === 'fuller' ? -0.25 : 0));
      else if (L.bladeKind === 'bone') col = pick(Q.bone, role === 'edge' ? 0.75 : role === 'fuller' ? 0.25 : (y % 5 === 0 ? 0.3 : 0.5));
      else col = pick(Q.blade, role === 'edge' ? 1 : role === 'back' ? 0.75 : role === 'bevel' ? 0.75 : role === 'fuller' ? 0.25 : 0.5);
      for (const z of [-1, 0]) {
        let v = col;
        if (role === 'fuller') {
          const col2 = x + 0.5 - c < 0 ? 0 : 1;
          if (L.masterwork && k < 0.16) v = Q.gem && i === 2 ? glowOf(pick(Q.gem, 0.85)) : pick(Q.trim, (i + col2) % 2 ? 0.75 : 1);
          else if (L.glow && runeAt(i, col2)) v = glowOf((i >> 3) & 1 && L.glow2 ? L.glow2 : i % 3 === 0 ? mix(L.glow, '#ffffff', 0.4) : L.glow);
          else if (L.magma && hash(x, y, 0, 3) > 0.5) v = glowOf(hash(x, y, 1) > 0.5 ? '#ff7a2a' : '#ffc04a');
          else if (L.star && hash(x, y, 2) > 0.8) v = glowOf('#ffe8a0');
          else if (L.bladeKind === 'crystal' && i % 3 === 1) v = glowOf(pick(Q.blade, 0.9));
          else if (!L.glow && runeAt(i, col2) && L.grade >= 2) v = pick(Q.blade, 0.1); // etched, unlit
        } else if (role === 'edge' && L.glow && L.power >= 4 && hash(x, y, 2) > 0.72) v = glowOf(mix(L.glow, '#ffffff', 0.35));
        B.set(x, y, z, v);
      }
    }
  }
  if (L.fangs) for (let f = 0; f < Math.min(3, L.fangs); f++) {
    const k = 0.2 + f * 0.22, y = y0 + Math.round(k * len), x = Math.floor(cx(k) - w(k)) - 1;
    B.cap([x + 1, y, -0.5], [x - 2.5, y + 3, -0.5], 1.1, 0.3, (xx, yy, zz, t) => pick(Q.bone, 0.5 + t * 0.5));
  }
  return y0 + len;
}
/** A crossguard bar across y0..y0+1 of half-width hw, curling up at the tips with the grade. */
function guard(H, Q, L, y0, hw) {
  for (let x = -hw; x < hw; x++) for (let y = y0; y < y0 + 2; y++) for (let z = -2; z < 2; z++) {
    const ax = Math.abs(x + 0.5), centre = ax < 2.6;
    if (!centre && (z === -2 || z === 1)) continue;
    H.set(x, y, z, pick(Q.trim, y > y0 ? 0.75 : 0.5) );
  }
  if (Q.gem) for (const z of [-2, 1]) for (const x of [-1, 0]) for (const y of [y0, y0 + 1]) H.set(x, y, z + (z < 0 ? -1 : 1), glowOf(pick(Q.gem, y > y0 ? 0.9 : 0.7)));
  else for (const z of [-3, 2]) H.ell(-0, y0 + 1, z + 0.5, 1.4, 1.4, 0.8, pick(Q.trim, 0.9));
  if (L.grade >= 2) for (const sx of [-1, 1]) H.cap([sx * (hw - 0.5), y0 + 1, -0.5], [sx * (hw + 0.6), y0 + 4, -0.5], 1.1, 0.7, () => pick(Q.trim, 0.9));
  if (L.masterwork) for (const sx of [-1, 1]) {
    H.cap([sx * (hw + 0.6), y0 + 4, -0.5], [sx * (hw - 0.8), y0 + 6.5, -0.5], 0.8, 0.5, () => pick(Q.trim, 1)); // the curl turns back in
    H.cap([sx * 3.5, y0 + 1.5, -0.5], [sx * 4.8, y0 + 4.5, -0.5], 0.9, 0.5, () => pick(Q.trim, 0.8)); // wings by the ricasso
    H.cap([sx * 1.6, y0, -0.5], [sx * 1.6, y0 - 3, -0.5], 0.8, 0.6, () => pick(Q.trim, 0.6)); // langets down the grip
  }
}

// ------------------------------------------------------------------ builders: return { hilt: VPart, blade: VPart, tip }
const BUILD = {
  sword(L, Q) {
    const H = new VPart(), B = new VPart();
    grip(H, Q, -8, 0);
    pommel(H, Q, L, -9.5);
    guard(H, Q, L, 0, L.masterwork ? 9 : L.grade >= 2 ? 7.5 : 6);
    const tip = blade(B, L, Q, 2, 32, (k) => (k < 0.08 ? 3.1 : k < 0.74 ? 4 - k * 0.6 : (3.55) * (1 - (k - 0.74) / 0.26)));
    return { hilt: H, blade: B, tip: tip * WVS };
  },
  dagger(L, Q) {
    const H = new VPart(), B = new VPart();
    grip(H, Q, -6, 0);
    pommel(H, Q, L, -7.5);
    guard(H, Q, L, 0, 4.5);
    const tip = blade(B, L, Q, 2, 15, (k) => (k < 0.66 ? 3.2 - k * 0.6 : 2.8 * (1 - (k - 0.66) / 0.34) + 0.1), { cx: (k) => k * k * 2, fuller: 0.6 });
    return { hilt: H, blade: B, tip: tip * WVS };
  },
  axe(L, Q) {
    const H = new VPart(), B = new VPart();
    haft(H, Q, -18, 33);
    grip(H, Q, -10, 2);
    H.ell(0, -19, 0, 2.4, 1.6, 2.4, () => pick(Q.trim, 0.6));
    collar(H, Q, 22, 24); collar(H, Q, 30, 32);
    if (Q.gem) for (const z of [-3, 2]) H.ell(-0, 27, z + 0.5, 1.3, 1.5, 0.8, (x, y, zz, d) => glowOf(pick(Q.gem, d < 0.4 ? 0.9 : 0.6)));
    // a bearded bit flaring to a long bright edge
    for (let x = 2; x <= 13; x++) {
      const k = (x - 2) / 11, top = 31 + Math.round(k * 2 + k * k * 2), bot = 23 - Math.round(k * k * 9);
      for (let y = bot; y <= top; y++) for (const z of [-1, 0]) {
        const edge = x >= 12, bev = x === 11, k2 = (y - bot) / Math.max(1, top - bot);
        let v = L.bladeKind === 'bone' ? pick(Q.bone, edge ? 0.75 : 0.5) : pick(Q.blade, edge ? 1 : bev ? 0.75 : x < 4 ? 0.25 : 0.5);
        if (x === 6 && y >= 25 && y <= 29 && L.glow && runeAt(y, 0)) v = glowOf(L.glow);
        else if (x === 6 && y >= 25 && y <= 29 && L.grade >= 2 && runeAt(y, 0)) v = pick(Q.blade, 0.1);
        if (edge && L.glow && L.power >= 4 && hash(x, y, 2) > 0.72) v = glowOf(mix(L.glow, '#ffffff', 0.35));
        if (L.masterwork && x === 3 && (y === bot || y === top)) v = pick(Q.trim, 1);
        if (k2 < 0 || k2 > 1) continue;
        B.set(x, y, z, v);
      }
    }
    for (let y = 24; y <= 30; y++) for (const x of [1, -2]) for (const z of [-2, 1]) B.set(x, y, z, pick(Q.blade, 0.25));
    B.cap([-2, 27, -0.5], [-7, 26.5, -0.5], 1.8, 0.4, (x, y, z, t) => pick(Q.blade, t > 0.7 ? 1 : 0.5)); // the back spike
    if (L.fangs) B.cap([-1, 32, -0.5], [-3, 36, -0.5], 1, 0.3, () => pick(Q.bone, 0.75));
    return { hilt: H, blade: B, tip: 36 * WVS };
  },
  hammer(L, Q) {
    const H = new VPart(), B = new VPart();
    haft(H, Q, -17, 24, 1.8);
    grip(H, Q, -10, 2);
    H.ell(0, -18, 0, 2.4, 1.6, 2.4, () => pick(Q.trim, 0.6));
    collar(H, Q, 19, 21, 2.8);
    // an octagonal head: banded collars, bright striking faces, a stone or a golem core
    for (let x = -9; x < 9; x++) for (let y = 21; y < 32; y++) for (let z = -5; z < 5; z++) {
      const dy = y + 0.5 - 26.5, dz = z + 0.5;
      if (Math.abs(dy) + Math.abs(dz) > 7.6) continue;
      const ax = Math.abs(x + 0.5), face = ax > 8, band = ax > 5.5 && ax < 7.5;
      let v = band ? pick(Q.trim, dy > 0 ? 0.75 : 0.5) : pick(Q.blade, face ? 1 : dy > 2 ? 0.75 : dy < -3 ? 0.25 : 0.5);
      if (face && L.glow && (y + z) % 3 === 0) v = glowOf(L.glow);
      B.set(x, y, z, v);
    }
    if (L.core) B.ell(-0, 26.5, 4.5, 2.6, 2.6, 1.4, (x, y, z, d) => glowOf(d < 0.35 ? '#fff0b0' : '#ffb84a'));
    else if (Q.gem) for (const z of [-5, 4]) B.ell(-0, 26.5, z + 0.5, 1.8, 1.8, 1, (x, y, zz, d) => glowOf(pick(Q.gem, d < 0.4 ? 0.9 : 0.6)));
    if (L.masterwork) for (const x of [-5, -1, 3]) B.cap([x + 0.5, 32, -0.5], [x + 0.5, 34, -0.5], 1, 0.5, () => pick(Q.trim, 1));
    if (L.fangs) for (const x of [-6, 6]) B.cap([x, 32, -0.5], [x, 36, -0.5], 1.1, 0.3, () => pick(Q.bone, 0.75));
    return { hilt: H, blade: B, tip: 34 * WVS };
  },
  spear(L, Q) {
    const H = new VPart(), B = new VPart();
    haft(H, Q, -22, 45, 1.5);
    grip(H, Q, -8, 4);
    H.ell(0, -23, 0, 2.2, 1.6, 2.2, () => pick(Q.trim, 0.6));
    collar(H, Q, 42, 46, 2.4);
    if (Q.gem) H.ell(-0, 44, 2.5, 1.2, 1.4, 1, (x, y, z, d) => glowOf(pick(Q.gem, 0.8)));
    // a tassel hanging from the socket
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      H.cap([Math.cos(a) * 2, 42, Math.sin(a) * 2], [Math.cos(a) * 3, 36 - (i % 3), Math.sin(a) * 3], 0.7, 0.55, () => (L.glow ? mix(L.glow, '#6a1010', 0.5) : rgb(i % 2 ? '#c8402a' : '#9a2a1a')));
    }
    const tip = blade(B, L, Q, 46, 20, (k) => (k < 0.15 ? 1.4 + k * 14 : k < 0.5 ? 3.5 : 3.5 * (1 - (k - 0.5) / 0.5) + 0.2), { fuller: 0.75 });
    if (L.masterwork) for (const sx of [-1, 1]) B.cap([sx * 3, 48, -0.5], [sx * 5.5, 46, -0.5], 0.8, 0.4, () => pick(Q.trim, 1));
    return { hilt: H, blade: B, tip: tip * WVS };
  },
  staff(L, Q) {
    const H = new VPart(), B = new VPart();
    // a gnarled shaft wandering up, knotted
    const pts = [];
    for (let y = -22; y <= 30; y += 4) pts.push([Math.sin(y * 0.16) * 1.2, y, Math.cos(y * 0.13) * 0.6, 1.8 + ((y + 22) % 16 === 0 ? 0.7 : 0)]);
    H.path(pts, (x, y, z) => pick(Q.wood, hash(x, y >> 1, z, 4) > 0.82 ? 0.25 : (y & 3) ? 0.5 : 0.75));
    grip(H, Q, -6, 4);
    const [tx, , tz] = pts[pts.length - 1];
    collar(H, Q, 29, 31, 2.6);
    // roots curling up around a cut orb
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4, ca = Math.cos(a), sa = Math.sin(a);
      H.path([[tx + ca * 1.5, 30, tz + sa * 1.5, 1.2], [tx + ca * 4.8, 34, tz + sa * 4.8, 1], [tx + ca * 4.4, 39, tz + sa * 4.4, 0.8], [tx + ca * 1.4, 42, tz + sa * 1.4, 0.5]], () => pick(Q.wood, 0.5));
    }
    const O = rampOf(L.glow || L.gem || L.blade);
    B.ell(tx, 36.5, tz, 3.6, 4, 3.6, (x, y, z, d) => glowOf(pick(O, d < 0.3 ? 1 : d < 0.65 ? 0.75 : (x + y + z) & 1 ? 0.5 : 0.25)));
    return { hilt: H, blade: B, tip: 43 * WVS, orb: true };
  },
  pickaxe(L, Q) {
    const H = new VPart(), B = new VPart();
    haft(H, Q, -16, 27);
    grip(H, Q, -9, 1);
    H.ell(0, -17, 0, 2.4, 1.6, 2.4, () => pick(Q.trim, 0.6));
    collar(H, Q, 21, 23);
    if (Q.gem) H.ell(-0, 22, 2.5, 1.2, 1.2, 1, () => glowOf(pick(Q.gem, 0.8)));
    // two picks, square in section, curving down to bright points
    for (const sx of [-1, 1]) {
      let prev = [0, 25];
      for (let i = 1; i <= 10; i++) {
        const t = i / 10, x = sx * (1 + t * 13), y = 25 + Math.sin(t * Math.PI * 0.9) * 2 - t * t * 6;
        const r = 2.3 * (1 - t) + 0.5;
        B.cap([prev[0], prev[1], -0.5], [x, y, -0.5], r + 0.2, r, (xx, yy) => pick(Q.blade, t > 0.85 ? 1 : yy > y ? 0.75 : 0.5));
        prev = [x, y];
      }
      if (L.glow) B.ell(sx * 6, 26, -0.5, 1, 1, 1.6, () => glowOf(L.glow));
    }
    B.ell(-0, 25, -0.5, 2.8, 2.6, 2.8, () => pick(Q.blade, 0.25));
    return { hilt: H, blade: B, tip: 28 * WVS };
  },
};

// ------------------------------------------------------------------ build + cache
const CACHE = new Map();
/**
 * Build a weapon. w = { bp, ids, el?, grade?, recipe? }. Grip at origin, blade along +Y.
 * Returns THREE.Group (userData: look, tip, bladeMats, sparkle?, orb?).
 */
export function buildWeaponMesh(w = {}) {
  const g = new THREE.Group();
  g.name = 'weapon_' + (w.bp || 'sword');
  const L = weaponLook(w);
  const key = JSON.stringify([w.bp, w.ids, w.el, w.grade]);
  let G = CACHE.get(key);
  if (!G) {
    const Q = pal(L);
    const r = (BUILD[w.bp] || BUILD.sword)(L, Q);
    G = { hilt: r.hilt.geometry(WVS, [0, 0, 0], { glowIntensity: 2.4 }), blade: r.blade.geometry(WVS, [0, 0, 0], { glowIntensity: 2.6 }), tip: r.tip, orb: r.orb };
    CACHE.set(key, G);
    if (CACHE.size > 60) CACHE.delete(CACHE.keys().next().value);
  }
  const hiltMat = voxToon(), bladeMat = voxToon(), glowMat = voxGlow();
  const add = (geo, mat, breakable) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.castShadow = !!(mat !== glowMat); m.userData.breakable = breakable; g.add(m); return m; };
  add(G.hilt.solid, hiltMat, false); add(G.hilt.glow, glowMat, false);
  const blade = add(G.blade.solid, bladeMat, true); const bg = add(G.blade.glow, glowMat, true);
  if (G.orb && bg) { g.userData.orb = bg; bg.castShadow = false; }
  g.userData.look = L;
  g.userData.tip = G.tip;
  g.userData.bladeMats = [bladeMat, hiltMat];
  if (blade) blade.userData.len = G.tip;
  if (L.masterwork) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe08a').multiplyScalar(2.5), fog: false }));
    s.position.set(0, G.tip * 0.97, 0.02); s.castShadow = false;
    g.add(s);
    g.userData.sparkle = s;
  }
  return g;
}

// ------------------------------------------------------------------ the curse: cracks & shatter
function rngFrom(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0) / 4294967296; }

/** Spread glowing purple cracks over the weapon (amount 0..1). Idempotent; call every frame if you like. */
export function crackWeapon(group, amount = 0.5) {
  const ud = group.userData;
  if (!ud.cracks) {
    const r = rngFrom(group.id * 7919 + 13);
    const tip = ud.tip || 0.6;
    const breakables = [];
    group.traverse((o) => { if (o.isMesh && o.userData.breakable && o.geometry.attributes.color) breakables.push(o); });
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color('#d070ff').multiplyScalar(2.6), transparent: true, depthWrite: false, fog: false });
    ud.cracks = [];
    for (let i = 0; i < 12; i++) {
      const host = breakables[i % Math.max(1, breakables.length)];
      const box = new THREE.Box3();
      if (host) { host.geometry.computeBoundingBox(); box.copy(host.geometry.boundingBox); }
      else box.set(new THREE.Vector3(-0.03, 0.1, -0.01), new THREE.Vector3(0.03, tip, 0.01));
      // jagged voxel-step cracks across the face
      const pts = [];
      const s = WVS;
      let x = Math.round((box.min.x + r() * (box.max.x - box.min.x)) / s) * s, y = Math.round((box.min.y + r() * (box.max.y - box.min.y)) / s) * s;
      const z = (r() < 0.5 ? box.max.z : box.min.z) + (r() < 0.5 ? 0.002 : -0.002);
      const steps = 4 + Math.floor(r() * 5);
      for (let k = 0; k < steps; k++) {
        const horiz = r() < 0.5;
        const nx = horiz ? x + (r() < 0.5 ? -1 : 1) * s * (1 + Math.floor(r() * 3)) : x;
        const ny = horiz ? y : y + (r() < 0.65 ? 1 : -1) * s * (1 + Math.floor(r() * 3));
        pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(nx, ny, z));
        x = Math.max(box.min.x, Math.min(box.max.x, nx)); y = Math.max(box.min.y, Math.min(box.max.y, ny));
      }
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
      line.layers.set(LAYER_FX);
      if (host) host.add(line); else group.add(line);
      line.visible = false;
      ud.cracks.push(line);
    }
  }
  const n = Math.round(Math.max(0, Math.min(1, amount)) * ud.cracks.length);
  ud.cracks.forEach((l, i) => { l.visible = i < n; });
  for (const m of ud.bladeMats || []) {
    if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
    m.color.copy(m.userData.baseColor).lerp(new THREE.Color('#6a3a8a'), amount * 0.35);
    m.emissive.setRGB(0.5 * amount * amount, 0.15 * amount * amount, 0.7 * amount * amount);
  }
}

/**
 * Break the weapon into voxel shards in world space. Hides the original group.
 * If `parent` is given the shards are added to it (assumed to be in world space, e.g. the scene).
 * Returns [{ mesh, velocity: Vector3, spin: Vector3, life }].
 */
export function shatterPieces(group, parent = null, opts = {}) {
  group.updateMatrixWorld(true);
  const r = rngFrom(group.id * 31 + 7);
  const pieces = [];
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(group).getCenter(center);
  const curseM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c86bff').multiplyScalar(2.4), fog: false });
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const s = group.getWorldScale(new THREE.Vector3()).x;
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.color) return;
    const pos = o.geometry.attributes.position, col = o.geometry.attributes.color;
    const n = o.userData.breakable ? 16 + Math.floor(r() * 8) : 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const vi = Math.floor(r() * pos.count);
      const size = WVS * s * (r() < 0.5 ? 1 : 2);
      const mat = r() < 0.15 ? curseM : new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(col.getX(vi), col.getY(vi), col.getZ(vi)) });
      const mesh = new THREE.Mesh(cubeGeo, mat);
      mesh.scale.setScalar(size);
      mesh.position.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(o.matrixWorld);
      mesh.quaternion.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
      mesh.castShadow = true;
      const dir = mesh.position.clone().sub(center);
      if (dir.lengthSq() < 1e-6) dir.set(r() - 0.5, r(), r() - 0.5);
      dir.normalize();
      const sp = (opts.force ?? opts.power ?? 2.2) * (0.5 + r());
      const vel = dir.multiplyScalar(sp).add(new THREE.Vector3((r() - 0.5) * 1.2, 1.2 + r() * 1.8, (r() - 0.5) * 1.2));
      pieces.push({ mesh, velocity: vel, spin: new THREE.Vector3((r() - 0.5) * 18, (r() - 0.5) * 18, (r() - 0.5) * 18), life: 1.4 + r() * 0.8 });
      if (parent) parent.add(mesh);
    }
  });
  group.visible = false;
  return pieces;
}

/** Simple physics step for shards; returns remaining pieces (removes dead ones from their parent). */
export function updateShards(pieces, dt, floorY = 0, gravity = 9.8) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    p.life -= dt;
    p.velocity.y -= gravity * dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    if (p.mesh.position.y < floorY) { p.mesh.position.y = floorY; p.velocity.y *= -0.3; p.velocity.x *= 0.6; p.velocity.z *= 0.6; p.spin.multiplyScalar(0.6); }
    p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
    if (p.life < 0.3) p.mesh.scale.multiplyScalar(Math.max(0.2, 1 - dt * 6));
    if (p.life <= 0) { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); pieces.splice(i, 1); }
  }
  return pieces;
}
