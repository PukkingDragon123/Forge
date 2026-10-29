// Voxel 3D versions of materials, built from their own pixel sprites so the model always matches the
// card art: the silhouette is extruded into a puffy solid (thicker in the middle), every voxel takes
// its sprite pixel's colour, bright facets bulge forward, and crystal/gem/core colours glow.
import * as THREE from 'three';
import { VoxelGrid, meshVoxels, GLOW, packColor } from '../gfx/voxel.js';
import { materialSprite } from '../art/sprites.js';
import { MATERIALS } from '../data/materials.js';

const GLOWY = new Set(['gem', 'crystal', 'essence', 'core']);
const GLOW_IDS = new Set(['magmasteel', 'cursedore', 'ember', 'storm', 'rime', 'venomite', 'voidcrystal', 'soulstone', 'glowcap', 'lava_core', 'fire_gland', 'wisp_essence', 'sentinel_eye', 'warden_eye', 'queen_heart', 'wyrm_heart', 'stariron']);
const grids = new Map();

function gridFor(id, res) {
  const key = id + '|' + res;
  let g = grids.get(key);
  if (g) return g;
  const m = MATERIALS[id] || { kind: 'ore', color: '#a0a0a0' };
  const spr = materialSprite(id, res);
  const W = spr.width, H = spr.height;
  const px = spr.getContext('2d').getImageData(0, 0, W, H).data;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : px[(x + y * W) * 4 + 3]);
  const lumAt = (x, y) => { const i = (x + y * W) * 4; return (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255; };
  // drop the 2D ink outline: a 3D model gets its edges from light and the renderer's outline pass
  const keep = (x, y) => {
    if (alpha(x, y) < 128) return false;
    const edge = !alpha(x - 1, y) || !alpha(x + 1, y) || !alpha(x, y - 1) || !alpha(x, y + 1);
    return !(edge && lumAt(x, y) < 0.12);
  };
  // distance to the silhouette edge (chamfer), for a pillowy thickness
  const dist = new Float32Array(W * H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dist[x + y * W] = keep(x, y) ? 99 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : dist[x + y * W]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = x + y * W; if (dist[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = x + y * W; if (dist[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1); }
  const D = Math.max(6, Math.round(res * 0.42));
  g = new VoxelGrid(W, H, D);
  const cz = D / 2;
  const glowy = GLOWY.has(m.kind) || GLOW_IDS.has(id);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!keep(x, y)) continue;
    const i = (x + y * W) * 4;
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    const L = lumAt(x, y), sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255;
    const t = Math.min(cz - 0.5, 0.8 + Math.sqrt(dist[x + y * W]) * 1.35 + L * 1.2);
    const col = packColor((r << 16) | (gg << 8) | b);
    const flags = glowy && L > 0.68 && sat > 0.25 ? GLOW : 0; // only the brightest crystal facets glow
    for (let z = Math.floor(cz - t * 0.85); z <= Math.ceil(cz + t); z++) g.set(x, H - 1 - y, z, col | flags);
  }
  grids.set(key, g);
  return g;
}

/**
 * A voxel model of material `id`. opts: { size: world height (default 1), res: sprite pixels
 * (default 28), glow: glow intensity }. Returns a THREE.Group centred on the origin with
 * userData.spin(dt) for a gentle showcase rotation.
 */
export function buildOreModel(id, opts = {}) {
  const res = opts.res || 28;
  const g = gridFor(id, res);
  const size = (opts.size ?? 1) / g.ny;
  const mesh = meshVoxels(g, { size, origin: [g.nx / 2, g.ny / 2, g.nz / 2], jitter: 0.03, seed: res, glowIntensity: opts.glow ?? 2.4 });
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.spin = (dt) => { group.rotation.y += dt * (opts.spinSpeed ?? 0.9); };
  return group;
}
