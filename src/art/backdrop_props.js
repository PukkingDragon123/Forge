// Hand-drawn scenery features painted into backdrop layers. Each piece is its own sprite: planks
// with grain and knots, faceted crystals, stacked drums and voussoirs, tattered cloth. Every surface
// is lit per pixel by the layer's lights (warm key pools, teal shadow, rim) and inked by hand rules.
// Context C = { img, glow, sh (Shade), M (materials), mat(hex) → material }.
import { Img, hp, A, mixp, qt, hash, wob, blobPts, polyMask, inkSprite, mixHex, shadeHex } from './backdrop_kit.js';
import { halo } from './backdrop_rock.js';

const TAU = Math.PI * 2;
const clampT = (t) => (t < 0.6 ? 0.6 : t > 8 ? 8 : t);

/** A sprite bound to a layer: lit pixels, polygon fills, then ink + composite. */
class Spr {
  constructor(C, x0, y0, x1, y1) {
    this.C = C;
    this.ox = Math.floor(x0) - 3; this.oy = Math.floor(y0) - 3;
    this.s = new Img(Math.ceil(x1 - x0) + 7, Math.ceil(y1 - y0) + 7);
    this.ls = C.sh.near(this.ox, this.oy, this.ox + this.s.w, this.oy + this.s.h);
  }
  lit(M, x, y, nx, ny, nz, dt = 0) {
    const t = this.C.sh.idx(x, y, nx, ny, nz, this.ls) + dt;
    this.s.set(x - this.ox, y - this.oy, this.C.sh.col(M, clampT(t), x | 0, y | 0));
  }
  raw(x, y, c) { this.s.set(x - this.ox, y - this.oy, c); }
  fill(pts, fn) {
    const pm = polyMask(pts, 0);
    for (let y = 0; y < pm.h; y++) for (let x = 0; x < pm.w; x++) if (pm.m[y * pm.w + x]) fn(x + pm.x0, y + pm.y0);
  }
  done(o = {}) {
    if (o.ink !== false) inkSprite(this.s, this.C.sh, this.ls, this.ox, this.oy, { seed: o.seed || 7, ink: o.inkC, warmInk: o.warmInk, rim: o.rim });
    this.C.img.draw(this.s, this.ox, this.oy);
  }
}
const bbox = (pts, pad = 0) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};
const inkOf = (M) => ({ inkC: M.w[0], warmInk: mixp(M.w[0], M.w[4], 0.5), rim: M.w[8] });

// ---------------------------------------------------------------------------- wood
/**
 * A board/beam from a to b: wobbly edges, rounded bevel, grain streaks, knots, end grain, nail heads.
 * o: { tone, knots, nails:[t], round }
 */
export function plank(C, M, a, b, wid, seed, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux, hw = wid / 2;
  const n = Math.max(2, Math.ceil(len / 7));
  const left = [], right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, cx = a[0] + dx * t, cy = a[1] + dy * t;
    const w1 = hw * (1 + (wob(t * len * 0.09, seed) - 0.5) * 0.3), w2 = hw * (1 + (wob(t * len * 0.09, seed + 7) - 0.5) * 0.3);
    const cut = i === 0 ? (hash(seed, 1, 1) - 0.5) * wid * 0.4 : i === n ? (hash(seed, 2, 1) - 0.5) * wid * 0.4 : 0;
    left.push([cx + px * w1 + ux * cut, cy + py * w1 + uy * cut]);
    right.push([cx - px * w2 - ux * cut, cy - py * w2 - uy * cut]);
  }
  const pts = left.concat(right.reverse());
  const [x0, y0, x1, y1] = bbox(pts);
  const spr = new Spr(C, x0, y0, x1, y1);
  const tone = o.tone ?? (hash(seed, 3, 3) - 0.5) * 0.8;
  const knots = [];
  for (let k = 0; k < (o.knots ?? (len > 40 ? 1 + Math.floor(hash(seed, 4, 4) * 2) : 0)); k++) knots.push({ al: len * (0.15 + hash(seed, k, 5) * 0.7), ac: (hash(seed, k, 6) - 0.5) * 1.1, r: 1.6 + hash(seed, k, 7) * wid * 0.18 });
  const gf = 5 + hash(seed, 8, 8) * 3;
  spr.fill(pts, (x, y) => {
    const rx = x + 0.5 - a[0], ry = y + 0.5 - a[1];
    const al = rx * ux + ry * uy, ac = Math.max(-1, Math.min(1, (rx * px + ry * py) / hw));
    const bev = o.round ? ac * 0.75 : Math.abs(ac) > 0.66 ? Math.sign(ac) * 0.72 : ac * 0.22;
    let dt = tone + (wob(al * 0.03 + ac * 2.5, seed + 2) - 0.5) * 0.9;
    if (Math.sin(ac * gf + wob(al * 0.05, seed + 3) * 5) > 0.86) dt -= 1.0;
    for (const k of knots) {
      const d = Math.hypot((al - k.al) / (k.r * 1.6), ((ac - k.ac) * hw) / k.r);
      if (d < 1) dt += d < 0.45 ? -2 : d < 0.75 ? 0.6 : -0.8;
      else if (d < 2.2 && Math.abs(ac - k.ac) * hw < k.r * 1.8) dt -= 0.25; // grain swirling round the knot
    }
    if (al < 1.5 || al > len - 1.5) dt -= 0.9; // end grain
    spr.lit(M, x, y, px * bev, py * bev, Math.sqrt(1 - bev * bev), dt);
  });
  for (const t of o.nails || []) {
    const nx = (a[0] + dx * t) | 0, ny = (a[1] + dy * t) | 0;
    spr.lit(C.M.iron, nx, ny, -0.4, -0.5, 0.77, 1.4);
    spr.lit(C.M.iron, nx + 1, ny + 1, 0.4, 0.5, 0.77, -1.5);
  }
  spr.done({ seed, ...inkOf(M) });
}

/** Mine timber frame: leaning posts, an overhanging cap, braces, wedges. (x = center, y = floor) */
export function timberFrame(C, x, y, w, h, seed = 1) {
  const M = C.M.wood;
  const pw = Math.max(9, w * 0.085), cap = Math.max(10, pw * 1.1);
  const lean = (k) => (hash(seed, k, 9) - 0.5) * pw * 0.6;
  const lx = x - w / 2 + pw / 2, rx = x + w / 2 - pw / 2, top = y - h;
  plank(C, M, [lx + lean(1), y], [lx + lean(2), top + cap * 0.6], pw * (0.92 + hash(seed, 1, 2) * 0.16), seed + 1, { nails: [0.9] });
  plank(C, M, [rx + lean(3), y], [rx + lean(4), top + cap * 0.6], pw * (0.92 + hash(seed, 2, 2) * 0.16), seed + 2, { nails: [0.9] });
  const bl = Math.min(w, h) * 0.24;
  plank(C, M, [lx + pw * 0.4, top + cap + bl], [lx + bl, top + cap * 0.7], pw * 0.55, seed + 5, { knots: 0 });
  plank(C, M, [rx - pw * 0.4, top + cap + bl], [rx - bl, top + cap * 0.7], pw * 0.55, seed + 6, { knots: 0 });
  plank(C, M, [x - w / 2 - pw * (0.4 + hash(seed, 3, 3) * 0.5), top + cap / 2 + (hash(seed, 4, 3) - 0.5) * 3], [x + w / 2 + pw * (0.4 + hash(seed, 5, 3) * 0.5), top + cap / 2 + (hash(seed, 6, 3) - 0.5) * 3], cap, seed + 3, { nails: [0.08, 0.92] });
  for (const sx of [lx, rx]) { // wedge shims between cap and posts
    const sp = new Spr(C, sx - pw * 0.5, top + cap - 1, sx + pw * 0.5, top + cap + 4);
    sp.fill([[sx - pw * 0.45, top + cap - 1], [sx + pw * 0.4, top + cap - 1], [sx + pw * 0.1, top + cap + 3]], (px, py) => sp.lit(M, px, py, 0, 0.4, 0.9, 0.4));
    sp.done({ seed, ...inkOf(M) });
  }
}

