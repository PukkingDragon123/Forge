// PLACEHOLDER (owner: agent A) — first-person chibi arms. Replace with the real voxel rig.
// Contract: docs/REDESIGN.md §6.1.
import * as THREE from 'three';

export function buildFPArms(charId = 'bran') {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
  for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), mat); h.position.set(0.22 * s, -0.22, -0.42); group.add(h); }
  return { group, charId, anim: 'idle', held: 'none', hold(kind) { this.held = kind; }, play(a) { this.anim = a; }, update() {} };
}
