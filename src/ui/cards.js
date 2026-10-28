// Hand-painted tarot-style cards: aged card stock with a painted rarity band, an arched illustration
// window holding a small painted scene (cave wall, crystal grotto, mossy floor, smithy…) with the
// material or weapon art standing in it, a name scroll, and painted stat tokens. Plus card backs and a
// draw helper that lifts / shears cards while keeping pixels crisp.
import { Painter, makeCanvas, silhouette, dither } from '../art/pixel.js';
import { materialSprite, weaponSprite } from '../art/sprites.js';
import { MATERIALS, QUALITY } from '../data/materials.js';
import { GRADES } from '../systems/forge.js';
import { drawText, measure, bigText, COLORS } from './font.js';
import { icon } from './icons.js';
import { hash2, fbm2, clamp, mixHex, shadeHex } from '../core/math.js';
import { INK, HM, cutMask, fillMask, inkEdge, wobbleLine, paperTone, waxSeal, WAX } from './handmade.js';

const cache = new Map();
const memo = (k, f) => { let v = cache.get(k); if (!v) { v = f(); cache.set(k, v); if (cache.size > 600) cache.delete(cache.keys().next().value); } return v; };
const OUT = INK;
export const CARD_W = 72, CARD_H = 100, WCARD_W = 104, WCARD_H = 144;

// painted border bands (dark → light)
const BAND = {
  common: ['#2a1e16', '#463224', '#644a34', '#82644a', '#a08262'],
  uncommon: ['#10261f', '#1c3c30', '#2a5642', '#3e7058', '#5e9070'],
  rare: ['#0e1830', '#18284c', '#24406e', '#36588e', '#5478ae'],
  epic: ['#1c0e30', '#2e1848', '#442464', '#5c3682', '#7c52a2'],
  legendary: HM.brass.slice(1, 6),
  iron: ['#16181a', '#26292c', '#3a3e40', '#52585a', '#727a7a'],
};
const GEMC = { common: '#c9b89a', uncommon: '#7dd89a', rare: '#7ab8ff', epic: '#d08aff', legendary: '#ffd25e', iron: '#a8b0b0' };
const EL_COLOR = { fire: '#ff7b2e', ice: '#7fe3ff', shock: '#ffe74a', poison: '#8fe04a', curse: '#c86bff', bleed: '#ff4f6a', holy: '#fff3b0' };
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const seedOf = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
const pick = (pal, t) => pal[clamp(Math.floor(t * pal.length), 0, pal.length - 1)];
/** Ordered-dither lookup into a ramp: v in [0,1]. */
const dpal = (pal, v, x, y) => { const s = clamp(v) * (pal.length - 1), i = Math.floor(s); return pal[Math.min(pal.length - 1, i + (dither(x, y, s - i) ? 1 : 0))]; };

// ------------------------------------------------------------------ painted scenes
const SCENES = {
  cave: { sky: ['#0c0808', '#1a1210', '#2a1c16', '#3e2a1e', '#583c28', '#7a5434', '#a07044'], light: [0.22, 0.12], ground: ['#1a120e', '#2c1e16', '#44302a', '#5e4636'] },
  grotto: { sky: ['#06060e', '#0e0e20', '#181a34', '#22284a', '#2e3a62', '#40527e'], light: [0.5, 0.45], ground: ['#0c0c18', '#16182a', '#22263e', '#323a56'] },
  moss: { sky: ['#060a08', '#0c1410', '#14201a', '#1e2e24', '#2a3e30', '#3a5440'], light: [0.7, 0.18], ground: ['#101a10', '#1c2c18', '#2c4222', '#46602e'] },
  workshop: { sky: ['#140c08', '#24160e', '#382214', '#4e301c', '#664026', '#825434'], light: [0.25, 0.2], ground: ['#1c120c', '#2e1e14', '#46301e', '#604428'] },
  desk: { sky: ['#1a0e08', '#2e1a0e', '#462814', '#62381c', '#7e4c28', '#9c6436'], light: [0.75, 0.25], ground: ['#2a1a10', '#46301c', '#664828', '#8a6638'] },
  forge: { sky: ['#0a0606', '#160c0a', '#24120c', '#381a0e', '#542410', '#783212', '#a04414'], light: [0.5, 0.95], ground: ['#120a08', '#20140e', '#342218', '#4a3222'] },
  boss: { sky: ['#0a0408', '#160810', '#260c1a', '#3a1224', '#521a30', '#6e2438'], light: [0.5, 0.3], ground: ['#12060c', '#200c14', '#32141e', '#4a1e2a'] },
};
function sceneFor(m) {
  if (m.tags && m.tags.includes('boss')) return 'boss';
  if (m.kind === 'gem' || m.kind === 'crystal') return 'grotto';
  if (m.kind === 'part') return 'moss';
  if (m.kind === 'key' || m.kind === 'tool') return 'workshop';
  if (m.kind === 'scroll' || m.kind === 'recipe') return 'desk';
  return 'cave';
}

