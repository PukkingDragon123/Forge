// On-screen controls for touch screens: voxel medallions (a turned brass/iron rim around a dished
// leather boss with a stitched ring) that stand in for keys. They only appear on touchscreens.
import { VoxGrid, voxObject, rgb, vhash } from './vox_ui.js';

const RIMS = {
  brass: ['#3a2a10', '#6a4a1a', '#9a7030', '#c89a48', '#f0d080'],
  iron: ['#16141a', '#2a2830', '#4a4852', '#706e7a', '#a8a6b4'],
  ember: ['#3a1208', '#7a2a10', '#b84a1a', '#e8803a', '#ffd08a'],
  rune: ['#1a0e2a', '#3a1e5a', '#6a3aa0', '#a070e0', '#e0c8ff'],
  jade: ['#0e2a1e', '#1e4a34', '#2e7a54', '#5ab07a', '#b8f0c8'],
};
const BOSS = ['#140c0a', '#22160f', '#2e1e14', '#3c2a1c'].map(rgb);

/** Medallion canvas of radius r (canvas is 2r+6 square). style: brass|iron|ember|rune|jade; pressed sinks it. */
export function medallion(r, style = 'brass', pressed = false) {
  const rim = (RIMS[style] || RIMS.brass).map(rgb);
  const size = r * 2 + 6;
  return voxObject('medal|' + r + style + (pressed ? 1 : 0), () => {
    const R = r, n = R * 2 + 2, D = 7;
    const g = new VoxGrid(n, n, D);
    const c = n / 2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      if (d > R) continue;
      const a = Math.atan2(dy, dx);
      let h, col;
      if (d > R - 4) {
        // turned rim: a raised band with a bright lip and notches every few degrees
        h = (d > R - 1.2 ? 4 : 6) - (pressed ? 1 : 0);
        const notch = Math.floor((a + Math.PI) * R / 2.2) % 5 === 0;
        const lit = (-dx + dy) / (d || 1); // lamp from the upper left (grid y is up)
        const t = Math.max(0, Math.min(4, Math.round(2 + lit * 1.4 + (d > R - 1.2 ? -1 : 0) + (notch ? -1 : 0))));
        col = rim[t];
      } else {
        // leather boss, dished toward the centre, with a stitched ring near the rim
        const dish = 1 - d / (R - 4);
        h = 3 + Math.round(dish * 1.2) - (pressed ? 1 : 0);
        const v = Math.max(0, Math.min(3, Math.round(1.5 + ((-dx + dy) / (R || 1)) * 1.2 + (vhash(x, y, 7) - 0.5) * 0.8 - (pressed ? 1 : 0))));
        col = BOSS[v];
        if (Math.abs(d - (R - 6.5)) < 0.55 && Math.floor((a + Math.PI) * R / 2.4) % 2 === 0) { col = [Math.round(rim[3][0] * 0.6 + 232 * 0.4), Math.round(rim[3][1] * 0.6 + 220 * 0.4), Math.round(rim[3][2] * 0.6 + 200 * 0.4)]; h += 1; }
      }
      for (let z = 0; z < h; z++) g.set(x, y, z, z === h - 1 ? col : rim[0]);
    }
    return g;
  }, { w: size, h: size, yaw: 0, pitch: 0.32, pad: 2 });
}

/** Small round button for corners (pause, close). */
export function pebble(r, pressed = false) { return medallion(r, 'iron', pressed); }