/** Hanging lantern on a short chain; warm glass (emissive) + halo. Returns its light center. */
export function lantern(C, x, y, scale = 1, color = '#ffb050') {
  const w = Math.round(9 * scale), h = Math.round(13 * scale), I = C.M.iron;
  chain(C, x, y - 6 * scale, y + 2, Math.max(1, scale * 0.8));
  const top = y + 2;
  const sp = new Spr(C, x - w / 2 - 2, top - 3, x + w / 2 + 2, top + h + 3);
  const glass = [mixHex(color, '#fff6d8', 0.75), mixHex(color, '#ffe8a0', 0.35), color, shadeHex(color, -0.25)].map((c) => hp(c));
  sp.fill([[x - w / 2 - 1, top + 2], [x + w / 2 + 1, top + 2], [x + w * 0.2, top - 2], [x - w * 0.2, top - 2]], (px, py) => sp.lit(I, px, py, (px - x) / w, -0.7, 0.6, 0.4));
  for (let yy = top + 3; yy < top + h - 2; yy++) for (let xx = Math.round(x - w / 2 + 1); xx < x + w / 2 - 1; xx++) {
    const bar = Math.abs(xx - x) < 0.6 || xx === Math.round(x - w / 2 + 1) || xx === Math.round(x + w / 2 - 2);
    if (bar) { sp.lit(I, xx, yy, ((xx - x) / w) * 1.4, 0, 0.8); continue; }
    const k = Math.hypot((xx - x) / (w / 2), (yy - (top + h / 2)) / (h / 2));
    const c = glass[k < 0.35 ? 0 : k < 0.62 ? 1 : k < 0.85 ? 2 : 3];
    sp.raw(xx, yy, c);
    if (C.glow) C.glow.set(xx, yy, c);
  }
  sp.fill([[x - w / 2, top + h - 3], [x + w / 2, top + h - 3], [x + w * 0.3, top + h], [x - w * 0.3, top + h]], (px, py) => sp.lit(I, px, py, (px - x) / w, 0.4, 0.8));
  sp.done({ seed: 5, ...inkOf(I) });
  if (C.glow) halo(C.glow, x, top + h / 2, 20 * scale, hp(mixHex(color, '#401800', 0.55)), 0.7);
  return { x, y: top + h / 2, c: color };
}

/** Iron wall sconce with a wrapped torch (the flame itself is an animated sprite). */
export function sconce(C, x, y, scale = 1) {
  const I = C.M.iron;
  plank(C, C.M.wood, [x + 1.5 * scale, y + 15 * scale], [x - 0.5 * scale, y + 2 * scale], 4 * scale, 33, { knots: 0 });
  const sp = new Spr(C, x - 7 * scale, y - 2, x + 7 * scale, y + 16 * scale);
  sp.fill([[x - 4.5 * scale, y + 2 * scale], [x + 4.5 * scale, y + 2 * scale], [x + 3 * scale, y + 6 * scale], [x - 3 * scale, y + 6 * scale]], (px, py) => sp.lit(I, px, py, (px - x) / (5 * scale), 0.1, 0.85, 0.3));
  for (let t = 0; t < 1; t += 0.04) { const a = t * TAU * 0.85; sp.lit(I, Math.round(x + 4 * scale + Math.cos(a) * 3 * scale * (1 - t * 0.4)), Math.round(y + 9 * scale + Math.sin(a) * 3 * scale * (1 - t * 0.4)), Math.cos(a), Math.sin(a), 0.5, 0.6); }
  for (let yy = y + 5 * scale; yy < y + 14 * scale; yy++) sp.lit(I, Math.round(x + scale), Math.round(yy), 0.3, 0, 0.9);
  for (let k = 0; k < 4; k++) for (let xx = -3; xx <= 3; xx++) sp.lit(C.M.rope, Math.round(x + xx * scale * 0.8), Math.round(y + (k * 1.2 - 0.5) * scale), xx / 4, -0.2, 0.9, (k & 1) * -0.6);
  sp.done({ seed: 9, ...inkOf(I) });
  return { x, y };
}

// ---------------------------------------------------------------------------- crystals
/** Faceted crystal cluster: each prism has a lit face and a dark face, glowing from inside. (x,y = base) */
export function crystalCluster(C, x, y, size, color, seed = 1, o = {}) {
  const cr = [shadeHex(color, -0.72), shadeHex(color, -0.45), shadeHex(color, -0.18), color, mixHex(color, '#ffffff', 0.45), mixHex(color, '#ffffff', 0.8)].map((c) => hp(c));
  const n = 3 + Math.floor(hash(seed, 1, 3) * 4);
  const prisms = [];
  for (let i = 0; i < n; i++) {
    const ang = -0.8 + (i / Math.max(1, n - 1)) * 1.6 + (hash(seed, i, 5) - 0.5) * 0.5;
    const len = size * (0.5 + hash(seed, i, 7) * 0.7) * (i === Math.floor(n / 2) ? 1.3 : 1);
    prisms.push({ ang, len, wid: size * (0.12 + hash(seed, i, 9) * 0.09), sd: seed * 13 + i });
  }
  prisms.sort((a, b) => Math.abs(b.ang) - Math.abs(a.ang));
  const sp = new Spr(C, x - size * 1.3, y - size * 1.6, x + size * 1.3, y + 4);
  const ink = hp(mixHex(shadeHex(color, -0.85), '#04080c', 0.5));
  for (const p of prisms) {
    const dx = Math.sin(p.ang), dy = -Math.cos(p.ang), px = -dy, py = dx;
    const bx = x + dx * size * 0.12 + (hash(p.sd, 1, 1) - 0.5) * size * 0.3, by = y + 2;
    const shl = p.len * (0.72 + hash(p.sd, 2, 2) * 0.12);
    const tipOff = (hash(p.sd, 3, 3) - 0.5) * p.wid * 0.8;
    const tip = [bx + dx * p.len + px * tipOff, by + dy * p.len + py * tipOff];
    const L0 = [bx - px * p.wid, by - py * p.wid], R0 = [bx + px * p.wid, by + py * p.wid];
    const Ls = [L0[0] + dx * shl, L0[1] + dy * shl], Rs = [R0[0] + dx * shl * 0.94, R0[1] + dy * shl * 0.94];
    const m0 = [bx - px * p.wid * 0.2, by - py * p.wid * 0.2], m1 = [m0[0] + dx * shl * 1.03, m0[1] + dy * shl * 1.03];
    const face = (pts, base, nx) => sp.fill(pts, (xx, yy) => {
      const k = ((xx - bx) * dx + (yy - by) * dy) / p.len;
      const t = C.sh.idx(xx, yy, nx * px, nx * py, 0.75, sp.ls);
      const v = base + (k > 0.65 ? 1 : 0) + (t > 4.5 ? 1 : 0) - (k < 0.15 ? 1 : 0) + (hash(xx >> 1, yy >> 1, p.sd) > 0.93 ? 1 : 0);
      const c = cr[Math.max(0, Math.min(5, v))];
      sp.raw(xx, yy, c);
      if (C.glow && v >= 3) C.glow.set(xx, yy, cr[Math.min(5, v - 1)]);
    });
    face([L0, Ls, tip, m1, m0], 3, -0.7);
    face([m0, m1, tip, Rs, R0], 1, 0.7);
    for (let t = 0; t < 1; t += 0.02) sp.raw(Math.round(m0[0] + (m1[0] - m0[0]) * t), Math.round(m0[1] + (m1[1] - m0[1]) * t), cr[5]);
    for (let t = 0; t < 1; t += 0.04) sp.raw(Math.round(Ls[0] + (tip[0] - Ls[0]) * t), Math.round(Ls[1] + (tip[1] - Ls[1]) * t), cr[4]);
    if (hash(p.sd, 4, 4) > 0.4) { const fy = 0.3 + hash(p.sd, 5, 5) * 0.3; for (let t = -0.6; t < 0.5; t += 0.08) sp.raw(Math.round(bx + dx * p.len * fy + px * p.wid * t), Math.round(by + dy * p.len * fy + py * p.wid * t + t * 2), cr[2]); }
  }
  const rp = blobPts(x, y + 1, size * 0.62, size * 0.2, seed + 3, { rough: 0.6, flatBottom: 0.5, n: 9 });
  sp.fill(rp, (xx, yy) => sp.lit(C.M.rock, xx, yy, (xx - x) / size, -0.6, 0.7, (hash(xx >> 1, yy, seed) - 0.5) * 0.8));
  sp.done({ seed, inkC: ink, rim: cr[5], warmInk: ink });
  if (C.glow && o.halo !== false) halo(C.glow, x, y - size * 0.6, size * 1.6, hp(mixHex(color, '#000000', 0.6)), 0.65);
  return { x, y: y - size * 0.6, c: color };
}

