// Diagonal weapon sprites in the style of a 128px pixel-art sword sheet: broad bevelled blades with
// fullers and engraved runes, ornate material-driven guards, wrapped grips, gem inlays, a dark ink
// outline and an element-coloured glow outline. Everything is evaluated per pixel in a local frame
// (u along the weapon from butt to tip, v across it, +v toward the light) so it stays crisp at any size.
import { Painter } from './pixel.js';
import { shadeHex, mixHex, hexToRgb, hash2, fbm2, clamp, lerp } from '../core/math.js';
import { MATERIALS } from '../data/materials.js';

const R2 = Math.SQRT1_2;
const INK = '#140c10';
const fr = (x) => x - Math.floor(x);

// ------------------------------------------------------------------ palettes
function lum(hex) { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function toHsl(hex) {
  let [r, g, b] = hexToRgb(hex); r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s); l = clamp(l);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
const hueToward = (h, t, k) => { const d = ((t - h + 540) % 360) - 180; return h + d * k; };
/**
 * Hue-shifted pixel-art ramp of n tones, dark → light: shadows lean toward blue-violet and get
 * richer, highlights lean toward warm yellow and wash out to a tinted white. Greys get a cool
 * shadow / warm light tint so metal and stone never look flat.
 */
export function hueRamp(hex, n = 6, o = {}) {
  let [h, s, l] = toHsl(hex);
  const grey = s < 0.14;
  if (l > 0.78) l = 0.78 - (l - 0.78) * 0.4;
  if (l < 0.16) l = 0.16;
  const sat = Math.min(1, s * (o.sat ?? 1.15));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = t * 2 - 1; // -1 shadow … +1 highlight
    const L = u < 0 ? l + u * Math.min(l - 0.05, 0.42) : l + u * Math.min(0.95 - l, 0.3);
    let H, S;
    if (u < 0) { H = grey ? 232 : hueToward(h, 250, -u * 0.22); S = grey ? 0.1 + -u * 0.14 : Math.min(1, sat + -u * 0.12); }
    else { H = grey ? 46 : hueToward(h, 52, u * 0.18); S = grey ? 0.06 + u * 0.1 : sat * (1 - u * 0.2); }
    out.push(fromHsl(H, S, L));
  }
  if (o.spec !== false) out[n - 1] = fromHsl(grey ? 50 : hueToward(h, 55, 0.4), grey ? 0.25 : 0.35, 0.95);
  return out;
}
/** Near-black outline colour carrying a hint of the item's hue. */
export function inkOf(hex) { const [h, s] = toHsl(hex); return fromHsl(hueToward(h, 255, 0.5), Math.min(0.5, 0.2 + s * 0.4), 0.075); }
/** 7 tones: 0 deep … 3 base … 6 specular. Hue-shifted (cool shadows, warm lights). */
function ramp7(hex, spread = 1) {
  const r = hueRamp(hex, 7, { sat: 1.1 + (spread - 1) * 0.2 });
  return r;
}
const RAMP = new Map();
const R = (hex, s = 1) => { const k = hex + s; let r = RAMP.get(k); if (!r) { r = ramp7(hex, s); RAMP.set(k, r); } return r; };
const at = (T, i) => T[Math.max(0, Math.min(6, i))];

const METALS = {
  iron: { c: '#8c909e' }, steel: { c: '#a2acbe', polish: 1 }, tin: { c: '#9ca0ac' }, copper: { c: '#cc7e46' }, bronze: { c: '#cc9648' },
  bronze_ancient: { c: '#b4843c', patina: '#4aa88e' }, silver: { c: '#b4bed0', polish: 1 }, gold: { c: '#f0bc3c', polish: 1 }, electrum: { c: '#e6d488', polish: 1 },
  mithril: { c: '#62bede', polish: 2 }, stariron: { c: '#4a4c92', stars: 1 }, magmasteel: { c: '#5c3a36', veins: '#ff8a2a' },
  cursedore: { c: '#5e3488', veins: '#ff7af0' }, obsidian: { c: '#3a2c4e', glass: 1 }, lodestone: { c: '#5a5c70' }, junk: { c: '#8a7c6e', rust: 1 },
};
const METAL_PRIORITY = ['stariron', 'mithril', 'magmasteel', 'cursedore', 'gold', 'silver', 'bronze_ancient', 'obsidian', 'iron', 'lodestone', 'copper', 'tin', 'junk'];
export const EL_COLOR = { fire: '#ff7a2a', ice: '#9af0ff', shock: '#ffe74a', poison: '#8fe04a', curse: '#c86bff', holy: '#fff3b0', bleed: '#ff4f6a' };
const EL_RAMP = {
  fire: ['#b8281a', '#ff8a2a', '#ffe48a'], ice: ['#3a7ad0', '#9af0ff', '#ffffff'], shock: ['#c08a1a', '#ffe74a', '#fffbe0'],
  poison: ['#367a2a', '#8fe04a', '#e4ffa8'], curse: ['#5a2290', '#c86bff', '#ffd4ff'], holy: ['#c8983a', '#fff3b0', '#ffffff'], bleed: ['#7a1020', '#ff4f6a', '#ffb4bc'],
};

