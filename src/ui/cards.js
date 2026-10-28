// Balatro-style pixel cards: material cards, forged weapon cards, card backs, and a draw helper
// that lifts / shears cards while keeping pixels crisp.
import { Painter, makeCanvas, silhouette } from '../art/pixel.js';
import { materialSprite, weaponSprite, tones } from '../art/sprites.js';
import { MATERIALS, QUALITY } from '../data/materials.js';
import { GRADES } from '../systems/forge.js';
import { drawText, measure, bigText, COLORS } from './font.js';
import { icon } from './icons.js';
import { hash2, mixHex, shadeHex } from '../core/math.js';

const cache = new Map();
const memo = (k, f) => { let v = cache.get(k); if (!v) { v = f(); cache.set(k, v); if (cache.size > 600) cache.delete(cache.keys().next().value); } return v; };
const OUT = '#140c10';

const FRAME = {
  common: { base: '#8a8278', trim: '#c9c1b3', gem: '#c9c1b3' },
  uncommon: { base: '#3e8a62', trim: '#c07a42', gem: '#7dff9a' },
  rare: { base: '#4a6ab0', trim: '#d8e2f0', gem: '#7ac8ff' },
  epic: { base: '#7a3ab0', trim: '#e0b8ff', gem: '#e08aff' },
  legendary: { base: '#c8902a', trim: '#fff0a8', gem: '#ffd25e' },
};
const EL_COLOR = { fire: '#ff7b2e', ice: '#7fe3ff', shock: '#ffe74a', poison: '#8fe04a', curse: '#c86bff', bleed: '#ff4f6a', holy: '#fff3b0' };

/** Card frame + art window backdrop. Returns painter and inner rects. */
function cardBase(w, h, rarity, tint, seed, artH) {
  const F = FRAME[rarity] || FRAME.common;
  const T = tones(F.base), R = tones(F.trim);
  const p = new Painter(w, h);
  // frame body with brushed texture
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // brushed metal: soft vertical streaks, very few specks
    const streak = hash2(x, y >> 3, seed);
    p.set(x, y, T[streak > 0.82 ? 4 : hash2(x, y, seed + 1) > 0.94 ? 2 : 3]);
  }
  // bevel
  for (let x = 0; x < w; x++) { p.set(x, 0, T[5]); p.set(x, h - 1, T[0]); p.set(x, 1, T[4]); p.set(x, h - 2, T[1]); }
  for (let y = 0; y < h; y++) { p.set(0, y, T[5]); p.set(w - 1, y, T[0]); p.set(1, y, T[4]); p.set(w - 2, y, T[1]); }
  // inner trim line
  for (let x = 2; x < w - 2; x++) { p.set(x, 2, R[3]); p.set(x, h - 3, R[1]); }
  for (let y = 2; y < h - 2; y++) { p.set(2, y, R[3]); p.set(w - 3, y, R[1]); }
  // art window
  const ax = 4, ay = 4, aw = w - 8, ah = artH;
  const top = mixHex(tint, '#120c14', 0.72), bot = mixHex(tint, '#07060b', 0.9);
  for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) {
    const t = y / ah;
    let c = mixHex(top, bot, t);
    const vx = Math.abs(x + 0.5 - aw / 2) / (aw / 2);
    if (vx > 0.75) c = mixHex(c, '#07060b', (vx - 0.75) * 1.6);
    if (hash2(x, y, seed + 7) > 0.93) c = shadeHex(c, 0.12); // cave speckles
    if (y > ah - 4 && hash2(x >> 1, 3, seed) > 0.4) c = shadeHex(c, 0.06 * (y - ah + 4)); // ground ledge
    p.set(ax + x, ay + y, c);
  }
  // window inset shading
  for (let x = ax; x < ax + aw; x++) { p.set(x, ay, '#07060b'); p.set(x, ay + ah - 1, shadeHex(F.base, -0.5)); }
  for (let y = ay; y < ay + ah; y++) { p.set(ax, y, '#07060b'); p.set(ax + aw - 1, y, shadeHex(F.base, -0.5)); }
  if (rarity === 'legendary' || rarity === 'epic') {
    // filigree corners
    const fil = rarity === 'legendary' ? R : tones('#f0d8ff');
    for (const [cx, cy, sx, sy] of [[3, 3, 1, 1], [w - 4, 3, -1, 1], [3, h - 4, 1, -1], [w - 4, h - 4, -1, -1]]) {
      p.set(cx, cy, fil[5]); p.set(cx + sx, cy, fil[4]); p.set(cx, cy + sy, fil[4]); p.set(cx + 2 * sx, cy + sy, fil[3]); p.set(cx + sx, cy + 2 * sy, fil[3]);
    }
  }
  return { p, ax, ay, aw, ah, F, T, R };
}

