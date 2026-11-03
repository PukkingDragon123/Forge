// The old map (overlay). A torn, stained parchment you found in your pack, inked by some long-gone
// explorer: the act's rooms as little hand-drawn symbols, dotted paths between them, Pip's paw prints
// along the way you came, a pin where you stand. Drag (or wheel) to pan.
//   game.pushOverlay('oldmap', { pick, onPick(node), onClose(), closable, live })
//     pick     — the next rooms are circled; choosing one calls onPick(node) and folds the map
//     closable — false makes picking mandatory (default true)
//     live     — keep the scene below updating (default: it freezes while the map is open)
import { Scene } from '../core/game.js';
import { Painter, scaleCanvas } from '../art/pixel.js';
import { HM, tornMask, fillMask, inkEdge, wobbleLine } from '../ui/handmade.js';
import { hash2, fbm2, clamp, ease, mixHex } from '../core/math.js';
import { ACTS, NODE_TYPES } from '../data/regions.js';
import { CHARACTERS } from '../data/characters.js';
import { tag } from '../ui/frames.js';

const W = 600, STEP = 58, TOP = 118, BOTTOM = 92, MX = 92;
const INK = '#2a1608', INK2 = '#4a2a14', RED = '#8a2410', FAINT = '#7a5634';
const sheetH = (rows) => TOP + (rows - 1) * STEP + BOTTOM;

// ------------------------------------------------------------------ hand-inked glyphs
// '#' ink, '+' wash of the room's colour, 'o' light wash, '.' paper
const G = {
  monster: [
    '#...........#',
    '##.........##',
    '.###.....###.',
    '..#########..',
    '.#+++++++++#.',
    '#+++#+++#+++#',
    '#++###+###++#',
    '#+++++++++++#',
    '#+#########+#',
    '.#+#.#.#.#+#.',
    '..#.......#..',
    '...#######...',
  ],
  elite: [
    '##.........##',
    '###.......###',
    '.###.....###.',
    '..#########..',
    '.##+++++++##.',
    '##+##+++##+##',
    '#++##+++##++#',
    '#+++++#+++++#',
    '.#+++###+++#.',
    '..###+#+###..',
    '...#+#+#+#...',
    '....#####....',
  ],
  boss: [
    '....#####....',
    '...#+++++#...',
    '..#+#+++#+#..',
    '..#+++++++#..',
    '...##+.+##...',
    '....#+.+#....',
    '..###+++####.',
    '.#+++++++++#.',
    '#++#######+#.',
    '#+#.......#+#',
    '#++#######++#',
    '.#+++++++++#.',
    '..#########..',
  ],
  vein: [
    '......#......',
    '.....#o#.....',
    '....#o++#....',
    '...#o++#+#...',
    '..#o+++#+#.#.',
    '..#++++##+#+#',
    '.#+++++#+++#.',
    '.#++++#++++#.',
    '#+++++#+++++#',
    '#############',
  ],
  treasure: [
    '..#########..',
    '.#+++++++++#.',
    '#+++++++++++#',
    '#############',
    '#+++++#+++++#',
    '#++++###++++#',
    '#+++++#+++++#',
    '#+++++++++++#',
    '#############',
  ],
  event: [
    '...#######...',
    '..##+++++##..',
    '.##+.....+##.',
    '.##.......##.',
    '.........##..',
    '.......###...',
    '......##.....',
    '......##.....',
    '.............',
    '......##.....',
    '......##.....',
  ],
  camp: [
    '......#......',
    '.....#+#.....',
    '....#+#+#....',
    '...#++#++#...',
    '..#+++#+++#..',
    '.#++++#++++#.',
    '#+++++#+++++#',
    '#############',
    '..#.o..o.#...',
    '...#o#o##....',
  ],
  start: [
    '#.....#',
    '##...##',
    '.##.##.',
    '..###..',
    '.##.##.',
    '##...##',
    '#.....#',
  ],
};
const glyphCache = new Map();
function glyph(type, scale = 2) {
  const key = type + scale;
  let c = glyphCache.get(key);
  if (c) return c;
  const rows = G[type] || G.event;
  const col = (NODE_TYPES[type] || NODE_TYPES.event).color;
  const wash = mixHex(col, HM.paper[5], 0.35), light = mixHex(col, '#fff6e0', 0.55);
  const p = new Painter(rows[0].length + 1, rows.length + 1);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '#') { p.set(x + 1, y + 1, [40, 20, 8, 70]); p.set(x, y, hash2(x, y, 3) > 0.88 ? INK2 : INK); }
    else if (ch === '+') p.set(x, y, wash, 215);
    else if (ch === 'o') p.set(x, y, light, 230);
  }));
  c = scale === 1 ? p.toCanvas() : scaleCanvas(p.toCanvas(), scale);
  glyphCache.set(key, c);
  return c;
}

