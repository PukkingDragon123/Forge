// Terrain painters. Every rock, stalactite, flagstone and pebble is its own irregular inked shape,
// lit per surface by the layer's Shade (warm key pools, teal core shadow, reflected light, rim).
import { Img, hp, A, mixp, qt, bayer, noiseTile, ns, nsf, hash, wob, blobPts, polyMask, inkSprite } from './backdrop_kit.js';

const TAU = Math.PI * 2;

/** Facet normals for a chiselled rock: a front face ringed by slanted planes. */
function facetSet(seed, n, o = {}) {
  const F = [];
  const fj = o.front ?? 0.25;
  F.push([(hash(seed, 1, 1) - 0.5) * fj, (hash(seed, 2, 1) - 0.6) * fj, 1]);
  const rot = hash(seed, 3, 1) * TAU;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU + (hash(seed, i, 5) - 0.5) * 0.9;
    const tilt = 0.55 + hash(seed, i, 7) * 0.45;
    F.push([Math.cos(a) * Math.sin(tilt), Math.sin(a) * Math.sin(tilt), Math.cos(tilt)]);
  }
  if (o.top !== false) F.push([(hash(seed, 9, 1) - 0.5) * 0.3, -0.72, 0.62]); // a top that catches light
  for (const f of F) { const l = Math.hypot(f[0], f[1], f[2]); f[0] /= l; f[1] /= l; f[2] /= l; }
  return F;
}

/** Shade wrapper for ground space: rows are foreshortened by iso (ppuX/ppuZ). */
export function isoShade(sh, iso) {
  return {
    near: (a, b, c, d) => sh.near(a, b * iso, c, d * iso),
    idx: (x, y, nx, ny, nz, ls) => sh.idx(x, y * iso, nx, ny, nz, ls),
    col: (M, t, x, y) => sh.col(M, t, x, y),
    get ka() { return sh.ka; }, get kw() { return sh.kw; }, get dir() { return sh.dir; }, get att() { return sh.att; }, gain: sh.gain,
  };
}

const POOL = { ff: new Float64Array(64), edges: new Int32Array(1 << 14), sets: new Uint32Array(1 << 15), fid: new Uint8Array(1 << 16), tb: new Float32Array(1 << 16), wx: new Float32Array(4096), wy: new Float32Array(4096), ct: new Float32Array(4096), cs: new Int32Array(4096), gen: 1 };
const SIN = new Float32Array(1024).map((_, i) => Math.sin((i / 1024) * Math.PI * 2));
const NZ = new Float32Array(256).map((_, i) => Math.sqrt(Math.max(0.05, 1 - i / 268)) * 0.9);
function cacheT(n) { if (POOL.ct.length < n) { POOL.ct = new Float32Array(n * 2); POOL.cs = new Int32Array(n * 2); } return POOL.ct; }
function pool(n, w, h) {
  if (POOL.fid.length < n) { POOL.fid = new Uint8Array(n * 2); POOL.tb = new Float32Array(n * 2); }
  if (POOL.wx.length < w) POOL.wx = new Float32Array(w * 2);
  if (POOL.wy.length < h) POOL.wy = new Float32Array(h * 2);
  return POOL;
}

/**
 * One rock slab: irregular outline (pts), chiselled facets lit per surface, crease lines, mottling,
 * cracks, flecks and optional moss on its upper lip, inked like a hand-drawn line (heavier on the
 * shadow side, lost where the light is strongest, rim just inside light-facing edges).
 * Painted in one fused pass straight into the layer; the polygon mask provides the silhouette.
 * o: { seed, tone, facets, F, mott, strata, cracks, moss (material), mossAmt, glow, gem (packed), simple }
 */
