// Painted pixel-art stage layers. paintStage(kind, region, geo, opts) paints every layer of a 2D stage
// at 1:1 virtual-pixel density for its depth and returns canvases + metadata (lights, flames, shafts).
// Lighting follows a firelit-illustration recipe: warm orange key pools from fires and lanterns that
// fall off through rich browns into deep, saturated teal-blue shadow; every surface is shaded with
// its own ramp (lit side, core shadow, reflected light) and rim-lit where it faces a light.
import { Img, hp, mixp, qt, bayer, hash, wob, noiseTile, nsf, material, Shade, mixHex, blobPts } from './backdrop_kit.js';
import { rockMass, stalactites, boulder, farRanges, halo, godRay, paintGround, slab } from './backdrop_rock.js';
import * as P from './backdrop_props.js';

// ---------------------------------------------------------------------------- region art direction
// shadow: [ink, core shadow, shadow, reflected] — always a saturated teal-blue family.
const STYLE = [
  { name: 'hollowdeep', rockL: '#86603e', groundL: '#7a5a3c', stoneL: '#8a6a4a', mossL: '#6a8a3a', woodL: '#9a6a3a',
    shadow: ['#050f14', '#0b2a34', '#123f4a', '#1c5a62'], key: '#ff8a2a', keyHi: '#ffc070', rimC: '#ffe2a2', acc: '#ffb050',
    sky: ['#02070a', '#08212a', '#103640'], farL: '#2a5058', glowC: '#ff9a40', fog: '#0c2630', gem: '#ffc83a', mossAmt: 0.35 },
  { name: 'prism', rockL: '#7a6aa0', groundL: '#5e5a86', stoneL: '#8478aa', mossL: '#4a8aa0', woodL: '#8a5a3a',
    shadow: ['#040a1a', '#0a2040', '#123460', '#1c4e7e'], key: '#ff9a4a', keyHi: '#ffc88a', rimC: '#f0e8ff', acc: '#6ad8ff',
    sky: ['#02040e', '#081a38', '#0e2c52'], farL: '#2a4a78', glowC: '#6ad8ff', fog: '#0a1e3a', gem: '#9ae8ff', mossAmt: 0.12 },
  { name: 'sporewood', rockL: '#5a7258', groundL: '#4e6a40', stoneL: '#6a7a5a', mossL: '#7aa83a', woodL: '#7a5a34',
    shadow: ['#03100e', '#082a26', '#0e3e38', '#16584c'], key: '#ff9a40', keyHi: '#ffd080', rimC: '#e8ffd0', acc: '#5af0c8',
    sky: ['#010605', '#06201a', '#0c3428'], farL: '#1e4a40', glowC: '#5af0c8', fog: '#082620', gem: '#d8ff8a', mossAmt: 0.75 },
  { name: 'sunken', rockL: '#a8845a', groundL: '#9a7a52', stoneL: '#b4946a', mossL: '#7a8a3a', woodL: '#8a5a34',
    shadow: ['#06121a', '#0e2e3a', '#164452', '#205e66'], key: '#ff9a3a', keyHi: '#ffd890', rimC: '#fff0c0', acc: '#4affe0',
    sky: ['#03080a', '#0c2630', '#163c44'], farL: '#305a5a', glowC: '#ffc070', fog: '#0e2a32', gem: '#4affe0', mossAmt: 0.22 },
  { name: 'emberdeep', rockL: '#5e4038', groundL: '#4e3630', stoneL: '#6a4a40', mossL: '#8a4a1a', woodL: '#6a4428',
    shadow: ['#04070f', '#0a1628', '#10243c', '#183650'], key: '#ff7a24', keyHi: '#ffb850', rimC: '#ffd890', acc: '#ff5a1a',
    sky: ['#020306', '#0c0e1c', '#2a1410'], farL: '#24283a', glowC: '#ff6a1a', fog: '#0c1220', gem: '#ffb43a', mossAmt: 0 },
  { name: 'tomb', rockL: '#6e6484', groundL: '#5a5270', stoneL: '#7a7090', mossL: '#4a5a7a', woodL: '#6a4a34',
    shadow: ['#040a14', '#0a1c2e', '#102c44', '#18405c'], key: '#ff9a48', keyHi: '#ffcc88', rimC: '#ffe8c8', acc: '#d070ff',
    sky: ['#02040a', '#0a1628', '#14243c'], farL: '#2a3450', glowC: '#d070ff', fog: '#0a1626', gem: '#e0a0ff', mossAmt: 0.05 },
];
for (const S of STYLE) { // convenience fields used by the stage builder
  S.light = S.key; S.rim = S.rimC; S.skyTop = S.sky[0]; S.skyMid = S.sky[1];
  S.rock = [S.shadow[0], S.shadow[1], S.shadow[2], S.rockL, mixHex(S.rockL, S.keyHi, 0.4)];
  S.accents = [S.acc, S.gem, S.key];
}
export const stageStyle = (ri) => STYLE[ri] || STYLE[0];

/** Materials for a layer (fade pushes them toward the shadow colour for distance). */
export function context(S, fade = 0) {
  const cache = new Map();
  const fog = S.shadow[2];
  const mat = (hex) => { let m = cache.get(hex); if (!m) { m = material(hex, S, fade ? { fade, fog } : {}); cache.set(hex, m); } return m; };
  return {
    mat,
    M: { rock: mat(S.rockL), stone: mat(S.stoneL), ground: mat(S.groundL), moss: mat(S.mossL), wood: mat(S.woodL), iron: mat('#70747e'), rope: mat('#c0a070'), bone: mat('#dccfb0'), gold: mat('#d8a840') },
  };
}

const cache = new Map();

// ---------------------------------------------------------------------------- layers
function mkLayer(g) {
  const w = Math.max(2, Math.round((g.x1 - g.x0) * g.ppu)), h = Math.max(2, Math.round((g.y1 - g.y0) * g.ppu));
  return { g, img: new Img(w, h), glow: new Img(w, h), px: (x) => (x - g.x0) * g.ppu, py: (y) => (g.y1 - y) * g.ppu, w, h };
}
const toPx = (L, l) => ({ x: L.px(l.x), y: L.py(l.y), z: (l.z ?? 0.4) * L.g.ppu, r: l.r * L.g.ppu, s: l.s, acc: !!l.acc });
const used = (img) => { for (let i = 0; i < img.d.length; i += 5) if (img.d[i]) return true; return false; };