// a hand-inked ring (wobbly radius) as a list of points
function ringPoints(r, seed) {
  const pts = [];
  const n = Math.round(r * 7);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2.08 - Math.PI / 2;
    const rr = r * (1 + (fbm2(i * 0.12, seed, 2, 7) - 0.5) * 0.16) + (i / n) * 1.5;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.92]);
  }
  return pts;
}

// ------------------------------------------------------------------ the parchment
const sheetCache = new Map();
function paintSheet(actIdx, rows, seed) {
  const key = actIdx + '|' + rows + '|' + seed;
  let c = sheetCache.get(key);
  if (c) return c;
  const H = sheetH(rows);
  const p = new Painter(W, H);
  const mask = tornMask(W, H, seed, { depth: 6, cornerSize: 30 });
  // warm, soft vellum: low mottling, long fibres, two or three old stains with tide lines
  const PAP = HM.paper;
  const tone = (x, y, e) => {
    let t = 0.72 + (fbm2(x * 0.012, y * 0.012, 3, seed + 5) - 0.5) * 0.22 + (fbm2(x * 0.5, y * 0.05, 2, seed + 2) - 0.5) * 0.05;
    const st = fbm2(x * 0.009 + 40, y * 0.009, 3, seed + 2);
    if (st > 0.66) t -= (st - 0.66) * 0.9;
    if (Math.abs(st - 0.66) < 0.006) t -= 0.07;
    if (e <= 1) t = 0.3; else if (e === 2) t -= 0.12;
    const v = clamp(t, 0, 0.999) * (PAP.length - 1), i = Math.floor(v), f = v - i;
    return f > 0.6 || (f > 0.4 && (x + y) % 2) ? PAP[Math.min(i + 1, PAP.length - 1)] : PAP[i];
  };
  fillMask(p, mask, (x, y, e) => {
    let col = tone(x, y, e);
    // burnt, darkened rim
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < 22) {
      const k = (1 - d / 22) * (0.35 + fbm2(x * 0.08, y * 0.08, 2, seed + 9) * 0.7);
      if (k > 0.25) col = mixHex(col, '#3a1e0a', Math.min(0.75, (k - 0.25) * 1.2));
    }
    return col;
  });
  const shade = (x, y, k, to = '#3a1e0a') => { const c0 = p.get(x, y); if (c0 && c0[3]) p.set(x, y, mixHex('#' + c0.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join(''), to, k)); };
  // fold creases: a dark valley with a lit ridge beside it
  for (const fx of [Math.round(W / 3), Math.round((W * 2) / 3)]) for (let y = 0; y < H; y++) {
    const x = fx + Math.round((fbm2(y * 0.02, fx, 2, seed) - 0.5) * 4);
    shade(x, y, 0.22); shade(x + 1, y, -0.0); shade(x - 1, y, 0.08, '#fff2d0');
  }
  for (const fy of [Math.round(H / 2)]) for (let x = 0; x < W; x++) {
    const y = fy + Math.round((fbm2(x * 0.02, fy, 2, seed) - 0.5) * 4);
    shade(x, y, 0.2); shade(x, y - 1, 0.08, '#fff2d0');
  }
  // a coffee ring and a drip
  const cx = Math.round(W * (0.18 + hash2(1, 2, seed) * 0.15)), cy = Math.round(H * (0.62 + hash2(3, 4, seed) * 0.2)), cr = 24;
  for (let y = -cr - 2; y <= cr + 2; y++) for (let x = -cr - 2; x <= cr + 2; x++) {
    const d = Math.hypot(x, y * 1.1);
    if (Math.abs(d - cr) < 1.3 && hash2(x, y, seed) > 0.15) shade(cx + x, cy + y, 0.3, '#5a2e0e');
    else if (d < cr - 1 && hash2(x >> 2, y >> 2, seed) > 0.5) shade(cx + x, cy + y, 0.05, '#5a2e0e');
  }
  // ruled double border (inked by hand)
  for (const ins of [16, 21]) {
    const a = ins === 16 ? 1 : 0.6;
    const ink = ins === 16 ? INK2 : FAINT;
    wobbleLine(p, ins, ins, W - ins, ins, ink, seed + ins, { amp: 0.8, skip: 0.04, alpha: 210 * a });
    wobbleLine(p, ins, H - ins, W - ins, H - ins, ink, seed + ins + 1, { amp: 0.8, skip: 0.04, alpha: 210 * a });
    wobbleLine(p, ins, ins, ins, H - ins, ink, seed + ins + 2, { amp: 0.8, skip: 0.04, alpha: 210 * a });
    wobbleLine(p, W - ins, ins, W - ins, H - ins, ink, seed + ins + 3, { amp: 0.8, skip: 0.04, alpha: 210 * a });
  }
  // margin doodles: the act's look, sketched in faded ink
  doodles(p, actIdx, H, seed);
  // compass rose (bottom right)
  compass(p, W - 64, H - 70, 22, seed);
  inkEdge(p, mask, { ink: '#3a1e0a', seed });
  c = p.toCanvas();
  c.H = H;
  sheetCache.set(key, c);
  if (sheetCache.size > 6) sheetCache.delete(sheetCache.keys().next().value);
  return c;
}