export function slab(img, sh, M, pts, o = {}) {
  const seed = o.seed || 1;
  const { m, x0, y0, w, h } = polyMask(pts, 2, true);
  if (w < 3 || h < 3) return null;
  const IW = img.w, IH = img.h, D = img.d;
  let cx = 0, cy = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { cx += p[0]; cy += p[1]; if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  cx /= pts.length; cy /= pts.length;
  const rx = Math.max(2, (maxX - minX) / 2), ry = Math.max(2, (maxY - minY) / 2);
  const F = o.F || facetSet(seed, o.facets ?? (rx * ry > 1500 ? 3 : 2) + Math.floor(hash(seed, 4, 4) * 2), o);
  const nF = F.length;
  const FF = POOL.ff.length >= nF * 3 ? POOL.ff : (POOL.ff = new Float64Array(nF * 6));
  for (let f = 0; f < nF; f++) { FF[f * 3] = F[f][0]; FF[f * 3 + 1] = F[f][1]; FF[f * 3 + 2] = F[f][2]; }
  const ls = sh.near(x0, y0, x0 + w, y0 + h);
  const tone = o.tone ?? (hash(seed, 6, 6) - 0.5) * 0.7;
  const nt = noiseTile(21, 3, 8), nox = (seed * 53) & 255, noy = (seed * 97) & 255;
  const mott = o.mott ?? 0.5, strata = (o.strata ?? 0) >= 0.3 ? o.strata : 0;
  const P = pool(w * h, w, h), fid = P.fid, tb = P.tb, WX = P.wx, WY = P.wy;
  const warp = 0.22, ws = seed * 1.7;
  const irx = 1 / rx, iry = 1 / ry;
  for (let x = 0; x < w; x++) WX[x] = (wob((x + x0) * 0.07, ws + 3) - 0.5) * warp;
  for (let y = 0; y < h; y++) WY[y] = (wob((y + y0) * 0.07, ws) - 0.5) * warp;
  const Mw = M.w, Ma = M.a, simple = !!o.simple;
  const bw = (w >> 2) + 1, CT = cacheT(bw * nF), CS = POOL.cs;
  const gen0 = (POOL.gen += h + 8);
  const xa = Math.max(1, -x0), xb = Math.min(w - 1, IW - x0), ya = Math.max(1, -y0), yb = Math.min(h - 1, IH - y0);
  const E = POOL.edges;
  let ne = 0;
  for (let y = ya; y < yb; y++) {
    const wy = y + y0, v0 = (wy - cy) * iry, wyy = WY[y], row = y * w, gen = gen0 + (y >> 2), drow = wy * IW;
    const nrow = (((wy + noy) & 255) << 8), srow = ((((wy >> 2) + noy) & 255) << 8);
    for (let x = xa; x < xb; x++) {
      const i = row + x;
      if (!m[i]) continue;
      const wx = x + x0;
      const u = (wx - cx) * irx + wyy, v = v0 + WX[x];
      const q = (u * u + v * v) * 0.8;
      const nz = NZ[q >= 0.95 ? 255 : (q * 268) | 0];
      let best = 0, bd = -9;
      for (let f = 0, k3 = 0; f < nF; f++, k3 += 3) { const dd = FF[k3] * u + FF[k3 + 1] * v + FF[k3 + 2] * nz; if (dd > bd) { bd = dd; best = f; } }
      fid[i] = best;
      const ci = (x >> 2) * nF + best;
      let lt;
      if (CS[ci] === gen) lt = CT[ci];
      else {
        const b3 = best * 3;
        const nx = FF[b3] * 0.82 + u * 0.18, ny = FF[b3 + 1] * 0.82 + v * 0.18, nzz = FF[b3 + 2] * 0.82 + nz * 0.2;
        const l = 1 / Math.sqrt(nx * nx + ny * ny + nzz * nzz);
        lt = sh.idx(wx, wy, nx * l, ny * l, nzz * l, ls);
        if (sh.ka > sh.kw * 1.15) lt = -lt - 1; // accent-lit, encoded by sign
        CT[ci] = lt; CS[ci] = gen;
      }
      const acc = lt < 0;
      let t = (acc ? -lt - 1 : lt) + tone + (nt[nrow | ((wx + nox) & 255)] - 0.5) * mott;
      if (strata) t += SIN[(((wy + wx * 0.12) * 0.55 + nt[srow | (((wx >> 3) + nox) & 255)] * 6) * 162.97) & 1023] * strata * 0.35;
      t = t < 1 ? 1 : t > 7.6 ? 7.6 : t;
      tb[i] = t;
      let c = (acc ? Ma : Mw)[qt(t, wx, wy, 9, 0.13)];
      // crease against the facet to the left / above: dark seam, or a lit ridge on some pairs
      if (!simple) {
        const j = m[i - 1] && fid[i - 1] !== best ? i - 1 : m[i - w] && fid[i - w] !== best ? i - w : -1;
        if (j >= 0) {
          const ridge = hash(fid[j] * 7 + best, 1, seed) > 0.72;
          if (hash(x >> 2, y >> 2, seed) < (ridge ? 0.85 : 0.7)) c = Mw[Math.round(ridge ? Math.min(7.4, (t > tb[j] ? t : tb[j]) + 0.55) : Math.max(0.6, (t < tb[j] ? t : tb[j]) - 0.9))];
        }
      }
      D[drow + wx] = c;
      if (!m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]) { if (ne >= E.length) POOL.edges = growI(E); POOL.edges[ne++] = i; }
    }
  }
  const put = (x, y, c) => { const wx = x + x0, wy = y + y0; if (wx >= 0 && wy >= 0 && wx < IW && wy < IH) D[wy * IW + wx] = c; };
  if (!simple) {
    // cracks wandering in from an edge, with a lit lower lip
    const nc = o.cracks ?? (rx * ry > 700 ? 1 + Math.floor(hash(seed, 8, 8) * 2.2) : 0);
    for (let c = 0; c < nc; c++) {
      let x = cx - x0 + (hash(seed, c, 10) - 0.5) * rx, y = cy - y0 + (hash(seed, c, 11) - 0.5) * ry;
      let dir = hash(seed, c, 12) * TAU;
      const len = 6 + hash(seed, c, 13) * Math.max(rx, ry) * 0.9;
      for (let k = 0; k < len; k++) {
        const xi = x | 0, yi = y | 0, i = yi * w + xi;
        if (xi < 1 || yi < 1 || xi >= w - 1 || yi >= h - 1 || !m[i]) break;
        put(xi, yi, Mw[0]);
        const j = i + w + (Math.cos(dir) > 0 ? 0 : 1);
        if (m[j] && tb[j] > 3.5) put(j % w, (j / w) | 0, Mw[Math.min(7, Math.round(tb[j] + 0.6))]);
        dir += (wob(k * 0.4, seed + c) - 0.5) * 1.1;
        x += Math.cos(dir); y += Math.sin(dir) * 0.7;
      }
    }
    const np = Math.round(w * h * 0.0025); // pits: a dark hole with a lit lower lip
    for (let k = 0; k < np; k++) {
      const x = 2 + ((hash(seed, k, 24) * (w - 4)) | 0), y = 2 + ((hash(seed, k, 25) * (h - 4)) | 0), i = y * w + x;
      if (!m[i] || !m[i + 1] || !m[i + w] || !m[i + w + 1]) continue;
      put(x, y, Mw[Math.max(0, Math.round(tb[i] - 2))]); if (hash(seed, k, 26) > 0.5) put(x + 1, y, Mw[Math.max(0, Math.round(tb[i] - 2))]);
      put(x, y + 1, Mw[Math.min(8, Math.round(tb[i] + 1))]);
    }
    const nf = Math.round(w * h * 0.003); // mineral flecks
    for (let k = 0; k < nf; k++) {
      const x = 1 + ((hash(seed, k, 20) * (w - 2)) | 0), y = 1 + ((hash(seed, k, 21) * (h - 2)) | 0), i = y * w + x;
      if (m[i]) put(x, y, Mw[Math.max(1, Math.min(8, Math.round(tb[i] + (hash(seed, k, 22) > 0.5 ? 1 : -1))))]);
    }
  }
  if (o.gem) for (let k = 0; k < (o.gems || 3); k++) {
    const x = 1 + ((hash(seed, k, 30) * (w - 3)) | 0), y = 1 + ((hash(seed, k, 31) * (h - 2)) | 0), i = y * w + x;
    if (!m[i] || !m[i + 1]) continue;
    put(x, y, o.gem); put(x + 1, y, mixp(o.gem, hp('#ffffff'), 0.6));
    if (o.glow) { o.glow.set(x + x0, y + y0, o.gem); o.glow.set(x + x0 + 1, y + y0, o.gem); }
  }
  if (o.moss && (o.mossAmt ?? 0) > hash(seed, 40, 40)) mossLip(img, sh, ls, o.moss, m, w, h, x0, y0, seed);
  // hand-drawn ink along the silhouette
  const inkC = Mw[0], warmInk = mixp(Mw[0], Mw[4], 0.5), rimC = Mw[8];
  const EE = POOL.edges;
  const sets = POOL.sets;
  let ns2 = 0;
  for (let k = 0; k < ne; k++) {
    const i = EE[k], x = i % w, y = (i / w) | 0;
    let ex = 0, ey = 0;
    if (!m[i - 1]) ex -= 1; if (!m[i + 1]) ex += 1; if (!m[i - w]) ey -= 1; if (!m[i + w]) ey += 1;
    const wx = x + x0, wy = y + y0;
    sh.idx(wx, wy, ex * 0.6, ey * 0.6, 0.55, ls);
    const dir = sh.dir, facing = ex * dir[0] + ey * dir[1];
    const lit = sh.att * (facing > 0 ? facing : 0) * sh.gain;
    const nn = wob((wx * 0.7 + wy) * 0.11, seed);
    const di = wy * IW + wx;
    if (wx < 0 || wy < 0 || wx >= IW || wy >= IH) continue;
    if (lit > 0.2 && nn > 0.6) { sets[ns2++] = di; sets[ns2++] = mixp(D[di], rimC, 0.7); continue; } // lost edge
    // against rock already painted the line is a soft seam; full ink only on a true silhouette
    const ox2 = wx + ex, oy2 = wy + ey;
    const inner = ox2 >= 0 && oy2 >= 0 && ox2 < IW && oy2 < IH && (D[oy2 * IW + ox2] >>> 24) > 0;
    if (inner) { sets[ns2++] = di; sets[ns2++] = lit > 0.1 ? Mw[Math.max(1, Math.round(tb[i] - 1.6))] : Mw[nn < 0.5 ? 0 : 1]; if (ey < 0 && tb[i] > 1.5) { const j2 = i + w; if (m[j2]) { sets[ns2++] = di + IW; sets[ns2++] = Mw[Math.min(8, Math.round(tb[j2] + 1.1))]; } } continue; }
    sets[ns2++] = di; sets[ns2++] = lit > 0.1 ? warmInk : inkC;
    const ix = x - (Math.abs(ex) >= Math.abs(ey) ? Math.sign(ex) : 0), iy = y - (Math.abs(ey) > Math.abs(ex) ? Math.sign(ey) : 0);
    const j = iy * w + ix;
    if (!m[j]) continue;
    const dj = (iy + y0) * IW + ix + x0;
    if (ix + x0 < 0 || iy + y0 < 0 || ix + x0 >= IW || iy + y0 >= IH) continue;
    if (lit > 0.05) { sets[ns2++] = dj; sets[ns2++] = mixp(D[dj], rimC, Math.min(0.75, 0.3 + lit * 1.5)); }
    else if (facing < -0.25 || nn < 0.22) { sets[ns2++] = dj; sets[ns2++] = inkC; }
    else if (ey < 0 && tb[j] > 1.5) { sets[ns2++] = dj; sets[ns2++] = Mw[Math.min(8, Math.round(tb[j] + 1.3))]; } // bevel catching light on the top lip
    else if (ey > 0) { sets[ns2++] = dj; sets[ns2++] = Mw[Math.max(0, Math.round(tb[j] - 1.2))]; } // occlusion where it tucks under
    if (ns2 > sets.length - 8) { POOL.sets = growU(sets); return slabInkFlush(D, POOL.sets, ns2); }
  }
  slabInkFlush(D, POOL.sets, ns2);
  return { cx, cy, rx, ry };
}
function slabInkFlush(D, sets, n) { for (let k = 0; k < n; k += 2) D[sets[k]] = sets[k + 1]; return null; }
function growI(a) { const b = new Int32Array(a.length * 2); b.set(a); return b; }
function growU(a) { const b = new Uint32Array(a.length * 2); b.set(a); return b; }

