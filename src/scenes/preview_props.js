// Prop lineup preview: ?names=a,b,c (default: every prop) &yaw=0.35 &pitch=0.3 &zoom=1 &opts=<json per name> &lid=0.5
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { ParticleSystem } from '../gfx/particles.js';
import { buildProp, PROP_NAMES, tickProps } from '../models/props.js';

// representative options so the lineup shows the interesting variants
const SHOW = {
  chest: { kind: 'wood' }, mushroom: { glow: '#5af0c8' }, crystal: { light: 1.2 }, stalactite: { length: 20, tip: '#6ad8ff' },
  rails: { length: 2 }, ropebridge: { length: 3, sag: 0.25 }, chains: { length: 1.6 }, lantern: {}, pillar: { height: 24 },
  support: { width: 18, height: 26 }, roots: { length: 14 }, vines: { glow: '#5af0c8' }, rock: { size: 1, moss: '#5a7a3a' },
  lavapool: { radius: 0.8 }, waterpool: { radius: 0.8 }, web: { size: 0.6 }, ladder: { height: 26 },
};

export class PropPreview extends Scene {
  enter() {
    const q = new URLSearchParams(location.search);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16121c);
    this.P = { add: new ParticleSystem(1500, { additive: true }), alpha: new ParticleSystem(800) };
    scene.add(this.P.add.object, this.P.alpha.object);
    const extra = q.get('opts') ? JSON.parse(q.get('opts')) : {};
    let names = q.get('names') ? q.get('names').split(',') : PROP_NAMES;
    if (q.get('page')) { const per = +(q.get('per') || 9); names = names.slice(+q.get('page') * per, (+q.get('page') + 1) * per); }
    const t0 = performance.now();
    this.items = [];
    const lid = +(q.get('lid') ?? 0.5);
    for (const raw of names) {
      const [n, variant] = raw.split(':');
      const o = { ...(SHOW[n] || {}), ...(extra[n] || {}) };
      if (variant) { if (n === 'chest') o.kind = variant; else if (n === 'mushroom') o.giant = variant === 'giant'; else if (n === 'brazier' || n === 'torch' || n === 'campfire') o.palette = variant; else if (n === 'minecart') o.empty = variant === 'empty'; else if (n === 'barrel') o.content = variant; }
      const tb = performance.now();
      const g = buildProp(n, o);
      let tc = 0; g.traverse((m) => { if (m.isMesh) tc += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
      (this.timing = this.timing || []).push([raw, performance.now() - tb, tc]);
      if (n === 'chest') g.userData.open(lid);
      if (n === 'lantern' || n === 'chains' || n === 'stalactite' || n === 'vines' || n === 'banner') g.position.y = n === 'stalactite' ? 1.5 : n === 'banner' ? 1.5 : n === 'chains' ? 1.7 : n === 'vines' ? 1.2 : 0;
      if (n === 'web') g.position.y = 0.7;
      scene.add(g);
      g.updateMatrixWorld(true);
      const box = new THREE.Box3();
      g.traverse((m) => { if (m.isMesh && !m.isInstancedMesh) { const b = new THREE.Box3().setFromObject(m); if (b.max.y - b.min.y < 6) box.union(b); } });
      if (box.isEmpty()) box.set(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 1, 0.3));
      this.items.push({ n: raw, g, box });
    }
    this.buildMs = performance.now() - t0;
    if (q.get('timing')) console.warn(this.timing.sort((a, b) => b[1] - a[1]).map(([n, ms, tc]) => n + ' ' + ms.toFixed(0) + 'ms/' + (tc / 1000).toFixed(1) + 'k').join(' | '));
    // pack into rows
    const maxRowW = +(q.get('row') || 9);
    const rows = [[]];
    let rw = 0;
    for (const it of this.items) {
      const w = Math.max(0.5, it.box.max.x - it.box.min.x) + 0.35;
      if (rw + w > maxRowW && rows.at(-1).length) { rows.push([]); rw = 0; }
      rows.at(-1).push({ it, w });
      rw += w;
    }
    let z = 0, maxW = 0, maxH = 0;
    for (const row of rows) {
      const total = row.reduce((s, r) => s + r.w, 0);
      maxW = Math.max(maxW, total);
      let x = -total / 2;
      const depth = Math.max(...row.map((r) => r.it.box.max.z - r.it.box.min.z)) + 0.6;
      for (const { it, w } of row) {
        it.g.position.x = x + w / 2 - (it.box.min.x + it.box.max.x) / 2;
        it.g.position.z = z - (it.box.min.z + it.box.max.z) / 2;
        maxH = Math.max(maxH, it.box.max.y + it.g.position.y);
        x += w;
      }
      z -= depth;
    }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(maxW + 6, 0.2, -z + 6), new THREE.MeshLambertMaterial({ color: 0x4a3426 }));
    floor.position.set(0, -0.1, z / 2); floor.receiveShadow = true; scene.add(floor);
    // Dungeon-Meshi campfire lighting: warm orange key, teal sky fill, warm-brown bounce
    scene.background = new THREE.Color(0x0e1418);
    scene.add(new THREE.HemisphereLight(0x3e6e78, 0x5a3420, +(q.get('amb') || 1.6)));
    const key = new THREE.DirectionalLight(0xffb070, +(q.get('key') || 2.6));
    key.position.set(-4, 6, 6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -maxW, right: maxW, top: 10, bottom: -10, far: 40 });
    scene.add(key);
    const fire = new THREE.PointLight(0xff8a3a, +(q.get('fire') || 6), 14, 1.4); fire.position.set(0, 1.4, 2.2); scene.add(fire);
    const rim = new THREE.DirectionalLight(0x4ab8c8, 0.8); rim.position.set(5, 3, -6); scene.add(rim);
    // camera fit
    const fov = 30, yaw = +(q.get('yaw') || 0.2), pitch = +(q.get('pitch') || 0.32), zoom = +(q.get('zoom') || 1);
    const cz = z / 2;
    const vf = Math.tan((fov * Math.PI) / 360), hf = vf * 16 / 9;
    const dist = (Math.max((maxW / 2 + 0.3) / hf, ((maxH + -z * Math.sin(pitch)) / 2 + 0.3) / vf) * 1.0 + -z * 0.6) / zoom;
    const look = [+(q.get('lx') || 0), maxH * 0.4 + +(q.get('ly') || 0), cz + +(q.get('lz') || 0)];
    this.rig = new CameraRig(fov);
    this.rig.sway = 0;
    this.rig.cut([look[0] + Math.sin(yaw) * Math.cos(pitch) * dist, look[1] + Math.sin(pitch) * dist, look[2] + Math.cos(yaw) * Math.cos(pitch) * dist], look, fov);
    this.world = { scene, camera: this.rig.camera, post: {} };
    this.labels = q.get('labels') !== '0';
    this.time = 0;
  }
  update(dt) {
    this.time += dt;
    tickProps(this.world.scene, dt, this.time, this.P);
    this.P.add.update(dt); this.P.alpha.update(dt);
    this.rig.update(dt);
  }
  draw(ui) {
    let tris = 0;
    this.world.scene.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
    if (this.labels) for (const it of this.items) {
      const p = this.rig.project(new THREE.Vector3(it.g.position.x, -0.05, it.g.position.z + (it.box.max.z - it.box.min.z) / 2 + 0.1), ui.w, ui.h);
      ui.text(it.n, p.x, p.y, { align: 'center', font: 'small', color: '#f4ecd8', outline: '#140c10' });
    }
    ui.text(`props ${this.items.length} build ${this.buildMs.toFixed(0)}ms tris ${(tris / 1000).toFixed(1)}k fps ${this.game.fps.toFixed(0)}`, 4, 4, { font: 'small', color: '#9d8f7d' });
  }
}