// ---------------------------------------------------------------------------- FAR
function paintFar(L, ri, kind, seed, S) {
  const base = L.py(-0.4);
  const C = { img: L.img, glow: L.glow, sh: null, ...context(S, 0.55) };
  const pieces = [];
  const n = Math.max(3, Math.round(L.w / 230));
  for (let i = 0; i < n; i++) pieces.push({ x: (i + 0.25 + hash(i, 1, seed) * 0.5) * (L.w / n), s: 0.7 + hash(i, 2, seed) * 0.6, i });
  const glows = pieces.map((p) => ({ x: p.x, y: base - 40 * p.s, r: 70 + 60 * p.s, c: hp(mixHex(S.glowC, S.sky[1], 0.45)), s: ri === 3 ? 0.5 : 0.62 }));
  if (kind === 'campfire') glows.push({ x: L.px(0), y: L.py(0.5), r: 260, c: hp(mixHex('#ff8a2a', S.sky[1], 0.4)), s: 0.7 });
  const tones = [mixHex(S.sky[1], S.farL, 0.45), mixHex(S.shadow[1], S.farL, 0.5), mixHex(S.shadow[1], S.farL, 0.3)].map((c) => hp(c));
  farRanges(L.img, { sky: S.sky.map((c) => hp(c)), tones, rim: hp(mixHex(S.glowC, S.farL, 0.35)), glows, ground: L.py(-0.2), seed: seed + 11, density: kind === 'corridor' ? 0.75 : 1 });
  C.sh = new Shade(pieces.map((p) => ({ x: p.x, y: base - 30 * p.s, z: 20, r: 110 * p.s, s: 0.9, acc: ri > 0 && ri !== 3 })), { lift: 0.2 });
  for (const p of pieces) {
    const x = p.x, sd = seed + p.i * 7;
    if (ri === 0) { P.timberFrame(C, x, base, 40 * p.s, 70 * p.s, sd); P.timberFrame(C, x, base - 66 * p.s, 34 * p.s, 50 * p.s, sd + 1); P.lantern(C, x + 12 * p.s, base - 62 * p.s, 0.6, '#ffb050'); }
    else if (ri === 1) P.crystalCluster(C, x, base, 26 * p.s, mixHex(S.accents[p.i % 2], S.sky[1], 0.25), sd);
    else if (ri === 2) P.giantMushroom(C, x, base, 80 * p.s, mixHex(['#a03a4a', '#c06a3a', '#7a3a8a'][p.i % 3], S.sky[1], 0.35), S.acc, sd);
    else if (ri === 3) { if (p.i % 2) P.archway(C, x, base, 60 * p.s, 90 * p.s, C.M.stone, sd, null); else P.column(C, x, base, 14 * p.s, 90 * p.s, C.M.stone, hash(sd, 1, 1) > 0.5, sd); }
    else if (ri === 4) { P.basaltColumns(C, x - 26 * p.s, base, 52 * p.s, 70 * p.s, C.M.rock, sd); P.lavaFall(C, x + 30 * p.s, L.py(5) + hash(sd, 4, 4) * 40, base, 2.5 * p.s, sd); }
    else if (ri === 5) P.archway(C, x, base, 70 * p.s, 110 * p.s, C.M.stone, sd, '#d070ff');
  }
}

// ---------------------------------------------------------------------------- MID (transparent)
function paintMid(L, ri, kind, seed, S) {
  const C = { img: L.img, glow: L.glow, sh: null, ...context(S, 0.3) };
  const nt = noiseTile(seed + 70, 4, 4);
  const top = (x) => L.py(2.0 + nsf(nt, x * 0.03, 3) * 3.8 + Math.sin(x * 0.006 + seed) * 1.1);
  const ceil = (x) => L.py(9.6 - nsf(nt, x * 0.02, 9) * 2.2);
  const base = L.py(-0.1);
  const count = Math.max(2, Math.round(L.w / 380));
  const pieces = [];
  for (let i = 0; i < count; i++) pieces.push({ x: (i + 0.25 + hash(i, 1, seed) * 0.5) * (L.w / count), i });
  const lights = pieces.map((p) => ({ x: p.x + (ri === 0 ? 40 : 0), y: base - (ri === 0 ? 120 : 50), z: 30, r: 150, s: 0.9, acc: ri !== 0 && ri !== 3 }));
  lights.push({ x: L.w * 0.3, y: L.py(3), z: 260, r: L.w * 0.45, s: 0.35 });
  C.sh = new Shade(lights, { lift: 0.15 });
  rockMass(L.img, C.sh, C.M.rock, { top, ceil, size: 58, seed: seed + 5, moss: S.mossAmt > 0.2 ? C.M.moss : null, mossAmt: S.mossAmt * 0.8, strata: ri === 3 ? 0.6 : 0.3, simple: true, yMax: L.py(2.6) }); // lower rows always hide behind the wall
  stalactites(L.img, C.sh, C.M.rock, { ceil, seed: seed + 3, len: 50, wid: 8, gap: 40 });
  for (const p of pieces) {
    const x = p.x, sd = seed + p.i * 13;
    if (ri === 0) { P.timberFrame(C, x, base, 120, 150, sd); P.lantern(C, x + 40, base - 150, 1, '#ffb050'); }
    else if (ri === 1) P.crystalCluster(C, x, base, 42 + hash(sd, 2, 2) * 26, S.accents[p.i % 2], sd);
    else if (ri === 2) P.giantMushroom(C, x, base, 130 + hash(sd, 2, 2) * 70, ['#b03a4a', '#d07a3a', '#7a3a8a'][p.i % 3], S.acc, sd);
    else if (ri === 3) { if (p.i % 2) P.archway(C, x, base, 110, 170, C.M.stone, sd, '#4affe0'); else P.column(C, x, base, 24, 190, C.M.stone, hash(sd, 3, 3) > 0.6, sd, '#c8a040'); }
    else if (ri === 4) { P.basaltColumns(C, x - 50, base, 100, 150, C.M.rock, sd); P.lavaFall(C, x + 70, Math.max(0, top(x) - 30), base, 6, sd); }
    else if (ri === 5) { P.archway(C, x, base, 120, 210, C.M.stone, sd, '#d070ff'); P.banner(C, x - 20, base - 190, 40, 90, '#4a1a5a', '#c8a040', sd); }
  }
  void kind;
}