/** Moss on the upper edge of a slab: a wobbly cushion band, hanging strands and blades, lit per surface. */
function mossLip(img, sh, ls, MM, m, w, h, x0, y0, seed) {
  for (let x = 1; x < w - 1; x++) {
    let top = -1;
    for (let y = 0; y < h; y++) if (m[y * w + x]) { top = y; break; }
    if (top < 0) continue;
    const clump = wob(x * 0.09, seed + 51);
    const thick = clump < 0.45 ? 0 : Math.round(1 + (clump - 0.45) * 9 * wob(x * 0.3, seed + 50));
    if (thick <= 0) continue;
    for (let k = 0; k < thick; k++) {
      if (top + k >= h || !m[(top + k) * w + x]) break;
      const t = sh.idx(x + x0, top + k + y0, 0, -0.75 + k * 0.2, 0.66, ls) + (hash(x, k, seed) - 0.5) * 0.6 + (k === 0 ? 0.6 : 0);
      img.set(x + x0, top + k + y0, (sh.ka > sh.kw ? MM.a : MM.w)[qt(Math.max(1.5, Math.min(7.6, t)), x + x0, top + k + y0, 9)]);
    }
    if (hash(x, 3, seed) > 0.93) for (let k = thick; k < thick + 2 + hash(x, 4, seed) * 5; k++) { if (top + k >= h || !m[(top + k) * w + x]) break; img.set(x + x0, top + k + y0, MM.w[2 + (k & 1)]); }
    if (top > 1 && thick > 2 && hash(x, 5, seed) > 0.55) { img.set(x + x0, top - 1 + y0, MM.w[5 + (hash(x, 6, seed) > 0.5 ? 1 : 0)]); if (hash(x, 7, seed) > 0.7) img.set(x + x0, top - 2 + y0, MM.w[6]); }
  }
}

/**
 * A rock face: deep crevices behind, then slabs of very different sizes laid in uneven strata —
 * big masses with smaller rocks wedged between, never a grid of equal pebbles.
 * o: { top(x)→px | null (wall below it), ceil(x)→px | null (ceiling above it), full, size, seed, x0, x1,
 *      moss, mossAmt, strata, aspect, gem, gemAmt, glow, simple, yMax }
 */
