// Low-poly prop kit: hand-painted tileable pixel textures, sculpted faceted geometry (convex hulls,
// chamfered beams, lathes, tubes, extrusions), box-projected UVs at a constant texel density, and a
// Kit that merges parts per material into a few shadow-casting meshes.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Painter, dither } from '../art/pixel.js';
import { TOON4, pixelTexture } from '../gfx/materials.js';
import { hash2, hash3, ramp, clamp, shadeHex, mixHex, hexToRgb } from '../core/math.js';

export const PPM = 128; // texels per metre — keeps every prop at the same pixel density

// ======================================================================= tileable noise
const sm = (t) => t * t * (3 - 2 * t);
function pnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a, b) => hash2(((a % px) + px) % px, ((b % py) + py) % py, seed);
  const u = sm(xf), v = sm(yf);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}
/** periodic fbm: x,y in [0,1) tile space; fx,fy base lattice frequency */
export function pfbm(x, y, fx, fy, oct = 3, seed = 0) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    const kx = fx << i, ky = fy << i;
    s += pnoise(x * kx, y * ky, kx, ky, seed + i * 13) * a;
    n += a; a *= 0.5;
  }
  return s / n;
}
const wrap = (v, n) => ((v % n) + n) % n;

// ======================================================================= painted textures
const texCache = new Map();
function makeTex(key, w, h, paint, opts = {}) {
  let t = texCache.get(key);
  if (t) return t;
  const p = new Painter(w, h);
  paint(p, w, h);
  t = pixelTexture(p.toCanvas());
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.userData.keep = true;
  t.userData.size = [w, h];
  texCache.set(key, t);
  return t;
}
const pickR = (R, v, x, y) => {
  const t = clamp(v, 0, 0.999) * (R.length - 1);
  const i = Math.floor(t);
  return dither(x, y, t - i) ? R[Math.min(i + 1, R.length - 1)] : R[i];
};
/** hue-shifted ramp with darker darks for pixel-art depth */
// Dungeon-Meshi style: shadows slide toward deep teal, highlights toward warm cream (never flat grey)
const SH_TEAL = '#16262e', HI_WARM = '#ffe4b4';
const rmp = (hex, n = 6, spread = 0.8) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1;
    out.push(t < 0 ? mixHex(shadeHex(hex, t * spread * 0.5), SH_TEAL, -t * spread * 0.42) : mixHex(shadeHex(hex, t * spread * 0.32), HI_WARM, t * spread * 0.28));
  }
  return out;
};
void ramp;