// ---------------------------------------------------------------------------- fungi
/** Giant mushroom: curving fibrous stem with a bulb foot, lumpy cap with gills and glowing spots. */
export function giantMushroom(C, x, y, h, capHex, glowHex, seed = 1) {
  const capM = C.mat(capHex), stemM = C.mat(mixHex('#d8c8a8', capHex, 0.15));
  const lean = (hash(seed, 1, 1) - 0.5) * h * 0.25;
  const sw = h * (0.08 + hash(seed, 2, 2) * 0.04);
  const capW = h * (0.42 + hash(seed, 3, 3) * 0.22), capH = capW * (0.42 + hash(seed, 4, 4) * 0.2);
  const tx = x + lean, ty = y - h + capH * 0.55;
  const sp = new Spr(C, x - capW * 1.2 - Math.abs(lean), y - h - 4, x + capW * 1.2 + Math.abs(lean), y + 3);
  const N = 40, pl = [], pr = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, cx = x + lean * t * t, cy = y - (y - ty) * t;
    const ww = sw * (1 + (1 - t) ** 4 * 0.9) * (0.92 + wob(t * 6, seed) * 0.16);
    pl.push([cx - ww, cy]); pr.push([cx + ww, cy]);
  }
  sp.fill(pl.concat(pr.reverse()), (xx, yy) => {
    const t = (y - yy) / (y - ty), cx = x + lean * t * t;
    const u = Math.max(-1, Math.min(1, (xx - cx) / (sw * (1 + (1 - t) ** 4 * 0.9))));
    const fib = Math.sin(u * 9 + wob(yy * 0.08, seed) * 4) > 0.82 ? -0.8 : 0;
    sp.lit(stemM, xx, yy, u * 0.85, 0, Math.sqrt(1 - u * u * 0.72), fib + (hash(xx, yy >> 2, seed) - 0.5) * 0.4);
  });
  const gillH = capH * 0.32;
  for (let xx = Math.round(tx - capW * 0.92); xx < tx + capW * 0.92; xx++) {
    const k = (xx - tx) / (capW * 0.92);
    const gy1 = ty + gillH * Math.sqrt(Math.max(0, 1 - k * k)) * 0.7;
    for (let yy = Math.round(ty - 1); yy < gy1; yy++) {
      const line = Math.sin(k * 26 + yy * 0.1) > 0.55;
      sp.raw(xx, yy, line ? capM.w[1] : capM.w[2]);
      if (C.glow && !line && hash(xx, yy, seed) > 0.8) C.glow.set(xx, yy, hp(mixHex(glowHex, '#000000', 0.6)));
    }
  }
  const cap = [];
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI + (i / 26) * Math.PI, r = 1 + (wob(i * 0.7, seed + 5) - 0.5) * 0.18;
    cap.push([tx + Math.cos(a) * capW * r, ty + Math.sin(a) * capH * r]);
  }
  cap.push([tx + capW * 0.95, ty + 2], [tx + capW * 0.6, ty + gillH * 0.4], [tx, ty + gillH * 0.55], [tx - capW * 0.6, ty + gillH * 0.4], [tx - capW * 0.95, ty + 2]);
  const spots = [];
  for (let k = 0; k < 4 + hash(seed, 6, 6) * 6; k++) spots.push([tx + (hash(seed, k, 7) - 0.5) * capW * 1.5, ty - capH * (0.2 + hash(seed, k, 8) * 0.65), 1.5 + hash(seed, k, 9) * capW * 0.09, seed + k]);
  const gl = hp(glowHex), gl2 = hp(mixHex(glowHex, '#ffffff', 0.55));
  sp.fill(cap, (xx, yy) => {
    const u = (xx - tx) / capW, v = (yy - ty) / capH;
    const nz = Math.sqrt(Math.max(0.05, 1 - u * u * 0.85 - v * v * 0.4));
    let dt = (wob(xx * 0.12 + yy * 0.05, seed + 9) - 0.5) * 0.6;
    for (const [sx, sy, sr, ss] of spots) {
      const d = Math.hypot(xx - sx, (yy - sy) * 1.3) / sr + (hash(xx, yy, ss) - 0.5) * 0.3;
      if (d < 1) { const c = d < 0.45 ? gl2 : gl; sp.raw(xx, yy, c); if (C.glow) C.glow.set(xx, yy, c); return; }
      if (d < 1.35) dt -= 0.8;
    }
    sp.lit(capM, xx, yy, u * 0.8, v < 0 ? v * 0.7 - 0.2 : 0.3, nz, dt);
  });
  sp.done({ seed, ...inkOf(capM) });
  if (C.glow) halo(C.glow, tx, ty - capH * 0.3, capW * 1.6, hp(mixHex(glowHex, '#000000', 0.7)), 0.6);
  return { x: tx, y: ty, c: glowHex };
}

export function smallMushrooms(C, x, y, n, glowHex, seed = 1) {
  for (let i = 0; i < n; i++) giantMushroom(C, x + (hash(seed, i, 1) - 0.5) * n * 7, y + hash(seed, i, 3) * 2, 6 + hash(seed, i, 2) * 12, ['#c8503a', '#e0a050', '#8a5ab0'][i % 3], glowHex, seed * 7 + i);
}

// ---------------------------------------------------------------------------- masonry
function stoneBlock(C, M, pts, sd, o = {}) {
  const [x0, y0, x1, y1] = bbox(pts);
  const sp = new Spr(C, x0, y0, x1, y1);
  const cx = (x0 + x1) / 2, hw = Math.max(1, (x1 - x0) / 2), my = (y0 + y1) / 2, hh = Math.max(1, (y1 - y0) / 2);
  const t0 = (hash(sd, 1, 1) - 0.5) * 0.8;
  sp.fill(pts, (xx, yy) => {
    const u = Math.max(-1, Math.min(1, (xx - cx) / hw));
    let dt = t0 + (hash(xx >> 1, yy >> 1, sd) - 0.5) * 0.5 + (wob(yy * 0.2 + xx * 0.03, sd) - 0.5) * 0.5;
    if (o.flute && Math.abs(Math.sin(u * 4.2 * Math.PI)) < 0.18) dt -= 0.9;
    const nx = o.round ? u * 0.88 : (o.nx ?? 0) + u * 0.25, ny = o.round ? 0 : (o.ny ?? 0) + ((yy - my) / hh) * 0.25;
    sp.lit(M, xx, yy, nx, ny, Math.sqrt(Math.max(0.1, 1 - nx * nx - ny * ny)), dt);
  });
  for (let k = 0; k < 3; k++) { // chips
    const cxp = hash(sd, k, 9) > 0.5 ? x0 + 1 : x1 - 2, cyp = y0 + hash(sd, k, 10) * (y1 - y0);
    for (let q = 0; q < 2 + hash(sd, k, 11) * 3; q++) sp.raw(Math.round(cxp + (cxp < cx ? q * 0.5 : -q * 0.5)), Math.round(cyp + q), M.w[1]);
  }
  sp.done({ seed: sd, ...inkOf(M) });
}
const quad = (x0, y0, x1, y1, sd, j = 2.4) => {
  const r = (k) => (hash(sd, k, 3) - 0.5) * j;
  return [[x0 + r(1), y0 + r(2) * 0.5], [x1 + r(3), y0 + r(4) * 0.5], [x1 + r(5) * 0.5, y1], [x0 + r(6) * 0.5, y1]];
};

