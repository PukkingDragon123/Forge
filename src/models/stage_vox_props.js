// Hand-placed voxel props for the fine-voxel stages. Every painter writes into a VWorld at voxel-int
// coordinates (x, y = bottom, z = centre unless noted) and varies colour per voxel so nothing reads
// as a flat block: planks have grain and nails, stones chip, cloth folds, metal rusts at the edges.
import { C, glowC, mixC, ramp, bayer, box, ell, cyl, cylX, cylZ, seg, sag, text, textWidth, h3, NOAO } from './stage_vox_kit.js';

const n3 = (x, y, z, s) => h3(x, y, z, s);
export const WOOD = ['#3a2228', '#5a3430', '#7e4c3a', '#a8684a', '#d0905e'].map(C);
export const WOOD_PALE = ['#5a3e3a', '#86604a', '#ae8458', '#d4a86a', '#f0cc88'].map(C);
export const IRON = ['#262234', '#3a3650', '#56526e', '#7e7a96', '#b4b0c8'].map(C);
export const RUST = ['#5a2a24', '#8a4230', '#b8643a', '#e08a4a'].map(C);
export const BRASS = ['#5a3a1a', '#8a6024', '#c08c36', '#e8b850', '#fff0a0'].map(C);
export const BONE = ['#8a7a6a', '#b0a08a', '#d8c8a8', '#f4e8cc'].map(C);
export const CLOTH = {
  salmon: ['#8a3a3a', '#c05a4e', '#ec8a6e', '#ffb894'].map(C),
  mustard: ['#7a5a1e', '#b88a2e', '#e8b84a', '#ffe08a'].map(C),
  teal: ['#1e4a52', '#2e7470', '#4aa494', '#86d4b8'].map(C),
  lavender: ['#3e3462', '#5e5090', '#8a78c0', '#bca8e8'].map(C),
  cream: ['#8a7a64', '#b8a888', '#e0d0ac', '#fff4d8'].map(C),
  plum: ['#3a1e3a', '#5e2e5a', '#8a4880', '#b870a8'].map(C),
};