export const TEX = {
  /** long-grain planks (grain along u). base = mid wood colour */
  wood(base = '#8a5a33', seed = 1) {
    return makeTex('wood' + base + seed, 64, 64, (p, W, H) => {
      const R = rmp(base, 6, 0.75);
      const knots = [[hash2(seed, 1, 9) * W, hash2(seed, 2, 9) * H], [hash2(seed, 3, 9) * W, hash2(seed, 4, 9) * H]];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = pfbm(x / W, y / H, 2, 6, 3, seed);
        let v = 0.5 + (s - 0.5) * 0.9;
        let ring = Math.sin((y + s * 14) * 0.85);
        for (const [kx, ky] of knots) {
          const dx = Math.min(Math.abs(x - kx), W - Math.abs(x - kx)) * 0.55, dy = Math.min(Math.abs(y - ky), H - Math.abs(y - ky));
          const d = Math.hypot(dx, dy);
          if (d < 7) ring = Math.sin(d * 1.6);
          if (d < 1.6) v -= 0.4;
        }
        if (ring > 0.82) v -= 0.22;
        else if (ring < -0.9) v += 0.1;
        v += (hash2(x, y, seed) - 0.5) * 0.08;
        p.set(x, y, pickR(R, v, x, y));
      }
      // sheen pixels above dark grain
      for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) if (hash2(x, y, seed + 7) > 0.985) p.set(x, y, R[5]);
    });
  },
  /** planks with seams every `plank` texels (v direction) + nail heads */
  planks(base = '#8a5a33', plank = 16, seed = 2) {
    return makeTex('planks' + base + plank + seed, 64, 64, (p, W, H) => {
      const wood = TEX.wood(base, seed).image;
      const ctx = wood.getContext('2d');
      const img = ctx.getImageData(0, 0, W, H).data;
      const R = rmp(base, 6, 0.75);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const row = Math.floor(y / plank);
        const ox = Math.floor(hash2(row, 3, seed) * W);
        const i = (((y) * W) + wrap(x + ox, W)) * 4;
        p.set(x, y, [img[i], img[i + 1], img[i + 2]]);
        const iy = y % plank;
        if (iy === 0) p.set(x, y, R[0]);
        else if (iy === 1) p.set(x, y, R[4]);
        else if (iy === plank - 1) p.set(x, y, R[1]);
      }
      // nails
      for (let r = 0; r < H / plank; r++) for (const nx of [3, W / 2 + 3]) {
        const ny = r * plank + Math.floor(plank / 2);
        p.set(nx, ny, '#cfd3da'); p.set(nx + 1, ny, '#7a7e88'); p.set(nx, ny + 1, '#5a5e66'); p.set(nx + 1, ny + 1, '#33363c');
      }
    });
  },
  bark(base = '#5a3a22', seed = 3) {
    return makeTex('bark' + base + seed, 64, 64, (p, W, H) => {
      const R = rmp(base, 6, 0.8);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const n = pfbm(x / W, y / H, 3, 10, 3, seed);
        const f = pfbm(x / W, y / H, 1, 5, 2, seed + 4);
        let v = 0.55 + (n - 0.5) * 0.9;
        if (n < 0.38) v = 0.08; // furrow
        else if (n < 0.43) v = 0.25;
        if (f > 0.68 && n > 0.5) v += 0.15; // ridge highlights
        p.set(x, y, pickR(R, v, x, y));
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hash2(x, y, seed + 3) > 0.993) p.set(x, y, '#6a7a3a'); // lichen flecks
    });
  },
  /** end grain disc mapped to the full texture (not tiled) */
  endgrain(base = '#c8a070', bark = '#4a2e1a') {
    return makeTex('endg' + base + bark, 32, 32, (p, W, H) => {
      const R = rmp(base, 5, 0.6);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - W / 2, dy = y + 0.5 - H / 2;
        const r = Math.hypot(dx, dy) / (W / 2);
        if (r > 1.02) continue;
        if (r > 0.86) { p.set(x, y, r > 0.95 ? shadeHex(bark, -0.3) : bark); continue; }
        const ring = Math.sin((r * 9 + hash2(Math.round(Math.atan2(dy, dx) * 3), 0, 4) * 0.4) * Math.PI);
        let v = 0.62 - r * 0.25 + (ring > 0.7 ? -0.3 : 0);
        if (Math.abs(Math.atan2(dy, dx) - 0.7) < 0.06 && r > 0.25 && r < 0.8) v = 0.05; // crack
        p.set(x, y, pickR(R, v, x, y));
      }
    }, { clamp: true });
  },
  metal(base = '#5a5e68', seed = 4, rust = 0) {
    return makeTex('metal' + base + seed + rust, 64, 64, (p, W, H) => {
      const R = rmp(base, 6, 0.7);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const b = pfbm(x / W, y / H, 1, 16, 2, seed);
        let v = 0.5 + (b - 0.5) * 0.5 + (pfbm(x / W, y / H, 3, 3, 2, seed + 2) - 0.5) * 0.35;
        if (hash2(x, y, seed) > 0.985) v -= 0.3;
        p.set(x, y, pickR(R, v, x, y));
        if (rust && pfbm(x / W, y / H, 4, 4, 2, seed + 9) > 0.8 - rust * 0.22) p.set(x, y, hash2(x, y, 5) > 0.5 ? mixHex(R[2], '#8a4a26', 0.6) : mixHex(R[1], '#5a3020', 0.6));
      }
      for (let k = 0; k < 9; k++) { // scratches
        let x = Math.floor(hash2(k, 1, seed) * W), y = Math.floor(hash2(k, 2, seed) * H);
        const len = 4 + Math.floor(hash2(k, 3, seed) * 8);
        for (let i = 0; i < len; i++) { p.set(wrap(x + i, W), wrap(y + Math.floor(i / 3), H), R[5]); }
      }
    });
  },
  /** neutral rock texture (tinted by material colour) */
  stone(seed = 5) {
    return makeTex('stone' + seed, 64, 64, (p, W, H) => {
      const R = ['#2c3236', '#474846', '#645e57', '#82786c', '#a09282', '#c0b09a'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const n = pfbm(x / W, y / H, 4, 4, 3, seed);
        const c = pfbm(x / W, y / H, 8, 8, 1, seed + 3);
        let v = 0.55 + (n - 0.5) * 0.9 + (c - 0.5) * 0.25;
        v += (hash2(x, y, seed) - 0.5) * 0.12;
        p.set(x, y, pickR(R, v, x, y));
      }
      for (let k = 0; k < 7; k++) { // hairline cracks with lit lower edge
        let x = Math.floor(hash2(k, 1, seed + 1) * W), y = Math.floor(hash2(k, 2, seed + 1) * H);
        const len = 6 + Math.floor(hash2(k, 3, seed + 1) * 12);
        for (let i = 0; i < len; i++) {
          p.set(wrap(x, W), wrap(y, H), R[0]);
          p.set(wrap(x, W), wrap(y + 1, H), R[4]);
          x += 1; y += hash2(k, i, 77) > 0.6 ? 1 : hash2(k, i, 78) > 0.75 ? -1 : 0;
        }
      }
      for (let k = 0; k < 14; k++) { // chips
        const x = Math.floor(hash2(k, 5, seed) * W), y = Math.floor(hash2(k, 6, seed) * H);
        p.set(x, y, R[5]); p.set(wrap(x + 1, W), y, R[4]); p.set(x, wrap(y + 1, H), R[1]); p.set(wrap(x + 1, W), wrap(y + 1, H), R[0]);
      }
    });
  },
  cloth(seed = 6) {
    return makeTex('cloth' + seed, 32, 32, (p, W, H) => {
      const R = ['#9a958c', '#aca69c', '#bdb7ac', '#cdc7bb', '#ddd7cb'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0.5 + ((x + y) & 1 ? 0.06 : -0.04) + (y % 2 ? 0.05 : 0) + (pfbm(x / W, y / H, 2, 2, 2, seed) - 0.5) * 0.45;
        if (hash2(x, y, seed) > 0.97) v -= 0.2;
        p.set(x, y, pickR(R, v, x, y));
      }
    });
  },
  /** cloth with quilted seams (sleeping bags) */
  quilt(seed = 7) {
    return makeTex('quilt' + seed, 32, 32, (p, W, H) => {
      const base = TEX.cloth(seed).image.getContext('2d').getImageData(0, 0, W, H).data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let c = [base[i], base[i + 1], base[i + 2]];
        if (y % 16 === 0) c = [96, 92, 86];
        else if (y % 16 === 1) c = [222, 216, 205];
        else if (y % 16 === 15 || y % 16 === 14) c = c.map((v) => v * 0.86);
        p.set(x, y, c);
      }
      for (let x = 0; x < W; x += 4) { p.set(x, 8, '#f4ecd8'); p.set(x + 1, 8, '#f4ecd8'); p.set(x, 24, '#f4ecd8'); p.set(x + 1, 24, '#f4ecd8'); }
    });
  },
  leather(seed = 8) {
    return makeTex('leather' + seed, 32, 32, (p, W, H) => {
      const R = ['#6a645c', '#7c756c', '#8e877c', '#a0988c', '#b4ab9e'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0.5 + (pfbm(x / W, y / H, 3, 3, 3, seed) - 0.5) * 0.8;
        if (hash2(x, y, seed) > 0.95) v -= 0.25;
        if (hash2(x, y, seed + 1) > 0.985) v += 0.3;
        p.set(x, y, pickR(R, v, x, y));
      }
    });
  },
  brick(seed = 9) {
    return makeTex('brick' + seed, 64, 64, (p, W, H) => {
      const R = ['#4e2418', '#6e3424', '#86412c', '#9a4e34', '#b2603e', '#c8784e'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const row = Math.floor(y / 8), off = (row % 2) * 8;
        const bx = Math.floor((x + off) / 16);
        const iy = y % 8, ix = (x + off) % 16;
        if (iy === 7 || ix === 15) { p.set(x, y, iy === 7 && ix === 15 ? '#2a1a14' : '#3e2a22'); continue; }
        let v = 0.35 + hash2(bx, row, seed) * 0.35 + (pfbm(x / W, y / H, 8, 8, 1, seed) - 0.5) * 0.3;
        if (iy === 0) v += 0.18;
        if (ix === 0) v += 0.08;
        if (iy === 6) v -= 0.15;
        p.set(x, y, pickR(R, v, x, y));
      }
    });
  },
  /** dark coals with glowing seams — pair with glowMat for bloom */
  coals(seed = 10) {
    return makeTex('coals' + seed, 32, 32, (p, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const n = pfbm(x / W, y / H, 4, 4, 2, seed);
        const c = Math.abs(pfbm(x / W, y / H, 3, 3, 2, seed + 5) - 0.5);
        let col = n > 0.55 ? '#2a2020' : n > 0.4 ? '#1c1616' : '#120e0e';
        if (c < 0.035) col = '#ffe08a'; else if (c < 0.07) col = '#ff9a2a'; else if (c < 0.1) col = '#c8401a';
        if (hash2(x, y, seed) > 0.97) col = '#ff6a1a';
        p.set(x, y, col);
      }
    });
  },
  /** crystal facet sheen (tinted) */
  facets(seed = 11) {
    return makeTex('facets' + seed, 32, 32, (p, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = (x + y * 0.6) % 11;
        let v = 0.72 + (pfbm(x / W, y / H, 2, 2, 2, seed) - 0.5) * 0.25 + (d < 1.2 ? 0.25 : d < 2 ? 0.1 : 0);
        if (hash2(x, y, seed) > 0.985) v = 1;
        const c = Math.round(clamp(v, 0, 1) * 255);
        p.set(x, y, [c, c, c]);
      }
    });
  },
  bone(seed = 12) {
    return makeTex('bone' + seed, 32, 32, (p, W, H) => {
      const R = ['#a8987a', '#c8b898', '#ddd0b4', '#ece2ca', '#f8f0de'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0.62 + (pfbm(x / W, y / H, 2, 4, 2, seed) - 0.5) * 0.6;
        if (hash2(x, y, seed) > 0.975) v -= 0.4;
        p.set(x, y, pickR(R, v, x, y));
      }
    });
  },
  gold(seed = 13) {
    return makeTex('gold' + seed, 32, 32, (p, W, H) => {
      p.rect(0, 0, W, H, '#8a5a14');
      for (let k = 0; k < 26; k++) {
        const cx = hash2(k, 1, seed) * W, cy = hash2(k, 2, seed) * H, r = 2.5 + hash2(k, 3, seed) * 1.5;
        for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
          const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.4);
          if (d > r) continue;
          const lit = (x - cx) + (y - cy) < -1;
          p.set(wrap(x, W), wrap(y, H), d > r - 1 ? '#a8701e' : lit ? '#fff0a0' : '#e0b040');
        }
      }
    });
  },
  fur(base = '#5a4a4a', seed = 14) {
    return makeTex('fur' + base + seed, 32, 32, (p, W, H) => {
      const R = rmp(base, 5, 0.6);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, pickR(R, 0.45 + (pfbm(x / W, y / H, 2, 2, 2, seed) - 0.5) * 0.4, x, y));
      for (let k = 0; k < 46; k++) { // short soft strokes
        const x = Math.floor(hash2(k, 1, seed) * W), y = Math.floor(hash2(k, 2, seed) * H);
        const c = hash2(k, 3, seed) > 0.5 ? R[3] : R[1];
        p.set(x, y, c); p.set(wrap(x + 1, W), wrap(y + 1, H), c); p.set(wrap(x + 1, W), wrap(y + 2, H), c);
      }
    });
  },
  rope(seed = 15) {
    return makeTex('rope' + seed, 16, 16, (p, W, H) => {
      const R = ['#6a5432', '#8a7044', '#a8895a', '#c4a676', '#dcc292'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = (x + y) % 8;
        p.set(x, y, R[d === 0 ? 0 : d === 1 ? 1 : d < 4 ? 3 : d === 4 ? 4 : 2]);
      }
    });
  },
  /** stripes for awnings, u across */
  stripes(a = '#c83a3a', b = '#f0e0c0') {
    return makeTex('stripes' + a + b, 32, 32, (p, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = x < 16 ? a : b;
        p.set(x, y, (x % 16 === 0 || x % 16 === 15) ? shadeHex(c, -0.18) : y % 8 === 0 && hash2(x, y, 3) > 0.6 ? shadeHex(c, -0.08) : c);
      }
    });
  },
  /** mushroom cap with pale spots, coloured */
  cap(color = '#d04a3a', spot = '#f4ecd8') {
    return makeTex('cap' + color + spot, 32, 32, (p, W, H) => {
      const R = rmp(color, 5, 0.55);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, pickR(R, 0.5 + (pfbm(x / W, y / H, 2, 2, 2, 3) - 0.5) * 0.5, x, y));
      for (let k = 0; k < 5; k++) {
        const cx = hash2(k, 1, 31) * W, cy = hash2(k, 2, 31) * H, r = 2.5 + hash2(k, 3, 31) * 2.5;
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d <= r) p.set(wrap(x, W), wrap(y, H), d > r - 1 ? shadeHex(spot, -0.15) : spot);
        }
      }
    });
  },
  parchment(seed = 16) {
    return makeTex('parch' + seed, 32, 32, (p, W, H) => {
      const R = ['#b89a68', '#cdb07c', '#dcc48f', '#e8d3a3', '#f2e2b8'];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, pickR(R, 0.6 + (pfbm(x / W, y / H, 3, 3, 3, seed) - 0.5) * 0.6, x, y));
    });
  },
  /** stone with carved rune grooves (sarcophagi, door frames, shrines) */
  carved(seed = 17) {
    return makeTex('carved' + seed, 64, 64, (p, W, H) => {
      const base = TEX.stone(seed).image.getContext('2d').getImageData(0, 0, W, H).data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; p.set(x, y, [base[i], base[i + 1], base[i + 2]]); }
      for (let r = 0; r < 4; r++) { // carved key pattern rows
        const y0 = 6 + r * 16;
        for (let x = 0; x < W; x++) {
          const step = Math.floor(x / 8) % 2;
          const yy = y0 + (step ? 0 : 4);
          p.set(x, yy, '#3e3a36'); p.set(x, yy + 1, '#a9a196');
          if (x % 8 === 0) for (let k = 0; k < 5; k++) { p.set(x, y0 + k, '#3e3a36'); p.set(x + 1, y0 + k, '#a9a196'); }
        }
      }
    });
  },
};

