// PLACEHOLDER (owner: agent C) — first-person voxel world kit. Replace with the real builders.
// Contract: docs/REDESIGN.md §6.3. buildFP(kind, act, opts) → stage with .group, .anchors, .update, .attach.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function buildFP(kind, act = 0, opts = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x4a3d33, side: THREE.BackSide });
  const L = kind === 'tunnel' || kind === 'chase' ? (opts.length || 12) : 8;
  const box = new THREE.Mesh(new THREE.BoxGeometry(kind === 'tunnel' || kind === 'chase' ? 2.4 : 8, 3, L), mat);
  box.position.set(0, 1.5, -L / 2);
  group.add(box);
  group.add(new THREE.HemisphereLight(0xffe0c0, 0x2a2030, 1.2));
  const anchors = {
    path: new THREE.CatmullRomCurve3([V(0, 0.95, 0), V(0, 0.95, -L / 2), V(0, 0.95, -L)]),
    stand: V(0, 0.95, -3), enter: V(0, 0.95, 0), look: V(0, 0.9, -6), exit: V(0, 0.95, -L),
    exits: (opts.exits || [0]).map((d) => ({ dir: d, pos: V(d * 3, 0.95, -6), look: V(d * 4, 0.95, -7), mouth: V(d * 3, 1, -7) })),
    spawns: [{ pos: V(0, 0, -5), from: 'floor' }], vein: { pos: V(2, 1, -5), normal: V(-1, 0, 0) },
    chest: V(0, 0, -5), event: V(0, 0, -5), friend: V(1.5, 0, -6), beats: [],
  };
  return {
    kind, group, anchors, fog: new THREE.FogExp2(0x0a0808, 0.08), background: new THREE.Color(0x0a0808), flames: [], lights: [],
    attach(scene) { scene.add(group); scene.fog = this.fog; scene.background = this.background; return this; },
    update() {}, setCamera() {}, dispose() {},
  };
}