export function weaponLook(w) {
  const ids = w.ids || [];
  const has = (id) => ids.includes(id);
  const mat = (id) => MATERIALS[id] || { kind: '', tags: [], color: '#a8acb4' };
  let metal = null;
  if (has('iron') && has('coal')) metal = 'steel';
  else if (has('gold') && has('silver')) metal = 'electrum';
  else if (has('copper') && has('tin')) metal = 'bronze';
  if (!metal) metal = METAL_PRIORITY.find(has) || null;
  if (!metal && has('voidcrystal')) metal = 'obsidian';
  const gemId = ids.find((id) => mat(id).kind === 'gem') || ids.find((id) => mat(id).kind === 'crystal');
  const boneId = ids.find((id) => mat(id).tags.includes('bone'));
  const fangs = ids.filter((id) => mat(id).tags.includes('fang')).length;
  const els = Object.entries(w.el || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const grade = w.grade ?? 1;
  let kind = 'metal', blade = metal ? METALS[metal].c : null;
  if (!metal) {
    if (gemId) { kind = 'crystal'; blade = mat(gemId).color; }
    else if (boneId) { kind = 'bone'; blade = '#e6dcc0'; }
    else { kind = 'metal'; blade = ids[0] ? mat(ids[0]).color : '#a8acb4'; }
  }
  if (has('prism') || w.recipe === 'prismedge') kind = 'prism';
  let grip = '#6e3c24';
  if (has('spider_silk')) grip = '#e8e6f4';
  else if (has('mimic_tongue') || has('toad_tongue') || has('rat_tail')) grip = '#c4607e';
  else if (has('bat_wing')) grip = '#4a3048';
  else if (has('salamander_scale') || has('wyrm_scale')) grip = '#a83a2a';
  else if (boneId) grip = '#cfc2a0';
  let guard = '#7e7e8e';
  if (has('gold') || grade >= 4) guard = '#e8b234';
  else if (metal === 'copper' || metal === 'bronze' || metal === 'bronze_ancient') guard = '#a8642e';
  else if (metal === 'silver' || metal === 'mithril' || metal === 'electrum') guard = '#b8c4d8';
  else if (metal === 'cursedore' || metal === 'obsidian') guard = '#4a3a5a';
  else if (metal === 'magmasteel') guard = '#3a2a2a';
  else if (kind === 'bone') guard = '#d8ccaa';
  const M = metal ? METALS[metal] : {};
  return {
    ids, has, metal, kind, blade, guard, grip, grade, els, fangs,
    gem: gemId ? mat(gemId).color : null, gemId,
    stars: !!M.stars, veins: M.veins || null, glass: !!M.glass || kind === 'crystal' || kind === 'prism', rust: !!M.rust || grade <= 0,
    patina: M.patina || null, polish: M.polish || 0, core: has('golem_core') ? '#ffb84a' : has('lava_core') ? '#ff7a2a' : null,
    feather: has('feather'), bone: kind === 'bone', skull: has('skull'), runes: els.length > 0 || has('runestone') || metal === 'cursedore' || grade >= 3,
    cursed: metal === 'cursedore' || has('voidcrystal') || has('soulstone'),
  };
}

// ------------------------------------------------------------------ geometry helpers
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const RUNES = [
  ['x.x', '.x.', 'x.x'], ['.x.', 'xxx', '.x.'], ['xx.', '.x.', '.xx'], ['x..', 'xxx', '..x'], ['.xx', 'xx.', '.x.'],
  ['x.x', 'xxx', '.x.'], ['xxx', '.x.', 'x..'], ['.x.', 'x.x', '.x.'], ['x..', 'x.x', 'xxx'], ['..x', '.x.', 'x.x'],
];

// small screen-space motifs: 1 dark, 2 mid, 3 light
const MOTIF = {
  flame: ['..1..', '..2..', '.121.', '.232.', '12321', '13331', '.232.'],
  flame2: ['.1.', '.2.', '121', '232', '.3.'],
  frost: ['..1..', '.121.', '12321', '.121.', '..1..'],
  icicle: ['222', '232', '.2.', '.2.', '.1.'],
  drip: ['2.', '2.', '32', '232', '.2.'],
  drop: ['.2.', '232', '.2.'],
  wisp: ['..2.', '.2..', '.12.', '..21', '..1.', '.1..'],
  star: ['..2..', '..3..', '23332', '..3..', '..2..'],
};

// ------------------------------------------------------------------ main
export function paintWeapon(w, S) {
  const k = S / 96;
  const det = S >= 72 ? 2 : S >= 40 ? 1 : 0;
  const look = weaponLook(w);
  const seed = [...(w.ids || []).join(',') + w.bp].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
  const p = new Painter(S, S);
  const tag = new Uint8Array(S * S); // 1 glowing part (blade/head/orb), 2 hilt/shaft
  const uvAt = new Float32Array(S * S * 2);
  const ox = 5 * k, oy = 91 * k;
  const U2S = (u, v) => [ox + (u - v) * R2 * k, oy - (u + v) * R2 * k];
  const px = 1 / k; // design units per screen pixel
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5 - ox) / k, dy = (y + 0.5 - oy) / k, i = (x + y * S) * 2;
    uvAt[i] = (dx - dy) * R2; uvAt[i + 1] = -(dx + dy) * R2;
  }
  const paint = (fn, t = 2) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (x + y * S) * 2;
      const c = fn(uvAt[i], uvAt[i + 1], x, y);
      if (c) { p.set(x, y, c); tag[x + y * S] = t; }
    }
  };
  const BT = R(look.blade), GT = R(look.guard), HT = R(look.grip, 0.85), WT = R('#8a5634', 0.9);
  const GEM = look.gem ? R(look.gem) : look.els[0] ? R(EL_COLOR[look.els[0]]) : null;
  const ctx = { p, tag, k, S, det, look, w, seed, paint, U2S, px, BT, GT, HT, WT, GEM, glowU: [0, 999] };

  const bp = PAINTERS[w.bp] ? w.bp : 'sword';
  PAINTERS[bp](ctx);

  outline(p, tag);
  if (S >= 64) rim2(p, tag);
  glow(ctx, uvAt);
  motifs(ctx);
  if (look.grade >= 4) {
    const [x, y] = U2S(ctx.tipU - 9, 6);
    sparkle(p, Math.round(x), Math.round(y), '#fff6c8', det);
  } else if (look.polish && det) {
    const [x, y] = U2S(ctx.tipU - 18, 4);
    sparkle(p, Math.round(x), Math.round(y), '#ffffff', 0);
  }
  return p.toCanvas();
}

// ------------------------------------------------------------------ shared parts
function cylIdx(s) { return s > 0.55 ? 4 : s > 0.08 ? 3 : s > -0.5 ? 2 : 1; }

/** Leather / silk / flesh wrapped grip between u0 and u1. */
function grip(c, u0, u1, r, vc = () => 0) {
  const { look, HT, det, px } = c;
  const P = Math.max(3.2, 2.2 * px);
  const silk = look.has('spider_silk'), flesh = look.grip === '#c4607e', scale = look.grip === '#a83a2a';
  c.paint((u, v, x, y) => {
    if (u < u0 || u > u1) return null;
    const d = v - vc(u);
    const ph = (u + d * 0.9) / P, f = fr(ph);
    const rr = r + (f > 0.3 && f < 0.85 ? 0.35 : 0);
    if (Math.abs(d) > rr) return null;
    const s = d / rr;
    let i = cylIdx(s);
    if (flesh) { if (hash2(x, y, 3) > 0.9) i -= 1; return at(HT, i + (s > 0.4 && s < 0.7 ? 1 : 0)); }
    if (scale) { const sv = fr((u + Math.floor(d + 9) * 1.5) / 3); if (sv < 0.3) i -= 1; else if (sv > 0.7 && s > -0.2) i += 1; return at(HT, i); }
    if (f < 0.24) i -= 2; else if (f > 0.5 && f < 0.78 && s > -0.35) i += 1;
    if (silk && det && fr((u - d * 0.9) / P) < 0.18) i -= 1;
    return at(HT, i);
  }, 2);
}