// ======================================================================= materials
const matCache = new Map();
/** Toon material with a painted texture. tint multiplies (use with neutral textures). */
export function texMat(tex, tint = '#ffffff', opts = {}) {
  const key = tex.uuid + tint + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      map: tex, color: new THREE.Color(tint), gradientMap: TOON4,
      emissive: new THREE.Color(opts.emissive || '#000000'), emissiveIntensity: opts.emissiveIntensity ?? 1,
      emissiveMap: opts.emissiveMap || null, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      side: opts.side || THREE.FrontSide, alphaTest: opts.alphaTest || 0,
    });
    m.userData.keep = true;
    matCache.set(key, m);
  }
  return m;
}
/** Unlit HDR textured material (glowing coals, crystal cores, lit windows). */
export function glowTexMat(tex, color = '#ffffff', intensity = 2.2, opts = {}) {
  const key = 'g' + tex.uuid + color + intensity + (opts.additive ? 'a' : '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(intensity), fog: false, transparent: !!opts.additive || !!opts.transparent, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !opts.additive, alphaTest: opts.alphaTest || 0, side: opts.side || THREE.FrontSide });
    m.userData.keep = true;
    matCache.set(key, m);
  }
  return m;
}
/** Plain flat-colour toon (small trims) and unlit glow. */
export function flatMat(color, opts = {}) {
  const key = 'f' + color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: TOON4, emissive: new THREE.Color(opts.emissive || '#000000'), emissiveIntensity: opts.emissiveIntensity ?? 1, side: opts.side || THREE.FrontSide, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
    m.userData.keep = true;
    matCache.set(key, m);
  }
  return m;
}
export function glowMat(color, intensity = 2.4, opts = {}) {
  const key = 'gl' + color + intensity + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), fog: false, transparent: !!opts.transparent || !!opts.additive, opacity: opts.opacity ?? 1, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !opts.additive, side: opts.side || THREE.FrontSide });
    m.userData.keep = true;
    matCache.set(key, m);
  }
  return m;
}