export function rockMass(img, sh, M, o) {
  const W = img.w, H = img.h, seed = o.seed || 1, size = o.size || 60;
  const x0 = Math.max(0, Math.floor(o.x0 ?? 0)), x1 = Math.min(W, Math.ceil(o.x1 ?? W));
  const TOP = new Float32Array(W), CEIL = new Float32Array(W);
  for (let x = 0; x < W; x++) { TOP[x] = o.full ? -1e9 : o.top ? o.top(x) : 1e9; CEIL[x] = o.full ? -1e9 : o.ceil ? o.ceil(x) : -1e9; }
  const inRegion = (x, y, mrg) => { const xi = Math.max(0, Math.min(W - 1, x | 0)); return o.full || y > TOP[xi] + mrg || y < CEIL[xi] - mrg; };
  const nt = noiseTile(23, 3, 8), mt = noiseTile(29, 2, 4);
  const yMax = Math.min(H, o.yMax ?? H);
  const asp = o.aspect || 0.55;
  // strata undulate and tilt (never a level masonry course): each row follows its own wavy baseline
  const amp = size * (0.5 + hash(1, 1, seed) * 0.5), fq = 1 / (size * (5 + hash(2, 1, seed) * 4));
  // neighbouring rows share nearly the same wave so the strata stay parallel and leave no holes
  const base = (row, x) => Math.sin(x * fq + row * 0.12 + seed) * amp + Math.sin(x * fq * 2.3 + row * 0.2) * amp * 0.3 + x * (hash(3, 1, seed) - 0.5) * 0.12;
  const big = [];
  let row = 0;
  for (let y = -size * 0.6; y < yMax + size * 0.6; row++) {
    const rowH = size * asp * (0.6 + hash(row, 1, seed) * 0.4);
    let x = x0 - size * hash(row, 2, seed);
    let k = 0;
    while (x < x1 + size * 0.6) {
      const r = hash(row, k, seed + 5);
      // size classes: boulder masses, mid stones, wedged rubble
      const sz = size * (r > 0.8 ? 1.5 + hash(row, k, seed + 6) * 1.0 : r > 0.3 ? 0.75 + hash(row, k, seed + 6) * 0.45 : 0.32 + hash(row, k, seed + 6) * 0.25);
      const flat = hash(row, k, seed + 8) > 0.6 ? 1.6 : 1; // some long flat strata slabs
      const rx = sz * (0.5 + hash(row, k, seed + 7) * 0.3) * flat, ry = (sz * asp * (0.45 + hash(row, k, seed + 9) * 0.35)) / Math.sqrt(flat);
      const bx = x + rx * 0.9, by0 = base(row, bx);
      const slope = (base(row, bx + 8) - by0) / 8;
      const cx = bx, cy = y + by0 + (hash(row, k, seed + 11) - 0.5) * rowH * 0.6;
      x += rx * (1.12 + hash(row, k, seed + 13) * 0.35);
      k++;
      if (cx < x0 - rx || cx > x1 + rx || cy < -ry || cy > yMax + ry) continue;
      if (!inRegion(cx, cy, ry * 0.15)) continue;
      const sd = seed * 131 + row * 977 + k * 31;
      const item = { cx, cy, rx, ry, sd, rot: Math.atan(slope) + (hash(sd, 2, 2) - 0.5) * 0.35 };
      if (r > 0.8) big.push(item); else draw(item);
    }
    y += rowH;
  }
  // the big masses go last so they sit over the strata like boulders bedded in the face
  for (const it of big) draw(it);
  function draw(it) {
    const { cx, cy, rx, ry, sd } = it;
    const pts = blobPts(cx, cy, rx, ry, sd, { rough: 0.55 + hash(sd, 4, 4) * 0.2, n: 6 + Math.floor(hash(sd, 1, 1) * 5), tilt: it.rot });
    const ceilStone = cy < CEIL[Math.max(0, Math.min(W - 1, cx | 0))];
    const Mv = o.Ms ? o.Ms[hash(sd, 9, 9) < 0.62 ? 0 : hash(sd, 10, 9) < 0.6 ? 1 : 2] : M;
    // macro value structure: broad regions of the face sit back in shadow or push forward
    const macro = (nsf(mt, cx * 0.0035 + seed, cy * 0.006) - 0.5) * 2.2;
    slab(img, sh, Mv, pts, { tone: macro + (hash(sd, 6, 6) - 0.5) * 0.6, seed: sd, moss: ceilStone ? null : o.moss, mossAmt: o.mossAmt, strata: o.strata, gem: o.gem && hash(sd, 3, 3) < (o.gemAmt || 0.08) ? o.gem : null, glow: o.glow, top: ceilStone ? false : undefined, simple: o.simple && rx < size * 0.6 });
  }
  // deep crevices wherever no slab landed (filled last so no pixel is painted twice)
  const D = img.d, c0 = M.w[0], c1 = M.w[1], c2 = M.w[2];
  for (let y = 0; y < yMax; y++) for (let x = x0; x < x1; x++) {
    const i = y * W + x;
    if (D[i] || !(o.full || y > TOP[x] + size * 0.3 || y < CEIL[x] - size * 0.3)) continue;
    const t = 0.6 + nt[((y & 255) << 8) | ((x + seed) & 255)] * 1.5;
    D[i] = t < 1.1 ? c0 : t < 1.5 ? (bayer(x, y) < 0.5 ? c1 : c0) : t < 2.0 ? c1 : c2;
  }
}

/** Stalactites hanging from a ceiling profile: each one shaped, split into lit/shadow halves, inked. */
export function stalactites(img, sh, M, o) {
  const W = img.w, seed = o.seed || 4;
  const F = [[-0.62, 0.15, 0.77], [0.6, 0.12, 0.79], [0, -0.1, 1]];
  const L = o.len || 80;
  let x = (o.x0 ?? 0) + hash(1, 1, seed) * 40;
  let k = 0;
  while (x < (o.x1 ?? W)) {
    // a cluster: one master drip with a couple of smaller ones, then a bare stretch of ceiling
    const n = 1 + Math.floor(hash(k, 9, seed) ** 1.5 * 4);
    for (let j = 0; j < n; j++, k++) {
      const master = j === 0;
      const len = (master ? 0.45 + hash(k, 1, seed) * 0.55 : 0.12 + hash(k, 1, seed) ** 2 * 0.45) * L, wid = 3 + (master ? 0.6 : 0.3 + hash(k, 2, seed) * 0.3) * (o.wid || 11) * (0.5 + len / L);
      const broken = !master && hash(k, 6, seed) > 0.75;
      const tl = broken ? len * 0.35 : len;
      const sx = x + (j ? (hash(k, 7, seed) - 0.3) * wid * 3.2 : 0);
      const base = o.ceil(sx) - 4;
      const pts = [];
      const nn = Math.max(4, Math.round(tl / 7));
      const bend = (hash(k, 3, seed) - 0.5) * wid * 0.8;
      const tipW = broken ? 0.45 : 0;
      for (let i = 0; i <= nn; i++) { const t = i / nn, hw = wid * Math.max(tipW, (1 - t) ** 1.25) * (0.85 + wob(i * 0.9, seed + k) * 0.3); pts.push([sx - hw + bend * t * t, base + tl * t]); }
      for (let i = nn; i >= 0; i--) { const t = i / nn, hw = wid * Math.max(tipW, (1 - t) ** 1.25) * (0.85 + wob(i * 0.9 + 5, seed + k) * 0.3); pts.push([sx + hw + bend * t * t, base + tl * t]); }
      pts.push([sx + wid * 1.3, base - 6], [sx - wid * 1.3, base - 6]);
      slab(img, sh, M, pts, { seed: seed * 17 + k, F, mott: 0.4, cracks: 0 });
      if (o.tip && !broken && hash(k, 5, seed) > 0.4) {
        const tx = Math.round(sx + bend), ty = Math.round(base + tl);
        img.set(tx, ty + 1, o.tip); img.set(tx, ty + 2, o.tip);
        if (o.glow) { o.glow.set(tx, ty + 1, o.tip); o.glow.set(tx, ty + 2, o.tip); }
      }
    }
    x += (o.wid || 11) * 2 + hash(k, 4, seed) ** 0.7 * (o.gap || 34) * 3.2;
  }
}

