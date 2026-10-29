// Illustrated cutscene panels: dense, colourful pixel-art paintings (warm pastel light, lavender
// shadows, light shafts) painted at half resolution and shown at 2x. Each panel has parallax layers,
// a light rig, 2D particle emitters and timed cues. Characters are seen from behind or under
// hoods: no faces. Painting is time-sliced (generators yield) so panels can be prepared while
// another one plays.
import { Painter } from './pixel.js';
import { hash2, fbm2, hexToRgb, mixHex, clamp } from '../core/math.js';
import { REGIONS } from '../data/regions.js';
import { siteGrid, nearest2 } from './handpaint.js';
import { MONSTERS } from '../data/monsters.js';

export const PW = 480, PH = 270, M = 28;
export const LW = PW + M * 2, LH = PH + M * 2;
const B8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
const bayer = (x, y) => B8[(x & 7) + (y & 7) * 8] / 64 - 0.5;
const rgb = (h) => (typeof h === 'string' ? hexToRgb(h) : h);
const INK = [34, 20, 44];
/** Painter whose writes land dy rows lower: panels are composed in design space and framed per panel. */
class Frame extends Painter {
  constructor(w, h, dy) { super(w, h); this.dy = dy; }
  set(x, y, c, a) { super.set(x, y + this.dy, c, a); }
  get(x, y) { return super.get(x, y + this.dy); }
  alpha(x, y) { return super.alpha(x, y + this.dy); }
}

// ------------------------------------------------------------------ light + colour
/** Light rig: ambient tint and coloured point lights (layer coordinates). */
export function rig(amb, lights) { return { amb: rgb(amb).map((v) => Math.min(1.05, v / 255 * 1.05 + 0.04)), lights: lights.map((l) => ({ ...l, col: rgb(l.col) })) }; }
/** Shade a base colour under a rig; quantised with an 8x8 Bayer dither for the pixel-art banding. */
function lit(base, x, y, L, boost = 0) {
  let r = base[0] * L.amb[0], g = base[1] * L.amb[1], b = base[2] * L.amb[2];
  for (const l of L.lights) {
    const d = Math.hypot(x - l.x, (y - l.y) * (l.sy || 1));
    if (d >= l.r) continue;
    const f = Math.pow(1 - d / l.r, 1.6) * (l.k ?? 1) * (1 + boost);
    r += (base[0] * l.col[0] / 255) * f * 0.85 + l.col[0] * f * 0.07;
    g += (base[1] * l.col[1] / 255) * f * 0.85 + l.col[1] * f * 0.07;
    b += (base[2] * l.col[2] / 255) * f * 0.85 + l.col[2] * f * 0.07;
  }
  const q = 9, d = bayer(x, y) * q;
  return [clamp(Math.round((r + d) / q) * q, 0, 255), clamp(Math.round((g + d) / q) * q, 0, 255), clamp(Math.round((b + d) / q) * q, 0, 255)];
}
/** Mix a palette of stops by t∈[0,1] (smooth), then light it. */
function ramp(stops, t) {
  t = clamp(t, 0, 0.9999) * (stops.length - 1);
  const i = Math.floor(t), f = t - i, a = stops[i], b = stops[i + 1] || a;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const stops = (...h) => h.map(rgb);

// ------------------------------------------------------------------ painting primitives
/** Per-pixel pass, yielding every few rows so painting can be time-sliced. */
function* rows(p, fn, y0 = -1e9, y1 = 1e9, x0 = 0, x1 = p.w) {
  const dy = p.dy || 0; // iterate the layer's rows, expressed in design coordinates
  for (let y = Math.max(-dy, y0 | 0); y < Math.min(p.h - dy, y1); y++) {
    for (let x = Math.max(0, x0 | 0); x < Math.min(p.w, x1); x++) { const c = fn(x, y); if (c) p.set(x, y, c); }
    if (y % 6 === 5) yield;
  }
}
function line(p, pts, col, w = 1) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      p.set(x, y, col); if (w > 1) { p.set(x + 1, y, col); } if (w > 2) { p.set(x, y + 1, col); p.set(x + 1, y + 1, col); }
    }
  }
}
/** Small sprite painted into its own painter, outlined, then stamped onto the layer. */
function stamp(p, x, y, w, h, draw, outline = INK) {
  const s = new Painter(w, h);
  draw(s);
  if (outline) s.outline(outline);
  p.blit(s, Math.round(x), Math.round(y));
  return s;
}
/** Irregular rock mass: fbm texture, form shading toward the lights, inked rim with a lit lip. */
function* rockMass(p, pts, pal, L, seed, opts = {}) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const mask = new Painter(Math.ceil(x1 - x0) + 3, Math.ceil(y1 - y0) + 3);
  mask.poly(pts.map(([x, y]) => [x - x0 + 1, y - y0 + 1]), '#ffffff');
  const cy = (y0 + y1) / 2;
  yield* rows(p, (x, y) => {
    if (!mask.alpha(Math.round(x - x0 + 1), Math.round(y - y0 + 1))) return null;
    const n = fbm2(x * (opts.scale || 0.06), y * (opts.scale || 0.06) * 1.4, 3, seed);
    const crack = Math.abs(fbm2(x * 0.03, y * 0.05, 2, seed + 9) - 0.5) < 0.012;
    let t = 0.25 + n * 0.55 + (cy - y) / (y1 - y0 + 1) * (opts.top ?? 0.25) + (hash2(x, y, seed) - 0.5) * 0.08;
    if (crack) t -= 0.3;
    return lit(ramp(pal, t), x, y, L);
  }, y0, y1 + 2, x0, x1 + 2);
  // lit lip where the mass faces up
  for (let x = Math.floor(x0); x <= x1; x++) {
    for (let y = Math.floor(y0); y <= y1; y++) {
      if (mask.alpha(Math.round(x - x0 + 1), Math.round(y - y0 + 1))) {
        if (!mask.alpha(Math.round(x - x0 + 1), Math.round(y - y0))) { p.set(x, y, lit(ramp(pal, 0.95), x, y, L, 0.4)); p.set(x, y - 1, INK); }
        break;
      }
    }
  }
}
function glowBake(p, x, y, r, col, a = 0.5) {
  const c = rgb(col);
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
    const d = Math.hypot(xx, yy) / r;
    if (d >= 1) continue;
    const v = (1 - d) ** 2 * a;
    if (v + bayer(x + xx, y + yy) * 0.25 > 0.08) p.set(x + xx, y + yy, c, Math.round(clamp(v, 0, 1) * 255));
  }
}

// ------------------------------------------------------------------ figures (never a face)
const HEROES = {
  bran: { body: '#4a5a7e', pants: '#4a3a3a', trim: '#c8743a', pack: '#7a4a2a', skin: '#f0c09a', hair: '#9a4a22', tool: 'hammer', h: 1 },
  elio: { body: '#2e6a5e', pants: '#2a3a4a', trim: '#e0b860', hood: '#5a3a8a', pack: '#6a4a2a', tool: 'staff', h: 1, hooded: true },
  durgan: { body: '#8a4a2a', pants: '#4a3a2a', trim: '#d8d8e0', fur: '#a89070', beard: '#e8702a', pack: '#6a6a74', tool: 'axe', h: 0.78, helm: true },
  clover: { body: '#6a5a3a', pants: '#4a3a30', trim: '#d84a3a', fur: '#f0e6d8', inner: '#ffb0b8', hair: '#6a4a32', pack: '#8a6a3a', tool: 'dagger', h: 0.84, ears: true },
};
const lighten = (c, k) => [Math.min(255, c[0] * k + 18 * (k - 1)), Math.min(255, c[1] * k + 14 * (k - 1)), Math.min(255, c[2] * k + 10 * (k - 1))];
/**
 * A hero seen from behind (never a face): pack, belt, folds, rim light on the side facing the light.
 * x,y = feet; h = height in px; light = {x,y}; opts.stone paints a cursed statue.
 */