// ======================================================================= geometry
/** Flat-shaded, non-indexed copy with normals + uv attributes guaranteed. */
export function facet(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/** Box-projected UVs per triangle at PPM/texSize scale (keeps texel density constant). */
export function boxUV(geo, texSize = 64, ppm = PPM, offset = [0, 0]) {
  const g = facet(geo);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const s = ppm / texSize;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u, w;
      if (ax >= ay && ax >= az) { u = v.z * Math.sign(n.x || 1); w = v.y; }
      else if (ay >= az) { u = v.x; w = v.z * Math.sign(n.y || 1); }
      else { u = v.x * -Math.sign(n.z || 1) * -1; w = v.y; }
      uv.setXY(i + k, u * s + offset[0], w * s + offset[1]);
    }
  }
  uv.needsUpdate = true;
  return g;
}

/** Scale existing (u along, v around) UVs to a constant texel density. */
export function scaleUV(geo, uLen, vLen, texSize = 32, ppm = PPM) {
  const g = facet(geo);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uLen * ppm / texSize, uv.getY(i) * vLen * ppm / texSize);
  uv.needsUpdate = true;
  return g;
}

/** Convex hull of points → faceted geometry. */
export function hull(points) {
  return new ConvexGeometry(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
}

/** Chamfered box (bevelled edges) centred on origin, optional hand-cut jitter. */
export function chamferBox(w, h, d, c = 0.02, jitter = 0, seed = 1) {
  const pts = [];
  const hw = w / 2, hh = h / 2, hd = d / 2;
  c = Math.min(c, hw * 0.45, hh * 0.45, hd * 0.45);
  let k = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const j = () => (hash2(k++, seed, 41) - 0.5) * jitter * 2;
    pts.push([sx * (hw - c) + j(), sy * hh + j(), sz * (hd - c) + j()]);
    pts.push([sx * hw + j(), sy * (hh - c) + j(), sz * (hd - c) + j()]);
    pts.push([sx * (hw - c) + j(), sy * (hh - c) + j(), sz * hd + j()]);
  }
  return hull(pts);
}

