// Forged weapons as voxel pixel art on the game's one voxel grid (0.04 world units, the same as
// the explorers who hold them), so every voxel is placed like a pixel on an ornate sprite sword:
// a honed bright edge column beside a dark etched fuller, runes in the fuller that glow with the
// weapon's element, guards that grow and curl with the grade, gem-set pommels, wrapped grips, and
// on masterworks gold wings, langets and filigree. Bone blades are notched, crystal ones faceted,
// star-iron holds stars, magmasteel runs with molten seams. The look comes from the ingredients.
// Plus the curse: glowing cracks, and a shatter into voxel shards.
import * as THREE from 'three';
import { LAYER_FX } from '../gfx/renderer.js';
import { MATERIALS } from '../data/materials.js';
import { VPart, VOX, rgb, mix, mul, hash, voxToon, voxGlow } from './vox_char_kit.js';

/** World size of one weapon voxel: the shared grid, so a held weapon matches its explorer. */
const WVS = VOX;
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
const rampOf = (c) => [mul(c, 0.38), mul(c, 0.62), rgb(c), mix(c, '#ffffff', 0.45), mix(c, '#ffffff', 0.8)];
const pick = (R, t) => { t = Math.max(0, Math.min(0.999, t)) * (R.length - 1); const i = Math.floor(t); return mix(R[i], R[Math.min(i + 1, R.length - 1)], t - i); };
function pal(L) {
  return {
    blade: rampOf(L.blade), trim: rampOf(L.trim), wrap: rampOf(L.wrap),
    wood: [rgb('#3a2212'), rgb('#5a3820'), rgb('#7a5030'), rgb('#9a6a40'), rgb('#b8855a')],
    gem: L.gem ? rampOf(L.gem) : null,
    bone: [rgb('#8a7a5a'), rgb('#c8b890'), rgb('#e8dcc0'), rgb('#f6efe0'), rgb('#ffffff')],
  };
}
const glowOf = (c) => ({ glow: true, c });

// ------------------------------------------------------------------ shared pieces (weapon voxel units, grip column at x=0,z=0)
/** Wrapped grip from y0 up to y1 (exclusive), alternating turns of the binding. */
function grip(H, Q, y0, y1) { for (let y = y0; y < y1; y++) H.set(0, y, 0, pick(Q.wrap, (y & 1) ? 0.3 : 0.62)); }
/** Wooden haft with a little grain, from y0 to y1. */
function haft(H, Q, y0, y1) { for (let y = y0; y < y1; y++) H.set(0, y, 0, pick(Q.wood, 0.42 + ((y * 7) % 5 === 0 ? -0.15 : 0) + hash(0, y, 0, 9) * 0.18)); }
/** A ring of trim around the shaft at height y. */
function collar(H, Q, y, t = 0.62) { for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) H.set(x, y, z, pick(Q.trim, t + (x < 0 || z > 0 ? 0.15 : -0.05))); }
/** Pommel below the grip: a gem held between trim claws (or a plain knob), capped. */
function pommel(H, Q, L, y) {
  if (Q.gem) {
    H.set(0, y, 0, glowOf(pick(Q.gem, 0.72)));
    H.set(-1, y, 0, pick(Q.trim, 0.75)); H.set(1, y, 0, pick(Q.trim, 0.45));
    H.set(0, y - 1, 0, pick(Q.trim, 0.6));
    if (L.masterwork) { H.set(-1, y - 1, 0, pick(Q.trim, 0.85)); H.set(1, y - 1, 0, pick(Q.trim, 0.55)); }
  } else {
    H.set(0, y, 0, pick(Q.trim, 0.62)); H.set(-1, y, 0, pick(Q.trim, 0.78)); H.set(1, y, 0, pick(Q.trim, 0.42));
    if (L.grade >= 2) H.set(0, y - 1, 0, pick(Q.trim, 0.7));
  }
}
/** The inscription down a fuller: an irregular run of glyph marks rather than an even dotted line. */
const RUNE = [1, 0, 1, 1, 0, 1, 0, 0];
/** One blade voxel, its colour by column: honed edge, body, etched fuller (with runes), filigree. */
function bladeVox(B, L, Q, x, y, k, role) {
  let c;
  if (L.bladeKind === 'crystal') c = pick(Q.blade, role === 'edge' ? 0.9 : ((x + y) % 3 === 0 ? 0.78 : 0.48) + k * 0.1);
  else if (L.bladeKind === 'bone') c = pick(Q.bone, role === 'edge' ? 0.62 : role === 'fuller' ? 0.32 : 0.48 + (y % 4 === 0 ? -0.15 : 0));
  else c = pick(Q.blade, role === 'edge' ? 0.9 : role === 'back' ? 0.66 : role === 'fuller' ? 0.3 + k * 0.08 : 0.56 + k * 0.1);
  if (role === 'fuller') {
    // the etched fuller carries the weapon's nature: runes in its element, stars, molten seams
    if (L.glow && RUNE[y & 7]) return B.set(x, y, 0, glowOf((y >> 3) & 1 && L.glow2 ? L.glow2 : y % 3 === 0 ? mix(L.glow, '#ffffff', 0.4) : L.glow));
    if (L.magma && hash(x, y, 0, 3) > 0.45) return B.set(x, y, 0, glowOf(hash(x, y, 1) > 0.5 ? '#ff7a2a' : '#ffc04a'));
    if (L.star && y % 3 === 0) return B.set(x, y, 0, glowOf('#ffe8a0'));
    if (L.bladeKind === 'crystal' && y % 3 === 1) return B.set(x, y, 0, glowOf(pick(Q.blade, 0.85)));
  }
  // a strong element licks the edges
  if (role === 'edge' && L.glow && L.power >= 4 && hash(x, y, 2) > 0.7) return B.set(x, y, 0, glowOf(mix(L.glow, '#ffffff', 0.35)));
  B.set(x, y, 0, c);
}
/**
 * A straight blade: columns x0..x1 from y0 for len rows, narrowing to a point. Left column is the
 * honed edge, right column the back edge, the middle the fuller. Masterworks gild the ricasso.
 */
