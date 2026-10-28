// Hand-authored pixel icons. Rows are palette-indexed; most icons get an automatic dark outline.
import { fromStrings, Painter, withOutline, makeCanvas } from '../art/pixel.js';

export const PAL = {
  k: '#140c10', K: '#2a1d22', w: '#fff6e0', W: '#ffffff',
  y: '#ffd25e', Y: '#fff0a8', o: '#d9902b', O: '#9a5a1a',
  r: '#e83b3b', R: '#ff8a7a', m: '#9a1f2e',
  b: '#4fa6ff', B: '#a8dcff', n: '#2a5fb0',
  g: '#5fd17a', G: '#b8f5a8', e: '#2e8a4a',
  p: '#b06bff', P: '#e0b8ff', v: '#6a2fb0',
  s: '#9aa3b2', S: '#dfe6ee', d: '#5b6170',
  c: '#7fe3ff', C: '#e6fbff', u: '#3a8fc0',
  f: '#ff7b2e', F: '#ffe08a', l: '#ffe74a', L: '#fffbd0',
  h: '#8a5a33', H: '#c48a52', j: '#5a3820',
  t: '#e8d3a3', T: '#b89a68', q: '#8a6a40',
  x: '#6b6058', X: '#a39787', z: '#3d3530',
  i: '#ff4f6a', I: '#ffb3c0',
};