/** Irregular rock: jittered ellipsoid point cloud hull, flattened base. */
export function rockGeo(rx, ry, rz, seed = 1, n = 18, flat = 0.15) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = hash2(i, 1, seed), v = hash2(i, 2, seed);
    const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
    const r = 0.78 + hash2(i, 3, seed) * 0.3;
    let y = Math.cos(ph) * ry * r;
    if (y < -ry * (1 - flat)) y = -ry * (1 - flat);
    pts.push([Math.sin(ph) * Math.cos(th) * rx * r, y, Math.sin(ph) * Math.sin(th) * rz * r]);
  }
  pts.push([0, ry * 0.95, 0]);
  const g = hull(pts);
  g.translate(0, ry * (1 - flat), 0);
  return g;
}

/** n-sided prism with optional pointed tip (crystals, posts). */
export function prism(sides, r, h, opts = {}) {
  const pts = [];
  const taper = opts.taper ?? 1, tip = opts.tip ?? 0, rot = opts.rot ?? 0, jit = opts.jitter ?? 0, seed = opts.seed ?? 1;
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const rr = r * (1 + (hash2(i, 9, seed) - 0.5) * jit);
    pts.push([Math.cos(a) * rr, 0, Math.sin(a) * rr]);
    pts.push([Math.cos(a) * rr * taper, h, Math.sin(a) * rr * taper]);
  }
  if (tip) pts.push([(hash2(1, 2, seed) - 0.5) * r * 0.3, h + tip, (hash2(2, 2, seed) - 0.5) * r * 0.3]);
  return hull(pts);
}