/** Paint a little scene into window rect (x0,y0,w,h) clipped by inside(x,y). accent tints the glow. */
function paintScene(p, x0, y0, w, h, kind, accent, seed, inside) {
  const S = SCENES[kind] || SCENES.cave;
  const [lx, ly] = S.light;
  const gy = Math.round(h * 0.74); // ground line
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const u = x / w, v = y / h;
    const dl = Math.hypot((u - lx) * 1.2, (v - ly) * 0.9);
    let c;
    const grd = gy + Math.round((fbm2(x * 0.08, 1, 2, seed) - 0.5) * 3);
    if (y >= grd) {
      // ground: lit lip, darker toward the viewer, cast shadow under the object
      let t = 0.75 - (y - grd) / (h - gy + 1) * 0.55 + (fbm2(x * 0.2, y * 0.3, 2, seed + 4) - 0.5) * 0.2;
      if (y === grd) t = 0.95;
      const sx = (x - w / 2) / (w * 0.32), sy = (y - grd - 3) / 3;
      if (sx * sx + sy * sy < 1) t -= 0.45;
      c = dpal(S.ground, t, x, y);
    } else {
      let t = 0.78 - dl * 0.95 + (fbm2(x * 0.05, y * 0.05, 3, seed) - 0.5) * 0.3;
      if (kind === 'cave' || kind === 'boss') { // strata bands and cracks in the wall
        const st = Math.sin(y * 0.55 + fbm2(x * 0.04, y * 0.02, 2, seed) * 9);
        if (st > 0.82) t -= 0.12;
        if (Math.abs(fbm2(x * 0.09, y * 0.09, 2, seed + 7) - 0.5) < 0.018) t -= 0.25;
      } else if (kind === 'workshop' || kind === 'desk') { // plank wall
        if (x % 11 === 0) t -= 0.25; else if (x % 11 === 1) t += 0.06;
        t += Math.sin(y * 0.3 + x * 0.9 + fbm2(x * 0.1, y * 0.05, 2, seed) * 5) * 0.04;
      } else if (kind === 'grotto') { // background crystal silhouettes
        const cx = Math.floor(x / 9), base = hash2(cx, 1, seed);
        const ch = h * (0.25 + base * 0.4), xc = cx * 9 + 4.5;
        if (y > gy - ch + Math.abs(x + 0.5 - xc) * 2.2 && base > 0.3) t += 0.18;
      } else if (kind === 'moss') { // hanging roots and fog band
        if (hash2(x, 3, seed) > 0.9 && y < h * (0.2 + hash2(x, 4, seed) * 0.3)) t -= 0.2;
        if (Math.abs(v - 0.62) < 0.08) t += 0.1;
      } else if (kind === 'forge') {
        t = 0.2 + Math.max(0, 1 - Math.hypot((u - 0.5) * 1.4, (v - 1.02) * 1.3)) * 0.85 + (fbm2(x * 0.06, y * 0.06, 3, seed) - 0.5) * 0.18;
        // tools hanging on the smithy wall: tongs and hammers in silhouette
        for (const [tx, len, head] of [[0.14, 0.34, 1], [0.24, 0.26, 0], [0.8, 0.3, 1], [0.88, 0.4, 0]]) {
          const px = Math.round(tx * w), L = Math.round(len * h);
          if ((x === px && y < L) || (head && y >= L - 2 && y <= L && Math.abs(x - px) <= 2) || (!head && y >= L - 4 && y <= L && Math.abs(x - px - (y - L + 4 > 2 ? 1 : 0)) === 1)) t -= 0.3;
        }
        if (y < 3) t -= 0.2;
      }
      c = dpal(S.sky, t, x, y);
      // stalactites along the top
      if ((kind === 'cave' || kind === 'boss' || kind === 'grotto') && y < h * 0.3) {
        const k = Math.floor(x / 6), len = h * (0.06 + hash2(k, 9, seed) * 0.2), xc = k * 6 + 3;
        if (y < len - Math.abs(x + 0.5 - xc) * (len / 3)) c = S.sky[0];
      }
    }
    if (accent && dl < 0.42 && y < grd) c = mixHex(c, accent, (0.42 - dl) * 0.55);
    if (hash2(x, y, seed + 11) > 0.994 && y < grd && dl < 0.6) c = mixHex(c, kind === 'forge' ? '#ffb060' : '#ffe0a0', 0.55); // dust motes / embers
    p.set(x0 + x, y0 + y, c);
  }
}