/** Cylindrical shaft (wood) with grain and knots; gnarl bends it. */
function shaft(c, u0, u1, r, o = {}) {
  const T = o.T || c.WT;
  const vc = o.gnarl ? (u) => Math.sin(u * 0.11 + 1) * 0.7 + (fbm2(u * 0.05, 3, 2, c.seed) - 0.5) * 1.6 : () => 0;
  c.paint((u, v, x, y) => {
    if (u < u0 || u > u1) return null;
    const d = v - vc(u);
    let rr = r;
    if (o.gnarl) rr += Math.max(0, Math.sin(u * 0.37 + 2) - 0.75) * 2.4;
    if (o.taper) rr *= 1 - o.taper * (u - u0) / (u1 - u0);
    if (Math.abs(d) > rr) return null;
    const s = d / rr;
    let i = cylIdx(s);
    const g = Math.sin(d * 2.1 + fbm2(u * 0.07, d * 0.2, 2, c.seed) * 7);
    if (g > 0.8) i -= 1;
    if (hash2(Math.floor(u / 9), 1, c.seed) > 0.8 && Math.abs(fr(u / 9) - 0.5) < 0.12 && Math.abs(d) < rr * 0.5) i -= 1;
    return at(T, i);
  }, 2);
  return vc;
}

/** Metal ring/cap around a shaft. */
function ring(c, u0, u1, r, T = c.GT, o = {}) {
  c.paint((u, v) => {
    if (u < u0 || u > u1) return null;
    let rr = r;
    if (o.round) { const m = (u1 - u0) / 2, t = (u - u0 - m) / m; rr = r * Math.sqrt(Math.max(0, 1 - t * t * 0.55)); }
    if (o.cone) rr = lerp(o.cone[0], o.cone[1], (u - u0) / (u1 - u0));
    if (Math.abs(v) > rr) return null;
    const s = v / rr;
    let i = s > 0.5 ? 5 : s > 0.05 ? 4 : s > -0.5 ? 3 : 1;
    if (u - u0 < 0.8 || u1 - u < 0.8) i -= 1;
    return at(T, i);
  }, 2);
}

/** Round cabochon gem at local (u, v), radius r (design units). */
function gem(c, u, v, r, T = c.GEM) {
  if (!T) return;
  const [cx, cy] = c.U2S(u, v);
  const rr = Math.max(1.2, r * c.k);
  const { p } = c;
  for (let y = Math.floor(cy - rr - 1); y <= cy + rr + 1; y++) for (let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++) {
    const nx = (x + 0.5 - cx) / rr, ny = (y + 0.5 - cy) / rr, d2 = nx * nx + ny * ny;
    if (d2 > 1) continue;
    let i = d2 > 0.62 ? (nx + ny > 0 ? 2 : 1) : nx + ny < -0.5 ? 4 : nx + ny > 0.6 ? 4 : 3;
    if (nx + ny > 0.3 && d2 > 0.25 && d2 < 0.62) i = 5;
    p.set(x, y, T[i]);
  }
  const hx = Math.round(cx - rr * 0.4), hy = Math.round(cy - rr * 0.4);
  p.set(hx, hy, T[6]);
  if (rr > 2.5) p.set(hx + 1, hy, T[5]);
}

/** Ornate crossguard: curved bar with finials, raised diamond boss, langet; fang spikes for fanged blades. */
function crossguard(c, g) {
  const { GT, look, det } = c;
  const fangTips = look.fangs >= 2;
  c.paint((u, v) => {
    const a = Math.abs(v), sg = v >= 0 ? 1 : -1;
    // diamond boss
    const du = u - g.u - 0.4;
    const db = Math.abs(du) / g.boss[0] + a / g.boss[1];
    if (db <= 1) {
      let i;
      if (Math.abs(du) / g.boss[0] > a / g.boss[1]) i = du > 0 ? 4 : 2; else i = sg > 0 ? 5 : 2;
      if (db > 0.82) i -= 1;
      return at(GT, i);
    }
    // langet over the blade base
    if (g.langet && u > g.u + 2 && u < g.u + g.langet && a < 3.2 * (1 - (u - g.u - 2) / (g.langet - 2)) + 0.6) return at(GT, sg > 0 ? 4 : 2);
    // bar
    const tt = Math.min(1, a / g.gw);
    const uc = g.u + g.curve * tt * tt;
    const th = g.th * (1 - 0.3 * tt);
    const s = (u - uc) / th;
    if (a <= g.gw && Math.abs(s) <= 1) {
      let i = s > 0.5 ? 4 : s > -0.35 ? 3 : 1;
      if (sg > 0 && a > g.boss[1] * 0.8) i += 1;
      if (sg < 0 && a > g.gw * 0.55) i -= 1;
      if (det >= 2 && look.grade >= 4 && Math.abs(s) < 0.22 && a > g.boss[1]) i = 5;
      return at(GT, i);
    }
    if (fangTips) {
      const fu = g.u + g.curve - 1, t = (u - fu) / 9;
      if (t >= 0 && t <= 1 && Math.abs(a - (g.gw - 1.2 * t)) < 1.8 * (1 - t)) return at(R('#ece2c6'), a - (g.gw - 1.2 * t) > 0 ? 3 : 5 - Math.round(t * 2));
    }
    // finials
    const fu = g.u + g.curve + 0.4, fv = g.gw + 0.6;
    const fd = Math.hypot((u - fu) / g.fin, (a - fv) / g.fin);
    if (fd <= 1) {
      const nx = (a - fv) * sg / g.fin, nu = (u - fu) / g.fin;
      return at(GT, nx > 0.3 || nu + nx > 0.6 ? 5 : nx < -0.4 ? 2 : fd > 0.7 ? 2 : 3);
    }
    return null;
  }, 2);
  if (det) gem(c, g.u + 0.4, 0, g.gemR * (look.grade >= 3 ? 1.35 : 1));
  if (look.grade >= 3 || look.cursed || look.fangs >= 2) horns(c, g, look.grade >= 4 ? 17 : 12, look.cursed ? 4.2 : 3.4);
  if (look.grade >= 4 && det) { gem(c, g.u + g.curve + 0.4, g.gw + 0.6, 1.5); gem(c, g.u + g.curve + 0.4, -g.gw - 0.6, 1.5); }
}