// ---------------------------------------------------------------------------- MAIN wall (transparent where it opens)
function paintWall(L, ri, kind, seed, opts, pl) {
  const S = STYLE[ri];
  const C = { img: L.img, glow: L.glow, sh: new Shade(pl.lights.map((l) => toPx(L, l))), ...context(S) };
  const nt = noiseTile(seed + 90, 4, 4);
  const closed = kind === 'corridor' && ['crawl', 'tunnel', 'minecart', 'flooded'].includes(opts.tunnel || 'tunnel');
  const ppu = L.g.ppu;
  const topAt = (x) => L.py(pl.wallTop(x / ppu + L.g.x0)) + (nsf(nt, x * 0.05, 1) - 0.5) * 18;
  const ceilAt = (x) => L.py(pl.ceilY(x / ppu + L.g.x0)) + (nsf(nt, x * 0.04, 7) - 0.5) * 22;
  const size = Math.round(ppu * (ri === 3 ? 0.95 : 0.8));
  const gem = hp(S.gem);
  const rm = { size, seed: seed + 1, moss: C.M.moss, mossAmt: S.mossAmt, strata: ri === 3 ? 0.5 : 0.25, gem, gemAmt: 0.06, glow: L.glow };
  if (closed) rockMass(L.img, C.sh, C.M.rock, { ...rm, full: true });
  else rockMass(L.img, C.sh, C.M.rock, { ...rm, top: topAt, ceil: ceilAt });
  // a tunnel's ceiling lip: an overhang of down-facing slabs with stalactites
  const cy = closed ? (x) => L.py(pl.ceilY(x / ppu + L.g.x0)) + (nsf(nt, x * 0.04, 7) - 0.5) * 14 : ceilAt;
  if (closed) {
    const lipF = [[0, 0.75, 0.66], [-0.6, 0.45, 0.66], [0.6, 0.45, 0.66], [0, 0.2, 1]];
    let x = -10, k = 0;
    while (x < L.w + 10) {
      const rx = size * (0.5 + hash(k, 1, seed) * 0.6), ry = size * (0.28 + hash(k, 2, seed) * 0.2), sd = seed * 7 + k * 31;
      slab(L.img, C.sh, C.M.rock, blobPts(x + rx, cy(x + rx) - ry * 0.4, rx, ry, sd, { rough: 0.6, n: 8 }), { seed: sd, F: lipF, mott: 0.5 });
      x += rx * 1.4; k++;
    }
  }
  stalactites(L.img, C.sh, C.M.rock, { ceil: (x) => cy(x) + (closed ? 6 : 2), seed: seed + 8, len: Math.round(ppu * 0.9), wid: Math.round(ppu * 0.12), gap: Math.round(ppu * 0.4), tip: ri === 1 ? hp('#9ae8ff') : ri === 0 || ri === 2 ? hp('#bfe8f0') : null, glow: L.glow });
  // boulders and rubble at the foot of the wall
  const foot = L.py(0.02);
  for (let k = 0; k < Math.round(L.w / (ppu * 2.6)); k++) {
    const x = (k + hash(k, 3, seed)) * ppu * 2.6, wx = x / ppu + L.g.x0;
    if (opts.gap && wx > opts.gap[0] - 1 && wx < opts.gap[1] + 1) continue;
    boulder(L.img, C.sh, C.M.rock, x, foot, ppu * (0.18 + hash(k, 4, seed) * 0.32), seed + k * 17, { moss: S.mossAmt > 0.1 ? C.M.moss : null, mossAmt: S.mossAmt });
  }
  return C;
}

// ---------------------------------------------------------------------------- dressing
function dressWall(L, C, ri, seed, feats) {
  const S = STYLE[ri];
  const ppu = L.g.ppu;
  const flames = [];
  for (const f of feats) {
    const x = L.px(f.x ?? 0), y = L.py(f.y ?? 0), sd = seed + Math.round((f.x ?? 0) * 13);
    switch (f.t) {
      case 'timber': P.timberFrame(C, x, y, (f.w || 2.6) * ppu, (f.h || 3.2) * ppu, sd); break;
      case 'lantern': P.lantern(C, x, y, f.s || 1.6, f.c || '#ffb050'); break;
      case 'sconce': P.sconce(C, x, y, f.s || 1.6); flames.push({ x: f.x, y: f.y + 0.02, s: f.fs || 1, c: f.c || 'fire' }); break;
      case 'crystal': P.crystalCluster(C, x, y, (f.size || 0.8) * ppu, f.c || S.acc, sd); break;
      case 'mushroom': P.giantMushroom(C, x, y, (f.h || 2.6) * ppu, f.c || '#b03a4a', f.g || S.acc, sd); break;
      case 'shrooms': P.smallMushrooms(C, x, y, f.n || 5, f.g || S.acc, sd); break;
      case 'column': P.column(C, x, y, (f.w || 0.42) * ppu, (f.h || 3.4) * ppu, C.M.stone, !!f.broken, sd, '#d8a840'); break;
      case 'arch': P.archway(C, x, y, (f.w || 2.4) * ppu, (f.h || 3.2) * ppu, C.M.stone, sd, f.key || null); break;
      case 'runes': P.runePanel(C, x - ((f.w || 1) * ppu) / 2, y - (f.h || 1.2) * ppu, (f.w || 1) * ppu, (f.h || 1.2) * ppu, C.M.stone, f.c || '#4affe0', sd); break;
      case 'basalt': P.basaltColumns(C, x - ((f.w || 1.6) * ppu) / 2, y, (f.w || 1.6) * ppu, (f.h || 2.4) * ppu, C.M.rock, sd); break;
      case 'lava': P.lavaFall(C, x, L.py(f.top ?? 4), y, (f.w || 0.1) * ppu, sd); break;
      case 'banner': P.banner(C, x - ((f.w || 0.6) * ppu) / 2, y - (f.h || 1.6) * ppu, (f.w || 0.6) * ppu, (f.h || 1.6) * ppu, f.c || '#4a1a5a', f.e || '#c8a040', sd); break;
      case 'chain': P.chain(C, x, L.py(f.top ?? 6), y); break;
      case 'brazier': P.brazier(C, x, y, f.s || 1.8); flames.push({ x: f.x, y: (f.y ?? 0) + (18 * (f.s || 1.8)) / ppu + 0.02, s: f.fs || 1.2, c: f.c || 'purple' }); break;
      case 'sarcophagus': P.sarcophagus(C, x - ((f.w || 1.6) * ppu) / 2, y - (f.h || 0.9) * ppu, (f.w || 1.6) * ppu, (f.h || 0.9) * ppu, C.M.stone, f.trim || '#c8a040', sd); break;
      case 'skulls': P.skullPile(C, x, y, f.n || 4, sd); break;
      case 'tent': P.tent(C, x - ((f.w || 1.8) * ppu) / 2, y, (f.w || 1.8) * ppu, (f.h || 1.4) * ppu, f.c || '#8a9a6a', sd); break;
      case 'crate': P.crate(C, x - ((f.w || 0.5) * ppu) / 2, y, (f.w || 0.5) * ppu, (f.h || 0.45) * ppu, sd); break;
      case 'barrel': P.barrel(C, x, y, (f.w || 0.4) * ppu, (f.h || 0.55) * ppu, sd); break;
      case 'sack': P.sack(C, x, y, (f.w || 0.4) * ppu, (f.h || 0.4) * ppu, f.c); break;
      case 'stall': P.stall(C, x - ((f.w || 2.4) * ppu) / 2, y, (f.w || 2.4) * ppu, (f.h || 2.2) * ppu, f.c1, f.c2, sd); break;
      case 'roots': P.roots(C, x, L.py(f.top ?? 6), (f.len || 2) * ppu, f.c || '#5a3a22', f.g, sd); break;
      case 'bedroll': P.bedroll(C, x, y, (f.w || 0.9) * ppu, f.c || '#a83a3a', sd); break;
      case 'line': P.clothesLine(C, L.px(f.x0), L.px(f.x1), y, sd); break;
      case 'boulder': boulder(L.img, C.sh, C.M.rock, x, y, (f.r || 0.5) * ppu, sd, { moss: C.M.moss, mossAmt: S.mossAmt }); break;
      case 'mine': mineMouth(L, C, x, y, (f.w || 1.8) * ppu, (f.h || 2.2) * ppu, sd); break;
      case 'recess': recess(L, C, f, sd); break;
      default: break;
    }
  }
  return flames;
}