// ------------------------------------------------------------------ card frame
/** Paint the card stock, band, inner ink line and arched window. Returns layout. */
function tarot(W, H, band, seed, win) {
  const p = new Painter(W, H);
  const B = BAND[band] || BAND.common;
  const mask = cutMask(W, H, seed, { amp: 1, r: 5, chip: false });
  const paper = paperTone(HM.paper, seed);
  const bw = W >= 100 ? 5 : 4;
  fillMask(p, mask, (x, y, e) => {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < bw) {
      // painted band: brush strokes along the edge, lit top-left
      let t = 0.55 + (fbm2(x * 0.15 + y * 0.02, y * 0.15, 2, seed) - 0.5) * 0.45;
      const lit = (y < bw && y <= x && y <= W - 1 - x) || (x < bw && x <= y && x <= H - 1 - y);
      t += lit ? 0.18 : -0.12;
      if (d === bw - 1) t -= 0.35;
      if (band === 'legendary' && hash2(x, y, seed) > 0.9) t += 0.3; // gold-leaf flecks
      return pick(B, clamp(t));
    }
    return paper(x, y, Math.min(e, 5));
  });
  // thin hand-inked rule inside the band
  const r = bw + 2;
  wobbleLine(p, r, r, W - r - 1, r, '#5a3a20', seed, { amp: 0.4, skip: 0.06 });
  wobbleLine(p, r, H - r - 1, W - r - 1, H - r - 1, '#5a3a20', seed + 1, { amp: 0.4, skip: 0.06 });
  wobbleLine(p, r, r, r, H - r - 1, '#5a3a20', seed + 2, { amp: 0.4, skip: 0.06 });
  wobbleLine(p, W - r - 1, r, W - r - 1, H - r - 1, '#5a3a20', seed + 3, { amp: 0.4, skip: 0.06 });
  inkEdge(p, mask, { seed });
  // arched window
  const { x: wx, y: wy, w: ww, h: wh } = win;
  const arch = Math.min(9, Math.round(ww * 0.16));
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
    if (y < arch) { const dx = (x + 0.5 - ww / 2) / (ww / 2), dy = (arch - y - 0.5) / arch; return dx * dx + dy * dy <= 1; }
    return true;
  };
  return { p, inside, arch, mask, B };
}
/** Ink + band-coloured bevel around the window. */
function windowFrame(p, win, inside, B) {
  const { x: wx, y: wy, w: ww, h: wh } = win;
  for (let y = -2; y < wh + 2; y++) for (let x = -2; x < ww + 2; x++) {
    if (inside(x, y)) continue;
    let near = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(x + dx, y + dy)) near = 1;
    if (near) { p.set(wx + x, wy + y, INK); continue; }
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (inside(x + dx, y + dy)) near = 2;
    if (near === 2) p.set(wx + x, wy + y, x + y < ww / 2 ? B[4] : B[1]);
  }
}
/** Small painted plaque with a roman numeral at the top centre. */
function cartouche(p, ctx, cx, y, text, B) {
  const tw = measure(text, 'small') + 6, h = 8;
  const x0 = Math.round(cx - tw / 2);
  const m = cutMask(tw, h, seedOf(text) + 3, { amp: 0, r: 2, chip: false });
  fillMask(p, m, (x, yy, e) => (e === 1 ? (yy === 0 ? B[4] : B[0]) : B[2]), x0, y);
  inkEdge(p, m, { ox: x0, oy: y, heavy: false });
  return () => drawText(ctx, text, cx, y + 2, { font: 'small', color: '#f4e2b8', align: 'center' });
}
/** Parchment name scroll with curled ends; returns text draw callback. */
function nameScroll(p, ctx, cx, y, w, lines, font = 'small') {
  const f = font === 'small' ? 7 : 11;
  const h = lines.length * f + 3;
  const x0 = Math.round(cx - w / 2);
  const seed = seedOf(lines.join(''));
  const m = cutMask(w, h, seed, { amp: 1, r: 1, chip: false });
  const P = HM.paper;
  fillMask(p, m, (x, yy, e) => (e === 1 && yy === 0 ? P[6] : yy === h - 1 || (e === 1 && yy >= h - 2) ? P[2] : P[5 - (hash2(x, yy, seed) > 0.85 ? 1 : 0)]), x0, y);
  // curled ends
  for (const s of [-1, 1]) {
    const ex = s < 0 ? x0 - 3 : x0 + w;
    for (let j = 2; j < h + 2; j++) for (let i = 0; i < 3; i++) p.set(ex + i, y + j, i === (s < 0 ? 0 : 2) ? INK : j === h + 1 ? P[1] : P[3]);
    p.set(s < 0 ? ex + 2 : ex, y + h + 1, P[1]);
  }
  inkEdge(p, m, { ox: x0, oy: y, seed });
  return () => lines.forEach((ln, i) => drawText(ctx, ln, cx, y + 2 + i * f, { font, color: '#3a2010', align: 'center' }));
}
function wrap(text, font, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (measure(t, font) > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
/** Painted token (rounded lozenge) with text; returns {w, draw}. */
function token(p, ctx, x, y, text, bg, ic) {
  const tw = measure(text, 'small'), iw = ic ? ic.w + 1 : 0;
  const w = tw + iw + 6, h = 9;
  const T = [shadeHex(bg, -0.55), shadeHex(bg, -0.25), bg, shadeHex(bg, 0.25)];
  const m = cutMask(w, h, seedOf(text + bg), { amp: 0, r: 3, chip: false });
  fillMask(p, m, (xx, yy, e) => (e === 1 ? (yy <= 1 ? T[3] : T[0]) : yy < 3 ? T[3] : yy > 6 ? T[1] : T[2]), x, y);
  inkEdge(p, m, { ox: x, oy: y, heavy: false });
  return { w, draw: () => { if (ic) ctx.drawImage(ic.canvas, x + 3, y + Math.round((h - ic.h) / 2)); drawText(ctx, text, x + 3 + iw, y + 2, { font: 'small', color: '#fff6e0' }); } };
}
function fmtNum(v) { return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); }

/** Summarise a material's weapon effect into ≤2 badges. */
function badges(m) {
  const w = m.weapon;
  const out = [];
  if (!w) {
    if (m.kind === 'tool') out.push({ text: 'TOOL', bg: '#5b6170' });
    else if (m.kind === 'recipe') out.push({ text: 'READ', bg: '#8a6a2a' });
    else if (m.kind === 'key') out.push({ text: 'KEY', bg: '#8a6a2a' });
    return out;
  }
  if (w.chips) out.push({ text: '+' + w.chips, bg: '#2a5ab0' });
  if (w.mult) out.push({ text: '+' + w.mult, bg: '#b02a2a' });
  if (w.xmult) out.push({ text: '×' + fmtNum(w.xmult), bg: '#c0581a' });
  for (const e of Object.keys(EL_COLOR)) if (w[e] && out.length < 2) out.push({ text: '' + w[e], bg: mixHex(EL_COLOR[e], '#000', 0.45), icon: e });
  const fxLabel = { scrap: 'SCRAP', clarity: 'GEMS', prism: 'PRISM', soulstone: 'SOUL', echo: 'ECHO', mastery: '+GRADE', geode: '2 GEMS', wisp: 'WISP', runestone: 'RUNE', amber: 'PARTS+', magnetic: 'MAGNET', bones: 'BONES', fossil: 'BONES', brimstone: 'FIRE+', fear: 'FEAR', regen: 'REGEN', mycel: 'TOXIC' };
  if (out.length < 2 && w.fx && fxLabel[w.fx]) out.push({ text: fxLabel[w.fx], bg: '#5a3a7a' });
  const statLabel = [['speed', 'SPD'], ['crit', 'CRT'], ['lifesteal', 'LIFE'], ['block', 'BLK'], ['multi', 'HIT'], ['slow', 'SLOW'], ['miss', 'MISS'], ['greed', 'GOLD'], ['harvest', 'HRV'], ['critDmg', 'CRT']];
  for (const [k, lab] of statLabel) if (out.length < 2 && w[k]) out.push({ text: (w[k] > 0 ? '+' : '') + fmtNum(w[k]) + (k === 'critDmg' ? '×' : '') + ' ' + lab, bg: '#46525a' });
  if (out.length < 2 && w.pierce) out.push({ text: 'PIERCE', bg: '#46525a' });
  return out.slice(0, 2);
}
function elementOf(m) {
  const w = m.weapon || {};
  return Object.keys(EL_COLOR).find((e) => w[e]) || null;
}
function selectGlow(c, W, H) {
  const g = c.getContext('2d');
  const p = new Painter(W, H);
  const img = g.getImageData(0, 0, W, H).data;
  const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : img[(x + y * W) * 4 + 3]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!a(x, y)) continue;
    const edge = !a(x - 1, y) || !a(x + 1, y) || !a(x, y - 1) || !a(x, y + 1);
    const edge2 = !a(x - 2, y) || !a(x + 2, y) || !a(x, y - 2) || !a(x, y + 2);
    if (edge) p.set(x, y, '#ffe08a'); else if (edge2) p.set(x, y, '#d89a2a');
  }
  g.drawImage(p.toCanvas(), 0, 0);
}

