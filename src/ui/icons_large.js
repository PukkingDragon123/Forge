// Detailed 14 px icons, authored as material silhouettes and auto-shaded:
// volume gradient (light from top-left), lit rims, shadowed undersides, specular glints, warm outline.
// Letters = materials (see RAMPS); uppercase = forced highlight; k = engraved dark; * = white glint.
import { Painter } from '../art/pixel.js';

export const RAMPS = {
  y: ['#7a3c0c', '#b0661a', '#e09a2a', '#ffc848', '#fff0a8'],
  o: ['#4a2206', '#7a400e', '#a8641a', '#d08a2a', '#f0b450'],
  r: ['#5a0e16', '#9a1f2e', '#d83a3a', '#ff6a5a', '#ffb0a0'],
  b: ['#10285a', '#1e4a9a', '#3a7ae0', '#6aaaff', '#c0e0ff'],
  g: ['#0e3a1a', '#1e6a2e', '#3aa848', '#70d870', '#c0f5b0'],
  p: ['#2a0e4a', '#4a2078', '#7a40c0', '#a870f0', '#e0c0ff'],
  s: ['#2a2e38', '#4a5060', '#8a92a2', '#c0c8d4', '#f0f6fa'],
  h: ['#3a1e0e', '#5a3418', '#8a5a33', '#b07a48', '#d8a070'],
  t: ['#6a4a28', '#a07a48', '#d8b882', '#ecd6a6', '#fff4d8'],
  f: ['#8a1a06', '#d0400e', '#ff7a1e', '#ffb840', '#fff0a0'],
  c: ['#1a4a7a', '#2a7ab0', '#5ac0f0', '#a8e8ff', '#f0fcff'],
  l: ['#8a5a00', '#d09a10', '#ffd630', '#fff07a', '#ffffe0'],
  x: ['#6a5a44', '#a08c6a', '#d8c8a4', '#f0e6cc', '#fffaf0'],
  K: ['#14141a', '#26262e', '#3a3a46', '#56566a', '#8a8aa0'],
  i: ['#4a0614', '#8a1028', '#d02a48', '#ff5a72', '#ffb0c0'],
  n: ['#0e1c28', '#22445e', '#2e5c7c', '#4a8ab0', '#9ad0ea'],
  m: ['#3a0a3a', '#6a1a6a', '#b03ab0', '#e070e0', '#ffc0ff'],
  w: ['#7a7a8a', '#a8a8b8', '#dcdce6', '#f2f2f8', '#ffffff'],
  z: ['#2a221e', '#4a3e36', '#6e6054', '#968676', '#c0b0a0'],
};
const OUT = '#1c100c';

