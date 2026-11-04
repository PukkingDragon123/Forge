// Preview of the top-down rooms through a Hades-style camera.
//   ?stage=0..3 &type=fight|vein|treasure|craft|shrine|secret|start|boss|chase &size=normal|large|boss|chase
//   &seed=1 &doors=n,e,s,w (or n:boss,e:locked,s:secret) &fx=0 &fz=0 (camera focus) &dist=16 &pitch=52 &fov=32
//   &grid=1 (overlay the collision grid) &all=1 (bake everything first) &hole=1 &mined=1 &closed=1
// window.__room = { room, cam, info }
import * as THREE from 'three';
import { Game, Scene } from '../../src/core/game.js';
import { buildRoom, BAKE_STATS } from '../../src/models/room_vox.js';

class RoomPreview extends Scene {
  enter(p) {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(+(p.fov || 32), 16 / 9, 0.1, 200);
    const doors = {};
    for (const d of ['n', 'e', 's', 'w']) doors[d] = false;
    (p.doors ?? 'n,e,s,w').split(',').filter(Boolean).forEach((t) => { const [d, st] = t.split(':'); doors[d] = st || 'open'; });
    const t0 = performance.now();
    const room = buildRoom(+(p.stage || 0), { type: p.type || 'fight', seed: +(p.seed || 1) }, { type: p.type || 'fight', seed: +(p.seed || 1), doors, size: p.size });
    const ms = performance.now() - t0;
    room.attach(scene);
    room.setCamera(cam);
    if (p.all) room.bakeAll();
    if (p.hole) room.openHole(1);
    if (p.mined) room.veins.forEach((v) => v.setMined(1));
    if (p.closed) for (const d of Object.values(room.doors)) d.setOpen(0);
    const pitch = (+(p.pitch || 52)) * Math.PI / 180, dist = +(p.dist || 16);
    const fx = +(p.fx || 0), fz = +(p.fz || 0);
    cam.position.set(fx, Math.sin(pitch) * dist, fz + Math.cos(pitch) * dist);
    cam.lookAt(fx, 0, fz);
    if (p.grid) scene.add(gridOverlay(room.grid));
    this.room = room; this.cam = cam;
    this.world = { scene, camera: cam, post: { bloom: 0.8, threshold: 0.78, vignette: 0.32, saturation: 1.12, outline: 0.5 } };
    this.info = { ms: Math.round(ms), core: Math.round(room.timing.firstFrame || 0), plan: Math.round(room.timing.plan) };
    window.__room = { room, cam, info: this.info, scene };
  }
  update(dt) { this.room.update(dt, this.time); }
  draw(ui) { const r = this.room; ui.text(`build ${this.info.ms}ms (plan ${this.info.plan}, core ${this.info.core})  faces ${r.faces}  ${Math.round(r.progress() * 100)}%  dress ${Math.round(r.timing.dress)}ms back ${Math.round(r.timing.back)}ms  ${r.pattern}  f core ${r.timing.f_core | 0} dress ${r.timing.f_dress | 0} back ${r.timing.f_back | 0}  paint ${BAKE_STATS.paint | 0} mesh ${BAKE_STATS.mesh | 0} chunks ${BAKE_STATS.chunks}`, 6, 6, { color: '#ffffff' }); }
}
function gridOverlay(grid) {
  const g = new THREE.Group();
  const cols = [null, 0xff3a3a, 0xffd23a, 0x3a8aff];
  const geo = new THREE.PlaneGeometry(grid.tile * 0.92, grid.tile * 0.92).rotateX(-Math.PI / 2);
  for (let tz = 0; tz < grid.h; tz++) for (let tx = 0; tx < grid.w; tx++) {
    const v = grid.get(tx, tz); if (!v) continue;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[v], transparent: true, opacity: 0.45, depthTest: false }));
    const [x, z] = grid.toWorld(tx, tz); m.position.set(x, 0.05, z); m.renderOrder = 10; g.add(m);
  }
  return g;
}
const g = new Game(document.getElementById('stage'), null);
g.register('p', RoomPreview);
g.go('p', Object.fromEntries(new URLSearchParams(location.search).entries()), { transition: 'none' });
g.start();
window.FORGLITE = g;