// ------------------------------------------------------------------ wood & metal
/** Plank-built crate (w,h,d in voxels). Lid planks, corner braces, nail heads, a stencil mark. */
export function crate(w, x, y, z, sx = 10, sy = 9, sz = 9, opts = {}) {
  const pal = opts.pale ? WOOD_PALE : WOOD, s = opts.seed || 1;
  const x0 = x - (sx >> 1), z0 = z - (sz >> 1);
  box(w, x0, y, z0, x0 + sx, y + sy, z0 + sz, (px, py, pz) => {
    const ex = px === x0 || px === x0 + sx - 1, ey = py === y || py === y + sy - 1, ez = pz === z0 || pz === z0 + sz - 1;
    const edges = (ex ? 1 : 0) + (ey ? 1 : 0) + (ez ? 1 : 0);
    if (edges >= 2) return ramp(pal, 0.25 + n3(px, py, pz, s) * 0.15, px, pz); // frame
    const plank = Math.floor((py - y) / 3);
    const seam = (py - y) % 3 === 0 && py !== y;
    if (seam) return pal[0];
    const grain = n3(px >> 2, plank, pz >> 2, s) * 0.3 + Math.sin(px * 0.9 + plank * 2.1) * 0.05;
    return ramp(pal, 0.45 + grain + (plank % 2) * 0.08, px, py);
  });
  // nails & a stamped mark on the front
  for (const [nx, ny] of [[x0 + 1, y + 1], [x0 + sx - 2, y + 1], [x0 + 1, y + sy - 2], [x0 + sx - 2, y + sy - 2]]) w.set(nx, ny, z0 + sz, IRON[3]);
  if (opts.mark) { const cx = x - 1, cy = y + (sy >> 1) + 1; for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1], [1, -1]]) w.set(cx + dx, cy + dy, z0 + sz, C(opts.mark)); }
}
/** Stave barrel with two iron hoops and a lid. */
export function barrel(w, x, y, z, r = 5, h = 12, opts = {}) {
  const pal = opts.pal || WOOD, s = opts.seed || 2;
  for (let yy = 0; yy < h; yy++) {
    const t = yy / (h - 1), rr = r * (0.86 + Math.sin(t * Math.PI) * 0.14);
    const hoop = yy === 1 || yy === h - 2 || yy === Math.floor(h * 0.35) || yy === Math.floor(h * 0.65);
    cyl(w, x + 0.5, z + 0.5, y + yy, y + yy + 1, rr, rr, (px, py, pz) => {
      const a = Math.atan2(pz - z, px - x), stave = Math.floor((a + Math.PI) * 2.6);
      if (hoop) return ramp(IRON, 0.35 + n3(px, py, pz, s) * 0.3, px, py);
      return ramp(pal, 0.4 + (stave % 2) * 0.12 + n3(stave, py >> 2, 0, s) * 0.2, px, py);
    });
  }
  cyl(w, x + 0.5, z + 0.5, y + h, y + h + 1, r * 0.82, r * 0.82, (px, py, pz) => ramp(pal, 0.55 + ((px + pz) % 3 === 0 ? -0.2 : 0), px, pz));
}
/** Burlap sack slumped against something; optional spill of ore/grain. */
export function sack(w, x, y, z, s = 1, col = CLOTH.cream, spill = null) {
  ell(w, x + 0.5, y + 4, z + 0.5, 5 * s, 4.6 * s, 4 * s, (px, py, pz, d) => ramp(col, 0.75 - d * 0.4 + (py - y) * 0.02 + (bayer(px, py) - 0.5) * 0.2 + ((px + py * 2) % 5 === 0 ? -0.15 : 0), px, pz));
  ell(w, x + 0.5, y + 9 * s, z + 0.5, 2.4 * s, 1.8 * s, 2 * s, (px, py) => ramp(col, 0.55, px, py));
  for (let k = -2; k <= 2; k++) w.set(x + k, Math.round(y + 7.8 * s), z + Math.round(4 * s), C('#8a5a2e'));
  if (spill) for (let k = 0; k < 9; k++) { const sx = x + 5 + (k % 4) * 2 - (k >> 2), sz = z + 2 + (k >> 2); w.set(sx, y, sz, spill[k % spill.length]); if (k % 3 === 0) w.set(sx, y + 1, sz, spill[(k + 1) % spill.length]); }
}
/** Timber mine support: two posts, a lintel, corner braces, iron straps. (x = centre, z = centre) */
export function timberFrame(w, x, y, z, span = 40, h = 46, opts = {}) {
  const pal = opts.pal || WOOD, s = opts.seed || 3, t = 3;
  const post = (px0) => box(w, px0, y, z - 1, px0 + t, y + h, z + 2, (px, py, pz) => ramp(pal, 0.38 + n3(px, py >> 3, pz, s) * 0.2 + (px === px0 ? 0.12 : 0) + (py % 11 === 0 ? -0.15 : 0), px, py));
  post(x - (span >> 1)); post(x + (span >> 1) - t);
  box(w, x - (span >> 1) - 3, y + h, z - 1, x + (span >> 1) + 3, y + h + 4, z + 2, (px, py, pz) => ramp(pal, 0.42 + n3(px >> 3, py, pz, s) * 0.2 + (py === y + h + 3 ? 0.15 : 0), px, py));
  for (const sd of [-1, 1]) {
    const bx = x + sd * ((span >> 1) - t);
    seg(w, bx, y + h - 9, z + 0.5, bx - sd * 9, y + h, z + 0.5, 0.9, (px, py) => ramp(pal, 0.5 + bayer(px, py) * 0.1, px, py));
  }
  for (const yy of [y + 6, y + h - 4]) for (const px of [x - (span >> 1), x + (span >> 1) - t]) box(w, px - 1, yy, z - 1, px + t + 1, yy + 1, z + 2, IRON[2]);
  w.set(x - (span >> 1) + 1, y + h + 2, z + 2, IRON[4]); w.set(x + (span >> 1) - 2, y + h + 2, z + 2, IRON[4]);
}
/** Mine rails along x from x0..x1 at depth z (two rails, sleepers). Optional rust. */
export function rails(w, x0, x1, y, z, opts = {}) {
  const gauge = opts.gauge || 8;
  for (let x = x0; x < x1; x++) {
    if ((x - x0) % 6 < 3) box(w, x, y, z - (gauge >> 1) - 2, x + 1, y + 1, z + (gauge >> 1) + 2, (px, py, pz) => ramp(WOOD, 0.3 + n3(Math.floor(px / 6), 0, pz >> 2, 9) * 0.3, px, pz));
    for (const rz of [z - (gauge >> 1), z + (gauge >> 1)]) { w.set(x, y + 1, rz, ramp(IRON, 0.75 + (x % 7 === 0 ? -0.3 : 0), x, rz)); w.set(x, y + 2, rz, n3(x, 2, rz, 4) > 0.85 ? RUST[2] : IRON[4]); }
  }
}
/** Vertical ladder leaning on a wall. */
export function ladder(w, x, y, z, h = 40) {
  for (const sx of [x - 3, x + 3]) box(w, sx, y, z, sx + 1, y + h, z + 1, (px, py) => ramp(WOOD_PALE, 0.4 + n3(px, py >> 2, 0, 7) * 0.3, px, py));
  for (let yy = y + 4; yy < y + h; yy += 5) box(w, x - 2, yy, z, x + 3, yy + 1, z + 1, WOOD_PALE[3]);
}
/** Pipe run through points (voxel ints) with flanges, rivets and a valve wheel. */
export function pipe(w, pts, r = 1.6, col = IRON, opts = {}) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
    seg(w, ax, ay, az, bx, by, bz, r, (px, py, pz) => ramp(col, 0.5 + (py - ay) * 0.01 + (n3(px, py, pz, 5) > 0.92 ? -0.35 : 0) + ((px + py) % 9 === 0 ? 0.1 : 0), px, py));
    ell(w, ax, ay, az, r + 0.9, r + 0.9, r + 0.9, col[3]);
  }
  if (opts.valve) { const [vx0, vy0, vz0] = pts[1] || pts[0]; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; w.set(Math.round(vx0 + Math.cos(a) * 3), Math.round(vy0 + Math.sin(a) * 3), vz0 + 3, C('#c83a3a')); } w.set(vx0, vy0, vz0 + 3, C('#ff6a5a')); }
  if (opts.drip) w.set(pts[pts.length - 1][0], pts[pts.length - 1][1] - 2, pts[pts.length - 1][2], glowC('#9ae8ff'));
}
/** Hanging lantern: cord, iron cage, glowing glass. Light registration is up to the caller. */
export function lantern(w, x, y, z, glass = '#ffc070', cord = 6) {
  for (let k = 0; k < cord; k++) w.set(x, y + 8 + k, z, C('#3a2a2a'));
  box(w, x - 2, y + 7, z - 2, x + 3, y + 8, z + 3, IRON[2]);
  box(w, x - 2, y, z - 2, x + 3, y + 1, z + 3, IRON[1]);
  box(w, x - 1, y + 1, z - 1, x + 2, y + 7, z + 2, glowC(glass));
  for (const [cx, cz] of [[x - 2, z - 2], [x + 2, z - 2], [x - 2, z + 2], [x + 2, z + 2]]) box(w, cx, y + 1, cz, cx + 1, y + 7, cz + 1, IRON[3]);
  w.set(x, y + 4, z + 2, glowC('#fff4d0'));
}
/** Lamp post / standing torch for wide rooms. */
export function lampPost(w, x, y, z, h = 34, glass = '#ffc070') {
  cyl(w, x + 0.5, z + 0.5, y, y + h, 1.4, 1.1, (px, py) => ramp(IRON, 0.35 + (py % 8 === 0 ? 0.3 : 0), px, py));
  box(w, x - 3, y, z - 3, x + 4, y + 2, z + 4, IRON[1]);
  box(w, x - 3, y + h, z, x + 5, y + h + 1, z + 1, IRON[2]);
  lantern(w, x + 4, y + h - 9, z, glass, 2);
}