export function heroFigure(p, id, x, y, h, light, opts = {}) {
  const H = HEROES[id] || HEROES.bran;
  h = Math.round(h * H.h);
  const w = Math.round(h * 0.95) + 20, sx = Math.round(x - w / 2), sy = Math.round(y - h - 16);
  const ldx = Math.sign((light ? light.x : x - 40) - x) || -1;
  const stone = opts.stone;
  const C = (hex) => {
    let c = rgb(hex);
    if (stone) { const g = (c[0] + c[1] + c[2]) / 3; c = [g * 0.55 + 84, g * 0.55 + 80, g * 0.55 + 96]; }
    return c;
  };
  // contact shadow on the ground
  p.ellipse(x, y - 1, h * 0.36, Math.max(2, h * 0.06), [20, 12, 30, 140]);
  stamp(p, sx, sy, w, h + 18, (s) => {
    const cx = w / 2, top = 16, u = h / 10;
    const legs = top + u * 6.2, feet = top + h;
    const poly = (pts, hex) => s.poly(pts, C(hex));
    const folds = (x0, y0, y1, n, hex) => { const c = lighten(C(hex), 0.72); for (let i = 0; i < n; i++) { const fx = x0 + i * u * 0.9; line(s, [[fx, y0], [fx + (i % 2 ? 1 : -1), y1]], c); } };
    // legs, boots
    poly([[cx - u * 1.25, legs], [cx - u * 0.1, legs], [cx - u * 0.25, feet - u * 0.7], [cx - u * 1.1, feet - u * 0.7]], H.pants);
    poly([[cx + u * 0.1, legs], [cx + u * 1.25, legs], [cx + u * 1.1, feet - u * 0.7], [cx + u * 0.25, feet - u * 0.7]], H.pants);
    for (const d of [-1, 1]) {
      poly([[cx + d * u * 0.1, feet - u * 1.1], [cx + d * u * 1.3, feet - u * 1.1], [cx + d * u * 1.45, feet], [cx + d * u * 0.05, feet]], '#3a2418');
      line(s, [[cx + d * u * 0.1, feet - u * 1.1], [cx + d * u * 1.3, feet - u * 1.1]], C('#6a4a30'));
      line(s, [[cx + d * u * 0.05, feet - 1], [cx + d * u * 1.45, feet - 1]], C('#1a100c'));
    }
    // torso: robe or tunic with folds and a belt
    const sh = H.helm ? 2.25 : 1.85;
    if (H.hooded) {
      poly([[cx - u * 1.7, top + u * 2.0], [cx + u * 1.7, top + u * 2.0], [cx + u * 2.5, feet - u * 0.5], [cx - u * 2.5, feet - u * 0.5]], H.body);
      folds(cx - u * 1.6, top + u * 4, feet - u * 0.7, 5, H.body);
      s.poly([[cx - u * 2.5, feet - u * 0.9], [cx + u * 2.5, feet - u * 0.9], [cx + u * 2.5, feet - u * 0.5], [cx - u * 2.5, feet - u * 0.5]], C(H.trim));
    } else {
      poly([[cx - u * sh, top + u * 2.1], [cx + u * sh, top + u * 2.1], [cx + u * 1.7, legs + u * 0.6], [cx - u * 1.7, legs + u * 0.6]], H.body);
      folds(cx - u * 1.0, top + u * 3.4, legs + u * 0.4, 3, H.body);
    }
    s.poly([[cx - u * 1.75, legs - u * 0.1], [cx + u * 1.75, legs - u * 0.1], [cx + u * 1.75, legs + u * 0.45], [cx - u * 1.75, legs + u * 0.45]], C('#3a2418'));
    for (const d of [-1, 1]) s.rect(Math.round(cx + d * u * 1.5 - (d < 0 ? u * 0.6 : 0)), Math.round(legs + u * 0.2), Math.max(2, Math.round(u * 0.6)), Math.max(2, Math.round(u * 0.8)), C(H.pack));
    // arms with sleeves and hands
    for (const d of [-1, 1]) {
      poly([[cx + d * (u * sh - u * 0.1), top + u * 2.2], [cx + d * (u * sh + u * 0.75), top + u * 2.5], [cx + d * (u * sh + u * 0.55), legs - u * 0.3], [cx + d * (u * sh - u * 0.3), legs - u * 0.3]], H.hooded ? H.body : H.body);
      s.ellipse(cx + d * (u * sh + u * 0.15), legs - u * 0.05, u * 0.42, u * 0.38, C(H.skin || '#e0b090'));
    }
    // the pack on their back
    if (id === 'bran') {
      poly([[cx - u * 1.4, top + u * 2.6], [cx + u * 1.4, top + u * 2.6], [cx + u * 1.3, top + u * 5.4], [cx - u * 1.3, top + u * 5.4]], H.pack);
      poly([[cx - u * 1.45, top + u * 2.5], [cx + u * 1.45, top + u * 2.5], [cx + u * 1.35, top + u * 3.6], [cx - u * 1.35, top + u * 3.6]], '#9a6a3a');
      s.ellipse(cx, top + u * 2.4, u * 1.6, u * 0.45, C('#6a7a5a'));
      for (const d of [-0.7, 0.7]) line(s, [[cx + d * u, top + u * 3.6], [cx + d * u, top + u * 5.3]], C('#4a2a14'));
      s.rect(Math.round(cx - 1), Math.round(top + u * 3.3), 3, 2, C('#e0c070'));
    } else if (id === 'elio') {
      for (const d of [-0.5, 0.4]) poly([[cx + d * u - u * 0.25, top + u * 1.6], [cx + d * u + u * 0.25, top + u * 1.6], [cx + d * u + u * 0.3, top + u * 4.6], [cx + d * u - u * 0.3, top + u * 4.6]], '#8a6a4a');
      line(s, [[cx - u * 1.6, top + u * 2.4], [cx + u * 1.6, legs]], C(H.trim));
    } else if (id === 'durgan') {
      s.ellipse(cx, top + u * 3.8, u * 1.9, u * 1.9, (px, py, nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.86 ? C('#c0c0cc') : d < 0.22 ? C('#e8e0d0') : Math.abs(nx) < 0.1 || Math.abs(ny) < 0.1 ? C('#8a8a96') : C('#7a3a22'); });
    } else if (id === 'clover') {
      poly([[cx - u * 1.0, top + u * 2.7], [cx + u * 1.0, top + u * 2.7], [cx + u * 0.9, top + u * 4.6], [cx - u * 0.9, top + u * 4.6]], H.pack);
      s.ellipse(cx + u * 1.1, top + u * 4.4, u * 0.7, u * 0.5, C('#c8a060'));
      s.poly([[cx - u * 0.9, top + u * 2.0], [cx + u * 0.9, top + u * 2.0], [cx + u * 2.6, top + u * 3.4], [cx + u * 2.4, top + u * 3.8], [cx + u * 0.4, top + u * 2.6]], C(H.trim));
    }
    // head from behind
    if (H.hooded) {
      s.poly([[cx - u * 1.55, top + u * 2.5], [cx - u * 1.3, top + u * 0.6], [cx - u * 0.2, top - u * 0.5], [cx + u * 1.3, top + u * 0.3], [cx + u * 1.6, top + u * 2.5]], C(H.hood));
      s.poly([[cx - u * 0.2, top - u * 0.5], [cx + u * 0.8, top - u * 1.4], [cx + u * 1.1, top - u * 0.1]], C(H.hood));
      line(s, [[cx - u * 1.3, top + u * 2.4], [cx, top + u * 0.2]], lighten(C(H.hood), 0.75));
    } else if (H.helm) {
      for (const d of [-1, 1]) s.poly([[cx + d * u * 1.0, top + u * 2.0], [cx + d * u * 2.0, top + u * 2.7], [cx + d * u * 1.7, top + u * 4.1], [cx + d * u * 1.1, top + u * 3.4]], C(H.beard));
      s.ellipse(cx, top + u * 1.35, u * 1.3, u * 1.2, (px, py, nx, ny) => (ny < -0.2 && Math.sign(nx) === ldx ? C('#f0f0f8') : ny > 0.55 ? C('#6a6a76') : C('#a8a8b4')));
      s.rect(Math.round(cx - u * 1.3), Math.round(top + u * 1.9), Math.round(u * 2.6), Math.max(2, Math.round(u * 0.4)), C('#d8b860'));
      for (const d of [-1, 1]) s.poly([[cx + d * u * 1.0, top + u * 1.0], [cx + d * u * 2.4, top - u * 0.6], [cx + d * u * 2.6, top - u * 0.2], [cx + d * u * 2.1, top + u * 0.4], [cx + d * u * 1.25, top + u * 1.6]], C('#f4ead0'));
    } else {
      if (H.ears) {
        s.poly([[cx - u * 0.75, top + u * 0.7], [cx - u * 1.05, top - u * 2.7], [cx - u * 0.35, top - u * 2.5], [cx - u * 0.15, top + u * 0.6]], C(H.fur));
        line(s, [[cx - u * 0.6, top + u * 0.3], [cx - u * 0.7, top - u * 2.0]], C(H.inner), 2);
        s.poly([[cx + u * 0.25, top + u * 0.6], [cx + u * 1.8, top - u * 1.3], [cx + u * 2.1, top - u * 0.8], [cx + u * 0.75, top + u * 1.0]], C(H.fur));
      }
      s.ellipse(cx, top + u * 1.35, u * 1.05, u * 1.2, (px, py, nx, ny) => (ny > 0.6 ? C(H.skin || '#e0b090') : Math.sign(px - cx) === ldx && ny < 0 ? lighten(C(H.hair || '#5a3a2a'), 1.3) : C(H.hair || '#5a3a2a')));
      // tufts of hair breaking the outline
      for (let k = 0; k < 5; k++) { const a = -2.6 + k * 0.55; s.poly([[cx + Math.cos(a) * u * 0.8, top + u * 1.35 + Math.sin(a) * u * 0.9], [cx + Math.cos(a) * u * 1.35, top + u * 1.35 + Math.sin(a) * u * 1.35], [cx + Math.cos(a + 0.3) * u * 0.9, top + u * 1.35 + Math.sin(a + 0.3) * u * 0.9]], C(H.hair || '#5a3a2a')); }
    }
    // tool
    const tc = C('#d0d4e0'), wood = C('#7a4a2a');
    if (H.tool === 'hammer') { line(s, [[cx + u * 1.6, legs - u * 0.6], [cx + u * 2.9, top + u * 0.6]], wood, 2); s.poly([[cx + u * 2.0, top - u * 0.6], [cx + u * 3.9, top + u * 0.1], [cx + u * 3.5, top + u * 1.5], [cx + u * 1.6, top + u * 0.8]], tc); line(s, [[cx + u * 2.5, top - u * 0.4], [cx + u * 2.1, top + u * 1.0]], C('#8a8a96')); line(s, [[cx + u * 3.3, top - u * 0.1], [cx + u * 2.9, top + u * 1.3]], C('#8a8a96')); }
    if (H.tool === 'staff') { line(s, [[cx + u * 2.3, feet], [cx + u * 2.7, top - u * 1.0]], wood, 2); s.poly([[cx + u * 2.7, top - u * 3.0], [cx + u * 3.2, top - u * 1.8], [cx + u * 2.7, top - u * 0.8], [cx + u * 2.2, top - u * 1.8]], stone ? C('#c8c4d4') : [140, 255, 236]); }
    if (H.tool === 'axe') { line(s, [[cx + u * 2.1, legs + u], [cx + u * 2.7, top - u * 0.4]], wood, 2); s.poly([[cx + u * 2.6, top - u * 0.8], [cx + u * 4.4, top - u * 1.8], [cx + u * 4.6, top + u * 1.4], [cx + u * 2.7, top + u * 0.8]], tc); line(s, [[cx + u * 4.4, top - u * 1.8], [cx + u * 4.6, top + u * 1.4]], C('#ffffff')); }
    if (H.tool === 'dagger') for (const d of [-1, 1]) line(s, [[cx + d * u * 1.9, legs - u * 0.2], [cx + d * u * 2.3, legs + u * 1.6]], tc, 1);
    // light pass: rim on the lit side, shade on the far side, occlusion toward the feet
    const src = s.data.slice();
    const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= s.w || yy >= s.h ? 0 : src[(yy * s.w + xx) * 4 + 3]);
    for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
      const i = (yy * s.w + xx) * 4;
      if (!src[i + 3]) continue;
      let k = 1 - Math.max(0, (yy - top - h * 0.55) / h) * 0.5;
      if (!at(xx + ldx, yy) || !at(xx, yy - 1)) k *= 1.38;
      else if (!at(xx - ldx, yy)) k *= 0.7;
      else if (Math.sign(xx - cx) === -ldx) k *= 0.86;
      s.data[i] = Math.min(255, src[i] * k); s.data[i + 1] = Math.min(255, src[i + 1] * k); s.data[i + 2] = Math.min(255, src[i + 2] * k * (k < 1 ? 1.08 : 1));
    }
    if (stone) {
      for (let c = 0; c < 3; c++) {
        let px = cx + (hash2(c, 2, h) - 0.5) * u * 2, py = feet - 1;
        for (let i = 0; i < h * 0.8; i++) { if (s.alpha(Math.round(px), Math.round(py))) s.set(px, py, i % 4 ? [200, 110, 255] : [255, 210, 255]); py -= 1; px += (hash2(i, c, h) - 0.5) * 2.2; }
      }
    }
  });
  if (id === 'elio' && !stone) glowBake(p, Math.round(x + h * 0.27), Math.round(y - h * 1.18), Math.round(h * 0.22), '#7affe8', 0.5);
  return { x, y, h };
}

