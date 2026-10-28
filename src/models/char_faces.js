// Hand-painted natural faces (64×64 per expression) for the sculpted low-poly heads, in the
// grounded Dungeon Meshi / flat-shaded low-poly look: small dark eyes, defined brows, painted
// cel-shadow planes (brow sockets, nose side, under-lip, jaw), real expressive mouths. The
// geometry supplies the nose and jaw; the paint only adds the planes the light would carve.
import * as THREE from 'three';
import { hexToRgb } from '../core/math.js';

export const FACE_PX = 64;

// Layout (texture rows, 0 = crown … 63 = chin). The builders overwrite eyeY/gap/noseY/mouthY with
// the rows where the sculpted sockets, nose and lips actually landed.
export const FACE_SPECS = {
  bran: { // young smith: thick level brows, steady eyes, strong jaw, a smudge of soot
    skin: '#f0c09a', shade: '#cf8f6c', deep: '#a86a50', eye: '#2a160c', white: '#f4e8dc', brow: '#5a2414', lip: '#a85a48',
    eyeW: 5, eyeH: 3, gap: 19, eyeY: 30, browW: 8, browT: 2, mouthY: 48, mouthW: 8, soot: '#7a5a4c', jaw: true,
  },
  elio: { // face lost in the hood's shadow: only the eyes glow (geometry)
    skin: '#5a4a5e', shade: '#3e3044', deep: '#2a2030', eye: null, brow: null, lip: '#2a1a28',
    eyeW: 4, eyeH: 2, gap: 18, eyeY: 31, mouthY: 48, mouthW: 6, hooded: true,
  },
  durgan: { // eyes deep under bushy (3D) brows, cheeks ruddy above the beard
    skin: '#e6a882', shade: '#c4825e', deep: '#9a5a40', eye: '#1a0e08', white: '#efe0d0', brow: null, lip: '#8a3a30',
    eyeW: 4, eyeH: 2, gap: 20, eyeY: 31, mouthY: 49, mouthW: 8, ruddy: '#e07a62',
  },
  clover: { // sharp scout: narrow watchful eyes, light brows, a few freckles
    skin: '#f4dccc', shade: '#d8b0a0', deep: '#b88a7c', eye: '#3a1420', white: '#fbf2ec', brow: '#c8b4b0', lip: '#b8606a',
    eyeW: 5, eyeH: 3, gap: 18, eyeY: 31, browW: 7, browT: 1, mouthY: 48, mouthW: 6, freckles: '#c88a74', tooth: true,
  },
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
    const hl = (x0, x1, y, c, a) => { for (let x = x0; x <= x1; x++) px(x, y, c, a); };
    const C = N / 2;
    // ---- skin and the shadow planes (key light from the upper left)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px(x, y, s.skin);
    const ey = s.eyeY, lx = Math.round(C - s.gap / 2 - s.eyeW / 2), rx = Math.round(C + s.gap / 2 - s.eyeW / 2);
    for (const x0 of [lx, rx]) { // brow-ridge socket shadow
      hl(x0 - 1, x0 + s.eyeW, ey - 1, s.shade, 0.75);
      hl(x0 - 2, x0 + s.eyeW + 1, ey - 2, s.shade, 0.45);
      hl(x0, x0 + s.eyeW - 1, ey + s.eyeH, s.shade, 0.35); // lower lid
    }
    const ny = s.noseY ?? ey + 10; // nose base row
    for (let y = ey; y <= ny; y++) px(C + 2, y, s.shade, y < ey + 3 ? 0.4 : 0.8); // shadow side of the bridge
    hl(C - 2, C + 3, ny + 1, s.shade); hl(C - 1, C + 2, ny + 2, s.shade, 0.5);   // under the nose
    px(C - 2, ny, s.deep); px(C + 3, ny, s.deep);                               // nostrils
    for (let y = ey + 2; y < s.mouthY - 2; y++) px(C + 9 + Math.round((y - ey) * 0.25), y, s.shade, 0.35); // cheek plane
    if (s.jaw) for (let y = s.mouthY - 2; y < N; y++) { // jaw plane on the shadow side
      const x = Math.round(C + 12 - (y - s.mouthY) * 0.55);
      hl(x, N - 1, y, s.shade, 0.6);
    }
    hl(C - 3, C + 3, s.mouthY + 3, s.shade, 0.5); // under-lip
    if (s.ruddy) for (const cx of [lx + 1, rx + s.eyeW - 2]) for (let j = 0; j < 3; j++) hl(cx - 2, cx + 2, ey + 5 + j, s.ruddy, 0.35);
    if (s.freckles) for (const [fx, fy] of [[-11, 6], [-9, 7], [-12, 8], [9, 6], [11, 7], [10, 8]]) px(C + fx, ey + fy, s.freckles, 0.8);
    if (s.soot) for (const [fx, fy, a] of [[-13, 7, 0.45], [-12, 8, 0.6], [-11, 8, 0.4], [-13, 9, 0.3]]) px(C + fx, ey + fy, s.soot, a);

    // ---- eyes: small, dark, with a sliver of white at the corners; shape carries the emotion
    const st = blink && !['happy', 'sleepy', 'hurt'].includes(expr) ? 'closed' : expr;
    const W = s.eyeW, H = s.eyeH;
    const eye = (x0, left) => {
      const outer = left ? x0 - 1 : x0 + W, inner = left ? x0 + W : x0 - 1;
      const lid = (y, c = s.deep) => hl(x0 - 1, x0 + W, y, c);
      const iris = (y0, h, w = W - 2, dx = 0) => { const ix = x0 + Math.round((W - w) / 2) + dx; for (let j = 0; j < h; j++) hl(ix, ix + w - 1, y0 + j, s.eye); };
      const whites = (y0, h) => { for (let j = 0; j < h; j++) { px(x0, y0 + j, s.white); px(x0 + W - 1, y0 + j, s.white); } };
      if (s.hooded) return; // drawn as glowing geometry instead
      switch (st) {
        case 'closed': case 'sleepy':
          hl(x0 - 1, x0 + W, ey + 1, s.deep); px(outer, ey + 2, s.deep, 0.6); break;
        case 'happy': // lower lid pushed up: eyes become warm curves
          hl(x0, x0 + W - 1, ey, s.deep); px(x0 - 1, ey + 1, s.deep); px(x0 + W, ey + 1, s.deep); hl(x0 + 1, x0 + W - 2, ey + 1, s.eye, 0.5); break;
        case 'hurt': // squeezed shut
          px(outer, ey - 1, s.deep); hl(Math.min(outer, inner) + 1, Math.max(outer, inner) - 1, ey, s.deep); px(outer, ey + 1, s.deep); break;
        case 'surprised':
          whites(ey - 1, H + 1); hl(x0 + 1, x0 + W - 2, ey - 1, s.white); iris(ey, H - 1, 2); lid(ey - 2); break;
        case 'angry': case 'determined':
          whites(ey + 1, H - 1); iris(ey + 1, H - 1); lid(ey); px(inner, ey + 1, s.deep); break;
        case 'smug':
          whites(ey + 1, H - 1); iris(ey + 1, H - 1, W - 2, 1); lid(ey); lid(ey + 1, s.shade); break;
        case 'sad':
          whites(ey, H); iris(ey, H); lid(ey - 1); px(outer, ey, s.deep); px(outer, ey + 1, s.deep, 0.5); break;
        default:
          whites(ey, H); iris(ey, H); lid(ey - 1);
      }
    };
    eye(lx, true);
    eye(rx, false);

    // ---- brows (painted; Durgan's are geometry)
    if (s.brow) {
      const bw = s.browW, by = ey - 4;
      const brow = (cx, left) => {
        for (let i = 0; i < bw; i++) {
          const k = left ? i / (bw - 1) : 1 - i / (bw - 1); // 0 = outer end, 1 = inner end
          let dy = -Math.round(Math.sin(k * Math.PI * 0.8));
          if (st === 'angry') dy += Math.round(k * 3);
          else if (st === 'determined') dy += Math.round(k * 2);
          else if (st === 'sad' || st === 'hurt') dy -= Math.round(k * 2);
          else if (st === 'surprised') dy -= 2;
          else if (st === 'smug' && !left) dy -= 1 + Math.round(1 - k);
          const t = k < 0.3 ? s.browT - 1 : s.browT;
          for (let j = 0; j < Math.max(1, t); j++) px(cx + i, by + dy + j, s.brow);
        }
      };
      brow(lx + Math.round((s.eyeW - bw) / 2) - 1, true);
      brow(rx + Math.round((s.eyeW - bw) / 2) + 1, false);
    }

    // ---- mouth
    const my = s.mouthY, mw = s.mouthW, m0 = Math.round(C - mw / 2), m1 = m0 + mw - 1, dark = '#3a1414', teeth = '#f4ece0';
    switch (st) {
      case 'happy':
        hl(m0, m1, my, s.lip); for (let j = 1; j <= 2; j++) hl(m0 + j, m1 - j, my + j, j === 1 ? teeth : dark);
        px(m0 - 1, my - 1, s.lip); px(m1 + 1, my - 1, s.lip); break;
      case 'angry':
        hl(m0, m1, my, dark); hl(m0, m1, my + 1, teeth); hl(m0, m1, my + 2, dark); px(m0 - 1, my + 2, dark); px(m1 + 1, my + 2, dark); break;
      case 'hurt':
        hl(m0, m1, my, dark); hl(m0 + 1, m1 - 1, my + 1, teeth); px(m0 - 1, my + 1, dark); px(m1 + 1, my - 1, dark); break;
      case 'surprised':
        hl(C - 1, C + 1, my - 1, dark); hl(C - 2, C + 2, my, dark); hl(C - 2, C + 2, my + 1, dark); hl(C - 1, C + 1, my + 2, dark); break;
      case 'sad':
        hl(m0 + 1, m1 - 1, my, s.lip); px(m0, my + 1, s.lip); px(m1, my + 1, s.lip); break;
      case 'smug':
        hl(m0, m1 - 1, my, s.lip); px(m1, my - 1, s.lip); px(m1 + 1, my - 1, s.lip, 0.6); if (s.tooth) px(m1 - 2, my + 1, teeth); break;
      case 'determined':
        hl(m0, m1, my, s.lip); px(m0, my + 1, s.lip, 0.6); px(m1, my + 1, s.lip, 0.6); break;
      case 'sleepy':
        hl(C - 1, C + 1, my, dark); hl(C - 1, C + 1, my + 1, dark); break;
      default:
        hl(m0 + 1, m1 - 1, my, s.lip); px(m0, my, s.lip, 0.6);
    }
    if (st === 'hurt' || st === 'surprised') { px(N - 13, ey - 6, '#9adcff'); px(N - 13, ey - 5, '#9adcff'); px(N - 14, ey - 4, '#7ac0ee'); } // sweat bead
    return new ImageData(data, N, N);
  }
}
