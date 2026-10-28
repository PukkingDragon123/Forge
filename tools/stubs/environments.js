// STUB
import * as THREE from 'three';
import { toon } from '../../src/gfx/materials.js';
import { REGIONS } from '../../src/data/regions.js';
export function buildSet(kind, region = 0, opts = {}) {
  const R = REGIONS[region]; const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(kind === 'corridor' ? 60 : 14, 0.2, 8), toon(R.pal.rock[2])); floor.position.set(kind === 'corridor' ? 20 : 0, -0.1, 0); floor.receiveShadow = true; group.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(kind === 'corridor' ? 60 : 14, 6, 0.4), toon(R.pal.rock[1])); wall.position.set(kind === 'corridor' ? 20 : 0, 3, -3); group.add(wall);
  const key = new THREE.PointLight(R.light.key, 8, 12, 1.5); key.position.set(0, 3, 2); group.add(key);
  group.add(new THREE.HemisphereLight(0x8080a0, 0x302018, 0.5));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  return { group, lights: [key], update() {}, floorY: 0, fog: R.pal.fog, background: R.pal.sky, pathY: () => 0,
    anchors: { player: V(-1.6, 0, 0), monster: V(1.8, 0, 0), forge: V(-0.6, 0, 0.5), center: V(0, 0, 0), seat0: V(-1.2, 0, 0.6), seat1: V(1.2, 0, 0.6), seat2: V(-0.6, 0, -0.8), seat3: V(0.6, 0, -0.8), mineEntrance: V(0, 1, -3), gridOrigin: V(-1.12, 2.4, -2.6) },
    camera: { pos: [0, 2, 6], look: [0, 0.8, 0], fov: 40 }, emitters: [] };
}