function compass(p, cx, cy, r, seed) {
  const ink = INK2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2, L = i % 2 ? r * 0.55 : r;
    const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L;
    const pa = a + Math.PI / 2, w = i % 2 ? 2.5 : 4;
    for (const s of [-1, 1]) wobbleLine(p, Math.round(cx + Math.cos(pa) * w * s), Math.round(cy + Math.sin(pa) * w * s), Math.round(ex), Math.round(ey), ink, seed + i * 3 + s, { amp: 0.3, alpha: 200 });
    if (i === 0) for (let k = 2; k < L - 2; k++) { const x = Math.round(cx + Math.cos(a) * k), y = Math.round(cy + Math.sin(a) * k); p.set(x - 1, y, RED, 200); p.set(x, y, RED, 220); }
  }
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; p.set(Math.round(cx + Math.cos(t) * r * 0.32), Math.round(cy + Math.sin(t) * r * 0.32), ink, 180); }
  // N
  const nx = cx - 2, ny = cy - r - 10;
  for (let k = 0; k < 6; k++) { p.set(nx, ny + k, ink); p.set(nx + 4, ny + k, ink); p.set(nx + 1 + Math.min(3, Math.floor(k * 0.6)), ny + k, ink); }
}

function doodles(p, act, H, seed) {
  const ink = [74, 42, 20];
  const put = (x, y, a = 150) => p.set(Math.round(x), Math.round(y), ink, a);
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 2;
    const x = side ? W - 40 - hash2(i, 1, seed) * 46 : 34 + hash2(i, 1, seed) * 46;
    const y = 40 + hash2(i, 2, seed) * (H - 120);
    spots.push([x, y, i]);
  }
  for (const [x, y, i] of spots) {
    const k = i % 4;
    if (act === 0) {
      // roots and little ferns
      if (k < 2) { for (let s = 0; s < 14; s++) put(x + Math.sin(s * 0.5 + i) * 3, y + s); for (let s = 0; s < 5; s++) { put(x - s, y + 4 + s * 0.5); put(x + s, y + 8 + s * 0.4); } }
      else { for (let s = 0; s < 9; s++) { put(x - s * 0.8, y - s); put(x + s * 0.8, y - s); put(x, y - s * 1.2); } }
    } else if (act === 1) {
      // waves and crystals
      if (k < 2) for (let s = 0; s < 22; s++) put(x - 11 + s, y + Math.sin(s * 0.7) * 1.5);
      else { for (let s = 0; s < 10; s++) { put(x - s * 0.4, y - s); put(x + s * 0.4, y - s); } put(x, y - 11); }
    } else if (act === 2) {
      // flames and anvils
      if (k < 2) for (let s = 0; s < 10; s++) { put(x + Math.sin(s * 0.9) * (5 - s * 0.4), y - s); put(x - Math.sin(s * 0.9) * (3 - s * 0.25), y - s); }
      else { for (let s = 0; s < 12; s++) put(x - 6 + s, y); for (let s = 0; s < 6; s++) put(x - 3 + s, y + 3); put(x - 1, y + 1); put(x + 1, y + 2); }
    } else {
      // columns and little snakes
      if (k < 2) { for (let s = 0; s < 16; s++) { put(x - 3, y - s); put(x + 3, y - s); } for (let s = 0; s < 9; s++) { put(x - 4 + s, y); put(x - 4 + s, y - 16); } }
      else for (let s = 0; s < 18; s++) put(x - 9 + s, y + Math.sin(s * 0.6) * 3);
    }
  }
  // scattered rock hatching
  for (let i = 0; i < 40; i++) {
    const x = 30 + hash2(i, 7, seed) * (W - 60), y = 30 + hash2(i, 8, seed) * (H - 60);
    if (x > 110 && x < W - 110) continue; // keep the middle clear for the rooms
    for (let s = 0; s < 4; s++) put(x + s, y + s * 0.6, 90);
  }
}