/** The Cursed Lord on his throne: robes, crown, two violet glints in the dark under the crown. */
function lordFigure(p, x, y, h, L, awake = 1) {
  const w = Math.round(h * 0.9);
  stamp(p, x - w / 2, y - h, w, h + 2, (s) => {
    const cx = w / 2, u = h / 12;
    s.poly([[cx - u * 3.8, h], [cx - u * 2.4, u * 3.2], [cx, u * 2.2], [cx + u * 2.4, u * 3.2], [cx + u * 3.8, h]], (px, py) => lit(ramp(stops('#1a1024', '#3a2050', '#5a3474'), (py / h) * 0.4 + (px < cx ? 0.2 : 0.5)), px + x - w / 2, py + y - h, L));
    for (let k = -3; k <= 3; k++) line(s, [[cx + k * u * 0.7, u * 4.2], [cx + k * u * 1.05, h - 2]], [26, 14, 38]);
    line(s, [[cx - u * 3.7, h - 3], [cx - u * 2.4, u * 3.4], [cx, u * 2.5], [cx + u * 2.4, u * 3.4], [cx + u * 3.7, h - 3]], [214, 170, 80]);
    s.poly([[cx - u * 2.6, u * 4], [cx - u * 4.4, u * 8.4], [cx - u * 3.4, u * 8.8], [cx - u * 1.6, u * 5]], [44, 24, 64]);
    s.poly([[cx + u * 2.6, u * 4], [cx + u * 4.4, u * 8.4], [cx + u * 3.4, u * 8.8], [cx + u * 1.6, u * 5]], [60, 34, 86]);
    s.ellipse(cx, u * 2.4, u * 1.3, u * 1.5, [14, 8, 20]);
    for (let k = -2; k <= 2; k++) s.poly([[cx + k * u * 0.55 - u * 0.25, u * 1.2], [cx + k * u * 0.55, u * (k % 2 ? 0.2 : -0.3)], [cx + k * u * 0.55 + u * 0.25, u * 1.2]], [214, 170, 80]);
    s.poly([[cx - u * 1.4, u * 1.1], [cx + u * 1.4, u * 1.1], [cx + u * 1.3, u * 1.5], [cx - u * 1.3, u * 1.5]], [190, 140, 60]);
    if (awake > 0) { s.set(Math.round(cx - u * 0.5), Math.round(u * 2.5), [255, 120, 255]); s.set(Math.round(cx + u * 0.5), Math.round(u * 2.5), [255, 120, 255]); s.set(Math.round(cx - u * 0.5) + 1, Math.round(u * 2.5), [200, 90, 240]); s.set(Math.round(cx + u * 0.5) - 1, Math.round(u * 2.5), [200, 90, 240]); }
    line(s, [[cx + u * 3.4, h], [cx + u * 3.0, u * 1.5]], [130, 110, 150], 2);
    s.ellipse(cx + u * 3.0, u * 1.2, u * 0.7, u * 0.7, [255, 120, 255]);
  });
}

/** Ornate sword (for the shatter panel); crack: 0..1. */
function swordArt(p, x, y, len, ang, crack, seed) {
  const s = new Painter(Math.ceil(len * 0.62) + 8, len + 8);
  const cx = s.w / 2, bw = len * 0.07, Y = (v) => len - v + 4;
  const steel = [[255, 255, 255], [214, 226, 244], [168, 186, 220], [120, 136, 178], [74, 82, 120]];
  // blade: bevelled edges, a fuller groove, a tapered point
  s.poly([[cx - bw, Y(len * 0.3)], [cx + bw, Y(len * 0.3)], [cx + bw * 0.85, Y(len * 0.9)], [cx, Y(len)], [cx - bw * 0.85, Y(len * 0.9)]], (px, py) => {
    const u = (px - cx) / bw;
    return steel[u < -0.7 ? 0 : u < -0.2 ? 1 : u < 0.25 ? 2 : u < 0.7 ? 3 : 4];
  });
  line(s, [[cx, Y(len * 0.33)], [cx, Y(len * 0.82)]], [90, 100, 150], 1);
  for (let r = 0; r < 6; r++) rune(s, Math.round(cx - 1), Math.round(Y(len * 0.38 + r * len * 0.065)), r + seed, [255, 150, 240]);
  // crossguard: swept quillons curling up, with a jewel in the middle
  for (const d of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([cx + d * (bw + t * len * 0.26), Y(len * 0.285 + Math.sin(t * Math.PI * 0.9) * len * 0.05 - t * t * len * 0.03)]); }
    line(s, pts, [230, 190, 90], 3);
    line(s, pts.map(([a, b]) => [a, b - 1]), [255, 236, 160], 1);
    s.ellipse(pts[10][0], pts[10][1] - 2, 2.5, 2.5, [255, 140, 220]);
  }
  s.ellipse(cx, Y(len * 0.28), bw * 0.9, bw * 0.9, (px, py, nx, ny) => (nx < -0.2 && ny < -0.2 ? [255, 230, 255] : [220, 80, 200]));
  // grip with wrapped leather and a pommel
  s.poly([[cx - bw * 0.5, Y(len * 0.26)], [cx + bw * 0.5, Y(len * 0.26)], [cx + bw * 0.5, Y(len * 0.06)], [cx - bw * 0.5, Y(len * 0.06)]], [90, 50, 40]);
  for (let k = 0; k < 6; k++) line(s, [[cx - bw * 0.5, Y(len * (0.24 - k * 0.033))], [cx + bw * 0.5, Y(len * (0.23 - k * 0.033))]], [150, 96, 66]);
  s.ellipse(cx, Y(len * 0.035), bw * 0.85, bw * 0.85, (px, py, nx, ny) => (nx < -0.2 && ny < -0.2 ? [255, 240, 190] : [214, 160, 70]));
  for (let i = 0; i < crack * 16; i++) {
    let px = cx + (hash2(i, 1, seed) - 0.5) * bw * 1.6, py = Y(len * (0.35 + hash2(i, 2, seed) * 0.6));
    for (let k = 0; k < 8; k++) { if (s.alpha(Math.round(px), Math.round(py))) s.set(px, py, k % 3 ? [255, 140, 255] : [255, 255, 255]); px += (hash2(k, i, seed) - 0.5) * 3; py += 1.4; }
  }
  s.outline(INK);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
    const c = s.get(xx, yy);
    if (!c || c[3] < 128) continue;
    const dx = xx - cx, dy = yy - s.h / 2;
    for (const [ox, oy] of [[0, 0], [0.5, 0.5]]) p.set(Math.round(x + (dx + ox) * ca - (dy + oy) * sa), Math.round(y + (dx + ox) * sa + (dy + oy) * ca), [c[0], c[1], c[2]]);
  }
}