// name: [rows, outline?]
const DEFS = {
  coin: [[
    '.yyyyy.',
    'yYYYyyo',
    'yYyOyyo',
    'yYOyOyo',
    'yyyOyyo',
    'yyyyyoo',
    '.ooooo.',
  ]],
  heart: [[
    '.rr.rr.',
    'rRRrrrm',
    'rRrrrrm',
    'rrrrrrm',
    '.rrrrm.',
    '..rrm..',
    '...m...',
  ]],
  chips: [[
    '...b...',
    '..BBb..',
    '.BBbbn.',
    'BBbbbbn',
    '.bbbbn.',
    '..bbn..',
    '...n...',
  ]],
  mult: [[
    '.rrrrr.',
    'rRWrrrm',
    'rRRrrrm',
    'rrrrrrm',
    'rrrrrmm',
    'mrrrmmm',
    '.mmmmm.',
  ]],
  xmult: [[
    'fffffff',
    'fFwfwFO',
    'fFfwfFO',
    'fFwfwFO',
    'fffffFO',
    'fOOOOOO',
  ]],
  fire: [[
    '...f...',
    '..fFf..',
    '..fFf.f',
    '.fFFFff',
    'fFFwFFf',
    'fFwwwFf',
    '.fFFFf.',
  ]],
  ice: [[
    '...c...',
    '.c.C.c.',
    '..cCc..',
    'cCCWCCc',
    '..cCc..',
    '.c.C.c.',
    '...c...',
  ]],
  shock: [[
    '...lll',
    '..lLl.',
    '.lLl..',
    'lLLLLl',
    '..lLl.',
    '.lLl..',
    '.ll...',
  ]],
  poison: [[
    '...g...',
    '...g...',
    '..gGg..',
    '.gGggg.',
    'gGGgggg',
    'gGggggg',
    '.ggggg.',
  ]],
  curse: [[
    '..ppp..',
    '.pPPPp.',
    'pPkkkPp',
    'pPkPkPp',
    'pPkkkPp',
    '.pPPPp.',
    '..ppp..',
  ]],
  bleed: [[
    '...i...',
    '..iIi..',
    '.iIii..',
    '.iIiii.',
    'iIiiiim',
    '.iiiim.',
    '..mmm..',
  ]],
  holy: [[
    '...Y...',
    '.Y.y.Y.',
    '..yYy..',
    'YyYWYyY',
    '..yYy..',
    '.Y.y.Y.',
    '...Y...',
  ]],
  sword: [[
    '......S',
    '.....Ss',
    '....Ssd',
    '.y.Ssd.',
    '..ysd..',
    '.hHy...',
    'hHyy...',
    'jh.y...',
  ]],
  dagger: [[
    '.....S',
    '....Sd',
    '...Sd.',
    '.yyd..',
    '.hy...',
    'jh.y..',
  ]],
  axe: [[
    '..sss..',
    '.sSSss.',
    'sSSdhds',
    '.sd.h..',
    '....h..',
    '....h..',
    '....j..',
  ]],
  hammer: [[
    'dsssss.',
    'sSSSSsd',
    'sSSSSsd',
    'dssssdd',
    '...h...',
    '...H...',
    '...h...',
    '...j...',
  ]],
  spear: [[
    '.....S',
    '....Ss',
    '...Sd.',
    '..h...',
    '.h....',
    'h.....',
  ]],
  staff: [[
    '.ppp.',
    'pPWPp',
    'pPPpv',
    '.vhv.',
    '..h..',
    '..h..',
    '..H..',
    '..j..',
  ]],
  shield: [[
    'ssssssss',
    'sSSyySSd',
    'sSyYYySd',
    'sSyyyySd',
    '.sSyySd.',
    '.sSSSSd.',
    '..sSSd..',
    '...dd...',
  ]],
  pickaxe: [[
    '.sssss.',
    'sSSSSSs',
    'd..H..d',
    '...h...',
    '...h...',
    '...h...',
    '...j...',
  ]],
  key: [[
    '.yyy...',
    'yY.yy..',
    'yy.yyyy',
    '.yyy.yo',
    '.....o.',
  ]],
  scroll: [[
    'TttttT.',
    'tTqqqtT',
    '.tqqqt.',
    '.tTqTt.',
    '.tqqqt.',
    'TttttT.',
  ]],
  chest: [[
    '.hhhhhh.',
    'hHHHHHHj',
    'hjjyyjjj',
    'yyyYyyyy',
    'hHHyyHHj',
    'hHHHHHHj',
    'jjjjjjjj',
  ]],
  skull: [[
    '.SSSSS.',
    'SSWSSSs',
    'SkkSkks',
    'SkkSkks',
    '.SSkSs.',
    '.sSsSs.',
  ]],
  crown: [[
    'y..y..y',
    'yy.Y.yy',
    'yYyYyYo',
    'yyyyyyo',
    'yrybyro',
    'oooooOO',
  ]],
  question: [[
    '.yyyy.',
    'yY..yo',
    '....yo',
    '..yyo.',
    '..yo..',
    '......',
    '..yo..',
  ]],
  bag: [[
    '..hjh..',
    '.h...h.',
    '.hhhhh.',
    'hHHyHHj',
    'hHyYyHj',
    'hHHyHHj',
    '.jjjjj.',
  ]],
  campfire: [[
    '...f...',
    '..fFf..',
    '.fFwFf.',
    '.fFFFf.',
    'jHhjhHj',
    '.jHjHj.',
  ]],
  star: [[
    '...y...',
    '...Y...',
    'yyYYYyy',
    '.oYYYo.',
    '..yYy..',
    '.yo.oy.',
    '.o...o.',
  ]],
  speed: [[
    '...SSS.',
    '..SSs..',
    'dsSS...',
    '.ddSSs.',
    '...Ss..',
    '..Ss...',
  ]],
  crit: [[
    '...r...',
    '.r.R.r.',
    '..rWr..',
    'rRWWWRr',
    '..rWr..',
    '.r.R.r.',
    '...r...',
  ]],
  gem: [[
    '.cCCc.',
    'cCWCcu',
    'ccCccu',
    '.ccuu.',
    '..cu..',
  ]],
  ore: [[
    '..xxx..',
    '.xXXyx.',
    'xXyYxxz',
    'xxxxyxz',
    'xyxxxzz',
    '.zzzzz.',
  ]],
  bone: [[
    'SS...SS',
    'SSSSSSs',
    '.Ss.Ss.',
    'sSSSSSs',
    'sS...sS',
  ]],
  fang: [[
    'SSSSS',
    'SWSSs',
    '.SSs.',
    '.Ss..',
    '..s..',
  ]],
  lock: [[
    '.sss.',
    's...s',
    's...s',
    'yyyyy',
    'yYkYo',
    'yykyo',
    'ooooo',
  ]],
  eye: [[
    '..www..',
    '.wwbbww',
    'wwbkkbw',
    '.wwbbww',
    '..www..',
  ]],
  sparkle: [[
    '..W..',
    '..W..',
    'WWWWW',
    '..W..',
    '..W..',
  ], false],
  block: [[
    'ssssss',
    'sSSSSd',
    'sSssSd',
    'sSssSd',
    '.sSSd.',
    '..dd..',
  ]],
  lifesteal: [[
    'r...r.',
    'rRrRrm',
    'rrrrrm',
    '.rWrm.',
    '..rm..',
  ]],
  clock: [[
    '.sss.',
    'sSkSs',
    'sSkSs',
    'sSSks',
    '.sss.',
  ]],
  arrowR: [['w...', 'ww..', 'www.', 'wwww', 'www.', 'ww..', 'w...'], false],
  arrowL: [['...w', '..ww', '.www', 'wwww', '.www', '..ww', '...w'], false],
  arrowD: [['wwwwwww', '.wwwww.', '..www..', '...w...'], false],
  arrowU: [['...w...', '..www..', '.wwwww.', 'wwwwwww'], false],
  check: [['.....g', '....gg', 'g..gg.', 'gggg..', '.gg...'], true],
  cross: [['r...r', '.r.r.', '..r..', '.r.r.', 'r...r'], true],
  dot: [['ww', 'ww'], false],
  hp: [[
    '.rr.rr.',
    'rRRrrrm',
    'rRrrrrm',
    'rrrrrrm',
    '.rrrrm.',
    '..rrm..',
    '...m...',
  ]],
  mouseL: [[
    '.ywss.',
    'yywsss',
    'yywsss',
    'wwwwww',
    'ssssss',
    'ssssss',
    '.ssss.',
  ]],
  mouseR: [[
    '.sswy.',
    'ssswyy',
    'ssswyy',
    'wwwwww',
    'ssssss',
    'ssssss',
    '.ssss.',
  ]],
  monster: [[
    'S.....S.',
    'SS...SS.',
    '.rrrrr..',
    'rRkrRkr.',
    'rrrrrrm.',
    'rSrSrSm.',
    '.mmmmm..',
  ]],
  elite: [[
    'S.....S',
    'SS...SS',
    '.SSSSS.',
    'SkkSkkS',
    'SkpSkpS',
    '.SSkSS.',
    '.sSsSs.',
  ]],
  boss: [[
    'y.y.y.y',
    'yyYyYyy',
    '.SSSSS.',
    'SkkSkkS',
    'SkrSkrS',
    '.SSkSS.',
    '.sSsSs.',
  ]],
  mining: [[
    '.ssss...',
    'sSSSSs..',
    'd..hSd..',
    '...h.d..',
    '.xxhxx..',
    'xXcXxyx.',
    'xxxxxxz.',
  ]],
  treasure: [[
    '.hhhhhh.',
    'hHHHHHHj',
    'hjjyyjjj',
    'yyyYyyyy',
    'hHHyyHHj',
    'hHHHHHHj',
    'jjjjjjjj',
  ]],
  merchant: [[
    '..yyy..',
    '.yY.yo.',
    '..hjh..',
    '.hHHHj.',
    'hHyYyHj',
    'hHHyHHj',
    '.jjjjj.',
  ]],
  event: [[
    '.pppp.',
    'pP..pv',
    '....pv',
    '..ppv.',
    '..pv..',
    '......',
    '..pv..',
  ]],
  camp: [[
    '...h...',
    '..hHh..',
    '.hHfHh.',
    'hHfFfHj',
    'hHFwFHj',
    'jjjjjjj',
  ]],
  start: [[
    'hrrr.',
    'hRrrr',
    'hrrm.',
    'h....',
    'h....',
    'j....',
  ]],
  forge: [[
    '..fff..',
    '.fFwFf.',
    'zxxxxxz',
    'zXxxxXz',
    '.zxxxz.',
    '.z...z.',
  ]],
  rune: [[
    '.ppppp.',
    'pPPkPPv',
    'pPkkkPv',
    'pPPkPPv',
    'pPkPkPv',
    '.vvvvv.',
  ]],
  tool: [[
    '..dd.',
    '.dSSd',
    '.dSd.',
    '.hd..',
    'hj...',
  ]],
  bomb: [[
    '....F',
    '...h.',
    '.KKK.',
    'KdKKK',
    'KKKKK',
    '.KKK.',
  ]],
  drill: [[
    'ssss.',
    'sSSss',
    '.sSs.',
    '.sSs.',
    '..s..',
  ]],
  radar: [[
    '.gggg.',
    'gGeeeg',
    'geGeeg',
    'geeWeg',
    'geeeeg',
    '.gggg.',
  ]],
  scanner: [[
    'dssssd',
    'sCccCs',
    'scCCcs',
    'sCccCs',
    'dssssd',
    '..hh..',
  ]],
  flare: [[
    '..F..',
    '.FwF.',
    '..F..',
    '..r..',
    '..r..',
    '..m..',
  ]],
  part: [[
    '..SS.',
    '.SWSs',
    'SSSs.',
    'Ss...',
    's....',
  ]],
  harvest: [[
    '....S',
    '...Ss',
    'r.Ss.',
    'rrs..',
    '.r...',
  ]],
  quality: [[
    '..y..',
    '.yYy.',
    'yYYYo',
    '.yyo.',
    '..o..',
  ]],
  recipe: [[
    'tttttT',
    'tqqqqT',
    'tttttT',
    'tqqtTT',
    'tttttT',
    'TTTTTT',
  ]],
  flee: [[
    '..w...',
    '.www..',
    'wwwww.',
    '.www.w',
    '.w.w..',
    'w...w.',
  ]],
  bridge: [[
    'h.h.h.h',
    'hhhhhhh',
    'H.H.H.H',
    'j.....j',
  ]],
  minecart: [[
    'dsssssd',
    'sxxyxxs',
    'dsssssd',
    '.kk.kk.',
  ]],
  elevator: [[
    'hhhhh',
    'h.s.h',
    'hsSsh',
    'hhhhh',
    '..s..',
  ]],
};