/** Curling ram horns sprouting from the guard's finials (ornate, cursed and masterwork pieces). */
function horns(c, g, len, curl) {
  const { GT, look } = c;
  const T = look.cursed ? R('#5a3a6e') : look.fangs >= 2 ? R('#e6dcc0') : GT;
  const lines = [1, -1].map((sg) => {
    const pts = [];
    let u = g.u + g.curve * 0.7, v = sg * (g.gw - 0.8), dir = 0.45;
    const n = 26;
    for (let i = 0; i <= n; i++) { pts.push([u, v, i / n]); const st = len / n; dir += curl / n; u += Math.sin(dir) * st; v += sg * Math.cos(dir) * st; }
    return pts;
  });
  c.paint((u, v) => {
    let best = 1e9, bt = 0, bs = 1;
    for (const pts of lines) for (let i = 0; i + 1 < pts.length; i++) {
      const [u0, v0, t0] = pts[i], [u1, v1] = pts[i + 1];
      const eu = u1 - u0, ev = v1 - v0, l2 = eu * eu + ev * ev || 1;
      const q = clamp(((u - u0) * eu + (v - v0) * ev) / l2);
      const du = u - (u0 + eu * q), dv = v - (v0 + ev * q), dd = du * du + dv * dv;
      if (dd < best) { best = dd; bt = t0 + q / (pts.length - 1); bs = dv >= 0 ? 1 : -1; }
    }
    const r = lerp(2.3, 0.5, bt), d = Math.sqrt(best);
    if (d > r) return null;
    let i = d / r > 0.72 ? (bs > 0 ? 3 : 1) : bs > 0 ? 5 : 3;
    if (fr(bt * 7) < 0.2) i -= 1; // ribbed horn
    if (bt > 0.9) i = 5;
    return at(T, i);
  }, 2);
}

/** Pommel: faceted ball with a cap nub and a gem/core. */
function pommel(c, u, r) {
  const { GT, look } = c;
  c.paint((uu, v) => {
    const du = uu - u, d = Math.hypot(du, v);
    const capU = u - r + 0.2;
    if (d > r) {
      if (Math.hypot(uu - capU, v) <= r * 0.42) return at(GT, v > 0.2 ? 4 : 2);
      return null;
    }
    const nx = v / r, nu = du / r;
    let i = nx * 0.85 + nu * 0.15 > 0.35 ? 5 : nx > -0.2 ? 4 : nx > -0.65 ? 2 : 1;
    if (d / r > 0.86) i -= 1;
    return at(GT, i);
  }, 2);
  if (look.core) gem(c, u, 0, r * 0.55, R(look.core));
  else if (c.det) gem(c, u, 0, r * 0.5);
}

/** Bevelled blade with fuller, runes, material surface and element-tinted edges. */
function blade(c, b) {
  const { BT, look, det, seed, px } = c;
  const vc = b.wave ? (u) => Math.sin((u - b.u0) * 0.3) * b.wave * clamp((b.tip - u) / 12) * clamp((u - b.u0) / 6) : () => 0;
  const hwAt = (u) => {
    if (u < b.u0 || u > b.tip) return -1;
    const t = (u - b.u0) / (b.tip - b.u0);
    let hw = lerp(b.hw0, b.hw1, t);
    if (b.leaf) hw *= 0.86 + 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.25));
    return Math.min(hw, (b.tip - u) * b.slope);
  };
  const fEnd = b.u0 + (b.tip - b.u0) * 0.62;
  const fuller = det >= 1 && !look.glass && !look.bone && b.fuller !== false;
  const elTint = look.els[0] ? EL_RAMP[look.els[0]] : null;
  const glintU = b.u0 + (b.tip - b.u0) * 0.74;
  c.tipU = b.tip;
  c.glowU = [b.u0 - 2, b.tip + 2];
  c.paint((u, v, x, y) => {
    let hw = hwAt(u);
    if (hw <= 0) return null;
    const d = v - vc(u);
    if (look.glass) hw -= 0.85 * Math.abs(Math.sin(u * 0.55 + (d > 0 ? 0 : 1.3)));
    if (look.bone) hw *= 1 + (fbm2(u * 0.12, d > 0 ? 0 : 5, 2, seed) - 0.5) * 0.2;
    if (Math.abs(d) > hw) return null;
    const e = hw - Math.abs(d);
    // serrated back for fanged blades
    if (look.fangs && d < 0 && u > b.u0 + 5 && u < b.tip - 9 && e < 2.4 && e < (1 - fr((u - b.u0) / 3.4)) * 2.4) return null;
    // crude: chipped edges
    if (look.grade <= 0 && e < 1.2 && hash2(Math.floor(u / 2.5), d > 0 ? 1 : 2, seed) > 0.78) return null;
    const bev = Math.min(1.55, hw * 0.32) + (px > 1.4 ? 0.4 : 0);
    let i;
    if (d >= 0) i = e < bev ? (e < 0.8 && look.polish ? 6 : 5) : d < 0.75 ? 5 : d < hw * 0.45 ? 4 : 3;
    else i = e < bev ? 3 : d > -0.75 ? 1 : 2;
    // ricasso: plain darker band near the guard
    if (u < b.u0 + 3) i = d >= 0 ? 4 : 2;
    // fuller groove
    const fw = Math.min(2.3, hw * 0.44) * clamp((fEnd - u) / 5);
    if (fuller && u > b.u0 + 3 && u < fEnd && Math.abs(d) < fw) {
      i = d > fw * 0.35 ? 1 : d < -fw * 0.35 ? 4 : 2;
      if (look.grade >= 4 && Math.abs(Math.abs(d) - fw) < 0.5) return '#ffd04a';
    }
    // glint streak
    if (Math.abs(u - glintU - d * 0.45) < 0.75 && e >= bev) i = Math.min(6, i + (d >= 0 ? 2 : 1));
    let T = BT;
    if (look.glass) {
      const f = Math.floor((u + Math.abs(d) * 1.1) / 4.5);
      i = d >= 0 ? 4 : 2;
      if (f % 2) i += d >= 0 ? 1 : -1;
      if (fr((u + Math.abs(d) * 1.1) / 4.5) < 0.16) i = d >= 0 ? 6 : 4;
      if (e < 0.9) i = d >= 0 ? 6 : 3;
      if (look.kind === 'prism') T = R(['#ff7aa8', '#ffd46a', '#8af0a0', '#7ac8ff', '#c89aff'][((f % 5) + 5) % 5]);
      if (det && hash2(x, y, seed + 9) > 0.97) i = 6;
    }
    // etched, hammered steel: mottled tone shifts and flecks across the whole blade
    if (det >= 2 && !look.glass && !look.bone && e >= bev * 0.6) {
      const n = fbm2(u * 0.17, d * 0.55, 3, seed + 11), h = hash2(x, y, seed + 21);
      if (n > 0.63 || h > 0.968) i -= 1; else if (n < 0.32 && h > 0.86) i += 1;
    }
    let col = at(T, i);
    if (look.stars) {
      const n = fbm2(u * 0.07, d * 0.25, 3, seed);
      if (n > 0.6 && i < 5) col = mixHex(col, '#8a7aff', 0.3);
      const h = hash2(x, y, seed + 1);
      if (h > 0.975) col = '#fff6d8'; else if (h > 0.955) col = '#a8b8ff';
    }
    if (look.veins) {
      const n = Math.abs(fbm2(u * 0.085, d * 0.34 + 4, 3, seed) - 0.5);
      if (n < 0.025) col = mixHex(look.veins, '#fff0b0', 0.35); else if (n < 0.05) col = look.veins;
      else if (n < 0.07) col = mixHex(col, look.veins, 0.35);
    }
    if (look.rust) {
      const n = fbm2(u * 0.13, d * 0.3, 3, seed + 4);
      if (n > (look.metal === 'junk' ? 0.52 : 0.64)) col = at(R('#9a5228'), i - 1 + (hash2(x, y, 5) > 0.8 ? -1 : 0));
    }
    if (look.patina && fbm2(u * 0.15, d * 0.3, 3, seed + 6) > 0.6) col = mixHex(col, look.patina, 0.6);
    if (look.bone && hash2(x, y, seed + 2) > 0.93) col = at(T, i - 2);
    if (elTint && e < bev + 0.2) col = mixHex(col, elTint[d >= 0 ? 2 : 1], 0.5);
    return col;
  }, 1);
  // runes in the fuller
  if (fuller && det >= 2 && look.runes) {
    const el = look.els[0];
    const rc = el ? EL_RAMP[el][2] : look.cursed ? '#ff9af8' : look.has('runestone') ? '#9ad8ff' : '#ffd04a';
    let n = 0;
    for (let u = b.u0 + 6; u < fEnd - 4; u += 6, n++) {
      const [sx, sy] = c.U2S(u, vc(u));
      const g = RUNES[(seed + n * 7) % RUNES.length];
      const cx = Math.round(sx) - 1, cy = Math.round(sy) - 1;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (g[j][i] === 'x') c.p.set(cx + i, cy + j, rc);
    }
  }
  return { vc, hwAt };
}

