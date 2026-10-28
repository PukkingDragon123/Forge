// Painted stage parts that sit in front of the wall: rope/crystal/root/stone/chain bridges, the
// elevator platform, carved stairs, flood water and the dark foreground framing. Same hand-drawn
// rules as the backdrops: individually varied pieces, inked edges, per-surface warm/teal light.
import { Img, hp, mixp, hash, wob, blobPts, Shade, mixHex, bayer } from './backdrop_kit.js';
import { slab } from './backdrop_rock.js';
import * as P from './backdrop_props.js';
import { context, stageStyle } from './backdrops.js';

const ctxFor = (ri, img, glow, lights, fade = 0) => ({ img, glow, sh: new Shade(lights), ...context(stageStyle(ri), fade) });

/**
 * Bridge across a gap, side view. w,h in px (ppu given); deckY(xpx) → px row of the walking surface.
 * Returns { back: Img (deck, posts, far rope), front: Img (near rope + hangers, drawn over the walker), glow }.
 */
export function paintBridge(kind, ri, w, h, ppu, deckY, seed = 5) {
  const back = new Img(w, h), front = new Img(w, h), glow = new Img(w, h);
  const lights = [{ x: w * 0.2, y: h * 0.2, z: ppu * 2.5, r: ppu * 7, s: 0.8 }, { x: w * 0.9, y: h * 0.4, z: ppu * 1.5, r: ppu * 4, s: 0.5, acc: true }];
  const C = ctxFor(ri, back, glow, lights), F = ctxFor(ri, front, glow, lights);
  const S = stageStyle(ri);
  const plankW = Math.round(ppu * 0.16);
  if (kind === 'lavabridge') {
    // a broken basalt causeway: slabs laid edge to edge, some cracked, glowing seams
    for (let x = -4, k = 0; x < w + 4; k++) {
      const sw = ppu * (0.35 + hash(k, 1, seed) * 0.3), y = deckY(x + sw / 2);
      const pts = blobPts(x + sw / 2, y + ppu * 0.12, sw / 2 + 1, ppu * 0.16, seed + k * 7, { rough: 0.35, flatTop: 0.8, n: 8 });
      slab(back, C.sh, C.M.rock, pts, { seed: seed + k * 7, F: [[0, -0.7, 0.7], [-0.5, 0.3, 0.8], [0.5, 0.3, 0.8]] });
      const gx = Math.round(x + sw);
      for (let q = 0; q < ppu * 0.2; q++) { const c = hp(q < 2 ? '#ffd060' : '#ff6a1a'); back.set(gx, Math.round(y + q), c); glow.set(gx, Math.round(y + q), c); }
      x += sw + 1;
    }
    return { back, front, glow };
  }
  const deckM = kind === 'crystalbridge' ? null : kind === 'chainbridge' ? C.M.iron : C.M.wood;
  const ropeM = kind === 'chainbridge' ? C.M.iron : kind === 'rootbridge' ? C.mat('#5a3a22') : C.M.rope;
  // deck: individually cut planks / plates / crystal slabs, a few missing, all following the sag
  for (let x = 2, k = 0; x < w - 2; k++) {
    const pw = plankW * (0.8 + hash(k, 1, seed) * 0.45);
    const y = deckY(x + pw / 2);
    if (hash(k, 2, seed) > 0.93 && x > w * 0.2 && x < w * 0.8) { x += pw + 2; continue; } // missing plank
    if (kind === 'crystalbridge') P.crystalCluster(C, x + pw / 2, y + ppu * 0.08, ppu * 0.12, k % 2 ? S.acc : S.gem, seed + k, { halo: false });
    else if (kind === 'rootbridge') P.plank(C, ropeM, [x, y + 2], [x + pw, deckY(x + pw) + 2 + (hash(k, 3, seed) - 0.5) * 3], ppu * 0.07, seed + k, { round: true, knots: 0 });
    else P.plank(C, deckM, [x + pw / 2, y], [x + pw / 2 + (hash(k, 4, seed) - 0.5) * 2, y + ppu * 0.09], pw, seed + k, { knots: hash(k, 5, seed) > 0.7 ? 1 : 0, nails: kind === 'chainbridge' ? [] : [0.3] });
    x += pw + 1 + Math.round(hash(k, 6, seed) * 2);
  }
  // hand ropes: far one behind the deck, near one on the front layer, with hangers to the deck
  const ropeY = (x, near) => deckY(x) - ppu * (0.62 - Math.sin((Math.PI * x) / w) * 0.1) + (near ? ppu * 0.05 : 0);
  const rope = (Ct, near) => {
    const pts = [];
    for (let x = 0; x <= w; x += 4) pts.push([x, ropeY(x, near)]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const thick = kind === 'chainbridge' ? 2 : 3;
      for (let t = 0; t <= 1; t += 0.25) for (let q = 0; q < thick; q++) {
        const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t) + q;
        const twist = ((x + q * 2) % 4) < 2 ? 0.4 : -0.6;
        Ct.img.set(x, y, Ct.sh.col(ropeM, Math.max(1, Math.min(7.6, Ct.sh.idx(x, y, 0, q - 1, 0.8) + twist)), x, y));
      }
    }
    for (let x = near ? 9 : 4; x < w; x += near ? 18 : 18) {
      const y0 = ropeY(x, near) + 2, y1 = deckY(x) + (near ? 4 : 0);
      for (let y = Math.round(y0); y < y1; y++) Ct.img.set(x, y, Ct.sh.col(ropeM, Math.max(1, Math.min(7.6, Ct.sh.idx(x, y, -0.5, 0, 0.85) + ((y & 3) === 0 ? -0.7 : 0))), x, y));
    }
  };
  rope(C, false);
  rope(F, true);
  for (const im of [back, front]) im.outline(hp('#06101a'));
  return { back, front, glow };
}

