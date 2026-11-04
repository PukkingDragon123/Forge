// Monster lineup preview: ?set=0..3 (acts) | set=bosses | set=snakes | id=<monster,…> ; &state=windup|attack|multi|die|hurt|stun|intro|roar|special ;
// &phase=2 ; &zoom=2 ; &yaw=-0.3 ; &stone=0..1 ; &seq=1 (petrify → cracks → shatter) ; &fp=3 (first-person camera at 0.95 m, 3 m away)
// &top=14 (the v5 Hades camera: 52° down, FOV 32, 14 m away) ; &states=talk,wave,… (one per monster)
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig } from '../gfx/camera.js';
import { MONSTERS } from '../data/monsters.js';
import { buildMonster } from '../models/monsters.js';

export class PreviewMonsters extends Scene {
  enter() {
    window.__monsters = { buildMonster, MONSTERS }; // for automated build checks
    const q = new URLSearchParams(location.search);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a10);
    scene.fog = new THREE.FogExp2(0x0c0a10, 0.035);
    let ids;
    if (q.get('id')) ids = q.get('id').split(',');
    else if (q.get('set') === 'bosses') ids = Object.values(MONSTERS).filter((m) => m.tier === 'boss').map((m) => m.id);
    else if (q.get('set') === 'mimic') ids = ['mimic', 'mimic'];
    else if (q.get('set') === 'snakes') ids = ['adder', 'vine_viper', 'glass_adder', 'cistern_naga', 'ember_asp', 'gorgon_snake', 'coil_brood', 'basilisk'];
    else if (q.get('set') === 'heralds') ids = ['thornscale', 'glasscoil', 'cinderfang'];
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
    const back = Math.max(3, ...this.mons.map((m) => -m.bounds.min.z + 1));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(total + 8, 8, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a2228 }));
    wall.position.set(0, 4, -back); wall.receiveShadow = true; scene.add(wall);
    scene.add(new THREE.HemisphereLight(0x9a9ac0, 0x3a2a24, 2.2));
    const key = new THREE.DirectionalLight(0xffe0c0, 3.2);
    key.position.set(-4, 6, 6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
    Object.assign(key.shadow.camera, { left: -total, right: total, top: 8, bottom: -2 });
    scene.add(key);
    const warm = new THREE.PointLight(0xff9a4a, 8, 12, 1.4); warm.position.set(-total / 2, 1.5, 2.5); scene.add(warm);
    this.rig = new CameraRig(30);
    const hf = 2 * Math.atan(Math.tan((30 * Math.PI) / 360) * (16 / 9));
    const dist = Math.max((total / 2 + 0.6) / Math.tan(hf / 2), (maxH * 0.75) / Math.tan((30 * Math.PI) / 360), 1.7) / +(q.get('zoom') || 1);
    const yaw = +(q.get('yaw') ?? -0.3); // default: front three-quarter (monsters face −X)
    const zy = q.get('zoom') ? maxH * 0.5 : maxH * 0.42;
    if (q.get('top')) {
      // the Hades camera of the v5 action game: ~52° down, FOV 32, room-scale distance (top=<metres>)
      const d = +q.get('top') || 14, pitch = (52 * Math.PI) / 180;
      this.rig = new CameraRig(32);
      this.rig.cut([0, Math.sin(pitch) * d, Math.cos(pitch) * d], [0, 0.4, 0], 32);
    } else if (q.get('fp')) {
      // first person: eye height 0.95 m, the creature fp metres ahead, FOV 62
      const fp = +q.get('fp');
      this.rig = new CameraRig(62);
      const front = Math.max(...this.mons.map((m) => m.bounds.max.z));
      this.rig.cut([0, 0.95, front + fp], [0, Math.min(1.4, maxH * 0.5), 0], 62);
    } else this.rig.cut([Math.sin(yaw) * dist, zy + maxH * 0.13 + dist * 0.12, Math.cos(yaw) * dist], [0, zy, 0], 30);
    this.rig.sway = 0;
    this.world = { scene, camera: this.rig.camera, post: {} };
    this.state = q.get('state');
    this.states = q.get('states') ? q.get('states').split(',') : null; // per-monster states (index-matched)
    this.phase = +(q.get('phase') || 1);
    if (this.phase > 1) this.mons.forEach((m) => m.setPhase(this.phase));
    this.timer = 0.4;
    if (q.get('stone')) this.mons.forEach((m) => m.setStone && m.setStone(+q.get('stone')));
    this.seq = q.get('seq') ? 0 : null;
    this.cracksAt = +(q.get('cracks') || 0);
    if (this.cracksAt && this.mons[0].stoneCracks) for (const m of this.mons) { m.setStone(1); const n = m.stoneCracks().length; for (let i = 0; i < Math.min(n, this.cracksAt); i++) m.crackAt(i); }
  }
  /** petrify sequence: stone sweeps up (1.6 s), a crack opens every 0.45 s, then the statue shatters */
  stepSeq(dt) {
    this.seq += dt;
    const t = this.seq;
    for (const m of this.mons) {
      if (!m.setStone) continue;
      if (t < 2) m.setStone(Math.min(1, t / 1.6));
      const n = m.stoneCracks().length;
      const ci = Math.floor((t - 2) / 0.45);
      if (t >= 2 && ci < n && ci >= 0 && !m.cracks[ci].target) m.crackAt(ci);
      if (t >= 2 + n * 0.45 + 0.4 && !m.shattered) { m.shatter(); }
      if (m.shattered) m.shattered.update(dt);
    }
  }
  update(dt) {
    this.timer -= dt;
    if (this.states && !this._statesSet) { this._statesSet = true; this.mons.forEach((m, i) => { const st = this.states[i % this.states.length]; if (st === 'stone') m.setStone(1); else if (st && st !== 'idle') m.play(st, { hits: 4 }); }); }
    if (this.state && this.timer <= 0) {
      for (const m of this.mons) m.play(this.state, { hits: 4 });
      this.timer = ['windup', 'stun', 'die', 'disguise', 'idle'].includes(this.state) ? 1e9 : 1.6;
    }
    if (this.seq !== null) this.stepSeq(dt);
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
