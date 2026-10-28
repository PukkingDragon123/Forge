// STUB
import * as THREE from 'three';
import { toon } from '../../src/gfx/materials.js';
import { MONSTERS } from '../../src/data/monsters.js';
export function buildMonster(id) {
  const d = MONSTERS[id]; const s = d.model.scale || 1; const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.6 * s, 0.5 * s), toon(d.model.body)); b.position.y = 0.3 * s; b.castShadow = true; g.add(b);
  return { group: g, height: 0.6 * s, hitPoint: new THREE.Vector3(0, 0.3 * s, 0), cutPoints: [new THREE.Vector3(0, 0.3 * s, 0.2), new THREE.Vector3(0.1, 0.5 * s, 0)], mouthPoint: new THREE.Vector3(-0.3 * s, 0.4 * s, 0), update() {}, play(st, o = {}) { if (o.onDone) setTimeout(o.onDone, 300); }, flash() {}, setPhase() {}, dispose() {} };
}