// ------------------------------------------------------------------ the overlay
/** Text with a fade (ui.text has no alpha of its own). */
function textA(ui, str, x, y, opts, a) { const c = ui.ctx, a0 = c.globalAlpha; c.globalAlpha = a0 * Math.max(0, Math.min(1, a)); ui.text(str, x, y, opts); c.globalAlpha = a0; }

export class OldMapScene extends Scene {
  get freezesBelow() { return !this.p.live; }
  enter(params = {}) {
    this.p = params;
    const run = this.game.run;
    this.run = run;
    this.map = params.map || (run && run.map);
    this.actIdx = this.map ? this.map.act ?? 0 : 0;
    this.act = ACTS[this.actIdx];
    this.rows = this.map ? this.map.rows.length : 10;
    this.sheet = paintSheet(this.actIdx, this.rows, (this.map && this.map.nodes[0].seed % 997) || 7);
    this.t = 0; this.open = 0; this.closing = 0;
    this.sel = null;
    this.chosen = null;
    this.drag = null;
    this.rings = new Map();
    const cur = this.map && this.map.nodes[this.map.current];
    this.pan = cur ? this.focusPan(cur) : 0;
    this.panV = 0;
    this.game.audio && this.game.audio.play('map_unfold');
  }
  exit() { this.game.audio && this.game.audio.play('map_fold'); }

  // layout: the sheet is centred horizontally; tall sheets pan vertically
  sheetX(ui) { return Math.round(ui.w / 2 - W / 2); }
  maxPan(ui) { return Math.max(0, this.sheet.height - (ui.h - 36)); }
  sheetY(ui) {
    const free = ui.h - this.sheet.height;
    const base = free > 0 ? Math.round(free / 2) : 18 - this.pan;
    const k = ease.outCubic(clamp(this.open, 0, 1)), c = ease.inCubic(clamp(this.closing, 0, 1));
    return Math.round(base + (1 - k) * 90 + c * 120);
  }
  focusPan(node) {
    const y = this.nodeY(node);
    return clamp(y - 540 / 2, 0, Math.max(0, this.sheet.height - (540 - 36)));
  }
  nodeX(n) { return MX + n.x * (W - MX * 2); }
  nodeY(n) { const rowPos = n.y * (this.rows - 1); return this.sheet.height - BOTTOM - rowPos * STEP; }

  options() {
    if (!this.map) return [];
    return this.map.nodes[this.map.current].out.map((id) => this.map.nodes[id]);
  }
  visitedEdges() {
    const v = this.map ? this.map.visited : [];
    const out = [];
    for (let i = 1; i < v.length; i++) out.push([v[i - 1], v[i]]);
    return out;
  }

