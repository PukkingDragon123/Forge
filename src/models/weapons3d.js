// Forged weapons as finely voxelised pieces (about 80 voxels from pommel to tip), in the spirit of
// ornate pixel-art swords: honed bright edges around a darker etched fuller, curling quillons,
// gem-set guards and pommels, wrapped grips, rune inlays that glow in the weapon's element,
// gold filigree on masterworks, bone fangs, crystal facets. The look comes from the ingredients.
// Plus the curse: glowing cracks, and a shatter into voxel shards.
import * as THREE from 'three';
import { LAYER_FX } from '../gfx/renderer.js';
import { MATERIALS } from '../data/materials.js';
import { VPart, rgb, mix, mul, hash, voxToon, voxGlow } from './vox_char_kit.js';

/** World size of one weapon voxel. */
const WVS = 0.0125;
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
  };
}
/** A tiny rune glyph (3×5) chosen by seed: true where the rune is cut. */
const rune = (gx, gy, seed) => { const b = Math.floor(hash(seed, 7, 3) * 32767); return gx >= 0 && gx < 3 && gy >= 0 && gy < 5 && ((b >> (gx + gy * 3)) & 1) === 1; };

// ------------------------------------------------------------------ parts painters (weapon voxel units)
/** Flat blade along +Y: half-width w(y) (≤0 = none), center offset c(y), thickness t. */
function paintBlade(P, L, Q, y0, y1, w, o = {}) {
  const t = o.t ?? 1, cx = o.cx || (() => 0);
  for (let y = y0; y < y1; y++) {
    const hw = w(y);
    if (hw <= 0) continue;
    const k = (y - y0) / (y1 - y0);
    for (let x = Math.floor(-hw + cx(y)); x < Math.ceil(hw + cx(y)); x++) {
      const dx = x + 0.5 - cx(y);
      if (Math.abs(dx) > hw) continue;
      const edge = hw - Math.abs(dx) < 1.05;
      const fuller = o.fuller && Math.abs(dx) < Math.max(0.6, hw * 0.28) && k > 0.06 && k < o.fuller;
      for (let z = -t; z < t; z++) {
        let col;
        const shine = (z === -t || z === t - 1) ? 1 : 0.85;
        if (L.bladeKind === 'crystal') col = pick(Q.blade, 0.45 + (((x + y + (z > 0 ? 3 : 0)) % 7) < 2 ? 0.35 : 0) + k * 0.1);
        else if (L.bladeKind === 'bone') col = pick(Q.blade, 0.55 + (hash(x, y, z, 5) - 0.5) * 0.15 - (edge && y % 3 === 0 ? 0.3 : 0));
        else col = pick(Q.blade, edge ? 0.86 : fuller ? 0.32 : 0.58 + k * 0.12 + (hash(x >> 1, y >> 2, z, 4) - 0.5) * 0.06);
        col = mul(col, shine);
        // runes etched into the fuller glow with the element
        if (fuller && L.glow && (z === -t || z === t - 1)) {
          const ry = y - y0 - 4, cell = Math.floor(ry / 6);
          if (rune(Math.round(dx + 1), ry - cell * 6, cell * 13 + 7)) { P.set(x, y, z, { glow: true, c: cell % 2 && L.glow2 ? L.glow2 : L.glow }); continue; }
        }
        // a strong element licks the edges
        if (edge && L.glow && L.power >= 3 && hash(x, y, 1) > 0.55) { P.set(x, y, z, { glow: true, c: mix(L.glow, '#ffffff', 0.3) }); continue; }
        // masterwork filigree near the base
        if (L.masterwork && !edge && k < 0.22 && ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0) && (z === -t || z === t - 1)) col = pick(Q.trim, 0.8);
        P.set(x, y, z, col);
      }
    }
  }
}
/** Round grip with a spiral wrap from y0 to y1. */
function paintGrip(P, Q, y0, y1, r = 1.5) {
  for (let y = y0; y < y1; y++) for (let x = -2; x < 2; x++) for (let z = -2; z < 2; z++) {
    const dx = x + 0.5, dz = z + 0.5;
    if (dx * dx + dz * dz > r * r) continue;
    const a = Math.atan2(dz, dx);
    const turn = ((y * 0.9 + a * 1.6) % 3 + 3) % 3 < 1;
    P.set(x, y, z, pick(Q.wrap, turn ? 0.32 : 0.62 + (dx < 0 ? 0.1 : 0)));
  }
}
/** Gem: a cut stone with a highlight, glowing faintly. */
function gem(P, Q, cx, cy, cz, r, glowGem = true) {
  P.ell(cx, cy, cz, r, r * 1.15, r * 0.8, (x, y, z, d) => (glowGem ? { glow: true, c: pick(Q.gem, d < 0.3 ? 0.95 : d < 0.7 ? 0.6 : 0.4) } : pick(Q.gem, 0.6 - d * 0.3)));
}