/** Elevator cage platform (w×h px): plank deck in an iron-banded frame, corner posts, a lamp hook. */
export function paintElevator(ri, w, h, ppu, seed = 9) {
  const img = new Img(w, h), glow = new Img(w, h);
  const C = ctxFor(ri, img, glow, [{ x: w * 0.3, y: h * 0.1, z: ppu * 2, r: ppu * 5, s: 0.9 }]);
  const deckTop = h - ppu * 0.22;
  for (let x = 3, k = 0; x < w - 3; k++) { const pw = ppu * (0.13 + hash(k, 1, seed) * 0.05); P.plank(C, C.M.wood, [x + pw / 2, deckTop], [x + pw / 2, h - 3], pw, seed + k, { knots: hash(k, 2, seed) > 0.7 ? 1 : 0 }); x += pw + 1; }
  P.plank(C, C.M.iron, [2, deckTop + 2], [w - 2, deckTop + 2], ppu * 0.05, seed + 40, { knots: 0, nails: [0.05, 0.25, 0.5, 0.75, 0.95] });
  for (const px of [4, w - 4]) P.plank(C, C.M.wood, [px, h - 3], [px, 3], ppu * 0.07, seed + px, { nails: [0.2, 0.8] });
  P.plank(C, C.M.wood, [2, 6], [w - 2, 7], ppu * 0.06, seed + 50, { nails: [0.1, 0.9] });
  P.lantern(C, w * 0.75, 8, 1.3, '#ffb050');
  return { img, glow };
}

/** Carved stairs descending left→right (w×h px): each step its own worn, chipped block. */
export function paintStairs(ri, w, h, steps, ppu, seed = 13) {
  const img = new Img(w, h), glow = new Img(w, h);
  const C = ctxFor(ri, img, glow, [{ x: w * 0.15, y: h * 0.1, z: ppu * 2.5, r: ppu * 6, s: 0.9 }]);
  const stepH = (h - ppu * 0.4) / steps;
  for (let i = 0; i < steps; i++) {
    const x0 = (i / steps) * w - 2, x1 = ((i + 1) / steps) * w + 6, y = ppu * 0.3 + i * stepH;
    const j = (k) => (hash(i, k, seed) - 0.5) * 3;
    const pts = [[x0 + j(1), y + j(2) * 0.4], [x1 + j(3), y + 1 + j(4) * 0.4], [x1 + j(5), h], [x0 + j(6), h]];
    slab(img, C.sh, C.M.stone, pts, { seed: seed + i * 11, F: [[0, -0.75, 0.66], [0, 0, 1], [0.35, 0, 0.94]], mott: 0.5, cracks: hash(i, 9, seed) > 0.6 ? 1 : 0 });
  }
  return { img, glow };
}