// ------------------------------------------------------------------ signs & posters (Eastward charm)
/** Wooden sign board with pixel lettering, on two chains or nailed to the wall. Faces +z at front z. */
export function sign(w, x, y, z, str, opts = {}) {
  const tw = textWidth(str), bw = tw + 6, bh = 9;
  const pal = opts.pal || WOOD_PALE, ink = C(opts.ink || '#2a1a1e');
  const x0 = x - (bw >> 1);
  box(w, x0, y, z - 1, x0 + bw, y + bh, z + 1, (px, py) => ramp(pal, 0.5 + n3(px >> 2, py >> 1, 0, 11) * 0.2 + (py === y || py === y + bh - 1 ? -0.2 : 0) + (px === x0 || px === x0 + bw - 1 ? -0.25 : 0), px, py));
  if (opts.paint) box(w, x0 + 1, y + 1, z + 1, x0 + bw - 1, y + bh - 1, z + 2, C(opts.paint));
  text(w, x0 + 3, y + 7, z + (opts.paint ? 2 : 1), str, opts.glow ? glowC(opts.ink || '#ffe08a') : ink);
  if (opts.hang) for (const sx of [x0 + 2, x0 + bw - 3]) for (let k = 0; k < opts.hang; k++) w.set(sx, y + bh + k, z, k % 2 ? IRON[2] : IRON[3]);
  return bw;
}
/** Paper poster on a wall: border, pictogram, torn corner. Faces +z. */
export function poster(w, x, y, z, pw = 12, ph = 16, kind = 'pick', seed = 1) {
  const paper = CLOTH.cream, x0 = x - (pw >> 1);
  box(w, x0, y, z, x0 + pw, y + ph, z + 1, (px, py) => {
    if (px === x0 + pw - 1 && py === y + ph - 1) return undefined; // torn corner
    const edge = px === x0 || px === x0 + pw - 1 || py === y || py === y + ph - 1;
    return edge ? C(['#c05a4e', '#4aa494', '#8a78c0', '#e8b84a'][seed % 4]) : ramp(paper, 0.6 + n3(px, py, z, seed) * 0.3 - (py - y) * 0.01, px, py);
  });
  const ink = C('#3a2a3a'), cx = x0 + (pw >> 1), cy = y + Math.round(ph * 0.6);
  const draw = (pts, c = ink) => { for (const [dx, dy] of pts) w.set(cx + dx, cy + dy, z + 1, c); };
  if (kind === 'pick') draw([[-3, 2], [-2, 3], [-1, 3], [0, 3], [1, 3], [2, 2], [0, 2], [0, 1], [0, 0], [0, -1], [0, -2], [0, -3]]);
  else if (kind === 'skull') { draw([[-2, 2], [-1, 3], [0, 3], [1, 3], [2, 2], [-2, 1], [2, 1], [-2, 0], [2, 0], [-1, -1], [1, -1], [-1, -2], [0, -2], [1, -2]]); draw([[-1, 1], [1, 1]], C('#c83a3a')); }
  else if (kind === 'gem') draw([[0, 3], [-1, 2], [1, 2], [-2, 1], [2, 1], [-1, 0], [1, 0], [0, -1]], C('#4aa494'));
  else if (kind === 'arrow') draw([[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [1, 1], [1, -1], [0, 2], [0, -2]], C('#c05a4e'));
  for (let k = 0; k < pw - 4; k += 2) w.set(x0 + 2 + k, y + 3, z + 1, ramp(paper, 0.2, k, 0)); // "text" lines
  for (let k = 0; k < pw - 6; k += 2) w.set(x0 + 3 + k, y + 5, z + 1, ramp(paper, 0.25, k, 1));
}
/** Bunting: little pastel flags on a sagging string between two points. */
export function bunting(w, ax, ay, az, bx, by, bz, seed = 1) {
  const cols = [CLOTH.salmon, CLOTH.mustard, CLOTH.teal, CLOTH.lavender, CLOTH.cream];
  const L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.ceil(L));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t - Math.sin(t * Math.PI) * L * 0.12), z = Math.round(az + (bz - az) * t);
    w.set(x, y, z, C('#4a3a3a'));
    if (i % 5 === 2) { const c = cols[(i / 5 + seed) % cols.length | 0]; for (let r = 1; r <= 4; r++) for (let q = -(4 - r) >> 1; q <= (4 - r) >> 1; q++) w.set(x + q, y - r, z, ramp(c, 0.6 - r * 0.06, x + q, r)); }
  }
}