// ------------------------------------------------------------------ scene pieces
function* skyGrad(p, top, bot, L) {
  const a = rgb(top), b = rgb(bot);
  yield* rows(p, (x, y) => lit([a[0] + (b[0] - a[0]) * (y / p.h), a[1] + (b[1] - a[1]) * (y / p.h), a[2] + (b[2] - a[2]) * (y / p.h)], x, y, L));
}
function* caveBack(p, pal, L, seed, opts = {}) {
  // far cave wall: big inked boulders over soft strata, cool in the dark, warm where lamps reach
  const col = stops(...(opts.stops || [mixHex(pal.rock[1], '#2a1e4a', 0.55), mixHex(pal.rock[2], '#5a4a8a', 0.4), mixHex(pal.rock[3], '#9a86b8', 0.35), mixHex(pal.rock[4], '#e0c0c8', 0.4)]));
  const cw = opts.cell || 46, ch = Math.round((opts.cell || 46) * 0.7);
  const site = siteGrid(cw, ch, seed);
  yield* rows(p, (x, y) => {
    const wx = x + (fbm2(x * 0.02, y * 0.02, 2, seed + 7) - 0.5) * 26, wy = y + (fbm2(x * 0.02 + 5, y * 0.02, 2, seed + 8) - 0.5) * 18;
    const S = nearest2(site, cw, ch, wx, wy, 0.9);
    const e = (S.d2 - S.d1) * 0.5;
    if (e < 0.8) return lit(col[0], x, y, L);
    const n = fbm2(x * 0.08, y * 0.1, 2, seed);
    let t = 0.3 + S.s1[2] * 0.25 - S.s1[3] * 0.2 + n * 0.3 + Math.sin(y * 0.11 + fbm2(x * 0.01, y * 0.01, 2, seed + 5) * 6) * 0.05;
    if (e < 4) t += (1 - e / 4) * (wy < S.s1[1] ? 0.22 : -0.2); // lit top lip, shaded underside
    if (hash2(x, y, seed) > 0.985) t += 0.3;
    return lit(ramp(col, t + (opts.lift || 0)), x, y, L);
  });
  // moss and roots hanging along seams
  const moss = rgb(mixHex(pal.moss || '#4a5a2a', '#7a9a4a', 0.3));
  for (let k = 0; k < 40; k++) {
    const x = hash2(k, 1, seed) * p.w, y = -(p.dy || 0) + hash2(k, 2, seed) * (p.h * 0.75), len = 3 + hash2(k, 3, seed) * 9;
    for (let i = 0; i < len; i++) p.set(x + Math.round(Math.sin(i * 0.7 + k) * 0.6), y + i, lit(moss, x, y + i, L, 0.2));
  }
}
/** Pebbles, chips and tufts scattered over a floor band. */
function scatter(p, y0, y1, L, seed, n = 60, tint = '#8a7a6a') {
  const c = rgb(tint);
  for (let k = 0; k < n; k++) {
    const x = hash2(k, 4, seed) * p.w, y = y0 + hash2(k, 5, seed) * (y1 - y0), r = 1 + hash2(k, 6, seed) * 2.5 * (0.5 + (y - y0) / (y1 - y0 + 1));
    p.ellipse(x, y, r * 1.4, r * 0.8, (px, py, nx, ny) => lit(ny < 0 ? [c[0] + 40, c[1] + 36, c[2] + 30] : [c[0] * 0.6, c[1] * 0.6, c[2] * 0.7], px, py, L));
    if (hash2(k, 7, seed) > 0.8) { const gx = x + 4; for (let i = 0; i < 4; i++) line(p, [[gx + i, y + 1], [gx + i + (i - 1.5), y - 3 - (i % 2) * 2]], lit([90, 130, 70], gx, y, L)); }
  }
}
/** A glyph of the old tongue: a 3x5 pattern of strokes. */
function rune(p, x, y, seed, col) {
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (hash2(r * 3 + c, seed, 77) > 0.52 || (c === 1 && r % 2 === 0)) { p.set(x + c * 2, y + r * 2, col); p.set(x + c * 2 + 1, y + r * 2, col); }
}
/** Organic spire outline: lumpy sides tapering to a crooked tip (never a plain triangle). */
function spirePts(x, base, w, h, seed, dir = -1) {
  const L = [], R = [], n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n, ww = w * Math.pow(1 - t, 0.75) * (1 + (hash2(i, seed, 1) - 0.5) * 0.35) + (i === n ? 0 : 1);
    const lean = Math.sin(t * 2.2 + seed) * w * 0.25 * t;
    L.push([x - ww + lean, base + dir * h * t]);
    R.unshift([x + ww * (0.9 + hash2(i, seed, 2) * 0.2) + lean, base + dir * h * t + (hash2(i, seed, 3) - 0.5) * 2]);
  }
  return [...L, ...R];
}
function stalactites(p, pal, L, seed, n = 14, len = 60, fromTop = true) {
  const col = stops(mixHex(pal.rock[0], '#1a1028', 0.4), pal.rock[2], pal.rock[3], mixHex(pal.rock[4], '#e0c8d8', 0.3));
  const T0 = -(p.dy || 0), B0 = p.h - (p.dy || 0);
  for (let k = 0; k < n; k++) {
    const x = hash2(k, 1, seed) * p.w, l = len * (0.35 + hash2(k, 2, seed) * 0.8), w = 4 + hash2(k, 3, seed) * 11;
    const pts = spirePts(x, fromTop ? T0 : B0, w, l, seed + k * 13, fromTop ? 1 : -1);
    p.poly(pts, (px, py) => lit(ramp(col, 0.2 + (px < x ? 0.4 : 0.05) + fbm2(px * 0.2, py * 0.1, 2, seed + k) * 0.3), px, py, L));
    line(p, [...pts, pts[0]], INK);
    if (fromTop && hash2(k, 9, seed) > 0.5) p.set(Math.round(pts[9][0]), Math.round(pts[9][1]) + 2, [200, 230, 255]);
  }
}
function lantern(p, x, y, L) {
  line(p, [[x, y - 18], [x, y - 4]], [60, 50, 60]);
  stamp(p, x - 4, y - 4, 9, 12, (s) => { s.rect(1, 2, 7, 8, [255, 214, 140]); s.rect(3, 4, 3, 4, [255, 250, 220]); s.rect(0, 0, 9, 2, [60, 52, 60]); s.rect(0, 10, 9, 2, [60, 52, 60]); });
  void L;
}
function crate(p, x, y, w, h, L) {
  stamp(p, x, y, w, h, (s) => {
    s.rect(0, 0, w, h, lit([150, 98, 60], x, y, L));
    for (let i = 3; i < h; i += 4) for (let xx = 0; xx < w; xx++) s.set(xx, i, lit([110, 70, 44], x + xx, y + i, L));
    line(s, [[0, 0], [w - 1, h - 1]], lit([120, 78, 48], x, y, L));
  });
}
function rails(p, x0, x1, y, L) {
  for (let x = x0; x < x1; x += 7) p.rect(x, y, 4, 2, lit([96, 62, 40], x, y, L));
  for (let x = x0; x < x1; x++) { p.set(x, y - 1, lit([170, 170, 186], x, y, L, 0.3)); p.set(x, y + 3, lit([150, 150, 166], x, y, L)); }
}
function crystals(p, x, y, h, col, seed, L) {
  const c = rgb(col), hi = c.map((v) => Math.min(255, v + 90)), mid = c, lo = c.map((v) => v * 0.55), deep = c.map((v) => v * 0.32);
  // rock socket
  p.ellipse(x, y, h * 0.55, h * 0.16, (px, py, nx, ny) => lit(ny < -0.2 ? [110, 96, 120] : [60, 50, 70], px, py, L));
  const n = 5;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1) - 0.5;
    const bx = x + t * h * 0.7, hh = h * (0.45 + (1 - Math.abs(t) * 1.4) * 0.55 + hash2(k, seed, 2) * 0.2), lean = t * 0.7 + (hash2(k, seed, 3) - 0.5) * 0.25, w = h * 0.09 + 2;
    const tipx = bx + lean * hh, tipy = y - hh;
    const sh = [[bx - w, y], [bx - w * 0.9 + lean * hh * 0.82, tipy + hh * 0.18], [tipx, tipy], [bx + w * 0.9 + lean * hh * 0.82, tipy + hh * 0.18], [bx + w, y]];
    // three facets: lit left face, mid front, dark right face
    p.poly(sh, (px, py) => {
      const u = (px - (bx + lean * (y - py))) / w;
      return u < -0.35 ? hi : u < 0.25 ? lit(mid, px, py, L, 0.5) : u < 0.7 ? lo : deep;
    });
    line(p, [[tipx, tipy + 1], [bx + lean * hh * 0.1, y - 2]], hi);
    line(p, [...sh, sh[0]], INK);
    p.set(Math.round(tipx), Math.round(tipy) + 1, [255, 255, 255]);
  }
  glowBake(p, Math.round(x), Math.round(y - h * 0.45), Math.round(h * 0.95), col, 0.32);
}
function mushroom(p, x, y, h, col, L) {
  const c = rgb(col);
  p.poly([[x - 2, y], [x - 1, y - h], [x + 1, y - h], [x + 2, y]], lit([230, 214, 190], x, y, L));
  p.ellipse(x, y - h, h * 0.7, h * 0.38, (px, py, nx, ny) => (ny > 0.3 ? null : ny < -0.3 ? [Math.min(255, c[0] + 60), Math.min(255, c[1] + 60), Math.min(255, c[2] + 60)] : lit(c, px, py, L, 0.4)));
  for (let k = 0; k < 3; k++) p.set(Math.round(x - h * 0.4 + k * h * 0.4), Math.round(y - h - h * 0.15), [255, 250, 230]);
  glowBake(p, Math.round(x), Math.round(y - h), Math.round(h * 1.2), col, 0.3);
}
function bones(p, x, y, n, seed) {
  for (let k = 0; k < n; k++) {
    const bx = x + (hash2(k, 1, seed) - 0.5) * 40, by = y + hash2(k, 2, seed) * 8, a = hash2(k, 3, seed) * 3;
    line(p, [[bx - Math.cos(a) * 5, by - Math.sin(a) * 2], [bx + Math.cos(a) * 5, by + Math.sin(a) * 2]], [230, 220, 196], 2);
  }
}
function floorBand(p, y0, pal, L, seed, top = '#6a5040') {
  const col = stops(mixHex(pal.dirt[0], '#2a1a3a', 0.4), pal.dirt[1], pal.dirt[2], top);
  return rows(p, (x, y) => {
    if (y < y0 + Math.sin(x * 0.05 + seed) * 2) return null;
    const t = 0.35 + fbm2(x * 0.05, y * 0.12, 2, seed) * 0.5 - (y - y0) * 0.002;
    return lit(ramp(col, t + (hash2(x >> 1, y, seed) > 0.93 ? 0.25 : 0)), x, y, L);
  }, y0 - 3, 1e9);
}

