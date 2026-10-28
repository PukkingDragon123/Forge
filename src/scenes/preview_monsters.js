// Monster lineup preview: ?set=0..5 | set=bosses | id=<monster> ; &state=windup|attack|multi|die|hurt|stun|intro|roar|special ; &phase=2
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { MONSTERS } from '../data/monsters.js';
import { buildMonster } from '../models/monsters.js';

export class PreviewMonsters extends Scene {
  enter() {
    const q = new URLSearchParams(location.search);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a10);
    scene.fog = new THREE.FogExp2(0x0c0a10, 0.035);
    let ids;
    if (q.get('id')) ids = q.get('id').split(',');
    else if (q.get('set') === 'bosses') ids = Object.values(MONSTERS).filter((m) => m.tier === 'boss').map((m) => m.id);
    else if (q.get('set') === 'mimic') ids = ['mimic', 'mimic'];
    else { const r = +(q.get('set') || 0); ids = Object.values(MONSTERS).filter((m) => m.region === r).map((m) => m.id); }
    const t0 = performance.now();
    this.mons = ids.map((id) => buildMonster(id));
    this.buildMs = performance.now() - t0;
    let x = 0;
    const gap = 0.5;
    for (const m of this.mons) {
      const w = m.bounds.max.x - m.bounds.min.x;
      m.group.position.x = x - m.bounds.min.x;
      x += w + gap;
      scene.add(m.group);
    }
    const total = x - gap;
    for (const m of this.mons) m.group.position.x -= total / 2;
    const maxH = Math.max(...this.mons.map((m) => m.height + m.fly));
    const floor = new THREE.Mesh(new THREE.BoxGeometry(total + 8, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0x3a3028 }));
    floor.position.y = -0.1; floor.receiveShadow = true; scene.add(floor);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(total + 8, 8, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a2228 }));
    wall.position.set(0, 4, -3); wall.receiveShadow = true; scene.add(wall);
    scene.add(new THREE.HemisphereLight(0x9a9ac0, 0x3a2a24, 2.2));
    const key = new THREE.DirectionalLight(0xffe0c0, 3.2);
    key.position.set(-4, 6, 6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
    Object.assign(key.shadow.camera, { left: -total, right: total, top: 8, bottom: -2 });
    scene.add(key);
    const warm = new THREE.PointLight(0xff9a4a, 8, 12, 1.4); warm.position.set(-total / 2, 1.5, 2.5); scene.add(warm);
    this.rig = new CameraRig(30);
    const hf = 2 * Math.atan(Math.tan((30 * Math.PI) / 360) * (16 / 9));
    const dist = Math.max((total / 2 + 0.6) / Math.tan(hf / 2), (maxH * 0.75) / Math.tan((30 * Math.PI) / 360), 2.2);
    const yaw = +(q.get('yaw') ?? -0.3); // default: front three-quarter (monsters face −X)
    this.rig.cut([Math.sin(yaw) * dist, maxH * 0.55 + dist * 0.12, Math.cos(yaw) * dist], [0, maxH * 0.42, 0], 30);
    this.rig.sway = 0;
    this.world = { scene, camera: this.rig.camera, post: {} };
    this.state = q.get('state');
    this.phase = +(q.get('phase') || 1);
    if (this.phase > 1) this.mons.forEach((m) => m.setPhase(this.phase));
    this.timer = 0.4;
  }
  update(dt) {
    this.timer -= dt;
    if (this.state && this.timer <= 0) {
      for (const m of this.mons) m.play(this.state, { hits: 4 });
      this.timer = ['windup', 'stun', 'die', 'disguise', 'idle'].includes(this.state) ? 1e9 : 1.6;
    }
    for (const m of this.mons) m.update(dt);
    this.rig.update(dt);
  }
  draw(ui) {
    for (const m of this.mons) {
      const p = this.rig.project(m.group.localToWorld(new THREE.Vector3(0, -0.15, 0.5)), ui.w, ui.h);
      ui.text(m.def.name, p.x, p.y, { align: 'center', font: 'small', color: '#f4ecd8', outline: '#140c10' });
      const hp = this.rig.project(m.group.localToWorld(m.hitPoint.clone()), ui.w, ui.h);
      ui.rect(hp.x - 1, hp.y - 1, 3, 3, '#ff3a3a');
    }
    ui.text(`build ${this.buildMs.toFixed(0)}ms  fps ${this.game.fps.toFixed(0)}`, 4, 4, { font: 'small', color: '#9d8f7d' });
  }
}