function straightBlade(B, L, Q, y0, len, o = {}) {
  const x0 = o.x0 ?? -1, x1 = o.x1 ?? 1;
  for (let i = 0; i < len; i++) {
    const y = y0 + i, k = i / len;
    let l = x0, r = x1;
    if (o.clip && i >= len - 2) l = Math.min(r, x0 + (i - (len - 3)));
    for (let x = l; x <= r; x++) {
      const role = x === x0 ? 'edge' : x === x1 ? 'back' : (i >= 1 && i < len - 1) ? 'fuller' : 'body';
      if (L.bladeKind === 'bone' && role === 'edge' && i % 3 === 2) continue; // notched bone edge
      if (L.masterwork && role === 'fuller' && i < 2) { B.set(x, y, 0, i === 1 && Q.gem ? glowOf(pick(Q.gem, 0.8)) : pick(Q.trim, 0.85)); continue; }
      bladeVox(B, L, Q, x, y, k, role);
    }
  }
  // the point
  const tx = o.clip ? x1 : Math.round((x0 + x1) / 2);
  B.set(tx, y0 + len, 0, L.bladeKind === 'bone' ? pick(Q.bone, 0.8) : pick(Q.blade, 0.95));
  if (L.fangs) for (let f = 0; f < Math.min(3, L.fangs); f++) {
    const fy = y0 + 3 + f * Math.max(3, Math.floor(len / 4));
    if (fy + 1 >= y0 + len) break;
    B.set(x0 - 1, fy, 0, pick(Q.bone, 0.55)); B.set(x0 - 1, fy + 1, 0, pick(Q.bone, 0.7)); B.set(x0 - 2, fy + 1, 0, pick(Q.bone, 0.9));
  }
  return y0 + len + 1;
}

