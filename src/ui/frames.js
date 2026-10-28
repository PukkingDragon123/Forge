// Procedural "hand-drawn" pixel-art frames: leather, wood, iron, parchment, stone, dark, gold,
// buttons, ribbons, slots, bars. Results are cached canvases keyed by style + size.
import { Painter, dither } from '../art/pixel.js';
import { hash2, fbm2, clamp, mixHex, shadeHex } from '../core/math.js';

const cache = new Map();
function cached(key, make) {
  let c = cache.get(key);
  if (!c) {
    c = make();
    cache.set(key, c);
    if (cache.size > 800) cache.delete(cache.keys().next().value);
  }
  return c;
}

const OUT = '#140c10';

function rivet(p, x, y, base = 'brass') {
  const pal = base === 'brass'
    ? ['#5a3c14', '#a3782c', '#e0b85a', '#fff0b0']
    : base === 'iron' ? ['#23262e', '#6d7584', '#aab3c0', '#eef2f6'] : ['#3a1c2a', '#8a4a9a', '#c88ae0', '#f4dcff'];
  p.set(x + 1, y, pal[1]); p.set(x + 2, y, pal[1]);
  p.set(x, y + 1, pal[1]); p.set(x + 1, y + 1, pal[3]); p.set(x + 2, y + 1, pal[2]); p.set(x + 3, y + 1, pal[0]);
  p.set(x, y + 2, pal[1]); p.set(x + 1, y + 2, pal[2]); p.set(x + 2, y + 2, pal[2]); p.set(x + 3, y + 2, pal[0]);
  p.set(x + 1, y + 3, pal[0]); p.set(x + 2, y + 3, pal[0]);
}

function smallRivet(p, x, y, base = 'brass') {
  const pal = base === 'brass' ? ['#6a4a1c', '#f0d070'] : ['#2b2f38', '#c9d1dc'];
  p.set(x, y, pal[1]); p.set(x + 1, y, pal[0]); p.set(x, y + 1, pal[0]); p.set(x + 1, y + 1, pal[0]);
}

function bevel(p, w, h, hi, sh, inset = 1) {
  for (let x = inset; x < w - inset; x++) { p.set(x, inset, hi); p.set(x, h - 1 - inset, sh); }
  for (let y = inset; y < h - inset; y++) { p.set(inset, y, hi); p.set(w - 1 - inset, y, sh); }
}

function border(p, w, h, col) {
  for (let x = 1; x < w - 1; x++) { p.set(x, 0, col); p.set(x, h - 1, col); }
  for (let y = 1; y < h - 1; y++) { p.set(0, y, col); p.set(w - 1, y, col); }
}

