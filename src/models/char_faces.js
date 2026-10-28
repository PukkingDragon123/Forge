// High-resolution painted anime faces (64×64 per expression), mapped onto the front of each
// sculpted head. Big glossy eyes with lid shadow, layered iris, twin highlights, expressive brows,
// mouths with teeth/tongue, hatched blush, per-character extras (stubble, freckles, fang, scar).
import * as THREE from 'three';
import { hexToRgb } from '../core/math.js';

export const FACE_PX = 64;

export const FACE_SPECS = {
  bran: {
    skin: '#e9a57a', shade: '#c97f5e', iris: ['#2a1206', '#7a4a24', '#c89a5a'], brow: '#3a1a0e', lash: '#24120c',
    eye: { w: 9, h: 11, gap: 22, y: 30 }, browW: 11, browThick: 3, mouthY: 50, stubble: '#b0705a', blush: '#e07a6a', scar: true, nose: 'round',
  },
  elio: {
    skin: '#f6d2b0', shade: '#dcae8c', iris: ['#160c4a', '#4a5adf', '#a8c0ff'], brow: '#c89a5a', lash: '#2a1820',
    eye: { w: 11, h: 14, gap: 20, y: 29 }, browW: 9, browThick: 2, mouthY: 49, freckles: '#d89a7a', blush: '#ff9a9a', nose: 'dot',
  },
  durgan: {
    skin: '#eab08a', shade: '#c88866', iris: ['#0c0606', '#3a2210', '#8a6a3a'], brow: null, lash: '#1c0e08',
    eye: { w: 7, h: 8, gap: 22, y: 31 }, mouthY: 52, blush: '#e8806e', nose: 'none',
  },
  clover: {
    skin: '#fff1ea', shade: '#efd2cc', iris: ['#4a0418', '#e0306a', '#ffb0d0'], brow: '#e0d0d4', lash: '#3a1424',
    eye: { w: 11, h: 15, gap: 21, y: 28 }, browW: 8, browThick: 2, mouthY: 49, blush: '#ff9ab4', blushAlways: true, fang: true, lashes: true, nose: 'dot',
  },
};

const EXPR_EYES = {
  neutral: 'open', happy: 'happy', angry: 'angry', surprised: 'wide', sad: 'sad', smug: 'half', determined: 'narrow', hurt: 'squeeze', sleepy: 'closed',
};

export class FacePainter {
  constructor(spec) {
    this.s = spec;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = FACE_PX;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.cache = new Map();
    this.key = '';
  }
  draw(expr, blink) {
    const key = expr + (blink ? '_b' : '');
    if (key === this.key) return;
    this.key = key;
    let img = this.cache.get(key);
    if (!img) { img = this.paint(expr, blink); this.cache.set(key, img); }
    this.g.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
  }