// ------------------------------------------------------------------ blueprints
const PAINTERS = {
  sword(c) {
    const big = c.look.has('golem_core') || c.look.has('skull');
    pommel(c, 5, 4.2);
    grip(c, 8, 27.5, 2.5);
    ring(c, 26.5, 29.5, 3.3);
    blade(c, { u0: 33, tip: 120, hw0: big ? 6.4 : 5.7, hw1: big ? 5.6 : 4.7, slope: 1 });
    crossguard(c, { u: 31.2, gw: 14, th: 2.5, curve: 2.6, fin: 2.4, boss: [4.4, 5.2], langet: 8, gemR: 2.4 });
  },
  dagger(c) {
    const kris = c.look.has('spider_silk');
    pommel(c, 21, 3.7);
    grip(c, 24, 38.5, 2.4);
    ring(c, 37.5, 40, 3);
    blade(c, { u0: 43, tip: 103, hw0: 6, hw1: 3.8, slope: 0.8, leaf: !kris, wave: kris ? 1.5 : 0 });
    crossguard(c, { u: 41.5, gw: 10, th: 2.2, curve: 3.6, fin: 2.1, boss: [3.8, 4.4], langet: 6.5, gemR: 2 });
  },
  axe(c) {
    const { look, BT, GT, det, seed } = c;
    const uh = 91;
    shaft(c, 2, uh + 9, 2.5);
    grip(c, 7, 34, 2.9);
    ring(c, 1, 5, 3.1, GT, { round: true });
    ring(c, 34, 36.5, 3.2);
    // blade on the lit (+v) side: bearded crescent
    const cu = uh - 3, cv = -2, A = 25;
    const pts = [[uh + 4.5, 3.4], [uh + 4.5, 8], [uh + 7, 11], [uh + 11.5, 13.8]];
    for (let a = 44; a <= 140; a += 6) { const r = (a * Math.PI) / 180; pts.push([cu + A * Math.cos(r), cv + A * Math.sin(r)]); }
    pts.push([uh - 17, 12.4], [uh - 11, 10.8], [uh - 6.5, 8.8], [uh - 4.5, 6.6], [uh - 4.5, 3.4]);
    const junk = look.metal === 'junk', teeth = look.has('mimic_teeth') || look.fangs >= 2;
    c.paint((u, v, x, y) => {
      const rho = Math.hypot(u - cu, v - cv) / A;
      const ang = Math.atan2(v - cv, u - cu);
      let inside = v > 3 && inPoly(pts, u, v);
      if (junk && rho > 0.95 && hash2(Math.floor(ang * 30), 2, seed) > 0.7) inside = false;
      if (!inside && teeth && v > 8 && rho > 0.99 && rho < 1.09) {
        const f = fr(ang * 9);
        if (rho - 0.99 < 0.1 * (1 - Math.abs(f * 2 - 1))) return at(R('#f2e8cc'), f < 0.5 ? 5 : 3);
      }
      if (!inside) return null;
      let i = v < 6 ? 2 : 3;
      if (u > uh + 2 && v > 5) i = 4;
      if (u < uh - 10 && v < 13) i = 2;
      if (rho > 0.9) i = rho > 0.965 ? 6 : 5;
      else if (rho > 0.86) i = 1;
      if (det >= 2 && Math.abs(Math.hypot(u - (uh - 2), v - 14) - 3.4) < 0.55) i = 1;
      let col = at(BT, i);
      if (look.rust && fbm2(u * 0.13, v * 0.13, 3, seed) > (junk ? 0.5 : 0.64)) col = at(R('#9a5228'), i - 1);
      if (look.veins) { const n = Math.abs(fbm2(u * 0.09, v * 0.09, 3, seed) - 0.5); if (n < 0.03) col = look.veins; }
      if (look.stars && hash2(x, y, seed) > 0.97) col = '#fff6d8';
      if (look.els[0] && rho > 0.9) col = mixHex(col, EL_RAMP[look.els[0]][2], 0.45);
      return col;
    }, 1);
    // back spike (-v) and socket
    c.paint((u, v) => {
      if (v < -3.5 && v > -12.5) { const t = (-v - 3.5) / 9, half = 4.2 * (1 - t); if (Math.abs(u - uh - 1.5 * t) < half) return at(BT, u - uh - 1.5 * t > 0 ? 4 : 2); }
      if (Math.abs(v) <= 4.2 && Math.abs(u - uh) <= 8.5) {
        const s = v / 4.2; let i = s > 0.5 ? 4 : s > -0.4 ? 3 : 1;
        if (Math.abs(u - uh) > 7.5) i -= 1;
        if (c.det && Math.hypot(u - uh - 4.5, v) < 1.1) i = 5; if (c.det && Math.hypot(u - uh + 4.5, v) < 1.1) i = 5;
        return at(GT, i);
      }
      return null;
    }, 1);
    if (det >= 2) gem(c, uh - 2, 14, 2.1);
    c.tipU = uh + 4; c.glowU = [uh - 24, uh + 18];
  },
  hammer(c) {
    const { look, BT, GT, det, seed } = c;
    const uh = 89, H = 11, V = 21;
    const T = look.bone ? R('#e6dcc0') : look.has('magmasteel') ? R('#4a3432') : BT;
    shaft(c, 2, uh + 6, 2.8);
    grip(c, 7, 33, 3.1);
    ring(c, 1, 5, 3.3, GT, { round: true });
    ring(c, 33, 35.5, 3.4);
    // langets
    c.paint((u, v) => (u > uh - 20 && u < uh - 8 && Math.abs(v) < 3.4 ? at(GT, v > 1.2 ? 5 : v > -1 ? 3 : 1) : null), 2);
    c.paint((u, v, x, y) => {
      const a = Math.abs(v), du = u - uh, sg = v >= 0 ? 1 : -1;
      if (a > V) return null;
      const half = a <= 7.5 ? H : a <= 16 ? 8.2 + (a - 7.5) * 0.12 : H - 0.5;
      if (Math.abs(du) > half) return null;
      if (a > 16 && Math.abs(du) + (a - V + 2.4) > half) return null; // chamfer striking face
      if (a <= 7.5 && Math.abs(du) + a > H + 5.5) return null; // chamfer core
      const s = du / half;
      let i = s > 0.72 ? 4 : s < -0.72 ? 1 : 3;
      if (a > V - 1.6) i = sg > 0 ? 5 : 1;
      if (Math.abs(a - 7.5) < 0.6 || Math.abs(a - 16) < 0.6) i = 1;
      else if (Math.abs(a - 8.4) < 0.4 || Math.abs(a - 16.9) < 0.4) i = Math.min(5, i + 1);
      if (sg > 0 && a > 8 && s > -0.72) i = Math.min(5, i + (a > 16 ? 1 : 0));
      let col = at(T, i);
      if (a > 13.5 && a < 15.6 && Math.abs(s) < 0.95) col = at(GT, s > 0.5 ? 5 : s < -0.55 ? 1 : 3); // bands
      if (det >= 2 && a < 6.5 && Math.abs(Math.abs(du) - 9) < 0.5) col = at(T, 1);
      if (det && a > 3.2 && a < 5.6 && Math.abs(Math.abs(du) - 7.2) < 1.2) col = at(GT, sg > 0 && du > 0 ? 6 : 4); // rivets
      if (look.veins || look.has('magmasteel')) { const n = Math.abs(fbm2(u * 0.09, v * 0.09, 3, seed) - 0.5); if (n < 0.03) col = '#ffb04a'; else if (n < 0.055) col = '#d8502a'; }
      if (look.rust && fbm2(u * 0.12, v * 0.12, 3, seed) > 0.62) col = at(R('#9a5228'), i - 1);
      if (look.stars && hash2(x, y, seed) > 0.97) col = '#fff6d8';
      if (look.bone && hash2(x, y, seed + 2) > 0.93) col = at(T, i - 2);
      return col;
    }, 1);
    if (look.core) gem(c, uh, 0, 4.6, R(look.core));
    else if (look.skull) skullEmblem(c, uh, 0);
    else if (det) gem(c, uh, 0, 3.6);
    c.tipU = uh + 6; c.glowU = [uh - 13, uh + 13];
  },
  spear(c) {
    const { look, BT, GT, det } = c;
    shaft(c, 4, 90, 2.0);
    grip(c, 30, 46, 2.5);
    ring(c, 0.5, 6, 2.7, GT, { cone: [0.6, 2.7] });
    ring(c, 84, 95, 3.2, GT, { cone: [2.4, 3.3] });
    ring(c, 86, 87.6, 3.6); ring(c, 91, 92.6, 3.8);
    // lugs
    c.paint((u, v) => { const a = Math.abs(v); if (u > 89 && u < 96 && a > 3 && a < 3 + (u - 89) * 0.55 && a < 6.3) return at(GT, v > 0 ? 4 : 2); return null; }, 2);
    blade(c, { u0: 95, tip: 122, hw0: 6.6, hw1: 3.6, slope: 0.9, leaf: true, fuller: false });
    // diamond ridge highlight
    c.paint((u, v) => (u > 97 && u < 118 && v >= 0 && v < 0.7 ? at(BT, 6) : null), 1);
    tassel(c, 86, look.feather);
    c.tipU = 122;
  },
  staff(c) {
    const { look, GT, det, seed } = c;
    const uo = 103, ro = 9.5;
    const T = R('#6e4226', 0.9);
    const vc = shaft(c, 4, 96, 2.5, { gnarl: true, T });
    ring(c, 1, 5.5, 3.0, GT, { round: true });
    grip(c, 40, 54, 3.1, vc);
    // ribbon spiral up the shaft
    c.paint((u, v) => {
      if (u < 64 || u > 92) return null;
      const d = v - vc(u);
      if (Math.abs(d) > 2.9) return null;
      const f = fr((u + d * 1.3) / 7);
      if (f > 0.26) return null;
      return at(GT, f < 0.08 ? 2 : d > 0.5 ? 5 : d > -1 ? 4 : 2);
    }, 2);
    ring(c, 92, 97, 3.6);
    // holder: crescent for moonstone, else three claws
    const moon = look.has('moonstone') || look.has('wisp_essence');
    c.paint((u, v) => {
      const du = u - uo, dist = Math.hypot(du, v);
      const ang = Math.atan2(v, -du) * 180 / Math.PI; // 0 = toward butt
      const aa = Math.abs(ang);
      if (moon) {
        const outer = Math.hypot(du + 1.5, v) <= ro + 4.2, inner = Math.hypot(du - 3.4, v) <= ro + 1.4;
        if (outer && !inner && du < 8) return at(R('#c8d4e8'), v > 2 ? 5 : v > -3 ? 4 : 2);
        return null;
      }
      if (aa < 22 || aa > 150) return null;
      const t = (aa - 22) / 128;
      const r0 = ro + 0.4, r1 = ro + 2.8 * (1 - t * 0.55);
      if (dist < r0 || dist > r1) return null;
      if (aa > 60 && aa < 100 && t > 0) { /* gap between claws */ }
      return at(GT, v > 0 ? (dist - r0 < 1 ? 3 : 5) : dist - r0 < 1 ? 1 : 2);
    }, 2);
    // orb
    const OT = c.GEM || R('#b8d8ff');
    c.paint((u, v, x, y) => {
      const du = u - uo, d = Math.hypot(du, v);
      if (d > ro) return null;
      const [sx, sy] = [(du - v) * R2 / ro, -(du + v) * R2 / ro];
      const nz = Math.sqrt(Math.max(0, 1 - sx * sx - sy * sy));
      const L = -sx * 0.5 - sy * 0.65 + nz * 0.57;
      let i = L > 0.85 ? 5 : L > 0.55 ? 4 : L > 0.2 ? 3 : L > -0.1 ? 2 : 1;
      const sw = Math.abs(fbm2(du * 0.25 + 3, v * 0.25, 2, seed) - 0.5);
      if (sw < 0.05 && d < ro * 0.85) i = Math.min(6, i + 2);
      if (d > ro - 1.1 && sx + sy > 0) i = 4; // rim light inside the glass
      return at(OT, i);
    }, 1);
    const [hx, hy] = c.U2S(uo + 2.5, 3.2);
    c.p.set(Math.round(hx), Math.round(hy), '#ffffff');
    if (det) c.p.set(Math.round(hx) + 1, Math.round(hy), OT[6]);
    c.tipU = uo + ro; c.glowU = [uo - ro - 1, uo + ro + 3];
  },
  pickaxe(c) {
    const { look, BT, GT, det, seed } = c;
    const uh = 95;
    shaft(c, 3, uh + 5, 2.5);
    grip(c, 7, 33, 2.9);
    ring(c, 1, 5, 3.1, GT, { round: true });
    ring(c, 33, 35.5, 3.2);
    c.paint((u, v, x, y) => {
      const a = Math.abs(v);
      if (a > 25) return null;
      const uc = uh - 8.5 * (a / 25) ** 2;
      const th = 0.9 + 3.6 * (1 - (a / 25.5) ** 1.6);
      const s = (u - uc) / th;
      if (Math.abs(s) > 1) return null;
      let i = s > 0.42 ? 4 : s < -0.45 ? 1 : 3;
      if (v > 0) i += 1; else if (a > 8) i -= 0;
      if (a > 19) i = s > -0.2 ? 6 : 3;
      let col = at(BT, i);
      if (look.rust && fbm2(u * 0.13, v * 0.13, 3, seed) > 0.6) col = at(R('#9a5228'), i - 1);
      if (look.stars && hash2(x, y, seed) > 0.97) col = '#fff6d8';
      if (look.els[0] && a > 18) col = mixHex(col, EL_RAMP[look.els[0]][2], 0.4);
      return col;
    }, 1);
    c.paint((u, v) => {
      if (Math.abs(v) > 4.6 || Math.abs(u - uh) > 6.6) return null;
      const s = v / 4.6; let i = s > 0.45 ? 4 : s > -0.4 ? 3 : 1;
      if (Math.abs(u - uh) > 5.6) i -= 1;
      return at(GT, i);
    }, 1);
    if (det) { if (look.gem) gem(c, uh, 0, 2.2); else c.paint((u, v) => (Math.hypot(u - uh, v) < 1.3 ? at(GT, v > 0 ? 6 : 4) : null), 1); }
    c.tipU = uh + 4; c.glowU = [uh - 12, uh + 8];
  },
};