// ------------------------------------------------------------------ panels
/** Panel: { dur, caption, title, sub, cam:[[x,y],[x,y]], rig, layers:[{depth, paint}], fx:[...], cues:[...] } */
function P(def) { return { dur: 6, cam: [[-10, 0], [10, 0]], fx: [], cues: [], ...def }; }

const PROLOGUE = () => {
  const pal = REGIONS[0].pal, tomb = REGIONS[5].pal;
  const L1 = rig('#7a6aa0', [{ x: 150, y: 250, r: 230, col: '#ffb060', k: 1.3 }, { x: 300, y: 150, r: 200, col: '#c86bff', k: 0.9 }]);
  const L2 = rig('#241a3c', [{ x: 268, y: 150, r: 150, col: '#ff6af0', k: 1.3 }, { x: 150, y: 230, r: 110, col: '#b06aff', k: 1.2 }, { x: 386, y: 230, r: 110, col: '#b06aff', k: 1.2 }, { x: 268, y: 330, r: 160, col: '#6a4aff', k: 0.5 }]);
  const L4 = rig('#8a8aa8', [{ x: 268, y: 250, r: 160, col: '#ff8a3a', k: 0.8 }]);
  const L5 = rig('#6a6aa0', [{ x: 268, y: 360, r: 300, col: '#ffb060', k: 1.3 }, { x: 268, y: 40, r: 160, col: '#9ad8ff', k: 0.5 }]);
  return [
    P({
      dy: -56, caption: 'Deep beneath the Old Hollow Mine, four friends found a door that should never have been opened.',
      rig: L1, cam: [[-18, 6], [6, -6]], music: 'tomb',
      layers: [
        { depth: 0.35, paint: function* (p) { yield* caveBack(p, tomb, L1, 11); stalactites(p, tomb, L1, 4, 18, 70); } },
        { depth: 0.7, paint: function* (p) {
          // the tomb door: carved slab with runes that already glow
          yield* rockMass(p, [[150, 300], [160, 70], [268, 34], [376, 70], [386, 300]], stops('#2a2036', '#4a3a5e', '#6a5a7e', '#9a8aa8'), L1, 21, { scale: 0.04 });
          p.poly([[200, 300], [210, 110], [268, 84], [326, 110], [336, 300]], (x, y) => lit(ramp(stops('#1a1224', '#2e2440', '#3e3256'), fbm2(x * 0.05, y * 0.05, 2, 3)), x, y, L1));
          line(p, [[268, 90], [268, 300]], [24, 14, 36], 2);
          for (let k = 0; k < 9; k++) { const ry = 116 + k * 19; for (const sx of [232, 298]) { rune(p, sx, ry, k * 7 + sx, [214, 140, 255]); p.set(sx + 2, ry - 2, [255, 220, 255]); } }
          for (let k = 0; k < 18; k++) rune(p, 168 + (k % 2) * 196 + (hash2(k, 1, 9) - 0.5) * 6, 90 + k * 11, k + 40, [120, 80, 150]);
          glowBake(p, 268, 200, 70, '#c86bff', 0.3);
          bones(p, 200, 296, 5, 7);
        } },
        { depth: 1.0, paint: function* (p) {
          yield* floorBand(p, 280, pal, L1, 5);
          scatter(p, 284, 340, L1, 5, 90);
          rails(p, 0, 140, 296, L1);
          crate(p, 40, 268, 22, 18, L1); crate(p, 58, 276, 16, 12, L1);
          lantern(p, 108, 262, L1);
          const lt = { x: 150, y: 250 };
          heroFigure(p, 'bran', 168, 312, 70, lt); heroFigure(p, 'elio', 226, 316, 72, lt);
          heroFigure(p, 'durgan', 300, 318, 70, lt); heroFigure(p, 'clover', 356, 314, 70, lt);
        } },
        { depth: 1.45, paint: function* (p) { stalactites(p, tomb, L1, 8, 4, 110, false); stalactites(p, tomb, L1, 9, 5, 70); } },
      ],
      fx: [{ kind: 'dust', rate: 26 }, { kind: 'curse', rate: 8, x: 268, y: 200, spread: 70 }, { kind: 'ember', rate: 6, x: 108, y: 262, spread: 8 }],
      lights: [{ x: 108, y: 262, r: 46, col: '#ffb060', flicker: 0.25 }, { x: 268, y: 190, r: 90, col: '#c86bff', flicker: 0.1 }],
      shafts: [{ x: 240, w: 26, col: '#e8c8ff', a: 0.16 }, { x: 330, w: 14, col: '#e8c8ff', a: 0.1 }],
      cues: [{ t: 0.3, sfx: 'door_creak' }, { t: 3.4, sfx: 'rumble' }],
    }),
    P({
      dy: -46, caption: 'Inside slept the Cursed Lord. When he woke, he laid his curse upon them all…',
      rig: L2, cam: [[0, 22], [0, -14]],
      layers: [
        { depth: 0.3, paint: function* (p) { yield* caveBack(p, tomb, L2, 31, { stops: ['#0c0614', '#1a1028', '#2e2044', '#4a3a66'] }); for (let k = 0; k < 6; k++) { const x = 60 + k * 84; yield* rockMass(p, [[x - 14, 400], [x - 12, 30], [x + 12, 30], [x + 14, 400]], stops('#0e0816', '#22183a', '#3e3058', '#6a5a88'), L2, 40 + k, { scale: 0.08, top: 0 }); } } },
        { depth: 0.75, paint: function* (p) {
          // the throne dais and its stair
          for (let s = 0; s < 6; s++) p.poly([[140 + s * 10, 300 - s * 12], [396 - s * 10, 300 - s * 12], [392 - s * 10, 306 - s * 12], [144 + s * 10, 306 - s * 12]], (x, y) => lit(ramp(stops('#140c1e', '#2e2442', '#6a5a86'), 0.25 + (y % 6 < 2 ? 0.5 : 0) + fbm2(x * 0.1, y * 0.3, 2, s) * 0.2), x, y, L2));
          yield* rockMass(p, [[220, 232], [226, 110], [268, 86], [310, 110], [316, 232]], stops('#20162e', '#3a2a50', '#5a4a72'), L2, 61, { scale: 0.06 });
          lordFigure(p, 268, 236, 120, L2, 1);
          glowBake(p, 268, 160, 90, '#ff5af0', 0.25);
          bones(p, 190, 296, 8, 13); bones(p, 340, 298, 6, 17);
          for (const bx of [150, 386]) {
            // braziers of violet fire on either side of the stair
            stamp(p, bx - 12, 226, 24, 36, (s2) => { s2.poly([[0, 4], [24, 4], [18, 14], [6, 14]], [70, 60, 80]); s2.rect(10, 14, 4, 18, [60, 50, 70]); s2.poly([[4, 32], [20, 32], [22, 36], [2, 36]], [50, 40, 60]); });
            glowBake(p, bx, 222, 30, '#c86bff', 0.6);
            for (let k = 0; k < 9; k++) p.ellipse(bx - 8 + k * 2, 224 - hash2(k, bx, 3) * 10, 2, 4, [230, 170, 255]);
          }
          for (let k = 0; k < 4; k++) { const x = 190 + k * 52; line(p, [[x, 0], [x + 6, 60 + k * 9]], [90, 80, 100], 1); }
        } },
        { depth: 1.35, paint: function* (p) { for (const x of [20, 500]) yield* rockMass(p, [[x - 40, 400], [x - 26, 0], [x + 30, 0], [x + 40, 400]], stops('#140c1c', '#2a1e3a', '#3a2e4e'), L2, 70 + x, { scale: 0.05 }); } },
      ],
      fx: [{ kind: 'curse', rate: 24, x: 268, y: 170, spread: 120 }, { kind: 'curse', rate: 10, x: 150, y: 220, spread: 8 }, { kind: 'curse', rate: 10, x: 386, y: 220, spread: 8 }, { kind: 'dust', rate: 10 }],
      lights: [{ x: 268, y: 150, r: 100, col: '#ff5af0', flicker: 0.2 }, { x: 150, y: 220, r: 44, col: '#c86bff', flicker: 0.4 }, { x: 386, y: 220, r: 44, col: '#c86bff', flicker: 0.4 }],
      shafts: [{ x: 268, w: 50, col: '#ff9af0', a: 0.08 }],
      cues: [{ t: 1.8, sfx: 'curse_hum' }, { t: 3.6, sfx: 'boss_roar', flash: [0.9, 0.4, 1], shake: 0.6 }],
    }),
    P({
      dy: 0, caption: '"Every blade you forge shall shatter…"',
      rig: rig('#6a5a8a', [{ x: 268, y: 160, r: 240, col: '#ff6af0', k: 1.4 }]), cam: [[0, 0], [0, 0]], dur: 5,
      layers: [
        { depth: 0.2, paint: function* (p) { yield* rows(p, (x, y) => { const d = Math.hypot(x - 268, y - 162) / 300; return lit(ramp(stops('#3a1a4a', '#1a0e26', '#0a0610'), d + fbm2(x * 0.02, y * 0.02, 2, 3) * 0.2), x, y, rig('#ffffff', [])); }); } },
        { depth: 0.6, paint: function* (p) { swordArt(p, 268, 162, 170, 0.35, 0.8, 5); glowBake(p, 268, 162, 60, '#ff9af0', 0.25); } },
      ],
      fx: [{ kind: 'shard', rate: 0, burst: 70, at: 2.4, x: 268, y: 162 }, { kind: 'spark', rate: 0, burst: 90, at: 2.4, x: 268, y: 162 }, { kind: 'curse', rate: 20, x: 268, y: 162, spread: 50 }],
      hideLayerAt: { layer: 1, t: 2.4 },
      cues: [{ t: 0.4, sfx: 'curse_hum' }, { t: 1.6, sfx: 'crack' }, { t: 2.0, sfx: 'crack' }, { t: 2.4, sfx: 'shatter', flash: [1, 0.7, 1], shake: 0.9 }],
    }),
    P({
      dy: -48, caption: '"…and every friend you love shall turn to stone."',
      rig: L4, cam: [[14, 0], [-10, 4]],
      layers: [
        { depth: 0.35, paint: function* (p) { yield* caveBack(p, pal, L4, 51, { stops: ['#2a2a3a', '#4a4a5e', '#6a6a7e', '#8a8a9e'] }); } },
        { depth: 1.0, paint: function* (p) {
          yield* floorBand(p, 270, { dirt: ['#3a3a44', '#4a4a56', '#5a5a66'] }, L4, 9, '#7a7a8a');
          // a dying campfire
          for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.28; p.ellipse(268 + Math.cos(a) * 22, 292 + Math.sin(a) * 7, 4, 3, [110, 100, 110]); }
          line(p, [[252, 294], [284, 288]], [40, 26, 20], 3);
          glowBake(p, 268, 288, 26, '#ff7a2a', 0.5);
          heroFigure(p, 'durgan', 200, 300, 62, { x: 268, y: 290 }, { stone: true });
          heroFigure(p, 'elio', 330, 296, 64, { x: 268, y: 290 }, { stone: true });
          heroFigure(p, 'clover', 380, 310, 60, { x: 268, y: 290 }, { stone: true });
        } },
      ],
      fx: [{ kind: 'ash', rate: 22 }, { kind: 'ember', rate: 10, x: 268, y: 288, spread: 14 }, { kind: 'curse', rate: 6, x: 290, y: 270, spread: 120 }],
      lights: [{ x: 268, y: 286, r: 60, col: '#ff8a3a', flicker: 0.35 }],
      cues: [{ t: 0.6, sfx: 'rock_crack' }, { t: 2.2, sfx: 'rock_crack' }],
      grade: { sat: 0.55 },
    }),
    P({
      dy: 12, caption: 'Now one of them must descend, forging, fighting and breaking weapon after weapon, to end the curse forever.',
      rig: L5, cam: [[0, -20], [0, 18]], dur: 7, music: 'mine',
      layers: [
        { depth: 0.25, paint: function* (p) {
          // the shaft below: strata of every layer, glowing at the bottom
          const R = REGIONS;
          yield* rows(p, (x, y) => {
            const t = y / p.h, ri = Math.min(5, Math.floor(t * 6 + fbm2(x * 0.02, y * 0.02, 2, 4) * 0.6));
            const pal2 = R[ri].pal;
            const d = Math.abs(x - 268) / (90 + t * 120);
            if (d < 1) return lit(ramp(stops('#0a0610', mixHex(pal2.glow, '#000000', 0.7), pal2.glow), (1 - d) * t * 1.2), x, y, rig('#ffffff', []));
            return lit(ramp(stops(pal2.rock[0], pal2.rock[2], pal2.rock[3]), fbm2(x * 0.04, y * 0.06, 2, ri) * 0.9), x, y, L5);
          });
        } },
        { depth: 0.8, paint: function* (p) {
          for (let y = 20; y < 330; y += 46) { line(p, [[150, y], [210, y + 8]], [120, 80, 50], 2); line(p, [[386, y + 20], [326, y + 28]], [120, 80, 50], 2); lantern(p, 160 + (y % 3) * 20, y + 20, L5); }
          line(p, [[268, 0], [268, 400]], [190, 160, 110], 1);
        } },
        { depth: 1.3, paint: function* (p) {
          yield* rockMass(p, [[0, 0], [150, 0], [130, 120], [160, 200], [120, 400], [0, 400]], stops('#1a1222', '#3a2a40', '#5a4a5a', '#8a7a7a'), L5, 81);
          yield* rockMass(p, [[536, 0], [390, 0], [410, 140], [376, 220], [420, 400], [536, 400]], stops('#1a1222', '#3a2a40', '#5a4a5a', '#8a7a7a'), L5, 82);
          heroFigure(p, 'bran', 268, 96, 46, { x: 268, y: 330 });
        } },
      ],
      fx: [{ kind: 'ember', rate: 24, x: 268, y: 320, spread: 140, up: true }, { kind: 'dust', rate: 14 }],
      shafts: [{ x: 268, w: 70, col: '#ffd8a0', a: 0.12, fromBottom: true }],
      cues: [{ t: 0.4, sfx: 'wind_whoosh' }],
    }),
  ];
};