function pill(p, ctx, x, y, text, bg, fg = '#fff6e0') {
  const tw = measure(text, 'small');
  const w = tw + 4, h = 7;
  const B = tones(bg);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    if ((xx === 0 || xx === w - 1) && (yy === 0 || yy === h - 1)) continue;
    p.set(x + xx, y + yy, yy === 0 ? B[4] : yy === h - 1 ? B[1] : B[3]);
  }
  return { w, draw: () => drawText(ctx, text, x + 2, y + 1, { font: 'small', color: fg }) };
}

function fmtNum(v) { return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); }

/** Summarise a material's weapon effect into ≤2 badges. */
function badges(m) {
  const w = m.weapon;
  const out = [];
  if (!w) {
    if (m.kind === 'tool') out.push({ text: 'TOOL', bg: '#5b6170' });
    else if (m.kind === 'recipe') out.push({ text: 'READ', bg: '#a07a2a' });
    else if (m.kind === 'key') out.push({ text: 'KEY', bg: '#a07a2a' });
    return out;
  }
  if (w.chips) out.push({ text: '+' + w.chips, bg: '#2a6ad0' });
  if (w.mult) out.push({ text: '+' + w.mult, bg: '#c83030' });
  if (w.xmult) out.push({ text: '×' + fmtNum(w.xmult), bg: '#d8641e' });
  for (const e of Object.keys(EL_COLOR)) if (w[e] && out.length < 2) out.push({ text: '' + w[e], bg: mixHex(EL_COLOR[e], '#000', 0.35), icon: e });
  const fxLabel = { scrap: 'SCRAP', clarity: 'GEMS', prism: 'PRISM', soulstone: 'SOUL', echo: 'ECHO', mastery: '+GRADE', geode: '2 GEMS', wisp: 'WISP', runestone: 'RUNE', amber: 'PARTS+', magnetic: 'MAGNET', bones: 'BONES', fossil: 'BONES', brimstone: 'FIRE+', fear: 'FEAR', regen: 'REGEN', mycel: 'TOXIC' };
  if (out.length < 2 && w.fx && fxLabel[w.fx]) out.push({ text: fxLabel[w.fx], bg: '#6a4a8a' });
  const statLabel = [['speed', 'SPD'], ['crit', 'CRT'], ['lifesteal', 'LIFE'], ['block', 'BLK'], ['multi', 'HIT'], ['slow', 'SLOW'], ['miss', 'MISS'], ['greed', 'GOLD'], ['harvest', 'HRV'], ['critDmg', 'CRT']];
  for (const [k, lab] of statLabel) if (out.length < 2 && w[k]) out.push({ text: (w[k] > 0 ? '+' : '') + fmtNum(w[k]) + (k === 'critDmg' ? '×' : '') + ' ' + lab, bg: '#4a5a6a' });
  if (out.length < 2 && w.pierce) out.push({ text: 'PIERCE', bg: '#4a5a6a' });
  return out.slice(0, 2);
}

function elementOf(m) {
  const w = m.weapon || {};
  return Object.keys(EL_COLOR).find((e) => w[e]) || null;
}