/** Lathe from [radius, y] profile (low segment count = faceted). */
export function lathe(profile, segs = 8, phase = 0) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), segs, phase);
  return g;
}

/** Tube along points. */
export function tube(points, radius, segs = 12, radial = 5, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed);
  return new THREE.TubeGeometry(curve, segs, radius, radial, closed);
}

/** A hand-cut beam along x (chamfered, slightly irregular). */
export function beam(len, w, h, seed = 1, c = 0.012) {
  return chamferBox(len, h, w, c, Math.min(w, h) * 0.06, seed);
}

/** Octagonal log along x with tapering + caps returned separately. */
export function logGeo(len, r, seed = 1, sides = 7) {
  const side = prism(sides, r, len, { taper: 0.92, jitter: 0.12, seed, rot: hash2(seed, 3, 3) });
  side.rotateZ(-Math.PI / 2);
  side.translate(-len / 2, 0, 0);
  const cap0 = new THREE.CircleGeometry(r * 1.0, sides, hash2(seed, 3, 3));
  cap0.rotateY(-Math.PI / 2); cap0.translate(-len / 2 - 0.002, 0, 0);
  const cap1 = new THREE.CircleGeometry(r * 0.92, sides, hash2(seed, 3, 3));
  cap1.rotateY(Math.PI / 2); cap1.translate(len / 2 + 0.002, 0, 0);
  return { side, caps: [cap0, cap1] };
}