// ------------------------------------------------------------------ material card (72×100)
/** 72×100 hand-painted material card. item = {id, q}. */
export function materialCard(item, opts = {}) {
  const key = `mc|${item.id}|${item.q ?? 2}|${opts.selected ? 1 : 0}|${opts.dim ? 1 : 0}`;
  return memo(key, () => {
    const m = MATERIALS[item.id];
    const W = CARD_W, H = CARD_H;
    const seed = seedOf(item.id);
    const rar = BAND[m.rarity] ? m.rarity : 'common';
    const win = { x: 8, y: 13, w: W - 16, h: 52 };
    const { p, inside, B } = tarot(W, H, rar, seed, win);
    const el = elementOf(m);
    paintScene(p, win.x, win.y, win.w, win.h, sceneFor(m), el ? EL_COLOR[el] : m.kind === 'gem' || m.kind === 'crystal' ? m.color : null, seed, inside);
    windowFrame(p, win, inside, B);
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const after = [];
    // roman numeral plaque: rarity tier
    const tier = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rar] || 1;
    after.push(cartouche(p, ctx, W / 2, 3, ROMAN[tier], B));
    // element gem in the window's top-right shoulder
    if (el) {
      const E = [shadeHex(EL_COLOR[el], -0.5), EL_COLOR[el], shadeHex(EL_COLOR[el], 0.45)];
      const gx = win.x + win.w - 9, gy = win.y + 8;
      ['.aa.', 'abca', 'abba', '.aa.'].forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch !== '.') p.set(gx + xx, gy + yy, ch === 'a' ? OUT : ch === 'c' ? E[2] : E[1]); }));
    }
    // name scroll over the bottom of the window
    const lines = wrap(m.name.toUpperCase(), 'small', W - 20).slice(0, 2);
    after.push(nameScroll(p, ctx, W / 2, win.y + win.h - (lines.length > 1 ? 9 : 4), W - 18, lines));
    // stat tokens
    const b = badges(m);
    const toks = [];
    let total = 0;
    for (const bd of b) { const ic = bd.icon ? icon(bd.icon + ':s') : null; total += measure(bd.text, 'small') + (ic ? ic.w + 1 : 0) + 6 + 2; toks.push({ ...bd, ic }); }
    while (toks.length > 1 && total > W - 14) { const t = toks.pop(); total -= measure(t.text, 'small') + (t.ic ? t.ic.w + 1 : 0) + 8; }
    let bx = Math.round((W - total + 2) / 2);
    for (const t of toks) { const tk = token(p, ctx, bx, 80, t.text, t.bg, t.ic); after.push(tk.draw); bx += tk.w + 2; }
    // quality pips: little painted gems on the bottom band
    const q = item.q ?? 2, qc = QUALITY[q].color;
    for (let i = 0; i < 4; i++) {
      const x = W / 2 - 8 + i * 4 + 1, y = H - 4;
      const lit = i < q;
      p.set(x, y - 1, lit ? shadeHex(qc, 0.3) : B[0]); p.set(x, y, lit ? qc : B[0]); p.set(x + 1, y, lit ? shadeHex(qc, -0.35) : B[0]); p.set(x + 1, y - 1, lit ? qc : B[1]);
    }
    ctx.drawImage(p.toCanvas(), 0, 0);
    // the material itself, standing on the ground of its scene
    const S = 44;
    const spr = materialSprite(item.id, S);
    ctx.drawImage(spr, Math.round(win.x + (win.w - S) / 2), win.y + Math.round(win.h * 0.74) - S + 4 - (lines.length > 1 ? 4 : 0));
    for (const f of after) f();
    if (opts.selected) selectGlow(c, W, H);
    if (opts.dim) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(10,6,8,0.58)'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    return c;
  });
}