/** Tunnel mouth: a deep opening (teal falloff, rails vanishing inside), timber frame, lantern. */
function mineMouth(L, C, x, y, w, h, seed) {
  const D = C.M.rock.w;
  const pts = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * Math.PI; pts.push([x + Math.cos(a) * w * 0.5 * (0.95 + wob(i, seed) * 0.1), y - h + w * 0.3 + Math.sin(a) * w * 0.3]); }
  pts.push([x + w * 0.5, y], [x - w * 0.5, y]);
  const minX = Math.floor(x - w / 2 - 2), minY = Math.floor(y - h - 2);
  const mk = new Img(Math.ceil(w) + 5, Math.ceil(h) + 5);
  mk.poly(pts.map(([px, py]) => [px - minX, py - minY]), (px, py) => {
    const k = 1 - Math.abs(px + minX - x) / (w / 2), v = (py + minY - (y - h)) / h;
    return D[qt(0.2 + k * 0.4 + v * 1.4, px, py, 3)];
  });
  for (let yy = Math.round(y - h * 0.3); yy < y; yy++) { // rails running into the dark
    const v = (yy - (y - h * 0.3)) / (h * 0.3);
    for (const s of [-1, 1]) mk.set(Math.round(x + s * w * (0.06 + v * 0.18)) - minX, yy - minY, C.M.iron.w[qt(1.5 + v * 3, 0, yy, 9)]);
    if (yy % 3 === 0) for (let xx = -w * (0.1 + v * 0.22); xx < w * (0.1 + v * 0.22); xx++) mk.set(Math.round(x + xx) - minX, yy - minY, C.M.wood.w[Math.round(1 + v * 3)]);
  }
  L.img.draw(mk, minX, minY);
  P.timberFrame(C, x, y, w + 18, h + 8, seed + 9);
  P.lantern(C, x + w / 2 + 10, y - h + 4, 1.4, '#ffb050');
}

/** Framed recess for the mining grid (world rect f.x0..f.x1, f.y0..f.y1). */
function recess(L, C, f, seed) {
  const x0 = Math.round(L.px(f.x0)), x1 = Math.round(L.px(f.x1)), y0 = Math.round(L.py(f.y1)), y1 = Math.round(L.py(f.y0));
  const D = C.M.rock.w;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const e = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
    L.img.set(x, y, D[e < 3 ? 0 : e < 8 ? 1 : qt(1.2 + (hash(x >> 2, y >> 2, seed) - 0.5) * 1.2, x, y, 3)]);
  }
  const fw = Math.max(10, Math.round(L.g.ppu * 0.14));
  const W = C.M.wood;
  P.plank(C, W, [x0 - fw / 2, y1 + fw], [x0 - fw / 2 + 1, y0 - fw * 0.4], fw, seed + 1, { nails: [0.1, 0.9] });
  P.plank(C, W, [x1 + fw / 2, y1 + fw], [x1 + fw / 2 - 1, y0 - fw * 0.4], fw, seed + 2, { nails: [0.1, 0.9] });
  P.plank(C, W, [x0 - fw * 1.4, y0 - fw / 2], [x1 + fw * 1.4, y0 - fw / 2 + 1.5], fw * 1.1, seed + 3, { nails: [0.06, 0.94] });
  P.plank(C, W, [x0 - fw, y1 + fw / 2], [x1 + fw, y1 + fw / 2 - 1], fw * 0.9, seed + 4, { nails: [0.08, 0.92] });
}