/** 48×64 material card. item = {id, q}. */
export function materialCard(item, opts = {}) {
  const key = `mc|${item.id}|${item.q ?? 2}|${opts.selected ? 1 : 0}|${opts.dim ? 1 : 0}`;
  return memo(key, () => {
    const m = MATERIALS[item.id];
    const W = 48, H = 64;
    const seed = item.id.length * 13 + 5;
    const { p, ax, ay, aw, ah, R } = cardBase(W, H, m.rarity, m.color, seed, 30);
    // stat badges (painted now, text drawn after canvas conversion)
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const b = badges(m);
    const pending = [];
    let bx = Math.round((W - b.reduce((a, x) => a + measure(x.text, 'small') + 4 + (x.icon ? 8 : 0), 0) - (b.length - 1) * 2) / 2);
    while (b.length > 1 && b.reduce((a, x) => a + measure(x.text, 'small') + 6 + (x.icon ? 8 : 0), 0) > W - 6) b.pop();
    bx = Math.round((W - b.reduce((a, x) => a + measure(x.text, 'small') + 4 + (x.icon ? 8 : 0), 0) - (b.length - 1) * 2) / 2);
    for (const bd of b) {
      if (bd.icon) {
        pending.push(() => { const ic = icon(bd.icon); if (ic) ctx.drawImage(ic.canvas, bx0 - 9 + 0, 52 - 1); });
        const bx0 = bx + 8;
        const pl = pill(p, ctx, bx0, 53, bd.text, bd.bg);
        pending.push(pl.draw);
        bx = bx0 + pl.w + 2;
      } else {
        const pl = pill(p, ctx, bx, 53, bd.text, bd.bg);
        pending.push(pl.draw);
        bx += pl.w + 2;
      }
    }
    // quality pips on bottom trim
    const q = item.q ?? 2;
    const qc = QUALITY[q].color;
    for (let i = 0; i < 4; i++) {
      const x = W / 2 - 8 + i * 4, y = H - 3;
      const lit = i < q;
      p.set(x, y, lit ? qc : '#2a1d22'); p.set(x + 1, y, lit ? shadeHex(qc, -0.3) : '#2a1d22');
      p.set(x, y - 1, lit ? shadeHex(qc, 0.3) : '#3a2d32');
    }
    // element corner gem
    const el = elementOf(m);
    if (el) {
      const E = tones(EL_COLOR[el]);
      const gx = ax + aw - 6, gy = ay + 1;
      ['.##.', '#WE#', '#EE#', '.##.'].forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch !== '.') p.set(gx + xx, gy + yy, ch === '#' ? OUT : ch === 'W' ? E[5] : E[3]); }));
    }
    // selected: gold frame line
    if (opts.selected) {
      const G = '#ffe08a';
      for (let x = 0; x < W; x++) { p.set(x, 0, G); p.set(x, H - 1, '#e0a83a'); }
      for (let y = 0; y < H; y++) { p.set(0, y, G); p.set(W - 1, y, '#e0a83a'); }
    } else {
      for (let x = 1; x < W - 1; x++) { p.set(x, 0, OUT); p.set(x, H - 1, OUT); }
      for (let y = 1; y < H - 1; y++) { p.set(0, y, OUT); p.set(W - 1, y, OUT); }
    }
    for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) p.clear(x, y);
    ctx.drawImage(p.toCanvas(), 0, 0);
    // art
    const spr = materialSprite(item.id, 28);
    ctx.drawImage(spr, Math.round(ax + (aw - 28) / 2), ay + 1);
    // name (2 lines max, small font)
    const name = m.name.toUpperCase();
    const words = name.split(' ');
    const lines = [];
    let cur = '';
    for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (measure(t, 'small') > W - 8 && cur) { lines.push(cur); cur = wd; } else cur = t; }
    if (cur) lines.push(cur);
    const ny = lines.length > 1 ? 36 : 40;
    lines.slice(0, 2).forEach((ln, i) => {
      drawText(ctx, ln, W / 2, ny + i * 7 + 1, { font: 'small', color: OUT, align: 'center' });
      drawText(ctx, ln, W / 2, ny + i * 7, { font: 'small', color: m.rarity === 'common' ? '#f4ecd8' : shadeHex(FRAME[m.rarity].gem, 0.35), align: 'center' });
    });
    for (const f of pending) f();
    if (opts.dim) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(10,6,14,0.55)'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    return c;
  });
}

