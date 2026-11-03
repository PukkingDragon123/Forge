// PLACEHOLDER (owner: agent A) — Medusa and her totem. Replace with the real voxel models.
// Contract: docs/REDESIGN.md §6.1 (Monster-compatible API + cinematic extras).
import * as THREE from 'three';

export function buildMedusa() {
  const group = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0x5a8a6a }));
  m.position.y = 1.1;
  group.add(m);
  const bounds = new THREE.Box3().setFromObject(group);
  return {
    group, bounds, height: 2.2, hitPoint: new THREE.Vector3(0, 1.4, 0), cutPoints: [], fly: 0, state: 'idle',
    play(s) { this.state = s; }, update() {}, flash() {}, setPhase() {}, setEyes() {}, setStone() {}, dispose() {},
  };
}

export function buildMedusaTotem() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.18, 6), new THREE.MeshLambertMaterial({ color: 0x9aa890 }));
  m.position.y = 0.09;
  g.add(m);
  g.shatter = () => [];
  return g;
}
