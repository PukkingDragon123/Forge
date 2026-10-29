// On-screen controls for touch screens: hand-made medallions (a brass or iron rim around a dark
// leather boss, inked edge, a lamp-lit highlight) that stand in for keys. They only appear while
// the player is using a touchscreen.
import { Painter, dither } from '../art/pixel.js';
import { hexToRgb, shadeHex, mixHex, hash2 } from '../core/math.js';

const RIMS = {
  brass: ['#3a2a10', '#6a4a1a', '#9a7030', '#c89a48', '#f0d080'],
  iron: ['#16141a', '#2a2830', '#4a4852', '#706e7a', '#a8a6b4'],
  ember: ['#3a1208', '#7a2a10', '#b84a1a', '#e8803a', '#ffd08a'],
  rune: ['#1a0e2a', '#3a1e5a', '#6a3aa0', '#a070e0', '#e0c8ff'],
  jade: ['#0e2a1e', '#1e4a34', '#2e7a54', '#5ab07a', '#b8f0c8'],
};
const cache = new Map();

/** Medallion canvas of radius r. style: brass|iron|ember|rune|jade; pressed sinks it. */
export function medallion(r, style = 'brass', pressed = false) {
  const key = r + style + (pressed ? 1 : 0);
  let c = cache.get(key);
  if (c) return c;
  const rim = RIMS[style] || RIMS.brass;
  const size = r * 2 + 6;
  const p = new Painter(size, size);
  const cx = r + 3, cy = r + 3;
  const boss = ['#140c0a', '#22160f', '#2e1e14', '#3c2a1c'].map(hexToRgb);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) + (hash2(Math.round(Math.atan2(dy, dx) * 9), 1, r) - 0.5) * 0.9;
    if (d > r) continue;
    const lit = (-dx - dy) / (d || 1); // lamp from the upper left
    if (d > r - 4) {
      // the rim: a turned band with a bright lip
      const v = 0.45 + lit * 0.35 + (d > r - 1.2 ? -0.25 : d < r - 3 ? 0.18 : 0) + (pressed ? -0.15 : 0);
      const t = Math.max(0, Math.min(0.999, v)) * (rim.length - 1), i = Math.floor(t);
      p.set(x, y, dither(x, y, t - i) ? rim[Math.min(i + 1, rim.length - 1)] : rim[i]);
    } else {
      // the leather boss, dished in the middle, stitched near the rim
      const v = 0.35 - lit * 0.2 * (d / r) + (pressed ? -0.2 : 0.05) + (hash2(x, y, 7) - 0.5) * 0.12;
      const t = Math.max(0, Math.min(0.999, v)) * (boss.length - 1), i = Math.floor(t);
      p.set(x, y, dither(x, y, t - i) ? boss[Math.min(i + 1, 3)] : boss[i]);
      if (Math.abs(d - (r - 6.5)) < 0.5 && Math.floor(Math.atan2(dy, dx) * r / 2.4) % 2 === 0) p.set(x, y, hexToRgb(mixHex(rim[3], '#e8dcc8', 0.4)));
    }
  }
  p.outline('#0c0806');
  c = p.toCanvas();
  cache.set(key, c);
  return c;
}

/** Small round icon-only button for corners (pause, close). */
export function pebble(r, pressed = false) { return medallion(r, 'iron', pressed); }
void shadeHex;