// ---------------------------------------------------------------------------- feature plans per kind × region
function plan(kind, ri, opts) {
  const S = STYLE[ri];
  const feats = [];
  const lights = []; // world-space light sources {x,y,z,r,s,c,acc}
  const add = (o) => feats.push(o);
  const Lt = (x, y, r, s, c, acc = false, z = 0.4) => lights.push({ x, y, z, r, s, c: c || S.key, acc });
  let wallTop = (x) => 3.4 + Math.sin(x * 0.45 + ri) * 0.7;
  let ceilY = (x) => 6.2 + Math.sin(x * 0.3 + ri * 2) * 0.5;
  const regionDress = (xs) => {
    for (const x of xs) {
      const side = x < 0 ? -1 : 1;
      if (ri === 0) { add({ t: 'timber', x, w: 2.8, h: 3.3 }); add({ t: 'lantern', x: x + 0.9 * side, y: 3.25, s: 1.7 }); Lt(x + 0.9 * side, 2.85, 3.6, 1.15); add({ t: 'crate', x: x - 0.5 * side, w: 0.6, h: 0.5 }); }
      else if (ri === 1) { add({ t: 'crystal', x, size: 1.1, c: S.accents[Math.abs(Math.round(x * 7)) % 2] }); Lt(x, 0.8, 3.0, 1.0, S.acc, true, 0.6); add({ t: 'crystal', x: x + 0.9 * side, size: 0.5, c: S.acc }); }
      else if (ri === 2) { add({ t: 'mushroom', x, h: 3.0, c: ['#b03a4a', '#d07a3a', '#8a3a9a'][Math.abs(x | 0) % 3] }); add({ t: 'shrooms', x: x + 1.1, n: 5 }); Lt(x, 2.2, 3.2, 0.9, S.acc, true, 0.6); add({ t: 'roots', x: x - 1.2 * side, top: 5.6, len: 1.6, g: S.acc }); }
      else if (ri === 3) { add({ t: 'column', x, h: 3.8 }); add({ t: 'sconce', x: x + 0.9 * side, y: 2.1 }); Lt(x + 0.9 * side, 2.3, 3.6, 1.2); }
      else if (ri === 4) { add({ t: 'basalt', x, w: 1.8, h: 2.6 }); add({ t: 'lava', x: x + 1.3 * side, top: 5, w: 0.12 }); Lt(x + 1.3 * side, 1.0, 3.6, 1.2, '#ff5a1a', true, 0.5); }
      else if (ri === 5) { add({ t: 'banner', x, w: 0.7, h: 1.8, y: 2.0 }); add({ t: 'brazier', x: x + 0.8 * side, y: 0, s: 1.8 }); Lt(x + 0.8 * side, 0.7, 3.2, 1.15, S.acc, true, 0.5); }
    }
  };
  const keyFront = (x, s = 1.0) => Lt(x * 0.6, 0.8, 6.5, s * 0.6, S.key, false, 2.6); // the party's lantern / campfire off-screen
  if (kind === 'arena') {
    regionDress([-5.2, 5.4]);
    if (ri === 3) add({ t: 'runes', x: -2.4, y: 1.4, w: 1.1, h: 1.3, c: '#4affe0' });
    if (ri === 5) { add({ t: 'chain', x: -2.6, top: 6.6, y: 4.2 }); add({ t: 'chain', x: 2.3, top: 6.8, y: 4.6 }); add({ t: 'skulls', x: 3.6, n: 4 }); }
    if (ri === 0) add({ t: 'barrel', x: -6.8, w: 0.5, h: 0.65 });
    add({ t: 'boulder', x: 1.3, r: 0.42 });
    keyFront(-3.4, 1.05);
  } else if (kind === 'tomb') {
    wallTop = (x) => 5.6 - Math.abs(x) * 0.05; ceilY = () => 7.4;
    add({ t: 'arch', x: 0, w: 4.2, h: 4.6, key: '#d070ff' });
    add({ t: 'sarcophagus', x: 0, y: 0.05, w: 2.0, h: 1.0, trim: '#d070ff' });
    for (const s of [-1, 1]) { add({ t: 'column', x: s * 3.4, h: 4.6 }); add({ t: 'banner', x: s * 2.1, w: 0.8, h: 2.2, y: 3.6, c: '#3a1050' }); add({ t: 'brazier', x: s * 4.6, s: 2 }); add({ t: 'chain', x: s * 5.6, top: 7.2, y: 4.4 }); add({ t: 'skulls', x: s * 6.4, n: 5 }); Lt(s * 4.6, 0.9, 3.8, 1.2, S.acc, true, 0.5); }
    for (const s of [-1, 1]) { add({ t: 'sconce', x: s * 1.4, y: 2.6 }); Lt(s * 1.4, 2.8, 3.2, 1.0); }
    Lt(0, 1.6, 4, 0.8, '#ff5af0', true, 0.6);
    keyFront(-3.6, 0.9);
  } else if (kind === 'room') {
    const room = opts.room || 'event';
    regionDress([-5.4, 5.6]);
    if (room === 'merchant') { add({ t: 'stall', x: 0.9, w: 2.8, h: 2.4, c1: '#c83a2a', c2: '#f0e0c0' }); add({ t: 'lantern', x: 2.4, y: 2.7, s: 1.6, c: '#ffc070' }); Lt(2.4, 2.3, 3.6, 1.2); add({ t: 'sack', x: -1.6, w: 0.5, h: 0.5 }); add({ t: 'sack', x: -1.15, w: 0.4, h: 0.38, c: '#a08a5a' }); add({ t: 'barrel', x: 2.9, w: 0.5, h: 0.65 }); }
    else if (room === 'treasure') { add({ t: 'crate', x: -3.2, w: 0.7, h: 0.6 }); add({ t: 'barrel', x: 3.4, w: 0.5, h: 0.6 }); add({ t: 'skulls', x: 2.4, n: 3 }); Lt(0, 3.2, 4.6, 0.8, '#ffd890', false, 1.2); }
    else if (room === 'camp') { add({ t: 'tent', x: 3.2, w: 2.2, h: 1.6, c: '#7a8a5a' }); add({ t: 'crate', x: -3.0 }); add({ t: 'sack', x: -2.4 }); add({ t: 'bedroll', x: 1.6, w: 0.9, c: '#a83a3a' }); Lt(0, 0.5, 5.0, 1.4, '#ff9a40', false, 2.0); }
    else { if (ri === 3 || ri === 5) add({ t: 'runes', x: 0.6, y: 1.0, w: 1.2, h: 1.4, c: ri === 5 ? '#d070ff' : '#4affe0' }); else add({ t: 'arch', x: 0.6, w: 1.8, h: 2.6 }); Lt(0.6, 1.6, 3.4, 0.8, S.acc, true, 0.8); }
    keyFront(-3.0, 0.95);
  } else if (kind === 'wall') {
    wallTop = () => 9; ceilY = () => 9.5;
    const g = opts.grid;
    add({ t: 'recess', x0: g.x0 - 0.06, x1: g.x1 + 0.06, y0: g.y0 - 0.06, y1: g.y1 + 0.06 });
    if (ri === 0) { add({ t: 'lantern', x: g.x1 + 0.55, y: g.y1 + 0.1, s: 1.5 }); Lt(g.x1 + 0.55, g.y1 - 0.25, 3.2, 1.2); add({ t: 'timber', x: -3.4, w: 1.8, h: 3.2 }); add({ t: 'timber', x: 3.5, w: 1.8, h: 3.2 }); }
    else if (ri === 1) { add({ t: 'crystal', x: -2.0, size: 0.9, c: '#6ad8ff' }); add({ t: 'crystal', x: 2.1, size: 1.0, c: '#9ae8ff' }); Lt(-2, 0.8, 3.2, 1.0, S.acc, true, 0.6); Lt(2.1, 0.8, 3.2, 1.0, S.acc, true, 0.6); }
    else if (ri === 2) { add({ t: 'mushroom', x: -2.6, h: 2.6, c: '#b03a4a' }); add({ t: 'shrooms', x: 1.9, n: 6 }); add({ t: 'roots', x: 0.3, top: 4.4, len: 1.1, g: S.acc }); Lt(-2.6, 1.8, 3.2, 0.9, S.acc, true, 0.6); }
    else if (ri === 3) { add({ t: 'column', x: -2.2, h: 3.4 }); add({ t: 'column', x: 2.2, h: 3.4, broken: true }); add({ t: 'sconce', x: 1.45, y: 2.4 }); Lt(1.45, 2.5, 3.2, 1.2); }
    else if (ri === 4) { add({ t: 'basalt', x: -2.6, w: 1.4, h: 2.2 }); add({ t: 'lava', x: 2.2, top: 4.6, w: 0.1 }); Lt(2.2, 1.2, 3.4, 1.2, '#ff5a1a', true, 0.5); }
    else { add({ t: 'brazier', x: -1.9, s: 1.7 }); add({ t: 'brazier', x: 1.9, s: 1.7 }); add({ t: 'chain', x: -1.4, top: 4.8, y: 3.4 }); add({ t: 'chain', x: 1.3, top: 4.8, y: 3.3 }); Lt(-1.9, 0.8, 3, 1.1, S.acc, true, 0.5); Lt(1.9, 0.8, 3, 1.1, S.acc, true, 0.5); }
    Lt(-0.6, 1.0, 5.5, 1.0, S.key, false, 3.0); // the miner's lamp
  } else if (kind === 'campfire') {
    // a cosy camp around the walls of a round cavern (arc-length x; 0 = behind the fire)
    wallTop = (x) => 3.4 + Math.cos(x * 0.5) * 0.5 + Math.sin(x * 0.23) * 0.6; ceilY = (x) => 6.0 + Math.sin(x * 0.17) * 0.5;
    const mx = opts.mineX ?? 3.6;
    add({ t: 'mine', x: mx, w: 1.7, h: 2.1 });
    add({ t: 'tent', x: -3.3, w: 2.6, h: 1.9, c: '#a0804a' });
    add({ t: 'tent', x: -9.5, w: 2.2, h: 1.6, c: '#6a7a8a' });
    add({ t: 'line', x0: -6.6, x1: -4.8, y: 2.0 });
    add({ t: 'crate', x: -1.6, w: 0.6, h: 0.5 }); add({ t: 'crate', x: -1.05, w: 0.45, h: 0.4 }); add({ t: 'sack', x: 1.3, w: 0.5, h: 0.5 }); add({ t: 'barrel', x: 2.1, w: 0.48, h: 0.62 });
    add({ t: 'bedroll', x: -5.6, w: 1.0, c: '#a83a3a' }); add({ t: 'bedroll', x: 7.4, w: 0.9, c: '#3a5aa0' });
    add({ t: 'timber', x: mx + 3.6, w: 2.2, h: 2.8 }); add({ t: 'lantern', x: mx + 3.0, y: 2.6, s: 1.5 });
    add({ t: 'crystal', x: -7.6, size: 0.9, c: '#6ad8ff' }); add({ t: 'crystal', x: 10.4, size: 0.8, c: '#9ae8ff' });
    add({ t: 'shrooms', x: 12.6, n: 6, g: '#5af0c8' }); add({ t: 'roots', x: -12.4, top: 5.2, len: 1.6, g: '#5af0c8' });
    add({ t: 'lantern', x: -2.4, y: 3.0, s: 1.6 }); add({ t: 'lantern', x: 0.9, y: 3.1, s: 1.5 });
    add({ t: 'barrel', x: 14.5, w: 0.5, h: 0.6 }); add({ t: 'crate', x: 15.4, w: 0.6, h: 0.5 }); add({ t: 'boulder', x: -14.8, r: 0.6 }); add({ t: 'boulder', x: 18.8, r: 0.5 });
    for (let x = -24; x <= 24; x += 8.5) Lt(x, 0.7, 7.5, 1.35, '#ff8a2a', false, 5.5); // the fire, seen from every side
    Lt(-2.4, 2.6, 2.6, 0.9); Lt(0.9, 2.7, 2.6, 0.8); Lt(mx + 3.0, 2.2, 2.6, 0.9);
    Lt(-7.6, 0.8, 2.6, 0.9, '#6ad8ff', true, 0.6); Lt(10.4, 0.8, 2.6, 0.9, '#6ad8ff', true, 0.6);
  } else if (kind === 'corridor') {
    const Lc = opts.length || 34, tun = opts.tunnel || 'tunnel';
    const enclosed = ['tunnel', 'minecart', 'crawl', 'flooded'].includes(tun);
    wallTop = enclosed ? () => 9 : (x) => 3.0 + Math.sin(x * 0.3) * 0.8;
    ceilY = tun === 'crawl' ? (x) => 2.6 + Math.sin(x * 0.5) * 0.25 : enclosed ? (x) => 3.45 + Math.sin(x * 0.35) * 0.3 + Math.sin(x * 1.3) * 0.08 : (x) => 5.4 + Math.sin(x * 0.25) * 0.5;
    const crawl = tun === 'crawl';
    for (let x = 2; x < Lc; x += 7 + (ri % 2)) {
      if (opts.gap && x > opts.gap[0] - 1 && x < opts.gap[1] + 1) continue;
      if (ri === 0) { add({ t: 'timber', x, w: 2.4, h: crawl ? 2.2 : 3.2 }); if ((x | 0) % 2 === 0) { add({ t: 'lantern', x: x + 0.6, y: crawl ? 2.1 : 3.1, s: 1.5 }); Lt(x + 0.6, crawl ? 1.75 : 2.75, 3.4, 1.15); } }
      else if (ri === 1) { add({ t: 'crystal', x, size: 0.7 + ((x * 3) % 5) * 0.08, c: S.accents[Math.abs(x | 0) % 2] }); Lt(x, 0.7, 3, 1.0, S.acc, true, 0.6); }
      else if (ri === 2) { add({ t: 'mushroom', x, h: crawl ? 1.8 : 2.6, c: ['#b03a4a', '#d07a3a', '#8a3a9a'][Math.abs(x | 0) % 3] }); add({ t: 'roots', x: x + 2.2, top: crawl ? 2.5 : 4.0, len: 1.3, g: S.acc }); Lt(x, 1.8, 3.0, 0.9, S.acc, true, 0.6); }
      else if (ri === 3) { add({ t: 'column', x, h: crawl ? 2.4 : 3.6, broken: (x | 0) % 3 === 0 }); add({ t: 'sconce', x: x + 1.2, y: 2.0 }); Lt(x + 1.2, 2.2, 3.4, 1.2); }
      else if (ri === 4) { add({ t: 'basalt', x, w: 1.4, h: 2.0 }); if ((x | 0) % 2) { add({ t: 'lava', x: x + 1.6, top: 4.0, w: 0.09 }); Lt(x + 1.6, 1.0, 3.2, 1.1, '#ff5a1a', true, 0.5); } }
      else { add({ t: 'banner', x, w: 0.6, h: 1.5, y: 2.6 }); add({ t: 'brazier', x: x + 1.5, s: 1.5 }); Lt(x + 1.5, 0.6, 3, 1.1, S.acc, true, 0.5); }
      if (hash(x | 0, 3, ri) > 0.55) add({ t: 'boulder', x: x + 3.4, r: 0.3 + hash(x | 0, 4, ri) * 0.25 });
    }
    // the walker carries a moving 3D lantern; a weak painted fill keeps the tunnel readable
  }
  return { feats, lights, wallTop, ceilY };
}