export const LARGE = {
  coin: ['.....yyyy.....', '...yyyyyyyy...', '..yyyyyyyyyy..', '.yyyyyyyyyyyy.', '.yyy*yyyyyyyy.', 'yyy*yyyyyyykyy', 'yyyyyyYYyyykyy', 'yyyyyyYYyyykyy', 'yyyyyyyyyyykyy', '.yyyyyyyyykyy.', '.yyykkkkkkyyy.', '..yyyyyyyyyy..', '...yyyyyyyy...', '.....yyyy.....'],
  heart: ['..rrr....rrr..', '.rrrrr..rrrrr.', 'rrrrrrrrrrrrrr', 'rr*rrrrrrrrrrr', 'r**rrrrrrrrrrr', 'rrrrrrrrrrrrrr', '.rrrrrrrrrrrr.', '..rrrrrrrrrr..', '...rrrrrrrr...', '....rrrrrr....', '.....rrrr.....', '......rr......'],
  chips: ['....bbbbbb....', '..bbBwwwwBbb..', '.bBwbbbbbbwBb.', '.bwbbbBBbbbwb.', '.bBwbbbbbbwBb.', '..bbBwwwwBbb..', '.kbbbbbbbbbbk.', '.bwbbwbbwbbwb.', '.kkbbbbbbbbkk.', '.bbbbbbbbbbbb.', '.bwbbwbbwbbwb.', '.kbbbbbbbbbbk.', '..kkbbbbbbkk..'],
  mult: ['...rrrrrrrr...', '..rRRrRRrRRr..', '.rRRrrkrrkrrr.', 'rrrrkrrrrkrrrr', 'rkkkkkkkkkkkkr', '.rrrkrrrrkrrr.', '..rrrkrrkrrr..', '...rrrkkrrr...', '....rrrkrrr...', '.....rrrrr....', '......rrr.....', '.......r......'],
  xmult: ['...zzzzzzz....', '.zzzzzzzzzzz..', 'zzffzzzzzffzz.', 'zzzffzzzffzzzz', '.zzzffzffzzzzz', '.zzzzfFfzzzzz.', '.zzzzfFfzzzzz.', 'zzzzffzffzzzz.', 'zzzffzzzffzzzz', 'zzffzzzzzffzz.', '.zzzzzzzzzzzz.', '..zzzzzzzzzz..', '....zzzzzz....'],
  fire: ['......f.......', '.....ff.......', '.....fff......', '....ffff...f..', '....fffff.ff..', '...fffFffffff.', '..ffffFFfffff.', '..fffFFFFffff.', '.ffffFllFfffff', '.fffFllllFffff', '.fffFllWlFffff', '..ffFllllFfff.', '...ffFFFFfff..', '....ffffffff..'],
  ice: ['......cc......', '....c.cc.c....', '.....cccc.....', '..c...cc...c..', '...cc.cc.cc...', '....cccccc....', 'cccccCCCCccccc', 'cccccCCCCccccc', '....cccccc....', '...cc.cc.cc...', '..c...cc...c..', '.....cccc.....', '....c.cc.c....', '......cc......'],
  shock: ['........lll...', '.......lll....', '......lll.....', '.....lll......', '....lll.......', '...llllllll...', '..lLLLLLLll...', '......lll.....', '.....lll......', '....lll.......', '...ll.........', '..l...........'],
  poison: ['.....gg.....', '.....gg.....', '....gggg....', '....gggg....', '...gggggg...', '..gggggggg..', '.gGgggggggg.', '.gGggggGggg.', 'gGgggggggggg', 'ggggggggGggg', 'gggggggggggg', '.gggggggggg.', '..gggggggg..', '....gggg....'],
  bleed: ['.....ii.....', '.....ii.....', '....iiii....', '....iiii....', '...iiiiii...', '..iiiiiiii..', '.iIiiiiiiii.', '.iIiiiiiiii.', 'iIiiiiiiiiii', 'iiiiiiiiiiii', 'iiiiiiiiiiii', '.iiiiiiiiii.', '..iiiiiiii..', '....iiii....'],
  curse: ['.....pppp.....', '...ppwwwwpp...', '..pwwwppwwwp..', '.pwwppppppwwp.', 'pwwpppkkpppwwp', 'pwwppkkkkppwwp', 'pwwppkkkkppwwp', 'pwwpppkkpppwwp', '.pwwppppppwwp.', '..pwwwppwwwp..', '...ppwwwwpp...', '.....pppp.....'],
  holy: ['......y.......', '......y.......', '...y..y..y....', '....yyyyy.....', '...yyyYyyy....', 'yyyyyYYYyyyyy.', '...yyyYyyy....', '....yyyyy.....', '...y..y..y....', '......y.......', '......y.......'],
  sword: ['............ss', '...........sSs', '..........sSs.', '.........sSs..', '........sSs...', '.......sSs....', '...y..sSs.....', '....ysSs......', '.....yy.......', '....hyyy......', '...hh..yy.....', '..hh....y.....', '.yh...........', 'yy............'],
  dagger: ['..........ss', '.........sSs', '........sSs.', '.......sSs..', '..y...sSs...', '...y.sSs....', '....yys.....', '...hyyy.....', '..hh..y.....', '.hh.........', 'yy..........'],
  axe: ['..ssss........', '.sSSssss......', 'sSSsssssh.....', 'sSsssssshh....', 'ssssssssh.....', 'sssssssh......', '.sssss.h......', '...ss..h......', '.......h......', '.......h......', '.......h......', '.......h......', '......hhh.....'],
  hammer: ['.ssssssssssss.', 'sSSSSSSSsssssk', 'sSssssssssssk.', 'ssssssssssssk.', '.sssssssssskk.', '......hh......', '......hh......', '......hh......', '......hh......', '......hh......', '.....yyyy.....', '......hh......', '......hh......', '.....hhhh.....'],
  spear: ['...........ss.', '..........sSss', '.........sSss.', '........sSss..', '.......ssss...', '......hyy.....', '.....hh.......', '....hh........', '...hh.........', '..hh..........', '.hh...........', 'hh............'],
  staff: ['.....ppp......', '....pPPpp.....', '....pPppp.....', '....ppppp.....', '.....ppp......', '......h.......', '.....yhy......', '......h.......', '......h.......', '......h.......', '......h.......', '......h.......', '......h.......', '.....hhh......'],
  shield: ['ssssssssssssss', 'sbbbbbbbbbbbbs', 'sbBBbbbbbbbbbs', 'sbBbbbyybbbbbs', 'sbbbbyYYybbbbs', 'sbbbbyyyybbbbs', '.sbbbbyybbbbs.', '.sbbbbbbbbbbs.', '..sbbbbbbbbs..', '...sbbbbbbs...', '....sbbbbs....', '.....ssss.....'],
  pickaxe: ['..ssssssssss..', '.sSSSssssssss.', 'ss....hh....ss', 's.....hh.....s', '......hh......', '......hh......', '......hh......', '......hh......', '......hh......', '......hh......', '......hh......', '.....hhhh.....'],
  key: ['..yyyy........', '.yyYYyy.......', 'yyy..yyy......', 'yy....yyyyyyyy', 'yyy..yyyyyyyyy', '.yyyyyy..yy.yy', '..yyyy...yy.yy'],
  scroll: ['.hhhhhhhhhhhh.', 'hhtttttttttthh', '.hhhhhhhhhhhh.', '..tttttttttt..', '..tkkkkkkktt..', '..tttttttttt..', '..tkkkkkttt...', '..tttttttttt..', '..tkkkkkkktt..', '..tttttttttt..', '.hhhhhhhhhhhh.', 'hhtttttttttthh', '.hhhhhhhhhhhh.'],
  chest: ['..hhhhhhhhhh..', '.hhhhhhhhhhhh.', 'hhhhhhhhhhhhhh', 'hhhhhhhhhhhhhh', 'yyyyyyyyyyyyyy', 'hhhhhyyyyhhhhh', 'hhhhhykkyhhhhh', 'hhhhhyyyyhhhhh', 'hhhhhhhhhhhhhh', 'hhhhhhhhhhhhhh', 'yhhhhhhhhhhhhy', 'yyyyyyyyyyyyyy'],
  skull: ['...xxxxxxxx...', '..xxxxxxxxxx..', '.xxxxxxxxxxxx.', '.xxxxxxxxxxxx.', 'xxxkkkxxkkkxxx', 'xxkkkkxxkkkkxx', 'xxkkkxxxxkkkxx', '.xxxxxkkxxxxx.', '..xxxxkkxxxx..', '...xxxxxxxx...', '...xkxkxkxk...', '...xxxxxxxx...'],
  crown: ['y.....yy.....y', 'yy...yyyy...yy', 'yyy.yyyyyy.yyy', 'yyyyyyyyyyyyyy', 'yyyyyyyyyyyyyy', 'yyrryybbyyrryy', 'yyrryybbyyrryy', 'yyyyyyyyyyyyyy', 'oooooooooooooo'],
  question: ['...yyyyyy...', '..yyyyyyyy..', '.yyy....yyy.', '.yy......yy.', '.........yy.', '........yyy.', '......yyyy..', '.....yyy....', '.....yy.....', '............', '.....yy.....', '.....yy.....'],
  bag: ['.....hhhh.....', '....h....h....', '....hhhhhh....', '...hhhhhhhh...', '..hhhhhhhhhh..', '.hhhhhyyhhhhh.', '.hhhhyyyyhhhh.', 'hhhhhhyyhhhhhh', 'hhhhhhhhhhhhhh', 'hhhhhhhhhhhhhh', '.hhhhhhhhhhhh.', '..hhhhhhhhhh..'],
  campfire: ['......f.......', '.....fff......', '....ffFff.....', '...ffFFFff....', '...fFFlFFf....', '...fFlllFf....', '....fllWf.....', 'hh..ffff..hh..', '.hhhhhhhhhh...', '..hhhhhhhh....', '.hh..hh..hh...'],
  star: ['......yy......', '......yy......', '.....yyyy.....', '.....yyyy.....', 'yyyyyyYYyyyyyy', '.yyyyyYYyyyyy.', '..yyyyyyyyyy..', '...yyyyyyyy...', '...yyyyyyyy...', '..yyyy..yyyy..', '..yyy....yyy..', '.yy........yy.'],
  gem: ['...cccccccc...', '..cCCcccccccc.', '.cCCccccccccc.', 'cccccccccccccc', '.cccccccccccc.', '..cccccccccc..', '...cccccccc...', '....cccccc....', '.....cccc.....', '......cc......'],
  ore: ['.....zzzz.....', '...zzzzzzzz...', '..zzzzyzzzzz..', '.zzzzyyzzzzzz.', 'zzzzzzzzzyyzzz', 'zzyyzzzzzyzzzz', 'zzzyzzzzzzzzzz', '.zzzzzzzczzzz.', '..zzzzzcczzz..', '...zzzzzzzz...'],
  bone: ['.xx........xx.', 'xxxx......xxxx', '.xxxxxxxxxxxx.', '.xxxxxxxxxxxx.', 'xxxx......xxxx', '.xx........xx.'],
  fang: ['xxxxxxxx', 'xxxxxxxx', '.xxxxxx.', '.xxxxxx.', '..xxxx..', '..xxxx..', '...xx...', '...x....'],
  lock: ['....ssss....', '...ss..ss...', '..ss....ss..', '..ss....ss..', '.yyyyyyyyyy.', '.yyyyyyyyyy.', '.yyyykkyyyy.', '.yyyykkyyyy.', '.yyyyykyyyy.', '.yyyyyyyyyy.', '..yyyyyyyy..'],
  eye: ['....wwwwww....', '..wwwwwwwwww..', '.wwwwbbbbwwww.', 'wwwwbbkkbbwwww', 'wwwwbbkkbbwwww', '.wwwwbbbbwwww.', '..wwwwwwwwww..', '....wwwwww....'],
  check: ['...........gg', '..........ggg', '.........ggg.', '.gg.....ggg..', '.ggg...ggg...', '..ggg.ggg....', '...ggggg.....', '....ggg......', '.....g.......'],
  cross: ['rr......rr', 'rrr....rrr', '.rrr..rrr.', '..rrrrrr..', '...rrrr...', '..rrrrrr..', '.rrr..rrr.', 'rrr....rrr', 'rr......rr'],
  recipe: ['..rrrrrrrrrr..', '.rrrrrrrrrrrr.', '.rryyyyyyyyrrt', '.rryrrrrrryrrt', '.rryryyyyryrrt', '.rryrrrrrryrrt', '.rryyyyyyyyrrt', '.rrrrrrrrrrrrt', '.rrrrrrrrrrrrt', '.rrrrrrrrrrrtt', '..tttttttttttt'],
  hp: ['..rrr....rrr..', '.rrrrr..rrrrr.', 'rrrrrrrrrrrrrr', 'rr*rrrrrrrrrrr', 'r**rrrrrrrrrrr', 'rrrrrrrrrrrrrr', '.rrrrrrrrrrrr.', '..rrrrrrrrrr..', '...rrrrrrrr...', '....rrrrrr....', '.....rrrr.....', '......rr......'],
  monster: ['x............x', 'xx..........xx', '.xxrrrrrrrrxx.', '..rrrrrrrrrr..', '.rrrkkrrkkrrr.', '.rrryyrryyrrr.', '.rrrrrrrrrrrr.', '.rrkxkxkxkxrr.', '.rrkkkkkkkkrr.', '..rrrrrrrrrr..'],
  elite: ['x............x', 'xx..........xx', '.xxxxxxxxxxxx.', '.xxxxxxxxxxxx.', 'xxxkkkxxkkkxxx', 'xxxkpkxxkpkxxx', 'xxxkkkxxkkkxxx', '.xxxxxkkxxxxx.', '..xxxxxxxxxx..', '..xkxkxkxkxx..'],
  boss: ['.y...y..y...y.', '.yy.yyyyyy.yy.', '.yyyyyyyyyyyy.', '.xxxxxxxxxxxx.', 'xxxkkkxxkkkxxx', 'xxxkrkxxkrkxxx', 'xxxkkkxxkkkxxx', '.xxxxxkkxxxxx.', '..xxxxxxxxxx..', '..xkxkxkxkxx..'],
  mining: ['..sssssss.....', '.sSSssssss....', 'ss...hh..ss...', '.....hh.......', '....zhhzz.....', '..zzzhhzzzz...', '.zzczzzzzyzz..', 'zzzzzzzzzzzzz.', '.zzzzzzzzzzz..'],
  treasure: ['..hhhhhhhhhh..', '.hhhhhhhhhhhh.', 'hhhhhhhhhhhhhh', 'hhhhhhhhhhhhhh', 'yyyyyyyyyyyyyy', 'hhhhhyyyyhhhhh', 'hhhhhykkyhhhhh', 'hhhhhyyyyhhhhh', 'hhhhhhhhhhhhhh', 'hhhhhhhhhhhhhh', 'yhhhhhhhhhhhhy', 'yyyyyyyyyyyyyy'],
  merchant: ['.....yyyy.....', '....yyyyyy....', '.....yyyy.....', '.....hhhh.....', '....h....h....', '...hhhhhhhh...', '..hhhhyyhhhh..', '.hhhhyyyyhhhh.', '.hhhhhyyhhhhh.', '.hhhhhhhhhhhh.', '..hhhhhhhhhh..'],
  event: ['...pppppp...', '..pppppppp..', '.ppp....ppp.', '.pp......pp.', '.........pp.', '........ppp.', '......pppp..', '.....ppp....', '.....pp.....', '............', '.....pp.....', '.....pp.....'],
  camp: ['......hh......', '.....hhhh.....', '....hhhhhh....', '...hhhkkhhh...', '..hhhkffkhhh..', '.hhhhkFFkhhhh.', 'hhhhhkFWkhhhhh', 'hhhhhkkkkhhhhh'],
  start: ['hrrrrrrrr.....', 'hrrRrrrrrr....', 'hrrrrrrrrrr...', 'hrrrrrrrrr....', 'hrrrrrrrr.....', 'h.............', 'h.............', 'h.............', 'h.............', 'hh............'],
  forge: ['....ff.f......', '...fFffff.....', '...fFllFf.....', 'KKKKKKKKKKKK..', '.KKKKKKKKKKKKK', '...KKKKKKKK...', '....KKKKKK....', '...KKKKKKKK...', '..KKKKKKKKKK..'],
  bomb: ['..........F.', '.........fh.', '........hh..', '....KKKK....', '..KKKKKKKK..', '.KKsKKKKKKK.', '.KsKKKKKKKK.', 'KKKKKKKKKKKK', 'KKKKKKKKKKKK', '.KKKKKKKKKK.', '..KKKKKKKK..', '....KKKK....'],
  rune: ['..pppppppppp..', '.pppppppppppp.', 'pppPPPkPPPpppp', 'ppppPkkkPppppp', 'pppppPkPpppppp', 'ppppPkPkPppppp', 'pppPkPPPkPpppp', 'pppppppppppppp', '.pppppppppppp.', '..pppppppppp..'],
};