// ------------------------------------------------------------------ LEATHER
export function leather(w, h, opts = {}) {
  const tone = opts.tone || 'brown';
  const key = `leather|${w}|${h}|${tone}|${opts.stitch !== false}|${opts.rivets !== false}|${opts.seed || 0}`;
  return cached(key, () => {
    const tones = {
      brown: ['#4a2716', '#5c321d', '#6b3d24', '#7a482b', '#8d5634', '#b0784a'],
      dark: ['#2b1710', '#382017', '#43271b', '#4f2f21', '#5d3828', '#7f5038'],
      red: ['#4a1a1a', '#5e2222', '#702a26', '#80332c', '#944034', '#bd6450'],
      green: ['#1f2e1d', '#2a3b25', '#334a2c', '#3d5733', '#4a663c', '#6f8d55'],
    }[tone];
    const seed = opts.seed || 7;
    const p = new Painter(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm2(x * 0.09, y * 0.09, 3, seed) * 0.7 + hash2(x, y, seed) * 0.3;
      const grain = hash2(x >> 1, y, seed + 3) > 0.92 ? -0.15 : 0;
      const t = clamp(n + grain, 0, 0.999);
      p.set(x, y, tones[1 + Math.floor(t * 3.2)]);
    }
    // worn lighter patches toward center
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const n = fbm2(x * 0.05 + 10, y * 0.05, 2, seed + 9);
      if (n > 0.66 && dither(x, y, (n - 0.66) * 4)) p.set(x, y, tones[4]);
    }
    border(p, w, h, OUT);
    bevel(p, w, h, tones[5], tones[0]);
    // second shade line inside bevel for thickness
    for (let x = 2; x < w - 2; x++) p.set(x, h - 3, tones[1]);
    for (let y = 2; y < h - 2; y++) p.set(w - 3, y, tones[1]);
    if (opts.stitch !== false && w > 14 && h > 14) {
      const i = 4;
      const thread = '#e6c08a', threadSh = '#3a1f12';
      for (let x = i + 1; x < w - i - 1; x++) if (((x - i) >> 1) % 2 === 0) { p.set(x, i, thread); p.set(x, i + 1, threadSh); p.set(x, h - 1 - i, thread); p.set(x, h - i, threadSh); }
      for (let y = i + 1; y < h - i - 1; y++) if (((y - i) >> 1) % 2 === 0) { p.set(i, y, thread); p.set(i + 1, y, threadSh); p.set(w - 1 - i, y, thread); p.set(w - i, y, threadSh); }
    }
    // corners: rounded cut
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.clear(cx, cy);
    p.set(1, 1, OUT); p.set(w - 2, 1, OUT); p.set(1, h - 2, OUT); p.set(w - 2, h - 2, OUT);
    if (opts.rivets !== false && w > 20 && h > 20) {
      rivet(p, 2, 2); rivet(p, w - 6, 2); rivet(p, 2, h - 6); rivet(p, w - 6, h - 6);
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ WOOD
export function wood(w, h, opts = {}) {
  const key = `wood|${w}|${h}|${opts.tone || 'oak'}|${opts.vertical ? 1 : 0}|${opts.nails !== false}`;
  return cached(key, () => {
    const tones = opts.tone === 'dark'
      ? ['#24150d', '#352014', '#43291a', '#523321', '#644029', '#7d5434']
      : ['#3d2414', '#5a3820', '#6f4628', '#835534', '#99683f', '#c08a56'];
    const p = new Painter(w, h);
    const plank = opts.plank || 7;
    const along = opts.vertical ? h : w;
    const across = opts.vertical ? w : h;
    for (let a = 0; a < along; a++) for (let b = 0; b < across; b++) {
      const x = opts.vertical ? b : a, y = opts.vertical ? a : b;
      const pi = Math.floor(b / plank);
      const inPlank = b % plank;
      const g = Math.sin((a * 0.18 + pi * 3.1) + Math.sin(b * 0.9 + pi) * 1.4 + fbm2(a * 0.05, pi, 2, 11) * 6);
      let t = 0.45 + g * 0.18 + (hash2(a, b, pi) - 0.5) * 0.15;
      if (inPlank === 0) t = -1; // gap
      else if (inPlank === 1) t += 0.25; // lit top edge of plank
      else if (inPlank === plank - 1) t -= 0.2;
      // knots
      const kx = Math.floor(hash2(pi, 3, 5) * along);
      const kd = Math.hypot((a - kx) * 0.6, b - (pi * plank + plank / 2));
      if (kd < 2.2 && hash2(pi, 9, 2) > 0.45) t = kd < 1.2 ? 0.05 : 0.2;
      p.set(x, y, t < 0 ? tones[0] : tones[1 + Math.floor(clamp(t, 0, 0.999) * 4)]);
    }
    border(p, w, h, OUT);
    bevel(p, w, h, tones[5], tones[0]);
    if (opts.nails !== false) {
      const n = Math.ceil(across / plank);
      for (let i = 0; i < n; i++) {
        const b = i * plank + Math.floor(plank / 2);
        if (b >= across - 2) continue;
        for (const a of [3, along - 5]) {
          const x = opts.vertical ? b : a, y = opts.vertical ? a : b;
          p.set(x, y, '#c9ced6'); p.set(x + 1, y, '#5b6170'); p.set(x, y + 1, '#5b6170'); p.set(x + 1, y + 1, '#2b2f38');
        }
      }
    }
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.clear(cx, cy);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ IRON
export function iron(w, h, opts = {}) {
  const key = `iron|${w}|${h}|${opts.tone || 'steel'}|${opts.rivets !== false}|${opts.rust ?? 1}`;
  return cached(key, () => {
    const tones = opts.tone === 'dark'
      ? ['#121318', '#1d1f26', '#262932', '#30343f', '#3c414e', '#636b7c']
      : ['#1e2128', '#353a46', '#434956', '#505766', '#5f6778', '#9aa3b4'];
    const p = new Painter(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const streak = fbm2(x * 0.02, y * 0.6, 2, 21) * 0.6 + hash2(x, y, 4) * 0.25;
      const vert = (y / h) * 0.25;
      p.set(x, y, tones[1 + Math.floor(clamp(streak + 0.25 - vert, 0, 0.999) * 4)]);
    }
    // scratches
    for (let s = 0; s < Math.floor((w * h) / 600); s++) {
      const x0 = Math.floor(hash2(s, 1, 33) * w), y0 = Math.floor(hash2(s, 2, 33) * h);
      const len = 3 + Math.floor(hash2(s, 3, 33) * 8);
      for (let i = 0; i < len; i++) p.set(x0 + i, y0 + Math.floor(i * 0.4), tones[4]);
    }
    if (opts.rust ?? 1) {
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        const r = fbm2(x * 0.15, y * 0.15, 2, 77);
        if (edge < 6 && r > 0.62 + edge * 0.03 && hash2(x, y, 8) > 0.35) p.set(x, y, hash2(x, y, 9) > 0.5 ? '#7a4426' : '#5a301c');
      }
    }
    border(p, w, h, OUT);
    bevel(p, w, h, tones[5], tones[0]);
    for (let x = 2; x < w - 2; x++) p.set(x, 2, tones[4]);
    if (opts.rivets !== false) {
      const step = 14;
      for (let x = 4; x < w - 5; x += step) { smallRivet(p, x, 3, 'iron'); smallRivet(p, x, h - 5, 'iron'); }
      if (h > 30) for (let y = 4 + step; y < h - 8; y += step) { smallRivet(p, 3, y, 'iron'); smallRivet(p, w - 5, y, 'iron'); }
    }
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.clear(cx, cy);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ PARCHMENT
export function parchment(w, h, opts = {}) {
  const key = `parch|${w}|${h}|${opts.seed || 1}|${opts.burnt ?? 1}`;
  return cached(key, () => {
    const seed = opts.seed || 1;
    const p = new Painter(w, h);
    const tones = ['#7a4f26', '#b88a52', '#d9bd85', '#e6cf9c', '#efdcae', '#f6e8c4'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const rough = fbm2(x * 0.3, y * 0.3, 2, seed) * 3.2;
      if (edge + 0.6 < rough * 0.55) continue; // torn transparent edge
      const e = edge - rough * 0.5;
      const n = fbm2(x * 0.06, y * 0.06, 3, seed + 5);
      let t = 0.55 + (n - 0.5) * 0.5;
      if (e < 1.2 && (opts.burnt ?? 1)) t = 0.0;
      else if (e < 3) t = Math.min(t, 0.18 + e * 0.08);
      // stains
      const st = fbm2(x * 0.04 + 40, y * 0.04, 3, seed + 2);
      if (st > 0.68) t -= 0.12;
      const idx = clamp(t, 0, 0.999) * (tones.length - 1);
      const i0 = Math.floor(idx);
      p.set(x, y, dither(x, y, idx - i0) ? tones[Math.min(i0 + 1, tones.length - 1)] : tones[i0]);
    }
    p.outline('#2e1a0e');
    // faint ruled lines
    if (opts.lines) for (let y = 14; y < h - 8; y += 11) for (let x = 8; x < w - 8; x++) if (hash2(x, y, 3) > 0.25 && p.alpha(x, y)) p.set(x, y, '#d4b880');
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ STONE TABLET
export function stone(w, h, opts = {}) {
  const key = `stone|${w}|${h}|${opts.tone || 'gray'}|${opts.seed || 3}`;
  return cached(key, () => {
    const seed = opts.seed || 3;
    const tones = {
      gray: ['#1f1b1a', '#3a3532', '#4a4440', '#57514b', '#655e56', '#8a8277'],
      blue: ['#141a24', '#26303f', '#2f3b4d', '#38475b', '#435469', '#6b809a'],
      purple: ['#1b1220', '#2f2038', '#3a2844', '#463050', '#523a5e', '#7c5c8c'],
      ember: ['#1e1210', '#3a2018', '#4a2a1e', '#5a3322', '#6b3d28', '#a05a36'],
    }[opts.tone || 'gray'];
    const p = new Painter(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm2(x * 0.12, y * 0.12, 3, seed) * 0.75 + hash2(x, y, seed) * 0.25;
      p.set(x, y, tones[1 + Math.floor(clamp(n, 0, 0.999) * 4)]);
    }
    // cracks
    for (let c = 0; c < Math.max(1, Math.floor((w + h) / 60)); c++) {
      let x = Math.floor(hash2(c, 0, seed) * w), y = hash2(c, 1, seed) > 0.5 ? 1 : h - 2;
      const dy = y < 2 ? 1 : -1;
      for (let i = 0; i < 6 + hash2(c, 2, seed) * 10; i++) {
        p.set(x, y, tones[0]); p.set(x + 1, y, tones[4]);
        y += dy; x += Math.floor(hash2(c, i, 99) * 3) - 1;
      }
    }
    border(p, w, h, OUT);
    bevel(p, w, h, tones[5], tones[0]);
    bevel(p, w, h, tones[4], tones[1], 2);
    // chipped corners
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) {
      p.clear(cx, cy); p.clear(cx + sx, cy); p.clear(cx, cy + sy);
      p.set(cx + sx, cy + sy, OUT);
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ DARK (tooltips)
export function dark(w, h, opts = {}) {
  const key = `dark|${w}|${h}|${opts.accent || 'gold'}`;
  return cached(key, () => {
    const p = new Painter(w, h);
    const acc = { gold: ['#7a5a2a', '#e0b85a'], purple: ['#5a3a7a', '#c08ae0'], blue: ['#2a4a7a', '#7ab8ff'], red: ['#7a2a2a', '#ff7a6a'], green: ['#2a6a3a', '#7ae08a'] }[opts.accent || 'gold'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = hash2(x, y, 5);
      p.set(x, y, n > 0.85 ? '#251b2b' : y < h * 0.5 && n > 0.6 ? '#211826' : '#1c1421');
    }
    border(p, w, h, OUT);
    bevel(p, w, h, '#4a3a55', '#0f0a12');
    bevel(p, w, h, '#2c2233', '#160f19', 2);
    // corner ornaments
    for (const [cx, cy, sx, sy] of [[2, 2, 1, 1], [w - 3, 2, -1, 1], [2, h - 3, 1, -1], [w - 3, h - 3, -1, -1]]) {
      p.set(cx, cy, acc[1]); p.set(cx + sx, cy, acc[0]); p.set(cx, cy + sy, acc[0]); p.set(cx + 2 * sx, cy, acc[0]); p.set(cx, cy + 2 * sy, acc[0]);
    }
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.clear(cx, cy);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ GOLD ORNATE
export function gold(w, h, opts = {}) {
  const key = `gold|${w}|${h}|${opts.inner || '#2a1830'}`;
  return cached(key, () => {
    const p = new Painter(w, h);
    const g = ['#4a2a0a', '#8a5a14', '#c8902a', '#e8b84a', '#ffe08a', '#fff6c8'];
    const inner = opts.inner || '#2a1830';
    p.rect(0, 0, w, h, inner);
    for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) if (hash2(x, y, 6) > 0.8) p.set(x, y, shadeHex(inner, 0.06));
    // 3px gold border with bands
    for (let i = 0; i < 4; i++) {
      const c = [g[1], g[4], g[3], g[1]][i];
      for (let x = i; x < w - i; x++) { p.set(x, i, i === 1 ? g[5] : c); p.set(x, h - 1 - i, i === 1 ? g[2] : c); }
      for (let y = i; y < h - i; y++) { p.set(i, y, i === 1 ? g[4] : c); p.set(w - 1 - i, y, i === 1 ? g[2] : c); }
    }
    border(p, w, h, OUT);
    // filigree corners
    const fil = ['.yy..', 'y..y.', 'y.Yy.', '.yy..', '.....'];
    for (const [cx, cy, sx, sy] of [[4, 4, 1, 1], [w - 5, 4, -1, 1], [4, h - 5, 1, -1], [w - 5, h - 5, -1, -1]]) {
      fil.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') p.set(cx + i * sx, cy + j * sy, ch === 'Y' ? g[5] : g[3]); }));
    }
    // midpoint gems
    if (w > 40) { const mx = w >> 1; p.set(mx - 1, 1, '#ff5a6a'); p.set(mx, 1, '#ffb3c0'); p.set(mx - 1, h - 2, '#ff5a6a'); p.set(mx, h - 2, '#9a1f2e'); }
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.clear(cx, cy);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ SLOT (inset)
export function slot(w, h, opts = {}) {
  const key = `slot|${w}|${h}|${opts.tone || 'leather'}|${opts.glow || ''}`;
  return cached(key, () => {
    const tones = {
      leather: ['#1e100a', '#2b170e', '#341d12', '#3d2216', '#4f2e1d'],
      stone: ['#121010', '#1d1a19', '#252120', '#2d2826', '#3d3734'],
      dark: ['#0b080d', '#140f17', '#19121c', '#1e1622', '#2c2232'],
    }[opts.tone || 'leather'];
    const p = new Painter(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, tones[1 + Math.floor(hash2(x, y, 31) * 2.4)]);
    // inner shadow top-left, light bottom-right (inset)
    for (let x = 0; x < w; x++) { p.set(x, 0, tones[0]); p.set(x, 1, tones[1]); p.set(x, h - 1, tones[4]); }
    for (let y = 0; y < h; y++) { p.set(0, y, tones[0]); p.set(w - 1, y, tones[4]); }
    if (opts.glow) {
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const e = Math.min(x, y, w - 1 - x, h - 1 - y);
        if (e < 2) p.set(x, y, opts.glow, e === 1 ? 160 : 230);
      }
    }
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ BUTTONS
/**
 * style: 'wood' | 'iron' | 'gold' | 'stone' | 'red'
 * state: 'idle' | 'hover' | 'down' | 'off'
 */
export function button(w, h, style = 'wood', state = 'idle') {
  const key = `btn|${w}|${h}|${style}|${state}`;
  return cached(key, () => {
    const pal = {
      wood: ['#3d2414', '#6a4126', '#80502e', '#956038', '#b07445', '#d8a066'],
      iron: ['#1e2128', '#3e4451', '#4b5260', '#5a6273', '#6d7689', '#aab3c4'],
      gold: ['#5a3008', '#a0641a', '#c8862a', '#e0a63a', '#f4c45a', '#fff0a8'],
      stone: ['#1f1b1a', '#3f3935', '#4d4641', '#5c544d', '#6c635a', '#968c80'],
      red: ['#3a0e12', '#7a1e26', '#962a30', '#b03a3a', '#c85448', '#ff9a80'],
      green: ['#0f2a16', '#2a5a30', '#36703a', '#428446', '#549a52', '#9ad88a'],
      purple: ['#22102e', '#4a2a62', '#5a3476', '#6a408a', '#7e52a0', '#c8a0e8'],
    }[style];
    let t = pal;
    if (state === 'hover') t = pal.map((c, i) => (i === 0 ? c : shadeHex(c, 0.12)));
    if (state === 'off') t = pal.map((c) => mixHex(c, '#3a3436', 0.65));
    const p = new Painter(w, h);
    const down = state === 'down' ? 1 : 0;
    // base shadow (button thickness)
    p.rect(1, 2, w - 2, h - 2, t[0]);
    // face
    const fy = down, fh = h - 3;
    for (let y = fy; y < fy + fh; y++) for (let x = 1; x < w - 1; x++) {
      let v;
      if (style === 'wood') v = 0.5 + Math.sin(x * 0.25 + Math.sin(y * 1.3) * 1.2) * 0.12 + (hash2(x, y, 1) - 0.5) * 0.15;
      else if (style === 'iron') v = 0.55 - ((y - fy) / fh) * 0.25 + (hash2(x >> 1, y, 2) - 0.5) * 0.12;
      else if (style === 'gold') v = 0.75 - ((y - fy) / fh) * 0.5 + (hash2(x, y, 3) > 0.92 ? 0.25 : 0);
      else v = 0.5 + (fbm2(x * 0.2, y * 0.2, 2, 7) - 0.5) * 0.5 - ((y - fy) / fh) * 0.15;
      p.set(x, y, t[1 + Math.floor(clamp(v, 0, 0.999) * 4)]);
    }
    // bevels
    for (let x = 1; x < w - 1; x++) { p.set(x, fy, t[5]); p.set(x, fy + fh - 1, t[0]); }
    for (let y = fy; y < fy + fh; y++) { p.set(1, y, t[4]); p.set(w - 2, y, t[1]); }
    if (style === 'wood' || style === 'stone') {
      // iron brackets at both ends
      for (const bx of [3, w - 6]) {
        for (let y = fy + 1; y < fy + fh - 1; y++) { p.set(bx, y, '#4b5160'); p.set(bx + 1, y, '#7c8494'); p.set(bx + 2, y, '#2b2f38'); }
        p.set(bx + 1, fy + 2, '#d0d6de'); p.set(bx + 1, fy + fh - 3, '#d0d6de');
      }
    }
    if (style === 'gold') {
      p.set(3, fy + 2, '#fff'); p.set(4, fy + 2, t[5]); p.set(3, fy + 3, t[5]);
    }
    // outline
    border(p, w, h, OUT);
    p.set(1, h - 1, OUT); p.set(w - 2, h - 1, OUT);
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.clear(cx, cy);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ RIBBON BANNER
export function ribbon(w, color = 'red') {
  const key = `ribbon|${w}|${color}`;
  return cached(key, () => {
    const pal = {
      red: ['#3a0a10', '#7a1a22', '#a8282e', '#d04040', '#f07a6a'],
      blue: ['#0a1a3a', '#1a3a7a', '#2a5aa8', '#3a7ad0', '#8ac0ff'],
      green: ['#0a2a12', '#1a5a2a', '#2a7a3a', '#3a9a4a', '#8ae08a'],
      purple: ['#1a0a2a', '#3a1a5a', '#5a2a8a', '#7a3ab0', '#c08aff'],
      gold: ['#4a2a08', '#8a5a14', '#c08a2a', '#e8b84a', '#fff0a0'],
      brown: ['#2a160c', '#5a3218', '#7a4626', '#955834', '#c08a56'],
    }[color];
    const h = 15;
    const p = new Painter(w, h);
    const tail = 8;
    // tails (behind)
    for (const side of [0, 1]) {
      for (let y = 4; y < h; y++) for (let i = 0; i < tail; i++) {
        const x = side ? w - 1 - i : i;
        const notch = Math.abs(y - 9.5) < (tail - i) * 0.35 && i < 4;
        if (notch) continue;
        p.set(x, y, i > tail - 3 ? pal[0] : pal[1]);
      }
    }
    // main band
    for (let y = 0; y < h - 4; y++) for (let x = tail - 3; x < w - tail + 3; x++) {
      const v = y === 0 ? 4 : y === 1 ? 3 : y > h - 7 ? 1 : 2;
      p.set(x, y, pal[v]);
    }
    for (let x = tail - 3; x < w - tail + 3; x++) if (x % 3 === 0) p.set(x, h - 6, pal[1]);
    p.outline(OUT);
    return p.toCanvas();
  });
}

// ------------------------------------------------------------------ BARS
export function bar(w, h, fill, colors = ['#7a1a22', '#d03a3a', '#ff8a7a'], back = '#1a0d10') {
  // not cached (fill changes) — cheap
  const p = new Painter(w, h);
  p.rect(0, 0, w, h, OUT);
  p.rect(1, 1, w - 2, h - 2, back);
  const fw = Math.round((w - 2) * clamp(fill, 0, 1));
  if (fw > 0) {
    p.rect(1, 1, fw, h - 2, colors[1]);
    p.hline(1, fw, 1, colors[2]);
    p.hline(1, fw, h - 2, colors[0]);
    if (fw < w - 2) p.vline(fw, 1, h - 2, colors[2]);
  }
  return p.toCanvas();
}

// ------------------------------------------------------------------ DIVIDER
export function divider(w, color = 'gold') {
  const key = `div|${w}|${color}`;
  return cached(key, () => {
    const c = color === 'gold' ? ['#6a4a1a', '#e0b85a', '#fff0b0'] : ['#3a2a1a', '#9a7a5a', '#d8c0a0'];
    const p = new Painter(w, 5);
    const m = w >> 1;
    for (let x = 4; x < w - 4; x++) { p.set(x, 2, c[1]); if (hash2(x, 0, 1) > 0.5) p.set(x, 3, c[0]); }
    // diamond center
    p.set(m, 0, c[1]); p.set(m - 1, 1, c[1]); p.set(m, 1, c[2]); p.set(m + 1, 1, c[1]);
    p.set(m - 2, 2, c[1]); p.set(m + 2, 2, c[1]); p.set(m, 2, c[2]);
    p.set(m - 1, 3, c[0]); p.set(m, 3, c[1]); p.set(m + 1, 3, c[0]); p.set(m, 4, c[0]);
    for (const x of [2, w - 3]) { p.set(x, 1, c[1]); p.set(x, 2, c[2]); p.set(x, 3, c[1]); }
    return p.toCanvas();
  });
}

export function clearFrameCache() { cache.clear(); }