/** Boulder sitting on a floor line (flat bottom), with rubble at its foot. */
export function boulder(img, sh, M, x, y, r, seed, o = {}) {
  const pts = blobPts(x, y - r * 0.55, r, r * 0.62, seed, { rough: 0.6, flatBottom: 0.88, n: 7 + Math.floor(hash(seed, 1, 1) * 4) });
  slab(img, sh, M, pts, { seed, moss: o.moss, mossAmt: o.mossAmt ?? 0.6 });
  for (let i = 0; i < 3 + hash(seed, 2, 2) * 4; i++) {
    const rr = 2 + hash(seed, i, 3) * r * 0.22, px = x + (hash(seed, i, 4) - 0.5) * r * 2.6;
    slab(img, sh, M, blobPts(px, y - rr * 0.5, rr, rr * 0.6, seed + i * 7, { rough: 0.5, flatBottom: 0.9, n: 6 }), { seed: seed + i * 7, cracks: 0 });
  }
}

/**
 * Far layer: deep teal gradient, warm air around distant lights, then ranges of spires, hanging fangs,
 * pillars and mounds — each irregular, with a rim on the side facing the nearest glow.
 * o: { tones:[packed far→near], rim (packed), glows:[{x,y,r,c,s}], ground (px), seed, sky:[top,mid,bottom] packed }
 */
export function farRanges(img, o) {
  const W = img.w, H = img.h, seed = o.seed || 3, d = img.d;
  const [t1, t2, t3] = o.sky;
  const bands = [];
  for (let b = 0; b <= 13; b++) { const band = b / 12; bands.push(band < 0.6 ? mixp(t1, t2, Math.min(1, band / 0.6)) : mixp(t2, t3, Math.min(1, (band - 0.6) / 0.4))); }
  for (let y = 0; y < H; y++) {
    const k = y / H;
    for (let x = 0; x < W; x++) d[y * W + x] = bands[Math.max(0, Math.min(13, Math.round((k + (bayer(x, y) - 0.5) * 0.07) * 12)))];
  }
  for (const g of o.glows || []) {
    // stepped rings: precompute the 5 tints over each sky band colour lazily
    const ir2 = 1 / (g.r * g.r), gs = (g.s || 0.6) * 6;
    const LUT = new Float32Array(65).map((_, k) => Math.pow(1 - Math.sqrt(k / 64), 1.6) * gs);
    const tint = new Map();
    for (let y = Math.max(0, Math.floor(g.y - g.r)); y < Math.min(H, g.y + g.r); y++) {
      const dy = (y - g.y) * 1.3, dy2 = dy * dy;
      for (let x = Math.max(0, Math.floor(g.x - g.r)); x < Math.min(W, g.x + g.r); x++) {
        const q = ((x - g.x) * (x - g.x) + dy2) * ir2;
        if (q >= 1) continue;
        const a = Math.floor(LUT[(q * 64) | 0] + (bayer(x, y) - 0.5) * 0.22);
        if (a <= 0) continue;
        const i = y * W + x, base = d[i], key = base * 8 + Math.min(5, a);
        let c = tint.get(key);
        if (c === undefined) { c = mixp(base, g.c, Math.min(0.85, Math.min(5, a) / 6)); tint.set(key, c); }
        d[i] = c;
      }
    }
  }
  const gy = o.ground ?? H * 0.75;
  const nt = noiseTile(seed + 40, 4, 4);
  const xs = [];
  // scanline fill with the outline's left/right span ends turned into rim (lit side) or edge (dark side)
  const fillPoly = (pts, side, tone, body2, rim, edge, dark) => {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
      xs.length = 0;
      const sy = y + 0.5;
      for (let i = 0, n = pts.length; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k])), xb = Math.min(W, Math.round(xs[k + 1])), span = Math.max(1, xb - xa);
        for (let x = xa; x < xb; x++) {
          // lit flank toward the glow, a body, and a darker turning flank: per-surface, not a gradient overlay
          const u = side < 0 ? (x - xa) / span : (xb - 1 - x) / span;
          const n = nt[(((y >> 2) & 255) << 8) | ((x >> 1) & 255)];
          const b = bayer(x, y) * 0.12;
          let c;
          if (u * span < 1.6) c = rim;
          else if (u < 0.3 + n * 0.12 + b) c = body2;
          else if (u > 0.82 - b) c = dark;
          else c = n > 0.7 ? body2 : tone;
          if ((x === xa || x === xb - 1) && c !== rim) c = edge;
          d[y * W + x] = c;
        }
      }
    }
  };
  o.tones.forEach((tone, li) => {
    const k = li / Math.max(1, o.tones.length - 1);
    const rim = mixp(tone, o.rim, 0.55 - k * 0.12), body2 = mixp(tone, o.rim, 0.16), edge = mixp(tone, hp('#000000'), 0.35), dark = mixp(tone, hp('#000000'), 0.18);
    const count = Math.round((W / 80) * (o.density || 1) * (0.55 + k * 0.5));
    const base = gy + k * 16;
    for (let i = 0; i < count; i++) {
      const cx = hash(i, li, seed) * W, kind = hash(i, li, seed + 3);
      const hgt = (0.22 + hash(i, li, seed + 5) ** 1.4 * 0.6) * gy * (0.6 + k * 0.5);
      const wid = 8 + hash(i, li, seed + 7) * 30 * (1 + k);
      const pts = [];
      if (kind < 0.55) { // spire
        const n = 8, lean = (hash(i, li, seed + 9) - 0.5) * wid;
        for (let j = 0; j <= n; j++) { const t = j / n; pts.push([cx - wid * (1 - t) ** 0.9 * (0.8 + wob(j + i, seed) * 0.4) + lean * t * t, base - hgt * t]); }
        for (let j = n; j >= 0; j--) { const t = j / n; pts.push([cx + wid * (1 - t) ** 0.9 * (0.8 + wob(j + i + 9, seed) * 0.4) + lean * t * t, base - hgt * t]); }
      } else if (kind < 0.9) { // hanging fang
        const len = hgt * 0.75, n = 7;
        pts.push([cx - wid * 1.3, -4]);
        for (let j = 1; j <= n; j++) { const t = j / n; pts.push([cx - wid * (1 - t) * (0.8 + wob(j, seed + i) * 0.4), len * t]); }
        for (let j = n - 1; j >= 1; j--) { const t = j / n; pts.push([cx + wid * (1 - t) * (0.8 + wob(j + 4, seed + i) * 0.4), len * t]); }
        pts.push([cx + wid * 1.3, -4]);
      } else { // pinched pillar floor-to-ceiling
        const n = 12;
        for (let j = 0; j <= n; j++) { const t = j / n; pts.push([cx - wid * (0.5 + Math.abs(t - 0.55) * 1.2) * (0.85 + wob(j, seed + i) * 0.3), -4 + (base + 4) * t]); }
        for (let j = n; j >= 0; j--) { const t = j / n; pts.push([cx + wid * (0.5 + Math.abs(t - 0.55) * 1.2) * (0.85 + wob(j + 6, seed + i) * 0.3), -4 + (base + 4) * t]); }
      }
      let side = -1, bestD = Infinity;
      for (const g of o.glows || []) { const dd = Math.abs(g.x - cx); if (dd < bestD) { bestD = dd; side = g.x < cx ? -1 : 1; } }
      fillPoly(pts, side, tone, body2, rim, edge, dark);
    }
    for (let x = 0; x < W; x++) {
      const top = Math.round(base - nsf(nt, x * 0.04, li * 20) * 26 * (1 - k * 0.3) - wob(x * 0.02, seed + li) * 10);
      for (let y = Math.max(0, top); y < H; y++) d[y * W + x] = y === top ? rim : y < top + 2 ? body2 : tone;
    }
  });
}

