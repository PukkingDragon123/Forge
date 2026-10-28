// Visual test bench for the render pipeline + UI kit (open with ?scene=test).
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig, FlickerLight } from '../gfx/camera.js';
import { VoxelGrid, meshVoxels, GLOW } from '../gfx/voxel.js';
import { ParticleSystem } from '../gfx/particles.js';
import { toon } from '../gfx/materials.js';
import { fbm3, hash3 } from '../core/math.js';
import { iconNames } from '../ui/icons.js';

export class TestScene extends Scene {
  enter() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0910);
    scene.fog = new THREE.FogExp2(0x0b0910, 0.06);
    this.rig = new CameraRig(38);
    this.rig.cut([0, 2.2, 6.5], [0, 0.8, 0], 38);
    this.world = { scene, camera: this.rig.camera, post: {} };

    // voxel cave floor + back wall
    const g = new VoxelGrid(90, 40, 60);
    const S = 0.12;
    for (let z = 0; z < 60; z++) for (let x = 0; x < 90; x++) {
      const h = 3 + Math.floor(fbm3(x * 0.08, 0, z * 0.08, 2, 3) * 4);
      for (let y = 0; y < h; y++) {
        const n = hash3(x, y, z, 5);
        g.set(x, y, z, y === h - 1 ? (n > 0.85 ? '#5a4a3e' : '#4a3d33') : '#352b25');
      }
    }
    // back wall with bumps
    for (let z = 0; z < 14; z++) for (let y = 0; y < 40; y++) for (let x = 0; x < 90; x++) {
      const d = fbm3(x * 0.06, y * 0.06, z * 0.2, 3, 9);
      if (z < 6 + d * 10) g.set(x, y, z, hash3(x, y, z, 2) > 0.5 ? '#3e352f' : '#463b33');
    }
    // crystals
    for (let k = 0; k < 6; k++) {
      const cx = 10 + k * 13, cz = 14 + (k % 2) * 6;
      for (let y = 0; y < 8 + (k % 3) * 3; y++) g.box(cx, 5 + y, cz, cx + 2, 6 + y, cz + 2, k % 2 ? '#6ad8ff' : '#c08aff', GLOW);
    }
    const mesh = meshVoxels(g, { size: S, origin: [45, 0, 30] });
    scene.add(mesh);

    // campfire glow logs
    const fire = new FlickerLight(0xff8a3a, 7, 9, { amount: 0.3 });
    fire.position.set(0, 1.2, 0.5);
    fire.castShadow = true;
    fire.shadow.mapSize.set(512, 512);
    scene.add(fire);
    this.fire = fire;
    scene.add(new THREE.HemisphereLight(0x6a6a9a, 0x2a1a14, 0.35));
    const blue = new THREE.PointLight(0x5ab8ff, 4, 8, 1.6);
    blue.position.set(-3, 2, -1);
    scene.add(blue);

    // placeholder characters (toon primitives)
    const mk = (x, col) => {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.6, 6), toon(col));
      body.position.y = 0.75; body.castShadow = true;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.4), toon('#f2c9a0'));
      head.position.y = 1.28; head.castShadow = true;
      grp.add(body, head);
      grp.position.set(x, 0.42, 0.6);
      scene.add(grp);
      return grp;
    };
    this.chars = [mk(-1.6, '#b0503a'), mk(1.6, '#4a6ad0'), mk(-0.6, '#6a8a3a'), mk(0.7, '#d0a03a')];

    this.sparks = new ParticleSystem(800, { additive: true });
    scene.add(this.sparks.object);
    this.dust = new ParticleSystem(400);
    scene.add(this.dust.object);
    this.time = 0;
  }
  update(dt) {
    this.fire.tick(this.time);
    this.rig.aim([Math.sin(this.time * 0.15) * 2.5, 2.2, 6.5], [0, 0.8, 0]);
    this.rig.update(dt);
    if (Math.random() < 0.6) this.sparks.emit({ pos: [0, 0.6, 0.5], posSpread: 0.15, vel: [0, 1.4, 0], spread: 0.35, life: [0.6, 1.4], size: 1, color: ['#ffd27a', '#ff8a3a', '#fff0b0'], colorEnd: '#ff3a1a', glow: 3, drag: 0.6, flicker: 0.3 });
    if (Math.random() < 0.3) this.dust.emit({ pos: [0, 1.5, 0], posSpread: [4, 1.2, 2], vel: [0.05, 0.02, 0], spread: 0.04, life: [3, 6], size: 1, color: '#c8b8a0', alpha: 0.5, fadeIn: 1 });
    this.sparks.update(dt);
    this.dust.update(dt);
    this.chars.forEach((c, i) => { c.children[1].rotation.y = Math.sin(this.time * 1.3 + i) * 0.3; });
  }
  draw(ui) {
    ui.panel('leather', 8, 8, 150, 90);
    ui.text('FORGLITE {fire}test{/} bench', 18, 18, { outline: '#140c10' });
    ui.text('The quick brown fox jumps', 18, 32);
    ui.text('over the lazy dog 0123456789', 18, 43);
    ui.text('SMALL FONT: +8 CHIPS ×2 MULT', 18, 58, { font: 'small', color: '#f4ecd8' });
    ui.text('{chips}+12 Chips{/}  {mult}×1.5 Mult{/} {@coin}', 18, 70);
    ui.panel('wood', 166, 8, 120, 50);
    ui.panel('iron', 294, 8, 120, 50);
    ui.panel('parchment', 422, 8, 130, 80, { lines: true });
    ui.text('Recipe: Fangblade', 432, 20, { color: '#4a3220' });
    ui.panel('stone', 166, 64, 120, 34);
    ui.panel('dark', 294, 64, 120, 34);
    ui.panel('gold', 560, 8, 70, 90);
    ui.big('FORGLITE', ui.w / 2, 130, { scale: 3 });
    if (ui.button('b1', 20, 110, 80, 20, 'Descend', { style: 'wood' })) ui.toast('Clicked descend', { icon: 'pickaxe' });
    ui.button('b2', 110, 110, 80, 20, 'Forge!', { style: 'gold', icon: 'hammer' });
    ui.button('b3', 200, 110, 70, 20, 'Flee', { style: 'red', tip: { title: 'Flee', body: 'Run away! Costs {red}5 HP{/} on fail.' } });
    ui.button('b4', 280, 110, 70, 20, 'Back', { style: 'stone' });
    ui.button('b5', 360, 110, 70, 20, 'Locked', { style: 'iron', disabled: true });
    const names = iconNames();
    names.forEach((n, i) => ui.icon(n, 10 + (i % 30) * 15, 230 + Math.floor(i / 30) * 14));
    ui.keycap('SPACE', 10, 290); ui.keycap('E', 50, 290); ui.keycap('SHIFT', 70, 290);
    ui.text(`fps ${this.game.fps.toFixed(0)}  ${ui.w}x${ui.h} @${this.game.renderer.scale}x`, 10, ui.h - 14, { font: 'small', color: '#9d8f7d' });
  }
}
