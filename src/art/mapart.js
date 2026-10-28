// Hand-painted pixel-art cross-section of a mine layer: strata, carved chambers, braced tunnels,
// rails, bridges, shafts, room interiors and lamplight. Returns the canvas + node/edge pixel positions.
import { Painter, dither } from './pixel.js';
import { REGIONS } from '../data/regions.js';
import { hash2, fbm2, clamp, mixHex, shadeHex, hexToRgb } from '../core/math.js';
import { RNG } from '../core/rng.js';

const OUT = '#120a0c';

export function mapLayout(map) {
  const W = 960;
  const rows = 1 + Math.max(...map.nodes.map((n) => n.row));
  const H = 120 + rows * 150;
  const pos = {};
  for (const n of map.nodes) pos[n.id] = { x: Math.round(150 + n.x * (W - 300)), y: Math.round(110 + n.y * (H - 230)) };
  return { W, H, pos };
}

export function paintMap(map, regionIdx, seed = 'map') {
  const R = REGIONS[regionIdx];
  const pal = R.pal;
  const { W, H, pos } = mapLayout(map);
  const rng = new RNG(seed + ':paint' + regionIdx);
  const sd = rng.int(1, 9999);
  const p = new Painter(W, H);
  const rock = [shadeHex(pal.rock[0], -0.2), ...pal.rock, shadeHex(pal.rock[4], 0.18)];

  // ------------------------------------------------------------ 1. strata
  const band = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const warp = fbm2(x * 0.006, y * 0.01, 3, sd) * 60 + Math.sin(x * 0.013 + sd) * 10;
    const layer = (y + warp) / 46;
    const li = Math.floor(layer);
    const tone = 0.32 + hash2(li, 7, sd) * 0.5; // each stratum has its own tone
    const grain = fbm2(x * 0.08, y * 0.12, 2, sd + 3) * 0.28 + hash2(x, y, sd) * 0.1;
    const edge = layer - li < 0.06 ? -0.18 : layer - li > 0.94 ? 0.08 : 0; // bevel line between strata
    band[y * W + x] = clamp(tone + grain - 0.15 + edge, 0, 0.999);
  }
  const depthDark = (y) => clamp(0.06 + (y / H) * 0.18, 0, 0.3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = band[y * W + x] - depthDark(y) * 0.5;
    const t = clamp(v, 0, 0.999) * (rock.length - 1);
    const i0 = Math.floor(t);
    p.set(x, y, dither(x, y, t - i0) ? rock[Math.min(i0 + 1, rock.length - 1)] : rock[i0]);
  }
  // pebbles, cracks, ore specks, fossils
  for (let k = 0; k < (W * H) / 900; k++) {
    const x = rng.int(4, W - 5), y = rng.int(30, H - 5), r = rng.float(1.5, 3.6);
    const c = rng.pick([rock[2], rock[3], rock[4]]);
    p.ellipse(x, y, r * 1.3, r, (px, py, nx, ny) => (ny < -0.35 && nx < 0.3 ? shadeHex(c, 0.22) : ny > 0.45 ? shadeHex(c, -0.3) : c));
  }
  for (let k = 0; k < (W * H) / 9000; k++) {
    let x = rng.int(0, W - 1), y = rng.int(40, H - 1);
    const len = rng.int(10, 34);
    for (let i = 0; i < len; i++) { p.set(x, y, rock[0]); p.set(x + 1, y, rock[3]); x += rng.int(-1, 1); y += 1; }
  }
  const veinCols = [pal.accent[0], pal.metal[2], '#ffc83a', '#d8dee8', pal.accent[1]];
  for (let k = 0; k < (W * H) / 7000; k++) {
    const cx = rng.int(10, W - 10), cy = rng.int(60, H - 10), col = rng.pick(veinCols);
    for (let i = 0; i < rng.int(4, 9); i++) {
      const x = cx + rng.int(-5, 5), y = cy + rng.int(-3, 3);
      p.set(x, y, shadeHex(col, -0.25)); p.set(x, y - 1, col); p.set(x - 1, y - 1, shadeHex(col, 0.45));
    }
  }
  for (let k = 0; k < 4; k++) fossil(p, rng.int(30, W - 30), rng.int(120, H - 40), rng, rock);
  if (regionIdx === 1) for (let k = 0; k < 26; k++) crystal(p, rng.int(10, W - 10), rng.int(60, H - 10), rng.pick([pal.accent[0], pal.accent[1], pal.accent[2]]), rng.int(5, 11), rng);
  if (regionIdx === 4) for (let k = 0; k < 10; k++) lavaVein(p, rng.int(0, W), rng.int(80, H), rng);
  if (regionIdx === 5) for (let k = 0; k < 18; k++) bones(p, rng.int(10, W - 10), rng.int(80, H - 10), rng);

  // ------------------------------------------------------------ 2. surface / ceiling
  for (let x = 0; x < W; x++) {
    const top = 26 + Math.round(fbm2(x * 0.02, 0, 2, sd + 9) * 14);
    for (let y = 0; y < top; y++) p.set(x, y, mixHex(R.pal.sky, '#000000', 0.2));
    if (regionIdx === 0) {
      for (let y = top; y < top + 5; y++) p.set(x, y, y === top ? '#8ac04a' : y === top + 1 ? '#5a9a3a' : '#3a6a2a');
      if (hash2(x, 1, sd) > 0.8) p.set(x, top - 1, '#8ac04a');
      if (hash2(x, 2, sd) > 0.93) for (let y = top + 5; y < top + 5 + rng.int(4, 14); y++) p.set(x + ((y >> 2) & 1), y, '#4a3a2a');
    } else {
      for (let y = top; y < top + 3; y++) p.set(x, y, y === top ? rock[5] : rock[1]);
    }
  }

  // ------------------------------------------------------------ 3. carve tunnels + rooms
  const cav = new Uint8Array(W * H); // 1 tunnel, 2 room
  const floorY = new Int16Array(W).fill(-1);
  const carve = (x, y, rx, ry, v, flat) => {
    for (let yy = Math.floor(y - ry); yy <= Math.ceil(y + ry); yy++) for (let xx = Math.floor(x - rx); xx <= Math.ceil(x + rx); xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const dx = (xx - x) / rx, dy = (yy - y) / ry;
      if (flat !== undefined && yy > flat) continue;
      const wob = (hash2(xx >> 2, yy >> 2, sd + 5) - 0.5) * 0.12;
      if (dx * dx + dy * dy <= 1 + wob) cav[yy * W + xx] = Math.max(cav[yy * W + xx], v);
    }
  };
  const edges = [];
  for (const e of map.edges) {
    const a = pos[e.a], b = pos[e.b];
    const bend = rng.float(-40, 40);
    const pts = [];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const s = t * t * (3 - 2 * t);
      pts.push([a.x + (b.x - a.x) * t + Math.sin(t * Math.PI) * bend * 0.6, a.y + 16 + (b.y - a.y) * s]);
    }
    const r = e.tunnel === 'crawl' ? 9 : e.tunnel === 'elevator' ? 13 : 14;
    for (const [x, y] of pts) carve(x, y, r, r * 0.9, 1);
    edges.push({ a: e.a, b: e.b, pts, tunnel: e.tunnel, sight: e.sight, r });
  }
  const roomBox = {};
  for (const n of map.nodes) {
    const c = pos[n.id];
    const big = n.type === 'boss' ? 1.45 : n.type === 'start' ? 1.15 : 1;
    const rx = 56 * big, ry = 40 * big;
    const fy = Math.round(c.y + 26 * big);
    carve(c.x, c.y, rx, ry, 2, fy);
    roomBox[n.id] = { x: c.x, y: c.y, rx, ry, floor: fy, big };
  }

  // paint cavities: dark back wall with soft texture, rim bevel on the cut edge
  const back = [shadeHex(pal.rock[0], -0.35), pal.rock[0], pal.rock[1], mixHex(pal.rock[1], pal.rock[2], 0.5)];
  const isCav = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cav[y * W + x] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!cav[y * W + x]) continue;
    const n = fbm2(x * 0.05, y * 0.08, 2, sd + 11) * 0.7 + hash2(x, y, sd + 2) * 0.2;
    // gradient: lighter near the floor (bounce light), darker toward ceiling
    let up = 0; for (let k = 1; k <= 14; k++) if (!isCav(x, y + k)) { up = 1 - k / 14; break; }
    const t = clamp(n * 0.55 + up * 0.5, 0, 0.999) * (back.length - 1);
    const i0 = Math.floor(t);
    p.set(x, y, dither(x, y, t - i0) ? back[Math.min(i0 + 1, back.length - 1)] : back[i0]);
  }
  // cut-edge bevel: dark outline + lit lower edge + shadowed ceiling
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (cav[y * W + x]) {
      if (!isCav(x, y - 1)) { p.set(x, y, OUT); if (isCav(x, y + 1)) p.set(x, y + 1, back[0]); }
      continue;
    }
    const nb = isCav(x + 1, y) || isCav(x - 1, y) || isCav(x, y + 1) || isCav(x, y - 1);
    if (!nb) continue;
    if (isCav(x, y - 1)) { p.set(x, y, shadeHex(rock[5], 0.18)); p.set(x, y + 1, rock[4]); } // floor lip catches light
    else p.set(x, y, OUT);
  }
  // floors: dirt strip at the bottom of every cavity column
  for (let x = 0; x < W; x++) for (let y = 1; y < H - 1; y++) {
    if (cav[y * W + x] && !cav[(y + 1) * W + x]) {
      for (let k = 0; k < 4; k++) if (isCav(x, y - k)) p.set(x, y - k, k === 0 ? pal.dirt[2] : k === 1 ? pal.dirt[1] : hash2(x, y - k, 4) > 0.5 ? pal.dirt[0] : back[2]);
      if (hash2(x, y, 31) > 0.9 && isCav(x, y - 4)) p.set(x, y - 4, pal.dirt[2]);
    }
  }

  // ------------------------------------------------------------ 4. tunnel dressing
  const floorAt = (x, y) => { let yy = Math.round(y); for (let k = 0; k < 40 && isCav(Math.round(x), yy + 1); k++) yy++; return yy; };
  const ceilAt = (x, y) => { let yy = Math.round(y); for (let k = 0; k < 40 && isCav(Math.round(x), yy - 1); k++) yy--; return yy; };
  for (const e of edges) {
    const { pts, tunnel } = e;
    const wood = regionIdx === 5 ? '#4a3a5a' : regionIdx === 3 ? '#7a6a52' : '#7a4a2a';
    // timber supports
    const steep = Math.abs(pts[pts.length - 1][1] - pts[0][1]) > Math.abs(pts[pts.length - 1][0] - pts[0][0]) * 1.4;
    if (tunnel !== 'flooded' && tunnel !== 'elevator' && !steep) for (let i = 12; i < pts.length - 12; i += 22) {
      const [x, y] = pts[i];
      if (cav[Math.round(y) * W + Math.round(x)] === 2) continue; // not inside rooms
      const f = floorAt(x, y), c = ceilAt(x, y);
      if (f - c < 14 || f - c > e.r * 2 + 8) continue;
      beam(p, Math.round(x) - 7, c, f, wood); beam(p, Math.round(x) + 6, c, f, wood);
      for (let xx = Math.round(x) - 8; xx <= Math.round(x) + 8; xx++) { p.set(xx, c + 1, shadeHex(wood, 0.25)); p.set(xx, c + 2, wood); p.set(xx, c + 3, shadeHex(wood, -0.35)); }
    }
    if (tunnel === 'minecart') {
      let lastTie = -9;
      for (let i = 0; i < pts.length; i++) {
        const x = Math.round(pts[i][0]); const f = floorAt(pts[i][0], pts[i][1]);
        p.set(x, f - 3, '#c8c8d0'); p.set(x, f - 2, '#6a6a74');
        if (x - lastTie >= 5 || x - lastTie <= -5) { p.set(x, f - 1, '#5a3820'); p.set(x + 1, f - 1, '#5a3820'); lastTie = x; }
      }
      const mid = pts[Math.floor(pts.length * 0.55)];
      minecart(p, Math.round(mid[0]), floorAt(mid[0], mid[1]) - 3, rng, pal);
    } else if (tunnel.endsWith('bridge')) {
      const i0 = Math.floor(pts.length * 0.3), i1 = Math.floor(pts.length * 0.7);
      const deckCol = tunnel === 'crystalbridge' ? pal.accent[0] : tunnel === 'chainbridge' ? pal.metal[1] : tunnel === 'rootbridge' ? '#5a4a2a' : tunnel === 'lavabridge' ? '#3a2e2c' : '#8a5a33';
      const cols = [];
      for (let i = i0; i < i1; i++) {
        const [xa, ya] = pts[i], [xb, yb] = pts[i + 1];
        const n = Math.max(1, Math.abs(Math.round(xb) - Math.round(xa)));
        for (let k = 0; k < n; k++) cols.push([xa + ((xb - xa) * k) / n, ya + ((yb - ya) * k) / n, i + k / n]);
      }
      const seen = new Set();
      for (const [x, y, i] of cols) {
        const xx = Math.round(x);
        if (seen.has(xx)) continue;
        seen.add(xx);
        const f = floorAt(x, y);
        // chasm below the bridge
        for (let yy = f - 1; yy < Math.min(H - 2, f + 34); yy++) {
          const deep = (yy - f) / 34;
          p.set(xx, yy, mixHex(back[0], tunnel === 'lavabridge' ? '#ff5a1a' : '#000000', tunnel === 'lavabridge' ? deep * 0.9 : 0.5 + deep * 0.5));
        }
        const sag = Math.sin(((i - i0) / (i1 - i0)) * Math.PI) * 4;
        const dy = Math.round(f - 4 + sag);
        if (tunnel === 'lavabridge') { if ((i >> 2) % 2 === 0) { p.set(xx, dy, '#5a4a48'); p.set(xx, dy + 1, '#2a1e1c'); } }
        else { p.set(xx, dy, shadeHex(deckCol, 0.2)); p.set(xx, dy + 1, (xx % 4 === 0) ? OUT : deckCol); p.set(xx, dy - 7 + Math.round(sag * 0.3), '#c8a870'); }
      }
    } else if (tunnel === 'flooded') {
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i]; const f = floorAt(x, y); const xx = Math.round(x);
        for (let k = 0; k < 7; k++) if (isCav(xx, f - k)) p.set(xx, f - k, k === 6 ? mixHex(pal.water, '#ffffff', 0.45) : mixHex(pal.water, '#000000', k * 0.06));
      }
    } else if (tunnel === 'elevator') {
      const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
      for (let y = Math.round(Math.min(y0, y1)) - 6; y < Math.max(y0, y1); y++) { const t = (y - y0) / (y1 - y0 || 1); const x = Math.round(x0 + (x1 - x0) * clamp(t, 0, 1)); p.set(x - 1, y, '#c8a870'); p.set(x + 1, y, '#c8a870'); }
      const m = pts[Math.floor(pts.length / 2)];
      for (let xx = Math.round(m[0]) - 8; xx <= Math.round(m[0]) + 8; xx++) { p.set(xx, Math.round(m[1]) + 6, '#8a5a33'); p.set(xx, Math.round(m[1]) + 7, OUT); }
    } else if (tunnel === 'stairs') {
      for (let i = 0; i < pts.length; i += 4) { const [x, y] = pts[i]; const f = floorAt(x, y); for (let k = 0; k < 4; k++) p.set(Math.round(x) + k, f - (i % 8 === 0 ? 2 : 0), rock[5]); }
    }
    // a lantern hanging partway along
    const lp = pts[Math.floor(pts.length * 0.45)];
    if (lp && tunnel !== 'flooded') lantern(p, Math.round(lp[0]), ceilAt(lp[0], lp[1]) + 2, R.pal.glow);
    e.lamp = lp ? [Math.round(lp[0]), ceilAt(lp[0], lp[1]) + 8] : null;
  }

  // ------------------------------------------------------------ 5. room interiors
  const lights = [];
  for (const n of map.nodes) {
    const b = roomBox[n.id];
    const fy = floorAt(b.x, b.y) ;
    const cx = Math.round(b.x);
    const draw = ROOM_ART[n.type];
    if (draw) draw(p, cx, fy, b, rng, pal, regionIdx);
    // every room has a wall lamp or glow
    const lc = n.type === 'camp' ? '#ffa040' : n.type === 'event' ? '#c08aff' : n.type === 'boss' ? pal.glow : n.type === 'mining' ? '#7fe3ff' : pal.glow2 || pal.glow;
    lights.push({ x: cx, y: fy - 22, r: 70 * b.big, color: lc, k: n.type === 'camp' || n.type === 'boss' ? 0.55 : 0.4 });
  }
  for (const e of edges) if (e.lamp) lights.push({ x: e.lamp[0], y: e.lamp[1], r: 42, color: R.pal.glow, k: 0.35 });

  // ------------------------------------------------------------ 6. lighting pass (dithered additive glow, only on cavities + nearby rock)
  const img = p.data;
  for (const L of lights) {
    const [lr, lg, lb] = hexToRgb(L.color);
    const x0 = Math.max(0, Math.floor(L.x - L.r)), x1 = Math.min(W - 1, Math.ceil(L.x + L.r));
    const y0 = Math.max(0, Math.floor(L.y - L.r)), y1 = Math.min(H - 1, Math.ceil(L.y + L.r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - L.x, (y - L.y) * 1.15) / L.r;
      if (d >= 1) continue;
      let k = (1 - d) * (1 - d) * L.k;
      if (!cav[y * W + x]) k *= 0.45;
      const q = Math.floor(k * 6) / 6 + (dither(x, y, (k * 6) % 1) ? 1 / 6 : 0);
      const i = (y * W + x) * 4;
      img[i] = Math.min(255, img[i] + lr * q * 0.7);
      img[i + 1] = Math.min(255, img[i + 1] + lg * q * 0.7);
      img[i + 2] = Math.min(255, img[i + 2] + lb * q * 0.7);
    }
  }
  // side vignette into darkness
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, W - 1 - x);
    if (e < 18 && dither(x, y, 1 - e / 18)) p.set(x, y, mixHex(R.pal.sky, '#000000', 0.3));
  }
  // frame line
  for (let x = 0; x < W; x++) { p.set(x, H - 1, OUT); }

  const canvas = p.toCanvas();
  const nodePx = {};
  for (const n of map.nodes) { const b = roomBox[n.id]; nodePx[n.id] = { x: Math.round(b.x), y: floorAt(b.x, b.y), top: Math.round(b.y - b.ry) }; }
  return { canvas, W, H, nodePx, edges, roomBox };
}