function skullEmblem(c, u, v) {
  const [cx, cy] = c.U2S(u, v);
  const rows = ['.xxxxx.', 'xxxxxxx', 'xo.x.ox', 'xoox.oo', 'xxx.xxx', '.xxxxx.', '.x.x.x.'];
  const T = R('#ece2c6');
  const x0 = Math.round(cx) - 3, y0 = Math.round(cy) - 3;
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === 'x') c.p.set(x0 + i, y0 + j, j < 2 || i < 2 ? T[5] : T[3]);
    else if (ch === 'o' || (ch === '.' && j >= 2 && j <= 4 && i > 0 && i < 6)) c.p.set(x0 + i, y0 + j, '#2a1418');
  }));
}

function tassel(c, u, feather) {
  const { p, k } = c;
  const [ax, ay] = c.U2S(u, -2.6);
  const L = Math.max(5, Math.round(13 * k));
  if (feather) {
    for (let f = 0; f < 2; f++) for (let j = 0; j < L; j++) {
      const x = Math.round(ax - f * 3 * k - j * 0.25), y = Math.round(ay + j);
      const w = Math.max(1, Math.round(Math.sin((j / L) * Math.PI) * 2.2 * k));
      for (let i = -w; i <= w; i++) p.set(x + i, y, i === 0 ? '#8a7a64' : i < 0 ? '#e8dcc4' : '#b8a888');
    }
    return;
  }
  const col = c.look.els[0] ? EL_RAMP[c.look.els[0]] : ['#7a1e22', '#c43a32', '#f07a5a'];
  const strands = Math.max(2, Math.round(4 * k));
  for (let s = 0; s < strands; s++) for (let j = 0; j < L - (s % 2) * 2; j++) {
    const x = Math.round(ax - 1 + s - Math.sin(j * 0.3 + s) * 0.8), y = Math.round(ay + 2 + j);
    p.set(x, y, s === 0 ? col[1] : s === strands - 1 ? col[0] : j % 4 === 1 ? col[2] : col[1]);
  }
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= strands; i++) p.set(Math.round(ax - 1 + i), Math.round(ay + 1 + j), j < 0 ? at(c.GT, 5) : at(c.GT, 3));
}