const GLINT = '#ffffff';

/** Shade a material-silhouette grid into a canvas (with 1 px warm outline). */
export function shadeIcon(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w ? rows[y][x] || '.' : '.');
  const base = (ch) => (ch === 'K' ? 'K' : ch.toLowerCase());
  // per material bounding boxes
  const box = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y);
    if (ch === '.' || ch === 'k' || ch === '*') continue;
    const m = base(ch);
    const b = box[m] || (box[m] = { x0: x, y0: y, x1: x, y1: y });
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  }
  const p = new Painter(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y);
    if (ch === '.') continue;
    if (ch === '*') { p.set(x + 1, y + 1, GLINT); continue; }
    if (ch === 'k') { p.set(x + 1, y + 1, OUT); continue; }
    const m = base(ch);
    const ramp = RAMPS[m];
    if (!ramp) continue;
    if (ch !== m && ch !== 'K') { p.set(x + 1, y + 1, ramp[4]); continue; }
    const b = box[m];
    const tx = (x - b.x0) / Math.max(1, b.x1 - b.x0), ty = (y - b.y0) / Math.max(1, b.y1 - b.y0);
    const t = 1 - (tx * 0.5 + ty * 0.5);
    let idx = 1 + Math.round(t * 2);
    const same = (cx, cy) => { const c = at(cx, cy); return c !== '.' && c !== 'k' && base(c) === m; };
    const lit = !same(x, y - 1) || !same(x - 1, y);
    const shadow = !same(x, y + 1) || !same(x + 1, y);
    if (lit && !shadow) idx = Math.min(4, idx + 1);
    else if (shadow && !lit) idx = Math.max(0, idx - 1);
    p.set(x + 1, y + 1, ramp[idx]);
  }
  p.outline(OUT);
  return inkWeight(p);
}

