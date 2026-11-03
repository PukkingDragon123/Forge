// PLACEHOLDER (owner: agent C) — top-down rooms. Contract: docs/REDESIGN.md §9.1.
import * as THREE from 'three';
import { Grid } from '../action/index.js';

export function buildRoom(stage = 0, room = {}, opts = {}) {
  const W = opts.size === 'boss' ? 24 : opts.size === 'large' ? 22 : 15, D = opts.size === 'boss' ? 15 : opts.size === 'large' ? 13 : 9;
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a4a34 }));
  group.add(floor, new THREE.HemisphereLight(0xffe8c8, 0x203020, 1.3));
  const grid = new Grid(Math.round(W / 0.5) + 2, Math.round(D / 0.5) + 2, 0.5);
  for (let z = 0; z < grid.h; z++) for (let x = 0; x < grid.w; x++) if (x === 0 || z === 0 || x === grid.w - 1 || z === grid.h - 1) grid.cells[z * grid.w + x] = 1;
  const door = (x, z, dir) => ({ x, z, dir, state: 'open', setOpen() {} });
  return {
    group, grid, bounds: { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 },
    doors: { n: door(0, -D / 2, 'n'), s: door(0, D / 2, 's'), e: door(W / 2, 0, 'e'), w: door(-W / 2, 0, 'w') },
    spawns: [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 0, z: 2 }], veins: [], anchors: { center: new THREE.Vector3() },
    background: new THREE.Group(), lights: [], fog: new THREE.FogExp2(0x0e1410, 0.02), bg: new THREE.Color(0x0e1410),
    update() {}, setCamera() {}, dispose() {},
  };
}
export function prebuildRoom() {}