// ------------------------------------------------------------------ outline, glow, motifs
function outline(p, tag) {
  const S = p.w, add = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (p.alpha(x, y) > 40) continue;
    let nb = null;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (p.alpha(x + dx, y + dy) > 40) { nb = [x + dx, y + dy]; break; }
    if (!nb) continue;
    const c = p.get(nb[0], nb[1]);
    const lit = p.alpha(x + 1, y) > 40 || p.alpha(x, y + 1) > 40;
    add.push([x, y, mixHex(INK, '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join(''), lit ? 0.26 : 0.1), tag[nb[0] + nb[1] * S]]);
  }
  for (const [x, y, col, t] of add) { p.set(x, y, col); tag[x + y * S] = t | 4; }
}

/** A second, softer dark ring outside the ink line: the bold sticker edge of big pixel swords. */
function rim2(p, tag) {
  const S = p.w, add = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (p.alpha(x, y) > 40) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < S && ny < S && (tag[nx + ny * S] & 4)) { add.push([x, y]); break; } }
  }
  for (const [x, y] of add) p.set(x, y, '#08060a', 150);
}

function glow(c, uvAt) {
  const { p, tag, S, look, det } = c;
  if (!look.els.length && !(look.grade >= 4) && !look.cursed) return;
  const cols = look.els.length ? look.els.slice(0, 2).map((e) => EL_RAMP[e]) : look.cursed ? [EL_RAMP.curse] : [['#c8902a', '#ffd04a', '#fff6c8']];
  const rings = det >= 2 ? 3 : det ? 2 : 1;
  const strength = look.els.length ? 1 : 0.6;
  let edge = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((tag[x + y * S] & 5) === 5) edge.push([x, y]);
  const seen = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) if (p.data[i * 4 + 3] > 40) seen[i] = 1;
  const alphas = [255, 150, 60].map((a) => a * strength);
  for (let r = 0; r < rings; r++) {
    const next = [];
    for (const [x, y] of edge) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= S || ny >= S || seen[nx + ny * S]) continue;
      seen[nx + ny * S] = 1;
      const u = uvAt[(nx + ny * S) * 2];
      const t = clamp((u - c.glowU[0]) / (c.glowU[1] - c.glowU[0]));
      const C = cols.length > 1 ? (t < 0.5 ? cols[0] : cols[1]) : cols[0];
      const col = r === 0 ? (hash2(nx, ny, 3) > 0.7 ? C[2] : C[1]) : C[r === 1 ? 1 : 0];
      p.set(nx, ny, col, alphas[r]);
      next.push([nx, ny]);
    }
    edge = next;
  }
}