// ------------------------------------------------------------------ weapon card (104×144)
/** 104×144 forged weapon card. w = finalized weapon (or evaluation) with bp, ids, el, grade, dmg, interval, critMult, name. */
export function weaponCard(w, opts = {}) {
  const key = `wc|${w.name}|${w.dmg}|${w.grade}|${(w.ids || []).join(',')}|${JSON.stringify(w.el || {})}|${opts.selected ? 1 : 0}`;
  return memo(key, () => {
    const W = WCARD_W, H = WCARD_H;
    const gi = w.grade ?? 1;
    const g = GRADES[gi] || GRADES[1];
    const band = gi >= 4 ? 'legendary' : gi >= 3 ? 'rare' : w.recipe ? 'epic' : gi >= 2 ? 'uncommon' : gi <= 0 ? 'iron' : 'common';
    const seed = seedOf((w.name || '') + (w.ids || []).join());
    const win = { x: 9, y: 24, w: W - 18, h: 70 };
    const { p, inside, B } = tarot(W, H, band, seed, win);
    const tint = Object.entries(w.el || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    paintScene(p, win.x, win.y, win.w, win.h, 'forge', tint ? EL_COLOR[tint[0]] : null, seed, inside);
    windowFrame(p, win, inside, B);
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const after = [];
    // title scroll
    const lines = wrap((w.name || '').toUpperCase(), 'small', W - 26).slice(0, 2);
    after.push(nameScroll(p, ctx, W / 2, lines.length > 1 ? 5 : 8, W - 22, lines));
    // damage seal: a big wax seal under the window with the damage in it
    const dmg = w.dmg ?? 0;
    const big = bigText(String(dmg), { scale: 1, font: 'large', top: '#fff6e0', bottom: '#ffd0a0' });
    const sealD = Math.max(26, big.width + 7), sx = Math.round(W / 2 - sealD / 2), sy = win.y + win.h - 6;
    waxSeal(p, sx, sy, sealD, WAX.red, seed, 'none');
    // speed / crit inked on the paper
    const spd = w.interval ? w.interval.toFixed(2) + 'S' : '';
    // grade ribbon
    const GB = [shadeHex(g.color, -0.6), shadeHex(g.color, -0.35), shadeHex(g.color, -0.15), g.color];
    const gy = H - 18;
    for (let y = gy; y < gy + 9; y++) for (let x = 14; x < W - 14; x++) {
      const notch = (x < 18 || x > W - 19) && Math.abs(y - gy - 4) < (x < 18 ? 18 - x : x - (W - 19)) * 0.9;
      if (notch) continue;
      p.set(x, y, y === gy ? GB[3] : y === gy + 8 ? GB[0] : y < gy + 3 ? GB[2] : GB[1]);
    }
    for (let x = 14; x < W - 14; x++) { p.set(x, gy - 1, INK); p.set(x, gy + 9, INK); }
    ctx.drawImage(p.toCanvas(), 0, 0);
    // weapon art
    const S = 72;
    ctx.drawImage(weaponSprite(w, S), Math.round(win.x + (win.w - S) / 2), win.y + 1);
    // element pips along the window's bottom-left
    let ex = win.x + 3;
    for (const [e, v] of Object.entries(w.el || {})) {
      if (!(v > 0)) continue;
      const ic = icon(e + ':s');
      if (!ic) continue;
      ctx.drawImage(ic.canvas, ex, win.y + win.h - ic.h - 9);
      drawText(ctx, String(v), ex + ic.w, win.y + win.h - 15, { font: 'small', color: EL_COLOR[e], outline: OUT, outlineShadow: false });
      ex += ic.w + measure(String(v), 'small') + 3;
      if (ex > win.x + win.w - 30) break;
    }
    for (const f of after) f();
    ctx.drawImage(big, Math.round(W / 2 - big.width / 2), sy + Math.round(sealD / 2 - big.height / 2) + 1);
    const ly = sy + 12;
    if (spd) { const ic = icon('clock:s'); ctx.drawImage(ic.canvas, 12, ly); drawText(ctx, spd, 12 + ic.w + 1, ly + 1, { font: 'small', color: '#3a2a4a' }); }
    if (w.critMult) {
      const t = '×' + (Math.round(w.critMult * 10) / 10); const ic = icon('crit:s'); const tw = measure(t, 'small');
      ctx.drawImage(ic.canvas, W - 12 - tw - ic.w - 1, ly); drawText(ctx, t, W - 12 - tw, ly + 1, { font: 'small', color: '#7a3010' });
    }
    drawText(ctx, g.name.toUpperCase(), W / 2, gy + 2, { font: 'small', color: gi >= 4 || gi === 1 ? '#3a1e08' : '#fff6e0', align: 'center' });
    if (opts.selected) selectGlow(c, W, H);
    return c;
  });
}

// ------------------------------------------------------------------ card back (72×100)
/** 72×100 face-down card. kind: 'part' | 'ore' | 'forge' */
export function cardBack(kind = 'part') {
  return memo(`back|${kind}`, () => {
    const W = CARD_W, H = CARD_H;
    const seed = seedOf('back' + kind);
    const p = new Painter(W, H);
    const base = { ore: ['#0a1020', '#121c34', '#1a2a4a', '#24385e'], part: ['#1e0808', '#300e0e', '#441616', '#5a2020'], forge: ['#1a0e08', '#2a180c', '#3c2412', '#52321a'] }[kind] || ['#1a0e08', '#2a180c', '#3c2412', '#52321a'];
    const G = HM.brass;
    const mask = cutMask(W, H, seed, { amp: 1, r: 5, chip: false });
    const cx = W / 2 - 0.5, cy = H / 2 - 0.5;
    fillMask(p, mask, (x, y, e) => {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (d < 4) return pick(G.slice(1, 6), 0.5 + (d === 0 ? -0.3 : d === 3 ? -0.35 : 0.1) + (hash2(x, y, seed) > 0.85 ? 0.25 : 0));
      // mirrored painted field: radial rays from the centre + starry dots
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      const ang = Math.atan2(dy, dx);
      let t = 0.45 + Math.cos(ang * 12) * 0.12 - Math.hypot(dx / W, dy / H) * 0.5 + (fbm2(dx * 0.1, dy * 0.1, 2, seed) - 0.5) * 0.15;
      let col = dpal(base, t, x, y);
      if (hash2(Math.round(dx), Math.round(dy), seed) > 0.975) col = G[5];
      return col;
    });
    // gold-leaf inner border, mirrored corner fleurons
    for (let x = 7; x < W - 7; x++) { p.set(x, 6, G[4]); p.set(x, H - 7, G[3]); }
    for (let y = 7; y < H - 7; y++) { p.set(6, y, G[4]); p.set(W - 7, y, G[3]); }
    const fl = ['xx..', 'x.x.', '.xxx', '..x.'];
    for (const [ox, oy, sx, sy] of [[8, 8, 1, 1], [W - 9, 8, -1, 1], [8, H - 9, 1, -1], [W - 9, H - 9, -1, -1]]) fl.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'x') p.set(ox + i * sx, oy + j * sy, G[5]); }));
    // central medallion: gold ring with a painted disc
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 0.95);
      if (d < 15.5 && d >= 13.5) p.set(x, y, x + y < cx + cy ? G[5] : G[2]);
      else if (d < 13.5) p.set(x, y, dpal(base, 0.9 - d / 18, x, y));
      else if (d < 16.5 && d >= 15.5) p.set(x, y, INK);
    }
    // diamond rays above / below the medallion
    for (const s of [-1, 1]) for (let j = 0; j < 14; j++) { const y = Math.round(cy + s * (18 + j)); for (let i = -(3 - (j >> 2)); i <= 3 - (j >> 2); i++) if (i >= -3) p.set(Math.round(cx + i), y, i < 0 ? G[4] : G[2]); }
    inkEdge(p, mask, { seed });
    const c = p.toCanvas();
    const ctx = c.getContext('2d');
    const ic = icon(kind === 'ore' ? 'ore' : kind === 'part' ? 'harvest' : 'forge');
    if (ic) ctx.drawImage(ic.canvas, Math.round(W / 2 - ic.w / 2), Math.round(H / 2 - ic.h / 2));
    return c;
  });
}

