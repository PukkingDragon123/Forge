// STUB
import * as THREE from 'three';
import { toon } from '../../src/gfx/materials.js';
export function buildProp(name) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), toon('#8a5a33')); m.position.y = 0.2; g.add(m); g.userData.open = () => {}; return g; }