/** Column of stacked, individually chipped drums with fluting, capital and plinth. (x = center, y = floor) */
export function column(C, x, y, w, h, M, broken = false, seed = 1, trimHex = null) {
  const drums = Math.max(3, Math.round(h / (w * 0.9)));
  const plinthH = w * 0.32, capH = w * 0.36;
  const topY = broken ? y - h * (0.45 + hash(seed, 1, 1) * 0.3) : y - h;
  stoneBlock(C, M, quad(x - w * 0.72, y - plinthH, x + w * 0.72, y, seed + 1), seed + 1);
  const dh = (y - plinthH - (topY + (broken ? 0 : capH))) / drums;
  for (let i = 0; i < drums; i++) {
    const y1 = y - plinthH - i * dh, y0 = y1 - dh, ww = w * 0.5 * (1 - i * 0.012);
    const pts = quad(x - ww, y0, x + ww, y1 + 1, seed + 10 + i);
    if (broken && i === drums - 1) { pts.splice(1, 0, [x - ww * 0.3, y0 + (wob(seed, 1) - 0.2) * dh * 0.8], [x + ww * 0.3, y0 + (wob(seed + 3, 1) - 0.4) * dh * 0.9]); pts[0][1] += dh * 0.3; }
    stoneBlock(C, M, pts, seed + 10 + i, { flute: true, round: true });
  }
  if (!broken) {
    stoneBlock(C, M, quad(x - w * 0.68, topY, x + w * 0.68, topY + capH, seed + 3), seed + 3, { ny: -0.3 });
    if (trimHex) { const T = C.mat(trimHex); for (let xx = Math.round(x - w * 0.6); xx < x + w * 0.6; xx += 2) C.img.set(xx, Math.round(topY + capH * 0.55), T.w[6]); }
  } else for (let k = 0; k < 4; k++) { const r = 2 + hash(seed, k, 20) * w * 0.25, rx = x + (hash(seed, k, 21) - 0.5) * w * 2.4; stoneBlock(C, M, blobPts(rx, y - r * 0.5, r, r * 0.6, seed + 40 + k, { rough: 0.5, flatBottom: 0.9, n: 6 }), seed + 40 + k, { ny: -0.3 }); }
}

/** Arch of individually cut voussoirs on stacked jambs, opening into darkness; optional glowing keystone. */
export function archway(C, cx, base, w, h, M, seed = 1, keyHex = null) {
  const jw = w * 0.16, ow = w / 2 - jw, springY = base - h + ow * 0.9;
  const op = [];
  for (let i = 0; i <= 20; i++) { const a = Math.PI + (i / 20) * Math.PI; op.push([cx + Math.cos(a) * ow, springY + Math.sin(a) * ow * 0.9]); }
  op.push([cx + ow, base], [cx - ow, base]);
  const sp0 = new Spr(C, cx - ow, base - h, cx + ow, base);
  const D = C.M.rock.w;
  sp0.fill(op, (xx, yy) => sp0.raw(xx, yy, D[qt(0.3 + (1 - Math.abs(xx - cx) / ow) * 0.3 + ((yy - (base - h)) / h) * 1.2, xx, yy, 3)]));
  sp0.done({ ink: false });
  for (const s of [-1, 1]) { // jambs: stacked blocks of uneven height
    let yy = base, k = 0;
    while (yy > springY + 2) {
      const bh = Math.min(yy - springY, jw * (0.7 + hash(seed, k + s * 40, 2) * 0.6));
      const x0 = s < 0 ? cx - w / 2 : cx + ow, x1 = s < 0 ? cx - ow : cx + w / 2;
      stoneBlock(C, M, quad(x0, yy - bh + 1, x1, yy, seed + k * 7 + s * 100, 2), seed + k * 7 + s * 100, { nx: s * 0.2 });
      yy -= bh; k++;
    }
  }
  const nV = 9 + (Math.round(w / 30) & ~1);
  for (let i = 0; i < nV; i++) {
    const a0 = Math.PI + (i / nV) * Math.PI + 0.015, a1 = Math.PI + ((i + 1) / nV) * Math.PI - 0.015;
    const key = i === Math.floor(nV / 2);
    const ri = ow, ro = ow + jw * (key ? 1.25 : 0.95 + hash(seed, i, 5) * 0.15);
    const P = (a, r) => [cx + Math.cos(a) * r, springY + Math.sin(a) * r * 0.9];
    const am = (a0 + a1) / 2;
    stoneBlock(C, M, [P(a0, ri), P(a0, ro), P(a1, ro), P(a1, ri)], seed + 300 + i, { nx: Math.cos(am) * 0.35, ny: Math.sin(am) * 0.35 });
    if (key && keyHex) {
      const [kx, ky] = P(am, (ri + ro) / 2);
      const g = hp(keyHex), g2 = hp(mixHex(keyHex, '#ffffff', 0.6));
      for (let q = 0; q < 5; q++) for (let r = 0; r < 5; r++) { const d = Math.abs(q - 2) + Math.abs(r - 2); if (d > 2) continue; const c = d === 0 ? g2 : g; C.img.set(Math.round(kx) + q - 2, Math.round(ky) + r - 2, c); if (C.glow) C.glow.set(Math.round(kx) + q - 2, Math.round(ky) + r - 2, c); }
      if (C.glow) halo(C.glow, kx, ky, jw * 1.8, hp(mixHex(keyHex, '#000000', 0.6)), 0.6);
    }
  }
}

/** Carved stone tablet with glowing glyphs. (x0,y0 top-left) */
export function runePanel(C, x0, y0, w, h, M, runeHex, seed = 1) {
  const j = (k) => (hash(seed, k, 3) - 0.5) * 3;
  const pts = [[x0 + j(1), y0 + w * 0.12 + j(2)], [x0 + w * 0.5, y0 + j(3)], [x0 + w + j(4), y0 + w * 0.12 + j(5)], [x0 + w + j(6), y0 + h], [x0 + j(7), y0 + h]];
  const sp = new Spr(C, x0 - 3, y0 - 3, x0 + w + 3, y0 + h + 2);
  sp.fill(pts, (xx, yy) => sp.lit(M, xx, yy, 0, 0, 1, (hash(xx >> 1, yy >> 1, seed) - 0.5) * 0.6 + (wob(xx * 0.1 + yy * 0.2, seed) - 0.5) * 0.5));
  const g = hp(runeHex), g2 = hp(mixHex(runeHex, '#ffffff', 0.6));
  const rows = Math.max(2, Math.floor(h / 16)), cols = Math.max(2, Math.floor(w / 13));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const gx = x0 + (c + 0.5) * (w / cols), gy = y0 + w * 0.18 + (r + 0.5) * ((h - w * 0.25) / rows);
    const sd = seed * 31 + r * 7 + c;
    for (let s = 0; s < 3; s++) {
      let px = gx + (hash(sd, s, 1) - 0.5) * 6, py = gy + (hash(sd, s, 2) - 0.5) * 6;
      const dir = Math.floor(hash(sd, s, 3) * 4) * (Math.PI / 4);
      for (let k = 0; k < 3 + hash(sd, s, 4) * 4; k++) {
        const c2 = k === 0 ? g2 : g;
        sp.raw(Math.round(px), Math.round(py), c2);
        if (C.glow) C.glow.set(Math.round(px), Math.round(py), c2);
        px += Math.cos(dir); py += Math.sin(dir);
      }
    }
  }
  sp.done({ seed, ...inkOf(M) });
  if (C.glow) halo(C.glow, x0 + w / 2, y0 + h / 2, Math.max(w, h) * 0.8, hp(mixHex(runeHex, '#000000', 0.7)), 0.5);
}