/** Stepped dithered halo into a glow buffer (additive plane → bloom). */
export function halo(glow, x, y, r, c, s = 0.5, sy = 1) {
  const W = glow.w, H = glow.h;
  for (let yy = Math.max(0, Math.floor(y - r * sy)); yy < Math.min(H, y + r * sy); yy++) for (let xx = Math.max(0, Math.floor(x - r)); xx < Math.min(W, x + r); xx++) {
    const d = Math.hypot(xx - x, (yy - y) / sy) / r;
    if (d >= 1) continue;
    const a = Math.floor((1 - d) ** 2 * s * 6 + (bayer(xx, yy) - 0.5) * 0.5) / 6;
    if (a <= 0) continue;
    const i = yy * W + xx, o = glow.d[i];
    glow.d[i] = (A(o) ? mixp(o, c, Math.min(1, a + 0.15)) : mixp(hp('#000000'), c, a)) | 0xff000000;
  }
}

/** God ray: a slanted wedge of light in four soft posterised steps (transparent canvas, drawn additive). */
export function godRay(img, x, y0, len, w0, w1, slant, color, strength = 0.5) {
  const steps = [0.25, 0.5, 0.75, 1].map((k) => mixp(hp('#000000'), color, k) | 0xff000000);
  for (let y = Math.max(0, y0); y < Math.min(img.h, y0 + len); y++) {
    const t = (y - y0) / len;
    const cx = x + slant * (y - y0), w = w0 + (w1 - w0) * t;
    const fade = Math.sin(Math.PI * Math.min(1, t * 1.15)) * strength;
    for (let xx = Math.floor(cx - w); xx < cx + w; xx++) {
      const e = 1 - Math.abs(xx - cx) / w;
      const a = fade * e * (0.7 + 0.3 * wob(xx * 0.05 + y * 0.004, 5)) * 4;
      const q = Math.floor(a + (bayer(xx, y) - 0.5) * 0.3);
      if (q > 0) img.set(xx, y, steps[Math.min(3, q - 1)]);
    }
  }
}

// ---------------------------------------------------------------------------- ground
/**
 * Ground plane (row 0 = far edge against the wall, last row = nearest the camera).
 * Gd: { img, glow, w, h, iso (ppuX/ppuZ) }; sh: Shade in iso ground space (light z = height above floor).
 * o: { seed, M (dirt), S (stones), moss, water, stones, pebbles, puddles, tufts, flag, sand, rows }
 */
