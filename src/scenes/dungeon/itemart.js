// Item art for the UI: weapons are drawn from the voxel weapon kit (laid along their bag footprint),
// everything else uses the ore/material sprites.
import * as THREE from 'three';
import { voxSprite } from '../../gfx/voxsprite.js';
import { buildWeaponMesh } from '../../models/weapons3d.js';
import { itemSprite, materialSprite, weaponSprite } from '../../art/sprites.js';
import { MATERIALS } from '../../data/materials.js';
import { SHAPES, rotateCells, cellsSize } from '../../data/shapes.js';

/** The weapon look of an item ({ bp, ids, grade }) or null. */
export function weaponLook(it) {
  const m = it && MATERIALS[it.id];
  if (!m || m.kind !== 'weapon') return null;
  const L = m.look || (m.wpn ? { bp: m.wpn.type, ids: ['iron', 'iron'] } : null);
  return L ? { bp: L.bp, ids: L.ids || ['iron'], grade: Math.max(0, (it.q ?? 2) - 1) } : null;
}
function shared(o) { o.traverse((c) => { if (c.geometry) c.geometry.userData.shared = true; }); return o; }

/** Item filling its bag footprint (cell px per cell), like itemSprite. */
export function itemArt(it, cell = 32, rot = 0) {
  const look = weaponLook(it);
  if (!look) return itemSprite(it.id, cell, rot);
  const m = MATERIALS[it.id];
  const { w, h } = cellsSize(rotateCells(SHAPES[m.shape || 'o1'] || SHAPES.o1, rot || 0));
  const W = w * cell, H = h * cell;
  const across = W >= H;
  return voxSprite(`iw|${it.id}|${look.grade}|${cell}|${rot}`, () => { const g = new THREE.Group(); g.add(shared(buildWeaponMesh(look))); return g; },
    { w: W, h: H, yaw: 0.35, pitch: 0.22, roll: across ? -Math.PI / 2 + 0.25 : 0.25, pad: 2, outline2: cell >= 32 });
}
/** Square icon (size px). */
export function iconArt(it, size = 32) {
  const look = weaponLook(it);
  if (look) return weaponSprite(look, size >= 48 ? 64 : size);
  return materialSprite(it.id, 32);
}