/**
 * Hand-inked line weight: the outline thins and warms where light hits (top/left, with the odd
 * lighter skip like a brush lifting) and doubles to a heavy 2px line on the shadow side (bottom/right).
 */
export function inkWeight(src, seed = 0) {
  const p = src instanceof Painter ? src : Painter.fromCanvas(src);
  const isInk = (x, y) => { const v = p.get(x, y); return !!v && v[3] > 200 && v[0] === 0x1c && v[1] === 0x10 && v[2] === 0x0c; };
  const fill = (x, y) => p.alpha(x, y) > 0 && !isInk(x, y);
  const hex = (v) => '#' + v.slice(0, 3).map((c) => c.toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return A.map((v, i) => Math.round(v + (B[i] - v) * t)); };
  const lit = [], heavy = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (!isInk(x, y)) continue;
    const r = fill(x + 1, y), b = fill(x, y + 1), l = fill(x - 1, y), a = fill(x, y - 1);
    if ((r || b) && !(l || a)) lit.push([x, y, r ? x + 1 : x, r ? y : y + 1]);
    else if ((l || a) && !(r || b)) heavy.push([l ? x - 1 : x, l ? y : y - 1]);
  }
  for (const [x, y, nx, ny] of lit) p.set(x, y, mix(OUT, hex(p.get(nx, ny)), ((x * 7 + y * 13 + seed) % 9) === 0 ? 0.6 : 0.32));
  for (const [nx, ny] of heavy) if (!isInk(nx, ny)) p.set(nx, ny, mix(hex(p.get(nx, ny)), OUT, 0.45));
  return p.toCanvas();
}

/** Scale2x (EPX) + relight a small icon canvas into a crisp detailed version. */
export function upscaleIcon(small) {
  const sp = small.getContext('2d').getImageData(0, 0, small.width, small.height);
  const W = small.width, H = small.height;
  const px = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : sp.data.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
  const eq = (a, b) => (!a && !b) || (a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);
  const p = new Painter(W * 2, H * 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const P0 = px(x, y), A = px(x, y - 1), B = px(x + 1, y), C = px(x - 1, y), D = px(x, y + 1);
    let e0 = P0, e1 = P0, e2 = P0, e3 = P0;
    if (!eq(C, B) && !eq(A, D)) {
      if (eq(C, A)) e0 = A;
      if (eq(A, B)) e1 = B;
      if (eq(D, C)) e2 = C;
      if (eq(B, D)) e3 = D;
    }
    const put = (dx, dy, c) => { if (c && c[3]) p.set(x * 2 + dx, y * 2 + dy, [c[0], c[1], c[2]], c[3]); };
    put(0, 0, e0); put(1, 0, e1); put(0, 1, e2); put(1, 1, e3);
  }
  return p.toCanvas();
}
