// Hand-authored pixel fonts + rich text renderer.
import { LARGE } from './font_large.js';
// Rich text: "{chips}+8 Chips{/} and {#ff0}yellow{/} {@coin}" — named colors, hex colors, inline icons.

const BODY = {
  height: 9, cap: 7, spacing: 1, space: 3, lineHeight: 11,
  glyphs: {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
    J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    a: ['....', '....', '.###', '...#', '.###', '#..#', '.###'],
    b: ['#...', '#...', '###.', '#..#', '#..#', '#..#', '###.'],
    c: ['....', '....', '.###', '#...', '#...', '#...', '.###'],
    d: ['...#', '...#', '.###', '#..#', '#..#', '#..#', '.###'],
    e: ['....', '....', '.##.', '#..#', '####', '#...', '.###'],
    f: ['..##', '.#..', '####', '.#..', '.#..', '.#..', '.#..'],
    g: ['....', '....', '.###', '#..#', '#..#', '#..#', '.###', '...#', '.##.'],
    h: ['#...', '#...', '###.', '#..#', '#..#', '#..#', '#..#'],
    i: ['#', '.', '#', '#', '#', '#', '#'],
    j: ['..#', '...', '..#', '..#', '..#', '..#', '..#', '#.#', '.#.'],
    k: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'],
    l: ['#.', '#.', '#.', '#.', '#.', '#.', '.#'],
    m: ['.....', '.....', '####.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
    n: ['....', '....', '###.', '#..#', '#..#', '#..#', '#..#'],
    o: ['....', '....', '.##.', '#..#', '#..#', '#..#', '.##.'],
    p: ['....', '....', '###.', '#..#', '#..#', '#..#', '###.', '#...', '#...'],
    q: ['....', '....', '.###', '#..#', '#..#', '#..#', '.###', '...#', '...#'],
    r: ['...', '...', '#.#', '##.', '#..', '#..', '#..'],
    s: ['....', '....', '.###', '#...', '.##.', '...#', '###.'],
    t: ['.#..', '.#..', '####', '.#..', '.#..', '.#..', '..##'],
    u: ['....', '....', '#..#', '#..#', '#..#', '#..#', '.###'],
    v: ['.....', '.....', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
    w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
    x: ['....', '....', '#..#', '#..#', '.##.', '#..#', '#..#'],
    y: ['....', '....', '#..#', '#..#', '#..#', '#..#', '.###', '...#', '.##.'],
    z: ['....', '....', '####', '...#', '.##.', '#...', '####'],
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
    "'": ['#', '#'],
    '"': ['#.#', '#.#'],
    '.': ['.', '.', '.', '.', '.', '.', '#'],
    ',': ['..', '..', '..', '..', '..', '..', '.#', '#.'],
    ':': ['.', '.', '#', '.', '.', '#', '.'],
    ';': ['..', '..', '.#', '..', '..', '.#', '#.'],
    '!': ['#', '#', '#', '#', '#', '.', '#'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    '-': ['....', '....', '....', '####'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '=': ['....', '....', '####', '....', '####'],
    '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
    '\\': ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#'],
    '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
    ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
    '[': ['##', '#.', '#.', '#.', '#.', '#.', '##'],
    ']': ['##', '.#', '.#', '.#', '.#', '.#', '##'],
    '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#'],
    '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
    '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
    '<': ['....', '...#', '..#.', '.#..', '..#.', '...#'],
    '>': ['....', '#...', '.#..', '..#.', '.#..', '#...'],
    _: ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '#####'],
    $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
    '^': ['.#.', '#.#'],
    '~': ['.....', '.....', '.##.#', '#.##.'],
    '|': ['#', '#', '#', '#', '#', '#', '#'],
    '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    '•': ['...', '...', '.#.', '###', '.#.'],
    '→': ['......', '...#..', '....#.', '######', '....#.', '...#..'],
    '←': ['......', '..#...', '.#....', '######', '.#....', '..#...'],
    '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'],
    '↓': ['..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
    '♥': ['.....', '##.##', '#####', '#####', '.###.', '..#..'],
    '★': ['..#..', '..#..', '#####', '.###.', '.#.#.', '#...#'],
    '…': ['.....', '.....', '.....', '.....', '.....', '.....', '#.#.#'],
    '·': ['.', '.', '.', '#'],
    '—': ['.....', '.....', '.....', '#####'],
    '–': ['....', '....', '....', '####'],
    '●': ['.....', '.###.', '#####', '#####', '#####', '.###.'],
    '○': ['.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  },
};

const SMALL = {
  height: 6, cap: 5, spacing: 1, space: 2, lineHeight: 7, upper: true,
  glyphs: {
    A: ['.#.', '#.#', '###', '#.#', '#.#'],
    B: ['##.', '#.#', '##.', '#.#', '##.'],
    C: ['.##', '#..', '#..', '#..', '.##'],
    D: ['##.', '#.#', '#.#', '#.#', '##.'],
    E: ['###', '#..', '##.', '#..', '###'],
    F: ['###', '#..', '##.', '#..', '#..'],
    G: ['.##', '#..', '#.#', '#.#', '.##'],
    H: ['#.#', '#.#', '###', '#.#', '#.#'],
    I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'],
    K: ['#.#', '#.#', '##.', '#.#', '#.#'],
    L: ['#..', '#..', '#..', '#..', '###'],
    M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
    N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
    O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
    P: ['##.', '#.#', '##.', '#..', '#..'],
    Q: ['.#.', '#.#', '#.#', '##.', '.##'],
    R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['.##', '#..', '.#.', '..#', '##.'],
    T: ['###', '.#.', '.#.', '.#.', '.#.'],
    U: ['#.#', '#.#', '#.#', '#.#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
    W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
    X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
    Z: ['###', '..#', '.#.', '#..', '###'],
    0: ['###', '#.#', '#.#', '#.#', '###'],
    1: ['.#.', '##.', '.#.', '.#.', '###'],
    2: ['##.', '..#', '.#.', '#..', '###'],
    3: ['##.', '..#', '.#.', '..#', '##.'],
    4: ['#.#', '#.#', '###', '..#', '..#'],
    5: ['###', '#..', '##.', '..#', '##.'],
    6: ['.##', '#..', '###', '#.#', '###'],
    7: ['###', '..#', '.#.', '.#.', '.#.'],
    8: ['###', '#.#', '###', '#.#', '###'],
    9: ['###', '#.#', '###', '..#', '##.'],
    '.': ['.', '.', '.', '.', '#'],
    ',': ['.', '.', '.', '.', '#', '#'],
    '!': ['#', '#', '#', '.', '#'],
    '?': ['##.', '..#', '.#.', '...', '.#.'],
    ':': ['.', '#', '.', '#', '.'],
    ';': ['.', '#', '.', '#', '#'],
    '-': ['...', '...', '###'],
    '+': ['...', '.#.', '###', '.#.', '...'],
    '=': ['...', '###', '...', '###'],
    '×': ['...', '#.#', '.#.', '#.#'],
    '%': ['#.#', '..#', '.#.', '#..', '#.#'],
    '/': ['..#', '..#', '.#.', '#..', '#..'],
    "'": ['#', '#'],
    '"': ['#.#', '#.#'],
    '(': ['.#', '#.', '#.', '#.', '.#'],
    ')': ['#.', '.#', '.#', '.#', '#.'],
    '[': ['##', '#.', '#.', '#.', '##'],
    ']': ['##', '.#', '.#', '.#', '##'],
    '<': ['..#', '.#.', '#..', '.#.', '..#'],
    '>': ['#..', '.#.', '..#', '.#.', '#..'],
    '#': ['#.#', '###', '#.#', '###', '#.#'],
    '*': ['#.#', '.#.', '#.#'],
    '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
    $: ['.##', '##.', '.#.', '.##', '##.'],
    '→': ['....', '..#.', '####', '..#.'],
    '←': ['....', '.#..', '####', '.#..'],
    '↑': ['.#.', '###', '.#.', '.#.', '.#.'],
    '↓': ['.#.', '.#.', '.#.', '###', '.#.'],
    '♥': ['#.#', '###', '###', '.#.'],
    '★': ['.#.', '###', '.#.', '#.#'],
    '•': ['..', '##', '##'],
    '…': ['.....', '.....', '.....', '.....', '#.#.#'],
    '|': ['#', '#', '#', '#', '#'],
    '_': ['...', '...', '...', '...', '...', '###'],
    '·': ['.', '.', '#', '.', '.'],
    '°': ['#', '.'],
    '—': ['....', '....', '####'],
    '–': ['...', '...', '###'],
    '●': ['.#.', '###', '.#.'],
    '○': ['.#.', '#.#', '.#.'],
  },
};

export const FONTS = { body: BODY, small: SMALL, large: LARGE };

// ---------- named colors used across UI rich text ----------
export const COLORS = {
  white: '#f4ecd8', text: '#f4ecd8', dim: '#9d8f7d', dark: '#2a1d16', ink: '#3a2618',
  chips: '#4fa6ff', mult: '#ff4d4d', xmult: '#ff7a3d', gold: '#ffd25e', coin: '#ffd25e',
  fire: '#ff7b2e', ice: '#7fe3ff', shock: '#ffe74a', poison: '#8fe04a', curse: '#c86bff',
  bleed: '#ff4f6a', holy: '#fff3b0', heal: '#6dff9a', block: '#a9c2d9', crit: '#ffb340',
  common: '#c9c1b3', uncommon: '#5fd17a', rare: '#4fa6ff', epic: '#c071ff', legendary: '#ffb63d',
  good: '#7dff8a', bad: '#ff5d5d', warn: '#ffc04d', key: '#e8c37a', parchment: '#4a3220',
};

const atlases = new Map(); // font -> { canvas, map }
const tinted = new Map(); // font|color -> canvas

function buildAtlas(font) {
  const chars = Object.keys(font.glyphs);
  let x = 0;
  const map = {};
  for (const ch of chars) {
    const g = font.glyphs[ch];
    const w = Math.max(...g.map((r) => r.length));
    map[ch] = { x, w, rows: g };
    x += w + 1;
  }
  const c = document.createElement('canvas');
  c.width = Math.max(1, x); c.height = font.height;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  for (const ch of chars) {
    const m = map[ch];
    m.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') g.fillRect(m.x + rx, ry, 1, 1);
    });
  }
  return { canvas: c, map };
}

function atlas(fontName) {
  let a = atlases.get(fontName);
  if (!a) { a = buildAtlas(FONTS[fontName]); atlases.set(fontName, a); }
  return a;
}

function tint(fontName, color) {
  const key = fontName + '|' + color;
  let c = tinted.get(key);
  if (!c) {
    const a = atlas(fontName);
    c = document.createElement('canvas');
    c.width = a.canvas.width; c.height = a.canvas.height;
    const g = c.getContext('2d');
    g.drawImage(a.canvas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    tinted.set(key, c);
  }
  return c;
}

const resolveColor = (c) => (c && c[0] === '#' ? c : COLORS[c] || c || COLORS.text);

let iconProvider = null; // (name) => { canvas, w, h }
export function setIconProvider(fn) { iconProvider = fn; }

function glyphOf(font, ch) {
  const f = FONTS[font];
  if (f.upper) ch = ch.toUpperCase();
  const a = atlas(font);
  return a.map[ch] || (ch === ' ' ? null : a.map['?']);
}

/** Tokenize rich text into runs: {t:'text', s, color} | {t:'icon', name} | {t:'br'} */
export function parseRich(str, baseColor) {
  const out = [];
  const stack = [baseColor];
  let i = 0, buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', s: buf, color: stack[stack.length - 1] }); buf = ''; } };
  while (i < str.length) {
    const ch = str[i];
    if (ch === '{') {
      const j = str.indexOf('}', i);
      if (j > i) {
        const tag = str.slice(i + 1, j);
        flush();
        if (tag === '/') { if (stack.length > 1) stack.pop(); }
        else if (tag[0] === '@') out.push({ t: 'icon', name: tag.slice(1) });
        else stack.push(resolveColor(tag));
        i = j + 1;
        continue;
      }
    }
    if (ch === '\n') { flush(); out.push({ t: 'br' }); i++; continue; }
    buf += ch; i++;
  }
  flush();
  return out;
}

export function charWidth(font, ch) {
  const f = FONTS[font];
  if (ch === ' ') return f.space + f.spacing;
  const g = glyphOf(font, ch);
  return g ? g.w + f.spacing : 0;
}

/** Inline icons: the compact set for body/small text, the detailed set beside 'large' text. */
function iconFor(name, font) {
  if (!iconProvider) return null;
  return (font !== 'large' && iconProvider(name + ':s')) || iconProvider(name);
}
function iconSize(name, font) {
  const ic = iconFor(name, font);
  return ic ? ic.w + 1 : 0;
}

/** Measure width of rich text (single line, ignores wrapping). */
export function measure(str, font = 'body') {
  let w = 0, best = 0;
  for (const r of parseRich(String(str), COLORS.text)) {
    if (r.t === 'br') { best = Math.max(best, w); w = 0; }
    else if (r.t === 'icon') w += iconSize(r.name, font);
    else for (const ch of r.s) w += charWidth(font, ch);
  }
  return Math.max(best, w) - FONTS[font].spacing;
}

/** Word-wrap rich text to lines of runs. */
export function layout(str, font = 'body', maxW = Infinity, baseColor = COLORS.text) {
  const runs = parseRich(String(str), resolveColor(baseColor));
  // break into word tokens preserving color
  const tokens = [];
  for (const r of runs) {
    if (r.t !== 'text') { tokens.push(r); continue; }
    const parts = r.s.split(/( )/);
    for (const p of parts) if (p !== '') tokens.push({ t: p === ' ' ? 'sp' : 'text', s: p, color: r.color });
  }
  const lines = [[]];
  let w = 0;
  const tokW = (t) => (t.t === 'icon' ? iconSize(t.name, font) : t.t === 'sp' ? charWidth(font, ' ') : [...t.s].reduce((a, c) => a + charWidth(font, c), 0));
  for (const t of tokens) {
    if (t.t === 'br') { lines.push([]); w = 0; continue; }
    const tw = tokW(t);
    if (t.t === 'sp') { if (lines[lines.length - 1].length) { lines[lines.length - 1].push(t); w += tw; } continue; }
    if (w + tw > maxW + FONTS[font].spacing && lines[lines.length - 1].length) {
      const cur = lines[lines.length - 1];
      while (cur.length && cur[cur.length - 1].t === 'sp') cur.pop();
      lines.push([]); w = 0;
    }
    lines[lines.length - 1].push(t); w += tw;
  }
  return lines.map((l) => {
    while (l.length && l[l.length - 1].t === 'sp') l.pop();
    return { runs: l, w: Math.max(0, l.reduce((a, t) => a + tokW(t), 0) - FONTS[font].spacing) };
  });
}

function drawRuns(ctx, runs, x, y, font, overrideColor) {
  const f = FONTS[font];
  let cx = x;
  for (const r of runs) {
    if (r.t === 'icon') {
      const ic = iconFor(r.name, font);
      if (ic) {
        if (!overrideColor) ctx.drawImage(ic.canvas, cx, Math.round(y + f.cap / 2 - ic.h / 2));
        cx += ic.w + 1;
      }
      continue;
    }
    const color = overrideColor || r.color;
    const img = tint(font, color);
    for (const ch of r.s) {
      if (ch === ' ') { cx += f.space + f.spacing; continue; }
      const g = glyphOf(font, ch);
      if (!g) continue;
      ctx.drawImage(img, g.x, 0, g.w, f.height, cx, y, g.w, f.height);
      cx += g.w + f.spacing;
    }
  }
}

/**
 * Draw (rich) text. opts: font, color, align ('left'|'center'|'right'), outline (color), shadow (color),
 * maxW (wrap), lineHeight, thick (8-way outline)
 * Returns {w, h} of the drawn block.
 */
export function drawText(ctx, str, x, y, opts = {}) {
  const font = opts.font || 'body';
  const f = FONTS[font];
  const lh = opts.lineHeight || f.lineHeight;
  const lines = layout(str, font, opts.maxW || Infinity, opts.color || COLORS.text);
  const align = opts.align || 'left';
  x = Math.round(x); y = Math.round(y);
  let maxW = 0;
  lines.forEach((ln, i) => {
    const lx = align === 'center' ? Math.round(x - ln.w / 2) : align === 'right' ? x - ln.w : x;
    const ly = y + i * lh;
    if (opts.shadow) drawRuns(ctx, ln.runs, lx, ly + 1, font, resolveColor(opts.shadow));
    if (opts.outline) {
      const oc = resolveColor(opts.outline);
      const offs = opts.thick ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
      for (const [dx, dy] of offs) drawRuns(ctx, ln.runs, lx + dx, ly + dy, font, oc);
      if (opts.shadow === undefined && opts.outlineShadow !== false) drawRuns(ctx, ln.runs, lx, ly + 2, font, oc);
    }
    drawRuns(ctx, ln.runs, lx, ly, font, null);
    maxW = Math.max(maxW, ln.w);
  });
  return { w: maxW, h: lines.length * lh - (lh - f.cap) };
}

/** Big text: renders body font scaled ×s with gradient fill + outline (for titles, damage numbers). */
const bigCache = new Map();
export function bigText(str, opts = {}) {
  const s = opts.scale || 2;
  const key = [str, s, opts.top, opts.bottom, opts.outline, opts.font].join('|');
  let c = bigCache.get(key);
  if (c) return c;
  const font = opts.font || 'body';
  const f = FONTS[font];
  const w = Math.max(1, measure(str, font));
  const base = document.createElement('canvas');
  base.width = w; base.height = f.height;
  drawText(base.getContext('2d'), str, 0, 0, { font, color: '#ffffff' });
  // scale up, gradient fill
  const pad = 2;
  c = document.createElement('canvas');
  c.width = w * s + pad * 2; c.height = f.height * s + pad * 2 + 1;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const fill = document.createElement('canvas');
  fill.width = w * s; fill.height = f.height * s;
  const fg = fill.getContext('2d');
  fg.imageSmoothingEnabled = false;
  const top = opts.top || '#fff6d8', bottom = opts.bottom || '#ffb84a';
  const capPx = f.cap * s;
  // banded (not smooth) gradient — pixel-art style — painted first, then masked by the glyphs
  const bands = Math.max(3, Math.round(capPx / s));
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    fg.fillStyle = mixColor(top, bottom, t);
    fg.fillRect(0, Math.floor((i / bands) * capPx), fill.width, Math.ceil(capPx / bands) + 1);
  }
  fg.fillStyle = mixColor(bottom, '#000000', 0.25);
  fg.fillRect(0, capPx, fill.width, fill.height);
  if (opts.highlight !== false) {
    fg.fillStyle = 'rgba(255,255,255,0.55)';
    fg.fillRect(0, 0, fill.width, Math.max(1, Math.floor(s / 2)));
  }
  fg.globalCompositeOperation = 'destination-in';
  fg.drawImage(base, 0, 0, w * s, f.height * s);
  fg.globalCompositeOperation = 'source-over';
  // outline: dilate silhouette
  const oc = opts.outline || '#2a1208';
  const sil = document.createElement('canvas');
  sil.width = fill.width; sil.height = fill.height;
  const sg = sil.getContext('2d');
  sg.drawImage(fill, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = oc; sg.fillRect(0, 0, sil.width, sil.height);
  const o = opts.outlineWidth || Math.max(1, Math.floor(s / 2));
  for (let dy = -o; dy <= o + 1; dy++) for (let dx = -o; dx <= o; dx++) g.drawImage(sil, pad + dx, pad + dy);
  g.drawImage(fill, pad, pad);
  bigCache.set(key, c);
  if (bigCache.size > 300) bigCache.delete(bigCache.keys().next().value);
  return c;
}

function mixColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}