export function paintGround(Gd, sh, o) {
  const { img, w, h, iso } = Gd;
  const M = o.M, seed = o.seed || 5, d = img.d;
  const nt = noiseTile(seed, 4, 8), nt2 = noiseTile(seed + 3, 3, 4);
  const bw = (w >> 2) + 1, LT = new Float32Array(bw);
  for (let y = 0; y < h; y++) {
    const gy = y * iso, near = y / h, fall = (1 - near) ** 3 * 1.2;
    if ((y & 3) === 0) for (let b = 0; b < bw; b++) { let t = sh.idx(b * 4 + 2, gy + 2 * iso, 0, 0.18, 0.98); if (sh.ka > sh.kw * 1.15) t = -t - 1; LT[b] = t; }
    const r1 = ((y * 2) & 255) << 8, yy = y * 0.45;
    for (let x = 0; x < w; x++) {
      const lt = LT[x >> 2], acc = lt < 0;
      let t = (acc ? -lt - 1 : lt) + (nt[r1 | (x & 255)] - 0.5) * 0.55 + (nsf(nt2, x * 0.12, yy) - 0.5) * 0.9 - fall;
      t = t < 1 ? 1 : t > 7.2 ? 7.2 : t;
      d[y * w + x] = (acc ? M.a : M.w)[qt(t, x, y, 9, 0.16)];
    }
  }
  const ish = isoShade(sh, iso);
  if (o.flag) flagstones(Gd, ish, o);
  if (o.sand) {
    for (let y = 0; y < h * 0.3; y++) for (let x = 0; x < w; x++) {
      const v = (1 - y / (h * 0.3)) * 0.9 + (nsf(nt2, x * 0.06, y * 0.3) - 0.5) * 0.9;
      if (v > 0.45 + (bayer(x, y) - 0.5) * 0.25) { const t = sh.idx(x, y * iso, 0, 0, 1) + 0.6; d[y * w + x] = o.sand.w[qt(Math.max(2, Math.min(7.4, t)), x, y, 9)]; }
    }
  }
  for (let p = 0; p < (o.puddles || 0); p++) puddle(Gd, sh, o, seed + p * 13, (0.05 + hash(p, 1, seed) * 0.9) * w, (0.4 + hash(p, 2, seed) * 0.5) * h);
  // floor cracks with a lit far lip
  for (let k = 0; k < Math.round(w / 260); k++) {
    let x = hash(k, 11, seed) * w, y = (0.2 + hash(k, 12, seed) * 0.75) * h, dir = (hash(k, 13, seed) - 0.5) * 0.8;
    for (let q = 0; q < 20 + hash(k, 14, seed) * 50; q++) {
      const t = sh.idx(x, y * iso, 0, 0, 1);
      img.set(x, y, M.w[Math.max(0, Math.round(t - 2.2))]);
      img.set(x, y - 1, M.w[Math.min(8, Math.round(t + 0.8))]);
      dir += (wob(q * 0.4, seed + k) - 0.5) * 0.9; x += Math.cos(dir) * 1.2; y += Math.sin(dir) * 0.45;
    }
  }
  // gravel lies in drifts, not evenly: clusters of pebbles round a few centres, sparse elsewhere
  const np = Math.round(((w * h) / 900) * (o.pebbles ?? 1));
  for (let k = 0; k < np; k++) {
    const c = Math.floor(hash(k, 4, seed) * Math.max(3, w / 120));
    const clustered = hash(k, 3, seed) < 0.7;
    const x = clustered ? hash(c, 21, seed) * w + (hash(k, 5, seed) - 0.5) * 70 : hash(k, 5, seed) * w;
    const y = clustered ? (0.15 + hash(c, 22, seed) * 0.8) * h + (hash(k, 6, seed) - 0.5) * 24 : hash(k, 6, seed) * h;
    pebble(img, sh, o.S || M, x, y, 0.8 + hash(k, 7, seed) ** 2 * 3.2 * (0.5 + y / h), iso, seed + k);
  }
  // stones: humps drawn in screen space (the floor texture is ~1 texel per screen pixel), bigger nearer the camera
  const nS = Math.round((w / 90) * (o.stones ?? 1));
  for (let k = 0; k < nS; k++) {
    const y = h * (0.1 + hash(k, 2, seed) * 0.88), near = y / h;
    const r = (4 + hash(k, 3, seed) ** 2 * 20) * (0.5 + near * 0.9);
    stone(img, ish, iso, o.S || M, hash(k, 1, seed) * w, y, r, seed * 7 + k, o.moss && hash(k, 4, seed) < 0.4 ? o.moss : null);
  }
  // contact darkness where the floor meets the wall, and an irregular far edge (bites let the
  // painted rubble at the foot of the wall show through, so the junction is never a ruled line)
  for (let x = 0; x < w; x++) {
    const bite = Math.max(0, Math.round((wob(x * 0.06, seed + 9) - 0.45) * 16 + (wob(x * 0.3, seed + 4) - 0.5) * 4));
    for (let y = 0; y < Math.min(h, bite); y++) d[y * w + x] = 0;
    for (let y = bite; y < Math.min(h, bite + 10); y++) if ((1 - (y - bite) / 10) * 0.85 > bayer(x, y) + (wob(x * 0.1, seed) - 0.5) * 0.4) d[y * w + x] = M.w[y === bite ? 0 : 1];
  }
  // rubble heaped along the foot of the wall
  if (o.rubble !== false) for (let k = 0; k < Math.round(w / 35); k++) stone(img, ish, iso, o.S || M, hash(k, 31, seed) * w, 3 + hash(k, 32, seed) * h * 0.08, 3 + hash(k, 33, seed) ** 2 * 11, seed * 13 + k, null);
  if (o.tufts) for (let k = 0; k < Math.round((w / 40) * o.tufts); k++) tuft(img, sh, o.moss || M, hash(k, 8, seed) * w, (0.1 + hash(k, 9, seed) * 0.9) * h, iso, seed + k * 3);
}

function stone(img, ish, iso, M, x, y, r, seed, moss) {
  const ry = r * (0.5 + hash(seed, 9, 9) * 0.2);
  const sp = polyMask(blobPts(x + r * 0.2, y + ry * 0.45, r * 1.1, ry * 0.6, seed + 1, { rough: 0.4, n: 8 }), 0, true);
  const sc = M.w[1];
  for (let yy = 0; yy < sp.h; yy++) for (let xx = 0; xx < sp.w; xx++) if (sp.m[yy * sp.w + xx]) img.set(xx + sp.x0, yy + sp.y0, sc);
  const pts = blobPts(x, y, r, ry, seed, { rough: 0.55, n: 6 + Math.floor(hash(seed, 1, 1) * 4), flatBottom: 0.75 });
  // floor stones: a top that faces up (z) and flanks that turn toward the camera (+y)
  const F = [[0, -0.15, 1], [-0.7, 0.2, 0.68], [0.68, 0.25, 0.68], [0, 0.8, 0.6], [(hash(seed, 2, 2) - 0.5) * 0.5, -0.45, 0.88]];
  slab(img, ish, M, pts, { seed, F, mott: 0.45, cracks: r > 10 ? 1 : 0, moss, mossAmt: moss ? 1 : 0 });
}