const REGION_STORY = [
  { cap: 'Hollowdeep Mine. Abandoned iron workings, rusted rails, cold lamps.' },
  { cap: 'Prism Hollows. Caves that remember light; every crystal hums.' },
  { cap: 'Sporewood. A forest that never saw the sun breathes in the dark.' },
  { cap: 'The Sunken Halls. Ruins of the first miners, half drowned in gold.' },
  { cap: 'Emberdeep. Where the mountain bleeds.' },
  { cap: 'The Forbidden Tomb. Where it all began.' },
];

function vista(ri) {
  const R = REGIONS[ri], pal = R.pal;
  const L = rig(mixHex(pal.glow, '#7a6aa0', 0.6), [{ x: 268, y: 170, r: 300, col: pal.glow, k: 1.1 }, { x: 80, y: 300, r: 200, col: pal.glow2, k: 0.7 }, { x: 460, y: 120, r: 180, col: pal.accent[1] || pal.glow2, k: 0.6 }]);
  const deco = function* (p) {
    yield* floorBand(p, 262, pal, L, 30 + ri, mixHex(pal.dirt[2], pal.glow, 0.25));
    scatter(p, 266, 340, L, 30 + ri, 80, mixHex(pal.rock[3], pal.glow, 0.2));
    for (let k = 0; k < 9; k++) {
      const x = 30 + k * 60 + hash2(k, ri, 3) * 20, y = 270 + hash2(k, ri, 4) * 40;
      if (ri === 1 || ri === 5) crystals(p, x, y, 26 + hash2(k, 5, ri) * 30, pal.accent[k % 2], k + ri, L);
      else if (ri === 2) mushroom(p, x, y, 14 + hash2(k, 5, ri) * 22, pal.accent[k % 3], L);
      else if (ri === 4) { glowBake(p, Math.round(x), Math.round(y), 16, '#ff6a1a', 0.5); p.ellipse(x, y, 14, 4, [255, 160, 60]); }
      else if (ri === 3) { yield* rockMass(p, [[x - 10, y], [x - 9, y - 64], [x - 12, y - 70], [x + 12, y - 70], [x + 9, y - 64], [x + 10, y]], stops('#4a3a2a', '#8a7a5a', '#d8b860', '#fff0b0'), L, 300 + k, { scale: 0.1, top: 0 }); for (let r = 0; r < 4; r++) rune(p, x - 3, y - 58 + r * 13, k * 4 + r, [74, 255, 224]); }
      else { crate(p, x - 10, y - 14, 20, 14, L); lantern(p, x + 12, y - 30, L); }
    }
    if (ri === 0) rails(p, 0, p.w, 300, L);
    if (ri === 3) yield* rows(p, (x, y) => (y > 300 ? lit(ramp(stops('#1a3a4a', '#2a6a8a', '#9ae0ff'), 0.3 + Math.sin(x * 0.4 + y) * 0.1 + (hash2(x, y, 3) > 0.97 ? 0.6 : 0)), x, y, L) : null), 300, p.h);
    if (ri === 4) yield* rows(p, (x, y) => (y > 296 ? lit(ramp(stops('#7a1a08', '#ff5a1a', '#ffd04a'), 0.4 + fbm2(x * 0.05, y * 0.2, 2, 9) * 0.6), x, y, L, 0.5) : null), 296, p.h);
  };
  return P({
    dy: -46, caption: REGION_STORY[ri].cap, title: R.name, sub: R.sub, rig: L, cam: [[-16, 4], [16, -4]], dur: 6, music: R.music,
    layers: [
      { depth: 0.3, paint: function* (p) { yield* caveBack(p, pal, L, 200 + ri, { lift: 0.05 }); stalactites(p, pal, L, 7 + ri, 16, 90); } },
      { depth: 0.75, paint: function* (p) {
        for (let k = 0; k < 5; k++) { const x = 30 + k * 120 + hash2(k, ri, 1) * 40; yield* rockMass(p, spirePts(x, 310, 34 + hash2(k, 4, ri) * 26, 110 + hash2(k, 2, ri) * 90, 220 + k + ri * 9), stops(mixHex(pal.rock[0], '#1a1028', 0.3), pal.rock[2], pal.rock[3], mixHex(pal.rock[4], pal.glow, 0.25)), L, 220 + k + ri * 9, { scale: 0.07 }); }
      } },
      { depth: 1.1, paint: deco },
      { depth: 1.5, paint: function* (p) { stalactites(p, pal, L, 77 + ri, 5, 120, false); } },
    ],
    fx: [
      { kind: ri === 2 ? 'spore' : ri === 4 ? 'ember' : ri === 1 ? 'sparkle' : ri === 5 ? 'curse' : 'dust', rate: 26, col: pal.glow, up: ri === 4 },
      { kind: 'dust', rate: 10 },
      ri === 3 ? { kind: 'drip', rate: 6 } : { kind: 'sparkle', rate: 4, col: pal.glow2 },
    ],
    shafts: [{ x: 200 + ri * 20, w: 40, col: pal.glow2, a: 0.1 }, { x: 360, w: 22, col: pal.glow, a: 0.08 }],
    cues: [{ t: 0.3, sfx: 'wind_whoosh' }],
  });
}

