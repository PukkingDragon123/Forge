// Preview bench for environments & props: ?kind=props | campfire | arena | corridor | room | wall | tomb  &region=0..5
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { ParticleSystem } from '../gfx/particles.js';
import { buildProp, PROP_NAMES, tickProps } from '../models/props.js';

export class EnvPreview extends Scene {
  async enter(p) {
    this.kind = p.kind || 'props';
    this.rig = new CameraRig(38);
    const scene = new THREE.Scene();
    this.P = { add: new ParticleSystem(1500, { additive: true }), alpha: new ParticleSystem(800) };
    scene.add(this.P.add.object, this.P.alpha.object);
    this.world = { scene, camera: this.rig.camera, post: {} };
    const t0 = performance.now();
    if (this.kind === 'props') {
      scene.background = new THREE.Color(0x15111a);
      scene.add(new THREE.HemisphereLight(0x9a9ac0, 0x3a2a20, 1.1));
      const d = new THREE.DirectionalLight(0xffe0c0, 1.6); d.position.set(3, 6, 5); scene.add(d);
      const names = (p.names ? p.names.split(',') : PROP_NAMES);
      const cols = Math.ceil(Math.sqrt(names.length * 1.8));
      names.forEach((n, i) => {
        const o = buildProp(n, n === 'chest' ? { kind: ['wood', 'iron', 'crystal', 'bone', 'gold'][i % 5] } : n === 'mushroom' ? { giant: false, glow: '#5af0c8' } : {});
        o.position.set((i % cols) * 1.6 - cols * 0.8, 0, Math.floor(i / cols) * 1.6);
        if (n === 'chest') o.userData.open(0.5);
        scene.add(o);
      });
      const rows = Math.ceil(names.length / cols);
      this.rig.cut([0, 6 + rows, rows * 1.6 + 6], [0, 0, rows * 0.8], 40);
    } else {
      const { buildSet } = await import('../models/environments.js');
      this.set = buildSet(this.kind, +(p.region || 0), { tunnel: p.tunnel, room: p.room, length: 40 });
      this.set.attach(scene);
      const c = this.set.camera;
      this.rig.cut(c.pos, c.look, c.fov);
      this.walk = !!p.walk;
      if (p.at && this.set.pathY) { const x = +p.at; this.set.follow(x); const y = this.set.pathY(x); this.rig.cut([x, y + 1.7, 6.6], [x, y + 0.9, 0], 36); this.time = x / 1.2; }
      if (p.cx) this.rig.cut([+p.cx, +p.cy, +p.cz], [+(p.lx ?? 0), +(p.ly ?? 1), +(p.lz ?? 0)], +(p.fov || 38));
    }
    this.buildMs = performance.now() - t0;
    this.ready = true;
  }
  update(dt) {
    if (!this.ready) return;
    if (this.set) { if (this.set.pathY) { const x = (this.time * 1.2) % this.set.length; this.set.follow(x); if (this.walk) { const y = this.set.pathY(x); this.rig.aim([x, y + 1.7, 6.6], [x, y + 0.9, 0]); } } this.set.update(dt, this.time); }
    else { tickProps(this.world.scene, dt, this.time, this.P); this.P.add.update(dt); this.P.alpha.update(dt); }
    this.rig.update(dt);
  }
  draw(ui) {
    if (!this.ready) return;
    let tris = 0;
    this.world.scene.traverse((o) => { if (o.isMesh && o.geometry.index) tris += o.geometry.index.count / 3 * (o.isInstancedMesh ? o.count : 1); });
    ui.text(`${this.kind} build ${this.buildMs.toFixed(0)}ms tris ${(tris / 1000).toFixed(0)}k fps ${this.game.fps.toFixed(0)}`, 4, ui.h - 10, { font: 'small', color: '#9d8f7d' });
  }
}