// ---------------------------------------------------------------------------- public
/**
 * geo: { far, mid, wall: {x0,x1,y0,y1,z,ppu}, ground: {x0,x1,z0,z1,y,ppuX,ppuZ} }
 * opts: { tunnel, room, length, grid:{x0,x1,y0,y1}, gap:[x0,x1], mineX, seed }
 */
export function paintStage(kind, ri, geo, opts = {}) {
  const key = [kind, ri, opts.tunnel || '', opts.room || '', opts.length || 0, opts.seed || 0, opts.gap ? opts.gap.join(',') : '', JSON.stringify(geo)].join('|');
  if (cache.has(key)) return cache.get(key);
  const seed = (opts.seed || 1) + ri * 101 + kind.length * 7;
  const S = STYLE[ri];
  const pl = plan(kind, ri, opts);
  const T = {};
  let t0 = performance.now();
  const lap = (k) => { const t = performance.now(); T[k] = Math.round(t - t0); t0 = t; };
  // an enclosed tunnel's wall fills the view: nothing behind it is ever seen
  const enclosed = kind === 'corridor' && ['crawl', 'tunnel', 'minecart', 'flooded'].includes(opts.tunnel || 'tunnel');
  const far = enclosed ? null : mkLayer(geo.far);
  if (far) paintFar(far, ri, kind, seed, S);
  lap('far');
  const mid = enclosed ? null : mkLayer(geo.mid);
  if (mid) paintMid(mid, ri, kind, seed, S);
  lap('mid');
  const wall = mkLayer(geo.wall);
  const C = paintWall(wall, ri, kind, seed, opts, pl);
  if (kind === 'corridor' && opts.gap) chasm(wall, C, opts.gap, ri, seed);
  lap('wall');
  const flames = dressWall(wall, C, ri, seed, pl.feats);
  lap('dress');
  // ground
  const gg = geo.ground;
  const gw = Math.round((gg.x1 - gg.x0) * gg.ppuX), gh = Math.round((gg.z1 - gg.z0) * gg.ppuZ);
  const iso = gg.ppuX / gg.ppuZ;
  const grd = { img: new Img(gw, gh), glow: new Img(gw, gh), w: gw, h: gh, iso };
  const gpx = (x) => (x - gg.x0) * gg.ppuX, gpz = (z) => (z - gg.z0) * gg.ppuZ;
  const lightZ = kind === 'campfire' ? null : geo.wall.z;
  const gl = pl.lights.filter(() => lightZ !== null).map((l) => ({ x: gpx(l.x), y: gpz(lightZ + (l.z ?? 0.4)) * iso, z: Math.max(0.15, l.y) * gg.ppuX, r: l.r * gg.ppuX, s: l.s, acc: l.acc }));
  if (kind === 'campfire') gl.push({ x: gpx(0), y: gpz(0) * iso, z: 0.6 * gg.ppuX, r: 7.5 * gg.ppuX, s: 1.7 });
  const gsh = new Shade(gl);
  const ctx = context(S);
  const flag = ri === 3 || ri === 5 || kind === 'tomb';
  paintGround(grd, gsh, {
    seed: seed + 2, M: ctx.M.ground, S: ctx.M.stone, moss: S.mossAmt > 0.1 ? ctx.M.moss : null, flag, sand: ri === 3 ? ctx.mat('#c8a470') : null,
    water: ['#06141c', '#0c2a36', '#16404c', '#2a6070'].map((c) => hp(mixHex(c, S.shadow[2], 0.3))), keyP: hp('#ffb45a'), accP: hp(mixHex(S.acc, '#ffffff', 0.2)),
    stones: flag ? 0.4 : ri === 4 ? 1.8 : 1.4, pebbles: ri === 4 ? 0.6 : 1, puddles: ri <= 2 ? Math.max(1, Math.round(gw / 500)) : ri === 3 ? 1 : 0,
    tufts: ri === 2 ? 2.2 : ri === 0 ? 0.5 : ri === 3 ? 0.4 : 0,
  });
  groundDetails(grd, gsh, ctx, ri, kind, seed);
  if ((kind === 'corridor' && (opts.tunnel === 'minecart' || (ri === 0 && !opts.gap))) || (kind === 'arena' && ri === 0)) rails(grd, gsh, ctx, kind === 'corridor' && opts.tunnel === 'minecart' ? gpz(0) : gpz(gg.z0 + 0.9), seed);
  if (opts.gap) for (let y = 0; y < gh; y++) for (let x = Math.floor(gpx(opts.gap[0])); x < gpx(opts.gap[1]); x++) { grd.img.set(x, y, 0); grd.glow.set(x, y, 0); }
  lap('ground');
  const shafts = [];
  if (ri === 3 || ri === 1 || (kind === 'room' && opts.room === 'treasure') || kind === 'tomb') {
    const sw = Math.round(3 * geo.wall.ppu), shh = Math.round(6.5 * geo.wall.ppu);
    const img = new Img(sw * 2, shh);
    godRay(img, sw * 0.8, 0, shh, sw * 0.18, sw * 0.55, 0.22, hp(ri === 1 ? '#5ac8e8' : kind === 'tomb' ? '#a060d0' : '#ffd890'), 0.42);
    const canvas = img.toCanvas();
    const xs = kind === 'arena' ? [-2.2, 3.1] : kind === 'corridor' ? [6, 19, 29] : [0];
    for (const x of xs) shafts.push({ canvas, x: x - 0.4, y: 7, w: (sw * 2) / geo.wall.ppu, h: shh / geo.wall.ppu, z: geo.wall.z + 0.5 });
  }
  const out = {
    far: far && { canvas: far.img.toCanvas(), glow: used(far.glow) ? far.glow.toCanvas() : null, g: geo.far },
    mid: mid && { canvas: mid.img.toCanvas(), glow: used(mid.glow) ? mid.glow.toCanvas() : null, g: geo.mid },
    wall: { canvas: wall.img.toCanvas(), glow: used(wall.glow) ? wall.glow.toCanvas() : null, g: geo.wall },
    ground: { canvas: grd.img.toCanvas(), glow: used(grd.glow) ? grd.glow.toCanvas() : null, g: gg },
    lights: pl.lights, flames, shafts, style: S, timing: T,
  };
  lap('canvas');
  cache.set(key, out);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return out;
}