const cache = new Map();

export function icon(name) {
  let c = cache.get(name);
  if (c) return c;
  const def = DEFS[name];
  if (!def) return null;
  const [rows, outline = true] = def;
  let canvas = fromStrings(rows, PAL);
  if (outline) canvas = withOutline(canvas, PAL.k);
  c = { canvas, w: canvas.width, h: canvas.height };
  cache.set(name, c);
  return c;
}
export const iconNames = () => Object.keys(DEFS);

/** Register a generated sprite under an icon name (for rich text {@name}). */
export function registerIcon(name, canvas) { cache.set(name, { canvas, w: canvas.width, h: canvas.height }); }

/** Keycap prompt sprite, e.g. keycap('SPACE'). */
const capCache = new Map();
export function keycap(label, pressed = false) {
  const k = label + pressed;
  if (capCache.has(k)) return capCache.get(k);
  // measure with small font metrics (3px glyphs + 1 spacing; M/W are 5)
  const wide = (ch) => (ch === 'M' || ch === 'W' ? 5 : ch === 'N' ? 4 : ch === ' ' ? 2 : ch === '1' ? 3 : 3);
  const tw = [...label].reduce((a, ch) => a + wide(ch) + 1, -1);
  const w = Math.max(9, tw + 6), h = 11;
  const p = new Painter(w, h);
  const top = pressed ? 2 : 0;
  p.rect(1, 1 + top, w - 2, h - 2 - top, '#2a1d22');
  p.rect(1, 0 + top, w - 2, h - 3 - (pressed ? 1 : 0), '#e9dcc0');
  p.rect(2, 1 + top, w - 4, h - 5 - (pressed ? 1 : 0), '#f8f0dc');
  p.hline(2, w - 3, h - 3, pressed ? '#2a1d22' : '#b8a888');
  p.outline('#140c10');
  const c = p.toCanvas();
  const out = { canvas: c, w: c.width, h: c.height, label, textY: 3 + top, textX: Math.floor((c.width - tw) / 2) };
  capCache.set(k, out);
  return out;
}

/** Element → icon name */
export const ELEMENT_ICON = { fire: 'fire', ice: 'ice', shock: 'shock', poison: 'poison', curse: 'curse', bleed: 'bleed', holy: 'holy' };

export function iconSheet(scale = 4) {
  // debug helper: all icons on one canvas
  const names = iconNames();
  const cols = 12;
  const cell = 16;
  const c = makeCanvas(cols * cell * scale, Math.ceil(names.length / cols) * cell * scale);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#3b2b33'; g.fillRect(0, 0, c.width, c.height);
  names.forEach((n, i) => {
    const ic = icon(n);
    g.drawImage(ic.canvas, (i % cols) * cell * scale, Math.floor(i / cols) * cell * scale, ic.w * scale, ic.h * scale);
  });
  return c;
}