/** Basalt organ pipes: hexagonal prisms of different heights with lit top facets. (x0 left, y floor) */
export function basaltColumns(C, x0, y, w, h, M, seed = 1) {
  let x = x0, i = 0;
  const cols = [];
  while (x < x0 + w) { const cw = 9 + hash(seed, i, 1) * 12; cols.push({ x, cw, ch: h * (0.4 + hash(seed, i, 2) * 0.6) * (1 - Math.abs((x - x0) / w - 0.5) * 0.6), sd: seed + i * 11 }); x += cw - 1; i++; }
  cols.sort((a, b) => a.ch - b.ch);
  for (const c of cols) {
    const tx = c.x, ty = y - c.ch, cw = c.cw, cap = cw * 0.3;
    const tilt = (hash(c.sd, 3, 3) - 0.5) * cap;
    const pts = [[tx, ty + cap / 2 + tilt], [tx + cw * 0.3, ty + tilt * 0.5], [tx + cw * 0.7, ty - tilt * 0.2], [tx + cw, ty + cap / 2 - tilt], [tx + cw, y], [tx, y]];
    const sp = new Spr(C, tx, ty - cap, tx + cw, y);
    sp.fill(pts, (xx, yy) => {
      const top = yy < ty + cap * 0.9 - ((xx - tx) / cw) * tilt * 0.6;
      const u = (xx - tx) / cw;
      const face = u < 0.42 ? -0.62 : u < 0.6 ? 0 : 0.62;
      sp.lit(M, xx, yy, top ? 0 : face, top ? -0.8 : 0, top ? 0.6 : 0.78, (hash(xx >> 1, yy >> 3, c.sd) - 0.5) * 0.4 + (top ? 0.6 : 0) - (Math.abs(Math.sin(yy * 0.13 + c.sd)) < 0.06 ? 1 : 0));
    });
    sp.done({ seed: c.sd, ...inkOf(M) });
  }
}

/** Lava fall: a wobbling molten ribbon with banded core, cooling crust at the edges, a splash pool. */
export function lavaFall(C, x, y0, y1, w, seed = 1) {
  const L = ['#2a0804', '#6a1606', '#c0360a', '#ff6a1a', '#ffb43a', '#fff0a0'].map((c) => hp(c));
  for (let y = Math.max(0, Math.floor(y0)); y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const cx = x + (wob(y * 0.04, seed) - 0.5) * w * 1.6, ww = w * (0.6 + t * 0.7) * (0.85 + wob(y * 0.12, seed + 4) * 0.3);
    for (let xx = Math.floor(cx - ww - 1); xx <= cx + ww + 1; xx++) {
      const e = Math.abs(xx - cx) / ww;
      if (e > 1.15) continue;
      const band = Math.sin(y * 0.35 - xx * 0.2 + seed) > 0.6 ? 1 : 0;
      const v = e > 1 ? 0 : e > 0.8 ? 1 + (hash(xx, y >> 1, seed) > 0.6 ? 1 : 0) : e > 0.45 ? 3 : 4 + band;
      C.img.set(xx, y, L[v]);
      if (C.glow && v >= 2) C.glow.set(xx, y, L[Math.min(5, v)]);
    }
  }
  for (let k = -w * 4; k <= w * 4; k++) for (let q = -2; q < 3; q++) {
    const e = Math.abs(k) / (w * 4), v = q < 0 ? (e < 0.6 ? 4 : 2) : q === 2 ? 0 : e > 0.8 ? 1 : 3;
    C.img.set(Math.round(x + k), Math.round(y1 + q), L[v]);
    if (C.glow && v >= 2) C.glow.set(Math.round(x + k), Math.round(y1 + q), L[v]);
  }
  if (C.glow) halo(C.glow, x, y1 - 6, w * 9, hp('#3a1004'), 0.8, 0.8);
}

// ---------------------------------------------------------------------------- cloth & iron
/** Hanging banner: rod with finials, folded cloth lit per fold, tattered hem, stitched eye sigil. */
export function banner(C, x0, y0, w, h, clothHex, emblemHex, seed = 1) {
  const M = C.mat(clothHex), I = C.M.iron, E = C.mat(emblemHex);
  const folds = 3 + Math.floor(hash(seed, 1, 1) * 3);
  const sp = new Spr(C, x0 - 5, y0 - 4, x0 + w + 5, y0 + h + 4);
  const hem = (xx) => y0 + h - (Math.abs(Math.sin((xx - x0) * 0.35 + seed)) * h * 0.08 + wob(xx * 0.3, seed) * h * 0.1) + ((xx - x0) / w > 0.4 && (xx - x0) / w < 0.6 ? h * 0.06 : 0);
  for (let xx = Math.round(x0); xx < x0 + w; xx++) {
    const u = (xx - x0) / w, ph = u * folds * TAU + seed;
    const sway = (wob(xx * 0.05, seed) - 0.5) * 1.5;
    for (let yy = Math.round(y0 + 2); yy < hem(xx); yy++) {
      const k = (yy - y0) / h, nx = Math.cos(ph) * 0.7 * (0.4 + k * 0.6);
      sp.lit(M, xx + Math.round(sway * k), yy, nx, 0.05, Math.sqrt(1 - nx * nx), Math.sin(ph) * 0.3 + (yy - y0 < 3 ? -0.6 : 0));
    }
  }
  const ex = x0 + w / 2, ey = y0 + h * 0.36, er = w * 0.28;
  for (let a = 0; a < TAU; a += 0.04) { const r = er / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))); sp.lit(E, Math.round(ex + Math.cos(a) * r), Math.round(ey + Math.sin(a) * r * 1.2), Math.cos(a) * 0.3, -0.3, 0.9, 0.8); }
  for (let xx = -er * 0.55; xx <= er * 0.55; xx++) { const hh = Math.sqrt(Math.max(0, 1 - (xx / (er * 0.55)) ** 2)) * er * 0.28; sp.lit(E, Math.round(ex + xx), Math.round(ey - hh), 0, -0.5, 0.8, 0.6); sp.lit(E, Math.round(ex + xx), Math.round(ey + hh), 0, 0.5, 0.8, 0); }
  sp.raw(Math.round(ex), Math.round(ey), E.w[1]); sp.raw(Math.round(ex) + 1, Math.round(ey), E.w[1]);
  sp.done({ seed, ...inkOf(M) });
  plank(C, C.M.wood, [x0 - 4, y0 + 1], [x0 + w + 4, y0 + 1 + (hash(seed, 5, 5) - 0.5) * 2], 3.2, seed + 5, { knots: 0 });
  for (const fx of [x0 - 5, x0 + w + 5]) { const f = new Spr(C, fx - 2, y0 - 2, fx + 2, y0 + 4); for (let q = 0; q < 9; q++) f.lit(I, Math.round(fx + (q % 3) - 1), Math.round(y0 + Math.floor(q / 3)), (q % 3) - 1, Math.floor(q / 3) - 1, 0.6, 0.8); f.done(inkOf(I)); }
  chain(C, x0 + w * 0.15, y0 - h * 0.25, y0 + 1, 1);
  chain(C, x0 + w * 0.85, y0 - h * 0.25, y0 + 1, 1);
}

