// STUB
import * as THREE from 'three';
import { toon } from '../../src/gfx/materials.js';
export function buildWeaponMesh(w) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.02), toon('#c0c8d0')); m.position.y = 0.4; g.add(m); return g; }
export function crackWeapon() {}
export function shatterPieces() { return []; }