  close() {
    if (this.closing > 0) return;
    if (this.p.pick && this.p.closable === false && !this.chosen) { this.game.audio && this.game.audio.play('deny'); return; }
    this.closing = 0.0001;
  }
  choose(node) {
    if (this.chosen) return;
    this.chosen = node;
    this.chooseT = 0;
    this.game.audio && this.game.audio.play('quill', { vol: 0.8 });
    this.game.audio && this.game.audio.play('click');
  }

  update(dt) {
    this.t += dt;
    this.open = Math.min(1, this.open + dt * 2.8);
    if (this.closing > 0) {
      this.closing += dt * 3.2;
      if (this.closing >= 1) {
        this.game.popOverlay(this);
        if (this.chosen && this.p.onPick) this.p.onPick(this.chosen);
        else if (this.p.onClose) this.p.onClose();
      }
      return;
    }
    if (this.chosen) { this.chooseT += dt; if (this.chooseT > 0.75) this.close(); }
    // inertia
    if (!this.drag && Math.abs(this.panV) > 1) { this.pan += this.panV * dt; this.panV *= Math.pow(0.02, dt); }
    const mp = this.maxPan(this.game.ui);
    this.pan = clamp(this.pan, 0, mp);
    const inp = this.game.input;
    if (inp.wheel) { this.pan = clamp(this.pan + inp.wheel * 46, 0, mp); this.panV = 0; }
    if (inp.actionPressed('back') && !this.chosen) this.close();
  }

  draw(ui) {
    const ctx = ui.ctx, inp = this.game.input;
    const k = ease.outCubic(clamp(this.open, 0, 1)) * (1 - clamp(this.closing, 0, 1));
    ui.block(3);
    ui.rect(0, 0, ui.w, ui.h, '#07060b', 0.62 * k);
    const sx = this.sheetX(ui), sy = this.sheetY(ui);
    // tapping outside the sheet folds it (registered first, so everything else sits on top)
    const out = ui.hit('oldmap-out', -1e4, -1e4, 3e4, 3e4, { cursor: false, sound: false });
    if (out.clicked && !this.chosen && this.open >= 1) this.close();
    // the whole sheet catches drags (pan); rooms are registered on top of it
    const sh = ui.hit('oldmap-sheet', sx, sy, W, this.sheet.height, { cursor: this.maxPan(ui) > 0 ? 'grab' : false, sound: false });
    if (sh.pressed) this.drag = { y: inp.y, pan: this.pan, last: inp.y, moved: 0 };
    if (this.drag) {
      if (inp.down) {
        const dy = inp.y - this.drag.last;
        this.drag.moved += Math.abs(dy);
        this.pan = clamp(this.pan - dy, 0, this.maxPan(ui));
        this.panV = -dy / Math.max(1 / 60, ui.dt || 1 / 60);
        this.drag.last = inp.y;
      } else this.drag = null;
    }
    ctx.globalAlpha = k;
    // drop shadow, then the paper
    ctx.globalAlpha = 0.45 * k; ctx.fillStyle = '#000'; ctx.fillRect(sx + 8, sy + 10, W - 4, this.sheet.height - 6); ctx.globalAlpha = k;
    ui.img(this.sheet, sx, sy);
    if (this.map) this.drawMap(ui, sx, sy, k);
    ctx.globalAlpha = 1;
    this.drawChrome(ui, sx, sy, k);
    ui.unblock();
    ui.block(2);
  }