/** ~72×96 forged weapon card. w = finalized weapon (or evaluation) with bp, ids, el, grade, dmg, interval, critMult, name. */
export function weaponCard(w, opts = {}) {
  const key = `wc|${w.name}|${w.dmg}|${w.grade}|${(w.ids || []).join(',')}|${JSON.stringify(w.el || {})}|${opts.selected ? 1 : 0}`;
  return memo(key, () => {
    const W = 72, H = 96;
    const g = GRADES[w.grade ?? 1] || GRADES[1];
    const rarity = (w.grade ?? 1) >= 4 ? 'legendary' : (w.grade ?? 1) >= 3 ? 'rare' : w.recipe ? 'epic' : 'common';
    const tint = Object.entries(w.el || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    const { p, ax, ay, aw } = cardBase(W, H, rarity, tint ? EL_COLOR[tint[0]] : '#6a6058', 31, 46);
    for (let x = 1; x < W - 1; x++) { p.set(x, 0, opts.selected ? '#ffe08a' : OUT); p.set(x, H - 1, OUT); }
    for (let y = 1; y < H - 1; y++) { p.set(0, y, opts.selected ? '#ffe08a' : OUT); p.set(W - 1, y, OUT); }
    for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) p.clear(x, y);
    // grade banner strip at the bottom
    const GB = tones(g.color === '#f4ecd8' ? '#8a8278' : g.color);
    for (let y = H - 13; y < H - 4; y++) for (let x = 6; x < W - 6; x++) p.set(x, y, y === H - 13 ? GB[4] : y === H - 5 ? GB[1] : GB[2]);
    for (const s of [0, 1]) for (let y = H - 12; y < H - 5; y++) { const x = s ? W - 6 : 5; p.set(x, y, GB[1]); }
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.drawImage(p.toCanvas(), 0, 0);
    // weapon art
    const spr = weaponSprite(w, 44);
    ctx.drawImage(spr, Math.round(ax + (aw - 44) / 2), ay + 1);
    // element pips in the art window
    let ex = ax + 2;
    for (const [e, v] of Object.entries(w.el || {})) {
      if (!(v > 0)) continue;
      const ic = icon(e);
      if (!ic) continue;
      ctx.drawImage(ic.canvas, ex, ay + 46 - ic.h - 1);
      drawText(ctx, String(v), ex + ic.w, ay + 46 - 7, { font: 'small', color: EL_COLOR[e], outline: OUT, outlineShadow: false });
      ex += ic.w + measure(String(v), 'small') + 3;
      if (ex > ax + aw - 12) break;
    }
    // damage
    const dmg = w.dmg ?? 0;
    const big = bigText(String(dmg), { scale: 2, top: '#fff6e0', bottom: '#ffb84a' });
    const sw = icon('sword');
    const bxx = Math.round(W / 2 - (big.width + sw.w) / 2);
    ctx.drawImage(sw.canvas, bxx, 57);
    ctx.drawImage(big, bxx + sw.w, 49);
    // speed / crit
    const spd = w.interval ? w.interval.toFixed(2) + 'S' : '';
    if (spd) { const ic = icon('clock'); ctx.drawImage(ic.canvas, 6, 72); drawText(ctx, spd, 6 + ic.w + 1, 74, { font: 'small', color: '#cfe0ff', outline: OUT, outlineShadow: false }); }
    if (w.critMult) { const t = '×' + (Math.round(w.critMult * 10) / 10); const ic = icon('crit'); const tw = measure(t, 'small'); ctx.drawImage(ic.canvas, W - 6 - tw - ic.w - 1, 72); drawText(ctx, t, W - 6 - tw, 74, { font: 'small', color: '#ffb340', outline: OUT, outlineShadow: false }); }
    // grade label
    drawText(ctx, g.name.toUpperCase(), W / 2, H - 11, { font: 'small', color: (w.grade ?? 1) >= 4 ? '#3a1e08' : '#fff6e0', align: 'center' });
    // name (top, wraps 2 lines into the art window top)
    const words = (w.name || '').toUpperCase().split(' ');
    const lines = []; let cur = '';
    for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (measure(t, 'small') > W - 12 && cur) { lines.push(cur); cur = wd; } else cur = t; }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((ln, i) => drawText(ctx, ln, W / 2, ay + 2 + i * 7, { font: 'small', color: '#fff6e0', align: 'center', outline: OUT, outlineShadow: false }));
    return c;
  });
}

/** 48×64 face-down card. kind: 'part' | 'ore' | 'forge' */
export function cardBack(kind = 'part') {
  return memo(`back|${kind}`, () => {
    const W = 48, H = 64;
    const p = new Painter(W, H);
    const T = tones(kind === 'ore' ? '#3a4a6a' : kind === 'part' ? '#5a2a2a' : '#4a3a2a');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const diag = ((x + y) >> 2) % 2 === 0 && ((x - y + 64) >> 2) % 2 === 0;
      p.set(x, y, T[diag ? 3 : 2]);
    }
    const G = tones('#e0b85a');
    for (let x = 0; x < W; x++) { p.set(x, 0, OUT); p.set(x, H - 1, OUT); p.set(x, 2, G[3]); p.set(x, H - 3, G[1]); }
    for (let y = 0; y < H; y++) { p.set(0, y, OUT); p.set(W - 1, y, OUT); p.set(2, y, G[3]); p.set(W - 3, y, G[1]); }
    for (let x = 1; x < W - 1; x++) { p.set(x, 1, T[4]); p.set(x, H - 2, T[0]); }
    // center diamond medallion
    const cx = W / 2 - 0.5, cy = H / 2 - 0.5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.abs(x - cx) + Math.abs(y - cy) * 0.8;
      if (d < 14) p.set(x, y, d > 12.5 ? G[4] : d > 11.5 ? G[1] : T[1]);
    }
    for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) p.clear(x, y);
    const c = p.toCanvas();
    const ctx = c.getContext('2d');
    const ic = icon(kind === 'ore' ? 'ore' : kind === 'part' ? 'harvest' : 'forge');
    if (ic) ctx.drawImage(ic.canvas, Math.round(W / 2 - ic.w / 2), Math.round(H / 2 - ic.h / 2));
    drawText(ctx, '?', W / 2, 8, { font: 'small', color: '#e0b85a', align: 'center' });
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