// ------------------------------------------------------------------ nature
/** Faceted crystal cluster growing from a base point, glowing core. */
export function crystals(w, x, y, z, h = 14, col = '#6ae8ff', seed = 1, n = 5) {
  const c = C(col), hi = mixC(c, 0xffffff, 0.55), lo = mixC(c, 0x101030, 0.45);
  for (let k = 0; k < n; k++) {
    const a = n3(k, 1, seed, 3) * Math.PI * 2, lean = 0.15 + n3(k, 2, seed, 3) * 0.5;
    const hh = h * (0.45 + n3(k, 3, seed, 3) * 0.65), r = 1.4 + n3(k, 4, seed, 3) * 1.8;
    const bx = x + Math.cos(a) * r * 1.2, bz = z + Math.sin(a) * r * 0.8;
    const tx = bx + Math.cos(a) * hh * lean, tz = bz + Math.sin(a) * hh * lean * 0.6;
    seg(w, bx, y, bz, tx, y + hh, tz, r, (px, py, pz, t) => (t > 0.86 ? glowC('#ffffff') : (px + py) % 4 === 0 ? hi : t < 0.2 ? lo : (n3(px, py, pz, seed) > 0.55 ? glowC(col) : c)));
  }
  ell(w, x + 0.5, y, z + 0.5, 3.5, 1.5, 3, (px, py) => ramp(IRON, 0.2 + bayer(px, py) * 0.2, px, py));
}
/** Mushroom: curved stem, domed cap with spots, glowing gills. */
export function mushroom(w, x, y, z, h = 14, cap = CLOTH.salmon, gill = '#5af0c8', seed = 1) {
  const bend = (n3(seed, 1, 2, 5) - 0.5) * 4;
  for (let yy = 0; yy < h; yy++) { const t = yy / h; cyl(w, x + bend * t * t + 0.5, z + 0.5, y + yy, y + yy + 1, 1.8 - t * 0.5, 1.8 - t * 0.5, (px, py) => ramp(CLOTH.cream, 0.55 + (px - x) * 0.05, px, py)); }
  const r = h * 0.55, cx = x + bend + 0.5, cy = y + h;
  ell(w, cx, cy, z + 0.5, r, r * 0.55, r, (px, py, pz, d) => {
    if (py < cy) return py === Math.floor(cy) - 1 ? glowC(gill) : undefined;
    const spot = n3(px >> 1, py, pz >> 1, seed) > 0.82;
    return spot ? CLOTH.cream[3] : ramp(cap, 0.85 - d * 0.5 + (py - cy) * 0.04, px, pz);
  });
}
/** Hanging stalactite (y = attachment point, grows downward). */
export function stalactite(w, x, y, z, len = 18, pal, seed = 1, drip = null) {
  const r0 = 2.2 + n3(x, z, seed, 1) * 2;
  for (let k = 0; k < len; k++) { const t = k / len, r = r0 * (1 - t) ** 0.8 + 0.4; cyl(w, x + 0.5, z + 0.5, y - k - 1, y - k, r, r, (px, py, pz) => ramp(pal, 0.35 + (px - x) * -0.03 + n3(px, py, pz, seed) * 0.25 + (1 - t) * 0.15, px, py)); }
  if (drip) w.set(x, y - len - 1, z, glowC(drip));
}
export function stalagmite(w, x, y, z, h = 14, pal, seed = 1) {
  const r0 = 2.6 + n3(x, z, seed, 2) * 2.2;
  for (let k = 0; k < h; k++) { const t = k / h, r = r0 * (1 - t) ** 0.9 + 0.4; cyl(w, x + 0.5, z + 0.5, y + k, y + k + 1, r, r, (px, py, pz) => ramp(pal, 0.4 + t * 0.35 + n3(px, py, pz, seed) * 0.2, px, py)); }
}
/** Tufts of grass/moss blades. */
export function tuft(w, x, y, z, col = ['#3e6a4a', '#5a8a54', '#86b46a', '#c0dc8a'].map(C), n = 6, h = 4, seed = 1) {
  for (let k = 0; k < n; k++) {
    const bx = x + Math.round((n3(k, 1, seed, 9) - 0.5) * 5), bz = z + Math.round((n3(k, 2, seed, 9) - 0.5) * 4), hh = 1 + Math.round(n3(k, 3, seed, 9) * h);
    for (let yy = 0; yy < hh; yy++) w.set(bx + (yy === hh - 1 && k % 2 ? 1 : 0), y + yy, bz, col[Math.min(col.length - 1, yy + (k % 2))]);
  }
}
/** Hanging vine from (x,y,z) downward with leaves. */
export function vine(w, x, y, z, len = 20, col = ['#2e5a42', '#4a8054', '#7ab06a'].map(C), seed = 1, flower = null) {
  let px = x;
  for (let k = 0; k < len; k++) {
    px += n3(k, 3, seed, 4) > 0.8 ? (n3(k, 4, seed, 4) > 0.5 ? 1 : -1) : 0;
    w.set(px, y - k, z, col[1]);
    if (k % 3 === 1) w.set(px + (k % 6 === 1 ? 1 : -1), y - k, z, col[2]);
    if (flower && k % 7 === 5) w.set(px, y - k, z + 1, glowC(flower));
  }
}
export function bones(w, x, y, z, seed = 1, skull = true) {
  for (let k = 0; k < 3; k++) {
    const a = n3(k, seed, 1, 6) * Math.PI, L = 5 + n3(k, seed, 2, 6) * 4;
    const bx = x + (k - 1) * 4, bz = z + (k % 2) * 3;
    seg(w, bx, y + 0.5, bz, bx + Math.cos(a) * L, y + 0.5, bz + Math.sin(a) * L * 0.6, 0.55, BONE[2]);
    w.set(Math.round(bx), y, Math.round(bz), BONE[3]); w.set(Math.round(bx + Math.cos(a) * L), y, Math.round(bz + Math.sin(a) * L * 0.6), BONE[3]);
  }
  if (skull) {
    ell(w, x + 6.5, y + 2.5, z + 1.5, 2.6, 2.4, 2.4, (px, py) => ramp(BONE, 0.75 - (py - y) * -0.02, px, py));
    w.set(x + 5, y + 3, z + 4, C('#1a1218')); w.set(x + 7, y + 3, z + 4, C('#1a1218')); w.set(x + 6, y + 1, z + 4, C('#3a2a2a'));
  }
}
/** Shallow puddle: flat water voxels with a pale highlight rim. */
export function puddle(w, x, y, z, rx = 10, rz = 5, col = '#3ab0c0') {
  const c = C(col), hi = mixC(c, 0xffffff, 0.5), deep = mixC(c, 0x101828, 0.5);
  for (let dz = -rz; dz <= rz; dz++) for (let dx = -rx; dx <= rx; dx++) {
    const d = (dx / rx) ** 2 + (dz / rz) ** 2;
    if (d > 1) continue;
    w.set(x + dx, y, z + dz, (NOAO | (d > 0.8 ? hi : d < 0.35 ? deep : c)) >>> 0);
  }
}