  drawMap(ui, sx, sy, k) {
    const ctx = ui.ctx, map = this.map, run = this.run;
    const P = (n) => [sx + this.nodeX(n), sy + this.nodeY(n)];
    const opts = this.options();
    const visitedEdges = this.visitedEdges();
    const isVisitedEdge = (a, b) => visitedEdges.some(([p, q]) => p === a && q === b);
    // ---- paths: dotted ink; the way you came gets Pip's paw prints
    for (const e of map.edges) {
      const a = map.nodes[e.a], b = map.nodes[e.b];
      const [x1, y1] = P(a), [x2, y2] = P(b);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      const bend = (hash2(e.a, e.b, 5) - 0.5) * 14;
      const pt = (t) => [x1 + (x2 - x1) * t + nx * Math.sin(t * Math.PI) * bend, y1 + (y2 - y1) * t + ny * Math.sin(t * Math.PI) * bend];
      const nextPath = this.p.pick && a.id === map.current && opts.includes(b);
      if (isVisitedEdge(e.a, e.b)) {
        // paw prints, alternating sides
        const n = Math.floor((len - 30) / 15);
        for (let i = 0; i <= n; i++) {
          const t = 15 / len + (i / Math.max(1, n)) * (1 - 30 / len);
          const [px, py] = pt(t);
          const s = i % 2 ? 3 : -3;
          const fx = Math.round(px + nx * s), fy = Math.round(py + ny * s);
          ctx.fillStyle = RED; ctx.fillRect(fx, fy, 3, 3); ctx.fillRect(fx - 1, fy + 1, 5, 1);
          ctx.fillRect(fx - 2, fy - 2, 2, 2); ctx.fillRect(fx + 1, fy - 3, 2, 2); ctx.fillRect(fx + 4, fy - 2, 2, 2);
        }
        continue;
      }
      const n = Math.floor(len / 6);
      for (let i = 2; i < n - 1; i++) {
        if (nextPath && ((i + Math.floor(this.t * 10)) % 4 === 0)) continue;
        const [px, py] = pt(i / n);
        ctx.fillStyle = nextPath ? RED : INK2;
        ctx.globalAlpha = (nextPath ? 0.95 : 0.55) * k;
        ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
      }
      ctx.globalAlpha = k;
    }
    // ---- rooms
    const hover = [];
    for (const n of map.nodes) {
      const [x, y] = P(n);
      const type = n.type === 'mining' ? 'vein' : n.type;
      const scout = run && run.hasCompanion && run.hasCompanion('clover');
      const g = glyph(type);
      const isOpt = this.p.pick && opts.includes(n) && !this.chosen;
      const id = 'oldmap-node' + n.id;
      const h = ui.hit(id, x - 18, y - 18, 36, 36, { sound: false, cursor: isOpt ? 'hand' : false });
      const big = (h.hover && isOpt) || this.chosen === n || this.sel === n;
      const s = big ? 1.25 : 1;
      const done = map.visited.includes(n.id) && n.id !== map.current;
      ctx.globalAlpha = (done ? 0.55 : 1) * k;
      ui.img(g, x, y + (isOpt ? Math.round(Math.sin(this.t * 4 + n.id) * 1.5) : 0), { center: true, scale: s });
      ctx.globalAlpha = k;
      // visited rooms get a quick inked circle; options a circle being drawn
      if (done) this.ring(ui, n, x, y, 1, RED, 0.7);
      if (isOpt) {
        const prog = clamp((this.t * 1.6 + n.col * 0.13) % 1.6, 0, 1);
        this.ring(ui, n, x, y, ease.outCubic(prog), RED, 1);
      }
      if (this.chosen === n) this.ring(ui, n, x, y, 1, RED, 1, 2);
      if (n.type === 'boss' && run) {
        const f = run.friendForAct ? run.friendForAct(this.actIdx) : null;
        if (f && CHARACTERS[f]) ui.text(CHARACTERS[f].name, x, y + 20, { align: 'center', font: 'small', color: RED });
      }
      if (h.hover) hover.push({ n, isOpt, scout });
      if (h.clicked && isOpt) {
        if (ui.touch && this.sel !== n) { this.sel = n; this.game.audio && this.game.audio.play('page_turn', { vol: 0.5 }); }
        else this.choose(n);
      }
    }
    // ---- you are here: a red-headed brass pin stuck in the paper, bobbing a little
    const cur = map.nodes[map.current];
    if (cur) {
      const [x, y] = P(cur);
      const bob = Math.round(Math.sin(this.t * 3) * 2);
      const px = x + 14, py = y - 4;
      ctx.globalAlpha = 0.35 * k; ctx.fillStyle = '#000'; ctx.fillRect(px, py + 1, 6, 2); ctx.globalAlpha = k;
      ctx.fillStyle = '#7a6a4a'; ctx.fillRect(px, py - 22 + bob, 2, 22 - bob);
      ctx.fillStyle = '#c8b890'; ctx.fillRect(px, py - 22 + bob, 1, 22 - bob);
      const head = [[0, 0, '#5a0e08'], [1, 0, '#8a1a12'], [2, 0, '#8a1a12'], [3, 0, '#5a0e08']];
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
        const dx = i - 3, dy = j - 3;
        if (dx * dx + dy * dy > 11) continue;
        const l = -dx - dy;
        ctx.fillStyle = l > 3 ? '#ff9a7a' : l > 0 ? '#d84a3a' : l > -3 ? '#a8261e' : '#6a120c';
        ctx.fillRect(px - 2 + i, py - 29 + bob + j, 1, 1);
      }
      void head;
    }
    // ---- tooltip
    if (hover.length) {
      const { n } = hover[hover.length - 1];
      const nt = NODE_TYPES[n.type] || NODE_TYPES.event;
      const f = n.type === 'boss' && run && run.friendForAct ? run.friendForAct(this.actIdx) : null;
      ui.tooltip({ title: nt.name, body: f && CHARACTERS[f] ? `${CHARACTERS[f].name} is held here.` : nt.short, color: nt.color, w: 140 });
    }
    // touch: a "go" tag beside the room you tapped
    if (this.sel && !this.chosen && this.p.pick) {
      const [x, y] = P(this.sel);
      const c = tag(64, 26, { seed: 4, string: 6 });
      const gx = Math.round(x + 22), gy = Math.round(y - 13);
      const h = ui.hit('oldmap-go', gx, gy, 64, 26);
      ui.img(c, gx, gy);
      ui.text('Go', gx + 32, gy + c.inner.y + Math.round((c.inner.h - 7) / 2), { align: 'center', color: INK });
      if (h.clicked) this.choose(this.sel);
    }
  }

  ring(ui, n, x, y, prog, color, alpha = 1, thick = 1) {
    let pts = this.rings.get(n.id);
    if (!pts) { pts = ringPoints(17, n.id * 3 + 1); this.rings.set(n.id, pts); }
    const ctx = ui.ctx;
    const m = Math.floor(pts.length * prog);
    ctx.fillStyle = color;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * alpha;
    for (let i = 0; i < m; i++) { const [px, py] = pts[i]; ctx.fillRect(Math.round(x + px), Math.round(y + py), thick + 1, thick); }
    ctx.globalAlpha = a0;
  }

  drawChrome(ui, sx, sy, k) {
    const ctx = ui.ctx;
    ctx.globalAlpha = k;
    // the act's name, inked across the top of the sheet
    ui.text(this.act.name, sx + W / 2, sy + 34, { align: 'center', font: 'large', color: INK });
    ui.text(this.act.sub, sx + W / 2, sy + 58, { align: 'center', font: 'small', color: FAINT });
    // legend along the bottom
    const types = ['monster', 'elite', 'vein', 'event', 'treasure', 'camp'];
    const ly = sy + this.sheet.height - 52;
    const span = W - 150, step = span / types.length;
    types.forEach((t, i) => {
      const x = Math.round(sx + 75 + i * step + step / 2);
      ui.img(glyph(t, 1), x, ly, { center: true });
      ui.text(NODE_TYPES[t].name.split(' ')[0], x, ly + 10, { align: 'center', font: 'small', color: INK2 });
    });
    ctx.globalAlpha = 1;
    // fold / close tag (unless a pick is mandatory)
    if (!(this.p.pick && this.p.closable === false)) {
      const label = this.p.pick ? 'Later' : 'Fold map';
      const w = Math.max(72, ui.measure(label) + 26);
      const c = tag(w, 28, { seed: 11, string: 8 });
      const x = Math.min(ui.w - w - 10, sx + W + 8), y = 24;
      const h = ui.hit('oldmap-close', x, y, w, 28);
      ui.img(c, x, y - (h.hover ? 2 : 0));
      ui.text(label, x + w / 2, y + c.inner.y + Math.round((c.inner.h - 7) / 2) - (h.hover ? 2 : 0), { align: 'center', color: INK });
      if (h.clicked) this.close();
    }
    if (this.p.pick && !this.chosen && this.t > 0.6) {
      const hint = ui.touch ? 'Tap a circled room' : 'Pick a circled room';
      textA(ui, hint, ui.w / 2, ui.h - 14, { align: 'center', font: 'small', color: '#e8d8b8', outline: '#140c10' }, k);
    }
  }
}