function liftPanel(from, to) {
  const A = REGIONS[from].pal, Bp = REGIONS[to].pal;
  const L = rig('#6a6a8a', [{ x: 268, y: 160, r: 160, col: '#ffc070', k: 1.3 }, { x: 268, y: 330, r: 260, col: Bp.glow, k: 1.0 }]);
  return P({
    dy: -14, caption: 'The old lift groans. Down, down… You catch your breath on the way: half your wounds heal.',
    rig: L, cam: [[0, -24], [0, 24]], dur: 5,
    layers: [
      { depth: 0.4, paint: function* (p) {
        yield* rows(p, (x, y) => {
          const t = y / p.h;
          const pal = t < 0.5 ? A : Bp;
          const n = fbm2(x * 0.03, y * 0.05, 3, 7 + to);
          const ring = Math.abs(x - 268) < 110 + n * 30;
          if (ring) return lit(ramp(stops('#06040a', mixHex(pal.glow, '#000000', 0.8)), t * 0.8), x, y, L);
          return lit(ramp(stops(pal.rock[0], pal.rock[2], pal.rock[3]), n), x, y, L);
        });
      } },
      { depth: 1.0, paint: function* (p) {
        for (const x of [212, 324]) line(p, [[x, 0], [x, 400]], [140, 120, 90], 2);
        stamp(p, 216, 150, 104, 70, (s) => {
          s.rect(0, 60, 104, 10, [110, 74, 44]); for (let x = 0; x < 104; x += 8) s.rect(x, 60, 1, 10, [80, 52, 32]);
          for (const x of [2, 100]) s.rect(x, 0, 3, 60, [90, 80, 80]); s.rect(0, 0, 104, 3, [90, 80, 80]);
          s.rect(5, 50, 94, 3, [150, 100, 60]);
        });
        lantern(p, 300, 170, L);
        heroFigure(p, 'bran', 262, 211, 48, { x: 300, y: 170 });
      } },
    ],
    fx: [{ kind: 'dust', rate: 30, up: true, fast: true }, { kind: 'sparkle', rate: 6, col: Bp.glow }],
    lights: [{ x: 300, y: 172, r: 40, col: '#ffc070', flicker: 0.3 }],
    cues: [{ t: 0.1, sfx: 'elevator' }],
  });
}

function bossPanel(id) {
  const m = MONSTERS[id] || MONSTERS.rustjaw;
  const ri = Math.max(0, Math.min(5, m.region || 0)), pal = REGIONS[ri].pal;
  const L = rig(mixHex(pal.glow, '#5a4a7a', 0.65), [{ x: 268, y: 140, r: 260, col: pal.glow, k: 1.4 }, { x: 268, y: 340, r: 200, col: pal.glow2, k: 0.7 }]);
  const silhouette = function* (p) {
    const ink = [20, 12, 26];
    const body = (pts) => p.poly(pts, (x, y) => (hash2(x >> 1, y >> 1, 7) > 0.94 ? lit([70, 50, 80], x, y, L) : ink));
    if (id === 'rustjaw') {
      for (let k = 0; k < 4; k++) body([[180 + k * 12, 300 - k * 50], [356 - k * 12, 300 - k * 50], [346 - k * 12, 250 - k * 50], [190 + k * 12, 250 - k * 50]]);
      for (const x of [230, 306]) { glowBake(p, x, 110, 16, '#ffe08a', 0.9); p.ellipse(x, 110, 6, 6, [255, 240, 180]); }
      for (let k = 0; k < 7; k++) p.rect(214 + k * 16, 150, 8, 30, [255, 150, 60]);
      glowBake(p, 268, 165, 50, '#ff8a3a', 0.4);
    } else if (id === 'geodessa') {
      body([[268, 60], [320, 150], [300, 220], [236, 220], [216, 150]]);
      for (let k = 0; k < 8; k++) { const d = k < 4 ? -1 : 1, i = k % 4; line(p, [[268 + d * 30, 170 + i * 10], [268 + d * (90 + i * 25), 120 + i * 20], [268 + d * (120 + i * 30), 300]], ink, 3); }
      for (let k = 0; k < 6; k++) { const x = 250 + (k % 3) * 18, y = 120 + Math.floor(k / 3) * 14; p.set(x, y, [150, 240, 255]); p.set(x + 1, y, [255, 140, 240]); }
      crystals(p, 268, 90, 40, pal.accent[0], 3, L);
    } else if (id === 'mycel') {
      body([[180, 300], [200, 140], [336, 140], [356, 300]]);
      p.ellipse(268, 120, 120, 56, (x, y, nx, ny) => (ny > 0.4 ? null : lit(ramp(stops('#3a1a2a', '#d04a3a', '#ff9a7a'), 0.4 - ny * 0.4), x, y, L)));
      for (let k = 0; k < 14; k++) p.ellipse(180 + hash2(k, 1, 3) * 176, 90 + hash2(k, 2, 3) * 40, 4, 3, [255, 240, 220]);
      for (const x of [240, 296]) glowBake(p, x, 200, 10, pal.accent[0], 0.9);
    } else if (id === 'warden') {
      body([[210, 300], [200, 130], [236, 90], [300, 90], [336, 130], [326, 300]]);
      p.poly([[150, 140], [210, 120], [214, 260], [156, 250]], (x, y) => lit(ramp(stops('#4a3a20', '#a88a40', '#ffe08a'), 0.5), x, y, L));
      for (let k = 0; k < 8; k++) { const y = 130 + k * 18; line(p, [[250, y], [258, y - 4], [266, y], [274, y - 4], [282, y]], [74, 255, 224]); }
      glowBake(p, 268, 112, 20, '#4affe0', 0.6);
    } else if (id === 'pyrrhax') {
      for (const d of [-1, 1]) body([[268, 150], [268 + d * 220, 40], [268 + d * 190, 110], [268 + d * 230, 150], [268 + d * 160, 170], [268 + d * 190, 220], [268 + d * 60, 200]]);
      body([[240, 300], [250, 160], [268, 110], [286, 160], [296, 300]]);
      body([[256, 120], [268, 70], [292, 84], [280, 120]]);
      p.set(282, 92, [255, 240, 120]); p.set(283, 92, [255, 200, 60]);
      yield* rows(p, (x, y) => (y > 290 ? lit(ramp(stops('#7a1a08', '#ff5a1a', '#ffd04a'), 0.4 + fbm2(x * 0.05, y * 0.2, 2, 9) * 0.6), x, y, L, 0.5) : null), 290, p.h);
    } else {
      lordFigure(p, 268, 290, 190, L, 1);
      glowBake(p, 268, 150, 90, '#ff5af0', 0.3);
    }
  };
  return P({
    dy: -24, caption: m.intro || 'Something enormous stirs.', title: m.name, sub: m.title, rig: L, cam: [[0, 16], [0, -10]], dur: 4.6, music: id === 'cursed_lord' ? 'finalboss' : 'boss',
    layers: [
      { depth: 0.3, paint: function* (p) { yield* caveBack(p, pal, L, 400 + ri, { lift: -0.1 }); } },
      { depth: 0.7, paint: silhouette },
      { depth: 1.3, paint: function* (p) { stalactites(p, pal, L, 90, 6, 120, false); stalactites(p, pal, L, 91, 7, 80); } },
    ],
    fx: [{ kind: ri === 2 ? 'spore' : ri === 4 ? 'ember' : ri === 5 ? 'curse' : 'dust', rate: 30, col: pal.glow, up: ri === 4 }, { kind: 'rock', rate: 3 }],
    lights: [{ x: 268, y: 140, r: 110, col: pal.glow, flicker: 0.2 }],
    cues: [{ t: 0.2, sfx: 'rumble', shake: 0.3 }, { t: 2.2, sfx: 'boss_roar', flash: rgb(pal.glow).map((v) => v / 255), shake: 0.8 }],
  });
}

