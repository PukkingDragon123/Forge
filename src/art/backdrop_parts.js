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
  const deckH = Math.max(5, Math.round(ppu * 0.075));
  // deck seen edge-on: a band of plank ends, each its own width/tone, a few missing, cross-beams below
  for (let x = 2, k = 0; x < w - 2; k++) {
    const pw = plankW * (0.55 + hash(k, 1, seed) * 0.5);
    const y = deckY(x + pw / 2);
    if (hash(k, 2, seed) > 0.95 && x > w * 0.2 && x < w * 0.8) { x += pw + 2; continue; } // missing plank
    const drop = (hash(k, 7, seed) - 0.5) * 1.6;
    if (kind === 'crystalbridge') P.crystalCluster(C, x + pw / 2, y + deckH, ppu * 0.1, k % 2 ? S.acc : S.gem, seed + k, { halo: false });
    else if (kind === 'rootbridge') P.plank(C, ropeM, [x - 1, y + drop + deckH / 2], [x + pw + 1, deckY(x + pw) + deckH / 2 + (hash(k, 3, seed) - 0.5) * 2], deckH * 0.9, seed + k, { round: true, knots: 0 });
    else P.plank(C, deckM, [x, y + drop + deckH / 2], [x + pw, deckY(x + pw) + drop + deckH / 2], deckH, seed + k, { knots: 0, nails: kind === 'chainbridge' ? [0.5] : hash(k, 4, seed) > 0.5 ? [0.2] : [] });
    x += pw + (hash(k, 6, seed) > 0.7 ? 2 : 1);
  }
  // hand ropes: catenaries between posts; the far one behind the deck, the near one on the front layer
  const posts = [];
  for (let x = 0; x <= w; x += ppu * (0.55 + hash(posts.length, 9, seed) * 0.25)) posts.push(Math.min(w, x));
  if (posts[posts.length - 1] < w - 4) posts.push(w);
  const ropeY = (x, near) => {
    let i = 0;
    while (i < posts.length - 2 && x > posts[i + 1]) i++;
    const a = posts[i], b = posts[i + 1], t = (x - a) / Math.max(1, b - a);
    return deckY(x) - ppu * 0.6 + Math.sin(t * Math.PI) * ppu * 0.07 + (near ? ppu * 0.06 : 0);
  };
  const rope = (Ct, near) => {
    const thick = kind === 'chainbridge' ? 2 : near ? 3 : 2;
    for (let x = 0; x < w; x++) {
      const y0 = Math.round(ropeY(x, near));
      for (let q = 0; q < thick; q++) {
        const twist = ((x + q * 2) % 5) < 2 ? 0.5 : -0.5;
        Ct.img.set(x, y0 + q, Ct.sh.col(ropeM, Math.max(1, Math.min(7.6, Ct.sh.idx(x, y0 + q, 0, q - 1, 0.8) + twist - (near ? 0 : 0.8))), x, y0 + q));
      }
    }
    // hangers at the posts and one between, each tied with a little knot
    for (let i = 0; i < posts.length; i++) {
      const xs = [posts[i]];
      if (i < posts.length - 1) xs.push((posts[i] + posts[i + 1]) / 2 + (hash(i, 3, seed) - 0.5) * 8);
      for (const hx of xs) {
        const x = Math.round(hx + (near ? 3 : 0));
        const y0 = Math.round(ropeY(x, near)), y1 = Math.round(deckY(x) + (near ? deckH : 0));
        for (let y = y0; y < y1; y++) Ct.img.set(x, y, Ct.sh.col(ropeM, Math.max(1, Math.min(7.6, Ct.sh.idx(x, y, -0.5, 0, 0.85) + ((y & 3) === 0 ? -0.7 : 0) - (near ? 0 : 0.8))), x, y));
        Ct.img.set(x - 1, y0 + 1, ropeM.w[2]); Ct.img.set(x + 1, y0 + 1, ropeM.w[2]);
      }
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

/** Flood water surface tile (tileable in x, rows ≈ screen rows): translucent teal that darkens toward
 *  the viewer, hand-drawn ripple arcs of varied length, and a scatter of glints. */
export function paintWater(ri, w = 640, h = 300) {
  const S = stageStyle(ri);
  const img = new Img(w, h);
  const far = hp(mixHex(S.shadow[3], '#3a8a9a', 0.35), 150), mid = hp(mixHex(S.shadow[2], '#1a5a6a', 0.3), 165), near = hp(mixHex(S.shadow[1], '#0a2a3a', 0.3), 185);
  const rip = hp(mixHex(S.shadow[3], '#9ad8e0', 0.5), 200), rip2 = hp(mixHex(S.shadow[3], '#d8f4f0', 0.6), 220);
  const glint = hp('#ffe0b0', 235), glint2 = hp(mixHex(S.acc, '#ffffff', 0.4), 230);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const t = v * 2 + (bayer(x, y) - 0.5) * 0.35;
      img.d[y * w + x] = t < 0.55 ? far : t < 1.3 ? mid : near;
    }
  }
  // ripple arcs: short near the far edge, longer and further apart toward the viewer
  for (let k = 0; k < 260; k++) {
    const y = Math.round(hash(k, 1, 3) ** 0.8 * (h - 3)), v = y / h;
    const len = 3 + hash(k, 2, 3) * (4 + v * 26);
    const x0 = hash(k, 3, 3) * w, bow = (hash(k, 4, 3) - 0.5) * (1 + v * 3);
    for (let t = 0; t < len; t++) {
      const x = Math.round(x0 + t) % w, yy = y + Math.round(Math.sin((t / len) * Math.PI) * bow);
      img.set(x, yy, t > len * 0.3 && t < len * 0.7 && v > 0.3 ? rip2 : rip);
    }
  }
  for (let k = 0; k < 40; k++) { const x = Math.round(hash(k, 5, 4) * (w - 1)), y = Math.round(hash(k, 6, 4) * h); img.set(x, y, k % 3 ? glint : glint2); }
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
