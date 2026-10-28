// Stage geometry shared by the painter and stage2d: default cameras per kind and the world-space
// rectangles of each painted layer, sized so one texel lands on one virtual (960×540) pixel.
export const VH = 540;
export const ppuAt = (cam, z) => VH / (2 * Math.max(0.5, cam.pos[2] - z) * Math.tan((cam.fov * Math.PI) / 360));

export const CAM = {
  arena: { pos: [0, 1.5, 7.4], look: [0, 1.15, 0], fov: 38 },
  tomb: { pos: [0, 2.2, 8], look: [0, 1.3, -0.5], fov: 40 },
  room: { pos: [0, 2.0, 6.2], look: [0, 0.9, -0.5], fov: 38 },
  corridor: { pos: [0, 1.7, 6.6], look: [0, 0.9, 0], fov: 36 },
  wall: { pos: [0, 1.62, 4.6], look: [0, 1.5, -1], fov: 42 },
  campfire: { pos: [0, 2.3, 5.8], look: [0, 0.75, -0.4], fov: 40 },
};

export function flatGeo(kind, ri, opts) {
  const cam = CAM[kind];
  const L = opts.length || 34;
  const corridor = kind === 'corridor';
  const tun = opts.tunnel || 'tunnel';
  const wallZ = kind === 'wall' ? -1.3 : kind === 'room' ? -3.0 : kind === 'tomb' ? -3.4 : corridor ? (tun === 'crawl' ? -1.7 : -2.3) : -2.2;
  // only paint what the default (and nearby) cameras can see
  const xr = corridor ? [-7, L + 7] : kind === 'wall' ? [-5.5, 5.5] : [-9.5, 9.5];
  const lowY = corridor && /bridge$/.test(tun) ? -3.4 : corridor && tun === 'elevator' ? -4.8 : corridor && tun === 'stairs' ? -2.6 : kind === 'wall' ? -0.8 : -0.6;
  const topY = kind === 'wall' ? 4.6 : kind === 'tomb' ? 8.2 : kind === 'room' ? 6.4 : corridor ? 5.2 : 6.6;
  const wall = { x0: xr[0], x1: xr[1], y0: lowY, y1: topY, z: wallZ, ppu: Math.round(ppuAt(cam, wallZ)) };
  const midZ = wallZ - 6, farZ = wallZ - 16;
  const pm = Math.round(ppuAt(cam, midZ)), pf = Math.round(ppuAt(cam, farZ));
  const mid = { x0: xr[0] - 4, x1: xr[1] + 4, y0: lowY - 3, y1: topY + 2.4, z: midZ, ppu: pm };
  const far = { x0: xr[0] - 9, x1: xr[1] + 9, y0: lowY - 5, y1: topY + 4.5, z: farZ, ppu: pf };
  const gz1 = cam.pos[2] - 1.6;
  const ppuX = Math.round(ppuAt(cam, (wallZ + gz1) / 2) * 0.75);
  const groundG = { x0: xr[0], x1: xr[1], z0: wallZ, z1: gz1, y: 0, ppuX, ppuZ: Math.round(ppuX * 0.42) };
  return { far, mid, wall, ground: groundG };
}
