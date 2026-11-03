// PLACEHOLDER (owner: agent A) — Pip the mole-dog. Replace with the real chibi voxel model.
// Contract: docs/REDESIGN.md §6.1.
import * as THREE from 'three';

export function buildPet() {
  const group = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.18), new THREE.MeshLambertMaterial({ color: 0x8a6a5a }));
  m.position.y = 0.12;
  group.add(m);
  return { group, anim: 'idle', play(a) { this.anim = a; }, update() {}, lookAt() {} };
}