/** Draw a card with hover lift, drop shadow and optional tilt shear (row offsets keep pixels crisp). */
export function drawCard(ui, canvas, x, y, opts = {}) {
  const ctx = ui.ctx || ui;
  const lift = opts.lift ?? (opts.hover ? 4 : 0);
  const tilt = opts.tilt || 0;
  x = Math.round(x); y = Math.round(y - lift);
  if (opts.shadow !== false) {
    const sh = memoShadow(canvas);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(sh, x + 1, y + 2 + Math.round(lift * 0.6));
    ctx.globalAlpha = 1;
  }
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (!tilt) ctx.drawImage(canvas, x, y);
  else {
    const h = canvas.height;
    for (let row = 0; row < h; row++) {
      const off = Math.round(tilt * (row / h - 0.5) * 4);
      ctx.drawImage(canvas, 0, row, canvas.width, 1, x + off, y + row, canvas.width, 1);
    }
  }
  ctx.globalAlpha = 1;
  return { x, y, w: canvas.width, h: canvas.height };
}
const shadows = new WeakMap();
function memoShadow(c) {
  let s = shadows.get(c);
  if (!s) { s = silhouette(c, '#07060b'); shadows.set(c, s); }
  return s;
}

export function clearCardCache() { cache.clear(); }
export { COLORS };
