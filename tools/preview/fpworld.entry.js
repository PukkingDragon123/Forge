// Preview of the first-person world kit and the dungeon camp.
//   ?kind=tunnel|junction|chamber|chase|campmenu|campsite &act=0..3 &sub=monster|elite|vein|event|treasure|boss
//   &seed=1 &view=enter|stand|vein|exit|<t on path 0..1> &cam=menu|zoom:<id> &all=1 (bake everything first)
// window.__fp = { st, cam, info, look(px,py,pz,lx,ly,lz), along(t) }
import * as THREE from 'three';
import { Game, Scene } from '../../src/core/game.js';
import { buildFP } from '../../src/models/fp_world.js';
import { buildStage } from '../../src/models/stage_vox.js';

class FPPreview extends Scene {
  enter(p) {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 120);
    const t0 = performance.now();
    const kind = p.kind || 'tunnel', act = +(p.act || 0);
    const st = kind === 'campmenu' || kind === 'campsite' ? buildStage(kind, act, {}) : buildFP(kind, act, { seed: +(p.seed || 1), kind: p.sub || 'monster', exits: p.exits ? p.exits.split(',').map(Number) : undefined, length: p.len ? +p.len : undefined, bend: p.bend ? +p.bend : undefined });
    const ms = performance.now() - t0;
    st.attach(scene);
    st.setCamera(cam);
    if (p.all) st.stream && st.stream.all && st.stream.all();
    this.st = st; this.cam = cam;
    this.world = { scene, camera: cam, post: { bloom: 0.8, threshold: 0.8, vignette: 0.35, saturation: 1.1, outline: 0.5 } };
    const A = st.anchors || {};
    const look = (px, py, pz, lx, ly, lz) => { cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz); };
    const along = (t) => { const c = A.path; const a = c.getPointAt(Math.min(0.999, t)), b = c.getPointAt(Math.min(1, t + 0.02)); look(a.x, a.y, a.z, b.x, b.y, b.z); };
    const v = p.view || 'enter';
    if (p.cam && st.cams) { const c = p.cam.startsWith('zoom:') ? st.cams.zoom[p.cam.slice(5)] : st.cams[p.cam]; cam.fov = c.fov; cam.updateProjectionMatrix(); look(...c.pos, ...c.look); }
    else if (kind === 'campmenu' || kind === 'campsite') { const c = st.camera; cam.fov = c.fov; cam.updateProjectionMatrix(); look(...c.pos, ...c.look); }
    else if (v === 'enter') look(A.enter.x, A.enter.y, A.enter.z, A.look.x, A.look.y, A.look.z);
    else if (v === 'stand') look(A.stand.x, A.stand.y, A.stand.z, A.look.x, A.look.y, A.look.z);
    else if (v === 'vein' && A.vein) look(A.vein.stand.x, A.vein.stand.y, A.vein.stand.z, A.vein.look.x, A.vein.look.y, A.vein.look.z);
    else if (v.startsWith('exit') && A.exits) { const e = A.exits[+(v.slice(4) || 0)] || A.exits[0]; look(A.stand.x, A.stand.y, A.stand.z, e.look.x, e.look.y, e.look.z); }
    else if (v === 'back') look(A.look.x, 1.4, A.look.z, A.enter.x, 1.0, A.enter.z);
    else if (!isNaN(+v)) along(+v);
    this.info = { ms: Math.round(ms), faces: st.faces, tiles: st.tiles ? st.tiles.tiles.size + '/' + st.tiles.all.length : '-' };
    window.__fp = { st, cam, info: this.info, look, along, scene };
  }
  update(dt) {
    this.st.update(dt, this.time);
    this.info.faces = this.st.faces; if (this.st.tiles) this.info.tiles = this.st.tiles.tiles.size + '/' + this.st.tiles.all.length;
  }
  draw(ui) { const tm = this.st.timing; ui.text(`${this.info.ms}ms  faces ${this.info.faces}  tiles ${this.info.tiles}` + (tm ? `  paint ${tm.paint | 0} (shell ${tm.shell | 0}) mesh ${tm.mesh | 0} chunks ${tm.chunks}` : ''), 6, 6, { color: '#ffffff' }); }
}
const g = new Game(document.getElementById('stage'), null);
g.register('p', FPPreview);
g.go('p', Object.fromEntries(new URLSearchParams(location.search).entries()), { transition: 'none' });
g.start();
window.FORGLITE = g;
