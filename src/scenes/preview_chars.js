// Preview bench for characters & forged weapons (tools/preview/chars.entry.js).
import * as THREE from 'three';
import { Scene } from '../core/game.js';
import { CameraRig, FlickerLight } from '../gfx/camera.js';
import { buildCharacter } from '../models/characters.js';
import { buildWeaponMesh, crackWeapon } from '../models/weapons3d.js';
import { toon } from '../gfx/materials.js';

export class CharPreview extends Scene {
  enter() {
    const q = new URLSearchParams(location.search);
    this.q = q;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0a10);
    scene.fog = new THREE.FogExp2(0x0d0a10, 0.05);
    this.rig = new CameraRig(34);
    this.world = { scene, camera: this.rig.camera, post: {} };
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 10), toon('#3e322a'));
    floor.position.y = -0.1; floor.receiveShadow = true; scene.add(floor);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 0.5), toon('#2e2622'));
    wall.position.set(0, 3, -3); wall.receiveShadow = true; scene.add(wall);
    const fire = new FlickerLight(0xffa050, 9, 12, { amount: 0.15 });
    fire.position.set(0.5, 1.4, 2.2); fire.castShadow = true; fire.shadow.mapSize.set(1024, 1024);
    scene.add(fire); this.fire = fire;
    scene.add(new THREE.HemisphereLight(0x8a8ab0, 0x2a1a14, 0.55));
    const rim = new THREE.PointLight(0x6a9aff, 4, 8, 1.6); rim.position.set(-2.5, 2.2, -1.5); scene.add(rim);
    const ids = ['bran', 'elio', 'durgan', 'clover'];
    const only = q.get('only');
    this.chars = ids.filter((id) => !only || only.includes(id)).map((id) => {
      const i = ids.indexOf(id);
      const t0 = performance.now();
      const c = buildCharacter(id);
      console.log(`build ${id} ${(performance.now() - t0).toFixed(1)}ms`);
      c.group.position.set(-1.95 + i * 1.3, 0, 0);
      scene.add(c.group);
      if (q.get('seated')) c.setSeated(true, 0.3);
      c.play(q.get('anim') || 'idle', { then: q.get('anim') });
      if (q.get('anim2')) c.loopAnim = q.get('anim2');
      if (q.get('expr')) c.setExpression(q.get('expr'), { hold: 999 });
      if (q.get('rot')) c.group.rotation.y = +q.get('rot');
      return c;
    });
    if (q.get('exprs')) { // expression sheet: one explorer, every face in a row
      this.chars.forEach((c) => c.setVisible(false));
      const id = only || 'bran', EX = ['neutral', 'happy', 'angry', 'surprised', 'sad', 'smug', 'determined', 'hurt', 'sleepy'];
      const ex = EX.map((e, i) => {
        const c = buildCharacter(id);
        c.group.position.set((i - 4) * 0.3, 0, 0);
        scene.add(c.group);
        c.play('idle'); c.setExpression(e, { hold: 999 });
        c.showBackItem(false);
        return c;
      });
      this.chars = ex;
      const h = { bran: 1.53, elio: 1.21, durgan: 0.9, clover: 1.12 }[id];
      this.rig.cut([0, h + 0.03, 4.4], [0, h - 0.02, 0], 34);
    }
    if (q.get('hold')) {
      const bps = ['sword', 'staff', 'axe', 'dagger'];
      this.chars.forEach((c, i) => { c.hold(buildWeaponMesh({ bp: bps[i], ids: ['iron', 'coal', 'ruby'], el: { fire: 2 }, grade: 3 })); c.showBackItem(false); });
    }
    if (q.get('weapons')) {
      this.chars.forEach((c) => c.setVisible(false));
      const list = [
        { bp: 'dagger', ids: ['silver', 'spider_silk', 'spider_silk'], el: { holy: 2 }, grade: 2 },
        { bp: 'sword', ids: ['iron', 'coal', 'ruby', 'bat_fang'], el: { fire: 2 }, grade: 4 },
        { bp: 'axe', ids: ['junk', 'junk', 'junk', 'junk'], el: { bleed: 1 }, grade: 1 },
        { bp: 'hammer', ids: ['golem_core', 'iron', 'iron', 'coal'], el: {}, grade: 3 },
        { bp: 'spear', ids: ['storm', 'copper', 'copper', 'topaz'], el: { shock: 4 }, grade: 2 },
        { bp: 'staff', ids: ['ember', 'rime', 'storm', 'quartz'], el: { fire: 6, ice: 6, shock: 6 }, grade: 2 },
        { bp: 'sword', ids: ['amethyst', 'quartz', 'rime'], el: { ice: 2 }, grade: 2 },
        { bp: 'pickaxe', ids: ['iron', 'lodestone'], el: {}, grade: 2 },
        { bp: 'sword', ids: ['cursedore', 'skull'], el: { curse: 2 }, grade: 2, crack: 0.8 },
      ];
      this.weapons = list.map((w, i) => {
        const m = buildWeaponMesh(w);
        m.position.set(-2.6 + i * 0.65, 0.45, 0.5);
        if (w.crack) crackWeapon(m, w.crack);
        scene.add(m);
        return m;
      });
    }
    const cam = q.get('cam') || (q.get('exprs') ? 'none' : 'wide');
    const [cid, cmode] = cam.split('_');
    const idx = ids.indexOf(cid);
    const HEAD = { bran: 1.53, elio: 1.21, durgan: 0.9, clover: 1.12 };
    if (idx >= 0 && cmode === 'body') { const x = -1.95 + idx * 1.3; const h = HEAD[cid] * 0.55; this.rig.cut([x + 0.4, h + 0.25, 2.6], [x, h, 0], 34); }
    else if (idx >= 0) { const x = -1.95 + idx * 1.3; const h = HEAD[cid]; this.rig.cut([x, h + 0.04, 1.05], [x, h, 0], 24); }
    else if (cam === 'faces') this.rig.cut([0, 1.0, 3.2], [0, 0.95, 0], 34);
    else if (q.get('weapons')) this.rig.cut([0, 0.75, 3.4], [0, 0.72, 0], 40);
    else if (cam === 'wide') this.rig.cut([0, 1.1, 6.2], [0, 0.85, 0], 34);
    this.ff = +(q.get('t') || 0);
  }
  update(dt) {
    if (this.ff > 0) { const n = Math.ceil(this.ff / 0.016); for (let i = 0; i < n; i++) this.chars.forEach((c) => c.update(0.016)); this.ff = 0; }
    this.fire.tick(this.time);
    if (this.q.get('walk')) this.chars.forEach((c, i) => { c.group.position.x += dt * 0.8; if (c.group.position.x > 3) c.group.position.x -= 5.6; });
    if (!this.q.get('freeze')) this.chars.forEach((c) => c.update(dt));
    if (this.weapons) this.weapons.forEach((w, i) => { w.rotation.y = this.time * 0.6 + i; });
    this.rig.update(dt);
  }
  draw(ui) {
    ui.text(`anim=${this.q.get('anim') || 'idle'}  fps ${this.game.fps.toFixed(0)}`, 6, 6, { font: 'small', color: '#9d8f7d' });
  }
}