/** Hanging chain of alternating face-on and edge-on links. */
export function chain(C, x, y0, y1, s = 1.2) {
  const I = C.M.iron;
  const sp = new Spr(C, x - 4 * s, y0, x + 4 * s, y1);
  let y = y0, k = 0;
  while (y < y1) {
    const lh = 5 * s;
    if (k & 1) for (let q = 0; q < lh; q++) sp.lit(I, Math.round(x), Math.round(y + q), -0.5, 0, 0.85, q === 0 || q === Math.round(lh) - 1 ? -0.5 : 0.5);
    else for (let a = 0; a < TAU; a += 0.25) sp.lit(I, Math.round(x + Math.cos(a) * 1.6 * s), Math.round(y + lh / 2 + Math.sin(a) * lh * 0.5), Math.cos(a) * 0.8, Math.sin(a) * 0.6, 0.5);
    y += lh * 0.78; k++;
  }
  sp.done({ seed: 3, ...inkOf(I) });
}

/** Tripod brazier with a glowing coal bed; returns the flame anchor (the flame is animated). */
export function brazier(C, x, y, s = 1) {
  const I = C.M.iron;
  const bw = 11 * s, bh = 7 * s, top = y - 18 * s;
  for (const [dx, lean] of [[-0.8, -1], [0, 0], [0.8, 1]]) plank(C, I, [x + dx * bw * 0.5, top + bh], [x + dx * bw * 0.9 + lean * 2 * s, y], 2.2 * s, 70 + dx * 10, { knots: 0, tone: lean === 0 ? -0.8 : 0 });
  const sp = new Spr(C, x - bw - 2, top - 3, x + bw + 2, top + bh + 2);
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI; pts.push([x + Math.cos(a) * bw * (0.96 + wob(i, 3) * 0.08), top + Math.sin(a) * bh]); }
  sp.fill(pts, (xx, yy) => { const u = (xx - x) / bw, v = (yy - top) / bh; sp.lit(I, xx, yy, u * 0.8, v * 0.5, 0.6, Math.abs(Math.sin(u * 7)) < 0.15 ? -0.7 : 0); });
  const coal = ['#3a0a04', '#a02a08', '#ff7a1a', '#ffd060'].map((c) => hp(c));
  for (let xx = Math.round(x - bw + 2); xx < x + bw - 2; xx++) for (let q = -2; q <= 0; q++) { const v = hash(xx, q, 11) > 0.6 ? 3 : hash(xx, q, 12) > 0.3 ? 2 : 1; sp.raw(xx, Math.round(top + q), coal[v]); if (C.glow) C.glow.set(xx, Math.round(top + q), coal[v]); }
  for (let xx = Math.round(x - bw); xx <= x + bw; xx++) sp.lit(I, xx, Math.round(top + 1), 0, -0.8, 0.6, 1.2);
  sp.done({ seed: 13, ...inkOf(I) });
  return { x, y: top - 1 };
}

/** Stone sarcophagus with a carved lid, banded trim and a cursed seam glow. (x0,y0 top-left of box) */
export function sarcophagus(C, x0, y0, w, h, M, trimHex, seed = 1) {
  const T = C.mat(trimHex);
  const lidH = h * 0.32;
  const j = (k) => (hash(seed, k, 3) - 0.5) * 2;
  const sp = new Spr(C, x0 - 4, y0 - 4, x0 + w + 4, y0 + h + 2);
  sp.fill([[x0 + j(1), y0 + lidH], [x0 + w + j(2), y0 + lidH], [x0 + w - 2 + j(3), y0 + h], [x0 + 2 + j(4), y0 + h]], (xx, yy) => {
    const u = (xx - x0) / w, v = (yy - y0 - lidH) / (h - lidH);
    let dt = (hash(xx >> 1, yy >> 1, seed) - 0.5) * 0.5;
    if (Math.abs(u - 0.5) < 0.42 && Math.abs(v - 0.5) < 0.32 && (Math.abs(u - 0.5) > 0.39 || Math.abs(v - 0.5) > 0.29)) dt -= 1.1; // carved panel
    sp.lit(M, xx, yy, (u - 0.5) * 0.6, 0.1, 0.95, dt);
  });
  sp.fill([[x0 - 3 + j(5), y0 + lidH + 1], [x0 + w + 3 + j(6), y0 + lidH + 1], [x0 + w - w * 0.08, y0 + j(7)], [x0 + w * 0.08, y0 + j(8)]], (xx, yy) => { const v = (yy - y0) / lidH; sp.lit(M, xx, yy, ((xx - x0) / w - 0.5) * 0.5, v < 0.55 ? -0.75 : 0.2, 0.65, Math.abs(v - 0.55) < 0.08 ? -1 : 0); });
  for (let xx = Math.round(x0); xx < x0 + w; xx++) sp.lit(T, xx, Math.round(y0 + lidH + 3), 0, -0.3, 0.95, 0.4);
  sp.done({ seed, ...inkOf(M) });
  const g = hp(trimHex);
  for (let xx = Math.round(x0 + 2); xx < x0 + w - 2; xx++) if (hash(xx, 1, seed) > 0.35) { C.img.set(xx, Math.round(y0 + lidH + 1), g); if (C.glow) C.glow.set(xx, Math.round(y0 + lidH + 1), g); }
}

/** Pile of skulls and bones, each skull individually drawn (cranium, sockets, teeth). */
export function skullPile(C, x, y, n, seed = 1) {
  const B = C.M.bone;
  for (let k = 0; k < n * 2; k++) {
    const bx = x + (hash(seed, k, 1) - 0.5) * n * 7, by = y - hash(seed, k, 2) * 3;
    const a = hash(seed, k, 3) * Math.PI, l = 6 + hash(seed, k, 4) * 6;
    plank(C, B, [bx - (Math.cos(a) * l) / 2, by - Math.sin(a) * 2], [bx + (Math.cos(a) * l) / 2, by + Math.sin(a) * 2], 2.2, seed + k * 3, { knots: 0 });
  }
  const order = [];
  for (let k = 0; k < n; k++) order.push({ x: x + (k - (n - 1) / 2) * 6.5 + (hash(seed, k, 5) - 0.5) * 3, y: y - (k % 3 === 1 ? 6 : 0) - hash(seed, k, 6) * 2, r: 4 + hash(seed, k, 7) * 1.6, f: hash(seed, k, 8) > 0.5 ? 1 : -1, sd: seed + k * 17 });
  order.sort((a, b) => a.y - b.y);
  for (const s of order) {
    const sp = new Spr(C, s.x - s.r - 2, s.y - s.r * 2, s.x + s.r + 2, s.y + 1);
    sp.fill(blobPts(s.x, s.y - s.r * 1.05, s.r, s.r * 0.95, s.sd, { rough: 0.2, n: 12 }), (xx, yy) => sp.lit(B, xx, yy, ((xx - s.x) / s.r) * 0.8, ((yy - s.y + s.r) / s.r) * 0.7, 0.6));
    sp.fill([[s.x - s.r * 0.6, s.y - s.r * 0.35], [s.x + s.r * 0.6, s.y - s.r * 0.35], [s.x + s.r * 0.45, s.y], [s.x - s.r * 0.45, s.y]], (xx, yy) => sp.lit(B, xx, yy, 0, 0.6, 0.8, (xx & 1) && yy > s.y - 2 ? -1.6 : -0.3));
    for (const ex of [-0.42, 0.42]) for (let q = 0; q < 4; q++) sp.raw(Math.round(s.x + ex * s.r + s.f * 0.5 + (q & 1)), Math.round(s.y - s.r * 0.95 + (q >> 1)), B.w[0]);
    sp.raw(Math.round(s.x), Math.round(s.y - s.r * 0.5), B.w[0]);
    sp.done({ seed: s.sd, ...inkOf(B) });
  }
}