/** Flood water surface tile (tileable in x): translucent teal with drawn ripple strokes and glints. */
export function paintWater(ri, w = 512, h = 96) {
  const S = stageStyle(ri);
  const img = new Img(w, h);
  const base = hp(mixHex(S.shadow[2], '#1a6a7a', 0.35), 150), deep = hp(mixHex(S.shadow[1], '#0a2a3a', 0.4), 175);
  const rip = hp(mixHex(S.shadow[3], '#9ad8e0', 0.45), 210), glint = hp('#ffd8a0', 235), glint2 = hp(mixHex(S.acc, '#ffffff', 0.4), 230);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.d[y * w + x] = (y + (bayer(x, y) * 4 | 0)) % 9 < 2 ? deep : base;
  // ripple strokes: short wobbly dashes, longer toward the viewer
  for (let k = 0; k < 140; k++) {
    const y = Math.round(hash(k, 1, 3) * (h - 2)), len = 3 + hash(k, 2, 3) * (6 + (y / h) * 18);
    const x0 = hash(k, 3, 3) * w;
    for (let t = 0; t < len; t++) { const x = Math.round(x0 + t) % w; img.set(x, y + Math.round((wob(t * 0.3, k) - 0.5) * 1.4), t === 0 || t > len - 2 ? base : rip); }
  }
  for (let k = 0; k < 30; k++) { const x = Math.round(hash(k, 5, 4) * w), y = Math.round(hash(k, 6, 4) * h); img.set(x, y, k % 3 ? glint : glint2); img.set((x + 1) % w, y, k % 3 ? glint : glint2); }
  return img;
}

/**
 * Dark foreground framing (w×h px): hanging rock fangs and roots from the top edge, or a rock
 * shoulder rising from the bottom — near-silhouettes with a rim where the scene light catches them.
 */
export function paintForeground(ri, w, h, ppu, where, seed = 21) {
  const S = stageStyle(ri);
  const img = new Img(w, h), glow = new Img(w, h);
  const fgS = { ...S, rockL: mixHex(S.shadow[1], S.rockL, 0.3) };
  const sh = new Shade([{ x: where === 'top' ? w * 0.3 : w * 0.5, y: where === 'top' ? h * 1.4 : -h * 0.3, z: ppu * 1.2, r: Math.max(w, h) * 1.5, s: 0.55 }]);
  const C = { img, glow, sh, ...context(fgS) };
  const M = C.mat(fgS.rockL);
  const U = h; // sizes follow the band height so the framing reads the same at any depth
  if (where === 'top') {
    for (let x = -10, k = 0; x < w + 10; k++) {
      const rx = U * (0.3 + hash(k, 1, seed) * 0.35);
      slab(img, sh, M, blobPts(x + rx, -rx * 0.2, rx * 1.2, rx * 0.7, seed + k, { rough: 0.6, n: 8 }), { seed: seed + k, F: [[0, 0.7, 0.7], [-0.6, 0.3, 0.75], [0.6, 0.3, 0.75]] });
      x += rx * 1.6;
    }
    for (let k = 0; k < 3 + hash(1, 2, seed) * 3; k++) {
      const cx = (0.1 + hash(k, 3, seed) * 0.8) * w, len = h * (0.45 + hash(k, 4, seed) * 0.55), wd = U * (0.07 + hash(k, 5, seed) * 0.1);
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([cx - wd * (1 - t) ** 1.2 * (0.8 + wob(i, seed + k) * 0.4), t * len]); }
      for (let i = 8; i >= 0; i--) { const t = i / 8; pts.push([cx + wd * (1 - t) ** 1.2 * (0.8 + wob(i + 5, seed + k) * 0.4), t * len]); }
      slab(img, sh, M, pts, { seed: seed + 40 + k, F: [[-0.6, 0.2, 0.77], [0.6, 0.2, 0.77]], cracks: 0 });
    }
    if (ri === 2 || ri === 0) P.roots(C, w * (0.3 + hash(2, 2, seed) * 0.4), 0, h * 0.7, mixHex(S.shadow[1], '#4a3020', 0.5), ri === 2 ? S.acc : null, seed + 7);
  } else {
    const bx = where === 'left' ? w * 0.25 : w * 0.75;
    for (let k = 0; k < 4; k++) {
      const r = U * (0.35 + hash(k, 1, seed) * 0.35), x = bx + (hash(k, 2, seed) - 0.5) * w * 0.7;
      slab(img, sh, M, blobPts(x, h - r * 0.35, r * 1.2, r * 0.75, seed + k * 9, { rough: 0.6, n: 9 }), { seed: seed + k * 9, moss: S.mossAmt > 0.2 ? C.M.moss : null, mossAmt: S.mossAmt });
    }
  }
  return { img, glow };
}

export { mixp };