// ------------------------------------------------------------------ builders: return { hilt: VPart, blade: VPart, tip }
const BUILD = {
  sword(L, Q) {
    const H = new VPart(), B = new VPart();
    paintGrip(H, Q, -14, 0, 1.6);
    // pommel: a trim knot holding a gem
    H.ell(0, -16.5, 0, 2.6, 2.8, 2.2, (x, y, z) => pick(Q.trim, 0.45 + (y > -16 ? 0.25 : 0) - (x > 0 ? 0.1 : 0)));
    if (Q.gem) gem(H, Q, 0, -16.5, 0, 1.4);
    H.cap([0, -19, 0], [0, -21, 0], 1.2, 0.4, () => pick(Q.trim, 0.7));
    // crossguard: a bar that swells at the centre and curls up into hooked quillons
    for (let x = -12; x < 12; x++) {
      const ax = Math.abs(x + 0.5), lift = ax > 6 ? Math.pow((ax - 6) / 6, 1.8) * 6 : 0;
      const hgt = ax < 3 ? 4 : 2.4 - ax * 0.05;
      for (let y = 0; y < hgt; y++) for (let z = -2; z < 2; z++) {
        if (ax > 3 && (z === -2 || z === 1) && y > 1) continue;
        H.set(x, Math.round(y + lift), z, pick(Q.trim, 0.42 + (y > hgt - 1.5 ? 0.3 : 0) + (z < 0 ? -0.08 : 0.04)));
      }
    }
    for (const sx of [-1, 1]) { H.cap([sx * 11.5, 6, 0], [sx * 10, 9, 0], 1.3, 0.5, () => pick(Q.trim, 0.75)); if (L.masterwork) H.cap([sx * 4, 4, 0], [sx * 6, 8, 0], 0.9, 0.4, () => pick(Q.trim, 0.85)); }
    if (Q.gem) for (const sz of [-1, 1]) gem(H, Q, 0, 2, sz * 1.8, 1.5);
    else H.box(-1, 1, -2.5, 1, 3, 2.5, () => pick(Q.trim, 0.85));
    // the blade: a ricasso, a gentle leaf and a long taper to the point
    const len = 56;
    paintBlade(B, L, Q, 4, 4 + len, (y) => { const k = (y - 4) / len; return k < 0.06 ? 2.4 : k < 0.78 ? 3.4 - k * 0.6 + Math.sin(k * 6) * 0.15 : 3.0 * (1 - (k - 0.78) / 0.22) + 0.3; }, { t: 1, fuller: 0.7 });
    if (L.fangs) for (let i = 0; i < Math.min(3, L.fangs) * 2; i++) { const y = 14 + i * 7; B.cap([-3, y, 0], [-6, y + 2.5, 0], 1.1, 0.3, () => rgb(i % 2 ? '#e8dcc0' : '#d0c4a6')); }
    return { hilt: H, blade: B, tip: (4 + len) * WVS };
  },
  dagger(L, Q) {
    const H = new VPart(), B = new VPart();
    paintGrip(H, Q, -9, 0, 1.4);
    H.ell(0, -10.5, 0, 2, 2, 1.8, () => pick(Q.trim, 0.6));
    if (Q.gem) gem(H, Q, 0, -10.5, 0, 1.1);
    for (let x = -6; x < 7; x++) { const lift = x > 2 ? (x - 2) * 0.6 : x < -2 ? (-x - 2) * -0.3 : 0; for (let y = 0; y < 2; y++) for (let z = -1; z < 1; z++) H.set(x, Math.round(y + lift), z, pick(Q.trim, 0.5 + y * 0.25)); }
    if (Q.gem) gem(H, Q, 0, 1, 1.2, 1.1);
    const len = 26;
    paintBlade(B, L, Q, 2, 2 + len, (y) => { const k = (y - 2) / len; return k < 0.65 ? 2.6 - k * 0.6 : 2.2 * (1 - (k - 0.65) / 0.35) + 0.2; }, { t: 1, fuller: 0.6, cx: (y) => Math.pow((y - 2) / len, 2) * 2.5 });
    if (L.fangs) B.cap([-2.5, 12, 0], [-5, 15, 0], 1, 0.3, () => rgb('#e8dcc0'));
    return { hilt: H, blade: B, tip: (2 + len) * WVS };
  },
  axe(L, Q) {
    const H = new VPart(), B = new VPart();
    H.cap([0, -24, 0], [0, 50, 0], 1.9, 1.6, (x, y, z) => pick(Q.wood, 0.45 + Math.sin(y * 0.7 + x * 2) * 0.12 + (x < 0 ? 0.1 : 0)));
    paintGrip(H, Q, -10, 4, 2.1);
    H.loft(39, 49, () => [2.8, 2.6], () => pick(Q.trim, 0.55));
    H.loft(39, 41, () => [3.1, 2.9], () => pick(Q.trim, 0.8)); H.loft(47, 49, () => [3.1, 2.9], () => pick(Q.trim, 0.8));
    // bearded bit flaring to a long curved edge
    for (let x = 2; x < 19; x++) {
      const k = (x - 2) / 17, top = 49 + k * 4 + k * k * 3, bot = 40 - k * k * 11;
      for (let y = Math.floor(bot); y < top; y++) for (let z = -1; z < 1; z++) {
        const edge = x >= 17 || y < bot + 1.1 && k > 0.7;
        B.set(x, y, z, L.glow && edge && L.power >= 3 && hash(x, y) > 0.5 ? { glow: true, c: L.glow } : pick(Q.blade, edge ? 0.88 : 0.5 + k * 0.15 + (z < 0 ? -0.05 : 0)));
      }
    }
    if (L.glow) for (let y = 41; y < 51; y += 3) B.set(9, y, 1, { glow: true, c: L.glow });
    B.cap([-2, 45, 0], [-9, 44, 0], 2.2, 0.4, () => pick(Q.blade, 0.6));
    if (Q.gem) gem(H, Q, 0, 44, 2.6, 1.5);
    if (L.fangs) B.cap([-3, 48, 0], [-7, 52, 0], 1, 0.3, () => rgb('#e8dcc0'));
    return { hilt: H, blade: B, tip: 54 * WVS };
  },
  hammer(L, Q) {
    const H = new VPart(), B = new VPart();
    H.cap([0, -22, 0], [0, 44, 0], 2.1, 1.8, (x, y, z) => pick(Q.wood, 0.45 + Math.sin(y * 0.6 + z) * 0.12 + (x < 0 ? 0.1 : 0)));
    paintGrip(H, Q, -10, 4, 2.3);
    // octagonal head with flared striking faces and banded collars
    for (let x = -13; x < 13; x++) {
      const ax = Math.abs(x + 0.5), flare = ax > 10 ? 1.2 : ax < 3 ? -0.6 : 0;
      const r = 5.2 + flare;
      for (let y = 40; y < 52; y++) for (let z = -6; z < 6; z++) {
        const dy = y + 0.5 - 46, dz = z + 0.5;
        if (Math.abs(dy) > r || Math.abs(dz) > r || Math.abs(dy) + Math.abs(dz) > r * 1.45) continue;
        const face = ax > 12, band = ax > 8.5 && ax < 10;
        B.set(x, y, z, band ? pick(Q.trim, 0.65 + (dy > 0 ? 0.15 : 0)) : pick(Q.blade, face ? 0.85 : 0.45 + (dy > 0 ? 0.18 : 0) + (dz > 0 ? 0.06 : 0)));
      }
    }
    if (L.core) B.ell(0, 46, 5.6, 2.4, 2.4, 1.2, (x, y, z, d) => ({ glow: true, c: d < 0.4 ? '#fff0b0' : '#ffb84a' }));
    else if (Q.gem) gem(B, Q, 0, 46, 5.6, 2);
    if (L.glow) for (const sx of [-1, 1]) for (let y = 42; y < 50; y++) for (let z = -3; z < 3; z++) if ((y + z) % 3 === 0) B.set(sx * 13.5 - 0.5, y, z, { glow: true, c: L.glow });
    if (L.fangs) for (let i = 0; i < 3; i++) B.cap([-6 + i * 6, 52, 0], [-6 + i * 6, 57, 0], 1.2, 0.3, () => rgb('#e8dcc0'));
    return { hilt: H, blade: B, tip: 56 * WVS };
  },
  spear(L, Q) {
    const H = new VPart(), B = new VPart();
    H.cap([0, -34, 0], [0, 70, 0], 1.5, 1.3, (x, y, z) => pick(Q.wood, 0.5 + Math.sin(y * 0.8) * 0.1 + (x < 0 ? 0.1 : 0)));
    paintGrip(H, Q, -8, 6, 1.8);
    H.loft(66, 72, (y) => [2.4 - (y - 66) * 0.15, 2.4 - (y - 66) * 0.15], () => pick(Q.trim, 0.62));
    if (Q.gem) gem(H, Q, 0, 68, 2.2, 1.2);
    paintBlade(B, L, Q, 72, 98, (y) => { const k = (y - 72) / 26; return k < 0.15 ? 1.2 + k * 14 : k < 0.5 ? 3.3 : 3.3 * (1 - (k - 0.5) / 0.5) + 0.2; }, { t: 1, fuller: 0.7 });
    // a red tassel under the socket
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; H.cap([Math.cos(a) * 1.5, 66, Math.sin(a) * 1.5], [Math.cos(a) * 2.6, 58 - (i % 3), Math.sin(a) * 2.6], 0.6, 0.45, () => (L.glow ? mix(L.glow, '#8a1a10', 0.4) : rgb(i % 2 ? '#c8402a' : '#a83020'))); }
    return { hilt: H, blade: B, tip: 98 * WVS };
  },
  staff(L, Q) {
    const H = new VPart(), B = new VPart();
    // gnarled shaft wandering up with knots
    let px = 0, pz = 0;
    for (let y = -34; y < 46; y += 2) {
      const nx = Math.sin(y * 0.11) * 1.4 + y * 0.02, nz = Math.cos(y * 0.09) * 0.8;
      H.cap([px, y, pz], [nx, y + 2, nz], 2.0 + (((y + 34) % 14) < 2 ? 0.8 : 0), 1.9, (x, yy, z) => pick(Q.wood, 0.4 + Math.sin(yy * 0.5 + x * 2.2) * 0.14 + (x < px ? 0.12 : 0)));
      px = nx; pz = nz;
    }
    paintGrip(H, Q, -6, 6, 2.3);
    H.loft(44, 47, () => [2.8, 2.8, px, pz], () => pick(Q.trim, 0.65));
    // three roots curling up around a cut crystal orb
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4, ca = Math.cos(a), sa = Math.sin(a);
      H.cap([px + ca * 1.5, 46, pz + sa * 1.5], [px + ca * 5, 50, pz + sa * 5], 1.3, 1, (x, y, z) => pick(Q.wood, 0.5 + (y & 1) * 0.1));
      H.cap([px + ca * 5, 50, pz + sa * 5], [px + ca * 3.5, 57, pz + sa * 3.5], 1, 0.7, (x, y, z) => pick(Q.wood, 0.55));
      H.cap([px + ca * 3.5, 57, pz + sa * 3.5], [px + Math.cos(a + 0.8) * 1, 61, pz + Math.sin(a + 0.8) * 1], 0.7, 0.4, (x, y, z) => pick(Q.wood, 0.6));
    }
    const oc = L.glow || L.gem || L.blade;
    const O = rampOf(oc);
    B.ell(px, 53.5, pz, 3.2, 4.4, 3.2, (x, y, z, d) => ({ glow: true, c: pick(O, d < 0.25 ? 0.95 : d < 0.6 ? 0.7 : 0.48 + (((x + y) & 3) === 0 ? 0.2 : 0)) }));
    return { hilt: H, blade: B, tip: 62 * WVS, orb: true };
  },
  pickaxe(L, Q) {
    const H = new VPart(), B = new VPart();
    H.cap([0, -20, 0], [0, 40, 0], 1.8, 1.6, (x, y, z) => pick(Q.wood, 0.45 + Math.sin(y * 0.7 + x * 2) * 0.12 + (x < 0 ? 0.1 : 0)));
    paintGrip(H, Q, -10, 0, 2.1);
    H.loft(33, 41, () => [2.8, 2.6], () => pick(Q.trim, 0.6));
    // curved picks, square in section, drawn to points
    for (const sx of [-1, 1]) {
      let prev = [0, 37.5];
      for (let i = 1; i <= 12; i++) {
        const t = i / 12, x = sx * (2 + t * 20), y = 37.5 + Math.sin(t * Math.PI * 0.9) * 3 - t * t * 8;
        const r = 2.4 * (1 - t) + 0.4;
        B.cap([prev[0], prev[1], 0], [x, y, 0], r + 0.2, r, (xx, yy, z) => pick(Q.blade, (yy > y ? 0.75 : 0.45) + (t > 0.85 ? 0.25 : 0)));
        prev = [x, y];
      }
      if (L.glow) B.set(sx * 21, 29, 0, { glow: true, c: L.glow });
    }
    if (Q.gem) gem(H, Q, 0, 37, 2.8, 1.4);
    return { hilt: H, blade: B, tip: 40 * WVS };
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
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe08a').multiplyScalar(2.5), fog: false }));
    s.position.set(0, G.tip * 0.97, 0.02); s.castShadow = false;
    g.add(s);
    g.userData.sparkle = s;
  }
  if (L.star) {
    const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe08a').multiplyScalar(2.4), fog: false });
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(WVS, WVS, WVS), sm); s.position.set(((i * 37) % 7 - 3) * WVS, 0.15 + i * 0.1, WVS * 1.2); s.castShadow = false; g.add(s); }
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
    const n = o.userData.breakable ? 14 + Math.floor(r() * 8) : 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const vi = Math.floor(r() * pos.count);
      const size = WVS * s * (1 + Math.floor(r() * 3));
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
