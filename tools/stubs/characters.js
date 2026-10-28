// STUB
import * as THREE from 'three';
import { toon } from '../../src/gfx/materials.js';
import { CHARACTERS } from '../../src/data/characters.js';
export function buildCharacter(id) {
  const g = new THREE.Group();
  const c = CHARACTERS[id].model;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.7, 6), toon(c.cloth)); body.position.y = 0.45; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.36), toon(c.skin)); head.position.y = 1.0; head.castShadow = true;
  g.add(body, head);
  return { group: g, anim: 'idle', update() {}, play(a, o = {}) { this.anim = a; if (o.onDone) setTimeout(o.onDone, 400); }, setExpression() {}, hold() {}, lookAt() {}, headPos() { return g.localToWorld(new THREE.Vector3(0, 1.3, 0)); }, setVisible(b) { g.visible = b; }, kindle: id === 'elio' ? { setElement() {} } : null };
}