  paint(expr, blink) {
    const N = FACE_PX, s = this.s;
    const data = new Uint8ClampedArray(N * N * 4);
    const px = (x, y, c, a = 1) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= N || y >= N || !c) return;
      const [r, g, b] = typeof c === 'string' ? hexToRgb(c) : c;
      const i = (y * N + x) * 4;
      data[i] = data[i] * (1 - a) + r * a; data[i + 1] = data[i + 1] * (1 - a) + g * a; data[i + 2] = data[i + 2] * (1 - a) + b * a; data[i + 3] = 255;
    };
    // skin + subtle form shading (cheek light, under-brow and jaw shadow)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      px(x, y, s.skin);
      const dx = (x - N / 2) / (N / 2);
      if (Math.abs(dx) > 0.78 && (x + y) % 2 === 0) px(x, y, s.shade);
      if (y > N * 0.86 && (x + y) % 2 === 0) px(x, y, s.shade);
    }
    const E = s.eye;
    const lx = Math.round(N / 2 - E.gap / 2 - E.w / 2), rx = Math.round(N / 2 + E.gap / 2 - E.w / 2);
    let state = EXPR_EYES[expr] || 'open';
    if (blink && ['open', 'wide', 'sad', 'narrow', 'angry', 'half'].includes(state)) state = 'closed';
    const [D, M, L] = s.iris;
    const lash = s.lash, W = '#ffffff';

    const eye = (x0, left) => {
      const { w, h, y } = { ...E };
      const ox = left ? 0 : w - 1; // outer column index
      const inner = left ? w - 1 : 0;
      const ellipse = (topCut = 0, irisScale = 1, pupil = true) => {
        // sclera with soft top shadow
        for (let j = topCut; j < h; j++) for (let i = 0; i < w; i++) {
          const nx = (i + 0.5 - w / 2) / (w / 2), ny = (j + 0.5 - h / 2) / (h / 2);
          if (nx * nx * 0.9 + ny * ny > 1) continue;
          px(x0 + i, y + j, j < topCut + 2 ? '#d8d0e8' : W);
        }
        // iris (tall oval) with layered gradient
        const iw = Math.max(3, Math.round(w * 0.78 * irisScale)), ih = Math.max(4, Math.round(h * 0.9 * irisScale));
        const ix = x0 + Math.round((w - iw) / 2) + (left ? 1 : -1) * (irisScale < 1 ? 0 : 0), iy = y + Math.round((h - ih) / 2) + 1;
        for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
          const nx = (i + 0.5 - iw / 2) / (iw / 2), ny = (j + 0.5 - ih / 2) / (ih / 2);
          if (nx * nx + ny * ny > 1.05) continue;
          if (iy + j < y + topCut) continue;
          const t = j / ih;
          let c = t < 0.32 ? D : t < 0.72 ? M : L;
          if (t > 0.55 && t < 0.72 && Math.abs(nx) < 0.5) c = L;
          if (Math.abs(nx) > 0.82) c = D;
          px(ix + i, iy + j, c);
        }
        if (pupil) {
          const pw = Math.max(1, Math.round(iw * 0.36)), ph = Math.max(2, Math.round(ih * 0.42));
          const pxs = ix + Math.round((iw - pw) / 2), pys = iy + Math.round(ih * 0.22);
          for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) if (pys + j >= y + topCut) px(pxs + i, pys + j, '#0c0610');
        }
        // highlights (consistent upper-left key light)
        const hx = ix + Math.max(1, Math.round(iw * 0.18)), hy = Math.max(iy + 1, y + topCut + 1);
        px(hx, hy, W); px(hx + 1, hy, W); px(hx, hy + 1, W); px(hx + 1, hy + 1, W);
        if (w >= 9) { px(hx, hy + 2, W); px(hx + 2, hy, W, 0.6); }
        px(ix + iw - 2, iy + ih - 3, W); px(ix + iw - 3, iy + ih - 2, W, 0.7);
        // upper lid / lash line: thick, with outer wing
        const lidY = y + topCut;
        for (let i = -1; i <= w; i++) {
          const arc = Math.round(Math.pow(Math.abs((i + 0.5 - w / 2) / (w / 2)), 2) * 1.6);
          px(x0 + i, lidY + arc - 1, lash); px(x0 + i, lidY + arc, lash);
        }
        const wx = x0 + (left ? -1 : w);
        px(wx, lidY, lash); px(wx + (left ? -1 : 1), lidY - 1, lash);
        if (s.lashes) { px(wx + (left ? -2 : 2), lidY - 2, lash); px(wx + (left ? -1 : 1), lidY + 1, lash); }
        // lower lash hint at outer third
        for (let i = 0; i < Math.ceil(w / 3); i++) px(x0 + (left ? i : w - 1 - i), y + h, lash, 0.7);
        void ox; void inner;
      };
      switch (state) {
        case 'open': ellipse(0); break;
        case 'wide': ellipse(0, 0.62); break;
        case 'half': ellipse(Math.round(h * 0.42)); break;
        case 'narrow': ellipse(Math.round(h * 0.25)); for (let i = 0; i < 3; i++) px(x0 + (left ? w - 1 - i : i), y + Math.round(h * 0.25) + 1 - i * 0, lash); break;
        case 'angry': {
          ellipse(Math.round(h * 0.28));
          for (let i = 0; i < w; i++) { const k = left ? i / w : 1 - i / w; const yy = y + Math.round(h * 0.28) - 2 + Math.round(k * 3); px(x0 + i, yy, lash); px(x0 + i, yy + 1, lash); }
          break;
        }
        case 'sad': {
          ellipse(Math.round(h * 0.2));
          for (let i = 0; i < w; i++) { const k = left ? 1 - i / w : i / w; px(x0 + i, y + Math.round(h * 0.2) - 1 + Math.round(k * 2), lash); }
          const tx = x0 + (left ? 1 : w - 2);
          px(tx, y + h + 1, '#bfeaff'); px(tx, y + h + 2, '#7fc8ff'); px(tx, y + h + 3, '#7fc8ff');
          break;
        }
        case 'happy': // ^ ^ arcs
          for (let i = -1; i <= w; i++) {
            const t = (i + 0.5) / w;
            const yy = y + Math.round(h * 0.55 - Math.sin(t * Math.PI) * h * 0.38);
            px(x0 + i, yy, lash); px(x0 + i, yy + 1, lash);
          }
          break;
        case 'closed':
          for (let i = -1; i <= w; i++) {
            const t = (i + 0.5) / w;
            const yy = y + Math.round(h * 0.62 + Math.sin(t * Math.PI) * h * 0.14);
            px(x0 + i, yy, lash); if (i > 0 && i < w - 1) px(x0 + i, yy + 1, lash, 0.5);
          }
          if (s.lashes) px(x0 + (left ? -2 : w + 1), y + Math.round(h * 0.6), lash);
          break;
        case 'squeeze': { // > <  (points toward the nose)
          const cy = y + h / 2;
          for (let i = 0; i < w; i++) {
            const k = left ? 1 - i / (w - 1) : i / (w - 1); // 0 at inner corner, 1 at outer
            const off = k * h * 0.38;
            px(x0 + i, cy - off, lash); px(x0 + i, cy + off, lash);
            if (k < 0.2) px(x0 + i, cy, lash);
          }
          break;
        }
        default: ellipse(0);
      }
    };
    eye(lx, true);
    eye(rx, false);

    // brows
    if (s.brow) {
      const bw = s.browW || E.w, by = E.y - 4 - (state === 'wide' ? 2 : 0);
      const brow = (x0, left) => {
        for (let i = 0; i < bw; i++) {
          const k = left ? i / (bw - 1) : 1 - i / (bw - 1); // 0 outer … 1 inner
          let dy = -Math.round(Math.sin(k * Math.PI) * 1.2);
          if (expr === 'angry' || expr === 'determined') dy += Math.round(k * 3) - 1;
          else if (expr === 'sad' || expr === 'hurt') dy -= Math.round(k * 3) - 1;
          else if (expr === 'smug' && !left) dy -= 2;
          else if (expr === 'surprised') dy -= 1;
          for (let t = 0; t < (s.browThick || 2) - (k < 0.15 || k > 0.92 ? 1 : 0); t++) px(x0 + i, by + dy + t, s.brow);
        }
      };
      brow(lx + (E.w - bw) / 2 - 1, true);
      brow(rx + (E.w - bw) / 2 + 1, false);
    }
    // nose
    const nx = N / 2, ny = E.y + E.h + 4;
    if (s.nose === 'round') { px(nx, ny, s.shade); px(nx + 1, ny + 1, s.shade); px(nx - 1, ny + 1, s.shade, 0.6); }
    else if (s.nose === 'dot') { px(nx, ny, s.shade); }
    // blush (hatched strokes)
    if (s.blushAlways || ['happy', 'smug', 'surprised', 'hurt', 'sleepy'].includes(expr)) {
      for (const cx of [lx + E.w / 2 - 2, rx + E.w / 2 + 2]) {
        for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) px(cx - 3 + i, E.y + E.h + 3 + j, s.blush, 0.45);
        for (let k = 0; k < 3; k++) { px(cx - 2 + k * 2, E.y + E.h + 3, s.blush); px(cx - 3 + k * 2, E.y + E.h + 4, s.blush); }
      }
    }
    if (s.freckles) for (const [fx, fy] of [[-14, 3], [-12, 5], [-10, 3], [10, 3], [12, 5], [14, 3]]) px(N / 2 + fx, E.y + E.h + 2 + fy, s.freckles);
    if (s.scar) { for (let k = 0; k < 5; k++) px(rx + E.w + 1 + Math.floor(k / 2), E.y - 3 + k, s.shade); }
    if (s.stubble) for (let y = s.mouthY - 6; y < N - 2; y++) for (let x = 14; x < N - 14; x++) {
      const dx = (x - N / 2) / 18, dy = (y - (N - 2)) / 14;
      if (dx * dx + dy * dy < 1 && (x * 7 + y * 3) % 4 === 0) px(x, y, s.stubble);
    }
    // mouth
    const my = s.mouthY, mx = N / 2, mc = '#5a1a1e', tongue = '#ff7a8a', teeth = '#ffffff';
    const line = (pts, c = mc) => pts.forEach(([x, y]) => px(mx + x, my + y, c));
    switch (expr) {
      case 'happy': {
        for (let i = -4; i <= 4; i++) { const d = Math.round(Math.sqrt(Math.max(0, 16 - i * i)) * 0.8); for (let j = 0; j <= d; j++) px(mx + i, my + j, j === 0 ? mc : j > d - 2 ? tongue : '#8a2a32'); }
        line([[-4, 0], [-3, 0], [3, 0], [4, 0]]);
        if (s.fang) { px(mx - 2, my + 1, teeth); px(mx + 2, my + 1, teeth); }
        break;
      }
      case 'angry':
        for (let i = -4; i <= 4; i++) { px(mx + i, my, mc); px(mx + i, my + 1, i % 2 ? teeth : '#e8e0e0'); px(mx + i, my + 2, mc); }
        px(mx - 5, my + 1, mc); px(mx + 5, my + 1, mc);
        break;
      case 'surprised':
        for (let j = -2; j <= 3; j++) for (let i = -2; i <= 2; i++) if (i * i / 5 + (j - 0.5) * (j - 0.5) / 7 <= 1) px(mx + i, my + j, Math.abs(i) === 2 || j === -2 || j === 3 ? mc : '#7a2a32');
        break;
      case 'sad': line([[-3, 1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 1]]); break;
      case 'smug': line([[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, -1], [2, -1], [3, -2]]); if (s.fang) px(mx + 1, my, teeth); break;
      case 'determined': line([[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0]]); break;
      case 'hurt': line([[-4, 1], [-3, 0], [-2, 1], [-1, 0], [0, 1], [1, 0], [2, 1], [3, 0], [4, 1]]); break;
      case 'sleepy': for (let j = 0; j < 3; j++) for (let i = -1; i <= 1; i++) px(mx + i, my + j, j === 0 || Math.abs(i) === 1 ? mc : '#8a2a32'); break;
      default: line([[-2, 0], [-1, 1], [0, 1], [1, 1], [2, 0]]);
    }
    if (expr === 'hurt' || expr === 'surprised') for (const [x, y] of [[N - 8, 18], [N - 8, 19], [N - 9, 19], [N - 8, 20], [N - 9, 21], [N - 8, 21]]) px(x, y, '#9adcff');
    return new ImageData(data, N, N);
  }
}