/** Canvas tent: sagging panels (lit/shadow), a stitched patch, guy ropes, a dark open flap. (x0 left, y floor) */
export function tent(C, x0, y, w, h, clothHex, seed = 1) {
  const M = C.mat(clothHex), P = C.mat(mixHex(clothHex, '#c8a060', 0.4));
  const px = x0 + w * (0.45 + (hash(seed, 1, 1) - 0.5) * 0.1), py = y - h;
  const sp = new Spr(C, x0 - 6, py - 4, x0 + w + 6, y + 1);
  const patch = { u: 0.25 + hash(seed, 2, 2) * 0.5, v: 0.4 + hash(seed, 3, 3) * 0.3, s: 0.12 };
  const panel = (pts, side) => sp.fill(pts, (xx, yy) => {
    const v = (yy - py) / h, u = (xx - x0) / w;
    const fold = Math.sin(((xx - px) / w) * 22 + wob(yy * 0.1, seed) * 3) * 0.25;
    const inP = Math.abs(u - patch.u) < patch.s && Math.abs(v - patch.v) < patch.s * 1.4;
    const stitch = inP && ((xx + yy) & 3) === 0 && (Math.abs(u - patch.u) > patch.s * 0.82 || Math.abs(v - patch.v) > patch.s * 1.2);
    sp.lit(inP ? P : M, xx, yy, side * 0.62 + fold, -0.25, 0.75, stitch ? -1.5 : 0);
  });
  panel([[px, py], [x0, y], [px - w * 0.08, y]], -1);
  panel([[px, py], [px + w * 0.05, y], [x0 + w, y]], 1);
  const fx = px - w * 0.04;
  sp.fill([[fx, py + h * 0.38], [fx + w * 0.12, y], [fx - w * 0.1, y]], (xx, yy) => sp.raw(xx, yy, C.M.rock.w[hash(xx, yy, 3) > 0.7 ? 1 : 0]));
  sp.fill([[fx + 1, py + h * 0.38], [fx + w * 0.12, y], [fx + w * 0.2, y - h * 0.08]], (xx, yy) => sp.lit(P, xx, yy, 0.5, -0.3, 0.8, 0.5));
  sp.done({ seed, ...inkOf(M) });
  plank(C, C.M.wood, [px, py - 5], [px + 0.5, py + 2], 2.4, seed + 9, { knots: 0 });
  for (const bx of [x0 - w * 0.12, x0 + w * 1.12]) {
    const ay = py + 2;
    const r = new Spr(C, Math.min(px, bx) - 2, ay - 2, Math.max(px, bx) + 2, y + 6);
    for (let t = 0; t <= 1; t += 0.008) r.lit(C.M.rope, Math.round(px + (bx - px) * t), Math.round(ay + (y - ay) * t + Math.sin(t * Math.PI) * 3), 0, -0.5, 0.8, 0.3);
    r.done({ ink: false });
    plank(C, C.M.wood, [bx, y - 4], [bx + 1, y + 1], 2.2, seed + 13, { knots: 0 });
  }
}

/** Plank crate with cross brace and corner posts. (x0 left, y floor) */
export function crate(C, x0, y, w, h, seed = 1) {
  const M = C.M.wood;
  const n = Math.max(2, Math.round(h / 7));
  for (let i = 0; i < n; i++) {
    const y0 = y - h + (i / n) * h, y1 = y - h + ((i + 1) / n) * h;
    plank(C, M, [x0, (y0 + y1) / 2], [x0 + w, (y0 + y1) / 2 + (hash(seed, i, 1) - 0.5) * 1.2], (y1 - y0) * 0.96, seed + i * 7, { knots: hash(seed, i, 2) > 0.6 ? 1 : 0 });
  }
  plank(C, M, [x0 + 2, y - 2], [x0 + w - 2, y - h + 2], Math.max(3, w * 0.12), seed + 40, { knots: 0, tone: 0.5, nails: [0.08, 0.92] });
  for (const xx of [x0 + 1.5, x0 + w - 1.5]) plank(C, M, [xx, y], [xx, y - h], Math.max(3, w * 0.11), seed + 50 + xx, { knots: 0, tone: -0.4, nails: [0.12, 0.88] });
}

/** Barrel: curved staves, iron hoops, lid rim. (x center, y floor) */
export function barrel(C, x, y, w, h, seed = 1) {
  const M = C.M.wood, I = C.M.iron, n = 6;
  const sp = new Spr(C, x - w * 0.62, y - h - 2, x + w * 0.62, y + 1);
  for (let yy = Math.round(y - h); yy < y; yy++) {
    const v = (yy - (y - h)) / h;
    const bulge = w * 0.5 * (0.86 + Math.sin(v * Math.PI) * 0.14);
    for (let xx = Math.round(x - bulge); xx < x + bulge; xx++) {
      const u = (xx - x) / bulge, sv = (Math.asin(Math.max(-1, Math.min(1, u))) / Math.PI + 0.5) * n;
      const stave = Math.floor(sv), seam = Math.abs(sv - Math.round(sv)) < 0.06;
      const hoop = Math.abs(v - 0.16) < 0.045 || Math.abs(v - 0.84) < 0.045 || Math.abs(v - 0.5) < 0.03;
      const nz = Math.sqrt(Math.max(0.05, 1 - u * u * 0.8));
      if (hoop) sp.lit(I, xx, yy, u * 0.9, 0, nz, 0.4);
      else sp.lit(M, xx, yy, u * 0.9, (v - 0.5) * 0.4, nz, (hash(stave, 1, seed) - 0.5) * 0.9 - (seam ? 1.3 : 0) + (wob(yy * 0.2 + stave * 9, seed) - 0.5) * 0.5);
    }
  }
  for (let xx = Math.round(x - w * 0.44); xx < x + w * 0.44; xx++) sp.lit(M, xx, Math.round(y - h), 0, -0.9, 0.4, 0.6);
  sp.done({ seed, ...inkOf(M) });
}

/** Lumpy burlap sack with a cinched neck and folds. (x center, y floor) */
export function sack(C, x, y, w, h, clothHex = '#b89a68') {
  const M = C.mat(clothHex), R = C.M.rope;
  const pts = blobPts(x, y - h * 0.42, w * 0.5, h * 0.45, Math.round(x * 3 + y), { rough: 0.45, flatBottom: 0.95, n: 12 });
  pts.push([x + w * 0.12, y - h * 0.86], [x + w * 0.2, y - h * 1.02], [x - w * 0.06, y - h * 0.98], [x - w * 0.14, y - h * 0.86]);
  const sp = new Spr(C, x - w * 0.7, y - h * 1.1, x + w * 0.7, y + 1);
  sp.fill(pts, (xx, yy) => {
    const u = (xx - x) / (w * 0.5), v = (yy - y + h * 0.45) / (h * 0.45);
    const weave = (xx + yy) & 1 && hash(xx >> 1, yy >> 1, 5) > 0.7 ? -0.4 : 0;
    sp.lit(yy < y - h * 0.82 ? R : M, xx, yy, u * 0.8, v * 0.6 - 0.2, 0.6, weave + (Math.sin(u * 6 + v * 2) > 0.85 ? -0.9 : 0));
  });
  sp.done({ seed: 21, ...inkOf(M) });
}

function jar(C, x, y, w, h, hex, seed) {
  const M = C.mat(hex);
  const sp = new Spr(C, x - w, y - h - 2, x + w, y + 1);
  for (let yy = Math.round(y - h); yy < y; yy++) {
    const v = (yy - (y - h)) / h, r = w * 0.5 * (v < 0.2 ? 0.55 : 0.75 + Math.sin(v * Math.PI) * 0.25);
    for (let xx = Math.round(x - r); xx < x + r; xx++) { const u = (xx - x) / r; sp.lit(M, xx, yy, u * 0.85, v < 0.2 ? -0.5 : 0, 0.55, Math.abs(v - 0.2) < 0.06 ? -0.8 : 0); }
  }
  sp.done({ seed, ...inkOf(M) });
}