/** Region-specific floor details: crystal shards, glowing lava cracks, scattered bones. */
function groundDetails(Gd, sh, ctx, ri, kind, seed) {
  const { img, glow, w, h, iso } = Gd;
  const flatSh = { near: () => [], idx: (x, y, nx, ny, nz) => sh.idx(x, y * iso, nx, ny, nz), col: (M, t, x, y) => sh.col(M, t, x, y), get ka() { return sh.ka; }, get kw() { return sh.kw; }, dir: [0, 0], att: 0, gain: 1 };
  const C = { img, glow, sh: flatSh, ...ctx };
  if (ri === 1) for (let i = 0; i < w / 60; i++) P.crystalCluster(C, hash(i, 1, seed) * w, (0.15 + hash(i, 2, seed) * 0.85) * h, 4 + hash(i, 3, seed) * 7, ['#6ad8ff', '#9ae8ff', '#b08aff'][i % 3], seed + i);
  if (ri === 4) for (let i = 0; i < w / 70; i++) {
    const sx = hash(i, 1, seed) * w, sy = hash(i, 2, seed) * h;
    let x = sx, y = sy, dir = (hash(i, 3, seed) - 0.5) * 0.6;
    for (let k = 0; k < 26 + hash(i, 4, seed) * 30; k++) {
      const c = hp(k % 6 === 0 ? '#ffe08a' : k % 2 ? '#ff6a1a' : '#ff8a2a');
      img.set(x, y, c); glow.set(x, y, c); img.set(x, y + 1, hp('#3a0c04'));
      dir += (wob(k * 0.5, seed + i) - 0.5) * 0.9;
      x += Math.cos(dir) * 1.3; y += Math.sin(dir) * 0.5;
    }
    halo(glow, sx, sy, 26, hp('#2a0a02'), 0.7, 0.5);
  }
  if (ri === 5 || kind === 'tomb') for (let i = 0; i < w / 160; i++) P.skullPile(C, hash(i, 1, seed) * w, (0.3 + hash(i, 2, seed) * 0.6) * h, 1 + Math.floor(hash(i, 3, seed) * 2), seed + i);
}