const VICTORY = () => {
  const L1 = rig('#8a7aa0', [{ x: 268, y: 140, r: 300, col: '#ffe8a0', k: 1.6 }]);
  const L3 = rig('#c8a0b0', [{ x: 268, y: 60, r: 380, col: '#ffd8a0', k: 1.3 }, { x: 268, y: 250, r: 120, col: '#ff8a3a', k: 0.6 }]);
  return [
    P({
      dy: -32, caption: 'The Cursed Lord\'s crown cracks in two. Light pours out of the tomb.',
      rig: L1, cam: [[0, 10], [0, -10]], music: 'ending',
      layers: [
        { depth: 0.3, paint: function* (p) { yield* caveBack(p, REGIONS[5].pal, L1, 501, { lift: 0.1 }); } },
        { depth: 0.8, paint: function* (p) { lordFigure(p, 268, 280, 150, L1, 0); glowBake(p, 268, 160, 110, '#fff0c0', 0.45); } },
      ],
      fx: [{ kind: 'sparkle', rate: 40, col: '#fff0c0' }, { kind: 'shard', rate: 0, burst: 40, at: 1.2, x: 268, y: 150 }],
      shafts: [{ x: 268, w: 90, col: '#fff4d0', a: 0.22 }, { x: 200, w: 30, col: '#fff4d0', a: 0.12 }, { x: 340, w: 30, col: '#fff4d0', a: 0.12 }],
      cues: [{ t: 1.2, sfx: 'shatter', flash: [1, 0.95, 0.8], shake: 0.5 }, { t: 2.0, sfx: 'victory_sting' }],
    }),
    P({
      dy: -48, caption: 'Far above, at a little campfire, three statues of cursed stone begin to crack… and breathe.',
      rig: L3, cam: [[-12, 0], [12, 0]],
      layers: [
        { depth: 0.35, paint: function* (p) { yield* caveBack(p, REGIONS[0].pal, L3, 601, { lift: 0.15 }); } },
        { depth: 1.0, paint: function* (p) {
          yield* floorBand(p, 270, REGIONS[0].pal, L3, 19, '#c89a70');
          for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.28; p.ellipse(268 + Math.cos(a) * 22, 292 + Math.sin(a) * 7, 4, 3, [150, 120, 100]); }
          glowBake(p, 268, 286, 40, '#ffb060', 0.6);
          heroFigure(p, 'durgan', 196, 300, 62, { x: 268, y: 60 }); heroFigure(p, 'elio', 330, 296, 64, { x: 268, y: 60 }); heroFigure(p, 'clover', 384, 310, 60, { x: 268, y: 60 });
        } },
      ],
      fx: [{ kind: 'stone', rate: 0, burst: 60, at: 1.4, x: 290, y: 270, spread: 120 }, { kind: 'sparkle', rate: 18, col: '#ffe8a0' }, { kind: 'petal', rate: 14 }],
      shafts: [{ x: 268, w: 120, col: '#ffe8c0', a: 0.16 }],
      cues: [{ t: 1.4, sfx: 'rock_break', flash: [1, 0.9, 0.7] }],
    }),
    P({
      dy: -54, caption: 'Every weapon you forged is gone. The friends you forged them for are not.',
      rig: rig('#d8b0a0', [{ x: 268, y: 120, r: 360, col: '#ffd8a0', k: 1.3 }, { x: 268, y: 300, r: 140, col: '#ff8a3a', k: 0.7 }]), cam: [[0, 12], [0, -6]], dur: 7,
      layers: [
        { depth: 0.25, paint: function* (p) { yield* skyGrad(p, '#ffb080', '#f6e0b0', rig('#ffffff', [])); for (let k = 0; k < 7; k++) p.ellipse(60 + k * 80, 60 + hash2(k, 1, 3) * 40, 40, 10, [255, 230, 210]); } },
        { depth: 0.7, paint: function* (p) {
          // the mine mouth opening onto dawn
          yield* rockMass(p, [[0, 0], [536, 0], [536, 400], [420, 400], [400, 120], [268, 70], [136, 120], [116, 400], [0, 400]], stops('#2a1a2a', '#5a3a4a', '#9a6a6a', '#e0a080'), rig('#a08090', [{ x: 268, y: 110, r: 260, col: '#ffd8a0', k: 1.3 }]), 701);
        } },
        { depth: 1.1, paint: function* (p) {
          yield* floorBand(p, 280, REGIONS[0].pal, rig('#d8b0a0', [{ x: 268, y: 160, r: 300, col: '#ffd8a0', k: 1.2 }]), 77, '#e8b080');
          const lt = { x: 268, y: 120 };
          heroFigure(p, 'bran', 206, 314, 66, lt); heroFigure(p, 'elio', 246, 316, 68, lt); heroFigure(p, 'durgan', 292, 318, 64, lt); heroFigure(p, 'clover', 330, 316, 64, lt);
        } },
      ],
      fx: [{ kind: 'petal', rate: 12 }, { kind: 'sparkle', rate: 10, col: '#fff0c0' }, { kind: 'dust', rate: 10 }],
      shafts: [{ x: 268, w: 140, col: '#fff0d0', a: 0.2 }],
      cues: [],
    }),
  ];
};

const FALLEN = () => {
  const L = rig('#6a5a8a', [{ x: 268, y: 250, r: 220, col: '#c86bff', k: 1.2 }, { x: 120, y: 80, r: 200, col: '#5a6aff', k: 0.4 }]);
  return [P({
    dy: -42, caption: 'The curse takes hold… and drags you back to the campfire.',
    rig: L, cam: [[0, -10], [0, 8]], dur: 6, music: 'defeat',
    layers: [
      { depth: 0.3, paint: function* (p) { yield* caveBack(p, REGIONS[5].pal, L, 801, { lift: -0.05 }); stalactites(p, REGIONS[5].pal, L, 802, 14, 80); } },
      { depth: 1.0, paint: function* (p) {
        yield* floorBand(p, 268, REGIONS[5].pal, L, 803, '#5a3a6a');
        for (let k = 0; k < 14; k++) { const a = hash2(k, 1, 5) * 6.28, r = 20 + hash2(k, 2, 5) * 40; swordArt(p, 268 + Math.cos(a) * r, 296 + Math.sin(a) * r * 0.25, 14, a, 0, k); }
        heroFigure(p, 'bran', 268, 300, 60, { x: 268, y: 250 }, { stone: true });
        // curse vines climbing
        for (let v = 0; v < 6; v++) { let x = 220 + v * 20, y = 310; const pts = []; for (let i = 0; i < 14; i++) { pts.push([x, y]); x += (hash2(i, v, 3) - 0.5) * 8; y -= 4; } line(p, pts, [150, 70, 200], 2); }
        glowBake(p, 268, 270, 60, '#c86bff', 0.35);
      } },
    ],
    fx: [{ kind: 'ash', rate: 26 }, { kind: 'curse', rate: 24, x: 268, y: 290, spread: 70 }],
    shafts: [{ x: 268, w: 50, col: '#d8a0ff', a: 0.12 }],
    cues: [{ t: 0.4, sfx: 'curse_hum' }],
    grade: { sat: 0.7 },
  })];
};

const DIVE = (char) => {
  const pal = REGIONS[0].pal;
  const L1 = rig('#7a6a9a', [{ x: 268, y: 330, r: 260, col: '#ff9a40', k: 1.3 }, { x: 268, y: 120, r: 160, col: '#4a6aff', k: 0.4 }]);
  const L2 = rig('#5a4a7a', [{ x: 268, y: 340, r: 300, col: '#ffb060', k: 1.2 }]);
  return [
    P({
      dy: -58, caption: 'Your friends stay by the fire. The mine waits, dark and patient.',
      rig: L1, cam: [[0, 14], [0, -8]], music: 'mine',
      layers: [
        { depth: 0.3, paint: function* (p) { yield* caveBack(p, pal, L1, 901); } },
        { depth: 0.75, paint: function* (p) {
          yield* rockMass(p, [[150, 300], [170, 90], [268, 60], [366, 90], [386, 300]], stops('#2a1a24', '#4a3a40', '#7a6a6a', '#a89080'), L1, 902);
          p.poly([[200, 300], [214, 130], [268, 104], [322, 130], [336, 300]], (x, y) => lit(ramp(stops('#040306', '#0e0a12', '#1e1622'), (y - 104) / 300 * 0.6), x, y, rig('#ffffff', [])));
          for (const x of [196, 400]) { line(p, [[x, 300], [x, 120]], [120, 80, 50], 3); }
          line(p, [[190, 118], [346, 118]], [130, 88, 54], 3);
          rails(p, 220, 320, 300, L1);
        } },
        { depth: 1.15, paint: function* (p) {
          yield* floorBand(p, 296, pal, L1, 903);
          glowBake(p, 268, 340, 70, '#ff9a40', 0.4);
          heroFigure(p, char, 268, 322, 76, { x: 268, y: 360 });
        } },
      ],
      fx: [{ kind: 'ember', rate: 14, x: 268, y: 326, spread: 120, up: true }, { kind: 'dust', rate: 14 }],
      cues: [{ t: 0.3, sfx: 'footstep' }, { t: 1.0, sfx: 'footstep' }],
    }),
    P({
      dy: -10, caption: 'Down into Hollowdeep Mine. One blade at a time.',
      rig: L2, cam: [[0, -26], [0, 26]], dur: 5,
      layers: [
        { depth: 0.35, paint: function* (p) { yield* caveBack(p, pal, L2, 911, { lift: 0.05 }); } },
        { depth: 0.9, paint: function* (p) {
          for (let y = 0; y < 330; y += 9) { p.rect(246, y, 44, 2, lit([120, 80, 50], 268, y, L2)); }
          for (const x of [244, 290]) line(p, [[x, 0], [x, 400]], [100, 66, 40], 2);
          for (let y = 30; y < 330; y += 70) lantern(p, 220, y, L2);
          heroFigure(p, char, 268, 180, 52, { x: 268, y: 340 });
        } },
        { depth: 1.4, paint: function* (p) { yield* rockMass(p, [[0, 0], [160, 0], [190, 160], [150, 400], [0, 400]], stops('#140c18', '#2e2230', '#4a3a40', '#7a6a6a'), L2, 912); yield* rockMass(p, [[536, 0], [380, 0], [350, 160], [390, 400], [536, 400]], stops('#140c18', '#2e2230', '#4a3a40', '#7a6a6a'), L2, 913); } },
      ],
      fx: [{ kind: 'dust', rate: 36, up: true, fast: true }, { kind: 'ember', rate: 10, x: 268, y: 330, spread: 100, up: true }],
      cues: [{ t: 0.2, sfx: 'wind_whoosh' }],
    }),
  ];
};

/** Cutscene definitions by id: prologue · dive · descend_N · victory · fallen · boss_<monster id>. */
export function cutsceneDef(id, opts = {}) {
  if (id === 'prologue') return { panels: PROLOGUE() };
  if (id === 'dive') return { panels: DIVE(opts.char || 'bran') };
  if (id === 'victory') return { panels: VICTORY() };
  if (id === 'fallen') return { panels: FALLEN() };
  if (id.startsWith('descend_')) { const to = clamp(+id.slice(8) || 1, 1, 5); return { panels: [liftPanel(to - 1, to), vista(to)] }; }
  if (id.startsWith('boss_')) return { panels: [bossPanel(id.slice(5))] };
  return { panels: [vista(0)] };
}

/** Time-sliced painter for one panel's layers. job.step(ms) → true when finished. */
export function paintJob(panel) {
  const out = panel.layers.map(() => new Frame(LW, LH, panel.dy ?? -40));
  let li = 0, gen = null;
  return {
    canvases: null,
    step(budget = 8) {
      const t0 = performance.now();
      while (li < panel.layers.length) {
        if (!gen) gen = panel.layers[li].paint(out[li]);
        let r = gen.next();
        while (!r.done && performance.now() - t0 < budget) r = gen.next();
        if (!r.done) return false;
        gen = null; li++;
      }
      if (!this.canvases) this.canvases = out.map((p) => p.toCanvas());
      return true;
    },
  };
}