/** Merchant stall: plank counter, posts, scalloped striped awning, jars and hanging pots. (x0 left, y floor) */
export function stall(C, x0, y, w, h, awn1 = '#c83a2a', awn2 = '#f0e0c0', seed = 1) {
  const Wd = C.M.wood;
  const counterH = h * 0.4, top = y - h;
  for (const px of [x0 + 3, x0 + w - 3]) plank(C, Wd, [px, y], [px + (hash(seed, px, 1) - 0.5) * 3, top + 4], Math.max(5, w * 0.04), seed + px, { nails: [0.3] });
  const nb = Math.max(4, Math.round(w / 12));
  for (let i = 0; i < nb; i++) { const bx = x0 + 6 + (i + 0.5) * ((w - 12) / nb); plank(C, Wd, [bx, y], [bx + (hash(seed, i, 2) - 0.5) * 1.5, y - counterH], ((w - 12) / nb) * 0.97, seed + 100 + i, { knots: hash(seed, i, 3) > 0.6 ? 1 : 0 }); }
  plank(C, Wd, [x0 + 2, y - counterH - 2], [x0 + w - 2, y - counterH - 2 + (hash(seed, 4, 4) - 0.5) * 2], 5, seed + 200, { tone: 0.6, nails: [0.1, 0.5, 0.9] });
  for (let k = 0; k < 5; k++) jar(C, x0 + w * (0.15 + k * 0.17), y - counterH - 4, 5 + hash(seed, k, 6) * 3, 6 + hash(seed, k, 5) * 7, ['#4a7aa0', '#a05a3a', '#7a9a4a', '#c8a040', '#8a5ab0'][k], seed + k);
  const A1 = C.mat(awn1), A2 = C.mat(awn2);
  const ay0 = top, ay1 = top + h * 0.22, stripes = Math.max(5, Math.round(w / 14));
  const sp = new Spr(C, x0 - 8, ay0 - 4, x0 + w + 8, ay1 + 8);
  for (let xx = Math.round(x0 - 7); xx < x0 + w + 7; xx++) {
    const u = (xx - x0 + 7) / (w + 14), si = Math.floor(u * stripes), local = u * stripes - si;
    const scallop = Math.sin(local * Math.PI) * 5, sagY = Math.sin(u * Math.PI) * 3;
    for (let yy = Math.round(ay0 + sagY * 0.3); yy < ay1 + sagY + scallop; yy++) {
      const v = (yy - ay0) / (ay1 - ay0);
      sp.lit(si & 1 ? A2 : A1, xx, yy, Math.cos(local * Math.PI) * 0.45, v < 0.15 ? -0.7 : 0.35, 0.75, local < 0.06 || local > 0.94 ? -0.6 : 0);
    }
  }
  sp.done({ seed, ...inkOf(A1) });
  for (let k = 0; k < 3; k++) { const hx = x0 + w * (0.25 + k * 0.25); chain(C, hx, ay1 + 3, ay1 + 10 + k * 3, 0.8); jar(C, hx, ay1 + 16 + k * 3, 6, 6, '#6a4a3a', seed + 50 + k); }
}

/** Hanging roots: tapering, branching, lit across their width, glowing bulbs on some tips. */
export function roots(C, x, y, len, hex, glowHex, seed = 1) {
  const M = C.mat(hex);
  const strand = (sx, sy, l, wd, sd, depth) => {
    const pts = [];
    let px = sx, py = sy, dir = Math.PI / 2 + (hash(sd, 1, 1) - 0.5) * 0.6;
    const n = Math.max(3, Math.round(l / 4));
    for (let i = 0; i <= n; i++) { pts.push([px, py, wd * (1 - i / (n + 1))]); dir += (wob(i * 0.6, sd) - 0.5) * 0.7; px += Math.cos(dir) * (l / n); py += Math.sin(dir) * (l / n); }
    const [x0, y0, x1, y1] = bbox(pts, wd + 2);
    const sp = new Spr(C, x0, y0, x1, y1);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, aw] = pts[i], [bx, by] = pts[i + 1];
      for (let t = 0; t <= 1; t += 0.12) {
        const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, r = Math.max(0.5, aw / 2);
        for (let q = -Math.ceil(r); q <= Math.ceil(r); q++) { const u = q / (r + 0.5); sp.lit(M, Math.round(cx + q), Math.round(cy), u * 0.9, 0, Math.sqrt(Math.max(0.1, 1 - u * u * 0.8)), (hash(Math.round(cy) >> 1, q, sd) - 0.5) * 0.5); }
      }
      if (depth < 2 && hash(sd, i, 5) > 0.82) strand(bx, by, l * 0.4, aw * 0.6, sd * 3 + i, depth + 1);
    }
    sp.done({ seed: sd, ...inkOf(M) });
    const tip = pts[pts.length - 1];
    if (glowHex && hash(sd, 9, 9) > 0.45) {
      const g = hp(glowHex), g2 = hp(mixHex(glowHex, '#ffffff', 0.6));
      const tx = Math.round(tip[0]), ty = Math.round(tip[1]);
      for (const [qx, qy, c] of [[0, 0, g2], [-1, 1, g], [0, 1, g2], [1, 1, g], [0, 2, g]]) { C.img.set(tx + qx, ty + qy, c); if (C.glow) C.glow.set(tx + qx, ty + qy, c); }
      if (C.glow) halo(C.glow, tip[0], tip[1] + 1, 10, hp(mixHex(glowHex, '#000000', 0.65)), 0.6);
    }
  };
  const n = 3 + Math.floor(hash(seed, 1, 1) * 4);
  for (let k = 0; k < n; k++) strand(x + (k - n / 2) * 5 + (hash(seed, k, 2) - 0.5) * 6, y, len * (0.4 + hash(seed, k, 3) * 0.6), 3 + hash(seed, k, 4) * 4, seed * 11 + k, 0);
}

/** Rolled bedroll tied with cord. (x center, y floor) */
export function bedroll(C, x, y, w, hex, seed = 1) {
  const M = C.mat(hex), h = w * 0.32;
  const sp = new Spr(C, x - w * 0.6, y - h - 2, x + w * 0.6, y + 1);
  sp.fill(blobPts(x, y - h * 0.5, w * 0.5, h * 0.5, seed, { rough: 0.25, flatBottom: 0.9, n: 14 }), (xx, yy) => { const u = (xx - x) / (w * 0.5), v = (yy - y + h * 0.5) / (h * 0.5); sp.lit(M, xx, yy, u * 0.4 + Math.sin(u * 3.5) * 0.3, v * 0.7, 0.6, Math.abs(Math.sin(u * 3.5)) < 0.1 ? -1 : 0); });
  for (const sx of [-0.25, 0.25]) for (let yy = Math.round(y - h); yy < y; yy++) sp.lit(C.M.rope, Math.round(x + sx * w), yy, 0, 0, 1, 0.4);
  sp.done({ seed, ...inkOf(M) });
}

/** Sagging line with drying cloths. */
export function clothesLine(C, x0, x1, y, seed = 1) {
  const r = new Spr(C, x0, y - 2, x1, y + 8);
  for (let x = Math.round(x0); x < x1; x++) r.lit(C.M.rope, x, Math.round(y + Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 5), 0, -0.5, 0.8, 0.4);
  r.done({ ink: false });
  const cols = ['#a83a3a', '#e0d0b0', '#3a5aa0', '#7a8a4a'];
  for (let k = 0; k < 3 + hash(seed, 1, 1) * 2; k++) {
    const t = 0.15 + k * 0.22 + (hash(seed, k, 2) - 0.5) * 0.06, cx = x0 + (x1 - x0) * t, cy = y + Math.sin(t * Math.PI) * 5;
    const M = C.mat(cols[k % 4]), cw = 7 + hash(seed, k, 3) * 6, ch = 9 + hash(seed, k, 4) * 8;
    const s = new Spr(C, cx - cw, cy, cx + cw, cy + ch + 3);
    s.fill([[cx - cw / 2, cy], [cx + cw / 2, cy], [cx + cw / 2 + 1, cy + ch], [cx + cw * 0.1, cy + ch - 2], [cx - cw / 2 - 1, cy + ch]], (xx, yy) => s.lit(M, xx, yy, Math.sin((xx - cx) * 0.6) * 0.5, 0, 0.85, yy - cy < 2 ? -0.6 : 0));
    s.done({ seed: seed + k, ...inkOf(M) });
  }
}