// ------------------------------------------------------------------ builders: return { hilt: VPart, blade: VPart, tip }
const BUILD = {
  sword(L, Q) {
    const H = new VPart(), B = new VPart();
    const mw = L.masterwork, half = mw ? 4 : L.grade >= 2 ? 3 : 2;
    grip(H, Q, -4, 0);
    pommel(H, Q, L, -5);
    // crossguard: grows and curls with the grade; a stone (or boss) at the heart
    for (let x = -half; x <= half; x++) H.set(x, 0, 0, pick(Q.trim, 0.42 + (x < 0 ? 0.22 : 0) + (Math.abs(x) === half ? 0.18 : 0)));
    for (const z of [-1, 1]) H.set(0, 0, z, Q.gem ? glowOf(pick(Q.gem, 0.75)) : pick(Q.trim, 0.82));
    if (L.grade >= 2) for (const sx of [-1, 1]) H.set(sx * half, 1, 0, pick(Q.trim, 0.78));
    if (mw) for (const sx of [-1, 1]) {
      H.set(sx * half, 2, 0, pick(Q.trim, 0.92)); // tall curling quillons
      H.set(sx * 2, 1, 0, pick(Q.trim, 0.7)); // wings beside the ricasso
      H.set(sx, -1, 0, pick(Q.trim, 0.55)); // langets down the grip
    }
    const tip = straightBlade(B, L, Q, 1, 15);
    return { hilt: H, blade: B, tip: tip * WVS };
  },
  dagger(L, Q) {
    const H = new VPart(), B = new VPart();
    grip(H, Q, -3, 0);
    pommel(H, Q, L, -4);
    for (let x = -2; x <= 2; x++) H.set(x, 0, 0, pick(Q.trim, 0.45 + (x < 0 ? 0.2 : 0)));
    if (Q.gem) H.set(0, 0, 1, glowOf(pick(Q.gem, 0.75)));
    if (L.grade >= 2) { H.set(2, 1, 0, pick(Q.trim, 0.8)); H.set(-2, -1, 0, pick(Q.trim, 0.65)); } // an S-guard
    const tip = straightBlade(B, L, Q, 1, 6, { clip: true });
    return { hilt: H, blade: B, tip: tip * WVS };
  },
  axe(L, Q) {
    const H = new VPart(), B = new VPart();
    haft(H, Q, -8, 15);
    grip(H, Q, -4, 1);
    H.set(0, -9, 0, pick(Q.trim, 0.6));
    collar(H, Q, 10); collar(H, Q, 14);
    if (Q.gem) for (const z of [-1, 1]) H.set(0, 12, z, glowOf(pick(Q.gem, 0.75)));
    // a bearded bit flaring to a long bright edge
    const cols = [[2, 10, 14], [3, 9, 15], [4, 8, 15], [5, 7, 16]];
    for (const [x, y0, y1] of cols) for (let y = y0; y <= y1; y++) {
      const edge = x === 5, k = (y - y0) / (y1 - y0);
      if (L.glow && x === 3 && (y === 11 || y === 13)) { B.set(x, y, 0, glowOf(y === 13 && L.glow2 ? L.glow2 : L.glow)); continue; }
      if (edge && L.glow && L.power >= 4 && hash(x, y, 2) > 0.7) { B.set(x, y, 0, glowOf(mix(L.glow, '#ffffff', 0.35))); continue; }
      if (L.masterwork && x === 2 && (y === 10 || y === 14)) { B.set(x, y, 0, pick(Q.trim, 0.85)); continue; }
      B.set(x, y, 0, L.bladeKind === 'bone' ? pick(Q.bone, edge ? 0.6 : 0.45) : pick(Q.blade, edge ? 0.9 : x === 4 ? 0.64 : 0.44 + k * 0.12));
    }
    for (let y = 11; y <= 13; y++) B.set(1, y, 0, pick(Q.blade, 0.38));
    // back spike
    B.set(-2, 11, 0, pick(Q.blade, 0.5)); B.set(-2, 12, 0, pick(Q.blade, 0.62)); B.set(-3, 12, 0, pick(Q.blade, 0.85));
    if (L.fangs) { B.set(-1, 15, 0, pick(Q.bone, 0.6)); B.set(-1, 16, 0, pick(Q.bone, 0.85)); }
    return { hilt: H, blade: B, tip: 17 * WVS };
  },
  hammer(L, Q) {
    const H = new VPart(), B = new VPart();
    haft(H, Q, -8, 12);
    grip(H, Q, -4, 1);
    H.set(0, -9, 0, pick(Q.trim, 0.6));
    collar(H, Q, 10);
    // an octagonal head with banded collars and bright striking faces
    for (let x = -4; x <= 4; x++) for (let y = 11; y <= 15; y++) for (let z = -2; z <= 2; z++) {
      if (Math.abs(y - 13) === 2 && Math.abs(z) === 2) continue;
      const ax = Math.abs(x), face = ax === 4, band = ax === 3;
      let c = band ? pick(Q.trim, 0.6 + (y > 13 ? 0.2 : 0)) : pick(Q.blade, face ? 0.86 : 0.42 + (y > 13 ? 0.16 : 0) + (z > 0 ? 0.05 : 0) + (x < 0 ? 0.04 : 0));
      if (face && L.glow && (y + z) % 2 === 0) c = glowOf(L.glow);
      B.set(x, y, z, c);
    }
    if (L.core) for (const [x, y] of [[0, 13], [1, 13], [-1, 13], [0, 12], [0, 14]]) B.set(x, y, 2, glowOf(x === 0 && y === 13 ? '#fff0b0' : '#ffb84a'));
    else if (Q.gem) for (const z of [-2, 2]) B.set(0, 13, z, glowOf(pick(Q.gem, 0.78)));
    if (L.masterwork) for (const x of [-2, 0, 2]) B.set(x, 16, 0, pick(Q.trim, 0.85));
    if (L.fangs) for (const x of [-3, 3]) { B.set(x, 16, 0, pick(Q.bone, 0.6)); B.set(x, 17, 0, pick(Q.bone, 0.85)); }
    return { hilt: H, blade: B, tip: 16 * WVS };
  },
  spear(L, Q) {
    const H = new VPart(), B = new VPart();
    haft(H, Q, -11, 22);
    grip(H, Q, -4, 3);
    H.set(0, -12, 0, pick(Q.trim, 0.6));
    collar(H, Q, 21); H.set(0, 22, 0, pick(Q.trim, 0.7));
    if (Q.gem) H.set(0, 21, 1, glowOf(pick(Q.gem, 0.75)));
    // a tassel hanging from the socket
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let y = 18; y <= 20; y++) H.set(x, y, z, L.glow ? mix(L.glow, '#8a1a10', 0.45 + (y - 18) * 0.1) : rgb(y === 18 ? '#8a2018' : (x + z + y) & 1 ? '#c8402a' : '#a83020'));
    // a leaf blade with a raised spine
    B.set(0, 23, 0, pick(Q.blade, 0.5));
    for (let y = 24; y <= 29; y++) for (let x = -1; x <= 1; x++) bladeVox(B, L, Q, x, y, (y - 24) / 6, x === -1 ? 'edge' : x === 1 ? 'back' : y > 24 && y < 29 ? 'fuller' : 'body');
    B.set(0, 30, 0, pick(Q.blade, 0.82)); B.set(0, 31, 0, pick(Q.blade, 0.95));
    if (L.masterwork) for (const sx of [-1, 1]) B.set(sx * 2, 24, 0, pick(Q.trim, 0.85)); // gilded wings
    return { hilt: H, blade: B, tip: 32 * WVS };
  },
  staff(L, Q) {
    const H = new VPart(), B = new VPart();
    // a gnarled shaft that wanders a voxel either way, with knots
    let px = 0;
    for (let y = -11; y < 15; y++) {
      const x = Math.round(Math.sin(y * 0.33) * 0.8);
      if (x !== px) H.set(px, y, 0, pick(Q.wood, 0.36));
      H.set(x, y, 0, pick(Q.wood, 0.4 + hash(x, y, 0, 9) * 0.22 + ((y & 3) === 0 ? 0.08 : 0)));
      if (y === -6 || y === 3) H.set(x + (y < 0 ? 1 : -1), y, 0, pick(Q.wood, 0.3));
      px = x;
    }
    for (let y = -3; y < 2; y++) H.set(Math.round(Math.sin(y * 0.33) * 0.8), y, 0, pick(Q.wrap, (y & 1) ? 0.3 : 0.62));
    const tx = px;
    collar(H, Q, 15);
    H.set(tx, 15, 0, pick(Q.trim, 0.7));
    // roots curling up around a cut orb
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      for (let y = 16; y <= 18; y++) H.set(tx + x, y, z, pick(Q.wood, 0.45 + (y - 16) * 0.1));
      H.set(tx + x / 2, 19, z / 2, pick(Q.wood, 0.72));
    }
    const O = rampOf(L.glow || L.gem || L.blade);
    for (let x = -1; x <= 1; x++) for (let y = 16; y <= 18; y++) for (let z = -1; z <= 1; z++) {
      if (Math.abs(x) + Math.abs(y - 17) + Math.abs(z) > 2) continue;
      const core = x === 0 && y === 17 && z === 0;
      B.set(tx + x, y, z, glowOf(pick(O, core ? 0.96 : (x + y + z) & 1 ? 0.72 : 0.5)));
    }
    return { hilt: H, blade: B, tip: 20 * WVS, orb: true };
  },
  pickaxe(L, Q) {
    const H = new VPart(), B = new VPart();
    haft(H, Q, -8, 13);
    grip(H, Q, -4, 1);
    H.set(0, -9, 0, pick(Q.trim, 0.6));
    collar(H, Q, 11);
    H.set(0, 14, 0, pick(Q.trim, 0.72));
    if (Q.gem) H.set(0, 11, 1, glowOf(pick(Q.gem, 0.75)));
    // two picks curving down to bright points
    B.set(0, 12, 0, pick(Q.blade, 0.4)); B.set(0, 13, 0, pick(Q.blade, 0.55));
    for (const sx of [-1, 1]) for (const [x, y, t] of [[1, 12, 0.45], [1, 13, 0.68], [2, 12, 0.45], [2, 13, 0.7], [3, 12, 0.58], [4, 12, 0.62], [5, 11, 0.7], [6, 10, 0.92]]) {
      B.set(sx * x, y, 0, L.glow && x === 3 ? glowOf(L.glow) : pick(Q.blade, t + (sx < 0 ? 0.06 : 0)));
    }
    return { hilt: H, blade: B, tip: 14 * WVS };
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
    G = { hilt: r.hilt.geometry(WVS, [0.5, 0, 0.5], { glowIntensity: 2.4, jitter: 0.04 }), blade: r.blade.geometry(WVS, [0.5, 0, 0.5], { glowIntensity: 2.6, jitter: 0.04 }), tip: r.tip, orb: r.orb };
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
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe08a').multiplyScalar(2.5), fog: false }));
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
      const s = WVS * 0.5;
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
    const n = o.userData.breakable ? 12 + Math.floor(r() * 6) : 4 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const vi = Math.floor(r() * pos.count);
      const size = WVS * s * (r() < 0.3 ? 0.5 : 1);
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