/** Shape helpers */
export function shape(pts) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; }
export function extrude(sh, depth, bevel = 0.01, segs = 1) {
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Displace vertices by hashed noise (hand-made wobble). */
export function wobble(geo, amt = 0.01, seed = 1) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = Math.round(x * 97) * 7 + Math.round(y * 89) * 13 + Math.round(z * 83) * 17;
    pos.setXYZ(i, x + (hash2(k, 1, seed) - 0.5) * amt, y + (hash2(k, 2, seed) - 0.5) * amt, z + (hash2(k, 3, seed) - 0.5) * amt);
  }
  pos.needsUpdate = true;
  return geo;
}

/** Place a +Y-aligned part (length = distance) between two points: returns { pos, quat, len } */
export function between(a, b) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return { pos: A.toArray(), quat, len };
}

/** Stone block whose corners are knocked off by different amounts (hand-cut masonry). */
export function chippedBlock(w, h, d, seed = 1, chip = 0.05, bevel = 0.015) {
  const pts = [];
  const hw = w / 2, hh = h / 2, hd = d / 2;
  let k = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = Math.min(bevel + hash2(k++, seed, 51) * chip, hw * 0.45, hh * 0.45, hd * 0.45);
    const cy = Math.min(c * (0.6 + hash2(k, seed, 52) * 0.8), hh * 0.45);
    pts.push([sx * (hw - c), sy * hh, sz * (hd - c)], [sx * hw, sy * (hh - cy), sz * (hd - c)], [sx * (hw - c), sy * (hh - cy), sz * hd]);
    // a second, shallower facet so corners read as chipped rather than mitred
    const c2 = c * 0.4;
    pts.push([sx * (hw - c2 * 0.3), sy * (hh - cy * 0.7), sz * (hd - c2 * 0.3)]);
  }
  return hull(pts);
}

/** A single hand-sawn plank along x: chamfered profile, bowed, twisted, slightly skewed ends. */
export function plank(len, w, t, seed = 1, bow = 0.012, twist = 0.03) {
  const c = Math.min(w, t) * 0.22;
  const prof = shape([[-w / 2 + c, -t / 2], [w / 2 - c, -t / 2], [w / 2, -t / 2 + c], [w / 2, t / 2 - c], [w / 2 - c, t / 2], [-w / 2 + c, t / 2], [-w / 2, t / 2 - c], [-w / 2, -t / 2 + c]]);
  const g = new THREE.ExtrudeGeometry(prof, { depth: len, steps: 5, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  g.rotateX(Math.PI / 2); // wall board: length along x, width along y, thickness along z (faces +z)
  const pos = g.attributes.position;
  const b = bow * (hash2(seed, 1, 61) - 0.3), tw = twist * (hash2(seed, 2, 61) - 0.5), sk0 = (hash2(seed, 3, 61) - 0.5) * w * 0.25, sk1 = (hash2(seed, 4, 61) - 0.5) * w * 0.25;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), u = x / len + 0.5;
    let y = pos.getY(i), z = pos.getZ(i);
    const a = (u - 0.5) * tw * 2;
    const yy = y * Math.cos(a) - z * Math.sin(a), zz = y * Math.sin(a) + z * Math.cos(a);
    y = yy; z = zz + Math.sin(u * Math.PI) * b;
    const end = u < 0.01 ? sk0 : u > 0.99 ? sk1 : 0;
    pos.setXYZ(i, x + end * (y / Math.max(1e-4, w)) + (hash2(Math.round(x * 300), Math.round(y * 300), seed) - 0.5) * 0.003, y, z);
  }
  return g;
}
export { makeTex as paintTex };