// ------------------------------------------------------------------ camp & rooms
/** Stone ring fire pit with crossed logs and ember glow (flames are sprites added by the stage). */
export function firepit(w, x, y, z, r = 13) {
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r * 0.9;
    ell(w, sx, y + 1.5, sz, 2.8, 2.2, 2.4, (px, py, pz) => ramp(['#3a3040', '#5a4a5a', '#8a7078', '#b89a98'].map(C), 0.4 + (py - y) * 0.12 + n3(px, py, pz, 5) * 0.2, px, py));
  }
  ell(w, x + 0.5, y, z + 0.5, r - 2, 1.4, (r - 2) * 0.9, (px, py, pz) => (n3(px, py, pz, 7) > 0.55 ? glowC(n3(px, pz, 1, 8) > 0.5 ? '#ff8a3a' : '#ffc85a') : C('#2a1a1a')));
  for (const [a, l] of [[0.4, 18], [2.1, 17], [3.6, 16]]) seg(w, x + Math.cos(a) * l * 0.5, y + 2, z + Math.sin(a) * l * 0.4, x - Math.cos(a) * l * 0.5, y + 4, z - Math.sin(a) * l * 0.4, 1.6, (px, py, pz, t) => (t > 0.35 && t < 0.65 ? (n3(px, py, pz, 3) > 0.5 ? glowC('#ff6a1a') : C('#2a1610')) : ramp(WOOD, 0.3 + n3(px, py, pz, 4) * 0.2, px, py)));
}
/** Tripod with a stew pot (the stew glows a little). */
export function cookpot(w, x, y, z, h = 30) {
  for (const [dx, dz] of [[-12, 4], [11, 6], [1, -11]]) seg(w, x + dx, y, z + dz, x, y + h, z, 0.8, (px, py) => ramp(WOOD, 0.4 + bayer(px, py) * 0.2, px, py));
  for (let k = 0; k < 8; k++) w.set(x, y + h - k, z, IRON[2]);
  const py = y + h - 16;
  ell(w, x + 0.5, py, z + 0.5, 7, 5.5, 6.5, (px, yy, pz, d) => (yy > py + 2 ? undefined : ramp(IRON, 0.25 + (px - x) * -0.04 + (d > 0.8 ? 0.15 : 0), px, yy)));
  cyl(w, x + 0.5, z + 0.5, py + 2, py + 3, 6.2, 6.2, (px, yy, pz) => (n3(px, yy, pz, 2) > 0.8 ? glowC('#9aff8a') : n3(px, yy, pz, 3) > 0.7 ? C('#ff8a5a') : glowC('#e8823a')));
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; w.set(Math.round(x + Math.cos(a) * 6.6), py + 3, Math.round(z + Math.sin(a) * 6.2), IRON[3]); }
}
/** Log seat with sawn ring ends and moss. Lies along x. */
export function logSeat(w, x, y, z, len = 22, r = 3.6, seed = 1) {
  cylX(w, x - (len >> 1), x + (len >> 1), y + r, z + 0.5, r, (px, py, pz, d) => (px === x - (len >> 1) || px === x + (len >> 1) - 1 ? (Math.round(Math.sqrt(d) * 4) % 2 ? C('#d8a870') : C('#a87a4a')) : ramp(WOOD, 0.3 + (py - y) / (2 * r) * 0.4 + n3(px >> 1, py, pz, seed) * 0.15, px, pz)));
  for (let k = 0; k < 6; k++) w.set(x - 6 + k * 2, Math.round(y + r * 2), z + (k % 2), C(k % 3 ? '#6a9a4a' : '#9ac86a'));
}
/** Simple A-frame tent. Opening faces +z. */
export function tent(w, x, y, z, wd = 34, h = 26, d = 30, col = CLOTH.mustard) {
  for (let yy = 0; yy < h; yy++) {
    const half = Math.round((wd / 2) * (1 - yy / h));
    for (let zz = -(d >> 1); zz < d >> 1; zz++) {
      const front = zz === (d >> 1) - 1;
      for (const sx of [-half, half]) w.set(x + sx, y + yy, z + zz, ramp(col, 0.45 + (sx < 0 ? 0.15 : -0.1) + ((zz + 40) % 6 === 0 ? -0.12 : 0) + bayer(x + sx, yy) * 0.1, zz, yy));
      if (front && Math.abs(0) < 1) for (let q = -half; q <= half; q++) if (Math.abs(q) > half * 0.45 || yy > h * 0.7) w.set(x + q, y + yy, z + zz, ramp(col, 0.55 + (Math.abs(q) % 4 === 0 ? -0.1 : 0), q, yy));
    }
  }
  for (let zz = -(d >> 1) - 2; zz < (d >> 1) + 2; zz++) w.set(x, y + h, z + zz, WOOD[2]);
  for (const sx of [-1, 1]) seg(w, x, y + h, z + (d >> 1) + 1, x + sx * (wd * 0.7), y, z + (d >> 1) + 8, 0.5, C('#b8a888'));
}
export function bedroll(w, x, y, z, col = CLOTH.salmon, seed = 1) {
  cylX(w, x - 9, x + 9, y + 3, z + 0.5, 3, (px, py, pz, d) => ramp(col, 0.75 - d * 0.4 + ((px + 40) % 6 === 0 ? -0.2 : 0), px, py));
  box(w, x + 9, y, z - 4, x + 26, y + 1, z + 5, (px, py, pz) => ramp(col, 0.5 + ((pz + 40) % 4 === 0 ? 0.15 : 0) + n3(px, py, pz, seed) * 0.1, px, pz));
  for (const sx of [x - 4, x + 4]) for (let k = 0; k < 7; k++) w.set(sx, y + Math.round(3 + 3 * Math.sin((k / 6) * Math.PI)), z - 3 + k, C('#6a4a2a'));
}
/** Anvil on a stump. */
export function anvil(w, x, y, z) {
  cyl(w, x + 0.5, z + 0.5, y, y + 9, 5, 4.4, (px, py, pz, d) => (py === y + 8 ? (Math.round(Math.sqrt(d) * 3) % 2 ? C('#d8a870') : C('#b07a4a')) : ramp(WOOD, 0.35 + n3(px, py >> 1, pz, 3) * 0.2, px, py)));
  box(w, x - 3, y + 9, z - 2, x + 4, y + 12, z + 3, IRON[1]);
  box(w, x - 2, y + 12, z - 1, x + 3, y + 14, z + 2, IRON[2]);
  box(w, x - 7, y + 14, z - 2, x + 7, y + 17, z + 3, (px, py) => ramp(IRON, py === y + 16 ? 0.85 : 0.45 - (px - x) * 0.02, px, py));
  seg(w, x - 7, y + 15.5, z + 0.5, x - 11, y + 15, z + 0.5, 1.1, IRON[3]);
}
/** Minecart with ore heaped inside. Long axis along x. */
export function minecart(w, x, y, z, ore = ['#e08a4a', '#ffd25e', '#9ae8ff'].map((h, i) => (i === 2 ? glowC(h) : C(h)))) {
  box(w, x - 10, y + 4, z - 6, x + 11, y + 15, z + 7, (px, py, pz) => {
    const inner = px > x - 9 && px < x + 10 && pz > z - 5 && pz < z + 6 && py > y + 5;
    if (inner) return undefined;
    const band = py === y + 6 || py === y + 13 || px === x - 10 || px === x + 10;
    return band ? ramp(IRON, 0.6, px, py) : ramp(RUST, 0.3 + n3(px, py, pz, 4) * 0.5, px, py);
  });
  for (let k = 0; k < 40; k++) { const px = x - 8 + (k % 9) * 2, pz = z - 4 + Math.floor(k / 9) * 2; ell(w, px, y + 14 + n3(k, 1, 1, 2) * 2, pz, 1.6, 1.4, 1.6, ore[k % ore.length]); }
  for (const wx of [x - 6, x + 7]) for (const wz of [z - 7, z + 7]) cylZ(w, wx, y + 3, wz, wz + 1, 3, (px, py, pz, d) => (d < 0.25 ? IRON[4] : d > 0.7 ? IRON[1] : IRON[2]));
}
/** Pile of coins and gold bits (glowing glints). */
export function goldPile(w, x, y, z, r = 9, seed = 1) {
  ell(w, x + 0.5, y, z + 0.5, r, r * 0.55, r * 0.8, (px, py, pz, d) => (n3(px, py, pz, seed) > 0.9 ? glowC('#fff6c8') : n3(px, py, pz, seed + 1) > 0.6 ? C('#ffd25e') : (d > 0.7 ? C('#b8862a') : C('#e8b84a'))));
}
/** Book stack (Elio's), scrolls. */
export function books(w, x, y, z, n = 4, seed = 1) {
  const cols = ['#a83a3a', '#3a6a9a', '#6a8a3a', '#8a5aa8', '#c8963a'];
  for (let k = 0; k < n; k++) {
    const bw = 7 - (k % 2), bd = 5, by = y + k * 2, off = Math.round((n3(k, seed, 1, 2) - 0.5) * 2);
    box(w, x - (bw >> 1) + off, by, z - (bd >> 1), x + (bw >> 1) + 1 + off, by + 2, z + (bd >> 1) + 1, (px, py, pz) => (pz === z + (bd >> 1) && px !== x - (bw >> 1) + off ? CLOTH.cream[3] : C(cols[(k + seed) % cols.length])));
  }
}
/** Merchant stall: counter, striped awning, shelf of glowing jars, hanging goods, sign. Front faces +z. */
export function stall(w, x, y, z, wd = 70, seed = 1) {
  const hw = wd >> 1;
  box(w, x - hw, y, z - 6, x + hw, y + 18, z + 6, (px, py, pz) => (pz === z + 5 && (px - x + 100) % 8 === 0 ? WOOD[1] : ramp(WOOD_PALE, 0.4 + n3(px >> 3, py >> 2, pz, seed) * 0.25 + (py === y + 17 ? 0.25 : 0), px, py)));
  for (const sx of [x - hw, x + hw - 2]) box(w, sx, y + 18, z - 6, sx + 2, y + 52, z - 4, (px, py) => ramp(WOOD, 0.4 + bayer(px, py) * 0.2, px, py));
  // awning: alternating salmon & cream stripes, scalloped hem
  for (let px = x - hw - 4; px < x + hw + 4; px++) {
    const stripe = Math.floor((px - x + 200) / 6) % 2;
    for (let k = 0; k < 14; k++) { const yy = y + 54 - Math.round(k * 0.5), zz = z - 8 + k; w.set(px, yy, zz, stripe ? ramp(CLOTH.salmon, 0.7 - k * 0.02, px, k) : ramp(CLOTH.cream, 0.8 - k * 0.02, px, k)); }
    const hem = (px - x + 200) % 6;
    if (hem > 0 && hem < 5) w.set(px, y + 47 - (hem === 2 || hem === 3 ? 1 : 0), z + 6, stripe ? CLOTH.salmon[1] : CLOTH.cream[2]);
  }
  // shelf with jars
  box(w, x - hw + 4, y + 30, z - 5, x + hw - 4, y + 31, z - 2, WOOD[2]);
  for (let k = 0; k < 9; k++) { const jx = x - hw + 8 + k * 7, col = ['#9affc8', '#ff8ae0', '#ffd25e', '#6ad8ff'][k % 4]; box(w, jx, y + 31, z - 4, jx + 3, y + 36, z - 2, glowC(col)); box(w, jx, y + 36, z - 4, jx + 3, y + 37, z - 2, WOOD[3]); }
  // goods on the counter
  for (let k = 0; k < 6; k++) { const gx = x - hw + 8 + k * 11; ell(w, gx, y + 19.5, z + 1, 2.5, 1.8, 2.2, [C('#e08a4a'), C('#9aa3b2'), glowC('#6ad8ff'), C('#ffd25e'), C('#c05a4e'), glowC('#9affc8')][k]); }
  // hanging pans & a garland of dried peppers
  for (let k = 0; k < 5; k++) { const hx = x - hw + 10 + k * 13; for (let q = 0; q < 4; q++) w.set(hx, y + 46 - q, z - 2, C('#3a2a2a')); ell(w, hx, y + 40, z - 2, 2.5, 2.5, 1, IRON[2]); }
  bunting(w, x - hw - 2, y + 52, z + 6, x + hw + 2, y + 52, z + 6, seed);
}
/** Carved stone pillar (ruins/tomb): base, fluted shaft, capital, cracks, optional banner. */
export function pillar(w, x, y, z, h = 60, pal, seed = 1, banner = null) {
  box(w, x - 6, y, z - 6, x + 7, y + 4, z + 7, (px, py, pz) => ramp(pal, 0.35 + n3(px, py, pz, seed) * 0.2, px, py));
  for (let yy = y + 4; yy < y + h - 5; yy++) cyl(w, x + 0.5, z + 0.5, yy, yy + 1, 4.6, 4.6, (px, py, pz) => {
    const a = Math.atan2(pz - z, px - x), flute = Math.round((a + Math.PI) * 3) % 2;
    const crack = Math.abs(((py * 0.7 + px * 1.3 + seed * 7) % 23) - 11) < 0.5 && n3(px, py, pz, seed) > 0.5;
    return crack ? pal[0] : ramp(pal, 0.45 + flute * 0.12 + n3(px, py >> 2, pz, seed) * 0.15 + (px - x) * -0.02, px, py);
  });
  box(w, x - 6, y + h - 5, z - 6, x + 7, y + h, z + 7, (px, py, pz) => ramp(pal, 0.55 + (py === y + h - 1 ? 0.2 : 0) + n3(px, py, pz, seed) * 0.15, px, py));
  if (banner) { const c = banner; for (let yy = 0; yy < 26; yy++) for (let q = -4; q <= 4; q++) { if (yy > 21 && Math.abs(q) < yy - 21) continue; w.set(x + q, y + h - 10 - yy, z + 6, ramp(c, 0.55 + (Math.abs(q) === 4 ? -0.2 : 0) + (yy % 7 === 3 ? 0.15 : 0), q, yy)); } w.set(x, y + h - 20, z + 7, glowC('#ffd25e')); }
}
/** Brazier bowl on legs (flame sprite added by the stage). */
export function brazier(w, x, y, z, coal = '#ff8a3a') {
  for (const [dx, dz] of [[-3, -3], [3, -3], [0, 4]]) seg(w, x + dx, y, z + dz, x + dx * 0.5, y + 10, z + dz * 0.5, 0.6, IRON[2]);
  ell(w, x + 0.5, y + 11, z + 0.5, 5, 2.5, 5, (px, py, pz) => (py >= y + 12 ? glowC(n3(px, py, pz, 2) > 0.5 ? coal : '#ffd27a') : ramp(IRON, 0.35 + (px - x) * -0.04, px, py)));
}
/** Throne of the Cursed Lord. */
export function throne(w, x, y, z, pal) {
  box(w, x - 14, y, z - 10, x + 15, y + 6, z + 10, (px, py, pz) => ramp(pal, 0.4 + n3(px, py, pz, 3) * 0.2 + (py === y + 5 ? 0.2 : 0), px, py));
  box(w, x - 9, y + 6, z - 6, x + 10, y + 16, z + 4, (px, py, pz) => ramp(pal, 0.45 + n3(px, py, pz, 4) * 0.2, px, py));
  box(w, x - 9, y + 16, z - 6, x + 10, y + 52, z - 2, (px, py, pz) => (Math.abs(px - x) < 2 && py > y + 30 && py < y + 46 ? glowC('#c86bff') : ramp(pal, 0.4 + n3(px, py >> 2, pz, 5) * 0.2 + (Math.abs(px - x) === 8 ? 0.2 : 0), px, py)));
  for (const sx of [-1, 1]) { seg(w, x + sx * 9, y + 52, z - 4, x + sx * 14, y + 62, z - 4, 1.2, BONE[2]); w.set(x + sx * 14, y + 63, z - 4, glowC('#c86bff')); }
  box(w, x - 12, y + 16, z - 6, x - 9, y + 26, z + 6, pal[2]); box(w, x + 10, y + 16, z - 6, x + 13, y + 26, z + 6, pal[2]);
}
/** Carved stone arch with glowing runes (events, shrines). Faces +z. */
export function arch(w, x, y, z, span = 40, h = 50, pal, rune = '#9affc8', seed = 1) {
  for (let px = x - (span >> 1) - 5; px <= x + (span >> 1) + 5; px++) for (let py = y; py < y + h + 6; py++) {
    const dx = (px - x) / (span / 2), dy = (py - y - h * 0.55) / (h * 0.45);
    const inside = Math.abs(dx) < 1 && (py < y + h * 0.55 || dx * dx + dy * dy < 1);
    const outer = Math.abs(px - x) <= (span >> 1) + 5 && (py < y + h * 0.55 + 1 || ((px - x) / (span / 2 + 5)) ** 2 + ((py - y - h * 0.55) / (h * 0.45 + 5)) ** 2 < 1);
    if (!outer || inside) continue;
    const block = (Math.floor((px + 100) / 6) + Math.floor(py / 4)) % 2;
    const r = n3(px >> 1, py >> 1, seed, 3) > 0.93;
    for (let pz = z - 3; pz <= z + 2; pz++) w.set(px, py, pz, pz === z + 2 && r ? glowC(rune) : ramp(pal, 0.4 + block * 0.12 + n3(px, py, pz, seed) * 0.15, px, py));
  }
}
/** A rug lying on the floor (top face visible). */
export function rug(w, x, y, z, wd = 40, d = 24, col = CLOTH.plum, seed = 1) {
  box(w, x - (wd >> 1), y, z - (d >> 1), x + (wd >> 1), y + 1, z + (d >> 1), (px, py, pz) => {
    const bx = Math.min(px - (x - (wd >> 1)), x + (wd >> 1) - 1 - px), bz = Math.min(pz - (z - (d >> 1)), z + (d >> 1) - 1 - pz);
    if (bx < 2 || bz < 2) return (px + pz) % 2 ? CLOTH.mustard[2] : col[1];
    const motif = (Math.abs(px - x) + Math.abs(pz - z)) % 6 === 0;
    return motif ? CLOTH.mustard[3] : ramp(col, 0.5 + n3(px, pz, 1, seed) * 0.15, px, pz);
  });
}
/** Wooden tool rack with picks and shovels leaning. Faces +z. */
export function toolRack(w, x, y, z) {
  box(w, x - 12, y + 18, z, x + 12, y + 20, z + 2, WOOD[2]);
  for (const sx of [x - 12, x + 10]) box(w, sx, y, z, sx + 2, y + 22, z + 2, WOOD[1]);
  for (let k = 0; k < 4; k++) {
    const tx = x - 8 + k * 5;
    seg(w, tx, y + 1, z + 3, tx + 1, y + 24, z + 3, 0.5, WOOD_PALE[2]);
    if (k % 2 === 0) for (let q = -3; q <= 3; q++) w.set(tx + 1 + q, y + 24 - Math.abs(q) * 0.5, z + 3, IRON[3 + (q === 0 ? 1 : 0)]);
    else box(w, tx - 1, y + 21, z + 3, tx + 3, y + 26, z + 4, IRON[2]);
  }
}
/** Chain hanging between two points. */
export function chain(w, ax, ay, az, bx, by, bz, droop = 4) {
  sag(w, ax, ay, az, bx, by, bz, droop, (i) => (i % 2 ? IRON[3] : IRON[1]));
}
export { glowC, C };