function stamp(p, rows, x0, y0, pal, a = 255) {
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') p.set(x0 + i, y0 + j, pal[+ch - 1], a); }));
}

function motifs(c) {
  const { p, look, det, U2S, seed, w } = c;
  if (!det || !look.els.length) return;
  const [u0, u1] = c.glowU;
  look.els.slice(0, 2).forEach((el, n) => {
    const pal = EL_RAMP[el];
    const cnt = Math.min(det >= 2 ? 6 : 3, 2 + Math.round((w.el || {})[el] || 1));
    for (let i = 0; i < cnt; i++) {
      const t = (i + 0.5 + n * 0.37) / cnt, u = lerp(u0 + 4, u1 - 6, t);
      const h = hash2(i, n, seed);
      const up = U2S(u, 9 + h * 3), dn = U2S(u, -9 - h * 3);
      const big = det >= 2;
      if (el === 'fire') stamp(p, big && i % 2 === 0 ? MOTIF.flame : MOTIF.flame2, Math.round(up[0]) - 2, Math.round(up[1]) - 5, pal);
      else if (el === 'ice') { if (i % 2) stamp(p, MOTIF.icicle, Math.round(dn[0]) - 1, Math.round(dn[1]) - 2, pal); else stamp(p, big ? MOTIF.frost : MOTIF.drop, Math.round(up[0]) - 2, Math.round(up[1]) - 2, pal); }
      else if (el === 'shock') bolt(p, up[0], up[1], h, pal, big);
      else if (el === 'poison' || el === 'bleed') stamp(p, i % 2 ? MOTIF.drip : MOTIF.drop, Math.round(dn[0]) - 1, Math.round(dn[1]) - 1, pal);
      else if (el === 'curse') stamp(p, MOTIF.wisp, Math.round(up[0]) - 2, Math.round(up[1]) - 4, pal, 220);
      else if (el === 'holy') { if (i % 2 === 0) stamp(p, MOTIF.star, Math.round(up[0]) - 2, Math.round(up[1]) - 2, pal); else p.set(Math.round(up[0]), Math.round(up[1]), pal[2]); }
    }
  });
}

function bolt(p, x, y, h, pal, big) {
  let cx = Math.round(x), cy = Math.round(y);
  const n = big ? 4 : 3;
  for (let s = 0; s < n; s++) {
    const dx = s % 2 ? 1 : -2, len = 2 + ((h * 10 + s) | 0) % 2;
    for (let j = 0; j < len; j++) { p.set(cx, cy, pal[2]); p.set(cx + 1, cy, pal[1], 200); cy -= 1; cx += dx > 0 ? 1 : -1; }
  }
}

function sparkle(p, x, y, col, det) {
  const r = det >= 2 ? 3 : det ? 2 : 1;
  p.set(x, y, '#ffffff');
  for (let i = 1; i <= r; i++) {
    const a = 255 - i * (200 / (r + 1));
    p.set(x - i, y, col, a); p.set(x + i, y, col, a); p.set(x, y - i, col, a); p.set(x, y + i, col, a);
  }
  if (r >= 2) { p.set(x - 1, y - 1, col, 90); p.set(x + 1, y + 1, col, 90); p.set(x + 1, y - 1, col, 90); p.set(x - 1, y + 1, col, 90); }
}