// ============================================================ little pixel props
function beam(p, x, y0, y1, wood) { for (let y = y0; y <= y1; y++) { p.set(x, y, shadeHex(wood, 0.22)); p.set(x + 1, y, wood); p.set(x + 2, y, shadeHex(wood, -0.38)); } }
function lantern(p, x, y, glow) {
  p.set(x, y - 2, '#3a3a3a'); p.set(x, y - 1, '#3a3a3a');
  p.rect(x - 2, y, 5, 1, '#5a3a20'); p.rect(x - 2, y + 1, 5, 4, OUT);
  p.rect(x - 1, y + 1, 3, 3, glow); p.set(x, y + 2, '#ffffff'); p.rect(x - 2, y + 5, 5, 1, '#5a3a20');
}
function crystal(p, x, y, col, h, rng) {
  const lean = rng.float(-0.4, 0.4);
  for (let k = 0; k < h; k++) {
    const w = Math.max(1, Math.round((1 - k / h) * 3));
    for (let i = -w; i <= w; i++) p.set(Math.round(x + i + lean * k), y - k, i < 0 ? shadeHex(col, 0.35) : i === 0 ? shadeHex(col, 0.15) : shadeHex(col, -0.25));
  }
  p.set(Math.round(x + lean * h), y - h, '#ffffff');
}
function lavaVein(p, x, y, rng) {
  for (let i = 0; i < rng.int(30, 70); i++) { p.set(x, y, '#ff6a1a'); p.set(x, y + 1, '#c83a0a'); if (rng.chance(0.3)) p.set(x, y - 1, '#ffd04a'); x += rng.int(0, 2) - 0; y += rng.int(-1, 1); }
}
function bones(p, x, y, rng) {
  const c = '#d8d0c0';
  p.rect(x - 3, y, 7, 1, c); p.set(x - 4, y - 1, c); p.set(x - 4, y + 1, c); p.set(x + 4, y - 1, c); p.set(x + 4, y + 1, c);
  if (rng.chance(0.3)) { p.rect(x + 7, y - 2, 4, 3, c); p.set(x + 8, y - 1, OUT); p.set(x + 10, y - 1, OUT); }
}
function fossil(p, x, y, rng, rock) {
  const c = shadeHex(rock[5], 0.15);
  for (let a = 0; a < 18; a += 0.35) { const r = a * 0.45; p.set(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), a % 1.4 < 0.7 ? c : rock[2]); }
}
function minecart(p, x, y, rng, pal) {
  const body = '#6a6a74';
  p.rect(x - 9, y - 9, 19, 8, OUT);
  p.rect(x - 8, y - 8, 17, 6, body); p.rect(x - 8, y - 8, 17, 1, '#a8a8b0');
  for (let i = 0; i < 6; i++) p.set(x - 6 + i * 3, y - 10, rng.pick(['#ffc83a', '#c8743a', '#d8dee8', pal.accent[0]]));
  p.rect(x - 7, y - 11, 15, 2, '#8a8a92');
  p.circle(x - 5, y - 1, 2, OUT); p.circle(x + 6, y - 1, 2, OUT); p.set(x - 5, y - 1, '#9a9aa4'); p.set(x + 6, y - 1, '#9a9aa4');
}
function chest(p, x, y, gold) {
  p.rect(x - 8, y - 11, 17, 11, OUT);
  p.rect(x - 7, y - 10, 15, 9, '#8a5a33'); p.rect(x - 7, y - 10, 15, 3, '#a8703f'); p.rect(x - 7, y - 7, 15, 1, OUT);
  p.rect(x - 1, y - 8, 3, 4, gold ? '#ffd23a' : '#c8c8d0'); p.set(x, y - 6, OUT);
  p.rect(x - 7, y - 3, 15, 1, '#5a3820');
}
function tent(p, x, y, col) {
  for (let k = 0; k < 18; k++) { const w = Math.round((k / 18) * 14); for (let i = -w; i <= w; i++) p.set(x + i, y - 18 + k, i < 0 ? shadeHex(col, 0.15) : shadeHex(col, -0.2)); }
  for (let k = 0; k < 10; k++) p.set(x, y - 10 + k, OUT);
  p.set(x - 1, y - 2, OUT); p.set(x + 1, y - 2, OUT);
}
function fire(p, x, y) {
  p.rect(x - 6, y - 1, 13, 1, '#4a2a14'); p.rect(x - 5, y - 2, 11, 1, '#6a3a1a');
  const fl = ['#ff5a1a', '#ff9a2a', '#ffd04a', '#fff4b0'];
  for (let k = 0; k < 9; k++) { const w = Math.round((1 - k / 9) * 4); for (let i = -w; i <= w; i++) p.set(x + i, y - 3 - k, fl[Math.min(3, Math.floor((1 - Math.abs(i) / (w + 1)) * 3 + k / 4))]); }
}
function skull(p, x, y, eye) {
  p.rect(x - 3, y - 7, 7, 5, '#efe6d0'); p.rect(x - 2, y - 2, 5, 2, '#d8cfb8');
  p.set(x - 1, y - 5, eye || OUT); p.set(x + 1, y - 5, eye || OUT); p.set(x, y - 3, OUT);
  p.outline(OUT);
}
const ROOM_ART = {
  start(p, x, y, b, rng, pal) {
    const wood = '#8a5a33';
    beam(p, x - 26, y - 46, y, wood); beam(p, x + 24, y - 46, y, wood);
    for (let xx = x - 28; xx <= x + 28; xx++) { p.set(xx, y - 47, shadeHex(wood, 0.25)); p.set(xx, y - 46, wood); p.set(xx, y - 45, shadeHex(wood, -0.35)); }
    lantern(p, x, y - 43, pal.glow);
    // signpost
    beam(p, x + 12, y - 16, y, '#6a4a2a'); p.rect(x + 6, y - 18, 14, 6, '#a8703f'); p.rect(x + 7, y - 16, 12, 1, '#5a3820');
  },
  mining(p, x, y, b, rng, pal) {
    for (let k = 0; k < 14; k++) { const xx = x + rng.int(-44, 44), yy = y - rng.int(14, 52); const c = rng.pick(['#ffc83a', '#c8743a', '#d8dee8', '#7fe3ff', pal.accent[0]]); p.set(xx, yy, c); p.set(xx + 1, yy, shadeHex(c, -0.3)); p.set(xx, yy - 1, shadeHex(c, 0.5)); }
    minecart(p, x + 22, y - 3, rng, pal);
    // pickaxe leaning
    for (let k = 0; k < 14; k++) p.set(x - 18 + Math.round(k * 0.35), y - k, '#8a5a33');
    p.rect(x - 16, y - 16, 9, 2, '#9aa3b2'); p.set(x - 17, y - 15, '#5b6170');
  },
  monster(p, x, y, b, rng) { bones(p, x - 18, y - 2, rng); bones(p, x + 14, y - 1, rng); for (let k = 0; k < 3; k++) for (let i = 0; i < 9; i++) p.set(x - 30 + k * 4 + i * 0.5, y - 40 + i, '#2a1a14'); },
  elite(p, x, y, b, rng) { skull(p, x, y - 1, '#ff5af0'); bones(p, x - 20, y - 2, rng); bones(p, x + 18, y - 2, rng); for (let k = 0; k < 18; k++) p.set(x + 30, y - 50 + k, '#7a2a3a'); for (let k = 0; k < 12; k++) p.set(x + 31, y - 50 + k, '#a83a4a'); },
  boss(p, x, y, b, rng, pal) {
    for (const sx of [-48, 40]) { p.rect(x + sx, y - 64, 10, 64, OUT); p.rect(x + sx + 1, y - 63, 8, 63, pal.rock[3]); p.rect(x + sx + 1, y - 63, 2, 63, pal.rock[4]); skull(p, x + sx + 5, y - 66, pal.glow); }
    p.rect(x - 22, y - 34, 45, 34, OUT); p.rect(x - 21, y - 33, 43, 33, pal.rock[1]);
    for (let k = 0; k < 6; k++) p.rect(x - 18 + k * 7, y - 30, 3, 30, pal.rock[0]);
    p.set(x - 5, y - 22, pal.glow); p.set(x + 5, y - 22, pal.glow); p.set(x - 5, y - 21, pal.glow2 || pal.glow); p.set(x + 5, y - 21, pal.glow2 || pal.glow);
  },
  treasure(p, x, y, b, rng) {
    chest(p, x, y, true);
    for (let k = 0; k < 22; k++) { const xx = x - 22 + rng.int(0, 44); const h = rng.int(0, 3); p.set(xx, y - 1 - h, '#ffd23a'); if (h > 1) p.set(xx, y - 2 - h, '#fff0a0'); }
    p.set(x + 6, y - 15, '#ffffff'); p.set(x + 5, y - 14, '#fff0a0'); p.set(x + 7, y - 14, '#fff0a0');
  },
  merchant(p, x, y, b, rng) {
    p.rect(x - 16, y - 14, 33, 14, OUT); p.rect(x - 15, y - 13, 31, 12, '#8a5a33'); p.rect(x - 15, y - 13, 31, 2, '#a8703f');
    for (let i = 0; i < 6; i++) p.rect(x - 18 + i * 6, y - 26, 6, 5, i % 2 ? '#f0e0c8' : '#c83a3a');
    beam(p, x - 17, y - 26, y - 14, '#6a4a2a'); beam(p, x + 15, y - 26, y - 14, '#6a4a2a');
    for (let i = 0; i < 5; i++) p.rect(x - 12 + i * 6, y - 17, 3, 3, ['#ffc83a', '#7fe3ff', '#c08aff', '#ff6a5a', '#9aa3b2'][i]);
    lantern(p, x + 20, y - 24, '#ffd890');
  },
  event(p, x, y, b, rng, pal) {
    p.rect(x - 9, y - 30, 19, 30, OUT); p.rect(x - 8, y - 29, 17, 29, '#3a2a4a');
    for (let k = 0; k < 4; k++) p.rect(x - 6, y - 26 + k * 7, 13, 2, '#5a3a7a');
    p.set(x, y - 33, '#c08aff'); p.set(x - 1, y - 34, '#e0b8ff'); p.set(x + 1, y - 34, '#e0b8ff'); p.set(x, y - 35, '#ffffff');
    for (let k = 0; k < 6; k++) p.set(x - 12 + rng.int(0, 24), y - 10 - rng.int(0, 30), '#c08aff');
  },
  camp(p, x, y) { tent(p, x + 20, y, '#8a9a6a'); fire(p, x - 8, y); for (let i = 0; i < 9; i++) p.set(x - 24 + i, y - 2, '#6a3a1a'); },
};
