// Pixel-art painting toolkit: indexed string sprites, a pixel buffer painter with outlines,
// dithering and shading helpers. Everything renders to small canvases drawn at 1:1 virtual pixels.
import { hexToRgb, clamp, hash2 } from '../core/math.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

/** Sprite from strings. palette: { 'k': '#000', ... } ('.' and ' ' are transparent). */
export function fromStrings(rows, palette) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const p = new Painter(w, h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (col) p.set(x, y, col);
    }
  });
  return p.toCanvas();
}

/** RGBA pixel buffer with painting helpers. Colors are '#rrggbb' or [r,g,b,a]. */
export class Painter {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  static fromCanvas(c) {
    const p = new Painter(c.width, c.height);
    p.data.set(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
    return p;
  }
  idx(x, y) { return (y * this.w + x) * 4; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, col, a = 255) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    const [r, g, b, ca] = typeof col === 'string' ? [...hexToRgb(col), 255] : col.length === 4 ? col : [...col, 255];
    const alpha = ((ca ?? 255) * a) / 255;
    if (alpha >= 255) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255; return; }
    const t = alpha / 255;
    const da = this.data[i + 3] / 255;
    const oa = t + da * (1 - t);
    if (oa <= 0) return;
    this.data[i] = (r * t + this.data[i] * da * (1 - t)) / oa;
    this.data[i + 1] = (g * t + this.data[i + 1] * da * (1 - t)) / oa;
    this.data[i + 2] = (b * t + this.data[i + 2] * da * (1 - t)) / oa;
    this.data[i + 3] = oa * 255;
  }
  get(x, y) {
    if (!this.inside(x, y)) return null;
    const i = this.idx(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  alpha(x, y) { return this.inside(x, y) ? this.data[this.idx(x, y) + 3] : 0; }
  clear(x, y) { if (this.inside(x, y)) this.data[this.idx(x, y) + 3] = 0; }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); }
  hline(x0, x1, y, col) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, col); }
  vline(x, y0, y1, col) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, col); }
  line(x0, y0, x1, y1, col) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.set(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Filled ellipse; fn(x,y,nx,ny) may return a color per pixel (nx,ny in -1..1). */
  ellipse(cx, cy, rx, ry, colOrFn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) {
          const c = typeof colOrFn === 'function' ? colOrFn(x, y, nx, ny) : colOrFn;
          if (c) this.set(x, y, c);
        }
      }
    }
  }
  circle(cx, cy, r, col) { this.ellipse(cx, cy, r, r, col); }
  /** Filled polygon (even-odd), pts [[x,y],...]; colOrFn like ellipse with (x,y). */
  poly(pts, colOrFn) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      const sy = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) {
          const c = typeof colOrFn === 'function' ? colOrFn(x, y) : colOrFn;
          if (c) this.set(x, y, c);
        }
      }
    }
  }
  /** Replace every opaque pixel via fn(x,y,[r,g,b,a]) -> color|null */
  map(fn) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.idx(x, y);
      if (this.data[i + 3] === 0) continue;
      const c = fn(x, y, [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]);
      if (c === null) this.data[i + 3] = 0;
      else if (c) { const [r, g, b] = typeof c === 'string' ? hexToRgb(c) : c; this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; }
    }
  }
  /** 1px outline around opaque pixels (outside). corners: include diagonals */
  outline(col, corners = false) {
    const add = [];
    for (let y = -1; y <= this.h; y++) for (let x = -1; x <= this.w; x++) {
      if (this.alpha(x, y) > 0) continue;
      const n = this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1) ||
        (corners && (this.alpha(x - 1, y - 1) || this.alpha(x + 1, y - 1) || this.alpha(x - 1, y + 1) || this.alpha(x + 1, y + 1)));
      if (n) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, col);
  }
  /** Darken the inner border pixels (selective outline/inner shade). */
  innerEdge(colFn) {
    const edge = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.alpha(x, y)) continue;
      const open = [[0, -1], [-1, 0], [1, 0], [0, 1]].filter(([dx, dy]) => !this.alpha(x + dx, y + dy));
      if (open.length) edge.push([x, y, open]);
    }
    for (const [x, y, open] of edge) { const c = colFn(x, y, open, this.get(x, y)); if (c) this.set(x, y, c); }
  }
  /** Copy another painter/canvas into this one at offset (alpha blended). */
  blit(src, ox = 0, oy = 0) {
    const s = src instanceof Painter ? src : Painter.fromCanvas(src);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = s.idx(x, y);
      const a = s.data[i + 3];
      if (a) this.set(x + ox, y + oy, [s.data[i], s.data[i + 1], s.data[i + 2]], a);
    }
  }
  toCanvas() {
    const c = makeCanvas(this.w, this.h);
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    img.data.set(this.data);
    g.putImageData(img, 0, 0);
    return c;
  }
}

/** Ordered dither test: returns true if pixel (x,y) should take the "upper" color at mix t. */
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dither = (x, y, t) => t * 16 > B4[(x & 3) + (y & 3) * 4] + 0.5;
/** Pick color from a ramp (array dark→light) at t∈[0,1] with dithering between steps. */
export function rampAt(rmp, t, x = 0, y = 0, useDither = true) {
  t = clamp(t, 0, 0.9999) * (rmp.length - 1);
  const i = Math.floor(t), f = t - i;
  if (!useDither) return rmp[Math.round(t)];
  return dither(x, y, f) ? rmp[Math.min(i + 1, rmp.length - 1)] : rmp[i];
}
export const noiseAt = (x, y, seed) => hash2(x, y, seed);

/** Canvas helpers */
export function flipH(c) {
  const o = makeCanvas(c.width, c.height);
  const g = o.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
  return o;
}
export function rotate90(c, times = 1) {
  times = ((times % 4) + 4) % 4;
  let cur = c;
  for (let t = 0; t < times; t++) {
    const o = makeCanvas(cur.height, cur.width);
    const g = o.getContext('2d');
    g.translate(o.width, 0); g.rotate(Math.PI / 2); g.drawImage(cur, 0, 0);
    cur = o;
  }
  return cur;
}
export function scaleCanvas(c, s) {
  const o = makeCanvas(c.width * s, c.height * s);
  const g = o.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(c, 0, 0, o.width, o.height);
  return o;
}
export function silhouette(c, color) {
  const o = makeCanvas(c.width, c.height);
  const g = o.getContext('2d');
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, o.width, o.height);
  return o;
}
/** Return new canvas with 1px outline (and optional drop shadow). */
export function withOutline(c, color = '#140c10', corners = false) {
  const p = new Painter(c.width + 2, c.height + 2);
  p.blit(c, 1, 1);
  p.outline(color, corners);
  return p.toCanvas();
}