function pebble(img, sh, M, x, y, r, iso, seed) {
  const ry = Math.max(0.8, r * 0.65);
  const t = sh.idx(x, y * iso, -0.3, -0.2, 0.93);
  const c = sh.col(M, Math.min(7.6, t + 0.4), x | 0, y | 0), hi = sh.col(M, Math.min(8, t + 1.6), x | 0, y | 0), dk = M.w[Math.max(0, Math.round(t - 2))];
  for (let yy = Math.floor(y - ry); yy <= y + ry; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
    const dx = (xx + 0.5 - x) / r, dy = (yy + 0.5 - y) / ry;
    if (dx * dx + dy * dy + (hash(xx, yy, seed) - 0.5) * 0.6 > 1) continue;
    img.set(xx, yy, dy > 0.3 ? dk : dx < 0.1 && dy < -0.1 ? hi : c);
  }
  img.set(Math.round(x + 0.5), Math.round(y + ry + 0.6), M.w[0]);
  img.set(Math.round(x + 1.5), Math.round(y + ry + 0.6), M.w[1]);
}

function tuft(img, sh, MM, x, y, iso, seed) {
  const n = 3 + Math.floor(hash(seed, 1, 1) * 5);
  for (let b = 0; b < n; b++) {
    const bx = x + (b - n / 2) * 1.4 + (hash(seed, b, 2) - 0.5) * 2, len = 2 + hash(seed, b, 3) * 6;
    const lean = (hash(seed, b, 4) - 0.5) * 1.6;
    for (let k = 0; k < len; k++) {
      const t = sh.idx(bx, y * iso, lean * 0.3, -0.4, 0.9) + (k / len) * 1.6 - 0.4;
      img.set(Math.round(bx + lean * (k / len) ** 2 * 3), Math.round(y - k), sh.col(MM, Math.max(1.5, Math.min(7.8, t)), bx | 0, (y - k) | 0));
    }
  }
}

/** Puddle: still water reflecting the dark cave (lighter toward the far edge), ripple lines, a wet
 *  rim, glints, and broken vertical streaks under each light source. */
function puddle(Gd, sh, o, seed, x, y) {
  const { img } = Gd;
  const rx = 26 + hash(seed, 1, 1) * 60, ry = rx * 0.22;
  const pm = polyMask(blobPts(x, y, rx, ry, seed, { rough: 0.45, n: 12 }), 1);
  const W = o.water;
  const ls = sh.lights.filter((l) => Math.abs(l.x - x) < rx + 10);
  // wet mud ring first
  const ring = polyMask(blobPts(x, y + 1, rx + 3, ry + 2, seed + 3, { rough: 0.45, n: 12 }), 1);
  for (let yy = 0; yy < ring.h; yy++) for (let xx = 0; xx < ring.w; xx++) if (ring.m[yy * ring.w + xx]) img.set(xx + ring.x0, yy + ring.y0, o.M.w[1]);
  for (let yy = 0; yy < pm.h; yy++) for (let xx = 0; xx < pm.w; xx++) {
    const i = yy * pm.w + xx;
    if (!pm.m[i]) continue;
    const px = xx + pm.x0, py = yy + pm.y0;
    const v = yy / pm.h; // 0 = far edge (reflects higher, lighter wall), 1 = near edge (darker)
    let t = 2.6 - v * 2 + (Math.sin(py * 2.3 + wob(px * 0.05, seed) * 4) > 0.82 ? 0.9 : 0);
    let c = W[qt(t, px, py, W.length, 0.18)];
    for (const l of ls) {
      const dx = Math.abs(px - l.x + (wob(py * 0.8, seed) - 0.5) * 4), wdt = 2 + l.s * 6;
      if (dx < wdt && Math.sin(py * 1.6 + dx * 0.7) > -0.3) c = mixp(c, l.acc ? o.accP : o.keyP, Math.min(0.9, (1 - dx / wdt) * 1.3 * l.s));
    }
    if (yy > 0 && !pm.m[i - pm.w]) c = mixp(c, o.keyP, 0.3);
    if (hash(px, py, seed) > 0.992) c = hp('#e8f4f0');
    img.set(px, py, c);
  }
}

/** Individually shaped flagstones with gaps, chips, cracks and worn highlights. */
function flagstones(Gd, ish, o) {
  const { img, w, h } = Gd;
  const M = o.S || o.M, seed = (o.seed || 9) + 3;
  const rows = o.rows || 7;
  for (let r = 0; r < rows; r++) {
    const y0 = (r / rows) ** 1.25 * h, y1 = ((r + 1) / rows) ** 1.25 * h;
    const sw = 22 + r * 12;
    let x = -hash(r, 0, seed) * sw, k = 0;
    while (x < w) {
      const ww = sw * (0.65 + hash(r, k, seed) * 0.7);
      const g = 1.2 + (y1 - y0) * 0.06;
      const j = (a, b) => (hash(r * 31 + a, k, seed + b) - 0.5) * 2.2;
      const pts = [[x + g + j(1, 1), y0 + g * 0.6 + j(2, 1) * 0.4], [x + ww * 0.5 + j(3, 1), y0 + g * 0.5 + j(4, 1) * 0.3], [x + ww - g + j(5, 1), y0 + g * 0.6 + j(6, 1) * 0.4],
        [x + ww - g + j(7, 1) * 1.3, y1 - g * 0.6 + j(8, 1) * 0.3], [x + ww * 0.45 + j(9, 1), y1 - g * 0.5], [x + g + j(10, 1) * 1.3, y1 - g * 0.6 + j(11, 1) * 0.3]];
      if (hash(r, k, seed + 40) > 0.6) { const c = Math.floor(hash(r, k, seed + 41) * 4), ci = [0, 2, 3, 5][c], cut = g * (1.5 + hash(r, k, seed + 42) * 2.5); const [px, py] = pts[ci]; const nx = ci === 0 || ci === 5 ? 1 : -1, ny = ci < 3 ? 1 : -1; pts.splice(ci, 1, [px + nx * cut, py], [px, py + ny * cut * 0.6]); if (ci === 0 || ci === 3) { const a2 = pts[ci]; pts[ci] = pts[ci + 1]; pts[ci + 1] = a2; } } // a chipped corner
      const tilt = (hash(r, k, seed + 50) - 0.5) * 0.35;
      slab(img, ish, M, pts, { seed: seed + r * 101 + k, F: [[tilt, (hash(r, k, seed + 51) - 0.5) * 0.3, 1]], mott: 0.5, cracks: hash(r, k, seed + 52) > 0.7 ? 1 : 0, tone: (hash(r, k, seed + 53) - 0.5) * 0.9, moss: o.moss, mossAmt: o.moss ? 0.35 : 0 });
      x += ww; k++;
    }
  }
}