/** Mine rails across the floor: hand-cut ties of varied length/tone, iron rails with a lit top edge. */
function rails(Gd, sh, ctx, row, seed) {
  const { img, w, iso } = Gd;
  const W = ctx.M.wood, I = ctx.M.iron;
  const y = Math.round(row);
  for (let x = 3, k = 0; x < w; x += 12 + Math.round(hash(k, 1, seed) * 4), k++) {
    const len = 7 + hash(k, 2, seed) * 3, tw = 5, skew = (hash(k, 3, seed) - 0.5) * 2;
    for (let q = -Math.round(len); q <= len; q++) for (let a = 0; a < tw; a++) {
      const px = Math.round(x + a + skew * (q / len)), py = y + q;
      const t = sh.idx(px, py * iso, 0, 0.3, 0.95) + (a === 0 ? 0.7 : a === tw - 1 ? -0.8 : 0) + (hash(px, py >> 1, seed) - 0.5) * 0.6 + (Math.abs(q) === Math.round(len) ? -0.8 : 0);
      img.set(px, py, sh.col(W, Math.max(1, Math.min(7.5, t)), px, py));
    }
  }
  for (const off of [-4, 4]) for (let x = 0; x < w; x++) {
    const t = sh.idx(x, (y + off) * iso, 0, -0.4, 0.9);
    img.set(x, y + off - 1, sh.col(I, Math.min(8, t + 1.6), x, y));
    img.set(x, y + off, sh.col(I, t, x, y));
    img.set(x, y + off + 1, I.w[1]);
  }
}

/** Corridor chasm: the far cliff drops away into teal darkness, with lit lips, mist and a deep glow. */
function chasm(L, C, gap, ri, seed) {
  const S = STYLE[ri];
  const { img, glow } = L;
  const x0 = Math.round(L.px(gap[0])), x1 = Math.round(L.px(gap[1]));
  const lip = Math.round(L.py(0)), H = img.h;
  const deep = [S.shadow[0], S.shadow[1], S.shadow[2]].map((c) => hp(c));
  for (let x = x0 - 4; x < x1 + 4; x++) for (let y = lip - 6; y < H; y++) {
    const k = (y - lip) / Math.max(1, H - lip), e = Math.min(x - x0, x1 - x) / Math.max(1, (x1 - x0) * 0.5);
    img.set(x, y, deep[qt(2 - k * 2.2 + (1 - e) * 0.4 + (wob(x * 0.03 + y * 0.01, seed) - 0.5) * 0.6, x, y, 3)]);
  }
  for (const s of [-1, 1]) { // cliff faces stepping down on both sides
    const ex = s < 0 ? x0 : x1;
    for (let k = 0; k < 6; k++) {
      const r = L.g.ppu * (0.25 + hash(k, s + 3, seed) * 0.35);
      const cx = ex + s * (-r * 0.4 + hash(k, 5, seed) * r * 0.6), cy = lip + k * r * 1.1 + r * 0.3;
      slab(img, C.sh, C.M.rock, blobPts(cx, cy, r, r * 0.7, seed + k * 13 + s * 50, { rough: 0.6, n: 8 }), { seed: seed + k * 13 + s * 50 });
    }
  }
  const mc = hp(mixHex(S.shadow[3], '#9ad0d8', 0.25));
  for (let b = 0; b < 3; b++) { // mist drifting in the gap
    const by = lip + (0.25 + b * 0.22) * (H - lip);
    for (let y = Math.round(by - 6); y < by + 6; y++) for (let x = x0; x < x1; x++) {
      const a = (1 - Math.abs(y - by) / 6) * 0.5 * (0.6 + wob(x * 0.04 + b * 7, seed) * 0.6);
      if (a > bayer(x, y) + 0.2) img.set(x, y, mixp(img.get(x, y), mc, 0.35));
    }
  }
  if (ri === 4) for (let x = x0; x < x1; x++) for (let y = H - 16; y < H; y++) { const c = hp(y > H - 8 ? '#ffb43a' : y > H - 12 ? '#ff6a1a' : '#a02a08'); img.set(x, y, c); glow.set(x, y, c); }
  else halo(glow, (x0 + x1) / 2, H, (x1 - x0) * 0.5, hp(mixHex(S.acc, '#000000', 0.75)), 0.5, 0.6);
}

export function clearBackdropCache() { cache.clear(); }