const SHADOW_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
const SHADOW_DIST = new THREE.MeshDistanceMaterial({ side: THREE.DoubleSide });
SHADOW_DEPTH.userData.keep = SHADOW_DIST.userData.keep = true;

// ======================================================================= Kit: accumulate parts per material
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export class Kit {
  constructor() { this.parts = new Map(); }
  /**
   * geo: geometry in canonical space. mat: material. o: { pos, rot:[x,y,z], scale, uv:'box'|'keep'|'scale', tex (texture size), uLen, vLen, shadow }
   */
  add(geo, mat, o = {}) {
    let g = geo;
    const ts = (mat.map && mat.map.userData.size && mat.map.userData.size[0]) || 64;
    if (o.uv === 'keep') g = facet(g);
    else if (o.uv === 'scale') g = scaleUV(g, o.uLen || 1, o.vLen || 1, ts);
    else if (o.uv === 'raw') g = facet(g);
    else g = boxUV(g, ts, o.ppm ?? PPM, o.uvOffset);
    if (o.rot || o.pos || o.scale || o.quat) {
      if (o.quat) _q.copy(o.quat);
      else _q.setFromEuler(_e.set(...(o.rot || [0, 0, 0]), o.order || 'XYZ'));
      const sc = o.scale ?? 1;
      _m.compose(_p.set(...(o.pos || [0, 0, 0])), _q, typeof sc === 'number' ? _s.set(sc, sc, sc) : _s.set(...sc));
      g.applyMatrix4(_m);
      if (_m.determinant() < 0) { // keep winding after mirroring
        const pos = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < pos.count; i += 3) { swapVert(pos, i + 1, i + 2); swapVert(uv, i + 1, i + 2); }
        g.deleteAttribute('normal'); g.computeVertexNormals();
      }
    }
    let bucket = this.parts.get(mat);
    if (!bucket) { bucket = { mat, geos: [], shadow: o.shadow !== false }; this.parts.set(mat, bucket); }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    bucket.geos.push(g);
    return g;
  }
  /** Merge into a Group (one mesh per material). */
  build(opts = {}) {
    const grp = new THREE.Group();
    for (const { mat, geos, shadow } of this.parts.values()) {
      const merged = mergeGeometries(geos, false);
      merged.computeBoundingSphere();
      merged.userData.keep = !!opts.keep;
      const mesh = new THREE.Mesh(merged, mat);
      const isGlow = mat.isMeshBasicMaterial;
      mesh.castShadow = shadow && !isGlow && opts.shadow !== false;
      mesh.receiveShadow = !isGlow;
      // one shared depth/distance material for every prop: stops the shadow pass flipping map/side
      // state per draw (each flip forces a program switch — ruinous with cube point-light shadows)
      mesh.customDepthMaterial = SHADOW_DEPTH;
      mesh.customDistanceMaterial = SHADOW_DIST;
      grp.add(mesh);
    }
    return grp;
  }
}
function swapVert(attr, a, b) {
  for (let k = 0; k < attr.itemSize; k++) {
    const t = attr.array[a * attr.itemSize + k];
    attr.array[a * attr.itemSize + k] = attr.array[b * attr.itemSize + k];
    attr.array[b * attr.itemSize + k] = t;
  }
}

/** Cache whole prop prototypes (shared geometry) and hand out light clones. */
const protoCache = new Map();
export function cached(key, make) {
  let proto = protoCache.get(key);
  if (!proto) {
    proto = make();
    proto.traverse((o) => { if (o.geometry) o.geometry.userData.keep = true; });
    protoCache.set(key, proto);
  }
  return proto.clone();
}

export { mixHex, shadeHex, hexToRgb, hash2, hash3 };
